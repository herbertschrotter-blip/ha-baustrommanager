"""Ausrüstung aus Home Assistant fürs Inventar (BSM-031.07, docs/bauplan-inventar.md §2, §6, §8).

Kandidaten (HA-Geräte, die als Ausrüstung taugen: Shelly mit Schalter, Fühler, Tür, Fenster), Zuordnen zu einem Container
samt Verdrahtung in der Baustelle (Shelly als Unter-Eintrag im Bereich, Fühler und Tür am Bereich, wenn dort noch keiner
steht), Bestand beim Anlegen mit Bereich, Status der Ausrüstung auf „aktiv/inaktiv“ des Geräts (BSM-031.08, wie WU-0004)
und die Suche nach alten Entity-IDs in eigenen Automationen, Skripten und Dashboards (§6.2). Gerätekennungen (MAC) landen
nur in der Datenbank.
"""

from __future__ import annotations

import json
import logging
from types import MappingProxyType
from typing import TYPE_CHECKING, Any, cast

from homeassistant.config_entries import ConfigSubentry
from homeassistant.core import HomeAssistant
from homeassistant.helpers import device_registry as dr, entity_registry as er
from homeassistant.util import dt as dt_util

from .const import (
    CONF_BEREICH, CONF_FUEHLER, CONF_ROLLE, CONF_SCHALTER, CONF_TYP, DOMAIN, STATUS_AKTIV, SUB_BEREICH, SUB_GERAET,
)
from .db import inventar as db_inventar
from .kern import geraete as k_geraete
from .logik.geraete import FEHLER_TEXT
from .logik.inventar import HAENGT, SENSOR_TYP, typ_vorschlag
from .logik.symbol import sensor_eintragen

if TYPE_CHECKING:
    from .steuerung import Steuerung

_LOGGER = logging.getLogger(__name__)
KLASSE_FUER = {"TEMP": ("sensor", ("temperature",)), "DOOR": ("binary_sensor", ("door", "opening", "garage_door")),
               "FEN": ("binary_sensor", ("window",))}


def _kennung(geraet: dr.DeviceEntry) -> str:
    """MAC bzw. Bluetooth-Adresse des Geräts, sonst seine HA-Kennung – steht nur in der Datenbank."""
    for art, wert in sorted(geraet.connections):
        if art in (dr.CONNECTION_NETWORK_MAC, dr.CONNECTION_BLUETOOTH):
            return f"{art}:{wert.lower()}"
    return f"ha:{geraet.id}"


def _entitaeten(hass: HomeAssistant, device_id: str) -> list[er.RegistryEntry]:
    return [e for e in er.async_entries_for_device(er.async_get(hass), device_id) if not e.disabled and e.platform != DOMAIN]


def _klasse(e: er.RegistryEntry) -> str:
    return str(e.device_class or e.original_device_class or "")


def _schalter(ents: list[er.RegistryEntry]) -> str | None:
    return next((e.entity_id for e in ents if e.domain == "switch" and e.platform == "shelly"), None)


def _messwert(ents: list[er.RegistryEntry], typ: str) -> str | None:
    domain, klassen = KLASSE_FUER[typ]
    return next((e.entity_id for e in ents if e.domain == domain and _klasse(e) in klassen), None)


def _baustellen(hass: HomeAssistant) -> list[Steuerung]:
    return [e.runtime_data for e in hass.config_entries.async_loaded_entries(DOMAIN)]


def _belegt(hass: HomeAssistant) -> dict[str, str]:
    """Entity-ID → „Baustelle › Bereich“ für alles, was eine Baustelle schon verwendet (Schalter, Fühler, Tür)."""
    aus: dict[str, str] = {}
    for st in _baustellen(hass):
        for g in st.geraete.values():
            aus[g.schalter] = f"{st.entry.title} › {st.bereiche[g.bereich].name}"
        for b in st.bereiche.values():
            for x in st.sensoren(b.id):   # BSM-034.03: alle Sensoren des Containers
                aus[x.entity_id] = f"{st.entry.title} › {b.name}"
    return aus


def kandidaten(hass: HomeAssistant, roh: dict[str, Any]) -> list[dict[str, Any]]:
    """HA-Geräte, die als Ausrüstung taugen und in keinem Container stecken – mit Vorschlag für den Typ, der schon
    bekannten freien Ausrüstung (Status) und wo die Baustelle sie heute verwendet."""
    laufend = {e["ausruestung_id"] for e in roh.get("ausruestung_einsaetze") or [] if not e.get("bis")}
    je_kennung = {a.get("kennung"): a for a in roh.get("ausruestung") or [] if a.get("kennung")}
    belegt, aus = _belegt(hass), []
    for geraet in cast("dict[str, dr.DeviceEntry]", dr.async_get(hass).devices).values():
        if not isinstance(geraet, dr.DeviceEntry) or geraet.disabled or any(d == DOMAIN for d, _ in geraet.identifiers):
            continue
        ents = _entitaeten(hass, geraet.id)
        typ = typ_vorschlag(schalter=_schalter(ents) is not None, klassen=[_klasse(e) for e in ents])
        if typ is None:
            continue
        a = je_kennung.get(_kennung(geraet))
        if a is not None and a["id"] in laufend:
            continue
        haupt = _schalter(ents) if typ == "PLUG" else _messwert(ents, typ)
        aus.append({"device_id": geraet.id, "name": geraet.name_by_user or geraet.name, "modell": geraet.model, "typ": typ,
                    "ausruestung_id": a["id"] if a else None, "status": a["status"] if a else None,
                    "entity_id": haupt, "verwendet": belegt.get(haupt or "")})
    return sorted(aus, key=lambda k: (k["typ"], str(k["name"])))


def _einsatz(roh: dict[str, Any], container_id: str) -> dict[str, Any] | None:
    return next((e for e in roh["einsaetze"] if e["container_id"] == container_id and not e.get("bis")), None)


def _steuerung(hass: HomeAssistant, baustelle_id: str | None) -> Steuerung | None:
    entry = hass.config_entries.async_get_entry(baustelle_id or "")
    return getattr(entry, "runtime_data", None) if entry is not None and entry.domain == DOMAIN else None


def _verdrahten(hass: HomeAssistant, st: Steuerung, bid: str, geraet: dr.DeviceEntry, typ: str, haengt: str | None
                ) -> tuple[str | None, str | None]:
    """Gerät im Bereich `bid` einhängen; liefert (Unter-Eintrag des Shelly, Text was geschah). Fremde Baustelle → Fehler."""
    ents = _entitaeten(hass, geraet.id)
    if typ == "PLUG":
        schalter = _schalter(ents)
        if schalter is None:
            raise ValueError("kein Shelly-Schalter am Gerät")
        for andere in _baustellen(hass):
            if andere is not st and andere.entry.options.get("status", STATUS_AKTIV) == STATUS_AKTIV \
                    and any(g.schalter == schalter for g in andere.geraete.values()):
                raise ValueError(f"Shelly gehört zur Baustelle {andere.entry.title}")
        rolle, heiztyp = HAENGT.get(haengt or "konvektor", HAENGT["konvektor"])
        sub = next((x for x in st.entry.subentries.values() if x.subentry_type == SUB_GERAET and x.data.get(CONF_SCHALTER) == schalter), None)
        try:   # dieselben Regeln wie HA-Dialog und Seite (BSM-034.02, z. B. keine Heizung in den Pumpenschacht)
            k_geraete.plan(hass, st, [{"aktion": "aendern", "geraet": sub.subentry_id, CONF_BEREICH: bid,
                                       **({CONF_ROLLE: rolle, CONF_TYP: heiztyp} if haengt else {})} if sub is not None else
                                      {"aktion": "anlegen", CONF_BEREICH: bid, CONF_SCHALTER: schalter, CONF_ROLLE: rolle,
                                       CONF_TYP: heiztyp, "name": geraet.name_by_user or geraet.name or schalter}])
        except k_geraete.GeraetFehler as err:
            raise ValueError(FEHLER_TEXT.get(err.schluessel, err.schluessel)) from err
        if sub is not None:
            data = {**sub.data, CONF_BEREICH: bid, **({CONF_ROLLE: rolle, CONF_TYP: heiztyp} if haengt else {})}
            hass.config_entries.async_update_subentry(st.entry, sub, data=data)
            return sub.subentry_id, None if data == dict(sub.data) else "Shelly im Bereich angepasst"
        name = geraet.name_by_user or geraet.name or schalter
        neu = ConfigSubentry(data=MappingProxyType({CONF_BEREICH: bid, CONF_SCHALTER: schalter, "name": name, CONF_ROLLE: rolle,
                                                    CONF_TYP: heiztyp}), subentry_type=SUB_GERAET, title=name, unique_id=None)
        hass.config_entries.async_add_subentry(st.entry, neu)
        return neu.subentry_id, "Shelly im Bereich angelegt"
    eid = _messwert(ents, typ) if typ in KLASSE_FUER else None
    if typ == "TEMP" and eid:
        sub = st.entry.subentries.get(bid)
        if sub is not None and sub.subentry_type == SUB_BEREICH and not sub.data.get(CONF_FUEHLER):
            hass.config_entries.async_update_subentry(st.entry, sub, data={**sub.data, CONF_FUEHLER: eid})
            return None, "als Fühler des Containers eingetragen"
    if typ == "DOOR" and eid and not st.einstellungen.bereich(bid).get("tuer"):
        st.einstellung_setzen(("bereiche", bid, "tuer"), eid)
        return None, "als Türkontakt des Containers eingetragen"
    if typ in ("DOOR", "FEN") and eid:   # BSM-034.03: weitere Tür bzw. Fenster ins Aussehen – pausiert dann auch
        e = st.einstellungen.bereich(bid)
        art = "tuer" if typ == "DOOR" else "fenster"
        if (symbol := sensor_eintragen(e.get("symbol"), art, eid, e.get("tuer"))) is not None:
            st.einstellung_setzen(("bereiche", bid, "symbol"), symbol)
            nr = next(i + 1 for i, x in enumerate(symbol["tueren" if art == "tuer" else "fenster"]) if x["sensor"] == eid)
            return None, f"als {'Tür' if art == 'tuer' else 'Fenster'} {nr} des Containers eingetragen"
    return None, None


async def async_zuordnen(hass: HomeAssistant, db: Any, roh: dict[str, Any], container_id: str, device_id: str,
                         typ: str | None = None, haengt: str | None = None) -> dict[str, Any]:
    """Ein HA-Gerät einem Container zuordnen (Inventar und, steht der Container auf einer geladenen Baustelle mit
    Bereich, die Verdrahtung dort). `LookupError`/`ValueError` bei falscher Angabe."""
    geraet = dr.async_get(hass).async_get(device_id)
    if not isinstance(geraet, dr.DeviceEntry):
        raise LookupError("HA-Gerät nicht gefunden")
    ents = _entitaeten(hass, geraet.id)
    typ = typ or typ_vorschlag(schalter=_schalter(ents) is not None, klassen=[_klasse(e) for e in ents])
    if typ is None:
        raise ValueError("Gerät taugt nicht als Ausrüstung (kein Schalter, Fühler oder Kontakt)")
    einsatz = _einsatz(roh, container_id)
    if not any(c["id"] == container_id and c.get("status") == "aktiv" for c in roh["container"]) or einsatz is None:
        raise LookupError("Container nicht gefunden oder ausgeschieden")
    # vorher prüfen – ein Fehler in der Transaktion würde den Zustand der Datenbank auf „fehler“ setzen
    a = next((x for x in roh["ausruestung"] if x.get("kennung") == _kennung(geraet)), None)
    if a is not None and a.get("status") == "defekt":
        raise ValueError("Ausrüstung ist defekt – nicht zuordenbar")
    if a is not None and any(e["ausruestung_id"] == a["id"] and not e.get("bis") and e["container_id"] != container_id
                             for e in roh["ausruestung_einsaetze"]):
        raise ValueError("Ausrüstung steckt schon in einem anderen Container – dort erst entfernen")
    st, geraet_id, text = _steuerung(hass, einsatz["baustelle_id"]), None, None
    if st is not None and einsatz.get("bereich_id") in st.bereiche:
        geraet_id, text = _verdrahten(hass, st, einsatz["bereich_id"], geraet, typ, haengt)
    ergebnis = await db.async_ausfuehren(lambda v: db_inventar.ausruestung_zuordnen(
        v, kennung=_kennung(geraet), typ=typ, modell=geraet.model, container_id=container_id, geraet_id=geraet_id,
        jetzt=dt_util.utcnow()))
    if ergebnis is None:
        raise ValueError(db.fehler or "Datenbank")
    if st is not None and text:
        st.protokoll("einstellung", einsatz.get("bereich_id"), f"Inventar: {geraet.name_by_user or geraet.name} {text}")
    return {**ergebnis, "typ": typ, "verdrahtet": text}


async def async_bestand(hass: HomeAssistant, db: Any, container_id: str, bereich_id: str, baustelle_id: str) -> list[dict[str, Any]]:
    """Beim Anlegen mit Bereich: was der Bereich schon hat (Shellys nach Namen, Fühler, Türen, Fenster) ins Inventar."""
    st = _steuerung(hass, baustelle_id)
    if st is None or bereich_id not in st.bereiche:
        return []
    geraete = dr.async_get(hass)
    eintraege: list[tuple[str, str, str | None]] = [(g.schalter, "PLUG", g.id) for g in sorted(st.geraete_in(bereich_id), key=lambda g: g.name)]
    for x in st.sensoren(bereich_id):   # BSM-034.03: die Sensorliste (Licht kommt nicht ins Inventar)
        if (typ := SENSOR_TYP.get(x.art)) is not None:
            eintraege.append((x.entity_id, typ, None))
    aus = []
    for eid, typ, geraet_id in eintraege:
        eintrag = er.async_get(hass).async_get(eid)
        geraet = geraete.async_get(eintrag.device_id) if eintrag is not None and eintrag.device_id else None
        if not isinstance(geraet, dr.DeviceEntry):
            continue
        r = await db.async_ausfuehren(lambda v, g=geraet, t=typ, gid=geraet_id: db_inventar.ausruestung_zuordnen(
            v, kennung=_kennung(g), typ=t, modell=g.model, container_id=container_id, geraet_id=gid, jetzt=dt_util.utcnow()))
        if r is not None:
            aus.append({**r, "typ": typ})
    return aus


def status_uebernehmen(hass: HomeAssistant, roh: dict[str, Any], aid: str, status: str) -> None:
    """Status aus dem Inventar ans Gerät (BSM-034.02: ein Feld, kern/geraete); das Inventar hat ihn schon."""
    e = next((x for x in roh["ausruestung_einsaetze"] if x["ausruestung_id"] == aid and not x.get("bis") and x.get("geraet_id")), None)
    einsatz = _einsatz(roh, e["container_id"]) if e is not None else None
    st = _steuerung(hass, einsatz["baustelle_id"]) if einsatz is not None else None
    if st is None or e is None or (g := st.geraete.get(e["geraet_id"])) is None:
        return
    st.geraet_status_setzen(g, status, ins_inventar=False)


async def async_verweise(hass: HomeAssistant, ids: dict[str, str]) -> list[dict[str, Any]]:
    """Eigene Automationen, Skripte und Dashboards, die eine alte Entity-ID nennen (HA passt sie nicht an, §6.2)."""
    if not ids:
        return []
    aus: list[dict[str, Any]] = []

    def name(eid: str) -> str:
        z = hass.states.get(eid)
        return str(z.attributes.get("friendly_name") or eid) if z is not None else eid

    for domain in ("automation", "script"):
        if domain not in hass.config.components:
            continue
        if domain == "automation":
            from homeassistant.components.automation import automations_with_entity as mit   # noqa: PLC0415
        else:
            from homeassistant.components.script import scripts_with_entity as mit   # noqa: PLC0415
        for alt, neu in ids.items():
            aus += [{"art": "Automation" if domain == "automation" else "Skript", "name": name(x), "alt": alt, "neu": neu}
                    for x in mit(hass, alt)]
    if "lovelace" in hass.config.components:
        from homeassistant.components.lovelace.const import LOVELACE_DATA   # noqa: PLC0415
        daten = hass.data.get(LOVELACE_DATA)
        for url, dashboard in (daten.dashboards.items() if daten is not None else []):
            try:
                text = json.dumps(await dashboard.async_load(False))
            except Exception:   # noqa: BLE001 – leeres oder kaputtes Dashboard: überspringen
                continue
            titel = (getattr(dashboard, "config", None) or {}).get("title") or url or "Übersicht"
            aus += [{"art": "Dashboard", "name": str(titel), "alt": alt, "neu": neu} for alt, neu in ids.items() if f'"{alt}"' in text]
    return aus
