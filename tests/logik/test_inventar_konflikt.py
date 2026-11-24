"""Konflikt lösen im Benenner (logik/inventar, Mockup mockups/namen-konflikt.html)."""

from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "custom_components" / "baustelle"))

from logik.inventar import belegt_gruppen, loesungen, verwaist, werks_ids  # noqa: E402

FRITZ = ["sensor.001_c_temp_pol_temperatur", "sensor.001_c_temp_pol_feuchte", "sensor.001_c_temp_pol_batterie",
         "binary_sensor.001_c_temp_pol_batterie"]


def test_werks_ids_ersetzen_den_geraetenamen_vorne():
    w = werks_ids(FRITZ, "001_C_TEMP_POL", "FRITZ!DECT 440 Büro")
    assert w["sensor.001_c_temp_pol_temperatur"] == "sensor.fritz_dect_440_buro_temperatur"
    assert w["binary_sensor.001_c_temp_pol_batterie"] == "binary_sensor.fritz_dect_440_buro_batterie"
    assert len(w) == 4


def test_werks_ids_lassen_fremde_ids_und_haengen_bei_belegt_zahl_an():
    w = werks_ids(["sensor.anderes", "sensor.001_c_temp_pol"], "001_C_TEMP_POL", "Fühler", belegt={"sensor.fuhler"})
    assert w == {"sensor.001_c_temp_pol": "sensor.fuhler_2"}
    assert werks_ids(FRITZ, None, "X") == {} and werks_ids(FRITZ, "A", "a") == {}


def test_belegt_gruppen_eine_karte_je_geraet():
    konfl = {"sensor.a_2": "sensor.a", "sensor.b_2": "sensor.b", "sensor.c_2": "sensor.c"}
    g = belegt_gruppen(konfl, {"sensor.a": "fritz", "sensor.b": "fritz", "sensor.c": None})
    assert g == {"fritz": ["sensor.a", "sensor.b"], "sensor.c": ["sensor.c"]}


def test_loesungen_je_lage():
    werks = {"sensor.a": "sensor.x_a"}
    L = loesungen(geraet=True, baustelle=None, verwaist=False, integration="FRITZ!SmartHome", trifft=["sensor.a"], werks=werks)
    assert L["zuruecksetzen"]["ok"] and not L["entfernen"]["ok"] and "FRITZ!SmartHome meldet das Gerät noch" in L["entfernen"]["warum"]
    L = loesungen(geraet=True, baustelle=None, verwaist=True, integration=None, trifft=["sensor.a", "sensor.b"], werks=werks)
    assert L["entfernen"]["ok"] and not L["zuruecksetzen"]["ok"] and "nicht am Gerätenamen" in L["zuruecksetzen"]["warum"]
    L = loesungen(geraet=False, baustelle=None, verwaist=True, integration=None, trifft=["sensor.a"], werks={})
    assert L["entfernen"]["ok"] and "ohne Gerät" in L["zuruecksetzen"]["warum"]
    L = loesungen(geraet=True, baustelle="Dobl › Polier", verwaist=True, integration=None, trifft=["sensor.a"], werks=werks)
    assert not L["zuruecksetzen"]["ok"] and not L["entfernen"]["ok"] and "Dobl › Polier" in L["entfernen"]["warum"]


def test_werks_ids_kollidieren_nicht_mit_eigenen_ids_die_bleiben():
    # „Alt“ → „Werk“: sensor.werk_temp gehört dem Gerät schon und wandert nicht
    w = werks_ids(["sensor.alt_temp", "sensor.werk_temp"], "Alt", "Werk", belegt={"sensor.alt_temp", "sensor.werk_temp"})
    assert w == {"sensor.alt_temp": "sensor.werk_temp_2"}
    assert werks_ids(["sensor.strasse_t"], "Straße", "Werk") == {"sensor.strasse_t": "sensor.werk_t"}


def test_verwaist_nur_wenn_keine_integration_es_mehr_meldet():
    assert not verwaist([], ["weg"])                              # YAML/Template: nie
    assert verwaist(["fehlt"], ["weg"])                           # Integration gelöscht
    assert not verwaist(["anders"], ["weg", "weg"])               # startet gerade neu / Fehler: kommt wieder
    assert verwaist(["geladen"], ["weg", "aus"])                  # geladen, meldet das Gerät aber nicht mehr
    assert not verwaist(["geladen"], ["da", "weg"]) and not verwaist(["geladen"], ["aus"])
