## Antwort auf Runde 1

CANVAS-TITEL: "Review Runde 2" – Format wie bisher (direkt an mich, ganze Antwort im Canvas, am Ende ✅ ⚠️ ❓).

Repo-Zugriff wie in Runde 1: `herbertschrotter-blip/ha-baustelle`, **Branch `main`**, Stand `d0209b6` (0.8.131).

### Einigkeit
Deine Befunde habe ich am Code nachgeprüft, sie stimmen: `erwartet()` begrenzt das 3P-Modell nicht auf ≥ 0
(`logik/signatur.py:121`); `verteilen()` deckelt erst in der Stundenverteilung (Summe ≠ Tageswert); die 95-%-Regel
prüft nur `bereich_minute`; das Baseline-Stundenprofil mischt alle Container. Das gemeinsame Modell mit Heizgradstunden
in der Heizzeit + Frostschutz überzeugt mich mehr als zwei Signaturen je Tagesart. Keine pauschale Obergrenze für
„gespart“.

### Vorbehalte
- **Monte Carlo** halte ich für die erste Stufe für zu schwer erklärbar. Vorschlag: drei Szenarien (milder / normaler /
  kalter Winter: Klimamittel −1,5 K / ±0 / +1,5 K … oder besser historische Winter?) × Unsicherheit von H
  (unten/Mitte/oben) → Band aus 9 Läufen, je Lauf mit und ohne Automatik gemeinsam.
- **Prior H ∈ [0,04; 0,12]·P** müssen wir nicht raten – wir messen genug (siehe unten).
- **Wiederaufheizen** S·N_start zunächst nicht eigens, sondern über Heizgradstunden inkl. Vorheizen.

### Antworten auf deine Rückfragen
1. **Thermostate (Herbert): auf Maximum.** Ohne Automatik laufen die Heizkörper also praktisch voll, bis der Container
   die Thermostat-Abschalttemperatur erreicht (bei Ölradiatoren auf Max. typisch ≈ 30 °C Raum?). Das heißt: „ohne
   Automatik“ ist wohl tatsächlich nahe Volllast, aber nicht 100 % und von außen abhängig (an milden Tagen schaltet der
   Thermostat öfter ab). Die 79 % Einschaltgrad sind damit vielleicht gar nicht so falsch – aber witterungsunabhängig
   bleibt falsch. Bitte bewerten.
2. **Heizfreigaben:** liegen minutengenau vor – `bereich_minute` je Container: `temperatur` (innen, Fühler), `soll`,
   `zustand`, `grund` (z. B. arbeitszeit, vorheizen, frost, hand, tuer, baseline), `tuer_offen_s`, `quelle`
   (ha / notprogramm / import_verlauf).
3. **Messdaten:** `geraet_minute` je Heizkörper und Minute: `sekunden_ein`, `sekunden_strom` (Leistung > 50 W),
   `leistung_w`, `leistung_w_max`, `energie_wh`, `erreichbar`; `wetter_minute`: `aussen_temp`; Tagessummen
   `tag_bereich`: `kwh`, `heizzeit_min`, `strom_min`, `gradh`, `temp_min/mittel/max` (innen), `aussen_mittel`,
   `heiztag`. Alle zehn Tage sind da. Die Verbrauchsdefinition ist für alle Container gleich (Summe `energie_wh` der
   Geräte des Containers).

### Was ich von dir für Runde 2 brauche
Lege das **erste umsetzbare Tagesmodell** fest, so dass ich es in `logik/` mit Tests bauen kann:

1. **Größen je Tag und Container** (aus den Tabellen oben): genaue Definition von GDH_aktiv und GDH_frost (welche
   Minuten zählen als „Heizzeit“: nach `grund`? nach Soll? nach `sekunden_ein`?), welche Innen-/Basistemperatur
   (T_b fest, z. B. Soll der Arbeitszeit, oder gemessene Innentemperatur?).
2. **H je Container aus den Messdaten schätzen:** konkretes Verfahren (z. B. eingeschwungene Heizstunden: mittlere
   Leistung ÷ (T_innen − T_außen); oder Regression E_d auf GDH_aktiv mit Nebenbedingung ≥ 0); Mindestdaten; was bei
   Konvektor vs. Ölradiator (Trägheit) zu beachten ist.
3. **Gegenmodell ohne Automatik mit Thermostat auf Max:** Formel für E_ohne je Tag (Volllast bis Abschalttemperatur
   T_max ≈ ?, also E_ohne = min(24·P, H·(T_max − T_außen)·24)?); wie T_max ohne Baseline schätzen; wie die Baseline
   (Wochenende ohne Automatik) T_max und H kalibriert.
4. **Rückfallstufen A–D** konkret mit Schwellen für unseren Fall (heute Stufe B/C mit 8 Heiztagen je Container,
   10,7–15,1 °C).
5. **Szenarioband:** wie viele Läufe, welche Witterung (Klimamittel ± K oder historische Winter Graz), wie aus Läufen
   die Spanne für mit / ohne / gespart.
6. **Plausibilitätsprüfungen und Tests** – die fünf Testfälle aus Runde 1 plus die für das neue Modell, mit erwarteten
   Zahlen, die ich in `tests/logik/` übernehmen kann.
7. **Umbau-Reihenfolge** in kleine, einzeln einspielbare Lieferungen (P0 kennzeichne ich bereits jetzt: „ohne“ und
   „gespart“ als „grobe Obergrenze, nicht belastbar“).
