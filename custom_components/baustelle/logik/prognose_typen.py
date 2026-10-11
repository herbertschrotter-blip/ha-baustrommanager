"""Prognose V2: gemeinsame Typen (Bauplan Hochrechnung §8, Bauvorlage CGR-2026-10-11-hochrechnung r5 §2) – ohne HA-Code.

Lieferung P1 (BSM-033.06): Enums, Modellversion und die Verträge, die Erfassung, Klassifikation und Baseline-Metadaten
brauchen. P2 (BSM-033.07): Minutenqualität, Start-, Tages- und Abkühlmerkmale (§2.4); `GeraetIntervall.typ` additiv
(Konvektor/Öl für den Nachlauf der Abkühlepisoden). P2b: `BetriebsKontext.kontext_nachweis`,
`RekonstruktionsPruefung` (Abnahmeprüfung des rekonstruierten Kontexts). Spätere Lieferungen ergänzen hier additiv (öffentliche
Importadresse bleibt dieses Modul).

Konventionen (§2.1): Zeiten timezone-aware UTC, halboffene Intervalle [von, bis); `None` = unbekannt, nie gleich 0;
Sequenzen als Tupel; alle Datenklassen unveränderlich.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime
from typing import Literal

MODELL_VERSION = "prognose-v2.1"

Betriebsart = Literal["REGULAER", "FROST", "BASELINE", "SONSTIGE"]
Regelungsart = Literal["thermo", "plan", "aus", "unbekannt"]
Nachweis = Literal["direkt", "rekonstruiert", "ersatz", "keiner"]
Stufe = Literal["A", "B", "C", "D"]
WetterQuelle = Literal["vorhersage_stunde", "vorhersage_tag", "klima"]
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
