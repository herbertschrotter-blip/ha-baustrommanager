"""Verbrauch & Wetter (M13): Zeitschritte, Wetter des Schritts, Regen, Bänder nach Temperatur."""

from datetime import date, datetime, timedelta

import pytest

from logik.verbrauch_wetter import (
    Stunde, aufloesung, band, baender, eimer, klasse, punkte, schritt_beginn, stelle, vergleich_angleichen, wetter_des_schritts,
    wetter_zusammen,
)

T0 = datetime(2026, 11, 23, 0, 0)   # Montag


def st(h: int, kwh: dict[str, float] | None = None, aussen: float | None = 2.0, wetter: dict[str, float] | None = None,
       wind: float | None = None, regen: float | None = None) -> Stunde:
    return Stunde(T0 + timedelta(hours=h), kwh or {"a": 1.0, "b": 0.5}, aussen, wetter or {"sonne": 60}, wind, regen)


def test_klasse_und_auflösung():
    assert klasse("sunny") == "sonne" and klasse("snowy-rainy") == "schnee" and klasse("pouring") == "regen"
    assert klasse("cloudy") == "trueb" and klasse(None) is None and klasse("unbekannt") is None
    assert aufloesung("Monat", "woche") == "woche" and aufloesung("Monat", "stunde") == "tag"   # passt nicht → Vorgabe
    assert aufloesung("Tag", None) == "stunde" and aufloesung("Gesamt", "monat") == "monat"


def test_eimer():
    t = datetime(2026, 11, 26, 14, 30)
    assert eimer(t, "stunde") == datetime(2026, 11, 26, 14) and eimer(t, "tag") == date(2026, 11, 26)
    assert eimer(t, "woche") == date(2026, 11, 23) and eimer(t, "monat") == date(2026, 11, 1)
    with pytest.raises(ValueError):
        eimer(t, "jahr")


def test_wetter_des_schritts_nass_gewinnt_ab_einem_sechstel():
    assert wetter_des_schritts({"sonne": 50, "regen": 10}) == "regen"     # 10 von 60 = ein Sechstel
    assert wetter_des_schritts({"sonne": 51, "regen": 9}) == "sonne"
    assert wetter_des_schritts({"regen": 20, "schnee": 20, "trueb": 80}) == "schnee"   # Schnee vor Regen
    assert wetter_des_schritts({"wolken": 30, "trueb": 30}) == "wolken"   # Gleichstand: die hellere Klasse
    assert wetter_des_schritts({}) is None


def test_punkte_je_stunde_und_tag():
    S = [st(0, wind=10, regen=0.0), st(1, wind=20, regen=1.2, wetter={"regen": 60}), st(2, aussen=None, regen=1.5)]
    P = punkte(S, "stunde", ["a", "b"])
    assert [p["von"] for p in P] == ["2026-11-23T00:00:00", "2026-11-23T01:00:00", "2026-11-23T02:00:00"]
    assert P[0]["kwh"] == 1.5 and P[0]["je_container"] == {"a": 1.0, "b": 0.5} and P[0]["wind"] == 10.0
    assert [p["regen"] for p in P] == [0.0, 1.2, 0.3] and P[1]["wetter"] == "regen" and P[2]["aussen"] is None
    T = punkte(S, "tag", ["a", "b"])
    assert len(T) == 1 and T[0]["kwh"] == 4.5 and T[0]["aussen"] == 2.0 and T[0]["wind"] == 15.0
    assert T[0]["regen"] == 1.5 and T[0]["wetter"] == "regen"   # 60 von 180 min Regen


def test_regen_der_woche_aus_den_tagessummen():
    S = [st(10, regen=3.0), st(11, regen=4.0), st(24 + 9, regen=2.5), st(24 * 8, regen=1.0)]
    W = punkte(S, "woche", ["a"])
    assert [p["von"] for p in W] == ["2026-11-23", "2026-11-30"] and [p["regen"] for p in W] == [6.5, 1.0]
    assert punkte([st(0)], "tag", ["a"])[0]["regen"] is None   # ohne Regenwert: unbekannt, nicht 0


def test_band_grenzen():
    assert band(-2.1) == "unter_m2" and band(-2.0) == "m2_2" and band(1.9) == "m2_2" and band(2.0) == "2_6" and band(6.0) == "ueber_6"


def test_baender_mittel_anzahl_faktor_und_trueb():
    P = [{"aussen": -4.0, "wetter": "sonne", "kwh": 80, "je_container": {"a": 40}},
         {"aussen": -3.0, "wetter": "trueb", "kwh": 100, "je_container": {"a": 50}},
         {"aussen": 8.0, "wetter": "sonne", "kwh": 40, "je_container": {"a": 20}},
         {"aussen": 7.0, "wetter": "trueb", "kwh": 50, "je_container": {"a": 25}},
         {"aussen": 9.0, "wetter": None, "kwh": 45, "je_container": {"a": 22}},   # zählt fürs Band, nicht für die Gruppe
         {"aussen": None, "wetter": "sonne", "kwh": 999, "je_container": {}}]     # ohne Temperatur: zählt nicht
    B = baender(P)
    z = {(x["band"], x["gruppe"]): x for x in B["zellen"]}
    assert z[("unter_m2", "sonnig")] == {"band": "unter_m2", "gruppe": "sonnig", "kwh": 80.0, "anzahl": 1}
    assert z[("ueber_6", "trueb")]["kwh"] == 50.0 and ("m2_2", "sonnig") not in z
    assert B["kalt_band"] == "unter_m2" and B["warm_band"] == "ueber_6" and B["kalt_zu_warm"] == 2.0   # 90 / 45
    assert B["trueb_mehr_prozent"] == 25   # +25 % in beiden Bändern
    assert baender(P, "a")["zellen"][0]["kwh"] == 40.0
    leer = baender([])
    assert leer["zellen"] == [] and leer["kalt_zu_warm"] is None and leer["trueb_mehr_prozent"] is None


def test_vergleich_nach_der_stelle_auch_mit_luecken():
    jetzt = [{"von": "2026-11-01", "kwh": 1, "je_container": {"a": 1}}, {"von": "2026-11-02", "kwh": 1, "je_container": {}},
             {"von": "2026-11-03", "kwh": 1, "je_container": {}}]
    # Vormonat erst ab dem 2. gemessen (Baustelle begann später): der 2. Oktober steht beim 2. November
    vorher = [{"von": "2026-10-02", "kwh": 5, "je_container": {"a": 2}}, {"von": "2026-10-03", "kwh": 6, "je_container": {}}]
    assert vergleich_angleichen(jetzt, vorher, "tag", date(2026, 11, 1), date(2026, 10, 1)) == [None, 5.0, 6.0]
    assert vergleich_angleichen(jetzt, vorher, "tag", date(2026, 11, 1), date(2026, 10, 1), "a") == [None, 2.0, 0.0]
    m = [{"von": "2026-12-01", "kwh": 3, "je_container": {}}]
    assert vergleich_angleichen(m, [{"von": "2025-12-01", "kwh": 9, "je_container": {}}], "monat", date(2026, 10, 1), date(2025, 10, 1)) == [9.0]


def test_stelle():
    assert stelle("2026-11-23T05:00:00+01:00", date(2026, 11, 22), "stunde") == 29
    assert stelle("2026-11-25", date(2026, 11, 1), "tag") == 24 and stelle("2026-11-30", date(2026, 11, 1), "woche") == 5
    assert stelle("2027-02-01", date(2026, 10, 1), "monat") == 4


def test_regen_je_stunde_ohne_stunden_davor_unbekannt():
    S = [st(14, regen=8.0), st(15, regen=8.5)]   # Aufzeichnung beginnt um 14 Uhr nach Regen am Vormittag
    assert [p["regen"] for p in punkte(S, "stunde", ["a"])] == [None, 0.5]


def test_schritt_und_wetter_zusammen():
    t = datetime(2026, 11, 23, 14, 37)
    assert schritt_beginn(t, False) == datetime(2026, 11, 23, 14) and schritt_beginn(t, True) == datetime(2026, 11, 23)
    x = Stunde(datetime(2026, 11, 23))
    wetter_zusammen(x, [{"aussen": 2.0, "wind": 10.0, "wetter_min": {"sonne": 60}, "regen_stand": 0.0},
                        {"aussen": 4.0, "wind": None, "wetter_min": {"sonne": 30, "regen": 30}, "regen_stand": 1.5}], 9.0)
    assert (x.aussen, x.wind, x.wetter_min, x.regen_stand) == (3.0, 10.0, {"sonne": 90, "regen": 30}, 1.5)
    y = Stunde(datetime(2026, 11, 23))
    wetter_zusammen(y, [], 9.0)   # ohne Wetterzeilen: außen aus der Statistik
    assert (y.aussen, y.wind, y.wetter_min, y.regen_stand) == (9.0, None, {}, None)
