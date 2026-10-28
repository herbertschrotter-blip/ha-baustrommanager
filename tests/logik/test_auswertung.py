"""Auswertung – gegen die Referenzwerte der Seite (tests/vektoren/auswertung-*.json, erzeugt mit tests/vektoren/erzeugen.js).

Wo die Seite anders rechnete als die Integration, steht im Vektor `abweichung`; dann gilt `erwartet` (fachlich richtig,
docs/bauplan-module.md §5) und der Test prüft zusätzlich, dass die Seite dort wirklich anders war.
"""

from datetime import date, datetime, timedelta, timezone
import json
import math
from pathlib import Path
from zoneinfo import ZoneInfo

import pytest

from logik import auswertung as a
from logik.bericht import heiztage as bericht_heiztage
from logik.zaehlen import tage_heizperiode

VEKTOREN = Path(__file__).resolve().parents[1] / "vektoren"


def faelle(name: str) -> list[dict]:
    daten = json.loads((VEKTOREN / f"auswertung-{name}.json").read_text(encoding="utf-8"))
    return [pytest.param(f, id=f["name"]) for f in daten["faelle"]]


def nahe(ist, soll, wo="") -> None:
    """Gleich bis auf Rundung der Kommazahlen (JS und Python addieren gleich, aber sicher ist sicher)."""
    if isinstance(soll, dict):
        assert isinstance(ist, dict) and set(ist) == set(soll), f"{wo}: Schlüssel {sorted(ist)} ≠ {sorted(soll)}"
        for k in soll:
            nahe(ist[k], soll[k], f"{wo}.{k}")
    elif isinstance(soll, list):
        assert isinstance(ist, (list, tuple)) and len(ist) == len(soll), f"{wo}: Länge {len(ist)} ≠ {len(soll)}"
        for i, (x, y) in enumerate(zip(ist, soll)):
            nahe(x, y, f"{wo}[{i}]")
    elif isinstance(soll, (int, float)) and not isinstance(soll, bool):
        assert isinstance(ist, (int, float)) and math.isclose(ist, soll, rel_tol=1e-9, abs_tol=1e-9), f"{wo}: {ist} ≠ {soll}"
    else:
        assert ist == soll, f"{wo}: {ist!r} ≠ {soll!r}"


def tag(text: str | None) -> date | None:
    return date.fromisoformat(text) if text else None


def utc(text: str) -> datetime:
    return datetime.fromisoformat(text)


def paare(werte: dict) -> dict:
    """werte[entry][bereich] = [[ISO, kWh], …] → [(datetime, kWh), …]"""
    return {e: {b: [(utc(t), v) for t, v in liste] for b, liste in bs.items()} for e, bs in werte.items()}


# ------------------------------------------------------------------ Zeiträume, Statistik


@pytest.mark.parametrize("fall", faelle("zeitraum"))
def test_zeitraum(fall):
    e, soll, zone = fall["eingabe"], fall["erwartet"], ZoneInfo(fall["eingabe"]["zone"])
    zr = a.zeitraum(e["art"], date.fromisoformat(e["heute"]), e["versatz"])
    assert (zr.von.isoformat(), zr.bis.isoformat(), zr.periode, zr.n) == (soll["von"], soll["bis"], soll["periode"], soll["n"])
    assert list(zr.labels) == soll["labels"]
    assert zr.monat == (None if soll["monat"] is None else soll["monat"] + 1)   # Seite zählt Monate ab 0
    assert zr.jahr == soll["jahr"]
    assert [zr.beginn(i, zone) for i in range(zr.n)] == [utc(t) for t in soll["beginne"]]
    assert [zr.index(zr.beginn(i, zone).astimezone(zone)) for i in range(zr.n)] == soll["index"]


@pytest.mark.parametrize("fall", faelle("reihen"))
def test_reihen_und_verbrauch(fall):
    e, soll, zone = fall["eingabe"], fall["erwartet"], ZoneInfo(fall["eingabe"]["zone"])
    zr = a.zeitraum(e["art"], date.fromisoformat(e["heute"]), e["versatz"])
    if soll["anfrage"]:
        assert a.mitternacht(zr.von, zone) == utc(soll["anfrage"]["start_time"])
        assert a.mitternacht(zr.bis, zone) == utc(soll["anfrage"]["end_time"])
        assert zr.periode == soll["anfrage"]["period"]
    werte = a.reihen(zr, e["statistik"], zone)
    nahe(werte, soll["werte"], "werte")
    je = {b["id"]: a.verbrauch(werte, b["energie"], zr.n) for b in e["bereiche"]}
    nahe(je, soll["verbrauch"], "verbrauch")
    nahe(a.addieren(list(je.values())) or [0.0] * zr.n, soll["summe"], "summe")


# ------------------------------------------------------------------ Abrechnung


@pytest.mark.parametrize("fall", faelle("abrechnung"))
def test_abrechnung(fall):
    e, soll, zone = fall["eingabe"], fall["erwartet"], ZoneInfo(fall["eingabe"]["zone"])
    zr = a.zeitraum(e["art"], date.fromisoformat(e["heute"]))
    werte = paare(e["werte"])
    daten = a.abrechnung(e["baustellen"], paare(e.get("werte_tag") or e["werte"]), zone)   # Jahr: je Tag
    nahe(daten, soll["zeilen"], "zeilen")
    assert a.csv_firma(daten, e["baustellen"], e["art"], e["preis"]) == soll["csv_firma"]
    assert a.csv_verbrauch(e["baustellen"], werte, zr, e["preis"], zone) == soll["csv_verbrauch"]
    if fall.get("abweichung"):
        assert fall["seite"] != soll   # die Seite rechnete dort wirklich anders
    else:
        nahe(fall.get("seite", soll)["zeilen"], soll["zeilen"])


def test_abrechnung_wechsel_mitten_am_tag_gilt_ab_folgetag():
    zone = ZoneInfo("Europe/Vienna")
    b = {"entry": "x", "titel": "X", "firmen": [a.EIGENE_FIRMA, {"id": "huber", "name": "Huber"}],
         "zuordnung": [{"bereich": "c", "firma": "huber", "ab": "2026-09-29T10:30:00+02:00"}], "bereiche": [{"id": "c", "name": "C"}]}
    stunden = [(a.mitternacht(date(2026, 9, 29), zone) + timedelta(hours=h), 1.0) for h in range(24)]
    stunden += [(a.mitternacht(date(2026, 9, 30), zone) + timedelta(hours=h), 1.0) for h in range(2)]
    daten = a.abrechnung([b], {"x": {"c": stunden}}, zone)
    assert [(z["firma"], z["kwh"]) for z in daten] == [("Eigene Firma", 24.0), ("Huber", 2.0)]


@pytest.mark.parametrize("fall", faelle("abrechnung"))
def test_firmen_reihen_wie_abrechnung(fall):
    """Verbrauch gestapelt nach Firma: je Firma dieselbe Summe wie die Abrechnung (Firma je Tag), je Periode verteilt."""
    e, zone = fall["eingabe"], ZoneInfo(fall["eingabe"]["zone"])
    zr = a.zeitraum(e["art"], date.fromisoformat(e["heute"]))
    werte = paare(e.get("werte_tag") or e["werte"])
    reihen = a.firmen_reihen(e["baustellen"], werte, zr, zone)
    daten = a.abrechnung(e["baustellen"], werte, zone)
    assert set(reihen) == {"eigen" if z["eigen"] else z["firma"] for z in daten}
    for z in daten:
        v = reihen["eigen" if z["eigen"] else z["firma"]]
        assert len(v) == zr.n and math.isclose(sum(v), z["kwh"], rel_tol=1e-9)
    # alle Firmen zusammen = Verbrauch je Periode
    summe = [sum(r[i] for r in reihen.values()) for i in range(zr.n)]
    je = a.addieren([[k or 0.0 for _, k in liste] for bs in paare(e["werte"]).values() for liste in bs.values()])
    nahe(summe, je, "summe") if e["art"] != "Jahr" else nahe(sum(summe), sum(je), "summe")


def test_firmen_reihen_wechsel_am_folgetag():
    zone = ZoneInfo("Europe/Vienna")
    b = {"entry": "x", "titel": "X", "firmen": [a.EIGENE_FIRMA, {"id": "huber", "name": "Huber"}],
         "zuordnung": [{"bereich": "c", "firma": "huber", "ab": "2026-09-29T10:30:00+02:00"}], "bereiche": [{"id": "c", "name": "C"}]}
    zr = a.zeitraum("Woche", date(2026, 9, 29))
    tage = [(a.mitternacht(date(2026, 9, 28) + timedelta(days=i), zone), 2.0) for i in range(3)]
    assert a.firmen_reihen([b], {"x": {"c": tage}}, zr, zone) == {"eigen": [2.0, 2.0, 0, 0, 0, 0, 0], "Huber": [0, 0, 2.0, 0, 0, 0, 0]}


def test_csv_text_wie_seite():
    assert a.csv_text(["a;b", "1,00;2"]) == "\ufeffa;b\r\n1,00;2"


def test_veraenderung_und_ohne_automatik():
    assert a.veraenderung(115, 100) == 15 and a.veraenderung(99.5, 100) == 0 and a.veraenderung(98.5, 100) == -1
    assert a.veraenderung(5, 0) is None and a.veraenderung(None, 5) is None
    assert a.veraenderung(528, 4.6, vorher_ganz=False) is None   # Vormonat nur teilweise in der Baustelle
    grob = a.OHNE_HINWEIS
    assert a.ohne_automatik(40, 100, 0.25) == {"ohne_eur": 25.0, "gespart_eur": 15.0, "prozent": 60.0, "hinweis": grob}
    assert a.ohne_automatik(120, 100, 0.25) == {"ohne_eur": 25.0, "gespart_eur": 0.0, "prozent": 0.0, "hinweis": grob}
    assert a.ohne_automatik(5, 0, 0.25) is None


# ------------------------------------------------------------------ Heizperiode


@pytest.mark.parametrize("fall", faelle("heizperiode"))
def test_heizperiode(fall):
    e, soll = fall["eingabe"], fall["erwartet"]
    heute = date.fromisoformat(e["heute"])
    ende = a.heizperiode_ende(heute, e["von"], e["bis"])
    assert ende.isoformat() == soll["ende"]
    assert a.heizperiode_bis(heute, e["von"], e["bis"], tag(e["ende"])).isoformat() == soll["bis"]
    # dieselbe Heizperiode wie die Hochrechnung der Integration (zaehlen.tage_heizperiode)
    jahr = heute.year if heute.month >= e["von"] else heute.year - 1
    assert date(jahr, e["von"], 1) + timedelta(days=tage_heizperiode(e["von"], e["bis"], jahr)) == ende + timedelta(days=1)


# ------------------------------------------------------------------ Verlauf, Kennzahlen, Monate


@pytest.mark.parametrize("fall", faelle("verlauf"))
def test_verlauf(fall):
    e, soll, zone = fall["eingabe"], fall["erwartet"], ZoneInfo(fall["eingabe"]["zone"])
    von, bis = a.verlauf_zeitraum(date.fromisoformat(e["heute"]), tag(e["beginn"]), tag(e["ende"]))
    assert (a.mitternacht(von, zone), a.mitternacht(bis, zone)) == (utc(soll["anfrage"]["start_time"]), utc(soll["anfrage"]["end_time"]))
    ist = a.verlauf_werte(e["energie"], e["heizzeit"], zone, tag(e["beginn"]), e["heiztage_zaehler"])
    nahe({k: ist[k] for k in ("heiztage", "monate", "je_monat")}, {k: soll[k] for k in ("heiztage", "monate", "je_monat")})
    assert sum(ist["je_tag"].values()) == pytest.approx(sum(ist["je_monat"].values()))   # WU-0006: Tage ergeben die Monate
    if fall.get("abweichung"):
        assert (fall["seite"]["heiztage"], fall["seite"]["monate"]) != (soll["heiztage"], soll["monate"])
    else:
        assert fall["seite"] == soll


def test_heiztage_wie_bericht():
    heizzeit = {"polier": [(date(2026, 9, 1), 0.0), (date(2026, 9, 2), 1.5)], "lager": [(date(2026, 9, 2), 0.2), (date(2026, 9, 5), 3.0)]}
    tage = a.heiztag_daten(heizzeit, date(2026, 9, 1), date(2026, 9, 4))
    assert tage == {date(2026, 9, 2)}
    assert bericht_heiztage({b: dict(w) for b, w in heizzeit.items()}, date(2026, 9, 1), date(2026, 9, 4)) == len(tage)


def test_heiztage_tatsaechlich_geheizt():
    """AN-0011: Heiztag nur mit Strom; Tage ohne Strom-Wert (vor 0.8.29) zählen nach der eingeschalteten Zeit."""
    ein = {"polier": [(date(2026, 9, 1), 2.0), (date(2026, 9, 2), 2.0)], "lager": [(date(2026, 9, 3), 1.0)]}
    strom = {"polier": [(date(2026, 9, 2), 0.0)], "lager": [(date(2026, 9, 3), 0.4)]}
    h = a.heizzeit_geheizt(ein, strom)
    assert h["polier"] == [(date(2026, 9, 1), 2.0), (date(2026, 9, 2), 0.0)]
    assert a.heiztag_daten(h) == {date(2026, 9, 1), date(2026, 9, 3)}
    zone = ZoneInfo("Europe/Vienna")
    p = lambda t, h: {"start": f"{t}T00:00:00+02:00", "change": h}
    w = a.verlauf_werte(None, {"polier": [p("2026-09-01", 2.0), p("2026-09-02", 2.0)]}, zone,
                        heizzeit_strom={"polier": [p("2026-09-02", 0.0)]})
    assert w["heiztage"] == 1


@pytest.mark.parametrize("fall", faelle("kennzahlen"))
def test_kennzahlen(fall):
    e = fall["eingabe"]
    nahe(a.kennzahlen(e["zaehler"], e["zustaende"], e["preis"], e["container"], e["heiztage"], e["monate"]), fall["erwartet"])


@pytest.mark.parametrize("fall", faelle("monate"))
def test_monate_je_container(fall):
    e, soll, zone = fall["eingabe"], fall["erwartet"], ZoneInfo(fall["eingabe"]["zone"])
    von, bis, monate = a.monate_zeitraum(date.fromisoformat(e["heute"]), tag(e["beginn"]), tag(e["ende"]))
    if soll["anfrage"]:
        assert (a.mitternacht(von, zone), a.mitternacht(bis, zone)) == (utc(soll["anfrage"]["start_time"]), utc(soll["anfrage"]["end_time"]))
    daten = a.monate_je_container(monate, e["bereiche"], e["statistik"], zone)
    nahe(daten, {"labels": soll["labels"], "reihen": soll["reihen"]})
    assert a.csv_monate(e["titel"], e["preis"], daten) == soll["csv"]


def test_monate_summen():
    """Verbrauch je Monat auf der Detailseite: kWh, € und Anteil je Container rechnet die Integration."""
    reihen = [{"name": "Polier", "v": [30.0, 45.0]}, {"name": "Lager", "v": [25.0, 0.0]}, {"name": "Magazin", "v": [0.0, 0.0]}]
    assert a.monate_summen(reihen, 0.28) == [{"kwh": 75.0, "eur": pytest.approx(21.0), "anteil": 75.0},
                                             {"kwh": 25.0, "eur": pytest.approx(7.0), "anteil": 25.0}, {"kwh": 0.0, "eur": 0.0, "anteil": 0.0}]
    assert a.monate_summen([{"name": "Büro", "v": [0.0]}], 0.28) == [{"kwh": 0.0, "eur": 0.0, "anteil": 0.0}]
    assert a.monate_summen([], 0.28) == []


# ------------------------------------------------------------------ Ölradiator/Konvektor, Wetter, Je Gerät


@pytest.mark.parametrize("fall", faelle("typvergleich"))
def test_typvergleich(fall):
    e = fall["eingabe"]
    nahe(a.typ_vergleich(e["bereiche"], e["zaehler"], e["energie"], e["heizzeit"], e["heiztage"], e["preis"]), fall["erwartet"])


def test_wetter_aus_signatur():
    """BSM-033: Wetter-Einfluss aus der Energiesignatur der Baustelle – schräger Teil als Gerade, null0 = Heizgrenze."""
    sig = {"stand": "gut", "tage": 20, "grenze": 15.0, "kwh_je_grad": 2.0, "grundlast": 1.0, "bezug": None, "punkte": [[0.0, 31.0]]}
    w = a.wetter_aus_signatur(sig, 0.25)
    assert w["punkte"] == [[0.0, 31.0]] and w["stand"] == "gut" and w["tage"] == 20
    g = w["gerade"]
    assert g["k"] == -2.0 and g["d0"] == pytest.approx(31.0) and g["null0"] == 15.0 and g["eur_je_grad"] == pytest.approx(0.5)
    gerade = a.wetter_aus_signatur({**sig, "grenze": None, "bezug": 10.0}, 0.25)["gerade"]   # Grenze noch offen: Bezug wärmster Tag
    assert gerade["d0"] == pytest.approx(21.0) and gerade["null0"] is None
    assert a.wetter_aus_signatur({**sig, "stand": "lernt"}, 0.25)["gerade"] is None
    assert a.wetter_aus_signatur({**sig, "stand": "unsicher"}, 0.25)["gerade"] is None
    assert a.wetter_aus_signatur(None, 0.25) == {"punkte": [], "gerade": None, "stand": None, "tage": None}



@pytest.mark.parametrize("fall", faelle("je-geraet"))
def test_je_geraet(fall):
    e = fall["eingabe"]
    nahe(a.je_geraet(e["geraete"], e["zaehler"], e["statistik"], e["pumpzeit"]), fall["erwartet"]["zeilen"])


def test_statistik_start_in_sekunden_ms_und_text():
    zone = ZoneInfo("Europe/Vienna")
    ms = a.mitternacht(date(2026, 9, 29), zone).timestamp() * 1000
    for start in (ms, ms / 1000, "2026-09-29T00:00:00+02:00"):
        assert a.lokal(start, zone) == datetime(2026, 9, 29, tzinfo=zone)


def test_geld_und_abrechnung_geld():
    """€ und Anteil der Abrechnung nur hier (Schlussprüfung Bauplan Module): Seite und Bericht zeigen diese Werte."""
    assert a.geld(None, 0.28) is None and a.geld(10.0, 0.28) == pytest.approx(2.8)
    daten = [{"kwh": 30.0, "container": [{"kwh": 30.0}]}, {"kwh": 10.0, "container": [{"kwh": 4.0}, {"kwh": 6.0}]}]
    g = a.abrechnung_geld(daten, 0.25)
    assert [z["anteil"] for z in g] == [75.0, 25.0] and g[0]["eur"] == 7.5 and [c["eur"] for c in g[1]["container"]] == [1.0, 1.5]
    assert a.abrechnung_geld([{"kwh": 0.0, "container": []}], 0.25)[0]["anteil"] == 0.0


def test_hochrechnung_werte():
    h = a.hochrechnung_werte(412.0, 2310.0, 10626.0, 0.28)
    assert h["mit_eur"] == pytest.approx(646.8) and h["ohne_eur"] == pytest.approx(2975.28) and h["bisher_eur"] == pytest.approx(115.36)
    assert h["gespart_eur"] == pytest.approx((10626 - 2310) * 0.28)
    assert a.hochrechnung_werte(None, 100.0, 80.0, 0.28)["gespart_eur"] == 0.0   # nie unter 0
    assert a.hochrechnung_werte(None, None, None, 0.28) == {"bisher_kwh": None, "bisher_eur": None, "mit_kwh": None, "mit_eur": None,
                                                            "ohne_kwh": None, "ohne_eur": None, "gespart_eur": None}


def test_hochrechnung_signatur():
    """BSM-033.02: Spanne und Normjahr in kWh und €, je Container der Rest in €; ohne Signatur Tagesschnitt."""
    basis = a.hochrechnung_werte(400.0, 2000.0, 9000.0, 0.25)
    sig = {"methode": "signatur", "unten_kwh": 1800.0, "oben_kwh": 2300.0, "normjahr_kwh": 2100.0}
    erg = {"hgt_rest": 2500.0, "vorhersage_tage": 7, "container": [{"bereich": "c1", "rest_kwh": 800.0, "stand": "gut"}]}
    h = a.hochrechnung_signatur(basis, sig, erg, 0.25)
    assert h["methode"] == "signatur" and h["mit_eur"] == pytest.approx(500.0)
    assert (h["unten_eur"], h["oben_eur"], h["normjahr_eur"]) == pytest.approx((450.0, 575.0, 525.0))
    assert h["hgt_rest"] == 2500.0 and h["vorhersage_tage"] == 7
    assert h["container"] == [{"bereich": "c1", "rest_kwh": 800.0, "stand": "gut", "rest_eur": 200.0}]
    leer = a.hochrechnung_signatur(basis, None, None, 0.25)
    assert leer["methode"] == "tagesschnitt" and leer["unten_kwh"] is None and leer["unten_eur"] is None
    assert leer["container"] == [] and leer["hgt_rest"] is None


def test_ohne_hinweis():
    """BSM-033.05: „ohne Automatik“ und „gespart“ sind bis zur gemessenen Baseline nur eine grobe Obergrenze."""
    assert a.OHNE_HINWEIS == "grobe Obergrenze, nicht belastbar"
    assert a.ohne_hinweis("schaetzung") == a.OHNE_HINWEIS and a.ohne_hinweis(None) == a.OHNE_HINWEIS
    assert a.ohne_hinweis("baseline") is None
    basis = a.hochrechnung_werte(400.0, 2000.0, 9000.0, 0.25)
    assert a.hochrechnung_signatur(basis, None, None, 0.25)["ohne_hinweis"] == a.OHNE_HINWEIS
    gemessen = a.hochrechnung_signatur(basis, None, {"ohne": {"methode": "baseline"}}, 0.25)
    assert gemessen["ohne_methode"] == "baseline" and gemessen["ohne_hinweis"] is None


# ---------------------------------------------------------------- WU-0005: Rangliste und Erkenntnisse
from logik.auswertung import erkenntnisse, rangliste  # noqa: E402


def test_rangliste_sortiert_mit_eur_anteil_und_kwh_je_stunde():
    r = rangliste([{"bereich": "a", "name": "Polier", "kwh": 30, "heizzeit": 20}, {"bereich": "b", "name": "Magazin", "kwh": 60, "heizzeit": 25},
                   {"bereich": "c", "name": "Lager", "kwh": 10, "heizzeit": 0}], 0.3)
    assert [c["name"] for c in r] == ["Magazin", "Polier", "Lager"]
    assert r[0]["eur"] == pytest.approx(18) and r[0]["anteil"] == pytest.approx(60) and r[0]["kwh_h"] == pytest.approx(2.4)
    assert r[2]["kwh_h"] is None
    assert rangliste([], 0.3) == []


def test_erkenntnisse_reihenfolge_und_schwellen():
    r = rangliste([{"bereich": "a", "name": "Polier", "kwh": 30, "heizzeit": 20}, {"bereich": "b", "name": "Magazin", "kwh": 60, "heizzeit": 25}], 0.3)
    e = erkenntnisse(r, ohne={"gespart_eur": 120.0, "prozent": 78.0, "hinweis": "grob"}, gerade={"k": -7.2, "eur_je_grad": 2.0, "null0": 15.5},
                     veraenderung_kwh=31, typ_weniger=16)
    assert [x["art"] for x in e] == ["gespart", "groesster", "sparsamster", "wetter", "mehr"]      # höchstens 5
    assert e[0]["hinweis"] == "grob"   # BSM-033.05: Hinweis „grobe Obergrenze“ reicht durch
    assert e[1]["name"] == "Magazin" and e[2]["name"] == "Polier" and e[2]["kwh_h"] == pytest.approx(1.5)
    # unter den Schwellen: nichts Auffälliges
    ruhig = erkenntnisse(r[:1], ohne=None, gerade={"k": 0.4}, veraenderung_kwh=-10, typ_weniger=3)
    assert ruhig == []
    assert [x["art"] for x in erkenntnisse(r, ohne=None, gerade=None, veraenderung_kwh=-20, typ_weniger=-8)] == ["groesster", "sparsamster", "weniger", "typ"]


def test_verlauf_je_tag():
    """WU-0006: kWh je Tag (lokaler Tag) für die Chronik."""
    zone = ZoneInfo("Europe/Vienna")
    energie = [{"start": datetime(2026, 9, 29, 22, 0, tzinfo=timezone.utc).timestamp() * 1000, "change": 5.0},   # 30.09. 00:00 Wien
               {"start": datetime(2026, 9, 28, 22, 0, tzinfo=timezone.utc).timestamp() * 1000, "change": 3.5}]
    w = a.verlauf_werte(energie, {}, zone)
    assert w["je_tag"] == {"2026-09-30": 5.0, "2026-09-29": 3.5} and w["je_monat"] == {"2026-09": 8.5}


# ---------------------------------------------------------------- WU-0013: „ohne Automatik“ je Container
def test_stunden_je_periode_ab_beginn_bis_jetzt():
    from datetime import datetime, timedelta, timezone as tz
    from logik.auswertung import stunden_je_periode, zeitraum
    wien = tz(timedelta(hours=2))
    zr = zeitraum("Tag", date(2026, 9, 29))
    jetzt = datetime(2026, 9, 29, 10, 30, tzinfo=wien)
    h = stunden_je_periode(zr, datetime(2026, 9, 29, 0, 0, tzinfo=wien), jetzt, wien)
    assert len(h) == 24 and h[:10] == [1.0] * 10 and h[10] == 0.5 and sum(h[11:]) == 0
    woche = zeitraum("Woche", date(2026, 9, 30))
    ab = datetime(2026, 9, 29, 12, 0, tzinfo=wien)   # Beginn der Baustelle Dienstag Mittag
    h = stunden_je_periode(woche, ab, datetime(2026, 10, 1, 6, 0, tzinfo=wien), wien)
    assert h == [0.0, 12.0, 24.0, 6.0, 0.0, 0.0, 0.0]
    jahr = zeitraum("Jahr", date(2026, 9, 30))
    h = stunden_je_periode(jahr, datetime(2026, 1, 1, tzinfo=wien), datetime(2026, 3, 1, tzinfo=wien), wien)
    assert h[0] == 31 * 24 and h[1] == 28 * 24 and sum(h[2:]) == 0


def test_ohne_kw_je_geraet_oder_typ():
    from logik.auswertung import ohne_kw
    geraete = [("a", "oelradiator"), ("b", "oelradiator"), ("c", "konvektor"), ("d", "konvektor")]
    mittel = {"a": 2000.0, "b": 1600.0, "c": 1500.0, "d": None}
    assert ohne_kw(geraete, mittel, "geraet") == {"a": 2.0, "b": 1.6, "c": 1.5, "d": 1.5}   # d ohne Messung: Ø des Typs
    assert ohne_kw(geraete, mittel, "typ") == {"a": 1.8, "b": 1.8, "c": 1.5, "d": 1.5}
    assert ohne_kw([("x", "konvektor")], {}, "geraet") == {}
    # FE-0020: inaktive sind nicht dabei (auch nicht mit dem Ø des Typs), ihre Messung zählt aber im Ø
    assert ohne_kw(geraete, mittel, "geraet", {"b", "d"}) == {"a": 2.0, "c": 1.5}
    assert ohne_kw(geraete, mittel, "typ", {"b"}) == {"a": 1.8, "c": 1.5, "d": 1.5}


def test_typ_vergleich_fair():
    """AN-0008: nur Thermostat mit Fühler, nur Container mit einem Typ, Kennzahl kWh je Gradstunde."""
    from logik.auswertung import typ_vergleich_fair
    c = [
        {"id": "a", "name": "Polier", "typen": ["oelradiator"], "fuehler": True, "modus": "thermo", "kwh": 30.0, "gradh": 300.0, "auf": 2.0, "ab": 0.5},
        {"id": "b", "name": "Mannschaft", "typen": ["konvektor"], "fuehler": True, "modus": "thermo", "kwh": 40.0, "gradh": 320.0, "auf": 3.0, "ab": 1.0},
        {"id": "c", "name": "Magazin", "typen": ["oelradiator", "konvektor"], "fuehler": True, "modus": "thermo", "kwh": 9.0, "gradh": 90.0},
        {"id": "d", "name": "Lager", "typen": ["oelradiator"], "fuehler": False, "modus": "plan"},
        {"id": "e", "name": "Sanitär", "typen": ["konvektor"], "fuehler": True, "modus": "plan", "kwh": 0, "gradh": 0},
        {"id": "f", "name": "Büro", "typen": ["konvektor"], "fuehler": True, "modus": "thermo", "kwh": 1.0, "gradh": 5.0},
        {"id": "g", "name": "Schacht", "typen": []},
    ]
    r = typ_vergleich_fair(c)
    assert r["vergleichbar"] and r["oelradiator"]["kwh_gradh"] == 0.1 and r["konvektor"]["kwh_gradh"] == 0.125
    assert r["weniger"] == 20 and r["oelradiator"]["container"] == ["Polier"] and r["konvektor"]["container"] == ["Mannschaft"]
    assert {(x["name"], x["grund"]) for x in r["ausgeschlossen"]} == {
        ("Magazin", "Ölradiator und Konvektor gemischt"), ("Lager", "ohne Fühler"), ("Sanitär", "nicht im Modus Thermostat"),
        ("Büro", "noch zu wenig im Modus Thermostat gemessen")}
    nur_einer = typ_vergleich_fair(c[:1])
    assert not nur_einer["vergleichbar"] and nur_einer["weniger"] is None and nur_einer["konvektor"]["kwh_gradh"] is None


def test_typ_ersparnis():
    """AN-0008: Verbrauch der Ölradiatoren gegen „mit Konvektoren“ (Faktor kWh je Gradstunde)."""
    from logik.auswertung import typ_ersparnis
    typ = {"oelradiator": {"kwh_gradh": 0.1}, "konvektor": {"kwh_gradh": 0.125}, "vergleichbar": True}
    r = typ_ersparnis([4.0, 0.0, 8.0], typ, 0.3)
    assert r["faktor"] == 1.25 and r["konvektor"] == [5.0, 0.0, 10.0] and r["erspart_kwh"] == 3.0 and r["erspart_eur"] == pytest.approx(0.9)
    mehr = typ_ersparnis([10.0], {"oelradiator": {"kwh_gradh": 0.2}, "konvektor": {"kwh_gradh": 0.1}, "vergleichbar": True}, 0.3)
    assert mehr["erspart_kwh"] == -5.0                     # Ölradiator braucht mehr: negativ
    assert typ_ersparnis([1.0], {**typ, "vergleichbar": False}, 0.3) is None


def test_je_m2_rangliste_und_vergleich():
    """AN-0014: kWh je m² in der Rangliste, kWh je Gradstunde und m² beim Ölradiator/Konvektor; ohne Größe Einzel."""
    from logik.auswertung import typ_vergleich_fair
    r = rangliste([{"bereich": "a", "name": "Polier", "kwh": 56, "heizzeit": 20, "m2": 28}, {"bereich": "b", "name": "M01", "kwh": 27, "heizzeit": 10}], 0.3)
    assert [x["kwh_m2"] for x in r] == [2.0, 2.0]
    t = typ_vergleich_fair([
        {"id": "a", "name": "Polier", "typen": ["oelradiator"], "fuehler": True, "modus": "thermo", "kwh": 56.0, "gradh": 200.0, "m2": 28},
        {"id": "b", "name": "M01", "typen": ["konvektor"], "fuehler": True, "modus": "thermo", "kwh": 27.0, "gradh": 200.0},
    ])
    assert t["oelradiator"]["kwh_gradh_m2"] == 0.01 and t["konvektor"]["kwh_gradh_m2"] == 0.01


def test_vergleich_je_m2_kw_und_geraete():
    """FE-0023/AN-0016: Doppelcontainer mit 3 Ölradiatoren gegen Einzelcontainer mit 2 Konvektoren – „weniger“ und der
    Faktor der Ersparnis zählen je m² (je Container wäre der große um 54 % schlechter), Aufheizen auch je kW, je Seite
    Geräte, kW und m²; nur ein Container je Seite → Hinweis."""
    from logik.auswertung import typ_ersparnis, typ_vergleich_fair
    t = typ_vergleich_fair([
        {"id": "a", "name": "Polier", "typen": ["oelradiator"], "fuehler": True, "modus": "thermo", "kwh": 60.0, "gradh": 300.0,
         "m2": 28, "kw": 6.0, "anzahl": 3, "auf": 3.0},
        {"id": "b", "name": "M01", "typen": ["konvektor"], "fuehler": True, "modus": "thermo", "kwh": 39.0, "gradh": 300.0,
         "m2": 14, "kw": 4.0, "anzahl": 2, "auf": 2.0},
    ])
    o, k = t["oelradiator"], t["konvektor"]
    assert (o["anzahl"], o["kw"], o["m2"], k["anzahl"], k["kw"], k["m2"]) == (3, 6.0, 28.0, 2, 4.0, 14.0)
    assert o["kwh_gradh"] == 0.2 and k["kwh_gradh"] == 0.13           # je Container: Ölradiator 54 % mehr …
    assert t["weniger"] == 23                                          # … je m²: 23 % weniger
    assert o["auf_je_kw"] == 0.5 and k["auf_je_kw"] == 0.5 and t["nur_einer"]
    er = typ_ersparnis([10.0], t, 0.3)
    assert er["faktor"] == pytest.approx(1.3)                          # nach m², nicht 0,65 je Container
    ohne_kw = typ_vergleich_fair([{**x, "kw": None} for x in [
        {"id": "a", "name": "A", "typen": ["oelradiator"], "fuehler": True, "modus": "thermo", "kwh": 1.0, "gradh": 30.0, "auf": 2.0}]])
    assert ohne_kw["oelradiator"]["kw"] is None and ohne_kw["oelradiator"]["auf_je_kw"] is None and not ohne_kw["nur_einer"]
