"""Szenarien Themenfeld 2: Tür – Türkontakt, Pause, Nachricht, „Trotzdem heizen“, Vorrang gegenüber Boost, Hand,
Bedarf, „Alle jetzt heizen“, Frostschutz, lernende Regelung (WU-0009), Kontakt nicht erreichbar, Zusatz-Heizkörper.

Standard: Dienstag 29.09.2026, Arbeitszeit 07:00–16:30, Soll 20 °C, Container 1 mit Fühler (19,0 °C), Container 2
ohne Fühler, `tuer_pause_min` 3, `tuer_melden_min` 10. Erwartetes Verhalten; Abweichungen als xfail „BEFUND“,
unklare Stellen als „FRAGE“ im Docstring (getestet wird dann das tatsächliche Verhalten).
"""

from datetime import timedelta

import pytest

from homeassistant.core import Context, HomeAssistant
from homeassistant.util import dt as dt_util

from custom_components.baustelle.daten import struktur
from custom_components.baustelle.funktionen.heizung import Heizung

from .conftest import C1, C2, HK1, HK2, baustelle_anlegen

TAG = "2026-09-29"
TUER1, TUER2 = "binary_sensor.tuer_c1", "binary_sensor.tuer_c2"


def _um(uhr: str) -> str:
    return f"{TAG} {uhr}+02:00"


async def _zu(hass, freezer, uhr: str, st) -> None:
    freezer.move_to(_um(uhr))
    st.auswerten()
    await hass.async_block_till_done()


def _texte(st, art: str | None = None) -> list[str]:
    return [p[3] for p in st.e["protokoll"] if art is None or p[1] == art]


def _an(hass, entity_id: str) -> bool:
    return hass.states.get(entity_id).state == "on"


def _c(hass, entry, bid: str = C1) -> dict:
    return struktur(hass, entry)["laufzeit"]["container"][bid]


def _tuer_nachr(nachrichten) -> list[str]:
    return [n.data["title"] for n in nachrichten if n.data["title"].startswith("🚪")]


def _tuer_warnungen(st, bid: str = C1) -> list:
    return [w for w in st.daten.warnungen if w.art == "tuer_offen" and w.bereich == bid]


async def _tuer(hass, entity_id: str, zustand: str) -> None:
    hass.states.async_set(entity_id, zustand)
    await hass.async_block_till_done()


async def _start(hass, freezer, st, uhr: str = "10:00:00", *, tuer: str | None = TUER1, bid: str = C1,
                 staffel: bool = False, automatik: bool = True) -> None:
    """Türkontakt (zu) einrichten wie auf der Seite und die Automatik einschalten."""
    st.e["staffel"]["an"] = staffel
    freezer.move_to(_um(uhr))
    if tuer:
        hass.states.async_set(tuer, "off")
        st.einstellung_setzen(("bereiche", bid, "tuer"), tuer)
    if automatik:
        st.einstellung_setzen(("automatik",), True)
    await hass.async_block_till_done()


# ====================================================================== Grundablauf mit Türkontakt
async def test_kurz_offen_unter_der_pausenzeit(hass: HomeAssistant, baustelle, freezer, shellys, nachrichten) -> None:
    """Tür 2½ min offen (< 3 min): Heizung läuft durch, keine Warnung, kein Protokoll, keine Nachricht."""
    st = baustelle.runtime_data
    await _start(hass, freezer, st)
    assert _an(hass, "switch.hk1")
    await _tuer(hass, TUER1, "on")
    await _zu(hass, freezer, "10:02:00", st)
    assert _an(hass, "switch.hk1") and st.daten.grund[C1] == "arbeitszeit"
    c = _c(hass, baustelle)
    assert c["tuer"]["offen"] is True and c["tuer"]["seit"] == "2026-09-29T10:00:00+02:00"
    assert _tuer_warnungen(st) == []
    freezer.move_to(_um("10:02:30"))
    await _tuer(hass, TUER1, "off")
    await _zu(hass, freezer, "10:05:00", st)
    assert _an(hass, "switch.hk1") and "switch.hk1" not in shellys.aus()
    assert not any("Tür" in t for t in _texte(st))
    assert nachrichten == [] and _c(hass, baustelle)["tuer"] == {"offen": False, "seit": None}


async def test_pause_genau_ab_der_pausenzeit(hass: HomeAssistant, baustelle, freezer, shellys, nachrichten) -> None:
    """Pause ab `>= tuer_pause_min`: 2:59 min heizt noch, 3:00 min aus; Kachel „pausiert · Tür offen“."""
    st = baustelle.runtime_data
    await _start(hass, freezer, st)
    await _tuer(hass, TUER1, "on")
    await _zu(hass, freezer, "10:02:59", st)
    assert _an(hass, "switch.hk1")
    await _zu(hass, freezer, "10:03:00", st)
    assert not _an(hass, "switch.hk1")
    c = _c(hass, baustelle)
    assert (c["zustand"], c["grund"], c["text"]) == ("pause", "tuer_offen", "pausiert · Tür offen")
    (w,) = _tuer_warnungen(st)
    assert w.werte == {"minuten": 3, "nachricht": False, "pausiert": True}
    assert "Tür offen – Heizung pausiert" in _texte(st, "schalten")
    assert "Tür offen – Heizung pausiert – Heizkörper 1 aus" in _texte(st, "schalten")
    assert nachrichten == []


async def test_nachricht_einmal_und_wiederaufnahme(hass: HomeAssistant, baustelle, freezer, shellys, nachrichten) -> None:
    """Nachricht genau einmal nach 10 min; Tür zu → sofort wieder heizen + „Tür zu“; neues Öffnen → neue Nachricht."""
    st = baustelle.runtime_data
    await _start(hass, freezer, st)
    await _tuer(hass, TUER1, "on")
    await _zu(hass, freezer, "10:09:59", st)
    assert nachrichten == []
    await _zu(hass, freezer, "10:10:00", st)
    (n,) = nachrichten
    assert n.data["title"] == "🚪 Container 1: Tür seit 10 min offen"
    assert n.data["message"] == "Die Heizung ist pausiert und heizt wieder, sobald die Tür zu ist."
    assert [a["title"] for a in n.data["data"]["actions"]] == ["Trotzdem heizen", "1 h stumm"]
    await _zu(hass, freezer, "10:20:00", st)
    assert len(nachrichten) == 1                                   # nur einmal je Öffnen
    await _tuer(hass, TUER1, "off")
    assert _an(hass, "switch.hk1") and st.daten.grund[C1] == "arbeitszeit"
    assert "Tür zu – Heizung läuft weiter" in _texte(st, "ok")
    assert _tuer_warnungen(st) == []
    # nochmal offen: wieder Pause, wieder Nachricht
    await _zu(hass, freezer, "10:30:00", st)
    await _tuer(hass, TUER1, "on")
    await _zu(hass, freezer, "10:33:00", st)
    assert not _an(hass, "switch.hk1")
    await _zu(hass, freezer, "10:40:00", st)
    assert len(nachrichten) == 2


async def test_pause_null_minuten_sofort(hass: HomeAssistant, baustelle, freezer, shellys, nachrichten) -> None:
    """`tuer_pause_min` 0: die Zustandsänderung des Kontakts schaltet sofort aus (ohne Minutentakt)."""
    st = baustelle.runtime_data
    st.e["heizung"]["tuer_pause_min"] = 0
    await _start(hass, freezer, st)
    assert _an(hass, "switch.hk1")
    await _tuer(hass, TUER1, "on")
    assert not _an(hass, "switch.hk1") and st.daten.grund[C1] == "tuer_offen"


async def test_stumm_1h(hass: HomeAssistant, baustelle, freezer, shellys, nachrichten) -> None:
    """Szenarien, Herbert 01.10.2026: Knopf „1 h stumm“ blendet die Warnung 1 h aus; ist die Tür danach noch offen,
    kommt die Nachricht noch einmal (Erinnerung)."""
    st = baustelle.runtime_data
    await _start(hass, freezer, st)
    await _tuer(hass, TUER1, "on")
    await _zu(hass, freezer, "10:10:00", st)
    assert len(nachrichten) == 1
    (w,) = _tuer_warnungen(st)
    st.nachrichten.knopf("stumm_1h", w.key)
    await _zu(hass, freezer, "10:30:00", st)
    assert len(nachrichten) == 1 and not _an(hass, "switch.hk1")   # stumm, Heizung bleibt pausiert
    w_lz = next(x for x in struktur(hass, baustelle)["laufzeit"]["warnungen"] if x["key"] == w.key)
    assert w_lz["stumm_bis"] == "2026-09-29T11:10:00+02:00"
    await _zu(hass, freezer, "11:10:01", st)
    assert len(nachrichten) == 2                                   # nach der Stunde: Erinnerung
    await _zu(hass, freezer, "11:20:00", st)
    assert len(nachrichten) == 2                                   # nur einmal
    w_lz = next(x for x in struktur(hass, baustelle)["laufzeit"]["warnungen"] if x["key"] == w.key)
    assert w_lz["stumm_bis"] is None and not _an(hass, "switch.hk1")


async def test_tuer_schon_offen_beim_einschalten(hass: HomeAssistant, baustelle, freezer, shellys, nachrichten) -> None:
    """Tür seit 09:00 offen, Automatik um 10:00 ein: gar nicht erst einschalten, Nachricht sofort (60 min)."""
    st = baustelle.runtime_data
    st.e["staffel"]["an"] = False
    freezer.move_to(_um("09:00:00"))
    hass.states.async_set(TUER1, "on")
    st.einstellung_setzen(("bereiche", C1, "tuer"), TUER1)
    await _zu(hass, freezer, "10:00:00", st)
    st.einstellung_setzen(("automatik",), True)
    await hass.async_block_till_done()
    assert "switch.hk1" not in shellys.ein() and _an(hass, "switch.hk2")   # Container 2 heizt
    assert st.daten.grund[C1] == "tuer_offen"
    assert _tuer_nachr(nachrichten) == ["🚪 Container 1: Tür seit 60 min offen"]


async def test_tuer_nur_im_eigenen_container(hass: HomeAssistant, baustelle, freezer, shellys, nachrichten) -> None:
    """Tür in Container 2 offen: nur Container 2 pausiert, Container 1 heizt weiter."""
    st = baustelle.runtime_data
    await _start(hass, freezer, st, tuer=TUER2, bid=C2)
    await _tuer(hass, TUER2, "on")
    await _zu(hass, freezer, "10:04:00", st)
    assert _an(hass, "switch.hk1") and not _an(hass, "switch.hk2")
    assert st.daten.grund[C1] == "arbeitszeit" and st.daten.grund[C2] == "tuer_offen"
    assert _c(hass, baustelle, C1)["tuer"] is None                 # ohne Kontakt kein Türfeld


# ====================================================================== außerhalb der Heizzeit / Automatik aus
async def test_tuer_offen_ueber_nacht(hass: HomeAssistant, baustelle, freezer, shellys, nachrichten) -> None:
    """Szenarien, Herbert 01.10.2026: Tür um 21:00 offen (außerhalb der Heizzeit, kein Frost). Es wird ohnehin nicht
    geheizt – nichts pausiert: Grund bleibt „ausserhalb“, die Kachel zeigt „aus bis morgen 06:15 · 🚪 Tür offen“, Protokoll
    „Tür offen“ (Warnung), nach 10 min „Es wird gerade nicht geheizt – bitte prüfen …“ nur mit „1 h stumm“.
    Bleibt sie bis zum Morgen offen, pausiert sie ab Arbeitsbeginn (dann würde geheizt)."""
    st = baustelle.runtime_data
    await _start(hass, freezer, st, "21:00:00")
    assert not _an(hass, "switch.hk1") and st.daten.grund[C1] == "ausserhalb"
    await _tuer(hass, TUER1, "on")
    await _zu(hass, freezer, "21:11:00", st)
    assert "switch.hk1" not in shellys.ein()
    c = _c(hass, baustelle)
    assert (c["zustand"], c["grund"], c["text"]) == ("aus", "ausserhalb", "aus bis morgen 06:15 · 🚪 Tür offen")
    (w,) = _tuer_warnungen(st)
    assert w.werte["pausiert"] is False
    assert "Tür offen" in _texte(st, "warnung") and not any("pausiert" in t for t in _texte(st))
    assert _tuer_nachr(nachrichten) == ["🚪 Container 1: Tür seit 11 min offen"]
    (n,) = [n for n in nachrichten if n.data["title"].startswith("🚪")]
    assert n.data["message"] == "Es wird gerade nicht geheizt – bitte prüfen, ob die Tür offen bleiben soll."
    assert [a["title"] for a in n.data["data"]["actions"]] == ["1 h stumm"]
    # bis zum Morgen offen: um 07:00 (Arbeitsbeginn) würde geheizt → jetzt pausiert
    freezer.move_to("2026-09-30 07:00:00+02:00")
    st.auswerten()
    await hass.async_block_till_done()
    assert not _an(hass, "switch.hk1") and st.daten.grund[C1] == "tuer_offen"
    assert _c(hass, baustelle)["text"] == "pausiert · Tür offen"
    assert len(_tuer_nachr(nachrichten)) == 1                      # über Nacht nur einmal


async def test_tuer_offen_nachts_wieder_zu(hass: HomeAssistant, baustelle, freezer, shellys, nachrichten) -> None:
    """Szenarien, Herbert 01.10.2026: Tür nachts offen und wieder zu – Protokoll „Tür offen“ / „Tür wieder zu“,
    nichts wird geschaltet, die Kachel ist wieder „aus bis morgen 06:15“."""
    st = baustelle.runtime_data
    await _start(hass, freezer, st, "21:00:00")
    await _tuer(hass, TUER1, "on")
    await _zu(hass, freezer, "21:05:00", st)
    freezer.move_to(_um("21:06:00"))
    await _tuer(hass, TUER1, "off")
    await _zu(hass, freezer, "21:07:00", st)
    assert "Tür wieder zu" in _texte(st, "ok") and "Tür zu – Heizung läuft weiter" not in _texte(st)
    assert _tuer_warnungen(st) == [] and _c(hass, baustelle)["text"] == "aus bis morgen 06:15"
    assert [a for a in shellys.aufrufe if a[0] == "switch.hk1"] == []


async def test_tuer_offen_bei_automatik_aus(hass: HomeAssistant, baustelle, freezer, shellys, nachrichten) -> None:
    """Szenarien, Herbert 01.10.2026: Automatik aus (nichts wird geschaltet), Tür 11 min offen → nur ein Hinweis:
    Warnung `tuer_offen` mit `pausiert` False, Nachricht „Es wird gerade nicht geheizt …“ ohne „Trotzdem heizen“."""
    st = baustelle.runtime_data
    await _start(hass, freezer, st, automatik=False)
    await _tuer(hass, TUER1, "on")
    await _zu(hass, freezer, "10:11:00", st)
    assert shellys.aufrufe == []
    assert st.daten.grund[C1] == "automatik_aus"
    (w,) = _tuer_warnungen(st)
    assert w.werte["pausiert"] is False
    assert _tuer_nachr(nachrichten) == ["🚪 Container 1: Tür seit 11 min offen"]
    (n,) = [n for n in nachrichten if n.data["title"].startswith("🚪")]
    assert n.data["message"].startswith("Es wird gerade nicht geheizt")
    assert [a["title"] for a in n.data["data"]["actions"]] == ["1 h stumm"]


# ====================================================================== Vorrang gegenüber anderen Gründen
async def test_frost_geht_vor_tuer(hass: HomeAssistant, baustelle, freezer, shellys, nachrichten) -> None:
    """Frostschutz geht der Tür vor (Reihenfolge regelung.py): bei 4 °C heizt er trotz offener Tür."""
    st = baustelle.runtime_data
    hass.states.async_set("sensor.temp_c1", "4.0")
    await _start(hass, freezer, st, "21:00:00")
    assert _an(hass, "switch.hk1") and st.daten.grund[C1] == "frost"
    await _tuer(hass, TUER1, "on")
    await _zu(hass, freezer, "21:05:00", st)
    assert _an(hass, "switch.hk1")
    c = _c(hass, baustelle)
    assert (c["zustand"], c["grund"], c["text"]) == ("frost", "frost", "Frostschutz")


async def test_frost_mit_tuer_meldet_keine_pause(hass: HomeAssistant, baustelle, freezer, shellys, nachrichten) -> None:
    st = baustelle.runtime_data
    hass.states.async_set("sensor.temp_c1", "4.0")
    await _start(hass, freezer, st, "21:00:00")
    await _tuer(hass, TUER1, "on")
    await _zu(hass, freezer, "21:11:00", st)
    assert _an(hass, "switch.hk1")
    assert not any("pausiert" in t for t in _texte(st))
    assert not any("pausiert" in n.data["message"] for n in nachrichten)


async def test_boost_wird_von_tuer_pausiert(hass: HomeAssistant, baustelle, freezer, shellys, nachrichten) -> None:
    """Schnell aufheizen: Tür offen pausiert auch den Boost; nach dem Schließen läuft der Boost (noch nicht abgelaufen)
    weiter. Der Boost verlängert sich durch die Pause nicht."""
    st = baustelle.runtime_data
    hass.states.async_set("sensor.temp_c1", "17.0")
    await _start(hass, freezer, st, "18:00:00")                    # außerhalb: nur der Boost heizt
    st.lz["boost_bis"][C1] = _um("19:00:00").replace(" ", "T")
    await _zu(hass, freezer, "18:00:10", st)
    assert _an(hass, "switch.hk1") and st.daten.grund[C1] == "boost"
    await _tuer(hass, TUER1, "on")
    await _zu(hass, freezer, "18:03:10", st)
    assert not _an(hass, "switch.hk1") and st.daten.grund[C1] == "tuer_offen"
    assert C1 in st.lz["boost_bis"]                                # Boost bleibt gesetzt
    freezer.move_to(_um("18:10:00"))
    await _tuer(hass, TUER1, "off")
    assert _an(hass, "switch.hk1") and st.daten.grund[C1] == "boost"
    assert _c(hass, baustelle)["boost_bis"] == "2026-09-29T19:00:00+02:00"


async def test_hand_endet_bei_tuer_offen(hass: HomeAssistant, baustelle, freezer, shellys, nachrichten) -> None:
    """Handbetrieb (von Hand ein, abends): Tür offen ≥ 3 min beendet die Hand (Vorrang), Heizkörper aus; kurzes
    Öffnen (< 3 min) lässt die Hand bestehen."""
    st = baustelle.runtime_data
    await _start(hass, freezer, st, "19:00:00")
    hass.states.async_set("sensor.hk1_power", "1900")
    hass.states.async_set("switch.hk1", "on", context=Context(user_id="nutzer"))
    await hass.async_block_till_done()
    assert HK1 in st.lz["hand"]
    await _tuer(hass, TUER1, "on")
    await _zu(hass, freezer, "19:02:00", st)
    assert HK1 in st.lz["hand"] and _an(hass, "switch.hk1")       # kurz offen: Hand bleibt
    await _zu(hass, freezer, "19:03:00", st)
    assert HK1 not in st.lz["hand"] and not _an(hass, "switch.hk1")
    assert "Heizkörper 1: Automatik übernimmt (Tür offen – Heizung pausiert)" in _texte(st, "schalten")
    await _tuer(hass, TUER1, "off")
    assert not _an(hass, "switch.hk1") and st.daten.grund[C1] == "ausserhalb"   # danach normale Automatik


async def test_bedarf_wird_von_tuer_pausiert(hass: HomeAssistant, baustelle, freezer, shellys, nachrichten) -> None:
    """Bei-Bedarf-Container mit laufendem Bedarf (Schalter): Tür pausiert, nach dem Schließen heizt der Bedarf weiter."""
    st = baustelle.runtime_data
    st.einstellungen.bereich(C2)["bedarf"] = True
    await _start(hass, freezer, st, "18:00:00", tuer=TUER2, bid=C2)
    st.lz["bedarf_bis"][C2] = "2026-09-29T20:00:00+02:00"
    await _zu(hass, freezer, "18:00:10", st)
    assert _an(hass, "switch.hk2") and st.daten.grund[C2] == "bedarf"
    await _tuer(hass, TUER2, "on")
    await _zu(hass, freezer, "18:03:10", st)
    assert not _an(hass, "switch.hk2") and st.daten.grund[C2] == "tuer_offen"
    await _tuer(hass, TUER2, "off")
    assert _an(hass, "switch.hk2") and st.daten.grund[C2] == "bedarf"
    assert _c(hass, baustelle, C2)["text"] == "heizt bis 20:00"


async def test_termin_wird_von_tuer_pausiert(hass: HomeAssistant, baustelle, freezer, shellys, nachrichten) -> None:
    """Bedarfs-Termin (Kalender) im Vorheizen/Termin: Tür pausiert ebenso."""
    st = baustelle.runtime_data
    st.einstellungen.bereich(C2)["bedarf"] = True
    await _start(hass, freezer, st, "18:00:00", tuer=TUER2, bid=C2)
    Heizung.von(st).termine = [{"bereich": C2, "von": "2026-09-29T18:30:00+02:00", "bis": "2026-09-29T20:00:00+02:00",
                                "titel": "Besprechung", "uid": "", "rrule": None, "wiederholung": None, "boost": False}]
    await _zu(hass, freezer, "18:00:10", st)
    assert _an(hass, "switch.hk2") and st.daten.grund[C2] == "bedarf"   # Vorheizen 30 min
    await _tuer(hass, TUER2, "on")
    await _zu(hass, freezer, "18:03:10", st)
    assert not _an(hass, "switch.hk2") and st.daten.grund[C2] == "tuer_offen"


async def test_alle_jetzt_heizen_wird_von_tuer_pausiert(hass: HomeAssistant, baustelle, freezer, shellys, nachrichten) -> None:
    """„Alle jetzt heizen“ abends: der Container mit offener Tür pausiert, der andere heizt."""
    st = baustelle.runtime_data
    await _start(hass, freezer, st, "19:00:00")
    st.lz["jetzt_bis"] = "2026-09-29T20:00:00+02:00"
    await _zu(hass, freezer, "19:00:10", st)
    assert _an(hass, "switch.hk1") and _an(hass, "switch.hk2")
    await _tuer(hass, TUER1, "on")
    await _zu(hass, freezer, "19:03:10", st)
    assert not _an(hass, "switch.hk1") and _an(hass, "switch.hk2")
    assert st.daten.grund[C1] == "tuer_offen"
    await _tuer(hass, TUER1, "off")
    assert _an(hass, "switch.hk1")


# ====================================================================== „Trotzdem heizen“
async def test_trotzdem_heizen_bis_die_tuer_zu_ist(hass: HomeAssistant, baustelle, freezer, shellys, nachrichten) -> None:
    """Knopf „Trotzdem heizen“: heizt sofort trotz offener Tür, keine Tür-Warnung mehr; Tür zu → „trotzdem“ vorbei;
    nächstes Öffnen pausiert wieder."""
    st = baustelle.runtime_data
    await _start(hass, freezer, st)
    await _tuer(hass, TUER1, "on")
    await _zu(hass, freezer, "10:10:00", st)
    assert len(nachrichten) == 1 and not _an(hass, "switch.hk1")
    st.nachrichten.knopf("trotzdem", C1)
    await _zu(hass, freezer, "10:10:05", st)
    assert _an(hass, "switch.hk1") and st.daten.grund[C1] == "arbeitszeit"
    assert _tuer_warnungen(st) == []
    assert _c(hass, baustelle)["tuer"]["offen"] is True           # die Seite sieht die offene Tür weiter
    assert "Knopf „Trotzdem heizen“: heizt trotz offener Tür, bis sie zu ist" in _texte(st, "nachricht")
    await _zu(hass, freezer, "10:30:00", st)
    assert _an(hass, "switch.hk1") and len(nachrichten) == 1      # keine neue Nachricht
    await _tuer(hass, TUER1, "off")
    assert C1 not in Heizung.von(st).tuer_trotzdem
    await _zu(hass, freezer, "10:40:00", st)
    await _tuer(hass, TUER1, "on")
    await _zu(hass, freezer, "10:43:00", st)
    assert not _an(hass, "switch.hk1") and st.daten.grund[C1] == "tuer_offen"


async def test_trotzdem_heizen_protokoll_nicht_tuer_zu(hass: HomeAssistant, baustelle, freezer, shellys, nachrichten) -> None:
    st = baustelle.runtime_data
    await _start(hass, freezer, st)
    await _tuer(hass, TUER1, "on")
    await _zu(hass, freezer, "10:10:00", st)
    st.nachrichten.knopf("trotzdem", C1)
    await _zu(hass, freezer, "10:10:05", st)
    assert _c(hass, baustelle)["tuer"]["offen"] is True
    assert "Tür zu – Heizung läuft weiter" not in _texte(st, "ok")


async def test_trotzdem_heizen_ueberlebt_neuladen(hass: HomeAssistant, baustelle, freezer, shellys, nachrichten) -> None:
    """Szenarien, Herbert 01.10.2026: „Trotzdem heizen“ steht im Store (`lz["tuer_trotzdem"]`) und übersteht ein
    Neuladen (HA-Neustart): die Heizung läuft weiter; erst wenn die Tür zu ist, wird der Eintrag gelöscht."""
    st = baustelle.runtime_data
    await _start(hass, freezer, st)
    await _tuer(hass, TUER1, "on")
    await _zu(hass, freezer, "10:10:00", st)
    st.nachrichten.knopf("trotzdem", C1)
    await _zu(hass, freezer, "10:10:05", st)
    assert _an(hass, "switch.hk1")
    assert st.lz["tuer_trotzdem"] == [C1]
    assert await hass.config_entries.async_reload(baustelle.entry_id)
    await hass.async_block_till_done()
    shellys.anmelden()
    st = baustelle.runtime_data
    await _zu(hass, freezer, "10:11:00", st)
    assert C1 in Heizung.von(st).tuer_trotzdem
    assert _an(hass, "switch.hk1") and st.daten.grund[C1] != "tuer_offen"
    # Tür zu: „Trotzdem“ ist erledigt, auch im Store
    await _tuer(hass, TUER1, "off")
    await _zu(hass, freezer, "10:12:00", st)
    assert C1 not in Heizung.von(st).tuer_trotzdem and st.lz["tuer_trotzdem"] == []


async def test_tuer_offen_ueberlebt_neustart(hass: HomeAssistant, baustelle, freezer, shellys, nachrichten) -> None:
    """FE-0036/37: Tür seit 10:00 offen, um 12:00 startet HA neu – der Kontakt meldet sich mit neuem Wechsel (HA setzt
    last_changed neu). Die Pause läuft weiter, offen seit 10:00. Fehlt der Kontakt beim Start kurz, vergisst die Warnung
    „schon gemeldet“ (wie bisher) – die erneute Nachricht nennt jetzt die richtige Dauer."""
    st = baustelle.runtime_data
    await _start(hass, freezer, st)
    await _tuer(hass, TUER1, "on")
    await _zu(hass, freezer, "10:10:00", st)
    assert not _an(hass, "switch.hk1") and len(_tuer_nachr(nachrichten)) == 1
    freezer.move_to(_um("12:00:00"))
    assert await hass.config_entries.async_reload(baustelle.entry_id)
    await hass.async_block_till_done()
    shellys.anmelden()
    st = baustelle.runtime_data
    freezer.move_to(_um("12:01:00"))
    hass.states.async_remove(TUER1)
    await _tuer(hass, TUER1, "on")                                   # neuer last_changed wie nach dem HA-Neustart
    await _zu(hass, freezer, "12:01:30", st)
    assert not _an(hass, "switch.hk1") and st.daten.grund[C1] == "tuer_offen"
    assert _c(hass, baustelle)["tuer"] == {"offen": True, "seit": dt_util.parse_datetime(_um("10:00:00")).isoformat()}
    assert _tuer_nachr(nachrichten)[1:] == ["🚪 Container 1: Tür seit 121 min offen"]
    # Tür zu: Merker weg, nächste Öffnung zählt neu
    await _tuer(hass, TUER1, "off")
    await _zu(hass, freezer, "12:20:00", st)
    assert _an(hass, "switch.hk1") and TUER1 not in st.lz["kontakt_offen"]
    await _tuer(hass, TUER1, "on")
    await _zu(hass, freezer, "12:21:00", st)
    assert _an(hass, "switch.hk1")


# ====================================================================== Türkontakt nicht erreichbar
async def test_kontakt_unavailable_gilt_als_zu(hass: HomeAssistant, baustelle, freezer, shellys, nachrichten) -> None:
    """FRAGE: Kontakt geht während der Pause auf „unavailable“ → gilt als zu: Heizung läuft sofort wieder,
    Protokoll „Tür zu“, keine Warnung über den fehlenden Kontakt. Kommt er mit „on“ zurück, beginnt die Zeit neu
    (last_changed) – Pause nach 3 min, Nachricht erneut nach 10 min. Getestet: tatsächliches Verhalten."""
    st = baustelle.runtime_data
    await _start(hass, freezer, st)
    await _tuer(hass, TUER1, "on")
    await _zu(hass, freezer, "10:10:00", st)
    assert not _an(hass, "switch.hk1") and len(nachrichten) == 1
    await _tuer(hass, TUER1, "unavailable")
    assert _an(hass, "switch.hk1") and st.daten.grund[C1] == "arbeitszeit"
    assert _c(hass, baustelle)["tuer"] == {"offen": False, "seit": None}
    assert "Tür zu – Heizung läuft weiter" in _texte(st, "ok")
    assert not any(w.bereich == C1 for w in st.daten.warnungen)
    freezer.move_to(_um("10:11:00"))
    await _tuer(hass, TUER1, "on")
    assert _an(hass, "switch.hk1")                                 # Zeit läuft neu
    await _zu(hass, freezer, "10:14:00", st)
    assert not _an(hass, "switch.hk1")
    await _zu(hass, freezer, "10:21:00", st)
    assert len(nachrichten) == 2 and nachrichten[-1].data["title"] == "🚪 Container 1: Tür seit 10 min offen"


async def test_kontakt_fehlt_ganz(hass: HomeAssistant, baustelle, freezer, shellys, nachrichten) -> None:
    """Eingetragener Kontakt existiert nicht (umbenannt): heizt normal, kein Absturz, Türfeld „zu“."""
    st = baustelle.runtime_data
    st.e["staffel"]["an"] = False
    freezer.move_to(_um("10:00:00"))
    st.einstellung_setzen(("bereiche", C1, "tuer"), "binary_sensor.gibt_es_nicht")
    st.einstellung_setzen(("automatik",), True)
    await hass.async_block_till_done()
    assert _an(hass, "switch.hk1") and _c(hass, baustelle)["tuer"] == {"offen": False, "seit": None}


# ====================================================================== Container ohne Fühler, zwei Heizkörper
async def test_tuer_in_container_ohne_fuehler(hass: HomeAssistant, baustelle, freezer, shellys, nachrichten) -> None:
    """Container 2 (ohne Fühler, Modus Zeitplan): Pause, Nachricht und Wiederaufnahme wie mit Fühler; kein Lernstand."""
    st = baustelle.runtime_data
    await _start(hass, freezer, st, tuer=TUER2, bid=C2)
    assert _an(hass, "switch.hk2")
    await _tuer(hass, TUER2, "on")
    await _zu(hass, freezer, "10:10:00", st)
    c = _c(hass, baustelle, C2)
    assert not _an(hass, "switch.hk2") and (c["zustand"], c["text"]) == ("pause", "pausiert · Tür offen")
    assert c["lernen"] is None
    assert _tuer_nachr(nachrichten) == ["🚪 Container 2: Tür seit 10 min offen"]
    await _tuer(hass, TUER2, "off")
    assert _an(hass, "switch.hk2")


async def test_primaer_gewaehlt_heizt_zuerst(hass: HomeAssistant, freezer, shellys, nachrichten) -> None:
    """AN-0015: Im Container ist Heizkörper 2 primär – knapp unter dem Soll heizt nur er, Heizkörper 1 ist Zusatz und
    wartet; die Seite bekommt haupt/zusatz entsprechend."""
    entry = await baustelle_anlegen(hass, freezer, hk2_bereich=C1)
    assert await hass.config_entries.async_setup(entry.entry_id)
    await hass.async_block_till_done()
    shellys.anmelden()
    st = entry.runtime_data
    st.einstellungen.bereich(C1)["modus"] = "thermo"
    st.einstellung_setzen(("bereiche", C1, "stufen"), True)
    st.einstellung_setzen(("bereiche", C1, "primaer"), HK2)
    hass.states.async_set("sensor.aussen", "8.0")
    st.einstellungen.bereich(C1)["soll"] = 20.0
    hass.states.async_set("sensor.temp_c1", "19.5")
    await _start(hass, freezer, st)
    s = _c(hass, entry)["stufen"]
    assert s["haupt"] == [HK2] and s["zusatz"] == [HK1] and not s["zusatz_an"] and s["auto"] == [HK1]
    assert _an(hass, "switch.hk2") and not _an(hass, "switch.hk1")


async def test_tuer_mit_zwei_heizkoerpern_und_zusatz(hass: HomeAssistant, freezer, shellys, nachrichten) -> None:
    """AN-0006: Container 1 mit Haupt- und Zusatz-Heizkörper (weit unter Soll: beide). Tür offen → beide aus, Zusatz
    gilt als aus; Tür zu → beide wieder (weit unter Soll)."""
    entry = await baustelle_anlegen(hass, freezer, hk2_bereich=C1)
    assert await hass.config_entries.async_setup(entry.entry_id)
    await hass.async_block_till_done()
    shellys.anmelden()
    st = entry.runtime_data
    st.einstellungen.bereich(C1)["modus"] = "thermo"
    st.einstellung_setzen(("bereiche", C1, "stufen"), True)
    hass.states.async_set("sensor.aussen", "3.0")
    hass.states.async_set("sensor.temp_c1", "18.0")
    await _start(hass, freezer, st)
    assert _an(hass, "switch.hk1") and _an(hass, "switch.hk2")
    assert _c(hass, entry)["stufen"]["grund"] == "weit_unter"
    await _tuer(hass, TUER1, "on")
    await _zu(hass, freezer, "10:03:00", st)
    assert not _an(hass, "switch.hk1") and not _an(hass, "switch.hk2")
    s = _c(hass, entry)["stufen"]
    assert s["zusatz_an"] is False
    assert "Tür offen – Heizung pausiert – Heizkörper 1, Heizkörper 2 aus" in _texte(st, "schalten")
    await _tuer(hass, TUER1, "off")
    assert _an(hass, "switch.hk1") and _an(hass, "switch.hk2")


async def test_tuer_zu_mit_staffelung_mindestpause(hass: HomeAssistant, baustelle, freezer, shellys, nachrichten) -> None:
    """Mit Staffelung: Tür offen schaltet sofort aus (Mindestlaufzeit gilt nicht); nach dem Schließen wartet der
    Heizkörper die Mindestpause (5 min) ab, bevor er wieder einschaltet."""
    st = baustelle.runtime_data
    await _start(hass, freezer, st, staffel=True)
    await _zu(hass, freezer, "10:00:30", st)
    assert _an(hass, "switch.hk1")
    await _tuer(hass, TUER1, "on")
    await _zu(hass, freezer, "10:03:30", st)                       # nach 3 min Laufzeit (< min_lauf 10): trotzdem aus
    assert not _an(hass, "switch.hk1")
    freezer.move_to(_um("10:04:30"))
    await _tuer(hass, TUER1, "off")
    assert not _an(hass, "switch.hk1")
    assert struktur(hass, baustelle)["laufzeit"]["geraete"][HK1]["warte"]["grund"] == "mindestpause"
    await _zu(hass, freezer, "10:08:31", st)
    assert _an(hass, "switch.hk1")


# ====================================================================== lernende Regelung (WU-0009)
async def _lernend(hass, freezer, st, *, aussen: float = 5.0) -> None:
    st.einstellungen.bereich(C1)["soll"] = 20.0
    st.einstellung_setzen(("bereiche", C1, "lernen"), True)
    hass.states.async_set("sensor.aussen", str(aussen))


def _minuten(hass, freezer, st, start: str):
    t = dt_util.parse_datetime(_um(start))

    async def minute(temp: float, aussen: float | None = None) -> None:
        nonlocal t
        hass.states.async_set("sensor.temp_c1", str(temp))
        if aussen is not None:
            hass.states.async_set("sensor.aussen", str(aussen))
        t += timedelta(minutes=1)
        freezer.move_to(t)
        st.auswerten()
        await hass.async_block_till_done()

    return minute


async def test_lernen_tuerkontakt_verwirft_messungen(hass: HomeAssistant, baustelle, freezer, shellys, nachrichten) -> None:
    """WU-0009: Kontakt offen → lernen.offen = kontakt, laufendes Aufheizen verworfen, nach dem Pausen-Aus keine
    Nachlauf-Beobachtung; nach dem Schließen 10 min Ruhe, dann lernt er wieder (neues Aufheizen)."""
    st = baustelle.runtime_data
    await _lernend(hass, freezer, st)
    hass.states.async_set("sensor.temp_c1", "16.0")
    await _start(hass, freezer, st)
    minute = _minuten(hass, freezer, st, "10:00:00")
    for i in range(5):
        await minute(16.0 + 0.1 * i)
    assert st.lz["lernen"][C1]["auf"] is not None and _an(hass, "switch.hk1")
    await _tuer(hass, TUER1, "on")                                 # 10:05
    await minute(16.4)
    stand = st.lz["lernen"][C1]
    assert stand["offen"]["art"] == "kontakt" and stand["auf"] is None and stand["ruhe_bis"]
    for _ in range(3):
        await minute(16.2)                                         # 10:09 → Pause seit 10:08
    assert not _an(hass, "switch.hk1")
    assert st.lz["lernen"][C1]["beob"] is None                     # Ausschalten wegen Tür: kein Nachlauf
    assert st.lz["lernen"][C1]["zyklen"] == 0 and st.lz["lernen"][C1]["aufheizen"] == {}
    assert _c(hass, baustelle)["lernen"]["offen"]["art"] == "kontakt"
    await _tuer(hass, TUER1, "off")
    assert _an(hass, "switch.hk1")
    for _ in range(5):
        await minute(16.0)
    assert st.lz["lernen"][C1]["offen"] is not None and st.lz["lernen"][C1]["auf"] is None   # Ruhezeit
    for _ in range(7):
        await minute(16.1)
    stand = st.lz["lernen"][C1]
    assert stand["offen"] is None and stand["auf"] is not None      # lernt wieder


async def test_lernen_trotzdem_heizen_lernt_nicht(hass: HomeAssistant, baustelle, freezer, shellys, nachrichten) -> None:
    """„Trotzdem heizen“ heizt, die lernende Regelung lernt bei offener Tür trotzdem nicht."""
    st = baustelle.runtime_data
    await _lernend(hass, freezer, st)
    hass.states.async_set("sensor.temp_c1", "16.0")
    await _start(hass, freezer, st)
    minute = _minuten(hass, freezer, st, "10:00:00")
    await _tuer(hass, TUER1, "on")
    Heizung.von(st).tuer_trotzdem.add(C1)
    for _ in range(15):
        await minute(16.5)
    assert _an(hass, "switch.hk1")
    stand = st.lz["lernen"][C1]
    assert stand["offen"]["art"] == "kontakt" and stand["auf"] is None


async def test_tuer_vermutet_ohne_kontakt(hass: HomeAssistant, baustelle, freezer, shellys, nachrichten) -> None:
    """Ohne Kontakt: Raum fällt beim Heizen um ≥ 0,3 °C in 10 min, draußen konstant → „vermutet“, Protokoll-Warnung,
    die Heizung pausiert 10 min (FE-0025, keine Nachricht) und versucht es danach neu; Raum wieder wärmer → nach der
    Ruhe „lernt weiter“."""
    st = baustelle.runtime_data
    await _lernend(hass, freezer, st)
    hass.states.async_set("sensor.temp_c1", "16.0")
    await _start(hass, freezer, st, tuer=None)
    minute = _minuten(hass, freezer, st, "10:00:00")
    for i in range(13):
        await minute(16.5 - 0.04 * i)
    stand = st.lz["lernen"][C1]
    assert stand["offen"]["art"] == "vermutet"
    assert "Tür vermutlich offen – der Raum kühlt beim Heizen ab, Heizung pausiert 10 min" in _texte(st, "warnung")
    assert not _an(hass, "switch.hk1") and st.daten.grund[C1] == "tuer_offen" and nachrichten == []
    assert _tuer_warnungen(st) == []
    for _ in range(9):    # während der Pause: Vermutung bleibt, kein „lernt weiter“
        await minute(16.0)
    assert st.lz["lernen"][C1]["offen"]["art"] == "vermutet" and "Raum wird wieder wärmer – die lernende Regelung lernt weiter" not in _texte(st, "ok")
    await minute(16.0)    # Pause vorbei: heizt wieder
    assert _an(hass, "switch.hk1") and st.daten.grund[C1] == "arbeitszeit"
    for i in range(25):
        await minute(16.2 + 0.05 * i)
    assert st.lz["lernen"][C1]["offen"] is None
    assert "Raum wird wieder wärmer – die lernende Regelung lernt weiter" in _texte(st, "ok")
    assert _texte(st, "warnung").count("Tür vermutlich offen – der Raum kühlt beim Heizen ab, Heizung pausiert 10 min") == 1


async def test_tuer_vermutet_ohne_lernen_bei_taktendem_radiator(hass: HomeAssistant, baustelle, freezer, shellys, nachrichten) -> None:
    """FE-0025: Lernen aus, Plug durchgehend an, der Radiator taktet selbst (3 min Strom, 4 min nicht), der Raum wird
    in 30 min 0,8 °C kälter → Tür vermutlich offen, Heizung pausiert."""
    st = baustelle.runtime_data
    st.einstellungen.bereich(C1)["soll"] = 20.0
    hass.states.async_set("sensor.aussen", "5.0")
    hass.states.async_set("sensor.temp_c1", "19.1")
    await _start(hass, freezer, st, tuer=None)
    minute = _minuten(hass, freezer, st, "10:00:00")
    for i in range(33):
        hass.states.async_set("sensor.hk1_power", "2300" if i % 7 < 3 else "0")
        await minute(19.1 - 0.027 * i)
        if i < 29:
            assert _an(hass, "switch.hk1"), i
    assert "Tür vermutlich offen – der Raum kühlt beim Heizen ab, Heizung pausiert 10 min" in _texte(st, "warnung")
    assert not _an(hass, "switch.hk1") and st.daten.grund[C1] == "tuer_offen"


async def test_tuer_vermutet_mit_geschlossenem_kontakt(hass: HomeAssistant, baustelle, freezer, shellys, nachrichten) -> None:
    """Kontakt zu (z. B. Fenster ohne Sensor offen): die Vermutung greift trotzdem (art „vermutet“, nicht „kontakt“)
    und pausiert die Heizung (FE-0025)."""
    st = baustelle.runtime_data
    await _lernend(hass, freezer, st)
    hass.states.async_set("sensor.temp_c1", "16.0")
    await _start(hass, freezer, st)
    minute = _minuten(hass, freezer, st, "10:00:00")
    for i in range(13):
        await minute(16.5 - 0.04 * i)
    assert not _an(hass, TUER1)
    assert st.lz["lernen"][C1]["offen"]["art"] == "vermutet" and not _an(hass, "switch.hk1")


async def test_hand_beendet_vermutet_pause(hass: HomeAssistant, baustelle, freezer, shellys, nachrichten) -> None:
    """FE-0025: wird während der Pause „Tür vermutlich offen“ von Hand geschaltet, endet die Pause – anders als beim
    Türkontakt bleibt die Hand (nur eine Vermutung)."""
    st = baustelle.runtime_data
    await _lernend(hass, freezer, st)
    hass.states.async_set("sensor.temp_c1", "16.0")
    await _start(hass, freezer, st, tuer=None)
    minute = _minuten(hass, freezer, st, "10:00:00")
    for i in range(13):
        await minute(16.5 - 0.04 * i)
    hz = Heizung.von(st)
    assert C1 in hz._vermutet_bis
    st.lz["hand"][HK1] = dt_util.now().isoformat()
    await minute(16.0)
    assert C1 not in hz._vermutet_bis and HK1 in st.lz["hand"] and st.daten.grund[C1] != "tuer_offen"


async def test_draussen_kaelter_keine_vermutung(hass: HomeAssistant, baustelle, freezer, shellys, nachrichten) -> None:
    """Raum fällt um 0,44 °C, draußen aber gleichzeitig um 1 °C kälter → keine Tür-Vermutung, Aufheizen läuft weiter."""
    st = baustelle.runtime_data
    await _lernend(hass, freezer, st)
    hass.states.async_set("sensor.temp_c1", "16.0")
    await _start(hass, freezer, st, tuer=None)
    minute = _minuten(hass, freezer, st, "10:00:00")
    for i in range(12):
        await minute(16.5 - 0.04 * i, aussen=5.0 - 0.1 * i)
    stand = st.lz["lernen"][C1]
    assert stand["offen"] is None and stand["auf"] is not None
    assert not any("Tür vermutlich offen" in t for t in _texte(st))


async def test_kein_vermuten_ohne_durchgehendes_heizen(hass: HomeAssistant, baustelle, freezer, shellys, nachrichten) -> None:
    """Raum kühlt ab, während nicht geheizt wird (außerhalb der Heizzeit) → keine Vermutung."""
    st = baustelle.runtime_data
    await _lernend(hass, freezer, st)
    hass.states.async_set("sensor.temp_c1", "16.0")
    await _start(hass, freezer, st, "19:00:00", tuer=None)
    minute = _minuten(hass, freezer, st, "19:00:00")
    for i in range(12):
        await minute(16.5 - 0.1 * i)
    assert not _an(hass, "switch.hk1") and st.lz["lernen"][C1]["offen"] is None


# ====================================================================== BSM-034.03: jede Tür und jedes Fenster
async def test_fenster_und_zweite_tuer_pausieren(hass: HomeAssistant, baustelle, freezer, shellys, nachrichten) -> None:
    """Herbert 09.10.2026: Fenster pausieren wie Türen – offen oder gekippt (der Kontakt meldet bei beidem „an“). Der
    Türkontakt ist Tür 1; Tür 2 und die Fenster kommen aus dem Aussehen. Maßgeblich ist der am längsten offene."""
    st = baustelle.runtime_data
    fenster, tuer2 = "binary_sensor.fenster_c1", "binary_sensor.tuer2_c1"
    for eid in (fenster, tuer2):
        hass.states.async_set(eid, "off")
    await _start(hass, freezer, st)
    st.einstellung_setzen(("bereiche", C1, "symbol"), {
        "doppel": False, "farbe": None, "rahmen": None, "licht": None, "tueren": [{"wand": "front", "pos": 0.15, "sensor": None}, {"wand": "seite", "pos": 0.5, "sensor": tuer2}],
        "fenster": [{"wand": "front", "pos": 0.67, "sensor": fenster}]})
    await hass.async_block_till_done()
    assert {fenster, tuer2, TUER1} <= Heizung.von(st).entitaeten()   # werden beobachtet
    sens = next(b for b in struktur(hass, baustelle)["bereiche"] if b["id"] == C1)["sensoren"]
    assert [(s["art"], s["name"]) for s in sens] == [("fuehler", "Fühler"), ("tuer", "Tür 1"), ("tuer", "Tür 2"), ("fenster", "Fenster 1")]
    await _zu(hass, freezer, "10:01:00", st)
    assert _an(hass, "switch.hk1")

    await _tuer(hass, fenster, "on")   # gekippt
    await _zu(hass, freezer, "10:03:00", st)
    assert _an(hass, "switch.hk1")       # noch unter der Pausenzeit
    await _tuer(hass, tuer2, "on")
    await _zu(hass, freezer, "10:05:00", st)
    assert not _an(hass, "switch.hk1") and st.daten.grund[C1] == "tuer_offen"
    assert _c(hass, baustelle)["tuer"] == {"offen": True, "seit": "2026-09-29T10:01:00+02:00"}   # das Fenster ist länger offen
    await _tuer(hass, fenster, "off")
    await _zu(hass, freezer, "10:06:00", st)
    assert st.daten.grund[C1] == "tuer_offen"   # Tür 2 ist noch offen (seit 10:03, ≥ 3 min)
    await _tuer(hass, tuer2, "off")
    await _zu(hass, freezer, "10:07:00", st)
    assert _an(hass, "switch.hk1") and _c(hass, baustelle)["tuer"] == {"offen": False, "seit": None}
