"""UI-Bericht M12: Assistent „+ Gerät hinzufügen“ (Typen, Vorschau, anlegen und umbenennen in einem Schritt, Rückgängig)
und „+ Container“ (Vorschau, Nummer belegt, Bereich und Inventar in einem Schritt) – docs/api-0.7.md §13."""

from __future__ import annotations

from homeassistant.core import HomeAssistant
from homeassistant.helpers import device_registry as dr, entity_registry as er
from pytest_homeassistant_custom_component.common import MockConfigEntry

from .conftest import C1, C2, SCHACHT
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
    inv = (await _senden(ws, 3, type="baustelle/inventar"))["result"]
    assert any(x["geraet_id"] == sub.subentry_id for x in next(c for c in inv["container"] if c["id"] == cid)["ausruestung"])

    _zustaende_umziehen(hass)
    z = await _senden(ws, 4, type="baustelle/geraet_hinzufuegen_rueckgaengig", rueck=r["rueck"])
    await hass.async_block_till_done()
    assert z["success"] and z["result"]["ok"], z
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
