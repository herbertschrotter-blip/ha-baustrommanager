"""Soll gleitend nach draußen und nach dem Gefühl (Herbert 01.10.2026)."""

from datetime import date

import pytest

from logik.soll import GEFUEHL_MAX, GleitRegeln, aussen_mittel, gefuehl, gleitend, kurve, startwert

R = GleitRegeln()   # 21–24 °C, +0,1 °C je Grad unter 12 °C, 3 Tage
H = date(2026, 10, 1)


def test_aussen_mittel_wie_en16798():
    tage = {date(2026, 9, 30): 10.0, date(2026, 9, 29): 5.0, date(2026, 9, 28): 0.0}
    assert aussen_mittel(tage, H, 3) == pytest.approx((10 + 0.8 * 5 + 0.64 * 0) / 2.44)
    assert aussen_mittel(tage, H, 1) == 10.0
    assert aussen_mittel({}, H, 3, heute_bisher=7.5) == 7.5      # noch keine Vortage
    assert aussen_mittel({}, H, 3) is None


def test_startwert():
    assert startwert(12.0, R) == 21.0
    assert startwert(2.0, R) == pytest.approx(22.0)
    assert startwert(-40.0, R) == 24.0                             # höchstens
    assert startwert(5.0, GleitRegeln(minimum=19.0)) == pytest.approx(19.7)   # Untergrenze frei einstellbar


def test_gefuehl():
    assert gefuehl([(6.0, -1)], 6.0) == pytest.approx(0.15)        # zu kalt: wärmer
    assert gefuehl([(6.0, 1)], 6.0) == pytest.approx(-0.15)
    assert gefuehl([(6.0, -1)], 8.5) == pytest.approx(0.075)       # ähnliches Wetter: halb so viel
    assert gefuehl([(6.0, -1)], 12.0) == 0.0                       # anderes Wetter: nichts
    assert gefuehl([(6.0, 0)] * 5, 6.0) == 0.0                     # passt
    assert gefuehl([(6.0, -1)] * 50, 6.0) == GEFUEHL_MAX


def test_gleitend_und_kurve():
    assert gleitend(6.4, R, []) == pytest.approx(21.56)
    assert gleitend(15.0, R, [(15.0, 1)] * 5) == 21.0              # nie unter die Untergrenze
    k = kurve(R, [])
    assert k[0] == [-10, 23.2, 23.2] and k[-1] == [20, 21.0, 21.0] and len(k) == 31


def test_versatz_eigenes_soll():
    """BSM-033.09: eigenes Soll eines Containers als Verschiebung gegenüber dem der Baustelle (Regelung und Prognose)."""
    from logik.soll import versatz

    assert versatz(22.5, 21.0) == 1.5 and versatz(None, 21.0) == 0.0
