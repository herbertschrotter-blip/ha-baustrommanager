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
from custom_components.baustelle.db.prognose import PrognoseRahmen, minuten_bauen, prognose_minuten, prognose_rohdaten
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


# ---------------------------------------------------------------------- P2b: Kontext für Altdaten rekonstruiert
ALT_GUT, ALT_FALSCH, ERSTES = date(2026, 11, 16), date(2026, 11, 17), date(2026, 11, 18)


async def _altdaten(hass: HomeAssistant, entry, *, kid_ereignis: str | None = None) -> str:
    """Übernahme (ganze Zeilen, rückdatiert), Punkt-Pfade für den Modus, Inventar für HK1, Tagessummen; Minuten am
    16./17. (vor dem ersten Ereignis) und 18./19. (Abnahmeprüfung gegen die echten Ereignisse)."""
    st, bid = entry.runtime_data, entry.entry_id
    _, kid = Heizung.von(st).prognose_kontext(C1)
    bm, gm, wm = [], [], []
    for tag in (ALT_GUT, ALT_FALSCH, ERSTES, GUT):
        b, g, w = _minuten(bid, tag)
        bm, gm, wm = bm + b, gm + g, wm + w
    heizung, bereiche = dict(st.e["heizung"]), {k: dict(v) for k, v in st.e["bereiche"].items()}

    def schreiben(v):
        v.execute(insert(s.bereich_minute), bm)
        v.execute(insert(s.geraet_minute), gm)
        v.execute(insert(s.wetter_minute), wm)
        v.execute(update(s.geraet).where(s.geraet.c.baustelle_id == bid).values(angelegt=lokal(date(2026, 11, 1))))
        v.execute(delete(s.zustand).where(s.zustand.c.baustelle_id == bid, s.zustand.c.schluessel == "uebernahme"))
        v.execute(insert(s.zustand).values(baustelle_id=bid, schluessel="uebernahme", geaendert=lokal(date(2026, 11, 1)),
                                           wert={"zeit": lokal(date(2026, 11, 1), 6 * 60).isoformat()}))
        v.execute(insert(s.einstellung), [
            {"baustelle_id": bid, "bereich_id": None, "schluessel": k, "wert": w, "ab": lokal(date(2026, 9, 1)), "quelle": "migration"}
            for k, w in (("heizung", heizung), ("geraete", {}), ("bereiche", bereiche))])
        # Punkt-Pfade wie von baustelle/setzen: am 16.11. von 12 bis 18 Uhr Zeitplan, dann wieder Thermostat
        v.execute(insert(s.einstellung), [
            {"baustelle_id": bid, "bereich_id": C1, "schluessel": f"bereiche.{C1}.modus", "wert": modus,
             "ab": lokal(ALT_GUT, stunde * 60), "quelle": "seite"}
            for stunde, modus in ((12, "plan"), (18, "thermo"))])
        # Inventar: HK1 steht über den Container k1 in Container 1; HK2 ohne Inventar (Stammdaten: Container 2)
        v.execute(insert(s.container_einsatz).values(container_id="k1", von=lokal(date(2026, 11, 1)), baustelle_id=bid, bereich_id=C1))
        v.execute(insert(s.ausruestung_einsatz).values(ausruestung_id="a1", von=lokal(date(2026, 11, 1)), container_id="k1", geraet_id=HK1))
        # Tagessummen: am 17.11. war HK2 Container 1 zugerechnet – passt nicht zur heutigen Zuordnung
        v.execute(insert(s.tag_geraet), [
            {"geraet_id": gid, "datum": tag, "baustelle_id": bid, "bereich_id": C1 if (gid == HK1 or tag == ALT_FALSCH) else C2}
            for tag in (ALT_GUT, ALT_FALSCH, ERSTES, GUT) for gid in (HK1, HK2)])
        v.execute(insert(s.ereignis).values(
            zeit=lokal(ERSTES), baustelle_id=bid, bereich_id=C1, art="prognose_kontext", quelle="automatik",
            wert={"grund": "ausserhalb", "zustand": "aus", "soll_c": 22.0, "regelungsart": "thermo",
                  "konfiguration_id": kid_ereignis or kid}))
        v.execute(update(s.schema_version).where(s.schema_version.c.version == 10).values(angewendet=lokal(date(2026, 11, 1))))
        return True
    assert await hass.data[DATA_DB].async_ausfuehren(schreiben) is not None
    return kid


async def test_rekonstruierter_kontext(hass: HomeAssistant, baustelle_november, hass_ws_client) -> None:
    kid = await _altdaten(hass, baustelle_november)
    bid = baustelle_november.entry_id
    rahmen = PrognoseRahmen(bid, WIEN, (C1,))
    minuten, pruefungen = await hass.data[DATA_DB].async_ausfuehren(
        lambda v: minuten_bauen(prognose_rohdaten(v, rahmen, lokal(ALT_GUT), lokal(HEUTE)), rahmen))
    p = pruefungen[C1]
    assert p.freigegeben and p.quote == 1.0 and p.verglichen == 2 * 1440   # 18./19.: Rekonstruktion = Ereignis
    je = {m.zeit.von: m for m in minuten[C1]}
    vorher = je[lokal(ALT_GUT, 8 * 60)].kontext
    assert vorher.kontext_nachweis == "rekonstruiert" and vorher.kontext_belegt
    assert (vorher.regelungsart, vorher.konfiguration_id) == ("thermo", kid)          # dieselbe ID wie das Ereignis
    plan = je[lokal(ALT_GUT, 13 * 60)].kontext                                       # Punkt-Pfad: Zeitplan 12–18 Uhr
    assert plan.regelungsart == "plan" and plan.kontext_belegt and not plan.wechsel_im_intervall
    assert je[lokal(ALT_GUT, 12 * 60)].kontext.wechsel_im_intervall                  # Minute der Einstellungsänderung
    assert je[lokal(ALT_GUT, 7 * 60)].kontext.wechsel_im_intervall                   # Grundwechsel gegenüber der Vorminute
    assert not je[lokal(ALT_GUT, 7 * 60 + 1)].kontext.wechsel_im_intervall
    falsch = je[lokal(ALT_FALSCH, 8 * 60)].kontext                                    # tag_geraet passt nicht → unbelegt
    assert not falsch.kontext_belegt and falsch.kontext_nachweis == "keiner"
    echt = je[lokal(GUT, 6 * 60)].kontext
    assert echt.kontext_nachweis == "direkt" and echt.kontext_belegt                 # ab dem ersten Ereignis: direkt
    # Diagnose: Abnahmeprüfung je Container, rekonstruierter Tag mit Hinweis
    ws = await hass_ws_client(hass)
    await ws.send_json({"id": 1, "type": "baustelle/prognose_v2", "entry_id": bid, "tage": 4})
    c1 = next(c for c in (await ws.receive_json())["result"]["container"] if c["bereich"] == C1)
    assert c1["rekonstruktion"]["an"] and c1["rekonstruktion"]["quote"] == 1.0 and c1["rekonstruktion"]["abweichungen"] == []
    tage = {t["datum"]: t for t in c1["tage"]}
    assert "kontext_rekonstruiert" in tage["2026-11-16"]["gruende"] and tage["2026-11-16"]["quoten"]["betrieb"] == 1.0
    assert tage["2026-11-17"]["quoten"]["betrieb"] == 0.0


async def test_rekonstruktion_abgeschaltet_bei_abweichung(hass: HomeAssistant, baustelle_november, hass_ws_client) -> None:
    """Das echte Ereignis meldet eine andere Konfiguration: Trefferquote 0 % → Rekonstruktion für den Container aus."""
    await _altdaten(hass, baustelle_november, kid_ereignis="kandere0000")
    rahmen = PrognoseRahmen(baustelle_november.entry_id, WIEN, (C1,))
    minuten, pruefungen = await hass.data[DATA_DB].async_ausfuehren(
        lambda v: minuten_bauen(prognose_rohdaten(v, rahmen, lokal(ALT_GUT), lokal(HEUTE)), rahmen))
    p = pruefungen[C1]
    assert not p.freigegeben and p.quote == 0.0 and p.gruende == ("rekonstruktion_abweichend",)
    assert p.abweichungen[0][1] == "thermo/kandere0000"
    alt = [m for m in minuten[C1] if m.zeit.von < lokal(ERSTES)]
    assert alt and not any(m.kontext.kontext_belegt for m in alt)
    ws = await hass_ws_client(hass)
    await ws.send_json({"id": 1, "type": "baustelle/prognose_v2", "entry_id": baustelle_november.entry_id, "tage": 4})
    c1 = next(c for c in (await ws.receive_json())["result"]["container"] if c["bereich"] == C1)
    r = c1["rekonstruktion"]
    assert not r["an"] and r["quote"] == 0.0 and r["abweichungen_anzahl"] == 2 * 1440 and len(r["abweichungen"]) == 20


async def test_rohdaten_nur_aus_den_fenstern(hass: HomeAssistant, baustelle_november) -> None:
    """Ereignisse und Tagessummen nur für [von, bis) und die Abnahmeprüfung (+ je das letzte Ereignis davor)."""
    bid, db = baustelle_november.entry_id, hass.data[DATA_DB]
    tage = {"erstes": date(2026, 11, 1), "pruef": date(2026, 11, 5), "dazwischen": date(2026, 11, 10),
            "vor_von": date(2026, 11, 12), "im_zeitraum": date(2026, 11, 17)}

    def schreiben(v):
        for name, tag in tage.items():
            v.execute(insert(s.ereignis).values(zeit=lokal(tag, 12 * 60), baustelle_id=bid, bereich_id=C1, art="prognose_kontext",
                                                quelle="automatik", wert={"grund": name}))
            v.execute(insert(s.tag_geraet).values(geraet_id=HK1, datum=tag, baustelle_id=bid, bereich_id=C1))
        return True
    assert await db.async_ausfuehren(schreiben) is not None
    rahmen = PrognoseRahmen(bid, WIEN, (C1,))
    roh = await db.async_ausfuehren(lambda v: prognose_rohdaten(v, rahmen, lokal(date(2026, 11, 16)), lokal(HEUTE)))
    assert roh.erstes_ereignis[C1] == lokal(tage["erstes"], 12 * 60)
    gruende = [w["grund"] for _, w in roh.ereignisse[C1]]
    assert gruende == ["erstes", "pruef", "vor_von", "im_zeitraum"]   # „dazwischen“ (10.11.) nicht gelesen
    gelesen = {d for (_, d) in roh.tag_geraet}
    assert gelesen == {tage["erstes"], tage["pruef"], tage["im_zeitraum"]}   # Prüfung 01.–08.11. und 16.–20.11.


# ---------------------------------------------------------------------- P3 (BSM-033.08): Evidenzbericht
EVIDENZ_TAGE = [date(2026, 11, 13) + timedelta(days=i) for i in range(6)]


async def _takt_tage(hass: HomeAssistant, entry) -> str:
    """Sechs Arbeitstage 07–17 Uhr, Soll/innen 22, außen 12, Öl-Heizkörper 2 kW im Takt 5 von 10 min (1 kWh/h)."""
    st, bid = entry.runtime_data, entry.entry_id
    _, kid = Heizung.von(st).prognose_kontext(C1)
    bm, gm, wm, ev = [], [], [], []
    for tag in EVIDENZ_TAGE:
        b, g, w = _minuten(bid, tag)
        for i, z in enumerate(g):
            arbeit = 7 * 60 <= i < 17 * 60
            an = 60 if arbeit and i % 10 < 5 else 0
            z.update(sekunden_ein=60 if arbeit else 0, sekunden_strom=an, leistung_w=2000.0 * an / 60,
                     leistung_w_max=2000.0 if an else 0.0, energie_wh=2000.0 * an / 3600, heizanforderung_s=an)
        bm, gm, wm = bm + b, gm + g, wm + w
        for minute, grund in ((0, "ausserhalb"), (7 * 60, "arbeitszeit"), (17 * 60, "ausserhalb")):
            ev.append({"zeit": lokal(tag, minute), "baustelle_id": bid, "bereich_id": C1, "art": "prognose_kontext",
                       "quelle": "automatik", "wert": {"grund": grund, "zustand": "aus", "soll_c": 22.0,
                                                       "regelungsart": "thermo", "konfiguration_id": kid}})
    heizung = dict(st.e["heizung"])

    def schreiben(v):
        v.execute(insert(s.bereich_minute), bm)
        v.execute(insert(s.geraet_minute), gm)
        v.execute(insert(s.wetter_minute), wm)
        v.execute(insert(s.ereignis), ev)
        v.execute(insert(s.einstellung), [
            {"baustelle_id": bid, "schluessel": "heizung", "wert": heizung, "ab": lokal(date(2026, 11, 1)), "quelle": "seite"},
            {"baustelle_id": bid, "schluessel": "geraete", "wert": {HK1: {"nenn_kw": 2.0}}, "ab": lokal(date(2026, 11, 1)),
             "quelle": "seite"}])
        v.execute(update(s.geraet).where(s.geraet.c.baustelle_id == bid).values(angelegt=lokal(date(2026, 11, 1))))
        v.execute(update(s.schema_version).where(s.schema_version.c.version == 10).values(angewendet=lokal(date(2026, 11, 1))))
        return True
    assert await hass.data[DATA_DB].async_ausfuehren(schreiben) is not None
    return kid


async def test_evidenzbericht_aus_der_datenbank(hass: HomeAssistant, baustelle_november, hass_ws_client) -> None:
    """Öl: 2 h Vorlauf, dann 3-h-Fenster 09–12 und 12–15 (Rest 15–17 verworfen) → 12 direkte Fenster an 6 Tagen,
    H 0,10 kW/K mit C-Evidenz; Abschnitte (14 Tage) zählen nichts doppelt."""
    kid = await _takt_tage(hass, baustelle_november)
    ws = await hass_ws_client(hass)
    await ws.send_json({"id": 1, "type": "baustelle/prognose_v2", "entry_id": baustelle_november.entry_id, "tage": 1,
                        "h_tage": 30})
    antwort = await ws.receive_json()
    assert antwort["success"], antwort
    erg = antwort["result"]
    assert erg["evidenz"] == {"von": "2026-10-21", "bis": "2026-11-19"}
    je = {c["bereich"]: c for c in erg["container"]}
    ev = je[C1]["evidenz"]
    assert ev["konfiguration_aktuell"] == kid
    assert ev["fenster"]["direkt"] == 12 and ev["fenster"]["ersatz"] == 0 and ev["fenster"]["stunden"] == 36.0
    (m,) = ev["modelle"]
    assert m["aktuell"] and m["konfiguration_id"] == kid
    h = m["h"]
    assert h["methode"] == "stationaer" and h["h_kw_k"] == pytest.approx(0.1) and h["stufe"] == "C"
    assert (h["unten"], h["oben"]) == (pytest.approx(0.07), pytest.approx(0.13))   # MAD 0 → Mindestband ±30 %
    assert h["evidenz"]["fenster"] == 12 and h["evidenz"]["tage"] == 6 and "direkt" in h["evidenz"]["gruende"]
    assert m["h_ersatz"]["methode"] == "keine" and m["ohne"]["methode"] == "keine"
    assert m["h_tage"]["methode"] == "tagesregression" and m["h_tage"]["stufe"] == "B"
    assert m["h_tage"]["h_kw_k"] == pytest.approx(0.1)
    assert ev["starts"]["anzahl"] == 6 and ev["starts"]["bekannt"] == 6
    assert ev["plateaus"] == {"direkt": 0, "ersatz": 0, "verworfen": 0, "stunden": 0.0, "gruende": {}}
    assert je[C2]["evidenz"]["fenster"]["direkt"] == 0
    # ohne h_tage: kein Evidenzbericht (der billige Aufruf bleibt billig)
    await ws.send_json({"id": 2, "type": "baustelle/prognose_v2", "entry_id": baustelle_november.entry_id})   # Vorgabe 0
    erg = (await ws.receive_json())["result"]
    assert "evidenz" not in erg and all("evidenz" not in c for c in erg["container"])


async def test_abschnittsgrenzen_wie_ein_durchgang(hass: HomeAssistant, baustelle_november, hass_ws_client,
                                                  monkeypatch) -> None:
    """Eine reguläre Episode über 84 h (länger als der Vorlauf je Abschnitt) und ein 48-h-Baseline-Lauf über Mitternacht:
    mit Abschnitten von einem Tag dasselbe Ergebnis wie in einem Durchgang (Anker weitergegeben, nichts doppelt)."""
    from custom_components.baustelle.funktionen.heizung import prognose_v2 as modul   # noqa: PLC0415
    from custom_components.baustelle.logik.baseline import Lauf   # noqa: PLC0415

    st, bid = baustelle_november.runtime_data, baustelle_november.entry_id
    _, kid = Heizung.von(st).prognose_kontext(C1)
    start, aus_ab, lauf_ab = lokal(date(2026, 11, 14)), lokal(date(2026, 11, 17), 12 * 60), lokal(date(2026, 11, 18))
    bm, gm, wm = [], [], []
    t = start
    while t < lokal(HEUTE):
        regulaer, baseline = t < aus_ab, t >= lauf_ab
        i = int((t - start).total_seconds() // 60)
        an = (60 if i % 10 < 5 else 0) if regulaer else (60 if i % 10 < 9 else 0) if baseline else 0
        grund = "arbeitszeit" if regulaer else "baseline" if baseline else "ausserhalb"
        bm.append({"bereich_id": C1, "zeit": t, "baustelle_id": bid, "dauer_s": 60, "temperatur": 30.0 if baseline else 22.0,
                   "soll": 22.0, "tuer_offen_s": 0, "zustand": "heizt" if an else "aus", "grund": grund, "quelle": "ha",
                   "temp_alter_s": 30, "staffel_begrenzt_s": 0})
        gm.append({"geraet_id": HK1, "zeit": t, "baustelle_id": bid, "dauer_s": 60, "sekunden_ein": 60 if regulaer or baseline else 0,
                   "sekunden_strom": an, "leistung_w": 2000.0 * an / 60, "leistung_w_max": 2000.0 if an else 0.0,
                   "energie_wh": 2000.0 * an / 3600, "erreichbar": True, "quelle": "ha", "heizanforderung_s": an,
                   "staffel_gesperrt_s": 0})
        wm.append({"baustelle_id": bid, "zeit": t, "dauer_s": 60, "aussen_temp": 12.0, "quelle": "ha"})
        t += timedelta(minutes=1)
    ev = [{"zeit": zeit, "baustelle_id": bid, "bereich_id": C1, "art": "prognose_kontext", "quelle": "automatik",
           "wert": {"grund": grund, "zustand": "aus", "soll_c": 22.0, "regelungsart": "thermo", "konfiguration_id": kid}}
          for zeit, grund in ((start, "arbeitszeit"), (aus_ab, "ausserhalb"), (lauf_ab, "baseline"))]
    heizung = dict(st.e["heizung"])

    def schreiben(v):
        v.execute(insert(s.bereich_minute), bm)
        v.execute(insert(s.geraet_minute), gm)
        v.execute(insert(s.wetter_minute), wm)
        v.execute(insert(s.ereignis), ev)
        v.execute(insert(s.einstellung), [
            {"baustelle_id": bid, "schluessel": "heizung", "wert": heizung, "ab": lokal(date(2026, 11, 1)), "quelle": "seite"},
            {"baustelle_id": bid, "schluessel": "geraete", "wert": {HK1: {"nenn_kw": 2.0}}, "ab": lokal(date(2026, 11, 1)),
             "quelle": "seite"}])
        v.execute(update(s.geraet).where(s.geraet.c.baustelle_id == bid).values(angelegt=lokal(date(2026, 11, 1))))
        v.execute(update(s.schema_version).where(s.schema_version.c.version == 10).values(angewendet=lokal(date(2026, 11, 1))))
        return True
    assert await hass.data[DATA_DB].async_ausfuehren(schreiben) is not None
    st.lz["baseline"] = {"laeufe": [Lauf("L1", C1, date(2026, 11, 18), HEUTE, status="fertig",
                                         thermostat_unveraendert="angenommen").als_dict()]}
    ws = await hass_ws_client(hass)

    async def bericht(abschnitt_tage: int, nr: int) -> dict:
        monkeypatch.setattr(modul, "ABSCHNITT_TAGE", abschnitt_tage)
        await ws.send_json({"id": nr, "type": "baustelle/prognose_v2", "entry_id": bid, "tage": 1, "h_tage": 10})
        antwort = await ws.receive_json()
        assert antwort["success"], antwort
        return next(c for c in antwort["result"]["container"] if c["bereich"] == C1)["evidenz"]

    ganz, teile = await bericht(30, 1), await bericht(1, 2)
    assert ganz["fenster"]["direkt"] == 27 and ganz["fenster"]["verworfen"] == 0   # (84 h − 2 h Vorlauf) / 3 h
    assert ganz["plateaus"]["direkt"] == 14                                         # (48 h − 4 h Warm-up) / 3 h
    (m,) = ganz["modelle"]
    assert m["h"]["h_kw_k"] == pytest.approx(0.1) and m["ohne"]["h"]["h_kw_k"] == pytest.approx(0.1)
    assert m["ohne"]["t_max_c"] == pytest.approx(30.0) and m["ohne"]["naechte_b"] >= 2 and m["ohne"]["stufe"] == "B"
    assert teile == ganz
