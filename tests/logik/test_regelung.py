"""Soll je Container – jede Stufe der Reihenfolge einzeln, Beispielzahlen aus dem Mockup."""

from dataclasses import replace

from logik.arbeitszeit import Plan
from logik.regelung import LageContainer, Soll, SollGrund, soll_container


def t(hh: int, mm: int = 0) -> int:
    return hh * 60 + mm


# Mockup: Arbeitszeit 07:00–16:30, Vorheizen 45, Nachheizen 15, Trocknen 45, Frühstart 30 → 05:45–17:30
PLAN = Plan(start=t(5, 45), vor=t(6, 15), a=t(7), b=t(16, 30), nach=t(16, 45), ende=t(17, 30))
TUER_PAUSE = 3

GRUND = LageContainer(
    minute=t(10),
    plan=PLAN,
    automatik=True,
    auto=True,
    temperatur=None,
    soll=20.0,
    frost=True,
    frost_grenze=5.0,
    zu_warm=False,
    frei=False,
    tuer_offen_min=None,
    bedarf=False,
    bedarf_aktiv=False,
    boost=False,
    heizt_gerade=False,
)


def soll(**kw) -> Soll:
    return soll_container(replace(GRUND, **kw), TUER_PAUSE)


def test_automatik_aus_schaltet_nichts():
    assert soll(automatik=False, temperatur=2.0) == Soll(None, SollGrund.AUTOMATIK_AUS)


def test_frost_gilt_immer():
    kalt = dict(temperatur=4.2)
    assert soll(**kalt) == Soll(True, SollGrund.FROST)
    assert soll(**kalt, minute=t(22)) == Soll(True, SollGrund.FROST)
    assert soll(**kalt, auto=False) == Soll(True, SollGrund.FROST)
    assert soll(**kalt, tuer_offen_min=6) == Soll(True, SollGrund.FROST)
    assert soll(**kalt, frei=True, zu_warm=True) == Soll(True, SollGrund.FROST)
    assert soll(**kalt, bedarf=True) == Soll(True, SollGrund.FROST)
    assert soll(**kalt, frost=False, minute=t(22)) == Soll(False, SollGrund.AUSSERHALB)
    # hält bis Grenze + 2 °C
    assert soll(temperatur=6.5, minute=t(22), frost_vorher=True) == Soll(True, SollGrund.FROST)
    assert soll(temperatur=7.0, minute=t(22), frost_vorher=True).grund is SollGrund.AUSSERHALB
    assert soll(temperatur=6.5, minute=t(22)).grund is SollGrund.AUSSERHALB
    # ohne Fühler kein Frostschutz
    assert soll(minute=t(22)).grund is SollGrund.AUSSERHALB


def test_tuer_offen_nach_pause():
    assert soll(tuer_offen_min=6) == Soll(False, SollGrund.TUER_OFFEN)  # Mockup Magazin: 6 min offen
    assert soll(tuer_offen_min=3) == Soll(False, SollGrund.TUER_OFFEN)
    assert soll(tuer_offen_min=2.5) == Soll(True, SollGrund.ARBEITSZEIT)
    assert soll(tuer_offen_min=6, boost=True) == Soll(False, SollGrund.TUER_OFFEN)
    assert soll(tuer_offen_min=6, auto=False) == Soll(None, SollGrund.HAND)   # Hand: die Tür schaltet nichts (Szenarien)


def test_container_automatik_aus_ist_hand():
    assert soll(auto=False) == Soll(None, SollGrund.HAND)
    assert soll(auto=False, boost=True) == Soll(None, SollGrund.HAND)


def test_boost():
    # ohne Fühler: solange boost läuft, auch außerhalb, an freien Tagen und über der Heizgrenze
    assert soll(boost=True, minute=t(20)) == Soll(True, SollGrund.BOOST)
    assert soll(boost=True, frei=True, zu_warm=True) == Soll(True, SollGrund.BOOST)
    assert soll(boost=True, bedarf=True) == Soll(True, SollGrund.BOOST)
    # mit Fühler bis zum Soll, danach die normale Regel
    assert soll(boost=True, minute=t(20), temperatur=19.9) == Soll(True, SollGrund.BOOST)
    assert soll(boost=True, minute=t(20), temperatur=20.0) == Soll(False, SollGrund.AUSSERHALB)


def test_taste_am_plug():
    """BSM-018: Taste = 1 h heizen in jedem Modus (auch aus, frei, über der Heizgrenze, außerhalb) – mit Fühler bis zum Soll."""
    assert soll(taste=True, minute=t(20)) == Soll(True, SollGrund.TASTE)
    assert soll(taste=True, frei=True, zu_warm=True, modus="aus") == Soll(True, SollGrund.TASTE)
    assert soll(taste=True, minute=t(20), temperatur=19.0) == Soll(True, SollGrund.TASTE)
    assert soll(taste=True, minute=t(20), temperatur=20.5) == Soll(False, SollGrund.TASTE)   # Soll erreicht: Thermostat
    assert soll(taste=True, auto=False) == Soll(None, SollGrund.HAND)                       # Hand geht vor
    assert soll(taste=True, temperatur=3.0).grund == SollGrund.FROST                         # Frostschutz geht vor
    assert soll(taste=True, minute=t(20), tuer_offen_min=5).grund == SollGrund.TUER_OFFEN   # offene Tür pausiert


def test_bedarf_aktiv_und_bereit():
    assert soll(bedarf=True, bedarf_aktiv=True, minute=t(20)) == Soll(True, SollGrund.BEDARF)
    assert soll(bedarf=True, bedarf_aktiv=True, frei=True, zu_warm=True) == Soll(True, SollGrund.BEDARF)
    # Bedarfs-Container heizt nicht nach der Arbeitszeit
    assert soll(bedarf=True) == Soll(False, SollGrund.BEREIT)
    # mit Fühler regelt der Thermostat
    assert soll(bedarf=True, bedarf_aktiv=True, temperatur=20.5) == Soll(False, SollGrund.BEDARF)
    assert soll(bedarf=True, bedarf_aktiv=True, temperatur=19.5) == Soll(True, SollGrund.BEDARF)


def test_frei():
    assert soll(frei=True) == Soll(False, SollGrund.FREI)
    assert soll(frei=True, zu_warm=True) == Soll(False, SollGrund.FREI)


def test_heizgrenze():
    assert soll(zu_warm=True) == Soll(False, SollGrund.HEIZGRENZE)
    assert soll(zu_warm=True, temperatur=12.0) == Soll(False, SollGrund.HEIZGRENZE)


def test_ohne_fuehler_ein_im_fenster_mit_abschnitt():
    assert soll(minute=t(5, 45)) == Soll(True, SollGrund.FRUEHSTART)
    assert soll(minute=t(6, 15)) == Soll(True, SollGrund.VORHEIZEN)
    assert soll(minute=t(7)) == Soll(True, SollGrund.ARBEITSZEIT)
    assert soll(minute=t(16, 30)) == Soll(True, SollGrund.NACHHEIZEN)
    assert soll(minute=t(17)) == Soll(True, SollGrund.TROCKNEN)


def test_ausserhalb_aus():
    assert soll(minute=t(5, 44)) == Soll(False, SollGrund.AUSSERHALB)
    assert soll(minute=t(17, 30)) == Soll(False, SollGrund.AUSSERHALB)  # Ende gehört nicht mehr dazu
    assert soll(plan=None) == Soll(False, SollGrund.AUSSERHALB)


def test_thermostat_mit_hysterese():
    # Soll 20 °C, Toleranz 0,3: ein ab 19,7, aus ab 20,3
    assert soll(temperatur=19.7) == Soll(True, SollGrund.ARBEITSZEIT)
    assert soll(temperatur=19.8) == Soll(False, SollGrund.ARBEITSZEIT)
    assert soll(temperatur=19.8, heizt_gerade=True) == Soll(True, SollGrund.ARBEITSZEIT)
    assert soll(temperatur=20.2, heizt_gerade=True) == Soll(True, SollGrund.ARBEITSZEIT)
    assert soll(temperatur=20.3, heizt_gerade=True) == Soll(False, SollGrund.ARBEITSZEIT)
    assert soll(temperatur=19.8, toleranz=0.1) == Soll(True, SollGrund.ARBEITSZEIT)
    assert soll(temperatur=19.4, soll=22.0, minute=t(17)) == Soll(True, SollGrund.TROCKNEN)


def test_thermostat_rundung_der_schwellen():
    # 19,9 − 0,3 ergibt als float 19,5999…; 19,6 °C muss trotzdem einschalten
    assert soll(temperatur=19.6, soll=19.9) == Soll(True, SollGrund.ARBEITSZEIT)
    assert soll(temperatur=19.4, soll=19.1, heizt_gerade=True) == Soll(False, SollGrund.ARBEITSZEIT)


def test_frost_grenze_genau():
    assert soll(temperatur=5.0, minute=t(22)).grund is SollGrund.AUSSERHALB  # „unter“ der Grenze
    assert soll(temperatur=4.9, minute=t(22)) == Soll(True, SollGrund.FROST)
    assert soll(temperatur=4.9, automatik=False) == Soll(None, SollGrund.AUTOMATIK_AUS)


def test_tuer_ohne_kontakt_und_bedarf():
    assert soll(tuer_offen_min=None) == Soll(True, SollGrund.ARBEITSZEIT)
    assert soll(tuer_offen_min=0) == Soll(True, SollGrund.ARBEITSZEIT)
    assert soll(tuer_offen_min=3, bedarf=True, bedarf_aktiv=True) == Soll(False, SollGrund.TUER_OFFEN)


def test_bedarf_ohne_plan_und_hysterese():
    assert soll(bedarf=True, bedarf_aktiv=True, plan=None) == Soll(True, SollGrund.BEDARF)
    assert soll(bedarf=True, plan=None, minute=t(10)) == Soll(False, SollGrund.BEREIT)
    assert soll(bedarf=True, bedarf_aktiv=True, temperatur=20.0, heizt_gerade=True) == Soll(True, SollGrund.BEDARF)


# ---- aus 0.6.3 zurück (Herbert 30.09.2026): Modus je Container, Frostschutz ein/aus, Urlaub/Feiertag
def test_modus_zeitplan_heizt_mit_fuehler_ueber_soll():
    """Zeitplan: in der Heizzeit an, auch wenn der Fühler das Soll schon erreicht hat (Heizkörper regelt selbst)."""
    assert soll(temperatur=22.0, modus="plan") == Soll(True, SollGrund.ARBEITSZEIT)
    assert soll(temperatur=22.0, modus="thermo") == Soll(False, SollGrund.ARBEITSZEIT)


def test_modus_zeitplan_ausserhalb_aus():
    assert soll(minute=t(20), temperatur=12.0, modus="plan") == Soll(False, SollGrund.AUSSERHALB)


def test_modus_aus_nur_frostschutz():
    assert soll(temperatur=12.0, modus="aus") == Soll(False, SollGrund.AUS)
    assert soll(temperatur=3.0, modus="aus") == Soll(True, SollGrund.FROST)


def test_modus_aus_laesst_schnell_aufheizen_zu():
    assert soll(temperatur=12.0, modus="aus", boost=True) == Soll(True, SollGrund.BOOST)


def test_frostschutz_aus_ueber_eigenem_wert():
    assert soll(minute=t(22), temperatur=6.5, frost_vorher=True, frost_aus=8.0) == Soll(True, SollGrund.FROST)
    assert soll(minute=t(22), temperatur=8.0, frost_vorher=True, frost_aus=8.0) == Soll(False, SollGrund.AUSSERHALB)
    assert soll(minute=t(22), temperatur=6.0, frost_aus=8.0) == Soll(False, SollGrund.AUSSERHALB)


def test_frostschutz_aus_unter_grenze_gilt_grenze_plus_2():
    assert soll(minute=t(22), temperatur=6.9, frost_vorher=True, frost_aus=4.0) == Soll(True, SollGrund.FROST)
    assert soll(minute=t(22), temperatur=7.0, frost_vorher=True, frost_aus=4.0) == Soll(False, SollGrund.AUSSERHALB)


def test_urlaub_nur_frostschutz():
    assert soll(frei=True, temperatur=8.0) == Soll(False, SollGrund.FREI)
    assert soll(frei=True, temperatur=4.0) == Soll(True, SollGrund.FROST)


def test_urlaub_absenken_mit_fuehler():
    assert soll(frei=True, frei_modus="absenk", absenk=10.0, temperatur=9.0) == Soll(True, SollGrund.ABSENKEN)
    assert soll(frei=True, frei_modus="absenk", absenk=10.0, temperatur=10.5) == Soll(False, SollGrund.ABSENKEN)
    assert soll(frei=True, frei_modus="absenk", absenk=10.0, temperatur=10.1, heizt_gerade=True) == Soll(True, SollGrund.ABSENKEN)


def test_urlaub_absenken_ohne_fuehler_nur_frostschutz():
    assert soll(frei=True, frei_modus="absenk", temperatur=None) == Soll(False, SollGrund.FREI)


def test_urlaub_alles_aus_auch_kein_frostschutz():
    assert soll(frei=True, frei_modus="aus", temperatur=2.0) == Soll(False, SollGrund.FREI)
    assert soll(frei=False, frei_modus="aus", temperatur=2.0) == Soll(True, SollGrund.FROST)


def test_frostschutz_bei_automatik_aus_nur_mit_schalter():
    assert soll(automatik=False, temperatur=3.0) == Soll(None, SollGrund.AUTOMATIK_AUS)
    assert soll(automatik=False, temperatur=3.0, frost_immer=True) == Soll(True, SollGrund.FROST)
    assert soll(automatik=False, temperatur=6.0, frost_immer=True, frost_vorher=True) == Soll(True, SollGrund.FROST)
    assert soll(automatik=False, temperatur=7.5, frost_immer=True, frost_vorher=True) == Soll(False, SollGrund.AUTOMATIK_AUS)
    assert soll(automatik=False, temperatur=7.5, frost_immer=True) == Soll(None, SollGrund.AUTOMATIK_AUS)


# ---------------------------------------------------------------- FE-0004: Ende des Handbetriebs
from logik.regelung import HandEnde, hand_ende  # noqa: E402


def _hand(**x):
    werte = dict(grund=SollGrund.AUSSERHALB, phase_vorher=False, phase=False, an=True, temperatur=24.0, soll=20.0,
                 minuten=80.0, max_minuten=480.0)
    werte.update(x)
    return hand_ende(**werte)


def test_hand_endet_mit_fuehler_am_soll():
    # Fall aus dem Ticket: um 19:01 außerhalb der Heizzeit per Hand gestartet, 26,5 °C bei Soll 20 – vorher erst morgens
    assert _hand(temperatur=26.5) == HandEnde.SOLL
    assert _hand(temperatur=19.5) is None                      # noch unter dem Soll: bleibt
    assert _hand(temperatur=None) is None                      # ohne Fühler: bleibt
    assert _hand(an=False, temperatur=26.5) is None            # Hand-Aus endet nicht am Soll


def test_hand_endet_nach_hoechstdauer_und_am_schaltpunkt():
    assert _hand(temperatur=19.0, minuten=480.0) is None                      # Nachricht kommt, 30 min Frist
    assert _hand(temperatur=19.0, minuten=510.0) == HandEnde.DAUER           # keine Antwort: Automatik
    assert _hand(temperatur=19.0, minuten=510.0, lassen=True) is None        # „So lassen“: bleibt
    assert _hand(temperatur=19.0, phase=True) == HandEnde.SCHALTPUNKT


def test_hand_nachfrist_einstellbar():
    """AN-0012: die Frist nach der Nachricht ist einstellbar (Standard 30 min)."""
    assert _hand(temperatur=19.0, minuten=500.0, nachfrist_min=15) == HandEnde.DAUER
    assert _hand(temperatur=19.0, minuten=500.0) is None
    assert _hand(temperatur=19.0, minuten=480.0, nachfrist_min=0) == HandEnde.DAUER


def test_frost_und_tuer_gehen_vor():
    assert _hand(grund=SollGrund.FROST, temperatur=2.0) == HandEnde.VORRANG
    assert _hand(grund=SollGrund.TUER_OFFEN, temperatur=18.0) == HandEnde.VORRANG


# ---------------------------------------------------------------- 0.8: lernende Regelung (TPI) statt Hysterese
from logik.lernen import Tpi  # noqa: E402


def test_lernend_regelt_nach_tpi():
    werte = dict(temperatur=19.0, heizt_gerade=True)
    # Hysterese: 19,0 < 20,3 → ein; TPI mit Nachlauf 1,0: Anteil 0,6·0 + 0,01·20 = 20 % → Minute 1 ein, Minute 5 aus
    assert soll(**werte) == Soll(True, SollGrund.ARBEITSZEIT)
    tpi = lambda m: Tpi(kint=0.6, kext=0.01, nachlauf=1.0, aussen=0.0, minute_im_zyklus=m)  # noqa: E731
    assert soll(**werte, tpi=tpi(1)) == Soll(True, SollGrund.ARBEITSZEIT)
    assert soll(**werte, tpi=tpi(5)) == Soll(False, SollGrund.ARBEITSZEIT)


def test_frost_im_modus_hand_endet():
    """Szenario-Befund: Frostschutz im Modus Hand schaltet nach dem Frost einmal aus, danach nichts mehr."""
    assert soll(minute=t(22), temperatur=4.0, auto=False) == Soll(True, SollGrund.FROST)
    assert soll(minute=t(22), temperatur=8.0, auto=False, frost_vorher=True) == Soll(False, SollGrund.HAND)
    assert soll(minute=t(22), temperatur=8.0, auto=False, frost_vorher=False) == Soll(None, SollGrund.HAND)


def test_tuer_pausiert_nur_wenn_sonst_geheizt_wuerde():
    """Szenarien (Herbert 01.10.2026): außerhalb der Heizzeit, Modus aus oder bereit ist die offene Tür nur ein Hinweis."""
    assert soll(tuer_offen_min=10, minute=t(22)) == Soll(False, SollGrund.AUSSERHALB)
    assert soll(tuer_offen_min=10, modus="aus") == Soll(False, SollGrund.AUS)
    # läuft gerade ein Heizkörper (z. B. von Hand), pausiert die Tür trotzdem
    assert soll(tuer_offen_min=10, minute=t(22), laeuft_gerade=True) == Soll(False, SollGrund.TUER_OFFEN)
    assert soll(tuer_offen_min=6, auto=False, laeuft_gerade=True) == Soll(False, SollGrund.TUER_OFFEN)
    # die Pause hält, solange die Tür offen ist – auch wenn danach nichts mehr läuft
    assert soll(tuer_offen_min=8, auto=False, tuer_vorher=True) == Soll(False, SollGrund.TUER_OFFEN)
    assert soll(tuer_offen_min=None, auto=False, tuer_vorher=True) == Soll(None, SollGrund.HAND)


def test_frostschutz_ohne_fuehler_nach_aussen():
    """Ohne Fühler: ein unter `frost_aussen`, aus erst ab `frost_aussen` + 2 °C."""
    assert soll(minute=t(22), temperatur=None, aussen=-4.0, frost_aussen=-3.0) == Soll(True, SollGrund.FROST)
    assert soll(minute=t(22), temperatur=None, aussen=-2.0, frost_aussen=-3.0).grund is SollGrund.AUSSERHALB
    assert soll(minute=t(22), temperatur=None, aussen=-2.0, frost_aussen=-3.0, frost_vorher=True) == Soll(True, SollGrund.FROST)
    assert soll(minute=t(22), temperatur=None, aussen=-1.0, frost_aussen=-3.0, frost_vorher=True).grund is not SollGrund.FROST
    assert soll(minute=t(22), temperatur=None, aussen=-8.0, frost_aussen=None).grund is SollGrund.AUSSERHALB   # ausgeschaltet


def test_letzter_wert_ueberbrueckt():
    from datetime import datetime, timedelta
    from logik.regelung import FUEHLER_HALTEN_MIN, letzter_wert
    t0 = datetime(2026, 10, 1, 7, 0)
    assert letzter_wert(19.0, (t0, 18.0), t0, 15) == 19.0
    assert letzter_wert(None, (t0, 18.0), t0 + timedelta(minutes=FUEHLER_HALTEN_MIN), 15) == 18.0
    assert letzter_wert(None, (t0, 18.0), t0 + timedelta(minutes=16), 15) is None
    assert letzter_wert(None, None, t0, 15) is None


def test_im_plan_auch_satt_und_tuer_offen():
    """AN-0017: Rangliste der Staffelung – im Plan ist, wer laut Plan gerade dran ist, auch satt oder mit offener Tür."""
    from logik.regelung import im_plan, ruhe_grund
    lage = lambda **kw: replace(GRUND, **kw)
    satt = lage(temperatur=21.0)            # Thermostat: Soll erreicht, Arbeitszeit läuft
    assert soll(temperatur=21.0) == Soll(False, SollGrund.ARBEITSZEIT)
    assert im_plan(satt, soll(temperatur=21.0)) and ruhe_grund(satt, soll(temperatur=21.0)) == "satt"
    tuer = lage(tuer_offen_min=6, heizt_gerade=True)
    assert soll(tuer_offen_min=6, heizt_gerade=True).grund is SollGrund.TUER_OFFEN
    assert im_plan(tuer, soll(tuer_offen_min=6, heizt_gerade=True)) and ruhe_grund(tuer, soll(tuer_offen_min=6, heizt_gerade=True)) == "tuer_offen"
    heizt = lage(temperatur=18.0)
    assert im_plan(heizt, soll(temperatur=18.0)) and ruhe_grund(heizt, soll(temperatur=18.0)) == ""
    for kw in ({"minute": t(22)}, {"frei": True}, {"zu_warm": True}, {"automatik": False}, {"auto": False}):
        assert not im_plan(lage(**kw), soll(**kw)), kw   # außerhalb, frei, Heizgrenze, Automatik aus, Hand
    assert not im_plan(lage(minute=t(22), tuer_offen_min=6), soll(minute=t(22), tuer_offen_min=6))
