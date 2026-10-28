"""Tür und Fenster offen im Tagesdiagramm: `baustelle/oeffnungen` aus dem HA-Verlauf der Kontakte (Mockup
tuer-diagramm.html, Variante A) – eigene Datei: der Recorder muss vor HA eingerichtet werden."""

import pytest

from homeassistant.core import HomeAssistant

from .conftest import C1, C2, baustelle_anlegen

TUER, FENSTER = "binary_sensor.tuer_c1", "binary_sensor.fenster_c1"


@pytest.fixture(autouse=True)
def eigene_integration(async_test_recorder, enable_custom_integrations):
    """Wie in conftest, aber den Recorder vorher vorbereiten (sonst ist HA schon eingerichtet)."""
    return


async def test_oeffnungen_aus_dem_verlauf(recorder_mock, hass: HomeAssistant, freezer, shellys, nachrichten,
                                          hass_ws_client, hass_read_only_access_token) -> None:
    from pytest_homeassistant_custom_component.components.recorder.common import async_wait_recording_done  # noqa: PLC0415
    ws = await hass_ws_client(hass)   # vor dem Zurückstellen der Uhr anmelden (sonst gilt das Token noch nicht)
    leser = await hass_ws_client(hass, hass_read_only_access_token)
    entry = await baustelle_anlegen(hass, freezer, zeit="2026-09-29 06:00:00+02:00")
    hass.states.async_set(TUER, "off")
    hass.states.async_set(FENSTER, "off")
    assert await hass.config_entries.async_setup(entry.entry_id)
    await hass.async_block_till_done()
    st = entry.runtime_data
    st.einstellung_setzen(("bereiche", C1, "tuer"), TUER)
    st.einstellung_setzen(("bereiche", C1, "symbol"), {"tueren": [{"wand": "front", "pos": 0.15, "sensor": None}],
                                                       "fenster": [{"wand": "front", "pos": 0.67, "sensor": FENSTER}]})

    async def um(uhr: str, eid: str, zustand: str, tag: str = "2026-09-29") -> None:
        freezer.move_to(f"{tag} {uhr}+02:00")
        hass.states.async_set(eid, zustand)
        await hass.async_block_till_done()

    await um("07:12:00", TUER, "on")
    await um("07:31:00", TUER, "off")
    await um("09:45:00", TUER, "on")             # prellt: 5 s
    await um("09:45:05", TUER, "off")
    await um("10:00:00", FENSTER, "on")
    await um("10:05:00", FENSTER, "unavailable")   # Funk-Aussetzer beendet die Öffnung nicht
    await um("10:30:00", FENSTER, "off")
    await um("16:08:00", TUER, "on")             # noch offen
    freezer.move_to("2026-09-29 16:20:00+02:00")
    await async_wait_recording_done(hass)

    nr = iter(range(1, 100))

    async def frage(client=ws, **felder):
        await client.send_json({"id": next(nr), "type": "baustelle/oeffnungen", "entry_id": entry.entry_id, **felder})
        return await client.receive_json()

    r = await frage(bereich=C1)
    assert r["success"], r
    assert r["result"] == {"tag": "2026-09-29", "laufend": True, "oeffnungen": [
        {"entity_id": TUER, "art": "tuer", "name": "Tür 1", "von": "07:12", "bis": "07:31", "min": 19},
        {"entity_id": FENSTER, "art": "fenster", "name": "Fenster 1", "von": "10:00", "bis": "10:30", "min": 30},
        {"entity_id": TUER, "art": "tuer", "name": "Tür 1", "von": "16:08", "bis": None, "min": 12}]}
    # Lesen dürfen alle (logik/rechte LESEN)
    assert (await frage(leser, bereich=C1))["result"]["oeffnungen"] == r["result"]["oeffnungen"]
    # ohne Kontakte: leer; unbekannter Bereich: Fehler
    assert (await frage(bereich=C2))["result"]["oeffnungen"] == []
    assert (await frage(bereich="gibt_es_nicht"))["error"]["code"] == "not_found"

    # Am nächsten Tag: gestern bis 24:00, heute seit 00:00 offen
    await um("08:00:00", FENSTER, "off", tag="2026-09-30")
    await async_wait_recording_done(hass)
    gestern = (await frage(bereich=C1, tag="2026-09-29"))["result"]
    assert gestern["laufend"] is False
    assert gestern["oeffnungen"][-1] == {"entity_id": TUER, "art": "tuer", "name": "Tür 1", "von": "16:08", "bis": "24:00", "min": 472}
    heute = (await frage(bereich=C1))["result"]
    assert heute["tag"] == "2026-09-30" and heute["oeffnungen"] == [
        {"entity_id": TUER, "art": "tuer", "name": "Tür 1", "von": "00:00", "bis": None, "min": 480}]
    assert (await frage(bereich=C1, tag="2026-10-02"))["result"]["oeffnungen"] == []   # Zukunft: nichts
