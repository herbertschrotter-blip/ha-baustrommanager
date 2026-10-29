"""Steuerung gegen Home Assistant (0.7): Regelung und Staffelung Ende-zu-Ende mit Fake-Shellys, Tür, Hand,
Heizgrenze, Frost, Feiertag, Termine, Warnungen mit Handy-Knöpfen, Frühstart-Nachricht, Bericht-Termin."""

from datetime import date, datetime, timedelta

import pytest

from homeassistant.core import Context, HomeAssistant, ServiceCall, SupportsResponse
from homeassistant.helpers import device_registry as dr, entity_registry as er
from homeassistant.util import dt as dt_util
from pytest_homeassistant_custom_component.common import MockConfigEntry, async_fire_time_changed

from custom_components.baustelle.const import DOMAIN
from custom_components.baustelle.daten import struktur
from custom_components.baustelle.funktionen.heizung import Heizung
from custom_components.baustelle.steuerung import _sensor_am_geraet

from .conftest import C1, C2, HK1, HK2, P1, SCHACHT, baustelle_anlegen, eid, sub

ZEHN_UHR = "2026-09-29 10:00:00+02:00"  # Dienstag, Arbeitszeit 07:00–16:30


async def _zu(hass, freezer, zeit: str, st) -> None:
    freezer.move_to(zeit)
    st.auswerten()
    await hass.async_block_till_done()


def _texte(st, art: str | None = None) -> list[str]:
    return [p[3] for p in st.e["protokoll"] if art is None or p[1] == art]


async def _knopf(hass, st, befehl: str, wert: str) -> None:
    hass.bus.async_fire(
        "mobile_app_notification_action", {"action": f"BAUSTELLE|{st.entry.entry_id}|{befehl}|{wert}"}
    )
    await hass.async_block_till_done()


# ---------------------------------------------------------------------- Entitäten
async def test_entitaeten_nur_automatik_und_sensoren(hass: HomeAssistant, baustelle, shellys) -> None:
    st = baustelle.runtime_data
    assert shellys.aufrufe == []
    assert hass.states.get(eid(hass, "sensor", f"{baustelle.entry_id}_status")).state == "automatik_aus"
    assert hass.states.get(eid(hass, "switch", f"{baustelle.entry_id}_automatik")).state == "off"
    assert hass.states.get(eid(hass, "sensor", f"{baustelle.entry_id}_leistung")).state == "760.0"
    assert hass.states.get(eid(hass, "sensor", f"{C1}_grund")).state == "automatik_aus"
    plattformen = {e.domain for e in er.async_entries_for_config_entry(er.async_get(hass), baustelle.entry_id)}
    assert plattformen == {"sensor", "binary_sensor", "switch"}
    schalter = [e for e in er.async_entries_for_config_entry(er.async_get(hass), baustelle.entry_id) if e.domain == "switch"]
    assert [e.unique_id for e in schalter] == [f"{baustelle.entry_id}_automatik"]
    assert st.daten.status_text == "Handbetrieb – nichts wird geschaltet"


async def test_verwaiste_einstellungs_entitaeten_werden_entfernt(hass: HomeAssistant, freezer, shellys, nachrichten) -> None:
    entry = await baustelle_anlegen(hass, freezer)
    reg = er.async_get(hass)
    alt = [
        ("time", f"{entry.entry_id}_di_ein"), ("number", f"{entry.entry_id}_heizgrenze"),
        ("select", f"{C1}_modus"), ("button", f"{entry.entry_id}_test_meldung"),
        ("switch", f"{entry.entry_id}_mo_aktiv"), ("switch", f"{C2}_kleidung_trocknen"),
    ]
    for domain, uid in alt:
        reg.async_get_or_create(domain, DOMAIN, uid, config_entry=entry)
    reg.async_get_or_create("switch", DOMAIN, f"{entry.entry_id}_automatik", config_entry=entry)
    assert await hass.config_entries.async_setup(entry.entry_id)
    await hass.async_block_till_done()
    for domain, uid in alt:
        assert reg.async_get_entity_id(domain, DOMAIN, uid) is None, uid
    assert reg.async_get_entity_id("switch", DOMAIN, f"{entry.entry_id}_automatik") is not None


# ---------------------------------------------------------------------- Regelung + Staffelung
async def test_regelung_und_staffelung_ende_zu_ende(hass: HomeAssistant, baustelle, freezer, shellys) -> None:
    st = baustelle.runtime_data
    # ein Anschluss 20 A Schuko: 20 · 230 · 67 % = 3,08 kW, Pumpe 0,76 kW → Platz für genau einen Heizkörper
    st.e["anschluesse"][0].update(ampere=20, phasen=1, reserve_kw=0.0)
    freezer.move_to(ZEHN_UHR)
    st.einstellung_setzen(("automatik",), True)
    await hass.async_block_till_done()
    assert shellys.ein() == ["switch.hk1"]  # größtes Defizit zuerst (19,0 °C bei Soll 20 °C)
    lz = struktur(hass, baustelle)["laufzeit"]
    # sobald Heizkörper 1 läuft, wartet Heizkörper 2 auf den Rundlauf (Mockup „wartet – dran in … min“)
    assert lz["geraete"][HK2]["warte"] == {"grund": "rundlauf", "dran_in_min": 15}
    assert lz["container"][C1]["zustand"] == "heizt" and lz["container"][C1]["grund"] == "arbeitszeit"
    assert lz["staffel"]["laufen"] == 1 and lz["staffel"]["warten"] == 1
    a = lz["staffel"]["anschluesse"][0]
    assert a["grenze_kw"] == pytest.approx(3.082, abs=0.001) and a["pumpe_kw"] == pytest.approx(0.76)
    assert "Arbeitszeit – Heizkörper 1 ein" in _texte(st, "schalten")
    assert "Staffelung: Heizkörper 2 wartet (Anschluss voll)" in _texte(st, "schalten")
    assert "Staffelung: Heizkörper 2 wartet (Rundlauf 15 min)" in _texte(st, "schalten")
    assert st.daten.status == "heizt" and st.daten.status_text == "♨ heizt bis 16:45"
    # Rundlauf nach 15 min: Heizkörper 1 macht Platz für Heizkörper 2
    freezer.tick(timedelta(minutes=16))
    st.auswerten()
    await hass.async_block_till_done()
    assert shellys.aus() == ["switch.hk1"] and shellys.ein() == ["switch.hk1", "switch.hk2"]
    # Heizkörper 1 wartet jetzt selbst: erst die Mindestpause (5 min), dann den nächsten Tausch
    assert struktur(hass, baustelle)["laufzeit"]["geraete"][HK1]["warte"] == {"grund": "mindestpause", "dran_in_min": 5}
    # Arbeitsende + Nachheizen vorbei → alles aus
    await _zu(hass, freezer, "2026-09-29 16:46:00+02:00", st)
    assert hass.states.get("switch.hk2").state == "off"
    assert hass.states.get(eid(hass, "sensor", f"{C2}_grund")).state == "ausserhalb"


async def test_ohne_staffelung_heizen_alle_und_thermostat(hass: HomeAssistant, baustelle, freezer, shellys) -> None:
    st = baustelle.runtime_data
    st.e["staffel"]["an"] = False
    freezer.move_to(ZEHN_UHR)
    st.einstellung_setzen(("automatik",), True)
    await hass.async_block_till_done()
    assert sorted(shellys.ein()) == ["switch.hk1", "switch.hk2"]
    # Fühler über Soll + Toleranz → Thermostat schaltet aus (Grund bleibt Arbeitszeit)
    hass.states.async_set("sensor.temp_c1", "20.4")
    await hass.async_block_till_done()
    assert hass.states.get("switch.hk1").state == "off"
    assert st.daten.grund[C1] == "arbeitszeit"


async def test_tuer_offen_pausiert_und_trotzdem_heizen(hass: HomeAssistant, baustelle, freezer, shellys, nachrichten) -> None:
    st = baustelle.runtime_data
    st.e["staffel"]["an"] = False
    hass.states.async_set("binary_sensor.tuer_c2", "off")
    freezer.move_to(ZEHN_UHR)
    st.einstellung_setzen(("bereiche", C2, "tuer"), "binary_sensor.tuer_c2")
    st.einstellung_setzen(("automatik",), True)
    await hass.async_block_till_done()
    assert hass.states.get("switch.hk2").state == "on"
    hass.states.async_set("binary_sensor.tuer_c2", "on")
    await hass.async_block_till_done()
    await _zu(hass, freezer, "2026-09-29 10:04:00+02:00", st)
    assert hass.states.get("switch.hk2").state == "off"
    assert st.daten.grund[C2] == "tuer_offen" and st.daten.text[C2] == "pausiert · Tür offen"
    assert "Tür offen – Heizung pausiert" in _texte(st, "schalten")
    assert nachrichten == []  # Nachricht erst nach 10 min
    await _zu(hass, freezer, "2026-09-29 10:11:00+02:00", st)
    (n,) = nachrichten
    assert n.data["title"] == "🚪 Container 2: Tür seit 11 min offen"
    assert [a["title"] for a in n.data["data"]["actions"]] == ["Trotzdem heizen", "1 h stumm"]
    await _knopf(hass, st, "trotzdem", C2)
    assert hass.states.get("switch.hk2").state == "on"
    assert any("Trotzdem heizen" in t for t in _texte(st, "nachricht"))


async def test_hand_bis_zum_naechsten_schaltpunkt(hass: HomeAssistant, baustelle, freezer, shellys) -> None:
    st = baustelle.runtime_data
    st.e["staffel"]["an"] = False
    freezer.move_to(ZEHN_UHR)
    st.einstellung_setzen(("automatik",), True)
    await hass.async_block_till_done()
    hass.states.async_set("switch.hk2", "off", context=Context(user_id="nutzer"))
    await hass.async_block_till_done()
    assert HK2 in st.lz["hand"]
    await _zu(hass, freezer, "2026-09-29 10:05:00+02:00", st)
    assert hass.states.get("switch.hk2").state == "off"  # bleibt auf Hand
    assert struktur(hass, baustelle)["laufzeit"]["geraete"][HK2]["hand_seit"]
    # nächster Schaltpunkt: Heizzeit vorbei → Automatik übernimmt wieder
    await _zu(hass, freezer, "2026-09-29 16:46:00+02:00", st)
    assert HK2 not in st.lz["hand"]
    assert any("Automatik übernimmt" in t for t in _texte(st, "schalten"))


async def test_hand_und_energie_nur_ueber_die_funktion(hass: HomeAssistant, baustelle, freezer, shellys) -> None:
    """Handbetrieb, Heiz-Energiezähler und Status kommen von der Funktion des Bereichs (Bauplan Module §3)."""
    st = baustelle.runtime_data
    freezer.move_to(ZEHN_UHR)
    st.einstellung_setzen(("automatik",), True)
    await hass.async_block_till_done()
    # Pumpe von Hand geschaltet (HA oder Seite): kein Handbetrieb, nur Protokoll
    hass.states.async_set("switch.p1", "on", context=Context(user_id="nutzer"))
    await hass.async_block_till_done()
    st.geraet_schalten(st.geraete[P1], False)
    await hass.async_block_till_done()
    assert P1 not in st.lz["hand"] and st.funktion("pumpen").hand_seit(st.geraete[P1]) is None
    assert "Pumpe 1 von Hand ausgeschaltet" in _texte(st, "schalten")
    # Heizkörper von der Seite: Handbetrieb der Heizung
    st.geraet_schalten(st.geraete[HK1], True)
    await hass.async_block_till_done()
    assert st.funktion_von(st.geraete[HK1]).hand_seit(st.geraete[HK1]) is not None
    # Energie: Heizen und Typ nur für Heizkörper, Pumpe nur Energie und Kosten
    z = st.zaehler
    vorher = {k: z.get(k, 0.0) for k in ("energie", "energie_heizen", "energie_typ:oelradiator", "energie_typ:konvektor")}
    st._energie_buchen(st.geraete[HK1], 2.0)
    st._energie_buchen(st.geraete[P1], 1.0)
    assert {k: z.get(k, 0.0) - v for k, v in vorher.items()} == {
        "energie": 3.0, "energie_heizen": 2.0, "energie_typ:oelradiator": 2.0, "energie_typ:konvektor": 0.0,
    }
    assert st.daten.status != "nur_pumpen"


async def test_nur_pumpen_status_von_der_pumpenfunktion(hass: HomeAssistant, freezer, shellys, nachrichten) -> None:
    entry = await baustelle_anlegen(hass, freezer, heizung=False)
    await hass.config_entries.async_setup(entry.entry_id)
    await hass.async_block_till_done()
    st = entry.runtime_data
    st.auswerten()
    assert (st.daten.status, st.daten.status_text) == ("nur_pumpen", "")


async def test_heizgrenze_schaltet_aus(hass: HomeAssistant, baustelle, freezer, shellys) -> None:
    st = baustelle.runtime_data
    st.e["staffel"]["an"] = False
    freezer.move_to(ZEHN_UHR)
    hass.states.async_set("switch.hk2", "on")
    hass.states.async_set("sensor.aussen", "17")
    st.einstellung_setzen(("automatik",), True)
    await hass.async_block_till_done()
    assert "switch.hk2" in shellys.aus()
    assert hass.states.get(eid(hass, "sensor", f"{baustelle.entry_id}_status")).state == "heizgrenze"
    assert any(t.startswith("Heizgrenze überschritten (Höchstwert 17 °C)") for t in _texte(st, "wetter"))


async def test_frostschutz_ausserhalb_der_arbeitszeit(hass: HomeAssistant, baustelle, freezer, shellys) -> None:
    st = baustelle.runtime_data
    freezer.move_to("2026-09-29 21:00:00+02:00")
    hass.states.async_set("sensor.temp_c1", "4.0")
    st.einstellung_setzen(("automatik",), True)
    await hass.async_block_till_done()
    assert shellys.ein() == ["switch.hk1"]
    assert st.daten.zustand[C1] == "frost" and st.daten.text[C1] == "Frostschutz"
    assert any(w.art == "frostgefahr" for w in st.daten.warnungen)


async def test_alle_jetzt_heizen_auch_ueber_der_heizgrenze(hass: HomeAssistant, baustelle, freezer, shellys) -> None:
    st = baustelle.runtime_data
    st.e["staffel"]["an"] = False
    freezer.move_to("2026-09-29 19:00:00+02:00")
    hass.states.async_set("sensor.aussen", "18")
    st.lz["jetzt_bis"] = "2026-09-29T20:00:00+02:00"
    st.einstellung_setzen(("automatik",), True)
    await hass.async_block_till_done()
    assert sorted(shellys.ein()) == ["switch.hk1", "switch.hk2"]
    assert st.daten.status_text == "♨ alle heizen bis 20:00"
    await _zu(hass, freezer, "2026-09-29 20:01:00+02:00", st)
    assert st.lz["jetzt_bis"] is None and hass.states.get("switch.hk2").state == "off"


# ---------------------------------------------------------------------- Kalender
def _kalender(hass: HomeAssistant, events: dict[str, list[dict]]) -> list[ServiceCall]:
    aufrufe = []

    async def get_events(call: ServiceCall):
        aufrufe.append(call)
        ids = call.data["entity_id"]
        return {e: {"events": events.get(e, [])} for e in ([ids] if isinstance(ids, str) else ids)}

    hass.services.async_register("calendar", "get_events", get_events, supports_response=SupportsResponse.ONLY)
    for entity_id in events:
        hass.states.async_set(entity_id, "off")
    return aufrufe


async def test_feiertag_aus_dem_kalender(hass: HomeAssistant, freezer, shellys, nachrichten) -> None:
    _kalender(hass, {"calendar.feiertage": [{"start": "2026-09-29", "end": "2026-09-30", "summary": "Testfeiertag"}]})
    entry = await baustelle_anlegen(hass, freezer, ZEHN_UHR, feiertag_kalender="calendar.feiertage")
    assert await hass.config_entries.async_setup(entry.entry_id)
    await hass.async_block_till_done()
    shellys.anmelden()
    st = entry.runtime_data
    st.einstellung_setzen(("automatik",), True)
    await hass.async_block_till_done()
    assert shellys.ein() == []
    assert st.daten.status == "feiertag" and st.daten.grund[C2] == "frei"
    woche = struktur(hass, entry)["laufzeit"]["plan_woche"]
    assert [t["datum"] for t in woche][:2] == ["2026-09-28", "2026-09-29"]
    assert woche[1] == {"datum": "2026-09-29", "plan": None, "frei": "feiertag", "name": "Testfeiertag", "regen_az": 0.0}
    assert woche[2]["plan"]["a"] == 420 and woche[2]["plan"]["ende"] == 1005


async def test_bedarf_mit_termin_aus_dem_kalender(hass: HomeAssistant, baustelle, freezer, shellys) -> None:
    _kalender(hass, {"calendar.besprechungen": [
        {"start": "2026-09-29T11:00:00+02:00", "end": "2026-09-29T12:00:00+02:00", "summary": "Baubesprechung",
         "description": f"baustelle:{C2}"},
    ]})
    st = baustelle.runtime_data
    st.e["staffel"]["an"] = False
    freezer.move_to(ZEHN_UHR)
    st.einstellung_setzen(("bereiche", C2, "bedarf"), True)
    st.einstellung_setzen(("termine_kalender",), "calendar.besprechungen")
    st.einstellung_setzen(("automatik",), True)
    await hass.async_block_till_done()
    assert st.funktion("heizung").termine[0]["titel"] == "Baubesprechung" and st.funktion("heizung").termine[0]["wiederholung"] == "einmal"
    assert hass.states.get("switch.hk2").state == "off" and st.daten.grund[C2] == "bereit"
    assert st.daten.text[C2] == "bei Bedarf · nur Frostschutz"
    await _zu(hass, freezer, "2026-09-29 10:16:00+02:00", st)  # 45 min Vorheizen vor 11:00
    assert hass.states.get("switch.hk2").state == "on" and st.daten.grund[C2] == "bedarf"
    assert st.daten.text[C2] == "heizt bis 12:00"
    lz = struktur(hass, baustelle)["laufzeit"]
    assert lz["abschnitte"][C2]["2026-09-29"] == [[615, 660, "vorheizen"], [660, 720, "termin"]]
    assert lz["termine"][0]["bereich"] == C2


# ---------------------------------------------------------------------- Warnungen und Nachrichten
async def test_pumpe_trockenlauf_meldet_mit_knoepfen(hass: HomeAssistant, baustelle, freezer, nachrichten) -> None:
    st = baustelle.runtime_data
    hass.states.async_set("sensor.p1_power", "25")  # läuft (≥ 20 W), zieht aber unter 30 W
    await hass.async_block_till_done()
    assert nachrichten == []  # erst nach einer Minute
    freezer.tick(timedelta(minutes=2))
    st.auswerten()
    await hass.async_block_till_done()
    (n,) = nachrichten
    assert n.data["title"] == "⚠ Schacht: Pumpe 1 Trockenlauf: 25 W"
    aktionen = n.data["data"]["actions"]
    assert aktionen[0] == {"action": "URI", "title": "Zum Container",
                           "uri": f"/baustelle?baustelle={baustelle.entry_id}&container={SCHACHT}"}
    assert aktionen[1]["title"] == "Bis morgen stumm"
    problem = hass.states.get(eid(hass, "binary_sensor", f"{P1}_problem"))
    assert problem.state == "on" and problem.attributes["probleme"] == ["trockenlauf"]
    assert "Pumpe 1 Trockenlauf: 25 W" in _texte(st, "warnung")
    assert "An Test: „Schacht: Pumpe 1 Trockenlauf: 25 W“" in _texte(st, "nachricht")
    # nicht nochmal melden
    freezer.tick(timedelta(minutes=1))
    st.auswerten()
    await hass.async_block_till_done()
    assert len(nachrichten) == 1
    # Knopf „Bis morgen stumm“
    key = f"trockenlauf:{SCHACHT}:{P1}"
    await _knopf(hass, st, "stumm_morgen", key)
    assert st.e["stumm"][key].startswith("2026-09-30T07:00")
    w = next(x for x in struktur(hass, baustelle)["laufzeit"]["warnungen"] if x["key"] == key)
    assert w["stumm_bis"] and w["stufe"] == "stoerung" and w["hilfe"]
    # Problem vorbei → „wieder normal“ im Protokoll
    hass.states.async_set("sensor.p1_power", "760")
    await hass.async_block_till_done()
    assert "Pumpe 1 wieder normal" in _texte(st, "ok")


async def test_baustelle_nicht_erreichbar(hass: HomeAssistant, baustelle, freezer, nachrichten) -> None:
    st = baustelle.runtime_data
    for entity_id in ("switch.hk1", "switch.hk2", "switch.p1"):
        hass.states.async_set(entity_id, "unavailable")
    await hass.async_block_till_done()
    assert hass.states.get(eid(hass, "binary_sensor", f"{baustelle.entry_id}_erreichbar")).state == "off"
    await _zu(hass, freezer, "2026-09-29 16:56:00+02:00", st)
    assert [n.data["title"] for n in nachrichten] == ["⚠ Baustelle nicht erreichbar"]


async def test_hand_zu_lange_nachricht_und_automatik_uebernehmen(hass: HomeAssistant, baustelle, freezer, nachrichten) -> None:
    st = baustelle.runtime_data
    st.lz["hand"][HK2] = (dt_util.now() - timedelta(hours=9)).isoformat()
    st.auswerten()
    await hass.async_block_till_done()
    (n,) = nachrichten
    assert n.data["title"] == "✋ Heizkörper 2 Container 2 seit 9 h auf Hand"
    assert [a["title"] for a in n.data["data"]["actions"]] == ["Automatik übernehmen", "So lassen"]
    await _knopf(hass, st, "automatik", HK2)
    assert HK2 not in st.lz["hand"]


async def test_fruehstart_nachricht_am_vorabend(hass: HomeAssistant, baustelle, freezer, nachrichten) -> None:
    st = baustelle.runtime_data
    st.lz["wetter_tage"] = {"2026-09-30": {"frueh": -4.0}}
    st.einstellung_setzen(("automatik",), True)
    freezer.move_to("2026-09-29 18:00:00+02:00")
    st._takt(dt_util.now())  # noqa: SLF001
    await hass.async_block_till_done()
    (n,) = [x for x in nachrichten if x.data["title"].startswith("❄")]
    assert n.data["title"] == "❄ Morgen −4 °C"
    assert n.data["message"] == "Vorheizen startet schon um 05:45. Arbeitsbeginn 07:00."
    assert [a["title"] for a in n.data["data"]["actions"]] == ["Morgen nicht heizen", "Noch früher (05:15)"]
    st._takt(dt_util.now())  # noqa: SLF001
    assert len([x for x in nachrichten if x.data["title"].startswith("❄")]) == 1  # einmal je Tag
    await _knopf(hass, st, "frueher", "2026-09-30")
    assert st.funktion("heizung").plan(date(2026, 9, 30), True).start == 5 * 60 + 15
    await _knopf(hass, st, "frei", "2026-09-30")
    assert st.funktion("heizung").plan(date(2026, 9, 30), True) is None
    assert {"datum": "2026-09-30", "art": "frei"}.items() <= st.e["ausnahmen"][0].items()


async def test_bericht_zum_termin(hass: HomeAssistant, baustelle, freezer, nachrichten, monkeypatch) -> None:
    from custom_components.baustelle.nachrichten import HINWEIS_OHNE_ANHANG, Nachrichten

    mails: list[ServiceCall] = []

    async def mail(call: ServiceCall) -> None:
        mails.append(call)

    hass.services.async_register("notify", "mail_test", mail)

    async def verbrauch(self, von, bis):
        return {C1: {date(2026, 9, 21): 20.0, date(2026, 9, 28): 10.0, date(2026, 10, 1): 12.0},
                C2: {date(2026, 9, 30): 8.0}}

    monkeypatch.setattr(Nachrichten, "async_verbrauch_je_tag", verbrauch)
    st = baustelle.runtime_data
    st.einstellung_setzen(("bericht", "mail"), True)
    st.einstellung_setzen(("bericht", "mail_dienst"), "mail_test")
    st.einstellung_setzen(("bericht", "mail_an"), "bau@example.at")
    zeit = datetime(2026, 10, 5, 7, 0, 1, tzinfo=dt_util.get_default_time_zone())
    freezer.move_to(zeit)
    async_fire_time_changed(hass, zeit)
    await hass.async_block_till_done(wait_background_tasks=True)   # Bericht läuft als Hintergrundaufgabe (sonst Zeitfrage)
    handy = [n for n in nachrichten if n.data["title"].startswith("Baustelle B1 – Woche")]
    assert handy[0].data["title"] == "Baustelle B1 – Woche 28.09.–04.10.2026"
    assert handy[0].data["message"].startswith("Vorwoche: 30 kWh · 8,40 € (+50 % zur Woche davor)")
    (m,) = mails
    assert m.data["target"] == ["bau@example.at"]
    assert "Je Firma\nEigene Firma: 30 kWh · 8,40 €" in m.data["message"]
    assert HINWEIS_OHNE_ANHANG in m.data["message"]  # kein SMTP-Dienst → kein Anhang, dafür Hinweis
    assert any(t.startswith("Bericht Woche 28.09.–04.10.2026 an Test, E-Mail") for t in _texte(st, "nachricht"))
    # nächster Termin ist eingeplant
    assert st._bericht_abmelden is not None  # noqa: SLF001


# ---------------------------------------------------------------------- Store, Logbuch, Diagnose
async def test_store_v1_nur_zaehler_uebernehmen(hass: HomeAssistant, freezer, hass_storage, shellys, nachrichten) -> None:
    entry = await baustelle_anlegen(hass, freezer)
    key = f"baustelle.{entry.entry_id}"
    hass_storage[key] = {"version": 1, "minor_version": 1, "key": key, "data": {
        "automatik": True, "plan": {"mo": {"ein": "05:00", "aus": "12:00", "aktiv": True}},
        "regeln": {"heizgrenze": 12.0}, "preis": 0.5, "bereiche": {C1: {"modus": "hand", "soll": 22}},
        "zaehler": {"energie": 12.5, "kosten": 3.5, f"stand:{HK1}": 100.0, "heizzeit:" + C1: 4.0},
    }}
    assert await hass.config_entries.async_setup(entry.entry_id)
    await hass.async_block_till_done()
    st = entry.runtime_data
    e = st.e
    assert e["zaehler"]["energie"] == 12.5 and e["zaehler"]["heizzeit:" + C1] == 4.0
    assert e["automatik"] is False and e["preis"] == 0.28 and "plan" not in e and "regeln" not in e
    assert e["heizung"]["soll"] == 20.0 and e["heizung"]["heizgrenze_basis"] == "tageshoechst"
    assert e["bereiche"][C1] == {"auto": True, "trocknen": False, "soll": None, "bedarf": False, "prio": "normal",
                                 "anschluss": "a1", "tuer": None, "modus": None, "lernen": False,
                                 "warm_vor": None, "warm_nach": None, "stufen": False, "primaer": None, "groesse_m2": None, "symbol": None}
    assert e["arbeitszeiten"][0]["ab"] == "2026-09-29" and e["arbeitszeiten"][0]["tage"]["4"] == ["07:00", "12:30"]
    assert e["meldungen_einst"]["empfaenger"] == ["mobile_app_test"]
    assert e["protokoll"][0][1:] == ["einstellung", None, "Umstellung auf 0.7.0: Einstellungen neu, Zähler übernommen"]
    for i in range(1005):
        st.protokoll("schalten", None, f"Eintrag {i}")
    assert len(e["protokoll"]) == 1000 and e["protokoll"][0][3] == "Eintrag 1004"
    assert await hass.config_entries.async_unload(entry.entry_id)
    await hass.async_block_till_done()
    assert hass_storage[key]["version"] == 2
    assert "_von_v1" not in hass_storage[key]["data"]


async def test_protokoll_ins_logbuch(hass: HomeAssistant, baustelle) -> None:
    from homeassistant.core import Event

    from custom_components.baustelle.logbook import async_describe_events

    beschreiber = {}
    async_describe_events(hass, lambda domain, typ, f: beschreiber.setdefault(typ, f))
    ereignisse = []
    hass.bus.async_listen("baustelle_protokoll", ereignisse.append)
    baustelle.runtime_data.protokoll("warnung", C1, "zu kalt: 17,8 °C statt 20 °C")
    await hass.async_block_till_done()
    (ev,) = ereignisse
    text = beschreiber["baustelle_protokoll"](Event("baustelle_protokoll", ev.data))
    assert text == {"name": "Baustelle B1 · Container 1", "message": "zu kalt: 17,8 °C statt 20 °C", "icon": "mdi:alert"}


async def test_diagnose(hass: HomeAssistant, baustelle) -> None:
    from custom_components.baustelle.diagnostics import async_get_config_entry_diagnostics

    d = await async_get_config_entry_diagnostics(hass, baustelle)
    assert d["baustelle"]["titel"] == "B1"
    assert d["baustelle"]["optionen"]["empfaenger"] == "**REDACTED**"
    assert d["einstellungen"]["meldungen_einst"]["empfaenger"] == "**REDACTED**"
    assert d["entitaeten"][f"{baustelle.entry_id}_status"].startswith("sensor.")
    assert {g["id"] for g in d["geraete"]} == {HK1, HK2, P1}
    assert d["laufzeit"]["status"] == "automatik_aus"


# ---------------------------------------------------------------------- wie 0.6
async def test_bereich_loeschen_laedt_neu(hass: HomeAssistant, baustelle) -> None:
    hass.config_entries.async_remove_subentry(baustelle, HK2)
    await hass.async_block_till_done()
    assert HK2 not in baustelle.runtime_data.geraete
    assert er.async_get(hass).async_get_entity_id("binary_sensor", DOMAIN, f"{HK2}_problem") is None


async def test_geraet_loeschen_raeumt_reste_weg(hass: HomeAssistant, baustelle) -> None:
    """BSM-034.01 (Bauplan Geräte §3 Fehler 6): Einstellungen, Zähler, stumm und Hinweise des gelöschten Geräts."""
    from homeassistant.helpers import issue_registry as ir   # noqa: PLC0415

    st = baustelle.runtime_data
    st.e["geraete"][HK2] = {"aktiv": False}
    st.e["zaehler"].update({f"mittel:{HK2}": 900.0, f"stand:{HK2}": 3.0, f"mittel:{HK1}": 800.0})
    st.e["stumm"][f"offline:{C2}:{HK2}"] = "2099-01-01T00:00:00+00:00"
    eid_alt = f"ohne_leistung_{baustelle.entry_id}_{HK2}"
    ir.async_create_issue(hass, DOMAIN, eid_alt, is_fixable=False, severity=ir.IssueSeverity.WARNING, translation_key="ohne_leistung",
                          translation_placeholders={"geraet": "x", "schalter": "x", "baustelle": "x"})
    st.einstellungen.speichern(0)
    await hass.async_block_till_done()
    hass.config_entries.async_remove_subentry(baustelle, HK2)
    await hass.async_block_till_done()
    st = baustelle.runtime_data
    assert HK2 not in st.e["geraete"] and f"mittel:{HK2}" not in st.e["zaehler"] and f"stand:{HK2}" not in st.e["zaehler"]
    assert st.e["zaehler"][f"mittel:{HK1}"] == 800.0
    assert f"offline:{C2}:{HK2}" not in st.e["stumm"]
    assert ir.async_get(hass).async_get_issue(DOMAIN, eid_alt) is None


async def test_entladen(hass: HomeAssistant, baustelle) -> None:
    assert await hass.config_entries.async_unload(baustelle.entry_id)
    await hass.async_block_till_done()


async def test_problem_sensor_haengt_am_shelly_geraet(hass: HomeAssistant) -> None:
    from homeassistant.helpers import device_registry as dr

    shelly_entry = MockConfigEntry(domain="shelly", title="Shelly")
    shelly_entry.add_to_hass(hass)
    geraet = dr.async_get(hass).async_get_or_create(
        config_entry_id=shelly_entry.entry_id, identifiers={("shelly", "a1f3")}, name="Shelly Plug S a1f3"
    )
    er.async_get(hass).async_get_or_create(
        "switch", "shelly", "a1f3-relay", suggested_object_id="plug_a1f3", device_id=geraet.id, config_entry=shelly_entry
    )
    er.async_get(hass).async_get_or_create(
        "sensor", "shelly", "a1f3-power", suggested_object_id="plug_a1f3_power", device_id=geraet.id,
        config_entry=shelly_entry, original_device_class="power",
    )
    hass.states.async_set("switch.plug_a1f3", "off")
    entry = MockConfigEntry(
        domain=DOMAIN, title="B2", data={"name": "B2"},
        options={"heizung": True, "pumpen": False, "status": "aktiv", "beginn": "2026-09-01",
                 "heizperiode_von": "10", "heizperiode_bis": "4", "empfaenger": []},
        subentries_data=[
            sub("c", "bereich", "C", {"name": "C", "art": "container"}),
            sub("g", "geraet", "HK", {"bereich": "c", "schalter": "switch.plug_a1f3", "name": "HK",
                                      "rolle": "heizkoerper", "typ": "konvektor"}),
        ],
    )
    entry.add_to_hass(hass)
    assert await hass.config_entries.async_setup(entry.entry_id)
    await hass.async_block_till_done()
    problem = er.async_get(hass).async_get(eid(hass, "binary_sensor", "g_problem"))
    assert problem.device_id == geraet.id
    assert entry.runtime_data.geraete["g"].leistung == "sensor.plug_a1f3_power"


def test_prognose_auswerten() -> None:
    from zoneinfo import ZoneInfo

    from custom_components.baustelle.steuerung import _prognose_auswerten

    tz = ZoneInfo("UTC")
    dt_util.set_default_time_zone(tz)
    jetzt = datetime(2026, 9, 29, 16, 0, tzinfo=tz)
    stunden = [
        {"datetime": "2026-09-29T15:00:00+00:00", "temperature": 9.0, "precipitation": 1.2},
        {"datetime": "2026-09-29T17:00:00+00:00", "temperature": 7.0, "precipitation": 0.8},
        {"datetime": "2026-09-30T04:00:00+00:00", "temperature": 1.0},
        {"datetime": "2026-09-30T06:00:00+00:00", "temperature": -1.5},
        {"datetime": "2026-09-30T12:00:00+00:00", "temperature": 12.0},
    ]
    assert _prognose_auswerten(stunden, "hourly", jetzt) == {"max_heute": 9.0, "frueh": -1.5, "regen_heute": 2.0}
    tage = [{"datetime": "2026-09-29T00:00:00+00:00", "temperature": 10.0, "templow": 3.0, "precipitation": 4.0},
            {"datetime": "2026-09-30T00:00:00+00:00", "temperature": 11.0, "templow": -2.0}]
    assert _prognose_auswerten(tage, "daily", jetzt) == {"max_heute": 10.0, "frueh": -2.0, "regen_heute": 4.0}


async def test_reparatur_hinweis_bei_fehlender_entitaet(hass: HomeAssistant, baustelle) -> None:
    from homeassistant.helpers import issue_registry as ir

    st = baustelle.runtime_data
    issue_id = f"fehlt_{baustelle.entry_id}_switch.hk1"
    hass.states.async_remove("switch.hk1")
    st._gestartet = dt_util.now() - timedelta(minutes=11)  # noqa: SLF001
    st._takt(dt_util.now())  # noqa: SLF001
    assert ir.async_get(hass).async_get_issue(DOMAIN, issue_id) is not None
    hass.states.async_set("switch.hk1", "off")
    st._takt(dt_util.now())  # noqa: SLF001
    assert ir.async_get(hass).async_get_issue(DOMAIN, issue_id) is None


async def test_reparatur_hinweis_ohne_leistungssensor(hass: HomeAssistant, baustelle) -> None:
    """FE-0003: Gerät ohne Leistungs- und Energiesensor zählt nichts – das meldet ein Reparatur-Hinweis."""
    from homeassistant.helpers import issue_registry as ir

    st = baustelle.runtime_data
    issue_id = f"ohne_leistung_{baustelle.entry_id}_{HK1}"
    st._gestartet = dt_util.now() - timedelta(minutes=11)  # noqa: SLF001
    st._takt(dt_util.now())  # noqa: SLF001
    assert ir.async_get(hass).async_get_issue(DOMAIN, issue_id) is None
    st.geraete[HK1].leistung = None
    st._takt(dt_util.now())  # noqa: SLF001
    assert ir.async_get(hass).async_get_issue(DOMAIN, issue_id) is not None


async def test_naechste_schaltzeit_ueber_das_wochenende(hass: HomeAssistant, baustelle, freezer) -> None:
    st = baustelle.runtime_data
    st.einstellung_setzen(("automatik",), True)
    await _zu(hass, freezer, "2026-10-02 19:00:00+02:00", st)  # Freitag abends → Montag 06:15
    assert st.daten.naechste.isoformat().startswith("2026-10-05T06:15")
    assert st.daten.status_text == "aus · Mo ab 06:15"


async def test_eigene_sensoren_als_wetterquelle_werden_entfernt(hass: HomeAssistant, baustelle) -> None:
    eigener = eid(hass, "sensor", f"{baustelle.entry_id}_aussen")
    hass.config_entries.async_update_entry(baustelle, options={**baustelle.options, "temp_sensor": eigener})
    await hass.async_block_till_done()  # Update-Listener lädt neu, Setup räumt auf
    assert "temp_sensor" not in baustelle.options
    assert baustelle.options["regen_sensor"] == "sensor.regen"


async def test_vorhersage_sobald_wetter_da(hass: HomeAssistant, baustelle) -> None:
    aufrufe = []

    async def vorhersage(call):
        aufrufe.append(call)
        return {"weather.spaet": {"forecast": [
            {"datetime": "2026-09-30T05:00:00+02:00", "temperature": -1.0, "precipitation": 0.4}]}}

    hass.services.async_register("weather", "get_forecasts", vorhersage, supports_response=SupportsResponse.ONLY)
    hass.config_entries.async_update_entry(baustelle, options={**baustelle.options, "wetter": "weather.spaet"})
    await hass.async_block_till_done()
    assert aufrufe == []  # Wetter noch nicht geladen
    hass.states.async_set("weather.spaet", "rainy", {"temperature": 4.0})
    await hass.async_block_till_done()
    assert len(aufrufe) >= 1
    st = baustelle.runtime_data
    assert st.lz["wetter_tage"]["2026-09-30"]["frueh"] == -1.0
    assert struktur(hass, baustelle)["laufzeit"]["wetter"]["zustand"] == "rainy"
    assert st.daten.wetter.frueh == -1.0  # nach 8 Uhr: der Morgen von morgen


async def test_nachricht_tag_je_baustelle_und_ungueltiger_knopf(hass: HomeAssistant, baustelle, nachrichten) -> None:
    """Gleiche Warnung zweier Baustellen (z. B. `baustelle_offline`) darf sich auf dem Handy nicht ersetzen;
    ein Knopf mit kaputtem Datum ändert nichts."""
    st = baustelle.runtime_data
    st.nachrichten.melden("⚠ B1", "offline", tag="baustelle_baustelle_offline")
    await hass.async_block_till_done()
    assert nachrichten[-1].data["data"]["tag"] == f"baustelle_baustelle_offline_{baustelle.entry_id}"
    vorher = list(st.e["ausnahmen"])
    st.nachrichten.knopf("frei", "kein-datum")
    st.nachrichten.knopf("frueher", "2026-13-40")
    assert st.e["ausnahmen"] == vorher and not st.lz.get("frueher")


async def test_neuer_tuerkontakt_wird_beobachtet(hass: HomeAssistant, baustelle, freezer, shellys) -> None:
    """Ein auf der Seite gesetzter Türkontakt wirkt sofort bei seiner Zustandsänderung, nicht erst im Minutentakt."""
    st = baustelle.runtime_data
    st.e["staffel"]["an"] = False
    hass.states.async_set("binary_sensor.tuer_c2", "on")
    freezer.move_to(ZEHN_UHR)
    st.einstellung_setzen(("automatik",), True)
    st.funktion("heizung").tuer_trotzdem.add(C2)  # heizt trotz offener Tür
    st.einstellung_setzen(("bereiche", C2, "tuer"), "binary_sensor.tuer_c2")
    await hass.async_block_till_done()
    assert hass.states.get("switch.hk2").state == "on"
    hass.states.async_set("binary_sensor.tuer_c2", "off")  # zu → „trotzdem“ ist vorbei
    await hass.async_block_till_done()
    assert C2 not in st.funktion("heizung").tuer_trotzdem


async def test_anlauf_ohne_protokoll_eintrag(hass: HomeAssistant, baustelle, freezer, shellys) -> None:
    """Anlaufstaffel: die Heizkörper gehen nacheinander an (höchstens einer je 20 s, kein gemeinsamer Einschaltstoß).
    Das kurze Warten ist kein Warten, das ins Protokoll gehört."""
    st = baustelle.runtime_data
    freezer.move_to(ZEHN_UHR)
    st.einstellung_setzen(("automatik",), True)
    await hass.async_block_till_done()
    assert shellys.ein() == ["switch.hk1"]
    assert struktur(hass, baustelle)["laufzeit"]["geraete"][HK2]["warte"] == {"grund": "anlauf", "dran_in_min": 0}
    freezer.tick(timedelta(seconds=10))
    st.auswerten()
    await hass.async_block_till_done()
    assert shellys.ein() == ["switch.hk1"]  # noch keine 20 s
    freezer.tick(timedelta(seconds=11))
    async_fire_time_changed(hass, dt_util.utcnow())
    await hass.async_block_till_done()
    assert sorted(shellys.ein()) == ["switch.hk1", "switch.hk2"]
    assert not [t for t in _texte(st, "schalten") if "wartet" in t]


async def test_heizt_nur_bei_verbrauch(hass: HomeAssistant, baustelle, freezer, shellys) -> None:
    """Kachel „heizt“ (Glühen) nur, wenn der Heizkörper wirklich Strom zieht – Schalter an allein reicht nicht."""
    st = baustelle.runtime_data
    st.e["staffel"]["an"] = False
    freezer.move_to(ZEHN_UHR)
    st.einstellung_setzen(("automatik",), True)
    await hass.async_block_till_done()
    assert "switch.hk1" in shellys.ein()
    assert struktur(hass, baustelle)["laufzeit"]["container"][C1]["zustand"] == "heizt"
    # Heizkörper ist eingeschaltet, zieht aber nichts (z. B. am Gerät aus oder eigener Thermostat hat abgeschaltet)
    hass.states.async_set("sensor.hk1_power", "0")
    await hass.async_block_till_done()
    c = struktur(hass, baustelle)["laufzeit"]["container"][C1]
    assert hass.states.get("switch.hk1").state == "on"
    assert c["zustand"] == "aus" and c["text"] == "an · zieht keinen Strom"
    hass.states.async_set("sensor.hk1_power", "1800")
    await hass.async_block_till_done()
    assert struktur(hass, baustelle)["laufzeit"]["container"][C1]["zustand"] == "heizt"


# ---------------------------------------------------------------------- Kern und Funktionen (Bauplan Module §1.2, §3)
async def test_neue_funktion_ohne_eingriff_in_den_kern(hass: HomeAssistant, freezer, shellys, nachrichten, monkeypatch) -> None:
    """Eine neue Funktion (Probe „Kühlung“) kommt allein über `funktionen.FUNKTIONEN` in Automatik, Staffelung,
    Schalten, Anzeige und Status – ohne Änderung an `steuerung.py` (nur das Gerätemodell der neuen Bereichsart kommt
    in `entity.MODELL` dazu)."""
    from custom_components.baustelle import entity, funktionen, steuerung
    from custom_components.baustelle.funktionen.basis import Funktion
    from custom_components.baustelle.logik.regelung import Soll

    class Kuehlung(Funktion):
        name = option = "kuehlung"
        standard = True
        arten = ("kuehlraum",)
        rollen = ("kuehlgeraet",)
        schaltet = True
        standard_kw = 1.5
        staffel_feld = "kuehl_kw"

        def soll(self, jetzt, wetter):
            return {b.id: (Soll(True, "arbeitszeit"), None) for b in self.bereiche()}

        def schaltbar(self, g):
            return True

        def anzeige(self, bid, info, jetzt, soll, offline, an):
            return ("kuehlt" if an else "aus"), "", "arbeitszeit"

        def status(self, jetzt):
            return "bereit", "kühlt", None  # Status aus der Liste des Status-Sensors

    monkeypatch.setattr(steuerung, "FUNKTIONEN", (*funktionen.FUNKTIONEN, Kuehlung))
    monkeypatch.setitem(entity.MODELL, "kuehlraum", "Kühlraum")
    await hass.config.async_set_time_zone("Europe/Vienna")
    freezer.move_to("2026-09-29 09:00:00+02:00")
    hass.states.async_set("switch.kuehl", "off")  # seit einer Stunde aus (Mindestpause vorbei)
    freezer.move_to(ZEHN_UHR)
    entry = MockConfigEntry(
        domain=DOMAIN, title="K", data={"name": "K"},
        options={"heizung": False, "pumpen": False, "status": "aktiv", "beginn": "2026-09-01"},
        subentries_data=[
            sub("kr", "bereich", "Kühlraum", {"name": "Kühlraum", "art": "kuehlraum"}),
            sub("kg", "geraet", "Kühlgerät", {"bereich": "kr", "schalter": "switch.kuehl", "name": "Kühlgerät",
                                             "rolle": "kuehlgeraet", "typ": "konvektor"}),
        ],
    )
    entry.add_to_hass(hass)
    assert await hass.config_entries.async_setup(entry.entry_id)
    await hass.async_block_till_done()
    shellys.anmelden()
    st = entry.runtime_data
    assert st.automatik_moeglich and not st.automatik
    assert shellys.aufrufe == []
    st.einstellung_setzen(("automatik",), True)
    await _zu(hass, freezer, "2026-09-29 10:00:30+02:00", st)  # nach dem Anlauf (ANLAUF_S)
    assert shellys.ein() == ["switch.kuehl"]
    assert st.daten.staffel["laufen"] == 1
    assert st.daten.staffel["anschluesse"][0]["kuehl_kw"] == 1.5
    assert (st.daten.status_text, st.daten.zustand["kr"]) == ("kühlt", "kuehlt")


def test_kern_ohne_einzelheiten_der_funktionen() -> None:
    """Bauplan Module §3: `steuerung.py` nennt keine Funktion, Rolle oder Einstellung von Heizung und Pumpen."""
    import re
    from pathlib import Path

    quelle = (Path(__file__).parents[2] / "custom_components" / "baustelle" / "steuerung.py").read_text()
    verboten = [
        r"funktionen\.(heizung|pumpen)", r"\bHeizung\b", r"\bPumpen\b", r"ROLLE_", "HEIZROLLEN", r"ART_",
        r"\[\"heizung\"\]", r"SollGrund", r"LageContainer", r"frost", r"boost", r"bedarf", r"[Tt]ür", r"tuer",
        r"heizgrenze", r"termine_kalender", r"logik\.(pumpen|regelung)",
    ]
    treffer = [(m, z) for z in quelle.splitlines() for m in verboten if re.search(m, z)]
    assert treffer == []


def test_kern_module_ohne_einzelheiten_der_funktionen() -> None:
    """BSM-023: Auch die Module des Kerns (`kern/`) nennen keine Funktion, Rolle oder Einstellung von Heizung und Pumpen."""
    import re
    from pathlib import Path

    kern = Path(__file__).parents[2] / "custom_components" / "baustelle" / "kern"
    verboten = [
        r"funktionen\.(heizung|pumpen)", r"\bHeizung\b", r"\bPumpen\b", r"ROLLE_", "HEIZROLLEN", r"ART_",
        r"\[\"heizung\"\]", r"SollGrund", r"LageContainer", r"frost", r"boost", r"bedarf", r"[Tt]ür", r"tuer",
        r"heizgrenze", r"termine_kalender", r"logik\.(pumpen|regelung)",
    ]
    dateien = sorted(kern.glob("*.py"))
    treffer = [(d.name, m, z) for d in dateien for z in d.read_text().splitlines() for m in verboten if re.search(m, z)]
    assert len(dateien) >= 8 and treffer == []


async def test_sensor_am_geraet_bei_mehreren(hass: HomeAssistant) -> None:
    """FE-0003: Shelly „Heizung 01“ mit eigenem Sensor der Baustelle, Energie, Energieverbrauch und Einspeisung –
    vorher gab es bei mehreren Kandidaten keinen Sensor, der Container zählte nichts."""
    shelly = MockConfigEntry(domain="shelly")
    shelly.add_to_hass(hass)
    reg, dreg = er.async_get(hass), dr.async_get(hass)

    def geraet(name: str, entitaeten: list[tuple[str, str, str, str | None, str | None]]) -> None:
        dev = dreg.async_get_or_create(config_entry_id=shelly.entry_id, identifiers={("shelly", name)})
        for domain, plattform, objekt, klasse, key in entitaeten:
            reg.async_get_or_create(domain, plattform, f"{name}-{objekt}", device_id=dev.id, suggested_object_id=objekt,
                                    original_device_class=klasse, translation_key=key)

    geraet("heizung_01", [
        ("switch", "shelly", "heizung_01", None, None),
        ("sensor", "shelly", "heizung_01_leistung", "power", None),
        ("sensor", DOMAIN, "heizung_01_radiator_1_o_leistung_im_betrieb", "power", "mittel_im_betrieb"),
        ("sensor", "shelly", "heizung_01_energie", "energy", None),
        ("sensor", "shelly", "heizung_01_energieverbrauch", "energy", "energy_consumed"),
        ("sensor", "shelly", "heizung_01_energieeinspeisung", "energy", "energy_returned"),
    ])
    assert _sensor_am_geraet(reg, "switch.heizung_01", "power") == "sensor.heizung_01_leistung"
    assert _sensor_am_geraet(reg, "switch.heizung_01", "energy") == "sensor.heizung_01_energie"

    geraet("zwei", [   # Zweikanal: gleicher Namensanfang entscheidet
        ("switch", "shelly", "zwei_kanal_1", None, None), ("switch", "shelly", "zwei_kanal_2", None, None),
        ("sensor", "shelly", "zwei_kanal_1_leistung", "power", None), ("sensor", "shelly", "zwei_kanal_2_leistung", "power", None),
    ])
    assert _sensor_am_geraet(reg, "switch.zwei_kanal_2", "power") == "sensor.zwei_kanal_2_leistung"


async def test_hand_endet_am_soll_bei_einstellung_und_tuer(hass: HomeAssistant, baustelle, freezer, shellys) -> None:
    """FE-0004: um 19:01 (außerhalb der Heizzeit) per Hand eingeschaltet, Fühler über dem Soll – vorher heizte der
    Heizkörper bis zum nächsten Morgen weiter. Jetzt: Soll erreicht, geänderte Einstellung, Tür offen beenden die Hand."""
    st = baustelle.runtime_data
    st.e["staffel"]["an"] = False
    st.einstellungen.bereich(C1)["soll"] = 20.0
    await _zu(hass, freezer, "2026-09-29 19:01:00+02:00", st)
    st.einstellung_setzen(("automatik",), True)
    await hass.async_block_till_done()

    def hand_ein() -> None:
        hass.states.async_set("sensor.hk1_power", "1900")
        hass.states.async_set("switch.hk1", "on", context=Context(user_id="nutzer"))

    hass.states.async_set("sensor.temp_c1", "19.0")
    hand_ein()
    await hass.async_block_till_done()
    assert HK1 in st.lz["hand"]
    c = struktur(hass, baustelle)["laufzeit"]["container"][C1]
    assert c["text"] == "heizt · Hand"   # vorher „heizt · Arbeitszeit“ außerhalb der Heizzeit
    # Soll erreicht: Automatik übernimmt und schaltet aus (außerhalb der Heizzeit)
    hass.states.async_set("sensor.temp_c1", "20.2")
    await _zu(hass, freezer, "2026-09-29 19:20:00+02:00", st)
    assert HK1 not in st.lz["hand"] and hass.states.get("switch.hk1").state == "off"
    assert any("Soll 20,0 °C erreicht" in t for t in _texte(st, "schalten"))

    # geänderte Einstellung beendet die Hand sofort
    hass.states.async_set("sensor.temp_c1", "18.0")
    hand_ein()
    await hass.async_block_till_done()
    assert HK1 in st.lz["hand"]
    Heizung.von(st).hand_nach_einstellung(("bereiche", C1, "soll"))
    assert HK1 not in st.lz["hand"]

    # Tür offen geht vor
    hand_ein()
    await hass.async_block_till_done()
    hass.states.async_set("binary_sensor.tuer_c1", "on")
    st.einstellungen.bereich(C1)["tuer"] = "binary_sensor.tuer_c1"
    await _zu(hass, freezer, "2026-09-29 19:30:00+02:00", st)
    await _zu(hass, freezer, "2026-09-29 19:35:00+02:00", st)
    assert HK1 not in st.lz["hand"]


async def test_lernende_regelung_lernt_nachlauf(hass: HomeAssistant, baustelle, freezer, shellys) -> None:
    """0.8: Container 1 (Fühler, Ölradiator) regelt lernend nach TPI; nach dem Ausschalten läuft der Raum nach –
    der Nachlauf wird gelernt und ab dann vorweggenommen; die Seite bekommt den Lernstand."""
    st = baustelle.runtime_data
    st.e["staffel"]["an"] = False
    st.einstellungen.bereich(C1)["soll"] = 20.0
    st.einstellung_setzen(("bereiche", C1, "lernen"), True)
    freezer.move_to(ZEHN_UHR)
    st.einstellung_setzen(("automatik",), True)
    await hass.async_block_till_done()
    t = dt_util.parse_datetime(ZEHN_UHR)

    async def minute(temp: float) -> None:
        nonlocal t
        hass.states.async_set("sensor.temp_c1", str(temp))
        t += timedelta(minutes=1)
        freezer.move_to(t)
        st.auswerten()
        await hass.async_block_till_done()

    for _ in range(60):            # kalt: TPI 100 % – durchgehend ein
        await minute(18.0)
    assert hass.states.get("switch.hk1").state == "on"
    lern = struktur(hass, baustelle)["laufzeit"]["container"][C1]["lernen"]
    assert lern["an"] is True and lern["anteil"] == 100 and lern["erwartet"] == 0.0
    await minute(20.4)             # über dem Soll: aus
    assert hass.states.get("switch.hk1").state == "off"
    for temp in (20.6, 20.8, 21.0, 21.2, 21.3, 21.2, 21.0):   # Nachlauf bis 21,3, dann vorbei
        await minute(temp)
    stand = st.lz["lernen"][C1]
    assert stand["zyklen"] == 1 and stand["nachlauf"]["oel|lang|kalt"][0] == pytest.approx(0.9)
    lern = struktur(hass, baustelle)["laufzeit"]["container"][C1]["lernen"]
    assert lern["nachlauf"]["oel|lang|kalt"]["grad"] == pytest.approx(0.9) and lern["treffer"] == [pytest.approx(1.3)]
    # zurücksetzen
    st.lz["lernen"].pop(C1)
    assert struktur(hass, baustelle)["laufzeit"]["container"][C1]["lernen"]["zyklen"] == 0


async def test_warm_ab_gelernter_beginn(hass: HomeAssistant, baustelle, freezer, shellys) -> None:
    """AN-0004: lernender Container mit gelernter Aufheizzeit beginnt selbst so früh, dass das Soll 15 min vor
    Arbeitsbeginn erreicht ist; der Beginn bleibt fest, auch wenn der Raum dann schnell wärmer wird."""
    st = baustelle.runtime_data
    st.e["staffel"]["an"] = False
    st.e["heizung"]["warm_vor_min"] = 15
    st.e["heizung"]["fruehstart"] = False
    st.einstellungen.bereich(C1)["soll"] = 20.0
    st.einstellungen.bereich(C1)["modus"] = "thermo"
    st.einstellung_setzen(("bereiche", C1, "lernen"), True)
    st.lz["lernen"][C1] = {"aufheizen": {"mild|1": [3.0, 3], "kalt|1": [3.0, 3]},   # 3 °C je Stunde gelernt (ein Heizkörper)
                           "tau": [1e9, 9]}   # kühlt nicht merklich aus (FE-0031/32: Auskühlen prüft test_szenario_lernen D2)
    hass.states.async_set("sensor.temp_c1", "16.0")
    await _zu(hass, freezer, "2026-09-30 05:00:00+02:00", st)                  # Mittwoch, Arbeit ab 07:00
    st.einstellung_setzen(("automatik",), True)
    await _zu(hass, freezer, "2026-09-30 05:01:00+02:00", st)
    warm = struktur(hass, baustelle)["laufzeit"]["container"][C1]["lernen"]["warm"]
    # 4 °C / 3 °C/h = 80 min + 15 min vor 07:00 → ab 05:25
    assert warm["gelernt"] is True and warm["aufheiz_min"] == 80 and warm["plan"]["start"] == 5 * 60 + 25 and warm["plan"]["ziel"] == 6 * 60 + 45
    assert hass.states.get("switch.hk1").state == "off"
    await _zu(hass, freezer, "2026-09-30 05:30:00+02:00", st)
    f = st.lz["warm_start"][C1]
    assert hass.states.get("switch.hk1").state == "on" and (f["tag"], f["aufheiz_min"], f["zusatz"], f["geschaetzt"]) == ("2026-09-30", 80, False, False)
    hass.states.async_set("sensor.temp_c1", "18.5")                             # wärmer: Beginn bleibt fest
    await _zu(hass, freezer, "2026-09-30 06:00:00+02:00", st)
    assert hass.states.get("switch.hk1").state == "on"
    assert struktur(hass, baustelle)["laufzeit"]["container"][C1]["lernen"]["warm"]["plan"]["start"] == 5 * 60 + 25
    # eigener Wert je Container
    st.einstellung_setzen(("bereiche", C1, "warm_vor"), 30)
    warm = struktur(hass, baustelle)["laufzeit"]["container"][C1]["lernen"]["warm"]
    assert warm["vor"] == 30 and warm["vor_eigen"] is True and warm["plan"]["ziel"] == 6 * 60 + 30


async def test_zusatz_heizkoerper_nur_bei_bedarf(hass: HomeAssistant, freezer, shellys, nachrichten) -> None:
    """AN-0006: Container 1 mit zwei Heizkörpern, „Zusatz nur bei Bedarf“: zuerst heizt nur der erste; der zweite kommt
    weit unter dem Soll, wenn einer es nicht schafft und bei Kälte dazu; welcher Zusatz ist, steht im Gerät."""
    entry = await baustelle_anlegen(hass, freezer, hk2_bereich=C1)
    assert await hass.config_entries.async_setup(entry.entry_id)
    await hass.async_block_till_done()
    shellys.anmelden()
    st = entry.runtime_data
    st.e["staffel"]["an"] = False
    st.einstellungen.bereich(C1)["soll"] = 20.0
    st.einstellungen.bereich(C1)["modus"] = "thermo"
    st.einstellung_setzen(("bereiche", C1, "stufen"), True)
    hass.states.async_set("sensor.aussen", "3.0")
    hass.states.async_set("sensor.temp_c1", "19.0")
    freezer.move_to(ZEHN_UHR)
    st.einstellung_setzen(("automatik",), True)
    await hass.async_block_till_done()
    an = lambda e: hass.states.get(e).state == "on"
    assert an("switch.hk1") and not an("switch.hk2")
    s = struktur(hass, entry)["laufzeit"]["container"][C1]["stufen"]
    assert s["an"] is True and s["haupt"] == [HK1] and s["zusatz"] == [HK2] and s["zusatz_an"] is False
    # weit unter dem Soll: beide; fast warm: Zusatz wieder aus
    hass.states.async_set("sensor.temp_c1", "18.0")
    await _zu(hass, freezer, "2026-09-29 10:01:00+02:00", st)
    assert an("switch.hk1") and an("switch.hk2")
    assert struktur(hass, entry)["laufzeit"]["container"][C1]["stufen"]["grund"] == "weit_unter"
    hass.states.async_set("sensor.temp_c1", "19.6")
    await _zu(hass, freezer, "2026-09-29 10:02:00+02:00", st)
    assert an("switch.hk1") and not an("switch.hk2")
    # einer schafft es nicht: 30 min durchgehend und kaum wärmer
    hass.states.async_set("sensor.temp_c1", "19.0")
    await _zu(hass, freezer, "2026-09-29 10:03:00+02:00", st)
    assert not an("switch.hk2")
    await _zu(hass, freezer, "2026-09-29 10:40:00+02:00", st)
    assert an("switch.hk2") and struktur(hass, entry)["laufzeit"]["container"][C1]["stufen"]["grund"] == "schafft_nicht"
    # Zusatz im Gerät umstellen: jetzt ist Heizkörper 2 der erste
    st.e.setdefault("geraete", {}).setdefault(HK1, {})   # wie panel.pruefe_setzen
    st.einstellung_setzen(("geraete", HK1, "zusatz"), True)
    hass.states.async_set("sensor.temp_c1", "19.6")
    await _zu(hass, freezer, "2026-09-29 10:41:00+02:00", st)
    s = struktur(hass, entry)["laufzeit"]["container"][C1]["stufen"]
    assert s["haupt"] == [HK2] and s["zusatz"] == [HK1] and an("switch.hk2") and not an("switch.hk1")
    assert struktur(hass, entry)["laufzeit"]["geraete"][HK1]["zusatz"] is True
    # außergewöhnlich kalt: beide
    hass.states.async_set("sensor.aussen", "-8.0")
    await _zu(hass, freezer, "2026-09-29 10:42:00+02:00", st)
    assert an("switch.hk1") and an("switch.hk2")
    # aus: wie bisher alle zusammen
    st.einstellung_setzen(("bereiche", C1, "stufen"), False)
    hass.states.async_set("sensor.aussen", "3.0")
    await _zu(hass, freezer, "2026-09-29 10:43:00+02:00", st)
    assert an("switch.hk1") and an("switch.hk2")


async def test_lernen_tuer_offen(hass: HomeAssistant, baustelle, freezer, shellys) -> None:
    """WU-0009: kühlt der Raum beim Heizen ab (draußen nicht kälter), ist die Tür vermutlich offen – Lernen pausiert,
    Hinweis im Protokoll und für die Seite, die Heizung pausiert kurz (FE-0025); ein offener Türkontakt schützt das
    Lernen ebenso."""
    st = baustelle.runtime_data
    st.e["staffel"]["an"] = False
    st.einstellungen.bereich(C1)["soll"] = 20.0
    st.einstellung_setzen(("bereiche", C1, "lernen"), True)
    hass.states.async_set("sensor.aussen", "5.0")
    freezer.move_to(ZEHN_UHR)
    st.einstellung_setzen(("automatik",), True)
    await hass.async_block_till_done()
    t = dt_util.parse_datetime(ZEHN_UHR)

    async def minute(temp: float) -> None:
        nonlocal t
        hass.states.async_set("sensor.temp_c1", str(temp))
        t += timedelta(minutes=1)
        freezer.move_to(t)
        st.auswerten()
        await hass.async_block_till_done()

    for i in range(5):
        await minute(16.0 + 0.05 * i)
    assert st.lz["lernen"][C1]["auf"] is not None              # Aufheizen wird gemessen
    for i in range(12):
        await minute(16.2 - 0.04 * i)                          # beim Heizen kälter
    stand = st.lz["lernen"][C1]
    assert stand["offen"]["art"] == "vermutet" and stand["auf"] is None
    assert any("Tür vermutlich offen" in p[3] for p in st.e["protokoll"])
    assert struktur(hass, baustelle)["laufzeit"]["container"][C1]["lernen"]["offen"]["art"] == "vermutet"
    assert hass.states.get("switch.hk1").state == "off"        # FE-0025: die Heizung pausiert 10 min
    # Türkontakt
    st.lz["lernen"].pop(C1)
    st.einstellungen.bereich(C1)["tuer"] = "binary_sensor.tuer_c1"
    hass.states.async_set("binary_sensor.tuer_c1", "on")
    await minute(16.0)
    assert st.lz["lernen"][C1]["offen"]["art"] == "kontakt"


async def test_geraete_links(hass: HomeAssistant, baustelle) -> None:
    """WU-0010: je Entität das Gerät aus dem Geräteregister – Website (nur http/https), HA-Seite, Modell, Batterie."""
    quelle = MockConfigEntry(domain="shelly", title="Shelly")
    quelle.add_to_hass(hass)
    for eid in ("switch.hk1", "sensor.temp_c1"):   # sonst vergibt das Register einen anderen Namen
        hass.states.async_remove(eid)
    dreg, ereg = dr.async_get(hass), er.async_get(hass)
    shelly = dreg.async_get_or_create(config_entry_id=quelle.entry_id, identifiers={("shelly", "hk1")}, name="Shelly HK1",
                                      manufacturer="Shelly", model="Plus Plug S", configuration_url="http://192.0.2.10")
    ereg.async_get_or_create("switch", "shelly", "hk1-schalter", suggested_object_id="hk1", device_id=shelly.id)
    funk = dreg.async_get_or_create(config_entry_id=quelle.entry_id, identifiers={("shelly", "t1")}, name="Fühler C1",
                                    configuration_url="homeassistant://config/zha")
    ereg.async_get_or_create("sensor", "shelly", "t1-temp", suggested_object_id="temp_c1", device_id=funk.id)
    ereg.async_get_or_create("sensor", "shelly", "t1-bat", suggested_object_id="temp_c1_batterie", device_id=funk.id,
                             original_device_class="battery")
    ereg.async_get_or_create("sensor", "shelly", "hk1-rssi", suggested_object_id="hk1_signal", device_id=shelly.id,
                             original_device_class="signal_strength")
    links = struktur(hass, baustelle)["geraete_links"]
    assert links["switch.hk1"]["web"] == "http://192.0.2.10" and links["switch.hk1"]["modell"] == "Plus Plug S"
    assert links["switch.hk1"]["ha"] == f"/config/devices/device/{shelly.id}" and links["switch.hk1"]["signal"] == "sensor.hk1_signal"
    assert links["sensor.temp_c1"]["web"] is None and links["sensor.temp_c1"]["batterie"] == "sensor.temp_c1_batterie"
    assert links["sensor.aussen"] == {"web": None, "ha": None, "geraet": None, "hersteller": None, "modell": None, "batterie": None, "signal": None}
    # Batterie-Stufe je Sensor fertig von der Integration (logik/sensoren.batterie_stufe): die Seite rechnet nichts
    fuehler = lambda: next(x for b in struktur(hass, baustelle)["bereiche"] if b["id"] == C1 for x in b["sensoren"] if x["art"] == "fuehler")
    for wert, stufe in (("90", None), ("25", None), ("24", "schwach"), ("10", "schwach"), ("9", "kritisch")):
        hass.states.async_set("sensor.temp_c1_batterie", wert)
        assert (fuehler()["batterie"], fuehler()["batterie_stufe"]) == (float(wert), stufe), wert
    hass.states.async_set("sensor.temp_c1_batterie", "unknown")
    assert fuehler()["batterie"] is None and fuehler()["batterie_stufe"] is None


async def test_fairer_vergleich_zaehlt_nur_im_thermostat(hass: HomeAssistant, baustelle, freezer, shellys) -> None:
    """AN-0008: Zähler `vgl_*` nur, wenn der Container mit Fühler im Modus Thermostat regelt und nur einen Typ hat."""
    st = baustelle.runtime_data
    hz = Heizung.von(st)
    st.einstellungen.bereich(C1)["modus"] = "thermo"
    assert hz.vergleichbar(C1) and not hz.vergleichbar(C2)          # C2 ohne Fühler
    hz.energie_buchen(st.geraete[HK1], 1.5)
    assert st.zaehler[f"vgl_kwh:{C1}"] == 1.5
    st.einstellungen.bereich(C1)["modus"] = "plan"
    assert not hz.vergleichbar(C1)
    hz.energie_buchen(st.geraete[HK1], 1.0)
    assert st.zaehler[f"vgl_kwh:{C1}"] == 1.5 and st.zaehler["energie_heizen"] >= 2.5   # gezählt, aber nicht im Vergleich


async def test_geraet_schaltet_sich_selbst_ein(hass: HomeAssistant, baustelle, freezer, shellys, nachrichten) -> None:
    """FE-0010: ein Shelly mit Auto-ON-Timer schaltet sich jede Minute selbst ein – nach dem dritten Ausschalten eine
    Störung (einmal aufs Handy), im Protokoll nicht mehr jede Minute „aus“."""
    st = baustelle.runtime_data
    st.e["staffel"]["an"] = False
    freezer.move_to("2026-09-29 20:00:00+02:00")          # außerhalb der Arbeitszeit: soll aus sein
    st.einstellung_setzen(("automatik",), True)
    await hass.async_block_till_done()
    for minute in range(1, 7):
        hass.states.async_set("switch.hk1", "on")            # das Gerät selbst (ohne Benutzer)
        await hass.async_block_till_done()
        await _zu(hass, freezer, f"2026-09-29 20:{minute:02d}:00+02:00", st)
        assert hass.states.get("switch.hk1").state == "off"
    aus = [p for p in st.e["protokoll"] if "Heizkörper 1 aus" in p[3]]
    assert len(aus) == 2                                       # danach nicht mehr jede Minute
    warn = [w for w in st.daten.warnungen if w.art == "selbst_ein"]
    assert len(warn) == 1 and warn[0].geraet == HK1
    assert sum("schaltet sich selbst wieder ein" in str(c.data) for c in nachrichten) == 1


async def test_heizzeit_eingeschaltet_und_geheizt(hass: HomeAssistant, baustelle, freezer, shellys) -> None:
    """AN-0011: Heizzeit zählt die Schaltzeit, „tatsächlich geheizt“ nur bei Stromfluss über 50 W."""
    st = baustelle.runtime_data
    st.e["staffel"]["an"] = False
    freezer.move_to(ZEHN_UHR)
    st.einstellung_setzen(("automatik",), True)
    await hass.async_block_till_done()
    assert hass.states.get("switch.hk1").state == "on"
    h0, s0 = st.zaehler.get(f"heizzeit:{C1}", 0.0), st.zaehler.get(f"heizzeit_strom:{C1}", 0.0)
    hass.states.async_set("sensor.hk1_power", "0")                 # Thermostat am Heizkörper hat abgeschaltet
    for m in range(1, 31):
        await _zu(hass, freezer, f"2026-09-29 10:{m:02d}:00+02:00", st)
    assert st.zaehler[f"heizzeit:{C1}"] - h0 == pytest.approx(0.5, abs=0.02) and st.zaehler.get(f"heizzeit_strom:{C1}", 0.0) - s0 == pytest.approx(0.0)
    hass.states.async_set("sensor.hk1_power", "1500")
    for m in range(31, 61):
        await _zu(hass, freezer, f"2026-09-29 10:{m:02d}:00+02:00" if m < 60 else "2026-09-29 11:00:00+02:00", st)
    assert st.zaehler[f"heizzeit_strom:{C1}"] - s0 == pytest.approx(0.5, abs=0.02)
    ents = struktur(hass, baustelle)["entitaeten"]
    assert any(k.endswith(f"{C1}_heizzeit_strom") for k in ents)
    # AN-0012: „heizt tatsächlich ab“ ist einstellbar – 1500 W unter 2000 W zählt nicht
    st.einstellung_setzen(("heizung", "zieht_strom_w"), 2000)
    s1 = st.zaehler[f"heizzeit_strom:{C1}"]
    for m in range(1, 11):
        await _zu(hass, freezer, f"2026-09-29 11:{m:02d}:00+02:00", st)
    assert st.zaehler[f"heizzeit_strom:{C1}"] == pytest.approx(s1)


async def test_fuehler_halten_einstellbar(hass: HomeAssistant, baustelle, freezer) -> None:
    """AN-0012: so lange gilt der letzte Wert eines Fühlers, der nichts meldet (Standard 15 min)."""
    st = baustelle.runtime_data
    hz = Heizung.von(st)
    hass.states.async_set("sensor.temp_c1", "18.5")
    t0 = dt_util.now()
    assert hz.temperatur_gehalten(C1, "sensor.temp_c1", t0) == 18.5
    hass.states.async_set("sensor.temp_c1", "unavailable")
    assert hz.temperatur_gehalten(C1, "sensor.temp_c1", t0 + timedelta(minutes=20)) is None
    st.einstellung_setzen(("heizung", "fuehler_halten_min"), 30)
    assert hz.temperatur_gehalten(C1, "sensor.temp_c1", t0 + timedelta(minutes=20)) == 18.5


async def test_geraet_inaktiv(hass: HomeAssistant, baustelle, freezer, shellys) -> None:
    """WU-0004: inaktives Gerät wird einmal ausgeschaltet, dann schaltet die Automatik es nicht mehr und es meldet nichts."""
    st = baustelle.runtime_data
    st.e["staffel"]["an"] = False
    freezer.move_to(ZEHN_UHR)
    st.einstellung_setzen(("automatik",), True)
    await hass.async_block_till_done()
    assert hass.states.get("switch.hk1").state == "on"
    st.geraet_aktiv_setzen(st.geraete[HK1], False)
    await hass.async_block_till_done()
    assert hass.states.get("switch.hk1").state == "off"
    await _zu(hass, freezer, "2026-09-29 10:10:00+02:00", st)
    assert hass.states.get("switch.hk1").state == "off"          # Arbeitszeit, aber inaktiv: bleibt aus
    assert struktur(hass, baustelle)["laufzeit"]["geraete"][HK1]["aktiv"] is False
    hass.states.async_set("switch.hk1", "unavailable")
    await _zu(hass, freezer, "2026-09-29 10:40:00+02:00", st)
    assert not any(w.geraet == HK1 for w in st.daten.warnungen)   # offline, aber inaktiv: keine Warnung
    hass.states.async_set("switch.hk1", "off")
    st.geraet_aktiv_setzen(st.geraete[HK1], True)
    await hass.async_block_till_done()
    assert hass.states.get("switch.hk1").state == "on"
    assert any("inaktiv" in t for t in _texte(st, "einstellung"))
