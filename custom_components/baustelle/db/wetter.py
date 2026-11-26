"""Wetter je Stunde aus der eigenen Datenbank (`wetter_minute`, Aufbau 11) für „Verbrauch & Wetter“ (M13).

Je Stunde: Ø Außentemperatur, Minuten je Klasse des Wetterzustands (`logik/verbrauch_wetter.klasse`), Ø Wind und der
höchste Stand des Tages-Regens. Ohne Datenbank (oder nicht lesbar) None – dann zeigt die Auswertung nur, was die
Langzeitstatistik hat.
"""

from __future__ import annotations

from collections import defaultdict
from datetime import datetime
from typing import Any

from sqlalchemy import Connection, select

from homeassistant.core import HomeAssistant
from homeassistant.util import dt as dt_util

from ..logik.verbrauch_wetter import klasse
from . import DATA_DB, schema as s


def _stunden(v: Connection, bid: str, start: datetime, ende: datetime) -> dict[float, dict[str, Any]]:
    wm = s.wetter_minute
    summe: dict[float, dict[str, Any]] = defaultdict(lambda: {"t": 0.0, "tn": 0.0, "w": 0.0, "wn": 0, "min": defaultdict(float), "regen": None})
    for r in v.execute(select(wm.c.zeit, wm.c.dauer_s, wm.c.aussen_temp, wm.c.regen_mm, wm.c.wetter, wm.c.wind_kmh)
                       .where(wm.c.baustelle_id == bid, wm.c.zeit >= start, wm.c.zeit < ende)):
        zeit = r.zeit if r.zeit.tzinfo else r.zeit.replace(tzinfo=dt_util.UTC)
        ts = zeit.timestamp()
        x = summe[ts - ts % 3600]
        dauer = float(r.dauer_s or 60)
        if r.aussen_temp is not None:
            x["t"] += r.aussen_temp * dauer
            x["tn"] += dauer
        if r.wind_kmh is not None:
            x["w"] += r.wind_kmh * dauer
            x["wn"] += dauer
        if (k := klasse(r.wetter)) is not None:
            x["min"][k] += dauer / 60
        if r.regen_mm is not None:
            x["regen"] = max(x["regen"] or 0.0, r.regen_mm)
    return {ts: {"aussen": x["t"] / x["tn"] if x["tn"] else None, "wind": x["w"] / x["wn"] if x["wn"] else None,
                 "wetter_min": dict(x["min"]), "regen_stand": x["regen"]} for ts, x in summe.items()}


async def async_wetter_stunden(hass: HomeAssistant, bid: str, start: datetime, ende: datetime) -> dict[float, dict[str, Any]] | None:
    """{Beginn der Stunde (Unix-Sekunden): {aussen, wind, wetter_min, regen_stand}} einer Baustelle; ohne Datenbank None."""
    db = hass.data.get(DATA_DB)
    if db is None or not db.bereit:
        return None
    s_utc, e_utc = dt_util.as_utc(start), dt_util.as_utc(ende)
    return await db.async_ausfuehren(lambda v: _stunden(v, bid, s_utc, e_utc))
