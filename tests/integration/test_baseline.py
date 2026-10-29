"""Baseline-Läufe „ohne Automatik“ (BSM-033.04): planen und ankündigen um 12:00, absagen per Knopf, laufen lassen (alle
Heizkörper an, Soll-Grund BASELINE), abbrechen bei Taste, fertig nach dem letzten Tag."""

from __future__ import annotations

from datetime import date, timedelta

from homeassistant.core import HomeAssistant

from custom_components.baustelle.funktionen.heizung import Heizung
from custom_components.baustelle.funktionen.heizung import baseline as hb
from custom_components.baustelle.logik.baseline import Lauf
from custom_components.baustelle.logik.regelung import SollGrund

from .conftest import C1, C2, baustelle_anlegen

FREITAG = "2026-11-20 12:05:00+01:00"
SAMSTAG, MONTAG = date(2026, 11, 21), date(2026, 11, 23)


async def _baustelle(hass, freezer, zeit=FREITAG):
    entry = await baustelle_anlegen(hass, freezer, zeit=zeit)
    assert await hass.config_entries.async_setup(entry.entry_id)
    await hass.async_block_till_done()
    st = entry.runtime_data
    st.e["automatik"] = True
    st.e["heizung"]["baseline"] = True
    return st, Heizung.von(st)


async def test_startet_aus(hass: HomeAssistant, freezer, shellys, nachrichten) -> None:
    entry = await baustelle_anlegen(hass, freezer, zeit=FREITAG)
    assert await hass.config_entries.async_setup(entry.entry_id)
    await hass.async_block_till_done()
    st = entry.runtime_data
    st.e["automatik"] = True
    assert st.e["heizung"]["baseline"] is False
    st.auswerten()
    await hass.async_block_till_done()
    assert hb.laeufe(Heizung.von(st)) == []


async def test_planen_ankuendigen_absagen(hass: HomeAssistant, freezer, shellys, nachrichten) -> None:
    st, hz = await _baustelle(hass, freezer)
    st.auswerten()
    await hass.async_block_till_done()
    L = hb.laeufe(hz)
    assert len(L) == 1 and L[0].status == "geplant" and (L[0].von, L[0].bis) == (SAMSTAG, MONTAG)
    assert L[0].bereich in (C1, C2) and L[0].schaetzung_eur > 0
    ank = [c for c in nachrichten if "Baseline" in str(c.data.get("title"))]
    assert ank and any(a["action"].endswith(f"|baseline_absagen|{L[0].id}") for a in ank[-1].data["data"]["actions"])
    st.nachrichten.knopf("baseline_absagen", L[0].id)
    assert hb.laeufe(hz)[0].status == "abgesagt"
    st.auswerten()   # am selben Tag wird nicht noch einmal geplant
    await hass.async_block_till_done()
    assert len(hb.laeufe(hz)) == 1


async def test_lauf_schaltet_alle_heizkoerper_und_endet(hass: HomeAssistant, freezer, shellys, nachrichten) -> None:
    st, hz = await _baustelle(hass, freezer, zeit="2026-11-21 10:00:00+01:00")
    shellys.anmelden()
    hb._speichern(hz, [Lauf("x1", C1, SAMSTAG, MONTAG, "geplant", 10.0)])
    st.auswerten()
    await hass.async_block_till_done()
    l = hb.laeufe(hz)[0]
    assert l.status == "laeuft"
    # BSM-033.06: beim Start eingefroren – Thermostate angenommen unverändert, Stellung unbekannt, Konfiguration
    assert (l.thermostat_unveraendert, l.thermostatstellung, l.annahme_am is not None) == ("angenommen", "unbekannt", True)
    assert l.konfiguration_id == hz.prognose_kontext(C1)[1]
    assert st.lz["baseline"]["laeufe"][0]["thermostat_unveraendert"] == "angenommen"
    st.auswerten()
    await hass.async_block_till_done()
    assert hz._lern_grund[C1] == SollGrund.BASELINE
    assert "switch.hk1" in shellys.ein()
    # Taste am Plug: Lauf bricht ab, der Samstag zählt nicht
    st.lz.setdefault("taste_bis", {})[C1] = "2026-11-21T11:00:00+01:00"
    st.auswerten()
    await hass.async_block_till_done()
    l = hb.laeufe(hz)[0]
    assert l.status == "abgebrochen" and l.grund == "Taste am Plug" and l.ende == SAMSTAG


async def test_start_ohne_konfiguration_bei_fehler(hass: HomeAssistant, freezer, shellys, nachrichten, monkeypatch) -> None:
    """BSM-033.06: kann die Konfiguration nicht bestimmt werden, startet der Lauf trotzdem (konfiguration_id None)."""
    st, hz = await _baustelle(hass, freezer, zeit="2026-11-21 10:00:00+01:00")
    shellys.anmelden()

    def kaputt(_bid):
        raise RuntimeError("Test")
    monkeypatch.setattr(hz, "prognose_kontext", kaputt)
    hb._speichern(hz, [Lauf("x3", C1, SAMSTAG, MONTAG, "geplant", 10.0)])
    st.auswerten()
    await hass.async_block_till_done()
    l = hb.laeufe(hz)[0]
    assert l.status == "laeuft" and l.konfiguration_id is None and l.thermostat_unveraendert == "angenommen"


async def test_fertig_nach_dem_letzten_tag(hass: HomeAssistant, freezer, shellys, nachrichten) -> None:
    st, hz = await _baustelle(hass, freezer, zeit="2026-11-23 00:01:00+01:00")
    hb._speichern(hz, [Lauf("x2", C2, SAMSTAG, MONTAG, "laeuft", 10.0)])
    st.auswerten()
    await hass.async_block_till_done()
    assert hb.laeufe(hz)[0].status == "fertig"
    assert hz._lern_grund.get(C2) != SollGrund.BASELINE
    assert SAMSTAG + timedelta(days=1) in hb.b.zaehlende_tage(hb.laeufe(hz))[C2]


# ---------------------------------------------------------------- Anzeige (J4b, Mockup baseline.html Variante B)

async def test_anzeige_vorschau_rahmen_stand(hass: HomeAssistant, freezer, shellys, nachrichten) -> None:
    """laufzeit.baseline: vor 12:00 nichts geplant → Vorschau nach `planen`; Rahmen, Stand je Container, Hinweis; nach
    dem Planen der angekündigte Lauf mit Uhrzeit der Nachricht, keine Vorschau mehr."""
    from custom_components.baustelle.daten import struktur
    st, hz = await _baustelle(hass, freezer, zeit="2026-11-20 10:00:00+01:00")
    A = struktur(hass, st.entry)["laufzeit"]["baseline"]
    assert A["an"] is True and A["laeufe"] == [] and A["hinweis"].startswith("Prognose ohne Automatik")
    assert A["rahmen"] == {"monat": "2026-11", "budget_eur": 60.0, "gemessen_eur": 0.0, "geplant_eur": 0.0, "rest_eur": 60.0}
    v = A["vorschau"]
    assert v["von"] == SAMSTAG.isoformat() and v["letzter"] == "2026-11-22" and v["bereich"] in (C1, C2)
    assert v["plant_am"].startswith("2026-11-20T12:00") and v["plant_am_t"] == "Fr 20.11. 12:00" and v["schaetzung_eur"] > 0
    assert {c["bereich"] for c in A["container"]} == {C1, C2}
    assert all(c["tage"] == 0 and c["noetig"] == 10 and c["stand"] is None and not c["fertig"] and c["kein_lauf"] is None for c in A["container"])
    assert A["stand_t"] == "0 von 2 Containern gemessen · nächster Lauf voraussichtlich Sa 21.11."
    freezer.move_to(FREITAG)
    st.auswerten()
    await hass.async_block_till_done()
    A = struktur(hass, st.entry)["laufzeit"]["baseline"]
    l = A["laeufe"][0]
    assert A["vorschau"] is None and l["status"] == "geplant" and l["angekuendigt_t"] == "Fr 20.11. 12:05" and A["offen"] == l
    assert l["name"] == st.bereiche[l["bereich"]].name and l["tage"] == 2 and l["letzter"] == "2026-11-22" and l["typ"]
    assert A["rahmen"]["geplant_eur"] == round(l["schaetzung_eur"], 2) and "nächster Lauf Sa 21.11." in A["stand_t"]
    st.e["heizung"]["baseline"] = False
    aus = struktur(hass, st.entry)["laufzeit"]["baseline"]
    assert aus["an"] is False and aus["vorschau"] is None and aus["stand_t"] == "Baseline messen ist aus."


async def test_absagen_von_der_seite(hass: HomeAssistant, freezer, shellys, nachrichten, hass_ws_client) -> None:
    """WS baustelle/aktion `baseline_absagen` {lauf_id}: wie der Nachrichtenknopf – geplant → abgesagt, läuft →
    abgebrochen (mit Uhrzeit); unbekannte ID → not_found."""
    ws = await hass_ws_client(hass)   # vor dem Vorstellen der Uhr (sonst ist das Token abgelaufen)
    st, hz = await _baustelle(hass, freezer)
    st.auswerten()
    await hass.async_block_till_done()
    lid = hb.laeufe(hz)[0].id
    await ws.send_json({"id": 1, "type": "baustelle/aktion", "entry_id": st.entry.entry_id, "aktion": "baseline_absagen", "lauf_id": lid})
    assert (await ws.receive_json())["success"]
    l = hb.laeufe(hz)[0]
    assert l.status == "abgesagt" and l.grund.startswith("über die Seite") and l.abbruch_um is not None
    assert any("Baseline abgesagt" in p[3] for p in st.e["protokoll"][:5])
    from custom_components.baustelle.daten import struktur
    v = struktur(hass, st.entry)["laufzeit"]["baseline"]["vorschau"]   # heute schon geplant: frühestens übermorgen
    assert (v["von"], v["letzter"], v["von_t"], v["plant_am_t"]) == ("2026-11-22", "2026-11-22", "So 22.11.", "Sa 21.11. 12:00")
    await ws.send_json({"id": 2, "type": "baustelle/aktion", "entry_id": st.entry.entry_id, "aktion": "baseline_absagen", "lauf_id": lid})
    r = await ws.receive_json()
    assert not r["success"] and r["error"]["code"] == "not_found"
    hb._speichern(hz, [Lauf("x9", C1, SAMSTAG, MONTAG, "laeuft", 10.0)])
    await ws.send_json({"id": 3, "type": "baustelle/aktion", "entry_id": st.entry.entry_id, "aktion": "baseline_absagen", "lauf_id": "x9"})
    assert (await ws.receive_json())["success"]
    assert hb.laeufe(hz)[0].status == "abgebrochen"


async def test_kopf_im_lauf_mit_bisher(hass: HomeAssistant, freezer, shellys, nachrichten) -> None:
    """laufzeit.container.<id>.baseline während des Laufs: bis So 24:00, bisher kWh/€ seit dem Start (Zähler des
    Containers); der andere Container und ohne Lauf: None. Abbruch mit Uhrzeit."""
    from custom_components.baustelle.daten import struktur
    st, hz = await _baustelle(hass, freezer, zeit="2026-11-21 10:00:00+01:00")
    shellys.anmelden()
    st.zaehler[f"energie:{C1}"], st.zaehler[f"kosten:{C1}"] = 100.0, 20.0
    hb._speichern(hz, [Lauf("x1", C1, SAMSTAG, MONTAG, "geplant", 10.0)])
    st.auswerten()
    await hass.async_block_till_done()
    st.zaehler[f"energie:{C1}"], st.zaehler[f"kosten:{C1}"] = 113.1, 22.62
    lz = struktur(hass, st.entry)["laufzeit"]
    k = lz["container"][C1]["baseline"]
    assert k == {"lauf_id": "x1", "von": "2026-11-21", "letzter": "2026-11-22", "von_t": "Sa 21.11.", "letzter_t": "So 22.11.",
                 "bis": "2026-11-23T00:00:00+01:00", "bis_t": "So 24:00", "bisher_kwh": 13.1, "bisher_eur": 2.62}
    assert lz["container"][C2]["baseline"] is None
    l = lz["baseline"]["laeufe"][0]
    assert l["status"] == "laeuft" and l["bisher_kwh"] == 13.1 and l["bisher_eur"] == 2.62 and "Lauf läuft Sa 21.11." in lz["baseline"]["stand_t"]
    st.lz.setdefault("taste_bis", {})[C1] = "2026-11-21T11:00:00+01:00"
    st.auswerten()
    await hass.async_block_till_done()
    lz = struktur(hass, st.entry)["laufzeit"]
    l = lz["baseline"]["laeufe"][0]
    assert l["status"] == "abgebrochen" and l["abbruch_t"] == "Sa 21.11. 10:00" and l["zaehlt"] == 0
    assert lz["container"][C1]["baseline"] is None and "x1" in st.lz["baseline"]["zaehler_start"]


async def test_stand_ohne_heizkoerper(hass: HomeAssistant, freezer, shellys, nachrichten) -> None:
    """Container ohne Heizkörper: „ohne Heizkörper – kein Lauf“; Modus aus: „Modus aus“; sie zählen nicht mit."""
    from custom_components.baustelle.daten import struktur
    st, hz = await _baustelle(hass, freezer, zeit="2026-11-20 10:00:00+01:00")
    for g in st.geraete_in(C2):
        st.geraet_aktiv_setzen(g, False)   # inaktive Heizkörper zählen nicht: C2 hat keinen
    A = struktur(hass, st.entry)["laufzeit"]["baseline"]
    c2 = next(c for c in A["container"] if c["bereich"] == C2)
    assert c2["typ"] == "" and c2["kein_lauf"] == "ohne Heizkörper"
    assert A["stand_t"].startswith("0 von 1 Container gemessen") and A["vorschau"]["bereich"] == C1


async def test_kosten_und_kwh_erst_nach_dem_letzten_tag(hass: HomeAssistant, freezer, shellys, nachrichten) -> None:
    """J4b: Kosten und kWh eines beendeten Laufs erst, wenn sein letzter Tag (beim Abbruch der Abbruchtag) vorbei ist –
    sonst bliebe ein halber Tag für immer stehen."""
    from custom_components.baustelle.funktionen.heizung.hochrechnung import _kosten_nachtragen
    from custom_components.baustelle.logik.hochrechnung import TagRoh
    st, hz = await _baustelle(hass, freezer, zeit="2026-11-22 10:00:00+01:00")
    hb._speichern(hz, [Lauf("a1", C1, SAMSTAG, MONTAG, "abgebrochen", 9.0, grund="Taste am Plug", ende=SAMSTAG + timedelta(days=1))])
    roh = {C1: [TagRoh(SAMSTAG, 20.0, 3.0, 86400), TagRoh(SAMSTAG + timedelta(days=1), 4.0, 3.0, 36000)]}
    _kosten_nachtragen(hz, roh, SAMSTAG + timedelta(days=1))   # Abbruchtag läuft noch
    assert hb.laeufe(hz)[0].kosten_eur is None and hb.laeufe(hz)[0].kwh is None
    roh[C1][1] = TagRoh(SAMSTAG + timedelta(days=1), 9.0, 3.0, 86400)
    _kosten_nachtragen(hz, roh, MONTAG)
    l = hb.laeufe(hz)[0]
    assert l.kwh == 29.0 and l.kosten_eur == round(29.0 * st.preis_am(SAMSTAG), 2)
