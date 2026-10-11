"""Heizung: Schattenprognose V2 (BSM-033.09, Bauplan Hochrechnung §8, Lieferung P4a).

Rechnet parallel zur bisherigen Hochrechnung (Legacy, `hochrechnung.py`) und mischt nichts mit ihr: Die Modellwahl
`legacy|v2` geschieht nur hier, das Ergebnis liegt getrennt bei der Heizung (`Heizung.prognose_v2`) und geht über
`baustelle/prognose_v2` (Parameter `prognose`) und als zusätzlicher Schlüssel `prognose_v2` in `baustelle/auswertung`
hinaus. Die Seite bleibt unverändert (Umschaltung erst P6). Es wird nichts geschaltet und kein Zustand der Regelung
verändert – hier wird nur gelesen und zusammengestellt.

- **Schätzungen** (H, Tagesregression, Duty, Gegenmodell je Container für die aktuelle Konfiguration) aus dem
  Evidenzbericht P3 (`prognose_v2.sammeln`/`schaetzungen`, Heizperiode, höchstens `H_TAGE_MAX` Tage, bis gestern) –
  teuer, daher nachts (03:20), beim Start verzögert (`START_VERZOEGERUNG`) und auf Anfrage.
- **Auftrag** (`PrognoseAuftrag`): Plantage ab heute bis zum Ende der Heizperiode aus Einstellungen, Arbeitszeiten,
  Ausnahmen, Terminen; Wetter aus `wetter_stunden`, `wetter_tage` (Tagesmittel), gemessenen Tagesmitteln
  (`tag_bereich`, `aussen_tage`) und Klimamitteln; Preise je Tag; `gemessen_bis` = Ende der gebuchten Minuten von heute;
  Ist = Tagessummen der Heizperiode bis gestern und Stunden von heute; Anfangszustand aus dem Fühler.
- **Rechnen** im Executor (`logik/prognose_modell.rechne`), stündlich (:52) und nach neuen Schätzungen; ein Lauf-Zähler
  verwirft eine ältere, langsamere Rechnung. Ergebnis: Heizperiode, Monate, Wochen, Tage, 24 h je Stunde mit
  Modellversion, Methode, Stufe, Grenzen und Gründen, dazu fertige Anzeigen (`logik/prognose_anzeige`).
"""

from __future__ import annotations

import asyncio
from collections.abc import Callable, Mapping, Sequence
from dataclasses import asdict, replace
from datetime import UTC, date, datetime, time, timedelta
import logging
import time as zeitmessung
from typing import TYPE_CHECKING, Any

from homeassistant.core import HomeAssistant, callback
from homeassistant.helpers.event import async_call_later, async_track_time_change
from homeassistant.util import dt as dt_util

from ...const import ROLLE_HEIZKOERPER
from ...db import DATA_DB
from ...db.prognose import PrognoseRahmen, ist_heute, minuten_bauen, prognose_rohdaten
from ...db.tage import hochrechnung_tage
from ...logik import hochrechnung as h_logik
from ...logik.arbeitszeit import bedarf_fenster
from ...logik.prognose_anzeige import anzeige_aus
from ...logik import preise as preise_logik, soll as soll_logik
from ...logik.prognose_modell import (
    Aggregat,
    ContainerModelle,
    EuroSumme,
    baseline_tage,
    gueltige_modelle,
    ist_stunden,
    ist_tage,
    rechne,
    waehle_mit,
    zeitraeume,
)
from ...logik.prognose_typen import (
    MODELL_VERSION,
    Anfangszustand,
    Intervall,
    IstIntervall,
    Leistungsreferenz,
    PlanTag,
    PreisIntervall,
    PrognoseAuftrag,
    VergleichErgebnis,
    WetterEingabe,
    WetterIntervall,
)
from ...logik.regelung import frost_aus_wert
from . import baseline as h_baseline
from .hochrechnung import zeitraum as heizperiode
from .prognose_v2 import DATA_SPERRE, H_TAGE_MAX, REGELN, sammeln, schaetzungen

if TYPE_CHECKING:
    from ...steuerung import Steuerung
    from . import Heizung

_LOGGER = logging.getLogger(__name__)
STUENDLICH = {"minute": 52, "second": 0}
NAECHTLICH = {"hour": 3, "minute": 20, "second": 0}
START_VERZOEGERUNG = 600   # s nach dem Start: die Schätzungen lesen viel aus der Datenbank
PRUEF_TAGE = 7             # Fenster der Abnahmeprüfung P2b wie die Diagnose (`baustelle/prognose_v2`, Vorgabe 7 Tage)
NEU_AB_STUNDE = 4          # Schätzungen von gestern gelten bis zur Nachtrechnung (03:20); danach neu, falls sie fehlte


# ---------------------------------------------------------------------- Schätzungen (P3) je Container
async def async_modelle(hass: HomeAssistant, hz: Heizung) -> dict[str, ContainerModelle] | None:
    """Schätzungen der aktuellen Konfiguration je Container aus dem Evidenzbericht der Heizperiode (bis gestern)."""
    st = hz.st
    db = hass.data.get(DATA_DB)
    if db is None or not db.bereit:
        return None
    zone = dt_util.get_default_time_zone()
    heute = dt_util.now().date()
    von_tag = max(heizperiode(st, heute)[0], heute - timedelta(days=H_TAGE_MAX))
    bereiche = hz.bereiche()
    rahmen = PrognoseRahmen(st.entry.entry_id, zone, tuple(b.id for b in bereiche), tuple(h_baseline.laeufe(hz)), REGELN)
    # Abnahmeprüfung P2b über dasselbe Fenster wie die Diagnose (7 Tage + Vorlauf), damit beide gleich prüfen
    vorlauf = timedelta(minutes=REGELN.start_pause_min + REGELN.start_vorlauf_min)
    gestern = dt_util.as_utc(datetime.combine(heute - timedelta(days=PRUEF_TAGE), time(), zone) - vorlauf)
    bis = dt_util.as_utc(datetime.combine(heute, time(), zone))
    sperre: asyncio.Lock = hass.data.setdefault(DATA_SPERRE, asyncio.Lock())
    async with sperre:
        roh = await db.async_ausfuehren(lambda v: prognose_rohdaten(v, rahmen, gestern, bis))   # Abnahmeprüfung P2b
        if roh is None:
            return None
        _, pruefungen = await hass.async_add_executor_job(minuten_bauen, roh, rahmen)
        erg = await sammeln(hass, db, rahmen, pruefungen, von_tag, heute)
    if erg is None:
        return None
    sammlung, laeufe, training_bis = erg
    zeitzone = hass.config.time_zone
    aktuell = {b.id: hz.prognose_kontext(b.id) for b in bereiche}
    refs_je = {b.id: [_p_ref(st, g.id) for g in hz.heizer_von(b.id)] for b in bereiche}   # im Event-Loop gelesen

    def waehlen() -> dict[str, ContainerModelle]:
        from .prognose_v2 import Sammlung   # noqa: PLC0415

        aus = {}
        for b, (art, kid) in aktuell.items():
            m = schaetzungen(b, kid, sammlung.get(b, Sammlung()), laeufe, training_bis, zeitzone)
            refs = refs_je[b]
            aus[b] = ContainerModelle(b, waehle_mit(art, m.h, m.h_tage, m.duty, REGELN), m.ohne, None, kid, art,
                                      None if any(r is None for r in refs) else sum(r.kw for r in refs if r is not None))
        return aus
    return await hass.async_add_executor_job(waehlen)


# ---------------------------------------------------------------------- Auftrag (nur lesen)
def _p_ref(st: Steuerung, gid: str) -> Leistungsreferenz | None:
    """Unabhängige Leistungsreferenz: die im Gerät eingestellte Leistung (nicht das gelernte Mittel `nenn_kw()`)."""
    kw = ((st.e.get("geraete") or {}).get(gid) or {}).get("nenn_kw")
    if isinstance(kw, (int, float)) and not isinstance(kw, bool) and kw > 0:
        return Leistungsreferenz(float(kw), "geraet_einstellung", datetime.min.replace(tzinfo=UTC), f"geraete.{gid}.nenn_kw")
    return None


def _zahl_oder_none(x: Any) -> float | None:
    return float(x) if isinstance(x, (int, float)) and not isinstance(x, bool) else None


def _vorhersage(wetter_tage: Mapping[str, Any], tag: date) -> bool:
    """Gibt es für den Tag eine Temperaturvorhersage (Tagesmittel oder Morgen)? Nur Regen zählt nicht."""
    w = wetter_tage.get(tag.isoformat()) or {}
    return _zahl_oder_none(w.get("mittel")) is not None or _zahl_oder_none(w.get("frueh")) is not None


def _frueh(wetter_tage: Mapping[str, Any], tag: date) -> float | None:
    return _zahl_oder_none((wetter_tage.get(tag.isoformat()) or {}).get("frueh"))


def _hoechst(wetter_tage: Mapping[str, Any], tag: date) -> float | None:
    """Bekannter Tageshöchstwert wie in der Regelung (`kern/wetter`): Vorhersage und gemessener Höchstwert."""
    w = wetter_tage.get(tag.isoformat()) or {}
    werte = [x for x in (_zahl_oder_none(w.get("max")), _zahl_oder_none(w.get("max_mess"))) if x is not None]
    return max(werte) if werte else None


def plantage(hz: Heizung, von: date, bis: date) -> tuple[PlanTag, ...]:
    """Rohdaten je Container und Tag [von, bis] – nur Einstellungen gelesen, nichts gerechnet."""
    st = hz.st
    h = st.e["heizung"]
    gleitend = h.get("soll_art") == "gleitend"
    zone = dt_util.get_default_time_zone()
    aus: list[PlanTag] = []
    wetter_tage = st.lz.get("wetter_tage") or {}
    arbeitszeiten, ausnahmen, heizregeln = tuple(st.arbeitszeiten()), tuple(st.ausnahmen()), hz.heiz_regeln()
    gleitregeln, rueck = (hz.gleit_regeln() if gleitend else None), tuple(hz.gefuehl_liste())
    frost_grenze = float(h["frost_grenze"])
    frost_aus = frost_aus_wert(frost_grenze, None if h.get("frost_aus") is None else float(h["frost_aus"]))
    frost_aussen = None if h.get("frost_aussen") is None else float(h["frost_aussen"])
    basis = "tageshoechst" if h["heizgrenze_basis"] == "tageshoechst" else "jetzt"
    for info in hz.bereiche():
        bid = info.id
        e = st.einstellungen.bereich(bid)
        art, kid = hz.prognose_kontext(bid)
        p_ref = tuple(_p_ref(st, g.id) for g in hz.heizer_von(bid))
        termine = tuple(Intervall(dt_util.as_utc(a), dt_util.as_utc(b))
                        for a, b in bedarf_fenster([(f[0], f[1]) for f in hz.termin_fenster(bid)], int(h["vorheizen_min"])))
        eigen = e.get("soll")
        modus = hz.modus(bid)
        tag = von
        while tag <= bis:
            aus.append(PlanTag(
                datum=tag, bereich_id=bid, konfiguration_id=kid, plan=None, arbeitszeiten=arbeitszeiten,
                ausnahmen=ausnahmen, frei=hz.ist_frei(tag), heizregeln=heizregeln, warm_ab=None,
                trocknen=bool(e["trocknen"]), plan_wetter=st.wetter_tag_plan(tag),
                plan_wetterquelle="vorhersage_tag" if _vorhersage(wetter_tage, tag) else "klima",
                heizgrenze_c=float(h["heizgrenze"]), heizgrenze_basis=basis,   # type: ignore[arg-type]
                auto=bool(e["auto"]), bedarfscontainer=bool(e["bedarf"]), regelungsart=art,
                gleitregeln=gleitregeln, rueckmeldungen=rueck,
                absenk_soll_c=float(h.get("absenk") or 10.0), frost_grenze_c=frost_grenze, frost_aus_c=frost_aus,
                frost_aussen_c=frost_aussen, frost_erlaubt=bool(h["frost"]),
                frei_modus=str(h.get("frei_modus") or "frost"),   # type: ignore[arg-type]
                feste_bedarfsfenster=tuple(t for t in termine if t.bis > dt_util.as_utc(datetime.combine(tag, time(), zone))
                                           and t.von < dt_util.as_utc(datetime.combine(tag + timedelta(days=1), time(), zone))),
                p_ref=p_ref, fruehstart_unsicher=bool(h["fruehstart"]) and _frueh(wetter_tage, tag) is None,
                kontext_belegt=True,
                soll_fest_c=None if gleitend else float(eigen if eigen is not None else h["soll"]),
                soll_versatz_k=soll_logik.versatz(eigen, float(h["soll"])) if gleitend else 0.0,
                modus=modus, fuehler=bool(info.fuehler), tuer_pause_min=int(h["tuer_pause_min"]),
                tageshoechst_c=_hoechst(wetter_tage, tag)))
            tag += timedelta(days=1)
    return tuple(aus)


def wetter_eingabe(st: Steuerung, gemessen: Mapping[date, float], heute: date) -> WetterEingabe:
    stunden = []
    for iso, temp in (st.lz.get("wetter_stunden") or {}).items():
        t = dt_util.parse_datetime(iso)
        if t is not None and isinstance(temp, (int, float)):
            u = dt_util.as_utc(t)
            stunden.append(WetterIntervall(Intervall(u, u + timedelta(hours=1)), float(temp), "vorhersage_stunde", False))
    mittel = tuple((date.fromisoformat(iso), float(w["mittel"])) for iso, w in (st.lz.get("wetter_tage") or {}).items()
                   if isinstance(w.get("mittel"), (int, float)) and date.fromisoformat(iso) >= heute)
    roh = st.lz.get("aussen_tage") or {}
    vortage = {date.fromisoformat(t): v[0] / v[1] for t, v in roh.items() if v and v[1] and date.fromisoformat(t) < heute}
    vortage.update({d: t for d, t in gemessen.items() if d < heute})
    klima = h_logik.klimamittel((st.e.get("heizung") or {}).get("klimamittel"))
    return WetterEingabe(tuple(stunden), mittel, klima, tuple(sorted(vortage.items())))


def preise(liste: Sequence[tuple[date, float]], von: date, bis: date) -> tuple[PreisIntervall, ...]:
    """Preis je Tag aus der Preisliste (`st.preise()`, im Event-Loop gelesen) – rein, läuft im Executor."""
    zone = dt_util.get_default_time_zone()
    aus = []
    tag = von
    while tag <= bis:
        aus.append(PreisIntervall(Intervall(dt_util.as_utc(datetime.combine(tag, time(), zone)),
                                            dt_util.as_utc(datetime.combine(tag + timedelta(days=1), time(), zone))),
                                  preise_logik.preis_am(liste, tag)))
        tag += timedelta(days=1)
    return tuple(aus)


# ---------------------------------------------------------------------- Ausgabe
def _z(x: float | None, stellen: int = 3) -> float | None:
    return None if x is None else round(x, stellen)


def _kurz(v: VergleichErgebnis, eur: tuple[EuroSumme, EuroSumme, EuroSumme]) -> dict[str, Any]:
    return {
        "von": v.zeit.von.isoformat(), "bis": v.zeit.bis.isoformat(),
        "mit": [_z(v.mit.mitte_kwh), _z(v.mit.unten_kwh), _z(v.mit.oben_kwh)], "ist": _z(v.mit.ist_belegt_kwh),
        "ohne": [_z(v.ohne.mitte_kwh), _z(v.ohne.unten_kwh), _z(v.ohne.oben_kwh)],
        "gespart": [_z(v.gespart.mitte_kwh), _z(v.gespart.unten_kwh), _z(v.gespart.oben_kwh)],
        "prozent": _z(v.gespart_prozent, 1),
        "eur": {k: [_z(e.mitte, 2), _z(e.unten, 2), _z(e.oben, 2)] for k, e in zip(("mit", "ohne", "gespart"), eur, strict=True)},
        "stufe": {"mit": v.mit.stufe.prognose, "ohne": v.ohne.stufe.prognose, "gespart": v.gespart.stufe.prognose},
        "art": v.mit.mitte_art, "fehlend": list(v.mit.fehlende_bereiche), "vergleichbar": v.vergleichbar,
        "gruende": list(dict.fromkeys((*v.mit.gruende, *v.ohne.gruende, *v.gruende)))}


def _anzeige(v: VergleichErgebnis, eur: tuple[EuroSumme, EuroSumme, EuroSumme], gemessen_bis: datetime,
             jetzt: datetime) -> dict[str, Any]:
    a = anzeige_aus(v, eur, MODELL_VERSION, gemessen_bis, jetzt)

    def wert(w: Any) -> dict[str, Any]:
        d = asdict(w)
        for k in ("wert_kwh", "unten_kwh", "oben_kwh"):
            d[k] = _z(d[k], 2)
        for k in ("eur", "unten_eur", "oben_eur"):
            d[k] = _z(d[k], 2)
        d["hinweise"] = list(d["hinweise"])
        return d
    return {"von": v.zeit.von.isoformat(), "bis": v.zeit.bis.isoformat(), "mit": wert(a.mit), "ohne": wert(a.ohne),
            "gespart": wert(a.gespart), "gespart_prozent": _z(a.gespart_prozent, 1), "vergleichshinweis": a.vergleichshinweis,
            "stufe": {"evidenz": v.mit.stufe.evidenz, "prognose": v.mit.stufe.prognose, "methode": v.mit.stufe.methode,
                      "extrapolation": v.mit.stufe.extrapolation, "gruende": list(v.mit.stufe.gruende)},
            "vergleichbar": v.vergleichbar}


def _modell(m: ContainerModelle | None) -> dict[str, Any] | None:
    if m is None:
        return None
    mit = m.mit
    if hasattr(mit, "h_kw_k"):
        mit_d = {"methode": mit.methode, "h_kw_k": _z(mit.h_kw_k, 5), "unten": _z(mit.h_unten_kw_k, 5),   # type: ignore[union-attr]
                 "oben": _z(mit.h_oben_kw_k, 5)}   # type: ignore[union-attr]
    else:
        mit_d = {"methode": "duty", "duty": _z(mit.duty, 4), "tage": mit.tage}   # type: ignore[union-attr]
    o = m.ohne
    return {"mit": mit_d, "ohne": {"methode": o.methode, "t_max_c": _z(o.t_max_c, 2),
                                   "h_kw_k": _z(o.h.h_kw_k, 5) if o.h is not None else None, "thermostat": o.thermostat_nachweis}}


def ergebnis(agg: Aggregat, raeume: Mapping[str, Sequence[Intervall]], modelle: Mapping[str, ContainerModelle],
             gemessen_bis: datetime, jetzt: datetime, dauer_s: float) -> dict[str, Any]:
    """Zusammenstellen (keine Rechnung): Listen kurz, fertige Anzeigen für Heizperiode und den laufenden Monat/Woche/Tag."""
    index = {i: agg.vergleich(i) for i in range(len(agg.zeitraeume))}
    euro = {i: agg.euro(i, v) for i, v in index.items()}
    pos = 0
    teile: dict[str, list[int]] = {}
    for art, liste in raeume.items():
        teile[art] = list(range(pos, pos + len(liste)))
        pos += len(liste)
    jetzt_utc = dt_util.as_utc(jetzt)

    def laufend(art: str) -> int | None:
        return next((i for i in teile[art] if agg.zeitraeume[i].von <= jetzt_utc < agg.zeitraeume[i].bis), None)
    anzeigen = {art: _anzeige(index[i], euro[i], gemessen_bis, jetzt) for art in ("heizperiode", "monat", "woche", "tag")
                if (i := laufend(art)) is not None}
    hp = index[teile["heizperiode"][0]]
    return {
        "modell_version": MODELL_VERSION, "methode": "stationaer", "modellwahl": "v2", "schatten": True,
        "aktualisiert_am": jetzt.isoformat(), "gemessen_bis": gemessen_bis.isoformat(), "dauer_s": round(dauer_s, 2),
        "laeufe": len(agg.laeufe), "stufe": {"mit": hp.mit.stufe.prognose, "ohne": hp.ohne.stufe.prognose,
                                             "gespart": hp.gespart.stufe.prognose},
        "heizperiode": _kurz(hp, euro[teile["heizperiode"][0]]), "anzeige": anzeigen,
        **{art: [_kurz(index[i], euro[i]) for i in teile[art]] for art in ("monat", "woche", "tag")},
        "stunden": [_kurz(index[i], euro[i]) for i in teile["stunde"]],
        "container": {b: _modell(modelle.get(b)) for b in agg.bereiche},
    }


def zusammenfassung(erg: dict[str, Any] | None) -> dict[str, Any] | None:
    """Für `baustelle/auswertung`: ohne die langen Listen (die liefert `baustelle/prognose_v2`)."""
    if not erg:
        return None
    return {k: v for k, v in erg.items() if k not in ("monat", "woche", "tag", "stunden")}


# ---------------------------------------------------------------------- Ablauf
async def async_rechnen(hass: HomeAssistant, hz: Heizung, *, modelle_neu: bool = False) -> dict[str, Any] | None:
    """Schattenprognose neu rechnen (Lauf-Zähler gegen Wettläufe); None ohne Datenbank oder Heizung."""
    st = hz.st
    db = hass.data.get(DATA_DB)
    if db is None or not db.bereit or not hz.aktiv():
        return None
    hz.prognose_v2_lauf += 1
    lauf = hz.prognose_v2_lauf
    heute = dt_util.now().date()
    jetzt0 = dt_util.now()
    veraltet = hz.prognose_v2_modelle is not None and hz.prognose_v2_modelle[0] < heute and jetzt0.hour >= NEU_AB_STUNDE
    if modelle_neu or hz.prognose_v2_modelle is None or veraltet:   # Nachtrechnung fehlte → beim nächsten Lauf neu
        modelle = await async_modelle(hass, hz)
        if modelle is None:
            return hz.prognose_v2
        hz.prognose_v2_modelle = (heute, modelle)
    beginn_messung = zeitmessung.monotonic()
    # Konfigurationswechsel seit der Schätzung: diese Container fehlen, bis neu geschätzt ist (einmal angestoßen)
    modelle, abweichend = gueltige_modelle(hz.prognose_v2_modelle[1],
                                           {b.id: hz.prognose_kontext(b.id)[1] for b in hz.bereiche()})
    neu_anstossen = bool(abweichend) and not modelle_neu and not hz.prognose_v2_neu_angestossen
    if modelle_neu:
        hz.prognose_v2_neu_angestossen = False
    jetzt = dt_util.now()
    zone = dt_util.get_default_time_zone()
    beginn, ende = heizperiode(st, heute)
    mitternacht = dt_util.as_utc(datetime.combine(heute, time(), zone))
    geraete = {g.id: g.bereich for g in st.geraete.values() if g.rolle == ROLLE_HEIZKOERPER and g.bereich}
    ids = tuple(b.id for b in hz.bereiche())
    roh = await db.async_ausfuehren(lambda v: (hochrechnung_tage(v, st.entry.entry_id, beginn, heute - timedelta(days=1), zone),
                                               ist_heute(v, st.entry.entry_id, geraete, mitternacht)))
    if roh is None or lauf != hz.prognose_v2_lauf:
        return hz.prognose_v2
    tage, (energie, erfasst, gemessen_bis) = roh
    gemessen = {t.datum: t.aussen for liste in tage.values() for t in liste if t.aussen is not None}
    laeufe = list(h_baseline.laeufe(hz))
    zeitzone = hass.config.time_zone
    preisliste = st.preise()
    anfang = {}
    for info in hz.bereiche():
        innen = st.temperatur(info.fuehler) if info.fuehler else None
        anfang[info.id] = Anfangszustand(gemessen_bis, innen, hz._frost.get(info.id), None,
                                         "gemessen" if innen is not None else "unbekannt")
    hp_iv = Intervall(dt_util.as_utc(datetime.combine(beginn, time(), zone)),
                      dt_util.as_utc(datetime.combine(ende + timedelta(days=1), time(), zone)))
    auftrag = PrognoseAuftrag(
        zeitraum=hp_iv, zeitzone=zeitzone, bereich_ids=ids, historische_minuten=(), baseline_laeufe=(),
        plantage=plantage(hz, max(heute, beginn), ende) if heute <= ende else (),
        wetter=wetter_eingabe(st, gemessen, heute), preise=(), gemessen_bis=gemessen_bis,
        anfang_mit=tuple(anfang.items()), anfang_ohne=tuple((b, Anfangszustand(gemessen_bis, None, None, None, "unbekannt"))
                                                            for b in ids))
    raeume = zeitraeume(beginn, ende, heute, zeitzone)
    alle = [iv for liste in raeume.values() for iv in liste]

    def im_executor() -> dict[str, Any]:
        t0 = zeitmessung.monotonic()
        baseline = baseline_tage(laeufe)
        ist: list[IstIntervall] = [
            *ist_tage({b: [(t.datum, t.kwh) for t in tage.get(b, [])] for b in ids}, baseline, zeitzone),
            *ist_stunden(energie, erfasst, ids, mitternacht, gemessen_bis, REGELN,
                         [b for b in ids if heute in baseline.get(b, set())])]
        agg = rechne(replace(auftrag, preise=preise(preisliste, beginn, ende)), modelle, alle, ist, REGELN)
        return ergebnis(agg, raeume, modelle, gemessen_bis, jetzt, zeitmessung.monotonic() - t0)
    erg = await hass.async_add_executor_job(im_executor)
    if lauf != hz.prognose_v2_lauf:
        return hz.prognose_v2
    erg["dauer_gesamt_s"] = round(zeitmessung.monotonic() - beginn_messung, 2)
    hz.prognose_v2 = erg
    if neu_anstossen:   # erst nach dem Ergebnis (mit den fehlenden Containern), damit es nicht verworfen wird
        hz.prognose_v2_neu_angestossen = True
        st.entry.async_create_background_task(hass, async_rechnen(hass, hz, modelle_neu=True), "baustelle_prognose_v2_neu")
    return erg


async def async_prognose(hass: HomeAssistant, hz: Heizung, *, neu: bool = False) -> dict[str, Any] | None:
    """Für `baustelle/prognose_v2` (Parameter `prognose`): das letzte Ergebnis, sonst (oder mit `neu`) neu rechnen."""
    if hz.prognose_v2 is not None and not neu:
        return hz.prognose_v2
    return await async_rechnen(hass, hz, modelle_neu=neu)


@callback
def prognose_v2_planen(hass: HomeAssistant, st: Steuerung) -> Callable[[], None]:
    """Verzögert nach dem Start, stündlich (:52, mit den Schätzungen von heute) und nachts (neue Schätzungen)."""
    from . import Heizung   # noqa: PLC0415

    hz = Heizung.von(st)

    async def _rechnen(_jetzt: datetime | None = None, *, neu: bool = False) -> None:
        try:
            await async_rechnen(hass, hz, modelle_neu=neu)
        except Exception:   # noqa: BLE001 – Schattenbetrieb: nie die Integration stören
            _LOGGER.exception("Prognose V2 (Schattenbetrieb) fehlgeschlagen")

    async def _nachts(jetzt: datetime) -> None:
        await _rechnen(jetzt, neu=True)

    @callback
    def _start(_jetzt: datetime) -> None:
        st.entry.async_create_background_task(hass, _rechnen(), "baustelle_prognose_v2")

    abmelden = [async_call_later(hass, START_VERZOEGERUNG, _start), async_track_time_change(hass, _rechnen, **STUENDLICH),
                async_track_time_change(hass, _nachts, **NAECHTLICH)]

    def ende() -> None:
        for a in abmelden:
            a()
    return ende
