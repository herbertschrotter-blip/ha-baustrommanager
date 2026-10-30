"""Prognose V2: Baseline-Plateaus und Gegenmodell „ohne Automatik“ (Bauvorlage CGR-2026-10-11-hochrechnung r5 §7.2) –
ohne HA-Code. Lieferung P3 (BSM-033.08); der elektrische Wetterfit (`fit_ohne_wetter`) kommt später.

- **Plateaus** (`plateaus`): nur Minuten eines bestätigten Baseline-Laufs (Lauf-ID der Minute = Metadaten des Laufs,
  Zeit im Lauf, Status läuft/fertig/abgebrochen vor dem Abbruchtag), Relay durchgehend an (`sekunden_ein` = Dauer),
  ohne Sperre, Eingriff, Wechsel und ohne Türöffnung über `tuer_offen_max_s` am Stück. Nach dem Warm-up
  (`baseline_vorlauf_konvektor_h`, mit Öl oder unbekanntem Typ `baseline_vorlauf_oel_h`) nicht überlappende Grundblöcke
  (120/180 min); fehlen darin `zyklen_min` vollständige Zyklen je Gerät, wird der Block bis höchstens
  `baseline_block_max_h` verlängert – auf das früheste Ende, an dem alle Geräte genug Zyklen haben (Hinweis
  `verlaengert`). Stabilität wie §7.1 ohne Komfort-Sollnähe (`prognose_h.bewerte_fenster`). Volllast ohne
  Thermostatzyklen beweist kein T_max.
- **Gegenmodell** (`schaetze_ohne`): je „Nacht“ (Mittag bis Mittag: lokales Datum von Plateau-Mitte − 12 h) die
  zeitgewichtete Plateau-Innentemperatur;
  T_max_eff = Median der Nächte, Band von der kältesten bis zur wärmsten Nacht ± `tmax_band_min_k`; liegen die Nächte
  mehr als `tmax_nacht_diff_max_k` auseinander, ist T_max nicht identifiziert. H_ohne robust wie H regulär
  (`prognose_h.schaetzung_aus_fenstern`: Mindestband ±30 %, Ersatz ±50 %). Die Thermostatannahme bleibt als Hinweis
  sichtbar; eine geänderte Thermostatstellung verhindert das Gegenmodell. Stufe: `prognose_stufe.evidenz_ohne`.
"""

from __future__ import annotations

from collections import defaultdict
from collections.abc import Sequence
from datetime import date, datetime, time, timedelta
from statistics import median
from zoneinfo import ZoneInfo

from .baseline import Lauf
from .prognose_h import (
    EPS,
    Bewertet,
    ZyklenZaehler,
    bewerte_fenster,
    episoden,
    fensterlaenge_min,
    schaetzung_aus_fenstern,
)
from .prognose_merkmale import LAUF_BESTAETIGT, MINUTE_S, Bewertung, bewerten, TYP_KONVEKTOR, energie_ok, ist_gesperrt, nachlauf_min
from .prognose_regeln import PrognoseRegeln
from .prognose_typen import (
    BaselineMetadaten,
    BereichIntervall,
    Fenster,
    Intervall,
    ModellKontext,
    OhneSchaetzung,
    ThermostatNachweis,
    Validierung,
)

LAUF_GEZAEHLT = (*LAUF_BESTAETIGT, "abgebrochen")   # abgebrochen: Metadaten enden am Abbruchtag
NACHT_VERSCHIEBUNG = timedelta(hours=12)   # Definition „Nacht“ = Mittag bis Mittag (20–23 und 00–03 Uhr: eine Nacht)


def nacht(p: Fenster, zeitzone: str) -> date:
    """Nacht eines Plateaus: lokales Datum von (Mitte − 12 h), benannt nach dem Abend."""
    return (p.zeit.von + (p.zeit.bis - p.zeit.von) / 2 - NACHT_VERSCHIEBUNG).astimezone(ZoneInfo(zeitzone)).date()


def baseline_metadaten(lauf: Lauf, zeitzone: str) -> BaselineMetadaten:
    """Metadaten eines Laufs (lokale ganze Tage → UTC); ein abgebrochener Lauf endet am Abbruchtag."""
    zone = ZoneInfo(zeitzone)
    ende = lauf.ende if lauf.status == "abgebrochen" and lauf.ende is not None else lauf.bis

    def utc(tag: date) -> datetime:
        return datetime.combine(tag, time(), zone).astimezone(ZoneInfo("UTC"))

    return BaselineMetadaten(
        lauf_id=lauf.id, bereich_id=lauf.bereich, zeit=Intervall(utc(lauf.von), utc(ende)), status=lauf.status,
        thermostat_unveraendert=lauf.thermostat_unveraendert, thermostatstellung=lauf.thermostatstellung,
        annahme_am=lauf.annahme_am, konfiguration_id=lauf.konfiguration_id or "", p_ref_belege=lauf.p_ref_belege)


def _b_minute(x: Bewertet, laeufe: dict[str, BaselineMetadaten]) -> bool:
    m, k, q = x
    lauf = laeufe.get(m.kontext.baseline_lauf_id or "")
    return (k.art == "BASELINE" and q.betrieb_gueltig and lauf is not None and lauf.bereich_id == m.bereich_id
            and lauf.zeit.von <= m.zeit.von and m.zeit.bis <= lauf.zeit.bis
            and bool(m.geraete) and all(energie_ok(g) for g in m.geraete) and all(g.erreichbar is not False for g in m.geraete)
            and all(g.sekunden_ein is not None and g.sekunden_ein >= (m.zeit.bis - m.zeit.von).total_seconds()
                    for g in m.geraete)
            and m.innen_c is not None and m.innen_gueltig and m.aussen_c is not None and m.aussen_gueltig
            and (m.zeit.bis - m.zeit.von).total_seconds() <= MINUTE_S and not ist_gesperrt(m)
            and not m.kontext.wechsel_im_intervall and not m.kontext.sonstige_eingriffe)


def _ende_mit_zyklen(liste: Sequence[Bewertet], i: int, e: int, mindestens: datetime, hoechstens: datetime,
                     ids: Sequence[str], regeln: PrognoseRegeln) -> int | None:
    """Index (exklusiv) des frühesten Blockendes ≥ `mindestens` und ≤ `hoechstens`, an dem jedes Gerät mindestens
    `zyklen_min` vollständige Zyklen hat; None, wenn es keines gibt."""
    zaehler = {g: ZyklenZaehler() for g in ids}
    for j in range(i, e):
        m = liste[j][0]
        if m.zeit.bis > hoechstens:
            return None
        for g, z in zaehler.items():
            z.weiter(m, g)
        if m.zeit.bis >= mindestens and all(z.zyklen is not None and z.zyklen >= regeln.zyklen_min for z in zaehler.values()):
            return j + 1
    return None


def plateaus(
    minuten: Sequence[BereichIntervall], laeufe: Sequence[BaselineMetadaten], regeln: PrognoseRegeln, *,
    beobachtet_ab: datetime | None = None, bewertet: Bewertung | None = None,
) -> tuple[Fenster, ...]:
    """Plateaus aller bestätigten Baseline-Läufe – gültig oder verworfen (Gründe). Episoden, die nicht nach
    `beobachtet_ab` beginnen (Vorgabe erste Minute), liefern keine Plateaus (Warm-up und Raster unbekannt); ein Block,
    dessen Verlängerung am Ende der Eingabe abgeschnitten wäre, bleibt offen (kein Plateau, keine Verwerfung)."""
    bestaetigt = {l.lauf_id: l for l in laeufe if l.status in LAUF_GEZAEHLT}
    aus: list[Fenster] = []
    for liste in (bewertet if bewertet is not None else bewerten(minuten, regeln)).values():
        def neu(i: int, liste: Sequence[Bewertet] = liste) -> bool:
            a, b = liste[i - 1][0], liste[i][0]
            return (a.zeit.bis != b.zeit.von or a.kontext.baseline_lauf_id != b.kontext.baseline_lauf_id
                    or a.kontext.konfiguration_id != b.kontext.konfiguration_id)

        def ok(i: int, liste: Sequence[Bewertet] = liste) -> bool:
            return _b_minute(liste[i], bestaetigt)

        for s, e, anker in episoden(liste, regeln, ok, neu, beobachtet_ab):
            if not anker:
                continue
            erste = liste[s][0]
            typen = {g.typ for g in erste.geraete}
            ids = sorted({g.geraet_id for m, _, _ in liste[s:e] for g in m.geraete})
            warm = timedelta(hours=regeln.baseline_vorlauf_konvektor_h if typen == {TYP_KONVEKTOR}
                             else regeln.baseline_vorlauf_oel_h)
            grund = timedelta(minutes=fensterlaenge_min(typen, regeln))
            vorlauf = timedelta(minutes=nachlauf_min(typen, regeln))
            te = liste[e - 1][0].zeit.bis
            a = erste.zeit.von + warm
            i = next((j for j in range(s, e) if liste[j][0].zeit.von >= a), e)
            while i < e and liste[i][0].zeit.von + grund <= te:
                a = liste[i][0].zeit.von
                ende = _ende_mit_zyklen(liste, i, e, a + grund, a + timedelta(hours=regeln.baseline_block_max_h), ids, regeln)
                hinweise: list[str] = []
                if ende is None and e == len(liste) and a + timedelta(hours=regeln.baseline_block_max_h) > te:
                    break   # die Daten enden, bevor der Block fertig verlängert werden kann
                if ende is None:
                    ende = next((j for j in range(i, e) if liste[j][0].zeit.bis >= a + grund), e - 1) + 1
                elif liste[ende - 1][0].zeit.bis > a + grund:
                    hinweise.append("verlaengert")
                vor = [x for x in liste[s:i] if x[0].zeit.von >= a - vorlauf]
                aus.append(bewerte_fenster(liste[i:ende], vor, "baseline", regeln, sollnaehe=False,
                                           lauf_id=erste.kontext.baseline_lauf_id, hinweise=hinweise))
                i = ende
    return tuple(aus)


def h_ohne(o: OhneSchaetzung) -> float | None:
    """H des Gegenmodells, nur wenn es identifiziert ist (Plateaus mit T_max)."""
    return o.h.h_kw_k if o.methode == "plateau" and o.h is not None else None


def _thermostat(nachweise: Sequence[ThermostatNachweis]) -> ThermostatNachweis:
    for n in ("geaendert", "unbekannt", "angenommen"):
        if n in nachweise:
            return n
    return "bestaetigt" if nachweise else "unbekannt"


def schaetze_ohne(
    kontext: ModellKontext, plateaus: Sequence[Fenster], laeufe: Sequence[BaselineMetadaten],
    validierung: Validierung | None, regeln: PrognoseRegeln, *, zeitzone: str,
) -> OhneSchaetzung:
    """Gegenmodell aus gültigen Plateaus eines Containers und einer Konfiguration (§7.2)."""
    alle = [p for p in plateaus if p.bereich_id == kontext.bereich_id and p.konfiguration_id == kontext.konfiguration_id
            and p.art == "baseline" and p.zeit.bis <= kontext.training_bis]
    ps = [p for p in alle if p.gueltig]
    lauf_ids = sorted({p.lauf_id for p in ps if p.lauf_id})
    nachweis = _thermostat([l.thermostat_unveraendert for l in laeufe if l.lauf_id in lauf_ids])
    gruende: list[str] = []
    if nachweis == "angenommen":
        gruende.append("thermostat_angenommen")   # Betriebsannahme, keine Messung (Herbert)
    elif nachweis != "bestaetigt":
        gruende.append(f"thermostat_{nachweis}")
    if not ps:
        return OhneSchaetzung(kontext.bereich_id, kontext.konfiguration_id, "keine", None, None, None, None, None, None,
                              None, 0, 0, 0.0, nachweis, validierung, (*gruende, "keine_plateaus"))
    naechte: dict[date, list[Fenster]] = defaultdict(list)
    je_lauf: dict[str, dict[date, float]] = defaultdict(lambda: defaultdict(float))
    for p in ps:
        n = nacht(p, zeitzone)
        naechte[n].append(p)
        je_lauf[p.lauf_id or ""][n] += (p.zeit.bis - p.zeit.von).total_seconds() / 3600
    stunden = {d: sum((p.zeit.bis - p.zeit.von).total_seconds() / 3600 for p in fs) for d, fs in naechte.items()}
    mittel = {d: sum(p.innen_mittel_c * (p.zeit.bis - p.zeit.von).total_seconds() for p in fs)
              / sum((p.zeit.bis - p.zeit.von).total_seconds() for p in fs) for d, fs in naechte.items()}
    t_max: float | None = median(mittel.values())
    unten: float | None = min(mittel.values()) - regeln.tmax_band_min_k
    oben: float | None = max(mittel.values()) + regeln.tmax_band_min_k
    if max(mittel.values()) - min(mittel.values()) > regeln.tmax_nacht_diff_max_k + EPS:
        t_max = unten = oben = None
        gruende.append("tmax_nicht_konstant")
    h = schaetzung_aus_fenstern(kontext, ps, len(alle) - len(ps), zeitzone, regeln, verschiebung=NACHT_VERSCHIEBUNG)
    identifiziert = t_max is not None and h.h_kw_k is not None and nachweis != "geaendert"
    return OhneSchaetzung(
        bereich_id=kontext.bereich_id, konfiguration_id=kontext.konfiguration_id,
        methode="plateau" if identifiziert else "keine", h=h, t_max_c=t_max, t_max_unten_c=unten, t_max_oben_c=oben,
        duty=None, a_kw=None, b_kw_k=None, laeufe=len(lauf_ids), beobachtungstage=len(naechte),
        plateau_h=sum(stunden.values()), thermostat_nachweis=nachweis, guete=validierung, gruende=tuple(gruende),
        # B: zwei Nächte mit je ≥ 3 h im selben Lauf (zusammen ≥ 6 h prüft `evidenz_ohne` über `plateau_h`)
        naechte_b=max((sum(1 for x in je.values() if x >= regeln.baseline_b_nacht_min_h - EPS) for je in je_lauf.values()),
                      default=0))
