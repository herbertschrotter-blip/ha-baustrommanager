"""Eingeschaltete Einstellungen je Container (Mockup eingestellt.html, Variante C) – Beispielzahlen aus dem Mockup."""

from dataclasses import replace
import json
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "custom_components" / "baustelle"))   # auch ohne pytest (unten)

from logik.eingestellt import AUS, AUTOMATIK_AUS, AUTOMATIK_AUS_FROST, HAND, LERNEN_ZEITPLAN, TASTE_OHNE_NP, Lage, eingestellt, zahl  # noqa: E402
from logik.regelung import modus_von  # noqa: E402

# Standardwerte wie einstellungen.STANDARD (Auszug)
GRUND_H = {"vorheizen_min": 45, "nachheizen_min": 15, "fruehstart": True, "fruehstart_unter": 0.0, "fruehstart_min": 30,
           "warm_vor_min": 0, "warm_nach_min": 0, "stufen_abstand": 1.5, "stufen_min": 30, "stufen_kalt": -5.0, "frost": True,
           "frost_grenze": 5.0, "frost_aus": None, "frei_modus": "frost", "absenk": 10.0, "frost_immer": False, "frost_aussen": -3.0,
           "trocknen_ab_mm": 2.0, "trocknen_laenger_min": 45, "trocknen_frueher_min": 15, "tuer_pause_min": 3, "tuer_melden_min": 10,
           "feiertag_frei": True, "notprogramm": False, "taste": False}
H = {**GRUND_H, "notprogramm": True, "taste": True}
ST = {"an": True, "nutzbar_prozent": 67, "max_gleichzeitig": 5}
# lernender Poliercontainer wie im Mockup (Lage „viele an“)
VIELE = Lage(heizung=H, staffel=ST, automatik=True, modus="thermo", fuehler=True, heizkoerper=2, primaer="Radiator 1",
             zusatz=("Radiator 2",), kontakte=("Tür 1",),
             bereich={"lernen": True, "warm_vor": 30, "warm_nach": None, "trocknen": True, "stufen": True, "prio": "hoch"})
# Zeitplan ohne Fühler, nur Grundregeln (Lage „wenige“)
WENIGE = Lage(heizung={**GRUND_H}, staffel={**ST, "an": False}, automatik=True, modus="plan", fuehler=False,
              heizkoerper=1, bereich={"prio": "normal"})


def ks(lage: Lage) -> list[str]:
    return [x["k"] for x in eingestellt(lage)]


def von(lage: Lage, k: str) -> dict:
    return next(x for x in eingestellt(lage) if x["k"] == k)


def test_viele_reihenfolge_erst_container_dann_baustelle():
    assert ks(VIELE) == ["lernen", "warm", "trocknen", "stufen", "prio", "tuer", "frost", "feiertag", "staffel", "notprogramm", "taste"]
    L = eingestellt(VIELE)
    assert [x["von"] for x in L] == ["container"] * 6 + ["baustelle"] * 5
    assert all(x["wirkt"] and x["grund"] is None for x in L)
    assert set(L[0]) == {"k", "ic", "text", "kurz", "satz", "von", "wirkt", "grund", "ziel"}


def test_lernend_ohne_vorheizen_nachheizen_fruehstart():
    assert not {"vorheizen", "nachheizen", "fruehstart"} & set(ks(VIELE))
    nicht = replace(VIELE, bereich={**VIELE.bereich, "lernen": False})
    assert {"vorheizen", "nachheizen", "fruehstart"} <= set(ks(nicht)) and "warm" not in ks(nicht) and "lernen" not in ks(nicht)


def test_texte_wie_im_mockup():
    assert von(VIELE, "warm")["text"] == "warm 30 min vor Beginn" and von(VIELE, "warm")["kurz"] == "−30 min"
    assert von(VIELE, "warm")["satz"].startswith("Eigener Wert dieses Containers: Das Soll ist 30 min vor Arbeitsbeginn erreicht")
    assert "(die Baustelle: bei Arbeitsbeginn)" in von(VIELE, "warm")["satz"]
    assert von(VIELE, "frost")["text"] == "Frostschutz unter 5°" and von(VIELE, "frost")["kurz"] == "5°"
    assert von(VIELE, "frost")["satz"] == "Hält den Container auch nachts, am Wochenende und im Urlaub über 5 °C (aus erst über 7 °C)."
    assert von(VIELE, "tuer")["text"] == "Tür-Pause 3 min" and von(VIELE, "tuer")["kurz"] == "Tür 3′"
    assert von(VIELE, "tuer")["satz"] == "Kontakt „Tür 1“: Ist die Tür offen, pausiert die Heizung nach 3 min; nach 10 min kommt eine Nachricht."
    # AN-0021: unveränderte alte Werte (2 mm/45/15) → Vorgabe-Stufen nach dem Regen in der Arbeitszeit
    assert von(VIELE, "trocknen")["satz"] == ("Nach Regen in der Arbeitszeit heizt dieser Container länger nach der Arbeit und am nächsten "
                                              "Morgen früher: ab 2 mm 60 min länger, 15 min früher; ab 5 mm 100 min länger, 30 min früher.")
    assert "Primärheizkörper (Radiator 1); Radiator 2 kommt dazu, wenn es draußen unter −5 °C hat, der Raum mehr als 1,5 °C" in von(VIELE, "stufen")["satz"]
    assert von(VIELE, "prio")["text"] == "Vorrang hoch" and "vor den anderen dran" in von(VIELE, "prio")["satz"]
    assert "67 % je Anschluss nutzbar, höchstens 5 zugleich" in von(VIELE, "staffel")["satz"]
    # die Erklärung aus dem früheren Chip „🧠 lernt mit“ steht jetzt hier
    assert von(VIELE, "lernen")["satz"].startswith("Lernt bei jedem Heizen mit: wie schnell dieser Container warm wird")
    assert "statt Vorheizen, Kälte-Frühstart und Nachheizen" in von(VIELE, "lernen")["satz"]


def test_ziele_nur_bekannte_sprungziele():
    alle = eingestellt(VIELE) + eingestellt(replace(VIELE, bereich={"lernen": False}))
    assert {x["ziel"] for x in alle} <= {"container:lernen", "container:trocknen", "bearbeiten:warm", "bearbeiten:stufen", "strom:vorrang",
                                         "regeln:tuer", "regeln:frost", "regeln:vorheizen", "regeln:nachheizen", "regeln:fruehstart",
                                         "urlaub", "strom", "notprogramm"}


def test_wenige_zeitplan_ohne_fuehler():
    assert ks(WENIGE) == ["frost", "vorheizen", "nachheizen", "fruehstart", "feiertag"]
    assert von(WENIGE, "frost")["text"] == "Frostschutz unter −3° außen" and "aus erst ab −1 °C" in von(WENIGE, "frost")["satz"]
    assert von(WENIGE, "vorheizen")["text"] == "Vorheizen 45 min" and von(WENIGE, "nachheizen")["kurz"] == "15′ nach"
    assert von(WENIGE, "feiertag")["satz"] == "An Feiertagen und im Urlaub wird nicht geheizt, nur der Frostschutz läuft."
    # ohne Fühler und ohne Außen-Grenze kein Frostschutz
    assert "frost" not in ks(replace(WENIGE, heizung={**WENIGE.heizung, "frost_aussen": None}))


def test_nur_was_an_ist_und_gilt():
    aus = {**H, "frost": False, "vorheizen_min": 0, "nachheizen_min": 0, "fruehstart": False, "feiertag_frei": False, "notprogramm": False, "taste": False}
    leer = replace(WENIGE, heizung=aus)
    assert ks(leer) == []
    # Zusatz erst ab zwei Heizkörpern, Vorrang „normal“ und ohne Staffelung nicht, Tür nur mit Kontakt
    assert "stufen" not in ks(replace(VIELE, heizkoerper=1))
    assert "prio" not in ks(replace(VIELE, bereich={**VIELE.bereich, "prio": "normal"}))
    assert "prio" not in ks(replace(VIELE, staffel={**ST, "an": False})) and "staffel" not in ks(replace(VIELE, staffel={**ST, "an": False}))
    assert "tuer" not in ks(replace(VIELE, kontakte=()))
    # lernen ohne Fühler gibt es nicht; Warm ab nur mit eigenem Wert
    assert "lernen" not in ks(replace(VIELE, fuehler=False))
    assert "warm" not in ks(replace(VIELE, bereich={**VIELE.bereich, "warm_vor": None}))


def test_bei_bedarf():
    b = replace(VIELE, modus="bedarf", bereich={**VIELE.bereich, "lernen": False})
    assert ks(b) == ["stufen", "prio", "tuer", "frost", "vorheizen", "staffel", "notprogramm", "taste"]
    assert von(b, "vorheizen")["satz"] == "Heizt 45 min vor jedem Termin an."


def test_hand_nur_frost_tuer_notprogramm_wirken():
    hand = replace(VIELE, modus="hand")
    assert ks(hand) == ks(VIELE)   # dieselben Chips wie in Thermostat, nur gedämpft
    L = eingestellt(hand)
    assert [x["k"] for x in L if x["wirkt"]] == ["tuer", "frost", "notprogramm"]
    assert all(x["grund"] == HAND for x in L if not x["wirkt"])
    assert "im Modus Hand die Heizung, wie sie ist – nur der Frostschutz läuft im Plug weiter" in von(hand, "notprogramm")["satz"]


def test_modus_aus_und_automatik_aus():
    L = eingestellt(replace(VIELE, modus="aus"))
    assert [x["k"] for x in L if x["wirkt"]] == ["frost", "notprogramm"] and all(x["grund"] == AUS for x in L if not x["wirkt"])
    L = eingestellt(replace(VIELE, automatik=False))
    assert not any(x["wirkt"] for x in L) and all(x["grund"] == AUTOMATIK_AUS for x in L)
    L = eingestellt(replace(VIELE, automatik=False, heizung={**H, "frost_immer": True}))
    assert [x["k"] for x in L if x["wirkt"]] == ["frost"] and all(x["grund"] == AUTOMATIK_AUS_FROST for x in L if not x["wirkt"])
    assert "auch wenn die Automatik aus ist" in von(replace(VIELE, heizung={**H, "frost_immer": True}), "frost")["satz"]


def test_lernen_im_zeitplan_und_taste_ohne_notprogramm():
    plan = replace(VIELE, modus="plan")
    assert von(plan, "lernen")["wirkt"] is False and von(plan, "lernen")["grund"] == LERNEN_ZEITPLAN
    assert {"vorheizen", "nachheizen", "fruehstart"} <= set(ks(plan))   # im Zeitplan gelten die Werte der Baustelle
    t = von(replace(VIELE, heizung={**H, "notprogramm": False}), "taste")
    assert t["wirkt"] is False and t["grund"] == TASTE_OHNE_NP


def test_feiertag_absenken_und_alles_aus():
    ab = replace(VIELE, heizung={**H, "frei_modus": "absenk", "absenk": 10.0})
    assert von(ab, "feiertag")["text"] == "Feiertage frei · absenken 10°" and von(ab, "feiertag")["kurz"] == "frei 10°"
    alles = replace(VIELE, heizung={**H, "frei_modus": "aus"})
    assert von(alles, "feiertag")["text"] == "Feiertage frei · alles aus"
    assert "nachts und am Wochenende über 5 °C" in von(alles, "frost")["satz"]


def test_zahl():
    assert [zahl(x) for x in (5, 5.0, -3, 1.5, 2.25, -0.5)] == ["5", "5", "−3", "1,5", "2,2", "−0,5"]


# ---- Beispieldaten der Seite (tests/panel/struktur-0.7.json, glas.html) bleiben aus dieser Regel gerechnet
STRUKTUR = Path(__file__).resolve().parents[1] / "panel" / "struktur-0.7.json"
STANDARD_STAFFEL = {"an": True, "nutzbar_prozent": 67, "max_gleichzeitig": 5}


def beispiel(b: dict) -> dict:
    """`laufzeit.container.<id>.eingestellt` einer Baustelle der Beispieldaten, wie daten.py es liefert."""
    e, lz = b["einstellungen"], b["laufzeit"]["container"]
    h, st = {**GRUND_H, **e.get("heizung", {})}, {**STANDARD_STAFFEL, **e.get("staffel", {})}
    aus = {}
    for x in b["bereiche"]:
        if x["id"] not in lz:   # abgeschlossene Baustelle: keine Laufzeit
            continue
        if x["art"] != "container" or "heizung" not in b["funktionen"]:
            aus[x["id"]] = None
            continue
        be = (e.get("bereiche") or {}).get(x["id"], {})
        heizer = [g for g in b["geraete"] if g["bereich"] == x["id"] and g["rolle"] == "heizung"
                  and ((e.get("geraete") or {}).get(g["id"], {}).get("status") or "aktiv") == "aktiv"]
        stf = lz.get(x["id"], {}).get("stufen") or {}
        namen = {g["id"]: g["name"] for g in heizer}
        lage = Lage(heizung=h, staffel=st, bereich=be, automatik=bool(e.get("automatik")),
                    modus=lz.get(x["id"], {}).get("modus") or modus_von(be, bool(x.get("fuehler"))) or "plan", fuehler=bool(x.get("fuehler")),
                    heizkoerper=len(heizer), primaer=namen.get((stf.get("haupt") or [None])[0]),
                    zusatz=tuple(namen[g] for g in stf.get("zusatz") or [] if g in namen),
                    kontakte=tuple(s["name"] for s in x.get("sensoren") or [] if s["art"] in ("tuer", "fenster")))
        aus[x["id"]] = eingestellt(lage)
    return aus


def test_beispieldaten_der_seite_aktuell():
    """Wer die Regel ändert, schreibt die Beispieldaten neu: python3 tests/logik/test_eingestellt.py"""
    for b in json.loads(STRUKTUR.read_text(encoding="utf-8")):
        for bid, soll in beispiel(b).items():
            assert b["laufzeit"]["container"][bid].get("eingestellt") == soll, (b["baustelle"]["entry_id"], bid)


if __name__ == "__main__":   # Beispieldaten neu schreiben: python3 tests/logik/test_eingestellt.py
    daten = json.loads(STRUKTUR.read_text(encoding="utf-8"))
    for b in daten:
        for bid, liste in beispiel(b).items():
            b["laufzeit"]["container"][bid]["eingestellt"] = liste
    STRUKTUR.write_text(json.dumps(daten, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
