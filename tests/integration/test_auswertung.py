"""Auswertung und Abrechnung für die Seite (api-0.7 §8): Befehle `baustelle/auswertung` und `baustelle/abrechnung`.

Die Langzeitstatistik kommt aus einem festen Modell (je Stunde, daraus Tag und Monat wie beim Recorder). Geprüft wird vor
allem: Bericht und Befehl zeigen für denselben Zeitraum dieselben Zahlen, der CSV-Anhang ist dieselbe CSV wie auf der Seite.
"""

from __future__ import annotations

from datetime import date, datetime, timedelta
from typing import Any

import pytest

from homeassistant.core import HomeAssistant
from homeassistant.helpers import entity_registry as er
from homeassistant.util import dt as dt_util
from pytest_homeassistant_custom_component.common import MockConfigEntry

from custom_components.baustelle import auswertung
from custom_components.baustelle.const import DOMAIN
from custom_components.baustelle.logik.bericht import de

from .conftest import C2, HK1, P1, sub

HUBER = {"id": "huber", "name": "Elektro Huber GmbH"}


def _modell(sid: str, zeit: datetime) -> dict[str, float]:
    """Wert einer Statistik in der Stunde ab `zeit` (lokal): Energie tagsüber mehr, Heizzeit werktags, Außen je Tag."""
    tag, h, werktag = zeit.date(), zeit.hour, zeit.weekday() < 5
    faktor = 1 + (sum(map(ord, sid)) % 4) / 4
    if "aussen" in sid:
        return {"mean": 2.0 + tag.day % 9 + h / 24}
    if "heizzeit" in sid:
        return {"change": 0.5 if werktag and 6 <= h < 17 else 0.0}
    if "pumpzeit" in sid:
        return {"change": 0.1 * faktor}
    if "ohne_automatik" in sid:   # Dauerbetrieb: immer mehr als mit Automatik
        return {"change": 5.0}
    if "energie" in sid:
        return {"change": faktor * (1.5 if werktag and 6 <= h < 17 else 0.2)}
    return {}


async def _statistik(hass, ids, start: datetime, ende: datetime, periode: str, arten: set[str]) -> dict[str, list[dict[str, Any]]]:
    """Wie `recorder/statistics_during_period`: je Periode ein Punkt (`start` in Sekunden), Änderung summiert, Mittel."""
    zone = dt_util.get_default_time_zone()
    registry = er.async_get(hass)
    ergebnis: dict[str, list[dict[str, Any]]] = {}
    for eid in {i for i in ids if i}:
        sid = (e := registry.async_get(eid)) and e.unique_id or eid   # Modell nach unique_id (<bid>_energie, …)
        eimer: dict[datetime, list[dict[str, float]]] = {}
        zeit, bis = start.astimezone(zone), min(ende, dt_util.now())   # wie der Recorder: nur bis jetzt
        while zeit < bis:
            lokal = zeit.astimezone(zone)
            beginn = (lokal.replace(minute=0, second=0) if periode == "hour" else lokal.replace(hour=0, minute=0, second=0)
                      if periode == "day" else lokal.replace(day=1, hour=0, minute=0, second=0))
            if werte := _modell(str(sid), lokal):
                eimer.setdefault(beginn, []).append(werte)
            zeit += timedelta(hours=1)
        punkte = []
        for beginn, liste in sorted(eimer.items()):
            p: dict[str, Any] = {"start": beginn.timestamp()}
            if "change" in liste[0] and "change" in arten:
                p["change"] = sum(x["change"] for x in liste)
            if "mean" in liste[0] and "mean" in arten:
                p["mean"] = sum(x["mean"] for x in liste) / len(liste)
            if len(p) > 1:
                punkte.append(p)
        if punkte:
            ergebnis[eid] = punkte
    return ergebnis


@pytest.fixture
def statistik(monkeypatch):
    monkeypatch.setattr(auswertung, "async_statistik", _statistik)


@pytest.fixture
async def ws(hass: HomeAssistant, baustelle, hass_ws_client):
    client = await hass_ws_client(hass)
    nr = {"id": 0}

    async def rufe(typ: str, **felder) -> dict[str, Any]:
        nr["id"] += 1
        await client.send_json({"id": nr["id"], "type": typ, "entry_id": baustelle.entry_id, **felder})
        return await client.receive_json()

    return rufe


def _huber(st, ab: str = "2026-09-23T10:00:00+02:00") -> None:
    """Container 2 gehört ab `ab` der Firma Huber (Wechsel mitten am Tag → ab dem Folgetag)."""
    st.e["firmen"] = [*st.e["firmen"], dict(HUBER)]
    st.e["zuordnung"] = [{"bereich": C2, "firma": "huber", "ab": ab}]


@pytest.mark.parametrize(("art", "zeitraum", "ab"), [("woche", "Woche", "2026-09-23T10:00:00+02:00"),
                                                     ("monat", "Monat", "2026-08-20T10:00:00+02:00")])
async def test_bericht_gleich_befehl(hass: HomeAssistant, baustelle, ws, statistik, art, zeitraum, ab) -> None:
    """Bericht (Vorwoche/Vormonat) und Seite (Zeitraum davor) zeigen dieselben Zahlen je Firma und Container."""
    st = baustelle.runtime_data
    _huber(st, ab)
    bericht = (await ws("baustelle/bericht", art=art))["result"]
    abr = (await ws("baustelle/abrechnung", zeitraum=zeitraum, versatz=1))["result"]
    aw = (await ws("baustelle/auswertung", zeitraum=zeitraum, versatz=1))["result"]
    assert (abr["zeitraum"]["von"], aw["zeitraum"]["von"]) == (bericht["von"], bericht["von"])
    assert date.fromisoformat(abr["zeitraum"]["bis"]) == date.fromisoformat(bericht["bis"]) + timedelta(days=1)
    firmen = {f["name"]: (f["kwh"], f["eur"]) for f in bericht["firmen"]}
    assert firmen == {f["firma"]: pytest.approx((f["kwh"], f["eur"])) for f in abr["firmen"]}
    assert set(firmen) == {"Eigene Firma", "Elektro Huber GmbH"}
    je_container = {c["name"]: c["kwh"] for c in bericht["container"]}
    assert sum(je_container.values()) == pytest.approx(abr["kwh"]) == pytest.approx(aw["summen"]["kwh"])
    for f in abr["firmen"]:
        for c in f["container"]:
            if c["bereich"] != C2:
                assert c["kwh"] == pytest.approx(je_container[c["name"]])
    assert sum(c["kwh"] for f in abr["firmen"] for c in f["container"] if c["bereich"] == C2) == pytest.approx(je_container["Container 2"])
    assert bericht["summe"].endswith(f": {de(aw['summen']['kwh'], 0)} kWh · {de(aw['summen']['eur'], 2)} €")


async def test_csv_anhang_gleich_seite(hass: HomeAssistant, baustelle, ws, statistik, monkeypatch) -> None:
    """Der CSV-Anhang des Berichts ist die CSV „Abrechnung“ der Seite (nur die Spalte Zeitraum trägt den Berichtstext)."""
    from custom_components.baustelle.nachrichten import Nachrichten

    st = baustelle.runtime_data
    _huber(st)
    anhaenge: list[str] = []

    async def anhang(self, dienst, name, text):
        anhaenge.append(text)
        return f"/media/baustelle/{name}"

    monkeypatch.setattr(Nachrichten, "_async_anhang", anhang)
    hass.services.async_register("notify", "smtp_test", lambda call: None)
    st.einstellung_setzen(("bericht", "mail"), True)
    st.einstellung_setzen(("bericht", "mail_dienst"), "smtp_test")
    st.einstellung_setzen(("bericht", "csv"), True)
    await st.nachrichten.async_bericht_senden("woche")
    seite = (await ws("baustelle/abrechnung", zeitraum="Woche", versatz=1))["result"]["csv"]["firma"]
    (text,) = anhaenge
    assert text.startswith("﻿Zeitraum;Firma;Baustelle;Container;kWh;Preis €/kWh;Betrag €\r\n")
    ohne_zeitraum = [z.split(";", 1)[1] for z in text.split("\r\n")[1:]]
    assert ohne_zeitraum == [z.split(";", 1)[1] for z in seite.split("\r\n")[1:]] and len(ohne_zeitraum) == 4
    assert all(z.startswith("Woche;") for z in seite.split("\r\n")[1:])


async def test_abrechnung_befehl(hass: HomeAssistant, baustelle, ws, statistik) -> None:
    st = baustelle.runtime_data
    _huber(st, "2026-09-01T00:00:00+02:00")
    st.einstellung_setzen(("preis",), 0.3)
    r = (await ws("baustelle/abrechnung", zeitraum="Monat"))["result"]
    assert r["zeitraum"] | {"labels": None} == {"art": "Monat", "von": "2026-09-01", "bis": "2026-10-01", "periode": "day",
                                                "n": 30, "labels": None, "monat": 9, "jahr": 2026}
    assert [f["firma"] for f in r["firmen"]] == ["Eigene Firma", "Elektro Huber GmbH"] and r["firmen"][0]["eigen"]
    huber = r["firmen"][1]
    assert [c["name"] for c in huber["container"]] == ["Container 2"] and huber["container"][0]["titel"] == "B1"
    assert huber["eur"] == pytest.approx(huber["kwh"] * 0.3)
    assert sum(f["anteil"] for f in r["firmen"]) == pytest.approx(100)
    # Verbrauch gestapelt nach Firma: je Tag des Monats, Summe = Tabelle
    assert set(r["reihen"]) == {"eigen", "Elektro Huber GmbH"} and len(r["reihen"]["eigen"]) == 30
    assert sum(r["reihen"]["Elektro Huber GmbH"]) == pytest.approx(huber["kwh"])
    assert r["reihen"]["eigen"][29] == 0   # 30.09. hat noch nicht begonnen (Statistik bis jetzt)
    # CSV wie die Seite: BOM, Semikolon, Dezimalkomma, CRLF
    firma = r["csv"]["firma"].split("\r\n")
    assert firma[0] == "﻿Zeitraum;Firma;Baustelle;Container;kWh;Preis €/kWh;Betrag €"
    assert firma[-1].startswith("Monat;Elektro Huber GmbH;B1;Container 2;") and firma[-1].count(",") == 3
    verbrauch = r["csv"]["verbrauch"].split("\r\n")
    assert verbrauch[0] == "﻿Zeit;Baustelle;Firma;Container;kWh;Kosten €" and len(verbrauch) == 1 + 3 * 30
    assert verbrauch[1].startswith("01.09.2026;B1;Eigene Firma;Container 1;")
    assert verbrauch[31].startswith("01.09.2026;B1;Elektro Huber GmbH;Container 2;")
    # Jahr: Firma je Tag, Verbrauch je Monat
    jahr = (await ws("baustelle/abrechnung", zeitraum="Jahr"))["result"]
    assert jahr["zeitraum"]["periode"] == "month" and len(jahr["reihen"]["eigen"]) == 12
    assert jahr["kwh"] == pytest.approx(sum(sum(v) for v in jahr["reihen"].values()))
    assert (await ws("baustelle/abrechnung", entry_id="falsch"))["error"]["code"] == "not_found"
    assert (await ws("baustelle/abrechnung", zeitraum="Quartal"))["error"]["code"] == "invalid_format"


async def test_auswertung_befehl(hass: HomeAssistant, baustelle, ws, statistik) -> None:
    st = baustelle.runtime_data
    st.einstellung_setzen(("preis",), 0.25)
    st.zaehler["heiztage"] = 20
    st.zaehler[f"mittel:{HK1}"] = 1900.0
    r = (await ws("baustelle/auswertung", zeitraum="Woche"))["result"]
    s = r["summen"]
    assert r["zeitraum"]["von"] == "2026-09-28" and s["eur"] == pytest.approx(s["kwh"] * 0.25)
    assert s["kwh"] > 0 and s["heizzeit"] > 0 and s["pumpzeit"] > 0 and s["ohne"] > s["kwh"]
    assert set(s["vorher"]) == {"kwh", "heizzeit", "pumpzeit"} and s["vorher"]["kwh"] > s["kwh"]   # Woche erst angebrochen
    assert s["veraenderung"]["kwh"] == round((s["kwh"] - s["vorher"]["kwh"]) / s["vorher"]["kwh"] * 100)
    assert s["ohne_automatik"]["gespart_eur"] == pytest.approx((s["ohne"] - s["kwh"]) * 0.25)
    assert s["ohne_automatik"]["ohne_eur"] == pytest.approx(s["ohne"] * 0.25)   # Balken „ohne (24/7)“ der Seite
    # dieselbe Heizzeit wie der Zähler-Sensor in der Statistik (Container, ohne Schacht)
    abr = (await ws("baustelle/abrechnung", zeitraum="Woche"))["result"]
    assert abr["kwh"] == pytest.approx(s["kwh"])
    geraete = {z["geraet"]: z for z in r["je_geraet"]}
    assert list(geraete) == [HK1, "sub_hk2", P1]   # nach Containern geordnet wie auf der Seite
    assert geraete[HK1]["mittel"] == 1.9 and geraete[HK1]["kwh"] is None   # kein Energiezähler am Gerät
    assert geraete[P1]["std"] == pytest.approx(s["pumpzeit"])   # Pumpe: gemessene Pumpzeit
    assert r["heizperiode"] == {"ende": "2026-04-30", "bis": "2026-04-30"} and r["heiztage"] == 20
    h = r["hochrechnung"]   # kWh und € der Hochrechnung rechnet die Integration (Seite zeigt nur an)
    assert set(h) == {"bisher_kwh", "bisher_eur", "mit_kwh", "mit_eur", "ohne_kwh", "ohne_eur", "gespart_eur",
                      # BSM-033.02: Hochrechnung mit Signatur (Spanne, Normjahr, Heizgradtage, je Container)
                      "methode", "unten_kwh", "unten_eur", "oben_kwh", "oben_eur", "normjahr_kwh", "normjahr_eur",
                      "hgt_rest", "vorhersage_tage", "container",
                      # BSM-033.03: Karte „Heizperiode“ (Tagesreihe, Klimamittel, Vorhersage, Zeitraum)
                      "reihe", "klima", "klima_vorgabe", "vorhersage", "beginn", "ende",
                      # BSM-033.04: Baseline-Läufe, „ohne Automatik“ gemessen oder geschätzt
                      "baseline", "ohne_methode", "ohne_hinweis", "perioden"}
    if h["mit_kwh"] is not None:
        assert h["mit_eur"] == pytest.approx(h["mit_kwh"] * 0.25)
    # BSM-033: Wetter-Einfluss aus der Energiesignatur der Baustelle (Tage aus der Datenbank; hier noch keine ganzen Tage)
    assert set(r["wetter"]) == {"punkte", "gerade", "stand", "tage"} and r["wetter"]["gerade"] is None
    assert set(r["typ"]) == {"oelradiator", "konvektor", "weniger", "vergleichbar", "ausgeschlossen", "ersparnis"}   # AN-0008: fair
    assert set(r["typ"]["oelradiator"]) == {"kwh_gradh", "kwh_gradh_m2", "auf", "ab", "container", "ids"}
    # WU-0005: Rangliste je Container (Summe = kWh der Container) und „Was fällt auf“
    rang = r["rangliste"]
    assert [c["bereich"] for c in rang] and all(c["baustelle"] == baustelle.title for c in rang)
    assert [c["kwh"] for c in rang] == sorted((c["kwh"] for c in rang), reverse=True)
    assert sum(c["anteil"] for c in rang) == pytest.approx(100) and all(c["eur"] == pytest.approx(c["kwh"] * 0.25) for c in rang)
    assert r["erkenntnisse"] and r["erkenntnisse"][0]["art"] == "gespart" and len(r["erkenntnisse"]) <= 5
    alle = (await ws("baustelle/auswertung", zeitraum="Woche", scope="alle"))["result"]
    assert alle["summen"]["kwh"] == pytest.approx(s["kwh"])   # nur eine laufende Baustelle
    assert (await ws("baustelle/auswertung", entry_id="falsch"))["error"]["code"] == "not_found"


async def test_verlauf_auch_ohne_geladene_baustelle(hass: HomeAssistant, baustelle, ws, statistik) -> None:
    """Verlauf und Detailseite: Kennzahlen, kWh je Monat, Verbrauch je Monat und Container mit CSV – auch für eine
    abgeschlossene Baustelle, die nicht geladen ist (aus der Einrichtung)."""
    st = baustelle.runtime_data
    st.zaehler.update(energie=120.0, kosten=33.6, heiztage=12)
    st.einstellung_setzen(("preis",), 0.3)
    v = (await ws("baustelle/auswertung", teil="verlauf"))["result"]
    assert (v["kwh"], v["eur"], v["heiztage"], v["container"]) == (120.0, 33.6, 12, 3)
    assert v["vergleich"]["tag"] == pytest.approx(10.0) and v["monate"] == 1   # September seit Beginn 01.09.
    assert "2026-09" in v["je_monat"] and len(v["je_monat"]) == 12
    assert [r["name"] for r in v["monate_je_container"]["reihen"]] == ["Container 1", "Container 2", "Schacht"]
    reihen = v["monate_je_container"]["reihen"]   # kWh, € und Anteil je Container: Integration, nicht die Seite
    assert all(r["kwh"] == pytest.approx(sum(r["v"])) and r["eur"] == pytest.approx(r["kwh"] * 0.3) for r in reihen)
    ges = sum(r["kwh"] for r in reihen)
    assert ges > 0 and sum(r["anteil"] for r in reihen) == pytest.approx(100)
    assert all(r["anteil"] == pytest.approx(r["kwh"] / ges * 100) for r in reihen)
    assert v["monate_je_container"]["labels"] == ["Sep"] and v["csv"].startswith("﻿Monat;Baustelle;Container;kWh;Kosten €\r\nSep;B1;Container 1;")

    alt = MockConfigEntry(domain=DOMAIN, title="Halle", data={"name": "Halle"}, disabled_by=None,
                          options={"heizung": True, "status": "abgeschlossen", "beginn": "2025-11-03", "ende": "2026-03-27"},
                          subentries_data=[sub("h_buero", "bereich", "Büro", {"name": "Büro", "art": "container"})])
    alt.add_to_hass(hass)
    h = (await ws("baustelle/auswertung", entry_id=alt.entry_id, teil="verlauf"))["result"]
    assert h["monate_je_container"]["labels"] == ["Nov", "Dez", "Jän", "Feb", "Mär"]
    assert [r["name"] for r in h["monate_je_container"]["reihen"]] == ["Büro"] and h["container"] == 1
    assert h["kwh"] == 0 and h["heiztage"] == 0   # nicht geladen: keine Zähler, keine Sensoren


async def test_strompreis_mit_gilt_ab(hass: HomeAssistant, baustelle, ws, statistik) -> None:
    """Herbert 04.10.2026: Preisliste mit „gilt ab“ – Abrechnung je Tag mit dem damaligen Preis, Auswertung mit dem
    nach Verbrauch gewichteten Preis; Simulieren rechnet alles mit einem Preis, ohne etwas zu speichern."""
    st = baustelle.runtime_data
    st.einstellung_setzen(("preis",), 0.3)
    for ab, p in (("2026-09-01", 0.3), ("2026-09-15", 0.2)):
        r0 = await ws("baustelle/liste", liste="preise", aktion="speichern", eintrag={"ab": ab, "preis": p}); assert r0["success"], r0
    # der bisherige Preis bleibt für die Zeit davor erhalten; heute (29.09.) gilt 0,20 €
    assert [(x["ab"], x["preis"]) for x in st.e["preise"]] == [("2000-01-01", 0.3), ("2026-09-01", 0.3), ("2026-09-15", 0.2)]
    assert st.e["preis"] == 0.2
    r = (await ws("baustelle/abrechnung", zeitraum="Monat"))["result"]
    ges_kwh, ges_eur = r["kwh"], sum(f["eur"] for f in r["firmen"])
    tage = {}   # kWh je Tag aus den Reihen (Firma egal)
    for reihe in r["reihen"].values():
        for i, v in enumerate(reihe):
            tage[i + 1] = tage.get(i + 1, 0) + (v or 0)
    erwartet = sum(v * (0.3 if t < 15 else 0.2) for t, v in tage.items())
    assert ges_eur == pytest.approx(erwartet) and r["preis"] == pytest.approx(ges_eur / ges_kwh) and not r["simuliert"]
    sim = (await ws("baustelle/abrechnung", zeitraum="Monat", preis=0.5))["result"]
    assert sim["simuliert"] and sum(f["eur"] for f in sim["firmen"]) == pytest.approx(ges_kwh * 0.5)
    a = (await ws("baustelle/auswertung", zeitraum="Monat"))["result"]
    assert 0.2 <= a["preis"] <= 0.3 and not a["simuliert"]
    a_sim = (await ws("baustelle/auswertung", zeitraum="Monat", preis=0.5))["result"]
    assert a_sim["simuliert"] and a_sim["summen"]["eur"] == pytest.approx(a_sim["summen"]["kwh"] * 0.5)
    assert st.e["preise"][-1]["preis"] == 0.2                                     # Simulieren speichert nichts
    # löschen; der letzte Preis bleibt
    for ab in ("2026-09-15", "2026-09-01"):
        assert (await ws("baustelle/liste", liste="preise", aktion="loeschen", eintrag={"ab": ab}))["success"]
    assert not (await ws("baustelle/liste", liste="preise", aktion="loeschen", eintrag={"ab": "2000-01-01"}))["success"]
    assert st.e["preis"] == 0.3


async def test_kosten_zum_preis_von_heute(hass: HomeAssistant, baustelle, freezer) -> None:
    """Kosten-Zähler: jede kWh mit dem Preis, der an dem Tag gilt (Preisliste)."""
    st = baustelle.runtime_data
    st.e["preise"] = [{"ab": "2026-09-01", "preis": 0.3}, {"ab": "2026-09-29", "preis": 0.1}]
    st.preis_abgleichen()
    assert st.e["preis"] == 0.1
    k0 = st.zaehler.get("kosten", 0.0)
    g = next(iter(st.geraete.values()))
    st._energie_buchen(g, 2.0)
    assert st.zaehler["kosten"] - k0 == pytest.approx(0.2)
