## Antwort auf Runde 3

CANVAS-TITEL: "Review Runde 4" – Format wie bisher (direkt an mich, ganze Antwort im Canvas, am Ende ✅ ⚠️ ❓).
Repo-Zugriff wie bisher: `herbertschrotter-blip/ha-baustelle`, **Branch `main`**, Stand `d0209b6` (0.8.131); der Code
hat sich seit Runde 3 nicht geändert.

### Einigkeit
Deine Spezifikation P1–P4 übernehme ich ohne Änderung: Klassifikation (§1), Masken R/F und GDH mit gespeichertem
Soll (§2.2), Abdeckung (§2.3), ΔT_start (§2.4), Fenster und Schätzer (§3), Prognose minutenbasiert mit neun gepaarten
Szenarien (§4), Stufen getrennt für H und Prognose (§5), alle Testfälle (§6). Deine Testzahlen habe ich stichprobenhaft
nachgerechnet, sie stimmen.

### Antworten auf deine Rückfragen (am Schema geprüft, `db/schema.py`)
1. **Historische Konfiguration: ja.** `einstellung` ist versioniert (Spalte `ab`, je Baustelle/Bereich/Gerät und
   Schlüssel), ebenso `arbeitszeit` (`ab`), `ausnahme` je Datum, Gerätezuordnung über `container_einsatz` /
   `ausruestung_einsatz` (`von`). Regelungsmodus, Frostpolitik und frei_modus lassen sich damit je Minute
   rekonstruieren; ein wirksamer Fühlerausfall steht als `temperatur = NULL` in `bereich_minute`.
2. **Alter der Messwerte: nein.** Weder `bereich_minute.temperatur` noch `geraet_minute` speichern das Alter des
   Ursprungswerts.
3. **Staffelungsbegrenzung: nein.** Nicht je Minute gespeichert.

### Entscheidung Herbert zu 2./3.
Ab P1 speichern wir je Minute das Alter des Innenwerts und eine wirksame Staffelungsbegrenzung. Für **Altdaten** gilt
ein **Ersatznachweis** statt `frische_unbekannt` = gesperrt: ein stationäres Fenster aus Altdaten zählt mit Kennzeichen
`frische_ersatz`, wenn die Innentemperatur im Fenster und Vorlauf nicht eingefroren ist (kein unveränderter Wert über
> 30 min), der Plug durchgehend `erreichbar` ist und die Energie lückenlos vorliegt. Daraus höchstens Stufe C.
Sonst hätten wir aus der laufenden Saison gar kein H.

### Was ich in Runde 4 brauche
1. **Ersatznachweis** präzisieren: Schwellen (30 min eingefroren? Auflösung des Fühlers 0,1 K – wie unterscheiden
   „stabil“ und „eingefroren“, wo §3.2 gerade Stabilität verlangt?), Ersatz für die Staffelung (z. B. Summe
   `leistung_w` ≈ Summe Nennleistung bei Freigabe), Testfälle.
2. **Neue Minutenspalten** (P1): Name, Typ, Bedeutung von `temp_alter_s` und Staffelungsbegrenzung; was das
   Notprogramm am Shelly dort liefern kann (es kennt kein HA-Alter).
3. **Wiederaufheizen** (deine offene Modellgrenze §4.3): Wie identifizieren wir aus unseren Daten eine Wärmekapazität C
   bzw. eine Startkorrektur? Unsere Starts sind meist Vorheizen nach Nachtabsenkung bzw. Frost. Konkretes Verfahren,
   Mindestdaten, Formel E_start(ΔT_start, außen), Testfälle – oder begründet: bleibt Band bis Blockkapazität.
4. **Gegenmodell ohne Automatik** (heute Tagesschnitt, nicht belastbar): Thermostate auf Max., Container mit Fühler im
   Raum. Wie bestimmen wir T_max und H_ohne aus einem **Baseline-Lauf** (Wochenende ohne Automatik, Fühler misst mit)?
   Mindestdauer, Plateau-Erkennung, Formel E_ohne je Tag, Stufe. Für Container ohne Fühler: gibt es überhaupt ein
   Gegenmodell außer Duty × Kapazität?
5. **Frost-Dynamik:** reicht es, echte Frosttage abzuwarten, oder lässt sich die Frostkomponente aus Nächten nach dem
   Arbeitstag (Abkühlkurve innen) vorher eingrenzen?
6. **Liefergrenzen** P1–P4 ggf. um 1.–5. ergänzen (welche Teile gehören in welche Lieferung, was erst nach P3-Zahlen).
