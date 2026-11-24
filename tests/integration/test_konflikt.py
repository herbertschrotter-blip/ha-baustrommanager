"""Namenskonflikt im Benenner lösen (Mockup mockups/namen-konflikt.html, konflikt.py): Karte des belegenden Geräts in der
Vorschau, auf Werksnamen zurücksetzen, verwaistes Gerät entfernen, nur Admins – mit echtem Entitäts- und Geräteregister."""

from __future__ import annotations

import pytest

from homeassistant.config_entries import ConfigEntryState
from homeassistant.core import HomeAssistant
from homeassistant.helpers import device_registry as dr, entity_registry as er
from pytest_homeassistant_custom_component.common import MockConfigEntry

from .test_umbenennen import _container, _senden, baustelle_register  # noqa: F401 – Fixture

BELEGT = "switch.001_01_c_plug_man"


def _fremdes_geraet(hass: HomeAssistant, *, geladen: bool = True, meldet: bool = True) -> tuple[str, MockConfigEntry]:
    """Ein fremdes Gerät mit eigenem Namen „001-01_C_PLUG_MAN“, das die Ziel-ID des Plugs hält (wie das FRITZ!-Gerät)."""
    quelle = MockConfigEntry(domain="fritzbox", title="fritz.box")
    quelle.add_to_hass(hass)
    if geladen:
        quelle.mock_state(hass, ConfigEntryState.LOADED)
    geraete, ents = dr.async_get(hass), er.async_get(hass)
    g = geraete.async_get_or_create(config_entry_id=quelle.entry_id, identifiers={("fritzbox", "dect1")}, name="FRITZ!DECT 200 Büro")
    geraete.async_update_device(g.id, name_by_user="001-01_C_PLUG_MAN")
    for domain, uid, objekt in (("switch", "dect1-s", "001_01_c_plug_man"), ("sensor", "dect1-t", "001_01_c_plug_man_temperatur")):
        e = ents.async_get_or_create(domain, "fritzbox", uid, suggested_object_id=objekt, config_entry=quelle, device_id=g.id)
        if meldet:
            hass.states.async_set(e.entity_id, "on" if domain == "switch" else "21.5")
    return g.id, quelle


@pytest.fixture(autouse=True)
def _fremde_wieder_entladen(hass: HomeAssistant):
    """Die als geladen markierte fremde Integration vor dem Aufräumen wieder auf „nicht geladen“ (sonst lädt HA sie)."""
    yield
    for e in hass.config_entries.async_entries("fritzbox"):
        e.mock_state(hass, ConfigEntryState.NOT_LOADED)


async def test_vorschau_zeigt_das_belegende_geraet(hass: HomeAssistant, baustelle_register, hass_ws_client) -> None:
    gid, _ = _fremdes_geraet(hass)
    ws = await hass_ws_client(hass)
    cid = await _container(ws, baustelle_register)
    v = await _senden(ws, 2, type="baustelle/inventar_vorschau", container_id=cid)
    assert v["success"], v
    assert v["result"]["konflikte"] == {"switch.hk1": BELEGT}
    (k,) = v["result"]["belegt_von"]
    assert k["ref"] == gid and k["art"] == "geraet" and k["name"] == "001-01_C_PLUG_MAN" and k["werksname"] == "FRITZ!DECT 200 Büro"
    assert k["trifft"] == [BELEGT] and not k["verwaist"] and k["baustelle"] is None
    assert k["werks"] == {BELEGT: "switch.fritz_dect_200_buro", "sensor.001_01_c_plug_man_temperatur": "sensor.fritz_dect_200_buro_temperatur"}
    assert k["loesungen"]["zuruecksetzen"]["ok"] and not k["loesungen"]["entfernen"]["ok"]
    assert [e["entity_id"] for e in k["entitaeten"] if e["trifft"]] == [BELEGT]


async def test_zuruecksetzen_macht_den_namen_frei(hass: HomeAssistant, baustelle_register, hass_ws_client) -> None:
    gid, _ = _fremdes_geraet(hass)
    ws = await hass_ws_client(hass)
    cid = await _container(ws, baustelle_register)
    nein = await _senden(ws, 2, type="baustelle/inventar_konflikt_loesen", ref=gid, aktion="entfernen")
    assert not nein["success"] and nein["error"]["code"] == "nicht_erlaubt" and "meldet das Gerät noch" in nein["error"]["message"]
    assert dr.async_get(hass).async_get(gid) is not None

    r = await _senden(ws, 3, type="baustelle/inventar_konflikt_loesen", ref=gid, aktion="zuruecksetzen", trifft=[BELEGT])
    assert r["success"], r
    hass.states.async_remove(BELEGT)   # im echten HA meldet die Integration den Zustand unter der neuen ID
    ents = er.async_get(hass)
    assert ents.async_get(BELEGT) is None and ents.async_get("switch.fritz_dect_200_buro") is not None
    assert dr.async_get(hass).async_get(gid).name_by_user is None
    v = await _senden(ws, 4, type="baustelle/inventar_vorschau", container_id=cid)
    assert v["result"]["konflikte"] == {} and v["result"]["belegt_von"] == []


async def test_verwaistes_geraet_entfernen_und_nur_admins(hass: HomeAssistant, baustelle_register, hass_ws_client,
                                                          hass_admin_user) -> None:
    gid, quelle = _fremdes_geraet(hass, meldet=False)   # Integration läuft, meldet das Gerät aber nicht mehr
    ws = await hass_ws_client(hass)
    cid = await _container(ws, baustelle_register)
    quelle.mock_state(hass, ConfigEntryState.SETUP_RETRY)   # startet gerade neu → kommt wieder, nicht verwaist
    v = await _senden(ws, 2, type="baustelle/inventar_vorschau", container_id=cid)
    assert not v["result"]["belegt_von"][0]["verwaist"]
    quelle.mock_state(hass, ConfigEntryState.LOADED)
    v = await _senden(ws, 3, type="baustelle/inventar_vorschau", container_id=cid)
    (k,) = v["result"]["belegt_von"]
    assert k["verwaist"] and k["loesungen"]["entfernen"]["ok"]

    r = await _senden(ws, 4, type="baustelle/inventar_konflikt_loesen", ref=gid, aktion="entfernen")
    assert r["success"], r
    await hass.async_block_till_done()
    assert dr.async_get(hass).async_get(gid) is None and er.async_get(hass).async_get(BELEGT) is None
    v = await _senden(ws, 5, type="baustelle/inventar_vorschau", container_id=cid)
    assert v["result"]["konflikte"] == {}

    hass_admin_user.groups = []   # kein Admin mehr
    nein = await _senden(ws, 6, type="baustelle/inventar_konflikt_loesen", ref=gid, aktion="zuruecksetzen")
    assert not nein["success"] and nein["error"]["code"] == "unauthorized"
