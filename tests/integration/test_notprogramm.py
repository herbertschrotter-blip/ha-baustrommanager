"""Notprogramm in den Plugs einrichten und aktuell halten (BSM-017) – mit nachgebautem Shelly (RPC über HTTP)."""

from __future__ import annotations

import json
import re
from typing import Any

import aiohttp
import pytest
from yarl import URL

from homeassistant.core import HomeAssistant
from homeassistant.helpers import device_registry as dr, entity_registry as er
from homeassistant.util import dt as dt_util
from datetime import timedelta

from pytest_homeassistant_custom_component.common import MockConfigEntry, async_fire_time_changed
from pytest_homeassistant_custom_component.test_util.aiohttp import AiohttpClientMocker, AiohttpClientMockResponse

from custom_components.baustelle import notprogramm as np_modul
from custom_components.baustelle.logik import notprogramm as logik
from custom_components.baustelle.logik.warnungen import titel
from custom_components.baustelle.notprogramm import DATA_NOTPROGRAMM, SKRIPT_NAME, Notprogramm, skript_lesen

from .conftest import baustelle_anlegen

BT_FUEHLER = "AA:BB:CC:DD:EE:01"
BT_TUER = "08:B9:5F:00:00:02"
VERSION = skript_lesen()[0]


class FakePlug:
    """Ein Shelly Plug S Gen3 von außen gesehen: Skripte, KVS, BTHome-Komponenten, Endpunkt `hb`."""

    def __init__(self) -> None:
        self.skripte: dict[int, dict[str, Any]] = {1: {"name": "aioshelly_ble_integration", "enable": False, "running": True, "code": ""}}
        self.kvs: dict[str, str] = {}
        self.geladen: int | None = None
        self.aufrufe: list[str] = []
        self.erreichbar = True
        self.nb = 0   # „Notbetrieb seit“ (Unix-Sekunden), das das Skript beim nächsten Lebenszeichen meldet
        self.in_mode = "momentary"   # PLUGS_UI: Taste schaltet das Relais
        self.komponenten = [
            {"key": "bthomedevice:200", "config": {"id": 200, "addr": BT_FUEHLER.lower()}},
            {"key": "bthomesensor:200", "config": {"id": 200, "addr": BT_FUEHLER.lower(), "obj_id": 1}},
            {"key": "bthomesensor:202", "config": {"id": 202, "addr": BT_FUEHLER.lower(), "obj_id": 69}},
            {"key": "bthomesensor:203", "config": {"id": 203, "addr": "11:22:33:44:55:66", "obj_id": 69}},
        ]

    def rpc(self, methode: str, p: dict[str, Any]) -> Any:
        self.aufrufe.append(methode)
        s = self.skripte
        match methode:
            case "Script.List":
                return {"scripts": [{"id": i, "name": x["name"], "enable": x["enable"], "running": x["running"]} for i, x in s.items()]}
            case "Script.Create":
                neu = max(s) + 1
                s[neu] = {"name": p["name"], "enable": False, "running": False, "code": ""}
                return {"id": neu}
            case "Script.PutCode":
                assert not s[p["id"]]["running"], "PutCode bei laufendem Skript"
                assert len(p["code"]) <= np_modul.STUECK
                s[p["id"]]["code"] = (s[p["id"]]["code"] if p["append"] else "") + p["code"]
                return {"len": len(s[p["id"]]["code"])}
            case "Script.SetConfig":
                s[p["id"]].update(p["config"])
                return {"restart_required": False}
            case "Script.Start" | "Script.Stop":
                s[p["id"]]["running"] = methode == "Script.Start"
                return {"was_running": True}
            case "KVS.GetMany":
                muster = re.compile("^" + p["match"].replace("*", ".*") + "$")
                return {"items": [{"key": k, "value": w, "etag": "x"} for k, w in self.kvs.items() if muster.match(k)]}
            case "KVS.Set":
                assert len(p["value"]) <= logik.MAX_WERT
                self.kvs[p["key"]] = p["value"]
                return {"etag": "x"}
            case "BTHome.DeleteSensor" | "BTHome.DeleteDevice":
                art = "bthomesensor" if methode.endswith("Sensor") else "bthomedevice"
                self.komponenten = [k for k in self.komponenten if k["key"] != f"{art}:{p['id']}"]
                return None
            case "BTHome.AddDevice" | "BTHome.AddSensor":
                art = "bthomedevice" if methode.endswith("Device") else "bthomesensor"
                nr = max([int(k["key"].split(":")[1]) for k in self.komponenten if k["key"].startswith(art)] + [199]) + 1
                self.komponenten.append({"key": f"{art}:{nr}", "config": {"id": nr, **p["config"]}})
                return {"added": f"{art}:{nr}"}
            case "BTHomeDevice.SetConfig" | "BTHomeSensor.SetConfig":
                art = "bthomedevice" if methode.startswith("BTHomeDevice") else "bthomesensor"
                next(k for k in self.komponenten if k["key"] == f"{art}:{p['id']}")["config"].update(p["config"])
                return {"restart_required": False}
            case "PLUGS_UI.GetConfig":
                return {"leds": {}, "controls": {"switch:0": {"in_mode": self.in_mode}}}
            case "PLUGS_UI.SetConfig":
                self.in_mode = p["config"]["controls"]["switch:0"]["in_mode"]
                return {"restart_required": False}
            case "Shelly.GetComponents":
                teile = self.komponenten[p.get("offset", 0):][:3]   # wie das Gerät: seitenweise
                return {"components": teile, "offset": p.get("offset", 0), "total": len(self.komponenten)}
        raise AssertionError(methode)

    def eigenes(self) -> tuple[int, dict[str, Any]] | None:
        return next(((i, x) for i, x in self.skripte.items() if x["name"] == SKRIPT_NAME), None)

    async def antwort(self, method: str, url: URL, data: Any) -> AiohttpClientMockResponse:
        if not self.erreichbar:
            return AiohttpClientMockResponse(method, url, exc=aiohttp.ClientConnectionError())
        if url.path == "/rpc":
            anfrage = json.loads(data)
            if anfrage["method"] == "BTHome.AddDevice":   # wie das Gerät: legt an, antwortet aber nicht
                self.rpc(anfrage["method"], anfrage["params"])
                return AiohttpClientMockResponse(method, url, exc=TimeoutError())
            return AiohttpClientMockResponse(method, url, json={"id": 1, "result": self.rpc(anfrage["method"], anfrage["params"])})
        treffer = re.fullmatch(r"/script/(\d+)/hb", url.path)
        x = self.skripte.get(int(treffer.group(1))) if treffer else None
        if x is None or not x["running"]:
            return AiohttpClientMockResponse(method, url, status=404, text="")
        self.aufrufe.append("hb?neu" if "neu" in url.query_string else "hb")
        version = int(m.group(1)) if (m := re.search(r"let VERSION = (\d+);", x["code"])) else None
        antwort = {"v": version, "programm": self.geladen, "fenster": 0, "nb": self.nb, "taste": 0}
        self.nb = 0   # das Lebenszeichen beendet den Notbetrieb
        if "neu" in url.query_string:
            self.geladen = json.loads(self.kvs["bs_cfg"])["v"] if "bs_cfg" in self.kvs else None
        return AiohttpClientMockResponse(method, url, json=antwort)


def _plug_eintragen(hass: HomeAssistant, host: str, schalter: str, mac: str) -> str:
    entry = MockConfigEntry(domain="shelly", data={"host": host, "gen": 3}, unique_id=mac)
    entry.add_to_hass(hass)
    geraet = dr.async_get(hass).async_get_or_create(config_entry_id=entry.entry_id, connections={(dr.CONNECTION_NETWORK_MAC, mac)})
    er.async_get(hass).async_get_or_create("switch", "shelly", f"{mac}-switch:0", suggested_object_id=schalter.split(".")[1],
                                           device_id=geraet.id, config_entry=entry)
    # Event-Entität des Skripts (legt die Shelly-Integration an, standardmäßig deaktiviert) – unser Skript bekommt id 2
    er.async_get(hass).async_get_or_create("event", "shelly", f"{mac}-script:2", suggested_object_id=f"{host}_baustelle", device_id=geraet.id,
                                           config_entry=entry, disabled_by=er.RegistryEntryDisabler.INTEGRATION)
    return geraet.id


@pytest.fixture
async def anlage(hass: HomeAssistant, freezer, shellys, nachrichten, aioclient_mock: AiohttpClientMocker, monkeypatch):
    """Baustelle B1 mit zwei Heizungs-Plugs (Shelly-Integration) und dem Fühler von Container 1 als BTHome-Gerät."""
    monkeypatch.setattr(np_modul, "WARTEN_S", 0)
    _plug_eintragen(hass, "plug1", "switch.hk1", "aa:00:00:00:00:01")
    _plug_eintragen(hass, "plug2", "switch.hk2", "aa:00:00:00:00:02")
    bthome = MockConfigEntry(domain="bthome", unique_id=BT_FUEHLER)
    bthome.add_to_hass(hass)
    fuehler = dr.async_get(hass).async_get_or_create(config_entry_id=bthome.entry_id, connections={(dr.CONNECTION_BLUETOOTH, BT_FUEHLER)},
                                                     name="001_C_TEMP_C1")
    tuer = dr.async_get(hass).async_get_or_create(config_entry_id=bthome.entry_id, connections={(dr.CONNECTION_BLUETOOTH, BT_TUER)},
                                                  name="SBDW-103C 142B")
    dr.async_get(hass).async_update_device(tuer.id, name_by_user="002_C_DOOR_C2")   # von Herbert umbenannt
    er.async_get(hass).async_get_or_create("binary_sensor", "bthome", f"{BT_TUER}-window", suggested_object_id="tuer_c2",
                                           device_id=tuer.id, config_entry=bthome)
    er.async_get(hass).async_get_or_create("sensor", "bthome", f"{BT_FUEHLER}-temperature", suggested_object_id="temp_c1",
                                           device_id=fuehler.id, config_entry=bthome)
    plugs = {"plug1": FakePlug(), "plug2": FakePlug()}
    for host, plug in plugs.items():
        aioclient_mock.post(f"http://{host}/rpc", side_effect=plug.antwort)
        aioclient_mock.get(re.compile(rf"^http://{host}/script/"), side_effect=plug.antwort)
    entry = await baustelle_anlegen(hass, freezer)
    assert await hass.config_entries.async_setup(entry.entry_id)
    await hass.async_block_till_done()
    shellys.anmelden()
    np: Notprogramm = hass.data[DATA_NOTPROGRAMM][entry.entry_id]
    return entry, np, plugs


async def test_startet_aus_und_spielt_nichts_ein(hass: HomeAssistant, anlage) -> None:
    entry, np, plugs = anlage
    assert entry.runtime_data.e["heizung"]["notprogramm"] is False
    await np.async_runde()
    for plug in plugs.values():
        assert plug.aufrufe == ["Script.List"]   # nur nachsehen, ob ein altes Skript läuft
        assert plug.eigenes() is None and plug.kvs == {}
    await np.async_runde()
    assert plugs["plug1"].aufrufe == ["Script.List"]   # einmal je Start


async def test_einrichten_programm_und_lebenszeichen(hass: HomeAssistant, anlage) -> None:
    entry, np, plugs = anlage
    st = entry.runtime_data
    st.e["heizung"]["notprogramm"] = True
    await np.async_runde()
    p1 = plugs["plug1"]
    i, skript = p1.eigenes()
    assert skript["enable"] and skript["running"]
    assert f"let VERSION = {VERSION};" in skript["code"] and "// Notprogramm" not in skript["code"]   # ohne Kommentare
    assert p1.aufrufe.count("Script.PutCode") > 1   # in Stücken
    assert set(p1.kvs) == {"bs_cfg"} | {f"bs_p{w}" for w in range(7)}
    cfg1 = json.loads(p1.kvs["bs_cfg"])
    assert cfg1["m"] == "hand" and cfg1["fe"] is None   # Automatik aus: nicht anfassen, kein Frostschutz
    assert cfg1["t"] == 202                             # genau der Fühler des Containers, über die Bluetooth-Adresse
    assert json.loads(plugs["plug2"].kvs["bs_cfg"])["t"] is None   # Container 2 hat keinen Fühler
    assert p1.geladen == cfg1["v"] and "hb?neu" in p1.aufrufe
    # Di 29.09.2026 16:50: heute vorbei (Arbeitszeit bis 16:30, Nachheizen 15 min), Mi ab 06:15 (Vorheizen 45 min), Sa/So frei
    assert p1.kvs["bs_p1"] == logik.LEER and p1.kvs["bs_p5"] == logik.LEER and p1.kvs["bs_p6"] == logik.LEER
    von, bis, soll = p1.kvs["bs_p2"].split(",")
    assert dt_util.utc_from_timestamp(int(von)).astimezone(dt_util.get_default_time_zone()).strftime("%a %H:%M") == "Wed 06:15"
    assert dt_util.utc_from_timestamp(int(bis)).astimezone(dt_util.get_default_time_zone()).strftime("%H:%M") == "16:45"
    assert np.stand[next(g for g in st.geraete if st.geraete[g].schalter == "switch.hk1")].info()["fehler"] is None

    # nächste Runde: nichts Neues → nur Lebenszeichen, kein Schreiben
    p1.aufrufe.clear()
    await np.async_runde()
    assert "KVS.Set" not in p1.aufrufe and "Script.PutCode" not in p1.aufrufe and p1.aufrufe.count("hb") == 1

    # Automatik ein → nur bs_cfg ändert sich (Fenster bleiben)
    p1.aufrufe.clear()
    st.e["automatik"] = True
    await np.async_runde()
    assert p1.aufrufe.count("KVS.Set") == 1 and "hb?neu" in p1.aufrufe
    cfg = json.loads(p1.kvs["bs_cfg"])
    assert cfg["m"] == "thermo" and (cfg["fe"], cfg["fa"]) == (5.0, 7.0) and p1.geladen == cfg["v"]
    assert json.loads(plugs["plug2"].kvs["bs_cfg"])["m"] == "plan"   # ohne Fühler am Plug: in der Heizzeit an


async def test_skript_geloescht_oder_veraltet(hass: HomeAssistant, anlage) -> None:
    entry, np, plugs = anlage
    entry.runtime_data.e["heizung"]["notprogramm"] = True
    await np.async_runde()
    p1 = plugs["plug1"]
    i, _ = p1.eigenes()
    del p1.skripte[i]                 # jemand löscht das Skript
    p1.kvs.clear()
    await np.async_runde()
    assert p1.eigenes() is not None and p1.eigenes()[1]["running"] and len(p1.kvs) == 8
    i, skript = p1.eigenes()
    skript["code"] = skript["code"].replace(f"let VERSION = {VERSION};", "let VERSION = 0;")   # alte Version
    p1.aufrufe.clear()
    await np.async_runde()
    assert p1.aufrufe[:3] == ["Script.List", "hb", "Script.Stop"] and f"let VERSION = {VERSION};" in p1.eigenes()[1]["code"]
    skript = p1.eigenes()[1]
    skript["running"] = False         # angehalten (z. B. Absturz)
    await np.async_runde()
    assert p1.eigenes()[1]["running"]


async def test_ausschalten_haelt_das_skript_an(hass: HomeAssistant, anlage) -> None:
    entry, np, plugs = anlage
    st = entry.runtime_data
    st.e["heizung"]["notprogramm"] = True
    await np.async_runde()
    st.e["heizung"]["notprogramm"] = False
    await np.async_runde()
    for plug in plugs.values():
        skript = plug.eigenes()[1]
        assert not skript["running"] and not skript["enable"]   # übernimmt nicht nach 15 min ohne Lebenszeichen


async def test_entfernter_oder_umgestellter_plug_wird_abgeschaltet(hass: HomeAssistant, anlage) -> None:
    """BSM-034.01 (Bauplan Geräte §3 Fehler 1): kein Notbetrieb mit altem Programm in Plugs, die kein Heizkörper mehr sind."""
    entry, np, plugs = anlage
    st = entry.runtime_data
    st.e["heizung"]["notprogramm"] = True
    await np.async_runde()
    assert set(st.lz["np_plugs"].values()) == {"switch.hk1", "switch.hk2"}
    hk1 = next(g for g in st.geraete if st.geraete[g].schalter == "switch.hk1")
    hk2 = next(g for g in st.geraete if st.geraete[g].schalter == "switch.hk2")

    # Heizkörper 2 entfernen: die neue Runde (nach dem Neuladen) hält sein Skript an
    hass.config_entries.async_remove_subentry(entry, hk2)
    await hass.async_block_till_done()
    st, np = entry.runtime_data, hass.data[DATA_NOTPROGRAMM][entry.entry_id]
    await np.async_runde()
    assert not plugs["plug2"].eigenes()[1]["running"] and not plugs["plug2"].eigenes()[1]["enable"]
    assert plugs["plug1"].eigenes()[1]["running"]
    assert set(st.lz["np_plugs"].values()) == {"switch.hk1"} and hk2 not in np.stand
    assert any("switch.hk2 abgeschaltet" in e[-1] for e in st.e["protokoll"] if isinstance(e[-1], str))

    # Heizkörper 1 auf Steckdose umstellen: ebenso
    sub = entry.subentries[hk1]
    hass.config_entries.async_update_subentry(entry, sub, data={**sub.data, "rolle": "steckdose"})
    await hass.async_block_till_done()
    np = hass.data[DATA_NOTPROGRAMM][entry.entry_id]
    await np.async_runde()
    assert not plugs["plug1"].eigenes()[1]["running"] and entry.runtime_data.lz["np_plugs"] == {}


async def test_plug_nicht_erreichbar(hass: HomeAssistant, anlage) -> None:
    entry, np, plugs = anlage
    st = entry.runtime_data
    st.e["heizung"]["notprogramm"] = True
    plugs["plug1"].erreichbar = False
    await np.async_runde()
    stand = {st.geraete[g].schalter: s for g, s in np.stand.items()}
    assert stand["switch.hk1"].fehler and stand["switch.hk2"].fehler is None   # der andere läuft weiter
    assert plugs["plug2"].eigenes() is not None
    plugs["plug1"].erreichbar = True
    await np.async_runde()
    assert stand["switch.hk1"].fehler is None and len(plugs["plug1"].kvs) == 8
    assert np.info()["plugs"]["Heizkörper 1"]["programm"] is not None


async def test_kopplungen_in_ordnung_halten(hass: HomeAssistant, anlage) -> None:
    """BSM-030: Fühler und Tür des Containers koppeln und benennen, Fremdes entfernen, Protokoll; danach Ruhe."""
    entry, np, plugs = anlage
    st = entry.runtime_data
    st.einstellungen.bereich("sub_c2")["tuer"] = "binary_sensor.tuer_c2"
    st.e["heizung"]["notprogramm"] = True
    await np.async_runde()
    k1 = {k["key"]: k["config"] for k in plugs["plug1"].komponenten}
    assert {c["name"] for c in k1.values()} == {"001_C_TEMP_C1", "001_C_TEMP_C1_Batterie", "001_C_TEMP_C1_Feuchte",
                                                "001_C_TEMP_C1_Temperatur"}   # fremder Messwert weg, Feuchte neu
    assert k1["bthomesensor:202"]["obj_id"] == 69                             # vorhandener Messwert bleibt (Nummer)
    k2 = {c["name"]: c for c in (k["config"] for k in plugs["plug2"].komponenten)}
    assert set(k2) == {"002_C_DOOR_C2", "002_C_DOOR_C2_Batterie", "002_C_DOOR_C2_Tuer", "002_C_DOOR_C2_Drehung",
                       "002_C_DOOR_C2_Lichtstufe"}   # Fühler von Container 1 an Plug 2 entfernt, Tür gekoppelt
    cfg2 = json.loads(plugs["plug2"].kvs["bs_cfg"])
    assert cfg2["d"] == [k2["002_C_DOOR_C2_Tuer"]["id"]] and cfg2["t"] is None   # BSM-034.03: Liste
    texte = [e[3] for e in st.einstellungen.daten["protokoll"] if e[3].startswith("Notprogramm")]
    assert any("002_C_DOOR_C2 gekoppelt" in t for t in texte) and any("001_C_TEMP_C1 umbenannt" in t for t in texte)
    for plug in plugs.values():
        plug.aufrufe.clear()
    await np.async_runde()
    for plug in plugs.values():
        assert not [a for a in plug.aufrufe if a.startswith("BTHome")], plug.aufrufe   # alles in Ordnung: nichts zu tun
    assert {k["key"] for k in plugs["plug1"].komponenten if k["key"].startswith("bthome")} == set(k1)


async def test_tuer_und_fenster_am_plug(hass: HomeAssistant, anlage) -> None:
    """BSM-034.03: alle Türen und Fenster des Containers werden gekoppelt und stehen im Programm (`d` als Liste)."""
    entry, np, plugs = anlage
    st = entry.runtime_data
    bthome = next(e for e in hass.config_entries.async_entries("bthome"))
    fenster = dr.async_get(hass).async_get_or_create(config_entry_id=bthome.entry_id,
                                                     connections={(dr.CONNECTION_BLUETOOTH, "08:B9:5F:00:00:03")},
                                                     name="002_C_FEN_C2")
    er.async_get(hass).async_get_or_create("binary_sensor", "bthome", "08:B9:5F:00:00:03-window", suggested_object_id="fenster_c2",
                                           device_id=fenster.id, config_entry=bthome)
    st.einstellungen.bereich("sub_c2")["tuer"] = "binary_sensor.tuer_c2"
    st.einstellungen.bereich("sub_c2")["symbol"] = {"doppel": False, "farbe": None, "rahmen": None, "licht": None,
                                                    "tueren": [{"wand": "front", "pos": 0.15, "sensor": None}],
                                                    "fenster": [{"wand": "front", "pos": 0.67, "sensor": "binary_sensor.fenster_c2"}]}
    st.e["heizung"]["notprogramm"] = True
    await np.async_runde()
    await np.async_runde()   # Messwerte, die in der ersten Runde neu gekoppelt wurden, stehen jetzt im Programm
    k2 = {c["name"]: c for c in (k["config"] for k in plugs["plug2"].komponenten)}
    assert {"002_C_DOOR_C2_Tuer", "002_C_FEN_C2_Tuer"} <= set(k2)
    cfg2 = json.loads(plugs["plug2"].kvs["bs_cfg"])
    assert sorted(cfg2["d"]) == sorted([k2["002_C_DOOR_C2_Tuer"]["id"], k2["002_C_FEN_C2_Tuer"]["id"]])
    g2 = next(g for g in st.geraete if st.geraete[g].schalter == "switch.hk2")
    assert sorted(np.stand[g2].info()["tuer"]) == sorted(cfg2["d"])


async def test_anzeige_pruefen_dienst_rechte(hass: HomeAssistant, anlage, hass_ws_client, hass_admin_user) -> None:
    """BSM-019: Zustand je Plug in der Struktur, „Jetzt prüfen“ (nur Admins) und Dienst."""
    from custom_components.baustelle.daten import laufzeit
    entry, np, plugs = anlage
    st = entry.runtime_data
    hk1 = next(g for g in st.geraete if st.geraete[g].schalter == "switch.hk1")
    p1 = next(g for g in st.geraete if st.geraete[g].rolle == "pumpe")
    lz = laufzeit(st)
    assert lz["notprogramm"] == {"an": False, "geprueft": None}
    assert lz["geraete"][hk1]["notprogramm"]["zustand"] == "aus" and lz["geraete"][p1]["notprogramm"] is None
    st.e["heizung"]["notprogramm"] = True
    assert laufzeit(st)["geraete"][hk1]["notprogramm"]["zustand"] == "offen"   # eingeschaltet, noch nicht geprüft

    client = await hass_ws_client(hass)
    await client.send_json({"id": 1, "type": "baustelle/notprogramm_pruefen", "entry_id": entry.entry_id})
    antwort = await client.receive_json()
    assert antwort["success"] and antwort["result"]["an"] is True and antwort["result"]["geprueft"]
    n = laufzeit(st)["geraete"][hk1]["notprogramm"]
    assert n["zustand"] == "bereit" and n["version"] == VERSION and n["programm"] is not None and n["fuehler"] == 202
    assert n["modus"] == "hand" and n["bis"] is not None and n["soll"] is not None   # Automatik aus → Hand im Plug
    hk2 = next(g for g in st.geraete if st.geraete[g].schalter == "switch.hk2")
    assert n["fuehler_fehlt"] is False and laufzeit(st)["geraete"][hk2]["notprogramm"]["fuehler_fehlt"] is False   # C2 ohne Fühler

    plugs["plug1"].aufrufe.clear()
    await hass.services.async_call("baustelle", "notprogramm_pruefen", {}, blocking=True)
    assert "hb" in plugs["plug1"].aufrufe

    hass_admin_user.groups = []   # ohne Admin-Recht
    await client.send_json({"id": 2, "type": "baustelle/notprogramm_pruefen", "entry_id": entry.entry_id})
    antwort = await client.receive_json()
    assert not antwort["success"] and antwort["error"]["code"] == "unauthorized"


async def test_notbetrieb_ins_protokoll_und_warnung(hass: HomeAssistant, anlage, freezer) -> None:
    """Meldet der Plug „Notbetrieb seit …“, steht er im Protokoll; ein Fehler über 15 min wird zur Warnung."""
    from custom_components.baustelle.daten import laufzeit
    entry, np, plugs = anlage
    st = entry.runtime_data
    st.e["heizung"]["notprogramm"] = True
    await np.async_runde()
    p1 = plugs["plug1"]
    p1.nb = int(dt_util.utcnow().timestamp()) - 40 * 60   # HA war 40 min weg, der Plug im Notbetrieb
    await np.async_runde()
    texte = [e[3] for e in st.einstellungen.daten["protokoll"]]
    assert any(t.startswith("Notbetrieb Heizkörper 1:") and "(40 min)" in t for t in texte), texte[:3]
    hk1 = next(g for g in st.geraete if st.geraete[g].schalter == "switch.hk1")
    assert laufzeit(st)["geraete"][hk1]["notprogramm"]["notbetrieb_zuletzt"] is not None

    # Fehler: erst nach 15 min eine Warnung
    plugs["plug2"].erreichbar = False
    await np.async_runde()
    st.auswerten(); await hass.async_block_till_done()
    assert not [w for w in st.daten.warnungen if w.art == "notprogramm"]
    freezer.tick(16 * 60)
    await np.async_runde()
    st.auswerten(); await hass.async_block_till_done()
    (w,) = [w for w in st.daten.warnungen if w.art == "notprogramm"]
    assert "Notprogramm nicht bereit" in titel(w)
    plugs["plug2"].erreichbar = True
    await np.async_runde()
    st.auswerten(); await hass.async_block_till_done()
    assert not [w for w in st.daten.warnungen if w.art == "notprogramm"]


async def test_stundenbuch_nachtragen(hass: HomeAssistant, anlage, freezer) -> None:
    """BSM-020: HA lief, der Plug war 3 h nicht erreichbar (Notbetrieb) – Stundenbuch nachtragen, Sprung kürzen, Tage neu."""
    from datetime import timedelta
    from sqlalchemy import insert, select
    from custom_components.baustelle.db import DATA_DB, schema as s
    entry, np, plugs = anlage
    st, db, p1 = entry.runtime_data, hass.data[DATA_DB], plugs["plug1"]
    hk1 = next(g for g in st.geraete if st.geraete[g].schalter == "switch.hk1")
    st.e["heizung"]["notprogramm"] = True
    await np.async_runde()
    jetzt = dt_util.utcnow().replace(second=0, microsecond=0)
    von = jetzt - timedelta(hours=3, minutes=10)
    # was HA in der Zeit geschrieben hat: Minuten ohne Verbindung, danach die erste erreichbare mit dem ganzen Zählersprung
    zeilen = [dict(geraet_id=hk1, zeit=von + timedelta(minutes=i), baustelle_id=entry.entry_id, dauer_s=60, sekunden_ein=0,
                   energie_wh=None, erreichbar=False, quelle="ha") for i in range(190)]
    zeilen.append(dict(geraet_id=hk1, zeit=jetzt, baustelle_id=entry.entry_id, dauer_s=60, sekunden_ein=60, energie_wh=2500.0,
                       erreichbar=True, quelle="ha"))
    await db.async_ausfuehren(lambda v: v.execute(insert(s.geraet_minute), zeilen))
    # Stundenbuch im Plug: je Stunde 500 Wh, 30 min ein, 21,0 °C
    stunden = range(int(von.timestamp()) // 3600, int(jetzt.timestamp()) // 3600 + 1)
    for h in stunden:
        k = f"bb_{(h // 6) % 28}"
        p1.kvs[k] = ";".join(x for x in [p1.kvs.get(k, ""), f"{h},500,30,210,0"] if x)
    p1.nb = int(von.timestamp())
    await np.async_runde()   # erkennt den Notbetrieb (Protokoll), trägt erst in der nächsten Runde nach
    assert np.stand[hk1].nachtrag_offen is not None
    await np.async_runde()
    assert np.stand[hk1].nachtrag_offen is None

    def lesen(v):
        gm, tg = s.geraet_minute, s.tag_geraet
        nach = list(v.execute(select(gm.c.zeit, gm.c.energie_wh, gm.c.sekunden_ein, gm.c.dauer_s).where(gm.c.geraet_id == hk1, gm.c.quelle == "notprogramm")))
        ohne = v.execute(select(gm.c.zeit).where(gm.c.geraet_id == hk1, gm.c.erreichbar.is_(False))).all()
        sprung = v.execute(select(gm.c.energie_wh).where(gm.c.geraet_id == hk1, gm.c.zeit == jetzt)).scalar()
        tag = v.execute(select(tg.c.kwh, tg.c.heizzeit_min).where(tg.c.geraet_id == hk1)).all()
        return nach, ohne, sprung, tag
    nach, ohne, sprung, tag = await db.async_ausfuehren(lesen)
    assert len(nach) == len(stunden) == 4 and all(z.energie_wh == 500 and z.sekunden_ein == 1800 for z in nach)
    assert ohne == []                                # Minuten ohne Verbindung durch die Stunden ersetzt
    assert sprung == 500.0                           # 2500 Wh Sprung − 2000 Wh nachgetragen (die letzte Stunde liegt danach)
    assert tag and abs(sum(t.kwh for t in tag) - (4 * 0.5 + 0.5)) < 0.01   # Tagessumme neu: 2,0 kWh Stunden + 0,5 kWh Rest
    texte = [e[3] for e in st.einstellungen.daten["protokoll"]]
    assert any("nachgetragen: 4 h aus dem Stundenbuch, 2,00 kWh" in t for t in texte), texte[:3]

    await np.async_runde()   # noch einmal: nichts doppelt
    assert len((await db.async_ausfuehren(lesen))[0]) == 4


async def test_notbetrieb_ohne_uhrzeit(hass: HomeAssistant, anlage) -> None:
    entry, np, plugs = anlage
    st = entry.runtime_data
    st.e["heizung"]["notprogramm"] = True
    await np.async_runde()
    plugs["plug1"].nb = 1   # das Skript meldet 1, wenn der Notbetrieb ohne Uhrzeit begann
    await np.async_runde()
    texte = [e[3] for e in st.einstellungen.daten["protokoll"]]
    assert any("ohne Uhrzeit begonnen" in t and "als Summe" in t for t in texte)
    assert all(s.nachtrag_offen is None for s in np.stand.values())


async def test_stundenbuch_nach_ha_aus(hass: HomeAssistant, anlage) -> None:
    """HA war aus: keine Minuten in der Zeit, nichts zu kürzen – die Stunden füllen die Lücke."""
    from datetime import timedelta
    from sqlalchemy import select
    from custom_components.baustelle.db import DATA_DB, schema as s
    entry, np, plugs = anlage
    st, db, p1 = entry.runtime_data, hass.data[DATA_DB], plugs["plug1"]
    hk1 = next(g for g in st.geraete if st.geraete[g].schalter == "switch.hk1")
    st.e["heizung"]["notprogramm"] = True
    await np.async_runde()
    jetzt = dt_util.utcnow()
    h = int((jetzt - timedelta(hours=2)).timestamp()) // 3600
    p1.kvs["bb_27"] = "1,9,9,9,9"   # alter Block, liegt außerhalb des Ausfalls
    p1.kvs[f"bb_{(h // 6) % 28}"] = f"{h},400,40,190,120;{h + 1},300,20,195,0" if (h + 1) // 6 == h // 6 else f"{h},400,40,190,120"
    if (h + 1) // 6 != h // 6:
        p1.kvs[f"bb_{((h + 1) // 6) % 28}"] = f"{h + 1},300,20,195,0"
    p1.nb = h * 3600 + 600
    await np.async_runde(); await np.async_runde()
    zeilen = await db.async_ausfuehren(lambda v: v.execute(select(s.geraet_minute.c.energie_wh, s.geraet_minute.c.quelle)
                                                              .where(s.geraet_minute.c.geraet_id == hk1)).all())
    assert sorted(z.energie_wh for z in zeilen if z.quelle == "notprogramm") == [300.0, 400.0]
    temp = await db.async_ausfuehren(lambda v: v.execute(select(s.bereich_minute.c.temperatur, s.bereich_minute.c.tuer_offen_s)
                                                            .where(s.bereich_minute.c.quelle == "notprogramm")).all())
    assert sorted(t.temperatur for t in temp) == [19.0, 19.5] and sum(t.tuer_offen_s for t in temp) == 120


async def test_taste_am_plug(hass: HomeAssistant, anlage) -> None:
    """BSM-018: Taste bleibt am Relais, Event-Entität einschalten, Drücken = 1 h heizen (Hand weg), nochmal = beenden."""
    entry, np, plugs = anlage
    st, reg = entry.runtime_data, er.async_get(hass)
    st.e["heizung"]["notprogramm"] = True
    await np.async_runde()
    assert plugs["plug1"].in_mode == "momentary"                          # Taste aus: nichts geändert
    assert reg.async_get("event.plug1_baustelle").disabled_by is not None
    st.e["heizung"]["taste"] = True
    plugs["plug2"].in_mode = "detached"                                   # wie nach 0.8.71: getrennt
    await np.async_runde()
    assert plugs["plug1"].in_mode == "momentary" and plugs["plug2"].in_mode == "momentary"   # Taste bleibt am Relais
    assert reg.async_get("event.plug1_baustelle").disabled_by is None    # eingeschaltet
    hk1 = next(g for g in st.geraete if st.geraete[g].schalter == "switch.hk1")
    st.lz["hand"][hk1] = dt_util.now().isoformat()                         # das Umschalten durch die Taste = Hand

    def druck(sek: int = 0) -> str:   # Zeitstempel eines Tastenereignisses (wie die Event-Entität), frisch
        return (dt_util.utcnow() + timedelta(seconds=sek)).isoformat()

    hass.states.async_set("event.plug1_baustelle", "unknown", {"event_types": ["baustelle_taste"]})
    hass.states.async_set("event.plug1_baustelle", druck(), {"event_type": "baustelle_taste"})
    await hass.async_block_till_done()
    assert "sub_c1" in st.lz["taste_bis"] and hk1 not in st.lz["hand"]
    assert any("Taste am Plug Heizkörper 1: 1 h heizen bis" in e[3] for e in st.einstellungen.daten["protokoll"])
    st.lz["hand"][hk1] = (dt_util.now() + timedelta(seconds=1)).isoformat()   # HA erkennt das Umschalten erst danach
    async_fire_time_changed(hass, dt_util.utcnow() + timedelta(seconds=6))
    await hass.async_block_till_done()
    assert hk1 not in st.lz["hand"]                                       # auch dann aufgehoben
    hass.states.async_set("event.plug1_baustelle", zweiter := druck(1), {"event_type": "baustelle_taste"})
    await hass.async_block_till_done()
    assert "sub_c1" not in st.lz["taste_bis"]                            # nochmal drücken beendet
    hass.states.async_set("event.plug1_baustelle", "unavailable", {})   # 07.10.2026: WLAN-Abriss, Entität kommt mit
    hass.states.async_set("event.plug1_baustelle", zweiter, {"event_type": "baustelle_taste"})   # dem alten Ereignis zurück
    await hass.async_block_till_done()
    assert "sub_c1" not in st.lz["taste_bis"]                            # kein neuer Druck
    alt = (dt_util.utcnow() - timedelta(hours=13)).isoformat()            # altes Ereignis (z. B. nach einem Neustart)
    hass.states.async_set("event.plug1_baustelle", "unknown", {})
    hass.states.async_set("event.plug1_baustelle", alt, {"event_type": "baustelle_taste"})
    await hass.async_block_till_done()
    assert "sub_c1" not in st.lz["taste_bis"]                            # zählt nicht
    hass.states.async_set("event.plug1_baustelle", druck(2), {"event_type": "anderes"})
    await hass.async_block_till_done()
    assert "sub_c1" not in st.lz["taste_bis"]                            # andere Ereignisse zählen nicht

    st.e["heizung"]["taste"] = False
    await np.async_runde()
    hass.states.async_set("event.plug1_baustelle", druck(3), {"event_type": "baustelle_taste"})
    await hass.async_block_till_done()
    assert "sub_c1" not in st.lz["taste_bis"]                            # Taste aus: Drücken wirkt nicht
    async_fire_time_changed(hass, dt_util.utcnow() + timedelta(seconds=6))   # verzögerte Hand-Prüfung ablaufen lassen
    await hass.async_block_till_done()


async def test_ausfall_probe(hass: HomeAssistant, anlage, freezer, hass_ws_client) -> None:
    """BSM-021: Probe – kein Lebenszeichen, Automatik lässt den Plug in Ruhe; danach Stundenbuch gegen HA-Messung."""
    from sqlalchemy import insert, select
    from custom_components.baustelle.db import DATA_DB, schema as s
    entry, np, plugs = anlage
    st, db, p1 = entry.runtime_data, hass.data[DATA_DB], plugs["plug1"]
    hk1 = next(g for g in st.geraete if st.geraete[g].schalter == "switch.hk1")
    st.e["heizung"]["notprogramm"] = True
    await np.async_runde()
    client = await hass_ws_client(hass)
    await client.send_json({"id": 1, "type": "baustelle/notprogramm_probe", "entry_id": entry.entry_id, "geraet": hk1, "minuten": 60})
    r = await client.receive_json()
    assert r["success"] and r["result"]["probe_bis"] is not None and hk1 in st.ruhe
    p1.aufrufe.clear()
    await np.async_runde()
    assert "hb" not in p1.aufrufe and "hb?neu" not in p1.aufrufe          # kein Lebenszeichen während der Probe

    start = dt_util.utcnow().replace(second=0, microsecond=0)
    freezer.tick(61 * 60)
    st.auswerten()   # der Takt lief die Stunde über weiter (sonst hinge die Steuerung, Audit 0.8.165)
    seit = start + timedelta(minutes=15)                                     # der Plug übernimmt nach 15 min
    zeilen = [dict(geraet_id=hk1, zeit=seit + timedelta(minutes=i), baustelle_id=entry.entry_id, dauer_s=60, sekunden_ein=60,
                   energie_wh=30.0, erreichbar=True, quelle="ha") for i in range(46)]   # HA hat mitgemessen
    await db.async_ausfuehren(lambda v: v.execute(insert(s.geraet_minute), zeilen))
    h = int(seit.timestamp()) // 3600   # die Probe liegt in einer Stunde (15:05 bis 15:51)
    p1.kvs[f"bb_{(h // 6) % 28}"] = f"{h - 30},1,1,200,0;{h},1380,46,215,0"   # dazu eine alte Stunde außerhalb
    p1.nb = int(seit.timestamp())
    await np.async_runde()                                                   # Probe vorbei: Lebenszeichen, Plug meldet Notbetrieb
    assert hk1 not in st.ruhe and "hb" in p1.aufrufe
    await np.async_runde()                                                   # vergleichen statt eintragen
    e = np.stand[hk1].probe_ergebnis
    assert e and e["buch_kwh"] == 1.38 and e["buch_min"] == 46 and e["ha_kwh"] == 1.38 and e["ha_min"] == 46
    n = await db.async_ausfuehren(lambda v: v.execute(select(s.geraet_minute.c.zeit).where(s.geraet_minute.c.quelle == "notprogramm")).all())
    assert n == []                                                           # nichts doppelt eingetragen
    texte = [x[3] for x in st.einstellungen.daten["protokoll"]]
    assert any("Ausfall-Probe Heizkörper 1: Stundenbuch 1,38 kWh, 46 min ein · HA gemessen 1,38 kWh, 46 min ein" in t for t in texte), texte[:4]

    await client.send_json({"id": 2, "type": "baustelle/notprogramm_probe", "entry_id": entry.entry_id, "geraet": "unbekannt", "minuten": 30})
    assert not (await client.receive_json())["success"]


# ---------------------------------------------------------------------- Audit 0.8.165
async def test_kein_lebenszeichen_wenn_die_steuerung_haengt(hass: HomeAssistant, anlage) -> None:
    """Liefert die Auswertung nichts Frisches mehr, bekommen die Plugs kein Lebenszeichen – ihr Notprogramm übernimmt."""
    entry, np, plugs = anlage
    st = entry.runtime_data
    st.e["heizung"]["notprogramm"] = True
    await np.async_runde()
    p1 = plugs["plug1"]
    assert p1.aufrufe.count("hb") >= 1
    p1.aufrufe.clear()
    st.geschaltet["heizung"] = dt_util.now() - timedelta(minutes=6)
    await np.async_runde()
    assert p1.aufrufe == []
    assert {s.fehler for s in np.stand.values()} == {np_modul.HAENGT}
    st.auswerten()
    await np.async_runde()
    assert p1.aufrufe.count("hb") == 1 and {s.fehler for s in np.stand.values()} == {None}


async def test_fehler_in_einem_plug_haelt_die_anderen_nicht_auf(hass: HomeAssistant, anlage, monkeypatch) -> None:
    entry, np, plugs = anlage
    entry.runtime_data.e["heizung"]["notprogramm"] = True
    original = np._async_plug

    async def plug(g, p, stand):
        if g.schalter == "switch.hk1":
            raise RuntimeError("kaputt")
        await original(g, p, stand)

    monkeypatch.setattr(np, "_async_plug", plug)
    await np.async_runde()
    stand = {entry.runtime_data.geraete[g].schalter: s for g, s in np.stand.items()}
    assert stand["switch.hk1"].fehler == "kaputt" and stand["switch.hk2"].fehler is None
    assert plugs["plug2"].eigenes() is not None


async def test_zweiter_schalter_am_plug_ist_nicht_verwaist(hass: HomeAssistant, anlage) -> None:
    """Ein Heizkörper-Plug mit zweiter Schalter-Entität (BLE): weder Inventar-Abgleich noch Runde schalten sein Skript ab."""
    entry, np, plugs = anlage
    st = entry.runtime_data
    reg = er.async_get(hass)
    hk1 = reg.async_get("switch.hk1")
    reg.async_get_or_create("switch", "shelly", "aa:00:00:00:00:01-ble", suggested_object_id="hk1_ble",
                            device_id=hk1.device_id, config_entry=hass.config_entries.async_get_entry(hk1.config_entry_id))
    st.e["heizung"]["notprogramm"] = True
    await np.async_runde()
    st.lz["np_plugs"]["inventar:x"] = "switch.hk1_ble"   # so hat es der Abgleich bis 0.8.165 gemerkt
    await np.async_runde()
    assert plugs["plug1"].eigenes()[1]["running"]
    assert "inventar:x" not in st.lz["np_plugs"]
    assert not any("abgeschaltet" in str(e[-1]) for e in st.e["protokoll"])
