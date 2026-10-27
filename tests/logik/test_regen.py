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
