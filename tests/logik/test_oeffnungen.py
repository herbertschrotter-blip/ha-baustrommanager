"""Tür und Fenster offen im Tagesdiagramm (logik/oeffnungen, Mockup tuer-diagramm.html Variante A)."""

from datetime import UTC, datetime, timedelta
from zoneinfo import ZoneInfo

from logik.oeffnungen import Oeffnung, fuer_seite, oeffnungen, oeffnungen_eines

WIEN = ZoneInfo("Europe/Vienna")
VON = datetime(2026, 9, 29, 0, 0, tzinfo=WIEN)
BIS = datetime(2026, 9, 30, 0, 0, tzinfo=WIEN)
T = "binary_sensor.tuer"


def um(hhmm: str, s: int = 0, tag: int = 29) -> datetime:
    h, m = hhmm.split(":")
    return datetime(2026, 9, tag, int(h), int(m), s, tzinfo=WIEN)


def eins(verlauf, von=VON, bis=BIS):
    return oeffnungen_eines(T, "tuer", "Tür 1", verlauf, von, bis)


def test_abgeschlossene_oeffnung() -> None:
    o = eins([(VON, "off"), (um("07:12"), "on"), (um("07:31"), "off")])
    assert o == [Oeffnung(T, "tuer", "Tür 1", um("07:12"), um("07:31"), 19 * 60)]


def test_unter_10_s_faellt_weg_ab_10_s_bleibt() -> None:
    o = eins([(um("07:00"), "on"), (um("07:00", 9), "off"), (um("08:00"), "on"), (um("08:00", 10), "off")])
    assert [(x.von, x.sekunden) for x in o] == [(um("08:00"), 10)]


def test_noch_offen_bis_none() -> None:
    o = eins([(VON, "off"), (um("16:08"), "on")], bis=um("16:20"))
    assert len(o) == 1 and o[0].bis is None and o[0].sekunden == 12 * 60


def test_noch_offen_auch_kurz_bleibt() -> None:
    """Gerade erst geöffnet (3 s): ist wirklich offen, kein Prellen erkennbar."""
    o = eins([(um("16:19", 57), "on")], bis=um("16:20"))
    assert len(o) == 1 and o[0].bis is None


def test_schon_vor_dem_fenster_offen() -> None:
    """Offen seit gestern 23:50 → beginnt am Fensterbeginn; Prellen nach der ganzen Dauer (hier 10 min + 5 s)."""
    o = eins([(um("23:50", tag=28), "on"), (um("00:00", 5), "off")])
    assert o == [Oeffnung(T, "tuer", "Tür 1", VON, um("00:00", 5), 5)]


def test_vor_dem_fenster_geschlossen_zaehlt_nicht() -> None:
    assert eins([(um("22:00", tag=28), "on"), (um("23:00", tag=28), "off"), (um("10:00"), "off")]) == []


def test_nach_dem_fenster_zaehlt_nicht() -> None:
    o = eins([(um("23:00"), "on"), (um("00:30", tag=30), "off")])
    assert len(o) == 1 and o[0].bis is None and o[0].sekunden == 3600


def test_nicht_erreichbar_beendet_keine_oeffnung() -> None:
    o = eins([(um("10:00"), "on"), (um("10:05"), "unavailable"), (um("10:20"), "unknown"), (um("10:30"), "off")])
    assert [(x.von, x.bis) for x in o] == [(um("10:00"), um("10:30"))]


def test_nicht_erreichbar_vor_dem_oeffnen_gilt_als_zu() -> None:
    o = eins([(VON, "unavailable"), (um("10:00"), "off"), (um("11:00"), "on"), (um("11:10"), "off")])
    assert [(x.von, x.bis) for x in o] == [(um("11:00"), um("11:10"))]
    assert eins([(VON, "unavailable"), (um("12:00"), "unknown")]) == []


def test_reihenfolge_egal_doppeltes_offen_zaehlt_einmal() -> None:
    o = eins([(um("10:30"), "off"), (um("10:20"), "on"), (um("10:00"), "on")])
    assert [(x.von, x.bis) for x in o] == [(um("10:00"), um("10:30"))]


def test_alle_kontakte_nach_beginn_sortiert() -> None:
    f = "binary_sensor.fenster"
    o = oeffnungen([(T, "tuer", "Tür 1", [(um("11:00"), "on"), (um("11:20"), "off")]),
                    (f, "fenster", "Fenster 1", [(um("10:40"), "on"), (um("11:10"), "off")])], VON, BIS)
    assert [(x.name, x.art) for x in o] == [("Fenster 1", "fenster"), ("Tür 1", "tuer")]


def test_fuer_seite_heute_und_frueher() -> None:
    o = eins([(um("07:12", 40), "on"), (um("07:31", 10), "off"), (um("09:45"), "on"), (um("09:45", 30), "off"),
              (um("11:40"), "on")], bis=um("16:20"))
    heute = fuer_seite(o, WIEN, laufend=True, ende=um("16:20"))
    assert heute == [
        {"entity_id": T, "art": "tuer", "name": "Tür 1", "von": "07:12", "bis": "07:31", "min": 18},
        {"entity_id": T, "art": "tuer", "name": "Tür 1", "von": "09:45", "bis": "09:45", "min": 1},   # kurz: mindestens 1 min
        {"entity_id": T, "art": "tuer", "name": "Tür 1", "von": "11:40", "bis": None, "min": 280},
    ]
    frueher = fuer_seite(eins([(um("22:10"), "on")]), WIEN, laufend=False, ende=BIS)
    assert frueher == [{"entity_id": T, "art": "tuer", "name": "Tür 1", "von": "22:10", "bis": "24:00", "min": 110}]


def test_fuer_seite_lokale_zeit_aus_utc() -> None:
    a = datetime(2026, 9, 29, 5, 12, tzinfo=UTC)   # 07:12 in Wien (Sommerzeit)
    o = [Oeffnung(T, "tuer", "Tür 1", a, a + timedelta(minutes=19), 19 * 60)]
    assert fuer_seite(o, WIEN, laufend=True, ende=BIS)[0]["von"] == "07:12"
