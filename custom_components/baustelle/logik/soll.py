"""Soll gleitend nach draußen und nach dem Gefühl (Herbert 01.10.2026, Mockup soll-gleitend.html) – ohne HA-Code.

„20 °C sind nicht immer 20 °C“: nach kalten Tagen sind Wände und Körper ausgekühlt, dieselbe Luft fühlt sich kälter
an (Strahlungstemperatur, Gewöhnung – adaptives Komfortmodell EN 16798-1 / ASHRAE 55 rechnet mit dem gleitenden
Mittel der Außentemperatur der letzten Tage). Das Soll setzt sich zusammen aus

- **Startwert:** `minimum` + `je_grad` je Grad, um den das Außenmittel unter `bezug` liegt, höchstens `maximum`;
- **Gefühl:** jede Rückmeldung („zu kalt“ −1, „passt“ 0, „zu warm“ +1, auch + / − am Rad) verschiebt das Soll bei
  gleichem Außenmittel um `GEFUEHL_SCHRITT`, bei ähnlichem (bis `GEFUEHL_UMKREIS` °C) entsprechend weniger, insgesamt
  höchstens ±`GEFUEHL_MAX`;
- das Ganze bleibt zwischen `minimum` und `maximum` (Aufenthaltsräume: § 36 BauV verlangt 21 °C – die Untergrenze
  ist auf Wunsch frei einstellbar).

Das Außenmittel wird wie in EN 16798-1 gewichtet: der gestrige Tag zählt voll, jeder Tag davor `ALPHA`-mal so viel.
"""

from __future__ import annotations

from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from datetime import date, timedelta

ALPHA = 0.8
GEFUEHL_SCHRITT = 0.15
GEFUEHL_UMKREIS = 5.0
GEFUEHL_MAX = 1.5
KURVE_VON, KURVE_BIS = -10, 20   # Außenmittel für die Kurve der Seite


@dataclass(frozen=True)
class GleitRegeln:
    minimum: float = 21.0
    maximum: float = 24.0
    je_grad: float = 0.1
    bezug: float = 12.0
    tage: int = 3


def aussen_mittel(tage: Mapping[date, float], heute: date, anzahl: int, heute_bisher: float | None = None) -> float | None:
    """Gleitendes Mittel der Tagesmittel außen (gestern zuerst, `ALPHA` je Tag davor); ohne Vortage das Mittel von heute."""
    werte = [(ALPHA ** k, tage[t]) for k in range(anzahl) if (t := heute - timedelta(days=k + 1)) in tage]
    if not werte:
        return heute_bisher
    return sum(g * v for g, v in werte) / sum(g for g, _ in werte)


def startwert(t_m: float, r: GleitRegeln) -> float:
    return max(r.minimum, min(r.maximum, r.minimum + r.je_grad * max(0.0, r.bezug - t_m)))


def gefuehl(rueck: Sequence[tuple[float, int]], t_m: float) -> float:
    """Verschiebung aus den Rückmeldungen `(Außenmittel, -1|0|+1)` für das Außenmittel `t_m`."""
    s = sum(-r * GEFUEHL_SCHRITT * max(0.0, 1 - abs(x - t_m) / GEFUEHL_UMKREIS) for x, r in rueck)
    return max(-GEFUEHL_MAX, min(GEFUEHL_MAX, s))


def gleitend(t_m: float, r: GleitRegeln, rueck: Sequence[tuple[float, int]]) -> float:
    return round(max(r.minimum, min(r.maximum, startwert(t_m, r) + gefuehl(rueck, t_m))), 2)


def versatz(eigen: float | None, baustelle: float) -> float:
    """Gleitendes Soll: das eigene Soll eines Containers wirkt als Verschiebung gegenüber dem der Baustelle."""
    return float(eigen) - float(baustelle) if eigen is not None else 0.0


def kurve(r: GleitRegeln, rueck: Sequence[tuple[float, int]]) -> list[list[float]]:
    """Für die Seite: je Grad Außenmittel `[t, Startwert, Soll]`."""
    return [[t, round(startwert(t, r), 2), gleitend(t, r, rueck)] for t in range(KURVE_VON, KURVE_BIS + 1)]
