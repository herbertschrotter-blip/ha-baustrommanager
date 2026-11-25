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
from typing import TYPE_CHECKING, Any

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
from .logik.inventar import HAENGT, SENSOR_TYP, kandidat_reihenfolge, sensor_verdrahtung, typ_vorschlag

if TYPE_CHECKING:
    from .steuerung import Steuerung

_LOGGER = logging.getLogger(__name__)
# M12: ein Kontakt kann Tür oder Fenster sein (die eine Typenliste des Assistenten) – gesucht wird zuerst die passende Klasse
KLASSE_FUER = {"TEMP": ("sensor", ("temperature",)), "DOOR": ("binary_sensor", ("door", "opening", "garage_door", "window")),
               "FEN": ("binary_sensor", ("window", "door", "opening"))}


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
    passend = sorted((e for e in ents if e.domain == domain and _klasse(e) in klassen), key=lambda e: klassen.index(_klasse(e)))
    return passend[0].entity_id if passend else None


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
    for geraet in dr.async_get(hass).devices:   # Iterieren liefert die Geräte (Zugriff als Mapping endet mit HA 2027.9)
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
                    "entity_id": haupt, "verwendet": belegt.get(haupt or ""),
                    "seit": geraet.created_at.isoformat() if getattr(geraet, "created_at", None) else None})   # M12: „neu seit …“
    return sorted(aus, key=lambda k: (k["typ"], str(k["name"])))


def assistent_kandidaten(hass: HomeAssistant, roh: dict[str, Any]) -> list[dict[str, Any]]:
    """Schritt 1 des Assistenten (Herberts Entscheidung B, 23.11.2026): jeder freie Schalter einzeln – je Kanal eine Zeile
    (z. B. der 2. Kanal eines Shelly 2PM), auch Schalter, die kein Shelly sind (`shelly` False: dann gibt es keinen
    Namen im Gerät selbst) –, dazu Fühler, Tür- und Fensterkontakte wie `kandidaten`. Frei = keine Baustelle verwendet
    den Schalter; ein Gerät verschwindet nicht, nur weil sein erster Kanal belegt ist. `roh` (Inventar) darf leer sein."""
    laufend = {e["ausruestung_id"] for e in roh.get("ausruestung_einsaetze") or [] if not e.get("bis")}
    je_kennung = {a.get("kennung"): a for a in roh.get("ausruestung") or [] if a.get("kennung")}
    belegt, aus = _belegt(hass), []
    for geraet in dr.async_get(hass).devices:   # Iterieren liefert die Geräte (Zugriff als Mapping endet mit HA 2027.9)
        if not isinstance(geraet, dr.DeviceEntry) or geraet.disabled or any(d == DOMAIN for d, _ in geraet.identifiers):
            continue
        ents = _entitaeten(hass, geraet.id)
        a = je_kennung.get(_kennung(geraet))
        basis = {"device_id": geraet.id, "name": geraet.name_by_user or geraet.name, "modell": geraet.model,
                 "ausruestung_id": a["id"] if a else None, "status": a["status"] if a else None,
                 "seit": geraet.created_at.isoformat() if getattr(geraet, "created_at", None) else None}
        # nur echte Schalter: Einstellungs- und Diagnose-Schalter (z. B. Kindersicherung, LED) und versteckte nicht
        schalter = [e for e in ents if e.domain == "switch" and e.entity_category is None and e.hidden_by is None]
        im_inventar = a is not None and a["id"] in laufend
        for e in schalter:
            if e.entity_id in belegt:
                continue
            aus.append({**basis, "key": e.entity_id, "schalter": e.entity_id, "entity_id": e.entity_id, "typ": "PLUG",
                        "shelly": e.platform == "shelly", "verwendet": None,
                        "kanal": (e.name or e.original_name or e.entity_id) if len(schalter) > 1 else None,
                        # ein Gerät steht nur in einem Container: ein weiterer Kanal geht nur in denselben
                        "hinweis": "anderer Kanal steckt schon im Inventar eines Containers – nur dorthin" if im_inventar else None})
        if schalter:
            continue
        typ = typ_vorschlag(schalter=False, klassen=[_klasse(e) for e in ents])
        haupt = _messwert(ents, typ) if typ in KLASSE_FUER else None
        if typ is None or (a is not None and a["id"] in laufend) or (haupt or "") in belegt:
            continue
        aus.append({**basis, "key": geraet.id, "schalter": None, "entity_id": haupt, "typ": typ, "shelly": False,
                    "verwendet": None, "kanal": None, "hinweis": None})
    return sorted(aus, key=kandidat_reihenfolge)


def _einsatz(roh: dict[str, Any], container_id: str) -> dict[str, Any] | None:
    return next((e for e in roh["einsaetze"] if e["container_id"] == container_id and not e.get("bis")), None)


def _steuerung(hass: HomeAssistant, baustelle_id: str | None) -> Steuerung | None:
    entry = hass.config_entries.async_get_entry(baustelle_id or "")
    return getattr(entry, "runtime_data", None) if entry is not None and entry.domain == DOMAIN else None


def sensor_plan(st: Steuerung, bid: str, typ: str, ents: list[er.RegistryEntry]) -> dict[str, Any] | None:
    """Was das Zuordnen eines Fühlers, Tür- oder Fensterkontakts im Bereich `bid` einträgt (logik `sensor_verdrahtung`)
    – für Zuordnen und Vorschau; None = nichts (z. B. Container hat schon einen Fühler)."""
    sub = st.entry.subentries.get(bid)
    if sub is None or sub.subentry_type != SUB_BEREICH:
        return None
    e = st.einstellungen.bereich(bid)
    return sensor_verdrahtung(typ, _messwert(ents, typ) if typ in KLASSE_FUER else None,
                              fuehler=sub.data.get(CONF_FUEHLER), tuer=e.get("tuer"), symbol=e.get("symbol"))


def _verdrahten(hass: HomeAssistant, st: Steuerung, bid: str, geraet: dr.DeviceEntry, typ: str, haengt: str | None,
                schalter: str | None = None) -> tuple[str | None, str | None]:
    """Gerät im Bereich `bid` einhängen; liefert (Unter-Eintrag des Shelly, Text was geschah). Fremde Baustelle → Fehler.
    `schalter`: dieser Kanal (Assistent, Entscheidung B), sonst der erste Shelly-Schalter des Geräts."""
    ents = _entitaeten(hass, geraet.id)
    if typ == "PLUG":
        schalter = schalter or _schalter(ents)
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
    plan = sensor_plan(st, bid, typ, ents)
    if plan is None:
        return None, None
    if plan["feld"] == "fuehler":
        sub = st.entry.subentries[bid]
        hass.config_entries.async_update_subentry(st.entry, sub, data={**sub.data, CONF_FUEHLER: plan["wert"]})
    else:
        st.einstellung_setzen(("bereiche", bid, plan["feld"]), plan["wert"])
    return None, plan["text"]


def zuordnen_pruefen(hass: HomeAssistant, roh: dict[str, Any], container_id: str, device_id: str, typ: str | None = None
                     ) -> tuple[dr.DeviceEntry, str, dict[str, Any]]:
    """Ob sich das HA-Gerät dem Container zuordnen lässt (vor Vorschau und Zuordnen): (Gerät, Typ, Einsatz) oder
    `LookupError`/`ValueError` – schreibt nichts."""
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
    return geraet, typ, einsatz


async def async_zuordnen(hass: HomeAssistant, db: Any, roh: dict[str, Any], container_id: str, device_id: str,
                         typ: str | None = None, haengt: str | None = None, *, schalter: str | None = None,
                         teilweise: bool = False) -> dict[str, Any]:
    """Ein HA-Gerät einem Container zuordnen (Inventar und, steht der Container auf einer geladenen Baustelle mit
    Bereich, die Verdrahtung dort). `LookupError`/`ValueError` bei falscher Angabe. `geraet_id` in der Antwort = der
    Unter-Eintrag des Shelly. Mit `teilweise` (Assistent, Gutachten 0.8.192) meldet ein Fehler der Datenbank nach dem
    Einhängen kein `ValueError`, sondern `fehler` in der Antwort – eingehängt ist es dann schon, im Inventar nicht."""
    geraet, typ, einsatz = zuordnen_pruefen(hass, roh, container_id, device_id, typ)
    st, geraet_id, text = _steuerung(hass, einsatz["baustelle_id"]), None, None
    if st is not None and einsatz.get("bereich_id") in st.bereiche:
        geraet_id, text = _verdrahten(hass, st, einsatz["bereich_id"], geraet, typ, haengt, schalter)
    ergebnis = await db.async_ausfuehren(lambda v: db_inventar.ausruestung_zuordnen(
        v, kennung=_kennung(geraet), typ=typ, modell=geraet.model, container_id=container_id, geraet_id=geraet_id,
        jetzt=dt_util.utcnow()))
    if ergebnis is None and teilweise and text:
        return {"id": None, "gg": None, "neu": False, "typ": typ, "verdrahtet": text, "geraet_id": geraet_id,
                "fehler": db.fehler or "Datenbank"}
    if ergebnis is None:
        raise ValueError(db.fehler or "Datenbank")
    if st is not None and text:
        st.protokoll("einstellung", einsatz.get("bereich_id"), f"Inventar: {geraet.name_by_user or geraet.name} {text}")
    return {**ergebnis, "typ": typ, "verdrahtet": text, "geraet_id": geraet_id}


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
