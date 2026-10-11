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
