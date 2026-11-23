"""Einrichtung: Baustelle (Eintrag), Bereiche und Geräte (Subentries), Optionen."""

from __future__ import annotations

from datetime import date
from typing import Any

import voluptuous as vol

from homeassistant.config_entries import (
    SOURCE_USER,
    ConfigEntry,
    ConfigFlow,
    ConfigFlowResult,
    ConfigSubentryFlow,
    FlowType,
    OptionsFlow,
    SubentryFlowContext,
    SubentryFlowResult,
)
from homeassistant.const import CONF_NAME
from homeassistant.core import HomeAssistant, callback
from homeassistant.helpers import entity_registry as er, selector
from homeassistant.util import dt as dt_util

from .const import (
    ART_CONTAINER,
    ART_PUMPENSCHACHT,
    CONF_ART,
    CONF_BEGINN,
    CONF_BEREICH,
    CONF_EMPFAENGER,
    CONF_ENDE,
    CONF_ENERGIE,
    CONF_FEIERTAG_KALENDER,
    CONF_FUEHLER,
    CONF_HEIZPERIODE_BIS,
    CONF_HEIZPERIODE_VON,
    CONF_HEIZUNG,
    CONF_LEISTUNG,
    CONF_PUMPEN,
    CONF_REGEN_SENSOR,
    CONF_ROLLE,
    CONF_SCHALTER,
    CONF_STATUS,
    CONF_TEMP_SENSOR,
    CONF_TYP,
    CONF_URLAUB_KALENDER,
    CONF_WETTER,
    DOMAIN,
    ROLLE_HEIZKOERPER,
    ROLLEN,
    STATUS_ABGESCHLOSSEN,
    STATUS_AKTIV,
    SUB_BEREICH,
    SUB_GERAET,
    TYP_KONVEKTOR,
    TYPEN,
)
from .logik import geraete as geraete_logik, zeitraum

MONATE = [str(m) for m in range(1, 13)]


def _auswahl(optionen: list[str], key: str, *, multiple: bool = False) -> selector.SelectSelector:
    return selector.SelectSelector(
        selector.SelectSelectorConfig(
            options=optionen, translation_key=key, multiple=multiple, mode=selector.SelectSelectorMode.DROPDOWN
        )
    )


def _entitaet(
    domain: str | list[str], device_class: str | None = None, ohne: list[str] | None = None
) -> selector.EntitySelector:
    filt: selector.EntityWithDeviceFilterSelectorConfig = {"domain": domain}
    if device_class:
        filt["device_class"] = device_class
    konfig = selector.EntitySelectorConfig(filter=filt)
    if ohne:
        konfig["exclude_entities"] = ohne
    return selector.EntitySelector(konfig)


def _eigene_entitaeten(hass: HomeAssistant) -> list[str]:
    """Entitäten dieser Integration – taugen nicht als Quelle (Kreis)."""
    return [e.entity_id for e in er.async_get(hass).entities.values() if e.platform == DOMAIN]


def _empfaenger(hass: HomeAssistant) -> list[str]:
    """Benachrichtigungsdienste, z. B. mobile_app_<handy> der Companion App (nachrichten.empfaenger_dienste)."""
    from .nachrichten import empfaenger_dienste  # noqa: PLC0415

    return empfaenger_dienste(hass)


def entitaet_vorhanden(hass: HomeAssistant, entity_id: str) -> bool:
    """Kennt HA die Entität (Registry oder Zustand)? Auch ein gerade nicht erreichbarer Shelly steht in der Registry."""
    return er.async_get(hass).async_get(entity_id) is not None or hass.states.get(entity_id) is not None


def geraet_pruefen(hass: HomeAssistant, entry: ConfigEntry, schalter: str, rolle: str, bereich_id: str,
                   eigene_id: str | None, name: str = "x") -> str | None:
    """Fehlerschlüssel für einen Shelly in einem Bereich dieser Baustelle (logik/geraete.pruefen) oder None."""
    bereich = entry.subentries.get(bereich_id)
    eigen = entry.subentries.get(eigene_id) if eigene_id else None
    return geraete_logik.pruefen(
        schalter=schalter, rolle=rolle, name=name,
        schalter_fehlt=(eigen is None or eigen.data.get(CONF_SCHALTER) != schalter) and not entitaet_vorhanden(hass, schalter),
        bereich_art=bereich.data[CONF_ART] if bereich is not None and bereich.subentry_type == SUB_BEREICH else None,
        vergeben_hier=any(s.subentry_type == SUB_GERAET and s.data.get(CONF_SCHALTER) == schalter and s.subentry_id != eigene_id
                          for s in entry.subentries.values()),
        andere_baustelle=schalter in geraete_anderer_baustellen(hass, entry.entry_id))


def geraete_anderer_baustellen(hass: HomeAssistant, ausser_entry_id: str) -> set[str]:
    """Schalter, die einer anderen aktiven Baustelle gehören (abgeschlossene geben sie frei)."""
    belegt: set[str] = set()
    for entry in hass.config_entries.async_entries(DOMAIN):
        if entry.entry_id == ausser_entry_id or entry.options.get(CONF_STATUS) == STATUS_ABGESCHLOSSEN:
            continue
        for sub in entry.subentries.values():
            if sub.subentry_type == SUB_GERAET:
                belegt.add(sub.data[CONF_SCHALTER])
    return belegt


class BaustelleConfigFlow(ConfigFlow, domain=DOMAIN):
    """Neue Baustelle anlegen."""

    VERSION = 1

    @staticmethod
    @callback
    def async_get_options_flow(config_entry: ConfigEntry) -> BaustelleOptionsFlow:
        return BaustelleOptionsFlow()

    @classmethod
    @callback
    def async_get_supported_subentry_types(cls, config_entry: ConfigEntry) -> dict[str, type[ConfigSubentryFlow]]:
        return {SUB_BEREICH: BereichSubentryFlow, SUB_GERAET: GeraetSubentryFlow}

    async def async_step_user(self, user_input: dict[str, Any] | None = None) -> ConfigFlowResult:
        errors: dict[str, str] = {}
        if user_input is not None:
            name = user_input[CONF_NAME].strip()
            self._async_abort_entries_match({CONF_NAME: name})
            if not user_input[CONF_HEIZUNG] and not user_input[CONF_PUMPEN]:
                errors["base"] = "keine_funktion"
            else:
                return self.async_create_entry(
                    title=name,
                    data={CONF_NAME: name},
                    options={
                        CONF_HEIZUNG: user_input[CONF_HEIZUNG],
                        CONF_PUMPEN: user_input[CONF_PUMPEN],
                        CONF_STATUS: STATUS_AKTIV,
                        # Beginn leer = Tag der Anlage (AN-0002, logik/zeitraum.beginn)
                        **({CONF_BEGINN: user_input[CONF_BEGINN]} if user_input.get(CONF_BEGINN) else {}),
                        CONF_HEIZPERIODE_VON: "10",
                        CONF_HEIZPERIODE_BIS: "4",
                        CONF_EMPFAENGER: [],
                    },
                )
        schema = vol.Schema(
            {
                vol.Required(CONF_NAME): selector.TextSelector(),
                vol.Optional(CONF_BEGINN): selector.DateSelector(),
                vol.Required(CONF_HEIZUNG, default=True): selector.BooleanSelector(),
                vol.Required(CONF_PUMPEN, default=False): selector.BooleanSelector(),
            }
        )
        return self.async_show_form(step_id="user", data_schema=schema, errors=errors)

    async def async_step_reconfigure(self, user_input: dict[str, Any] | None = None) -> ConfigFlowResult:
        """Baustelle umbenennen (alles Übrige steht in den Optionen und auf der Seite)."""
        entry = self._get_reconfigure_entry()
        errors: dict[str, str] = {}
        if user_input is not None:
            name = user_input[CONF_NAME].strip()
            if any(e.title == name for e in self._async_current_entries(include_ignore=False) if e.entry_id != entry.entry_id):
                errors["base"] = "name_vergeben"
            else:
                return self.async_update_reload_and_abort(entry, title=name, data_updates={CONF_NAME: name})
        schema = vol.Schema({vol.Required(CONF_NAME): selector.TextSelector()})
        return self.async_show_form(
            step_id="reconfigure",
            data_schema=self.add_suggested_values_to_schema(schema, user_input or {CONF_NAME: entry.title}),
            errors=errors,
        )

    async def async_on_create_entry(self, result: ConfigFlowResult) -> ConfigFlowResult:
        """Gleich den ersten Container anlegen lassen (wie bei den Kern-Helfern)."""
        sub = await self.hass.config_entries.subentries.async_init(
            (result["result"].entry_id, SUB_BEREICH), context=SubentryFlowContext(source=SOURCE_USER)
        )
        result["next_flow"] = (FlowType.CONFIG_SUBENTRIES_FLOW, sub["flow_id"])
        return result


class BaustelleOptionsFlow(OptionsFlow):
    """Einstellungen einer Baustelle: Status, Funktionen, Wetter, Kalender, Meldungen."""

    async def async_step_init(self, user_input: dict[str, Any] | None = None) -> ConfigFlowResult:
        errors: dict[str, str] = {}
        if user_input is not None:
            if not user_input[CONF_HEIZUNG] and not user_input[CONF_PUMPEN]:
                errors["base"] = "keine_funktion"
            elif user_input[CONF_STATUS] == STATUS_AKTIV and (
                belegt := geraete_anderer_baustellen(self.hass, self.config_entry.entry_id)
                & {s.data[CONF_SCHALTER] for s in self.config_entry.subentries.values() if s.subentry_type == SUB_GERAET}
            ):
                errors["base"] = "geraete_vergeben"
                self._belegt = ", ".join(sorted(belegt))
            else:
                # Ende nach logik/zeitraum (AN-0002): beim Abschließen immer heute, geplantes Ende bleibt bei aktiv
                ende = zeitraum.ende_beim_speichern(
                    self.config_entry.options.get(CONF_STATUS, STATUS_AKTIV), user_input[CONF_STATUS],
                    date.fromisoformat(user_input[CONF_ENDE]) if user_input.get(CONF_ENDE) else None, dt_util.now().date())
                user_input.pop(CONF_ENDE, None)
                if ende:
                    user_input[CONF_ENDE] = ende.isoformat()
                return self.async_create_entry(data=user_input)

        o = self.config_entry.options
        eigene = _eigene_entitaeten(self.hass)
        schema = vol.Schema(
            {
                vol.Required(CONF_STATUS): _auswahl([STATUS_AKTIV, STATUS_ABGESCHLOSSEN], CONF_STATUS),
                vol.Optional(CONF_BEGINN): selector.DateSelector(),
                vol.Optional(CONF_ENDE): selector.DateSelector(),
                vol.Required(CONF_HEIZUNG): selector.BooleanSelector(),
                vol.Required(CONF_PUMPEN): selector.BooleanSelector(),
                vol.Optional(CONF_WETTER): _entitaet("weather"),
                vol.Optional(CONF_TEMP_SENSOR): _entitaet("sensor", "temperature", eigene),
                vol.Optional(CONF_REGEN_SENSOR): _entitaet("sensor", "precipitation", eigene),
                vol.Optional(CONF_FEIERTAG_KALENDER): _entitaet("calendar"),
                vol.Optional(CONF_URLAUB_KALENDER): _entitaet("calendar"),
                vol.Optional(CONF_EMPFAENGER): _auswahl(_empfaenger(self.hass), CONF_EMPFAENGER, multiple=True),
                vol.Required(CONF_HEIZPERIODE_VON): _auswahl(MONATE, "monat"),
                vol.Required(CONF_HEIZPERIODE_BIS): _auswahl(MONATE, "monat"),
            }
        )
        return self.async_show_form(
            step_id="init",
            data_schema=self.add_suggested_values_to_schema(schema, dict(o)),
            errors=errors,
            description_placeholders={"belegt": getattr(self, "_belegt", "")},
        )


class BereichSubentryFlow(ConfigSubentryFlow):
    """Container oder Pumpenschacht anlegen und ändern."""

    def _schema(self) -> vol.Schema:
        return vol.Schema(
            {
                vol.Required(CONF_NAME): selector.TextSelector(),
                vol.Required(CONF_ART, default=ART_CONTAINER): _auswahl([ART_CONTAINER, ART_PUMPENSCHACHT], CONF_ART),
                vol.Optional(CONF_FUEHLER): selector.EntitySelector(
                    selector.EntitySelectorConfig(
                        filter=[{"domain": "sensor", "device_class": "temperature"}, {"domain": "climate"}]
                    )
                ),
            }
        )

    def _fuehler_fehlt(self, user_input: dict[str, Any], alt: str | None) -> bool:
        """Ein neu gewählter Fühler muss in HA existieren (z. B. kein alter Entwurf nach dem Umbenennen)."""
        f = user_input.get(CONF_FUEHLER)
        return bool(f) and f != alt and not entitaet_vorhanden(self.hass, f)

    async def async_step_user(self, user_input: dict[str, Any] | None = None) -> SubentryFlowResult:
        if user_input is not None:
            name = user_input[CONF_NAME].strip()
            if any(s.title == name for s in self._get_entry().subentries.values() if s.subentry_type == SUB_BEREICH):
                return self.async_show_form(step_id="user", data_schema=self._schema(), errors={"base": "name_vergeben"})
            if self._fuehler_fehlt(user_input, None):
                return self.async_show_form(step_id="user", data_schema=self._schema(), errors={"base": "fuehler_fehlt"})
            return self.async_create_entry(title=name, data={**user_input, CONF_NAME: name})
        return self.async_show_form(step_id="user", data_schema=self._schema())

    async def async_step_reconfigure(self, user_input: dict[str, Any] | None = None) -> SubentryFlowResult:
        sub = self._get_reconfigure_subentry()
        if user_input is not None:
            if self._fuehler_fehlt(user_input, sub.data.get(CONF_FUEHLER)):
                return self.async_show_form(
                    step_id="reconfigure", data_schema=self.add_suggested_values_to_schema(self._schema(), dict(sub.data)),
                    errors={"base": "fuehler_fehlt"})
            name = user_input[CONF_NAME].strip()
            data = {**user_input, CONF_NAME: name}
            return self.async_update_and_abort(self._get_entry(), sub, title=name, data=data)
        return self.async_show_form(
            step_id="reconfigure", data_schema=self.add_suggested_values_to_schema(self._schema(), dict(sub.data))
        )


class GeraetSubentryFlow(ConfigSubentryFlow):
    """Einen Shelly einem Bereich zuordnen: was hängt dran, welcher Heizkörper-Typ."""

    def _bereiche(self) -> list[selector.SelectOptionDict]:
        return [
            selector.SelectOptionDict(value=s.subentry_id, label=s.title)
            for s in self._get_entry().subentries.values()
            if s.subentry_type == SUB_BEREICH
        ]

    def _schema(self) -> vol.Schema:
        return vol.Schema(
            {
                vol.Required(CONF_BEREICH): selector.SelectSelector(
                    selector.SelectSelectorConfig(options=self._bereiche(), mode=selector.SelectSelectorMode.DROPDOWN)
                ),
                vol.Required(CONF_SCHALTER): _entitaet("switch"),
                vol.Required(CONF_NAME): selector.TextSelector(),
                vol.Required(CONF_ROLLE, default=ROLLE_HEIZKOERPER): _auswahl(ROLLEN, CONF_ROLLE),
                vol.Required(CONF_TYP, default=TYP_KONVEKTOR): _auswahl(TYPEN, CONF_TYP),
                vol.Optional(CONF_LEISTUNG): _entitaet("sensor", "power"),
                vol.Optional(CONF_ENERGIE): _entitaet("sensor", "energy"),
            }
        )

    def _pruefen(self, user_input: dict[str, Any], eigene_id: str | None) -> str | None:
        """Regeln aus logik/geraete.pruefen (dieselben wie auf der Seite, BSM-034.02)."""
        return geraet_pruefen(self.hass, self._get_entry(), user_input[CONF_SCHALTER], user_input[CONF_ROLLE],
                              user_input[CONF_BEREICH], eigene_id, user_input[CONF_NAME])

    async def async_step_user(self, user_input: dict[str, Any] | None = None) -> SubentryFlowResult:
        if not self._bereiche():
            return self.async_abort(reason="kein_bereich")
        errors: dict[str, str] = {}
        if user_input is not None:
            if fehler := self._pruefen(user_input, None):
                errors["base"] = fehler
            else:
                return self.async_create_entry(title=user_input[CONF_NAME].strip(), data=user_input)
        return self.async_show_form(
            step_id="user", data_schema=self.add_suggested_values_to_schema(self._schema(), user_input or {}), errors=errors
        )

    async def async_step_reconfigure(self, user_input: dict[str, Any] | None = None) -> SubentryFlowResult:
        sub = self._get_reconfigure_subentry()
        errors: dict[str, str] = {}
        if user_input is not None:
            if fehler := self._pruefen(user_input, sub.subentry_id):
                errors["base"] = fehler
            else:
                return self.async_update_and_abort(
                    self._get_entry(), sub, title=user_input[CONF_NAME].strip(), data=user_input
                )
        return self.async_show_form(
            step_id="reconfigure",
            data_schema=self.add_suggested_values_to_schema(self._schema(), user_input or dict(sub.data)),
            errors=errors,
        )
