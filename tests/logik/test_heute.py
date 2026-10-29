"""Heizung › Heute: welche Regeln greifen (logik/heute, AN-0019) und Ausnahme-Abweichung (logik/arbeitszeit, FE-0034)."""

from datetime import date

from logik.arbeitszeit import Plan, PlanGrund, abweichung
from logik.heute import GRUPPEN, HeuteLage, morgen_nach_regen, regeln

PLAN = Plan(start=375, vor=375, a=420, b=990, nach=1005, ende=1005)
TROCKEN = {"heute_mm": 0.0, "gestern_mm": 0.0, "laenger_min": 0, "frueher_morgen_min": 0, "frueher_heute_min": 0, "aktiv": False,
           "text": "0 mm Regen in der Arbeitszeit heute (ab 2 mm) → nicht nötig"}


def von(L, k):
    return next(x for x in L if x["k"] == k)


def test_arbeitstag_alle_zeilen_mit_kurzwert_und_gruppe():
    L = regeln(HeuteLage(plan=PLAN, arbeitszeit="Winter", grenze=15, bezug=8, zu_warm=False, trocknen=TROCKEN, morgen_kalt=-5,
                         frueh_temp=-3, frueh_min=30, staffel=(2, 3, 1, 2)))
    assert [x["k"] for x in L] == ["arbeitszeit", "grenze", "trocknen", "fruehstart", "staffel", "frei"]
    assert all(x["gruppe"] in GRUPPEN and x["name"] and x["kurz"] for x in L)
    az = von(L, "arbeitszeit")
    assert az["titel"] == "Arbeitszeit 07:00–16:30" and az["text"] == "„Winter“ · heizt 06:15–16:45" and az["an"] and az["kurz"] == "07:00–16:30"
    g = von(L, "grenze")
    assert g["titel"] == "Heizgrenze 15 °C" and g["text"] == "Höchstwert heute 8 °C → es wird geheizt" and g["an"] and g["kurz"] == "es wird geheizt"
    t = von(L, "trocknen")
    assert not t["an"] and t["kurz"] == "nicht nötig" and t["text"] == TROCKEN["text"]
    f = von(L, "fruehstart")
    assert f["an"] and f["text"] == "−5 °C erwartet (unter −3 °C) → 30 min früher" and f["kurz"] == "30 min früher"
    s = von(L, "staffel")
    assert s["titel"] == "Staffelung: 2 von 3 Heizkörpern" and s["text"].startswith("1 wartet, weil ein Anschluss ausgelastet ist · höchstens 2")
    assert s["gruppe"] == "strom" and s["kurz"] == "2 von 3 laufen"


def test_zu_warm_regen_ohne_vorhersage_und_feiertag():
    tr = {**TROCKEN, "heute_mm": 3.5, "laenger_min": 60, "frueher_morgen_min": 15, "aktiv": True,
          "text": "3,5 mm Regen in der Arbeitszeit heute → 60 min länger, morgen 15 min früher"}
    L = regeln(HeuteLage(plan=PLAN, grenze=15, basis="jetzt", bezug=17, zu_warm=None, trocknen=tr, morgen_kalt=None,
                         naechster_feiertag=(date(2026, 11, 1), "Allerheiligen"), feiertag_kalender=True))
    g = von(L, "grenze")
    assert g["text"] == "jetzt 17 °C → zu warm, es wird nicht geheizt" and not g["an"]
    t = von(L, "trocknen")
    assert t["an"] and t["text"].endswith("morgen 15 min früher, bis 16:45") and t["kurz"] == "+60 min bis 16:45"
    assert von(L, "fruehstart")["text"] == "noch keine Vorhersage für morgen" and not von(L, "fruehstart")["an"]
    assert "staffel" not in [x["k"] for x in L]   # Staffelung aus: keine Zeile
    fr = von(L, "frei")
    assert fr["titel"] == "Kein Urlaub, kein Feiertag" and fr["text"] == "nächster Feiertag So 01.11. Allerheiligen" and not fr["an"]


def test_frei_heute_und_kein_kalender():
    L = regeln(HeuteLage(plan=None, frei="urlaub", urlaub="absenk", absenk=12))
    assert von(L, "arbeitszeit")["titel"] == "Arbeitszeit frei" and not von(L, "arbeitszeit")["an"]
    assert von(L, "arbeitszeit")["text"] == "keine Arbeitszeit · heizt nicht"
    fr = von(L, "frei")
    assert fr["titel"] == "Urlaub" and fr["an"] and fr["text"] == "heute abgesenkt auf 12 °C (mit Fühler), sonst Frostschutz"
    assert von(regeln(HeuteLage()), "frei")["text"] == "kein Feiertagskalender gewählt"
    assert von(regeln(HeuteLage(bezug=None)), "grenze")["text"] == "kein Wert vom Wetter"


def test_fruehstart_mit_regen_morgen():
    tr = {**TROCKEN, "frueher_morgen_min": 15}
    L = regeln(HeuteLage(plan=PLAN, trocknen=tr, morgen_kalt=1, frueh_temp=0, frueh_min=30, morgen_nach_regen=True))
    assert von(L, "fruehstart")["text"] == "1 °C erwartet (unter 0 °C) → nicht nötig, dazu 15 min nach Regen"
    assert morgen_nach_regen(Plan(300, 300, 420, 990, 1005, 1005, gruende=(PlanGrund.FRUEHER_NACH_REGEN,)))
    assert not morgen_nach_regen(PLAN) and not morgen_nach_regen(None)


# ---------------------------------------------------------------- FE-0034: Ausnahme gegen Normalplan
def test_ausnahme_laenger_und_spaeter():
    """Ausnahme 07:00–18:00 statt 07:00–16:30: zusätzlich 16:45–18:15 (mit Nachheizen), nichts entfällt."""
    mit = Plan(start=375, vor=375, a=420, b=1080, nach=1095, ende=1095)
    a = abweichung(mit, PLAN)
    assert a == {"normal": {"start": 375, "ende": 1005}, "teile": [[1005, 1095, "mehr"]], "diff_min": 90}


def test_ausnahme_spaeter_beginn_und_frei():
    mit = Plan(start=495, vor=495, a=540, b=990, nach=1005, ende=1005)
    assert abweichung(mit, PLAN)["teile"] == [[375, 495, "weniger"]] and abweichung(mit, PLAN)["diff_min"] == -120
    frei = abweichung(None, PLAN)   # Ausnahme „frei“ an einem Arbeitstag: alles entfällt
    assert frei["teile"] == [[375, 1005, "weniger"]] and frei["normal"] == {"start": 375, "ende": 1005}
    sa = abweichung(PLAN, None)     # zusätzlich arbeiten an einem freien Tag
    assert sa["normal"] is None and sa["teile"] == [[375, 1005, "mehr"]] and sa["diff_min"] == 630


def test_ausnahme_eigenes_zeitfenster():
    mit = Plan(start=375, vor=375, a=420, b=990, nach=1005, ende=1005, eigene=((1140, 1260),))
    assert abweichung(mit, PLAN)["teile"] == [[1140, 1260, "mehr"]]
    assert abweichung(PLAN, PLAN) == {"normal": {"start": 375, "ende": 1005}, "teile": [], "diff_min": 0}
