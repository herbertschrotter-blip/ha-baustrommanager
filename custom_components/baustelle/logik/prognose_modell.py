"""Prognose V2: Energie je Intervall, neun Szenarien, additive Aggregation und Vergleich (Bauvorlage CGR-2026-10-11-
hochrechnung r5 §8.2, §8.4) – ohne HA-Code.

Lieferung P4a (BSM-033.09), nur stationär (C, tau und `rc_schritt` kommen mit P4b):

- `szenarien`: neun ganze Läufe = Parametersätze unten/Mitte/oben (H mit, H ohne, T_max, Frostziel Grenze/Mitte/Aus –
  gepaart, nie frei kombiniert) × Klimadelta −/0/+ `winter_delta_k`. Zentral ist `ZENTRAL` (Mitte, Delta 0).
- `berechne_mit`: thermo E = min(P, H·max(0, Ziel − außen))·dt über die erlaubten Freigaben, Kapazität ΣP·dt nur dort.
  Unbekannter oder kalter Start (> `tagesfit_start_max_k`): Mitte = Haltebedarf, Obergrenze = Kapazität des ganzen
  Blocks (`aufheizen_unmodelliert`). Relevanter Frost (nicht validiert): Haltemitte, unten 0, oben Bereitschafts-
  kapazität. Planmodus: Duty × Kapazität, Band 0…Kapazität, unter `tagesfit_tage_min` Tagen Mitte None. Ohne Fühler
  Frost nach der Außen-Hysterese, unbekannter Anfangszustand = beide Zustände eingehüllt. Fehlende Leistungsreferenz →
  Kapazität None, kein geratener Deckel. Unbekannte Mitte: unten 0 (physikalisch), oben Kapazität (falls bekannt).
- `berechne_ohne`: Gegenmodell aus Baseline-Plateaus rund um die Uhr, min(P, H_ohne·max(0, T_max − außen))·dt; fehlt es
  (Methode keine oder Evidenz A) → None (kein Ersatz aus dem alten Ohne-Zähler). Stationär: kein tägliches Warm-up.
- `Aggregat`/`aggregiere`: Summen vor Rundung je Zeitraum, Lauf, Seite und Container in einem Durchgang (Läufe können
  nacheinander kommen – wenig Speicher). Mitte aus dem zentralen Lauf, Band = min/max über die ganzen Läufe (Σunten bzw.
  Σoben je Lauf, nie Σmin). „mit“ = Ist bis `gemessen_bis` + Modell nur danach (anteilig je Intervall, das Modell ist
  im Intervall konstant); „ohne“ = Modell über den ganzen Zeitraum. Gespart je Lauf, Strukturband min(L_ohne − U_mit) …
  max(U_ohne − L_mit), negative Werte bleiben. Fehlender Container → Mitte None, Teilsumme und fehlende IDs. Baseline-Ist
  im Zeitraum → nicht vergleichbar. Reine Haltemitte → keine Punktmitte der Ersparnis. € zeitgenau Σ E·Preis, fehlender
  Preis → None. Prozent nur bei vollständigem, positivem „ohne“.
"""

from __future__ import annotations

from bisect import bisect_left, bisect_right
from collections import defaultdict
from collections.abc import Callable, Iterable, Mapping, Sequence
from dataclasses import dataclass
from datetime import UTC, date, datetime, time, timedelta
from zoneinfo import ZoneInfo

from .baseline import Lauf
from .prognose_regeln import PrognoseRegeln
from .prognose_stufe import evidenz_mit, evidenz_ohne, extrapoliert, kappen, stufe_gesamt, stufe_gespart
from .prognose_typen import (
    Anfangszustand,
    DutySchaetzung,
    EnergieIntervall,
    HSchaetzung,
    Intervall,
    IstIntervall,
    MitteArt,
    OhneSchaetzung,
    ParameterSatz,
    PlanIntervall,
    PlanTag,
    Regelungsart,
    PreisIntervall,
    PrognoseAuftrag,
    StufenErgebnis,
    Szenario,
    SzenarioLauf,
    Validierung,
    VergleichErgebnis,
    ZeitraumErgebnis,
)
from .prognose_wetter import frost_relevant, ohne_intervalle, planen, wetterreihe
from .regelung import FROST_SPANNE, SollGrund

ZENTRAL = "p1w1"
EPS = 1e-9


def szenario_id(p: int, w: int) -> str:
    return f"p{p}w{w}"


# ---------------------------------------------------------------------- Szenarien
def szenarien(
    mit: HSchaetzung | DutySchaetzung, ohne: OhneSchaetzung, dynamik_mit: object | None, dynamik_ohne: object | None,
    regeln: PrognoseRegeln, *, frost_grenze_c: float = 5.0, frost_aus_c: float = 7.0,
) -> tuple[Szenario, ...]:
    """Neun ganze Läufe: Parametersatz (unten/Mitte/oben, gepaart) × Klimadelta (−/0/+). Dynamik (P4b) bleibt None."""
    del dynamik_mit, dynamik_ohne   # P4b
    hm: tuple[float | None, ...] = (None, None, None)
    if isinstance(mit, HSchaetzung) and mit.h_kw_k is not None:
        hm = (mit.h_unten_kw_k, mit.h_kw_k, mit.h_oben_kw_k)
    ho: tuple[float | None, ...] = (None, None, None)
    tm: tuple[float | None, ...] = (None, None, None)
    if ohne.h is not None and ohne.h.h_kw_k is not None:
        ho = (ohne.h.h_unten_kw_k, ohne.h.h_kw_k, ohne.h.h_oben_kw_k)
    if ohne.t_max_c is not None:
        tm = (ohne.t_max_unten_c, ohne.t_max_c, ohne.t_max_oben_c)
    fz = (frost_grenze_c, (frost_grenze_c + frost_aus_c) / 2, frost_aus_c)
    deltas = (-regeln.winter_delta_k, 0.0, regeln.winter_delta_k)
    return tuple(Szenario(szenario_id(p, w), deltas[w], ParameterSatz(p, hm[p], ho[p], tm[p], fz[p], None, None))
                 for p in range(3) for w in range(3))


# ---------------------------------------------------------------------- mit Automatik
def startdefizit(iv: PlanIntervall, anfang: Anfangszustand | None) -> float | None:
    """Startdefizit am ersten Intervall eines Blocks: geplant bekannt, sonst – läuft der Block schon am Beginn – aus dem
    gemessenen Anfangszustand; sonst unbekannt."""
    if iv.startdefizit_k is not None:
        return iv.startdefizit_k
    if ("start_vorher" in iv.gruende and anfang is not None and anfang.beleg == "gemessen" and anfang.innen_c is not None
            and iv.ziel_c is not None):
        return max(0.0, iv.ziel_c - anfang.innen_c)
    return None


def episoden_unmodelliert(plan: Sequence[PlanIntervall], anfang: Anfangszustand | None, regeln: PrognoseRegeln) -> set[str]:
    """Thermo-Blöcke mit unbekanntem oder kaltem Start (> `tagesfit_start_max_k`): Aufheizen nicht modelliert. Läuft ein
    Block zum Zeitpunkt des gemessenen Anfangszustands schon, zählt für ihn das gemessene Defizit von dann."""
    aus: set[str] = set()
    erste: dict[str, PlanIntervall] = {}
    ende: dict[str, datetime] = {}
    for iv in plan:
        if iv.episode_id is None or iv.regelungsart != "thermo":
            continue
        erste.setdefault(iv.episode_id, iv)
        ende[iv.episode_id] = iv.zeit.bis
    for eid, iv in erste.items():
        d = startdefizit(iv, anfang)
        if (d is None and anfang is not None and anfang.beleg == "gemessen" and anfang.innen_c is not None
                and iv.ziel_c is not None and iv.zeit.von < anfang.zeit < ende[eid]):
            d = max(0.0, iv.ziel_c - anfang.innen_c)   # läuft schon: der Rest ab der Messung, davor ist Ist
        if d is None or d > regeln.tagesfit_start_max_k:
            aus.add(eid)
    return aus


def _frost_zustaende(plan: Sequence[PlanIntervall], anfang: Anfangszustand | None) -> list[str]:
    """Ohne Fühler: Frostschutz nach der Außen-Hysterese (ein unter `frost_aussen`, aus ab `frost_aussen` + Spanne).
    Unbekannter Anfangszustand → beide Verläufe; je Intervall „ein“, „aus“ oder „unbekannt“ (sie gehen auseinander)."""
    start = anfang.frost_ein if anfang is not None else None
    zustaende = [start] if start is not None else [False, True]
    aus = []
    for iv in plan:
        if not iv.frost_bereit or iv.fuehler or iv.frost_aussen_c is None:
            zustaende = [False] * len(zustaende)   # außerhalb der Bereitschaft endet der Frostschutz
            aus.append("aus")
            continue
        neu = []
        for z in zustaende:
            grenze = iv.frost_aussen_c + (FROST_SPANNE if z else 0.0)
            neu.append(iv.aussen_c < grenze)
        zustaende = neu
        aus.append("ein" if all(zustaende) else "aus" if not any(zustaende) else "unbekannt")
    return aus


HERKUNFT_CODES = ("ersatzpfad", "kontext_rekonstruiert", "ersatz")   # Evidenz aus Altdaten → Hinweis in der Anzeige


def _herkunft(modell: HSchaetzung | DutySchaetzung) -> tuple[str, ...]:
    """Herkunftscodes der Evidenz (Ersatzpfad, rekonstruierter Kontext), die jedes Intervall weitertragen soll."""
    gruende = modell.evidenz.gruende if isinstance(modell, HSchaetzung) else modell.gruende
    return tuple(g for g in gruende if g in HERKUNFT_CODES)


def _dauer_h(iv: PlanIntervall) -> float:
    return (iv.zeit.bis - iv.zeit.von).total_seconds() / 3600


_CODES: dict[tuple[str, ...], tuple[str, ...]] = {}


def _codes(*gruende: str) -> tuple[str, ...]:
    """Gründe ohne Leere und Doppelte – gleiche Tupel werden geteilt (viele Intervalle)."""
    if (t := _CODES.get(gruende)) is None:
        t = _CODES[gruende] = tuple(dict.fromkeys(g for g in gruende if g))
    return t


def stufen_mit(plan: Sequence[PlanIntervall], modell: HSchaetzung | DutySchaetzung, validierung: Validierung | None,
               dynamik: object | None, anfang: Anfangszustand | None, regeln: PrognoseRegeln) -> list[StufenErgebnis]:
    """Prognosestufe je Intervall (für `prognose_stufe.stufe_mit`)."""
    h = modell.h_kw_k if isinstance(modell, HSchaetzung) else None
    return [e.stufe for e in berechne_mit(plan, modell, ParameterSatz(1, h, None, None, 0.0, None, None), anfang,
                                          regeln, validierung=validierung, dynamik=dynamik)]


def berechne_mit(
    plan: Sequence[PlanIntervall], modell: HSchaetzung | DutySchaetzung, parameter: ParameterSatz,
    anfang: Anfangszustand | None, regeln: PrognoseRegeln, *, validierung: Validierung | None = None,
    dynamik: object | None = None,
) -> tuple[EnergieIntervall, ...]:
    """Energie „mit Automatik“ je Plan-Intervall eines Containers (siehe Modul)."""
    duty_modell = isinstance(modell, DutySchaetzung)
    evidenz = evidenz_mit(modell, validierung, regeln)
    methode = "duty" if duty_modell else modell.methode   # type: ignore[union-attr]
    ev = None if duty_modell else modell.evidenz   # type: ignore[union-attr]
    h = parameter.h_mit_kw_k if not duty_modell and evidenz != "A" else None
    d = modell.duty if duty_modell and evidenz != "A" else None   # type: ignore[union-attr]
    herkunft = _herkunft(modell)
    unmod = episoden_unmodelliert(plan, anfang, regeln)
    frost = _frost_zustaende(plan, anfang)
    frost_validiert = dynamik is not None and bool(getattr(dynamik, "frost_freigegeben", False))
    aus: list[EnergieIntervall] = []
    for iv, fz in zip(plan, frost, strict=True):
        dt = _dauer_h(iv)
        p = iv.p_max_kw
        kap = p * dt if p is not None else None
        mitte: float | None = 0.0
        unten: float | None = 0.0
        oben: float | None = 0.0
        halte: float | None = None
        art: MitteArt = "verbrauch"
        gr: list[str] = []
        start_unb = frost_unv = extra = False
        if kap is None:
            gr.append("p_ref_fehlt")
        if iv.regulaer_freigegeben:
            if iv.regelungsart == "thermo" and not duty_modell:
                if h is None or iv.ziel_c is None:
                    mitte, unten, oben, art = None, 0.0, kap, "keine"
                    gr.append("kein_modell")
                else:
                    roh = h * max(0.0, iv.ziel_c - iv.aussen_c) * dt
                    e = min(roh, kap) if kap is not None else roh
                    if kap is not None and roh > kap + EPS:
                        gr.append("leistung_limitiert")
                    extra = extrapoliert(ev, iv.ziel_c - iv.aussen_c, iv.ziel_c, regeln)
                    halte = mitte = unten = oben = e
                    if iv.episode_id in unmod:
                        oben = max(e, kap) if kap is not None else None
                        art, start_unb = "haltebedarf", True
                        gr.append("aufheizen_unmodelliert")
            else:
                unten, oben = 0.0, kap
                if d is None or kap is None:
                    mitte, art = None, "keine"
                    gr.append("kein_modell")
                else:
                    mitte, art = d * kap, "duty"
                gr.append("witterung_unmodelliert")
        elif iv.frost_bereit and (fz != "aus" if not iv.fuehler else frost_relevant(iv)):
            frost_unv = not frost_validiert
            unten, oben, art = 0.0, kap, "haltebedarf"
            gr.append("frost_unvalidiert")
            if iv.fuehler and iv.regelungsart == "thermo" and not duty_modell:
                if h is None:
                    mitte, art = None, "keine"
                    gr.append("kein_modell")
                else:
                    roh = h * max(0.0, parameter.frost_ziel_c - iv.aussen_c) * dt
                    halte = mitte = min(roh, kap) if kap is not None else roh
            elif not iv.fuehler and d is not None and kap is not None:
                mitte = d * kap * (1.0 if fz == "ein" else 0.5)   # unbekannter Zustand: Mitte der Hülle
                if fz == "unbekannt":
                    gr.append("frost_zustand_unbekannt")
            else:
                mitte, art = None, "keine"
                gr.append("frost_unmodelliert")
        elif iv.grund == SollGrund.HAND:
            mitte, unten, oben, art = None, 0.0, kap, "keine"   # Handbetrieb: die Automatik schaltet nicht
            gr.append("hand")
        aus.append(EnergieIntervall(
            zeit=iv.zeit, bereich_id=iv.bereich_id, mitte_kwh=mitte, unten_kwh=unten, oben_kwh=oben,
            haltebedarf_kwh=halte, kapazitaet_kwh=kap if (iv.regulaer_freigegeben or iv.frost_bereit) else 0.0,
            mitte_art=art,
            stufe=kappen(evidenz, methode, start_unbekannt=start_unb, frost_unvalidiert=frost_unv, extrapolation=extra,
                         duty=duty_modell or iv.regelungsart == "plan"),
            gruende=_codes(*herkunft, *gr)))
    return tuple(aus)


# ---------------------------------------------------------------------- ohne Automatik (Gegenmodell)
def berechne_ohne(
    plan: Sequence[PlanIntervall], modell: OhneSchaetzung, parameter: ParameterSatz, anfang: Anfangszustand | None,
    regeln: PrognoseRegeln,
) -> tuple[EnergieIntervall, ...]:
    """Energie „ohne Automatik“ je Intervall (rund um die Uhr, Thermostat am Gerät bei T_max)."""
    del anfang   # stationär: kein Zustand, kein tägliches Warm-up (Regression 10)
    evidenz = evidenz_ohne(modell, regeln)
    h, t = parameter.h_ohne_kw_k, parameter.t_max_c
    ok = modell.methode == "plateau" and evidenz != "A" and h is not None and t is not None
    hinweis = "thermostat_angenommen" if modell.thermostat_nachweis == "angenommen" else ""
    herkunft = _herkunft(modell.h) if modell.h is not None else ()
    ev = modell.h.evidenz if modell.h is not None else None
    aus = []
    for iv in plan:
        dt = _dauer_h(iv)
        kap = iv.p_max_kw * dt if iv.p_max_kw is not None else None
        if not ok:
            aus.append(EnergieIntervall(iv.zeit, iv.bereich_id, None, None, None, None, kap, "keine",
                                        kappen("A", modell.methode), ("kein_gegenmodell",)))
            continue
        assert h is not None and t is not None
        roh = h * max(0.0, t - iv.aussen_c) * dt
        e = min(roh, kap) if kap is not None else roh
        extra = extrapoliert(ev, t - iv.aussen_c, None, regeln)
        aus.append(EnergieIntervall(
            iv.zeit, iv.bereich_id, e, e, e, e, kap, "verbrauch", kappen(evidenz, modell.methode, extrapolation=extra),
            _codes(*herkunft, hinweis, "" if kap is not None else "p_ref_fehlt",
                   "leistung_limitiert" if kap is not None and roh > kap + EPS else "")))
    return tuple(aus)


# ---------------------------------------------------------------------- Aggregation
@dataclass(frozen=True)
class EuroSumme:
    """€ einer Seite: Mitte und Band aus denselben Läufen wie die kWh; None ohne Preis oder ohne Mitte."""

    mitte: float | None
    unten: float | None
    oben: float | None


class _Summe:
    """Summen eines Containers in einem Zeitraum, einem Lauf und einer Seite (Modellanteil)."""

    __slots__ = ("dauer", "em", "eo", "eu", "m", "nm", "no", "np", "nu", "o", "u")

    def __init__(self) -> None:
        self.m = self.u = self.o = self.em = self.eu = self.eo = self.dauer = 0.0
        self.nm = self.nu = self.no = self.np = False


class _Zentral:
    """Was nur der zentrale Lauf braucht: Art der Mitte, Stufen, Gründe."""

    __slots__ = ("arten", "gruende", "stufen")

    def __init__(self) -> None:
        self.arten: set[str] = set()
        self.stufen: dict[StufenErgebnis, None] = {}
        self.gruende: dict[str, None] = {}


class _Ist:
    __slots__ = ("baseline", "dauer", "eur", "kwh", "np", "sonder", "unvollstaendig")

    def __init__(self) -> None:
        self.kwh = self.eur = self.baseline = self.dauer = 0.0
        self.sonder: float | None = 0.0
        self.unvollstaendig = self.np = False


def _schichten(zeitraeume: Sequence[Intervall]) -> list[list[int]]:
    """Zeiträume in Schichten ohne Überlappung (je Schicht nach Beginn sortiert) – Suche je Intervall mit bisect."""
    schichten: list[list[int]] = []
    for i in sorted(range(len(zeitraeume)), key=lambda k: (zeitraeume[k].von, zeitraeume[k].bis)):
        for s in schichten:
            if zeitraeume[s[-1]].bis <= zeitraeume[i].von:
                s.append(i)
                break
        else:
            schichten.append([i])
    return schichten


def preis_fn(preise: Sequence[PreisIntervall]) -> Callable[[datetime], float | None]:
    """Preis zum Zeitpunkt (Preisintervalle, halboffen); außerhalb → None."""
    liste = sorted(preise, key=lambda p: p.zeit.von)
    starts = [p.zeit.von for p in liste]

    def preis(t: datetime) -> float | None:
        i = bisect_right(starts, t) - 1
        return liste[i].eur_kwh if i >= 0 and t < liste[i].zeit.bis else None
    return preis


def _art(arten: set[str]) -> MitteArt:
    for a in ("keine", "haltebedarf", "duty"):
        if a in arten:
            return a
    return "verbrauch"


GEMESSEN = StufenErgebnis("D", "D", "gemessen", False, ())   # Zeitraum nur aus Messungen
FEHLT = StufenErgebnis("A", "A", "keine", False, ("fehlende_modelle",))
# Messlücke im Ist: nie D, nie „gemessen“ – der belegte Teil bleibt als Wert, höchstens C
LUECKE = StufenErgebnis("C", "C", "gemessen_luecke", False, ("messluecke",))


class Aggregat:
    """Summen je Zeitraum in einem Durchgang über die Läufe (siehe Modul); `vergleich(i)`, `euro(i)`."""

    def __init__(self, zeitraeume: Sequence[Intervall], gemessen_bis: datetime, bereich_ids: Sequence[str],
                 preise: Sequence[PreisIntervall] = (), zentral: str = ZENTRAL) -> None:
        self.zeitraeume = tuple(zeitraeume)
        self.gemessen_bis = gemessen_bis
        self.bereiche = tuple(dict.fromkeys(bereich_ids))
        self.preis = preis_fn(preise)
        self.zentral = zentral
        self._schichten = _schichten(self.zeitraeume)
        self._starts = [[self.zeitraeume[i].von for i in s] for s in self._schichten]
        self.laeufe: list[str] = []
        # (seite, lauf, zeitraum, bereich) → _Summe ; (seite, zeitraum, bereich) → _Zentral
        self._s: dict[tuple[str, str, int, str], _Summe] = defaultdict(_Summe)
        self._z: dict[tuple[str, int, str], _Zentral] = defaultdict(_Zentral)
        self._ist: dict[tuple[int, str], _Ist] = defaultdict(_Ist)
        self._cache: dict[tuple[datetime, datetime, datetime], list[tuple[int, float, float]]] = {}
        self._preis_cache: dict[datetime, float | None | bool] = {}

    def _treffer(self, von: datetime, bis: datetime) -> Iterable[int]:
        for s, starts in zip(self._schichten, self._starts, strict=True):
            k = bisect_right(starts, von) - 1
            k = max(k, 0)
            while k < len(s) and self.zeitraeume[s[k]].von < bis:
                z = self.zeitraeume[s[k]]
                if z.bis > von:
                    yield s[k]
                k += 1

    def _anteile(self, von: datetime, bis: datetime, gesamt_von: datetime) -> list[tuple[int, float, float]]:
        """(Zeitraum, Sekunden, Anteil am ganzen Intervall) – je Zeitlage einmal (alle Läufe und Container teilen sie)."""
        schluessel = (von, bis, gesamt_von)
        if (t := self._cache.get(schluessel)) is None:
            gesamt = (bis - gesamt_von).total_seconds()
            t = []
            for i in self._treffer(von, bis):
                z = self.zeitraeume[i]
                anteil = (min(bis, z.bis) - max(von, z.von)).total_seconds()
                t.append((i, anteil, anteil / gesamt))
            self._cache[schluessel] = t
        return t

    def hinzufuegen(self, lauf: SzenarioLauf) -> None:
        """Einen ganzen Lauf einrechnen (danach kann er verworfen werden)."""
        if lauf.szenario_id not in self.laeufe:
            self.laeufe.append(lauf.szenario_id)
        zentral = lauf.szenario_id == self.zentral
        sid = lauf.szenario_id
        for seite, ivs, ab in (("mit", lauf.mit, self.gemessen_bis), ("ohne", lauf.ohne, None)):
            for e in ivs:
                von, bis = e.zeit.von, e.zeit.bis
                if ab is not None and von < ab:
                    von = ab
                if bis <= von:
                    continue
                preis = self._preis_cache.get(e.zeit.von, False)
                if preis is False:
                    preis = self._preis_cache[e.zeit.von] = self.preis(e.zeit.von)
                m, u, o = e.mitte_kwh, e.unten_kwh, e.oben_kwh
                for i, anteil, f in self._anteile(von, bis, e.zeit.von):
                    s = self._s[(seite, sid, i, e.bereich_id)]
                    s.dauer += anteil
                    if m is None:
                        s.nm = True
                    else:
                        s.m += m * f
                    if u is None:
                        s.nu = True
                    else:
                        s.u += u * f
                    if o is None:
                        s.no = True
                    else:
                        s.o += o * f
                    if preis is None:
                        s.np = True
                    else:
                        if m is not None:
                            s.em += m * f * preis
                        if u is not None:
                            s.eu += u * f * preis
                        if o is not None:
                            s.eo += o * f * preis
                    if zentral:
                        zz = self._z[(seite, i, e.bereich_id)]
                        zz.arten.add(e.mitte_art)
                        zz.stufen[e.stufe] = None
                        for g in e.gruende:
                            zz.gruende[g] = None

    def ist_hinzufuegen(self, ist: Iterable[IstIntervall]) -> None:
        """Gemessene Energie vor `gemessen_bis`; ein Intervall zählt nur ganz (kein erfundener Teil)."""
        for x in ist:
            if x.zeit.von >= self.gemessen_bis:
                continue
            preis = self.preis(x.zeit.von)
            for i in self._treffer(x.zeit.von, min(x.zeit.bis, self.gemessen_bis)):
                z = self.zeitraeume[i]
                s = self._ist[(i, x.bereich_id)]
                if x.zeit.von < z.von or x.zeit.bis > min(z.bis, self.gemessen_bis):
                    s.unvollstaendig = True   # reicht über den Zeitraum bzw. `gemessen_bis` hinaus: nicht teilbar
                    continue
                if x.kwh is None:
                    s.unvollstaendig = True
                    continue
                s.dauer += (min(x.zeit.bis, self.gemessen_bis) - x.zeit.von).total_seconds()
                s.kwh += x.kwh
                s.baseline += x.baseline_kwh
                s.sonder = None if x.sonder_kwh is None or s.sonder is None else s.sonder + x.sonder_kwh
                if preis is None:
                    s.np = True
                else:
                    s.eur += x.kwh * preis

    # ------------------------------------------------------------------ Auswertung
    def _bereich_seite(self, seite: str, lauf: str, i: int, b: str, feld: str) -> float | None:
        """Ist (nur „mit“) + Modell eines Containers; None, wenn unbekannt oder das Modell den Zeitraum nicht deckt."""
        z = self.zeitraeume[i]
        euro = feld.startswith("e")
        if seite == "mit":
            ab = min(max(z.von, self.gemessen_bis), z.bis)
            ist = self._ist.get((i, b))
            basis = 0.0
            if ist is not None:
                if euro and ist.np:
                    return None
                basis = ist.eur if euro else ist.kwh
        else:
            ab, basis = z.von, 0.0
        noetig = (z.bis - ab).total_seconds()
        if noetig <= 0:
            return basis
        s = self._s.get((seite, lauf, i, b))
        if s is None or s.dauer < noetig - 1e-6 or getattr(s, "n" + feld[-1]) or (euro and s.np):
            return None
        return float(basis + getattr(s, feld))

    def _summe(self, seite: str, lauf: str, i: int, feld: str) -> tuple[float | None, list[str]]:
        werte, fehlend = 0.0, []
        for b in self.bereiche:
            w = self._bereich_seite(seite, lauf, i, b, feld)
            if w is None:
                fehlend.append(b)
            else:
                werte += w
        return (None if fehlend else werte), fehlend

    def _band(self, seite: str, i: int, feld: str) -> tuple[float | None, float | None]:
        unten = [self._summe(seite, l, i, feld + "u")[0] for l in self.laeufe]
        oben = [self._summe(seite, l, i, feld + "o")[0] for l in self.laeufe]
        return (None if not unten or None in unten else min(unten)), (None if not oben or None in oben else max(oben))   # type: ignore[type-var]

    def _seite(self, seite: str, i: int) -> ZeitraumErgebnis:
        z = self.zeitraeume[i]
        mitte, fehlend = self._summe(seite, self.zentral, i, "m")
        unten, oben = self._band(seite, i, "")
        teil = sum(w for b in self.bereiche if (w := self._bereich_seite(seite, self.zentral, i, b, "m")) is not None)
        arten: set[str] = set()
        stufen: list[StufenErgebnis] = []
        gruende: dict[str, None] = {}
        for b in self.bereiche:
            if (zz := self._z.get((seite, i, b))) is not None:
                arten |= zz.arten
                stufen += list(zz.stufen)
                gruende.update(zz.gruende)
        ist_kwh: float | None = None
        ist_voll = True
        if seite == "mit" and z.von < self.gemessen_bis:
            ist_kwh, noetig = 0.0, (min(z.bis, self.gemessen_bis) - z.von).total_seconds()
            for b in self.bereiche:
                s = self._ist.get((i, b))
                if s is None or s.unvollstaendig or s.dauer < noetig - 1e-6:
                    ist_voll = False
                if s is not None:
                    ist_kwh += s.kwh
            if not ist_voll:
                gruende["messluecke"] = None
                stufen.append(LUECKE)
        if fehlend:
            gruende["fehlende_modelle"] = None
            stufen.append(FEHLT)   # ein fehlender Container zieht den Zeitraum auf A (§9.1)
        modell_noetig = seite == "ohne" or z.bis > self.gemessen_bis
        stufe = stufe_gesamt(stufen, "gemischt") or (FEHLT if modell_noetig else GEMESSEN)
        return ZeitraumErgebnis(
            zeit=z, mitte_kwh=mitte, unten_kwh=unten, oben_kwh=oben, ist_belegt_kwh=ist_kwh, ist_vollstaendig=ist_voll,
            fehlende_bereiche=tuple(fehlend), mitte_art="keine" if mitte is None else _art(arten), stufe=stufe,
            gruende=tuple(gruende), teil_mitte_kwh=teil)

    def _ist_summen(self, i: int) -> tuple[float, float | None]:
        baseline = 0.0
        sonder: float | None = 0.0
        for b in self.bereiche:
            if (s := self._ist.get((i, b))) is not None:
                baseline += s.baseline
                sonder = None if s.sonder is None or sonder is None else sonder + s.sonder
        return baseline, sonder

    def _gespart(self, i: int, feld: str, mit_art: MitteArt, vergleichbar: bool) -> tuple[float | None, float | None, float | None]:
        """Mitte und Strukturband der Ersparnis aus denselben Läufen (kWh: feld "", €: feld "e")."""
        if not vergleichbar:
            return None, None, None
        o, m = self._summe("ohne", self.zentral, i, feld + "m")[0], self._summe("mit", self.zentral, i, feld + "m")[0]
        mitte = o - m if o is not None and m is not None and mit_art != "haltebedarf" else None
        lo, hi = [], []
        for l in self.laeufe:
            lo_o, hi_o = self._summe("ohne", l, i, feld + "u")[0], self._summe("ohne", l, i, feld + "o")[0]
            lo_m, hi_m = self._summe("mit", l, i, feld + "u")[0], self._summe("mit", l, i, feld + "o")[0]
            if None in (lo_o, hi_o, lo_m, hi_m):
                return mitte, None, None
            lo.append(lo_o - hi_m)   # type: ignore[operator]
            hi.append(hi_o - lo_m)   # type: ignore[operator]
        return mitte, (min(lo) if lo else None), (max(hi) if hi else None)

    def vergleich(self, i: int) -> VergleichErgebnis:
        mit, ohne = self._seite("mit", i), self._seite("ohne", i)
        baseline, sonder = self._ist_summen(i)
        vergleichbar = baseline <= EPS
        gruende = [] if vergleichbar else ["baseline_im_zeitraum"]
        mitte, unten, oben = self._gespart(i, "", mit.mitte_art, vergleichbar)
        if vergleichbar and mit.mitte_art == "haltebedarf":
            gruende.append("haltebedarf_vergleich")
        stufe = stufe_gespart(mit.stufe, ohne.stufe, vergleichbar)
        gespart = ZeitraumErgebnis(
            zeit=mit.zeit, mitte_kwh=mitte, unten_kwh=unten, oben_kwh=oben, ist_belegt_kwh=None,
            ist_vollstaendig=mit.ist_vollstaendig, fehlende_bereiche=tuple(dict.fromkeys((*mit.fehlende_bereiche,
                                                                                         *ohne.fehlende_bereiche))),
            mitte_art="keine" if mitte is None else mit.mitte_art, stufe=stufe,
            gruende=tuple(dict.fromkeys((*mit.gruende, *ohne.gruende, *gruende))))
        prozent = (100.0 * mitte / ohne.mitte_kwh if mitte is not None and ohne.mitte_kwh is not None and ohne.mitte_kwh > EPS
                   and not ohne.fehlende_bereiche else None)
        return VergleichErgebnis(zeit=mit.zeit, mit=mit, ohne=ohne, gespart=gespart, gespart_prozent=prozent,
                                 ist_sonderbetrieb_kwh=sonder or 0.0, ist_baseline_kwh=baseline, vergleichbar=vergleichbar,
                                 gruende=tuple(gruende) + (() if sonder is not None else ("sonderbetrieb_unbekannt",)))

    def euro(self, i: int, ergebnis: VergleichErgebnis) -> tuple[EuroSumme, EuroSumme, EuroSumme]:
        """€ für mit, ohne und gespart – dieselbe Rechnung wie die kWh, je Intervall mit seinem Preis."""
        aus = []
        for seite, erg in (("mit", ergebnis.mit), ("ohne", ergebnis.ohne)):
            mitte = self._summe(seite, self.zentral, i, "em")[0] if erg.mitte_kwh is not None else None
            unten, oben = self._band(seite, i, "e")
            aus.append(EuroSumme(mitte, unten, oben))
        m, u, o = self._gespart(i, "e", ergebnis.mit.mitte_art, ergebnis.vergleichbar)
        aus.append(EuroSumme(m if ergebnis.gespart.mitte_kwh is not None else None, u, o))
        return aus[0], aus[1], aus[2]

    def ergebnisse(self) -> tuple[VergleichErgebnis, ...]:
        return tuple(self.vergleich(i) for i in range(len(self.zeitraeume)))


def aggregiere(
    laeufe: Sequence[SzenarioLauf], zeitraeume: Sequence[Intervall], ist: Sequence[IstIntervall], regeln: PrognoseRegeln,
    *, gemessen_bis: datetime, bereich_ids: Sequence[str] | None = None, preise: Sequence[PreisIntervall] = (),
    zentral: str = ZENTRAL,
) -> tuple[VergleichErgebnis, ...]:
    """Vergleich je Zeitraum (siehe Modul). Ohne `bereich_ids` die Container aus Läufen und Ist."""
    del regeln
    ids = bereich_ids if bereich_ids is not None else tuple(dict.fromkeys(
        [e.bereich_id for l in laeufe for e in (*l.mit, *l.ohne)] + [x.bereich_id for x in ist]))
    agg = Aggregat(zeitraeume, gemessen_bis, ids, preise, zentral)
    for l in laeufe:
        agg.hinzufuegen(l)
    agg.ist_hinzufuegen(ist)
    return agg.ergebnisse()


def waehle_mit(regelungsart: str, h: HSchaetzung, h_tage: HSchaetzung, duty: DutySchaetzung,
               regeln: PrognoseRegeln) -> HSchaetzung | DutySchaetzung:
    """Modell „mit“ eines Containers: Planmodus → Duty; thermo → stationäres H (C/D), sonst Tagesregression (B), sonst
    das nicht identifizierte stationäre (A, Mitte None)."""
    if regelungsart == "plan":
        return duty
    if h.h_kw_k is not None and evidenz_mit(h, None, regeln) != "A":
        return h
    if h_tage.h_kw_k is not None and evidenz_mit(h_tage, None, regeln) != "A":
        return h_tage
    return h


# ---------------------------------------------------------------------- ganze Schattenprognose
@dataclass(frozen=True)
class ContainerModelle:
    """Gewählte Modelle eines Containers für seine aktuelle Konfiguration (aus dem Evidenzbericht P3)."""

    bereich_id: str
    mit: HSchaetzung | DutySchaetzung
    ohne: OhneSchaetzung
    validierung: Validierung | None = None
    konfiguration_id: str = ""
    regelungsart: Regelungsart = "unbekannt"
    p_max_kw: float | None = None   # Summe der unabhängigen Leistungsreferenzen (None = eine fehlt)


def rechne(
    auftrag: PrognoseAuftrag, modelle: Mapping[str, ContainerModelle], zeitraeume: Sequence[Intervall],
    ist: Sequence[IstIntervall], regeln: PrognoseRegeln,
) -> Aggregat:
    """Neun ganze Läufe über den Auftragszeitraum: Wetter je Klimadelta (`wetterreihe`), Plan je Wetter (`planen`, nur ab
    den Plantagen), „mit“ je Container mit seinem Parametersatz, „ohne“ rund um die Uhr über den ganzen Zeitraum; jeder
    Lauf wird gleich eingerechnet und verworfen. Fehlt das Modell eines Containers, bleibt er unbekannt (Mitte None)."""
    zone = auftrag.zeitzone
    vortage = dict(auftrag.wetter.bekannte_vortage)
    anfang_mit, anfang_ohne = dict(auftrag.anfang_mit), dict(auftrag.anfang_ohne)
    tage_je: dict[str, list[PlanTag]] = defaultdict(list)
    for t in auftrag.plantage:
        tage_je[t.bereich_id].append(t)
    agg = Aggregat(zeitraeume, auftrag.gemessen_bis, auftrag.bereich_ids, auftrag.preise)
    agg.ist_hinzufuegen(ist)
    leer = OhneSchaetzung("", "", "keine", None, None, None, None, None, None, None, 0, 0, 0.0, "unbekannt", None, ())
    sz: dict[str, dict[str, Szenario]] = {}
    for b in auftrag.bereich_ids:
        m = modelle.get(b)
        tag = tage_je[b][0] if tage_je.get(b) else None
        grenze = tag.frost_grenze_c if tag is not None else 5.0
        aus = tag.frost_aus_c if tag is not None else grenze + FROST_SPANNE
        sz[b] = {s.id: s for s in szenarien(m.mit if m is not None else DutySchaetzung(b, "", None, 0, 0.0, 0.0, ()),
                                           m.ohne if m is not None else leer, None, None, regeln,
                                           frost_grenze_c=grenze, frost_aus_c=aus)}
    for w, delta in enumerate((-regeln.winter_delta_k, 0.0, regeln.winter_delta_k)):
        wetter = wetterreihe(auftrag.wetter, auftrag.zeitraum, zone, delta, regeln)
        plan_je: dict[str, list[PlanIntervall]] = defaultdict(list)
        for iv in planen(auftrag.plantage, wetter, vortage, zone, regeln):
            plan_je[iv.bereich_id].append(iv)
        ohne_je = {}   # „ohne“ braucht keinen Plan – auch nach dem Ende der Heizperiode (keine Plantage mehr)
        for b in auftrag.bereich_ids:
            if (m := modelle.get(b)) is not None:
                ohne_je[b] = ohne_intervalle(wetter, b, m.konfiguration_id, m.regelungsart, m.p_max_kw)
        for p in range(3):
            sid = szenario_id(p, w)
            mit: list[EnergieIntervall] = []
            ohne: list[EnergieIntervall] = []
            for b in auftrag.bereich_ids:
                if (m := modelle.get(b)) is None:
                    continue
                para = sz[b][sid].parameter
                mit += berechne_mit(plan_je[b], m.mit, para, anfang_mit.get(b), regeln, validierung=m.validierung)
                ohne += berechne_ohne(ohne_je[b], m.ohne, para, anfang_ohne.get(b), regeln)
            agg.hinzufuegen(SzenarioLauf(sid, tuple(mit), tuple(ohne)))
    return agg


# ---------------------------------------------------------------------- Ist aus Tages- und Stundensummen
def baseline_tage(laeufe: Iterable[Lauf]) -> dict[str, set[date]]:
    """Tage mit Baseline-Energie je Container: fertige und laufende Läufe ganz, abgebrochene bis einschließlich
    Abbruchtag; geplante/abgesagte nicht."""
    aus: dict[str, set[date]] = defaultdict(set)
    for l in laeufe:
        if l.status in ("fertig", "laeuft"):
            aus[l.bereich].update(l.tage())
        elif l.status == "abgebrochen":
            aus[l.bereich].update(d for d in l.tage() if l.ende is None or d <= l.ende)
    return dict(aus)


def ist_stunden(energie: Mapping[tuple[str, datetime], float], erfasst: Mapping[tuple[str, datetime], float],
                bereiche: Sequence[str], von: datetime, bis: datetime, regeln: PrognoseRegeln,
                baseline_bereiche: Iterable[str] = ()) -> tuple[IstIntervall, ...]:
    """Ist je Container und Stunde in [von, bis) (die letzte Stunde endet bei `bis`): nur mit mitgeschriebener Zeit
    ≥ `abdeckung_min` der Stunde, sonst Messlücke (None, nie 0). Container in `baseline_bereiche` (Lauf heute): die
    Energie zählt als Baseline-Energie."""
    baseline = set(baseline_bereiche)
    aus = []
    for b in bereiche:
        t = von
        while t < bis:
            e = min(t.replace(minute=0, second=0, microsecond=0) + timedelta(hours=1), bis)
            dauer = (e - t).total_seconds()
            ok = erfasst.get((b, t.replace(minute=0, second=0, microsecond=0)), 0.0) >= regeln.abdeckung_min * dauer
            kwh = energie.get((b, t.replace(minute=0, second=0, microsecond=0)), 0.0) if ok else None
            aus.append(IstIntervall(Intervall(t, e), b, kwh, baseline_kwh=(kwh or 0.0) if b in baseline else 0.0))
            t = e
    return tuple(aus)


def ist_tage(tage: Mapping[str, Sequence[tuple[date, float | None]]], baseline: Mapping[str, set[date]], zeitzone: str
             ) -> tuple[IstIntervall, ...]:
    """Ist je Container und abgeschlossenem Tag (Tagessumme, None = keine Summe); Tage eines Baseline-Laufs zählen ganz
    als Baseline-Energie (bleibt auf der Verbrauchsseite, macht den Zeitraum nicht vergleichbar)."""
    zone = ZoneInfo(zeitzone)
    aus = []
    for b, liste in tage.items():
        for d, kwh in liste:
            a = datetime.combine(d, time(), zone).astimezone(UTC)
            e = datetime.combine(d + timedelta(days=1), time(), zone).astimezone(UTC)
            aus.append(IstIntervall(Intervall(a, e), b, kwh,
                                    baseline_kwh=(kwh or 0.0) if d in baseline.get(b, set()) else 0.0))
    return tuple(aus)


def zeitraeume(beginn: date, ende: date, heute: date, zeitzone: str) -> dict[str, list[Intervall]]:
    """Ausgabezeiträume: Heizperiode [beginn, ende], Monate, Wochen (ab Montag), Tage – an den Rändern der Heizperiode
    geschnitten – und die Stunden von heute (lokal, 23/24/25), wenn heute in der Heizperiode liegt."""
    zone = ZoneInfo(zeitzone)

    def u(d: date) -> datetime:
        return datetime.combine(d, time(), zone).astimezone(UTC)
    letzter = ende + timedelta(days=1)
    aus: dict[str, list[Intervall]] = {"heizperiode": [Intervall(u(beginn), u(letzter))], "monat": [], "woche": [],
                                       "tag": [], "stunde": []}
    d = beginn
    while d < letzter:
        n = date(d.year + (d.month == 12), d.month % 12 + 1, 1)
        aus["monat"].append(Intervall(u(d), u(min(n, letzter))))
        d = n
    d = beginn
    while d < letzter:
        n = d + timedelta(days=7 - d.weekday())
        aus["woche"].append(Intervall(u(d), u(min(n, letzter))))
        d = n
    aus["tag"] = [Intervall(u(beginn + timedelta(days=i)), u(beginn + timedelta(days=i + 1)))
                  for i in range((letzter - beginn).days)]
    if beginn <= heute <= ende:
        t, b = u(heute), u(heute + timedelta(days=1))
        while t < b:
            aus["stunde"].append(Intervall(t, t + timedelta(hours=1)))
            t += timedelta(hours=1)
    return aus


def gueltige_modelle(modelle: Mapping[str, ContainerModelle], aktuell: Mapping[str, str]
                     ) -> tuple[dict[str, ContainerModelle], tuple[str, ...]]:
    """Nur Schätzungen der aktuellen Konfiguration gelten (Konfigurationswechsel → neues Modell, §9.1): die anderen
    Container fehlen, bis neu geschätzt ist (zweiter Wert: ihre IDs)."""
    gueltig = {b: m for b, m in modelle.items() if aktuell.get(b) == m.konfiguration_id}
    return gueltig, tuple(b for b in modelle if b not in gueltig)
