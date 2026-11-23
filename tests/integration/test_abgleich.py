"""Abgleich Seite ↔ Integration (docs/api-0.7.md) mit einer echten Baustelle.

1. Eine Baustelle mit Containern, Geräten (Fake-Shellys mit Leistungssensor), Tür, Anschlüssen, Firmen, Arbeitszeit,
   Ausnahme, Terminen und Warnungen läuft einen Arbeitstag lang (feste Zeit, Minute für Minute). Die echte Antwort von
   `baustelle/struktur` wird nach `tests/panel/struktur-echt.json` geschrieben, die Zustände der Entitäten nach
   `tests/panel/struktur-echt.zustaende.json` – dagegen rendert `tests/panel/test_panel.js` die Seite.
2. Die Seite wird in Node gegen diese Antwort gerendert (`test_panel.js`), dabei schreibt sie jeden WebSocket-Befehl mit,
   den sie sendet.
3. Genau diese Befehle gehen danach über den echten WebSocket an die Integration (bzw. an HA: Kalender, Diagnose) und
   müssen angenommen werden.

Neu erzeugen: der Test schreibt die Dateien bei jedem Lauf; `git diff tests/panel/struktur-echt*.json` zeigt, ob sich die
Antwort der Integration geändert hat.
"""

from __future__ import annotations

import asyncio
import dataclasses
from datetime import date, datetime, timedelta
import json
import os
from pathlib import Path
import shutil
import tempfile
from typing import Any

import pytest

from homeassistant.components.calendar import (  # noqa: PLC2701
    DATA_COMPONENT as KALENDER,
    CalendarEntity,
    CalendarEntityFeature,
    CalendarEvent,
)
from homeassistant.core import HomeAssistant, ServiceCall, SupportsResponse
from homeassistant.helpers import entity_registry as er
from homeassistant.helpers.json import json_dumps
from homeassistant.setup import async_setup_component
from homeassistant.util import dt as dt_util


def _api_event_dict_factory(obj: Any) -> dict[str, Any]:
    """Termin wie `GET /api/calendars/<id>` (nachgebildet: die gleichnamige Funktion in HA ist intern und fehlt in
    älteren Versionen – GitHub-Prüflauf)."""
    ergebnis: dict[str, Any] = {}
    for name, wert in obj:
        if isinstance(wert, datetime):
            ergebnis[name] = {"dateTime": dt_util.as_local(wert).isoformat()}
        elif isinstance(wert, date):
            ergebnis[name] = {"date": wert.isoformat()}
        else:
            ergebnis[name] = wert
    return ergebnis
from pytest_homeassistant_custom_component.common import MockConfigEntry, async_fire_time_changed

from custom_components.baustelle.const import DOMAIN
from custom_components.baustelle.panel import DATA_MELDUNGEN

from .conftest import FakeShellys, sub
from .test_api import BEISPIEL, vertrag_pruefen

REPO = Path(__file__).resolve().parents[2]
PANEL_JS = REPO / "custom_components" / "baustelle" / "frontend" / "baustelle-panel.js"
TEST_JS = REPO / "tests" / "panel" / "test_panel.js"
ECHT = REPO / "tests" / "panel" / "struktur-echt.json"
ZUSTAENDE = REPO / "tests" / "panel" / "struktur-echt.zustaende.json"

WOHNBAU, HALLE = "wohnbau", "halle"
POLIER, MANNSCHAFT, MAGAZIN, SCHACHT, BUERO = "polier", "mannschaft", "magazin", "schacht", "buero"
# Fake-Shellys: Schalter → (Leistungssensor, Watt)
SHELLYS = {
    "switch.polier_r1": ("sensor.polier_r1_leistung", 1980.0),
    "switch.polier_k1": ("sensor.polier_k1_leistung", 2010.0),
    "switch.mannschaft_k1": ("sensor.mannschaft_k1_leistung", 1990.0),
    "switch.mannschaft_k2": ("sensor.mannschaft_k2_leistung", 2000.0),
    "switch.magazin_r1": ("sensor.magazin_r1_leistung", 1500.0),
    "switch.magazin_t1": ("sensor.magazin_t1_leistung", 480.0),
    "switch.schacht_p1": ("sensor.schacht_p1_leistung", 760.0),
    "switch.buero_r1": ("sensor.buero_r1_leistung", 1980.0),
}
# Befehle der Seite, die über den echten WebSocket an HA gehen (die übrigen Aufrufe: siehe `_ohne_ausfuehren`)
AUSFUEHREN = ("baustelle/", "calendar/event/", "auth/sign_path", "config_entries/update", "config_entries/subentries/delete")
TEMP = {"device_class": "temperature", "unit_of_measurement": "°C", "state_class": "measurement"}


class Kalender(CalendarEntity):
    """Kalender wie der lokale Kalender von HA: Termine anlegen/löschen, `uid`/`rrule` je Termin."""

    _attr_supported_features = CalendarEntityFeature.CREATE_EVENT | CalendarEntityFeature.DELETE_EVENT

    def __init__(self, name: str, termine: list[CalendarEvent]) -> None:
        self._attr_name = name
        self._attr_unique_id = name
        self.termine = termine

    @property
    def event(self) -> CalendarEvent | None:
        jetzt = dt_util.now()
        return next((t for t in self.termine if t.start_datetime_local <= jetzt < t.end_datetime_local), None)

    async def async_get_events(self, hass: HomeAssistant, start_date: datetime, end_date: datetime) -> list[CalendarEvent]:
        """Wie der lokale Kalender: eine Serie (FREQ=WEEKLY[;INTERVAL=n]) kommt als einzelne Vorkommen mit gleicher uid."""
        ergebnis = []
        for t in self.termine:
            schritt = int(dict(x.split("=") for x in t.rrule.split(";")).get("INTERVAL", 1)) if t.rrule else 0
            for k in range(60 if schritt else 1):
                versatz = timedelta(weeks=k * schritt)
                x = dataclasses.replace(t, start=t.start + versatz, end=t.end + versatz,
                                        recurrence_id=(t.start + versatz).strftime("%Y%m%dT%H%M%S") if schritt else None)
                if x.start_datetime_local >= end_date:
                    break
                if x.end_datetime_local > start_date:
                    ergebnis.append(x)
        return ergebnis

    async def async_create_event(self, **kwargs: Any) -> None:
        self.termine.append(CalendarEvent(
            start=kwargs["dtstart"], end=kwargs["dtend"], summary=kwargs["summary"],
            description=kwargs.get("description"), rrule=kwargs.get("rrule"), uid=f"neu-{len(self.termine)}",
        ))

    async def async_delete_event(self, uid: str, recurrence_id: str | None = None, recurrence_range: str | None = None) -> None:
        vorher = len(self.termine)
        self.termine = [t for t in self.termine if t.uid != uid]
        if len(self.termine) == vorher:
            raise ValueError(f"Termin {uid} nicht gefunden")


def _zeit(text: str) -> datetime:
    return dt_util.parse_datetime(text)  # type: ignore[return-value]


def _termine() -> list[CalendarEvent]:
    return [
        CalendarEvent(start=_zeit("2026-09-29T13:00:00+02:00"), end=_zeit("2026-09-29T14:00:00+02:00"),
                      summary="Baubesprechung", description=f"baustelle:{MANNSCHAFT}", uid="termin-1",
                      rrule="FREQ=WEEKLY"),
        CalendarEvent(start=_zeit("2026-10-01T09:00:00+02:00"), end=_zeit("2026-10-01T10:30:00+02:00"),
                      summary="Abnahme Elektro", description=f"baustelle:{MANNSCHAFT}\nboost", uid="termin-2"),
    ]


def _eintraege() -> list[MockConfigEntry]:
    wohnbau = MockConfigEntry(
        domain=DOMAIN, entry_id=WOHNBAU, title="Wohnbau Kalsdorf", data={"name": "Wohnbau Kalsdorf"},
        options={"heizung": True, "pumpen": True, "status": "aktiv", "beginn": "2026-09-01",
                 "heizperiode_von": "10", "heizperiode_bis": "4", "empfaenger": ["mobile_app_handy"],
                 "wetter": "weather.kalsdorf", "temp_sensor": "sensor.aussen", "regen_sensor": "sensor.regen",
                 "feiertag_kalender": "calendar.feiertage", "urlaub_kalender": "calendar.urlaub"},
        subentries_data=[
            sub(POLIER, "bereich", "Polier", {"name": "Polier", "art": "container", "fuehler": "sensor.polier_temperatur"}),
            sub(MANNSCHAFT, "bereich", "Mannschaft", {"name": "Mannschaft", "art": "container"}),
            sub(MAGAZIN, "bereich", "Magazin", {"name": "Magazin", "art": "container",
                                                "fuehler": "sensor.magazin_temperatur"}),
            sub(SCHACHT, "bereich", "Pumpenschacht", {"name": "Pumpenschacht", "art": "pumpenschacht"}),
            *[sub(gid, "geraet", name, {"bereich": bid, "schalter": f"switch.{gid}", "name": name, "rolle": rolle,
                                        "typ": typ, "leistung": SHELLYS[f"switch.{gid}"][0]})
              for gid, bid, name, rolle, typ in [
                  ("polier_r1", POLIER, "Ölradiator 1", "heizkoerper", "oelradiator"),
                  ("polier_k1", POLIER, "Konvektor 1", "heizkoerper", "konvektor"),
                  ("mannschaft_k1", MANNSCHAFT, "Konvektor 1", "heizkoerper", "konvektor"),
                  ("mannschaft_k2", MANNSCHAFT, "Konvektor 2", "heizkoerper", "konvektor"),
                  ("magazin_r1", MAGAZIN, "Ölradiator 1", "heizkoerper", "oelradiator"),
                  ("magazin_t1", MAGAZIN, "Bautrockner", "bautrockner", "konvektor"),
                  ("schacht_p1", SCHACHT, "Pumpe 1", "pumpe", "konvektor"),
              ]],
        ],
    )
    halle = MockConfigEntry(
        domain=DOMAIN, entry_id=HALLE, title="Halle Lieboch", data={"name": "Halle Lieboch"},
        options={"heizung": True, "pumpen": False, "status": "abgeschlossen", "beginn": "2025-11-03",
                 "ende": "2026-04-17", "heizperiode_von": "10", "heizperiode_bis": "4"},
        subentries_data=[
            sub(BUERO, "bereich", "Büro", {"name": "Büro", "art": "container"}),
            sub("buero_r1", "geraet", "Ölradiator 1", {"bereich": BUERO, "schalter": "switch.buero_r1",
                                                       "name": "Ölradiator 1", "rolle": "heizkoerper",
                                                       "typ": "oelradiator", "leistung": "sensor.buero_r1_leistung"}),
        ],
    )
    return [wohnbau, halle]


def _vorhersage(art: str) -> list[dict[str, Any]]:
    if art == "daily":
        return [{"datetime": f"{t}T00:00:00+02:00", "condition": c, "temperature": hoch, "templow": tief,
                 "precipitation": regen, "precipitation_probability": p}
                for t, c, hoch, tief, regen, p in [
                    ("2026-09-29", "rainy", 9.0, 2.0, 6.0, 90), ("2026-09-30", "fog", 7.1, -1.2, 0.0, 10),
                    ("2026-10-01", "partlycloudy", 9.4, 1.8, 0.0, 15), ("2026-10-02", "rainy", 8.2, 4.1, 5.5, 80),
                    ("2026-10-03", "sunny", 11.0, 3.0, 0.0, 5)]]
    start = dt_util.now().replace(minute=0, second=0, microsecond=0)
    return [{"datetime": (start + timedelta(hours=i + 1)).isoformat(), "condition": "rainy" if i < 3 else "cloudy",
             "temperature": round(4.0 - i * 0.3, 1), "precipitation": 0.5 if i < 3 else 0.0} for i in range(24)]


class Tag:
    """Ein Arbeitstag der Baustelle, Minute für Minute."""

    def __init__(self, hass: HomeAssistant, freezer, shellys: FakeShellys) -> None:
        self.hass, self.freezer, self.shellys = hass, freezer, shellys

    async def bis(self, zeit: str, jede_minute=None) -> None:
        ziel = _zeit(zeit)
        while (jetzt := dt_util.now()) < ziel:
            jetzt = min(ziel, jetzt.replace(second=0, microsecond=0) + timedelta(minutes=1))
            self.freezer.move_to(jetzt)
            if jede_minute:
                jede_minute(jetzt)
            async_fire_time_changed(self.hass, jetzt)
            await self.hass.async_block_till_done()


def _temperatur(hass: HomeAssistant, fuehler: str, schalter: list[str], aussen: float) -> None:
    """Container erwärmt sich, solange ein Heizkörper läuft, und kühlt sonst langsam ab."""
    alt = float(hass.states.get(fuehler).state)
    an = sum(1 for s in schalter if (z := hass.states.get(s)) is not None and z.state == "on")
    neu = alt + 0.06 * an - 0.02 * (alt - aussen) / 10
    hass.states.async_set(fuehler, f"{neu:.2f}", TEMP)


@pytest.fixture
async def echte_baustelle(hass: HomeAssistant, freezer, hass_ws_client, hass_storage):
    """Wohnbau Kalsdorf am Dienstag 29.09.2026, 05:30 eingerichtet (wie über die Seite) und bis 16:20 gelaufen."""
    await hass.config.async_set_time_zone("Europe/Vienna")
    ws = await hass_ws_client(hass)  # vor dem Zurückstellen der Uhr anmelden (sonst gilt das Token noch nicht)
    freezer.move_to("2026-09-29 05:30:00+02:00")
    # Meldungen aus dem Melden-Knopf, die die Seite im Test anzeigt (dieselben Kennungen wie in test_panel.js)
    hass_storage["baustelle.meldungen"] = {"version": 1, "key": "baustelle.meldungen", "data": {"meldungen": [
        {"id": "m1", "art": "wunsch", "text": "Eigene Kachel für Bautrockner", "kontext": "Übersicht",
         "zeit": "2026-09-28T17:02:00+02:00", "version": "0.7.0", "geraet": "Handy", "status": "offen", "stand": None},
        {"id": "m2", "art": "fehler", "text": "Nebel-Symbol kaum zu sehen", "kontext": "Übersicht · Wetter",
         "zeit": "2026-09-28T20:15:00+02:00", "version": "0.6.2", "geraet": "Desktop", "status": "erledigt",
         "stand": "2026-09-29T08:00:00+02:00"}]}}
    # Die abgeschlossene Baustelle hat ihre Zähler aus dem letzten Winter
    hass_storage[f"baustelle.{HALLE}"] = {"version": 2, "key": f"baustelle.{HALLE}", "data": {
        "zaehler": {"energie": 1840.5, "kosten": 515.34, "ohne": 3950.0, "energie_heizen": 1840.5, "heiztage": 96,
                    "seit": "2025-11-03T00:00:00+01:00", f"energie:{BUERO}": 1840.5, f"heizzeit:{BUERO}": 1102.4,
                    "energie_typ:oelradiator": 1840.5, "heizzeit_typ:oelradiator": 1102.4},
        "protokoll": [["2026-04-17T12:00:00+02:00", "einstellung", None, "Baustelle abgeschlossen"]]}}

    for s, (leistung, _) in SHELLYS.items():
        hass.states.async_set(s, "on" if s == "switch.schacht_p1" else "off", {"friendly_name": s})
        hass.states.async_set(leistung, "760" if s == "switch.schacht_p1" else "0",
                              {"device_class": "power", "unit_of_measurement": "W", "state_class": "measurement"})
    temp = TEMP
    hass.states.async_set("sensor.polier_temperatur", "12.4", temp)
    hass.states.async_set("sensor.magazin_temperatur", "11.8", temp)
    hass.states.async_set("sensor.aussen", "2.1", temp)
    hass.states.async_set("sensor.regen", "0", {"device_class": "precipitation", "unit_of_measurement": "mm"})
    hass.states.async_set("binary_sensor.tuer_magazin", "off", {"device_class": "door", "friendly_name": "Tür Magazin"})
    for frei in ("switch.reserve_1", "switch.reserve_2"):  # Shellys, die noch keinem Gerät gehören
        hass.states.async_set(frei, "off", {"friendly_name": frei})
    hass.states.async_set("weather.kalsdorf", "rainy", {"friendly_name": "Wetter Kalsdorf", "temperature": 2.1})

    async def get_forecasts(call: ServiceCall):
        ids = call.data["entity_id"]
        return {eid: {"forecast": _vorhersage(call.data["type"])} for eid in ([ids] if isinstance(ids, str) else ids)}

    hass.services.async_register("weather", "get_forecasts", get_forecasts, supports_response=SupportsResponse.ONLY)
    assert await async_setup_component(hass, "calendar", {})
    await hass.data[KALENDER].async_add_entities([
        Kalender("Termine", _termine()),
        Kalender("Feiertage", [CalendarEvent(start=date(2026, 10, 26), end=date(2026, 10, 27), summary="Nationalfeiertag")]),
        Kalender("Urlaub", [CalendarEvent(start=date(2026, 10, 2), end=date(2026, 10, 3), summary="Betriebsurlaub", uid="u1")]),
    ])
    nachrichten: list[ServiceCall] = []

    async def merken(call: ServiceCall) -> None:
        nachrichten.append(call)

    hass.services.async_register("notify", "mobile_app_handy", merken)
    for entry in _eintraege():
        entry.add_to_hass(hass)
        assert await hass.config_entries.async_setup(entry.entry_id)
    await hass.async_block_till_done()
    shellys = FakeShellys(hass)
    shellys.leistung = {s: l for s, (l, _) in SHELLYS.items()}
    shellys.watt = {s: w for s, (_, w) in SHELLYS.items()}
    shellys.anmelden()

    nr = {"id": 0}

    async def rufe(typ: str, _erlaubt: tuple[str, ...] = (), **felder) -> Any:
        nr["id"] += 1
        await ws.send_json({"id": nr["id"], "type": typ, **felder})
        antwort = await ws.receive_json()
        await hass.async_block_till_done()
        if not antwort["success"] and antwort["error"]["code"] in _erlaubt:
            return None
        assert antwort["success"], (typ, felder, antwort)
        return antwort["result"]

    # Einrichtung wie über die Seite (dieselben Befehle)
    def setzen(pfad, wert):
        return rufe("baustelle/setzen", entry_id=WOHNBAU, pfad=pfad, wert=wert)

    def liste(name, aktion, eintrag):
        return rufe("baustelle/liste", entry_id=WOHNBAU, liste=name, aktion=aktion, eintrag=eintrag)

    await liste("arbeitszeiten", "speichern", {"ab": "2026-09-01", "name": "Herbst 2026", "tage": {
        "0": ["07:00", "16:30"], "1": ["07:00", "16:30"], "2": ["07:00", "16:30"], "3": ["07:00", "16:30"],
        "4": ["07:00", "12:30"], "5": None, "6": None}})
    # die automatisch angelegte (ab 2026-09-29) ersetzt die Integration durch die erste eigene (FE-0002)
    await liste("arbeitszeiten", "speichern", {"ab": "2026-11-02", "name": "Winter", "tage": {
        "0": ["07:30", "16:00"], "1": ["07:30", "16:00"], "2": ["07:30", "16:00"], "3": ["07:30", "16:00"],
        "4": ["07:30", "12:00"], "5": None, "6": None}})
    await liste("ausnahmen", "speichern", {"datum": "2026-09-30", "art": "zeiten", "von": "07:00", "bis": "18:00",
                                           "notiz": "Betonage"})
    await liste("ausnahmen", "speichern", {"datum": "2026-10-03", "art": "arbeit", "von": "07:00", "bis": "12:00",
                                           "notiz": ""})
    await liste("anschluesse", "speichern", {"id": "a1", "name": "Baustrom Nord", "ampere": 32, "phasen": 3,
                                             "reserve_kw": 3, "container": [POLIER, MANNSCHAFT]})
    sued = (await liste("anschluesse", "speichern", {"id": "sued", "name": "Verteiler Süd", "ampere": 16, "phasen": 3,
                                                     "reserve_kw": 1, "container": [MAGAZIN, SCHACHT]}))["id"]
    huber = (await liste("firmen", "speichern", {"id": "huber", "name": "Elektro Huber GmbH", "container": [MAGAZIN]}))["id"]
    await liste("firmen", "speichern", {"id": "leitner", "name": "Trockenbau Leitner", "container": []})
    await setzen(["bereiche", MAGAZIN, "tuer"], "binary_sensor.tuer_magazin")
    await setzen(["bereiche", MANNSCHAFT, "bedarf"], True)
    await setzen(["bereiche", POLIER, "prio"], "hoch")
    await setzen(["bereiche", MAGAZIN, "trocknen"], True)
    await setzen(["termine_kalender"], "calendar.termine")
    await setzen(["preis"], 0.28)
    await setzen(["bericht", "mail"], True)
    await setzen(["bericht", "mail_an"], "bau@example.at")
    await setzen(["bericht", "mail_dienst"], "smtp")
    await setzen(["automatik"], True)

    tag = Tag(hass, freezer, shellys)

    def minute(jetzt: datetime) -> None:
        aussen = 2.1 + 5 * max(0.0, min(1.0, (jetzt.hour - 6) / 8))
        hass.states.async_set("sensor.aussen", f"{aussen:.1f}", temp)
        _temperatur(hass, "sensor.polier_temperatur", ["switch.polier_r1", "switch.polier_k1"], aussen)
        _temperatur(hass, "sensor.magazin_temperatur", ["switch.magazin_r1"], aussen)
        # Pumpe: 5 min an, 25 min aus
        pumpe = "on" if jetzt.minute % 30 < 5 else "off"
        if hass.states.get("switch.schacht_p1").state != pumpe:
            hass.states.async_set("switch.schacht_p1", pumpe)
            hass.states.async_set("sensor.schacht_p1_leistung", "760" if pumpe == "on" else "0",
                                  hass.states.get("sensor.schacht_p1_leistung").attributes)

    await tag.bis("2026-09-29T08:00:00+02:00", minute)
    hass.states.async_set("sensor.regen", "6.2", {"device_class": "precipitation", "unit_of_measurement": "mm"})
    await tag.bis("2026-09-29T10:42:00+02:00", minute)
    hass.states.async_set("switch.magazin_t1", "unavailable")  # Bautrockner nicht erreichbar
    hass.states.async_set("sensor.magazin_t1_leistung", "unavailable")
    await tag.bis("2026-09-29T11:00:00+02:00", minute)
    await rufe("baustelle/aktion", entry_id=WOHNBAU, aktion="schalten", geraet="polier_k1", an=False)  # Handbetrieb
    await tag.bis("2026-09-29T16:05:00+02:00", minute)
    hass.states.async_set("binary_sensor.tuer_magazin", "on", {"device_class": "door", "friendly_name": "Tür Magazin"})
    await tag.bis("2026-09-29T16:18:00+02:00", minute)
    await rufe("baustelle/aktion", entry_id=WOHNBAU, aktion="warnung_stumm", key=f"tuer_offen:{MAGAZIN}")  # bis morgen
    await tag.bis("2026-09-29T16:20:00+02:00", minute)
    # Kalender, wie die Seite sie über REST liest (GET /api/calendars/<entity_id>, dieselbe Umwandlung wie HA)
    kalender = {}
    for eid in ("calendar.feiertage", "calendar.urlaub", "calendar.termine"):
        termine = await hass.data[KALENDER].get_entity(eid).async_get_events(
            hass, _zeit("2026-09-29T00:00:00+02:00"), _zeit("2027-11-03T00:00:00+01:00"))
        kalender[eid] = json.loads(json_dumps([dataclasses.asdict(t, dict_factory=_api_event_dict_factory) for t in termine]))
    return {"hass": hass, "rufe": rufe, "sued": sued, "huber": huber, "nachrichten": nachrichten, "kalender": kalender}


def _zustaende(hass: HomeAssistant) -> dict[str, Any]:
    # ohne Datenbank-Sensor (BSM-006): Pfad und Größe hängen von der Testumgebung ab – die Datei bliebe nicht gleich
    db = {e.entity_id for e in er.async_get(hass).entities.values() if e.unique_id.endswith("_datenbank")}
    return {s.entity_id: {"state": s.state, "attributes": json.loads(json.dumps(dict(s.attributes), default=str))}
            for s in sorted(hass.states.async_all(), key=lambda s: s.entity_id) if s.entity_id not in db}


async def _node(*argumente: str, env: dict[str, str] | None = None) -> tuple[int, str]:
    prozess = await asyncio.create_subprocess_exec(
        "node", *argumente, cwd=REPO, env={**os.environ, **(env or {})},
        stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.STDOUT,
    )
    ausgabe, _ = await prozess.communicate()
    return prozess.returncode or 0, ausgabe.decode()


def _ohne_ausfuehren(hass: HomeAssistant, m: dict[str, Any], fehler: list[str]) -> None:
    """Befehle, die HA selbst bedient und die im Test nichts ausführen sollen: nur die Kennungen prüfen."""
    typ = m["type"]
    if typ == "recorder/statistics_during_period":
        for eid in m["statistic_ids"]:
            if (s := hass.states.get(eid)) is None:
                fehler.append(f"{typ}: Statistik {eid} gibt es nicht")
            elif not s.attributes.get("state_class"):
                fehler.append(f"{typ}: {eid} ohne state_class – der Recorder führt dafür keine Langzeitstatistik")
        if m["period"] not in ("5minute", "hour", "day", "week", "month"):
            fehler.append(f"{typ}: period {m['period']}")
    elif typ == "history/history_during_period":
        for eid in m["entity_ids"]:
            if hass.states.get(eid) is None:
                fehler.append(f"{typ}: Entität {eid} gibt es nicht")
    elif typ != "baustelle/struktur":
        fehler.append(f"unbekannter Befehl der Seite: {typ}")


class Dialoge:
    """REST-Dialoge der Seite (Einrichtungs-Dialoge von HA) über dieselben Flow-Manager, die die REST-Ansichten benutzen.

    Die Seite spricht `config/config_entries/(flow|options/flow|subentries/flow)` an; die Kennungen der Dialoge und neuer
    Container aus dem Node-Test (F…, neu-…) werden auf die echten abgebildet.
    """

    def __init__(self, hass: HomeAssistant) -> None:
        self.hass = hass
        self.flows: dict[str, tuple[Any, str]] = {}
        self.ids: dict[str, str] = {}

    def _manager(self, pfad: str):
        ce = self.hass.config_entries
        return ce.subentries if "subentries" in pfad else ce.options if "options" in pfad else ce.flow

    def _ersetzen(self, wert: Any) -> Any:
        if isinstance(wert, str):
            return self.ids.get(wert, wert)
        if isinstance(wert, list):
            return [self._ersetzen(x) for x in wert]
        if isinstance(wert, dict):
            return {k: self._ersetzen(v) for k, v in wert.items()}
        return wert

    async def rufe(self, m: dict[str, Any], fehler: list[str]) -> None:
        methode, pfad, daten = m["methode"], m["pfad"], self._ersetzen(m["daten"])
        if methode == "GET":  # Kalender (Feiertage, Urlaub): nur die Entität muss es geben
            if self.hass.states.get(pfad.split("?")[0].removeprefix("calendars/")) is None:
                fehler.append(f"GET {pfad}: Kalender gibt es nicht")
            return
        if methode == "DELETE":
            return  # angehängter Dialog „ersten Container anlegen“ nach neuer Baustelle
        start = pfad in ("config/config_entries/flow", "config/config_entries/options/flow",
                         "config/config_entries/subentries/flow")
        if start:
            handler = daten["handler"]
            kontext: dict[str, Any] = {"source": "user"}
            if "subentries" in pfad:
                handler = tuple(handler)
                if daten.get("subentry_id"):
                    kontext = {"source": "reconfigure", "subentry_id": daten["subentry_id"]}
            elif "options" not in pfad:
                kontext["show_advanced_options"] = daten.get("show_advanced_options", False)
            ergebnis = await self._manager(pfad).async_init(handler, context=kontext)
            if ergebnis.get("type") != "form":
                fehler.append(f"POST {pfad} {daten}: {ergebnis.get('type')} {ergebnis.get('reason')}")
                return
            self.flows[m["antwort"]["flow_id"]] = (self._manager(pfad), ergebnis["flow_id"])
            return
        manager, flow_id = self.flows[pfad.rsplit("/", 1)[1]]
        vorher = {s for e in self.hass.config_entries.async_entries(DOMAIN) for s in e.subentries}
        try:
            ergebnis = await manager.async_configure(flow_id, daten)
        except Exception as err:  # noqa: BLE001 – jeder Fehler heißt: die Seite schickt etwas, das HA ablehnt
            fehler.append(f"POST {pfad} {daten}: {type(err).__name__} {err}")
            return
        await self.hass.async_block_till_done()
        if ergebnis.get("type") == "form" or (ergebnis.get("type") == "abort" and ergebnis.get("reason") != "reconfigure_successful"):
            fehler.append(f"POST {pfad} {daten}: {ergebnis.get('type')} {ergebnis.get('errors') or ergebnis.get('reason')}")
            return
        neu = {s for e in self.hass.config_entries.async_entries(DOMAIN) for s in e.subentries} - vorher
        if "subentries" in pfad and daten.get("art") and len(neu) == 1:  # neuer Bereich: Kennung für die Geräte merken
            erwartet = next((x for x in self._neue_ids if x not in self.ids), None)
            if erwartet:
                self.ids[erwartet] = next(iter(neu))

    _neue_ids: list[str] = []


@pytest.mark.skipif(shutil.which("node") is None, reason="node fehlt")
async def test_seite_gegen_echte_struktur(hass: HomeAssistant, echte_baustelle) -> None:
    rufe = echte_baustelle["rufe"]
    struktur = await rufe("baustelle/struktur")
    wohnbau = next(b for b in struktur if b["baustelle"]["entry_id"] == WOHNBAU)
    lz = wohnbau["laufzeit"]
    # was die Seite zeigen soll, ist wirklich da
    arten = {w["art"] for w in lz["warnungen"]}
    assert {"offline", "tuer_offen"} <= arten and "kein_wetter" not in arten, arten
    assert next(w for w in lz["warnungen"] if w["art"] == "tuer_offen")["stumm_bis"] == "2026-09-30T07:00:00+02:00"
    assert lz["geraete"]["polier_k1"]["hand_seit"] and lz["container"][MAGAZIN]["tuer"]["offen"] is True
    # Serie „Baubesprechung“ kommt je Vorkommen (heute und nächste Woche), wie beim lokalen Kalender von HA
    assert [(t["titel"], t["von"][:10]) for t in lz["termine"]] == [
        ("Baubesprechung", "2026-09-29"), ("Abnahme Elektro", "2026-10-01"), ("Baubesprechung", "2026-10-06")]
    assert lz["termine"][0]["uid"] == lz["termine"][2]["uid"] == "termin-1" and lz["termine"][1]["boost"] is True
    assert wohnbau["zaehler"]["energie"] > 0 and wohnbau["zaehler"].get(f"aufheiz:{POLIER}")
    assert len(lz["staffel"]["anschluesse"]) == 2 and [p for p in lz["plan_woche"] if p["frei"] == "urlaub"]
    assert next(b for b in struktur if b["baustelle"]["entry_id"] == HALLE)["baustelle"]["status"] == "abgeschlossen"

    # Auswertung und Abrechnung (api §8): seit BSM-014 aus der eigenen Datenbank (mitgeschrieben im Test) – vollständige
    # Antworten, Auswertung und Abrechnung mit denselben kWh (bis auf Rundungsrauschen der Summenreihenfolge)
    for b in struktur:
        v = await rufe("baustelle/auswertung", entry_id=b["baustelle"]["entry_id"], teil="verlauf")
        assert {"kwh", "heiztage", "vergleich", "je_monat", "monate_je_container", "csv"} <= set(v)
    for z in ("Tag", "Woche", "Monat", "Jahr"):
        for scope in ("diese", "alle"):
            aw = await rufe("baustelle/auswertung", entry_id=WOHNBAU, zeitraum=z, versatz=0, scope=scope)
            abr = await rufe("baustelle/abrechnung", entry_id=WOHNBAU, zeitraum=z, versatz=0, scope=scope)
            assert aw["zeitraum"] == abr["zeitraum"] and aw["summen"]["kwh"] == pytest.approx(abr["kwh"], abs=1e-9)
            assert abr["csv"]["firma"].startswith("\ufeffZeitraum;Firma;Baustelle;Container;kWh;Preis €/kWh;Betrag €")
    # FE-0008: frühere Zeiträume – auch Tage weit zurück (bis zum Beginn der Baustelle)
    for z, versatz in (("Tag", 400), ("Woche", 60), ("Monat", 14), ("Jahr", 3)):
        aw = await rufe("baustelle/auswertung", entry_id=WOHNBAU, zeitraum=z, versatz=versatz, scope="diese")
        abr = await rufe("baustelle/abrechnung", entry_id=WOHNBAU, zeitraum=z, versatz=versatz, scope="diese")
        assert aw["zeitraum"] == abr["zeitraum"]

    # dieselben Schlüssel und Typen wie das Beispiel, gegen das die Seite im Einzelnen getestet wird (api §1)
    beispiel = json.loads(BEISPIEL.read_text(encoding="utf-8"))
    for echt in struktur:
        vorlage = next(b for b in beispiel if b["baustelle"]["status"] == echt["baustelle"]["status"])
        assert vertrag_pruefen(vorlage, echt) == [], echt["baustelle"]["entry_id"]
    for b in struktur:  # Reihenfolge der Registry hängt vom Laden der Plattformen ab – für eine gleichbleibende Datei sortiert
        b["entitaeten"] = dict(sorted(b["entitaeten"].items()))
    ECHT.write_text(json.dumps(struktur, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    ZUSTAENDE.write_text(json.dumps({"zustaende": _zustaende(hass), "kalender": echte_baustelle["kalender"]},
                                    ensure_ascii=False, indent=1) + "\n", encoding="utf-8")

    # 2. Seite gegen die echte Antwort rendern; sie schreibt jeden Befehl mit
    with tempfile.TemporaryDirectory() as ordner:
        aufrufe_datei = Path(ordner) / "aufrufe.json"
        code, ausgabe = await _node("tests/panel/test_panel.js", str(PANEL_JS), str(ECHT),
                                    env={"BAUSTELLE_AUFRUFE": str(aufrufe_datei)})
        assert code == 0, ausgabe
        aufrufe = json.loads(aufrufe_datei.read_text(encoding="utf-8"))

    # 3. Jeden Befehl so an HA schicken, wie die Seite ihn sendet
    typen = {m["type"] for m in aufrufe}
    for erwartet in ("baustelle/setzen", "baustelle/liste", "baustelle/aktion", "baustelle/protokoll",
                     "baustelle/bericht", "baustelle/auswertung", "baustelle/abrechnung", "baustelle/meldung", "baustelle/meldungen", "calendar/event/create",
                     "calendar/event/delete", "auth/sign_path", "config_entries/update",
                     "baustelle/geraet", "rest"):
        assert erwartet in typen, f"Seite sendet {erwartet} nicht (gesendet: {sorted(typen)})"
    fehler: list[str] = []
    geschickt = 0
    assert await async_setup_component(hass, "config", {})  # WebSocket config_entries/* und die Dialoge
    dialoge = Dialoge(hass)
    # Kennungen, die der Node-Test neuen Containern gibt („neu-<n>“), in der Reihenfolge ihres Auftretens
    dialoge._neue_ids = list(dict.fromkeys(   # Geräte neuer Container: über baustelle/geraet (BSM-034.02), früher REST
        v for m in aufrufe
        for d in ([m["daten"]] if m["type"] == "rest" and isinstance(m.get("daten"), dict) else m.get("schritte") or [])
        for v in [d.get("bereich")] if isinstance(v, str) and v.startswith("neu-")))
    for m in aufrufe:
        m = {k: v for k, v in m.items() if k not in ("id",)}
        if m.get("entry_id") == "leer" and m["type"] in ("baustelle/auswertung", "baustelle/abrechnung"):
            continue  # Baustelle, die nur der Node-Test erfindet (nicht geladen) – die echte HA kennt sie nicht: not_found
        if m["type"] == "rest":
            await dialoge.rufe(m, fehler)
            geschickt += 1
            continue
        if not m["type"].startswith(AUSFUEHREN) or m["type"] == "baustelle/struktur":
            _ohne_ausfuehren(hass, m, fehler)
            continue
        typ = m.pop("type")
        # Inventar (BSM-031.07): die Seite nennt Container/Ausrüstung aus dem Beispiel-Inventar des Node-Tests – die echte
        # Integration kennt sie nicht (not_found); geprüft wird, dass jeder Befehl dem Schema entspricht
        erlaubt = ("not_found",) if typ.startswith("baustelle/inventar") else ()
        try:
            await rufe(typ, _erlaubt=erlaubt, **dialoge._ersetzen(m))
            geschickt += 1
        except AssertionError as err:
            fehler.append(str(err))
    assert not fehler, "\n".join(fehler)
    assert geschickt > 40

    # Die Befehle haben bewirkt, was die Seite meint
    await hass.async_block_till_done()
    entry = hass.config_entries.async_get_entry(WOHNBAU)
    titel = {x.title: x for x in entry.subentries.values()}
    assert "Lager Ost" in titel and "Magazin Nord" in titel and "Magazin" not in titel  # neu angelegt, umbenannt
    assert titel["Magazin Nord"].data.get("fuehler") == "sensor.magazin_temperatur"  # Fühler bleibt beim Umbenennen
    schalter = {x.data.get("schalter"): x for x in entry.subentries.values() if x.subentry_type == "geraet"}
    # M12: „+ Container“ legt nur Container (und Inventar) an, Geräte kommen über den Assistenten (baustelle/geraet_hinzufuegen)
    assert titel["Lager Ost"].data["art"] == "container" and not any(x.data.get("bereich") == titel["Lager Ost"].subentry_id for x in schalter.values())
    assert "switch.magazin_t1" not in schalter  # entfernt
    assert schalter["switch.magazin_r1"].data["typ"] == "konvektor"  # Typ geändert
    assert entry.options["wetter"] == "weather.kalsdorf" and entry.runtime_data is not None
    st = entry.runtime_data
    assert st.e["protokoll"][0][0].startswith("2026-09-29T16:2")
    assert st.e["heizung"]["boost_min"] == 5 and st.e["heizung"]["soll"] == 30  # Stepper an der Grenze
    assert any(m["text"] == "Knopf zu klein" and m.get("seite") for m in hass.data[DATA_MELDUNGEN].liste)
    assert {f["name"] for f in st.e["firmen"]} >= {"Eigene Firma", "Trockenbau Maier"}
    assert any(a["name"] == "Verteiler West" and a["ampere"] == 63 and a["phasen"] == 1 for a in st.e["anschluesse"])
    # Termin von der Seite: gehört über „baustelle:<bid>“ zum Container, „boost“ und Serie alle 2 Wochen kommen an
    await st._async_kalender()
    await hass.async_block_till_done()
    lz = next(b for b in await rufe("baustelle/struktur") if b["baustelle"]["entry_id"] == WOHNBAU)["laufzeit"]
    neu = [t for t in lz["termine"] if t["von"].startswith("2026-10-07")]
    assert neu and neu[0]["bereich"] == MANNSCHAFT and neu[0]["boost"] is True and neu[0]["wiederholung"] == "2wochen", lz["termine"]
    assert "termin-1" not in {t["uid"] for t in lz["termine"]}  # von der Seite gelöscht
