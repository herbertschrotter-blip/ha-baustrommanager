"""Staffelung je Anschluss – Szenarien aus dem abgenommenen Mockup (mockups/quelle/glas-app.js, last() und „Stromverteilung“)."""

import pytest

from logik.staffel import (
    Anschluss,
    Last,
    Prio,
    StaffelRegeln,
    Warten,
    anlauf_folge,
    anschluss,
    frei_je_anschluss,
    gesperrt,
    grenze_kw,
    rang_anzeige,
    rangliste,
    staffeln,
)

REGELN = StaffelRegeln()  # max 5, Mindestlauf 10, Mindestpause 5, Takt 15, 1 neuer je Schritt
NORD = anschluss("nord", 32, 3, 4.0, 67)  # Verteiler Nord (Kran)
SUED = anschluss("sued", 32, 3, 3.0, 67)


def hz(id, kw=2.0, an=False, will=True, anschluss="nord", **kw_):
    kw_.setdefault("an_seit_min", 30.0 if an else 0.0)
    return Last(id=id, anschluss=anschluss, kw=kw, heizer=True, an=an, will=will, **kw_)


def sonst(id, kw, anschluss="nord", an=True):
    return Last(id=id, anschluss=anschluss, kw=kw, heizer=False, an=an)


def klein(frei_kw: float) -> Anschluss:
    """Anschluss mit genau `frei_kw` Platz, wenn nichts läuft."""
    return Anschluss(id="nord", grenze_kw=frei_kw + 1.0, reserve_kw=1.0)


# Mockup: Polier 2,0 + 1,99, Mannschaft Radiator 2,0 + Trockner 1,79, Sanitär Frostwächter 2,0 = 9,78 kW.
# Radiator 1 der Mannschaft heizt seit 9 min → der Konvektor ist „dran in 6 min“ (Takt 15).
MOCKUP_LAUFEND = [
    hz("polier_r1", 2.0, an=True, an_seit_min=9),
    hz("polier_r2", 1.99, an=True, an_seit_min=9),
    hz("mannschaft_r1", 2.0, an=True, prio=Prio.HOCH, an_seit_min=9),
    sonst("mannschaft_trockner", 1.79),
    hz("sanitaer_frost", 2.0, an=True, frost=True, an_seit_min=9),
]


def test_grenze_wie_mockup():
    assert grenze_kw(32, 3, 100) == pytest.approx(22.08)
    assert NORD.grenze_kw == pytest.approx(14.7936)
    assert grenze_kw(16, 1, 67) == pytest.approx(2.46560)


def test_mockup_beispiel_konvektor_wartet():
    lasten = [*MOCKUP_LAUFEND, hz("mannschaft_konvektor", 2.0, prio=Prio.HOCH)]
    assert frei_je_anschluss([NORD], lasten)["nord"] == pytest.approx(1.0136, abs=1e-3)
    e = staffeln([NORD], lasten, REGELN)
    assert e.an == {"polier_r1", "polier_r2", "mannschaft_r1", "sanitaer_frost"}
    assert e.wartet == {"mannschaft_konvektor": Warten.RUNDLAUF}
    assert e.dran_in_min["mannschaft_konvektor"] == pytest.approx(6)
    assert e.frei_kw["nord"] == pytest.approx(1.014, abs=1e-3)


def test_mockup_beispiel_nach_dem_takt_tauscht_der_konvektor():
    lasten = [*[l if l.frost or not l.heizer else Last(**{**l.__dict__, "an_seit_min": 15}) for l in MOCKUP_LAUFEND],
              hz("mannschaft_konvektor", 2.0, prio=Prio.HOCH, wartet_seit_min=15)]
    e = staffeln([NORD], lasten, REGELN)
    assert "mannschaft_konvektor" in e.an
    assert e.wartet == {"polier_r1": Warten.RUNDLAUF}  # am längsten laufend; Gleichstand: niedrigere Prio, dann id; Frost nie


def test_ohne_rundlauf_anschluss_voll():
    lasten = [sonst("kran", 10.78), hz("konvektor", 2.0)]
    e = staffeln([NORD], lasten, REGELN)
    assert e.wartet == {"konvektor": Warten.ANSCHLUSS_VOLL}


def test_anschluesse_unabhaengig():
    lasten = [*MOCKUP_LAUFEND, hz("konvektor_nord"), hz("lager_sued", anschluss="sued")]
    e = staffeln([NORD, SUED], lasten, REGELN)
    assert "lager_sued" in e.an
    assert "konvektor_nord" not in e.an
    assert e.frei_kw["sued"] == pytest.approx(SUED.grenze_kw - 3.0 - 2.0, abs=1e-3)


def test_frei_zaehlt_alle_laufenden_lasten():
    lasten = [sonst("pumpe", 0.76), sonst("steckdose", 0.4), sonst("aus", 5.0, an=False), hz("r", 2.0, an=True)]
    assert frei_je_anschluss([klein(5.0)], lasten)["nord"] == pytest.approx(5.0 - 0.76 - 0.4 - 2.0)


def test_ueberlast_zuletzt_eingeschalteter_sofort_aus_frost_boost_zuletzt():
    lasten = [
        hz("frost", an=True, frost=True, an_seit_min=1),
        hz("boost", an=True, boost=True, an_seit_min=2),
        hz("alt", an=True, an_seit_min=60),
        hz("neu", an=True, an_seit_min=3),  # vor der Mindestlaufzeit – geht trotzdem aus
        sonst("kran", 1.5),
    ]
    e = staffeln([klein(8.0)], lasten, REGELN)  # 9,5 kW laufen, 8 frei → 1,5 zu viel
    assert e.an == {"frost", "boost", "alt"}
    assert e.wartet["neu"] == Warten.ANSCHLUSS_VOLL
    # mehr Überlast: danach der normale, dann Boost, Frost zuletzt
    e = staffeln([klein(4.0)], lasten, REGELN)
    assert e.an == {"frost"}
    e = staffeln([klein(1.0)], lasten, REGELN)
    assert e.an == frozenset()


def test_mindestlaufzeit_beim_rundlauf():
    lasten = [hz("a", an=True, an_seit_min=5), hz("b", wartet_seit_min=20)]
    e = staffeln([klein(2.5)], lasten, StaffelRegeln(takt_min=5, min_lauf_min=10))
    assert e.an == {"a"}
    assert e.wartet["b"] == Warten.RUNDLAUF
    assert e.dran_in_min["b"] == pytest.approx(5)


def test_regelung_aus_geht_sofort_aus():
    e = staffeln([klein(10)], [hz("a", an=True, will=False, an_seit_min=1)], REGELN)
    assert e.an == frozenset() and e.wartet == {}


def test_mindestpause():
    e = staffeln([klein(10)], [hz("a", aus_seit_min=3)], REGELN)
    assert e.an == frozenset()
    assert e.wartet["a"] == Warten.MINDESTPAUSE
    assert e.dran_in_min["a"] == pytest.approx(2)
    assert staffeln([klein(10)], [hz("a", aus_seit_min=5)], REGELN).an == {"a"}


def test_max_gleichzeitig():
    laufend = [hz(f"r{i}", kw=1.0, an=True, an_seit_min=5) for i in range(5)]
    e = staffeln([klein(20)], [*laufend, hz("x", kw=1.0)], REGELN)
    assert "x" not in e.an and len(e.an) == 5
    assert e.wartet["x"] == Warten.RUNDLAUF  # Tausch nach dem Takt
    assert e.dran_in_min["x"] == pytest.approx(10)
    # nach dem Takt: einer macht Platz, es bleiben 5
    laufend = [hz(f"r{i}", kw=1.0, an=True, an_seit_min=20 + i) for i in range(5)]
    e = staffeln([klein(20)], [*laufend, hz("x", kw=1.0)], REGELN)
    assert "x" in e.an and len(e.an) == 5 and e.wartet == {"r4": Warten.RUNDLAUF}
    # nur Frost läuft → kein Tausch möglich
    frost = [hz(f"f{i}", kw=1.0, an=True, frost=True) for i in range(5)]
    e = staffeln([klein(20)], [*frost, hz("x", kw=1.0)], REGELN)
    assert e.wartet["x"] == Warten.MAX_GLEICHZEITIG
    # Einstellung verkleinert → Überzählige aus (zuletzt eingeschaltete zuerst), aber erst nach der Mindestlaufzeit
    gemischt = [hz("alt", kw=1.0, an=True, an_seit_min=60), hz("neu", kw=1.0, an=True, an_seit_min=20),
                hz("frisch", kw=1.0, an=True, an_seit_min=2)]
    e = staffeln([klein(20)], gemischt, StaffelRegeln(max_gleichzeitig=2))
    assert e.an == {"alt", "frisch"}  # „frisch“ hält die Mindestlaufzeit
    assert e.wartet == {"neu": Warten.MAX_GLEICHZEITIG}


def test_max_gleichzeitig_ueber_alle_anschluesse():
    lasten = [hz("n1", kw=1.0, an=True), hz("s1", kw=1.0, anschluss="sued"), hz("s2", kw=1.0, anschluss="sued")]
    e = staffeln([NORD, SUED], lasten, StaffelRegeln(max_gleichzeitig=2, neue_je_schritt=5))
    assert len(e.an) == 2


def test_anlaufstaffel_neue_je_schritt():
    lasten = [hz(f"r{i}", kw=1.0) for i in range(4)]
    e = staffeln([klein(10)], lasten, REGELN)
    assert len(e.an) == 1
    assert sorted(e.wartet.values()) == [Warten.ANLAUF] * 3
    assert len(staffeln([klein(10)], lasten, StaffelRegeln(neue_je_schritt=3)).an) == 3


def test_frei_stabil_verhindert_einschalten_bei_kurzer_luecke():
    lasten = [hz("a")]
    assert staffeln([klein(3.0)], lasten, REGELN).an == {"a"}
    e = staffeln([klein(3.0)], lasten, REGELN, frei_stabil_kw={"nord": 1.0})
    assert e.an == frozenset()
    assert e.wartet["a"] == Warten.ANSCHLUSS_VOLL
    assert staffeln([klein(3.0)], lasten, REGELN, frei_stabil_kw={"nord": 2.0}).an == {"a"}


def test_rundlauf_nach_takt_tauscht():
    regeln = StaffelRegeln(takt_min=15)
    lasten = [hz("a", an=True, an_seit_min=16), hz("b", an=True, an_seit_min=40), hz("c", wartet_seit_min=16)]
    e = staffeln([klein(4.5)], lasten, regeln)
    assert e.an == {"a", "c"}  # der am längsten laufende (b) macht Platz
    assert e.wartet["b"] == Warten.RUNDLAUF
    # vor dem Takt kein Tausch
    lasten = [hz("a", an=True, an_seit_min=14), hz("b", an=True, an_seit_min=12), hz("c")]
    e = staffeln([klein(4.5)], lasten, regeln)
    assert e.an == {"a", "b"}
    assert e.wartet["c"] == Warten.RUNDLAUF
    assert e.dran_in_min["c"] == pytest.approx(1)


def test_rundlauf_nur_wenn_der_wartende_danach_passt():
    lasten = [hz("klein", kw=1.0, an=True, an_seit_min=60), hz("gross", kw=3.0)]
    e = staffeln([klein(2.0)], lasten, REGELN)
    assert e.an == {"klein"}
    assert e.wartet["gross"] == Warten.ANSCHLUSS_VOLL


def test_rundlauf_tauscht_keine_hoehere_prio_und_nie_frost():
    lasten = [hz("hoch", an=True, prio=Prio.HOCH, an_seit_min=60), hz("niedrig", prio=Prio.NIEDRIG)]
    e = staffeln([klein(2.5)], lasten, REGELN)
    assert e.an == {"hoch"} and e.wartet["niedrig"] == Warten.ANSCHLUSS_VOLL
    lasten = [hz("frost", an=True, frost=True, an_seit_min=600), hz("x", prio=Prio.HOCH)]
    assert staffeln([klein(2.5)], lasten, REGELN).an == {"frost"}


def test_boost_hat_vorrang_nach_mindestlaufzeit():
    lasten = [hz("normal", an=True, an_seit_min=11), hz("boost", boost=True)]
    e = staffeln([klein(2.5)], lasten, REGELN)
    assert e.an == {"boost"} and e.wartet["normal"] == Warten.RUNDLAUF
    lasten = [hz("normal", an=True, an_seit_min=4), hz("boost", boost=True)]
    e = staffeln([klein(2.5)], lasten, REGELN)
    assert e.an == {"normal"} and e.dran_in_min["boost"] == pytest.approx(6)


@pytest.mark.parametrize(
    ("besser", "schlechter"),
    [
        (dict(frost=True), dict(boost=True, prio=Prio.HOCH, defizit=9)),
        (dict(boost=True), dict(prio=Prio.HOCH, defizit=9)),
        (dict(prio=Prio.HOCH), dict(prio=Prio.NORMAL, defizit=9, wartet_seit_min=99)),
        (dict(defizit=3.0), dict(defizit=1.0, wartet_seit_min=99)),
        (dict(defizit=1.0), dict(defizit=None, wartet_seit_min=99)),
        (dict(wartet_seit_min=20), dict(wartet_seit_min=5)),
    ],
)
def test_reihenfolge_frost_boost_prio_defizit_wartezeit(besser, schlechter):
    lasten = [hz("z_schlechter", **schlechter), hz("a_besser", **besser)]
    e = staffeln([klein(2.5)], lasten, REGELN)
    assert e.an == {"a_besser"}
    assert e.wartet["z_schlechter"] == Warten.ANSCHLUSS_VOLL


def test_nicht_heizer_werden_nie_geschaltet():
    lasten = [sonst("pumpe", 0.76), sonst("trockner", 1.79, an=False), sonst("kran", 20.0)]
    e = staffeln([NORD], lasten, REGELN)
    assert e.an == frozenset() and e.wartet == {}
    assert e.frei_kw["nord"] < 0  # Überlast nur durch Nicht-Heizer: es gibt nichts zu schalten


def test_wartet_nur_fuer_heizer_die_wollen():
    lasten = [hz("will_nicht", will=False), hz("laeuft", an=True)]
    e = staffeln([klein(10)], lasten, REGELN)
    assert e.an == {"laeuft"} and e.wartet == {}


def test_unbekannter_anschluss_folgt_der_regelung():
    e = staffeln([klein(0.5)], [hz("x", anschluss="fehlt")], REGELN)
    assert e.an == {"x"}


def test_leere_listen():
    e = staffeln([], [], REGELN)
    assert e.an == frozenset() and e.wartet == {} and e.frei_kw == {} and e.dran_in_min == {}
    e = staffeln([NORD], [], REGELN)
    assert e.frei_kw["nord"] == pytest.approx(NORD.grenze_kw - 4.0, abs=1e-3)
    assert frei_je_anschluss([], [hz("x")]) == {}


def test_genau_passend_ohne_rundungsfehler():
    # 3,3 − 0,7 − 0,1 − 0,1 = 2,4 – als Kommazahl knapp daneben; darf weder abwerfen noch sperren
    a = Anschluss(id="nord", grenze_kw=3.3, reserve_kw=0.7)
    grund = [sonst("p", 0.1), sonst("q", 0.1)]
    assert staffeln([a], [*grund, hz("h", kw=2.4, an=True)], REGELN).an == {"h"}
    a = Anschluss(id="nord", grenze_kw=3.3, reserve_kw=0.3)
    grund = [sonst("p", 0.1), sonst("q", 1.1)]
    assert staffeln([a], [*grund, hz("h", kw=1.8)], REGELN).an == {"h"}


def test_frei_stabil_none_oder_fehlend_gilt_jetzt():
    lasten = [hz("a")]
    assert staffeln([klein(3.0)], lasten, REGELN, frei_stabil_kw={"nord": None}).an == {"a"}
    assert staffeln([klein(3.0)], lasten, REGELN, frei_stabil_kw={"sued": 0.0}).an == {"a"}


def test_frost_verdraengt_boost_nach_mindestlaufzeit():
    lasten = [hz("boost", an=True, boost=True, an_seit_min=11), hz("frost", frost=True)]
    e = staffeln([klein(2.5)], lasten, REGELN)
    assert e.an == {"frost"} and e.wartet["boost"] == Warten.RUNDLAUF
    # normale gehen vor Boost, auch wenn der Boost länger läuft
    lasten = [hz("boost", an=True, boost=True, an_seit_min=60), hz("normal", an=True, an_seit_min=11),
              hz("frost", frost=True)]
    e = staffeln([klein(4.5)], lasten, REGELN)
    assert e.an == {"boost", "frost"}
    # Boost verdrängt keinen anderen Boost
    lasten = [hz("b1", an=True, boost=True, an_seit_min=60), hz("b2", boost=True)]
    e = staffeln([klein(2.5)], lasten, REGELN)
    assert e.an == {"b1"} and e.wartet["b2"] == Warten.ANSCHLUSS_VOLL


def test_gleichstand_entscheidet_die_id():
    lasten = [hz("b"), hz("a"), hz("c")]
    e = staffeln([klein(2.5)], lasten, REGELN)
    assert e.an == {"a"}
    lasten = [hz("b", an=True, an_seit_min=3), hz("a", an=True, an_seit_min=3), sonst("kran", 1.0)]
    assert staffeln([klein(4.5)], lasten, REGELN).an == {"b"}


def test_unbekannter_anschluss_zaehlt_nicht_bei_max_gleichzeitig():
    lasten = [hz("x", anschluss="fehlt", an=True), hz("n", kw=1.0)]
    e = staffeln([klein(10)], lasten, StaffelRegeln(max_gleichzeitig=1))
    assert e.an == {"x", "n"}


def test_anlauf_folge_frost_boost_prio_id():
    lasten = [
        hz("d", prio=Prio.HOCH), hz("c"), hz("b", boost=True), hz("a", frost=True), hz("e", prio=Prio.HOCH),
        hz("f", boost=True, frost=True, prio=Prio.NIEDRIG),
    ]
    assert [l.id for l in anlauf_folge(lasten)] == ["f", "a", "b", "d", "e", "c"]


def test_rundlauf_nie_gegen_den_eigenen_container():
    """Szenario-Befund C: ein wartender Heizkörper tauscht nicht gegen einen Heizkörper desselben Containers."""
    a = klein(2.5)   # genau ein Heizkörper hat Platz
    haupt = hz("haupt", an=True, an_seit_min=40, gruppe="c1")
    zusatz = hz("zusatz", gruppe="c1", wartet_seit_min=20)
    e = staffeln([a], [haupt, zusatz], REGELN)
    assert "haupt" in e.an and "zusatz" not in e.an and e.wartet["zusatz"] == Warten.ANSCHLUSS_VOLL
    anderer = hz("anderer", an=True, an_seit_min=40, gruppe="c2")
    e = staffeln([a], [anderer, zusatz], REGELN)
    assert "zusatz" in e.an and "anderer" not in e.an   # gegen einen anderen Container darf getauscht werden


def test_last_kw_nach_messung():
    """FE-0011: ein laufender Heizer zählt mit dem, was er zieht – in den ersten Minuten und ohne Messung voll."""
    from logik.staffel import ANLAUF_MIN, last_kw
    assert last_kw(0.0, 2.0, True, 30) == 0.0              # Thermostat am Heizkörper hat abgeschaltet
    assert last_kw(1700.0, 2.0, True, 30) == 1.7
    assert last_kw(0.0, 2.0, True, ANLAUF_MIN - 1) == 2.0   # eben eingeschaltet: Messung kommt noch
    assert last_kw(2400.0, 2.0, True, 0) == 2.4
    assert last_kw(None, 2.0, True, 30) == 2.0              # ohne Leistungssensor
    assert last_kw(0.0, 2.0, False, 0) == 2.0               # will dazukommen: volle Leistung


def test_einer_je_container_zuerst():
    """AN-0013: Platz für zwei; der erste Heizer eines Containers kommt vor dem Zweitgerät eines anderen (auch bei
    kleinerem Defizit), ein Zweitgerät verdrängt nie den einzigen eines Containers, abgegeben wird ein Zweitgerät."""
    a = klein(4.0)
    # c1 hat zwei, c2 einen – c1 weit unter dem Soll
    erg = staffeln([a], [hz("c1_a", gruppe="c1", defizit=3.0), hz("c1_b", gruppe="c1", defizit=3.0), hz("c2_a", gruppe="c2", defizit=1.0)],
                   StaffelRegeln(neue_je_schritt=3))
    assert erg.an == {"c1_a", "c2_a"}
    # Zweitgerät wartet: kein Tausch gegen den einzigen von c2, auch nach dem Takt
    erg = staffeln([a], [hz("c1_a", an=True, gruppe="c1", an_seit_min=60), hz("c2_a", an=True, gruppe="c2", an_seit_min=60),
                         hz("c1_b", gruppe="c1", defizit=3.0, wartet_seit_min=60)], REGELN)
    assert erg.an == {"c1_a", "c2_a"} and erg.wartet["c1_b"] == "anschluss_voll"
    # laufen beide von c1, darf c2 als erster seines Containers tauschen – gegen ein Zweitgerät von c1
    erg = staffeln([a], [hz("c1_a", an=True, gruppe="c1", an_seit_min=60), hz("c1_b", an=True, gruppe="c1", an_seit_min=20),
                         hz("c2_a", gruppe="c2", defizit=0.5)], REGELN)
    assert "c2_a" in erg.an and len(erg.an & {"c1_a", "c1_b"}) == 1
    # Überlast: zuerst ein Zweitgerät abwerfen, nicht den einzigen von c2 (auch wenn der zuletzt kam)
    erg = staffeln([klein(4.0)], [hz("c1_a", an=True, gruppe="c1", an_seit_min=60), hz("c1_b", an=True, gruppe="c1", an_seit_min=30),
                                  hz("c2_a", an=True, gruppe="c2", an_seit_min=1)], REGELN)
    assert "c2_a" in erg.an and erg.wartet.get("c1_b") == "anschluss_voll"


@pytest.mark.parametrize(("will", "erreichbar", "laeuft", "grund", "erwartet"), [
    (True, True, False, Warten.ANSCHLUSS_VOLL, True),
    (True, True, False, Warten.RUNDLAUF, True),
    (True, True, False, Warten.ANLAUF, True),
    (True, True, False, Warten.MAX_GLEICHZEITIG, True),
    (True, True, False, Warten.MINDESTPAUSE, False),   # Mindestpause schützt das Gerät, ist kein Veto
    (True, True, True, None, False),
    (False, True, False, None, False),                 # TPI-aus: keine Anforderung, kein Veto
    (True, False, False, None, None),                  # offline mit Anforderung: entscheidet die Staffelung nicht
    (False, False, False, None, False),                # offline ohne Anforderung: kein Veto (Container nicht NULL)
])
def test_gesperrt_nur_echtes_veto(will, erreichbar, laeuft, grund, erwartet):
    """BSM-033.06: Staffelungs-Veto für die Prognose (nur beobachtet)."""
    assert gesperrt(will, erreichbar, laeuft, grund and str(grund)) is erwartet


def test_rangliste_mit_satten_heizkoerpern_im_plan():
    """AN-0017: Die Rangliste zeigt alle Heizkörper, die laut Plan gerade dran sind – auch satte (Thermostat), mit offener
    Tür oder zurückgehaltene Zusätze; getauscht wird nur, wer heizen will. Ein satter löst keinen Tausch aus."""
    lasten = [hz("polier", an=True, im_plan=True), hz("mann", will=False, im_plan=True, ruht="satt", defizit=-0.4),
              hz("lager", will=False, im_plan=True, ruht="tuer_offen"), hz("zusatz", will=False, im_plan=True, ruht="zurueckgehalten"),
              hz("weg", will=False)]                                                    # nicht im Plan: nicht dabei
    assert set(rangliste(lasten)) == {"polier", "mann", "lager", "zusatz"} and rangliste(lasten)[0] == "polier"
    r = staffeln([klein(2.5)], lasten, REGELN)   # Platz für genau einen: der satte will nicht – kein Tausch
    assert r.an == {"polier"} and r.wartet == {}
    a = rang_anzeige(lasten, r.wartet, REGELN.max_gleichzeitig)
    assert {z["id"]: z["text"] for z in a["zeilen"]} == {"polier": "heizt", "mann": "satt (Thermostat)", "lager": "Tür offen",
                                                         "zusatz": "Zusatz zurückgehalten"}
    assert a["kopf"] == "Anschluss hat Platz für alle – kein Tausch nötig"
    # will der satte wieder heizen und passt nicht dazu: wartet, Kopf „wird getauscht“
    voll = [lasten[0], hz("mann", im_plan=True, wartet_seit_min=20)]
    r2 = staffeln([klein(2.5)], voll, REGELN)
    a2 = rang_anzeige(voll, r2.wartet, REGELN.max_gleichzeitig)
    zust = {z["id"]: z["zustand"] for z in a2["zeilen"]}
    assert r2.wartet == {"polier": Warten.RUNDLAUF} and zust == {"polier": "heizt", "mann": "heizt"}   # Tausch: polier gibt ab, mann kommt
    assert a2["kopf"] == "Anschluss voll – wird getauscht"
    z3 = rang_anzeige([lasten[0], hz("mann", im_plan=True)], {"mann": Warten.ANSCHLUSS_VOLL}, 5)["zeilen"]
    assert {z["id"]: z["zustand"] for z in z3} == {"polier": "heizt", "mann": "wartet"}
    assert rang_anzeige(voll, {}, 5, an=False)["kopf"].startswith("Staffelung aus")
