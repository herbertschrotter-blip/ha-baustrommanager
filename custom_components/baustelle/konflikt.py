"""Namenskonflikt im Benenner lösen (Mockup `mockups/namen-konflikt.html`, abgenommen von Herbert am 24.11.2026).

Hält eine fremde Entität die Entity-ID, die der Benenner vergeben will, liefert die Vorschau je belegendem Gerät eine
Karte (`belegt_von`): Name, Werksname, Integration, HA-Bereich, ob die Baustelle es verwendet, ob es verwaist ist, seine
Entitäten, wo sie verwendet werden und was „Auf Werksnamen zurücksetzen“ täte. Gelöst wird mit
`baustelle/inventar_konflikt_loesen` (in `inventar.py`): zurücksetzen (Gerätename leer, Entity-IDs mit dem Werksnamen,
wie „Entitäts-IDs umbenennen“ in HA) oder ein verwaistes Gerät bzw. eine verwaiste Entität entfernen. Die Regeln
(Gruppen, neue IDs, was erlaubt ist) stehen in `logik/inventar.py`.
"""

from __future__ import annotations

from collections.abc import Iterable, Mapping
from typing import Any

from homeassistant.config_entries import ConfigEntryState
from homeassistant.core import HomeAssistant
from homeassistant.helpers import area_registry as ar, device_registry as dr, entity_registry as er
from homeassistant.loader import async_get_integration

from .const import DOMAIN
from .inventar_geraete import _belegt as baustelle_belegt, async_verweise
from .logik.inventar import belegt_gruppen, loesungen, verwaist, werks_ids

NICHT_VERFUEGBAR = ("unavailable", "unknown")


def _alle_ids(hass: HomeAssistant) -> set[str]:
    return set(er.async_get(hass).entities) | set(hass.states.async_entity_ids())


def _zustand(hass: HomeAssistant, eid: str) -> str:
    z = hass.states.get(eid)
    if z is None or z.state in NICHT_VERFUEGBAR:
        return "nicht verfügbar"
    einheit = z.attributes.get("unit_of_measurement")
    return f"{z.state} {einheit}" if einheit else z.state


async def _integration(hass: HomeAssistant, domain: str | None) -> str | None:
    if not domain:
        return None
    try:
        return (await async_get_integration(hass, domain)).name
    except Exception:   # noqa: BLE001 – nur für die Anzeige
        return domain


def _eintraege(hass: HomeAssistant, entry_ids: Iterable[str | None]) -> list[str]:
    """Je Integrationseintrag `fehlt`, `geladen` oder `anders` (für logik/inventar.verwaist)."""
    return ["fehlt" if (ce := hass.config_entries.async_get_entry(i)) is None
            else "geladen" if ce.state is ConfigEntryState.LOADED else "anders" for i in entry_ids if i]


def _zustaende(hass: HomeAssistant, reg: er.EntityRegistry, ids: Iterable[str]) -> list[str]:
    """Je Entität `da`, `weg` (kein Zustand oder nur wiederhergestellt) oder `aus` (abgeschaltet)."""
    aus = []
    for eid in ids:
        e, z = reg.async_get(eid), hass.states.get(eid)
        aus.append("aus" if e is not None and e.disabled else "weg" if z is None or z.attributes.get("restored") else "da")
    return aus


def besitzer(hass: HomeAssistant, ids: Iterable[str]) -> dict[str, str | None]:
    """Je Entity-ID das Gerät, zu dem sie gehört (None = ohne Gerät)."""
    reg = er.async_get(hass)
    return {eid: (e.device_id if (e := reg.async_get(eid)) is not None else None) for eid in ids}


async def async_karte(hass: HomeAssistant, ref: str, trifft: list[str] | None = None) -> dict[str, Any] | None:
    """Karte eines belegenden Geräts (`ref` = device_id) bzw. einer Entität ohne Gerät (`ref` = entity_id)."""
    reg, geraete = er.async_get(hass), dr.async_get(hass)
    verwendet = baustelle_belegt(hass)
    geraet = geraete.async_get(ref) if "." not in ref else None
    if isinstance(geraet, dr.DeviceEntry):
        ents = [e.entity_id for e in er.async_entries_for_device(reg, geraet.id, include_disabled_entities=True)]
        domains = [ce.domain for i in geraet.config_entries if (ce := hass.config_entries.async_get_entry(i)) is not None]
        name_alt = geraet.name_by_user or geraet.name
        werks = werks_ids(ents, name_alt, geraet.name, _alle_ids(hass)) if geraet.name_by_user else {}
        bereich = ar.async_get(hass).async_get_area(geraet.area_id) if geraet.area_id else None
        baustelle = next((verwendet[e] for e in ents if e in verwendet), None)
        if baustelle is None and any(d == DOMAIN for d, _ in geraet.identifiers):
            baustelle = "Gerät der Integration"
        ist_verwaist = verwaist(_eintraege(hass, geraet.config_entries), _zustaende(hass, reg, ents))
        karte: dict[str, Any] = {"ref": geraet.id, "art": "geraet", "name": name_alt, "werksname": geraet.name,
                                 "modell": " ".join(x for x in (geraet.manufacturer, geraet.model) if x) or None,
                                 "integration": await _integration(hass, domains[0] if domains else None),
                                 "bereich": bereich.name if bereich else None}
    else:
        if (e := reg.async_get(ref)) is None and hass.states.get(ref) is None:
            return None
        ents, werks, baustelle = [ref], {}, verwendet.get(ref)
        ist_verwaist = e is not None and verwaist(_eintraege(hass, [e.config_entry_id]), _zustaende(hass, reg, [ref]))
        karte = {"ref": ref, "art": "entitaet", "name": (e.name or e.original_name) if e else None, "werksname": None,
                 "modell": None, "integration": await _integration(hass, e.platform if e else None), "bereich": None}
    t = list(trifft) if trifft is not None else [x for x in ents]
    verweise = await async_verweise(hass, {x: werks.get(x, x) for x in ents})
    karte.update({
        "baustelle": baustelle, "verwaist": ist_verwaist, "trifft": t, "werks": werks,
        "entitaeten": [{"entity_id": x, "zustand": _zustand(hass, x), "trifft": x in t} for x in ents],
        "verwendet_in": sorted({f"{v['art']} „{v['name']}“" for v in verweise if v.get("art") != "Dashboard"}
                               | {f"Dashboard „{v['name']}“" for v in verweise if v.get("art") == "Dashboard"}),
        "loesungen": loesungen(geraet=karte["art"] == "geraet", baustelle=baustelle, verwaist=ist_verwaist,
                               integration=karte["integration"], trifft=t, werks=werks),
    })
    return karte


async def async_belegt_von(hass: HomeAssistant, konfl: Mapping[str, str]) -> list[dict[str, Any]]:
    """Karten zu den Konflikten der Vorschau ({alt: neu}) – eine je belegendem Gerät."""
    if not konfl:
        return []
    gruppen = belegt_gruppen(konfl, besitzer(hass, konfl.values()))
    karten = [await async_karte(hass, ref, ids) for ref, ids in gruppen.items()]
    return [k for k in karten if k is not None]


async def async_loesen(hass: HomeAssistant, ref: str, aktion: str, trifft: list[str] | None = None) -> dict[str, Any]:
    """Zurücksetzen bzw. entfernen; prüft dieselbe Regel wie die Karte (logik/inventar.loesungen, mit den Ziel-IDs der
    Konflikte in `trifft`). Wirft `LookupError` bzw. `ValueError`; scheitert eine Umbenennung, wird zurückgedreht."""
    if (karte := await async_karte(hass, ref, trifft or None)) is None:
        raise LookupError("Gerät oder Entität nicht gefunden")
    lsg = karte["loesungen"][aktion]
    if not lsg["ok"]:
        raise ValueError(lsg["warum"])
    reg = er.async_get(hass)
    if aktion == "zuruecksetzen":
        werks: dict[str, str] = karte["werks"]
        erledigt: list[tuple[str, str]] = []
        try:   # erst die Entity-IDs, dann der Gerätename – geht eine ID nicht, bleibt alles wie vorher
            for alt, neu in werks.items():
                reg.async_update_entity(alt, new_entity_id=neu)
                erledigt.append((alt, neu))
        except ValueError as err:
            for alt, neu in reversed(erledigt):
                reg.async_update_entity(neu, new_entity_id=alt)
            raise ValueError(f"Zurücksetzen ging nicht: {err}") from err
        dr.async_get(hass).async_update_device(ref, name_by_user=None)
        return {"aktion": aktion, "getauscht": werks, "name": karte["werksname"]}
    if karte["art"] == "geraet":
        dr.async_get(hass).async_remove_device(ref)   # die Entitäten des Geräts entfernt HA mit
    else:
        reg.async_remove(ref)
    return {"aktion": aktion, "entfernt": [e["entity_id"] for e in karte["entitaeten"]], "name": karte["name"]}
