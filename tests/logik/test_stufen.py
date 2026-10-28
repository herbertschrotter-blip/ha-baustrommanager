"""Zusatz-Heizkörper nur bei Bedarf (AN-0006)."""

from logik.stufen import Grund, StufenLage, StufenRegeln, haupt_und_zusatz, zusatz

R = StufenRegeln()


def lage(**k) -> StufenLage:
    return StufenLage(**{"innen": 19.5, "soll": 20.0, "aussen": 3.0, **k})


def test_nahe_am_soll_nur_der_haupt():
    assert zusatz(R, lage()) == (False, None)


def test_ausloeser():
    assert zusatz(R, lage(boost=True)) == (True, Grund.BOOST)
    assert zusatz(R, lage(aussen=-6.0)) == (True, Grund.KALT)
    assert zusatz(R, lage(aussen=-5.0)) == (False, None)          # genau an der Grenze: noch nicht
    assert zusatz(R, lage(gelernt=True)) == (True, Grund.GELERNT)
    assert zusatz(R, lage(innen=18.4)) == (True, Grund.WEIT_UNTER)
    assert zusatz(R, lage(innen=18.5)) == (False, None)           # genau 1,5 °C: noch nicht


def test_einer_schafft_es_nicht():
    assert zusatz(R, lage(innen=19.0, haupt_min=30, anstieg=0.2)) == (True, Grund.SCHAFFT_NICHT)
    assert zusatz(R, lage(innen=19.0, haupt_min=29, anstieg=0.2)) == (False, None)    # noch nicht lange genug
    assert zusatz(R, lage(innen=19.0, haupt_min=45, anstieg=0.4)) == (False, None)    # wird spürbar wärmer
    assert zusatz(R, lage(innen=19.8, haupt_min=60, anstieg=0.0)) == (False, None)    # schon in der Toleranz


def test_bleibt_bis_fast_warm():
    an = lage(innen=19.2, zusatz_an=True, grund_vorher=Grund.WEIT_UNTER)
    assert zusatz(R, an) == (True, Grund.WEIT_UNTER)
    assert zusatz(R, lage(innen=19.5, zusatz_an=True, grund_vorher=Grund.WEIT_UNTER)) == (False, None)


def test_ohne_fuehler_nur_kaelte_und_boost():
    assert zusatz(R, lage(innen=None)) == (False, None)
    assert zusatz(R, lage(innen=None, aussen=-8.0)) == (True, Grund.KALT)


def test_haupt_und_zusatz():
    assert haupt_und_zusatz(["a", "b", "c"], set()) == (["a"], ["b", "c"])
    assert haupt_und_zusatz(["a", "b"], {"a"}) == (["b"], ["a"])
    assert haupt_und_zusatz(["a", "b"], {"a", "b"}) == (["a"], ["b"])   # alle markiert: der erste ist Haupt
    assert haupt_und_zusatz(["a"], set()) == (["a"], [])
    assert haupt_und_zusatz(["a", "b", "c"], {"c"}) == (["a"], ["b", "c"])   # AN-0015: genau einer primär (vorher a und b)


def test_primaer_gewaehlt():
    """AN-0015: der im Container gewählte ist primär, alle anderen Zusatz; fehlt er (entfernt, inaktiv), gilt wieder
    die alte Markierung bzw. der erste."""
    assert haupt_und_zusatz(["a", "b", "c"], set(), "c") == (["c"], ["a", "b"])
    assert haupt_und_zusatz(["a", "b"], {"b"}, "b") == (["b"], ["a"])          # Wahl schlägt die alte Markierung
    assert haupt_und_zusatz(["a", "b"], {"a"}, "weg") == (["b"], ["a"])        # nicht mehr da: alte Markierung
    assert haupt_und_zusatz(["a", "b"], set(), None) == (["a"], ["b"])


def test_einer_reicht_im_vorheizen():
    """Szenario-Befund: gelernt „einer reicht“ – weit unter dem Soll schaltet den Zusatz im Vorheizen nicht dazu,
    Kälte und Schnell aufheizen schon."""
    assert zusatz(R, lage(innen=15.0, einer_reicht=True)) == (False, None)
    assert zusatz(R, lage(innen=15.0, einer_reicht=True, aussen=-8.0)) == (True, Grund.KALT)
    assert zusatz(R, lage(innen=15.0, einer_reicht=True, boost=True)) == (True, Grund.BOOST)
