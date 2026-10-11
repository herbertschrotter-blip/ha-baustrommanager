"""Baustelle: Heizung in Baustellencontainern und Pumpenüberwachung mit Shellys."""

from __future__ import annotations

from homeassistant.config_entries import ConfigEntry
import voluptuous as vol

from homeassistant.const import EVENT_HOMEASSISTANT_STOP
from homeassistant.core import Event, HomeAssistant, ServiceCall, ServiceResponse, SupportsResponse, callback
from homeassistant.exceptions import ServiceValidationError
from homeassistant.helpers import config_validation as cv
from homeassistant.helpers.service import async_register_admin_service
from homeassistant.helpers.typing import ConfigType
from homeassistant.loader import async_get_integration
from homeassistant.helpers import device_registry as dr, entity_registry as er, issue_registry as ir

from .abgleich import abgleich_planen
from .funktionen.heizung.hochrechnung import hochrechnung_planen
from .funktionen.heizung.prognose_schatten import prognose_v2_planen
from .const import ALTE_PLATTFORMEN, CONF_REGEN_SENSOR, CONF_TEMP_SENSOR, CONF_WETTER, DOMAIN, PLATFORMS
from .daten import struktur
from .db import async_datenbank_starten, async_rueckweg, async_entfernen as async_db_entfernen, async_spiegeln, mitschreiber_starten, uebernahme_planen
from .einstellungen import STATUS_TEXT, TICKET_STATUS, Einstellungen
from .entity import HERSTELLER, MODELL
from .notprogramm import DATA_NOTPROGRAMM, Notprogramm
from .panel import DATA_MELDUNGEN, async_panel_anmelden
from .steuerung import Steuerung
from .umbenennen import nachholen_planen

type BaustelleConfigEntry = ConfigEntry[Steuerung]

CONF_DB_URL = "db_url"
# Baustellen kommen aus der Oberfläche; in YAML nur die Datenbank der ganzen Instanz (wie beim Recorder, Phase 8):
#   baustelle:
#     db_url: !secret baustelle_db_url
CONFIG_SCHEMA = vol.Schema({DOMAIN: vol.Schema({vol.Optional(CONF_DB_URL): cv.string})}, extra=vol.ALLOW_EXTRA)


async def async_setup(hass: HomeAssistant, config: ConfigType) -> bool:
    """Eigene Seite „Baustelle“ anmelden (unabhängig von den einzelnen Baustellen)."""
    version = str((await async_get_integration(hass, DOMAIN)).version)
    # eigene Datenbank zuerst (docs/bauplan-datenbank.md) – Seite und Meldungen laden schon aus ihr (BSM-015)
    db = await async_datenbank_starten(hass, (config.get(DOMAIN) or {}).get(CONF_DB_URL))
    await async_panel_anmelden(hass, version)

    async def datenbank_schliessen(_event: Event) -> None:
        await db.async_stop()

    hass.bus.async_listen_once(EVENT_HOMEASSISTANT_STOP, datenbank_schliessen)

    async def ticket(call: ServiceCall) -> ServiceResponse:
        """Ticket aus dem Melden-Knopf ändern (Status, Notiz, Version, Commit) – für die Bearbeitung in Claude Code."""
        meldungen = hass.data[DATA_MELDUNGEN]
        await meldungen.async_laden()
        m = meldungen.finden(call.data["ticket"])
        if m is None:
            raise ServiceValidationError(
                translation_domain=DOMAIN, translation_key="ticket_fehlt",
                translation_placeholders={"ticket": call.data["ticket"]},
            )
        meldungen.aendern(m, status=call.data.get("status"), notiz=call.data.get("notiz"), version=call.data.get("version"),
                          commit=call.data.get("commit"), von=call.data.get("von") or "Claude")
        return {"ticket": m["ticket"], "status": m["status"], "status_text": STATUS_TEXT.get(m["status"], m["status"])}

    async def notprogramm_pruefen(call: ServiceCall) -> None:
        """BSM-019: Notprogramm aller Baustellen jetzt prüfen (wie der Knopf „Jetzt prüfen“)."""
        for np in list(hass.data.get(DATA_NOTPROGRAMM, {}).values()):
            await np.async_runde()

    async_register_admin_service(hass, DOMAIN, "notprogramm_pruefen", notprogramm_pruefen)   # nur Admins (Bauplan §8)

    async def datenbank_rueckweg(_call: ServiceCall) -> ServiceResponse:
        """BSM-026 8d: Daten dieser Instanz aus PostgreSQL in eine neue SQLite-Datei (Rückweg ohne db_url)."""
        try:
            return await async_rueckweg(hass)
        except (ValueError, FileExistsError) as err:
            raise ServiceValidationError(translation_domain=DOMAIN, translation_key="rueckweg",
                                         translation_placeholders={"grund": str(err)}) from err

    async_register_admin_service(hass, DOMAIN, "datenbank_rueckweg", datenbank_rueckweg,
                                 supports_response=SupportsResponse.ONLY)
    hass.services.async_register(
        DOMAIN, "ticket", ticket,
        schema=vol.Schema({
            vol.Required("ticket"): cv.string,
            vol.Optional("status"): vol.In(TICKET_STATUS),
            vol.Optional("notiz"): vol.All(cv.string, vol.Length(max=5000)),
            vol.Optional("version"): vol.All(cv.string, vol.Length(max=50)),
            vol.Optional("commit"): vol.All(cv.string, vol.Length(max=80)),
            vol.Optional("von"): vol.All(cv.string, vol.Length(max=50)),
        }),
        supports_response=SupportsResponse.OPTIONAL,
    )
    return True


async def async_setup_entry(hass: HomeAssistant, entry: BaustelleConfigEntry) -> bool:
    """Baustelle starten."""
    _eigene_quellen_entfernen(hass, entry)
    _alte_entitaeten_entfernen(hass, entry)
    steuerung = Steuerung(hass, entry)
    entry.runtime_data = steuerung
    await steuerung.async_start()
    entry.async_on_unload(steuerung.async_stop)
    _geraete_anlegen(hass, entry, steuerung)
    _verwaiste_geraete_entfernen(hass, entry)
    await hass.config_entries.async_forward_entry_setups(entry, PLATFORMS)
    hass.async_create_task(async_spiegeln(hass, struktur(hass, entry)), "baustelle_datenbank_spiegeln")   # Stammdaten
    if (mitschreiber := mitschreiber_starten(hass, steuerung)) is not None:   # je Minute, Ereignisse (BSM-007)
        entry.async_on_unload(mitschreiber.async_stop)
        if (abbrechen := uebernahme_planen(hass, steuerung, mitschreiber.start_zeit)) is not None:   # Altdaten (BSM-008)
            entry.async_on_unload(abbrechen)
    notprogramm = Notprogramm(hass, steuerung)   # Skript und Programm in den Plugs (BSM-017)
    hass.data.setdefault(DATA_NOTPROGRAMM, {})[entry.entry_id] = notprogramm
    entry.async_on_unload(notprogramm.async_start())

    @callback
    def _notprogramm_weg() -> None:
        hass.data.get(DATA_NOTPROGRAMM, {}).pop(entry.entry_id, None)
    entry.async_on_unload(_notprogramm_weg)
    entry.async_on_unload(nachholen_planen(hass, entry.entry_id))   # Plug-Namen offener Umbenennungen (BSM-031.06c)
    entry.async_on_unload(abgleich_planen(hass, steuerung))   # Inventar ↔ HA beim Start und täglich (BSM-034.04)
    entry.async_on_unload(hochrechnung_planen(hass, steuerung))   # Hochrechnung mit Signatur, Start und täglich (BSM-033.02)
    entry.async_on_unload(prognose_v2_planen(hass, steuerung))   # Schattenprognose V2, schaltet nichts (BSM-033.09)
    # Optionen und Subentries (Bereiche, Geräte) geändert → neu laden (Muster der Kern-Helfer)
    entry.async_on_unload(entry.add_update_listener(_neu_laden))
    return True


async def async_unload_entry(hass: HomeAssistant, entry: BaustelleConfigEntry) -> bool:
    """Baustelle entladen (Einstellungen und Zähler vorher sicher speichern).

    Erst anhalten, dann speichern: sonst zählt ein Messwert zwischen Speichern und Anhalten noch mit und plant einen
    verzögerten Schreibvorgang ein, der nach dem Neu-Laden die Datei der neuen Instanz überschreibt.
    """
    entry.runtime_data.async_stop()
    await entry.runtime_data.einstellungen.async_jetzt_speichern()
    return await hass.config_entries.async_unload_platforms(entry, PLATFORMS)


async def async_remove_entry(hass: HomeAssistant, entry: BaustelleConfigEntry) -> None:
    """Gespeicherte Einstellungen und Reparatur-Hinweise löschen; die Langzeitstatistik bleibt in HA erhalten."""
    await Einstellungen(hass, entry.entry_id).async_entfernen()
    await async_db_entfernen(hass, entry.entry_id)   # in der Datenbank nur als entfernt kennzeichnen
    for (domain, issue_id) in list(ir.async_get(hass).issues):
        if domain == DOMAIN and issue_id.startswith(f"fehlt_{entry.entry_id}_"):
            ir.async_delete_issue(hass, DOMAIN, issue_id)


def _eigene_quellen_entfernen(hass: HomeAssistant, entry: BaustelleConfigEntry) -> None:
    """Eigene Sensoren der Integration taugen nicht als Wetterquelle (Kreis): aus den Optionen nehmen."""
    registry = er.async_get(hass)
    optionen = dict(entry.options)
    for key in (CONF_TEMP_SENSOR, CONF_REGEN_SENSOR, CONF_WETTER):
        eintrag = registry.async_get(optionen.get(key) or "")
        if eintrag is not None and eintrag.platform == DOMAIN:
            optionen.pop(key)
    if optionen != dict(entry.options):
        hass.config_entries.async_update_entry(entry, options=optionen)


def _alte_entitaeten_entfernen(hass: HomeAssistant, entry: BaustelleConfigEntry) -> None:
    """Einstellungs-Entitäten aus 0.6 (Zeitplan, Regeln, Modus, Soll, Test-Meldung …) aus der Registry räumen."""
    registry = er.async_get(hass)
    for eintrag in er.async_entries_for_config_entry(registry, entry.entry_id):
        if eintrag.domain in ALTE_PLATTFORMEN or (
            eintrag.domain == "switch" and eintrag.unique_id != f"{entry.entry_id}_automatik"
        ):
            registry.async_remove(eintrag.entity_id)


def _geraete_anlegen(hass: HomeAssistant, entry: BaustelleConfigEntry, steuerung: Steuerung) -> None:
    """Gerät der Baustelle und je Bereich ein Gerät darunter anlegen (Verknüpfung über via_device_id)."""
    registry = dr.async_get(hass)
    haupt = registry.async_get_or_create(
        config_entry_id=entry.entry_id, identifiers={(DOMAIN, entry.entry_id)},
        name=entry.title, manufacturer=HERSTELLER, model="Baustelle",
    )
    steuerung.geraet_ids[entry.entry_id] = haupt.id
    for bid, info in steuerung.bereiche.items():
        bereich = registry.async_get_or_create(
            config_entry_id=entry.entry_id, config_subentry_id=bid, identifiers={(DOMAIN, bid)},
            name=info.name, manufacturer=HERSTELLER, model=MODELL[info.art], via_device_id=haupt.id,
        )
        steuerung.geraet_ids[bid] = bereich.id


def _eigene_ids(entry: BaustelleConfigEntry) -> set[str]:
    """Kennungen der Geräte, die zur Einrichtung gehören: die Baustelle und ihre Subentries (Bereiche, Shellys)."""
    return {entry.entry_id, *entry.subentries}


def _verwaist(entry: BaustelleConfigEntry, geraet: dr.DeviceEntry) -> bool:
    """Gerät mit eigener Kennung, zu der es keinen Bereich bzw. Shelly mehr gibt."""
    kennungen = {wert for (domain, wert) in geraet.identifiers if domain == DOMAIN}
    return bool(kennungen) and not kennungen & _eigene_ids(entry)


def _verwaiste_geraete_entfernen(hass: HomeAssistant, entry: BaustelleConfigEntry) -> None:
    """Geräte von Bereichen/Shellys, die es nicht mehr gibt (z. B. aus älteren Versionen), aus der Registry nehmen."""
    registry = dr.async_get(hass)
    for geraet in dr.async_entries_for_config_entry(registry, entry.entry_id):
        if _verwaist(entry, geraet):
            registry.async_update_device(geraet.id, remove_config_entry_id=entry.entry_id)


async def async_remove_config_entry_device(
    hass: HomeAssistant, entry: BaustelleConfigEntry, geraet: dr.DeviceEntry
) -> bool:
    """„Gerät löschen“ in HA nur für verwaiste Geräte; Bereiche und Shellys entfernt man über ihren Unter-Eintrag."""
    return _verwaist(entry, geraet)


async def _neu_laden(hass: HomeAssistant, entry: BaustelleConfigEntry) -> None:
    if getattr(entry, "runtime_data", None) is not None and entry.runtime_data.neu_laden_folgt:
        return   # Umbenennen (umbenennen.py) ändert mehrere Unter-Einträge und lädt danach selbst einmal neu
    hass.config_entries.async_schedule_reload(entry.entry_id)
