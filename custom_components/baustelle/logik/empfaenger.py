"""Empfänger der Meldungen: Seite und HA-Optionen (UI-Bericht, Maßnahme 2) – ohne Home-Assistant-Code.

Den Empfänger (Namen von `notify`-Diensten) setzen zwei Stellen: die Seite (⚙ › Meldungen, `meldungen_einst.empfaenger`)
und die Optionen der Baustelle in Home Assistant (`empfaenger`). Gemerkt wird, welchen Stand der Optionen die
Integration zuletzt übernommen hat (`meldungen_einst.empfaenger_optionen`):

- **Regel 1:** Ändert Herbert die Option, gilt sie – auch wenn auf der Seite schon ein anderer Empfänger steht.
- **Regel 2:** Bleibt die Option gleich (Neustart, andere Optionen geändert), gilt weiter, was zuletzt eingestellt wurde,
  also auch ein Empfänger von der Seite.
- **Regel 3 (bis 0.8.187 ohne Merker):** Ist noch nichts gemerkt, wird die Option nur übernommen, wenn noch kein
  Empfänger gespeichert ist (Verhalten bis 0.8.187); ab dann gilt sie als gemerkt.

Die Reihenfolge der Dienste zählt nicht.
"""

from __future__ import annotations

from collections.abc import Sequence


def uebernehmen(gespeichert: Sequence[str] | None, gemerkt: Sequence[str] | None,
                optionen: Sequence[str] | None) -> tuple[list[str], list[str]]:
    """(geltende Empfänger, neuer Merker) aus dem gespeicherten Empfänger, dem gemerkten Stand und der Option."""
    gespeichert_l, optionen_l = list(gespeichert or []), list(optionen or [])
    if gemerkt is None:   # Regel 3
        return (gespeichert_l if gespeichert_l or not optionen_l else optionen_l), optionen_l
    if sorted(gemerkt) != sorted(optionen_l):   # Regel 1
        return optionen_l, optionen_l
    return gespeichert_l, optionen_l   # Regel 2
