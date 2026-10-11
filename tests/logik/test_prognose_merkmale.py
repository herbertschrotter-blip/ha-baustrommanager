"""Prognose V2, P1 (BSM-033.06): Klassifikation je Minute, Regelungsart, Konfigurations-ID, Nachweiszeiten, Regeln.

P2 (BSM-033.07): Betriebskontext, Minutenqualität, Ersatznachweis, Tagesmerkmale, Starts und Abkühlepisoden – mit den
Zahlenkatalogen der Bauvorlage (CGR-2026-10-11-hochrechnung r5, Anhang A und B), Numerik vor Rundung.
"""

from dataclasses import FrozenInstanceError, fields, replace
from datetime import UTC, date, datetime, time, timedelta
from zoneinfo import ZoneInfo

import pytest

from logik.baseline import Lauf
from logik.prognose_merkmale import (
    GRUND_ART,
    abkuehlepisoden,
    bestaetigter_lauf,
    betriebskontext,
    frische_ersatz,
    frost_bereit,
    band_min_rel,
    kontext_gewechselt,
    kontext_rekonstruiert,
    klassifiziere_minute,
    konfiguration_id,
    laengste_konstanz_s,
    nachweis_s,
    pruefe_minuten,
    pruefe_rekonstruktion,
    quantisiere,
    regelungsart,
    starts,
    stufe_hoechstens,
    tagesmerkmale,
    wechsel_rekonstruiert,
)
from logik.prognose_regeln import PrognoseRegeln
from logik.prognose_typen import (
    MODELL_VERSION,
    BereichIntervall,
    BetriebsKontext,
    GeraetIntervall,
    Intervall,
    Klassifikation,
    Leistungsreferenz,
)
from logik.regelung import MODI, SollGrund, modus_von

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
    assert len(fields(r)) == 101   # die 98 Felder der Bauvorlage §2.5 + 3 der Abnahmeprüfung P2b
    assert (r.rekonstruktion_treffer_min, r.rekonstruktion_pruef_tage, r.rekonstruktion_vergleiche_min) == (0.99, 7, 1440)
    assert (r.abdeckung_min, r.messalter_max_s, r.ersatz_konstanz_max_s, r.tuer_offen_max_s) == (0.95, 120, 1800, 60)
    assert (r.konvektor_fenster_min, r.oel_fenster_min, r.mad_faktor, r.ohne_wetter_extrapolation_max_k) == (120, 180, 1.4826, 2.0)
    with pytest.raises(FrozenInstanceError):
        r.abdeckung_min = 0.5   # type: ignore[misc]


# ====================================================================== P2 (BSM-033.07)
R = PrognoseRegeln()
WIEN = ZoneInfo("Europe/Vienna")
TAG = date(2026, 11, 10)          # Dienstag, Winterzeit (24 h)
HEUTE = TAG + timedelta(days=1)
KID = konfiguration_id("thermo", [("hk1", "konvektor")])
P_REF = Leistungsreferenz(2.0, "geraet_einstellung", datetime(2026, 10, 1, tzinfo=UTC), "einstellung:1")
HEIZUNG = {"frost": True, "frost_grenze": 5.0, "frost_aus": None, "frei_modus": "frost", "frost_aussen": -3.0}


def lokal(stunde: float, tag: date = TAG) -> datetime:
    return (datetime.combine(tag, time(), WIEN) + timedelta(hours=stunde)).astimezone(UTC)


def kontext(**kw) -> BetriebsKontext:
    werte = {"konfiguration_id": KID, "regelungsart": "thermo", "regulaer_freigegeben": True, "frost_bereit": False,
             "frost_grenze_c": 5.0, "frost_aus_c": 7.0, "frost_aussen_c": None, "baseline_lauf_id": None,
             "tuer_beobachtet": True, "kontext_belegt": True, "wechsel_im_intervall": False,
             "staffel_rekonstruiert_frei": None, "anschlussbelegung_belegt": True, "sperrereignis": False,
             "sonstige_eingriffe": (), "kontext_nachweis": "direkt"}
    werte.update(kw)
    return BetriebsKontext(**werte)


def geraet(von: datetime, d: float = 60, gid: str = "hk1", wh: float | None = 0.0, **kw) -> GeraetIntervall:
    werte = {"zeit": Intervall(von, von + timedelta(seconds=d)), "geraet_id": gid, "energie_wh": wh,
             "energie_gueltig": wh is not None, "sekunden_ein": 0.0, "sekunden_strom": 0.0, "strom_belegt": True,
             "leistung_w": 0.0, "leistung_w_max": 0.0, "erreichbar": True, "heizanforderung_s": 0.0,
             "staffel_gesperrt_s": 0.0, "p_ref": P_REF, "quelle": "ha", "typ": "konvektor"}
    werte.update(kw)
    return GeraetIntervall(**werte)


def voll(von: datetime, d: float = 60, gid: str = "hk1", kw: float = 2.0, **extra) -> GeraetIntervall:
    """Volle Stromminute mit `kw` Leistung."""
    return geraet(von, d, gid, wh=kw * 1000 * d / 3600, sekunden_ein=d, sekunden_strom=d, leistung_w=kw * 1000,
                  leistung_w_max=kw * 1000, **extra)


def minute(von: datetime, d: float = 60, *, geraete=None, k=None, **kw) -> BereichIntervall:
    werte = {"zeit": Intervall(von, von + timedelta(seconds=d)), "bereich_id": "c1", "zeile_vorhanden": True,
             "grund": "arbeitszeit", "zustand": "heizt", "quelle": "ha", "innen_c": 22.0, "innen_gueltig": True,
             "temp_alter_s": 30, "altersnachweis_alt": False, "soll_c": 22.0, "aussen_c": 12.0, "aussen_gueltig": True,
             "aussen_frisch": None, "tuer_offen_s": 0.0, "staffel_begrenzt_s": 0.0}
    werte.update(kw)
    werte["kontext"] = k or kontext()
    werte["geraete"] = tuple(geraete) if geraete is not None else (geraet(von, d),)
    return BereichIntervall(**werte)


def reihe(von: datetime, n: int, d: float = 60, *, geraete_fn=None, **kw) -> list[BereichIntervall]:
    aus = []
    for i in range(n):
        t = von + timedelta(seconds=i * d)
        aus.append(minute(t, d, geraete=None if geraete_fn is None else geraete_fn(t, d), **kw))
    return aus


def tag(abschnitte, tag_: date = TAG) -> list[BereichIntervall]:
    """Ganzer lokaler Tag aus (von_h, bis_h, Felder) – Felder je Abschnitt."""
    aus = []
    for von_h, bis_h, kw in abschnitte:
        aus.extend(reihe(lokal(von_h, tag_), round((bis_h - von_h) * 60), **kw))
    return aus


FREI = {"grund": "ausserhalb", "zustand": "aus", "innen_c": 21.5, "k": kontext(regulaer_freigegeben=False)}
ARBEIT = {"grund": "arbeitszeit", "zustand": "heizt"}


def guter_tag() -> list[BereichIntervall]:
    """Thermo-Arbeitstag: 0–7 außerhalb (innen 21,5), 7–17 Arbeitszeit Soll 22/außen 12, dann außerhalb."""
    return tag([(0, 7, FREI), (7, 17, ARBEIT), (17, 24, FREI)])


def einziger(minuten):
    (t,) = tagesmerkmale(minuten, HEUTE, "Europe/Vienna", R)
    return t


# ---------------------------------------------------------------------- Betriebskontext
def test_betriebskontext_aus_ereignis_und_einstellung():
    e = {"grund": "arbeitszeit", "regelungsart": "thermo", "konfiguration_id": KID}
    k = betriebskontext(grund="arbeitszeit", ereignis=e, ereignisse_im_intervall=[], heizung=HEIZUNG,
                        heizkoerper=[("hk1", "konvektor")], fuehler=True, lauf_id=None, staffel_bekannt=True, tuer_beobachtet=True)
    assert k.kontext_belegt and k.regelungsart == "thermo" and k.konfiguration_id == KID
    assert (k.frost_grenze_c, k.frost_aus_c, k.frost_bereit, k.regulaer_freigegeben) == (5.0, 7.0, True, True)
    assert not k.wechsel_im_intervall
    # andere Heizkörper zum Zeitpunkt: das Ereignis bestätigt sie nicht → unbelegt
    anders = betriebskontext(grund="arbeitszeit", ereignis=e, ereignisse_im_intervall=[], heizung=HEIZUNG,
                             heizkoerper=[("hk1", "konvektor"), ("hk2", "oelradiator")], fuehler=True, lauf_id=None,
                             staffel_bekannt=True, tuer_beobachtet=True)
    assert anders.kontext_belegt is False


def test_betriebskontext_ohne_beleg_nicht_aufgefuellt():
    """Alter Kontext: ohne Ereignis bzw. ohne belegte Einstellung bleibt er unbelegt (nie mit heutigen Werten)."""
    ohne_ereignis = betriebskontext(grund="arbeitszeit", ereignis=None, ereignisse_im_intervall=[], heizung=HEIZUNG,
                                    heizkoerper=[("hk1", "konvektor")], fuehler=True, lauf_id=None, staffel_bekannt=False,
                                    tuer_beobachtet=False)
    assert ohne_ereignis.kontext_belegt is False and ohne_ereignis.regelungsart == "unbekannt"
    e = {"grund": "arbeitszeit", "regelungsart": "thermo", "konfiguration_id": KID}
    ohne_einstellung = betriebskontext(grund="frost", ereignis=e, ereignisse_im_intervall=[], heizung=None,
                                       heizkoerper=[("hk1", "konvektor")], fuehler=True, lauf_id=None, staffel_bekannt=True,
                                       tuer_beobachtet=True)
    assert ohne_einstellung.kontext_belegt is False and ohne_einstellung.frost_bereit is None


def test_kontextwechsel_nur_bei_grund_regelungsart_konfiguration():
    a = {"grund": "vorheizen", "zustand": "heizt", "soll_c": 21.0, "regelungsart": "thermo", "konfiguration_id": KID}
    assert not kontext_gewechselt(a, [{**a, "zustand": "aus", "soll_c": 21.1}])   # TPI und gleitendes Soll
    assert kontext_gewechselt(a, [{**a, "grund": "arbeitszeit"}])                    # Grundwechsel nach 30 s
    assert kontext_gewechselt(a, [{**a, "regelungsart": "plan"}])
    assert not kontext_gewechselt(None, [a])                                         # erstes Ereignis allein


@pytest.mark.parametrize(("frost", "modus", "grund", "fuehler", "aussen", "erwartet"), [
    (True, "frost", "ausserhalb", True, None, True),
    (True, "aus", "frei", True, None, False),            # Urlaub „alles aus“: keine Frostbereitschaft
    (True, "aus", "ausserhalb", True, None, True),       # frei_modus gilt nur an freien Tagen
    (False, "frost", "ausserhalb", True, None, False),
    (True, "frost", "ausserhalb", False, -3.0, True),    # ohne Fühler nach der Außengrenze
    (True, "frost", "ausserhalb", False, None, False),
])
def test_frost_bereit(frost, modus, grund, fuehler, aussen, erwartet):
    assert frost_bereit(frost, modus, grund, fuehler, aussen) is erwartet


def test_bestaetigter_lauf():
    laeufe = [Lauf("l1", "c1", date(2026, 11, 7), date(2026, 11, 9), "fertig"),
              Lauf("l2", "c1", date(2026, 11, 14), date(2026, 11, 16), "abgebrochen", ende=date(2026, 11, 15)),
              Lauf("l3", "c1", date(2026, 11, 21), date(2026, 11, 23), "geplant")]
    assert bestaetigter_lauf(laeufe, "c1", date(2026, 11, 8)) == "l1"
    assert bestaetigter_lauf(laeufe, "c2", date(2026, 11, 8)) is None
    assert bestaetigter_lauf(laeufe, "c1", date(2026, 11, 14)) == "l2"
    assert bestaetigter_lauf(laeufe, "c1", date(2026, 11, 15)) is None   # Abbruchtag zählt nicht
    assert bestaetigter_lauf(laeufe, "c1", date(2026, 11, 21)) is None   # nur geplant


# ---------------------------------------------------------------------- Minutenqualität
def test_minute_direkt_trainingsfaehig():
    (q,) = pruefe_minuten([minute(lokal(8))], R)
    assert (q.betrieb_gueltig, q.frische, q.staffel, q.trainingsfaehig) == (True, "direkt", "direkt", True)
    assert q.energie_je_geraet_gueltig == (("hk1", True),)


def test_kontext_noetig_und_lauf_bestaetigen_werden_ausgewertet():
    """Notiz P1: `betrieb_gueltig` der Klassifikation allein reicht nicht."""
    unbelegt = pruefe_minuten([minute(lokal(8), quelle="import_verlauf", k=kontext(kontext_belegt=False))], R)[0]
    assert not unbelegt.betrieb_gueltig and not unbelegt.trainingsfaehig
    assert {"kontext_noetig", "kontext_fehlt"} <= set(unbelegt.gruende)
    belegt = pruefe_minuten([minute(lokal(8), quelle="import_verlauf")], R)[0]
    assert belegt.betrieb_gueltig and belegt.trainingsfaehig
    ohne_lauf = pruefe_minuten([minute(lokal(8), grund="baseline")], R)[0]
    assert not ohne_lauf.betrieb_gueltig and "lauf_unbestaetigt" in ohne_lauf.gruende
    mit_lauf = pruefe_minuten([minute(lokal(8), grund="baseline", k=kontext(baseline_lauf_id="l1"))], R)[0]
    assert mit_lauf.betrieb_gueltig and mit_lauf.trainingsfaehig


def test_stundenimport_und_wechsel_kein_training():
    stunde = pruefe_minuten([minute(lokal(8), 3600, quelle="import_statistik", geraete=[geraet(lokal(8), 3600, wh=500.0)])], R)[0]
    assert not stunde.trainingsfaehig and "kein_minutenwert" in stunde.gruende
    ha_stunde = pruefe_minuten([minute(lokal(8), 3600, geraete=[geraet(lokal(8), 3600, wh=500.0)])], R)[0]
    assert ha_stunde.betrieb_gueltig and not ha_stunde.trainingsfaehig
    wechsel = pruefe_minuten([minute(lokal(8), k=kontext(wechsel_im_intervall=True))], R)[0]
    assert not wechsel.trainingsfaehig and "wechsel_im_intervall" in wechsel.gruende


def test_frische_kein_downgrade_und_unbekannt():
    alt = pruefe_minuten([minute(lokal(8), temp_alter_s=300)], R)[0]
    assert alt.frische == "keiner" and "messalter_ueberschritten" in alt.gruende and not alt.trainingsfaehig
    assert pruefe_minuten([minute(lokal(8), temp_alter_s=120)], R)[0].frische == "direkt"   # genau 120 s gültig
    neu_unbekannt = pruefe_minuten([minute(lokal(8), temp_alter_s=None, staffel_begrenzt_s=None)], R)[0]
    assert {"messalter_unbekannt", "staffel_unbekannt"} <= set(neu_unbekannt.gruende)
    historisch = pruefe_minuten([minute(lokal(8), temp_alter_s=None, staffel_begrenzt_s=None, altersnachweis_alt=True)], R)[0]
    assert {"frische_ersatz_noetig", "staffel_ersatz_noetig"} <= set(historisch.gruende) and not historisch.trainingsfaehig


def test_bekannte_sperre_schliesst_aus():
    q = pruefe_minuten([minute(lokal(8), staffel_begrenzt_s=10.0,
                               geraete=[geraet(lokal(8), heizanforderung_s=10.0, staffel_gesperrt_s=10.0)])], R)[0]
    assert q.staffel == "keiner" and "staffel_begrenzt" in q.gruende and not q.trainingsfaehig


# ---------------------------------------------------------------------- Ersatznachweis (Anhang B)
def historisch(von: datetime, werte: list[float], d: float = 60, **kw) -> list[BereichIntervall]:
    """Historische Minuten ohne Alters-/Staffelnachweis, alle Heizkörper volle Stromminuten mit 2 kW."""
    aus, t = [], von
    for w in werte:
        aus.append(minute(t, d, innen_c=w, temp_alter_s=None, staffel_begrenzt_s=None, altersnachweis_alt=True,
                          geraete=[voll(t, d, heizanforderung_s=None, staffel_gesperrt_s=None)], **kw))
        t += timedelta(seconds=d)
    return aus


def test_quantisierung():
    assert quantisiere(22.0, 0.1) == quantisiere(22.000001, 0.1)
    assert quantisiere(22.05, 0.1) == quantisiere(22.1, 0.1)    # half-up
    # 22,000000/22,000001 abwechselnd ist ein konstanter Wert – 45 min Folge ist zu lang für Ersatz
    q = frische_ersatz(historisch(lokal(8), [22.0, 22.000001] * 22 + [22.0]), R)
    assert q.frische == "keiner" and "konstanz_zu_lang" in q.gruende


def test_konstantfolge_1800_und_1801():
    zulaessig = historisch(lokal(8), [22.0] * 30 + [22.1] * 10)
    assert laengste_konstanz_s(zulaessig, R) == pytest.approx(1800)
    q = frische_ersatz(zulaessig, R)
    assert q.frische == "ersatz" and q.trainingsfaehig and "frische_ersatz" in q.gruende
    zu_lang = historisch(lokal(8), [22.0] * 30) + historisch(lokal(8.5), [22.0], d=1) + historisch(lokal(8.5) + timedelta(seconds=1), [22.1] * 10)
    assert laengste_konstanz_s(zu_lang, R) == pytest.approx(1801)
    assert frische_ersatz(zu_lang, R).frische == "keiner"


def test_stabil_und_variabel():
    werte = ([22.0] * 20 + [22.1] * 20) * 3   # alle 20 min wechselnd, Trend ≈ 0
    q = frische_ersatz(historisch(lokal(8), werte), R)
    assert (q.frische, q.staffel, q.trainingsfaehig) == ("ersatz", "ersatz", True)


def test_stabiler_sensor_alt_verworfen_neu_direkt():
    alt = frische_ersatz(historisch(lokal(8), [22.0] * 45), R)
    assert alt.frische == "keiner" and not alt.trainingsfaehig and "konstanz_zu_lang" in alt.gruende
    neu = frische_ersatz(reihe(lokal(8), 45, temp_alter_s=60), R)
    assert neu.frische == "direkt" and neu.staffel == "direkt" and neu.trainingsfaehig   # Konstanz sperrt direkte Daten nicht


def test_kein_frische_downgrade():
    werte = [22.0, 22.1, 22.2, 22.1] * 10
    neu_alt = [replace(m, temp_alter_s=300) for m in historisch(lokal(8), werte)]
    q = frische_ersatz(neu_alt, R)
    assert q.frische == "keiner" and "messalter_ueberschritten" in q.gruende and "frische_ersatz" not in q.gruende


def test_korrekte_tpi_pulscheck():
    """P_ref 2 kW, Vollstromminuten 2 kW, im Fenster nur die Hälfte an (Fenstermittel 1 kW) → besteht."""
    ms = []
    for i, w in enumerate(([22.0] * 20 + [22.1] * 20) * 2):
        t = lokal(8) + timedelta(minutes=i)
        g = (voll(t, heizanforderung_s=None, staffel_gesperrt_s=None) if i % 2 == 0
             else geraet(t, heizanforderung_s=None, staffel_gesperrt_s=None))
        ms.append(minute(t, innen_c=w, temp_alter_s=None, staffel_begrenzt_s=None, altersnachweis_alt=True, geraete=[g]))
    q = frische_ersatz(ms, R)
    assert q.frische == "ersatz" and q.trainingsfaehig


def test_pulscheck_scheitert():
    werte = ([22.0] * 20 + [22.1] * 20) * 2
    schwach = [replace(m, geraete=(voll(m.zeit.von, kw=1.5, heizanforderung_s=None, staffel_gesperrt_s=None),))
               for m in historisch(lokal(8), werte)]
    q = frische_ersatz(schwach, R)   # 1,5 kW < 0,8 · 2 kW
    assert q.frische == "keiner" and q.staffel == "keiner" and "puls_ausserhalb" in q.gruende
    ohne_ref = [replace(m, geraete=(voll(m.zeit.von, p_ref=None, heizanforderung_s=None, staffel_gesperrt_s=None),))
                for m in historisch(lokal(8), werte)]
    assert "p_ref_fehlt" in frische_ersatz(ohne_ref, R).gruende
    ohne_messung = [replace(m, geraete=(replace(m.geraete[0], strom_belegt=False),)) for m in historisch(lokal(8), werte)]
    assert "puls_zu_wenig" in frische_ersatz(ohne_messung, R).gruende   # Strom nur aus dem Relay: kein Pulsnachweis


def test_unbekannte_staffelung_nie_direkt():
    werte = ([22.0] * 20 + [22.1] * 20) * 2
    ms = [replace(m, temp_alter_s=30, altersnachweis_alt=True) for m in historisch(lokal(8), werte)]
    q = frische_ersatz(ms, R)
    assert q.frische == "direkt" and q.staffel == "ersatz" and "staffel_ersatz" in q.gruende and q.trainingsfaehig


def test_bekannte_sperre_im_fenster():
    ms = reihe(lokal(8), 60)
    ms[30] = replace(ms[30], staffel_begrenzt_s=10.0,
                     geraete=(geraet(ms[30].zeit.von, heizanforderung_s=10.0, staffel_gesperrt_s=10.0),))
    q = frische_ersatz(ms, R)
    assert q.staffel == "keiner" and not q.trainingsfaehig and "staffel_begrenzt" in q.gruende


def test_ersatz_lueckenlos_und_erreichbar():
    ms = historisch(lokal(8), ([22.0] * 20 + [22.1] * 20) * 2)
    q = frische_ersatz(ms[:10] + ms[11:], R)
    assert not q.trainingsfaehig and "luecke" in q.gruende
    offline = [replace(m, geraete=(replace(m.geraete[0], erreichbar=None),)) for m in ms]
    assert "geraet_nicht_erreichbar" in frische_ersatz(offline, R).gruende


# ---------------------------------------------------------------------- Tagesmerkmale (Anhang A)
def test_guter_tag_ist_geeignet():
    t = einziger(guter_tag())
    assert t.dauer_h == pytest.approx(24.0) and t.datum == TAG and t.konfiguration_id == KID
    assert t.aktiv_h == pytest.approx(10.0) and t.gdh_aktiv_kh == pytest.approx(100.0) and t.gdh_innen_kh == pytest.approx(100.0)
    assert t.q_betrieb == pytest.approx(1.0) and t.q_joint_r == pytest.approx(1.0) and t.q_joint_f is None
    assert t.laengste_joint_luecke_s == pytest.approx(0.0) and t.ist_vollstaendig
    assert t.kapazitaet_regulaer_kwh == pytest.approx(20.0)   # 10 h × P_ref 2 kW
    assert len(t.starts) == 1 and t.starts[0].delta_start_k == pytest.approx(0.5)
    assert t.training_thermo and not t.training_plan
    assert "tuer_unbekannt" not in t.gruende


def test_tpi_aus_bleibt_regulaer():
    """60 min arbeitszeit/aus, Soll 22, außen 12, alles gültig, 0 kWh → R 1 h, GDH 10, Energie 0 (nicht fehlend)."""
    t = einziger(tag([(0, 8, FREI), (8, 9, {"grund": "arbeitszeit", "zustand": "aus"}), (9, 24, FREI)]))
    assert t.aktiv_h == pytest.approx(1.0) and t.gdh_aktiv_kh == pytest.approx(10.0)
    assert dict(t.energie_arten_kwh)["REGULAER"] == 0.0 and t.ist_vollstaendig


def test_absenken_mit_gespeichertem_soll():
    t = einziger(tag([(0, 8, FREI), (8, 10, {"grund": "absenken", "soll_c": 10.0, "aussen_c": 0.0}), (10, 24, FREI)]))
    assert t.gdh_aktiv_kh == pytest.approx(20.0)   # kein 21-°C-Ersatz


def test_frostbereitschaft_192():
    """24 h außerhalb, Frost 5/7, außen −2, kein R → GDH_frost 192 K·h (Grund frost nicht nötig)."""
    k = kontext(regulaer_freigegeben=False, frost_bereit=True)
    t = einziger(tag([(0, 24, {"grund": "ausserhalb", "zustand": "aus", "aussen_c": -2.0, "innen_c": 8.0, "k": k})]))
    assert t.gdh_frost_kh == pytest.approx(192.0) and t.frost_h == pytest.approx(24.0) and t.aktiv_h == 0.0
    assert t.q_joint_f == pytest.approx(1.0) and t.q_joint_r is None


def test_frost_deaktiviert():
    """Derselbe Tag mit frei_modus aus: Frostbereitschaft aus der Politik → GDH_frost 0, Frostenergie 0."""
    bereit = frost_bereit(True, "aus", "frei", True, None)
    k = kontext(regulaer_freigegeben=False, frost_bereit=bereit)
    t = einziger(tag([(0, 24, {"grund": "frei", "zustand": "aus", "aussen_c": -2.0, "innen_c": 8.0, "k": k})]))
    assert t.gdh_frost_kh == 0.0 and t.frost_h == 0.0 and dict(t.energie_arten_kwh)["FROST"] == 0.0


@pytest.mark.parametrize(("feld", "wert", "code"), [("zustand", "offline", "offline"), ("quelle", "notprogramm", "notprogramm")])
def test_modus_und_qualitaet(feld, wert, code):
    """arbeitszeit + offline/notprogramm: SONSTIGE und ungültig; die Energie bleibt (separat) erhalten."""
    stoerung = {"grund": "arbeitszeit", feld: wert, "geraete_fn": lambda t, d: [voll(t, d)]}
    t = einziger(tag([(0, 7, FREI), (7, 8, stoerung), (8, 17, ARBEIT), (17, 24, FREI)]))
    assert dict(t.energie_arten_kwh)["SONSTIGE"] == pytest.approx(2.0)
    assert t.ist_belegt_kwh == pytest.approx(2.0) and not t.training_thermo and code in t.gruende


def test_sonderbetrieb_6_kwh():
    def zwei_kwh(t, d):
        return [voll(t, d)]
    t = einziger(tag([(0, 7, FREI), *[(7 + i, 8 + i, {"grund": g, "geraete_fn": zwei_kwh}) for i, g in enumerate(("boost", "taste", "hand"))],
                      (10, 17, ARBEIT), (17, 24, FREI)]))
    assert dict(t.energie_arten_kwh)["SONSTIGE"] == pytest.approx(6.0)
    assert not t.training_thermo and "sonderbetrieb" in t.gruende


def test_fehlende_zeile():
    """10 min ohne Betriebszeile: SONSTIGE/fehlend, keine impliziten Null-GDH als vollständiger Tag."""
    ms = guter_tag()
    luecke = [m for m in ms if lokal(12) <= m.zeit.von < lokal(12) + timedelta(minutes=10)]
    ms = [m if m not in luecke else replace(m, zeile_vorhanden=False, grund=None, zustand=None, soll_c=None) for m in ms]
    t = einziger(ms)
    assert t.q_betrieb == pytest.approx(1430 / 1440)
    assert t.aktiv_h == pytest.approx(10 - 10 / 60) and t.gdh_aktiv_kh == pytest.approx(100 - 10 / 6)
    assert t.laengste_joint_luecke_s == pytest.approx(600) and not t.training_thermo
    assert dict(t.energie_arten_kwh)["SONSTIGE"] == 0.0


def test_geraeteabdeckung_jedes_geraet():
    """Zwei Heizkörper mit q_E 1,00 und 0,94: Tagestraining false, obwohl das Mittel 0,97 ist."""
    fehlt_ab, fehlt_bis = lokal(0), lokal(0) + timedelta(minutes=86)

    def zwei(t, d):
        return [geraet(t, d, "hk1"), geraet(t, d, "hk2", wh=None if fehlt_ab <= t < fehlt_bis else 0.0)]
    k = kontext(regulaer_freigegeben=False)
    t = einziger(tag([(0, 7, {**FREI, "geraete_fn": zwei, "k": k}), (7, 17, {**ARBEIT, "geraete_fn": zwei}),
                      (17, 24, {**FREI, "geraete_fn": zwei, "k": k})]))
    q = dict(t.q_energie_je_geraet)
    assert q["hk1"] == pytest.approx(1.0) and q["hk2"] == pytest.approx(0.94, abs=0.001)
    assert (q["hk1"] + q["hk2"]) / 2 > R.abdeckung_min
    assert not t.training_thermo and "energie_abdeckung" in t.gruende


def test_expositionsabdeckung():
    """24-h-Tag, 30 min Energie fehlen ganz innerhalb von 4 h Heizzeit → q_E 0,97917, q_joint,R 0,875."""
    def fehlt(t, d):
        return [geraet(t, d, wh=None if lokal(9) <= t < lokal(9.5) else 0.0)]
    t = einziger(tag([(0, 8, FREI), (8, 12, {**ARBEIT, "geraete_fn": fehlt}), (12, 24, FREI)]))
    assert dict(t.q_energie_je_geraet)["hk1"] == pytest.approx(0.979167, abs=1e-6)
    assert t.q_joint_r == pytest.approx(0.875) and not t.training_thermo and "abdeckung_r" in t.gruende


def test_lange_luecke():
    """Einzige gemeinsame Lücke 6 min: q 0,99583 und trotzdem kein Tagestraining."""
    ms = [m for m in guter_tag() if not lokal(3) <= m.zeit.von < lokal(3) + timedelta(minutes=6)]
    t = einziger(ms)
    assert t.q_betrieb == pytest.approx(0.995833, abs=1e-6) and t.laengste_joint_luecke_s == pytest.approx(360)
    assert not t.training_thermo and t.gruende[0] == "luecke_zu_lang"
    kurz = [m for m in guter_tag() if not lokal(3) <= m.zeit.von < lokal(3) + timedelta(minutes=5)]
    assert einziger(kurz).training_thermo   # 5 min sind gerade noch erlaubt


def test_startdefizit():
    """Soll 22; zehn frische Innenwerte davor alle 18,5 → ΔT_start 3,5; Tagesregression ausgeschlossen."""
    t = einziger(tag([(0, 7, {**FREI, "innen_c": 18.5}), (7, 17, ARBEIT), (17, 24, FREI)]))
    (s,) = t.starts
    assert s.innen_start_c == pytest.approx(18.5) and s.delta_start_k == pytest.approx(3.5)
    assert not t.training_thermo and "start_zu_kalt" in t.gruende


def test_ein_start_vorheizen_arbeitszeit():
    ms = tag([(0, 5, FREI), (5, 6, {"grund": "vorheizen"}), (6, 17, ARBEIT), (17, 24, FREI)])
    (s,) = starts(ms, R)
    assert s.beginn == lokal(5) and s.episode_id == f"c1:{lokal(5).isoformat()}" and s.konfiguration_id == KID


def test_starts_pause_und_sollsprung():
    ms = tag([(0, 7, FREI), (7, 9, ARBEIT), (9, 9.5, FREI), (9.5, 12, ARBEIT), (12, 13, FREI), (13, 15, ARBEIT),
              (15, 16, {**ARBEIT, "soll_c": 23.5}), (16, 24, FREI)])
    beginn = [s.beginn for s in starts(ms, R)]
    assert beginn == [lokal(7), lokal(9.5), lokal(13), lokal(15)]   # 30/60 min ohne R; Sollsprung 1,5 K um 15:00
    # 25 min ohne R sind kein neuer Start
    kurz = tag([(0, 7, FREI), (7, 9, ARBEIT), (9, 9 + 25 / 60, FREI), (9 + 25 / 60, 12, ARBEIT), (12, 24, FREI)])
    assert [s.beginn for s in starts(kurz, R)] == [lokal(7)]


def test_start_unbekannt_ohne_genug_werte():
    ms = tag([(0, 7, {**FREI, "innen_c": None, "innen_gueltig": False}), (7, 17, ARBEIT), (17, 24, FREI)])
    (s,) = starts(ms, R)
    assert s.innen_start_c is None and s.delta_start_k is None and "start_unbekannt" in s.gruende
    beginn_ohne_vorgeschichte = tag([(7, 17, ARBEIT)])
    assert starts(beginn_ohne_vorgeschichte, R) == ()   # Pause davor nicht beobachtet


def test_sommerzeit_25_stunden():
    tag_ = date(2026, 10, 25)
    ms = tag([(0, 25, {**FREI})], tag_)
    (t,) = tagesmerkmale(ms, tag_ + timedelta(days=1), "Europe/Vienna", R)
    assert t.dauer_h == pytest.approx(25.0) and t.q_betrieb == pytest.approx(1.0)


def test_plan_tag_und_heutiger_tag_fehlt():
    k = kontext(regelungsart="plan", konfiguration_id=konfiguration_id("plan", [("hk1", "konvektor")]))
    kf = replace(k, regulaer_freigegeben=False)
    ms = tag([(0, 7, {**FREI, "innen_c": None, "innen_gueltig": False, "k": kf}),
              (7, 17, {**ARBEIT, "innen_c": None, "innen_gueltig": False, "k": k}),
              (17, 24, {**FREI, "innen_c": None, "innen_gueltig": False, "k": kf})])
    t = einziger(ms)
    assert t.plan_h == pytest.approx(10.0) and t.aktiv_h == 0.0 and t.gdh_aktiv_kh == 0.0
    assert t.training_plan and not t.training_thermo and t.q_joint_r == pytest.approx(1.0)
    assert tagesmerkmale(ms, TAG, "Europe/Vienna", R) == ()   # heute ist nicht abgeschlossen


def test_baseline_und_konfigurationswechsel_kein_training():
    t = einziger(tag([(0, 24, {"grund": "baseline", "k": kontext(baseline_lauf_id="l1", regulaer_freigegeben=False)})]))
    assert not t.training_thermo and "baseline" in t.gruende
    k2 = kontext(konfiguration_id="kanders")
    t2 = einziger(tag([(0, 7, FREI), (7, 12, ARBEIT), (12, 17, {**ARBEIT, "k": k2}), (17, 24, FREI)]))
    assert not t2.training_thermo and "konfiguration_gewechselt" in t2.gruende


def test_tuer_offen_ueber_60_s_in_r():
    ms = guter_tag()
    i = next(i for i, m in enumerate(ms) if m.zeit.von == lokal(10))
    ms[i] = replace(ms[i], tuer_offen_s=40.0)
    assert einziger(ms).training_thermo   # 40 s
    ms[i + 1] = replace(ms[i + 1], tuer_offen_s=30.0)
    t = einziger(ms)
    assert not t.training_thermo and "tuer_offen" in t.gruende   # 70 s am Stück
    ohne_kontakt = [replace(m, kontext=replace(m.kontext, tuer_beobachtet=False)) for m in guter_tag()]
    t3 = einziger(ohne_kontakt)
    assert t3.training_thermo and "tuer_unbekannt" in t3.gruende   # Unsicherheit, kein Ausschluss


def test_fehlendes_p_ref_keine_kapazitaet():
    t = einziger(tag([(0, 7, FREI), (7, 17, {**ARBEIT, "geraete_fn": lambda t, d: [geraet(t, d, p_ref=None)]}), (17, 24, FREI)]))
    assert t.kapazitaet_regulaer_kwh is None


# ---------------------------------------------------------------------- Abkühlepisoden
def nacht(typ: str = "konvektor", tuer_um: float | None = None) -> list[BereichIntervall]:
    """Heizen bis 18:00, dann aus; innen fällt 0,01 K je Minute, außen 5."""
    aus = []
    for i in range(12 * 60, 24 * 60):
        t = lokal(i / 60)
        heizt = i < 18 * 60
        innen = 22.0 if heizt else 22.0 - 0.01 * (i - 18 * 60)
        g = voll(t, typ=typ) if heizt else geraet(t, typ=typ)
        aus.append(minute(t, innen_c=innen, aussen_c=5.0, grund="arbeitszeit" if heizt else "ausserhalb", geraete=[g],
                          tuer_offen_s=30.0 if tuer_um is not None and t == lokal(tuer_um) else 0.0))
    return aus


def test_abkuehlepisode_konvektor_und_oel():
    (e,) = abkuehlepisoden(nacht(), R)
    assert e.zeit.von == lokal(19) and e.zeit.bis == lokal(24)   # 60 min Nachlauf verworfen
    assert e.innen_start_c == pytest.approx(21.4) and e.innen_ende_c == pytest.approx(22.0 - 0.01 * 359)
    assert len(e.minuten) == 300 and e.konfiguration_id == KID and e.gruende == ()
    (oel,) = abkuehlepisoden(nacht("oelradiator"), R)
    assert oel.zeit.von == lokal(20)                             # Öl: 120 min Nachlauf


def test_abkuehlepisode_tuer_beendet_und_zu_kurz():
    (e,) = abkuehlepisoden(nacht(tuer_um=22), R)
    assert e.zeit.bis == lokal(22)   # 19–22 Uhr, danach erst wieder nach dem nächsten Heizen
    assert abkuehlepisoden(nacht(tuer_um=20.5), R) == ()   # 19–20:30 ist kürzer als 2 h


# ---------------------------------------------------------------------- Review P2 (B1/S/K)
def test_sommerzeit_23_stunden():
    tag_ = date(2027, 3, 28)
    ms = tag([(0, 23, {**FREI})], tag_)
    (t,) = tagesmerkmale(ms, tag_ + timedelta(days=1), "Europe/Vienna", R)
    assert t.dauer_h == pytest.approx(23.0) and t.q_betrieb == pytest.approx(1.0) and t.laengste_joint_luecke_s == 0.0


def test_sollsprung_absenken_arbeitszeit():
    """Absenken (Soll 10) → Arbeitszeit (Soll 22) ohne Lücke: Sollerhöhung 12 K > 1 K ist ein neuer Start."""
    ms = tag([(0, 5, FREI), (5, 7, {"grund": "absenken", "soll_c": 10.0}), (7, 17, ARBEIT), (17, 24, FREI)])
    s = starts(ms, R)
    assert [x.beginn for x in s] == [lokal(5), lokal(7)] and "sollsprung" in s[1].gruende
    assert s[1].delta_start_k == pytest.approx(0.0)   # innen 22 in der Absenkzeit (Fixture) → kein Defizit


def test_start_nach_luecke():
    """40 min ohne Zeilen vor der Arbeitszeit: Start zählt, aber „ohne R“ ist nicht bewiesen."""
    ms = [m for m in guter_tag() if not lokal(6) + timedelta(minutes=20) <= m.zeit.von < lokal(7)]
    (s,) = starts(ms, R)
    assert s.beginn == lokal(7) and "start_nach_luecke" in s.gruende
    (sauber,) = starts(guter_tag(), R)
    assert "start_nach_luecke" not in sauber.gruende


def test_starts_je_container_getrennt():
    """Minuten zweier Container gemischt: Starts je Container (keine Vermischung der Pausen)."""
    c1 = guter_tag()
    c2 = [replace(m, bereich_id="c2") for m in tag([(0, 9, FREI), (9, 17, ARBEIT), (17, 24, FREI)])]
    gemischt = sorted(c1 + c2, key=lambda m: m.zeit.von)
    assert sorted((s.episode_id.split(":")[0], s.beginn) for s in starts(gemischt, R)) == [("c1", lokal(7)), ("c2", lokal(9))]
    assert {t.bereich_id for t in tagesmerkmale(gemischt, HEUTE, "Europe/Vienna", R)} == {"c1", "c2"}


def test_wechsel_minute_nur_lokal():
    """Ein Grundwechsel mitten in einer Minute nimmt nur diese Minute aus (Lücke 60 s), nicht den ganzen Tag."""
    ms = guter_tag()
    i = next(i for i, m in enumerate(ms) if m.zeit.von == lokal(7))
    ms[i] = replace(ms[i], kontext=replace(ms[i].kontext, wechsel_im_intervall=True))
    t = einziger(ms)
    assert t.training_thermo and "wechsel_im_intervall" in t.gruende
    assert t.gdh_aktiv_kh == pytest.approx(100 - 10 / 60) and t.laengste_joint_luecke_s == pytest.approx(60)


def test_frost_ohne_grenze_unbekannt():
    e = {"grund": "ausserhalb", "regelungsart": "thermo", "konfiguration_id": KID}
    ohne = {k: v for k, v in HEIZUNG.items() if k != "frost_grenze"}
    k = betriebskontext(grund="ausserhalb", ereignis=e, ereignisse_im_intervall=[], heizung=ohne,
                        heizkoerper=[("hk1", "konvektor")], fuehler=True, lauf_id=None, staffel_bekannt=True, tuer_beobachtet=True)
    assert k.frost_bereit is None   # nie 0 °C angenommen
    ohne_schalter = {k: v for k, v in HEIZUNG.items() if k != "frost"}
    assert betriebskontext(grund="ausserhalb", ereignis=e, ereignisse_im_intervall=[], heizung=ohne_schalter,
                           heizkoerper=[("hk1", "konvektor")], fuehler=True, lauf_id=None, staffel_bekannt=True,
                           tuer_beobachtet=True).frost_bereit is None


def test_grund_von_ereignis_und_zeile_muessen_passen():
    e = {"grund": "ausserhalb", "regelungsart": "thermo", "konfiguration_id": KID}
    gemeinsam = {"heizung": HEIZUNG, "heizkoerper": [("hk1", "konvektor")], "fuehler": True, "lauf_id": None,
                 "staffel_bekannt": True, "tuer_beobachtet": True}
    assert not betriebskontext(grund="arbeitszeit", ereignis=e, ereignisse_im_intervall=[], **gemeinsam).kontext_belegt
    im = betriebskontext(grund="arbeitszeit", ereignis=e, ereignisse_im_intervall=[{**e, "grund": "arbeitszeit"}], **gemeinsam)
    assert im.kontext_belegt and im.wechsel_im_intervall   # Zeile = Stand am Ende
    am_ende = betriebskontext(grund="arbeitszeit", ereignis=e, ereignisse_im_intervall=[],
                              ereignis_am_ende={**e, "grund": "arbeitszeit"}, **gemeinsam)
    assert am_ende.kontext_belegt and not am_ende.wechsel_im_intervall


def test_fuehler_aus_regelungsart():
    """Ohne Fühler-Angabe zählt Regelungsart thermo als Fühler (Frostbereitschaft auch ohne frost_aussen)."""
    e = {"grund": "ausserhalb", "regelungsart": "thermo", "konfiguration_id": KID}
    h = {**HEIZUNG, "frost_aussen": None}
    k = betriebskontext(grund="ausserhalb", ereignis=e, ereignisse_im_intervall=[], heizung=h,
                        heizkoerper=[("hk1", "konvektor")], fuehler=False, lauf_id=None, staffel_bekannt=True, tuer_beobachtet=True)
    assert k.frost_bereit is True


def test_aussen_frische_unbelegt_sichtbar():
    q = pruefe_minuten([minute(lokal(8))], R)[0]
    assert "aussen_frische_unbelegt" in q.gruende and q.frische == "direkt" and q.trainingsfaehig
    assert "aussen_frische_unbelegt" in einziger(guter_tag()).gruende


def test_abkuehlen_tuer_unbekannt():
    ms = [replace(m, kontext=replace(m.kontext, tuer_beobachtet=False)) for m in nacht()]
    (e,) = abkuehlepisoden(ms, R)
    assert "tuer_unbekannt" in e.gruende


# ---------------------------------------------------------------------- P2b: rekonstruierter Kontext für Altdaten
@pytest.mark.parametrize(("einstellung", "fuehler", "modus"), [
    ({"modus": "plan", "auto": True, "bedarf": False}, True, "plan"),
    ({"modus": None, "auto": True, "bedarf": False}, True, "thermo"),
    ({"modus": None, "auto": True, "bedarf": False}, False, "plan"),
    ({"modus": None, "auto": False, "bedarf": False}, True, "hand"),
    ({"modus": None, "auto": True, "bedarf": True}, True, "bedarf"),
    ({"soll": 21}, True, None),     # nichts zum Modus belegt
    (None, True, None),
    ({"modus": None, "auto": None, "bedarf": False}, True, "hand"),   # wie bisher: nicht auto → Hand
    ({"modus": None, "auto": 0, "bedarf": False}, True, "hand"),
    ({"modus": "aus", "auto": True, "bedarf": False}, True, "aus"),
    ({"modus": "xyz", "auto": True, "bedarf": False}, False, "plan"),   # unbekannter Modus → abgeleitet
    ({"modus": None, "auto": False, "bedarf": True}, True, "bedarf"),   # Bedarf vor Hand
])
def test_modus_von(einstellung, fuehler, modus):
    assert modus_von(einstellung, fuehler) == modus
    assert set(MODI) == {"plan", "thermo", "bedarf", "hand", "aus"}


def _modus_alt(e, fuehler):
    """Die Ableitung aus Heizung.modus bis 0.8.134 (Referenz, Einstellung mit allen Schlüsseln wie STANDARD_BEREICH)."""
    if e.get("modus") in ("plan", "thermo", "bedarf", "hand", "aus"):
        return str(e["modus"])
    if e["bedarf"]:
        return "bedarf"
    if not e["auto"]:
        return "hand"
    return "thermo" if fuehler else "plan"


def test_modus_von_gleich_wie_bisher():
    for modus in (None, "plan", "thermo", "bedarf", "hand", "aus", "xyz", ""):
        for auto in (True, False, None, 0, 1):
            for bedarf in (True, False, None, 0, 1):
                for fuehler in (True, False):
                    e = {"modus": modus, "auto": auto, "bedarf": bedarf}
                    assert modus_von(e, fuehler) == _modus_alt(e, fuehler), e


REK = {"grund": "arbeitszeit", "modus": "thermo", "fuehler": True, "heizung": HEIZUNG, "heizkoerper": [("hk1", "konvektor")],
       "lauf_id": None, "staffel_bekannt": False, "tuer_beobachtet": True, "wechsel": False, "freigegeben": True}


def test_kontext_rekonstruiert_nachweisstufe():
    k = kontext_rekonstruiert(**REK)
    assert k.kontext_belegt and k.kontext_nachweis == "rekonstruiert" and k.regelungsart == "thermo"
    assert k.konfiguration_id == KID                                     # dieselbe konfiguration_id wie mit Ereignis
    assert kontext_rekonstruiert(**{**REK, "freigegeben": False}).kontext_belegt is False   # Abnahmeprüfung nicht bestanden
    assert kontext_rekonstruiert(**{**REK, "heizkoerper": None}).kontext_belegt is False    # Zuordnung nicht belegt
    assert kontext_rekonstruiert(**{**REK, "modus": None}).kontext_belegt is False
    assert kontext_rekonstruiert(**{**REK, "heizung": None}).kontext_belegt is False
    assert kontext_rekonstruiert(**{**REK, "fuehler": False}).regelungsart == "plan"
    nein = kontext_rekonstruiert(**{**REK, "freigegeben": False})
    assert nein.kontext_nachweis == "keiner"


def test_rekonstruiert_nur_im_ersatzpfad():
    """Rekonstruierter Kontext: nie direktes Training, im Ersatzpfad höchstens Stufe C mit Band ≥ ±50 %."""
    k = kontext_rekonstruiert(**REK)
    q = pruefe_minuten([minute(lokal(8), k=k)], R)[0]
    assert q.betrieb_gueltig and not q.trainingsfaehig and "kontext_rekonstruiert" in q.gruende
    fenster = frische_ersatz(reihe(lokal(8), 45, k=k, temp_alter_s=60), R)
    assert fenster.trainingsfaehig and fenster.frische == "ersatz" and "kontext_rekonstruiert" in fenster.gruende
    assert stufe_hoechstens(fenster) == "C" and band_min_rel(fenster, R) == pytest.approx(0.5)
    direkt = frische_ersatz(reihe(lokal(8), 45, temp_alter_s=60), R)
    assert stufe_hoechstens(direkt) == "D" and band_min_rel(direkt, R) is None
    assert "kontext_rekonstruiert" in einziger(tag([(0, 24, {**FREI, "k": replace(k, regulaer_freigegeben=False)})])).gruende


@pytest.mark.parametrize(("vorher", "lueckenlos", "grund", "aenderung", "wechsel"), [
    ("arbeitszeit", True, "arbeitszeit", False, False),
    ("vorheizen", True, "arbeitszeit", False, True),     # Grundwechsel gegenüber der Vorminute
    ("arbeitszeit", False, "arbeitszeit", False, True),  # nach einer Lücke
    ("arbeitszeit", True, "arbeitszeit", True, True),    # Einstellungs-/Geräteänderung in der Minute
])
def test_wechselminuten_rekonstruiert(vorher, lueckenlos, grund, aenderung, wechsel):
    assert wechsel_rekonstruiert(vorher, lueckenlos, grund, aenderung) is wechsel


def _vergleiche(n: int, treffer: int):
    echt = ("thermo", KID)
    t0 = lokal(8)
    return [(t0 + timedelta(minutes=i), echt, echt if i < treffer else ("plan", "kandere")) for i in range(n)]


def test_abnahmepruefung_quote():
    aus = pruefe_rekonstruktion("c1", _vergleiche(2000, 1978), R)   # 98,9 %
    assert aus.quote == pytest.approx(0.989) and not aus.freigegeben and aus.gruende == ("rekonstruktion_abweichend",)
    assert len(aus.abweichungen) == 22 and aus.abweichungen[0][1:] == (f"thermo/{KID}", "plan/kandere")
    an = pruefe_rekonstruktion("c1", _vergleiche(1500, 1485), R)    # 99 %
    assert an.quote == pytest.approx(0.99) and an.freigegeben and an.gruende == ()
    wenig = pruefe_rekonstruktion("c1", _vergleiche(1439, 1439), R)  # 100 %, aber weniger als ein Tag verglichen
    assert wenig.quote == 1.0 and not wenig.freigegeben and wenig.gruende == ("rekonstruktion_ungeprueft",)
    assert pruefe_rekonstruktion("c1", _vergleiche(1440, 1440), R).freigegeben
    ohne = pruefe_rekonstruktion("c1", [(lokal(8), ("thermo", KID), None)], R)   # Rekonstruktion selbst unbelegt
    assert ohne.verglichen == 0 and ohne.quote is None and not ohne.freigegeben and ohne.gruende == ("rekonstruktion_ungeprueft",)
