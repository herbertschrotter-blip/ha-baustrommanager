"""Status und Reste gelöschter Geräte und Container (logik/geraete, BSM-034.01, .02)."""

from logik.geraete import FEHLER_TEXT, STATUS, hinweise_reste, pruefen, reste_entfernen, schaltet, status_protokoll, status_von
from logik.inventar import STATUS_AUSRUESTUNG


def test_status_ein_feld() -> None:
    """BSM-034.02: ein Status je Gerät, dieselben vier Werte im Inventar; nur „aktiv“ schaltet."""
    assert STATUS == ("aktiv", "inaktiv", "verliehen", "defekt") and STATUS_AUSRUESTUNG == STATUS
    assert status_von(None) == "aktiv" and status_von({}) == "aktiv" and status_von({"zusatz": True}) == "aktiv"
    assert status_von({"aktiv": False}) == "inaktiv" and status_von({"aktiv": True}) == "aktiv"   # bis 0.8.115
    assert status_von({"aktiv": False, "status": "defekt"}) == "defekt" and status_von({"status": "x"}) == "aktiv"
    assert [schaltet(s) for s in STATUS] == [True, False, False, False]
    assert status_protokoll("HK 1", "verliehen") == "HK 1: verliehen – die Automatik lässt es aus"
    assert status_protokoll("HK 1", "aktiv") == "HK 1: aktiv"


def test_reste_entfernen() -> None:
    daten = {
        "geraete": {"g1": {"aktiv": False}, "weg": {"zusatz": True}},
        "zaehler": {"energie": 5.0, "energie_typ:konvektor": 2.0, "heiztage": 3,
                    "stand:g1": 1.0, "stand:g1:zeit": "x", "stand:weg": 2.0, "stand:weg:zeit": "y", "mittel:weg": 900.0,
                    "zyklen:weg": 4, "energie:c1": 1.0, "energie:cweg": 1.0, "vgl_kwh:cweg": 0.5, "kosten:c1": 0.3},
        "stumm": {"kein_wetter": "t", "zu_kalt:c1": "t", "zu_kalt:cweg": "t", "offline:c1:g1": "t", "offline:c1:weg": "t"},
    }
    weg = reste_entfernen(daten, ["c1"], ["g1"])
    assert daten["geraete"] == {"g1": {"aktiv": False}}
    assert daten["zaehler"] == {"energie": 5.0, "energie_typ:konvektor": 2.0, "heiztage": 3, "stand:g1": 1.0,
                                "stand:g1:zeit": "x", "energie:c1": 1.0, "kosten:c1": 0.3}
    assert daten["stumm"] == {"kein_wetter": "t", "zu_kalt:c1": "t", "offline:c1:g1": "t"}
    assert "geraete:weg" in weg and "zaehler:stand:weg:zeit" in weg and "stumm:offline:c1:weg" in weg
    assert reste_entfernen(daten, ["c1"], ["g1"]) == []   # nichts mehr übrig
    assert reste_entfernen({}, [], []) == []


def test_hinweise_reste() -> None:
    ids = ["ohne_leistung_E_g1", "ohne_leistung_E_weg", "fehlt_E_switch.a", "fehlt_E_switch.alt",
           "ohne_leistung_F_weg", "fehlt_F_switch.alt", "entitaet_fehlt_x"]
    assert hinweise_reste(ids, "E", ["g1"], ["switch.a"]) == ["ohne_leistung_E_weg", "fehlt_E_switch.alt"]


def test_pruefen_wie_der_ha_dialog() -> None:
    """BSM-034.02: eine Regel für HA-Dialog, Seite und Inventar."""
    ok = {"schalter": "switch.a", "rolle": "heizkoerper", "bereich_art": "container", "vergeben_hier": False,
          "andere_baustelle": False, "name": "HK"}
    assert pruefen(**ok) is None
    assert pruefen(**{**ok, "schalter": "light.a"}) == "kein_schalter"
    assert pruefen(**{**ok, "andere_baustelle": True, "vergeben_hier": True}) == "schalter_andere_baustelle"
    assert pruefen(**{**ok, "vergeben_hier": True}) == "schalter_vergeben"
    assert pruefen(**{**ok, "bereich_art": None}) == "kein_bereich"
    assert pruefen(**{**ok, "rolle": "pumpe"}) == "rolle_passt_nicht"
    assert pruefen(**{**ok, "bereich_art": "pumpenschacht"}) == "rolle_passt_nicht"
    assert pruefen(**{**ok, "bereich_art": "pumpenschacht", "rolle": "pumpe"}) is None
    assert pruefen(**{**ok, "name": "  "}) == "kein_name"
    assert pruefen(**{**ok, "schalter_fehlt": True}) == "schalter_fehlt"   # Gutachten 0.8.190: alter Entwurf nach Umbenennen
    assert pruefen(**{**ok, "schalter": "light.a", "schalter_fehlt": True}) == "kein_schalter"
    assert {"schalter_fehlt", "kein_schalter", "schalter_andere_baustelle", "schalter_vergeben", "kein_bereich", "rolle_passt_nicht",
            "kein_name"} <= set(FEHLER_TEXT)
