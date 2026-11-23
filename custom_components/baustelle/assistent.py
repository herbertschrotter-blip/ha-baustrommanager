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
    _klasse,
    _schalter,
    _verdrahten,
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
    typ_vorschlag,
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


def _setzen(hass: HomeAssistant, st: Steuerung, bid: str, feld: str, wert: Any, benutzer: str | None) -> None:
    """Einstellung des Bereichs setzen, ohne auszuwerten (Steuerung angehalten, neu geladen wird danach)."""
    st.e["bereiche"].setdefault(bid, {})[feld] = wert
    einstellung_merken(hass, st.entry.entry_id, f"bereiche.{bid}.{feld}", wert, benutzer, bereich_id=bid, quelle="assistent")
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


def _geraet(hass: HomeAssistant, device_id: str) -> tuple[dr.DeviceEntry, str | None]:
    geraet = dr.async_get(hass).async_get(device_id)
    if not isinstance(geraet, dr.DeviceEntry):
        raise LookupError("HA-Gerät nicht gefunden")
    ents = _entitaeten(hass, geraet.id)
    return geraet, typ_vorschlag(schalter=_schalter(ents) is not None, klassen=[_klasse(e) for e in ents])


def _typen(hass: HomeAssistant, st: Steuerung, bid: str, device_id: str) -> tuple[dr.DeviceEntry, str | None, list[dict[str, Any]]]:
    if bid not in st.bereiche:
        raise LookupError("Container nicht gefunden")
    geraet, geraet_typ = _geraet(hass, device_id)
    name = geraet.name_by_user or geraet.name or "diesem Gerät"
    return geraet, geraet_typ, assistent_typen(geraet_typ, schacht=st.bereiche[bid].art == ART_PUMPENSCHACHT, geraet=name)


def _typ(typen: list[dict[str, Any]], k: str) -> dict[str, Any]:
    t = next((x for x in typen if x["k"] == k), None)
    if t is None or not t["passt"]:
        raise InventarFehler(t["grund"] if t else f"Typ {k!r} unbekannt")
    return t


SCHEMA_GERAET = {vol.Required("entry_id"): str, vol.Required("bereich_id"): str, vol.Required("device_id"): str}


@websocket_api.websocket_command({vol.Required("type"): "baustelle/geraet_typen", **SCHEMA_GERAET})
@websocket_api.async_response
async def ws_geraet_typen(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]) -> None:
    """Schritt 3 „Was hängt dran?“: die eine Typenliste, nicht passende mit Grund, und die Vorbelegung (alle Benutzer)."""
    st = await _geladen(hass, msg["entry_id"])
    if st is None:
        connection.send_error(msg["id"], websocket_api.ERR_NOT_FOUND, "Baustelle nicht gefunden oder nicht geladen")
        return
    try:
        geraet, geraet_typ, typen = _typen(hass, st, msg["bereich_id"], msg["device_id"])
    except LookupError as err:
        connection.send_error(msg["id"], websocket_api.ERR_NOT_FOUND, str(err))
        return
    connection.send_result(msg["id"], {"typen": typen, "vorschlag": assistent_vorschlag(typen),
                                       "geraet": {"name": geraet.name_by_user or geraet.name, "typ": geraet_typ}})


@websocket_api.websocket_command({vol.Required("type"): "baustelle/geraet_vorschau", **SCHEMA_GERAET,
                                  vol.Required("typ"): str, vol.Optional("name"): vol.Any(None, str)})
@websocket_api.async_response
async def ws_geraet_vorschau(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]) -> None:
    """Schritt 4: so heißt es danach (alt → neu), noch ohne zu schreiben; `name` = eigener Name statt Schema (nur der
    Gerätename, markiert als `frei`). Ohne Inventar-Container (Schacht, nicht aufgenommen) bleiben die Namen."""
    st = await _geladen(hass, msg["entry_id"])
    if st is None:
        connection.send_error(msg["id"], websocket_api.ERR_NOT_FOUND, "Baustelle nicht gefunden oder nicht geladen")
        return
    try:
        _g, _gt, typen = _typen(hass, st, msg["bereich_id"], msg["device_id"])
        inv_typ, haengt = assistent_zuordnung(_typ(typen, msg["typ"])["k"])
        db, roh = await _roh(hass)
        cid = _container_id(roh, msg["bereich_id"])
        if cid is None or roh is None:
            schacht = st.bereiche[msg["bereich_id"]].art == ART_PUMPENSCHACHT
            connection.send_result(msg["id"], {
                "im_inventar": False, "container": None, "schritte": [], "konflikte": {}, "zaehler": {}, "verweise": [],
                "eingetragen": True, "abweichend": 0,
                "hinweis": "Pumpenschächte stehen nicht im Inventar – die Namen bleiben, wie sie sind" if schacht else
                "Der Container steht nicht im Inventar – die Namen bleiben; erst aufnehmen, dann einheitlich benennen"
                if db is not None else "Datenbank nicht erreichbar – die Namen bleiben, wie sie sind"})
            return
        v, zuordnen = zuordnen_vorschau(hass, roh, cid, msg["device_id"], inv_typ, haengt)
    except LookupError as err:
        connection.send_error(msg["id"], websocket_api.ERR_NOT_FOUND, str(err))
        return
    except ValueError as err:   # auch InventarFehler
        connection.send_error(msg["id"], websocket_api.ERR_INVALID_FORMAT, str(err))
        return
    schritte = frei_setzen(v["schritte"], msg["device_id"], msg.get("name")) if zuordnen["eingetragen"] else v["schritte"]
    ids = {s["alt"]: s["neu"] for s in schritte if s["ziel"] == "entitaet_id" and s["alt"] != s["neu"]}
    container = next((c for c in roh.get("container") or [] if c["id"] == cid), {})
    try:
        cname = container_name(container["art"], nr=container.get("nr"), firma=container.get("firma_kuerzel"),
                               fremd_nr=container.get("fremd_nr"))
    except (InventarFehler, KeyError):
        cname = None
    connection.send_result(msg["id"], {
        "im_inventar": True, "container": cname, "schritte": schritte, "konflikte": v["konflikte"], "zaehler": v["zaehler"],
        "abweichend": abweichend(schritte), "verweise": await async_verweise(hass, ids),
        "eingetragen": zuordnen["eingetragen"], "hinweis": zuordnen.get("hinweis"),
        "frei": bool((msg.get("name") or "").strip()) and zuordnen["eingetragen"]})


def _vorher(hass: HomeAssistant, st: Steuerung, bid: str, geraet: dr.DeviceEntry, inv_typ: str) -> dict[str, Any]:
    """Was das Hinzufügen gleich ändert, im Zustand vorher (für Rückgängig)."""
    ents = _entitaeten(hass, geraet.id)
    aus: dict[str, Any] = {"name_alt": geraet.name_by_user, "primaer_alt": st.einstellungen.bereich(bid).get("primaer")}
    if inv_typ == "PLUG":
        schalter = _schalter(ents)
        sub = next((x for x in st.entry.subentries.values()
                    if x.subentry_type == SUB_GERAET and x.data.get(CONF_SCHALTER) == schalter), None)
        aus.update(schalter=schalter, alt_sub={"id": sub.subentry_id, "data": dict(sub.data), "title": sub.title} if sub else None)
        return aus
    plan = sensor_plan(st, bid, inv_typ, ents)
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


@websocket_api.websocket_command({vol.Required("type"): "baustelle/geraet_hinzufuegen", **SCHEMA_GERAET,
                                  vol.Required("typ"): str, vol.Optional("name"): vol.Any(None, str),
                                  vol.Optional("nenn_kw"): vol.Any(None, vol.All(vol.Coerce(float), vol.Range(0.1, 10))),
                                  vol.Optional("rolle"): vol.In(["primaer", "zusatz"])})
@websocket_api.async_response
@verwirft_namen
async def ws_geraet_hinzufuegen(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]) -> None:
    """Schritt 5 „Anlegen und umbenennen“ in einem: einhängen (Unter-Eintrag bzw. Fühler/Tür am Container), ins Inventar,
    Nennleistung und Primär, umbenennen nach dem Schema, eigener Gerätename – nur Admins. Antwort mit Marke für
    Rückgängig; was nicht ging, steht in `umbenannt.fehler` (eingehängt ist es dann schon)."""
    if not _admin(connection, msg, "geraet_hinzufuegen"):
        return
    entry_id, bid, device_id = msg["entry_id"], msg["bereich_id"], msg["device_id"]
    benutzer = connection.user.name if connection.user else None
    st = await _geladen(hass, entry_id)
    if st is None:
        connection.send_error(msg["id"], websocket_api.ERR_NOT_FOUND, "Baustelle nicht gefunden oder nicht geladen")
        return
    try:   # alles prüfen, bevor etwas geschrieben wird
        geraet, _gt, typen = _typen(hass, st, bid, device_id)
        t = _typ(typen, msg["typ"])
        inv_typ, haengt = assistent_zuordnung(t["k"])
        db, roh = await _roh(hass)
        cid = _container_id(roh, bid)
        if cid is not None and roh is not None:
            _v, zu = zuordnen_vorschau(hass, roh, cid, device_id, inv_typ, haengt)
            eingetragen = zu["eingetragen"]
        else:
            eingetragen = inv_typ == "PLUG" or sensor_plan(st, bid, inv_typ, _entitaeten(hass, device_id)) is not None
            if not eingetragen:
                raise InventarFehler("Der Container hat dafür schon einen Platz belegt (z. B. einen Fühler) – ohne Inventar "
                                     "gibt es nichts einzutragen")
        vorher = _vorher(hass, st, bid, geraet, inv_typ)
    except LookupError as err:
        connection.send_error(msg["id"], websocket_api.ERR_NOT_FOUND, str(err))
        return
    except ValueError as err:
        connection.send_error(msg["id"], websocket_api.ERR_INVALID_FORMAT, str(err))
        return

    rueck: dict[str, Any] = {"entry_id": entry_id, "bereich_id": bid, "device_id": device_id, "container_id": cid,
                             "inv_typ": inv_typ, "ausruestung_id": None, "umbenennung_id": None, "geraet_id": None, **vorher}
    st.neu_laden_folgt = True   # ein Neu-Laden nach dem Einhängen statt je Unter-Eintrag (wie Umbenennen)
    try:   # 1. einhängen (und ins Inventar)
        if cid is not None and roh is not None:
            z = await async_zuordnen(hass, db, roh, cid, device_id, inv_typ, haengt)
            rueck["ausruestung_id"] = z["id"] if z.get("neu", True) else None
        else:
            _verdrahten(hass, st, bid, geraet, inv_typ, haengt)
    except (LookupError, ValueError) as err:
        st.neu_laden_folgt = False
        connection.send_error(msg["id"], websocket_api.ERR_INVALID_FORMAT, f"Nicht hinzugefügt: {err}")
        return
    marke = _rueck_merken(hass, rueck)
    name = geraet.name_by_user or geraet.name or device_id
    if (st := await _neu_laden(hass, entry_id)) is None or bid not in st.bereiche:
        connection.send_result(msg["id"], {"ok": True, "name": name, "rueck": marke, "umbenannt": {
            "fehler": "eingehängt, aber die Baustelle lädt nicht – Namen bitte unter 🏷 Namen in HA prüfen"}})
        return
    # 2. Nennleistung und Primär (nur Heizkörper; das Gerät ist sein Unter-Eintrag)
    gid = next((g.id for g in st.geraete.values() if g.schalter == vorher.get("schalter")), None) if vorher.get("schalter") else None
    rueck["geraet_id"] = gid
    if gid and t["nenn"] and msg.get("nenn_kw"):
        st.e.setdefault("geraete", {}).setdefault(gid, {})
        st.einstellung_setzen(("geraete", gid, "nenn_kw"), round(float(msg["nenn_kw"]), 1))
    if gid and t["rolle"] and msg.get("rolle") == "primaer":
        st.einstellung_setzen(("bereiche", bid, "primaer"), gid)
    frei = (msg.get("name") or "").strip() or None
    st.protokoll("einstellung", bid, f"{frei or name} hinzugefügt ({t['text'].split(' ', 1)[-1]})"
                 + (" – eigener Name, weicht vom Schema ab" if frei else ""))
    container = st.bereiche[bid].name
    # 3. umbenennen nach dem Schema (der ganze Container, wie die Vorschau zeigte), eigener Gerätename danach
    umbenannt: dict[str, Any] = {"status": "ohne_inventar" if cid is None else "nur_inventar"}
    if cid is not None and eingetragen:
        try:
            u = await async_umbenennen(hass, db, cid, benutzer, neu_laden=False)
            rueck["umbenennung_id"] = u.get("id")
            umbenannt = {"status": u["status"], "anzahl": sum(1 for s in u["schritte"] if s.get("ergebnis") == "ok"),
                         "offen": sum(1 for s in u["schritte"] if s.get("ergebnis") == "fehler"), "getauscht": u.get("getauscht", {})}
        except (LookupError, ValueError) as err:
            umbenannt = {"fehler": f"hinzugefügt, aber nicht umbenannt: {err} – unter 🏷 Namen in HA nachholen"}
        finally:
            if frei:
                dr.async_get(hass).async_update_device(device_id, name_by_user=frei)
            if st.neu_laden_folgt:   # Umbenennen hat angehalten – einmal neu laden
                await _neu_laden(hass, entry_id)
    elif frei:
        dr.async_get(hass).async_update_device(device_id, name_by_user=frei)
    connection.send_result(msg["id"], {"ok": True, "name": frei or name, "typ": t["text"], "container": container,
                                       "frei": frei, "umbenannt": umbenannt, "rueck": marke})


@websocket_api.websocket_command({vol.Required("type"): "baustelle/geraet_hinzufuegen_rueckgaengig", vol.Required("rueck"): str})
@websocket_api.async_response
@verwirft_namen
async def ws_geraet_hinzufuegen_rueckgaengig(hass: HomeAssistant, connection: websocket_api.ActiveConnection,
                                             msg: dict[str, Any]) -> None:
    """Das eben Hinzugefügte zurücknehmen: Umbenennung zurück, Gerät aus dem Container (Unter-Eintrag bzw. Fühler/Tür
    wie vorher), Inventar-Einsatz beendet, Gerätename, Primär – nur direkt danach (Marke im Speicher), nur Admins."""
    if not _admin(connection, msg, "geraet_hinzufuegen"):
        return
    r = hass.data.get(DATA_RUECK, {}).pop(msg["rueck"], None)
    if r is None:
        connection.send_error(msg["id"], websocket_api.ERR_NOT_FOUND, "Rückgängig geht nur direkt nach dem Hinzufügen")
        return
    benutzer = connection.user.name if connection.user else None
    fehler: list[str] = []
    bid, db = r["bereich_id"], hass.data.get(DATA_DB)
    st = await _geladen(hass, r["entry_id"])
    if st is None or bid not in st.bereiche:
        connection.send_error(msg["id"], websocket_api.ERR_NOT_FOUND, "Baustelle nicht geladen – nichts zurückgenommen")
        return
    entry = st.entry
    st.neu_laden_folgt = True   # alles zurück, dann einmal neu laden
    try:
        if r.get("umbenennung_id") and db is not None and db.bereit:
            letzte = await db.async_ausfuehren(lambda v: db_inventar.umbenennung_letzte(v, r["container_id"]))
            if letzte is not None and letzte["id"] == r["umbenennung_id"]:
                try:
                    await async_rueckgaengig(hass, db, r["container_id"], benutzer, neu_laden=False)
                except (LookupError, ValueError) as err:
                    fehler.append(f"Namen: {err}")
            else:
                fehler.append("Namen: inzwischen wieder umbenannt – bitte unter 🏷 Namen in HA prüfen")
        if r["inv_typ"] == "PLUG":
            sub = next((x for x in entry.subentries.values()   # Verweise sind schon zurückgetauscht: alter Schalter
                        if x.subentry_type == SUB_GERAET and x.data.get(CONF_SCHALTER) == r["schalter"]), None)
            if r.get("alt_sub") is None and sub is not None:
                hass.config_entries.async_remove_subentry(entry, sub.subentry_id)
                if db is not None and db.bereit:
                    await db.async_ausfuehren(lambda v: db_inventar.geraet_entfernt(v, sub.subentry_id, dt_util.utcnow()))
            elif r.get("alt_sub") is not None and (alt := entry.subentries.get(r["alt_sub"]["id"])) is not None:
                hass.config_entries.async_update_subentry(entry, alt, data=r["alt_sub"]["data"], title=r["alt_sub"]["title"])
        elif (s := r.get("sensor")) is not None:
            if s["feld"] == "fuehler" and (sub := entry.subentries.get(bid)) is not None:
                data = {k: w for k, w in sub.data.items() if k != CONF_FUEHLER}
                hass.config_entries.async_update_subentry(entry, sub, data={**data, **({CONF_FUEHLER: s["alt"]} if s["alt"] else {})})
            elif s["feld"] != "fuehler":
                _setzen(hass, st, bid, s["feld"], s["alt"], benutzer)
        if r.get("ausruestung_id") and r["inv_typ"] != "PLUG" and db is not None and db.bereit:   # Plug: geraet_entfernt
            await db.async_ausfuehren(lambda v: db_inventar.ausruestung_entfernen(v, r["ausruestung_id"], dt_util.utcnow()))
        if r.get("geraet_id") and st.einstellungen.bereich(bid).get("primaer") != r.get("primaer_alt"):
            _setzen(hass, st, bid, "primaer", r.get("primaer_alt"), benutzer)
        if (g := dr.async_get(hass).async_get(r["device_id"])) is not None and g.name_by_user != r.get("name_alt"):
            dr.async_get(hass).async_update_device(r["device_id"], name_by_user=r.get("name_alt"))
    finally:
        await st.einstellungen.async_jetzt_speichern()
        st = await _neu_laden(hass, r["entry_id"])
    if st is not None:
        st.protokoll("einstellung", bid, "Hinzufügen zurückgenommen" + (f" ({'; '.join(fehler)})" if fehler else ""))
    connection.send_result(msg["id"], {"ok": not fehler, "fehler": fehler})


# ---------------------------------------------------------------------- „+ Container“
SCHEMA_CONTAINER = {vol.Required("entry_id"): str, vol.Optional("schacht", default=False): bool,
                    vol.Optional("eigen", default=True): bool, vol.Optional("art"): vol.Any(None, vol.In(list(CONTAINER_ARTEN))),
                    vol.Optional("nr"): vol.Any(None, vol.All(int, vol.Range(min=1, max=999))),
                    vol.Optional("firma_id"): vol.Any(None, str), vol.Optional("kuerzel"): vol.Any(None, str)}


def _container_plan(roh: dict[str, Any] | None, msg: dict[str, Any]) -> tuple[dict[str, Any], dict[str, Any] | None]:
    """(Vorschau, Firma) aus `logik.container_vorschau` mit den Nummern der Datenbank; `InventarFehler` bei falscher Angabe."""
    if msg["schacht"]:
        return container_vorschau(schacht=True, eigen=True, art=None), None
    if roh is None:
        raise InventarFehler("Datenbank nicht erreichbar – das Inventar braucht sie")
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


@websocket_api.websocket_command({vol.Required("type"): "baustelle/container_vorschau", **SCHEMA_CONTAINER})
@websocket_api.async_response
async def ws_container_vorschau(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]) -> None:
    """Name, Nummer (nächste freie, belegt?) und Muster der Gerätenamen eines neuen Containers – ändert nichts.
    Falsche Angaben kommen als `fehler` in der Antwort (die Seite zeigt sie am Formular)."""
    _db_, roh = (None, None) if msg["schacht"] else await _roh(hass)
    try:
        v, firma = _container_plan(roh, msg)
    except InventarFehler as err:
        connection.send_result(msg["id"], {"fehler": str(err), "belegt": True})
        return
    connection.send_result(msg["id"], {**v, "firma": {"name": firma["name"], "kuerzel": firma["kuerzel"]} if firma else None})


@websocket_api.websocket_command({vol.Required("type"): "baustelle/container_neu", **SCHEMA_CONTAINER,
                                  vol.Required("name"): vol.All(str, vol.Length(min=1, max=100))})
@websocket_api.async_response
@verwirft_namen
async def ws_container_neu(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]) -> None:
    """Container (mit Inventar-Container, Entscheidung 2) oder Pumpenschacht anlegen – nur Admins. Erst alles prüfen
    (Name frei, Nummer frei, Firma mit Kürzel), dann Bereich in HA und Inventar; fremd: Verbrauch gehört der Firma."""
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
    db, roh = (None, None) if msg["schacht"] else await _roh(hass)
    try:
        v, firma = _container_plan(roh, msg)
        if v["belegt"]:
            raise InventarFehler(v["grund"])
    except InventarFehler as err:
        connection.send_error(msg["id"], websocket_api.ERR_INVALID_FORMAT, str(err))
        return
    if firma is not None and firma["kuerzel_neu"] and not await db.async_ausfuehren(
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
        if not msg["schacht"]:
            jetzt: datetime = dt_util.utcnow()
            c = await db.async_ausfuehren(lambda x: db_inventar.container_anlegen(
                x, art=msg["art"], baustelle_id=msg["entry_id"], instanz_id=db.instanz_id, jetzt=jetzt,
                firma_kuerzel=firma["kuerzel"] if firma else None, bereich_id=bid, nr=msg.get("nr") if msg["eigen"] else None,
                bereich_name=name))
            if c is None:
                aus.update(ok=False, fehler=f"Bereich angelegt, aber nicht ins Inventar: {db.fehler or 'Datenbank'} – "
                                            "über den Chip „Nicht im Inventar – aufnehmen“ nachholen")
            else:
                aus.update(container_id=c["id"], inventar=v["inventar"])
        if firma is not None:   # fremd: der Verbrauch gehört ab jetzt der Firma (Abrechnung)
            st.e.setdefault("zuordnung", []).append({"bereich": bid, "firma": firma["id"], "ab": dt_util.now().isoformat(timespec="seconds")})
            await st.einstellungen.async_jetzt_speichern()
    finally:
        st = await _neu_laden(hass, msg["entry_id"])
    if st is not None:
        st.protokoll("einstellung", bid, f"{name} angelegt" + (f" – Inventar {v['inventar']}" if aus["inventar"] else ""))
        hass.async_create_task(async_spiegeln(hass, struktur(hass, st.entry)), "baustelle_datenbank_spiegeln")
    connection.send_result(msg["id"], aus)


BEFEHLE = (ws_geraet_typen, ws_geraet_vorschau, ws_geraet_hinzufuegen, ws_geraet_hinzufuegen_rueckgaengig,
           ws_container_vorschau, ws_container_neu)
