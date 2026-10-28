"""Tür und Fenster offen im Tagesdiagramm des Containers (Herbert 28.10.2026, Mockup `tuer-diagramm.html`, Variante A) –
ohne HA-Code.

Aus dem Zustandsverlauf jedes Kontakts (Türen und Fenster aus der Sensorliste, logik/sensoren) entstehen die Öffnungen
in einem Zeitfenster [von, bis). Die Seite zeichnet sie nur.

Regeln:
- „on“ = offen (Tür/Fenster offen oder gekippt), „off“ = zu; alles andere (`unavailable`, `unknown`, fehlt) ist
  **unbekannt und ändert nichts**: Eine laufende Öffnung endet erst mit „zu“, auch wenn der Kontakt dazwischen nicht
  erreichbar war (Funk-Aussetzer mitten in einer Öffnung zerreißen sie nicht); unbekannt vor dem ersten „offen“ gilt
  als zu. Entscheidung 28.10.2026: lieber eine Öffnung zu lang als eine erfundene Lücke.
- Vor dem Fensterbeginn zählt der letzte Zustand: schon vorher offen → die Öffnung beginnt am Fensterbeginn.
- Öffnungen unter 10 s fallen weg (der Kontakt prellt); gemessen an der ganzen Dauer, auch wenn sie vor dem Fenster
  begann. Eine noch offene Öffnung bleibt immer stehen (sie ist gerade wirklich offen).
- Noch offen am Fensterende → `bis` None; `sekunden` zählt bis zum Fensterende.
"""

from __future__ import annotations

from collections.abc import Iterable
from dataclasses import dataclass
from datetime import datetime, timedelta, tzinfo
from typing import Any

PRELLEN_S = 10
OFFEN, ZU = "on", "off"


@dataclass(frozen=True)
class Oeffnung:
    entity_id: str
    art: str            # tuer | fenster
    name: str           # „Tür 1“, „Fenster 2“
    von: datetime
    bis: datetime | None
    sekunden: float


def _offen(zustand: Any) -> bool | None:
    """True = offen, False = zu, None = unbekannt (nicht erreichbar, unbekannt, sonstiges)."""
    if zustand is True or zustand == OFFEN:
        return True
    if zustand is False or zustand == ZU:
        return False
    return None


def oeffnungen_eines(entity_id: str, art: str, name: str, verlauf: Iterable[tuple[datetime, Any]],
                     von: datetime, bis: datetime) -> list[Oeffnung]:
    """Öffnungen eines Kontakts im Fenster [von, bis) aus seinem Verlauf [(zeit, zustand)] (auch Zeiten vor `von`)."""
    aus: list[Oeffnung] = []
    offen_ab: datetime | None = None
    for zeit, zustand in sorted(verlauf, key=lambda p: p[0]):
        if zeit >= bis:
            break
        z = _offen(zustand)
        if z is True and offen_ab is None:
            offen_ab = zeit
        elif z is False and offen_ab is not None:
            if zeit > von and zeit - offen_ab >= timedelta(seconds=PRELLEN_S):
                beginn = max(offen_ab, von)
                aus.append(Oeffnung(entity_id, art, name, beginn, zeit, (zeit - beginn).total_seconds()))
            offen_ab = None
    if offen_ab is not None:
        beginn = max(offen_ab, von)
        aus.append(Oeffnung(entity_id, art, name, beginn, None, (bis - beginn).total_seconds()))
    return aus


def oeffnungen(kontakte: Iterable[tuple[str, str, str, Iterable[tuple[datetime, Any]]]],
               von: datetime, bis: datetime) -> list[Oeffnung]:
    """Alle Öffnungen der Kontakte [(entity_id, art, name, verlauf)] im Fenster, nach Beginn sortiert."""
    alle = [o for eid, art, name, verlauf in kontakte for o in oeffnungen_eines(eid, art, name, verlauf, von, bis)]
    return sorted(alle, key=lambda o: (o.von, o.entity_id))


def _uhr(t: datetime, zone: tzinfo, tagesende: bool = False) -> str:
    lokal = t.astimezone(zone)
    return "24:00" if tagesende and lokal.hour == 0 and lokal.minute == 0 else lokal.strftime("%H:%M")


def fuer_seite(liste: Iterable[Oeffnung], zone: tzinfo, laufend: bool, ende: datetime) -> list[dict[str, Any]]:
    """Für die Seite: Uhrzeiten lokal „HH:MM“, Minuten (abgeschlossen mindestens 1).

    `laufend` = das Fenster endet jetzt (heute): eine Öffnung ohne Ende ist noch offen (`bis` None, „offen seit“).
    Sonst (früherer Tag) war sie am Fensterende `ende` noch offen und endet dort – um Mitternacht als „24:00“.
    """
    aus: list[dict[str, Any]] = []
    for o in liste:
        offen = o.bis is None and laufend
        bis = None if offen else _uhr(o.bis or ende, zone, tagesende=o.bis is None)
        minuten = round(o.sekunden / 60)
        aus.append({"entity_id": o.entity_id, "art": o.art, "name": o.name, "von": _uhr(o.von, zone), "bis": bis,
                    "min": minuten if offen else max(1, minuten)})
    return aus
