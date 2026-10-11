"""Prognose V2, P4a (BSM-033.09): Energie je Intervall, neun Szenarien, Aggregation und Vergleich (Bauvorlage
CGR-2026-10-11-hochrechnung r5 §8.2, §8.4, Anhang A/B, Regressionen §10). Zahlen vor Rundung mit pytest.approx."""

from __future__ import annotations

from dataclasses import replace
from datetime import UTC, date, datetime, time, timedelta
from zoneinfo import ZoneInfo

import pytest

from logik.prognose_modell import (
    ZENTRAL,
    Aggregat,
    aggregiere,
    berechne_mit,
    berechne_ohne,
    episoden_unmodelliert,
    szenarien,
    waehle_mit,
)
from logik.prognose_regeln import PrognoseRegeln
from logik.prognose_typen import (
    MODELL_VERSION,
    Anfangszustand,
    DutySchaetzung,
    EnergieIntervall,
    HEvidenz,
    HSchaetzung,
    Intervall,
    IstIntervall,
    OhneSchaetzung,
    ParameterSatz,
    PlanIntervall,
    PreisIntervall,
    StufenErgebnis,
    SzenarioLauf,
)
from logik.prognose_wetter import ohne_intervalle, wetterreihe
from logik.prognose_typen import WetterEingabe

R = PrognoseRegeln()
WIEN = ZoneInfo("Europe/Vienna")
TAG = date(2026, 11, 10)
CUT = datetime(2026, 11, 1, tzinfo=UTC)
KLIMA = (0.0, 2.0, 6.0, 10.0, 15.0, 18.0, 20.0, 19.0, 15.0, 10.0, 5.0, 1.0)


def lokal(stunde: float, tag: date = TAG) -> datetime:
    return (datetime.combine(tag, time(), WIEN) + timedelta(hours=stunde)).astimezone(UTC)


def h_modell(h: float = 0.10, unten: float | None = None, oben: float | None = None, *, fenster: int = 12,
             rel: float = 0.2, dmin: float | None = None, dmax: float | None = None) -> HSchaetzung:
    ev = HEvidenz(fenster, 3, 36.0, None, rel, dmin, dmax, None, None, 22.0, 22.0, 0, 0, ("direkt",))
    return HSchaetzung("c1", "k", MODELL_VERSION, CUT, "stationaer", h, unten if unten is not None else h * 0.7,
                       oben if oben is not None else h * 1.3, ev)


def duty_modell(d: float | None = 0.5, tage: int = 3) -> DutySchaetzung:
    return DutySchaetzung("c1", "k", d, tage, 30.0, 15.0, ())


def ohne_modell(h: float = 0.10, t: float = 30.0, *, methode: str = "plateau") -> OhneSchaetzung:
    hs = replace(h_modell(h), evidenz=HEvidenz(4, 2, 7.0, None, 0.05, None, None, None, None, None, None, 0, 0, ()))
    return OhneSchaetzung("c1", "k", methode, hs, t, t - 1, t + 1, None, None, None, 1, 2, 7.0, "angenommen", None, (),   # type: ignore[arg-type]
                          naechte_b=2)


def para(h: float | None = 0.10, *, h_ohne: float | None = 0.10, t_max: float | None = 30.0, frost: float = 6.0) -> ParameterSatz:
    return ParameterSatz(1, h, h_ohne, t_max, frost, None, None)


def iv(von: float, bis: float, *, r: bool = True, ziel: float | None = 22.0, aussen: float = 12.0, p: float | None = 2.0,
       frost: bool = False, art: str = "thermo", episode: str | None = "e1", defizit: float | None = 0.5,
       gruende: tuple[str, ...] = (), fuehler: bool = True, frost_aussen: float | None = None, grund: str | None = None,
       tag: date = TAG) -> PlanIntervall:
    return PlanIntervall(
        zeit=Intervall(lokal(von, tag), lokal(bis, tag)), bereich_id="c1", konfiguration_id="k", regelungsart=art,   # type: ignore[arg-type]
        regulaer_freigegeben=r, frost_bereit=frost, ziel_c=ziel if r else None, aussen_c=aussen, wetterquelle="klima",
        p_max_kw=p, episode_id=episode if r else None, startdefizit_k=defizit if r else None, gruende=gruende,
        grund=grund or ("arbeitszeit" if r else "ausserhalb"), frost_grenze_c=5.0, frost_aus_c=7.0,
        frost_aussen_c=frost_aussen, fuehler=fuehler)


def stunden(von: float, bis: float, **kw) -> list[PlanIntervall]:
    """Je Stunde ein Intervall; der Start (Defizit) steht nur am ersten."""
    defizit = kw.pop("defizit", 0.5)
    return [iv(h, h + 1, defizit=defizit if h == int(von) else None, **kw) for h in range(int(von), int(bis))]


def summe(es, feld: str = "mitte_kwh") -> float:
    return sum(getattr(e, feld) for e in es)


# ---------------------------------------------------------------------- Anhang A
def test_thermo_arbeitstag():
    """H 0,10, P 2, 10 h Soll 22/außen 12, restlicher Frost außen 12, bekannter kleiner Start → Mitte 10, Nachtfrost 0."""
    plan = [iv(0, 7, r=False, frost=True), *stunden(7, 17), iv(17, 24, r=False, frost=True)]
    es = berechne_mit(plan, h_modell(), para(), None, R)
    assert summe(es) == pytest.approx(10.0)
    assert summe(es, "unten_kwh") == pytest.approx(10.0) and summe(es, "oben_kwh") == pytest.approx(10.0)
    assert es[0].mitte_kwh == 0.0 and es[-1].mitte_kwh == 0.0 and es[0].kapazitaet_kwh == pytest.approx(14.0)
    assert {e.mitte_art for e in es} == {"verbrauch"}
    assert summe(es, "kapazitaet_kwh") == pytest.approx(48.0)


def test_thermo_kaelter_leistungsgrenze():
    """Außen 0, Soll fest 22: roh 22 kWh, elektrisch 20 kWh, leistung_limitiert."""
    es = berechne_mit(stunden(7, 17, aussen=0.0), h_modell(), para(), None, R)
    assert summe(es) == pytest.approx(20.0)
    assert all("leistung_limitiert" in e.gruende for e in es)


def test_freier_frosttag():
    """24 h Frostbereitschaft, Ziel 6 / außen −2: Haltemitte 19,2; untere Grenze 0, obere Bereitschaftskapazität 48."""
    es = berechne_mit([iv(0, 24, r=False, frost=True, aussen=-2.0, grund="frei")], h_modell(), para(), None, R)
    (e,) = es
    assert e.mitte_kwh == pytest.approx(19.2) and e.unten_kwh == 0.0 and e.oben_kwh == pytest.approx(48.0)
    assert e.mitte_art == "haltebedarf" and "frost_unvalidiert" in e.gruende and e.stufe.prognose == "C"


def test_kalter_start():
    """Startdefizit 3,5 K: Haltemitte 10, obere reguläre Blockgrenze 20, aufheizen_unmodelliert, höchstens C."""
    es = berechne_mit(stunden(7, 17, defizit=3.5), h_modell(), para(), None, R)
    assert summe(es) == pytest.approx(10.0) and summe(es, "oben_kwh") == pytest.approx(20.0)
    assert all(e.mitte_art == "haltebedarf" and "aufheizen_unmodelliert" in e.gruende for e in es)
    assert {e.stufe.prognose for e in es} == {"C"} and "start_unbekannt" in es[0].stufe.gruende


def test_unbekannter_start_und_anfangszustand():
    """Unbekanntes Defizit (Zukunft) → Haltemitte; läuft der Block schon (start_vorher), entscheidet die Messung."""
    plan = stunden(7, 17, defizit=None)
    assert episoden_unmodelliert(plan, None, R) == {"e1"}
    vorher = [replace(plan[0], gruende=("start_vorher",)), *plan[1:]]
    warm = Anfangszustand(lokal(7), 21.0, None, None, "gemessen")
    kalt = Anfangszustand(lokal(7), 18.0, None, None, "gemessen")
    assert episoden_unmodelliert(vorher, warm, R) == set()
    assert episoden_unmodelliert(vorher, kalt, R) == {"e1"}
    assert episoden_unmodelliert(vorher, replace(warm, beleg="unbekannt"), R) == {"e1"}


def test_kein_raumfuehler_duty():
    """P 2, d 0,50 (3 Tage): künftige 10 h → Mitte 10, Band [0; 20], Stufe B, Witterung unmodelliert."""
    plan = stunden(7, 17, art="plan", ziel=None, defizit=None)
    es = berechne_mit(plan, duty_modell(), para(None), None, R)
    assert summe(es) == pytest.approx(10.0) and summe(es, "unten_kwh") == 0.0 and summe(es, "oben_kwh") == pytest.approx(20.0)
    assert {e.stufe.prognose for e in es} == {"B"} and all("witterung_unmodelliert" in e.gruende for e in es)
    assert {e.mitte_art for e in es} == {"duty"}
    # unter drei Tagen: keine Mitte, Band bleibt die Freigabekapazität
    es2 = berechne_mit(plan, duty_modell(tage=2), para(None), None, R)
    assert all(e.mitte_kwh is None for e in es2) and summe(es2, "oben_kwh") == pytest.approx(20.0)


def test_ohne_fuehler_frost_nach_aussen_hysterese():
    """Ohne Fühler: Frost ein unter frost_aussen (3), aus ab 5; unbekannter Anfang hüllt beide Zustände ein."""
    plan = [iv(h, h + 1, r=False, frost=True, art="plan", fuehler=False, frost_aussen=3.0, aussen=a)
            for h, a in enumerate((4.0, 2.0, 4.0, 6.0))]
    es = berechne_mit(plan, duty_modell(), para(None), None, R)
    assert [e.mitte_kwh for e in es] == [pytest.approx(0.5), pytest.approx(1.0), pytest.approx(1.0), 0.0]
    assert "frost_zustand_unbekannt" in es[0].gruende and es[0].oben_kwh == pytest.approx(2.0)
    bekannt = berechne_mit(plan, duty_modell(), para(None), Anfangszustand(lokal(0), None, False, None, "gemessen"), R)
    assert bekannt[0].mitte_kwh == 0.0 and bekannt[0].oben_kwh == 0.0


def test_neun_szenarien():
    """H [0,08; 0,10; 0,12] × außen [10,5; 12; 13,5], Soll fest 22, 10 h, P 2 → Mitte 10, min 6,8, max 13,8."""
    sz = szenarien(h_modell(0.10, 0.08, 0.12), ohne_modell(), None, None, R)
    assert len(sz) == 9 and len({s.id for s in sz}) == 9
    zentral = next(s for s in sz if s.id == ZENTRAL)
    assert zentral.wetter_delta_k == 0.0 and zentral.parameter.h_mit_kw_k == 0.10 and zentral.parameter.frost_ziel_c == 6.0
    assert {s.parameter.frost_ziel_c for s in sz} == {5.0, 6.0, 7.0}
    laeufe = []
    for s in sz:
        plan = stunden(7, 17, aussen=12.0 + s.wetter_delta_k)
        laeufe.append(SzenarioLauf(s.id, berechne_mit(plan, h_modell(), s.parameter, None, R), ()))
    tag = Intervall(lokal(7), lokal(17))
    (v,) = aggregiere(laeufe, [tag], [], R, gemessen_bis=lokal(0), bereich_ids=["c1"])
    assert v.mit.mitte_kwh == pytest.approx(10.0)
    assert v.mit.unten_kwh == pytest.approx(6.8) and v.mit.oben_kwh == pytest.approx(13.8)


def _lauf(sid: str, mit: float | None, ohne: float | None, *, unten=None, oben=None, bereich="c1") -> SzenarioLauf:
    stufe = StufenErgebnis("C", "C", "stationaer", False, ())
    z = Intervall(lokal(7), lokal(17))
    m = EnergieIntervall(z, bereich, mit, unten if unten is not None else mit, oben if oben is not None else mit, mit, 20.0,
                         "verbrauch" if mit is not None else "keine", stufe, ())
    o = EnergieIntervall(z, bereich, ohne, ohne, ohne, ohne, 20.0, "verbrauch" if ohne is not None else "keine", stufe, ())
    return SzenarioLauf(sid, (m,), (o,))


def test_gepaarte_einsparung():
    """(mit, ohne) = (8, 10), (12, 13), (15, 15) → Einsparungen [2, 1, 0], Band [0; 2] – nicht −5 bis 7."""
    laeufe = [_lauf("p0w1", 8, 10), _lauf(ZENTRAL, 12, 13), _lauf("p2w1", 15, 15)]
    (v,) = aggregiere(laeufe, [Intervall(lokal(7), lokal(17))], [], R, gemessen_bis=lokal(0))
    assert v.gespart.mitte_kwh == pytest.approx(1.0)
    assert (v.gespart.unten_kwh, v.gespart.oben_kwh) == (pytest.approx(0.0), pytest.approx(2.0))
    assert v.gespart_prozent == pytest.approx(100 / 13)


def test_negative_einsparung_bleibt():
    (v,) = aggregiere([_lauf(ZENTRAL, 12, 10)], [Intervall(lokal(7), lokal(17))], [], R, gemessen_bis=lokal(0))
    assert v.gespart.mitte_kwh == pytest.approx(-2.0) and v.gespart_prozent == pytest.approx(-20.0)


def test_teilstunde_heute():
    """Jetzt 12:30, Ist bis jetzt 0,8 kWh in Stunde 12, künftig p = 1 kW → Prognose Stunde 12 = 0,5; zusammen 1,3."""
    stufe = StufenErgebnis("C", "C", "stationaer", False, ())
    stunde = Intervall(lokal(12), lokal(13))
    e = EnergieIntervall(stunde, "c1", 1.0, 1.0, 1.0, 1.0, 2.0, "verbrauch", stufe, ())
    ist = [IstIntervall(Intervall(lokal(12), lokal(12.5)), "c1", 0.8)]
    (v,) = aggregiere([SzenarioLauf(ZENTRAL, (e,), ())], [stunde], ist, R, gemessen_bis=lokal(12.5))
    assert v.mit.mitte_kwh == pytest.approx(1.3) and v.mit.ist_belegt_kwh == pytest.approx(0.8) and v.mit.ist_vollstaendig


def _konstant(tag: date, kw: float = 1.0) -> tuple[list[EnergieIntervall], list]:
    a = datetime.combine(tag, time(), WIEN).astimezone(UTC)
    b = datetime.combine(tag + timedelta(days=1), time(), WIEN).astimezone(UTC)
    w = wetterreihe(WetterEingabe((), (), KLIMA, ()), Intervall(a, b), "Europe/Vienna", 0.0, R)
    stufe = StufenErgebnis("C", "C", "stationaer", False, ())
    es = [EnergieIntervall(x.zeit, "c1", kw, kw, kw, kw, 2.0, "verbrauch", stufe, ()) for x in w]
    return es, w


@pytest.mark.parametrize(("tag", "kwh"), [(date(2026, 10, 25), 25.0), (date(2027, 3, 28), 23.0)])
def test_sommerzeit(tag, kwh):
    """25.10.2026: 25 kWh, die lokale Stunde 02 zweimal (zwei UTC-Intervalle); 28.03.2027: 23 kWh."""
    es, w = _konstant(tag)
    z = Intervall(datetime.combine(tag, time(), WIEN).astimezone(UTC), datetime.combine(tag + timedelta(days=1), time(), WIEN).astimezone(UTC))
    (v,) = aggregiere([SzenarioLauf(ZENTRAL, tuple(es), ())], [z], [], R, gemessen_bis=z.von)
    assert v.mit.mitte_kwh == pytest.approx(kwh)
    zwei = [x for x in w if x.zeit.von.astimezone(WIEN).hour == 2]
    assert len(zwei) == (2 if kwh == 25.0 else 0) and len({x.zeit.von for x in zwei}) == len(zwei)


def test_planbruch():
    """10 h erlaubt, P 2, Rohmodell 30 kWh/Tag → 20 kWh; gesperrte Nachtstunden bekommen nichts."""
    plan = [iv(0, 7, r=False), *stunden(7, 17, aussen=-8.0), iv(17, 24, r=False)]   # 0,10 · 30 K = 3 kW > P
    es = berechne_mit(plan, h_modell(), para(), None, R)
    assert summe(es) == pytest.approx(20.0) and es[0].mitte_kwh == 0.0 and es[-1].mitte_kwh == 0.0


def test_kein_gegenmodell():
    """mit 10 kWh, ohne nicht identifiziert → Einsparungsmitte None (kein Ersatz aus dem alten Zähler)."""
    plan = stunden(7, 17)
    mit = berechne_mit(plan, h_modell(), para(), None, R)
    ohne = berechne_ohne(plan, ohne_modell(methode="keine"), para(), None, R)
    assert all(e.mitte_kwh is None and e.unten_kwh is None for e in ohne)
    (v,) = aggregiere([SzenarioLauf(ZENTRAL, mit, ohne)], [Intervall(lokal(7), lokal(17))], [], R, gemessen_bis=lokal(0))
    assert v.mit.mitte_kwh == pytest.approx(10.0)
    assert v.ohne.mitte_kwh is None and v.gespart.mitte_kwh is None and v.gespart_prozent is None
    assert v.gespart.unten_kwh is None and v.ohne.stufe.prognose == "A"


def test_identisches_geraet_planmodus_nie_thermo_soll():
    """Planmodus mit Fühler: Duty-Rückfall, das Komfort-Soll ist kein Betriebsziel (Ziel None)."""
    plan = stunden(7, 17, art="plan", ziel=None)
    es = berechne_mit(plan, duty_modell(), para(0.10), None, R)
    assert {e.mitte_art for e in es} == {"duty"} and summe(es) == pytest.approx(10.0)


# ---------------------------------------------------------------------- Anhang B
@pytest.mark.parametrize(("aussen", "h", "kwh"), [(12.0, 24, 43.2), (0.0, 24, 48.0), (12.0, 25, 45.0)])
def test_wetterabhaengiges_ohne(aussen, h, kwh):
    """H 0,10, T_max 30, P 2: außen 12 → 43,2 kWh/24 h; außen 0 → 48 (gedeckelt); 25-h-Tag → 45."""
    plan = [iv(i, i + 1, r=False, aussen=aussen) for i in range(h)]
    es = berechne_ohne(plan, ohne_modell(), para(), None, R)
    assert summe(es) == pytest.approx(kwh)
    assert all("thermostat_angenommen" in e.gruende for e in es)


def test_ohne_ueber_mitternacht_ohne_warmup():
    """Regression 10: zwei Tage am Stück = 2 × ein Tag (kein tägliches Warm-up)."""
    zwei = [iv(i, i + 1, r=False) for i in range(48)]
    assert summe(berechne_ohne(zwei, ohne_modell(), para(), None, R)) == pytest.approx(2 * 43.2)


# ---------------------------------------------------------------------- Regressionen und Eigenschaften
def test_fehlendes_p_ref():
    """Regression 1: fehlende Leistungsreferenz → Kapazität None, kein geratener Deckel."""
    es = berechne_mit(stunden(7, 17, p=None, aussen=-8.0), h_modell(), para(), None, R)
    assert all(e.kapazitaet_kwh is None and "p_ref_fehlt" in e.gruende for e in es)
    assert summe(es) == pytest.approx(30.0)   # ungedeckelt, nichts erfunden


def test_aggregat_min_der_summen():
    """Regression 4: Band = min_i ΣE_i, nicht Σ min_i E_i (zwei Stunden mit gegenläufigen Läufen)."""
    stufe = StufenErgebnis("C", "C", "stationaer", False, ())
    a, b = Intervall(lokal(7), lokal(8)), Intervall(lokal(8), lokal(9))

    def lauf(sid, x, y):
        return SzenarioLauf(sid, (EnergieIntervall(a, "c1", x, x, x, x, 2, "verbrauch", stufe, ()),
                                  EnergieIntervall(b, "c1", y, y, y, y, 2, "verbrauch", stufe, ())), ())
    (v,) = aggregiere([lauf(ZENTRAL, 1.0, 1.0), lauf("p0w1", 0.5, 1.5), lauf("p2w1", 1.5, 0.5)],
                      [Intervall(lokal(7), lokal(9))], [], R, gemessen_bis=lokal(0))
    assert (v.mit.unten_kwh, v.mit.oben_kwh) == (pytest.approx(2.0), pytest.approx(2.0))   # Σmin wäre 1,0


def test_fehlender_container_und_tarif():
    """Regression 5: fehlender Container → keine Gesamtmitte (Teilwert + IDs); fehlender Tarif → kein €."""
    zeit = Intervall(lokal(7), lokal(17))
    l1, l2 = _lauf(ZENTRAL, 10, 13), _lauf(ZENTRAL, None, 5, unten=0.0, oben=20.0, bereich="c2")
    lauf = SzenarioLauf(ZENTRAL, (*l1.mit, *l2.mit), (*l1.ohne, *l2.ohne))
    agg = Aggregat([zeit], lokal(0), ["c1", "c2"], [PreisIntervall(Intervall(lokal(0), lokal(12)), 0.3)])
    agg.hinzufuegen(lauf)
    v = agg.vergleich(0)
    assert v.mit.mitte_kwh is None and v.mit.teil_mitte_kwh == pytest.approx(10.0) and v.mit.fehlende_bereiche == ("c2",)
    assert v.mit.mitte_art == "keine" and v.gespart.mitte_kwh is None and "fehlende_modelle" in v.mit.gruende
    assert v.mit.oben_kwh == pytest.approx(30.0)   # physikalische Grenze bleibt (Kapazität des Unbekannten: 20)
    mit_eur, ohne_eur, _ = agg.euro(0, v)
    assert ohne_eur.mitte == pytest.approx(18 * 0.3)   # 07–12 Uhr mit Preis (ganzes Intervall ab 07:00)
    agg2 = Aggregat([zeit], lokal(0), ["c1"], [PreisIntervall(Intervall(lokal(0), lokal(24)), 0.3)])
    agg2.hinzufuegen(SzenarioLauf(ZENTRAL, l1.mit, l1.ohne))
    v2 = agg2.vergleich(0)
    assert agg2.euro(0, v2)[0].mitte == pytest.approx(3.0) and agg2.euro(0, v2)[2].mitte == pytest.approx(0.9)
    agg3 = Aggregat([zeit], lokal(0), ["c1"], [])
    agg3.hinzufuegen(SzenarioLauf(ZENTRAL, l1.mit, l1.ohne))
    assert agg3.euro(0, agg3.vergleich(0))[0].mitte is None   # kein Tarif → kein €


def test_baseline_im_zeitraum_nicht_vergleichbar():
    zeit = Intervall(lokal(0), lokal(24, TAG))
    ist = [IstIntervall(Intervall(lokal(0), lokal(24)), "c1", 30.0, baseline_kwh=30.0, sonder_kwh=0.0)]
    (v,) = aggregiere([_lauf(ZENTRAL, 10, 13)], [Intervall(lokal(0), lokal(48))], ist, R, gemessen_bis=lokal(24))
    assert not v.vergleichbar and v.gespart.mitte_kwh is None and v.gespart.stufe.prognose == "A"
    assert v.ist_baseline_kwh == pytest.approx(30.0) and "baseline_im_zeitraum" in v.gruende
    del zeit


def test_haltemitte_ohne_punktmitte_der_ersparnis():
    plan = stunden(7, 17, defizit=None)
    mit = berechne_mit(plan, h_modell(), para(), None, R)
    ohne = berechne_ohne(plan, ohne_modell(), para(), None, R)
    (v,) = aggregiere([SzenarioLauf(ZENTRAL, mit, ohne)], [Intervall(lokal(7), lokal(17))], [], R, gemessen_bis=lokal(0))
    assert v.mit.mitte_art == "haltebedarf" and v.mit.mitte_kwh == pytest.approx(10.0)
    assert v.gespart.mitte_kwh is None and v.gespart.mitte_art == "keine" and v.gespart_prozent is None
    assert v.gespart.unten_kwh == pytest.approx(18.0 - 20.0) and v.gespart.oben_kwh == pytest.approx(18.0 - 10.0)


def test_ist_und_modell_nicht_doppelt():
    """Heute: Ist bis gemessen_bis, Modell nur danach; ein Ist-Intervall über gemessen_bis ist nicht teilbar."""
    stufe = StufenErgebnis("C", "C", "stationaer", False, ())
    es = tuple(EnergieIntervall(Intervall(lokal(h), lokal(h + 1)), "c1", 1.0, 1.0, 1.0, 1.0, 2.0, "verbrauch", stufe, ())
               for h in range(24))
    ist = [IstIntervall(Intervall(lokal(h), lokal(h + 1)), "c1", 2.0) for h in range(10)]
    (v,) = aggregiere([SzenarioLauf(ZENTRAL, es, ())], [Intervall(lokal(0), lokal(24))], ist, R, gemessen_bis=lokal(10))
    assert v.mit.mitte_kwh == pytest.approx(20.0 + 14.0) and v.mit.ist_vollstaendig
    (w,) = aggregiere([SzenarioLauf(ZENTRAL, es, ())], [Intervall(lokal(0), lokal(24))], ist[:9], R, gemessen_bis=lokal(10))
    assert not w.mit.ist_vollstaendig and "messluecke" in w.mit.gruende   # Lücke bleibt Lücke


def test_eigenschaften_additiv_und_grenzen():
    """E ≥ 0, E ≤ P·dt, Stunden summieren sich zu Tag und Woche; kein Intervall doppelt."""
    tage = [TAG + timedelta(days=i) for i in range(7)]
    plan = []
    for t in tage:
        plan += [iv(0, 7, r=False, frost=True, aussen=-3.0, tag=t),
                 *[iv(h, h + 1, aussen=-10.0 + h, episode=f"e{t}", defizit=0.5 if h == 7 else None, tag=t)
                   for h in range(7, 17)],
                 iv(17, 24, r=False, frost=True, aussen=-1.0, tag=t)]
    es = berechne_mit(plan, h_modell(), para(), None, R)
    for e in es:
        assert e.mitte_kwh >= 0 and e.unten_kwh >= 0 and e.oben_kwh >= e.mitte_kwh - 1e-12
        assert e.mitte_kwh <= 2.0 * (e.zeit.bis - e.zeit.von).total_seconds() / 3600 + 1e-9
    lauf = SzenarioLauf(ZENTRAL, es, berechne_ohne(plan, ohne_modell(), para(), None, R))
    woche = Intervall(lokal(0, tage[0]), lokal(0, tage[-1] + timedelta(days=1)))
    tage_z = [Intervall(lokal(0, t), lokal(24, t)) for t in tage]
    std = [Intervall(lokal(h, tage[2]), lokal(h + 1, tage[2])) for h in range(24)]
    ergebnisse = aggregiere([lauf], [woche, *tage_z, *std], [], R, gemessen_bis=lokal(0, tage[0]))
    w, ts, ss = ergebnisse[0], ergebnisse[1:8], ergebnisse[8:]
    assert sum(t.mit.mitte_kwh for t in ts) == pytest.approx(w.mit.mitte_kwh)
    assert sum(t.ohne.mitte_kwh for t in ts) == pytest.approx(w.ohne.mitte_kwh)
    assert sum(s.mit.mitte_kwh for s in ss) == pytest.approx(ts[2].mit.mitte_kwh)
    assert w.mit.mitte_kwh == pytest.approx(summe(es))


def test_waehle_mit_und_keine_legacy_quelle():
    """Regression 11: V2 ohne Identifikation (A) liefert None – kein Tagesschnitt, kein altes Verhältnis."""
    keine = replace(h_modell(), methode="keine", h_kw_k=None, h_unten_kw_k=None, h_oben_kw_k=None)
    tage = replace(h_modell(), methode="tagesregression", evidenz=replace(h_modell().evidenz, tage=3))
    assert waehle_mit("plan", keine, tage, duty_modell(), R) == duty_modell()
    assert waehle_mit("thermo", h_modell(), tage, duty_modell(), R) == h_modell()
    assert waehle_mit("thermo", keine, tage, duty_modell(), R) is tage
    assert waehle_mit("thermo", keine, keine, duty_modell(), R) is keine
    es = berechne_mit(stunden(7, 17), keine, para(None), None, R)
    assert all(e.mitte_kwh is None and e.mitte_art == "keine" for e in es)
    assert {e.stufe.evidenz for e in es} == {"A"}


def test_szenarien_ohne_identifikation():
    sz = szenarien(duty_modell(), ohne_modell(methode="keine", t=30.0), None, None, R)
    assert all(s.parameter.h_mit_kw_k is None for s in sz)


def test_ohne_intervalle_rund_um_die_uhr():
    w = wetterreihe(WetterEingabe((), (), KLIMA, ()), Intervall(lokal(0), lokal(24)), "Europe/Vienna", 0.0, R)
    plan = ohne_intervalle(w, "c1", "k", "thermo", 2.0)
    assert len(plan) == 24 and not any(p.regulaer_freigegeben for p in plan)
    es = berechne_ohne(plan, ohne_modell(), para(), None, R)
    assert all(e.mitte_kwh > 0 for e in es)


# ---------------------------------------------------------------------- ganze Rechnung und Ist
def test_rechne_ganze_schattenprognose():
    """Zwei Container über drei Tage: neun Läufe, Ist bis gemessen_bis, Modell danach; der Container ohne Modell fehlt."""
    from logik.arbeitszeit import Arbeitszeit, HeizRegeln, WetterTag   # noqa: PLC0415
    from logik.prognose_modell import ContainerModelle, ist_stunden, ist_tage, rechne   # noqa: PLC0415
    from logik.prognose_typen import Leistungsreferenz, PlanTag, PrognoseAuftrag   # noqa: PLC0415

    p_ref = Leistungsreferenz(2.0, "geraet_einstellung", CUT, "x")
    az = Arbeitszeit(date(2026, 1, 1), "AZ", {i: (420, 990) for i in range(5)})
    tage = [TAG - timedelta(days=1), TAG, TAG + timedelta(days=1)]

    def pt(b: str, d: date) -> PlanTag:
        return PlanTag(d, b, "k", None, (az,), (), False, HeizRegeln(fruehstart=False), None, False, WetterTag(), "klima", 15.0,
                       "tageshoechst", True, False, "thermo", None, (), 10.0, 5.0, 7.0, None, True, "frost", (), (p_ref,),
                       False, True, soll_fest_c=22.0)
    zr = Intervall(lokal(0, tage[0]), lokal(0, tage[-1] + timedelta(days=1)))
    gb = lokal(10, TAG)
    auftrag = PrognoseAuftrag(zr, "Europe/Vienna", ("c1", "c2"), (), (), tuple(pt(b, d) for b in ("c1", "c2") for d in tage[1:]),
                              WetterEingabe((), (), KLIMA, ((tage[0], 4.0),)), (), gb, (), ())
    ist = [*ist_tage({"c1": [(tage[0], 12.0)], "c2": [(tage[0], 8.0)]}, {}, "Europe/Vienna"),
           *ist_stunden({("c1", lokal(h, TAG)): 1.0 for h in range(10)} | {("c2", lokal(h, TAG)): 0.5 for h in range(10)},
                        {(b, lokal(h, TAG)): 3600.0 for b in ("c1", "c2") for h in range(10)}, ("c1", "c2"),
                        lokal(0, TAG), gb, R)]
    zeitraeume = [zr, *[Intervall(lokal(0, d), lokal(24, d)) for d in tage]]
    agg = rechne(auftrag, {"c1": ContainerModelle("c1", h_modell(), ohne_modell())}, zeitraeume, ist, R)
    assert len(agg.laeufe) == 9
    ganz, gestern, heute, morgen = (agg.vergleich(i) for i in range(4))
    assert ganz.mit.mitte_kwh is None and ganz.mit.fehlende_bereiche == ("c2",)
    assert gestern.mit.mitte_kwh == pytest.approx(20.0) and gestern.mit.ist_vollstaendig   # nur Ist
    assert gestern.ohne.mitte_kwh is None   # c2 ohne Gegenmodell
    assert heute.mit.ist_belegt_kwh == pytest.approx(15.0)
    assert gestern.mit.teil_mitte_kwh == pytest.approx(20.0) and heute.mit.fehlende_bereiche == ("c2",)
    # Teilsumme = nur die Container, die im ganzen Zeitraum bekannt sind (c1)
    assert ganz.mit.teil_mitte_kwh == pytest.approx(12.0 + heute.mit.teil_mitte_kwh + morgen.mit.teil_mitte_kwh)
    agg2 = rechne(replace(auftrag, bereich_ids=("c1",)), {"c1": ContainerModelle("c1", h_modell(), ohne_modell())},
                  zeitraeume, [x for x in ist if x.bereich_id == "c1"], R)
    v = agg2.vergleich(0)
    assert v.mit.mitte_kwh is not None and v.ohne.mitte_kwh is not None and v.gespart.unten_kwh is not None
    assert v.mit.ist_belegt_kwh == pytest.approx(22.0) and v.mit.stufe.prognose == "C"


def test_ist_stunden_luecke():
    """Stunde mit zu wenig mitgeschriebener Zeit → Messlücke (None, nie 0); letzte Stunde endet bei gemessen_bis."""
    from logik.prognose_modell import ist_stunden   # noqa: PLC0415

    ist = ist_stunden({("c1", lokal(0)): 1.0}, {("c1", lokal(0)): 3600.0, ("c1", lokal(1)): 1000.0, ("c1", lokal(2)): 1800.0},
                      ("c1",), lokal(0), lokal(2.5), R)
    assert [x.kwh for x in ist] == [1.0, None, 0.0] and ist[-1].zeit.bis == lokal(2.5)


def test_nach_der_heizperiode_ohne_plantage():
    """Ohne Plantage (Heizperiode vorbei) bleibt „ohne“ berechenbar – es braucht nur Wetter und Leistung."""
    from logik.prognose_modell import ContainerModelle, rechne   # noqa: PLC0415
    from logik.prognose_typen import PrognoseAuftrag   # noqa: PLC0415

    zr = Intervall(lokal(0), lokal(24))
    auftrag = PrognoseAuftrag(zr, "Europe/Vienna", ("c1",), (), (), (), WetterEingabe((), (), KLIMA, ((TAG, 12.0),)), (),
                              lokal(24), (), ())
    m = ContainerModelle("c1", h_modell(), ohne_modell(), None, "k", "thermo", 2.0)
    ist = [IstIntervall(zr, "c1", 9.0)]
    v = rechne(auftrag, {"c1": m}, [zr], ist, R).vergleich(0)
    assert v.mit.mitte_kwh == pytest.approx(9.0) and v.mit.stufe.methode == "gemessen"
    # Tagesmittel 12 mit Tagesgang ±3 K: in kalten Stunden am Deckel P, daher etwas unter 43,2
    assert 42.0 < v.ohne.mitte_kwh < 43.2 and v.gespart.mitte_kwh == pytest.approx(v.ohne.mitte_kwh - 9.0)


def test_fehlender_container_zieht_auf_a():
    """Ein Container ohne Modell (oder „ohne“ ganz ohne Läufe) → Stufe A, nicht D."""
    zeit = Intervall(lokal(7), lokal(17))
    agg = Aggregat([zeit], lokal(0), ["c1", "c2"])
    agg.hinzufuegen(_lauf(ZENTRAL, 10, None))
    v = agg.vergleich(0)
    assert v.mit.stufe.prognose == "A" and v.ohne.stufe.prognose == "A" and v.gespart.stufe.prognose == "A"
    leer = Aggregat([zeit], lokal(0), ["c1"])
    assert leer.vergleich(0).ohne.stufe.prognose == "A"


def test_laufender_block_nutzt_messung_von_jetzt():
    """Ein Block, der zur Messung schon läuft, nimmt das gemessene Defizit (kein Haltebedarf, wenn warm)."""
    plan = stunden(7, 17, defizit=None)
    warm = Anfangszustand(lokal(10), 21.8, None, None, "gemessen")
    assert episoden_unmodelliert(plan, warm, R) == set()
    assert episoden_unmodelliert(plan, replace(warm, innen_c=18.0), R) == {"e1"}
    assert episoden_unmodelliert(plan, replace(warm, zeit=lokal(18)), R) == {"e1"}   # Messung nach dem Block


def test_baseline_tage_und_heute():
    from logik.baseline import Lauf   # noqa: PLC0415
    from logik.prognose_modell import baseline_tage, ist_stunden   # noqa: PLC0415

    d = date(2026, 11, 14)
    laeufe = [Lauf("a", "c1", d, d + timedelta(days=2), "abgebrochen", ende=d),
              Lauf("b", "c2", d, d + timedelta(days=2), "fertig"), Lauf("c", "c3", d, d + timedelta(days=2), "abgesagt"),
              Lauf("d", "c4", d, d + timedelta(days=1), "laeuft")]
    assert baseline_tage(laeufe) == {"c1": {d}, "c2": {d, d + timedelta(days=1)}, "c4": {d}}
    ist = ist_stunden({("c1", lokal(0)): 1.0}, {("c1", lokal(0)): 3600.0}, ("c1",), lokal(0), lokal(1), R, ["c1"])
    assert ist[0].baseline_kwh == 1.0


def test_zeitraeume():
    from logik.prognose_modell import zeitraeume   # noqa: PLC0415

    z = zeitraeume(date(2026, 10, 1), date(2027, 4, 30), date(2026, 10, 25), "Europe/Vienna")
    assert len(z["monat"]) == 7 and len(z["tag"]) == 212 and len(z["stunde"]) == 25
    assert z["woche"][0].bis == lokal(0, date(2026, 10, 5)) and z["woche"][-1].bis == z["heizperiode"][0].bis
    assert sum((x.bis - x.von).total_seconds() for x in z["tag"]) == (z["heizperiode"][0].bis - z["heizperiode"][0].von).total_seconds()
    assert zeitraeume(date(2026, 10, 1), date(2027, 4, 30), date(2027, 6, 1), "Europe/Vienna")["stunde"] == []


def test_messluecke_nie_d_und_teilwert():
    """S1: fehlt eine Tagessumme, bleibt der belegte Teil, aber nie Stufe D/„gemessen“; Hinweis in der Anzeige."""
    from logik.prognose_anzeige import anzeige_aus   # noqa: PLC0415
    from logik.prognose_modell import EuroSumme   # noqa: PLC0415

    zwei = Intervall(lokal(0), lokal(48))
    ist = [IstIntervall(Intervall(lokal(0), lokal(24)), "c1", 10.0)]   # zweiter Tag fehlt
    (v,) = aggregiere([], [zwei], ist, R, gemessen_bis=lokal(48), bereich_ids=["c1"])
    assert v.mit.mitte_kwh == pytest.approx(10.0) and not v.mit.ist_vollstaendig
    assert v.mit.stufe.prognose == "C" and v.mit.stufe.methode == "gemessen_luecke" and "messluecke" in v.mit.gruende
    a = anzeige_aus(v, (EuroSumme(None, None, None),) * 3, MODELL_VERSION, lokal(48), lokal(48))
    assert a.mit.status_text == "Teilweise gemessen" and a.mit.wert_kwh == pytest.approx(10.0)
    assert "Für einzelne Tage fehlen Messwerte." in a.mit.hinweise
    (voll,) = aggregiere([], [Intervall(lokal(0), lokal(24))], ist, R, gemessen_bis=lokal(48), bereich_ids=["c1"])
    assert voll.mit.stufe.prognose == "D" and voll.mit.stufe.methode == "gemessen"


def test_herkunft_ersatz_bis_in_die_anzeige():
    """S2: Ersatzpfad/rekonstruierter Kontext der Evidenz erscheint je Intervall und als Hinweis „Ältere Messdaten …“."""
    from logik.prognose_anzeige import anzeige_aus   # noqa: PLC0415
    from logik.prognose_modell import ContainerModelle, EuroSumme, rechne   # noqa: PLC0415
    from logik.prognose_typen import PrognoseAuftrag   # noqa: PLC0415

    hm = h_modell()
    ersatz = replace(hm, evidenz=replace(hm.evidenz, gruende=("ersatzpfad", "kontext_rekonstruiert")))
    zr = Intervall(lokal(0), lokal(24))
    auftrag = PrognoseAuftrag(zr, "Europe/Vienna", ("c1",), (), (), (), WetterEingabe((), (), KLIMA, ((TAG, 12.0),)), (),
                              lokal(0), (), ())
    ohne = replace(ohne_modell(), h=replace(ohne_modell().h, evidenz=replace(ohne_modell().h.evidenz, gruende=("ersatzpfad",
                                                                                                         "kontext_rekonstruiert"))))
    agg = rechne(auftrag, {"c1": ContainerModelle("c1", ersatz, ohne, None, "k", "thermo", 2.0)}, [zr], [], R)
    v = agg.vergleich(0)
    assert {"ersatzpfad", "kontext_rekonstruiert"} <= set(v.ohne.gruende)
    es = berechne_mit(stunden(7, 17), ersatz, para(), None, R)
    assert all("ersatzpfad" in e.gruende for e in es)
    a = anzeige_aus(v, (EuroSumme(None, None, None),) * 3, MODELL_VERSION, lokal(0), lokal(0))
    assert "Ältere Messdaten wurden mit vereinfachten Prüfungen verwendet." in a.ohne.hinweise


def test_gueltige_modelle_konfigurationswechsel():
    """S3: Schätzung einer anderen Konfiguration gilt nicht – der Container fehlt bis zur Neuschätzung."""
    from logik.prognose_modell import ContainerModelle, gueltige_modelle   # noqa: PLC0415

    m = {"c1": ContainerModelle("c1", h_modell(), ohne_modell(), None, "k1"),
         "c2": ContainerModelle("c2", h_modell(), ohne_modell(), None, "k2")}
    gueltig, ab = gueltige_modelle(m, {"c1": "k1", "c2": "k9"})
    assert set(gueltig) == {"c1"} and ab == ("c2",)
