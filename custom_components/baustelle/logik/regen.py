"""Regen eines Tages aus Vorhersage und Messung (FE-0026), ohne Home-Assistant-Code.

Der Heizplan verlängert sich bei Regen („Kleidung trocknen“, heute ≥ `trocknen_ab_mm`) und beginnt am Tag danach
früher. Bisher galt für heute der höchste Wert, den eine Vorhersage je genannt hatte: sagte sie morgens 6,8 mm und
mittags nur noch 0,5 mm, blieb es den ganzen Tag bei 6,8 mm – auch gegen eine Messung.

Jetzt:
- **Stündliche Vorhersage:** je Stunde gemerkt. Vergangene Stunden bleiben, wie sie zuletzt vorhergesagt waren (die
  Vorhersage nennt sie nicht mehr, der Regen ist aber gefallen); die laufende und alle kommenden Stunden nimmt die
  neueste Vorhersage. Regen des Tages = Summe der Stunden.
- **Nur Tagesvorhersage:** die neueste gilt.
- **Gemessen** (Regensensor als Tagessumme, Bauplan 0.7 „gemessener Regen geht vor“): der höchste Messwert des Tages
  (`regen_mess`) gilt vor jeder Vorhersage.
"""

from __future__ import annotations

from collections.abc import Mapping
from datetime import datetime
from typing import Any


def stunden_merken(alt: Mapping[str, float] | None, neu: Mapping[str, float] | None, jetzt: datetime) -> dict[str, float]:
    """Regen je Stunde (ISO-Zeit des Stundenbeginns → mm): vergangene Stunden aus `alt`, ab der laufenden aus `neu`.
    Ohne neue stündliche Vorhersage bleibt `alt`."""
    if neu is None:
        return dict(alt or {})
    ab = jetzt.replace(minute=0, second=0, microsecond=0)
    vorbei = {k: v for k, v in (alt or {}).items() if datetime.fromisoformat(k) < ab}
    kommend = {k: v for k, v in neu.items() if datetime.fromisoformat(k) >= ab}
    return dict(sorted({**vorbei, **kommend}.items()))


def regen_vorhersage(stunden: Mapping[str, float] | None, tag_mm: float | None) -> float | None:
    """Regen des Tages laut Vorhersage: Summe der Stunden, ohne Stunden der Wert der Tagesvorhersage."""
    if stunden:
        return round(sum(stunden.values()), 2)
    return tag_mm


def regen_des_tages(werte: Mapping[str, Any]) -> float | None:
    """Gemessen vor Vorhersage."""
    mess = werte.get("regen_mess")
    return float(mess) if mess is not None else werte.get("regen")
