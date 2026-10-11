"""Funktion Heizung: Container nach Plan, Wetter und Bedarf heizen (Bauplan 0.7 §2, Bauplan Module §3).

Heizplan je Tag (`logik/arbeitszeit.tagesplan` mit Vor-/Nachheizen, Frühstart, Kleidung trocknen, „Noch früher“),
Heizgrenze, freie Tage, Soll je Container (`logik/regelung.soll_container`), Modus, Handbetrieb, Bedarf/Boost/„alle
jetzt heizen“, Termine der Bedarfs-Container aus `termine_kalender`, Tür offen, Frostschutz bei Automatik aus, Vorrang
in der Staffelung, Wetter-Entscheidung im Protokoll, Anzeige der Container, Warnungs-Zustände der Container und die
Zähler der Heizung (Heizzeit, Heiztage, mittlere Leistung, „ohne Automatik“, Aufheiz-/Abkühlrate, Hochrechnung auf die
Heizperiode). Geschaltet wird im Kern über die Staffelung: nur Heizkörper; Bautrockner zählen nur mit.

Aufgeteilt nach Zuständigkeit (BSM-023): Die Klasse hier hält den Zustand und die Schnittstelle (`funktionen/basis.py`)
und leitet weiter an `soll` (gleitendes Soll, Gefühl), `plan` (Heizplan, Termine, Warm ab, Soll je Minute), `lernregelung`
(lernende Regelung, Zusatz-Heizkörper), `bedarf` (Bedarf in °C), `hand` (nach dem Schalten, Handbetrieb), `anzeige`
(Warnungen, Anzeige, Status) und `zaehlen` (Zähler, Hochrechnung); Konstanten in `typen`.
"""

from __future__ import annotations

from datetime import date, datetime, timedelta
from typing import TYPE_CHECKING, Any

from homeassistant.util import dt as dt_util

from ...const import ART_CONTAINER, CONF_HEIZUNG, HEIZROLLEN, ROLLE_HEIZKOERPER, ZIEHT_STROM_W
from ...logik import bedarf as bedarf_logik, lernen, soll as soll_logik, stufen
from ...logik import prognose_merkmale, sensoren as sensor_logik, warnungen as warn_logik
from ...logik.arbeitszeit import HeizRegeln, Plan, WarmAb
from ...logik.regelung import LageContainer, Soll, SollGrund
from ..basis import Funktion, zeit
from . import (
    anzeige as h_anzeige,
    baseline as h_baseline,
    bedarf as h_bedarf,
    hand as h_hand,
    lernregelung as h_lernregelung,
    plan as h_plan,
    soll as h_soll,
    zaehlen as h_zaehlen,
)
from .typen import FRUEHER_MIN as FRUEHER_MIN, FRUEHSTART_NACHRICHT as FRUEHSTART_NACHRICHT
from .typen import MODI, MODUS_TEXT, STANDARD_HEIZ_KW

if TYPE_CHECKING:
    from collections.abc import Mapping, Sequence

    from ...logik.warnungen import Warnung
    from ...steuerung import BereichInfo, GeraetInfo, Steuerung, WetterWerte
    from ..basis import SollJeBereich


class Heizung(Funktion):
    """Heizkörper und Bautrockner in Containern."""

    name = "heizung"
    option = CONF_HEIZUNG
    standard = True
    arten = (ART_CONTAINER,)
    rollen = HEIZROLLEN
    schaltet = True
    braucht_wetter = True
    standard_kw = STANDARD_HEIZ_KW
    staffel_feld = "heiz_kw"

    def __init__(self, st: Steuerung) -> None:
        super().__init__(st)
        self.termine: list[dict[str, Any]] = []  # Termine der Bedarfs-Container (api-0.7 §1 `termine`)
        self.plaene: dict[str, Plan | None] = {}  # Heizplan je Container von heute (letzte Auswertung)
        # lernende Regelung (0.8): Anteil und erwarteter Nachlauf je Container (letzte Auswertung), Grund, Lern-Minute
        self.tpi_jetzt: dict[str, tuple[float, float]] = {}
        self._lern_grund: dict[str, str] = {}
        self._lern_minute: dict[str, int] = {}
        self._plan_cache: dict[tuple[date, bool, WarmAb | None], Plan | None] = {}
        self._zu_warm_vorher: bool | None = None
        # Knopf „Trotzdem heizen“: heizt trotz offener Tür, bis sie zu ist – im Store, übersteht Neustarts (Szenarien)
        self.tuer_trotzdem: set[str] = set()   # wird bei der ersten Auswertung aus dem Store geladen
        self._trotzdem_geladen = False
        self._frost: dict[str, bool] = {}
        self._tuer_pause: dict[str, bool] = {}   # war zuletzt wegen offener Tür pausiert
        self._grund_beim_heizen: dict[str, str | None] = {}   # Grund der letzten Minute, in der geheizt wurde (K innen)
        self.hochrechnung: dict[str, Any] | None = None   # letzte Hochrechnung mit Signatur (BSM-033.02, hochrechnung.py)
        self.hochrechnung_lauf = 0   # Nummer der zuletzt gestarteten Rechnung
        self._grund_letzte_minute: dict[str, str | None] = {}
        self._strom_jetzt: set[str] = set()   # AN-0011: Container, deren Heizkörper in diesem Zählschritt Strom ziehen
        self._unter_soll_seit: dict[str, datetime] = {}
        self._hand_phase: dict[str, bool] = {}
        self._phase: dict[str, tuple[bool, datetime, float]] = {}  # Bereich → (heizt, seit, Temperatur beim Beginn)
        self._ohne_w = 0.0  # je Zählschritt: Summe der mittleren Leistung („ohne Automatik“)
        self._heiztag = False
        # Zusatz-Heizkörper (AN-0006): darf er laufen (mit Grund), seit wann läuft der Hauptheizkörper (mit Temperatur)
        self._stufen: dict[str, tuple[bool, str | None]] = {}
        self._haupt_lauf: dict[str, tuple[datetime, float | None]] = {}
        self._zusatz_gelernt: dict[str, bool] = {}
        self._geschaetzt: dict[str, bool] = {}   # AN-0014: Aufheizzeit aus der Größe, noch nichts gelernt
        # Bedarf in °C für die Staffelung (Herbert 01.10.2026): Temperaturen der letzten Minuten, Heizzeit der letzten
        # Stunde, Zielzeit (Arbeitsbeginn bzw. „Soll erreicht … vorher“) und der zuletzt gerechnete Bedarf
        self._temp_punkte: dict[str, list[tuple[datetime, float]]] = {}
        self._heiz_punkte: dict[str, list[tuple[datetime, float]]] = {}
        self._warm_vor: dict[str, int] = {}
        self.bedarf_jetzt: dict[str, bedarf_logik.Bedarf] = {}
        self._abkuehl_zuletzt: dict[str, float] = {}   # zuletzt gemessene Abkühlung ohne Heizen (°C/h)
        self._aussen_minute: int | None = None

    # ------------------------------------------------------------------ Einstellungen je Container
    def modus(self, bid: str) -> str:
        """Modus eines Containers (neu 0.7.8): gesetzt oder wie bisher aus `auto`, `bedarf` und dem Fühler abgeleitet."""
        e = self.st.einstellungen.bereich(bid)
        if e.get("modus") in MODI:
            return str(e["modus"])
        if e["bedarf"]:
            return "bedarf"
        if not e["auto"]:
            return "hand"
        info = self.st.bereiche.get(bid)
        return "thermo" if info is not None and info.fuehler else "plan"

    def prognose_kontext(self, bid: str) -> tuple[str, str]:
        """Regelungsart und Konfigurations-ID eines Containers für die Prognose V2 (BSM-033.06, `logik/prognose_merkmale`)."""
        info = self.st.bereiche.get(bid)
        art = prognose_merkmale.regelungsart(self.modus(bid), bool(info is not None and info.fuehler))
        return art, prognose_merkmale.konfiguration_id(art, [(g.id, g.typ) for g in self.heizer_von(bid)])

    def soll_temperatur(self, bid: str) -> float:
        return h_soll.soll_temperatur(self, bid)

    # ------------------------------------------------------------------ Soll gleitend (logik/soll)
    def gleit_regeln(self) -> soll_logik.GleitRegeln:
        h = self.st.e["heizung"]
        return soll_logik.GleitRegeln(minimum=float(h.get("gleit_min", 21.0)), maximum=float(h.get("gleit_max", 24.0)),
                                      je_grad=float(h.get("gleit_je", 0.1)), bezug=float(h.get("gleit_bezug", 12.0)),
                                      tage=int(h.get("gleit_tage", 3)))

    def aussen_mittel(self, jetzt: datetime | None = None) -> float | None:
        return h_soll.aussen_mittel(self, jetzt)

    def gefuehl_liste(self) -> list[tuple[float, int]]:
        return [(float(x[1]), int(x[2])) for x in self.st.lz.get("gefuehl") or []]

    def gleit_info(self) -> dict[str, Any] | None:
        return h_soll.gleit_info(self)

    def gleit_anzeige(self) -> dict[str, Any] | None:
        return h_soll.gleit_anzeige(self)

    def soll_anzeige(self, bid: str) -> dict[str, Any]:
        """Soll eines Containers für die Seite (laufzeit.container.<id>.soll)."""
        b, h = self.st.einstellungen.bereich(bid), self.st.e["heizung"]
        v = (self.st.lz.get("soll_versch") or {}).get(bid)
        return {"wert": self.soll_temperatur(bid), "versch": self.versch(bid), "versch_bis": v[1] if v and self.versch(bid) else None,
                "eigen": round(float(b["soll"]) - float(h["soll"]), 2) if b.get("soll") is not None else None}

    def versch(self, bid: str) -> float:
        """+ / − am Rad (Soll gleitend): gilt bis morgen früh."""
        v = (self.st.lz.get("soll_versch") or {}).get(bid)
        bis = zeit(v[1]) if v else None
        return float(v[0]) if v and bis is not None and bis > dt_util.now() else 0.0

    def gefuehl_merken(self, bid: str, wert: int, jetzt: datetime) -> None:
        h_soll.gefuehl_merken(self, bid, wert, jetzt)

    def soll_verschieben(self, bid: str, d: float, jetzt: datetime) -> None:
        h_soll.soll_verschieben(self, bid, d, jetzt)

    def soll_versch_weg(self, bid: str) -> None:
        if (self.st.lz.get("soll_versch") or {}).pop(bid, None) is not None:
            self.st.protokoll("einstellung", bid, f"{self.st.bereiche[bid].name}: zurück auf gleitendes Soll")

    def _aussen_merken(self, jetzt: datetime, aussen: float | None) -> None:
        h_soll._aussen_merken(self, jetzt, aussen)

    def jetzt_bis(self, jetzt: datetime) -> datetime | None:
        bis = zeit(self.st.lz.get("jetzt_bis"))
        return bis if bis is not None and bis > jetzt else None

    def bis(self, art: str, bid: str, jetzt: datetime) -> datetime | None:
        bis = zeit(self.st.lz.setdefault(art, {}).get(bid))
        return bis if bis is not None and bis > jetzt else None

    def aufraeumen(self, jetzt: datetime) -> bool:
        return h_plan.aufraeumen(self, jetzt)

    def termin_fenster(self, bid: str) -> list[tuple[datetime, datetime, bool]]:
        return h_plan.termin_fenster(self, bid)

    # ------------------------------------------------------------------ Einrichtung und Kalender
    def entitaeten(self) -> set[str]:
        """Türen und Fenster der Container (BSM-034.03: jeder Kontakt pausiert)."""
        return {eid for b in self.bereiche() for eid in sensor_logik.kontakte(self.st.sensoren(b.id))}

    def kalender_neu(self, pfad: tuple[str, ...]) -> bool:
        # Termine gehören nur zu Bedarfs-Containern: nach dem Umstellen gleich neu zuordnen, nicht erst in 15 min
        return pfad[0] == "termine_kalender" or pfad[-1] == "bedarf"

    async def async_kalender(self, start: datetime, ende: datetime) -> None:
        await h_plan.async_kalender(self, start, ende)

    # ------------------------------------------------------------------ Plan
    def heiz_regeln(self) -> HeizRegeln:
        h = self.st.e["heizung"]
        return HeizRegeln(
            vorheizen_min=int(h["vorheizen_min"]), nachheizen_min=int(h["nachheizen_min"]),
            fruehstart=bool(h["fruehstart"]), fruehstart_unter=float(h["fruehstart_unter"]),
            fruehstart_min=int(h["fruehstart_min"]), trocknen_ab_mm=float(h["trocknen_ab_mm"]),
            trocknen_laenger_min=int(h["trocknen_laenger_min"]), trocknen_frueher_min=int(h["trocknen_frueher_min"]),
        )

    def ist_frei(self, tag: date) -> bool:
        """Urlaub immer, Feiertag nur mit „Feiertage frei“."""
        art = self.st.frei_art(tag)
        return art == "urlaub" or (art == "feiertag" and bool(self.st.e["heizung"]["feiertag_frei"]))

    def plan(self, tag: date, trocknen: bool, warm: WarmAb | None = None) -> Plan | None:
        return h_plan.plan(self, tag, trocknen, warm)

    def plan_bereich(self, tag: date, bid: str, jetzt: datetime | None = None) -> Plan | None:
        """Heizplan eines Containers: mit „Warm ab“, wenn er lernt (AN-0004), sonst der Plan der Baustelle."""
        e = self.st.einstellungen.bereich(bid)
        return self.plan(tag, bool(e["trocknen"]), self.warm_ab(bid, tag, jetzt or dt_util.now()))

    # ------------------------------------------------------------------ Warm ab (AN-0004, Optimum Start)
    def warm_ab(self, bid: str, tag: date, jetzt: datetime) -> WarmAb | None:
        return h_plan.warm_ab(self, bid, tag, jetzt)

    def _warm_festhalten(self, bid: str, warm: WarmAb | None, plan: Plan | None, heute: date, minute: int) -> None:
        h_plan._warm_festhalten(self, bid, warm, plan, heute, minute)

    def plan_neu(self) -> None:
        """Nach einer Änderung an Arbeitszeit, Ausnahmen oder „Noch früher“ neu rechnen."""
        self._plan_cache.clear()

    def zu_warm(self, wetter: WetterWerte) -> bool:
        return h_plan.zu_warm(self, wetter)

    # ------------------------------------------------------------------ Soll
    def soll(self, jetzt: datetime, wetter: WetterWerte) -> SollJeBereich:
        return h_plan.soll(self, jetzt, wetter)

    def trotzdem_merken(self) -> None:
        """„Trotzdem heizen“ im Store festhalten (übersteht einen Neustart)."""
        self.st.lz["tuer_trotzdem"] = sorted(self.tuer_trotzdem)
        self.st.einstellungen.speichern()

    def temperatur_gehalten(self, bid: str, fuehler: str | None, jetzt: datetime) -> float | None:
        return h_plan.temperatur_gehalten(self, bid, fuehler, jetzt)

    # ------------------------------------------------------------------ Zusatz-Heizkörper (AN-0006, logik/stufen)
    def heizer_von(self, bid: str) -> list[GeraetInfo]:
        """Aktive Heizkörper eines Containers in fester Reihenfolge."""
        return [g for g in self.st.geraete_in(bid) if g.rolle == ROLLE_HEIZKOERPER and self.st.geraet_aktiv(g)]

    def haupt_und_zusatz(self, bid: str) -> tuple[list[str], list[str]]:
        heizer = self.heizer_von(bid)
        markiert = {g.id for g in heizer if (self.st.e.get("geraete") or {}).get(g.id, {}).get("zusatz")}
        return stufen.haupt_und_zusatz([g.id for g in heizer], markiert)

    def stufen_an(self, bid: str) -> bool:
        """„Zusatz nur bei Bedarf“ eingeschaltet und mindestens zwei aktive Heizkörper."""
        return bool(self.st.einstellungen.bereich(bid).get("stufen")) and len(self.heizer_von(bid)) >= 2

    def stufen_regeln(self) -> stufen.StufenRegeln:
        h = self.st.e["heizung"]
        return stufen.StufenRegeln(abstand=float(h.get("stufen_abstand", 1.5)), laufzeit_min=int(h.get("stufen_min", 30)),
                                   min_anstieg=float(h.get("stufen_anstieg", 0.3)), kalt_unter=float(h.get("stufen_kalt", -5.0)))

    def _stufen_rechnen(self, bid: str, soll: Soll, temp: float | None, soll_t: float, wetter: WetterWerte, jetzt: datetime,
                        plan: Plan | None, minute: int, warm: WarmAb | None = None) -> None:
        h_lernregelung._stufen_rechnen(self, bid, soll, temp, soll_t, wetter, jetzt, plan, minute, warm)

    def geraet_ein(self, g: GeraetInfo, soll: Soll) -> bool | None:
        """Zusatz-Heizkörper bleibt aus, solange einer reicht (AN-0006); sonst wie der Container. Baseline-Lauf: alle an."""
        if soll.grund == SollGrund.BASELINE:
            return True
        if soll.ein and g.rolle == ROLLE_HEIZKOERPER and self.stufen_an(g.bereich) and g.id in self.haupt_und_zusatz(g.bereich)[1]:
            return self._stufen.get(g.bereich, (False, None))[0]
        return soll.ein

    def stufen_anzeige(self, bid: str) -> dict[str, Any] | None:
        return h_lernregelung.stufen_anzeige(self, bid)

    # ------------------------------------------------------------------ Lernende Regelung (0.8, logik/lernen)
    @property
    def lern_staende(self) -> dict[str, Any]:
        staende: dict[str, Any] = self.st.lz.setdefault("lernen", {})
        return staende

    def _lern_art(self, bid: str) -> str:
        return h_lernregelung._lern_art(self, bid)

    def _tpi(self, info: BereichInfo, e: Mapping[str, Any], temp: float | None, soll_t: float, wetter: WetterWerte,
             jetzt: datetime) -> lernen.Tpi | None:
        return h_lernregelung._tpi(self, info, e, temp, soll_t, wetter, jetzt)

    def _lernen(self, jetzt: datetime, wetter: WetterWerte) -> None:
        h_lernregelung._lernen(self, jetzt, wetter)

    def _tuer_offen(self, bid: str) -> bool:
        """Eine Tür oder ein Fenster des Containers offen (WU-0009: schützt das Lernen; BSM-034.03)."""
        return self.st.kontakt_offen_seit(bid) is not None

    def lern_anzeige(self, bid: str) -> dict[str, Any] | None:
        return h_lernregelung.lern_anzeige(self, bid)

    def warm_anzeige(self, bid: str) -> dict[str, Any] | None:
        return h_lernregelung.warm_anzeige(self, bid)

    # ------------------------------------------------------------------ Staffelung und Schalten
    def schaltbar(self, g: GeraetInfo) -> bool:
        """Geschaltet werden nur Heizkörper (Mockup „geschaltet werden nur Heizungen“)."""
        return g.rolle == ROLLE_HEIZKOERPER

    def staffel_vorrang(self, soll: tuple[Soll, LageContainer], schaltet: bool, bereich: str = "") -> dict[str, Any]:
        """Frostschutz und Boost zuerst, dann der Bedarf in °C in 15 min (logik/bedarf)."""
        s, lage = soll
        b = self.bedarf(bereich, lage)
        return {
            "frost": schaltet and s.grund == SollGrund.FROST,
            "boost": schaltet and s.grund == SollGrund.BOOST,
            "defizit": b.summe if b is not None else None,
        }

    def bedarf(self, bid: str, lage: LageContainer, jetzt: datetime | None = None) -> bedarf_logik.Bedarf | None:
        return h_bedarf.bedarf(self, bid, lage, jetzt)

    def _aufheiz_rate(self, bid: str) -> float | None:
        return h_bedarf._aufheiz_rate(self, bid)

    def _heiz_min(self, bid: str, jetzt: datetime) -> float:
        return sum(m for t, m in self._heiz_punkte.get(bid, []) if (jetzt - t).total_seconds() <= 3600)

    def _gerecht(self, bid: str, jetzt: datetime) -> float:
        return h_bedarf._gerecht(self, bid, jetzt)

    def bedarf_anzeige(self, bid: str) -> dict[str, Any] | None:
        return h_bedarf.bedarf_anzeige(self, bid)

    def schaltet_ohne_automatik(self) -> bool:
        """„Frostschutz auch bei Automatik aus“: `soll` will dann nur Frost-Container schalten."""
        return bool(self.st.e["heizung"].get("frost_immer"))

    def nach_schalten(self, jetzt: datetime, wetter: WetterWerte) -> None:
        h_hand.nach_schalten(self, jetzt, wetter)
        h_baseline.takt(self, jetzt)   # BSM-033.04: Baseline-Läufe planen, starten, abbrechen

    # ------------------------------------------------------------------ Hand
    def nach_soll(self, soll: SollJeBereich) -> None:
        h_hand.nach_soll(self, soll)

    def hand_setzen(self, g: GeraetInfo, an: bool) -> bool:
        return h_hand.hand_setzen(self, g, an)

    def hand_seit(self, g: GeraetInfo) -> datetime | None:
        return zeit(self.st.lz["hand"].get(g.id))

    def hand_nach_einstellung(self, pfad: Sequence[str]) -> None:
        h_hand.hand_nach_einstellung(self, pfad)

    def hand_beenden(self, gid: str, grund: str = "") -> None:
        h_hand.hand_beenden(self, gid, grund)

    # ------------------------------------------------------------------ Warnungen
    def geraet_warnung(
        self, g: GeraetInfo, erreichbar: bool, leistung: float | None, jetzt: datetime
    ) -> tuple[warn_logik.Typ, datetime | None, int]:
        return (warn_logik.Typ.HEIZUNG if g.rolle == ROLLE_HEIZKOERPER else warn_logik.Typ.SONST), None, 0

    def warn_einstellungen(self) -> Mapping[str, Any]:
        heizung: Mapping[str, Any] = self.st.e["heizung"]  # Frostschutz, Tür offen
        return heizung

    def warnung_protokoll(self, w: Warnung) -> tuple[str, str] | None:
        if w.art == warn_logik.Art.TUER_OFFEN:
            return ("schalten", "Tür offen – Heizung pausiert") if w.werte.get("pausiert", True) else ("warnung", "Tür offen")
        return None

    def warnungen(self, jetzt: datetime, soll: SollJeBereich) -> list[warn_logik.ContainerZustand]:
        return h_anzeige.warnungen(self, jetzt, soll)

    # ------------------------------------------------------------------ Anzeige
    def anzeige(
        self, bid: str, info: BereichInfo, jetzt: datetime, soll: SollJeBereich, offline: bool, an: bool
    ) -> tuple[str, str, str]:
        return h_anzeige.anzeige(self, bid, info, jetzt, soll, offline, an)

    def zieht_w(self) -> float:
        """Ab so viel W „heizt“ ein Heizkörper tatsächlich (Einstellung, AN-0012; Standard ZIEHT_STROM_W)."""
        return float(self.st.e["heizung"].get("zieht_strom_w", ZIEHT_STROM_W))

    def _zieht_strom(self, g: GeraetInfo) -> bool:
        return h_anzeige._zieht_strom(self, g)

    def _termin_ende(self, bid: str, jetzt: datetime) -> datetime | None:
        for von, bis, _ in self.termin_fenster(bid):
            if von - timedelta(minutes=int(self.st.e["heizung"]["vorheizen_min"])) <= jetzt < bis:
                return bis
        return None

    def _naechster_start(self, jetzt: datetime, bid: str) -> str | None:
        return h_anzeige._naechster_start(self, jetzt, bid)

    # ------------------------------------------------------------------ Status und Protokoll
    def status(self, jetzt: datetime) -> tuple[str, str, datetime | None] | None:
        return h_anzeige.status(self, jetzt)

    def einstellung_text(self, pfad: tuple[str, ...], wert: Any) -> str | None:
        if pfad[0] == "bereiche" and pfad[-1] == "modus":
            return f"Modus: {MODUS_TEXT.get(wert, wert)}"
        return None

    # ------------------------------------------------------------------ Zählen
    def zaehlen_geraet(self, g: GeraetInfo, an: bool, leistung: float | None, stunden: float) -> bool:
        return h_zaehlen.zaehlen_geraet(self, g, an, leistung, stunden)

    def zaehlen_bereich(self, bid: str, heizt: bool, jetzt: datetime, stunden: float) -> None:
        h_zaehlen.zaehlen_bereich(self, bid, heizt, jetzt, stunden)

    def energie_buchen(self, g: GeraetInfo, kwh: float) -> None:
        h_zaehlen.energie_buchen(self, g, kwh)

    def energie_ausbuchen(self, g: GeraetInfo, kwh: float) -> None:
        h_zaehlen.energie_ausbuchen(self, g, kwh)

    def vergleichbar(self, bid: str) -> bool:
        """Zählt der Container gerade für den fairen Vergleich Ölradiator/Konvektor (AN-0008)? Mit Fühler, im Modus
        Thermostat und nur ein Heizkörper-Typ."""
        info = self.st.bereiche.get(bid)
        if info is None or info.art != ART_CONTAINER or not info.fuehler or self.modus(bid) != "thermo":
            return False
        return len({g.typ for g in self.heizer_von(bid)}) == 1

    def zaehlen_ende(self, jetzt: datetime, stunden: float) -> None:
        h_zaehlen.zaehlen_ende(self, jetzt, stunden)

    def _temperaturverhalten(self, bid: str, heizt: bool, jetzt: datetime, stunden: float) -> None:
        h_zaehlen._temperaturverhalten(self, bid, heizt, jetzt, stunden)

    def ersparnis_kwh(self) -> float:
        """Was 24-h-Dauerbetrieb mehr verbraucht hätte als tatsächlich geheizt wurde."""
        z = self.st.zaehler
        return max(0.0, float(z.get("ohne", 0.0)) - float(z.get("energie_heizen", 0.0)))

    def mittel_typ(self, typ: str) -> float | None:
        return h_zaehlen.mittel_typ(self, typ)

    def hochrechnung_heizperiode(self, key: str) -> float | None:
        return h_zaehlen.hochrechnung_heizperiode(self, key)


