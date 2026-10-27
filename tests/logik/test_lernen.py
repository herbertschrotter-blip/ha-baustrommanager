"""Lernende Regelung (0.8): TPI, Nachlauf lernen, K-Werte lernen."""

from datetime import datetime, timedelta, timezone

import pytest

from logik.lernen import (
    KEXT_START,
    KINT_START,
    AUF_N,
    OFFEN_LANG_MIN,
    OFFEN_RUHE_MIN,
    STOPP_AB_MIN,
    Tpi,
    anzeige,
    aufheiz_min,
    band,
    ein_minuten,
    klasse,
    mittel_neu,
    nachlauf_erwartet,
    neuer_stand,
    takt,
    tuer_verlauf,
    tuer_vermutet,
    tpi_anteil,
    tpi_ein,
)

T0 = datetime(2026, 10, 1, 7, 0, tzinfo=timezone(timedelta(hours=2)))


def test_tpi_anteil_mit_nachlauf_und_aussen():
    t = Tpi(kint=0.6, kext=0.01, nachlauf=0.0, aussen=0.0, minute_im_zyklus=0)
    assert tpi_anteil(19.0, 20.0, t) == pytest.approx(0.6 + 0.2)
    # erwarteter Nachlauf 0,8 °C: der Raum gilt schon als 19,8 °C warm – weniger heizen
    assert tpi_anteil(19.0, 20.0, Tpi(0.6, 0.01, 0.8, 0.0, 0)) == pytest.approx(0.6 * 0.2 + 0.2)
    assert tpi_anteil(25.0, 20.0, t) == 0.0 and tpi_anteil(10.0, 20.0, t) == 1.0
    assert tpi_anteil(19.0, 20.0, Tpi(0.6, 0.01, 0.0, None, 0)) == pytest.approx(0.6)


def test_tpi_ein_je_zyklus():
    assert [tpi_ein(0.4, m, heizt_gerade=True) for m in range(10)] == [True] * 4 + [False] * 6   # läuft: bis Fensterende
    assert [tpi_ein(0.4, m) for m in range(10)] == [True] * 3 + [False] * 7   # neu ein nur mit ≥ 2 min Rest
    assert not any(tpi_ein(0.15, m) for m in range(10))     # unter 2 min: gar nicht
    assert all(tpi_ein(0.85, m) for m in range(10))         # über 8 min: durchgehend


def test_tpi_ein_keine_kurzen_laeufe():
    """07.10.2026 (003-01 ein 07:16:55, aus 07:17:00; 002-01 33 s): kein Start kurz vor Fensterende, und ein laufender
    Heizkörper hält zu Beginn des Zyklus mindestens 2 min, auch wenn der Anteil inzwischen geschrumpft ist."""
    assert not tpi_ein(0.23, 1)                             # 2,3 min Fenster, Minute 1: nur 1,3 min Rest – nicht starten
    assert tpi_ein(0.23, 0)                                 # zu Beginn: 2,3 min
    assert tpi_ein(0.12, 1, heizt_gerade=True)              # Anteil auf 12 % gefallen: läuft noch die 2. Minute
    assert not tpi_ein(0.12, 2, heizt_gerade=True)          # danach aus
    assert not tpi_ein(0.0, 1, heizt_gerade=True)           # keine Wärme mehr nötig: sofort aus


def test_klassen_und_baender():
    assert [klasse(m) for m in (5, 15, 44, 45, 60)] == ["kurz", "mittel", "mittel", "lang", "lang"]
    assert band(4.9) == "kalt" and band(5.0) == "mild" and band(None) == "mild"
    log = [(T0, T0 + timedelta(minutes=20)), (T0 + timedelta(minutes=30), None)]
    assert ein_minuten(log, T0 + timedelta(minutes=50)) == pytest.approx(40)


def _lauf(stand, minuten_ein, temperaturen, art="oel", aussen=0.0, soll=20.0, ab=T0):
    """minuten_ein Minuten heizen (zuletzt bei der ersten Temperatur), dann aus mit den Temperaturen je Minute."""
    t = ab
    for _ in range(minuten_ein):
        stand = takt(stand, jetzt=t, heizt=True, innen=temperaturen[0], soll=soll, aussen=aussen, art=art, regelt=True)
        t += timedelta(minutes=1)
    for temp in temperaturen:
        stand = takt(stand, jetzt=t, heizt=False, innen=temp, soll=soll, aussen=aussen, art=art, regelt=True)
        t += timedelta(minutes=1)
    return stand, t


def test_nachlauf_oelradiator_lernen():
    # 60 min geheizt, bei 19,0 aus, steigt 12 min auf 20,2, fällt dann
    temps = [19.0 + 0.1 * i for i in range(13)] + [20.1, 20.0, 19.9]
    s, _ = _lauf(neuer_stand(), 60, temps)
    assert s["beob"] is None and s["zyklen"] == 1
    grad, minuten, n = s["nachlauf"]["oel|lang|kalt"]
    assert grad == pytest.approx(1.2) and minuten == pytest.approx(12) and n == 1
    assert nachlauf_erwartet(s["nachlauf"], "oel", "lang", "kalt") == pytest.approx(1.2)
    assert nachlauf_erwartet(s["nachlauf"], "oel", "lang", "mild") == pytest.approx(1.2)   # anderes Band als Ersatz
    assert nachlauf_erwartet(s["nachlauf"], "konvektor", "lang", "kalt") == 0.0
    assert s["treffer"] == [pytest.approx(0.2)]


def test_konvektor_kaum_nachlauf_und_mittelwert():
    s, t = _lauf(neuer_stand(), 20, [19.9, 20.0, 19.9, 19.7], art="konvektor")
    assert s["nachlauf"]["konvektor|mittel|kalt"][0] == pytest.approx(0.1)
    assert mittel_neu([1.0, 10, 1], 2.0, 20)[:2] == [pytest.approx(1.2), pytest.approx(12)]


def test_kurze_tpi_pause_zaehlt_nicht():
    s, t = _lauf(neuer_stand(), 10, [19.0, 19.1, 19.2])          # 3 min aus, Temperatur steigt noch
    s = takt(s, jetzt=t, heizt=True, innen=19.2, soll=20.0, aussen=0.0, art="oel", regelt=True)
    assert s["beob"] is None and s["nachlauf"] == {} and s["zyklen"] == 0
    assert STOPP_AB_MIN == 20


def test_kint_lernt_aus_ueberschwingern():
    s = neuer_stand()
    t = T0
    for _ in range(3):   # jedes Mal bei 19,6 aus, Spitze 20,8 (deutlich über 20)
        s, t = _lauf(s, 30, [19.6 + 0.2 * i for i in range(7)] + [20.5], ab=t)
    assert s["n_kint"] == 3 and s["kint"] < KINT_START
    a = anzeige(s)
    assert a["kint"]["fort"] == pytest.approx(3 / 50) and a["zyklen"] == 3 and len(a["treffer"]) == 3


def test_kext_lernt_in_ruhigen_zyklen():
    s = neuer_stand()
    t = T0
    for _ in range(25):  # 25 min knapp 0,5 °C unter dem Soll, regelt selbst
        s = takt(s, jetzt=t, heizt=False, innen=19.5, soll=20.0, aussen=0.0, art="oel", regelt=True)
        t += timedelta(minutes=1)
    assert s["n_kext"] == 2 and s["kext"] == pytest.approx(KEXT_START + 0.002)
    # regelt nicht (z. B. Hand): nichts lernen
    s2 = takt(neuer_stand(), jetzt=T0, heizt=False, innen=19.5, soll=20.0, aussen=0.0, art="oel", regelt=False)
    assert s2["zyklus"] is None


# ---------------------------------------------------------------- AN-0004: Aufheizen lernen
def _aufheizen(stand, von, bis, minuten, aussen=0.0, soll=20.0, ab=T0):
    """minuten lang durchgehend heizen, Temperatur linear von → bis, dann aus."""
    t = ab
    for i in range(minuten):
        stand = takt(stand, jetzt=t, heizt=True, innen=von + (bis - von) * i / minuten, soll=soll, aussen=aussen, art="oel", regelt=True)
        t += timedelta(minutes=1)
    stand = takt(stand, jetzt=t, heizt=False, innen=bis, soll=soll, aussen=aussen, art="oel", regelt=True)
    return stand, t + timedelta(hours=3)


def test_aufheizen_lernt_rate_je_band():
    s, t = _aufheizen(neuer_stand(), 15.0, 18.0, 60)             # 3 °C in 60 min (letzte Heizminute 17,95)
    assert s["auf"] is None and s["aufheizen"]["kalt|1"][1] == 1
    assert s["aufheizen"]["kalt|1"][0] == pytest.approx(2.95, abs=0.01)
    assert aufheiz_min(s, innen=16.0, soll=20.0, aussen=0.0) is None     # erst ab AUF_N Messungen
    for _ in range(AUF_N - 1):
        s, t = _aufheizen(s, 15.0, 18.0, 60, ab=t)
    assert s["aufheizen"]["kalt|1"][1] == AUF_N
    assert aufheiz_min(s, innen=16.0, soll=20.0, aussen=0.0) == 85        # 4 °C / 2,95 °C/h = 81,4 → 85 min
    assert aufheiz_min(s, innen=21.0, soll=20.0, aussen=0.0) == 0
    assert aufheiz_min(s, innen=16.0, soll=20.0, aussen=10.0) is None     # mild: noch nichts gelernt
    a = anzeige(s)
    assert a["aufheizen"]["kalt|1"]["n"] == AUF_N and a["auf_n"] == AUF_N


def test_aufheizen_zaehlt_nicht_nahe_am_soll_oder_zu_kurz():
    s, _ = _aufheizen(neuer_stand(), 19.5, 20.0, 60)               # beginnt nur 0,5 °C unter dem Soll
    assert s["aufheizen"] == {}
    s, _ = _aufheizen(neuer_stand(), 15.0, 16.0, 10)               # zu kurz
    assert s["aufheizen"] == {}
    s, _ = _aufheizen(neuer_stand(), 15.0, 21.0, 120)              # erreicht das Soll: endet dort
    assert s["aufheizen"]["kalt|1"][1] == 1 and s["auf"] is None


def test_aufheizen_je_anzahl_heizkoerper():
    s, t = neuer_stand(), T0
    for _ in range(AUF_N):
        tt = t
        for i in range(60):   # zwei Heizkörper: 4 °C je Stunde
            s = takt(s, jetzt=tt, heizt=True, innen=15.0 + 4.0 * i / 60, soll=20.0, aussen=0.0, art="oel", regelt=True, anzahl=2)
            tt += timedelta(minutes=1)
        s = takt(s, jetzt=tt, heizt=False, innen=19.0, soll=20.0, aussen=0.0, art="oel", regelt=True, anzahl=0)
        t = tt + timedelta(hours=3)
    assert "kalt|2" in s["aufheizen"] and "kalt|1" not in s["aufheizen"]
    assert aufheiz_min(s, innen=16.0, soll=20.0, aussen=0.0, anzahl=2) == 65      # 4 °C / 3,93 °C/h
    assert aufheiz_min(s, innen=16.0, soll=20.0, aussen=0.0, anzahl=1) is None
    # Zusatz kommt mitten im Aufheizen dazu: die Messung mit einem endet, eine neue mit zweien beginnt
    s2, tt = neuer_stand(), T0
    for i in range(30):
        s2 = takt(s2, jetzt=tt, heizt=True, innen=15.0 + i * 0.02, soll=20.0, aussen=0.0, art="oel", regelt=True, anzahl=1)
        tt += timedelta(minutes=1)
    s2 = takt(s2, jetzt=tt, heizt=True, innen=15.6, soll=20.0, aussen=0.0, art="oel", regelt=True, anzahl=2)
    assert s2["aufheizen"]["kalt|1"][1] == 1 and s2["auf"]["n"] == 2


# ---------------------------------------------------------------- WU-0009: Tür offen schützt das Lernen
def _heizen(s, t, temps, aussen=5.0, tuer=False):
    for temp in temps:
        s = takt(s, jetzt=t, heizt=True, innen=temp, soll=20.0, aussen=aussen, art="oel", regelt=True, tuer_offen=tuer)
        t += timedelta(minutes=1)
    return s, t


def test_tuer_vermutet_beim_heizen_kaelter():
    s, t = _heizen(neuer_stand(), T0, [16.0 + 0.05 * i for i in range(10)])        # heizt, wird wärmer: Aufheizen läuft
    assert s["auf"] is not None and s["offen"] is None
    s, t = _heizen(s, t, [16.5 - 0.04 * i for i in range(12)])                       # beim Heizen 0,44 °C kälter
    assert s["offen"]["art"] == "vermutet" and s["auf"] is None and s["aufheizen"] == {}
    assert anzeige(s)["offen"]["art"] == "vermutet"
    # wieder wärmer: nach der Ruhezeit beginnt eine neue Messung
    s, t = _heizen(s, t, [16.1 + 0.03 * i for i in range(OFFEN_RUHE_MIN + 2)])
    assert s["offen"] is None and s["auf"] is not None


def test_draussen_kaelter_ist_keine_offene_tuer():
    s, t = _heizen(neuer_stand(), T0, [17.0 - 0.04 * i for i in range(12)], aussen=5.0)
    assert s["offen"] is not None
    v = [[(T0 + timedelta(minutes=i)).isoformat(), 17.0 - 0.04 * i, 5.0 - 0.1 * i, True] for i in range(11)]
    assert tuer_vermutet(v, T0 + timedelta(minutes=10)) is False                       # draußen 1 °C kälter
    v2 = [[x[0], x[1], 5.0, x[3]] for x in v]
    assert tuer_vermutet(v2, T0 + timedelta(minutes=10)) is True
    v3 = [[x[0], x[1], 5.0, i != 4] for i, x in enumerate(v)]
    assert tuer_vermutet(v3, T0 + timedelta(minutes=10)) is False                      # nicht durchgehend geheizt


def test_tuer_vermutet_bei_taktendem_radiator():
    """FE-0025: Plug durchgehend an, der Radiator taktet mit eigenem Thermostat (3 min Strom, 4 min nicht), der Raum
    fällt um 0,27 °C je 10 min (zu wenig für 10 min) – über 30 min ist die Tür vermutlich offen."""
    t, v = T0, []
    for i in range(31):
        v = tuer_verlauf(v, jetzt=t, innen=19.1 - 0.027 * i, aussen=5.0, heizt=i % 7 < 3, an=True)
        t += timedelta(minutes=1)
    jetzt = t - timedelta(minutes=1)
    assert tuer_vermutet(v, jetzt) is True
    assert len(v) == OFFEN_LANG_MIN + 1                                                # nur die letzten 30 min
    # Plug eine Minute aus (Pause der Regelung): kein Heizen über das ganze Fenster → keine Vermutung
    assert tuer_vermutet([x[:4] + [x[4] and i != 15] for i, x in enumerate(v)], jetzt) is False
    # Radiator zieht gar keinen Strom (Thermostat zufrieden) → keine Vermutung
    assert tuer_vermutet([x[:3] + [False, True] for x in v], jetzt) is False
    # draußen 1 °C kälter → keine Vermutung
    assert tuer_vermutet([[x[0], x[1], 5.0 - 0.033 * i, x[3], x[4]] for i, x in enumerate(v)], jetzt) is False


def test_vermutung_vom_aufrufer():
    """FE-0025: die Vermutung kommt vom Aufrufer (auch ohne Lernen erkannt) – takt übernimmt sie."""
    s, t = _heizen(neuer_stand(), T0, [16.0 + 0.05 * i for i in range(10)])
    s = takt(s, jetzt=t, heizt=True, innen=16.5, soll=20.0, aussen=5.0, art="oel", regelt=True, vermutet=True)
    assert s["offen"]["art"] == "vermutet" and s["auf"] is None
    s2 = takt(neuer_stand(), jetzt=t, heizt=True, innen=16.5, soll=20.0, aussen=5.0, art="oel", regelt=True, vermutet=False)
    assert s2["offen"] is None


def test_tuerkontakt_verwirft_nachlauf_und_zyklus():
    s, t = _lauf(neuer_stand(), 30, [19.0, 19.2])                                      # nach dem Ausschalten: Nachlauf wird beobachtet
    assert s["beob"] is not None
    s = takt(s, jetzt=t, heizt=False, innen=19.3, soll=20.0, aussen=0.0, art="oel", regelt=True, tuer_offen=True)
    assert s["beob"] is None and s["offen"]["art"] == "kontakt" and s["nachlauf"] == {}


def test_von_hand_wird_nichts_gelernt():
    """Szenarien (Herbert 01.10.2026): Hand-Zyklen lernen weder Aufheizen noch Nachlauf noch K innen."""
    s, t = neuer_stand(), T0
    for i in range(30):
        s = takt(s, jetzt=t, heizt=True, innen=16.0 + 0.05 * i, soll=20.0, aussen=0.0, art="oel", regelt=False, hand=True)
        t += timedelta(minutes=1)
    s = takt(s, jetzt=t, heizt=False, innen=19.6, soll=20.0, aussen=0.0, art="oel", regelt=False, hand=True)
    assert s["auf"] is None and s["beob"] is None and s["aufheizen"] == {}


def test_ende_von_schnell_aufheizen_lernt_kein_k_innen():
    s, t = _lauf(neuer_stand(), 30, [19.6, 19.8, 20.0, 20.2, 20.4, 20.6, 20.4])
    assert s["n_kint"] == 1                                         # Regelung schaltet aus: K innen wird gelernt
    s2, t2 = neuer_stand(), T0
    for _ in range(30):
        s2 = takt(s2, jetzt=t2, heizt=True, innen=19.6, soll=20.0, aussen=0.0, art="oel", regelt=True)
        t2 += timedelta(minutes=1)
    s2 = takt(s2, jetzt=t2, heizt=False, innen=19.6, soll=20.0, aussen=0.0, art="oel", regelt=True, kint_ok=False)
    for temp in (19.8, 20.0, 20.2, 20.4, 20.6, 20.4):
        t2 += timedelta(minutes=1)
        s2 = takt(s2, jetzt=t2, heizt=False, innen=temp, soll=20.0, aussen=0.0, art="oel", regelt=True)
    assert s2["zyklen"] == 1 and s2["n_kint"] == 0                  # Nachlauf ja, K innen nein
