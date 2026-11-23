"""BSM-031.07/.08: Ausrüstung aus HA zuordnen (mit Verdrahtung), Bestand beim Anlegen, feste Nummer, Status, Verweise."""

from __future__ import annotations

from homeassistant.core import HomeAssistant
from homeassistant.helpers import device_registry as dr, entity_registry as er
from homeassistant.setup import async_setup_component
from pytest_homeassistant_custom_component.common import MockConfigEntry

from .conftest import C1, C2, HK1
from .test_umbenennen import baustelle_register  # noqa: F401  (Fixture)


async def _senden(ws, mid: int, **daten):
    """Wie in test_umbenennen, aber ohne Namenskonflikt mit dem Feld `nr` (feste Containernummer)."""
    await ws.send_json({"id": mid, **daten})
    return await ws.receive_json()


def _neuer_shelly(hass: HomeAssistant) -> str:
    """Ein Shelly, den HA kennt, der aber noch in keiner Baustelle steckt; liefert die Geräte-ID."""
    quelle = MockConfigEntry(domain="shelly", title="Neu", data={})
    quelle.add_to_hass(hass)
    geraet = dr.async_get(hass).async_get_or_create(config_entry_id=quelle.entry_id, identifiers={("shelly", "plug9")},
                                                    connections={(dr.CONNECTION_NETWORK_MAC, "aa:bb:cc:00:00:09")},
                                                    name="Plug Lager 09", model="Shelly Plug S Gen3")
    er.async_get(hass).async_get_or_create("switch", "shelly", "plug9-s", suggested_object_id="plug_lager_09",
                                           config_entry=quelle, device_id=geraet.id)
    hass.states.async_set("switch.plug_lager_09", "off")
    return geraet.id


async def _anlegen(ws, mid: int, entry, **mehr):
    a = await _senden(ws, mid, type="baustelle/inventar_aendern", aktion="container_anlegen", entry_id=entry.entry_id, **mehr)
    assert a["success"], a
    return a["result"]


async def test_bestand_beim_anlegen_und_feste_nummer(hass: HomeAssistant, baustelle_register, hass_ws_client) -> None:
    entry = baustelle_register
    ws = await hass_ws_client(hass)
    c = await _anlegen(ws, 1, entry, art="POL", bereich_id=C1, nr=7)
    assert c["nr"] == 7
    assert sorted(a["typ"] for a in c["ausruestung"]) == ["PLUG", "TEMP"]   # Shelly und Fühler des Bereichs kommen mit
    plug = next(a for a in c["ausruestung"] if a["typ"] == "PLUG")
    assert plug["gg"] == 1
    doppelt = await _senden(ws, 2, type="baustelle/inventar_aendern", aktion="container_anlegen", entry_id=entry.entry_id,
                            art="MAN", nr=7)
    assert not doppelt["success"] and "vergeben" in doppelt["error"]["message"]
    weiter = await _anlegen(ws, 3, entry, art="MAN")
    assert weiter["nr"] == 8   # nächste nach der größten, nie eine Lücke
    alles = (await _senden(ws, 4, type="baustelle/inventar"))["result"]
    pol = next(x for x in alles["container"] if x["nr"] == 7)
    assert [a["name"] for a in pol["ausruestung"]][:1] == ["007-01_C_PLUG_POL"]
    assert next(a for a in pol["ausruestung"] if a["typ"] == "PLUG")["geraet_id"] == HK1


async def test_zuordnen_neuer_shelly(hass: HomeAssistant, baustelle_register, hass_ws_client) -> None:
    entry = baustelle_register
    device_id = _neuer_shelly(hass)
    ws = await hass_ws_client(hass)
    c = await _anlegen(ws, 1, entry, art="MAN", bereich_id=C2)
    kand = (await _senden(ws, 2, type="baustelle/inventar_kandidaten"))["result"]["geraete"]
    neu = next(k for k in kand if k["device_id"] == device_id)
    assert neu["typ"] == "PLUG" and neu["verwendet"] is None and neu["entity_id"] == "switch.plug_lager_09"
    hk1 = next(k for k in kand if k["entity_id"] == "switch.hk1")
    assert hk1["verwendet"] == "B1 › Container 1"   # noch nicht im Inventar, aber in der Baustelle verwendet

    z = await _senden(ws, 3, type="baustelle/inventar_aendern", aktion="ausruestung_zuordnen", container_id=c["id"],
                      device_id=device_id, haengt="radiator")
    await hass.async_block_till_done()
    assert z["success"], z
    assert z["result"]["typ"] == "PLUG" and z["result"]["verdrahtet"] == "Shelly im Bereich angelegt"
    sub = next(s for s in entry.subentries.values() if s.data.get("schalter") == "switch.plug_lager_09")
    assert sub.data["bereich"] == C2 and sub.data["rolle"] == "heizkoerper" and sub.data["typ"] == "oelradiator"
    assert "switch.plug_lager_09" in {g.schalter for g in entry.runtime_data.geraete.values()}   # neu geladen

    nochmal = await _senden(ws, 4, type="baustelle/inventar_aendern", aktion="ausruestung_zuordnen", container_id=c["id"],
                            device_id=device_id)
    assert nochmal["success"] and nochmal["result"]["neu"] is False   # steckt schon drin: nichts doppelt
    anderer = await _anlegen(ws, 5, entry, art="LAG")
    falsch = await _senden(ws, 6, type="baustelle/inventar_aendern", aktion="ausruestung_zuordnen", container_id=anderer["id"],
                           device_id=device_id)
    assert not falsch["success"] and "anderen Container" in falsch["error"]["message"]

    weg = await _senden(ws, 7, type="baustelle/inventar_aendern", aktion="ausruestung_entfernen", ausruestung_id=z["result"]["id"])
    assert weg["success"]
    frei = (await _senden(ws, 8, type="baustelle/inventar"))["result"]["ausruestung_frei"]
    assert z["result"]["id"] in {a["id"] for a in frei}


async def test_status_defekt_schaltet_aus(hass: HomeAssistant, baustelle_register, hass_ws_client) -> None:
    """BSM-031.08: defekt/verliehen = die Automatik lässt das Gerät aus (wie „inaktiv“), aktiv = wieder dabei."""
    entry = baustelle_register
    ws = await hass_ws_client(hass)
    c = await _anlegen(ws, 1, entry, art="POL", bereich_id=C1)
    plug = next(a for a in c["ausruestung"] if a["typ"] == "PLUG")
    st = entry.runtime_data
    g = st.geraete[HK1]
    assert st.geraet_aktiv(g)
    defekt = await _senden(ws, 2, type="baustelle/inventar_aendern", aktion="ausruestung_status", ausruestung_id=plug["id"],
                           status="defekt")
    assert defekt["success"] and not st.geraet_aktiv(g)
    wieder = await _senden(ws, 3, type="baustelle/inventar_aendern", aktion="ausruestung_status", ausruestung_id=plug["id"],
                           status="aktiv")
    assert wieder["success"] and st.geraet_aktiv(g)


async def test_status_ein_feld_in_beide_richtungen(hass: HomeAssistant, baustelle_register, hass_ws_client) -> None:
    """BSM-034.02: ein Status je Gerät – Seite (baustelle/geraet) und Inventar ändern dasselbe Feld."""
    entry = baustelle_register
    ws = await hass_ws_client(hass)
    c = await _anlegen(ws, 1, entry, art="POL", bereich_id=C1)
    plug = next(a for a in c["ausruestung"] if a["typ"] == "PLUG")
    st = entry.runtime_data
    g = st.geraete[HK1]

    nummer = iter(range(2, 100))

    async def inventar_status() -> str:
        alles = (await _senden(ws, next(nummer), type="baustelle/inventar"))["result"]
        return next(a["status"] for x in alles["container"] for a in x["ausruestung"] if a["id"] == plug["id"])

    r = await _senden(ws, next(nummer), type="baustelle/geraet", entry_id=entry.entry_id, geraet=HK1, aktion="status", status="verliehen")
    await hass.async_block_till_done(wait_background_tasks=True)
    assert r["success"] and r["result"]["status"] == "verliehen" and not st.geraet_aktiv(g)
    assert await inventar_status() == "verliehen"
    assert st.e["protokoll"][0][3].endswith("verliehen – die Automatik lässt es aus")
    r = await _senden(ws, next(nummer), type="baustelle/inventar_aendern", aktion="ausruestung_status", ausruestung_id=plug["id"], status="inaktiv")
    assert r["success"] and st.geraet_status(g) == "inaktiv" and "aktiv" not in st.e["geraete"][HK1]
    r = await _senden(ws, next(nummer), type="baustelle/aktion", entry_id=entry.entry_id, aktion="aktiv", geraet=HK1, an=True)   # Container-Chip
    await hass.async_block_till_done(wait_background_tasks=True)
    assert r["success"] and st.geraet_aktiv(g) and await inventar_status() == "aktiv"
    falsch = await _senden(ws, next(nummer), type="baustelle/geraet", entry_id=entry.entry_id, geraet=HK1, aktion="status", status="weg")
    keins = await _senden(ws, next(nummer), type="baustelle/geraet", entry_id=entry.entry_id, geraet="gibts_nicht", aktion="status", status="aktiv")
    assert not falsch["success"] and not keins["success"]


async def test_vorschau_nennt_verweise(hass: HomeAssistant, baustelle_register, hass_ws_client) -> None:
    """§6.2: eigene Automationen mit einer alten Entity-ID stehen in der Vorschau."""
    entry = baustelle_register
    assert await async_setup_component(hass, "automation", {"automation": [{
        "alias": "Polier morgens", "triggers": [{"trigger": "state", "entity_id": "switch.hk1"}], "actions": []}]})
    await hass.async_block_till_done()
    ws = await hass_ws_client(hass)
    c = await _anlegen(ws, 1, entry, art="POL", bereich_id=C1)
    v = (await _senden(ws, 2, type="baustelle/inventar_vorschau", container_id=c["id"]))["result"]
    assert {"art": "Automation", "name": "Polier morgens", "alt": "switch.hk1", "neu": "switch.001_01_c_plug_pol"} in v["verweise"]


async def test_fensterkontakt_zuordnen_traegt_ins_aussehen_ein(hass: HomeAssistant, baustelle_register, hass_ws_client) -> None:
    """BSM-034.03: Ein Fensterkontakt (FEN) aus dem Inventar landet als Fenster im Aussehen – die Sensorliste, das
    Pausieren und der Bestand kennen ihn dann."""
    entry = baustelle_register
    quelle = MockConfigEntry(domain="bthome", data={})
    quelle.add_to_hass(hass)
    geraet = dr.async_get(hass).async_get_or_create(config_entry_id=quelle.entry_id, connections={(dr.CONNECTION_BLUETOOTH, "AA:BB:CC:00:00:F1")},
                                                    name="BLU Fenster", model="Shelly BLU Door/Window")
    er.async_get(hass).async_get_or_create("binary_sensor", "bthome", "f1-window", suggested_object_id="fenster_c1",
                                           config_entry=quelle, device_id=geraet.id, original_device_class="window")
    ws = await hass_ws_client(hass)
    c = await _anlegen(ws, 1, entry, art="POL", bereich_id=C1)
    z = await _senden(ws, 2, type="baustelle/inventar_aendern", aktion="ausruestung_zuordnen", container_id=c["id"], device_id=geraet.id)
    await hass.async_block_till_done()
    assert z["success"], z
    assert z["result"]["typ"] == "FEN" and z["result"]["verdrahtet"] == "als Fenster 1 des Containers eingetragen"
    st = entry.runtime_data
    assert st.einstellungen.bereich(C1)["symbol"]["fenster"][0]["sensor"] == "binary_sensor.fenster_c1"
    assert ("fenster", "binary_sensor.fenster_c1") in [(x.art, x.entity_id) for x in st.sensoren(C1)]


async def test_abgleich_traegt_nach_und_zeigt_fremdes(hass: HomeAssistant, baustelle_register, hass_ws_client) -> None:
    """BSM-034.04 (Herbert 10.10.2026): Was HA dem Bereich zuordnet (auch über den HA-Dialog), trägt der Abgleich ins
    Inventar nach; was nur im Inventar steckt, zeigt die Seite (`nicht_in_ha`), ohne es zu entfernen; Plugs aus dem
    Inventar, die kein Heizkörper mehr sind, kommen auf die Abschalt-Liste des Notprogramms."""
    from types import MappingProxyType   # noqa: PLC0415

    from homeassistant.config_entries import ConfigSubentry   # noqa: PLC0415

    entry = baustelle_register
    _neuer_shelly(hass)
    ws = await hass_ws_client(hass)
    c = await _anlegen(ws, 1, entry, art="POL", bereich_id=C1)
    plug = next(a for a in c["ausruestung"] if a["typ"] == "PLUG")
    # wie über Geräte & Dienste › Baustelle › Shelly hinzufügen: HA lädt neu, der Abgleich läuft beim Start
    hass.config_entries.async_add_subentry(entry, ConfigSubentry(
        data=MappingProxyType({"bereich": C1, "schalter": "switch.plug_lager_09", "name": "Lager 09", "rolle": "heizkoerper",
                               "typ": "konvektor"}), subentry_type="geraet", title="Lager 09", unique_id=None))
    await hass.async_block_till_done(wait_background_tasks=True)
    st = entry.runtime_data
    alles = (await _senden(ws, 2, type="baustelle/inventar"))["result"]
    pol = next(x for x in alles["container"] if x["id"] == c["id"])
    assert len([a for a in pol["ausruestung"] if a["typ"] == "PLUG"]) == 2 and pol["nicht_in_ha"] == 0
    assert any(e[3] == "Inventar nachgetragen: Lager 09 (Container 1)" for e in st.e["protokoll"])

    # HK1 im HA-Dialog gelöscht: der Plug bleibt im Container, die Seite zeigt „nicht in HA“
    hass.config_entries.async_remove_subentry(entry, HK1)
    await hass.async_block_till_done(wait_background_tasks=True)
    alles = (await _senden(ws, 3, type="baustelle/inventar"))["result"]
    pol = next(x for x in alles["container"] if x["id"] == c["id"])
    assert pol["nicht_in_ha"] == 1 and next(a for a in pol["ausruestung"] if a["id"] == plug["id"])["nicht_in_ha"] is True
    assert entry.runtime_data.lz["np_plugs"].get(f"inventar:{plug['id']}") == "switch.hk1"   # Notprogramm schaltet ab


async def test_zuordnen_vorschau_vor_dem_schreiben(hass: HomeAssistant, baustelle_register, hass_ws_client) -> None:
    """Zuordnen: erst die Vorschau der Namen (als wäre das Gerät schon drin), geschrieben wird nichts; nach dem Zuordnen
    zeigt die echte Vorschau dieselben Namen für das neue Gerät."""
    entry = baustelle_register
    device_id = _neuer_shelly(hass)
    ws = await hass_ws_client(hass)
    c = await _anlegen(ws, 1, entry, art="MAN", bereich_id=C2)
    subs_vorher, ents_vorher = set(entry.subentries), dict(er.async_get(hass).entities)
    v = await _senden(ws, 2, type="baustelle/inventar_zuordnen_vorschau", container_id=c["id"], device_id=device_id,
                      haengt="radiator")
    assert v["success"], v
    assert v["result"]["zuordnen"] == {"device_id": device_id, "typ": "PLUG", "name": "Plug Lager 09", "eingetragen": True}
    neu = [s for s in v["result"]["schritte"] if s["ziel"] == "geraet" and s["ref"] == device_id]
    assert len(neu) == 1 and neu[0]["alt"] == "Plug Lager 09"
    assert set(entry.subentries) == subs_vorher and dict(er.async_get(hass).entities) == ents_vorher   # nichts geschrieben
    inv = (await _senden(ws, 3, type="baustelle/inventar"))["result"]
    assert len(next(x for x in inv["container"] if x["id"] == c["id"])["ausruestung"]) == len(c["ausruestung"])

    z = await _senden(ws, 4, type="baustelle/inventar_aendern", aktion="ausruestung_zuordnen", container_id=c["id"],
                      device_id=device_id, haengt="radiator")
    await hass.async_block_till_done()
    assert z["success"], z
    echt = (await _senden(ws, 5, type="baustelle/inventar_vorschau", container_id=c["id"]))["result"]
    nach = next(s for s in echt["schritte"] if s["ziel"] == "geraet" and s["ref"] == device_id)
    assert nach["neu"] == neu[0]["neu"]   # Vorschau vorher = Namen nachher

    falsch = await _senden(ws, 6, type="baustelle/inventar_zuordnen_vorschau", container_id="gibt-es-nicht", device_id=device_id)
    assert not falsch["success"] and falsch["error"]["code"] == "not_found"


async def test_struktur_namen_je_container(hass: HomeAssistant, baustelle_register, hass_ws_client) -> None:
    """Chip am Container: struktur liefert je Container, ob er im Inventar ist und wie viele Schritte vom Schema abweichen
    (dieselbe Zahl wie „Übernehmen (n)“ der Vorschau)."""
    entry = baustelle_register
    ws = await hass_ws_client(hass)

    def bereich(r, bid):
        return next(b for x in r if x["baustelle"]["entry_id"] == entry.entry_id for b in x["bereiche"] if b["id"] == bid)

    vorher = bereich((await _senden(ws, 1, type="baustelle/struktur"))["result"], C1)
    assert vorher["namen"] == {"container_id": None, "container": None, "abweichend": None}   # nicht im Inventar
    c = await _anlegen(ws, 2, entry, art="MAN", bereich_id=C1)
    v = (await _senden(ws, 3, type="baustelle/inventar_vorschau", container_id=c["id"]))["result"]
    nachher = bereich((await _senden(ws, 4, type="baustelle/struktur"))["result"], C1)
    offen = sum(1 for s in v["schritte"] if s["zustand"] != "gleich")
    assert offen > 0
    assert nachher["namen"] == {"container_id": c["id"], "container": "001_C_MAN", "abweichend": offen}


def _neuer_fuehler(hass: HomeAssistant) -> str:
    """Ein zweiter Temperaturfühler, den HA kennt, aber keine Baustelle; liefert die Geräte-ID."""
    quelle = MockConfigEntry(domain="bthome", title="Fühler 2", data={})
    quelle.add_to_hass(hass)
    geraet = dr.async_get(hass).async_get_or_create(config_entry_id=quelle.entry_id, identifiers={("bthome", "ht9")},
                                                    name="Fühler Lager 09", model="Shelly H&T")
    er.async_get(hass).async_get_or_create("sensor", "bthome", "ht9-t", suggested_object_id="temp_lager_09",
                                           config_entry=quelle, device_id=geraet.id, original_device_class="temperature")
    hass.states.async_set("sensor.temp_lager_09", "18.5", {"device_class": "temperature", "unit_of_measurement": "°C"})
    return geraet.id


async def test_zuordnen_vorschau_zweiter_fuehler(hass: HomeAssistant, baustelle_register, hass_ws_client) -> None:
    """Gutachten M1: Der Container hat schon einen Fühler – das Zuordnen trägt den zweiten nicht ein (`sensor_verdrahtung`),
    also verspricht die Vorschau auch keine Umbenennung, sondern sagt es."""
    entry = baustelle_register
    device_id = _neuer_fuehler(hass)
    ws = await hass_ws_client(hass)
    c = await _anlegen(ws, 1, entry, art="MAN", bereich_id=C1)   # C1 hat schon einen Fühler
    fuehler_vorher = entry.subentries[C1].data.get("fuehler")
    assert fuehler_vorher
    v = await _senden(ws, 2, type="baustelle/inventar_zuordnen_vorschau", container_id=c["id"], device_id=device_id)
    assert v["success"], v
    z = v["result"]["zuordnen"]
    assert z["typ"] == "TEMP" and z["eingetragen"] is False and "schon einen Fühler" in z["hinweis"]
    assert not any(s["ref"] == device_id for s in v["result"]["schritte"])
    a = await _senden(ws, 3, type="baustelle/inventar_aendern", aktion="ausruestung_zuordnen", container_id=c["id"],
                      device_id=device_id)
    await hass.async_block_till_done()
    assert a["success"], a
    assert a["result"]["verdrahtet"] is None and entry.subentries[C1].data.get("fuehler") == fuehler_vorher
    echt = (await _senden(ws, 4, type="baustelle/inventar_vorschau", container_id=c["id"]))["result"]
    assert not any(s["ref"] == device_id for s in echt["schritte"])   # Vorschau vorher = Stand nachher

    c2 = await _anlegen(ws, 5, entry, art="MAN", bereich_id=C2)   # C2 ohne Fühler: der erste wird eingetragen
    assert not entry.subentries[C2].data.get("fuehler")
    geraet2 = _neuer_fuehler_2(hass)
    v2 = (await _senden(ws, 6, type="baustelle/inventar_zuordnen_vorschau", container_id=c2["id"], device_id=geraet2))["result"]
    assert v2["zuordnen"]["eingetragen"] is True and "hinweis" not in v2["zuordnen"]
    assert any(s["ref"] == geraet2 for s in v2["schritte"])


def _neuer_fuehler_2(hass: HomeAssistant) -> str:
    quelle = MockConfigEntry(domain="bthome", title="Fühler 3", data={})
    quelle.add_to_hass(hass)
    geraet = dr.async_get(hass).async_get_or_create(config_entry_id=quelle.entry_id, identifiers={("bthome", "ht8")},
                                                    name="Fühler Lager 08", model="Shelly H&T")
    er.async_get(hass).async_get_or_create("sensor", "bthome", "ht8-t", suggested_object_id="temp_lager_08",
                                           config_entry=quelle, device_id=geraet.id, original_device_class="temperature")
    hass.states.async_set("sensor.temp_lager_08", "18.5", {"device_class": "temperature", "unit_of_measurement": "°C"})
    return geraet.id


async def test_zuordnen_vorschau_datenbank_nicht_lesbar(hass: HomeAssistant, baustelle_register, hass_ws_client,
                                                        monkeypatch) -> None:
    """Gutachten N4: scheitert das Lesen, meldet die Vorschau „nicht_bereit“ statt eines unbekannten Fehlers."""
    from custom_components.baustelle import inventar

    entry = baustelle_register
    device_id = _neuer_shelly(hass)
    ws = await hass_ws_client(hass)
    c = await _anlegen(ws, 1, entry, art="MAN", bereich_id=C2)
    db = hass.data[inventar.DATA_DB]

    async def kaputt(arbeit):
        return None

    monkeypatch.setattr(db, "async_ausfuehren", kaputt)
    v = await _senden(ws, 2, type="baustelle/inventar_zuordnen_vorschau", container_id=c["id"], device_id=device_id)
    assert not v["success"] and v["error"]["code"] == "nicht_bereit"


async def test_struktur_namen_zwischenspeicher_und_fehler(hass: HomeAssistant, baustelle_register, hass_ws_client,
                                                          monkeypatch, caplog) -> None:
    """Gutachten M2: struktur fragt die Namen höchstens alle 60 s (sofort neu nach einer Änderung am Inventar) und
    antwortet auch, wenn das Ermitteln scheitert – dann ohne Chip und mit einer Warnung, nur einmal."""
    from custom_components.baustelle import inventar

    entry = baustelle_register
    ws = await hass_ws_client(hass)
    aufrufe = []
    echt = inventar.async_namen

    async def gezaehlt(h, db):
        aufrufe.append(1)
        return await echt(h, db)

    monkeypatch.setattr(inventar, "async_namen", gezaehlt)

    def bereich(r):
        return next(b for x in r for b in x["bereiche"] if b["id"] == C1)

    assert "namen" in bereich((await _senden(ws, 1, type="baustelle/struktur"))["result"])
    assert "namen" in bereich((await _senden(ws, 2, type="baustelle/struktur"))["result"])
    assert len(aufrufe) == 1   # zweites Mal aus dem Zwischenspeicher
    c = await _anlegen(ws, 3, entry, art="MAN", bereich_id=C1)
    assert bereich((await _senden(ws, 4, type="baustelle/struktur"))["result"])["namen"]["container_id"] == c["id"]
    assert len(aufrufe) == 2   # Änderung am Inventar verwirft den Zwischenspeicher

    async def kaputt(h, db):
        raise RuntimeError("kaputt")

    monkeypatch.setattr(inventar, "async_namen", kaputt)
    inventar.namen_verwerfen(hass)
    for nr in (5, 6):
        inventar.namen_verwerfen(hass)
        r = await _senden(ws, nr, type="baustelle/struktur")
        assert r["success"] and "namen" not in bereich(r["result"])   # Struktur kommt, nur ohne Chip
    assert sum("Namen für den Chip" in m for m in caplog.messages) == 1   # Warnung einmal
