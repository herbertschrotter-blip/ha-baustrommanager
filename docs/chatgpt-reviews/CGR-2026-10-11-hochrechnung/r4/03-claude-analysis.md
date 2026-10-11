# Runde 4 – Einschätzung Claude

## Gesamturteil

Die Antwort schließt die drei offenen Modellgrenzen aus Runde 3 sauber, ohne etwas zu versprechen, was die Daten nicht
hergeben. Damit ist der Umbau P1–P4a vollständig spezifiziert; P4b (Dynamik) und der elektrische Wetterfit ohne Fühler
hängen ausdrücklich an den P3-Zahlen. Eine weitere Runde vor dem Bau bringt nichts Neues – die nächste sinnvolle
Rückmeldung an ChatGPT sind die Fenster-, Start- und Nachtzahlen nach P3.

## Nachgeprüft

- **RC-Testzahlen** stimmen: tau = C/H = 5 h; T_eq = 32 °C; t_auf = 5·ln(14/10) = 1,682361 h; Tagesenergie
  2·1,682 + 1·8,318 = 11,682361 kWh; Nacht 22·e^−1 = 8,093348 °C; Frostzeit 5·ln(22/5) = 7,408023 h.
- **`nenn_kw()`** (`kern/staffelung.py:22`) nimmt tatsächlich zuerst das gelernte Mittel im Betrieb – als P_ref für
  den Pulscheck ungeeignet. Richtig erkannt.
- **`ausnahme`** hat keinen Änderungsverlauf – stimmt; die gespeicherten Minuten-Gründe gehen vor.

## Übernehmen

- §1 Ersatznachweis: Quantisierung 0,1 K, längste Konstantfolge ≤ 1 800 s, Band ±50 %, höchstens C, keine
  Rückstufung bekannt veralteter Neudaten auf den Ersatzweg; Staffelung über Pulscheck (≥ 5 Vollstromminuten, Median in
  [0,8; 1,2]·P_ref) statt Fenstermittel ≈ Nennleistung.
- §2 Minutenfelder: `bereich_minute.temp_alter_s`, `bereich_minute.staffel_begrenzt_s`,
  `geraet_minute.staffel_gesperrt_s`, `geraet_minute.heizanforderung_s` – nullable, ohne Default, Notprogramm NULL.
  Das Alter lässt sich in HA über `last_reported` des Fühlerzustands belegen (erneuert sich auch bei gleichem Wert,
  sofern die Fühlerintegration meldet) – nicht über `last_changed`.
- §3 Startkorrektur als `C_eff_aufheizen` mit eingefrorenem H, Fit durch den Ursprung, Freigabe nur mit Holdout.
- §4 Gegenmodell: T_max_eff nur mit Plateau **und** Thermostatzyklen; erster Lauf höchstens B, C erst aus zwei Läufen.
- §5 Frost: tau aus Abkühlnächten als Timing-Kandidat; Energieband erst nach echten Frostzyklen enger.
- §7 Liefergrenzen P1, P2, P3, P4a, P4b, spätere Lieferung, P6.

## Hinweise für den Bau

1. P1 ändert das DB-Schema (vier Spalten) – SQLite und PostgreSQL, Check `integration-pg` läuft mit.
2. P0 (Kennzeichnung „grobe Obergrenze“) bleibt unabhängig davon die erste Lieferung.
3. Für Baseline-Läufe braucht es eine bestätigte Lauf-Angabe „Thermostatstellung/Stufe unverändert“ (Herbert).
