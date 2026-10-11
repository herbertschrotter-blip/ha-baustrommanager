"""Prognose V2: alle Prognoseschwellen an genau einer Stelle (Bauvorlage CGR-2026-10-11-hochrechnung r5 §2.5) – ohne HA-Code.

Unveränderliche Defaults, keine Einstellung auf der Seite. Die Schwellen sind Implementierungswerte, keine normativen
Grenzwerte. Frost-Ein/Aus, Heizgrenze, Leistungsreferenz, Komfort-Soll und TPI sind bestehende Betriebsparameter und
stehen hier nicht; die Energiedefinition kommt aus `minute`/`zaehlen`, die Gewichte des gleitenden Solls aus `soll`.
"""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class PrognoseRegeln:
    """Schwellen der Prognose V2 (Anwendung: Bauvorlage §6–§9)."""

    abdeckung_min: float = 0.95
    gemeinsame_luecke_max_s: int = 300
    messalter_max_s: int = 120
    ersatz_konstanz_max_s: int = 1800
    sensor_aufloesung_k: float = 0.1
    puls_minuten_min: int = 5
    puls_rel_min: float = 0.8
    puls_rel_max: float = 1.2
    tuer_offen_max_s: int = 60
    start_pause_min: int = 30
    start_sollsprung_k: float = 1.0
    start_vorlauf_min: int = 10
    start_gueltig_min: int = 8
    tagesfit_start_max_k: float = 2.0
    tagesfit_aktiv_min_h: float = 4.0
    tagesfit_gdh_min_kh: float = 20.0
    tagesfit_tage_min: int = 3
    konvektor_vorlauf_min: int = 60
    oel_vorlauf_min: int = 120
    konvektor_fenster_min: int = 120
    oel_fenster_min: int = 180
    soll_spanne_max_k: float = 0.5
    innen_spanne_max_k: float = 0.6
    innen_trend_max_k_h: float = 0.1
    randmittel_dauer_min: int = 15
    randmittel_diff_max_k: float = 0.3
    innen_aussen_min_k: float = 5.0
    sollnaehe_max_k: float = 0.7
    sollnaehe_anteil_min: float = 0.9
    duty_fenster_min: float = 0.05
    duty_fenster_max: float = 0.90
    zyklen_min: int = 3
    mad_faktor: float = 1.4826
    ausreisser_tage_min: int = 5
    ausreisser_mad_faktor: float = 3.0
    ausreisser_rel_min: float = 0.30
    c_fenster_min: int = 12
    c_tage_min: int = 3
    c_stunden_min_h: float = 24.0
    c_streuung_max: float = 0.30
    d_fenster_min: int = 30
    d_tage_min: int = 7
    d_streuung_max: float = 0.15
    h_band_c_min_rel: float = 0.30
    h_band_d_min_rel: float = 0.15
    h_band_ersatz_min_rel: float = 0.50
    h_band_streuung_faktor: float = 2.0
    h_betriebsabweichung_max_rel: float = 0.25
    validierung_tage_min: int = 7
    validierung_aussen_spanne_min_k: float = 6.0
    validierung_wape_max: float = 0.20
    validierung_bias_abs_max: float = 0.10
    extrapolation_delta_min_faktor: float = 0.75
    extrapolation_delta_max_faktor: float = 1.25
    extrapolation_soll_max_k: float = 1.0
    winter_delta_k: float = 1.5
    tagesgang_amplitude_k: float = 3.0
    tagesgang_minimum_stunde: int = 5
    baseline_versuch_min_h: float = 24.0
    baseline_bevorzugt_h: float = 48.0
    baseline_vorlauf_konvektor_h: float = 2.0
    baseline_vorlauf_oel_h: float = 4.0
    baseline_block_max_h: float = 6.0
    baseline_b_naechte_min: int = 2
    baseline_b_nacht_min_h: float = 3.0
    baseline_b_gesamt_min_h: float = 6.0
    baseline_c_tage_min: int = 3
    baseline_c_laeufe_min: int = 2
    baseline_c_plateau_min_h: float = 12.0
    tmax_band_min_k: float = 1.0
    tmax_nacht_diff_max_k: float = 2.0
    startfit_anstieg_min_k: float = 2.0
    startfit_starts_min: int = 8
    startfit_tage_min: int = 4
    startfit_spanne_min_k: float = 3.0
    startfit_streuung_max: float = 0.30
    startfit_negative_z_max_anteil: float = 0.20
    startfit_holdout_min: int = 5
    startfit_wape_max: float = 0.25
    startfit_bias_abs_max: float = 0.15
    startfit_temp_rmse_max_k: float = 0.5
    abkuehl_episode_min_h: float = 2.0
    abkuehl_abnahme_min_k: float = 1.0
    abkuehl_naechte_min: int = 3
    abkuehl_gesamt_min_h: float = 6.0
    abkuehl_rmse_max_k: float = 0.3
    abkuehl_streuung_max: float = 0.30
    c_auf_ab_verhaeltnis_max: float = 2.0
    frost_holdout_episoden_min: int = 3
    frost_holdout_naechte_min: int = 2
    frost_wape_max: float = 0.25
    frost_temp_rmse_max_k: float = 0.5
    ohne_wetter_tage_min: int = 10
    ohne_wetter_laeufe_min: int = 3
    ohne_wetter_untersaettigt_tage_min: int = 5
    ohne_wetter_duty_min: float = 0.10
    ohne_wetter_duty_max: float = 0.90
    ohne_wetter_extrapolation_max_k: float = 2.0
