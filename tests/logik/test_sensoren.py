"""Die eine Sensorliste je Container (logik/sensoren, BSM-034.03)."""

from datetime import datetime, timedelta

from logik.sensoren import BATTERIE_KRITISCH, BATTERIE_SCHWACH, aus_einstellungen, batterie_stufe, kontakte, offen_seit, sensoren

SYM = {"tueren": [{"wand": "front", "pos": 0.15, "sensor": None}, {"wand": "seite", "pos": 0.5, "sensor": "binary_sensor.t2"}],
       "fenster": [{"wand": "front", "pos": 0.67, "sensor": None}, {"wand": "front", "pos": 0.85, "sensor": "binary_sensor.f2"}],
       "licht": "light.c1"}


def test_liste_aus_fuehler_tuerkontakt_und_aussehen() -> None:
    liste = sensoren("sensor.temp", "binary_sensor.t1", SYM)
    assert [(s.art, s.entity_id, s.nr, s.name) for s in liste] == [
        ("fuehler", "sensor.temp", 1, "Fühler"), ("tuer", "binary_sensor.t1", 1, "Tür 1"), ("tuer", "binary_sensor.t2", 2, "Tür 2"),
        ("fenster", "binary_sensor.f2", 2, "Fenster 2"), ("licht", "light.c1", 1, "Licht")]
    assert kontakte(liste) == ["binary_sensor.t1", "binary_sensor.t2", "binary_sensor.f2"]
    assert liste[2].als_dict() == {"art": "tuer", "entity_id": "binary_sensor.t2", "nr": 2, "name": "Tür 2"}


def test_ohne_aussehen_und_doppelte() -> None:
    assert [s.entity_id for s in sensoren(None, "binary_sensor.t1", None)] == ["binary_sensor.t1"]   # Standard: Tür 1 = Türkontakt
    assert sensoren(None, None, None) == []
    # Türkontakt zugleich als Fenster eingetragen: nur einmal (als Tür)
    sym = {**SYM, "fenster": [{"wand": "front", "pos": 0.67, "sensor": "binary_sensor.t1"}]}
    assert [(s.art, s.entity_id) for s in sensoren(None, "binary_sensor.t1", sym) if s.entity_id == "binary_sensor.t1"] == [
        ("tuer", "binary_sensor.t1")]
    # Tür 1 mit eigenem Sensor: der Türkontakt zählt dann nicht mehr
    sym = {**SYM, "tueren": [{"wand": "front", "pos": 0.15, "sensor": "binary_sensor.eigen"}]}
    assert "binary_sensor.t1" not in [s.entity_id for s in sensoren(None, "binary_sensor.t1", sym)]


def test_offen_seit_und_batterie() -> None:
    t = datetime(2026, 10, 9, 8, 0)
    assert offen_seit([None, t + timedelta(minutes=5), t]) == t   # der am längsten offene zählt
    assert offen_seit([None, None]) is None and offen_seit([]) is None
    # zwei Stufen, je Grenze genau einmal (kritisch = Grenze der Warnung fuehler_fehlt)
    assert (BATTERIE_KRITISCH, BATTERIE_SCHWACH) == (10.0, 25.0)
    assert [batterie_stufe(x) for x in (None, 100, 25, 24.9, 10, 9.9, 0)] == [
        None, None, None, "schwach", "schwach", "kritisch", "kritisch"]


def test_aus_einstellungen() -> None:
    assert aus_einstellungen("sensor.temp", {"tuer": "binary_sensor.t1", "symbol": SYM}) == sensoren("sensor.temp", "binary_sensor.t1", SYM)
    assert [s.art for s in aus_einstellungen(None, {})] == []
