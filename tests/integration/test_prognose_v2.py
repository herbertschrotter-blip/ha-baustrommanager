"""Prognose V2, P2 (BSM-033.07): Minuten aus der Datenbank → BereichIntervall → Tagesmerkmale, WS `baustelle/prognose_v2`.

Ein guter Arbeitstag (19.11.) mit belegtem Kontext ist geeignet; der Tag davor besteht nur aus Stundenimporten (kein
Training), der 17.11. liegt vor dem ersten Ereignis `prognose_kontext` – sein Kontext bleibt unbelegt (nicht mit den
heutigen Einstellungen aufgefüllt).
"""

from __future__ import annotations

from datetime import date, datetime, time, timedelta
from zoneinfo import ZoneInfo

import pytest
from sqlalchemy import delete, insert, update

from homeassistant.core import HomeAssistant
from homeassistant.util import dt as dt_util

from custom_components.baustelle.db import DATA_DB, schema as s
from custom_components.baustelle.db.prognose import PrognoseRahmen, prognose_minuten
from custom_components.baustelle.funktionen.heizung import Heizung

from .conftest import C1, C2, HK1, HK2, baustelle_anlegen, zeilen_db

WIEN = ZoneInfo("Europe/Vienna")
HEUTE = date(2026, 11, 20)
GUT, STUNDEN, ALT = date(2026, 11, 19), date(2026, 11, 18), date(2026, 11, 17)


def lokal(tag: date, minuten: int = 0) -> datetime:
    return dt_util.as_utc(datetime.combine(tag, time(), WIEN) + timedelta(minutes=minuten))


def _minuten(bid: str, tag: date) -> tuple[list[dict], list[dict], list[dict]]:
    """Arbeitstag: 0–7 außerhalb (innen 21,5), 7–17 Arbeitszeit Soll 22, dann außerhalb; außen 12, 0 kWh."""
    bm, gm, wm = [], [], []
    for i in range(24 * 60):
        t = lokal(tag, i)
        arbeit = 7 * 60 <= i < 17 * 60
        bm.append({"bereich_id": C1, "zeit": t, "baustelle_id": bid, "dauer_s": 60, "temperatur": 22.0 if arbeit else 21.5,
                   "soll": 22.0, "tuer_offen_s": 0, "zustand": "heizt" if arbeit else "aus",
                   "grund": "arbeitszeit" if arbeit else "ausserhalb", "quelle": "ha", "temp_alter_s": 30, "staffel_begrenzt_s": 0})
        gm.append({"geraet_id": HK1, "zeit": t, "baustelle_id": bid, "dauer_s": 60, "sekunden_ein": 0, "sekunden_strom": 0,
                   "leistung_w": 0.0, "leistung_w_max": 0.0, "energie_wh": 0.0, "erreichbar": True, "quelle": "ha",
                   "heizanforderung_s": 0, "staffel_gesperrt_s": 0})
        wm.append({"baustelle_id": bid, "zeit": t, "dauer_s": 60, "aussen_temp": 12.0, "quelle": "ha"})
    return bm, gm, wm


async def _daten(hass: HomeAssistant, entry) -> str:
    """Drei Tage in die Datenbank; liefert die Konfigurations-ID von Container 1."""
    st = entry.runtime_data
    bid = entry.entry_id
    _, kid = Heizung.von(st).prognose_kontext(C1)
    bm, gm, wm = [], [], []
    for tag in (GUT, ALT):
        b, g, w = _minuten(bid, tag)
        bm += b
        gm += g
        wm += w
    for h in range(24):   # 18.11.: nur Stundenwerte aus der Langzeitstatistik
        t = lokal(STUNDEN, h * 60)
        bm.append({"bereich_id": C1, "zeit": t, "baustelle_id": bid, "dauer_s": 3600, "temperatur": 21.0, "quelle": "import_statistik"})
        gm.append({"geraet_id": HK1, "zeit": t, "baustelle_id": bid, "dauer_s": 3600, "energie_wh": 500.0, "quelle": "import_statistik"})
    heizung = dict(st.e["heizung"])
    bm = [{**dict.fromkeys(bm[0]), **z} for z in bm]   # gleiche Schlüssel je Zeile (executemany)
    gm = [{**dict.fromkeys(gm[0]), **z} for z in gm]

    def schreiben(v):
        v.execute(insert(s.bereich_minute), bm)
        v.execute(insert(s.geraet_minute), gm)
        v.execute(insert(s.wetter_minute), wm)
        v.execute(insert(s.einstellung), [
            {"baustelle_id": bid, "schluessel": "heizung", "wert": heizung, "ab": lokal(date(2026, 11, 1)), "quelle": "seite"},
            {"baustelle_id": bid, "schluessel": "geraete", "wert": {HK1: {"nenn_kw": 2.0}}, "ab": lokal(date(2026, 11, 1)),
             "quelle": "seite"}])
        # erstes Ereignis am 18.11.: der 17.11. hat keinen belegten Kontext; am 19.11. Grundwechsel um 07:00:30 (mitten in
        # der Minute) und um 17:00:00 (genau an der Minutengrenze)
        for zeit, grund in ((lokal(STUNDEN), "ausserhalb"), (lokal(GUT, 7 * 60) + timedelta(seconds=30), "arbeitszeit"),
                            (lokal(GUT, 17 * 60), "ausserhalb")):
            v.execute(insert(s.ereignis).values(
                zeit=zeit, baustelle_id=bid, bereich_id=C1, art="prognose_kontext", quelle="automatik",
                wert={"grund": grund, "zustand": "aus", "soll_c": 22.0, "regelungsart": "thermo", "konfiguration_id": kid}))
        # die Heizkörper gab es schon vor diesen Tagen (Stammdaten werden beim Start mit „angelegt“ = jetzt gespiegelt)
        v.execute(update(s.geraet).where(s.geraet.c.baustelle_id == bid).values(angelegt=lokal(date(2026, 11, 1))))
        # Aufbau 10 (P1-Spalten) schon seit dem 01.11. – die Minuten haben echte Nachweise
        v.execute(update(s.schema_version).where(s.schema_version.c.version == 10).values(angewendet=lokal(date(2026, 11, 1))))
        return True
    assert await hass.data[DATA_DB].async_ausfuehren(schreiben) is not None
    return kid


@pytest.fixture
async def baustelle_november(hass: HomeAssistant, freezer, shellys, nachrichten):
    entry = await baustelle_anlegen(hass, freezer, zeit="2026-11-20 10:00:00+01:00")
    assert await hass.config_entries.async_setup(entry.entry_id)
    await hass.async_block_till_done()
    return entry


async def test_adapter_aus_der_datenbank(hass: HomeAssistant, baustelle_november) -> None:
    kid = await _daten(hass, baustelle_november)
    rahmen = PrognoseRahmen(baustelle_november.entry_id, WIEN, (C1, C2))
    erg = await hass.data[DATA_DB].async_ausfuehren(lambda v: prognose_minuten(v, rahmen, lokal(ALT), lokal(HEUTE)))
    assert erg is not None and erg[C2] == ()
    ms = erg[C1]
    assert len(ms) == 2 * 1440 + 24
    gut = [m for m in ms if lokal(GUT) <= m.zeit.von < lokal(HEUTE)]
    m = gut[8 * 60]
    assert m.kontext.kontext_belegt and m.kontext.konfiguration_id == kid and m.kontext.regelungsart == "thermo"
    # Ereignis mitten in der Minute 07:00 → Wechsel; 16:59 endet genau mit dem nächsten Ereignis → kein Wechsel, belegt
    assert gut[7 * 60].kontext.wechsel_im_intervall and gut[7 * 60].kontext.kontext_belegt
    assert not gut[17 * 60 - 1].kontext.wechsel_im_intervall and gut[17 * 60 - 1].kontext.kontext_belegt
    assert gut[17 * 60].kontext.kontext_belegt and not gut[6 * 60].kontext.wechsel_im_intervall
    assert m.kontext.frost_bereit is True and (m.kontext.frost_grenze_c, m.kontext.frost_aus_c) == (5.0, 7.0)
    assert m.temp_alter_s == 30 and not m.altersnachweis_alt and m.staffel_begrenzt_s == 0
    (g,) = m.geraete
    assert g.geraet_id == HK1 and g.typ == "oelradiator" and g.energie_wh == 0.0 and g.strom_belegt
    assert g.p_ref is not None and g.p_ref.kw == 2.0 and g.p_ref.quelle == "geraet_einstellung"   # im Gerät eingestellt
    alt = [m for m in ms if m.zeit.von < lokal(STUNDEN)]
    assert alt and not any(m.kontext.kontext_belegt for m in alt)   # vor dem ersten Ereignis: nicht aufgefüllt
    stunden = [m for m in ms if lokal(STUNDEN) <= m.zeit.von < lokal(GUT)]
    assert len(stunden) == 24 and all((m.zeit.bis - m.zeit.von).total_seconds() == 3600 for m in stunden)


async def test_ws_prognose_v2(hass: HomeAssistant, baustelle_november, hass_ws_client) -> None:
    await _daten(hass, baustelle_november)
    ws = await hass_ws_client(hass)
    await ws.send_json({"id": 1, "type": "baustelle/prognose_v2", "entry_id": baustelle_november.entry_id, "tage": 3})
    antwort = await ws.receive_json()
    assert antwort["success"], antwort
    erg = antwort["result"]
    assert erg["verfuegbar"] and erg["modell_version"] == "prognose-v2.1"
    assert (erg["von"], erg["bis"]) == ("2026-11-17", "2026-11-19")
    je = {c["bereich"]: c for c in erg["container"]}
    assert je[C2]["tage"] == []
    tage = {t["datum"]: t for t in je[C1]["tage"]}
    assert set(tage) == {"2026-11-17", "2026-11-18", "2026-11-19"}
    gut = tage["2026-11-19"]
    assert gut["geeignet"] == {"thermo": True, "plan": False}
    # die Wechselminute 07:00 zählt nicht gemeinsam (60 s Lücke), der Tag bleibt geeignet
    assert gut["gdh"]["aktiv"] == pytest.approx(100 - 10 / 60, abs=1e-3) and gut["stunden"]["aktiv"] == pytest.approx(10.0)
    assert "wechsel_im_intervall" in gut["gruende"] and gut["laengste_luecke_s"] == 60
    assert gut["quoten"]["betrieb"] == pytest.approx(1.0) and gut["quoten"]["energie"] == {HK1: 1.0}
    assert gut["energie"]["kapazitaet_kwh"] == pytest.approx(20.0)
    assert [s["delta_k"] for s in gut["starts"]] == [pytest.approx(0.5)]
    alt = tage["2026-11-17"]
    assert not alt["geeignet"]["thermo"] and alt["quoten"]["betrieb"] == 0.0 and "betrieb_abdeckung" in alt["gruende"]
    stunden = tage["2026-11-18"]
    assert not stunden["geeignet"]["thermo"] and "kein_minutenwert" in stunden["gruende"]
    assert stunden["energie"]["ist_kwh"] == pytest.approx(12.0)   # Ist bleibt erhalten, nur kein Training
    assert je[C1]["geeignet"] == {"thermo": 1, "plan": 0}


@pytest.fixture
async def baustelle_19_november(hass: HomeAssistant, freezer, shellys, nachrichten):
    entry = await baustelle_anlegen(hass, freezer, zeit="2026-11-19 08:00:00+01:00")
    assert await hass.config_entries.async_setup(entry.entry_id)
    await hass.async_block_till_done()
    return entry


async def test_einstellung_nach_uebernahme_ueber_setzen(hass: HomeAssistant, baustelle_19_november, hass_ws_client) -> None:
    """B1: Stand je Zeitpunkt = Übernahme-Zeile + spätere Änderungen von `baustelle/setzen` (Punkt-Pfade) nach `ab`."""
    entry = baustelle_19_november
    st, bid, db = entry.runtime_data, entry.entry_id, hass.data[DATA_DB]
    frueher, m7, m9 = lokal(date(2026, 10, 30), 12 * 60), lokal(GUT, 7 * 60), lokal(GUT, 9 * 60)
    heizung = dict(st.e["heizung"])

    def ausgangsstand(v):
        # wie nach der Übernahme der Altdaten: ganze Zeilen, rückdatiert auf den Baustellenbeginn; Übernahme am 01.11.
        v.execute(delete(s.zustand).where(s.zustand.c.baustelle_id == bid, s.zustand.c.schluessel == "uebernahme"))
        v.execute(insert(s.zustand).values(baustelle_id=bid, schluessel="uebernahme", geaendert=lokal(date(2026, 11, 1)),
                                           wert={"zeit": lokal(date(2026, 11, 1), 6 * 60).isoformat()}))
        v.execute(insert(s.einstellung), [
            {"baustelle_id": bid, "schluessel": k, "wert": w, "ab": lokal(date(2026, 9, 1)), "quelle": "migration"}
            for k, w in (("heizung", heizung), ("geraete", {}))])
        for t in (frueher, m7, m9):
            v.execute(insert(s.bereich_minute).values(bereich_id=C1, zeit=t, baustelle_id=bid, dauer_s=60, temperatur=21.0,
                                                      soll=22.0, grund="ausserhalb", zustand="aus", quelle="ha"))
            v.execute(insert(s.geraet_minute).values(geraet_id=HK1, zeit=t, baustelle_id=bid, dauer_s=60, energie_wh=0.0,
                                                     quelle="ha"))
        return True
    assert await db.async_ausfuehren(ausgangsstand) is not None

    ws = await hass_ws_client(hass)
    for i, (pfad, wert) in enumerate(((["heizung", "frost_grenze"], 4.0), (["geraete", HK1, "nenn_kw"], 1.8)), start=1):
        await ws.send_json({"id": i, "type": "baustelle/setzen", "entry_id": bid, "pfad": pfad, "wert": wert})
        assert (await ws.receive_json())["success"]
    await hass.async_block_till_done()
    await db.schreiber.async_schreiben()
    zeilen = {z["schluessel"]: z for z in zeilen_db(hass, "einstellung") if z["schluessel"].startswith(("heizung.", "geraete."))}
    assert set(zeilen) == {"heizung.frost_grenze", f"geraete.{HK1}.nenn_kw"}   # der echte Weg schreibt Punkt-Pfade

    rahmen = PrognoseRahmen(bid, WIEN, (C1,))
    erg = await db.async_ausfuehren(lambda v: prognose_minuten(v, rahmen, lokal(date(2026, 10, 30)), lokal(HEUTE)))
    je = {m.zeit.von: m for m in erg[C1]}
    assert je[frueher].kontext.frost_bereit is None             # vor der Übernahme: Einstellung nicht belegt
    assert je[m7].kontext.frost_grenze_c == 5.0                 # Ausgangsstand der Übernahme
    assert je[m7].geraete == ()                                 # HK1 erst ab „angelegt“ (08:00) im Container
    assert je[m9].kontext.frost_grenze_c == 4.0                 # Änderung um 08:00 nachgespielt
    (g,) = je[m9].geraete
    assert g.p_ref is not None and g.p_ref.kw == 1.8 and g.p_ref.beleg_id == f"einstellung:{zeilen[f'geraete.{HK1}.nenn_kw']['id']}"


async def test_zuordnung_aus_dem_inventar(hass: HomeAssistant, baustelle_november) -> None:
    """S3: ab Aufbau 9 bestimmen die Einsatzintervalle, in welchem Container ein Heizkörper zum Zeitpunkt steht."""
    bid, db = baustelle_november.entry_id, hass.data[DATA_DB]
    t, davor = lokal(GUT, 12 * 60), lokal(GUT, 6 * 60)

    def schreiben(v):
        v.execute(update(s.geraet).where(s.geraet.c.baustelle_id == bid).values(angelegt=lokal(date(2026, 11, 1))))
        v.execute(insert(s.container_einsatz).values(container_id="k1", von=lokal(date(2026, 11, 1)), baustelle_id=bid, bereich_id=C1))
        # HK2 (laut Stammdaten in Container 2) steht ab 10:00 in Container 1
        v.execute(insert(s.ausruestung_einsatz).values(ausruestung_id="a2", von=lokal(GUT, 10 * 60), container_id="k1", geraet_id=HK2))
        for zeit in (davor, t):
            v.execute(insert(s.bereich_minute).values(bereich_id=C1, zeit=zeit, baustelle_id=bid, dauer_s=60, quelle="ha"))
            for gid in (HK1, HK2):
                v.execute(insert(s.geraet_minute).values(geraet_id=gid, zeit=zeit, baustelle_id=bid, dauer_s=60, energie_wh=0.0, quelle="ha"))
        return True
    assert await db.async_ausfuehren(schreiben) is not None
    rahmen = PrognoseRahmen(bid, WIEN, (C1, C2))
    erg = await db.async_ausfuehren(lambda v: prognose_minuten(v, rahmen, lokal(GUT), lokal(HEUTE)))
    je = {m.zeit.von: m for m in erg[C1]}
    assert [g.geraet_id for g in je[davor].geraete] == [HK1]          # vor dem Einsatz: nirgends zugeordnet
    assert [g.geraet_id for g in je[t].geraete] == [HK1, HK2]
    assert erg[C2] == ()                                              # HK2 steht laut Inventar nicht in Container 2
