"""Containergröße (AN-0014)."""

import pytest

from logik.groesse import A_M3, a_geschaetzt, DOPPEL_M2, anzeige, art, EINZEL_M2, aufheiz_min, flaeche, je_m2, rate_geschaetzt, volumen


def test_flaeche_und_volumen():
    assert flaeche(None) == EINZEL_M2 and flaeche(0) == EINZEL_M2 and flaeche(20) == 20
    assert round(volumen(EINZEL_M2)) == 31 and round(volumen(DOPPEL_M2)) == 64


def test_rate_aus_der_groesse():
    assert rate_geschaetzt(None) == pytest.approx(2.5)
    assert rate_geschaetzt(DOPPEL_M2) == pytest.approx(2.5 * 13.5 / 28)


def test_aufheiz_min():
    assert aufheiz_min(None, innen=None, soll=21) is None
    assert aufheiz_min(None, innen=16, soll=21) == 120            # 5 °C / 2,5 °C/h = 2 h
    assert aufheiz_min(DOPPEL_M2, innen=16, soll=21) == 250       # 5 / 1,205 = 4,15 h → 249 → 250 min
    assert aufheiz_min(None, innen=22, soll=21) == 0


def test_je_m2():
    assert je_m2(27, None) == 2.0 and je_m2(None, 28) is None


def test_art_und_anzeige():
    assert art(None) == "einzel" and art(13.5) == "einzel" and art(28) == "doppel" and art(20) == "frei"
    a = anzeige(28)
    assert a["art"] == "doppel" and round(a["m3"]) == 64 and a["hoehe"] == 2.3 and a["typen"]["einzel"]["breite"] == 2.29


def test_a_geschaetzt_aus_rauminhalt():
    """0.8.183: a des Raummodells = A_M3 ÷ Rauminhalt – Einzel ≈ 3,9, Doppel ≈ 1,9 °C/h je kW."""
    assert a_geschaetzt(None) == pytest.approx(A_M3 / (EINZEL_M2 * 2.30))
    assert 3.5 < a_geschaetzt(EINZEL_M2) < 4.2 and 1.7 < a_geschaetzt(DOPPEL_M2) < 2.0
