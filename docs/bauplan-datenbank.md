# Bauplan Datenbank

Die Integration bekommt eine **eigene Datenbank für alle Daten**: Stammdaten, Einstellungen mit Verlauf, Laufzeit,
Zähler, Protokoll, Meldungen und Messwerte (je Minute und jede Schaltung, für immer). Sie löst die Store-Datei
`.storage/baustelle.<entry_id>` ab und wird die Quelle der Auswertung statt der HA-Langzeitstatistik.

Stand: Plan vom 05.10.2026 (Sitzung „ha-baustelle Teil 3“), noch nichts gebaut. Ersetzt `bauplan-0.7.md` §10 und den
Punkt „Speicherdatei“ in §7.

## 1. Entscheidungen (Herbert, 05.10.2026)

| Frage | Entscheidung |
|---|---|
| Eigene Datenbank? | **Ja, wirklich alle Daten** in einer Datenbank der Integration |
| Wo? | **Wie der Recorder:** Standard SQLite-Datei je Instanz `/config/baustelle/baustelle.db`, über `db_url` auf **PostgreSQL + TimescaleDB** umstellbar; mehrere Instanzen schreiben dann in dieselbe Datenbank |
| Wie fein? | **Je Minute + jede Schaltung** (sekundengenau) |
| Altdaten? | **Alles übernehmen:** Store (Einstellungen, Zähler, Laufzeit, Protokoll, Meldungen), HA-Verlauf der letzten 62 Tage minutengenau, davor die Stundenwerte der Langzeitstatistik |
| Wie lange? | **Alles für immer** (keine Verdichtung, kein Löschen) |
| Wann/wo? | **Jetzt, direkt auf main** – jede Phase hält den Pilot lauffähig |
| Wofür? | Seite, außerhalb von HA (Excel, Power BI, Buchhaltung), mehrere Instanzen zentral, lange Rohdaten |

Rahmen: Der Pi läuft auf einer 1-TB-NVMe-SSD – Platz und Schreiblast sind kein Engpass (≈ 40–60 MB je Gerät und Jahr).

**Bewusste Abweichung von „Bewährte Lösungen statt Eigenbau“ (CLAUDE.md):** Die HA-Bordmittel (Recorder,
Langzeitstatistik) decken die Ziele nicht ab – 62 Tage Verlauf, keine fachlichen Spalten (Firma, Container, Preis), kein
sauberes Nachtragen, eine Datenbank je Instanz, Aufbau ändert sich mit HA-Updates. Bewährt bleibt das Werkzeug:
SQLAlchemy (in HA enthalten, auch vom Recorder genutzt), SQLite bzw. PostgreSQL/TimescaleDB, die Sicherungs-Schnittstelle
von HA (`backup`-Plattform). Selbst gebaut wird nur der Aufbau der Tabellen und das Schreiben/Lesen.

### Vor- und Nachteile (wie besprochen)

Vorteile: fachlicher Aufbau (SQL ohne HA-Wissen), unabhängig vom Recorder, Nachtragen nach Ausfällen als normale Zeilen,
Verlauf der Einstellungen mit Benutzer, Protokoll ohne Grenze, Daten überleben die Instanz, mehrere Instanzen in eine
Datenbank, schnellere Auswertung über Tagessummen.

Nachteile und Antwort darauf:

| Nachteil | Antwort im Plan |
|---|---|
| Zwei Datenstände (HA-Recorder speichert die Sensoren weiter) | Quelle der Wahrheit ist die eigene Datenbank; HA-Sensoren nur für Dashboards/Energie-Dashboard (§3.6) |
| Eigenbau: Aufbau, Migrationen, Fehlerfälle | eigenes Paket `db/` mit Tests, nummerierte Migrationen, Verhalten bei Fehlern festgelegt (§5) |
| Sicherung einer SQLite-Datei mitten im Schreiben | `backup.py`: vor der HA-Sicherung Schreiben anhalten und Datei abschließen, danach weiter (§3.7) |
| HA-Werkzeuge sehen die Datenbank nicht | Sensoren bleiben; Verlauf und Auswertung zeigt die Seite aus der Datenbank |
| PostgreSQL nicht erreichbar | Puffer auf der Platte, Nachschreiben (Phase 8) |
| Großer Umbau auf main | erst nur mitschreiben, Abgleich mit den alten Zählern, dann lesen umstellen, zuletzt Store ablösen; je Phase ein Rückweg (§4) |
| Datenschutz (Minutenwerte, Tür, Taste, Benutzer → Anwesenheit/Arbeitszeit) | entschieden (§6): Benutzer nur bei Einstellungen, bis Baustellenende + 1 Jahr; Bedienung vor Ort ohne Person; vor dem Firmeneinsatz mit Betriebsrat bestätigen |

## 2. Aufbau der Datenbank (Schema 1, seit 0.8.54 Aufbau 2)

Aufbau 2 (BSM-007): Spalten mit JSON (`wert`, `werte`, `seite`) sind in SQLite Text (`TextJSON`) – eine Spalte vom
Typ „JSON“ hat in SQLite Zahl-Affinität, ein einzelner Wert wie `21.5` käme als Zahl zurück. PostgreSQL bleibt bei JSON.
Mitgeschrieben wird je Baustelle von `db/mitschreiben.py`: Minutenzeilen zum Minutenwechsel (die erste und letzte nach
einem Laden ist kürzer, `dauer_s`), Schaltungen mit Quelle `automatik` (eigener Befehl), `ha` (in HA geschaltet),
`hand` (am Gerät), Tür und Erreichbarkeit als Ereignis, Laufzeit (`zustand`, je Schlüssel der obersten Ebene, nur bei
Änderung), Gelerntes stündlich.

Alle Zeiten in UTC (`TIMESTAMP WITH TIME ZONE` bzw. ISO in SQLite), Tage als `DATE` in der Zeitzone der Baustelle.
IDs der Baustellen, Container und Geräte = IDs von HA (`entry_id`, `subentry_id`), damit nichts umgeschlüsselt wird.
Jede Zeile mit Messwerten trägt `baustelle_id`, damit Abfragen über Instanzen hinweg ohne Verknüpfung gehen.

### 2.1 Stammdaten

| Tabelle | Spalten | Schlüssel |
|---|---|---|
| `instanz` | `id` (HA-UUID), `name`, `angelegt` | `id` |
| `baustelle` | `id` (entry_id), `instanz_id`, `titel`, `status` (aktiv/abgeschlossen), `zeitzone`, `beginn`, `ende`, `angelegt`, `abgeschlossen` | `id` |
| `bereich` | `id` (subentry_id), `baustelle_id`, `name`, `art` (container/pumpenschacht), `nr`, `m2`, `groesse`, `fuehler`, `tuer`, `angelegt`, `entfernt` | `id`; Index `baustelle_id` |
| `geraet` | `id`, `baustelle_id`, `bereich_id`, `name`, `rolle`, `typ`, `schalter`, `leistung`, `energie`, `nenn_kw`, `angelegt`, `entfernt` | `id`; Index `bereich_id` |
| `anschluss` | `id`, `baustelle_id`, `name`, `ampere`, `phasen`, `reserve_kw`, `entfernt` | `id` |
| `firma` | `id`, `baustelle_id`, `name`, `eigen`, `entfernt` | (`baustelle_id`, `id`) |
| `zuordnung` | `baustelle_id`, `bereich_id`, `firma_id`, `ab` | (`bereich_id`, `ab`) |
| `preis` | `baustelle_id`, `ab`, `eur_kwh` | (`baustelle_id`, `ab`) |
| `arbeitszeit` | `baustelle_id`, `ab`, `name`, `wochentag` (0 = Mo), `von`, `bis` (Minuten, leer = frei) | (`baustelle_id`, `ab`, `wochentag`) |
| `ausnahme` | `baustelle_id`, `datum`, `art` (arbeit/zeiten/frei), `von`, `bis`, `notiz` | (`baustelle_id`, `datum`, `von`) |

**Aufbau 9 (BSM-031.02):** Inventar über den Baustellen – `container`, `container_einsatz`, `ausruestung`,
`ausruestung_einsatz`, `umbenennung`; dazu `bereich.container_id`, `geraet.ausruestung_id`, `firma.kuerzel` und die
Ansicht `v_inventar`. Einzelheiten in `bauplan-inventar.md` §2.

Container, Geräte und Baustellen legt weiter HA an (Config-/Subentry-Flows – das verlangt HA); die Datenbank spiegelt
sie bei jedem Start und jeder Änderung. Entfernt wird nie gelöscht, sondern `entfernt` gesetzt – alte Messwerte bleiben
zuordenbar. Termine und Urlaub bleiben in den HA-Kalendern (dort gepflegt); Wetter kommt von HA.

### 2.2 Einstellungen und Laufzeit

| Tabelle | Spalten | Schlüssel |
|---|---|---|
| `einstellung` | `id`, `baustelle_id`, `bereich_id`, `geraet_id` (leer = ganze Baustelle), `schluessel` (z. B. `heizung.soll`, `staffel.an`, `meldungen_einst.hand_h`), `wert` (JSON), `ab`, `benutzer`, `quelle` (seite/import/migration) | `id`; Index (`baustelle_id`, `schluessel`, `ab`) |
| `zustand` | `baustelle_id`, `schluessel` (z. B. `bedarf_bis:<bid>`, `hand:<gid>`, `stumm:<key>`, `jetzt_bis`), `wert` (JSON), `geaendert` | (`baustelle_id`, `schluessel`) |
| `lernen` | `baustelle_id`, `bereich_id`, `datum`, `werte` (JSON: Aufheizrate, Startzeit, Gefühl …) | (`bereich_id`, `datum`) |

`einstellung` ist ein Verlauf: jede Änderung eine neue Zeile, es gilt die jüngste. Die Integration baut daraus beim
Start dasselbe Wörterbuch `e` wie heute aus dem Store – `steuerung.py` und die Funktionen bleiben unverändert.

### 2.3 Messwerte (je Minute, für immer)

| Tabelle | eine Zeile je | Spalten | Schlüssel |
|---|---|---|---|
| `geraet_minute` | Gerät × Minute | `zeit` (Minutenbeginn), `baustelle_id`, `geraet_id`, `dauer_s` (60; 3600 bei übernommenen Stundenwerten), `sekunden_ein`, `leistung_w` (Ø), `leistung_w_max`, `energie_wh` (Zuwachs), `zaehlerstand_kwh`, `erreichbar`, `quelle` (ha/notprogramm/import_verlauf/import_statistik) | (`geraet_id`, `zeit`) |
| `bereich_minute` | Container × Minute | `zeit`, `baustelle_id`, `bereich_id`, `dauer_s`, `temperatur`, `feuchte`, `soll`, `tuer_offen_s`, `zustand`, `grund`, `quelle` | (`bereich_id`, `zeit`) |
| `wetter_minute` | Baustelle × Minute | `zeit`, `baustelle_id`, `dauer_s`, `aussen_temp`, `regen_mm`, `hoechst_heute`, `quelle` | (`baustelle_id`, `zeit`) |
| `ereignis` | jede Schaltung/Änderung | `id`, `zeit` (sekundengenau), `baustelle_id`, `bereich_id`, `geraet_id`, `art` (schalten/tuer/hand/bedarf/boost/notbetrieb/erreichbar), `wert`, `quelle` (automatik/hand/seite/taste/notprogramm), `grund` – **ohne Benutzer** (§6) | `id`; Index (`baustelle_id`, `zeit`) |

`dauer_s` macht übernommene Stundenwerte und Minutenwerte in derselben Tabelle auswertbar (Summen über `energie_wh`,
`sekunden_ein`; Mittel gewichtet mit `dauer_s`). Das Bilden der Minutenwerte aus den Zuständen (Sekunden ein, Ø
Leistung, Zuwachs, Rücksprünge/Neustarts des Zählers) ist Fachregel → `logik/minute.py`.

### 2.4 Auswertung, Protokoll, Meldungen

| Tabelle | Spalten | Schlüssel |
|---|---|---|
| `tag_geraet` | `datum`, `baustelle_id`, `geraet_id`, `bereich_id`, `firma_id`, `kwh`, `eur`, `preis`, `heizzeit_min`, `zyklen`, `laufzeit_min`, `ohne_kwh` | (`geraet_id`, `datum`) |
| `tag_bereich` | `datum`, `baustelle_id`, `bereich_id`, `firma_id`, `kwh`, `eur`, `heizzeit_min`, `gradh`, `temp_min/mittel/max`, `aussen_mittel`, `ohne_kwh`, `heiztag` | (`bereich_id`, `datum`) |
| `protokoll` | `id`, `zeit`, `baustelle_id`, `bereich_id`, `art` (warnung/ok/schalten/wetter/nachricht/einstellung/meldung), `text` | `id`; Index (`baustelle_id`, `zeit`) |
| `meldung` | `id`, `ticket` (FE-/WU-/AN-NNNN), `art`, `status`, `text`, `kontext`, `geraet`, `seite` (JSON), `version`, `baustelle_id`, `zeit` | `id`; eindeutig `ticket` |
| `meldung_verlauf` | `meldung_id`, `zeit`, `status`, `notiz`, `version`, `commit`, `von` | (`meldung_id`, `zeit`) |
| `meldung_bild` | `meldung_id`, `nr`, `datei` | (`meldung_id`, `nr`) |
| `schema_version` | `version`, `angewendet` | `version` |

Tagessummen werden aus den Minuten gerechnet (`logik/tag.py`, mit Preis „ab“ und Firmenzuordnung „ab“ des Tages) –
nachts für den Vortag, für heute laufend. Die heutigen Zähler (`energie`, `kosten`, `heizzeit:<bid>`, `zyklen:<gid>`,
`ohne`, `gradh:<bid>`, `heiztage` …) sind danach **Summen über `tag_*`** und werden nicht mehr eigens gezählt.

### 2.5 Für außerhalb (Excel, Power BI)

Ansichten (Views), in SQLite und PostgreSQL gleich: `v_tag_firma` (kWh/€ je Firma und Tag), `v_tag_container`,
`v_monat_baustelle`, `v_schaltungen`. Auf PostgreSQL ein eigener Benutzer nur mit Leserecht auf die Ansichten.

## 3. Aufbau im Code

### 3.1 Paket `custom_components/baustelle/db/`

- `schema.py` – Tabellen als SQLAlchemy Core (`Table`, `Column`), Ansichten, Indizes; eine Quelle für SQLite und
  PostgreSQL.
- `verbindung.py` – Engine (Standard `sqlite:////config/baustelle/baustelle.db`, `db_url` kommt mit Phase 8), SQLite
  mit WAL und `synchronous=NORMAL`; alle Zugriffe im Executor von HA nacheinander hinter einer Sperre, nie in der
  Ereignisschleife (umgesetzt 0.8.53: kein eigener Thread – der müsste beim Entladen beendet werden und gilt in den
  HA-Tests als hängender Thread).
- `migration.py` – `schema_version` lesen, nummerierte Schritte anwenden; vor jeder Migration eine Kopie der
  SQLite-Datei (`baustelle.db.vor-<n>`).
- `schreiber.py` – Warteschlange: Ereignisse und Protokoll sofort (gesammelt, höchstens alle 5 s), Minutenwerte
  einmal je Minute in einem Schreibvorgang; Einstellungen sofort (ein Schreibvorgang je Änderung).
- `lesen.py` – Abfragen für Struktur, Auswertung, Abrechnung, Verlauf, Protokoll (mit Blättern), Meldungen.
- `uebernahme.py` – Altdaten übernehmen (Phase 3), wiederholbar (gleiches Ergebnis bei zweitem Lauf).

### 3.2 Fachlogik (ohne HA-Code, mit Tests)

- `logik/minute.py` – Minutenwerte aus Zustandsfolgen (Sekunden ein, Ø/Max Leistung, Energiezuwachs mit den Regeln aus
  `logik/zaehlen.py`, Zählerneustart, Lücken).
- `logik/tag.py` – Tagessummen aus Minuten (Preis ab, Firma ab, Heiztag, Gradstunden, „ohne Automatik“).
- `logik/zaehlen.py` – bleibt Quelle der Zählregeln; **die 50-kWh-Grenze** (`MAX_SPRUNG_KWH`) wird dabei für Lücken
  richtig gestellt: liegt zwischen zwei Ständen eine Lücke, gilt die Grenze je Stunde der Lücke statt absolut.

### 3.3 Einstellungen (`einstellungen.py`)

`Einstellungen` behält ihre Schnittstelle (`e`, `zaehler`, `speichern()`, `protokoll()`), schreibt und liest aber über
`db/`. Damit bleiben `steuerung.py`, `funktionen/` und `panel.py` beim Umstieg fast unverändert.

### 3.4 Auswertung (`auswertung.py`, `panel.py`)

`_statistik()` (heute `recorder.statistics_during_period`) liest aus `geraet_minute`/`tag_*`. Die Befehle
`baustelle/auswertung`, `abrechnung`, `ohne`, `bericht`, `protokoll` bleiben in Form und Inhalt gleich (api-0.7).

### 3.5 Seite

Die Seite fragt heute HA direkt ab (`recorder/statistics_during_period` 3×, `history/history_during_period` 2×). Neu:
`baustelle/verlauf` (`entry_id`, `art`: leistung/temperatur/schalten/energie, `von`, `bis`, `raster`: minute/stunde/tag,
`ids`) liefert dieselben Reihen aus der Datenbank. Die Seite rechnet weiter nichts Fachliches. Mockup und Beispiel-hass
(`tests/panel/beispiel-hass.js`) bekommen den neuen Befehl.

### 3.6 HA-Sensoren

Bleiben (Energie, Kosten, Status, Zeiten …) für Dashboards und das Energie-Dashboard; ihre Werte kommen aus der
Datenbank (Summen über `tag_*`). Neu: Diagnose-Sensor „Datenbank“ (Größe, letzte Schreibzeit, Warteschlange, Fehler).

### 3.7 Sicherung (`backup.py`)

HA-Plattform `backup`: `async_pre_backup` leert die Warteschlange, schreibt einen Prüfpunkt (SQLite `wal_checkpoint`)
und hält das Schreiben an; `async_post_backup` gibt es wieder frei. Was in der Zwischenzeit anfällt, bleibt in der
Warteschlange. Bei PostgreSQL sichert die Datenbank selbst (Betriebsanleitung).

## 4. Umbau in Phasen (direkt auf main)

Jede Phase: Sicherung vorher, alle Prüfläufe grün, einspielen, Neustart durch Herbert, mindestens einen Tag
beobachten. Jede Phase hat einen Rückweg.

| Phase | Inhalt | Der Pilot merkt | Rückweg | Version |
|---|---|---|---|---|
| **0** | Fix 50-kWh-Grenze bei Lücken (`logik/zaehlen.py`, mit Test) | lange Ausfälle zählen richtig | – | PATCH |
| **1** | Grundgerüst: `db/` (Schema 1, Verbindung, Migration, Schreiber), `backup.py`, Diagnose-Sensor; Datenbank wird angelegt, Stammdaten gespiegelt (beim Laden und nach Änderungen auf der Seite) – **erledigt 0.8.53 (BSM-006)** | nichts | Vorversion einspielen; Fehler der Datenbank halten die Steuerung nie an (statt eigener Option) | PATCH |
| **2** | **Mitschreiben:** Einstellungen (jede Änderung mit Benutzer), Laufzeit, Ereignisse, Protokoll, Meldungen, Minutenwerte (`logik/minute.py`) – nur schreiben, gelesen wird weiter aus Store/Statistik – **erledigt 0.8.54 (BSM-007)**, dazu Aufbau 2 (JSON in SQLite als Text) | nichts | Vorversion einspielen; Datei löschen | PATCH |
| **3** | **Übernahme Altdaten:** Store (Einstellungen als erste Zeilen `quelle=migration`, Zähler, Laufzeit, Protokoll, Meldungen), HA-Verlauf 62 Tage → Minuten, Langzeitstatistik davor → Stundenzeilen (`dauer_s=3600`); einmal, wiederholbar – **erledigt 0.8.55 (BSM-008)**: automatisch nach dem HA-Start, Merker `zustand.uebernahme`, nur bis zur ersten mitgeschriebenen Minute; statt Probelauf auf einer Kopie der HA-Datenbank sichert sich die eigene Datenbank vorher selbst (`baustelle.db.vor-uebernahme`) | nichts | Übernahme neu laufen lassen (erzwingen) bzw. Kopie zurück | PATCH |
| **4** | **Tagessummen + Abgleich:** `logik/tag.py`, `tag_*` nachts und laufend; Abgleich-Bericht alte Zähler ↔ Datenbank je Tag/Container/Firma (Diagnose und Test), Abweichungen klären – **erledigt 0.8.57 (BSM-009)**: heute alle 15 min, um 00:05 auch gestern, nach dem Start alle fehlenden Tage; Abgleich kWh je Container und Tag gegen die HA-Langzeitstatistik im Diagnose-Download (letzte 14 Tage); „ohne Automatik“ bleibt bis Phase 5 leer (Regel nur einmal) | nichts | – | PATCH |
| **5** | **Lesen umstellen:** Auswertung, Abrechnung, Bericht, CSV aus der Datenbank; `baustelle/verlauf` und Seite ohne direkte HA-Abfragen; Mockup/Panel-Test – **Schritt 1 erledigt 0.8.58 (BSM-014)**: `auswertung.async_statistik` antwortet aus der Datenbank (`db/statistik.py`, gleiche Form wie die HA-Statistik; „ohne Automatik“ und „Ersparnis“ weiter aus HA), Seite über `baustelle/statistik`; Aufbau 3 (`strom_min`). **Schritt 2 erledigt 0.8.60:** jeder Messwert der Leistung (Tabelle `messwert`, Aufbau 5, Herbert 05.10.2026), `baustelle/verlauf` statt `history` – die Seite fragt HA nur noch für Kalender und Wetter-Vorhersage direkt. Die Zähler-Sensoren ziehen mit Phase 6 um (hängen am Store) | gleiche Zahlen, Verlauf älter als 62 Tage sichtbar | Einstellung `auswertung_quelle` = `statistik` | PATCH |
| **6** | **Store ablösen** – **erledigt 0.8.61 (BSM-015)**: Datenbank ist Quelle (Umstellung beim ersten Start, Merker `speicher_db`), Store diese Version noch als Kopie, Protokoll ohne Grenze, Meldungen vollständig (Aufbau 6); die Zähler bleiben laufend geführt (Regel in der Integration) und stehen in `zustand`, statt aus `tag_*` gerechnet zu werden – „ohne Automatik“ und „Ersparnis“ für die Auswertung kommen weiter aus HA (offen) · `Einstellungen` liest/schreibt nur noch die Datenbank; Protokoll ohne Grenze mit Blättern; Meldungen aus der Datenbank (`meldungen.json`/`.md` für `tools/ticket.py` weiter geschrieben); Store-Datei wird eine Version lang noch als Kopie geschrieben, dann entfernt | Protokoll reicht weiter zurück | Store-Kopie zurückladen | PATCH |
| **7** | **Nachtragen aus dem Notprogramm** (mit `bauplan-0.7.md` §9): Stundenbuch der Plugs nach Ausfällen abholen → `geraet_minute`/`bereich_minute` mit `quelle=notprogramm`, Tagessummen neu – **gebaut 0.8.67 (BSM-020)**, `db/nachtrag.py`: Stunde ersetzt HA-Minuten ohne Verbindung, beginnt nach echten Minuten vor dem Ausfall, Temperatur nur ohne HA-Werte, Zählersprung der ersten erreichbaren Minute um das Nachgetragene gekürzt, zweimal nachtragen ändert nichts | Lücken gefüllt | – | MINOR (mit §9) |
| **8** | **Zentral:** `db_url` für PostgreSQL + TimescaleDB (Hypertables für `*_minute`, `ereignis`), Treiber (`psycopg`, in HA nicht enthalten → `requirements`), Puffer auf der Platte bei Verbindungsverlust, Ansichten + Lesebenutzer für Excel/Power BI, mehrere Instanzen (`instanz`) | – | zurück auf SQLite (Übernahme in Gegenrichtung) | PATCH |
| **9** | **Abschluss:** api-0.7 → api-Datenbank, README (Auslieferung, Sicherung, Wiederherstellung), Betriebsanleitung, `quality_scale.yaml`, Diagnose enthält Datenbank-Stand – **gebaut 0.8.105 (BSM-027):** `docs/betrieb.md` (einspielen, sichern, wiederherstellen A–D, Störungen), `docs/api-datenbank.md` (Zugang, Ansichten, Tabellen, Befehle, Diagnose), README, `quality_scale.yaml`, Diagnose `datenbank.stand`; offen: mit Herbert durchspielen | – | – | – |

Reihenfolge der Abhängigkeiten: 0 → 1 → 2 → 3 → 4 → 5 → 6; 7 braucht 2 und §9; 8 braucht 6.

## 4a. Phase 8 im Einzelnen (BSM-026, 07.10.2026)

**Server (Herbert, 07.10.2026):** Add-on „TimescaleDB“ (expaso, PostgreSQL 17 + TimescaleDB) auf dem Pi für den Betrieb –
Port nicht nach außen freigegeben, Datenbank `baustelle` mit TimescaleDB, Telemetrie aus; später dieselbe `db_url` auf
einen Server der Firma. Passwörter setzt nur Herbert. Die automatischen Tests laufen gegen einen eigenen
Test-PostgreSQL im Terminal-Container (`tools/pg-test.sh`, ohne Passwort, nur lokal), auf GitHub gegen einen
Dienst-Container `timescale/timescaledb`. Treiber `psycopg[binary]` fest in `manifest.json` (Herbert).

| Schritt | Inhalt | Version |
|---|---|---|
| **8a** ✅ 0.8.102 | `db_url` wie beim Recorder in YAML (`baustelle: db_url: !secret baustelle_db_url`, Paket in `/config/packages/`); ohne Angabe bleibt alles bei SQLite. Verbindung, Migration und Diagnose für PostgreSQL (keine Datei-Kopie vor Migrationen – der Server sichert selbst), Hypertables für `geraet_minute`, `bereich_minute`, `wetter_minute`, `messwert`, `ereignis` (bei den beiden letzten Schlüssel `id` + `zeit`, nur auf PostgreSQL). Umzug: neue, leere PostgreSQL-Datenbank + vorhandene SQLite-Datei → alle Tabellen einmal kopieren (Merker `zustand` „umzug“), die SQLite-Datei bleibt liegen. Alle Datenbank-Tests zusätzlich gegen PostgreSQL | PATCH |
| **8b** ✅ 0.8.103 | **Puffer:** jede Schreibarbeit ist ein Name mit Daten (`db/schreiber.py`, `ARBEITEN`: `einfuegen`, `minute`, `baustelle_speichern`, `spiegeln`, `entfernen`, `meldungen`) statt einer Python-Funktion; ohne Server bleiben sie in der Warteschlange, ab 10.000, nach 30 min und beim Stoppen kommen sie als JSON-Zeilen in `/config/baustelle/puffer/arbeiten.jsonl` und werden danach in derselben Reihenfolge genau so nachgeschrieben (Ersetzen und Ändern vorhandener Zeilen inklusive – deshalb keine zweite SQLite-Datei mit Zeilenabgleich, wie zuerst geplant). Server beim Start weg: jede Minute neu verbinden, der Mitschreiber sammelt trotzdem, Einstellungen aus der laufend mitgeschriebenen Store-Kopie. Diagnose `puffer`. **Nachtrag 0.8.139 (19.10.2026):** Nach dem Absturz am 16.10. stand die erste Minute im Puffer schon in der Datenbank → `UniqueViolation`, der Stapel scheiterte jede Minute und hielt drei Tage lang alles an. Seitdem: Minuten (`*_minute`) werden mit `ON CONFLICT DO NOTHING` eingefügt; scheitert ein Stapel an einem Datenfehler (`IntegrityError`, `DataError`, kaputte Daten), wird Vorgang für Vorgang geschrieben und nur der schlechte nach `puffer/abgelehnt.jsonl` gelegt; unlesbare Pufferzeilen (abgeschnitten, Nullbytes nach Stromausfall) kommen nach `puffer/kaputt.jsonl`; Pufferdatei mit `fsync`. Verbindungsfehler bleiben wie bisher: warten, nichts verwerfen | PATCH |
| **8c** ✅ 0.8.103 | **Ansichten** `v_tag_firma`, `v_tag_container`, `v_monat_baustelle`, `v_schaltungen` (Aufbau 7, SQLite und PostgreSQL; sie summieren nur `tag_*` bzw. lesen `ereignis` – keine Fachregel); Skript für Herbert: Datenbank, Schreib- und Lese-Benutzer anlegen (Passwörter fragt das Skript ab), Lese-Benutzer nur `SELECT` auf die Ansichten; Anleitung Excel (ODBC/Power Query) | PATCH |
| **8d** ✅ 0.8.104 | **Mehrere Instanzen:** Aufbau 8 – Meldungen mit `instanz_id` (Ticketnummer je Instanz eindeutig, Ersetzen nur der eigenen; `reihe` für die Reihenfolge bei gleicher Sekunde), Daten der ganzen Integration (Ticket-Zähler, Merker „umzug“) unter der ID der HA-Instanz statt `_integration` (vorhandene übernimmt die eigene Instanz beim Start). Umzug je Instanz – auch in eine schon belegte Datenbank (laufende Nummern vergibt dann der Server neu; ältere SQLite-Datei wird vorher nachgezogen). **Rückweg:** Admin-Dienst `baustelle.datenbank_rueckweg` kopiert die Daten dieser Instanz in eine neue SQLite-Datei (`baustelle-aus-postgres-<Zeit>.db`). Test mit zwei Instanzen gegen denselben Server, Migration 7 → 8 mit Meldungen. Betriebsanleitung im Ganzen bleibt bei BSM-027 | PATCH |

**Stand 8a (0.8.102):** `db/verbindung.py` (Adresse, Engine mit `timezone=UTC` und `pool_pre_ping`, Diagnose ohne
Passwort, Größe über `pg_database_size` alle 15 min), `db/migration.py` (`zeitreihen_einrichten`: TimescaleDB und
Hypertables, wiederholbar; ohne Erweiterung normale Tabellen), `db/umzug.py` (Kopie aller Tabellen in Stapeln, Zeiten
ausdrücklich UTC, Nummernzähler nachgezogen, Merker „umzug“), laufende Nummern auf PostgreSQL `bigint`.
Tests: alle Integrationstests laufen zusätzlich gegen PostgreSQL (`BAUSTELLE_TEST_PG`, je Test eine frische Datenbank;
drei Tests prüfen die SQLite-Datei selbst und laufen nur dort), dazu `test_datenbank_pg.py` (YAML, Hypertables, Umzug,
Adresse ohne Passwort). Ein Test (`test_bericht_zum_termin`) wartete nicht auf die Hintergrundaufgabe des Berichts und
war nur mit SQLite schnell genug – jetzt `wait_background_tasks`. Server: Add-on installiert, Einrichtung durch Herbert mit
`tools/db-einrichten.sh`; der Pilot bleibt bei SQLite, bis `db_url` eingetragen ist.

Offen für die Abnahme: Bestätigung der Datenschutz-Vorgabe (§6) durch Betriebsrat/Datenschutz der Firma (Herbert).

## 5. Verhalten bei Fehlern

- **Datenbank nicht erreichbar/gesperrt:** Die Steuerung läuft weiter (sie braucht die Datenbank nur beim Start und für
  die Auswertung); geschrieben wird in die Warteschlange, ab 10.000 Einträgen bzw. 30 min zusätzlich in eine Pufferdatei
  `/config/baustelle/puffer/`, nachgeschrieben, sobald es wieder geht. Warnung „Datenbank“ im Protokoll und auf der Seite.
- **Beim Start ohne lesbare Datenbank (ab Phase 6):** letzte Store-Kopie bzw. Standardwerte, **Automatik bleibt aus**
  (wie bei jeder neuen Integration), Warnung.
- **Beschädigte SQLite-Datei:** umbenennen (`baustelle.db.kaputt-<zeit>`), Wiederherstellung aus der HA-Sicherung
  (Betriebsanleitung); kein stilles Neuanlegen.
- **Migration schlägt fehl:** Kopie `baustelle.db.vor-<n>` bleibt, Integration startet nicht (Reparaturhinweis in HA).

## 6. Offen vor bzw. während des Baus

- **Datenschutz – entschieden (Herbert, 05.10.2026, BSM-005):**
  - **Einstellungen mit Benutzer:** `einstellung.benutzer` = HA-Benutzer bei `setzen`, `liste` und den Aktionen nur für
    Admins, die etwas dauerhaft ändern (`automatik`, `lern_reset`, `zuruecksetzen`, `energie_korrektur`, `aktiv`).
  - **Bedienung vor Ort ohne Person:** `ereignis` hat **keine** Spalte `benutzer`; gespeichert werden Zeit, Container,
    Aktion und Quelle (seite/taste/automatik/notprogramm) – kein Rückschluss auf die Anwesenheit einzelner Personen.
  - **Aufbewahren:** der Benutzer an Einstellungen bleibt bis **Baustellenende + 1 Jahr**, danach wird er entfernt
    (anonymisiert, nächtlich); die Änderung selbst bleibt für immer.
  - Vor dem Einsatz in der Firma mit Betriebsrat/Datenschutz bestätigen (BSM-026); Auskunft je Person = Abfrage auf
    `einstellung.benutzer`.
- **Server für PostgreSQL** in der Firma (Betrieb, Sicherung, Zugänge) – Phase 8.
- **Performance auf dem Pi:** Auswertung über Jahre nur über `tag_*`; Messung mit einem Jahr synthetischer Minutenwerte
  (Test), Ziel < 1 s je Abfrage.
- **HA-Recorder:** die Sensoren der Integration dort ausschließen oder behalten (doppelte Daten, aber Energie-Dashboard)?
  Vorschlag: behalten.

## 7. Tests

- `tests/logik/test_minute.py`, `test_tag.py`, `test_zaehlen.py` (Lücke) – jede Regel.
- `tests/integration/test_datenbank.py` – Schema anlegen, Migration von leer und von Schema n−1, Schreiber (Minute,
  Ereignis, Warteschlange, Puffer), Sicherung anhalten/fortsetzen, Übernahme aus einem Store wie `struktur-echt`
  (zweimal = gleiches Ergebnis), Abgleich alte Zähler ↔ Tagessummen, Fehlerfälle aus §5.
- Bestehende Integrations- und Panel-Tests laufen in jeder Phase unverändert grün (gleiche api-0.7-Antworten).
- Lasttest: ein Jahr Minutenwerte für 10 Geräte, Auswertung/Abrechnung/Verlauf unter 1 s.
