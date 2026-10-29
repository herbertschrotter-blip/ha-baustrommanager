"""Zählen: Zählerstände, Mittel im Betrieb, Heizperiode, Hochrechnung."""

import pytest

from logik.zaehlen import (
    gradstunden,
    mittel,
    rate,
    energie_zuwachs,
    sprung_grenze,
    hochrechnung,
    leistung_integriert,
    mittel_im_betrieb,
    tage_heizperiode,
)


def test_energie_zuwachs():
    assert energie_zuwachs(10.0, 10.5) == pytest.approx(0.5)
    assert energie_zuwachs(10.0, 0.2) == pytest.approx(0.2)  # Shelly zählt neu
    assert energie_zuwachs(None, 3.0) == 0.0
    assert energie_zuwachs(1.0, None) == 0.0
    assert energie_zuwachs(1.0, 500.0) == 0.0  # unglaubwürdig


def test_leistung_integriert():
    assert leistung_integriert(2000, 0.5) == pytest.approx(1.0)
    assert leistung_integriert(None, 1) == 0.0
    assert leistung_integriert(2000, 0) == 0.0


def test_mittel_im_betrieb_nur_waehrend_heizen():
    assert mittel_im_betrieb(None, 0.0) is None
    assert mittel_im_betrieb(None, 2000) == 2000
    assert mittel_im_betrieb(2000, 0.0) == 2000  # Thermostat aus: Mittel bleibt
    assert mittel_im_betrieb(2000, 1800) == pytest.approx(1990)


def test_tage_heizperiode():
    assert tage_heizperiode(10, 4, 2026) == 212  # 1.10.2026–30.4.2027
    assert tage_heizperiode(10, 3, 2026) == 182
    assert tage_heizperiode(1, 12, 2027) == 365


def test_tage_heizperiode_bis_ende_der_baustelle():
    from datetime import date
    assert tage_heizperiode(10, 4, 2026, date(2027, 1, 31)) == 123  # 1.10.2026–31.1.2027
    assert tage_heizperiode(10, 4, 2026, date(2027, 6, 30)) == 212  # Ende nach der Heizperiode: ganze Periode
    assert tage_heizperiode(10, 4, 2026, date(2026, 9, 1)) == 0     # schon vorher zu Ende


def test_hochrechnung():
    assert hochrechnung(100, 0.5, 30) is None
    assert hochrechnung(100, 10, 30) == pytest.approx(300)


def test_temperaturverhalten():
    assert rate(10.0, 13.0, 1.5) == pytest.approx(2.0)
    assert rate(10.0, 13.0, 0) is None
    assert mittel(None, 2.0) == 2.0
    assert mittel(2.0, 4.0) == pytest.approx(2.6)
    assert mittel(2.0, None) == 2.0
    assert gradstunden(18.0, 3.0, 2.0) == pytest.approx(30.0)
    assert gradstunden(5.0, 8.0, 2.0) == 0.0
    assert gradstunden(None, 3.0, 1.0) == 0.0


def test_ruecksprung_ist_rauschen_kein_neustart():
    """FE-0016: der Shelly springt manchmal ~1 Wh zurück (32,688155 → 32,687104) – vorher zählte das den ganzen Stand
    (32,7 kWh) noch einmal. Jetzt zählt es nichts, der gemerkte Stand bleibt; ein echter Neustart zählt weiter."""
    from logik.zaehlen import zaehlerstand
    assert energie_zuwachs(32.688155, 32.687104) == 0.0
    assert zaehlerstand(32.688155, 32.687104) == 32.688155
    assert energie_zuwachs(32.688155, 32.720525) == pytest.approx(0.03237)   # danach normal weiter
    assert energie_zuwachs(14.48, 0.0) == 0.0 and zaehlerstand(14.48, 0.0) == 0.0     # echter Neustart
    assert energie_zuwachs(14.48, 0.3) == pytest.approx(0.3)
    assert zaehlerstand(None, 5.0) == 5.0


def test_luecke_nach_ausfall():
    """BSM-003: nach einem langen Ausfall zählt der ganze Verbrauch, ein unmöglicher Sprung weiter nicht."""
    assert sprung_grenze(None) == 50.0 and sprung_grenze(0.0) == 50.0 and sprung_grenze(2.0) == 50.0
    assert sprung_grenze(72.0) == pytest.approx(72 * 3.68 * 1.1)
    # 3 Tage Ausfall, 2-kW-Heizkörper 10 h je Tag: 60 kWh – vorher verworfen, jetzt gezählt
    assert energie_zuwachs(100.0, 160.0) == 0.0
    assert energie_zuwachs(100.0, 160.0, stunden=72.0) == pytest.approx(60.0)
    # mehr, als ein Plug in der Zeit schalten kann (falscher Sensor) – weiter verworfen
    assert energie_zuwachs(100.0, 400.0, stunden=72.0) == 0.0
    # kurze Lücke: alte Grenze bleibt
    assert energie_zuwachs(100.0, 160.0, stunden=1.0) == 0.0
    # Neustart des Shelly während des Ausfalls: neuer Stand ist der Zuwachs
    assert energie_zuwachs(100.0, 55.0, stunden=72.0) == pytest.approx(55.0)
    # Rauschen bleibt Rauschen
    assert energie_zuwachs(32.688155, 32.687104, stunden=72.0) == 0.0


def test_ersparnis_fortlaufend_zum_preis_des_tages():
    """FE-0035: Sensor „Ersparnis“ bucht jede Änderung zum Preis, der gerade gilt (wie „Kosten“); der Start übernimmt den
    bisherigen Wert (Summe × Preis von heute) – kein Sprung in der Statistik."""
    from logik.zaehlen import ersparnis_buchen
    kwh, eur = ersparnis_buchen(None, None, 100.0, 0.28)   # Umstellung: bisher 100 kWh × 0,28 € angezeigt
    assert (kwh, eur) == (100.0, pytest.approx(28.0))
    kwh, eur = ersparnis_buchen(kwh, eur, 150.0, 0.20)    # neuer Preis gilt nur für die neuen 50 kWh
    assert eur == pytest.approx(28.0 + 10.0)
    kwh, eur = ersparnis_buchen(kwh, eur, 140.0, 0.20)    # geheizt ohne „ohne“-Zuwachs: Ersparnis sinkt
    assert kwh == 140.0 and eur == pytest.approx(36.0)
