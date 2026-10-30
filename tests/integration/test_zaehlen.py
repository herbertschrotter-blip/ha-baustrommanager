"""Stufe 4: Energie, Kosten, Zeiten, Zyklen, „ohne Automatik“ – und dass die Zahlen bleiben."""

from datetime import timedelta

import pytest

from homeassistant.core import HomeAssistant
from homeassistant.helpers import entity_registry as er
from pytest_homeassistant_custom_component.common import MockConfigEntry

from custom_components.baustelle.const import DOMAIN

from .conftest import eid as _eid, sub as _sub


@pytest.fixture
async def baustelle(hass: HomeAssistant, freezer):
    await hass.config.async_set_time_zone("Europe/Vienna")
    hass.config.currency = "EUR"
    for eid, wert in {
        "switch.hk1": "off", "sensor.hk1_power": "0", "sensor.hk1_energy": "10.0",
        "switch.hk2": "off", "sensor.hk2_power": "0",
        "switch.p1": "on", "sensor.p1_power": "0", "sensor.c_temp": "10.0", "sensor.aussen": "2.0",
    }.items():
        hass.states.async_set(eid, wert)
    entry = MockConfigEntry(
        domain=DOMAIN, title="Z", data={"name": "Z"},
        options={"heizung": True, "pumpen": True, "status": "aktiv", "beginn": "2026-09-01",
                 "heizperiode_von": "10", "heizperiode_bis": "4", "empfaenger": [], "temp_sensor": "sensor.aussen"},
        subentries_data=[
            _sub("c", "bereich", "C", {"name": "C", "art": "container", "fuehler": "sensor.c_temp"}),
            _sub("s", "bereich", "S", {"name": "S", "art": "pumpenschacht"}),
            _sub("h1", "geraet", "HK1", {"bereich": "c", "schalter": "switch.hk1", "name": "HK1", "rolle": "heizkoerper",
                                         "typ": "oelradiator", "leistung": "sensor.hk1_power", "energie": "sensor.hk1_energy"}),
            _sub("h2", "geraet", "HK2", {"bereich": "c", "schalter": "switch.hk2", "name": "HK2", "rolle": "heizkoerper",
                                         "typ": "konvektor", "leistung": "sensor.hk2_power"}),
            _sub("p", "geraet", "P", {"bereich": "s", "schalter": "switch.p1", "name": "P", "rolle": "pumpe",
                                      "typ": "konvektor", "leistung": "sensor.p1_power"}),
        ],
    )
    entry.add_to_hass(hass)
    assert await hass.config_entries.async_setup(entry.entry_id)
    await hass.async_block_till_done()
    freezer.move_to("2026-11-10 08:00:00+01:00")
    entry.runtime_data.auswerten()
    return entry


def _wert(hass, uid: str) -> float:
    return float(hass.states.get(_eid(hass, "sensor", uid)).state)


async def test_energie_und_kosten_aus_zaehlerstand(hass: HomeAssistant, baustelle) -> None:
    e = baustelle.entry_id
    hass.states.async_set("sensor.hk1_energy", "10.5")
    await hass.async_block_till_done()
    st = baustelle.runtime_data
    st.auswerten()
    await hass.async_block_till_done()
    assert _wert(hass, f"{e}_energie") == pytest.approx(0.5)
    assert _wert(hass, "c_energie") == pytest.approx(0.5)
    assert _wert(hass, f"{e}_kosten") == pytest.approx(0.14)
    assert _wert(hass, f"{e}_energie_oelradiator") == pytest.approx(0.5)
    assert hass.states.get(_eid(hass, "sensor", f"{e}_kosten")).attributes["unit_of_measurement"] == "EUR"
    # Preis ändern: alte Kosten bleiben, neue kWh zum neuen Preis
    st.einstellung_setzen(("preis",), 0.40)
    hass.states.async_set("sensor.hk1_energy", "11.0")
    await hass.async_block_till_done()
    st.auswerten()
    assert st.zaehler["kosten"] == pytest.approx(0.14 + 0.20)


async def test_zahlen_bleiben_nach_neu_laden(hass: HomeAssistant, baustelle) -> None:
    hass.states.async_set("sensor.hk1_energy", "12.0")
    await hass.async_block_till_done()
    assert await hass.config_entries.async_reload(baustelle.entry_id)
    await hass.async_block_till_done()
    assert baustelle.runtime_data.zaehler["energie"] == pytest.approx(2.0)
    # Stand gemerkt: nur der Zuwachs seit dem letzten Stand zählt
    hass.states.async_set("sensor.hk1_energy", "12.5")
    await hass.async_block_till_done()
    assert baustelle.runtime_data.zaehler["energie"] == pytest.approx(2.5)


async def test_heizzeit_mittel_ohne_automatik(hass: HomeAssistant, baustelle, freezer) -> None:
    st = baustelle.runtime_data
    hass.states.async_set("switch.hk2", "on")
    hass.states.async_set("sensor.hk2_power", "2000")
    await hass.async_block_till_done()
    for _ in range(6):
        freezer.tick(timedelta(minutes=1))
        st.auswerten()
    await hass.async_block_till_done()
    assert st.zaehler["heizzeit:c"] == pytest.approx(0.1, abs=0.02)
    assert st.zaehler["mittel:h2"] == pytest.approx(2000)
    assert _wert(hass, "c_heizzeit") == pytest.approx(0.1, abs=0.02)
    assert st.zaehler["heizzeit_typ:konvektor"] == pytest.approx(0.1, abs=0.02)
    # HK2 hat keinen Energiezähler → Leistung × Zeit
    assert st.zaehler["energie"] == pytest.approx(0.2, abs=0.04)
    # ohne Automatik: 2 kW rund um die Uhr
    assert st.zaehler["ohne"] == pytest.approx(0.2, abs=0.04)
    assert _wert(hass, "h2_mittel_im_betrieb") == pytest.approx(2000)
    # FE-0020: inaktiv → zählt nicht mehr zu „ohne Automatik“ (die Messung bleibt)
    st.geraet_aktiv_setzen(st.geraete["h2"], False)
    await hass.async_block_till_done()
    vorher = st.zaehler["ohne"]
    for _ in range(6):
        freezer.tick(timedelta(minutes=1))
        st.auswerten()
    await hass.async_block_till_done()
    assert st.zaehler["ohne"] == pytest.approx(vorher) and st.zaehler["mittel:h2"] == pytest.approx(2000)


async def test_pumpzeit_und_zyklen(hass: HomeAssistant, baustelle, freezer) -> None:
    st = baustelle.runtime_data
    for _ in range(3):
        hass.states.async_set("sensor.p1_power", "760")
        await hass.async_block_till_done()
        freezer.tick(timedelta(minutes=2))
        st.auswerten()
        hass.states.async_set("sensor.p1_power", "0")
        await hass.async_block_till_done()
        freezer.tick(timedelta(minutes=1))
        st.auswerten()
    await hass.async_block_till_done()
    assert st.zaehler["zyklen:p"] == 3
    assert st.zaehler["pumpzeit:p"] == pytest.approx(0.1, abs=0.02)
    assert _wert(hass, "p_pumpzyklen") == 3


async def test_abgeschlossen_zaehlt_nicht(hass: HomeAssistant, baustelle) -> None:
    hass.config_entries.async_update_entry(baustelle, options={**baustelle.options, "status": "abgeschlossen"})
    await hass.async_block_till_done()
    hass.states.async_set("sensor.hk1_energy", "15.0")
    await hass.async_block_till_done()
    assert baustelle.runtime_data.zaehler.get("energie", 0.0) == 0.0
    # Sensoren und ihre Statistik bleiben vorhanden
    assert er.async_get(hass).async_get_entity_id("sensor", DOMAIN, f"{baustelle.entry_id}_energie")


async def test_aufheizen_abkuehlen_gradstunden(hass: HomeAssistant, baustelle, freezer) -> None:
    st = baustelle.runtime_data
    hass.states.async_set("switch.hk2", "on")
    for i in range(16):  # 1 h heizen in 4-min-Schritten: 10 → 13 °C
        hass.states.async_set("sensor.c_temp", str(10.0 + i * 0.2))
        await hass.async_block_till_done()
        freezer.tick(timedelta(minutes=4))
        st.auswerten()
    assert st.zaehler["aufheiz:c"] == pytest.approx(3.0, abs=0.6)
    hass.states.async_set("switch.hk2", "off")
    await hass.async_block_till_done()
    for i in range(18):  # 72 min aus: 13 → 11,6 °C
        hass.states.async_set("sensor.c_temp", str(13.0 - i * 0.08))
        await hass.async_block_till_done()
        freezer.tick(timedelta(minutes=4))
        st.auswerten()
    assert st.zaehler["abkuehl:c"] == pytest.approx(1.2, abs=0.4)
    assert st.zaehler["gradh:c"] > 10


async def test_heiztage(hass: HomeAssistant, baustelle, freezer) -> None:
    st = baustelle.runtime_data
    hass.states.async_set("switch.hk2", "on")
    await hass.async_block_till_done()
    freezer.tick(timedelta(minutes=1))
    st.auswerten()
    assert st.zaehler.get("heiztage", 0) == 0   # AN-0011: eingeschaltet, aber kein Strom – kein Heiztag
    hass.states.async_set("sensor.hk2_power", "2000")
    await hass.async_block_till_done()
    for _ in range(3):
        freezer.tick(timedelta(minutes=1))
        st.auswerten()
    assert st.zaehler["heiztage"] == 1  # einmal je Tag, egal wie oft
    freezer.move_to("2026-11-11 08:00:00+01:00")
    st.auswerten()
    freezer.tick(timedelta(minutes=1))
    st.auswerten()
    assert st.zaehler["heiztage"] == 2


async def test_zaehler_werden_trotz_dauernder_messwerte_gespeichert(
    hass: HomeAssistant, baustelle, freezer, hass_storage
) -> None:
    """Kommen Messwerte öfter als die Speicher-Verzögerung, darf das Schreiben nicht endlos verschoben werden
    (sonst gehen die Zähler bei Stromausfall seit dem letzten Neustart verloren)."""
    from pytest_homeassistant_custom_component.common import async_fire_time_changed

    from custom_components.baustelle.steuerung import ZAEHLER_SPEICHERN_S

    key = f"baustelle.{baustelle.entry_id}"
    stand = 10.0
    for _ in range(12):  # 2 min lang alle 10 s ein neuer Zählerstand
        stand += 0.1
        hass.states.async_set("sensor.hk1_energy", f"{stand:.1f}")
        freezer.tick(timedelta(seconds=10))
        async_fire_time_changed(hass)
        await hass.async_block_till_done()
    gespeichert = hass_storage[key]["data"]["zaehler"]
    # spätestens nach ZAEHLER_SPEICHERN_S (+ ein Messintervall) liegt ein neuerer Stand in der Datei
    assert gespeichert["stand:h1"] >= stand - (ZAEHLER_SPEICHERN_S + 10) / 10 * 0.1 - 1e-9
    assert gespeichert["energie"] > 0


async def test_langer_ausfall_zaehlt(hass: HomeAssistant, baustelle, freezer) -> None:
    """BSM-003: Shelly 3 Tage nicht erreichbar, danach 60 kWh mehr – zählt (vorher über 50 kWh verworfen)."""
    st = baustelle.runtime_data
    hass.states.async_set("sensor.hk1_energy", "10.5")
    await hass.async_block_till_done()
    vorher = st.zaehler["energie"]
    hass.states.async_set("sensor.hk1_energy", "unavailable")
    await hass.async_block_till_done()
    freezer.tick(timedelta(hours=72))
    hass.states.async_set("sensor.hk1_energy", "70.5")
    await hass.async_block_till_done()
    assert st.zaehler["energie"] == pytest.approx(vorher + 60.0)
    assert st.zaehler["stand:h1:zeit"] > 0   # Zeit des letzten Stands, wie der Stand nicht in der Struktur
    # gleich danach ein unmöglicher Sprung (falscher Sensor): verworfen
    hass.states.async_set("sensor.hk1_energy", "170.5")
    await hass.async_block_till_done()
    assert st.zaehler["energie"] == pytest.approx(vorher + 60.0)


async def test_datenbank_holt_kurzen_neustart_nach(hass: HomeAssistant, baustelle, freezer) -> None:
    """HA 3 min weg, der Zähler zählt weiter (10,0 → 10,3 kWh): die erste Minute nach dem Start trägt die 300 Wh – vorher
    fehlten sie in der Datenbank (Auswertung kleiner als der Zähler an Neustart-Tagen)."""
    from pytest_homeassistant_custom_component.common import async_fire_time_changed   # noqa: PLC0415

    from .conftest import zeilen_db   # noqa: PLC0415

    async def minute() -> None:
        freezer.tick(timedelta(minutes=1))
        async_fire_time_changed(hass)
        await hass.async_block_till_done()

    await minute()
    await minute()
    assert await hass.config_entries.async_unload(baustelle.entry_id)
    await hass.async_block_till_done()
    freezer.tick(timedelta(minutes=3))
    hass.states.async_set("sensor.hk1_energy", "10.3")
    assert await hass.config_entries.async_setup(baustelle.entry_id)
    await hass.async_block_till_done()
    await minute()
    zeilen = sorted((z for z in zeilen_db(hass, "geraet_minute") if z["geraet_id"] == "h1"), key=lambda z: str(z["zeit"]))
    assert sum(z["energie_wh"] or 0 for z in zeilen) == pytest.approx(300.0)
    assert zeilen[-1]["energie_wh"] == pytest.approx(300.0)
