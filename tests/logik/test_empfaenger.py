"""Empfänger der Meldungen: die HA-Option wirkt bei jeder Änderung, sonst gilt der Wert der Seite (Maßnahme 2)."""

from logik.empfaenger import uebernehmen


def test_geaenderte_option_gilt_auch_ueber_den_wert_der_seite():
    assert uebernehmen(["mobile_app_seite"], ["mobile_app_alt"], ["mobile_app_neu"]) == (["mobile_app_neu"], ["mobile_app_neu"])


def test_geleerte_option_gilt():
    assert uebernehmen(["mobile_app_a"], ["mobile_app_a"], []) == ([], [])


def test_gleiche_option_laesst_den_wert_der_seite():
    assert uebernehmen(["mobile_app_seite"], ["mobile_app_a"], ["mobile_app_a"]) == (["mobile_app_seite"], ["mobile_app_a"])


def test_reihenfolge_zaehlt_nicht():
    assert uebernehmen(["x"], ["a", "b"], ["b", "a"]) == (["x"], ["b", "a"])


def test_ohne_merker_nur_wenn_noch_keiner_gespeichert():
    assert uebernehmen([], None, ["mobile_app_a"]) == (["mobile_app_a"], ["mobile_app_a"])
    assert uebernehmen(["mobile_app_seite"], None, ["mobile_app_a"]) == (["mobile_app_seite"], ["mobile_app_a"])


def test_ohne_option():
    assert uebernehmen(None, None, None) == ([], [])
    assert uebernehmen(["mobile_app_seite"], [], None) == (["mobile_app_seite"], [])
