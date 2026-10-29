"""Warnungen einer Baustelle – reine Fachlogik ohne Home-Assistant-Code.

Vorgabe: Bauplan 0.7 §2.4, Vorbild das abgenommene Mockup `mockups/quelle/glas-app.js`
(Daten `warnungen`, Einblendung „warnungen“, Warnung-Chip, Einstellungen „Meldungen“, Einblendung „nachrichten“).

Ablauf beim Aufrufer (Integration), z. B. jede Minute:

1. `pruefe(zustand, einst, jetzt)` liefert alle offenen Warnungen (fürs Protokoll, die Einblendung und den Chip).
2. `behalte_seit(neu, alt)` übernimmt den Beginn schon bekannter Probleme (gleicher `key`).
3. `zu_melden(neu, bisher, stumm, jetzt)` liefert die Warnungen, die jetzt als Nachricht aufs Handy gehen.
4. `gemeldet_merken(neu, bisher, gemeldet)` ergibt das neue `bisher` (gemeldete Keys, solange das Problem besteht).
   Verschwindet ein Problem, fällt sein Key heraus – kommt es wieder, wird es erneut gemeldet.

Stufen: Störungen gehen sofort aufs Handy (einmal je Problem), Hinweise nur ins Protokoll und in den Chip. Ausnahmen
`tuer_offen`: Hinweis ab `tuer_pause_min` (Heizung pausiert), Nachricht erst nach `tuer_melden_min`; `hand_zu_lange`:
Nachricht nach `hand_h` (Bauplan §5).
Stumm bis Zeitpunkt unterdrückt Nachricht und Chip, nicht das Protokoll (`pruefe` liefert stumme Warnungen weiter).

Entscheidungen, wo der Bauplan offen ist (im Sinne des Mockups):

- Mockup hat einen Schalter „Stromausfall / offline“ für beide Arten: `baustelle_offline` ist nur aktiv, wenn auch
  `offline` aktiv ist. Sind alle Geräte offline, gibt es nur `baustelle_offline` statt einer Warnung je Gerät –
  aber erst, sobald `baustelle_offline` selbst ausgelöst ist (nach `offline_min` seit dem letzten Ausfall); bis dahin
  bleiben die Warnungen je Gerät stehen.
- `offline` gilt je Gerät erst nach `offline_min` (auch für Heizkörper, nicht nur Pumpen). Ist das Gerät das einzige
  im Container, steht wie im Mockup nur „nicht erreichbar“ (Chip „Lager Süd: nicht erreichbar“), sonst mit Gerätename.
- `tuer_offen` hat im Mockup keinen Schalter; abschaltbar nur über `arten["tuer_offen"] = False`.
- `keine_leistung`: Heizkörper eingeschaltet, aber seit `keine_leistung_nach_min` unter `keine_leistung_unter_w` – gezählt ab
  dem späteren von „eingeschaltet“ und „Leistungswert gilt seit“, damit Pausen des Heizkörper-Thermostats nicht warnen.
  Nur bei Containern mit Fühler und Temperatur unter Soll – ohne Fühler regelt das Thermostat des Heizkörpers selbst
  („an · Thermostat regelt“), 0 W ist dann normal. Schwelle und Dauer stehen nicht im Bauplan (Standard 5 W / 2 min).
  Ohne Messwert (`leistung is None`, Gerät misst nicht) keine Warnung.
- `frostgefahr`: Container-Temperatur unter `frost_grenze`, nur wenn der Frostschutz eingeschaltet ist
  („Frostgefahr trotz Frostschutz“).
- `fuehler_fehlt`: Fühler eingerichtet, aber kein Messwert, oder Batterie „kritisch“ (logik/sensoren.batterie_stufe, < 10 %)
  („Fühler meldet nichts / Batterie schwach“).
- `zyklen_oft` ab `zyklen_h` Zyklen in der letzten Stunde („ab 10 je Stunde“).
- Das Mockup zeigt unter „nachrichten“ auch „Steckdose Magazin seit 8 h auf Hand“ als Handy-Nachricht. Bauplan §5
  (Entscheidung 30.09.2026): die Beispiel-Nachrichten gehen vor – `hand_zu_lange` kommt nach `hand_h` aufs Handy.
- Zahlen in Texten wie `de()` im Mockup: Dezimalkomma, kaufmännisch gerundet (4,25 → 4,3).
"""

from __future__ import annotations

from collections.abc import Sequence, Iterable, Mapping
from dataclasses import dataclass, field, replace
from datetime import datetime
from decimal import ROUND_HALF_UP, Decimal
from enum import StrEnum
from typing import Any

from . import pumpen
from .sensoren import batterie_stufe


class Stufe(StrEnum):
    """Schwere einer Warnung: Störung (rot, Nachricht) oder Hinweis (gelb)."""

    STOERUNG = "stoerung"
    HINWEIS = "hinweis"


class Art(StrEnum):
    """Arten von Warnungen."""

    OFFLINE = "offline"
    BAUSTELLE_OFFLINE = "baustelle_offline"
    TROCKENLAUF = "trockenlauf"
    DAUERLAUF = "dauerlauf"
    ZYKLEN_OFT = "zyklen_oft"
    KEINE_LEISTUNG = "keine_leistung"
    FROSTGEFAHR = "frostgefahr"
    ZU_KALT = "zu_kalt"
    FUEHLER_FEHLT = "fuehler_fehlt"
    KEIN_WETTER = "kein_wetter"
    HAND_ZU_LANGE = "hand_zu_lange"
    TUER_OFFEN = "tuer_offen"
    SELBST_EIN = "selbst_ein"   # FE-0010: Gerät schaltet sich selbst wieder ein (z. B. Auto-ON-Timer am Shelly)
    NOTPROGRAMM = "notprogramm"   # BSM-019: Plug nimmt Skript oder Programm des Notprogramms nicht an


STOERUNGEN: frozenset[Art] = frozenset(
    {
        Art.OFFLINE,
        Art.BAUSTELLE_OFFLINE,
        Art.TROCKENLAUF,
        Art.DAUERLAUF,
        Art.ZYKLEN_OFT,
        Art.KEINE_LEISTUNG,
        Art.FROSTGEFAHR,
        Art.SELBST_EIN,
    }
)
NOTPROGRAMM_NACH_MIN = 15    # BSM-019: erst melden, wenn das Notprogramm so lange nicht in Ordnung ist (eine Runde kann scheitern)
SELBST_EIN_AB = 3            # so oft musste die Automatik ein Gerät …
SELBST_EIN_FENSTER_MIN = 10  # … in so vielen Minuten wieder ausschalten


def selbst_ein_seit(aus_befehle: Sequence[datetime], jetzt: datetime) -> datetime | None:
    """FE-0010: Musste die Automatik ein Gerät in `SELBST_EIN_FENSTER_MIN` Minuten mindestens `SELBST_EIN_AB`-mal
    ausschalten, schaltet es sich selbst wieder ein – seit dem ersten dieser Befehle, sonst None."""
    neu = [t for t in aus_befehle if 0 <= (jetzt - t).total_seconds() / 60 <= SELBST_EIN_FENSTER_MIN]
    return min(neu) if len(neu) >= SELBST_EIN_AB else None


def stufe_von(art: str) -> Stufe:
    """Stufe einer Art nach Bauplan §2.4."""
    return Stufe.STOERUNG if art in STOERUNGEN else Stufe.HINWEIS


class Typ(StrEnum):
    """Gerätetyp."""

    HEIZUNG = "heizung"
    PUMPE = "pumpe"
    SONST = "sonst"


@dataclass(frozen=True)
class GeraetZustand:
    """Ein geschaltetes Gerät (Shelly) mit Messwerten.

    `an_seit`: seit wann eingeschaltet (für `keine_leistung`); `laeuft_seit`: seit wann die Pumpe läuft;
    `zyklen_h`: Pumpenzyklen der letzten Stunde; `hand_seit`: seit wann auf Hand (sonst None).
    """

    id: str
    bereich: str
    typ: Typ = Typ.HEIZUNG
    name: str = ""
    erreichbar: bool = True
    offline_seit: datetime | None = None
    leistung: float | None = None
    an: bool = False
    an_seit: datetime | None = None
    leistung_seit: datetime | None = None   # seit wann der aktuelle Leistungswert gilt (für `keine_leistung`)
    hand_seit: datetime | None = None
    selbst_ein_seit: datetime | None = None   # FE-0010
    laeuft_seit: datetime | None = None
    zyklen_h: int = 0
    notprogramm_seit: datetime | None = None   # BSM-019: seit wann das Notprogramm am Plug nicht in Ordnung ist
    notprogramm_fehler: str = ""


@dataclass(frozen=True)
class ContainerZustand:
    """Messwerte und Lage eines Containers.

    `fuehler`: Temperaturfühler eingerichtet; `unter_soll_seit`: seit wann in der Arbeitszeit unter Soll − 1 °C
    (vom Aufrufer mitgeführt); `tuer_offen_seit`: seit wann die Tür offen ist (sonst None).
    """

    id: str
    temperatur: float | None = None
    soll: float | None = None
    in_arbeitszeit: bool = False
    fuehler: bool = False
    batterie: float | None = None   # Batterie des Fühlers (%)
    batterien: tuple[tuple[str, str, float | None], ...] = ()   # BSM-034.03: (Name, Entität, %) der Türen, Fenster, Licht
    unter_soll_seit: datetime | None = None
    tuer_offen_seit: datetime | None = None
    tuer_pausiert: bool = True      # Tür pausiert die Heizung (sonst nur ein Sicherheitshinweis, Szenarien)
    modus: str = ""                 # thermo | bedarf | plan | hand | aus ("" = unbekannt: wie früher prüfen)

    @property
    def regelt_soll(self) -> bool:
        """Regelt der Container auf das Soll (Thermostat, Bei Bedarf)? Nur dann sind „zu kalt“/„zieht keinen Strom“
        Fehler – im Zeitplan regelt der Heizkörperthermostat (Szenarien, Herbert 01.10.2026)."""
        return self.modus in ("", "thermo", "bedarf")


@dataclass(frozen=True)
class BaustellenZustand:
    """Alles, was `pruefe` über eine Baustelle wissen muss."""

    geraete: tuple[GeraetZustand, ...] = ()
    container: tuple[ContainerZustand, ...] = ()
    wetter_vorhanden: bool = True


@dataclass(frozen=True)
class WarnEinstellungen:
    """Schwellen und Schalter der Warnungen (Store `meldungen_einst`, dazu Frost/Tür aus `heizung`)."""

    arten: Mapping[str, bool] = field(default_factory=dict)
    kalt_min: float = 60.0
    hand_h: float = 8.0
    zyklen_h: int = 10
    dauerlauf_min: float = 20.0
    trocken_unter_w: float = 30.0
    offline_min: float = 5.0
    frost: bool = True
    frost_grenze: float = 5.0
    tuer_pause_min: float = 3.0
    tuer_melden_min: float = 10.0
    keine_leistung_unter_w: float = 5.0
    keine_leistung_nach_min: float = 15.0   # Radiator-Thermostat pausiert 3–7 min (004_C_MAN, 07.10.2026)
    pumpe_laeuft_ab_w: float = 20.0
    trocken_nach_min: float = 1.0

    @classmethod
    def aus_store(cls, meldungen_einst: Mapping[str, Any], heizung: Mapping[str, Any]) -> WarnEinstellungen:
        """Einstellungen aus den Store-Abschnitten `meldungen_einst` und `heizung` (Bauplan §1)."""
        standard = cls()

        def wert(quelle: Mapping[str, Any], schluessel: str, vorgabe: Any) -> Any:
            x = quelle.get(schluessel) if quelle else None
            return vorgabe if x is None else x

        return cls(
            arten=dict(wert(meldungen_einst, "arten", {}) or {}),
            kalt_min=wert(meldungen_einst, "kalt_min", standard.kalt_min),
            hand_h=wert(meldungen_einst, "hand_h", standard.hand_h),
            zyklen_h=wert(meldungen_einst, "zyklen_h", standard.zyklen_h),
            dauerlauf_min=wert(meldungen_einst, "dauerlauf_min", standard.dauerlauf_min),
            trocken_unter_w=wert(meldungen_einst, "trocken_unter_w", standard.trocken_unter_w),
            offline_min=wert(meldungen_einst, "offline_min", standard.offline_min),
            frost=wert(heizung, "frost", standard.frost),
            frost_grenze=wert(heizung, "frost_grenze", standard.frost_grenze),
            tuer_pause_min=wert(heizung, "tuer_pause_min", standard.tuer_pause_min),
            tuer_melden_min=wert(heizung, "tuer_melden_min", standard.tuer_melden_min),
        )

    def aktiv(self, art: str) -> bool:
        """Ist die Art eingeschaltet? Fehlt sie in `arten`, gilt sie als an."""
        if art == Art.BAUSTELLE_OFFLINE and not self.arten.get(Art.OFFLINE, True):
            return False
        return bool(self.arten.get(art, True))

    def pumpen_regeln(self) -> pumpen.PumpenRegeln:
        """Regeln für `logik/pumpen.py`."""
        return pumpen.PumpenRegeln(
            offline_min=self.offline_min,
            laeuft_ab_w=self.pumpe_laeuft_ab_w,
            trocken_unter_w=self.trocken_unter_w,
            trocken_nach_min=self.trocken_nach_min,
            dauerlauf_h=self.dauerlauf_min / 60,
        )


@dataclass(frozen=True)
class Warnung:
    """Eine offene Warnung. `key` ist je Problem stabil (für Stumm und „schon gemeldet“)."""

    key: str
    art: str
    stufe: str
    bereich: str | None
    geraet: str | None
    seit: datetime
    werte: dict[str, Any] = field(default_factory=dict, compare=True)


def warn_key(art: str, bereich: str | None = None, geraet: str | None = None) -> str:
    """Stabiler Schlüssel einer Warnung, z. B. `offline:lager:g1` oder `kein_wetter`."""
    return ":".join([str(art), *(x for x in (bereich, geraet) if x)])


def _warnung(art: Art, seit: datetime, bereich: str | None = None, geraet: str | None = None, **werte: Any) -> Warnung:
    return Warnung(
        key=warn_key(art, bereich, geraet),
        art=str(art),
        stufe=str(stufe_von(art)),
        bereich=bereich,
        geraet=geraet,
        seit=seit,
        werte=werte,
    )


def _minuten(von: datetime | None, bis: datetime) -> float:
    return 0.0 if von is None else (bis - von).total_seconds() / 60


def _pruefe_geraet(
    g: GeraetZustand,
    c: ContainerZustand | None,
    einst: WarnEinstellungen,
    jetzt: datetime,
    alle_offline: bool,
    allein: bool = False,
) -> list[Warnung]:
    w: list[Warnung] = []
    # Einziges Gerät im Container: wie im Mockup nur „Lager Süd: nicht erreichbar“, ohne Gerätename.
    offline_name = "" if allein else g.name
    if g.typ == Typ.PUMPE:
        zustand = pumpen.PumpenZustand(
            erreichbar=g.erreichbar,
            leistung=g.leistung,
            offline_seit_min=_minuten(g.offline_seit, jetzt),
            laeuft_seit_min=_minuten(g.laeuft_seit, jetzt),
        )
        for problem in pumpen.pruefe(zustand, einst.pumpen_regeln()):
            if problem == pumpen.Problem.OFFLINE:
                if not alle_offline and einst.aktiv(Art.OFFLINE):
                    w.append(_warnung(Art.OFFLINE, g.offline_seit or jetzt, g.bereich, g.id, name=offline_name))
            elif problem == pumpen.Problem.TROCKENLAUF and einst.aktiv(Art.TROCKENLAUF):
                w.append(
                    _warnung(Art.TROCKENLAUF, g.laeuft_seit or jetzt, g.bereich, g.id, name=g.name, leistung=g.leistung)
                )
            elif problem == pumpen.Problem.DAUERLAUF and einst.aktiv(Art.DAUERLAUF):
                w.append(
                    _warnung(
                        Art.DAUERLAUF,
                        g.laeuft_seit or jetzt,
                        g.bereich,
                        g.id,
                        name=g.name,
                        minuten=round(_minuten(g.laeuft_seit, jetzt)),
                    )
                )
        if g.erreichbar and g.zyklen_h >= einst.zyklen_h and einst.aktiv(Art.ZYKLEN_OFT):
            w.append(_warnung(Art.ZYKLEN_OFT, jetzt, g.bereich, g.id, name=g.name, zyklen=g.zyklen_h))
    elif not g.erreichbar:
        if (
            not alle_offline
            and _minuten(g.offline_seit, jetzt) >= einst.offline_min
            and einst.aktiv(Art.OFFLINE)
        ):
            w.append(_warnung(Art.OFFLINE, g.offline_seit or jetzt, g.bereich, g.id, name=offline_name))
    elif (
        g.typ == Typ.HEIZUNG
        and g.an
        and einst.aktiv(Art.KEINE_LEISTUNG)
        and c is not None
        and c.fuehler
        and c.regelt_soll
        and c.temperatur is not None
        and c.soll is not None
        and c.temperatur < c.soll
        and g.leistung is not None
        and g.leistung < einst.keine_leistung_unter_w
        and _minuten(ohne := _spaeter(g.an_seit, g.leistung_seit), jetzt) >= einst.keine_leistung_nach_min
    ):
        w.append(_warnung(Art.KEINE_LEISTUNG, ohne or jetzt, g.bereich, g.id, name=g.name))
    if (
        g.erreichbar
        and g.notprogramm_seit is not None
        and _minuten(g.notprogramm_seit, jetzt) >= NOTPROGRAMM_NACH_MIN
        and einst.aktiv(Art.NOTPROGRAMM)
    ):
        w.append(_warnung(Art.NOTPROGRAMM, g.notprogramm_seit, g.bereich, g.id, name=g.name, fehler=g.notprogramm_fehler))
    if g.erreichbar and g.selbst_ein_seit is not None and einst.aktiv(Art.SELBST_EIN):
        w.append(_warnung(Art.SELBST_EIN, g.selbst_ein_seit, g.bereich, g.id, name=g.name))
    if (
        g.erreichbar
        and g.hand_seit is not None
        and not (c is not None and c.modus == "hand")   # im Modus Hand ist Hand gewollt: keine Erinnerung
        and _minuten(g.hand_seit, jetzt) > einst.hand_h * 60
        and einst.aktiv(Art.HAND_ZU_LANGE)
    ):
        w.append(
            _warnung(
                Art.HAND_ZU_LANGE, g.hand_seit, g.bereich, g.id, name=g.name, stunden=_minuten(g.hand_seit, jetzt) / 60
            )
        )
    return w


def _pruefe_container(c: ContainerZustand, einst: WarnEinstellungen, jetzt: datetime) -> list[Warnung]:
    w: list[Warnung] = []
    t = c.temperatur
    if c.fuehler and t is None and einst.aktiv(Art.FUEHLER_FEHLT):
        w.append(_warnung(Art.FUEHLER_FEHLT, jetzt, c.id))
    elif (
        c.fuehler
        and batterie_stufe(c.batterie) == "kritisch"
        and einst.aktiv(Art.FUEHLER_FEHLT)
    ):
        w.append(_warnung(Art.FUEHLER_FEHLT, jetzt, c.id, batterie=c.batterie))
    for name, eid, prozent in c.batterien:   # BSM-034.03: jeder Sensor des Containers, eigene Warnung
        if batterie_stufe(prozent) == "kritisch" and einst.aktiv(Art.FUEHLER_FEHLT):
            w.append(_warnung(Art.FUEHLER_FEHLT, jetzt, c.id, eid, name=name, batterie=prozent))
    if t is not None and einst.frost and t < einst.frost_grenze and einst.aktiv(Art.FROSTGEFAHR):
        w.append(_warnung(Art.FROSTGEFAHR, jetzt, c.id, temperatur=t, grenze=einst.frost_grenze))
    if (
        t is not None
        and c.soll is not None
        and c.in_arbeitszeit
        and c.regelt_soll
        and t < c.soll - 1.0
        and c.unter_soll_seit is not None
        and _minuten(c.unter_soll_seit, jetzt) >= einst.kalt_min
        and einst.aktiv(Art.ZU_KALT)
    ):
        w.append(_warnung(Art.ZU_KALT, c.unter_soll_seit, c.id, temperatur=t, soll=c.soll))
    if c.tuer_offen_seit is not None and einst.aktiv(Art.TUER_OFFEN):
        offen = _minuten(c.tuer_offen_seit, jetzt)
        if offen >= einst.tuer_pause_min:
            w.append(
                _warnung(
                    Art.TUER_OFFEN,
                    c.tuer_offen_seit,
                    c.id,
                    minuten=int(offen),
                    nachricht=offen >= einst.tuer_melden_min,
                    pausiert=c.tuer_pausiert,
                )
            )
    return w


def baustelle_offline(erreichbar: list[bool]) -> bool:
    """Alle Geräte der Baustelle antworten nicht: Stromausfall oder Internet weg."""
    return bool(erreichbar) and not any(erreichbar)


def pruefe(zustand: BaustellenZustand, einst: WarnEinstellungen, jetzt: datetime) -> list[Warnung]:
    """Alle offenen Warnungen: zuerst Störungen, dann Hinweise (je in Reihenfolge der Geräte/Container).

    Stumm geschaltete Warnungen sind enthalten (sie gehören ins Protokoll); `zu_melden` und `sichtbar` filtern sie.
    """
    geraete = zustand.geraete
    alle_offline = baustelle_offline([g.erreichbar for g in geraete])
    warnungen: list[Warnung] = []
    # Einzelne Offline-Warnungen weichen erst, wenn `baustelle_offline` wirklich gemeldet wird – sonst verschwänden
    # schon gemeldete Geräte kurz und kämen danach als neues Problem wieder.
    baustelle_weg = False
    if alle_offline:
        seit = max((g.offline_seit or jetzt for g in geraete), default=jetzt)
        if _minuten(seit, jetzt) >= einst.offline_min and einst.aktiv(Art.BAUSTELLE_OFFLINE):
            baustelle_weg = True
            warnungen.append(_warnung(Art.BAUSTELLE_OFFLINE, seit))
    container = {c.id: c for c in zustand.container}
    anzahl: dict[str, int] = {}
    for g in geraete:
        anzahl[g.bereich] = anzahl.get(g.bereich, 0) + 1
    for g in geraete:
        warnungen += _pruefe_geraet(
            g, container.get(g.bereich), einst, jetzt, baustelle_weg, allein=anzahl[g.bereich] == 1
        )
    for c in zustand.container:
        warnungen += _pruefe_container(c, einst, jetzt)
    if not zustand.wetter_vorhanden and einst.aktiv(Art.KEIN_WETTER):
        warnungen.append(_warnung(Art.KEIN_WETTER, jetzt))
    return sorted(warnungen, key=lambda w: w.stufe != Stufe.STOERUNG)


def behalte_seit(neu: Iterable[Warnung], alt: Iterable[Warnung]) -> list[Warnung]:
    """Beginn schon bekannter Probleme (gleicher Key) aus der letzten Prüfung übernehmen."""
    frueher = {w.key: w.seit for w in alt}
    return [replace(w, seit=min(w.seit, frueher[w.key])) if w.key in frueher else w for w in neu]


def _spaeter(a: datetime | None, b: datetime | None) -> datetime | None:
    """Der spätere von zwei Zeitpunkten (None zählt nicht)."""
    return max((x for x in (a, b) if x is not None), default=None)


def ist_stumm(key: str, stumm: Mapping[str, datetime], jetzt: datetime) -> bool:
    """Stumm bis zu einem Zeitpunkt, der noch nicht erreicht ist."""
    bis = stumm.get(key)
    return bis is not None and jetzt < bis


def zu_melden(
    neu: list[Warnung], bisher: set[str], stumm: Mapping[str, datetime], jetzt: datetime
) -> list[Warnung]:
    """Warnungen, die jetzt als Nachricht aufs Handy gehen.

    Störungen sofort, einmal je Problem (`bisher` = schon gemeldete Keys); `tuer_offen` nach `tuer_melden_min`;
    `hand_zu_lange` nach `hand_h` (Bauplan §5); andere Hinweise nie. Stumme Warnungen werden nicht gemeldet (und nicht als gemeldet gemerkt, s. `gemeldet_merken`).
    """
    return [
        w
        for w in neu
        if w.key not in bisher
        and not ist_stumm(w.key, stumm, jetzt)
        and (
            w.stufe == Stufe.STOERUNG
            or w.art == Art.HAND_ZU_LANGE
            or (w.art == Art.TUER_OFFEN and w.werte.get("nachricht", False))
        )
    ]


def erinnern(bisher: set[str], abgelaufen: Iterable[str], neu: Iterable[Warnung]) -> set[str]:
    """Nach „stumm“ erinnern (Szenarien, Herbert 01.10.2026): ist ein Stumm abgelaufen und das Problem noch da, gilt es
    als noch nicht gemeldet – die Nachricht kommt noch einmal."""
    offen = {w.key for w in neu}
    return bisher - (set(abgelaufen) & offen)


def gemeldet_merken(neu: Iterable[Warnung], bisher: set[str], gemeldet: Iterable[Warnung]) -> set[str]:
    """Neues `bisher`: gemeldete Keys, solange ihr Problem noch besteht."""
    offen = {w.key for w in neu}
    return (bisher & offen) | {w.key for w in gemeldet}


def sichtbar(warnungen: Iterable[Warnung], stumm: Mapping[str, datetime], jetzt: datetime) -> list[Warnung]:
    """Warnungen für den Chip und „offen“ in der Einblendung (ohne stumme)."""
    return [w for w in warnungen if not ist_stumm(w.key, stumm, jetzt)]


def _zahl(x: float, stellen: int = 1) -> str:
    """Dezimalkomma, kaufmännisch gerundet wie `de()` im Mockup (toLocaleString), z. B. 4,25 → „4,3“."""
    q = Decimal(x).quantize(Decimal(1).scaleb(-stellen), rounding=ROUND_HALF_UP)
    return f"{q:f}".replace(".", ",")


def _grad(x: float) -> str:
    return _zahl(x, 0) if float(x).is_integer() else _zahl(x)


def _dauer_hand(stunden: float) -> str:
    if stunden >= 24:
        tage = int(stunden // 24)
        return f"{tage} {'Tag' if tage == 1 else 'Tagen'}"
    return f"{int(stunden)} h"


def titel(w: Warnung) -> str:
    """Kurztext einer Warnung wie im Mockup, z. B. „zu kalt: 17,8 °C statt 20 °C“."""
    v = w.werte
    name = v.get("name") or ""
    match w.art:
        case Art.OFFLINE:
            return "nicht erreichbar" if not name else f"{name} nicht erreichbar"
        case Art.BAUSTELLE_OFFLINE:
            return "nichts erreichbar – Stromausfall oder Internet weg?"
        case Art.TROCKENLAUF:
            return f"{name or 'Pumpe'} Trockenlauf: {_zahl(v.get('leistung') or 0, 0)} W"
        case Art.DAUERLAUF:
            return f"{name or 'Pumpe'} Dauerlauf {v.get('minuten', 0)} min"
        case Art.ZYKLEN_OFT:
            return f"Pumpe schaltet oft: {v.get('zyklen', 0)} Zyklen je Stunde"
        case Art.KEINE_LEISTUNG:
            return f"{name or 'Heizkörper'} zieht keinen Strom"
        case Art.SELBST_EIN:
            return f"{name or 'Gerät'} schaltet sich selbst wieder ein"
        case Art.NOTPROGRAMM:
            return f"{name or 'Plug'}: Notprogramm nicht bereit" + (f" ({v['fehler']})" if v.get("fehler") else "")
        case Art.FROSTGEFAHR:
            return f"Frostgefahr: {_zahl(v['temperatur'])} °C"
        case Art.ZU_KALT:
            return f"zu kalt: {_zahl(v['temperatur'])} °C statt {_grad(v['soll'])} °C"
        case Art.FUEHLER_FEHLT:
            if "batterie" in v:
                return f"{name}: Batterie schwach, {_zahl(v['batterie'], 0)} %" if name else f"Fühler-Batterie schwach: {_zahl(v['batterie'], 0)} %"
            return "Fühler meldet nichts"
        case Art.KEIN_WETTER:
            return "keine Wettervorhersage"
        case Art.HAND_ZU_LANGE:
            return f"{name or 'Gerät'} seit {_dauer_hand(v.get('stunden', 0))} auf Hand"
        case Art.TUER_OFFEN:
            return f"Tür seit {v.get('minuten', 0)} min offen – Heizung pausiert"
    return str(w.art)


def chip_text(
    warnungen: Iterable[Warnung], stumm: Mapping[str, datetime], jetzt: datetime, namen: Mapping[str, str]
) -> str | None:
    """Text des Warnung-Chips wie im Mockup; None, wenn nichts offen ist.

    Eine Warnung: „<Container>: <Titel>“ (ohne Container „Baustelle“). Mehrere: „2 Störungen · 1 Hinweis“.
    """
    offen = sichtbar(warnungen, stumm, jetzt)
    if not offen:
        return None
    if len(offen) == 1:
        w = offen[0]
        name = namen.get(w.bereich, w.bereich) if w.bereich else "Baustelle"
        return f"⚠ {name}: {titel(w)}"
    st = sum(1 for w in offen if w.stufe == Stufe.STOERUNG)
    hi = len(offen) - st
    teile = []
    if st:
        teile.append(f"{st} {'Störung' if st == 1 else 'Störungen'}")
    if hi:
        teile.append(f"{hi} {'Hinweis' if hi == 1 else 'Hinweise'}")
    return "⚠ " + " · ".join(teile)
