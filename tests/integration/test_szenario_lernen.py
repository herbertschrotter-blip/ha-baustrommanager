"""Szenarien Themenfeld 5: lernende Regelung, „Warm ab“ (AN-0004), Zusatz nur bei Bedarf (AN-0006), Tür offen beim
Lernen (WU-0009) und ihr Zusammenspiel mit Plan, Hand, Schnell aufheizen, „alle jetzt heizen“ und Terminen.

Alle Szenarien laufen gegen die echte Integration mit Fake-Shellys (conftest). Grundlage: Baustelle B1, Arbeitszeit
Mo–Do 07:00–16:30, Fr 07:00–12:30; Container 1 mit Fühler `sensor.temp_c1`, Soll 20 °C, Staffelung aus.
Rechnungen der Fachregeln stehen jeweils am Assert (TPI: Anteil = 0,6 × (Soll − innen − Nachlauf) + K außen × (Soll − außen)).
"""

from __future__ import annotations

from datetime import datetime, timedelta

import pytest

from homeassistant.core import Context, HomeAssistant, ServiceCall, SupportsResponse
from homeassistant.util import dt as dt_util
from pytest_homeassistant_custom_component.common import MockConfigEntry

from custom_components.baustelle.const import DOMAIN
from custom_components.baustelle.daten import struktur

from .conftest import C1, C2, HK1, HK2, P1, SCHACHT, STANDARD_ZUSTAND, baustelle_anlegen, sub

ZEHN_UHR = "2026-09-29 10:00:00+02:00"  # Dienstag


# ---------------------------------------------------------------------- Hilfen
async def _zu(hass, freezer, zeit: str | datetime, st) -> None:
    freezer.move_to(zeit)
    st.auswerten()
    await hass.async_block_till_done()


def _an(hass, entity_id: str) -> bool:
    return hass.states.get(entity_id).state == "on"


def _c(hass, entry, bid: str = C1) -> dict:
    return struktur(hass, entry)["laufzeit"]["container"][bid]


def _texte(st, art: str | None = None) -> list[str]:
    return [p[3] for p in st.e["protokoll"] if art is None or p[1] == art]


class Uhr:
    """Minute für Minute weiter: Fühler setzen, Zeit vorstellen, auswerten."""

    def __init__(self, hass, freezer, st, start: str, fuehler: str = "sensor.temp_c1") -> None:
        self.hass, self.freezer, self.st = hass, freezer, st
        self.t = dt_util.parse_datetime(start)
        self.fuehler = fuehler

    async def minute(self, temp: float | None = None, n: int = 1) -> None:
        for _ in range(n):
            if temp is not None:
                self.hass.states.async_set(self.fuehler, str(temp))
            self.t += timedelta(minutes=1)
            self.freezer.move_to(self.t)
            self.st.auswerten()
            await self.hass.async_block_till_done()


async def _einrichten(hass, freezer, shellys, zeit: str = ZEHN_UHR, *, hk2_bereich: str = C2, modus: str | None = "thermo",
                      lernen: bool = True, **optionen):
    """Baustelle mit lernendem Container 1 (Automatik noch aus)."""
    entry = await baustelle_anlegen(hass, freezer, zeit, hk2_bereich=hk2_bereich, **optionen)
    assert await hass.config_entries.async_setup(entry.entry_id)
    await hass.async_block_till_done()
    shellys.anmelden()
    st = entry.runtime_data
    st.e["staffel"]["an"] = False
    st.einstellungen.bereich(C1)["soll"] = 20.0
    st.einstellungen.bereich(C1)["modus"] = modus
    if lernen:
        st.einstellung_setzen(("bereiche", C1, "lernen"), True)
    return entry, st


async def _zwei_fuehler(hass, freezer, shellys, zeit: str):
    """Wie conftest, aber Container 2 hat auch einen Fühler (zwei lernende Container)."""
    await hass.config.async_set_time_zone("Europe/Vienna")
    freezer.move_to(zeit)
    for entity_id, wert in {**STANDARD_ZUSTAND, "sensor.temp_c2": "16.0"}.items():
        hass.states.async_set(entity_id, wert)
    entry = MockConfigEntry(
        domain=DOMAIN, title="B1", data={"name": "B1"},
        options={"heizung": True, "pumpen": True, "status": "aktiv", "beginn": "2026-09-01",
                 "heizperiode_von": "10", "heizperiode_bis": "4", "empfaenger": ["mobile_app_test"],
                 "temp_sensor": "sensor.aussen", "regen_sensor": "sensor.regen"},
        subentries_data=[
            sub(C1, "bereich", "Container 1", {"name": "Container 1", "art": "container", "fuehler": "sensor.temp_c1"}),
            sub(C2, "bereich", "Container 2", {"name": "Container 2", "art": "container", "fuehler": "sensor.temp_c2"}),
            sub(SCHACHT, "bereich", "Schacht", {"name": "Schacht", "art": "pumpenschacht"}),
            sub(HK1, "geraet", "Heizkörper 1", {"bereich": C1, "schalter": "switch.hk1", "name": "Heizkörper 1",
                                                "rolle": "heizkoerper", "typ": "oelradiator", "leistung": "sensor.hk1_power"}),
            sub(HK2, "geraet", "Heizkörper 2", {"bereich": C2, "schalter": "switch.hk2", "name": "Heizkörper 2",
                                                "rolle": "heizkoerper", "typ": "konvektor", "leistung": "sensor.hk2_power"}),
            sub(P1, "geraet", "Pumpe 1", {"bereich": SCHACHT, "schalter": "switch.p1", "name": "Pumpe 1",
                                          "rolle": "pumpe", "typ": "konvektor", "leistung": "sensor.p1_power"}),
        ],
    )
    entry.add_to_hass(hass)
    assert await hass.config_entries.async_setup(entry.entry_id)
    await hass.async_block_till_done()
    shellys.anmelden()
    st = entry.runtime_data
    st.e["staffel"]["an"] = False
    return entry, st


@pytest.fixture
async def ws(hass: HomeAssistant, hass_ws_client):
    client = await hass_ws_client(hass)
    zaehler = {"id": 0}

    async def rufe(entry, typ: str, **felder):
        zaehler["id"] += 1
        await client.send_json({"id": zaehler["id"], "type": typ, "entry_id": entry.entry_id, **felder})
        antwort = await client.receive_json()
        await hass.async_block_till_done()
        return antwort

    return rufe


def _gelernt(rate: float, *, kalt: float | None = None, n2: float | None = None, n: int = 3) -> dict:
    """Lernstand mit gelernter Aufheizrate (°C/h) – ein Heizkörper, optional kalt und zwei Heizkörper."""
    auf = {"mild|1": [rate, n], "kalt|1": [kalt if kalt is not None else rate, n]}
    if n2 is not None:
        auf.update({"mild|2": [n2, n], "kalt|2": [n2, n]})
    return {"aufheizen": auf}


# ====================================================================== A. Modus und lernende Regelung
async def test_thermo_regelt_lernend_nach_tpi(hass: HomeAssistant, freezer, shellys, nachrichten) -> None:
    """Thermostat + Lernen: statt Hysterese pulst TPI – bei 19,5 °C ≈ 46 % (0,6·0,5 + 0,01·15,5) je 10-min-Zyklus."""
    entry, st = await _einrichten(hass, freezer, shellys)
    hass.states.async_set("sensor.temp_c1", "19.5")
    freezer.move_to(ZEHN_UHR)
    st.einstellung_setzen(("automatik",), True)
    await hass.async_block_till_done()
    lern = _c(hass, entry)["lernen"]
    assert lern["an"] is True and lern["anteil"] in (45, 46) and lern["zyklus_min"] == 10
    uhr = Uhr(hass, freezer, st, ZEHN_UHR)
    zustaende = []
    for _ in range(10):
        await uhr.minute(19.5)
        zustaende.append(_an(hass, "switch.hk1"))
    # Hysterese hätte bei 19,5 (≤ Soll − 0,3) durchgehend geheizt; TPI: etwa die Hälfte des Zyklus ein
    assert 3 <= sum(zustaende) <= 6, zustaende
    assert _c(hass, entry)["modus"] == "thermo"
    # FE-0014: in der Pause des Takts zeigt die Kachel nicht „aus bis …“, sondern die Takt-Pause – seit takt.html
    # verständlich mit Uhrzeit („Pause bis 10:20“ statt „Takt-Pause · lernend 46 % je 10 min“)
    while _an(hass, "switch.hk1"):
        await uhr.minute(19.5)
    c = _c(hass, entry)
    assert c["text"] == f"Pause bis {c['takt']['bis']}" and c["takt"]["phase"] == "pause", c


async def test_takt_bis_stimmt_mit_dem_schalten(hass: HomeAssistant, freezer, shellys, nachrichten) -> None:
    """Mockup takt.html (Variante B): `takt` je Container mit Phase und „bis“ – auch im an-Teil der Runde. „bis“ ist die
    Minute, zu der die Regelung tatsächlich schaltet (tpi_ein mit Mindestlaufzeit, Pause bis zur nächsten Runde)."""
    entry, st = await _einrichten(hass, freezer, shellys)
    hass.states.async_set("sensor.temp_c1", "19.5")
    freezer.move_to(ZEHN_UHR)
    st.einstellung_setzen(("automatik",), True)
    await hass.async_block_till_done()
    uhr = Uhr(hass, freezer, st, ZEHN_UHR)
    gesehen = set()
    for _ in range(25):
        await uhr.minute(19.5)
        c = _c(hass, entry)
        t = c["takt"]
        assert t is not None and t["art"] == "runde" and t["zyklus_min"] == 10 and t["an_min"] + t["aus_min"] == 10
        # 0,6·0,5 + 0,01·15,5 ≈ 46 % (lernt mit: K-Werte, Nachlauf) → je Runde etwa 4½ min an, auf ½ min
        assert 40 <= t["anteil"] <= 55 and t["an_min"] in (4.0, 4.5, 5.0, 5.5) and abs(t["an_min"] - t["anteil"] / 10) <= 0.3
        assert t["phase"] == ("an" if _an(hass, "switch.hk1") else "pause") and t["bis"] is not None
        if t["phase"] == "an":
            assert c["text"].startswith("heizt auf 20,0 °C"), c["text"]     # im an-Teil: Zustandstext wie bisher
        else:
            assert c["text"] == f"Pause bis {t['bis']}"
        gesehen.add(t["phase"])
    assert gesehen == {"an", "pause"}
    # Gegenprobe Minute für Minute: genau zum „bis“ schaltet der Heizkörper
    for _ in range(3):
        t = _c(hass, entry)["takt"]
        vorher = _an(hass, "switch.hk1")
        while uhr.t.strftime("%H:%M") != t["bis"]:
            assert _an(hass, "switch.hk1") == vorher, (uhr.t, t)
            await uhr.minute(19.5)
        assert _an(hass, "switch.hk1") != vorher, (uhr.t, t)


async def test_takt_unterbrochen_ohne_falsches_bis(hass: HomeAssistant, freezer, shellys, nachrichten) -> None:
    """Hält die Staffelung (Mindestpause) den Heizkörper zu Beginn der Runde aus, steht kein „Pause bis …“ da, das nicht
    stimmt; Tür offen: kein Takt (die Tür pausiert, nicht die Regelung)."""
    entry, st = await _einrichten(hass, freezer, shellys)
    st.e["staffel"].update({"an": True, "min_pause_min": 9})
    hass.states.async_set("sensor.temp_c1", "19.5")
    freezer.move_to(ZEHN_UHR)
    st.einstellung_setzen(("automatik",), True)
    await hass.async_block_till_done()
    uhr = Uhr(hass, freezer, st, ZEHN_UHR)
    gewartet = False
    for _ in range(30):
        await uhr.minute(19.5)
        t = _c(hass, entry)["takt"]
        if t["phase"] == "pause" and t["bis"] is None:   # Runde müsste laufen, Mindestpause hält
            gewartet = True
            assert _c(hass, entry)["text"] == "Pause · wartet"
            assert not _an(hass, "switch.hk1")
    assert gewartet
    st.e["staffel"]["an"] = False
    st.einstellungen.bereich(C1)["tuer"] = "binary_sensor.tuer_c1"
    hass.states.async_set("binary_sensor.tuer_c1", "on")
    await uhr.minute(19.5, n=12)
    assert st.daten.grund[C1] == "tuer_offen" and _c(hass, entry)["takt"] is None


async def test_plan_modus_ignoriert_lernende_regelung(hass: HomeAssistant, freezer, shellys, nachrichten) -> None:
    """Modus Zeitplan: in der Heizzeit einfach ein (Thermostat am Heizkörper) – Lernen an ändert das nicht.
    Seit dem Szenario-Befund: im Zeitplan kein TPI-Anteil und kein Lernen."""
    entry, st = await _einrichten(hass, freezer, shellys, modus="plan")
    hass.states.async_set("sensor.temp_c1", "20.5")
    freezer.move_to(ZEHN_UHR)
    st.einstellung_setzen(("automatik",), True)
    await hass.async_block_till_done()
    uhr = Uhr(hass, freezer, st, ZEHN_UHR)
    for _ in range(12):
        await uhr.minute(20.5)
        assert _an(hass, "switch.hk1")       # über dem Soll, trotzdem ein: Plan regelt nicht
    c = _c(hass, entry)
    assert c["modus"] == "plan" and c["lernen"]["warm"] is None    # Warm ab nur im Thermostat
    assert c["lernen"]["anteil"] is None                             # Zeitplan regelt nicht selbst: kein Anteil


async def test_plan_modus_lernt_kein_k_aussen(hass: HomeAssistant, freezer, shellys, nachrichten) -> None:
    entry, st = await _einrichten(hass, freezer, shellys, modus="plan")
    hass.states.async_set("sensor.temp_c1", "20.5")
    freezer.move_to(ZEHN_UHR)
    st.einstellung_setzen(("automatik",), True)
    await hass.async_block_till_done()
    uhr = Uhr(hass, freezer, st, ZEHN_UHR)
    await uhr.minute(20.5, n=25)
    stand = st.lz["lernen"].get(C1, {})
    assert stand.get("n_kext", 0) == 0 and stand.get("kext", 0.01) == 0.01


async def test_bedarf_modus_lernend_nur_bei_bedarf(hass: HomeAssistant, freezer, shellys, nachrichten) -> None:
    """Bei Bedarf + Lernen: ohne Bedarf bereit (aus); mit Bedarf regelt TPI (18 °C → 100 %, 20,4 °C → 0 %)."""
    entry, st = await _einrichten(hass, freezer, shellys, modus="bedarf")
    st.einstellungen.bereich(C1)["bedarf"] = True
    hass.states.async_set("sensor.temp_c1", "18.0")
    freezer.move_to(ZEHN_UHR)
    st.einstellung_setzen(("automatik",), True)
    await hass.async_block_till_done()
    assert not _an(hass, "switch.hk1") and st.daten.grund[C1] == "bereit"
    assert _c(hass, entry)["lernen"]["warm"] is None
    st.lz["bedarf_bis"][C1] = "2026-09-29T12:00:00+02:00"
    await _zu(hass, freezer, "2026-09-29 10:01:00+02:00", st)
    assert _an(hass, "switch.hk1") and st.daten.grund[C1] == "bedarf"
    assert _c(hass, entry)["lernen"]["anteil"] == 100
    hass.states.async_set("sensor.temp_c1", "20.4")
    await _zu(hass, freezer, "2026-09-29 10:02:00+02:00", st)
    assert not _an(hass, "switch.hk1") and _c(hass, entry)["lernen"]["anteil"] == 0


async def test_lernen_ohne_fuehler(hass: HomeAssistant, baustelle, freezer, shellys, ws) -> None:
    """Szenarien, Herbert 01.10.2026: Container 2 hat keinen Fühler – `setzen bereiche.<id>.lernen = true` wird wie
    Thermostat ohne Fühler mit `invalid_format` abgelehnt; der Plan heizt durch, es entsteht kein Lernstand.
    Ausschalten (`false`) geht weiter."""
    st = baustelle.runtime_data
    st.e["staffel"]["an"] = False
    antwort = await ws(baustelle, "baustelle/setzen", pfad=["bereiche", C2, "lernen"], wert=True)
    assert antwort["success"] is False and antwort["error"]["code"] == "invalid_format"
    assert not st.einstellungen.bereich(C2).get("lernen")
    antwort = await ws(baustelle, "baustelle/setzen", pfad=["bereiche", C2, "lernen"], wert=False)
    assert antwort["success"] is True
    freezer.move_to(ZEHN_UHR)
    st.einstellung_setzen(("automatik",), True)
    await hass.async_block_till_done()
    await _zu(hass, freezer, "2026-09-29 10:05:00+02:00", st)
    assert _an(hass, "switch.hk2")
    assert _c(hass, baustelle, C2)["lernen"] is None and C2 not in st.lz["lernen"]
    # Thermostat ohne Fühler wird dagegen abgelehnt
    antwort = await ws(baustelle, "baustelle/setzen", pfad=["bereiche", C2, "modus"], wert="thermo")
    assert antwort["success"] is False and antwort["error"]["code"] == "invalid_format"


async def test_lern_reset_per_aktion(hass: HomeAssistant, freezer, shellys, nachrichten, ws) -> None:
    entry, st = await _einrichten(hass, freezer, shellys)
    st.lz["lernen"][C1] = {"zyklen": 3, "kint": 0.5, "n_kint": 3, "nachlauf": {"oel|lang|kalt": [0.9, 6.0, 3]},
                           "treffer": [1.3, 0.4, 0.1], **_gelernt(3.0)}
    assert _c(hass, entry)["lernen"]["zyklen"] == 3
    antwort = await ws(entry, "baustelle/aktion", aktion="lern_reset", bereich=C1)
    assert antwort["success"] is True
    lern = _c(hass, entry)["lernen"]
    assert lern["zyklen"] == 0 and lern["nachlauf"] == {} and lern["aufheizen"] == {} and lern["kint"]["wert"] == 0.6
    assert lern["an"] is True                                 # Lernen bleibt an, nur der Stand ist neu
    assert "Container 1: Lernstand zurückgesetzt" in _texte(st, "einstellung")
    antwort = await ws(entry, "baustelle/aktion", aktion="lern_reset", bereich="gibt_es_nicht")
    assert antwort["success"] is False and antwort["error"]["code"] == "not_found"


async def test_lern_reset_vergisst_auch_warm_ab(hass: HomeAssistant, freezer, shellys, nachrichten, ws) -> None:
    entry, st = await _einrichten(hass, freezer, shellys, "2026-09-30 05:00:00+02:00")
    st.e["heizung"]["fruehstart"] = False
    st.lz["lernen"][C1] = _gelernt(3.0)
    hass.states.async_set("sensor.temp_c1", "16.0")
    st.einstellung_setzen(("automatik",), True)
    await _zu(hass, freezer, "2026-09-30 05:45:00+02:00", st)      # 80 min vor 07:00 = 05:40 → läuft, fest
    assert st.lz["warm_start"][C1][1] == 80
    await ws(entry, "baustelle/aktion", aktion="lern_reset", bereich=C1)
    warm = _c(hass, entry)["lernen"]["warm"]
    assert warm["gelernt"] is False and warm["geschaetzt"] == 2.5 and warm["plan"]["start"] == 7 * 60 - 100   # AN-0014


# ====================================================================== B. Warm ab (AN-0004)
async def test_warm_ab_ungelernt_alte_regeln_mit_fruehstart(hass: HomeAssistant, freezer, shellys, nachrichten) -> None:
    """Noch nicht gelernt und keine Innentemperatur: Vorheizen 45 min, Kälte-Frühstart 30 min, Nachheizen 15 min."""
    entry, st = await _einrichten(hass, freezer, shellys, "2026-09-30 04:00:00+02:00")
    st.lz["wetter_tage"] = {"2026-09-30": {"frueh": -4.0}}
    hass.states.async_set("sensor.temp_c1", "unavailable")
    st.einstellung_setzen(("automatik",), True)
    await hass.async_block_till_done()
    warm = _c(hass, entry)["lernen"]["warm"]
    assert warm["gelernt"] is False and warm["aufheiz_min"] is None and warm["n"] == 0 and warm["n_noetig"] == 3
    assert warm["geschaetzt"] is None
    assert warm["plan"] == {"start": 375, "ziel": 420, "a": 420, "b": 990, "ende": 1005, "begrenzt": False}
    ab = struktur(hass, entry)["laufzeit"]["abschnitte"][C1]["2026-09-30"]
    assert ab == [[345, 375, "fruehstart"], [375, 420, "vorheizen"], [420, 990, "arbeitszeit"], [990, 1005, "nachheizen"]]


async def test_warm_ab_ungelernt_geschaetzt_aus_der_groesse(hass: HomeAssistant, freezer, shellys, nachrichten, ws) -> None:
    """AN-0014: noch nichts gelernt → Aufheizen aus der Größe geschätzt (Einzel 2,5 °C/h: 16 → 20 °C = 100 min,
    Doppel 28 m² ≈ 1,2 °C/h = 200 min), wie gelernt ohne Kälte-Frühstart; die Größe ist je Container einstellbar."""
    entry, st = await _einrichten(hass, freezer, shellys, "2026-09-30 04:00:00+02:00")
    st.lz["wetter_tage"] = {"2026-09-30": {"frueh": -4.0}}
    st.einstellung_setzen(("heizung", "warm_max_min"), 240)
    hass.states.async_set("sensor.temp_c1", "16.0")
    st.einstellung_setzen(("automatik",), True)
    await hass.async_block_till_done()
    warm = _c(hass, entry)["lernen"]["warm"]
    assert warm["gelernt"] is False and warm["geschaetzt"] == 2.5 and warm["aufheiz_min"] == 100 and warm["plan"]["start"] == 320
    ab = struktur(hass, entry)["laufzeit"]["abschnitte"][C1]["2026-09-30"]
    assert ab[0] == [320, 420, "vorheizen"] and all(x[2] != "fruehstart" for x in ab)
    antwort = await ws(entry, "baustelle/setzen", pfad=["bereiche", C1, "groesse_m2"], wert=28)
    assert antwort["success"] is True
    warm = _c(hass, entry)["lernen"]["warm"]
    assert round(warm["geschaetzt"], 2) == 1.21 and warm["aufheiz_min"] == 200 and warm["plan"]["start"] == 220
    antwort = await ws(entry, "baustelle/setzen", pfad=["bereiche", C1, "groesse_m2"], wert=2)
    assert antwort["success"] is False
    await _zu(hass, freezer, "2026-09-30 04:01:00+02:00", st)
    assert st.lz["warm_start"][C1] == ["2026-09-30", 200, False, True]   # fest, mit Merker „geschätzt“


async def test_warm_ab_gelernt_kein_fruehstart(hass: HomeAssistant, freezer, shellys, nachrichten) -> None:
    """Gelernt (3 °C/h, 16 → 20 °C = 80 min): Beginn 05:40, kein Kälte-Frühstart trotz −4 °C am Morgen; die
    Baustelle (plan_woche) behält den Frühstart für Container ohne Lernen."""
    entry, st = await _einrichten(hass, freezer, shellys, "2026-09-30 04:00:00+02:00")
    st.lz["wetter_tage"] = {"2026-09-30": {"frueh": -4.0}}
    st.lz["lernen"][C1] = _gelernt(3.0)
    hass.states.async_set("sensor.temp_c1", "16.0")
    st.einstellung_setzen(("automatik",), True)
    await hass.async_block_till_done()
    lz = struktur(hass, entry)["laufzeit"]
    warm = lz["container"][C1]["lernen"]["warm"]
    assert warm["gelernt"] is True and warm["aufheiz_min"] == 80 and warm["plan"]["start"] == 340
    ab = lz["abschnitte"][C1]["2026-09-30"]
    assert ab[0] == [340, 420, "vorheizen"] and all(x[2] != "fruehstart" for x in ab)
    assert ab[-1] == [420, 990, "arbeitszeit"]               # warm_nach 0: kein Nachheizen
    mittwoch = next(t for t in lz["plan_woche"] if t["datum"] == "2026-09-30")
    assert mittwoch["plan"]["start"] == 345 and "fruehstart" in mittwoch["plan"]["gruende"]
    await _zu(hass, freezer, "2026-09-30 05:30:00+02:00", st)  # Frühstart der Baustelle läuft – C1 nicht
    assert not _an(hass, "switch.hk1") and st.daten.grund[C1] == "ausserhalb"
    await _zu(hass, freezer, "2026-09-30 05:41:00+02:00", st)
    assert _an(hass, "switch.hk1") and st.daten.grund[C1] == "vorheizen"


async def test_warm_ab_beginn_fest_ueber_sprung_und_neustart(hass: HomeAssistant, freezer, shellys, nachrichten) -> None:
    """Ab dem gelernten Beginn bleibt die Aufheizzeit des Tages fest – auch wenn der Raum schnell wärmer wird und
    die Integration neu geladen wird (Store laufzeit.warm_start)."""
    entry, st = await _einrichten(hass, freezer, shellys, "2026-09-30 05:00:00+02:00")
    st.e["heizung"]["fruehstart"] = False
    st.lz["lernen"][C1] = _gelernt(3.0)
    hass.states.async_set("sensor.temp_c1", "16.0")
    st.einstellung_setzen(("automatik",), True)
    await _zu(hass, freezer, "2026-09-30 05:41:00+02:00", st)
    assert _an(hass, "switch.hk1") and st.lz["warm_start"][C1] == ["2026-09-30", 80, False, False]
    hass.states.async_set("sensor.temp_c1", "18.5")            # ohne Festhalten: 30 min → Beginn erst 06:30
    await _zu(hass, freezer, "2026-09-30 05:50:00+02:00", st)
    assert _an(hass, "switch.hk1") and _c(hass, entry)["lernen"]["warm"]["plan"]["start"] == 340
    # Neustart der Integration
    assert await hass.config_entries.async_reload(entry.entry_id)
    await hass.async_block_till_done()
    st = entry.runtime_data
    await _zu(hass, freezer, "2026-09-30 05:55:00+02:00", st)
    warm = _c(hass, entry)["lernen"]["warm"]
    assert st.automatik and warm["fest"] is True and warm["aufheiz_min"] == 80 and warm["plan"]["start"] == 340
    assert _an(hass, "switch.hk1") and st.daten.grund[C1] == "vorheizen"
    # am nächsten Tag gilt wieder die gelernte Rate mit der Temperatur von dann
    hass.states.async_set("sensor.temp_c1", "17.0")
    await _zu(hass, freezer, "2026-10-01 04:00:00+02:00", st)
    warm = _c(hass, entry)["lernen"]["warm"]
    assert warm["fest"] is False and warm["aufheiz_min"] == 60 and warm["plan"]["start"] == 360


async def test_warm_ab_obergrenze_warm_max(hass: HomeAssistant, freezer, shellys, nachrichten) -> None:
    """1 °C/h, 14 → 20 °C = 360 min; frühestens warm_max (120 min) vor Beginn → 05:00, `begrenzt`."""
    entry, st = await _einrichten(hass, freezer, shellys, "2026-09-30 03:00:00+02:00")
    st.e["heizung"]["fruehstart"] = False
    st.lz["lernen"][C1] = _gelernt(1.0)
    hass.states.async_set("sensor.temp_c1", "14.0")
    st.einstellung_setzen(("automatik",), True)
    await hass.async_block_till_done()
    warm = _c(hass, entry)["lernen"]["warm"]
    assert warm["aufheiz_min"] == 360 and warm["max"] == 120 and warm["plan"]["start"] == 300 and warm["plan"]["begrenzt"] is True
    st.einstellung_setzen(("heizung", "warm_max_min"), 200)
    warm = _c(hass, entry)["lernen"]["warm"]
    assert warm["plan"]["start"] == 220 and warm["plan"]["begrenzt"] is True
    await _zu(hass, freezer, "2026-09-30 03:39:00+02:00", st)
    assert not _an(hass, "switch.hk1")
    await _zu(hass, freezer, "2026-09-30 03:41:00+02:00", st)
    assert _an(hass, "switch.hk1")


async def test_warm_ab_eigener_wert_je_container(hass: HomeAssistant, freezer, shellys, nachrichten) -> None:
    """Zwei lernende Container: eigene Rate (3 bzw. 6 °C/h) und eigenes „Soll erreicht vor Beginn“ (C2: 30 min)."""
    entry, st = await _zwei_fuehler(hass, freezer, shellys, "2026-09-30 04:00:00+02:00")
    st.e["heizung"]["fruehstart"] = False
    st.e["heizung"]["warm_vor_min"] = 10
    for bid in (C1, C2):
        st.einstellungen.bereich(bid)["soll"] = 20.0
        st.einstellungen.bereich(bid)["modus"] = "thermo"
        st.einstellung_setzen(("bereiche", bid, "lernen"), True)
    st.lz["lernen"][C1] = _gelernt(3.0)
    st.lz["lernen"][C2] = _gelernt(6.0)
    hass.states.async_set("sensor.temp_c1", "16.0")
    st.einstellung_setzen(("bereiche", C2, "warm_vor"), 30)
    st.einstellung_setzen(("automatik",), True)
    await hass.async_block_till_done()
    w1, w2 = _c(hass, entry, C1)["lernen"]["warm"], _c(hass, entry, C2)["lernen"]["warm"]
    assert (w1["vor"], w1["vor_eigen"], w1["aufheiz_min"], w1["plan"]["start"]) == (10, False, 80, 330)   # 420 − 10 − 80
    assert (w2["vor"], w2["vor_eigen"], w2["aufheiz_min"], w2["plan"]["start"]) == (30, True, 40, 350)    # 420 − 30 − 40
    ab = struktur(hass, entry)["laufzeit"]["abschnitte"]
    assert ab[C1]["2026-09-30"][0] == [330, 420, "vorheizen"] and ab[C2]["2026-09-30"][0] == [350, 420, "vorheizen"]
    await _zu(hass, freezer, "2026-09-30 05:31:00+02:00", st)
    assert _an(hass, "switch.hk1") and not _an(hass, "switch.hk2")
    await _zu(hass, freezer, "2026-09-30 05:51:00+02:00", st)
    assert _an(hass, "switch.hk1") and _an(hass, "switch.hk2")


async def test_warm_ab_wechsel_mild_kalt_am_morgen(hass: HomeAssistant, freezer, shellys, nachrichten) -> None:
    """Rate je Außenband: mild 4 °C/h, kalt 2 °C/h. Wird es vor dem Beginn kalt, beginnt er früher; ab dem Beginn
    bleibt er fest, auch wenn es wieder mild wird."""
    entry, st = await _einrichten(hass, freezer, shellys, "2026-09-30 04:00:00+02:00")
    st.e["heizung"]["fruehstart"] = False
    st.lz["lernen"][C1] = _gelernt(4.0, kalt=2.0)
    hass.states.async_set("sensor.temp_c1", "16.0")
    hass.states.async_set("sensor.aussen", "6.0")
    st.einstellung_setzen(("automatik",), True)
    await hass.async_block_till_done()
    warm = _c(hass, entry)["lernen"]["warm"]
    assert warm["band"] == "mild" and warm["aufheiz_min"] == 60 and warm["plan"]["start"] == 360
    hass.states.async_set("sensor.aussen", "3.0")
    await _zu(hass, freezer, "2026-09-30 04:30:00+02:00", st)
    warm = _c(hass, entry)["lernen"]["warm"]
    assert warm["band"] == "kalt" and warm["rate"] == 2.0 and warm["aufheiz_min"] == 120 and warm["plan"]["start"] == 300
    assert not _an(hass, "switch.hk1")
    await _zu(hass, freezer, "2026-09-30 05:01:00+02:00", st)
    assert _an(hass, "switch.hk1") and st.lz["warm_start"][C1] == ["2026-09-30", 120, False, False]
    hass.states.async_set("sensor.aussen", "8.0")
    await _zu(hass, freezer, "2026-09-30 05:10:00+02:00", st)
    warm = _c(hass, entry)["lernen"]["warm"]
    assert warm["band"] == "mild" and warm["aufheiz_min"] == 120 and warm["plan"]["start"] == 300
    assert _an(hass, "switch.hk1")


async def test_fruehstart_nachricht_nennt_beginn_des_lernenden_containers(hass: HomeAssistant, freezer, shellys, nachrichten) -> None:
    """Szenarien, Herbert 01.10.2026: die Vorabend-Nachricht nennt den frühesten Beginn aller Container (auto, nicht
    Bei Bedarf), auch gelernte. Alle Heizkörper im lernenden Container 1 (gelernt, ohne Kälte-Frühstart 06:20),
    Container 2 (leer) auf Bei Bedarf zählt nicht → „06:20“ statt des Baustellen-Plans 05:45."""
    entry, st = await _einrichten(hass, freezer, shellys, "2026-09-29 17:00:00+02:00", hk2_bereich=C1)
    st.einstellungen.bereich(C2)["bedarf"] = True
    st.lz["lernen"][C1] = _gelernt(3.0, n2=6.0)
    st.lz["wetter_tage"] = {"2026-09-30": {"frueh": -4.0}}
    hass.states.async_set("sensor.temp_c1", "16.0")
    st.einstellung_setzen(("automatik",), True)
    freezer.move_to("2026-09-29 18:00:00+02:00")
    st._takt(dt_util.now())  # noqa: SLF001
    await hass.async_block_till_done()
    plan = st.funktion("heizung").plan_bereich(datetime(2026, 9, 30).date(), C1)
    assert plan.start == plan.vor == 7 * 60 - 40 and "fruehstart" not in plan.gruende   # 2 Heizkörper: 4 °C / 6 °C/h = 40 min
    frueh = [x for x in nachrichten if x.data["title"].startswith("❄")]
    assert len(frueh) == 1
    assert "Vorheizen startet schon um 06:20" in frueh[0].data["message"] and "05:45" not in frueh[0].data["message"]
    assert "Noch früher (05:50)" in str(frueh[0].data)


async def test_fruehstart_nachricht_lernender_container_frueher_als_plan(hass: HomeAssistant, freezer, shellys, nachrichten) -> None:
    """Szenarien, Herbert 01.10.2026: beginnt ein gelernter Container früher als der Baustellen-Plan (langsam: 2 °C/h,
    16 → 20 °C = 120 min → 05:00), nennt die Nachricht diesen Beginn; Container 2 (Plan, 05:45) ist später."""
    entry, st = await _einrichten(hass, freezer, shellys, "2026-09-29 17:00:00+02:00")
    st.lz["lernen"][C1] = _gelernt(2.0)
    st.lz["wetter_tage"] = {"2026-09-30": {"frueh": -4.0}}
    hass.states.async_set("sensor.temp_c1", "16.0")
    st.einstellung_setzen(("automatik",), True)
    freezer.move_to("2026-09-29 18:00:00+02:00")
    st._takt(dt_util.now())  # noqa: SLF001
    await hass.async_block_till_done()
    assert st.funktion("heizung").plan_bereich(datetime(2026, 9, 30).date(), C1).start == 7 * 60 - 120
    frueh = [x for x in nachrichten if x.data["title"].startswith("❄")]
    assert len(frueh) == 1 and "Vorheizen startet schon um 05:00" in frueh[0].data["message"]


# ====================================================================== C. Warm ab + Zusatz nur bei Bedarf (AN-0006)
async def _stufen(hass, freezer, shellys, zeit: str, stand: dict):
    entry, st = await _einrichten(hass, freezer, shellys, zeit, hk2_bereich=C1)
    st.e["heizung"]["fruehstart"] = False
    st.einstellung_setzen(("bereiche", C1, "stufen"), True)
    st.lz["lernen"][C1] = stand
    hass.states.async_set("sensor.temp_c1", "16.0")
    hass.states.async_set("sensor.aussen", "6.0")
    st.einstellung_setzen(("automatik",), True)
    await hass.async_block_till_done()
    return entry, st


async def test_warm_ab_zusatz_einer_reicht(hass: HomeAssistant, freezer, shellys, nachrichten) -> None:
    """Einer schafft es in 80 min (≤ warm_max 120): Beginn nach der Rate mit einem Heizkörper, nur der Haupt heizt."""
    entry, st = await _stufen(hass, freezer, shellys, "2026-09-30 04:00:00+02:00", _gelernt(3.0, n2=6.0))
    warm = _c(hass, entry)["lernen"]["warm"]
    assert warm["anzahl"] == 1 and warm["aufheiz_min"] == 80 and warm["plan"]["start"] == 340
    await _zu(hass, freezer, "2026-09-30 05:41:00+02:00", st)
    assert _an(hass, "switch.hk1") and not _an(hass, "switch.hk2")
    s = _c(hass, entry)["stufen"]
    assert s["zusatz_an"] is False and st.lz["warm_start"][C1] == ["2026-09-30", 80, False, False]


async def test_warm_ab_zusatz_reicht_nicht(hass: HomeAssistant, freezer, shellys, nachrichten) -> None:
    """Einer bräuchte 160 min (> 120): Beginn nach der Rate mit beiden (60 min, 06:00), im Vorheizen beide mit Grund
    „gelernt“; in der Arbeitszeit der Zusatz nur noch bei Bedarf."""
    entry, st = await _stufen(hass, freezer, shellys, "2026-09-30 04:00:00+02:00", _gelernt(1.5, n2=4.0))
    warm = _c(hass, entry)["lernen"]["warm"]
    assert warm["anzahl"] == 2 and warm["aufheiz_min"] == 60 and warm["plan"]["start"] == 360
    await _zu(hass, freezer, "2026-09-30 05:59:00+02:00", st)
    assert not _an(hass, "switch.hk1") and not _an(hass, "switch.hk2")
    await _zu(hass, freezer, "2026-09-30 06:01:00+02:00", st)
    assert _an(hass, "switch.hk1") and _an(hass, "switch.hk2")
    s = _c(hass, entry)["stufen"]
    assert s["zusatz_an"] is True and s["grund"] == "gelernt" and st.lz["warm_start"][C1] == ["2026-09-30", 60, True, False]
    assert any("Zusatz-Heizkörper dazu" in t for t in _texte(st, "schalten"))
    # Arbeitszeit, fast warm: Zusatz wieder aus, der Haupt regelt allein
    hass.states.async_set("sensor.temp_c1", "19.7")
    await _zu(hass, freezer, "2026-09-30 07:05:00+02:00", st)
    assert not _an(hass, "switch.hk2") and _c(hass, entry)["stufen"]["zusatz_an"] is False
    # weit unter dem Soll: Zusatz wieder dazu (Grund weit_unter, nicht mehr gelernt)
    hass.states.async_set("sensor.temp_c1", "18.0")
    await _zu(hass, freezer, "2026-09-30 07:06:00+02:00", st)
    assert _an(hass, "switch.hk2") and _c(hass, entry)["stufen"]["grund"] == "weit_unter"


# ====================================================================== D. Aufheizen lernen, Tür offen
async def test_aufheizen_lernt_je_anzahl_heizkoerper(hass: HomeAssistant, freezer, shellys, nachrichten) -> None:
    """Erst heizt nur der Haupt (mild|1), dann kommt bei Kälte der Zusatz dazu: die erste Messung wird abgeschlossen,
    eine neue mit zwei Heizkörpern (kalt|2) beginnt."""
    entry, st = await _einrichten(hass, freezer, shellys, hk2_bereich=C1)
    st.einstellung_setzen(("bereiche", C1, "stufen"), True)
    st.lz["lernen"][C1] = {"kext": 0.05}       # K außen hoch: TPI bleibt bis knapp unter dem Soll ganz ein
    hass.states.async_set("sensor.aussen", "6.0")
    hass.states.async_set("sensor.temp_c1", "18.5")
    freezer.move_to(ZEHN_UHR)
    st.einstellung_setzen(("automatik",), True)
    await hass.async_block_till_done()
    uhr = Uhr(hass, freezer, st, ZEHN_UHR)
    for i in range(25):                          # 18,5 → 19,0 in 25 min mit einem Heizkörper
        await uhr.minute(round(18.5 + 0.02 * i, 2))
        assert _an(hass, "switch.hk1") and not _an(hass, "switch.hk2"), i
    assert st.lz["lernen"][C1]["auf"]["n"] == 1
    hass.states.async_set("sensor.aussen", "-6.0")   # außergewöhnlich kalt: Zusatz dazu
    await uhr.minute(19.0)
    await uhr.minute(19.0)
    assert _an(hass, "switch.hk2")
    stand = st.lz["lernen"][C1]
    assert "mild|1" in stand["aufheizen"] and stand["aufheizen"]["mild|1"][1] == 1
    assert stand["auf"] is not None and stand["auf"]["n"] == 2 and stand["auf"]["band"] == "kalt"
    for i in range(1, 21):                        # 19,0 → 19,8 in 20 min mit zweien
        await uhr.minute(round(19.0 + 0.04 * i, 2))
    stand = st.lz["lernen"][C1]
    assert "kalt|2" in stand["aufheizen"], stand["aufheizen"]
    lern = _c(hass, entry)["lernen"]
    assert set(lern["aufheizen"]) == {"mild|1", "kalt|2"} and lern["auf_n"] == 3


async def test_tuer_vermutet_offen_dann_weiter_lernen(hass: HomeAssistant, freezer, shellys, nachrichten) -> None:
    """WU-0009: Tür vermutlich offen verwirft die Messung; ist der Raum wieder wärmer und die Ruhezeit vorbei, lernt
    der Container weiter (neue Aufheiz-Messung bis zum Ende)."""
    entry, st = await _einrichten(hass, freezer, shellys)
    st.lz["lernen"][C1] = {"kext": 0.05}
    hass.states.async_set("sensor.aussen", "5.0")
    freezer.move_to(ZEHN_UHR)
    st.einstellung_setzen(("automatik",), True)
    await hass.async_block_till_done()
    uhr = Uhr(hass, freezer, st, ZEHN_UHR)
    for i in range(5):
        await uhr.minute(16.0 + 0.05 * i)
    assert st.lz["lernen"][C1]["auf"] is not None
    for i in range(12):
        await uhr.minute(round(16.2 - 0.04 * i, 2))
    stand = st.lz["lernen"][C1]
    assert stand["offen"]["art"] == "vermutet" and stand["auf"] is None and stand["aufheizen"] == {}
    assert not _an(hass, "switch.hk1")                    # FE-0025: Heizung pausiert 10 min
    # Tür zu: Raum wird wieder wärmer
    temp = 15.8
    for _ in range(22):   # FE-0025: 10 min Pause, danach 10 min Ruhe
        temp = round(temp + 0.05, 2)
        await uhr.minute(temp)
    stand = st.lz["lernen"][C1]
    assert stand["offen"] is None
    assert "Raum wird wieder wärmer – die lernende Regelung lernt weiter" in _texte(st, "ok")
    assert stand["auf"] is not None                       # neue Messung läuft
    for _ in range(25):
        temp = round(temp + 0.05, 2)
        await uhr.minute(temp)
    await uhr.minute(19.85)                               # Soll − 0,2 erreicht: Messung fertig
    stand = st.lz["lernen"][C1]
    assert stand["aufheizen"].get("mild|1", [0, 0])[1] == 1, stand["aufheizen"]
    assert _c(hass, entry)["lernen"]["offen"] is None


async def test_tuerkontakt_pausiert_lernt_keinen_nachlauf(hass: HomeAssistant, freezer, shellys, nachrichten) -> None:
    """Türkontakt offen: Heizung pausiert nach 3 min – das Ausschalten wegen der Tür ist kein Nachlauf; nach dem
    Schließen und der Ruhezeit ist `offen` wieder leer."""
    entry, st = await _einrichten(hass, freezer, shellys)
    st.einstellungen.bereich(C1)["tuer"] = "binary_sensor.tuer_c1"
    hass.states.async_set("binary_sensor.tuer_c1", "off")
    freezer.move_to(ZEHN_UHR)
    st.einstellung_setzen(("automatik",), True)
    await hass.async_block_till_done()
    uhr = Uhr(hass, freezer, st, ZEHN_UHR)
    await uhr.minute(19.3, n=30)                  # nahe am Soll heizen
    hass.states.async_set("binary_sensor.tuer_c1", "on")
    await uhr.minute(19.3, n=5)
    assert not _an(hass, "switch.hk1") and st.daten.grund[C1] == "tuer_offen"
    assert st.lz["lernen"][C1]["offen"]["art"] == "kontakt"
    await uhr.minute(19.6, n=3)
    hass.states.async_set("binary_sensor.tuer_c1", "off")
    await uhr.minute(19.5, n=3)
    assert st.lz["lernen"][C1]["offen"] is not None       # Ruhezeit läuft
    await uhr.minute(19.5, n=10)
    stand = st.lz["lernen"][C1]
    assert stand["offen"] is None and stand["nachlauf"] == {} and stand["zyklen"] == 0 and stand["n_kint"] == 0


# ====================================================================== E. Hand, Schnell aufheizen, jetzt heizen, Termin
async def test_hand_waehrend_lernen(hass: HomeAssistant, freezer, shellys, nachrichten) -> None:
    """Szenarien, Herbert 01.10.2026: von Hand wird nichts gelernt – Heizkörper von Hand ein (außerhalb der Heizzeit)
    und von Hand aus: kein K außen, kein Nachlauf, kein K innen, keine Aufheizrate; laufende Messungen verworfen."""
    entry, st = await _einrichten(hass, freezer, shellys, "2026-09-29 19:00:00+02:00")
    hass.states.async_set("sensor.aussen", "6.0")
    hass.states.async_set("sensor.temp_c1", "19.6")
    st.einstellung_setzen(("automatik",), True)
    await hass.async_block_till_done()
    uhr = Uhr(hass, freezer, st, "2026-09-29 19:00:00+02:00")
    hass.states.async_set("sensor.hk1_power", "2000")
    hass.states.async_set("switch.hk1", "on", context=Context(user_id="nutzer"))
    await hass.async_block_till_done()
    assert HK1 in st.lz["hand"]
    for temp in (19.6, 19.65, 19.7, 19.75, 19.8, 19.85, 19.9):
        await uhr.minute(temp)
    assert _an(hass, "switch.hk1") and HK1 in st.lz["hand"]
    hass.states.async_set("sensor.hk1_power", "0")
    hass.states.async_set("switch.hk1", "off", context=Context(user_id="nutzer"))
    await hass.async_block_till_done()
    for temp in (20.1, 20.3, 20.5, 20.6, 20.5, 20.3):
        await uhr.minute(temp)
    stand = st.lz["lernen"][C1]
    assert stand["n_kext"] == 0                           # K außen: nicht gelernt (OK)
    assert stand["zyklen"] == 0 and stand["n_kint"] == 0 and stand["nachlauf"] == {}
    assert stand["beob"] is None and stand["auf"] is None and stand["zyklus"] is None
    assert stand["kint"] == 0.6 and stand["aufheizen"] == {}


async def test_schnell_aufheizen_waehrend_lernen(hass: HomeAssistant, freezer, shellys, nachrichten, ws) -> None:
    """Schnell aufheizen geht vor TPI: durchgehend ein bis zum Soll, danach regelt wieder TPI; K außen lernt währenddessen nicht."""
    entry, st = await _einrichten(hass, freezer, shellys)
    hass.states.async_set("sensor.temp_c1", "19.5")
    freezer.move_to(ZEHN_UHR)
    st.einstellung_setzen(("automatik",), True)
    await hass.async_block_till_done()
    antwort = await ws(entry, "baustelle/aktion", aktion="boost", bereich=C1, an=True)
    assert antwort["success"] is True
    uhr = Uhr(hass, freezer, st, ZEHN_UHR)
    for _ in range(12):                                   # TPI wäre bei 19,5 nur ~46 % ein
        await uhr.minute(19.5)
        assert _an(hass, "switch.hk1") and st.daten.grund[C1] == "boost"
    assert st.lz["lernen"][C1]["n_kext"] == 0
    await uhr.minute(20.0)                                # Soll erreicht: Boost beendet
    assert C1 not in st.lz["boost_bis"]
    await uhr.minute(20.2, n=2)
    assert not _an(hass, "switch.hk1") and st.daten.grund[C1] == "arbeitszeit"


async def test_schnell_aufheizen_ende_lernt_kein_kint(hass: HomeAssistant, freezer, shellys, nachrichten, ws) -> None:
    """Szenarien, Herbert 01.10.2026: das Ausschalten am Ende von „Schnell aufheizen“ lernt den Nachlauf, aber kein
    K innen (die Regelung hat nicht ausgeschaltet)."""
    entry, st = await _einrichten(hass, freezer, shellys)
    hass.states.async_set("sensor.temp_c1", "19.5")
    freezer.move_to(ZEHN_UHR)
    st.einstellung_setzen(("automatik",), True)
    await hass.async_block_till_done()
    assert (await ws(entry, "baustelle/aktion", aktion="boost", bereich=C1, an=True))["success"] is True
    uhr = Uhr(hass, freezer, st, ZEHN_UHR)
    await uhr.minute(19.5, n=12)
    await uhr.minute(20.0)                                # Soll erreicht: Boost beendet, Heizkörper aus
    assert not _an(hass, "switch.hk1") and C1 not in st.lz["boost_bis"]
    await uhr.minute(20.2)
    assert st.lz["lernen"][C1]["beob"]["kint"] is False
    for temp in (20.4, 20.5, 20.5, 20.4, 20.3, 20.2):     # Nachlauf: Spitze 20,5, danach 0,2 °C darunter
        await uhr.minute(temp)
    stand = st.lz["lernen"][C1]
    assert stand["beob"] is None and stand["zyklen"] == 1 and stand["nachlauf"] != {}
    assert stand["n_kint"] == 0 and stand["kint"] == 0.6


async def test_jetzt_heizen_mit_lernender_regelung(hass: HomeAssistant, freezer, shellys, nachrichten, ws) -> None:
    """„Alle jetzt heizen“ außerhalb der Heizzeit: der lernende Container regelt dabei weiter selbst (TPI)."""
    entry, st = await _einrichten(hass, freezer, shellys, "2026-09-29 19:00:00+02:00")
    hass.states.async_set("sensor.temp_c1", "18.0")
    st.einstellung_setzen(("automatik",), True)
    await hass.async_block_till_done()
    assert not _an(hass, "switch.hk1")
    antwort = await ws(entry, "baustelle/aktion", aktion="jetzt_heizen", minuten=60)
    assert antwort["success"] is True
    assert _an(hass, "switch.hk1") and st.daten.grund[C1] == "arbeitszeit" and _an(hass, "switch.hk2")
    hass.states.async_set("sensor.temp_c1", "20.5")
    await _zu(hass, freezer, "2026-09-29 19:05:00+02:00", st)
    assert not _an(hass, "switch.hk1") and _an(hass, "switch.hk2")   # C1 regelt, C2 (ohne Fühler) läuft
    assert _c(hass, entry)["lernen"]["anteil"] == 0
    await _zu(hass, freezer, "2026-09-29 20:01:00+02:00", st)
    assert st.lz["jetzt_bis"] is None and not _an(hass, "switch.hk2")


def _kalender(hass, events: dict[str, list[dict]]) -> None:
    async def get_events(call: ServiceCall):
        ids = call.data["entity_id"]
        return {e: {"events": events.get(e, [])} for e in ([ids] if isinstance(ids, str) else ids)}

    hass.services.async_register("calendar", "get_events", get_events, supports_response=SupportsResponse.ONLY)
    for entity_id in events:
        hass.states.async_set(entity_id, "off")


async def test_termin_bei_bedarf_container_mit_lernen(hass: HomeAssistant, freezer, shellys, nachrichten) -> None:
    """Bedarfs-Container mit Lernen: Termin 11–12 Uhr, Vorheizen fest 45 min (kein Warm ab), im Fenster regelt TPI."""
    _kalender(hass, {"calendar.termine": [
        {"start": "2026-09-29T11:00:00+02:00", "end": "2026-09-29T12:00:00+02:00", "summary": "Besprechung",
         "description": f"baustelle:{C1}"},
    ]})
    entry, st = await _einrichten(hass, freezer, shellys, modus="bedarf")
    st.einstellungen.bereich(C1)["bedarf"] = True
    st.lz["lernen"][C1] = _gelernt(3.0)
    hass.states.async_set("sensor.temp_c1", "17.0")
    freezer.move_to(ZEHN_UHR)
    st.einstellung_setzen(("termine_kalender",), "calendar.termine")
    st.einstellung_setzen(("automatik",), True)
    await hass.async_block_till_done()
    assert not _an(hass, "switch.hk1") and st.daten.grund[C1] == "bereit"
    lz = struktur(hass, entry)["laufzeit"]
    assert lz["abschnitte"][C1]["2026-09-29"] == [[615, 660, "vorheizen"], [660, 720, "termin"]]
    assert lz["container"][C1]["lernen"]["warm"] is None
    await _zu(hass, freezer, "2026-09-29 10:16:00+02:00", st)
    assert _an(hass, "switch.hk1") and st.daten.grund[C1] == "bedarf"
    hass.states.async_set("sensor.temp_c1", "20.5")
    await _zu(hass, freezer, "2026-09-29 11:30:00+02:00", st)
    assert not _an(hass, "switch.hk1") and st.daten.grund[C1] == "bedarf"
    await _zu(hass, freezer, "2026-09-29 12:01:00+02:00", st)
    assert st.daten.grund[C1] == "bereit"


# ====================================================================== F. Plan: Mitternacht, Woche, Ausnahme
def _ausnahme(st, datum: str, von: str, bis: str, art: str = "zeiten") -> None:
    st.e["ausnahmen"].append({"datum": datum, "art": art, "von": von, "bis": bis, "notiz": ""})
    st.funktion("heizung").plan_neu()


async def test_plan_ueber_mitternacht_endet_um_24_uhr(hass: HomeAssistant, freezer, shellys, nachrichten) -> None:
    """Ausnahme bis 23:50 mit warm halten 60 min: der Plan endet um 24:00, am nächsten Tag wird nicht weitergeheizt."""
    entry, st = await _einrichten(hass, freezer, shellys, "2026-09-30 22:00:00+02:00")
    st.e["heizung"]["warm_nach_min"] = 60
    st.lz["lernen"][C1] = _gelernt(3.0)
    _ausnahme(st, "2026-09-30", "15:00", "23:50")
    hass.states.async_set("sensor.temp_c1", "18.0")
    st.einstellung_setzen(("automatik",), True)
    await hass.async_block_till_done()
    warm = _c(hass, entry)["lernen"]["warm"]
    assert warm["plan"]["b"] == 1430 and warm["plan"]["ende"] == 1440
    ab = struktur(hass, entry)["laufzeit"]["abschnitte"][C1]["2026-09-30"]
    assert ab[-1] == [1430, 1440, "nachheizen"]
    await _zu(hass, freezer, "2026-09-30 23:55:00+02:00", st)
    assert _an(hass, "switch.hk1") and st.daten.grund[C1] == "nachheizen"
    await _zu(hass, freezer, "2026-10-01 00:01:00+02:00", st)
    assert not _an(hass, "switch.hk1") and st.daten.grund[C1] == "ausserhalb"


async def test_plan_wochenwechsel(hass: HomeAssistant, freezer, shellys, nachrichten) -> None:
    """Sonntag → Montag: plan_woche/abschnitte springen auf die neue Woche; ein festgehaltener Beginn von Freitag
    gilt am Montag nicht; Container 1 zeigt am Sonntagabend den gelernten Beginn von Montag."""
    entry, st = await _einrichten(hass, freezer, shellys, "2026-10-04 23:00:00+02:00")
    st.e["heizung"]["fruehstart"] = False
    st.lz["lernen"][C1] = _gelernt(3.0)
    st.lz["warm_start"][C1] = ["2026-10-02", 200, False]
    hass.states.async_set("sensor.temp_c1", "16.0")
    st.einstellung_setzen(("automatik",), True)
    await _zu(hass, freezer, "2026-10-04 23:59:00+02:00", st)
    lz = struktur(hass, entry)["laufzeit"]
    assert [t["datum"] for t in lz["plan_woche"]][0] == "2026-09-28" and lz["plan_woche"][-1]["datum"] == "2026-10-04"
    assert lz["plan_woche"][-1]["plan"] is None                           # Sonntag frei
    assert st.daten.text[C1] == "aus bis 05:40"
    await _zu(hass, freezer, "2026-10-05 00:01:00+02:00", st)
    lz = struktur(hass, entry)["laufzeit"]
    assert [t["datum"] for t in lz["plan_woche"]] == [f"2026-10-{d:02d}" for d in range(5, 12)]
    assert sorted(lz["abschnitte"][C1]) == [f"2026-10-{d:02d}" for d in range(5, 12)]
    assert lz["abschnitte"][C1]["2026-10-05"][0] == [340, 420, "vorheizen"]
    assert lz["container"][C1]["lernen"]["warm"]["aufheiz_min"] == 80     # nicht 200 vom Freitag
    await _zu(hass, freezer, "2026-10-05 05:41:00+02:00", st)
    assert _an(hass, "switch.hk1") and st.lz["warm_start"][C1] == ["2026-10-05", 80, False, False]


async def test_ausnahme_heute_laenger_mit_warm_nach(hass: HomeAssistant, freezer, shellys, nachrichten) -> None:
    """Heute bis 19:00: der lernende Container hält danach warm_nach warm (Baustelle 30, eigener Wert 10 min);
    der Plan der Baustelle nimmt das Nachheizen (15 min)."""
    entry, st = await _einrichten(hass, freezer, shellys, "2026-09-30 12:00:00+02:00")
    st.e["heizung"]["warm_nach_min"] = 30
    st.lz["lernen"][C1] = _gelernt(3.0)
    _ausnahme(st, "2026-09-30", "07:00", "19:00")
    hass.states.async_set("sensor.temp_c1", "18.0")
    st.einstellung_setzen(("automatik",), True)
    await hass.async_block_till_done()
    lz = struktur(hass, entry)["laufzeit"]
    warm = lz["container"][C1]["lernen"]["warm"]
    assert warm["plan"]["b"] == 1140 and warm["plan"]["ende"] == 1170 and warm["nach"] == 30
    mittwoch = next(t for t in lz["plan_woche"] if t["datum"] == "2026-09-30")
    assert mittwoch["plan"]["b"] == 1140 and mittwoch["plan"]["nach"] == 1155 and mittwoch["plan"]["ausnahme"]["art"] == "zeiten"
    assert lz["abschnitte"][C1]["2026-09-30"][-1] == [1140, 1170, "nachheizen"]
    await _zu(hass, freezer, "2026-09-30 19:20:00+02:00", st)
    assert _an(hass, "switch.hk1") and st.daten.grund[C1] == "nachheizen"
    st.einstellung_setzen(("bereiche", C1, "warm_nach"), 10)
    await hass.async_block_till_done()
    warm = _c(hass, entry)["lernen"]["warm"]
    assert warm["nach"] == 10 and warm["nach_eigen"] is True and warm["plan"]["ende"] == 1150
    assert not _an(hass, "switch.hk1") and st.daten.grund[C1] == "ausserhalb"


async def test_eingestellt_im_kopf(hass: HomeAssistant, freezer, shellys, nachrichten) -> None:
    """Eingestellt (Mockup eingestellt.html C): die Integration liefert je Container, was an ist und gilt – lernend ohne
    Vorheizen/Nachheizen/Kälte-Frühstart, Zusatz erst ab zwei Heizkörpern, im Modus Hand gedämpft mit Grund; der
    Pumpenschacht hat keine Liste."""
    entry, st = await _einrichten(hass, freezer, shellys, hk2_bereich=C1)
    st.einstellung_setzen(("bereiche", C1, "stufen"), True)
    st.einstellung_setzen(("bereiche", C1, "warm_vor"), 30)
    st.einstellung_setzen(("automatik",), True)
    await hass.async_block_till_done()
    L = _c(hass, entry)["eingestellt"]
    ks = [x["k"] for x in L]
    assert ks[:3] == ["lernen", "warm", "stufen"] and "frost" in ks and not {"vorheizen", "nachheizen", "fruehstart"} & set(ks)
    assert all(x["wirkt"] for x in L) and next(x for x in L if x["k"] == "warm")["text"] == "warm 30 min vor Beginn"
    stufen = next(x for x in L if x["k"] == "stufen")
    assert stufen["von"] == "container" and stufen["ziel"] == "bearbeiten:stufen" and "Primärheizkörper (" in stufen["satz"]
    assert _c(hass, entry, SCHACHT)["eingestellt"] is None
    st.einstellungen.bereich(C1)["modus"] = "hand"
    L = _c(hass, entry)["eingestellt"]
    assert [x["k"] for x in L] == ks and {x["k"] for x in L if x["wirkt"]} <= {"frost", "tuer", "notprogramm"} and "frost" in ks and all(x["grund"].startswith("Gerade ohne Wirkung: im Modus Hand") for x in L if not x["wirkt"])
    st.einstellung_setzen(("bereiche", C1, "lernen"), False)
    st.einstellungen.bereich(C1)["modus"] = "plan"
    await hass.async_block_till_done()
    ks = [x["k"] for x in _c(hass, entry)["eingestellt"]]
    assert "lernen" not in ks and {"vorheizen", "nachheizen"} <= set(ks)
