"""Zähler-Statistik bereinigen (FE-0029): Rücksprung zählt 0, nachgetragener Zähler ohne Sprung."""

from datetime import datetime, timezone

import pytest

from logik import ruecksprung as r
from logik.auswertung import summe
from logik.rechte import darf

H = 3600
T0 = datetime(2026, 10, 17, 13, 0, tzinfo=timezone.utc).timestamp()


def stunden(*werte, ab=T0):
    """Stunden-Punkte wie `statistics_during_period` (start/end in Sekunden)."""
    return [{"start": ab + i * H, "end": ab + (i + 1) * H, "change": w} for i, w in enumerate(werte)]


def changes(punkte):
    return [p["change"] for p in punkte]


def test_ticket_fe_0029_ruecksprung_zaehlt_null():
    """Fall aus dem Ticket: „ohne (24/7)“ +8,3 je Stunde, nach dem Neustart −146,8 – die Summe ohne den Rücksprung."""
    punkte = stunden(8.3, 8.3, -146.8, 8.3, 8.3)
    sauber = r.bereinigt(punkte)
    assert changes(sauber) == [8.3, 8.3, 0.0, 8.3, 8.3]
    assert summe(changes(sauber)) == pytest.approx(33.2)
    assert summe(changes(punkte)) < 0   # vorher: ins Bodenlose
    assert punkte[2]["change"] == -146.8   # Eingabe unverändert


def test_schritt():
    assert r.zaehler_schritt(-0.01) == 0.0
    assert r.zaehler_schritt("2.5") == 2.5
    assert r.zaehler_schritt(None) is None


def test_mittelwerte_bleiben():
    punkte = [{"start": T0, "end": T0 + H, "mean": -3.5}, {"start": T0 + H, "end": T0 + 2 * H, "mean": 4.0, "change": None}]
    assert r.bereinigt(punkte) == punkte


def test_tag_aus_bereinigten_stunden():
    """Tag = Summe der bereinigten Stunden (ein Tageswert −146,8 + 24 × 8,3 wäre nur kleiner, nicht richtig)."""
    tag0 = datetime(2026, 10, 17, 22, 0, tzinfo=timezone.utc).timestamp()   # 18.10. 00:00 Wien
    std = stunden(*([8.3] * 15 + [-187.5] + [8.3] * 6 + [-27.8] + [8.3]), ab=tag0)
    grob = [{"start": tag0, "end": tag0 + 24 * H, "change": summe(changes(std))}]
    assert grob[0]["change"] < 0   # so fiel die Linie am 18.10. unter 0
    tag = r.zusammenfassen(grob, r.bereinigt(std))
    assert tag[0]["change"] == pytest.approx(22 * 8.3)


def test_zusammenfassen_ohne_end_und_mittel():
    grob = [{"start": T0, "change": 1.0}, {"start": T0 + 2 * H, "change": 1.0}, {"start": T0, "mean": 3.0}]
    fein = stunden(1.0, 2.0, 3.0, 4.0)
    neu = r.zusammenfassen(grob, fein)
    assert changes(neu[:2]) == [3.0, 7.0] and neu[2] == {"start": T0, "mean": 3.0}


def test_ausgleich_nimmt_den_nachtrag_aus_der_reihe():
    """+362,1 kWh nachgetragen in der dritten Stunde: Diagramm ohne Sprung, die Stunde zeigt nur den normalen Zuwachs."""
    punkte = stunden(8.3, 8.3, 8.3 + 362.1, 8.3)
    sauber = r.bereinigt(punkte, [(T0 + 2 * H + 600, 362.1)])
    assert changes(sauber) == pytest.approx([8.3, 8.3, 8.3, 8.3])


def test_ausgleich_spaeter_gebucht_und_ausserhalb():
    # Sprung erst im Abschnitt nach der Korrektur (Zustand kurz nach der Grenze geschrieben): Summe stimmt trotzdem
    punkte = stunden(8.3, 8.3 + 50.0, 8.3)
    sauber = r.bereinigt(punkte, [(T0 + H - 1, 50.0)])
    assert summe(changes(sauber)) == pytest.approx(3 * 8.3) and min(changes(sauber)) >= 0
    # Korrektur nach dem Zeitraum: nichts abziehen
    assert changes(r.bereinigt(punkte, [(T0 + 10 * H, 50.0)])) == changes(punkte)
    # Zeitraum beginnt nach der Korrektur (Folgetag/-woche): der Sprung ist nicht drin, nichts abziehen (Review)
    assert changes(r.bereinigt(stunden(8.3, 8.3, ab=T0 + 24 * H), [(T0 + 2 * H, 362.1)])) == [8.3, 8.3]
    # nie unter 0
    assert changes(r.bereinigt(stunden(1.0), [(T0, 5.0)])) == [0.0]


def test_korrektur_und_ausgleich():
    zeit = datetime(2026, 10, 28, 9, 0, 12, tzinfo=timezone.utc)
    e = r.korrektur(zeit, "ohne", 362.1, "Panne 16.–19.10.", {"energie_ohne_automatik": 2000.0, "ersparnis": 100.0, "energie": 5.0},
                    {"energie_ohne_automatik": 2362.1, "ersparnis": 190.525, "energie": 5.0}, "Herbert")
    assert e["sprung"] == {"energie_ohne_automatik": pytest.approx(362.1), "ersparnis": pytest.approx(90.525)}
    assert e["zeit"] == "2026-10-28T09:00:12+00:00" and e["kwh"] == 362.1 and e["von"] == "Herbert"
    aus = r.ausgleich([e, {"zeit": "kaputt"}, {"zeit": e["zeit"], "sprung": {"x": -1}}])
    assert aus == {"energie_ohne_automatik": [(zeit.timestamp(), pytest.approx(362.1))],
                   "ersparnis": [(zeit.timestamp(), pytest.approx(90.525))]}
    with pytest.raises(ValueError):
        r.korrektur(zeit, "energie", 1.0, "nein", {}, {})


def test_nur_admins_korrigieren():
    assert darf(True, "zaehler_korrigieren") and not darf(False, "zaehler_korrigieren")


def test_fuenf_minuten():
    punkte = [{"start": T0 + i * 300, "end": T0 + (i + 1) * 300, "change": w} for i, w in enumerate([0.7, -146.8, 0.7])]
    assert changes(r.bereinigt(punkte)) == [0.7, 0.0, 0.7]
