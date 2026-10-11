"""Prognose V2, P1 (BSM-033.06): Klassifikation je Minute, Regelungsart, Konfigurations-ID, Nachweiszeiten, Regeln."""

from dataclasses import FrozenInstanceError, fields

import pytest

from logik.prognose_merkmale import GRUND_ART, klassifiziere_minute, konfiguration_id, nachweis_s, regelungsart
from logik.prognose_regeln import PrognoseRegeln
from logik.prognose_typen import MODELL_VERSION, Klassifikation
from logik.regelung import SollGrund

# Bauvorlage r5 §6.1 – bewusst ausgeschrieben, nicht aus dem Code abgeleitet
ERWARTET = {
    "arbeitszeit": "REGULAER", "vorheizen": "REGULAER", "fruehstart": "REGULAER", "nachheizen": "REGULAER",
    "trocknen": "REGULAER", "bedarf": "REGULAER", "absenken": "REGULAER", "heizgrenze": "REGULAER",
    "frost": "FROST", "bereit": "FROST", "frei": "FROST", "ausserhalb": "FROST",
    "baseline": "BASELINE",
    "boost": "SONSTIGE", "taste": "SONSTIGE", "hand": "SONSTIGE", "tuer_offen": "SONSTIGE", "aus": "SONSTIGE",
    "automatik_aus": "SONSTIGE",
}


def test_jeder_grund_der_regelung_ist_abgebildet():
    assert {str(g) for g in SollGrund} == set(ERWARTET) == set(GRUND_ART)


@pytest.mark.parametrize("grund", [str(g) for g in SollGrund])
def test_klassifikation_jedes_grunds(grund):
    k = klassifiziere_minute(grund, "heizt", "ha", True)
    assert k.art == ERWARTET[grund]
    assert k.betrieb_gueltig is True


def test_heizgrenze_regulaer_ohne_freigabe_und_baseline_mit_lauf():
    assert klassifiziere_minute("heizgrenze", "aus", "ha", True).gruende == ("regulaer_gesperrt",)
    assert klassifiziere_minute("baseline", "heizt", "ha", True).gruende == ("lauf_bestaetigen",)


@pytest.mark.parametrize("zustand", ["aus", "heizt", "bereit", None])
def test_zustand_ueberschreibt_gueltigen_grund_nicht(zustand):
    """TPI-aus (arbeitszeit/aus) bleibt reguläre Regelungszeit."""
    assert klassifiziere_minute("arbeitszeit", zustand, "ha", True) == Klassifikation("REGULAER", True, ())


@pytest.mark.parametrize(("grund", "zustand", "quelle", "zeile", "grund_code"), [
    ("arbeitszeit", "heizt", "ha", False, "zeile_fehlt"),
    (None, "heizt", "ha", True, "grund_fehlt"),
    ("", "heizt", "ha", True, "grund_fehlt"),
    ("laeuft", "heizt", "ha", True, "grund_unbekannt"),
    ("arbeitszeit", "heizt", "notprogramm", True, "notprogramm"),
    ("arbeitszeit", "offline", "ha", True, "offline"),
])
def test_ungueltig_sonstige(grund, zustand, quelle, zeile, grund_code):
    assert klassifiziere_minute(grund, zustand, quelle, zeile) == Klassifikation("SONSTIGE", False, (grund_code,))


def test_prioritaeten():
    # fehlend vor notprogramm vor offline
    assert klassifiziere_minute(None, "offline", "notprogramm", True).gruende == ("grund_fehlt",)
    assert klassifiziere_minute("frost", "offline", "notprogramm", True).gruende == ("notprogramm",)
    assert klassifiziere_minute("frost", "offline", "import_statistik", True).gruende == ("offline",)


def test_pause_nur_mit_tuer_offen():
    assert klassifiziere_minute("tuer_offen", "pause", "ha", True) == Klassifikation("SONSTIGE", True, ())
    k = klassifiziere_minute("arbeitszeit", "pause", "ha", True)
    assert (k.art, k.betrieb_gueltig, k.gruende) == ("REGULAER", False, ("pause_ohne_tuer",))


@pytest.mark.parametrize(("quelle", "gueltig", "gruende"), [
    ("ha", True, ()),
    ("import_verlauf", True, ("kontext_noetig",)),
    ("import_statistik", False, ("quelle_statistik",)),
    ("irgendwas", False, ("quelle_unbekannt",)),
    (None, False, ("quelle_unbekannt",)),
])
def test_quellen(quelle, gueltig, gruende):
    assert klassifiziere_minute("vorheizen", "heizt", quelle, True) == Klassifikation("REGULAER", gueltig, gruende)


@pytest.mark.parametrize(("modus", "fuehler", "art"), [
    ("thermo", True, "thermo"), ("thermo", False, "plan"), ("bedarf", True, "thermo"), ("bedarf", False, "plan"),
    ("plan", True, "plan"), ("hand", True, "aus"), ("aus", False, "aus"), (None, True, "unbekannt"), ("x", True, "unbekannt"),
])
def test_regelungsart(modus, fuehler, art):
    assert regelungsart(modus, fuehler) == art


def test_konfiguration_id():
    a = konfiguration_id("thermo", [("hk1", "oelradiator"), ("hk2", "konvektor")])
    assert a == konfiguration_id("thermo", [("hk2", "konvektor"), ("hk1", "oelradiator")])   # Reihenfolge egal
    assert a.startswith("k") and len(a) == 11
    assert a != konfiguration_id("plan", [("hk1", "oelradiator"), ("hk2", "konvektor")])
    assert a != konfiguration_id("thermo", [("hk1", "oelradiator")])
    assert a != konfiguration_id("thermo", [("hk1", "konvektor"), ("hk2", "konvektor")])


def test_nachweis_s_weist_unmoegliches_zurueck():
    assert nachweis_s(None, 60) is None
    assert nachweis_s(0, 60) == 0 and nachweis_s(60, 60) == 60
    assert nachweis_s(-1, 60) is None and nachweis_s(61, 60) is None


def test_regeln_und_modellversion():
    r = PrognoseRegeln()
    assert MODELL_VERSION == "prognose-v2.1"
    assert len(fields(r)) == 98   # vollständig nach Bauvorlage §2.5
    assert (r.abdeckung_min, r.messalter_max_s, r.ersatz_konstanz_max_s, r.tuer_offen_max_s) == (0.95, 120, 1800, 60)
    assert (r.konvektor_fenster_min, r.oel_fenster_min, r.mad_faktor, r.ohne_wetter_extrapolation_max_k) == (120, 180, 1.4826, 2.0)
    with pytest.raises(FrozenInstanceError):
        r.abdeckung_min = 0.5   # type: ignore[misc]
