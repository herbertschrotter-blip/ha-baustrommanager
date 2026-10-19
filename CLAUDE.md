# ha-baustrommanager – Baustrommanager (BSM)

Eigene Home-Assistant-Integration `baustelle`: Heizung in Baustellencontainern und Pumpenüberwachung mit Shellys, mit
eigener Seite „Baustrommanager (BSM)“ in der Seitenleiste. Zweck, Aufbau und Auslieferung stehen in `README.md`; die abgenommene Planung ist
`mockups/baustelle.html` (Abnahme in `mockups/README.md`).

## Regeln

- **Quelle der Wahrheit ist dieses Repo.** In `/config` nur über `tools/deploy.sh` ausliefern, dort nie direkt ändern.
  `custom_components/**` in `/config` ist für Claude gesperrt: Das Einspielen führt Herbert aus
  (`! /config/projekte/ha-baustrommanager/tools/deploy.sh`), danach Neustart durch Herbert.
- **Bewährte Lösungen statt Eigenbau** (Herbert, 29.09.2026): Aufbau nach `integration_blueprint` und den Kern-Helfern
  (Vorbild `bayesian`: Subentries, Update-Listener mit Reload); eingebaute Integrationen nutzen, wo es sie gibt
  (Feiertage/`holiday`, lokaler Kalender, `weather.get_forecasts`, `notify.mobile_app_*`, später `history_stats`).
- **Fachlogik frei von HA-Code** in `custom_components/baustelle/logik/`; Änderungen dort immer mit Test in `tests/logik/`.
- **Jede Fachregel genau einmal, nur in `logik/`** (mit Test). **Die Seite rechnet nichts Fachliches**: Zahlen, Firmen,
  Heiztage, Auswertung und CSV kommen von der Integration (`baustelle/struktur`, `baustelle/auswertung`,
  `baustelle/abrechnung`), auch € und %, wo die Integration sie liefert; die Seite zeigt nur an (Bauplan
  `docs/bauplan-module.md`, Ausnahmen nur wie dort in §5 begründet).
- **Die Seite wird gebaut** (BSM-022, `docs/bauplan-lit.md`): Quelle `frontend/src/`, nie `baustelle-panel.js` von Hand
  ändern. Nach jeder Änderung an Seite oder CHANGELOG: `python3 tools/changelog.py` → `node
  custom_components/baustelle/frontend/bauen.mjs` → `node mockups/quelle/glas.js` (einmalig `npm ci` im Frontend-Ordner).
- **Master-Mockup `mockups/glas.html` = die echte Seite mit Beispieldaten** (`node mockups/quelle/glas.js`, der Panel-Test
  prüft, dass es aktuell ist). Vorschläge zu Tickets als eigene Variantendatei daneben (`mockups/README.md`).
- **Neue Funktion = neues Modul in `funktionen/`** nach der Schnittstelle in `funktionen/basis.py`, eingetragen in
  `funktionen.FUNKTIONEN`; `steuerung.py` mit `kern/` (Kern) kennt keine Heizungs- oder Pumpen-Einzelheiten und bleibt dabei
  unverändert. Anleitung: `docs/funktion-anlegen.md`.
- **Die Staffelung bleibt im Kern** (alle Funktionen teilen sich die Stromanschlüsse); eine Funktion liefert nur
  `schaltbar`, `standard_kw`, `staffel_vorrang`, `staffel_feld`.
- **Die Automatik startet ausgeschaltet.** Die Integration schaltet Shellys nur, wenn Herbert sie einschaltet.
- **Neustart nur durch Herbert** oder nach seiner ausdrücklichen Bestätigung, vorher die Konfiguration prüfen.
- **Geräte steuern** (Shellys, Verbraucher auf der Baustelle) nur auf Auftrag.
- **Keine Geheimnisse:** Zugangsdaten nur als `!secret <schlüssel>`; keine Koordinaten, Gerätekennungen oder Tokens im
  Repo.
- Vor Änderungen an Automationen, Skripten, Helfern oder Dashboards die Best-Practices des Home-Assistant-MCP-Servers
  lesen (`skill://home-assistant-best-practices/SKILL.md`).
- Entitäten über `entity_id` ansprechen, nicht über `device_id`.

## Skill-Profil

- Profil-Version: 1
- Projekt-ID: ha-baustrommanager
- Repo: herbertschrotter-blip/ha-baustrommanager
- Branch-Policy: current

### Checks
- logik: python3 -m pytest -q -p no:cacheprovider tests/logik [custom_components/baustelle/logik/**; tests/logik/**]
- integration: uv run --no-project --python 3.14 --index-strategy unsafe-best-match --with pytest-homeassistant-custom-component --with home-assistant-frontend==20260826.7 --with pytest-xdist==3.8.0 python -m pytest -q -p no:cacheprovider -n auto tests/integration [custom_components/**; tests/integration/**]
- integration-pg: BAUSTELLE_TEST_PG=$(tools/pg-test.sh) uv run --offline --no-project --python 3.14 --index-strategy unsafe-best-match --with pytest-homeassistant-custom-component --with home-assistant-frontend==20260826.7 --with "psycopg[binary]==3.3.6" --with pytest-xdist==3.8.0 python -m pytest -q -p no:cacheprovider -n auto tests/integration [custom_components/baustelle/db/**; custom_components/baustelle/__init__.py; tests/integration/conftest.py; tests/integration/test_datenbank*.py; tools/pg-test.sh]
- panel: node --check custom_components/baustelle/frontend/baustelle-panel.js; node tests/panel/test_panel.js custom_components/baustelle/frontend/baustelle-panel.js tests/panel/struktur-0.7.json [custom_components/baustelle/frontend/**; tests/panel/**]
- notprogramm: node --check custom_components/baustelle/shelly/notprogramm.js; node tests/shelly/test_notprogramm.js custom_components/baustelle/shelly/notprogramm.js [custom_components/baustelle/shelly/**; tests/shelly/**]
- seite-gebaut: python3 tools/changelog.py --pruefen; node custom_components/baustelle/frontend/bauen.mjs --pruefen; node mockups/quelle/glas.js --pruefen [CHANGELOG.md; custom_components/baustelle/frontend/**; custom_components/baustelle/manifest.json; mockups/**; tests/panel/**]
- browser: node tests/panel/browser/pruefen.mjs [custom_components/baustelle/frontend/**; mockups/**; tests/panel/**]

### Commit
- Format: [vX.Y.Z] Modul, Typ: Kurztitel
- Module: Integration=custom_components/**; Tests=tests/**; Werkzeuge=tools/**, .github/**; Doku=*.md, mockups/**
- Versionsquelle: changelog:CHANGELOG.md
- Versionsregel: MINOR nur für eine wirklich neue Funktion, die es vorher nicht gab; Verbesserungen, Korrekturen und Umbauten (auch neue Gestaltung bestehender Seiten, z. B. neue Übersicht) sind PATCH – im Zweifel PATCH; Commits nur an Doku, Tests oder Werkzeugen behalten die Nummer; `custom_components/baustelle/manifest.json#version` zieht mit (Herbert, 29.09.2026)
- Push-Policy: user-only
- Pre-Commit-Checks: seite-gebaut; logik; integration; integration-pg; panel; notprogramm; browser
- Doku-Check: none

### Code
- Stacks: python; home-assistant-yaml; typescript-lit
- Pflichtkontext: CLAUDE.md; README.md; mockups/README.md
- Aufgabenquelle: none
- Architekturregeln: ref:https://github.com/herbertschrotter-blip/claude-workbench/blob/main/docs/ha-grundsatz/README.md#HA-Grundsatzregeln
- Tests: seite-gebaut; logik; integration; integration-pg; panel; notprogramm; browser
- Auslieferung: ref:README.md#Auslieferung
- Mockup-Policy: none
- Befund-Ort: none

### Doku
- Router: none
- Standard: none
- Pflichtdokumente: none
- Validierungsregeln: none
- Sitzungsabschluss: none
- Entscheidungs-Ort: none

### Tracker
- Provider: clickup
- Config: .claude/skill-config/tracker.md

### Ticket
- Config: ref:CLAUDE.md#Ticket-Profil

### Mockup
- Ablage: mockups
- Designquelle: HA-Standard-Theme und eingebaute Karten (kein eigenes Theme; im Mockup als CSS-Variablen nachgebildet)
- Ansichten: Desktop; 390 px
- Abnahme-Ort: mockups/README.md

### Review
- Config: ref:CLAUDE.md#Review-Profil

### Modul
- Manifest: none
- Grundsatzregeln: ref:https://github.com/herbertschrotter-blip/claude-workbench/blob/main/docs/ha-grundsatz/README.md#HA-Grundsatzregeln

## Review-Profil

- Review-Ablage: `docs/chatgpt-reviews/` (Serien `CGR-<Datum>-<thema>`, Übersicht `INDEX.md`)
- Themen: seite-lit, notprogramm, datenbank, integration, hochrechnung
- GitHub-Repo: herbertschrotter-blip/ha-baustrommanager (Branch nach Branch-Policy, derzeit `main`)
- Pflicht-Block: „Regeln der Integration“ – Fachlogik nur in `logik/` (mit Test), die Seite rechnet nichts Fachliches,
  ausgeliefert wird eine Datei `frontend/baustelle-panel.js`, Master-Mockup `mockups/glas.html` = echte Seite mit
  Beispieldaten, Pilotbaustelle läuft produktiv (kein Risiko im Betrieb, Stufen einzeln einspielbar), Automatik startet
  aus, Geräte steuern nur auf Auftrag
- Kontextquelle: CLAUDE.md (Regeln), README.md (Aufbau, Auslieferung), `docs/bauplan-module.md` §1, der Bauplan des Themas;
  höchstens 3–5 Blöcke
- Reviewer-Rolle: erfahrener Frontend-Architekt für Web Components, Lit und Home-Assistant-Custom-Panels
- Ergebnis-Ort: Bauplan des Themas (Abschnitt „Entscheidungen“), offene Punkte als BSM-Tasks (Tracker-Config)

## Ticket-Profil

Tickets = Meldungen aus dem Melden-Knopf der Seite (Herbert, 30.09.2026). Die Integration sammelt sie nur und legt sie
lesbar ab (`/config/baustelle/meldungen.json`, `meldungen.md`). Abgearbeitet wird in Claude Code im Projekt (eigenes
Fenster: tmux-Sitzung „Baustelle-Dashboard“, Fenster „Tickets“: `tools/tickets-fenster.sh`): Herbert startet mit „Tickets prüfen“, Claude holt die offenen
Tickets und bearbeitet sie einzeln nach dem Skill `ticket`. **Bei Erfolg** (behoben, Tests grün, eingespielt) setzt
Claude das Ticket auf `geschlossen` – mit Version, Commit und kurzer Notiz; Herbert kann es auf der Seite wieder öffnen.

- Präfix: `FE-NNNN` Fehler, `WU-NNNN` Wunsch, `AN-NNNN` Anregung (je Art ab 0001 aufsteigend)
- Befehle: `python3 tools/ticket.py liste [alle]` · `zeige <nr>` · `status <nr> <status> [--version X --commit Y --notiz T]` ·
  `notiz <nr> "<text>"` · `verwerfen <nr> "<grund>"` (liest `/config/baustelle/meldungen.json`, ändert nur über den
  Dienst `baustelle.ticket`)
- Status: `neu → angenommen → in_arbeit → geloest → geschlossen`, daneben `verworfen`
- Pflichtangaben: geschlossen → Version + Commit + Notiz (was behoben wurde) · verworfen → Grund
- Aufgaben: kein Tracker – Befund und Plan als Notiz am Ticket
- Beweise nachlesen: `zeige <nr>` (Fenster, Stand der Seite, Screenshots als `bild:`-Zeilen – mit Read ansehen), HA-Logbuch und Protokoll der Baustelle, Diagnose
- Regeln: `docs/bauplan-0.7.md`, Mockup `mockups/glas.html`
- Doku: CHANGELOG.md-Eintrag nennt die Ticketnummer
