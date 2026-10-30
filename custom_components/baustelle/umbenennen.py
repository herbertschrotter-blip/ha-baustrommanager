"""Umbenennen nach dem Schema in HA ausführen (BSM-031.06b, docs/bauplan-inventar.md §6).

`baustelle/inventar_umbenennen` (nur Admins) bildet die Vorschau neu (nie die der Seite übernehmen), lehnt bei
Konflikten ab und führt in fester Reihenfolge aus: Entitätsregister (Name und Entity-ID), HA-Gerät (`name_by_user`),
Labels (nur eigene entfernen), dann die eigenen Verweise der Integration (Unter-Einträge, Optionen, Einstellungen des
Bereichs wie Tür und Symbol), zuletzt den Namen im Plug selbst (`Sys.SetConfig`, 06c). Währenddessen ist die Steuerung
der Baustelle angehalten; danach lädt sie einmal neu und schaltet wie vorher. BTHome-Namen zieht die Kopplungspflege
nach. Jede Umbenennung steht mit allen Schritten in der Tabelle `umbenennung` und als eine Zeile im Protokoll.

Nachholen (§6.5): Ist die jüngste Umbenennung eines Containers `teilweise` (Plug war nicht erreichbar), führt derselbe
Befehl nur die fehlenden Schritte aus und trägt sie dort ein – keine neue Umbenennung. Plug-Namen holt die Integration
auch selbst nach, alle 30 Minuten, sobald der Plug wieder erreichbar ist (nie Schritte in HA, nie ein Neu-Laden).

Rückgängig (§6.6, `baustelle/inventar_rueckgaengig`): nur die jüngste Umbenennung je Container; spielt ihre erledigten
Schritte in umgekehrter Reihenfolge mit den alten Werten zurück (vorher als Vorschau), Status `zurueck` bzw.
`zurueck_teilweise` (nochmal Rückgängig holt den Rest nach).
"""

from __future__ import annotations

from datetime import datetime, timedelta
from typing import TYPE_CHECKING, Any

import voluptuous as vol

from homeassistant.components import websocket_api
from homeassistant.const import STATE_UNAVAILABLE
from homeassistant.core import CALLBACK_TYPE, HomeAssistant, callback
from homeassistant.helpers import device_registry as dr, entity_registry as er, label_registry as lr
from homeassistant.helpers.aiohttp_client import async_get_clientsession
from homeassistant.helpers.event import async_track_time_interval
from homeassistant.util import dt as dt_util

from .const import DOMAIN
from .db import DATA_DB, einstellung_merken
from .db import inventar as db_inventar
from .inventar import _db, async_vorschau
from .logik.inventar import (
    RUECKGAENGIG_MOEGLICH, ausfuehrbar, fuer_plug, ids_getauscht, konflikte, nachholen_mischen, rueckgaengig, status,
    verweise_tauschen, zurueck_eintragen,
)
from .notprogramm import Plug, PlugFehler, shelly_host
from .logik.rechte import darf

if TYPE_CHECKING:
    from .steuerung import Steuerung

NACHHOLEN = timedelta(minutes=30)


def _label_id(labels: lr.LabelRegistry, name: str) -> str:
    vorhanden = labels.async_get_label_by_name(name)
    return vorhanden.label_id if vorhanden is not None else labels.async_create(name).label_id


@callback
def _in_ha(hass: HomeAssistant, schritt: dict[str, Any]) -> None:
    """Einen zusammengefassten Schritt aus `logik.inventar.ausfuehrbar` in HA ausführen (wirft bei Fehler)."""
    art, ref = schritt["art"], schritt["ref"]
    if art == "entitaet":
        werte: dict[str, Any] = {}
        if "name" in schritt:
            werte["name"] = schritt["name"]
        if "entity_id" in schritt:
            werte["new_entity_id"] = schritt["entity_id"]
        er.async_get(hass).async_update_entity(ref, **werte)
    elif art == "geraet":   # wieder der eigene Name des Geräts (Rückgängig) → kein name_by_user
        geraete = dr.async_get(hass)
        if (geraet := geraete.async_get(ref)) is None:
            raise ValueError("HA-Gerät nicht gefunden")
        geraete.async_update_device(ref, name_by_user=None if schritt["name"] in (None, geraet.name) else schritt["name"])
    elif art == "label":
        geraete, labels = dr.async_get(hass), lr.async_get(hass)
        if (geraet := geraete.async_get(ref)) is None:
            raise ValueError("HA-Gerät nicht gefunden")
        weg = {lab.label_id for n in schritt["weg"] if (lab := labels.async_get_label_by_name(n)) is not None}
        geraete.async_update_device(ref, labels=(set(geraet.labels) - weg) | {_label_id(labels, n) for n in schritt["dazu"]})
    # unter_eintrag: Name des Unter-Eintrags, kommt mit den Verweisen (_verweise)


def _ergebnisse(schritte: list[dict[str, Any]], fehler: dict[tuple[str, str], str], entfaellt: set[str]) -> list[dict[str, Any]]:
    """Ergebnis je Schritt der Vorschau: ok, gleich, fehler (mit Text) oder entfällt (Plug ohne Shelly Gen2+, BTHome)."""
    aus = []
    for s in schritte:
        art = "entitaet" if s["ziel"] in ("entitaet_name", "entitaet_id") else s["ziel"]
        if s["zustand"] == "gleich":
            ergebnis = {"ergebnis": "gleich"}
        elif s["ziel"] == "bthome" or (s["ziel"] == "plug" and s["ref"] in entfaellt):
            ergebnis = {"ergebnis": "entfaellt"}
        elif (text := fehler.get((art, s["ref"]))) is not None:
            ergebnis = {"ergebnis": "fehler", "fehler": text}
        else:
            ergebnis = {"ergebnis": "ok"}
        aus.append({**s, **ergebnis})
    return aus


async def _plug_namen(hass: HomeAssistant, plugs: list[dict[str, Any]], ziele: dict[str, tuple[str, bool]],
                      fehler: dict[tuple[str, str], str]) -> None:
    """Namen im Shelly setzen (`Sys.SetConfig`); `ziele` je Unter-Eintrag (Adresse, erreichbar). Fehler nach `fehler`."""
    session = async_get_clientsession(hass)
    for s in plugs:
        host, erreichbar = ziele[s["ref"]]
        if not erreichbar:
            fehler[("plug", s["ref"])] = "nicht erreichbar"
            continue
        try:
            await Plug(session, host).rpc("Sys.SetConfig", {"config": {"device": {"name": s["neu"]}}})
        except PlugFehler as err:
            fehler[("plug", s["ref"])] = str(err)


@callback
def _verweise(hass: HomeAssistant, st: Steuerung, ids: dict[str, str], namen: dict[str, str], benutzer: str | None
              ) -> list[str]:
    """Eigene Verweise der Integration auf die neuen Entity-IDs bringen und Heizkörper umbenennen; liefert, was sich
    änderte. Die Unter-Einträge lösen kein Neu-Laden aus (`neu_laden_folgt`), das kommt einmal am Ende."""
    entry, geaendert = st.entry, []
    for sub in list(entry.subentries.values()):
        data = verweise_tauschen(dict(sub.data), ids)
        titel = namen.get(sub.subentry_id, sub.title)
        if titel != sub.title:
            data["name"] = titel
        if hass.config_entries.async_update_subentry(entry, sub, data=data, title=titel):
            geaendert.append(f"Unter-Eintrag {titel}")
    optionen = verweise_tauschen(dict(entry.options), ids)
    if optionen != dict(entry.options):
        hass.config_entries.async_update_entry(entry, options=optionen)
        geaendert.append("Optionen")
    for bid, alt in list(st.e["bereiche"].items()):
        neu = verweise_tauschen(alt, ids)
        for schluessel in [k for k in neu if neu[k] != alt.get(k)]:
            st.e["bereiche"][bid][schluessel] = neu[schluessel]
            einstellung_merken(hass, entry.entry_id, f"bereiche.{bid}.{schluessel}", neu[schluessel], benutzer,
                               bereich_id=bid, quelle="umbenennen")
            geaendert.append(f"Einstellung {schluessel}")
    st.einstellungen.speichern()
    return geaendert


async def _merken(db: Any, container_id: str, benutzer: str | None, letzte: dict[str, Any] | None,
                  schritte: list[dict[str, Any]]) -> tuple[int | None, list[dict[str, Any]], str]:
    """Neue Umbenennung anlegen – oder beim Nachholen in die jüngste (`teilweise`) eintragen."""
    jetzt: datetime = dt_util.utcnow()
    if letzte is not None and letzte["status"] == "teilweise":
        schritte = nachholen_mischen(letzte["schritte"] or [], schritte)
        stand = status(schritte)
        nr = await db.async_ausfuehren(lambda v: db_inventar.umbenennung_aendern(v, letzte["id"], schritte, stand))
    else:
        stand = status(schritte)
        nr = await db.async_ausfuehren(lambda v: db_inventar.umbenennung_merken(
            v, container_id=container_id, benutzer=benutzer, jetzt=jetzt, schritte=schritte, status=stand))
    return nr, schritte, stand


async def async_ausfuehren(hass: HomeAssistant, db: Any, container_id: str, benutzer: str | None, *,
                           nur_plug: bool = False) -> dict[str, Any]:
    """Umbenennung eines Containers ausführen oder nachholen; wirft `LookupError` (nicht gefunden) bzw. `ValueError`
    (Konflikt). `nur_plug` (selbst nachholen): nur Plug-Namen, nichts in HA."""
    if (ergebnis := await async_vorschau(hass, db, container_id)) is None:
        raise LookupError("Container ohne Bereich auf einer geladenen Baustelle")
    eingabe, v = ergebnis
    if v["konflikte"]:
        raise ValueError("Konflikt: " + ", ".join(f"{a} → {n}" for a, n in v["konflikte"].items()))
    plan, plugs = ausfuehrbar(v["schritte"]), fuer_plug(v["schritte"])
    if nur_plug and plan:
        raise LookupError("Nachholen in HA nur von Hand")
    entry = hass.config_entries.async_get_entry(eingabe["baustelle_id"])
    assert entry is not None and entry.domain == DOMAIN
    st: Steuerung = entry.runtime_data
    # Adresse und Erreichbarkeit der Plugs vorher: danach heißt der Schalter anders, die Steuerung kennt noch den alten.
    # Ohne Shelly Gen2+ entfällt der Plug-Name (kein Grund für eine neue Umbenennung)
    ziele = _plug_ziele(hass, st, plugs)
    entfaellt = {s["ref"] for s in plugs if s["ref"] not in ziele}
    plugs = [s for s in plugs if s["ref"] in ziele]
    letzte = await db.async_ausfuehren(lambda verbindung: db_inventar.umbenennung_letzte(verbindung, container_id))
    nachholen = letzte is not None and letzte["status"] == "teilweise"
    if not plan and not plugs:
        if not nachholen:
            return {"id": None, "status": "nichts", "schritte": v["schritte"], "geaendert": []}
        nr, schritte, stand = await _merken(db, container_id, benutzer, letzte, _ergebnisse(v["schritte"], {}, entfaellt))
        return {"id": nr, "status": stand, "schritte": schritte, "geaendert": [], "nachgeholt": True}
    try:
        fehler: dict[tuple[str, str], str] = {}
        geaendert: list[str] = []
        if plan:
            # Schalten anhalten (Verweise werden getauscht) – die Schritte in HA laufen ohne await am Stück, neu geladen
            # wird erst ganz am Ende einmal
            st.neu_laden_folgt = True
            st.async_stop()
            for schritt in plan:
                try:
                    _in_ha(hass, schritt)
                except (ValueError, KeyError) as err:
                    fehler[(schritt["art"], schritt["ref"])] = str(err) or type(err).__name__
            vorlaeufig = _ergebnisse(v["schritte"], fehler, set())
            namen = {s["ref"]: s["neu"] for s in vorlaeufig if s["ziel"] == "unter_eintrag" and s["ergebnis"] == "ok"}
            geaendert = _verweise(hass, st, ids_getauscht(vorlaeufig), namen, benutzer)
        await _plug_namen(hass, plugs, ziele, fehler)
        jetzt_erledigt = _ergebnisse(v["schritte"], fehler, entfaellt)
        ok = sum(1 for s in jetzt_erledigt if s["ergebnis"] == "ok")   # im Protokoll nur, was diesmal geschah
        offen = sum(1 for s in jetzt_erledigt if s["ergebnis"] == "fehler")
        nr, schritte, stand = await _merken(db, container_id, benutzer, letzte, jetzt_erledigt)
        st.protokoll("einstellung", eingabe["bereich_id"],
                     f"{'Umbenennung nachgeholt' if nachholen else 'Umbenannt nach Schema'} "
                     f"({eingabe['praefix']}_C_{eingabe['art']}): {ok} Schritte"
                     + (f", {offen} offen ({', '.join(sorted(set(fehler.values())))})" if offen else ""))
        return {"id": nr, "status": stand, "schritte": schritte, "geaendert": geaendert, "nachgeholt": nachholen}
    finally:
        if plan:   # Audit 0.8.165: auch wenn ein Schritt scheitert – sonst bliebe die Steuerung angehalten
            hass.config_entries.async_schedule_reload(entry.entry_id)


def _plug_ziele(hass: HomeAssistant, st: Steuerung, plugs: list[dict[str, Any]]) -> dict[str, tuple[str, bool]]:
    """Adresse und Erreichbarkeit je Plug-Schritt (Unter-Eintrag) – nur Shelly Gen2+."""
    ziele: dict[str, tuple[str, bool]] = {}
    for s in plugs:
        g = st.geraete.get(s["ref"])
        if g is not None and (host := shelly_host(hass, g.schalter)) is not None:
            zustand = hass.states.get(g.schalter)
            ziele[s["ref"]] = (host, zustand is not None and zustand.state != STATE_UNAVAILABLE)
    return ziele


async def async_rueckgaengig(hass: HomeAssistant, db: Any, container_id: str, benutzer: str | None, *,
                             nur_vorschau: bool = False) -> dict[str, Any]:
    """Jüngste Umbenennung eines Containers zurückspielen (§6.6) – mit `nur_vorschau` nur die Schritte zeigen. Wirft
    `LookupError` (nichts zurückzunehmen) bzw. `ValueError` (alte Entity-ID inzwischen vergeben)."""
    if (ergebnis := await async_vorschau(hass, db, container_id)) is None:
        raise LookupError("Container ohne Bereich auf einer geladenen Baustelle")
    eingabe = ergebnis[0]
    letzte = await db.async_ausfuehren(lambda verbindung: db_inventar.umbenennung_letzte(verbindung, container_id))
    if letzte is None or letzte["status"] not in RUECKGAENGIG_MOEGLICH:
        raise LookupError("Keine Umbenennung, die sich zurücknehmen lässt (nur die jüngste je Container)")
    umkehr = rueckgaengig(letzte["schritte"] or [])
    ids = {u["ref"]: u["neu"] for u in umkehr if u["ziel"] == "entitaet_id"}
    belegt = set(er.async_get(hass).entities) | set(hass.states.async_entity_ids())
    konfl = konflikte(ids, belegt)
    for u in umkehr:
        if u["ziel"] == "entitaet_id" and u["ref"] in konfl:
            u["zustand"] = "konflikt"
    if nur_vorschau:
        return {"id": letzte["id"], "schritte": umkehr, "konflikte": konfl}
    if konfl:
        raise ValueError("Konflikt: " + ", ".join(f"{a} → {n}" for a, n in konfl.items()))
    entry = hass.config_entries.async_get_entry(eingabe["baustelle_id"])
    assert entry is not None and entry.domain == DOMAIN
    st: Steuerung = entry.runtime_data
    plan, plugs = ausfuehrbar(umkehr), fuer_plug(umkehr)
    ziele = _plug_ziele(hass, st, plugs)
    entfaellt = {u["ref"] for u in plugs if u["ref"] not in ziele}
    fehler: dict[tuple[str, str], str] = {}
    if plan:   # wie beim Umbenennen: anhalten, am Stück in HA, eigene Verweise zurück, am Ende einmal neu laden
        st.neu_laden_folgt = True
        st.async_stop()
        for schritt in plan:
            try:
                _in_ha(hass, schritt)
            except (ValueError, KeyError) as err:
                fehler[(schritt["art"], schritt["ref"])] = str(err) or type(err).__name__
        vorlaeufig = _ergebnisse(umkehr, fehler, set())
        namen = {u["ref"]: u["neu"] for u in vorlaeufig if u["ziel"] == "unter_eintrag" and u["ergebnis"] == "ok"}
        _verweise(hass, st, ids_getauscht(vorlaeufig), namen, benutzer)
    await _plug_namen(hass, [u for u in plugs if u["ref"] in ziele], ziele, fehler)
    erledigt = _ergebnisse(umkehr, fehler, entfaellt)
    schritte, stand = zurueck_eintragen(letzte["schritte"] or [], erledigt)
    await db.async_ausfuehren(lambda v: db_inventar.umbenennung_aendern(v, letzte["id"], schritte, stand))
    offen = sum(1 for u in erledigt if u["ergebnis"] == "fehler")
    st.protokoll("einstellung", eingabe["bereich_id"],
                 f"Umbenennung zurückgenommen ({eingabe['praefix']}_C_{eingabe['art']}): "
                 f"{sum(1 for u in erledigt if u['ergebnis'] == 'ok')} Schritte"
                 + (f", {offen} offen ({', '.join(sorted(set(fehler.values())))})" if offen else ""))
    if plan:
        hass.config_entries.async_schedule_reload(entry.entry_id)
    return {"id": letzte["id"], "status": stand, "schritte": erledigt}


@callback
def nachholen_planen(hass: HomeAssistant, baustelle_id: str) -> CALLBACK_TYPE:
    """Plug-Namen offener Umbenennungen dieser Baustelle selbst nachholen (alle 30 min, nur erreichbare Plugs)."""
    async def runde(_jetzt: datetime) -> None:
        if (db := hass.data.get(DATA_DB)) is None or not db.bereit:
            return
        for cid in await db.async_ausfuehren(db_inventar.umbenennungen_offen) or []:
            eingabe = await async_vorschau(hass, db, cid)
            if eingabe is None or eingabe[0]["baustelle_id"] != baustelle_id:
                continue
            try:
                await async_ausfuehren(hass, db, cid, "automatisch", nur_plug=True)
            except (LookupError, ValueError):
                continue

    return async_track_time_interval(hass, runde, NACHHOLEN)


@websocket_api.websocket_command({vol.Required("type"): "baustelle/inventar_umbenennen", vol.Required("container_id"): str})
@websocket_api.async_response
async def ws_inventar_umbenennen(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]) -> None:
    """Namen und Entity-IDs eines Containers nach dem Schema übernehmen bzw. fehlende Schritte nachholen (BSM-031.06b/c)
    – nur Admins."""
    if not darf(bool(connection.user and connection.user.is_admin), "inventar_umbenennen"):
        connection.send_error(msg["id"], websocket_api.ERR_UNAUTHORIZED, "Nur Admins dürfen umbenennen")
        return
    if (db := _db(hass, connection, msg)) is None:
        return
    try:
        ergebnis = await async_ausfuehren(hass, db, msg["container_id"], connection.user.name if connection.user else None)
    except LookupError as err:
        connection.send_error(msg["id"], websocket_api.ERR_NOT_FOUND, str(err))
        return
    except ValueError as err:
        connection.send_error(msg["id"], "konflikt", str(err))
        return
    connection.send_result(msg["id"], ergebnis)


@websocket_api.websocket_command({vol.Required("type"): "baustelle/inventar_rueckgaengig", vol.Required("container_id"): str,
                                  vol.Optional("vorschau", default=False): bool})
@websocket_api.async_response
async def ws_inventar_rueckgaengig(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]) -> None:
    """Jüngste Umbenennung eines Containers zurücknehmen (BSM-031.06d) – Vorschau alle, Ausführen nur Admins."""
    if not msg["vorschau"] and not darf(bool(connection.user and connection.user.is_admin), "inventar_rueckgaengig"):
        connection.send_error(msg["id"], websocket_api.ERR_UNAUTHORIZED, "Nur Admins dürfen zurücknehmen")
        return
    if (db := _db(hass, connection, msg)) is None:
        return
    try:
        ergebnis = await async_rueckgaengig(hass, db, msg["container_id"], connection.user.name if connection.user else None,
                                            nur_vorschau=msg["vorschau"])
    except LookupError as err:
        connection.send_error(msg["id"], websocket_api.ERR_NOT_FOUND, str(err))
        return
    except ValueError as err:
        connection.send_error(msg["id"], "konflikt", str(err))
        return
    connection.send_result(msg["id"], ergebnis)


BEFEHLE = (ws_inventar_umbenennen, ws_inventar_rueckgaengig)
