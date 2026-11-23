"""UI-Bericht M12: Assistent „+ Gerät hinzufügen“ (Typen, Vorschau, anlegen und umbenennen in einem Schritt, Rückgängig)
und „+ Container“ (Vorschau, Nummer belegt, Bereich und Inventar in einem Schritt) – docs/api-0.7.md §13."""

from __future__ import annotations

import pytest

from homeassistant.const import EntityCategory
from homeassistant.core import HomeAssistant
from homeassistant.helpers import device_registry as dr, entity_registry as er
from pytest_homeassistant_custom_component.common import MockConfigEntry

from homeassistant.util import dt as dt_util

from custom_components.baustelle import assistent
from custom_components.baustelle.db import DATA_DB
from custom_components.baustelle.db import inventar as db_inventar

from .conftest import C1, C2, HK1, SCHACHT
from .test_umbenennen import baustelle_register  # noqa: F401  (Fixture)


async def _senden(ws, mid: int, **daten):
    await ws.send_json({"id": mid, **daten})
    return await ws.receive_json()


def _neues_geraet(hass: HomeAssistant, art: str = "plug") -> str:
    """Ein Gerät, das HA kennt und noch in keinem Container steckt (Shelly Plug oder Fühler)."""
    quelle = MockConfigEntry(domain="shelly", title="Neu", data={})
    quelle.add_to_hass(hass)
    geraete, ents = dr.async_get(hass), er.async_get(hass)
    if art == "plug":
        g = geraete.async_get_or_create(config_entry_id=quelle.entry_id, identifiers={("shelly", "plug9")},
                                        connections={(dr.CONNECTION_NETWORK_MAC, "aa:bb:cc:00:00:09")},
                                        name="Shelly Plug S Gen3", model="Shelly Plug S Gen3")
        ents.async_get_or_create("switch", "shelly", "plug9-s", suggested_object_id="shellyplugsg3_8c1a", config_entry=quelle, device_id=g.id)
        ents.async_get_or_create("sensor", "shelly", "plug9-p", suggested_object_id="shellyplugsg3_8c1a_power", config_entry=quelle,
                                 device_id=g.id, original_device_class="power")
        hass.states.async_set("switch.shellyplugsg3_8c1a", "off")
    else:
        g = geraete.async_get_or_create(config_entry_id=quelle.entry_id, identifiers={("shelly", "ht9")}, name="Shelly H&T Gen3",
                                        model="Shelly H&T Gen3")
        ents.async_get_or_create("sensor", "shelly", "ht9-t", suggested_object_id="ht9_temperatur", config_entry=quelle,
                                 device_id=g.id, original_device_class="temperature")
        hass.states.async_set("sensor.ht9_temperatur", "21.2")
    return g.id


def _zustaende_umziehen(hass: HomeAssistant) -> None:
    """Was die echte Plattform nach dem Umbenennen tut: Zustand unter der neuen Entity-ID, die alte ist frei."""
    for alt, neu in (("switch.hk1", "switch.001_01_c_plug_pol"), ("sensor.hk1_power", "sensor.001_01_c_plug_pol_leistung"),
                     ("sensor.temp_c1", "sensor.001_c_temp_pol_temperatur"), ("switch.shellyplugsg3_8c1a", "switch.001_02_c_plug_pol")):
        if (zustand := hass.states.get(alt)) is not None:
            hass.states.async_remove(alt)
            hass.states.async_set(neu, zustand.state)


async def _inventar(ws, entry, mid: int, bereich: str = C1) -> str:
    c = await _senden(ws, mid, type="baustelle/inventar_aendern", aktion="container_anlegen", entry_id=entry.entry_id, art="POL",
                      bereich_id=bereich)
    assert c["success"], c
    return str(c["result"]["id"])


async def test_typen_und_vorschau(hass: HomeAssistant, baustelle_register, hass_ws_client) -> None:
    entry = baustelle_register
    dev = _neues_geraet(hass)
    ws = await hass_ws_client(hass)
    t = await _senden(ws, 1, type="baustelle/geraet_typen", entry_id=entry.entry_id, bereich_id=C1, device_id=dev)
    assert t["success"], t
    assert t["result"]["vorschlag"] == "radiator" and t["result"]["geraet"]["typ"] == "PLUG"
    assert next(x for x in t["result"]["typen"] if x["k"] == "fuehler")["grund"] == "passt nicht zu Shelly Plug S Gen3"
    schacht = await _senden(ws, 2, type="baustelle/geraet_typen", entry_id=entry.entry_id, bereich_id=SCHACHT, device_id=dev)
    assert schacht["result"]["vorschlag"] == "pumpe"
    # Gutachten 0.8.194: Primär nur, solange der Container keinen Heizkörper hat (C1 hat Heizkörper 1)
    assert t["result"]["rolle"] == "zusatz" and schacht["result"]["rolle"] == "primaer"

    ohne = await _senden(ws, 3, type="baustelle/geraet_vorschau", entry_id=entry.entry_id, bereich_id=C1, device_id=dev, typ="konvektor")
    assert ohne["success"] and ohne["result"]["im_inventar"] is False and "Inventar" in ohne["result"]["hinweis"]
    await _inventar(ws, entry, 4)
    v = await _senden(ws, 5, type="baustelle/geraet_vorschau", entry_id=entry.entry_id, bereich_id=C1, device_id=dev, typ="konvektor",
                      name="Konvektor Polier")
    assert v["success"], v
    r = v["result"]
    assert r["im_inventar"] and r["container"] == "001_C_POL" and r["frei"] is True
    geraet = next(s for s in r["schritte"] if s["ziel"] == "geraet" and s["ref"] == dev)
    assert geraet["neu"] == "Konvektor Polier" and geraet["frei"] is True
    eid = next(s for s in r["schritte"] if s["ziel"] == "entitaet_id" and s["ref"] == "switch.shellyplugsg3_8c1a")
    assert eid["neu"] == "switch.001_02_c_plug_pol"   # Entity-ID folgt dem Schema
    # Entscheidung A: nur die Zeilen des neuen Geräts – Heizkörper 1 und der Fühler des Containers bleiben
    assert {s["gruppe"] for s in r["schritte"]} == {"001-02_C_PLUG_POL"}
    assert not any(s["ref"] in ("switch.hk1", "sensor.temp_c1") for s in r["schritte"])
    falsch = await _senden(ws, 6, type="baustelle/geraet_vorschau", entry_id=entry.entry_id, bereich_id=C1, device_id=dev, typ="fuehler")
    assert not falsch["success"] and "passt nicht" in falsch["error"]["message"]
    assert not entry.subentries.keys() - {s for s in entry.subentries}   # nichts geschrieben
    assert not any(s.data.get("schalter") == "switch.shellyplugsg3_8c1a" for s in entry.subentries.values())


async def test_hinzufuegen_umbenennen_und_rueckgaengig(hass: HomeAssistant, baustelle_register, hass_ws_client) -> None:
    entry = baustelle_register
    dev = _neues_geraet(hass)
    ws = await hass_ws_client(hass)
    cid = await _inventar(ws, entry, 1)
    a = await _senden(ws, 2, type="baustelle/geraet_hinzufuegen", entry_id=entry.entry_id, bereich_id=C1, device_id=dev,
                      typ="konvektor", nenn_kw=2.0, rolle="primaer")
    await hass.async_block_till_done()
    assert a["success"], a
    r = a["result"]
    assert r["umbenannt"]["status"] == "ausgefuehrt" and r["umbenannt"]["anzahl"] > 0 and r["rueck"]
    sub = next(s for s in entry.subentries.values() if s.data.get("schalter") == "switch.001_02_c_plug_pol")
    assert sub.data["bereich"] == C1 and sub.data["rolle"] == "heizkoerper" and sub.data["typ"] == "konvektor"
    st = entry.runtime_data
    assert st.e["geraete"][sub.subentry_id]["nenn_kw"] == 2.0 and st.e["bereiche"][C1]["primaer"] == sub.subentry_id
    assert dr.async_get(hass).async_get(dev).name_by_user == "001-02_C_PLUG_POL"
    # Entscheidung A: nur das neue Gerät – Heizkörper 1 und der Fühler behalten ihre Namen
    assert er.async_get(hass).async_get("switch.hk1") is not None and er.async_get(hass).async_get("sensor.temp_c1") is not None
    assert entry.subentries[HK1].title == "Heizkörper 1"
    assert st.e["geraete"][sub.subentry_id].get("zusatz") is False or "zusatz" not in st.e["geraete"][sub.subentry_id]
    inv = (await _senden(ws, 3, type="baustelle/inventar"))["result"]
    assert any(x["geraet_id"] == sub.subentry_id for x in next(c for c in inv["container"] if c["id"] == cid)["ausruestung"])

    _zustaende_umziehen(hass)
    z = await _senden(ws, 4, type="baustelle/geraet_hinzufuegen_rueckgaengig", rueck=r["rueck"])
    await hass.async_block_till_done()
    assert z["success"] and z["result"]["ok"], z
    assert z["result"]["getauscht"]["switch.001_02_c_plug_pol"] == "switch.shellyplugsg3_8c1a"   # für offene Entwürfe
    assert not any(s.data.get("schalter") in ("switch.001_02_c_plug_pol", "switch.shellyplugsg3_8c1a") for s in entry.subentries.values())
    assert er.async_get(hass).async_get("switch.shellyplugsg3_8c1a") is not None   # Entity-ID wieder wie vorher
    assert dr.async_get(hass).async_get(dev).name_by_user is None
    assert entry.runtime_data.e["bereiche"][C1].get("primaer") is None
    inv = (await _senden(ws, 5, type="baustelle/inventar"))["result"]
    assert not any(x["typ"] == "PLUG" and x["gg"] == 2 for x in next(c for c in inv["container"] if c["id"] == cid)["ausruestung"])
    nochmal = await _senden(ws, 6, type="baustelle/geraet_hinzufuegen_rueckgaengig", rueck=r["rueck"])
    assert not nochmal["success"] and nochmal["error"]["code"] == "not_found"


async def test_hinzufuegen_freier_name_fuehler_ohne_inventar(hass: HomeAssistant, baustelle_register, hass_ws_client) -> None:
    entry = baustelle_register
    plug, ht = _neues_geraet(hass), _neues_geraet(hass, "fuehler")
    ws = await hass_ws_client(hass)
    await _inventar(ws, entry, 1)
    a = await _senden(ws, 2, type="baustelle/geraet_hinzufuegen", entry_id=entry.entry_id, bereich_id=C1, device_id=plug,
                      typ="radiator", name="Radiator Polier")
    await hass.async_block_till_done()
    assert a["success"] and a["result"]["frei"] == "Radiator Polier", a
    assert dr.async_get(hass).async_get(plug).name_by_user == "Radiator Polier"   # Gerätename frei
    assert er.async_get(hass).async_get("switch.001_02_c_plug_pol") is not None   # Entity-ID nach Schema
    # Container 2 steht nicht im Inventar: eingehängt wird trotzdem, die Namen bleiben
    f = await _senden(ws, 3, type="baustelle/geraet_hinzufuegen", entry_id=entry.entry_id, bereich_id=C2, device_id=ht, typ="fuehler")
    await hass.async_block_till_done()
    assert f["success"] and f["result"]["umbenannt"]["status"] == "ohne_inventar", f
    assert entry.subentries[C2].data["fuehler"] == "sensor.ht9_temperatur"
    z = await _senden(ws, 4, type="baustelle/geraet_hinzufuegen_rueckgaengig", rueck=f["result"]["rueck"])
    await hass.async_block_till_done()
    assert z["success"] and "fuehler" not in entry.subentries[C2].data


async def test_hinzufuegen_nur_admins_und_falscher_typ(hass: HomeAssistant, baustelle_register, hass_ws_client, hass_read_only_access_token) -> None:
    entry = baustelle_register
    dev = _neues_geraet(hass)
    ws = await hass_ws_client(hass, hass_read_only_access_token)
    nein = await _senden(ws, 1, type="baustelle/geraet_hinzufuegen", entry_id=entry.entry_id, bereich_id=C1, device_id=dev, typ="konvektor")
    assert not nein["success"] and nein["error"]["code"] == "unauthorized"
    lesen = await _senden(ws, 2, type="baustelle/geraet_typen", entry_id=entry.entry_id, bereich_id=C1, device_id=dev)
    assert lesen["success"]
    admin = await hass_ws_client(hass)
    schacht = await _senden(admin, 3, type="baustelle/geraet_hinzufuegen", entry_id=entry.entry_id, bereich_id=SCHACHT, device_id=dev,
                            typ="konvektor")
    assert not schacht["success"] and schacht["error"]["message"] == "nicht im Pumpenschacht"
    assert not any(s.data.get("schalter") == "switch.shellyplugsg3_8c1a" for s in entry.subentries.values())


async def test_container_neu_eigen_fremd_schacht(hass: HomeAssistant, baustelle_register, hass_ws_client) -> None:
    entry = baustelle_register
    ws = await hass_ws_client(hass)
    v = await _senden(ws, 1, type="baustelle/container_vorschau", entry_id=entry.entry_id, art="MAN")
    assert v["success"] and v["result"]["inventar"] == "001_C_MAN" and v["result"]["geraete"] == "001-01_C_PLUG_MAN"
    n = await _senden(ws, 2, type="baustelle/container_neu", entry_id=entry.entry_id, art="MAN", name="Mannschaft 2")
    await hass.async_block_till_done()
    assert n["success"] and n["result"]["inventar"] == "001_C_MAN", n
    bid = n["result"]["bereich_id"]
    assert entry.subentries[bid].title == "Mannschaft 2" and bid in entry.runtime_data.bereiche
    belegt = await _senden(ws, 3, type="baustelle/container_vorschau", entry_id=entry.entry_id, art="MAN", nr=1)
    assert belegt["result"]["belegt"] and "vergeben" in belegt["result"]["grund"]
    doppelt = await _senden(ws, 4, type="baustelle/container_neu", entry_id=entry.entry_id, art="LAG", nr=1, name="Lager")
    assert not doppelt["success"] and "vergeben" in doppelt["error"]["message"]
    gleich = await _senden(ws, 5, type="baustelle/container_neu", entry_id=entry.entry_id, art="LAG", name="Mannschaft 2")
    assert not gleich["success"] and "Namen" in gleich["error"]["message"]
    struktur = (await _senden(ws, 6, type="baustelle/struktur"))["result"]
    b = next(x for x in struktur[0]["bereiche"] if x["id"] == bid)
    assert b["namen"]["container"] == "001_C_MAN"   # verknüpft: kein „Nicht im Inventar“

    # fremd: Firma ohne Kürzel bekommt es mit; Verbrauch gehört der Firma
    f = await _senden(ws, 7, type="baustelle/liste", entry_id=entry.entry_id, liste="firmen", aktion="speichern", eintrag={"name": "Strabag AG"})
    assert f["success"], f
    fid = f["result"]["id"]
    await hass.async_block_till_done()
    ohne = await _senden(ws, 8, type="baustelle/container_vorschau", entry_id=entry.entry_id, art="MAN", eigen=False, firma_id=fid)
    assert ohne["result"].get("fehler"), ohne
    fv = await _senden(ws, 9, type="baustelle/container_vorschau", entry_id=entry.entry_id, art="MAN", eigen=False, firma_id=fid, kuerzel="stra")
    assert fv["result"]["inventar"] == "STRA-01_C_MAN"
    fn = await _senden(ws, 10, type="baustelle/container_neu", entry_id=entry.entry_id, art="MAN", eigen=False, firma_id=fid,
                       kuerzel="stra", name="Strabag Mannschaft")
    await hass.async_block_till_done()
    assert fn["success"] and fn["result"]["inventar"] == "STRA-01_C_MAN", fn
    assert {"bereich": fn["result"]["bereich_id"], "firma": fid} .items() <= next(
        z for z in entry.runtime_data.e["zuordnung"] if z["bereich"] == fn["result"]["bereich_id"]).items()

    s = await _senden(ws, 11, type="baustelle/container_neu", entry_id=entry.entry_id, schacht=True, name="Schacht 2")
    await hass.async_block_till_done()
    assert s["success"] and s["result"]["inventar"] is None and s["result"]["container_id"] is None
    assert entry.subentries[s["result"]["bereich_id"]].data["art"] == "pumpenschacht"


def _zweikanal(hass: HomeAssistant) -> str:
    """Shelly 2PM mit zwei Kanälen und ein Schalter, der kein Shelly ist (Entscheidung B)."""
    quelle = MockConfigEntry(domain="shelly", title="2PM", data={})
    quelle.add_to_hass(hass)
    geraete, ents = dr.async_get(hass), er.async_get(hass)
    g = geraete.async_get_or_create(config_entry_id=quelle.entry_id, identifiers={("shelly", "2pm")},
                                    connections={(dr.CONNECTION_NETWORK_MAC, "aa:bb:cc:00:00:2a")}, name="Shelly 2PM", model="Shelly 2PM")
    for k in (1, 2):
        ents.async_get_or_create("switch", "shelly", f"2pm-{k}", suggested_object_id=f"shelly2pm_kanal_{k}", config_entry=quelle,
                                 device_id=g.id, original_name=f"Kanal {k}")
        hass.states.async_set(f"switch.shelly2pm_kanal_{k}", "off")
    ents.async_get_or_create("switch", "shelly", "2pm-led", suggested_object_id="shelly2pm_led", config_entry=quelle,
                             device_id=g.id, entity_category=EntityCategory.CONFIG)   # Einstellung, kein Kanal
    fremd = MockConfigEntry(domain="sonoff", title="Sonoff", data={})
    fremd.add_to_hass(hass)
    s = geraete.async_get_or_create(config_entry_id=fremd.entry_id, identifiers={("sonoff", "s1")}, name="Sonoff Steckdose", model="S26")
    ents.async_get_or_create("switch", "sonoff", "s1", suggested_object_id="sonoff_steckdose", config_entry=fremd, device_id=s.id)
    hass.states.async_set("switch.sonoff_steckdose", "off")
    return g.id


async def test_kandidaten_je_kanal_und_ohne_shelly(hass: HomeAssistant, baustelle_register, hass_ws_client) -> None:
    """Entscheidung B: jeder freie Schalter einzeln (je Kanal), Shellys oben; ein Gerät bleibt, wenn sein 1. Kanal belegt ist;
    ein Schalter ohne Shelly lässt sich hinzufügen (ohne Namen im Gerät selbst)."""
    entry = baustelle_register
    dev = _zweikanal(hass)
    ws = await hass_ws_client(hass)
    k = (await _senden(ws, 1, type="baustelle/geraet_kandidaten"))["result"]["geraete"]
    schalter = [x["schalter"] for x in k if x["typ"] == "PLUG"]
    assert {"switch.shelly2pm_kanal_1", "switch.shelly2pm_kanal_2", "switch.sonoff_steckdose"} <= set(schalter)
    assert "switch.hk1" not in schalter   # schon verwendet
    assert "switch.shelly2pm_led" not in schalter   # Einstellungs-Schalter ist kein Kanal
    assert schalter.index("switch.sonoff_steckdose") > schalter.index("switch.shelly2pm_kanal_2")   # Shellys oben
    assert next(x for x in k if x.get("schalter") == "switch.shelly2pm_kanal_2")["kanal"] == "Kanal 2"
    assert next(x for x in k if x.get("schalter") == "switch.sonoff_steckdose")["shelly"] is False

    a = await _senden(ws, 2, type="baustelle/geraet_hinzufuegen", entry_id=entry.entry_id, bereich_id=C2, device_id=dev,
                      schalter="switch.shelly2pm_kanal_1", typ="konvektor")
    await hass.async_block_till_done()
    assert a["success"], a
    k = (await _senden(ws, 3, type="baustelle/geraet_kandidaten"))["result"]["geraete"]
    frei = [x["schalter"] for x in k if x["device_id"] == dev]
    assert frei == ["switch.shelly2pm_kanal_2"]   # das Gerät verschwindet nicht, nur der belegte Kanal

    sonoff = next(x for x in k if x.get("schalter") == "switch.sonoff_steckdose")
    t = (await _senden(ws, 4, type="baustelle/geraet_typen", entry_id=entry.entry_id, bereich_id=C1, device_id=sonoff["device_id"],
                       schalter="switch.sonoff_steckdose"))["result"]
    assert t["geraet"]["typ"] == "PLUG" and t["geraet"]["shelly"] is False and t["vorschlag"] == "radiator"
    await _inventar(ws, entry, 5)
    v = (await _senden(ws, 6, type="baustelle/geraet_vorschau", entry_id=entry.entry_id, bereich_id=C1, device_id=sonoff["device_id"],
                       schalter="switch.sonoff_steckdose", typ="steckdose"))["result"]
    assert v["umbenennen"] and not any(x["ziel"] == "plug" for x in v["schritte"])   # kein Shelly: kein Name im Gerät
    h = await _senden(ws, 7, type="baustelle/geraet_hinzufuegen", entry_id=entry.entry_id, bereich_id=C1, device_id=sonoff["device_id"],
                      schalter="switch.sonoff_steckdose", typ="steckdose")
    await hass.async_block_till_done()
    assert h["success"] and h["result"]["umbenannt"]["status"] == "ausgefuehrt", h
    falsch = await _senden(ws, 8, type="baustelle/geraet_typen", entry_id=entry.entry_id, bereich_id=C1, device_id=dev,
                           schalter="switch.sonoff_steckdose")
    assert not falsch["success"] and falsch["error"]["code"] == "not_found"   # Schalter gehört nicht zu diesem Gerät


async def test_konflikt_vor_dem_schreiben(hass: HomeAssistant, baustelle_register, hass_ws_client) -> None:
    """Gutachten 0.8.192: ist die neue Entity-ID schon vergeben, wird nichts geschrieben – außer mit „Namen lassen“."""
    entry = baustelle_register
    dev = _neues_geraet(hass)
    er.async_get(hass).async_get_or_create("switch", "demo", "belegt", suggested_object_id="001_02_c_plug_pol")
    ws = await hass_ws_client(hass)
    await _inventar(ws, entry, 1)
    v = (await _senden(ws, 2, type="baustelle/geraet_vorschau", entry_id=entry.entry_id, bereich_id=C1, device_id=dev, typ="konvektor"))["result"]
    assert v["konflikte"] == {"switch.shellyplugsg3_8c1a": "switch.001_02_c_plug_pol"}
    a = await _senden(ws, 3, type="baustelle/geraet_hinzufuegen", entry_id=entry.entry_id, bereich_id=C1, device_id=dev, typ="konvektor")
    assert not a["success"] and "schon vergeben" in a["error"]["message"], a
    assert not any(s.data.get("schalter") == "switch.shellyplugsg3_8c1a" for s in entry.subentries.values())
    inv = (await _senden(ws, 4, type="baustelle/inventar"))["result"]
    assert not any(x["typ"] == "PLUG" and x["gg"] == 2 for c in inv["container"] for x in c["ausruestung"])
    n = await _senden(ws, 5, type="baustelle/geraet_hinzufuegen", entry_id=entry.entry_id, bereich_id=C1, device_id=dev, typ="konvektor",
                      umbenennen=False, name="Wird ignoriert")
    await hass.async_block_till_done()
    assert n["success"] and n["result"]["umbenannt"]["status"] == "namen_gelassen" and n["result"]["frei"] is None, n
    assert er.async_get(hass).async_get("switch.shellyplugsg3_8c1a") is not None   # Namen gelassen
    assert dr.async_get(hass).async_get(dev).name_by_user is None


async def test_datenbank_faellt_nach_dem_einhaengen(hass: HomeAssistant, baustelle_register, hass_ws_client, monkeypatch) -> None:
    """Gutachten 0.8.192: scheitert das Inventar nach dem Einhängen, lädt die Baustelle trotzdem neu und die Antwort sagt
    ehrlich „eingehängt, nicht ins Inventar“; Rückgängig nimmt es wieder heraus."""
    entry = baustelle_register
    dev = _neues_geraet(hass)
    ws = await hass_ws_client(hass)
    await _inventar(ws, entry, 1)

    def kaputt(*_a, **_k):
        raise RuntimeError("Datenbank weg")

    monkeypatch.setattr(db_inventar, "ausruestung_zuordnen", kaputt)
    a = await _senden(ws, 2, type="baustelle/geraet_hinzufuegen", entry_id=entry.entry_id, bereich_id=C1, device_id=dev, typ="konvektor")
    await hass.async_block_till_done()
    assert a["success"], a
    u = a["result"]["umbenannt"]
    assert u["status"] == "ohne_inventar" and "nicht ins Inventar" in u["fehler"] and "Datenbank weg" in u["fehler"]
    sub = next(s for s in entry.subentries.values() if s.data.get("schalter") == "switch.shellyplugsg3_8c1a")   # Namen blieben
    assert sub.subentry_id in entry.runtime_data.geraete   # neu geladen: die Steuerung kennt das Gerät
    monkeypatch.undo()
    z = await _senden(ws, 3, type="baustelle/geraet_hinzufuegen_rueckgaengig", rueck=a["result"]["rueck"])
    await hass.async_block_till_done()
    assert z["success"] and z["result"]["ok"], z
    assert sub.subentry_id not in entry.subentries


async def test_rueckgaengig_nur_unveraendertes_und_marke_bleibt(hass: HomeAssistant, baustelle_register, hass_ws_client,
                                                               monkeypatch) -> None:
    """Gutachten 0.8.192: Rückgängig setzt nur zurück, was seitdem niemand geändert hat; scheitert die Prüfung (Baustelle
    nicht geladen), bleibt die Marke für einen zweiten Versuch. Rolle „Zusatz“ wird gesetzt."""
    entry = baustelle_register
    dev = _neues_geraet(hass)
    ws = await hass_ws_client(hass)
    a = await _senden(ws, 1, type="baustelle/geraet_hinzufuegen", entry_id=entry.entry_id, bereich_id=C1, device_id=dev,
                      typ="radiator", nenn_kw=1.5, rolle="zusatz")
    await hass.async_block_till_done()
    assert a["success"], a
    st = entry.runtime_data
    gid = next(s.subentry_id for s in entry.subentries.values() if s.data.get("schalter") == "switch.shellyplugsg3_8c1a")
    assert st.e["geraete"][gid]["zusatz"] is True and st.e["geraete"][gid]["nenn_kw"] == 1.5
    s = await _senden(ws, 2, type="baustelle/setzen", entry_id=entry.entry_id, pfad=["bereiche", C1, "primaer"], wert=HK1)
    assert s["success"], s

    async def nicht_geladen(*_a, **_k):
        return None

    monkeypatch.setattr(assistent, "_geladen", nicht_geladen)
    nein = await _senden(ws, 3, type="baustelle/geraet_hinzufuegen_rueckgaengig", rueck=a["result"]["rueck"])
    assert not nein["success"] and nein["error"]["code"] == "not_found"
    monkeypatch.undo()
    z = await _senden(ws, 4, type="baustelle/geraet_hinzufuegen_rueckgaengig", rueck=a["result"]["rueck"])
    await hass.async_block_till_done()
    assert z["success"], z   # die Marke galt noch
    assert gid not in entry.subentries
    assert entry.runtime_data.e["bereiche"][C1]["primaer"] == HK1   # nicht vom Hinzufügen – bleibt


async def test_rueckgaengig_fuehler_seitdem_geaendert(hass: HomeAssistant, baustelle_register, hass_ws_client) -> None:
    entry = baustelle_register
    ht = _neues_geraet(hass, "fuehler")
    ws = await hass_ws_client(hass)
    f = await _senden(ws, 1, type="baustelle/geraet_hinzufuegen", entry_id=entry.entry_id, bereich_id=C2, device_id=ht, typ="fuehler")
    await hass.async_block_till_done()
    assert f["success"], f
    sub = entry.subentries[C2]
    hass.config_entries.async_update_subentry(entry, sub, data={**sub.data, "fuehler": "sensor.aussen"})
    await hass.async_block_till_done()
    z = await _senden(ws, 2, type="baustelle/geraet_hinzufuegen_rueckgaengig", rueck=f["result"]["rueck"])
    await hass.async_block_till_done()
    assert z["success"] and not z["result"]["ok"] and any("Fühler" in x for x in z["result"]["fehler"]), z
    assert entry.subentries[C2].data["fuehler"] == "sensor.aussen"


async def test_vorschau_ohne_inventar_zweiter_fuehler(hass: HomeAssistant, baustelle_register, hass_ws_client) -> None:
    """Gutachten 0.8.192: ohne Inventar sagt die Vorschau ehrlich, ob das Gerät am Container eingetragen wird."""
    entry = baustelle_register
    ht = _neues_geraet(hass, "fuehler")
    ws = await hass_ws_client(hass)
    v = (await _senden(ws, 1, type="baustelle/geraet_vorschau", entry_id=entry.entry_id, bereich_id=C1, device_id=ht, typ="fuehler"))["result"]
    assert v["im_inventar"] is False and v["eingetragen"] is False and "schon einen Fühler" in v["hinweis"]
    frei = (await _senden(ws, 2, type="baustelle/geraet_vorschau", entry_id=entry.entry_id, bereich_id=C2, device_id=ht, typ="fuehler"))["result"]
    assert frei["eingetragen"] is True


@pytest.mark.parametrize("typ", ["steckdose", "konvektor"])
async def test_im_schacht_nur_pumpen(hass: HomeAssistant, baustelle_register, hass_ws_client, typ) -> None:
    """Gutachten 0.8.192: dieselbe Regel wie logik.geraete – keine Steckdose im Pumpenschacht."""
    entry = baustelle_register
    dev = _neues_geraet(hass)
    ws = await hass_ws_client(hass)
    t = (await _senden(ws, 1, type="baustelle/geraet_typen", entry_id=entry.entry_id, bereich_id=SCHACHT, device_id=dev))["result"]
    assert [x["k"] for x in t["typen"] if x["passt"]] == ["pumpe"]
    a = await _senden(ws, 2, type="baustelle/geraet_hinzufuegen", entry_id=entry.entry_id, bereich_id=SCHACHT, device_id=dev, typ=typ)
    assert not a["success"] and a["error"]["message"] == "nicht im Pumpenschacht"


async def test_container_ohne_inventar(hass: HomeAssistant, baustelle_register, hass_ws_client, monkeypatch) -> None:
    """Gutachten 0.8.192: ohne Datenbank sagt die Vorschau es klar und bietet „ohne Inventar“ an; das legt nur den Bereich an."""
    entry = baustelle_register
    ws = await hass_ws_client(hass)

    async def ohne_db(_hass):
        return None, None

    monkeypatch.setattr(assistent, "_roh", ohne_db)
    v = (await _senden(ws, 1, type="baustelle/container_vorschau", entry_id=entry.entry_id, art="MAN"))["result"]
    assert v["fehler"] and v["ohne_inventar_moeglich"] is True
    o = (await _senden(ws, 2, type="baustelle/container_vorschau", entry_id=entry.entry_id, art="MAN", ohne_inventar=True))["result"]
    assert not o.get("fehler") and o["inventar"] is None and not o["belegt"]
    n = await _senden(ws, 3, type="baustelle/container_neu", entry_id=entry.entry_id, art="MAN", ohne_inventar=True, name="Lager 3")
    await hass.async_block_till_done()
    assert n["success"] and n["result"]["inventar"] is None and n["result"]["container_id"] is None and n["result"]["ok"], n
    assert entry.subentries[n["result"]["bereich_id"]].title == "Lager 3"


async def test_zweiter_kanal_im_inventar(hass: HomeAssistant, baustelle_register, hass_ws_client) -> None:
    """Der 2. Kanal eines Geräts, das schon im Inventar dieses Containers steht: eingehängt, Inventar und Namen bleiben."""
    entry = baustelle_register
    dev = _zweikanal(hass)
    ws = await hass_ws_client(hass)
    cid = await _inventar(ws, entry, 1)
    a = await _senden(ws, 2, type="baustelle/geraet_hinzufuegen", entry_id=entry.entry_id, bereich_id=C1, device_id=dev,
                      schalter="switch.shelly2pm_kanal_1", typ="konvektor")
    await hass.async_block_till_done()
    assert a["success"] and a["result"]["umbenannt"]["status"] == "ausgefuehrt", a
    k1 = next(s for s in entry.subentries.values() if s.data.get("schalter") == "switch.001_02_c_plug_pol")
    name = dr.async_get(hass).async_get(dev).name_by_user
    v = (await _senden(ws, 3, type="baustelle/geraet_vorschau", entry_id=entry.entry_id, bereich_id=C1, device_id=dev,
                       schalter="switch.shelly2pm_kanal_2", typ="konvektor"))["result"]
    assert v["im_inventar"] and not v["umbenennen"] and "weiterer Kanal" in v["hinweis"] and not v["schritte"]
    assert v["moeglich"] and not v["frei_moeglich"]
    b = await _senden(ws, 4, type="baustelle/geraet_hinzufuegen", entry_id=entry.entry_id, bereich_id=C1, device_id=dev,
                      schalter="switch.shelly2pm_kanal_2", typ="konvektor", name="Darf nicht greifen")
    await hass.async_block_till_done()
    assert b["success"] and b["result"]["umbenannt"]["status"] == "eingehaengt" and b["result"]["frei"] is None, b
    assert any(s.data.get("schalter") == "switch.shelly2pm_kanal_2" and s.data["bereich"] == C1 for s in entry.subentries.values())
    assert dr.async_get(hass).async_get(dev).name_by_user == name   # Gerätename des 1. Kanals bleibt
    inv = (await _senden(ws, 5, type="baustelle/inventar"))["result"]
    plug = [x for x in next(c for c in inv["container"] if c["id"] == cid)["ausruestung"] if x["typ"] == "PLUG" and x["gg"] == 2]
    assert len(plug) == 1 and plug[0]["geraet_id"] == k1.subentry_id   # Inventar zeigt weiter auf den 1. Kanal


async def test_offene_umbenennung_blockiert_nur_das_umbenennen(hass: HomeAssistant, baustelle_register, hass_ws_client) -> None:
    """Review 0.8.193: ist die jüngste Umbenennung des Containers `teilweise`, benennt der Assistent nicht um (sonst ließe sie
    sich nicht mehr nachholen) – eingehängt wird trotzdem, und die Antwort sagt es."""
    entry = baustelle_register
    dev = _neues_geraet(hass)
    ws = await hass_ws_client(hass)
    cid = await _inventar(ws, entry, 1)
    db = hass.data[DATA_DB]
    await db.async_ausfuehren(lambda v: db_inventar.umbenennung_merken(v, container_id=cid, benutzer="t", jetzt=dt_util.utcnow(),
                                                                      schritte=[{"ziel": "plug", "ref": "x", "ergebnis": "fehler"}],
                                                                      status="teilweise"))
    a = await _senden(ws, 2, type="baustelle/geraet_hinzufuegen", entry_id=entry.entry_id, bereich_id=C1, device_id=dev, typ="konvektor",
                      name="Mein Name")
    await hass.async_block_till_done()
    assert a["success"] and "Nachholen" in a["result"]["umbenannt"]["fehler"] and a["result"]["frei"] is None, a
    letzte = await db.async_ausfuehren(lambda v: db_inventar.umbenennung_letzte(v, cid))
    assert letzte["status"] == "teilweise"   # die offene bleibt die jüngste
    assert dr.async_get(hass).async_get(dev).name_by_user is None


async def test_rueckgaengig_doppelt_laeuft_einmal(hass: HomeAssistant, baustelle_register, hass_ws_client) -> None:
    entry = baustelle_register
    dev = _neues_geraet(hass)
    ws, ws2 = await hass_ws_client(hass), await hass_ws_client(hass)
    a = await _senden(ws, 1, type="baustelle/geraet_hinzufuegen", entry_id=entry.entry_id, bereich_id=C2, device_id=dev, typ="konvektor")
    await hass.async_block_till_done()
    await ws.send_json({"id": 2, "type": "baustelle/geraet_hinzufuegen_rueckgaengig", "rueck": a["result"]["rueck"]})
    await ws2.send_json({"id": 2, "type": "baustelle/geraet_hinzufuegen_rueckgaengig", "rueck": a["result"]["rueck"]})
    erg = [await ws.receive_json(), await ws2.receive_json()]
    await hass.async_block_till_done()
    assert sorted(x["success"] for x in erg) == [False, True], erg


async def test_rueckgaengig_ohne_datenbank_nimmt_nichts_zurueck(hass: HomeAssistant, baustelle_register, hass_ws_client,
                                                                 monkeypatch) -> None:
    """Gutachten 0.8.194: ist die Datenbank beim Rückgängig nicht bereit, wird nichts zurückgenommen (sonst blieben Namen
    und Inventar, und „zurückgenommen“ stimmte nicht) – die Marke bleibt, später klappt es."""
    entry = baustelle_register
    dev = _neues_geraet(hass)
    ws = await hass_ws_client(hass)
    await _inventar(ws, entry, 1)
    a = await _senden(ws, 2, type="baustelle/geraet_hinzufuegen", entry_id=entry.entry_id, bereich_id=C1, device_id=dev, typ="konvektor")
    await hass.async_block_till_done()
    assert a["success"] and a["result"]["umbenannt"]["status"] == "ausgefuehrt", a
    db = hass.data[DATA_DB]
    monkeypatch.setattr(type(db), "bereit", property(lambda _s: False))
    nein = await _senden(ws, 3, type="baustelle/geraet_hinzufuegen_rueckgaengig", rueck=a["result"]["rueck"])
    assert not nein["success"] and nein["error"]["code"] == "db_fehlt", nein
    assert dr.async_get(hass).async_get(dev).name_by_user == "001-02_C_PLUG_POL"   # nichts angefasst
    monkeypatch.undo()
    _zustaende_umziehen(hass)
    z = await _senden(ws, 4, type="baustelle/geraet_hinzufuegen_rueckgaengig", rueck=a["result"]["rueck"])
    await hass.async_block_till_done()
    assert z["success"] and z["result"]["ok"], z
    assert dr.async_get(hass).async_get(dev).name_by_user is None


async def test_nachholen_nach_assistent_nur_das_neue_geraet(hass: HomeAssistant, baustelle_register, hass_ws_client) -> None:
    """Gutachten 0.8.194: bleibt die Umbenennung des Assistenten `teilweise`, holt „Nachholen“ nur ihre Schritte nach –
    Heizkörper 1 und der Fühler des Containers behalten ihre Namen."""
    entry = baustelle_register
    dev = _neues_geraet(hass)
    ws = await hass_ws_client(hass)
    cid = await _inventar(ws, entry, 1)
    a = await _senden(ws, 2, type="baustelle/geraet_hinzufuegen", entry_id=entry.entry_id, bereich_id=C1, device_id=dev, typ="konvektor")
    await hass.async_block_till_done()
    assert a["success"], a
    db = hass.data[DATA_DB]
    letzte = await db.async_ausfuehren(lambda v: db_inventar.umbenennung_letzte(v, cid))
    assert all(x.get("auswahl") for x in letzte["schritte"])
    # Gerätename „ging nicht“: zurück auf vorher und als Fehler eintragen
    dr.async_get(hass).async_update_device(dev, name_by_user=None)
    schritte = [{**x, "ergebnis": "fehler", "fehler": "weg"} if x["ziel"] == "geraet" else x for x in letzte["schritte"]]
    await db.async_ausfuehren(lambda v: db_inventar.umbenennung_aendern(v, letzte["id"], schritte, "teilweise"))
    n = await _senden(ws, 3, type="baustelle/inventar_umbenennen", container_id=cid)
    await hass.async_block_till_done()
    assert n["success"] and n["result"]["nachgeholt"], n
    assert dr.async_get(hass).async_get(dev).name_by_user == "001-02_C_PLUG_POL"
    assert er.async_get(hass).async_get("switch.hk1") is not None and er.async_get(hass).async_get("sensor.temp_c1") is not None
    assert entry.subentries[HK1].title == "Heizkörper 1"


async def test_vorschau_zweiter_kanal_mit_seinem_leistungssensor(hass: HomeAssistant, baustelle_register, hass_ws_client) -> None:
    """Gutachten 0.8.194: beim 2. Kanal eines Shelly 2PM zeigt die Vorschau dessen Leistungssensor, nicht den von Kanal 1
    (dieselbe Wahl wie die Steuerung, gleicher Namensanfang)."""
    entry = baustelle_register
    dev = _zweikanal(hass)
    ents = er.async_get(hass)
    quelle = next(e for e in hass.config_entries.async_entries("shelly") if e.title == "2PM")
    for k in (1, 2):
        ents.async_get_or_create("sensor", "shelly", f"2pm-{k}-p", suggested_object_id=f"shelly2pm_kanal_{k}_power",
                                 config_entry=quelle, device_id=dev, original_device_class="power")
    ws = await hass_ws_client(hass)
    await _inventar(ws, entry, 1)
    v = await _senden(ws, 2, type="baustelle/geraet_vorschau", entry_id=entry.entry_id, bereich_id=C1, device_id=dev,
                      schalter="switch.shelly2pm_kanal_2", typ="konvektor")
    assert v["success"], v
    refs = {s["ref"] for s in v["result"]["schritte"]}
    assert "sensor.shelly2pm_kanal_2_power" in refs and "sensor.shelly2pm_kanal_1_power" not in refs
