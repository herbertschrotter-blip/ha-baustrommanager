"""Kern einer Baustelle: Einrichtung, Ereignisse, Wetter, Kalender, Staffelung, Schalten, Protokoll, Status (Bauplan
0.7 §3, Bauplan Module §3).

Jede Minute und bei jeder Zustandsänderung der beteiligten Entitäten:

1. `soll` der aktiven Funktionen (was jeder Bereich jetzt tun soll),
2. `staffel.staffeln` über alle Anschlüsse (`frei_stabil` = kleinster freier Wert der letzten 60 s),
3. schalten – nur Geräte, die eine Funktion `schaltbar` nennt; alle anderen zählen nur mit,
4. Warnungen (`logik/warnungen.py`), Handy-Nachrichten, Protokoll, Anzeige, Status, Zähler.

Was eine Funktion tut, steht in `funktionen/` (angelegt aus `funktionen.FUNKTIONEN`); der Kern ruft nur deren
Schnittstelle (`funktionen/basis.py`) und kennt keine Einzelheiten einer Funktion.

Geschaltet wird nur, wenn die Baustelle aktiv und die Automatik eingeschaltet ist (oder eine Funktion
`schaltet_ohne_automatik`). Wer ein Gerät von Hand schaltet, übergibt es seiner Funktion (`hand_setzen`, wie 0.6).

Aufgeteilt nach Zuständigkeit (BSM-023): Die Klasse hier hält den Zustand, die Abläufe (Start, Takt, Ereignisse,
Auswertung, Anzeige, Status) und leitet weiter an `kern/` – `einrichtung`, `wetter`, `kalender`, `staffelung`,
`schalten`, `warnungen`, `zaehler`; Grundtypen und Konstanten in `kern/typen.py`.
"""

from __future__ import annotations

from collections import deque
from collections.abc import Callable
from datetime import date, datetime, timedelta
from functools import partial
import logging
from typing import Any

from homeassistant.config_entries import ConfigEntry
from homeassistant.const import STATE_ON, STATE_UNAVAILABLE, STATE_UNKNOWN
from homeassistant.core import CALLBACK_TYPE, Event, EventStateChangedData, HomeAssistant, State, callback
from homeassistant.helpers import issue_registry as ir
from homeassistant.helpers.event import (
    async_track_state_change_event,
    async_track_time_change,
    async_track_time_interval,
)
from homeassistant.util import dt as dt_util

from .const import (
    CONF_EMPFAENGER,
    CONF_FEIERTAG_KALENDER,
    CONF_REGEN_SENSOR,
    CONF_STATUS,
    CONF_TEMP_SENSOR,
    CONF_URLAUB_KALENDER,
    CONF_WETTER,
    DOMAIN,
    EVENT_PROTOKOLL,
    STATUS_AKTIV,
    TERMINE_INTERVALL_MIN,
    WETTER_INTERVALL_MIN,
)
from .einstellungen import Einstellungen
from .funktionen import FUNKTIONEN
from .funktionen.basis import ZAEHLER_SPEICHERN_S, Funktion, SollJeBereich, zahl as _zahl, zeit as _zeit
from .logik import staffel as staffel_logik, warnungen as warn_logik
from .logik.arbeitszeit import Arbeitszeit, Ausnahme, WetterTag
from .logik import geraete as geraete_logik
from .logik.geraete import hinweise_reste
from .logik import preise as preise_logik
from .db import protokoll_merken
from .kern import (
    einrichtung as k_einrichtung,
    geraete as k_geraete,
    kalender as k_kalender,
    schalten as k_schalten,
    staffelung as k_staffelung,
    warnungen as k_warnungen,
    wetter as k_wetter,
    zaehler as k_zaehler,
)
from .kern.einrichtung import _sensor_am_geraet as _sensor_am_geraet
from .kern.typen import BereichInfo as BereichInfo, GeraetInfo as GeraetInfo, Laufzeit as Laufzeit
from .kern.typen import FEHLT_NACH, WetterWerte as WetterWerte, morgen_frueh as morgen_frueh
from .kern.wetter import _prognose_auswerten as _prognose_auswerten

_LOGGER = logging.getLogger(__name__)


class Steuerung:
    """Alles, was eine Baustelle im Betrieb tut."""

    def __init__(self, hass: HomeAssistant, entry: ConfigEntry) -> None:
        self.hass = hass
        self.entry = entry
        self.einstellungen = Einstellungen(hass, entry.entry_id)
        self.bereiche: dict[str, BereichInfo] = {}
        self.geraete: dict[str, GeraetInfo] = {}
        self.daten = Laufzeit()
        self.geraet_ids: dict[str, str] = {}  # Baustelle/Bereich → Geräte-ID in der Geräteverwaltung
        self._prognose_laeuft = False
        self._prognose_da = False
        self._listener: list[CALLBACK_TYPE] = []
        self._abmelden: list[CALLBACK_TYPE] = []
        self._bericht_abmelden: CALLBACK_TYPE | None = None
        self._eigene_kontexte: deque[str] = deque(maxlen=100)
        self._letzter_befehl: dict[str, tuple[bool, datetime]] = {}
        self._offline_seit: dict[str, datetime] = {}
        self._lief: dict[str, bool] = {}
        self.notprogramm_fehler: dict[str, tuple[datetime | None, str]] = {}   # BSM-019: setzt notprogramm.py (Warnung)
        self.ruhe: set[str] = set()   # BSM-021: Geräte, die die Automatik gerade nicht schaltet (Ausfall-Probe)
        self._aus_befehle: dict[str, list[datetime]] = {}   # FE-0010: Ausschaltbefehle je Gerät (letzte 10 min)   # zuletzt bekannter Zustand je Gerät (offline: zählt weiter, wenn es lief)
        self._wartet_seit: dict[str, datetime] = {}
        self._frei_verlauf: deque[tuple[datetime, dict[str, float]]] = deque()
        self._letzter_anlauf: datetime | None = None
        self._anlauf_geplant: CALLBACK_TYPE | None = None
        self._ueberlast_seit: dict[str, datetime] = {}   # Anschluss zu voll seit … (Abwurf erst nach UEBERLAST_S)
        self._ueberlast_geplant: CALLBACK_TYPE | None = None
        self._letzte_soll: dict[str, tuple[bool | None, str]] = {}
        self._letztes_warten: dict[str, str] = {}
        self._warn_alt: dict[str, warn_logik.Warnung] = {}
        self._letzte_auswertung: datetime | None = None
        self.geschaltet: dict[str, datetime] = {}   # Audit 0.8.165: Funktion → letzte Auswertung, die bis zum Schalten durchlief
        self.stoerungen: dict[str, str] = {}        # Stelle → Fehlertext (`fehler_melden`, Diagnose)
        self.ohne_soll: set[str] = set()            # Bereiche, für die eine Funktion in diesem Lauf kein Soll hat (Fehler)
        self._gestartet = dt_util.now()
        self.kalender_tage: dict[str, set[date]] = {"feiertag": set(), "urlaub": set()}
        self.kalender_namen: dict[date, str] = {}
        self.nachrichten: Any = None  # Nachrichten (nachrichten.py), nach dem Start gesetzt
        self._in_auswertung = False
        self._nochmal = False
        self._gestoppt = False
        self.neu_laden_folgt = False   # BSM-031.06b: Umbenennen lädt am Ende einmal neu, nicht je geändertem Unter-Eintrag
        self._beobachtet: set[str] = set()
        # Funktionen der Baustelle (funktionen/): Bereiche je Art, Geräte je Rolle gehören genau einer Funktion
        self.funktionen: list[Funktion] = [f(self) for f in FUNKTIONEN]
        self._je_name = {f.name: f for f in self.funktionen}
        self._je_art = {art: f for f in self.funktionen for art in f.arten}
        self._je_rolle = {rolle: f for f in self.funktionen for rolle in f.rollen}

    # ------------------------------------------------------------------ Einrichtung
    @property
    def aktiv(self) -> bool:
        return bool(self.entry.options.get(CONF_STATUS, STATUS_AKTIV) == STATUS_AKTIV)

    @property
    def e(self) -> dict[str, Any]:
        """Die gespeicherten Einstellungen (Store v2)."""
        return self.einstellungen.daten

    @property
    def eigene_kontexte(self) -> deque[str]:
        """Kontexte der eigenen Schaltbefehle (Quelle „automatik“ beim Mitschreiben, BSM-007)."""
        return self._eigene_kontexte

    @property
    def lz(self) -> dict[str, Any]:
        """Laufzeitdaten im Store (der Funktionen, Warnungen, Wetter je Tag)."""
        laufzeit: dict[str, Any] = self.einstellungen.daten["laufzeit"]
        return laufzeit

    @property
    def automatik_moeglich(self) -> bool:
        """Eine aktive Funktion schaltet Geräte – nur dann gibt es die Automatik."""
        return any(f.schaltet and f.aktiv() for f in self.funktionen)

    @property
    def automatik(self) -> bool:
        return self.aktiv and self.automatik_moeglich and bool(self.e["automatik"])

    def _einrichtung_lesen(self) -> None:
        k_einrichtung._einrichtung_lesen(self)

    def geraete_in(self, bereich_id: str) -> list[GeraetInfo]:
        return [g for g in self.geraete.values() if g.bereich == bereich_id]

    def funktion(self, name: str) -> Funktion:
        return self._je_name[name]

    def funktion_von(self, g: GeraetInfo) -> Funktion:
        """Die Funktion des Bereichs, in dem das Gerät steckt (Bereichsart → Funktion, `Funktion.arten`)."""
        return self._je_art[self.bereiche[g.bereich].art]

    async def async_start(self) -> None:
        """Einstellungen laden, auf Änderungen hören, erste Auswertung."""
        from .nachrichten import Nachrichten  # noqa: PLC0415  (gegenseitiger Import)

        self._einrichtung_lesen()
        await self.einstellungen.async_laden(list(self.bereiche), self.entry.options.get(CONF_EMPFAENGER), list(self.geraete))
        self._hinweise_aufraeumen()
        if self.einstellungen.von_v1:
            self.protokoll("einstellung", None, "Umstellung auf 0.7.0: Einstellungen neu, Zähler übernommen")
        self._warnungen_laden()
        self.nachrichten = Nachrichten(self)
        # aktuellen Zählerstand übernehmen; was seit dem letzten gespeicherten Stand dazukam, zählt mit
        for g in self.geraete.values():
            if g.energie:
                self._energie_zaehlen(g, _zahl(self.hass.states.get(g.energie)))

        self._beobachten()
        o = self.entry.options
        self._abmelden.append(async_track_time_change(self.hass, self._takt, second=0))
        if o.get(CONF_WETTER):
            self._abmelden.append(
                async_track_time_interval(self.hass, self._async_prognose, timedelta(minutes=WETTER_INTERVALL_MIN))
            )
            self.entry.async_create_background_task(self.hass, self._async_prognose(), "baustelle_prognose")
        self._abmelden.append(
            async_track_time_interval(self.hass, self._async_kalender, timedelta(minutes=TERMINE_INTERVALL_MIN))
        )
        self.entry.async_create_background_task(self.hass, self._async_kalender(), "baustelle_kalender")
        self._abmelden.append(self.nachrichten.async_start())
        self.bericht_planen()
        self.auswerten()

    @callback
    def async_stop(self) -> None:
        self._gestoppt = True
        while self._abmelden:
            self._abmelden.pop()()
        if self._anlauf_geplant is not None:
            self._anlauf_geplant()
            self._anlauf_geplant = None
        if self._ueberlast_geplant is not None:
            self._ueberlast_geplant()
            self._ueberlast_geplant = None
        if self._bericht_abmelden:
            self._bericht_abmelden()
            self._bericht_abmelden = None

    @callback
    def async_add_listener(self, update: CALLBACK_TYPE) -> Callable[[], None]:
        """Entitäten melden sich an, um nach jeder Auswertung neu zu schreiben."""
        self._listener.append(update)

        def entfernen() -> None:
            self._listener.remove(update)

        return entfernen

    def _beobachten(self) -> None:
        """Auf Änderungen aller beteiligten Entitäten hören; neue (z. B. aus einer Einstellung) kommen dazu."""
        beobachtet = self._erwartete_entitaeten()
        for f in self.funktionen:
            beobachtet |= f.entitaeten()
        if neu := beobachtet - self._beobachtet:
            self._beobachtet |= neu
            self._abmelden.append(async_track_state_change_event(self.hass, list(neu), self._zustand_geaendert))

    # ------------------------------------------------------------------ Protokoll
    @callback
    def protokoll(self, art: str, bereich: str | None, text: str, zeit: datetime | None = None) -> None:
        """Eintrag ins dauerhafte Protokoll (neueste zuerst, max. 1000), in die eigene Datenbank und ins HA-Logbuch."""
        zeit = zeit or dt_util.now()
        self.einstellungen.protokoll([zeit.isoformat(timespec="seconds"), art, bereich, text])
        protokoll_merken(self.hass, self.entry.entry_id, zeit, art, bereich, text)   # BSM-007
        self.hass.bus.async_fire(
            EVENT_PROTOKOLL,
            {
                "entry_id": self.entry.entry_id,
                "baustelle": self.entry.title,
                "art": art,
                "bereich": bereich,
                "bereich_name": self.bereiche[bereich].name if bereich in self.bereiche else None,
                "text": text,
            },
        )

    # ------------------------------------------------------------------ Einstellungen ändern
    @callback
    def einstellung_setzen(self, pfad: tuple[str, ...] | list[str], wert: Any, *, protokoll: bool = True) -> None:
        """Eine Einstellung ändern, speichern und sofort neu auswerten."""
        pfad = tuple(pfad)
        ziel = self.e
        for teil in pfad[:-1]:
            ziel = ziel[teil]
        alt = ziel.get(pfad[-1])
        ziel[pfad[-1]] = wert
        self.einstellungen.speichern()
        if protokoll and alt != wert:
            text = next((t for f in self.funktionen if (t := f.einstellung_text(pfad, wert)) is not None), None)
            self.protokoll("einstellung", pfad[1] if pfad[0] == "bereiche" else None, text or _einstellung_text(pfad, wert))
        if pfad[0] == "bericht":
            self.bericht_planen()
        if any(f.kalender_neu(pfad) for f in self.funktionen):
            self.entry.async_create_background_task(self.hass, self._async_kalender(), "baustelle_kalender")
        if not self._gestoppt:
            # neue Entität in einer Einstellung: sofort auf ihre Änderungen reagieren (sonst erst im Minutentakt)
            self._beobachten()
        self.auswerten()

    # ------------------------------------------------------------------ Ereignisse
    @callback
    def _takt(self, _now: datetime) -> None:
        self.auswerten()
        jetzt = dt_util.now()
        self._fehlende_pruefen(jetzt)
        self.nachrichten.fruehstart_pruefen(jetzt)

    def _erwartete_entitaeten(self) -> set[str]:
        o = self.entry.options
        erwartet = {o[k] for k in (CONF_WETTER, CONF_TEMP_SENSOR, CONF_REGEN_SENSOR, CONF_FEIERTAG_KALENDER, CONF_URLAUB_KALENDER) if o.get(k)}
        for g in self.geraete.values():
            erwartet.update(x for x in (g.schalter, g.leistung, g.energie) if x)
        erwartet.update(s.entity_id for b in self.bereiche.values() for s in self.sensoren(b.id))   # BSM-034.03: alle Sensoren
        return erwartet

    def _hinweise_aufraeumen(self) -> None:
        """Reparatur-Hinweise gelöschter Geräte und nicht mehr erwarteter Entitäten entfernen (BSM-034.01)."""
        eigene = [i for (d, i) in ir.async_get(self.hass).issues if d == DOMAIN]
        for issue_id in hinweise_reste(eigene, self.entry.entry_id, self.geraete, self._erwartete_entitaeten()):
            ir.async_delete_issue(self.hass, DOMAIN, issue_id)

    def _fehlende_pruefen(self, jetzt: datetime) -> None:
        """Reparatur-Hinweis, wenn eine eingestellte Entität fehlt (z. B. Shelly umbenannt oder entfernt)."""
        if jetzt - self._gestartet < FEHLT_NACH:
            return
        for entity_id in self._erwartete_entitaeten():
            issue_id = f"fehlt_{self.entry.entry_id}_{entity_id}"
            if self.aktiv and self.hass.states.get(entity_id) is None:
                ir.async_create_issue(
                    self.hass, DOMAIN, issue_id, is_fixable=False, severity=ir.IssueSeverity.WARNING,
                    translation_key="entitaet_fehlt",
                    translation_placeholders={"entitaet": entity_id, "baustelle": self.entry.title},
                )
            else:
                ir.async_delete_issue(self.hass, DOMAIN, issue_id)
        # Gerät ohne Leistungssensor: zählt weder Leistung noch Verbrauch (FE-0003)
        for g in self.geraete.values():
            issue_id = f"ohne_leistung_{self.entry.entry_id}_{g.id}"
            if self.aktiv and not g.leistung and not g.energie:
                ir.async_create_issue(
                    self.hass, DOMAIN, issue_id, is_fixable=False, severity=ir.IssueSeverity.WARNING,
                    translation_key="ohne_leistung",
                    translation_placeholders={"geraet": g.name, "schalter": g.schalter, "baustelle": self.entry.title},
                )
            else:
                ir.async_delete_issue(self.hass, DOMAIN, issue_id)

    @callback
    def _zustand_geaendert(self, event: Event[EventStateChangedData]) -> None:
        neu, alt = event.data["new_state"], event.data["old_state"]
        entity_id = event.data["entity_id"]
        for g in self.geraete.values():
            if g.energie == entity_id:
                self._energie_zaehlen(g, _zahl(neu))
        if (
            entity_id == self.entry.options.get(CONF_WETTER)
            and neu is not None and neu.state not in (STATE_UNAVAILABLE, STATE_UNKNOWN)
            and not self._prognose_da and not self._prognose_laeuft
        ):
            # Wetter erst nach uns geladen (HA-Start): Vorhersage sofort holen statt nach 30 min
            self.entry.async_create_background_task(self.hass, self._async_prognose(), "baustelle_prognose")
        if neu is not None and alt is not None and neu.state != alt.state:
            self._handbedienung_erkennen(entity_id, neu)
        self.auswerten()

    def _handbedienung_erkennen(self, entity_id: str, neu: State) -> None:
        """Wer einen Shelly in HA von Hand schaltet, übergibt ihn seiner Funktion (Handbetrieb, wie 0.6)."""
        if not self.automatik or neu.state not in ("on", "off"):
            return
        kontext = neu.context
        if kontext.user_id is None or kontext.id in self._eigene_kontexte or kontext.parent_id in self._eigene_kontexte:
            return
        for g in self.geraete.values():
            if g.schalter == entity_id:
                self.funktion_von(g).hand_setzen(g, neu.state == STATE_ON)

    # ------------------------------------------------------------------ Wetter
    async def _async_prognose(self, _now: datetime | None = None) -> None:
        await k_wetter._async_prognose(self, _now)

    async def _async_prognose_holen(self, wetter: str) -> None:
        await k_wetter._async_prognose_holen(self, wetter)

    def _wetter_tage_merken(self, tage: dict[date, dict[str, float | None]], jetzt: datetime) -> None:
        k_wetter._wetter_tage_merken(self, tage, jetzt)

    def _wetter_tag(self, tag: date) -> dict[str, Any]:
        return k_wetter._wetter_tag(self, tag)

    def _wetter(self, jetzt: datetime) -> WetterWerte:
        return k_wetter._wetter(self, jetzt)

    def wetter_tag_plan(self, tag: date) -> WetterTag:
        return k_wetter.wetter_tag_plan(self, tag)

    # ------------------------------------------------------------------ Kalender
    async def _async_kalender(self, _now: datetime | None = None) -> None:
        await k_kalender._async_kalender(self, _now)

    async def async_events(self, entity_id: str | None, start: datetime, ende: datetime) -> list[dict[str, Any]]:
        return await k_kalender.async_events(self, entity_id, start, ende)

    async def async_event_details(
        self, entity_id: str | None, start: datetime, ende: datetime
    ) -> dict[tuple[str, str], tuple[str, str | None]]:
        return await k_kalender.async_event_details(self, entity_id, start, ende)

    def frei_art(self, tag: date) -> str | None:
        return k_kalender.frei_art(self, tag)

    def _kalender_an(self, entity_id: str | None) -> bool:
        return k_kalender._kalender_an(self, entity_id)

    # ------------------------------------------------------------------ Arbeitszeit
    def arbeitszeiten(self) -> list[Arbeitszeit]:
        return k_kalender.arbeitszeiten(self)

    def ausnahmen(self) -> list[Ausnahme]:
        return k_kalender.ausnahmen(self)

    # ------------------------------------------------------------------ Auswertung
    def temperatur(self, fuehler: str | None) -> float | None:
        if not fuehler or (s := self.hass.states.get(fuehler)) is None:
            return None
        if fuehler.startswith("climate."):
            wert = s.attributes.get("current_temperature")
            return float(wert) if isinstance(wert, (int, float)) else None
        return _zahl(s)

    def _laufzeit_aufraeumen(self, jetzt: datetime) -> None:
        geaendert = False
        for f in self.funktionen:
            geaendert = f.aufraeumen(jetzt) or geaendert
        for key, bis in list(self.e["stumm"].items()):
            if (ende := _zeit(bis)) is None or ende <= jetzt:
                del self.e["stumm"][key]
                self.lz.setdefault("stumm_vorbei", []).append(key)   # danach erinnern, falls das Problem noch besteht
                geaendert = True
        if geaendert:
            self.einstellungen.speichern()

    def nenn_kw(self, g: GeraetInfo) -> float:
        return k_staffelung.nenn_kw(self, g)

    def _staffeln(self, jetzt: datetime, soll: SollJeBereich) -> tuple[set[str], dict[str, bool | None]]:
        return k_staffelung._staffeln(self, jetzt, soll)

    def _anlauf_begrenzen(self, jetzt: datetime, lasten: list[staffel_logik.Last], an_set: set[str]) -> None:
        k_staffelung._anlauf_begrenzen(self, jetzt, lasten, an_set)

    def _abwerfen(self, jetzt: datetime, frei: dict[str, float]) -> dict[str, bool]:
        return k_staffelung._abwerfen(self, jetzt, frei)

    def _staffel_anzeige(
        self, anschluesse: list[staffel_logik.Anschluss], lasten: list[staffel_logik.Last], frei: dict[str, float]
    ) -> None:
        k_staffelung._staffel_anzeige(self, anschluesse, lasten, frei)

    @callback
    def auswerten(self) -> None:
        """Einmal alles durchrechnen, wenn nötig schalten und melden, Entitäten aktualisieren.

        Nie verschachtelt: kommt während einer Auswertung eine Zustandsänderung (z. B. ein Schalter meldet sofort),
        wird danach noch einmal ausgewertet.
        """
        if self._gestoppt:
            return
        if self._in_auswertung:
            self._nochmal = True
            return
        self._in_auswertung = True
        try:
            self._auswerten()
        finally:
            self._in_auswertung = False
        if self._nochmal:
            self._nochmal = False
            self.hass.loop.call_soon(self.auswerten)

    def _auswerten(self) -> None:
        """Ein Lauf. Jede Funktion und jeder Schritt nach dem Schalten ist einzeln abgesichert (Audit 0.8.165): ein
        Fehler hält nicht mehr alles an. `geschaltet[<Funktion>]` steht nur, wenn ihr Soll (für jeden Bereich, `ohne_soll`),
        Staffelung und Schalten durchliefen – sonst bekommen ihre Plugs kein Lebenszeichen mehr und das Notprogramm
        übernimmt (notprogramm.py, logik/notprogramm.haengt). Je Funktion: der Fehler einer Funktion hält die anderen nicht an."""
        jetzt = dt_util.now()
        self._sicher("aufraeumen", lambda: self._laufzeit_aufraeumen(jetzt))
        self._sicher("preis", self.preis_abgleichen)   # neuer Strompreis ab heute (Preisliste mit „gilt ab“)
        self._sicher("wetter", lambda: setattr(self.daten, "wetter", self._wetter(jetzt)))   # sonst gilt das letzte
        wetter = self.daten.wetter
        soll: SollJeBereich = {}
        heil: set[str] = set()

        def soll_von(f: Funktion) -> None:
            soll.update(f.soll(jetzt, wetter))

        for f in self.funktionen:
            self.ohne_soll = set()
            if (not f.aktiv() or self._sicher(f"soll:{f.name}", partial(soll_von, f))) and not self.ohne_soll:
                heil.add(f.name)
        try:
            an_set, ziel = self._staffeln(jetzt, soll)
            if self.automatik:
                for f in self.funktionen:
                    self._sicher(f"nach_soll:{f.name}", partial(f.nach_soll, soll))
                self._schalten_alle(jetzt, soll, an_set, ziel)
                for f in self.funktionen:
                    self._sicher(f"nach_schalten:{f.name}", partial(f.nach_schalten, jetzt, wetter))
            elif any(f.aktiv() and f.schaltet_ohne_automatik() for f in self.funktionen):
                # Automatik aus, aber eine Funktion schaltet trotzdem: ziel enthält nur, was ihr `soll` dann noch schalten will
                self._schalten_alle(jetzt, soll, an_set, ziel)
            self.fehler_vorbei("schalten")
        except Exception as err:  # noqa: BLE001
            self.fehler_melden("schalten", err)
            heil = set()
        for name in heil:
            self.geschaltet[name] = jetzt
        self._sicher("warnungen", lambda: self._warnungen(jetzt, soll))
        self._sicher("anzeige", lambda: self._anzeige(jetzt, soll))
        self._sicher("status", lambda: self._status(jetzt))
        self._sicher("zaehlen", lambda: self._zeiten_zaehlen(jetzt))
        fehler: Exception | None = None
        for update in list(self._listener):
            try:
                update()
            except Exception as err:  # noqa: BLE001
                fehler = fehler or err
        if fehler is not None:
            self.fehler_melden("entitaeten", fehler)
        else:
            self.fehler_vorbei("entitaeten")

    def _sicher(self, stelle: str, schritt: Callable[[], Any]) -> bool:
        """Einen Schritt der Auswertung ausführen; ein Fehler wird gemeldet (`fehler_melden`), die Auswertung läuft weiter."""
        try:
            schritt()
        except Exception as err:  # noqa: BLE001
            self.fehler_melden(stelle, err)
            return False
        self.fehler_vorbei(stelle)
        return True

    def fehler_melden(self, stelle: str, err: Exception) -> None:
        """Fehler einer Stelle ins HA-Protokoll – mit Verlauf nur beim ersten Mal (jede Minute dasselbe füllt sonst das
        Protokoll), danach erst wieder, wenn sich der Text ändert."""
        text = f"{type(err).__name__}: {err}"
        if self.stoerungen.get(stelle) != text:
            _LOGGER.error("Baustelle %s – Fehler bei %s: %s", self.entry.title, stelle, text, exc_info=err)
            self.stoerungen[stelle] = text

    def fehler_vorbei(self, stelle: str) -> None:
        if self.stoerungen.pop(stelle, None) is not None:
            _LOGGER.info("Baustelle %s – %s läuft wieder", self.entry.title, stelle)

    def _schalten_alle(
        self, jetzt: datetime, soll: SollJeBereich, an_set: set[str], ziel: dict[str, bool | None]
    ) -> None:
        k_schalten._schalten_alle(self, jetzt, soll, an_set, ziel)

    def _schalten(self, g: GeraetInfo, zustand: State | None, ein: bool, jetzt: datetime) -> bool:
        return k_schalten._schalten(self, g, zustand, ein, jetzt)

    def geraet_aktiv(self, g: GeraetInfo) -> bool:
        """Nur Geräte mit Status „aktiv“ schaltet die Automatik, sie zählen in der Staffelung und melden (WU-0004,
        BSM-034.02: inaktiv, verliehen, defekt lässt sie aus)."""
        return geraete_logik.schaltet(k_geraete.status(self, g))

    def sensoren(self, bid: str) -> list[Any]:
        """Sensoren eines Bereichs (BSM-034.03, logik/sensoren)."""
        return k_geraete.sensoren(self, bid)

    def kontakt_offen_seit(self, bid: str) -> datetime | None:
        return k_geraete.kontakt_offen_seit(self, bid)

    def batterie(self, entity_id: str) -> float | None:
        return k_geraete.batterie(self, entity_id)

    def geraet_status(self, g: GeraetInfo) -> str:
        return k_geraete.status(self, g)

    def geraet_status_setzen(self, g: GeraetInfo, status: str, *, ins_inventar: bool = True) -> bool:
        return k_geraete.status_setzen(self, g, status, ins_inventar=ins_inventar)

    def geraet_aktiv_setzen(self, g: GeraetInfo, aktiv: bool) -> None:
        k_schalten.geraet_aktiv_setzen(self, g, aktiv)

    def geraet_schalten(self, g: GeraetInfo, an: bool) -> None:
        k_schalten.geraet_schalten(self, g, an)

    def _anzeige(self, jetzt: datetime, soll: SollJeBereich) -> None:
        """Zustand und Text je Bereich wie die Kacheln im Mockup (`TEXT(b)`) – von der Funktion des Bereichs."""
        d = self.daten
        for bid, info in self.bereiche.items():
            geraete = self.geraete_in(bid)
            leistungen = [_zahl(self.hass.states.get(g.leistung)) for g in geraete if g.leistung]
            d.leistung[bid] = sum(x for x in leistungen if x is not None) if leistungen else None
            d.temperatur[bid] = self.temperatur(info.fuehler)
            zustaende = [self.hass.states.get(g.schalter) for g in geraete]
            erreichbar = [z is not None and z.state not in (STATE_UNAVAILABLE, STATE_UNKNOWN) for z in zustaende]
            an = any(z is not None and z.state == STATE_ON for z in zustaende)
            offline = bool(geraete) and not any(erreichbar)
            d.zustand[bid], d.text[bid], d.grund[bid] = self._je_art[info.art].anzeige(bid, info, jetzt, soll, offline, an)

    def _status(self, jetzt: datetime) -> None:
        """Status der Baustelle und Text neben dem Automatik-Chip (Mockup `statusText`)."""
        d = self.daten
        d.naechste = None
        if not self.aktiv:
            d.status, d.status_text = "abgeschlossen", "abgeschlossen"
            return
        for f in self.funktionen:
            if f.aktiv() and (status := f.status(jetzt)) is not None:
                d.status, d.status_text, d.naechste = status
                return

    # ------------------------------------------------------------------ Warnungen
    def warn_einstellungen(self) -> warn_logik.WarnEinstellungen:
        einst: dict[str, Any] = {}
        for f in self.funktionen:
            einst.update(f.warn_einstellungen())
        return warn_logik.WarnEinstellungen.aus_store(self.e["meldungen_einst"], einst)

    def _warnungen_laden(self) -> None:
        k_warnungen._warnungen_laden(self)

    def _geraete_zustand(self, jetzt: datetime) -> list[warn_logik.GeraetZustand]:
        return k_warnungen._geraete_zustand(self, jetzt)

    def warnung_vergessen(self, bereich: str, art: str) -> None:
        """Eine Warnung still beenden (ohne „wieder ok“ im Protokoll), z. B. nach dem Knopf „Trotzdem heizen“."""
        self._warn_alt = {k: w for k, w in self._warn_alt.items() if not (w.bereich == bereich and w.art == art)}

    def _warnungen(self, jetzt: datetime, soll: SollJeBereich) -> None:
        k_warnungen._warnungen(self, jetzt, soll)

    # ------------------------------------------------------------------ Bericht
    def bericht_planen(self) -> None:
        k_warnungen.bericht_planen(self)

    # ------------------------------------------------------------------ Zählen (Energie; Zeiten zählen die Funktionen)
    @property
    def zaehler(self) -> dict[str, Any]:
        """Dauerhafte Zähler der Baustelle (im Store, in der Sicherung)."""
        zaehler: dict[str, Any] = self.einstellungen.daten["zaehler"]
        return zaehler

    def zaehler_plus(self, key: str, wert: float) -> None:
        k_zaehler.zaehler_plus(self, key, wert)

    # ------------------------------------------------------------------ Strompreis mit „gilt ab“ (logik/preise)
    def preise(self) -> list[tuple[date, float]]:
        return preise_logik.liste(self.e.get("preise"), float(self.e["preis"]))

    def preis_am(self, tag: date) -> float:
        return preise_logik.preis_am(self.preise(), tag)

    def preis_abgleichen(self) -> None:
        k_zaehler.preis_abgleichen(self)

    def zaehler_minus(self, key: str, wert: float) -> None:
        k_zaehler.zaehler_minus(self, key, wert)

    def kosten_ausbuchen(self, g: GeraetInfo, eur: float) -> None:
        k_zaehler.kosten_ausbuchen(self, g, eur)

    def energie_ausbuchen(self, g: GeraetInfo, kwh: float) -> None:
        k_zaehler.energie_ausbuchen(self, g, kwh)

    def _energie_buchen(self, g: GeraetInfo, kwh: float) -> None:
        k_zaehler._energie_buchen(self, g, kwh)

    def _energie_zaehlen(self, g: GeraetInfo, stand: float | None) -> None:
        k_zaehler._energie_zaehlen(self, g, stand)

    def _zeiten_zaehlen(self, jetzt: datetime) -> None:
        k_zaehler._zeiten_zaehlen(self, jetzt)


def _einstellung_text(pfad: tuple[str, ...], wert: Any) -> str:
    """Protokolltext einer geänderten Einstellung (Einstellungen einer Funktion: `Funktion.einstellung_text`)."""
    if pfad == ("automatik",):
        return "Automatik eingeschaltet" if wert else "Automatik ausgeschaltet"
    if isinstance(wert, bool):
        wert_text = "ein" if wert else "aus"
    elif wert is None:
        wert_text = "–"
    else:
        wert_text = str(wert).replace(".", ",") if isinstance(wert, float) else str(wert)
    name = ".".join(pfad[2:]) if pfad[0] == "bereiche" else ".".join(pfad)
    return f"Einstellung {name}: {wert_text}"


