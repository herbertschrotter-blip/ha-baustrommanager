# Review Runde 4

**Ich übernehme den Ersatznachweis als bewusst schwächere Zulassung für Altdaten, höchstens Stufe C. Er beweist weder Frische noch freie Leistung. Wiederaufheizen und Frost bekommen denselben optionalen dynamischen Modellkern; ohne bestandene Identifikation bleibt das Kapazitätsband aus Runde 3. Ein einzelner Baseline-Lauf kann ein Gegenmodell vorbereiten, aber nicht automatisch validieren.**

Geprüft habe ich `db/schema.py` und `kern/staffelung.py` ausdrücklich auf Branch `main`; für den unveränderten übrigen Code gilt die Prüfung aus Runde 3, Stand `d 0209b 6` / 0.8.131. Alle neuen Schwellen unten sind Implementierungs-Startwerte, keine Normvorgaben.

## 1. Ersatznachweis für Altdaten

### 1.1 Stabilität ist nicht Frische

Bei 0,1-K-Auflösung kann ein funktionierender Fühler 45 Minuten unverändert 22,0 °C melden. Eine eingefrorene Datenquelle kann dieselben Werte liefern. Aus der Zahlenreihe allein ist das **nicht identifizierbar**.

Deshalb nenne den Zustand `konstant_zu_lang`, nicht „Sensor defekt“. Herberts konservative Regel darf solche Fenster verwerfen; die Integration darf daraus keinen Gerätefehler ableiten.

Präzisierung:

- Nur historische Zeilen mit unbekanntem Ursprungsalter dürfen den Ersatzweg benutzen. **Bekannt veraltete Neudaten dürfen nicht zum Ersatzweg zurückfallen.**
- Gesamter Prüfabschnitt = Fenster **plus vollständiger Vorlauf**.
- Werte auf ganzzahlige 0,1-K-Schritte quantisieren, z. B. Decimal-Rundung half-up. Binäre Float-Ungleichheit zählt nicht als Änderung.
- Längste zusammenhängende Folge desselben quantisierten Werts aus den realen Intervalllängen berechnen.
- Folge **> 1 800 s** → Ersatznachweis nicht erfüllt. Genau 1 800 s ist zulässig.
- Keine Lücken, NULL-Werte oder Interpolation; bei gemischten alten/neuen Daten bleibt der gesamte Prüfabschnitt Ersatzqualität.
- Die Stabilitätsgrenzen aus Runde 3 gelten trotzdem. 22,0/22,1 °C im Wechsel alle 20 Minuten ist stabil und passiert den Ersatzweg; 22,0 °C über 31 Minuten passiert ihn nicht.

Das ist eine Auswahlregel gegen offensichtliches Fortschreiben, **kein Nachweis einer echten Aktualisierung**. Sie kann gerade gute stabile Fenster verlieren und leicht schwankende bevorzugen. Diesen Selektionsfehler mit ausgeben.

Voraussetzungen bleiben: jeder Plug im gesamten Abschnitt `erreichbar=True`, Energie lückenlos und plausibel, Betrieb/Soll/Außen bekannt, sämtliche übrigen Fensterkriterien erfüllt. `erreichbar=NULL` genügt nicht.

**Parameterband bei Ersatzdaten:** gegenüber Runde 3 mindestens ±50 % um H, also u=max(0,50·H,2·s_H). Sobald ausreichend ausschließlich direkt belegte Fenster vorhanden sind, diesen eigenen Schätzer bevorzugen. Ersatzdaten nicht unmarkiert hineinmischen, um eine D-Stufe zu erreichen.

### 1.2 Ersatz für nicht gespeicherte Staffelung

**Σ leistung_w ≈ Σ Nennleistung über das ganze Fenster ist ungeeignet.** Ein korrekt auf Soll taktender Raum braucht gerade weniger als Volllast. Ein solches Kriterium widerspricht unserer Fenster-Duty-Grenze ≤ 90 %.

Für alte Fenster verwende stattdessen einen **Staffelungs-Plausibilitätscheck**, getrennt vom Frischeersatz:

1. Historische Staffelungseinstellungen, Anschlusskapazität, max_gleichzeitig und bekannte Schalt-/Warteereignisse rekonstruieren.
2. Bekannter Abwurf/Wartevorgang oder erkennbare Leistungsbeschränkung im Prüfabschnitt → Fenster verwerfen.
3. Soweit die gesamte Anschlussbelegung belegbar ist: keine nachgewiesene Überschreitung der zulässigen gleichzeitigen Last; andernfalls `anschlussbelegung_unbekannt`.
4. Je Heizkörper mindestens fünf volle Stromminuten im Prüfabschnitt (`sekunden_strom=60`, `sekunden_ein=60` bei 60-s-Zeilen). Dabei gemessene Energie auf Leistung umrechnen: p=energie_wh·3600/dauer_s/1000.
5. Median dieser Vollstromleistungen liegt innerhalb [0,8·P_ref;1,2·P_ref]. Außerhalb → Leistungsreferenz/Stufe prüfen, Fenster vorläufig verwerfen. P_ref ist bekannte Geräteleistung der gewählten Stufe, nicht beliebig das Typenschild.
6. Keine unerklärten Relay-aus-Phasen: soweit Soll-Anforderung tatsächlich belegbar ist, angefordert und nicht eingeschaltet → verwerfen. **TPI-aus ist keine solche Anforderung.**

`leistung_w_max` allein beweist keine volle Minutenleistung. Bei dokumentierter variabler Heizstufe passenden P_ref verwenden; ohne Stufenkontext keine künstliche Volllastprüfung.

Wichtig: Im geprüften Code heißt `nenn_kw()` zwar so, verwendet aber bevorzugt das **gemessene Mittel im Betrieb**. Dieses lernende Mittel ist kein unabhängiges P_ref. Nutze explizite Geräteleistung bzw. einen separat belegten Vollstrom-Pegel, mit Herkunft. Ein P_ref aus genau dem zu prüfenden Fenster ist kein unabhängiger Plausibilitätsbeweis.

Bleibt Staffelung historisch nicht rekonstruierbar, darf das Fenster nach Herberts Entscheidung bei erfüllten Checks als `staffel_ersatz` zählen. **Unbekannt wird damit nicht zu „keine Begrenzung“.** Eine zeitweise verweigerte Freigabe kann trotz plausibler Strompulse unentdeckt bleiben. Auch dieser Schätzer höchstens C und mindestens ±50 %.

Ausgabe: `frische_nachweis=direkt|ersatz|keiner`, `staffel_nachweis=direkt|rekonstruiert|ersatz|keiner`; zusätzlich konkrete Verwerfungsgründe und Anteil Ersatzfenster.

## 2. Neue Minutenfelder in P1

### 2.1 Schema

Additiv, nullable, **kein Default 0**, kein Nachfüllen historischer Zeilen mit erfundenen Werten:

| Tabelle / Spalte | Typ | Bedeutung |
|---|---|---|
| bereich_minute.temp_alter_s | Integer, nullable | maximales Alter des tatsächlich für die Regelung verwendeten Innenwerts innerhalb des Intervalls; Sekunden seit letzter belegter Beobachtung des Fühlers |
| geraet_minute.staffel_gesperrt_s | Integer, nullable | Sekunden des Intervalls, in denen das Gerät vor Staffelung eingeschaltet werden sollte, der Kern aber die Freigabe verweigerte |
| bereich_minute.staffel_begrenzt_s | Integer, nullable | Dauer der Vereinigung solcher Sperrintervalle aller Heizkörper des Containers |
| optional geraet_minute.heizanforderung_s | Integer, nullable | Einschaltanforderung **vor** Staffelung, unabhängig von gemessenem Strom/Relayzustand |

Die optionale Anforderungsspalte empfehle ich verbindlich mitzunehmen: Sie macht die Bedeutung der Sperrzeit prüfbar. Keine zweite Regelung darin berechnen; die bereits bestehende Anforderung am Kernübergang protokollieren.

Für vollständige Beobachtung: keine Sperrung → 0. Bei nur teilweise bekannter Beobachtung → NULL statt 0; gesperrte Teilsekunden optional diagnostisch getrennt halten. Werte zwischen 0 und dauer_s, bei Geräten zusätzlich gesperrt_s≤heizanforderung_s.

Container-Sperrzeit ist **Vereinigung**, nicht Summe: zwei Geräte gleichzeitig 20 s gesperrt ergeben 20 s, nicht 40. Nur Bereichssumme genügt für Ausschluss, Gerätedaten erklären die Ursache.

Eine TPI-Ausphase hat Anforderung 0/Sperrung 0. Ein auf Max. angeschlossener Radiator mit ausgeschaltetem Gerätethermostat hat Anforderung 60/Sperrung 0, auch bei Strom 0. Offline/Befehl nicht bestätigt ist ein anderer Fehler; nicht als Staffelungsverweigerung umetikettieren.

### 2.2 Welches Alter?

Das Alter bezieht sich auf eine **belegte Beobachtung**, nicht auf die letzte Änderung des Temperaturzahlenwerts. Ein erneut gemeldeter unveränderter Wert erneuert den Beobachtungszeitpunkt. Eine HA-Neuberechnung oder ein Neustart mit altem Cachewert ist kein neuer Fühlerbericht.

Der Adapter hält Beobachtungszeitstempel/Empfangszeit fest. Wenn die Sensorintegration gleiche Werte gar nicht erneut meldet, ist echte Frische über diesen Weg nicht beweisbar: Quelle/Heartbeat prüfen, Alter andernfalls als unbekannt bzw. zunehmend alt ausgeben. Nicht `last_changed` als Messzeit verwenden.

`temp_alter_s` ist das maximale Alter während tatsächlich verwendeter Werte im Intervall. Beispiel: zu Beginn 90 s alt, nach 30 s erneuter Bericht, danach bis Minutenende 30 s alt → Maximum 120 s. Damit gilt die bisherige Grenze **≤120 s** konservativ für die ganze Minute.

War die Temperatur während eines Teils unbekannt oder wurde nur ein alter Wert übernommen: Qualität entsprechend NULL/unbekannt oder bekannt alt. NULL bedeutet nicht Alter 0. Für feinere spätere Auswertung kann zusätzlich gültige Temperaturdauer gespeichert werden; für P1 reicht die konservative Verwerfung.

Außen- und Energiefrische sind damit noch nicht umfassend gelöst: lückenlose gespeicherte Energie muss reale Intervallenergie sein, kein wiederholter Cachewert. Der existierende sekundengenaue Leistungsstrom `messwert` kann bei HA-Daten die elektrische Rekonstruktion unterstützen; er enthält keine Innenfühler-Beobachtungszeit.

### 2.3 Notprogramm

Das Shelly-Notprogramm kennt kein HA-Ursprungsalter eines Raumwerts. Deshalb:

- `temp_alter_s=NULL`, sofern kein eigener belegter Raumtemperaturbericht mit Alter existiert;
- HA-Staffelung `staffel_gesperrt_s=NULL` / `staffel_begrenzt_s=NULL`;
- nicht null Sekunden setzen, nur weil das Notprogramm lokal nichts von einer Sperre weiß;
- eigene lokale Begrenzung gegebenenfalls als eigener Typ protokollieren, nicht als HA-Staffelungsbeobachtung;
- `quelle=notprogramm` bleibt vom normalen Training ausgeschlossen.

Für HA-Neudaten genau den vor/nach Staffelung bestehenden Entscheidungspfad instrumentieren; keine neue Steuerungsregel. P1-Migration muss alte Writer tolerieren und SQLite/PostgreSQL prüfen.

**Historischer Kontext:** versionierte Einstellungen sind vorhanden. `ausnahme` hat jedoch keinen Änderungsverlauf im Schema; nachträglich geänderte Ausnahmen lassen sich allein daraus nicht zum damaligen Kenntnisstand rekonstruieren. Historische Minuten-Gründe/Soll sind vorrangig. Ebenso beweist temperatur=NULL nicht allein den sofortigen effektiven Planmodus: die bestehende Regelung überbrückt Fühlerausfall zunächst bis 15 Minuten. Diese Übergangszeit berücksichtigen oder ausschließen.

## 3. Wiederaufheizen: zunächst Startkorrektur identifizieren, C nur als effektiven Parameter

### 3.1 Energiebilanz

Für einen vereinfachten Raum:

C·dT_innen/dt = p_el − H·(T_innen−T_aussen) + Q_gewinne.

C in kWh/K, H in kW/K, Zeit in Stunden. **Elektrische Leistung ist beim Ölradiator kurzfristig nicht die abgegebene Raumwärme.** Heizkörper- und Gebäudespeicherung, Sonnen-/Personengewinne begrenzen die Aussage einer Lufttemperaturkurve.

Die getrennte Identifikation von Wärmeverlust, wirksamer Masse und Gewinnen ist auch der Ansatz des [NREL-STEM-Verfahrens](https://docs.nrel.gov/docs/fy 01osti/29805.pdf). Unser vereinfachtes Verfahren ist keine Durchführung dieses Testprotokolls.

Ich würde deshalb nicht sofort behaupten „C des Containers gemessen“, sondern `C_eff_aufheizen` bzw. `startkorrektur_empirisch` ausgeben.

### 3.2 Konkreter Schätzer aus Starts

H aus P3 vor der Auswertung einfrieren. Keine gleichzeitige freie Schätzung von H, C und Grundlast aus zehn ähnlichen Oktobertagen.

Je Start k:

- saubere Daten wie für Fenster; keine Tür-/Hand-/Boost-/Baseline-/Staffelungseingriffe;
- Starttemperatur aus Runde 3; gemessener Anstieg mindestens 2 K;
- Episode enthält durchgehenden Vorheiz-/Arbeitszeitbetrieb;
- Ende: Soll erreicht und danach stabiler Zustand für mindestens 60 min bei Konvektoren, 120 min bei Öl; in dieser Nachphase die P3-Stabilitätskriterien erfüllen;
- Energiebilanz vom Start bis Ende dieser Nachphase. Innenendwert = Mittel der letzten 15 min; Innenstartwert = Median der vorangegangenen 10 min;
- Anstieg ΔT_k ist gemessene Endtemperatur minus Starttemperatur, **nicht** blind Soll−Start;
- X_k = Integral max(0,T_innen−T_aussen)dt über dasselbe vollständige Intervall;
- Z_k = E_k−H·X_k.

Dann:

C_eff = max(0, Σ ΔT_k·Z_k / Σ ΔT_k²).

Negative Einzel-Z_k nicht vor dem Fit auf null setzen. Sie sind Hinweise auf Gewinne, falsches H oder Speicher-Endpunkte. Bei mehr als 20 % negativen Z_k oder C_eff≤0: keine Identifikation.

Mindestdaten für einen Kandidaten:

- ≥8 geeignete Starts an ≥4 Tagen;
- Startdefizite/Anstiege über mindestens 3 K Spanne;
- keine dominierende Mischung unterschiedlicher Regelungs-/Gerätekonfigurationen;
- robuste Streuung der Einzelwerte Z_k/ΔT_k: 1,4826·MAD/Median ≤0,30;
- H-Untere/Mitte/Obere getrennt durchrechnen und zugehöriges C jeweils neu fitten; H/C-Paare erhalten, nicht unabhängige Rechtecke erzeugen.

Beobachtete Solar-/Personenlast nicht wegbehaupten. Für die erste Identifikation bevorzugt frühe unbelegte Vorheizphasen; unbekannte Belegung explizit ausgeben. Ölradiator-Speicherzustand am Start bleibt besonders problematisch. Nach ausreichender Ausschaltpause mindestens 120 min sinkt das Risiko, ist aber nicht sicher weg.

**Freigabe zur Verwendung:** zusätzlich ≥5 spätere, nicht zum Fit verwendete Starts; Startenergie-WAPE≤25 %, absoluter Bias≤15 %, Temperatur-RMSE≤0,5 K für einen dynamischen C-Kandidaten. Ein nur energetisch gültiger Startkorrektur-Kandidat darf keine Temperatur-/Frostsimulation freischalten.

Scheitert die Identifikation oder fehlen Daten: unverändert Haltemitte plus Band bis Blockkapazität aus Runde 3. Die ersten P3-Zahlen entscheiden, ob dieses Verfahren im Pilot überhaupt genügend Fälle bekommt.

### 3.3 E_start und keine Doppelzählung

Als Bilanz für eine tatsächlich beobachtete Aufheizphase:

E_start,gross ≈ C_eff·ΔT + H·Integral(T_innen−T_aussen)dt.

Das ist **gesamte Energie dieser Phase**, kein Betrag, den du zu einem schon für dieselbe Phase gerechneten H·GDH-Sollwert addierst.

Für eine dynamische Vorhersage bei konstantem Außenwert, konstantem P und Ziel:

T_eq = T_aussen + P/H; tau = C/H.

Wenn T_start<T_ziel<T_eq:

t_auf = tau·ln((T_eq−T_start)/(T_eq−T_ziel)).

p_halt = H·max(0,T_ziel−T_aussen).

Für reguläre Blockdauer D:

E_block = P·min(t_auf,D) + p_halt·max(0,D−t_auf).

E_start,zusatz = (P−p_halt)·min(t_auf,D).

Wenn das Ziel bei gegebenem P nicht erreichbar ist, elektrischer Verbrauch bis Blockende P·D und `soll_nicht_erreichbar`; keine logarithmische Rechnung mit negativem Argument. Bei bereits warmem Raum keinen künstlichen Startaufschlag.

Für reale veränderliche Temperaturen/Soll und TPI: Minutenmodell mit Zustandsfortschreibung statt dieser geschlossenen Spezialformel. Exakter Schritt bei konstantem p und Außenwert:

T_neu = T_aussen + p/H + (T_alt−T_aussen−p/H)·exp(−H·dt/C).

Energie p·dt. Vorhandene Soll-/Frost-Hysterese verwenden, Raumzustand auch in Ausphasen fortschreiben. Die Idealregelung ist zunächst eine Näherung; TPI-/Ölnachlauf wird durch Holdout-Prüfung beurteilt. Bei instabilem Modell keine produktive Startkorrektur.

## 4. Gegenmodell aus Baseline

### 4.1 Was ist T_max?

Gesucht ist **T_max_eff des Raumes unter den tatsächlich verwendeten Thermostaten**, keine universelle 30-°C-Geräteangabe. Bei mehreren Heizkörpern und verschiedenen Thermostaten kann es unterschiedliche Abschaltpunkte geben; dann ist ein einziger Raumwert nur ein Betriebsersatz.

Ein durch Volllast entstandenes Temperaturplateau kann ein Leistungs-Gleichgewicht sein, ohne dass irgendein Thermostat abschaltet. Deshalb braucht der Nachweis Raumplateau **und Thermostatzyklen bei durchgehend freigegebenem Plug**.

### 4.2 Lauf und Plateau

Baseline-Lauf bevorzugt **48 h**, also vorhandener Wochenendblock. Mindestdauer für einen vorläufigen Schätzversuch 24 h, aber nach Einschwingen müssen ausreichend Plateaublöcke übrig bleiben. 48 h garantiert das nicht.

Gültig nur: tatsächliche Plugfreigabe durchgehend, keine Staffelung, keine Fremdeingriffe/Türpause, Temperaturen/Energie frisch oder als Ersatz gekennzeichnet, gleiche Thermostatstellungen/Stufen. Thermostat-Stellungen als bestätigte Lauf-Metadaten dokumentieren; aus dem HA-Schema selbst sind sie nicht gemessen.

Warm-up der Baseline vollständig separat buchen. Erste mindestens 2 h nicht als Plateau verwenden; bei Öl mindestens 4 h. Danach **gemessene** Stabilität erforderlich, keine pauschale Annahme „ab Stunde 4 stationär“.

Plateau verwendet alle P3-Kriterien, insbesondere:

- innen-Spanne≤0,6 K, Trend≤0,1 K/h;
- ausreichend große Temperaturdifferenz innen−außen≥5 K;
- mindestens drei vollständige elektrische Thermostatzyklen **je Heater** im Auswerteblock bei Relay/Freigabe durchgehend an;
- Duty zwischen 0,05 und 0,90.

Das bestehende Plateaufenster darf bei langsamen Thermostaten zu kurz sein. Für das Gegenmodell deshalb zusätzlich **nicht überlappende längere Plateau-Blöcke bis 6 h** zulassen, bis drei Zyklen beobachtet sind, mit denselben Stabilitätsgrenzen. Diese Erweiterung gilt nur für den separat markierten Baseline-Schätzer, nicht unbemerkt für die reguläre P3-Fensterzahl.

Nacht-/unbelegte Blöcke bevorzugen; Sonnen- und Personenwärme sind sonst in H_ohne_eff eingerechnet und möglicherweise nicht auf reguläre Arbeitstage übertragbar.

T_max_eff = Median der zeitgewichteten Innenmittel gültiger Plateau-Blöcke, zuvor pro Nacht zusammenfassen.

H_ohne,w = E_w / Integral(T_innen−T_aussen)dt.

Robuste Zusammenfassung wie P3, **getrennt** von H_mit. Temperaturband zunächst mindestens ±1 K und zusätzlich beobachtete Plateau-Unterschiede; H-Band mindestens ±30 %, Ersatzdaten ±50 %. Kein Raum-Maximum aus dem höchsten Einzelmesswert.

Wenn die Nacht-Plateaus >2 K auseinanderliegen, Thermostat-/Aufstellungsbedingungen prüfen und kein universelles T_max übernehmen.

### 4.3 Erste Schätzung versus Stufe C

Ein Lauf mit ≥2 voneinander getrennten sauberen Nachtplateaus, je mindestens 3 h, insgesamt ≥6 h und vollständigen Zyklen kann einen **vorläufigen B-Schätzer** liefern. Ein 24-h-Lauf liefert häufig nur eine Nacht: dann nur diagnostischer Kandidat/A.

Für C: ≥3 Beobachtungstage aus **mindestens zwei Läufen**, insgesamt ≥12 Plateau-Stunden, relative H-Streuung≤0,30, konsistente Thermostatstellung. Verlängerte Baseline-Blöcke mit eigener Zählung ausgeben; nicht behaupten, zwölf reguläre P3-Fenster seien erfüllt.

Für D: spätere unabhängige Baseline-Validierung über mindestens 7 Tage und ≥6 K Außenmittelspanne, WAPE≤20 %, Bias≤10 %, direkte Qualitätsnachweise und gleiche Konfiguration. Ersatzdaten bleiben höchstens C.

H-Identifikation ohne sichtbares Thermostatschalten: **nicht möglich als T_max-Modell**. Bei Volllast + weiter steigender Temperatur fehlt das Plateau. Bei Volllast + stabilem Raum ist T_max nicht nachgewiesen; nur der gemessene Kapazitätsbetrieb unter diesen Bedingungen ist belegt.

### 4.4 Tagesformel

Stationäres Gegenmodell:

E_ohne,d = Σ min(P_m, H_ohne·max(0,T_max_eff−T_aussen,m))·dt_m.

Witterung und reale 23/24/25-h-Dauer berücksichtigen. Es braucht dieselben Geräte-/Betriebszeiten der Baustelle als Gegenfaktum, nicht zufällig einen anderen Zählbeginn.

Mit validiertem dynamischem Modell: dieselbe Raumzustandsrechnung, 24-h-Thermostatbetrieb um den beobachteten Max.-Bereich. Anfangszustand zu Heizperiodenbeginn dokumentieren; Gegenmodell über Tage fortschreiben, **nicht jeden Tag erneut den kalten realen Automatikzustand einsetzen**.

Bei noch nicht kalibrierter Dynamik separat Einschwingband für den Beginn des Gegenfaktums. Warm-up jeder beobachteten Baseline darf nicht als täglicher Ohne-Aufschlag in den Winter übertragen werden.

**Ein Beispiel zur alten hohen Ohne-Zahl:** P=2 kW, H_ohne=0,10 kW/K, T_max_eff=30 °C: bei außen 12 °C →43,2 kWh/Tag (90 % Duty), bei außen 0 °C →48 kWh/Tag (Deckel). Ein großer Verbrauch wäre bei solchen gemessenen Parametern plausibel. Ohne diese Messung bleiben 30 °C und 90 % Annahmen.

Keine Übertragung eines Ohne/Mit-Verhältnisses nur nach Heizkörpertyp auf andere Container. Gebäudezustand, Soll, Nutzungszeiten und Gewinne sind ebenso relevant.

### 4.5 Ohne Innenfühler

Mehr ist möglich als konstantes Duty, aber **nicht sofort**: ein empirisches wetterabhängiges Strommodell aus Baseline-Tagen.

Nach ≥10 vollständigen gültigen Baseline-Tagen an mindestens drei getrennten Läufen und ≥6 K Außenmittelspanne:

p_bar,d = E_d/D_d;
p_hat(T_aussen) = clip(a−b·T_aussen,0,P), mit b≥0.

Gedeckelte Least-Squares-Anpassung **einschließlich Deckel im Fit**; keine freie Gerade fitten und erst danach versteckt abschneiden. Bei fast nur gesättigten oder nur Nulltagen bleibt die Witterungssteigung unidentifizierbar. Mindestens fünf Tage mit Duty zwischen 0,10 und 0,90 und mindestens zwei deutlich verschiedene Außenbereiche verlangen.

Maximal C nach nachfolgenden unabhängigen Validierungstagen; außerhalb des gemessenen Außenbereichs um mehr als 2 K wieder breites Kapazitätsband. Keine getrennte Behauptung über bauliches H und reales Raum-T_max aus diesem rein elektrischen Fit. Auch E_hat=0 darf nicht als Frostsicherheit interpretiert werden.

Bis dahin bleibt Duty×Kapazität mit Band 0 bis Kapazität. Der reine elektrische Wetterfit ist eine spätere Lieferung nach P3, kein Teil der ersten P4-Freigabe.

## 5. Frost aus Abkühlnächten

Ja, Nächte nach Arbeit liefern frühere Eingrenzung, sofern tatsächlich nicht geheizt wird und die Heizkörperwärme abgeklungen ist.

### 5.1 Abkühlparameter

Nach Abschalten mindestens 60 min bei Konvektor,120 min bei Öl verwerfen. Dann saubere Nachtabschnitte von mindestens 2 h:

- keine Heizenergie über Messunsicherheit, insbesondere keine Frostzyklen;
- kein Türereignis, kein Sonderbetrieb, kein beobachteter Solar-/Personeneintrag;
- Innen−Außen zu Beginn mindestens 5 K;
- Innenabnahme mindestens 1 K;
- Energiedaten jedes Geräts und Innen/Außen vollständig;
- nur gleiche Konfiguration, belegte oder gekennzeichnete Ersatzqualität.

Mit konstantem Außenwert:

T(t)−T_aussen = (T_0−T_aussen)·exp(−t/tau).

tau aus nichtlinearer Anpassung der gesamten Temperaturfolge, **nicht aus lauten minutengenauen Ableitungen**. Bei variierendem Außenwert den exakten schrittweisen Nullleistungs-RC-Verlauf fitten. Ausgangs-T 0 aus gemessenem Anfangsmedian festlegen.

Mindestens 3 geeignete Nächte, zusammen≥6 h, Temperatur-RMSE≤0,3 K, relative robuste tau-Streuung≤0,30. Dann `tau_abkuehlen` als Kandidat. C_abkuehlen=H·tau nur mit geeignetem H aus vergleichbaren unbelegten Bedingungen; belegungsabhängiges H aus dem Tag kann hier irreführen.

Bei stark gekrümmtem Verlauf mit systematischem Fehler/wechselnder tau → Ein-Knoten-Modell nicht geeignet; kein stilles Mitteln.

**Gegenprüfung:** C_aufheizen und C_abkuehlen sollten nach Berücksichtigung ihrer Bänder kompatibel sein. Als Startalarm Verhältnis>2 oder nicht überlappende Bänder: keine gemeinsame RC-Freigabe. Raumluft, Wände und Ölradiator können unterschiedliche Zeitskalen besitzen.

### 5.2 Frost einsetzen

Bekannte Abendtemperatur über die Nacht fortschreiben, Frost ein unter 5 °C und aus bei 7 °C, gemäß tatsächlich konfigurierter Regel. Kein ständiges Halten auf 6 °C während der warmen ersten Nachtstunden.

Für konstantes Außen unter 5 °C:

t_bis_frost = tau·ln((T_start−T_aussen)/(5−T_aussen)).

Wenn T_start≤5: bereits Frostanforderung. Wenn Außen≥5 und Raum anfangs warm: in diesem verlustbasierten Modell kein späteres Unterschreiten von 5. Das ist eine Modellannahme ohne unbekannte Lüftung/Störungen.

Tau/Abendzustand können damit zeigen: „In den nächsten 8 h voraussichtlich noch kein Frost“. Sie bestimmen nicht automatisch eine ganze kalte Heizperiode. Für Folgetage muss der Zustand durchgehend aus demselben Szenariolauf kommen.

Zur **Verengung des Frostenergiebandes** zusätzlich mindestens 3 vollständig gemessene Frostepisoden an≥2 Nächten, jeweils≥3 vollständige 5/7-Zyklen, Energie-WAPE≤25 %, Temperatur-RMSE≤0,5 K. Bis dahin nur Timing-/Dynamikkandidat im Schattenbetrieb; Produktionsband aus Runde 3 bleibt.

Wenn nie tatsächlich 5 °C erreicht wird, ist tau teilweise messbar, das Verhalten der Frostregelung aber noch nicht validiert.

Ohne Raumfühler lässt sich aus Außentemperatur plus Strom keine reale Innen-Abkühlkurve identifizieren. Dort bleibt die bereits festgelegte Außentemperatur-Freigabe mit Thermostat-/Duty-Ungewissheit.

## 6. Numerische Testfälle

Alle Energien vor Rundung prüfen; zusätzliche Qualitätsbedingungen der jeweiligen Verfahren in den Fixtures erfüllen.

| Test | Eingabe | Erwartung |
|---|---|---|
| Quantisierung | 22,000000 und 22,000001 abwechselnd | identischer 0,1-K-Wert; keine Frischeänderung |
| Konstantfolge | längste quantisierte Folge 1800 s /1801 s | Ersatz zulässig / nicht zulässig |
| Stabil und variabel | 22,0/22,1 alle 20 min, Trend annähernd 0 | Stabilitäts- und Frischeersatz möglich |
| Echter stabiler Sensor alt | 22,0 über 45 min, kein Alter bekannt | Ersatz verworfen, kein Defekturteil |
| Echter stabiler Sensor neu | 22,0 über 45 min, jeder echte Bericht≤60 s alt | Frische direkt gültig; Konstanz sperrt direkte Daten nicht |
| Kein Frische-Downgrade | Neudaten bekanntes Alter 300 s, leichte Wertänderungen | ausgeschlossen; kein Ersatzweg |
| Ersatzband | H=0,10, MAD=0 | höchstensC, H-Band mindestens[0,05;0,15] |
| Korrekte TPI | P_ref=2, Vollstromminuten 2 kW, ganze Fensterleistung 1 kW | Pulscheck besteht; keine Forderung 2 kW im Fenstermittel |
| Unbekannte Staffelung | plausible Pulse, aber Sperrhistorie fehlt | staffel_ersatz, niemals direkt; höchstensC |
| Bekannte Sperre | ein Heizkörper 10 s angefordert und gesperrt | gesamtes Trainingsfenster ausgeschlossen |
| Vereinigungsdauer | GerätA gesperrt[0,20], B[10,30] s | Container 30 s; Gerätesumme 40 s ist nicht Containerdauer |
| TPI-aus |60 s, keine vorstaffelige Anforderung | heizanforderung_s=0, staffel_gesperrt_s=0 |
| Thermostat aus |60 s Freigabe, Relay an, Energie 0 | Anforderung 60, Staffelung 0; kein Leistungsengpass |
| Unbekannte Minutenteile |40 s Beobachtung,20 s unbekannt | StaffelungsspalteNULL, nicht 0 |
| Temperaturalter | Beginn 90 s alt, Bericht nach 30 s | temp_alter_s=120 |
| Notprogramm | kein eigener Raumbericht/HA-Staffelwissen | beide NachweisfelderNULL; Trainingsausschluss |
| C-Energiebilanz | H=0,10; ΔT=[2,4,6], X=[10,18,26], E=[2,0;3,8;5,6] | Z=[1,2,3]; C_eff=0,50 kWh/K; drei Starts allein noch keine Freigabe |
| Warm-up ohne Doppelzählung | H 0,10; C 0,50; P2; außen 12; Start 18; Ziel 22; D 10 h | tau 5 h; t_auf 1,682361 h; Brutto-Aufheizenergie 3,364722 kWh; Tagesenergie 11,682361, Zusatz 1,682361 |
| Ziel unerreichbar | H 0,10; P2; außen 0; Start 15; Ziel 22; D 10 h | T_eq 20; Energie 20 kWh; Soll unerreichbar, kein ungültigerLogarithmus |
| Baseline-Plateau | P2; Innen 30, außen 12; 3 h; Energie 5,4 kWh; genügend volle Thermostatzyklen | X 54; H_ohne 0,10; Duty 0,90; Plateau kann zählen |
| Baseline ohne Zyklen | gleicher Raumwert, durchgehend 2 kW | kein T_max-Nachweis trotz stabiler Temperatur |
| Erster Lauf | zwei gültige Nachtplateaus,≥6 h, noch nur ein Lauf | Gegenmodell höchstensB; keinC nur wegen 48 h Dauer |
| Wetterabhängiges Ohne | H 0,10; T_max 30; P2 | außen 12 →43,2 kWh/24 h; außen 0 →48 kWh/24 h |
| Langer Tag Ohne | vorheriger milderFall,25 h |45 kWh |
| Tau aus Nacht | H 0,10; C 0,50; außen 0; Anfang 22 | T nach 5 h=8,093348 °C; tau 5 h, C_abkuehlen 0,50 |
| Frostzeit | gleiche Nacht, Grenze 5 | erster Grenzübertritt nach 7,408023 h |
| Noch kein Frost | gleiche Nacht, Länge 6 h | prognostiziert 0 Frostenergie, T_end 6,626273 °C |
| Frostzyklus ideal | außen 0, H 0,10, C 0,50, P2, Beginn 5, Aus 7 | Heizdauer 0,715504 h; Energie 1,431008 kWh; danach Abkühlzeit 7→5:1,682361 h |
| Fehlende Frostvalidierung | tau gut, noch keine echten Frostzyklen | Dynamik nur Kandidat; bisheriges breites Frostband beibehalten |
| Elektrischer Wetterfit | P2; a 3 kW, b 0,10 kW/K | außen 15 →1,5 kW; außen 0 →2 kW gedeckelt; daraus kein Raum-T_max behaupten |

Für die numerische Verifikation der beiden RC-Beispiele habe ich die geschlossenen Formeln nachgerechnet. Identifikationstests zusätzlich mit synthetischen Zeitreihen, Quantisierung auf 0,1 K, Messlücken, Radiator-Nachlauf, unbekannten Gewinnen und bewusst zweiphasiger Abkühlung prüfen: ungeeignete Reihen müssen zur Modellverweigerung führen, nicht zu scheinbar präzisemC.

## 7. Liefergrenzen

| Lieferung | Verbindlicher Umfang | Grenze |
|---|---|---|
| P1 | additive Alters-/Anforderungs-/Sperrzeitfelder, Erfassung am bestehenden Kernpfad, Quellenvertrag, Ersatzqualitäten, Migrationstests | keine Gerätesteuerung ändern, Notprogramm nicht künstlich mit HA-Nachweisen füllen |
| P2 | historische Kontextrekonstruktion mit bekannten Lücken; Konstanz-/Pulschecks; Start- und Abkühl-Episodenmerkmale | keine Altdaten mit heutigen Einstellungen oder Alter 0 „reparieren“ |
| P3 | getrennte direkte/Ersatz-H-Schätzer; höchstensC für Ersatz; Baseline-Plateau-Kandidaten; Diagnostik der vorhandenen Starts/Nächte | zuerst tatsächliche Fenster-/Episodenzahlen liefern, danach Dynamik identifizieren |
| P4a | Modell aus Runde 3 im Schattenbetrieb; stationäres Gegenmodell mit eigener Evidenzstufe, sofern Plateau ausreichend | unbekanntes Wiederaufheizen/Frost weiter mit bisherigen Strukturgrenzen |
| nach P3: P4b, separat schaltbar | C-/tau-Kandidaten identifizieren, paarweise H/C-Szenarien, dynamische Start-/Frostsimulation und Holdout-Tests im Schattenbetrieb | keine Bandverengung allein durch guten Trainingsfit |
| spätere Lieferung | elektrischer Ohne-Wetterfit bei Containern ohne Fühler; unabhängige Baseline-/Dynamikvalidierung | erst mit ausreichenden tatsächlichen Baseline-Daten |
| P6 wie vereinbart | rücknehmbare Umschaltung auf geprüfte neue Ausgabe | noch unidentifizierte Komponenten bleiben sichtbar unsicher |

Bei neun Szenarien H/C nicht unabhängig variieren: für jeden H-Parametersatz das damit kompatibel identifizierteC bzw.tau einsetzen, untere/mittlere/obere **ganze physikalische Verläufe** bewahren. Gekoppelte Unsicherheit kann nicht pauschal als „H oben+C oben = höchste Energie“ geordnet werden; Extremwerte aus tatsächlich gerechneten Läufen bestimmen. Sind diese Verläufe noch nicht kalibriert, keine künstliche 9-Läufe-Präzision, sondern die bisherigen Strukturgrenzen.

**Regeln der Integration:** Fachlogik und alle fachlichen Schwellen ausschließlich in `custom_components/baustelle/logik/`, jede Regel einmal und mit Tests in `tests/logik/`. HA-/DB-Adapter protokollieren bestehende Beobachtungen/Entscheidungen. Die Seite rechnet nichts Fachliches. Gebaute `frontend/baustelle-panel.js`, echtes Master-Mockup `mockups/glas.html`; Pilot bleibt geschützt, Stufen einzeln einspielbar, Automatik startet aus und Geräte steuern nur auf Auftrag.

Quellanker: [Schema, main](https://github.com/herbertschrotter-blip/ha-baustelle/blob/main/custom_components/baustelle/db/schema.py), [Staffelung, main](https://github.com/herbertschrotter-blip/ha-baustelle/blob/main/custom_components/baustelle/kern/staffelung.py), [Regelung, main](https://github.com/herbertschrotter-blip/ha-baustelle/blob/main/custom_components/baustelle/logik/regelung.py).

## ✅ Einigkeit | ⚠️ Widerspruch | ❓ Rückfragen

✅ **Einigkeit:** Altdaten dürfen mit ausdrücklich schwächerem Ersatznachweis lernen, höchstensC. Neue Minuten erfassen echtes Beobachtungsalter und wirksame Staffelungsverweigerung. Baseline, Starts und Abkühlnächte liefern unterschiedliche, ergänzende Evidenz; Dynamik wird separat im Schattenbetrieb geprüft.

⚠️ **Widerspruch/Präzisierung:** unveränderte Temperatur ist kein Defektnachweis; variable Temperatur ist kein Frischebeweis. Fensterleistung nahe Nennleistung wäre bei TPI das falsche Staffelungskriterium. Ein Baseline-Wochenende identifiziert T_max nur mit sichtbaren Thermostatzyklen und reicht zunächst höchstens fürB. C·ΔT nicht zu einer bereits vollständig gerechneten Aufheizphase doppelt addieren. Abkühlnächte können Frostzeit eingrenzen, ersetzen jedoch keine Validierung echter Frostenergie.

❓ **Rückfragen nach P3:** Wie viele direkte/Ersatzfenster, saubere Starts und Abkühlnächte gibt es je Container? Erneuert die konkrete Innenfühlerintegration auch bei unverändertem Wert einen belegbaren Beobachtungszeitpunkt? Lassen sich Heizstufe und Thermostatstellung während Baseline-Läufen verbindlich konstant dokumentieren? Diese Punkte sperren P1–P4a nicht; bei fehlender Evidenz gelten die festgelegten Rückfälle.

**Der Umbau ist damit ausführbar. Eine Freigabe des dynamischen Modells bleibt von den P3-Zahlen und unabhängiger Validierung abhängig.**

