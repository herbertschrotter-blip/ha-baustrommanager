"""Lernende Regelung (0.8): TPI, Nachlauf lernen, K-Werte lernen."""

from datetime import datetime, timedelta, timezone

import pytest

from logik.lernen import (
    KEXT_START,
    KINT_START,
    AUF_N,
    OFFEN_LANG_MIN,
    OFFEN_RUHE_MIN,
    OFFEN_SCHNELL_ABFALL,
    OFFEN_SCHNELL_MIN,
    SPERRE_NACH_MIN,
    STOPP_AB_MIN,
    Tpi,
    anzeige,
    auf_kw,
    auf_kw_umrechnen,
    aufheiz_min,
    kw_fuer,
    band,
    ein_minuten,
    klasse,
    lern_sperre,
    mittel_neu,
    nachlauf_erwartet,
    neuer_stand,
    takt,
    takt_anzeige,
    zyklus_minute,
    tuer_verlauf,
    tuer_vermutet,
    tuer_vermutet_grund,
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


def test_tpi_ueber_dem_soll_immer_aus():
    """Audit 0.8.165: kleines kint, großes kext – ab Soll + 1 °C aus, auch wenn es draußen kalt ist."""
    t = Tpi(kint=0.05, kext=0.05, nachlauf=0.0, aussen=-10.0, minute_im_zyklus=0)
    assert tpi_anteil(20.9, 20.0, t) > 0.9   # knapp drüber regelt noch (Nachlauf, Toleranz)
    assert tpi_anteil(21.0, 20.0, t) == 0.0 and tpi_anteil(30.0, 20.0, t) == 0.0


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
EIN_KW = (1.0,)   # ein Heizkörper mit 1 kW: Rate je kW = Rate


def _aufheizen(stand, von, bis, minuten, aussen=0.0, soll=20.0, ab=T0, kw=1.0, kw_nenn=EIN_KW):
    """minuten lang durchgehend heizen (Leistung `kw`), Temperatur linear von → bis, dann aus."""
    t = ab
    for i in range(minuten):
        stand = takt(stand, jetzt=t, heizt=True, innen=von + (bis - von) * i / minuten, soll=soll, aussen=aussen, art="oel",
                     regelt=True, kw=kw, kw_nenn=kw_nenn)
        t += timedelta(minutes=1)
    stand = takt(stand, jetzt=t, heizt=False, innen=bis, soll=soll, aussen=aussen, art="oel", regelt=True, kw=0.0, kw_nenn=kw_nenn)
    return stand, t + timedelta(hours=3)


def test_aufheizen_lernt_rate_je_band():
    s, t = _aufheizen(neuer_stand(), 15.0, 18.0, 60)             # 3 °C in 60 min (letzte Heizminute 17,95)
    assert s["auf"] is None and s["auf_kw"]["kalt"][1] == 1
    assert s["auf_kw"]["kalt"][0] == pytest.approx(2.95, abs=0.01)
    assert aufheiz_min(s, innen=16.0, soll=20.0, aussen=0.0, kw_nenn=EIN_KW) is None     # erst ab AUF_N Messungen
    for _ in range(AUF_N - 1):
        s, t = _aufheizen(s, 15.0, 18.0, 60, ab=t)
    assert s["auf_kw"]["kalt"][1] == AUF_N
    assert aufheiz_min(s, innen=16.0, soll=20.0, aussen=0.0, kw_nenn=EIN_KW) == 85        # 4 °C / 2,95 °C/h = 81,4 → 85 min
    assert aufheiz_min(s, innen=21.0, soll=20.0, aussen=0.0, kw_nenn=EIN_KW) == 0
    assert aufheiz_min(s, innen=16.0, soll=20.0, aussen=10.0, kw_nenn=EIN_KW) is None     # mild: noch nichts gelernt
    assert aufheiz_min(s, innen=16.0, soll=20.0, aussen=0.0) is None                       # ohne Leistung keine Rate
    a = anzeige(s, EIN_KW)
    assert a["aufheizen"]["kalt|1"]["n"] == AUF_N and a["auf_n"] == AUF_N and a["auf_kw"]["kalt"]["n"] == AUF_N


def test_aufheizen_zaehlt_nicht_nahe_am_soll_oder_zu_kurz():
    s, _ = _aufheizen(neuer_stand(), 19.5, 20.0, 60)               # beginnt nur 0,5 °C unter dem Soll
    assert s["auf_kw"] == {}
    s, _ = _aufheizen(neuer_stand(), 15.0, 16.0, 10)               # zu kurz
    assert s["auf_kw"] == {}
    s, _ = _aufheizen(neuer_stand(), 15.0, 21.0, 120)              # erreicht das Soll: endet dort
    assert s["auf_kw"]["kalt"][1] == 1 and s["auf"] is None
    s, _ = _aufheizen(neuer_stand(), 15.0, 18.0, 60, kw=None)      # ohne gemessene Leistung: keine Rate je kW
    assert s["auf_kw"] == {} and s["auf"] is None
    s, _ = _aufheizen(neuer_stand(), 15.0, 18.0, 60, kw=0.05)      # Mittel unter AUF_KW_MIN: verworfen
    assert s["auf_kw"] == {}


def test_aufheizen_je_kw_ueber_stufenwechsel():
    """0.8.182: Der Zusatz kommt mitten im Aufheizen dazu – die Messung läuft weiter, gelernt wird die Rate je kW der
    mittleren Leistung (30 min 1,8 kW, 30 min 1,8 + 1,4 kW → Mittel 2,5 kW). Bis 0.8.181 begann sie dort neu."""
    s, tt = neuer_stand(), T0
    kw_nenn = (1.8, 1.4)
    for i in range(60):   # 15 → 19 °C in 60 min: 4 °C/h
        s = takt(s, jetzt=tt, heizt=True, innen=15.0 + 4.0 * i / 60, soll=20.0, aussen=0.0, art="oel", regelt=True,
                 kw=1.8 if i < 30 else 3.2, kw_nenn=kw_nenn)
        assert s["auf"] is not None, i
        tt += timedelta(minutes=1)
    s = takt(s, jetzt=tt, heizt=False, innen=19.0, soll=20.0, aussen=0.0, art="oel", regelt=True, kw=0.0, kw_nenn=kw_nenn)
    rate = (19.0 - 4.0 / 60 - 15.0)   # letzte Heizminute, über 60 min
    assert s["auf_kw"]["kalt"] == [pytest.approx(rate / 2.5, abs=1e-3), 1]
    a = anzeige(s, kw_nenn)   # für die Tabelle der Seite: je Anzahl mit deren Leistung
    assert a["aufheizen"]["kalt|1"]["rate"] == pytest.approx(rate / 2.5 * 1.8, abs=1e-2)
    assert a["aufheizen"]["kalt|2"]["rate"] == pytest.approx(rate / 2.5 * 3.2, abs=1e-2)


def test_aufheizen_taktender_oelradiator_zaehlt_weiter():
    """Der eigene Thermostat eines Ölradiators schaltet ab (Plug an, zieht keinen Strom): die Messung läuft weiter, die
    Minuten mit 0 kW zählen zur mittleren Leistung. Erst ein ausgeschalteter Plug beendet sie."""
    s, tt = neuer_stand(), T0
    for i in range(40):   # 3 min an, 2 min aus
        zieht = i % 5 < 3
        s = takt(s, jetzt=tt, heizt=zieht, an=True, innen=15.0 + 0.05 * i, soll=20.0, aussen=0.0, art="oel", regelt=True,
                 kw=2.0 if zieht else 0.0, kw_nenn=(2.0,))
        assert s["auf"] is not None, i
        tt += timedelta(minutes=1)
    s = takt(s, jetzt=tt, heizt=False, an=False, innen=17.0, soll=20.0, aussen=0.0, art="oel", regelt=True, kw=0.0,
             kw_nenn=(2.0,))
    rate = (15.0 + 0.05 * 39 - 15.0) / 40 * 60
    assert s["auf"] is None and s["auf_kw"]["kalt"] == [pytest.approx(rate / 1.2, abs=1e-3), 1]   # Mittel 3/5 × 2 kW


def test_kw_fuer():
    assert kw_fuer((1.8, 1.4), 1) == 1.8 and kw_fuer((1.8, 1.4), 2) == pytest.approx(3.2)
    assert kw_fuer((2.0,), 2) == 4.0 and kw_fuer((), 1) == 0.0 and kw_fuer((1.8, 0), 2) == 1.8 + 1.8


def test_alte_raten_je_anzahl_werden_umgerechnet_nicht_verworfen():
    """Bis 0.8.181 je Anzahl Heizkörper („kalt|1“): beim ersten Takt mit bekannter Leistung je kW umgerechnet, nach Anzahl
    Messungen gewichtet; die Anzahl bleibt (gelernt bleibt gelernt), das alte Feld bleibt unverändert stehen."""
    alt = {**neuer_stand(), "aufheizen": {"kalt|1": [2.023, 8], "mild|1": [2.406, 9], "kalt|2": [4.0, 2], "x|1": [9.0, 3]}}
    kw_nenn = (1.781, 1.397)
    erwartet = {"kalt": [round((2.023 / 1.781 * 8 + 4.0 / 3.178 * 2) / 10, 4), 10], "mild": [round(2.406 / 1.781, 4), 9]}
    assert auf_kw_umrechnen(alt["aufheizen"], kw_nenn) == erwartet
    assert auf_kw(alt, kw_nenn) == erwartet                      # vor dem ersten Takt: gelesen wie umgerechnet
    assert auf_kw_umrechnen(alt["aufheizen"], ()) == {}           # ohne Leistung nicht umrechenbar
    s = takt(alt, jetzt=T0, heizt=False, innen=19.0, soll=20.0, aussen=0.0, art="oel", regelt=True)
    assert "auf_kw" not in s                                     # ohne Leistung: erst später umrechnen
    s = takt(alt, jetzt=T0, heizt=False, innen=19.0, soll=20.0, aussen=0.0, art="oel", regelt=True, kw_nenn=kw_nenn)
    assert s["auf_kw"] == erwartet and s["aufheizen"] == alt["aufheizen"]
    # mit einem Heizkörper dieselbe Rate wie vorher gelernt (ohne den kalt|2-Anteil)
    nur = auf_kw_umrechnen({"kalt|1": [2.023, 8]}, kw_nenn)
    assert aufheiz_min({"auf_kw": nur}, innen=18.0, soll=20.0, aussen=0.0, kw_nenn=kw_nenn) is not None
    assert nur["kalt"][0] * 1.781 == pytest.approx(2.023, abs=1e-3)
    # einmal umgerechnet, bleibt es (eine neue Leistung rechnet nicht noch einmal um)
    s2 = takt(s, jetzt=T0 + timedelta(minutes=1), heizt=False, innen=19.0, soll=20.0, aussen=0.0, art="oel", regelt=True,
              kw_nenn=(3.0, 3.0))
    assert s2["auf_kw"] == erwartet


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


# ------------------------------------------------------------------ Takt für die Seite (Mockup takt.html, Variante B)
def _um(h: int, m: int, s: int = 0) -> datetime:
    return T0.replace(hour=h, minute=m, second=s)


def test_zyklus_minute_je_container_versetzt():
    assert zyklus_minute(_um(17, 37), 0) == 7 and zyklus_minute(_um(17, 37), 1) == 0 and zyklus_minute(_um(17, 37), 2) == 3


def test_takt_runde_pause_bis_naechste_runde():
    """46 % je 10 min, Minute 7 (Runde 17:30–17:40), aus: Pause bis zum Beginn der nächsten Runde; 4½ an, 5½ aus."""
    t = takt_anzeige(0.46, 7, False, _um(17, 37, 30))
    assert t == {"art": "runde", "anteil": 46, "zyklus_min": 10, "an_min": 4.5, "aus_min": 5.5, "phase": "pause",
                 "bis": "17:40", "minute": 7.5}


def test_takt_runde_an_bis_nach_tpi_ein():
    """an-Teil: Ende, an dem tpi_ein ausschaltet – 4,6 min → in Minute 5 aus (volle Minuten), nicht 4½."""
    t = takt_anzeige(0.46, 2, True, _um(17, 32))
    assert t["art"] == "runde" and t["phase"] == "an" and t["bis"] == "17:35" and t["minute"] == 2
    assert [tpi_ein(0.46, m, True) for m in range(2, 6)] == [True, True, True, False]   # dieselbe Regel
    # Mindestlaufzeit: 2,3 min in Minute 0 → aus in Minute 3 (2,3 > 2)
    assert takt_anzeige(0.23, 0, True, _um(8, 0))["bis"] == "08:03"


def test_takt_dauernd_und_erreicht_ohne_bis():
    d = takt_anzeige(0.9, 4, True, _um(7, 4))
    assert d["art"] == "dauernd" and d["an_min"] == 10 and d["aus_min"] == 0 and d["phase"] == "an" and d["bis"] is None
    assert d["minute"] is None and d["anteil"] == 90
    e = takt_anzeige(0.1, 5, False, _um(7, 5))
    assert e["art"] == "erreicht" and e["an_min"] == 0 and e["aus_min"] == 10 and e["phase"] == "pause" and e["bis"] is None
    assert takt_anzeige(0.0, 5, False, _um(7, 5))["art"] == "erreicht"
    # Soll fast erreicht, läuft aber noch zu Beginn der Runde: Mindestlaufzeit 2 min – eine Runde, nicht „erreicht“
    # (Review 0.8.154: sonst „Soll erreicht · bleibt aus“, während der Heizkörper heizt)
    m = takt_anzeige(0.1, 0, True, _um(7, 0))
    assert m["bis"] == "07:02" and m["art"] == "runde" and m["phase"] == "an" and m["an_min"] == 2 and m["aus_min"] == 8


def test_takt_grenzen_wie_tpi_ein():
    """Grenzen wie tpi_ein: über 8 min dauernd, unter 2 min erreicht; ½-min-Rundung."""
    assert takt_anzeige(0.8, 0, True, _um(7, 0))["art"] == "runde" and takt_anzeige(0.81, 0, True, _um(7, 0))["art"] == "dauernd"
    assert takt_anzeige(0.2, 0, True, _um(7, 0))["art"] == "runde" and takt_anzeige(0.19, 0, False, _um(7, 0))["art"] == "erreicht"
    assert takt_anzeige(0.425, 9, False, _um(7, 9))["an_min"] == 4.5 and takt_anzeige(0.42, 9, False, _um(7, 9))["an_min"] == 4.0


def test_takt_unterbrochen_kein_falsches_bis():
    """Die Runde wird abgebrochen (Staffelung, Mindestpause, Tür): steht der Heizkörper anders, als tpi_ein will,
    gibt es kein „bis“ – sonst stünde „Pause bis 17:40“ da, obwohl die Regelung jetzt heizen will."""
    gehalten = takt_anzeige(0.46, 1, False, _um(17, 31))      # will an (Minute 1, 3,6 min Rest), ist aus
    assert tpi_ein(0.46, 1) and gehalten["phase"] == "pause" and gehalten["bis"] is None and gehalten["art"] == "runde"
    dauernd_gehalten = takt_anzeige(1.0, 3, False, _um(17, 33))
    assert dauernd_gehalten["phase"] == "pause" and dauernd_gehalten["bis"] is None
    noch_an = takt_anzeige(0.46, 6, True, _um(17, 36))        # will aus (Minute 6 > 4,6), läuft noch
    assert not tpi_ein(0.46, 6, True) and noch_an["phase"] == "an" and noch_an["bis"] is None


# ---------------------------------------------------------------- Auskühlzeit τ (FE-0031/FE-0032, Start-Logik)
def _auskuehlen(stand, ab, stunden, tau=15.0, innen=18.0, aussen=5.0, **takt_dazu):
    """Ohne Heizen Minute für Minute nach dT/dt = −(innen − außen) ÷ τ, Fühler auf 0,1 °C gerundet."""
    import math
    s, t = stand, ab
    for m in range(int(stunden * 60) + 1):
        wert = aussen + (innen - aussen) * math.exp(-m / 60 / tau)
        s = takt(s, jetzt=t, heizt=False, innen=round(wert, 1), soll=20.0, aussen=aussen, art="oel", regelt=True, **takt_dazu)
        t += timedelta(minutes=1)
    return s, t


def _heizen_an(s, t, innen=15.0):
    return takt(s, jetzt=t, heizt=True, innen=innen, soll=20.0, aussen=5.0, art="oel", regelt=True)


def test_tau_lernt_aus_der_nacht():
    """Container mit τ = 15 h kühlt 4 h ohne Heizen von 18 °C bei 5 °C außen: gemessen τ ≈ 15 h; erst ab TAU_N Messungen
    gelernt (anzeige), gleitend gemittelt."""
    from logik.lernen import TAU_N
    abend = datetime(2026, 10, 28, 19, 0, tzinfo=timezone(timedelta(hours=1)))
    s, t = _auskuehlen(neuer_stand(), abend, 4)
    assert s["ab"] is not None and s["tau"] is None and anzeige(s)["tau"]["misst"] is True
    s = _heizen_an(s, t)                                            # Heizen beendet die Messung
    assert s["ab"] is None and s["tau"][1] == 1 and s["tau"][0] == pytest.approx(15.0, rel=0.08)
    a = anzeige(s)["tau"]
    assert a["n"] == 1 and a["n_noetig"] == TAU_N and a["h"] == s["tau"][0]
    s2, t2 = _auskuehlen(s, abend + timedelta(days=1), 3, tau=20.0)
    s2 = _heizen_an(s2, t2, innen=16.2)   # nach 3 h bei τ 20 h: 16,2 °C (ein Sprung auf 15 °C wäre „schnell kälter“)
    assert s2["tau"][1] == 2 and s["tau"][0] < s2["tau"][0] < 20.5     # Mittel aus beiden


def test_tau_nicht_tagsueber_nicht_bei_offener_tuer_nicht_zu_kurz():
    from logik.lernen import TAU_MAX_H, tau_messung
    mittag = datetime(2026, 10, 28, 9, 0, tzinfo=timezone(timedelta(hours=1)))
    s, t = _auskuehlen(neuer_stand(), mittag, 4)                 # 9–13 Uhr: Sonne, keine Messung
    assert s["ab"] is None and s["tau"] is None
    abend = datetime(2026, 10, 28, 19, 0, tzinfo=timezone(timedelta(hours=1)))
    s, t = _auskuehlen(neuer_stand(), abend, 1)                  # nur 1 h, dann geheizt: verworfen
    assert _heizen_an(s, t)["tau"] is None
    s, t = _auskuehlen(neuer_stand(), abend, 3, tuer_offen=True)  # Tür offen: keine Messung
    assert s["ab"] is None and _heizen_an(s, t)["tau"] is None
    s, t = _auskuehlen(neuer_stand(), abend, TAU_MAX_H + 0.5)    # nach TAU_MAX_H abgeschlossen, die nächste läuft
    assert s["tau"] is not None and s["tau"][1] == 1 and s["ab"] is not None
    # Plausibilität: kaum abgekühlt oder kaum Abstand nach außen → keine Messung
    assert tau_messung({"innen": 18.0, "ende": 17.8, "summe": 13 * 240, "min": 240}) is None
    assert tau_messung({"innen": 18.0, "ende": 17.0, "summe": 2 * 240, "min": 240}) is None
    assert tau_messung({"innen": 18.0, "ende": 17.0, "summe": 12 * 240, "min": 240}) == pytest.approx(48.0)
    assert tau_messung({"innen": 18.0, "ende": 6.0, "summe": 5 * 240, "min": 240}) is None   # τ < 2 h: unplausibel


def test_tau_mit_echter_zeit_und_luecke():
    """Code-Review FE-0031: integriert wird über die echte Zeit, nicht über die Zahl der Werte – Werte nur alle 5 min
    ergeben dasselbe τ; eine Lücke über TAU_LUECKE_MIN (Neustart) beendet die Messung an der Lücke."""
    import math
    from logik.lernen import TAU_LUECKE_MIN
    abend = datetime(2026, 10, 28, 19, 0, tzinfo=timezone(timedelta(hours=1)))

    def kuehlen(schritt_min, stunden, luecke_nach_h=None, luecke_min=0):
        s, m = neuer_stand(), 0
        while m <= stunden * 60:
            wert = 5.0 + 13.0 * math.exp(-m / 60 / 15.0)
            s = takt(s, jetzt=abend + timedelta(minutes=m), heizt=False, innen=round(wert, 2), soll=20.0, aussen=5.0, art="oel", regelt=True)
            m += schritt_min
            if luecke_nach_h is not None and m == luecke_nach_h * 60:
                m += luecke_min
        return s

    fein = kuehlen(1, 4)["ab"]
    grob = kuehlen(5, 4)["ab"]
    from logik.lernen import tau_messung
    assert tau_messung(fein) == pytest.approx(15.0, rel=0.03) and tau_messung(grob) == pytest.approx(15.0, rel=0.03)
    assert grob["min"] == pytest.approx(240)
    # Lücke von 60 min nach 3 h: die Messung endet dort (τ aus 3 h), die nächste beginnt neu
    s = kuehlen(1, 5, luecke_nach_h=3, luecke_min=60)
    assert s["tau"] is not None and s["tau"][1] == 1 and s["tau"][0] == pytest.approx(15.0, rel=0.05)
    assert s["ab"]["min"] < 60 + 1 and TAU_LUECKE_MIN < 60


# ---------------------------------------------------- 0.8.181 (Prüfpunkt 1): Lernen nur aus echten Regelphasen
def test_lern_sperre_je_grund():
    assert lern_sperre() is None and lern_sperre(modus="bedarf") is None
    assert lern_sperre(baseline=True, hand=True, modus="aus", tuer=True) == "baseline"
    assert lern_sperre(hand=True) == "hand" and lern_sperre(modus="hand") == "hand"
    assert lern_sperre(modus="aus") == "aus" and lern_sperre(modus="plan") == "zeitplan"
    assert lern_sperre(tuer=True) == "tuer"


def _minuten(s, t, temps, heizt, **kw):
    for temp in temps:
        s = takt(s, jetzt=t, heizt=heizt, innen=temp, soll=20.0, aussen=0.0, art="oel", regelt=True, **kw)
        t += timedelta(minutes=1)
    return s, t


def _gelernt(s):
    return (s["nachlauf"], s["treffer"], s["kint"], s["n_kint"], s["kext"], s["n_kext"], s["aufheizen"], s["tau"], s["zyklen"])


@pytest.mark.parametrize("sperre", [dict(baseline=True), dict(hand=True), dict(modus="aus"), dict(modus="plan"),
                                    dict(modus="hand"), dict(tuer_offen=True), dict(vermutet=True)])
def test_gesperrt_wird_nichts_gelernt(sperre):
    """Je Ausschlussgrund: Aufheizen, Nachlauf, Treffer, K innen und K außen bleiben, wie sie waren."""
    s, t = neuer_stand(), T0
    s, t = _minuten(s, t, [16.0 + 0.1 * i for i in range(40)], True, **sperre)                 # Aufheizen 16 → 20
    s, t = _minuten(s, t, [19.6] + [19.6 + 0.2 * i for i in range(1, 8)] + [20.5] * 30, False, **sperre)   # aus, Spitze 21
    assert _gelernt(s) == _gelernt(neuer_stand())
    assert s["auf"] is None and s["beob"] is None and s["zyklus"] is None
    assert s["sperre"]["grund"] == lern_sperre(baseline=sperre.get("baseline", False), hand=sperre.get("hand", False),
                                               modus=sperre.get("modus", "thermo"), tuer=True if "tuer_offen" in sperre or "vermutet" in sperre else False)
    assert anzeige(s)["sperre"]["grund"] == s["sperre"]["grund"]


def test_befund_ende_baseline_lernt_keinen_treffer_und_kein_k_innen():
    """23.11.2026: Am Ende eines Baseline-Laufs (Thermostat am Gerät, 32 °C) schaltet die Automatik aus – die Spitze danach
    ist kein Überschwingen der Regelung (Treffer +10,6, K innen 0,419 → 0,398). Jetzt: nichts gelernt, auch nicht
    innerhalb von SPERRE_NACH_MIN nach dem Wechsel."""
    s = {**neuer_stand(), "kint": 0.419, "n_kint": 7, "treffer": [0.1]}
    t = T0
    s, t = _minuten(s, t, [19.5] * 60, True, baseline=True)          # Baseline: Plug an, Fühler nahe am Soll
    s, t = _minuten(s, t, [19.5, 20.5, 25.0, 30.0, 30.5, 30.6] + [30.6 - 0.1 * i for i in range(10)], False)   # Wechsel: aus
    assert s["kint"] == 0.419 and s["n_kint"] == 7 and s["treffer"] == [0.1] and s["nachlauf"] == {}
    assert s["sperre"]["grund"] == "baseline"                          # Nachlaufzeit läuft noch
    # nach der Nachlaufzeit regelt der Container wieder selbst: dann wird wieder gelernt
    s, t = _minuten(s, t + timedelta(minutes=SPERRE_NACH_MIN), [19.4] * 30, True)
    assert s["sperre"] is None
    s, t = _minuten(s, t, [19.4, 19.8, 20.2, 20.4, 20.6, 20.3], False)
    assert s["n_kint"] == 8 and len(s["treffer"]) == 2


def test_wechsel_zu_baseline_verwirft_laufende_messungen():
    """Nachlauf wird beobachtet, dann beginnt ein Baseline-Lauf (Plug an): die Beobachtung ist verworfen, nicht gelernt."""
    s, t = _lauf(neuer_stand(), 30, [19.6, 19.8, 20.0])
    assert s["beob"] is not None
    s, t = _minuten(s, t + timedelta(minutes=STOPP_AB_MIN), [20.0] * 5, True, baseline=True)
    assert s["beob"] is None and s["zyklen"] == 0 and s["nachlauf"] == {} and s["n_kint"] == 0


def test_alter_stand_ohne_sperre_bleibt_erhalten():
    """Gelerntes aus einer Vorversion (ohne Feld „sperre“) bleibt unverändert und wird weiter benutzt."""
    alt = {k: v for k, v in neuer_stand().items() if k != "sperre"}
    alt.update(kint=0.398, n_kint=12, kext=0.02, n_kext=5, treffer=[10.64, 0.2], nachlauf={"oel|lang|kalt": [1.1, 12, 4]},
               aufheizen={"kalt|1": [3.0, 4]}, tau=[18.0, 3])
    s = takt(alt, jetzt=T0, heizt=False, innen=19.0, soll=20.0, aussen=0.0, art="oel", regelt=True, baseline=True)
    assert _gelernt(s) == (alt["nachlauf"], alt["treffer"], 0.398, 12, 0.02, 5, alt["aufheizen"], [18.0, 3], 0)
    assert anzeige(alt)["sperre"] is None


def test_tau_bei_sperre_verworfen():
    """Läuft eine Auskühlmessung und der Container geht in eine Sperre (Hand ohne Heizen, Tür), zählt sie nicht – vorher
    wurde sie bis dahin übernommen."""
    abend = datetime(2026, 10, 28, 19, 0, tzinfo=timezone(timedelta(hours=1)))
    s, t = _auskuehlen(neuer_stand(), abend, 4)
    assert s["ab"] is not None
    for grund in (dict(hand=True), dict(tuer_offen=True), dict(modus="aus")):
        s2 = takt(s, jetzt=t, heizt=False, innen=13.0, soll=20.0, aussen=5.0, art="oel", regelt=False, **grund)
        assert s2["ab"] is None and s2["tau"] is None


# ------------------------------------------------------- 0.8.181 (Prüfpunkt 7): Tür offen, wenn es schnell kälter wird
def test_tuer_vermutet_schnell_kaelter_auch_ohne_heizen():
    t, v = T0, []
    for temp in (20.0, 20.0, 19.6, 19.3, 19.0):                  # 1,0 °C in 4 min, Heizung aus
        v = tuer_verlauf(v, jetzt=t, innen=temp, aussen=5.0, heizt=False, an=False)
        t += timedelta(minutes=1)
    jetzt = t - timedelta(minutes=1)
    assert tuer_vermutet_grund(v, jetzt) == "schnell" and tuer_vermutet(v, jetzt)
    assert OFFEN_SCHNELL_ABFALL == 1.0 and OFFEN_SCHNELL_MIN == 5
    # 0,9 °C in 4 min oder 1,0 °C über länger als OFFEN_SCHNELL_MIN: nicht schnell (und ohne Heizen sonst keine Vermutung)
    v2 = [x[:1] + [x[1] + 0.1 if i == len(v) - 1 else x[1]] + x[2:] for i, x in enumerate(v)]
    assert tuer_vermutet_grund(v2, jetzt) is None
    v3, t3 = [], T0
    for i in range(8):
        v3 = tuer_verlauf(v3, jetzt=t3, innen=round(20.0 - 0.15 * i, 2), aussen=5.0, heizt=False, an=False)
        t3 += timedelta(minutes=1)
    assert tuer_vermutet_grund(v3, t3 - timedelta(minutes=1)) is None
    # beim Heizen langsam kälter: weiter die Erkennung von FE-0025
    w = [[(T0 + timedelta(minutes=i)).isoformat(), 17.0 - 0.04 * i, 5.0, True] for i in range(11)]
    assert tuer_vermutet_grund(w, T0 + timedelta(minutes=10)) == "heizen"


def test_schnell_kaelter_sperrt_lernen_mit_nachlaufzeit():
    """Fällt der Raum schnell, verwirft takt die Nachlauf-Beobachtung; bis OFFEN_RUHE_MIN danach beginnt keine neue."""
    s, t = _lauf(neuer_stand(), 30, [19.6, 19.8, 20.0])
    assert s["beob"] is not None
    s, t = _minuten(s, t, [18.9], False)                         # Spitze noch nicht vorbei, da fällt der Raum um 1,1 °C
    assert s["offen"]["art"] == "vermutet" and s["sperre"]["grund"] == "tuer" and s["beob"] is None and s["nachlauf"] == {}
    # vermutet, solange der Abfall im Fenster von OFFEN_SCHNELL_MIN liegt, danach noch OFFEN_RUHE_MIN gesperrt
    s, t = _minuten(s, t, [18.9] * (OFFEN_SCHNELL_MIN - 1 + OFFEN_RUHE_MIN - 1), False)
    assert s["sperre"] is not None
    s, t = _minuten(s, t, [18.9], False)
    assert s["sperre"] is None and s["offen"] is None
