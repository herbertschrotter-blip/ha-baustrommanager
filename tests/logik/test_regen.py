"""FE-0026: Regen eines Tages aus Vorhersage und Messung (logik/regen)."""

from datetime import datetime, timedelta, timezone

from logik.regen import regen_des_tages, regen_vorhersage, stunden_merken

Z = timezone(timedelta(hours=2))


def _h(stunde: int) -> str:
    return datetime(2026, 10, 8, stunde, tzinfo=Z).isoformat()


def test_vergangene_stunden_bleiben_kommende_sind_neu():
    morgens = stunden_merken(None, {_h(6): 0.2, _h(7): 0.1, _h(13): 3.0, _h(14): 3.5}, datetime(2026, 10, 8, 6, 5, tzinfo=Z))
    assert regen_vorhersage(morgens, None) == 6.8
    mittags = stunden_merken(morgens, {_h(12): 0.0, _h(13): 0.3, _h(14): 0.2}, datetime(2026, 10, 8, 12, 10, tzinfo=Z))
    assert mittags == {_h(6): 0.2, _h(7): 0.1, _h(12): 0.0, _h(13): 0.3, _h(14): 0.2}
    assert regen_vorhersage(mittags, 6.8) == 0.8                  # früher: max(6,8; …) = 6,8 den ganzen Tag


def test_laufende_stunde_nimmt_die_neue_vorhersage():
    alt = {_h(12): 2.0}
    assert stunden_merken(alt, {_h(12): 0.1}, datetime(2026, 10, 8, 12, 30, tzinfo=Z)) == {_h(12): 0.1}


def test_ohne_neue_stunden_bleibt_alt_und_ohne_stunden_gilt_der_tag():
    alt = {_h(6): 0.4}
    assert stunden_merken(alt, None, datetime(2026, 10, 8, 12, tzinfo=Z)) == alt
    assert regen_vorhersage(None, 1.5) == 1.5 and regen_vorhersage({}, None) is None


def test_gemessen_geht_vor():
    assert regen_des_tages({"regen": 6.8, "regen_mess": 0.4}) == 0.4
    assert regen_des_tages({"regen": 6.8, "regen_mess": 0}) == 0.0
    assert regen_des_tages({"regen": 6.8}) == 6.8 and regen_des_tages({}) is None


# ---------------------------------------------------------------- AN-0021: Regen in der Arbeitszeit, gestuft
from logik.regen import (  # noqa: E402
    VORGABE_STUFEN, TrocknenStufe, regen_arbeitszeit, stufe, stufen_aus, trocknen_anzeige,
)

A, B = 7 * 60, 16 * 60 + 30   # Arbeitszeit 07:00–16:30


def test_regen_um_3_uhr_zaehlt_nicht_10_bis_12_schon():
    nachts = {_h(3): 8.0, _h(4): 2.0}
    assert regen_arbeitszeit(nachts, A, B) == 0.0
    tags = {_h(3): 8.0, _h(10): 1.5, _h(11): 2.0}
    assert regen_arbeitszeit(tags, A, B) == 3.5


def test_vorhersage_nach_feierabend_zaehlt_nicht_angebrochene_stunde_anteilig():
    abends = {_h(17): 4.0, _h(20): 6.0}
    assert regen_arbeitszeit(abends, A, B) == 0.0
    assert regen_arbeitszeit({_h(16): 2.0}, A, B) == 1.0   # 16:00–16:30 ist die halbe Stunde in der Arbeitszeit


def test_nur_tagesvorhersage_und_regensensor():
    assert regen_arbeitszeit(None, A, B, tag_mm=4.2) == 4.2          # sagt nicht wann – die Tagessumme gilt
    assert regen_arbeitszeit({}, A, B) is None
    assert regen_arbeitszeit({_h(10): 9.0}, A, B, 9.0, mess_beginn=3.0, mess_ende=4.5) == 1.5   # gemessen geht vor
    assert regen_arbeitszeit(None, A, B, None, mess_beginn=3.0, mess_ende=None) is None
    assert regen_arbeitszeit({_h(10): 1.0}, A, A) == 0.0             # keine Arbeitszeit


def test_stufen_grenzen():
    assert stufe(None, VORGABE_STUFEN) is None and stufe(1.99, VORGABE_STUFEN) is None
    assert stufe(2.0, VORGABE_STUFEN) == TrocknenStufe(2.0, 60, 15)
    assert stufe(4.99, VORGABE_STUFEN).laenger_min == 60 and stufe(5.0, VORGABE_STUFEN) == TrocknenStufe(5.0, 100, 30)
    assert stufe(30, VORGABE_STUFEN).ab_mm == 5.0


def test_alte_einstellungen_werden_stufen():
    assert stufen_aus(None, 2.0, 45, 15) == VORGABE_STUFEN              # unverändert → neue Vorgabe
    assert stufen_aus(None, 3.0, 30, 10) == (TrocknenStufe(3.0, 30, 10), VORGABE_STUFEN[1])   # eigene = Stufe 1
    assert stufen_aus(None, 6.0, 120, 40) == (TrocknenStufe(6.0, 120, 40),)  # eigene liegt über der Vorgabe: nur sie
    roh = [{"ab_mm": 8, "laenger_min": 90, "frueher_min": 20}, {"ab_mm": 1, "laenger_min": 30, "frueher_min": 5}, {"kaputt": 1}]
    assert stufen_aus(roh, 2.0, 45, 15) == (TrocknenStufe(1.0, 30, 5), TrocknenStufe(8.0, 90, 20))   # gespeichert geht vor


def test_trocknen_text_der_integration():
    t = trocknen_anzeige(3.5, 0.0, VORGABE_STUFEN)
    assert t["text"] == "3,5 mm Regen in der Arbeitszeit heute → 60 min länger, morgen 15 min früher"
    assert (t["laenger_min"], t["frueher_morgen_min"], t["frueher_heute_min"], t["aktiv"]) == (60, 15, 0, True)
    g = trocknen_anzeige(0.5, 6.0, VORGABE_STUFEN)
    assert g["text"] == "0,5 mm Regen in der Arbeitszeit heute (ab 2 mm) → nicht nötig · gestern 6 mm → heute 30 min früher"
    assert g["frueher_heute_min"] == 30 and not g["aktiv"] and "seit gestern" not in g["text"]
    assert trocknen_anzeige(None, None, VORGABE_STUFEN)["text"] == "kein Regenwert für die Arbeitszeit"
    assert trocknen_anzeige(1, None, VORGABE_STUFEN)["stufen_text"] == "ab 2 mm: +60 min, morgen 15 min früher · ab 5 mm: +100 min, morgen 30 min früher"
