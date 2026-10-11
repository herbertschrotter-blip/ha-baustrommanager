"""Prognose V2, P4a (BSM-033.09): Wetter je Intervall und Plan je Szenario (Bauvorlage CGR-2026-10-11-hochrechnung r5
§8.1, Anhang A „Gleitendes Soll“, Regression 3) und die herausgezogene Heizgrenzen-Regel (Gleichheit mit dem alten Weg)."""

from __future__ import annotations

from dataclasses import replace
from datetime import UTC, date, datetime, time, timedelta
from zoneinfo import ZoneInfo

import pytest

from logik.arbeitszeit import Arbeitszeit, Ausnahme, HeizRegeln, WetterTag
from logik.prognose_regeln import PrognoseRegeln
from logik.prognose_typen import Intervall, Leistungsreferenz, PlanTag, WetterEingabe, WetterIntervall
from logik.prognose_wetter import frost_relevant, planen, tagesmittel, wetterreihe
from logik.regelung import heizgrenze_bezug, zu_warm
from logik.soll import GleitRegeln

R = PrognoseRegeln()
ZONE = "Europe/Vienna"
WIEN = ZoneInfo(ZONE)
TAG = date(2026, 11, 10)   # Dienstag
KLIMA = (0.0, 2.0, 6.0, 10.0, 15.0, 18.0, 20.0, 19.0, 15.0, 10.0, 5.0, 1.0)
P_REF = Leistungsreferenz(2.0, "geraet_einstellung", datetime(2026, 10, 1, tzinfo=UTC), "einstellung:1")
AZ = Arbeitszeit(date(2026, 1, 1), "AZ", {i: (420, 990) for i in range(4)} | {4: (420, 750), 5: None, 6: None})


def lokal(stunde: float, tag: date = TAG) -> datetime:
    return (datetime.combine(tag, time(), WIEN) + timedelta(hours=stunde)).astimezone(UTC)


def tag_iv(tag: date = TAG) -> Intervall:
    return Intervall(lokal(0, tag), lokal(0, tag + timedelta(days=1)))


def eingabe(**kw) -> WetterEingabe:
    werte = {"stunden": (), "tagesmittel": (), "klima_monate": KLIMA, "bekannte_vortage": ()}
    werte.update(kw)
    return WetterEingabe(**werte)


def plantag(**kw) -> PlanTag:
    werte = dict(
        datum=TAG, bereich_id="c1", konfiguration_id="k", plan=None, arbeitszeiten=(AZ,), ausnahmen=(), frei=False,
        heizregeln=HeizRegeln(fruehstart=False), warm_ab=None, trocknen=False, plan_wetter=WetterTag(),
        plan_wetterquelle="klima", heizgrenze_c=15.0, heizgrenze_basis="tageshoechst", auto=True, bedarfscontainer=False,
        regelungsart="thermo", gleitregeln=None, rueckmeldungen=(), absenk_soll_c=10.0, frost_grenze_c=5.0,
        frost_aus_c=7.0, frost_aussen_c=None, frost_erlaubt=True, frei_modus="frost", feste_bedarfsfenster=(),
        p_ref=(P_REF,), fruehstart_unsicher=False, kontext_belegt=True, soll_fest_c=22.0)
    werte.update(kw)
    return PlanTag(**werte)


def konstant(aussen: float, tag: date = TAG) -> tuple[WetterIntervall, ...]:
    return wetterreihe(eingabe(tagesmittel=((tag, aussen),)), tag_iv(tag), ZONE, 0.0, replace(R, tagesgang_amplitude_k=0.0))


# ---------------------------------------------------------------------- Wetter
def test_quellenhierarchie_und_klimadelta():
    """Stunde vor gemessenem Tagesmittel vor Tagesvorhersage vor Klima; Delta nur auf Klimaanteile."""
    morgen, uebermorgen, gestern = TAG + timedelta(days=1), TAG + timedelta(days=2), TAG - timedelta(days=1)
    stunde = WetterIntervall(Intervall(lokal(10), lokal(11)), 4.0, "vorhersage_stunde", False)
    e = eingabe(stunden=(stunde,), tagesmittel=((TAG, 8.0), (morgen, 9.0), (gestern, 1.0)), bekannte_vortage=((gestern, 2.0),))
    zr = Intervall(lokal(0, gestern), lokal(0, uebermorgen + timedelta(days=1)))
    w = wetterreihe(e, zr, ZONE, -1.5, R)
    quelle = {x.zeit.von: x.quelle for x in w}
    assert quelle[lokal(10)] == "vorhersage_stunde" and quelle[lokal(9)] == "vorhersage_tag"
    assert quelle[lokal(3, gestern)] == "gemessen_tag" and quelle[lokal(3, uebermorgen)] == "klima"
    mittel = tagesmittel(w, ZONE)
    assert mittel[gestern] == pytest.approx(2.0)            # gemessen, kein Delta
    assert mittel[morgen] == pytest.approx(9.0)             # Vorhersage, kein Delta
    w0 = wetterreihe(e, zr, ZONE, 0.0, R)
    assert tagesmittel(w0, ZONE)[uebermorgen] - mittel[uebermorgen] == pytest.approx(1.5)
    assert all(x.synthetischer_tagesgang == (x.quelle != "vorhersage_stunde") for x in w)


@pytest.mark.parametrize(("tag", "stunden"), [(date(2026, 10, 25), 25), (date(2027, 3, 28), 23), (TAG, 24)])
def test_tagesgang_auf_echte_dauer_zentriert(tag, stunden):
    """Tagesgang 23/24/25 h: das Tagesmittel bleibt exakt, tiefster Wert um 05 Uhr, Amplitude 3 K."""
    w = wetterreihe(eingabe(tagesmittel=((tag, 5.0),)), tag_iv(tag), ZONE, 0.0, R)
    assert len(w) == stunden
    assert sum(x.aussen_c for x in w) / len(w) == pytest.approx(5.0)
    tief = min(w, key=lambda x: x.aussen_c)
    assert tief.zeit.von.astimezone(WIEN).hour == 5
    if stunden == 24:
        assert max(x.aussen_c for x in w) - tief.aussen_c == pytest.approx(6.0)


def test_rand_geschnitten():
    w = wetterreihe(eingabe(), Intervall(lokal(12.5), lokal(14.25)), ZONE, 0.0, R)
    assert [(x.zeit.von, x.zeit.bis) for x in w] == [(lokal(12.5), lokal(13)), (lokal(13), lokal(14)), (lokal(14), lokal(14.25))]


# ---------------------------------------------------------------------- Soll und Heizgrenze
def test_gleitendes_soll():
    """Vortage 0/10/20 °C (neuester zuerst), Vorgaberegeln, keine Rückmeldung → Mittel 8,524590, Soll 21,35 °C."""
    vortage = {TAG - timedelta(days=1): 0.0, TAG - timedelta(days=2): 10.0, TAG - timedelta(days=3): 20.0}
    plan = planen([plantag(gleitregeln=GleitRegeln(), soll_fest_c=None)], konstant(5.0), vortage, ZONE, R)
    ziele = {p.ziel_c for p in plan if p.regulaer_freigegeben}
    assert ziele == {21.35}


def test_szenario_veraendert_soll_und_heizgrenze():
    """Regression 3: Szenariowetter verändert das gleitende Soll (Vortage aus der Reihe) und die Heizgrenze."""
    tage = [TAG + timedelta(days=i) for i in range(4)]
    tage_pt = [plantag(datum=t, gleitregeln=GleitRegeln(), soll_fest_c=None) for t in tage]
    zr = Intervall(lokal(0, tage[0]), lokal(0, tage[-1] + timedelta(days=1)))
    soll = {}
    for delta in (-1.5, 0.0, 1.5):
        w = wetterreihe(eingabe(), zr, ZONE, delta, R)
        p = planen(tage_pt, w, {}, ZONE, R)
        soll[delta] = max(x.ziel_c for x in p if x.regulaer_freigegeben and x.zeit.von >= lokal(0, tage[-1]))
    assert soll[-1.5] > soll[0.0] > soll[1.5]
    # Heizgrenze: bei 13 °C Tagesmittel und Grenze 15 heizt es, mit +3 K Tagesgang (Höchstwert 16) nicht mehr
    warm = wetterreihe(eingabe(tagesmittel=((TAG, 13.0),)), tag_iv(), ZONE, 0.0, R)
    p = planen([plantag()], warm, {}, ZONE, R)
    assert not any(x.regulaer_freigegeben for x in p) and {x.grund for x in p} >= {"heizgrenze"}
    p = planen([plantag(heizgrenze_basis="jetzt")], warm, {}, ZONE, R)   # Basis jetzt: je Intervall
    assert any(x.regulaer_freigegeben for x in p) and any(x.grund == "heizgrenze" for x in p)


@pytest.mark.parametrize("basis", ["tageshoechst", "jetzt"])
@pytest.mark.parametrize(("hoechst", "aktuell"), [(None, None), (16.0, 10.0), (10.0, 16.0), (15.0, 15.0), (None, 20.0),
                                                   (20.0, None)])
def test_heizgrenze_gleich_wie_vorher(basis, hoechst, aktuell):
    """Die nach logik/regelung gezogene Regel liefert genau den alten Vergleich aus funktionen/heizung/plan.zu_warm."""
    alt_wert = hoechst if basis == "tageshoechst" else aktuell
    alt = alt_wert is not None and alt_wert > 15.0
    assert zu_warm(basis, hoechst, aktuell, 15.0) is alt
    assert heizgrenze_bezug(basis, hoechst, aktuell) == alt_wert


# ---------------------------------------------------------------------- Plan
def test_plan_minutengenau_mit_prioritaeten():
    """Arbeitszeit 07:00–16:30, Vorheizen 45, Nachheizen 15 → regulär 06:15–16:45 (10,5 h), sonst Frostbereitschaft."""
    p = planen([plantag()], konstant(5.0), {}, ZONE, R)
    regulaer = [x for x in p if x.regulaer_freigegeben]
    assert regulaer[0].zeit.von == lokal(6.25) and regulaer[-1].zeit.bis == lokal(16.75)
    assert sum((x.zeit.bis - x.zeit.von).total_seconds() for x in regulaer) == pytest.approx(10.5 * 3600)
    assert {x.grund for x in regulaer} == {"vorheizen", "arbeitszeit", "nachheizen"}
    assert len({x.episode_id for x in regulaer}) == 1 and "start_unbekannt" in regulaer[0].gruende
    assert all(x.frost_bereit and not x.regulaer_freigegeben for x in p if x not in regulaer)
    assert all(x.p_max_kw == 2.0 and x.ziel_c is None for x in p if x not in regulaer)
    assert sum((x.zeit.bis - x.zeit.von).total_seconds() for x in p) == pytest.approx(24 * 3600)


def test_frei_bedarf_und_frostpolitik():
    """Freier Tag: nur Frostbereitschaft; frei_modus aus → keine; Bedarf geht vor frei und Heizgrenze."""
    frei = planen([plantag(frei=True)], konstant(5.0), {}, ZONE, R)
    assert not any(x.regulaer_freigegeben for x in frei) and all(x.frost_bereit for x in frei)
    aus = planen([plantag(frei=True, frei_modus="aus")], konstant(5.0), {}, ZONE, R)
    assert not any(x.frost_bereit for x in aus)
    absenk = planen([plantag(frei=True, frei_modus="absenk")], konstant(5.0), {}, ZONE, R)
    assert all(x.regulaer_freigegeben and x.ziel_c == 10.0 and x.grund == "absenken" for x in absenk)
    termin = Intervall(lokal(9), lokal(11.5))
    bedarf = planen([plantag(bedarfscontainer=True, frei=True, feste_bedarfsfenster=(termin,))], konstant(20.0), {}, ZONE, R)
    reg = [x for x in bedarf if x.regulaer_freigegeben]
    assert reg and reg[0].zeit.von == lokal(9) and reg[-1].zeit.bis == lokal(11.5) and {x.grund for x in reg} == {"bedarf"}
    ausnahme = planen([plantag(ausnahmen=(Ausnahme(TAG, "frei"),))], konstant(5.0), {}, ZONE, R)
    assert not any(x.regulaer_freigegeben for x in ausnahme)


def test_planmodus_nie_thermo_soll_und_ohne_fuehler():
    plan = planen([plantag(regelungsart="plan", modus="plan")], konstant(5.0), {}, ZONE, R)
    assert any(x.regulaer_freigegeben for x in plan) and all(x.ziel_c is None for x in plan)
    ohne = planen([plantag(regelungsart="plan", modus="thermo", fuehler=False, frost_aussen_c=3.0)], konstant(4.0), {},
                  ZONE, R)
    nacht = [x for x in ohne if not x.regulaer_freigegeben]
    assert all(x.frost_bereit and not x.fuehler for x in nacht) and all(frost_relevant(x) for x in nacht)
    keiner = planen([plantag(regelungsart="plan", modus="thermo", fuehler=False)], konstant(4.0), {}, ZONE, R)
    assert not any(x.frost_bereit for x in keiner)   # ohne Fühler und ohne Außengrenze keine Bereitschaft


def test_fruehstart_aus_szenario_und_fehlendes_p_ref():
    """Ohne Vorhersage des Morgens kommt der Frühstart aus dem Szenariowetter (markiert); fehlendes P_ref → None."""
    p = planen([plantag(heizregeln=HeizRegeln(), p_ref=(P_REF, None))], konstant(-3.0), {}, ZONE, R)
    reg = [x for x in p if x.regulaer_freigegeben]
    assert reg[0].zeit.von == lokal(5.75) and reg[0].grund == "fruehstart"
    assert "fruehstart_aus_szenario" in reg[0].gruende and all(x.p_max_kw is None for x in p)
    assert "p_ref_fehlt" in reg[0].gruende


def test_hand_wird_nicht_erfunden():
    """Container auf Hand: keine reguläre Freigabe (die Automatik schaltet nicht), Grund hand."""
    p = planen([plantag(auto=False, regelungsart="aus", modus="hand")], konstant(5.0), {}, ZONE, R)
    assert not any(x.regulaer_freigegeben for x in p) and {x.grund for x in p} == {"hand"}


def test_episoden_ueber_tage_und_start_vorher():
    """Neuer Start nach ≥ 30 min ohne Freigabe; ein Block, der am Beginn der Reihe schon läuft, ist start_vorher."""
    tage = [TAG, TAG + timedelta(days=1)]
    w = wetterreihe(eingabe(tagesmittel=tuple((t, 5.0) for t in tage)), Intervall(lokal(8), lokal(0, tage[1] + timedelta(days=1))),
                    ZONE, 0.0, R)
    p = planen([plantag(datum=t) for t in tage], w, {}, ZONE, R)
    reg = [x for x in p if x.regulaer_freigegeben]
    episoden = list(dict.fromkeys(x.episode_id for x in reg))
    assert len(episoden) == 2
    assert "start_vorher" in reg[0].gruende
    zweiter = next(x for x in reg if x.episode_id == episoden[1])
    assert "start_unbekannt" in zweiter.gruende and zweiter.startdefizit_k is None


def test_bekannter_tageshoechstwert_vor_synthetischem():
    """K6: wie die Regelung – ein bekannter Höchstwert (Vorhersage/gemessen) entscheidet die Heizgrenze, die Reihe nur
    als Rückfall."""
    w = konstant(10.0)   # synthetisch: höchstens 10 °C → heizt
    assert any(x.regulaer_freigegeben for x in planen([plantag()], w, {}, ZONE, R))
    p = planen([plantag(tageshoechst_c=16.0)], w, {}, ZONE, R)   # Vorhersage 16 °C > Grenze 15
    assert not any(x.regulaer_freigegeben for x in p) and {x.grund for x in p} >= {"heizgrenze"}
