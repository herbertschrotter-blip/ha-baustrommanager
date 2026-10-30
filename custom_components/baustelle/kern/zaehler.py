"""Kern: Zähler, Preise, Energie und Zeiten zählen (BSM-023)."""

from __future__ import annotations

from datetime import datetime
from typing import TYPE_CHECKING

from homeassistant.const import STATE_ON
from homeassistant.util import dt as dt_util

from ..funktionen.basis import ZAEHLER_SPEICHERN_S, zahl as _zahl
from ..logik.zaehlen import energie_zuwachs, leistung_integriert, zaehlerstand
from .typen import GeraetInfo, MAX_SCHRITT_H

if TYPE_CHECKING:
    from ..steuerung import Steuerung


def zaehler_plus(st: Steuerung, key: str, wert: float) -> None:
    if wert <= 0:
        return
    z = st.zaehler
    z[key] = z.get(key, 0.0) + wert
    z.setdefault("seit", dt_util.now().isoformat())
    st.einstellungen.speichern(ZAEHLER_SPEICHERN_S)


def preis_abgleichen(st: Steuerung) -> None:
    """`preis` (Preis von heute, für Seite und Sensoren) aus der Liste nachziehen."""
    if st.e.get("preise"):
        heute = st.preis_am(dt_util.now().date())
        if heute != st.e["preis"]:
            st.e["preis"] = heute
            st.einstellungen.speichern()


def zaehler_minus(st: Steuerung, key: str, wert: float) -> None:
    """Zähler verringern, nie unter null (Reparatur falscher Buchungen, FE-0016)."""
    if key in st.zaehler and wert > 0:
        st.zaehler[key] = max(0.0, float(st.zaehler[key]) - wert)
        st.einstellungen.speichern(ZAEHLER_SPEICHERN_S)


def kosten_ausbuchen(st: Steuerung, g: GeraetInfo, eur: float) -> None:
    """FE-0016: falsch gezählte Kosten eines Geräts zurücknehmen (z. B. zum Preis von damals)."""
    for key in ("kosten", f"kosten:{g.bereich}"):
        st.zaehler_minus(key, eur)
    st.protokoll("einstellung", g.bereich, f"{g.name}: {eur:.2f} € falsch gezählt – zurückgenommen".replace(".", ","))


def energie_ausbuchen(st: Steuerung, g: GeraetInfo, kwh: float) -> None:
    """FE-0016: falsch gezählte Energie eines Geräts zurücknehmen – Energie und Kosten je Bereich und gesamt, dazu die
    Zähler der Funktion; Kosten zum Preis von jetzt (anderer Preis damals: Rest mit `kosten_ausbuchen`)."""
    preis = float(st.e["preis"])
    for key in ("energie", f"energie:{g.bereich}"):
        st.zaehler_minus(key, kwh)
    for key in ("kosten", f"kosten:{g.bereich}"):
        st.zaehler_minus(key, kwh * preis)
    if (f := st._je_rolle.get(g.rolle)) is not None:
        f.energie_ausbuchen(g, kwh)
    st.protokoll("einstellung", g.bereich, f"{g.name}: {kwh:.2f} kWh falsch gezählt – zurückgenommen".replace(".", ","))


def _energie_buchen(st: Steuerung, g: GeraetInfo, kwh: float) -> None:
    """Energie eines Shelly der Baustelle und seinem Bereich zurechnen; Kosten zum aktuellen Preis."""
    if kwh <= 0 or not st.aktiv:
        return
    preis = st.preis_am(dt_util.now().date())   # Kosten zum Preis, der heute gilt
    for key in ("energie", f"energie:{g.bereich}"):
        st.zaehler_plus(key, kwh)
    for key in ("kosten", f"kosten:{g.bereich}"):
        st.zaehler_plus(key, kwh * preis)
    if (f := st._je_rolle.get(g.rolle)) is not None:
        f.energie_buchen(g, kwh)


def _energie_zaehlen(st: Steuerung, g: GeraetInfo, stand: float | None) -> None:
    """Neuer Stand des Energiezählers eines Shelly; der letzte Stand ist gespeichert (übersteht Neustarts)."""
    if stand is None:
        return
    key, zeit_key, quelle_key = f"stand:{g.id}", f"stand:{g.id}:zeit", f"stand:{g.id}:quelle"
    alt, vorher = st.zaehler.get(key), st.zaehler.get(zeit_key)
    if st.zaehler.get(quelle_key) not in (None, g.energie):
        alt = None   # Audit 0.8.165: anderer Zähler (Plug getauscht, neu konfiguriert) – sein Stand ist kein Zuwachs
    st.zaehler[quelle_key] = g.energie
    jetzt = dt_util.now().timestamp()
    stunden = (jetzt - vorher) / 3600 if vorher is not None else None   # BSM-003: Lücke seit dem letzten Stand
    st.zaehler[key] = zaehlerstand(alt, stand)   # FE-0016: Rauschen verschiebt den Stand nicht
    st.zaehler[zeit_key] = jetzt
    st._energie_buchen(g, energie_zuwachs(alt, stand, stunden))
    st.einstellungen.speichern(ZAEHLER_SPEICHERN_S)


def _zeiten_zaehlen(st: Steuerung, jetzt: datetime) -> None:
    """Zeiten der Funktionen (`zaehlen_geraet`, `zaehlen_bereich`, `zaehlen_ende`) und Energie der Shellys ohne Energiezähler."""
    vorher, st._letzte_auswertung = st._letzte_auswertung, jetzt
    if vorher is None or not st.aktiv:
        return
    stunden = (jetzt - vorher).total_seconds() / 3600
    if stunden <= 0 or stunden > MAX_SCHRITT_H:
        return
    for bid, info in st.bereiche.items():
        in_betrieb = False
        for g in st.geraete_in(bid):
            zustand = st.hass.states.get(g.schalter)
            an = zustand is not None and zustand.state == STATE_ON
            leistung = _zahl(st.hass.states.get(g.leistung)) if g.leistung else None
            if (f := st._je_rolle.get(g.rolle)) is not None and f.zaehlen_geraet(g, an, leistung, stunden):
                in_betrieb = True
            if not g.energie and an:
                st._energie_buchen(g, leistung_integriert(leistung, stunden))
        st._je_art[info.art].zaehlen_bereich(bid, in_betrieb, jetzt, stunden)
    for f in st.funktionen:
        f.zaehlen_ende(jetzt, stunden)
