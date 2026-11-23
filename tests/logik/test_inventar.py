"""Container-Inventar: Kürzel, Namen, Entity-IDs, Labels, Nummern (BSM-031.03, Bauplan Inventar §3–§5)."""

import pytest

from logik.inventar import (
    CONTAINER_ARTEN, GERAETE, InventarFehler, container_name, eigene_labels, entity_id, firmenkuerzel_pruefen,
    geraet_name, konflikte, labels, messwert_name, naechste, praefix,
)


def test_kuerzeltabelle_deutsch():
    assert list(CONTAINER_ARTEN) == ["POL", "MAN", "BES", "BUE", "LAG", "MAT", "SAN", "TRO"]
    assert list(GERAETE) == ["PLUG", "HZ", "TEMP", "DOOR", "FEN", "PUMP", "BTR"]
    assert CONTAINER_ARTEN["POL"] == "Polier" and GERAETE["BTR"] == "Bautrockner"


def test_container_eigen_und_fremd():
    assert container_name("POL", nr=1) == "001_C_POL"
    assert container_name("MAN", nr=2) == "002_C_MAN"
    assert container_name("MAN", firma="stra", fremd_nr=1) == "STRA-01_C_MAN"
    assert praefix(nr=12) == "012" and praefix(firma="HUBE", fremd_nr=3) == "HUBE-03"
    with pytest.raises(InventarFehler):
        container_name("FOR", nr=1)          # englisch gibt es nicht (08.10.2026)
    with pytest.raises(InventarFehler):
        container_name("MAN")                 # eigen ohne Nummer
    with pytest.raises(InventarFehler):
        container_name("MAN", firma="STRA")   # fremd ohne Nummer


def test_geraete_nach_container():
    p = praefix(nr=2)
    assert geraet_name(p, "MAN", "PLUG", 1) == "002-01_C_PLUG_MAN"
    assert geraet_name(p, "MAN", "HZ", 1, heiztyp="konvektor") == "002-01_C_HZ_MAN_Konvektor01"
    assert geraet_name(p, "MAN", "HZ", 2, heiztyp="oelradiator", heiz_nr=1) == "002-02_C_HZ_MAN_Radiator01"
    assert geraet_name(p, "MAN", "BTR", 3) == "002-03_C_BTR_MAN"
    assert geraet_name(p, "MAN", "TEMP") == "002_C_TEMP_MAN"
    assert geraet_name(p, "MAN", "DOOR", nr=2) == "002_C_DOOR_MAN_2"
    assert geraet_name(praefix(firma="STRA", fremd_nr=1), "MAN", "PLUG", 1) == "STRA-01-01_C_PLUG_MAN"
    with pytest.raises(InventarFehler):
        geraet_name(p, "MAN", "PLUG")        # Plug ohne GG
    with pytest.raises(InventarFehler):
        geraet_name(p, "MAN", "WIN", 1)      # unbekannter Typ


def test_messwerte_und_entity_ids():
    assert messwert_name("002_C_TEMP_MAN", "Temperatur") == "002_C_TEMP_MAN_Temperatur"
    assert entity_id("switch", "002-01_C_PLUG_MAN") == "switch.002_01_c_plug_man"
    assert entity_id("sensor", "002_C_TEMP_MAN_Temperatur") == "sensor.002_c_temp_man_temperatur"
    assert entity_id("switch", "STRA-01-01_C_PLUG_MAN") == "switch.stra_01_01_c_plug_man"
    assert entity_id("sensor", "002_C_DOOR_MAN_Tür") == "sensor.002_c_door_man_t_r"   # Umlaute kommen im Schema nicht vor


def test_labels():
    assert labels("MAN") == ["Container", "Mannschaft"]
    assert labels("MAN", "PLUG") == ["Container", "Mannschaft", "Shelly Plug"]
    assert labels("MAN", "DOOR", firma="Strabag") == ["Container", "Mannschaft", "Shelly Door Sensor", "Strabag"]
    assert {"Container", "Polier", "Shelly Plug"} <= eigene_labels() and "Strabag" not in eigene_labels()


def test_firmenkuerzel():
    assert firmenkuerzel_pruefen(" stra ") == "STRA"
    for falsch in ("S", "STRABA", "ST1", "", None):
        with pytest.raises(InventarFehler):
            firmenkuerzel_pruefen(falsch)


def test_naechste_nummer_ohne_luecken_fuellen():
    assert naechste([]) == 1
    assert naechste([1, 2, 4]) == 5           # 3 bleibt frei (Nummer gilt für immer)
    assert naechste([None, 7]) == 8


def test_konflikte():
    neu = {"switch.mannschaft_k": "switch.002_01_c_plug_man", "sensor.a": "sensor.b", "sensor.b": "sensor.c",
           "sensor.x": "sensor.x"}
    belegt = {"switch.mannschaft_k", "sensor.a", "sensor.b", "sensor.x", "switch.002_01_c_plug_man_alt"}
    assert konflikte(neu, belegt) == {}                     # b wird frei, x bleibt gleich
    assert konflikte({"sensor.a": "sensor.fremd"}, {"sensor.a", "sensor.fremd"}) == {"sensor.a": "sensor.fremd"}
    assert konflikte({"sensor.a": "sensor.z", "sensor.b": "sensor.z"}, set()) == {"sensor.b": "sensor.z"}


def _plug(**mehr):
    return {"gg": 1, "geraet_id": "sub_g1", "name": "Heizung 02", "rolle": "heizkoerper", "typ": "konvektor",
            "geraet": {"id": "dev1", "name": "Heizung 02"}, "schalter": {"entity_id": "switch.mannschaft_k", "name": "Heizung 02"},
            "entitaeten": [{"entity_id": "sensor.mannschaft_k_leistung", "name": "Heizung 02 Leistung", "klasse": "power"},
                           {"entity_id": "sensor.mannschaft_k_energie", "name": "Heizung 02 Energie", "klasse": "energy"},
                           {"entity_id": "sensor.mannschaft_k_rssi", "name": "RSSI", "klasse": "signal_strength"}],
            "plug_name": "heizung-02", "bthome": [{"nr": 200, "name": "BLU_1A2B", "neu": "002_C_TEMP_MAN"}],
            "labels": ["Container"], **mehr}


def test_vorschau_plug_und_sensor():
    from logik.inventar import vorschau
    eingabe = {"art": "MAN", "praefix": praefix(nr=2), "plugs": [_plug()], "sensoren": [{
        "typ": "TEMP", "geraet": {"id": "dev2", "name": "BLU H&T"},
        "entitaeten": [{"entity_id": "sensor.blu_temperatur", "name": "Temperatur", "klasse": "temperature"},
                       {"entity_id": "sensor.blu_batterie", "name": "Batterie", "klasse": "battery"}], "labels": []}]}
    v = vorschau(eingabe, belegt={"switch.mannschaft_k", "sensor.mannschaft_k_leistung"})
    neu = {(s["was"], s["alt"]): s["neu"] for s in v["schritte"]}
    assert neu[("HA-Gerät", "Heizung 02")] == "002-01_C_PLUG_MAN"
    assert neu[("Entity-ID", "switch.mannschaft_k")] == "switch.002_01_c_plug_man"
    assert neu[("Entity-ID", "sensor.mannschaft_k_leistung")] == "sensor.002_01_c_plug_man_leistung"
    assert neu[("Heizkörper (Integration)", "Heizung 02")] == "002-01_C_HZ_MAN_Konvektor01"
    assert neu[("Plug-Name", "heizung-02")] == "002-01_C_PLUG_MAN"
    assert neu[("BTHome-Kopplung", "BLU_1A2B")] == "002_C_TEMP_MAN"
    assert neu[("Entity-ID", "sensor.blu_temperatur")] == "sensor.002_c_temp_man_temperatur"
    assert neu[("HA-Gerät", "BLU H&T")] == "002_C_TEMP_MAN"
    assert not any(s["alt"] == "sensor.mannschaft_k_rssi" for s in v["schritte"])   # unbekannte Messwerte bleiben
    assert sorted(s["neu"] for s in v["schritte"] if s["ziel"] == "label") == \
        ["Container", "Mannschaft", "Mannschaft", "Shelly H&Temp Sensor", "Shelly Plug"]
    assert v["konflikte"] == {} and v["zaehler"]["konflikt"] == 0
    assert {s["gruppe"] for s in v["schritte"]} == {"002-01_C_PLUG_MAN", "002_C_TEMP_MAN"}


def test_vorschau_schon_nach_schema_und_konflikt():
    from logik.inventar import vorschau
    fertig = _plug(geraet={"id": "dev1", "name": "002-01_C_PLUG_MAN"},
                   schalter={"entity_id": "switch.002_01_c_plug_man", "name": "002-01_C_PLUG_MAN"}, entitaeten=[], bthome=[],
                   plug_name="002-01_C_PLUG_MAN", name="002-01_C_HZ_MAN_Konvektor01",
                   labels=["Container", "Mannschaft", "Shelly Plug"])
    v = vorschau({"art": "MAN", "praefix": "002", "plugs": [fertig]}, belegt={"switch.002_01_c_plug_man"})
    assert v["zaehler"]["aendern"] == 0 and v["zaehler"]["neu"] == 0
    fremd = vorschau({"art": "MAN", "praefix": "002", "plugs": [_plug(entitaeten=[], bthome=[])]},
                     belegt={"switch.mannschaft_k", "switch.002_01_c_plug_man"})   # Ziel-ID gehört einer fremden Entität
    assert fremd["konflikte"] == {"switch.mannschaft_k": "switch.002_01_c_plug_man"} and fremd["zaehler"]["konflikt"] == 1


def test_vorschau_eigene_labels_weg_und_je_endung_ein_messwert():
    from logik.inventar import vorschau
    pl = _plug(entitaeten=[{"entity_id": "sensor.k_leistung", "name": "Leistung", "klasse": "power"},
                           {"entity_id": "sensor.k_leistung_2", "name": "Leistung 2", "klasse": "power"}],
               bthome=[], labels=["Container", "Lager", "Herberts Liste"])
    v = vorschau({"art": "MAN", "praefix": "002", "plugs": [pl]}, belegt=set())
    labels = {(s["alt"], s["neu"]) for s in v["schritte"] if s["ziel"] == "label"}
    assert labels == {(None, "Mannschaft"), (None, "Shelly Plug"), ("Lager", None)}   # fremdes Label bleibt
    ids = {s["alt"]: s["neu"] for s in v["schritte"] if s["ziel"] == "entitaet_id"}
    assert ids["sensor.k_leistung"] == "sensor.002_01_c_plug_man_leistung" and "sensor.k_leistung_2" not in ids
    assert v["konflikte"] == {}


def test_ausfuehrbar_reihenfolge_und_zusammengefasst():
    from logik.inventar import ausfuehrbar, vorschau
    v = vorschau({"art": "MAN", "praefix": "002", "plugs": [_plug(labels=["Lager"])]}, belegt=set())
    plan = ausfuehrbar(v["schritte"])
    arten = [p["art"] for p in plan]
    assert arten == sorted(arten, key=("entitaet", "geraet", "label", "unter_eintrag").index)
    schalter = next(p for p in plan if p["ref"] == "switch.mannschaft_k")
    assert (schalter["name"], schalter["entity_id"]) == ("002-01_C_PLUG_MAN", "switch.002_01_c_plug_man")
    label = next(p for p in plan if p["art"] == "label")
    assert label["dazu"] == ["Container", "Mannschaft", "Shelly Plug"] and label["weg"] == ["Lager"]
    assert next(p for p in plan if p["art"] == "unter_eintrag")["name"] == "002-01_C_HZ_MAN_Konvektor01"
    assert not any(p["art"] in ("plug", "bthome") for p in plan)   # macht nicht HA (06c)


def test_verweise_tauschen_und_status():
    from logik.inventar import ids_getauscht, status, verweise_tauschen
    schritte = [{"ziel": "entitaet_id", "alt": "switch.a", "neu": "switch.b", "ergebnis": "ok"},
                {"ziel": "entitaet_id", "alt": "sensor.c", "neu": "sensor.d", "ergebnis": "fehler"},
                {"ziel": "entitaet_name", "alt": None, "neu": "B", "ergebnis": "ok"}]
    ids = ids_getauscht(schritte)
    assert ids == {"switch.a": "switch.b"}
    einst = {"tuer": "switch.a", "soll": 20, "symbol": {"tueren": [{"wand": "front", "sensor": "switch.a"}], "licht": None}}
    assert verweise_tauschen(einst, ids) == {"tuer": "switch.b", "soll": 20,
                                             "symbol": {"tueren": [{"wand": "front", "sensor": "switch.b"}], "licht": None}}
    assert status(schritte) == "teilweise"
    assert status([{"ergebnis": "ok"}, {"ergebnis": "gleich"}]) == "ausgefuehrt"
    assert status([{"ergebnis": "ok"}, {"ergebnis": "offen"}]) == "teilweise"   # Plug-Name kommt mit 06c


def test_fuer_plug_und_nachholen_mischen():
    from logik.inventar import fuer_plug, nachholen_mischen, status, vorschau
    v = vorschau({"art": "MAN", "praefix": "002", "plugs": [_plug(bthome=[])]}, belegt=set())
    assert [(s["ref"], s["neu"]) for s in fuer_plug(v["schritte"])] == [("sub_g1", "002-01_C_PLUG_MAN")]
    fertig = vorschau({"art": "MAN", "praefix": "002", "plugs": [_plug(bthome=[], plug_name="002-01_C_PLUG_MAN")]})
    assert fuer_plug(fertig["schritte"]) == []

    alt = [{"ziel": "entitaet_id", "ref": "switch.a", "alt": "switch.a", "neu": "switch.b", "ergebnis": "ok"},
           {"ziel": "plug", "ref": "g1", "alt": "heizung-01", "neu": "001-01_C_PLUG_MAN", "ergebnis": "offen"},
           {"ziel": "plug", "ref": "g2", "alt": "heizung-02", "neu": "001-02_C_PLUG_MAN", "ergebnis": "fehler", "fehler": "offline"},
           {"ziel": "plug", "ref": "g3", "alt": "heizung-03", "neu": "001-03_C_PLUG_MAN", "ergebnis": "offen"}]
    neu = [{"ziel": "entitaet_id", "ref": "switch.b", "alt": "switch.b", "neu": "switch.b", "ergebnis": "gleich"},
           {"ziel": "plug", "ref": "g1", "alt": "heizung-01", "neu": "001-01_C_PLUG_MAN", "ergebnis": "ok"},
           {"ziel": "plug", "ref": "g2", "alt": "heizung-02", "neu": "001-02_C_PLUG_MAN", "ergebnis": "fehler", "fehler": "Timeout"},
           {"ziel": "plug", "ref": "g3", "alt": "001-03_C_PLUG_MAN", "neu": "001-03_C_PLUG_MAN", "ergebnis": "gleich"},
           {"ziel": "label", "ref": "dev9", "alt": None, "neu": "Container", "ergebnis": "ok"}]
    m = nachholen_mischen(alt, neu)
    je = {(s["ziel"], s["ref"]): s for s in m}
    assert je[("plug", "g1")]["ergebnis"] == "ok" and je[("plug", "g1")]["nachgeholt"]
    assert je[("plug", "g2")]["fehler"] == "Timeout" and je[("plug", "g2")]["ergebnis"] == "fehler"
    assert je[("plug", "g3")]["ergebnis"] == "ok" and je[("plug", "g3")]["alt"] == "heizung-03"   # alter Wert bleibt
    assert je[("entitaet_id", "switch.a")]["ergebnis"] == "ok" and ("entitaet_id", "switch.b") not in je
    assert ("label", "dev9") in je and status(m) == "teilweise"
    assert status(nachholen_mischen(m, [{**neu[2], "ergebnis": "ok"}])) == "ausgefuehrt"


def test_rueckgaengig_umkehr_und_eintragen():
    from logik.inventar import ausfuehrbar, fuer_plug, rueckgaengig, zurueck_eintragen
    schritte = [
        {"ziel": "geraet", "ref": "dev1", "was": "HA-Gerät", "alt": "Heizung 01", "neu": "001-01_C_PLUG_MAN", "ergebnis": "ok"},
        {"ziel": "label", "ref": "dev1", "was": "Label", "alt": None, "neu": "Container", "ergebnis": "ok"},
        {"ziel": "label", "ref": "dev1", "was": "Label", "alt": "Lager", "neu": None, "ergebnis": "ok"},
        {"ziel": "entitaet_name", "ref": "switch.hk1", "was": "Name", "alt": None, "neu": "001-01_C_PLUG_MAN", "ergebnis": "ok"},
        {"ziel": "entitaet_id", "ref": "switch.hk1", "was": "Entity-ID", "alt": "switch.hk1", "neu": "switch.001_01_c_plug_man",
         "ergebnis": "ok"},
        {"ziel": "entitaet_id", "ref": "sensor.x", "was": "Entity-ID", "alt": "sensor.x", "neu": "sensor.y", "ergebnis": "fehler"},
        {"ziel": "plug", "ref": "sub_hk1", "was": "Plug-Name", "alt": "Heizung 01", "neu": "001-01_C_PLUG_MAN", "ergebnis": "ok"},
        {"ziel": "unter_eintrag", "ref": "sub_hk1", "was": "Heizkörper", "alt": "Heizkörper 1", "neu": "001-01_C_HZ_MAN_Radiator01",
         "ergebnis": "gleich"},
    ]
    umkehr = rueckgaengig(schritte)
    assert [u["nr"] for u in umkehr] == [6, 4, 3, 2, 1, 0]   # umgekehrt, nur erledigte (nicht fehler, nicht gleich)
    je = {(u["ziel"], u["nr"]): u for u in umkehr}
    assert je[("entitaet_id", 4)]["ref"] == "switch.001_01_c_plug_man" and je[("entitaet_id", 4)]["neu"] == "switch.hk1"
    assert je[("entitaet_name", 3)]["ref"] == "switch.001_01_c_plug_man" and je[("entitaet_name", 3)]["neu"] is None
    plan = ausfuehrbar(umkehr)
    label = next(p for p in plan if p["art"] == "label")
    assert label["dazu"] == ["Lager"] and label["weg"] == ["Container"]
    assert next(p for p in plan if p["art"] == "geraet")["name"] == "Heizung 01"
    assert [p["neu"] for p in fuer_plug(umkehr)] == ["Heizung 01"]

    ergebnis = [{**u, "ergebnis": "ok"} for u in umkehr]
    ergebnis[0] = {**ergebnis[0], "ergebnis": "fehler", "fehler": "nicht erreichbar"}   # Plug offline
    neu, stand = zurueck_eintragen(schritte, ergebnis)
    assert stand == "zurueck_teilweise" and neu[6]["zurueck_fehler"] == "nicht erreichbar" and neu[0]["zurueck"] == "ok"
    rest = rueckgaengig(neu)
    assert [u["nr"] for u in rest] == [6]   # nochmal: nur der Plug
    fertig, stand = zurueck_eintragen(neu, [{**rest[0], "ergebnis": "ok"}])
    assert stand == "zurueck" and "zurueck_fehler" not in fertig[6]


def test_zuordnen_regeln():
    from logik.inventar import HAENGT, nummer_frei, typ_vorschlag
    assert typ_vorschlag(schalter=True, klassen=["power", "energy"]) == "PLUG"
    assert typ_vorschlag(schalter=False, klassen=["temperature", "humidity", "battery"]) == "TEMP"
    assert typ_vorschlag(schalter=False, klassen=["door", "battery"]) == "DOOR"
    assert typ_vorschlag(schalter=False, klassen=["window"]) == "FEN"
    assert typ_vorschlag(schalter=False, klassen=["battery"]) is None
    assert HAENGT["radiator"] == ("heizkoerper", "oelradiator") and HAENGT["bautrockner"][0] == "bautrockner"
    assert nummer_frei(4, [1, 2]) == 4
    with pytest.raises(InventarFehler):
        nummer_frei(2, [1, 2])
    with pytest.raises(InventarFehler):
        nummer_frei(0, [])


def test_abgleich_ha_gilt_inventar_nur_anzeigen() -> None:
    """BSM-034.04: HA-Zuordnung wird nachgetragen, Ausrüstung nur im Inventar wird nur gemeldet."""
    from logik.inventar import abgleich

    nach, fremd = abgleich(["mac:1", "mac:2", "mac:2", "bt:3"], {"mac:1": "a1", "mac:9": "a9"})
    assert nach == ["mac:2", "bt:3"] and fremd == ["a9"]
    assert abgleich([], {}) == ([], [])


def test_abweichend_zaehlt_wie_uebernehmen():
    from logik.inventar import abweichend, vorschau
    roh = vorschau({"art": "MAN", "praefix": "002", "plugs": [_plug(entitaeten=[], bthome=[])]}, belegt=set())
    assert abweichend(roh["schritte"]) == sum(1 for s in roh["schritte"] if s["zustand"] != "gleich") > 0
    fertig = _plug(geraet={"id": "dev1", "name": "002-01_C_PLUG_MAN"},
                   schalter={"entity_id": "switch.002_01_c_plug_man", "name": "002-01_C_PLUG_MAN"}, entitaeten=[], bthome=[],
                   plug_name="002-01_C_PLUG_MAN", name="002-01_C_HZ_MAN_Konvektor01",
                   labels=["Container", "Mannschaft", "Shelly Plug"])
    assert abweichend(vorschau({"art": "MAN", "praefix": "002", "plugs": [fertig]}, belegt=set())["schritte"]) == 0   # „Namen ✓“
    konfl = vorschau({"art": "MAN", "praefix": "002", "plugs": [_plug(entitaeten=[], bthome=[])]},
                     belegt={"switch.mannschaft_k", "switch.002_01_c_plug_man"})
    assert abweichend(konfl["schritte"]) == abweichend(roh["schritte"])   # Konflikt zählt mit (weicht ab)
    assert abweichend([]) == 0


def test_mit_zuordnung_plug_naechste_nummer_und_vorschau():
    from logik.inventar import NEU_ZUGEORDNET, mit_zuordnung, vorschau
    eingabe = {"art": "MAN", "praefix": "002", "plugs": [_plug(gg=3, bthome=[])], "sensoren": []}
    neu = mit_zuordnung(eingabe, typ="PLUG", haengt="radiator", geraet={"id": "dev9", "name": "shellyplug-9", "original": "shellyplug-9"},
                        schalter={"entity_id": "switch.shellyplug_9", "name": None}, labels_=[],
                        entitaeten=[{"entity_id": "sensor.shellyplug_9_power", "name": None, "klasse": "power"},
                                    {"entity_id": "sensor.shellyplug_9_rssi", "name": None, "klasse": "signal_strength"}])
    assert len(eingabe["plugs"]) == 1   # Eingabe bleibt unverändert
    plug = neu["plugs"][-1]
    assert (plug["gg"], plug["geraet_id"], plug["rolle"], plug["typ"]) == (4, NEU_ZUGEORDNET, "heizkoerper", "oelradiator")
    assert [e["entity_id"] for e in plug["entitaeten"]] == ["sensor.shellyplug_9_power"]
    v = vorschau(neu, belegt=set())
    ids = {s["alt"]: s["neu"] for s in v["schritte"] if s["ziel"] == "entitaet_id"}
    assert ids["switch.shellyplug_9"] == "switch.002_04_c_plug_man"
    assert any(s["neu"] == "002-04_C_HZ_MAN_Radiator01" for s in v["schritte"] if s["ziel"] == "unter_eintrag")
    # Plugs ohne gespeicherte Nummer zählen wie im Inventar nach dem neuen weiter
    lose = mit_zuordnung({**eingabe, "plugs": [_plug(gg=1, gg_fest=False, bthome=[])]}, typ="PLUG",
                         geraet={"id": "dev9", "name": "x"}, schalter={"entity_id": "switch.x"}, entitaeten=[], labels_=[])
    assert [(x["geraet_id"], x["gg"]) for x in lose["plugs"]] == [("sub_g1", 2), (NEU_ZUGEORDNET, 1)]
    # schon im Container: nichts doppelt
    assert mit_zuordnung(eingabe, typ="PLUG", geraet={"id": "dev1", "name": "Heizung 02"}, entitaeten=[], labels_=[])["plugs"] == eingabe["plugs"]


def test_mit_zuordnung_sensor_ans_ende_seiner_art():
    from logik.inventar import InventarFehler as Fehler, mit_zuordnung, vorschau
    tuer = {"typ": "DOOR", "geraet": {"id": "d1", "name": "Tür"}, "entitaeten": [], "labels": []}
    eingabe = {"art": "MAN", "praefix": "002", "plugs": [], "sensoren": [tuer]}
    neu = mit_zuordnung(eingabe, typ="DOOR", geraet={"id": "d2", "name": "Tür hinten"}, labels_=[],
                        entitaeten=[{"entity_id": "binary_sensor.tuer_hinten", "name": None, "klasse": "door"}])
    v = vorschau(neu, belegt=set())
    assert {s["gruppe"] for s in v["schritte"]} == {"002_C_DOOR_MAN", "002_C_DOOR_MAN_2"}
    assert next(s for s in v["schritte"] if s["alt"] == "binary_sensor.tuer_hinten")["neu"] == "binary_sensor.002_c_door_man_2_tuer"
    with pytest.raises(Fehler):
        mit_zuordnung(eingabe, typ="PUMP", geraet={"id": "d3"}, entitaeten=[], labels_=[])


def test_sensor_verdrahtung_dieselbe_regel_wie_zuordnen():
    """Gutachten M1: ein zweiter Fühler wird nicht eingetragen – die Vorschau darf ihn dann nicht umbenennen."""
    from logik.inventar import nicht_eingetragen, sensor_verdrahtung
    leer = {"fuehler": None, "tuer": None, "symbol": None}
    assert sensor_verdrahtung("TEMP", "sensor.t2", **leer)["feld"] == "fuehler"
    assert sensor_verdrahtung("TEMP", "sensor.t2", **{**leer, "fuehler": "sensor.t1"}) is None   # zweiter Fühler
    assert sensor_verdrahtung("TEMP", None, **leer) is None   # kein Messwert
    assert sensor_verdrahtung("DOOR", "binary_sensor.d1", **leer) == {
        "feld": "tuer", "wert": "binary_sensor.d1", "text": "als Türkontakt des Containers eingetragen"}
    weitere = sensor_verdrahtung("DOOR", "binary_sensor.d2", **{**leer, "tuer": "binary_sensor.d1"})
    assert weitere["feld"] == "symbol" and weitere["text"].startswith("als Tür ")
    assert sensor_verdrahtung("DOOR", "binary_sensor.d1", **{**leer, "tuer": "binary_sensor.d1"}) is None   # schon drin
    assert sensor_verdrahtung("FEN", "binary_sensor.f1", **leer)["text"] == "als Fenster 1 des Containers eingetragen"
    assert sensor_verdrahtung("PLUG", "switch.x", **leer) is None
    assert "Fühler" in nicht_eingetragen("TEMP") and "Inventar" in nicht_eingetragen("FEN")


def test_mit_zuordnung_nicht_verdrahtet_bleibt_eingabe():
    from logik.inventar import mit_zuordnung, vorschau
    t1 = {"typ": "TEMP", "geraet": {"id": "t1", "name": "Fühler"}, "entitaeten": [], "labels": []}
    eingabe = {"art": "MAN", "praefix": "002", "plugs": [], "sensoren": [t1]}
    neu = mit_zuordnung(eingabe, typ="TEMP", geraet={"id": "t2", "name": "Fühler 2"}, labels_=[], verdrahtet=False,
                        entitaeten=[{"entity_id": "sensor.t2", "name": None, "klasse": "temperature"}])
    assert neu["sensoren"] == [t1]
    assert not any(s.get("ref") == "t2" for s in vorschau(neu, belegt=set())["schritte"])
