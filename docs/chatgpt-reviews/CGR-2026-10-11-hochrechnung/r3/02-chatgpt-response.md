# Review Runde 3

**P1–P4 kann ich so festlegen. Zwei Präzisierungen sind verbindlich: Betriebsart, Heizbereitschaft und Messqualität sind getrennte Größen; ein stationäres H allein ist noch kein vollständiges Tagesmodell mit Wiederaufheizen.**

Geprüfter Stand: `main` = `d0209b676690ed7a73b4287d49f406437a97457a`, Version 0.8.131. Alle Repo-Dateien wurden ausdrücklich mit `ref=main` gelesen. Die nachstehenden Zahlen sind **Startwerte unserer Implementierung**, keine normativen Grenzwerte aus ASHRAE oder IPMVP.

## 1. P1: Minutenvertrag und Klassifikation

Lege die reine Logik in einem neuen Modul `logik/prognose_merkmale.py` an. Der Adapter liefert UTC-Intervalle, Datenqualität und die zur Minute gültige Konfiguration. Zeitdauern werden aus Intervallgrenzen berechnet, nicht aus Zeilenanzahlen.

```python
klassifiziere_minute(grund, zustand, quelle, zeile_vorhanden)
# -> Klasse(art, betrieb_gueltig, ausschlussgruende)
```

Die Grundabbildung ist vollständig:

| grund | art | Behandlung |
|---|---|---|
| arbeitszeit, vorheizen, fruehstart, nachheizen, trocknen | REGULAER | geplante Betriebszeit, einschließlich TPI-Ausschaltphasen |
| bedarf | REGULAER | angeforderter Betrieb; zukünftige Termine berücksichtigen, spontane Anforderungen nicht erfinden |
| absenken | REGULAER | gespeichertes abgesenktes Soll; niemals automatisch 21 °C einsetzen |
| boost, taste, hand | SONSTIGE | Ist-Energie buchen, nicht im Normalmodell trainieren |
| baseline | BASELINE | nur bestätigter Lauf, separat auswerten |
| frost | FROST | tatsächlicher Frostbetrieb; nicht alleinige Definition der Frostbereitschaft |
| bereit, frei, ausserhalb | FROST | Hintergrundperiode; Bereitschaft kann aktiv oder deaktiviert sein |
| heizgrenze | REGULAER | durch Heizgrenze unterdrückter Normalbetrieb; reguläre Freigabe = false |
| aus, automatik_aus | SONSTIGE | Normalbetrieb deaktiviert; Frost-immer bleibt gesonderte Hintergrundpolitik |
| tuer_offen | SONSTIGE | Türpause; kein normales Trainingsintervall |
| unbekannter Wert oder fehlende Zeile | SONSTIGE | ungültig, ausdrücklich fehlend |

**Priorität der Qualitätsprüfung:** fehlende Zeile → ungültig; unbekannter Grund → ungültig; `quelle=notprogramm` → SONSTIGE/ungültig; `zustand=offline` → SONSTIGE/ungültig. Bei `ha` und `import_verlauf` nur dann gültig, wenn Grund und Konfigurationskontext tatsächlich rekonstruiert wurden. Andere/unbekannte Quellen sind für das Betriebstraining ungültig.

`zustand=aus`, `bereit` oder `heizt` überschreibt einen gültigen Grund **nicht**. Beispiel: arbeitszeit/aus ist ein normaler Regelungszustand. `pause` mit einem anderen Grund als tuer_offen ist inkonsistent: SONSTIGE/ungültig. Baseline wird zusätzlich mit Lauf-ID und tatsächlichem Zeitintervall bestätigt; ein einzelner Textwert genügt nicht.

Der Rückgabewert enthält noch keine GDH. Dafür braucht P2 zusätzlich:

- `regelungsart`: thermo / plan / aus, einschließlich wirksamen Fühlerausfalls;
- `regulaer_freigegeben`: Sollregelung darf in dieser Minute heizen, **unabhängig von TPI und Plugzustand**;
- `frost_bereit`: Frostschutz darf außerhalb regulärer Freigabe eingreifen;
- `frost_grenze`, `frost_aus`, `frost_aussen`;
- gespeichertes Soll und historische Gerätezuordnung/Leistung;
- Quelle und Alter der Temperaturwerte sowie Staffelungs-/Leistungsbegrenzung.

**Die vier Klassen sind keine vier Einschaltzustände.** FROST/ausserhalb kann 60 Minuten ohne Strom umfassen und trotzdem eine Stunde Frostbereitschaft sein. Bei frei_modus=aus ist dieselbe Bereitschaft null. Aus/automatik_aus kann bei frost_immer ebenfalls Frostbereitschaft haben. Die Klassifikation allein darf diese Konfiguration nicht erraten.

Fehlenden historischen Kontext nicht mit heutigen Einstellungen auffüllen. Solche Minuten erhalten `kontext_unbekannt`; Ist-Verbrauch bleibt erhalten, Training ist gesperrt. Damit bleibt P1 ohne Änderung der Steuerung einspielbar.

## 2. P2: Tagesmerkmale

### 2.1 Zeit, Verbrauch und Temperaturen

Je lokaler Kalendertag in Europe/Vienna ein UTC-Intervall [Beginn, nächster Beginn). Es umfasst 23, 24 oder 25 Stunden. Die wiederholte Herbststunde bleibt zweimal enthalten.

Für Minute/Teilintervall m:

- dt_m = tatsächliche Dauer in Stunden;
- E_m = Summe gültiger `energie_wh` aller zur Minute zugeordneten Heizkörper / 1000;
- P_m = Summe ihrer validierten Nenn-/Betriebsleistungen in kW;
- E_d = Summe gemessener Energie, einschließlich BASELINE und SONSTIGE, mit separaten Teilsummen.

Negative, nicht endliche oder doppelt überlappende Energiewerte sind ungültig. Null ist nur bei gültiger Energiemessung null. Fehlende Energie ist `None`, niemals null. Bautrockner gehören nicht in diese Heizungssumme, auch wenn der Grund trocknen heißt.

T_soll,m ist **der gespeicherte Sollwert dieser Minute**. Nicht die gemessene Raumtemperatur und nicht nachträglich das heutige Soll. Raumtemperatur wird für H und Startdefizit verwendet.

### 2.2 Exposition: Sollstunden, nicht Stromstunden

Definiere zwei disjunkte Masken:

- R_m = 1 bei gültiger regulärer Freigabe. TPI aus/Soll erreicht bleibt R=1. Türpause, Heizgrenzensperre, Baseline, Sonderbetrieb und effektiv reiner Planmodus gehören nicht ins thermo-Training.
- F_m = 1 bei gültiger Frostbereitschaft **außerhalb R**, ohne Baseline/Sonderbetrieb/Türpause. Dazu zählen alle Standby-Minuten, nicht nur Grund frost. Eine Frostübersteuerung zählt zur Frostexposition, nicht doppelt zur regulären.

Für thermo-Betrieb:

GDH_aktiv = Σ R_m · max(0, T_soll,m − T_aussen,m) · dt_m

GDH_frost = Σ F_m · max(0, T_frost,m − T_aussen,m) · dt_m

D_aktiv = Σ R_m · dt_m; D_frost = Σ F_m · dt_m.

T_frost = (frost_grenze + frost_aus)/2. Vorgabe 5/7 °C ergibt **6 °C**. Unteres/oberes Szenario verwendet 5 bzw. 7 °C. Die Mitte ist eine Näherung für die Hysterese, kein gemessener Raum-Sollwert.

**Kein 5-%-Aufschlag.** Bei außen ≥ 7 °C kann die thermische Frosthaltung null sein. Bei einem kalten Start kann sie trotzdem kurz Energie brauchen; das ist eine Dynamikunsicherheit, keine Grundlast.

Je Tag zusätzlich speichern: E_regulaer, E_frost, E_baseline, E_sonstige; D_plan; reale Sekunden_ein und Sekunden_strom als Diagnostik; GDH_innen = Σ max(0,T_innen−T_aussen)dt über gültige Messintervalle; Startdefizite; Quoten; Ausschlussgründe; Konfigurationsversion.

Die vorhandenen `tag_bereich.heizzeit_min` und `gradh` werden **nicht** als diese neuen Merkmale umgedeutet. Sie haben bereits andere Bedeutungen.

### 2.3 Abdeckung

Für jede Datenart die **Vereinigung gültiger Intervalle** verwenden, keine Summe überlappender Zeilen:

q_E,g = gültige Energiedauer des Heizkörpers g / seine erwartete Messdauer.

q_betrieb, q_aussen, q_innen = gültige jeweilige Dauer / D_tag.

Zusätzlich q_joint,R/F: Anteil der jeweiligen Exposition, für den Betrieb, Soll, Außen und Energie **jedes** Heizkörpers gemeinsam gültig sind; für thermo zusätzlich Innen.

Für vollständiges Tagestraining gelten alle folgenden Bedingungen:

| Prüfung | Schwelle |
|---|---|
| abgeschlossener Tag | Datum < heute |
| Betrieb und Außen | jeweils ≥ 95 % des ganzen Tages |
| Energie | jeder Heizkörper ≥ 95 %, nicht gemittelt |
| Innen bei thermo | ≥ 95 % |
| gemeinsame Abdeckung | ≥ 95 % der relevanten R-/F-Exposition |
| längste gemeinsame Messlücke | ≤ 5 Minuten |
| Notprogramm/offline/unbekannter Betrieb | keine solche Minute |
| Baseline oder Sondereingriff | kein solcher Abschnitt |
| Leistungsbegrenzung, Geräte-/Regelungswechsel | kein solcher Abschnitt |
| ungewöhnliche Türöffnung | keine Türpause; zusätzlich kein offener Türkontakt > 60 s während R |

Ohne Türkontakt ist Türstatus „nicht beobachtet“, nicht „geschlossen“. Das sperrt nicht alles, wird aber als Unsicherheit ausgegeben. Energie- und Temperaturwerte müssen frisch sein: zunächst höchstens 120 s Alter im Training. Ist dieses Alter historisch nicht nachweisbar, bleibt `frische_unbekannt`; keine stationären Fenster daraus.

**Fehlende 5 % nicht pauschal hochskalieren.** Tagesregression verwendet nur gemeinsame gültige Intervalle mit ihrem E und GDH. Gemessene Tagesenergie bleibt unverändert. Ein fehlender aktiver Abschnitt darf nicht durch viele vollständige Nachtstunden verdeckt werden.

Stationäre Fenster dürfen aus einem ansonsten ungeeigneten Tag stammen, sofern ihr eigenes Fenster samt Vorlauf alle strengeren Kriterien aus §3 erfüllt.

### 2.4 ΔT_start

Eine reguläre Episode beginnt beim Übergang R=0 → R=1 nach mindestens 30 Minuten ohne R oder bei einer Sollerhöhung > 1 K. Vorheizen/Arbeitszeit ohne Unterbrechung sind **ein** Start.

T_start = Median frischer Innenwerte der letzten 10 Minuten vor Beginn, mindestens 8 Minuten gültig.

ΔT_start = max(0, Soll am Beginn − T_start).

Je Tag Liste der Starts, Maximum und Summe speichern. Fehlende Starttemperatur ist unbekannt, nicht null.

Für den Rückfall Tagesregression: alle Starts bekannt und jeweils ΔT_start ≤ 2 K. Größere Defizite sperren diesen Tag für die Schätzung eines reinen H. Stationäre Fenster später am selben Tag sind nach ihrem Vorlauf weiterhin möglich.

## 3. P3: Stationäre Fenster und H

### 3.1 Fensterbildung

Zeitlich nicht überlappende Blöcke, je zusammenhängender regulärer thermo-Episode bzw. bestätigter Baseline-Episode:

- nur Konvektoren: 60 Minuten Einschwing-Vorlauf, danach Blöcke von **120 Minuten**;
- mindestens ein Ölradiator: 120 Minuten Vorlauf, danach Blöcke von **180 Minuten**;
- Anker ist der Episodenbeginn; angebrochene Restblöcke verwerfen;
- Baseline-Episode läuft über Mitternacht weiter; nicht künstlich täglich neu einschwingen;
- jeder Moduswechsel, Sollsprung > 1 K, Türpause, Sonderbetrieb oder Leistungsbegrenzung startet den Vorlauf neu.

Der Vorlauf muss ebenfalls durchgehend gültig sein. Innerhalb der Episode können verschiedene reguläre Grundwerte auftreten, sofern Soll/Regelungsart kontinuierlich bleiben.

Das längere Ölfenster reduziert Speicher- und Nachlaufeffekte; es beweist nicht, dass diese verschwunden sind.

### 3.2 Zulassung eines Fensters

Alle Bedingungen müssen erfüllt sein:

1. Energie, Innen, Außen und Betriebsdaten gemeinsam **100 %** gültig und frisch; keine Interpolation für H.
2. Keine Türöffnung > 60 s im Fenster/Vorlauf; kein Sonderbetrieb, Notprogramm, Offline, Staffelungsengpass.
3. Sollspanne ≤ 0,5 K bei thermo; Baseline benötigt keinen künstlichen Sollwert.
4. Raumtemperaturspanne max−min ≤ 0,6 K.
5. Lineare OLS-Steigung der Raumtemperatur betragsmäßig ≤ 0,1 K/h.
6. Differenz der Innenmittel erster/letzter 15 Minuten betragsmäßig ≤ 0,3 K.
7. Zeitgewichtete mittlere Differenz innen−außen ≥ 5 K.
8. Thermo: ≥ 90 % der Zeit liegt |innen−Soll| ≤ 0,7 K.
9. Baseline: Thermostatplateau erkennbar; kein fortgesetztes Aufheizen.
10. Unsättigung: elektrische Fensterleistung/P zwischen 0,05 und 0,90.

Zusätzlich für taktende Geräte: mindestens **drei vollständige Strom-ein/Strom-aus-Zyklen je Heizkörper**, mit gültigen Daten auf beiden Seiten der Übergänge. Ableitung aus Sekunden_strom und Messleistung; Schwelle „zieht Strom“ aus vorhandener Konfiguration verwenden. Bei zu wenigen Zyklen Fenster ablehnen, nicht nur Einschaltminuten auswerten.

Ein stabiler Dauerbetrieb nahe 100 % liefert allenfalls eine Diagnose/Untergrenze; **kein** freies H für Winterextrapolation. Ein Raum kann sonst durch eine Leistungsgrenze scheinbar stabil wirken.

### 3.3 Schätzung

Für jedes zugelassene Fenster w:

X_w = Σ max(0,T_innen,m−T_aussen,m) · dt_m [K·h]

H_w = E_w / X_w [kW/K].

E umfasst das **ganze Fenster**, einschließlich TPI-aus und Thermostatpausen. Nicht nur Minuten mit Strom > 50 W mitteln.

Pro Beobachtungstag: H_d = gewichteter Median(H_w, Gewicht X_w). Fenster über Mitternacht werden für die Tagesgewichtung dem Datum ihres Mittelpunkts zugeordnet, nicht dupliziert.

Container-Mitte: H = ungewichteter Median der H_d. Damit bekommt ein Tag mit vielen Fenstern nicht fünf Stimmen gegen einen anderen Tag.

s_H = 1,4826 · Median(|H_d−H|).

Ausreißerfilter einmalig, ab fünf Beobachtungstagen: entferne H_d mit |H_d−H| > max(3·s_H, 0,30·H). Danach Median/MAD neu rechnen; Zahl und Gründe der verworfenen Tage behalten. Bei weniger Tagen keinen MAD-Ausreißerfilter.

Gütezahl = s_H/H. Null/negatives H ist unbrauchbar. Startanforderung für stationär: ≥ 12 akzeptierte Fenster, ≥ 3 Tage, ≥ 24 Stunden und Gütezahl ≤ 0,30. Bei Öl müssen die 12 Fenster entsprechend mindestens 36 Stunden liefern.

Parameter-Szenarien:

- C: u = max(0,30·H, 2·s_H);
- D: u = max(0,15·H, 2·s_H);
- H_unten = max(0,H−u), H_mitte=H, H_oben=H+u.

**Dieses H heißt H_eff_stationaer.** Sonnen- und Personengewinne sind nicht gemessen; ein kleines MAD macht daraus keinen baulichen Wärmeverlustkoeffizienten. Regulär und Baseline liefern zunächst getrennte Schätzungen. Wenn beide ausreichend vorliegen und um > 25 % voneinander abweichen, nicht mitteln: `betriebsabhaengiges_H`, höchstens Stufe C und getrennte Werte für mit/ohne. Tag-/Nachtanteil als Diagnose ausgeben.

Die Trennung von Wärmeverlust, Speicherwirkung und solaren Gewinnen ist auch physikalisch erforderlich; siehe [NREL, STEM Test Results](https://www.nrel.gov/docs/fy01osti/29805.pdf). Unsere Fenster-/Güteschwellen sind eigene pragmatische Setzungen.

### 3.4 Rückfall Tagesregression

Nur thermo-Tage gemäß §2, D_aktiv ≥ 4 h und GDH_aktiv ≥ 20 K·h, alle Starts ≤ 2 K; Energie **regulärer gemeinsamer Intervalle**, nicht Gesamtenergie einschließlich Nachtfrost.

```text
H_tag = max(0, Σ(GDH_d · E_regulaer,d) / Σ(GDH_d²))
```

Regression durch den Ursprung, kein frei geschätzter Grundlastterm. Mindestens drei Tage. Die Spanne für B ist 0,5·H_tag bis 1,5·H_tag. Das ist ein Betriebskoeffizient mit möglicher Rest-Aufheizwirkung, kein stationäres H. Bei null Energie an allen Tagen kein H=0 als Lernbeweis: „Wärmebedarf noch nicht identifizierbar“.

Frost wird vorerst nicht mit einem eigenen Koeffizienten aus wenigen Nulltagen trainiert.

### 3.5 Ausgabe je Container

```text
HResult:
  modell_version, konfiguration_id, bereich_id, daten_bis
  methode: stationaer | tagesregression | keine
  h_mitte_kw_k, h_unten_kw_k, h_oben_kw_k
  n_fenster, n_tage, stationaere_stunden
  mad_kw_k, relative_streuung
  delta_t_mittel_min/max, aussen_mittel_min/max
  getrennte_baseline_schaetzung
  verworfene_anzahl, ausschlussgruende
  frische_belegt, tuer_beobachtet, extrapolation
```

Keine normativen CV(RMSE)-Etiketten auf MAD übertragen.

## 4. P4: Prognose mit Automatik

### 4.1 Planung und Wetter

Der Adapter liefert pro Container die zukünftigen Zeitintervalle aus **derselben reinen Plan-/Regelungslogik**, die den echten Betrieb bestimmt: Arbeitszeit, Urlaub/Feiertage, Absenkung, Vor-/Früh-/Nachheizen, Trocknen, feste Bedarfstermine, Heizgrenze und Modus. Überlappungen werden nach vorhandener Priorität aufgelöst. Keine zweite Kalenderregel in der Prognose.

P4 simuliert keine Schaltbefehle. Variable Frühstartdauer: vorhandene Lernregel verwenden; falls künftiger Innenzustand fehlt, konfiguriertes Nominalfenster plus Unsicherheitsflag, keine erfundene sichere Dauer. Spontaner Boost/Tastendruck/Handbedarf: Ist berücksichtigen, zukünftig nicht voraussetzen.

Das künftige Soll kommt aus `logik/soll.py`: `aussen_mittel()` und `gleitend()`, mit bestehenden Regeln und Rückmeldungen. Im geprüften Code sind die drei Vortage mit **1, 0,8, 0,64** gewichtet. Für weitere Tage rekursiv Vorhersage/Klimatagesmittel verwenden. Nicht eine neue ungewichtete 3-Tage-Formel bauen.

Außen stündlich:

1. stündliche Vorhersage am richtigen Zeitstempel;
2. Tagesvorhersage plus typischer Tagesgang;
3. `klima_tag()` plus typischer Tagesgang.

Für synthetischen Tagesgang: roh T_h = Tagesmittel − 3·cos(2π·(lokale Stunde−5)/24). Danach über die **realen Intervalldauern** auf das Tagesmittel zentrieren, damit auch 23-/25-Stunden-Tage stimmen. Tagesgang als Näherung kennzeichnen. Fehlende Vorhersagestunden einzeln ergänzen; nicht den ganzen Tag zur Vorhersage erklären.

Auf Minutenraster planen; Außen stündlich konstant einsetzen oder eindeutig zeitlich interpolieren. Für Solländerungen und Schaltplan ist die minutengenaue Schnittmenge maßgeblich.

### 4.2 Thermo-Modell

Für jedes zukünftige Intervall:

p_m = min(P_m, H · max(0,T_ziel,m−T_aussen,m))

E_m = p_m · dt_m.

T_ziel ist reguläres gleitendes/abgesenktes Soll oder Frostziel 6 °C. Bei deaktivierter Freigabe ohne Frostbereitschaft p=0. Summiere Intervalle erst zu Stunden, Tagen und Heizperiode.

Die Obergrenze lautet **Σ P_m·dt_m über erlaubte Heizintervalle**, nicht automatisch P·24. Bei konstanter Leistung und 10 Stunden regulär ohne Frost: P·10. Bei 24 Stunden Frostbereitschaft kann der physikalische Deckel P·24 sein.

Ausgeben: ungedeckelte Halteenergie, gedeckelte elektrische Energie und `leistung_limitiert`. Deckelung bedeutet nicht „Soll erreichbar“.

**Frost am freien Tag:** dieses Haltemodell ist konservativ vereinfacht; gespeicherte Wärme nach dem Arbeitstag kann den tatsächlichen Frostbedarf senken. Deshalb fehlende Dynamik kennzeichnen und bei nicht validiertem Frost im Gesamtband den Frostanteil unten auf 0 setzen. Oben gilt höchstens der physikalische Bereitschaftsdeckel. Die 5/6/7-°C-Szenarien allein wären keine ausreichende Unsicherheit dafür.

### 4.3 Wiederaufheizen bleibt eine ausdrückliche Modellgrenze

H·GDH beschreibt Halten. Vorheizstunden darin **ersetzen keinen Speicherterm**. Ohne identifizierte Wärmekapazität C bzw. validierte Startkorrektur kann P4 keinen vollständigen Startbedarf bestimmen.

P4 liefert darum:

- `haltebedarf_mitte_kwh` als Modellmitte;
- `aufheizen_unmodelliert` bei bekanntem ΔT_start > 2 K oder unbekanntem künftigen Startzustand nach mindestens 30 Minuten Absenkung/Aus;
- im betroffenen regulären Block obere Energiegrenze = volle verfügbare elektrische Blockkapazität;
- bei solchen Tagen keine Anzeige „belastbare Tagesprognose“, selbst wenn H gut ist.

Bei kleinen, bekannten Starts darf die Mitte als vorläufige Tagesprognose verwendet werden. Bei unbekannten Winterstarts ist ein breites Band bis zur Blockkapazität fachlich ehrlicher als ein unbegründeter +20-%-Aufschlag. Diese Grenze gilt auch für Frost nach langem Aus.

### 4.4 Container ohne Fühler / effektiver Planmodus

**Auch ein Container mit Fühler, aber modus=plan, gehört hierher.** Entscheidend ist, wer tatsächlich regelt.

Bei Plug-Freigabe und Thermostat auf Max.:

p_m = min(P_m, H · max(0,T_max−T_aussen,m)).

Ohne belastbares T_max ist dieses Modell **nicht kalibriert**. Kein 21-°C-Soll einsetzen; auch 30 °C nicht als Messwert behaupten.

P4-Rückfall für Planmodus:

- ≥ 3 saubere reguläre Tage: d = Σ E_regulaer / Σ(P_m·dt_m); d auf [0,1] begrenzen, Mitte = d·zukünftige Freigabekapazität;
- dazu zwingend `witterung_unmodelliert`, Stufe höchstens B;
- Band vor Kalibrierung: 0 bis volle Freigabekapazität; d nicht als gültige Winterkonstante verkaufen;
- weniger Daten: Mitte null/`None`, nur Kapazitätsgrenze.

Frost ohne Innenfühler ist **außengesteuerte Plugfreigabe**, kein 6-°C-Raumthermostat. Vorhandene `frost_aussen`-Hysterese rein simulieren; bei unbekanntem Anfangszustand beide Zustände für das Band betrachten. Innerhalb der Freigabe regelt wieder der Gerätethermostat. Ohne T_max daher ebenfalls nur Duty-Schätzung/volle Kapazität.

Ein später gemessener Baseline-Duty-Verlauf oder ein identifiziertes T_max/H kann dieses Provisorium ersetzen. Ein ohne Innenfühler durchgeführter Baseline-Lauf identifiziert T_max und H nicht automatisch getrennt.

### 4.5 Neun Szenarien und Aggregate

Drei Wetterverläufe: −1,5 K / 0 / +1,5 K für klimatologisch ergänzte Intervalle. −1,5 K = kälter. Vorhersageintervalle unverändert; ihre Fehler sind damit **nicht** erfasst.

Drei Parametersätze: H unten/Mitte/oben; Frostziel entsprechend 5/6/7 °C. Je Kombination denselben Wetterverlauf für mit und ohne benutzen. Mit und ohne können bei nachgewiesener Betriebsabhängigkeit unterschiedliche H-Werte im gleichen Parametersatz haben.

Band aus den neun ganzen Läufen, anschließend um die beschriebenen Start-/Frostgrenzen erweitern. Kein „90-%-Konfidenzintervall“: **Szenarioband, keine statistische Abdeckungswahrscheinlichkeit**.

Einsparung je Lauf = E_ohne,s−E_mit,s. Bei zusätzlicher Strukturunsicherheit mit L/U je Lauf:

S_unten = min_s(L_ohne,s−U_mit,s), S_oben = max_s(U_ohne,s−L_mit,s).

Negative Einsparung bleibt sichtbar. Kein pauschaler Prozentdeckel. Fehlt das Gegenmodell, Einsparungsmitte `None`, keine automatische Ersatzrechnung aus dem alten Ohne-Zähler.

Stündliche Summe = Tageswert = Periodensumme, **vor Rundung**. Heute: Ist bis zum echten Zeitstempel plus Modell nur für kommende Intervalle. Keine Tagesenergie nochmals nachträglich verteilen; keine Restquote „verbleibende Stunden/24“.

### 4.6 Ablösung im Schattenbetrieb

P4 liefert separat `prognose_v2` mit Modellversion, Methode, Stufe, Grenzen und Gründen. Alte Werte bleiben während des Schattenbetriebs ausdrücklich `legacy`. Keine Mischung eines V2-Rests mit einem alten Ohne-Tagesschnitt zu einer gemeinsamen Einsparungszahl.

Nach Umschaltung benutzt die neue Anzeige ausschließlich den gewählten Modellvertrag. „Nicht schätzbar“ darf nicht unbemerkt wieder zu einem Tagesschnitt werden. Historischer Sonder-/Baseline-Verbrauch bleibt als gemessen sichtbar; ein Vergleich „Normalbetrieb mit Automatik“ muss diese Eingriffe gesondert ausweisen und darf sie nicht als normalen Automatikverbrauch trainieren.

## 5. Stufen A–D

```python
bestimme_stufe(h_result, saubere_tage, validierung, prognosekontext)
# -> StufenResult(stufe, methode, gruende, anzeige, prognose_stufe)
```

Hier A→D = zunehmende Evidenz. **H-Stufe und prognosebezogene Stufe getrennt ausgeben.**

| Stufe | Eintritt | Rechenweg / Anzeige |
|---|---|---|
| A | keine brauchbare Tagesregression und kein ausreichendes stationäres H | „Noch nicht schätzbar“; Ist + physikalische Kapazitätsgrenze, Mitte None |
| B | ≥ 3 geeignete thermo-Tage für Tagesregression; alternativ ≥ 3 saubere Planmodus-Tage | „Vorläufige Schätzung“; Methode nennen, breites Band; Planmodus: Witterung unmodelliert |
| C | stationäre Mindestdaten aus §3, relative Streuung ≤ 0,30 | „Messgestütztes Haltemodell“; H und Szenarioband, Start-/Frostgrenzen separat |
| D | ≥ 30 stationäre Fenster, ≥ 7 Beobachtungstage, relative Streuung ≤ 0,15; zusätzlich ≥ 7 unabhängige zeitlich spätere Validierungstage, Außenmittelspanne ≥ 6 K, WAPE ≤ 20 %, absoluter Energie-Bias ≤ 10 % | „Validiert im beobachteten Bereich“; keine generelle Wintergarantie |

Validierung: Modell auf Trainingszeitraum einfrieren; die nachfolgenden Tage nicht in dieses H nachtrainieren. WAPE = Σ|E−E_hat|/ΣE; Bias = Σ(E_hat−E)/ΣE. Bei ΣE=0 keine Güte berechnen. Nur saubere, kleine/bekannte Starts; für Frost zusätzlich echte Frosttage, bevor dessen Band verengt wird.

D muss die gesamte betrachtete Modellkomponente abdecken. Bei unbekanntem Wiederaufheizen, unvalidiertem relevantem Frost oder Planmodus ohne Kalibrierung sinkt **prognose_stufe** auf höchstens C bzw. B. H kann trotzdem D bleiben.

Extrapolation: künftige Differenz Ziel−Außen außerhalb [0,75·ΔT_min_train, 1,25·ΔT_max_train] oder künftiges Soll > 1 K außerhalb beobachteter Sollwerte → Flag, prognose_stufe höchstens C; obere Strukturgrenzen beibehalten. Temperaturspanne allein ist kein Freibrief.

Neubewertung nach jeder Datenaktualisierung, ohne Hysterese in der Klassifikation. Fenster/Tage nur innerhalb derselben Geräte-/Regelungskonfiguration verwenden. Nach wesentlicher Änderung neues Modell; alte Evidenz bleibt archiviert.

**Live-Pilot:** acht „Heiztage“ sind nicht acht geeignete Tage. Ohne P2-Startdefizite, gemeinsame Abdeckung und P3-Fenster kann ich C nicht behaupten. Heute A oder B je Container; C erst nach belegten Fenstern.

## 6. Synthetische Tests mit erwarteten Ergebnissen

Numerik vor Rundung mit pytest.approx prüfen. Klassifikation parametrisiert für **jeden** Tabellenwert testen.

| Test | Eingabe | Erwartung |
|---|---|---|
| TPI-aus bleibt regulär | 60 min arbeitszeit/aus; Soll 22, außen 12; alle Daten gültig, 0 kWh | R-Dauer 1 h, GDH_aktiv 10 K·h; Energie 0, nicht fehlend |
| Absenken | 2 h absenken, gespeichertes Soll 10, außen 0 | GDH_aktiv 20; kein 21-°C-Ersatz |
| Frostbereitschaft | 24 h ausserhalb, Frost 5/7, außen −2, kein R | GDH_frost 192 K·h; Grund frost ist dafür nicht erforderlich |
| Frost deaktiviert | derselbe Tag, frei_modus=aus | GDH_frost 0, E_hat 0 |
| Modus und Qualität | arbeitszeit + offline oder notprogramm | SONSTIGE, ungültig; Energie separat erhalten |
| Sonderbetrieb | boost/taste/hand je 60 min, je 2 kWh | E_sonstige insgesamt 6 kWh; Tagestraining ausgeschlossen |
| Fehlende Zeile | 10 min keine Betriebszeile | SONSTIGE/fehlend; keine impliziten Null-GDH als vollständiger Tag |
| Geräteabdeckung | zwei Heizkörper: q_E=1,00 und 0,94 | Tagestraining false, obwohl Mittel 0,97 |
| Expositionsabdeckung | 24-h-Tag, 30 min Energie fehlen vollständig innerhalb 4-h-Heizzeit | q_E=0,97917, q_joint,R=0,875; Training false |
| Lange Lücke | 24 h, einzige gemeinsame Lücke 6 min | q=0,99583, trotzdem Tagestraining false |
| Startdefizit | Soll 22; 10 frische vorherige Innenwerte alle 18,5 | ΔT_start=3,5; Tagesregression ausgeschlossen |
| Ein Start | vorheizen 05–06, arbeitszeit 06–17 durchgehend | ein Start, nicht zwei |
| Stationäres H | Konvektor, 2-h-Fenster, innen 22 konstant, außen 12, E=2 kWh, P=2 kW, genügend Zyklen | X=20 K·h; H_w=0,10 kW/K; Duty=0,50; Fenster akzeptiert |
| Öl-Vorlauf | Öl-Episode 5 h, erste 2 h Vorlauf, danach 3 h konstant 22/12, E=3 kWh | genau ein Fenster; H_w=0,10 |
| Instationär | Innen steigt im Fenster mit 0,3 K/h | Fenster abgelehnt, auch bei gutem Energie/GDH-Verhältnis |
| Zu wenige Zyklen | sonst gültiges Fenster, nur ein vollständiger Zyklus | abgelehnt, keine verlängerte überlappende Doppelzählung |
| Sättigung | P=2, Fensterleistung 1,95 kW | Duty 0,975; kein H-Fenster |
| Gewichtung/MAD | Tages-H: 0,08; 0,10; 0,12; jeder ausreichend Fenster | H=0,10; MAD=0,02; s_H=0,029652; relativ=0,29652; u_C=0,059304; Band [0,040696;0,159304] |
| Tagesregression | GDH=[80,100,120], E=[8,10,12], sonst sauber | H_tag=0,10; B-Band [0,05;0,15] |
| Thermo-Arbeitstag | H=0,10, P=2, 10 h Soll 22/außen 12, restlicher Frost außen 12, bekannte kleine Starts | Mitte 10 kWh, Nachtfrost 0 |
| Thermo-kälter | wie zuvor, außen 0, Soll für diesen Test fest 22 | Rohwert 22 kWh, elektrisch 20 kWh, leistung_limitiert=true |
| Freier Frosttag | H=0,10, P=2, 24 h Ziel 6/außen −2 | Haltemitte 19,2 kWh; ohne validierte Frost-Dynamik untere Gesamtgrenze 0 |
| Kalter Start | erster Arbeitstag-Test, Startdefizit 3,5 K | Haltemitte 10; obere reguläre Blockgrenze 20 kWh; aufheizen_unmodelliert=true |
| Kein Raumfühler | P=2, 3 saubere Plan-Tage, insgesamt 30 h Freigabe und 30 kWh | d=0,50; künftige 10 h: Mitte 10, Band [0;20], Stufe B, Witterung unmodelliert |
| Gleitendes Soll | Vortage 0/10/20 °C, neuester zuerst; Defaultregeln, keine Rückmeldung | Mittel=(0+8+12,8)/2,44=8,524590; Soll=21,35 °C |
| Neun Szenarien | H=[0,08;0,10;0,12], außen=[10,5;12;13,5], Soll fest22, 10 h, P=2, keine Strukturunsicherheit | Mitte10; min6,8; max13,8 kWh |
| Gepaarte Einsparung | Szenarien (mit,ohne)=(8,10),(12,13),(15,15) | Einsparungen=[2,1,0]; Band[0;2], nicht −5 bis7 |
| Teilstunde heute | jetzt12:30; Ist bis jetzt0,8 kWh in Stunde12; künftig p=1 kW | Prognose Stunde12=0,5; kombinierter Wert1,3; nicht zusätzlich1 kWh |
| Sommerzeit | 25.10.2026 Europe/Vienna; durchgehend p=1 kW | Tag25 kWh; zwei verschiedene UTC-Intervalle für lokale Stunde02 |
| Sommerzeit kurz | 28.03.2027; durchgehend p=1 kW | Tag23 kWh |
| Planbruch | 10 h erlaubt, P=2, Rohmodell30 kWh | Tag20 kWh; keine Umverteilung der übrigen10 in gesperrte Nachtstunden |
| Kein Gegenmodell | mit10 kWh, ohne nicht identifiziert | Einsparungsmitte None |
| Stufen | stationär12 Fenster/3 Tage/24 h, relativ0,20 | H-Stufe C; unbekannter Start begrenzt Prognose, kein D |
| D und Rückstufung | 30 Fenster/7 Tage, relativ0,10, 7 echte Holdout-Tage, Span6 K, WAPE0,15, Bias0,05 | H-Stufe D; extrapolierter Wintertag → prognose_stufe C |
| Identisches Gerät, anderer Modus | Innenfühler vorhanden, modus=plan, T_max unbekannt | Planmodus-Rückfall; niemals thermo-Soll22 verwenden |

Ergänze Eigenschaftstests: Energie nie negativ, alle Inputs endlich; pro Container und Intervall E≤P·dt; additive Stunden-/Tages-/Monatssummen; kein Intervall doppelt gezählt; Verhältnisse/Güte bei Nenner null undefiniert; Quellenherkunft pro ergänztem Wetterintervall erhalten.

## 7. Liefergrenzen P1–P4

**P1:** Klassifikation, Zeitnormalisierung, Qualitäts-/Konfigurationsvertrag, parametrisierte Tests. Keine Änderung an Schaltlogik oder produktiven Prognosen.

**P2:** neue Tagesmerkmale und Startdefizite aus Minutenwerten. Historische Lücken/fehlende Konfiguration offen kennzeichnen. Alte Tagessummen nicht umdeuten. Diagnose zeigt geeignete Tage und Ausschlussgründe.

**P3:** Fenster, H, Rückfall und Evidenzstufen. Ausgabe je Container, getrennte Baseline-/Normaldiagnose. Noch keine automatische Gerätesteuerung oder Baseline-Aktivierung.

**P4:** minutenbasierte Planung/Wetter/Soll → additive Energie, neun Szenarien und Strukturgrenzen; ausschließlich Schattenbetrieb. Vergleich gegen Ist auf nachfolgenden Tagen, ohne Trainingsleck. Die Ablösung der produktiven Prognose erfolgt erst in der späteren rücknehmbaren Umschaltung.

**Regeln der Integration:** Fachlogik ausschließlich in `custom_components/baustelle/logik/`, jede Regel einmal und mit Tests in `tests/logik/`. Adapter lesen HA/DB und liefern Kontext; die Seite zeigt Ergebnisse. Auslieferung weiterhin gebaute `frontend/baustelle-panel.js`; `mockups/glas.html` bleibt echte Seite mit Beispieldaten. Pilotbetrieb bleibt geschützt, Lieferungen einzeln einspielbar, Automatik startet aus, Geräte werden nur auf Auftrag gesteuert.

Quellanker, sämtlich Branch main: [Bauplan](https://github.com/herbertschrotter-blip/ha-baustelle/blob/main/docs/bauplan-hochrechnung.md), [Regelung](https://github.com/herbertschrotter-blip/ha-baustelle/blob/main/custom_components/baustelle/logik/regelung.py), [Soll](https://github.com/herbertschrotter-blip/ha-baustelle/blob/main/custom_components/baustelle/logik/soll.py), [Tagesdaten](https://github.com/herbertschrotter-blip/ha-baustelle/blob/main/custom_components/baustelle/db/tage.py), [Zähler](https://github.com/herbertschrotter-blip/ha-baustelle/blob/main/custom_components/baustelle/funktionen/heizung/zaehlen.py), [Prognoseadapter](https://github.com/herbertschrotter-blip/ha-baustelle/blob/main/custom_components/baustelle/funktionen/heizung/hochrechnung.py).

## ✅ Einigkeit | ⚠️ Widerspruch | ❓ Rückfragen

✅ **Einigkeit:** gemeinsames Expositionsmodell statt Arbeitstag-/Freitagssignaturen; robustes H aus ausreichend langen vollständigen Fenstern; getrennte Evidenz je Container; gepaarte Szenarien; P1–P4 ohne Eingriff in den Betrieb.

⚠️ **Widerspruch/Präzisierung:** Frost-Grundminuten sind keine Frostexposition; TPI-Ausschaltminuten dürfen nicht verschwinden. Stationäres H ist ein effektiver Haltekoeffizient, kein Beweis einer vollständigen Startprognose. Planmodus auf Thermostat-Max darf nicht mit dem Komfort-Soll gerechnet werden. Neun Szenarien sind kein 90-%-Konfidenzintervall.

❓ **Rückfragen für den Adapter, nicht als Sperre für die reine Logik:** Ist die historische Minutenkonfiguration einschließlich Gerätezuordnung, Regelungsmodus und Frostpolitik rekonstruierbar? Ist bei gespeicherten Innenwerten das Alter der ursprünglichen Messung nachweisbar? Ist die tatsächliche Staffelungsbegrenzung historisch verfügbar? Wenn nein, implementiere die beschriebenen Unknown-Flags und beginne geeignetes Training erst mit belegtem Kontext. Nach P3 brauche ich je Container die akzeptierten Fenster/Tage samt Verwerfungsgründen.

**P1–P4 sind damit spezifiziert. Eine belastbare vollständige Winterprognose ist erst nach Prüfung von Wiederaufheizen, Frost-Dynamik und dem Gegenmodell freigabefähig.**

