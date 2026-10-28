"""Heizung: lernende Regelung und Zusatz-Heizkörper (Stufen) (BSM-023)."""

from __future__ import annotations

from datetime import datetime, timedelta
from typing import TYPE_CHECKING, Any

from homeassistant.const import STATE_ON
from homeassistant.util import dt as dt_util

from ...const import TYP_OELRADIATOR, ROLLE_HEIZKOERPER
from ...logik import groesse, lernen, stufen
from ...logik.arbeitszeit import Plan, WarmAb
from ...logik.regelung import Soll, SollGrund
from ...logik.zaehlen import rate
from ..basis import zeit
from .typen import LERN_GRUENDE

if TYPE_CHECKING:
    from . import Heizung
    from ...steuerung import BereichInfo, WetterWerte
    from collections.abc import Mapping


def _stufen_rechnen(hz: Heizung, bid: str, soll: Soll, temp: float | None, soll_t: float, wetter: WetterWerte, jetzt: datetime,
                    plan: Plan | None, minute: int, warm: WarmAb | None = None) -> None:
    """Je Auswertung: darf der Zusatz laufen? Merkt, seit wann der Hauptheizkörper durchgehend zieht."""
    if not hz.stufen_an(bid):
        hz._stufen.pop(bid, None)
        hz._haupt_lauf.pop(bid, None)
        return
    haupt, _ = hz.haupt_und_zusatz(bid)
    zieht = any(hz._zieht_strom(g) for g in hz.heizer_von(bid) if g.id in haupt)
    if zieht and bid not in hz._haupt_lauf:
        hz._haupt_lauf[bid] = (jetzt, temp)
    elif not zieht:
        hz._haupt_lauf.pop(bid, None)
    seit, temp0 = hz._haupt_lauf.get(bid, (jetzt, temp))
    vorher, grund_vorher = hz._stufen.get(bid, (False, None))
    im_vorheizen = plan is not None and plan.vor <= minute < plan.a and warm is not None and warm.aufheiz_min is not None
    gelernt = im_vorheizen and bool(hz._zusatz_gelernt.get(bid))
    h = hz.st.e["heizung"]
    # Ziel nach Grund: beim Absenken das Absenk-Ziel, beim Frostschutz „aus über“, sonst das Soll (Szenario-Befund)
    ziel = (float(h.get("absenk") or 10.0) if soll.grund == SollGrund.ABSENKEN
            else (float(h["frost_aus"]) if h.get("frost_aus") is not None and float(h["frost_aus"]) > float(h["frost_grenze"])
                  else float(h["frost_grenze"]) + 2.0) if soll.grund == SollGrund.FROST
            else soll_t)
    lage = stufen.StufenLage(
        innen=temp, soll=ziel, aussen=wetter.aussen, toleranz=float(h["toleranz"]), einer_reicht=im_vorheizen and not gelernt,
        haupt_min=(jetzt - seit).total_seconds() / 60, anstieg=(temp - temp0) if temp is not None and temp0 is not None else 0.0,
        boost=soll.grund == SollGrund.BOOST, gelernt=gelernt, zusatz_an=vorher, grund_vorher=grund_vorher,
    )
    an, grund = stufen.zusatz(hz.stufen_regeln(), lage) if soll.ein else (False, None)
    if an != vorher and soll.ein:
        hz.st.protokoll("schalten", bid, f"Zusatz-Heizkörper dazu – {stufen.TEXT.get(grund or '', '')}" if an else "Zusatz-Heizkörper wieder aus – einer reicht")
    hz._stufen[bid] = (an, grund)


def stufen_anzeige(hz: Heizung, bid: str) -> dict[str, Any] | None:
    """Zusatz-Heizkörper für die Seite (laufzeit.container.<id>.stufen); None ohne zwei Heizkörper. `auto`: wer ohne
    gewählten Primärheizkörper primär wäre (AN-0015)."""
    if len(hz.heizer_von(bid)) < 2:
        return None
    haupt, zusatz = hz.haupt_und_zusatz(bid)
    an, grund = hz._stufen.get(bid, (False, None))
    return {"an": hz.stufen_an(bid), "haupt": haupt, "zusatz": zusatz, "zusatz_an": an, "grund": grund,
            "auto": hz.haupt_und_zusatz(bid, mit_wahl=False)[0],   # AN-0015: „automatisch“ im Container-Dialog
            "text": stufen.TEXT.get(grund or "", "") if an else ""}


def _lern_art(hz: Heizung, bid: str) -> str:
    """„oel“, wenn ein Ölradiator heizt (sonst: wenn einer da ist), sonst „konvektor“."""
    heizer = [g for g in hz.st.geraete_in(bid) if g.rolle == ROLLE_HEIZKOERPER]
    basis = [g for g in heizer if hz._zieht_strom(g)] or heizer
    return "oel" if any(g.typ == TYP_OELRADIATOR for g in basis) else "konvektor"


def _tpi(hz: Heizung, info: BereichInfo, e: Mapping[str, Any], temp: float | None, soll_t: float, wetter: WetterWerte,
         jetzt: datetime) -> lernen.Tpi | None:
    """TPI mit gelerntem Nachlauf – nur mit Fühler und eingeschalteter lernender Regelung."""
    if not e.get("lernen") or temp is None or hz.modus(info.id) not in ("thermo", "bedarf"):   # Zeitplan regelt nicht selbst
        hz.tpi_jetzt.pop(info.id, None)
        return None
    stand = {**lernen.neuer_stand(), **hz.lern_staende.get(info.id, {})}
    log = [(ta, zeit(b)) for a, b in stand["ein"] if (ta := zeit(a)) is not None]
    kl = lernen.klasse(lernen.ein_minuten(log, jetzt))
    nachlauf = lernen.nachlauf_erwartet(stand["nachlauf"], hz._lern_art(info.id), kl, lernen.band(wetter.aussen))
    # je Container versetzt, damit nicht alle zur selben Minute einschalten
    t = lernen.Tpi(kint=float(stand["kint"]), kext=float(stand["kext"]), nachlauf=nachlauf, aussen=wetter.aussen,
                   minute_im_zyklus=lernen.zyklus_minute(jetzt, info.nr))
    hz.tpi_jetzt[info.id] = (lernen.tpi_anteil(temp, soll_t, t), nachlauf)
    return t


def _tuer_vermuten(hz: Heizung, jetzt: datetime, wetter: WetterWerte) -> None:
    """Einmal je Minute, für jeden Container mit Fühler (FE-0025, auch ohne Lernen): kühlt der Raum beim Heizen ab,
    obwohl es draußen kaum kälter wird, ist eine Tür oder ein Fenster vermutlich offen – die Heizung pausiert dann
    `lernen.VERMUTET_PAUSE_MIN` Minuten (plan.py) und versucht es danach neu. Von Hand geschaltet: keine Vermutung."""
    for info in hz.bereiche():
        heizer = [g for g in hz.st.geraete_in(info.id) if g.rolle == ROLLE_HEIZKOERPER]
        if not info.fuehler or not heizer or any(g.id in hz.st.lz["hand"] for g in heizer):
            hz._tuer_verlauf.pop(info.id, None)
            hz._vermutet.pop(info.id, None)
            hz._vermutet_bis.pop(info.id, None)   # von Hand geschaltet: auch keine laufende Pause
            continue
        verlauf = hz._tuer_verlauf.get(info.id, [])
        if verlauf and zeit(verlauf[-1][0]) == jetzt.replace(second=0, microsecond=0):
            continue   # diese Minute schon gesehen
        an = any((z := hz.st.hass.states.get(g.schalter)) is not None and z.state == STATE_ON for g in heizer)
        verlauf = lernen.tuer_verlauf(verlauf, jetzt=jetzt.replace(second=0, microsecond=0), innen=hz.st.temperatur(info.fuehler),
                                      aussen=wetter.aussen, heizt=any(hz._zieht_strom(g) for g in heizer), an=an)
        hz._tuer_verlauf[info.id] = verlauf
        vorher, vermutet = hz._vermutet.get(info.id, False), lernen.tuer_vermutet(verlauf, jetzt.replace(second=0, microsecond=0))
        hz._vermutet[info.id] = vermutet
        if vermutet and not vorher and hz.st.kontakt_offen_seit(info.id) is None:
            hz._vermutet_bis[info.id] = jetzt + timedelta(minutes=lernen.VERMUTET_PAUSE_MIN)
            hz.st.protokoll("warnung", info.id, "Tür vermutlich offen – der Raum kühlt beim Heizen ab, Heizung "
                                                f"pausiert {lernen.VERMUTET_PAUSE_MIN} min")


def _lernen(hz: Heizung, jetzt: datetime, wetter: WetterWerte) -> None:
    """Einmal je Minute: Ein-Zeiten, Nachlauf nach dem Ausschalten und K-Werte fortschreiben."""
    minute = int(jetzt.timestamp() // 60)
    for info in hz.bereiche():
        e = hz.st.einstellungen.bereich(info.id)
        if not e.get("lernen") or not info.fuehler or hz._lern_minute.get(info.id) == minute or hz.modus(info.id) not in ("thermo", "bedarf"):
            continue
        hz._lern_minute[info.id] = minute
        heizer = [g for g in hz.st.geraete_in(info.id) if g.rolle == ROLLE_HEIZKOERPER]
        regelt = (info.id in hz.tpi_jetzt and hz._lern_grund.get(info.id) in LERN_GRUENDE
                  and not any(g.id in hz.st.lz["hand"] for g in heizer))
        grund_jetzt = hz._lern_grund.get(info.id)
        if any(hz._zieht_strom(g) for g in heizer):   # Grund, der das Heizen bis zuletzt hielt (Minute davor:
            # endet Schnell aufheizen, schaltet dieselbe Auswertung aus – dann steht schon der neue Grund da)
            hz._grund_beim_heizen[info.id] = hz._grund_letzte_minute.get(info.id, grund_jetzt)
        hz._grund_letzte_minute[info.id] = grund_jetzt
        alt = hz.lern_staende.get(info.id) or lernen.neuer_stand()
        neu = lernen.takt(
            alt, jetzt=jetzt, heizt=any(hz._zieht_strom(g) for g in heizer), anzahl=sum(1 for g in heizer if hz._zieht_strom(g)),
            tuer_offen=hz._tuer_offen(info.id), innen=hz.st.temperatur(info.fuehler),
            hand=any(g.id in hz.st.lz["hand"] for g in heizer),
            kint_ok=hz._grund_beim_heizen.get(info.id) != SollGrund.BOOST,   # Grund der letzten Heizminute
            soll=hz.soll_temperatur(info.id), aussen=wetter.aussen, art=hz._lern_art(info.id), regelt=regelt,
            an=any((z := hz.st.hass.states.get(g.schalter)) is not None and z.state == STATE_ON for g in heizer),
            # FE-0025: erkannt in _tuer_vermuten (Warnung steht dort); während der Pause bleibt die Vermutung stehen
            vermutet=hz._vermutet.get(info.id, False) or ((bis := hz._vermutet_bis.get(info.id)) is not None and jetzt < bis),
        )
        vorher, jetzt_offen = (alt.get("offen") or {}).get("art"), (neu.get("offen") or {}).get("art")
        if vorher == "vermutet" and jetzt_offen is None:   # WU-0009
            hz.st.protokoll("ok", info.id, "Raum wird wieder wärmer – die lernende Regelung lernt weiter")
        if neu != alt:
            hz.lern_staende[info.id] = neu
            hz.st.einstellungen.speichern()


def lern_anzeige(hz: Heizung, bid: str) -> dict[str, Any] | None:
    """Lernstand für die Seite (api: laufzeit.container.<id>.lernen); None ohne Fühler."""
    info = hz.st.bereiche.get(bid)
    if info is None or not info.fuehler:
        return None
    anteil, nachlauf = hz.tpi_jetzt.get(bid, (None, 0.0))
    soll_t = hz.soll_temperatur(bid)
    return {
        "an": bool(hz.st.einstellungen.bereich(bid).get("lernen")),
        **lernen.anzeige(hz.lern_staende.get(bid) or {}),
        "anteil": round(anteil * 100) if anteil is not None else None,
        "erwartet": round(nachlauf, 2), "aus_bei": round(soll_t - nachlauf, 2), "zyklus_min": lernen.ZYKLUS_MIN,
        "warm": hz.warm_anzeige(bid),
    }


def warm_anzeige(hz: Heizung, bid: str) -> dict[str, Any] | None:
    """„Warm ab“ von heute für die Seite (AN-0004); None, wenn der Container nicht lernend im Thermostat regelt."""
    jetzt = dt_util.now()
    warm = hz.warm_ab(bid, jetzt.date(), jetzt)
    if warm is None:
        return None
    e = hz.st.einstellungen.bereich(bid)
    plan = hz.plan(jetzt.date(), bool(e["trocknen"]), warm)
    info = hz.st.bereiche[bid]
    stand = hz.lern_staende.get(bid) or {}
    bd = lernen.band(hz.st.daten.wetter.aussen)
    anzahl = 1 if hz.stufen_an(bid) and not hz._zusatz_gelernt.get(bid) else (len(hz.heizer_von(bid)) or 1)
    rate = (stand.get("aufheizen") or {}).get(lernen.auf_schluessel(bd, anzahl))
    return {
        "gelernt": warm.aufheiz_min is not None and not hz._geschaetzt.get(bid), "band": bd,
        "geschaetzt": groesse.rate_geschaetzt(e.get("groesse_m2")) if hz._geschaetzt.get(bid) else None, "rate": rate[0] if rate else None, "n": int(rate[1]) if rate else 0,
        "n_noetig": lernen.AUF_N, "vor": warm.vor_min, "nach": warm.nach_min, "max": warm.max_min,
        "vor_eigen": e.get("warm_vor") is not None, "nach_eigen": e.get("warm_nach") is not None,
        "aufheiz_min": warm.aufheiz_min, "innen": hz.st.temperatur(info.fuehler), "soll": hz.soll_temperatur(bid),
        "fest": bool(hz.st.lz.get("warm_start", {}).get(bid)), "anzahl": anzahl,
        "plan": None if plan is None else {"start": plan.vor, "ziel": plan.a - warm.vor_min, "a": plan.a, "b": plan.b,
                                           "ende": plan.nach, "begrenzt": warm.aufheiz_min is not None and warm.vor_min + warm.aufheiz_min > max(warm.max_min, warm.vor_min)},
    }
