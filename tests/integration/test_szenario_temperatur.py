"""Szenarien Themenfeld 3: Temperaturen außen/innen und Kalender (Ende-zu-Ende mit Fake-Shellys).

Frostschutz (Hysterese, frost_immer, ohne Fühler, freie Tage mit frei_modus), Heizgrenze (Basis, Grenzwerte, mit Frost
und Schnell aufheizen), Kälte-Frühstart, Regen gestern/heute und die Summe der Verlängerungen (AN-0003), Zusatz-
Heizkörper bei Kälte (AN-0006), Urlaub/Feiertag/Ausnahmen und fehlende Wetterwerte.

Baustelle B1 wie conftest: Container 1 mit Fühler (sensor.temp_c1) und Heizkörper 1, Container 2 ohne Fühler mit
Heizkörper 2 (oder mit `hk2_bereich=C1` beide in Container 1). Arbeitszeit Mo–Do 07:00–16:30 ab dem Tag der Anlage.
"""

from __future__ import annotations

from datetime import timedelta

import pytest

from homeassistant.core import HomeAssistant, ServiceCall, SupportsResponse
from homeassistant.util import dt as dt_util

from custom_components.baustelle.daten import struktur

from .conftest import C1, C2, HK1, HK2, baustelle_anlegen

DI_10 = "2026-09-29 10:00:00+02:00"      # Dienstag, Arbeitszeit
DI_21 = "2026-09-29 21:00:00+02:00"      # Dienstag abends, außerhalb
MI = "2026-09-30"


# ---------------------------------------------------------------------- Hilfen
def _kalender(hass: HomeAssistant, events: dict[str, list[dict]]) -> None:
    async def get_events(call: ServiceCall):
        ids = call.data["entity_id"]
        return {e: {"events": events.get(e, [])} for e in ([ids] if isinstance(ids, str) else ids)}

    hass.services.async_register("calendar", "get_events", get_events, supports_response=SupportsResponse.ONLY)
    for entity_id in events:
        hass.states.async_set(entity_id, "off")


async def _neu(hass, freezer, shellys, zeit: str = DI_10, hk2_bereich: str = C2, **optionen):
    """Baustelle anlegen und starten, Staffelung aus (Szenarien prüfen die Regeln, nicht die Staffel)."""
    entry = await baustelle_anlegen(hass, freezer, zeit, hk2_bereich=hk2_bereich, **optionen)
    assert await hass.config_entries.async_setup(entry.entry_id)
    await hass.async_block_till_done()
    shellys.anmelden()
    st = entry.runtime_data
    st.e["staffel"]["an"] = False
    return entry, st


# AN-0021: eine Stufe wie bis 0.8.160 (ab 2 mm 45 min länger, 15 min früher) – die Szenarien rechnen mit diesen Zahlen
EINE_STUFE = [{"ab_mm": 2.0, "laenger_min": 45, "frueher_min": 15}]


async def _zu(hass, freezer, zeit: str, st) -> None:
    freezer.move_to(zeit)
    st.auswerten()
    await hass.async_block_till_done()


async def _jetzt(hass, st) -> None:
    st.auswerten()
    await hass.async_block_till_done()


async def _automatik(hass, st) -> None:
    st.einstellung_setzen(("automatik",), True)
    await hass.async_block_till_done()


def _an(hass, entity_id: str) -> bool:
    return hass.states.get(entity_id).state == "on"


def _texte(st, art: str | None = None) -> list[str]:
    return [p[3] for p in st.e["protokoll"] if art is None or p[1] == art]


def _lz(hass, entry) -> dict:
    return struktur(hass, entry)["laufzeit"]


FEIERTAG_DI = {"calendar.feiertage": [{"start": "2026-09-29", "end": "2026-09-30", "summary": "Testfeiertag"}]}


# ====================================================================== Frostschutz
async def test_frost_hysterese_ein_unter_grenze_aus_ueber_frost_aus(hass: HomeAssistant, freezer, shellys, nachrichten) -> None:
    """Grenze 5 °C, frost_aus leer → aus erst ab 7 °C; zwischen 5 und 7 °C bleibt der Zustand (Hysterese)."""
    entry, st = await _neu(hass, freezer, shellys, DI_21)
    hass.states.async_set("sensor.temp_c1", "5.0")
    await _automatik(hass, st)
    assert not _an(hass, "switch.hk1")                       # genau 5,0: noch kein Frost (unter der Grenze)
    hass.states.async_set("sensor.temp_c1", "4.9")
    await _zu(hass, freezer, "2026-09-29 21:01:00+02:00", st)
    assert _an(hass, "switch.hk1") and st.daten.grund[C1] == "frost"
    assert st.daten.zustand[C1] == "frost" and st.daten.text[C1] == "Frostschutz"
    assert "Frostschutz – Heizkörper 1 ein" in _texte(st, "schalten")
    hass.states.async_set("sensor.temp_c1", "6.9")
    await _zu(hass, freezer, "2026-09-29 21:20:00+02:00", st)
    assert _an(hass, "switch.hk1") and st.daten.grund[C1] == "frost"   # Hysterese: hält bis 7 °C
    hass.states.async_set("sensor.temp_c1", "7.0")
    await _zu(hass, freezer, "2026-09-29 21:40:00+02:00", st)
    assert not _an(hass, "switch.hk1") and st.daten.grund[C1] == "ausserhalb"
    hass.states.async_set("sensor.temp_c1", "5.5")             # wieder zwischen den Schwellen: bleibt aus
    await _zu(hass, freezer, "2026-09-29 22:30:00+02:00", st)
    assert not _an(hass, "switch.hk1")
    assert not _an(hass, "switch.hk2")                         # Container 2 ohne Fühler: außen 4,5 °C, kein Frost


@pytest.mark.parametrize(("frost_aus", "noch_an", "aus_bei"), [(8.5, "8.4", "8.5"), (4.0, "6.9", "7.0")])
async def test_frost_aus_eigener_wert(hass: HomeAssistant, freezer, shellys, nachrichten, frost_aus, noch_an, aus_bei) -> None:
    """Eigener Wert `frost_aus` über der Grenze gilt; ein Wert unter der Grenze fällt auf Grenze + 2 °C zurück."""
    entry, st = await _neu(hass, freezer, shellys, DI_21)
    st.e["heizung"]["frost_aus"] = frost_aus
    hass.states.async_set("sensor.temp_c1", "3.0")
    await _automatik(hass, st)
    assert _an(hass, "switch.hk1")
    hass.states.async_set("sensor.temp_c1", noch_an)
    await _zu(hass, freezer, "2026-09-29 21:10:00+02:00", st)
    assert _an(hass, "switch.hk1")
    hass.states.async_set("sensor.temp_c1", aus_bei)
    await _zu(hass, freezer, "2026-09-29 21:20:00+02:00", st)
    assert not _an(hass, "switch.hk1")


async def test_frost_immer_bei_automatik_aus(hass: HomeAssistant, freezer, shellys, nachrichten) -> None:
    """Automatik aus: ohne `frost_immer` schaltet nichts; mit `frost_immer` nur der Frostschutz, danach einmal aus,
    und dann wird nichts mehr geschaltet (auch nicht ein von Hand eingeschalteter Heizkörper)."""
    entry, st = await _neu(hass, freezer, shellys, DI_21)
    hass.states.async_set("sensor.temp_c1", "3.0")
    await _jetzt(hass, st)
    assert shellys.aufrufe == []
    st.e["heizung"]["frost_immer"] = True
    await _zu(hass, freezer, "2026-09-29 21:01:00+02:00", st)
    assert shellys.aufrufe == [("switch.hk1", "on")]
    assert st.daten.status == "automatik_aus" and st.daten.grund[C1] == "frost"
    assert st.daten.zustand[C1] == "frost"
    hass.states.async_set("sensor.temp_c1", "7.2")
    await _zu(hass, freezer, "2026-09-29 21:30:00+02:00", st)
    assert shellys.aufrufe[-1] == ("switch.hk1", "off")
    anzahl = len(shellys.aufrufe)
    hass.states.async_set("switch.hk1", "on")                   # jemand schaltet von Hand ein
    await _zu(hass, freezer, "2026-09-29 21:40:00+02:00", st)
    await _zu(hass, freezer, "2026-09-29 21:50:00+02:00", st)
    assert len(shellys.aufrufe) == anzahl and _an(hass, "switch.hk1")


async def test_frost_ohne_fuehler_nach_aussen(hass: HomeAssistant, freezer, shellys, nachrichten) -> None:
    """Szenarien, Herbert 01.10.2026: Container ohne Fühler – Frostschutz nach der Außentemperatur (`frost_aussen`
    −3 °C): ein unter −3 °C, aus erst ab −1 °C (Spanne 2 °C), dazwischen bleibt der Zustand."""
    entry, st = await _neu(hass, freezer, shellys, DI_21)
    hass.states.async_set("sensor.aussen", "-3.0")
    await _automatik(hass, st)
    assert not _an(hass, "switch.hk2") and st.daten.grund[C2] == "ausserhalb"   # genau −3: noch kein Frost
    hass.states.async_set("sensor.aussen", "-10")
    await _zu(hass, freezer, "2026-09-29 21:01:00+02:00", st)
    assert _an(hass, "switch.hk2") and st.daten.grund[C2] == "frost" and st.daten.text[C2] == "Frostschutz"
    hass.states.async_set("sensor.aussen", "-1.1")
    await _zu(hass, freezer, "2026-09-29 21:20:00+02:00", st)
    assert _an(hass, "switch.hk2") and st.daten.grund[C2] == "frost"          # Hysterese: hält bis −1 °C
    hass.states.async_set("sensor.aussen", "-1.0")
    await _zu(hass, freezer, "2026-09-29 21:40:00+02:00", st)
    assert not _an(hass, "switch.hk2") and st.daten.grund[C2] == "ausserhalb"
    hass.states.async_set("sensor.aussen", "-2.0")
    await _zu(hass, freezer, "2026-09-29 22:00:00+02:00", st)
    assert not _an(hass, "switch.hk2")


@pytest.mark.parametrize(("aendern", "wert"), [("frost_aussen", None), ("frost", False), ("frei_modus", "aus")])
async def test_frost_ohne_fuehler_abgeschaltet(hass: HomeAssistant, freezer, shellys, nachrichten, aendern, wert) -> None:
    """Szenarien, Herbert 01.10.2026: ohne Fühler kein Frostschutz, wenn `frost_aussen` None ist, der Frostschutz aus
    ist oder an freien Tagen `frei_modus` „aus“ gilt."""
    if aendern == "frei_modus":
        _kalender(hass, FEIERTAG_DI)
        entry, st = await _neu(hass, freezer, shellys, DI_10, feiertag_kalender="calendar.feiertage")
    else:
        entry, st = await _neu(hass, freezer, shellys, DI_21)
    st.e["heizung"][aendern] = wert
    hass.states.async_set("sensor.aussen", "-10")
    await _automatik(hass, st)
    assert not _an(hass, "switch.hk2") and st.daten.grund[C2] != "frost"


async def test_frost_fuehler_faellt_aus_beendet_frostschutz(hass: HomeAssistant, freezer, shellys, nachrichten) -> None:
    """Szenarien, Herbert 01.10.2026: läuft der Frostschutz und der Fühler wird `unavailable`, gilt bis 15 min der
    letzte Wert (Frostschutz läuft weiter); danach wie ohne Fühler – außen 4,5 °C, also kein Frost, aus."""
    entry, st = await _neu(hass, freezer, shellys, DI_21)
    hass.states.async_set("sensor.temp_c1", "3.0")
    await _automatik(hass, st)
    assert _an(hass, "switch.hk1")
    hass.states.async_set("sensor.temp_c1", "unavailable")
    await _zu(hass, freezer, "2026-09-29 21:10:00+02:00", st)
    assert _an(hass, "switch.hk1") and st.daten.grund[C1] == "frost"
    await _zu(hass, freezer, "2026-09-29 21:20:00+02:00", st)
    assert not _an(hass, "switch.hk1") and st.daten.grund[C1] == "ausserhalb"


@pytest.mark.parametrize(
    ("frei_modus", "temp", "hk1", "grund_c1"),
    [("frost", "4.0", True, "frost"), ("frost", "8.0", False, "frei"),
     ("absenk", "8.0", True, "absenken"), ("absenk", "10.4", False, "absenken"),
     ("aus", "3.0", False, "frei")],
)
async def test_feiertag_frei_modus(hass: HomeAssistant, freezer, shellys, nachrichten, frei_modus, temp, hk1, grund_c1) -> None:
    """Freier Feiertag (aus dem Kalender) in der Arbeitszeit: frost = nur Frostschutz, absenk = mit Fühler auf `absenk`
    (10 °C), ohne Fühler aus; aus = alles aus, auch kein Frostschutz."""
    _kalender(hass, FEIERTAG_DI)
    entry, st = await _neu(hass, freezer, shellys, feiertag_kalender="calendar.feiertage")
    st.e["heizung"]["frei_modus"] = frei_modus
    hass.states.async_set("sensor.temp_c1", temp)
    await _automatik(hass, st)
    assert _an(hass, "switch.hk1") is hk1
    assert st.daten.grund[C1] == grund_c1
    assert not _an(hass, "switch.hk2") and st.daten.grund[C2] == "frei"   # Container 2 ohne Fühler: aus
    assert st.daten.status == "feiertag"
    if frei_modus == "absenk" and hk1:
        assert st.daten.text[C1] == "heizt · abgesenkt"
    woche = _lz(hass, entry)["plan_woche"]
    assert woche[1]["frei"] == "feiertag" and woche[1]["plan"] is None and woche[1]["name"] == "Testfeiertag"
    assert _lz(hass, entry)["abschnitte"][C1]["2026-09-29"] == []


async def test_feiertag_nicht_frei_wird_geheizt(hass: HomeAssistant, freezer, shellys, nachrichten) -> None:
    """`feiertag_frei` aus: am Feiertag wird normal gearbeitet und geheizt; der Wochenplan zeigt den Feiertag trotzdem."""
    _kalender(hass, FEIERTAG_DI)
    entry, st = await _neu(hass, freezer, shellys, feiertag_kalender="calendar.feiertage")
    st.e["heizung"]["feiertag_frei"] = False
    await _automatik(hass, st)
    assert _an(hass, "switch.hk1") and _an(hass, "switch.hk2")
    assert st.daten.grund[C2] == "arbeitszeit" and st.daten.status == "heizt"
    woche = _lz(hass, entry)["plan_woche"]
    assert woche[1]["frei"] == "feiertag" and woche[1]["plan"]["a"] == 420


async def test_urlaub_aus_dem_kalender(hass: HomeAssistant, freezer, shellys, nachrichten) -> None:
    """Urlaub Di–Mi: frei (immer, unabhängig von `feiertag_frei`), am Donnerstag wieder Plan."""
    _kalender(hass, {"calendar.urlaub": [{"start": "2026-09-29", "end": "2026-10-01", "summary": "Betriebsurlaub"}]})
    entry, st = await _neu(hass, freezer, shellys, urlaub_kalender="calendar.urlaub")
    st.e["heizung"]["feiertag_frei"] = False
    await _automatik(hass, st)
    assert not _an(hass, "switch.hk1") and not _an(hass, "switch.hk2")
    assert st.daten.status == "urlaub" and st.daten.grund[C1] == "frei"
    woche = _lz(hass, entry)["plan_woche"]
    assert [(t["frei"], t["plan"] is None) for t in woche[1:4]] == [("urlaub", True), ("urlaub", True), (None, False)]
    assert st.daten.status_text == "aus · Do ab 06:15"


async def test_ausnahme_frei_an_einem_arbeitstag(hass: HomeAssistant, freezer, shellys, nachrichten) -> None:
    """Ausnahme „frei“ am Dienstag: kein Plan, Status „frei“, Wochenplan „ausnahme“; Frostschutz gilt weiter."""
    entry, st = await _neu(hass, freezer, shellys)
    st.e["ausnahmen"] = [{"datum": "2026-09-29", "art": "frei"}]
    await _automatik(hass, st)
    assert not _an(hass, "switch.hk1") and not _an(hass, "switch.hk2")
    assert st.daten.status == "frei"
    assert _lz(hass, entry)["plan_woche"][1]["frei"] == "ausnahme"
    hass.states.async_set("sensor.temp_c1", "4.0")
    await _zu(hass, freezer, "2026-09-29 10:05:00+02:00", st)
    assert _an(hass, "switch.hk1") and st.daten.grund[C1] == "frost"


async def test_ausnahme_frei_mit_frei_modus_absenk(hass: HomeAssistant, freezer, shellys, nachrichten) -> None:
    """Szenarien, Herbert 01.10.2026: eine Ausnahme „frei“ ist ein freier Tag wie Urlaub/Feiertag – `frei_modus` gilt
    (absenk: mit Fühler auf 10 °C)."""
    entry, st = await _neu(hass, freezer, shellys)
    st.e["heizung"]["frei_modus"] = "absenk"
    st.e["ausnahmen"] = [{"datum": "2026-09-29", "art": "frei"}]
    hass.states.async_set("sensor.temp_c1", "8.0")
    await _automatik(hass, st)
    assert _an(hass, "switch.hk1") and st.daten.grund[C1] == "absenken"
    hass.states.async_set("sensor.temp_c1", "10.5")
    await _zu(hass, freezer, "2026-09-29 10:01:00+02:00", st)
    assert not _an(hass, "switch.hk1")


async def test_ausnahme_arbeit_an_einem_samstag(hass: HomeAssistant, freezer, shellys, nachrichten) -> None:
    """Ausnahme „arbeit“ Sa 03.10. 08:00–12:00: Plan mit Vorheizen ab 07:15 und Nachheizen bis 12:15."""
    entry, st = await _neu(hass, freezer, shellys)
    st.e["ausnahmen"] = [{"datum": "2026-10-03", "art": "arbeit", "von": "08:00", "bis": "12:00"}]
    await _automatik(hass, st)
    lz = _lz(hass, entry)
    sa = lz["plan_woche"][5]
    assert sa["datum"] == "2026-10-03" and sa["frei"] is None
    assert (sa["plan"]["start"], sa["plan"]["a"], sa["plan"]["b"], sa["plan"]["ende"]) == (435, 480, 720, 735)
    assert sa["plan"]["gruende"] == ["ausnahme"] and sa["plan"]["ausnahme"]["art"] == "arbeit"
    assert lz["abschnitte"][C1]["2026-10-03"] == [[435, 480, "vorheizen"], [480, 720, "arbeitszeit"], [720, 735, "nachheizen"]]
    assert lz["abschnitte"][C1]["2026-10-04"] == []
    await _zu(hass, freezer, "2026-10-03 07:10:00+02:00", st)
    assert not _an(hass, "switch.hk2") and st.daten.status_text == "Start um 07:15"
    await _zu(hass, freezer, "2026-10-03 07:20:00+02:00", st)
    assert _an(hass, "switch.hk2") and st.daten.grund[C2] == "vorheizen"
    assert st.daten.status_text == "♨ heizt bis 12:15"
    await _zu(hass, freezer, "2026-10-03 12:16:00+02:00", st)
    assert not _an(hass, "switch.hk2")


async def test_ausnahme_arbeit_am_feiertag_plan(hass: HomeAssistant, freezer, shellys, nachrichten) -> None:
    """Ausnahme „arbeit“ am freien Feiertag: Plan, Abschnitte und Status-Text kennen die Arbeit."""
    _kalender(hass, FEIERTAG_DI)
    entry, st = await _neu(hass, freezer, shellys, feiertag_kalender="calendar.feiertage")
    st.e["ausnahmen"] = [{"datum": "2026-09-29", "art": "arbeit", "von": "07:00", "bis": "12:00"}]
    await _automatik(hass, st)
    lz = _lz(hass, entry)
    assert lz["plan_woche"][1]["plan"]["b"] == 720 and lz["plan_woche"][1]["frei"] == "feiertag"
    assert lz["abschnitte"][C2]["2026-09-29"][1] == [420, 720, "arbeitszeit"]
    assert st.daten.status_text == "♨ heizt bis 12:15"


async def test_ausnahme_arbeit_am_feiertag_heizt(hass: HomeAssistant, freezer, shellys, nachrichten) -> None:
    """Ausnahme „arbeit“ geht vor dem freien Feiertag (logik/arbeitszeit): es wird geheizt, Status nicht „feiertag“."""
    _kalender(hass, FEIERTAG_DI)
    entry, st = await _neu(hass, freezer, shellys, feiertag_kalender="calendar.feiertage")
    st.e["ausnahmen"] = [{"datum": "2026-09-29", "art": "arbeit", "von": "07:00", "bis": "12:00"}]
    await _automatik(hass, st)
    assert st.daten.grund[C2] == "arbeitszeit"
    assert _an(hass, "switch.hk2")
    assert st.daten.status == "heizt"


# ====================================================================== Heizgrenze
@pytest.mark.parametrize(("aussen", "zu_warm"), [("15.0", False), ("15.1", True)])
async def test_heizgrenze_knapp(hass: HomeAssistant, freezer, shellys, nachrichten, aussen, zu_warm) -> None:
    """Heizgrenze 15 °C: genau 15,0 heizt noch, 15,1 nicht (über der Grenze = zu warm)."""
    entry, st = await _neu(hass, freezer, shellys)
    hass.states.async_set("sensor.aussen", aussen)
    await _automatik(hass, st)
    assert _an(hass, "switch.hk2") is not zu_warm
    assert st.daten.status == ("heizgrenze" if zu_warm else "heizt")
    assert st.daten.grund[C2] == ("heizgrenze" if zu_warm else "arbeitszeit")
    assert _lz(hass, entry)["heizgrenze"] == {"bezug": float(aussen), "zu_warm": zu_warm}
    wort = "überschritten" if zu_warm else "nicht erreicht"
    assert any(t.startswith(f"Heizgrenze {wort} (Höchstwert 15 °C)") for t in _texte(st, "wetter"))


async def test_heizgrenze_basis_tageshoechst_und_jetzt(hass: HomeAssistant, freezer, shellys, nachrichten) -> None:
    """Vorhersage Höchstwert 17 °C, jetzt 10 °C: Basis Tageshöchstwert → nicht heizen; Basis jetzt → heizen."""
    entry, st = await _neu(hass, freezer, shellys)
    st.lz["wetter_tage"] = {"2026-09-29": {"max": 17.0}}
    hass.states.async_set("sensor.aussen", "10.0")
    await _automatik(hass, st)
    assert not _an(hass, "switch.hk2") and st.daten.status == "heizgrenze"
    assert _lz(hass, entry)["heizgrenze"] == {"bezug": 17.0, "zu_warm": True}
    st.e["heizung"]["heizgrenze_basis"] = "jetzt"
    await _zu(hass, freezer, "2026-09-29 10:05:00+02:00", st)
    assert _an(hass, "switch.hk2") and st.daten.status == "heizt"
    assert _lz(hass, entry)["heizgrenze"] == {"bezug": 10.0, "zu_warm": False}
    assert "Heizgrenze unterschritten – es wird wieder geheizt" in _texte(st, "wetter")
    # Basis jetzt: steigt die Temperatur über die Grenze, wird ausgeschaltet
    hass.states.async_set("sensor.aussen", "15.5")
    await _zu(hass, freezer, "2026-09-29 12:00:00+02:00", st)
    assert not _an(hass, "switch.hk2")
    assert "Heizgrenze überschritten – Heizung aus" in _texte(st, "wetter")


async def test_heizgrenze_gemessener_hoechstwert_wird_gemerkt(hass: HomeAssistant, freezer, shellys, nachrichten) -> None:
    """Szenarien, Herbert 01.10.2026: Basis Tageshöchstwert ohne Vorhersage – der mittags gemessene Höchstwert (17 °C)
    gilt bis Mitternacht; fällt die Temperatur am Nachmittag auf 12 °C, bleibt es „zu warm“. Am nächsten Tag neu."""
    entry, st = await _neu(hass, freezer, shellys)
    hass.states.async_set("sensor.aussen", "17.0")
    await _automatik(hass, st)
    assert not _an(hass, "switch.hk2")
    hass.states.async_set("sensor.aussen", "12.0")
    await _zu(hass, freezer, "2026-09-29 14:00:00+02:00", st)
    assert not _an(hass, "switch.hk2") and _lz(hass, entry)["heizgrenze"]["bezug"] == 17.0
    st.e["heizung"]["heizgrenze_basis"] = "jetzt"                     # Basis „jetzt“: zählt der aktuelle Wert
    await _zu(hass, freezer, "2026-09-29 14:01:00+02:00", st)
    assert _an(hass, "switch.hk2")


async def test_heizgrenze_mit_frost(hass: HomeAssistant, freezer, shellys, nachrichten) -> None:
    """Über der Heizgrenze, aber Container 1 bei 4 °C: Frostschutz geht vor, Container 2 bleibt aus."""
    entry, st = await _neu(hass, freezer, shellys)
    hass.states.async_set("sensor.aussen", "17")
    hass.states.async_set("sensor.temp_c1", "4.0")
    await _automatik(hass, st)
    assert _an(hass, "switch.hk1") and st.daten.grund[C1] == "frost"
    assert not _an(hass, "switch.hk2") and st.daten.grund[C2] == "heizgrenze"
    assert st.daten.status == "heizgrenze"


async def test_heizgrenze_mit_schnell_aufheizen(hass: HomeAssistant, freezer, shellys, nachrichten) -> None:
    """Schnell aufheizen geht vor der Heizgrenze, bis das Soll erreicht ist; danach gilt wieder die Heizgrenze."""
    entry, st = await _neu(hass, freezer, shellys)
    hass.states.async_set("sensor.aussen", "17")
    st.lz["boost_bis"][C1] = (dt_util.now() + timedelta(minutes=30)).isoformat()
    await _automatik(hass, st)
    assert _an(hass, "switch.hk1") and st.daten.grund[C1] == "boost"
    assert st.daten.text[C1] == "⚡ schnell aufheizen"
    assert not _an(hass, "switch.hk2") and st.daten.grund[C2] == "heizgrenze"
    hass.states.async_set("sensor.temp_c1", "20.0")              # Soll erreicht: Boost endet
    await _zu(hass, freezer, "2026-09-29 10:10:00+02:00", st)
    assert C1 not in st.lz["boost_bis"]
    assert not _an(hass, "switch.hk1") and st.daten.grund[C1] == "heizgrenze"


# ====================================================================== Frühstart, Regen, Summe (AN-0003)
async def test_kaelte_fruehstart(hass: HomeAssistant, freezer, shellys, nachrichten) -> None:
    """Morgen −4 °C (unter 0 °C): Vorheizen 30 min früher, ab 05:45; Wochenplan und Abschnitte zeigen „fruehstart“."""
    entry, st = await _neu(hass, freezer, shellys)
    st.lz["wetter_tage"] = {MI: {"frueh": -4.0}}
    await _automatik(hass, st)
    lz = _lz(hass, entry)
    mi = lz["plan_woche"][2]["plan"]
    assert (mi["start"], mi["vor"], mi["gruende"]) == (345, 375, ["fruehstart"])
    assert lz["abschnitte"][C1][MI][:2] == [[345, 375, "fruehstart"], [375, 420, "vorheizen"]]
    await _zu(hass, freezer, "2026-09-30 05:44:00+02:00", st)
    assert not _an(hass, "switch.hk2") and st.daten.status_text == "Start um 05:45"
    await _zu(hass, freezer, "2026-09-30 05:46:00+02:00", st)
    assert _an(hass, "switch.hk2") and st.daten.grund[C2] == "fruehstart"
    assert any(t.startswith("Kalter Morgen") and "30 min früher" in t for t in _texte(st, "wetter"))


@pytest.mark.parametrize(
    ("frueh", "unter", "dauer", "an", "start"),
    [(1.5, 2.0, 60, True, 315), (2.0, 2.0, 60, True, 375), (0.0, 0.0, 30, True, 375), (-4.0, 0.0, 30, False, 375)],
)
async def test_fruehstart_schwelle_dauer_und_schalter(hass: HomeAssistant, freezer, shellys, nachrichten, frueh, unter, dauer, an, start) -> None:
    """`fruehstart_unter` ist eine echte Unter-Grenze (gleich = kein Frühstart), `fruehstart_min` die Dauer, der Schalter
    `fruehstart` aus = nie."""
    entry, st = await _neu(hass, freezer, shellys)
    h = st.e["heizung"]
    h.update(fruehstart=an, fruehstart_unter=unter, fruehstart_min=dauer)
    st.lz["wetter_tage"] = {MI: {"frueh": frueh}}
    await _jetzt(hass, st)
    assert _lz(hass, entry)["plan_woche"][2]["plan"]["start"] == start


async def test_regen_gestern_frueher_nur_mit_trocknen(hass: HomeAssistant, freezer, shellys, nachrichten) -> None:
    """Regen am Dienstag 6 mm (in der Arbeitszeit, Regensensor: 0 bei Arbeitsbeginn, AN-0021): am Mittwoch beginnt
    Container 1 (Kleidung trocknen) 15 min früher, Container 2 nicht."""
    entry, st = await _neu(hass, freezer, shellys)
    st.e["heizung"]["trocknen_stufen"] = EINE_STUFE
    st.einstellungen.bereich(C1)["trocknen"] = True
    hass.states.async_set("sensor.regen", "6")                 # gemessen: wird für morgen gemerkt
    await _automatik(hass, st)
    assert st.lz["wetter_tage"]["2026-09-29"]["regen_mess"] == 6.0
    ab = _lz(hass, entry)["abschnitte"]
    assert ab[C1][MI][0] == [360, 375, "fruehstart"]
    assert ab[C2][MI][0] == [375, 420, "vorheizen"]
    hass.states.async_set("sensor.regen", "0")
    await _zu(hass, freezer, "2026-09-30 06:01:00+02:00", st)
    assert _an(hass, "switch.hk1") and st.daten.grund[C1] == "fruehstart"
    assert any("mm gestern in der Arbeitszeit – heute 15 min früher" in t for t in _texte(st, "wetter"))


@pytest.mark.parametrize(("regen", "ende"), [("2.0", 1050), ("1.9", 1005)])
async def test_regen_heute_kleidung_trocknen_laenger(hass: HomeAssistant, freezer, shellys, nachrichten, regen, ende) -> None:
    """Regen heute ab 2 mm: Container mit Kleidung trocknen heizt 45 min länger (bis 17:30), Abschnitt „trocknen“."""
    entry, st = await _neu(hass, freezer, shellys)
    st.e["heizung"]["trocknen_stufen"] = EINE_STUFE
    st.einstellungen.bereich(C1)["trocknen"] = True
    hass.states.async_set("sensor.regen", regen)
    await _automatik(hass, st)
    ab = _lz(hass, entry)["abschnitte"]
    assert ab[C1]["2026-09-29"][-1][1] == ende
    assert ab[C2]["2026-09-29"][-1] == [990, 1005, "nachheizen"]
    await _zu(hass, freezer, "2026-09-29 17:00:00+02:00", st)
    assert not _an(hass, "switch.hk2")
    if ende == 1050:
        assert ab[C1]["2026-09-29"][-1] == [1005, 1050, "trocknen"]
        assert _an(hass, "switch.hk1") and st.daten.zustand[C1] == "trocknen" and st.daten.text[C1] == "Kleidung trocknen"
        await _zu(hass, freezer, "2026-09-29 17:31:00+02:00", st)
    assert not _an(hass, "switch.hk1")


async def test_nur_regen_in_der_arbeitszeit_zaehlt(hass: HomeAssistant, freezer, shellys, nachrichten) -> None:
    """AN-0021: 8 mm um 3 Uhr früh und nach Feierabend machen keine Kleidung nass – kein Trocknen; 3 mm zwischen 10 und
    12 Uhr schon (Vorgabe: ab 2 mm 60 min länger, morgen 15 min früher). Text und Plan kommen von der Integration."""
    entry, st = await _neu(hass, freezer, shellys)
    st.einstellungen.bereich(C1)["trocknen"] = True
    hass.states.async_remove("sensor.regen")                     # ohne Regensensor: die Stunden der Vorhersage
    st.lz["wetter_tage"].get("2026-09-29", {}).pop("regen_mess", None)
    st.lz["wetter_tage"].get("2026-09-29", {}).pop("regen_mess_a", None)
    heute = dt_util.parse_datetime("2026-09-29T12:00:00+02:00").date()
    h = lambda uhr: f"2026-09-29T{uhr}:00+02:00"   # noqa: E731
    jetzt = dt_util.parse_datetime("2026-09-29T02:00:00+02:00")
    st._wetter_tage_merken({heute: {"regen": 14.0, "regen_h": {h("03:00"): 8.0, h("18:00"): 6.0}}}, jetzt)
    st.funktion("heizung").plan_neu()
    assert st.wetter_tag_plan(heute).regen_az_heute_mm == 0.0 and st.wetter_tag_plan(heute).regen_heute_mm == 14.0
    assert "trocknen" not in st.funktion("heizung").plan_bereich(heute, C1).gruende
    st._wetter_tage_merken({heute: {"regen": 3.0, "regen_h": {h("10:00"): 1.0, h("11:00"): 2.0}}}, jetzt)
    st.funktion("heizung").plan_neu()
    await _automatik(hass, st)
    plan = st.funktion("heizung").plan_bereich(heute, C1)
    assert "trocknen" in plan.gruende and plan.ende == 1005 + 60
    tr = _lz(hass, entry)["trocknen"]
    assert tr["text"] == "3 mm Regen in der Arbeitszeit heute → 60 min länger, morgen 15 min früher" and tr["laenger_min"] == 60
    assert st.lz["wetter_tage"]["2026-09-29"]["regen_az"] == 3.0                     # je Tag abgelegt
    morgen = st.funktion("heizung").plan_bereich(dt_util.parse_datetime(f"{MI}T12:00:00+02:00").date(), C1)
    assert ("frueher_nach_regen", 15) in morgen.frueher                              # gestrige Arbeitszeit → heute früher


async def test_regen_vorhersage_wird_kleiner(hass: HomeAssistant, freezer, shellys, nachrichten) -> None:
    """FE-0026: Morgens sagt die Vorhersage 6,8 mm für heute, mittags nur noch 0,5 mm für den Rest des Tages – gilt
    die neueste Vorhersage für die kommenden Stunden (plus den schon vorhergesagten Morgen), kein „trocknen“ mehr.
    Ein gemessener Wert geht vor jeder Vorhersage."""
    entry, st = await _neu(hass, freezer, shellys)
    st.einstellungen.bereich(C1)["trocknen"] = True
    hass.states.async_remove("sensor.regen")                     # ohne Regensensor: nur die Vorhersage
    st.lz["wetter_tage"].get("2026-09-29", {}).pop("regen_mess", None)   # die 0 mm vom Start vergessen
    heute = dt_util.parse_datetime("2026-09-29T12:00:00+02:00").date()
    def h(uhr: str) -> str:
        return f"2026-09-29T{uhr}:00+02:00"
    morgens = dt_util.parse_datetime("2026-09-29T07:00:00+02:00")
    st._wetter_tage_merken({heute: {"regen": 6.8, "regen_h": {h("07:00"): 0.2, h("08:00"): 0.1, h("13:00"): 3.0,
                                                             h("14:00"): 3.5}}}, morgens)
    assert st.wetter_tag_plan(heute).regen_heute_mm == 6.8
    mittag = dt_util.parse_datetime("2026-09-29T12:10:00+02:00")
    st._wetter_tage_merken({heute: {"regen": 0.5, "regen_h": {h("12:00"): 0.0, h("13:00"): 0.3, h("14:00"): 0.2}}}, mittag)
    assert st.wetter_tag_plan(heute).regen_heute_mm == 0.8        # 0,2 + 0,1 (Morgen) + 0,5 (Rest)
    await _automatik(hass, st)
    plan = st.funktion("heizung").plan_bereich(heute, C1)
    assert "trocknen" not in plan.gruende
    # gemessen 0,4 mm, die Vorhersage sagt wieder 6,8 mm: der Messwert gilt
    hass.states.async_set("sensor.regen", "0.4")
    st._wetter_tage_merken({heute: {"regen": 6.8, "regen_h": {h("13:00"): 3.3, h("14:00"): 3.5}}}, mittag)
    await _automatik(hass, st)
    assert st.wetter_tag_plan(heute).regen_heute_mm == 0.4
    assert "trocknen" not in st.funktion("heizung").plan_bereich(heute, C1).gruende


async def test_summe_der_verlaengerungen(hass: HomeAssistant, freezer, shellys, nachrichten) -> None:
    """AN-0003: Kälte (30) + Regen gestern (15) + „Noch früher“ (30) zählen zusammen → ab 05:00; Regen heute +45 min."""
    entry, st = await _neu(hass, freezer, shellys)
    st.e["heizung"]["trocknen_stufen"] = EINE_STUFE
    st.einstellungen.bereich(C1)["trocknen"] = True
    st.lz["wetter_tage"] = {"2026-09-29": {"regen_mess": 6.0, "regen_mess_a": 0.0, "regen_mess_b": 6.0},   # gestern gemessen, in der Arbeitszeit
                            MI: {"frueh": -4.0, "regen": 6.0}}
    st.lz.setdefault("frueher", {})[MI] = 30
    await _automatik(hass, st)
    ab = _lz(hass, entry)["abschnitte"]
    assert ab[C1][MI] == [[300, 375, "fruehstart"], [375, 420, "vorheizen"], [420, 990, "arbeitszeit"],
                          [990, 1005, "nachheizen"], [1005, 1050, "trocknen"]]
    assert ab[C2][MI][0] == [315, 375, "fruehstart"]           # ohne trocknen: Kälte + „Noch früher“
    plan = st.funktion("heizung").plan_bereich(dt_util.parse_datetime(f"{MI}T12:00:00+02:00").date(), C1)
    assert plan.gruende == ("fruehstart", "frueher_nach_regen", "trocknen")


async def test_status_text_ohne_trocknende_container_abschnitte(hass: HomeAssistant, freezer, shellys, nachrichten) -> None:
    """Regen heute, kein Container trocknet Kleidung: die Abschnitte enden mit dem Nachheizen um 16:45."""
    entry, st = await _neu(hass, freezer, shellys)
    hass.states.async_set("sensor.regen", "6")
    await _automatik(hass, st)
    ab = _lz(hass, entry)["abschnitte"]
    assert ab[C1]["2026-09-29"][-1] == [990, 1005, "nachheizen"] and ab[C2]["2026-09-29"][-1] == [990, 1005, "nachheizen"]
    await _zu(hass, freezer, "2026-09-29 16:50:00+02:00", st)
    assert not _an(hass, "switch.hk1") and not _an(hass, "switch.hk2")


async def test_status_text_ohne_trocknende_container(hass: HomeAssistant, freezer, shellys, nachrichten) -> None:
    """Regen heute, aber kein Container trocknet Kleidung: geheizt wird bis 16:45 – der Status sollte das sagen."""
    entry, st = await _neu(hass, freezer, shellys)
    hass.states.async_set("sensor.regen", "6")
    await _automatik(hass, st)
    assert st.daten.status_text == "♨ heizt bis 16:45"


async def test_plan_woche_mit_trocknen_ohne_trocknende_container(hass: HomeAssistant, freezer, shellys, nachrichten) -> None:
    """FRAGE: `plan_woche` rechnet immer mit Kleidung trocknen (Baustellen-Plan), auch wenn kein Container trocknet."""
    entry, st = await _neu(hass, freezer, shellys)
    st.e["heizung"]["trocknen_stufen"] = EINE_STUFE
    hass.states.async_set("sensor.regen", "6")
    await _automatik(hass, st)
    heute = _lz(hass, entry)["plan_woche"][1]["plan"]
    assert heute["ende"] == 1050 and "trocknen" in heute["gruende"]


# ====================================================================== Zusatz-Heizkörper bei Kälte (AN-0006)
async def _zwei_in_c1(hass, freezer, shellys, zeit: str = DI_10, **optionen):
    entry, st = await _neu(hass, freezer, shellys, zeit, hk2_bereich=C1, **optionen)
    st.einstellungen.bereich(C1)["soll"] = 20.0
    st.einstellungen.bereich(C1)["modus"] = "thermo"
    st.einstellung_setzen(("bereiche", C1, "stufen"), True)
    return entry, st


async def test_stufen_sehr_kalt(hass: HomeAssistant, freezer, shellys, nachrichten) -> None:
    """Fast warm (19,5 °C), außen −6 °C (unter −5): beide; −5,0 genau: nur einer; `stufen_kalt` −10: bei −8 nur einer."""
    entry, st = await _zwei_in_c1(hass, freezer, shellys)
    hass.states.async_set("sensor.temp_c1", "19.5")
    hass.states.async_set("sensor.aussen", "-6.0")
    await _automatik(hass, st)
    assert _an(hass, "switch.hk1") and _an(hass, "switch.hk2")
    s = _lz(hass, entry)["container"][C1]["stufen"]
    assert s["zusatz_an"] is True and s["grund"] == "kalt" and s["text"] == "außergewöhnlich kalt"
    assert any("Zusatz-Heizkörper dazu – außergewöhnlich kalt" in t for t in _texte(st, "schalten"))
    hass.states.async_set("sensor.aussen", "-5.0")
    await _zu(hass, freezer, "2026-09-29 10:05:00+02:00", st)
    assert _an(hass, "switch.hk1") and not _an(hass, "switch.hk2")
    st.e["heizung"]["stufen_kalt"] = -10.0
    hass.states.async_set("sensor.aussen", "-8.0")
    await _zu(hass, freezer, "2026-09-29 10:10:00+02:00", st)
    assert _an(hass, "switch.hk1") and not _an(hass, "switch.hk2")


async def test_stufen_kalt_ohne_aussentemperatur(hass: HomeAssistant, freezer, shellys, nachrichten) -> None:
    """Szenarien, Herbert 01.10.2026: Außentemperatur fällt aus – der letzte Wert (−8 °C) gilt bis 6 h, der Zusatz
    bleibt „außergewöhnlich kalt“ an; danach ist außen unbekannt, „kalt“ entfällt, der Zusatz geht (nahe am Soll) aus."""
    entry, st = await _zwei_in_c1(hass, freezer, shellys)
    hass.states.async_set("sensor.temp_c1", "19.6")
    hass.states.async_set("sensor.aussen", "-8.0")
    await _automatik(hass, st)
    assert _an(hass, "switch.hk2")
    hass.states.async_set("sensor.aussen", "unavailable")
    await _zu(hass, freezer, "2026-09-29 10:05:00+02:00", st)
    assert _an(hass, "switch.hk1") and _an(hass, "switch.hk2")
    assert _lz(hass, entry)["wetter"]["aussen"] == -8.0
    hass.states.async_set("sensor.temp_c1", "19.9")            # Raum kommt voran (sonst „schafft es nicht“ nach 6 h)
    await _zu(hass, freezer, "2026-09-29 16:01:00+02:00", st)          # 6 h 1 min ohne Außenwert
    assert _lz(hass, entry)["wetter"]["aussen"] is None
    assert _an(hass, "switch.hk1") and not _an(hass, "switch.hk2")


async def test_stufen_im_frostschutz(hass: HomeAssistant, freezer, shellys, nachrichten) -> None:
    """FRAGE: Frostschutz bei 5,5 °C (Hysterese, Ziel 7 °C): der Zusatz misst „weit unter“ am Soll 20 °C, nicht am
    Frost-Ziel – tatsächlich laufen beide."""
    entry, st = await _zwei_in_c1(hass, freezer, shellys, DI_21)
    hass.states.async_set("sensor.temp_c1", "4.0")
    await _automatik(hass, st)
    hass.states.async_set("sensor.temp_c1", "5.5")
    await _zu(hass, freezer, "2026-09-29 21:05:00+02:00", st)
    assert st.daten.grund[C1] == "frost"
    assert _an(hass, "switch.hk1") and _an(hass, "switch.hk2")
    assert _lz(hass, entry)["container"][C1]["stufen"]["grund"] == "weit_unter"


async def test_stufen_beim_absenken(hass: HomeAssistant, freezer, shellys, nachrichten) -> None:
    """Feiertag mit frei_modus absenk (10 °C), Raum 9,0 °C: 1 °C unter dem Ziel → einer reicht."""
    _kalender(hass, FEIERTAG_DI)
    entry, st = await _zwei_in_c1(hass, freezer, shellys, feiertag_kalender="calendar.feiertage")
    st.e["heizung"]["frei_modus"] = "absenk"
    hass.states.async_set("sensor.temp_c1", "9.0")
    await _automatik(hass, st)
    assert st.daten.grund[C1] == "absenken" and _an(hass, "switch.hk1")
    assert not _an(hass, "switch.hk2")


# ====================================================================== Sprünge: Wetterwerte fehlen
async def test_aussentemperatur_faellt_aus_ueber_heizgrenze(hass: HomeAssistant, freezer, shellys, nachrichten) -> None:
    """Szenarien, Herbert 01.10.2026: über der Heizgrenze fällt der Außenfühler aus (ohne Wetter-Entität) → der letzte
    gemessene Wert gilt bis 6 h, es bleibt „zu warm“; danach ist außen unbekannt – mit Basis Tageshöchstwert bleibt der
    gemessene Höchstwert bis Mitternacht, mit Basis „jetzt“ gilt ohne Bezug „nicht zu warm“."""
    entry, st = await _neu(hass, freezer, shellys)
    hass.states.async_set("sensor.aussen", "17")
    await _automatik(hass, st)
    assert not _an(hass, "switch.hk2")
    hass.states.async_set("sensor.aussen", "unavailable")
    await _zu(hass, freezer, "2026-09-29 10:05:00+02:00", st)
    lz = _lz(hass, entry)
    assert lz["wetter"]["aussen"] == 17.0 and lz["heizgrenze"]["zu_warm"] is True
    assert not _an(hass, "switch.hk2")
    await _zu(hass, freezer, "2026-09-29 16:00:00+02:00", st)          # genau 6 h: gilt noch
    assert _lz(hass, entry)["heizgrenze"]["zu_warm"] is True and not _an(hass, "switch.hk2")
    await _zu(hass, freezer, "2026-09-29 16:01:00+02:00", st)          # danach unbekannt …
    lz = _lz(hass, entry)
    assert lz["wetter"]["aussen"] is None
    # … aber der gemessene Tageshöchstwert (17 °C) gilt bis Mitternacht (Basis Tageshöchstwert, Szenarien)
    assert lz["heizgrenze"]["zu_warm"] is True and not _an(hass, "switch.hk2")
    st.e["heizung"]["heizgrenze_basis"] = "jetzt"                     # Basis „jetzt“: ohne Wert gilt „nicht zu warm“
    await _zu(hass, freezer, "2026-09-29 16:02:00+02:00", st)
    lz = _lz(hass, entry)
    assert lz["heizgrenze"] == {"bezug": None, "zu_warm": False}
    assert _an(hass, "switch.hk2") and st.daten.status == "heizt"
    assert "Heizgrenze unterschritten – es wird wieder geheizt" in _texte(st, "wetter")


async def test_aussentemperatur_aus_der_wetter_entitaet(hass: HomeAssistant, freezer, shellys, nachrichten) -> None:
    """Außenfühler `unavailable`, Wetter-Entität hat eine Temperatur: die gilt (für Heizgrenze und Anzeige)."""
    hass.states.async_set("weather.home", "sunny", {"temperature": 16.0})
    entry, st = await _neu(hass, freezer, shellys, wetter="weather.home")
    hass.states.async_set("sensor.aussen", "unavailable")
    await _automatik(hass, st)
    lz = _lz(hass, entry)
    assert lz["wetter"]["aussen"] == 16.0 and lz["wetter"]["zustand"] == "sunny"
    assert lz["heizgrenze"]["zu_warm"] is True and not _an(hass, "switch.hk2")


async def test_vorhersage_fehlt(hass: HomeAssistant, freezer, shellys, nachrichten) -> None:
    """Wetter-Entität ohne Vorhersage-Dienst (weather.get_forecasts fehlt bzw. Fehler): kein Absturz, kein Frühstart,
    keine Frühstart-Nachricht; Heizgrenze rechnet mit dem Wert von jetzt."""
    hass.states.async_set("weather.home", "cloudy", {"temperature": 3.0})
    entry, st = await _neu(hass, freezer, shellys, wetter="weather.home")
    await _automatik(hass, st)
    lz = _lz(hass, entry)
    assert lz["wetter"]["frueh_min"] is None and lz["wetter"]["aussen_max"] == 4.5
    assert lz["plan_woche"][2]["plan"]["start"] == 375 and lz["plan_woche"][2]["plan"]["gruende"] == []
    await _zu(hass, freezer, "2026-09-29 18:00:30+02:00", st)
    st._takt(dt_util.now())  # noqa: SLF001
    await hass.async_block_till_done()
    assert not [n for n in nachrichten if n.data["title"].startswith("❄")]


async def test_vorhersage_dienst_meldet_fehler(hass: HomeAssistant, freezer, shellys, nachrichten) -> None:
    """weather.get_forecasts wirft einen Fehler: Plan bleibt normal, gemerkte Tage bleiben erhalten."""
    from homeassistant.exceptions import HomeAssistantError

    async def kaputt(call: ServiceCall):
        raise HomeAssistantError("keine Vorhersage")

    hass.services.async_register("weather", "get_forecasts", kaputt, supports_response=SupportsResponse.ONLY)
    hass.states.async_set("weather.home", "cloudy", {"temperature": 3.0})
    entry, st = await _neu(hass, freezer, shellys, wetter="weather.home")
    st.lz["wetter_tage"] = {MI: {"frueh": -4.0}}
    await st._async_prognose()  # noqa: SLF001
    await hass.async_block_till_done()
    assert st.lz["wetter_tage"][MI]["frueh"] == -4.0
    assert _lz(hass, entry)["plan_woche"][2]["plan"]["start"] == 345


async def test_fuehler_faellt_aus_in_der_arbeitszeit(hass: HomeAssistant, freezer, shellys, nachrichten) -> None:
    """Szenarien, Herbert 01.10.2026: Fühler `unavailable` in der Arbeitszeit – bis 15 min gilt der letzte Wert
    (20,5 °C, bleibt aus), danach heizt der Container ohne Thermostat durch (wie ohne Fühler)."""
    entry, st = await _neu(hass, freezer, shellys)
    hass.states.async_set("sensor.temp_c1", "20.5")
    await _automatik(hass, st)
    assert not _an(hass, "switch.hk1")
    hass.states.async_set("sensor.temp_c1", "unavailable")
    await _zu(hass, freezer, "2026-09-29 10:05:00+02:00", st)
    assert not _an(hass, "switch.hk1") and st.daten.grund[C1] == "arbeitszeit"
    await _zu(hass, freezer, "2026-09-29 10:16:00+02:00", st)
    assert _an(hass, "switch.hk1") and st.daten.grund[C1] == "arbeitszeit"
    assert st.daten.text[C1] == "heizt · Heizplan · Arbeitszeit"


async def test_fuehler_beim_start_unbekannt(hass: HomeAssistant, freezer, shellys, nachrichten) -> None:
    """Szenarien, Herbert 01.10.2026: meldet der Fühler schon beim Start nichts (kein letzter Wert), gilt sofort
    „wie ohne Fühler“ – in der Arbeitszeit an, der Heizkörperthermostat regelt."""
    entry, st = await _neu(hass, freezer, shellys)
    hass.states.async_set("sensor.temp_c1", "unknown")
    await _automatik(hass, st)
    assert _an(hass, "switch.hk1") and st.daten.grund[C1] == "arbeitszeit"
    assert st.daten.text[C1] == "heizt · Heizplan · Arbeitszeit"
