"""Minutenwerte aus Zustandsfolgen (docs/bauplan-datenbank.md §3.2, BSM-007) – ohne HA-Code.

Je Gerät und Minute: Sekunden eingeschaltet, mittlere und höchste Leistung (zeitgewichtet), Energiezuwachs aus dem
Zählerstand (Regeln aus `logik/zaehlen`, auch nach einer Lücke) bzw. ohne Zähler aus der Leistung, letzter Zählerstand
und ob das Gerät die ganze Minute erreichbar war. Je Container: mittlere Temperatur und Sekunden mit offener Tür.

Prognose V2, Lieferung P1 (BSM-033.06, Bauvorlage CGR-2026-10-11-hochrechnung r5 §5) – nur beobachtet:

- je Gerät `heizanforderung_s` (Regelung will ein, vor der Staffelung) und `staffel_gesperrt_s` (angefordert, aber von
  der Staffelung nicht freigegeben, `logik/staffel.gesperrt`);
- je Container `staffel_begrenzt_s` als Vereinigung der Sperrzeiten seiner Geräte (A [0,20] und B [10,30] → 30 s,
  nicht 40) und `temp_alter_s`, das höchste Alter des benutzten Innenwerts in der Minute (Alter = Zeit seit dem
  letzten echten Bericht des Fühlers; es wächst bis zum nächsten Bericht, also zählen die Zeitpunkte direkt vor einem
  Bericht und das Minutenende).

Jede unbekannte Teilphase (vor dem ersten Bericht, Gerät nicht erreichbar, Fühler ohne Wert oder ohne echten Bericht)
macht den jeweiligen Wert der Minute None – nie 0. Der Wert beim Start gilt nicht als Bericht.

Ein Sammler bekommt jede Änderung mit Zeitpunkt; `abschliessen(ende)` liefert die Werte seit dem letzten Abschluss
und beginnt den nächsten Abschnitt mit den aktuellen Werten.
"""

from __future__ import annotations

from collections.abc import Iterable, Sequence
from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import TypeVar

from .zaehlen import energie_zuwachs

_W = TypeVar("_W")


class Zeitmittel:
    """Zeitgewichtetes Mittel und Höchstwert eines Messwerts (None = unbekannt, zählt nicht)."""

    def __init__(self, t: datetime, wert: float | None) -> None:
        self._t, self._wert = t, wert
        self._summe = self._bekannt = 0.0
        self._max = wert

    def setzen(self, t: datetime, wert: float | None) -> None:
        self._bis(t)
        self._wert = wert
        if wert is not None and (self._max is None or wert > self._max):
            self._max = wert

    def _bis(self, t: datetime) -> None:
        dauer = (t - self._t).total_seconds()
        if dauer > 0:
            if self._wert is not None:
                self._summe += self._wert * dauer
                self._bekannt += dauer
            self._t = t

    def abschliessen(self, ende: datetime) -> tuple[float | None, float | None, float]:
        """(Mittel, Höchstwert, Wert·Sekunden) seit dem letzten Abschluss."""
        self._bis(ende)
        mittel = self._summe / self._bekannt if self._bekannt > 0 else None
        ergebnis = (mittel, self._max if self._bekannt > 0 else None, self._summe)
        self._summe = self._bekannt = 0.0
        self._max = self._wert
        return ergebnis


class Zeitanteil:
    """Sekunden, in denen ein Zustand wahr war (None = unbekannt)."""

    def __init__(self, t: datetime, wert: bool | None) -> None:
        self._t, self._wert = t, wert
        self._wahr = 0.0
        self._unbekannt = wert is None

    def setzen(self, t: datetime, wert: bool | None) -> None:
        self._bis(t)
        self._wert = wert
        if wert is None:
            self._unbekannt = True

    def _bis(self, t: datetime) -> None:
        dauer = (t - self._t).total_seconds()
        if dauer > 0:
            if self._wert:
                self._wahr += dauer
            self._t = t

    def abschliessen(self, ende: datetime) -> tuple[float, bool]:
        """(Sekunden wahr, irgendwann unbekannt) seit dem letzten Abschluss."""
        self._bis(ende)
        ergebnis = (self._wahr, self._unbekannt)
        self._wahr = 0.0
        self._unbekannt = self._wert is None
        return ergebnis


class Beobachtung(Zeitanteil):
    """Wie `Zeitanteil`, aber unbekannt nur, wenn ein unbekannter Stand wirklich eine Dauer hat – ein Bericht genau zum
    Minutenbeginn macht die Minute vollständig (P1, BSM-033.06)."""

    def __init__(self, t: datetime, wert: bool | None) -> None:
        super().__init__(t, wert)
        self._unbekannt = False

    def setzen(self, t: datetime, wert: bool | None) -> None:
        self._bis(t)
        self._wert = wert

    def _bis(self, t: datetime) -> None:
        if self._wert is None and (t - self._t).total_seconds() > 0:
            self._unbekannt = True
        super()._bis(t)

    def abschliessen(self, ende: datetime) -> tuple[float, bool]:
        ergebnis = super().abschliessen(ende)
        self._unbekannt = False
        return ergebnis


@dataclass(frozen=True)
class GeraetMinute:
    dauer_s: int
    sekunden_ein: int
    leistung_w: float | None
    leistung_w_max: float | None
    energie_wh: float | None
    zaehlerstand_kwh: float | None
    erreichbar: bool
    sekunden_strom: int = 0   # eingeschaltet und Leistung über `zieht_w` (ohne Messung: wie eingeschaltet), AN-0011
    heizanforderung_s: int | None = None    # P1: Regelung will ein (vor der Staffelung); None = unbekannt
    staffel_gesperrt_s: int | None = None   # P1: davon von der Staffelung nicht freigegeben


class GeraetSammler:
    """Schalter, Leistung und Energiezähler eines Shelly."""

    def __init__(self, t: datetime, an: bool | None, leistung: float | None, stand: float | None, *, mit_zaehler: bool,
                 zieht_w: float = 50.0) -> None:
        self._start = t
        self._an = Zeitanteil(t, an)
        self._leistung = Zeitmittel(t, leistung)
        self._zieht_w = zieht_w
        self._an_jetzt, self._w_jetzt = an, leistung
        self._strom = Zeitanteil(t, self._zieht())
        self._mit_zaehler = mit_zaehler
        self._stand = stand
        self._stand_alt, self._stand_alt_zeit = stand, (t if stand is not None else None)
        self._anforderung = Beobachtung(t, None)   # unbekannt bis zum ersten Bericht der Staffelung
        self._gesperrt = Beobachtung(t, None)

    def _zieht(self) -> bool:
        return bool(self._an_jetzt) and (self._w_jetzt is None or self._w_jetzt > self._zieht_w)

    def schalter(self, t: datetime, an: bool | None) -> None:
        self._an.setzen(t, an)
        self._an_jetzt = an
        self._strom.setzen(t, self._zieht())

    def leistung(self, t: datetime, watt: float | None) -> None:
        self._leistung.setzen(t, watt)
        self._w_jetzt = watt
        self._strom.setzen(t, self._zieht())

    def zaehler(self, _t: datetime, kwh: float | None) -> None:
        if kwh is not None:
            self._stand = kwh

    def staffel(self, t: datetime, anforderung: bool | None, gesperrt: bool | None) -> None:
        """Stand nach einem Schritt der Staffelung (gilt bis zum nächsten)."""
        self._anforderung.setzen(t, anforderung)
        self._gesperrt.setzen(t, gesperrt)

    def abschliessen(self, ende: datetime) -> GeraetMinute:
        ein, unbekannt = self._an.abschliessen(ende)
        anf, anf_unbekannt = self._anforderung.abschliessen(ende)
        gesp, gesp_unbekannt = self._gesperrt.abschliessen(ende)
        strom, _ = self._strom.abschliessen(ende)
        mittel, hoechst, wattsekunden = self._leistung.abschliessen(ende)
        energie: float | None
        if self._mit_zaehler:
            if self._stand is None or self._stand_alt is None or self._stand_alt_zeit is None:
                energie = None
            else:   # Zuwachs seit dem letzten bekannten Stand – nach einer Lücke mit der Grenze je Stunde der Lücke
                stunden = (ende - self._stand_alt_zeit).total_seconds() / 3600
                energie = energie_zuwachs(self._stand_alt, self._stand, stunden) * 1000
            if self._stand is not None and self._stand != self._stand_alt:
                self._stand_alt, self._stand_alt_zeit = self._stand, ende
            elif self._stand is not None and self._stand_alt_zeit is None:
                self._stand_alt, self._stand_alt_zeit = self._stand, ende
        else:
            energie = wattsekunden / 3600 if mittel is not None else None
        dauer = int(round((ende - self._start).total_seconds()))
        self._start = ende
        return GeraetMinute(dauer, int(round(ein)), None if mittel is None else round(mittel, 1),
                            hoechst, None if energie is None else round(energie, 3), self._stand, not unbekannt, int(round(strom)),
                            None if anf_unbekannt else int(round(anf)),
                            None if anf_unbekannt or gesp_unbekannt else int(round(gesp)))


@dataclass(frozen=True)
class BereichMinute:
    dauer_s: int
    temperatur: float | None
    tuer_offen_s: int | None
    temp_alter_s: int | None = None         # P1: höchstes Alter des Innenwerts; None = unbekannt
    staffel_begrenzt_s: int | None = None   # P1: Vereinigung der Sperrzeiten der Geräte


def vereinigt(gesperrt: Iterable[bool | None]) -> bool | None:
    """Container gesperrt, sobald eines seiner Geräte gesperrt ist; sonst unbekannt, wenn eines unbekannt ist."""
    werte = list(gesperrt)
    if any(werte):
        return True
    if not werte or any(w is None for w in werte):
        return None
    return False


class Alter:
    """Höchstes Alter eines Messwerts je Abschnitt aus den Zeitpunkten seiner echten Berichte (None = unbekannt)."""

    def __init__(self, t: datetime, beobachtet: datetime | None) -> None:
        self._t, self._beobachtet = t, beobachtet
        self._max = 0.0
        self._unbekannt = False   # unbekannt erst, wenn ein Stand ohne Beleg eine Dauer hat

    def bericht(self, t: datetime, beobachtet: datetime | None) -> None:
        """Neuer Stand ab `t`: zuletzt beobachtet um `beobachtet` (None = Wert ohne Beleg, z. B. nicht verfügbar)."""
        self._bis(t)
        self._beobachtet = beobachtet

    def _bis(self, t: datetime) -> None:
        if (t - self._t).total_seconds() <= 0:
            return
        if self._beobachtet is None:
            self._unbekannt = True
        else:   # das Alter wächst bis `t` – dort ist es im Abschnitt am größten
            self._max = max(self._max, (t - self._beobachtet).total_seconds())
        self._t = t

    def abschliessen(self, ende: datetime) -> int | None:
        self._bis(ende)
        ergebnis = None if self._unbekannt else int(round(self._max))
        self._max = 0.0
        self._unbekannt = False
        return ergebnis


class BereichSammler:
    """Temperatur und Tür eines Containers; dazu Alter des Innenwerts und Staffelungssperre seiner Geräte (P1)."""

    def __init__(self, t: datetime, temperatur: float | None, tuer_offen: bool | None, *, mit_tuer: bool,
                 geraete: Sequence[str] = (), beobachtet: datetime | None = None) -> None:
        self._start = t
        self._temp = Zeitmittel(t, temperatur)
        self._tuer = Zeitanteil(t, tuer_offen)
        self._mit_tuer = mit_tuer
        self._alter = Alter(t, beobachtet)
        self._sperre: dict[str, bool | None] = dict.fromkeys(geraete)
        self._begrenzt = Beobachtung(t, None)

    def temperatur(self, t: datetime, wert: float | None) -> None:
        self._temp.setzen(t, wert)

    def bericht(self, t: datetime, beobachtet: datetime | None) -> None:
        """Bericht des Fühlers (auch mit unverändertem Wert); `beobachtet` None = Wert ohne echten Bericht."""
        self._alter.bericht(t, beobachtet)

    def staffel(self, t: datetime, geraet_id: str, gesperrt: bool | None) -> None:
        if geraet_id not in self._sperre:
            return
        self._sperre[geraet_id] = gesperrt
        self._begrenzt.setzen(t, vereinigt(self._sperre.values()))

    def tuer(self, t: datetime, offen: bool | None) -> None:
        self._tuer.setzen(t, offen)

    def abschliessen(self, ende: datetime) -> BereichMinute:
        mittel, _hoechst, _summe = self._temp.abschliessen(ende)
        offen, _unbekannt = self._tuer.abschliessen(ende)
        alter = self._alter.abschliessen(ende)
        begrenzt, begrenzt_unbekannt = self._begrenzt.abschliessen(ende)
        dauer = int(round((ende - self._start).total_seconds()))
        self._start = ende
        return BereichMinute(dauer, None if mittel is None else round(mittel, 2), int(round(offen)) if self._mit_tuer else None,
                             alter, None if begrenzt_unbekannt else int(round(begrenzt)))


# ---------------------------------------------------------------------- Verlauf nachspielen (BSM-008, Altdaten)
@dataclass(frozen=True)
class GeraetVerlauf:
    schalter: list[tuple[datetime, bool | None]]
    leistung: list[tuple[datetime, float | None]]
    zaehler: list[tuple[datetime, float | None]]
    mit_zaehler: bool


@dataclass(frozen=True)
class BereichVerlauf:
    temperatur: list[tuple[datetime, float | None]]
    tuer: list[tuple[datetime, bool | None]] | None
    grund: list[tuple[datetime, str | None]]


def _stand_bei(punkte: Sequence[tuple[datetime, _W]], t: datetime) -> _W | None:
    """Letzter Wert bis einschließlich `t` (None, wenn es noch keinen gab)."""
    wert: _W | None = None
    for zeit, w in punkte:
        if zeit > t:
            break
        wert = w
    return wert


def _minutengrenzen(start: datetime, ende: datetime) -> list[datetime]:
    erste = start.replace(second=0, microsecond=0)
    if erste <= start:
        erste += timedelta(minutes=1)
    grenzen = []
    t = erste
    while t < ende:
        grenzen.append(t)
        t += timedelta(minutes=1)
    grenzen.append(ende)
    return grenzen


def nachspielen_geraet(v: GeraetVerlauf, start: datetime, ende: datetime, zieht_w: float = 50.0) -> list[tuple[datetime, GeraetMinute]]:
    """Verlauf eines Geräts als Minuten (Beginn, Werte) von `start` bis `ende` – wie beim Mitschreiben."""
    if not (v.schalter or v.leistung or v.zaehler):
        return []
    s = GeraetSammler(start, _stand_bei(v.schalter, start), _stand_bei(v.leistung, start), _stand_bei(v.zaehler, start),
                      mit_zaehler=v.mit_zaehler, zieht_w=zieht_w)
    ereignisse = sorted([(t, 0, w) for t, w in v.schalter if start < t < ende] + [(t, 1, w) for t, w in v.leistung if start < t < ende]
                        + [(t, 2, w) for t, w in v.zaehler if start < t < ende], key=lambda e: (e[0], e[1]))
    ergebnis, i, beginn = [], 0, start
    for grenze in _minutengrenzen(start, ende):
        while i < len(ereignisse) and ereignisse[i][0] < grenze:
            t, art, w = ereignisse[i]
            if art == 0:
                s.schalter(t, w)   # type: ignore[arg-type]
            elif art == 1:
                s.leistung(t, w)
            else:
                s.zaehler(t, w)
            i += 1
        ergebnis.append((beginn, s.abschliessen(grenze)))
        beginn = grenze
    return ergebnis


def nachspielen_bereich(v: BereichVerlauf, start: datetime, ende: datetime) -> list[tuple[datetime, BereichMinute, str | None]]:
    """Verlauf eines Containers als Minuten (Beginn, Werte, Grund am Ende der Minute)."""
    if not (v.temperatur or v.tuer or v.grund):
        return []
    s = BereichSammler(start, _stand_bei(v.temperatur, start), _stand_bei(v.tuer or [], start), mit_tuer=v.tuer is not None)
    ereignisse = sorted([(t, 0, w) for t, w in v.temperatur if start < t < ende] + [(t, 1, w) for t, w in (v.tuer or []) if start < t < ende],
                        key=lambda e: (e[0], e[1]))
    ergebnis, i, beginn = [], 0, start
    for grenze in _minutengrenzen(start, ende):
        while i < len(ereignisse) and ereignisse[i][0] < grenze:
            t, art, w = ereignisse[i]
            if art == 0:
                s.temperatur(t, w)
            else:
                s.tuer(t, w)         # type: ignore[arg-type]
            i += 1
        ergebnis.append((beginn, s.abschliessen(grenze), _stand_bei(v.grund, grenze)))
        beginn = grenze
    return ergebnis
