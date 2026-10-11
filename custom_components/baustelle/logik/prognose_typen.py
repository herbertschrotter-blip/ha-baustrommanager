"""Prognose V2: gemeinsame Typen (Bauplan Hochrechnung §8, Bauvorlage CGR-2026-10-11-hochrechnung r5 §2) – ohne HA-Code.

Lieferung P1 (BSM-033.06): Enums, Modellversion und die Verträge, die Erfassung, Klassifikation und Baseline-Metadaten
brauchen. P2 (BSM-033.07): Minutenqualität, Start-, Tages- und Abkühlmerkmale (§2.4); `GeraetIntervall.typ` additiv
(Konvektor/Öl für den Nachlauf der Abkühlepisoden). P2b: `BetriebsKontext.kontext_nachweis`,
`RekonstruktionsPruefung` (Abnahmeprüfung des rekonstruierten Kontexts). P3 (BSM-033.08): Fenster, H-Evidenz und
-Schätzung, Duty, Gegenmodell „ohne“, Startbilanz, Validierung (§2.4) – mit wenigen additiven Diagnosefeldern (Vorgabe
gesetzt). P4a (BSM-033.09): Wetter, Plan, Anfangszustand, Preise, Auftrag (§2.3), Parameter, Szenarien,
Energie je Intervall, Zeitraum-, Vergleichs-, Stufen- und Anzeigeergebnis (§2.4); additiv `IstIntervall` (gemessene
Energie je Container und Intervall für die Aggregation). Spätere Lieferungen ergänzen hier additiv (öffentliche Importadresse bleibt dieses Modul).

Konventionen (§2.1): Zeiten timezone-aware UTC, halboffene Intervalle [von, bis); `None` = unbekannt, nie gleich 0;
Sequenzen als Tupel; alle Datenklassen unveränderlich.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime
from typing import Literal

from .arbeitszeit import Arbeitszeit, Ausnahme, HeizRegeln, Plan, WarmAb, WetterTag
from .soll import GleitRegeln

MODELL_VERSION = "prognose-v2.1"

Betriebsart = Literal["REGULAER", "FROST", "BASELINE", "SONSTIGE"]
Regelungsart = Literal["thermo", "plan", "aus", "unbekannt"]
Nachweis = Literal["direkt", "rekonstruiert", "ersatz", "keiner"]
Stufe = Literal["A", "B", "C", "D"]
WetterQuelle = Literal["vorhersage_stunde", "vorhersage_tag", "klima", "gemessen_tag"]   # P4a additiv: gemessenes Tagesmittel
MitteArt = Literal["verbrauch", "haltebedarf", "duty", "keine"]
ThermostatNachweis = Literal["angenommen", "bestaetigt", "unbekannt", "geaendert"]
Thermostatstellung = Literal["max", "andere", "unbekannt"]
Gruende = tuple[str, ...]   # stabile Fehler-/Unsicherheitscodes, keine freien Texte

THERMOSTAT_NACHWEISE: tuple[ThermostatNachweis, ...] = ("angenommen", "bestaetigt", "unbekannt", "geaendert")
THERMOSTATSTELLUNGEN: tuple[Thermostatstellung, ...] = ("max", "andere", "unbekannt")


@dataclass(frozen=True)
class Intervall:
    von: datetime
    bis: datetime


@dataclass(frozen=True)
class ModellKontext:
    """Identität eines Ergebnisses, auch bei leerer Eingabe (§3)."""

    bereich_id: str
    konfiguration_id: str
    training_bis: datetime


@dataclass(frozen=True)
class Leistungsreferenz:
    """Unabhängige Leistung eines Heizkörpers – nie aus dem gerade geprüften Fenster gelernt."""

    kw: float
    quelle: Literal["geraet_einstellung", "separater_vollstrom"]
    gueltig_ab: datetime
    beleg_id: str


@dataclass(frozen=True)
class GeraetIntervall:
    zeit: Intervall
    geraet_id: str
    energie_wh: float | None
    energie_gueltig: bool
    sekunden_ein: float | None
    sekunden_strom: float | None
    strom_belegt: bool
    leistung_w: float | None
    leistung_w_max: float | None
    erreichbar: bool | None
    heizanforderung_s: float | None   # P1: Einschaltanforderung vor der Staffelung
    staffel_gesperrt_s: float | None  # P1: angefordert, aber von der Staffelung nicht freigegeben
    p_ref: Leistungsreferenz | None
    quelle: str
    typ: str | None = None            # P2: Heizkörper-Typ (oelradiator | konvektor) zum Zeitpunkt; None = unbekannt


@dataclass(frozen=True)
class BetriebsKontext:
    konfiguration_id: str
    regelungsart: Regelungsart
    regulaer_freigegeben: bool | None
    frost_bereit: bool | None
    frost_grenze_c: float
    frost_aus_c: float
    frost_aussen_c: float | None
    baseline_lauf_id: str | None
    tuer_beobachtet: bool
    kontext_belegt: bool
    wechsel_im_intervall: bool
    staffel_rekonstruiert_frei: bool | None
    anschlussbelegung_belegt: bool
    sperrereignis: bool
    sonstige_eingriffe: Gruende
    kontext_nachweis: Nachweis        # P2b: "direkt" (Ereignis prognose_kontext) | "rekonstruiert" (Altdaten) | "keiner"


@dataclass(frozen=True)
class BereichIntervall:
    zeit: Intervall
    bereich_id: str
    zeile_vorhanden: bool
    grund: str | None
    zustand: str | None
    quelle: str | None
    innen_c: float | None
    innen_gueltig: bool
    temp_alter_s: int | None          # P1: höchstes Alter des benutzten Innenwerts im Intervall
    altersnachweis_alt: bool
    soll_c: float | None
    aussen_c: float | None
    aussen_gueltig: bool
    aussen_frisch: bool | None
    tuer_offen_s: float | None
    staffel_begrenzt_s: float | None  # P1: Vereinigung der Sperrzeiten der Geräte
    kontext: BetriebsKontext
    geraete: tuple[GeraetIntervall, ...]


@dataclass(frozen=True)
class Klassifikation:
    art: Betriebsart
    betrieb_gueltig: bool
    gruende: Gruende


@dataclass(frozen=True)
class BaselineMetadaten:
    lauf_id: str
    bereich_id: str
    zeit: Intervall
    status: str
    thermostat_unveraendert: ThermostatNachweis
    thermostatstellung: Thermostatstellung
    annahme_am: datetime | None
    konfiguration_id: str
    p_ref_belege: tuple[str, ...]


@dataclass(frozen=True)
class MinutenQualitaet:
    """Qualität einer Minute (`pruefe_minuten`) bzw. eines Fensters samt Vorlauf (`frische_ersatz`)."""

    energie_je_geraet_gueltig: tuple[tuple[str, bool], ...]
    innen_gueltig: bool
    aussen_gueltig: bool
    betrieb_gueltig: bool
    frische: Nachweis
    staffel: Nachweis
    trainingsfaehig: bool
    gruende: Gruende


@dataclass(frozen=True)
class StartMerkmal:
    episode_id: str
    beginn: datetime
    soll_c: float
    innen_start_c: float | None
    delta_start_k: float | None
    konfiguration_id: str
    gruende: Gruende


@dataclass(frozen=True)
class TagesMerkmale:
    datum: date
    bereich_id: str
    konfiguration_id: str
    dauer_h: float
    ist_belegt_kwh: float
    ist_vollstaendig: bool
    energie_arten_kwh: tuple[tuple[Betriebsart, float], ...]
    regulaer_joint_kwh: float
    gdh_aktiv_kh: float
    gdh_frost_kh: float
    gdh_innen_kh: float
    aktiv_h: float
    frost_h: float
    plan_h: float
    kapazitaet_regulaer_kwh: float | None
    aussen_mittel_c: float | None
    q_energie_je_geraet: tuple[tuple[str, float], ...]
    q_betrieb: float
    q_innen: float
    q_aussen: float
    q_joint_r: float | None
    q_joint_f: float | None
    laengste_joint_luecke_s: float
    starts: tuple[StartMerkmal, ...]
    training_thermo: bool
    training_plan: bool
    gruende: Gruende


@dataclass(frozen=True)
class AbkuehlEpisode:
    zeit: Intervall
    bereich_id: str
    konfiguration_id: str
    minuten: tuple[BereichIntervall, ...]
    innen_start_c: float
    innen_ende_c: float
    gruende: Gruende


@dataclass(frozen=True)
class RekonstruktionsPruefung:
    """P2b: rekonstruierter gegen echten Kontext (Ereignis) je Minute – Regelungsart und Konfigurations-ID."""

    bereich_id: str
    verglichen: int
    treffer: int
    quote: float | None
    freigegeben: bool
    abweichungen: tuple[tuple[datetime, str, str], ...]   # (Zeit, echt, rekonstruiert) als "art/konfiguration"
    gruende: Gruende


# ---------------------------------------------------------------------- P3 (BSM-033.08, Bauvorlage §2.4, §7)
@dataclass(frozen=True)
class Fenster:
    """Stationäres Fenster (regulär) bzw. Baseline-Plateau – gültig oder verworfen (Gründe als Codes).

    Abweichend von §2.4: `p_max_kw` None, wenn eine Leistungsreferenz fehlt (nie 0 erfunden); additiv `soll_mittel_c`
    (Sollbereich der Evidenz), `qualitaet` (Qualität samt Vorlauf – Stufe und Mindestband nur über `stufe_hoechstens`
    und `band_min_rel`), `lauf_id` (Plateau: Baseline-Lauf).
    """

    zeit: Intervall
    bereich_id: str
    konfiguration_id: str
    art: Literal["regulaer", "baseline"]
    energie_kwh: float
    x_innen_kh: float
    innen_mittel_c: float
    aussen_mittel_c: float
    p_max_kw: float | None
    zyklen_je_geraet: tuple[tuple[str, int], ...]
    frische: Nachweis
    staffel: Nachweis
    gueltig: bool
    gruende: Gruende
    soll_mittel_c: float | None = None
    qualitaet: MinutenQualitaet | None = None
    lauf_id: str | None = None


@dataclass(frozen=True)
class HEvidenz:
    """Evidenz einer H-Schätzung; additiv `stufe_hoechstens` (aus der Qualität der benutzten Fenster)."""

    fenster: int
    tage: int
    stunden: float
    mad_kw_k: float | None
    streuung_rel: float | None
    delta_t_min_k: float | None
    delta_t_max_k: float | None
    aussen_min_c: float | None
    aussen_max_c: float | None
    soll_min_c: float | None
    soll_max_c: float | None
    ersatzfenster: int
    verworfen: int
    gruende: Gruende
    stufe_hoechstens: Stufe = "D"


@dataclass(frozen=True)
class HSchaetzung:
    """H je Container und Konfiguration; additiv `tage` = (Datum, H_d) der benutzten Tage (Diagnose)."""

    bereich_id: str
    konfiguration_id: str
    modell_version: str
    training_bis: datetime
    methode: Literal["stationaer", "tagesregression", "keine"]
    h_kw_k: float | None
    h_unten_kw_k: float | None
    h_oben_kw_k: float | None
    evidenz: HEvidenz
    tage: tuple[tuple[date, float], ...] = ()


@dataclass(frozen=True)
class DutySchaetzung:
    bereich_id: str
    konfiguration_id: str
    duty: float | None
    tage: int
    kapazitaet_training_kwh: float
    energie_training_kwh: float
    gruende: Gruende


@dataclass(frozen=True)
class ValidierungsPunkt:
    zeit: Intervall
    energie_ist_kwh: float | None
    energie_modell_kwh: float | None
    innen_ist_c: float | None
    innen_modell_c: float | None
    aussen_c: float
    gueltig: bool
    konfiguration_id: str


@dataclass(frozen=True)
class Validierung:
    modell_id: str
    training_bis: datetime
    test_von: datetime
    test_bis: datetime
    tage: int
    episoden: int
    aussen_spanne_k: float
    energie_ist_kwh: float
    wape: float | None
    bias_rel: float | None
    temperatur_rmse_k: float | None
    unabhaengig: bool


@dataclass(frozen=True)
class OhneSchaetzung:
    bereich_id: str
    konfiguration_id: str
    methode: Literal["plateau", "elektrischer_wetterfit", "duty", "keine"]
    h: HSchaetzung | None
    t_max_c: float | None
    t_max_unten_c: float | None
    t_max_oben_c: float | None
    duty: DutySchaetzung | None
    a_kw: float | None
    b_kw_k: float | None
    laeufe: int
    beobachtungstage: int
    plateau_h: float
    thermostat_nachweis: ThermostatNachweis
    guete: Validierung | None
    gruende: Gruende
    naechte_b: int = 0   # additiv: höchste Zahl Nächte ≥ `baseline_b_nacht_min_h` innerhalb EINES Laufs (Stufe B)


@dataclass(frozen=True)
class StartBilanz:
    """Energiebilanz eines Starts bis zum erreichten Soll samt stabiler Nachphase (§8.3) – in P3 nur Diagnose."""

    start: StartMerkmal
    zeit: Intervall
    delta_innen_k: float
    x_innen_kh: float
    energie_kwh: float
    qualitaet: MinutenQualitaet


# ---------------------------------------------------------------------- P4a (BSM-033.09, Bauvorlage §2.3, §2.4, §8)
@dataclass(frozen=True)
class WetterIntervall:
    zeit: Intervall
    aussen_c: float
    quelle: WetterQuelle
    synthetischer_tagesgang: bool


@dataclass(frozen=True)
class WetterEingabe:
    """Stundenvorhersage, Tagesmittel der Vorhersage, 12 Klimamonatsmittel und gemessene Tagesmittel (Vortage)."""

    stunden: tuple[WetterIntervall, ...]
    tagesmittel: tuple[tuple[date, float], ...]
    klima_monate: tuple[float, ...]
    bekannte_vortage: tuple[tuple[date, float], ...]


HeizgrenzeBasis = Literal["tageshoechst", "jetzt"]   # Werte der Einstellung `heizung.heizgrenze_basis`
FreiModus = Literal["frost", "absenk", "aus"]


@dataclass(frozen=True)
class PlanTag:
    """Rohdaten eines Plantags je Container (§2.3); `planen()` erzeugt den Plan je Szenario neu mit `tagesplan()`.

    Abweichend/additiv: `heizgrenze_basis` mit den Werten der Einstellung („jetzt“ statt „aktuell“); `soll_fest_c` (Soll
    ohne Gleiten, dann `gleitregeln` None), `soll_versatz_k` (eigenes Soll des Containers gegenüber dem der Baustelle bei
    gleitendem Soll), `modus` (Modus der Heizung des Containers: thermo/plan/bedarf/hand/aus), `fuehler`,
    `tuer_pause_min` (Reihenfolge der Regelung), `tageshoechst_c` (bekannter Höchstwert; sonst aus der Szenarioreihe).
    """

    datum: date
    bereich_id: str
    konfiguration_id: str
    plan: Plan | None
    arbeitszeiten: tuple[Arbeitszeit, ...]
    ausnahmen: tuple[Ausnahme, ...]
    frei: bool
    heizregeln: HeizRegeln
    warm_ab: WarmAb | None
    trocknen: bool
    plan_wetter: WetterTag
    plan_wetterquelle: WetterQuelle
    heizgrenze_c: float
    heizgrenze_basis: HeizgrenzeBasis
    auto: bool
    bedarfscontainer: bool
    regelungsart: Regelungsart
    gleitregeln: GleitRegeln | None
    rueckmeldungen: tuple[tuple[float, int], ...]
    absenk_soll_c: float | None
    frost_grenze_c: float
    frost_aus_c: float
    frost_aussen_c: float | None
    frost_erlaubt: bool
    frei_modus: FreiModus
    feste_bedarfsfenster: tuple[Intervall, ...]
    p_ref: tuple[Leistungsreferenz | None, ...]
    fruehstart_unsicher: bool
    kontext_belegt: bool
    soll_fest_c: float | None = None
    soll_versatz_k: float = 0.0
    modus: str = "thermo"
    fuehler: bool = True
    tuer_pause_min: int = 3
    tageshoechst_c: float | None = None   # bekannter Tageshöchstwert (Vorhersage/gemessen) wie in der Regelung


@dataclass(frozen=True)
class PlanIntervall:
    """Geplantes Intervall eines Containers (§2.3). `startdefizit_k` None = unbekannt (Start in der Zukunft).

    Additiv: `grund` (Soll-Grund der Regelung), Frostpolitik des Tages (`frost_grenze_c`, `frost_aus_c`, `frost_aussen_c`)
    und `fuehler` (ohne Fühler Frost nach der Außen-Hysterese)."""

    zeit: Intervall
    bereich_id: str
    konfiguration_id: str
    regelungsart: Regelungsart
    regulaer_freigegeben: bool
    frost_bereit: bool
    ziel_c: float | None
    aussen_c: float
    wetterquelle: WetterQuelle
    p_max_kw: float | None
    episode_id: str | None
    startdefizit_k: float | None
    gruende: Gruende
    grund: str | None = None
    frost_grenze_c: float | None = None
    frost_aus_c: float | None = None
    frost_aussen_c: float | None = None
    fuehler: bool = True


@dataclass(frozen=True)
class Anfangszustand:
    zeit: datetime
    innen_c: float | None
    frost_ein: bool | None
    thermostat_ein: bool | None
    beleg: Literal["gemessen", "modelliert", "unbekannt"]


@dataclass(frozen=True)
class PreisIntervall:
    zeit: Intervall
    eur_kwh: float


@dataclass(frozen=True)
class IstIntervall:
    """Gemessene Energie eines Containers in einem Intervall (additiv zu §3: die Aggregation bekommt Stunden-/Tagessummen
    statt Minuten). `kwh` None = Messlücke; `baseline_kwh` = Anteil aus Baseline-Läufen; `sonder_kwh` None = unbekannt."""

    zeit: Intervall
    bereich_id: str
    kwh: float | None
    baseline_kwh: float = 0.0
    sonder_kwh: float | None = None


@dataclass(frozen=True)
class PrognoseAuftrag:
    zeitraum: Intervall
    zeitzone: str
    bereich_ids: tuple[str, ...]
    historische_minuten: tuple[BereichIntervall, ...]
    baseline_laeufe: tuple[BaselineMetadaten, ...]
    plantage: tuple[PlanTag, ...]
    wetter: WetterEingabe
    preise: tuple[PreisIntervall, ...]
    gemessen_bis: datetime
    anfang_mit: tuple[tuple[str, Anfangszustand], ...]
    anfang_ohne: tuple[tuple[str, Anfangszustand], ...]


@dataclass(frozen=True)
class DynamikParameter:
    """Kompatibles H/C-Paar (P4b); in P4a nur als Feld von `ParameterSatz` (immer None)."""

    h_kw_k: float
    c_kwh_k: float | None
    tau_h: float | None


@dataclass(frozen=True)
class ParameterSatz:
    index: int
    h_mit_kw_k: float | None
    h_ohne_kw_k: float | None
    t_max_c: float | None
    frost_ziel_c: float
    dynamik_mit: DynamikParameter | None
    dynamik_ohne: DynamikParameter | None


@dataclass(frozen=True)
class Szenario:
    id: str
    wetter_delta_k: float
    parameter: ParameterSatz


@dataclass(frozen=True)
class StufenErgebnis:
    evidenz: Stufe
    prognose: Stufe
    methode: str
    extrapolation: bool
    gruende: Gruende


@dataclass(frozen=True)
class EnergieIntervall:
    zeit: Intervall
    bereich_id: str
    mitte_kwh: float | None
    unten_kwh: float | None
    oben_kwh: float | None
    haltebedarf_kwh: float | None
    kapazitaet_kwh: float | None
    mitte_art: MitteArt
    stufe: StufenErgebnis
    gruende: Gruende


@dataclass(frozen=True)
class SzenarioLauf:
    szenario_id: str
    mit: tuple[EnergieIntervall, ...]
    ohne: tuple[EnergieIntervall, ...]


@dataclass(frozen=True)
class ZeitraumErgebnis:
    """Additiv: `teil_mitte_kwh` = Summe der Container mit bekannter Mitte (fehlende in `fehlende_bereiche`)."""

    zeit: Intervall
    mitte_kwh: float | None
    unten_kwh: float | None
    oben_kwh: float | None
    ist_belegt_kwh: float | None
    ist_vollstaendig: bool
    fehlende_bereiche: tuple[str, ...]
    mitte_art: MitteArt
    stufe: StufenErgebnis
    gruende: Gruende
    teil_mitte_kwh: float | None = None


@dataclass(frozen=True)
class VergleichErgebnis:
    zeit: Intervall
    mit: ZeitraumErgebnis
    ohne: ZeitraumErgebnis
    gespart: ZeitraumErgebnis
    gespart_prozent: float | None
    ist_sonderbetrieb_kwh: float
    ist_baseline_kwh: float
    vergleichbar: bool
    gruende: Gruende


@dataclass(frozen=True)
class AnzeigeWert:
    wert_kwh: float | None
    unten_kwh: float | None
    oben_kwh: float | None
    eur: float | None
    unten_eur: float | None
    oben_eur: float | None
    status_text: str
    wert_text: str
    band_text: str | None
    hinweise: tuple[str, ...]
    stufe: Stufe
    mitte_art: MitteArt


@dataclass(frozen=True)
class AnzeigeVergleich:
    mit: AnzeigeWert
    ohne: AnzeigeWert
    gespart: AnzeigeWert
    gespart_prozent: float | None
    vergleichshinweis: str | None
    modell_version: str
    gemessen_bis: datetime
    aktualisiert_am: datetime
