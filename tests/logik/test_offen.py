"""Was fehlt noch (UI-Bericht M15, Mockup was-fehlt.html)."""

from datetime import datetime
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "custom_components" / "baustelle"))

from logik.offen import Container, FreierSchalter, Plug, offen  # noqa: E402

JETZT = datetime(2026, 11, 26, 15, 0)


def _keys(aus):
    return [p["key"] for p in aus]


def test_leer_wenn_alles_da():
    assert offen([Container("a", "Mannschaft", "thermo", True, 0)], [], [Plug("p", "Plug")], heizung=True,
                 notprogramm_an=False, wetter=True, braucht_wetter=True, jetzt=JETZT) == []


def test_fuehler_nur_bei_thermostat_und_bedarf():
    c = [Container("a", "Besprechung", "bedarf", False), Container("b", "Lager", "plan", False),
         Container("c", "Büro", "thermo", False), Container("d", "Mannschaft", "thermo", True)]
    aus = offen(c, [], [], heizung=True, notprogramm_an=False, wetter=True, braucht_wetter=True, jetzt=JETZT)
    assert _keys(aus) == ["fuehler:a", "fuehler:c"]   # nach Name: Besprechung, Büro
    assert aus[0]["titel"] == "Besprechung hat keinen Temperaturfühler"
    assert aus[0]["text"] == "Modus „Bei Bedarf“ braucht einen – ohne ihn heizt er bei Bedarf durch, ohne aufs Soll zu achten"
    assert aus[1]["text"] == "Modus „Thermostat“ braucht einen – ohne ihn regelt er nur nach Zeitplan"
    assert (aus[0]["ziel"], aus[0]["bereich"]) == ("fuehler", "a") and aus[0]["los"] == "Fühler zuordnen ›"


def test_freier_shelly_mit_seit():
    aus = offen([], [FreierSchalter("d2", "switch.d2", "Shelly Plug S Gen3", datetime(2026, 11, 26, 10, 42)),
                     FreierSchalter("d1", "switch.d1", "Alt", datetime(2026, 11, 20, 8, 0)), FreierSchalter("d3", "switch.d3", "Ohne")],
                [], heizung=True, notprogramm_an=False, wetter=True, braucht_wetter=True, jetzt=JETZT)
    assert _keys(aus) == ["zuordnen:d1", "zuordnen:d3", "zuordnen:d2"]
    assert aus[2]["text"] == "neu in HA seit heute 10:42" and aus[0]["text"] == "in HA seit 20.11.2026"
    assert aus[2]["titel"] == "Shelly Plug S Gen3 gehört zu keinem Container"
    assert (aus[2]["ziel"], aus[2]["device_id"], aus[2]["schalter"]) == ("zuordnen", "d2", "switch.d2")


def test_namen_einzahl_mehrzahl_und_unbekannt():
    c = [Container("a", "Polier", "plan", True, 1), Container("b", "Lager", "plan", True, 3), Container("c", "X", "plan", True, None)]
    aus = offen(c, [], [], heizung=True, notprogramm_an=False, wetter=True, braucht_wetter=True, jetzt=JETZT)
    assert [p["titel"] for p in aus] == ["Lager: 3 Namen weichen ab", "Polier: 1 Name weicht ab"]
    assert (aus[1]["ziel"], aus[1]["bereich"]) == ("namen", "a")


def test_notprogramm_nur_wenn_an():
    p = [Plug("g", "Plug Lager 09")]
    assert offen([], [], p, heizung=True, notprogramm_an=False, wetter=True, braucht_wetter=True, jetzt=JETZT) == []
    aus = offen([], [], p, heizung=True, notprogramm_an=True, wetter=True, braucht_wetter=True, jetzt=JETZT)
    assert aus[0]["titel"] == "Plug Lager 09 hat kein Notprogramm" and aus[0]["ziel"] == "notprogramm"


def test_wetter_und_reihenfolge():
    aus = offen([Container("a", "B", "thermo", False, 2)], [FreierSchalter("d", "switch.d", "S")], [Plug("g", "P")],
                heizung=True, notprogramm_an=True, wetter=False, braucht_wetter=True, jetzt=JETZT)
    assert _keys(aus) == ["fuehler:a", "zuordnen:d", "namen:a", "notprogramm:g", "wetter"]
    assert aus[-1]["ziel"] == "wetterquelle" and aus[-1]["los"] == "Einstellen ›"


def test_freie_nur_shellys_ohne_belegten_kanal_je_geraet_einmal():
    f = [FreierSchalter("d1", "switch.d1_0", "Shelly 2PM", kanal_belegt=True), FreierSchalter("d2", "switch.vac", "Heidi", shelly=False),
         FreierSchalter("d3", "switch.d3_0", "Pro 4PM"), FreierSchalter("d3", "switch.d3_1", "Pro 4PM"),
         FreierSchalter("d4", "switch.d4", "Alt", datetime(1970, 1, 1, 1, 0))]
    aus = offen([], f, [], heizung=True, notprogramm_an=False, wetter=True, braucht_wetter=True, jetzt=JETZT)
    assert _keys(aus) == ["zuordnen:d4", "zuordnen:d3"] and aus[1]["schalter"] == "switch.d3_0"
    assert aus[0]["text"] == "in Home Assistant, keinem Container zugeordnet"   # 1970 = unbekannt


def test_ohne_heizung_keine_fuehler_und_notprogramm_punkte_wetter_nur_wenn_gebraucht():
    c = [Container("a", "B", "thermo", False)]
    aus = offen(c, [], [Plug("g", "P")], heizung=False, notprogramm_an=True, wetter=False, braucht_wetter=False, jetzt=JETZT)
    assert aus == []
