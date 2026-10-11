"""Prognose V2: fertige Anzeige mit Texten, € und % (Bauvorlage CGR-2026-10-11-hochrechnung r5 §9.2) – ohne HA-Code.

Lieferung P4a (BSM-033.09). Die Seite zeigt nur an: Status je Stufe und Seite (Tabelle §9.2), Wertbezeichnung
(„Haltebedarf“ statt Gesamtverbrauch), Bandtext („Möglicher Bereich …“ bzw. „Technische Grenze …“ ohne Mitte), Zusatztexte
nach den Gründen, € aus der zeitgenauen Rechnung (`prognose_modell.Aggregat.euro`) und die Ersparnis in %. Stufe A hat
keinen Zukunftswert. Keine Wahrscheinlichkeitsangabe.
"""

from __future__ import annotations

from collections.abc import Sequence
from datetime import datetime

from .prognose_modell import Aggregat, EuroSumme
from .prognose_typen import (
    AnzeigeVergleich,
    AnzeigeWert,
    IstIntervall,
    PreisIntervall,
    Stufe,
    SzenarioLauf,
    VergleichErgebnis,
    ZeitraumErgebnis,
)

STATUS: dict[str, dict[Stufe, str]] = {
    "mit": {"A": "Noch nicht schätzbar", "B": "Vorläufige Schätzung", "C": "Aus Messungen geschätzt",
            "D": "Im bisherigen Betrieb geprüft"},
    "ohne": {"A": "Vergleich noch nicht möglich", "B": "Erste Vergleichsmessung", "C": "Aus Vergleichsmessungen geschätzt",
             "D": "Mit Vergleichsmessungen geprüft"},
    "gespart": {"A": "Noch nicht berechenbar", "B": "Vorläufiger Vergleich", "C": "Voraussichtliche Ersparnis",
                "D": "Im bisherigen Bereich geprüft"},
}
STATUS_OHNE_DUTY = "Grobe Schätzung"
STATUS_GEMESSEN = "Gemessen"
STATUS_LUECKE = "Teilweise gemessen"
WERT_TEXT = {"verbrauch": "Verbrauch", "haltebedarf": "Haltebedarf", "duty": "Grobe Schätzung", "keine": "—"}
WERT_TEXT_GESPART = {"verbrauch": "Ersparnis", "haltebedarf": "Ersparnis", "duty": "Ersparnis", "keine": "—"}

HINWEISE: tuple[tuple[str, str], ...] = (
    ("aufheizen_unmodelliert", "Haltebedarf: Das zusätzliche Aufheizen ist noch nicht bestimmt."),
    ("ersatz", "Ältere Messdaten wurden mit vereinfachten Prüfungen verwendet."),
    ("thermostat_angenommen", "Die unveränderte Thermostatstellung ist angenommen."),
    ("duty", "Der Einfluss kälteren Wetters ist noch nicht bestimmt."),
    ("frost_unvalidiert", "Frostverbrauch noch nicht geprüft."),
    ("extrapolation", "Für kältere Bedingungen fehlen noch Messungen."),
    ("leistung_limitiert", "Die Heizleistung kann für das gewünschte Soll zu klein sein."),
    ("messluecke", "Für einzelne Tage fehlen Messwerte."),
)
FEHLENDE = "Für {n} Container fehlt noch eine Schätzung."
SONDERBETRIEB = "Sonderbetrieb und Vergleichsmessungen sind getrennt ausgewiesen."
HALTE_VERGLEICH = "Modellvergleich des Haltebedarfs"


def zahl(x: float, stellen: int = 0) -> str:
    """Deutsche Schreibweise: Tausenderpunkt, Dezimalkomma."""
    text = f"{x:,.{stellen}f}"
    return text.replace(",", " ").replace(".", ",").replace(" ", ".")


def kwh_text(x: float) -> str:
    return zahl(x, 1 if abs(x) < 100 else 0)


def _hinweise(z: ZeitraumErgebnis) -> tuple[str, ...]:
    codes = set(z.gruende) | set(z.stufe.gruende)
    if z.stufe.extrapolation:
        codes.add("extrapolation")
    aus = [text for code, text in HINWEISE if code in codes]
    if "ersatz" not in codes and any(c in codes for c in ("ersatzpfad", "kontext_rekonstruiert")):
        aus.insert(1, HINWEISE[1][1])
    if z.fehlende_bereiche:
        aus.append(FEHLENDE.format(n=len(z.fehlende_bereiche)))
    return tuple(dict.fromkeys(aus))


def _wert(z: ZeitraumErgebnis, euro: EuroSumme, seite: str) -> AnzeigeWert:
    stufe: Stufe = z.stufe.prognose
    gemessen = z.stufe.methode in ("gemessen", "gemessen_luecke")
    mitte = z.mitte_kwh if stufe != "A" or gemessen else None
    if gemessen and seite == "mit":
        status = STATUS_GEMESSEN if z.stufe.methode == "gemessen" and z.ist_vollstaendig else STATUS_LUECKE
    elif seite == "ohne" and stufe == "B" and z.stufe.methode == "duty":
        status = STATUS_OHNE_DUTY
    else:
        status = STATUS[seite][stufe]
    band = None
    if z.unten_kwh is not None and z.oben_kwh is not None:
        if mitte is None and seite != "gespart":
            band = f"Technische Grenze: höchstens {kwh_text(z.oben_kwh)} kWh; keine Verbrauchsschätzung."
        elif mitte is None or abs(z.oben_kwh - z.unten_kwh) > 1e-9:
            band = f"Möglicher Bereich: {kwh_text(z.unten_kwh)}–{kwh_text(z.oben_kwh)} kWh"
    art = z.mitte_art if mitte is not None else "keine"
    texte = WERT_TEXT_GESPART if seite == "gespart" else WERT_TEXT
    return AnzeigeWert(
        wert_kwh=mitte, unten_kwh=z.unten_kwh, oben_kwh=z.oben_kwh, eur=euro.mitte if mitte is not None else None,
        unten_eur=euro.unten, oben_eur=euro.oben, status_text=status, wert_text=texte[art], band_text=band,
        hinweise=_hinweise(z), stufe=stufe, mitte_art=art)


def anzeige_aus(ergebnis: VergleichErgebnis, euro: tuple[EuroSumme, EuroSumme, EuroSumme], modell_version: str,
                gemessen_bis: datetime, aktualisiert_am: datetime) -> AnzeigeVergleich:
    """Fertige Anzeige aus Vergleich und € (schneller Weg, wenn das Aggregat schon da ist)."""
    hinweis = None
    if ergebnis.ist_sonderbetrieb_kwh > 0 or ergebnis.ist_baseline_kwh > 0:
        hinweis = SONDERBETRIEB
    elif ergebnis.mit.mitte_art == "haltebedarf" and ergebnis.vergleichbar:
        hinweis = HALTE_VERGLEICH
    return AnzeigeVergleich(
        mit=_wert(ergebnis.mit, euro[0], "mit"), ohne=_wert(ergebnis.ohne, euro[1], "ohne"),
        gespart=_wert(ergebnis.gespart, euro[2], "gespart"),
        gespart_prozent=ergebnis.gespart_prozent if ergebnis.gespart.stufe.prognose != "A" else None,
        vergleichshinweis=hinweis, modell_version=modell_version, gemessen_bis=gemessen_bis, aktualisiert_am=aktualisiert_am)


def anzeige(
    ergebnis: VergleichErgebnis, laeufe: Sequence[SzenarioLauf], ist: Sequence[IstIntervall],
    preise: Sequence[PreisIntervall], modell_version: str, gemessen_bis: datetime, aktualisiert_am: datetime,
) -> AnzeigeVergleich:
    """Anzeige eines Vergleichs (§3); € zeitgenau aus denselben Läufen wie die kWh."""
    ids = tuple(dict.fromkeys([e.bereich_id for l in laeufe for e in (*l.mit, *l.ohne)] + [x.bereich_id for x in ist]))
    agg = Aggregat((ergebnis.zeit,), gemessen_bis, ids, preise)
    for l in laeufe:
        agg.hinzufuegen(l)
    agg.ist_hinzufuegen(ist)
    return anzeige_aus(ergebnis, agg.euro(0, ergebnis), modell_version, gemessen_bis, aktualisiert_am)
