"""Mitschreiben einer Baustelle in die eigene Datenbank (docs/bauplan-datenbank.md Phase 2, BSM-007).

Je Minute eine Zeile je Gerät (`geraet_minute`), Container (`bereich_minute`) und Baustelle (`wetter_minute`), jede
Schaltung, Tür und Erreichbarkeit sekundengenau als Ereignis (ohne Person, §6), die Laufzeit (`zustand`, nur bei
Änderung) und das Gelernte je Container und Tag (`lernen`, stündlich). Die Minutenbildung rechnet `logik/minute`.

Prognose V2, P1 (BSM-033.06), nur beobachtet: nach jeder Auswertung der Stand der Staffelung je Gerät (Anforderung vor
der Staffelung, Veto) und der Betriebskontext je Container – ändert er sich, ein Ereignis `prognose_kontext` mit
Wirkzeitpunkt (die Minutenzeile kennt nur den Stand am Ende). Das Alter des Innenwerts kommt aus den Berichten der
Fühler (`last_reported`, auch bei unverändertem Wert über die gefilterte Berichtsbeobachtung nur dieser Fühler; nie
`last_changed`); der Wert beim Start und die Rückkehr aus „nicht verfügbar“ gelten nicht als Bericht.
Gelesen wird in dieser Phase weiter aus Store und HA-Statistik – der Pilot merkt nichts.
"""

from __future__ import annotations

from collections.abc import Callable
from datetime import datetime, timedelta
import json
import logging
from typing import TYPE_CHECKING, Any

from sqlalchemy import Connection, delete, insert, update

from homeassistant.const import STATE_ON, STATE_UNAVAILABLE, STATE_UNKNOWN
from homeassistant.core import Event, EventStateChangedData, EventStateReportedData, HomeAssistant, State, callback
from homeassistant.helpers.event import (
    async_track_state_change_event,
    async_track_state_report_event,
    async_track_time_change,
)
from homeassistant.util import dt as dt_util

from ..const import ART_CONTAINER
from ..logik.minute import BereichSammler, GeraetSammler
from ..logik.sensoren import kontakte
from . import schema as s
from .schreiber import arbeit, ohne_doppelte, schreibarbeit

if TYPE_CHECKING:
    from ..steuerung import Steuerung
    from .verbindung import Datenbank

_LOGGER = logging.getLogger(__name__)

LERNEN_JEDE_MINUTE = 0   # stündlich (Minute 0) das Gelernte je Container und Tag
TAGE_JEDE_MINUTEN = 15   # Tagessummen von heute alle 15 Minuten neu (BSM-009)


def _zahl(zustand: State | None) -> float | None:
    if zustand is None or zustand.state in (STATE_UNAVAILABLE, STATE_UNKNOWN, ""):
        return None
    try:
        return float(zustand.state)
    except ValueError:
        return None


def _an(zustand: State | None) -> bool | None:
    if zustand is None or zustand.state in (STATE_UNAVAILABLE, STATE_UNKNOWN):
        return None
    return zustand.state == STATE_ON


class Mitschreiber:
    """Sammelt die Zustände einer Baustelle und schreibt sie je Minute."""

    def __init__(self, hass: HomeAssistant, db: Datenbank, st: Steuerung) -> None:
        self.hass, self.db, self.st = hass, db, st
        self.bid = st.entry.entry_id
        self._geraete: dict[str, GeraetSammler] = {}
        self._bereiche: dict[str, BereichSammler] = {}
        self._wer: dict[str, list[tuple[str, str]]] = {}   # entity_id → [(art, id)]
        self._zustand_alt: dict[str, str] = {}
        self._kontakte: dict[str, list[str]] = {}
        self._lernen_alt: dict[str, str] = {}
        self._kontext_alt: dict[str, tuple[Any, ...]] = {}   # Betriebskontext je Container (Ereignis prognose_kontext)
        self._abmelden: list[Callable[[], None]] = []
        self.start_zeit = dt_util.utcnow()

    # ------------------------------------------------------------------ Start/Stopp
    def start(self) -> None:
        jetzt = self.start_zeit = dt_util.utcnow()
        get = self.hass.states.get
        zieht = float(self.st.e.get("heizung", {}).get("zieht_strom_w") or 50)
        for gid, g in self.st.geraete.items():
            self._geraete[gid] = GeraetSammler(
                jetzt, _an(get(g.schalter)), _zahl(get(g.leistung)) if g.leistung else None,
                _zahl(get(g.energie)) if g.energie else None, mit_zaehler=bool(g.energie), zieht_w=zieht)
            self._merken(g.schalter, "schalter", gid)
            if g.leistung:
                self._merken(g.leistung, "leistung", gid)
            if g.energie:
                self._merken(g.energie, "energie", gid)
        for bid, info in self.st.bereiche.items():
            # BSM-034.03: alle Türen und Fenster; „Tür offen“ je Minute = irgendein Kontakt offen
            tueren = kontakte(self.st.sensoren(bid)) if info.art == ART_CONTAINER else []
            self._kontakte[bid] = tueren
            self._bereiche[bid] = BereichSammler(
                jetzt, _zahl(get(info.fuehler)) if info.fuehler else None, self._offen(bid) if tueren else None,
                mit_tuer=bool(tueren), geraete=[gid for gid, g in self.st.geraete.items() if g.bereich == bid])
            if info.fuehler:
                self._merken(info.fuehler, "fuehler", bid)
            for eid in tueren:
                self._merken(eid, "tuer", bid)
        if self._wer:
            self._abmelden.append(async_track_state_change_event(self.hass, list(self._wer), self._geaendert))
        fuehler = [eid for eid, wer in self._wer.items() if any(art == "fuehler" for art, _ in wer)]
        if fuehler:   # nur die Innenfühler, keine Beobachtung aller Berichte in HA
            self._abmelden.append(async_track_state_report_event(self.hass, fuehler, self._berichtet))
        self._abmelden.append(self.st.async_add_listener(self._nach_auswertung))
        self._abmelden.append(async_track_time_change(self.hass, self._minute, second=0))

    def _offen(self, bid: str) -> bool | None:
        """Irgendein Kontakt des Containers offen; None, wenn keiner etwas meldet."""
        werte = [_an(self.hass.states.get(eid)) for eid in self._kontakte.get(bid, [])]
        return True if any(werte) else (False if any(w is False for w in werte) else None)

    def _merken(self, entity_id: str, art: str, wessen: str) -> None:
        self._wer.setdefault(entity_id, []).append((art, wessen))

    async def async_stop(self) -> None:
        """Beim Entladen: Rest der laufenden Minute schreiben."""
        for weg in self._abmelden:
            weg()
        self._abmelden.clear()
        self._abschliessen(dt_util.utcnow(), stunde=True)
        await self.db.schreiber.async_schreiben()

    # ------------------------------------------------------------------ Änderungen
    @callback
    def _geaendert(self, event: Event[EventStateChangedData]) -> None:
        neu, alt = event.data["new_state"], event.data["old_state"]
        t = neu.last_updated if neu is not None else dt_util.utcnow()
        for art, wessen in self._wer.get(event.data["entity_id"], []):
            if art == "schalter" and (g := self._geraete.get(wessen)):
                g.schalter(t, _an(neu))
                self._schaltung(wessen, alt, neu, t)
            elif art == "leistung" and (g := self._geraete.get(wessen)):
                g.leistung(t, _zahl(neu))
                self._messwert(wessen, t, _zahl(neu))
            elif art == "energie" and (g := self._geraete.get(wessen)):
                g.zaehler(t, _zahl(neu))
            elif art == "fuehler" and (b := self._bereiche.get(wessen)):
                wert = _zahl(neu)
                b.temperatur(t, wert)
                # echter Bericht nur mit Wert und nicht direkt nach „nicht verfügbar“/Start (zwischengespeicherter Wert)
                b.bericht(t, neu.last_reported if neu is not None and wert is not None and _zahl(alt) is not None else None)
            elif art == "tuer" and (b := self._bereiche.get(wessen)):
                b.tuer(t, self._offen(wessen))
                if _an(neu) != _an(alt):
                    self.ereignis(t, "tuer", {"offen": _an(neu), "sensor": event.data["entity_id"]}, "automatik", bereich_id=wessen)

    @callback
    def _berichtet(self, event: Event[EventStateReportedData]) -> None:
        """Fühler meldet denselben Wert noch einmal: neuer Bericht für das Alter (BSM-033.06)."""
        t = event.data["last_reported"]
        wert = _zahl(event.data["new_state"])
        for art, wessen in self._wer.get(event.data["entity_id"], []):
            if art == "fuehler" and (b := self._bereiche.get(wessen)):
                b.bericht(t, t if wert is not None else None)

    @callback
    def _nach_auswertung(self) -> None:
        """Nach jeder Auswertung: Staffelung je Gerät und Container, Betriebskontext je Container (BSM-033.06).

        Läuft als Listener mitten in der Auswertung – die Beobachtung darf die Steuerung nie stören (keine Ausnahme nach
        außen, sonst fielen spätere Listener und das erneute Auswerten aus)."""
        try:
            t = dt_util.utcnow()
            for gid, (will, gesperrt) in self.st.daten.staffel_beobachtung.items():
                if (g := self._geraete.get(gid)) is not None:
                    g.staffel(t, will, gesperrt)
                if (info := self.st.geraete.get(gid)) is not None and (b := self._bereiche.get(info.bereich)) is not None:
                    b.staffel(t, gid, gesperrt)
            self._kontext(t)
        except Exception:   # noqa: BLE001 – Beobachtung, nie die Steuerung aufhalten
            _LOGGER.exception("Prognose-Beobachtung nach der Auswertung fehlgeschlagen")

    def _kontext(self, t: datetime) -> None:
        if not any(i.art == ART_CONTAINER for i in self.st.bereiche.values()):
            return
        from ..funktionen.heizung import Heizung   # noqa: PLC0415 – vermeidet einen Kreis beim Import
        heizung = Heizung.von(self.st)
        if not heizung.aktiv():
            return
        d = self.st.daten
        for bid, info in self.st.bereiche.items():
            if info.art != ART_CONTAINER:
                continue
            art, konfiguration = heizung.prognose_kontext(bid)
            soll = self._soll(bid)
            # Vergleich auf 0,1 K: kleinste Schwankungen des gleitenden Solls sind kein Kontextwechsel
            stand = (d.grund.get(bid), d.zustand.get(bid), None if soll is None else round(soll, 1), art, konfiguration)
            if self._kontext_alt.get(bid) == stand:
                continue
            self._kontext_alt[bid] = stand
            wert = {"grund": stand[0], "zustand": stand[1], "soll_c": soll, "regelungsart": art,
                    "konfiguration_id": konfiguration, "zeit": t.isoformat()}
            self.ereignis(t, "prognose_kontext", wert, "automatik", bereich_id=bid)

    def _messwert(self, gid: str, t: datetime, watt: float | None) -> None:
        """Jeder gemeldete Wert der Leistung (Aufbau 5) – für „Leistung einer Stunde“ auch nach 62 Tagen."""
        zeile = {"geraet_id": gid, "zeit": t, "baustelle_id": self.bid, "leistung_w": watt, "quelle": "ha"}
        self.db.schreiber.dazu(arbeit("einfuegen", "messwert", [zeile]))

    def _schaltung(self, gid: str, alt: State | None, neu: State | None, t: datetime) -> None:
        vorher, jetzt = _an(alt), _an(neu)
        if vorher == jetzt:
            return
        g = self.st.geraete[gid]
        if jetzt is None or vorher is None:
            self.ereignis(t, "erreichbar", {"erreichbar": jetzt is not None}, "automatik", bereich_id=g.bereich, geraet_id=gid)
            if jetzt is None:
                return
        if neu is not None and neu.context.id in self.st.eigene_kontexte:
            quelle = "automatik"
        elif neu is not None and neu.context.user_id:
            quelle = "ha"       # in HA geschaltet (Oberfläche, Seite) – ohne Person (§6)
        else:
            quelle = "hand"     # am Gerät
        self.ereignis(t, "schalten", {"an": jetzt}, quelle, bereich_id=g.bereich, geraet_id=gid)

    def ereignis(self, t: datetime, art: str, wert: Any, quelle: str, *, bereich_id: str | None = None,
                 geraet_id: str | None = None, grund: str | None = None) -> None:
        zeile = {"zeit": t, "baustelle_id": self.bid, "bereich_id": bereich_id, "geraet_id": geraet_id, "art": art,
                 "wert": wert, "quelle": quelle, "grund": grund}
        self.db.schreiber.dazu(arbeit("einfuegen", "ereignis", [zeile]))

    # ------------------------------------------------------------------ je Minute
    @callback
    def _minute(self, _jetzt: datetime) -> None:
        jetzt = dt_util.utcnow().replace(second=0, microsecond=0)
        self._abschliessen(jetzt, stunde=jetzt.minute == LERNEN_JEDE_MINUTE)
        self.hass.async_create_task(self._async_schreiben_und_tage(dt_util.as_local(jetzt)), "baustelle_datenbank_minute")

    async def _async_schreiben_und_tage(self, lokal: datetime) -> None:
        """Minute schreiben; Tagessummen (BSM-009) für heute alle 15 Minuten, um 00:05 auch für gestern."""
        await self.db.schreiber.async_schreiben()
        if lokal.minute % TAGE_JEDE_MINUTEN:
            return
        from .tage import async_tage_rechnen   # noqa: PLC0415
        tage = [lokal.date()]
        if lokal.hour == 0 and lokal.minute <= TAGE_JEDE_MINUTEN:
            tage.insert(0, lokal.date() - timedelta(days=1))
        await async_tage_rechnen(self.db, self.st, tage)

    def _abschliessen(self, ende: datetime, *, stunde: bool) -> None:
        geraete: list[dict[str, Any]] = []
        bereiche: list[dict[str, Any]] = []
        dauern: list[int] = []
        for gid, sammler in self._geraete.items():
            m = sammler.abschliessen(ende)
            if m.dauer_s <= 0:
                continue
            dauern.append(m.dauer_s)
            geraete.append({"geraet_id": gid, "zeit": ende - _sek(m.dauer_s), "baustelle_id": self.bid,
                            "dauer_s": m.dauer_s, "sekunden_ein": m.sekunden_ein, "sekunden_strom": m.sekunden_strom,
                            "leistung_w": m.leistung_w,
                            "leistung_w_max": m.leistung_w_max, "energie_wh": m.energie_wh,
                            "zaehlerstand_kwh": m.zaehlerstand_kwh, "erreichbar": m.erreichbar, "quelle": "ha",
                            "heizanforderung_s": m.heizanforderung_s, "staffel_gesperrt_s": m.staffel_gesperrt_s})
        d = self.st.daten
        for bid, b_sammler in self._bereiche.items():
            bm = b_sammler.abschliessen(ende)
            if bm.dauer_s <= 0:
                continue
            dauern.append(bm.dauer_s)
            bereiche.append({"bereich_id": bid, "zeit": ende - _sek(bm.dauer_s), "baustelle_id": self.bid,
                             "dauer_s": bm.dauer_s, "temperatur": bm.temperatur, "feuchte": None, "soll": self._soll(bid),
                             "tuer_offen_s": bm.tuer_offen_s, "zustand": d.zustand.get(bid), "grund": d.grund.get(bid),
                             "quelle": "ha", "temp_alter_s": bm.temp_alter_s, "staffel_begrenzt_s": bm.staffel_begrenzt_s})
        dauer = max(dauern, default=60)
        w = d.wetter
        wetter = {"baustelle_id": self.bid, "zeit": ende - _sek(dauer), "dauer_s": dauer, "aussen_temp": w.aussen,
                  "regen_mm": w.regen_heute, "hoechst_heute": w.aussen_max, "quelle": "ha"}
        zustand = self._zustand_aenderungen(ende)
        lernen = self._lernen(ende) if stunde else []
        self.db.schreiber.dazu(arbeit("minute", self.bid, geraete, bereiche, wetter, [list(z) for z in zustand], lernen, ende))

    def _soll(self, bid: str) -> float | None:
        if self.st.bereiche[bid].art != ART_CONTAINER:
            return None
        from ..funktionen.heizung import Heizung   # noqa: PLC0415 – vermeidet einen Kreis beim Import
        heizung = Heizung.von(self.st)
        return heizung.soll_temperatur(bid) if heizung.aktiv() else None

    def _zustand_aenderungen(self, _ende: datetime) -> list[tuple[str, Any]]:
        """Laufzeit (je Schlüssel der obersten Ebene) – nur was sich seit dem letzten Schreiben geändert hat."""
        neu = {k: json.dumps(v, sort_keys=True, default=str) for k, v in self.st.lz.items() if k != "lernen"}
        aenderungen: list[tuple[str, Any]] = [(k, json.loads(t)) for k, t in neu.items() if self._zustand_alt.get(k) != t]
        aenderungen += [(k, None) for k in self._zustand_alt if k not in neu]
        self._zustand_alt = neu
        return aenderungen

    def _lernen(self, ende: datetime) -> list[dict[str, Any]]:
        tag = dt_util.as_local(ende).date()
        zeilen = []
        for bid, stand in (self.st.lz.get("lernen") or {}).items():
            text = json.dumps(stand, sort_keys=True, default=str)
            if self._lernen_alt.get(bid) != text:
                self._lernen_alt[bid] = text
                zeilen.append({"baustelle_id": self.bid, "bereich_id": bid, "datum": tag, "werte": json.loads(text)})
        return zeilen


def _sek(n: int) -> timedelta:
    return timedelta(seconds=n)


@schreibarbeit("minute")
def minute_schreiben(v: Connection, bid: str, geraete: list[dict[str, Any]], bereiche: list[dict[str, Any]],
                     wetter: dict[str, Any], zustand: list[list[Any]], lernen: list[dict[str, Any]], ende: datetime) -> None:
    """Eine Minute einer Baustelle: Geräte, Bereiche, Wetter, geänderte Laufzeit, Gelerntes (stündlich)."""
    if geraete:   # schon vorhandene Minute (doppelt im Puffer nach einem Absturz) wird übersprungen
        v.execute(ohne_doppelte(v, s.geraet_minute), geraete)
    if bereiche:
        v.execute(ohne_doppelte(v, s.bereich_minute), bereiche)
    if geraete or bereiche:
        v.execute(ohne_doppelte(v, s.wetter_minute).values(**wetter))
    for schluessel, wert in zustand:
        v.execute(delete(s.zustand).where(s.zustand.c.baustelle_id == bid, s.zustand.c.schluessel == schluessel))
        if wert is not None:
            v.execute(insert(s.zustand).values(baustelle_id=bid, schluessel=schluessel, wert=wert, geaendert=ende))
    for zeile in lernen:
        gefunden = v.execute(update(s.lernen).where(s.lernen.c.bereich_id == zeile["bereich_id"],
                                                    s.lernen.c.datum == zeile["datum"]).values(werte=zeile["werte"]))
        if gefunden.rowcount == 0:
            v.execute(insert(s.lernen).values(**zeile))
