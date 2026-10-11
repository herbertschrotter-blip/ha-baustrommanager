## Antwort auf Runde 4

CANVAS-TITEL: "Review Runde 5" – Format wie bisher (direkt an mich, ganze Antwort im Canvas, am Ende ✅ ⚠️ ❓).
Repo-Zugriff wie bisher: `herbertschrotter-blip/ha-baustelle`, **Branch `main`**, Stand `d0209b6` (0.8.131); der Code
hat sich nicht geändert.

### Einigkeit
Runde 4 übernehme ich vollständig: Ersatznachweis (§1, Konstantfolge ≤ 1 800 s, ±50 %, höchstens C, Pulscheck statt
Fenstermittel), die vier Minutenfelder (§2), `C_eff_aufheizen` mit eingefrorenem H (§3), Gegenmodell nur mit Plateau
**und** Thermostatzyklen (§4), tau aus Abkühlnächten als Timing-Kandidat (§5), Liefergrenzen P1/P2/P3/P4a/P4b (§7).
Deine RC-Testzahlen habe ich nachgerechnet (t_auf 1,682361 h, Tagesenergie 11,682361 kWh, Nacht 8,093348 °C,
Frostzeit 7,408023 h) – sie stimmen. Dein Befund zu `nenn_kw()` (`kern/staffelung.py:22`, gelerntes Mittel zuerst)
stimmt ebenfalls; als P_ref nehmen wir den im Gerät eingestellten Wert bzw. einen separat belegten Vollstrompegel.

### Antworten auf deine Rückfragen
1. **Beobachtungszeitpunkt des Innenfühlers:** HA führt neben `last_changed` auch `last_reported`, das sich bei einem
   erneut gemeldeten gleichen Wert erneuert, sofern die Fühlerintegration meldet. Ob unsere Fühler das tun, prüfe ich
   im P1-Adapter je Fühler; sonst gilt `temp_alter_s` = NULL bzw. zunehmend alt, wie von dir festgelegt.
2. **Thermostatstellung bei Baseline (Herbert):** „Baseline-Läufe sind am Wochenende. Da ist keiner da, der was
   verstellen kann.“ Wir führen das als Betriebsannahme je Lauf (`thermostat_unveraendert = angenommen`), nicht als
   Messung. Eine Verstellung am Freitag vor dem Lauf ist damit nicht ausgeschlossen.
3. **Zahlen nach P3** (Fenster direkt/Ersatz, Starts, Abkühlnächte je Container) liefere ich nach P3.

### Was ich in Runde 5 brauche: Bauvorlage aus einem Guss
Runden 2–4 haben die Fachregeln über drei Antworten verteilt festgelegt. Bevor ich baue, brauche ich sie **zusammengeführt
als eine verbindliche Bauvorlage**, die ich in den Bauplan übernehme:

1. **Modulschnitt in `logik/`:** welche Dateien (z. B. `prognose_merkmale.py`, `prognose_h.py`, `prognose_modell.py`,
   `prognose_stufe.py`), je Datei die öffentlichen Funktionen mit Signatur und die Datenklassen (Felder, Typen,
   Einheiten). Was aus `logik/hochrechnung.py`, `logik/signatur.py` und `logik/tagesverlauf.py` bleibt, was im
   Schattenbetrieb parallel läuft, was nach P6 entfällt.
2. **Adapter-Vertrag:** was der HA-/DB-Adapter (`funktionen/heizung/`) je Lieferung liefern muss (Minutenintervalle,
   rekonstruierter Kontext, Wetter, Plan) – als Datenklassen, damit `logik/` ohne HA testbar bleibt.
3. **Schema P1:** die vier Spalten final, plus wo im Kernpfad (`kern/staffelung.py`, Minutenschreiber) sie befüllt
   werden; Lauf-Metadaten der Baseline (`thermostat_unveraendert`).
4. **Anzeige je Stufe:** welche Zahlen, Texte und Bänder die Seite für A/B/C/D bei „mit“, „ohne“ und „gespart“ zeigt –
   kurz und für Laien verständlich (Herbert liest das, kein Statistiker). Die Seite rechnet nichts, sie zeigt nur, was
   die Integration liefert.
5. **Testplan:** die Testfälle aus Runden 3 und 4 je Datei/Lieferung zugeordnet; fehlende ergänzen.
6. **Widersprüche zwischen Runden 2–4**, die beim Zusammenführen auftauchen, ausdrücklich nennen und auflösen.
