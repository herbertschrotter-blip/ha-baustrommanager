"""Kern: Kalender – Feiertage, Urlaub, Termine, Arbeitszeiten und Ausnahmen (BSM-023)."""

from __future__ import annotations

from datetime import date, datetime, timedelta
import logging
from typing import TYPE_CHECKING, Any

from homeassistant.const import STATE_ON
from homeassistant.exceptions import HomeAssistantError
from homeassistant.util import dt as dt_util

from ..const import CONF_FEIERTAG_KALENDER, CONF_URLAUB_KALENDER
from ..funktionen.basis import ev_zeit as _ev_zeit, mitternacht as _mitternacht
from ..logik.arbeitszeit import Arbeitszeit, Ausnahme
from .wetter import _antwort_liste

if TYPE_CHECKING:
    from ..steuerung import Steuerung

_LOGGER = logging.getLogger("custom_components.baustelle.steuerung")


FEIERTAGE_VORAUS_TAGE = 366   # Feiertage ein Jahr voraus (für „nächster Feiertag“), Urlaub und Funktionen 15 Tage


async def _async_kalender(st: Steuerung, _now: datetime | None = None) -> None:
    """Feiertage, Urlaub und Kalender der Funktionen, laufende und nächste Woche (Dienst calendar.get_events)."""
    heute = dt_util.now().date()
    start = _mitternacht(heute - timedelta(days=heute.weekday()))
    ende = start + timedelta(days=15)
    o = st.entry.options
    for art, key in (("feiertag", CONF_FEIERTAG_KALENDER), ("urlaub", CONF_URLAUB_KALENDER)):
        bis = start + timedelta(days=FEIERTAGE_VORAUS_TAGE) if art == "feiertag" else ende
        tage = tage_aus_events(await st.async_events(o.get(key), start, bis))
        if art == "feiertag":
            st.kalender_namen.update({tag: name or "Feiertag" for tag, name in tage.items()})
        st.kalender_tage[art] = set(tage)
    for f in st.funktionen:
        await f.async_kalender(start, ende)
    st.auswerten()


def tage_aus_events(events: list[dict[str, Any]]) -> dict[date, str]:
    """Jeder Tag, den ein Kalendereintrag berührt, mit dessen Titel (Feiertage, Urlaub)."""
    tage: dict[date, str] = {}
    for ev in events:
        von, bis = _ev_zeit(ev.get("start")), _ev_zeit(ev.get("end"))
        if von is None or bis is None:
            continue
        tag = von.date()
        while _mitternacht(tag) < bis:
            tage[tag] = str(ev.get("summary") or "")
            tag += timedelta(days=1)
    return tage


async def async_frei_tage(st: Steuerung, start: datetime, ende: datetime) -> dict[str, set[date]]:
    """Feiertage und Urlaub für einen beliebigen Zeitraum (Hochrechnung der ganzen Heizperiode, FE-0030)."""
    o = st.entry.options
    return {art: set(tage_aus_events(await st.async_events(o.get(key), start, ende)))
            for art, key in (("feiertag", CONF_FEIERTAG_KALENDER), ("urlaub", CONF_URLAUB_KALENDER))}


async def async_events(st: Steuerung, entity_id: str | None, start: datetime, ende: datetime) -> list[dict[str, Any]]:
    if not entity_id or st.hass.states.get(entity_id) is None:
        return []
    try:
        antwort = await st.hass.services.async_call(
            "calendar", "get_events",
            {"start_date_time": start.isoformat(), "end_date_time": ende.isoformat()},
            target={"entity_id": entity_id}, blocking=True, return_response=True,
        )
    except (HomeAssistantError, ValueError) as err:
        _LOGGER.debug("Kalender %s nicht lesbar: %s", entity_id, err)
        return []
    return _antwort_liste(antwort, entity_id, "events")


async def async_event_details(st: Steuerung, entity_id: str | None, start: datetime, ende: datetime
) -> dict[tuple[str, str], tuple[str, str | None]]:
    """uid und rrule je Kalendereintrag (liefert calendar.get_events nicht) – direkt von der Kalender-Entität."""
    try:
        from homeassistant.components.calendar.const import DATA_COMPONENT  # noqa: PLC0415

        entity = st.hass.data[DATA_COMPONENT].get_entity(entity_id or "")
        if entity is None:
            return {}
        events = await entity.async_get_events(st.hass, start, ende)
    except (KeyError, HomeAssistantError, AttributeError, NotImplementedError) as err:
        _LOGGER.debug("Kalender-Details von %s nicht lesbar: %s", entity_id, err)
        return {}
    details = {}
    for ev in events:
        von = ev.start if isinstance(ev.start, datetime) else _mitternacht(ev.start)
        details[(dt_util.as_local(von).isoformat(), ev.summary)] = (ev.uid or "", ev.rrule or None)
    return details


def frei_art(st: Steuerung, tag: date) -> str | None:
    """„feiertag“, „urlaub“ oder None – aus den Kalendern (heute zusätzlich aus deren Zustand)."""
    heute = dt_util.now().date()
    o = st.entry.options
    if tag in st.kalender_tage["feiertag"] or (tag == heute and st._kalender_an(o.get(CONF_FEIERTAG_KALENDER))):
        return "feiertag"
    if tag in st.kalender_tage["urlaub"] or (tag == heute and st._kalender_an(o.get(CONF_URLAUB_KALENDER))):
        return "urlaub"
    return None


def _kalender_an(st: Steuerung, entity_id: str | None) -> bool:
    return entity_id is not None and (s := st.hass.states.get(entity_id)) is not None and s.state == STATE_ON


def arbeitszeiten(st: Steuerung) -> list[Arbeitszeit]:
    liste = []
    for x in st.e["arbeitszeiten"]:
        try:
            liste.append(Arbeitszeit.aus_store(x))
        except (KeyError, ValueError, TypeError, IndexError):
            _LOGGER.warning("Arbeitszeit %s ist ungültig und wird übergangen", x)
    return liste


def ausnahmen(st: Steuerung) -> list[Ausnahme]:
    liste = []
    for x in st.e["ausnahmen"]:
        try:
            liste.append(Ausnahme.aus_store(x))
        except (KeyError, ValueError, TypeError):
            _LOGGER.warning("Ausnahme %s ist ungültig und wird übergangen", x)
    return liste
