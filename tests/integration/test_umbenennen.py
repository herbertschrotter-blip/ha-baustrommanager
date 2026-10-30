"""BSM-031.06b/c: Umbenennen nach dem Schema in HA und im Plug ausführen, Nachholen – mit echtem Entitäts-, Geräte- und
Labelregister."""

from __future__ import annotations

from datetime import timedelta
import json
from typing import Any

import aiohttp
import pytest

from homeassistant.core import HomeAssistant
from homeassistant.helpers import device_registry as dr, entity_registry as er, label_registry as lr
from pytest_homeassistant_custom_component.common import MockConfigEntry, async_fire_time_changed
from pytest_homeassistant_custom_component.test_util.aiohttp import AiohttpClientMocker, AiohttpClientMockResponse

from .conftest import C1, HK1, baustelle_anlegen, zeilen_db


def _shellys_im_register(hass: HomeAssistant, host: str | None = None) -> None:
    """Plug von Heizkörper 1 und Fühler von Container 1 als echte Geräte (wie die Shelly-Integration sie anlegt); mit
    `host` ist der Plug ein Shelly Gen2+ mit Adresse (Name per RPC)."""
    quelle = MockConfigEntry(domain="shelly", title="Shelly", data={"host": host, "gen": 3} if host else {})
    quelle.add_to_hass(hass)
    geraete, ents, labels = dr.async_get(hass), er.async_get(hass), lr.async_get(hass)
    plug = geraete.async_get_or_create(config_entry_id=quelle.entry_id, identifiers={("shelly", "plug1")}, name="Heizung 01")
    temp = geraete.async_get_or_create(config_entry_id=quelle.entry_id, identifiers={("shelly", "ht1")}, name="BLU H&T")
    geraete.async_update_device(plug.id, labels={labels.async_create("Lager").label_id, labels.async_create("Herbert").label_id})
    for domain, uid, objekt, klasse, geraet in (
        ("switch", "plug1-s", "hk1", None, plug), ("sensor", "plug1-p", "hk1_power", "power", plug),
        ("sensor", "plug1-e", "hk1_energie", "energy", plug), ("sensor", "plug1-r", "hk1_rssi", "signal_strength", plug),
        ("sensor", "ht1-t", "temp_c1", "temperature", temp), ("sensor", "ht1-b", "temp_c1_batterie", "battery", temp),
    ):
        ents.async_get_or_create(domain, "shelly", uid, suggested_object_id=objekt, config_entry=quelle, device_id=geraet.id,
                                 original_device_class=klasse)


@pytest.fixture
async def baustelle_register(hass: HomeAssistant, freezer, shellys, nachrichten):
    """Wie `baustelle`, aber mit den Shellys im Register (vor `hass_ws_client` anfordern: Token nach dem Zeitsprung)."""
    _shellys_im_register(hass)
    entry = await baustelle_anlegen(hass, freezer)
    assert await hass.config_entries.async_setup(entry.entry_id)
    await hass.async_block_till_done()
    shellys.anmelden()
    return entry


async def _senden(ws, nr: int, **daten):
    await ws.send_json({"id": nr, **daten})
    return await ws.receive_json()


async def _container(ws, entry) -> str:
    c = await _senden(ws, 1, type="baustelle/inventar_aendern", aktion="container_anlegen", entry_id=entry.entry_id,
                      art="MAN", bereich_id=C1)
    assert c["success"], c
    return str(c["result"]["id"])


async def test_umbenennen_in_ha(hass: HomeAssistant, baustelle_register, hass_ws_client) -> None:
    entry = baustelle_register
    alt_steuerung = entry.runtime_data
    ws = await hass_ws_client(hass)
    cid = await _container(ws, entry)

    antwort = await _senden(ws, 2, type="baustelle/inventar_umbenennen", container_id=cid)
    assert antwort["success"], antwort
    await hass.async_block_till_done()
    erg = antwort["result"]
    assert erg["status"] == "ausgefuehrt"   # ohne Shelly-Adresse entfällt der Plug-Name
    assert {s["ergebnis"] for s in erg["schritte"] if s["ziel"] == "plug"} == {"entfaellt"}
    assert not [s for s in erg["schritte"] if s["ergebnis"] == "fehler"], erg["schritte"]

    ents, geraete, labels = er.async_get(hass), dr.async_get(hass), lr.async_get(hass)
    schalter = ents.async_get("switch.001_01_c_plug_man")
    assert schalter is not None and schalter.name == "001-01_C_PLUG_MAN" and ents.async_get("switch.hk1") is None
    assert ents.async_get("sensor.001_01_c_plug_man_leistung") is not None
    assert ents.async_get("sensor.001_01_c_plug_man_energie") is not None
    assert ents.async_get("sensor.hk1_rssi") is not None            # unbekannte Messwerte bleiben
    assert ents.async_get("sensor.001_c_temp_man_temperatur") is not None
    assert ents.async_get("sensor.001_c_temp_man_batterie") is not None
    eigene = [e for e in ents.entities.values() if e.platform == "baustelle" and e.device_id == schalter.device_id]
    assert eigene and all(not e.entity_id.startswith("sensor.001_01") for e in eigene)   # eigene Entitäten bleiben
    plug = geraete.async_get(schalter.device_id)
    assert plug is not None and plug.name_by_user == "001-01_C_PLUG_MAN"
    assert {labels.async_get_label(i).name for i in plug.labels} == {"Container", "Mannschaft", "Shelly Plug", "Herbert"}

    # eigene Verweise: Unter-Einträge, Name des Heizkörpers; einmal neu geladen mit den neuen IDs
    hk1, c1 = entry.subentries[HK1], entry.subentries[C1]
    assert hk1.data["schalter"] == "switch.001_01_c_plug_man"
    assert hk1.data["leistung"] == "sensor.001_01_c_plug_man_leistung"
    assert hk1.title == hk1.data["name"] == "001-01_C_HZ_MAN_Radiator01"
    assert c1.data["fuehler"] == "sensor.001_c_temp_man_temperatur" and c1.title == "Container 1"   # Anzeigename bleibt
    neu = entry.runtime_data
    assert neu is not alt_steuerung and not neu._gestoppt and alt_steuerung.neu_laden_folgt
    assert neu.geraete[HK1].schalter == "switch.001_01_c_plug_man" and neu.geraete[HK1].name == "001-01_C_HZ_MAN_Radiator01"
    assert any("Umbenannt nach Schema (001_C_MAN)" in p[3] for p in neu.e["protokoll"])

    zeilen = zeilen_db(hass, "umbenennung")
    assert len(zeilen) == 1 and zeilen[0]["status"] == "ausgefuehrt" and zeilen[0]["container_id"] == cid
    assert erg["id"] == zeilen[0]["id"]

    nochmal = await _senden(ws, 3, type="baustelle/inventar_umbenennen", container_id=cid)
    assert nochmal["success"] and nochmal["result"]["status"] == "nichts"   # in HA schon alles nach Schema
    assert len(zeilen_db(hass, "umbenennung")) == 1


async def test_konflikt_aendert_nichts(hass: HomeAssistant, baustelle_register, hass_ws_client) -> None:
    entry = baustelle_register
    er.async_get(hass).async_get_or_create("switch", "andere", "fremd", suggested_object_id="001_01_c_plug_man")
    ws = await hass_ws_client(hass)
    cid = await _container(ws, entry)
    antwort = await _senden(ws, 2, type="baustelle/inventar_umbenennen", container_id=cid)
    assert not antwort["success"] and antwort["error"]["code"] == "konflikt"
    assert "switch.hk1" in antwort["error"]["message"]
    await hass.async_block_till_done()
    assert er.async_get(hass).async_get("switch.hk1") is not None
    assert entry.subentries[HK1].data["schalter"] == "switch.hk1" and not entry.runtime_data._gestoppt
    assert zeilen_db(hass, "umbenennung") == []


async def test_nur_admins(hass: HomeAssistant, baustelle_register, hass_ws_client, hass_admin_user) -> None:
    entry = baustelle_register
    ws = await hass_ws_client(hass)
    cid = await _container(ws, entry)
    hass_admin_user.groups = []   # kein Admin mehr
    antwort = await _senden(ws, 2, type="baustelle/inventar_umbenennen", container_id=cid)
    assert not antwort["success"] and antwort["error"]["code"] == "unauthorized"
    assert er.async_get(hass).async_get("switch.hk1") is not None



class FakeShelly:
    """Shelly Gen2+ für `Sys.SetConfig`: merkt den Namen; `erreichbar=False` = offline."""

    def __init__(self) -> None:
        self.erreichbar, self.namen = False, []

    async def antwort(self, method: str, url: Any, data: Any) -> AiohttpClientMockResponse:
        if not self.erreichbar:
            return AiohttpClientMockResponse(method, url, exc=aiohttp.ClientConnectionError())
        anfrage = json.loads(data)
        if anfrage["method"] != "Sys.SetConfig":   # Runde des Notprogramms (ausgeschaltet: Skripte prüfen)
            return AiohttpClientMockResponse(method, url, json={"id": 1, "result": {"scripts": []}})
        self.namen.append(anfrage["params"]["config"]["device"]["name"])
        return AiohttpClientMockResponse(method, url, json={"id": 1, "result": {"restart_required": False}})


@pytest.fixture
async def baustelle_shelly(hass: HomeAssistant, freezer, shellys, nachrichten, aioclient_mock: AiohttpClientMocker):
    plug = FakeShelly()
    aioclient_mock.post("http://plug1/rpc", side_effect=plug.antwort)
    _shellys_im_register(hass, host="plug1")
    entry = await baustelle_anlegen(hass, freezer)
    assert await hass.config_entries.async_setup(entry.entry_id)
    await hass.async_block_till_done()
    shellys.anmelden()
    return entry, plug


async def test_plug_name_offline_und_nachholen(hass: HomeAssistant, baustelle_shelly, hass_ws_client) -> None:
    """06c: Plug offline → teilweise; derselbe Befehl holt nach und trägt es in dieselbe Umbenennung ein."""
    entry, plug = baustelle_shelly
    ws = await hass_ws_client(hass)
    cid = await _container(ws, entry)
    erst = await _senden(ws, 2, type="baustelle/inventar_umbenennen", container_id=cid)
    await hass.async_block_till_done()
    assert erst["success"] and erst["result"]["status"] == "teilweise" and not erst["result"]["nachgeholt"]
    schritt = next(s for s in erst["result"]["schritte"] if s["ziel"] == "plug")
    assert schritt["ergebnis"] == "fehler" and "Sys.SetConfig" in schritt["fehler"]
    assert er.async_get(hass).async_get("switch.001_01_c_plug_man") is not None   # HA ist trotzdem umbenannt

    plug.erreichbar = True
    hass.states.async_set("switch.001_01_c_plug_man", "off")   # die Shelly-Integration meldet den Schalter neu
    danach = await _senden(ws, 3, type="baustelle/inventar_umbenennen", container_id=cid)
    await hass.async_block_till_done()
    assert danach["success"] and danach["result"]["nachgeholt"] and danach["result"]["status"] == "ausgefuehrt"
    assert danach["result"]["id"] == erst["result"]["id"] and plug.namen == ["001-01_C_PLUG_MAN"]
    zeilen = zeilen_db(hass, "umbenennung")
    assert len(zeilen) == 1 and zeilen[0]["status"] == "ausgefuehrt"
    plug_schritt = next(s for s in json.loads(zeilen[0]["schritte"]) if s["ziel"] == "plug")
    assert plug_schritt["alt"] == "Heizung 01" and plug_schritt["nachgeholt"]   # alter Name bleibt für Rückgängig
    assert any("Umbenennung nachgeholt (001_C_MAN)" in p[3] for p in entry.runtime_data.e["protokoll"])


async def test_selbst_nachholen(hass: HomeAssistant, baustelle_shelly, hass_ws_client, freezer) -> None:
    """06c: Plug-Namen holt die Integration alle 30 min selbst nach – nur wenn der Plug erreichbar ist."""
    entry, plug = baustelle_shelly
    ws = await hass_ws_client(hass)
    cid = await _container(ws, entry)
    await _senden(ws, 2, type="baustelle/inventar_umbenennen", container_id=cid)
    await hass.async_block_till_done()
    hass.states.async_set("switch.001_01_c_plug_man", "unavailable")
    freezer.tick(timedelta(minutes=31))
    async_fire_time_changed(hass)
    await hass.async_block_till_done(wait_background_tasks=True)   # die Runde läuft als Hintergrundaufgabe
    assert plug.namen == [] and zeilen_db(hass, "umbenennung")[0]["status"] == "teilweise"   # nicht erreichbar: kein Versuch

    plug.erreichbar = True
    hass.states.async_set("switch.001_01_c_plug_man", "off")
    freezer.tick(timedelta(minutes=31))
    async_fire_time_changed(hass)
    await hass.async_block_till_done(wait_background_tasks=True)   # die Runde läuft als Hintergrundaufgabe
    assert plug.namen == ["001-01_C_PLUG_MAN"] and zeilen_db(hass, "umbenennung")[0]["status"] == "ausgefuehrt"


def _zustaende_umziehen(hass: HomeAssistant) -> None:
    """Was die echte Plattform nach dem Umbenennen tut: Zustand unter der neuen Entity-ID, die alte ist frei."""
    for alt, neu in (("switch.hk1", "switch.001_01_c_plug_man"), ("sensor.hk1_power", "sensor.001_01_c_plug_man_leistung"),
                     ("sensor.temp_c1", "sensor.001_c_temp_man_temperatur")):
        if (zustand := hass.states.get(alt)) is not None:
            hass.states.async_remove(alt)
            hass.states.async_set(neu, zustand.state)


async def test_rueckgaengig(hass: HomeAssistant, baustelle_shelly, hass_ws_client) -> None:
    """06d: Vorschau, dann alles zurück – Entity-IDs, Namen, Gerät, Labels, Verweise und Plug-Name; nur die jüngste."""
    entry, plug = baustelle_shelly
    plug.erreichbar = True
    ws = await hass_ws_client(hass)
    cid = await _container(ws, entry)
    keine = await _senden(ws, 2, type="baustelle/inventar_rueckgaengig", container_id=cid, vorschau=True)
    assert not keine["success"] and keine["error"]["code"] == "not_found"   # noch nichts umbenannt
    um = await _senden(ws, 3, type="baustelle/inventar_umbenennen", container_id=cid)
    await hass.async_block_till_done()
    assert um["result"]["status"] == "ausgefuehrt"
    _zustaende_umziehen(hass)

    vorschau = await _senden(ws, 4, type="baustelle/inventar_rueckgaengig", container_id=cid, vorschau=True)
    assert vorschau["success"] and vorschau["result"]["konflikte"] == {}
    ids = {s["ref"]: s["neu"] for s in vorschau["result"]["schritte"] if s["ziel"] == "entitaet_id"}
    assert ids["switch.001_01_c_plug_man"] == "switch.hk1"
    assert er.async_get(hass).async_get("switch.001_01_c_plug_man") is not None   # Vorschau ändert nichts

    zurueck = await _senden(ws, 5, type="baustelle/inventar_rueckgaengig", container_id=cid)
    await hass.async_block_till_done()
    assert zurueck["success"] and zurueck["result"]["status"] == "zurueck", zurueck
    ents, geraete, labels = er.async_get(hass), dr.async_get(hass), lr.async_get(hass)
    schalter = ents.async_get("switch.hk1")
    assert schalter is not None and schalter.name is None and ents.async_get("switch.001_01_c_plug_man") is None
    assert ents.async_get("sensor.temp_c1") is not None and ents.async_get("sensor.hk1_power") is not None
    geraet = geraete.async_get(schalter.device_id)
    assert geraet is not None and geraet.name_by_user is None   # wieder der eigene Name „Heizung 01“
    assert {labels.async_get_label(i).name for i in geraet.labels} == {"Lager", "Herbert"}
    hk1, c1 = entry.subentries[HK1], entry.subentries[C1]
    assert hk1.data["schalter"] == "switch.hk1" and hk1.data["leistung"] == "sensor.hk1_power" and hk1.title == "Heizkörper 1"
    assert c1.data["fuehler"] == "sensor.temp_c1" and entry.runtime_data.geraete[HK1].schalter == "switch.hk1"
    assert plug.namen == ["001-01_C_PLUG_MAN", "Heizung 01"]
    assert any("Umbenennung zurückgenommen (001_C_MAN)" in p[3] for p in entry.runtime_data.e["protokoll"])
    zeilen = zeilen_db(hass, "umbenennung")
    assert len(zeilen) == 1 and zeilen[0]["status"] == "zurueck"
    assert all(s.get("zurueck") in ("ok", None) for s in json.loads(zeilen[0]["schritte"]))

    nochmal = await _senden(ws, 6, type="baustelle/inventar_rueckgaengig", container_id=cid)
    assert not nochmal["success"] and nochmal["error"]["code"] == "not_found"   # nur einmal, nur die jüngste


async def test_rueckgaengig_nur_admins_und_konflikt(hass: HomeAssistant, baustelle_register, hass_ws_client,
                                                    hass_admin_user) -> None:
    entry = baustelle_register
    ws = await hass_ws_client(hass)
    cid = await _container(ws, entry)
    await _senden(ws, 2, type="baustelle/inventar_umbenennen", container_id=cid)
    await hass.async_block_till_done()
    _zustaende_umziehen(hass)
    er.async_get(hass).async_get_or_create("switch", "andere", "neu-belegt", suggested_object_id="hk1")   # alte ID vergeben
    konflikt = await _senden(ws, 3, type="baustelle/inventar_rueckgaengig", container_id=cid)
    assert not konflikt["success"] and konflikt["error"]["code"] == "konflikt"
    assert er.async_get(hass).async_get("switch.001_01_c_plug_man") is not None
    hass_admin_user.groups = []
    lesen = await _senden(ws, 4, type="baustelle/inventar_rueckgaengig", container_id=cid, vorschau=True)
    verboten = await _senden(ws, 5, type="baustelle/inventar_rueckgaengig", container_id=cid)
    assert lesen["success"] and lesen["result"]["konflikte"] == {"switch.001_01_c_plug_man": "switch.hk1"}
    assert not verboten["success"] and verboten["error"]["code"] == "unauthorized"


async def test_fehler_nach_dem_anhalten_laedt_trotzdem_neu(hass: HomeAssistant, baustelle_register, hass_ws_client,
                                                          monkeypatch) -> None:
    """Audit 0.8.165: scheitert ein Schritt, nachdem die Steuerung angehalten ist, wird trotzdem neu geladen."""
    from custom_components.baustelle import umbenennen  # noqa: PLC0415

    entry = baustelle_register
    alt = entry.runtime_data
    ws = await hass_ws_client(hass)
    cid = await _container(ws, entry)

    def kaputt(*_a, **_kw):
        raise RuntimeError("kaputt")

    monkeypatch.setattr(umbenennen, "_verweise", kaputt)
    antwort = await _senden(ws, 2, type="baustelle/inventar_umbenennen", container_id=cid)
    assert not antwort["success"]
    await hass.async_block_till_done()
    assert alt._gestoppt and entry.runtime_data is not alt and not entry.runtime_data._gestoppt
