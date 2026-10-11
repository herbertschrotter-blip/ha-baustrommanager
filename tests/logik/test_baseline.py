"""Baseline-Läufe „ohne Automatik“ (BSM-033.04)."""

from datetime import UTC, date, datetime, timedelta

import pytest

from logik.baseline import (
    ANTEIL, MAX_TAGE, Kandidat, Lauf, abbrechen, abbruch_grund, container_waehlen, freier_block, laeuft_am, monat_rest,
    planen, schaetzung_eur, starten, zaehlende_tage,
)

FR = date(2026, 11, 13)          # Freitag
SA, SO, MO = FR + timedelta(days=1), FR + timedelta(days=2), FR + timedelta(days=3)
wochenende = lambda d: d.weekday() >= 5   # noqa: E731


def k(bid, typ, kw=2.0, tage=0, **kw_):
    return Kandidat(bid, bid.upper(), typ, kw, tage, **kw_)


def test_freier_block_samstag_und_sonntag():
    assert freier_block(FR, wochenende) == (SA, MO)
    assert freier_block(SO, wochenende) == (SO, MO)                    # nur noch Sonntag
    feiertag = lambda d: d == date(2026, 12, 8)                         # noqa: E731
    assert freier_block(date(2026, 12, 1), feiertag) == (date(2026, 12, 8), date(2026, 12, 9))
    assert freier_block(FR, lambda d: False) is None
    assert MAX_TAGE == 2 and freier_block(FR, lambda d: True) == (FR, FR + timedelta(days=2))


def test_container_waehlen():
    K = [k("a", "oelradiator", tage=4), k("b", "konvektor", tage=2), k("c", "gemischt"), k("d", "konvektor", tage=1)]
    assert container_waehlen(K, None, [SA]).bereich == "d"               # wenigste Tage, nicht gemischt
    assert container_waehlen(K, "konvektor", [SA]).bereich == "a"        # abwechselnd
    fertig = [k("a", "oelradiator", fertig=True), k("b", "konvektor", gesperrt=frozenset({SA})), k("c", "gemischt")]
    assert container_waehlen(fertig, None, [SA, SO]).bereich == "c"      # fertig und gesperrt fallen weg
    assert container_waehlen([k("x", "", kw=0)], None, [SA]) is None


def test_schaetzung():
    assert schaetzung_eur(k("a", "konvektor", kw=2.0), 2, 0.25) == pytest.approx(2.0 * 48 * ANTEIL * 0.25)
    assert schaetzung_eur(k("a", "konvektor", erwartet_kwh_tag=10.0), 2, 0.25) == pytest.approx(5.0)


def test_monat_rest():
    L = [Lauf("1", "a", date(2026, 11, 7), date(2026, 11, 9), "fertig", 12.0, 9.5),
         Lauf("2", "b", date(2026, 11, 14), date(2026, 11, 16), "abgesagt", 12.0),
         Lauf("3", "b", date(2026, 11, 21), date(2026, 11, 23), "geplant", 12.0),
         Lauf("4", "a", date(2026, 10, 31), date(2026, 11, 2), "fertig", 12.0, 11.0)]
    assert monat_rest(L, 2026, 11, 60.0) == pytest.approx(60.0 - 9.5 - 12.0)


def test_planen():
    K = [k("a", "oelradiator"), k("b", "konvektor")]
    l = planen(FR, wochenende, K, [], 60.0, 0.25, "x1")
    assert l == Lauf("x1", "a", SA, MO, "geplant", 2.0 * 48 * ANTEIL * 0.25)
    assert planen(FR, wochenende, K, [l], 60.0, 0.25, "x2") is None             # einer ist schon geplant
    vorher = [Lauf("v", "a", date(2026, 11, 7), date(2026, 11, 9), "fertig", 12.0, 12.0)]
    assert planen(FR, wochenende, K, vorher, 60.0, 0.25, "x3").bereich == "b"   # abwechselnd
    assert planen(FR, wochenende, K, [], 10.0, 0.25, "x4") is None              # Rahmen zu klein


def test_abbruch_grund():
    ok = dict(automatik=True, tuer_offen_min=None, tuer_pause_min=3, taste=False, bedarf=False, termin=False)
    assert abbruch_grund(**ok) is None
    assert abbruch_grund(**{**ok, "tuer_offen_min": 2}) is None
    assert abbruch_grund(**{**ok, "tuer_offen_min": 4}) == "Tür oder Fenster offen"
    assert abbruch_grund(**{**ok, "automatik": False}) == "Automatik aus"
    assert abbruch_grund(**{**ok, "taste": True}) == "Taste am Plug"
    assert abbruch_grund(**{**ok, "bedarf": True}) == "Bedarf"
    assert abbruch_grund(**{**ok, "termin": True}) == "Termin"


def test_abbrechen_und_zaehlende_tage():
    g = Lauf("1", "a", SA, MO)
    assert abbrechen(g, FR, "Absagen").status == "abgesagt"
    lauf = Lauf("2", "a", SA, MO, "laeuft")
    ab = abbrechen(lauf, SO, "Tür oder Fenster offen")
    assert ab.status == "abgebrochen" and ab.ende == SO
    assert zaehlende_tage([ab]) == {"a": {SA}}
    assert zaehlende_tage([Lauf("3", "b", SA, MO, "fertig")]) == {"b": {SA, SO}}
    assert zaehlende_tage([g, Lauf("4", "c", SA, MO, "laeuft")]) == {}
    assert laeuft_am([lauf], "a", SO) is lauf and laeuft_am([lauf], "a", MO) is None


def test_lauf_als_dict_und_zurueck():
    l = Lauf("1", "a", SA, MO, "abgebrochen", 12.345, 3.0, "Taste am Plug", SO)
    assert Lauf.aus_dict(l.als_dict()) == Lauf("1", "a", SA, MO, "abgebrochen", 12.35, 3.0, "Taste am Plug", SO)


def test_lauf_metadaten_alt_und_neu():
    """BSM-033.06: alter Lauf ohne Metadaten liest sich „unbekannt“; Start friert Annahme und Konfiguration ein."""
    alt = {"id": "1", "bereich": "a", "von": SA.isoformat(), "bis": MO.isoformat(), "status": "fertig", "schaetzung_eur": 5.0,
           "kosten_eur": 4.0, "grund": None, "ende": None}
    l = Lauf.aus_dict(alt)
    assert (l.thermostat_unveraendert, l.thermostatstellung, l.annahme_am, l.konfiguration_id, l.p_ref_belege) == (
        "unbekannt", "unbekannt", None, None, ())
    jetzt = datetime(2026, 11, 14, 0, 0, tzinfo=UTC)
    neu = starten(Lauf("2", "a", SA, MO), jetzt, "kabc", ["p1"])
    assert (neu.status, neu.thermostat_unveraendert, neu.thermostatstellung) == ("laeuft", "angenommen", "unbekannt")
    assert Lauf.aus_dict(neu.als_dict()) == neu
    assert neu.als_dict()["annahme_am"] == "2026-11-14T00:00:00+00:00" and neu.als_dict()["p_ref_belege"] == ["p1"]
    assert Lauf.aus_dict({**alt, "thermostat_unveraendert": "quatsch", "thermostatstellung": "max"}).thermostat_unveraendert == "unbekannt"
    assert Lauf.aus_dict({**alt, "thermostatstellung": "max"}).thermostatstellung == "max"
