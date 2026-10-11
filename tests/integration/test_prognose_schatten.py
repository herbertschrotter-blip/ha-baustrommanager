"""Prognose V2, P4a (BSM-033.09): Schattenprognose aus Datenbank und HA – Auftrag → `prognose_v2`, Legacy unverändert,
keine Schaltbefehle (Regression 12).

Sechs Arbeitstage mit Öl-Heizkörper 2 kW im Takt (H 0,10 kW/K, C-Evidenz aus dem Evidenzbericht P3) liefern das Modell
„mit“; ein Gegenmodell gibt es nicht (kein Baseline-Lauf) → „ohne“ und „gespart“ ohne Wert.
"""

from __future__ import annotations

import copy

import pytest

from homeassistant.core import HomeAssistant

from custom_components.baustelle.funktionen.heizung import Heizung, prognose_schatten

from .conftest import C1, C2, HK1, HK2
from .test_prognose_v2 import _takt_tage, baustelle_november  # noqa: F401 – Fixture


async def test_schattenprognose(hass: HomeAssistant, baustelle_november, hass_ws_client, shellys) -> None:  # noqa: F811
    entry = baustelle_november
    await _takt_tage(hass, entry)
    st = entry.runtime_data
    for g in (HK1, HK2):   # unabhängige Leistungsreferenz (im Gerät eingestellt)
        st.e.setdefault("geraete", {}).setdefault(g, {})["nenn_kw"] = 2.0
    hz = Heizung.von(st)
    legacy = copy.deepcopy(hz.hochrechnung)
    aufrufe = list(shellys.aufrufe)
    ws = await hass_ws_client(hass)
    await ws.send_json({"id": 1, "type": "baustelle/prognose_v2", "entry_id": entry.entry_id, "prognose": True})
    antwort = await ws.receive_json()
    assert antwort["success"], antwort
    erg = antwort["result"]["prognose"]
    assert erg["modell_version"] == "prognose-v2.1" and erg["schatten"] and erg["modellwahl"] == "v2"
    assert erg["laeufe"] == 9 and erg["gemessen_bis"] and erg["dauer_s"] >= 0
    c1 = erg["container"][C1]
    assert c1["mit"]["methode"] == "stationaer" and c1["mit"]["h_kw_k"] == pytest.approx(0.1)
    assert c1["ohne"]["methode"] == "keine"
    hp = erg["heizperiode"]
    assert hp["von"].startswith("2026-09-30T22:00") and hp["bis"].startswith("2027-04-30T22:00")
    assert hp["ohne"] == [None, None, None] and hp["gespart"][0] is None and hp["prozent"] is None
    assert hp["stufe"]["ohne"] == "A" and hp["stufe"]["gespart"] == "A"
    assert hp["ist"] is not None and hp["ist"] >= 0
    # C2 (ohne Fühler, Planmodus) hat noch keine Duty-Tage → keine Gesamtmitte, aber benannt; Band physikalisch
    assert hp["fehlend"] == [C2] and hp["mit"][0] is None and hp["mit"][1] is not None and hp["mit"][2] is not None
    assert hp["stufe"]["mit"] == "A" and "p_ref_fehlt" not in hp["gruende"]
    assert len(erg["tag"]) == 212 and len(erg["stunden"]) == 24 and len(erg["monat"]) == 7
    assert erg["anzeige"]["heizperiode"]["mit"]["status_text"]
    assert erg["anzeige"]["heizperiode"]["ohne"]["status_text"] == "Vergleich noch nicht möglich"
    # Tage summieren sich zur Heizperiode (Mitte bzw. obere Grenze, wo vorhanden)
    assert sum(t["mit"][2] for t in erg["tag"]) == pytest.approx(hp["mit"][2], rel=1e-6, abs=0.1)
    assert sum(s["mit"][2] for s in erg["stunden"]) == pytest.approx(erg["tag"][50]["mit"][2], abs=0.01)   # 20.11.
    # Schattenbetrieb: Legacy unverändert, kein Schaltbefehl
    assert hz.hochrechnung == legacy and shellys.aufrufe == aufrufe
    # zweiter Aufruf: zwischengespeichert
    await ws.send_json({"id": 2, "type": "baustelle/prognose_v2", "entry_id": entry.entry_id, "prognose": True})
    assert (await ws.receive_json())["result"]["prognose"]["aktualisiert_am"] == erg["aktualisiert_am"]
    # Auswertung: zusätzlicher Schlüssel, getrennt von der bisherigen Hochrechnung
    await ws.send_json({"id": 3, "type": "baustelle/auswertung", "entry_id": entry.entry_id, "zeitraum": "Woche"})
    aw = (await ws.receive_json())["result"]
    assert aw["prognose_v2"]["modell_version"] == "prognose-v2.1" and "tag" not in aw["prognose_v2"]
    assert "hochrechnung" in aw and "prognose_v2" not in aw["hochrechnung"]


async def test_ohne_datenbank_nichts(hass: HomeAssistant, baustelle_november, monkeypatch) -> None:  # noqa: F811
    from custom_components.baustelle.db import DATA_DB   # noqa: PLC0415

    hz = Heizung.von(baustelle_november.runtime_data)
    monkeypatch.setitem(hass.data, DATA_DB, None)
    assert await prognose_schatten.async_rechnen(hass, hz) is None and hz.prognose_v2 is None


async def test_konfigurationswechsel_neu_schaetzen(hass: HomeAssistant, baustelle_november, monkeypatch) -> None:  # noqa: F811
    """S3: weicht die Konfiguration vom Stand der Schätzung ab, fehlt der Container und die Neuschätzung wird angestoßen."""
    entry = baustelle_november
    await _takt_tage(hass, entry)
    hz = Heizung.von(entry.runtime_data)
    erg = await prognose_schatten.async_rechnen(hass, hz, modelle_neu=True)
    assert erg is not None and C1 not in erg["heizperiode"]["fehlend"]
    echt = hz.prognose_kontext
    monkeypatch.setattr(hz, "prognose_kontext", lambda b: (echt(b)[0], "kNEU") if b == C1 else echt(b))
    aufrufe = []
    original = prognose_schatten.async_modelle

    async def zaehlen(*a, **kw):
        aufrufe.append(1)
        return await original(*a, **kw)
    monkeypatch.setattr(prognose_schatten, "async_modelle", zaehlen)
    erg = await prognose_schatten.async_rechnen(hass, hz)
    assert C1 in erg["heizperiode"]["fehlend"] and hz.prognose_v2_neu_angestossen
    await hass.async_block_till_done(wait_background_tasks=True)
    assert aufrufe == [1]   # einmal neu geschätzt (im Hintergrund)
    assert hz.prognose_v2_modelle[1][C1].konfiguration_id == "kNEU" and not hz.prognose_v2_neu_angestossen
    erg = await prognose_schatten.async_rechnen(hass, hz)
    # neue Konfiguration ohne eigene Messungen: weiter ohne Mitte (A), aber keine weitere Neuschätzung
    assert C1 in erg["heizperiode"]["fehlend"] and aufrufe == [1] and erg["container"][C1]["mit"]["h_kw_k"] is None
