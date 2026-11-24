"""Herkunft der Einstellungen eines Containers (logik/herkunft, UI-Bericht M8, Mockup container-seite.html)."""

from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "custom_components" / "baustelle"))

from logik.herkunft import ABWEICHEND, BAUSTELLE, einstellungen, grad, warm_nach_text, warm_vor_text  # noqa: E402

H = {"soll": 20.0, "soll_art": "fest", "warm_vor_min": 0, "warm_nach_min": 0, "vorheizen_min": 45, "frost": True, "frost_grenze": 5.0,
     "frost_aus": None, "tuer_pause_min": 3, "trocknen_ab_mm": 2.0, "trocknen_laenger_min": 45, "trocknen_frueher_min": 15, "trocknen_stufen": None}
ST = {"an": True, "nutzbar_prozent": 67}


def test_ohne_eigene_werte_alles_von_der_baustelle():
    E = einstellungen(H, ST, {"soll": None, "warm_vor": None, "warm_nach": None, "prio": "normal"})
    assert all(e["herkunft"] == BAUSTELLE for e in E.values())
    assert E["soll"]["text"] == "20,0 °C" and E["soll"]["ziel"] == "regeln:soll"
    assert E["warm_vor"]["text"] == "bei Beginn" and E["warm_nach"]["text"] == "bis Ende"


def test_eigener_wert_ist_abweichend_mit_wert_der_baustelle_und_ohne_sprung():
    E = einstellungen(H, ST, {"soll": 21.0, "warm_vor": None, "warm_nach": 30, "prio": "hoch"})
    assert E["soll"] == {**E["soll"], "herkunft": ABWEICHEND, "text": "21,0 °C", "baustelle": "20,0 °C", "ziel": None}
    assert E["warm_nach"]["herkunft"] == ABWEICHEND and E["warm_nach"]["text"] == "30 min länger" and E["warm_nach"]["baustelle"] == "bis Ende"
    assert E["warm_vor"]["herkunft"] == BAUSTELLE
    assert E["prio"]["herkunft"] == ABWEICHEND and E["prio"]["baustelle"] == "normal" and E["prio"]["zurueck"] == "normal"


def test_warm_ab_der_baustelle_gilt_als_text():
    E = einstellungen({**H, "warm_vor_min": 15, "warm_nach_min": 0}, ST, {})
    assert E["warm_vor"]["text"] == "15 min vorher" and E["warm_vor"]["wert"] == 15 and E["warm_vor"]["herkunft"] == BAUSTELLE


def test_vorheizen_ruht_bei_lernender_regelung():
    assert einstellungen(H, ST, {}, lernend=True)["vorheizen"]["ruht"] == "wirkt nicht – die lernende Regelung rechnet selbst"
    assert einstellungen(H, ST, {}, lernend=False)["vorheizen"]["ruht"] is None
    assert einstellungen({**H, "vorheizen_min": 0}, ST, {}, lernend=True)["vorheizen"]["text"] == "aus"


def test_regeln_der_baustelle_als_text():
    E = einstellungen(H, ST, {})
    assert E["frost"]["text"] == "unter 5 °C, aus über 7 °C"
    assert E["tuer"]["text"] == "nach 3 min"
    assert E["staffel"]["text"] == "an · 67 % je Anschluss nutzbar"
    assert E["trocknen"]["text"].startswith("ab 2 mm")
    E = einstellungen({**H, "frost": False, "tuer_pause_min": 0}, {"an": False}, {})
    assert E["frost"]["text"] == "aus" and E["tuer"]["text"] == "aus" and E["staffel"]["text"] == "aus"


def test_gleitendes_soll_nennt_die_verschiebung():
    E = einstellungen({**H, "soll_art": "gleitend"}, ST, {"soll": 21.5})
    assert E["soll"]["baustelle"] == "gleitend" and E["soll"]["hinweis"] == "Soll gleitend: gilt als +1,5 °C gegenüber dem der Baustelle"
    assert einstellungen({**H, "soll_art": "gleitend"}, ST, {})["soll"]["hinweis"] == "Soll gleitend: folgt dem der Baustelle"


def test_texte():
    assert grad(-2) == "−2,0 °C" and warm_vor_text(0) == "bei Beginn" and warm_nach_text(45) == "45 min länger"


def test_nur_heute_bleibt_im_bereich_des_solls():
    from logik.soll import gefuehl_aus_versch, versch_begrenzt
    assert versch_begrenzt(21.0, 15.0) == 9.0 and versch_begrenzt(21.0, -20.0) == -16.0 and versch_begrenzt(21.0, 0.5) == 0.5
    assert gefuehl_aus_versch("gleitend") and not gefuehl_aus_versch("fest") and not gefuehl_aus_versch(None)
