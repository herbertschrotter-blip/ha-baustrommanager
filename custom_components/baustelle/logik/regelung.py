"""Soll-Zustand je Container – reine Fachlogik ohne Home-Assistant-Code.

Bauplan 0.7 Abschnitt 2.2. Reihenfolge (fachlich festgelegt):
Automatik aus → Frostschutz → Tür offen → Container-Automatik aus (Hand) → Taste am Plug (BSM-018) → Boost → Modus „aus“ → Bedarfs-Container →
frei (Urlaub/Feiertag: nur Frostschutz, absenken oder alles aus) → Heizgrenze → Plan-Fenster (Thermostat bzw. ein) →
außerhalb.

Entscheidungen, wo der Bauplan offen ist (im Sinne des Mockups):
- Frostschutz hält „bis +2 °C“: ein unter `frost_grenze`, weiter ein bis `frost_grenze + 2`, wenn er schon
  eingeschaltet hatte. Dafür gibt es das Zusatzfeld `frost_vorher` (Standard False) in `LageContainer`.
- Tür: pausiert, sobald sie `tuer_pause_min` offen ist (Mockup „Heizung pausieren nach 3 min“), also ab `>=`.
- Boost mit Fühler: ein, solange unter Soll; ist das Soll erreicht, gilt die normale Regel (der Aufrufer beendet den
  Boost). Ohne Fühler: ein, solange `boost` wahr ist (der Aufrufer setzt es nach `boost_min` zurück).
- Bedarf aktiv: mit Fühler regelt der Thermostat (Hysterese `toleranz`) auf das Soll, ohne Fühler ein; Grund bleibt
  „bedarf“. Bedarf geht wie im Bauplan vor frei und Heizgrenze (ausdrücklich angefordert).
- Im Plan-Fenster ist der Grund der Abschnitt (`fruehstart`, `vorheizen`, `arbeitszeit`, `nachheizen`, `trocknen`),
  auch wenn der Thermostat gerade ausschaltet.

Aus 0.6.3 zurück (Herbert 30.09.2026, Mockup glas.html):
- Modus je Container (`modus`): `thermo` regelt mit Fühler auf das Soll, `plan` lässt die Heizung in der Heizzeit an
  (der Thermostat am Heizkörper regelt), `aus` heizt nur im Frostschutz; Hand und Bei Bedarf bleiben `auto`/`bedarf`.
- Frostschutz ein unter `frost_grenze`, aus erst über `frost_aus` (ohne Wert: Grenze + 2 °C).
- Frostschutz auch bei ausgeschalteter Automatik (`frost_immer`, Schalter startet aus – Herbert 30.09.2026): dann
  schaltet nur der Frostschutz ein und nach dem Frost einmal aus; sonst bleibt bei Automatik aus alles, wie es ist.
- Urlaub und freie Feiertage (`frei`): `frei_modus` `frost` (nur Frostschutz), `absenk` (mit Fühler auf `absenk`, ohne
  Fühler nur Frostschutz) oder `aus` (alles aus, auch kein Frostschutz).

Aus den Szenarien (Herbert 01.10.2026):
- Fühler weg (oder beim Start kurz unbekannt): `FUEHLER_HALTEN_MIN` gilt der letzte Wert (`letzter_wert`), danach wie
  ohne Fühler (in der Heizzeit an, der Heizkörperthermostat regelt). Außentemperatur weg: `AUSSEN_HALTEN_MIN`.
- Frostschutz ohne Fühler nach der Außentemperatur: ein unter `frost_aussen`, aus ab `frost_aussen + FROST_SPANNE`.
- Tür offen pausiert nur, wenn sonst geheizt würde oder gerade ein Heizkörper läuft (auch von Hand); sonst ist es ein
  Hinweis (der Grund bleibt der eigentliche).
"""

from __future__ import annotations

from collections.abc import Mapping
from dataclasses import dataclass
from datetime import datetime
from enum import StrEnum
from typing import Any

from .arbeitszeit import Plan
from .lernen import Tpi, tpi_anteil, tpi_ein

FROST_SPANNE = 2.0
MODI = ("plan", "thermo", "bedarf", "hand", "aus")   # Modus je Container (neu 0.7.8), wie funktionen/heizung/typen.MODI
FUEHLER_HALTEN_MIN = 15
AUSSEN_HALTEN_MIN = 360


def modus_von(einstellung: Mapping[str, Any] | None, fuehler: bool) -> str | None:
    """Modus eines Containers aus seiner Einstellung: gesetzt, sonst aus `bedarf`, `auto` und dem Fühler abgeleitet
    (bedarf → „bedarf“, nicht auto → „hand“, sonst thermo mit Fühler, plan ohne). None, wenn nichts davon belegt ist."""
    if einstellung is None:
        return None
    if einstellung.get("modus") in MODI:
        return str(einstellung["modus"])
    if "bedarf" not in einstellung and "auto" not in einstellung:
        return None
    if einstellung.get("bedarf"):
        return "bedarf"
    if not einstellung.get("auto", True):   # wie bisher `not e["auto"]`: auch None/0 heißt Hand
        return "hand"
    return "thermo" if fuehler else "plan"


def heizgrenze_bezug(basis: str, tageshoechst: float | None, aktuell: float | None) -> float | None:
    """Bezugswert der Heizgrenze nach der Einstellung `heizgrenze_basis`: Tageshöchstwert (`tageshoechst`) oder der Wert
    von jetzt (jede andere Basis, Einstellung „jetzt“). Regelung und Prognose V2 nutzen dieselbe Regel (BSM-033.09)."""
    return tageshoechst if basis == "tageshoechst" else aktuell


def zu_warm(basis: str, tageshoechst: float | None, aktuell: float | None, grenze: float) -> bool:
    """Heizgrenze überschritten: Bezugswert (`heizgrenze_bezug`) über der Grenze; ohne Bezugswert nie."""
    wert = heizgrenze_bezug(basis, tageshoechst, aktuell)
    return wert is not None and wert > grenze


def letzter_wert(aktuell: float | None, zuletzt: tuple[datetime, float] | None, jetzt: datetime, halten_min: float) -> float | None:
    """Messwert mit Überbrückung: fehlt er, gilt der letzte gültige bis `halten_min` Minuten lang."""
    if aktuell is not None:
        return aktuell
    if zuletzt is not None and 0 <= (jetzt - zuletzt[0]).total_seconds() / 60 <= halten_min:
        return zuletzt[1]
    return None


class SollGrund(StrEnum):
    """Warum ein Container heizen soll oder nicht."""

    AUTOMATIK_AUS = "automatik_aus"
    FROST = "frost"
    TUER_OFFEN = "tuer_offen"
    HAND = "hand"
    BOOST = "boost"
    TASTE = "taste"
    BEDARF = "bedarf"
    BEREIT = "bereit"
    FREI = "frei"
    HEIZGRENZE = "heizgrenze"
    FRUEHSTART = "fruehstart"
    VORHEIZEN = "vorheizen"
    ARBEITSZEIT = "arbeitszeit"
    NACHHEIZEN = "nachheizen"
    TROCKNEN = "trocknen"
    AUSSERHALB = "ausserhalb"
    AUS = "aus"
    ABSENKEN = "absenken"
    BASELINE = "baseline"   # BSM-033.04: Baseline-Lauf – alle Heizkörper ohne Automatik am Strom
    STOERUNG = "stoerung"   # Audit 0.8.165: Berechnung des Containers gescheitert – nur Frostschutz (`notsoll`)


@dataclass(frozen=True)
class LageContainer:
    """Alles, was für die Entscheidung eines Containers zur Minute `minute` gilt.

    `zu_warm`: Heizgrenze laut Wetter überschritten. `frei`: Ausnahme frei, Feiertag oder Urlaub.
    `tuer_offen_min`: wie lange die Tür offen ist (None = zu oder kein Kontakt).
    `bedarf`: Bedarfs-Container; `bedarf_aktiv`: Schalter oder Termin (mit Vorheizen) läuft gerade.
    `heizt_gerade`: war zuletzt ein (für die Hysterese). `frost_vorher`: war zuletzt wegen Frost ein.
    """

    minute: int
    plan: Plan | None
    automatik: bool
    auto: bool
    temperatur: float | None
    soll: float
    frost: bool
    frost_grenze: float
    zu_warm: bool
    frei: bool
    tuer_offen_min: float | None
    bedarf: bool
    bedarf_aktiv: bool
    boost: bool
    heizt_gerade: bool
    toleranz: float = 0.3
    frost_vorher: bool = False
    modus: str = "thermo"
    frost_aus: float | None = None
    frei_modus: str = "frost"
    absenk: float = 10.0
    frost_immer: bool = False
    tpi: Tpi | None = None      # lernende Regelung (0.8): statt Hysterese TPI mit gelerntem Nachlauf
    laeuft_gerade: bool = False         # ein Heizkörper läuft gerade, auch von Hand (Tür pausiert dann)
    tuer_vorher: bool = False           # war zuletzt wegen offener Tür pausiert (die Pause hält, bis die Tür zu ist)
    aussen: float | None = None         # Außentemperatur (Frostschutz ohne Fühler)
    frost_aussen: float | None = None   # ohne Fühler: Frostschutz ein unter dieser Außentemperatur (None = aus)
    taste: bool = False                 # BSM-018: Taste am Plug gedrückt – 1 h heizen (wie Bei Bedarf, in jedem Modus)
    baseline: bool = False              # BSM-033.04: Baseline-Lauf – durchgehend an, der Thermostat am Gerät regelt


@dataclass(frozen=True)
class Soll:
    """Soll-Zustand eines Containers; `ein` ist None, wenn nicht geschaltet werden soll."""

    ein: bool | None
    grund: str


def thermostat(temperatur: float, soll: float, toleranz: float, war_ein: bool) -> bool:
    """Wie der Helfer „Generischer Thermostat“: ein ab `soll − toleranz`, aus ab `soll + toleranz`.

    Die Schwellen werden auf 0,001 °C gerundet, damit z. B. 19,9 − 0,3 genau 19,6 ergibt und nicht 19,5999….
    """
    if war_ein:
        return temperatur < round(soll + toleranz, 3)
    return temperatur <= round(soll - toleranz, 3)


def frost_aus_wert(grenze: float, aus: float | None) -> float:
    """Ab dieser Temperatur hört der Frostschutz auf: `aus`, wenn er über der Grenze liegt, sonst Grenze + 2 °C."""
    if aus is not None and aus > grenze:
        return aus
    return grenze + FROST_SPANNE


def frost_aus(lage: LageContainer) -> float:
    return frost_aus_wert(lage.frost_grenze, lage.frost_aus)


def frostschutz(lage: LageContainer) -> bool:
    """Frostschutz: ein unter der Grenze, aus erst ab `frost_aus`; im Urlaub mit „alles aus“ gar nicht."""
    if not lage.frost or (lage.frei and lage.frei_modus == "aus"):
        return False
    if lage.temperatur is None:   # ohne Fühler: nach der Außentemperatur
        if lage.frost_aussen is None or lage.aussen is None:
            return False
        grenze = lage.frost_aussen + (FROST_SPANNE if lage.frost_vorher else 0.0)
        return lage.aussen < grenze
    if lage.frost_vorher:
        return lage.temperatur < round(frost_aus(lage), 3)
    return lage.temperatur < lage.frost_grenze


def _regeln(lage: LageContainer, soll: float) -> bool:
    """Auf `soll` regeln: lernend nach TPI (logik/lernen), sonst Hysterese wie der Generische Thermostat."""
    assert lage.temperatur is not None
    if lage.tpi is not None:
        return tpi_ein(tpi_anteil(lage.temperatur, soll, lage.tpi), lage.tpi.minute_im_zyklus, lage.heizt_gerade)
    return thermostat(lage.temperatur, soll, lage.toleranz, lage.heizt_gerade)


def _heizen(lage: LageContainer) -> bool:
    """Mit Fühler Thermostat, ohne Fühler (oder im Modus Zeitplan) einfach ein."""
    if lage.temperatur is None or lage.modus == "plan":
        return True
    return _regeln(lage, lage.soll)


# nach der Nachricht „seit … h auf Hand“ (bei `hand_h`) so lange auf eine Antwort warten, dann übernimmt die Automatik
HAND_NACHFRIST_MIN = 30


class HandEnde(StrEnum):
    """Warum ein Heizkörper aus dem Handbetrieb an die Automatik zurückgeht (FE-0004)."""

    VORRANG = "vorrang"          # Frostschutz oder Tür offen
    SOLL = "soll"                # mit Fühler: Soll erreicht (Hand-Ein)
    DAUER = "dauer"              # Höchstdauer (`hand_h` + Nachfrist) ohne „So lassen“
    SCHALTPUNKT = "schaltpunkt"  # die Automatik würde jetzt anders schalten als beim Start der Hand


def hand_ende(
    *, grund: SollGrund | str, phase_vorher: bool, phase: bool, an: bool, temperatur: float | None, soll: float,
    minuten: float | None, max_minuten: float, lassen: bool = False, nachfrist_min: float = HAND_NACHFRIST_MIN,
) -> HandEnde | None:
    """Endet der Handbetrieb eines Heizkörpers jetzt? (FE-0004, Herbert 30.09.2026)

    Vorher endete er nur am nächsten Schaltpunkt – nach einem Start außerhalb der Heizzeit erst am nächsten Morgen,
    auch weit über dem Soll. Jetzt gehen Frostschutz und Tür offen vor, ein Hand-Ein endet mit Fühler am Soll, und
    nach `max_minuten` kommt die Nachricht – ohne Antwort übernimmt die Automatik `nachfrist_min` später (einstellbar, AN-0012);
    „So lassen“ (`lassen`, Warnung stumm) hält die Hand. Eine geänderte Einstellung beendet ihn sofort (Aufrufer).
    """
    if grund in (SollGrund.FROST, SollGrund.TUER_OFFEN):
        return HandEnde.VORRANG
    if an and temperatur is not None and temperatur >= soll:
        return HandEnde.SOLL
    if minuten is not None and minuten >= max_minuten + nachfrist_min and not lassen:
        return HandEnde.DAUER
    if phase != phase_vorher:
        return HandEnde.SCHALTPUNKT
    return None


def soll_container(lage: LageContainer, tuer_pause_min: int) -> Soll:
    """Soll-Zustand eines Containers nach der festen Reihenfolge (siehe Modul-Docstring)."""
    if not lage.automatik:
        if lage.frost_immer:
            if frostschutz(lage):
                return Soll(True, SollGrund.FROST)
            if lage.frost_vorher:
                return Soll(False, SollGrund.AUTOMATIK_AUS)   # Frost vorbei: einmal aus, danach nichts mehr schalten
        return Soll(None, SollGrund.AUTOMATIK_AUS)
    if frostschutz(lage):
        return Soll(True, SollGrund.FROST)
    s = _ohne_tuer(lage)
    if lage.tuer_offen_min is not None and lage.tuer_offen_min >= tuer_pause_min and (s.ein or lage.laeuft_gerade or lage.tuer_vorher):
        return Soll(False, SollGrund.TUER_OFFEN)   # pausiert nur, wenn geheizt würde oder gerade wird (auch von Hand)
    return s


def notsoll(lage: LageContainer) -> Soll:
    """Nur Frostschutz, wenn die Berechnung eines Containers scheitert (Audit 0.8.165): ein unter der Frostgrenze, sonst
    aus. Ohne Automatik nur mit `frost_immer`, sonst wird nichts geschaltet – wie `soll_container`; im Modus Hand
    (`auto` aus) nur Frostschutz an, aus schaltet die Hand."""
    if not lage.automatik and not lage.frost_immer:
        return Soll(None, SollGrund.AUTOMATIK_AUS)
    if frostschutz(lage):
        return Soll(True, SollGrund.FROST)
    if not lage.auto:
        return Soll(False if lage.frost_vorher else None, SollGrund.HAND)
    return Soll(False if lage.automatik or lage.frost_vorher else None, SollGrund.STOERUNG)


PLAN_GRUENDE = frozenset({SollGrund.FRUEHSTART, SollGrund.VORHEIZEN, SollGrund.ARBEITSZEIT, SollGrund.NACHHEIZEN,
                          SollGrund.TROCKNEN, SollGrund.BEDARF, SollGrund.BOOST, SollGrund.TASTE})


def im_plan(lage: LageContainer, soll: Soll) -> bool:
    """AN-0017: Ist der Container laut Plan gerade dran (Automatik an, Heizzeit oder Termin läuft)? Auch wenn er satt ist
    (Thermostat) oder die Tür offen ist – nicht bei frei, Heizgrenze, außerhalb der Heizzeit oder Hand."""
    if not lage.automatik:
        return False
    if soll.grund == SollGrund.TUER_OFFEN:
        return _ohne_tuer(lage).grund in PLAN_GRUENDE
    return soll.grund in PLAN_GRUENDE


def ruhe_grund(lage: LageContainer, soll: Soll) -> str:
    """AN-0017: Warum ein Container im Plan gerade nicht heizen will: „tuer_offen“ oder „satt“ (Thermostat); sonst ""."""
    if soll.ein or not im_plan(lage, soll):
        return ""
    return "tuer_offen" if soll.grund == SollGrund.TUER_OFFEN else "satt"


def _ohne_tuer(lage: LageContainer) -> Soll:
    """Die Reihenfolge ab „Hand“ (ohne Automatik aus, Frost und Tür)."""
    if not lage.auto:
        if lage.frost_vorher:
            return Soll(False, SollGrund.HAND)   # Frost vorbei: einmal aus, danach schaltet die Automatik nichts (Szenario-Befund)
        return Soll(None, SollGrund.HAND)
    if lage.taste:   # BSM-018: wie das Notprogramm im Plug – vor Modus, frei, Heizgrenze und Plan; mit Fühler bis zum Soll
        return Soll(_heizen(lage), SollGrund.TASTE)
    if lage.baseline and lage.modus != "aus":   # BSM-033.04: nach Hand, Frost, Tür und Taste; vor frei, Heizgrenze und Plan
        return Soll(True, SollGrund.BASELINE)
    if lage.boost and (lage.temperatur is None or lage.temperatur < lage.soll):
        return Soll(True, SollGrund.BOOST)
    if lage.modus == "aus":
        return Soll(False, SollGrund.AUS)
    if lage.bedarf:
        if lage.bedarf_aktiv:
            return Soll(_heizen(lage), SollGrund.BEDARF)
        return Soll(False, SollGrund.BEREIT)
    if lage.frei:
        if lage.frei_modus == "absenk" and lage.temperatur is not None:
            return Soll(_regeln(lage, lage.absenk), SollGrund.ABSENKEN)
        return Soll(False, SollGrund.FREI)
    if lage.zu_warm:
        return Soll(False, SollGrund.HEIZGRENZE)
    abschnitt = lage.plan.abschnitt(lage.minute) if lage.plan is not None else None
    if abschnitt is None:
        return Soll(False, SollGrund.AUSSERHALB)
    return Soll(_heizen(lage), SollGrund(abschnitt.value))
