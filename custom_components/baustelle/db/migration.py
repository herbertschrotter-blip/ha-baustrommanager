"""Aufbau anlegen und auf den Stand `SCHEMA_VERSION` bringen (nummerierte Schritte, docs/bauplan-datenbank.md §3.1).

Vor jeder Migration einer bestehenden SQLite-Datei bleibt eine Kopie `baustelle.db.vor-<n>` liegen. Eine Datenbank, die
neuer ist als dieser Code (z. B. nach dem Einspielen einer älteren Version), wird nicht angefasst.
"""

from __future__ import annotations

from collections.abc import Callable
from pathlib import Path
import shutil

from sqlalchemy import Connection, Engine, MetaData, delete, func, inspect, insert, select, text, update

from homeassistant.util import dt as dt_util

from . import schema as s
from .schema import INVENTAR, JSON_TABELLEN, LESER, SCHEMA_VERSION, ansichten, metadata, schema_version


class DatenbankNeuer(Exception):
    """Die Datenbank hat einen neueren Aufbau als dieser Code."""


def _schritt_1(verbindung: Connection) -> None:
    metadata.create_all(verbindung, checkfirst=True)


def _schritt_2(verbindung: Connection) -> None:
    """JSON-Spalten in SQLite als Text neu anlegen. Die Tabellen sind bis dahin leer (gefüllt erst ab Phase 2, die mit
    diesem Schritt kommt); stehen doch Zeilen drin, wird abgebrochen statt Daten zu verlieren."""
    if verbindung.dialect.name != "sqlite":
        return
    for name in JSON_TABELLEN:
        if verbindung.execute(text(f'SELECT COUNT(*) FROM "{name}"')).scalar():   # noqa: S608 – feste Namen
            raise RuntimeError(f"Tabelle {name} ist nicht leer – Aufbau 2 bitte von Hand nachziehen")
        verbindung.execute(text(f'DROP TABLE "{name}"'))
    metadata.create_all(verbindung, tables=[metadata.tables[n] for n in JSON_TABELLEN])


def _schritt_3(verbindung: Connection) -> None:
    """Tagessummen bekommen „tatsächlich geheizt“ (strom_min); die Tage rechnet die Integration danach neu (tage.py)."""
    for tabelle in ("tag_geraet", "tag_bereich"):
        spalten = {c["name"] for c in inspect(verbindung).get_columns(tabelle)}
        if "strom_min" not in spalten:
            verbindung.execute(text(f'ALTER TABLE "{tabelle}" ADD COLUMN strom_min FLOAT'))


def _schritt_4(verbindung: Connection) -> None:
    """Minuten bekommen die Sekunden mit Leistung über „zieht Strom“ (sekunden_strom) – die Übernahme füllt sie nach."""
    if "sekunden_strom" not in {c["name"] for c in inspect(verbindung).get_columns("geraet_minute")}:
        verbindung.execute(text('ALTER TABLE "geraet_minute" ADD COLUMN sekunden_strom INTEGER'))


def _schritt_5(verbindung: Connection) -> None:
    """Jeder Messwert der Leistung (Tabelle messwert) – die Übernahme füllt die letzten 62 Tage aus dem HA-Verlauf."""
    metadata.create_all(verbindung, tables=[metadata.tables["messwert"]], checkfirst=True)


def _schritt_6(verbindung: Connection) -> None:
    """Meldungen vollständig als JSON (Spalte daten) – die Datenbank wird ihre Quelle (BSM-015)."""
    if "daten" not in {c["name"] for c in inspect(verbindung).get_columns("meldung")}:
        verbindung.execute(text('ALTER TABLE "meldung" ADD COLUMN daten TEXT'))


def ansichten_anlegen(verbindung: Connection) -> None:
    """Ansichten für Excel/Power BI neu anlegen (bei jeder Änderung ihrer Abfrage wieder aufrufen, neuer Aufbau)."""
    for name, abfrage in ansichten(verbindung.dialect.name).items():
        verbindung.execute(text(f'DROP VIEW IF EXISTS "{name}"'))
        verbindung.execute(text(f'CREATE VIEW "{name}" AS {abfrage}'))   # noqa: S608 – feste Abfragen aus schema.py


def _schritt_7(verbindung: Connection) -> None:
    """Ansichten für außerhalb (BSM-026, Bauplan §2.5)."""
    ansichten_anlegen(verbindung)


def _schritt_8(verbindung: Connection) -> None:
    """Meldungen je Instanz (BSM-026 8d): Spalte instanz_id, Ticketnummer nur je Instanz eindeutig. SQLite kann eine
    UNIQUE-Bedingung nicht entfernen – dort wird die Tabelle neu angelegt und umkopiert."""
    if "instanz_id" in {c["name"] for c in inspect(verbindung).get_columns("meldung")}:
        verbindung.execute(text('CREATE UNIQUE INDEX IF NOT EXISTS ux_meldung_ticket ON meldung (instanz_id, ticket)'))
        return
    if verbindung.dialect.name == "postgresql":
        verbindung.execute(text('ALTER TABLE "meldung" DROP CONSTRAINT IF EXISTS "meldung_ticket_key"'))
        verbindung.execute(text('ALTER TABLE "meldung" ADD COLUMN "instanz_id" VARCHAR(64)'))
        verbindung.execute(text('ALTER TABLE "meldung" ADD COLUMN "reihe" INTEGER'))
    else:
        alt = [c["name"] for c in inspect(verbindung).get_columns("meldung")]
        neu = s.meldung.to_metadata(MetaData(), name="meldung_neu")
        for i in list(neu.indexes):   # Index erst nach dem Umbenennen (Namen sind je Datenbank eindeutig)
            neu.indexes.discard(i)
        neu.create(verbindung)
        spalten = ", ".join(f'"{c}"' for c in alt)
        verbindung.execute(text(f'INSERT INTO "meldung_neu" ({spalten}) SELECT {spalten} FROM "meldung"'))   # noqa: S608
        verbindung.execute(text('DROP TABLE "meldung"'))
        verbindung.execute(text('ALTER TABLE "meldung_neu" RENAME TO "meldung"'))
    verbindung.execute(text('CREATE UNIQUE INDEX IF NOT EXISTS ux_meldung_ticket ON meldung (instanz_id, ticket)'))


def _schritt_9(verbindung: Connection) -> None:
    """Inventar (BSM-031): neue Tabellen, Verweise an Bereich und Gerät, Firmenkürzel, Ansicht v_inventar."""
    metadata.create_all(verbindung, tables=[metadata.tables[n] for n in INVENTAR], checkfirst=True)
    for tabelle, spalte, typ in (("bereich", "container_id", "VARCHAR(64)"), ("geraet", "ausruestung_id", "VARCHAR(64)"),
                                 ("firma", "kuerzel", "VARCHAR(5)")):
        if spalte not in {c["name"] for c in inspect(verbindung).get_columns(tabelle)}:
            verbindung.execute(text(f'ALTER TABLE "{tabelle}" ADD COLUMN "{spalte}" {typ}'))
    ansichten_anlegen(verbindung)


# Aufbau 10: Nachweise für die Prognose V2 (BSM-033.06) – nullable, ohne Standardwert und ohne Nachfüllen alter Zeilen
NACHWEISE = (("geraet_minute", "heizanforderung_s"), ("geraet_minute", "staffel_gesperrt_s"),
             ("bereich_minute", "temp_alter_s"), ("bereich_minute", "staffel_begrenzt_s"))


def _schritt_10(verbindung: Connection) -> None:
    """Minuten bekommen Anforderung/Sperre je Gerät und Alter/Sperre je Container; alte Zeilen bleiben NULL."""
    for tabelle, spalte in NACHWEISE:
        if spalte not in {c["name"] for c in inspect(verbindung).get_columns(tabelle)}:
            verbindung.execute(text(f'ALTER TABLE "{tabelle}" ADD COLUMN "{spalte}" INTEGER'))


SCHRITTE: dict[int, Callable[[Connection], None]] = {1: _schritt_1, 2: _schritt_2, 3: _schritt_3, 4: _schritt_4, 5: _schritt_5,
                                                     6: _schritt_6, 7: _schritt_7, 8: _schritt_8, 9: _schritt_9,
                                                     10: _schritt_10}


ALT_INTEGRATION = "_integration"   # bis Aufbau 7: Daten der ganzen Integration (Ticket-Zähler, Merker) ohne Instanz


def instanz_uebernehmen(verbindung: Connection, instanz_id: str) -> None:
    """Daten ohne Instanz (aus der Zeit mit einer Instanz je Datenbank) gehören der Instanz, die sie zuerst sieht:
    Meldungen ohne instanz_id und `zustand` unter `_integration` (ein vorhandener eigener Schlüssel gewinnt)."""
    verbindung.execute(update(s.meldung).where(s.meldung.c.instanz_id.is_(None)).values(instanz_id=instanz_id))
    z = s.zustand
    eigene = {r[0] for r in verbindung.execute(select(z.c.schluessel).where(z.c.baustelle_id == instanz_id))}
    if eigene:
        verbindung.execute(delete(z).where(z.c.baustelle_id == ALT_INTEGRATION, z.c.schluessel.in_(eigene)))
    verbindung.execute(update(z).where(z.c.baustelle_id == ALT_INTEGRATION).values(baustelle_id=instanz_id))


def leser_rechte(verbindung: Connection) -> None:
    """PostgreSQL: der Lese-Benutzer (falls angelegt) darf genau die Ansichten lesen – bei jedem Start nachgezogen."""
    if verbindung.dialect.name != "postgresql":
        return
    if not verbindung.execute(text("SELECT 1 FROM pg_roles WHERE rolname = :r"), {"r": LESER}).scalar():
        return
    vorhanden = {r[0] for r in verbindung.execute(text("SELECT viewname FROM pg_views WHERE schemaname = current_schema()"))}
    for name in ansichten("postgresql"):
        if name in vorhanden:   # fehlt eine Ansicht, darf das den Start nicht verhindern
            verbindung.execute(text(f'GRANT SELECT ON "{name}" TO "{LESER}"'))


def stand(verbindung: Connection) -> int:
    """Stand des Aufbaus (0 = leer)."""
    if not inspect(verbindung).has_table("schema_version"):
        return 0
    return int(verbindung.execute(select(func.max(schema_version.c.version))).scalar() or 0)


def migrieren(engine: Engine, pfad: Path | None) -> int:
    """Aufbau anlegen bzw. nachziehen; liefert den Stand danach."""
    with engine.connect() as verbindung:
        vorher = stand(verbindung)
    if vorher > SCHEMA_VERSION:
        raise DatenbankNeuer(f"Datenbank hat Aufbau {vorher}, diese Version kennt {SCHEMA_VERSION}")
    if vorher == SCHEMA_VERSION:
        return vorher
    if vorher > 0 and pfad is not None and pfad.exists():
        shutil.copy2(pfad, pfad.with_name(f"{pfad.name}.vor-{SCHEMA_VERSION}"))
    with engine.begin() as verbindung:
        for nr in range(vorher + 1, SCHEMA_VERSION + 1):
            SCHRITTE[nr](verbindung)
            verbindung.execute(insert(schema_version).values(version=nr, angewendet=dt_util.utcnow()))
    return SCHEMA_VERSION


# Zeitreihen auf PostgreSQL mit TimescaleDB (Phase 8, BSM-026): Tabelle → Zeitspalte. Eine Hypertable braucht die
# Zeitspalte in jedem eindeutigen Schlüssel – messwert und ereignis haben eine laufende Nummer und bekommen auf
# PostgreSQL den Schlüssel (id, zeit); SQLite bleibt unverändert.
ZEITREIHEN = {"geraet_minute": "zeit", "bereich_minute": "zeit", "wetter_minute": "zeit", "messwert": "zeit", "ereignis": "zeit"}
MIT_NUMMER = ("messwert", "ereignis")


def zeitreihen_einrichten(verbindung: Connection) -> None:
    """Auf PostgreSQL: TimescaleDB-Erweiterung und Hypertables, bei jedem Start nachgezogen (wiederholbar). Ohne die
    Erweiterung (reines PostgreSQL) bleiben es normale Tabellen."""
    if verbindung.dialect.name != "postgresql":
        return
    vorhanden = verbindung.execute(text("SELECT 1 FROM pg_available_extensions WHERE name = 'timescaledb'")).scalar()
    if not vorhanden:
        return
    verbindung.execute(text("CREATE EXTENSION IF NOT EXISTS timescaledb"))
    for tabelle, zeit in ZEITREIHEN.items():
        if tabelle in MIT_NUMMER:
            schluessel = verbindung.execute(text(
                "SELECT array_agg(a.attname::text ORDER BY a.attname) FROM pg_index i "
                "JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY(i.indkey) "
                "WHERE i.indrelid = CAST(:t AS regclass) AND i.indisprimary"), {"t": tabelle}).scalar() or []
            if list(schluessel) == ["id"]:
                verbindung.execute(text(f'ALTER TABLE "{tabelle}" DROP CONSTRAINT "{tabelle}_pkey"'))
                verbindung.execute(text(f'ALTER TABLE "{tabelle}" ADD PRIMARY KEY (id, "{zeit}")'))
        verbindung.execute(text(
            "SELECT create_hypertable(CAST(:t AS regclass), by_range(:z), if_not_exists => TRUE, migrate_data => TRUE)"),
            {"t": tabelle, "z": zeit})

