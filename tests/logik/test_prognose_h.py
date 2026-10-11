"""Prognose V2, P3 (BSM-033.08): stationäre Fenster, robustes H, Tagesregression und Duty – mit den Zahlenkatalogen der
Bauvorlage (CGR-2026-10-11-hochrechnung r5, Anhang A/B), Numerik vor Rundung."""

from dataclasses import replace
from datetime import UTC, datetime, timedelta

import pytest

from logik.prognose_h import (
    gewichteter_median,
    modell_konfigurationen,
    offene_episoden,
    waehle_h,
    zaehle_fenster,
    robustes_h,
    schaetze_duty,
    schaetze_h,
    schaetze_h_pfade,
    schaetze_h_tage,
    stationaere_fenster,
    zyklen,
)
from logik.prognose_merkmale import konfiguration_id
from logik.prognose_regeln import PrognoseRegeln
from logik.prognose_stufe import evidenz_duty, evidenz_h
from logik.prognose_typen import ModellKontext

from prognose_hilfen import KID, TAG, episode, fenster, geraet, kontext, lokal, minute, qualitaet, tagm

R = PrognoseRegeln()
ZONE = "Europe/Vienna"
BIS = datetime(2027, 1, 1, tzinfo=UTC)
KTX = ModellKontext("c1", KID, BIS)


def gueltige(fs):
    return [f for f in fs if f.gueltig]


# ---------------------------------------------------------------------- Fenster (Anhang A)
def test_stationaeres_h_konvektor():
    """Konvektor, 2-h-Fenster, innen 22, außen 12, E = 2 kWh, P = 2 kW, genug Zyklen → X 20, H_w 0,10, Duty 0,50."""
    (f,) = stationaere_fenster(episode(lokal(8), 180), R)
    assert f.gueltig, f.gruende
    assert f.zeit.von == lokal(9) and f.zeit.bis == lokal(11)   # 60 min Vorlauf ab Episodenbeginn
    assert f.x_innen_kh == pytest.approx(20.0)
    assert f.energie_kwh == pytest.approx(2.0)
    assert f.energie_kwh / f.x_innen_kh == pytest.approx(0.10)
    assert f.energie_kwh / (f.p_max_kw * 2) == pytest.approx(0.50)
    assert dict(f.zyklen_je_geraet)["hk1"] >= R.zyklen_min and f.frische == "direkt" and f.staffel == "direkt"


def test_oel_vorlauf_genau_ein_fenster():
    """Öl-Episode 5 h: erste 2 h Vorlauf, dann 3 h konstant 22/12 mit 3 kWh → genau ein Fenster, H_w 0,10."""
    (f,) = stationaere_fenster(episode(lokal(6), 300, typ="oelradiator"), R)
    assert f.gueltig, f.gruende
    assert (f.zeit.von, f.zeit.bis) == (lokal(8), lokal(11))
    assert f.energie_kwh == pytest.approx(3.0) and f.energie_kwh / f.x_innen_kh == pytest.approx(0.10)


def test_restblock_verworfen_und_nicht_ueberlappend():
    fs = stationaere_fenster(episode(lokal(8), 5 * 60 + 30), R)   # 1 h Vorlauf, 2 Blöcke, 30 min Rest
    assert [(f.zeit.von, f.zeit.bis) for f in fs] == [(lokal(9), lokal(11)), (lokal(11), lokal(13))]


def test_instationaer_abgelehnt():
    """Innen steigt mit 0,3 K/h → abgelehnt, obwohl Energie/GDH passen."""
    (f,) = stationaere_fenster(episode(lokal(8), 180, innen=lambda i: 21.7 + 0.3 * (i - 60) / 60), R)
    assert not f.gueltig and "innen_trend" in f.gruende


def test_zu_wenige_zyklen():
    """Nur ein vollständiger Zyklus (30 min aus, 60 min an, 30 min aus) → abgelehnt; keine Verlängerung."""
    strom = lambda i: 60.0 if 90 <= i < 150 else 0.0   # noqa: E731
    fs = stationaere_fenster(episode(lokal(8), 180, strom=strom), R)
    assert len(fs) == 1 and not fs[0].gueltig and "zyklen_zu_wenig" in fs[0].gruende
    assert dict(fs[0].zyklen_je_geraet)["hk1"] == 1


def test_saettigung():
    """P = 2, Fensterleistung 1,95 kW → Duty 0,975 → kein H-Fenster."""
    (f,) = stationaere_fenster(episode(lokal(8), 180, strom=lambda i: 60.0 * 0.975), R)
    assert f.energie_kwh / (f.p_max_kw * 2) == pytest.approx(0.975)
    assert not f.gueltig and "duty_zu_gross" in f.gruende


def test_zyklen_brauchen_gemessenen_strom():
    ms = [minute(lokal(8, ), geraete=[geraet(lokal(8), an=60, strom_belegt=False)])]
    assert zyklen(ms, "hk1") is None
    ms = [minute(lokal(8) + timedelta(minutes=i), geraete=[geraet(lokal(8) + timedelta(minutes=i), an=a)])
          for i, a in enumerate([0, 60, 0, 60, 60, 0, 60])]
    assert zyklen(ms, "hk1") == 2   # die letzte Ein-Phase ist nicht abgeschlossen


def test_anker_unbekannt_keine_fenster():
    """Beginnt die Eingabe mitten in einer Episode, liegt das Raster nicht fest → keine Fenster."""
    assert stationaere_fenster(episode(lokal(8), 300, vorher=False), R) == ()


def test_sollsprung_beginnt_vorlauf_neu():
    ms = episode(lokal(8), 120) + episode(lokal(10), 180, vorher=False, soll_c=23.5)
    fs = stationaere_fenster(ms, R)
    assert [(f.zeit.von, f.zeit.bis) for f in fs] == [(lokal(11), lokal(13))]   # Anker 10:00, nicht 08:00


def test_tueroeffnung_ueber_60_s_beginnt_neu_kurze_nicht():
    kurz = episode(lokal(8), 180)
    kurz[100] = replace(kurz[100], tuer_offen_s=50.0)
    (f,) = stationaere_fenster(kurz, R)
    assert f.gueltig and (f.zeit.von, f.zeit.bis) == (lokal(9), lokal(11))
    lang = episode(lokal(8), 240)
    lang[31] = replace(lang[31], tuer_offen_s=40.0)
    lang[32] = replace(lang[32], tuer_offen_s=40.0)   # 80 s am Stück
    assert [(f.zeit.von, f.zeit.bis) for f in stationaere_fenster(lang, R)] == [(lokal(9, ) + timedelta(minutes=32),
                                                                                  lokal(11) + timedelta(minutes=32))]


def test_grundwechsel_unterbricht_nicht():
    """Vorheizen → Arbeitszeit mit Wechselminute: keine neue Episode, Fenster gültig mit Hinweis."""
    ms = episode(lokal(8), 180)
    ms = [replace(m, grund="vorheizen") if m.zeit.von < lokal(8, ) + timedelta(minutes=30) and m.grund == "arbeitszeit" else m
          for m in ms]
    i = next(i for i, m in enumerate(ms) if m.zeit.von == lokal(8) + timedelta(minutes=30))
    ms[i] = replace(ms[i], kontext=kontext(wechsel_im_intervall=True))
    (f,) = stationaere_fenster(ms, R)
    assert f.gueltig and "grundwechsel" in f.gruende and f.zeit.von == lokal(9)


def test_konfigurationswechsel_beginnt_neu():
    andere = konfiguration_id("thermo", [("hk1", "konvektor"), ("hk2", "konvektor")])
    ms = episode(lokal(8), 120) + episode(lokal(10), 180, vorher=False, k=kontext(konfiguration_id=andere))
    (f,) = stationaere_fenster(ms, R)
    assert f.konfiguration_id == andere and f.zeit.von == lokal(11)


def test_fenster_ueber_mitternacht_zaehlt_zum_datum_der_mitte():
    ms = episode(lokal(22), 4 * 60)   # Vorlauf 22–23, Block 23–01 → Mitte 00:00 des Folgetags
    (f,) = stationaere_fenster(ms, R)
    r = robustes_h([f], ZONE, R)
    assert r.tage[0][0] == TAG + timedelta(days=1)


def test_ersatzfenster_aus_altdaten():
    """Historische Minuten ohne Alters-/Staffelnachweis, variabler Innenwert → Ersatzfenster (höchstens C)."""
    ms = episode(lokal(8), 180, innen=lambda i: 22.0 if (i // 20) % 2 == 0 else 22.1, temp_alter_s=None,
                 staffel_begrenzt_s=None, altersnachweis_alt=True)
    (f,) = stationaere_fenster(ms, R)
    assert f.gueltig, f.gruende
    assert f.frische == "ersatz" and f.staffel == "ersatz"


# ---------------------------------------------------------------------- robustes H (Anhang A/B)
def drei_tage(werte, n=4, **kw):
    return [fenster(lokal(8 + 2 * j, TAG + timedelta(days=d)), h, **kw) for d, h in enumerate(werte) for j in range(n)]


def test_gewichtung_und_mad():
    """Tages-H 0,08/0,10/0,12 → H 0,10, MAD 0,02, s_H 0,029652, relativ 0,29652, u_C 0,059304, Band [0,040696; 0,159304]."""
    h = schaetze_h(KTX, drei_tage([0.08, 0.10, 0.12]), R, zeitzone=ZONE)
    assert h.methode == "stationaer"
    assert h.h_kw_k == pytest.approx(0.10)
    assert h.evidenz.mad_kw_k == pytest.approx(0.02)
    assert h.evidenz.streuung_rel == pytest.approx(0.29652)
    assert h.h_kw_k - h.h_unten_kw_k == pytest.approx(0.059304)
    assert (h.h_unten_kw_k, h.h_oben_kw_k) == (pytest.approx(0.040696), pytest.approx(0.159304))
    assert (h.evidenz.fenster, h.evidenz.tage, h.evidenz.stunden) == (12, 3, pytest.approx(24.0))
    assert evidenz_h(h, None, R) == "C" and "direkt" in h.evidenz.gruende


def test_gewichteter_median():
    assert gewichteter_median([(0.08, 10), (0.12, 30)]) == pytest.approx(0.12)
    assert gewichteter_median([(0.08, 20), (0.12, 20)]) == pytest.approx(0.10)
    assert gewichteter_median([(0.12, 1), (0.08, 1), (0.10, 1)]) == pytest.approx(0.10)


def test_tages_h_gewichtet_mit_x():
    fs = [fenster(lokal(8), 0.08, x=10.0), fenster(lokal(10), 0.12, x=30.0)]
    assert robustes_h(fs, ZONE, R).tage[0][1] == pytest.approx(0.12)


def test_ausreisser_einmal_ab_fuenf_tagen():
    fs = drei_tage([0.10, 0.10, 0.10, 0.10, 0.20], n=3)
    h = schaetze_h(KTX, fs, R, zeitzone=ZONE)
    assert h.h_kw_k == pytest.approx(0.10) and h.evidenz.tage == 4 and h.evidenz.fenster == 12
    assert h.evidenz.verworfen == 3 and "ausreisser_entfernt" in h.evidenz.gruende
    vier = robustes_h(drei_tage([0.10, 0.10, 0.10, 0.20], n=3), ZONE, R)
    assert vier.entfernt == 0 and len(vier.tage) == 4   # unter fünf Tagen kein Ausreißerdurchlauf


def test_ersatzband_hoechstens_c():
    """Ersatz: H 0,10, MAD 0 → höchstens C, Band mindestens [0,05; 0,15]; Ersatzpfad, wenn direkt nicht reicht."""
    fs = drei_tage([0.10, 0.10, 0.10], q=qualitaet(frische="ersatz"))
    h = schaetze_h(KTX, fs, R, zeitzone=ZONE)
    assert (h.h_unten_kw_k, h.h_oben_kw_k) == (pytest.approx(0.05), pytest.approx(0.15))
    assert h.evidenz.stufe_hoechstens == "C" and h.evidenz.ersatzfenster == 12 and "ersatzpfad" in h.evidenz.gruende
    assert evidenz_h(h, None, R) == "C"


def test_rekonstruierter_kontext_wie_ersatz():
    fs = drei_tage([0.10, 0.10, 0.10], q=qualitaet(gruende=("kontext_rekonstruiert",)))
    h = schaetze_h(KTX, fs, R, zeitzone=ZONE)
    assert h.evidenz.stufe_hoechstens == "C" and h.h_unten_kw_k == pytest.approx(0.05)


def test_direkt_und_ersatz_getrennt_direkt_hat_vorrang():
    direkt = drei_tage([0.10, 0.10, 0.10])
    ersatz = [replace(f, zeit=replace(f.zeit, von=f.zeit.von + timedelta(hours=8), bis=f.zeit.bis + timedelta(hours=8)),
                      energie_kwh=0.2 * f.x_innen_kh, qualitaet=qualitaet(frische="ersatz"), frische="ersatz")
              for f in direkt]
    d, e = schaetze_h_pfade(KTX, direkt + ersatz, R, zeitzone=ZONE)
    assert d.h_kw_k == pytest.approx(0.10) and e.h_kw_k == pytest.approx(0.20)   # nicht gemischt
    h = schaetze_h(KTX, direkt + ersatz, R, zeitzone=ZONE)
    assert h.h_kw_k == pytest.approx(0.10) and h.evidenz.stufe_hoechstens == "D"
    wenig = schaetze_h(KTX, direkt[:4] + ersatz, R, zeitzone=ZONE)   # direkt nur 1 Tag → Ersatz mit C-Evidenz
    assert wenig.h_kw_k == pytest.approx(0.20) and "ersatzpfad" in wenig.evidenz.gruende


def test_zu_wenig_evidenz_keine_identifikation():
    h = schaetze_h(KTX, drei_tage([0.10, 0.10]), R, zeitzone=ZONE)
    assert h.methode == "keine" and h.h_kw_k is None and "evidenz_zu_gering" in h.evidenz.gruende
    assert h.evidenz.fenster == 8 and evidenz_h(h, None, R) == "A"
    leer = schaetze_h(KTX, [], R, zeitzone=ZONE)
    assert leer.methode == "keine" and leer.bereich_id == "c1" and leer.konfiguration_id == KID


def test_verworfene_und_fremde_fenster_zaehlen_nicht():
    fs = drei_tage([0.10, 0.10, 0.10])
    fremd = [replace(f, konfiguration_id="kandere") for f in fs] + [replace(f, bereich_id="c2") for f in fs]
    spaet = [replace(f, zeit=replace(f.zeit, von=BIS, bis=BIS + timedelta(hours=2))) for f in fs[:1]]
    verworfen = [replace(f, gueltig=False) for f in fs[:2]]
    h = schaetze_h(KTX, fs + fremd + spaet + verworfen, R, zeitzone=ZONE)
    assert h.evidenz.fenster == 12 and h.evidenz.verworfen == 2


def test_keine_negativen_h_und_untere_grenze_null():
    h = schaetze_h_pfade(KTX, drei_tage([0.01, 0.10, 0.30]), R, zeitzone=ZONE)[0]   # Kandidat, Streuung zu groß für C
    assert h.h_unten_kw_k == 0.0 and h.h_oben_kw_k > h.h_kw_k > 0
    for werte in ([0.0, 0.0, 0.0], [0.05, 0.0, 0.0]):
        r = schaetze_h_pfade(KTX, drei_tage(werte), R, zeitzone=ZONE)[0]
        assert r.h_kw_k is None or r.h_kw_k > 0


def test_ganzer_weg_aus_minuten():
    """Drei Tage mit je zwei Episoden → Fenster → H 0,10 aus Minuten."""
    ms = []
    for d in range(3):
        tag = TAG + timedelta(days=d)
        ms += episode(lokal(6, tag), 5 * 60) + episode(lokal(12, tag), 5 * 60)
    fs = stationaere_fenster(ms, R)
    assert len(gueltige(fs)) == 12
    h = schaetze_h(KTX, fs, R, zeitzone=ZONE)
    assert h.h_kw_k == pytest.approx(0.10) and h.evidenz.stunden == pytest.approx(24.0) and evidenz_h(h, None, R) == "C"


# ---------------------------------------------------------------------- Tagesregression und Duty
def test_tagesregression():
    """GDH [80, 100, 120], E [8, 10, 12] → H_tag 0,10, B-Band [0,05; 0,15]."""
    tage = [tagm(TAG + timedelta(days=i), gdh=g, e=e) for i, (g, e) in enumerate(((80, 8), (100, 10), (120, 12)))]
    h = schaetze_h_tage(KTX, tage, R)
    assert h.methode == "tagesregression" and h.h_kw_k == pytest.approx(0.10)
    assert (h.h_unten_kw_k, h.h_oben_kw_k) == (pytest.approx(0.05), pytest.approx(0.15))
    assert evidenz_h(h, None, R) == "B"


def test_tagesregression_nullnenner_und_nullenergie():
    zwei = [tagm(TAG + timedelta(days=i), gdh=100, e=10) for i in range(2)]
    assert schaetze_h_tage(KTX, zwei, R).h_kw_k is None
    null = [tagm(TAG + timedelta(days=i), gdh=100, e=0) for i in range(3)]
    h = schaetze_h_tage(KTX, null, R)
    assert h.h_kw_k is None and "nur_nullenergie" in h.evidenz.gruende
    ohne_gdh = [tagm(TAG + timedelta(days=i), gdh=0, e=5) for i in range(3)]
    assert schaetze_h_tage(KTX, ohne_gdh, R).h_kw_k is None
    ungeeignet = [tagm(TAG + timedelta(days=i), gdh=100, e=10, thermo=False) for i in range(3)]
    assert schaetze_h_tage(KTX, ungeeignet, R).methode == "keine"


def test_duty_kein_raumfuehler():
    """P = 2, drei saubere Plan-Tage, 30 h Freigabe und 30 kWh → d 0,50, höchstens B."""
    tage = [tagm(TAG + timedelta(days=i), e=10.0, plan_h=10.0, kapazitaet=20.0, thermo=False, plan=True) for i in range(3)]
    d = schaetze_duty(KTX, tage, R)
    assert d.duty == pytest.approx(0.50) and d.tage == 3
    assert (d.kapazitaet_training_kwh, d.energie_training_kwh) == (pytest.approx(60.0), pytest.approx(30.0))
    assert evidenz_duty(d, R) == "B"


def test_duty_nullnenner_und_zu_wenige_tage():
    null = [tagm(TAG + timedelta(days=i), e=0.0, kapazitaet=0.0, thermo=False, plan=True) for i in range(3)]
    assert schaetze_duty(KTX, null, R).duty is None
    zwei = [tagm(TAG + timedelta(days=i), e=10.0, kapazitaet=20.0, thermo=False, plan=True) for i in range(2)]
    d = schaetze_duty(KTX, zwei, R)
    assert d.duty is None and evidenz_duty(d, R) == "A"


# ---------------------------------------------------------------------- Abschnitte und Evidenzbericht
def test_anker_aus_frueherem_abschnitt_gleiches_raster():
    """Eine Episode läuft über die Abschnittsgrenze: mit dem Anker aus dem früheren Abschnitt liegen die Blöcke wie bei
    einem Durchgang; ohne Anker entstehen keine Fenster."""
    ganz = episode(lokal(6), 12 * 60)
    voll = stationaere_fenster(ganz, R)
    erster, zweiter = ganz[: 5 * 60], ganz[5 * 60:]          # zweiter Abschnitt beginnt mitten in der Episode
    anker = offene_episoden(erster, R)
    assert anker == {"c1": lokal(6)}
    assert stationaere_fenster(zweiter, R) == ()
    teil = stationaere_fenster(zweiter, R, anker=anker)
    assert [f.zeit for f in teil] == [f.zeit for f in voll if f.zeit.von - timedelta(hours=1) >= zweiter[0].zeit.von]
    assert offene_episoden(zweiter, R, anker=anker) == {"c1": lokal(6)}


def test_beobachtet_ab_macht_anker_unbekannt():
    ms = episode(lokal(8), 180)
    assert stationaere_fenster(ms, R, beobachtet_ab=lokal(8)) == ()
    assert len(stationaere_fenster(ms, R, beobachtet_ab=lokal(7))) == 1


def test_zaehlung_und_konfigurationen():
    fs = drei_tage([0.10]) + [fenster(lokal(20), 0.1, q=qualitaet(frische="ersatz"))]
    fs.append(replace(fs[0], gueltig=False, gruende=("innen_trend", "aussen_frische_unbelegt")))
    fs.append(replace(fs[0], gueltig=False, gruende=("qualitaet",), qualitaet=qualitaet(gruende=("luecke",))))
    z = zaehle_fenster(fs)
    assert (z.direkt, z.ersatz, z.verworfen, z.stunden) == (4, 1, 2, pytest.approx(10.0))
    assert dict(z.gruende) == {"innen_trend": 1, "qualitaet": 1, "qualitaet:luecke": 1}   # Hinweise zählen nicht
    tage = [tagm(TAG, kid="kplan", thermo=False, plan=True), tagm(TAG, kid="kweg", thermo=False)]
    assert modell_konfigurationen(fs, tage, "kneu") == ["kneu", KID, "kplan"]


def test_waehle_h_wie_schaetze_h():
    fs = drei_tage([0.08, 0.10, 0.12])
    assert waehle_h(*schaetze_h_pfade(KTX, fs, R, zeitzone=ZONE), R) == schaetze_h(KTX, fs, R, zeitzone=ZONE)
