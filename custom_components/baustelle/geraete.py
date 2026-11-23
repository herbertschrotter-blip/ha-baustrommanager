"""WebSocket-Befehl `baustelle/geraet`: Geräte ändern über die eine Stelle `kern/geraete` (BSM-034.02, docs/api-0.7.md
§11, Bauplan Geräte §4). Nur Admins. `aktion: status` (aktiv / inaktiv / verliehen / defekt); `aktion: speichern` mit
`schritte` (anlegen, aendern, entfernen – erst alle geprüft, dann am Stück, danach einmal neu geladen).
"""

from __future__ import annotations

import asyncio
from typing import Any

import voluptuous as vol

from homeassistant.components import websocket_api
from homeassistant.config_entries import ConfigEntryState
from homeassistant.core import HomeAssistant

from .const import CONF_BEREICH, CONF_ENERGIE, CONF_LEISTUNG, CONF_ROLLE, CONF_SCHALTER, CONF_TYP, DOMAIN, ROLLEN, TYPEN
from .db import einstellung_merken
from .inventar import verwirft_namen
from .kern.geraete import GeraetFehler, async_speichern
from .logik.geraete import FEHLER_TEXT, STATUS
from .logik.rechte import darf

AKTIONEN = ("status", "speichern")
SCHRITT = vol.Schema({
    vol.Required("aktion"): vol.In(["anlegen", "aendern", "entfernen"]),
    vol.Optional("geraet"): str,
    vol.Optional(CONF_BEREICH): str,
    vol.Optional(CONF_SCHALTER): str,
    vol.Optional("name"): str,
    vol.Optional(CONF_ROLLE): vol.In(ROLLEN),
    vol.Optional(CONF_TYP): vol.In(TYPEN),
    vol.Optional(CONF_LEISTUNG): vol.Any(None, str),
    vol.Optional(CONF_ENERGIE): vol.Any(None, str),
})


async def _geladen(hass: HomeAssistant, entry_id: str, sekunden: float = 15) -> Any:
    """Steuerung der Baustelle; lädt sie gerade neu (z. B. nach einem HA-Dialog), kurz warten."""
    for _ in range(int(sekunden * 5)):
        entry = hass.config_entries.async_get_entry(entry_id)
        if entry is None or entry.domain != DOMAIN:
            return None
        if entry.state is ConfigEntryState.LOADED and getattr(entry, "runtime_data", None) is not None:
            return entry.runtime_data
        await asyncio.sleep(0.2)
    return None


@websocket_api.websocket_command({
    vol.Required("type"): "baustelle/geraet",
    vol.Required("entry_id"): str,
    vol.Optional("geraet"): str,
    vol.Required("aktion"): vol.In(AKTIONEN),
    vol.Optional("status"): vol.In(STATUS),
    vol.Optional("schritte"): [SCHRITT],
})
@websocket_api.async_response
@verwirft_namen   # Anlegen, Ändern, Entfernen und Status ändern, was der Chip „Namen ✓“ zählt
async def ws_geraet(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]) -> None:
    if not darf(bool(connection.user and connection.user.is_admin), "geraet"):
        connection.send_error(msg["id"], websocket_api.ERR_UNAUTHORIZED, "Nur Admins dürfen ändern")
        return
    st = await _geladen(hass, msg["entry_id"])
    if msg["aktion"] == "speichern":
        if st is None:
            connection.send_error(msg["id"], websocket_api.ERR_NOT_FOUND, "Baustelle nicht gefunden oder nicht geladen")
            return
        try:
            neu = await async_speichern(hass, st, msg.get("schritte") or [])
        except GeraetFehler as err:
            connection.send_error(msg["id"], err.schluessel, FEHLER_TEXT.get(err.schluessel, err.schluessel))
            return
        einstellung_merken(hass, msg["entry_id"], "geraet.speichern", msg.get("schritte") or [],
                           connection.user.name if connection.user else None)
        connection.send_result(msg["id"], {"ok": True, "neu": neu})
        return
    g = st.geraete.get(msg.get("geraet") or "") if st is not None else None
    if st is None or g is None:
        connection.send_error(msg["id"], websocket_api.ERR_NOT_FOUND, "Baustelle oder Gerät nicht gefunden")
        return
    if "status" not in msg:
        connection.send_error(msg["id"], websocket_api.ERR_INVALID_FORMAT, "status fehlt")
        return
    geaendert = st.geraet_status_setzen(g, msg["status"])
    if geaendert:
        einstellung_merken(hass, st.entry.entry_id, "geraet.status", {"geraet": g.id, "status": msg["status"]},
                           connection.user.name if connection.user else None, bereich_id=g.bereich, geraet_id=g.id)
    connection.send_result(msg["id"], {"ok": True, "status": st.geraet_status(g), "geaendert": geaendert})


BEFEHLE = (ws_geraet,)
