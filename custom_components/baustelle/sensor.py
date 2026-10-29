"""Sensoren: Status, nächste Schaltzeit, Grund je Container, Leistung, Wetter der Baustelle."""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass
from datetime import datetime
from typing import Any, TypedDict

from homeassistant.components.sensor import SensorDeviceClass, SensorEntity, SensorStateClass
from homeassistant.const import (
    EntityCategory,
    UnitOfEnergy,
    UnitOfInformation,
    UnitOfPower,
    UnitOfPrecipitationDepth,
    UnitOfTemperature,
    UnitOfTime,
)
from homeassistant.core import HomeAssistant
from homeassistant.helpers.entity_platform import AddConfigEntryEntitiesCallback

from . import BaustelleConfigEntry
from .db import DATA_DB
from .const import ART_CONTAINER, HEIZROLLEN, ROLLE_PUMPE, TYPEN
from .entity import BaustelleEntity
from .funktionen.heizung import Heizung
from .logik.regelung import SollGrund
from .steuerung import Steuerung

PARALLEL_UPDATES = 0

STATUS = ["abgeschlossen", "nur_pumpen", "automatik_aus", "heizgrenze", "urlaub", "feiertag", "frei", "heizt", "bereit"]


@dataclass(frozen=True)
class Wert:
    key: str
    lesen: Callable[[Steuerung], float | None]
    einheit: str
    klasse: SensorDeviceClass


WETTER = [
    Wert("aussen", lambda st: st.daten.wetter.aussen, UnitOfTemperature.CELSIUS, SensorDeviceClass.TEMPERATURE),
    Wert("tageshoechst", lambda st: st.daten.wetter.aussen_max, UnitOfTemperature.CELSIUS, SensorDeviceClass.TEMPERATURE),
    Wert("frueh_prognose", lambda st: st.daten.wetter.frueh_prognose, UnitOfTemperature.CELSIUS, SensorDeviceClass.TEMPERATURE),
    Wert("regen", lambda st: st.daten.wetter.regen_24h, UnitOfPrecipitationDepth.MILLIMETERS, SensorDeviceClass.PRECIPITATION),
]


async def async_setup_entry(
    hass: HomeAssistant, entry: BaustelleConfigEntry, async_add_entities: AddConfigEntryEntitiesCallback
) -> None:
    st = entry.runtime_data
    heizung = Heizung.von(st).aktiv()
    liste: list[SensorEntity] = [StatusSensor(st), LeistungSensor(st), DatenbankSensor(st)]
    if heizung:
        liste += [NaechsteSchaltzeitSensor(st), *(WetterSensor(st, w) for w in WETTER)]
    liste += [ZaehlerSensor(st, z) for z in ZAEHLER_BAUSTELLE if heizung or not z.nur_heizung]
    if heizung:
        for typ in TYPEN:
            liste += [ZaehlerSensor(st, z) for z in _typ_zaehler(typ)]
    async_add_entities(liste)
    for bid, info in st.bereiche.items():
        bereich: list[SensorEntity] = [LeistungSensor(st, bid)]
        bereich += [ZaehlerSensor(st, z, bereich_id=bid) for z in _bereich_zaehler(bid)]
        if heizung and info.art == ART_CONTAINER:
            bereich += [GrundSensor(st, bid), ZaehlerSensor(st, _heizzeit(bid), bereich_id=bid),
                        ZaehlerSensor(st, _heizzeit_strom(bid), bereich_id=bid)]   # AN-0011: davon tatsächlich geheizt
        async_add_entities(bereich, config_subentry_id=bid)
    for gid, g in st.geraete.items():
        geraet = [ZaehlerSensor(st, z, geraet_id=gid) for z in _geraet_zaehler(gid, g.rolle)]
        if geraet:
            async_add_entities(geraet, config_subentry_id=gid)

class DatenbankSensor(BaustelleEntity, SensorEntity):
    """Eigene Datenbank (eine je HA-Instanz): Größe, Zustand, Fehler, Warteschlange (docs/bauplan-datenbank.md §3.6)."""

    _attr_entity_category = EntityCategory.DIAGNOSTIC
    _attr_device_class = SensorDeviceClass.DATA_SIZE
    _attr_native_unit_of_measurement = UnitOfInformation.MEGABYTES
    _attr_suggested_display_precision = 1

    def __init__(self, steuerung: Steuerung) -> None:
        super().__init__(steuerung, "datenbank")

    @property
    def native_value(self) -> float | None:
        db = self.hass.data.get(DATA_DB)
        return db.info()["groesse_mb"] if db is not None and db.bereit else None

    @property
    def extra_state_attributes(self) -> dict[str, Any]:
        db = self.hass.data.get(DATA_DB)
        return {k: v for k, v in db.info().items() if k != "groesse_mb"} if db is not None else {"zustand": "aus"}


class StatusSensor(BaustelleEntity, SensorEntity):
    """Was die Baustelle gerade tut."""

    _attr_device_class = SensorDeviceClass.ENUM
    _attr_options = STATUS

    def __init__(self, steuerung: Steuerung) -> None:
        super().__init__(steuerung, "status")

    @property
    def native_value(self) -> str:
        return self.steuerung.daten.status


class NaechsteSchaltzeitSensor(BaustelleEntity, SensorEntity):
    """Nächster Schaltpunkt der Baustelle (Ende der Heizzeit bzw. nächster Start)."""

    _attr_device_class = SensorDeviceClass.TIMESTAMP

    def __init__(self, steuerung: Steuerung) -> None:
        super().__init__(steuerung, "naechste_schaltzeit")

    @property
    def native_value(self) -> datetime | None:
        return self.steuerung.daten.naechste


class GrundSensor(BaustelleEntity, SensorEntity):
    """Warum die Heizung eines Containers gerade ein oder aus ist."""

    _attr_device_class = SensorDeviceClass.ENUM
    _attr_options = [g.value for g in SollGrund]

    def __init__(self, steuerung: Steuerung, bereich_id: str) -> None:
        super().__init__(steuerung, "grund", bereich_id)

    @property
    def native_value(self) -> str | None:
        grund = self.steuerung.daten.grund.get(self.bereich_id or "")
        return grund if grund in self._attr_options else None


class LeistungSensor(BaustelleEntity, SensorEntity):
    """Leistung aller Shellys der Baustelle bzw. eines Bereichs."""

    _attr_device_class = SensorDeviceClass.POWER
    _attr_state_class = SensorStateClass.MEASUREMENT
    _attr_native_unit_of_measurement = UnitOfPower.WATT
    _attr_suggested_display_precision = 0

    def __init__(self, steuerung: Steuerung, bereich_id: str | None = None) -> None:
        super().__init__(steuerung, "leistung", bereich_id)

    @property
    def native_value(self) -> float | None:
        werte = self.steuerung.daten.leistung
        if self.bereich_id is not None:
            return werte.get(self.bereich_id)
        bekannt = [w for w in werte.values() if w is not None]
        return sum(bekannt) if bekannt else None


class WetterSensor(BaustelleEntity, SensorEntity):
    """Wetterwert, mit dem die Regeln gerade rechnen."""

    _attr_entity_category = EntityCategory.DIAGNOSTIC
    _attr_state_class = SensorStateClass.MEASUREMENT

    def __init__(self, steuerung: Steuerung, wert: Wert) -> None:
        super().__init__(steuerung, wert.key)
        self._lesen = wert.lesen
        self._attr_native_unit_of_measurement = wert.einheit
        self._attr_device_class = wert.klasse
        # Nur die Außentemperatur braucht die Seite (Statistik); die übrigen Wetterwerte stehen auch in der Diagnose
        self._attr_entity_registry_enabled_default = wert.key == "aussen"

    @property
    def native_value(self) -> float | None:
        return self._lesen(self.steuerung)


# --------------------------------------------------------------------- Zähler (Stufe 4)
@dataclass(frozen=True)
class Zaehler:
    key: str
    lesen: Callable[[Steuerung], float | None]
    einheit: str | None = UnitOfEnergy.KILO_WATT_HOUR
    klasse: SensorDeviceClass | None = SensorDeviceClass.ENERGY
    art: SensorStateClass | None = SensorStateClass.TOTAL_INCREASING
    stellen: int = 2
    geld: bool = False
    nur_heizung: bool = False
    diagnose: bool = False


class Vorlage(TypedDict, total=False):
    """Gemeinsame Felder mehrerer Zähler (Geld, Stunden, Mittelwert, Prognose)."""

    einheit: str | None
    klasse: SensorDeviceClass | None
    art: SensorStateClass | None
    stellen: int
    geld: bool
    nur_heizung: bool
    diagnose: bool


GELD: Vorlage = {"einheit": None, "klasse": SensorDeviceClass.MONETARY, "art": SensorStateClass.TOTAL, "geld": True}
STUNDEN: Vorlage = {"einheit": UnitOfTime.HOURS, "klasse": SensorDeviceClass.DURATION, "stellen": 1}
MITTEL: Vorlage = {"einheit": UnitOfPower.WATT, "klasse": SensorDeviceClass.POWER, "art": SensorStateClass.MEASUREMENT, "stellen": 0, "diagnose": True}
PROGNOSE: Vorlage = {"art": None, "stellen": 0, "nur_heizung": True}
GELD_HEIZUNG: Vorlage = {**GELD, "nur_heizung": True}
GELD_PROGNOSE: Vorlage = {**GELD, "art": None, "nur_heizung": True}
MITTEL_TYP: Vorlage = {**MITTEL, "diagnose": False}


def _preis(st: Steuerung) -> float:
    return float(st.einstellungen.daten["preis"])


def _mal_preis(wert: float | None, st: Steuerung) -> float | None:
    return None if wert is None else wert * _preis(st)


ZAEHLER_BAUSTELLE = [
    Zaehler("energie", lambda st: st.zaehler.get("energie", 0.0)),
    Zaehler("kosten", lambda st: st.zaehler.get("kosten", 0.0), **GELD),
    Zaehler("energie_ohne_automatik", lambda st: st.zaehler.get("ohne", 0.0), nur_heizung=True),
    Zaehler("ersparnis", lambda st: Heizung.von(st).ersparnis_eur(), **GELD_HEIZUNG),   # FE-0035: je Tag zu seinem Preis
    Zaehler("prognose_heizperiode", lambda st: Heizung.von(st).hochrechnung_heizperiode("energie_heizen"), **PROGNOSE),
    Zaehler(
        "prognose_heizperiode_kosten",
        lambda st: _mal_preis(Heizung.von(st).hochrechnung_heizperiode("energie_heizen"), st),
        **GELD_PROGNOSE,
    ),
    Zaehler("prognose_heizperiode_ohne", lambda st: Heizung.von(st).hochrechnung_heizperiode("ohne"), **PROGNOSE),
]


def _typ_zaehler(typ: str) -> list[Zaehler]:
    return [
        Zaehler(f"energie_{typ}", lambda st: st.zaehler.get(f"energie_typ:{typ}", 0.0)),
        Zaehler(f"heizzeit_{typ}", lambda st: st.zaehler.get(f"heizzeit_typ:{typ}", 0.0), **STUNDEN),
        Zaehler(f"mittel_{typ}", lambda st: Heizung.von(st).mittel_typ(typ), **MITTEL_TYP),
    ]


def _heizzeit(bid: str) -> Zaehler:
    return Zaehler("heizzeit", lambda st: st.zaehler.get(f"heizzeit:{bid}", 0.0), **STUNDEN)


def _heizzeit_strom(bid: str) -> Zaehler:
    """AN-0011: Stunden, in denen ein Heizkörper des Containers wirklich Strom zieht (über 50 W)."""
    return Zaehler("heizzeit_strom", lambda st: st.zaehler.get(f"heizzeit_strom:{bid}", 0.0), **STUNDEN)


def _geraet_zaehler(gid: str, rolle: str) -> list[Zaehler]:
    if rolle in HEIZROLLEN:
        return [Zaehler("mittel_im_betrieb", lambda st: st.zaehler.get(f"mittel:{gid}"), **MITTEL)]
    if rolle == ROLLE_PUMPE:
        return [
            Zaehler("pumpzeit", lambda st: st.zaehler.get(f"pumpzeit:{gid}", 0.0), **STUNDEN),
            Zaehler("pumpzyklen", lambda st: st.zaehler.get(f"zyklen:{gid}", 0), einheit=None, klasse=None, stellen=0),
        ]
    return []


def _bereich_zaehler(bid: str) -> list[Zaehler]:
    return [
        Zaehler("energie", lambda st: st.zaehler.get(f"energie:{bid}", 0.0)),
        Zaehler("kosten", lambda st: st.zaehler.get(f"kosten:{bid}", 0.0), **GELD),
    ]


class ZaehlerSensor(BaustelleEntity, SensorEntity):
    """Zähler und Auswertungen: bleiben dauerhaft, HA führt dazu die Langzeitstatistik."""

    def __init__(
        self, steuerung: Steuerung, zaehler: Zaehler, *, bereich_id: str | None = None, geraet_id: str | None = None
    ) -> None:
        super().__init__(steuerung, zaehler.key, bereich_id, geraet_id)
        self._lesen = zaehler.lesen
        self._attr_device_class = zaehler.klasse
        self._attr_state_class = zaehler.art
        self._attr_suggested_display_precision = zaehler.stellen
        self._attr_native_unit_of_measurement = steuerung.hass.config.currency if zaehler.geld else zaehler.einheit
        if zaehler.diagnose:
            self._attr_entity_category = EntityCategory.DIAGNOSTIC

    @property
    def native_value(self) -> float | None:
        wert = self._lesen(self.steuerung)
        return None if wert is None else round(float(wert), 4)
