"""Zusatz-Heizkörper nur bei Bedarf (AN-0006) – zweistufige Heizung, ohne Home-Assistant-Code.

Vorbild sind zweistufige Thermostate (z. B. Ecobee „Stage 2“, Honeywell): in einem Container mit mehreren Heizkörpern
heizt zuerst nur der Hauptheizkörper; der Zusatz kommt dazu, wenn

- **Schnell aufheizen** läuft (alle zugleich, wie bisher),
- es **außergewöhnlich kalt** ist (außen unter `kalt_unter`),
- die gelernte Aufheizzeit sagt, dass **einer allein das Soll nicht rechtzeitig schafft** (`gelernt`, AN-0004) – sagt sie,
  dass einer reicht (`einer_reicht`), bleibt der Zusatz im Vorheizen aus,
- der Raum **weit unter dem Soll** ist (mehr als `abstand`),
- der Hauptheizkörper schon `laufzeit_min` durchgehend läuft und der Raum dabei **kaum wärmer** wurde (unter
  `min_anstieg`) – einer schafft es nicht.

Einmal zugeschaltet bleibt der Zusatz, bis der Raum nur noch `ZURUECK` °C unter dem Soll ist (kein Flattern).
Ohne Fühler gelten nur Schnell aufheizen und Kälte.
"""

from __future__ import annotations

from dataclasses import dataclass

ZURUECK = 0.5   # Zusatz aus, wenn der Raum so nahe am Soll ist


class Grund:
    """Warum der Zusatz läuft (Anzeige und Protokoll)."""

    BOOST = "boost"
    KALT = "kalt"
    GELERNT = "gelernt"
    WEIT_UNTER = "weit_unter"
    SCHAFFT_NICHT = "schafft_nicht"


TEXT = {
    Grund.BOOST: "Schnell aufheizen",
    Grund.KALT: "außergewöhnlich kalt",
    Grund.GELERNT: "einer allein schafft das Soll nicht rechtzeitig (gelernt)",
    Grund.WEIT_UNTER: "weit unter dem Soll",
    Grund.SCHAFFT_NICHT: "einer allein schafft es nicht",
}


@dataclass(frozen=True)
class StufenRegeln:
    """Schwellen je Baustelle (Heizung › Regeln)."""

    abstand: float = 1.5        # °C unter dem Soll
    laufzeit_min: int = 30      # so lange läuft der Hauptheizkörper schon durch …
    min_anstieg: float = 0.3    # … und der Raum wurde weniger als so viel wärmer
    kalt_unter: float = -5.0    # außen darunter: beide von Anfang an


@dataclass(frozen=True)
class StufenLage:
    """Was zur Minute bekannt ist."""

    innen: float | None
    soll: float
    aussen: float | None
    toleranz: float = 0.3
    haupt_min: float = 0.0          # Hauptheizkörper läuft seit … min durchgehend
    anstieg: float = 0.0            # so viel °C wärmer seit dem Einschalten des Hauptheizkörpers
    boost: bool = False
    gelernt: bool = False           # gelernte Aufheizzeit: einer allein reicht nicht (nur im Vorheizen)
    zusatz_an: bool = False         # lief der Zusatz bis eben
    grund_vorher: str | None = None
    einer_reicht: bool = False      # gelernte Aufheizzeit: einer schafft das Soll rechtzeitig (nur im Vorheizen)


def zusatz(r: StufenRegeln, lage: StufenLage) -> tuple[bool, str | None]:
    """Soll der Zusatz-Heizkörper laufen dürfen? Gibt (ja/nein, Grund) zurück."""
    if lage.boost:
        return True, Grund.BOOST
    if lage.aussen is not None and lage.aussen < r.kalt_unter:
        return True, Grund.KALT
    if lage.gelernt:
        return True, Grund.GELERNT
    if lage.einer_reicht:   # der Beginn ist für einen gerechnet – „weit unter dem Soll“ gilt hier nicht
        return False, None
    if lage.innen is None:
        return False, None
    abstand = lage.soll - lage.innen
    if abstand > r.abstand:
        return True, Grund.WEIT_UNTER
    if lage.haupt_min >= r.laufzeit_min and lage.anstieg < r.min_anstieg and abstand > lage.toleranz:
        return True, Grund.SCHAFFT_NICHT
    if lage.zusatz_an and abstand > ZURUECK:
        return True, lage.grund_vorher or Grund.WEIT_UNTER
    return False, None


def haupt_und_zusatz(heizer: list[str], zusatz_markiert: set[str], primaer: str | None = None) -> tuple[list[str], list[str]]:
    """Primärheizkörper und Zusatz eines Containers (Reihenfolge wie `heizer`).

    AN-0015 (Herbert, Mockup primaer.html A, 28.10.2026): Je Container ist genau einer primär – der im Container
    gewählte (`primaer`), solange er aktiv im Container ist; alle anderen sind Zusatz. Ohne Wahl gilt, was vorher im
    Gerät als Zusatz markiert war (der erste nicht markierte), sonst der erste.
    """
    if primaer in heizer:
        haupt = [primaer]
    else:
        frei = [g for g in heizer if g not in zusatz_markiert]
        haupt = frei[:1] if frei and len(frei) < len(heizer) else heizer[:1]
    return haupt, [g for g in heizer if g not in haupt]
