"""Eigene Datenbank, Phase 1 (docs/bauplan-datenbank.md, BSM-006): anlegen, Stammdaten spiegeln, Sicherung, Fehler."""

from datetime import timedelta
import json
from pathlib import Path
import sqlite3

import pytest

from sqlalchemy import create_engine, insert, select

from homeassistant.core import HomeAssistant
from homeassistant.helpers import entity_registry as er
from homeassistant.util import dt as dt_util
from pytest_homeassistant_custom_component.common import async_fire_time_changed

from custom_components.baustelle import backup
from custom_components.baustelle.const import DOMAIN
from custom_components.baustelle.db import DATA_DB, DATEI
from custom_components.baustelle.db import schema as s
from custom_components.baustelle.db.migration import migrieren
from custom_components.baustelle.db.schema import SCHEMA_VERSION
from custom_components.baustelle.db.uebernahme import UEBERNAHME_VERSION, async_uebernehmen

from .conftest import C1, C2, HK1, HK2, P1, SCHACHT, TEST_PG, baustelle_anlegen, eid, nur_sqlite, zeilen_db


def _zeilen(hass: HomeAssistant, tabelle: str) -> list[sqlite3.Row]:
    if TEST_PG:   # Phase 8: dieselben Prüfungen gegen PostgreSQL (Werte in SQLite-Rohdarstellung)
        return zeilen_db(hass, tabelle)   # type: ignore[return-value]
    verbindung = sqlite3.connect(hass.config.path(DATEI))
    verbindung.row_factory = sqlite3.Row
    try:
        return list(verbindung.execute(f"SELECT * FROM {tabelle}"))   # noqa: S608 – feste Tabellennamen im Test
    finally:
        verbindung.close()


async def test_angelegt_und_stammdaten(hass: HomeAssistant, baustelle) -> None:
    await hass.async_block_till_done()
    db = hass.data[DATA_DB]
    assert db.bereit and db.version == SCHEMA_VERSION and db.fehler is None
    assert TEST_PG or Path(hass.config.path(DATEI)).exists()
    assert [r["version"] for r in _zeilen(hass, "schema_version")] == list(range(1, SCHEMA_VERSION + 1))
    assert len(_zeilen(hass, "instanz")) == 1
    (b,) = _zeilen(hass, "baustelle")
    assert b["id"] == baustelle.entry_id and b["titel"] == "B1" and b["status"] == "aktiv" and b["entfernt"] is None
    bereiche = {r["id"]: r for r in _zeilen(hass, "bereich")}
    assert set(bereiche) == {C1, C2, SCHACHT} and bereiche[SCHACHT]["art"] == "pumpenschacht"
    geraete = {r["id"]: r for r in _zeilen(hass, "geraet")}
    assert set(geraete) == {HK1, HK2, P1} and geraete[P1]["rolle"] == "pumpe" and geraete[HK1]["bereich_id"] == C1
    assert all(r["entfernt"] is None for r in [*bereiche.values(), *geraete.values()])
    assert _zeilen(hass, "preis") and _zeilen(hass, "anschluss") and _zeilen(hass, "arbeitszeit")
    # Diagnose-Sensor und Diagnose-Download
    zustand = hass.states.get(eid(hass, "sensor", f"{baustelle.entry_id}_datenbank"))
    assert zustand is not None and float(zustand.state) >= 0 and zustand.attributes["zustand"] == "ok"
    assert zustand.attributes["schema_version"] == SCHEMA_VERSION


async def test_geraet_entfernt_bleibt_als_entfernt(hass: HomeAssistant, baustelle) -> None:
    await hass.async_block_till_done()
    assert hass.config_entries.async_remove_subentry(baustelle, HK2)
    await hass.async_block_till_done()
    geraete = {r["id"]: r for r in _zeilen(hass, "geraet")}
    assert geraete[HK2]["entfernt"] is not None and geraete[HK1]["entfernt"] is None   # Zeile bleibt (Messwerte)


async def test_liste_spiegelt_sofort(hass: HomeAssistant, baustelle, hass_ws_client) -> None:
    await hass.async_block_till_done()
    ws = await hass_ws_client(hass)
    await ws.send_json({"id": 1, "type": "baustelle/liste", "entry_id": baustelle.entry_id, "liste": "ausnahmen",
                        "aktion": "speichern", "eintrag": {"datum": "2026-10-02", "art": "zeiten", "von": "07:00", "bis": "12:00"}})
    assert (await ws.receive_json())["success"]
    await hass.async_block_till_done()
    (a,) = [r for r in _zeilen(hass, "ausnahme") if r["datum"] == "2026-10-02"]
    assert (a["art"], a["von"], a["bis"]) == ("zeiten", 7 * 60, 12 * 60)


async def test_sicherung_haelt_an(hass: HomeAssistant, baustelle) -> None:
    await hass.async_block_till_done()
    db = hass.data[DATA_DB]
    await backup.async_pre_backup(hass)
    assert db.angehalten and db.info()["zustand"] == "angehalten" and db.fehler is None
    assert TEST_PG or not Path(hass.config.path(DATEI) + "-wal").exists() or Path(hass.config.path(DATEI) + "-wal").stat().st_size == 0
    db.schreiber.dazu(lambda v: v.execute(insert(s.protokoll).values(
        zeit=dt_util.utcnow(), baustelle_id=baustelle.entry_id, art="einstellung", text="während der Sicherung")))
    assert not await db.schreiber.async_schreiben() and len(db.schreiber) == 1
    assert not _zeilen(hass, "protokoll")
    await backup.async_post_backup(hass)
    assert db.fehler is None, db.fehler
    assert not db.angehalten and len(db.schreiber) == 0
    assert [r["text"] for r in _zeilen(hass, "protokoll")] == ["während der Sicherung"]


@nur_sqlite
async def test_zweiter_start_aendert_nichts(hass: HomeAssistant, baustelle) -> None:
    await hass.async_block_till_done()
    engine = create_engine(f"sqlite:///{hass.config.path(DATEI)}")
    try:
        assert migrieren(engine, Path(hass.config.path(DATEI))) == SCHEMA_VERSION
        with engine.connect() as v:
            assert len(v.execute(select(s.schema_version)).all()) == SCHEMA_VERSION   # jeder Schritt einmal
    finally:
        engine.dispose()
    assert not list(Path(hass.config.path("baustelle")).glob("baustelle.db.vor-[0-9]*"))   # keine Migrationskopie ohne Migration


@nur_sqlite
async def test_neuere_datenbank_haelt_integration_nicht_an(hass: HomeAssistant, freezer, shellys, nachrichten) -> None:
    """Datenbank mit neuerem Aufbau (z. B. ältere Version eingespielt): nicht anfassen, Integration läuft, Fehler sichtbar."""
    pfad = Path(hass.config.path(DATEI))
    pfad.parent.mkdir(parents=True, exist_ok=True)
    verbindung = sqlite3.connect(pfad)
    verbindung.execute("CREATE TABLE schema_version (version INTEGER PRIMARY KEY, angewendet TIMESTAMP)")
    verbindung.execute("INSERT INTO schema_version VALUES (99, '2030-01-01')")
    verbindung.commit()
    verbindung.close()
    entry = await baustelle_anlegen(hass, freezer)
    assert await hass.config_entries.async_setup(entry.entry_id)
    await hass.async_block_till_done()
    db = hass.data[DATA_DB]
    assert not db.bereit and "99" in (db.fehler or "")
    assert entry.state.name == "LOADED"
    zustand = hass.states.get(eid(hass, "sensor", f"{entry.entry_id}_datenbank"))
    assert zustand.attributes["zustand"] == "fehler"
    assert [r["version"] for r in _zeilen(hass, "schema_version")] == [99]   # unverändert


# ---------------------------------------------------------------------- Phase 2: mitschreiben (BSM-007)
async def _minute(hass: HomeAssistant, freezer, n: int = 1) -> None:
    for _ in range(n):
        freezer.tick(timedelta(minutes=1))
        async_fire_time_changed(hass)
        await hass.async_block_till_done()


async def test_minutenwerte(hass: HomeAssistant, baustelle, freezer) -> None:
    await hass.async_block_till_done()
    await _minute(hass, freezer)   # erste (ganze) Minute ab 16:50:00
    hass.states.async_set("switch.hk1", "on")
    hass.states.async_set("sensor.hk1_power", "2000")
    freezer.tick(timedelta(seconds=30))
    hass.states.async_set("sensor.temp_c1", "21.0")
    freezer.tick(timedelta(seconds=30))
    async_fire_time_changed(hass)
    await hass.async_block_till_done()
    zeilen = [r for r in _zeilen(hass, "geraet_minute") if r["geraet_id"] == HK1]
    assert len(zeilen) == 2
    erste, zweite = zeilen
    assert erste["sekunden_ein"] == 0 and erste["dauer_s"] == 60 and erste["erreichbar"] == 1
    assert zweite["sekunden_ein"] == 60 and zweite["leistung_w"] == pytest.approx(2000.0)
    assert erste["sekunden_strom"] == 0 and zweite["sekunden_strom"] == 60   # Aufbau 4: zieht mehr als 50 W
    assert zweite["energie_wh"] == pytest.approx(2000 / 60, abs=0.01)   # ohne Energiezähler: aus der Leistung
    c1 = [r for r in _zeilen(hass, "bereich_minute") if r["bereich_id"] == C1]
    assert c1[0]["temperatur"] == pytest.approx(19.0) and c1[1]["temperatur"] == pytest.approx(20.0)
    assert c1[1]["soll"] is not None and c1[1]["zustand"]
    assert len(_zeilen(hass, "wetter_minute")) == 2 and _zeilen(hass, "wetter_minute")[0]["aussen_temp"] == pytest.approx(4.5)


async def test_prognose_nachweise_je_minute(hass: HomeAssistant, baustelle, freezer) -> None:
    """BSM-033.06 (P1): Anforderung/Sperre je Gerät, Sperre und Alter des Innenwerts je Container, Kontext als Ereignis
    nur bei Änderung. Automatik aus: keine Anforderung, keine Sperre (0, nicht NULL)."""
    await hass.async_block_till_done()
    await _minute(hass, freezer)                            # erste Minute: Start ist kein Bericht → Alter unbekannt
    hass.states.async_set("sensor.temp_c1", "19.0")         # gleicher Wert: nur Bericht (last_reported), keine Änderung
    freezer.tick(timedelta(seconds=30))
    hass.states.async_set("sensor.temp_c1", "19.0")
    freezer.tick(timedelta(seconds=30))
    async_fire_time_changed(hass)
    await hass.async_block_till_done()
    c1 = [r for r in _zeilen(hass, "bereich_minute") if r["bereich_id"] == C1]
    assert c1[0]["temp_alter_s"] is None and c1[1]["temp_alter_s"] == 30
    assert c1[1]["staffel_begrenzt_s"] == 0
    assert all(r["temp_alter_s"] is None for r in _zeilen(hass, "bereich_minute") if r["bereich_id"] == C2)   # ohne Fühler
    hk1 = [r for r in _zeilen(hass, "geraet_minute") if r["geraet_id"] == HK1]
    assert (hk1[1]["heizanforderung_s"], hk1[1]["staffel_gesperrt_s"]) == (0, 0)
    kontext = [r for r in _zeilen(hass, "ereignis") if r["art"] == "prognose_kontext"]
    assert {r["bereich_id"] for r in kontext} == {C1, C2}
    wert = json.loads(kontext[0]["wert"])
    assert set(wert) == {"grund", "zustand", "soll_c", "regelungsart", "konfiguration_id", "zeit"}
    assert wert["regelungsart"] in ("thermo", "plan") and wert["konfiguration_id"].startswith("k")
    await _minute(hass, freezer, 2)                         # nichts geändert: kein neues Kontext-Ereignis
    assert len([r for r in _zeilen(hass, "ereignis") if r["art"] == "prognose_kontext"]) == len(kontext)


async def test_beobachtung_stoert_die_auswertung_nicht(hass: HomeAssistant, baustelle, freezer, monkeypatch) -> None:
    """BSM-033.06: wirft die Prognose-Beobachtung, laufen spätere Listener und die Minute trotzdem."""
    from custom_components.baustelle.funktionen.heizung import Heizung   # noqa: PLC0415
    st = baustelle.runtime_data

    def kaputt(_self, _bid):
        raise RuntimeError("Test")
    monkeypatch.setattr(Heizung, "prognose_kontext", kaputt)
    aufrufe: list[int] = []
    st.async_add_listener(lambda: aufrufe.append(1))
    st.auswerten()
    await hass.async_block_till_done()
    assert aufrufe == [1]
    await _minute(hass, freezer)
    assert [r for r in _zeilen(hass, "geraet_minute") if r["geraet_id"] == HK1]


async def test_aufbau_10_nachgezogen_alte_zeilen_und_puffer(hass: HomeAssistant, freezer) -> None:
    """Aufbau 9 → 10: vier Spalten nullable ohne Standardwert, alte Zeilen bleiben NULL, wiederholbar; eine alte
    Schreibarbeit ohne die neuen Schlüssel (Puffer) bleibt gültig."""
    from sqlalchemy import delete, inspect, text   # noqa: PLC0415

    from custom_components.baustelle.db.migration import NACHWEISE   # noqa: PLC0415
    from custom_components.baustelle.db.schreiber import arbeit, arbeit_von, zeile_von   # noqa: PLC0415

    from .conftest import pg_url   # noqa: PLC0415
    pfad = Path(hass.config.path(DATEI))
    pfad.parent.mkdir(parents=True, exist_ok=True)
    engine = create_engine(pg_url() if TEST_PG else f"sqlite:///{pfad}")
    zeit = dt_util.parse_datetime("2026-10-11 08:00:00+00:00")
    alt_g = {"geraet_id": "g", "zeit": zeit, "baustelle_id": "b", "dauer_s": 60, "sekunden_ein": 60, "sekunden_strom": 60,
             "leistung_w": 2000.0, "leistung_w_max": 2000.0, "energie_wh": 33.3, "zaehlerstand_kwh": None, "erreichbar": True,
             "quelle": "ha"}
    alt_b = {"bereich_id": "c", "zeit": zeit, "baustelle_id": "b", "dauer_s": 60, "temperatur": 20.0, "feuchte": None,
             "soll": 21.0, "tuer_offen_s": None, "zustand": "heizt", "grund": "arbeitszeit", "quelle": "ha"}
    wetter = {"baustelle_id": "b", "zeit": zeit, "dauer_s": 60, "aussen_temp": 3.0, "regen_mm": 0, "hoechst_heute": 5.0, "quelle": "ha"}
    try:
        assert migrieren(engine, None if TEST_PG else pfad) == SCHEMA_VERSION
        with engine.begin() as v:   # zurück auf Aufbau 9 mit einer alten Minute
            for tabelle, spalte in NACHWEISE:
                v.execute(text(f'ALTER TABLE "{tabelle}" DROP COLUMN "{spalte}"'))
            v.execute(delete(s.schema_version).where(s.schema_version.c.version == 10))
            v.execute(insert(s.geraet_minute).values(geraet_id="alt", zeit=zeit, baustelle_id="b", dauer_s=60, quelle="ha"))
        assert migrieren(engine, None if TEST_PG else pfad) == SCHEMA_VERSION
        with engine.begin() as v:
            pruefen = inspect(v)
            for tabelle, spalte in NACHWEISE:
                spalten = {c["name"]: c for c in pruefen.get_columns(tabelle)}
                assert spalten[spalte]["nullable"] and spalten[spalte]["default"] is None
            assert v.execute(text("SELECT heizanforderung_s, staffel_gesperrt_s FROM geraet_minute WHERE geraet_id = 'alt'")).one() == (None, None)
            from custom_components.baustelle.db.migration import _schritt_10   # noqa: PLC0415
            _schritt_10(v)   # wiederholt: ändert nichts
            # alte Schreibarbeit (vor 0.8.133, über den Puffer) ohne die neuen Schlüssel
            arbeit_von(zeile_von(arbeit("minute", "b", [alt_g], [alt_b], wetter, [], [], zeit)))(v)
            neu_g = {**alt_g, "geraet_id": "n", "heizanforderung_s": 60, "staffel_gesperrt_s": 20}
            neu_b = {**alt_b, "bereich_id": "d", "temp_alter_s": 120, "staffel_begrenzt_s": 20}
            arbeit_von(zeile_von(arbeit("minute", "b", [neu_g], [neu_b], {**wetter, "zeit": zeit + timedelta(minutes=1)}, [], [], zeit)))(v)
            g = dict(v.execute(text("SELECT geraet_id, heizanforderung_s FROM geraet_minute WHERE geraet_id IN ('g', 'n')")).all())
            b = dict(v.execute(text("SELECT bereich_id, temp_alter_s FROM bereich_minute WHERE bereich_id IN ('c', 'd')")).all())
            assert g == {"g": None, "n": 60} and b == {"c": None, "d": 120}
    finally:
        engine.dispose()


async def test_schalten_als_ereignis_mit_quelle(hass: HomeAssistant, baustelle, freezer) -> None:
    await hass.async_block_till_done()
    hass.states.async_set("switch.hk1", "on")                              # am Gerät (ohne Benutzer)
    hass.states.async_set("switch.hk2", "unavailable")                     # nicht erreichbar
    await hass.async_block_till_done()
    await _minute(hass, freezer)
    e = [(r["geraet_id"], r["art"], r["quelle"], json.loads(r["wert"])) for r in _zeilen(hass, "ereignis")]
    assert (HK1, "schalten", "hand", {"an": True}) in e
    assert (HK2, "erreichbar", "automatik", {"erreichbar": False}) in e
    assert "benutzer" not in _zeilen(hass, "ereignis")[0].keys()          # §6: ohne Person


async def test_seite_einstellung_mit_benutzer_vor_ort_ohne(hass: HomeAssistant, baustelle, freezer, hass_ws_client, hass_admin_user) -> None:
    await hass.async_block_till_done()
    ws = await hass_ws_client(hass)
    await ws.send_json({"id": 1, "type": "baustelle/setzen", "entry_id": baustelle.entry_id, "pfad": ["heizung", "soll"], "wert": 21.5})
    assert (await ws.receive_json())["success"]
    await ws.send_json({"id": 2, "type": "baustelle/aktion", "entry_id": baustelle.entry_id, "aktion": "bedarf", "bereich": C2, "minuten": 60})
    assert (await ws.receive_json())["success"]
    await ws.send_json({"id": 3, "type": "baustelle/aktion", "entry_id": baustelle.entry_id, "aktion": "lern_reset", "bereich": C1})
    assert (await ws.receive_json())["success"]
    await _minute(hass, freezer)
    einst = {r["schluessel"]: r for r in _zeilen(hass, "einstellung")}
    assert json.loads(einst["heizung.soll"]["wert"]) == 21.5 and isinstance(einst["heizung.soll"]["wert"], str) and einst["heizung.soll"]["benutzer"] == hass_admin_user.name
    assert einst["aktion.lern_reset"]["benutzer"] == hass_admin_user.name and einst["aktion.lern_reset"]["bereich_id"] == C1
    bedarf = [r for r in _zeilen(hass, "ereignis") if r["art"] == "bedarf"]
    assert len(bedarf) == 1 and bedarf[0]["quelle"] == "seite" and bedarf[0]["bereich_id"] == C2
    assert "aktion.bedarf" not in einst                                     # vor Ort: kein Benutzer gespeichert
    assert any("heizt bis" in r["text"] for r in _zeilen(hass, "protokoll"))   # Protokoll ohne Grenze
    zustand = {r["schluessel"]: json.loads(r["wert"]) for r in _zeilen(hass, "zustand")}
    assert C2 in zustand["bedarf_bis"]                                       # Laufzeit


async def test_meldungen_in_der_datenbank(hass: HomeAssistant, baustelle, freezer, hass_ws_client) -> None:
    await hass.async_block_till_done()
    ws = await hass_ws_client(hass)
    await ws.send_json({"id": 1, "type": "baustelle/meldung", "aktion": "neu", "meldung": {"art": "wunsch", "text": "Datenbank"}})
    antwort = await ws.receive_json()
    assert antwort["success"]
    await ws.send_json({"id": 2, "type": "baustelle/meldung", "aktion": "status", "meldung_id": antwort["result"]["id"], "status": "angenommen"})
    assert (await ws.receive_json())["success"]
    await _minute(hass, freezer)
    (m,) = _zeilen(hass, "meldung")
    assert (m["ticket"], m["art"], m["status"], m["text"]) == ("WU-0001", "wunsch", "angenommen", "Datenbank")
    assert [r["status"] for r in _zeilen(hass, "meldung_verlauf")] == ["angenommen"]


@nur_sqlite
async def test_migration_von_aufbau_1(hass: HomeAssistant, freezer, shellys, nachrichten) -> None:
    """Aufbau 1 (wie auf dem Pi seit 0.8.53): Kopie bleibt, JSON-Spalten werden als Text neu angelegt, Stammdaten bleiben."""
    from sqlalchemy import JSON, MetaData, Table   # noqa: PLC0415
    pfad = Path(hass.config.path(DATEI))
    pfad.parent.mkdir(parents=True, exist_ok=True)
    engine = create_engine(f"sqlite:///{pfad}")
    alt = MetaData()
    for t in s.metadata.sorted_tables:   # Aufbau 1: dieselben Tabellen, JSON-Spalten mit Typ JSON
        Table(t.name, alt, *[c._copy() if t.name not in s.JSON_TABELLEN or c.name not in ("wert", "werte", "seite")
                             else type(c)(c.name, JSON) for c in t.columns])
    alt.create_all(engine)
    with engine.begin() as v:
        v.execute(insert(s.schema_version).values(version=1, angewendet=dt_util.utcnow()))
        v.execute(insert(s.instanz).values(id="x", name="alt", angelegt=dt_util.utcnow()))
    engine.dispose()
    entry = await baustelle_anlegen(hass, freezer)
    assert await hass.config_entries.async_setup(entry.entry_id)
    await hass.async_block_till_done()
    db = hass.data[DATA_DB]
    assert db.bereit and db.version == SCHEMA_VERSION, db.fehler
    assert [r["version"] for r in _zeilen(hass, "schema_version")] == list(range(1, SCHEMA_VERSION + 1))
    assert pfad.with_name(f"baustelle.db.vor-{SCHEMA_VERSION}").exists()
    spalten = {z[1] for z in sqlite3.connect(pfad).execute("PRAGMA table_info(tag_bereich)")}
    assert "strom_min" in spalten   # Aufbau 3
    assert "sekunden_strom" in {z[1] for z in sqlite3.connect(pfad).execute("PRAGMA table_info(geraet_minute)")}   # Aufbau 4
    assert any(r["id"] == "x" for r in _zeilen(hass, "instanz"))
    verbindung = sqlite3.connect(pfad)
    typen = {z[1]: z[2] for z in verbindung.execute("PRAGMA table_info(einstellung)")}
    verbindung.close()
    assert typen["wert"] == "TEXT"


# ---------------------------------------------------------------------- Phase 3: Altdaten (BSM-008)
async def test_uebernahme_store(hass: HomeAssistant, baustelle, freezer) -> None:
    """Ohne Recorder: Einstellungen, Zähler, Protokoll aus dem Store; Merker; zweiter Lauf gleich, ohne Doppelte."""
    await hass.async_block_till_done()
    db, st = hass.data[DATA_DB], baustelle.runtime_data
    merker = {r["schluessel"]: json.loads(r["wert"]) for r in _zeilen(hass, "zustand")}
    assert merker["uebernahme"]["version"] == UEBERNAHME_VERSION and "zaehler" in merker["zaehler_uebernahme"]
    assert TEST_PG or Path(hass.config.path(DATEI) + ".vor-uebernahme").exists()   # PostgreSQL sichert selbst
    migration = {r["schluessel"]: r["wert"] and json.loads(r["wert"]) for r in _zeilen(hass, "einstellung") if r["quelle"] == "migration"}
    assert migration["heizung"]["soll"] == st.e["heizung"]["soll"] and "protokoll" not in migration and "zaehler" not in migration
    st.protokoll("einstellung", None, "Eintrag vor dem zweiten Lauf")   # steht im Store und direkt in der Datenbank
    await db.schreiber.async_schreiben()
    protokoll = len(_zeilen(hass, "protokoll"))
    assert protokoll >= len(st.e["protokoll"]) > 0
    # schon übernommen → nichts; erzwungen → gleiches Ergebnis, keine doppelten Zeilen
    assert await async_uebernehmen(hass, db, st, dt_util.utcnow()) is None
    assert await async_uebernehmen(hass, db, st, dt_util.utcnow(), erzwingen=True) is not None, db.fehler
    assert len(_zeilen(hass, "protokoll")) == protokoll
    assert len([r for r in _zeilen(hass, "einstellung") if r["quelle"] == "migration"]) == len(migration)


async def test_uebernahme_meldungen(hass: HomeAssistant, baustelle, hass_ws_client) -> None:
    """Meldungen, die schon vor der Datenbank da waren, kommen mit der Übernahme hinein."""
    await hass.async_block_till_done()
    ws = await hass_ws_client(hass)
    await ws.send_json({"id": 1, "type": "baustelle/meldung", "aktion": "neu", "meldung": {"art": "fehler", "text": "alt"}})
    assert (await ws.receive_json())["success"]
    db, st = hass.data[DATA_DB], baustelle.runtime_data
    await db.async_ausfuehren(lambda v: v.execute(s.meldung.delete()))   # wie vor 0.8.54: nicht in der Datenbank
    assert not _zeilen(hass, "meldung")
    ergebnis = await async_uebernehmen(hass, db, st, dt_util.utcnow(), erzwingen=True)
    assert ergebnis is not None and ergebnis["meldung"] == 1
    assert [r["text"] for r in _zeilen(hass, "meldung")] == ["alt"]



# ---------------------------------------------------------------------- Phase 4: Tagessummen (BSM-009)
async def test_tagessummen_viertelstuendlich(hass: HomeAssistant, baustelle, freezer, hass_ws_client) -> None:
    await hass.async_block_till_done()
    st = baustelle.runtime_data
    await _minute(hass, freezer)                      # 16:51
    hass.states.async_set("switch.hk1", "on")
    hass.states.async_set("sensor.hk1_power", "2000")
    await _minute(hass, freezer, 9)                   # bis 17:00 – Viertelstunde → Tagessummen
    zeilen = {r["geraet_id"]: r for r in _zeilen(hass, "tag_geraet")}
    hk1 = zeilen[HK1]
    assert hk1["datum"] == "2026-09-29" and hk1["heizzeit_min"] == pytest.approx(9.0) and hk1["zyklen"] == 1
    assert hk1["kwh"] == pytest.approx(2 * 9 / 60, abs=0.01) and hk1["eur"] == pytest.approx(hk1["kwh"] * st.preis_am(dt_util.now().date()), abs=1e-4)
    c1 = {r["bereich_id"]: r for r in _zeilen(hass, "tag_bereich")}[C1]
    assert c1["heizzeit_min"] == pytest.approx(9.0) and c1["heiztag"] == 1 and c1["firma_id"] == "eigen"
    assert c1["temp_mittel"] == pytest.approx(19.0) and c1["gradh"] > 0
    # Diagnose enthält den Abgleich mit der HA-Statistik (ohne Recorder: nur die Datenbank-Seite)
    from custom_components.baustelle.diagnostics import async_get_config_entry_diagnostics  # noqa: PLC0415
    diag = await async_get_config_entry_diagnostics(hass, baustelle)
    assert any(z["bereich"] == "Container 1" and z["datenbank_kwh"] for z in diag["datenbank"]["abgleich"])
    stand = diag["datenbank"]["stand"]   # BSM-027: Datenbank-Stand der Baustelle
    assert stand["zeilen"]["geraet_minute"] > 0 and stand["zeilen"]["tag_bereich"] >= 1 and stand["minuten_von"] <= stand["minuten_bis"]
    assert stand["instanz"] and "zeilen" in stand and diag["datenbank"]["schema_version"] == SCHEMA_VERSION


# ---------------------------------------------------------------------- Phase 5: Statistik aus der Datenbank (BSM-014)
async def test_statistik_aus_der_datenbank(hass: HomeAssistant, baustelle, freezer, hass_ws_client) -> None:
    """baustelle/statistik antwortet wie recorder/statistics_during_period – aus Minuten (hour) und Tagessummen (day)."""
    await hass.async_block_till_done()
    st = baustelle.runtime_data
    reg = er.async_get(hass)
    e_c1 = reg.async_get_entity_id("sensor", DOMAIN, f"{C1}_energie")
    h_c1 = reg.async_get_entity_id("sensor", DOMAIN, f"{C1}_heizzeit")
    s_c1 = reg.async_get_entity_id("sensor", DOMAIN, f"{C1}_heizzeit_strom")
    ohne = reg.async_get_entity_id("sensor", DOMAIN, f"{baustelle.entry_id}_energie_ohne_automatik")
    await _minute(hass, freezer)                      # 16:51
    hass.states.async_set("switch.hk1", "on")
    hass.states.async_set("sensor.hk1_power", "1800")
    await _minute(hass, freezer, 10)                  # 10 Minuten heizen bis 17:01
    ws = await hass_ws_client(hass)

    async def frage(periode: str, ids: list[str]) -> dict:
        await ws.send_json({"id": frage.n, "type": "baustelle/statistik", "start_time": "2026-09-29T00:00:00+02:00",
                            "end_time": "2026-09-30T00:00:00+02:00", "statistic_ids": ids, "period": periode,
                            "types": ["change", "mean"], "entry_id": baustelle.entry_id})
        frage.n += 1
        antwort = await ws.receive_json()
        assert antwort["success"], antwort
        return antwort["result"]
    frage.n = 1

    stunde = await frage("hour", [e_c1, h_c1, s_c1, "sensor.temp_c1", ohne])
    heiz = {dt_util.utc_from_timestamp(p["start"]).hour: p["change"] for p in stunde[h_c1]}
    assert heiz[14] == pytest.approx(9 / 60, abs=0.01) and heiz[15] == pytest.approx(1 / 60, abs=0.01)   # 16:51–17:01 Ortszeit
    assert sum(p["change"] for p in stunde[e_c1]) == pytest.approx(1.8 * 10 / 60, abs=0.01)
    assert sum(p["change"] for p in stunde[s_c1]) == pytest.approx(10 / 60, abs=0.01)
    assert all(p["mean"] == pytest.approx(19.0) for p in stunde["sensor.temp_c1"])
    assert ohne not in stunde                         # kennt die Datenbank nicht → HA-Statistik (hier ohne Recorder: leer)
    tag = await frage("day", [e_c1, h_c1])
    assert len(tag[e_c1]) == 1 and tag[e_c1][0]["change"] == pytest.approx(0.3, abs=0.01)
    assert tag[h_c1][0]["change"] == pytest.approx(10 / 60, abs=0.01)
    assert (await frage("5minute", [e_c1]))[e_c1] == []   # die laufende Stunde hat die Datenbank schon
    # Rückweg: auswertung_quelle = statistik → nicht aus der Datenbank
    st.einstellung_setzen(("auswertung_quelle",), "statistik")
    assert e_c1 not in await frage("hour", [e_c1])


async def test_verlauf_jeder_messwert(hass: HomeAssistant, baustelle, freezer, hass_ws_client) -> None:
    """BSM-014 Schritt 2: jeder Wert der Leistung in der Datenbank; baustelle/verlauf antwortet wie history (minimal)."""
    await hass.async_block_till_done()
    werte = ["1500", "1800", "0", "1750"]
    for w in werte:
        hass.states.async_set("sensor.hk1_power", w)
        freezer.tick(timedelta(seconds=7))
    hass.states.async_set("switch.hk1", "on")
    await _minute(hass, freezer, 2)
    mw = [r for r in _zeilen(hass, "messwert") if r["geraet_id"] == HK1]
    assert [r["leistung_w"] for r in mw] == [1500.0, 1800.0, 0.0, 1750.0]
    ws = await hass_ws_client(hass)
    await ws.send_json({"id": 1, "type": "baustelle/verlauf", "start_time": "2026-09-29T16:00:00+02:00",
                        "end_time": "2026-09-29T18:00:00+02:00", "entity_ids": ["sensor.hk1_power", "switch.hk1"],
                        "minimal_response": True, "no_attributes": True, "significant_changes_only": False, "entry_id": baustelle.entry_id})
    antwort = await ws.receive_json()
    assert antwort["success"], antwort
    leistung = antwort["result"]["sensor.hk1_power"]
    assert [p["s"] for p in leistung] == werte and all(isinstance(p["lu"], float) for p in leistung)
    assert [p["s"] for p in antwort["result"]["switch.hk1"]][-1] == "on"     # Schalter aus den Minuten


# ---------------------------------------------------------------------- Phase 6: Store abgelöst (BSM-015)
async def test_umstellung_und_laden_aus_der_datenbank(hass: HomeAssistant, baustelle, freezer, hass_storage) -> None:
    """Erster Start: Stand aus dem Store wird Ausgangsstand (Merker); danach lädt die Integration aus der Datenbank."""
    await hass.async_block_till_done()
    st = baustelle.runtime_data
    assert st.einstellungen.quelle == "store"   # erster Start: noch aus dem Store
    await st.einstellungen.async_jetzt_speichern()
    zustand = {r["schluessel"]: r for r in _zeilen(hass, "zustand")}
    assert "speicher_db" in zustand and "zaehler" in zustand
    assert {r["schluessel"] for r in _zeilen(hass, "einstellung") if r["quelle"] == "umstellung"} >= {"heizung", "arbeitszeiten"}
    # Einstellung ändern, Store-Datei entfernen, neu laden: der Wert kommt aus der Datenbank
    st.einstellung_setzen(("heizung", "soll"), 22.5)
    st.zaehler["energie"] = 12.34
    await st.einstellungen.async_jetzt_speichern()
    hass_storage.pop(f"baustelle.{baustelle.entry_id}", None)
    assert await hass.config_entries.async_reload(baustelle.entry_id)
    await hass.async_block_till_done()
    neu = baustelle.runtime_data
    assert neu.einstellungen.quelle == "datenbank"
    assert neu.e["heizung"]["soll"] == 22.5 and neu.zaehler["energie"] == pytest.approx(12.34)


async def test_ohne_datenbank_store_kopie(hass: HomeAssistant, baustelle, freezer) -> None:
    """Datenbank nicht lesbar: die Integration lädt aus der Store-Kopie (Rückweg, §5)."""
    await hass.async_block_till_done()
    st = baustelle.runtime_data
    st.einstellung_setzen(("heizung", "soll"), 21.7)
    await st.einstellungen.async_jetzt_speichern()
    db = hass.data[DATA_DB]
    engine, db.engine = db.engine, None   # wie „nicht erreichbar“
    try:
        assert await hass.config_entries.async_reload(baustelle.entry_id)
        await hass.async_block_till_done()
        assert baustelle.runtime_data.einstellungen.quelle == "store"
        assert baustelle.runtime_data.e["heizung"]["soll"] == 21.7
    finally:
        db.engine = engine


async def test_meldungen_nummern_aus_der_datenbank(hass: HomeAssistant, baustelle, hass_ws_client) -> None:
    await hass.async_block_till_done()
    ws = await hass_ws_client(hass)
    for i, art in enumerate(["fehler", "fehler", "wunsch"], start=1):
        await ws.send_json({"id": i, "type": "baustelle/meldung", "aktion": "neu", "meldung": {"art": art, "text": f"M{i}"}})
        assert (await ws.receive_json())["success"]
    await hass.data[DATA_DB].schreiber.async_schreiben()
    from custom_components.baustelle.einstellungen import Meldungen  # noqa: PLC0415
    frisch = Meldungen(hass)   # wie nach einem Neustart: aus der Datenbank
    liste = await frisch.async_laden()
    assert [m["ticket"] for m in liste] == ["WU-0001", "FE-0002", "FE-0001"] and liste[0]["text"] == "M3"
    assert frisch.neue_nummer("fehler") == "FE-0003"


async def test_protokoll_ohne_grenze(hass: HomeAssistant, baustelle, hass_ws_client) -> None:
    await hass.async_block_till_done()
    st = baustelle.runtime_data
    basis = dt_util.now() - timedelta(days=2)
    for i in range(1100):
        st.protokoll("einstellung", None, f"P{i:04d}", zeit=basis + timedelta(seconds=i))
    ws = await hass_ws_client(hass)
    await ws.send_json({"id": 1, "type": "baustelle/protokoll", "entry_id": baustelle.entry_id, "filter": "einstellung",
                        "vor": (basis + timedelta(seconds=50)).isoformat(), "limit": 1000})
    antwort = await ws.receive_json()
    texte = [e[3] for e in antwort["result"] if e[3].startswith("P")]
    assert texte[:3] == ["P0049", "P0048", "P0047"] and texte[-1] == "P0000"   # älter als die 1.000 im Speicher
    assert len(st.e["protokoll"]) == 1000
