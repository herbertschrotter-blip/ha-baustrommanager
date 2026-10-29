"""Vertrag Seite ↔ Integration (docs/api-0.7.md): die echte Antwort von `baustelle/struktur` hat dieselben Schlüssel
und Typen wie das Beispiel `tests/panel/struktur-0.7.json`, gegen das die Seite getestet wird."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import pytest

from homeassistant.core import HomeAssistant, ServiceCall, SupportsResponse


from .conftest import C1, C2, HK1, HK2

BEISPIEL = Path(__file__).resolve().parents[1] / "panel" / "struktur-0.7.json"

# Maps mit IDs als Schlüssel: jeder Wert wird mit dem ersten Beispielwert verglichen
ID_MAPS = {
    "entitaeten", "einstellungen.bereiche", "einstellungen.stumm", "laufzeit.container", "laufzeit.geraete",
    "laufzeit.abschnitte", "laufzeit.abschnitte.*", "geraete_links",
}
# frei belegte Schlüssel (hängen von der Einrichtung ab)
FREI = {"baustelle.optionen", "zaehler"}


def _typ(wert: Any) -> str:
    if isinstance(wert, bool):
        return "bool"
    if isinstance(wert, (int, float)):
        return "zahl"
    return type(wert).__name__


def _vergleiche(beispiel: Any, echt: Any, pfad: str, muster: str, fehler: list[str]) -> None:
    if beispiel is None or echt is None or muster in FREI:
        return  # null ist überall erlaubt, wo es das Beispiel auch kennt bzw. der Wert optional ist
    if _typ(beispiel) != _typ(echt):
        fehler.append(f"{pfad}: Typ {_typ(echt)} statt {_typ(beispiel)}")
        return
    if isinstance(beispiel, dict):
        if muster in ID_MAPS:
            if beispiel:
                vorlage = next(iter(beispiel.values()))
                for k, v in echt.items():
                    _vergleiche(vorlage, v, f"{pfad}.{k}", f"{muster}.*", fehler)
            return
        for k, v in beispiel.items():
            if k not in echt:
                fehler.append(f"{pfad}.{k}: fehlt")
                continue
            _vergleiche(v, echt[k], f"{pfad}.{k}", f"{muster}.{k}" if muster else k, fehler)
    elif isinstance(beispiel, list) and beispiel and echt:
        gemischt = len({_typ(x) for x in beispiel if x is not None}) > 1
        if gemischt:  # Tupel wie [ISO, art, bid, Text] oder [von, bis, art]
            for i, (b, e) in enumerate(zip(beispiel, echt, strict=False)):
                _vergleiche(b, e, f"{pfad}[{i}]", f"{muster}[]", fehler)
            if len(beispiel) != len(echt):
                fehler.append(f"{pfad}: {len(echt)} statt {len(beispiel)} Felder")
        else:
            vorlage = next((x for x in beispiel if x is not None), None)
            for i, e in enumerate(echt):
                _vergleiche(vorlage, e, f"{pfad}[{i}]", f"{muster}[]", fehler)


def vertrag_pruefen(beispiel: dict, echt: dict) -> list[str]:
    fehler: list[str] = []
    _vergleiche(beispiel, echt, "", "", fehler)
    return fehler


def test_pruefer_findet_abweichungen() -> None:
    beispiel = {"a": 1, "b": {"x": "s"}, "entitaeten": {"k": "v"}, "l": [["t", 1]]}
    assert vertrag_pruefen(beispiel, {"a": 2.5, "b": {"x": "t", "y": 1}, "entitaeten": {"z": "w"}, "l": [["u", 2]]}) == []
    assert vertrag_pruefen(beispiel, {"a": "1", "b": {}, "entitaeten": {"z": 1}, "l": [["u"]]}) == [
        ".a: Typ str statt zahl", ".b.x: fehlt", ".entitaeten.z: Typ zahl statt str", ".l[0]: 1 statt 2 Felder",
    ]


async def test_struktur_wie_beispiel(hass: HomeAssistant, baustelle, freezer, shellys, hass_ws_client) -> None:
    """Eine Baustelle mit möglichst allem, was die Struktur zeigen kann – Antwort über den echten WebSocket."""
    beispiel = json.loads(BEISPIEL.read_text(encoding="utf-8"))
    ws = await hass_ws_client(hass)  # vor dem Zurückstellen der Uhr anmelden (sonst gilt das Token noch nicht)

    async def get_events(call: ServiceCall):
        return {"calendar.besprechungen": {"events": [
            {"start": "2026-10-01T09:00:00+02:00", "end": "2026-10-01T10:30:00+02:00", "summary": "Baubesprechung",
             "description": f"baustelle:{C2} boost"}]}}

    hass.services.async_register("calendar", "get_events", get_events, supports_response=SupportsResponse.ONLY)
    hass.states.async_set("calendar.besprechungen", "off")
    hass.states.async_set("binary_sensor.tuer_c1", "on")
    st = baustelle.runtime_data
    st.e["anschluesse"][0].update(ampere=20, phasen=1, reserve_kw=0.0)
    st.e["ausnahmen"].append({"datum": "2026-10-02", "art": "zeiten", "von": "07:00", "bis": "12:00", "notiz": "x"})
    st.e["firmen"].append({"id": "huber", "name": "Huber", "eigen": False})
    st.e["zuordnung"].append({"bereich": C2, "firma": "huber", "ab": "2026-09-29T08:00:00+02:00"})
    st.e["stumm"]["kein_wetter"] = "2026-09-30T07:00:00+02:00"
    freezer.move_to("2026-09-29 10:00:00+02:00")
    st.einstellung_setzen(("bereiche", C1, "tuer"), "binary_sensor.tuer_c1")
    st.einstellung_setzen(("bereiche", C2, "bedarf"), True)
    st.einstellung_setzen(("termine_kalender",), "calendar.besprechungen")
    st.lz["bedarf_bis"][C2] = "2026-09-29T11:00:00+02:00"
    st.lz["hand"][HK2] = "2026-09-29T01:50:00+02:00"   # 8 h 10 min: Warnung da, Automatik übernimmt erst nach 8 h 30 (FE-0004)
    st.einstellung_setzen(("automatik",), True)
    await hass.async_block_till_done()

    await ws.send_json({"id": 1, "type": "baustelle/struktur"})
    antwort = await ws.receive_json()
    echt = antwort["result"][0]
    lz = echt["laufzeit"]
    # die Beispielwerte, die ein Vergleich braucht, sind wirklich da
    assert lz["termine"] and lz["warnungen"] and lz["protokoll"] and lz["plan_woche"] and lz["staffel"]["anschluesse"]
    assert lz["container"][C1]["tuer"]["offen"] is True and lz["geraete"][HK2]["hand_seit"]
    assert vertrag_pruefen(beispiel[0], echt) == []


async def test_ohne_automatik_je_container(hass: HomeAssistant, baustelle, freezer, shellys, hass_ws_client) -> None:
    """WU-0013: „ohne Automatik“ eines Containers – Ø-Leistung je Gerät bzw. je Typ, 24/7 seit Beginn bis jetzt."""
    ws = await hass_ws_client(hass)
    st = baustelle.runtime_data
    st.zaehler[f"mittel:{HK1}"] = 2000.0     # Ölradiator in Container 1
    st.zaehler[f"mittel:{HK2}"] = 1500.0     # Konvektor in Container 2
    freezer.move_to("2026-09-29 10:30:00+02:00")
    await ws.send_json({"id": 1, "type": "baustelle/ohne", "entry_id": baustelle.entry_id, "bereich": C1, "zeitraum": "Tag"})
    r = (await ws.receive_json())["result"]
    assert r["kw"] == 2.0 and r["reihe"][:10] == [2.0] * 10 and r["reihe"][10] == 1.0 and sum(r["reihe"][11:]) == 0
    assert r["ohne_kwh"] == 21.0 and r["geraete"] == [{"id": HK1, "typ": "oelradiator", "kw": 2.0}]
    assert r["ergebnis"] is not None and r["ergebnis"]["ohne_eur"] == pytest.approx(21.0 * r["preis"])
    await ws.send_json({"id": 2, "type": "baustelle/ohne", "entry_id": baustelle.entry_id, "bereich": C1, "zeitraum": "Tag", "basis": "typ"})
    r = (await ws.receive_json())["result"]
    assert r["basis"] == "typ" and r["kw"] == 2.0     # einziger Ölradiator: Ø des Typs = eigener Wert
    st.geraet_aktiv_setzen(st.geraete[HK1], False)    # FE-0020: inaktiv → läuft auch ohne Automatik nicht
    await ws.send_json({"id": 3, "type": "baustelle/ohne", "entry_id": baustelle.entry_id, "bereich": C1, "zeitraum": "Tag"})
    r = (await ws.receive_json())["result"]
    assert r["kw"] == 0 and r["ohne_kwh"] == 0 and r["geraete"] == [{"id": HK1, "typ": "oelradiator", "kw": None}]


async def test_soll_gleitend(hass: HomeAssistant, baustelle, freezer, shellys, hass_ws_client) -> None:
    """Herbert 01.10.2026: Soll gleitend nach dem Außenmittel und dem Gefühl; eigenes Soll als Verschiebung; + / − am Rad
    bis morgen früh und als Gefühl gemerkt; „↺ gleitend“ setzt zurück."""
    from custom_components.baustelle.daten import struktur
    from custom_components.baustelle.funktionen.heizung import Heizung
    ws = await hass_ws_client(hass)
    st, hz, e = baustelle.runtime_data, Heizung.von(baustelle.runtime_data), baustelle.entry_id
    freezer.move_to("2026-10-01 10:00:00+02:00")
    st.lz["aussen_tage"] = {"2026-09-30": [6.0 * 60, 60], "2026-09-29": [2.0 * 60, 60], "2026-10-01": [10.0, 1]}
    assert hz.soll_temperatur(C1) == 20.0                                    # fest wie bisher
    st.einstellung_setzen(("heizung", "soll_art"), "gleitend")
    t_m = (6.0 + 0.8 * 2.0) / 1.8
    assert hz.aussen_mittel() == pytest.approx(t_m)
    assert hz.soll_temperatur(C1) == pytest.approx(21 + 0.1 * (12 - t_m), abs=0.01)
    st.einstellungen.bereich(C2)["soll"] = 21.0                              # eigenes Soll: +1 gegenüber der Baustelle
    assert hz.soll_temperatur(C2) == pytest.approx(hz.soll_temperatur(C1) + 1.0, abs=0.01)
    vorher = hz.soll_temperatur(C1)
    await ws.send_json({"id": 1, "type": "baustelle/aktion", "entry_id": e, "aktion": "soll_versch", "bereich": C1, "d": 0.5})
    assert (await ws.receive_json())["success"]
    gefuehlt = 0.15   # + zählt wie „zu kalt“ beim selben Außenmittel
    assert hz.soll_temperatur(C1) == pytest.approx(vorher + gefuehlt + 0.5, abs=0.01)
    lz = struktur(hass, baustelle)["laufzeit"]
    assert lz["container"][C1]["soll"]["versch"] == 0.5 and lz["container"][C1]["soll"]["versch_bis"].startswith("2026-10-02T03:00")
    assert lz["soll_gleitend"]["n"] == 1 and len(lz["soll_gleitend"]["kurve"]) == 31
    freezer.move_to("2026-10-02 03:01:00+02:00")                              # morgen früh: wieder gleitend
    assert hz.versch(C1) == 0.0
    await ws.send_json({"id": 2, "type": "baustelle/aktion", "entry_id": e, "aktion": "soll_versch", "bereich": C1, "d": -0.5})
    await ws.receive_json()
    await ws.send_json({"id": 3, "type": "baustelle/aktion", "entry_id": e, "aktion": "soll_versch_weg", "bereich": C1})
    await ws.receive_json()
    assert hz.versch(C1) == 0.0 and [x[2] for x in st.lz["gefuehl"]] == [-1, 1]
    await ws.send_json({"id": 4, "type": "baustelle/aktion", "entry_id": e, "aktion": "gefuehl", "bereich": C1, "wert": 0})
    await ws.receive_json()
    await ws.send_json({"id": 5, "type": "baustelle/aktion", "entry_id": e, "aktion": "gefuehl_vergessen"})
    await ws.receive_json()
    assert st.lz["gefuehl"] == []
    await ws.send_json({"id": 6, "type": "baustelle/setzen", "entry_id": e, "pfad": ["heizung", "gleit_min"], "wert": 19.0})
    assert (await ws.receive_json())["success"]                               # Untergrenze frei einstellbar


async def test_alles_zuruecksetzen(hass: HomeAssistant, baustelle, freezer, shellys, hass_ws_client) -> None:
    """Herbert 01.10.2026: alle Zähler und alles Gelernte auf null; Einstellungen bleiben, die Integration lädt neu."""
    ws = await hass_ws_client(hass)
    st = baustelle.runtime_data
    st.zaehler.update({"energie": 12.0, "heiztage": 3, f"abkuehl:{C1}": 1.2, f"stand:{HK1}": 5.0})
    st.lz["lernen"][C1] = {"kint": 0.5}
    st.lz["gefuehl"] = [["2026-10-01", 6.0, -1]]
    st.e["heizung"]["soll"] = 21.5
    await ws.send_json({"id": 1, "type": "baustelle/aktion", "entry_id": baustelle.entry_id, "aktion": "zuruecksetzen"})
    assert (await ws.receive_json())["success"]
    await hass.async_block_till_done()
    neu = hass.config_entries.async_get_entry(baustelle.entry_id).runtime_data
    assert neu is not st                                                       # neu geladen
    assert not any(k in neu.zaehler for k in ("energie", "heiztage", f"abkuehl:{C1}", f"stand:{HK1}"))
    assert neu.lz["lernen"] == {} and neu.lz["gefuehl"] == [] and neu.e["heizung"]["soll"] == 21.5
    assert any("zurückgesetzt" in p[3] for p in neu.e["protokoll"])


async def test_mehrere_ausnahmen_je_tag(hass: HomeAssistant, baustelle, freezer, shellys, hass_ws_client) -> None:
    """FE-0012: eine zweite Ausnahme am selben Tag ersetzt die erste nicht mehr; ✕ löscht nur ein Zeitfenster,
    „frei“ ersetzt alle des Tages. Die Liste zeigt den Plan jedes Tages mit Ausnahmen (plan_ausnahmen)."""
    from custom_components.baustelle.daten import struktur
    ws = await hass_ws_client(hass)
    st, e = baustelle.runtime_data, baustelle.entry_id
    n = iter(range(1, 50))

    async def liste(aktion: str, eintrag: dict[str, Any]) -> None:
        await ws.send_json({"id": next(n), "type": "baustelle/liste", "entry_id": e, "liste": "ausnahmen", "aktion": aktion, "eintrag": eintrag})
        assert (await ws.receive_json())["success"]

    fr = {"datum": "2026-10-02", "art": "arbeit", "notiz": ""}
    await liste("speichern", {**fr, "von": "07:00", "bis": "16:30"})
    await liste("speichern", {**fr, "von": "04:00", "bis": "05:00"})
    assert [(a["von"], a["bis"]) for a in st.e["ausnahmen"] if a["datum"] == "2026-10-02"] == [("04:00", "05:00"), ("07:00", "16:30")]
    plan = struktur(hass, baustelle)["laufzeit"]["plan_ausnahmen"]["2026-10-02"]
    assert plan["eigene"] == [[240, 300]] and (plan["a"], plan["b"]) == (420, 990) and len(plan["ausnahmen"]) == 2
    await liste("loeschen", {**fr, "von": "04:00", "bis": "05:00"})
    assert [(a["von"], a["bis"]) for a in st.e["ausnahmen"] if a["datum"] == "2026-10-02"] == [("07:00", "16:30")]
    await liste("speichern", {"datum": "2026-10-02", "art": "frei", "notiz": ""})
    assert [a["art"] for a in st.e["ausnahmen"] if a["datum"] == "2026-10-02"] == ["frei"]
    await liste("speichern", {**fr, "von": "07:00", "bis": "12:00"})        # Zeitfenster ersetzt „frei“
    assert [a["art"] for a in st.e["ausnahmen"] if a["datum"] == "2026-10-02"] == ["arbeit"]


async def test_energie_korrektur(hass: HomeAssistant, baustelle, freezer, shellys, hass_ws_client) -> None:
    """FE-0016: falsch gezählte Energie eines Heizkörpers zurücknehmen – Energie, Kosten, Energie fürs Heizen und je Typ."""
    ws = await hass_ws_client(hass)
    st = baustelle.runtime_data
    st.zaehler.update({"energie": 50.0, f"energie:{C1}": 40.0, "kosten": 15.0, f"kosten:{C1}": 12.0, "energie_heizen": 45.0, "energie_typ:oelradiator": 40.0})
    await ws.send_json({"id": 1, "type": "baustelle/aktion", "entry_id": baustelle.entry_id, "aktion": "energie_korrektur", "geraet": HK1, "kwh": 30.0})
    assert (await ws.receive_json())["success"]
    z, preis = st.zaehler, float(st.e["preis"])
    assert (z["energie"], z[f"energie:{C1}"], z["energie_heizen"], z["energie_typ:oelradiator"]) == (20.0, 10.0, 15.0, 10.0)
    assert z["kosten"] == pytest.approx(max(0.0, 15.0 - 30 * preis)) and z[f"kosten:{C1}"] == pytest.approx(max(0.0, 12.0 - 30 * preis))
    assert any("falsch gezählt" in p[3] for p in st.e["protokoll"])
    k = z["kosten"]
    await ws.send_json({"id": 2, "type": "baustelle/aktion", "entry_id": baustelle.entry_id, "aktion": "energie_korrektur", "geraet": HK1, "eur": 0.5})
    assert (await ws.receive_json())["success"]
    assert z["kosten"] == pytest.approx(max(0.0, k - 0.5)) and z["energie"] == 20.0          # nur Kosten
