"""Diagnose-Download: Einrichtung, Einstellungen, Zähler, Laufzeit und die Entitäten der Baustelle."""

from __future__ import annotations

from datetime import timedelta
from typing import Any

from homeassistant.components.diagnostics import async_redact_data
from homeassistant.core import HomeAssistant

from . import BaustelleConfigEntry
from .const import CONF_EMPFAENGER
from .daten import struktur
from .db import DATA_DB, async_stand
from .notprogramm import DATA_NOTPROGRAMM

GESCHWAERZT = {CONF_EMPFAENGER}


async def async_get_config_entry_diagnostics(hass: HomeAssistant, entry: BaustelleConfigEntry) -> dict[str, Any]:
    daten = struktur(hass, entry)
    daten["baustelle"]["optionen"] = async_redact_data(daten["baustelle"]["optionen"], GESCHWAERZT)
    daten["einstellungen"] = async_redact_data(daten["einstellungen"], {*GESCHWAERZT, "mail_an"})
    daten["notprogramm"] = n.info() if (n := hass.data.get(DATA_NOTPROGRAMM, {}).get(entry.entry_id)) is not None else None
    daten["stoerungen"] = dict(entry.runtime_data.stoerungen)   # Audit 0.8.165: Fehler im Steuerlauf
    daten["datenbank"] = db.info() if (db := hass.data.get(DATA_DB)) is not None else None
    if db is not None and db.bereit:   # BSM-009: Tagessummen der Datenbank gegen die HA-Statistik, letzte 14 Tage
        from homeassistant.util import dt as dt_util   # noqa: PLC0415
        from .db.tage import async_abgleich   # noqa: PLC0415
        heute = dt_util.now().date()
        daten["datenbank"]["abgleich"] = await async_abgleich(hass, db, entry.runtime_data, heute - timedelta(days=13), heute)
        daten["datenbank"]["stand"] = await async_stand(hass, entry.entry_id)   # BSM-027: Zeilen, Zeitraum, Merker
    return daten
