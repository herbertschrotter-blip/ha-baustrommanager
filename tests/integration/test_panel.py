"""Eigene Seite: Anmeldung, JavaScript, WebSocket-Befehle nach api-0.7 §1–§2 (jeder Befehl) und die Dialoge."""

import json
from pathlib import Path
from datetime import timedelta

import pytest

from homeassistant.core import HomeAssistant
from homeassistant.setup import async_setup_component
from homeassistant.util import dt as dt_util
from pytest_homeassistant_custom_component.common import MockConfigEntry

from custom_components.baustelle.const import DOMAIN

from .conftest import C1, C2, HK2, P1, SCHACHT, baustelle_anlegen


@pytest.fixture
async def ws(hass: HomeAssistant, baustelle, hass_ws_client):
    """WebSocket-Client; `ws.rufe(type, **felder)` liefert die Antwort."""
    client = await hass_ws_client(hass)
    zaehler = {"id": 0}

    async def rufe(typ: str, mit_entry: bool = True, **felder):
        zaehler["id"] += 1
        nachricht = {"id": zaehler["id"], "type": typ, **felder}
        if mit_entry:
            nachricht.setdefault("entry_id", baustelle.entry_id)
        await client.send_json(nachricht)
        antwort = await client.receive_json()
        await hass.async_block_till_done()
        return antwort

    client.rufe = rufe
    return client


async def test_panel_und_struktur(hass: HomeAssistant, baustelle, ws, hass_client) -> None:
    assert await async_setup_component(hass, "frontend", {})
    panels = hass.data["frontend_panels"]
    assert panels["baustelle"].sidebar_title == "Baustrommanager (BSM)"
    client = await hass_client()
    antwort = await client.get("/baustelle_static/baustelle-panel.js")
    assert antwort.status == 200
    assert "baustelle-panel" in await antwort.text()

    msg = await ws.rufe("baustelle/struktur", mit_entry=False)
    assert msg["success"]
    b = msg["result"][0]
    assert b["baustelle"]["titel"] == "B1" and b["baustelle"]["status"] == "aktiv"
    assert b["baustelle"]["zeitzone"] == "Europe/Vienna" and b["baustelle"]["heute"] == "2026-09-29"
    assert b["entitaeten"][f"{HK2}_problem"].startswith("binary_sensor.")
    assert {x["id"] for x in b["bereiche"]} == {C1, C2, SCHACHT}
    assert next(g for g in b["geraete"] if g["id"] == HK2)["rolle"] == "heizung"
    assert next(g for g in b["geraete"] if g["id"] == P1)["rolle"] == "pumpe"
    assert "zaehler" not in b["einstellungen"] and "protokoll" not in b["einstellungen"]
    assert b["einstellungen"]["heizung"]["soll"] == 20.0
    lz = b["laufzeit"]
    assert lz["status"] == "automatik_aus" and lz["status_text"] == "Handbetrieb – nichts wird geschaltet"
    assert len(lz["plan_woche"]) == 7 and set(lz["abschnitte"]) == {C1, C2}
    assert lz["container"][SCHACHT]["zustand"] == "laeuft"
    assert b["funktionen"] == ["heizung", "pumpen"]


async def test_struktur_funktionen(hass: HomeAssistant, baustelle, ws) -> None:
    """`funktionen` nach den Optionen (api-0.7 §8) – auch für eine nicht geladene Baustelle."""
    hass.config_entries.async_update_entry(baustelle, options={**baustelle.options, "heizung": False})
    await hass.async_block_till_done()
    nur_heizung = MockConfigEntry(domain=DOMAIN, title="B2", data={"name": "B2"}, options={"heizung": True, "pumpen": False})
    nur_heizung.add_to_hass(hass)
    alle = {b["baustelle"]["titel"]: b for b in (await ws.rufe("baustelle/struktur", mit_entry=False))["result"]}
    assert alle["B1"]["funktionen"] == ["pumpen"] and alle["B1"]["baustelle"]["geladen"]
    assert alle["B2"]["funktionen"] == ["heizung"] and not alle["B2"]["baustelle"]["geladen"]


async def test_setzen(hass: HomeAssistant, baustelle, ws) -> None:
    st = baustelle.runtime_data
    assert (await ws.rufe("baustelle/setzen", pfad=["heizung", "soll"], wert=21.5))["result"] == {"ok": True}
    assert st.e["heizung"]["soll"] == 21.5
    assert (await ws.rufe("baustelle/setzen", pfad=["bereiche", C1, "prio"], wert="hoch"))["success"]
    assert st.e["bereiche"][C1]["prio"] == "hoch"
    assert (await ws.rufe("baustelle/setzen", pfad=["meldungen_einst", "arten", "zu_kalt"], wert=False))["success"]
    assert st.e["meldungen_einst"]["arten"]["zu_kalt"] is False
    assert (await ws.rufe("baustelle/setzen", pfad=["automatik"], wert=True))["success"]
    assert st.e["automatik"] is True
    assert hass.states.get("switch.b1_automation").state == "on"
    assert "Automatik eingeschaltet" in [p[3] for p in st.e["protokoll"]]
    # nicht erlaubt bzw. ungültig
    for pfad, wert in [
        (["zaehler", "energie"], 1), (["heizung", "soll"], 99), (["heizung", "heizgrenze_basis"], "gestern"),
        (["bereiche", "gibtsnicht", "auto"], True), (["bereiche", C1, "anschluss"], "x9"), (["laufzeit"], {}),
    ]:
        msg = await ws.rufe("baustelle/setzen", pfad=pfad, wert=wert)
        assert not msg["success"] and msg["error"]["code"] == "invalid_format", pfad
    msg = await ws.rufe("baustelle/setzen", pfad=["preis"], wert=0.3, entry_id="falsch")
    assert msg["error"]["code"] == "not_found"


async def test_liste_arbeitszeiten_und_ausnahmen(hass: HomeAssistant, baustelle, ws) -> None:
    st = baustelle.runtime_data
    tage = {"0": ["07:30", "16:30"], "1": ["07:30", "16:30"], "2": ["07:30", "16:30"], "3": ["07:30", "16:30"],
            "4": ["07:30", "12:00"], "5": None, "6": None}
    eintrag = {"ab": "2026-11-02", "name": "Winter 2026/27", "tage": tage}
    # FE-0002: die automatisch angelegte Arbeitszeit (ab dem ersten Start) wird durch die erste eigene ersetzt
    assert [a.get("auto") for a in st.e["arbeitszeiten"]] == [True]
    eigene = {"ab": "2026-02-09", "name": "Meine", "tage": tage}
    assert (await ws.rufe("baustelle/liste", liste="arbeitszeiten", aktion="speichern", eintrag=eigene))["success"]
    assert [a["ab"] for a in st.e["arbeitszeiten"]] == ["2026-02-09"]
    assert (await ws.rufe("baustelle/liste", liste="arbeitszeiten", aktion="speichern", eintrag=eintrag))["success"]
    assert [a["ab"] for a in st.e["arbeitszeiten"]] == ["2026-02-09", "2026-11-02"]
    # gleiches ab → Fehler
    msg = await ws.rufe("baustelle/liste", liste="arbeitszeiten", aktion="speichern", eintrag=eintrag)
    assert msg["error"]["code"] == "invalid_format"
    # ändern über alt_ab
    neu = {**eintrag, "ab": "2026-11-09", "alt_ab": "2026-11-02"}
    assert (await ws.rufe("baustelle/liste", liste="arbeitszeiten", aktion="speichern", eintrag=neu))["success"]
    assert [a["ab"] for a in st.e["arbeitszeiten"]] == ["2026-02-09", "2026-11-09"]
    assert (await ws.rufe("baustelle/liste", liste="arbeitszeiten", aktion="loeschen", eintrag={"ab": "2026-11-09"}))["success"]
    msg = await ws.rufe("baustelle/liste", liste="arbeitszeiten", aktion="loeschen", eintrag={"ab": "2026-02-09"})
    assert msg["error"]["code"] == "invalid_format"   # die letzte bleibt
    msg = await ws.rufe("baustelle/liste", liste="arbeitszeiten", aktion="loeschen", eintrag={"ab": "2030-01-01"})
    assert msg["error"]["code"] == "not_found"
    kaputt = {**eintrag, "tage": {**tage, "0": ["16:30", "07:30"]}}
    assert not (await ws.rufe("baustelle/liste", liste="arbeitszeiten", aktion="speichern", eintrag=kaputt))["success"]
    # Ausnahmen
    x = {"datum": "2026-10-03", "art": "arbeit", "von": "07:00", "bis": "12:00", "notiz": "Samstag betonieren"}
    assert (await ws.rufe("baustelle/liste", liste="ausnahmen", aktion="speichern", eintrag=x))["success"]
    assert st.e["ausnahmen"] == [x]
    lz = (await ws.rufe("baustelle/struktur", mit_entry=False))["result"][0]["laufzeit"]
    sa = next(t for t in lz["plan_woche"] if t["datum"] == "2026-10-03")
    assert sa["plan"]["a"] == 420 and sa["plan"]["gruende"] == ["ausnahme"]
    assert sa["plan"]["ausnahme"]["notiz"] == "Samstag betonieren"
    frei = {"datum": "2026-10-03", "art": "frei", "von": "", "bis": ""}
    assert (await ws.rufe("baustelle/liste", liste="ausnahmen", aktion="speichern", eintrag=frei))["success"]
    assert st.e["ausnahmen"] == [{"datum": "2026-10-03", "art": "frei", "von": None, "bis": None, "notiz": ""}]
    assert not (await ws.rufe("baustelle/liste", liste="ausnahmen", aktion="speichern",
                              eintrag={"datum": "2026-10-04", "art": "zeiten"}))["success"]
    assert (await ws.rufe("baustelle/liste", liste="ausnahmen", aktion="loeschen", eintrag={"datum": "2026-10-03"}))["success"]
    assert st.e["ausnahmen"] == []


async def test_liste_anschluesse_und_firmen(hass: HomeAssistant, baustelle, ws) -> None:
    st = baustelle.runtime_data
    msg = await ws.rufe("baustelle/liste", liste="anschluesse", aktion="speichern",
                        eintrag={"name": "Verteiler Süd", "ampere": 32, "phasen": 3, "reserve_kw": 3, "container": [C2, SCHACHT]})
    aid = msg["result"]["id"]
    assert st.e["bereiche"][C2]["anschluss"] == aid and st.e["bereiche"][C1]["anschluss"] == "a1"
    lz = (await ws.rufe("baustelle/struktur", mit_entry=False))["result"][0]["laufzeit"]
    assert [a["id"] for a in lz["staffel"]["anschluesse"]] == ["a1", aid]
    assert lz["staffel"]["anschluesse"][1]["voll_kw"] == pytest.approx(22.08)
    # wie Mockup: einen Container aus der Liste nehmen → er hängt am anderen Anschluss
    assert (await ws.rufe("baustelle/liste", liste="anschluesse", aktion="speichern",
                          eintrag={"id": aid, "name": "Verteiler Süd", "ampere": 32, "phasen": 3, "container": [C2]}))["success"]
    assert st.e["bereiche"][SCHACHT]["anschluss"] == "a1" and st.e["bereiche"][C2]["anschluss"] == aid
    assert (await ws.rufe("baustelle/liste", liste="anschluesse", aktion="speichern",
                          eintrag={"id": "a1", "name": "Anschluss 1", "ampere": 32, "phasen": 3, "container": [SCHACHT]}))["success"]
    assert st.e["bereiche"][C1]["anschluss"] == aid and st.e["bereiche"][C2]["anschluss"] == aid
    assert (await ws.rufe("baustelle/liste", liste="anschluesse", aktion="loeschen", eintrag={"id": aid}))["success"]
    assert st.e["bereiche"][C2]["anschluss"] == "a1"
    msg = await ws.rufe("baustelle/liste", liste="anschluesse", aktion="loeschen", eintrag={"id": "a1"})
    assert msg["error"]["code"] == "invalid_format"  # letzter Anschluss bleibt
    # Firma mit Containern: Zuordnung „ab jetzt“
    msg = await ws.rufe("baustelle/liste", liste="firmen", aktion="speichern",
                        eintrag={"name": "Elektro Huber GmbH", "container": [C2]})
    fid = msg["result"]["id"]
    assert [f["name"] for f in st.e["firmen"]] == ["Eigene Firma", "Elektro Huber GmbH"]
    assert st.e["zuordnung"][-1]["bereich"] == C2 and st.e["zuordnung"][-1]["firma"] == fid
    # die Seite nimmt die Firma je Container aus der Struktur (rechnet die Zuordnung nicht selbst nach)
    lz = (await ws.rufe("baustelle/struktur", mit_entry=False))["result"][0]["laufzeit"]
    assert lz["container"][C2]["firma"] == fid and lz["container"][C1]["firma"] == "eigen"
    # Container abwählen → zurück zur eigenen Firma
    assert (await ws.rufe("baustelle/liste", liste="firmen", aktion="speichern",
                          eintrag={"id": fid, "name": "Huber", "container": []}))["success"]
    assert st.e["zuordnung"][-1] == {"bereich": C2, "firma": "eigen", "ab": st.e["zuordnung"][-1]["ab"]}
    assert st.e["firmen"][1]["name"] == "Huber"
    assert not (await ws.rufe("baustelle/liste", liste="firmen", aktion="loeschen", eintrag={"id": "eigen"}))["success"]
    assert (await ws.rufe("baustelle/liste", liste="firmen", aktion="loeschen", eintrag={"id": fid}))["success"]
    assert [f["id"] for f in st.e["firmen"]] == ["eigen"]
    # Zuordnung auf eine gelöschte Firma → eigene Firma
    st.e["zuordnung"].append({"bereich": C1, "firma": fid, "ab": "2020-01-01T00:00:00+01:00"})
    lz = (await ws.rufe("baustelle/struktur", mit_entry=False))["result"][0]["laufzeit"]
    assert lz["container"][C1]["firma"] == "eigen"


async def test_aktionen(hass: HomeAssistant, baustelle, ws, shellys, freezer) -> None:
    st = baustelle.runtime_data
    freezer.move_to("2026-09-29 17:00:00+02:00")
    # Bedarf mit Boost
    assert (await ws.rufe("baustelle/aktion", aktion="bedarf", bereich=C2, minuten=60, boost=True))["success"]
    assert st.lz["bedarf_bis"][C2].startswith("2026-09-29T18:00") and st.lz["boost_bis"][C2].startswith("2026-09-29T17:30")
    lz = (await ws.rufe("baustelle/struktur", mit_entry=False))["result"][0]["laufzeit"]
    assert lz["container"][C2]["bedarf_bis"].startswith("2026-09-29T18:00")
    assert (await ws.rufe("baustelle/aktion", aktion="bedarf_aus", bereich=C2))["success"]
    assert C2 not in st.lz["bedarf_bis"] and C2 not in st.lz["boost_bis"]
    assert (await ws.rufe("baustelle/aktion", aktion="boost", bereich=C1, an=True))["success"]
    assert C1 in st.lz["boost_bis"]
    assert (await ws.rufe("baustelle/aktion", aktion="boost", bereich=C1, an=False))["success"]
    assert C1 not in st.lz["boost_bis"]
    assert (await ws.rufe("baustelle/aktion", aktion="bedarf", bereich="x"))["error"]["code"] == "not_found"
    assert (await ws.rufe("baustelle/aktion", aktion="bedarf", bereich=C1))["error"]["code"] == "invalid_format"
    # alle jetzt heizen
    assert (await ws.rufe("baustelle/aktion", aktion="jetzt_heizen", minuten=60))["success"]
    assert st.lz["jetzt_bis"].startswith("2026-09-29T18:00")
    assert (await ws.rufe("baustelle/aktion", aktion="jetzt_heizen", minuten=None))["success"]
    assert st.lz["jetzt_bis"] is None
    # Gerät schalten → Handbetrieb (mit Automatik), wieder auf Automatik
    st.einstellung_setzen(("automatik",), True)
    assert (await ws.rufe("baustelle/aktion", aktion="schalten", geraet=HK2, an=True))["success"]
    assert "switch.hk2" in shellys.ein() and HK2 in st.lz["hand"]
    assert (await ws.rufe("baustelle/aktion", aktion="automatik", geraet=HK2))["success"]
    assert HK2 not in st.lz["hand"]
    assert (await ws.rufe("baustelle/aktion", aktion="schalten", geraet="x", an=True))["error"]["code"] == "not_found"
    # Warnung stumm und wieder melden
    assert (await ws.rufe("baustelle/aktion", aktion="warnung_stumm", key="kein_wetter"))["success"]
    assert st.e["stumm"]["kein_wetter"].startswith("2026-09-30T07:00")
    assert (await ws.rufe("baustelle/aktion", aktion="warnung_stumm", key="kein_wetter", bis=None))["success"]
    assert "kein_wetter" not in st.e["stumm"]


async def test_aktion_bericht_senden(hass: HomeAssistant, baustelle, ws, nachrichten) -> None:
    assert (await ws.rufe("baustelle/aktion", aktion="bericht_senden", art="woche"))["result"] == {"ok": True}
    assert nachrichten[-1].data["title"] == "Baustelle B1 – Woche 21.–27.09.2026"
    assert nachrichten[-1].data["data"]["actions"][0]["title"] == "Bericht öffnen"


async def test_bericht_vorschau(hass: HomeAssistant, baustelle, ws, monkeypatch) -> None:
    """„Bericht · Beispiel“ auf der Seite zeigt dieselben Zahlen und Texte, die der Bericht verschicken würde."""
    from datetime import date

    from custom_components.baustelle.nachrichten import Nachrichten

    async def verbrauch(self, von, bis):
        return {C1: {date(2026, 9, 14): 20.0, date(2026, 9, 21): 10.0, date(2026, 9, 22): 12.0}, SCHACHT: {date(2026, 9, 23): 2.0}}

    async def heizzeit(self, von, bis):   # Heizstunden je Container; Pumpenschacht und 0 h zählen nicht als Heiztag
        return {C1: {date(2026, 9, 21): 2.5, date(2026, 9, 22): 0.0}, C2: {date(2026, 9, 24): 1.0, date(2026, 9, 14): 3.0}}

    monkeypatch.setattr(Nachrichten, "async_verbrauch_je_tag", verbrauch)
    monkeypatch.setattr(Nachrichten, "async_heizzeit_je_tag", heizzeit)
    st = baustelle.runtime_data
    st.einstellung_setzen(("bericht", "mail"), True)
    st.einstellung_setzen(("bericht", "mail_an"), "bau@example.at")
    v = (await ws.rufe("baustelle/bericht", art="woche"))["result"]
    assert v["betreff"] == "Baustelle B1 – Woche 21.–27.09.2026" and v["von"] == "2026-09-21" and v["bis"] == "2026-09-27"
    assert v["summe"] == "Vorwoche: 24 kWh · 6,72 €" and v["vergleich"] == "(+20 % zur Woche davor)"
    assert v["firmen"] == [{"name": "Eigene Firma", "kwh": 24.0, "eur": pytest.approx(6.72)}]
    assert [c["name"] for c in v["container"]] == ["Container 1", "Container 2", "Schacht"]  # wie Mockup: auch Schächte
    assert v["heiztage"] == 2 and v["mail_an"] == "bau@example.at" and v["anhang"] == "abrechnung-kw39.csv"
    assert (await ws.rufe("baustelle/bericht", art="monat"))["result"]["betreff"] == "Baustelle B1 – August 2026"
    assert (await ws.rufe("baustelle/bericht", entry_id="falsch"))["error"]["code"] == "not_found"


async def test_protokoll(hass: HomeAssistant, baustelle, ws, freezer) -> None:
    st = baustelle.runtime_data
    st.e["protokoll"].clear()
    from custom_components.baustelle.db import DATA_DB, schema  # noqa: PLC0415
    await hass.data[DATA_DB].schreiber.async_schreiben()
    await hass.data[DATA_DB].async_ausfuehren(lambda v: v.execute(schema.protokoll.delete()))   # BSM-015: Protokoll in der Datenbank
    basis = dt_util.now()
    for i, art in enumerate(["warnung", "schalten", "ok", "wetter", "nachricht", "schalten"]):
        st.protokoll(art, None, f"E{i}", zeit=basis + timedelta(minutes=i))
    alle = (await ws.rufe("baustelle/protokoll"))["result"]
    assert [e[3] for e in alle] == ["E5", "E4", "E3", "E2", "E1", "E0"]
    assert [e[3] for e in (await ws.rufe("baustelle/protokoll", filter="warnung"))["result"]] == ["E2", "E0"]
    assert [e[3] for e in (await ws.rufe("baustelle/protokoll", filter="schalten", limit=1))["result"]] == ["E5"]
    vor = alle[2][0]
    assert [e[3] for e in (await ws.rufe("baustelle/protokoll", vor=vor))["result"]] == ["E2", "E1", "E0"]


async def test_meldungen(hass: HomeAssistant, baustelle, ws, hass_storage) -> None:
    msg = await ws.rufe("baustelle/meldung", mit_entry=False, aktion="neu",
                        meldung={"art": "wunsch", "text": "Eigene Kachel für Bautrockner", "kontext": "Übersicht",
                                 "geraet": "Handy", "seite": {"view": "container", "cid": C1, "dialog": None}})
    assert msg["success"], msg
    mid = msg["result"]["id"]
    # lesbare Kopie außerhalb von .storage und Eintrag im Logbuch (damit Meldungen abgearbeitet werden können)
    await hass.async_block_till_done()
    ordner = Path(hass.config.path("baustelle"))
    md = (ordner / "meldungen.md").read_text(encoding="utf-8")
    assert "## Offen" in md and "Eigene Kachel für Bautrockner" in md and "Fenster: Übersicht" in md and mid in md
    assert json.loads((ordner / "meldungen.json").read_text(encoding="utf-8"))[0]["id"] == mid
    liste = (await ws.rufe("baustelle/meldungen", mit_entry=False))["result"]
    assert liste[0]["id"] == mid and liste[0]["status"] == "neu" and liste[0]["zeit"] and liste[0]["ticket"] == "WU-0001"
    assert liste[0]["seite"] == {"view": "container", "cid": C1, "dialog": None}  # „Stand der Seite mitschicken“
    assert (await ws.rufe("baustelle/meldung", mit_entry=False, aktion="status", meldung_id=mid, status="erledigt"))["success"]
    liste = (await ws.rufe("baustelle/meldungen", mit_entry=False))["result"]
    assert liste[0]["status"] == "geschlossen" and liste[0]["stand"]  # „erledigt“ aus 0.7.0 = geschlossen
    await hass.async_block_till_done()
    assert "## Erledigt\n\n### WU-0001 · Wunsch · geschlossen" in (ordner / "meldungen.md").read_text(encoding="utf-8")
    assert not (await ws.rufe("baustelle/meldung", mit_entry=False, aktion="neu", meldung={"art": "x", "text": ""}))["success"]
    # wie die Seite: Kennung und Status in `meldung` (das Feld `id` gehört der WebSocket-Nachricht)
    assert (await ws.rufe("baustelle/meldung", aktion="status", meldung={"id": mid, "status": "offen"}))["success"]
    assert (await ws.rufe("baustelle/meldungen"))["result"][0]["status"] == "neu"
    assert (await ws.rufe("baustelle/meldung", mit_entry=False, aktion="loeschen", meldung_id=mid))["success"]
    assert (await ws.rufe("baustelle/meldungen", mit_entry=False))["result"] == []
    msg = await ws.rufe("baustelle/meldung", mit_entry=False, aktion="loeschen", meldung_id=mid)
    assert msg["error"]["code"] == "not_found"


async def test_meldung_mit_bildern(hass: HomeAssistant, baustelle, ws, hass_storage) -> None:
    """WU-0016: bis zu 3 Bilder je Meldung – als Datei neben meldungen.json, in der .md genannt, über „bild“ abrufbar,
    beim Löschen mit weg; falsche Art und zu viele werden abgelehnt."""
    import base64
    jpg = "data:image/jpeg;base64," + base64.b64encode(b"\xff\xd8\xff\xe0" + b"x" * 500).decode()
    png = "data:image/png;base64," + base64.b64encode(b"\x89PNG" + b"y" * 300).decode()
    msg = await ws.rufe("baustelle/meldung", mit_entry=False, aktion="neu", meldung={"art": "fehler", "text": "Bild dabei", "bilder": [jpg, png]})
    assert msg["success"], msg
    mid, ticket = msg["result"]["id"], msg["result"]["ticket"]
    await hass.async_block_till_done()
    ordner = Path(hass.config.path("baustelle"))
    assert (ordner / "meldungen" / f"{ticket}-1.jpg").read_bytes().startswith(b"\xff\xd8")
    assert (ordner / "meldungen" / f"{ticket}-2.png").exists()
    assert f"Bilder: baustelle/meldungen/{ticket}-1.jpg, baustelle/meldungen/{ticket}-2.png" in (ordner / "meldungen.md").read_text(encoding="utf-8")
    assert (await ws.rufe("baustelle/meldungen", mit_entry=False))["result"][0]["bilder"] == [f"{ticket}-1.jpg", f"{ticket}-2.png"]
    r = await ws.rufe("baustelle/meldung", mit_entry=False, aktion="bild", meldung_id=mid, nr=1)
    assert r["result"]["url"].startswith("data:image/png;base64,")
    assert (await ws.rufe("baustelle/meldung", mit_entry=False, aktion="bild", meldung_id=mid, nr=2))["error"]["code"] == "not_found"
    assert (await ws.rufe("baustelle/meldung", mit_entry=False, aktion="loeschen", meldung_id=mid))["success"]
    assert not (ordner / "meldungen" / f"{ticket}-1.jpg").exists()
    gif = "data:image/gif;base64," + base64.b64encode(b"GIF89a").decode()
    assert not (await ws.rufe("baustelle/meldung", mit_entry=False, aktion="neu", meldung={"art": "fehler", "text": "x", "bilder": [gif]}))["success"]
    assert not (await ws.rufe("baustelle/meldung", mit_entry=False, aktion="neu", meldung={"art": "fehler", "text": "x", "bilder": [jpg] * 4}))["success"]


async def test_dialoge_wie_die_seite(hass: HomeAssistant, baustelle, hass_client) -> None:
    """Die Seite legt über dieselben REST-Dialoge an wie HA selbst – mit genau diesen Daten."""
    assert await async_setup_component(hass, "config", {})
    client = await hass_client()
    entry_id = baustelle.entry_id

    async def dialog(pfad, start, daten):
        r = await client.post(f"/api/{pfad}", json=start)
        assert r.status == 200, await r.text()
        form = await r.json()
        r = await client.post(f"/api/{pfad}/{form['flow_id']}", json=daten)
        assert r.status == 200, await r.text()
        return await r.json()

    r = await dialog("config/config_entries/subentries/flow", {"handler": [entry_id, "bereich"]},
                     {"name": "Container Neu", "art": "container"})
    assert r["type"] == "create_entry"
    await hass.async_block_till_done()
    neu = next(s for s in baustelle.subentries.values() if s.title == "Container Neu")
    hass.states.async_set("switch.neu", "off")
    r = await dialog("config/config_entries/subentries/flow", {"handler": [entry_id, "geraet"]},
                     {"bereich": neu.subentry_id, "schalter": "switch.neu", "name": "Heizkörper Neu",
                      "rolle": "heizkoerper", "typ": "oelradiator"})
    assert r["type"] == "create_entry"
    await hass.async_block_till_done()
    # neuer Container bekommt Standard-Einstellungen im Store
    assert baustelle.runtime_data.e["bereiche"][neu.subentry_id]["auto"] is True
    r = await dialog("config/config_entries/subentries/flow", {"handler": [entry_id, "bereich"], "subentry_id": neu.subentry_id},
                     {"name": "Container Neu", "art": "container", "fuehler": "sensor.temp_c1"})
    assert r["type"] == "abort" and r["reason"] == "reconfigure_successful"
    await hass.async_block_till_done()
    optionen = {**baustelle.options, "wetter": "weather.baustelle"}
    hass.states.async_set("weather.baustelle", "sunny", {"temperature": 5})
    r = await dialog("config/config_entries/options/flow", {"handler": entry_id}, optionen)
    assert r["type"] == "create_entry"
    await hass.async_block_till_done()
    assert baustelle.options["wetter"] == "weather.baustelle"
    r = await dialog("config/config_entries/flow", {"handler": "baustelle", "show_advanced_options": False},
                     {"name": "Zweite", "beginn": "2026-10-01", "heizung": True, "pumpen": False})
    assert r["type"] == "create_entry"
    if r.get("next_flow"):
        weg = await client.delete(f"/api/config/config_entries/subentries/flow/{r['next_flow'][1]}")
        assert weg.status == 200
    await hass.async_block_till_done()


async def test_liste_fehler_aendert_nichts(hass: HomeAssistant, baustelle, ws) -> None:
    """Ein abgelehnter Eintrag darf nichts halb ändern (Ausnahme nicht löschen, Anschluss/Firma nicht anlegen)."""
    st = baustelle.runtime_data
    x = {"datum": "2026-10-03", "art": "arbeit", "von": "07:00", "bis": "12:00", "notiz": ""}
    assert (await ws.rufe("baustelle/liste", liste="ausnahmen", aktion="speichern", eintrag=x))["success"]
    kaputt = {"datum": "2026-10-03", "art": "zeiten", "von": "12:00", "bis": "07:00"}
    assert not (await ws.rufe("baustelle/liste", liste="ausnahmen", aktion="speichern", eintrag=kaputt))["success"]
    assert st.e["ausnahmen"] == [x]
    msg = await ws.rufe("baustelle/liste", liste="anschluesse", aktion="speichern",
                        eintrag={"name": "Süd", "ampere": 32, "phasen": 3, "container": [C2, "gibt_es_nicht"]})
    assert msg["error"]["code"] == "invalid_format"
    assert [a["id"] for a in st.e["anschluesse"]] == ["a1"] and st.e["bereiche"][C2]["anschluss"] == "a1"
    msg = await ws.rufe("baustelle/liste", liste="firmen", aktion="speichern",
                        eintrag={"name": "Huber", "container": ["gibt_es_nicht"]})
    assert msg["error"]["code"] == "invalid_format"
    assert [f["id"] for f in st.e["firmen"]] == ["eigen"]


async def test_meldung_im_logbuch(hass: HomeAssistant, baustelle, ws) -> None:
    """Neue Meldung erscheint im HA-Logbuch („Meldung (Fehler): … – Fenster“)."""
    ereignisse = []
    hass.bus.async_listen("baustelle_protokoll", lambda e: ereignisse.append(e.data))
    msg = await ws.rufe("baustelle/meldung", aktion="neu",
                        meldung={"art": "fehler", "text": "Knöpfe überlagern sich", "kontext": "Container · Dialog „bereich“",
                                 "geraet": "Desktop"})
    assert msg["success"], msg
    await hass.async_block_till_done()
    assert ereignisse and ereignisse[-1]["art"] == "meldung"
    assert ereignisse[-1]["text"] == "Meldung FE-0001 (Fehler): Knöpfe überlagern sich – Container · Dialog „bereich“"
    assert ereignisse[-1]["baustelle"] == baustelle.title


async def test_tickets_nummern_status_und_dienst(hass: HomeAssistant, baustelle, ws) -> None:
    """Meldungen werden Tickets: FE-/WU-/AN-Nummer je Art ab 0001, Status wie im Skill „ticket“, Dienst baustelle.ticket."""
    nummern = []
    for art, text in (("fehler", "A"), ("wunsch", "B"), ("fehler", "C"), ("anregung", "D")):
        msg = await ws.rufe("baustelle/meldung", aktion="neu", meldung={"art": art, "text": text})
        assert msg["success"], msg
        nummern.append(msg["result"]["ticket"])
    assert nummern == ["FE-0001", "WU-0001", "FE-0002", "AN-0001"]
    liste = (await ws.rufe("baustelle/meldungen"))["result"]
    assert {m["ticket"]: m["status"] for m in liste}["FE-0002"] == "neu"
    antwort = await hass.services.async_call("baustelle", "ticket", {"ticket": "fe-0002", "status": "geloest", "notiz": "behoben",
                                                                     "version": "0.7.4"}, blocking=True, return_response=True)
    assert antwort == {"ticket": "FE-0002", "status": "geloest", "status_text": "gelöst"}
    m = next(x for x in (await ws.rufe("baustelle/meldungen"))["result"] if x["ticket"] == "FE-0002")
    assert m["verlauf"][-1]["notiz"] == "behoben" and m["verlauf"][-1]["von"] == "Claude"
    await hass.async_block_till_done()
    md = Path(hass.config.path("baustelle", "meldungen.md")).read_text(encoding="utf-8")
    assert "### FE-0002 · Fehler · gelöst" in md and "(Claude): gelöst · v0.7.4 · behoben" in md
    # Seite schließt
    assert (await ws.rufe("baustelle/meldung", aktion="status", meldung={"id": m["id"], "status": "geschlossen"}))["success"]
    with pytest.raises(Exception):
        await hass.services.async_call("baustelle", "ticket", {"ticket": "FE-9999", "status": "neu"}, blocking=True)


async def test_alte_meldungen_werden_nummeriert(hass: HomeAssistant, hass_storage) -> None:
    """Meldungen aus 0.7.0–0.7.3 ohne Nummer bekommen beim Laden FE-0001 … (älteste zuerst), Status offen → neu."""
    from custom_components.baustelle.einstellungen import Meldungen
    hass_storage["baustelle.meldungen"] = {"version": 1, "key": "baustelle.meldungen", "data": {"meldungen": [
        {"id": "m2", "art": "fehler", "text": "neuer", "status": "erledigt"},
        {"id": "m1", "art": "fehler", "text": "älter", "status": "offen"}]}}
    mel = Meldungen(hass)
    liste = await mel.async_laden()
    assert [(m["id"], m["ticket"], m["status"]) for m in liste] == [("m2", "FE-0002", "geschlossen"), ("m1", "FE-0001", "neu")]
    assert mel.neue_nummer("fehler") == "FE-0003"


async def test_modus_frostschutz_urlaub_setzen(hass: HomeAssistant, baustelle, ws) -> None:
    """Aus 0.6.3 zurück (0.7.8): Modus je Container, Frostschutz ein/aus, Urlaub/Feiertag, Pumpen-Schwellen."""
    st = baustelle.runtime_data
    lz = (await ws.rufe("baustelle/struktur", mit_entry=False))["result"][0]["laufzeit"]
    assert lz["container"][C1]["modus"] == "thermo" and lz["container"][C2]["modus"] == "plan"   # abgeleitet (Fühler)
    assert lz["container"][SCHACHT]["modus"] is None
    assert (await ws.rufe("baustelle/setzen", pfad=["bereiche", C2, "modus"], wert="bedarf"))["success"]
    assert st.e["bereiche"][C2]["bedarf"] is True and st.e["bereiche"][C2]["auto"] is True and st.funktion("heizung").modus(C2) == "bedarf"
    assert (await ws.rufe("baustelle/setzen", pfad=["bereiche", C2, "modus"], wert="hand"))["success"]
    assert st.e["bereiche"][C2]["auto"] is False and st.e["bereiche"][C2]["bedarf"] is False
    assert (await ws.rufe("baustelle/setzen", pfad=["bereiche", C1, "modus"], wert="aus"))["success"]
    assert st.funktion("heizung").modus(C1) == "aus" and "Modus: Aus" in [p[3] for p in st.e["protokoll"]]
    # auto/bedarf allein heben den Modus auf
    assert (await ws.rufe("baustelle/setzen", pfad=["bereiche", C1, "auto"], wert=True))["success"]
    assert st.e["bereiche"][C1]["modus"] is None and st.funktion("heizung").modus(C1) == "thermo"
    # Thermostat nur mit Fühler
    msg = await ws.rufe("baustelle/setzen", pfad=["bereiche", C2, "modus"], wert="thermo")
    assert msg["error"]["code"] == "invalid_format"
    # Frostschutz ein/aus, Urlaub
    assert (await ws.rufe("baustelle/setzen", pfad=["heizung", "frost_aus"], wert=8.0))["success"]
    assert (await ws.rufe("baustelle/setzen", pfad=["heizung", "frost_aus"], wert=4.0))["error"]["code"] == "invalid_format"
    assert (await ws.rufe("baustelle/setzen", pfad=["heizung", "frost_grenze"], wert=8.0))["error"]["code"] == "invalid_format"
    assert (await ws.rufe("baustelle/setzen", pfad=["heizung", "frei_modus"], wert="absenk"))["success"]
    assert (await ws.rufe("baustelle/setzen", pfad=["heizung", "absenk"], wert=12.0))["success"]
    assert (await ws.rufe("baustelle/setzen", pfad=["heizung", "frei_modus"], wert="kalt"))["error"]["code"] == "invalid_format"
    assert st.e["heizung"]["frost_aus"] == 8.0 and st.e["heizung"]["frei_modus"] == "absenk" and st.e["heizung"]["absenk"] == 12.0
    # Pumpen-Schwellen (gab es schon, jetzt auf der Seite)
    assert (await ws.rufe("baustelle/setzen", pfad=["meldungen_einst", "trocken_unter_w"], wert=40))["success"]
    assert (await ws.rufe("baustelle/setzen", pfad=["meldungen_einst", "offline_min"], wert=10))["success"]
    assert st.e["erklaer"] is True
    assert (await ws.rufe("baustelle/setzen", pfad=["erklaer"], wert=False))["success"] and st.e["erklaer"] is False


async def test_aktion_test_meldung(hass: HomeAssistant, baustelle, ws, nachrichten) -> None:
    st = baustelle.runtime_data
    st.einstellung_setzen(("meldungen_einst", "empfaenger"), ["mobile_app_test"])
    antwort = await ws.rufe("baustelle/aktion", aktion="test_meldung")
    assert antwort["result"]["ok"] and antwort["result"]["an"]
    assert nachrichten[-1].data["title"] == "🔔 Test" and "kommen an" in nachrichten[-1].data["message"]


async def test_modus_schaltet(hass: HomeAssistant, baustelle, ws, shellys, freezer) -> None:
    """In der Arbeitszeit: Modus Aus schaltet ab (nur Frostschutz), Zeitplan heizt wieder."""
    st = baustelle.runtime_data
    freezer.move_to("2026-09-29 10:00:00+02:00")
    st.einstellung_setzen(("automatik",), True)
    await hass.async_block_till_done()
    assert "switch.hk1" in shellys.ein()
    assert (await ws.rufe("baustelle/setzen", pfad=["bereiche", C1, "modus"], wert="aus"))["success"]
    assert hass.states.get("switch.hk1").state == "off" and st.daten.grund[C1] == "aus"
    freezer.tick(timedelta(minutes=10))   # Mindestpause
    assert (await ws.rufe("baustelle/setzen", pfad=["bereiche", C1, "modus"], wert="plan"))["success"]
    # heizt wieder nach Plan; ob Heizkörper 1 gleich läuft, entscheidet die Staffelung (Heizkörper 2 hat den Platz
    # am kleinen Anschluss inzwischen bekommen)
    assert st.daten.grund[C1] == "arbeitszeit" and "switch.hk2" in shellys.ein()


async def test_geraete_entitaeten_mit_container_im_namen(hass: HomeAssistant, baustelle) -> None:
    """Kleinigkeit aus bauplan §6: gleich benannte Geräte in verschiedenen Containern – Container immer vorne."""
    from homeassistant.helpers import entity_registry as er

    reg = er.async_get(hass)
    eid = reg.async_get_entity_id("sensor", "baustelle", f"{HK2}_mittel_im_betrieb")
    assert eid is not None
    assert "Container 2 · Heizkörper 2" in hass.states.get(eid).attributes["friendly_name"]


async def test_frostschutz_bei_automatik_aus(hass: HomeAssistant, baustelle, ws, shellys, freezer) -> None:
    """Schalter „Frostschutz auch bei Automatik aus“ (startet aus): nur der Frost-Container wird geschaltet."""
    st = baustelle.runtime_data
    freezer.move_to("2026-09-29 22:00:00+02:00")
    assert st.e["automatik"] is False and st.e["heizung"]["frost_immer"] is False
    hass.states.async_set("sensor.temp_c1", "3.0", {"unit_of_measurement": "°C", "device_class": "temperature"})
    await hass.async_block_till_done()
    assert hass.states.get("switch.hk1").state == "off"          # Standard: bei Automatik aus nichts schalten
    assert (await ws.rufe("baustelle/setzen", pfad=["heizung", "frost_immer"], wert=True))["success"]
    assert hass.states.get("switch.hk1").state == "on" and st.daten.grund[C1] == "frost"
    assert hass.states.get("switch.hk2").state == "off"          # Container ohne Fühler: kein Frostschutz
    hass.states.async_set("sensor.temp_c1", "8.0", {"unit_of_measurement": "°C", "device_class": "temperature"})
    freezer.tick(timedelta(minutes=15))                           # Mindestlauf
    st.auswerten()
    await hass.async_block_till_done()
    assert hass.states.get("switch.hk1").state == "off"


async def test_alte_automatische_arbeitszeit_weicht(hass: HomeAssistant, freezer, shellys, nachrichten, hass_storage) -> None:
    """FE-0002: im Store (vor 0.7.28) die automatische ohne Kennzeichen und die eigene ab 09.02. – nach dem Laden gilt die eigene."""
    entry = await baustelle_anlegen(hass, freezer)
    standard = {"0": ["07:00", "16:30"], "1": ["07:00", "16:30"], "2": ["07:00", "16:30"], "3": ["07:00", "16:30"],
                "4": ["07:00", "12:30"], "5": None, "6": None}
    eigene = {"ab": "2026-02-09", "name": "Meine", "tage": {**standard, "0": ["06:30", "15:00"]}}
    hass_storage[f"baustelle.{entry.entry_id}"] = {"version": 2, "key": f"baustelle.{entry.entry_id}", "data": {
        "arbeitszeiten": [eigene, {"ab": "2026-09-29", "name": "Arbeitszeit", "tage": standard}]}}
    assert await hass.config_entries.async_setup(entry.entry_id)
    await hass.async_block_till_done()
    st = entry.runtime_data
    assert [(a["ab"], a["name"]) for a in st.e["arbeitszeiten"]] == [("2026-02-09", "Meine")]
    await hass.config_entries.async_unload(entry.entry_id)
    await hass.async_block_till_done()


async def test_nur_admins_aendern(hass: HomeAssistant, baustelle, ws, shellys, freezer, hass_admin_user) -> None:
    """Bauplan 0.7 §8: lesen alle, ändern nur Admins; vor Ort gehen Gefühl, Warnung stumm und jetzt heizen."""
    st = baustelle.runtime_data
    freezer.move_to("2026-09-29 17:00:00+02:00")
    assert (await ws.rufe("baustelle/struktur", mit_entry=False))["result"][0]["rechte"]["aendern"] is True
    mid = (await ws.rufe("baustelle/meldung", mit_entry=False, aktion="neu", meldung={"art": "fehler", "text": "x"}))["result"]["id"]
    hass_admin_user.groups = []   # derselbe Benutzer, jetzt ohne Admin-Recht
    r = (await ws.rufe("baustelle/struktur", mit_entry=False))["result"][0]["rechte"]
    assert r["aendern"] is False and "gefuehl" in r["aktionen"] and "automatik" not in r["aktionen"]

    def abgewiesen(antwort: dict) -> bool:
        return not antwort["success"] and antwort["error"]["code"] == "unauthorized"

    assert abgewiesen(await ws.rufe("baustelle/setzen", pfad=["automatik"], wert=True))
    assert st.e["automatik"] is False
    assert abgewiesen(await ws.rufe("baustelle/liste", liste="ausnahmen", aktion="speichern",
                                    eintrag={"datum": "2026-10-02", "art": "frei"}))
    for aktion, felder in [("automatik", {"geraet": HK2}), ("schalten", {"geraet": HK2, "an": True}),
                           ("lern_reset", {"bereich": C1}), ("zuruecksetzen", {}), ("test_meldung", {}),
                           ("soll_versch", {"bereich": C1, "d": 1})]:
        assert abgewiesen(await ws.rufe("baustelle/aktion", aktion=aktion, **felder)), aktion
    assert abgewiesen(await ws.rufe("baustelle/meldung", mit_entry=False, aktion="status", meldung_id=mid, status="geschlossen"))
    assert abgewiesen(await ws.rufe("baustelle/meldung", mit_entry=False, aktion="loeschen", meldung_id=mid))
    # erlaubt: lesen, melden, Bedienung vor Ort
    assert (await ws.rufe("baustelle/protokoll"))["success"]
    assert (await ws.rufe("baustelle/meldungen", mit_entry=False))["success"]
    assert (await ws.rufe("baustelle/meldung", mit_entry=False, aktion="neu", meldung={"art": "wunsch", "text": "y"}))["success"]
    assert (await ws.rufe("baustelle/aktion", aktion="bedarf", bereich=C2, minuten=60, boost=True))["success"]
    assert (await ws.rufe("baustelle/aktion", aktion="bedarf_aus", bereich=C2))["success"]
    assert (await ws.rufe("baustelle/aktion", aktion="boost", bereich=C1, an=True))["success"]
    assert (await ws.rufe("baustelle/aktion", aktion="jetzt_heizen", minuten=60))["success"]
    assert (await ws.rufe("baustelle/aktion", aktion="warnung_stumm", key="kein_wetter"))["success"]
