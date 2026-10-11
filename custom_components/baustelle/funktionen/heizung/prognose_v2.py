"""Heizung: Prognose V2, Diagnose der Tagesmerkmale (BSM-033.07, Bauplan Hochrechnung §8, Lieferung P2).

Nur auf Anfrage (WS `baustelle/prognose_v2`), nie im Steuerzyklus und ohne Einfluss auf die bisherige Hochrechnung:
die Zeilen der letzten N abgeschlossenen Tage aus der Datenbank (`db/prognose.prognose_rohdaten`, kurz in der
Datenbanksperre), dann in einem eigenen Executor-Job zusammensetzen (`minuten_bauen`) und Tagesmerkmale, Starts und
Abkühlepisoden aus `logik/prognose_merkmale.merkmale` – der Event-Loop bleibt frei. Es läuft höchstens eine Diagnose
gleichzeitig (eine weitere wartet). Je Container steht die Abnahmeprüfung des rekonstruierten Kontexts dabei (P2b:
an/aus, Quote, Abweichungen). Hier wird nichts gerechnet, nur zusammengestellt.

**P3 (BSM-033.08) – Evidenzbericht** je Container (`evidenz`): stationäre Fenster direkt/Ersatz samt Verwerfungsgründen,
H-Schätzung (gewählt, direkt, Ersatz, Tagesregression) mit Band und Evidenzstufe, Duty, Baseline-Plateaus und Gegenmodell,
Starts mit Bilanz und Abkühlnächte – je Konfiguration. Zeitraum: Beginn der Heizperiode, höchstens `h_tage` (bis 120)
Tage zurück, bis gestern. Gelesen wird in Abschnitten von `ABSCHNITT_TAGE` Tagen (je kurz in der Datenbanksperre, die
Abnahmeprüfung nur einmal), jeder Abschnitt mit einem Vorlauf, der einen ganzen Baseline-Lauf samt Warm-up und längstem
Block abdeckt; eine reguläre Episode, die am Abschnittsende noch läuft, gibt ihren Anker weiter (gleiches Raster wie in
einem Durchgang). Aus jedem Abschnitt zählt nur, was in ihm endet bzw. beginnt (keine Doppelzählung). Rechnen im Executor,
Fachlogik nur in `logik/prognose_h`, `prognose_baseline`, `prognose_stufe`, `prognose_merkmale`.
"""

from __future__ import annotations

import asyncio
from collections.abc import Mapping, Sequence
from dataclasses import dataclass, field
from datetime import date, datetime, time, timedelta
from typing import TYPE_CHECKING, Any

from homeassistant.core import HomeAssistant
from homeassistant.util import dt as dt_util

from ...db import DATA_DB
from ...db.prognose import PrognoseRahmen, Rohdaten, minuten_bauen, prognose_rohdaten
from ...logik.prognose_baseline import baseline_metadaten, h_ohne, plateaus, schaetze_ohne
from ...logik.prognose_h import (
    fenster_und_offene,
    modell_konfigurationen,
    schaetze_duty,
    schaetze_h_pfade,
    schaetze_h_tage,
    waehle_h,
    zaehle_fenster,
)
from ...logik.prognose_merkmale import bewerten, merkmale, start_sauber, startbilanzen, starts, startzusatz
from ...logik.prognose_regeln import PrognoseRegeln
from ...logik.prognose_stufe import betriebsabhaengig, evidenz_duty, evidenz_h, evidenz_ohne
from ...logik.prognose_typen import (
    MODELL_VERSION,
    AbkuehlEpisode,
    BaselineMetadaten,
    BereichIntervall,
    DutySchaetzung,
    Fenster,
    HSchaetzung,
    Intervall,
    ModellKontext,
    OhneSchaetzung,
    RekonstruktionsPruefung,
    StartBilanz,
    StartMerkmal,
    TagesMerkmale,
)
from . import baseline as h_baseline
from .hochrechnung import zeitraum as heizperiode

if TYPE_CHECKING:
    from . import Heizung

REGELN = PrognoseRegeln()
DATA_SPERRE = "baustelle_prognose_v2_sperre"   # hass.data: eine Diagnose zur Zeit (Last auf dem Pi)
H_TAGE_MAX = 120        # so weit reicht der Evidenzbericht (P3) höchstens zurück
ABSCHNITT_TAGE = 14     # Lesen in Abschnitten (Speicher und Sperrdauer auf dem Pi), keine Fachschwelle


def _zahl(x: float | None, stellen: int = 4) -> float | None:
    return None if x is None else round(x, stellen)


def _start(s: StartMerkmal) -> dict[str, Any]:
    return {"beginn": s.beginn.isoformat(), "soll": s.soll_c, "innen_start": _zahl(s.innen_start_c, 2),
            "delta_k": _zahl(s.delta_start_k, 2), "gruende": list(s.gruende)}


def _tag(t: TagesMerkmale) -> dict[str, Any]:
    return {
        "datum": t.datum.isoformat(), "konfiguration_id": t.konfiguration_id, "dauer_h": _zahl(t.dauer_h),
        "geeignet": {"thermo": t.training_thermo, "plan": t.training_plan}, "gruende": list(t.gruende),
        "quoten": {"betrieb": _zahl(t.q_betrieb), "innen": _zahl(t.q_innen), "aussen": _zahl(t.q_aussen),
                   "joint_r": _zahl(t.q_joint_r), "joint_f": _zahl(t.q_joint_f),
                   "energie": {g: _zahl(q) for g, q in t.q_energie_je_geraet}},
        "laengste_luecke_s": _zahl(t.laengste_joint_luecke_s, 0),
        "gdh": {"aktiv": _zahl(t.gdh_aktiv_kh, 3), "frost": _zahl(t.gdh_frost_kh, 3), "innen": _zahl(t.gdh_innen_kh, 3)},
        "stunden": {"aktiv": _zahl(t.aktiv_h, 3), "frost": _zahl(t.frost_h, 3), "plan": _zahl(t.plan_h, 3)},
        "energie": {"ist_kwh": _zahl(t.ist_belegt_kwh), "vollstaendig": t.ist_vollstaendig,
                    "arten_kwh": {a: _zahl(w) for a, w in t.energie_arten_kwh}, "regulaer_joint_kwh": _zahl(t.regulaer_joint_kwh),
                    "kapazitaet_kwh": _zahl(t.kapazitaet_regulaer_kwh)},
        "aussen_mittel": _zahl(t.aussen_mittel_c, 2), "starts": [_start(s) for s in t.starts]}


def _episode(e: AbkuehlEpisode) -> dict[str, Any]:
    return {"von": e.zeit.von.isoformat(), "bis": e.zeit.bis.isoformat(), "innen_start": _zahl(e.innen_start_c, 2),
            "innen_ende": _zahl(e.innen_ende_c, 2), "gruende": list(e.gruende)}


ABWEICHUNGEN_MAX = 20   # so viele Abweichungen der Abnahmeprüfung zeigt die Diagnose (Anzahl steht daneben)


def _pruefung(p: RekonstruktionsPruefung | None) -> dict[str, Any] | None:
    if p is None:
        return None
    return {"an": p.freigegeben, "quote": _zahl(p.quote), "verglichen": p.verglichen, "treffer": p.treffer,
            "abweichungen_anzahl": len(p.abweichungen), "gruende": list(p.gruende),
            "abweichungen": [{"zeit": t.isoformat(), "echt": e, "rekonstruiert": r} for t, e, r in p.abweichungen[:ABWEICHUNGEN_MAX]]}


def auswerten(minuten: Mapping[str, Sequence[BereichIntervall]], namen: Mapping[str, str], erster: date, heute: date,
              zeitzone: str, pruefungen: Mapping[str, RekonstruktionsPruefung] | None = None) -> list[dict[str, Any]]:
    """Je Container Tagesmerkmale (ab `erster`, bis gestern) und Abkühlepisoden – nur Zusammenstellung der Fachlogik."""
    zone = dt_util.get_time_zone(zeitzone)
    aus = []
    for b, ms in minuten.items():
        alle_tage, alle_episoden = merkmale(ms, heute, zeitzone, REGELN)
        tage = [t for t in alle_tage if t.datum >= erster]
        episoden = [e for e in alle_episoden if e.zeit.bis.astimezone(zone).date() >= erster]
        aus.append({"bereich": b, "name": namen.get(b, b), "tage": [_tag(t) for t in tage],
                    "geeignet": {"thermo": sum(t.training_thermo for t in tage), "plan": sum(t.training_plan for t in tage)},
                    "abkuehlepisoden": [_episode(e) for e in episoden],
                    "rekonstruktion": _pruefung((pruefungen or {}).get(b))})
    return aus


async def async_diagnose(hass: HomeAssistant, hz: Heizung, tage: int, h_tage: int = 0) -> dict[str, Any]:
    """Tagesmerkmale der letzten `tage` abgeschlossenen Tage je Container (Schattenbetrieb, nur Diagnose) und – mit
    `h_tage` > 0 – der Evidenzbericht P3 über höchstens `h_tage` Tage der laufenden Heizperiode."""
    st = hz.st
    zone = dt_util.get_default_time_zone()
    heute = dt_util.now().date()
    erster = heute - timedelta(days=tage)
    kopf: dict[str, Any] = {"modell_version": MODELL_VERSION, "von": erster.isoformat(), "bis": (heute - timedelta(days=1)).isoformat()}
    db = hass.data.get(DATA_DB)
    if db is None or not db.bereit:
        return {**kopf, "verfuegbar": False, "container": []}
    bereiche = hz.bereiche()
    rahmen = PrognoseRahmen(st.entry.entry_id, zone, tuple(b.id for b in bereiche), tuple(h_baseline.laeufe(hz)), REGELN)
    # Vorlauf vor dem ersten Tag, damit ein Start um Mitternacht seine Pause und die Werte davor sieht
    vorlauf = timedelta(minutes=REGELN.start_pause_min + REGELN.start_vorlauf_min)
    von = dt_util.as_utc(datetime.combine(erster, time(), zone) - vorlauf)
    bis = dt_util.as_utc(datetime.combine(heute, time(), zone))
    namen = {b.id: b.name for b in bereiche}
    sperre: asyncio.Lock = hass.data.setdefault(DATA_SPERRE, asyncio.Lock())
    async with sperre:
        roh = await db.async_ausfuehren(lambda v: prognose_rohdaten(v, rahmen, von, bis))
        if roh is None:
            return {**kopf, "verfuegbar": False, "fehler": db.fehler, "container": []}
        container, pruefungen = await hass.async_add_executor_job(_bauen_und_auswerten, roh, rahmen, namen, erster, heute,
                                                                  hass.config.time_zone)
        if h_tage > 0:
            ev_von = max(heizperiode(st, heute)[0], heute - timedelta(days=min(h_tage, H_TAGE_MAX)))
            kopf["evidenz"] = {"von": ev_von.isoformat(), "bis": kopf["bis"]}
            evidenz = await _evidenz(hass, db, hz, rahmen, pruefungen, ev_von, heute)
            if evidenz is None:
                return {**kopf, "verfuegbar": False, "fehler": db.fehler, "container": []}
            for c in container:
                c["evidenz"] = evidenz.get(c["bereich"])
    return {**kopf, "verfuegbar": True, "container": container}


def _bauen_und_auswerten(roh: Rohdaten, rahmen: PrognoseRahmen, namen: Mapping[str, str], erster: date, heute: date,
                         zeitzone: str) -> tuple[list[dict[str, Any]], dict[str, RekonstruktionsPruefung]]:
    """Außerhalb der Datenbanksperre: Zeilen zusammensetzen und auswerten (Executor)."""
    minuten, pruefungen = minuten_bauen(roh, rahmen)
    return auswerten(minuten, namen, erster, heute, zeitzone, pruefungen), pruefungen


# ---------------------------------------------------------------------- P3: Evidenzbericht


def ueberlappung(regeln: PrognoseRegeln) -> timedelta:
    """Vorlauf je Abschnitt: ein ganzer Baseline-Lauf samt Warm-up und längstem Block, damit Laufbeginn, Starts samt
    Bilanz und Abkühlnächte vollständig im Abschnitt liegen, der sie zählt (längere reguläre Episoden: Anker)."""
    return timedelta(hours=regeln.baseline_bevorzugt_h + regeln.baseline_vorlauf_oel_h + regeln.baseline_block_max_h)


@dataclass
class Sammlung:
    """Ergebnisse eines Containers über alle Abschnitte."""

    fenster: list[Fenster] = field(default_factory=list)
    plateaus: list[Fenster] = field(default_factory=list)
    tage: list[TagesMerkmale] = field(default_factory=list)
    starts: list[StartMerkmal] = field(default_factory=list)
    bilanzen: list[StartBilanz] = field(default_factory=list)
    episoden: list[Intervall] = field(default_factory=list)   # nur die Zeit (die Minuten blieben sonst 120 Tage im Speicher)
    anker: datetime | None = None   # Beginn einer regulären Episode, die am Ende des vorigen Abschnitts noch lief


def abschnitt(minuten: Mapping[str, Sequence[BereichIntervall]], laeufe: Sequence[BaselineMetadaten], von: datetime,
              bis: datetime, letzter: bool, zeitzone: str, sammlung: dict[str, Sammlung],
              gelesen_ab: datetime | None = None) -> None:
    """Fachlogik auf einen Abschnitt (gelesen ab `gelesen_ab`, bis `bis`) anwenden und nur behalten, was in (von, bis]
    endet bzw. in [von, bis) beginnt (Tage: lokale Tage ab `von`). Eine reguläre Episode, die am Abschnittsende noch
    läuft, gibt ihren Anker an den nächsten Abschnitt weiter; die erste gelesene Minute gilt nicht als beobachteter
    Episodenbeginn (Altdaten markieren sie als Wechsel)."""
    zone = dt_util.get_time_zone(zeitzone)
    erster_tag, heute = von.astimezone(zone).date(), bis.astimezone(zone).date()
    ab = gelesen_ab + timedelta(minutes=1) if gelesen_ab is not None else None
    for b, ms in minuten.items():
        s = sammlung.setdefault(b, Sammlung())
        bw = bewerten(ms, REGELN)   # jede Minute einmal bewerten, alle Auswertungen nutzen das Ergebnis
        anker = {b: s.anker} if s.anker is not None else None
        fenster, offen = fenster_und_offene(ms, REGELN, beobachtet_ab=ab, anker=anker, bewertet=bw)
        s.fenster += [f for f in fenster if von < f.zeit.bis <= bis]
        s.anker = offen.get(b)
        s.plateaus += [p for p in plateaus(ms, laeufe, REGELN, beobachtet_ab=ab, bewertet=bw) if von < p.zeit.bis <= bis]
        tage, episoden = merkmale(ms, heute, zeitzone, REGELN, bewertet=bw)
        s.tage += [t for t in tage if t.datum >= erster_tag]
        # eine Episode genau bis ans Abschnittsende kann abgeschnitten sein – sie zählt im nächsten Abschnitt
        s.episoden += [e.zeit for e in episoden if von <= e.zeit.bis and (e.zeit.bis < bis or letzter)]
        del episoden
        alle = starts(ms, REGELN, bewertet=bw)
        s.starts += [x for x in alle if von <= x.beginn < bis]
        # Bilanzen zählen dort, wo sie enden (ein Start kurz vor dem Abschnittsende wird im nächsten fertig)
        s.bilanzen += [x for x in startbilanzen(ms, alle, REGELN, bewertet=bw) if von < x.zeit.bis <= bis]


async def _evidenz(hass: HomeAssistant, db: Any, hz: Heizung, rahmen: PrognoseRahmen,
                   pruefungen: Mapping[str, RekonstruktionsPruefung], von_tag: date, heute: date) -> dict[str, Any] | None:
    """Abschnittsweise lesen (Datenbanksperre je Abschnitt) und rechnen (Executor); None bei Lesefehler."""
    zone = dt_util.get_default_time_zone()
    zeitzone = hass.config.time_zone
    laeufe = tuple(baseline_metadaten(l, zeitzone) for l in rahmen.laeufe)
    sammlung: dict[str, Sammlung] = {}
    vorlauf = ueberlappung(REGELN)
    tag = von_tag
    while tag < heute:
        ende_tag = min(tag + timedelta(days=ABSCHNITT_TAGE), heute)
        a = dt_util.as_utc(datetime.combine(tag, time(), zone))
        e = dt_util.as_utc(datetime.combine(ende_tag, time(), zone))
        roh = await db.async_ausfuehren(lambda v, a=a, e=e: prognose_rohdaten(v, rahmen, a - vorlauf, e, pruefung=False))
        if roh is None:
            return None
        await hass.async_add_executor_job(_abschnitt_bauen, roh, rahmen, pruefungen, laeufe, a, e, ende_tag == heute,
                                          zeitzone, sammlung)
        tag = ende_tag
    training_bis = dt_util.as_utc(datetime.combine(heute, time(), zone))
    aktuell = {b.id: hz.prognose_kontext(b.id)[1] for b in hz.bereiche()}
    return await hass.async_add_executor_job(evidenzbericht, sammlung, aktuell, laeufe, training_bis, zeitzone)


def _abschnitt_bauen(roh: Rohdaten, rahmen: PrognoseRahmen, pruefungen: Mapping[str, RekonstruktionsPruefung],
                     laeufe: Sequence[BaselineMetadaten], von: datetime, bis: datetime, letzter: bool, zeitzone: str,
                     sammlung: dict[str, Sammlung]) -> None:
    minuten, _ = minuten_bauen(roh, rahmen, pruefungen)
    abschnitt(minuten, laeufe, von, bis, letzter, zeitzone, sammlung, von - ueberlappung(REGELN))


def _h(h: HSchaetzung, stufe: str) -> dict[str, Any]:
    ev = h.evidenz
    return {"methode": h.methode, "h_kw_k": _zahl(h.h_kw_k, 5), "unten": _zahl(h.h_unten_kw_k, 5),
            "oben": _zahl(h.h_oben_kw_k, 5), "stufe": stufe,
            "evidenz": {"fenster": ev.fenster, "tage": ev.tage, "stunden": _zahl(ev.stunden, 2), "mad": _zahl(ev.mad_kw_k, 5),
                        "streuung_rel": _zahl(ev.streuung_rel), "delta_t_k": [_zahl(ev.delta_t_min_k, 2), _zahl(ev.delta_t_max_k, 2)],
                        "aussen_c": [_zahl(ev.aussen_min_c, 2), _zahl(ev.aussen_max_c, 2)],
                        "soll_c": [_zahl(ev.soll_min_c, 2), _zahl(ev.soll_max_c, 2)], "ersatzfenster": ev.ersatzfenster,
                        "verworfen": ev.verworfen, "stufe_hoechstens": ev.stufe_hoechstens, "gruende": list(ev.gruende)},
            "tage": [[d.isoformat(), _zahl(x, 5)] for d, x in h.tage]}


def _duty(d: DutySchaetzung) -> dict[str, Any]:
    return {"duty": _zahl(d.duty), "tage": d.tage, "kapazitaet_kwh": _zahl(d.kapazitaet_training_kwh, 3),
            "energie_kwh": _zahl(d.energie_training_kwh, 3), "stufe": evidenz_duty(d, REGELN), "gruende": list(d.gruende)}


def _ohne(o: OhneSchaetzung) -> dict[str, Any]:
    return {"methode": o.methode, "stufe": evidenz_ohne(o, REGELN), "t_max_c": _zahl(o.t_max_c, 2),
            "t_max_band_c": [_zahl(o.t_max_unten_c, 2), _zahl(o.t_max_oben_c, 2)],
            "h": _h(o.h, evidenz_h(o.h, None, REGELN)) if o.h is not None else None, "laeufe": o.laeufe,
            "beobachtungstage": o.beobachtungstage, "naechte_b": o.naechte_b, "plateau_h": _zahl(o.plateau_h, 2),
            "thermostat": o.thermostat_nachweis, "gruende": list(o.gruende)}


def _zaehlung(fs: Sequence[Fenster]) -> dict[str, Any]:
    z = zaehle_fenster(fs)
    return {"direkt": z.direkt, "ersatz": z.ersatz, "verworfen": z.verworfen, "stunden": _zahl(z.stunden, 2),
            "gruende": dict(z.gruende)}


def evidenzbericht(sammlung: Mapping[str, Sammlung], aktuell: Mapping[str, str], laeufe: Sequence[BaselineMetadaten],
                   training_bis: datetime, zeitzone: str) -> dict[str, Any]:
    """Je Container der Evidenzbericht – nur Zusammenstellung der Fachlogik."""
    zone = dt_util.get_time_zone(zeitzone)
    aus: dict[str, Any] = {}
    for b in sorted(set(sammlung) | set(aktuell)):
        s = sammlung.get(b, Sammlung())
        modelle = []
        h_je: dict[str, float] = {}
        for kid in modell_konfigurationen([*s.fenster, *s.plateaus], s.tage, aktuell.get(b)):
            ktx = ModellKontext(b, kid, training_bis)
            direkt, ersatz = schaetze_h_pfade(ktx, s.fenster, REGELN, zeitzone=zeitzone)
            h = waehle_h(direkt, ersatz, REGELN)
            if h.h_kw_k is not None:
                h_je[kid] = h.h_kw_k
            h_tage = schaetze_h_tage(ktx, s.tage, REGELN)
            ohne = schaetze_ohne(ktx, s.plateaus, laeufe, None, REGELN, zeitzone=zeitzone)
            modelle.append({
                "konfiguration_id": kid, "aktuell": kid == aktuell.get(b),
                "h": _h(h, evidenz_h(h, None, REGELN)), "h_direkt": _h(direkt, evidenz_h(direkt, None, REGELN)),
                "h_ersatz": _h(ersatz, evidenz_h(ersatz, None, REGELN)), "h_tage": _h(h_tage, evidenz_h(h_tage, None, REGELN)),
                "duty": _duty(schaetze_duty(ktx, s.tage, REGELN)), "ohne": _ohne(ohne),
                "betriebsabhaengig": betriebsabhaengig(h.h_kw_k, h_ohne(ohne), REGELN)})
        sauber = [x for x in s.bilanzen if start_sauber(x, REGELN)]

        def zusatz(x: StartBilanz) -> float | None:   # Z mit dem H derselben Konfiguration (nur Diagnose)
            h = h_je.get(x.start.konfiguration_id)
            return _zahl(startzusatz(x, h), 3) if h is not None else None

        aus[b] = {
            "konfiguration_aktuell": aktuell.get(b), "fenster": _zaehlung(s.fenster), "plateaus": _zaehlung(s.plateaus),
            "modelle": modelle,
            "starts": {"anzahl": len(s.starts), "bekannt": sum(1 for x in s.starts if x.delta_start_k is not None),
                       "bilanzen": len(s.bilanzen), "sauber": len(sauber),
                       "sauber_tage": len({x.start.beginn.astimezone(zone).date() for x in sauber}),
                       "sauber_liste": [{"beginn": x.start.beginn.isoformat(), "konfiguration_id": x.start.konfiguration_id,
                                         "delta_k": _zahl(x.delta_innen_k, 2), "x_kh": _zahl(x.x_innen_kh, 3),
                                         "energie_kwh": _zahl(x.energie_kwh, 3), "zusatz_kwh": zusatz(x)}
                                        for x in sauber]},
            "abkuehlung": {"episoden": len(s.episoden),
                           "naechte": len({e.von.astimezone(zone).date() for e in s.episoden}),
                           "stunden": _zahl(sum((e.bis - e.von).total_seconds() / 3600 for e in s.episoden), 2)}}
    return aus
