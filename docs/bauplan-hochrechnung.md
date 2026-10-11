# Bauplan Hochrechnung und Ersparnis

Die Hochrechnung der Heizperiode ist heute der Tagesschnitt seit Zählbeginn × Tage der Heizperiode. Gemessen im milden
Oktober unterschätzt sie den Winter. „Ohne Automatik“ ist 24 h Volllast aller Heizkörper, also viel zu hoch, und die
Ersparnis wirkt dadurch zu groß. Ziel (Herbert 07.10.2026): nach professionellem Vorgehen rechnen. Dazu gehören eine
Energiesignatur je Container (ASHRAE Guideline 14), eine Hochrechnung mit Heizgradtagen als Spanne (ÖNORM B 8135,
Klimamittel GeoSphere Austria) und die Ersparnis aus einer gemessenen Baseline (IPMVP Option B).

Stand: .01 fertig (0.8.123), .02 fertig (0.8.124), .03 fertig (0.8.125/0.8.126), .04a fertig (0.8.127, 11.10.2026). Aufgabe BSM-033, Unteraufgaben .01–.09 = Stufen in §2. Audit 11.10.2026: altes Modell fachlich nicht belastbar, Umbau nach §8.

## 1. Grundsätze

- Jede Fachregel nur in `logik/` mit Test; die Seite zeigt nur an (CLAUDE.md).
- Die frühere Gerade `logik/auswertung.wetter_einfluss` (kWh = k · außen + d0) war eine Vorstufe der Signatur; seit
  0.8.126 kommt der Wetter-Einfluss aus der Signatur, die Gerade ist entfernt (Regel nur einmal).
- Nichts schaltet von selbst: Baseline-Läufe (.04) starten aus, wie die Automatik.

## 2. Stufen (je eigene Lieferung)

| Stufe | Inhalt | Stand |
|---|---|---|
| .01 | Energiesignatur je Container: `logik/signatur.py` | ☑ 0.8.123 |
| .02 | Hochrechnung mit Heizgradtagen und Spanne, Witterungsbereinigung; Daten aus `tag_bereich` an die Signatur | ☑ 0.8.124 |
| .03 | Anzeige: Karte „Heizperiode“ (Mockup `hochrechnung.html`, abgenommen 10.10.2026) | ☑ 0.8.125 |
| .04 | Automatische Baseline-Läufe (§6): **a** Logik und Integration ☑ 0.8.127, **b** Anzeige (Mockup zuerst) ☐ | ◐ |
| .05 | P0: „ohne Automatik“ und „gespart“ als „grobe Obergrenze, nicht belastbar“ kennzeichnen (Zahlen bleiben) | ☑ 0.8.132 |
| .06 | P1: Klassifikation, Qualitätsvertrag, vier Minutenspalten, Erfassung am Kernpfad, Baseline-Metadaten (§8) | ☑ 0.8.133 |
| .07 | P2: Tagesmerkmale, Exposition R/F, Abdeckung, Starts, Abkühlepisoden (§8) | ☑ 0.8.134 |
| .08 | P3: stationäre Fenster, H direkt/Ersatz, Tagesregression, Duty, Baseline-Plateaus, Evidenzbericht (§8) | ☐ |
| .09 | P4a: Schattenprognose V2 – Wetter/Soll/Plan, Energie je Intervall, neun Szenarien, Stufen, Anzeigevertrag (§8) | ☐ |

## 3. Energiesignatur (.01)

Modell mit Heizgrenze („3P-Heizen“): **kWh am Tag = Grundlast + kWh je Grad · max(0, Heizgrenze − außen)**.

- **Heizgrenze** im Raster 5–22 °C in 0,5-K-Schritten gesucht. Je Grenze wird mit kleinsten Quadraten gerechnet, die
  kleinste Fehlerquadratsumme gewinnt. Mindestens 3 Tage müssen unter der Grenze liegen, die Steigung muss positiv sein.
- Liegt die beste Grenze über allen gemessenen Tagen, ist sie nicht bestimmbar. Dann gilt eine **Gerade** („2P“), mit
  dem wärmsten Tag als Bezug. Das ist der Normalfall, solange nur kalte Tage gemessen sind.
- **Gütemaß** CV(RMSE) = √(SSE ÷ (n − p)) ÷ mittlerer Tagesverbrauch: bis 20 % „gut“, bis 30 % „brauchbar“, darüber
  „unsicher“ (dann kein erwarteter Verbrauch). Dazu R² und die mittlere Abweichung (`rmse`, Grundlage der Spanne in .02).
- **Lernt noch** unter 10 Tagen oder unter 4 K Spanne der Außentemperatur.
- **Mit und ohne Automatik** getrennt (`je_betrieb`); Baseline-Tage kommen erst mit .04.
- Grenzwerte sind Konstanten in `logik/signatur.py`. Einstellbar werden sie erst, wenn sich das im Betrieb zeigt.

## 4. Hochrechnung (.02)

Entscheidungen Herbert 10.10.2026: Außentemperatur als **24-h-Mittel** (`tag_bereich.aussen_mittel`, wie die Heizgradtage
nach ÖNORM); es zählen nur **ganze Tage ohne Ausfall und ohne Notbetrieb** (mindestens 95 % des Tages in
`bereich_minute` mitgeschrieben, Quelle HA oder übernommen, nicht `notprogramm`).

- Rechnen nur in `logik/hochrechnung.py`; `funktionen/heizung/hochrechnung.py` liest die Tage der laufenden Heizperiode
  (`db/tage.hochrechnung_tage`) beim Start und täglich um 03:50 und legt das Ergebnis bei der Heizung ab.
- **Rest** = morgen bis Ende der Heizperiode (oder geplantes Ende der Baustelle). Je Tag die Außentemperatur aus der
  Vorhersage (Tagesmittel, neu in `wetter_tage`: stündlich gemittelt, sonst (Höchst + Tiefst) ÷ 2), sonst aus den
  **Klimamitteln** (12 Monatsmittel, zwischen den Monatsmitten linear). Vorgabe: Näherung Graz 1991–2020; je Baustelle
  als Einstellung `heizung.klimamittel` (Eingabe auf der Seite mit .03). **Herbert: Werte mit GeoSphere Austria
  (Klimamittel der nächsten Station) prüfen.**
- **Spanne** (rund 90 %): wärmerer bzw. kälterer Winter um 1,5 K an allen Tagen ohne Vorhersage, dazu 1,645 · rmse · √Tage.
  Nur wenn jeder Container eine Signatur hat.
- **Container ohne Signatur** (lernt, unsicher): Tagesschnitt der gezählten Tage × Resttage, wie vorher.
- **Normjahr** (Witterungsbereinigung): die ganze Heizperiode bei Klimamitteln; **Heizgradtage 20/12** des Rests.
- Bisher = Zähler `energie_heizen` (wie vorher); heute zählt dort mit, der Rest beginnt morgen.
- **Tag/Woche/Monat** (0.8.129): `tageswerte` (je Tag nicht aufsummiert, „ohne“ aus der Tagesreihe) und `perioden` (Tag,
  Woche ab Montag, Monat) in `logik/hochrechnung`; € je Zeitraum in `logik/auswertung`; die Seite wählt nur den Ausschnitt.
- **Verlauf 24 h** (0.8.130): `logik/tagesverlauf` – Tageswert der Prognose nach Heizplan (außerhalb 5 % Frostschutz) und
  Abstand zur Heizgrenze auf die Stunden verteilt; „ohne“ nach dem Stundenprofil der Baseline-Tage, sonst gleichmäßig
  rund um die Uhr (0.8.131); keine Stunde über der Leistung aller Heizkörper; Temperatur gemessen → stündliche Vorhersage → typischer Tagesgang (±3 K). WS `baustelle/tagesverlauf`.
- **Rest von heute** (0.8.128): der Anteil des Tages, der noch kommt, × erwarteter Tagesverbrauch bei der Außentemperatur
  von heute (Vorhersage, sonst gemessen bis jetzt, sonst Klimamittel) – sonst liegt die Hochrechnung tagsüber zu niedrig.
- Sensor `prognose_heizperiode` (und Kosten) zeigt den neuen Wert, `baustelle/auswertung` › `hochrechnung` dazu
  `methode`, `unten_*`, `oben_*`, `normjahr_*`, `hgt_rest`, `vorhersage_tage` und je Container Signatur und Rest.
- **Ohne Automatik** bleibt bis zur gemessenen Baseline (.04) die bisherige Schätzung; dann aus der Signatur „ohne“.
- Arbeitszeitplan, Vorheizen und Frostschutz stecken in der Signatur, weil sie aus dem echten Betrieb gelernt ist.
  Getrennte Signaturen für Arbeits- und freie Tage erst, wenn das Gütemaß zeigt, dass es nötig ist.

## 5. Anzeige (.03) – abgenommen 10.10.2026

Mockup `mockups/hochrechnung.html`, Variante 2 (Herbert 10.10.2026): In der Auswertung ersetzt eine Karte **„Heizperiode“**
die Blöcke „Hochrechnung Heizperiode“ und „Wetter-Einfluss“. Sie hat drei Reiter:

- **Hochrechnung:** Prognose mit Spanne, dazu ein Diagramm über die ganze Heizperiode (aufsummiert): tatsächlich bis heute,
  Prognose mit Automatik (Band = Spanne), Prognose ohne Automatik (bis J4 die bisherige Schätzung). Darunter die Legende
  mit €, „gespart“ und woher die Zahl kommt.
- **Signatur:** Container wählen; Streudiagramm Tagesverbrauch gegen Außentemperatur mit Knickgerade und Heizgrenze; je
  Container Heizgrenze, kWh je Grad, Grundlast, Güte bzw. „lernt noch n/10“.
- **Klima:** Klimamittel (Heizperiode hervorgehoben), Vorhersage der nächsten Tage, Heizgradtage bis zum Ende, Normjahr;
  Link zur Einblendung **Klimamittel** (12 Monatswerte, „Vorgabe Graz“).

Die **Heizperiode** ist in der Karte einstellbar (✎ → von/bis). Es ist dieselbe Einstellung wie unter Einstellungen ›
Baustelle (`heizperiode_von/bis`). Die Kachel „Hochrechnung“ zeigt die Spanne bzw. „lernt noch“.

Die Integration liefert alles; die Seite zeichnet nur. Neu in `baustelle/auswertung` › `hochrechnung`: die **Tagesreihe**
(`reihe`: Tag, tatsächlich aufsummiert, Prognose mit/unten/oben/ohne aufsummiert), die **Punkte der Signatur** je
Container (Tag: außen, kWh), die **Klimamittel** und die **Vorhersage**. Die Klimamittel speichert `baustelle/setzen`
(`heizung.klimamittel`, logik prüft 12 Zahlen).

Gebaut 0.8.125: Seite `frontend/src/ansichten/heizperiode.js` (Bausteine „hochrechnung“ und „wetter“ der Auswertung zeigen
die Karte, „wetter“ öffnet mit dem Reiter Signatur; ✎ öffnet die Einblendung „zeitraum-bs“). „Bisher“ = Tage der
Heizperiode aus `tag_bereich` (vorher Zähler seit Zählbeginn), Rechnung stündlich (:50) und gleich nach dem Speichern der
Klimamittel. 0.8.126: Kachel „Wetter“, Kachel-Katalog „Wetter-Einfluss“ und die Erkenntnis „je Grad kälter“ rechnen mit
der **Signatur der ganzen Baustelle** (`logik/hochrechnung.baustelle_tage`: nur Tage, an denen jeder Container zählt;
`logik/auswertung.wetter_aus_signatur`: schräger Teil als Gerade, `null0` = Heizgrenze). Die Gerade `wetter_einfluss`
(letzte 30 Heiztage aus der HA-Statistik) ist entfernt.

## 6. Baseline-Läufe (.04) – Plan 11.10.2026

Ziel: „ohne Automatik“ messen statt schätzen (IPMVP Option B). Ein Lauf hält **alle Heizkörper eines Containers** über
ganze freie Tage durchgehend am Strom; ihr eigener Thermostat regelt. Aus diesen Tagen entsteht die Signatur „ohne
Automatik“ des Containers (`logik/signatur.je_betrieb`).

**Entscheidungen Herbert 11.10.2026:** ganzer Container je Lauf · Kostenrahmen **60 € je Monat** (einstellbar) ·
Ankündigung **am Vortag 12:00** aufs Handy mit Knopf „Absagen“, ohne Absage startet der Lauf · nur **Wochenenden und
freie Tage** (keine Arbeitszeit, keine Ausnahme mit Arbeit, kein Termin, kein Bedarf).

**Regeln (logik/baseline.py, mit Test):**
- **Startet aus:** Einstellung `heizung.baseline` (Vorgabe aus); Läufe nur bei eingeschalteter Automatik.
- **Lauf** = ein freier Block aus 1–2 ganzen Tagen (00:00–24:00, Samstag+Sonntag = 48 h), frühestens morgen.
- **Welcher Container:** abwechselnd Ölradiator und Konvektor (Container mit nur einem Heizkörper-Typ zuerst), darunter
  der mit den wenigsten Baseline-Tagen; ein Container ist fertig, sobald seine Signatur „ohne“ gut ist.
- **Kosten** vorher geschätzt: Nennleistung aller Heizkörper × Stunden × 50 % (Thermostat) × Strompreis; mit Signatur
  „ohne“ deren erwarteter Verbrauch. Ein Lauf startet nur, wenn er in den Rest des Monatsrahmens passt (gemessene
  Kosten der Läufe des Monats + Schätzung).
- **Abbruch** (Lauf endet, Tag zählt nicht): Tür/Fenster länger als die Tür-Pause offen, Taste am Plug, Bedarf, Termin,
  Automatik aus, Absagen über die Nachricht oder die Seite. Frostschutz, Hand und Tür-Pause haben weiter Vorrang.
- **Zählende Tage:** ganze Tage eines nicht abgebrochenen Laufs (wie §4: ohne Ausfall/Notbetrieb) → `Tag(automatik=False)`;
  diese Tage fehlen in der Signatur „mit Automatik“.
- **Ersparnis:** je Container mit Signatur „ohne“ (gut/brauchbar) dieselbe Hochrechnung wie „mit“; Container ohne eigene
  Messung übernehmen das Verhältnis ohne ÷ mit eines gemessenen Containers mit demselben Heizkörper-Typ; erst wenn das
  für alle geht, ersetzt das die 24/7-Schätzung.

**Integration (J4a):** `funktionen/heizung/baseline.py` – Planen und Ankündigen um 12:00 für morgen, Start/Ende an den
Tagesgrenzen, Abbruch je Minute, Läufe in `lz["baseline"]`, Protokoll „Baseline“; Soll-Grund `BASELINE` nach „Taste“
(Frost, Hand, Tür-Pause bleiben davor), alle Heizkörper an (Stufen aus), Staffelung wie sonst (Sicherheit vor Messung –
wird gekürzt, zählt der Tag trotzdem, die Signatur sieht nur den Verbrauch); Nachrichtenknopf `baseline_absagen`.
**Anzeige (J4b, Mockup zuerst):** Schalter „Baseline messen“, Kostenrahmen, nächster Lauf mit Absagen, Liste der Läufe,
Signatur „ohne“ im Reiter Signatur, Ersparnis im Diagramm.

Gebaut 0.8.127 (J4a): `logik/baseline.py` (Block, Container, Kosten, Rahmen, Abbruch, zählende Tage),
`logik/hochrechnung.ohne_container/ohne_baustelle` (IPMVP), `funktionen/heizung/baseline.py` (Takt je Minute aus
`nach_schalten`), Soll-Grund `BASELINE` in `logik/regelung` nach „Taste“, `geraet_ein` schaltet im Lauf alle Heizkörper,
Nachrichtenknopf `baseline_absagen`, Einstellungen `heizung.baseline` (aus) und `heizung.baseline_eur_monat` (60).
`baustelle/auswertung` › `hochrechnung` liefert `baseline` (an, Läufe) und `ohne_methode` (baseline/schaetzung); der
Sensor „Heizperiode ohne Automatik“ nimmt die Baseline, sobald es sie gibt. Kosten eines beendeten Laufs = Verbrauch der
Lauftage × Preis (stündlich nachgetragen). Einschalten erst mit J4b (Seite).

## 7. Tests

`tests/logik/test_signatur.py`: Grenze und Steigung aus Modelldaten, Streuung, lernt (Tage, Spanne), Gerade, ohne
Zusammenhang, starke Streuung, Gütestufen, erwarteter Verbrauch, getrennter Betrieb.
`tests/logik/test_hochrechnung.py`: Klimamittel, Klima je Tag, HGT, welche Tage zählen (auch Sommerzeit), Vorhersage vor
Klima, Rest mit Spanne und Normjahr, lernt (Tagesschnitt), ohne Tage, Summe der Baustelle.
`tests/integration/test_hochrechnung.py`: Tage aus der Datenbank (ein Tag im Notbetrieb fällt weg) → Signatur, Sensorwert,
ohne Tage der Tagesschnitt.

## 8. Prognose V2 – Entscheidungen aus dem Review (CGR-2026-10-11-hochrechnung, 11.10.2026)

**Verbindliche Bauvorlage:** `docs/chatgpt-reviews/CGR-2026-10-11-hochrechnung/r5/02-chatgpt-response.md` (Modulschnitt,
Typverträge, `PrognoseRegeln`, Adapter-Vertrag, Schema, Anzeige-Texte, Testplan mit Zahlenkatalogen aus r3 und r4). Die
Abschnitte 3–6 oben beschreiben das alte Modell; es läuft bis zur Umschaltung (P6) als „Bisherige Schätzung“ weiter.

Befund (Audit): Tagesschnitt ohne Heizstunden, Nulltage verfälschen, Signatur flach, „ohne“ nicht gemessen (24 h
Volllast ≈ 185 kWh/Tag), 24-h-Kurve verteilt nur einen Tageswert.

Entscheidungen (Herbert und Review):

1. **Modell:** E_mit je Intervall = min(P, H·max(0, Ziel − außen))·dt über die geplanten Freigaben; H aus stationären
   Fenstern (Konvektor 60 + 120 min, Öl 120 + 180 min) als gewichteter Median je Tag → Median über Tage; Rückfall
   Tagesregression durch den Ursprung (Stufe B); Planmodus/ohne Fühler nur Duty × Kapazität (höchstens B).
2. **Betriebsarten** REGULAER / FROST / BASELINE / SONSTIGE aus `grund`; TPI-aus bleibt REGULAER; Frostexposition =
   jede Bereitschaftsminute außerhalb R, Frostziel (Ein + Aus)/2 = 6 °C, kein 5-%-Aufschlag.
3. **Wiederaufheizen und Frost-Dynamik** (C, tau) erst P4b nach den P3-Zahlen; bis dahin Haltebedarf + Band bis
   Blockkapazität.
4. **Gegenmodell „ohne“** nur aus Baseline-Plateaus mit sichtbaren Thermostatzyklen (T_max_eff, H_ohne); erster Lauf
   höchstens B, C erst aus zwei Läufen. Fehlt es: „gespart“ = None, kein Ersatz aus dem alten Ohne-Zähler.
5. **Altdaten** (Herbert): Ersatznachweis statt Sperre – Konstantfolge ≤ 1 800 s, Plugs erreichbar, Energie lückenlos,
   Pulscheck gegen unabhängiges P_ref (nicht `nenn_kw()`); höchstens Stufe C, Band mindestens ±50 %.
6. **Neue Minutenspalten** (P1, nullable, kein Default, kein Backfill): `bereich_minute.temp_alter_s`,
   `bereich_minute.staffel_begrenzt_s`, `geraet_minute.heizanforderung_s`, `geraet_minute.staffel_gesperrt_s`;
   Kontextwechsel innerhalb der Minute als `ereignis` `art="prognose_kontext"`.
7. **Baseline-Thermostate** (Herbert): Läufe sind am Wochenende, niemand verstellt → `thermostat_unveraendert =
   angenommen` (Annahme, keine Messung; sichtbar im Hinweis).
8. **Szenarioband** aus neun ganzen Läufen (Klima ±1,5 K × H unten/Mitte/oben), gespart je Lauf, negative Werte
   sichtbar, keine Wahrscheinlichkeitsangabe. Stufen A–D getrennt für Evidenz und Prognose; Texte liefert die
   Integration (Bauvorlage §9.2).
9. **Schattenbetrieb:** P4a rechnet parallel (`prognose_v2`), keine Mischung mit Legacy-Werten; Umschaltung P6
   rücknehmbar.

Nach P3 gehen je Container die Zahlen (Fenster direkt/Ersatz, Verwerfungsgründe, Starts, Abkühlnächte) in eine neue
Review-Runde; danach Entscheidung über P4b.

**Notiz aus dem Bau P1 (0.8.133, BSM-033.06)** – Abweichungen und Festlegungen gegenüber der Bauvorlage:

- Die Minutenprüfung (`pruefe_minuten`, `MinutenQualitaet`, Ersatznachweis) kommt mit P2; P1 liefert Typen, Regeln,
  Klassifikation, Spalten, Erfassung und Baseline-Metadaten. `PrognoseRegeln` hat genau die 98 Felder aus §2.5.
- Staffelungs-Veto (`logik/staffel.gesperrt`): angefordert, erreichbar, nach Staffelung und Anlaufstaffel nicht frei;
  die Mindestpause zählt nicht (Schutz des Geräts), ein nicht erreichbares Gerät ist unbekannt (NULL). Die Anforderung
  zählt unabhängig von der Erreichbarkeit (offline bleibt unterscheidbar), Hand, Ruhe und inaktive Geräte fordern nicht an.
  Ohne Anforderung kein Veto, auch offline (sonst bliebe die Container-Sperre mit einem defekten Gerät immer NULL).
- Kontext-Ereignis: Soll für den Änderungsvergleich auf 0,1 K gerundet; die Konfigurations-ID wird nur bei geänderter
  Ausstattung neu gerechnet. Die Beobachtung nach der Auswertung fängt jede Ausnahme ab (Protokoll), die Steuerung
  läuft weiter; ebenso die Konfigurations-ID beim Baseline-Start (dann None).
- Container-Sperre: Vereinigung; ein unbekanntes Gerät macht die Zeit unbekannt, außer ein anderes ist sicher gesperrt.
  Container ohne Geräte: NULL. Ein Bericht genau zum Minutenbeginn macht die Minute vollständig.
- Innenalter: Bericht = Zustandsänderung oder `state_reported` (gefiltert nur auf die Innenfühler) mit `last_reported`.
  Der Wert beim Start und die Rückkehr aus „nicht verfügbar“ (zwischengespeicherter Wert) gelten nicht als Bericht.
- Klassifikation: `pause` ohne `tuer_offen` behält die Art des Grunds, ist aber ungültig; `import_verlauf` gültig mit
  Code `kontext_noetig`; `import_statistik` und unbekannte Quelle ungültig. **Pflicht für P2:** die Codes
  `kontext_noetig` (import_verlauf: Betriebskontext belegen) und `lauf_bestaetigen` (baseline: bestätigte Lauf-ID und
  Zeit) MUSS P2 auswerten, bevor eine Minute ins Training geht – `betrieb_gueltig` allein reicht dafür nicht.
- Konfigurations-ID (`prognose_merkmale.konfiguration_id`): Regelungsart + aktive Heizkörper (ID, Typ); Regelungsart thermo
  nur mit Fühler (thermo/bedarf), sonst plan; hand/aus → aus. `soll_c` im Ereignis `prognose_kontext` ist dasselbe Soll
  wie in `bereich_minute.soll`.
- `db/schreiber.py` blieb unverändert: die Schreibarbeit `minute` gibt die Zeilen unverändert an die Tabelle; alte
  Pufferarbeiten ohne die neuen Schlüssel schreiben NULL.

**Notiz aus dem Bau P2 (0.8.134, BSM-033.07)** – Abweichungen und Festlegungen gegenüber der Bauvorlage (nach Review
der Lieferung nachgezogen):

- Ort: `logik/prognose_merkmale.py` (`pruefe_minuten`, `frische_ersatz`, `tagesmerkmale`, `starts`, `abkuehlepisoden`,
  `merkmale` = Tage und Abkühlepisoden in einem Durchgang, dazu `betriebskontext`, `frost_bereit`, `kontext_gewechselt`,
  `bestaetigter_lauf`), Typen `MinutenQualitaet`, `StartMerkmal`, `TagesMerkmale`, `AbkuehlEpisode`; Adapter
  `db/prognose.py` (Lesen) und `funktionen/heizung/prognose_v2.py` (Diagnose, WS `baustelle/prognose_v2`). Keine neue
  Schwelle außerhalb `PrognoseRegeln`; einzige Konstante `MINUTE_S` = 60 (Definition der Minutenzeile).
- `kontext_noetig`/`lauf_bestaetigen` (Notiz P1) werden ausgewertet: ohne belegten Kontext bzw. ohne bestätigte Lauf-ID
  (Lauf laufend/fertig, abgebrochen nur vor dem Abbruchtag) ist die Minute betrieblich ungültig.
- **Einstellungen je Zeitpunkt:** Ausgangsstand = jüngste ganze Zeile `heizung`/`geraete` (Übernahme bzw. Speichern der
  ganzen Einstellung), darauf die Punkt-Zeilen aus `baustelle/setzen` (`heizung.frost_grenze`, `geraete.<id>.nenn_kw`)
  und `geraet.status` nach `ab` nachgespielt. Übernahme-Zeilen (rückdatiert auf den Baustellenbeginn) belegen erst ab
  der Übernahme.
- **Kontext belegt** nur mit Ereignis `prognose_kontext` (letztes vor dem Zeitraum + alle darin), dessen
  Konfigurations-ID die Heizkörper zum Zeitpunkt bestätigt, dessen Grund zum gespeicherten Grund passt (letztes
  Ereignis bis Minutenende; ein Ereignis genau am Minutenende zählt dafür mit, ist aber kein Wechsel), und mit belegter
  Einstellung `heizung`. Minuten vor 0.8.133 bleiben damit unbelegt. **Offen (Entscheidung Herbert):** ob ältere
  Zeiträume aus Einsatzintervallen und Einstellungsverlauf rekonstruiert werden – nicht gebaut.
- Kontextwechsel in der Minute = Grund, Regelungsart oder Konfiguration ändern sich (Zustand/TPI und Soll allein nicht).
  Eine Wechselminute zählt nicht zum Training und nicht gemeinsam (Lücke von 60 s); der Tag bleibt geeignet, Code
  `wechsel_im_intervall` als Hinweis. Geräte-/Moduswechsel schließen den Tag aus (`konfiguration_gewechselt`,
  `modus_gewechselt`).
- **Offene Abweichung:** `aussen_frisch` bleibt None (Wetterwert ohne Altersnachweis); Code `aussen_frische_unbelegt`
  macht die Unsicherheit sichtbar, sperrt die direkte Frische aber nicht (nur False sperrt).
- Frostbereitschaft: fehlen Frostschutz-Schalter oder Frostgrenze in der Einstellung, ist sie unbekannt (None), nie 0 °C.
  Fühler = `bereich.fuehler` oder Regelungsart thermo.
- Exposition: R (thermo) und P (Zeitplan) getrennt; die gemeinsamen Quoten `q_joint_r`, `regulaer_joint_kwh` und
  `kapazitaet_regulaer_kwh` gelten für R∪P (ein Tag ist nach Konfiguration entweder thermo oder plan). F =
  Frostbereitschaft außerhalb R/P nach `frost_bereit` (Frost an, nicht frei mit `frei_modus` aus, Fühler oder
  `frost_aussen`).
- Tagestraining thermo zusätzlich mit den Tagesfit-Regeln aus §6.4 (alle bekannten Starts ≤ 2 K, R ≥ 4 h, GDH_R ≥ 20).
  Türkontakt fehlt → Code `tuer_unbekannt` (kein Ausschluss, im Tag wie in Abkühlepisoden); Tür > 60 s am Stück in R/P
  → Ausschluss.
- Starts je Container; Pause mit Datenlücke oder ungültigen Minuten → Start zählt mit Code `start_nach_luecke` („ohne R“
  nicht bewiesen); Sollsprung > 1 K (z. B. Absenken → Arbeitszeit) → Start mit Code `sollsprung`.
- Gerätezuordnung zum Zeitpunkt: ab Aufbau 9 aus den Inventar-Einsätzen (`ausruestung_einsatz.geraet_id` →
  `container_einsatz.bereich_id`), sonst `geraet` (Rolle in API-Schreibweise `heizung`) mit `angelegt` ≤ t <
  `entfernt`; aktiv nach dem Status in der Einstellung `geraete` zum Zeitpunkt; P_ref = `geraete.<id>.nenn_kw` zum
  Zeitpunkt (Beleg = die Zeile, die den Wert gesetzt hat).
- Minuten ohne Container-Zeile, aber mit Gerätezeilen, kommen als `zeile_vorhanden=False` (Energie bleibt); Zeit ganz
  ohne Zeilen bleibt implizite Lücke, die Fachlogik rechnet mit der echten Tagesdauer.
- Last: in der globalen Datenbanksperre werden nur Zeilen gelesen (`prognose_rohdaten`), zusammengesetzt und gerechnet
  wird in einem eigenen Executor-Job; Qualität je Minute nur einmal; höchstens eine Diagnose gleichzeitig.
- Abkühlepisoden: Nachlauf Konvektor `konvektor_vorlauf_min`, sonst (Öl oder unbekannter Typ) `oel_vorlauf_min`;
  „ohne Heizenergie“ = `sekunden_strom` 0 (sonst Energie 0); eine Störung beendet die Episode. Typ dafür neu als
  `GeraetIntervall.typ` (additiv, Vorgabe None).
- `startbilanzen` kommt mit P3 (braucht H).
