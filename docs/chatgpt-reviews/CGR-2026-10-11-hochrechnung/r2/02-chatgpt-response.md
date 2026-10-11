### Review Runde 2

Technisches Fachreview · Tagesmodell v1 · Heizgradstunden, Verlustkoeffizient und kontrafaktische Baseline

### 1. Architekturentscheidung

Ich stimme deinem Vorschlag eines deterministischen Szenariomodells zu. Für die erste produktive Version brauchen wir weder Monte Carlo noch eine vollständige thermische Gebäudesimulation.

Allerdings würde ich zwei Dinge strikt trennen:

A. Verbrauch mit Automatik: Aus gemessenen Betriebszuständen, Innen- und Außentemperaturen sowie tatsächlicher Heizenergie lernen.

B. Verbrauch ohne Automatik: Den 24-Stunden-Betrieb mit Thermostat auf Maximum zunächst als physikalisch begrenztes Szenario modellieren. Erst durch Baseline-Messungen wird daraus eine empirisch kalibrierte Prognose.

Mein Vorschlag für die erste Version:

E_mit(d) = min(P_c·D_d ; H_c·G_aktiv(d) + E_frost(d) + E_start(d))
E_ohne(d) = min(P_c·D_d ; H_c·G_max(d) + E_start,ohne(d))

Dabei ist D_d die tatsächliche Tagesdauer in Stunden, also bei Zeitumstellungen auch 23 oder 25 Stunden.

Die Formeln sind das fachliche Zielmodell. Für v1 würde ich den Startterm noch nicht frei schätzen, sondern als Unsicherheitsquelle führen. Ein unmodellierter Aufheizbedarf darf nicht stillschweigend als präzise bestimmter Wärmeverlust interpretiert werden.

### Eine wesentliche Einschränkung

Ein thermischer Verlustkoeffizient ist nicht allein aus dem Tagesverbrauch und der Außentemperatur eindeutig identifizierbar.

Wir müssen deshalb zuerst die Minuten mit annähernd stationärem Betrieb bestimmen. Erst daraus können wir H schätzen.

Die vorhandenen Minutendaten machen das grundsätzlich möglich. Sie garantieren aber noch keine ausreichend langen stationären Zeitfenster.

### 2. Thermostate auf Maximum – neue Bewertung

Die zusätzliche Information verändert meine Bewertung der bisherigen 39-MWh-Prognose.

Bei maximal eingestellten Thermostaten können 79 % mittlerer Einschaltgrad durchaus auftreten. Insbesondere bei schlecht gedämmten Containern, hoher Solltemperatur und niedrigen Außentemperaturen.

Die 39 MWh sind daher nicht zwangsläufig physikalisch unrealistisch. Sie sind lediglich durch die bisherige Methode nicht nachgewiesen.

Ein wichtiger Unterschied:

* 100 % elektrische Einschaltzeit: maximale Energieaufnahme.
* 79 % Einschaltzeit: technisch möglich.
* 79 % über Oktober bis April: eine bislang unbelegte Annahme.

Die Abschalttemperatur eines mechanischen Heizkörperthermostats darf außerdem nicht pauschal mit 30 °C angesetzt werden.

Sie hängt von Gerät, Thermostatposition, Luftzirkulation und Messort ab. Gerade bei Ölradiatoren kann der Thermostat die Temperatur in Gerätenähe erfassen, während der Raumfühler deutlich niedrigere Temperaturen misst.

Für das Gegenmodell benötigen wir deshalb einen effektiven Thermostat-Gleichgewichtspunkt, nicht zwingend eine tatsächliche Raumtemperatur von 30 °C.

### 3. Exakte Definition der Tagesgrößen

### 3.1 Minutenklassifikation

Die Klassifikation muss auf der tatsächlichen Heizfreigabe beruhen, nicht auf der gemessenen Stromaufnahme.

Ein Thermostat darf innerhalb einer freigegebenen Heizminute abschalten. Diese Minute bleibt trotzdem Teil des regulären Heizbetriebs.

| Datenfeld | Verwendung |
| --- | --- |
| bereich_minute.grund | Betriebsart klassifizieren |
| bereich_minute.zustand | Tatsächliche Heizfreigabe prüfen |
| bereich_minute.soll | Solltemperatur und Betriebsziel |
| bereich_minute.temperatur | Innenraumtemperatur |
| geraet_minute.energie_wh | Tatsächlicher Energieverbrauch |
| geraet_minute.sekunden_ein | Elektrische Freigabe, Diagnose |
| geraet_minute.sekunden_strom | Tatsächliche Leistungsaufnahme, Diagnose |
| wetter_minute.aussen_temp | Temperaturdifferenz |

Ich schlage vier exklusive Betriebsarten vor:

| Betriebsart | Klassifikation |
| --- | --- |
| REGULAER | Arbeitszeit, Vorheizen, reguläres Nachheizen |
| FROST | Frostschutzbetrieb |
| BASELINE | Freigegebener Dauerbetrieb ohne Automatik |
| SONSTIGE | Handbetrieb, Türpause, Notprogramm, unbekannte Zustände |

Entscheidend ist eine zentrale Funktion `klassifiziere_minute()` in `logik/`. Die konkreten Zustandswerte aus dem Repository müssen vollständig darauf abgebildet werden. Unbekannte Werte dürfen nicht stillschweigend als regulärer Heizbetrieb gelten.

Eine Türpause ist keine reguläre Heizminute. Für die Vorhersage bleibt sie eine Betriebsabweichung, deren Ursache gesondert behandelt werden muss.

### 3.2 Heizgradstunden

Für eine Minute m mit Dauer Δt_m in Stunden:

GDH_aktiv(d) = Σ_{m ∈ REGULAER} max(0, T_soll,m − T_außen,m)·Δt_m
GDH_frost(d) = Σ_{m ∈ FROST} max(0, T_frost,m − T_außen,m)·Δt_m

Einheit jeweils K·h.

Ich würde die Solltemperatur als Basis für die Prognose verwenden, weil sie das gewünschte Temperaturniveau beschreibt und auch für zukünftige Tage verfügbar ist.

Die gemessene Innentemperatur benötigen wir dagegen zur Kalibrierung des Verlustkoeffizienten und zur Prüfung stationärer Betriebszustände.

Wichtig: Diese GDH-Definition ist eine technische Modellgröße, nicht identisch mit normierten Heizgradtagen 20/12.

### 3.3 Energie und Betriebsdauer

Für jeden Container: E_d = Σ_g Σ_m EnergieWh_{g,m} / 1000

Dazu speichern wir: `stunden_regulaer`, `stunden_frost`, `stunden_baseline`, `stunden_sonstige`, `gdh_regulaer`, `gdh_frost`, `kwh_regulaer`, `kwh_frost`, `kwh_baseline`, `kwh_sonstige`, `abdeckung_energie`, `abdeckung_temperatur`.

Die Energie wird den Betriebsarten anhand ihrer tatsächlichen Zeitintervalle zugeordnet. Bei überlappenden oder unvollständigen Minutenintervallen muss die Integration die Zuordnung als unvollständig markieren.

Ein Tagesdatensatz mit 95 % Bereichsabdeckung, aber nur 60 % Shelly-Energieabdeckung ist für die Kalibrierung ungeeignet.

### 3.4 Wichtige Modellkorrektur

Das Produkt H·GDH beschreibt zunächst den stationären Wärmeverlust während der regulären Betriebsstunden.

Es beschreibt nicht automatisch den gesamten elektrischen Energiebedarf des Tages.

Nach einem kalten Wochenende wird zusätzlich Energie benötigt, um die Innenraumtemperatur und thermische Masse wieder anzuheben.

Deshalb sollten wir bereits in v1 erfassen: ΔT_start = max(0, T_soll,start − T_innen,start)

Auch wenn wir dafür noch keinen eigenen Regressionskoeffizienten bestimmen, können wir Tage mit großem Aufheizdefizit vom stationären Training ausschließen und das Prognoseband entsprechend erweitern.

### 4. Verlustkoeffizient H aus Messdaten bestimmen

Ich empfehle ein zweistufiges Verfahren.

### 4.1 Primärverfahren: stationäre Zeitfenster

Aus den Minutendaten werden zusammenhängende Zeitfenster von mindestens 60 Minuten gebildet.

Ein Fenster gilt zunächst als stationär, wenn: regulärer Heizbetrieb oder Baseline; Innen- und Außentemperatur ausreichend vollständig; keine längere Türöffnung; keine manuelle Unterbrechung; Temperaturänderung innen höchstens 0,5 K pro Stunde; Temperaturdifferenz innen–außen mindestens 5 K; keine offensichtliche Leistungsmessstörung.

Die Schwellen sind konfigurationsfreie Startwerte, die anhand der Pilotdaten validiert werden sollten.

Dann: H_i = E_i / Σ_m (T_innen,m − T_außen,m)·Δt_m  [kW/K]

Beispiel: Verbrauch 1,2 kWh in einer Stunde, innen 20 °C, außen 10 °C → H = 1,2/10 = 0,12 kW/K.

Für einen Container mit 1,87 kW Heizleistung wäre das technisch plausibel, aber ohne Kenntnis der Containerhülle nicht verifiziert.

Wichtig: Dieses Verfahren misst einen effektiven Verlustkoeffizienten. Sonneneinstrahlung, Personen, Gerätewärme und Lüftung können ihn verzerren.

### 4.2 Robuste Aggregation

Nicht den einfachen Mittelwert der einzelnen H_i verwenden. Empfehlung: mindestens sechs geeignete Stundenfenster; Verteilung auf mindestens drei verschiedene Tage; mindestens 30 K·h aufsummierte Temperaturdifferenz; gewichtete robuste Schätzung, vorzugsweise Median oder robuste Regression; Streuung über Median Absolute Deviation dokumentieren.

Als Startschwelle CV_robust(H) ≤ 30 % für eine vorläufig brauchbare Schätzung.

Diese Schwelle allein reicht nicht zur Freigabe einer Saisonprognose. Sie bewertet zunächst nur die Konsistenz der stationären Fenster.

### 4.3 Ölradiator und Konvektor

Bei Konvektoren kann ein stationäres Fenster häufig schneller erreicht werden.

Bei Ölradiatoren ist die thermische Trägheit erheblich. Elektrische Energie wird zunächst im Öl und im Gehäuse gespeichert und später abgegeben.

Daher für Ölradiatoren zusätzlich: keine unmittelbar vorausgehende große Änderung des Heizbetriebs; mindestens 90 Minuten Beobachtungsfenster; möglichst stabile Innenraumtemperatur; keine starke Leistungsänderung direkt am Anfang oder Ende des Fensters.

Diese Werte sind Startheuristiken, keine gerätespezifisch gesicherten Konstanten.

Bei C1 mit zwei Ölradiatoren ist die gesamte elektrische Heizenergie beider Geräte zu verwenden. Ein gemeinsamer Verlustkoeffizient gehört zum Container, nicht zum einzelnen Heizkörper.

### 4.4 Sekundärverfahren: Tagesregression

Falls stationäre Fenster fehlen: E_regulär(d) = β·GDH_aktiv(d) + ε_d mit β ≥ 0, robust geschätzt und gegen physikalisch plausible Werte begrenzt.

Aber: Diese Regression sollte nur Tage mit vergleichbaren Betriebsbedingungen enthalten. Sonst absorbiert β den Aufheizbedarf, die solaren Gewinne und Änderungen der Betriebszeit.

Mit acht milden Heiztagen würde ich dieses Verfahren höchstens als vorläufige Kalibrierung einsetzen.

### 5. Gegenmodell ohne Automatik

### 5.1 Vor der ersten Baseline

E_ohne(d) = min[ P_c·D_d ; H_c·max(0, T_eff,max − T_außen,d)·D_d ]

ist als erste Näherung geeignet. T_eff,max ist keine behauptete tatsächliche Raumtemperatur, sondern ein effektiver Regelparameter, der auch interne Wärmegewinne und Thermostatverhalten zusammenfasst.

Ohne Baseline ist dieser Parameter nicht identifizierbar. Drei explizite Annahmen:

| Szenario | Effektive Temperatur |
| --- | --- |
| Niedriger Bedarf | 22 °C |
| Mittlerer Bedarf | 26 °C |
| Hoher Bedarf | 30 °C |

Diese Werte sind bewusst als Szenarioannahmen, nicht als bekannte Abschalttemperaturen, zu behandeln. Die Auswahl muss später mit den konkreten Heizkörpern überprüft werden.

Beispiel C2 mit P = 1,81 kW, H = 0,10 kW/K und 10 °C außen: E_ohne,22 = 28,8 kWh; E_ohne,26 = 38,4 kWh; E_ohne,30 = 43,44 kWh (bereits durch die Nennleistung begrenzt).

Damit wird deutlich, warum die Thermostatstellung auf Maximum den Baseline-Verbrauch erheblich erhöhen kann.

### 5.2 Nach Baseline-Messungen

Baseline-Tage liefern: tatsächlichen Verbrauch bei Dauerfreigabe; gemessene Innenraumtemperatur und elektrische Einschaltdauer.

Aus stabilen Baseline-Stunden können wir H erneut prüfen.

Die effektive Abschalttemperatur lässt sich näherungsweise aus längeren Perioden mit thermostatischem Takten und stabiler Innentemperatur bestimmen. Allerdings ist bei einem lokal am Heizkörper sitzenden Thermostat die Raumtemperatur nicht zwangsläufig gleich seiner Abschalttemperatur.

Deshalb sollte die Kalibrierung primär auf gemessenen kWh beruhen: E_baseline,h ≈ min[P_c·Δt ; H_c·(T_eff,max − T_außen,h)_+·Δt]

Für die ersten Baseline-Tage H aus dem Automatikbetrieb zunächst festhalten und nur T_eff,max kalibrieren. Erst bei ausreichender Temperaturvariation und mehreren Baseline-Blöcken beide Parameter gemeinsam nachschätzen.

### 5.3 Kritischer Punkt zur IPMVP-Einordnung

Die geplanten Baseline-Wochenenden sind ein sinnvoller kontrollierter Messversuch. Sie sind aber nicht automatisch ein vollständiger IPMVP-Option-B-Nachweis.

Für eine belastbare Einsparungsbewertung zusätzlich: dokumentierte Vergleichsbedingungen; Messunsicherheit; Normalisierung von Witterung und Betriebsbedingungen; Prüfung nicht routinemäßiger Änderungen; ausreichende Datenabdeckung.

Bis dahin sollte die Anzeige zwischen gemessener Energie, modellierter Baseline und geschätzter Einsparung unterscheiden.

### 6. Rückfallstufen A–D

Nicht ausschließlich anhand der Anzahl der Kalendertage. Entscheidend sind verwertbare stationäre Fenster, Temperaturabdeckung und Modellstabilität.

| Stufe | Kriterien | Prognose |
| --- | --- | --- |
| A | Weniger als 3 geeignete Heiztage und keine ausreichenden stationären Fenster | Physikalische Annahmen |
| B | Mindestens 3 Heiztage oder 6 stationäre Fenster auf ≥3 Tagen | Vorläufig kalibriertes H, breites Band |
| C | ≥10 geeignete Heiztage, ≥12 stationäre Fenster auf ≥5 Tagen, Temperaturspanne ≥6 K | Regularisiertes Betriebsmodell |
| D | ≥20 Heiztage, ≥30 stationäre Fenster, ≥10 K Temperaturspanne, kalte Tage und bestandene zeitliche Validierung | Kalibriertes Modell |

Die Kriterien sind kumulativ, sofern nicht ausdrücklich „oder“ angegeben ist. Für D zusätzlich mindestens fünf Tage mit Außentemperaturen unter 5 °C und ein akzeptabler Fehler auf zeitlich zurückgehaltenen Daten.

Die Pilotbaustelle liegt derzeit höchstens in Stufe B. Ob B bereits erreichbar ist, hängt von den tatsächlich vorhandenen stationären Zeitfenstern ab.

Bei C4 besonders vorsichtig: Mehrere Nulltage zu Beginn und späterer Heizbetrieb können auf eine Inbetriebnahme oder Änderung der Konfiguration hindeuten. Solche Phasen dürfen nicht unbesehen gemeinsam trainiert werden.

Die Stufen sind je Container zu vergeben.

### 7. Deterministisches Szenarioband

Neun Läufe als erste Version unterstützt, aber nicht als 90-%-Intervall bezeichnen.

| Witterung | H niedrig | H Mitte | H hoch |
| --- | --- | --- | --- |
| Mild: +1,5 K | S1 | S2 | S3 |
| Normal: ±0 K | S4 | S5 | S6 |
| Kalt: −1,5 K | S7 | S8 | S9 |

Für jeden Lauf: mit, ohne und Differenz gemeinsam. Später vollständige historische Winterjahre (GeoSphere Austria). Für v1 sind ±1,5 K als Sensitivitätsannahme akzeptabel.

H-Varianten in Stufe B: H_niedrig = 0,65·H_mittel, H_hoch = 1,35·H_mittel (vorläufig). In C/D aus Messdaten ermittelte Parameterbereiche. Für die Baseline zusätzlich Unsicherheit von T_eff,max; für v1 die drei Thermostatannahmen 22/26/30 °C den drei H-Varianten zuordnen (bewusst breit, konservativ gekoppelt). Langfristig Thermostatunsicherheit unabhängig von H variieren.

Auswertung: S_s = E_ohne,s − E_mit,s; Spannen min/max über s, für mit, ohne und gespart; die Einsparungsspanne direkt aus den neun Differenzen (nicht Extremwerte subtrahieren). Mittelwert = mittleres Szenario S5, nicht Durchschnitt. Negative Einsparungen nicht abschneiden.

### 8. Konkrete Tests mit Zahlen (synthetisch)

1. Reguläre Heizgradstunden: 8 h, Soll 20 °C, außen 10 °C, H = 0,10 kW/K → GDH 80 K·h, E = 8 kWh.
2. Frostschutz am freien Tag: 24 h, Frostschwelle 5 °C, außen −10 °C, H = 0,10 → GDH 360 K·h, E = 36 kWh.
3. Leistungslimit: 24 h, P = 1,87 kW, Bedarf 80 kWh → 44,88 kWh.
4. Thermostat auf Maximum: P = 1,81, H = 0,10, T_eff 26 °C, außen 10 °C, 24 h → 38,4 kWh.
5. Gemeinsame Witterung: 10 °C, H = 0,10; mit: 8 h bei 20 °C + 16 h Frost bei 5 °C → 8 kWh; ohne: 24 h bei 26 °C → 38,4 kWh; gespart 30,4 kWh (stationär, ohne Aufheizterm).
6. Nulltag trotz niedriger Temperatur (grund=frost, −10 °C, 0 kWh) → Datenqualitätsflag, H nicht auf null.
7. Unvollständige Energiemessung (bereich 100 %, ein Heizkörper 70 % Energie) → Tag für H ausgeschlossen.
8. Tages-/Stundenkonsistenz: 12 kWh, Stunden max 2 kWh → Summe 12; 60 kWh bei 48 kWh Kapazität → Tagesmodell liefert bereits 48.
9. Zeitumstellung: P = 2 kW → 23 h 46 kWh, 24 h 48 kWh, 25 h 50 kWh; auf UTC-Intervallen rechnen.
10. Baseline-Container nicht vermischen: A 60 % Nachtanteil, B 30 % → individuelle Profile.
11. Extreme Einsparung: mit 1 000, ohne 9 000 → 8 000 kWh, 88,9 %, kein Abschneiden, Plausibilitätshinweis.
12. Fehlende Heiztage: 10 Tage, 8 Heiztage, 2 freie mit 0 kWh → beeinflussen H/Regression nicht, bleiben als Frostschutz-Beobachtungen.

### 9. Kleine, einzeln einspielbare Lieferungen

| Lieferung | Inhalt | Risiko |
| --- | --- | --- |
| P0 | Baseline-Schätzung und Einsparung als nicht belastbar kennzeichnen | Sehr gering |
| P1 | Minutenklassifikation und Qualitätskennzahlen in logik/ | Gering |
| P2 | Tagesmerkmale einschließlich GDH, Betriebsdauer und Energie je Betriebsart | Gering |
| P3 | Stationäre Fenster und robuste H-Schätzung, nur Diagnose | Gering |
| P4 | Physikalisches Tagesmodell mit Automatik, zunächst parallel zur bisherigen Prognose | Gering |
| P5 | Neun Szenarioläufe und Konsistenzprüfungen | Mittel |
| P6 | Neues Modell als produktive Prognosequelle aktivieren | Mittel |
| P7 | Thermostat-Max-Gegenmodell und Baseline-Kalibrierung | Mittel |
| P8 | Gemessene Stundenprofile und zeitliche Validierung | Mittel |

P4 und P5 zunächst im Shadow-Modus. P6 rücknehmbar, ohne historische Messdaten oder Zählerstände zu verändern.

Architekturregeln: Fachlogik in `logik/` mit Tests; `db/` extrahiert nur Rohdaten; `funktionen/heizung/` orchestriert; Frontend zeigt nur an. Keine zweite parallele Fachimplementierung; neue Funktionen zuerst isoliert, dann kontrolliert ersetzen.

### 10. Abschluss Runde 2

✅ Einigkeit: gemeinsames betriebszeitabhängiges Modell mit Heizgradstunden für regulären Heizbetrieb und Frostschutz; H bevorzugt aus stationären Messfenstern; neun deterministische Szenarien für v1. Die 39-MWh-Baseline ist wegen der maximalen Thermostateinstellung physikalisch möglich, aber weiterhin unbewiesen.

⚠️ Widerspruch: Aufheizbedarf nicht als durch die Heizgradstunden vollständig erfasst betrachten. Ebenso ist 30 °C keine gesicherte Raumtemperatur; effektive Thermostatparameter mit breiter Unsicherheit.

❓ Rückfragen: Welche Werte können `bereich_minute.grund` und `zustand` annehmen? Wie häufig liegen stationäre Zeitfenster von mindestens 60 Minuten vor? Sind die Innenfühler repräsentativ platziert oder nahe den Heizkörpern?

Runde 3 sollte die Minutenklassifikation, die stationäre H-Schätzung und das Tagesmodell als verbindliche Implementierungsspezifikation abschließen.
