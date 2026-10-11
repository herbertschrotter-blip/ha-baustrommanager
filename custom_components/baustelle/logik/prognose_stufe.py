"""Prognose V2: Validierungsmaße und Evidenzstufen (Bauvorlage CGR-2026-10-11-hochrechnung r5 §7, §9.1) – ohne HA-Code.

Lieferung P3 (BSM-033.08): nur die **Evidenzstufe** (A–D) – wie gut ein Modell aus Messungen belegt ist. Die
Prognosestufe (Start, Frost, Extrapolation, Plan) kommt mit P4a; Evidenz ist keine Prognosefreigabe (§9.1).

- `validiere`: WAPE, Bias und Temperatur-RMSE gegen eine Testmenge; ΣE_ist = 0 → Güte None. Unabhängig nur, wenn alle
  Testpunkte nach dem Trainingsschnitt liegen (Holdout im Training → kein D).
- `evidenz_h`: A ohne Identifikation; B Tagesregression ab `tagesfit_tage_min` Tagen; C stationär ab `c_fenster_min`
  Fenstern, `c_tage_min` Tagen, `c_stunden_min_h` Stunden und Streuung ≤ `c_streuung_max`; D zusätzlich ab
  `d_fenster_min`/`d_tage_min`, Streuung ≤ `d_streuung_max` und bestandener unabhängiger Validierung. Höchstens
  `HEvidenz.stufe_hoechstens` (aus `prognose_merkmale.stufe_hoechstens` der benutzten Fenster: Ersatz/rekonstruiert → C).
- `evidenz_duty`: Planmodus höchstens B.
- `evidenz_ohne`: Gegenmodell aus Baseline-Plateaus (§7.2) – B ab EINEM Lauf mit zwei getrennten Nächten
  (Mittag bis Mittag) mit je ≥ 3 h Plateau und zusammen ≥ 6 h (`OhneSchaetzung.naechte_b`); C ab drei Beobachtungstagen, zwei Läufen, zwölf Plateau-Stunden, H-Streuung ≤ 0,30; D mit
  Validierung. Erster Lauf höchstens B.
- `betriebsabhaengig`: reguläres und Baseline-H mehr als `h_betriebsabweichung_max_rel` auseinander → kein Pooling.

P4a (BSM-033.09) – **Prognosestufe** (§9.1): die Evidenzstufe, gekappt je Intervall (`kappen`): unbekannter oder kalter
Start (Aufheizen nicht modelliert), relevanter unvalidierter Frost und Extrapolation → höchstens C; Planmodus (Duty)
höchstens B. Extrapolation (`extrapoliert`): ΔT außerhalb [0,75·ΔT_min; 1,25·ΔT_max] der Evidenz oder Soll mehr als 1 K
außerhalb des Trainingsbereichs. `stufe_mit`/`stufe_ohne` = Minimum über den Plan; „gespart“ = Minimum beider Seiten
und nur bei Vergleichbarkeit (sonst A); die Baustelle = Minimum aller Container (`stufe_gesamt`).
"""

from __future__ import annotations

from collections.abc import Sequence
from datetime import datetime
import math
from zoneinfo import ZoneInfo

from .prognose_regeln import PrognoseRegeln
from .prognose_typen import (
    Anfangszustand,
    DutySchaetzung,
    HEvidenz,
    HSchaetzung,
    OhneSchaetzung,
    PlanIntervall,
    Stufe,
    StufenErgebnis,
    Validierung,
    ValidierungsPunkt,
)

STUFEN: tuple[Stufe, ...] = ("A", "B", "C", "D")


def stufe_min(*stufen: Stufe) -> Stufe:
    """Die niedrigste der Stufen (A < B < C < D)."""
    return min(stufen, key=STUFEN.index)


def validiere(
    modell_id: str, training_bis: datetime, punkte: Sequence[ValidierungsPunkt], regeln: PrognoseRegeln,
    *, zeitzone: str = "UTC",
) -> Validierung:
    """Güte gegen gültige Testpunkte; Verhältnisse mit Nenner 0 bleiben None. `zeitzone` zählt die lokalen Testtage."""
    del regeln   # Schwellen wertet `validierung_bestanden` aus
    p = [x for x in punkte if x.gueltig]
    zone = ZoneInfo(zeitzone)
    energie = [x for x in p if x.energie_ist_kwh is not None and x.energie_modell_kwh is not None]
    ist = sum(x.energie_ist_kwh for x in energie)   # type: ignore[misc]
    wape = bias = None
    if energie and ist > 0:
        wape = sum(abs(x.energie_modell_kwh - x.energie_ist_kwh) for x in energie) / ist   # type: ignore[operator]
        bias = sum(x.energie_modell_kwh - x.energie_ist_kwh for x in energie) / ist          # type: ignore[operator]
    temp = [(x.innen_modell_c - x.innen_ist_c) ** 2 for x in p if x.innen_ist_c is not None and x.innen_modell_c is not None]
    aussen = [x.aussen_c for x in p]
    return Validierung(
        modell_id=modell_id, training_bis=training_bis,
        test_von=min((x.zeit.von for x in p), default=training_bis), test_bis=max((x.zeit.bis for x in p), default=training_bis),
        tage=len({x.zeit.von.astimezone(zone).date() for x in p}), episoden=len(p),
        aussen_spanne_k=max(aussen) - min(aussen) if aussen else 0.0, energie_ist_kwh=ist, wape=wape, bias_rel=bias,
        temperatur_rmse_k=math.sqrt(sum(temp) / len(temp)) if temp else None,
        unabhaengig=bool(p) and all(x.zeit.von >= training_bis for x in p))


def validierung_bestanden(v: Validierung | None, regeln: PrognoseRegeln) -> bool:
    """D-Validierung (§9.1): unabhängig, ≥ `validierung_tage_min` Tage, Außenspanne ≥ `validierung_aussen_spanne_min_k`,
    WAPE ≤ `validierung_wape_max`, |Bias| ≤ `validierung_bias_abs_max`."""
    return (v is not None and v.unabhaengig and v.tage >= regeln.validierung_tage_min
            and v.aussen_spanne_k >= regeln.validierung_aussen_spanne_min_k
            and v.wape is not None and v.wape <= regeln.validierung_wape_max
            and v.bias_rel is not None and abs(v.bias_rel) <= regeln.validierung_bias_abs_max)


def evidenz_h(h: HSchaetzung, validierung: Validierung | None, regeln: PrognoseRegeln) -> Stufe:
    """Evidenzstufe einer H-Schätzung (stationär oder Tagesregression)."""
    ev = h.evidenz
    if h.methode == "keine" or h.h_kw_k is None or h.h_kw_k <= 0:
        return "A"
    if h.methode == "tagesregression":
        return stufe_min("B", ev.stufe_hoechstens) if ev.tage >= regeln.tagesfit_tage_min else "A"
    s = ev.streuung_rel
    if not (ev.fenster >= regeln.c_fenster_min and ev.tage >= regeln.c_tage_min and ev.stunden >= regeln.c_stunden_min_h
            and s is not None and s <= regeln.c_streuung_max):
        return "A"   # stationär unter der C-Schwelle: noch nicht identifiziert
    stufe: Stufe = "C"
    if (ev.fenster >= regeln.d_fenster_min and ev.tage >= regeln.d_tage_min and s <= regeln.d_streuung_max
            and validierung_bestanden(validierung, regeln)):
        stufe = "D"
    return stufe_min(stufe, ev.stufe_hoechstens)


def evidenz_duty(d: DutySchaetzung, regeln: PrognoseRegeln) -> Stufe:
    """Planmodus: mit Duty aus mindestens `tagesfit_tage_min` sauberen Tagen B, sonst A – nie mehr als B."""
    return "B" if d.duty is not None and d.tage >= regeln.tagesfit_tage_min else "A"


def evidenz_ohne(o: OhneSchaetzung, regeln: PrognoseRegeln) -> Stufe:
    """Evidenzstufe des Gegenmodells aus Baseline-Plateaus (gültige Plateaus haben sichtbare Thermostatzyklen)."""
    if o.methode != "plateau" or o.h is None or o.h.h_kw_k is None or o.t_max_c is None:
        return "A"
    if not (o.laeufe >= 1 and o.naechte_b >= regeln.baseline_b_naechte_min and o.plateau_h >= regeln.baseline_b_gesamt_min_h):
        return "A"
    stufe: Stufe = "B"
    s = o.h.evidenz.streuung_rel
    if (o.beobachtungstage >= regeln.baseline_c_tage_min and o.laeufe >= regeln.baseline_c_laeufe_min
            and o.plateau_h >= regeln.baseline_c_plateau_min_h and s is not None and s <= regeln.c_streuung_max):
        stufe = "C"
        if validierung_bestanden(o.guete, regeln):
            stufe = "D"
    return stufe_min(stufe, o.h.evidenz.stufe_hoechstens)


def betriebsabhaengig(h_regulaer: float | None, h_baseline: float | None, regeln: PrognoseRegeln) -> bool | None:
    """Unterscheiden sich reguläres und Baseline-H um mehr als `h_betriebsabweichung_max_rel` (bezogen auf das
    reguläre H)? Dann kein Pooling, Vergleich höchstens C. None, wenn eines fehlt."""
    if h_regulaer is None or h_baseline is None or h_regulaer <= 0:
        return None
    return abs(h_baseline - h_regulaer) / h_regulaer > regeln.h_betriebsabweichung_max_rel


# ---------------------------------------------------------------------- P4a: Prognosestufe (§9.1)
def extrapoliert(ev: HEvidenz | None, delta_k: float, soll_c: float | None, regeln: PrognoseRegeln) -> bool:
    """Liegt ein Intervall mit Bedarf außerhalb des belegten Bereichs? Ohne belegten Bereich keine Aussage (False)."""
    if ev is None or delta_k <= 0:
        return False
    if ev.delta_t_min_k is not None and ev.delta_t_max_k is not None and not (
            regeln.extrapolation_delta_min_faktor * ev.delta_t_min_k <= delta_k
            <= regeln.extrapolation_delta_max_faktor * ev.delta_t_max_k):
        return True
    return (soll_c is not None and ev.soll_min_c is not None and ev.soll_max_c is not None
            and not ev.soll_min_c - regeln.extrapolation_soll_max_k <= soll_c <= ev.soll_max_c + regeln.extrapolation_soll_max_k)


_SCHNELL: dict[tuple[str, Stufe, bool, bool, bool, bool], StufenErgebnis] = {}


def kappen(evidenz: Stufe, methode: str, *, start_unbekannt: bool = False, frost_unvalidiert: bool = False,
           extrapolation: bool = False, duty: bool = False) -> StufenErgebnis:
    """Prognosestufe eines Intervalls aus der Evidenzstufe (gleiche Ergebnisse werden geteilt – viele Intervalle)."""
    schnell = (methode, evidenz, start_unbekannt, frost_unvalidiert, extrapolation, duty)
    if (e := _SCHNELL.get(schnell)) is not None:
        return e
    p = evidenz
    gruende: list[str] = []
    for an, code in ((start_unbekannt, "start_unbekannt"), (frost_unvalidiert, "frost_unvalidiert"),
                     (extrapolation, "extrapolation")):
        if an:
            p = stufe_min(p, "C")
            gruende.append(code)
    if duty:
        p = stufe_min(p, "B")
        gruende.append("duty")
    e = _SCHNELL[schnell] = StufenErgebnis(evidenz, p, methode, extrapolation, tuple(gruende))
    return e


def stufe_gesamt(stufen: Sequence[StufenErgebnis], methode: str = "gesamt") -> StufenErgebnis | None:
    """Minimum über Intervalle bzw. Container – viele gute verdecken keinen schlechten; Gründe vereinigt."""
    if not stufen:
        return None
    gruende = tuple(dict.fromkeys(g for s in stufen for g in s.gruende))
    methoden = {s.methode for s in stufen}
    return StufenErgebnis(stufe_min(*(s.evidenz for s in stufen)), stufe_min(*(s.prognose for s in stufen)),
                          methoden.pop() if len(methoden) == 1 else methode, any(s.extrapolation for s in stufen), gruende)


def evidenz_mit(h: HSchaetzung | DutySchaetzung, validierung: Validierung | None, regeln: PrognoseRegeln) -> Stufe:
    return evidenz_duty(h, regeln) if isinstance(h, DutySchaetzung) else evidenz_h(h, validierung, regeln)


def stufe_mit(
    h: HSchaetzung | DutySchaetzung, validierung: Validierung | None, plan: Sequence[PlanIntervall],
    dynamik: object | None, regeln: PrognoseRegeln, *, anfang: Anfangszustand | None = None,
) -> StufenErgebnis:
    """Prognosestufe „mit Automatik“ über den Plan (Minimum der Intervalle, `prognose_modell.stufen_mit`)."""
    from .prognose_modell import stufen_mit   # noqa: PLC0415 – Modell und Stufe kennen sich gegenseitig

    return stufe_gesamt(stufen_mit(plan, h, validierung, dynamik, anfang, regeln)) or kappen(
        evidenz_mit(h, validierung, regeln), "duty" if isinstance(h, DutySchaetzung) else h.methode,
        duty=isinstance(h, DutySchaetzung))


def stufe_ohne(modell: OhneSchaetzung, plan: Sequence[PlanIntervall], regeln: PrognoseRegeln) -> StufenErgebnis:
    """Prognosestufe des Gegenmodells: eigene Plateau-Evidenz (keine Übernahme von „mit“), Extrapolation → höchstens C."""
    ev = evidenz_ohne(modell, regeln)
    stufen = [kappen(ev, modell.methode, extrapolation=modell.t_max_c is not None and extrapoliert(
        modell.h.evidenz if modell.h is not None else None, modell.t_max_c - iv.aussen_c, None, regeln)) for iv in plan]
    return stufe_gesamt(stufen) or kappen(ev, modell.methode)


def stufe_gespart(mit: StufenErgebnis, ohne: StufenErgebnis, vergleichbar: bool) -> StufenErgebnis:
    """„gespart“: Minimum beider Prognosestufen; nicht vergleichbar → A."""
    p = stufe_min(mit.prognose, ohne.prognose) if vergleichbar else "A"
    gruende = tuple(dict.fromkeys((*mit.gruende, *ohne.gruende, *(() if vergleichbar else ("nicht_vergleichbar",)))))
    return StufenErgebnis(stufe_min(mit.evidenz, ohne.evidenz), p, "vergleich", mit.extrapolation or ohne.extrapolation,
                          gruende)
