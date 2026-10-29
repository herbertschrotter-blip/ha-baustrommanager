"""AN-0019 / FE-0034: die Integration liefert die Heute-Regeln (laufzeit.heute) und die Ausnahme-Abweichung je Tag
(laufzeit.plan_abweichung) – die Seite rechnet nichts."""

from homeassistant.core import HomeAssistant

from custom_components.baustelle.daten import struktur
from custom_components.baustelle.funktionen.heizung import Heizung
from custom_components.baustelle.logik.heute import GRUPPEN


async def test_heute_regeln_und_abweichung(hass: HomeAssistant, baustelle, freezer) -> None:
    st = baustelle.runtime_data
    freezer.move_to("2026-09-29 10:00:00+02:00")
    st.e["ausnahmen"].append({"datum": "2026-09-30", "art": "zeiten", "von": "07:00", "bis": "18:00", "notiz": "länger"})
    st.e["ausnahmen"].append({"datum": "2026-10-01", "art": "frei", "notiz": "Betriebsausflug"})
    st.e["staffel"]["an"] = True
    Heizung.von(st).plan_neu()   # Ausnahmen geändert: Plan neu rechnen
    lz = struktur(hass, baustelle)["laufzeit"]
    H = {x["k"]: x for x in lz["heute"]}
    assert list(H) == ["arbeitszeit", "grenze", "trocknen", "fruehstart", "staffel", "frei"]
    assert all(x["gruppe"] in GRUPPEN and x["kurz"] and x["name"] for x in lz["heute"])
    assert H["arbeitszeit"]["an"] and H["arbeitszeit"]["titel"].startswith("Arbeitszeit ")
    assert H["staffel"]["gruppe"] == "strom" and H["staffel"]["kurz"].endswith(" laufen")
    A = lz["plan_abweichung"]
    assert set(A) == {"2026-09-30", "2026-10-01"}   # nur Tage mit Ausnahme
    laenger = A["2026-09-30"]
    assert laenger["normal"] is not None and laenger["diff_min"] > 0 and all(t[2] == "mehr" for t in laenger["teile"])
    frei = A["2026-10-01"]
    assert frei["teile"] and all(t[2] == "weniger" for t in frei["teile"]) and frei["diff_min"] < 0
