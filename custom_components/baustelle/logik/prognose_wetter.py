"""Prognose V2: Wetter je Intervall und Plan je Szenario (Bauvorlage CGR-2026-10-11-hochrechnung r5 §8.1) – ohne HA-Code.

Lieferung P4a (BSM-033.09).

- `wetterreihe`: je UTC-Stunde (an den Rändern des Zeitraums geschnitten) die Außentemperatur – Stundenvorhersage vor
  gemessenem Tagesmittel (`bekannte_vortage`) vor Tagesvorhersage vor Klimamittel (`hochrechnung.klima_tag`, kein
  zweiter Klimaalgorithmus). Tagesmittel bekommen den synthetischen Tagesgang Mittel − A·cos(2π·(lokale Stunde − h_min)/24),
  über die echten Stunden des lokalen Tages zentriert (23/24/25 h, das Tagesmittel bleibt exakt). Das Klimadelta eines
  Szenarios (±1,5 K) wirkt nur auf Klimaanteile. Die Quelle bleibt je Intervall erhalten.
- `planen`: je Container und Tag der Plan neu mit `arbeitszeit.tagesplan()`, das Soll aus `soll.aussen_mittel/gleitend`
  mit dem Szenariowetter (Vortage gemessen, sonst aus der Reihe), Heizgrenze aus `regelung.zu_warm` (Tageshöchstwert der
  Szenarioreihe bzw. Wert je Intervall), Grund nach der Reihenfolge der Regelung (`regelung.soll_container`, Bedarf vor
  frei und Heizgrenze). Frostbereitschaft nach der Politik (`prognose_merkmale.frost_bereit`), disjunkt zur regulären
  Freigabe. Minutengenau an den Plan- und Bedarfsgrenzen geschnitten. Spontane Eingriffe (Boost, Hand-Ein, Taste,
  „Alle jetzt heizen“, Tür) werden nicht erfunden; Frühstart aus dem Szenariowetter, wenn die Vorhersage fehlt (Code
  `fruehstart_aus_szenario`). Ein regulärer Block nach ≥ `start_pause_min` ohne Freigabe oder mit Sollsprung >
  `start_sollsprung_k` ist ein neuer Start mit unbekanntem Defizit (`start_unbekannt`); läuft er schon am Beginn der
  Reihe, entscheidet der Anfangszustand (`start_vorher`).
- `ohne_intervalle`: Gegenfaktum „ohne Automatik“ läuft rund um die Uhr – nur Zeit, Außen und Leistung je Intervall.
"""

from __future__ import annotations

from bisect import bisect_left, bisect_right
from collections import defaultdict
from collections.abc import Mapping, Sequence
from dataclasses import replace
from datetime import UTC, date, datetime, time, timedelta
import math
from zoneinfo import ZoneInfo

from .arbeitszeit import WetterTag, ausnahme_am, frei_gilt, tagesplan
from .hochrechnung import klima_tag
from .prognose_merkmale import GRUND_ART, frost_bereit
from .prognose_regeln import PrognoseRegeln
from .prognose_typen import (
    Gruende,
    Intervall,
    PlanIntervall,
    PlanTag,
    Regelungsart,
    WetterEingabe,
    WetterIntervall,
    WetterQuelle,
)
from .regelung import FROST_SPANNE, LageContainer, SollGrund, soll_container, zu_warm
from .soll import aussen_mittel, gleitend

STUNDE = timedelta(hours=1)
FRUEH_STUNDEN = range(4, 9)   # tiefster Wert 4–8 Uhr wie die Vorhersage (`kern/wetter._prognose_je_tag`)


def _lokaler_tag(d: date, zone: ZoneInfo) -> tuple[datetime, datetime]:
    a = datetime.combine(d, time(), zone).astimezone(UTC)
    b = datetime.combine(d + timedelta(days=1), time(), zone).astimezone(UTC)
    return a, b


def tagesgang(d: date, zone: ZoneInfo, regeln: PrognoseRegeln) -> dict[datetime, float]:
    """Zentrierter synthetischer Tagesgang je UTC-Stunde des lokalen Tages `d` (Mittel über die echten Stunden = 0)."""
    a, b = _lokaler_tag(d, zone)
    roh: dict[datetime, float] = {}
    t = a
    while t < b:
        h = t.astimezone(zone).hour
        roh[t] = -regeln.tagesgang_amplitude_k * math.cos(2 * math.pi * (h - regeln.tagesgang_minimum_stunde) / 24)
        t += STUNDE
    mittel = sum(roh.values()) / len(roh)
    return {k: v - mittel for k, v in roh.items()}


def wetterreihe(
    eingabe: WetterEingabe, zeitraum: Intervall, zeitzone: str, delta_klima_k: float, regeln: PrognoseRegeln,
) -> tuple[WetterIntervall, ...]:
    """Außentemperatur je UTC-Stunde im Zeitraum (an den Rändern geschnitten), mit Quelle je Intervall."""
    zone = ZoneInfo(zeitzone)
    stunden = {w.zeit.von: w for w in eingabe.stunden}
    gemessen = dict(eingabe.bekannte_vortage)
    vorhersage = dict(eingabe.tagesmittel)
    gaenge: dict[date, dict[datetime, float]] = {}
    aus: list[WetterIntervall] = []
    t = zeitraum.von.astimezone(UTC).replace(minute=0, second=0, microsecond=0)
    while t < zeitraum.bis:
        zeit = Intervall(max(t, zeitraum.von), min(t + STUNDE, zeitraum.bis))
        if (w := stunden.get(t)) is not None:
            aus.append(WetterIntervall(zeit, w.aussen_c, "vorhersage_stunde", False))
        else:
            d = t.astimezone(zone).date()
            gang = gaenge.get(d)
            if gang is None:
                gang = gaenge[d] = tagesgang(d, zone, regeln)
            quelle: WetterQuelle
            if d in gemessen:
                mittel, quelle = gemessen[d], "gemessen_tag"
            elif d in vorhersage:
                mittel, quelle = vorhersage[d], "vorhersage_tag"
            else:
                mittel, quelle = klima_tag(d, eingabe.klima_monate) + delta_klima_k, "klima"
            aus.append(WetterIntervall(zeit, mittel + gang[t], quelle, True))
        t += STUNDE
    return tuple(aus)


def tagesmittel(wetter: Sequence[WetterIntervall], zeitzone: str) -> dict[date, float]:
    """Zeitgewichtetes Mittel je lokalem Tag über die vorhandenen Intervalle."""
    zone = ZoneInfo(zeitzone)
    s: dict[date, float] = defaultdict(float)
    g: dict[date, float] = defaultdict(float)
    for w in wetter:
        d = w.zeit.von.astimezone(zone).date()
        dauer = (w.zeit.bis - w.zeit.von).total_seconds()
        s[d] += w.aussen_c * dauer
        g[d] += dauer
    return {d: s[d] / g[d] for d in s if g[d] > 0}


def _p_max(tag: PlanTag) -> float | None:
    """Freigabeleistung: Summe der unabhängigen Leistungsreferenzen; eine fehlende → None (kein geratener Deckel)."""
    if any(p is None for p in tag.p_ref):
        return None
    return sum(p.kw for p in tag.p_ref if p is not None)


def _soll(tag: PlanTag, mittel: Mapping[date, float]) -> tuple[float | None, Gruende]:
    if tag.gleitregeln is None:
        return tag.soll_fest_c, ()
    t_m = aussen_mittel(mittel, tag.datum, tag.gleitregeln.tage, mittel.get(tag.datum))
    if t_m is None:
        return tag.soll_fest_c, ("soll_gleitend_ohne_aussen",)
    return round(gleitend(t_m, tag.gleitregeln, tag.rueckmeldungen) + tag.soll_versatz_k, 2), ()


def _tagespunkte(tag: PlanTag, plan_grenzen: Sequence[int], zone: ZoneInfo) -> list[datetime]:
    """Zeitpunkte des Tages, an denen sich Plan oder Bedarf ändern können (UTC, sortiert)."""
    punkte = {datetime.combine(tag.datum, time(m // 60, m % 60), zone).astimezone(UTC)
              for m in plan_grenzen if 0 < m < 24 * 60}
    for f in tag.feste_bedarfsfenster:
        punkte |= {f.von, f.bis}
    return sorted(punkte)


def _schnitte(punkte: Sequence[datetime], von: datetime, bis: datetime) -> list[datetime]:
    """`von` und die Tagespunkte in (von, bis)."""
    return [von, *punkte[bisect_right(punkte, von):bisect_left(punkte, bis)]]


def _wand_minute(t: datetime, zone: ZoneInfo) -> int:
    lokal = t.astimezone(zone)
    return lokal.hour * 60 + lokal.minute


ABSENK_VORGABE = 10.0   # wie `LageContainer.absenk` (Regelung), wenn die Einstellung fehlt


def _grund(tag: PlanTag, plan: object, minute: int, soll: float | None, warm: bool, frei: bool, bedarf_aktiv: bool) -> str:
    """Grund nach der Reihenfolge der Regelung (`soll_container`) – Frost bleibt außen vor (Bereitschaft getrennt),
    spontane Eingriffe (Tür, Boost, Taste, Baseline) werden nicht erfunden."""
    lage = LageContainer(
        minute=minute, plan=plan, automatik=True, auto=tag.auto,   # type: ignore[arg-type]
        temperatur=soll if tag.fuehler and soll is not None else None, soll=soll if soll is not None else 0.0,
        frost=False, frost_grenze=tag.frost_grenze_c, zu_warm=warm, frei=frei, tuer_offen_min=None,
        bedarf=tag.bedarfscontainer, bedarf_aktiv=bedarf_aktiv, boost=False, heizt_gerade=False, modus=tag.modus,
        frei_modus=tag.frei_modus, absenk=tag.absenk_soll_c if tag.absenk_soll_c is not None else ABSENK_VORGABE)
    return str(soll_container(lage, tag.tuer_pause_min).grund)


def planen(
    tage: Sequence[PlanTag], wetter: Sequence[WetterIntervall], bekannte_vortage: Mapping[date, float], zeitzone: str,
    regeln: PrognoseRegeln,
) -> tuple[PlanIntervall, ...]:
    """Plan je Container und Szenariowetter, minutengenau geschnitten (siehe Modul)."""
    zone = ZoneInfo(zeitzone)
    reihe = sorted(wetter, key=lambda w: w.zeit.von)
    je_tag: dict[date, list[WetterIntervall]] = defaultdict(list)
    for w in reihe:
        je_tag[w.zeit.von.astimezone(zone).date()].append(w)
    mittel = {**tagesmittel(reihe, zeitzone), **bekannte_vortage}   # gemessene Vortage vor der Szenarioreihe
    erster = min((t.datum for t in tage if t.datum in je_tag), default=None)
    beginn = je_tag[erster][0].zeit.von if erster is not None else None   # Beginn der geplanten Reihe
    aus: list[PlanIntervall] = []
    letzte: dict[str, tuple[datetime, float | None, str]] = {}   # Container → (Ende R, Ziel, Episode)
    for tag in sorted(tage, key=lambda x: (x.bereich_id, x.datum)):
        ws = je_tag.get(tag.datum)
        if not ws:
            continue
        soll, soll_gruende = _soll(tag, mittel)
        wt = tag.plan_wetter
        gruende_tag: list[str] = list(soll_gruende)
        if tag.fruehstart_unsicher:
            gruende_tag.append("fruehstart_unsicher")
        if wt.frueh_min_temp is None:
            frueh = [w.aussen_c for w in ws if w.zeit.von.astimezone(zone).hour in FRUEH_STUNDEN]
            if frueh:
                wt = replace(wt, frueh_min_temp=min(frueh))
                gruende_tag.append("fruehstart_aus_szenario")
        plan = tagesplan(tag.datum, tag.arbeitszeiten, tag.ausnahmen, tag.heizregeln, wt, tag.trocknen, frei=tag.frei,
                         warm=tag.warm_ab)
        frei = frei_gilt(tag.frei, ausnahme_am(tag.ausnahmen, tag.datum))
        # Tageshöchstwert wie die Regelung: bekannter (Vorhersage, gemessen) vor dem synthetischen aus der Reihe
        hoechst = tag.tageshoechst_c if tag.tageshoechst_c is not None else max(w.aussen_c for w in ws)
        grenzen = [g for a, b, _ in plan.abschnitte() for g in (a, b)] if plan is not None else []
        p_max = _p_max(tag)
        if p_max is None:
            gruende_tag.append("p_ref_fehlt")
        punkte = _tagespunkte(tag, grenzen, zone)
        gruende_cache: dict[tuple[object, bool, bool], str] = {}   # Grund hängt nur von Abschnitt, Heizgrenze, Bedarf ab
        for w in ws:
            schnitte = _schnitte(punkte, w.zeit.von, w.zeit.bis)
            warm = zu_warm(tag.heizgrenze_basis, hoechst, w.aussen_c, tag.heizgrenze_c)
            for von, bis in zip(schnitte, [*schnitte[1:], w.zeit.bis], strict=True):
                minute = _wand_minute(von, zone)
                bedarf_aktiv = any(f.von <= von < f.bis for f in tag.feste_bedarfsfenster)
                schluessel = (plan.abschnitt(minute) if plan is not None else None, warm, bedarf_aktiv)
                if (grund := gruende_cache.get(schluessel)) is None:
                    grund = gruende_cache[schluessel] = _grund(tag, plan, minute, soll, warm, frei, bedarf_aktiv)
                regulaer = GRUND_ART.get(grund) == "REGULAER" and grund != SollGrund.HEIZGRENZE
                ziel: float | None = None
                gruende = list(gruende_tag)
                if regulaer and tag.regelungsart == "thermo":
                    ziel = (tag.absenk_soll_c if tag.absenk_soll_c is not None else ABSENK_VORGABE) if grund == SollGrund.ABSENKEN else soll
                bereit = not regulaer and frost_bereit(tag.frost_erlaubt, tag.frei_modus, grund, tag.fuehler,
                                                       tag.frost_aussen_c)
                episode, defizit = None, None
                if regulaer:
                    vorher = letzte.get(tag.bereich_id)
                    neu = (vorher is None or (von - vorher[0]).total_seconds() >= regeln.start_pause_min * 60
                           or (ziel is not None and vorher[1] is not None and ziel - vorher[1] > regeln.start_sollsprung_k))
                    if neu:
                        episode = f"{tag.bereich_id}:{von.isoformat()}"
                        gruende.append("start_vorher" if vorher is None and von == beginn else "start_unbekannt")
                    else:
                        assert vorher is not None
                        episode = vorher[2]
                    letzte[tag.bereich_id] = (bis, ziel, episode)
                aus.append(PlanIntervall(
                    zeit=Intervall(von, bis), bereich_id=tag.bereich_id, konfiguration_id=tag.konfiguration_id,
                    regelungsart=tag.regelungsart, regulaer_freigegeben=regulaer, frost_bereit=bereit, ziel_c=ziel,
                    aussen_c=w.aussen_c, wetterquelle=w.quelle, p_max_kw=p_max, episode_id=episode,
                    startdefizit_k=defizit, gruende=tuple(dict.fromkeys(gruende)), grund=grund,
                    frost_grenze_c=tag.frost_grenze_c, frost_aus_c=tag.frost_aus_c, frost_aussen_c=tag.frost_aussen_c,
                    fuehler=tag.fuehler))
    return tuple(aus)


def ohne_intervalle(
    wetter: Sequence[WetterIntervall], bereich_id: str, konfiguration_id: str, regelungsart: Regelungsart,
    p_max_kw: float | None,
) -> tuple[PlanIntervall, ...]:
    """Gegenfaktum „ohne Automatik“: alle Heizkörper rund um die Uhr am Strom, ihr Thermostat regelt – kein Plan."""
    return tuple(PlanIntervall(
        zeit=w.zeit, bereich_id=bereich_id, konfiguration_id=konfiguration_id, regelungsart=regelungsart,
        regulaer_freigegeben=False, frost_bereit=False, ziel_c=None, aussen_c=w.aussen_c, wetterquelle=w.quelle,
        p_max_kw=p_max_kw, episode_id=None, startdefizit_k=None, gruende=("ohne_automatik",)) for w in wetter)


def frost_relevant(iv: PlanIntervall) -> bool:
    """Kann Frostschutz in diesem Intervall heizen? Mit Fühler nur, solange außen unter der Aus-Schwelle liegt (der Raum
    kühlt nie unter außen); ohne Fühler, solange außen unter der Außengrenze + Hysterese liegt."""
    if not iv.frost_bereit:
        return False
    if iv.fuehler:
        return iv.frost_aus_c is not None and iv.aussen_c < iv.frost_aus_c
    return iv.frost_aussen_c is not None and iv.aussen_c < iv.frost_aussen_c + FROST_SPANNE
