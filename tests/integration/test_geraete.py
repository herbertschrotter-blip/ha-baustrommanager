"""BSM-034.02 Lieferung 2: Geräte anlegen, ändern, verschieben und entfernen über `baustelle/geraet` (kern/geraete) –
Prüfregeln wie im HA-Dialog, Inventar zieht mit, einmal neu laden."""

from __future__ import annotations

from homeassistant.core import HomeAssistant

from .conftest import C1, C2, HK1, HK2, SCHACHT
from .test_inventar_geraete import _anlegen, _neuer_shelly, _senden
from .test_umbenennen import baustelle_register  # noqa: F401  (Fixture)


async def test_geraete_speichern_mit_inventar(hass: HomeAssistant, baustelle_register, hass_ws_client) -> None:
    entry = baustelle_register
    _neuer_shelly(hass)
    ws = await hass_ws_client(hass)
    nr = iter(range(1, 100))
    c = await _anlegen(ws, next(nr), entry, art="POL", bereich_id=C1)   # Bestand: HK1 als PLUG im Container
    plug = next(a for a in c["ausruestung"] if a["typ"] == "PLUG")

    async def speichern(*schritte):
        return await _senden(ws, next(nr), type="baustelle/geraet", entry_id=entry.entry_id, aktion="speichern",
                             schritte=list(schritte))

    async def im_container() -> set[str | None]:
        alles = (await _senden(ws, next(nr), type="baustelle/inventar"))["result"]
        return {a.get("geraet_id") for x in alles["container"] if x["id"] == c["id"] for a in x["ausruestung"]}

    # Prüfregeln wie der HA-Dialog – und nichts wird geändert, wenn ein Schritt falsch ist
    vorher = dict(entry.subentries)
    pumpe = await speichern({"aktion": "aendern", "geraet": HK2, "name": "neu"},
                            {"aktion": "anlegen", "bereich": C1, "schalter": "switch.plug_lager_09", "name": "P", "rolle": "pumpe",
                             "typ": "konvektor"})
    doppelt = await speichern({"aktion": "anlegen", "bereich": C1, "schalter": "switch.hk2", "name": "X", "rolle": "heizkoerper",
                               "typ": "konvektor"})
    schacht = await speichern({"aktion": "aendern", "geraet": HK1, "bereich": SCHACHT})
    assert not pumpe["success"] and pumpe["error"]["code"] == "rolle_passt_nicht"
    assert pumpe["error"]["message"] == "Pumpen gehören in einen Pumpenschacht, alles andere in einen Container."
    assert not doppelt["success"] and doppelt["error"]["code"] == "schalter_vergeben"
    assert not schacht["success"] and schacht["error"]["code"] == "rolle_passt_nicht"
    assert dict(entry.subentries) == vorher

    # anlegen im Container mit Inventar: der Shelly kommt als PLUG in den Container
    r = await speichern({"aktion": "anlegen", "bereich": C1, "schalter": "switch.plug_lager_09", "name": " Radiator Lager ",
                         "rolle": "heizkoerper", "typ": "oelradiator"})
    assert r["success"], r
    neu = r["result"]["neu"][0]
    st = entry.runtime_data
    assert st.geraete[neu].name == "Radiator Lager" and st.geraete[neu].bereich == C1   # neu geladen
    assert entry.subentries[neu].data["name"] == "Radiator Lager"
    assert await im_container() == {HK1, neu, None}   # None = Fühler (TEMP)

    # verschieben: HK1 nach Container 2 (ohne Inventar) – sein Einsatz endet, der Plug ist frei
    r = await speichern({"aktion": "aendern", "geraet": HK1, "bereich": C2, "name": "Heizkörper 1"})
    assert r["success"], r
    assert entry.runtime_data.geraete[HK1].bereich == C2 and HK1 not in await im_container()
    frei = (await _senden(ws, next(nr), type="baustelle/inventar"))["result"]["ausruestung_frei"]
    assert plug["id"] in {a["id"] for a in frei}
    assert entry.runtime_data.e["protokoll"][0][3] == "Heizkörper 1 nach Container 2 verschoben"

    # entfernen: Unter-Eintrag weg, Einsatz beendet; mehrere Schritte in einem Aufruf
    r = await speichern({"aktion": "entfernen", "geraet": neu}, {"aktion": "aendern", "geraet": HK2, "leistung": ""})
    assert r["success"], r
    assert neu not in entry.subentries and neu not in entry.runtime_data.geraete
    assert await im_container() == {None}
    assert "leistung" not in entry.subentries[HK2].data   # leer = automatisch
    texte = [e[3] for e in entry.runtime_data.e["protokoll"][:3]]
    assert "Radiator Lager entfernt – Werte bleiben im Verlauf" in texte


async def test_inventar_zuordnen_mit_denselben_regeln(hass: HomeAssistant, baustelle_register) -> None:
    """BSM-034.02: Zuordnen im Inventar prüft wie der HA-Dialog – eine Pumpe kommt nicht in einen Container."""
    import pytest   # noqa: PLC0415
    from homeassistant.helpers import device_registry as dr, entity_registry as er   # noqa: PLC0415
    from pytest_homeassistant_custom_component.common import MockConfigEntry   # noqa: PLC0415

    from custom_components.baustelle.inventar_geraete import _verdrahten   # noqa: PLC0415

    entry = baustelle_register
    ents = er.async_get(hass)
    if (e := ents.async_get("switch.p1")) is not None:
        ents.async_remove("switch.p1")
    hass.states.async_remove("switch.p1")
    quelle = MockConfigEntry(domain="shelly", data={})
    quelle.add_to_hass(hass)
    geraet = dr.async_get(hass).async_get_or_create(config_entry_id=quelle.entry_id, identifiers={("shelly", "p1")})
    neu = ents.async_get_or_create("switch", "shelly", "p1-s", suggested_object_id="p1", config_entry=quelle, device_id=geraet.id)
    assert neu.entity_id == "switch.p1"
    with pytest.raises(ValueError, match="Pumpen gehören in einen Pumpenschacht"):
        _verdrahten(hass, entry.runtime_data, C1, geraet, "PLUG", None)
    assert entry.subentries[next(s for s, x in entry.subentries.items() if x.data.get("schalter") == "switch.p1")].data["bereich"] == SCHACHT


async def test_fehlende_entitaet_und_namen_verwerfen(hass: HomeAssistant, baustelle_register, hass_ws_client) -> None:
    """Gutachten 0.8.190: ein Entwurf mit alter Entity-ID (nach dem Umbenennen) schreibt sie nicht zurück – neuer Schalter
    oder Türkontakt muss in HA existieren; Geräte, Tür, Symbol und Unter-Einträge verwerfen den Namen-Zwischenspeicher."""
    from custom_components.baustelle.inventar import DATA_NAMEN   # noqa: PLC0415

    entry = baustelle_register
    ws = await hass_ws_client(hass)
    nr = iter(range(1, 100))

    def merken() -> None:
        hass.data[DATA_NAMEN] = {"stand": 0, "zeit": 0.0, "namen": {}}

    def verworfen() -> bool:
        return "zeit" not in hass.data[DATA_NAMEN]

    async def speichern(*schritte):
        return await _senden(ws, next(nr), type="baustelle/geraet", entry_id=entry.entry_id, aktion="speichern",
                             schritte=list(schritte))

    async def setzen(pfad, wert):
        return await _senden(ws, next(nr), type="baustelle/setzen", entry_id=entry.entry_id, pfad=pfad, wert=wert)

    merken()
    r = await speichern({"aktion": "aendern", "geraet": HK2, "schalter": "switch.gibt_es_nicht"})
    assert not r["success"] and r["error"]["code"] == "schalter_fehlt" and verworfen()
    assert "gibt es in Home Assistant nicht" in r["error"]["message"]
    merken()
    r = await speichern({"aktion": "aendern", "geraet": HK2, "name": "Heizkörper zwei"})   # Schalter bleibt: keine Prüfung
    assert r["success"], r
    assert verworfen()

    merken()
    r = await setzen(["bereiche", C1, "tuer"], "binary_sensor.gibt_es_nicht")
    assert not r["success"] and "gibt es in Home Assistant nicht" in r["error"]["message"]
    hass.states.async_set("binary_sensor.tuer_neu", "off")
    r = await setzen(["bereiche", C1, "tuer"], "binary_sensor.tuer_neu")
    assert r["success"], r
    assert verworfen()
    await hass.async_block_till_done()

    merken()
    hass.config_entries.async_update_subentry(entry, entry.subentries[C2], title="Container zwei")
    await hass.async_block_till_done()
    assert verworfen()   # Unter-Eintrag geändert (z. B. HA-Dialog)
