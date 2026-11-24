"""Herkunft der Einstellungen eines Containers – reine Fachlogik ohne Home-Assistant-Code.

UI-Bericht M8 (Mockup `mockups/container-seite.html`, abgenommen von Herbert am 24.11.2026): Auf der Container-Seite trägt
jede Einstellung ihre Herkunft, die Seite zeigt sie nur an (`laufzeit.container.<id>.einst`, api-0.7):

- `baustelle` – der Container hat keinen eigenen Wert, es gilt der Wert der Baustelle („von der Baustelle“, grau; mit
  `ziel` springt „ändern ›“ dorthin, wo die Baustelle ihn einstellt).
- `abweichend` – eigener Wert des Containers; `baustelle` nennt den Wert der Baustelle, ↺ stellt ihn wieder her
  (die Seite setzt dazu den Wert in `zurueck`).

Eigene Werte: Soll (`soll`, leer = Baustelle), Warm ab (`warm_vor`, `warm_nach`, leer = Baustelle) und Vorrang (`prio`,
„normal“ = wie alle). Regeln, die es nur für die ganze Baustelle gibt (Vorheizen, Frostschutz, Tür-Pause, Trocknen,
Staffelung), stehen mit Herkunft `baustelle` zum Nachlesen da. `ruht` sagt, wenn eine Regel für diesen Container
gerade nicht wirkt (Vorheizen bei lernender Regelung, logik/eingestellt).
"""

from __future__ import annotations

from collections.abc import Mapping
from typing import Any

from .eingestellt import zahl
from .regelung import frost_aus_wert
from .regen import stufen_aus
from .soll import versatz

BAUSTELLE = "baustelle"
ABWEICHEND = "abweichend"
PRIO_STANDARD = "normal"

ZIEL_SOLL = "regeln:soll"
ZIEL_WARM = "regeln:vorheizen"
ZIEL_FROST = "regeln:frost"
ZIEL_TUER = "regeln:tuer"
ZIEL_TROCKNEN = "regeln:trocknen"
ZIEL_STAFFEL = "strom"


def grad(x: float) -> str:
    """Soll wie auf der Seite: immer eine Nachkommastelle („20,0 °C“)."""
    return f"{float(x):.1f} °C".replace(".", ",").replace("-", "−")


def warm_vor_text(v: int) -> str:
    return f"{v} min vorher" if v else "bei Beginn"


def warm_nach_text(v: int) -> str:
    return f"{v} min länger" if v else "bis Ende"


def _zeile(wert: Any, text: str, eigen: bool, baustelle: str, zurueck: Any = None, ziel: str | None = None,
           ruht: str | None = None, hinweis: str | None = None) -> dict[str, Any]:
    return {"wert": wert, "text": text, "herkunft": ABWEICHEND if eigen else BAUSTELLE, "baustelle": baustelle,
            "zurueck": zurueck, "ziel": None if eigen else ziel, "ruht": ruht, "hinweis": hinweis}


def einstellungen(heizung: Mapping[str, Any], staffel: Mapping[str, Any], bereich: Mapping[str, Any],
                  lernend: bool = False) -> dict[str, dict[str, Any]]:
    """Je Einstellung Wert, Text und Herkunft für die Container-Seite (Schlüssel = Zeile der Seite)."""
    h, b = heizung, bereich
    E: dict[str, dict[str, Any]] = {}

    soll_b, soll_e = float(h.get("soll", 20.0)), b.get("soll")
    gleitend = h.get("soll_art") == "gleitend"
    wert = float(soll_e) if soll_e is not None else soll_b
    hinweis = None
    if gleitend:
        v = versatz(soll_e, soll_b)
        hinweis = (f"Soll gleitend: gilt als {'+' if v > 0 else '−'}{zahl(abs(v))} °C gegenüber dem der Baustelle" if v
                   else "Soll gleitend: folgt dem der Baustelle")
    E["soll"] = _zeile(wert, grad(wert), soll_e is not None, "gleitend" if gleitend else grad(soll_b), None, ZIEL_SOLL,
                       hinweis=hinweis)

    for k, f in (("warm_vor", warm_vor_text), ("warm_nach", warm_nach_text)):
        basis, eigen = int(h.get(f"{k}_min", 0) or 0), b.get(k)
        w = int(eigen) if eigen is not None else basis
        E[k] = _zeile(w, f(w), eigen is not None, f(basis), None, ZIEL_WARM)

    prio = b.get("prio") or PRIO_STANDARD
    E["prio"] = _zeile(prio, prio, prio != PRIO_STANDARD, PRIO_STANDARD, PRIO_STANDARD)

    vh = int(h.get("vorheizen_min", 0) or 0)
    E["vorheizen"] = _zeile(vh, f"{vh} min" if vh else "aus", False, "", ziel=ZIEL_WARM,
                            ruht="wirkt nicht – die lernende Regelung rechnet selbst" if lernend and vh else None)

    if h.get("frost", True):
        g = float(h.get("frost_grenze", 5))
        frost = f"unter {zahl(g)} °C, aus über {zahl(frost_aus_wert(g, h.get('frost_aus')))} °C"
    else:
        frost = "aus"
    E["frost"] = _zeile(bool(h.get("frost", True)), frost, False, "", ziel=ZIEL_FROST)

    pause = int(h.get("tuer_pause_min", 3) or 0)
    E["tuer"] = _zeile(pause, f"nach {pause} min" if pause else "aus", False, "", ziel=ZIEL_TUER)

    stufen = stufen_aus(h.get("trocknen_stufen"), float(h.get("trocknen_ab_mm", 2)), int(h.get("trocknen_laenger_min", 45)),
                        int(h.get("trocknen_frueher_min", 15)))
    E["trocknen"] = _zeile(None, "; ".join(f"ab {zahl(x.ab_mm)} mm {x.laenger_min} min länger, {x.frueher_min} min früher"
                                           for x in stufen), False, "", ziel=ZIEL_TROCKNEN)

    an = bool(staffel.get("an", True))
    E["staffel"] = _zeile(an, f"an · {int(staffel.get('nutzbar_prozent', 67))} % je Anschluss nutzbar" if an else "aus",
                          False, "", ziel=ZIEL_STAFFEL)
    return E
