"""Phase 8b (BSM-026, docs/bauplan-datenbank.md §4a, §5): Datenbank weg → nichts geht verloren. Warteschlange, nach 30 min
bzw. beim Stoppen Pufferdatei, Nachschreiben in derselben Reihenfolge – mit SQLite und (BAUSTELLE_TEST_PG) PostgreSQL."""

from datetime import UTC, date, datetime, timedelta

from sqlalchemy.exc import OperationalError

from homeassistant.core import HomeAssistant
from homeassistant.util import dt as dt_util
from pytest_homeassistant_custom_component.common import async_fire_time_changed

from custom_components.baustelle.db import DATA_DB
from custom_components.baustelle.db.schreiber import arbeit, arbeit_von, zeile_von
from custom_components.baustelle.db.verbindung import Datenbank

from .conftest import HK1, baustelle_anlegen, nur_postgres, zeilen_db


def test_arbeit_ueber_die_datei() -> None:
    a = arbeit("einfuegen", "protokoll", [{"zeit": datetime(2026, 10, 7, 6, 0, tzinfo=UTC), "tag": date(2026, 10, 7),
                                            "text": "Ä \"x\"", "werte": {"k": [1, 2.5, None]}}])
    assert arbeit_von(zeile_von(a)) == a


def _ausfall(db: Datenbank, monkeypatch) -> None:
    def weg(*_a, **_k):
        raise OperationalError("SELECT 1", {}, Exception("Verbindung weg"))

    monkeypatch.setattr(db, "_ausfuehren", weg)


async def _minuten(hass: HomeAssistant, freezer, n: int) -> None:
    for _ in range(n):
        freezer.tick(timedelta(minutes=1))
        async_fire_time_changed(hass)
        await hass.async_block_till_done()


async def test_ausfall_puffer_nachschreiben(hass: HomeAssistant, baustelle, freezer, monkeypatch) -> None:
    await hass.async_block_till_done()
    await _minuten(hass, freezer, 1)
    db, st = hass.data[DATA_DB], baustelle.runtime_data
    vorher = len([z for z in zeilen_db(hass, "geraet_minute") if z["geraet_id"] == HK1])
    _ausfall(db, monkeypatch)
    await _minuten(hass, freezer, 5)
    st.protokoll("einstellung", None, "während des Ausfalls")
    st.einstellung_setzen(("heizung", "soll"), 19.5)
    await _minuten(hass, freezer, 1)
    assert len(db.schreiber) > 0 and db.schreiber.ausgelagert == 0 and db.fehler   # erst nur Warteschlange
    await _minuten(hass, freezer, 30)                                                # > 30 min weg → Pufferdatei
    assert db.schreiber.ausgelagert > 0 and db.schreiber.puffer.exists() and db.info()["puffer"] > 0
    monkeypatch.undo()                                                               # Server wieder da
    await _minuten(hass, freezer, 1)
    await db.schreiber.async_schreiben()
    assert db.schreiber.ausgelagert == 0 and len(db.schreiber) == 0 and not db.schreiber.puffer.exists()
    minuten = [z for z in zeilen_db(hass, "geraet_minute") if z["geraet_id"] == HK1]
    assert len(minuten) == vorher + 37 and len({z["zeit"] for z in minuten}) == len(minuten)   # jede Minute genau einmal
    assert any(z["text"] == "während des Ausfalls" for z in zeilen_db(hass, "protokoll"))
    assert any(z["schluessel"] == "heizung" and '"soll": 19.5' in (z["wert"] or "") for z in zeilen_db(hass, "einstellung"))


async def test_neustart_waehrend_des_ausfalls(hass: HomeAssistant, baustelle, freezer, monkeypatch) -> None:
    """Beim Stoppen ohne Datenbank: Arbeiten in die Pufferdatei; der nächste Start schreibt sie nach."""
    await hass.async_block_till_done()
    db = hass.data[DATA_DB]
    _ausfall(db, monkeypatch)
    zeile = {"zeit": dt_util.utcnow().replace(microsecond=0), "baustelle_id": baustelle.entry_id, "bereich_id": None,
             "art": "einstellung", "text": "vor dem Neustart"}
    db.schreiber.dazu(arbeit("einfuegen", "protokoll", [zeile]))
    await db.async_stop()
    assert db.schreiber.puffer.exists() and db.schreiber.ausgelagert >= 1
    monkeypatch.undo()
    neu = Datenbank(hass, db.pfad, db.url)
    assert await neu.async_start()
    try:
        assert neu.schreiber.ausgelagert == 0 and not neu.schreiber.puffer.exists(), neu.fehler
        hass.data[DATA_DB] = neu
        assert [z["text"] for z in zeilen_db(hass, "protokoll") if z["text"] == "vor dem Neustart"] == ["vor dem Neustart"]
    finally:
        await neu.async_stop()


@nur_postgres
async def test_server_beim_start_weg(hass: HomeAssistant, freezer, monkeypatch) -> None:
    """Server beim HA-Start nicht erreichbar: die Baustelle läuft, gesammelt wird trotzdem, nach dem Wiederverbinden
    (jede Minute ein Versuch) wird nachgeschrieben."""
    echt = Datenbank._start

    def weg(self):
        raise OperationalError("connect", {}, Exception("Server weg"))

    monkeypatch.setattr(Datenbank, "_start", weg)
    entry = await baustelle_anlegen(hass, freezer)
    assert await hass.config_entries.async_setup(entry.entry_id)
    await hass.async_block_till_done()
    db = hass.data[DATA_DB]
    assert not db.bereit and db.fehler and entry.state.name == "LOADED"
    await _minuten(hass, freezer, 3)
    assert len(db.schreiber) > 0   # Minuten gesammelt, obwohl der Server fehlt
    monkeypatch.setattr(Datenbank, "_start", echt)
    await _minuten(hass, freezer, 1)   # nächster Versuch nach 60 s
    await db.schreiber.async_schreiben()
    assert db.bereit and db.fehler is None and len(db.schreiber) == 0
    assert len([z for z in zeilen_db(hass, "geraet_minute") if z["geraet_id"] == HK1]) >= 3


async def test_puffer_doppelt_und_kaputt(hass: HomeAssistant, baustelle, freezer, monkeypatch) -> None:
    """Nach einem harten Absturz: eine Minute steht schon in der Datenbank und noch im Puffer, eine Zeile ist
    abgeschnitten, eine beginnt mit Nullbytes. Nichts davon darf das Nachschreiben anhalten (16.10.2026)."""
    await hass.async_block_till_done()
    db, st = hass.data[DATA_DB], baustelle.runtime_data
    _ausfall(db, monkeypatch)
    await _minuten(hass, freezer, 3)
    st.protokoll("einstellung", None, "nach den Nullbytes")
    await db.async_stop()   # alles in die Pufferdatei
    monkeypatch.undo()
    zeilen = db.schreiber.puffer.read_text(encoding="utf-8").splitlines()
    minute = next(z for z in zeilen if z.startswith('{"name": "minute"'))
    nullbytes = next(z for z in zeilen if "nach den Nullbytes" in z)
    zeilen = [minute] + [z for z in zeilen if z != nullbytes] + ['{"name": "einfuegen", "daten": ["proto', "\x00" * 40 + nullbytes]
    db.schreiber.puffer.write_text("".join(z + "\n" for z in zeilen), encoding="utf-8")
    neu = Datenbank(hass, db.pfad, db.url)
    assert await neu.async_start()
    try:
        assert neu.schreiber.ausgelagert == 0 and not neu.schreiber.puffer.exists(), neu.fehler
        hass.data[DATA_DB] = neu
        minuten = [z for z in zeilen_db(hass, "geraet_minute") if z["geraet_id"] == HK1]
        assert len(minuten) >= 3 and len({z["zeit"] for z in minuten}) == len(minuten)   # doppelte übersprungen
        assert [z["text"] for z in zeilen_db(hass, "protokoll") if z["text"] == "nach den Nullbytes"] == ["nach den Nullbytes"]
        kaputt = neu.schreiber.puffer.with_name("kaputt.jsonl")
        assert kaputt.read_text(encoding="utf-8").splitlines() == ['{"name": "einfuegen", "daten": ["proto']
    finally:
        await neu.async_stop()


async def test_datenfehler_haelt_nicht_an(hass: HomeAssistant, baustelle) -> None:
    """Ein Vorgang mit Datenfehler wird beiseitegelegt, die anderen im selben Stapel werden geschrieben."""
    await hass.async_block_till_done()
    db = hass.data[DATA_DB]
    jetzt = dt_util.utcnow().replace(microsecond=0)
    gut = {"zeit": jetzt, "baustelle_id": baustelle.entry_id, "bereich_id": None, "art": "einstellung"}
    db.schreiber.dazu(arbeit("einfuegen", "protokoll", [gut | {"text": "davor"}]))
    db.schreiber.dazu(arbeit("einfuegen", "protokoll", [gut | {"text": None}]))   # text darf nicht leer sein
    db.schreiber.dazu(arbeit("einfuegen", "protokoll", [gut | {"text": "danach"}]))
    assert await db.schreiber.async_schreiben()
    texte = [z["text"] for z in zeilen_db(hass, "protokoll")]
    assert "davor" in texte and "danach" in texte and len(db.schreiber) == 0
    abgelehnt = db.schreiber.puffer.with_name("abgelehnt.jsonl").read_text(encoding="utf-8").splitlines()
    assert len(abgelehnt) == 1 and arbeit_von(abgelehnt[0]).daten[1][0]["text"] is None
