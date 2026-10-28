"""Zähler-Statistik bereinigen: Rücksprünge und nachgetragene Zählerstände (FE-0029) – ohne Home-Assistant-Code.

Die HA-Langzeitstatistik eines Zählers (`state_class` total/total_increasing) rechnet die Änderung je Abschnitt aus dem
Zustand. Lädt die Integration nach einem Neustart einen älteren Zählerstand (Datenbank-Panne 16.–19.10.2026), läuft der
Zähler in diesem Abschnitt rückwärts – das ist ein Artefakt des Neustarts, kein echter Verbrauch:

- **Regel 1 (Rücksprung):** Eine negative Änderung eines Zählers zählt in diesem Abschnitt 0 (`zaehler_schritt`).
  Gilt je kleinstem Abschnitt (Stunde bzw. 5 Minuten); Tag, Woche und Monat sind die Summe der bereinigten Stunden
  (`zusammenfassen`) – sonst würde ein Rücksprung den Tag nur kleiner machen statt zu verschwinden.
- **Regel 2 (Ausgleich):** Wird ein Zähler einmalig nachgetragen (`baustelle/zaehler_korrigieren`), springt sein Zustand
  um den Betrag. Dieser Sprung geht vom Abschnitt ab, in dem er liegt (Zeit der Korrektur), und – wenn der kleiner ist –
  von den folgenden, nie unter 0. So stimmt der Zählerstand wieder, Diagramme und Summen zeigen keinen Sprung.

Mittelwerte (Temperaturen) haben keine `change` und bleiben unverändert.
"""

from __future__ import annotations

from collections.abc import Iterable, Mapping, Sequence
from datetime import datetime, timezone
import math
from typing import Any

from .auswertung import ist_zahl, zeitpunkt

KORRIGIERBAR = ("ohne",)   # Zähler, die sich nur aus der Zeit hochrechnen (kein Gerätezählerstand holt sie wieder auf)
STELLEN = 6

Punkt = Mapping[str, Any]
Ausgleich = tuple[float, float]   # (Zeit in s seit 1970 UTC, Betrag in Einheit des Zählers)


def zaehler_schritt(change: Any) -> float | None:
    """Änderung eines Zählers in einem Abschnitt; rückwärts (Rücksprung nach einem Neustart) zählt 0. Ohne Wert None."""
    if not ist_zahl(change):
        return None
    return max(0.0, float(change))


def _sek(wert: Any) -> float:
    return zeitpunkt(wert).timestamp()


def _enden(punkte: Sequence[Punkt]) -> list[float]:
    """Ende je Punkt (in der Reihenfolge der Punkte): `end`, sonst Beginn des nächsten, beim letzten offen."""
    beginne = sorted(_sek(p["start"]) for p in punkte)
    enden = []
    for p in punkte:
        if p.get("end") is not None:
            enden.append(_sek(p["end"]))
            continue
        b = _sek(p["start"])
        enden.append(next((x for x in beginne if x > b), math.inf))
    return enden


def bereinigt(punkte: Sequence[Punkt], ausgleich: Iterable[Ausgleich] = ()) -> list[dict[str, Any]]:
    """Punkte einer Statistik (wie `statistics_during_period`) mit bereinigter `change` (Regel 1, dann Regel 2)."""
    neu = [dict(p) for p in punkte]
    for p in neu:
        if "change" in p and ist_zahl(p["change"]):
            p["change"] = zaehler_schritt(p["change"])
    enden = _enden(neu)
    folge = sorted((i for i, p in enumerate(neu) if ist_zahl(p.get("change"))), key=lambda i: _sek(neu[i]["start"]))
    for zeit, betrag in sorted(ausgleich):
        ab = [i for i in folge if enden[i] > zeit]
        if not ab or _sek(neu[ab[0]]["start"]) > zeit:
            continue   # der Abschnitt mit der Korrektur ist nicht dabei – der Sprung liegt außerhalb (davor)
        rest = float(betrag)
        for i in ab:
            if rest <= 0:
                break
            weg = min(float(neu[i]["change"]), rest)
            neu[i]["change"] = round(float(neu[i]["change"]) - weg, STELLEN)
            rest -= weg
    return neu


def zusammenfassen(grob: Sequence[Punkt], fein: Sequence[Punkt]) -> list[dict[str, Any]]:
    """Tag/Woche/Monat aus bereinigten Stunden: `change` je grobem Punkt = Summe der feinen Punkte darin."""
    neu = [dict(p) for p in grob]
    enden = _enden(neu)
    feine = [(_sek(p["start"]), float(p["change"])) for p in fein if ist_zahl(p.get("change"))]
    for p, ende in zip(neu, enden, strict=True):
        if "change" in p and ist_zahl(p["change"]):
            beginn = _sek(p["start"])
            p["change"] = round(sum(c for t, c in feine if beginn <= t < ende), STELLEN)
    return neu


def korrektur(zeit: datetime, key: str, betrag: float, grund: str, vorher: Mapping[str, float | None],
              nachher: Mapping[str, float | None], von: str | None = None) -> dict[str, Any]:
    """Eintrag einer Korrektur (Einstellung `korrekturen`): was nachgetragen wurde und um wie viel jeder Sensor mit
    Statistik dadurch gesprungen ist (`sprung`, Sensor-Schlüssel → Betrag) – das ist der Ausgleich für Regel 2."""
    if key not in KORRIGIERBAR:
        raise ValueError(f"Zähler {key!r} lässt sich nicht korrigieren")
    sprung = {k: round(float(n) - float(vorher[k]), STELLEN) for k, n in nachher.items()
              if ist_zahl(n) and ist_zahl(vorher.get(k)) and abs(float(n) - float(vorher[k])) > 1e-9}
    return {"zeit": zeit.astimezone(timezone.utc).isoformat(timespec="seconds"), "key": key, "kwh": round(float(betrag), STELLEN),
            "grund": grund, "von": von, "sprung": sprung}


def ausgleich(korrekturen: Iterable[Mapping[str, Any]] | None) -> dict[str, list[Ausgleich]]:
    """Ausgleich je Sensor-Schlüssel aus den gespeicherten Korrekturen (nur positive Sprünge)."""
    je: dict[str, list[Ausgleich]] = {}
    for k in korrekturen or []:
        try:
            zeit = datetime.fromisoformat(str(k["zeit"])).timestamp()
        except (KeyError, ValueError):
            continue
        for sensor, betrag in (k.get("sprung") or {}).items():
            if ist_zahl(betrag) and float(betrag) > 0:
                je.setdefault(str(sensor), []).append((zeit, float(betrag)))
    return je
