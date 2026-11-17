"""Energiesignatur je Container (BSM-033.01)."""

import random

import pytest

from logik.signatur import BRAUCHBAR, GUT, MIN_SEITE_ANTEIL, MIN_SPANNE, MIN_TAGE, Signatur, Tag, berechnen, erwartet, je_betrieb


def modell(aussen: float, grenze: float = 15.0, je_grad: float = 2.0, grund: float = 1.0) -> float:
    return grund + je_grad * max(0.0, grenze - aussen)


def tage(temps, rauschen: float = 0.0, automatik: bool = True, **kw) -> list[Tag]:
    r = random.Random(7)
    return [Tag(t, modell(t, **kw) + r.gauss(0, rauschen), automatik) for t in temps]


TEMPS = [-4, -2, 0, 1, 3, 5, 6, 8, 10, 12, 14, 16, 17, 18, 20]


def test_findet_heizgrenze_und_steigung():
    s = berechnen(tage(TEMPS))
    assert s.stand == "gut"
    assert s.grenze == pytest.approx(15.0)
    assert s.kwh_je_grad == pytest.approx(2.0)
    assert s.grundlast == pytest.approx(1.0)
    assert s.bezug is None
    assert s.cv_rmse == pytest.approx(0.0, abs=1e-9)
    assert s.r2 == pytest.approx(1.0)
    assert s.tage == len(TEMPS)


def test_mit_streuung_nahe_am_modell():
    s = berechnen(tage(TEMPS * 2, rauschen=1.0))
    assert s.stand in ("gut", "brauchbar")
    assert s.grenze == pytest.approx(15.0, abs=1.5)
    assert s.kwh_je_grad == pytest.approx(2.0, abs=0.3)
    assert 0 < s.cv_rmse <= BRAUCHBAR
    assert s.rmse == pytest.approx(1.0, abs=0.4)


def test_lernt_mit_zu_wenig_tagen():
    s = berechnen(tage(TEMPS[: MIN_TAGE - 1]))
    assert s.stand == "lernt" and s.grenze is None and "von 10 Tagen" in s.grund
    assert erwartet(s, 0.0) is None


def test_lernt_bei_zu_kleiner_temperaturspanne():
    s = berechnen(tage([5, 6, 7, 8] * 3))
    assert s.stand == "lernt" and "Spanne" in s.grund


def test_gerade_wenn_alle_tage_unter_der_grenze():
    s = berechnen(tage([-5, -3, -1, 0, 2, 4, 5, 6, 8, 10]))
    assert s.grenze is None and s.bezug == 10
    assert s.kwh_je_grad == pytest.approx(2.0)
    assert s.grundlast == pytest.approx(modell(10))
    assert erwartet(s, 0.0) == pytest.approx(modell(0))
    assert erwartet(s, 40.0) == 0.0                 # nie unter null


def test_ohne_zusammenhang_unsicher():
    s = berechnen([Tag(t, 5.0 + (t % 3)) for t in range(0, 20, 2)] + [Tag(1, 3.0)])
    assert s.stand == "unsicher"


def test_starke_streuung_unsicher():
    s = berechnen(tage(TEMPS, rauschen=8.0))
    assert s.stand == "unsicher" and s.cv_rmse > BRAUCHBAR
    assert erwartet(s, 0.0) is None


def test_guetestufen():
    assert GUT < BRAUCHBAR
    s = berechnen(tage(TEMPS * 3, rauschen=2.5))
    assert s.stand == ("gut" if s.cv_rmse <= GUT else "brauchbar" if s.cv_rmse <= BRAUCHBAR else "unsicher")


def test_erwartet_mit_grenze():
    s = berechnen(tage(TEMPS))
    assert erwartet(s, 20.0) == pytest.approx(1.0)
    assert erwartet(s, 5.0) == pytest.approx(21.0)


def test_mit_und_ohne_automatik_getrennt():
    mit = tage(TEMPS, je_grad=1.0)
    ohne = tage(TEMPS, automatik=False, je_grad=3.0, grund=4.0)
    s = je_betrieb(mit + ohne)
    assert s["mit"].kwh_je_grad == pytest.approx(1.0)
    assert s["ohne"].kwh_je_grad == pytest.approx(3.0)
    assert s["ohne"].grundlast == pytest.approx(4.0)
    assert je_betrieb(mit)["ohne"] == Signatur("lernt", 0, "erst 0 von 10 Tagen")


# Gemessene Heiztage eines Containers (Baustelle, 01.10.–06.11.2026, außen °C, kWh) – an ihnen sprang die Hochrechnung
GEMESSEN = [(12.32, 9.91), (10.79, 7.79), (11.13, 6.99), (10.73, 6.59), (12.18, 8.47), (12.14, 7.66), (13.2, 8.21),
            (15.12, 4.86), (13.36, 8.25), (11.69, 6.71), (8.93, 10.24), (10.53, 8.02), (10.09, 8.63), (10.73, 11.3),
            (11.41, 8.74), (10.01, 13.66), (10.29, 10.78), (4.24, 22.17), (4.74, 19.96), (10.16, 10.88), (6.18, 13.35),
            (6.7, 6.31), (6.03, 15.36), (6.14, 14.92), (6.39, 13.73), (6.1, 14.86), (2.75, 17.45)]


def test_grenze_braucht_genug_tage_und_spanne_darunter():
    """Datenbelegung (Bauplan Hochrechnung §3): eine Heizgrenze zählt nur mit mindestens einem Viertel der Tage darunter,
    die dort mindestens 4 K Spanne haben – sonst wäre die Steigung aus drei kalten Tagen bestimmt."""
    s = berechnen([Tag(a, k) for a, k in GEMESSEN[:22]])
    assert s.grenze is None or sum(1 for a, _ in GEMESSEN[:22] if a < s.grenze) >= 22 * MIN_SEITE_ANTEIL
    unter = [a for a, _ in GEMESSEN[:22] if s.grenze is None or a < s.grenze]
    assert max(unter) - min(unter) >= MIN_SPANNE


def test_ein_tag_mehr_kippt_die_signatur_nicht():
    """Befund 17.11.2026: der Tag nach einem Baseline-Lauf (6,7 °C, nur 6,3 kWh – der Container war noch warm) setzte die
    Heizgrenze von 11,5 auf 6,5 °C und die Steigung von 1,7 auf 6,2 kWh/K; der erwartete Jännertag stieg um drei Viertel,
    die Hochrechnung um 760 kWh. Jeder einzelne weitere Tag darf den Jännertag nur wenig verschieben."""
    jaenner = [erwartet(berechnen([Tag(a, k) for a, k in GEMESSEN[:n]]), 0.3) for n in range(20, len(GEMESSEN) + 1)]
    assert all(w is not None for w in jaenner)
    for vorher, nachher in zip(jaenner, jaenner[1:]):
        assert abs(nachher / vorher - 1) < 0.25          # vorher bis +75 %
