"""Warteschlange der Schreibvorgänge mit Puffer auf der Platte (docs/bauplan-datenbank.md §3.1, §5; Phase 8b, BSM-026).

Schreibarbeiten werden gesammelt und in **einem** Schreibvorgang ausgeführt. Eine Arbeit ist ein Name aus `ARBEITEN`
mit ihren Daten (`Arbeit`) – so lässt sie sich auf die Platte legen und später genau so ausführen (auch Ersetzen und
Ändern vorhandener Zeilen). Während einer HA-Sicherung oder ohne erreichbare Datenbank bleiben die Arbeiten in der
Warteschlange; ab `MAX_OFFEN` Arbeiten, nach `AUSLAGERN_NACH` ohne Datenbank und beim Stoppen kommen sie in die
Pufferdatei (`puffer/arbeiten.jsonl` neben der SQLite-Datei, eine Arbeit je Zeile). Sobald wieder geschrieben werden
kann, wird zuerst der Puffer (älter) und dann die Warteschlange nachgeschrieben, in der ursprünglichen Reihenfolge.

Ein einzelner schlechter Vorgang hält nie alles an: Minuten, die schon in der Datenbank stehen (nach einem Absturz doppelt
im Puffer), werden übersprungen; scheitert ein Stapel an einem Datenfehler, wird Vorgang für Vorgang geschrieben und nur
der schlechte nach `puffer/abgelehnt.jsonl` gelegt; unlesbare Pufferzeilen (abgeschnitten, Nullbytes) kommen nach
`puffer/kaputt.jsonl` – jeweils mit Warnung im Log.
"""

from __future__ import annotations

import asyncio
from collections.abc import Callable
from dataclasses import dataclass
from datetime import date, datetime, timedelta
import json
import logging
import os
from pathlib import Path
from functools import partial
from typing import TYPE_CHECKING, Any

from sqlalchemy import Connection, Insert, Table
from sqlalchemy.exc import DataError, IntegrityError

from homeassistant.util import dt as dt_util

if TYPE_CHECKING:
    from .verbindung import Datenbank

_LOGGER = logging.getLogger(__name__)
MAX_OFFEN = 10_000
AUSLAGERN_NACH = timedelta(minutes=30)
STAPEL = 2_000   # Arbeiten je Schreibvorgang beim Nachschreiben aus dem Puffer

ARBEITEN: dict[str, Callable[..., object]] = {}


def schreibarbeit(name: str) -> Callable[[Callable[..., object]], Callable[..., object]]:
    """Funktion `f(verbindung, *daten)` als Schreibarbeit anmelden (Name bleibt fest – er steht im Puffer)."""
    def anmelden(f: Callable[..., object]) -> Callable[..., object]:
        ARBEITEN[name] = f
        return f
    return anmelden


@dataclass(frozen=True)
class Arbeit:
    """Eine Schreibarbeit: Name aus `ARBEITEN` und ihre Daten (JSON mit Zeiten und Tagen)."""

    name: str
    daten: tuple[Any, ...]

    def __call__(self, verbindung: Connection) -> object:
        if self.name not in ARBEITEN:
            _anmelden()
        return ARBEITEN[self.name](verbindung, *self.daten)


def _anmelden() -> None:
    """Module mit Schreibarbeiten laden (melden sich beim Import an) – auch wenn sie sonst noch niemand importiert hat,
    z. B. beim Nachschreiben des Puffers gleich nach dem Start."""
    from . import mitschreiben, speicher, stammdaten   # noqa: F401, PLC0415


def arbeit(name: str, *daten: Any) -> Arbeit:
    return Arbeit(name, daten)


@schreibarbeit("einfuegen")
def einfuegen(v: Connection, tabelle: str, zeilen: list[dict[str, Any]]) -> None:
    """Zeilen in eine Tabelle einfügen (Messwerte, Ereignisse, Protokoll, Einstellungen)."""
    from sqlalchemy import insert   # noqa: PLC0415

    from .schema import metadata   # noqa: PLC0415
    v.execute(insert(metadata.tables[tabelle]), zeilen)


def _einmal(werk: Werk, v: Connection) -> bool:
    """Ein Vorgang für sich (`_einzeln`): True, wenn er durchlief."""
    werk(v)
    return True


def ohne_doppelte(v: Connection, tabelle: Table) -> Insert:
    """Einfügen, das eine schon vorhandene Zeile (gleicher Schlüssel) überspringt statt zu scheitern."""
    if v.dialect.name == "postgresql":
        from sqlalchemy.dialects.postgresql import insert as pg_insert   # noqa: PLC0415
        return pg_insert(tabelle).on_conflict_do_nothing()
    from sqlalchemy.dialects.sqlite import insert as sqlite_insert   # noqa: PLC0415
    return sqlite_insert(tabelle).on_conflict_do_nothing()


def datenfehler(err: BaseException | None) -> bool:
    """Liegt es am Vorgang selbst (Daten), nicht an der Verbindung? Dann hilft Warten nicht – beiseitelegen."""
    return isinstance(err, (IntegrityError, DataError, KeyError, TypeError, ValueError))


# ---------------------------------------------------------------------- JSON mit Zeiten (Puffer)
def _kodieren(w: Any) -> Any:
    if isinstance(w, datetime):
        return {"$zeit": w.isoformat()}
    if isinstance(w, date):
        return {"$tag": w.isoformat()}
    if isinstance(w, dict):
        return {k: _kodieren(x) for k, x in w.items()}
    if isinstance(w, (list, tuple)):
        return [_kodieren(x) for x in w]
    return w


def _dekodieren(w: Any) -> Any:
    if isinstance(w, dict):
        if set(w) == {"$zeit"}:
            return datetime.fromisoformat(w["$zeit"])
        if set(w) == {"$tag"}:
            return date.fromisoformat(w["$tag"])
        return {k: _dekodieren(x) for k, x in w.items()}
    if isinstance(w, list):
        return [_dekodieren(x) for x in w]
    return w


def zeile_von(a: Arbeit) -> str:
    return json.dumps({"name": a.name, "daten": _kodieren(list(a.daten))}, ensure_ascii=False)


def arbeit_von(zeile: str) -> Arbeit:
    d = json.loads(zeile.strip("\x00"))   # Nullbytes vor einer Zeile: Datei bei einem harten Absturz nicht fertig geschrieben
    return Arbeit(d["name"], tuple(_dekodieren(d["daten"])))


Werk = Arbeit | Callable[[Connection], object]   # Callable nur für Tests/kurzlebige Arbeiten (nicht auf die Platte)


class Schreiber:
    """Gesammelte Schreibarbeiten einer Datenbank."""

    def __init__(self, db: Datenbank, puffer: Path | None = None) -> None:
        self._db = db
        self._offen: list[Werk] = []
        self._sperre = asyncio.Lock()   # wer schreiben will, wartet auf einen laufenden Schreibvorgang (sonst „fertig“ zu früh)
        self.puffer = puffer            # Pufferdatei (None: nur im Speicher)
        self.fehler_seit: datetime | None = None
        self.ausgelagert = 0            # Arbeiten in der Pufferdatei (Diagnose)
        self._auslagern_geplant = False

    def __len__(self) -> int:
        return len(self._offen)

    def dazu(self, werk: Werk) -> None:
        self._offen.append(werk)
        if len(self._offen) > MAX_OFFEN and not self._auslagern_geplant:
            self._auslagern_geplant = True
            self._db.hass.async_create_background_task(self._async_auslagern(), "baustelle_datenbank_puffer")

    async def _async_auslagern(self) -> None:
        async with self._sperre:
            self._auslagern_geplant = False
            if len(self._offen) > MAX_OFFEN:
                await self._auslagern()

    async def async_schreiben(self) -> bool:
        """Alles Offene (zuerst den Puffer) schreiben; False, wenn es (noch) nicht ging. Kehrt erst zurück, wenn auch ein
        gerade laufender Schreibvorgang fertig ist."""
        async with self._sperre:
            return await self._schreiben()

    async def async_stoppen(self) -> None:
        """Beim Stoppen: noch einmal schreiben, was nicht geht, in die Pufferdatei (übersteht den Neustart)."""
        async with self._sperre:
            if not await self._schreiben():
                await self._auslagern()

    async def _schreiben(self) -> bool:
        if self._db.angehalten:   # HA-Sicherung: kurz, nur warten
            return not self._offen
        if not self._db.bereit:   # Server (noch) nicht erreichbar – die Datenbank verbindet sich selbst neu
            return await self._fehlgeschlagen()
        if self.ausgelagert and not await self._puffer_nachschreiben():
            return await self._fehlgeschlagen()
        if not self._offen:
            self.fehler_seit = None
            return True
        stapel, self._offen = self._offen, []

        def alles(verbindung: Connection) -> bool:
            for werk in stapel:
                werk(verbindung)
            return True

        if await self._db.async_ausfuehren(alles) is None:
            rest = await self._einzeln(stapel) if datenfehler(self._db.letzter_fehler) else stapel
            if rest:
                self._offen[:0] = rest   # später nachschreiben, Reihenfolge bleibt
                return await self._fehlgeschlagen()
        self.fehler_seit = None
        self._db.geschrieben()
        return True

    async def _einzeln(self, werke: list[Werk]) -> list[Werk]:
        """Nach einem Datenfehler Vorgang für Vorgang schreiben; schlechte beiseitelegen. Zurück: was wegen der
        Verbindung (noch) nicht ging – ab dort in Reihenfolge."""
        abgelehnt: list[Werk] = []
        grund: BaseException | None = None
        for i, werk in enumerate(werke):
            if await self._db.async_ausfuehren(partial(_einmal, werk)) is not None:
                continue
            if not datenfehler(self._db.letzter_fehler):   # Verbindung weg: Rest später, in Reihenfolge
                await self._ablehnen(abgelehnt, grund)
                return werke[i:]
            abgelehnt.append(werk)
            grund = grund or self._db.letzter_fehler
        await self._ablehnen(abgelehnt, grund)
        return []

    async def _ablehnen(self, werke: list[Werk], grund: BaseException | None) -> None:
        """Nicht schreibbare Vorgänge nach `abgelehnt.jsonl` (Callables nur aus Tests: nicht ablegbar, nur im Log)."""
        if not werke:
            return
        arbeiten = [w for w in werke if isinstance(w, Arbeit)]
        if arbeiten and self.puffer is not None:
            zeilen = [zeile_von(a) for a in arbeiten]
            await self._db.hass.async_add_executor_job(self._anhaengen, self.puffer.with_name("abgelehnt.jsonl"), zeilen)
        _LOGGER.warning("Datenbank: %s Schreibvorgänge mit Datenfehler übersprungen (%s): %s", len(werke),
                        self.puffer.with_name("abgelehnt.jsonl") if self.puffer else "verworfen", grund)

    async def _fehlgeschlagen(self) -> bool:
        if not self._offen and not self.ausgelagert:
            return True
        jetzt = dt_util.utcnow()
        self.fehler_seit = self.fehler_seit or jetzt
        if jetzt - self.fehler_seit >= AUSLAGERN_NACH and self._offen:
            await self._auslagern()
        return False

    # ------------------------------------------------------------------ Pufferdatei
    async def _auslagern(self) -> None:
        """Offene Arbeiten (in Reihenfolge) an die Pufferdatei anhängen – nur unter der Sperre aufrufen. Ohne Datei bzw.
        bei Callables (nicht ablegbar) bleiben höchstens `MAX_OFFEN` im Speicher, die ältesten fallen weg."""
        werke, self._offen = self._offen, []
        arbeiten = [w for w in werke if isinstance(w, Arbeit)] if self.puffer is not None else []
        bleiben = [w for w in werke if not isinstance(w, Arbeit)] if self.puffer is not None else werke
        if arbeiten:
            assert self.puffer is not None   # nur mit Pufferdatei gibt es `arbeiten`
            zeilen = [zeile_von(a) for a in arbeiten]
            await self._db.hass.async_add_executor_job(self._anhaengen, self.puffer, zeilen)
            self.ausgelagert += len(arbeiten)
            _LOGGER.warning("Datenbank nicht erreichbar: %s Schreibvorgänge in %s abgelegt", len(arbeiten), self.puffer)
        if len(bleiben) > MAX_OFFEN:
            _LOGGER.warning("Datenbank: Warteschlange voll, %s alte Schreibvorgänge verworfen", len(bleiben) - MAX_OFFEN)
        self._offen = bleiben[-MAX_OFFEN:] + self._offen

    @staticmethod
    def _anhaengen(datei: Path, zeilen: list[str]) -> None:
        datei.parent.mkdir(parents=True, exist_ok=True)
        with datei.open("a", encoding="utf-8") as f:
            f.writelines(z + "\n" for z in zeilen)
            f.flush()
            os.fsync(f.fileno())   # harter Absturz (Strom): sonst Nullbytes statt Zeilen

    def puffer_zaehlen(self) -> None:
        """Beim Start: liegen noch Arbeiten in der Pufferdatei (z. B. Neustart während eines Ausfalls)?"""
        if self.puffer is not None and self.puffer.exists():
            with self.puffer.open(encoding="utf-8") as datei:
                self.ausgelagert = sum(1 for z in datei if z.strip())

    async def _puffer_nachschreiben(self) -> bool:
        """Pufferdatei stapelweise nachschreiben; jeder geschriebene Stapel wird aus der Datei entfernt."""
        assert self.puffer is not None
        while self.ausgelagert:
            zeilen = await self._db.hass.async_add_executor_job(self._puffer_lesen)
            stapel: list[Werk] = []
            gute: list[str] = []
            kaputt: list[str] = []
            for z in zeilen[:STAPEL]:
                try:
                    stapel.append(arbeit_von(z))
                    gute.append(z)
                except (ValueError, KeyError, TypeError):
                    kaputt.append(z)
            if kaputt:   # aus dem Puffer nehmen, damit sie nicht jedes Mal wieder auffallen
                await self._db.hass.async_add_executor_job(self._anhaengen, self.puffer.with_name("kaputt.jsonl"), kaputt)
                await self._db.hass.async_add_executor_job(self._puffer_kuerzen, gute + zeilen[STAPEL:])
                _LOGGER.warning("Datenbank: %s unlesbare Zeilen im Puffer nach %s gelegt", len(kaputt),
                                self.puffer.with_name("kaputt.jsonl"))

            def alles(verbindung: Connection) -> bool:
                for a in stapel:
                    a(verbindung)
                return True

            rest: list[Werk] = []
            if stapel and await self._db.async_ausfuehren(alles) is None:
                if not datenfehler(self._db.letzter_fehler):
                    return False
                rest = await self._einzeln(stapel)
            neu = [zeile_von(a) for a in rest if isinstance(a, Arbeit)] + zeilen[STAPEL:]
            await self._db.hass.async_add_executor_job(self._puffer_kuerzen, neu)
            if rest:
                return False
            self._db.geschrieben()
        _LOGGER.warning("Datenbank wieder erreichbar: Puffer nachgeschrieben")
        return True

    def _puffer_lesen(self) -> list[str]:
        assert self.puffer is not None
        if not self.puffer.exists():
            return []
        return [z for z in self.puffer.read_text(encoding="utf-8").splitlines() if z.strip()]

    def _puffer_kuerzen(self, rest: list[str]) -> None:
        assert self.puffer is not None
        if not rest:
            self.puffer.unlink(missing_ok=True)
        else:
            neu = self.puffer.with_suffix(".neu")
            with neu.open("w", encoding="utf-8") as f:
                f.write("".join(z + "\n" for z in rest))
                f.flush()
                os.fsync(f.fileno())
            neu.replace(self.puffer)
        self.ausgelagert = len(rest)
