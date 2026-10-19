# Tracker-Konfiguration – BSM Baustrommanager (ha-baustrommanager)

Für den Skill tracker (Skill-Profil → Tracker → Config). Übernommen am 07.10.2026 aus `projects/bsm/` des Skill-Repos
claude-workbench (dort entfernt) und dem früheren Abschnitt `## Tracker-Profil` der `CLAUDE.md`. Quelle der Wahrheit
ist ClickUp selbst; Fahrplan (`docs/fahrplan.md`) und Baupläne bleiben für die Reihenfolge führend.

## Inhalt

- Provider
- Nummernschema und nächste freie Nummer
- Listen und Routing
- Statusmodell
- Felder und Option-IDs
- Titel- und Beschreibungsformat
- Quittungsformat
- Sonderfälle

## Provider

ClickUp · Space „Smart Home“ `1200660000001609`

## Nummernschema und nächste freie Nummer

```
BSM-<NNN> | <KÜRZEL> | <Schritt> <Kurztitel>
```

- `BSM-NNN` dreistellig, global über die Liste, nie wiederverwendet.
- **Nächste freie Nummer: BSM-035** (nach jedem `tracker neu` +1, mit committen)
- `<Schritt>` = Nummer im Fahrplan (`A1` … `H4`); neue Aufgaben bekommen einen Schritt im Fahrplan (dort eintragen).
- Kürzel: `DB` (eigene Datenbank, db/, Datenbank-Phasen), `NOTPROG` (Notprogramm in den Shellys), `SHELLY` (Geräte,
  Hardware, Firmware, Router), `SEITE` (frontend, Mockups), `KERN` (Integration: steuerung, funktionen, logik),
  `DOKU` (docs, README, Präsentation), `BETRIEB` (Firma, Datenschutz, Stabilisieren, Einarbeitung).
- Keine Parents; alle BSM-Aufgaben flach.

## Listen und Routing

| Liste | Listen-ID | Zweck |
|---|---|---|
| BSM Baustrommanager | `1200660000007163` | alle Aufgaben des Fahrplans (`docs/fahrplan.md`) |

Alle `tracker`-Kommandos dieses Projekts gehen in diese Liste. Skill-Issues gehören in den Space „Claude Skills
Entwicklung“ (Tracker-Config des Skill-Repos claude-workbench).

## Statusmodell

| Status | Typ | Bedeutung im Projekt |
|--------|-----|----------------------|
| `backlog` | open | eingeplant im Fahrplan, noch nicht begonnen |
| `scoping` | custom | Analyse/Bauplan läuft |
| `in design` | custom | Mockup in Arbeit |
| `ready for development` | custom | Plan fertig, Bau kann starten |
| `in development` | custom | Claude Code baut |
| `in review` | custom | Tests grün, Doku offen |
| `testing` | custom | eingespielt, **Prüfung durch Herbert offen** |
| `shipped` | done | Herbert hat abgenommen |
| `cancelled` | closed | verworfen |

**Übergänge:** `tracker start` → `in development`; `tracker done` → `testing` (nicht `shipped` – abnehmen macht
Herbert); `tracker abgenommen` (nur Herbert) → `shipped`.

Status immer kleingeschrieben.

## Felder und Option-IDs

| Feld | ID | Typ | Phase | Inhalt |
|------|----|----|----|--------|
| **Typ** | `5b45b13a-a866-4a5a-83e2-eea2ea1128b8` | drop_down | neu | Bug / Trigger-Fehler / Doku-Fehler / Verbesserung / Refactor-Idee |
| **Aufwand** | `ecc194e5-2c67-46a7-b4d1-177ce3512c10` | drop_down | neu | S (<1h) / M (1-4h) / L (halber Tag) / XL (>1 Tag) |
| **Zielversion** | `0d81392b-1508-4748-aa4d-a2245f9de922` | short_text | neu | Integrationsversion, z. B. „0.9.0“ (optional) |
| **Komponente** | `43ba3a26-d744-4021-b199-6ee837b349f6` | short_text | neu | Hauptdateien/Module, z. B. `logik/zaehlen.py` |
| **Zugehörige Docs** | `421cf05a-d02a-40b9-aca7-1dc086536f36` | text | neu | z. B. `docs/bauplan-datenbank.md, docs/fahrplan.md` |
| **Commit ID** | `a851a04d-f34a-429f-abce-bec0b0b6859f` | short_text | done | 7-stelliger Hash |
| **Commit Text** | `cae9f6cb-e0eb-44aa-81f8-df2e1194111e` | text | done | Erste Zeile der Commit-Message |
| **Erledigt** | `457bde4f-c9c1-40ab-b464-897b7f87e6bc` | date | done | YYYY-MM-DD |
| **Chat-Anker temp** | `a83995c0-dc54-4edc-b295-eed8093cbe3b` | short_text | neu | TEMP-ID |
| **Chat-Anker erstellt** | `192dfca6-2202-4854-ad16-526d5d17ce22` | short_text | neu | `[BSM-ANCHOR-<task-id>] - erstellt: …` (nur ASCII-Bindestrich) |
| **Chat-Anker erledigt** | `0c72a2ea-630e-4320-9cdb-80a19bc5ebb6` | short_text | done | `[BSM-ANCHOR-<task-id>] - erledigt: …` |
| **Issue-ID** | `e286a04a-d79b-481a-8ee4-9c9401a87bfc` | short_text | – | nicht genutzt |
| **Bauplan-Phase** | `99d1d38e-4a82-402b-8327-7496ddd84569` | drop_down | – | Heidi-Optionen, **in BSM leer lassen** (Etappe als Tag) |

Typ:

| Option | Option-ID | Wann |
|--------|-----------|------|
| Bug | `2519a0e3-5ef4-4913-96b9-6a297343326d` | Fehler im Code/Daten |
| Trigger-Fehler | `9e98787e-8956-4212-86ed-789276f4aa3e` | – (Skill-Issues) |
| Doku-Fehler | `d1116505-fd85-4283-bab8-9e657e6ea833` | falsche/fehlende Doku |
| Verbesserung | `6fcb6a19-d22e-4a36-b3f2-047523e41ad6` | neue oder bessere Funktion, Betrieb |
| Refactor-Idee | `3dfdb7a5-39b1-433d-b550-dc05a371de47` | Umbau ohne Verhaltensänderung |

Aufwand:

| Option | Option-ID |
|--------|-----------|
| S (<1h) | `805fd010-b820-46b1-acaa-8b2e047904e6` |
| M (1-4h) | `0298c9b6-9116-4c9e-bb74-d78a41bfe975` |
| L (halber Tag) | `7646181a-b2ff-4eaa-a61b-0d378c0e91d3` |
| XL (>1 Tag) | `6b7587cc-2031-44c4-8b95-74a2d73c87a7` |

## Titel- und Beschreibungsformat

Titel siehe Nummernschema. Template aus `skills/tracker/references/create-task.md` (Problem, Lösungsansatz, Acceptance Criteria, Definition of
Done, Abhängigkeiten). DoD im Projekt: Code + Test, Prüfläufe grün (logik, integration, panel, mypy), CHANGELOG,
eingespielt; bei Aufgaben für Herbert „(Herbert)“ dazuschreiben. Verweis auf den Fahrplan-Schritt unter
„Abhängigkeiten“.

## Quittungsformat

`✅ BSM-NNN — [BSM-ANCHOR-<task-id>] — <typ>: <kurz>`; Felder „Chat-Anker temp/erstellt/erledigt“ sind auf der Liste
vorhanden, Feldwerte mit ASCII-Bindestrich statt Gedankenstrich.

## Sonderfälle

- **Etappe als Tag:** `etappe-a` … `etappe-h`, Gruppieren in ClickUp nach Tag. Das Feld „Bauplan-Phase“ bleibt leer.
- **Melden-Tickets** (`FE-/WU-/AN-NNNN`) laufen nicht über ClickUp, sondern über den Skill ticket (Ticket-Profil der
  `CLAUDE.md`).
- Kein Gedankenstrich `—` in Feldwerten (ClickUp lehnt sonst ab); Option-IDs nie raten.
