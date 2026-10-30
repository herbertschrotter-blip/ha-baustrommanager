"""Abgleich Inventar ↔ HA (BSM-034.04, Bauplan Geräte §5 .04, Herbert 10.10.2026).

Läuft beim Start jeder Baustelle (also auch nach jeder Änderung an Containern und Geräten, die neu lädt), täglich und
nach Änderungen an Türkontakt oder Aussehen. Je Bereich mit Inventar-Container (logik/inventar.abgleich):
- was HA dem Bereich zuordnet (Shellys, Fühler, Türen, Fenster), aber nicht im Container steht → nachtragen
  (steckt die Ausrüstung in einem anderen Container, endet der Einsatz dort), Eintrag im Protokoll;
- was nur im Inventar steckt → nur anzeigen (`nicht_in_ha`, Seite › Inventar), nichts verschwindet von selbst.
Dazu einmal je Start: Shelly-Plugs aus dem Inventar, die kein Heizkörper einer Baustelle sind, kommen auf die Liste
des Notprogramms zum Abschalten (Skripte von vor 0.8.115, BSM-034.01).
"""

from __future__ import annotations

from collections.abc import Callable
from datetime import datetime
import logging
from typing import TYPE_CHECKING, Any

from homeassistant.core import HomeAssistant, callback
from homeassistant.helpers import device_registry as dr, entity_registry as er
from homeassistant.helpers.event import async_track_time_change
from homeassistant.util import dt as dt_util

from .const import DOMAIN, ROLLE_HEIZKOERPER
from .db import DATA_DB
from .db import inventar as db_inventar
from .kern.geraete import _kennung
from .logik.inventar import SENSOR_TYP, abgleich
from .notprogramm import geraet_von

if TYPE_CHECKING:
    from .steuerung import Steuerung

_LOGGER = logging.getLogger(__name__)
TAEGLICH = {"hour": 3, "minute": 40, "second": 0}


def _ha_stuecke(hass: HomeAssistant, st: Steuerung, bid: str) -> dict[str, tuple[str, str | None, str | None, str]]:
    """Was HA dem Bereich zuordnet: Kennung → (Typ, Gerät/Unter-Eintrag, Modell, Name)."""
    aus: dict[str, tuple[str, str | None, str | None, str]] = {}
    for g in st.geraete_in(bid):
        if (k := _kennung(hass, g.schalter)) is not None:
            aus.setdefault(k[0], ("PLUG", g.id, k[1], g.name))
    for s in st.sensoren(bid):
        if (typ := SENSOR_TYP.get(s.art)) is not None and (k := _kennung(hass, s.entity_id)) is not None:
            aus.setdefault(k[0], (typ, None, k[1], s.name))
    return aus


def _container_von(roh: dict[str, Any], baustelle_id: str, bid: str) -> str | None:
    return next((e["container_id"] for e in roh.get("einsaetze") or []
                 if e.get("baustelle_id") == baustelle_id and e.get("bereich_id") == bid and not e.get("bis")), None)


def _im_container(roh: dict[str, Any], cid: str) -> dict[str, str]:
    kennung = {a["id"]: a.get("kennung") for a in roh.get("ausruestung") or []}
    return {kennung[e["ausruestung_id"]]: e["ausruestung_id"] for e in roh.get("ausruestung_einsaetze") or []
            if e.get("container_id") == cid and not e.get("bis") and kennung.get(e["ausruestung_id"])}


def nicht_in_ha(hass: HomeAssistant, roh: dict[str, Any]) -> set[str]:
    """Ausrüstung in Containern geladener Baustellen, die HA dort nicht (mehr) zuordnet – für die Anzeige."""
    aus: set[str] = set()
    for entry in hass.config_entries.async_loaded_entries(DOMAIN):
        st: Steuerung = entry.runtime_data
        for bid in st.bereiche:
            if (cid := _container_von(roh, entry.entry_id, bid)) is not None:
                aus.update(abgleich(_ha_stuecke(hass, st, bid), _im_container(roh, cid))[1])
    return aus


def _verwaiste_plugs(hass: HomeAssistant, st: Steuerung, roh: dict[str, Any]) -> None:
    """Shelly-Plugs aus dem Inventar, die in keiner Baustelle Heizkörper sind → Notprogramm schaltet ihr Skript ab."""
    reg = er.async_get(hass)
    heizer = {g.schalter for e in hass.config_entries.async_loaded_entries(DOMAIN) for g in e.runtime_data.geraete.values()
              if g.rolle == ROLLE_HEIZKOERPER}
    heiz_geraete = {d for s in heizer if (d := geraet_von(hass, s))}   # Audit 0.8.165
    geraete = dr.async_get(hass)
    bekannt: dict[str, str] = st.lz.setdefault("np_plugs", {})
    neu = False
    for a in roh.get("ausruestung") or []:
        k = str(a.get("kennung") or "")
        if a.get("typ") != "PLUG" or not k:
            continue
        art, _, wert = k.partition(":")
        kandidaten = [g for g in [geraete.async_get(wert)] if g] if art == "ha" else geraete.async_get_devices(connections={(art, wert)})
        kandidaten = [g for g in kandidaten if g.id not in heiz_geraete]   # Heizkörper-Plug, auch mit zweitem Schalter (BLE)
        schalter = next((x.entity_id for g in kandidaten for x in er.async_entries_for_device(reg, g.id)
                         if x.domain == "switch" and x.platform == "shelly"), None)
        if schalter and schalter not in heizer and schalter not in bekannt.values():
            bekannt[f"inventar:{a['id']}"] = schalter
            neu = True
    if neu:
        st.einstellungen.speichern()


async def async_abgleich(hass: HomeAssistant, st: Steuerung, *, plugs: bool = False) -> dict[str, Any]:
    """Abgleich für eine Baustelle; liefert {nachgetragen: [Namen], nicht_in_ha: [Ausrüstung]}."""
    db = hass.data.get(DATA_DB)
    if db is None or not db.bereit:
        return {"nachgetragen": [], "nicht_in_ha": []}
    roh = await db.async_ausfuehren(db_inventar.lesen)
    if roh is None:
        return {"nachgetragen": [], "nicht_in_ha": []}
    jetzt, arbeit, namen, fremd = dt_util.utcnow(), [], [], []
    for bid, info in st.bereiche.items():
        if (cid := _container_von(roh, st.entry.entry_id, bid)) is None:
            continue
        ha = _ha_stuecke(hass, st, bid)
        nachtragen, nicht = abgleich(ha, _im_container(roh, cid))
        fremd += nicht
        for k in nachtragen:
            typ, gid, modell, name = ha[k]
            arbeit.append(lambda v, k=k, typ=typ, gid=gid, modell=modell, cid=cid: db_inventar.geraet_im_container(
                v, kennung=k, modell=modell, container_id=cid, geraet_id=gid, jetzt=jetzt, typ=typ))
            namen.append((bid, f"{name} ({info.name})"))
    if arbeit and await db.async_ausfuehren(lambda v: [f(v) for f in arbeit]) is None:
        _LOGGER.warning("Abgleich Inventar: nicht nachgetragen (%s)", db.fehler)
        namen = []
    for bid, text in namen:
        st.protokoll("einstellung", bid, f"Inventar nachgetragen: {text}")
    if plugs:
        _verwaiste_plugs(hass, st, roh)
    return {"nachgetragen": [t for _, t in namen], "nicht_in_ha": fremd}


@callback
def abgleich_planen(hass: HomeAssistant, st: Steuerung) -> Callable[[], None]:
    """Beim Start (mit verwaisten Plugs) und täglich um 03:40."""
    st.entry.async_create_background_task(hass, async_abgleich(hass, st, plugs=True), "baustelle_abgleich")

    async def _taeglich(_jetzt: datetime) -> None:
        await async_abgleich(hass, st)
    return async_track_time_change(hass, _taeglich, **TAEGLICH)
