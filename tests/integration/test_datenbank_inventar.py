"""Aufbau 9 (BSM-031.02, docs/bauplan-inventar.md §2): Inventar-Tabellen, Verweise an Bereich/Gerät, Firmenkürzel und
Ansicht v_inventar – in SQLite und (mit BAUSTELLE_TEST_PG) in PostgreSQL gleich."""

from datetime import UTC, datetime
from pathlib import Path

import pytest

from sqlalchemy import create_engine, delete, insert, inspect, text
from sqlalchemy.exc import IntegrityError

from homeassistant.core import HomeAssistant

from custom_components.baustelle.db import DATA_DB, DATEI
from custom_components.baustelle.db import schema as s
from custom_components.baustelle.db.migration import migrieren

from .conftest import TEST_PG, pg_url

ZEIT = datetime(2026, 10, 8, 6, 0, tzinfo=UTC)


async def test_inventar_tabellen_und_ansicht(hass: HomeAssistant, baustelle) -> None:
    """Container mit Einsatz auf der Baustelle und Ausrüstung → v_inventar zeigt den aktuellen Einsatz und zählt nur die
    Ausrüstung, die gerade drin ist; ein beendeter Einsatz zählt nicht."""
    await hass.async_block_till_done()
    db = hass.data[DATA_DB]
    bid = baustelle.entry_id
    with db.engine.begin() as v:
        bereich = v.execute(text("SELECT id FROM bereich WHERE baustelle_id = :b LIMIT 1"), {"b": bid}).scalar()
        v.execute(insert(s.container), [
            {"id": "c-2", "nr": 2, "art": "MAN", "firma_kuerzel": None, "fremd_nr": None, "status": "aktiv", "angelegt": ZEIT},
            {"id": "c-f", "nr": None, "art": "MAN", "firma_kuerzel": "STRA", "fremd_nr": 1, "status": "aktiv", "angelegt": ZEIT},
            {"id": "c-g", "nr": None, "art": "LAG", "firma_kuerzel": "HUBE", "fremd_nr": 1, "status": "ausgeschieden", "angelegt": ZEIT}])
        v.execute(insert(s.container_einsatz), [
            {"container_id": "c-2", "von": datetime(2026, 9, 1, tzinfo=UTC), "bis": ZEIT, "baustelle_id": "alt", "bereich_id": None},
            {"container_id": "c-2", "von": ZEIT, "bis": None, "baustelle_id": bid, "bereich_id": bereich}])
        v.execute(insert(s.ausruestung), [
            {"id": "a-1", "typ": "PLUG", "kennung": "dev-1", "status": "aktiv", "angelegt": ZEIT},
            {"id": "a-2", "typ": "TEMP", "kennung": "dev-2", "status": "aktiv", "angelegt": ZEIT},
            {"id": "a-3", "typ": "PLUG", "kennung": "dev-3", "status": "defekt", "angelegt": ZEIT}])
        v.execute(insert(s.ausruestung_einsatz), [
            {"ausruestung_id": "a-1", "von": ZEIT, "bis": None, "container_id": "c-2", "gg": 1},
            {"ausruestung_id": "a-2", "von": ZEIT, "bis": None, "container_id": "c-2", "gg": None},
            {"ausruestung_id": "a-3", "von": datetime(2026, 9, 1, tzinfo=UTC), "bis": ZEIT, "container_id": "c-2", "gg": 2}])
        v.execute(text("UPDATE bereich SET container_id = 'c-2' WHERE id = :r"), {"r": bereich})
        v.execute(text("UPDATE firma SET kuerzel = 'STRA' WHERE baustelle_id = :b"), {"b": bid})
        zeilen = {r.id: r for r in v.execute(text("SELECT * FROM v_inventar"))}
    assert set(zeilen) == {"c-2", "c-f", "c-g"}
    assert (zeilen["c-2"].nr, zeilen["c-2"].art, zeilen["c-2"].baustelle_id, zeilen["c-2"].bereich_id) == (2, "MAN", bid, bereich)
    assert zeilen["c-2"].ausruestung == 2 and zeilen["c-2"].baustelle   # nur die aktuelle Ausrüstung, Titel der Baustelle
    assert zeilen["c-f"].baustelle_id is None and zeilen["c-f"].firma_kuerzel == "STRA"
    assert zeilen["c-g"].status == "ausgeschieden"


async def test_container_nummer_nur_einmal(hass: HomeAssistant, baustelle) -> None:
    """Die Nummer eines eigenen Containers gibt es nur einmal (für die ganze Datenbank); fremde ohne Nummer beliebig oft."""
    await hass.async_block_till_done()
    db = hass.data[DATA_DB]
    with db.engine.begin() as v:
        v.execute(insert(s.container).values(id="c-1", nr=1, art="POL", status="aktiv", angelegt=ZEIT))
        v.execute(insert(s.container).values(id="f-1", art="MAN", firma_kuerzel="STRA", fremd_nr=1, status="aktiv", angelegt=ZEIT))
        v.execute(insert(s.container).values(id="f-2", art="MAN", firma_kuerzel="STRA", fremd_nr=2, status="aktiv", angelegt=ZEIT))
    with pytest.raises(IntegrityError), db.engine.begin() as v:
        v.execute(insert(s.container).values(id="c-x", nr=1, art="MAN", status="aktiv", angelegt=ZEIT))


async def test_aufbau_9_nachgezogen(hass: HomeAssistant, freezer) -> None:
    """Aufbau 8 → 9 bei vorhandener Datenbank: neue Tabellen, Spalten an bereich/geraet/firma, Ansicht v_inventar;
    vorhandene Zeilen bleiben."""
    pfad = Path(hass.config.path(DATEI))
    pfad.parent.mkdir(parents=True, exist_ok=True)
    engine = create_engine(pg_url() if TEST_PG else f"sqlite:///{pfad}")
    try:
        assert migrieren(engine, None if TEST_PG else pfad) == s.SCHEMA_VERSION
        with engine.begin() as v:   # zurück auf den Stand von Aufbau 8
            v.execute(text('DROP VIEW IF EXISTS "v_inventar"'))
            for name in reversed(s.INVENTAR):
                v.execute(text(f'DROP TABLE "{name}"'))
            for tabelle, spalte in (("bereich", "container_id"), ("geraet", "ausruestung_id"), ("firma", "kuerzel")):
                v.execute(text(f'ALTER TABLE "{tabelle}" DROP COLUMN "{spalte}"'))
            v.execute(delete(s.schema_version).where(s.schema_version.c.version >= 9))
            v.execute(insert(s.instanz).values(id="i", name="Pi", angelegt=ZEIT))
            v.execute(insert(s.baustelle).values(id="b", instanz_id="i", titel="Alt", status="aktiv", angelegt=ZEIT))
            v.execute(insert(s.firma).values(baustelle_id="b", id="f", name="Huber", eigen=False))
        assert migrieren(engine, None if TEST_PG else pfad) == s.SCHEMA_VERSION   # 9 und die folgenden (wiederholbar)
        with engine.connect() as v:
            pruefen = inspect(v)
            assert set(s.INVENTAR) <= set(pruefen.get_table_names())
            assert "container_id" in {c["name"] for c in pruefen.get_columns("bereich")}
            assert "ausruestung_id" in {c["name"] for c in pruefen.get_columns("geraet")}
            assert "kuerzel" in {c["name"] for c in pruefen.get_columns("firma")}
            assert v.execute(text("SELECT COUNT(*) FROM v_inventar")).scalar() == 0
            assert v.execute(text("SELECT name FROM firma WHERE id = 'f'")).scalar() == "Huber"
            assert [r[0] for r in v.execute(text("SELECT version FROM schema_version ORDER BY version"))] == list(range(1, s.SCHEMA_VERSION + 1))
    finally:
        engine.dispose()
