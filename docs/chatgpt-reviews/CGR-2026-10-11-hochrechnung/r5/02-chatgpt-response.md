# Review Runde 5

**Diese Bauvorlage ersetzt die verstreuten Vorgaben der Runden 2–4 für den beschriebenen Umbau. Baue P1–P4a danach; P4b bleibt eine getrennte, von Messdaten und Validierung abhängige Erweiterung. Alle Schwellen sind unsere Implementierungswerte, keine normativen Grenzwerte.**

Stand: `herbertschrotter-blip/ha-baustelle`, Branch **main**, `d0209b6`, Version 0.8.131. Neu geprüft, jeweils mit `ref=main`: `db/mitschreiben.py`, `db/schreiber.py`, `logik/minute.py`, `funktionen/heizung/baseline.py`, `funktionen/heizung/plan.py`, `logik/arbeitszeit.py`, `logik/hochrechnung.py`, `logik/tagesverlauf.py`. Die unveränderten weiteren Quellen bleiben auf dem geprüften Stand der Vorläuferrunden.

## 1. Architektur und Lieferungen

Alle folgenden Dateinamen beziehen sich auf `custom_components/baustelle/logik/`. Alle Datenklassen sind `@dataclass(frozen=True)`; Sequenzen werden als Tupel übergeben. Keine HA-, SQL-, State- oder Entity-Objekte in diesen Verträgen.

| Datei | Ausschließliche Verantwortung | Lieferung |
|---|---|---|
| prognose_typen.py | gemeinsame Ein-/Ausgabetypen, Enums, Modellversion | P1, additiv erweitern |
| prognose_regeln.py | alle Prognoseschwellen an genau einer Stelle | P1–P4b |
| prognose_merkmale.py | Klassifikation, Qualitätsnachweise, Exposition, Tages-/Start-/Abkühlmerkmale | P1/P2 |
| prognose_h.py | reguläre stationäre Fenster, robustes H, Tagesregression, Duty | P3 |
| prognose_baseline.py | Plateau-Erkennung und Gegenmodell-Identifikation; später elektrischer Wetterfit | P3/P4a, spätere Erweiterung |
| prognose_dynamik.py | C-/tau-Identifikation, RC-Schritt, Start-/Frostsimulation | P4b |
| prognose_wetter.py | Wetterintervalle, Klimatagesgang, Szenarien, gleitendes Soll/Planauflösung | P4a |
| prognose_modell.py | stationäre/dynamische Energiezeitreihen, gekoppelte Szenarien, additive Aggregation und Vergleich | P4a/P4b |
| prognose_stufe.py | Evidenz- und Prognosestufe, Validierungsmaße, Rückstufungen | P3/P4a |
| prognose_anzeige.py | verständliche Ausgabetexte, €/% und fertige Anzeigeverträge | P4a |
| minute.py, bestehend | zustandsbasierte zeitliche Sammlung einschließlich neuer Alter-/Anforderungs-/Sperrmerkmale | P1 |

Keine neue Vollregelung in der Prognose: `arbeitszeit.py`, `regelung.py` und `soll.py` bleiben die Quellen für Plan, Prioritäten und Soll. Vorhandene reine Hilfsfunktionen wiederverwenden; falls eine benötigte Entscheidung bislang im HA-Adapter liegt, einmal in die zuständige Fachlogik herausziehen und beide Wege darauf umstellen.

### 1.1 Was aus dem Bestand bleibt?

| Bestand | P1–P4: parallel | nach P6 |
|---|---|---|
| hochrechnung.py: Klima/HGT/Zeitraum-Helfer | gemeinsamer Klima-Helfer, kein zweiter Klimamittelalgorithmus | Klima/HGT dürfen bleiben; HGT ist Diagnose, nicht das neue Verbrauchsmodell |
| hochrechnung.py: container_rest, Tagesschnitt, alte Ohne-Signatur, Verhältnis nach Heizkörpertyp, alte Reihen/Perioden | ausschließlich Legacy-Ausgabe | aus aktivem V2-Pfad entfernen; nach Rücknahmefenster tote Funktionen/Imports löschen |
| signatur.py | Legacy und ausdrücklich historische Diagnose | optional Diagnose behalten; keine Prognose-/Einsparungsquelle und keine automatische Rückfallinstanz |
| tagesverlauf.py: gewichtete Verteilung eines Tageswerts, 5-%-Frost, gemischtes Baselineprofil | nur Legacy | aktiven V2-Pfad entfernen; V2 zeigt direkt berechnete Intervalle |
| baseline.py, bestehend | Laufplanung, Budget, Abbruch, Start-aus bleiben | weiterhin Laufverwaltung; Güte-/Fertigkriterium auf neuen Ohne-Modellvertrag umstellen |
| minute.py, tag.py, zaehlen.py | Mess-/Abrechnungspfad bleibt; neue Merkmale additiv | gemessene Energie bleibt; historischer Ohne-Zähler darf Diagnose sein, nie V2-Gegenmodell |

Legacy und V2 teilen den bereits vorhandenen Klima-/Soll-/Planalgorithmus, aber **keine gemischten Prognosewerte**. Modellwahl erfolgt einmal im Adapter: `legacy|v2`. Rohdaten niemals löschen. P6 ist rücknehmbar; Legacy-Code erst nach vereinbartem Rücknahmefenster entfernen.

## 2. Gemeinsamer Typvertrag

### 2.1 Konventionen

- Zeiten: timezone-aware UTC-`datetime`, halboffene Intervalle [von,bis); lokale Datumsgrenzen ausschließlich mit Baustellen-Zeitzone.
- Dauer = (bis−von).total_seconds(); Stunden = Dauer/3 600. Keine feste Tageslänge.
- Messenergie: Wh an der Rohschnittstelle, kWh ab Merkmalsbildung. Leistung: kW für Modelle, W nur im Rohwertfeld.
- Temperatur °C, Differenz K; GDH K·h; H kW/K; C kWh/K; tau h.
- `None` = unbekannt/nicht identifiziert, niemals gleich 0. Alle numerischen Werte endlich.
- Freigabe/Heizbereitschaft, Schaltanforderung, Relayzustand, Stromfluss und Qualität sind unterschiedliche Größen.
- `modell_version="prognose-v2.1"`; Konfigurations-ID und Training-Cutoff müssen Ergebnisse reproduzierbar machen.

### 2.2 Enums

```python
Betriebsart = Literal["REGULAER", "FROST", "BASELINE", "SONSTIGE"]
Regelungsart = Literal["thermo", "plan", "aus", "unbekannt"]
Nachweis = Literal["direkt", "rekonstruiert", "ersatz", "keiner"]
Stufe = Literal["A", "B", "C", "D"]
WetterQuelle = Literal["vorhersage_stunde", "vorhersage_tag", "klima"]
MitteArt = Literal["verbrauch", "haltebedarf", "duty", "keine"]
ThermostatNachweis = Literal["angenommen", "bestaetigt", "unbekannt", "geaendert"]
Gruende = tuple[str, ...]  # stabile Fehler-/Unsicherheitscodes, keine freien Texte
```

### 2.3 Eingabeklassen: sämtliche Felder

| Klasse | Felder mit Typ und Bedeutung |
|---|---|
| Intervall | von: datetime; bis: datetime |
| Leistungsreferenz | kw: float; quelle: Literal["geraet_einstellung","separater_vollstrom"]; gueltig_ab: datetime; beleg_id: str. Nicht aus dem gerade geprüften Fenster gelernt |
| GeraetIntervall | zeit: Intervall; geraet_id: str; energie_wh: float\|None; energie_gueltig: bool; sekunden_ein: float\|None; sekunden_strom: float\|None; strom_belegt: bool; leistung_w: float\|None; leistung_w_max: float\|None; erreichbar: bool\|None; heizanforderung_s: float\|None; staffel_gesperrt_s: float\|None; p_ref: Leistungsreferenz\|None; quelle: str |
| BetriebsKontext | konfiguration_id: str; regelungsart: Regelungsart; regulaer_freigegeben: bool\|None; frost_bereit: bool\|None; frost_grenze_c: float; frost_aus_c: float; frost_aussen_c: float\|None; baseline_lauf_id: str\|None; tuer_beobachtet: bool; kontext_belegt: bool; wechsel_im_intervall: bool; staffel_rekonstruiert_frei: bool\|None; anschlussbelegung_belegt: bool; sperrereignis: bool; sonstige_eingriffe: Gruende |
| BereichIntervall | zeit: Intervall; bereich_id: str; zeile_vorhanden: bool; grund: str\|None; zustand: str\|None; quelle: str\|None; innen_c: float\|None; innen_gueltig: bool; temp_alter_s: int\|None; altersnachweis_alt: bool; soll_c: float\|None; aussen_c: float\|None; aussen_gueltig: bool; aussen_frisch: bool\|None; tuer_offen_s: float\|None; staffel_begrenzt_s: float\|None; kontext: BetriebsKontext; geraete: tuple[GeraetIntervall,...] |
| BaselineMetadaten | lauf_id: str; bereich_id: str; zeit: Intervall; status: str; thermostat_unveraendert: ThermostatNachweis; thermostatstellung: Literal["max","andere","unbekannt"]; annahme_am: datetime\|None; konfiguration_id: str; p_ref_belege: tuple[str,...] |
| WetterEingabe | stunden: tuple[WetterIntervall,...]; tagesmittel: tuple[tuple[date,float],...]; klima_monate: tuple[float,...]; bekannte_vortage: tuple[tuple[date,float],...] |
| WetterIntervall | zeit: Intervall; aussen_c: float; quelle: WetterQuelle; synthetischer_tagesgang: bool |
| PlanTag | datum: date; bereich_id: str; konfiguration_id: str; plan: Plan\|None nur Diagnose; arbeitszeiten: tuple[Arbeitszeit,...]; ausnahmen: tuple[Ausnahme,...]; frei: bool; heizregeln: HeizRegeln; warm_ab: WarmAb\|None; trocknen: bool; plan_wetter: WetterTag; plan_wetterquelle: WetterQuelle; heizgrenze_c: float; heizgrenze_basis: Literal["tageshoechst","aktuell"]; auto: bool; bedarfscontainer: bool; regelungsart: Regelungsart; gleitregeln: GleitRegeln aus soll.py; rueckmeldungen: tuple[tuple[float,int],...]; absenk_soll_c: float\|None; frost_grenze_c: float; frost_aus_c: float; frost_aussen_c: float\|None; frost_erlaubt: bool; frei_modus: Literal["frost","absenk","aus"]; feste_bedarfsfenster: tuple[Intervall,...]; p_ref: tuple[Leistungsreferenz,...]; fruehstart_unsicher: bool; kontext_belegt: bool |
| PlanIntervall | zeit: Intervall; bereich_id: str; konfiguration_id: str; regelungsart: Regelungsart; regulaer_freigegeben: bool; frost_bereit: bool; ziel_c: float\|None; aussen_c: float; wetterquelle: WetterQuelle; p_max_kw: float\|None; episode_id: str\|None; startdefizit_k: float\|None; gruende: Gruende |
| Anfangszustand | zeit: datetime; innen_c: float\|None; frost_ein: bool\|None; thermostat_ein: bool\|None; beleg: Literal["gemessen","modelliert","unbekannt"] |
| PreisIntervall | zeit: Intervall; eur_kwh: float |
| PrognoseAuftrag | zeitraum: Intervall; zeitzone: str; bereich_ids: tuple[str,...]; historische_minuten: tuple[BereichIntervall,...]; baseline_laeufe: tuple[BaselineMetadaten,...]; plantage: tuple[PlanTag,...]; wetter: WetterEingabe; preise: tuple[PreisIntervall,...]; gemessen_bis: datetime; anfang_mit: tuple[tuple[str,Anfangszustand],...]; anfang_ohne: tuple[tuple[str,Anfangszustand],...] |

`PlanTag` enthält die vorhandenen reinen Typen `Arbeitszeit`, `Ausnahme`, `HeizRegeln`, `WarmAb`, `WetterTag` aus `arbeitszeit.py`. Das Feld plan ist nur ein Diagnose-Snapshot; `planen()` erzeugt den endgültigen Plan je Szenario erneut mit `tagesplan()`. Wetterabhängiger Frühstart, Regen und Trocknen werden über den vorhandenen WetterTag-Vertrag abgebildet. Fehlende künftige Regenwerte bleiben None und als Planunsicherheit sichtbar. `warm_ab` darf für zukünftige Tage nur den belegten Nominal-/Lernstand nutzen, nicht eine als sicher angenommene aktuelle Raumtemperatur.

Die Heizgrenzensperre übernimmt den vorhandenen Vergleich aus `funktionen/heizung/plan.py:zu_warm()`: Wert > Grenze, Basis tageshoechst oder aktuell. Diese kleine Fachregel einmal nach `logik/regelung.py` herausziehen, beide Adapter darauf umstellen. Tageshöchst aus derselben Szenariowetterreihe bilden; aktuelle Basis je Intervall. Keine zweite abweichende Heizgrenze in V2. Soll-/Freigabeauflösung benutzt die vorhandenen Prioritäten einschließlich Bedarf vor Heizgrenze.

Bei Plan-/Konfigurationswechseln innerhalb einer gespeicherten historischen Minute: zeitgenau rekonstruieren, soweit Energie ebenfalls belegbar aufteilbar ist; ansonsten `wechsel_im_intervall=True`, kein Training. Keine proportional erfundene Teilenergie. Stundenimporte (`dauer_s=3600`) sind Ist-/Abrechnungsdaten, keine minutengenauen Trainingsfenster.

### 2.4 Ergebnis-/Zwischenklassen

| Klasse | Vollständiger Feldvertrag |
|---|---|
| Klassifikation | art: Betriebsart; betrieb_gueltig: bool; gruende: Gruende |
| MinutenQualitaet | energie_je_geraet_gueltig: tuple[tuple[str,bool],...]; innen_gueltig: bool; aussen_gueltig: bool; betrieb_gueltig: bool; frische: Nachweis; staffel: Nachweis; trainingsfaehig: bool; gruende: Gruende |
| StartMerkmal | episode_id: str; beginn: datetime; soll_c: float; innen_start_c: float\|None; delta_start_k: float\|None; konfiguration_id: str; gruende: Gruende |
| TagesMerkmale | datum: date; bereich_id: str; konfiguration_id: str; dauer_h: float; ist_belegt_kwh: float; ist_vollstaendig: bool; energie_arten_kwh: tuple[tuple[Betriebsart,float],...]; regulaer_joint_kwh: float; gdh_aktiv_kh: float; gdh_frost_kh: float; gdh_innen_kh: float; aktiv_h: float; frost_h: float; plan_h: float; kapazitaet_regulaer_kwh: float\|None; aussen_mittel_c: float\|None; q_energie_je_geraet: tuple[tuple[str,float],...]; q_betrieb: float; q_innen: float; q_aussen: float; q_joint_r: float\|None; q_joint_f: float\|None; laengste_joint_luecke_s: float; starts: tuple[StartMerkmal,...]; training_thermo: bool; training_plan: bool; gruende: Gruende |
| Fenster | zeit: Intervall; bereich_id: str; konfiguration_id: str; art: Literal["regulaer","baseline"]; energie_kwh: float; x_innen_kh: float; innen_mittel_c: float; aussen_mittel_c: float; p_max_kw: float; zyklen_je_geraet: tuple[tuple[str,int],...]; frische: Nachweis; staffel: Nachweis; gueltig: bool; gruende: Gruende |
| HEvidenz | fenster: int; tage: int; stunden: float; mad_kw_k: float\|None; streuung_rel: float\|None; delta_t_min_k: float\|None; delta_t_max_k: float\|None; aussen_min_c: float\|None; aussen_max_c: float\|None; soll_min_c: float\|None; soll_max_c: float\|None; ersatzfenster: int; verworfen: int; gruende: Gruende |
| HSchaetzung | bereich_id: str; konfiguration_id: str; modell_version: str; training_bis: datetime; methode: Literal["stationaer","tagesregression","keine"]; h_kw_k: float\|None; h_unten_kw_k: float\|None; h_oben_kw_k: float\|None; evidenz: HEvidenz |
| DutySchaetzung | bereich_id: str; konfiguration_id: str; duty: float\|None; tage: int; kapazitaet_training_kwh: float; energie_training_kwh: float; gruende: Gruende |
| OhneSchaetzung | bereich_id: str; konfiguration_id: str; methode: Literal["plateau","elektrischer_wetterfit","duty","keine"]; h: HSchaetzung\|None; t_max_c: float\|None; t_max_unten_c: float\|None; t_max_oben_c: float\|None; duty: DutySchaetzung\|None; a_kw: float\|None; b_kw_k: float\|None; laeufe: int; beobachtungstage: int; plateau_h: float; thermostat_nachweis: ThermostatNachweis; guete: Validierung\|None; gruende: Gruende |
| StartBilanz | start: StartMerkmal; zeit: Intervall; delta_innen_k: float; x_innen_kh: float; energie_kwh: float; qualitaet: MinutenQualitaet |
| AbkuehlEpisode | zeit: Intervall; bereich_id: str; konfiguration_id: str; minuten: tuple[BereichIntervall,...]; innen_start_c: float; innen_ende_c: float; gruende: Gruende |
| DynamikParameter | h_kw_k: float; c_kwh_k: float\|None; tau_h: float\|None |
| DynamikSchaetzung | bereich_id: str; konfiguration_id: str; parameter: tuple[DynamikParameter,...]; starts: int; starttage: int; startspanne_k: float; naechte: int; abkuehl_h: float; streuung_rel: float\|None; start_validierung: Validierung\|None; frost_validierung: Validierung\|None; energie_freigegeben: bool; temperatur_freigegeben: bool; frost_freigegeben: bool; gruende: Gruende |
| ValidierungsPunkt | zeit: Intervall; energie_ist_kwh: float\|None; energie_modell_kwh: float\|None; innen_ist_c: float\|None; innen_modell_c: float\|None; aussen_c: float; gueltig: bool; konfiguration_id: str |
| Validierung | modell_id: str; training_bis: datetime; test_von: datetime; test_bis: datetime; tage: int; episoden: int; aussen_spanne_k: float; energie_ist_kwh: float; wape: float\|None; bias_rel: float\|None; temperatur_rmse_k: float\|None; unabhaengig: bool |
| StufenErgebnis | evidenz: Stufe; prognose: Stufe; methode: str; extrapolation: bool; gruende: Gruende |
| ParameterSatz | index: int; h_mit_kw_k: float\|None; h_ohne_kw_k: float\|None; t_max_c: float\|None; frost_ziel_c: float; dynamik_mit: DynamikParameter\|None; dynamik_ohne: DynamikParameter\|None |
| Szenario | id: str; wetter_delta_k: float; parameter: ParameterSatz |
| EnergieIntervall | zeit: Intervall; bereich_id: str; mitte_kwh: float\|None; unten_kwh: float\|None; oben_kwh: float\|None; haltebedarf_kwh: float\|None; kapazitaet_kwh: float\|None; mitte_art: MitteArt; stufe: StufenErgebnis; gruende: Gruende |
| SzenarioLauf | szenario_id: str; mit: tuple[EnergieIntervall,...]; ohne: tuple[EnergieIntervall,...] |
| ZeitraumErgebnis | zeit: Intervall; mitte_kwh: float\|None; unten_kwh: float\|None; oben_kwh: float\|None; ist_belegt_kwh: float\|None; ist_vollstaendig: bool; fehlende_bereiche: tuple[str,...]; mitte_art: MitteArt; stufe: StufenErgebnis; gruende: Gruende |
| VergleichErgebnis | zeit: Intervall; mit: ZeitraumErgebnis; ohne: ZeitraumErgebnis; gespart: ZeitraumErgebnis; gespart_prozent: float\|None; ist_sonderbetrieb_kwh: float; ist_baseline_kwh: float; vergleichbar: bool; gruende: Gruende |
| AnzeigeWert | wert_kwh: float\|None; unten_kwh: float\|None; oben_kwh: float\|None; eur: float\|None; unten_eur: float\|None; oben_eur: float\|None; status_text: str; wert_text: str; band_text: str\|None; hinweise: tuple[str,...]; stufe: Stufe; mitte_art: MitteArt |
| AnzeigeVergleich | mit: AnzeigeWert; ohne: AnzeigeWert; gespart: AnzeigeWert; gespart_prozent: float\|None; vergleichshinweis: str\|None; modell_version: str; gemessen_bis: datetime; aktualisiert_am: datetime |

Typen können in Python auf mehrere interne Dateien verteilt werden, öffentliche Importadresse bleibt `prognose_typen`. Keine rechenbaren Textfelder als Datenersatz; Texte ergänzen echte Zahlen.


### 2.5 PrognoseRegeln: benannte Felder und Defaults

Diese Klasse ist der einzige Ort für Prognoseschwellen im Code. Die Abschnitte 6–9 erläutern ihre Anwendung. Unveränderliche Defaults, keine GUI-Konfiguration in der ersten Lieferung:

```python
@dataclass(frozen=True)
class PrognoseRegeln:
    abdeckung_min: float = 0.95
    gemeinsame_luecke_max_s: int = 300
    messalter_max_s: int = 120
    ersatz_konstanz_max_s: int = 1800
    sensor_aufloesung_k: float = 0.1
    puls_minuten_min: int = 5
    puls_rel_min: float = 0.8
    puls_rel_max: float = 1.2
    tuer_offen_max_s: int = 60
    start_pause_min: int = 30
    start_sollsprung_k: float = 1.0
    start_vorlauf_min: int = 10
    start_gueltig_min: int = 8
    tagesfit_start_max_k: float = 2.0
    tagesfit_aktiv_min_h: float = 4.0
    tagesfit_gdh_min_kh: float = 20.0
    tagesfit_tage_min: int = 3
    konvektor_vorlauf_min: int = 60
    oel_vorlauf_min: int = 120
    konvektor_fenster_min: int = 120
    oel_fenster_min: int = 180
    soll_spanne_max_k: float = 0.5
    innen_spanne_max_k: float = 0.6
    innen_trend_max_k_h: float = 0.1
    randmittel_dauer_min: int = 15
    randmittel_diff_max_k: float = 0.3
    innen_aussen_min_k: float = 5.0
    sollnaehe_max_k: float = 0.7
    sollnaehe_anteil_min: float = 0.9
    duty_fenster_min: float = 0.05
    duty_fenster_max: float = 0.90
    zyklen_min: int = 3
    mad_faktor: float = 1.4826
    ausreisser_tage_min: int = 5
    ausreisser_mad_faktor: float = 3.0
    ausreisser_rel_min: float = 0.30
    c_fenster_min: int = 12
    c_tage_min: int = 3
    c_stunden_min_h: float = 24.0
    c_streuung_max: float = 0.30
    d_fenster_min: int = 30
    d_tage_min: int = 7
    d_streuung_max: float = 0.15
    h_band_c_min_rel: float = 0.30
    h_band_d_min_rel: float = 0.15
    h_band_ersatz_min_rel: float = 0.50
    h_band_streuung_faktor: float = 2.0
    h_betriebsabweichung_max_rel: float = 0.25
    validierung_tage_min: int = 7
    validierung_aussen_spanne_min_k: float = 6.0
    validierung_wape_max: float = 0.20
    validierung_bias_abs_max: float = 0.10
    extrapolation_delta_min_faktor: float = 0.75
    extrapolation_delta_max_faktor: float = 1.25
    extrapolation_soll_max_k: float = 1.0
    winter_delta_k: float = 1.5
    tagesgang_amplitude_k: float = 3.0
    tagesgang_minimum_stunde: int = 5
    baseline_versuch_min_h: float = 24.0
    baseline_bevorzugt_h: float = 48.0
    baseline_vorlauf_konvektor_h: float = 2.0
    baseline_vorlauf_oel_h: float = 4.0
    baseline_block_max_h: float = 6.0
    baseline_b_naechte_min: int = 2
    baseline_b_nacht_min_h: float = 3.0
    baseline_b_gesamt_min_h: float = 6.0
    baseline_c_tage_min: int = 3
    baseline_c_laeufe_min: int = 2
    baseline_c_plateau_min_h: float = 12.0
    tmax_band_min_k: float = 1.0
    tmax_nacht_diff_max_k: float = 2.0
    startfit_anstieg_min_k: float = 2.0
    startfit_starts_min: int = 8
    startfit_tage_min: int = 4
    startfit_spanne_min_k: float = 3.0
    startfit_streuung_max: float = 0.30
    startfit_negative_z_max_anteil: float = 0.20
    startfit_holdout_min: int = 5
    startfit_wape_max: float = 0.25
    startfit_bias_abs_max: float = 0.15
    startfit_temp_rmse_max_k: float = 0.5
    abkuehl_episode_min_h: float = 2.0
    abkuehl_abnahme_min_k: float = 1.0
    abkuehl_naechte_min: int = 3
    abkuehl_gesamt_min_h: float = 6.0
    abkuehl_rmse_max_k: float = 0.3
    abkuehl_streuung_max: float = 0.30
    c_auf_ab_verhaeltnis_max: float = 2.0
    frost_holdout_episoden_min: int = 3
    frost_holdout_naechte_min: int = 2
    frost_wape_max: float = 0.25
    frost_temp_rmse_max_k: float = 0.5
    ohne_wetter_tage_min: int = 10
    ohne_wetter_laeufe_min: int = 3
    ohne_wetter_untersaettigt_tage_min: int = 5
    ohne_wetter_duty_min: float = 0.10
    ohne_wetter_duty_max: float = 0.90
    ohne_wetter_extrapolation_max_k: float = 2.0
```

Frost-Ein/Aus, Heizgrenze, Leistungsreferenz, Komfort-Soll und TPI sind **bestehende Betriebsparameter**, keine weiteren Prognose-Defaults. Gewichtung des gleitenden Solls kommt weiterhin aus soll.py. Die Energiedefinition kommt aus minute.py/zaehlen.py. Diese Regeln nicht im neuen Konstantenmodul duplizieren.



## 3. Öffentliche Funktionen je Modul

`Sequence`, `Mapping`, `datetime`, `date` und die genannten Typen sind normale Python-Typen. `PrognoseRegeln` enthält ausschließlich die Defaults aus §6–§9; keine HA-Einstellungen.

```python
# prognose_merkmale.py
def klassifiziere_minute(
    grund: str | None, zustand: str | None, quelle: str | None,
    zeile_vorhanden: bool,
) -> Klassifikation: ...

def pruefe_minuten(
    minuten: Sequence[BereichIntervall], regeln: PrognoseRegeln,
) -> tuple[MinutenQualitaet, ...]: ...

def frische_ersatz(
    minuten: Sequence[BereichIntervall], regeln: PrognoseRegeln,
) -> MinutenQualitaet: ...

def tagesmerkmale(
    minuten: Sequence[BereichIntervall], heute: date, zeitzone: str,
    regeln: PrognoseRegeln,
) -> tuple[TagesMerkmale, ...]: ...

def starts(
    minuten: Sequence[BereichIntervall], regeln: PrognoseRegeln,
) -> tuple[StartMerkmal, ...]: ...

def startbilanzen(
    minuten: Sequence[BereichIntervall], starts: Sequence[StartMerkmal],
    regeln: PrognoseRegeln,
) -> tuple[StartBilanz, ...]: ...

def abkuehlepisoden(
    minuten: Sequence[BereichIntervall], regeln: PrognoseRegeln,
) -> tuple[AbkuehlEpisode, ...]: ...

# prognose_h.py
def stationaere_fenster(
    minuten: Sequence[BereichIntervall], regeln: PrognoseRegeln,
) -> tuple[Fenster, ...]: ...

def schaetze_h(kontext: ModellKontext, fenster: Sequence[Fenster], regeln: PrognoseRegeln) -> HSchaetzung: ...
def schaetze_h_tage(kontext: ModellKontext, tage: Sequence[TagesMerkmale], regeln: PrognoseRegeln) -> HSchaetzung: ...
def schaetze_duty(kontext: ModellKontext, tage: Sequence[TagesMerkmale], regeln: PrognoseRegeln) -> DutySchaetzung: ...

# prognose_baseline.py
def plateaus(
    minuten: Sequence[BereichIntervall], laeufe: Sequence[BaselineMetadaten],
    regeln: PrognoseRegeln,
) -> tuple[Fenster, ...]: ...

def schaetze_ohne(
    kontext: ModellKontext,
    plateaus: Sequence[Fenster], laeufe: Sequence[BaselineMetadaten],
    validierung: Validierung | None, regeln: PrognoseRegeln,
) -> OhneSchaetzung: ...

def fit_ohne_wetter(
    kontext: ModellKontext,
    tage: Sequence[TagesMerkmale], laeufe: Sequence[BaselineMetadaten],
    validierung: Validierung | None, regeln: PrognoseRegeln,
) -> OhneSchaetzung: ...  # spätere Lieferung

# prognose_dynamik.py
def fit_aufheizen(
    kontext: ModellKontext,
    bilanz: Sequence[StartBilanz], h: HSchaetzung,
    validierung: Validierung | None, regeln: PrognoseRegeln,
) -> DynamikSchaetzung: ...

def fit_abkuehlen(
    kontext: ModellKontext,
    episoden: Sequence[AbkuehlEpisode], h: HSchaetzung,
    regeln: PrognoseRegeln,
) -> DynamikSchaetzung: ...

def rc_schritt(
    innen_c: float, aussen_c: float, p_kw: float,
    h_kw_k: float, c_kwh_k: float, dauer_h: float,
) -> float: ...

def aufheizblock(
    innen_start_c: float, ziel_c: float, aussen_c: float,
    p_kw: float, h_kw_k: float, c_kwh_k: float, dauer_h: float,
) -> AufheizBlock: ...

# prognose_wetter.py
def wetterreihe(
    eingabe: WetterEingabe, zeitraum: Intervall, zeitzone: str,
    delta_klima_k: float, regeln: PrognoseRegeln,
) -> tuple[WetterIntervall, ...]: ...

def planen(
    tage: Sequence[PlanTag], wetter: Sequence[WetterIntervall],
    bekannte_vortage: Mapping[date, float], zeitzone: str,
    regeln: PrognoseRegeln,
) -> tuple[PlanIntervall, ...]: ...

# prognose_modell.py
def szenarien(
    mit: HSchaetzung | DutySchaetzung, ohne: OhneSchaetzung,
    dynamik_mit: DynamikSchaetzung | None,
    dynamik_ohne: DynamikSchaetzung | None,
    regeln: PrognoseRegeln,
) -> tuple[Szenario, ...]: ...

def berechne_mit(
    plan: Sequence[PlanIntervall], modell: HSchaetzung | DutySchaetzung,
    parameter: ParameterSatz, anfang: Anfangszustand,
    regeln: PrognoseRegeln,
) -> tuple[EnergieIntervall, ...]: ...

def berechne_ohne(
    plan: Sequence[PlanIntervall], modell: OhneSchaetzung,
    parameter: ParameterSatz, anfang: Anfangszustand,
    regeln: PrognoseRegeln,
) -> tuple[EnergieIntervall, ...]: ...

def aggregiere(
    laeufe: Sequence[SzenarioLauf], zeitraeume: Sequence[Intervall],
    ist: Sequence[BereichIntervall], regeln: PrognoseRegeln,
) -> tuple[VergleichErgebnis, ...]: ...

# prognose_stufe.py
def validiere(
    modell_id: str, training_bis: datetime,
    punkte: Sequence[ValidierungsPunkt],
    regeln: PrognoseRegeln,
) -> Validierung: ...

def stufe_mit(
    h: HSchaetzung | DutySchaetzung, validierung: Validierung | None,
    plan: Sequence[PlanIntervall], dynamik: DynamikSchaetzung | None,
    regeln: PrognoseRegeln,
) -> StufenErgebnis: ...

def stufe_ohne(
    modell: OhneSchaetzung, plan: Sequence[PlanIntervall],
    regeln: PrognoseRegeln,
) -> StufenErgebnis: ...

# prognose_anzeige.py
def anzeige(
    ergebnis: VergleichErgebnis, laeufe: Sequence[SzenarioLauf],
    ist: Sequence[BereichIntervall], preise: Sequence[PreisIntervall],
    modell_version: str, gemessen_bis: datetime, aktualisiert_am: datetime,
) -> AnzeigeVergleich: ...
```

Die mathematische Blockfunktion liefert diesen eigenen Typ:

```python
@dataclass(frozen=True)
class AufheizBlock:
    energie_kwh: float
    zusatz_kwh: float
    aufheiz_h: float | None
    innen_ende_c: float
    ziel_erreicht: bool
```

`rc_schritt` bleibt primitive mathematische Funktion; `berechne_mit/ohne` fügen Zeitrahmen und Status hinzu.

Alle Schätz-/Fitfunktionen erhalten als erstes Argument `kontext: ModellKontext`. Dieser Kontext trägt auch bei leeren Eingaben die Ergebnisidentität:

```python
@dataclass(frozen=True)
class ModellKontext:
    bereich_id: str
    konfiguration_id: str
    training_bis: datetime
```

Leere Eingabe liefert A/None mit Gründen. Modelle unterschiedlicher Container/Konfigurationen werden nicht vermischt. Unabhängige Validierung wird nicht im Fit erfunden.

## 4. Adapter-Vertrag je Lieferung

| Lieferung | HA-/DB-Adapter liefert | Fachlogik liefert |
|---|---|---|
| P1 | Beobachtungs-/Anforderungs-/Sperrereignisse mit UTC-Zeit; neue Nullable-Spalten; Baseline-Metadaten; Quellenherkunft | zeitliche Vereinigung, Maximalalter, einfache Qualitäts-/Klassifikationsregeln |
| P2 | BereichIntervall samt jedem historischen Heizkörper; versionierter Kontext; Lücken ausdrücklich; bestätigte Laufintervalle | R/F-Exposition, gemeinsame Abdeckung, Starts, Tages-/Episodenmerkmale |
| P3 | genügend Historie einschließlich Vorlauf vor Tag-/Abfragebeginn; unabhängige Leistungsreferenzen | Fenster, getrennte Direkt-/Ersatzschätzer, verworfene Fälle, Evidenz |
| P4a | rohe PlanTag-Daten, WetterEingabe, Preise, gemessen_bis, Anfangszustände | scenarioabhängiges Soll/Plan/Wetter, Energie, Stufen, fertige Anzeige |
| P4b | eingefrorene Trainings-/Testzeiträume und neue spätere Beobachtungen | C/tau-Kandidaten, dynamische Verläufe, unabhängige Güte-/Freigabeprüfung |

Der Adapter übernimmt keine Schwellenentscheidung, keine Tagesrechnung, keine Einsparungsrechnung. DB-Lesen/Joins dürfen Kontext zuordnen; Zeit-/Prioritäts-/Qualitätsregeln bleiben `logik/`.

**Aktuelle Minutengrenze:** `Mitschreiber._abschliessen()` schreibt Soll/Grund/Zustand aus dem aktuellen End-Snapshot. Für neue Daten müssen deren Wechselzeitpunkte in der Sammlerfolge erhalten werden. Am einfachsten Zusatzereignisse über den vorhandenen `ereignis`-Pfad mit typisiertem Payload; keine fünfte Prognosespalte nötig. Neuer Ereignisvertrag: art="prognose_kontext", wert enthält grund, zustand, soll_c, regelungsart, konfiguration_id und den UTC-Wirksamkeitszeitpunkt. Diese Zustandsfolge wird vom bestehenden Regelungsadapter gemeldet. Bei alten nicht rekonstruierbaren Wechselminuten Trainingsausschluss. Kein Snapshot wird rückwirkend zum Beweis eines ganzen Intervalls.

`gemessen_bis` ist Ende der tatsächlich gebuchten Messintervalle, **nicht automatisch jetzt**. Modellrechnung beginnt dort. Eine verspätete Messminute darf nicht gleichzeitig als Ist und Prognose gezählt werden. Messlücken in der Vergangenheit bleiben Messlücken; sie werden nicht rückwirkend still zu „gemessen“.

Konfiguration aus `einstellung.ab`, historischen Arbeitszeiten und Einsatzintervallen. Nachträglich veränderbare Ausnahmen ohne Versionsverlauf bleiben unsicher; gespeicherter Grund/Soll ist vorrangig. temperatur=NULL bedeutet nicht sofort Planbetrieb: bestehende 15-min-Fühlerüberbrückung berücksichtigen oder Übergang ausschließen.

## 5. P1-Schema und Befüllung

### 5.1 Genau vier Spalten

| Tabelle.Spalte | SQLAlchemy-Typ | Regeln |
|---|---|---|
| bereich_minute.temp_alter_s | Integer, nullable=True | Maximalalter des belegten, wirklich benutzten Innenwerts während des ganzen Intervalls; ≥0; unbekannter Teil → NULL |
| geraet_minute.heizanforderung_s | Integer, nullable=True | Einschaltanforderung vor Staffelung; 0…dauer_s |
| geraet_minute.staffel_gesperrt_s | Integer, nullable=True | angefordert, aber vom Staffelungskern nicht freigegeben; 0…heizanforderung_s |
| bereich_minute.staffel_begrenzt_s | Integer, nullable=True | Dauer der Vereinigung der Gerätesperrintervalle, 0…dauer_s |

Kein Default 0, kein historisches Backfill. Migration additiv für SQLite/PostgreSQL/TimescaleDB. Alte Writer und gespeicherte Pufferarbeiten ohne neue Schlüssel bleiben gültig. Wiederholte Migration idempotent; ungültige negative/überlange Zeiten werden von der Fachlogik zurückgewiesen.

### 5.2 Kern-/Schreiberpfad

1. `kern/staffelung.py:_staffeln()`: bestehende Einschaltanforderung je Gerät unmittelbar **vor** Auswahl/Begrenzung erfassen; nach Auswahl tatsächlichen Veto-Status samt Zeitpunkt melden. Nur Beobachtung hinzufügen, keine Auswahl-/Prioritätsregel ändern.
2. Nicht jeder Unterschied Relay/Anforderung ist Staffelung: Offline, Befehlslatenz, Mindestpause, sonstige Sperre unterscheidbar halten. Nur tatsächliches Staffelungsveto füllt `staffel_gesperrt_s`.
3. `logik/minute.py`: Ereignisfolgen integrieren; Bereichssperrung als Intervallvereinigung; jede unbekannte Teilphase macht den jeweiligen neuen Nachweis NULL.
4. `db/mitschreiben.py`: Sammlerwerte in `_abschliessen()` an die Minute-Payload anhängen.
5. `db/schreiber.py`/bestehende `minute`-Arbeit: Payload unverändert puffern/schreiben; nach Retry keine Nachberechnung anhand neuer Zustände.

TPI-aus → Anforderung0, Sperre0. Freigegebener Plug mit ausgeschaltetem Gerätethermostat → Anforderungdauer, Sperre0, Strom0. Keine Verwechslung mit fehlender Stromversorgung.

**Innenberichte:** `last_reported` aktualisiert HA bei erneuter Zustandsmeldung auch für unveränderte Werte; das garantiert noch keine neue physische Messung. Quellenverhalten je Fühler prüfen. Der jetzige `async_track_state_change_event` reicht für identische Berichte nicht. Den gefilterten Berichtspfad für die betreffenden Fühler nutzen; keine globale Beobachtung sämtlicher HA-Berichte. HA-Semantik: [offizielle Zustandsdokumentation](https://www.home-assistant.io/docs/configuration/state_object/).

Alter nicht aus `last_changed` bestimmen. Restaurierter Start-/Cachewert ist kein frischer Messbeleg. Beobachtung 90 s alt zu Minutenbeginn, erneuter Bericht nach 30 s → maximales Alter120 s. Genau120 s ist gültig.

Notprogramm: unbekanntes HA-Alter und HA-Staffelung bleiben NULL; Quelle notprogramm bleibt Training-ausgeschlossen.

### 5.3 Baseline-Laufmetadaten

Erweitere bestehende `logik/baseline.Lauf`/Serialisierung additiv mit:

- thermostat_unveraendert: ThermostatNachweis = "unbekannt" für alte Läufe;
- thermostatstellung: "max"|"andere"|"unbekannt";
- annahme_am: datetime|None;
- konfiguration_id: str|None;
- p_ref_belege: tuple[str,...].

Neue Wochenendläufe: `thermostat_unveraendert="angenommen"` gemäß Herbert, keine erfundene Bestätigung. Eine Verstellung vor dem Wochenende bleibt offen. Wenn Stellung selbst nicht bestätigt ist, thermostatstellung=unbekannt; ein späteres Plateau misst den **beobachteten Betrieb**, nicht automatisch „Max“.

Bestehende Ablage in `lz["baseline"]["laeufe"]` durch `Lauf.als_dict()/aus_dict()` erweitern; dieser JSON-Vertrag braucht keine neue eigene SQL-Tabelle. Unbekannte Alt-/Neu-Felder kompatibel lesen; erforderliche Metadaten beim Laufbeginn einfrieren.

## 6. P1/P2: Klassifikation, Qualität und Tagesmerkmale

### 6.1 Vollständige Grundabbildung

| grund | art |
|---|---|
| arbeitszeit, vorheizen, fruehstart, nachheizen, trocknen, bedarf, absenken | REGULAER |
| heizgrenze | REGULAER; reguläre Freigabe false |
| frost, bereit, frei, ausserhalb | FROST; Bereitschaft aus Politik, nicht allein aus dem Textwert |
| baseline | BASELINE; zusätzlich bestätigte Lauf-ID und Zeit |
| boost, taste, hand, tuer_offen, aus, automatik_aus | SONSTIGE |
| unbekannter/fehlender Grund oder fehlende Zeile | SONSTIGE, ungültig |

Priorität: fehlend/unbekannt → ungültig; notprogramm → SONSTIGE/ungültig; offline → SONSTIGE/ungültig. pause ohne tuer_offen → inkonsistent/ungültig. ha/import_verlauf nur mit belegtem Betriebskontext; unbekannte/import_statistik-Quelle kein minutengenaues Training.

aus/heizt/bereit im Zustandsfeld überschreibt einen gültigen Grund nicht. arbeitszeit/aus bleibt reguläre Regelungszeit. Trocknen bezeichnet hier Heizkörperbetrieb; Bautrocknerenergie gehört nicht in die Heizsumme.

### 6.2 R/F und Energie

R = reguläre gültige thermo-Freigabe, unabhängig von TPI/Relay/Strom. Planmodus separat erfassen, nicht in thermo-H-Training aufnehmen.

F = gültige Frostbereitschaft außerhalb R, ohne Baseline/Sonder-/Türpause. Eine Frostübersteuerung zählt nur einmal. Auch ausserhalb/frei/aus kann bei entsprechender Politik Frostbereitschaft haben; frei_modus=aus hat keine.

GDH_R = Σ R·max(0,Soll_gespeichert−Außen)·dt_h.
GDH_F = Σ F·max(0,Frostziel−Außen)·dt_h.
Frostziel = (Ein+Aus)/2; bei 5/7 °C also 6 °C.

Ist-Energie einschließlich Sonderbetrieb/Baseline speichern, getrennt nach Art. Heizkörperzuordnung je Intervall, nicht heutige Zuordnung. Fehlende Werte nicht durch 0 ersetzen; keine pauschale Hochskalierung von 95 % auf 100 %. GDH und Regressionsenergie stammen aus denselben gemeinsam gültigen Intervallen.

Vorhandene tag_bereich.heizzeit_min/gradh behalten ihre bisherigen Bedeutungen.

### 6.3 Direkte Qualität und Ersatz

Direkt: beim Training belegte Frische von Innen/Außen höchstens 120 s; Innenalter nach §5. Außen- und Energieherkunft nicht allein aus der Existenz einer DB-Zeile behaupten.

Ersatz nur für historische unbekannte Alters-/Staffelungsnachweise:

- Fenster plus Vorlauf vollständig; alle Plugs durchgehend erreichbar, Energie/Innen/Außen gültig.
- Quantisierung auf 0,1 K (Decimal half-up), gleiche Wertfolge höchstens 1 800 s.
- Bekannte Sperre/Abwurf/Wartephase → verwerfen.
- Je Heizkörper mindestens fünf volle Stromminuten; bei 60-s-Zeile Strom-/Relaysekunden jeweils 60 und tatsächlich belegter Strom.
- Median Vollstromleistung aus E/dt im Bereich 0,8…1,2·P_ref.
- P_ref unabhängig, keine Ableitung aus genau dem Prüffenster.
- Nicht belegbare Anschlussbelegung kennzeichnen.

Konstanz > 1 800 s bedeutet Ersatz nicht erfüllt, keine Defektdiagnose. Bekannt alte Neudaten dürfen nicht auf Ersatz zurückfallen. Alte Sekunden_strom können bei fehlender Leistung aus dem Relayzustand abgeleitet sein: ohne zusätzlichen Messbeleg kein Thermostatzyklus-/Pulsnachweis.

Ersatz-H höchstens C und mindestens ±50 %. Direkt- und Ersatzschätzer getrennt; ausreichend direkte Evidenz hat Vorrang. Aktive Staffelung ausschließen; Sperrzeit 0 nur bei vollständig belegtem Nachweis.

### 6.4 Tagestraining und Start

Abgeschlossener Tag, kein Notprogramm/offline/unbekannter Betrieb, kein Baseline/Sondereingriff, kein Geräte-/Moduswechsel oder Leistungsengpass. Betrieb/Außen jeweils ≥95 % des Tages, Energie jedes Geräts ≥95 %, Innen bei thermo ≥95 %, gemeinsame R/F-Abdeckung ≥95 %, längste gemeinsame Lücke ≤5 min. Keine Türpause; keine beobachtete Türöffnung >60 s während R. Fehlender Türkontakt ist Unsicherheit, kein erfundenes „zu“.

Nenner aus erwarteten Einsatzdauern. Keine R/F-Exposition → Quote dafür None. Tagesregression verwendet dieselben gemeinsam gültigen Energie-/GDH-Intervalle. Für ihre historische Ersatzqualität müssen Herkunft, Temperaturänderungen und Sperrplausibilität belegt sein; eine lange konstante Nacht allein ist kein Tagesdefektfilter. Ersatz bleibt mindestens beim B-Band ±50 %.

Start: R-Beginn nach ≥30 min ohne R oder Sollerhöhung >1 K. Vorheizen→Arbeitszeit ohne Lücke ist ein Start. T_start = Median der zehn Minuten davor, mindestens acht Minuten frische/belegte Werte. ΔT_start = max(0,Soll−T_start), unbekannt bleibt None. Tages-H nur bei allen bekannten Starts ≤2 K, D_R ≥4 h und GDH_R ≥20 K·h.

Ganze Tage können für Tagestraining ausfallen, während später saubere Fenster desselben Tages nach neuem Vorlauf verwendbar bleiben.

## 7. P3: H und Gegenmodell

### 7.1 Reguläre Fenster und robustes H

- Konvektor: 60 min Vorlauf, dann nicht überlappende 120-min-Blöcke.
- Mindestens ein Ölgerät: 120 min Vorlauf, dann 180-min-Blöcke.
- Anker Episodenbeginn; Moduswechsel, Sollsprung >1 K, Tür-/Sondereingriff/Leistungsbegrenzung beginnt Vorlauf neu.
- Grundwechsel Vorheizen/Arbeit allein unterbricht nicht.
- Keine Lücken/Interpolation; gemeinsame Qualität im Fenster/Vorlauf 100 %.

Fensterkriterien: Sollspanne ≤0,5 K (thermo); Innen-Spanne ≤0,6 K; OLS-Innentrend |slope| ≤0,1 K/h; Differenz erster/letzter 15-min-Innenmittel ≤0,3 K; mittleres Innen−Außen ≥5 K; thermo mindestens 90 % der Zeit |Innen−Soll| ≤0,7 K; elektrische Duty 0,05…0,90; je Heizkörper mindestens drei vollständige belegte Strom-ein/aus-Zyklen. Keine Türöffnung >60 s, Sperrung oder Sonderquelle. Keine H-Schätzung aus scheinbarem Plateau in ununterbrochener Volllast.

X_w = Σ max(0,Innen−Außen)dt; H_w = E_w/X_w. E umfasst das ganze Fenster inklusive Ausphasen.

Je Tag H_d = gewichteter Median(H_w,X_w); Fenster über Mitternacht dem lokalen Datum ihres Mittelpunkts zuordnen. Container-H = ungewichteter Median(H_d).
s_H = 1,4826·Median(|H_d−H|).
Ab fünf Tagen ein Ausreißerdurchlauf: |H_d−H| > max(3·s_H,0,30·H) entfernen, dann neu rechnen. Entfernte Tage/Fenster zählen nicht zur Mindest-Evidenz. Keine iterative Filterung bis das Ergebnis gut aussieht.

C-Evidenz: mindestens zwölf Fenster, drei Tage und 24 h; bei Öl mit zwölf Fenstern mindestens 36 h. Relative Streuung s_H/H ≤0,30.
D-Evidenz: mindestens 30 Fenster, sieben Tage, Streuung ≤0,15 plus unabhängige Validierung gemäß §9.

Band u = max(0,30·H,2·s_H) bei C, max(0,15·H,2·s_H) bei D; Ersatz mindestens max(0,50·H,2·s_H). H_unten = max(0,H−u). Null/negatives H ist kein identifiziertes Wärmeverlustmodell.

Tagesrückfall: mindestens drei geeignete Tage; H_tag = max(0,ΣGDH·E_R/ΣGDH²), Ursprung fest, kein Grundlastfit, Band 0,5…1,5·H_tag. Nur Nullenergie liefert keinen Lernbeweis.
Plan-Duty: mindestens drei saubere Tage; d = ΣE_R/ΣKapazität_R, Band 0…Kapazität, höchstens B.

Regulär/Baseline getrennt. Bei >25 % Unterschied bezogen auf reguläres H kein Pooling: beide Werte behalten, Hinweis betriebsabhaengiges_H, Vergleich höchstens C.

### 7.2 Baseline-Gegenmodell

Lauf bevorzugt 48 h, mindestens 24 h für einen Versuch. Warm-up mindestens zwei Stunden, bei Öl vier Stunden; danach belegtes Plateau. Relay/Freigabe durchgehend, keine Staffelung/Eingriffe, je Gerät sichtbare Thermostatzyklen.

Grundblöcke 120/180 min; bei langsamen Zyklen separat markiert bis sechs Stunden verlängern. Nicht überlappend; frühestes Ende nach Mindestblockdauer mit drei vollständigen Zyklen je Gerät wählen. Stabilitätskriterien aus §7.1 ohne Komfort-Sollnähe. Für Stufe B mindestens drei Stunden je Nachtplateau.

T_max_eff = Median der pro Nacht zeitgewichteten Plateau-Innenmittel; H_ohne robust aus E/Innen-Außen-Integral. Temperaturband mindestens ±1 K, zusätzlich beobachtete Unterschiede; H mindestens ±30 %, Ersatz ±50 %. Nachtplateaus >2 K auseinander → T_max-Konstanz nicht identifiziert.

- B: ein Lauf mit zwei getrennten Nachtplateaus, jeweils mindestens drei Stunden, zusammen mindestens sechs Stunden und Zyklen.
- C: mindestens drei Beobachtungstage, zwei Läufe, zwölf Plateau-Stunden, H-Streuung ≤0,30.
- D: direkte Nachweise, C-Basis plus sieben spätere unabhängige Baseline-Testtage, Außenmittelspanne ≥6 K, WAPE ≤20 %, |Bias| ≤10 %.

Thermostatannahme bleibt sichtbar. Neue Plateau-Abweichungen erzwingen erneute Prüfung. Die Güte validiert den beobachteten Betrieb; sie beweist keine mechanische Thermostatstellung.

Ohne-Verbrauch = Σ min(P,H_ohne·max(0,T_max_eff−Außen))dt über denselben Gegenfaktum-Zeitraum. Thermostat-Max nie pauschal 30 °C. Volllastplateau ohne Thermostatzyklen beweist kein T_max. Keine Übertragung nach Heizkörpertyp.

Ohne Innenfühler erst später: mindestens zehn volle Baseline-Tage, drei Läufe, Außenmittelspanne ≥6 K; davon mindestens fünf Tage mit Duty 0,10…0,90 in zwei deutlich verschiedenen Außenbereichen. Gedeckelter Fit p_hat = clip(a−b·Außen,0,P), b≥0, mit Deckel im Fit. C erst mit späterer unabhängiger Güteprüfung; außerhalb Beobachtungsbereich ±2 K breites Kapazitätsband. Keine bauliche H-/Raum-T_max-Behauptung.

## 8. P4a/P4b: Energie und Dynamik

### 8.1 Wetter, Soll und Plan

Stundenprognose vor Tagesprognose+Tagesgang vor Klima+Tagesgang. Synthetischer Tagesgang: Mittel−3·cos(2π·(lokale Stunde−5)/24), nach realen Dauern auf Tagesmittel zentrieren. Fehlende Stunden einzeln ergänzen. Standard: Außen je UTC-Stundenintervall konstant, Plan an Minuten-/Wechselgrenzen schneiden.

Gleitendes Soll aus bestehenden aussen_mittel()/gleitend() mit Gewichten 1/0,8/0,64, Rückmeldungen und Begrenzungen. Szenariowetter beeinflusst Soll und Heizgrenze.

Feste Bedarfstermine, Feiertage, Absenkung, Vor-/Nachheizen berücksichtigen; spontane Boost-/Hand-/Tasteneingriffe nicht erfinden. Unsicherer Frühstart bleibt markiert.

### 8.2 Stationär

Thermo: E = min(P,H·max(0,Ziel−Außen))dt.
Ziel reguläres Soll oder Frostmitte; keine erlaubte Freigabe →0.
Kapazität = ΣPdt über erlaubte Intervalle, nicht automatisch 24·P.

Nicht kalibrierter Start >2 K oder unbekannter Start nach mindestens 30 min Absenkung/Aus: Mitte als Haltebedarf, Obergrenze der gesamten betroffenen regulären Blockkapazität.
Nicht validierter Frost: Haltemitte, untere Frostgrenze 0, obere Bereitschaftskapazität. Keine pauschalen 5 %.

Planmodus, auch mit vorhandenem Fühler: Gerätethermostat regelt; Komfort-Soll kein Betriebsziel. Ohne T_max-Kalibrierung Duty-Schätzung höchstens B, Band 0…Freigabekapazität. Bei weniger als drei Tagen Mitte None.
Ohne Innenfühler Frost nach vorhandener Außen-Hysterese simulieren; bei unbekanntem Anfangszustand beide Zustände einhüllen. Kein 6-°C-Raumthermostat.

### 8.3 C und tau: separate Erweiterung

H einfrieren. Saubere Starts: gemessener Anstieg ≥2 K, Ende nach erreichtem Soll und stabiler 60-min-Nachphase, bei Öl 120 min. X = Innen-Außen-Integral desselben Start-/Nachlaufintervalls; ΔT = gemessener Ende−Start-Unterschied.
Z = E−H·X; C = max(0,ΣΔT·Z/ΣΔT²).

Mindestens acht Starts/vier Tage, Anstiegsspanne ≥3 K, relative robuste Einzel-C-Streuung ≤0,30. Mehr als 20 % negative Z oder C≤0 → keine Identifikation. H unten/Mitte/oben jeweils mit kompatiblem C fitten, Paare erhalten.

Freigabe erst mit fünf späteren Starts, WAPE ≤25 %, |Bias| ≤15 %; dynamische Temperatur zusätzlich RMSE ≤0,5 K. Energieprüfung allein erlaubt keine Frostsimulation. Öl-Speicherzustand sowie Personen-/Solarwärme bleiben Unsicherheit; frühe unbelegte Starts bevorzugen und Ausschaltpause ≥120 min bei Öl dokumentieren.

Abkühlen: nach Aus 60 min bei Konvektor/120 min bei Öl verwerfen, dann mindestens zwei Stunden ohne messbare Heizenergie, keine Tür-/Sondereingriffe, anfangs Innen−Außen ≥5 K, Innenabnahme ≥1 K, vollständige Qualität. Nullleistungs-RC-Verlauf nichtlinear an gesamte Kurve fitten. Mindestens drei Nächte/sechs Stunden, RMSE ≤0,3 K, relative tau-Streuung ≤0,30. C_abkühl = H·tau nur für kompatibles H. C-Verhältnis >2 oder nicht überlappende Bänder → keine gemeinsame dynamische Freigabe.

RC: T_neu = Außen+p/H+(T_alt−Außen−p/H)·exp(−H·dt/C).
H,C müssen >0 sein; sonst verweigern. E=p·dt.

Geschlossene Aufheizform: T_eq=Außen+P/H;
t_auf=(C/H)ln((T_eq−T_start)/(T_eq−T_ziel)), nur für T_start<T_ziel<T_eq.
E_block=P·min(t_auf,D)+p_halt·max(0,D−t_auf).
Zusatz=(P−p_halt)·min(t_auf,D).
Keine zusätzliche CΔT-Buchung auf vollständige Blockenergie. Bei unerreichbarem Ziel und kaltem Start bis Ende Volllast, Status statt ungültigem Logarithmus.

Für T_start≥T_ziel ist die geschlossene Halteform kein genauer Abkühlverlauf: kein Startaufschlag; in der dynamischen Simulation zunächst abkühlen lassen. Die Formel ist der Test-Spezialfall einer warm werdenden Episode.

Frostzustand aus warmem Abend fortschreiben, echte konfigurierte 5/7-Hysterese benutzen. Zeit bis Frost=(C/H)ln((T_start−Außen)/(5−Außen)) für Außen<5<T_start. Tau allein ist Timing-Kandidat. Frostband erst verengen nach drei echten Frostepisoden an mindestens zwei Nächten, je drei volle Zyklen, WAPE ≤25 %, Temperatur-RMSE ≤0,5 K.

Gegenmodellzustand über Tage fortschreiben; keine täglichen Neustarts mit kalter realer Automatiktemperatur. Beide Modelle bekommen dokumentierte eigene Anfangszustände.

### 8.4 Szenarien und Aggregation

Neun ganze Läufe: Wetterdelta −1,5/0/+1,5 K nur auf Klimakomponenten × drei Parametersätze. Bei Tagesvorhersage+synthetischem Tagesgang kein Klimadelta auf den prognostizierten Tagesmittelwert. Forecastfehler sind damit nicht abgedeckt.

Stationäre Sätze: H unten/Mitte/oben, Frostziel 5/6/7, T_max entsprechend Plateau-Unter/Mitte/Ober; Mit-/Ohne-H getrennt.
Dynamisch kompatible H/C-Paare erhalten. „Höhere Parameter = höhere Energie“ nicht voraussetzen. Keine zusätzlichen unabhängigen H×C-Kombinationen hinter einer Behauptung „neun Läufe“.

Zentrale Mitte aus mittlerem Wetter/Parametersatz. Band min/max der aggregierten ganzen Läufe, erweitert um Strukturgrenzen. Keine stündlichen Minima zu einem fiktiven Winter aufsummieren. Grenzen auf jeder Ausgabeebene aus denselben Lauf-IDs bestimmen.

Gespart pro Lauf=Ohne−Mit.
Strukturband: min_s(L_ohne,s−U_mit,s), max_s(U_ohne,s−L_mit,s).
Kein 90-%-Label, keine pauschale Einsparungsobergrenze, negative Einsparung nicht auf 0 klammern.

Unbekannter Container → gesamte Mitte None. Belegte Teilwerte separat ausgeben und fehlende IDs nennen. Bei vollständig bekannten Kapazitäten bleiben physikalische Gesamtgrenzen möglich. Keine fehlende Mitte als 0 summieren.

Ist-Baseline-/Sonderenergie bleibt auf der Verbrauchsseite. Für diese historischen Intervalle keine als gemessen bezeichnete Automatikersparnis: beide Betriebsarten modellieren und als Modellvergleich ausweisen oder vergleichbar=false/gespart=None. Kalenderperiode/Geräteausstattung identisch halten.

Preisrechnung zeitgenau: ΣE_intervall·Preis_intervall; fehlender Preis →€None. Prozente nur bei vollständigem positivem Ohne-Nenner. Negative Werte zulassen. Normjahr vollständig separat modellieren, kein gemessenes Ist eines anderen Wetters einmischen.

## 9. Stufen und fertige Anzeige

### 9.1 Evidenz ist nicht Prognosefreigabe

Mit A: keine Identifikation; B: mindestens drei saubere Tagesregression-/Duty-Tage; C/D stationär gemäß §7.
D-Validierung: mindestens sieben zeitlich spätere unabhängige Tage, Außenmittelspanne ≥6 K, WAPE ≤20 %, |Bias| ≤10 %. Modell auf Trainingscutoff einfrieren; ΣE_ist=0 → Güte None.

Unbekannter Start/relevanter unvalidierter Frost/Extrapolation → Prognosestufe höchstens C; Plan-Duty höchstens B.
Extrapolation: ΔT außerhalb [0,75·train_min;1,25·train_max] oder Soll mehr als 1 K außerhalb Trainingsbereich. Ersatz höchstens C. Konfigurationswechsel → neues Modell.

Ohne hat eigene Plateau-/Baseline-Evidenz, keine Übernahme von Mit.
Gespart-Stufe = Minimum beider Prognosestufen, zusätzlich Vergleichbarkeit. Nicht vergleichbar → A/kein Vergleichswert.
Baustellengesamtstufe = Minimum aller relevanten Container; viele gute Container verdecken keinen fehlenden.

### 9.2 Texte von der Integration

| Stufe | mit Automatik | ohne Automatik | gespart |
|---|---|---|---|
| A | „Noch nicht schätzbar“; Ist separat, Zukunftswert — | „Vergleich noch nicht möglich“ | „Noch nicht berechenbar“ |
| B | „Vorläufige Schätzung“ | „Erste Vergleichsmessung“, bei Duty „Grobe Schätzung“ | „Vorläufiger Vergleich“, nur bei vollständiger Vergleichbarkeit |
| C | „Aus Messungen geschätzt“ | „Aus Vergleichsmessungen geschätzt“ | „Voraussichtliche Ersparnis“ |
| D | „Im bisherigen Betrieb geprüft“ | „Mit Vergleichsmessungen geprüft“ | „Im bisherigen Bereich geprüft“ |

Zusatztexte nach Flags:

- Haltemitte: „Haltebedarf: Das zusätzliche Aufheizen ist noch nicht bestimmt.“ Wertbezeichnung **Haltebedarf**, nicht Gesamtverbrauch.
- Ersatzdaten: „Ältere Messdaten wurden mit vereinfachten Prüfungen verwendet.“
- Thermostatannahme: „Die unveränderte Thermostatstellung ist angenommen.“
- Duty: „Der Einfluss kälteren Wetters ist noch nicht bestimmt.“
- Frost: „Frostverbrauch noch nicht geprüft.“
- Extrapolation: „Für kältere Bedingungen fehlen noch Messungen.“
- Leistungsgrenze: „Die Heizleistung kann für das gewünschte Soll zu klein sein.“
- Fehlende Modelle: „Für {N} Container fehlt noch eine Schätzung.“

Band: „Möglicher Bereich: {unten}–{oben} kWh“.
A/reines Kapazitätsband: „Technische Grenze: höchstens {oben} kWh; keine Verbrauchsschätzung.“
Keine Aussage „90 % sicher“.

Bei reinen Haltemitten hat der vollständige Ersparniswert keine Punktmitte; dafür gespart.mitte_kwh=None und gespart.mitte_art="keine". Eine gesonderte Diagnose darf heißen: „Modellvergleich des Haltebedarfs“; vollständige gespart-Mitte und Prozent bleiben None. Wenn eine Mitte fehlt, gespart-Mitte und Prozent None. Sonderbetriebshinweis: „Sonderbetrieb und Vergleichsmessungen sind getrennt ausgewiesen.“

Kosten-/Prozentfelder fertig liefern. Frontend zeigt/formatiert, rechnet keine Fachwerte. Legacy separat „Bisherige Schätzung“, nie als V2-Stufe D.

## 10. Testplan und Lieferprüfung

Die numerischen Kataloge der Runden 3/4 stehen vollständig im Anhang. Sie sind Input-/Erwartungsvorgaben; Qualitätsbedingungen gehören zu den Fixtures.

| Testdatei | Lieferung | Fälle |
|---|---|---|
| test_prognose_merkmale.py | P1/P2 | alle Grundwerte; TPI, Absenken, Frostpolitik; Quellen/offline/Sonder/fehlend; Abdeckung/Lücken; Starts; Ersatznachweis |
| test_minute.py erweitern | P1 | Maximalalter, Anforderung/Veto/Vereinigung, unbekannte Teilzeiten, Notprogramm-NULL, Wechselminuten |
| test_prognose_h.py | P3 | Konvektor/Öl, Instationär, Zyklen/Sättigung, Median/MAD/Ausreißer, Tagesregression, Duty/Nullnenner |
| test_prognose_baseline.py | P3/P4a | Plateau/Zyklen, erster Lauf B, Plateau ohne Thermostatschalten, Stellung angenommen, Tagesdauer; später Wetterfit |
| test_prognose_dynamik.py | P4b | C-Bilanz, Aufheiz-/RC-/Unerreichbarkeit, Abkühlen/Frostzeit/Zyklen, fehlende Validierung, ungeeignete Kurven |
| test_prognose_wetter.py | P4a | Soll 21,35 °C, Quellenhierarchie, Tagesgang 23/25 h, szenarioabhängiges Soll/Heizgrenze |
| test_prognose_modell.py | P4a/P4b | Arbeit/kalt/Frost/Startkapazität/Plan, neun Läufe, Einsparung, Teilstunde, Sommerzeit, fehlende Modelle |
| test_prognose_stufe.py | P3/P4a | A–D-Schwellen, Extrapolation, Ersatzcap, Holdout, separate Baseline-Stufe |
| test_prognose_anzeige.py | P4a | Text-/Bandmatrix, Haltebedarf, Annahmen, fehlende Modelle, negative Einsparung, Kosten/Prozent |
| test_prognose_adapter.py | P1–P4a | DB→TypedInput, Snapshotwechsel, gefilterte Berichte, Kern vor/nach, Legacy/V2-Isolation, gemessen_bis |
| test_datenbank*.py erweitern | P1 | SQLite/PostgreSQL-Migration, alte Zeilen NULL, alte Pufferpayloads, Retry, Baseline-JSON |

Zusätzliche verbindliche Regressionen:

1. Fehlendes P_ref → Kapazität None, kein geratener Deckel.
2. Istenergie >P_ref·dt → Ist nicht abschneiden; Referenz/Qualität beanstanden.
3. Klimaszenario verändert auch gleitendes Soll/Heizgrenze.
4. Aggregate: min_iΣE_i, nicht Σmin_iE_i.
5. Fehlender Container kein Gesamtmittel; fehlender Tarif kein €.
6. Konfigurationswechsel trennt Training; Metadaten ändern keine alten Messbelege.
7. Holdout im Training → unabhängig=false, kein D.
8. Grundwechsel nach 30 s ohne Teilenergiebeleg → Trainingsausschluss.
9. Identischer Temperaturbericht erneuert Alter nur bei geprüftem Quellenbericht; Startup-Restore nicht.
10. Ohne-Simulation bewahrt Zustand über Mitternacht; kein tägliches Warm-up.
11. V2-A/None verwendet weder altes Ohne/Mit-Verhältnis noch Tagesschnitt.
12. Shadow-Ausführung liefert keine Schaltbefehle.

Checks passend zur Lieferung gemäß CLAUDE.md. P1-Schema auf beiden Datenbanken; bei Frontendänderung bauen und echtes Master-Mockup aktualisieren. Keine produktive Umschaltung/Baseline-Aktivierung durch diesen Reviewauftrag.

## 11. Aufgelöste Widersprüche

| früher/unklar | verbindliche Auflösung |
|---|---|
| Vorheiz-GDH ersetze Startbedarf | Halten/Startdynamik getrennt; P4a-Strukturband, P4b erst validiert |
| unbekannte historische Frische sperrt alles | R4-Ersatz nur für historische Unbekannte, höchstens C/±50 % |
| heizanforderung_s optional | jetzt verbindliche vierte Spalte |
| Frost-Grundminuten sind Exposition | F über alle Standby-Bereitschaftsminuten, disjunkt zu R |
| Zustand aus bedeutet keine Regelungszeit | Grund/Kontext bestimmt R, TPI-aus bleibt R |
| 24-h-Außenmittel als Verbrauchsprädiktor | bleibt Diagnose/HGT; Energie aus Stundenaußen und Minutenplan |
| nenn_kw() ist unabhängiges P_ref | expliziter Wert/separater Vollstrombeleg; gelerntes Mittel allein ungeeignet |
| Baseline erfüllt dieselbe Fensterzählung | eigene Plateauzählung bis sechs Stunden und eigene B/C/D-Schwellen |
| 48-h-Lauf validiert T_max | zunächst höchstens B nach zwei belegten Nachtplateaus |
| Wochenende beweist unveränderte Thermostate | Betriebsannahme, keine Messung; Freitagverstellung bleibt offen |
| H_mit=H_ohne | getrennt; Abweichung kennzeichnen, nicht nach Gerätetyp übertragen |
| neun Läufe sind 90-%-Konfidenz | Szenarioband plus Strukturgrenzen, keine Wahrscheinlichkeit |
| H/C unabhängig kombinieren | kompatible Paare und ganze Verläufe |
| summierte Stundenminima sind Winterband | Aggregate neu aus denselben ganzen Läufen |
| fehlende Modelle als 0 summieren | None propagiert, Teilwerte separat |
| Ohne täglich mit realem kaltem Zustand starten | eigener Gegenfaktumzustand wird fortgeschrieben |
| Sekunden_strom beweist immer Strom | Bestand kann bei fehlender Leistung Relayzustand verwenden; Messbeleg nötig |
| End-Snapshot gilt für ganze Minute | Ereignisfolge oder Wechselminute nicht trainieren |
| gutes H beweist gute Winterprognose | Evidenz und Prognose separat, Starts/Frost/Extrapolation beachten |
| CΔT auf volle Startenergie addieren | dynamische Blockenergie ersetzt das überlappende stationäre Intervall |

Das konstant 22-°C-Fenster aus dem synthetischen R3-Test ist ein **direkt frisches Fixture**. Als historischer Ersatz würde es wegen Konstanz verworfen. Die H-Testzahl bleibt unverändert.

## 12. Lieferabschluss und Integrationsregeln

P0-Kennzeichnung wie vereinbart. P1 Schema/Erfassung, P2 Merkmale, P3 Evidenzbericht, P4a Schattenmodell. Erst danach Entscheidung über P4b anhand Fenster/Starts/Nächte. P5 Validierung/Anzeige vorbereiten, P6 rücknehmbare Umschaltung. Weitere Optimierungen separat; Lieferlabels ändern keine Freigabeschwellen.

Fachlogik nur in custom_components/baustelle/logik/, jede Regel einmal mit Tests in tests/logik/. Seite zeigt fertige Werte. Auslieferung gebaute frontend/baustelle-panel.js; mockups/glas.html bleibt echte Seite mit Beispieldaten. Pilot geschützt, Stufen einzeln einspielbar, Automatik startet aus, Geräte steuern nur auf Auftrag.

Diese Vorlage ist eine Review-Spezifikation, keine vorgenommene Repo- oder Produktivänderung.

## Anhang A: vollständiger numerischer Katalog aus Runde 3


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


## Anhang B: vollständiger numerischer Katalog aus Runde 4


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


Die Kataloge behalten ihre Zahlen. Die eindeutig festgelegten Qualitätsbedingungen, zusätzliche Typverträge und Auflösungen dieser Bauvorlage gelten für ihre Fixtures. Keine Altdatenqualität allein aus synthetisch konstanten Zahlen ableiten.

## ✅ Einigkeit | ⚠️ Widerspruch | ❓ Rückfragen

✅ **Einigkeit:** Modulschnitt, vier Spalten, typisierte Verträge, getrennte Stufen, Legacy/V2-Isolation und Testplan sind festgelegt.

⚠️ **Widerspruch:** Die aufgelösten Punkte gelten verbindlich; insbesondere Frischeersatz, Baseline-Sonderzählung, Startenergie, End-Snapshot und Nullbehandlung.

❓ **Rückfragen:** Keine grundsätzliche Bauentscheidung offen. Nach P3 brauche ich je Container Direkt-/Ersatzfenster, Verwerfungsgründe, saubere Starts und Abkühlnächte.

**Serie für P1–P4a abschließbar. Eine dynamische Winterprognose bleibt von späterer Evidenz und Validierung abhängig.**

