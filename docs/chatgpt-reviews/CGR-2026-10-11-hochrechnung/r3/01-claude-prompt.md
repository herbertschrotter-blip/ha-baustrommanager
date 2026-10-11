## Antwort auf Runde 2

CANVAS-TITEL: "Review Runde 3" – Format wie bisher (direkt an mich, ganze Antwort im Canvas, am Ende ✅ ⚠️ ❓).
Repo-Zugriff wie bisher: `herbertschrotter-blip/ha-baustelle`, **Branch `main`**, Stand `d0209b6` (0.8.131).

### Einigkeit
Dein Zielmodell, die vier Betriebsarten, H aus stationären Fenstern (robust, Rückfall Tagesregression), die neun
Szenarien mit Einsparung je Lauf, Stufen je Container und die Lieferungen P0–P8 (P4/P5 im Schattenbetrieb, P6
rücknehmbar) übernehme ich. Deinen Widerspruch zum Aufheizbedarf akzeptiere ich: ΔT_start wird erfasst, Tage mit großem
Aufheizdefizit fallen aus dem stationären Training, und das Band wird breiter.

### Antworten auf deine Rückfragen
1. **`bereich_minute.grund`** = `SollGrund` (`logik/regelung.py`), alle Werte:
   `arbeitszeit, vorheizen, fruehstart, nachheizen, trocknen` (Heizplan),
   `frost` (Frostschutz: ein unter `frost_grenze` = 5 °C Innentemperatur, aus über Grenze + 2 °C; ohne Fühler nach
   außen), `absenken` (Urlaub/Feiertag mit abgesenktem Soll), `baseline` (Baseline-Lauf),
   `boost` (schnell aufheizen), `taste` (Taste am Plug, zeitlich begrenzt), `bedarf` (Container „nur bei Bedarf“/Termin),
   `hand` (Handbetrieb), `tuer_offen` (Tür-Pause), `bereit` (Bedarfs-Container wartet, nur Frost),
   `frei, ausserhalb, heizgrenze, aus, automatik_aus` (keine Heizfreigabe).
   **`zustand`** (`funktionen/heizung/anzeige.py`): `heizt, frost, trocknen, pause` (Tür), `bereit, aus, offline`.
   Wichtig: **Mit Fühler regelt die Automatik in der Heizzeit selbst auf das Soll** (Modus „thermo“, Taktung/TPI):
   in einer Minute mit `grund = arbeitszeit` kann der Heizkörper also bewusst aus sein („Soll erreicht“). Das Soll ist
   **gleitend**: 21–24 °C, +0,1 K je Grad, um den das 3-Tage-Außenmittel unter 12 °C liegt (`logik/soll`).
   Ohne Fühler gilt nur der Heizplan, und der Thermostat am Gerät (auf Max.) regelt.
2. **Stationäre Fenster:** lassen sich erst mit P1–P3 zählen; die Zahlen liefere ich nach P3.
3. **Innenfühler (Herbert):** im Raum, weg vom Heizkörper – sie messen die Raumtemperatur.

### Was ich jetzt brauche: verbindliche Spezifikation für P1–P4
Schreib sie so, dass ich sie 1:1 in `logik/` umsetzen und testen kann:

1. **`klassifiziere_minute()`**: Abbildung jedes `grund`-Werts (oben) auf REGULAER / FROST / BASELINE / SONSTIGE –
   inkl. `boost`, `taste`, `bedarf`, `absenken`, `trocknen`, `fruehstart`; Rolle von `zustand` (z. B. `offline` →
   SONSTIGE?); Minuten ohne Zeile; `quelle = notprogramm`.
2. **Tagesmerkmale (P2):** genaue Formeln inkl. welches T_soll (das gespeicherte `soll` der Minute?), welches
   T_frost (Grenze 5 °C oder Grenze + 2?), Abdeckungsquoten (Energie je Heizkörper, Temperatur, Außen) und die
   Schwellen, ab denen ein Tag für Training zählt; ΔT_start-Definition und Ausschlussschwelle.
3. **Stationäre Fenster und H (P3):** Fensterbildung (gleitend oder blockweise, Überlappung), Kriterien mit Zahlen,
   Sonderregel bei automatischer Soll-Regelung (Taktung: Energie über das Fenster mitteln?), Ölradiator-Regel,
   robuster Schätzer (Median gewichtet mit Σ ΔT·Δt?) und MAD-basierte Güte; Ausgabeformat je Container.
4. **Tagesmodell mit Automatik (P4):** für zukünftige Tage – woher kommen geplante REGULAER-Stunden (Heizplan der
   Integration je Tag), T_soll (gleitendes Soll aus der Vorhersage), T_außen je Stunde (stündliche Vorhersage, sonst
   Klimamittel mit typischem Tagesgang); Frostschutz an freien Tagen; Deckel P·D; wie der Tagesschnitt/die alte
   Signatur abgelöst wird. Für Container **ohne Fühler** (nur Heizplan, Thermostat am Gerät auf Max.): welches Modell?
5. **Stufen A–D je Container** als Funktion mit Ein-/Ausgabe; was die Seite je Stufe anzeigen soll.
6. **Testfälle** zu 1–5 mit synthetischen Zahlen (wie in Runde 2), so dass ich sie in `tests/logik/` übernehmen kann.
