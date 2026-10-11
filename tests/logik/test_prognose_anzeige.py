"""Prognose V2, P4a (BSM-033.09): fertige Anzeige – Text-/Bandmatrix, Haltebedarf, Annahmen, fehlende Modelle,
negative Einsparung, Kosten und Prozent (Bauvorlage CGR-2026-10-11-hochrechnung r5 §9.2)."""

from __future__ import annotations

from dataclasses import replace
from datetime import UTC, datetime, timedelta

import pytest

from logik.prognose_anzeige import (
    FEHLENDE,
    HALTE_VERGLEICH,
    SONDERBETRIEB,
    STATUS,
    anzeige,
    anzeige_aus,
    kwh_text,
    zahl,
)
from logik.prognose_modell import ZENTRAL, EuroSumme, aggregiere
from logik.prognose_regeln import PrognoseRegeln
from logik.prognose_typen import (
    MODELL_VERSION,
    EnergieIntervall,
    Intervall,
    IstIntervall,
    PreisIntervall,
    StufenErgebnis,
    SzenarioLauf,
    VergleichErgebnis,
    ZeitraumErgebnis,
)

R = PrognoseRegeln()
T0 = datetime(2026, 11, 10, 6, tzinfo=UTC)
ZEIT = Intervall(T0, T0 + timedelta(hours=10))
JETZT = T0


def stufe(p: str = "C", *, methode: str = "stationaer", gruende: tuple[str, ...] = (), extra: bool = False) -> StufenErgebnis:
    return StufenErgebnis(p, p, methode, extra, gruende)   # type: ignore[arg-type]


def ze(mitte: float | None, unten: float | None = None, oben: float | None = None, *, s: StufenErgebnis | None = None,
       art: str = "verbrauch", fehlend: tuple[str, ...] = (), gruende: tuple[str, ...] = ()) -> ZeitraumErgebnis:
    return ZeitraumErgebnis(ZEIT, mitte, unten if unten is not None else mitte, oben if oben is not None else mitte, None, True,
                            fehlend, art if mitte is not None else "keine", s or stufe(), gruende)   # type: ignore[arg-type]


def vergleich(mit: ZeitraumErgebnis, ohne: ZeitraumErgebnis, gespart: ZeitraumErgebnis, prozent: float | None = None, *,
              sonder: float = 0.0, baseline: float = 0.0, vergleichbar: bool = True) -> VergleichErgebnis:
    return VergleichErgebnis(ZEIT, mit, ohne, gespart, prozent, sonder, baseline, vergleichbar, ())


EURO = (EuroSumme(3.0, 2.0, 4.0), EuroSumme(4.0, 3.0, 5.0), EuroSumme(1.0, 0.0, 2.0))


@pytest.mark.parametrize("p", ["A", "B", "C", "D"])
def test_textmatrix(p):
    v = vergleich(ze(10.0, s=stufe(p)), ze(13.0, s=stufe(p, methode="plateau")), ze(3.0, s=stufe(p, methode="vergleich")), 23.0)
    a = anzeige_aus(v, EURO, MODELL_VERSION, JETZT, JETZT)
    assert a.mit.status_text == STATUS["mit"][p] and a.ohne.status_text == STATUS["ohne"][p]
    assert a.gespart.status_text == STATUS["gespart"][p]
    if p == "A":   # Stufe A: kein Zukunftswert, kein %
        assert a.mit.wert_kwh is None and a.mit.eur is None and a.gespart_prozent is None and a.mit.wert_text == "—"
    else:
        assert a.mit.wert_kwh == 10.0 and a.mit.eur == 3.0 and a.gespart_prozent == 23.0 and a.mit.wert_text == "Verbrauch"
    assert a.modell_version == MODELL_VERSION and a.mit.stufe == p


def test_texte_der_tabelle():
    assert STATUS["mit"] == {"A": "Noch nicht schätzbar", "B": "Vorläufige Schätzung", "C": "Aus Messungen geschätzt",
                             "D": "Im bisherigen Betrieb geprüft"}
    assert STATUS["gespart"]["C"] == "Voraussichtliche Ersparnis"


def test_ohne_duty_grobe_schaetzung():
    v = vergleich(ze(10.0), ze(13.0, s=stufe("B", methode="duty")), ze(3.0, s=stufe("B")))
    assert anzeige_aus(v, EURO, MODELL_VERSION, JETZT, JETZT).ohne.status_text == "Grobe Schätzung"


def test_haltebedarf_und_hinweise():
    mit = ze(10.0, 10.0, 20.0, art="haltebedarf",
             s=stufe("C", gruende=("start_unbekannt", "frost_unvalidiert"), extra=True),
             gruende=("aufheizen_unmodelliert", "frost_unvalidiert", "leistung_limitiert", "duty"))
    ohne = ze(18.0, gruende=("thermostat_angenommen",))
    v = vergleich(mit, ohne, ze(None, -2.0, 8.0))
    a = anzeige_aus(v, EURO, MODELL_VERSION, JETZT, JETZT)
    assert a.mit.wert_text == "Haltebedarf" and a.mit.mitte_art == "haltebedarf"
    assert a.mit.band_text == "Möglicher Bereich: 10,0–20,0 kWh"
    assert a.mit.hinweise == ("Haltebedarf: Das zusätzliche Aufheizen ist noch nicht bestimmt.",
                              "Der Einfluss kälteren Wetters ist noch nicht bestimmt.",
                              "Frostverbrauch noch nicht geprüft.", "Für kältere Bedingungen fehlen noch Messungen.",
                              "Die Heizleistung kann für das gewünschte Soll zu klein sein.")
    assert a.ohne.hinweise == ("Die unveränderte Thermostatstellung ist angenommen.",)
    assert a.gespart.wert_kwh is None and a.gespart.band_text == "Möglicher Bereich: -2,0–8,0 kWh"
    assert a.vergleichshinweis == HALTE_VERGLEICH and a.gespart_prozent is None


def test_technische_grenze_und_fehlende_modelle():
    mit = ze(None, 0.0, 40.0, fehlend=("c2", "c3"), s=stufe("A"))
    v = vergleich(mit, ze(None, s=stufe("A")), ze(None, s=stufe("A")))
    a = anzeige_aus(v, EURO, MODELL_VERSION, JETZT, JETZT)
    assert a.mit.band_text == "Technische Grenze: höchstens 40,0 kWh; keine Verbrauchsschätzung."
    assert FEHLENDE.format(n=2) in a.mit.hinweise and a.mit.wert_kwh is None and a.mit.eur is None
    assert a.ohne.status_text == "Vergleich noch nicht möglich" and a.gespart.status_text == "Noch nicht berechenbar"


def test_ersatz_und_sonderbetrieb():
    mit = ze(10.0, gruende=("ersatzpfad",))
    a = anzeige_aus(vergleich(mit, ze(13.0), ze(3.0), sonder=2.0), EURO, MODELL_VERSION, JETZT, JETZT)
    assert "Ältere Messdaten wurden mit vereinfachten Prüfungen verwendet." in a.mit.hinweise
    assert a.vergleichshinweis == SONDERBETRIEB


def test_gemessen():
    v = vergleich(ze(10.0, s=StufenErgebnis("D", "D", "gemessen", False, ())), ze(13.0), ze(3.0))
    assert anzeige_aus(v, EURO, MODELL_VERSION, JETZT, JETZT).mit.status_text == "Gemessen"


def test_zahlen_deutsch():
    assert zahl(1234.5, 1) == "1.234,5" and kwh_text(12.345) == "12,3" and kwh_text(1234.5) == "1.234"
    assert kwh_text(-2.0) == "-2,0"


def test_kosten_und_prozent_zeitgenau():
    """€ je Intervall mit seinem Preis (Preiswechsel um 11 Uhr); negative Ersparnis sichtbar, % aus vollständigem Ohne."""
    s = stufe("C")
    es_mit = tuple(EnergieIntervall(Intervall(T0 + timedelta(hours=h), T0 + timedelta(hours=h + 1)), "c1", 1.2, 1.2, 1.2,
                                    1.2, 2.0, "verbrauch", s, ()) for h in range(10))
    es_ohne = tuple(replace(e, mitte_kwh=1.0, unten_kwh=1.0, oben_kwh=1.0) for e in es_mit)
    laeufe = [SzenarioLauf(ZENTRAL, es_mit, es_ohne)]
    preise = [PreisIntervall(Intervall(T0 - timedelta(days=1), T0 + timedelta(hours=5)), 0.20),
              PreisIntervall(Intervall(T0 + timedelta(hours=5), T0 + timedelta(days=1)), 0.30)]
    (v,) = aggregiere(laeufe, [ZEIT], [], R, gemessen_bis=T0)
    a = anzeige(v, laeufe, [], preise, MODELL_VERSION, T0, T0)
    assert a.mit.eur == pytest.approx(5 * 1.2 * 0.2 + 5 * 1.2 * 0.3)
    assert a.ohne.eur == pytest.approx(5 * 0.2 + 5 * 0.3)
    assert a.gespart.wert_kwh == pytest.approx(-2.0) and a.gespart.eur == pytest.approx(-0.5)
    assert a.gespart_prozent == pytest.approx(-20.0)
    a2 = anzeige(v, laeufe, [], preise[:1], MODELL_VERSION, T0, T0)
    assert a2.mit.eur is None and a2.gespart.eur is None   # Preis fehlt ab 11 Uhr → kein €
    ist = [IstIntervall(Intervall(T0, T0 + timedelta(hours=2)), "c1", 3.0)]
    (v3,) = aggregiere(laeufe, [ZEIT], ist, R, gemessen_bis=T0 + timedelta(hours=2))
    a3 = anzeige(v3, laeufe, ist, preise, MODELL_VERSION, T0 + timedelta(hours=2), T0)
    assert a3.mit.wert_kwh == pytest.approx(3.0 + 8 * 1.2)
    assert a3.mit.eur == pytest.approx(3.0 * 0.2 + 3 * 1.2 * 0.2 + 5 * 1.2 * 0.3)
