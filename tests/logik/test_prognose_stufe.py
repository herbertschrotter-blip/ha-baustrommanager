"""Prognose V2, P3 (BSM-033.08): Validierungsmaße und Evidenzstufen A–D (Bauvorlage CGR-2026-10-11-hochrechnung r5 §9.1,
Anhang A „Stufen“, „D und Rückstufung“). Die Prognosestufe (Extrapolation, Start, Frost) kommt mit P4a."""

from dataclasses import replace
from datetime import UTC, datetime, timedelta

import pytest

from logik.prognose_regeln import PrognoseRegeln
from logik.prognose_stufe import betriebsabhaengig, evidenz_h, stufe_min, validiere, validierung_bestanden
from logik.prognose_typen import MODELL_VERSION, HEvidenz, HSchaetzung, Intervall, ValidierungsPunkt

R = PrognoseRegeln()
CUT = datetime(2026, 12, 1, tzinfo=UTC)


def h_schaetzung(fenster: int, tage: int, stunden: float, rel: float | None, *, methode: str = "stationaer",
                 hoechstens: str = "D", h: float | None = 0.10) -> HSchaetzung:
    ev = HEvidenz(fenster, tage, stunden, None, rel, None, None, None, None, None, None, 0, 0, (), hoechstens)   # type: ignore[arg-type]
    return HSchaetzung("c1", "k", MODELL_VERSION, CUT, methode, h, None, None, ev)   # type: ignore[arg-type]


def punkte(fehler=(3.5, 3.5, -3.5, 0, 0, 0, 0), *, ab=CUT, ist=10.0):
    """Sieben Tage nach dem Schnitt, Außen 0…6 °C; Modell = Ist + Fehler."""
    return [ValidierungsPunkt(Intervall(ab + timedelta(days=i), ab + timedelta(days=i + 1)), ist, ist + f, None, None,
                              float(i), True, "k") for i, f in enumerate(fehler)]


def test_stufe_c():
    """Stationär 12 Fenster / 3 Tage / 24 h, relativ 0,20 → C (ohne Validierung kein D)."""
    assert evidenz_h(h_schaetzung(12, 3, 24.0, 0.20), None, R) == "C"


@pytest.mark.parametrize(("fenster", "tage", "stunden", "rel"), [(11, 3, 24.0, 0.2), (12, 2, 24.0, 0.2), (12, 3, 23.9, 0.2),
                                                                 (12, 3, 24.0, 0.31), (12, 3, 24.0, None)])
def test_unter_c_nicht_identifiziert(fenster, tage, stunden, rel):
    assert evidenz_h(h_schaetzung(fenster, tage, stunden, rel), None, R) == "A"


def test_stufe_d_mit_holdout():
    """30 Fenster / 7 Tage, relativ 0,10, 7 echte Holdout-Tage, Spanne 6 K, WAPE 0,15, Bias 0,05 → D."""
    v = validiere("h", CUT, punkte(), R, zeitzone="Europe/Vienna")
    assert v.wape == pytest.approx(0.15) and v.bias_rel == pytest.approx(0.05)
    assert (v.tage, v.aussen_spanne_k, v.unabhaengig) == (7, 6.0, True)
    assert validierung_bestanden(v, R)
    assert evidenz_h(h_schaetzung(30, 7, 60.0, 0.10), v, R) == "D"
    assert evidenz_h(h_schaetzung(29, 7, 60.0, 0.10), v, R) == "C"
    assert evidenz_h(h_schaetzung(30, 7, 60.0, 0.16), v, R) == "C"


def test_holdout_im_training_kein_d():
    v = validiere("h", CUT, punkte(ab=CUT - timedelta(days=1)), R)
    assert not v.unabhaengig and evidenz_h(h_schaetzung(30, 7, 60.0, 0.10), v, R) == "C"


def test_validierung_schwellen():
    assert not validierung_bestanden(validiere("h", CUT, punkte()[:6], R), R)            # 6 Tage
    assert not validierung_bestanden(validiere("h", CUT, punkte((6, 6, -6, 0, 0, 0, 0)), R), R)   # WAPE 0,257
    assert not validierung_bestanden(validiere("h", CUT, punkte((8, 0, 0, 0, 0, 0, 0)), R), R)    # Bias 0,114
    assert not validierung_bestanden(None, R)


def test_validierung_nullnenner():
    """ΣE_ist = 0 → WAPE und Bias None, kein D."""
    v = validiere("h", CUT, punkte(ist=0.0), R)
    assert v.wape is None and v.bias_rel is None and not validierung_bestanden(v, R)
    leer = validiere("h", CUT, [], R)
    assert leer.wape is None and leer.tage == 0 and not leer.unabhaengig


def test_temperatur_rmse():
    p = [replace(x, innen_ist_c=20.0, innen_modell_c=20.0 + d) for x, d in zip(punkte(), (0.3, -0.3, 0.3, -0.3, 0, 0, 0))]
    assert validiere("h", CUT, p, R).temperatur_rmse_k == pytest.approx((0.36 / 7) ** 0.5)


def test_ersatz_hoechstens_c_und_tagesregression_b():
    v = validiere("h", CUT, punkte(), R)
    assert evidenz_h(h_schaetzung(30, 7, 60.0, 0.10, hoechstens="C"), v, R) == "C"
    assert evidenz_h(h_schaetzung(0, 3, 30.0, None, methode="tagesregression"), v, R) == "B"
    assert evidenz_h(h_schaetzung(0, 2, 30.0, None, methode="tagesregression"), v, R) == "A"
    assert evidenz_h(h_schaetzung(30, 7, 60.0, 0.10, h=None), v, R) == "A"
    assert evidenz_h(h_schaetzung(30, 7, 60.0, 0.10, methode="keine"), v, R) == "A"


def test_stufe_min_und_betriebsabhaengig():
    assert stufe_min("D", "B", "C") == "B"
    assert betriebsabhaengig(0.10, 0.13, R) is True and betriebsabhaengig(0.10, 0.12, R) is False
    assert betriebsabhaengig(None, 0.1, R) is None and betriebsabhaengig(0.0, 0.1, R) is None
