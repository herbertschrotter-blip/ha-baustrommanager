"""Programm für das Notprogramm in den Plugs (logik/notprogramm, BSM-017)."""

from dataclasses import replace
import json

from logik.arbeitszeit import Plan
from logik.notprogramm import (
    LEER, MAX_WERT, Vorgaben, frost, minuten_fenster, modus, programm, stand, tag_wert, verwaist, zusammenfassen, haengt, LEBENSZEICHEN_FRISCH,
)

T0 = 1791158400   # Mo 05.10.2026 00:00 UTC
H = 3600
TAG = 24 * H
WOCHE = {T0 + i * TAG: i for i in range(7)}   # Mo = 0

V = Vorgaben(automatik=True, auto=True, hand=False, aktiv=True, modus="thermo", bedarf=False, toleranz=0.3,
             frost=True, frost_grenze=5.0, frost_aus=None, frost_immer=False, tuer_pause_min=3, temp_nr=202)


def test_modus_wie_die_regelung() -> None:
    assert modus(V) == "thermo"
    assert modus(replace(V, temp_nr=None)) == "plan"          # Fühler nicht am Plug: in der Heizzeit an
    assert modus(replace(V, modus="plan")) == "plan"
    assert modus(replace(V, bedarf=True)) == "bedarf"
    assert modus(replace(V, modus="aus")) == "aus"
    assert modus(replace(V, automatik=False)) == "hand"
    assert modus(replace(V, auto=False)) == "hand"
    assert modus(replace(V, hand=True)) == "hand"
    assert modus(replace(V, aktiv=False, hand=True)) == "aus"  # inaktiv: die Automatik lässt es aus


def test_frost() -> None:
    assert frost(V) == (5.0, 7.0)
    assert frost(replace(V, frost_aus=8.5)) == (5.0, 8.5)
    assert frost(replace(V, frost=False)) == (None, None)
    assert frost(replace(V, automatik=False)) == (None, None)
    assert frost(replace(V, automatik=False, frost_immer=True)) == (5.0, 7.0)
    assert frost(replace(V, aktiv=False)) == (None, None)


def test_minuten_fenster_legt_abschnitte_zusammen() -> None:
    plan = Plan(start=345, vor=375, a=420, b=990, nach=1005, ende=1050, eigene=((1200, 1260),))
    assert minuten_fenster(plan) == [(345, 1050), (1200, 1260)]
    assert minuten_fenster(None) == []


def test_zusammenfassen_rundet_nach_aussen() -> None:
    f = zusammenfassen([(T0 + 6 * H + 7 * 60, T0 + 9 * H + 1, 20.04), (T0 + 9 * H, T0 + 10 * H, 20.0),
                        (T0 + 12 * H, T0 + 12 * H, 20.0)])
    assert f == [(T0 + 6 * H, T0 + 10 * H, 20.0)]   # 06:07 → 06:00, 09:00:01 → 09:15, verbunden; leeres weg


def test_tag_wert_bleibt_unter_der_grenze() -> None:
    viele = [(T0 + i * 1800, T0 + i * 1800 + 600 + i, 20.0) for i in range(30)]
    wert = tag_wert(viele)
    assert len(wert) <= MAX_WERT
    teile = [tuple(map(float, x.split(","))) for x in wert.split(";")]
    assert teile[0][0] == T0 and teile[-1][1] == viele[-1][1]   # nichts verloren, nur verbunden
    assert tag_wert([]) == LEER


def test_programm_je_wochentag() -> None:
    jetzt = T0 + 8 * H
    fenster = [
        (T0 + 6 * H, T0 + 17 * H, 20.0),               # heute, läuft gerade
        (T0 - TAG + 6 * H, T0 - TAG + 17 * H, 20.0),   # gestern, vorbei
        (T0 + TAG + 6 * H, T0 + TAG + 17 * H, 20.0),   # Di
        (T0 + 2 * TAG - H, T0 + 2 * TAG + 2 * H, 21.0),   # Di 23:00 bis Mi 02:00 → Di
        (T0 + 6 * TAG + 6 * H, T0 + 6 * TAG + 12 * H, 10.0),   # So, absenken
    ]
    w = programm(V, fenster, WOCHE, jetzt)
    assert set(w) == {"bs_cfg"} | {f"bs_p{i}" for i in range(7)}
    assert w["bs_p0"] == f"{T0 + 6 * H},{T0 + 17 * H},20"
    assert w["bs_p1"] == f"{T0 + TAG + 6 * H},{T0 + TAG + 17 * H},20;{T0 + 2 * TAG - H},{T0 + 2 * TAG + 2 * H},21"
    assert w["bs_p2"] == LEER and w["bs_p6"].endswith(",10")
    cfg = json.loads(w["bs_cfg"])
    assert {k: cfg[k] for k in ("m", "tol", "fe", "fa", "t", "d", "tp")} == {
        "m": "thermo", "tol": 0.3, "fe": 5.0, "fa": 7.0, "t": 202, "d": None, "tp": 3}
    assert all(len(x) <= MAX_WERT for x in w.values())


def test_stand_aendert_sich_mit_dem_inhalt() -> None:
    a = programm(V, [(T0 + 6 * H, T0 + 17 * H, 20.0)], WOCHE, T0)
    b = programm(V, [(T0 + 6 * H, T0 + 17 * H, 20.0)], WOCHE, T0 + H)
    c = programm(V, [(T0 + 6 * H, T0 + 17 * H, 21.0)], WOCHE, T0)
    assert stand(a) == stand(b) != stand(c)
    assert stand({}) is None


def test_kopplungen() -> None:
    from logik.notprogramm import Kopplung, kopplungen
    f, t, fremd = "fc:00:00:00:00:01", "08:00:00:00:00:02", "fc:00:00:00:00:09"
    gewollt = {f: ("002_C_TEMP_MAN", "fuehler"), t: ("002_C_DOOR_MAN", "tuer")}
    # alles in Ordnung → nichts zu tun
    geraete = {f: (200, "002_C_TEMP_MAN"), t: (201, "002_C_DOOR_MAN")}
    sensoren = {(f, 1): (200, "002_C_TEMP_MAN_Batterie"), (f, 46): (201, "002_C_TEMP_MAN_Feuchte"),
                (f, 69): (202, "002_C_TEMP_MAN_Temperatur"), (t, 1): (203, "002_C_DOOR_MAN_Batterie"),
                (t, 45): (204, "002_C_DOOR_MAN_Tuer"), (t, 63): (205, "002_C_DOOR_MAN_Drehung"),
                (t, 100): (206, "002_C_DOOR_MAN_Lichtstufe")}
    assert kopplungen(gewollt, geraete, sensoren) == []
    # Tür fehlt ganz, Fühler falsch benannt, fremder Fühler gekoppelt, Display mit Licht (zusätzlich, bleibt)
    geraete2 = {f: (200, "Shelly BLU H&T"), fremd: (202, "alt")}
    sensoren2 = {(f, 1): (200, None), (f, 69): (202, "002_C_TEMP_MAN_Temperatur"), (f, 30): (207, None),
                 (fremd, 69): (209, "alt_Temperatur")}
    schritte = kopplungen(gewollt, geraete2, sensoren2)
    arten = [(k.art, k.adresse, k.obj) for k in schritte]
    assert arten[:2] == [("sensor_weg", fremd, None), ("geraet_weg", fremd, None)]
    assert ("geraet_neu", t, None) in arten and ("sensor_neu", t, 45) in arten and ("sensor_neu", f, 46) in arten
    assert ("geraet_name", f, None) in arten
    assert ("sensor_neu", f, 69) not in arten and ("sensor_neu", f, 1) not in arten   # schon da
    assert next(k for k in schritte if k.art == "geraet_neu").name == "002_C_DOOR_MAN"
    assert {k.name for k in schritte if k.art == "sensor_neu" and k.adresse == t} == {
        "002_C_DOOR_MAN_Batterie", "002_C_DOOR_MAN_Tuer", "002_C_DOOR_MAN_Drehung", "002_C_DOOR_MAN_Lichtstufe"}
    namen = {k.nr: k.name for k in schritte if k.art == "sensor_name"}
    assert namen == {200: "002_C_TEMP_MAN_Batterie", 207: "002_C_TEMP_MAN_Licht"}
    assert max(i for i, k in enumerate(schritte) if k.art.endswith("_weg")) < min(i for i, k in enumerate(schritte) if k.art.endswith("_neu"))
    # nichts gewollt (Container ohne BLU-Sensor) → alles Fremde weg
    assert [k.art for k in kopplungen({}, {fremd: (202, "alt")}, {(fremd, 69): (209, None)})] == ["sensor_weg", "geraet_weg"]


def test_gueltig_bis() -> None:
    from logik.notprogramm import gueltig_bis
    w = programm(V, [(T0 + 6 * H, T0 + 17 * H, 20.0), (T0 + 3 * TAG + 6 * H, T0 + 3 * TAG + 12 * H, 20.0)], WOCHE, T0)
    assert gueltig_bis(w) == T0 + 3 * TAG + 12 * H
    assert gueltig_bis(programm(V, [], WOCHE, T0)) is None


def test_stundenbuch() -> None:
    from logik.notprogramm import BuchStunde, buch_lesen, im_ausfall
    h = T0 // 3600
    werte = {"bb_0": f"{h},120,30,215,60;{h + 1},500,60,,0", "bb_1": f"{h + 6},0,0,198,0;kaputt;{h + 7},x,1,1,1", "bs_cfg": "{}",
             "bb_2": f"{h + 1},510,60,201,0"}   # dieselbe Stunde noch einmal: die letzte gilt
    buch = buch_lesen(werte)
    assert [s.stunde for s in buch] == [h, h + 1, h + 6]
    assert buch[0] == BuchStunde(h, 120.0, 30, 21.5, 60) and buch[1].wh == 510 and buch[1].temperatur == 20.1
    # Ausfall 00:40 bis 06:10 → Stunden 0, 1 und 6
    assert [s.stunde for s in im_ausfall(buch, T0 + 40 * 60, T0 + 6 * H + 600)] == [h, h + 1, h + 6]
    assert [s.stunde for s in im_ausfall(buch, T0 + H, T0 + 2 * H)] == [h + 1]


def test_verwaist_entfernt_umgestellt_oder_weitergegeben() -> None:
    """BSM-034.01: Plugs mit Skript, die kein Heizkörper dieser Baustelle mehr sind."""
    bekannt = {"g1": "switch.a", "g2": "switch.b", "g3": "switch.c", "g4": "switch.d"}
    aktuell = {"g1": "switch.a", "g5": "switch.c"}   # g3 neu angelegt als g5 (gleicher Schalter)
    abschalten, vergessen = verwaist(bekannt, aktuell, {"switch.d"})   # g4 jetzt in einer anderen Baustelle
    assert abschalten == ["g2"]
    assert vergessen == ["g3", "g4"]
    assert verwaist({}, aktuell, ()) == ([], [])


def test_haengt_nach_fuenf_minuten_ohne_schalten() -> None:
    """Audit 0.8.165: ohne frische Auswertung kein Lebenszeichen mehr."""
    from datetime import UTC, datetime, timedelta

    jetzt = datetime(2026, 10, 30, 12, 0, tzinfo=UTC)
    assert haengt(None, jetzt)
    assert not haengt(jetzt - LEBENSZEICHEN_FRISCH, jetzt)
    assert haengt(jetzt - LEBENSZEICHEN_FRISCH - timedelta(seconds=1), jetzt)
