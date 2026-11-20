"""Hochrechnung je Bauart (0.8.176, logik/bauart): gemeinsam lernen je Einzel/Doppel × Heizkörper-Typ, je Einheit,
ohne Anlauftage; Faktor je Container; Hinweis bei Abweichung; Ersatz für eine Bauart ohne Tage."""

from datetime import date, timedelta

import pytest

from logik.bauart import (
    ANLAUF_TAGE, DAEMPFUNG_TAGE, HINWEIS_MIN_TAGE, abweichung, anlauf, bauart, einheiten, faktor, faktor_prozent, groesse, hinweis,
    modelle,
)
from logik.hochrechnung import TagRoh, baustelle, container_rest, hgt, klima_tag, tage
from logik.signatur import Signatur, erwartet

HEUTE = date(2026, 11, 20)
BEGINN = date(2026, 10, 1)
KLIMA = (0.0, 2.0, 6.0, 11.0, 15.0, 19.0, 21.0, 20.0, 16.0, 10.0, 5.0, 1.0)


def reihe(n: int = 24, f: float = 1.0, start: date = date(2026, 10, 20)) -> list[TagRoh]:
    """Ganze Tage mit Heizgrenze 15 °C: 3 kWh Grundlast + 1 kWh je Grad (× f), leicht gestreut."""
    aus = []
    for i in range(n):
        a = -2.0 + (i * 7) % 17
        aus.append(TagRoh(start + timedelta(days=i), f * (3.0 + max(0.0, 15.0 - a) + (0.3 if i % 2 else -0.3)), a, 86400))
    return aus


def test_bauart_und_einheiten():
    assert groesse(False, None) == "einzel" and groesse(True, None) == "doppel"
    assert groesse(False, 28.0) == "doppel"            # Fläche eines Doppelcontainers, Symbol nicht gesetzt (Review)
    assert groesse(False, 20.0) == "frei" and groesse(True, 20.0) == "doppel"
    assert bauart("konvektor", "einzel", "x") == "konvektor:einzel"
    assert bauart("oelradiator", "doppel", "x") == "oelradiator:doppel"
    assert bauart("oelradiator", "frei", "x") == "oelradiator:frei:x"   # freie Fläche: für sich
    assert bauart("", "doppel", "x") == ":x"   # ohne Heizkörper: eine Bauart für sich
    assert einheiten("doppel") == 2 and einheiten("einzel") == 1 and einheiten("frei") == 1
    assert faktor_prozent(1.12) == 12 and faktor_prozent(0.9) == -10 and faktor_prozent(1.03) is None


def test_anlauftage_zaehlen_nicht():
    """003 am 01./02.10.: 18 und 14 kWh bei 11 °C statt 8 – das erste Aufheizen gehört nicht in die Signatur."""
    r = reihe(6)
    assert anlauf(list(reversed(r)), None) == {r[0].datum, r[1].datum} and ANLAUF_TAGE == 2
    # vor allen anderen Filtern: ein Tag ohne Verbrauch oder ohne Heizplan ist kein Anlauftag, ein Ausfalltag schon
    leer = TagRoh(r[0].datum, 0.0, 5.0, 86400)
    assert anlauf([leer, *r[1:]], None) == {r[1].datum, r[2].datum}
    assert anlauf(r, frozenset(t.datum for t in r[1:])) == {r[1].datum, r[2].datum}
    ausfall = TagRoh(r[0].datum, 3.0, 5.0, 1000)
    assert anlauf([ausfall, *r[1:]], None) == {r[0].datum, r[1].datum}


def test_gemeinsam_je_einheit():
    """Zwei gleiche Einzelcontainer und ein Doppelcontainer mit doppeltem Verbrauch: dieselbe Signatur je Einheit."""
    gez = {"a": reihe(), "b": reihe(start=date(2026, 10, 21)), "d": reihe(f=2.0)}
    arten = {"a": "k:einzel", "b": "k:einzel", "d": "k:doppel"}
    m = modelle(gez, arten, {"a": "k", "b": "k", "d": "k"}, {"a": 1, "b": 1, "d": 2})
    assert m["k:einzel"].signatur.tage == 48 and m["k:einzel"].container == ("a", "b")
    assert m["k:doppel"].signatur.tage == 24 and m["k:doppel"].quelle == "bauart"
    assert erwartet(m["k:doppel"].signatur, 0.0) == pytest.approx(erwartet(m["k:einzel"].signatur, 0.0), rel=0.05)


def test_allein_in_der_bauart_wie_eigene_signatur():
    """Ein Container allein in seiner Bauart: Faktor 1, die Hochrechnung wie mit den eigenen Tagen."""
    gez = {"a": reihe()}
    m = modelle(gez, {"a": "o:doppel"}, {"a": "o"}, {"a": 2})["o:doppel"]
    f = faktor(gez["a"], m, 2)
    assert f.roh == pytest.approx(1.0) and f.wert == pytest.approx(1.0)
    ende = HEUTE + timedelta(days=30)
    eigen = container_rest(gez["a"], HEUTE, ende, {}, KLIMA, BEGINN)
    bau = container_rest(gez["a"], HEUTE, ende, {}, KLIMA, BEGINN, modell=m, skala=2 * f.wert)
    assert bau.methode == eigen.methode == "signatur"
    assert bau.rest_kwh == pytest.approx(eigen.rest_kwh)
    assert bau.signatur.grenze == eigen.signatur.grenze and bau.signatur.kwh_je_grad == pytest.approx(eigen.signatur.kwh_je_grad)


def test_neuer_container_rechnet_ab_tag_eins():
    """Ein neuer Container ohne eigene Tage bekommt die Signatur seiner Bauart (statt 10 Tage zu lernen)."""
    gez = {"a": reihe(), "neu": []}
    m = modelle(gez, {"a": "k:einzel", "neu": "k:einzel"}, {"a": "k", "neu": "k"}, {"a": 1, "neu": 1})["k:einzel"]
    assert faktor([], m, 1).wert == 1.0
    ende = HEUTE + timedelta(days=10)
    r = container_rest([], HEUTE, ende, {}, KLIMA, BEGINN, modell=m)
    assert r.methode == "signatur" and r.rest_kwh > 0
    aus = container_rest([], HEUTE, ende, {}, KLIMA, BEGINN, heiztage=frozenset(), modell=m)   # Modus „aus“
    assert aus.methode == "keine" and aus.rest_kwh == 0.0


def test_faktor_gedaempft():
    """Ein Container braucht 30 % mehr als die anderen seiner Bauart: Faktor nahe 1,3, mit wenigen Tagen zur 1 hin."""
    gez = {"a": reihe(), "b": reihe(f=1.3)}
    arten, einh = {"a": "k:einzel", "b": "k:einzel"}, {"a": 1, "b": 1}
    m = modelle(gez, arten, {"a": "k", "b": "k"}, einh)["k:einzel"]
    fb, fa = faktor(gez["b"], m, 1), faktor(gez["a"], m, 1)
    assert fb.roh > 1.1 and fa.roh < 0.95 and fb.roh / fa.roh == pytest.approx(1.3, rel=0.05)
    assert fb.wert == pytest.approx((24 * fb.roh + DAEMPFUNG_TAGE) / (24 + DAEMPFUNG_TAGE))
    wenig = faktor(gez["b"][:2], m, 1)
    assert abs(wenig.wert - 1) < abs(wenig.roh - 1)


def test_hinweis_bei_abweichung_von_gleich_gebauten():
    a, b = reihe(), reihe(f=1.3)
    w = abweichung(b, [(a, 1)], 1)
    assert w == pytest.approx(0.3, abs=0.03) and hinweis(w)
    assert not hinweis(abweichung(reihe(f=1.05), [(a, 1)], 1))
    assert abweichung(b, [], 1) is None                                   # allein in der Bauart: kein Vergleich
    assert abweichung(b[:HINWEIS_MIN_TAGE - 1], [(a, 1)], 1) is None      # zu wenige eigene Tage
    assert abweichung(b, [(a[:HINWEIS_MIN_TAGE - 1], 1)], 1) is None      # zu wenige Vergleichstage (Review)
    assert abweichung(reihe(f=2.6), [(a, 1)], 2) == pytest.approx(0.3, abs=0.03)   # je Einheit


def test_ersatz_vom_gleichen_typ_sonst_von_allen():
    """Eine Bauart ohne Tage: kWh je Heizgradtag je Einheit der anderen Bauarten desselben Typs, sonst aller mit
    Heizkörper; ohne Heizkörper kein Ersatz (Befund 17.11.2026: sonst 0 kWh Rest)."""
    a = [TagRoh(date(2026, 11, 2), 20.0, 5.0, 86400), TagRoh(date(2026, 11, 3), 12.0, 7.0, 86400)]   # Doppel: 16 kWh / 28 HGT je Einheit
    b = [TagRoh(date(2026, 11, 2), 30.0, 5.0, 86400)]                                                # 30 kWh / 15 HGT
    gez = {"a": a, "b": b, "neu": [], "frei": []}
    arten = {"a": "oel:doppel", "b": "konv:einzel", "neu": "oel:einzel", "frei": ":frei"}
    typen = {"a": "oel", "b": "konv", "neu": "oel", "frei": ""}
    einh = {"a": 2, "b": 1, "neu": 1, "frei": 1}
    m = modelle(gez, arten, typen, einh)
    assert m["oel:einzel"].quelle == "typ" and m["oel:einzel"].kwh_je_hgt == pytest.approx(16 / 28)
    assert m[":frei"].quelle == "keine" and m[":frei"].kwh_je_hgt is None
    gem = modelle({**gez, "neu": []}, {**arten, "neu": "gemischt:einzel"}, {**typen, "neu": "gemischt"}, einh)["gemischt:einzel"]
    assert gem.quelle == "alle" and gem.kwh_je_hgt == pytest.approx(46 / 43)
    ende = HEUTE + timedelta(days=20)
    plan = frozenset(d for d in tage(BEGINN, ende) if d.weekday() < 5)
    r = container_rest([], HEUTE, ende, {}, KLIMA, BEGINN, heiztage=plan, modell=m["oel:einzel"])
    rest = tage(HEUTE + timedelta(days=1), ende)
    assert r.methode == "ersatz" and r.unten_kwh is None
    assert r.je_tag == pytest.approx([16 / 28 * hgt(klima_tag(d, KLIMA)) if d in plan else 0.0 for d in rest])
    aus = container_rest([], HEUTE, ende, {}, KLIMA, BEGINN, heiztage=frozenset(), modell=m["oel:einzel"])
    assert aus.methode == "keine" and aus.rest_kwh == 0.0
    frei = container_rest([], HEUTE, ende, {}, KLIMA, BEGINN, heiztage=plan, modell=m[":frei"])
    assert frei.methode == "keine" and frei.rest_kwh == 0.0
    g = container_rest(a, HEUTE, ende, {}, KLIMA, BEGINN, heiztage=plan, modell=m["oel:doppel"], skala=2)
    assert g.methode == "heizgradtage" and g.rest_kwh == pytest.approx(2 * 16 / 28 * sum(hgt(klima_tag(d, KLIMA)) for d in rest if d in plan))
    assert baustelle(100.0, {"e": r, "g": g})["methode"] == "heizgradtage"
    assert Signatur("lernt", 0).stand == "lernt"
