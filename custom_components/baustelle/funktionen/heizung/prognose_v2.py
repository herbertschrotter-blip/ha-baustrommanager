"""Heizung: Prognose V2, Diagnose der Tagesmerkmale (BSM-033.07, Bauplan Hochrechnung §8, Lieferung P2).

Nur auf Anfrage (WS `baustelle/prognose_v2`), nie im Steuerzyklus und ohne Einfluss auf die bisherige Hochrechnung:
die Zeilen der letzten N abgeschlossenen Tage aus der Datenbank (`db/prognose.prognose_rohdaten`, kurz in der
Datenbanksperre), dann in einem eigenen Executor-Job zusammensetzen (`minuten_bauen`) und Tagesmerkmale, Starts und
Abkühlepisoden aus `logik/prognose_merkmale.merkmale` – der Event-Loop bleibt frei. Es läuft höchstens eine Diagnose
gleichzeitig (eine weitere wartet). Je Container steht die Abnahmeprüfung des rekonstruierten Kontexts dabei (P2b:
an/aus, Quote, Abweichungen). Hier wird nichts gerechnet, nur zusammengestellt.
"""

from __future__ import annotations

import asyncio
from collections.abc import Mapping, Sequence
from datetime import date, datetime, time, timedelta
from typing import TYPE_CHECKING, Any

from homeassistant.core import HomeAssistant
from homeassistant.util import dt as dt_util

from ...db import DATA_DB
from ...db.prognose import PrognoseRahmen, Rohdaten, minuten_bauen, prognose_rohdaten
from ...logik.prognose_merkmale import merkmale
from ...logik.prognose_regeln import PrognoseRegeln
from ...logik.prognose_typen import (
    MODELL_VERSION,
    AbkuehlEpisode,
    BereichIntervall,
    RekonstruktionsPruefung,
    StartMerkmal,
    TagesMerkmale,
)
from . import baseline as h_baseline

if TYPE_CHECKING:
    from . import Heizung

REGELN = PrognoseRegeln()
DATA_SPERRE = "baustelle_prognose_v2_sperre"   # hass.data: eine Diagnose zur Zeit (Last auf dem Pi)


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


async def async_diagnose(hass: HomeAssistant, hz: Heizung, tage: int) -> dict[str, Any]:
    """Tagesmerkmale der letzten `tage` abgeschlossenen Tage je Container (Schattenbetrieb, nur Diagnose)."""
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
        container = await hass.async_add_executor_job(_bauen_und_auswerten, roh, rahmen, namen, erster, heute,
                                                      hass.config.time_zone)
    return {**kopf, "verfuegbar": True, "container": container}


def _bauen_und_auswerten(roh: Rohdaten, rahmen: PrognoseRahmen, namen: Mapping[str, str], erster: date, heute: date,
                         zeitzone: str) -> list[dict[str, Any]]:
    """Außerhalb der Datenbanksperre: Zeilen zusammensetzen und auswerten (Executor)."""
    minuten, pruefungen = minuten_bauen(roh, rahmen)
    return auswerten(minuten, namen, erster, heute, zeitzone, pruefungen)
