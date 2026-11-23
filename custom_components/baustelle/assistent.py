"""Assistent „+ Gerät hinzufügen“ und „+ Container“ der Seite (UI-Bericht M12, Mockup ordnung.html, docs/api-0.7.md §12).

Gerät: Typenliste (`baustelle/geraet_typen`), Namensvorschau vor dem Schreiben (`baustelle/geraet_vorschau`), dann in
einem Schritt anlegen und umbenennen (`baustelle/geraet_hinzufuegen`: Verdrahtung in der Baustelle, Inventar, Umbenennen
nach dem Schema, Nennleistung, Primär) und direkt danach Rückgängig (`baustelle/geraet_hinzufuegen_rueckgaengig`).
Container: Vorschau von Name und Nummer (`baustelle/container_vorschau`), Anlegen von Bereich und Inventar-Container in
einem Schritt (`baustelle/container_neu`, Herberts Entscheidung 2). Regeln stehen in `logik/inventar.py`; schreiben dürfen
nur Admins. Geprüft wird alles, bevor etwas geschrieben wird; scheitert ein späterer Schritt, sagt die Antwort genau, was
schon geschehen ist (Umbenennen holt man unter „Namen in HA“ nach).
"""

from __future__ import annotations

import copy
import uuid
from datetime import datetime
from types import MappingProxyType
from typing import TYPE_CHECKING, Any

import voluptuous as vol
from homeassistant.components import websocket_api
from homeassistant.config_entries import ConfigSubentry
from homeassistant.const import CONF_NAME
from homeassistant.core import HomeAssistant
from homeassistant.helpers import device_registry as dr
from homeassistant.util import dt as dt_util

from .const import (
    ART_CONTAINER,
    ART_PUMPENSCHACHT,
    CONF_ART,
    CONF_BEREICH,
    CONF_FUEHLER,
    CONF_SCHALTER,
    DOMAIN,
    SUB_BEREICH,
    SUB_GERAET,
)
from .daten import struktur
from .db import DATA_DB, async_spiegeln, einstellung_merken
from .db import inventar as db_inventar
from .geraete import _geladen
from .inventar import verwirft_namen, zuordnen_vorschau
from .inventar_geraete import (
    _entitaeten,
    _kennung,
    _klasse,
    _schalter,
    _verdrahten,
    assistent_kandidaten,
    async_verweise,
    async_zuordnen,
    sensor_plan,
)
from .logik.inventar import (
    CONTAINER_ARTEN,
    InventarFehler,
    abweichend,
    assistent_typen,
    assistent_vorschlag,
    assistent_zuordnung,
    container_name,
    container_vorschau,
    firmenkuerzel_pruefen,
    frei_setzen,
    nicht_eingetragen,
    nur_geraet,
    typ_vorschlag,
    verweise_tauschen,
)
from .logik.rechte import darf
from .umbenennen import async_ausfuehren as async_umbenennen
from .umbenennen import async_rueckgaengig

if TYPE_CHECKING:
    from .steuerung import Steuerung

DATA_RUECK = f"{DOMAIN}_assistent_rueck"   # Rückgängig direkt nach dem Hinzufügen: Marke → was geschah (nur im Speicher)
RUECK_MAX = 20


def _admin(connection: websocket_api.ActiveConnection, msg: dict[str, Any], befehl: str) -> bool:
    if darf(bool(connection.user and connection.user.is_admin), befehl):
        return True
    connection.send_error(msg["id"], websocket_api.ERR_UNAUTHORIZED, "Nur Admins dürfen hinzufügen")
    return False


async def _neu_laden(hass: HomeAssistant, entry_id: str) -> Steuerung | None:
    """Baustelle einmal neu laden (nach Änderungen mit `neu_laden_folgt`) und die neue Steuerung liefern."""
    await hass.config_entries.async_reload(entry_id)
    entry = hass.config_entries.async_get_entry(entry_id)
    return getattr(entry, "runtime_data", None) if entry is not None else None


def _setzen(hass: HomeAssistant, st: Steuerung, pfad: tuple[str, ...], wert: Any, benutzer: str | None) -> None:
    """Einstellung (`bereiche.<bid>.<feld>` oder `geraete.<gid>.<feld>`) setzen, ohne auszuwerten (Steuerung angehalten,
    neu geladen wird danach)."""
    ziel = st.e.setdefault(pfad[0], {}).setdefault(pfad[1], {})
    ziel[pfad[2]] = wert
    einstellung_merken(hass, st.entry.entry_id, ".".join(pfad), wert, benutzer, quelle="assistent",
                       **({"bereich_id": pfad[1]} if pfad[0] == "bereiche" else {"geraet_id": pfad[1]}))
    st.einstellungen.speichern()


async def _roh(hass: HomeAssistant) -> tuple[Any, dict[str, Any] | None]:
    db = hass.data.get(DATA_DB)
    if db is None or not db.bereit:
        return None, None
    return db, await db.async_ausfuehren(db_inventar.lesen)


def _container_id(roh: dict[str, Any] | None, bid: str) -> str | None:
    """Inventar-Container des Bereichs (laufender Einsatz eines aktiven Containers), sonst None."""
    if not roh:
        return None
    aktiv = {c["id"] for c in roh.get("container") or [] if c.get("status") == "aktiv"}
    return next((e["container_id"] for e in roh.get("einsaetze") or []
                 if e.get("bereich_id") == bid and not e.get("bis") and e["container_id"] in aktiv), None)


def _wahl(hass: HomeAssistant, device_id: str, schalter: str | None) -> dict[str, Any]:
    """Das gewählte HA-Gerät und – bei einem Schalter – der gewählte Kanal (Entscheidung B: jeder freie `switch.*`,
    auch kein Shelly). Ohne `schalter` der erste Shelly-Schalter bzw. Fühler/Tür/Fenster des Geräts."""
    geraet = dr.async_get(hass).async_get(device_id)
    if not isinstance(geraet, dr.DeviceEntry):
        raise LookupError("HA-Gerät nicht gefunden")
    ents = _entitaeten(hass, geraet.id)
    name = geraet.name_by_user or geraet.name or device_id
    if schalter:
        e = next((x for x in ents if x.entity_id == schalter and x.domain == "switch"), None)
        if e is None:
            raise LookupError("Diesen Schalter hat das HA-Gerät nicht (mehr)")
        return {"geraet": geraet, "typ": "PLUG", "schalter": schalter, "shelly": e.platform == "shelly", "name": name}
    erster = _schalter(ents)
    return {"geraet": geraet, "typ": typ_vorschlag(schalter=erster is not None, klassen=[_klasse(e) for e in ents]),
            "schalter": erster, "shelly": erster is not None, "name": name}


def _typen(hass: HomeAssistant, st: Steuerung, bid: str, msg: dict[str, Any]) -> tuple[dict[str, Any], list[dict[str, Any]]]:
    if bid not in st.bereiche:
        raise LookupError("Container nicht gefunden")
    w = _wahl(hass, msg["device_id"], msg.get("schalter"))
    return w, assistent_typen(w["typ"], schacht=st.bereiche[bid].art == ART_PUMPENSCHACHT, geraet=w["name"])


def _typ(typen: list[dict[str, Any]], k: str) -> dict[str, Any]:
    t = next((x for x in typen if x["k"] == k), None)
    if t is None or not t["passt"]:
        raise InventarFehler(t["grund"] if t else f"Typ {k!r} unbekannt")
    return t


def _anderer_kanal(st: Steuerung, roh: dict[str, Any], cid: str, w: dict[str, Any]) -> bool:
    """Steht das HA-Gerät schon mit einem anderen Kanal in diesem Container im Inventar (z. B. 1. Kanal eines Shelly 2PM)?
    Das Inventar führt ein Gerät nur einmal – der neue Kanal wird dann nur eingehängt, Inventar und Namen bleiben."""
    if w["typ"] != "PLUG":
        return False
    a = next((x for x in roh.get("ausruestung") or [] if x.get("kennung") == _kennung(w["geraet"])), None)
    e = next((x for x in roh.get("ausruestung_einsaetze") or [] if a and x["ausruestung_id"] == a["id"] and not x.get("bis")), None)
    g = st.geraete.get((e or {}).get("geraet_id") or "")
    return e is not None and e["container_id"] == cid and g is not None and g.schalter != w["schalter"]


def _refs(w: dict[str, Any]) -> set[str]:
    """Woran die Schritte des neuen Geräts hängen (`logik.inventar.nur_geraet`): Plug am Schalter, sonst das HA-Gerät."""
    return {w["schalter"]} if w["typ"] == "PLUG" and w["schalter"] else {w["geraet"].id}


def _plan(hass: HomeAssistant, st: Steuerung, bid: str, w: dict[str, Any], inv_typ: str, haengt: str | None,
          db: Any, roh: dict[str, Any] | None, name: str | None) -> dict[str, Any]:
    """Was das Hinzufügen tut – für Vorschau und Hinzufügen dieselbe Rechnung, schreibt nichts. `inventar`: ins Inventar
    zuordnen; `eingetragen`: am Container eingehängt (Unter-Eintrag bzw. Fühler/Tür/Fenster); `umbenennen`: die Schritte
    des neuen Geräts (nur sie, Entscheidung A) ausführen."""
    cid = _container_id(roh, bid)
    leer = {"cid": cid, "im_inventar": False, "inventar": False, "umbenennen": False, "frei_moeglich": False, "container": None,
            "schritte": [], "konflikte": {}, "zaehler": {}}
    if cid is None or roh is None:
        eingetragen = inv_typ == "PLUG" or sensor_plan(st, bid, inv_typ, _entitaeten(hass, w["geraet"].id)) is not None
        schacht = st.bereiche[bid].art == ART_PUMPENSCHACHT
        hinweis = ("Pumpenschächte stehen nicht im Inventar – die Namen bleiben, wie sie sind" if schacht else
                   "Der Container steht nicht im Inventar – die Namen bleiben; erst aufnehmen, dann einheitlich benennen"
                   if db is not None else "Datenbank nicht erreichbar – die Namen bleiben, wie sie sind")
        if not eingetragen:   # Gutachten 0.8.192: dieselbe Regel wie beim Hinzufügen (`sensor_verdrahtung`)
            hinweis = nicht_eingetragen(inv_typ).split(" – ", 1)[0] + " – ohne Inventar gibt es nichts einzutragen"
        return {**leer, "eingetragen": eingetragen, "moeglich": eingetragen, "hinweis": hinweis}
    container = next((c for c in roh.get("container") or [] if c["id"] == cid), {})
    try:
        cname: str | None = container_name(container["art"], nr=container.get("nr"), firma=container.get("firma_kuerzel"),
                                           fremd_nr=container.get("fremd_nr"))
    except (InventarFehler, KeyError):
        cname = None
    if _anderer_kanal(st, roh, cid, w):
        return {**leer, "im_inventar": True, "container": cname, "eingetragen": True, "moeglich": True,
                "hinweis": "Ein weiterer Kanal eines Geräts, das schon in diesem Container im Inventar steht – er wird "
                           "eingehängt, Inventar und Namen bleiben"}
    v, zu = zuordnen_vorschau(hass, roh, cid, w["geraet"].id, inv_typ, haengt, schalter=w["schalter"])
    eigen = nur_geraet(v, _refs(w))
    if zu["eingetragen"]:
        eigen["schritte"] = frei_setzen(eigen["schritte"], w["geraet"].id, name)
    # eigener Name nur, wo das neue Gerät einen eigenen Gerätenamen-Schritt hat (nicht beim geteilten HA-Gerät)
    frei_moeglich = zu["eingetragen"] and any(x["ziel"] == "geraet" and x["ref"] == w["geraet"].id for x in eigen["schritte"])
    return {**leer, **eigen, "im_inventar": True, "inventar": True, "umbenennen": zu["eingetragen"], "container": cname,
            "eingetragen": zu["eingetragen"], "moeglich": True, "frei_moeglich": frei_moeglich, "hinweis": zu.get("hinweis")}


SCHEMA_GERAET = {vol.Required("entry_id"): str, vol.Required("bereich_id"): str, vol.Required("device_id"): str,
                 vol.Optional("schalter"): vol.Any(None, str)}


@websocket_api.websocket_command({vol.Required("type"): "baustelle/geraet_kandidaten"})
@websocket_api.async_response
async def ws_geraet_kandidaten(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]) -> None:
    """Schritt 1: jeder freie Schalter einzeln (je Kanal), Shellys oben, dazu Fühler, Türen, Fenster – alle Benutzer;
    geht auch ohne Datenbank (dann ohne Status aus dem Inventar)."""
    _db_, roh = await _roh(hass)
    connection.send_result(msg["id"], {"geraete": assistent_kandidaten(hass, roh or {})})


@websocket_api.websocket_command({vol.Required("type"): "baustelle/geraet_typen", **SCHEMA_GERAET})
@websocket_api.async_response
async def ws_geraet_typen(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]) -> None:
    """Schritt 3 „Was hängt dran?“: die eine Typenliste, nicht passende mit Grund, und die Vorbelegung (alle Benutzer)."""
    st = await _geladen(hass, msg["entry_id"])
    if st is None:
        connection.send_error(msg["id"], websocket_api.ERR_NOT_FOUND, "Baustelle nicht gefunden oder nicht geladen")
        return
    try:
        w, typen = _typen(hass, st, msg["bereich_id"], msg)
    except LookupError as err:
        connection.send_error(msg["id"], websocket_api.ERR_NOT_FOUND, str(err))
        return
    connection.send_result(msg["id"], {"typen": typen, "vorschlag": assistent_vorschlag(typen),
                                       "geraet": {"name": w["name"], "typ": w["typ"], "shelly": w["shelly"]}})


@websocket_api.websocket_command({vol.Required("type"): "baustelle/geraet_vorschau", **SCHEMA_GERAET,
                                  vol.Required("typ"): str, vol.Optional("name"): vol.Any(None, str)})
@websocket_api.async_response
async def ws_geraet_vorschau(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]) -> None:
    """Schritt 4: so heißt das neue Gerät danach (alt → neu, nur seine Schritte – Entscheidung A), noch ohne zu
    schreiben; `name` = eigener Name statt Schema (nur der Gerätename, markiert als `frei`). Ohne Inventar-Container
    (Schacht, nicht aufgenommen) bleiben die Namen."""
    st = await _geladen(hass, msg["entry_id"])
    if st is None:
        connection.send_error(msg["id"], websocket_api.ERR_NOT_FOUND, "Baustelle nicht gefunden oder nicht geladen")
        return
    try:
        w, typen = _typen(hass, st, msg["bereich_id"], msg)
        inv_typ, haengt = assistent_zuordnung(_typ(typen, msg["typ"])["k"])
        db, roh = await _roh(hass)
        plan = _plan(hass, st, msg["bereich_id"], w, inv_typ, haengt, db, roh, msg.get("name"))
    except LookupError as err:
        connection.send_error(msg["id"], websocket_api.ERR_NOT_FOUND, str(err))
        return
    except ValueError as err:   # auch InventarFehler
        connection.send_error(msg["id"], websocket_api.ERR_INVALID_FORMAT, str(err))
        return
    schritte = plan["schritte"]
    ids = {x["alt"]: x["neu"] for x in schritte if x["ziel"] == "entitaet_id" and x["alt"] != x["neu"]}
    connection.send_result(msg["id"], {
        "im_inventar": plan["im_inventar"], "container": plan["container"], "schritte": schritte,
        "konflikte": plan["konflikte"], "zaehler": plan["zaehler"], "abweichend": abweichend(schritte),
        "verweise": await async_verweise(hass, ids), "eingetragen": plan["eingetragen"], "umbenennen": plan["umbenennen"],
        "hinweis": plan["hinweis"], "shelly": w["shelly"], "moeglich": plan["moeglich"], "frei_moeglich": plan["frei_moeglich"],
        "frei": bool((msg.get("name") or "").strip()) and plan["frei_moeglich"]})


def _vorher(hass: HomeAssistant, st: Steuerung, bid: str, w: dict[str, Any], inv_typ: str) -> dict[str, Any]:
    """Was das Hinzufügen gleich ändert, im Zustand vorher (für Rückgängig)."""
    aus: dict[str, Any] = {}
    if inv_typ == "PLUG":
        sub = next((x for x in st.entry.subentries.values()
                    if x.subentry_type == SUB_GERAET and x.data.get(CONF_SCHALTER) == w["schalter"]), None)
        aus.update(schalter=w["schalter"], alt_sub={"id": sub.subentry_id, "data": dict(sub.data), "title": sub.title} if sub else None)
        return aus
    plan = sensor_plan(st, bid, inv_typ, _entitaeten(hass, w["geraet"].id))
    if plan is not None:
        alt = st.entry.subentries[bid].data.get(CONF_FUEHLER) if plan["feld"] == "fuehler" \
            else copy.deepcopy(st.einstellungen.bereich(bid).get(plan["feld"]))
        aus["sensor"] = {"feld": plan["feld"], "wert": plan["wert"], "alt": alt}
    return aus


def _rueck_merken(hass: HomeAssistant, daten: dict[str, Any]) -> str:
    marke = uuid.uuid4().hex
    speicher: dict[str, Any] = hass.data.setdefault(DATA_RUECK, {})
    speicher[marke] = daten
    for alt in list(speicher)[:-RUECK_MAX]:
        speicher.pop(alt, None)
    return marke


def _einstellungen(hass: HomeAssistant, st: Steuerung, bid: str, gid: str, t: dict[str, Any], msg: dict[str, Any],
                   benutzer: str | None) -> dict[str, list[Any]]:
    """Nennleistung und Rolle (Primär setzt `bereiche.<bid>.primaer`, Zusatz `geraete.<gid>.zusatz`, Gutachten 0.8.192)
    – nur Heizkörper. Liefert {Pfad: [vorher, gesetzt]} für Rückgängig."""
    gesetzt: dict[str, list[Any]] = {}
    eg = (st.e.get("geraete") or {}).get(gid, {})

    def setze(pfad: tuple[str, ...], alt: Any, wert: Any) -> None:
        if alt != wert:
            st.e.setdefault(pfad[0], {}).setdefault(pfad[1], {})
            st.einstellung_setzen(pfad, wert)
            einstellung_merken(hass, st.entry.entry_id, ".".join(pfad), wert, benutzer, quelle="assistent",
                               **({"bereich_id": pfad[1]} if pfad[0] == "bereiche" else {"geraet_id": pfad[1]}))
            gesetzt[".".join(pfad)] = [alt, wert]

    if t["nenn"] and msg.get("nenn_kw"):
        setze(("geraete", gid, "nenn_kw"), eg.get("nenn_kw"), round(float(msg["nenn_kw"]), 1))
    if t["rolle"]:
        primaer = (msg.get("rolle") or "zusatz") == "primaer"
        if primaer:
            setze(("bereiche", bid, "primaer"), st.einstellungen.bereich(bid).get("primaer"), gid)
        setze(("geraete", gid, "zusatz"), eg.get("zusatz"), None if primaer and eg.get("zusatz") is None else not primaer)
    return gesetzt


@websocket_api.websocket_command({vol.Required("type"): "baustelle/geraet_hinzufuegen", **SCHEMA_GERAET,
                                  vol.Required("typ"): str, vol.Optional("name"): vol.Any(None, str),
                                  vol.Optional("nenn_kw"): vol.Any(None, vol.All(vol.Coerce(float), vol.Range(0.1, 10))),
                                  vol.Optional("rolle"): vol.In(["primaer", "zusatz"]),
                                  vol.Optional("umbenennen", default=True): bool})
@websocket_api.async_response
@verwirft_namen
async def ws_geraet_hinzufuegen(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]) -> None:
    """Schritt 5 „Anlegen und umbenennen“ in einem: einhängen (Unter-Eintrag bzw. Fühler/Tür am Container), ins Inventar,
    Nennleistung und Rolle, umbenennen nach dem Schema – nur das neue Gerät (Entscheidung A), mit eigenem Gerätenamen;
    `umbenennen` False = „Nur anlegen, Namen lassen“. Nur Admins. Antwort mit Marke für Rückgängig; was nicht ging,
    steht in `umbenannt.fehler` (eingehängt ist es dann schon)."""
    if not _admin(connection, msg, "geraet_hinzufuegen"):
        return
    entry_id, bid, device_id = msg["entry_id"], msg["bereich_id"], msg["device_id"]
    benutzer = connection.user.name if connection.user else None
    st = await _geladen(hass, entry_id)
    if st is None:
        connection.send_error(msg["id"], websocket_api.ERR_NOT_FOUND, "Baustelle nicht gefunden oder nicht geladen")
        return
    frei = (msg.get("name") or "").strip() or None if msg["umbenennen"] else None
    try:   # alles prüfen, bevor etwas geschrieben wird – auch die Konflikte der Vorschau (Gutachten 0.8.192)
        w, typen = _typen(hass, st, bid, msg)
        t = _typ(typen, msg["typ"])
        inv_typ, haengt = assistent_zuordnung(t["k"])
        db, roh = await _roh(hass)
        plan = _plan(hass, st, bid, w, inv_typ, haengt, db, roh, frei)
        if not plan["moeglich"]:
            raise InventarFehler(plan["hinweis"])
        if plan["konflikte"] and msg["umbenennen"]:
            raise InventarFehler("Entity-ID schon vergeben: " + ", ".join(f"{a} → {n}" for a, n in plan["konflikte"].items())
                                 + " – erst lösen (umbenennen oder löschen) oder „Nur anlegen, Namen lassen“")
        vorher = _vorher(hass, st, bid, w, inv_typ)
        if not plan["frei_moeglich"]:
            frei = None   # eigener Name nur mit seinem Schritt – nie ein Gerät überschreiben, das mehr trägt (Entscheidung A)
    except LookupError as err:
        connection.send_error(msg["id"], websocket_api.ERR_NOT_FOUND, str(err))
        return
    except ValueError as err:
        connection.send_error(msg["id"], websocket_api.ERR_INVALID_FORMAT, str(err))
        return

    cid, geraet = plan["cid"], w["geraet"]
    rueck: dict[str, Any] = {"entry_id": entry_id, "bereich_id": bid, "device_id": device_id, "container_id": cid,
                             "inv_typ": inv_typ, "ausruestung_id": None, "umbenennung_id": None, "geraet_id": None,
                             "gesetzt": {}, "getauscht": {}, **vorher}
    db_fehler: str | None = None
    st.neu_laden_folgt = True   # ein Neu-Laden nach dem Einhängen statt je Unter-Eintrag (wie Umbenennen)
    try:   # 1. einhängen (und ins Inventar)
        if plan["inventar"]:
            z = await async_zuordnen(hass, db, roh or {}, str(cid), device_id, inv_typ, haengt, schalter=w["schalter"], teilweise=True)
            rueck["ausruestung_id"] = z["id"] if z.get("neu") else None
            rueck["geraet_id"] = z.get("geraet_id")
            db_fehler = z.get("fehler")
        else:
            rueck["geraet_id"], _text = _verdrahten(hass, st, bid, geraet, inv_typ, haengt, w["schalter"])
    except (LookupError, ValueError) as err:
        st.neu_laden_folgt = False
        connection.send_error(msg["id"], websocket_api.ERR_INVALID_FORMAT, f"Nicht hinzugefügt: {err}")
        return
    marke = _rueck_merken(hass, rueck)
    name = w["name"]
    if (st := await _neu_laden(hass, entry_id)) is None or bid not in st.bereiche:
        connection.send_result(msg["id"], {"ok": True, "name": name, "rueck": marke, "umbenannt": {
            "fehler": "eingehängt, aber die Baustelle lädt nicht – Namen bitte unter 🏷 Namen in HA prüfen"}})
        return
    # 2. Nennleistung und Rolle (nur Heizkörper; das Gerät ist sein Unter-Eintrag)
    gid = rueck["geraet_id"] if rueck["geraet_id"] in st.geraete else None
    if gid:
        rueck["gesetzt"] = _einstellungen(hass, st, bid, gid, t, msg, benutzer)
    container = st.bereiche[bid].name
    # 3. umbenennen nach dem Schema – nur die Schritte des neuen Geräts, mit eigenem Gerätenamen (Entscheidung A)
    umbenannt: dict[str, Any] = {"status": "ohne_inventar" if cid is None else "nur_inventar" if plan["inventar"] else "eingehaengt"}
    if db_fehler:   # Gutachten 0.8.192: ehrlich sagen, was geschah
        umbenannt = {"status": "ohne_inventar", "fehler": f"eingehängt, aber nicht ins Inventar ({db_fehler}) – die Namen "
                     "bleiben; aufnehmen später über den Chip am Container"}
    elif not msg["umbenennen"]:
        umbenannt = {"status": "namen_gelassen"}
    elif plan["umbenennen"]:
        refs = _refs(w)

        def auswahl(v: dict[str, Any]) -> dict[str, Any]:   # nur das neue Gerät, mit eigenem Gerätenamen
            eigen = nur_geraet(v, refs)
            return {**eigen, "schritte": frei_setzen(eigen["schritte"], device_id, frei)}

        try:
            u = await async_umbenennen(hass, db, str(cid), benutzer, neu_laden=False, auswahl=auswahl)
            rueck["umbenennung_id"], rueck["getauscht"] = u.get("id"), u.get("getauscht", {})
            umbenannt = {"status": u["status"], "anzahl": sum(1 for x in u["schritte"] if x.get("ergebnis") == "ok"),
                         "offen": sum(1 for x in u["schritte"] if x.get("ergebnis") == "fehler"), "getauscht": u.get("getauscht", {})}
            if not any(x["ziel"] == "geraet" and x["ref"] == device_id and x.get("ergebnis") == "ok" for x in u["schritte"]):
                frei = None   # der eigene Name kam nicht an – nicht behaupten
        except (LookupError, ValueError) as err:
            umbenannt = {"fehler": f"hinzugefügt, aber nicht umbenannt: {err} – unter 🏷 Namen in HA nachholen"}
            frei = None
        finally:
            if st.neu_laden_folgt:   # Umbenennen hat angehalten – einmal neu laden
                await _neu_laden(hass, entry_id)
    if (st_neu := hass.config_entries.async_get_entry(entry_id)) is not None and getattr(st_neu, "runtime_data", None) is not None:
        st_neu.runtime_data.protokoll("einstellung", bid, f"{frei or name} hinzugefügt ({t['text'].split(' ', 1)[-1]})"
                                      + (" – eigener Name, weicht vom Schema ab" if frei else ""))
    connection.send_result(msg["id"], {"ok": True, "name": frei or name, "typ": t["text"], "container": container,
                                       "frei": frei, "umbenannt": umbenannt, "rueck": marke})


def _unveraendert(jetzt: Any, gesetzt: Any, getauscht: dict[str, str]) -> bool:
    """Steht noch, was das Hinzufügen gesetzt hat (auch mit den Entity-IDs nach dem Umbenennen)?"""
    return jetzt == gesetzt or jetzt == verweise_tauschen(copy.deepcopy(gesetzt), getauscht)


@websocket_api.websocket_command({vol.Required("type"): "baustelle/geraet_hinzufuegen_rueckgaengig", vol.Required("rueck"): str})
@websocket_api.async_response
@verwirft_namen
async def ws_geraet_hinzufuegen_rueckgaengig(hass: HomeAssistant, connection: websocket_api.ActiveConnection,
                                             msg: dict[str, Any]) -> None:
    """Das eben Hinzugefügte zurücknehmen: Umbenennung zurück, Gerät aus dem Container (Unter-Eintrag bzw. Fühler/Tür
    wie vorher), Inventar-Einsatz beendet, Gerätename, Nennleistung, Rolle – nur direkt danach (Marke im Speicher), nur
    Admins. Zurückgesetzt wird nur, was seit dem Hinzufügen niemand geändert hat; der Rest steht in `fehler`.
    `getauscht` {alt: neu} der Entity-IDs, die das Zurücknehmen getauscht hat (für offene Entwürfe der Seite)."""
    if not _admin(connection, msg, "geraet_hinzufuegen"):
        return
    speicher: dict[str, Any] = hass.data.get(DATA_RUECK, {})
    r = speicher.pop(msg["rueck"], None)   # sofort nehmen – zwei gleichzeitige Rückgängig laufen nie beide
    if r is None:
        connection.send_error(msg["id"], websocket_api.ERR_NOT_FOUND, "Rückgängig geht nur direkt nach dem Hinzufügen")
        return
    benutzer = connection.user.name if connection.user else None
    fehler: list[str] = []
    bid, db = r["bereich_id"], hass.data.get(DATA_DB)
    st = await _geladen(hass, r["entry_id"])
    if st is None or bid not in st.bereiche:   # die Marke kommt zurück – später nochmal versuchen (Gutachten 0.8.192)
        speicher[msg["rueck"]] = r
        connection.send_error(msg["id"], websocket_api.ERR_NOT_FOUND, "Baustelle nicht geladen – nichts zurückgenommen")
        return
    entry, vor = st.entry, dict(r.get("getauscht") or {})
    zurueck: dict[str, str] = {}
    st.neu_laden_folgt = True   # alles zurück, dann einmal neu laden
    try:
        if r.get("umbenennung_id") and db is not None and db.bereit:
            letzte = await db.async_ausfuehren(lambda v: db_inventar.umbenennung_letzte(v, r["container_id"]))
            if letzte is not None and letzte["id"] == r["umbenennung_id"]:
                try:
                    zurueck = (await async_rueckgaengig(hass, db, r["container_id"], benutzer, neu_laden=False)).get("getauscht", {})
                except (LookupError, ValueError) as err:
                    fehler.append(f"Namen: {err}")
            else:
                fehler.append("Namen: inzwischen wieder umbenannt – bitte unter 🏷 Namen in HA prüfen")
        vor = {a: n for a, n in vor.items() if zurueck.get(n) != a}   # was jetzt noch umbenannt ist
        gid, entfernt = r.get("geraet_id"), False
        if r["inv_typ"] == "PLUG":
            sub = entry.subentries.get(gid or "")
            if r.get("alt_sub") is None:
                if sub is not None and sub.data.get(CONF_BEREICH) == bid:
                    hass.config_entries.async_remove_subentry(entry, sub.subentry_id)
                    entfernt = True
                    if db is not None and db.bereit:
                        await db.async_ausfuehren(lambda v: db_inventar.geraet_entfernt(v, sub.subentry_id, dt_util.utcnow()))
                elif sub is not None:
                    fehler.append("Gerät: inzwischen in einem anderen Container – bleibt dort")
            elif sub is not None and sub.data.get(CONF_BEREICH) == bid:
                data = {**r["alt_sub"]["data"], CONF_SCHALTER: sub.data.get(CONF_SCHALTER)}   # Schalter: wie er jetzt heißt
                hass.config_entries.async_update_subentry(entry, sub, data=data, title=r["alt_sub"]["title"])
            elif sub is not None:
                fehler.append("Gerät: inzwischen in einem anderen Container – bleibt dort")
        elif (s := r.get("sensor")) is not None:
            if s["feld"] == "fuehler" and (sub := entry.subentries.get(bid)) is not None:
                if _unveraendert(sub.data.get(CONF_FUEHLER), s["wert"], vor):
                    data = {k: x for k, x in sub.data.items() if k != CONF_FUEHLER}
                    hass.config_entries.async_update_subentry(entry, sub, data={**data, **({CONF_FUEHLER: s["alt"]} if s["alt"] else {})})
                else:
                    fehler.append("Fühler: inzwischen geändert – bleibt")
            elif s["feld"] != "fuehler":
                if _unveraendert(st.einstellungen.bereich(bid).get(s["feld"]), s["wert"], vor):
                    _setzen(hass, st, ("bereiche", bid, s["feld"]), s["alt"], benutzer)
                else:
                    fehler.append(f"{'Tür' if s['feld'] == 'tuer' else 'Aussehen'}: inzwischen geändert – bleibt")
        # der Inventar-Einsatz, den das Hinzufügen begann, endet immer (Plug entfernt: schon über geraet_entfernt)
        if r.get("ausruestung_id") and not entfernt and db is not None and db.bereit:
            await db.async_ausfuehren(lambda v: db_inventar.ausruestung_entfernen(v, r["ausruestung_id"], dt_util.utcnow()))
        for pfad, (alt, gesetzt) in (r.get("gesetzt") or {}).items():   # Nennleistung, Rolle
            teile = tuple(pfad.split("."))
            if teile[0] == "geraete" and teile[1] not in entry.subentries:
                continue   # Gerät entfernt – seine Einstellungen räumt das Laden auf
            jetzt = (st.e.get(teile[0]) or {}).get(teile[1], {}).get(teile[2])
            if jetzt == gesetzt:
                _setzen(hass, st, teile, alt, benutzer)
            else:
                fehler.append(f"{ {'nenn_kw': 'Nennleistung', 'zusatz': 'Rolle', 'primaer': 'Primär'}.get(teile[2], teile[2])}: "
                              "inzwischen geändert – bleibt")
    finally:
        await st.einstellungen.async_jetzt_speichern()
        st = await _neu_laden(hass, r["entry_id"])
    if st is not None:
        st.protokoll("einstellung", bid, "Hinzufügen zurückgenommen" + (f" ({'; '.join(fehler)})" if fehler else ""))
    connection.send_result(msg["id"], {"ok": not fehler, "fehler": fehler, "getauscht": zurueck})


# ---------------------------------------------------------------------- „+ Container“
SCHEMA_CONTAINER = {vol.Required("entry_id"): str, vol.Optional("schacht", default=False): bool,
                    vol.Optional("eigen", default=True): bool, vol.Optional("art"): vol.Any(None, vol.In(list(CONTAINER_ARTEN))),
                    vol.Optional("nr"): vol.Any(None, vol.All(int, vol.Range(min=1, max=999))),
                    vol.Optional("firma_id"): vol.Any(None, str), vol.Optional("kuerzel"): vol.Any(None, str),
                    vol.Optional("ohne_inventar", default=False): bool}


def _container_plan(st: Steuerung | None, roh: dict[str, Any] | None, msg: dict[str, Any]) -> tuple[dict[str, Any], dict[str, Any] | None]:
    """(Vorschau, Firma) aus `logik.container_vorschau` mit den Nummern der Datenbank; `InventarFehler` bei falscher Angabe.
    Ohne Inventar (`ohne_inventar`, Gutachten 0.8.192: z. B. Datenbank nicht erreichbar) nur der Bereich – eine fremde
    Firma kommt dann aus der Firmenliste der Baustelle (ohne Kürzel)."""
    if msg["schacht"] or msg["ohne_inventar"]:
        v = container_vorschau(schacht=msg["schacht"], eigen=True, art=None, ohne_inventar=msg["ohne_inventar"])
        if msg["schacht"] or msg["eigen"]:
            return v, None
        firmen = (st.e.get("firmen") or []) if st is not None else []
        firma = next((f for f in firmen if f.get("id") == msg.get("firma_id") and not f.get("eigen")), None)
        if firma is None:
            raise InventarFehler("Bitte eine fremde Firma wählen (⚙ › Firmen)")
        return v, {**firma, "kuerzel": None, "kuerzel_neu": False}
    if roh is None:
        raise InventarFehler("Datenbank nicht erreichbar – ohne sie gibt es kein Inventar")
    if msg["eigen"]:
        return container_vorschau(schacht=False, eigen=True, art=msg.get("art"), nr=msg.get("nr"),
                                  nummern=[c.get("nr") for c in roh.get("container") or []]), None
    firma = next((f for f in roh.get("firmen") or [] if f["baustelle_id"] == msg["entry_id"] and f["id"] == msg.get("firma_id")), None)
    if firma is None or firma.get("eigen"):
        raise InventarFehler("Bitte eine fremde Firma wählen (⚙ › Firmen)")
    kuerzel = firma.get("kuerzel") or firmenkuerzel_pruefen(msg.get("kuerzel"))
    hier = {e["container_id"] for e in roh.get("einsaetze") or [] if e.get("baustelle_id") == msg["entry_id"]}
    fremde = [c.get("fremd_nr") for c in roh.get("container") or [] if c.get("firma_kuerzel") == kuerzel and c["id"] in hier]
    return container_vorschau(schacht=False, eigen=False, art=msg.get("art"), firma=kuerzel, fremd_nummern=fremde), \
        {**firma, "kuerzel": kuerzel, "kuerzel_neu": not firma.get("kuerzel")}


def _ohne_db(msg: dict[str, Any], roh: dict[str, Any] | None) -> bool:
    """Ein Container ohne Inventar ist möglich (die Seite bietet „Ohne Inventar anlegen“ an): Datenbank nicht erreichbar."""
    return not msg["schacht"] and not msg["ohne_inventar"] and roh is None


@websocket_api.websocket_command({vol.Required("type"): "baustelle/container_vorschau", **SCHEMA_CONTAINER})
@websocket_api.async_response
async def ws_container_vorschau(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]) -> None:
    """Name, Nummer (nächste freie, belegt?) und Muster der Gerätenamen eines neuen Containers – ändert nichts.
    Falsche Angaben kommen als `fehler` in der Antwort (die Seite zeigt sie am Formular); `ohne_inventar_moeglich`:
    ohne Datenbank lässt sich der Container ohne Inventar anlegen."""
    entry = hass.config_entries.async_get_entry(msg["entry_id"])
    st = getattr(entry, "runtime_data", None) if entry is not None and entry.domain == DOMAIN else None   # nur für Firmen ohne Inventar
    _db_, roh = (None, None) if msg["schacht"] or msg["ohne_inventar"] else await _roh(hass)
    try:
        v, firma = _container_plan(st, roh, msg)
    except InventarFehler as err:
        connection.send_result(msg["id"], {"fehler": str(err), "belegt": True, "ohne_inventar_moeglich": _ohne_db(msg, roh)})
        return
    connection.send_result(msg["id"], {**v, "firma": {"name": firma["name"], "kuerzel": firma["kuerzel"]} if firma else None,
                                       "ohne_inventar_moeglich": False})


@websocket_api.websocket_command({vol.Required("type"): "baustelle/container_neu", **SCHEMA_CONTAINER,
                                  vol.Required("name"): vol.All(str, vol.Length(min=1, max=100))})
@websocket_api.async_response
@verwirft_namen
async def ws_container_neu(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]) -> None:
    """Container (mit Inventar-Container, Entscheidung 2; ohne mit `ohne_inventar`) oder Pumpenschacht anlegen – nur
    Admins. Erst alles prüfen (Name frei, Nummer frei, Firma mit Kürzel), dann Bereich in HA und Inventar; fremd: Verbrauch
    gehört der Firma."""
    if not _admin(connection, msg, "container_neu"):
        return
    st = await _geladen(hass, msg["entry_id"])
    if st is None:
        connection.send_error(msg["id"], websocket_api.ERR_NOT_FOUND, "Baustelle nicht gefunden oder nicht geladen")
        return
    name = msg["name"].strip()
    entry = st.entry
    if not name or any(s.title == name for s in entry.subentries.values() if s.subentry_type == SUB_BEREICH):
        connection.send_error(msg["id"], websocket_api.ERR_INVALID_FORMAT, "Diesen Namen gibt es auf der Baustelle schon" if name else "Bitte einen Namen eingeben")
        return
    inventar = not msg["schacht"] and not msg["ohne_inventar"]
    db, roh = await _roh(hass) if inventar else (None, None)
    try:
        v, firma = _container_plan(st, roh, msg)
        if v["belegt"]:
            raise InventarFehler(v["grund"])
    except InventarFehler as err:
        connection.send_error(msg["id"], websocket_api.ERR_INVALID_FORMAT, str(err))
        return
    if inventar and firma is not None and firma["kuerzel_neu"] and not await db.async_ausfuehren(
            lambda x: db_inventar.firma_kuerzel(x, msg["entry_id"], firma["id"], firma["kuerzel"])):
        connection.send_error(msg["id"], websocket_api.ERR_INVALID_FORMAT, db.fehler or "Kürzel der Firma nicht gespeichert")
        return
    art = ART_PUMPENSCHACHT if msg["schacht"] else ART_CONTAINER
    sub = ConfigSubentry(data=MappingProxyType({CONF_NAME: name, CONF_ART: art}), subentry_type=SUB_BEREICH, title=name, unique_id=None)
    st.neu_laden_folgt = True   # Bereich und Inventar, dann einmal neu laden
    try:
        hass.config_entries.async_add_subentry(entry, sub)
        bid = sub.subentry_id
        aus: dict[str, Any] = {"ok": True, "bereich_id": bid, "name": name, "inventar": None, "container_id": None}
        if inventar:
            jetzt: datetime = dt_util.utcnow()
            c = await db.async_ausfuehren(lambda x: db_inventar.container_anlegen(
                x, art=msg["art"], baustelle_id=msg["entry_id"], instanz_id=db.instanz_id, jetzt=jetzt,
                firma_kuerzel=firma["kuerzel"] if firma else None, bereich_id=bid, nr=msg.get("nr") if msg["eigen"] else None,
                bereich_name=name))
            if c is None:
                aus.update(ok=False, fehler=f"Bereich angelegt, aber nicht ins Inventar: {db.fehler or 'Datenbank'} – "
                                            "über den Chip „Nicht im Inventar – aufnehmen ›“ nachholen")
            else:
                aus.update(container_id=c["id"], inventar=v["inventar"])
        if firma is not None:   # fremd: der Verbrauch gehört ab jetzt der Firma (Abrechnung)
            st.e.setdefault("zuordnung", []).append({"bereich": bid, "firma": firma["id"], "ab": dt_util.now().isoformat(timespec="seconds")})
            await st.einstellungen.async_jetzt_speichern()
    finally:
        st = await _neu_laden(hass, msg["entry_id"])
    if st is not None:
        st.protokoll("einstellung", bid, f"{name} angelegt" + (f" – Inventar {v['inventar']}" if aus["inventar"] else
                                                              " – ohne Inventar" if msg["ohne_inventar"] else ""))
        hass.async_create_task(async_spiegeln(hass, struktur(hass, st.entry)), "baustelle_datenbank_spiegeln")
    connection.send_result(msg["id"], aus)


BEFEHLE = (ws_geraet_kandidaten, ws_geraet_typen, ws_geraet_vorschau, ws_geraet_hinzufuegen, ws_geraet_hinzufuegen_rueckgaengig,
           ws_container_vorschau, ws_container_neu)
