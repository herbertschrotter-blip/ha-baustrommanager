"""Grundtypen und Konstanten des Kerns (BSM-023): Bereich, Gerät, Wetter, Laufzeit, Grenzen der Staffelung."""

from __future__ import annotations
from dataclasses import dataclass, field
from datetime import datetime, time, timedelta
from typing import Any
from ..logik import staffel as staffel_logik, warnungen as warn_logik

MAX_SCHRITT_H = 5 / 60  # längere Lücken (Neustart) zählen nicht als Laufzeit
HOCHFAHREN_UNSICHER = timedelta(minutes=2)  # so lange nach dem Start kann last_changed nur den Start zeigen (WU-0015)
FEHLT_NACH = timedelta(minutes=10)  # so lange darf eine Entität nach dem Start fehlen (andere Integrationen laden)
STABIL_S = 60  # Staffelung: kleinster freier Wert der letzten Minute
ANLAUF_S = 20  # Staffelung: Geräte gehen nacheinander an, höchstens eines je 20 s (kein gemeinsamer Einschaltstoß)
PRIO = {"niedrig": staffel_logik.Prio.NIEDRIG, "normal": staffel_logik.Prio.NORMAL, "hoch": staffel_logik.Prio.HOCH}
WARTE_TEXT = {
    "anschluss_voll": "Anschluss voll",
    "max_gleichzeitig": "höchstens {max} gleichzeitig",
    "mindestpause": "Mindestpause",
    "rundlauf": "Rundlauf {takt} min",
    "anlauf": "Anlauf",
}


def morgen_frueh(jetzt: datetime) -> datetime:
    """„Bis morgen“: nächster Tag 07:00 (Arbeitsbeginn im Mockup)."""
    return datetime.combine(jetzt.date() + timedelta(days=1), time(7, 0), tzinfo=jetzt.tzinfo)


@dataclass
class BereichInfo:
    """Ein Bereich der Einrichtung (Art je Funktion, z. B. Container oder Pumpenschacht)."""

    id: str
    name: str
    art: str
    fuehler: str | None
    nr: int = 0


@dataclass
class GeraetInfo:
    """Ein Shelly aus der Einrichtung."""

    id: str
    name: str
    bereich: str
    schalter: str
    rolle: str
    typ: str
    leistung: str | None
    energie: str | None


@dataclass
class WetterWerte:
    """Wetter, mit dem die Regeln gerade rechnen."""

    aussen: float | None = None
    aussen_max: float | None = None
    frueh: float | None = None
    regen_vortag: float | None = None
    regen_heute: float | None = None
    zustand: str | None = None

    # Namen wie 0.6 für die Wetter-Sensoren
    @property
    def frueh_prognose(self) -> float | None:
        return self.frueh

    @property
    def regen_24h(self) -> float | None:
        return self.regen_heute


@dataclass
class Laufzeit:
    """Ergebnis der letzten Auswertung, von Entitäten und Seite angezeigt."""

    status: str = "automatik_aus"
    status_text: str = ""
    naechste: datetime | None = None
    grund: dict[str, str] = field(default_factory=dict)
    zustand: dict[str, str] = field(default_factory=dict)
    text: dict[str, str] = field(default_factory=dict)
    temperatur: dict[str, float | None] = field(default_factory=dict)
    leistung: dict[str, float | None] = field(default_factory=dict)
    probleme: dict[str, list[str]] = field(default_factory=dict)
    erreichbar: bool | None = None
    wetter: WetterWerte = field(default_factory=WetterWerte)
    warnungen: list[warn_logik.Warnung] = field(default_factory=list)
    warte: dict[str, dict[str, Any]] = field(default_factory=dict)
    staffel: dict[str, Any] = field(default_factory=dict)
    # Prognose V2 (BSM-033.06), nur beobachtet: je Gerät (Regelung will ein vor der Staffelung, Staffelungs-Veto)
    staffel_beobachtung: dict[str, tuple[bool, bool | None]] = field(default_factory=dict)


# Sensoren am Shelly, die nie Verbrauch sind (Shelly: Energieeinspeisung)
KEIN_VERBRAUCH = {"energy_returned"}
