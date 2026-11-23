"""WebSocket-Befehle fürs Container-Inventar (BSM-031.05, docs/api-0.7.md §10, Bauplan Inventar).

`baustelle/inventar` liest (alle Benutzer), `baustelle/inventar_aendern` ändert (nur Admins). Die Daten liegen in der
Datenbank über allen Baustellen; Namen, Labels und Nummern kommen aus `logik/inventar.py`.
"""

from __future__ import annotations

from collections.abc import Awaitable, Callable
import functools
import logging
import time
from typing import Any

import voluptuous as vol

from homeassistant.components import websocket_api
from homeassistant.core import HomeAssistant
from homeassistant.helpers import device_registry as dr, entity_registry as er, label_registry as lr
from homeassistant.util import dt as dt_util

from .const import DOMAIN
from .db import DATA_DB
from .db import inventar as db_inventar
from .abgleich import nicht_in_ha
from .inventar_geraete import (
    _entitaeten, _schalter, async_bestand, async_verweise, async_zuordnen, kandidaten, sensor_plan, status_uebernehmen,
    zuordnen_pruefen,
)
from .logik.inventar import (
    AM_CONTAINER, CONTAINER_ARTEN, GERAETE, HAENGT, SENSOR_TYP, STATUS_AUSRUESTUNG, InventarFehler, abweichend,
    aufbereiten, firmenkuerzel_pruefen, mit_zuordnung, nicht_eingetragen, nummer_frei, praefix, vorschau,
)
from .logik.rechte import darf

_LOGGER = logging.getLogger(__name__)
DATA_NAMEN = f"{DOMAIN}_namen"   # Zwischenspeicher der Namen für `baustelle/struktur`: {"stand", "zeit", "namen", "gewarnt"}
NAMEN_GUELTIG = 60.0   # Sekunden; Änderungen am Inventar (Anlegen, Zuordnen, Umbenennen) verwerfen ihn sofort

AKTIONEN = ("container_anlegen", "container_status", "ausruestung_status", "firma_kuerzel", "ausruestung_zuordnen",
            "ausruestung_entfernen")


def _db(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]) -> Any:
    db = hass.data.get(DATA_DB)
    if db is None or not db.bereit:
        connection.send_error(msg["id"], "nicht_bereit", "Datenbank nicht erreichbar – das Inventar braucht sie")
        return None
    return db


def namen_verwerfen(hass: HomeAssistant) -> None:
    """Zwischenspeicher der Namen verwerfen (nach jeder Änderung am Inventar oder an den Namen)."""
    m = hass.data.setdefault(DATA_NAMEN, {"stand": 0})
    m["stand"] = m.get("stand", 0) + 1
    m.pop("zeit", None)


def verwirft_namen(func: Callable[..., Awaitable[None]]) -> Callable[..., Awaitable[None]]:
    """Für Befehle, die Inventar oder Namen ändern: danach (auch bei Fehler) den Zwischenspeicher verwerfen."""
    @functools.wraps(func)
    async def mit(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]) -> None:
        try:
            await func(hass, connection, msg)
        finally:
            namen_verwerfen(hass)
    return mit


@websocket_api.websocket_command({vol.Required("type"): "baustelle/inventar"})
@websocket_api.async_response
async def ws_inventar(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]) -> None:
    """Das ganze Inventar, aufbereitet (Namen, Labels, aktueller Einsatz, Geschichte, freie Ausrüstung)."""
    if (db := _db(hass, connection, msg)) is None:
        return
    roh = await db.async_ausfuehren(db_inventar.lesen)
    if roh is None:
        connection.send_error(msg["id"], "nicht_bereit", db.fehler or "Datenbank nicht lesbar")
        return
    aus = aufbereiten(roh)
    fremd = nicht_in_ha(hass, roh)   # BSM-034.04: im Inventar, aber HA ordnet es dem Bereich nicht (mehr) zu
    for c in aus["container"]:
        for a in c["ausruestung"]:
            a["nicht_in_ha"] = a["id"] in fremd
        c["nicht_in_ha"] = sum(1 for a in c["ausruestung"] if a["nicht_in_ha"])
    connection.send_result(msg["id"], {**aus, "aendern": bool(connection.user and connection.user.is_admin)})


@websocket_api.websocket_command({
    vol.Required("type"): "baustelle/inventar_aendern",
    vol.Required("aktion"): vol.In(AKTIONEN),
    vol.Optional("entry_id"): str,
    vol.Optional("art"): vol.In(list(CONTAINER_ARTEN)),
    vol.Optional("firma_kuerzel"): vol.Any(None, str),
    vol.Optional("bereich_id"): vol.Any(None, str),
    vol.Optional("container_id"): str,
    vol.Optional("ausruestung_id"): str,
    vol.Optional("firma_id"): str,
    vol.Optional("kuerzel"): str,
    vol.Optional("status"): vol.In(["aktiv", "ausgeschieden", *STATUS_AUSRUESTUNG]),
    vol.Optional("nr"): vol.All(int, vol.Range(min=1, max=999)),
    vol.Optional("device_id"): str,
    vol.Optional("typ"): vol.In(list(GERAETE)),
    vol.Optional("haengt"): vol.In(list(HAENGT)),
})
@websocket_api.async_response
@verwirft_namen
async def ws_inventar_aendern(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]) -> None:
    """Container anlegen (eigen oder fremd, optional mit Bereich – dann kommt dessen Ausrüstung mit – und eigener Nummer
    für den Bestand), Status setzen, Firmenkürzel, Ausrüstung zuordnen oder entfernen – nur Admins."""
    if not darf(bool(connection.user and connection.user.is_admin), "inventar_aendern"):
        connection.send_error(msg["id"], websocket_api.ERR_UNAUTHORIZED, "Nur Admins dürfen ändern")
        return
    if (db := _db(hass, connection, msg)) is None:
        return
    aktion, jetzt = msg["aktion"], dt_util.utcnow()
    try:   # Eingaben vorher prüfen – ein Fehler in der Transaktion würde den Zustand der Datenbank auf „fehler“ setzen
        for feld in ("firma_kuerzel", "kuerzel"):
            if msg.get(feld):
                msg[feld] = firmenkuerzel_pruefen(msg[feld])
        if aktion == "container_status" and msg.get("status") not in ("aktiv", "ausgeschieden"):
            raise InventarFehler("Container: Status aktiv oder ausgeschieden")
        if aktion == "ausruestung_status" and msg.get("status") not in STATUS_AUSRUESTUNG:
            raise InventarFehler(f"Ausrüstung: Status {', '.join(STATUS_AUSRUESTUNG)}")
        if aktion == "container_anlegen" and msg.get("nr"):
            if msg.get("firma_kuerzel"):
                raise InventarFehler("Eine feste Nummer gibt es nur für eigene Container")
            roh = await db.async_ausfuehren(db_inventar.lesen)
            nummer_frei(msg["nr"], [c.get("nr") for c in (roh or {}).get("container") or []])
    except InventarFehler as err:
        connection.send_error(msg["id"], websocket_api.ERR_INVALID_FORMAT, str(err))
        return

    def fehlt(*felder: str) -> bool:
        if all(msg.get(f) for f in felder):
            return False
        connection.send_error(msg["id"], websocket_api.ERR_INVALID_FORMAT, f"{aktion} braucht {', '.join(felder)}")
        return True

    if aktion == "container_anlegen":
        if fehlt("entry_id", "art"):
            return
        entry = hass.config_entries.async_get_entry(msg["entry_id"])
        if entry is None or entry.domain != DOMAIN:
            connection.send_error(msg["id"], websocket_api.ERR_NOT_FOUND, "Baustelle nicht gefunden")
            return

        def arbeit(v: Any) -> Any:
            return db_inventar.container_anlegen(v, art=msg["art"], baustelle_id=msg["entry_id"], instanz_id=db.instanz_id,
                                                 jetzt=jetzt, firma_kuerzel=msg.get("firma_kuerzel"),
                                                 bereich_id=msg.get("bereich_id"), nr=msg.get("nr"))
    elif aktion in ("ausruestung_zuordnen", "ausruestung_entfernen"):
        await _ausruestung(hass, connection, msg, db)
        return
    elif aktion == "container_status":
        if fehlt("container_id", "status"):
            return

        def arbeit(v: Any) -> Any:
            return db_inventar.container_status(v, msg["container_id"], msg["status"], jetzt)
    elif aktion == "ausruestung_status":
        if fehlt("ausruestung_id", "status"):
            return

        def arbeit(v: Any) -> Any:
            return db_inventar.ausruestung_status(v, msg["ausruestung_id"], msg["status"])
    else:   # firma_kuerzel
        if fehlt("entry_id", "firma_id", "kuerzel"):
            return

        def arbeit(v: Any) -> Any:
            return db_inventar.firma_kuerzel(v, msg["entry_id"], msg["firma_id"], msg["kuerzel"])

    ergebnis = await db.async_ausfuehren(arbeit)
    if ergebnis is None:
        connection.send_error(msg["id"], websocket_api.ERR_INVALID_FORMAT, db.fehler or "Datenbank")
        return
    if ergebnis is False:   # Container, Ausrüstung oder Firma gibt es nicht
        connection.send_error(msg["id"], websocket_api.ERR_NOT_FOUND, "nicht gefunden")
        return
    if aktion == "container_anlegen" and msg.get("bereich_id"):   # Bestand des Bereichs kommt mit (Shellys, Fühler, Tür)
        ergebnis["ausruestung"] = await async_bestand(hass, db, ergebnis["id"], msg["bereich_id"], msg["entry_id"])
    if aktion == "ausruestung_status" and (roh := await db.async_ausfuehren(db_inventar.lesen)) is not None:
        status_uebernehmen(hass, roh, msg["ausruestung_id"], msg["status"])   # BSM-031.08: verliehen/defekt = Automatik lässt aus
    connection.send_result(msg["id"], ergebnis if isinstance(ergebnis, dict) else {"ok": True})


async def _ausruestung(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any], db: Any) -> None:
    """Ausrüstung zuordnen (HA-Gerät → Container, mit Verdrahtung) bzw. entfernen (Einsatz endet, sie wird frei)."""
    if msg["aktion"] == "ausruestung_entfernen":
        if not msg.get("ausruestung_id"):
            connection.send_error(msg["id"], websocket_api.ERR_INVALID_FORMAT, "ausruestung_entfernen braucht ausruestung_id")
            return
        ok = await db.async_ausfuehren(lambda v: db_inventar.ausruestung_entfernen(v, msg["ausruestung_id"], dt_util.utcnow()))
        if not ok:
            connection.send_error(msg["id"], websocket_api.ERR_NOT_FOUND, db.fehler or "keine laufende Zuordnung")
            return
        connection.send_result(msg["id"], {"ok": True})
        return
    if not msg.get("container_id") or not msg.get("device_id"):
        connection.send_error(msg["id"], websocket_api.ERR_INVALID_FORMAT, "ausruestung_zuordnen braucht container_id, device_id")
        return
    roh = await db.async_ausfuehren(db_inventar.lesen)
    try:
        ergebnis = await async_zuordnen(hass, db, roh or {}, msg["container_id"], msg["device_id"], msg.get("typ"), msg.get("haengt"))
    except LookupError as err:
        connection.send_error(msg["id"], websocket_api.ERR_NOT_FOUND, str(err))
        return
    except ValueError as err:
        connection.send_error(msg["id"], websocket_api.ERR_INVALID_FORMAT, str(err))
        return
    connection.send_result(msg["id"], ergebnis)


@websocket_api.websocket_command({vol.Required("type"): "baustelle/inventar_kandidaten"})
@websocket_api.async_response
async def ws_inventar_kandidaten(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]) -> None:
    """HA-Geräte, die als Ausrüstung taugen und frei sind (Zuordnen-Dialog der Seite)."""
    if (db := _db(hass, connection, msg)) is None:
        return
    roh = await db.async_ausfuehren(db_inventar.lesen)
    connection.send_result(msg["id"], {"geraete": kandidaten(hass, roh or {})})


def _geraet(hass: HomeAssistant, entity_id: str | None) -> tuple[dict[str, Any] | None, list[dict[str, Any]], list[str]]:
    """HA-Gerät hinter einer Entität: ({id, name}, Entitäten des Geräts mit Klasse, Label-Namen). Eigene Entitäten der
    Integration (hängen am Shelly-Gerät, z. B. „Ø Leistung“) behalten ihre Namen und fehlen hier."""
    ents, devs, labs = er.async_get(hass), dr.async_get(hass), lr.async_get(hass)
    eintrag = ents.async_get(entity_id or "")
    geraet = devs.async_get(eintrag.device_id) if eintrag is not None and eintrag.device_id else None
    if geraet is None:
        return None, [], []
    entitaeten = [{"entity_id": e.entity_id, "name": e.name or e.original_name,
                   "klasse": e.device_class or e.original_device_class}
                  for e in er.async_entries_for_device(ents, geraet.id) if e.disabled_by is None and e.platform != DOMAIN]
    namen = [lab.name for i in geraet.labels if (lab := labs.async_get_label(i)) is not None]
    return {"id": geraet.id, "name": geraet.name_by_user or geraet.name, "original": geraet.name}, entitaeten, namen


def vorschau_eingabe(hass: HomeAssistant, roh: dict[str, Any], container_id: str) -> dict[str, Any] | None:
    """Ist-Zustand eines Containers aus HA für `logik.inventar.vorschau` (liest nur)."""
    c = next((x for x in roh["container"] if x["id"] == container_id), None)
    einsatz = next((e for e in roh["einsaetze"] if e["container_id"] == container_id and not e.get("bis")), None)
    if c is None or einsatz is None or not einsatz.get("bereich_id"):
        return None
    entry = hass.config_entries.async_get_entry(einsatz["baustelle_id"])
    st = getattr(entry, "runtime_data", None)
    if st is None or einsatz["bereich_id"] not in st.bereiche:
        return None
    bid = einsatz["bereich_id"]
    gg_vorher = {e["geraet_id"]: e["gg"] for e in roh["ausruestung_einsaetze"]
                 if e["container_id"] == container_id and not e.get("bis") and e.get("geraet_id") and e.get("gg")}
    geraete = sorted(st.geraete_in(bid), key=lambda g: (gg_vorher.get(g.id) is None, gg_vorher.get(g.id) or 0, g.name))
    plugs, naechstes = [], max(gg_vorher.values(), default=0)
    for g in geraete:
        if (gg := gg_vorher.get(g.id)) is None:
            naechstes += 1
            gg = naechstes
        geraet, entitaeten, namen = _geraet(hass, g.schalter)
        schalter = next((e for e in entitaeten if e["entity_id"] == g.schalter), None) or {"entity_id": g.schalter, "name": None}
        messwerte = [e for e in entitaeten if e["entity_id"] in (g.leistung, g.energie)]   # nur die, mit denen sie zählt
        plugs.append({"gg": gg, "gg_fest": g.id in gg_vorher, "geraet_id": g.id, "name": g.name, "rolle": g.rolle, "typ": g.typ, "geraet": geraet,
                      "schalter": schalter, "entitaeten": messwerte,
                      "plug_name": geraet["original"] if geraet else None, "labels": namen})
    sensoren = []
    for x in st.sensoren(bid):   # BSM-034.03: Fühler, Türen, Fenster (Licht nicht)
        if (typ := SENSOR_TYP.get(x.art)) is not None:
            geraet, entitaeten, namen = _geraet(hass, x.entity_id)
            sensoren.append({"typ": typ, "geraet": geraet, "entitaeten": entitaeten, "labels": namen})
    firma = next((f["name"] for f in roh["firmen"] if c.get("firma_kuerzel") and f.get("kuerzel") == c["firma_kuerzel"]), None)
    return {"art": c["art"], "firma": firma, "plugs": plugs, "sensoren": sensoren,
            "baustelle_id": einsatz["baustelle_id"], "bereich_id": bid,
            "praefix": praefix(nr=c.get("nr"), firma=c.get("firma_kuerzel"), fremd_nr=c.get("fremd_nr"))}


async def async_vorschau(hass: HomeAssistant, db: Any, container_id: str) -> tuple[dict[str, Any], dict[str, Any]] | None:
    """(Eingabe, Vorschau) eines Containers mit Bereich auf einer geladenen Baustelle, sonst None – auch fürs Ausführen."""
    roh = await db.async_ausfuehren(db_inventar.lesen)
    eingabe = vorschau_eingabe(hass, roh, container_id) if roh is not None else None
    if eingabe is None:
        return None
    return eingabe, vorschau(eingabe, _belegt(hass))


def _belegt(hass: HomeAssistant) -> set[str]:
    return set(er.async_get(hass).entities) | set(hass.states.async_entity_ids())


async def async_namen_gemerkt(hass: HomeAssistant, db: Any) -> dict[str, dict[str, Any]] | None:
    """`async_namen` für `baustelle/struktur`: höchstens alle 60 s neu (Datenbank und Vorschau je Container), sofort nach
    einer Änderung am Inventar. Scheitert es, None (kein Chip) und eine Warnung im Log – einmal, bis es wieder klappt;
    `baustelle/struktur` antwortet trotzdem."""
    if db is None or not db.bereit:
        return None
    m = hass.data.setdefault(DATA_NAMEN, {"stand": 0})
    jetzt, stand = time.monotonic(), m.get("stand", 0)
    if "zeit" in m and jetzt - m["zeit"] < NAMEN_GUELTIG:
        return m["namen"]
    try:
        namen = await async_namen(hass, db)
    except Exception:   # noqa: BLE001 – der Chip darf die Struktur nie mitreißen
        if not m.get("gewarnt"):
            _LOGGER.warning("Namen für den Chip „Namen ✓“ nicht ermittelt – Seite ohne Chip", exc_info=True)
        m["gewarnt"] = True
        namen = None
    else:
        m["gewarnt"] = False
    if m.get("stand", 0) == stand:   # während des Rechnens geändert → nicht merken
        m.update(zeit=jetzt, namen=namen)
    return namen


async def async_namen(hass: HomeAssistant, db: Any) -> dict[str, dict[str, Any]] | None:
    """Je Bereich (Container) der Stand der Namen für `baustelle/struktur` (Chip „Namen ✓“ / „⚠ n weichen ab“ /
    „Nicht im Inventar“): {bereich_id: {container_id, container, abweichend}}; `container_id` None = nicht im Inventar,
    `abweichend` None = Baustelle nicht geladen. None, wenn die Datenbank nicht bereit ist (dann kein Chip)."""
    if db is None or not db.bereit or (roh := await db.async_ausfuehren(db_inventar.lesen)) is None:
        return None
    aus: dict[str, dict[str, Any]] = {b["id"]: {"container_id": None, "container": None, "abweichend": None}
                                      for b in roh.get("bereiche_ohne") or []}
    namen = {c["id"]: c for c in aufbereiten(roh)["container"]}
    belegt = _belegt(hass)
    for e in roh.get("einsaetze") or []:
        if e.get("bis") or not e.get("bereich_id") or e["container_id"] not in namen:
            continue
        eingabe = vorschau_eingabe(hass, roh, e["container_id"])
        aus[e["bereich_id"]] = {"container_id": e["container_id"], "container": namen[e["container_id"]]["name"],
                                "abweichend": abweichend(vorschau(eingabe, belegt)["schritte"]) if eingabe else None}
    return aus


async def _vorschau_senden(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any],
                           v: dict[str, Any], **mehr: Any) -> None:
    ids = {s["alt"]: s["neu"] for s in v["schritte"] if s["ziel"] == "entitaet_id" and s["alt"] != s["neu"]}
    connection.send_result(msg["id"], {**v, "verweise": await async_verweise(hass, ids),
                                       "hinweis": "BTHome-Namen an den Plugs zieht die Kopplungspflege nach", **mehr})


@websocket_api.websocket_command({vol.Required("type"): "baustelle/inventar_vorschau", vol.Required("container_id"): str})
@websocket_api.async_response
async def ws_inventar_vorschau(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]) -> None:
    """Vorschau alt → neu für einen Container (BSM-031.06a) – ändert nichts."""
    if (db := _db(hass, connection, msg)) is None:
        return
    if (ergebnis := await async_vorschau(hass, db, msg["container_id"])) is None:
        connection.send_error(msg["id"], websocket_api.ERR_NOT_FOUND, "Container ohne Bereich auf einer geladenen Baustelle")
        return
    await _vorschau_senden(hass, connection, msg, ergebnis[1])


@websocket_api.websocket_command({
    vol.Required("type"): "baustelle/inventar_zuordnen_vorschau", vol.Required("container_id"): str,
    vol.Required("device_id"): str, vol.Optional("typ"): vol.In(list(GERAETE)), vol.Optional("haengt"): vol.In(list(HAENGT)),
})
@websocket_api.async_response
async def ws_inventar_zuordnen_vorschau(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]) -> None:
    """Vorschau der Namen, als wäre das HA-Gerät schon zugeordnet – ändert nichts (Zuordnen: erst Vorschau, dann nach
    Bestätigen `inventar_aendern` › `ausruestung_zuordnen` und `inventar_umbenennen`)."""
    if (db := _db(hass, connection, msg)) is None:
        return
    if (roh := await db.async_ausfuehren(db_inventar.lesen)) is None:
        connection.send_error(msg["id"], "nicht_bereit", db.fehler or "Datenbank nicht lesbar")
        return
    try:
        geraet, typ, _ = zuordnen_pruefen(hass, roh, msg["container_id"], msg["device_id"], msg.get("typ"))
    except LookupError as err:
        connection.send_error(msg["id"], websocket_api.ERR_NOT_FOUND, str(err))
        return
    except ValueError as err:
        connection.send_error(msg["id"], websocket_api.ERR_INVALID_FORMAT, str(err))
        return
    if (eingabe := vorschau_eingabe(hass, roh, msg["container_id"])) is None:
        connection.send_error(msg["id"], websocket_api.ERR_NOT_FOUND, "Container ohne Bereich auf einer geladenen Baustelle")
        return
    ents = _entitaeten(hass, geraet.id)
    eid = _schalter(ents) if typ == "PLUG" else next((e.entity_id for e in ents), None)
    info, entitaeten, labels_ = _geraet(hass, eid)
    if info is None:
        connection.send_error(msg["id"], websocket_api.ERR_NOT_FOUND, "HA-Gerät ohne Entität")
        return
    schalter = next((e for e in entitaeten if e["entity_id"] == eid), None) if typ == "PLUG" else None
    # dieselbe Regel wie das Zuordnen (`sensor_plan`): ein zweiter Fühler etc. kommt nur ins Inventar, nicht an den Container
    st = hass.config_entries.async_get_entry(eingabe["baustelle_id"]).runtime_data
    eingetragen = typ not in AM_CONTAINER or sensor_plan(st, eingabe["bereich_id"], typ, ents) is not None
    try:
        neu = mit_zuordnung(eingabe, typ=typ, geraet=info, entitaeten=entitaeten, labels_=labels_, schalter=schalter,
                            haengt=msg.get("haengt"), verdrahtet=eingetragen)
    except InventarFehler as err:
        connection.send_error(msg["id"], websocket_api.ERR_INVALID_FORMAT, str(err))
        return
    await _vorschau_senden(hass, connection, msg, vorschau(neu, _belegt(hass)),
                           zuordnen={"device_id": geraet.id, "typ": typ, "name": info["name"], "eingetragen": eingetragen,
                                     **({} if eingetragen else {"hinweis": nicht_eingetragen(typ)})})


BEFEHLE = (ws_inventar, ws_inventar_aendern, ws_inventar_vorschau, ws_inventar_zuordnen_vorschau, ws_inventar_kandidaten)
