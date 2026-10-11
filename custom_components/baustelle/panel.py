"""Eigene Seite „Baustelle“ in der Seitenleiste (wie Alarmo/HACS) und die WebSocket-Befehle dafür (api-0.7 §1–§2, §8)."""

from __future__ import annotations

import base64
import binascii
import os

from datetime import date, datetime, timedelta
from pathlib import Path
from typing import TYPE_CHECKING, Any
import uuid

import voluptuous as vol

from homeassistant.components import panel_custom, websocket_api
from homeassistant.components.http import StaticPathConfig
from homeassistant.core import HomeAssistant, callback
from homeassistant.helpers import config_validation as cv
from homeassistant.util import dt as dt_util

from .abgleich import async_abgleich
from . import auswertung
from .const import DOMAIN, EVENT_PROTOKOLL
from .daten import struktur
from .db import DATA_DB, async_spiegeln, einstellung_merken, ereignis_merken
from .einstellungen import ART_TEXT, EIGEN, TICKET_OFFEN, TICKET_STATUS, Meldungen
from .funktionen.heizung import Heizung
from .funktionen.heizung import hochrechnung as hochrechnung_heizung, prognose_v2 as prognose_v2_heizung
from .geraete import BEFEHLE as GERAETE_BEFEHLE
from .inventar import BEFEHLE as INVENTAR_BEFEHLE
from .umbenennen import BEFEHLE as UMBENENNEN_BEFEHLE
from .logik import preise as preise_logik
from .logik.arbeitszeit import arbeitszeit_loeschen, arbeitszeiten_speichern
from .logik.auswertung import ARTEN
from .logik import hochrechnung as hochrechnung_logik, symbol as symbol_logik
from .logik.rechte import AKTIONEN_ALLE, darf, rechte
from .notprogramm import DATA_NOTPROGRAMM
from .logik.warnungen import Art

if TYPE_CHECKING:
    from .steuerung import Steuerung

URL_PANEL = "baustelle"
URL_STATISCH = "/baustelle_static"
WEBCOMPONENT = "baustelle-panel"
DATA_MELDUNGEN = f"{DOMAIN}_meldungen"
DATA_VERSION = f"{DOMAIN}_version"

UHRZEIT = vol.All(cv.string, vol.Match(r"^([01]\d|2[0-3]):[0-5]\d$"))
DATUM = vol.All(cv.string, cv.date, lambda d: d.isoformat())
ZEIT_ISO = vol.All(cv.string, cv.datetime, lambda z: dt_util.as_local(z).isoformat(timespec="seconds"))
ZAHL = vol.Coerce(float)
GANZ = vol.Coerce(int)


# Erlaubte Pfade für `baustelle/setzen` mit Prüfschema (api-0.7 §2)
SETZEN: dict[tuple[str, ...], Any] = {
    ("automatik",): cv.boolean,
    ("preis",): vol.All(ZAHL, vol.Range(min=0, max=10)),
    ("melden_knopf",): cv.boolean,
    ("auswertung_quelle",): vol.In(["datenbank", "statistik"]),   # BSM-014: Rückweg auf die HA-Statistik
    ("erklaer",): cv.boolean,
    ("termine_kalender",): vol.Any(None, cv.entity_domain("calendar")),
    ("heizung", "vorheizen_min"): vol.All(GANZ, vol.Range(0, 240)),
    ("heizung", "nachheizen_min"): vol.All(GANZ, vol.Range(0, 240)),
    ("heizung", "warm_vor_min"): vol.All(GANZ, vol.Range(0, 240)),
    ("heizung", "warm_nach_min"): vol.All(GANZ, vol.Range(0, 240)),
    ("heizung", "warm_max_min"): vol.All(GANZ, vol.Range(15, 480)),
    ("heizung", "stufen_abstand"): vol.All(ZAHL, vol.Range(0.5, 10)),
    ("heizung", "stufen_min"): vol.All(GANZ, vol.Range(5, 240)),
    ("heizung", "stufen_anstieg"): vol.All(ZAHL, vol.Range(0, 5)),
    ("heizung", "stufen_kalt"): vol.All(ZAHL, vol.Range(-30, 15)),
    ("heizung", "soll"): vol.All(ZAHL, vol.Range(5, 30)),
    ("heizung", "toleranz"): vol.All(ZAHL, vol.Range(0.1, 3)),
    ("heizung", "soll_art"): vol.In(["fest", "gleitend"]),   # Soll gleitend (Herbert 01.10.2026)
    ("heizung", "gleit_min"): vol.All(ZAHL, vol.Range(5, 30)),
    ("heizung", "gleit_max"): vol.All(ZAHL, vol.Range(5, 30)),
    ("heizung", "gleit_je"): vol.All(ZAHL, vol.Range(0, 0.5)),
    ("heizung", "gleit_bezug"): vol.All(ZAHL, vol.Range(0, 20)),
    ("heizung", "gleit_tage"): vol.All(GANZ, vol.Range(1, 7)),
    ("heizung", "heizgrenze"): vol.All(ZAHL, vol.Range(0, 30)),
    ("heizung", "heizgrenze_basis"): vol.In(["jetzt", "tageshoechst"]),
    ("heizung", "fruehstart"): cv.boolean,
    ("heizung", "fruehstart_unter"): vol.All(ZAHL, vol.Range(-30, 20)),
    ("heizung", "fruehstart_min"): vol.All(GANZ, vol.Range(0, 240)),
    ("heizung", "frost"): cv.boolean,
    ("heizung", "frost_grenze"): vol.All(ZAHL, vol.Range(-5, 15)),
    ("heizung", "frost_aus"): vol.Any(None, vol.All(ZAHL, vol.Range(-3, 20))),
    ("heizung", "frei_modus"): vol.In(["frost", "absenk", "aus"]),
    ("heizung", "absenk"): vol.All(ZAHL, vol.Range(5, 20)),
    ("heizung", "frost_immer"): cv.boolean,
    ("heizung", "notprogramm"): cv.boolean,
    ("heizung", "taste"): cv.boolean,   # BSM-018
    ("heizung", "frost_aussen"): vol.Any(None, vol.All(ZAHL, vol.Range(-20, 10))),
    ("heizung", "trocknen_ab_mm"): vol.All(ZAHL, vol.Range(0, 100)),
    ("heizung", "trocknen_laenger_min"): vol.All(GANZ, vol.Range(0, 480)),
    ("heizung", "trocknen_frueher_min"): vol.All(GANZ, vol.Range(0, 240)),
    ("heizung", "tuer_pause_min"): vol.All(GANZ, vol.Range(0, 120)),
    ("heizung", "tuer_melden_min"): vol.All(GANZ, vol.Range(0, 240)),
    ("heizung", "boost_min"): vol.All(GANZ, vol.Range(5, 480)),
    ("heizung", "hand_nachfrist_min"): vol.All(GANZ, vol.Range(0, 240)),   # AN-0012
    ("heizung", "fuehler_halten_min"): vol.All(GANZ, vol.Range(0, 120)),
    ("heizung", "zieht_strom_w"): vol.All(GANZ, vol.Range(5, 500)),
    ("heizung", "baseline"): cv.boolean,   # BSM-033.04
    ("heizung", "baseline_eur_monat"): vol.All(ZAHL, vol.Range(0, 1000)),
    ("heizung", "klimamittel"): lambda w: _klima_pruefen(w),   # noqa: PLW0108 – BSM-033.03: 12 Monatsmittel oder None
    ("heizung", "feiertag_frei"): cv.boolean,
    ("staffel", "an"): cv.boolean,
    ("staffel", "nutzbar_prozent"): vol.All(GANZ, vol.Range(10, 100)),
    ("staffel", "max_gleichzeitig"): vol.All(GANZ, vol.Range(1, 50)),
    ("staffel", "min_lauf_min"): vol.All(GANZ, vol.Range(0, 120)),
    ("staffel", "min_pause_min"): vol.All(GANZ, vol.Range(0, 120)),
    ("staffel", "takt_min"): vol.All(GANZ, vol.Range(1, 240)),
    ("bericht", "haeufigkeit"): vol.In(["aus", "woche", "monat", "beides"]),
    ("bericht", "handy"): cv.boolean,
    ("bericht", "mail"): cv.boolean,
    ("bericht", "mail_an"): vol.All(cv.string, vol.Length(max=500)),
    ("bericht", "mail_dienst"): vol.All(cv.string, vol.Length(max=200)),
    ("bericht", "csv"): cv.boolean,
    ("meldungen_einst", "empfaenger"): vol.All(cv.ensure_list, [cv.slug]),  # Namen von notify-Diensten
    ("meldungen_einst", "knoepfe"): cv.boolean,
    ("meldungen_einst", "arten"): vol.Schema({vol.In([str(a) for a in Art] + ["fruehstart"]): cv.boolean}),
    **{("meldungen_einst", "arten", str(a)): cv.boolean for a in [*Art, "fruehstart"]},
    ("meldungen_einst", "kalt_min"): vol.All(GANZ, vol.Range(1, 1440)),
    ("meldungen_einst", "hand_h"): vol.All(ZAHL, vol.Range(0.5, 240)),
    ("meldungen_einst", "zyklen_h"): vol.All(GANZ, vol.Range(1, 200)),
    ("meldungen_einst", "dauerlauf_min"): vol.All(GANZ, vol.Range(1, 1440)),
    ("meldungen_einst", "trocken_unter_w"): vol.All(ZAHL, vol.Range(0, 5000)),
    ("meldungen_einst", "offline_min"): vol.All(ZAHL, vol.Range(0, 1440)),
}
def _klima_pruefen(wert: Any) -> Any:
    try:
        return hochrechnung_logik.klimamittel_pruefen(wert)
    except ValueError as err:
        raise vol.Invalid(str(err)) from err


def _symbol_pruefen(wert: Any) -> Any:
    try:
        return symbol_logik.bereinigen(wert)
    except (ValueError, TypeError) as err:
        raise vol.Invalid(str(err)) from err


SETZEN_BEREICH: dict[str, Any] = {
    "auto": cv.boolean,
    "trocknen": cv.boolean,
    "soll": vol.Any(None, vol.All(ZAHL, vol.Range(5, 30))),
    "bedarf": cv.boolean,
    "prio": vol.In(["niedrig", "normal", "hoch"]),
    "anschluss": cv.string,
    "tuer": vol.Any(None, cv.entity_domain("binary_sensor")),
    "modus": vol.In(["plan", "thermo", "bedarf", "hand", "aus"]),
    "lernen": cv.boolean,
    "warm_vor": vol.Any(None, vol.All(GANZ, vol.Range(0, 240))),
    "warm_nach": vol.Any(None, vol.All(GANZ, vol.Range(0, 240))),
    "stufen": cv.boolean,
    "groesse_m2": vol.Any(None, vol.All(ZAHL, vol.Range(4, 200))),   # AN-0014
    "symbol": _symbol_pruefen,   # BSM-032
}
SETZEN_GERAET: dict[str, Any] = {   # AN-0006, Szenarien
    "zusatz": cv.boolean,
    "nenn_kw": vol.Any(None, vol.All(ZAHL, vol.Range(0, 10))),   # Leistung ohne Messung (Staffelung)
}

ARBEITSZEIT = vol.Schema({
    vol.Required("ab"): DATUM,
    vol.Optional("name", default=""): vol.All(cv.string, vol.Length(max=100)),
    vol.Required("tage"): {vol.In([str(i) for i in range(7)]): vol.Any(None, vol.All([UHRZEIT], vol.Length(2, 2)))},
    vol.Optional("alt_ab"): DATUM,
})
AUSNAHME = vol.Schema({
    vol.Required("datum"): DATUM,
    vol.Required("art"): vol.In(["arbeit", "zeiten", "frei"]),
    vol.Optional("von"): vol.Any(None, vol.All("", lambda _: None), UHRZEIT),
    vol.Optional("bis"): vol.Any(None, vol.All("", lambda _: None), UHRZEIT),
    vol.Optional("notiz", default=""): vol.All(cv.string, vol.Length(max=200)),
})
ANSCHLUSS = vol.Schema({
    vol.Optional("id"): cv.string,
    vol.Required("name"): vol.All(cv.string, vol.Length(min=1, max=100)),
    vol.Required("ampere"): vol.All(ZAHL, vol.Range(1, 1000)),
    vol.Required("phasen"): vol.All(GANZ, vol.In([1, 3])),
    vol.Optional("reserve_kw", default=0.0): vol.All(ZAHL, vol.Range(0, 500)),
    vol.Optional("container"): [cv.string],
})
FIRMA = vol.Schema({
    vol.Optional("id"): cv.string,
    vol.Required("name"): vol.All(cv.string, vol.Length(min=1, max=100)),
    vol.Optional("eigen"): cv.boolean,
    vol.Optional("container"): [cv.string],
})
MELDUNG = vol.Schema({
    vol.Required("art"): vol.In(["fehler", "wunsch", "anregung"]),
    vol.Required("text"): vol.All(cv.string, vol.Length(min=1, max=5000)),
    vol.Optional("kontext", default=""): vol.All(cv.string, vol.Length(max=5000)),
    vol.Optional("geraet", default=""): vol.All(cv.string, vol.Length(max=100)),
    vol.Optional("version"): vol.All(cv.string, vol.Length(max=50)),
    # „Stand der Seite mitschicken“ (Mockup): Ansicht, Container, Dialog – ohne Zugangsdaten
    vol.Optional("seite"): vol.Any(None, vol.All(
        vol.Schema({vol.All(cv.string, vol.Length(max=50)): vol.Any(None, bool, int, float, vol.All(cv.string, vol.Length(max=200)))}),
        vol.Length(max=20))),
}, extra=vol.REMOVE_EXTRA)


# WU-0016: bis zu 3 Bilder je Meldung (von der Seite verkleinert), als Datei neben meldungen.json
BILD_ARTEN = {"image/jpeg": "jpg", "image/png": "png", "image/webp": "webp"}
BILD_MAX_BYTES = 1_500_000
BILDER = vol.All(list, vol.Length(max=3), [vol.All(cv.string, vol.Length(max=2_100_000))])


def _bild_lesen(url: str) -> tuple[str, bytes]:
    """Data-URL → (Endung, Bytes); nur JPEG/PNG/WebP, höchstens BILD_MAX_BYTES."""
    kopf, _, daten = url.partition(",")
    art = kopf.removeprefix("data:").removesuffix(";base64")
    if art not in BILD_ARTEN or not kopf.endswith(";base64"):
        raise vol.Invalid("bilder: nur JPEG, PNG oder WebP")
    try:
        roh = base64.b64decode(daten, validate=True)
    except (binascii.Error, ValueError) as err:
        raise vol.Invalid("bilder: kein gültiges Bild") from err
    if len(roh) > BILD_MAX_BYTES:
        raise vol.Invalid("bilder: Bild zu groß (höchstens 1,5 MB)")
    return BILD_ARTEN[art], roh


def _bilder_schreiben(ordner: str, ticket: str, bilder: list[tuple[str, bytes]]) -> list[str]:
    ziel = os.path.join(ordner, "meldungen")
    os.makedirs(ziel, exist_ok=True)
    namen = []
    for i, (endung, roh) in enumerate(bilder, 1):
        name = f"{ticket}-{i}.{endung}"
        with open(os.path.join(ziel, name), "wb") as f:
            f.write(roh)
        namen.append(name)
    return namen


def _bild_url(ordner: str, name: str) -> str:
    endung = name.rsplit(".", 1)[-1]
    art = next((k for k, v in BILD_ARTEN.items() if v == endung), "image/jpeg")
    with open(os.path.join(ordner, "meldungen", os.path.basename(name)), "rb") as f:
        return f"data:{art};base64," + base64.b64encode(f.read()).decode()


def _bilder_loeschen(ordner: str, namen: list[str]) -> None:
    for name in namen:
        try:
            os.remove(os.path.join(ordner, "meldungen", os.path.basename(name)))
        except FileNotFoundError:
            pass


async def async_panel_anmelden(hass: HomeAssistant, version: str) -> None:
    """JavaScript ausliefern, Seite in der Seitenleiste und WebSocket-Befehle anmelden (einmal je HA-Start)."""
    await hass.http.async_register_static_paths(
        [StaticPathConfig(URL_STATISCH, str(Path(__file__).parent / "frontend"), cache_headers=False)]
    )
    await panel_custom.async_register_panel(
        hass,
        frontend_url_path=URL_PANEL,
        webcomponent_name=WEBCOMPONENT,
        sidebar_title="Baustelle",
        sidebar_icon="mdi:crane",
        module_url=f"{URL_STATISCH}/baustelle-panel.js?v={version}",
        require_admin=False,
        config={"version": version},
    )
    hass.data[DATA_VERSION] = version
    hass.data[DATA_MELDUNGEN] = Meldungen(hass)
    hass.async_create_task(hass.data[DATA_MELDUNGEN].async_laden(), "baustelle_meldungen_laden")  # lesbare Kopie beim Start
    for befehl in (ws_struktur, ws_setzen, ws_liste, ws_aktion, ws_bericht, ws_protokoll, ws_meldungen, ws_meldung,
                   ws_auswertung, ws_abrechnung, ws_ohne, ws_tagesverlauf, ws_prognose_v2, ws_statistik, ws_verlauf, ws_notprogramm_pruefen, ws_notprogramm_probe,
                   *INVENTAR_BEFEHLE, *UMBENENNEN_BEFEHLE, *GERAETE_BEFEHLE):
        websocket_api.async_register_command(hass, befehl)


def _steuerung(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]) -> Steuerung | None:
    entry = hass.config_entries.async_get_entry(msg["entry_id"])
    st: Steuerung | None = getattr(entry, "runtime_data", None) if entry is not None and entry.domain == DOMAIN else None
    if st is None:
        connection.send_error(msg["id"], websocket_api.ERR_NOT_FOUND, "Baustelle nicht gefunden oder nicht geladen")
    return st


def _darf(connection: websocket_api.ActiveConnection, msg: dict[str, Any], befehl: str, aktion: str | None = None) -> bool:
    """Ändern nur Admins, Ausnahmen in `logik.rechte` (Bauplan 0.7 §8); sonst Fehler `unauthorized`."""
    if darf(bool(connection.user and connection.user.is_admin), befehl, aktion):
        return True
    connection.send_error(msg["id"], websocket_api.ERR_UNAUTHORIZED, "Nur Admins dürfen ändern")
    return False


def _benutzer(connection: websocket_api.ActiveConnection) -> str | None:
    return connection.user.name if connection.user else None


def _aktion_merken(hass: HomeAssistant, connection: websocket_api.ActiveConnection, st: Steuerung, msg: dict[str, Any]) -> None:
    """Eigene Datenbank (BSM-007, §6): Bedienung vor Ort als Ereignis ohne Person, alles andere als Einstellung mit Benutzer."""
    felder = {k: msg[k] for k in ("bereich", "geraet", "minuten", "bis", "boost", "an", "key", "art", "wert", "d", "kwh", "eur") if k in msg}
    if msg["aktion"] in AKTIONEN_ALLE:
        ereignis_merken(hass, st.entry.entry_id, msg["aktion"], felder, "seite", bereich_id=msg.get("bereich"), geraet_id=msg.get("geraet"))
    else:
        einstellung_merken(hass, st.entry.entry_id, f"aktion.{msg['aktion']}", felder, _benutzer(connection),
                           bereich_id=msg.get("bereich"), geraet_id=msg.get("geraet"))


def _fehler(connection: websocket_api.ActiveConnection, msg: dict[str, Any], text: str) -> None:
    connection.send_error(msg["id"], websocket_api.ERR_INVALID_FORMAT, text)


# ---------------------------------------------------------------------- struktur
@websocket_api.websocket_command({vol.Required("type"): "baustelle/struktur"})
@callback
def ws_struktur(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]) -> None:
    """Alle Baustellen (auch abgeschlossene) mit Einrichtung, Einstellungen, Zählern und Laufzeit."""
    version = hass.data.get(DATA_VERSION, "")
    r = rechte(bool(connection.user and connection.user.is_admin))   # Bauplan 0.7 §8: für den angemeldeten Benutzer
    connection.send_result(
        msg["id"], [{**struktur(hass, entry, version), "rechte": r} for entry in hass.config_entries.async_entries(DOMAIN)]
    )


# ---------------------------------------------------------------------- setzen
def pruefe_setzen(st: Any, pfad: list[str], wert: Any) -> Any:
    """Pfad und Wert prüfen; liefert den bereinigten Wert oder wirft vol.Invalid."""
    schluessel = tuple(pfad)
    if len(pfad) == 3 and pfad[0] == "bereiche":
        if pfad[1] not in st.bereiche:
            raise vol.Invalid(f"Unbekannter Container {pfad[1]}")
        if pfad[2] not in SETZEN_BEREICH:
            raise vol.Invalid(f"Pfad {'.'.join(pfad)} ist nicht erlaubt")
        wert = SETZEN_BEREICH[pfad[2]](wert)
        if pfad[2] == "anschluss" and wert not in {a["id"] for a in st.e["anschluesse"]}:
            raise vol.Invalid(f"Unbekannter Anschluss {wert}")
        if pfad[2] == "lernen" and wert and not st.bereiche[pfad[1]].fuehler:
            raise vol.Invalid("Die lernende Regelung braucht einen Temperaturfühler")   # Szenarien
        if pfad[2] == "modus" and wert == "thermo" and not st.bereiche[pfad[1]].fuehler:
            raise vol.Invalid("Thermostat braucht einen Temperaturfühler")
        return wert
    if len(pfad) == 3 and pfad[0] == "geraete":
        if pfad[1] not in st.geraete:
            raise vol.Invalid(f"Unbekanntes Gerät {pfad[1]}")
        if pfad[2] not in SETZEN_GERAET:
            raise vol.Invalid(f"Pfad {'.'.join(pfad)} ist nicht erlaubt")
        st.e.setdefault("geraete", {}).setdefault(pfad[1], {})   # Eintrag des Geräts anlegen, damit der Pfad besteht
        return SETZEN_GERAET[pfad[2]](wert)
    if schluessel == ("heizung", "frost_aus"):
        wert = SETZEN[schluessel](wert)
        if wert is not None and wert <= float(st.e["heizung"]["frost_grenze"]):
            raise vol.Invalid("Frostschutz „aus über“ muss über „ein unter“ liegen")
        return wert
    if schluessel == ("heizung", "frost_grenze"):
        wert = SETZEN[schluessel](wert)
        aus = st.e["heizung"].get("frost_aus")
        if aus is not None and wert >= float(aus):
            raise vol.Invalid("Frostschutz „ein unter“ muss unter „aus über“ liegen")
        return wert
    if schluessel not in SETZEN:
        raise vol.Invalid(f"Pfad {'.'.join(pfad)} ist nicht erlaubt")
    return SETZEN[schluessel](wert)


@websocket_api.websocket_command({
    vol.Required("type"): "baustelle/notprogramm_pruefen",
    vol.Required("entry_id"): str,
})
@websocket_api.async_response
async def ws_notprogramm_pruefen(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]) -> None:
    """BSM-019: jetzt eine Runde des Notprogramms (Skript, Kopplungen, Programm, Lebenszeichen) – nur Admins."""
    if not _darf(connection, msg, "notprogramm_pruefen") or _steuerung(hass, connection, msg) is None:
        return
    np = hass.data.get(DATA_NOTPROGRAMM, {}).get(msg["entry_id"])
    if np is None:
        _fehler(connection, msg, "Notprogramm nicht geladen")
        return
    await np.async_runde()
    connection.send_result(msg["id"], np.info())


@websocket_api.websocket_command({
    vol.Required("type"): "baustelle/notprogramm_probe",
    vol.Required("entry_id"): str,
    vol.Required("geraet"): str,
    vol.Required("minuten"): vol.All(vol.Coerce(int), vol.Range(0, 240)),
})
@callback
def ws_notprogramm_probe(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]) -> None:
    """BSM-021: Ausfall-Probe für einen Heizungs-Plug starten (minuten > 0) bzw. beenden (0) – nur Admins."""
    if not _darf(connection, msg, "notprogramm_probe") or (st := _steuerung(hass, connection, msg)) is None:
        return
    np = hass.data.get(DATA_NOTPROGRAMM, {}).get(msg["entry_id"])
    g = st.geraete.get(msg["geraet"])
    if np is None or g is None or np.geraet_info(g.id) is None or not np.an:
        _fehler(connection, msg, "Ausfall-Probe nur für Heizungs-Plugs mit eingeschaltetem Notprogramm")
        return
    if msg["minuten"]:
        np.probe_starten(g, msg["minuten"])
    else:
        np.probe_beenden(g)
    connection.send_result(msg["id"], np.geraet_info(g.id))


@websocket_api.websocket_command({
    vol.Required("type"): "baustelle/setzen",
    vol.Required("entry_id"): str,
    vol.Required("pfad"): vol.All([str], vol.Length(min=1, max=4)),
    vol.Required("wert"): object,
})
@callback
def ws_setzen(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]) -> None:
    """Eine Einstellung setzen (Pfad + Wert, geprüft)."""
    if not _darf(connection, msg, "setzen") or (st := _steuerung(hass, connection, msg)) is None:
        return
    try:
        wert = pruefe_setzen(st, msg["pfad"], msg["wert"])
    except vol.Invalid as err:
        _fehler(connection, msg, str(err))
        return
    pfad = list(msg["pfad"])
    Heizung.von(st).hand_nach_einstellung(pfad)   # FE-0004: geänderte Einstellung gilt sofort
    if pfad[0] == "bereiche" and pfad[2] in ("modus", "auto", "bedarf"):
        # Modus (neu 0.7.8) und die bisherigen Felder auto/bedarf passend halten: Modus setzt beide, auto/bedarf allein
        # heben einen gesetzten Modus auf (dann wird er wieder abgeleitet)
        b = st.einstellungen.bereich(pfad[1])
        if pfad[2] == "modus":
            b["auto"], b["bedarf"] = wert != "hand", wert == "bedarf"
            if wert != "bedarf":
                st.lz["bedarf_bis"].pop(pfad[1], None)
        else:
            b["modus"] = None
        st.einstellung_setzen(pfad, wert)
        if pfad[2] == "modus":
            st.entry.async_create_background_task(hass, st._async_kalender(), "baustelle_kalender")
    elif pfad[:2] == ["meldungen_einst", "arten"] and len(pfad) == 3:
        st.e["meldungen_einst"]["arten"][pfad[2]] = wert
        st.einstellungen.speichern()
        st.auswerten()
    else:
        st.einstellung_setzen(pfad, wert)
    einstellung_merken(hass, st.entry.entry_id, ".".join(pfad), wert, _benutzer(connection),   # BSM-007: mit Benutzer
                       bereich_id=pfad[1] if pfad[0] == "bereiche" else None, geraet_id=pfad[1] if pfad[0] == "geraete" else None)
    hass.async_create_task(async_spiegeln(hass, struktur(hass, st.entry)), "baustelle_datenbank_spiegeln")
    if pfad == ["heizung", "klimamittel"]:   # Hochrechnung gleich neu (BSM-033.03)
        from .funktionen.heizung.hochrechnung import async_rechnen   # noqa: PLC0415
        st.entry.async_create_background_task(hass, async_rechnen(hass, Heizung.von(st)), "baustelle_hochrechnung")
    if pfad[0] == "bereiche" and pfad[-1] in ("tuer", "symbol"):   # Sensoren geändert: Inventar nachziehen (BSM-034.04)
        st.entry.async_create_background_task(hass, async_abgleich(hass, st), "baustelle_abgleich")
    connection.send_result(msg["id"], {"ok": True})


# ---------------------------------------------------------------------- liste
def _neue_id(praefix: str) -> str:
    return f"{praefix}_{uuid.uuid4().hex[:8]}"


def _liste_aendern(st: Any, liste: str, aktion: str, eintrag: dict[str, Any]) -> dict[str, Any]:
    e = st.e
    jetzt = dt_util.now()
    if liste == "preise":   # Strompreis mit „gilt ab“ (Herbert 04.10.2026)
        ab = DATUM(eintrag.get("ab"))
        roh = e.get("preise") or ([{"ab": "2000-01-01", "preis": e["preis"]}] if aktion == "speichern" else [])
        if aktion == "loeschen":
            if len(roh) <= 1:
                raise vol.Invalid("Der letzte Strompreis lässt sich nicht löschen")
            e["preise"] = [x for x in roh if str(x.get("ab")) != ab]
            st.protokoll("einstellung", None, f"Strompreis ab {_datum(ab)} gelöscht")
        else:
            preis = vol.All(ZAHL, vol.Range(min=0, max=10))(eintrag.get("preis"))
            e["preise"] = preise_logik.speichern(roh, date.fromisoformat(ab), preis)
            st.protokoll("einstellung", None, f"Strompreis {preis:.2f} €/kWh ab {_datum(ab)}".replace(".", ","))
        st.preis_abgleichen()
        return {"ok": True}
    if liste == "arbeitszeiten":
        if aktion == "loeschen":
            ab = DATUM(eintrag.get("ab"))
            try:
                e["arbeitszeiten"] = arbeitszeit_loeschen(e["arbeitszeiten"], ab)
            except ValueError:
                raise vol.Invalid("Die letzte Arbeitszeit bleibt – ohne Arbeitszeit liefe nur der Frostschutz") from None
            st.protokoll("einstellung", None, f"Arbeitszeit ab {_datum(ab)} gelöscht")
            return {"ok": True}
        x = ARBEITSZEIT(eintrag)
        alt = x.pop("alt_ab", None)
        for tag, zeit in x["tage"].items():
            if zeit is not None and zeit[1] <= zeit[0]:
                raise vol.Invalid(f"Arbeitszeit am Tag {tag}: Ende vor Beginn")
        x["tage"] = {str(i): x["tage"].get(str(i)) for i in range(7)}
        try:   # eine eigene ersetzt die automatisch angelegte (FE-0002)
            e["arbeitszeiten"] = arbeitszeiten_speichern(e["arbeitszeiten"], x, alt)
        except ValueError:
            raise vol.Invalid(f"Es gibt schon eine Arbeitszeit ab {_datum(x['ab'])}") from None
        text = "geändert" if alt else "gilt ab"
        st.protokoll("einstellung", None, f"{'Arbeitszeit' if alt else 'Neue Arbeitszeit'} „{x['name']}“ {text} {_datum(x['ab'])}")
        return {"ok": True}
    if liste == "ausnahmen":
        datum = DATUM(eintrag.get("datum"))
        if aktion == "loeschen":
            # FE-0012: mit von/bis/art nur dieses Zeitfenster, sonst alle des Tages
            if eintrag.get("art"):
                def weg(a: dict[str, Any]) -> bool:
                    return bool(a["datum"] == datum and a["art"] == eintrag["art"]
                                and a.get("von") == eintrag.get("von") and a.get("bis") == eintrag.get("bis"))
                e["ausnahmen"] = [a for a in e["ausnahmen"] if not weg(a)]
                was = "frei" if eintrag["art"] == "frei" else f"{eintrag.get('von')}–{eintrag.get('bis')}"
                st.protokoll("einstellung", None, f"Ausnahme am {_datum(datum)} ({was}) gelöscht")
            else:
                e["ausnahmen"] = [a for a in e["ausnahmen"] if a["datum"] != datum]
                st.protokoll("einstellung", None, f"Ausnahme am {_datum(datum)} gelöscht")
            return {"ok": True}
        # erst prüfen, dann ersetzen: ein abgelehnter Eintrag löscht die bisherige Ausnahme des Tages nicht
        x = AUSNAHME(eintrag)
        if x["art"] != "frei":
            if not x.get("von") or not x.get("bis") or x["bis"] <= x["von"]:
                raise vol.Invalid("Ausnahme braucht von und bis (bis nach von)")
        else:
            x["von"] = x["bis"] = None
        # FE-0012: mehrere Zeitfenster je Tag – „frei“ ersetzt alle des Tages, ein Zeitfenster ersetzt nur „frei“ und
        # ein gleiches (gleiche Zeiten); die übrigen bleiben
        if x["art"] == "frei":
            andere = [a for a in e["ausnahmen"] if a["datum"] != datum]
        else:
            andere = [a for a in e["ausnahmen"] if a["datum"] != datum or (
                a["art"] != "frei" and not (a.get("von") == x["von"] and a.get("bis") == x["bis"]))]
        e["ausnahmen"] = sorted([*andere, x], key=lambda a: (a["datum"], a.get("von") or ""))
        was = {"arbeit": "zusätzlich arbeiten", "zeiten": "andere Zeiten", "frei": "frei"}[x["art"]]
        zeiten = f" {x['von']}–{x['bis']}" if x["art"] != "frei" else ""
        st.protokoll("einstellung", None, f"Ausnahme {_datum(datum)}: {was}{zeiten}" + (f" ({x['notiz']})" if x["notiz"] else ""))
        return {"ok": True}
    if liste == "anschluesse":
        if aktion == "loeschen":
            aid = str(eintrag.get("id"))
            if aid not in {a["id"] for a in e["anschluesse"]}:
                raise KeyError(aid)
            if len(e["anschluesse"]) <= 1:
                raise vol.Invalid("Der letzte Anschluss kann nicht gelöscht werden")
            e["anschluesse"] = [a for a in e["anschluesse"] if a["id"] != aid]
            erster = e["anschluesse"][0]["id"]
            for b in e["bereiche"].values():
                if b.get("anschluss") == aid:
                    b["anschluss"] = erster
            st.protokoll("einstellung", None, "Anschluss gelöscht")
            return {"ok": True}
        x = ANSCHLUSS(eintrag)
        container = x.pop("container", None)
        _container_pruefen(st, container)
        aid = x.get("id") or _neue_id("a")
        x["id"] = aid
        e["anschluesse"] = [x if a["id"] == aid else a for a in e["anschluesse"]]
        if aid not in {a["id"] for a in e["anschluesse"]}:
            e["anschluesse"].append(x)
        for bid in container or []:
            st.einstellungen.bereich(bid)["anschluss"] = aid
        if container is not None:
            # wie Mockup: nimmt man einen Container aus der Liste, hängt er am ersten anderen Anschluss
            erster = e["anschluesse"][0]["id"]
            rest = next((a["id"] for a in e["anschluesse"] if a["id"] != aid), None)
            for bid in st.bereiche:
                eb = st.einstellungen.bereich(bid)
                if bid not in container and rest and (eb.get("anschluss") or erster) == aid:
                    eb["anschluss"] = rest
        st.protokoll("einstellung", None, f"Anschluss „{x['name']}“ gespeichert")
        return {"ok": True, "id": aid}
    if liste == "firmen":
        if aktion == "loeschen":
            fid = str(eintrag.get("id"))
            firma = next((f for f in e["firmen"] if f["id"] == fid), None)
            if firma is None:
                raise KeyError(fid)
            if firma.get("eigen") or fid == EIGEN:
                raise vol.Invalid("Die eigene Firma kann nicht gelöscht werden")
            e["firmen"] = [f for f in e["firmen"] if f["id"] != fid]
            for bid in st.bereiche:
                if _firma_jetzt(e, bid, jetzt) == fid:
                    e["zuordnung"].append({"bereich": bid, "firma": EIGEN, "ab": jetzt.isoformat(timespec="seconds")})
            st.protokoll("einstellung", None, f"Firma „{firma['name']}“ gelöscht")
            return {"ok": True}
        x = FIRMA(eintrag)
        container = x.pop("container", None)
        _container_pruefen(st, container)
        fid = x.get("id") or _neue_id("f")
        x["id"] = fid
        vorhanden = next((f for f in e["firmen"] if f["id"] == fid), None)
        if vorhanden is not None:
            vorhanden["name"] = x["name"]
        else:
            x["eigen"] = False
            e["firmen"].append(x)
        if container is not None:
            # „Der Verbrauch wird ab jetzt zugeordnet“ – frühere Werte bleiben bei der bisherigen Firma
            for bid in st.bereiche:
                bisher = _firma_jetzt(e, bid, jetzt)
                if bid in container and bisher != fid:
                    e["zuordnung"].append({"bereich": bid, "firma": fid, "ab": jetzt.isoformat(timespec="seconds")})
                elif bid not in container and bisher == fid and fid != EIGEN:
                    e["zuordnung"].append({"bereich": bid, "firma": EIGEN, "ab": jetzt.isoformat(timespec="seconds")})
        st.protokoll("einstellung", None, f"Firma „{x['name']}“ gespeichert")
        return {"ok": True, "id": fid}
    raise vol.Invalid(f"Unbekannte Liste {liste}")


def _container_pruefen(st: Any, container: list[str] | None) -> None:
    """Alle Container einer Zuordnung müssen existieren – geprüft, bevor etwas geändert wird."""
    for bid in container or []:
        if bid not in st.bereiche:
            raise vol.Invalid(f"Unbekannter Container {bid}")


def _firma_jetzt(e: dict[str, Any], bid: str, jetzt: datetime) -> str:
    from .logik.abrechnung import firma_am  # noqa: PLC0415

    return firma_am(e["zuordnung"], bid, jetzt)


def _datum(iso: str) -> str:
    return "{2}.{1}.{0}".format(*iso.split("-"))


@websocket_api.websocket_command({
    vol.Required("type"): "baustelle/liste",
    vol.Required("entry_id"): str,
    vol.Required("liste"): vol.In(["arbeitszeiten", "ausnahmen", "anschluesse", "firmen", "preise"]),
    vol.Required("aktion"): vol.In(["speichern", "loeschen"]),
    vol.Required("eintrag"): dict,
})
@callback
def ws_liste(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]) -> None:
    """Eintrag einer Liste anlegen, ändern oder löschen."""
    if not _darf(connection, msg, "liste") or (st := _steuerung(hass, connection, msg)) is None:
        return
    Heizung.von(st).plan_neu()
    try:
        ergebnis = _liste_aendern(st, msg["liste"], msg["aktion"], msg["eintrag"])
    except vol.Invalid as err:
        _fehler(connection, msg, str(err))
        return
    except KeyError as err:
        connection.send_error(msg["id"], websocket_api.ERR_NOT_FOUND, f"Nicht gefunden: {err}")
        return
    st.einstellungen.speichern()
    st.auswerten()
    einstellung_merken(hass, st.entry.entry_id, f"liste.{msg['liste']}", {"aktion": msg["aktion"], "eintrag": msg["eintrag"]},
                       _benutzer(connection))   # BSM-007: mit Benutzer
    hass.async_create_task(async_spiegeln(hass, struktur(hass, st.entry)), "baustelle_datenbank_spiegeln")
    connection.send_result(msg["id"], ergebnis)


# ---------------------------------------------------------------------- aktion
@websocket_api.websocket_command({
    vol.Required("type"): "baustelle/aktion",
    vol.Required("entry_id"): str,
    vol.Required("aktion"): vol.In(
        ["bedarf", "bedarf_aus", "boost", "jetzt_heizen", "schalten", "automatik", "warnung_stumm", "bericht_senden",
         "test_meldung", "lern_reset", "aktiv", "gefuehl", "soll_versch", "soll_versch_weg", "gefuehl_vergessen",
         "zuruecksetzen", "energie_korrektur"]
    ),
    vol.Optional("bereich"): str,
    vol.Optional("geraet"): str,
    vol.Optional("minuten"): vol.Any(None, vol.All(vol.Coerce(int), vol.Range(1, 24 * 60))),
    vol.Optional("bis"): vol.Any(None, str),
    vol.Optional("boost"): bool,
    vol.Optional("an"): bool,
    vol.Optional("key"): str,
    vol.Optional("art"): vol.In(["woche", "monat"]),
    vol.Optional("wert"): vol.In([-1, 0, 1]),                       # Gefühl: zu kalt | passt | zu warm
    vol.Optional("d"): vol.All(vol.Coerce(float), vol.Range(-5, 5)),   # + / − am Rad (Soll gleitend)
    vol.Optional("kwh"): vol.All(vol.Coerce(float), vol.Range(0, 1000)),   # FE-0016: falsch gezählte Energie
    vol.Optional("eur"): vol.All(vol.Coerce(float), vol.Range(0, 1000)),   # … bzw. nur Kosten
})
@websocket_api.async_response
async def ws_aktion(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]) -> None:
    """Bedarf, Boost, alle jetzt heizen, Gerät schalten, Warnung stumm, Bericht jetzt senden."""
    if not _darf(connection, msg, "aktion", msg["aktion"]) or (st := _steuerung(hass, connection, msg)) is None:
        return
    aktion = msg["aktion"]
    jetzt = dt_util.now()
    lz = st.lz
    try:
        bis = ZEIT_ISO(msg["bis"]) if msg.get("bis") else None
    except vol.Invalid as err:
        _fehler(connection, msg, f"bis: {err}")
        return
    if aktion in ("bedarf", "bedarf_aus", "boost"):
        bid = msg.get("bereich")
        if bid not in st.bereiche:
            connection.send_error(msg["id"], websocket_api.ERR_NOT_FOUND, "Container nicht gefunden")
            return
        name = st.bereiche[bid].name
        boost_bis = (jetzt + timedelta(minutes=int(st.e["heizung"]["boost_min"]))).isoformat(timespec="seconds")
        if aktion == "bedarf":
            if bis is None and not msg.get("minuten"):
                _fehler(connection, msg, "bedarf braucht minuten oder bis")
                return
            ende = bis or (jetzt + timedelta(minutes=msg["minuten"])).isoformat(timespec="seconds")
            lz["bedarf_bis"][bid] = ende
            if msg.get("boost"):
                lz["boost_bis"][bid] = min(boost_bis, ende)
            st.protokoll("schalten", bid, f"{name} heizt bis {dt_util.parse_datetime(ende, raise_on_error=True).strftime('%H:%M')}"
                         + (" · ⚡ schnell" if msg.get("boost") else ""))
        elif aktion == "bedarf_aus":
            lz["bedarf_bis"].pop(bid, None)
            lz["boost_bis"].pop(bid, None)
            st.protokoll("schalten", bid, f"{name}: Bedarf beendet")
        elif msg.get("an", True):
            lz["boost_bis"][bid] = boost_bis
            st.protokoll("schalten", bid, f"{name}: schnell aufheizen ({st.e['heizung']['boost_min']} min)")
        else:
            lz["boost_bis"].pop(bid, None)
            st.protokoll("schalten", bid, f"{name}: schnell aufheizen beendet")
    elif aktion == "jetzt_heizen":
        if msg.get("minuten"):
            lz["jetzt_bis"] = (jetzt + timedelta(minutes=msg["minuten"])).isoformat(timespec="seconds")
            st.protokoll("schalten", None, f"Alle jetzt heizen bis {(jetzt + timedelta(minutes=msg['minuten'])).strftime('%H:%M')}")
        elif bis:
            lz["jetzt_bis"] = bis
            st.protokoll("schalten", None, f"Alle jetzt heizen bis {dt_util.parse_datetime(bis, raise_on_error=True).strftime('%H:%M')}")
        else:
            lz["jetzt_bis"] = None
            st.protokoll("schalten", None, "„Alle jetzt heizen“ beendet")
    elif aktion == "aktiv":
        g = st.geraete.get(msg.get("geraet") or "")
        if g is None or "an" not in msg:
            connection.send_error(msg["id"], websocket_api.ERR_NOT_FOUND, "Gerät nicht gefunden")
            return
        st.geraet_status_setzen(g, "aktiv" if msg["an"] else "inaktiv")
        _aktion_merken(hass, connection, st, msg)
        connection.send_result(msg["id"], {"ok": True})
        return
    elif aktion in ("schalten", "automatik"):
        g = st.geraete.get(msg.get("geraet") or "")
        if g is None:
            connection.send_error(msg["id"], websocket_api.ERR_NOT_FOUND, "Gerät nicht gefunden")
            return
        if aktion == "automatik":
            Heizung.von(st).hand_beenden(g.id, "wieder auf Automatik")
        elif "an" not in msg:
            _fehler(connection, msg, "schalten braucht an")
            return
        else:
            st.geraet_schalten(g, msg["an"])
    elif aktion == "warnung_stumm":
        key = msg.get("key")
        if not key:
            _fehler(connection, msg, "warnung_stumm braucht key")
            return
        w = next((x for x in st.daten.warnungen if x.key == key), None)
        from .logik.warnungen import titel  # noqa: PLC0415
        from .steuerung import morgen_frueh  # noqa: PLC0415

        if msg.get("bis", "morgen") is None:
            st.e["stumm"].pop(key, None)
            st.protokoll("einstellung", w.bereich if w else None, f"Wird wieder gemeldet: {titel(w) if w else key}")
        else:
            st.e["stumm"][key] = bis or morgen_frueh(jetzt).isoformat(timespec="seconds")
            st.protokoll("einstellung", w.bereich if w else None, f"Stumm bis {_datum(st.e['stumm'][key][:10])}: {titel(w) if w else key}")
    elif aktion == "test_meldung":
        # Test-Nachricht an alle Empfänger (wie der Knopf „Test-Meldung“ in 0.6)
        an = st.nachrichten.melden("🔔 Test", f"{st.entry.title}: Nachrichten der Baustelle kommen an.", tag="baustelle_test")
        connection.send_result(msg["id"], {"ok": True, "an": an})
        return
    elif aktion == "lern_reset":
        bid = msg.get("bereich")
        if bid not in st.bereiche:
            connection.send_error(msg["id"], websocket_api.ERR_NOT_FOUND, "Container nicht gefunden")
            return
        lz.setdefault("lernen", {}).pop(bid, None)
        lz.setdefault("warm_start", {}).pop(bid, None)   # auch der festgehaltene Beginn von heute (Szenario-Befund)
        st.protokoll("einstellung", bid, f"{st.bereiche[bid].name}: Lernstand zurückgesetzt")
    elif aktion in ("gefuehl", "soll_versch", "soll_versch_weg"):   # Soll gleitend (Herbert 01.10.2026)
        bid = msg.get("bereich")
        if bid not in st.bereiche:
            connection.send_error(msg["id"], websocket_api.ERR_NOT_FOUND, "Container nicht gefunden")
            return
        hz = Heizung.von(st)
        if aktion == "gefuehl":
            if "wert" not in msg:
                _fehler(connection, msg, "gefuehl braucht wert")
                return
            hz.gefuehl_merken(bid, int(msg["wert"]), jetzt)
        elif aktion == "soll_versch":
            if "d" not in msg:
                _fehler(connection, msg, "soll_versch braucht d")
                return
            hz.soll_verschieben(bid, float(msg["d"]), jetzt)
        else:
            hz.soll_versch_weg(bid)
    elif aktion == "gefuehl_vergessen":
        lz["gefuehl"] = []
        st.protokoll("einstellung", None, "Soll gleitend: gelerntes Gefühl vergessen")
    elif aktion == "energie_korrektur":   # FE-0016: falsch gezählte Energie eines Geräts zurücknehmen
        g = st.geraete.get(msg.get("geraet") or "")
        if g is None or not (msg.get("kwh") or msg.get("eur")):
            _fehler(connection, msg, "energie_korrektur braucht geraet und kwh oder eur")
            return
        if msg.get("kwh"):
            st.energie_ausbuchen(g, float(msg["kwh"]))
        if msg.get("eur"):
            st.kosten_ausbuchen(g, float(msg["eur"]))
    elif aktion == "zuruecksetzen":
        # Herbert 01.10.2026: alle Zähler (Verbrauch, Kosten, Heizzeit, Heiztage, Pumpzeit, ohne Automatik, Ø-Leistung,
        # Auf-/Abkühlraten, fairer Vergleich) und alles Gelernte (lernende Regelung, Warm ab, Gefühl, Außenmittel, + / −)
        # auf null; Einstellungen, Protokoll und die Langzeitstatistik von HA bleiben. Neu laden leert auch den Speicher.
        st.zaehler.clear()
        for key, leer in (("lernen", {}), ("warm_start", {}), ("aussen_tage", {}), ("gefuehl", []), ("soll_versch", {}),
                          ("fuehler_zuletzt", {})):
            lz[key] = leer
        st.protokoll("einstellung", None, "Alle Zähler und alles Gelernte zurückgesetzt")
        _aktion_merken(hass, connection, st, msg)
        connection.send_result(msg["id"], {"ok": True})
        hass.config_entries.async_schedule_reload(st.entry.entry_id)
        return
    elif aktion == "bericht_senden":
        await st.nachrichten.async_bericht_senden(msg.get("art") or "woche")
        connection.send_result(msg["id"], {"ok": True})
        return
    st.einstellungen.speichern()
    st.auswerten()
    _aktion_merken(hass, connection, st, msg)
    connection.send_result(msg["id"], {"ok": True})


# ---------------------------------------------------------------------- bericht (Vorschau)
@websocket_api.websocket_command({
    vol.Required("type"): "baustelle/bericht",
    vol.Required("entry_id"): str,
    vol.Optional("art", default="woche"): vol.In(["woche", "monat"]),
})
@websocket_api.async_response
async def ws_bericht(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]) -> None:
    """Bericht, wie er jetzt ginge – dieselben Zahlen und Texte wie beim Senden (Seite „Bericht · Beispiel“)."""
    if (st := _steuerung(hass, connection, msg)) is None:
        return
    connection.send_result(msg["id"], await st.nachrichten.async_bericht_vorschau(msg["art"]))


# ---------------------------------------------------------------------- auswertung, abrechnung (api-0.7 §8)
ZEITRAUM: dict[Any, Any] = {
    vol.Required("entry_id"): str,
    vol.Optional("zeitraum", default="Monat"): vol.In(ARTEN),
    vol.Optional("versatz", default=0): vol.All(vol.Coerce(int), vol.Range(0, 4000)),   # FE-0008: Tage bis zum Beginn der Baustelle
    vol.Optional("scope", default="diese"): vol.In(["diese", "alle"]),
}


def _eintrag(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]) -> Any:
    """Baustelle auch abgeschlossen oder nicht geladen (Verlauf); unbekannt → Fehler `not_found`."""
    entry = hass.config_entries.async_get_entry(msg["entry_id"])
    if entry is None or entry.domain != DOMAIN:
        connection.send_error(msg["id"], websocket_api.ERR_NOT_FOUND, "Baustelle nicht gefunden")
        return None
    return entry


@websocket_api.websocket_command({
    vol.Required("type"): "baustelle/auswertung", **ZEITRAUM,
    vol.Optional("preis"): vol.All(vol.Coerce(float), vol.Range(0, 10)),   # Preis simulieren (nichts wird gespeichert)
    vol.Optional("teil", default="zeitraum"): vol.In(["zeitraum", "verlauf"]),
})
@websocket_api.async_response
async def ws_auswertung(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]) -> None:
    """Auswertung eines Zeitraums bzw. Verlauf einer Baustelle – gerechnet von der Integration, die Seite zeigt nur an."""
    if (entry := _eintrag(hass, connection, msg)) is None:
        return
    if msg["teil"] == "verlauf":
        ergebnis = await auswertung.async_verlauf(hass, auswertung.quelle(hass, entry))
    else:
        ergebnis = await auswertung.async_auswertung(hass, entry, msg["zeitraum"], msg["versatz"], msg["scope"], msg.get("preis"))
    connection.send_result(msg["id"], ergebnis)


@websocket_api.websocket_command({
    vol.Required("type"): "baustelle/ohne", **ZEITRAUM, vol.Required("bereich"): str,
    vol.Optional("basis", default="geraet"): vol.In(["geraet", "typ"]),
})
@websocket_api.async_response
async def ws_ohne(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]) -> None:
    """„Ohne Automatik“ eines Containers im Zeitraum (WU-0013)."""
    if (entry := _eintrag(hass, connection, msg)) is None:
        return
    connection.send_result(msg["id"], await auswertung.async_ohne(hass, entry, msg["bereich"], msg["zeitraum"], msg["versatz"], msg["basis"]))


@websocket_api.websocket_command({
    vol.Required("type"): "baustelle/tagesverlauf", vol.Required("entry_id"): str, vol.Required("datum"): vol.All(cv.string, cv.date),
})
@websocket_api.async_response
async def ws_tagesverlauf(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]) -> None:
    """Verlauf 24 h eines Tages der Heizperiode (BSM-033.04, Karte „Heizperiode“ › Tag)."""
    if (st := _steuerung(hass, connection, msg)) is None:
        return
    connection.send_result(msg["id"], await hochrechnung_heizung.async_tagesverlauf(hass, Heizung.von(st), msg["datum"]))


@websocket_api.websocket_command({
    vol.Required("type"): "baustelle/prognose_v2", vol.Required("entry_id"): str,
    vol.Optional("tage", default=7): vol.All(vol.Coerce(int), vol.Range(1, 31)),
})
@websocket_api.async_response
async def ws_prognose_v2(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]) -> None:
    """Prognose V2, Diagnose (BSM-033.07): Tagesmerkmale der letzten Tage je Container – Schattenbetrieb, keine Seite."""
    if (st := _steuerung(hass, connection, msg)) is None:
        return
    connection.send_result(msg["id"], await prognose_v2_heizung.async_diagnose(hass, Heizung.von(st), msg["tage"]))


@websocket_api.websocket_command({vol.Required("type"): "baustelle/abrechnung", **ZEITRAUM,
                                  vol.Optional("preis"): vol.All(vol.Coerce(float), vol.Range(0, 10))})
@websocket_api.async_response
async def ws_abrechnung(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]) -> None:
    """Abrechnung nach Firma (Tabelle, Verbrauch je Firma und Periode) und beide CSV wie bisher auf der Seite."""
    if (entry := _eintrag(hass, connection, msg)) is None:
        return
    connection.send_result(msg["id"], await auswertung.async_abrechnung(hass, entry, msg["zeitraum"], msg["versatz"], msg["scope"], msg.get("preis")))


# ---------------------------------------------------------------------- protokoll
FILTER = {
    "alle": None,
    "warnung": {"warnung", "ok"},
    "schalten": {"schalten"},
    "wetter": {"wetter"},
    "nachricht": {"nachricht"},
    "einstellung": {"einstellung"},
}


@websocket_api.websocket_command({
    vol.Required("type"): "baustelle/protokoll",
    vol.Required("entry_id"): str,
    vol.Optional("filter", default="alle"): vol.In(list(FILTER)),
    vol.Optional("vor"): vol.Any(None, str),
    vol.Optional("limit", default=50): vol.All(vol.Coerce(int), vol.Range(1, 1000)),
})
@websocket_api.async_response
async def ws_protokoll(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]) -> None:
    """Protokolleinträge, neueste zuerst; `vor` = nur ältere als dieser Zeitpunkt (zum Nachladen)."""
    if (st := _steuerung(hass, connection, msg)) is None:
        return
    arten = FILTER[msg["filter"]]
    vor = dt_util.parse_datetime(msg["vor"]) if msg.get("vor") else None
    if (db := hass.data.get(DATA_DB)) is not None and db.bereit:   # BSM-015: ohne Grenze aus der Datenbank
        from .db.speicher import protokoll_lesen  # noqa: PLC0415
        await db.schreiber.async_schreiben()   # auch die Einträge der letzten Sekunden (noch in der Warteschlange)
        aus_db = await db.async_ausfuehren(lambda v: protokoll_lesen(v, st.entry.entry_id, arten, vor, msg["limit"]))
        if aus_db is not None:
            connection.send_result(msg["id"], aus_db)
            return
    ergebnis = []
    for eintrag in st.e["protokoll"]:
        if arten is not None and eintrag[1] not in arten:
            continue
        if vor is not None and (z := dt_util.parse_datetime(eintrag[0])) is not None and z >= vor:
            continue
        ergebnis.append(eintrag)
        if len(ergebnis) >= msg["limit"]:
            break
    connection.send_result(msg["id"], ergebnis)


# ---------------------------------------------------------------------- meldungen
@websocket_api.websocket_command({
    vol.Required("type"): "baustelle/statistik",
    vol.Required("start_time"): str,
    vol.Optional("end_time"): vol.Any(None, str),
    vol.Required("statistic_ids"): [str],
    vol.Required("period"): vol.In(["5minute", "hour", "day", "week", "month"]),
    vol.Optional("types"): [str],
    vol.Optional("units"): dict,
    vol.Optional("entry_id"): vol.Any(None, str),
})
@websocket_api.async_response
async def ws_statistik(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]) -> None:
    """Wie `recorder/statistics_during_period`, aber aus der eigenen Datenbank (BSM-014); Rest aus der HA-Statistik."""
    start = dt_util.parse_datetime(msg["start_time"])
    ende = dt_util.parse_datetime(msg["end_time"]) if msg.get("end_time") else dt_util.utcnow()
    if start is None or ende is None:
        _fehler(connection, msg, "start_time/end_time: ISO-Zeit erwartet")
        return
    arten = set(msg.get("types") or ["change", "mean", "state"])
    connection.send_result(msg["id"], await auswertung.async_statistik(hass, msg["statistic_ids"], start, ende, msg["period"], arten))


@websocket_api.websocket_command({
    vol.Required("type"): "baustelle/verlauf",
    vol.Required("start_time"): str,
    vol.Optional("end_time"): vol.Any(None, str),
    vol.Required("entity_ids"): [str],
    vol.Optional("minimal_response"): bool,
    vol.Optional("no_attributes"): bool,
    vol.Optional("significant_changes_only"): bool,
    vol.Optional("entry_id"): vol.Any(None, str),
})
@websocket_api.async_response
async def ws_verlauf(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]) -> None:
    """Wie `history/history_during_period` (minimal), aber aus der eigenen Datenbank (BSM-014); Rest aus dem HA-Verlauf."""
    from .db.verlauf import async_verlauf  # noqa: PLC0415
    start = dt_util.parse_datetime(msg["start_time"])
    ende = dt_util.parse_datetime(msg["end_time"]) if msg.get("end_time") else dt_util.utcnow()
    if start is None or ende is None:
        _fehler(connection, msg, "start_time/end_time: ISO-Zeit erwartet")
        return
    connection.send_result(msg["id"], await async_verlauf(hass, msg["entity_ids"], start, ende))


@websocket_api.websocket_command({vol.Required("type"): "baustelle/meldungen", vol.Optional("entry_id"): vol.Any(None, str)})
@websocket_api.async_response
async def ws_meldungen(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]) -> None:
    """Alle Meldungen aus dem Melden-Knopf (eine Liste für die ganze Integration), neueste zuerst."""
    connection.send_result(msg["id"], list(await hass.data[DATA_MELDUNGEN].async_laden()))


@websocket_api.websocket_command({
    vol.Required("type"): "baustelle/meldung",
    vol.Required("aktion"): vol.In(["neu", "status", "loeschen", "bild"]),
    vol.Optional("meldung"): dict,
    vol.Optional("nr"): vol.All(vol.Coerce(int), vol.Range(0, 2)),   # WU-0016: welches Bild
    vol.Optional("meldung_id"): str,  # „id“ ist die Nummer der WebSocket-Nachricht
    vol.Optional("status"): vol.In([*TICKET_STATUS, "offen", "erledigt"]),
    vol.Optional("entry_id"): vol.Any(None, str),
})
@websocket_api.async_response
async def ws_meldung(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]) -> None:
    """Meldung speichern, erledigen/wieder öffnen oder löschen."""
    if not _darf(connection, msg, "meldung", msg["aktion"]):
        return
    meldungen: Meldungen = hass.data[DATA_MELDUNGEN]
    liste = await meldungen.async_laden()
    jetzt = dt_util.now().isoformat(timespec="seconds")
    if msg["aktion"] == "neu":
        try:
            m = MELDUNG(msg.get("meldung") or {})
            bilder = [_bild_lesen(b) for b in BILDER((msg.get("meldung") or {}).get("bilder") or [])]   # WU-0016
        except vol.Invalid as err:
            _fehler(connection, msg, str(err))
            return
        m.update(id=_neue_id("m"), zeit=jetzt, status="neu", stand=None, ticket=meldungen.neue_nummer(m["art"]), verlauf=[])
        if bilder:
            m["bilder"] = await hass.async_add_executor_job(_bilder_schreiben, meldungen.ordner, m["ticket"], bilder)
        m.setdefault("version", hass.data.get(DATA_VERSION, ""))
        if msg.get("entry_id"):
            m["baustelle"] = msg["entry_id"]
        liste.insert(0, m)
        meldungen.speichern()
        entry = hass.config_entries.async_get_entry(msg["entry_id"]) if msg.get("entry_id") else None
        hass.bus.async_fire(EVENT_PROTOKOLL, {
            "entry_id": msg.get("entry_id"), "baustelle": entry.title if entry else "", "art": "meldung", "bereich": None,
            "bereich_name": None, "text": f"Meldung {m['ticket']} ({ART_TEXT.get(m.get('art'), m.get('art'))}): {m.get('text', '')} – {m.get('kontext', '')}",
        })
        connection.send_result(msg["id"], {"ok": True, "id": m["id"], "ticket": m["ticket"]})
        return
    angaben = msg.get("meldung") or {}
    mid = msg.get("meldung_id") or angaben.get("id")
    m = meldungen.finden(mid) if mid else None
    if m is None:
        connection.send_error(msg["id"], websocket_api.ERR_NOT_FOUND, "Meldung nicht gefunden")
        return
    if msg["aktion"] == "bild":   # WU-0016: Bild zur Anzeige auf der Seite (nicht öffentlich, nur über die Verbindung)
        namen = m.get("bilder") or []
        if msg.get("nr", 0) >= len(namen):
            connection.send_error(msg["id"], websocket_api.ERR_NOT_FOUND, "Bild nicht gefunden")
            return
        connection.send_result(msg["id"], {"url": await hass.async_add_executor_job(_bild_url, meldungen.ordner, namen[msg.get("nr", 0)])})
        return
    if msg["aktion"] == "loeschen":
        liste.remove(m)
        if m.get("bilder"):
            await hass.async_add_executor_job(_bilder_loeschen, meldungen.ordner, m["bilder"])
    else:
        status = msg.get("status") or angaben.get("status")
        if status not in (None, *TICKET_STATUS, "offen", "erledigt"):
            _fehler(connection, msg, "status: " + ", ".join(TICKET_STATUS))
            return
        if status is None:
            status = "geschlossen" if m.get("status") in TICKET_OFFEN else "neu"
        meldungen.aendern(m, status=status, notiz=angaben.get("notiz"), von="Seite")
        connection.send_result(msg["id"], {"ok": True})
        return
    meldungen.speichern()
    connection.send_result(msg["id"], {"ok": True})
