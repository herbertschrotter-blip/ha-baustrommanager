"""Minutenwerte aus Zustandsfolgen (BSM-007)."""

from datetime import datetime, timedelta, timezone

import pytest

from logik.minute import BereichSammler, GeraetSammler, Zeitanteil, Zeitmittel

T0 = datetime(2026, 10, 5, 10, 0, tzinfo=timezone.utc)


def s(sek: float) -> datetime:
    return T0 + timedelta(seconds=sek)


def test_zeitmittel_gewichtet_und_max():
    m = Zeitmittel(T0, 1000.0)
    m.setzen(s(30), 2000.0)
    assert m.abschliessen(s(60)) == (1500.0, 2000.0, 90000.0)
    # nächster Abschnitt beginnt mit dem aktuellen Wert
    assert m.abschliessen(s(120)) == (2000.0, 2000.0, 120000.0)


def test_zeitmittel_unbekannt_zaehlt_nicht():
    m = Zeitmittel(T0, None)
    m.setzen(s(45), 100.0)
    mittel, hoechst, _ = m.abschliessen(s(60))
    assert mittel == 100.0 and hoechst == 100.0
    assert Zeitmittel(T0, None).abschliessen(s(60))[:2] == (None, None)


def test_zeitanteil():
    a = Zeitanteil(T0, False)
    a.setzen(s(10), True)
    a.setzen(s(40), False)
    assert a.abschliessen(s(60)) == (30.0, False)
    a.setzen(s(70), None)   # nicht erreichbar
    a.setzen(s(80), True)
    assert a.abschliessen(s(120)) == (40.0, True)
    assert a.abschliessen(s(180)) == (60.0, False)


def test_geraet_mit_zaehler():
    g = GeraetSammler(T0, False, 0.0, 10.0, mit_zaehler=True)
    g.schalter(s(15), True)
    g.leistung(s(15), 2000.0)
    g.zaehler(s(59), 10.025)
    m = g.abschliessen(s(60))
    assert (m.dauer_s, m.sekunden_ein, m.leistung_w_max, m.zaehlerstand_kwh, m.erreichbar) == (60, 45, 2000.0, 10.025, True)
    assert m.leistung_w == pytest.approx(1500.0) and m.energie_wh == pytest.approx(25.0)
    m2 = g.abschliessen(s(120))   # weiter ein, Zähler meldet nichts Neues
    assert m2.sekunden_ein == 60 and m2.energie_wh == 0.0


def test_geraet_luecke_wird_spaeter_gezaehlt():
    """Zähler 3 Tage weg, dann 60 kWh mehr: zählt in der Minute der Rückkehr (Grenze je Stunde der Lücke)."""
    g = GeraetSammler(T0, True, 2000.0, 100.0, mit_zaehler=True)
    g.abschliessen(s(60))
    g.schalter(s(60), None)
    m = g.abschliessen(s(120))
    assert not m.erreichbar and m.energie_wh == 0.0
    ende = s(120) + timedelta(hours=72)
    g.schalter(ende - timedelta(seconds=30), True)
    g.zaehler(ende - timedelta(seconds=30), 160.0)
    m = g.abschliessen(ende)
    assert m.energie_wh == pytest.approx(60000.0)


def test_geraet_ohne_zaehler_aus_leistung():
    g = GeraetSammler(T0, True, 1200.0, None, mit_zaehler=False)
    m = g.abschliessen(s(60))
    assert m.energie_wh == pytest.approx(20.0) and m.zaehlerstand_kwh is None


def test_bereich_temperatur_und_tuer():
    b = BereichSammler(T0, 18.0, False, mit_tuer=True)
    b.temperatur(s(30), 20.0)
    b.tuer(s(50), True)
    m = b.abschliessen(s(60))
    assert (m.dauer_s, m.temperatur, m.tuer_offen_s) == (60, 19.0, 10)
    ohne = BereichSammler(T0, None, None, mit_tuer=False).abschliessen(s(60))
    assert ohne.temperatur is None and ohne.tuer_offen_s is None


def test_nachspielen_geraet_wie_mitschreiben():
    """BSM-008: Verlauf aus HA ergibt dieselben Minuten wie das Mitschreiben."""
    from logik.minute import GeraetVerlauf, nachspielen_geraet
    v = GeraetVerlauf(schalter=[(s(-600), False), (s(15), True)], leistung=[(s(-600), 0.0), (s(15), 2000.0)],
                      zaehler=[(s(-600), 10.0), (s(59), 10.025)], mit_zaehler=True)
    minuten = nachspielen_geraet(v, T0, s(120))
    assert [b for b, _ in minuten] == [T0, s(60)]
    erste, zweite = minuten[0][1], minuten[1][1]
    assert (erste.sekunden_ein, erste.energie_wh, erste.zaehlerstand_kwh) == (45, pytest.approx(25.0), 10.025)
    assert zweite.sekunden_ein == 60 and zweite.leistung_w == 2000.0
    assert nachspielen_geraet(GeraetVerlauf([], [], [], False), T0, s(60)) == []


def test_nachspielen_bereich_mit_grund_und_teilminuten():
    from logik.minute import BereichVerlauf, nachspielen_bereich
    v = BereichVerlauf(temperatur=[(s(-5), 18.0), (s(40), 20.0)], tuer=None, grund=[(s(-5), "heizgrenze"), (s(100), "arbeitszeit")])
    minuten = nachspielen_bereich(v, s(30), s(150))   # Beginn und Ende mitten in der Minute
    assert [(b, m.dauer_s) for b, m, _ in minuten] == [(s(30), 30), (s(60), 60), (s(120), 30)]
    assert minuten[0][1].temperatur == pytest.approx((18 * 10 + 20 * 20) / 30, abs=0.01)
    assert [g for _, _, g in minuten] == ["heizgrenze", "arbeitszeit", "arbeitszeit"]
    assert minuten[0][1].tuer_offen_s is None


def test_sekunden_strom_eigener_thermostat():
    """BSM-014: Relais an, der Heizkörper zieht aber nur zeitweise (eigener Thermostat) – nur diese Zeit zählt."""
    g = GeraetSammler(T0, True, 0.0, None, mit_zaehler=False, zieht_w=50)
    g.leistung(s(10), 1800.0)
    g.leistung(s(40), 0.0)
    m = g.abschliessen(s(60))
    assert m.sekunden_ein == 60 and m.sekunden_strom == 30
    g.schalter(s(70), False)                 # aus: zählt nicht, auch wenn die Leistung noch nicht 0 meldet
    g.leistung(s(65), 1800.0)
    assert g.abschliessen(s(120)).sekunden_strom <= 10
    ohne = GeraetSammler(T0, True, None, None, mit_zaehler=False).abschliessen(s(60))
    assert ohne.sekunden_strom == 60         # ohne Messung: wie eingeschaltet


# ---------------------------------------------------------------------- Prognose V2, P1 (BSM-033.06)
def test_temperaturalter_90_s_und_bericht_nach_30_s():
    """Bauvorlage r5 Anhang B: Beginn 90 s alt, Bericht nach 30 s → höchstes Alter 120 s (genau 120 ist gültig)."""
    b = BereichSammler(T0, 21.0, None, mit_tuer=False, beobachtet=s(-90))
    b.bericht(s(30), s(30))
    assert b.abschliessen(s(60)).temp_alter_s == 120
    assert b.abschliessen(s(120)).temp_alter_s == 90   # nächste Minute: Alter wächst ab dem Bericht weiter


def test_temperaturalter_unbekannt():
    """Start ist kein Bericht; Fühler ohne Wert macht die Minute unbekannt, nicht 0."""
    b = BereichSammler(T0, 21.0, None, mit_tuer=False)
    b.bericht(s(20), s(20))
    assert b.abschliessen(s(60)).temp_alter_s is None   # 20 s vor dem ersten Bericht unbekannt
    assert b.abschliessen(s(120)).temp_alter_s == 100
    b.bericht(s(150), None)                              # nicht verfügbar
    assert b.abschliessen(s(180)).temp_alter_s is None
    b.bericht(s(180), s(180))
    assert b.abschliessen(s(240)).temp_alter_s == 60


def test_staffel_sperre_vereinigung():
    """Anhang B: Gerät A gesperrt [0,20], B [10,30] → Container 30 s, nicht die Gerätesumme 40 s."""
    b = BereichSammler(T0, None, None, mit_tuer=False, geraete=["a", "b"])
    b.staffel(T0, "a", True)
    b.staffel(T0, "b", False)
    b.staffel(s(10), "b", True)
    b.staffel(s(20), "a", False)
    b.staffel(s(30), "b", False)
    assert b.abschliessen(s(60)).staffel_begrenzt_s == 30
    assert b.abschliessen(s(120)).staffel_begrenzt_s == 0


def test_staffel_sperre_unbekannt_und_ohne_geraete():
    b = BereichSammler(T0, None, None, mit_tuer=False, geraete=["a", "b"])
    b.staffel(s(20), "a", False)
    b.staffel(s(20), "b", False)
    assert b.abschliessen(s(60)).staffel_begrenzt_s is None   # 20 s unbekannt → NULL
    b.staffel(s(70), "b", None)                                 # b nicht erreichbar, a nicht gesperrt
    assert b.abschliessen(s(120)).staffel_begrenzt_s is None
    b.staffel(s(120), "a", True)                                # a gesperrt: Vereinigung sicher wahr, auch mit b unbekannt
    assert b.abschliessen(s(180)).staffel_begrenzt_s == 60
    b.staffel(s(180), "fremd", True)                            # Gerät eines anderen Containers zählt nicht
    assert BereichSammler(T0, None, None, mit_tuer=False).abschliessen(s(60)).staffel_begrenzt_s is None


def test_vereinigt():
    from logik.minute import vereinigt
    assert vereinigt([True, None]) is True and vereinigt([False, None]) is None
    assert vereinigt([False, False]) is False and vereinigt([]) is None


@pytest.mark.parametrize(("anforderung", "gesperrt", "erwartet"), [
    (False, False, (0, 0)),    # TPI-aus: keine vorstaffelige Anforderung
    (True, False, (60, 0)),    # Thermostat am Gerät aus: freigegeben, Strom 0 – keine Staffelung
    (True, True, (60, 60)),    # angefordert und von der Staffelung gesperrt
])
def test_anforderung_und_sperre(anforderung, gesperrt, erwartet):
    g = GeraetSammler(T0, anforderung and not gesperrt, 0.0, None, mit_zaehler=False)
    g.staffel(T0, anforderung, gesperrt)
    m = g.abschliessen(s(60))
    assert (m.heizanforderung_s, m.staffel_gesperrt_s) == erwartet
    if anforderung and not gesperrt:
        assert m.sekunden_strom == 0


def test_anforderung_teilweise_und_unbekannt():
    g = GeraetSammler(T0, False, None, None, mit_zaehler=False)
    m = g.abschliessen(s(60))   # Notprogramm/kein Bericht der Staffelung: beide NULL
    assert (m.heizanforderung_s, m.staffel_gesperrt_s) == (None, None)
    g.staffel(s(60), True, True)
    g.staffel(s(70), True, False)
    m = g.abschliessen(s(120))
    assert (m.heizanforderung_s, m.staffel_gesperrt_s) == (60, 10)
    g.staffel(s(140), True, None)   # 40 s beobachtet, 20 s unbekannt (nicht erreichbar)
    m = g.abschliessen(s(180))
    assert (m.heizanforderung_s, m.staffel_gesperrt_s) == (60, None)
    g.staffel(s(180), None, None)
    assert g.abschliessen(s(240)).heizanforderung_s is None


def test_wechselminute_nimmt_den_wechsel_mit():
    """Wechsel nach 30 s: Anteil je Hälfte, kein Endstand für die ganze Minute."""
    g = GeraetSammler(T0, False, None, None, mit_zaehler=False)
    g.staffel(T0, False, False)
    g.staffel(s(30), True, False)
    assert g.abschliessen(s(60)).heizanforderung_s == 30
