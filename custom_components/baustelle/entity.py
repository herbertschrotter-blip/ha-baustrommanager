"""Gemeinsame Basis der Entitäten: Gerät „Baustelle“ und je Bereich ein Gerät."""

from __future__ import annotations

from homeassistant.helpers.device import async_entity_id_to_device
from homeassistant.helpers.device_registry import DeviceInfo
from homeassistant.helpers.entity import Entity

from .const import DOMAIN
from .steuerung import Steuerung

HERSTELLER = "ha-baustrommanager"
MODELL = {"container": "Container", "pumpenschacht": "Pumpenschacht"}


class BaustelleEntity(Entity):
    """Entität, die nach jeder Auswertung der Steuerung neu geschrieben wird."""

    _attr_has_entity_name = True
    _attr_should_poll = False

    def __init__(
        self, steuerung: Steuerung, key: str, bereich_id: str | None = None, geraet_id: str | None = None
    ) -> None:
        self.steuerung = steuerung
        entry = steuerung.entry
        if geraet_id is not None:
            bereich_id = steuerung.geraete[geraet_id].bereich
            # Container immer vorne (Herbert 30.09.2026): „Mannschaft · Radiator Ø Leistung“ – gleich benannte Geräte in
            # verschiedenen Containern sind so in HA unterscheidbar; die entity_id bestehender Entitäten bleibt
            g = steuerung.geraete[geraet_id]
            b = steuerung.bereiche.get(g.bereich)
            self._attr_translation_placeholders = {"geraet": f"{b.name} · {g.name}" if b else g.name}
        self.bereich_id = bereich_id
        self.geraet_id = geraet_id
        self._attr_translation_key = key
        if geraet_id is not None:
            # Helfer-Muster: Entitäten eines Shelly hängen an dessen Gerät (ein Gerät gehört genau einem Subentry)
            self._attr_unique_id = f"{geraet_id}_{key}"
            geraet = steuerung.geraete[geraet_id]
            self.device_entry = async_entity_id_to_device(steuerung.hass, geraet.schalter)
            if self.device_entry is None:
                self._attr_device_info = DeviceInfo(
                    identifiers={(DOMAIN, geraet_id)}, name=geraet.name, manufacturer=HERSTELLER, model="Shelly",
                    via_device_id=steuerung.geraet_ids[geraet.bereich],
                )
        elif bereich_id is None:
            self._attr_unique_id = f"{entry.entry_id}_{key}"
            self._attr_device_info = DeviceInfo(
                identifiers={(DOMAIN, entry.entry_id)}, name=entry.title, manufacturer=HERSTELLER, model="Baustelle"
            )
        else:
            info = steuerung.bereiche[bereich_id]
            self._attr_unique_id = f"{bereich_id}_{key}"
            self._attr_device_info = DeviceInfo(
                identifiers={(DOMAIN, bereich_id)},
                name=info.name,
                manufacturer=HERSTELLER,
                model=MODELL[info.art],
                via_device_id=steuerung.geraet_ids[entry.entry_id],
            )

    async def async_added_to_hass(self) -> None:
        self.async_on_remove(self.steuerung.async_add_listener(self.async_write_ha_state))
