"""UI-Bericht M12: die eine Typenliste des Assistenten „+ Gerät hinzufügen“, freier Name und „+ Container“ (Vorschau,
Nummer belegt) – Regeln in logik/inventar.py."""

import pytest

from logik.inventar import (
    HAENGT, InventarFehler, assistent_typen, assistent_vorschlag, assistent_zuordnung, container_vorschau, frei_setzen,
)


def _passt(liste):
    return [t["k"] for t in liste if t["passt"]]


def test_plug_im_container_nur_plug_typen_ohne_pumpe():
    t = assistent_typen("PLUG", schacht=False, geraet="Shelly Plug S Gen3")
    assert _passt(t) == ["radiator", "konvektor", "bautrockner", "steckdose"]
    pumpe = next(x for x in t if x["k"] == "pumpe")
    assert pumpe["grund"] == "nur im Pumpenschacht"
    fuehler = next(x for x in t if x["k"] == "fuehler")
    assert fuehler["grund"] == "passt nicht zu Shelly Plug S Gen3" and fuehler["gruppe"] == "Sensor"
    assert assistent_vorschlag(t) == "radiator"
    radiator = next(x for x in t if x["k"] == "radiator")
    assert radiator["nenn"] and radiator["rolle"]   # Nennleistung und Primär/Zusatz nur bei Heizkörpern
    assert not next(x for x in t if x["k"] == "steckdose")["nenn"]


def test_plug_im_schacht_pumpe_und_steckdose():
    t = assistent_typen("PLUG", schacht=True)
    assert _passt(t) == ["pumpe", "steckdose"]
    assert next(x for x in t if x["k"] == "konvektor")["grund"] == "nicht im Pumpenschacht"
    assert assistent_vorschlag(t) == "pumpe"


def test_sensoren():
    assert _passt(assistent_typen("TEMP", schacht=False)) == ["fuehler"]
    assert _passt(assistent_typen("DOOR", schacht=False)) == ["tuer", "fenster"]   # ein Kontakt kann Tür oder Fenster sein
    assert _passt(assistent_typen("FEN", schacht=False)) == ["tuer", "fenster"]
    assert _passt(assistent_typen("TEMP", schacht=True)) == []   # Schacht: keine Fühler
    licht = next(x for x in assistent_typen("PLUG", schacht=False) if x["k"] == "licht")
    assert not licht["passt"] and "Aussehen" in licht["grund"]
    assert assistent_vorschlag(assistent_typen(None, schacht=False)) is None


def test_zuordnung():
    assert assistent_zuordnung("radiator") == ("PLUG", "radiator")
    assert assistent_zuordnung("pumpe") == ("PLUG", "pumpe") and HAENGT["pumpe"][0] == "pumpe"
    assert assistent_zuordnung("steckdose") == ("PLUG", "nichts")
    assert assistent_zuordnung("tuer") == ("DOOR", None) and assistent_zuordnung("fenster") == ("FEN", None)
    for falsch in ("licht", "unbekannt"):
        with pytest.raises(InventarFehler):
            assistent_zuordnung(falsch)


def test_frei_nur_geraetename():
    schritte = [{"ziel": "geraet", "ref": "d9", "alt": "Shelly Plug S Gen3", "neu": "001-03_C_PLUG_POL", "zustand": "aendern"},
                {"ziel": "entitaet_id", "ref": "switch.x", "alt": "switch.x", "neu": "switch.001_03_c_plug_pol", "zustand": "aendern"},
                {"ziel": "geraet", "ref": "d1", "alt": "Heizung 01", "neu": "001-01_C_PLUG_POL", "zustand": "aendern"}]
    aus = frei_setzen(schritte, "d9", " Konvektor Polier ")
    assert aus[0]["neu"] == "Konvektor Polier" and aus[0]["frei"] is True
    assert aus[1]["neu"] == "switch.001_03_c_plug_pol" and "frei" not in aus[1]   # Entity-IDs folgen dem Schema
    assert aus[2]["neu"] == "001-01_C_PLUG_POL" and "frei" not in aus[2]
    assert frei_setzen(schritte, "d9", "") == schritte and schritte[0]["neu"] == "001-03_C_PLUG_POL"   # ohne Namen: Schema
    assert frei_setzen(schritte, "d9", "Shelly Plug S Gen3")[0]["zustand"] == "gleich"


def test_container_eigen_naechste_und_belegt():
    v = container_vorschau(schacht=False, eigen=True, art="MAN", nummern=[1, 2, 3, 5, None])
    assert v["inventar"] == "006_C_MAN" and v["nummer"] == 6 and v["naechste"] == 6 and not v["belegt"]
    assert v["geraete"] == "006-01_C_PLUG_MAN"
    belegt = container_vorschau(schacht=False, eigen=True, art="MAN", nr=3, nummern=[1, 2, 3, 5])
    assert belegt["belegt"] and "vergeben" in belegt["grund"] and belegt["inventar"] == "003_C_MAN"
    luecke = container_vorschau(schacht=False, eigen=True, art="LAG", nr=4, nummern=[1, 2, 3, 5])
    assert not luecke["belegt"] and luecke["inventar"] == "004_C_LAG"   # nie vergebene Nummer (Bestand) geht
    with pytest.raises(InventarFehler):
        container_vorschau(schacht=False, eigen=True, art="XYZ")


def test_container_fremd_und_schacht():
    v = container_vorschau(schacht=False, eigen=False, art="MAN", firma="stra", fremd_nummern=[1])
    assert v["inventar"] == "STRA-02_C_MAN" and v["nummer"] == 2 and v["geraete"] == "STRA-02-01_C_PLUG_MAN"
    with pytest.raises(InventarFehler):
        container_vorschau(schacht=False, eigen=False, art="MAN", firma="x")
    s = container_vorschau(schacht=True, eigen=True, art=None)
    assert not s["im_inventar"] and s["inventar"] is None and "Inventar" in s["hinweis"]
