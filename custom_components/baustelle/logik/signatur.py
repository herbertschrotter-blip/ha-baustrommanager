"""Energiesignatur je Container (BSM-033.01, Etappe J) – ohne HA-Code.

Tagesverbrauch gegen mittlere Außentemperatur nach ASHRAE Guideline 14, Modell mit Heizgrenze („3P-Heizen“):

    kWh am Tag = Grundlast + kWh je Grad · max(0, Heizgrenze − außen)

- **Heizgrenze** wird gesucht (Raster `GRENZE_VON` … `GRENZE_BIS`): für jede Grenze kleinste Quadrate, gewählt wird die
  mit der kleinsten Fehlerquadratsumme. Liegt die beste Grenze über allen gemessenen Tagen, ist sie nicht bestimmbar:
  dann eine Gerade („2P“, `grenze` None); `bezug` ist der wärmste gemessene Tag, `grundlast` der Verbrauch dort.
- **Gütemaß** CV(RMSE) = √(Fehlerquadratsumme ÷ (n − p)) ÷ mittlerer Tagesverbrauch, p = Anzahl der Parameter (3 bzw. 2).
  Bis `GUT` „gut“, bis `BRAUCHBAR` „brauchbar“, darüber „unsicher“.
- **Lernt noch**, solange weniger als `MIN_TAGE` Tage da sind oder die Außentemperaturen weniger als `MIN_SPANNE` K
  auseinanderliegen (sonst lässt sich die Steigung nicht vom Zufall trennen).
- **Mit und ohne Automatik** getrennt (`je_betrieb`): Tage der Baseline („ohne Automatik“, Heizkörper durchgehend am
  Strom) ergeben eine eigene Signatur; nie gemischt.

Welche Tage zählen und wie die Außentemperatur gemittelt wird, entscheidet der Aufrufer; hier zählt nur das Paar.
"""

from __future__ import annotations

from collections.abc import Iterable, Sequence
from dataclasses import dataclass
from math import sqrt

MIN_TAGE = 10                 # so viele Tage braucht eine Signatur mindestens
MIN_SPANNE = 4.0              # K zwischen kältestem und wärmstem Tag
MIN_SEITE = 3                 # Tage unter der Heizgrenze, damit eine Grenze zählt
GRENZE_VON, GRENZE_BIS, GRENZE_SCHRITT = 5.0, 22.0, 0.5
GUT = 0.20                    # CV(RMSE) bis hier „gut“
BRAUCHBAR = 0.30              # … bis hier „brauchbar“, darüber „unsicher“


@dataclass(frozen=True)
class Tag:
    aussen: float             # mittlere Außentemperatur °C
    kwh: float                # Verbrauch des Containers an dem Tag
    automatik: bool = True    # False = Baseline-Tag („ohne Automatik“)


@dataclass(frozen=True)
class Signatur:
    stand: str                        # "lernt" | "gut" | "brauchbar" | "unsicher"
    tage: int
    grund: str | None = None          # warum „lernt“ oder „unsicher“
    grenze: float | None = None       # Heizgrenze °C; None = nicht bestimmbar (Gerade)
    kwh_je_grad: float | None = None  # mehr Verbrauch am Tag je Grad kälter
    grundlast: float | None = None    # kWh am Tag an der Grenze und darüber (Gerade: am Bezugstag)
    bezug: float | None = None        # Gerade: wärmster gemessener Tag °C
    cv_rmse: float | None = None
    rmse: float | None = None         # mittlere Abweichung kWh am Tag (für die Spanne der Hochrechnung)
    r2: float | None = None


def _gerade(x: Sequence[float], y: Sequence[float]) -> tuple[float, float, float] | None:
    """Kleinste Quadrate y = a + b·x → (a, b, Fehlerquadratsumme); ohne Streuung in x None."""
    n = len(x)
    mx, my = sum(x) / n, sum(y) / n
    sxx = sum((v - mx) ** 2 for v in x)
    if sxx <= 1e-12:
        return None
    b = sum((xv - mx) * (yv - my) for xv, yv in zip(x, y)) / sxx
    a = my - b * mx
    return a, b, sum((yv - a - b * xv) ** 2 for xv, yv in zip(x, y))


def _raster() -> list[float]:
    n = round((GRENZE_BIS - GRENZE_VON) / GRENZE_SCHRITT)
    return [GRENZE_VON + i * GRENZE_SCHRITT for i in range(n + 1)]


def berechnen(tage: Iterable[Tag]) -> Signatur:
    """Signatur aus Tagen gleichen Betriebs (getrennt wird mit `je_betrieb`)."""
    liste = list(tage)
    n = len(liste)
    if n < MIN_TAGE:
        return Signatur("lernt", n, f"erst {n} von {MIN_TAGE} Tagen")
    t = [d.aussen for d in liste]
    y = [d.kwh for d in liste]
    spanne = max(t) - min(t)
    if spanne < MIN_SPANNE:
        return Signatur("lernt", n, f"Außentemperatur erst {spanne:.1f} von {MIN_SPANNE:.0f} K Spanne")
    best: tuple[float, float, float, float] | None = None      # (Fehlerquadratsumme, Grenze, Grundlast, Steigung)
    for g in _raster():
        x = [max(0.0, g - v) for v in t]
        if sum(1 for v in x if v > 0) < MIN_SEITE:
            continue
        fit = _gerade(x, y)
        if fit is None or fit[1] <= 0:
            continue
        if best is None or fit[2] < best[0] - 1e-9:
            best = (fit[2], g, fit[0], fit[1])
    if best is None:
        return Signatur("unsicher", n, "kein Zusammenhang mit der Außentemperatur")
    sse, g_best, grundlast, steigung = best
    grenze: float | None = g_best
    bezug: float | None = None
    p = 3
    if g_best >= max(t):
        # Grenze nicht bestimmbar → Gerade; dieselbe Fehlerquadratsumme, nur ein Parameter weniger
        bezug, p = max(t), 2
        grundlast += steigung * (g_best - bezug)
        grenze = None
    mittel = sum(y) / n
    rmse = sqrt(sse / (n - p))
    cv = rmse / mittel if mittel > 0 else None
    sst = sum((v - mittel) ** 2 for v in y)
    r2 = 1 - sse / sst if sst > 0 else None
    if cv is None or cv > BRAUCHBAR:
        stand, warum = "unsicher", "Tage streuen stark um die Signatur"
    else:
        stand, warum = ("gut" if cv <= GUT else "brauchbar"), None
    return Signatur(stand, n, warum, grenze, steigung, grundlast, bezug, cv, rmse, r2)


def erwartet(s: Signatur, aussen: float) -> float | None:
    """Erwarteter Verbrauch an einem Tag mit dieser Außentemperatur; None, solange die Signatur lernt oder unsicher ist."""
    if s.stand not in ("gut", "brauchbar") or s.kwh_je_grad is None or s.grundlast is None:
        return None
    if s.grenze is None:
        return max(0.0, s.grundlast + s.kwh_je_grad * ((s.bezug or 0.0) - aussen))
    return s.grundlast + s.kwh_je_grad * max(0.0, s.grenze - aussen)


def je_betrieb(tage: Iterable[Tag]) -> dict[str, Signatur]:
    """Getrennte Signaturen: `mit` Automatik und `ohne` (Baseline-Tage)."""
    liste = list(tage)
    return {"mit": berechnen(d for d in liste if d.automatik), "ohne": berechnen(d for d in liste if not d.automatik)}
