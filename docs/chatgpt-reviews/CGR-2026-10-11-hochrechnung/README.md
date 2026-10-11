# CGR-2026-10-11-hochrechnung — Audit der Prognose (Hochrechnung, Signatur, ohne Automatik)

**Thema:** Fachliches Audit der Prognose der Heizperiode (BSM-033, `docs/bauplan-hochrechnung.md`): Energiesignatur je
Container, Rückfall Tagesschnitt, Tag/Woche/Monat, Verlauf 24 h, Schätzung „ohne Automatik“ vor der Baseline.
Anlass: Herbert, 11.10.2026: „Ich glaube bei dieser Prognose passt was gar nicht.“
**Zeitraum:** 2026-10-11
**Branch:** main
**Status:** Abgeschlossen (11.10.2026)

---

## Runden-Übersicht

### Runde 1 — Modell gegen Live-Daten prüfen
- **Artefakte:** [r1/](./r1/)
- **Fokus:** Tagesschnitt flach über den Winter, Arbeitstage/freie Tage gemischt, kleine Temperaturspanne, „ohne“-Schätzung
  39 MWh (≈ 90 % gespart), Vergleichsbasis, 24-h-Verteilung
- **Kernergebnis:** Prognose fachlich nicht belastbar: Heizbetrieb (Heizstunden, Frostschutz) fehlt im Modell, Nulltage
  zerstören die Signatur, Tagesschnitt ignoriert den Winter, „ohne“ = Volllast rund um die Uhr (keine Messung). Vorschlag:
  gemeinsames Modell H × Heizgradstunden (Heizzeit) + Frostschutz, Deckel 24·P, Rückfallstufen A–D, Szenarioband.
  Herbert: Thermostate auf Maximum; P0 sofort („ohne“/„gespart“ als nicht belastbar kennzeichnen); weiter mit Runde 2.

### Runde 2 — Umsetzbares Tagesmodell
- **Artefakte:** [r2/](./r2/)
- **Fokus:** GDH_aktiv/GDH_frost aus den Minutendaten, H je Container aus Messdaten, Gegenmodell mit Thermostat auf Max,
  Rückfallstufen, Szenarioband, Tests, Lieferreihenfolge
- **Kernergebnis:** Zielmodell E_mit = min(P·D, H·GDH_aktiv + Frost + Start), E_ohne = min(P·D, H·(T_eff,max − außen)·D);
  vier Betriebsarten; H aus stationären Fenstern (robust); 9 Szenarien (Witterung ±1,5 K × H 0,65/1/1,35, ohne mit
  T_eff 22/26/30 °C); Stufen A–D je Container; Lieferungen P0–P8. 39 MWh bei Thermostat auf Max. möglich, aber unbelegt.
  Herbert: Fühler im Raum; erst Runde 3 (verbindliche Spezifikation).

### Runde 3 — Verbindliche Spezifikation P1–P4
- **Artefakte:** [r3/](./r3/)
- **Fokus:** Minutenklassifikation aller Gründe, Tagesmerkmale und Schwellen, stationäre Fenster und H, Tagesmodell für
  zukünftige Tage (auch ohne Fühler), Stufen A–D, Testfälle
- **Kernergebnis:** Spezifikation P1–P4 vollständig übernommen (Klassifikation, Masken R/F, GDH mit gespeichertem Soll,
  Frostziel 6 °C, Fenster 120/180 min, H als Median, Tagesregression als Rückfall, neun gepaarte Szenarien, Stufen
  getrennt für H und Prognose, 30 Testfälle). Offene Modellgrenzen: Wiederaufheizen, Frost-Dynamik, Gegenmodell.
  Herbert: Altdaten mit Ersatznachweis (`frische_ersatz`, höchstens C); Runde 4 vor dem Bau.

### Runde 4 — Ersatznachweis, Wiederaufheizen, Gegenmodell
- **Artefakte:** [r4/](./r4/)
- **Fokus:** Ersatznachweis für Altdaten, neue Minutenspalten, Wärmekapazität/Startkorrektur, T_max und H_ohne aus
  Baseline, Frost-Dynamik, Liefergrenzen
- **Kernergebnis:** Ersatznachweis präzisiert (Konstantfolge ≤ 1 800 s, ±50 %, höchstens C; Pulscheck statt
  Fenstermittel); vier neue Minutenfelder; `C_eff_aufheizen` mit eingefrorenem H; Gegenmodell nur mit Plateau und
  Thermostatzyklen (erster Lauf höchstens B); tau aus Abkühlnächten; Liefergrenzen P1–P4a, P4b nach P3-Zahlen.
  Herbert: Baseline am Wochenende, Thermostate gelten als unverändert; Runde 5 vor dem Bau; Ergebnisse zum Abschluss
  in Bauplan und Tasks.

### Runde 5 — Bauvorlage aus einem Guss
- **Artefakte:** [r5/](./r5/)
- **Fokus:** Modulschnitt in `logik/`, Adapter-Vertrag, Schema P1, Anzeige je Stufe, Testplan, Widersprüche Runden 2–4
- **Kernergebnis:** verbindliche Bauvorlage (r5/02): 10 Module `prognose_*.py`, Typverträge, `PrognoseRegeln`,
  Adapter-Vertrag je Lieferung, vier Spalten, Anzeige-Texte A–D, Testplan, 21 aufgelöste Widersprüche. Herbert:
  abschließen und bauen.

## Ergebnis

- Entscheidungen: `docs/bauplan-hochrechnung.md` §8; Stufen .05–.09 in §2
- Fahrplan J5–J9, Aufgaben BSM-033.05 (P0) bis BSM-033.09 (P4a)
- Offen für eine neue Serie nach P3: Fensterzahlen je Container, Starts, Abkühlnächte → Entscheidung über P4b
