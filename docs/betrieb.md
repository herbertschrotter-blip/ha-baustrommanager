# Betriebsanleitung Baustelle

Für eine zweite Person, die den Baustrommanager ohne Claude betreuen soll: einspielen, sichern, wiederherstellen und
was bei Störungen zu tun ist (BSM-027). Stand 0.8.105 (08.10.2026). Technische Einzelheiten: `README.md`, Datenbank
`docs/bauplan-datenbank.md`, Schnittstellen `docs/api-datenbank.md`.

## 1. Was läuft wo

| Was | Wo |
|---|---|
| Home Assistant (HA) | Raspberry Pi 5 mit HA OS, Oberfläche im Browser bzw. HA-App; Neustart: Einstellungen → System → ⏻ |
| Quelle (Code, Doku, Werkzeuge) | Git-Repo `herbertschrotter-blip/ha-baustrommanager`, auf dem Pi unter `/config/projekte/ha-baustrommanager` |
| Eingespielte Integration | `/config/custom_components/baustelle` (nie dort ändern – immer aus dem Repo einspielen) |
| Seite „Baustelle“ | Seitenleiste von HA; Version unter ⚙ → Über |
| Datenbank | Standard: Datei `/config/baustelle/baustelle.db` (SQLite). Mit `db_url` in `/config/packages/baustelle.yaml`: Server im Add-on „TimescaleDB“ (PostgreSQL) |
| Puffer bei Datenbank-Ausfall | `/config/baustelle/puffer/arbeiten.jsonl` (leer bzw. fehlt im Normalbetrieb) |
| Meldungen (Melden-Knopf) | in der Datenbank; lesbar als `/config/baustelle/meldungen.md` und `.json` |
| Sicherungen | Einstellungen → System → Backups; automatisch jede Nacht um 03:00, verschlüsselt |
| Notprogramm | Skript in jedem Heizungs-Plug (Shelly Plug S Gen3); übernimmt, wenn HA 15 min nichts schickt |

**Werkzeug für die Kommandozeile:** Add-on „Terminal“ in HA (Seitenleiste). Alle Befehle unten dort eingeben.
**Zugangsdaten** (Passwörter, Schlüssel der Sicherungen, `secrets.yaml`) verwaltet Herbert; sie stehen in keinem Repo.

## 2. Einspielen einer neuen Version

Eine Version besteht aus einem Commit im Repo (Nummer in `CHANGELOG.md`). Einspielen heißt: Repo holen, Integration
nach `/config` kopieren, Konfiguration prüfen, HA neu starten.

1. Vorher eine Sicherung (Abschnitt 3, „Jetzt sichern“) – bei größeren Änderungen Pflicht.
2. Im Terminal:
   ```
   cd /config/projekte/ha-baustrommanager
   git pull
   tools/deploy.sh
   tools/neustart.sh
   ```
   `deploy.sh` kopiert nur die Integration (mit der fertig gebauten Seite); `neustart.sh` prüft zuerst die
   Konfiguration und startet nur bei gültiger neu, dann wartet es, bis HA wieder läuft.
3. Prüfen: Einstellungen → Geräte & Dienste → Baustelle ist „geladen“; Seite neu laden, unter ⚙ → Über steht die neue
   Version; Sensor „… Datenbank“ der Baustelle zeigt Zustand `ok`.
4. Etwas stimmt nicht: zurück auf die vorige Version (Abschnitt 4 C).

## 3. Sichern

- **Automatisch:** jede Nacht 03:00 eine vollständige Sicherung von HA mit allen Add-ons. Darin sind die Integration,
  die Einstellungen von HA und die Datenbank:
  - SQLite: Während der Sicherung hält die Integration das Schreiben kurz an und schließt die Datei ab; was in der
    Zwischenzeit anfällt, wird danach geschrieben.
  - PostgreSQL: Das Add-on „TimescaleDB“ macht vor jeder Sicherung einen vollständigen Abzug (`pg_dumpall`), der in der
    Sicherung liegt.
- **Von Hand:** Einstellungen → System → Backups → **Jetzt sichern** (dieselben Einstellungen wie nachts).
- **Schlüssel:** Die Sicherungen sind verschlüsselt. Ohne den Schlüssel (Einstellungen → System → Backups → Backup-Einstellungen →
  Verschlüsselungsschlüssel, dort auch „Notfallkit herunterladen“) lässt sich keine Sicherung zurückspielen – Herbert
  verwahrt ihn außerhalb des Pi (geprüft 08.10.2026).
- **Kopien neben der Datenbank:** Vor jedem Umbau der Datenbank bleibt eine Kopie `baustelle.db.vor-<Nummer>` liegen
  (z. B. `vor-8`), vor der Übernahme der Altdaten `baustelle.db.vor-uebernahme`.

## 4. Wiederherstellen

**A – Ganzes System** (Pi kaputt, SD/SSD neu, alles verloren): HA OS neu installieren, beim Einrichten „Aus Sicherung
wiederherstellen“ wählen, Sicherungsdatei und Schlüssel angeben. Danach läuft alles wie zum Zeitpunkt der Sicherung,
auch das Add-on TimescaleDB mit seinen Daten. Die Plugs heizen in der Zwischenzeit nach ihrem Notprogramm (Abschnitt 5).

**B – Nur die Datenbank der Baustelle** (Datei kaputt, Sensor „Datenbank“ zeigt `fehler`):

- SQLite: Einstellungen → System → Backups → die Sicherung wählen → **Wiederherstellen** → nur „Home Assistant“
  (Einstellungen und Dateien). Schneller, wenn der Fehler nach einem Umbau kam: im Terminal
  ```
  cd /config/baustelle
  mv baustelle.db baustelle.db.kaputt
  rm -f baustelle.db-wal baustelle.db-shm
  cp baustelle.db.vor-8 baustelle.db
  ```
  dann HA neu starten (`tools/neustart.sh`). Was seit der Kopie dazukam, fehlt dann.
- PostgreSQL: in der Sicherung nur das Add-on „TimescaleDB“ wiederherstellen; das Add-on spielt den Abzug beim Start
  selbst zurück.

**C – Eine frühere Version der Integration** (neue Version macht Probleme), ohne Internet:
```
cd /config/projekte/ha-baustrommanager
git log --oneline | head            # Commit der vorigen Version suchen, z. B. 986d038
git worktree add --detach /tmp/rueckweg 986d038
/tmp/rueckweg/tools/deploy.sh
tools/neustart.sh
git worktree remove /tmp/rueckweg
```
Die Datenbank bleibt dabei; eine ältere Version lässt eine neuere Datenbank unangetastet und meldet es (dann B).

**D – Vom Server zurück auf die SQLite-Datei:** Entwicklerwerkzeuge → Aktionen → `baustelle.datenbank_rueckweg`
ausführen (nur Admins). Es entsteht `/config/baustelle/baustelle-aus-postgres-<Zeit>.db` mit den Daten dieser
Instanz. Dann `db_url` aus `/config/packages/baustelle.yaml` entfernen, die alte `baustelle.db` umbenennen, die neue in
`baustelle.db` umbenennen, Neustart.

## 5. Störungen

| Störung | Was passiert | Was tun |
|---|---|---|
| **Plug nicht erreichbar** (WLAN, Strom am Plug) | Warnung auf der Seite und im Protokoll, je nach Einstellung der Meldungen auch aufs Handy; der Container wird nicht mehr geschaltet, der Verbrauch zählt weiter mit dem letzten Stand | Plug prüfen (Strom, WLAN der Baustelle). Kommt er zurück, verschwindet die Warnung von selbst |
| **Notbetrieb** (HA, Internet oder VPN zur Baustelle weg) | Nach 15 min ohne Lebenszeichen heizen die Plugs nach dem gespeicherten Programm der nächsten 7 Tage weiter (Fühler am Plug, Tür, Frostschutz); keine Staffelung. Taste am Plug = 1 h heizen | Ursache beheben. Danach übernimmt HA wieder; das Stundenbuch der Plugs wird nachgetragen (Protokoll „Notbetrieb“). Stand: ⚙ → Notprogramm |
| **VPN weg** (Pi zu Hause, Baustelle draußen) | wie Notbetrieb; HA sieht alle Plugs als nicht erreichbar, Nachrichten kommen trotzdem (HA läuft) | VPN/Router der Baustelle prüfen; nichts geht verloren |
| **Strom auf der Baustelle weg** | Plugs aus; nach Rückkehr holen sie die Uhrzeit vom Router (FRITZ!Box). Ohne Uhrzeit nur Frostschutz | Router muss zuerst laufen (USV empfohlen) |
| **Datenbank-Server weg** (nur mit `db_url`) | Die Steuerung läuft weiter; Schreibvorgänge warten, nach 30 min kommen sie in den Puffer. Sensor „Datenbank“: `fehler`, Attribut `puffer` > 0 | Add-on TimescaleDB starten bzw. Server prüfen. Danach schreibt die Integration alles in der richtigen Reihenfolge nach (Puffer wird leer) |
| **Datenbank: Anmeldung abgelehnt** (Protokoll „password authentication failed for user baustelle“) | wie Datenbank-Server weg: Steuerung läuft, Puffer füllt sich; Einstellungen aus der Store-Kopie | Passwort in `secrets.yaml` (`baustelle_db_url`) und in der Datenbank passen nicht zusammen. Im Terminal-Fenster (nicht mit `!`): `tools/db-einrichten.sh --postgres-zuruecksetzen` – setzt ein neues postgres-Passwort und `baustelle` wie in `secrets.yaml`; das Add-on startet dabei zweimal neu. Danach Baustelle unter Geräte & Dienste neu laden, damit die Einstellungen wieder aus der Datenbank kommen |
| **postgres-Passwort vergessen** | – (nur Verwaltung betroffen) | wie oben `tools/db-einrichten.sh --postgres-zuruecksetzen`. Die Option `pg_hba_config` des Add-ons nicht verwenden: sie schreibt eine ungültige Zeile, das Add-on startet dann nicht mehr |
| **Datenbank-Datei kaputt** | Sensor „Datenbank“: `fehler`; Einstellungen kommen aus der Store-Kopie, die Steuerung läuft weiter | Abschnitt 4 B |
| **Nichts wird geschaltet** | – | Automatik aus? (startet nach jeder Einrichtung aus) Baustelle abgeschlossen, Heizgrenze, Feiertag/Urlaub, Handbetrieb – Grund steht auf der Seite und im Protokoll |
| **Reparatur-Hinweis „Entität fehlt“** | ein zugeordneter Shelly, Fühler, Wetter oder Kalender ist weg/umbenannt | im Unter-Eintrag der Baustelle bzw. unter Konfigurieren neu wählen |

**Mehr sehen:** Einstellungen → Geräte & Dienste → Baustelle → ⋮ → **Diagnose herunterladen**. Darin unter
`datenbank`: Zustand, Art (sqlite/postgresql), Aufbau, Warteschlange, Puffer, Größe und `stand` (Zeilen je Tabelle,
erste und letzte Minute, Ticket-Zähler) – stehen die Minuten nicht bei „jetzt“, wird nicht mitgeschrieben.

## 6. Meldungen (Tickets)

Der Melden-Knopf auf der Seite legt Fehler (FE), Wünsche (WU) und Anregungen (AN) an. Lesen: `/config/baustelle/meldungen.md`
oder im Terminal `python3 /config/projekte/ha-baustrommanager/tools/ticket.py liste`. Abgearbeitet werden sie im Projekt
(Ticket-Profil in `CLAUDE.md`).
