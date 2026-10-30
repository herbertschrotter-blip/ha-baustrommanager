"""Baseline-Läufe „ohne Automatik“ (BSM-033.04)."""

from datetime import UTC, date, datetime, timedelta, timezone

import pytest

from logik.baseline import (
    ANTEIL, HINWEIS, MAX_TAGE, Kandidat, Lauf, Stand, abbrechen, abbruch_grund, container_waehlen, freier_block, kein_lauf, kopf_anzeige,
    laeuft_am, lauf_anzeige, monat_rest, offener, plant_am, planen, rahmen, schaetzung_eur, stand_anzeige, stand_text,
    starten, tag_t, vorschau, zaehlende_tage, zeit_t,
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
    assert abbruch_grund(**{**ok, "modus_aus": True}) == "Modus Aus"   # Audit 0.8.165


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


# ---------------------------------------------------------------- Anzeige (J4b, Mockup baseline.html Variante B)
WIEN = timezone(timedelta(hours=1))


def test_abbrechen_mit_uhrzeit_und_neue_felder_zurueck():
    um = datetime(2026, 11, 15, 9, 12, tzinfo=WIEN)
    ab = abbrechen(Lauf("2", "a", SA, MO, "laeuft"), SO, "Tür oder Fenster offen", um)
    assert ab.abbruch_um == um and abbrechen(Lauf("1", "a", SA, MO), FR, "x", um).abbruch_um == um
    voll = Lauf("3", "a", SA, MO, "fertig", 9.2, 9.1, kwh=45.5, angekuendigt=datetime(2026, 11, 13, 12, 0, tzinfo=WIEN), abbruch_um=um)
    assert Lauf.aus_dict(voll.als_dict()) == voll
    alt = {"id": "1", "bereich": "a", "von": SA.isoformat(), "bis": MO.isoformat()}
    assert (Lauf.aus_dict(alt).kwh, Lauf.aus_dict(alt).angekuendigt, Lauf.aus_dict(alt).abbruch_um) == (None, None, None)


def test_texte():
    assert tag_t(SA) == "Sa 14.11." and zeit_t(datetime(2026, 11, 13, 12, 0, tzinfo=WIEN)) == "Fr 13.11. 12:00"


def test_kein_lauf():
    ok = dict(typ="konvektor", auto=True, bedarf=False, modus="plan")
    assert kein_lauf(**ok) is None
    assert kein_lauf(**{**ok, "typ": ""}) == "ohne Heizkörper"
    assert kein_lauf(**{**ok, "modus": "aus"}) == "Modus aus"
    assert kein_lauf(**{**ok, "auto": False, "modus": "hand"}) == "ohne Automatik"
    assert kein_lauf(**{**ok, "bedarf": True, "modus": "bedarf"}) == "bei Bedarf"


def test_rahmen_gemessen_geplant_rest():
    L = [Lauf("1", "a", date(2026, 11, 7), date(2026, 11, 9), "fertig", 9.0, 7.5),
         Lauf("2", "a", date(2026, 11, 14), date(2026, 11, 16), "abgesagt", 9.0),
         Lauf("3", "b", date(2026, 11, 21), date(2026, 11, 23), "laeuft", 9.2),
         Lauf("4", "b", date(2026, 10, 31), date(2026, 11, 2), "fertig", 9.2, 9.0)]   # zählt im Oktober
    r = rahmen(L, date(2026, 11, 21), 60.0)
    assert r == {"monat": "2026-11", "budget_eur": 60.0, "gemessen_eur": 7.5, "geplant_eur": 9.2, "rest_eur": 43.3}
    assert r["rest_eur"] == pytest.approx(monat_rest(L, 2026, 11, 60.0))
    assert rahmen([], date(2026, 10, 29), 60.0)["rest_eur"] == 60.0
    beendet = [Lauf("5", "a", date(2026, 11, 7), date(2026, 11, 9), "fertig", 9.0)]   # Kosten kommen erst mit der Hochrechnung
    assert (rahmen(beendet, date(2026, 11, 9), 60.0)["gemessen_eur"], rahmen(beendet, date(2026, 11, 9), 60.0)["geplant_eur"]) == (9.0, 0.0)


def test_lauf_anzeige():
    um = datetime(2026, 11, 15, 9, 12, tzinfo=WIEN)
    ab = Lauf("3", "a", SA, MO, "abgebrochen", 9.0, 4.4, "Tür oder Fenster offen", SO, kwh=22.0, abbruch_um=um)
    d = lauf_anzeige(ab, "002_C_SAN", "konvektor")
    assert (d["letzter"], d["tage"], d["zaehlt"], d["kwh"], d["abbruch_t"], d["bis_t"]) == ("2026-11-15", 2, 1, 22.0, "So 15.11. 09:12", "So 24:00")
    assert (d["von_t"], d["letzter_t"]) == ("Sa 14.11.", "So 15.11.")
    assert d["name"] == "002_C_SAN" and d["typ"] == "konvektor" and d["bisher_kwh"] is None
    laeuft = lauf_anzeige(Lauf("4", "a", SA, MO, "laeuft"), "x", "konvektor", (13.14, 2.627))
    assert (laeuft["zaehlt"], laeuft["bisher_kwh"], laeuft["bisher_eur"]) == (0, 13.14, 2.63)
    assert lauf_anzeige(Lauf("5", "a", SA, MO, "fertig"), "x", "", (1.0, 1.0))["bisher_kwh"] is None   # nur während des Laufs
    eins = lauf_anzeige(Lauf("6", "a", SA, SO, "fertig", angekuendigt=datetime(2026, 11, 13, 12, 0, tzinfo=WIEN)), "x", "")
    assert (eins["tage"], eins["zaehlt"], eins["letzter"], eins["bis_t"], eins["angekuendigt_t"]) == (1, 1, "2026-11-14", "Sa 24:00", "Fr 13.11. 12:00")
    k = kopf_anzeige(Lauf("4", "a", SA, MO, "laeuft"), (13.14, 2.627), "2026-11-16T00:00:00+01:00")
    assert k == {"lauf_id": "4", "von": "2026-11-14", "letzter": "2026-11-15", "von_t": "Sa 14.11.", "letzter_t": "So 15.11.",
                 "bis": "2026-11-16T00:00:00+01:00", "bis_t": "So 24:00", "bisher_kwh": 13.14, "bisher_eur": 2.63}
    assert kopf_anzeige(Lauf("4", "a", SA, MO, "laeuft"), None, "x")["bisher_kwh"] is None


def test_vorschau_und_plant_am():
    jetzt = datetime(2026, 11, 12, 10, 0, tzinfo=WIEN)    # Donnerstag
    assert plant_am(SA, jetzt) == datetime(2026, 11, 13, 12, 0, tzinfo=WIEN)
    assert plant_am(SA, datetime(2026, 11, 13, 13, 0, tzinfo=WIEN)) == datetime(2026, 11, 13, 13, 0, tzinfo=WIEN)   # schon vorbei: gleich
    l = planen(FR - timedelta(days=1), wochenende, [k("a", "konvektor")], [], 60.0, 0.2, "vorschau")
    v = vorschau(l, "003_C_MAN", jetzt)
    assert v == {"von": "2026-11-14", "letzter": "2026-11-15", "von_t": "Sa 14.11.", "letzter_t": "So 15.11.", "bereich": "a", "name": "003_C_MAN", "schaetzung_eur": round(l.schaetzung_eur, 2),
                 "plant_am": "2026-11-13T12:00:00+01:00", "plant_am_t": "Fr 13.11. 12:00"}
    assert vorschau(None, "x", jetzt) is None


def test_stand_und_text():
    C = [stand_anzeige(Stand("p", "001_C_POL", "oelradiator", 10, "gut"), 10),
         stand_anzeige(Stand("s", "002_C_SAN", "konvektor", 5, "lernt"), 10),
         stand_anzeige(Stand("b", "004_C_BES", "gemischt", 0, "lernt", uebernimmt=("p",)), 10),
         stand_anzeige(Stand("m", "005_C_MAG", "", 0, None, "ohne Heizkörper"), 10)]
    assert [(c["fertig"], c["stand"]) for c in C] == [(True, "gut"), (False, "lernt"), (False, None), (False, None)]   # ohne Tage kein Stand
    assert C[2]["uebernimmt"] == ["p"] and C[3]["kein_lauf"] == "ohne Heizkörper" and C[0]["noetig"] == 10
    namen = {"s": "002_C_SAN"}
    offen = Lauf("1", "s", SA, MO)
    assert stand_text(an=False, automatik=True, container=C, offen=None, vor=None, namen=namen) == "Baseline messen ist aus."
    assert stand_text(an=True, automatik=True, container=C, offen=offen, vor=None, namen=namen) == "1 von 3 Containern gemessen · nächster Lauf Sa 14.11. (002_C_SAN)."
    assert stand_text(an=True, automatik=True, container=C, offen=Lauf("1", "s", SA, MO, "laeuft"), vor=None, namen=namen).endswith("· Lauf läuft Sa 14.11. (002_C_SAN).")
    assert stand_text(an=True, automatik=True, container=C, offen=None, vor={"von": "2026-11-21"}, namen=namen) == "1 von 3 Containern gemessen · nächster Lauf voraussichtlich Sa 21.11."
    assert stand_text(an=True, automatik=False, container=C, offen=None, vor=None, namen=namen).endswith("· Läufe nur mit eingeschalteter Automatik.")
    assert offener([Lauf("1", "s", SA, MO, "fertig"), offen]) is offen and offener([]) is None
    assert HINWEIS.startswith("Prognose ohne Automatik: Schätzung 24/7")
