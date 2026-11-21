"""Tests gegen Home Assistant (pytest-homeassistant-custom-component, Python 3.14+)."""

from __future__ import annotations

from datetime import date, datetime
import json
import os
from pathlib import Path
from typing import Any

import pytest

from homeassistant.config_entries import ConfigSubentryDataWithId
from homeassistant.core import HomeAssistant, ServiceCall
from homeassistant.helpers import entity_registry as er
from pytest_homeassistant_custom_component.common import MockConfigEntry
from pytest_homeassistant_custom_component.plugins import aiohttp_client  # noqa: F401
# ↑ fest die Fixture von HA (Router bleibt nach dem Start offen): pytest-aiohttp bringt eine gleichnamige mit, die den
#   Router sperrt; welche gewinnt, hing von der Ladereihenfolge der Plugins ab (CI: „frozen router“, 72 Tests rot)

from custom_components.baustelle.const import DOMAIN

pytest_plugins = ["pytest_homeassistant_custom_component"]

C1, C2, SCHACHT, HK1, HK2, P1 = "sub_c1", "sub_c2", "sub_schacht", "sub_hk1", "sub_hk2", "sub_p1"


@pytest.fixture(autouse=True)
def eigene_integration(enable_custom_integrations):
    """custom_components/baustelle laden lassen."""
    return


# Phase 8 (BSM-026): mit BAUSTELLE_TEST_PG (Verwaltungs-Adresse eines Test-PostgreSQL, tools/pg-test.sh) laufen alle
# Integrationstests gegen PostgreSQL – je Test eine frische Datenbank „baustelle_test“; ohne die Variable SQLite.
# Parallel mit pytest-xdist (-n 4): je Worker eigene Test-Datenbanken (Name mit _gw0 …) und je Test ein eigener
# Konfigurationsordner (hass_config_dir unten).
TEST_PG = os.environ.get("BAUSTELLE_TEST_PG")
WORKER = os.environ.get("PYTEST_XDIST_WORKER", "")
nur_sqlite = pytest.mark.skipif(bool(TEST_PG), reason="prüft die SQLite-Datei selbst")
nur_postgres = pytest.mark.skipif(not TEST_PG, reason="braucht BAUSTELLE_TEST_PG (tools/pg-test.sh)")


def _je_worker(name: str) -> str:
    return f"{name}_{WORKER}" if WORKER else name


def pg_url(name: str = "baustelle_test") -> str:
    from sqlalchemy import make_url   # noqa: PLC0415
    return make_url(TEST_PG).set(database=_je_worker(name)).render_as_string(hide_password=False)


def pg_frisch(name: str = "baustelle_test") -> str:
    """Leere Test-Datenbank anlegen (eine vorhandene wird verworfen); liefert ihre Adresse."""
    from sqlalchemy import create_engine, text   # noqa: PLC0415
    engine = create_engine(TEST_PG, isolation_level="AUTOCOMMIT")
    try:
        with engine.connect() as v:
            v.execute(text(f'DROP DATABASE IF EXISTS "{_je_worker(name)}" WITH (FORCE)'))
            v.execute(text(f'CREATE DATABASE "{_je_worker(name)}"'))
    finally:
        engine.dispose()
    return pg_url(name)


@pytest.fixture
def hass_config_dir(hass_tmp_config_dir: str) -> str:
    """Je Test ein eigener Konfigurationsordner (Kopie des Test-Ordners): die eigene Datenbank, der Puffer und die
    Meldungen liegen dort – nichts aufzuräumen, Tests laufen parallel (pytest-xdist) ohne sich zu stören."""
    return hass_tmp_config_dir


@pytest.fixture(autouse=True)
def leere_datenbank(monkeypatch):
    """Die SQLite-Datei liegt im eigenen Konfigurationsordner des Tests (oben), ist also jedes Mal neu. Ohne `hass` als
    Fixture, damit Tests mit `recorder_mock` den Recorder vor HA einrichten können. Mit TEST_PG startet die Integration
    auf einer frischen PostgreSQL-Datenbank (wie mit `db_url` in YAML)."""
    if TEST_PG:
        import custom_components.baustelle as integration   # noqa: PLC0415
        url, starten = pg_frisch(), integration.async_datenbank_starten

        async def mit_postgres(hass: HomeAssistant, eigene: str | None = None) -> Any:
            return await starten(hass, eigene or url)

        monkeypatch.setattr(integration, "async_datenbank_starten", mit_postgres)
    yield


def roh(wert: Any) -> Any:
    """Wert so, wie ihn sqlite3 aus der SQLite-Datei liest (Tests vergleichen mit dieser Darstellung)."""
    if isinstance(wert, datetime):
        if wert.tzinfo is not None:
            from datetime import UTC   # noqa: PLC0415
            wert = wert.astimezone(UTC).replace(tzinfo=None)
        return wert.strftime("%Y-%m-%d %H:%M:%S.%f")
    if isinstance(wert, date):
        return wert.isoformat()
    if isinstance(wert, bool):
        return int(wert)
    if isinstance(wert, (dict, list)):
        return json.dumps(wert, ensure_ascii=False)
    return wert


def zeilen_db(hass: HomeAssistant, tabelle: str) -> list[dict[str, Any]]:
    """Alle Zeilen einer Tabelle der eigenen Datenbank in SQLite-Rohdarstellung – auch bei PostgreSQL."""
    from sqlalchemy import select   # noqa: PLC0415

    from custom_components.baustelle.db import DATA_DB, schema as s   # noqa: PLC0415
    from sqlalchemy import JSON   # noqa: PLC0415
    t = s.metadata.tables[tabelle]
    json_spalten = {c.name for c in t.columns if isinstance(c.type, JSON)}   # in SQLite Text – auch einzelne Zahlen

    def wert(k: str, w: Any) -> Any:
        return None if w is None else json.dumps(w, ensure_ascii=False) if k in json_spalten else roh(w)

    with hass.data[DATA_DB].engine.connect() as v:
        return [{c.name: wert(c.name, z._mapping[c.name]) for c in t.columns} for z in v.execute(select(t))]


def sub(sid, typ, title, data) -> ConfigSubentryDataWithId:
    return ConfigSubentryDataWithId(subentry_id=sid, subentry_type=typ, title=title, unique_id=None, data=data)


def eid(hass, platform, unique_id) -> str:
    reg = er.async_get(hass)
    entity_id = reg.async_get_entity_id(platform, DOMAIN, unique_id)
    assert entity_id, (unique_id, sorted((e.domain, e.unique_id) for e in reg.entities.values()))
    return entity_id


class FakeShellys:
    """Shellys als Dienste switch.turn_on/turn_off, die den Zustand setzen (wie ein echtes Gerät)."""

    def __init__(self, hass: HomeAssistant) -> None:
        self.hass = hass
        self.aufrufe: list[tuple[str, str]] = []
        self.leistung: dict[str, str] = {}  # Schalter → Leistungssensor, der beim Einschalten Watt zeigt
        self.watt: dict[str, float] = {}

    def anmelden(self) -> None:
        """Nach dem Einrichten anmelden (die switch-Komponente meldet sonst ihre eigenen Dienste darüber an)."""
        self.hass.services.async_register("switch", "turn_on", self._ein)
        self.hass.services.async_register("switch", "turn_off", self._aus)

    async def _ein(self, call: ServiceCall) -> None:
        self._setzen(call, "on")

    async def _aus(self, call: ServiceCall) -> None:
        self._setzen(call, "off")

    def _setzen(self, call: ServiceCall, zustand: str) -> None:
        ids = call.data["entity_id"]
        for entity_id in [ids] if isinstance(ids, str) else ids:
            self.aufrufe.append((entity_id, zustand))
            self.hass.states.async_set(entity_id, zustand, context=call.context)
            if entity_id in self.leistung:
                watt = self.watt.get(entity_id, 2000.0) if zustand == "on" else 0.0
                self.hass.states.async_set(self.leistung[entity_id], str(watt))

    def ein(self) -> list[str]:
        return [e for e, z in self.aufrufe if z == "on"]

    def aus(self) -> list[str]:
        return [e for e, z in self.aufrufe if z == "off"]


STANDARD_ZUSTAND: dict[str, Any] = {
    "switch.hk1": "off", "switch.hk2": "off", "switch.p1": "on",
    "sensor.hk1_power": "0", "sensor.hk2_power": "0", "sensor.p1_power": "760",
    "sensor.temp_c1": "19.0", "sensor.aussen": "4.5", "sensor.regen": "0",
}


async def baustelle_anlegen(hass: HomeAssistant, freezer, zeit: str = "2026-09-29 16:50:00+02:00", hk2_bereich: str = C2, **optionen):
    await hass.config.async_set_time_zone("Europe/Vienna")
    freezer.move_to(zeit)
    for entity_id, wert in STANDARD_ZUSTAND.items():
        hass.states.async_set(entity_id, wert)
    entry = MockConfigEntry(
        domain=DOMAIN, title="B1", data={"name": "B1"},
        options={"heizung": True, "pumpen": True, "status": "aktiv", "beginn": "2026-09-01",
                 "heizperiode_von": "10", "heizperiode_bis": "4", "empfaenger": ["mobile_app_test"],
                 "temp_sensor": "sensor.aussen", "regen_sensor": "sensor.regen", **optionen},
        subentries_data=[
            sub(C1, "bereich", "Container 1", {"name": "Container 1", "art": "container", "fuehler": "sensor.temp_c1"}),
            sub(C2, "bereich", "Container 2", {"name": "Container 2", "art": "container"}),
            sub(SCHACHT, "bereich", "Schacht", {"name": "Schacht", "art": "pumpenschacht"}),
            sub(HK1, "geraet", "Heizkörper 1", {"bereich": C1, "schalter": "switch.hk1", "name": "Heizkörper 1",
                                                "rolle": "heizkoerper", "typ": "oelradiator", "leistung": "sensor.hk1_power"}),
            sub(HK2, "geraet", "Heizkörper 2", {"bereich": hk2_bereich, "schalter": "switch.hk2", "name": "Heizkörper 2",
                                                "rolle": "heizkoerper", "typ": "konvektor", "leistung": "sensor.hk2_power"}),
            sub(P1, "geraet", "Pumpe 1", {"bereich": SCHACHT, "schalter": "switch.p1", "name": "Pumpe 1",
                                          "rolle": "pumpe", "typ": "konvektor", "leistung": "sensor.p1_power"}),
        ],
    )
    entry.add_to_hass(hass)
    return entry


@pytest.fixture
async def shellys(hass: HomeAssistant) -> FakeShellys:
    fake = FakeShellys(hass)
    fake.leistung = {"switch.hk1": "sensor.hk1_power", "switch.hk2": "sensor.hk2_power"}
    return fake


@pytest.fixture
def nachrichten(hass: HomeAssistant) -> list[ServiceCall]:
    aufrufe: list[ServiceCall] = []

    async def merken(call: ServiceCall) -> None:
        aufrufe.append(call)

    hass.services.async_register("notify", "mobile_app_test", merken)
    return aufrufe


@pytest.fixture
async def baustelle(hass: HomeAssistant, freezer, shellys, nachrichten):
    """Baustelle B1 am Dienstag 29.09.2026 16:50 (Arbeitszeit Mo–Do 07:00–16:30), Automatik aus."""
    entry = await baustelle_anlegen(hass, freezer)
    assert await hass.config_entries.async_setup(entry.entry_id)
    await hass.async_block_till_done()
    shellys.anmelden()
    entry.runtime_data.auswerten()
    await hass.async_block_till_done()
    return entry
