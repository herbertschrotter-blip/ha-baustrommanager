"""Prognose V2, P3 (BSM-033.08): Baseline-Plateaus und Gegenmodell „ohne Automatik“ – Zahlenkatalog Bauvorlage
(CGR-2026-10-11-hochrechnung r5, Anhang B), Numerik vor Rundung."""

from datetime import UTC, date, datetime, timedelta

import pytest

from logik.baseline import Lauf
from logik.prognose_baseline import baseline_metadaten, plateaus, schaetze_ohne
from logik.prognose_regeln import PrognoseRegeln
from logik.prognose_stufe import evidenz_ohne
from logik.prognose_typen import BaselineMetadaten, Intervall, ModellKontext, Validierung

from prognose_hilfen import KID, WIEN, fenster, geraet, kontext, minute, takt

R = PrognoseRegeln()
ZONE = "Europe/Vienna"
SA = date(2026, 11, 14)
BIS = datetime(2027, 1, 1, tzinfo=UTC)
KTX = ModellKontext("c1", KID, BIS)


def utc(tag: date, stunde: float = 0) -> datetime:
    return (datetime.combine(tag, datetime.min.time(), WIEN) + timedelta(hours=stunde)).astimezone(UTC)


def lauf(lid: str, von: date, tage: int, *, status: str = "fertig", nachweis: str = "angenommen") -> BaselineMetadaten:
    return BaselineMetadaten(lid, "c1", Intervall(utc(von), utc(von + timedelta(days=tage))), status, nachweis,   # type: ignore[arg-type]
                             "unbekannt", None, KID, ())


def lauf_minuten(lid: str, von: date, stunden: float, *, typ: str = "oelradiator", strom=lambda i: takt(i, 9),
                 innen=lambda i: 30.0, **kw):
    """Baseline-Lauf ab 00:00: eine Minute davor (Anker), dann alle Heizkörper durchgehend am Strom (Relay an)."""
    t0 = utc(von)
    aus = [minute(t0 - timedelta(minutes=1), grund="frost", zustand="aus", k=kontext(regulaer_freigegeben=False),
                  geraete=[geraet(t0 - timedelta(minutes=1), typ=typ)])]
    k = kontext(regulaer_freigegeben=False, baseline_lauf_id=lid)
    for i in range(round(stunden * 60)):
        t = t0 + timedelta(minutes=i)
        aus.append(minute(t, grund="baseline", zustand="heizt", soll_c=None, innen_c=innen(i), k=k,
                          geraete=[geraet(t, an=strom(i), typ=typ)], **kw))
    return aus


def test_baseline_plateau():
    """P 2, Innen 30, außen 12, 3 h, 5,4 kWh, volle Thermostatzyklen → X 54, H_ohne 0,10, Duty 0,90, zählt."""
    ps = plateaus(lauf_minuten("L1", SA, 7), [lauf("L1", SA, 2)], R)
    (p,) = ps   # Öl: 4 h Warm-up, dann ein 3-h-Block
    assert p.gueltig, p.gruende
    assert (p.zeit.von, p.zeit.bis) == (utc(SA, 4), utc(SA, 7)) and p.art == "baseline" and p.lauf_id == "L1"
    assert p.x_innen_kh == pytest.approx(54.0) and p.energie_kwh == pytest.approx(5.4)
    assert p.energie_kwh / p.x_innen_kh == pytest.approx(0.10)
    assert p.energie_kwh / (p.p_max_kw * 3) == pytest.approx(0.90)


def test_baseline_ohne_zyklen_kein_tmax():
    """Gleicher Raumwert, durchgehend 2 kW → kein T_max-Nachweis trotz stabiler Temperatur."""
    ps = plateaus(lauf_minuten("L1", SA, 12, strom=lambda i: 60.0), [lauf("L1", SA, 2)], R)
    assert ps and not any(p.gueltig for p in ps)
    assert "zyklen_zu_wenig" in ps[0].gruende and "duty_zu_gross" in ps[0].gruende
    o = schaetze_ohne(KTX, ps, [lauf("L1", SA, 2)], None, R, zeitzone=ZONE)
    assert o.methode == "keine" and o.t_max_c is None and evidenz_ohne(o, R) == "A"


def test_langsame_zyklen_verlaengert_bis_sechs_stunden():
    """Konvektor mit 60-min-Takt: der 2-h-Grundblock hat zu wenige Zyklen → bis zum frühesten Ende mit drei verlängert."""
    ms = lauf_minuten("L1", SA, 9, typ="konvektor", strom=lambda i: takt(i, 30, 60))
    p = plateaus(ms, [lauf("L1", SA, 2)], R)[0]
    dauer = (p.zeit.bis - p.zeit.von).total_seconds() / 3600
    assert "verlaengert" in p.gruende and 2 < dauer <= R.baseline_block_max_h
    assert dict(p.zyklen_je_geraet)["hk1"] == R.zyklen_min and p.gueltig, p.gruende


def test_nur_bestaetigte_laeufe():
    ms = lauf_minuten("L1", SA, 7)
    assert plateaus(ms, [lauf("L1", SA, 2, status="geplant")], R) == ()
    assert plateaus(ms, [lauf("L2", SA, 2)], R) == ()
    assert plateaus(ms, [lauf("L1", SA + timedelta(days=1), 1)], R) == ()   # Zeit nicht im Lauf


def test_relay_muss_durchgehend_an_sein():
    ms = lauf_minuten("L1", SA, 7)
    ms[300] = ms[300].__class__(**{**ms[300].__dict__, "geraete": (geraet(ms[300].zeit.von, typ="oelradiator", sekunden_ein=30),)})
    ps = plateaus(ms, [lauf("L1", SA, 2)], R)
    assert all(p.zeit.von >= ms[301].zeit.von for p in ps)   # neue Episode, neues Warm-up


def nacht_laeufe(innen2: float = 30.0):
    ms = lauf_minuten("L1", SA, 48, innen=lambda i: 30.0 if i < 24 * 60 else innen2)
    return ms, [lauf("L1", SA, 2)]


def test_erster_lauf_hoechstens_b():
    """Zwei gültige Nachtplateaus ≥ 6 h, nur ein Lauf → Gegenmodell höchstens B; T_max 30, H_ohne 0,10."""
    ms, laeufe = nacht_laeufe()
    o = schaetze_ohne(KTX, plateaus(ms, laeufe, R), laeufe, None, R, zeitzone=ZONE)
    assert o.methode == "plateau" and o.laeufe == 1 and o.naechte_b >= 2
    assert o.beobachtungstage == 3   # Nächte Mittag bis Mittag: Fr (Sa-Vormittag), Sa, So
    assert o.t_max_c == pytest.approx(30.0) and (o.t_max_unten_c, o.t_max_oben_c) == (pytest.approx(29.0), pytest.approx(31.0))
    assert o.h.h_kw_k == pytest.approx(0.10) and o.h.h_unten_kw_k == pytest.approx(0.07)   # Mindestband ±30 %
    assert o.plateau_h >= R.baseline_b_gesamt_min_h
    assert evidenz_ohne(o, R) == "B"
    assert o.thermostat_nachweis == "angenommen" and "thermostat_angenommen" in o.gruende


def test_zwei_laeufe_drei_tage_c_und_d_mit_validierung():
    ms, laeufe = nacht_laeufe()
    zweiter = SA + timedelta(days=7)
    ms += lauf_minuten("L2", zweiter, 24)
    laeufe = [*laeufe, lauf("L2", zweiter, 1)]
    o = schaetze_ohne(KTX, plateaus(ms, laeufe, R), laeufe, None, R, zeitzone=ZONE)
    assert (o.laeufe, o.beobachtungstage) == (2, 5) and evidenz_ohne(o, R) == "C"
    v = Validierung("ohne", BIS, BIS, BIS + timedelta(days=8), 7, 7, 6.0, 70.0, 0.15, 0.05, None, True)
    o = schaetze_ohne(KTX, plateaus(ms, laeufe, R), laeufe, v, R, zeitzone=ZONE)
    assert evidenz_ohne(o, R) == "D"


def test_naechte_ueber_2_k_auseinander():
    ms, laeufe = nacht_laeufe(innen2=32.5)
    o = schaetze_ohne(KTX, plateaus(ms, laeufe, R), laeufe, None, R, zeitzone=ZONE)
    assert o.t_max_c is None and "tmax_nicht_konstant" in o.gruende and o.methode == "keine"


def test_thermostat_geaendert_kein_gegenmodell():
    ms, _ = nacht_laeufe()
    laeufe = [lauf("L1", SA, 2, nachweis="geaendert")]
    o = schaetze_ohne(KTX, plateaus(ms, laeufe, R), laeufe, None, R, zeitzone=ZONE)
    assert o.methode == "keine" and o.thermostat_nachweis == "geaendert" and "thermostat_geaendert" in o.gruende


def test_ersatz_plateaus_band_50_prozent():
    """Altdaten ohne Alters-/Staffelnachweis → Ersatz, H_ohne-Band mindestens ±50 %, höchstens C."""
    ms = lauf_minuten("L1", SA, 48, innen=lambda i: 30.0 if (i // 20) % 2 == 0 else 30.1, temp_alter_s=None,
                      staffel_begrenzt_s=None, altersnachweis_alt=True)
    laeufe = [lauf("L1", SA, 2)]
    o = schaetze_ohne(KTX, plateaus(ms, laeufe, R), laeufe, None, R, zeitzone=ZONE)
    assert o.h is not None and o.h.evidenz.stufe_hoechstens == "C"
    assert o.h.h_unten_kw_k == pytest.approx(o.h.h_kw_k * 0.5)


def test_leer_und_metadaten():
    o = schaetze_ohne(KTX, [], [], None, R, zeitzone=ZONE)
    assert o.methode == "keine" and o.bereich_id == "c1" and "keine_plateaus" in o.gruende
    l = Lauf("L9", "c1", SA, SA + timedelta(days=2), status="abgebrochen", ende=SA + timedelta(days=1),
             thermostat_unveraendert="angenommen")
    m = baseline_metadaten(l, ZONE)
    assert (m.zeit.von, m.zeit.bis) == (utc(SA), utc(SA + timedelta(days=1))) and m.thermostat_unveraendert == "angenommen"


def test_offener_block_am_ende_der_eingabe():
    """Endet die Eingabe, bevor ein Block ohne genug Zyklen bis 6 h verlängert werden kann, bleibt er offen."""
    assert plateaus(lauf_minuten("L1", SA, 7, strom=lambda i: 60.0), [lauf("L1", SA, 2)], R) == ()


def test_beobachtet_ab():
    ms = lauf_minuten("L1", SA, 7)
    assert plateaus(ms, [lauf("L1", SA, 2)], R, beobachtet_ab=utc(SA)) == ()   # Laufbeginn nicht nach dem Beobachtungsbeginn


def plateau(lid: str, tag: date, von_h: float, bis_h: float):
    """Gültiges Plateau (H 0,10, innen 30) von `von_h` bis `bis_h` Uhr lokal ab `tag`."""
    p = fenster(utc(tag, von_h), 0.10, x=18.0 * (bis_h - von_h), stunden=bis_h - von_h, art="baseline", innen=30.0,
                lauf_id=lid)
    return p


def test_eine_nacht_ueber_mitternacht_zaehlt_einmal():
    """20–23 Uhr und 00–03 Uhr gehören zur selben Nacht → nur eine Nacht ≥ 3 h, kein B."""
    ps = [plateau("L1", SA, 20, 23), plateau("L1", SA, 24, 27)]
    o = schaetze_ohne(KTX, ps, [lauf("L1", SA, 2)], None, R, zeitzone=ZONE)
    assert o.beobachtungstage == 1 and o.naechte_b == 1 and o.plateau_h == pytest.approx(6.0)
    assert evidenz_ohne(o, R) == "A"


def test_b_braucht_zwei_naechte_in_einem_lauf():
    zwei = [plateau("L1", SA, 21, 24), plateau("L1", SA, 45, 48)]   # Sa-Nacht und So-Nacht im selben Lauf
    o = schaetze_ohne(KTX, zwei, [lauf("L1", SA, 2)], None, R, zeitzone=ZONE)
    assert o.naechte_b == 2 and evidenz_ohne(o, R) == "B"
    getrennt = [plateau("L1", SA, 21, 24), plateau("L2", SA + timedelta(days=7), 21, 24)]   # je Lauf eine Nacht
    o = schaetze_ohne(KTX, getrennt, [lauf("L1", SA, 2), lauf("L2", SA + timedelta(days=7), 2)], None, R, zeitzone=ZONE)
    assert o.naechte_b == 1 and o.beobachtungstage == 2 and evidenz_ohne(o, R) == "A"
