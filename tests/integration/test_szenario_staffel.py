"""Szenarien Themenfeld 4: mehrere Container, Staffelung und Geräte – Ende zu Ende gegen Home Assistant.

Je Szenario eine eigene Baustelle (zwei Container mit Fühler, Pumpenschacht), Fake-Shellys wie in `conftest.py`.
Geprüft werden Shelly-Zustände, `laufzeit.geraete.<id>.warte`, die Anschlüsse in `struktur()` und das Protokoll.

Rechengrößen: 16 A · 1 Phase · 67 % = 2,466 kW (ein Heizkörper à 2,0 kW passt, zwei nicht);
20 A · 1 Phase = 3,082 kW; 32 A · 1 Phase = 4,931 kW (zwei passen).
"""

from __future__ import annotations

from datetime import timedelta
from typing import Any

import pytest
import voluptuous as vol

from homeassistant.core import Context, HomeAssistant
from homeassistant.helpers.entity_component import DATA_INSTANCES
from homeassistant.util import dt as dt_util
from pytest_homeassistant_custom_component.common import MockConfigEntry, async_fire_time_changed

from custom_components.baustelle.const import DOMAIN
from custom_components.baustelle.daten import struktur
from custom_components.baustelle.panel import pruefe_setzen

from .conftest import C1, C2, HK1, HK2, P1, SCHACHT, STANDARD_ZUSTAND, eid, sub

HK3 = "sub_hk3"
ANLAGE = "2026-09-29 09:50:00+02:00"
ZEHN = "2026-09-29 10:00:00+02:00"   # Dienstag, Arbeitszeit 07:00–16:30
KLEIN = (16, 1, 0.0)                  # 2,466 kW nutzbar: genau ein Heizkörper


# ---------------------------------------------------------------------- Hilfen
def _geraet(sid: str, bereich: str, nr: int, rolle: str = "heizkoerper", leistung: bool = True, typ: str = "konvektor"):
    name = {"heizkoerper": f"Heizkörper {nr}", "pumpe": f"Pumpe {nr}"}[rolle]
    kurz = "p" if rolle == "pumpe" else "hk"
    daten = {"bereich": bereich, "schalter": f"switch.{kurz}{nr}", "name": name, "rolle": rolle, "typ": typ}
    if leistung:
        daten["leistung"] = f"sensor.{kurz}{nr}_power"
    return sub(sid, "geraet", name, daten)


async def _start(
    hass: HomeAssistant, freezer, shellys, *,
    a1: tuple[float, int, float] = KLEIN,
    pumpe_eigen: bool = True,
    staffel: dict[str, Any] | None = None,
    bereiche: dict[str, dict[str, Any]] | None = None,
    hk2_bereich: str = C2,
    hk3_bereich: str | None = None,
    ohne_leistung: tuple[str, ...] = (),
    zustand: dict[str, str] | None = None,
    automatik: bool = True,
):
    """Baustelle mit C1 (Fühler temp_c1 19,0 °C) und C2 (Fühler temp_c2 19,5 °C), Soll 20 °C, Pumpe 760 W.

    Anschluss a1 nach `a1`; die Pumpe hängt ohne `pumpe_eigen=False` an einem eigenen großen Anschluss a2.
    """
    await hass.config.async_set_time_zone("Europe/Vienna")
    freezer.move_to(ANLAGE)
    for entity_id, wert in {**STANDARD_ZUSTAND, "sensor.temp_c2": "19.5", "switch.hk3": "off",
                            "sensor.hk3_power": "0", **(zustand or {})}.items():
        hass.states.async_set(entity_id, wert)
    geraete = [
        _geraet(HK1, C1, 1, leistung=HK1 not in ohne_leistung, typ="oelradiator"),
        _geraet(HK2, hk2_bereich, 2, leistung=HK2 not in ohne_leistung),
        _geraet(P1, SCHACHT, 1, rolle="pumpe", leistung=P1 not in ohne_leistung),
    ]
    if hk3_bereich:
        geraete.append(_geraet(HK3, hk3_bereich, 3, leistung=HK3 not in ohne_leistung))
    entry = MockConfigEntry(
        domain=DOMAIN, title="B1", data={"name": "B1"},
        options={"heizung": True, "pumpen": True, "status": "aktiv", "beginn": "2026-09-01",
                 "heizperiode_von": "10", "heizperiode_bis": "4", "empfaenger": ["mobile_app_test"],
                 "temp_sensor": "sensor.aussen", "regen_sensor": "sensor.regen"},
        subentries_data=[
            sub(C1, "bereich", "Container 1", {"name": "Container 1", "art": "container", "fuehler": "sensor.temp_c1"}),
            sub(C2, "bereich", "Container 2", {"name": "Container 2", "art": "container", "fuehler": "sensor.temp_c2"}),
            sub(SCHACHT, "bereich", "Schacht", {"name": "Schacht", "art": "pumpenschacht"}),
            *geraete,
        ],
    )
    entry.add_to_hass(hass)
    assert await hass.config_entries.async_setup(entry.entry_id)
    await hass.async_block_till_done()
    shellys.anmelden()
    shellys.leistung = {
        f"switch.hk{n}": f"sensor.hk{n}_power" for n, gid in ((1, HK1), (2, HK2), (3, HK3)) if gid not in ohne_leistung
    }
    st = entry.runtime_data
    st.e["anschluesse"] = [{"id": "a1", "name": "Anschluss 1", "ampere": a1[0], "phasen": a1[1], "reserve_kw": a1[2]}]
    if pumpe_eigen:
        st.e["anschluesse"].append({"id": "a2", "name": "Pumpen", "ampere": 32, "phasen": 3, "reserve_kw": 0.0})
        st.einstellungen.bereich(SCHACHT)["anschluss"] = "a2"
    st.e["staffel"].update(staffel or {})
    for bid, werte in (bereiche or {}).items():
        st.einstellungen.bereich(bid).update(werte)
    freezer.move_to(ZEHN)
    if automatik:
        st.einstellung_setzen(("automatik",), True)
    else:
        st.auswerten()
    await hass.async_block_till_done()
    return entry, st


async def _minuten(hass: HomeAssistant, freezer, st, minuten: float = 1) -> None:
    freezer.tick(timedelta(minutes=minuten))
    st.auswerten()
    await hass.async_block_till_done()


async def _ueberlast_abwarten(hass: HomeAssistant, freezer) -> None:
    """Abwurf erst nach `staffel.UEBERLAST_S` (kurze Spitzen ignorieren): die Integration wertet dann selbst neu aus."""
    freezer.tick(timedelta(seconds=31))
    async_fire_time_changed(hass)
    await hass.async_block_till_done()


def _an(hass: HomeAssistant, entity_id: str) -> bool:
    return hass.states.get(entity_id).state == "on"


def _lz(hass: HomeAssistant, entry) -> dict[str, Any]:
    return struktur(hass, entry)["laufzeit"]


def _warte(hass: HomeAssistant, entry, gid: str) -> dict[str, Any] | None:
    return _lz(hass, entry)["geraete"][gid]["warte"]


def _anschluss(hass: HomeAssistant, entry, aid: str = "a1") -> dict[str, Any]:
    return next(a for a in _lz(hass, entry)["staffel"]["anschluesse"] if a["id"] == aid)


def _texte(st, art: str | None = None) -> list[str]:
    return [p[3] for p in st.e["protokoll"] if art is None or p[1] == art]


# ---------------------------------------------------------------------- Staffelung an/aus, kleiner Anschluss
async def test_staffelung_aus_alle_heizen_auch_ueber_der_grenze(hass: HomeAssistant, freezer, shellys) -> None:
    entry, st = await _start(hass, freezer, shellys, staffel={"an": False})
    assert _an(hass, "switch.hk1") and _an(hass, "switch.hk2")   # ohne Staffelung kein Anlauf-Nacheinander
    await _minuten(hass, freezer, st)
    lz = _lz(hass, entry)
    assert lz["staffel"]["an"] is False and lz["staffel"]["warten"] == 0 and lz["staffel"]["laufen"] == 2
    a = _anschluss(hass, entry)
    assert a["heiz_kw"] == pytest.approx(4.0) and a["frei_kw"] == pytest.approx(2.4656 - 4.0, abs=0.001)
    assert lz["geraete"][HK1]["warte"] is None and lz["geraete"][HK2]["warte"] is None
    assert not [t for t in _texte(st) if "wartet" in t]


async def test_kleiner_anschluss_zwei_container_einer_heizt(hass: HomeAssistant, freezer, shellys) -> None:
    entry, st = await _start(hass, freezer, shellys)
    assert _an(hass, "switch.hk1") and not _an(hass, "switch.hk2")   # C1 1,0 °C unter Soll, C2 nur 0,5
    lz = _lz(hass, entry)
    assert lz["geraete"][HK2]["warte"] == {"grund": "rundlauf", "dran_in_min": 15}
    assert lz["geraete"][HK1]["warte"] is None
    assert lz["staffel"]["laufen"] == 1 and lz["staffel"]["warten"] == 1
    a = _anschluss(hass, entry)
    assert a["voll_kw"] == pytest.approx(3.68) and a["grenze_kw"] == pytest.approx(2.4656, abs=0.001)
    assert a["heiz_kw"] == pytest.approx(2.0) and a["pumpe_kw"] == 0 and a["frei_kw"] == pytest.approx(0.4656, abs=0.001)
    assert _anschluss(hass, entry, "a2")["pumpe_kw"] == pytest.approx(0.76)
    assert "Staffelung: Heizkörper 2 wartet (Anschluss voll)" in _texte(st, "schalten")
    assert "Staffelung: Heizkörper 2 wartet (Rundlauf 15 min)" in _texte(st, "schalten")
    # gleicher Wartegrund über viele Minuten: nur ein Protokolleintrag
    for _ in range(5):
        await _minuten(hass, freezer, st)
    assert _texte(st, "schalten").count("Staffelung: Heizkörper 2 wartet (Rundlauf 15 min)") == 1
    assert _warte(hass, entry, HK2) == {"grund": "rundlauf", "dran_in_min": 10}
    assert "switch.p1" not in [e for e, _ in shellys.aufrufe]


# ---------------------------------------------------------------------- Rundlauf, Mindestlaufzeit, Mindestpause
async def test_rundlauf_tauscht_nach_dem_takt(hass: HomeAssistant, freezer, shellys) -> None:
    entry, st = await _start(hass, freezer, shellys)
    assert _an(hass, "switch.hk1")
    await _minuten(hass, freezer, st, 14)
    assert _an(hass, "switch.hk1") and not _an(hass, "switch.hk2")   # 14 min: noch nicht
    await _minuten(hass, freezer, st, 1)
    assert not _an(hass, "switch.hk1") and _an(hass, "switch.hk2")   # 15 min: Tausch
    assert _warte(hass, entry, HK1) == {"grund": "mindestpause", "dran_in_min": 5}
    await _minuten(hass, freezer, st, 6)
    assert _warte(hass, entry, HK1) == {"grund": "rundlauf", "dran_in_min": 9}
    assert _lz(hass, entry)["staffel"]["laufen"] == 1


async def test_rundlauf_tauscht_auch_zurueck(hass: HomeAssistant, freezer, shellys) -> None:
    entry, st = await _start(hass, freezer, shellys)
    await _minuten(hass, freezer, st, 15)
    assert _an(hass, "switch.hk2") and not _an(hass, "switch.hk1")   # hin: Heizkörper 1 aus, dann 2 ein – geht
    await _minuten(hass, freezer, st, 15)
    # zurück: Heizkörper 1 ein (steht vorn), dann 2 aus
    assert _an(hass, "switch.hk1") and not _an(hass, "switch.hk2")
    assert "Staffelung: Heizkörper 1 wartet (Anschluss voll)" not in _texte(st, "schalten")


async def test_laengerer_takt(hass: HomeAssistant, freezer, shellys) -> None:
    entry, st = await _start(hass, freezer, shellys, staffel={"takt_min": 30})
    assert _warte(hass, entry, HK2) == {"grund": "rundlauf", "dran_in_min": 30}
    await _minuten(hass, freezer, st, 16)
    assert _an(hass, "switch.hk1") and _warte(hass, entry, HK2)["dran_in_min"] == 14
    assert "Staffelung: Heizkörper 2 wartet (Rundlauf 30 min)" in _texte(st, "schalten")
    await _minuten(hass, freezer, st, 14)
    assert _an(hass, "switch.hk2") and not _an(hass, "switch.hk1")


async def test_mindestlaufzeit_laenger_als_takt(hass: HomeAssistant, freezer, shellys) -> None:
    entry, st = await _start(hass, freezer, shellys, staffel={"min_lauf_min": 20, "takt_min": 15})
    assert _warte(hass, entry, HK2) == {"grund": "rundlauf", "dran_in_min": 20}
    await _minuten(hass, freezer, st, 16)
    assert _an(hass, "switch.hk1") and not _an(hass, "switch.hk2")
    await _minuten(hass, freezer, st, 4)
    assert _an(hass, "switch.hk2") and not _an(hass, "switch.hk1")


async def test_mindestpause_haelt_den_rueckwechsel_auf(hass: HomeAssistant, freezer, shellys) -> None:
    entry, st = await _start(hass, freezer, shellys, staffel={"min_lauf_min": 5, "takt_min": 5, "min_pause_min": 10})
    await _minuten(hass, freezer, st, 5)
    assert _an(hass, "switch.hk2") and not _an(hass, "switch.hk1")
    assert _warte(hass, entry, HK1) == {"grund": "mindestpause", "dran_in_min": 10}
    await _minuten(hass, freezer, st, 5)   # Heizkörper 2 läuft 5 min (= Takt), Heizkörper 1 pausiert erst 5 von 10 min
    assert _an(hass, "switch.hk2") and not _an(hass, "switch.hk1")
    assert _warte(hass, entry, HK1) == {"grund": "mindestpause", "dran_in_min": 5}
    assert "Staffelung: Heizkörper 1 wartet (Mindestpause)" in _texte(st, "schalten")
    # der Rückwechsel nach der Pause scheitert am Reihenfolge-Befund (test_rundlauf_tauscht_auch_zurueck)


async def test_regelung_aus_wirkt_vor_der_mindestlaufzeit_und_gibt_platz_frei(hass: HomeAssistant, freezer, shellys) -> None:
    entry, st = await _start(hass, freezer, shellys)
    assert _an(hass, "switch.hk1")
    await _minuten(hass, freezer, st, 2)
    hass.states.async_set("sensor.temp_c1", "20.5")   # Soll erreicht, erst 2 min gelaufen
    await hass.async_block_till_done()
    assert not _an(hass, "switch.hk1")
    assert _warte(hass, entry, HK1) is None            # will nicht heizen → wartet nicht
    await _minuten(hass, freezer, st, 1)               # eine Minute stabil frei → Heizkörper 2
    assert _an(hass, "switch.hk2")


async def test_rundlauf_drei_heizkoerper_zwei_plaetze_tauscht_genau_einen(hass: HomeAssistant, freezer, shellys) -> None:
    # 32 A · 1 Phase: zwei Plätze; C1 (HK1), C2 (HK2, HK3)
    entry, st = await _start(hass, freezer, shellys, a1=(32, 1, 0.0), hk3_bereich=C2)
    await _minuten(hass, freezer, st, 1)
    assert _an(hass, "switch.hk1") and _an(hass, "switch.hk2") and not _an(hass, "switch.hk3")
    await _minuten(hass, freezer, st, 15)            # 10:16 – beide laufen ≥ 15 min
    assert sum(_an(hass, f"switch.hk{n}") for n in (1, 2, 3)) == 2
    # AN-0013: HK3 ist das Zweitgerät von C2 – es verdrängt nicht den einzigen Heizkörper von C1, jeder Container behält einen
    assert _an(hass, "switch.hk1") and not _an(hass, "switch.hk3")


# ---------------------------------------------------------------------- max_gleichzeitig
async def test_max_gleichzeitig_eins_am_grossen_anschluss(hass: HomeAssistant, freezer, shellys) -> None:
    entry, st = await _start(hass, freezer, shellys, a1=(32, 3, 3.0), staffel={"max_gleichzeitig": 1})
    assert _an(hass, "switch.hk1") and not _an(hass, "switch.hk2")
    assert "Staffelung: Heizkörper 2 wartet (höchstens 1 gleichzeitig)" in _texte(st, "schalten")
    assert _warte(hass, entry, HK2) == {"grund": "rundlauf", "dran_in_min": 15}
    assert _lz(hass, entry)["staffel"]["max"] == 1
    await _minuten(hass, freezer, st, 15)
    assert _an(hass, "switch.hk2") and not _an(hass, "switch.hk1")


async def test_max_gleichzeitig_gesenkt_erst_nach_mindestlaufzeit(hass: HomeAssistant, freezer, shellys) -> None:
    entry, st = await _start(hass, freezer, shellys, a1=(32, 3, 3.0))
    await _minuten(hass, freezer, st, 1)                # Anlauf: der zweite eine Minute später
    assert _an(hass, "switch.hk1") and _an(hass, "switch.hk2")
    await _minuten(hass, freezer, st, 4)
    st.einstellung_setzen(("staffel", "max_gleichzeitig"), 1)
    await hass.async_block_till_done()
    assert _an(hass, "switch.hk1") and _an(hass, "switch.hk2")   # beide unter 10 min: noch keiner aus
    await _minuten(hass, freezer, st, 6)                # 10:11 – Heizkörper 2 läuft 10 min, zuletzt eingeschaltet
    assert _an(hass, "switch.hk1") and not _an(hass, "switch.hk2")
    assert "Staffelung: Heizkörper 2 wartet (höchstens 1 gleichzeitig)" in _texte(st, "schalten")


async def test_max_gleichzeitig_gilt_ueber_alle_anschluesse(hass: HomeAssistant, freezer, shellys) -> None:
    entry, st = await _start(hass, freezer, shellys, bereiche={C2: {"anschluss": "a3"}}, automatik=False)
    st.e["anschluesse"].append({"id": "a3", "name": "Anschluss 3", "ampere": 16, "phasen": 1, "reserve_kw": 0.0})
    st.einstellung_setzen(("automatik",), True)
    await hass.async_block_till_done()
    await _minuten(hass, freezer, st, 1)
    assert _an(hass, "switch.hk1") and _an(hass, "switch.hk2")   # je Anschluss einer
    assert _anschluss(hass, entry, "a1")["heiz_kw"] == pytest.approx(2.0)
    assert _anschluss(hass, entry, "a3")["heiz_kw"] == pytest.approx(2.0)
    st.einstellung_setzen(("staffel", "max_gleichzeitig"), 1)
    await _minuten(hass, freezer, st, 10)
    assert _an(hass, "switch.hk1") != _an(hass, "switch.hk2")


# ---------------------------------------------------------------------- Vorrang
async def test_defizit_entscheidet_bei_gleicher_stufe(hass: HomeAssistant, freezer, shellys) -> None:
    # C1 1,0 °C unter 20; C2 2,5 °C unter 22 → C2 zuerst
    entry, st = await _start(hass, freezer, shellys, bereiche={C2: {"soll": 22.0}})
    assert _an(hass, "switch.hk2") and not _an(hass, "switch.hk1")
    assert _warte(hass, entry, HK1)["grund"] == "rundlauf"


async def test_prio_hoch_vor_groesserem_defizit_und_niedrig_wartet_ohne_rundlauf(hass: HomeAssistant, freezer, shellys) -> None:
    entry, st = await _start(hass, freezer, shellys, bereiche={C1: {"prio": "niedrig"}, C2: {"prio": "hoch"}})
    assert _an(hass, "switch.hk2") and not _an(hass, "switch.hk1")   # hoch trotz kleinerem Defizit
    await _minuten(hass, freezer, st, 30)
    # niedrig tauscht nicht gegen hoch: wartet, solange hoch heizen will (Bauplan/Logik: kein Rundlauf nach unten)
    assert _an(hass, "switch.hk2") and not _an(hass, "switch.hk1")
    assert _warte(hass, entry, HK1) == {"grund": "anschluss_voll", "dran_in_min": None}
    # normal gegen niedrig genauso
    st.einstellung_setzen(("bereiche", C2, "prio"), "normal")
    await _minuten(hass, freezer, st, 1)
    assert _an(hass, "switch.hk2") and _warte(hass, entry, HK1)["grund"] == "anschluss_voll"
    # Prio umgedreht: der wartende hohe darf den laufenden (läuft schon > Takt) sofort tauschen
    st.einstellung_setzen(("bereiche", C1, "prio"), "hoch")
    await hass.async_block_till_done()
    assert ("switch.hk1", "on") in shellys.aufrufe and ("switch.hk2", "off") in shellys.aufrufe
    # (dass Heizkörper 1 danach wieder abgeworfen wird, ist der Reihenfolge-Befund, test_rundlauf_tauscht_auch_zurueck)


async def test_frost_verdraengt_normal_nach_mindestlaufzeit(hass: HomeAssistant, freezer, shellys) -> None:
    entry, st = await _start(hass, freezer, shellys, zustand={"sensor.temp_c1": "19.9"})
    assert _an(hass, "switch.hk2") and not _an(hass, "switch.hk1")   # C1 am Soll
    await _minuten(hass, freezer, st, 5)
    hass.states.async_set("sensor.temp_c1", "4.0")
    await hass.async_block_till_done()
    assert st.daten.grund[C1] == "frost"
    assert _warte(hass, entry, HK1) == {"grund": "rundlauf", "dran_in_min": 5}   # nach der Mindestlaufzeit, nicht dem Takt
    await _minuten(hass, freezer, st, 5)
    assert _an(hass, "switch.hk1") and not _an(hass, "switch.hk2")
    # der normale bekommt den Frost-Heizkörper nicht mehr weg
    await _minuten(hass, freezer, st, 30)
    assert _an(hass, "switch.hk1") and _warte(hass, entry, HK2)["grund"] == "anschluss_voll"


async def test_boost_vor_prio_hoch(hass: HomeAssistant, freezer, shellys) -> None:
    entry, st = await _start(hass, freezer, shellys, bereiche={C1: {"prio": "hoch"}}, automatik=False)
    st.lz["boost_bis"][C2] = "2026-09-29T11:00:00+02:00"
    st.einstellung_setzen(("automatik",), True)
    await hass.async_block_till_done()
    assert st.daten.grund[C2] == "boost"
    assert _an(hass, "switch.hk2") and not _an(hass, "switch.hk1")
    await _minuten(hass, freezer, st, 20)
    assert _an(hass, "switch.hk2") and _warte(hass, entry, HK1) == {"grund": "anschluss_voll", "dran_in_min": None}


async def test_boost_verdraengt_laufenden_nach_mindestlaufzeit(hass: HomeAssistant, freezer, shellys) -> None:
    entry, st = await _start(hass, freezer, shellys)
    assert _an(hass, "switch.hk1")
    await _minuten(hass, freezer, st, 3)
    st.lz["boost_bis"][C2] = "2026-09-29T11:00:00+02:00"
    await _minuten(hass, freezer, st, 1)
    assert _warte(hass, entry, HK2) == {"grund": "rundlauf", "dran_in_min": 6}
    await _minuten(hass, freezer, st, 6)
    assert _an(hass, "switch.hk2") and not _an(hass, "switch.hk1")


async def test_frost_vor_boost(hass: HomeAssistant, freezer, shellys) -> None:
    entry, st = await _start(hass, freezer, shellys, automatik=False)
    st.lz["boost_bis"][C2] = "2026-09-29T12:00:00+02:00"
    st.einstellung_setzen(("automatik",), True)
    await hass.async_block_till_done()
    assert _an(hass, "switch.hk2")
    await _minuten(hass, freezer, st, 2)
    hass.states.async_set("sensor.temp_c1", "3.0")
    await _minuten(hass, freezer, st, 1)
    assert _warte(hass, entry, HK1) == {"grund": "rundlauf", "dran_in_min": 7}
    await _minuten(hass, freezer, st, 7)
    assert _an(hass, "switch.hk1") and not _an(hass, "switch.hk2")
    await _minuten(hass, freezer, st, 20)   # Boost tauscht Frost nie heraus
    assert _an(hass, "switch.hk1") and _warte(hass, entry, HK2)["grund"] == "anschluss_voll"


# ---------------------------------------------------------------------- Pumpe
async def test_pumpe_zaehlt_mit_und_verdraengt_heizung(hass: HomeAssistant, freezer, shellys) -> None:
    entry, st = await _start(hass, freezer, shellys, pumpe_eigen=False)
    # 2,466 − 0,76 = 1,706 kW: kein Heizkörper passt
    assert not _an(hass, "switch.hk1") and not _an(hass, "switch.hk2")
    assert _warte(hass, entry, HK1) == {"grund": "anschluss_voll", "dran_in_min": None}
    assert _warte(hass, entry, HK2) == {"grund": "anschluss_voll", "dran_in_min": None}
    a = _anschluss(hass, entry)
    assert a["pumpe_kw"] == pytest.approx(0.76) and a["heiz_kw"] == 0 and a["frei_kw"] == pytest.approx(1.7056, abs=0.001)
    # Pumpe hört auf: erst nach einer Minute stabil frei kommt ein Heizkörper dazu
    hass.states.async_set("sensor.p1_power", "0")
    await hass.async_block_till_done()
    assert not _an(hass, "switch.hk1")
    await _minuten(hass, freezer, st, 1.1)
    assert _an(hass, "switch.hk1")
    # Pumpe läuft wieder an: Überlast → Heizkörper sofort aus, auch vor der Mindestlaufzeit
    await _minuten(hass, freezer, st, 2)
    hass.states.async_set("sensor.p1_power", "760")
    await hass.async_block_till_done()
    assert _an(hass, "switch.hk1")                                     # kurze Spitze: noch nicht (30 s)
    await _ueberlast_abwarten(hass, freezer)
    assert not _an(hass, "switch.hk1")
    assert "Staffelung: Heizkörper 1 wartet (Anschluss voll)" in _texte(st, "schalten")
    assert _warte(hass, entry, HK1)["grund"] == "mindestpause"         # gleich danach: Pause nach dem Abwurf
    assert "switch.p1" not in [e for e, _ in shellys.aufrufe]          # Pumpe nie geschaltet
    assert _an(hass, "switch.p1")


async def test_pumpe_mit_anlaufspitze_wirft_heizung_ab(hass: HomeAssistant, freezer, shellys) -> None:
    entry, st = await _start(hass, freezer, shellys, a1=(20, 1, 0.0), pumpe_eigen=False)
    assert _an(hass, "switch.hk1")                                     # 2,0 + 0,76 ≤ 3,082
    await _minuten(hass, freezer, st, 1)
    hass.states.async_set("sensor.p1_power", "1500")                   # 2,0 + 1,5 > 3,082
    await hass.async_block_till_done()
    await _ueberlast_abwarten(hass, freezer)
    assert not _an(hass, "switch.hk1") and _warte(hass, entry, HK1)["grund"] == "mindestpause"
    assert "Staffelung: Heizkörper 1 wartet (Anschluss voll)" in _texte(st, "schalten")
    await _minuten(hass, freezer, st, 6)                               # nach der Pause: Anschluss weiter voll
    assert not _an(hass, "switch.hk1") and _warte(hass, entry, HK1)["grund"] == "anschluss_voll"
    assert "switch.p1" not in [e for e, _ in shellys.aufrufe]


async def test_pumpe_ohne_leistungssensor_zaehlt_standard_kw(hass: HomeAssistant, freezer, shellys) -> None:
    """Szenarien, Herbert 01.10.2026: eine laufende Pumpe ohne Leistungssensor zählt mit `standard_kw` 0,8 kW –
    am kleinen Anschluss (2,466 kW) verdrängt sie den Heizkörper (2,0 + 0,8 > 2,466). Je Gerät änderbar über
    `geraete.<id>.nenn_kw`: mit 0,3 kW passt der Heizkörper wieder dazu."""
    entry, st = await _start(hass, freezer, shellys, pumpe_eigen=False, ohne_leistung=(P1,))
    assert _an(hass, "switch.p1")
    assert not _an(hass, "switch.hk1") and _warte(hass, entry, HK1)["grund"] == "anschluss_voll"
    assert _anschluss(hass, entry)["pumpe_kw"] == pytest.approx(0.8)
    pumpe = next(g for g in struktur(hass, entry)["geraete"] if g["id"] == P1)
    assert pumpe["nenn_kw"] == pytest.approx(0.8) and pumpe["nenn_kw_eigen"] is None
    # je Gerät einstellen (Prüfung wie über baustelle/setzen; ungültig → abgelehnt)
    with pytest.raises(vol.Invalid):
        pruefe_setzen(st, ["geraete", P1, "nenn_kw"], 20)
    st.einstellung_setzen(("geraete", P1, "nenn_kw"), pruefe_setzen(st, ["geraete", P1, "nenn_kw"], 0.3))
    await _minuten(hass, freezer, st, 2)
    assert _anschluss(hass, entry)["pumpe_kw"] == pytest.approx(0.3)
    assert _an(hass, "switch.hk1") and _an(hass, "switch.p1")
    assert next(g for g in struktur(hass, entry)["geraete"] if g["id"] == P1)["nenn_kw_eigen"] == pytest.approx(0.3)
    assert "switch.p1" not in [e for e, _ in shellys.aufrufe]          # Pumpe nie geschaltet


# ---------------------------------------------------------------------- Zusatz-Heizkörper (AN-0006) mit Staffelung
async def test_zusatz_nicht_gebraucht_wartet_nicht(hass: HomeAssistant, freezer, shellys) -> None:
    entry, st = await _start(hass, freezer, shellys, hk2_bereich=C1, bereiche={C1: {"stufen": True}})
    await _minuten(hass, freezer, st, 2)
    assert _an(hass, "switch.hk1") and not _an(hass, "switch.hk2")
    lz = _lz(hass, entry)
    assert lz["geraete"][HK2]["warte"] is None and lz["staffel"]["warten"] == 0
    assert lz["container"][C1]["stufen"]["zusatz_an"] is False
    assert not [t for t in _texte(st) if "Heizkörper 2 wartet" in t]


async def test_zusatz_gebraucht_am_vollen_anschluss_wartet(hass: HomeAssistant, freezer, shellys) -> None:
    entry, st = await _start(hass, freezer, shellys, hk2_bereich=C1, bereiche={C1: {"stufen": True}})
    hass.states.async_set("sensor.temp_c1", "18.0")                   # weit unter dem Soll
    await _minuten(hass, freezer, st, 1)
    assert _lz(hass, entry)["container"][C1]["stufen"]["zusatz_an"] is True
    assert _an(hass, "switch.hk1") and not _an(hass, "switch.hk2")
    assert _warte(hass, entry, HK2)["grund"] == "anschluss_voll"   # kein Rundlauf gegen den eigenen Hauptheizkörper
    assert "Zusatz-Heizkörper dazu – weit unter dem Soll" in _texte(st, "schalten")


async def test_zusatz_bekommt_platz_am_grossen_anschluss(hass: HomeAssistant, freezer, shellys) -> None:
    entry, st = await _start(hass, freezer, shellys, a1=(32, 3, 3.0), hk2_bereich=C1, hk3_bereich=C2,
                             bereiche={C1: {"stufen": True}})
    await _minuten(hass, freezer, st, 1)
    assert _an(hass, "switch.hk1") and _an(hass, "switch.hk3") and not _an(hass, "switch.hk2")
    hass.states.async_set("sensor.temp_c1", "18.0")
    await _minuten(hass, freezer, st, 1)
    assert _an(hass, "switch.hk2")                                     # Platz da → sofort dazu


async def test_zusatz_verdraengt_nicht_den_eigenen_hauptheizkoerper(hass: HomeAssistant, freezer, shellys) -> None:
    # 32 A · 1 Phase = 4,93 kW: zwei Heizkörper; C1 (Haupt HK1 + Zusatz HK2), C2 (HK3)
    entry, st = await _start(hass, freezer, shellys, a1=(32, 1, 0.0), hk2_bereich=C1, hk3_bereich=C2,
                             bereiche={C1: {"stufen": True}})
    await _minuten(hass, freezer, st, 1)
    assert _an(hass, "switch.hk1") and _an(hass, "switch.hk3")
    hass.states.async_set("sensor.temp_c1", "18.0")
    await _minuten(hass, freezer, st, 1)
    assert _warte(hass, entry, HK2)["grund"] == "anschluss_voll"   # AN-0013: kein Tausch gegen den einzigen von C2
    await _minuten(hass, freezer, st, 15)
    # AN-0013 (Herbert 01.10.2026): einer je Container zuerst – der Zusatz von C1 verdrängt nicht den einzigen von C2
    assert _an(hass, "switch.hk1") and _an(hass, "switch.hk3") and not _an(hass, "switch.hk2")


# ---------------------------------------------------------------------- Geräte: inaktiv, Hand, offline, ohne Messung
async def test_inaktives_geraet_zaehlt_nicht(hass: HomeAssistant, freezer, shellys) -> None:
    entry, st = await _start(hass, freezer, shellys, automatik=False)
    st.e["geraete"][HK1] = {"aktiv": False}
    st.einstellung_setzen(("automatik",), True)
    await hass.async_block_till_done()
    assert _an(hass, "switch.hk2") and not _an(hass, "switch.hk1")
    lz = _lz(hass, entry)
    assert lz["geraete"][HK1]["warte"] is None and lz["geraete"][HK1]["aktiv"] is False
    assert lz["staffel"]["warten"] == 0
    assert "switch.hk1" not in [e for e, _ in shellys.aufrufe]


async def test_inaktives_geraet_von_hand_an_zaehlt_mit(hass: HomeAssistant, freezer, shellys) -> None:
    """FRAGE: Doku `geraet_aktiv` sagt „zählen nicht in der Staffelung“; läuft es trotzdem, zählt seine Messung –
    tatsächlich wird der automatische Heizkörper dafür abgeworfen."""
    entry, st = await _start(hass, freezer, shellys, automatik=False)
    st.e["geraete"][HK1] = {"aktiv": False}
    st.einstellung_setzen(("automatik",), True)
    await hass.async_block_till_done()
    assert _an(hass, "switch.hk2")
    await _minuten(hass, freezer, st, 2)
    hass.states.async_set("sensor.hk1_power", "2000")
    hass.states.async_set("switch.hk1", "on")                          # am Gerät eingeschaltet
    await hass.async_block_till_done()
    await _ueberlast_abwarten(hass, freezer)
    assert not _an(hass, "switch.hk2") and "Staffelung: Heizkörper 2 wartet (Anschluss voll)" in _texte(st, "schalten")
    await _minuten(hass, freezer, st, 6)
    assert not _an(hass, "switch.hk2") and _warte(hass, entry, HK2)["grund"] == "anschluss_voll"
    assert _an(hass, "switch.hk1")                                     # Automatik lässt das inaktive in Ruhe
    assert ("switch.hk1", "off") not in shellys.aufrufe


async def test_hand_ein_zaehlt_mit_und_wirft_automatik_ab(hass: HomeAssistant, freezer, shellys) -> None:
    entry, st = await _start(hass, freezer, shellys, bereiche={C2: {"soll": 22.0}})
    assert _an(hass, "switch.hk2") and not _an(hass, "switch.hk1")
    await _minuten(hass, freezer, st, 2)
    hass.states.async_set("sensor.hk1_power", "2000")
    hass.states.async_set("switch.hk1", "on", context=Context(user_id="nutzer"))
    await hass.async_block_till_done()
    assert HK1 in st.lz["hand"]
    await _ueberlast_abwarten(hass, freezer)
    assert _an(hass, "switch.hk1") and not _an(hass, "switch.hk2")     # Überlast: der automatische geht
    lz = _lz(hass, entry)
    assert lz["geraete"][HK1]["warte"] is None and lz["geraete"][HK1]["hand_seit"]
    assert lz["geraete"][HK2]["warte"]["grund"] == "mindestpause"
    assert "Staffelung: Heizkörper 2 wartet (Anschluss voll)" in _texte(st, "schalten")
    # Hand aus: Heizkörper 1 zählt nicht mehr, Heizkörper 2 kommt nach einer stabilen Minute wieder
    hass.states.async_set("sensor.hk1_power", "0")
    hass.states.async_set("switch.hk1", "off", context=Context(user_id="nutzer"))
    await hass.async_block_till_done()
    await _minuten(hass, freezer, st, 5.1)                             # Mindestpause von Heizkörper 2
    assert _an(hass, "switch.hk2") and not _an(hass, "switch.hk1")
    assert _warte(hass, entry, HK1) is None                            # auf Hand aus: wartet nicht


async def test_shelly_offline_wird_nicht_geschaltet_und_zaehlt_nicht(hass: HomeAssistant, freezer, shellys) -> None:
    entry, st = await _start(hass, freezer, shellys, zustand={"switch.hk1": "unavailable"})
    assert _an(hass, "switch.hk2")                                     # Heizkörper 1 offline → Heizkörper 2 sofort
    lz = _lz(hass, entry)
    assert lz["geraete"][HK1]["erreichbar"] is False and lz["geraete"][HK1]["warte"] is None
    assert lz["container"][C1]["zustand"] == "offline"
    assert "switch.hk1" not in [e for e, _ in shellys.aufrufe]
    # wieder da: nimmt am Rundlauf teil
    hass.states.async_set("switch.hk1", "off")
    await _minuten(hass, freezer, st, 1)
    assert _warte(hass, entry, HK1)["grund"] == "mindestpause"        # „wieder da“ zählt als Beginn der Pause
    await _minuten(hass, freezer, st, 5)
    assert _warte(hass, entry, HK1) == {"grund": "rundlauf", "dran_in_min": 9}


async def test_shelly_offline_waehrend_er_heizt_zaehlt_nennleistung(hass: HomeAssistant, freezer, shellys) -> None:
    """Szenarien, Herbert 01.10.2026: ein Heizkörper, der offline geht, während er lief, zählt mit seiner
    Nennleistung weiter, bis er wieder erreichbar ist – am kleinen Anschluss wartet Heizkörper 2 weiter."""
    entry, st = await _start(hass, freezer, shellys)
    assert _an(hass, "switch.hk1")
    await _minuten(hass, freezer, st, 2)
    hass.states.async_set("switch.hk1", "unavailable")
    vorher = len(shellys.aufrufe)
    await _minuten(hass, freezer, st, 1.1)
    assert not _an(hass, "switch.hk2") and _warte(hass, entry, HK2) is not None
    assert _anschluss(hass, entry)["heiz_kw"] == pytest.approx(2.0)   # nur der offline gegangene Heizkörper 1
    assert "switch.hk1" not in [e for e, _ in shellys.aufrufe[vorher:]]   # offline: nicht geschaltet


async def test_heizkoerper_ohne_leistungssensor_zaehlt_nennleistung(hass: HomeAssistant, freezer, shellys) -> None:
    entry, st = await _start(hass, freezer, shellys, ohne_leistung=(HK1, HK2), a1=(20, 1, 0.0))
    s = struktur(hass, entry)
    assert {g["id"]: g["nenn_kw"] for g in s["geraete"]}[HK1] == 2.0
    assert _an(hass, "switch.hk1") and not _an(hass, "switch.hk2")      # 3,08 kW: nur einer à 2,0 kW
    lz = s["laufzeit"]
    assert lz["geraete"][HK1]["kw"] == 2.0 and lz["geraete"][HK2]["warte"]["grund"] == "rundlauf"
    assert _anschluss(hass, entry)["heiz_kw"] == pytest.approx(2.0)


# ---------------------------------------------------------------------- Automatik
async def test_automatik_aus_nichts_wird_geschaltet(hass: HomeAssistant, freezer, shellys) -> None:
    entry, st = await _start(hass, freezer, shellys, automatik=False, zustand={"switch.hk2": "on", "sensor.hk2_power": "2000",
                                                                            "switch.hk1": "on", "sensor.hk1_power": "2000"})
    await _minuten(hass, freezer, st, 20)
    assert shellys.aufrufe == []                                       # auch die Überlast bleibt unberührt
    lz = _lz(hass, entry)
    assert lz["status"] == "automatik_aus" and lz["staffel"]["warten"] == 0
    assert lz["geraete"][HK1]["warte"] is None and lz["geraete"][HK2]["warte"] is None
    assert _anschluss(hass, entry)["frei_kw"] == pytest.approx(2.4656 - 4.0, abs=0.001)


async def test_automatik_schalter_beendet_hand(hass: HomeAssistant, freezer, shellys) -> None:
    entry, st = await _start(hass, freezer, shellys, a1=(32, 3, 3.0))
    await _minuten(hass, freezer, st, 1)
    assert _an(hass, "switch.hk1") and _an(hass, "switch.hk2")
    hass.states.async_set("switch.hk1", "off", context=Context(user_id="nutzer"))
    await hass.async_block_till_done()
    assert HK1 in st.lz["hand"]
    await _minuten(hass, freezer, st, 3)
    assert not _an(hass, "switch.hk1")
    schalter = hass.data[DATA_INSTANCES]["switch"].get_entity(eid(hass, "switch", f"{entry.entry_id}_automatik"))
    await schalter.async_turn_off()
    await hass.async_block_till_done()
    assert HK1 not in st.lz["hand"]
    assert any("Einstellung geändert – Automatik übernimmt" in t for t in _texte(st, "schalten"))
    await schalter.async_turn_on()
    await hass.async_block_till_done()
    assert _warte(hass, entry, HK1) == {"grund": "mindestpause", "dran_in_min": 2}   # von Hand aus seit 10:01
    await _minuten(hass, freezer, st, 2)
    assert _an(hass, "switch.hk1")


# ---------------------------------------------------------------------- Modi und Soll je Container
async def test_plan_und_thermo_mit_eigenem_soll(hass: HomeAssistant, freezer, shellys) -> None:
    entry, st = await _start(
        hass, freezer, shellys, a1=(32, 3, 3.0),
        bereiche={C1: {"modus": "thermo", "soll": 21.0}, C2: {"modus": "plan", "soll": 18.0}},
        zustand={"sensor.temp_c1": "21.5", "sensor.temp_c2": "23.0"},
    )
    await _minuten(hass, freezer, st, 1)
    assert not _an(hass, "switch.hk1")        # Thermostat: über Soll
    assert _an(hass, "switch.hk2")            # Zeitplan: heizt in der Heizzeit trotz 23 °C (Heizkörper regelt selbst)
    assert st.daten.grund[C1] == "arbeitszeit" and st.daten.grund[C2] == "arbeitszeit"
    hass.states.async_set("sensor.temp_c1", "20.5")   # 21 − 0,3 = 20,7 → ein
    await _minuten(hass, freezer, st, 1)
    assert _an(hass, "switch.hk1") and _an(hass, "switch.hk2")


async def test_plan_und_thermo_am_kleinen_anschluss(hass: HomeAssistant, freezer, shellys) -> None:
    """Zeitplan-Container über dem Soll (Defizit negativ) kommt nach dem Thermostat-Container dran; ist der warm,
    bekommt der Zeitplan-Container den Platz."""
    entry, st = await _start(
        hass, freezer, shellys,
        bereiche={C1: {"modus": "thermo", "soll": 21.0}, C2: {"modus": "plan", "soll": 18.0}},
        zustand={"sensor.temp_c1": "20.0", "sensor.temp_c2": "19.0"},
    )
    assert _an(hass, "switch.hk1") and not _an(hass, "switch.hk2")
    assert _warte(hass, entry, HK2)["grund"] == "rundlauf"
    await _minuten(hass, freezer, st, 3)
    hass.states.async_set("sensor.temp_c1", "21.4")
    await _minuten(hass, freezer, st, 1)
    assert not _an(hass, "switch.hk1")
    await _minuten(hass, freezer, st, 1)
    assert _an(hass, "switch.hk2")


async def test_nach_neustart_keine_mindestpause_ab_dem_start(hass: HomeAssistant, freezer, shellys) -> None:
    """WU-0015: nach einem Neustart zeigt last_changed den Start – ein Heizkörper, der vorher stundenlang aus war,
    musste trotzdem die Mindestpause abwarten (Herbert: „springt nicht sofort an“). Jetzt schaltet er gleich ein;
    nach eigenem Ausschalten gilt die Pause wie bisher."""
    entry, st = await _start(hass, freezer, shellys, a1=(32, 3, 0.0), staffel={"min_pause_min": 30}, automatik=False)
    freezer.move_to(ANLAGE)
    st._gestartet = dt_util.now()                        # HA startet: die Zustände der Shellys kommen jetzt erst an
    hass.states.async_set("switch.hk1", "on")
    hass.states.async_set("switch.hk1", "off", force_update=True)
    freezer.move_to(ZEHN)
    st.einstellung_setzen(("automatik",), True)
    await hass.async_block_till_done()
    assert _an(hass, "switch.hk1") and _warte(hass, entry, HK1) is None


async def test_staffel_nach_gemessenem_verbrauch(hass: HomeAssistant, freezer, shellys) -> None:
    """FE-0011 (Herbert 01.10.2026): gerechnet wird mit dem gemessenen Verbrauch. Zieht der laufende Heizkörper nichts
    (Thermostat am Gerät), darf der wartende dazu; springt der erste wieder an und der Anschluss wird zu voll, geht der
    zuletzt eingeschaltete sofort aus. Seit 0.8.167 nur, solange beide mit Nennleistung unter der vollen Absicherung
    bleiben (harte Grenze, Herbert 30.10.2026): 20 A · 230 V = 4,6 kW ≥ 2 × 2 kW, nutzbar 50 % = 2,3 kW."""
    entry, st = await _start(hass, freezer, shellys, a1=(20, 1, 0.0), staffel={"nutzbar_prozent": 50})
    assert _an(hass, "switch.hk1") and not _an(hass, "switch.hk2")
    hass.states.async_set("sensor.hk1_power", "0")          # Thermostat am Heizkörper 1 schaltet ab
    await _minuten(hass, freezer, st, 6)                     # Mindestlauf/Takt egal: Platz ist da
    assert _an(hass, "switch.hk1") and _an(hass, "switch.hk2")
    assert _anschluss(hass, entry)["heiz_kw"] == pytest.approx(2.0)   # gemessen: nur Heizkörper 2
    voll = _texte(st, "schalten").count("Staffelung: Heizkörper 2 wartet (Anschluss voll)")
    hass.states.async_set("sensor.hk1_power", "2000")       # Heizkörper 1 springt wieder an: 4 kW > 2,3 kW
    await _minuten(hass, freezer, st, 3)
    assert _an(hass, "switch.hk1") and not _an(hass, "switch.hk2")
    assert _texte(st, "schalten").count("Staffelung: Heizkörper 2 wartet (Anschluss voll)") == voll + 1


async def test_harte_grenze_satter_heizer_zaehlt_voll(hass: HomeAssistant, freezer, shellys) -> None:
    """Audit 0.8.165 (Herbert 30.10.2026: „harte Grenze immer“): 16 A einphasig = 3,68 kW Absicherung. Zieht Heizkörper 1
    nichts, wäre nach Messung Platz – springen aber beide an, wären es 4 kW: Heizkörper 2 wartet."""
    entry, st = await _start(hass, freezer, shellys)
    assert _an(hass, "switch.hk1") and not _an(hass, "switch.hk2")
    hass.states.async_set("sensor.hk1_power", "0")
    await _minuten(hass, freezer, st, 6)
    assert _an(hass, "switch.hk1") and not _an(hass, "switch.hk2")


async def test_einer_je_container_zuerst(hass: HomeAssistant, freezer, shellys) -> None:
    """AN-0013: zwei Plätze, C1 mit zwei Heizkörpern (HK1, HK2), C2 mit einem (HK3). Laufen HK1 und HK2, kommt HK3 als
    erster seines Containers beim nächsten Tausch dran – abgeben muss ein Zweitgerät von C1, nie beide von C1 an."""
    entry, st = await _start(hass, freezer, shellys, a1=(32, 1, 0.0), hk2_bereich=C1, hk3_bereich=C2, automatik=False)
    hass.states.async_set("sensor.temp_c2", "19.0")         # C2 1 °C unter dem Soll, C1 3 °C
    hass.states.async_set("sensor.temp_c1", "17.0")
    st.einstellung_setzen(("automatik",), True)
    await hass.async_block_till_done()
    for _ in range(3):
        await _minuten(hass, freezer, st, 1)
    an = {n for n in (1, 2, 3) if _an(hass, f"switch.hk{n}")}
    assert 3 in an and len(an) == 2                          # C2 bekommt trotz kleinstem Defizit seinen Platz
    await _minuten(hass, freezer, st, 20)
    an = {n for n in (1, 2, 3) if _an(hass, f"switch.hk{n}")}
    assert 3 in an and len(an & {1, 2}) == 1                 # C1 und C2 je einer, auch nach dem Rundlauf


async def test_bedarf_wer_auskuehlt_kommt_zuerst(hass: HomeAssistant, freezer, shellys) -> None:
    """Herbert 01.10.2026: gleich kalt, ein Platz – der Container, der gerade auskühlt (gemessen), kommt vor dem, dessen
    Temperatur steht. Rangliste und Aufschlüsselung des Bedarfs kommen bei der Seite an."""
    entry, st = await _start(hass, freezer, shellys, automatik=False,
                             zustand={"sensor.temp_c1": "19.5", "sensor.temp_c2": "19.5"})
    for m in range(16):                                      # C2 kühlt 2 °C/h aus, C1 bleibt bei 19,5
        hass.states.async_set("sensor.temp_c2", f"{19.5 - m * 2 / 60:.3f}")
        await _minuten(hass, freezer, st, 1)
    hass.states.async_set("sensor.temp_c1", "19.0")
    hass.states.async_set("sensor.temp_c2", "19.0")
    st.einstellung_setzen(("automatik",), True)
    await hass.async_block_till_done()
    lz = _lz(hass, entry)
    assert _an(hass, "switch.hk2") and not _an(hass, "switch.hk1")
    b2 = lz["container"][C2]["bedarf"]
    # läuft jetzt: die zuletzt gemessene Abkühlung gilt weiter (noch nichts gelernt)
    assert b2["abkuehl_h"] == pytest.approx(2.0, abs=0.3) and b2["summe"] > lz["container"][C1]["bedarf"]["summe"]
    assert lz["staffel"]["rang"][0] == HK2


async def test_bedarf_ziel_bis_arbeitsbeginn(hass: HomeAssistant, freezer, shellys) -> None:
    """Schafft ein Container sein Soll bis Arbeitsbeginn mit der gelernten Aufheizrate nicht mehr, kommt das Fehlende
    dazu – er kommt vor einem, der gleich kalt ist, aber schnell aufheizt."""
    from custom_components.baustelle.logik import lernen
    entry, st = await _start(hass, freezer, shellys, automatik=False,
                             zustand={"sensor.temp_c1": "17.0", "sensor.temp_c2": "17.0"})
    freezer.move_to("2026-09-29 06:20:00+02:00")            # Vorheizen ab 06:15, Arbeitsbeginn 07:00
    schluessel = lernen.auf_schluessel(lernen.band(st.daten.wetter.aussen), 1)
    st.lz.setdefault("lernen", {})[C1] = {**lernen.neuer_stand(), "aufheizen": {schluessel: [1.0, 5]}}   # schafft 1 °C/h
    st.lz["lernen"][C2] = {**lernen.neuer_stand(), "aufheizen": {schluessel: [6.0, 5]}}                # schafft es
    st.einstellung_setzen(("automatik",), True)
    await hass.async_block_till_done()
    lz = _lz(hass, entry)
    assert lz["container"][C1]["bedarf"]["ziel"] == pytest.approx(3.0 - 40 / 60, abs=0.05) and lz["container"][C2]["bedarf"]["ziel"] == 0
    assert lz["staffel"]["rang"][0] == HK1
