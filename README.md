# ha-baustrommanager – Baustrommanager (BSM)

Eigene Home-Assistant-Integration **Baustelle**: Heizkörper in Baustellencontainern über Shellys nach Zeitplan und Wetter
schalten und Grundwasserpumpen überwachen – je Baustelle, mit Containern und Shellys, die man in HA zuordnet.
Vorlage der Oberfläche ist das abgenommene Mockup `mockups/glas.html` (Abnahme 30.09.2026, `mockups/README.md`);
Bauplan und Schnittstelle stehen in `docs/bauplan-0.7.md` und `docs/api-0.7.md`.

## Funktionen (Stand 0.8.122)

- **Einrichtung** unter Einstellungen → Geräte & Dienste → Baustelle: je Baustelle ein Eintrag; darin
  **Container / Pumpenschächte** und **Shellys** als Unter-Einträge (auch direkt von der Seite aus). Ein Shelly gehört nur
  einer aktiven Baustelle; Leistungs- und Energiesensor werden am Shelly automatisch gefunden.
- **Alle Einstellungen auf der Seite „Baustelle“**: Arbeitszeiten mit Startdatum und Einmal-Ausnahmen, Vor-/Nachheizen,
  Kleidung trocknen, Kälte-Frühstart, Heizgrenze, Frostschutz, Solltemperatur, je Container Automatik/Trocknen/Soll/
  nur bei Bedarf, Türkontakt, Stromanschlüsse und Staffelung, Firmen, Meldungen, Bericht, Notprogramm, Aussehen der
  Container. Jede Änderung mit Benutzer und Zeit in der eigenen Datenbank (die Store-Datei unter `.storage/` bleibt nur
  als Kopie). Als Entitäten bleiben der Automatik-Schalter und die Sensoren.
- **Heizung**: in der Arbeitszeit (plus Vor-/Nachheizen, nach Regen länger) – mit Fühler auf Soll, ohne Fühler an und der
  Heizkörperthermostat regelt; Staffelung je Anschluss (nur Heizkörper werden geschaltet); Bedarfs-Container über
  Schalter oder Termine aus einem Kalender; schnell aufheizen; „alle jetzt heizen“; jede offene Tür und jedes offene oder gekippte Fenster pausiert (Sensoren aus
  Türkontakt und Aussehen).
- **Warnungen, Protokoll, Nachrichten**: Störungen und Hinweise, dauerhaftes Protokoll (auch im Logbuch), Handy-Nachrichten
  mit Knöpfen, Wochen-/Monatsbericht per Handy und E-Mail (CSV-Anhang nur mit dem SMTP-Dienst).
- **Verbrauch und Kosten**: Zähler je Baustelle und Container wie bisher (bleiben beim Umstieg erhalten), Auswertung je
  Container, Firma und über alle laufenden Baustellen, Abrechnung als CSV, Vergleich Ölradiator/Konvektor.
- **Eigene Datenbank**: alle Daten (Einstellungen, Minutenwerte, jede Schaltung, Tagessummen, Protokoll, Meldungen) für
  immer – SQLite auf dem Pi oder ein gemeinsamer PostgreSQL-Server mit TimescaleDB für mehrere Instanzen, mit Puffer bei
  Ausfall und Ansichten für Excel/Power BI (Einrichtung unten, Betrieb `docs/betrieb.md`).
- **Notprogramm in den Plugs**: Fällt HA, Internet oder VPN aus, heizen die Shelly-Plugs nach dem übertragenen Programm
  der nächsten 7 Tage weiter (Fühler, Türen und Fenster am Plug, Frostschutz, Taste = 1 h heizen); danach trägt die Integration das
  Stundenbuch nach.
- **Container-Inventar** (im Aufbau, BSM-031): eigene Container mit fester Nummer für die ganze Firma und Fremdcontainer
  mit Firmenkürzel, Ausrüstung mit Status und Geschichte, Namen nach dem Schema (`002_C_MAN`, `002-01_C_PLUG_MAN`,
  deutsche Kürzel). Datenbank und Schnittstelle sind da, Umbenennen nach dem Schema samt Entity-IDs geht über die
  Schnittstelle (Vorschau, Übernehmen, auch den Namen im Plug, Nachholen, Rückgängig), Geräte aus HA zuordnen samt Verdrahtung,
  Status verliehen/defekt – auf der Seite unter Einstellungen › 🔌 Geräte › 📦 Inventar (`docs/bauplan-inventar.md`).
- **Geräte an einer Stelle** (BSM-034): Einstellungen › 🔌 Geräte zeigt alle Shellys und Sensoren je Container mit
  Zustand, Batterie, Signal, Status (aktiv/inaktiv/verliehen/defekt) und Warnungen; ein Gerätedialog; das Inventar
  gleicht sich mit HA ab (`docs/bauplan-geraete.md`).

## Aufbau

Vier Schichten, der Weg geht nur in eine Richtung: **Fachlogik → Funktionen → Kern → Ausgabe**. Die Seite zeigt an, was
die Integration liefert, und rechnet nichts Fachliches nach (Bauplan `docs/bauplan-module.md`). Bewusste Ausnahmen
(Bauplan §5): Verbräuche, die die Seite selbst als Diagramm aus der Statistik zeigt (Verbrauch-Block mit frei gewählten
Reihen, „Kosten heute“ am Container, Hinweise beim Zeigen auf ein Diagramm), rechnet sie zur Anzeige mit dem Preis der
Baustelle in € um; die Vorschau im Anschluss-Formular rechnet mit den noch nicht gespeicherten Eingaben. Alle anderen
€ und % – Kennzahlen, Abrechnung, Je Gerät, Ohne Automatik, Hochrechnung, Verlauf, CSV – kommen von der Integration.

| Schicht | Wo | Was |
|---|---|---|
| Fachlogik | `logik/` | jede Fachregel genau einmal, ohne HA-Code, mit Test in `tests/logik/`: Arbeitszeit/Tagesplan, Regelung (Soll je Container), Staffelung, Pumpen, Warnungen, Zählen, Firma, Auswertung/Abrechnung, Bericht |
| Funktionen | `funktionen/` | je Funktion ein Modul mit der Schnittstelle aus `basis.py` (heute `heizung/` als Paket, `pumpen.py`; Liste `FUNKTIONEN` in `__init__.py`): Soll, Anzeige, Warnungen, Zähler, Status, Handbetrieb der Funktion – ruft `logik/` |
| Kern | `steuerung.py` + `kern/` | Einrichtung, Ereignisse, Wetter, Kalender, **Staffelung** (für alle Funktionen gemeinsam, ein Anschluss), Schalten, Protokoll, Status; ruft nur die Methoden der Funktionen und kennt keine Heizungs- oder Pumpen-Einzelheiten |
| Ausgabe | `sensor.py`, `binary_sensor.py`, `switch.py`, `daten.py`, `panel.py`, `auswertung.py`, `nachrichten.py` | Entitäten, `baustelle/struktur`, Befehle der Seite (`docs/api-0.7.md`), Auswertung aus der Langzeitstatistik, Nachrichten und Bericht |
| Seite | `frontend/baustelle-panel.js` | zeigt nur an (Plan, Status, Auswertung mit € und %, Abrechnung, CSV kommen von der Integration); Reiter nach den eingeschalteten Funktionen |

Eine neue Funktion (z. B. Kühlung) ist ein neues Modul in `funktionen/`, ohne Eingriff in den Kern:
`docs/funktion-anlegen.md`.

```
custom_components/baustelle/   Integration (→ /config/custom_components/baustelle/)
  logik/                       Fachlogik ohne HA-Code (je Thema ein Modul)
  funktionen/                  basis.py (Schnittstelle), heizung/ (Paket: soll, plan, lernregelung, bedarf, hand,
                               anzeige, zaehlen), pumpen.py; FUNKTIONEN in __init__.py
  db/                          eigene Datenbank: Aufbau und Umbau (schema, migration), Schreiber mit Puffer, Umzug und
                               Rückweg SQLite ↔ PostgreSQL, Lesen für Auswertung, Protokoll, Meldungen, Inventar
  inventar.py                  WebSocket-Befehle fürs Container-Inventar (Namen aus logik/inventar.py)
  inventar_geraete.py          Ausrüstung aus HA: Kandidaten, Zuordnen mit Verdrahtung, Bestand, Status, Verweise
  geraete.py                   WebSocket-Befehl baustelle/geraet: Status, Geräte anlegen/ändern/entfernen (über kern/geraete)
  abgleich.py                  Abgleich Inventar ↔ HA (Start, täglich, nach Sensor-Änderungen; nachtragen, „nicht in HA“)
  umbenennen.py                Umbenennen nach dem Schema ausführen (Register, Labels, eigene Verweise, Plug-Name, Nachholen, Rückgängig)
  notprogramm.py, shelly/      Notprogramm: Skript notprogramm.js in die Plugs bringen, Programm, Kopplungen, Nachtrag
  backup.py                    Datenbank während der HA-Sicherung anhalten bzw. abziehen
  steuerung.py                 Kern: Zustand, Ereignisse, Auswertung, Protokoll, Status; leitet weiter an kern/
  kern/                        Einrichtung, Wetter, Kalender, Staffelung, Schalten, Warnungen, Zähler (BSM-023), Geräte (BSM-034)
  auswertung.py                Langzeitstatistik holen und logik/auswertung rechnen lassen (Seite, Bericht, CSV)
  nachrichten.py               Handy-Nachrichten mit Knöpfen, Frühstart-Hinweis, Wochen-/Monatsbericht
  config_flow.py               Einrichtung, Optionen, Subentries Bereich/Gerät
  einstellungen.py             Einstellungen, Protokoll, Meldungen (aus der Datenbank; Store unter .storage/ als Kopie)
  frontend/baustelle-panel.js  eigene Seite (Web-Component, gebaut mit esbuild aus frontend/src – nicht von Hand ändern)
  frontend/src/                Quelle der Seite (wird nicht ausgeliefert)
  frontend/bauen.mjs           baut die Seite (package.json: esbuild; node_modules nicht im Repo)
  frontend/changelog.json      Verlauf für „Über“ (tools/changelog.py aus CHANGELOG.md)
  frontend/version.json        Version für den Bau (tools/changelog.py, setzt auch manifest.json)
  panel.py, daten.py           Seite anmelden, WebSocket-Befehle (docs/api-0.7.md)
  logbook.py                   Protokoll im HA-Logbuch
  translations/, icons.json    Texte de/en, Symbole
  brand/icon.png, icon@2x.png  Symbol der Integration (256/512 px, tools/symbol.py)
tests/logik/                   pytest ohne HA (Python 3.12+)
tests/integration/             pytest-homeassistant-custom-component (Python 3.14+)
tests/panel/                   Seite in Node rendern (ohne Browser)
tools/deploy.sh                Auslieferung nach /config
mockups/                       abgenommener Entwurf
```

Quelle der Wahrheit ist dieses Repo (`/config/projekte/ha-baustrommanager`). `/config` ist nur das Ziel.

## Installation über HACS

1. HACS → Integrationen → ⋮ → **Benutzerdefinierte Repositories** → `https://github.com/herbertschrotter-blip/ha-baustrommanager`,
   Kategorie **Integration**.
2. **Baustelle** herunterladen, Home Assistant neu starten (ab 2026.9). Die Abhängigkeit `psycopg` (für PostgreSQL)
   installiert HA beim ersten Start selbst.
3. Einstellungen → Geräte & Dienste → **Integration hinzufügen** → Baustelle.
4. Ohne weitere Angabe legt die Integration ihre Datenbank als `/config/baustelle/baustelle.db` an. Für einen
   gemeinsamen Server siehe Einrichtung → Datenbank.
5. Seite **Baustrommanager (BSM)** in der Seitenleiste öffnen; nach einem Update die Seite einmal neu laden (unter ⚙ → Über steht
   die Version).

Ohne HACS: Ordner `custom_components/baustelle` nach `/config/custom_components/` kopieren (hier: `tools/deploy.sh`,
siehe Auslieferung), dann neu starten.

## Einrichtung

- **Anlegen:** Name (jeder nur einmal), Beginn (ab dann zeigt der Verlauf Verbrauch und Heiztage), Funktionen Heizung
  und/oder Pumpenüberwachung. Danach gleich den ersten Container anlegen.
- **Container / Pumpenschacht** (Unter-Eintrag): Name, Art, optional Thermostat oder Temperaturfühler.
- **Shelly** (Unter-Eintrag): Bereich, Schalter, Name, Rolle (Heizkörper, Bautrockner, Pumpe, Steckdose), Typ
  (Ölradiator, Konvektor), optional Leistungs- und Energiesensor (sonst am selben Gerät gesucht). Ein Schalter gehört nur
  einer aktiven Baustelle; eine Pumpe nur in einen Pumpenschacht.
- **Konfigurieren** (Optionen): Status aktiv/abgeschlossen, Beginn/Ende, Funktionen, Wetter, Außentemperatur, Regen,
  Kalender für Feiertage und Urlaub, Empfänger der Meldungen, Heizperiode (Monate).
- **Neu konfigurieren:** Baustelle umbenennen; Container und Shellys über ihren Unter-Eintrag.
- Alles Übrige auf der Seite **Baustrommanager (BSM)** unter ⚙ Einstellungen (Seitenleiste mit Gruppen): Baustelle (Beginn, Preise,
  Arbeitszeiten, Ausnahmen), Heizung (Regeln, Vor-/Nachheizen, Heizgrenze, Frostschutz, Soll), Container und Geräte,
  Stromanschlüsse und Staffelung, Firmen (mit Kürzel für Fremdcontainer), Meldungen und Bericht, Notprogramm, Automatik.
  Ändern dürfen nur Admins; vor Ort ohne Admin: Gefühl am Rad, jetzt heizen, Warnung stumm, Melden.
- **Container-Inventar** (ab 0.8.106, Seite unter ⚙ › 📦 Inventar ab 0.8.113): eigene Container bekommen eine Nummer für die ganze Firma, fremde
  `<FIRMA>-NN`; das Firmenkürzel (2–5 Buchstaben) wird bei der Firma hinterlegt.
- **Datenbank** (für die ganze Instanz, wie beim Recorder): ohne Angabe die SQLite-Datei `/config/baustelle/baustelle.db`;
  für einen gemeinsamen Server (PostgreSQL mit TimescaleDB, mehrere Instanzen, Excel/Power BI) in YAML
  `baustelle: db_url: !secret baustelle_db_url` (z. B. `packages/baustelle.yaml`). Beim ersten Start zieht die
  Integration die SQLite-Datei einmal um, die Datei bleibt liegen. Server einrichten: `tools/db-einrichten.sh`
  (Bauplan Datenbank §4a). Ist der Server weg, sammelt die Integration weiter und schreibt später nach
  (`/config/baustelle/puffer/`). Für Excel/Power BI: Benutzer `baustelle_leser`, Ansichten `v_tag_firma`,
  `v_tag_container`, `v_monat_baustelle`, `v_schaltungen`, `v_inventar` (Excel über den ODBC-Treiber psqlODBC: Daten → Daten abrufen → Aus anderen
  Quellen → Aus ODBC; Server = Adresse des Pi, Port 5432 im Add-on freigeben – `docs/api-datenbank.md` §2).

## Was die Integration liefert

- **Seite „Baustrommanager (BSM)“** in der Seitenleiste (Übersicht, Heizung, Pumpen, Auswertung, Protokoll, Einstellungen).
- **Entitäten** je Baustelle: Schalter Automatik, Status, nächste Schaltzeit, Leistung, Zähler für Energie, Kosten,
  Ersparnis und Hochrechnung, Wetterwerte (Diagnose; Tageshöchst, Früh-Prognose und Regen zunächst aus), Erreichbar
  (Diagnose). Je Container Grund, Leistung, Energie, Kosten, Heizzeit; je Shelly Problem, Ø Leistung, bei Pumpen Pumpzeit,
  Zyklen und „läuft“.
- **WebSocket-Befehle** für die Seite und eigene Werkzeuge: `docs/api-0.7.md` (Struktur, Einstellungen, Auswertung,
  Abrechnung, Protokoll, Meldungen, Statistik, Inventar §10).
- **Aktion** `baustelle.ticket`: Ticket aus dem Melden-Knopf ändern (`ticket`, optional `status`, `notiz`, `version`,
  `commit`, `von`); unbekanntes Ticket → Fehler.
- **Aktionen nur für Admins:** `baustelle.notprogramm_pruefen` (Notprogramm aller Plugs jetzt prüfen),
  `baustelle.datenbank_rueckweg` (Daten dieser Instanz aus PostgreSQL in eine neue SQLite-Datei).
- **Daten für außerhalb:** Ansichten für Excel/Power BI und Tabellen der Datenbank – `docs/api-datenbank.md`.
- **Betrieb** (einspielen, sichern, wiederherstellen, Störungen) für eine zweite Person: `docs/betrieb.md`.
- **Geräte:** Shellys oder jeder andere Schalter in HA (`switch.*`); Messwerte aus Leistungs-/Energiesensoren (W, kWh).
  Fühler: Temperatursensor oder Thermostat (`climate`).
- **Aktualisierung:** ohne Abfrage im Takt – bei jeder Zustandsänderung der zugeordneten Entitäten, mindestens jede
  Minute; Wettervorhersage alle 30 min, Kalender alle 15 min.

## Beispiele

- **Container nach Arbeitszeit heizen:** Container mit Fühler, Heizkörper-Shelly zuordnen, auf der Seite Arbeitszeit
  Mo–Do 07:00–16:30 und Vorheizen 45 min einstellen, Automatik ein.
- **Nur Pumpen überwachen:** Baustelle mit Funktion Pumpenüberwachung, Pumpenschacht, Shelly mit Rolle Pumpe;
  Meldung bei Trockenlauf, Dauerlauf oder Ausfall aufs Handy.
- **Eigene Automation:** Auslöser „Binärsensor Erreichbar der Baustelle wird aus“ → z. B. Licht im Büro rot schalten.

## Bekannte Grenzen

- Geschaltet werden nur Schalter-Entitäten; Heizkörper ohne Fühler regeln über ihr eigenes Thermostat.
- Ohne Leistungs- oder Energiesensor zählt die Integration keinen Verbrauch und erkennt kein „zieht keinen Strom“.
- Den CSV-Anhang im Bericht kann nur der SMTP-Dienst von HA mitschicken.
- Handy-Knöpfe nur mit der Companion App (`notify.mobile_app_*`).
- Kühlung und andere Funktionen gibt es noch nicht (Platz dafür ist vorgesehen).

## Fehlerbehebung

- **Reparatur-Hinweis „Entität fehlt“:** ein zugeordneter Shelly, Fühler, Wetter oder Kalender ist weg bzw. umbenannt –
  im Unter-Eintrag oder unter Konfigurieren neu wählen.
- **Nichts wird geschaltet:** Automatik aus (startet aus), Baustelle abgeschlossen, Heizgrenze, Feiertag/Urlaub oder
  Handbetrieb – Status und Grund stehen auf der Seite und im Protokoll.
- **Shelly nicht erreichbar:** steht einmal im Protokoll von HA (`custom_components.baustelle`) und als Warnung auf der
  Seite; ist er zurück, ebenfalls.
- **Mehr sehen:** Diagnose herunterladen (Geräte & Dienste → Baustelle → ⋮ → Diagnose) oder Debug-Protokoll
  einschalten.

## Entfernen

1. Einstellungen → Geräte & Dienste → Baustelle → ⋮ → **Löschen** (je Baustelle). Einstellungen und Reparatur-Hinweise
   der Baustelle werden gelöscht; die Langzeitstatistik der Zähler bleibt in HA.
2. Bei HACS: Baustelle in HACS entfernen, sonst den Ordner `/config/custom_components/baustelle` löschen.
3. Home Assistant neu starten (die Seite verschwindet aus der Seitenleiste).

## Einrichten in Home Assistant (bewährte Bausteine)

1. **Zone** für die Baustelle anlegen (Einstellungen → Bereiche & Zonen). Die Koordinaten bleiben in HA.
2. **Wetter:** Integration **Open-Meteo** mit dieser Zone (oder Met.no mit den Koordinaten). Optional eine
   Wetterstation (z. B. Ecowitt) für gemessene Außentemperatur und Regen.
3. **Feiertage:** Integration **Feiertage** (Österreich, Bundesland) → Kalender-Entität.
4. **Urlaub/Betriebsruhe:** Integration **Lokaler Kalender**, z. B. „Baustelle Urlaub“; Einträge = Zeiträume.
5. **Meldungen:** Companion App am Handy → Dienst `notify.mobile_app_<handy>`.
6. **Baustelle** hinzufügen, Container/Pumpenschächte und Shellys zuordnen, unter „Konfigurieren“ Wetter, Kalender und
   Empfänger wählen. Arbeitszeit, Anschlüsse und Regeln auf der Seite „Baustelle“ einstellen, dann **Automatik** einschalten.

Ohne Wetterstation nimmt die Integration als „Regen“ den für heute vorhergesagten Niederschlag.

## Tests und Qualität

Die Prüfungen vor jedem Commit (Skill-Profil in `CLAUDE.md`, wie `.github/workflows/tests.yml`), dazu mypy:

```
python3 tools/changelog.py --pruefen && node custom_components/baustelle/frontend/bauen.mjs --pruefen \
  && node mockups/quelle/glas.js --pruefen
python3 -m pytest -q -p no:cacheprovider tests/logik
uv run --no-project --python 3.14 --index-strategy unsafe-best-match \
  --with pytest-homeassistant-custom-component --with home-assistant-frontend==20260826.7 --with pytest-xdist==3.8.0 \
  python -m pytest -q -p no:cacheprovider -n auto tests/integration     # parallel auf allen Kernen (Pi: ~3 statt ~10 min)
BAUSTELLE_TEST_PG=$(tools/pg-test.sh) uv run --no-project --python 3.14 --index-strategy unsafe-best-match \
  --with pytest-homeassistant-custom-component --with home-assistant-frontend==20260826.7 --with "psycopg[binary]==3.3.6" \
  --with pytest-xdist==3.8.0 python -m pytest -q -p no:cacheprovider -n auto tests/integration     # dieselben gegen PostgreSQL
node --check custom_components/baustelle/frontend/baustelle-panel.js && node tests/panel/test_panel.js \
  custom_components/baustelle/frontend/baustelle-panel.js tests/panel/struktur-0.7.json
node tests/shelly/test_notprogramm.js custom_components/baustelle/shelly/notprogramm.js
node tests/panel/browser/pruefen.mjs
uv run --no-project --python 3.14 --index-strategy unsafe-best-match \
  --with pytest-homeassistant-custom-component --with mypy mypy --strict custom_components/baustelle
```

Panel- und Browser-Test brauchen einmalig `npm --prefix custom_components/baustelle/frontend ci` (happy-dom,
puppeteer-core). Der Panel-Test läuft im DOM von happy-dom (`tests/panel/umgebung.js`); der Browser-Test bedient das
Master-Mockup in Chromium 136 (B1–B8, B8 = Container am Handy nicht zu breit; Ausgangsprotokoll `docs/lit-ausgangsprotokoll.md`), ohne Verbindung zu HA.
Umbauten ohne Verhaltensänderung belegt `tests/panel/schnappschuss.js` (HTML und Befehle vorher/nachher vergleichen).

Qualitätsskala von Home Assistant: `custom_components/baustelle/quality_scale.yaml` (jede Regel mit Stand und Grund).
Auf GitHub prüfen `.github/workflows/tests.yml` und `validate.yml` (hassfest, HACS, mypy; Versionen fest angeheftet).
Symbol: `custom_components/baustelle/brand/icon.png` (+ `icon@2x.png`), gezeichnet mit `tools/symbol.py`.

## Auslieferung

1. Änderungen im Repo; Seite bauen (einmalig `npm --prefix custom_components/baustelle/frontend ci`, offline mit
   `--offline --cache /config/projekte/.npm-cache-baustelle`):
   `python3 tools/changelog.py && node custom_components/baustelle/frontend/bauen.mjs && node mockups/quelle/glas.js`;
   Tests grün, committen. `deploy.sh` liefert aus `frontend/` nur `baustelle-panel.js` und `changelog.json` aus und
   entfernt im Ziel, was dort nicht hingehört (Quellen, npm-Dateien).
2. Claude spielt ein: `tools/deploy.sh`
   (kopiert die Integration samt Seite nach `/config/custom_components/baustelle/`).
3. Konfiguration prüfen, dann **Neustart mit dem Skill neustart** (neue oder geänderte Integration braucht immer einen Neustart):
   `tools/neustart.sh` prüft die Konfiguration über die HA-API und startet nur bei gültiger neu, dann wartet es, bis HA
   wieder läuft. Der Skill neustart stimmt sich vorher mit den anderen Claude-Sitzungen ab.
4. Einstellungen → Geräte & Dienste → Baustelle prüfen; Protokoll auf Meldungen von `custom_components.baustelle` ansehen.
5. **Datenbank zurück auf SQLite** (nach `db_url`, BSM-026): Dienst `baustelle.datenbank_rueckweg` (nur Admins) legt
   `/config/baustelle/baustelle-aus-postgres-<Zeit>.db` mit den Daten dieser Instanz an; dann `db_url` entfernen, die
   alte `baustelle.db` beiseitelegen, die neue Datei in `baustelle.db` umbenennen, Konfiguration prüfen, Neustart.
6. **Rückweg** auf ein früheres Release (ohne npm und Internet, die gebaute Seite liegt im Repo):
   `git worktree add --detach /tmp/rueckweg <commit>` und `/tmp/rueckweg/tools/deploy.sh`, danach Konfiguration prüfen,
   Neustart, Browser neu laden; `git worktree remove /tmp/rueckweg`. Zur Probe vorher mit `HA_CONFIG=<leerer Ordner>`
   in ein temporäres Ziel ausliefern.

## Nie ins Repo

Zugangsdaten, Koordinaten der Baustelle, Gerätekennungen (MAC, Seriennummern), Tokens, `.storage/`.
