"""Einrichtung: Baustelle anlegen, Bereiche und Shellys zuordnen, Optionen."""

import pytest

from homeassistant import config_entries
from homeassistant.core import HomeAssistant
from homeassistant.data_entry_flow import FlowResultType
from homeassistant.util import dt as dt_util
from pytest_homeassistant_custom_component.common import MockConfigEntry

from custom_components.baustelle.const import DOMAIN, SUB_BEREICH, SUB_GERAET
from custom_components.baustelle.daten import struktur


@pytest.fixture(autouse=True)
async def _shellys_da(hass: HomeAssistant) -> None:
    """Die Schalter der Dialoge gibt es in HA (ein neu gewählter muss existieren, Gutachten 0.8.190)."""
    for eid in ("switch.plug_1", "switch.plug_2"):
        hass.states.async_set(eid, "off")


async def test_baustelle_anlegen_und_ersten_container(hass: HomeAssistant) -> None:
    result = await hass.config_entries.flow.async_init(DOMAIN, context={"source": config_entries.SOURCE_USER})
    assert result["type"] is FlowResultType.FORM
    result = await hass.config_entries.flow.async_configure(
        result["flow_id"], {"name": "Wohnanlage Nord", "beginn": "2026-09-01", "heizung": True, "pumpen": False}
    )
    assert result["type"] is FlowResultType.CREATE_ENTRY
    entry = result["result"]
    assert entry.title == "Wohnanlage Nord"
    assert entry.options["status"] == "aktiv"
    # direkt danach: ersten Container anlegen
    assert result["next_flow"][0] == "config_subentries_flow"
    await hass.async_block_till_done()


async def test_keine_funktion_gewaehlt(hass: HomeAssistant) -> None:
    result = await hass.config_entries.flow.async_init(DOMAIN, context={"source": config_entries.SOURCE_USER})
    result = await hass.config_entries.flow.async_configure(
        result["flow_id"], {"name": "X", "beginn": "2026-09-01", "heizung": False, "pumpen": False}
    )
    assert result["errors"] == {"base": "keine_funktion"}


def _entry(hass: HomeAssistant, status: str = "aktiv", title: str = "B1") -> MockConfigEntry:
    entry = MockConfigEntry(
        domain=DOMAIN, title=title, data={"name": title},
        options={"heizung": True, "pumpen": True, "status": status, "beginn": "2026-09-01",
                 "heizperiode_von": "10", "heizperiode_bis": "4", "empfaenger": []},
    )
    entry.add_to_hass(hass)
    return entry


async def _bereich(hass, entry, name="Container 1", art="container"):
    r = await hass.config_entries.subentries.async_init((entry.entry_id, SUB_BEREICH), context={"source": "user"})
    r = await hass.config_entries.subentries.async_configure(r["flow_id"], {"name": name, "art": art})
    assert r["type"] is FlowResultType.CREATE_ENTRY
    return next(s for s in entry.subentries.values() if s.title == name)


async def test_shelly_zuordnen_und_pruefungen(hass: HomeAssistant) -> None:
    entry = _entry(hass)
    # ohne Bereich: abbrechen
    r = await hass.config_entries.subentries.async_init((entry.entry_id, SUB_GERAET), context={"source": "user"})
    assert r["type"] is FlowResultType.ABORT and r["reason"] == "kein_bereich"

    container = await _bereich(hass, entry)
    schacht = await _bereich(hass, entry, "Schacht", "pumpenschacht")
    daten = {"bereich": container.subentry_id, "schalter": "switch.plug_1", "name": "Heizkörper 1",
             "rolle": "heizkoerper", "typ": "oelradiator"}
    r = await hass.config_entries.subentries.async_init((entry.entry_id, SUB_GERAET), context={"source": "user"})
    r = await hass.config_entries.subentries.async_configure(r["flow_id"], daten)
    assert r["type"] is FlowResultType.CREATE_ENTRY

    # derselbe Shelly nochmal → Fehler
    r = await hass.config_entries.subentries.async_init((entry.entry_id, SUB_GERAET), context={"source": "user"})
    r = await hass.config_entries.subentries.async_configure(r["flow_id"], {**daten, "name": "Doppelt"})
    assert r["errors"] == {"base": "schalter_vergeben"}

    # Pumpe im Container → Fehler
    r = await hass.config_entries.subentries.async_init((entry.entry_id, SUB_GERAET), context={"source": "user"})
    r = await hass.config_entries.subentries.async_configure(
        r["flow_id"], {**daten, "schalter": "switch.plug_2", "rolle": "pumpe"}
    )
    assert r["errors"] == {"base": "rolle_passt_nicht"}
    r = await hass.config_entries.subentries.async_configure(
        r["flow_id"], {**daten, "schalter": "switch.plug_2", "rolle": "pumpe", "bereich": schacht.subentry_id, "name": "Pumpe 1"}
    )
    assert r["type"] is FlowResultType.CREATE_ENTRY


async def test_shelly_einer_anderen_aktiven_baustelle(hass: HomeAssistant) -> None:
    alt = _entry(hass, title="Alt")
    c = await _bereich(hass, alt)
    r = await hass.config_entries.subentries.async_init((alt.entry_id, SUB_GERAET), context={"source": "user"})
    await hass.config_entries.subentries.async_configure(
        r["flow_id"], {"bereich": c.subentry_id, "schalter": "switch.plug_1", "name": "HK", "rolle": "heizkoerper", "typ": "konvektor"}
    )
    neu = _entry(hass, title="Neu")
    c2 = await _bereich(hass, neu)
    daten = {"bereich": c2.subentry_id, "schalter": "switch.plug_1", "name": "HK", "rolle": "heizkoerper", "typ": "konvektor"}
    r = await hass.config_entries.subentries.async_init((neu.entry_id, SUB_GERAET), context={"source": "user"})
    r = await hass.config_entries.subentries.async_configure(r["flow_id"], daten)
    assert r["errors"] == {"base": "schalter_andere_baustelle"}

    # alte Baustelle abschließen → Shelly frei
    hass.config_entries.async_update_entry(alt, options={**alt.options, "status": "abgeschlossen"})
    r = await hass.config_entries.subentries.async_configure(r["flow_id"], daten)
    assert r["type"] is FlowResultType.CREATE_ENTRY
    await hass.async_block_till_done()


async def test_optionen_abschliessen_setzt_ende(hass: HomeAssistant) -> None:
    entry = _entry(hass)
    r = await hass.config_entries.options.async_init(entry.entry_id)
    assert r["type"] is FlowResultType.FORM
    r = await hass.config_entries.options.async_configure(
        r["flow_id"],
        {"status": "abgeschlossen", "beginn": "2026-09-01", "heizung": True, "pumpen": True,
         "heizperiode_von": "10", "heizperiode_bis": "4"},
    )
    assert r["type"] is FlowResultType.CREATE_ENTRY
    assert entry.options["status"] == "abgeschlossen"
    assert entry.options["ende"]
    await hass.async_block_till_done()


async def _optionen(hass, entry, **aenderung):
    r = await hass.config_entries.options.async_init(entry.entry_id)
    eingabe = {"status": entry.options["status"], "heizung": True, "pumpen": True, "heizperiode_von": "10", "heizperiode_bis": "4"}
    eingabe.update({k: entry.options[k] for k in ("beginn", "ende") if k in entry.options})
    r = await hass.config_entries.options.async_configure(r["flow_id"], {**eingabe, **aenderung})
    assert r["type"] is FlowResultType.CREATE_ENTRY
    await hass.async_block_till_done()


async def test_ende_automatisch(hass: HomeAssistant) -> None:
    """AN-0002: geplantes Ende bleibt bei aktiv (bis 0.7.26 gelöscht), Abschließen setzt immer heute, wieder aktiv ohne Ende."""
    heute = dt_util.now().date().isoformat()
    entry = _entry(hass)
    await _optionen(hass, entry, ende="2027-05-28")
    assert entry.options["ende"] == "2027-05-28"
    await _optionen(hass, entry, status="abgeschlossen")
    assert entry.options["ende"] == heute
    await _optionen(hass, entry, ende="2026-09-15")   # bleibt abgeschlossen: Ende korrigierbar
    assert entry.options["ende"] == "2026-09-15"
    await _optionen(hass, entry, status="aktiv")
    assert "ende" not in entry.options


async def test_beginn_automatisch(hass: HomeAssistant) -> None:
    """AN-0002: Beginn freiwillig; leer = Tag der Anlage, die Struktur meldet ihn als automatisch."""
    result = await hass.config_entries.flow.async_init(DOMAIN, context={"source": config_entries.SOURCE_USER})
    result = await hass.config_entries.flow.async_configure(result["flow_id"], {"name": "Ohne Beginn", "heizung": True, "pumpen": False})
    assert result["type"] is FlowResultType.CREATE_ENTRY
    entry = result["result"]
    assert "beginn" not in entry.options
    bs = struktur(hass, entry)["baustelle"]
    assert bs["beginn_auto"] is True and bs["beginn"] == dt_util.as_local(entry.created_at).date().isoformat()
    mit = _entry(hass, title="Mit Beginn")
    bs = struktur(hass, mit)["baustelle"]
    assert bs["beginn_auto"] is False and bs["beginn"] == "2026-09-01"
    await hass.async_block_till_done()


async def test_optionen_wieder_aktiv_mit_vergebenem_shelly(hass: HomeAssistant) -> None:
    """Abgeschlossene Baustelle wieder aktiv setzen geht nicht, wenn ihr Shelly inzwischen einer anderen gehört."""
    alt = _entry(hass, status="abgeschlossen", title="Alt")
    c = await _bereich(hass, alt)
    daten = {"bereich": c.subentry_id, "schalter": "switch.plug_1", "name": "HK", "rolle": "heizkoerper", "typ": "konvektor"}
    r = await hass.config_entries.subentries.async_init((alt.entry_id, SUB_GERAET), context={"source": "user"})
    await hass.config_entries.subentries.async_configure(r["flow_id"], daten)
    neu = _entry(hass, title="Neu")
    c2 = await _bereich(hass, neu)
    r = await hass.config_entries.subentries.async_init((neu.entry_id, SUB_GERAET), context={"source": "user"})
    r = await hass.config_entries.subentries.async_configure(r["flow_id"], {**daten, "bereich": c2.subentry_id})
    assert r["type"] is FlowResultType.CREATE_ENTRY

    r = await hass.config_entries.options.async_init(alt.entry_id)
    eingabe = {"status": "aktiv", "beginn": "2026-09-01", "heizung": True, "pumpen": True,
               "heizperiode_von": "10", "heizperiode_bis": "4"}
    r = await hass.config_entries.options.async_configure(r["flow_id"], eingabe)
    assert r["errors"] == {"base": "geraete_vergeben"}
    assert r["description_placeholders"] == {"belegt": "switch.plug_1"}
    r = await hass.config_entries.options.async_configure(r["flow_id"], {**eingabe, "heizung": False, "pumpen": False})
    assert r["errors"] == {"base": "keine_funktion"}
    await hass.async_block_till_done()


async def test_bereich_name_doppelt(hass: HomeAssistant) -> None:
    entry = _entry(hass)
    await _bereich(hass, entry)
    r = await hass.config_entries.subentries.async_init((entry.entry_id, SUB_BEREICH), context={"source": "user"})
    r = await hass.config_entries.subentries.async_configure(r["flow_id"], {"name": " Container 1 ", "art": "container"})
    assert r["errors"] == {"base": "name_vergeben"}


async def test_shelly_bereich_inzwischen_geloescht(hass: HomeAssistant) -> None:
    """Der Bereich verschwindet, während der Dialog offen ist → Fehler statt Shelly ohne Bereich."""
    entry = _entry(hass)
    container = await _bereich(hass, entry)
    await _bereich(hass, entry, "Container 2")
    r = await hass.config_entries.subentries.async_init((entry.entry_id, SUB_GERAET), context={"source": "user"})
    hass.config_entries.async_remove_subentry(entry, container.subentry_id)
    r = await hass.config_entries.subentries.async_configure(
        r["flow_id"], {"bereich": container.subentry_id, "schalter": "switch.plug_1", "name": "HK",
                       "rolle": "heizkoerper", "typ": "konvektor"}
    )
    assert r["errors"] == {"base": "kein_bereich"}
    await hass.async_block_till_done()


async def test_shelly_neu_einrichten(hass: HomeAssistant) -> None:
    """Shelly ändern (Subentry neu einrichten): gleiche Prüfungen wie beim Anlegen."""
    entry = _entry(hass)
    container = await _bereich(hass, entry)
    daten = {"bereich": container.subentry_id, "schalter": "switch.plug_1", "name": "HK", "rolle": "heizkoerper",
             "typ": "konvektor"}
    r = await hass.config_entries.subentries.async_init((entry.entry_id, SUB_GERAET), context={"source": "user"})
    await hass.config_entries.subentries.async_configure(r["flow_id"], daten)
    sid = next(s.subentry_id for s in entry.subentries.values() if s.subentry_type == SUB_GERAET)
    r = await hass.config_entries.subentries.async_init(
        (entry.entry_id, SUB_GERAET), context={"source": "reconfigure", "subentry_id": sid}
    )
    assert r["type"] is FlowResultType.FORM and r["step_id"] == "reconfigure"
    r = await hass.config_entries.subentries.async_configure(r["flow_id"], {**daten, "rolle": "pumpe"})
    assert r["errors"] == {"base": "rolle_passt_nicht"}
    r = await hass.config_entries.subentries.async_configure(r["flow_id"], {**daten, "name": " HK Magazin "})
    assert r["type"] is FlowResultType.ABORT and r["reason"] == "reconfigure_successful"
    assert entry.subentries[sid].title == "HK Magazin"
    await hass.async_block_till_done()


async def test_fehlende_entitaet_abgelehnt(hass: HomeAssistant) -> None:
    """Gutachten 0.8.190: ein neu gewählter Fühler oder Schalter muss in HA existieren (z. B. kein alter Entwurf nach dem
    Umbenennen); ein unveränderter bleibt erlaubt."""
    entry = _entry(hass)
    c = await _bereich(hass, entry)
    r = await hass.config_entries.subentries.async_init(
        (entry.entry_id, SUB_BEREICH), context={"source": "reconfigure", "subentry_id": c.subentry_id})
    r = await hass.config_entries.subentries.async_configure(
        r["flow_id"], {"name": "Container 1", "art": "container", "fuehler": "sensor.gibt_es_nicht"})
    assert r["errors"] == {"base": "fuehler_fehlt"}
    hass.states.async_set("sensor.temp_neu", "20", {"device_class": "temperature"})
    r = await hass.config_entries.subentries.async_configure(
        r["flow_id"], {"name": "Container 1", "art": "container", "fuehler": "sensor.temp_neu"})
    assert r["type"] is FlowResultType.ABORT
    r = await hass.config_entries.subentries.async_init((entry.entry_id, SUB_GERAET), context={"source": "user"})
    r = await hass.config_entries.subentries.async_configure(
        r["flow_id"], {"bereich": c.subentry_id, "schalter": "switch.gibt_es_nicht", "name": "HK", "rolle": "heizkoerper",
                       "typ": "konvektor"})
    assert r["errors"] == {"base": "schalter_fehlt"}
    await hass.async_block_till_done()
