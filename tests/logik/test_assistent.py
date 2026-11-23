"""UI-Bericht M12: die eine Typenliste des Assistenten „+ Gerät hinzufügen“, freier Name und „+ Container“ (Vorschau,
Nummer belegt) – Regeln in logik/inventar.py."""

import pytest

from logik.geraete import rolle_passt
from logik.inventar import (
    HAENGT, InventarFehler, assistent_typen, assistent_vorschlag, assistent_zuordnung, container_vorschau, frei_setzen,
    kandidat_reihenfolge, mit_zuordnung, nur_geraet,
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


def test_plug_im_schacht_nur_pumpe():
    """Gutachten 0.8.192: eine Regel mit `logik.geraete.rolle_passt` – in den Schacht nur Pumpen, auch keine Steckdose."""
    t = assistent_typen("PLUG", schacht=True)
    assert _passt(t) == ["pumpe"]
    assert next(x for x in t if x["k"] == "konvektor")["grund"] == "nicht im Pumpenschacht"
    assert next(x for x in t if x["k"] == "steckdose")["grund"] == "nicht im Pumpenschacht"
    assert assistent_vorschlag(t) == "pumpe"


@pytest.mark.parametrize("schacht", [False, True])
def test_typenliste_folgt_der_regel_der_geraete(schacht):
    """Jeder Plug-Typ der Liste passt genau dann, wenn `rolle_passt` seine Rolle (HAENGT) dort zulässt."""
    ort = "pumpenschacht" if schacht else "container"
    from logik.inventar import ASSISTENT_TYPEN
    for t in assistent_typen("PLUG", schacht=schacht):
        haengt = ASSISTENT_TYPEN[t["k"]][4]
        if ASSISTENT_TYPEN[t["k"]][2] == "PLUG":
            assert t["passt"] == rolle_passt(HAENGT[haengt][0], ort), t


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


def _vorschau_container():
    """Container mit einem alten Plug (eigener Name), einem neuen Plug und einem zweiten Kanal desselben HA-Geräts."""
    def gruppe(g, ref_geraet, schalter, sub, alt):
        return [{"gruppe": g, "ziel": "geraet", "ref": ref_geraet, "alt": alt, "neu": g, "zustand": "aendern"},
                {"gruppe": g, "ziel": "label", "ref": ref_geraet, "alt": None, "neu": "Container", "zustand": "neu"},
                {"gruppe": g, "ziel": "entitaet_name", "ref": schalter, "alt": None, "neu": g, "zustand": "neu"},
                {"gruppe": g, "ziel": "entitaet_id", "ref": schalter, "alt": schalter, "neu": "switch." + g.lower().replace("-", "_"),
                 "zustand": "aendern"},
                {"gruppe": g, "ziel": "plug", "ref": sub, "alt": alt, "neu": g, "zustand": "aendern"},
                {"gruppe": g, "ziel": "unter_eintrag", "ref": sub, "alt": alt, "neu": g + "_HZ", "zustand": "aendern"}]
    schritte = gruppe("001-01_C_PLUG_POL", "dev1", "switch.alt", "g1", "Radiator Polier") \
        + gruppe("001-02_C_PLUG_POL", "dev9", "switch.neu", "neu", "Shelly Plug S") \
        + gruppe("001-03_C_PLUG_POL", "dev1", "switch.alt_2", "g3", "Radiator Polier")
    return {"schritte": schritte, "konflikte": {"switch.alt": "switch.001_01_c_plug_pol", "switch.neu": "switch.001_02_c_plug_pol"},
            "zaehler": {}}


def test_nur_das_neue_geraet_wird_benannt():
    """Entscheidung A: nur die Schritte des neuen Geräts; andere (auch mit eigenem Namen) bleiben, Konflikte nur seine."""
    v = _vorschau_container()
    aus = nur_geraet(v, {"switch.neu"})
    assert {s["gruppe"] for s in aus["schritte"]} == {"001-02_C_PLUG_POL"}
    assert {s["ziel"] for s in aus["schritte"]} == {"geraet", "label", "entitaet_name", "entitaet_id", "plug", "unter_eintrag"}
    assert aus["konflikte"] == {"switch.neu": "switch.001_02_c_plug_pol"}
    assert aus["zaehler"]["aendern"] == 4 and aus["zaehler"]["neu"] == 2
    assert not any(s["ref"] in ("dev1", "switch.alt", "g1") for s in aus["schritte"])
    assert len(v["schritte"]) == 18   # Eingabe unverändert


def test_zweiter_kanal_laesst_geraetename_und_shelly_name():
    """Zweiter Kanal desselben HA-Geräts: Entity-IDs und Heizkörper-Name ja, Gerätename, Labels und Shelly-Name nicht."""
    aus = nur_geraet(_vorschau_container(), {"switch.alt_2"})
    assert {s["ziel"] for s in aus["schritte"]} == {"entitaet_name", "entitaet_id", "unter_eintrag"}
    assert not aus["konflikte"]
    assert nur_geraet(_vorschau_container(), {"gibt.es_nicht"})["schritte"] == []


def test_kein_shelly_kein_plug_name():
    """Entscheidung B: ein Schalter, der kein Shelly ist, hat keinen Namen im Gerät selbst."""
    eingabe = {"art": "POL", "praefix": "001", "plugs": [], "sensoren": []}
    geraet = {"id": "dev9", "name": "Steckdose Sonoff", "original": "sonoff-1"}
    mit = mit_zuordnung(eingabe, typ="PLUG", geraet=geraet, entitaeten=[], labels_=[], schalter={"entity_id": "switch.s"})
    ohne = mit_zuordnung(eingabe, typ="PLUG", geraet=geraet, entitaeten=[], labels_=[], schalter={"entity_id": "switch.s"},
                         shelly=False)
    assert mit["plugs"][0]["plug_name"] == "sonoff-1" and ohne["plugs"][0]["plug_name"] is None


def test_kandidaten_shellys_oben():
    zeilen = [{"typ": "TEMP", "name": "H&T", "shelly": False}, {"typ": "PLUG", "name": "Sonoff", "shelly": False},
              {"typ": "PLUG", "name": "2PM", "kanal": "Kanal 2", "shelly": True}, {"typ": "PLUG", "name": "2PM", "kanal": "Kanal 1", "shelly": True}]
    assert [(z["name"], z.get("kanal")) for z in sorted(zeilen, key=kandidat_reihenfolge)] == [
        ("2PM", "Kanal 1"), ("2PM", "Kanal 2"), ("Sonoff", None), ("H&T", None)]


def test_container_nummer_als_text_und_ohne_inventar():
    """Gutachten 0.8.192: Nummer so, wie sie im Namen steht, von der Integration; ohne Inventar nur der Bereich."""
    v = container_vorschau(schacht=False, eigen=True, art="MAN", nummern=[1, 2, 5])
    assert v["nummer_text"] == "006" and v["naechste_text"] == "006"
    assert container_vorschau(schacht=False, eigen=True, art="MAN", nr=4, nummern=[1, 2, 5])["nummer_text"] == "004"
    f = container_vorschau(schacht=False, eigen=False, art="MAN", firma="STRA", fremd_nummern=[1, 2])
    assert f["nummer_text"] == "03"
    o = container_vorschau(schacht=False, eigen=True, art=None, ohne_inventar=True)
    assert not o["im_inventar"] and o["inventar"] is None and not o["belegt"] and "Nicht im Inventar" in o["hinweis"]
