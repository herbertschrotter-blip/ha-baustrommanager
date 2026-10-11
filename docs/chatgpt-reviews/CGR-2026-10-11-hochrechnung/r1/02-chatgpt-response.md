### Review Runde 1

Technisches Fachreview · Energiesignatur, Heizperiodenprognose und Einsparungsnachweis · Version 0.8.131

### 1. Gesamturteil

Die aktuelle Heizperiodenprognose ist fachlich nicht belastbar. Das Problem liegt nicht primär in der Regressionsmethode, sondern in der Modellierung des Heizbetriebs, der Vergleichsbasis und dem Umgang mit unzureichenden Daten.

Die gegenwärtige Prognose vermischt drei unterschiedliche Einflussgrößen:

* Witterung: Der Wärmebedarf steigt bei sinkender Außentemperatur.
* Betriebsführung: Arbeitstage, freie Tage, Vorheizen und Frostschutz verursachen unterschiedliche Verbrauchsprofile.
* Technische Begrenzung: Die elektrische Leistungsaufnahme ist durch die installierten Heizkörper und deren Thermostate begrenzt.

Diese Größen müssen getrennt modelliert und anschließend zusammengeführt werden.

AKTUELLE PROGNOSE · GESAMTE HEIZPERIODE

Mit Automatik: **4.227 kWh** · Ohne Automatik: **39.212 kWh** · Behauptete Einsparung: **89,2 %** · Fachliche Belastbarkeit: **Nicht gegeben**

Die 89,2 % sind rechnerisch korrekt aus den beiden Prognosewerten abgeleitet. Sie sind aber kein belastbarer Nachweis einer Energieeinsparung.

Besonders auffällig ist die Kombination aus nahezu temperaturunabhängigem Verbrauch mit Automatik und nahezu konstantem Volllastbetrieb ohne Automatik.

### 2. Bewertung der sechs Kritikpunkte

| Punkt | Bewertung | Priorität |
| --- | --- | --- |
| 1. Konstanter Tagesschnitt | Bestätigt: systematischer Winterfehler | Kritisch |
| 2. Nulltage in der Signatur | Bestätigt: falsche Modellstruktur | Kritisch |
| 3. Geringe Temperaturspanne | Bestätigt: Extrapolation instabil | Hoch |
| 4. Baseline 39 MWh | Bestätigt: unrealistisches Gegenmodell | Kritisch |
| 5. Unterschiedliche Zählbasis | Bestätigtes Vergleichsrisiko | Kritisch |
| 6. Künstliche Stundenverteilung | Näherung, nicht zwingend falsch | Mittel |

### 2.1 Der konstante Tagesschnitt

| Monat | Außenmittel | Prognose kWh/Tag |
| --- | --- | --- |
| Oktober | 10,6 °C | 13,1 |
| November | 5,4 °C | 19,9 |
| Dezember | 1,4 °C | 19,9 |
| Jänner | 0,6 °C | 19,9 |
| Februar | 2,3 °C | 19,9 |
| März | 6,5 °C | 19,9 |
| April | 11,2 °C | 19,9 |

Oktober enthält bereits gemessene Tage; die Monatswerte sind deshalb nicht unmittelbar mit vollständigen Prognosemonaten vergleichbar.

Die Rückfallmethode ist nicht bloß ungenau. Sie ignoriert einen bekannten, wesentlichen Einflussfaktor.

Ein einfacher temperaturabhängiger Prior wäre bereits besser als ein konstanter Tagesmittelwert. Er muss allerdings gegen die installierte Leistung begrenzt werden.

### 2.2 Arbeitstage und freie Tage

Hier liegt vermutlich der wichtigste Modellierungsfehler.

Beispiel C2: 13,4 kWh bei 10,8 °C; 0 kWh bei 13,2 °C; 0 kWh bei 11,2 °C.

Der Nullverbrauch am 10. Oktober ist nicht dadurch erklärbar, dass es warm war. Er ist eine Folge des Betriebsplans.

Die Regression interpretiert diesen Nullwert jedoch als temperaturabhängiges Verhalten. Dadurch werden Steigung, Heizgrenze und Fehlermaß verfälscht.

Empfehlung: Nicht zunächst zwei unabhängige Energiesignaturen für Arbeitstage und freie Tage aufbauen. Dafür sind zehn Tage zu wenig.

Stattdessen ein gemeinsames, temperaturabhängiges Modell mit expliziten Betriebsstunden verwenden. Freie Tage erhalten einen eigenen Frostschutzanteil, dessen Parameter separat gelernt werden.

### 2.3 Die Temperaturspanne

Die beobachtete Spanne beträgt nur 4,4 K.

C3 liefert eine Steigung von 16,4 kWh/K. Das bedeutet bei einer Temperaturänderung um 10 K theoretisch zusätzliche 164 kWh pro Tag.

Die Nennleistung von C3 beträgt dagegen nur 1,87 kW, also maximal E_max = 1,87 · 24 = 44,88 kWh/Tag.

Die extrapolierte Steigung ist somit physikalisch ungeeignet.

Die Grenze von 4 K reicht als Qualitätskriterium nicht. Entscheidend sind außerdem Temperaturverteilung, Betriebsstunden, Parameterstabilität und Extrapolationsentfernung.

### 2.4 Die Baseline ohne Automatik

Die 39.212 kWh entsprechen durchschnittlich rund 185 kWh pro Kalendertag über 212 Tage.

Das sind 185 / (9,7 · 24) ≈ 79,5 % der gesamten installierten Nennleistung – und zwar praktisch durchgehend über die Heizperiode.

Ein Ölradiator mit eigenem Thermostat benötigt nicht bei jeder Außentemperatur 80 % seiner Nennleistung. Das Modell setzt implizit einen sehr hohen und nahezu witterungsunabhängigen Einschaltgrad voraus.

Eine reale Baseline muss den thermostatisch geregelten Betrieb nachbilden, nicht einen permanenten Volllastbetrieb.

### 2.5 Die Vergleichsbasis

Für einen IPMVP-orientierten Vergleich müssen beide Szenarien auf dieselben Zeitintervalle, dieselben Außentemperaturen und dieselbe Ausstattung bezogen werden.

Der bisherige Zähler `ohne` ist eine laufende kontrafaktische Schätzung. Er ist keine Messung des Betriebs ohne Automatik.

Außerdem dürfen ausgeschaltete oder nicht verfügbare Heizkörper nicht stillschweigend in einem Szenario berücksichtigt und im anderen ausgeschlossen werden.

Die Szenarien benötigen eine gemeinsame Zeitachse und explizite Gültigkeitsintervalle für die Heizkörperkonfiguration.

### 2.6 Stundenverteilung

Eine gewichtete Tageswertverteilung ist für ein Diagramm akzeptabel, solange sie als synthetisches Profil gekennzeichnet wird.

Sie ist jedoch kein eigenständiges Stundenprognosemodell.

Insbesondere Vorheizen, thermische Trägheit von Ölradiatoren und das Erreichen der Solltemperatur werden nicht korrekt abgebildet.

Für die erste Korrekturstufe genügt eine leistungsbegrenzte Verteilung. Anschließend sollte ein gemessenes Stundenprofil gleicher Betriebsart hinzukommen.

### 3. Zusätzliche Befunde aus dem Repository

Geprüft wurden die acht angeforderten Dateien auf Branch `main`.

### 3.1 Fehler in `signatur.py`

Die Gittersuche erlaubt eine negative Grundlast. `erwartet()` begrenzt beim 3P-Modell den Rückgabewert nicht auf null.

Damit kann ein formal gültiger Fit negative Tagesverbräuche erzeugen.

Außerdem ist die Heizgrenze bei Daten ausschließlich unterhalb der tatsächlichen Heizgrenze nicht identifizierbar. Die Umstellung auf eine 2P-Gerade ist richtig, beseitigt aber nicht das Extrapolationsproblem.

Korrektur: Nichtnegative Vorhersage, Kapazitätsgrenze und getrennte Kennzeichnung von Fit-Güte und Prognose-Eignung.

### 3.2 Fehler in `hochrechnung.py`

`container_rest()` verwendet bei unsicherer Signatur den Tagesschnitt aller gezählten Tage.

Damit wird der Heizplan vollständig ignoriert. Ein Wochenende ohne Verbrauch senkt den erwarteten Verbrauch eines kalten Arbeitstags.

Weiterhin gilt:

```python
streuung = 1.645 * rmse * sqrt(anzahl_tage)
```

Diese Formel ist nur unter restriktiven Annahmen über unabhängige Prognosefehler geeignet.

Sie berücksichtigt weder gemeinsame Parameterunsicherheit noch systematische Modellfehler oder die Unsicherheit der zukünftigen Witterung vollständig.

Gerade bei einer Saisonprognose können die Fehler stark korreliert sein. Die Spanne wird dadurch potenziell massiv unterschätzt.

### 3.3 Fehler in `tagesverlauf.py`

Die Funktion `verteilen()` begrenzt Stunden auf die installierte Leistung. Übersteigt der Tageswert die Gesamtkapazität, wird überschüssige Energie nicht mehr verteilt.

Das ist als physikalische Begrenzung richtig, erzeugt aber einen Konsistenzfehler: Summe der Stundenwerte ≠ Tageswert.

Der Tageswert und die Summe der Stundenwerte können auseinanderlaufen.

Die Begrenzung muss bereits im Tagesmodell erfolgen. Der Stundenverteiler darf nicht heimlich eine zweite fachliche Prognose erzeugen.

Zusätzlich ist `FROST_ANTEIL = 0.05` keine physikalische Frostschutzregel. Es ist lediglich ein Verteilungsgewicht. Bei ausreichend kalter Witterung kann der tatsächliche Frostschutzbedarf erheblich höher sein.

### 3.4 Fehler in `zaehlen.py`

`zaehlen_geraet()` addiert die mittlere Betriebsleistung zum kontrafaktischen Zähler `ohne`, solange die relevanten Aktivitätsbedingungen erfüllt sind.

Damit wird ein hypothetischer Verbrauch gebucht, ohne die Thermostat-Einschaltdauer bei der jeweiligen Außentemperatur zu bestimmen.

Die gemessene Leistungsaufnahme eines eingeschalteten Heizkörpers ist nicht gleich seinem durchschnittlichen Verbrauch bei 24-stündiger Versorgung.

Diesen Zähler nicht mehr als Prognosegrundlage verwenden. Er kann vorerst als historischer Diagnosewert erhalten bleiben.

### 3.5 Fehler in `db/tage.py`

`hochrechnung_tage()` prüft die Erfassungsdauer anhand von `bereich_minute`.

Das sichert nicht automatisch ab, dass für jeden relevanten Heizkörper vollständige Energiemesswerte vorliegen.

Ein Container kann eine vollständige Bereichsaufzeichnung besitzen, während einzelne Shelly-Leistungswerte fehlen.

Die 95-%-Regel muss deshalb für die prognoserelevanten Energiekanäle separat geprüft werden.

Ein weiterer Punkt: `stunden()` bildet Baseline-Stundenprofile über sämtliche übergebenen Baseline-Tage und Container gemeinsam. Dadurch gehen containerspezifische Eigenschaften verloren.

### 3.6 Fehler in der Baseline-Übertragung

`ohne_baustelle()` überträgt das saisonale Verhältnis `ohne / mit` zwischen Containern gleichen Heizkörpertyps.

Das ist fachlich schwach begründet.

Der Unterschied zwischen zwei Containern hängt vor allem von Gebäudehülle, Lüftung, Solltemperatur, Betriebszeit und Heizleistung ab – nicht allein davon, ob ein Konvektor oder Ölradiator verwendet wird.

Auch ein aus Baseline-Tagen bestimmtes Modell kann die ganze Saison nicht zuverlässig extrapolieren, wenn ausschließlich milde Tage vorliegen.

### 4. Vorgeschlagenes Prognosemodell

Ich empfehle ein betriebszeitabhängiges, temperaturgeführtes Hybridmodell mit physikalischen Grenzen und stufenweise lernbaren Parametern.

### 4.1 Grundmodell mit Automatik

Für jeden Container c und jede Stunde h:

E_mit(c,h) = min[ P_c·Δt_h ; Q_regulär(c,h) + Q_frost(c,h) + Q_start(c,h) ]

* P_c: installierte, verfügbare Heizleistung in kW.
* Q_regulär: Wärmebedarf während des regulären Heizbetriebs.
* Q_frost: Frostschutz außerhalb der Heizzeit.
* Q_start: zusätzlicher Energiebedarf für das Wiederaufheizen.

Für regulären Heizbetrieb als erstes Modell:

Q_regulär(c,h) = u(c,h) · min( P_c·Δt_h ; H_c · max(0, T_b,c − T_a,h) · Δt_h )

u beschreibt den Anteil der Stunde mit regulärem Heizbetrieb, H_c einen effektiven Verlustkoeffizienten und T_b die empirische Heizgrenze.

Wichtig: Der Wiederaufheizterm darf nicht zusätzlich dieselbe Wärmeenergie erfassen, die bereits im Verlustmodell steckt. Er beschreibt primär den Nachholeffekt aus der abgesenkten Innentemperatur.

Eine stündliche Simulation wäre langfristig vorzuziehen. Für die erste Korrektur kann das Modell zunächst täglich aggregiert werden.

### 4.2 Tagesmodell als pragmatischer Einstieg

E_mit(d) = min[ 24·P_c ; H_c·GDH_aktiv(d) + F_c·GDH_frost(d) + S_c·N_start(d) ]

mit GDH_aktiv(d) = Σ_h u_h · max(0, T_b − T_a,h) · Δt_h

Der Frostschutz erhält eine eigene, deutlich niedrigere Solltemperatur beziehungsweise Heizschwelle.

Damit wird ein freier Tag nicht automatisch als Nullverbrauch angenommen. Bei milden Temperaturen kann er tatsächlich null sein, bei starkem Frost nicht.

### 4.3 Modell ohne Automatik

Das Gegenmodell verwendet dieselben Außentemperaturen, dieselbe installierte Leistung und dieselbe Containerkonfiguration.

Der Unterschied besteht im Betriebszustand: u_ohne = 1. Allerdings bleibt der Thermostat aktiv.

E_ohne(c,h) = min[ P_c·Δt_h ; H_c,ohne · max(0, T_b,c,ohne − T_a,h) · Δt_h ]

Der Verlustkoeffizient kann als gemeinsamer physikalischer Parameter mit dem Automatikmodell verknüpft werden. Unterschiedliche Raumtemperaturen und Regelverhalten müssen jedoch berücksichtigt werden.

Das ist wesentlich plausibler als 24 Stunden mit durchschnittlicher Betriebsleistung.

Wichtig: Die beiden Szenarien sind nicht automatisch über den Faktor 24/Heizstunden ineinander umrechenbar. Thermische Speicherung und Wiederaufheizen verhindern diese einfache Proportionalität.

### 5. Rückfallstufen und Unsicherheit

Mit zehn Oktobertagen ist eine präzise Winterprognose nicht möglich. Eine plausible, ausdrücklich vorläufige Szenarioprognose ist jedoch machbar.

| Stufe | Datenlage | Verfahren |
| --- | --- | --- |
| A – Initial | Keine geeigneten Heiztage | Physikalischer Prior mit breitem Szenarioband |
| B – Frühphase | 3–9 geeignete Heiztage | Prior plus gemessene Betriebsstunden |
| C – Lernphase | ≥10 Tage, ausreichende Betriebs- und Temperaturvariation | Regularisierte Regression |
| D – Kalibriert | ≥20 geeignete Tage, kalte und milde Tage, stabile Validierung | Empirisches Modell mit Unsicherheitsanalyse |

Diese Schwellen sind Vorschläge für die Implementierung, keine normativen ASHRAE-Grenzwerte.

### 5.1 Physikalischer Prior

Als anfängliche Annahme beispielsweise: H_c ∈ [0,04·P_c ; 0,12·P_c] kW/K

Dieser Bereich ist ausdrücklich kein allgemein gültiger Kennwert für Baustellencontainer, sondern ein zu validierender Startbereich.

Er darf nur verwendet werden, wenn die resultierenden Verbräuche mit bekannten Containerabmessungen, Dämmung und Heizleistung plausibel sind.

Besser wäre, den Verlustkoeffizienten aus Containerabmessungen, Dämmstandard und Lüftungsannahmen abzuleiten.

### 5.2 Lernen aus Messdaten

E_d = β1·GDH_aktiv(d) + β2·GDH_frost(d) + β3·N_start(d) + ε_d

* Nichtnegative Koeffizienten.
* Physikalische Obergrenzen.
* Regularisierung gegen einen plausiblen Prior.
* Keine freie Heizgrenzensuche, solange die Daten die Heizgrenze nicht identifizieren können.

Die Heizgrenze sollte anfangs als Annahme geführt und erst bei ausreichender Temperaturabdeckung geschätzt werden.

### 5.3 Prognosespanne

Eine einfache ±1,5-K-Wettervariation genügt nicht.

Drei Unsicherheitsquellen: Parameterunsicherheit des Wärmebedarfs; zukünftige Witterung; Betriebsunsicherheit einschließlich Heizplanänderungen.

Pragmatisch: Monte-Carlo-Szenarien aus plausiblen Parameterbereichen, korrelierten Witterungsverläufen und definierten Betriebsannahmen erzeugen. Für jedes Szenario werden mit und ohne Automatik gemeinsam berechnet. Anschließend die Quantile der saisonalen Verbräuche und Einsparungen bestimmen.

Die anfängliche Spanne sollte ausdrücklich als Szenarioband bezeichnet werden, nicht als statistisch kalibriertes 90-%-Konfidenzintervall.

### 6. Plausibilitätsprüfungen

| Prüfung | Erwartetes Verhalten |
| --- | --- |
| Negative Energie | Ungültiger Modellwert |
| Tagesverbrauch über 24·P | Fehler bzw. physikalische Begrenzung |
| Stundenverbrauch über P·Δt | Fehler bzw. Begrenzung |
| Fehlende Messwerte | Tag nicht zum Training verwenden |
| Nullverbrauch bei ausgeschalteter Heizung | Betriebsinformation, kein Temperaturbeweis |
| Extrapolation außerhalb Trainingsbereich | Unsicherheit erhöhen |
| Unplausible Heizgrenze | Prior verwenden |
| Änderung der Geräteausstattung | Modellversion/Segment wechseln |
| Tagessumme ≠ Stundenwerte | Konsistenzfehler |
| Negative Einsparung | Zulassen und korrekt ausweisen |

Eine pauschale Obergrenze von beispielsweise 80 % Einsparung würde ich nicht einführen. Eine solche Grenze wäre willkürlich und könnte reale Ergebnisse verfälschen. Stattdessen sollten extreme Einsparungen einen Plausibilitätshinweis auslösen.

```python
def test_kalter_freier_tag_hat_frostbedarf():
    # Ein freier Tag bei -10 °C darf nicht
    # allein wegen fehlender Arbeitszeit 0 kWh ergeben.
    ...

def test_szenarien_nutzen_gleiche_witterung():
    ...

def test_stunden_summe_entspricht_tageswert():
    ...

def test_ohne_automatik_ist_nicht_dauerhaft_volllast():
    ...

def test_zehn_milde_tage_erzeugen_breites_szenarioband():
    ...
```

Zusätzlich Tests für Zeitumstellung (23/25 Stunden), Heizkörperausfall, geänderte Arbeitszeiten, Baseline-Abbruch und fehlende Shelly-Energiemesswerte.

### 7. Priorisierte Umsetzung

**P0 – Sofort: Irreführende Einsparung entschärfen.** Die 39-MWh-Schätzung nicht mehr als belastbaren Baseline-Verbrauch behandeln. Die daraus berechneten 89 % dürfen nicht als nachgewiesene Einsparung gelten. Bestehende Messdaten und Zähler unverändert erhalten.

**P1 – Betriebsplan in das Modell aufnehmen.** Tagesart, Heizstunden, Frostschutz und Baseline-Modus als Modellmerkmale erfassen. Trainingstage anhand von Energieabdeckung und Betriebszustand filtern.

**P2 – Temperaturabhängigen Rückfall implementieren.** Den konstanten Tagesschnitt durch ein physikalisch begrenztes Prior-Modell ersetzen. Bereits ab dem ersten geeigneten Messtag ein breites Szenarioband liefern.

**P3 – Baseline-Kalibrierung verbessern.** Tatsächlich gemessene Baseline-Tage zur Kalibrierung des Gegenmodells verwenden. Keine unkontrollierte Übertragung eines saisonalen Faktors zwischen Containern.

**P4 – Stundenmodell und Unsicherheitskalibrierung.** Gemessene Stundenprofile, Vorheizeffekte und zeitlich korrelierte Unsicherheiten einführen. Historische Prognosen gegen später gemessene Werte prüfen.

Alle Stufen sollten unabhängig getestet und einzeln ausgerollt werden. Keine Änderung darf automatisch Heizkörper schalten oder Baseline-Läufe aktivieren.

### 8. Rückfragen vor Runde 2

1. Thermostatverhalten: Sind die Thermostate der Heizkörper auf eine feste Stellung eingestellt, und ist bekannt, welche ungefähre Raumtemperatur sie halten?
2. Betriebsdaten: Liegen die tatsächlichen Heizfreigaben je Container und Stunde historisch vor, einschließlich manueller Eingriffe und Frostschutz?
3. Messdaten: Können wir pro Heizkörper die stündlichen kWh sowie Innen- und Außentemperaturen für die bisherigen zehn Tage auslesen?

### 9. Ergebnis der Review-Runde

✅ Einigkeit: Alle sechs Ausgangskritikpunkte sind im Kern berechtigt. Die gegenwärtige Prognose ist für eine seriöse Aussage zur Heizperiodenersparnis ungeeignet. Der Heizplan muss explizit modelliert und die Baseline temperaturabhängig berechnet werden.

⚠️ Widerspruch: Eine getrennte Energiesignatur für jede Tagesart halte ich in dieser frühen Phase nicht für die beste Lösung. Ein gemeinsames, betriebszeitabhängiges Modell ist datenökonomischer und physikalisch besser begründbar. Auch einen pauschalen maximalen Einsparungsprozentsatz lehne ich ab.

❓ Rückfragen: Thermostateinstellungen, historische Heizfreigaben und verfügbare stündliche Messdaten müssen geklärt werden. Zusätzlich prüfen, ob die aktuelle Signatur für alle vier Container dieselbe Verbrauchsdefinition verwendet.

Vorschlag für Runde 2: Zuerst ein konkret implementierbares Tagesmodell mit physikalischem Prior, Betriebsstunden und ehrlichem Unsicherheitsband festlegen. Erst danach die Baseline-Kalibrierung und das Stundenmodell erweitern.
