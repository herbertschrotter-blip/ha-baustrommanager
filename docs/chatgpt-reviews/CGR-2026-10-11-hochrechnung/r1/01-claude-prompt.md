## Rolle

Du bist ein erfahrener Energieberater und Datenanalyst für Gebäudeheizung (Energiesignatur, Heizgradtage, IPMVP) mit
Erfahrung in Python und Home-Assistant-Integrationen, und führst ein technisches Review-Gespräch mit einem Kollegen
(Claude/Anthropic).

## Gesprächsformat

Dieses Gespräch läuft über einen Vermittler (den User, Herbert).
- Sprich direkt zu deinem Kollegen, NICHT zum User
- Kein Meta-Kommentar über das Format
- Schreibe deine GESAMTE Antwort in Canvas
- CANVAS-TITEL: "Review Runde 1"
- Fasse am Ende JEDER Antwort zusammen:
  ✅ Einigkeit | ⚠️ Widerspruch | ❓ Rückfragen

## Repo-Zugriff

Du hast Zugriff auf das GitHub-Repo und kannst selbst Dateien lesen:
- **Repo:** herbertschrotter-blip/ha-baustelle
- **Branch: `main`** — IMMER diesen Branch verwenden.
- Stand auf GitHub: Commit `d0209b6` (Version 0.8.131), alles gepusht.
- Nutze das aktiv um Aussagen zu verifizieren, Querverweise zu prüfen, und Originaldateien zu lesen, wenn der Kontext
  im Prompt nicht reicht.
- Bei JEDEM Dateizugriff den Branch `main` angeben!

## Gesprächsregeln

- Ehrlich und kritisch – Herbert hat den Eindruck: „bei dieser Prognose passt was gar nicht“
- Probleme konkret benennen, mit Zahlen aus den Live-Daten unten
- Verbesserungen mit Formeln/Pseudocode zeigen
- Rückfragen bei fehlendem Kontext
- Fokus: **fachliche Richtigkeit der Prognose** (Modell, Datenauswahl, Grenzfälle) – nicht Code-Stil, nicht Oberfläche
- Kompakt, Code nur wenn nötig

## Regeln der Integration (PFLICHT-Hinweis)

- Fachlogik nur in `custom_components/baustelle/logik/` (ohne HA-Code, immer mit Test in `tests/logik/`); jede
  Fachregel genau einmal. Die Seite rechnet nichts Fachliches, sie zeigt nur an, was die Integration liefert.
- Ausgeliefert wird eine Datei `frontend/baustelle-panel.js` (gebaut aus `frontend/src/`); Master-Mockup
  `mockups/glas.html` = echte Seite mit Beispieldaten.
- Pilotbaustelle läuft produktiv: kein Risiko im Betrieb, Stufen einzeln einspielbar.
- Die Automatik startet ausgeschaltet; Geräte steuern nur auf Auftrag. Die Baseline-Läufe (Heizkörper ohne Automatik am
  Wochenende) sind gebaut, aber ausgeschaltet.

Quelle: `CLAUDE.md` (Regeln), `README.md` (Aufbau), `docs/bauplan-module.md` §1.

## Projektkontext

### Zweck
Eigene HA-Integration `baustelle`: Heizung in Baustellencontainern mit Shelly-Plugs. Die Automatik heizt nur in der
Arbeitszeit (plus Vorheizen/Nachheizen, Frostschutz sonst); ohne Automatik würden die Heizkörper rund um die Uhr laufen
und nur der Thermostat am Gerät regeln. Die Prognose soll zeigen: was kostet die Heizperiode (Okt–Apr) mit Automatik,
was ohne, was spart die Automatik – für die ganze Heizperiode und je Monat/Woche/Tag/Stunde.

### Bauplan Hochrechnung – `docs/bauplan-hochrechnung.md` (source of truth, bitte ganz lesen)
- §3 Energiesignatur (`logik/signatur.py`): je Container 3P-Heizmodell (ASHRAE Guideline 14):
  kWh/Tag = Grundlast + kWh_je_Grad · max(0, Grenze − außen); Grenze per Gittersuche 5–22 °C in 0,5 K, sonst 2P-Gerade.
  Güte CV(RMSE): ≤ 20 % gut, ≤ 30 % brauchbar, sonst unsicher. „lernt“ unter 10 Tagen oder unter 4 K Temperaturspanne.
- §4 Hochrechnung (`logik/hochrechnung.py`): zählende Tage = ganze Tage vor heute mit Verbrauch und Außenmittel,
  ≥ 95 % mitgeschrieben, ohne Notbetrieb (Herbert: 24-h-Mittel außen). Rest der Heizperiode je Tag aus der Signatur bei
  der Tagestemperatur (Vorhersage, sonst Klimamittel Graz, linear zwischen Monatsmitten). Solange die Signatur lernt
  oder unsicher ist: Tagesschnitt der gezählten Tage × Resttage. Spanne: ±1,5 K Winter + 1,645·rmse·√Tage.
  Heute: gemessen bis jetzt + Rest des Tages anteilig (0.8.128).
- §5 Anzeige: Diagramm aufsummiert; Tag/Woche/Monat (`tageswerte`, `perioden`, 0.8.129); Verlauf 24 h
  (`logik/tagesverlauf.py`, 0.8.130/131): Tageswert nach Heizplan (außerhalb 5 % Frostschutz) und Abstand zur
  Heizgrenze auf Stunden verteilt, Deckel = Leistung aller Heizkörper.
- §6 Baseline (`logik/baseline.py`): IPMVP Option B – an freien Tagen alle Heizkörper eines Containers ohne
  Automatik; daraus Signatur „ohne“. Bis dahin ist „ohne Automatik“ eine **Schätzung**: Zähler `ohne` addiert jede
  Minute die mittlere Betriebsleistung jedes aktiven Heizkörpers (`funktionen/heizung/zaehlen.py`, `zaehlen_geraet`),
  hochgerechnet auf die Heizperiode per Tagesschnitt seit Zählbeginn.

## Live-Daten (Pilotbaustelle, heute 11.10.2026, Version 0.8.131)

Heizperiode 01.10.2026–30.04.2027, 5 Heizkörper in 4 Containern (Ölradiatoren 1,84 / 2,02 / 2,18 kW, Konvektoren
1,81 / 1,87 kW = 9,7 kW). Gezählt seit 01.10. 23:42. Außentemperaturen bisher nur 10,7–15,1 °C (Oktober).

**Ganze Baustelle:** methode `tagesschnitt` (alle Container „unsicher“), bisher 219 kWh, Hochrechnung mit Automatik
**4 227 kWh**, keine Spanne; ohne Automatik (Schätzung) **39 212 kWh** → „gespart“ ≈ 35 000 kWh (≈ 90 %).

**Je Monat (kWh):** ist / Prognose / ohne / Ø außen

| Monat | ist | Prognose | ohne | außen |
|---|---|---|---|---|
| Okt 2026 | 219 | 406 | 5 733 | 10,6 |
| Nov | 0 | 597 | 5 548 | 5,4 |
| Dez | 0 | 617 | 5 733 | 1,4 |
| Jan 2027 | 0 | 617 | 5 733 | 0,6 |
| Feb | 0 | 557 | 5 179 | 2,3 |
| Mär | 0 | 617 | 5 733 | 6,5 |
| Apr | 0 | 597 | 5 548 | 11,2 |

**Je Container: gezählte Tage [außen °C, kWh]** (9.10. Fr und 10.10. Sa = 0 kWh – nicht geheizt; heute So 11.10. laut Plan Heizzeit):
- C1 Polier (2 Ölradiatoren): [12.3, 9.9] [10.8, 7.8] [11.1, 7.0] [10.7, 6.6] [12.2, 8.5] [12.1, 7.7] [13.2, 8.2]
  [15.1, 4.9] [13.2, 0.0] [11.2, 0.0] → unsicher, CV 60 %, Grenze –, 0,28 kWh/K, Grundlast 5,2
- C2 Mannschaft (Konvektor): [12.3, 7.7] [10.8, 13.4] [11.1, 10.4] [10.7, 10.4] [12.2, 9.4] [12.1, 3.7] [13.2, 4.0]
  [15.1, 2.0] [13.2, 0.0] [11.2, 0.0] → unsicher, CV 69 %, Grenze 13,5, 2,86 kWh/K
- C3 Mannschaft (Konvektor): [12.3, 0.0] [10.8, 18.3] [11.1, 14.1] [10.7, 12.7] [12.2, 8.2] [12.1, 4.5] [13.2, 3.4]
  [15.1, 1.1] [13.2, 0.0] [11.2, 0.0] → unsicher, CV 80 %, Grenze 11,5, 16,4 kWh/K (!)
- C4 Mannschaft (Ölradiator): [12.3, 0] [10.8, 0] [11.1, 0] [10.7, 0] [12.2, 0.8] [12.1, 6.8] [13.2, 5.3] [15.1, 2.3]
  [13.2, 0] [11.2, 0] → unsicher, „kein Zusammenhang“

**Verlauf 24 h heute (So 11.10., Heizzeit laut Plan 06–17 Uhr):** gemessen bis 12 Uhr 19 kWh, Rest 10 kWh;
ohne Automatik 185 kWh/Tag = 7,7 kWh je Stunde (seit 0.8.131 gleichmäßig; davor nach Temperatur verteilt – ergab
bis 20 kWh je Stunde, mehr als die 9,7 kW aller Heizkörper).

## Was mir selbst schon auffällt (bitte prüfen, ergänzen, widersprechen)

1. **Tagesschnitt über den Winter flach:** Jänner bekommt dieselben ~20 kWh/Tag wie Oktober – bei 0,6 °C statt 10,6 °C.
   Die Rückfalllösung ignoriert die Temperatur völlig.
2. **Arbeitstage und freie Tage gemischt:** An Wochenenden/Feiertagen heizt die Automatik nur Frostschutz (≈ 0 kWh).
   Diese Nulltage gehen in Signatur und Tagesschnitt ein und zerstören die Signatur (CV 60–80 %). Der Verbrauch hängt
   mit Automatik stärker vom Heizplan (Stunden) ab als von der Außentemperatur. Braucht es eine Signatur je Tagesart
   (Arbeitstag / frei) oder eine Normierung auf Heizstunden (kWh je Heizstunde gegen außen)?
3. **Zu kleine Temperaturspanne:** 10,7–15,1 °C im Oktober; jede Steigung extrapoliert bis −5 °C gefährlich
   (C3: 16 kWh/K). Ist „4 K Spanne“ als Schwelle sinnvoll? Wie sollte man bis zum ersten kalten Wochen
   vorsichtig hochrechnen (z. B. physikalisches Vorwissen: Nennleistung × Heizstunden als Obergrenze, HGT-Verhältnis)?
4. **„Ohne Automatik“-Schätzung absurd hoch:** 9,7 kW × 24 h ≈ 185 kWh/Tag für jeden Tag Okt–Apr = 39 MWh, egal ob
   10 °C oder −5 °C. Der Thermostat am Gerät regelt im Oktober stark ab. Ergebnis „90 % gespart“ ist unglaubwürdig.
   Wie schätzt man „ohne“ vor der Baseline besser (z. B. Wärmebedarf aus der Signatur mit Automatik × (24 h / Heizstunden),
   Duty-Cycle-Annahme, Deckel Nennleistung)?
5. **Zählbeginn und Ausfälle:** Zähler `ohne` zählt nur, wenn die Heizung aktiv ist; Tage mit Automatik aus fließen
   unterschiedlich in „mit“ und „ohne“ ein. Ist die Vergleichsbasis überhaupt gleich?
6. **24-h-Verteilung:** Ist „Tageswert nach Heizplan × Abstand zur Heizgrenze“ vertretbar, oder sollte die Prognose
   je Stunde aus dem gemessenen Stundenprofil gleicher Tagesart kommen?

## Aufgabe

1. Lies `docs/bauplan-hochrechnung.md`, `custom_components/baustelle/logik/signatur.py`, `logik/hochrechnung.py`,
   `logik/tagesverlauf.py`, `logik/baseline.py`, `funktionen/heizung/hochrechnung.py`, `funktionen/heizung/zaehlen.py`
   und `db/tage.py` (`hochrechnung_tage`).
2. Prüfe das Modell fachlich gegen die Live-Daten: Wo ist es falsch, wo nur unsicher? Bewerte meine Punkte 1–6.
3. Schlage ein besseres, robustes Modell vor – für **mit Automatik** (Arbeitstag/frei, Heizstunden, Temperatur) und
   **ohne Automatik** vor und nach der Baseline – das schon mit 10 Oktobertagen vernünftige Werte und eine ehrliche
   Spanne liefert. Mit Formeln, Schwellen und Rückfallstufen.
4. Nenne Plausibilitätsprüfungen, die die Integration selbst machen sollte (z. B. Obergrenze Nennleistung × Stunden,
   „gespart“ höchstens X %), und Testfälle dafür.
5. Priorisiere: was muss sofort korrigiert werden, was kann warten.
