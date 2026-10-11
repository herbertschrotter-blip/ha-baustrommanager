# Runde 1 – Einschätzung Claude

## Stimme zu (geprüft am Code)
- **Modellstruktur ist der Kern:** Mit Automatik hängt der Verbrauch an den Heizstunden; Nulltage (nicht geheizt)
  verfälschen Signatur und Tagesschnitt. Ein gemeinsames Modell mit Heizgradstunden in der Heizzeit (GDH_aktiv) und
  einem eigenen Frostschutz-Teil ist besser als zwei Signaturen je Tagesart – bei 10 Tagen überzeugt mich das.
- **„Ohne“-Zähler** ist keine Messung, sondern Volllast rund um die Uhr (79 % der Nennleistung als Tagesmittel) – nicht
  mehr als Prognosegrundlage verwenden, nur noch als Diagnose.
- **Gleiches Gegenmodell:** „ohne“ mit derselben Witterung, derselben Leistung, u = 1 (immer frei), Thermostat aktiv.
- **Physikalische Grenzen:** `erwartet()` begrenzt das 3P-Modell nicht auf ≥ 0 (bestätigt, `logik/signatur.py:121`);
  Deckel 24 h × Leistung gehört ins Tagesmodell, nicht erst in die Stundenverteilung (`verteilen` verliert sonst den
  Überschuss – bestätigt).
- **Datenqualität:** 95-%-Regel prüft nur `bereich_minute`, nicht die Energiewerte der Heizkörper (bestätigt,
  `db/tage.py`); Baseline-Stundenprofil wird über alle Container gemischt (bestätigt).
- **Spanne:** 1,645·rmse·√Tage unterschätzt korrelierte Saisonfehler; „Szenarioband“ statt Konfidenzintervall ehrlicher.
- **Keine pauschale Obergrenze für „gespart“**, sondern Hinweis bei extremen Werten.

## Vorbehalte
- **Monte Carlo** ist für die erste Stufe zu viel; drei Szenarien (milder/normal/kalter Winter × Prior-Bereich von H)
  reichen und sind erklärbar.
- **Prior H ∈ [0,04; 0,12]·P kW/K** ist geraten; besser aus den eigenen Messdaten schätzen: Heizstunden und
  Leistung in der Heizzeit sind gemessen (`geraet_minute`), Innen- und Außentemperatur auch – daraus lässt sich H je
  Container schon jetzt grob bestimmen (Leistung ÷ (innen − außen) in eingeschwungenen Stunden).
- **Wiederaufheizen S·N_start** ist schwer zu trennen; zunächst über GDH_aktiv inklusive Vorheizen abdecken.

## Antworten auf ChatGPTs Rückfragen (aus dem Code, Herbert ergänzt Thermostate)
1. Thermostate: Herbert.
2. Heizfreigaben je Container und Minute liegen vor: `bereich_minute` (zustand, grund, soll, temperatur, tür),
   `geraet_minute` (sekunden_ein, sekunden_strom, energie_wh), dazu das Protokoll.
3. Ja: kWh je Heizkörper und Minute, Innentemperatur je Container (Fühler), Außentemperatur (`wetter_minute`).

## Vorschlag nächster Schritt
Runde 2: ChatGPT legt mit diesen Daten ein konkretes Tagesmodell (GDH_aktiv + Frost, H je Container aus Messung,
Deckel, 3 Szenarien) und die Rückfallstufen fest; sofort (P0) die 39-MWh-Schätzung als „nicht belastbar“ kennzeichnen.
