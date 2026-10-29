"""Arbeitszeit und Tagesplan – Beispielzahlen aus dem abgenommenen Mockup (mockups/quelle/glas-app.js)."""

from datetime import date, datetime

import pytest

from logik.arbeitszeit import (
    Abschnitt,
    Arbeitszeit,
    Ausnahme,
    AusnahmeArt,
    HeizRegeln,
    Plan,
    PlanGrund,
    WarmAb,
    StatusArt,
    WetterTag,
    arbeit_am,
    bedarf_fenster,
    frei_gilt,
    gueltige_arbeitszeit,
    im_fenster,
    minuten,
    status,
    tagesplan,
    uhrzeit,
)


def t(hh: int, mm: int = 0) -> int:
    return hh * 60 + mm


def az(ab: str, name: str, mo_do: tuple[int, int], fr: tuple[int, int]) -> Arbeitszeit:
    return Arbeitszeit(ab=date.fromisoformat(ab), name=name, tage={0: mo_do, 1: mo_do, 2: mo_do, 3: mo_do, 4: fr, 5: None, 6: None})


# wie Mockup daten().arbeitszeiten
LISTE = [
    az("2025-11-03", "Winter 2025/26", (t(7, 30), t(16, 30)), (t(7, 30), t(12))),
    az("2026-03-30", "Sommer 2026", (t(6, 30), t(16)), (t(6, 30), t(12))),
    az("2026-09-28", "Herbst 2026", (t(7), t(16, 30)), (t(7), t(12, 30))),
    az("2026-11-02", "Winter 2026/27", (t(7, 30), t(16, 30)), (t(7, 30), t(12))),
]
DI = date(2026, 9, 29)  # HEUTE im Mockup
MI = date(2026, 9, 30)
SA = date(2026, 10, 3)
REGELN = HeizRegeln()  # Vorheizen 45, Nachheizen 15, Trocknen 45/15 ab 2 mm, Frühstart 30 min unter 0 °C
OHNE = WetterTag()


def test_minuten_und_uhrzeit():
    assert minuten("07:30") == 450
    assert uhrzeit(t(6, 15)) == "06:15"


def test_gueltige_arbeitszeit_nach_startdatum():
    assert gueltige_arbeitszeit(LISTE, DI).name == "Herbst 2026"
    assert gueltige_arbeitszeit(LISTE, date(2026, 9, 27)).name == "Sommer 2026"  # alte bleibt bis zum Vortag
    assert gueltige_arbeitszeit(LISTE, date(2026, 11, 1)).name == "Herbst 2026"  # künftige gilt erst ab Datum
    assert gueltige_arbeitszeit(LISTE, date(2026, 11, 2)).name == "Winter 2026/27"
    assert gueltige_arbeitszeit(LISTE, date(2025, 1, 1)) is None
    # Reihenfolge der Liste egal
    assert gueltige_arbeitszeit(list(reversed(LISTE)), DI).name == "Herbst 2026"


def test_arbeit_am_wochentage():
    assert arbeit_am(LISTE, [], DI) == (t(7), t(16, 30))
    assert arbeit_am(LISTE, [], date(2026, 10, 2)) == (t(7), t(12, 30))  # Freitag
    assert arbeit_am(LISTE, [], SA) is None
    assert arbeit_am(LISTE, [], date(2026, 11, 3)) == (t(7, 30), t(16, 30))  # Winter


def test_ausnahme_vor_arbeitszeit():
    kran = Ausnahme(MI, "zeiten", t(7), t(18), "Kranmontage – länger")
    samstag = Ausnahme(SA, "arbeit", t(7), t(12), "Samstag betonieren")
    frei = Ausnahme(DI, "frei")
    ausnahmen = [kran, samstag, frei]
    assert arbeit_am(LISTE, ausnahmen, MI) == (t(7), t(18))
    assert arbeit_am(LISTE, ausnahmen, SA) == (t(7), t(12))
    assert arbeit_am(LISTE, ausnahmen, DI) is None
    assert tagesplan(DI, LISTE, ausnahmen, REGELN, OHNE, trocknen=False) is None
    p = tagesplan(SA, LISTE, ausnahmen, REGELN, OHNE, trocknen=False)
    assert (p.start, p.ende, p.ausnahme, p.gruende) == (t(6, 15), t(12, 15), samstag, (PlanGrund.AUSNAHME,))


def test_ausnahme_aus_store():
    a = Ausnahme.aus_store({"datum": "2026-10-03", "art": "arbeit", "von": "07:00", "bis": "12:00", "notiz": "x"})
    assert a == Ausnahme(SA, "arbeit", t(7), t(12), "x")
    f = Ausnahme.aus_store({"datum": "2026-10-03", "art": "frei", "von": None, "bis": None})
    assert (f.art, f.von, f.bis) == ("frei", 0, 0)
    z = Arbeitszeit.aus_store({"ab": "2026-10-05", "name": "Herbst", "tage": {"0": ["07:00", "16:30"], "5": None}})
    assert z.tage == {0: (t(7), t(16, 30)), 5: None} and z.ab == date(2026, 10, 5)


def test_vor_und_nachheizen():
    p = tagesplan(DI, LISTE, [], REGELN, OHNE, trocknen=False)
    assert (p.start, p.vor, p.a, p.b, p.nach, p.ende) == (t(6, 15), t(6, 15), t(7), t(16, 30), t(16, 45), t(16, 45))
    assert p.gruende == () and p.ausnahme is None


def test_mockup_beispiel_0615_bis_1730():
    # Dienstag 6 mm Regen: Kleidung trocknen 45 min nach dem Nachheizen → 06:15–17:30
    p = tagesplan(DI, LISTE, [], REGELN, WetterTag(regen_heute_mm=6), trocknen=True)
    assert (p.start, p.ende) == (t(6, 15), t(17, 30))
    assert p.gruende == (PlanGrund.TROCKNEN,)
    assert p.abschnitte() == [
        (t(6, 15), t(7), Abschnitt.VORHEIZEN),
        (t(7), t(16, 30), Abschnitt.ARBEITSZEIT),
        (t(16, 30), t(16, 45), Abschnitt.NACHHEIZEN),
        (t(16, 45), t(17, 30), Abschnitt.TROCKNEN),
    ]


def test_trocknen_nur_mit_schalter():
    p = tagesplan(DI, LISTE, [], REGELN, WetterTag(regen_heute_mm=6), trocknen=False)
    assert p.ende == t(16, 45) and p.gruende == ()
    wenig = tagesplan(DI, LISTE, [], REGELN, WetterTag(regen_heute_mm=1.9), trocknen=True)
    assert wenig.ende == t(16, 45)
    genau = tagesplan(DI, LISTE, [], REGELN, WetterTag(regen_heute_mm=2.0), trocknen=True)
    assert genau.ende == t(17, 30)


def test_fruehstart_bei_kaelte():
    p = tagesplan(MI, LISTE, [], REGELN, WetterTag(frueh_min_temp=-1.2), trocknen=False)
    assert (p.start, p.vor) == (t(5, 45), t(6, 15))
    assert p.gruende == (PlanGrund.FRUEHSTART,)
    assert p.abschnitt(t(5, 50)) is Abschnitt.FRUEHSTART
    # nicht unter der Schwelle, ausgeschaltet oder ohne Wert → kein Frühstart
    assert tagesplan(MI, LISTE, [], REGELN, WetterTag(frueh_min_temp=0.0), trocknen=False).start == t(6, 15)
    aus = HeizRegeln(fruehstart=False)
    assert tagesplan(MI, LISTE, [], aus, WetterTag(frueh_min_temp=-5), trocknen=False).start == t(6, 15)
    assert tagesplan(MI, LISTE, [], REGELN, OHNE, trocknen=False).start == t(6, 15)


def test_frueher_nach_regen_am_vortag():
    # Mockup Mittwoch: −1,2 °C und 6 mm am Vortag → 30 + 15 min vor dem Vorheizen
    wetter = WetterTag(frueh_min_temp=-1.2, regen_vortag_mm=6)
    p = tagesplan(MI, LISTE, [], REGELN, wetter, trocknen=True)
    assert p.start == t(6, 15) - 45
    assert p.gruende == (PlanGrund.FRUEHSTART, PlanGrund.FRUEHER_NACH_REGEN)
    ohne = tagesplan(MI, LISTE, [], REGELN, wetter, trocknen=False)
    assert ohne.start == t(5, 45) and PlanGrund.FRUEHER_NACH_REGEN not in ohne.gruende


def test_feiertag_und_urlaub_frei():
    assert tagesplan(DI, LISTE, [], REGELN, OHNE, trocknen=False, frei=True) is None
    # ausdrücklich eingetragene Arbeit geht vor
    extra = [Ausnahme(DI, "arbeit", t(8), t(12))]
    p = tagesplan(DI, LISTE, extra, REGELN, OHNE, trocknen=False, frei=True)
    assert (p.a, p.b) == (t(8), t(12))


def test_ausnahme_mit_wetter():
    kran = [Ausnahme(MI, "zeiten", t(7), t(18), "Kranmontage – länger")]
    p = tagesplan(MI, LISTE, kran, REGELN, WetterTag(frueh_min_temp=-1.2), trocknen=False)
    assert (p.start, p.nach) == (t(5, 45), t(18, 15))
    assert p.gruende == (PlanGrund.AUSNAHME, PlanGrund.FRUEHSTART)


def test_grenzen_des_tages():
    frueh = [Ausnahme(DI, "zeiten", t(0, 30), t(23, 50))]
    p = tagesplan(DI, LISTE, frueh, REGELN, WetterTag(regen_heute_mm=5), trocknen=True)
    assert (p.start, p.ende) == (0, 24 * 60)


def test_bedarf_fenster_mit_vorheizen():
    termine = [
        (datetime(2026, 10, 2, 13), datetime(2026, 10, 2, 14)),
        (datetime(2026, 10, 1, 9), datetime(2026, 10, 1, 10, 30)),
    ]
    f = bedarf_fenster(termine, 45)
    assert f == [
        (datetime(2026, 10, 1, 8, 15), datetime(2026, 10, 1, 10, 30)),
        (datetime(2026, 10, 2, 12, 15), datetime(2026, 10, 2, 14)),
    ]
    assert im_fenster(f, datetime(2026, 10, 1, 8, 20))
    assert not im_fenster(f, datetime(2026, 10, 1, 10, 30))
    assert not im_fenster(f, datetime(2026, 10, 1, 8, 10))


def test_status_wie_mockup():
    plaene = {DI: Plan(t(6, 15), t(6, 15), t(7), t(16, 30), t(16, 45), t(17, 30))}
    plan_am = plaene.get
    assert status(DI, t(16, 20), plan_am) == status(DI, t(16, 20), plan_am)
    assert status(DI, t(16, 20), plan_am).art is StatusArt.HEIZT
    assert status(DI, t(16, 20), plan_am).minute == t(17, 30)
    assert (status(DI, t(5), plan_am).art, status(DI, t(5), plan_am).minute) == (StatusArt.START, t(6, 15))

    def woche(tag: date) -> Plan | None:
        return tagesplan(tag, LISTE, [], REGELN, OHNE, trocknen=False)

    abends = status(DI, t(20), woche)
    assert (abends.art, abends.tag, abends.minute) == (StatusArt.AUS, MI, t(6, 15))
    freitag = status(date(2026, 10, 2), t(20), woche)
    assert freitag.tag == date(2026, 10, 5)  # über das Wochenende
    assert status(DI, t(20), lambda _: None) == status(DI, t(20), lambda _: None)
    assert status(DI, t(20), lambda _: None).tag is None


def test_gleiches_startdatum_letzte_gewinnt_wie_mockup():
    erste = az("2026-09-28", "Herbst A", (t(7), t(16)), (t(7), t(12)))
    zweite = az("2026-09-28", "Herbst B", (t(8), t(17)), (t(8), t(12)))
    assert gueltige_arbeitszeit([erste, zweite], DI).name == "Herbst B"
    assert gueltige_arbeitszeit([zweite, erste], DI).name == "Herbst A"


def test_leere_listen():
    assert gueltige_arbeitszeit([], DI) is None
    assert arbeit_am([], [], DI) is None
    assert tagesplan(DI, [], [], REGELN, OHNE, trocknen=True) is None
    # Ausnahme gilt auch ohne jede Arbeitszeit
    p = tagesplan(DI, [], [Ausnahme(DI, "arbeit", t(7), t(12))], REGELN, OHNE, trocknen=False)
    assert (p.start, p.ende) == (t(6, 15), t(12, 15))
    assert bedarf_fenster([], 45) == []
    assert not im_fenster([], datetime(2026, 10, 1, 9))


def test_ausnahme_frei_und_feiertag():
    frei = [Ausnahme(DI, "frei", notiz="Zwickeltag")]
    assert tagesplan(DI, LISTE, frei, REGELN, OHNE, trocknen=False, frei=True) is None
    zeiten = [Ausnahme(DI, "zeiten", t(9), t(12))]
    p = tagesplan(DI, LISTE, zeiten, REGELN, OHNE, trocknen=False, frei=True)
    assert (p.start, p.a, p.b, p.gruende) == (t(8, 15), t(9), t(12), (PlanGrund.AUSNAHME,))


def test_verdrehte_oder_leere_zeiten_sind_frei():
    assert tagesplan(DI, LISTE, [Ausnahme(DI, "zeiten", t(12), t(12))], REGELN, OHNE, trocknen=False) is None
    assert tagesplan(DI, LISTE, [Ausnahme(DI, "zeiten", t(16), t(7))], REGELN, OHNE, trocknen=False) is None


def test_mitternacht_start_und_ende_begrenzt():
    frueh = [Ausnahme(DI, "zeiten", t(0, 20), t(10))]
    p = tagesplan(DI, LISTE, frueh, REGELN, WetterTag(frueh_min_temp=-3), trocknen=False)
    assert (p.start, p.vor, p.a) == (0, 0, t(0, 20))
    assert p.abschnitte()[0] == (0, t(0, 20), Abschnitt.VORHEIZEN)  # leerer Frühstart fällt weg
    spaet = [Ausnahme(DI, "zeiten", t(20), t(23, 50))]
    q = tagesplan(DI, LISTE, spaet, REGELN, OHNE, trocknen=False)
    assert (q.nach, q.ende) == (24 * 60, 24 * 60)
    assert q.abschnitt(24 * 60 - 1) is Abschnitt.NACHHEIZEN


def test_bedarf_fenster_gleicher_beginn_und_leere_termine():
    a = (datetime(2026, 10, 1, 9), datetime(2026, 10, 1, 11))
    b = (datetime(2026, 10, 1, 9), datetime(2026, 10, 1, 10))
    leer = (datetime(2026, 10, 1, 12), datetime(2026, 10, 1, 12))
    f = bedarf_fenster([a, leer, b], 45)
    assert [bis for _, bis in f] == [a[1], b[1]]  # Gleichstand: Reihenfolge der Termine bleibt
    assert all(von == datetime(2026, 10, 1, 8, 15) for von, _ in f)
    # über Mitternacht
    nacht = bedarf_fenster([(datetime(2026, 10, 2, 0, 30), datetime(2026, 10, 2, 2))], 45)
    assert nacht == [(datetime(2026, 10, 1, 23, 45), datetime(2026, 10, 2, 2))]


# ---------------------------------------------------------------- FE-0002: automatische Arbeitszeit, ändern, löschen
from logik.arbeitszeit import (  # noqa: E402
    arbeitszeit_loeschen,
    arbeitszeiten_speichern,
    erste_arbeitszeit,
    ist_automatisch,
)

EIGENE = {"ab": "2026-02-09", "name": "Meine", "tage": {"0": ["06:30", "15:00"], "1": None, "2": None, "3": None,
                                                         "4": None, "5": None, "6": None}}


def test_eigene_ersetzt_automatische_auch_mit_frueherem_datum():
    auto = erste_arbeitszeit(date(2026, 9, 29))
    liste = arbeitszeiten_speichern([auto], EIGENE)
    assert [a["name"] for a in liste] == ["Meine"]
    # Fall aus dem Ticket: vorher gewann die automatische (ab 29.09.) gegen die eigene ab 09.02.
    assert gueltige_arbeitszeit([Arbeitszeit.aus_store(a) for a in liste], date(2026, 9, 30)).name == "Meine"


def test_automatische_ohne_kennzeichen_erkannt():
    alt = {k: v for k, v in erste_arbeitszeit(date(2026, 9, 29)).items() if k != "auto"}   # vor 0.7.28 gespeichert
    assert ist_automatisch(alt)
    assert not ist_automatisch({**alt, "name": "Herbst"})
    assert not ist_automatisch({**alt, "auto": False})
    assert arbeitszeiten_speichern([alt], EIGENE) == [EIGENE]


def test_aendern_und_doppeltes_ab():
    liste = arbeitszeiten_speichern([EIGENE], {**EIGENE, "ab": "2026-03-01", "name": "Neu"}, alt_ab="2026-02-09")
    assert [(a["ab"], a["name"]) for a in liste] == [("2026-03-01", "Neu")]
    with pytest.raises(ValueError):
        arbeitszeiten_speichern([EIGENE, {**EIGENE, "ab": "2026-05-01"}], {**EIGENE, "ab": "2026-05-01"})


def test_loeschen_letzte_bleibt():
    zwei = [EIGENE, {**EIGENE, "ab": "2026-05-01"}]
    assert arbeitszeit_loeschen(zwei, "2026-05-01") == [EIGENE]
    with pytest.raises(ValueError):
        arbeitszeit_loeschen([EIGENE], "2026-02-09")
    with pytest.raises(KeyError):
        arbeitszeit_loeschen(zwei, "2027-01-01")


def test_bereinigen_beim_laden():
    """Fall aus FE-0002: automatische (vor 0.7.28 ohne Kennzeichen) und schon gespeicherte eigene – die eigene gilt sofort."""
    from logik.arbeitszeit import arbeitszeiten_bereinigen
    alt = {k: v for k, v in erste_arbeitszeit(date(2026, 9, 29)).items() if k != "auto"}
    assert arbeitszeiten_bereinigen([alt, EIGENE]) == [{**EIGENE, "auto": False}]
    assert arbeitszeiten_bereinigen([alt]) == [{**alt, "auto": True}]   # nur die automatische: bleibt, gekennzeichnet


# ---------------------------------------------------------------- AN-0004: „Warm ab“ für lernende Container
def test_warm_ab_ersetzt_vorheizen_fruehstart_und_nachheizen():
    kalt_regen = WetterTag(frueh_min_temp=-3, regen_vortag_mm=6, regen_heute_mm=6)
    warm = WarmAb(vor_min=15, nach_min=10, max_min=120, aufheiz_min=50)
    p = tagesplan(MI, LISTE, [], REGELN, kalt_regen, trocknen=True, warm=warm)
    # Soll 15 min vor 07:00 erreicht, 50 min Aufheizen → Vorheizen ab 05:55; kein Kälte-Frühstart, früher nach Regen bleibt
    assert p.vor == t(5, 55) and p.start == t(5, 55) - REGELN.trocknen_frueher_min
    assert PlanGrund.GELERNT in p.gruende and PlanGrund.FRUEHSTART not in p.gruende and PlanGrund.FRUEHER_NACH_REGEN in p.gruende
    # warm halten 10 min statt Nachheizen, danach Kleidung trocknen
    assert p.nach == p.b + 10 and p.ende == p.nach + REGELN.trocknen_laenger_min


def test_warm_ab_obergrenze_und_rueckfall():
    p = tagesplan(MI, LISTE, [], REGELN, WetterTag(), trocknen=False, warm=WarmAb(vor_min=15, max_min=120, aufheiz_min=300))
    assert p.vor == t(7) - 15 - 120                  # nie früher als „frühestens“ – vom Ziel 06:45 (FE-0031/32)
    p = tagesplan(MI, LISTE, [], REGELN, WetterTag(), trocknen=False, warm=WarmAb(vor_min=30, max_min=20, aufheiz_min=0))
    assert p.vor == t(7) - 30                        # Grenze kleiner als „Soll erreicht vor“: dieses gilt
    # noch nicht gelernt: alte Regeln (Vorheizen 45, Kälte-Frühstart, Nachheizen)
    alt = tagesplan(MI, LISTE, [], REGELN, WetterTag(frueh_min_temp=-1.2), trocknen=False, warm=WarmAb(vor_min=15, aufheiz_min=None))
    assert (alt.start, alt.vor) == (t(5, 45), t(6, 15)) and alt.nach == alt.b + REGELN.nachheizen_min and PlanGrund.GELERNT not in alt.gruende


def test_frei_gilt_ausnahme_arbeit_geht_vor():
    """Szenario-Befund: am freien Feiertag mit Ausnahme „Arbeit“ wird gearbeitet – auch die Regelung sieht nicht „frei“."""
    arbeit = Ausnahme(datum=DI, art=AusnahmeArt.ARBEIT, von=t(8), bis=t(12))
    frei = Ausnahme(datum=DI, art=AusnahmeArt.FREI)
    assert frei_gilt(True, None) and frei_gilt(True, frei)
    assert not frei_gilt(True, arbeit) and not frei_gilt(False, None)
    assert frei_gilt(False, frei)   # Ausnahme „frei“ ist ein freier Tag (Modus für freie Tage, Szenarien)


FR = date(2026, 10, 2)


def test_mehrere_zeitfenster_je_tag():
    """FE-0012 (Herbert 02.10.2026): mehrere Ausnahmen je Tag. Ein Fenster, das an die Arbeitszeit grenzt, verlängert
    den Block (mit Vor-/Nachheizen); ein Fenster für sich heizt genau seine Zeit."""
    from logik.arbeitszeit import fenster_am
    # Freitag 07:00–12:30 laut Arbeitszeit; 12:30–16:30 grenzt an, 04:00–05:00 steht für sich
    aus = [Ausnahme(FR, "arbeit", t(4), t(5)), Ausnahme(FR, "arbeit", t(12, 30), t(16, 30))]
    assert fenster_am(LISTE, aus, FR) == ((t(7), t(16, 30)), [(t(4), t(5))])
    p = tagesplan(FR, LISTE, aus, REGELN, OHNE, trocknen=False)
    assert (p.vor, p.a, p.b, p.nach) == (t(6, 15), t(7), t(16, 30), t(16, 45))
    assert p.eigene == ((t(4), t(5)),) and len(p.ausnahmen) == 2
    assert p.abschnitt(t(4, 30)) is Abschnitt.ARBEITSZEIT        # eigenes Fenster heizt (Regelung: wie Arbeitszeit)
    assert p.abschnitt(t(5, 30)) is None and p.abschnitt(t(3, 50)) is None   # ohne Vor-/Nachheizen
    assert (t(4), t(5), Abschnitt.FENSTER) in p.abschnitte()
    # Status: um 03:00 „Start um 04:00“, um 04:30 „heizt bis 05:00“, um 05:30 „Start um 06:15“
    s = lambda m: status(FR, m, lambda d: p if d == FR else None)   # noqa: E731
    assert (s(t(3)).art, s(t(3)).minute) == (StatusArt.START, t(4))
    assert (s(t(4, 30)).art, s(t(4, 30)).minute) == (StatusArt.HEIZT, t(5))
    assert (s(t(5, 30)).art, s(t(5, 30)).minute) == (StatusArt.START, t(6, 15))
    # Überschneidung verlängert ebenfalls; „frei“ hebt alles auf
    assert fenster_am(LISTE, [Ausnahme(FR, "arbeit", t(6), t(8))], FR) == ((t(6), t(12, 30)), [])
    assert fenster_am(LISTE, [*aus, Ausnahme(FR, "frei")], FR) == (None, [])


def test_ohne_arbeitszeit_ist_das_laengste_fenster_der_block():
    """Samstag ohne Arbeitszeit (Herbert: das längste Fenster bekommt Vor-/Nachheizen); „andere Zeiten“ ersetzt die
    Arbeitszeit – das längste davon ist der Block."""
    from logik.arbeitszeit import fenster_am
    sa = [Ausnahme(SA, "arbeit", t(7), t(9)), Ausnahme(SA, "arbeit", t(12), t(16))]
    assert fenster_am(LISTE, sa, SA) == ((t(12), t(16)), [(t(7), t(9))])
    di = [Ausnahme(DI, "zeiten", t(7), t(11)), Ausnahme(DI, "zeiten", t(12), t(15))]
    assert fenster_am(LISTE, di, DI) == ((t(7), t(11)), [(t(12), t(15))])
    # Feiertag: die Arbeitszeit gilt nicht, nur die Ausnahme
    assert fenster_am(LISTE, [Ausnahme(DI, "arbeit", t(8), t(12))], DI, frei=True) == ((t(8), t(12)), [])
