# Fahrplan BSM (Baustrommanager)

Alle offenen Punkte in einer Reihenfolge zum Abhaken: eigene Datenbank (`bauplan-datenbank.md`), Notprogramm in den
Shellys (`bauplan-0.7.md` §9) und die Schwachstellen aus der Bewertung vom 04.10.2026 (`bauplan-0.7.md` §7).
Stand 09.10.2026 (0.8.114). Jeder Schritt ist eine Aufgabe in ClickUp (Liste „BSM Baustrommanager“, Nummer in Klammern, Tag `etappe-a` … `etappe-h`); abgehakt wird hier und dort.

**Erledigt vorher:** Berechtigungen (0.8.49), GitHub-Prüfläufe grün (0.8.50), WU-0018/FE-0021/FE-0022 (Ticket-Fenster).

## Warum diese Reihenfolge

1. **Erst Schutz und kleine Fehler**, die heute schon schaden können (Passwort, Beta-Firmware, 50-kWh-Grenze).
2. **Dann die Datenbank bis Phase 4** – der Pilot merkt nichts, weil sie nur mitschreibt und abgleicht.
3. **Parallel die Hardware fürs Notprogramm** beschaffen und am Gerät erproben (wartet auf Lieferung).
4. **Datenbank umstellen** (Phasen 5–6), dann **Notprogramm bauen** – es braucht die Datenbank fürs Nachtragen.
5. **Code aufteilen**, solange alles frisch ist – danach nichts Großes mehr.
6. **Stabilisieren** mit dem fertigen Aufbau (ein kalter Monat nur Tickets), damit genau das geprüft wird, was die Firma
   bekommt.
7. **Firma:** zentrale Datenbank, Betriebsanleitung, zweite Person.

Abweichung von der Bewertung: Dort stand „erst stabilisieren, dann aufteilen“. Weil die Datenbank (Herberts
Entscheidung: jetzt, auf main) ohnehin viel ändert, wird erst alles Große gebaut und dann am Stück stabilisiert.

## Etappe A – Schutz und kleine Fehler

- [x] ~~**A1** (BSM-001) Shellys: Gerätepasswort~~ – **verworfen** 05.10.2026 (Herbert): Netz der Baustelle bleibt geschlossen; neu bewerten, wenn Fremde ins WLAN/VPN kommen
- [x] **A2** (BSM-002) Heizung 01: nächtliches Auto-Update auf Beta-Firmware abschalten; Firmware aller Plugs auf „stable“ (Herbert, Claude prüft) – erledigt 05.10.2026: Update-Zeitpläne auf Heizung 01 (beta), 03, 04 (stable) gelöscht; Pumpe 3 offen (ausgesteckt)
- [x] **A3** (BSM-003) Datenbank Phase 0: 50-kWh-Grenze bei Lücken richtig stellen (`logik/zaehlen.py`, Test) – erledigt 0.8.52 (89ce622)
- [x] **A4** (BSM-004) Beispieldaten Pumpen im Master-Mockup richtigstellen („203 h Laufzeit heute“, überladene Achse – `tests/panel/beispiel-hass.js`) – erledigt (35a8e80): Beispiel kannte die 5-Minuten-Statistik nicht
- [x] **A5** (BSM-005) Datenschutz klären: welche Benutzer- und Anwesenheitsdaten gespeichert werden (Betriebsrat § 96 ArbVG, DSGVO); Vorgabe für Datenbank Phase 2 (Herbert) – entschieden 05.10.2026: Benutzer nur bei Einstellungen (bis Baustellenende + 1 Jahr), vor Ort ohne Person (`bauplan-datenbank.md` §6)

## Etappe B – Datenbank Grundlage (Pilot merkt nichts)

- [x] **B1** (BSM-006) Phase 1: Grundgerüst `db/` (Schema 1, Verbindung, Migration, Schreiber), `backup.py`, Diagnose-Sensor – erledigt 0.8.53 (86909bc), eingespielt 05.10.2026
- [x] **B2** (BSM-007) Phase 2: Mitschreiben – Einstellungen mit Benutzer, Laufzeit, Ereignisse, Protokoll, Meldungen, Minutenwerte (`logik/minute.py`) – erledigt 0.8.54
- [x] **B3** (BSM-008) Phase 3: Altdaten übernehmen – Store, Verlauf 62 Tage, Langzeitstatistik davor – erledigt 0.8.55/0.8.56, eingespielt 05.10.2026 (Verlauf seit 29.09., 54 Meldungen, 1.000 Protokolleinträge)
- [x] **B4** (BSM-009) Phase 4: Tagessummen (`logik/tag.py`) und Abgleich mit den alten Zählern – erledigt 0.8.57, eingespielt 05.10.2026; Abgleich mit der HA-Statistik ab 02.10. gleich (≤ 0,01 kWh je Container und Tag)

## Etappe C – Notprogramm vorbereiten (parallel, wartet auf Hardware)

- [ ] **C1** (BSM-010) Shelly BLU H&T beschaffen (je Container einer, zuerst einer zum Testen) und an die Plugs koppeln (Herbert)
- [ ] **C2** (BSM-011) Fühler in HA von FRITZ!Smart Control 440 auf BLU H&T umstellen (Einstellungen der Container)
- [x] **C3** (BSM-012) Uhrzeit ohne Internet: Router der Baustelle als Zeitserver prüfen und in den Plugs eintragen – erledigt 05.10.2026 mit FRITZ!Box (Plugs → 192.168.178.1); bei Stromausfall ohne Internet hilft erst eine USV für den Router
- [ ] **C4** (BSM-013) Notprogramm am Gerät erproben: Skript-Speicher, Felder der BTHome-Sensoren, Ereignis der Taste, KVS-Grenzen

## Etappe D – Datenbank umstellen

- [x] **D1** (BSM-014) Phase 5: Lesen aus der Datenbank – Auswertung, Abrechnung, Bericht, CSV, Zähler-Sensoren; `baustelle/verlauf`, Seite ohne direkte HA-Abfragen; Entscheidung Recorder (Sensoren behalten) – erledigt 0.8.58–0.8.60, eingespielt 05.10.2026 (Zähler-Sensoren ziehen mit D2 um)
- [x] **D2** (BSM-015) Phase 6: Store ablösen – Einstellungen und Protokoll nur noch aus der Datenbank, Meldungen in der Datenbank – erledigt 0.8.61 (Store als Kopie bis zur nächsten Version)

## Etappe E – Notprogramm bauen

- [x] **E1** (BSM-016) Skript `notprogramm.js` fertig, mit Simulationstest in Node – erledigt 0.8.62 (`tests/shelly/`, Check `notprogramm`)
- [x] **E2** (BSM-017) Übertragung durch die Integration: Skript einrichten/aktualisieren, Programm (KVS) täglich und bei Änderung, Lebenszeichen alle 5 min (ohne Gerätepasswort) – erledigt 0.8.63, eingespielt und eingeschaltet 05.10.2026 (alle 5 Plugs: Skript v2, Programm geladen, kein Notbetrieb); offen: Kopplungen selbst anlegen
- [x] **E2b** (BSM-030) Kopplungen der Plugs selbst in Ordnung halten: fehlende Fühler/Tür des Containers koppeln, fremde entfernen, Namen nach Schema, Protokoll – erledigt 0.8.65
- [x] **E3** (BSM-018) Taste am Plug = 1 h heizen (mit HA eigene Regel „Taste“, ohne HA im Skript) – erledigt 0.8.72, am Gerät geprüft 06.10.2026 (004-01: Druck → „1 h heizen bis …“)
- [x] **E4** (BSM-019) Anzeige: Notprogramm je Plug (aktiv/fehlt/Fehler, Programm gültig bis), Protokoll „Notbetrieb“ – erledigt 0.8.66, eingespielt 05.10.2026 (Einstellungen › Notprogramm, Jetzt prüfen, Dienst, Warnung)
- [x] **E5** (BSM-020) Datenbank Phase 7: Stundenbuch der Plugs nach einem Ausfall nachtragen – erledigt 0.8.67, eingespielt 06.10.2026 (am echten Ausfall noch nicht erlebt → E6)
- [x] **E6** (BSM-021) Ausfall-Probe auf der Pilotbaustelle – am 07.10.2026 mit 002-01 (Probe-Modus, 120 min): Notbetrieb
  05:11–07:01, Stundenbuch 1,31 kWh/43 min gegen HA 1,30 kWh/44 min (Bauplan 0.7 §9)

## Etappe F – Code aufteilen

- [x] **F1** (BSM-022) Seite zerlegen und schrittweise auf Lit – Bauplan `docs/bauplan-lit.md` (abgenommen 06.10.2026): 0a, 0b.1, 0b.2, 1a, 1b, 1c, 2a.1, 2a.2, dann Entscheidung (5 Ja/Nein) – Unteraufgaben BSM-022.01–.09 – Stufen 0a–5 erledigt bis 0.8.100 (07.10.2026); Abnahme durch Herbert auf S23 und in Edge am 08.10.2026 (0.8.105, `docs/lit-entscheidung.md`)
- [x] **F2** (BSM-023) `steuerung.py` und `funktionen/heizung.py` weiter zerlegen – erledigt 0.8.101 (`kern/`, `funktionen/heizung/`, Bauplan Module §8)
- [x] **F3** (BSM-024) Umstieg der Seite auf Lit-Komponenten planen – erledigt 06.10.2026 (`docs/bauplan-lit.md`, ChatGPT-Review CGR-2026-10-06-seite-lit), geht in F1 auf

## Etappe G – Stabilisieren

- [ ] **G1** (BSM-025) Pilotbetrieb mindestens einen kalten Monat mit dem fertigen Aufbau – nur Tickets, keine neuen Funktionen
- [ ] **G2** (BSM-035) Wackelige Tests stabilisieren: Laufzeit-Grenze im Lasttest `test_ein_tag_aus_einem_monat_minuten` (im vollen Lauf rot, allein grün), PG-Test `test_seite_einstellung_mit_benutzer_vor_ort_ohne` gelegentlich rot

## Etappe H – Betrieb in der Firma

- [ ] **H1** (BSM-026) Datenbank Phase 8: zentral PostgreSQL + TimescaleDB, Puffer bei Verbindungsverlust, Ansichten und Lesebenutzer für Excel/Power BI, mehrere Instanzen – gebaut 0.8.102–0.8.104 (07.10.2026); Server in Betrieb 08.10.2026 (Umzug 149.890 Zeilen, Excel über ODBC geprobt); offen: Datenschutz §6 mit Betriebsrat bestätigen
- [ ] **H2** (BSM-027) Datenbank Phase 9 und Betriebsanleitung: einspielen, sichern, wiederherstellen, Störung; api-Doku auf die Datenbank – geschrieben 0.8.105 (`docs/betrieb.md`, `docs/api-datenbank.md`); durchgespielt 08.10.2026 (Schlüssel, Rückweg C und D); offen: Nachtsicherung mit PostgreSQL-Abzug prüfen
- [ ] **H3** (BSM-028) Zweite Person einarbeiten (Code, Abläufe, Tickets)
- [ ] **H4** (BSM-029) Präsentation für den Chef: Platzhalter füllen (Anzahl Heizkörper der Firma, zweite Baustelle)

## Etappe I – Container-Inventar (BSM-031, Herbert 05.10.2026)

Eigene Container und Ausrüstung als Inventar mit ID und Geschichte; Namen (deutsche Kürzel POL/MAN/…, Endungen deutsch) und Labels automatisch beim Zuordnen mit Vorschau; Fremdcontainer als `<FIRMA>-NN_C_<Art>`, scheiden
nach der Baustelle aus (Daten bleiben). Unteraufgaben in ClickUp:

- [x] **I1** (BSM-031.01) Bauplan und Kürzeltabelle – abgenommen 08.10.2026 (`docs/bauplan-inventar.md`, deutsche Kürzel)
- [x] **I2** (BSM-031.02) Datenbank: Inventar für Container und Ausrüstung – 0.8.106 (Aufbau 9), eingespielt
- [x] **I3** (BSM-031.03) Namens- und Labelregeln in `logik/` – 0.8.106
- [x] **I4** (BSM-031.04) Mockup: Container anlegen, Ausrüstung zuordnen, Vorschau – abgenommen 08.10.2026, Variante 1 (`mockups/inventar.html`)
- [x] **I5** (BSM-031.05) WebSocket-API Inventar und Rechte – 0.8.107
- [x] **I6** (BSM-031.06) Umbenennen ausführen (HA, Plug, BTHome, Labels, Verweise) – 06a Vorschau in 0.8.108, 06b Ausführen in HA in 0.8.109, 06c Plug-Name/Nachholen in 0.8.110, 06d Rückgängig in 0.8.111
- [x] **I7** (BSM-031.07) Seite: Inventar, Dialoge, Vorschau – Schnittstelle in 0.8.112, Seite in 0.8.113
- [x] **I8** (BSM-031.08) Status statt „inaktiv“ – Schnittstelle in 0.8.112, Anzeige in 0.8.113
- [x] **I9** (BSM-031.09) Bestand übernehmen (Kürzel bleiben, alte Namen und Entity-IDs angleichen) – 09.10.2026 von Herbert über die Seite (001–004)
- [ ] **I10** (BSM-031.10) Aufkleber mit Name und QR-Code (später)
- [x] **I11** (BSM-032) Container-Symbol anpassbar: Doppelcontainer, Türen 1–2 und Fenster 1–4 mit Lage, Farbe; echter Zustand (Tür offen/zu, Fenster gekippt, Licht an/aus) – erledigt 0.8.68, eingespielt 06.10.2026
- [x] **I12** (BSM-031.11) Container-Ansicht am Handy zu breit (Kopf +19 px, „zu kalt / passt / zu warm“ bis +284 px) – gefunden beim Inventar-Mockup 08.10.2026; behoben 0.8.114 (Kopf stapelt nach Breite der Seite statt des Fensters, Browser-Fall B8)

## Etappe J – Realistische Hochrechnung und Ersparnis (BSM-033, Herbert 07.10.2026)

Heute: Tagesschnitt × Tage der Heizperiode (im milden Oktober zu niedrig) und „ohne Automatik“ = 24 h Volllast (viel zu
hoch). Künftig nach professionellem Vorgehen: Energiesignatur je Container (ASHRAE Guideline 14), Hochrechnung mit
Heizgradtagen (ÖNORM B 8135, Klimamittel GeoSphere Austria) als Spanne, Ersparnis nach IPMVP aus einer gemessenen
Baseline; die Baseline-Läufe plant und fährt die Integration selbst (startet aus, Kostenrahmen, Ankündigung, Abbruch).
Bauplan: `docs/bauplan-hochrechnung.md`.

- [x] **J1** (BSM-033.01, 0.8.123) Energiesignatur je Container (logik, Gütemaß) – `logik/signatur.py`, Bauplan `docs/bauplan-hochrechnung.md`
- [x] **J2** (BSM-033.02, 0.8.124) Hochrechnung mit Heizgradtagen und Spanne, Witterungsbereinigung – Sensor und `baustelle/auswertung`; Klimamittel Vorgabe Graz (prüfen)
- [x] **J3** (BSM-033.03, 0.8.125) Anzeige: Karte „Heizperiode“ mit Hochrechnung (Diagramm tatsächlich/Prognose mit/ohne), Signatur, Klima (Mockup `hochrechnung.html`); Wetter-Einfluss aus der Signatur 0.8.126
- [ ] **J4** (BSM-033.04) Automatische Baseline-Läufe (startet aus, Budget, Ankündigung, Abbruch) – Teil a (Logik, Integration) 0.8.127; Prognose Tag/Woche/Monat 0.8.129; Verlauf 24 h 0.8.130; Teil b Reiter Baseline offen
- [x] **J5** (BSM-033.05, 0.8.132) P0: „ohne Automatik“ und „gespart“ als grobe Obergrenze kennzeichnen (Audit 11.10.2026, CGR-2026-10-11-hochrechnung)
- [x] **J6** (BSM-033.06, 0.8.133) P1: Minutenklassifikation, Qualitätsvertrag, vier neue Minutenspalten, Baseline-Metadaten – Bauplan §8
- [x] **J7** (BSM-033.07, 0.8.134; P2b Altdaten-Kontext 0.8.135) P2: Tagesmerkmale (Exposition, Abdeckung, Starts, Abkühlnächte)
- [x] **J8** (BSM-033.08, 0.8.136) P3: stationäre Fenster und H, Tagesregression, Baseline-Plateaus, Evidenzbericht → Zahlen an ChatGPT
- [x] **J9** (BSM-033.09, 0.8.137) P4a: Schattenprognose V2 mit neun Szenarien und Stufen; danach P4b (Dynamik) und P6 (Umschaltung)

## Etappe K – Geräte zusammenführen (BSM-034, Herbert 09.10.2026)

Geräte, ihre Einstellungen und ihr Status liegen an sieben Stellen und werden über verschiedene Wege geändert; das
Inventar hängt nur in einer Richtung daran. Ziel: ein Besitzer je Eigenschaft, eine Stelle in der Integration für jede
Änderung, ein Abgleich (`docs/bauplan-geraete.md`).

- [x] **K1** (BSM-034.01, 0.8.115) Sofort-Fehler: Notprogramm entfernter Plugs, Ausrüstung beim Ausscheiden frei, Sensoren nicht festschreiben, ✎ an Pumpen, Reste löschen, alles erst bei „Speichern“ (Bestand-Typ war kein Fehler)
- [x] **K2** (BSM-034.02, 0.8.116/0.8.117) Baustein `kern/geraete` und ein Status je Gerät, Abgleich mit dem Inventar in beide Richtungen; Geräte der Seite über `baustelle/geraet`
- [x] **K3** (BSM-034.03, 0.8.118/0.8.119) Sensoren je Container vereinheitlichen (Fühler, Türen, Fenster, Licht) – jeder Kontakt pausiert, auch im Notprogramm
- [x] **K4** (BSM-034.04, 0.8.120) Abgleich Inventar ↔ HA beim Start, täglich, nach jeder Änderung (nachtragen, „nicht in HA“ anzeigen)
- [x] **K5** (BSM-034.05, 0.8.122) Seite: Geräte und Inventar zusammenführen (Mockup `geraete.html` Variante 1, Einstellungen › 🔌 Geräte)
