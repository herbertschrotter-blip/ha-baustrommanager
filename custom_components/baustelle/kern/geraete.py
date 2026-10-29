"""Kern: Geräte der Baustelle – die eine Stelle für Änderungen an Geräten (BSM-034.02, Bauplan Geräte §4).

Lieferung 1: Status (aktiv / inaktiv / verliehen / defekt, logik/geraete) – Container-Chip, ✎ Gerät und Inventar ändern
ihn nur hier; das Inventar zieht mit (Ausrüstung im Einsatz als dieses Gerät), Änderungen aus dem Inventar kommen über
`status_setzen(…, ins_inventar=False)` zurück.

Lieferung 2: Anlegen, Ändern (Name, Shelly, Rolle/Typ, Sensoren), Verschieben und Entfernen über `async_speichern` –
erst alle Schritte prüfen (logik/geraete.pruefen, wie der HA-Dialog), dann am Stück: Inventar (Einsatz beenden bzw. im
neuen Container beginnen), Unter-Einträge, Protokoll, am Ende einmal neu laden.
"""

from __future__ import annotations

from datetime import datetime
import logging
from types import MappingProxyType
from typing import TYPE_CHECKING, Any

from homeassistant.config_entries import ConfigSubentry
from homeassistant.const import STATE_ON, STATE_UNAVAILABLE, STATE_UNKNOWN
from homeassistant.core import Context, HomeAssistant
from homeassistant.helpers import device_registry as dr, entity_registry as er
from homeassistant.util import dt as dt_util

from ..const import (
    CONF_ART, CONF_BEREICH, CONF_ENERGIE, CONF_LEISTUNG, CONF_ROLLE, CONF_SCHALTER, CONF_TYP, SUB_BEREICH, SUB_GERAET,
)
from ..db import DATA_DB
from ..db import inventar as db_inventar
from ..funktionen.basis import zeit as _zeit
from ..logik import geraete as logik, sensoren as sensor_logik
from .typen import GeraetInfo

if TYPE_CHECKING:
    from ..steuerung import Steuerung

_LOGGER = logging.getLogger("custom_components.baustelle.steuerung")


def status(st: Steuerung, g: GeraetInfo) -> str:
    return logik.status_von((st.e.get("geraete") or {}).get(g.id))


def status_setzen(st: Steuerung, g: GeraetInfo, neu: str, *, ins_inventar: bool = True) -> bool:
    """Status setzen; False, wenn er schon so war. Geht das Gerät aus der Automatik, wird es einmal ausgeschaltet und
    der Handbetrieb endet (wie WU-0004). Protokoll, Einstellungen (Datenbank) und Inventar ziehen mit."""
    if neu not in logik.STATUS:
        raise ValueError(f"Status {neu!r}: erlaubt sind {', '.join(logik.STATUS)}")
    if status(st, g) == neu:
        return False
    eintrag = st.e.setdefault("geraete", {}).setdefault(g.id, {})
    eintrag.pop("aktiv", None)   # alter Schalter (bis 0.8.115) – jetzt nur noch der Status
    eintrag["status"] = neu
    st.lz["hand"].pop(g.id, None)
    st.protokoll("einstellung", g.bereich, logik.status_protokoll(g.name, neu))
    zustand = st.hass.states.get(g.schalter)
    if not logik.schaltet(neu) and zustand is not None and zustand.state == STATE_ON:
        kontext = Context()
        st._eigene_kontexte.append(kontext.id)
        st.hass.async_create_task(
            st.hass.services.async_call("switch", "turn_off", {"entity_id": g.schalter}, context=kontext),
            f"baustelle_inaktiv_{g.schalter}", eager_start=False,
        )
    st.einstellungen.speichern()
    st.auswerten()
    if ins_inventar and (db := st.hass.data.get(DATA_DB)) is not None:
        st.entry.async_create_background_task(st.hass, db.async_ausfuehren(
            lambda v: db_inventar.status_fuer_geraet(v, g.id, neu)), f"baustelle_status_{g.id}")
    return True


# ---------------------------------------------------------------------- Lieferung 2: anlegen, ändern, entfernen
FELDER = (CONF_BEREICH, CONF_SCHALTER, "name", CONF_ROLLE, CONF_TYP, CONF_LEISTUNG, CONF_ENERGIE)


class GeraetFehler(ValueError):
    """Ein Schritt verletzt eine Regel; `schluessel` wie im HA-Dialog (translations: config_subentries.geraet.error)."""

    def __init__(self, schluessel: str, schritt: int) -> None:
        super().__init__(schluessel)
        self.schluessel, self.schritt = schluessel, schritt


def _daten(alt: dict[str, Any], schritt: dict[str, Any]) -> dict[str, Any]:
    """Neue Daten des Unter-Eintrags: übernimmt die genannten Felder; leerer Sensor = automatisch (Feld weg)."""
    neu = {**alt, **{k: schritt[k] for k in FELDER if k in schritt}}
    neu["name"] = str(neu.get("name") or "").strip()
    for k in (CONF_LEISTUNG, CONF_ENERGIE):
        if not neu.get(k):
            neu.pop(k, None)
    return neu


def plan(hass: HomeAssistant, st: Steuerung, schritte: list[dict[str, Any]]) -> list[tuple[str, str, dict[str, Any] | None]]:
    """Schritte prüfen, ohne etwas zu ändern: [(aktion, unter_eintrag, neue Daten)]; `GeraetFehler` beim ersten Verstoß.
    Spätere Schritte sehen die früheren (z. B. Shelly bei einem Gerät entfernen und beim anderen eintragen)."""
    from ..config_flow import geraete_anderer_baustellen  # noqa: PLC0415  (config_flow lädt die Integration)

    entry = st.entry
    geraete = {sid: dict(x.data) for sid, x in entry.subentries.items() if x.subentry_type == SUB_GERAET}
    andere = geraete_anderer_baustellen(hass, entry.entry_id)
    aus: list[tuple[str, str, dict[str, Any] | None]] = []
    for i, schritt in enumerate(schritte):
        aktion = schritt.get("aktion")
        if aktion == "entfernen":
            if schritt.get("geraet") not in geraete:
                raise GeraetFehler("kein_geraet", i)
            del geraete[schritt["geraet"]]
            aus.append(("entfernen", schritt["geraet"], None))
            continue
        if aktion == "aendern" and schritt.get("geraet") not in geraete:
            raise GeraetFehler("kein_geraet", i)
        sid = schritt["geraet"] if aktion == "aendern" else ConfigSubentry(
            data=MappingProxyType({}), subentry_type=SUB_GERAET, title="", unique_id=None).subentry_id
        daten = _daten(geraete.get(sid, {}), schritt)
        bereich = entry.subentries.get(str(daten.get(CONF_BEREICH)))
        if fehler := logik.pruefen(
                schalter=str(daten.get(CONF_SCHALTER) or ""), rolle=str(daten.get(CONF_ROLLE) or ""), name=daten["name"],
                bereich_art=bereich.data[CONF_ART] if bereich is not None and bereich.subentry_type == SUB_BEREICH else None,
                vergeben_hier=any(d.get(CONF_SCHALTER) == daten.get(CONF_SCHALTER) for x, d in geraete.items() if x != sid),
                andere_baustelle=daten.get(CONF_SCHALTER) in andere):
            raise GeraetFehler(fehler, i)
        geraete[sid] = daten
        aus.append((str(aktion), sid, daten))
    return aus


def _kennung(hass: HomeAssistant, schalter: str) -> tuple[str, str | None] | None:
    """Kennung (MAC, sonst HA-Gerät) und Modell des Shelly hinter dem Schalter – wie im Inventar."""
    from ..inventar_geraete import _kennung as kennung  # noqa: PLC0415

    eintrag = er.async_get(hass).async_get(schalter)
    geraet = dr.async_get(hass).async_get(eintrag.device_id) if eintrag is not None and eintrag.device_id else None
    return (kennung(geraet), geraet.model) if isinstance(geraet, dr.DeviceEntry) else None


async def _async_inventar(hass: HomeAssistant, st: Steuerung, schritte: list[tuple[str, str, dict[str, Any] | None]]) -> None:
    """Inventar nachziehen (BSM-034.02): Entfernen beendet den Einsatz, Anlegen/Verschieben in einen Container mit
    Inventar beginnt dort einen. Ohne Datenbank oder bei einem Fehler bleibt HA maßgeblich (Abgleich BSM-034.04)."""
    if (db := hass.data.get(DATA_DB)) is None or not db.bereit:
        return
    jetzt, arbeit = dt_util.utcnow(), []
    for aktion, sid, daten in schritte:
        if aktion == "entfernen":
            arbeit.append(lambda v, sid=sid: db_inventar.geraet_entfernt(v, sid, jetzt))
            continue
        alt = st.entry.subentries.get(sid)
        if alt is not None and all(alt.data.get(k) == daten.get(k) for k in (CONF_BEREICH, CONF_SCHALTER)):  # type: ignore[union-attr]
            continue
        if (k := _kennung(hass, str(daten[CONF_SCHALTER]))) is None:  # type: ignore[index]
            continue
        arbeit.append(lambda v, sid=sid, d=daten, k=k: db_inventar.geraet_im_container(
            v, kennung=k[0], modell=k[1], container_id=db_inventar.container_von_bereich(v, d[CONF_BEREICH]), geraet_id=sid,
            jetzt=jetzt))
    if arbeit and await db.async_ausfuehren(lambda v: [f(v) for f in arbeit]) is None:
        _LOGGER.warning("Geräte: Inventar nicht nachgezogen (%s) – der Abgleich holt es nach", db.fehler)


async def async_speichern(hass: HomeAssistant, st: Steuerung, schritte: list[dict[str, Any]]) -> list[str]:
    """Schritte prüfen und ausführen (Inventar, Unter-Einträge, Protokoll), danach einmal neu laden; liefert die IDs neu
    angelegter Geräte. `GeraetFehler`, ohne etwas zu ändern."""
    geplant = plan(hass, st, schritte)
    if not geplant:
        return []
    await _async_inventar(hass, st, geplant)
    entry, neu = st.entry, []
    name_von = {sid: x.title for sid, x in entry.subentries.items()}
    st.neu_laden_folgt = True   # ein Neu-Laden am Ende statt je Unter-Eintrag (wie Umbenennen)
    try:
        for aktion, sid, daten in geplant:
            if aktion == "entfernen":
                hass.config_entries.async_remove_subentry(entry, sid)
                st.protokoll("einstellung", None, f"{name_von.get(sid, sid)} entfernt – Werte bleiben im Verlauf")
                continue
            assert daten is not None
            bereich = name_von.get(daten[CONF_BEREICH], daten[CONF_BEREICH])
            if aktion == "anlegen":
                hass.config_entries.async_add_subentry(entry, ConfigSubentry(
                    data=MappingProxyType(daten), subentry_type=SUB_GERAET, title=daten["name"], unique_id=None, subentry_id=sid))
                neu.append(sid)
                st.protokoll("einstellung", daten[CONF_BEREICH], f"{daten['name']} angelegt in {bereich}")
                continue
            sub = entry.subentries[sid]
            if dict(sub.data) == daten and sub.title == daten["name"]:
                continue
            verschoben = sub.data.get(CONF_BEREICH) != daten[CONF_BEREICH]
            hass.config_entries.async_update_subentry(entry, sub, data=daten, title=daten["name"])
            st.protokoll("einstellung", daten[CONF_BEREICH],
                         f"{daten['name']} nach {bereich} verschoben" if verschoben else f"{daten['name']} geändert")
    finally:
        await st.einstellungen.async_jetzt_speichern()
        await hass.config_entries.async_reload(entry.entry_id)
    return neu


# ---------------------------------------------------------------------- BSM-034.03: Sensoren je Container
def sensoren(st: Steuerung, bid: str) -> list[sensor_logik.Sensor]:
    """Sensoren des Bereichs (logik/sensoren) – die eine Liste für alles."""
    info = st.bereiche.get(bid)
    return [] if info is None else sensor_logik.aus_einstellungen(info.fuehler, st.einstellungen.bereich(bid))


def kontakt_offen_seit(st: Steuerung, bid: str) -> datetime | None:
    """Seit wann ein Kontakt des Bereichs offen ist (der am längsten offene, logik/sensoren); None = alle zu.

    FE-0036/37: je Kontakt im Store gemerkt (`lz["kontakt_offen"]`), damit ein HA-Neustart die Zeit nicht zurücksetzt.
    """
    gemerkt: dict[str, list[str]] = st.lz.setdefault("kontakt_offen", {})
    zeiten, geaendert = [], False
    for eid in sensor_logik.kontakte(sensoren(st, bid)):
        s = st.hass.states.get(eid)
        offen = None if s is None or s.state in (STATE_UNAVAILABLE, STATE_UNKNOWN) else s.state == STATE_ON
        alt = gemerkt.get(eid)
        merker = (z0, z1) if alt and (z0 := _zeit(alt[0])) and (z1 := _zeit(alt[1])) else None
        seit, neu = sensor_logik.offen_merken(merker, offen, None if s is None else dt_util.as_local(s.last_changed),
                                              st._gestartet)
        if neu != merker:
            if neu is None:
                gemerkt.pop(eid, None)
            else:
                gemerkt[eid] = [neu[0].isoformat(), neu[1].isoformat()]
            geaendert = True
        zeiten.append(seit)
    if geaendert:
        st.einstellungen.speichern()
    return sensor_logik.offen_seit(zeiten)


def batterie(st: Steuerung, entity_id: str) -> float | None:
    """Batterie (%) am Gerät des Sensors, sonst None."""
    ents = er.async_get(st.hass)
    eintrag = ents.async_get(entity_id)
    if eintrag is None or eintrag.device_id is None:
        return None
    for x in er.async_entries_for_device(ents, eintrag.device_id):
        if (x.device_class or x.original_device_class) == "battery" and x.entity_id.startswith("sensor."):
            try:
                return float(st.hass.states.get(x.entity_id).state)  # type: ignore[union-attr]
            except (AttributeError, TypeError, ValueError):
                return None
    return None
