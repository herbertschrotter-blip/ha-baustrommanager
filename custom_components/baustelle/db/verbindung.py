"""Verbindung zur eigenen Datenbank (docs/bauplan-datenbank.md §3.1, §5).

Standard ist die SQLite-Datei `/config/baustelle/baustelle.db` (WAL, `synchronous=NORMAL`); mit `db_url` (Phase 8,
BSM-026) PostgreSQL mit TimescaleDB – mehrere Instanzen schreiben dann in dieselbe Datenbank. Alle Zugriffe laufen im
Executor von HA, nacheinander hinter einer Sperre – nie in der Ereignisschleife. Fehler der Datenbank halten die
Steuerung nie an: sie stehen in `fehler` (Diagnose-Sensor) und im Log, geschrieben wird später nach.
"""

from __future__ import annotations

from collections.abc import Callable
from datetime import datetime
import logging
from pathlib import Path
import sqlite3
import threading
from typing import Any, TypeVar

from sqlalchemy import Connection, Engine, create_engine, event, make_url

from homeassistant.core import HomeAssistant
from homeassistant.helpers.event import async_call_later
from homeassistant.util import dt as dt_util

from .migration import DatenbankNeuer, instanz_uebernehmen, leser_rechte, migrieren, stand, zeitreihen_einrichten
from .umzug import umgezogen, umziehen
from .schreiber import Schreiber

_LOGGER = logging.getLogger(__name__)
T = TypeVar("T")


def url_pruefen(url: str) -> str:
    """`postgresql://…` bzw. `postgres://…` auf den Treiber psycopg (3) stellen; andere Adressen bleiben, wie sie sind."""
    u = make_url(url)
    if u.drivername in ("postgresql", "postgres"):
        u = u.set(drivername="postgresql+psycopg")
    return u.render_as_string(hide_password=False)


def _sqlite_einstellen(verbindung: Any, _eintrag: Any) -> None:
    cursor = verbindung.cursor()
    cursor.execute("PRAGMA journal_mode=WAL")
    cursor.execute("PRAGMA synchronous=NORMAL")
    cursor.close()


class Datenbank:
    """Eine Datenbank für alle Baustellen dieser HA-Instanz."""

    def __init__(self, hass: HomeAssistant, pfad: Path, url: str | None = None) -> None:
        self.hass = hass
        self.pfad = pfad   # SQLite-Datei (Standard; bei PostgreSQL Quelle des Umzugs)
        self.url = url_pruefen(url) if url else None
        self.instanz_id: str | None = None   # HA-Instanz (setzt async_datenbank_starten); trennt Meldungen und Merker
        self.engine: Engine | None = None
        self.version: int | None = None
        self.fehler: str | None = None
        self.angehalten = False          # während einer HA-Sicherung (backup.py)
        self.letzte_schreibzeit: datetime | None = None
        self.schreiber = Schreiber(self, pfad.parent / "puffer" / "arbeiten.jsonl")
        self.abmelden: list[Callable[[], None]] = []   # Zeitgeber (Größe messen, neu verbinden)
        self._gestoppt = False
        self.groesse_server: float | None = None   # PostgreSQL: Größe der Datenbank in Byte (pg_database_size)
        self._sperre = threading.Lock()
        self.letzter_fehler: Exception | None = None

    # ------------------------------------------------------------------ Start/Stopp
    async def async_start(self) -> bool:
        await self.hass.async_add_executor_job(self.schreiber.puffer_zaehlen)
        try:
            await self.hass.async_add_executor_job(self._start)
        except Exception as err:   # noqa: BLE001 – Datenbank darf die Integration nie anhalten
            self.fehler = f"Start: {err}"
            _LOGGER.warning("Datenbank %s nicht verfügbar: %s", self.ort, err)
            if self.postgres and not isinstance(err, DatenbankNeuer):   # Server weg: jede Minute neu versuchen
                self._neu_verbinden()
            return False
        self.fehler = None
        if self.schreiber.ausgelagert:   # Puffer von vor dem Neustart nachschreiben
            await self.schreiber.async_schreiben()
        return True

    def _neu_verbinden(self) -> None:
        async def nochmal(_jetzt: datetime) -> None:
            if self._gestoppt or self.bereit:
                return
            if await self.async_start():
                _LOGGER.warning("Datenbank %s wieder erreichbar", self.ort)
                await self.schreiber.async_schreiben()

        self.abmelden.append(async_call_later(self.hass, 60, nochmal))

    def _start(self) -> None:
        if self.url is None:
            self.pfad.parent.mkdir(parents=True, exist_ok=True)
            engine = create_engine(f"sqlite:///{self.pfad}", connect_args={"check_same_thread": False})
            event.listen(engine, "connect", _sqlite_einstellen)
            with self._sperre:
                self.version = migrieren(engine, self.pfad)
                if self.instanz_id:
                    with engine.begin() as verbindung:
                        instanz_uebernehmen(verbindung, self.instanz_id)
            self.engine = engine
            return
        # PostgreSQL: Zeiten immer in UTC; tote Verbindungen vor der Nutzung erkennen (Server neu gestartet)
        engine = create_engine(self.url, pool_pre_ping=True, connect_args={"options": "-c timezone=UTC"})
        with self._sperre:
            with engine.connect() as verbindung:
                neu = stand(verbindung) == 0
            self.version = migrieren(engine, None)
            with engine.begin() as verbindung:
                zeitreihen_einrichten(verbindung)
                leser_rechte(verbindung)
                if self.instanz_id:
                    instanz_uebernehmen(verbindung, self.instanz_id)
                # Umzug je Instanz: neue Datenbank, oder eine weitere Instanz kommt in eine schon belegte dazu
                if self.pfad.exists() and self.instanz_id and not umgezogen(verbindung, self.instanz_id):
                    umziehen(self.pfad, verbindung, self.instanz_id, nummern_behalten=neu)
        self.engine = engine

    @property
    def postgres(self) -> bool:
        return self.url is not None

    @property
    def ort(self) -> str:
        """Wo die Daten liegen – ohne Passwort (Diagnose, Log)."""
        return make_url(self.url).render_as_string(hide_password=True) if self.url else str(self.pfad)

    async def async_stop(self) -> None:
        self._gestoppt = True
        while self.abmelden:
            self.abmelden.pop()()
        await self.schreiber.async_stoppen()
        if self.engine is not None:
            engine, self.engine = self.engine, None
            await self.hass.async_add_executor_job(engine.dispose)

    @property
    def bereit(self) -> bool:
        return self.engine is not None

    # ------------------------------------------------------------------ Zugriffe
    async def async_ausfuehren(self, arbeit: Callable[[Connection], T]) -> T | None:
        """`arbeit` in einer Transaktion ausführen; bei Fehler None (und `fehler` gesetzt)."""
        if self.engine is None:
            self.letzter_fehler = None
            return None
        try:
            ergebnis = await self.hass.async_add_executor_job(self._ausfuehren, arbeit)
        except Exception as err:   # noqa: BLE001
            self.fehler = str(err)
            self.letzter_fehler = err   # Schreiber: Datenfehler (beiseitelegen) oder Verbindung (warten)?
            _LOGGER.warning("Datenbank: %s", err)
            return None
        self.fehler = None
        self.letzter_fehler = None
        return ergebnis

    def _ausfuehren(self, arbeit: Callable[[Connection], T]) -> T:
        assert self.engine is not None
        with self._sperre, self.engine.begin() as verbindung:
            return arbeit(verbindung)

    async def async_kopie(self, endung: str) -> Path | None:
        """Stimmige Kopie der SQLite-Datei neben ihr (`baustelle.db.<endung>`), z. B. vor der Übernahme der Altdaten.
        Bei PostgreSQL keine Kopie – der Server sichert selbst (Betriebsanleitung)."""
        if self.engine is None or self.postgres:
            return None
        ziel = self.pfad.with_name(f"{self.pfad.name}.{endung}")
        engine = self.engine

        def kopieren() -> None:
            with self._sperre:
                roh = engine.raw_connection()
                try:
                    kopie = sqlite3.connect(ziel)
                    try:
                        roh.driver_connection.backup(kopie)   # type: ignore[union-attr]
                    finally:
                        kopie.close()
                finally:
                    roh.close()

        await self.hass.async_add_executor_job(kopieren)
        return ziel

    # ------------------------------------------------------------------ Sicherung (backup.py, §3.7)
    async def async_anhalten(self) -> None:
        """Vor einer HA-Sicherung: Warteschlange schreiben, Prüfpunkt (WAL in die Datei), dann nichts mehr schreiben."""
        await self.schreiber.async_schreiben()
        self.angehalten = True
        if self.engine is not None and not self.postgres:
            # Ergebnis abholen – sonst scheitert das Abschließen („SQL statements in progress“)
            await self.async_ausfuehren(lambda v: v.exec_driver_sql("PRAGMA wal_checkpoint(TRUNCATE)").all())

    async def async_fortsetzen(self) -> None:
        self.angehalten = False
        await self.schreiber.async_schreiben()

    # ------------------------------------------------------------------ Diagnose
    def info(self) -> dict[str, Any]:
        groesse: float | None
        if self.postgres:
            groesse = self.groesse_server   # beim Takt der Diagnose gemessen (async_groesse_messen)
        else:
            dateien = [self.pfad.with_name(n) for n in (self.pfad.name, f"{self.pfad.name}-wal")]
            groesse = float(sum(d.stat().st_size for d in dateien if d.exists()))
        return {
            "zustand": "fehler" if self.fehler else "angehalten" if self.angehalten else "ok" if self.bereit else "aus",
            "art": "postgresql" if self.postgres else "sqlite", "pfad": self.ort,
            "groesse_mb": round(groesse / 1_000_000, 2) if groesse is not None else None, "schema_version": self.version,
            "fehler": self.fehler, "warteschlange": len(self.schreiber), "puffer": self.schreiber.ausgelagert,
            "letzte_schreibzeit": self.letzte_schreibzeit.isoformat() if self.letzte_schreibzeit else None,
        }

    async def async_groesse_messen(self) -> None:
        """PostgreSQL: Größe der Datenbank für die Diagnose (bei SQLite liest `info` die Datei)."""
        if self.postgres and self.engine is not None:
            wert = await self.async_ausfuehren(
                lambda v: v.exec_driver_sql("SELECT pg_database_size(current_database())").scalar())
            if wert is not None:
                self.groesse_server = float(wert)

    def geschrieben(self) -> None:
        self.letzte_schreibzeit = dt_util.utcnow()
