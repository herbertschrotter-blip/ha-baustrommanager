"""Warnungen – Szenarien aus dem abgenommenen Mockup (mockups/quelle/glas-app.js, Bauplan 0.7 §2.4)."""

from datetime import datetime, timedelta

import pytest

from logik.warnungen import (
    Art,
    BaustellenZustand,
    ContainerZustand,
    GeraetZustand,
    Stufe,
    Typ,
    WarnEinstellungen,
    Warnung,
    baustelle_offline,
    behalte_seit,
    chip_text,
    gemeldet_merken,
    pruefe,
    sichtbar,
    stufe_von,
    titel,
    zu_melden,
)

JETZT = datetime(2026, 9, 30, 16, 20)
EINST = WarnEinstellungen()


def vor(minuten: float) -> datetime:
    return JETZT - timedelta(minutes=minuten)


def ok_geraet(**kw) -> GeraetZustand:
    """Ein erreichbares Gerät, damit die Baustelle nicht als Ganzes offline ist."""
    return GeraetZustand(id=kw.pop("id", "ok"), bereich=kw.pop("bereich", "polier"), leistung=0.0, **kw)


def zustand(*geraete, container=(), wetter=True) -> BaustellenZustand:
    return BaustellenZustand(geraete=(ok_geraet(), *geraete), container=tuple(container), wetter_vorhanden=wetter)


def arten(warnungen: list[Warnung]) -> list[str]:
    return [w.art for w in warnungen]


def nur(art: Art, z: BaustellenZustand, einst: WarnEinstellungen = EINST) -> list[Warnung]:
    return [w for w in pruefe(z, einst, JETZT) if w.art == art]


# --- jede Art einzeln -------------------------------------------------------------------------


def test_offline_erst_nach_offline_min():
    lager = GeraetZustand(id="g1", bereich="lager", erreichbar=False, offline_seit=vor(4))
    assert nur(Art.OFFLINE, zustand(lager)) == []
    lager = GeraetZustand(id="g1", bereich="lager", erreichbar=False, offline_seit=vor(5))
    (w,) = nur(Art.OFFLINE, zustand(lager))
    assert (w.stufe, w.bereich, w.geraet, w.seit, w.key) == ("stoerung", "lager", "g1", vor(5), "offline:lager:g1")
    assert titel(w) == "nicht erreichbar"
    assert nur(Art.OFFLINE, zustand(lager), WarnEinstellungen(offline_min=10)) == []


def test_offline_pumpe_ueber_pumpenlogik():
    p = GeraetZustand(id="p1", bereich="schacht", typ=Typ.PUMPE, erreichbar=False, offline_seit=vor(6))
    assert arten(pruefe(zustand(p), EINST, JETZT)) == ["offline"]


def test_baustelle_offline_statt_einzelner_geraete():
    z = BaustellenZustand(
        geraete=(
            GeraetZustand(id="g1", bereich="lager", erreichbar=False, offline_seit=vor(20)),
            GeraetZustand(id="g2", bereich="polier", erreichbar=False, offline_seit=vor(7)),
        )
    )
    (w,) = pruefe(z, EINST, JETZT)
    assert (w.art, w.stufe, w.bereich, w.seit, w.key) == ("baustelle_offline", "stoerung", None, vor(7), "baustelle_offline")
    # baustelle_offline noch nicht fällig (g2 erst 7 min weg): g1 bleibt einzeln gemeldet
    assert [w.key for w in pruefe(z, WarnEinstellungen(offline_min=10), JETZT)] == ["offline:lager:g1"]
    assert pruefe(z, WarnEinstellungen(offline_min=30), JETZT) == []


def test_trockenlauf_unter_trocken_unter_w():
    p = GeraetZustand(id="p1", bereich="schacht", typ=Typ.PUMPE, name="Pumpe 1", leistung=25.0, laeuft_seit=vor(2))
    (w,) = nur(Art.TROCKENLAUF, zustand(p))
    assert w.stufe == Stufe.STOERUNG and w.geraet == "p1"
    p_normal = GeraetZustand(id="p1", bereich="schacht", typ=Typ.PUMPE, leistung=600.0, laeuft_seit=vor(2))
    assert nur(Art.TROCKENLAUF, zustand(p_normal)) == []
    assert nur(Art.TROCKENLAUF, zustand(p), WarnEinstellungen(trocken_unter_w=20)) == []


def test_dauerlauf_nach_dauerlauf_min():
    p = GeraetZustand(id="p1", bereich="schacht", typ=Typ.PUMPE, name="Pumpe 1", leistung=600.0, laeuft_seit=vor(25))
    (w,) = nur(Art.DAUERLAUF, zustand(p))
    assert w.stufe == Stufe.STOERUNG
    assert titel(w) == "Pumpe 1 Dauerlauf 25 min"  # Protokoll-Beispiel im Mockup
    assert nur(Art.DAUERLAUF, zustand(p), WarnEinstellungen(dauerlauf_min=30)) == []


def test_zyklen_oft_ab_zyklen_h():
    p = GeraetZustand(id="p1", bereich="schacht", typ=Typ.PUMPE, leistung=0.0, zyklen_h=14)
    (w,) = nur(Art.ZYKLEN_OFT, zustand(p))
    assert w.stufe == Stufe.STOERUNG
    assert titel(w) == "Pumpe schaltet oft: 14 Zyklen je Stunde"
    assert nur(Art.ZYKLEN_OFT, zustand(p), WarnEinstellungen(zyklen_h=15)) == []
    p10 = GeraetZustand(id="p1", bereich="schacht", typ=Typ.PUMPE, leistung=0.0, zyklen_h=10)
    assert len(nur(Art.ZYKLEN_OFT, zustand(p10))) == 1  # „ab 10 je Stunde“


def test_keine_leistung_nur_mit_fuehler_und_unter_soll():
    h = GeraetZustand(id="h1", bereich="buero", name="Radiator", an=True, an_seit=vor(20), leistung=0.0)
    kalt = ContainerZustand(id="buero", temperatur=18.0, soll=20.0, fuehler=True)
    (w,) = nur(Art.KEINE_LEISTUNG, zustand(h, container=[kalt]))
    assert w.stufe == Stufe.STOERUNG and titel(w) == "Radiator zieht keinen Strom"
    ohne_fuehler = ContainerZustand(id="buero", soll=20.0)
    assert nur(Art.KEINE_LEISTUNG, zustand(h, container=[ohne_fuehler])) == []
    warm = ContainerZustand(id="buero", temperatur=20.5, soll=20.0, fuehler=True)
    assert nur(Art.KEINE_LEISTUNG, zustand(h, container=[warm])) == []
    zieht = GeraetZustand(id="h1", bereich="buero", an=True, an_seit=vor(5), leistung=1900.0)
    assert nur(Art.KEINE_LEISTUNG, zustand(zieht, container=[kalt])) == []
    gerade_an = GeraetZustand(id="h1", bereich="buero", an=True, an_seit=vor(1), leistung=0.0)
    assert nur(Art.KEINE_LEISTUNG, zustand(gerade_an, container=[kalt])) == []


def test_keine_leistung_pause_des_heizkoerper_thermostats():
    """004_C_MAN, 07.10.2026: der Radiator schaltet am eigenen Thermostat zeitweise ab (3–7 min 0 W) – das ist keine
    Störung; erst 15 min ohne Strom (ab dem späteren von „eingeschaltet“ und „Leistungswert gilt seit“) warnt."""
    kalt = ContainerZustand(id="buero", temperatur=18.0, soll=20.0, fuehler=True)
    pause = GeraetZustand(id="h1", bereich="buero", name="Radiator", an=True, an_seit=vor(60), leistung=0.0, leistung_seit=vor(7))
    assert nur(Art.KEINE_LEISTUNG, zustand(pause, container=[kalt])) == []
    defekt = GeraetZustand(id="h1", bereich="buero", name="Radiator", an=True, an_seit=vor(60), leistung=0.0, leistung_seit=vor(16))
    (w,) = nur(Art.KEINE_LEISTUNG, zustand(defekt, container=[kalt]))
    assert w.seit == vor(16)
    frisch_an = GeraetZustand(id="h1", bereich="buero", name="Radiator", an=True, an_seit=vor(10), leistung=0.0, leistung_seit=vor(120))
    assert nur(Art.KEINE_LEISTUNG, zustand(frisch_an, container=[kalt])) == []   # erst 10 min an


def test_frostgefahr_unter_frost_grenze():
    sanitaer = ContainerZustand(id="sanitaer", temperatur=4.2, fuehler=True)
    (w,) = nur(Art.FROSTGEFAHR, zustand(container=[sanitaer]))
    assert w.stufe == Stufe.STOERUNG and titel(w) == "Frostgefahr: 4,2 °C"
    assert nur(Art.FROSTGEFAHR, zustand(container=[sanitaer]), WarnEinstellungen(frost_grenze=4.0)) == []
    assert nur(Art.FROSTGEFAHR, zustand(container=[sanitaer]), WarnEinstellungen(frost=False)) == []


def test_zu_kalt_in_arbeitszeit_nach_kalt_min():
    def mannschaft(minuten, arbeitszeit=True, t=17.8):
        return ContainerZustand(
            id="mannschaft", temperatur=t, soll=20.0, fuehler=True, in_arbeitszeit=arbeitszeit, unter_soll_seit=vor(minuten)
        )

    (w,) = nur(Art.ZU_KALT, zustand(container=[mannschaft(60)]))
    assert w.stufe == Stufe.HINWEIS and w.seit == vor(60)
    assert titel(w) == "zu kalt: 17,8 °C statt 20 °C"
    assert nur(Art.ZU_KALT, zustand(container=[mannschaft(59)])) == []
    assert nur(Art.ZU_KALT, zustand(container=[mannschaft(90, arbeitszeit=False)])) == []
    assert nur(Art.ZU_KALT, zustand(container=[mannschaft(90, t=19.2)])) == []  # nur unter Soll − 1 °C
    assert len(nur(Art.ZU_KALT, zustand(container=[mannschaft(30)]), WarnEinstellungen(kalt_min=30))) == 1


def test_fuehler_fehlt_ohne_messwert_oder_batterie_schwach():
    (w,) = nur(Art.FUEHLER_FEHLT, zustand(container=[ContainerZustand(id="polier", fuehler=True)]))
    assert w.stufe == Stufe.HINWEIS and titel(w) == "Fühler meldet nichts"
    schwach = ContainerZustand(id="polier", fuehler=True, temperatur=19.0, batterie=8)
    (w,) = nur(Art.FUEHLER_FEHLT, zustand(container=[schwach]))
    assert titel(w) == "Fühler-Batterie schwach: 8 %"
    assert nur(Art.FUEHLER_FEHLT, zustand(container=[ContainerZustand(id="lager")])) == []  # ohne Fühler
    # Grenze = Stufe „kritisch“ aus logik/sensoren (< 10 %); „schwach“ (< 25 %) zeigt nur die Seite, keine Warnung
    for prozent, warnt in ((10, False), (9.9, True), (20, False)):
        c = ContainerZustand(id="polier", fuehler=True, temperatur=19.0, batterie=prozent,
                             batterien=(("Tür 1", "binary_sensor.t1", prozent),))
        assert len(nur(Art.FUEHLER_FEHLT, zustand(container=[c]))) == (2 if warnt else 0), prozent


def test_batterie_jedes_sensors():
    """BSM-034.03: Türen, Fenster, Licht bekommen je eine eigene Warnung bei schwacher Batterie."""
    c = ContainerZustand(id="polier", batterien=(("Tür 1", "binary_sensor.t1", 5), ("Fenster 2", "binary_sensor.f2", 50),
                                                ("Tür 2", "binary_sensor.t2", None)))
    (w,) = nur(Art.FUEHLER_FEHLT, zustand(container=[c]))
    assert titel(w) == "Tür 1: Batterie schwach, 5 %" and w.key == "fuehler_fehlt:polier:binary_sensor.t1"


def test_kein_wetter():
    (w,) = nur(Art.KEIN_WETTER, zustand(wetter=False))
    assert (w.stufe, w.bereich, w.key) == ("hinweis", None, "kein_wetter")
    assert nur(Art.KEIN_WETTER, zustand()) == []


def test_hand_zu_lange_ueber_hand_h():
    seit = JETZT - timedelta(days=3, hours=2)
    g = GeraetZustand(id="s1", bereich="magazin", name="Steckdose", hand_seit=seit)
    (w,) = nur(Art.HAND_ZU_LANGE, zustand(g))
    assert w.stufe == Stufe.HINWEIS and w.seit == seit
    assert titel(w) == "Steckdose seit 3 Tagen auf Hand"
    genau_8h = GeraetZustand(id="s1", bereich="magazin", hand_seit=vor(8 * 60))
    assert nur(Art.HAND_ZU_LANGE, zustand(genau_8h)) == []  # „länger als“
    assert len(nur(Art.HAND_ZU_LANGE, zustand(genau_8h), WarnEinstellungen(hand_h=7))) == 1


def test_tuer_offen_ab_pause_nachricht_ab_melden():
    def magazin(minuten):
        return ContainerZustand(id="magazin", tuer_offen_seit=vor(minuten))

    assert nur(Art.TUER_OFFEN, zustand(container=[magazin(2)])) == []
    (w,) = nur(Art.TUER_OFFEN, zustand(container=[magazin(6)]))
    assert w.stufe == Stufe.HINWEIS and w.werte["nachricht"] is False
    assert titel(w) == "Tür seit 6 min offen – Heizung pausiert"
    (w,) = nur(Art.TUER_OFFEN, zustand(container=[magazin(10)]))
    assert w.werte["nachricht"] is True


@pytest.mark.parametrize(
    ("art", "stufe"),
    [
        (Art.OFFLINE, "stoerung"),
        (Art.BAUSTELLE_OFFLINE, "stoerung"),
        (Art.TROCKENLAUF, "stoerung"),
        (Art.DAUERLAUF, "stoerung"),
        (Art.ZYKLEN_OFT, "stoerung"),
        (Art.KEINE_LEISTUNG, "stoerung"),
        (Art.FROSTGEFAHR, "stoerung"),
        (Art.ZU_KALT, "hinweis"),
        (Art.FUEHLER_FEHLT, "hinweis"),
        (Art.KEIN_WETTER, "hinweis"),
        (Art.HAND_ZU_LANGE, "hinweis"),
        (Art.TUER_OFFEN, "hinweis"),
    ],
)
def test_stufe_je_art(art, stufe):
    assert stufe_von(art) == stufe


# --- Mockup-Lage und Einstellungen -------------------------------------------------------------


def mockup_zustand() -> BaustellenZustand:
    """Die offenen Warnungen aus dem Mockup (w1–w6)."""
    return BaustellenZustand(
        geraete=(
            GeraetZustand(id="polier-1", bereich="polier", an=True, an_seit=vor(120), leistung=1950.0),
            GeraetZustand(id="lager-1", bereich="lager", erreichbar=False, offline_seit=vor(338)),
            GeraetZustand(id="magazin-2", bereich="magazin", name="Steckdose", hand_seit=JETZT - timedelta(days=3)),
            GeraetZustand(id="schacht-1", bereich="schacht", typ=Typ.PUMPE, leistung=0.0, zyklen_h=14),
        ),
        container=(
            ContainerZustand(id="polier", temperatur=19.4, soll=20.0, fuehler=True, in_arbeitszeit=True),
            ContainerZustand(
                id="mannschaft", temperatur=17.8, soll=20.0, fuehler=True, in_arbeitszeit=True, unter_soll_seit=vor(560)
            ),
            ContainerZustand(id="magazin", tuer_offen_seit=vor(6)),
            ContainerZustand(id="sanitaer", temperatur=4.2, fuehler=True),
        ),
    )


def test_mockup_lage_stoerungen_zuerst():
    w = pruefe(mockup_zustand(), EINST, JETZT)
    assert arten(w) == ["offline", "zyklen_oft", "frostgefahr", "hand_zu_lange", "zu_kalt", "tuer_offen"]
    assert [x.stufe for x in w] == ["stoerung"] * 3 + ["hinweis"] * 3


def test_arten_per_einstellung_abschaltbar():
    alle = [a.value for a in Art]
    aus = WarnEinstellungen(arten={a: False for a in alle})
    assert pruefe(mockup_zustand(), aus, JETZT) == []
    for art in ["offline", "zyklen_oft", "frostgefahr", "hand_zu_lange", "zu_kalt", "tuer_offen"]:
        einst = WarnEinstellungen(arten={art: False})
        assert art not in arten(pruefe(mockup_zustand(), einst, JETZT))
        assert len(pruefe(mockup_zustand(), einst, JETZT)) == 5


def test_offline_schalter_gilt_auch_fuer_baustelle_offline():
    z = BaustellenZustand(geraete=(GeraetZustand(id="g1", bereich="lager", erreichbar=False, offline_seit=vor(20)),))
    assert pruefe(z, WarnEinstellungen(arten={"offline": False}), JETZT) == []
    assert arten(pruefe(z, WarnEinstellungen(arten={"offline": True}), JETZT)) == ["baustelle_offline"]


def test_einstellungen_aus_store():
    einst = WarnEinstellungen.aus_store(
        {"empfaenger": [], "knoepfe": True, "arten": {"zu_kalt": False}, "kalt_min": 45, "hand_h": 6,
         "zyklen_h": 12, "dauerlauf_min": 25, "trocken_unter_w": 40, "offline_min": 3},
        {"frost": True, "frost_grenze": 4.0, "tuer_pause_min": 2, "tuer_melden_min": 15},
    )
    assert (einst.kalt_min, einst.hand_h, einst.zyklen_h, einst.dauerlauf_min) == (45, 6, 12, 25)
    assert (einst.trocken_unter_w, einst.offline_min, einst.frost_grenze) == (40, 3, 4.0)
    assert (einst.tuer_pause_min, einst.tuer_melden_min) == (2, 15)
    assert not einst.aktiv("zu_kalt") and einst.aktiv("offline")
    assert WarnEinstellungen.aus_store({}, {}) == WarnEinstellungen()


# --- zu_melden --------------------------------------------------------------------------------


def test_stoerung_einmal_je_problem():
    neu = pruefe(mockup_zustand(), EINST, JETZT)
    gemeldet = zu_melden(neu, set(), {}, JETZT)
    # Störungen und (Bauplan §5) die Steckdose, die seit 3 Tagen auf Hand ist
    assert arten(gemeldet) == ["offline", "zyklen_oft", "frostgefahr", "hand_zu_lange"]
    bisher = gemeldet_merken(neu, set(), gemeldet)
    assert zu_melden(neu, bisher, {}, JETZT + timedelta(minutes=1)) == []


def test_hinweis_ohne_nachricht():
    z = zustand(
        GeraetZustand(id="s1", bereich="magazin", hand_seit=vor(10 * 60)),
        container=[
            ContainerZustand(id="polier", fuehler=True),
            ContainerZustand(
                id="mannschaft", temperatur=17.0, soll=20.0, fuehler=True, in_arbeitszeit=True, unter_soll_seit=vor(90)
            ),
        ],
        wetter=False,
    )
    neu = pruefe(z, EINST, JETZT)
    assert sorted(arten(neu)) == ["fuehler_fehlt", "hand_zu_lange", "kein_wetter", "zu_kalt"]
    # Bauplan §5: nur langer Handbetrieb kommt aufs Handy, die übrigen Hinweise nicht
    assert arten(zu_melden(neu, set(), {}, JETZT)) == ["hand_zu_lange"]


def test_hand_zu_lange_nachricht_einmal():
    neu = pruefe(zustand(GeraetZustand(id="s1", bereich="magazin", hand_seit=vor(9 * 60))), EINST, JETZT)
    gemeldet = zu_melden(neu, set(), {}, JETZT)
    assert arten(gemeldet) == ["hand_zu_lange"]
    bisher = gemeldet_merken(neu, set(), gemeldet)
    assert zu_melden(neu, bisher, {}, JETZT) == []
    kurz = pruefe(zustand(GeraetZustand(id="s1", bereich="magazin", hand_seit=vor(60))), EINST, JETZT)
    assert zu_melden(kurz, set(), {}, JETZT) == []


def test_tuer_nachricht_erst_nach_tuer_melden_min():
    def lauf(minuten, bisher):
        neu = pruefe(zustand(container=[ContainerZustand(id="magazin", tuer_offen_seit=vor(minuten))]), EINST, JETZT)
        gemeldet = zu_melden(neu, bisher, {}, JETZT)
        return gemeldet, gemeldet_merken(neu, bisher, gemeldet)

    gemeldet, bisher = lauf(6, set())
    assert gemeldet == [] and bisher == set()
    gemeldet, bisher = lauf(10, bisher)
    assert arten(gemeldet) == ["tuer_offen"] and bisher == {"tuer_offen:magazin"}
    gemeldet, bisher = lauf(15, bisher)
    assert gemeldet == []


def test_stumm_unterdrueckt_nachricht_bis_zeitpunkt():
    neu = pruefe(mockup_zustand(), EINST, JETZT)
    stumm = {"offline:lager:lager-1": datetime(2026, 10, 1, 7, 0)}
    gemeldet = zu_melden(neu, set(), stumm, JETZT)
    assert "offline" not in arten(gemeldet)
    bisher = gemeldet_merken(neu, set(), gemeldet)
    # stumm bleibt im Protokoll (pruefe) …
    assert "offline" in arten(neu)
    # … aber nicht im Chip und nicht in „offen“
    assert "offline" not in arten(sichtbar(neu, stumm, JETZT))
    # nach Ablauf wird gemeldet, wenn das Problem noch besteht
    spaeter = datetime(2026, 10, 1, 7, 0)
    assert arten(zu_melden(neu, bisher, stumm, spaeter)) == ["offline"]


def test_erneute_meldung_wenn_problem_weg_und_wieder_da():
    lager_aus = zustand(GeraetZustand(id="g1", bereich="lager", erreichbar=False, offline_seit=vor(10)))
    lager_an = zustand(GeraetZustand(id="g1", bereich="lager"))
    neu = pruefe(lager_aus, EINST, JETZT)
    gemeldet = zu_melden(neu, set(), {}, JETZT)
    bisher = gemeldet_merken(neu, set(), gemeldet)
    assert bisher == {"offline:lager:g1"}
    neu = pruefe(lager_an, EINST, JETZT)
    bisher = gemeldet_merken(neu, bisher, zu_melden(neu, bisher, {}, JETZT))
    assert bisher == set()
    neu = pruefe(lager_aus, EINST, JETZT)
    assert arten(zu_melden(neu, bisher, {}, JETZT)) == ["offline"]


def test_behalte_seit_uebernimmt_beginn():
    alt = pruefe(zustand(wetter=False), EINST, vor(30))
    neu = pruefe(zustand(wetter=False), EINST, JETZT)
    assert neu[0].seit == JETZT
    assert behalte_seit(neu, alt)[0].seit == vor(30)


# --- Chip ------------------------------------------------------------------------------------


NAMEN = {"lager": "Lager Süd", "mannschaft": "Mannschaft", "sanitaer": "Sanitär", "magazin": "Magazin",
         "schacht": "Pumpenschacht Nord"}


def test_chip_mehrere_stoerungen_und_hinweise():
    neu = pruefe(mockup_zustand(), EINST, JETZT)
    assert chip_text(neu, {}, JETZT, NAMEN) == "⚠ 3 Störungen · 3 Hinweise"
    stumm = {w.key: JETZT + timedelta(hours=12) for w in neu if w.stufe == Stufe.STOERUNG and w.art != "offline"}
    assert chip_text(neu, stumm, JETZT, NAMEN) == "⚠ 1 Störung · 3 Hinweise"


def test_chip_eine_warnung_mit_containername():
    lager = zustand(GeraetZustand(id="g1", bereich="lager", erreichbar=False, offline_seit=vor(10)))
    assert chip_text(pruefe(lager, EINST, JETZT), {}, JETZT, NAMEN) == "⚠ Lager Süd: nicht erreichbar"
    wetter = pruefe(zustand(wetter=False), EINST, JETZT)
    assert chip_text(wetter, {}, JETZT, NAMEN) == "⚠ Baustelle: keine Wettervorhersage"
    assert chip_text([], {}, JETZT, NAMEN) is None
    assert chip_text(wetter, {"kein_wetter": JETZT + timedelta(hours=1)}, JETZT, NAMEN) is None


# --- Grenzfälle (Prüfung) ----------------------------------------------------------------------


def test_leere_baustelle_ohne_warnungen():
    assert pruefe(BaustellenZustand(), EINST, JETZT) == []
    assert zu_melden([], set(), {}, JETZT) == []
    assert gemeldet_merken([], {"offline:lager:g1"}, []) == set()


def test_geraete_offline_bleiben_bis_baustelle_offline_gilt():
    """Zweites Gerät fällt gerade aus: das schon gemeldete erste darf nicht kurz verschwinden."""
    g1 = GeraetZustand(id="g1", bereich="lager", erreichbar=False, offline_seit=vor(30))
    g2 = GeraetZustand(id="g2", bereich="polier", erreichbar=False, offline_seit=vor(1))
    assert [w.key for w in pruefe(BaustellenZustand(geraete=(g1, g2)), EINST, JETZT)] == ["offline:lager:g1"]
    spaeter = JETZT + timedelta(minutes=4)
    assert [w.key for w in pruefe(BaustellenZustand(geraete=(g1, g2)), EINST, spaeter)] == ["baustelle_offline"]


def test_baustelle_offline_einzeln_abgeschaltet_zeigt_geraete():
    z = BaustellenZustand(geraete=(GeraetZustand(id="g1", bereich="lager", erreichbar=False, offline_seit=vor(20)),))
    assert [w.key for w in pruefe(z, WarnEinstellungen(arten={"baustelle_offline": False}), JETZT)] == [
        "offline:lager:g1"
    ]


def test_offline_titel_mit_geraetename_nur_bei_mehreren_geraeten():
    allein = GeraetZustand(id="g1", bereich="lager", name="Radiator", erreichbar=False, offline_seit=vor(10))
    (w,) = nur(Art.OFFLINE, zustand(allein))
    assert chip_text([w], {}, JETZT, NAMEN) == "⚠ Lager Süd: nicht erreichbar"  # wie im Mockup
    zweiter = GeraetZustand(id="g2", bereich="lager", name="Steckdose")
    (w,) = nur(Art.OFFLINE, zustand(allein, zweiter))
    assert titel(w) == "Radiator nicht erreichbar"


def test_keine_leistung_ohne_messwert_keine_warnung():
    h = GeraetZustand(id="h1", bereich="buero", an=True, an_seit=vor(5), leistung=None)
    kalt = ContainerZustand(id="buero", temperatur=18.0, soll=20.0, fuehler=True)
    assert nur(Art.KEINE_LEISTUNG, zustand(h, container=[kalt])) == []


def test_ueber_mitternacht():
    mitternacht = datetime(2026, 10, 1, 0, 5)
    g = GeraetZustand(id="s1", bereich="magazin", name="Steckdose", hand_seit=datetime(2026, 9, 30, 16, 0))
    tuer = ContainerZustand(id="magazin", tuer_offen_seit=datetime(2026, 9, 30, 23, 58))
    lager = GeraetZustand(id="g1", bereich="lager", erreichbar=False, offline_seit=datetime(2026, 9, 30, 23, 59))
    w = {x.art: x for x in pruefe(zustand(g, lager, container=[tuer]), EINST, mitternacht)}
    assert titel(w["hand_zu_lange"]) == "Steckdose seit 8 h auf Hand"
    assert w["tuer_offen"].werte == {"minuten": 7, "nachricht": False, "pausiert": True}
    assert w["offline"].seit == datetime(2026, 9, 30, 23, 59)


def test_stumm_endet_genau_zum_zeitpunkt():
    neu = pruefe(zustand(wetter=False, container=[ContainerZustand(id="sanitaer", temperatur=4.0, fuehler=True)]),
                 EINST, JETZT)
    bis = JETZT + timedelta(hours=1)
    stumm = {"frostgefahr:sanitaer": bis}
    assert zu_melden(neu, set(), stumm, bis - timedelta(seconds=1)) == []
    assert arten(zu_melden(neu, set(), stumm, bis)) == ["frostgefahr"]


def test_stumm_waehrend_gemeldeter_stoerung_keine_neue_nachricht():
    neu = pruefe(zustand(container=[ContainerZustand(id="sanitaer", temperatur=4.0, fuehler=True)]), EINST, JETZT)
    bisher = gemeldet_merken(neu, set(), zu_melden(neu, set(), {}, JETZT))
    stumm = {"frostgefahr:sanitaer": JETZT + timedelta(hours=1)}
    bisher = gemeldet_merken(neu, bisher, zu_melden(neu, bisher, stumm, JETZT))
    assert zu_melden(neu, bisher, stumm, JETZT + timedelta(hours=2)) == []


def test_rundung_wie_mockup():
    w = Warnung("k", "frostgefahr", "stoerung", "sanitaer", None, JETZT, {"temperatur": 4.25})
    assert titel(w) == "Frostgefahr: 4,3 °C"  # toLocaleString rundet kaufmännisch
    w = Warnung("k", "zu_kalt", "hinweis", "m", None, JETZT, {"temperatur": -0.05, "soll": 20.5})
    assert titel(w) == "zu kalt: -0,1 °C statt 20,5 °C"


def test_aus_store_null_werte_gelten_als_standard():
    einst = WarnEinstellungen.aus_store({"arten": None, "kalt_min": None}, {"frost_grenze": None})
    assert einst == WarnEinstellungen()


def test_baustelle_offline():
    # Regel steht bei den Warnungen (allgemein), nicht bei den Pumpen – der Kern nutzt sie für „erreichbar“
    assert baustelle_offline([False, False, False])
    assert not baustelle_offline([False, True])
    assert not baustelle_offline([])


def test_warnungen_nach_modus():
    """Szenarien (Herbert 01.10.2026): „zieht keinen Strom“ und „zu kalt“ nur, wenn der Container auf das Soll regelt
    (Thermostat, Bei Bedarf); „auf Hand“ nicht im Modus Hand."""
    h = GeraetZustand(id="h1", bereich="buero", name="Radiator", an=True, an_seit=vor(20), leistung=0.0)
    for modus, erwartet in (("thermo", 1), ("bedarf", 1), ("plan", 0), ("hand", 0), ("", 1)):
        c = ContainerZustand(id="buero", temperatur=18.0, soll=20.0, fuehler=True, modus=modus)
        assert len(nur(Art.KEINE_LEISTUNG, zustand(h, container=[c]))) == erwartet, modus
    kalt = dict(id="buero", temperatur=18.0, soll=20.0, fuehler=True, in_arbeitszeit=True, unter_soll_seit=vor(120))
    assert len(nur(Art.ZU_KALT, zustand(container=[ContainerZustand(**kalt, modus="thermo")]))) == 1
    assert nur(Art.ZU_KALT, zustand(container=[ContainerZustand(**kalt, modus="plan")])) == []
    g = GeraetZustand(id="s1", bereich="magazin", name="Steckdose", hand_seit=vor(9 * 60))
    assert len(nur(Art.HAND_ZU_LANGE, zustand(g, container=[ContainerZustand(id="magazin", modus="plan")]))) == 1
    assert nur(Art.HAND_ZU_LANGE, zustand(g, container=[ContainerZustand(id="magazin", modus="hand")])) == []


def test_erinnern_nach_stumm():
    """Szenarien: läuft „stumm“ ab und besteht das Problem noch, kommt die Nachricht noch einmal."""
    from logik.warnungen import erinnern
    tuer = Warnung(key="tuer_offen:polier", art=Art.TUER_OFFEN, stufe=Stufe.HINWEIS, bereich="polier", geraet=None, seit=vor(70))
    assert erinnern({"tuer_offen:polier", "x"}, ["tuer_offen:polier"], [tuer]) == {"x"}
    assert erinnern({"tuer_offen:polier"}, [], [tuer]) == {"tuer_offen:polier"}
    assert erinnern({"tuer_offen:polier"}, ["tuer_offen:polier"], []) == {"tuer_offen:polier"}   # Problem weg: nichts


def test_selbst_ein():
    """FE-0010: musste die Automatik ein Gerät in 10 min mindestens 3-mal ausschalten, schaltet es sich selbst ein."""
    from logik.warnungen import selbst_ein_seit
    assert selbst_ein_seit([vor(9), vor(5), vor(1)], JETZT) == vor(9)
    assert selbst_ein_seit([vor(12), vor(5), vor(1)], JETZT) is None      # einer zu alt
    assert selbst_ein_seit([vor(2), vor(1)], JETZT) is None
    g = GeraetZustand(id="h2", bereich="polier", name="Heizung 02", selbst_ein_seit=vor(9))
    (w,) = nur(Art.SELBST_EIN, zustand(g))
    assert w.stufe == Stufe.STOERUNG and titel(w) == "Heizung 02 schaltet sich selbst wieder ein"
    assert nur(Art.SELBST_EIN, zustand(GeraetZustand(id="h2", bereich="polier", erreichbar=False, selbst_ein_seit=vor(9)))) == []


def test_notprogramm():
    """BSM-019: Plug nimmt das Notprogramm nicht an – Hinweis erst nach 15 min (eine Runde darf scheitern)."""
    g = GeraetZustand(id="h2", bereich="polier", name="001-02_C_PLUG_POL", notprogramm_seit=vor(16), notprogramm_fehler="Passwort gesetzt")
    (w,) = nur(Art.NOTPROGRAMM, zustand(g))
    assert w.stufe == Stufe.HINWEIS and titel(w) == "001-02_C_PLUG_POL: Notprogramm nicht bereit (Passwort gesetzt)"
    assert nur(Art.NOTPROGRAMM, zustand(GeraetZustand(id="h2", bereich="polier", notprogramm_seit=vor(10)))) == []
    assert nur(Art.NOTPROGRAMM, zustand(GeraetZustand(id="h2", bereich="polier", erreichbar=False, offline_seit=vor(20),
                                                      notprogramm_seit=vor(16)))) == []   # offline meldet schon „nicht erreichbar“
