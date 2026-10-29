"""Heizung: Heizplan, Termine, Warm ab, Soll je Minute (BSM-023)."""

from __future__ import annotations

from dataclasses import replace
from datetime import date, datetime, timedelta
from typing import TYPE_CHECKING, Any

from homeassistant.const import STATE_ON

from ...const import ROLLE_HEIZKOERPER
from ...logik import bedarf as bedarf_logik, start as start_logik
from ...logik.arbeitszeit import Plan, WarmAb, ausnahme_am, frei_gilt, bedarf_fenster, im_fenster, tagesplan
from ...logik.regelung import FUEHLER_HALTEN_MIN, LageContainer, Soll, SollGrund, letzter_wert, soll_container
from ...logik.regelung import zu_warm as regel_zu_warm
from ..basis import ev_zeit, minuten_seit, zeit

from . import baseline as h_baseline, start as h_start

if TYPE_CHECKING:
    from . import Heizung
    from ...steuerung import BereichInfo, WetterWerte
    from ..basis import SollJeBereich


def aufraeumen(hz: Heizung, jetzt: datetime) -> bool:
    st, lz = hz.st, hz.st.lz
    hz._plan_cache.clear()
    geaendert = False
    for art in ("bedarf_bis", "boost_bis"):
        for bid, bis in list(lz[art].items()):
            ende = zeit(bis)
            if ende is None or ende <= jetzt or bid not in st.bereiche:
                del lz[art][bid]
                geaendert = True
                if art == "bedarf_bis" and bid in st.bereiche and ende is not None:
                    st.protokoll("schalten", bid, "Bedarf vorbei – heizt wieder nur bei Bedarf")
    if lz.get("jetzt_bis") and hz.jetzt_bis(jetzt) is None:
        lz["jetzt_bis"] = None
        geaendert = True
        st.protokoll("schalten", None, "„Alle jetzt heizen“ beendet")
    if h_start.verlauf_aufraeumen(hz):   # FE-0031/32: Verlauf nur für lernende Container
        geaendert = True
    for gid in [g for g in lz["hand"] if g not in st.geraete]:
        del lz["hand"][gid]
        geaendert = True
    grenze = (jetzt.date() - timedelta(days=1)).isoformat()
    for iso in [k for k in lz.get("frueher", {}) if k < grenze]:
        del lz["frueher"][iso]
    return geaendert


def termin_fenster(hz: Heizung, bid: str) -> list[tuple[datetime, datetime, bool]]:
    """Termine eines Bedarfs-Containers als (von, bis, boost)."""
    return [
        (von, bis, bool(t.get("boost")))
        for t in hz.termine
        if t["bereich"] == bid and (von := zeit(t["von"])) is not None and (bis := zeit(t["bis"])) is not None
    ]


async def async_kalender(hz: Heizung, start: datetime, ende: datetime) -> None:
    """Termine der Bedarfs-Container aus `termine_kalender` (Serien löst der Kalender auf)."""
    st = hz.st
    kalender = st.e.get("termine_kalender")
    events = await st.async_events(kalender, start, ende)
    details = await st.async_event_details(kalender, start, ende) if events else {}
    bedarf = [b for b in hz.bereiche() if st.einstellungen.bereich(b.id).get("bedarf")]
    termine: list[dict[str, Any]] = []
    for ev in events:
        von, bis = ev_zeit(ev.get("start")), ev_zeit(ev.get("end"))
        if von is None or bis is None:
            continue
        bid = _termin_bereich(ev, bedarf)
        if bid is None:
            continue
        uid, rrule = details.get((von.isoformat(), str(ev.get("summary") or "")), ("", None))
        termine.append({
            "bereich": bid, "von": von.isoformat(), "bis": bis.isoformat(),
            "titel": str(ev.get("summary") or ""), "uid": uid, "rrule": rrule,
            "wiederholung": _wiederholung(rrule), "boost": "boost" in str(ev.get("description") or "").lower(),
        })
    hz.termine = sorted(termine, key=lambda t: t["von"])


def plan(hz: Heizung, tag: date, trocknen: bool, warm: WarmAb | None = None) -> Plan | None:
    """Heizplan eines Tages (logik/arbeitszeit.tagesplan), dazu „Noch früher“ aus der Nachricht.

    Je Auswertung zwischengespeichert (sie läuft bei jeder Zustandsänderung, z. B. jedem Leistungswert).
    `warm`: lernender Container mit „Warm ab“ (AN-0004, `warm_ab`).
    """
    if (tag, trocknen, warm) in hz._plan_cache:
        return hz._plan_cache[(tag, trocknen, warm)]
    st = hz.st
    p = tagesplan(
        tag, st.arbeitszeiten(), st.ausnahmen(), hz.heiz_regeln(), st.wetter_tag_plan(tag), trocknen,
        frei=hz.ist_frei(tag), warm=warm,
    )
    extra = int(st.lz.get("frueher", {}).get(tag.isoformat()) or 0)
    if p is not None and extra:
        p = replace(p, start=max(0, p.start - extra), frueher=(*p.frueher, ("noch_frueher", extra)))
    hz._plan_cache[(tag, trocknen, warm)] = p
    return p


def warm_ab(hz: Heizung, bid: str, tag: date, jetzt: datetime) -> WarmAb | None:
    """„Warm ab“ eines lernenden Containers im Modus Thermostat; None für alle anderen.

    Die Aufheizzeit kommt aus der Start-Logik (FE-0031/FE-0032, `logik/start.py`: Auskühlen bis zum Start mit der
    Vorhersage, dann Aufheizen mit der gelernten Rate) als Ziel − Start – so beginnt der Plan genau zum gerechneten
    Start, und „aus bis …“, Plan-Chip und Dialog zeigen dieselbe Uhrzeit. Hat der Container heute schon zu heizen
    begonnen, bleibt sie für den Tag fest (Store `warm_start`) – sonst rutschte der Beginn mit dem Aufheizen wieder nach
    hinten. Andere Tage der Woche (`plan_woche`) bekommen dieselbe Aufheizzeit wie der nächste Start.
    """
    if not h_start.lernend_thermo(hz, bid):
        return None
    heute = jetzt.date()
    f = h_start.fest(hz, bid)
    s = h_start.start(hz, bid, jetzt)
    auf: int | None = None
    if f is not None and f.get("tag") == tag.isoformat() and f.get("aufheiz_min") is not None:
        auf = int(f["aufheiz_min"])
    elif s is not None:
        auf = s.plan_aufheiz_min
    if tag == heute:   # Merker der Regelung von heute (Zusatz gelernt, geschätzt) – nie aus dem Start eines anderen Tages
        if f is not None and f.get("tag") == heute.isoformat():
            hz._zusatz_gelernt[bid], hz._geschaetzt[bid] = bool(f.get("zusatz")), bool(f.get("geschaetzt"))
        elif s is not None and s.tag == heute:
            hz._zusatz_gelernt[bid], hz._geschaetzt[bid] = s.zusatz, s.rate_geschaetzt
        else:
            hz._zusatz_gelernt[bid], hz._geschaetzt[bid] = False, False
    return h_start.warm_einst(hz, bid, auf)


def _warm_festhalten(hz: Heizung, bid: str, warm: WarmAb | None, plan: Plan | None, jetzt: datetime) -> None:
    """Ab dem Start bis Arbeitsbeginn die Aufheizzeit des Tages festhalten (im Store, übersteht Neustarts); `jetzt` =
    Zeit der Auswertung."""
    heute, minute = jetzt.date(), jetzt.hour * 60 + jetzt.minute
    fest = hz.st.lz.setdefault("warm_start", {})
    alt = h_start.fest(hz, bid)
    if alt is not None and alt.get("tag") != heute.isoformat():
        del fest[bid]
    elif alt is not None and alt.get("beginn") is None and plan is not None:
        # bis 0.8.156 ohne Beginn gespeichert: der Plan von heute beginnt mit der festgehaltenen Aufheizzeit dort
        fest[bid] = {**alt, "beginn": plan.start}
        hz._start_runde += 1
        hz.st.einstellungen.speichern()
    if warm is None or warm.aufheiz_min is None or plan is None or bid in fest:
        return
    if plan.start <= minute < plan.a:   # Beginn laut Plan (mit „früher“), Regel in logik/start.fest_beginn
        h_start.festhalten(hz, bid, warm, plan, start_logik.fest_beginn(plan.start, minute), jetzt)


def zu_warm(hz: Heizung, wetter: WetterWerte) -> bool:
    """Heizgrenze überschritten (Tageshöchstwert oder Wert von jetzt, Einstellung `heizgrenze_basis`)."""
    h = hz.st.e["heizung"]
    return regel_zu_warm(str(h["heizgrenze_basis"]), wetter.aussen_max, wetter.aussen, float(h["heizgrenze"]))


def soll(hz: Heizung, jetzt: datetime, wetter: WetterWerte) -> SollJeBereich:
    st = hz.st
    hass = st.hass
    heute, minute = jetzt.date(), jetzt.hour * 60 + jetzt.minute
    h = st.e["heizung"]
    jetzt_bis = hz.jetzt_bis(jetzt)
    if not hz._trotzdem_geladen:   # der Store ist erst nach dem Anlegen der Funktion geladen
        hz.tuer_trotzdem |= set(st.lz.get("tuer_trotzdem") or [])
        hz._trotzdem_geladen = True
    frei_heute = frei_gilt(hz.ist_frei(heute), ausnahme_am(st.ausnahmen(), heute))   # Ausnahme „Arbeit“ geht vor
    zu_warm = hz.zu_warm(wetter)
    ergebnis: dict[str, tuple[Soll, LageContainer]] = {}
    for info in hz.bereiche():
        bid = info.id
        e = st.einstellungen.bereich(bid)
        warm_ab = hz.warm_ab(bid, heute, jetzt)   # nicht `warm` – das ist unten „zu warm“ (Heizgrenze)
        plan = hz.plan(heute, bool(e["trocknen"]), warm_ab)
        hz._warm_festhalten(bid, warm_ab, plan, jetzt)
        hz.plaene[bid] = plan
        hz._warm_vor[bid] = warm_ab.vor_min if warm_ab is not None else 0
        frei, warm = frei_heute, zu_warm
        if jetzt_bis is not None:
            # „alle jetzt heizen“: wie in der Arbeitszeit, auch an freien Tagen und über der Heizgrenze (§5)
            ende = 24 * 60 if jetzt_bis.date() > heute else jetzt_bis.hour * 60 + jetzt_bis.minute
            if plan is None or not plan.heizt(minute):
                plan = Plan(start=minute, vor=minute, a=minute, b=max(minute + 1, ende), nach=max(minute + 1, ende),
                            ende=max(minute + 1, ende))
            frei, warm = False, False
        temp = hz.temperatur_gehalten(bid, info.fuehler, jetzt)   # Fühler kurz weg: letzter Wert (Szenarien)
        if warm_ab is not None:   # FE-0031/32: gemessener Verlauf für die Kurve „So rechnet der Start“
            h_start.verlauf_merken(hz, bid, jetzt, temp, wetter.aussen)
        soll_t = hz.soll_temperatur(bid)
        tuer_min = None
        if (offen_seit := st.kontakt_offen_seit(bid)) is not None:   # BSM-034.03: jede Tür und jedes Fenster
            if bid not in hz.tuer_trotzdem:
                tuer_min = minuten_seit(offen_seit, jetzt)
        else:
            if bid in hz.tuer_trotzdem:
                hz.tuer_trotzdem.discard(bid)
                hz.trotzdem_merken()
            if (bis := hz._vermutet_bis.get(bid)) is not None:   # FE-0025: Tür vermutlich offen – kurz pausieren
                hand = any(g.id in st.lz["hand"] for g in st.geraete_in(bid) if g.rolle == ROLLE_HEIZKOERPER)
                if jetzt < bis and not hand:   # von Hand geschaltet: nur eine Vermutung, die Hand geht vor
                    tuer_min = float(h["tuer_pause_min"])
                else:
                    del hz._vermutet_bis[bid]
        fenster = hz.termin_fenster(bid)
        aktive = [f for f in fenster if im_fenster(bedarf_fenster([(f[0], f[1])], int(h["vorheizen_min"])), jetzt)]
        bedarf_aktiv = hz.bis("bedarf_bis", bid, jetzt) is not None or bool(aktive) or jetzt_bis is not None
        boost = hz.bis("boost_bis", bid, jetzt) is not None or any(f[2] for f in aktive)
        if boost and temp is not None and temp >= soll_t and bid in st.lz["boost_bis"]:
            del st.lz["boost_bis"][bid]  # Soll erreicht: Boost beendet (Aufrufer, Bauplan §2.2)
            st.einstellungen.speichern()
            boost = False
        heizer = [g for g in st.geraete_in(bid) if g.rolle == ROLLE_HEIZKOERPER and g.id not in st.lz["hand"] and st.geraet_aktiv(g)]
        heizt = any((s := hass.states.get(g.schalter)) is not None and s.state == STATE_ON for g in heizer)
        lage = LageContainer(
            minute=minute, plan=plan, automatik=st.automatik, auto=bool(e["auto"]), temperatur=temp, soll=soll_t,
            frost=bool(h["frost"]), frost_grenze=float(h["frost_grenze"]), zu_warm=warm, frei=frei,
            tuer_offen_min=tuer_min, bedarf=bool(e["bedarf"]), bedarf_aktiv=bedarf_aktiv, boost=boost,
            heizt_gerade=heizt, toleranz=float(h["toleranz"]), frost_vorher=hz._frost.get(bid, False),
            modus=hz.modus(bid), frost_aus=None if h.get("frost_aus") is None else float(h["frost_aus"]),
            frei_modus=str(h.get("frei_modus") or "frost"), absenk=float(h.get("absenk") or 10.0),
            frost_immer=bool(h.get("frost_immer")), tpi=hz._tpi(info, e, temp, soll_t, wetter, jetzt),
            aussen=wetter.aussen, frost_aussen=None if h.get("frost_aussen") is None else float(h["frost_aussen"]),
            laeuft_gerade=any((z := hass.states.get(g.schalter)) is not None and z.state == STATE_ON
                              for g in st.geraete_in(bid) if g.rolle == ROLLE_HEIZKOERPER),
            tuer_vorher=hz._tuer_pause.get(bid, False),
            taste=hz.bis("taste_bis", bid, jetzt) is not None,   # BSM-018: Taste am Plug
            baseline=h_baseline.laeuft(hz, bid, jetzt),   # BSM-033.04: Baseline-Lauf
        )
        soll = soll_container(lage, int(h["tuer_pause_min"]))
        hz._lern_grund[bid] = soll.grund
        hz._frost[bid] = soll.grund == SollGrund.FROST
        hz._tuer_pause[bid] = soll.grund == SollGrund.TUER_OFFEN
        hz._stufen_rechnen(bid, soll, temp, soll_t, wetter, jetzt, plan, minute, warm_ab)
        ergebnis[bid] = (soll, lage)
    return ergebnis


def temperatur_gehalten(hz: Heizung, bid: str, fuehler: str | None, jetzt: datetime) -> float | None:
    """Raumtemperatur; meldet der Fühler kurz nichts (Funk, HA-Start), gilt so lange der letzte Wert (Einstellung
    `fuehler_halten_min`, AN-0012; logik/regelung)."""
    if not fuehler:
        return None
    wert = hz.st.temperatur(fuehler)
    zuletzt = hz.st.lz.setdefault("fuehler_zuletzt", {})
    if wert is not None:
        punkte = hz._temp_punkte.setdefault(bid, [])   # für den Trend (Bedarf in °C)
        if not punkte or (jetzt - punkte[-1][0]).total_seconds() >= 30:
            punkte.append((jetzt, wert))
            while punkte and (jetzt - punkte[0][0]).total_seconds() > bedarf_logik.TREND_FENSTER_MIN * 60 + 120:
                punkte.pop(0)
        if not zuletzt.get(bid) or zuletzt[bid][1] != wert:
            zuletzt[bid] = [jetzt.isoformat(timespec="seconds"), wert]
        else:
            zuletzt[bid][0] = jetzt.isoformat(timespec="seconds")
        return wert
    z = zuletzt.get(bid)
    halten = float(hz.st.e["heizung"].get("fuehler_halten_min", FUEHLER_HALTEN_MIN))
    return letzter_wert(None, (t, float(z[1])) if z and (t := zeit(z[0])) else None, jetzt, halten)


def _termin_bereich(ev: dict[str, Any], bedarf: list[BereichInfo]) -> str | None:
    """Container eines Termins: `baustelle:<bid>` in der Beschreibung, sonst der Name im Titel/Ort, sonst der einzige
    Bedarfs-Container (api-0.7 §1 `termine`)."""
    beschreibung = str(ev.get("description") or "")
    for b in bedarf:
        if f"baustelle:{b.id}" in beschreibung:
            return b.id
    for feld in ("location", "summary"):
        text = str(ev.get(feld) or "").lower()
        for b in bedarf:
            if b.name.lower() and b.name.lower() in text:
                return b.id
    return bedarf[0].id if len(bedarf) == 1 else None


def _wiederholung(rrule: str | None) -> str:
    if not rrule:
        return "einmal"
    teile = dict(t.split("=", 1) for t in rrule.split(";") if "=" in t)
    if teile.get("FREQ") == "WEEKLY":
        return "2wochen" if teile.get("INTERVAL") == "2" else "woche"
    return "einmal"
