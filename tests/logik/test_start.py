"""Start-Logik (FE-0031/FE-0032, Mockup start.html Variante B): Tag, Auskühlen mit der Vorhersage, Aufheizen, Grenze
vom Ziel, nachts weiterrechnen, Schätzung ohne Lernstand – Beispielwerte wie im Mockup (Container 001_C_POL)."""

from __future__ import annotations

from datetime import date, datetime, timedelta, timezone

from logik import groesse, lernen
from logik import start as S
from logik.arbeitszeit import Arbeitszeit, HeizRegeln, WarmAb, WetterTag, tagesplan

TZ = timezone(timedelta(hours=1))
ABEND = datetime(2026, 10, 28, 20, 47, tzinfo=TZ)        # Mittwoch, Arbeit war bis 16:30
MORGEN = date(2026, 10, 29)
A = 7 * 60 + 10                                          # Arbeitsbeginn 07:10
WARM = WarmAb(vor_min=30, max_min=300)                   # warm 30 min vorher, frühestens 5 h vor dem Ziel
MILD = [8, 7.5, 7, 6.4, 5.8, 5.2, 4.7, 4.3, 4.1, 4.0, 4.2]   # außen je Stunde ab 21:00 (Mockup AUSSEN_MILD)
KALT = [-4, -5, -6, -7, -8, -8.7, -9.3, -9.8, -10, -10, -9.6]
RATEN = {"mild|1": [2.6, 14], "kalt|1": [2.6, 14]}


def _vorhersage(werte, ab=datetime(2026, 10, 28, 21, tzinfo=TZ)):
    return tuple((ab + timedelta(hours=i), float(v)) for i, v in enumerate(werte))


def _eingabe(**neu):
    werte = dict(jetzt=ABEND, tag=MORGEN, a=A, warm=WARM, soll=21.9, innen=18.3, aussen=8.0, vorhersage=_vorhersage(MILD),
                 tau=[15, 9], raten=RATEN)
    werte.update(neu)
    return S.Eingabe(**werte)


# ---------------------------------------------------------------- Tag: heute bis Planende, sonst nächster Tag mit Plan
LISTE = [Arbeitszeit(ab=date(2026, 9, 1), name="AZ", tage={0: (420, 990), 1: (420, 990), 2: (420, 990), 3: (420, 990), 4: (420, 750)})]


def _plan_am(tag):
    return tagesplan(tag, LISTE, [], HeizRegeln(), WetterTag(), trocknen=False, warm=WarmAb(vor_min=30, aufheiz_min=0))


def test_tag_naechstes_ziel_heute_nur_vor_dem_ziel_oder_wenn_gestartet():
    mi = date(2026, 10, 28)
    assert S.tag_waehlen(mi, 2 * 60, _plan_am, 30) == mi                       # nachts vor dem Ziel 06:30: heute
    assert S.tag_waehlen(mi, 6 * 60 + 29, _plan_am, 30) == mi
    assert S.tag_waehlen(mi, 12 * 60, _plan_am, 30, gestartet_heute=True) == mi   # heute gestartet: bis Planende heute
    assert S.tag_waehlen(mi, 16 * 60 + 29, _plan_am, 30, gestartet_heute=True) == mi
    # 2. Review, Befund 1: Ziel vorbei und heute nicht gestartet (Lernstand zurückgesetzt, tagsüber eingeschaltet) → morgen
    assert S.tag_waehlen(mi, 10 * 60, _plan_am, 30) == MORGEN
    assert S.tag_waehlen(mi, 20 * 60 + 47, _plan_am, 30, gestartet_heute=True) == MORGEN   # abends: morgen
    fr = date(2026, 10, 30)
    assert S.tag_waehlen(fr, 13 * 60, _plan_am, 30) == date(2026, 11, 2)       # Freitag nach 12:30: Montag


def test_tag_eigenes_fenster_ist_kein_start():
    """2. Review, Befund 3: ein eigenes Zeitfenster 18–20 Uhr nach der Arbeit (FE-0012) hält den Tag nicht auf heute –
    um 17:00 (heute gestartet) und um 19:00 ist der nächste Vorheiz-Start morgen."""
    from dataclasses import replace as ersetzen
    mi = date(2026, 10, 28)
    mit_fenster = lambda t: (p := _plan_am(t)) and ersetzen(p, eigene=((18 * 60, 20 * 60),))   # noqa: E731
    assert S.tag_waehlen(mi, 17 * 60, mit_fenster, 30, gestartet_heute=True) == MORGEN
    assert S.tag_waehlen(mi, 19 * 60, mit_fenster, 30) == MORGEN


# ---------------------------------------------------------------- abends: Mockup „abends“
def test_abends_mockup_beispiel_20_47_bei_18_3_grad():
    """20:47, 18,3 °C, τ 15 h, außen 8 → 4 °C laut Vorhersage: kühlt bis 03:30 auf 13,9 °C, 8 °C ÷ 2,6 °C/h = 3 h 05 min
    → warm 06:35 vor dem Ziel 06:40 (07:10 − 30 min). Die Regelung bekommt Ziel − Start = 190 min."""
    s = S.rechnen(_eingabe())
    assert (s.beginn_m, s.warm_m, s.ziel_m, s.a_m) == (1650, 1835, 1840, 1870)     # morgen 03:30 / 06:35 / 06:40 / 07:10
    assert round(s.innen_start, 1) == 13.9 and s.aufheiz_min == 185 and s.plan_aufheiz_min == 190
    assert not s.begrenzt and not s.geschaetzt and not s.laeuft and s.band == "kalt"   # außen beim Start 4,5 °C
    a = S.anzeige(s, ABEND, heute_ende=990)
    assert (a["tag"], a["tag_t"], a["beginn"], a["warm"], a["ziel"], a["grenze"]) == ("morgen", "morgen", "03:30", "06:35", "06:40", "01:40")
    assert a["satz"] == ("Startet morgen um 03:30: Bis dahin kühlt es auf etwa 13,9 °C ab (außen laut Vorhersage 8 → 4 °C), "
                         "aufheizen dauert mit einem Heizkörper rund 3 h 05 min – warm um 06:35, vor dem Ziel 06:40.")
    assert a["tag_grund"] == "heute ist die Arbeit vorbei (bis 16:30)" and a["kurz"] == "03:30 → 06:35"
    assert [x["k"] for x in a["schritte"]] == ["kuehl", "ziel", "auf", "grenze"]
    assert a["schritte"][0]["marke"] == "gelernt" and a["schritte"][3]["rechnung"] == "06:40 − 5 h · nicht erreicht"
    # Kurve: jetzt gemessen, dann je Stunde Prognose bis zum Start, warm, Arbeitsbeginn; außen je Stunde
    assert a["kurve"][0] == [1247, 18.3, "gemessen"] and [1650, 13.9, "prognose"] in a["kurve"] and a["kurve"][-1] == [1870, 21.9, "prognose"]
    assert all(x[2] == "prognose" for x in a["kurve"][1:]) and a["aussen_vorhersage"][-1] == [1860, 4.2, "vorhersage"]
    assert a["min"] == {"jetzt": 1247, "beginn": 1650, "warm": 1835, "ziel": 1840, "arbeitsbeginn": 1870, "grenze": 1540}


def test_auskuehlen_stunde_fuer_stunde_mit_vorhersage():
    """Je Schritt T = außen + (T − außen)·e^(−Δt/τ): bei gleichbleibend 8 °C nach 15 h (= τ) noch 1/e des Abstands."""
    k = S.auskuehlen(18.3, 0, 900, 15.0, lambda m: 8.0)
    assert abs(k[-1][1] - (8 + 10.3 / 2.718281828)) < 0.01 and k[1] == (5, k[1][1]) and len(k) == 181
    assert S.auskuehlen(18.3, 0, 600, 15.0, None)[-1][1] == 18.3                   # ohne Außenwert: kein Auskühlen
    assert S.auskuehlen(6.0, 0, 6000, 15.0, lambda m: -10.0, untergrenze=5.0)[-1][1] == 5.0   # Frostschutz hält


def test_gegenprobe_ohne_auskuehlen_startet_spaeter():
    """Ohne Außenwert und Vorhersage rechnet sie wie bis 0.8.156 mit 18,3 °C: 1 h 25 min → 05:15 (der falsche Start
    aus FE-0031). Mit Auskühlen 03:30."""
    ohne = S.rechnen(_eingabe(aussen=None, vorhersage=()))
    assert ohne.beginn_m == 1440 + 5 * 60 + 15 and ohne.innen_start == 18.3
    assert S.rechnen(_eingabe()).beginn_m < ohne.beginn_m


def test_kaeltere_vorhersage_start_rueckt_nach_vorne():
    mild = S.rechnen(_eingabe())
    kalt = S.rechnen(_eingabe(vorhersage=_vorhersage(KALT), aussen=-1.0))
    assert kalt.beginn_m < mild.beginn_m and kalt.innen_start < mild.innen_start
    # nur die Vorhersage ändert sich (außen jetzt gleich) – auch dann früher
    assert S.rechnen(_eingabe(vorhersage=_vorhersage(KALT))).beginn_m < mild.beginn_m


def test_grenze_zaehlt_vom_ziel_nicht_vom_arbeitsbeginn():
    """Sehr kalt, langsam (2,8 °C/h mit zwei Heizkörpern): bräuchte früher als 06:40 − 5 h = 01:40 – startet um 01:40
    (nicht 02:10 = 07:10 − 5 h), warm erst nach dem Ziel; `beginn_ohne` = Start ohne Grenze."""
    e = _eingabe(innen=12.0, aussen=-3.0, vorhersage=_vorhersage(KALT), raten={"kalt|2": [2.8, 8]}, anzahl=2)
    s = S.rechnen(e)
    assert s.grenze_m == 1440 + 100 and s.beginn_m == 1440 + 100 and s.begrenzt      # 01:40
    assert s.beginn_ohne_m is not None and s.beginn_ohne_m < s.beginn_m and s.warm_m > s.ziel_m
    assert s.plan_aufheiz_min == 300
    # der Plan des Tages beginnt genau dort (Grenze nur in WarmAb.fruehestens)
    plan = tagesplan(MORGEN, LISTE_710, [], HeizRegeln(), WetterTag(), trocknen=False,
                     warm=WarmAb(vor_min=30, max_min=300, aufheiz_min=s.plan_aufheiz_min))
    assert plan.vor == 100
    a = S.anzeige(s, ABEND, heute_ende=990)
    assert a["schritte"][3]["ton"] == "amber" and a["schritte"][3]["rechnung"].startswith("06:40 − 5 h · erreicht: bräuchte ")
    assert "früher nicht (Grenze „Frühestens 5 h“ vor 06:40)" in a["satz"] and "mit beiden Heizkörpern" in a["satz"]


LISTE_710 = [Arbeitszeit(ab=date(2026, 9, 1), name="AZ", tage={3: (A, 990)})]


def test_warm_ab_fruehestens_vom_ziel():
    assert WarmAb(vor_min=30, max_min=300).fruehestens(A) == A - 330
    p = tagesplan(MORGEN, LISTE_710, [], HeizRegeln(), WetterTag(), trocknen=False, warm=WarmAb(vor_min=30, max_min=300, aufheiz_min=999))
    assert p.vor == A - 330


# ---------------------------------------------------------------- nachts: heizt schon (festgehalten)
def test_nachts_rechnet_ab_der_messung_von_jetzt_weiter():
    """04:50, Start war 03:30 (gemessen 14,0 °C, Prognose 13,9 °C), jetzt 17,3 °C: noch 4,6 °C ÷ 2,6 °C/h ≈ 110 min
    (5-min-Raster) → warm 06:40."""
    jetzt = datetime(2026, 10, 29, 4, 50, tzinfo=TZ)
    fest = {"tag": "2026-10-29", "beginn": 210, "aufheiz_min": 190, "innen_start": 14.0, "prognose": 13.9, "warm": 395,
            "band": "kalt", "anzahl": 1, "rate": 2.6, "rate_n": 14}
    verlauf = tuple((datetime(2026, 10, 28, 21, tzinfo=TZ) + timedelta(minutes=15 * i), 18.3 - 0.1 * i, 8.0 - 0.05 * i) for i in range(30))
    s = S.rechnen(_eingabe(jetzt=jetzt, innen=17.3, aussen=4.6, vorhersage=_vorhersage([4.3, 4.2, 4.4], datetime(2026, 10, 29, 5, tzinfo=TZ)),
                           fest=fest, verlauf=verlauf))
    assert s.laeuft and s.beginn_m == 210 and s.warm_m == 400 and s.aufheiz_min == 110 and s.innen_start == 14.0
    a = S.anzeige(s, jetzt)
    assert (a["tag"], a["beginn"], a["warm"], a["laeuft"]) == ("heute", "03:30", "06:40", True)
    assert a["satz"].startswith("Heizt seit 03:30 (da hatte es gemessen 14 °C, vorhergesagt waren 13,9 °C) und ist jetzt bei 17,3 °C")
    assert [x["k"] for x in a["schritte"]] == ["kuehl", "ziel", "auf", "warm"] and a["schritte"][0]["marke"] == "gemessen"
    assert a["kurve"][0][0] < 210 and a["kurve"][0][2] == "gemessen" and [290, 17.3, "gemessen"] in a["kurve"]
    assert a["kurve"][-2:] == [[400, 21.9, "prognose"], [430, 21.9, "prognose"]]


def test_festhalten_nimmt_messung_und_prognose_mit():
    s = S.rechnen(_eingabe(jetzt=datetime(2026, 10, 29, 3, 30, tzinfo=TZ), innen=14.0, aussen=4.7,
                           vorhersage=_vorhersage([4.3, 4.1], datetime(2026, 10, 29, 4, tzinfo=TZ))))
    assert s.tag == MORGEN and s.beginn_m == 215 and not s.laeuft
    f = S.festhalten(s, 14.1, s.beginn_m)
    assert f["tag"] == "2026-10-29" and f["beginn"] == 215 and f["innen_start"] == 14.1 and f["rate"] == 2.6
    assert f["aufheiz_min"] == s.plan_aufheiz_min == 185 and f["prognose"] == round(s.innen_start, 2)
    assert {"prognose", "warm", "band", "anzahl", "aufheiz_min", "zusatz", "geschaetzt"} <= set(f)


# ---------------------------------------------------------------- Schätzung, Zusatz, sofort
def test_noch_nicht_gelernt_tau_und_rate_geschaetzt():
    s = S.rechnen(_eingabe(tau=None, raten={}))
    assert s.tau_geschaetzt and s.tau_h == lernen.TAU_START_H and s.rate_geschaetzt and s.rate == groesse.RATE_EINZEL
    assert s.geschaetzt and s.beginn_m < S.rechnen(_eingabe()).beginn_m       # vorsichtiger: früher
    a = S.anzeige(s, ABEND, heute_ende=990)
    assert "noch geschätzt" in a["satz"] and a["schritte"][0]["marke"] == "geschaetzt" and a["schritte"][2]["marke"] == "geschaetzt"
    assert a["schaetz_grund"].startswith("aus der Größe")
    # τ erst ab TAU_N Messungen gelernt
    assert S.rechnen(_eingabe(tau=[20, 1])).tau_geschaetzt and not S.rechnen(_eingabe(tau=[20, lernen.TAU_N])).tau_geschaetzt


def test_zusatz_einer_reicht_sonst_beide():
    einer = S.rechnen(_eingabe(raten={"kalt|1": [2.6, 5], "kalt|2": [5.0, 5]}, anzahl=2, stufen=True))
    assert einer.anzahl == 1 and not einer.zusatz
    beide = S.rechnen(_eingabe(innen=12.0, raten={"kalt|1": [1.0, 5], "mild|1": [1.0, 5],
                                                                 "kalt|2": [3.0, 5], "mild|2": [3.0, 5]}, anzahl=2, stufen=True))
    assert beide.anzahl == 2 and beide.zusatz and beide.rate_einer == 1.0
    assert "einer allein 1 °C/h, zu langsam" in S.anzeige(beide, ABEND)["schritte"][2]["rechnung"]


def test_zu_spaet_heizt_ab_jetzt():
    """06:00 bei 15 °C: 6,9 °C ÷ 2,6 °C/h = 160 min – fällig war 04:00; der Plan beginnt dort (heizt also jetzt),
    warm erst um 08:40 – nach dem Ziel."""
    jetzt = datetime(2026, 10, 29, 6, 0, tzinfo=TZ)
    s = S.rechnen(_eingabe(jetzt=jetzt, innen=15.0, vorhersage=()))
    assert s.beginn_m == 240 and s.warm_m == 520 and s.spaet and not s.begrenzt and s.plan_aufheiz_min == 160
    assert S.anzeige(s, jetzt)["satz"].startswith("Startet jetzt (fällig um 04:00)")
    # eine Minute nach dem Start (Auswertung kam später): der Start bleibt, nicht „jetzt“
    s = S.rechnen(_eingabe(jetzt=datetime(2026, 10, 29, 3, 31, tzinfo=TZ), innen=13.9, aussen=4.7, vorhersage=()))
    assert s.beginn_m == 210 and not s.spaet


def test_ohne_innentemperatur_keine_rechnung():
    assert S.rechnen(_eingabe(innen=None)) is None


def test_dauer_und_zahl():
    assert (S.dauer(185), S.dauer(45), S.dauer(300)) == ("3 h 05 min", "45 min", "5 h")
    assert (S.zahl(13.94), S.zahl(-4.0), S.zahl(2.55, 2)) == ("13,9", "−4", "2,55")


def test_nach_dem_ziel_zeigt_was_beim_start_gerechnet_war():
    """In der Arbeitszeit (heute bis Planende): kein neues „warm um“ aus der Temperatur von jetzt, sondern der Start
    von heute früh mit seiner Prognose."""
    jetzt = datetime(2026, 10, 29, 10, 0, tzinfo=TZ)
    fest = {"tag": "2026-10-29", "beginn": 210, "aufheiz_min": 190, "innen_start": 14.0, "prognose": 13.9, "warm": 395,
            "rate": 2.6, "rate_n": 14, "band": "kalt", "anzahl": 1}
    s = S.rechnen(_eingabe(jetzt=jetzt, innen=20.5, fest=fest))
    assert s.laeuft and s.beginn_m == 210 and s.warm_m == 395 and s.aufheiz_min == 0
    a = S.anzeige(s, jetzt)
    assert a["satz"] == ("Heute um 03:30 gestartet (da hatte es gemessen 14 °C, vorhergesagt waren 13,9 °C), gerechnet warm um "
                         "06:35 – jetzt 20,5 °C, Soll 21,9 °C.")
    assert a["schritte"][3] == {"k": "warm", "t": "Warm", "wert": "≈ 06:35", "rechnung": "gerechnet beim Start", "marke": None,
                                "marke_t": None, "ton": "ergebnis"}


def test_frueher_regen_und_noch_frueher_verschieben_den_start_wie_den_plan():
    """Kleidung trocknen nach Regen (+15 min) und „Noch früher“ (+5 min): der Plan beginnt 20 min vor dem Vorheizen –
    der Start auch (03:10 statt 03:30); die Aufheizzeit für den Plan bleibt Ziel − Vorheizen (190 min)."""
    from logik.arbeitszeit import WetterTag as W
    s = S.rechnen(_eingabe(frueher=(("frueher_nach_regen", 15), ("noch_frueher", 5))))
    assert (s.beginn_m, s.auf_beginn_m, s.frueher_min, s.plan_aufheiz_min) == (1630, 1650, 20, 190)
    assert s.warm_m < 1835 and s.innen_start > 13.9                      # heizt früher, also früher warm
    plan = tagesplan(MORGEN, LISTE_710, [], HeizRegeln(trocknen_frueher_min=15), W(regen_vortag_mm=6), trocknen=True,
                     warm=WarmAb(vor_min=30, max_min=300, aufheiz_min=s.plan_aufheiz_min))
    assert plan.vor == 210 and plan.start == 195                      # Regen allein: 15 min (Noch früher: plan.py)
    assert plan.start - 5 == s.beginn_m - 1440                            # mit Noch früher 5 min = Start
    a = S.anzeige(s, ABEND, heute_ende=990)
    assert a["beginn"] == "03:10" and a["frueher_min"] == 20 and a["auf_beginn"] == "03:30"
    assert "Dazu 20 min früher (Kleidung trocknen nach Regen 15 min, Noch früher 5 min) – darum schon um 03:10." in a["satz"]
    k = a["schritte"][-1]
    assert k["k"] == "frueher" and k["wert"] == "+20 min früher" and "Kleidung trocknen nach Regen +15 min" in k["rechnung"]
    # festgehalten mit Grund; danach (läuft) bleibt der Grund sichtbar
    f = S.festhalten(s, 14.3, 190, 190)
    assert f["frueher"] == [["frueher_nach_regen", 15], ["noch_frueher", 5]]
    jetzt = datetime(2026, 10, 29, 4, 0, tzinfo=TZ)
    l = S.rechnen(_eingabe(jetzt=jetzt, innen=16.0, fest=f))
    assert l.laeuft and l.beginn_m == 190 and l.frueher_min == 20 and S.anzeige(l, jetzt)["schritte"][-1]["k"] == "frueher"


def test_zusatz_ueberfaellig_heizen_beide():
    """Code-Review: Automatik erst um 05:00 an, Start war fällig – einer (2,6 °C/h) käme erst nach dem Ziel, beide
    (5 °C/h) rechtzeitig: dann beide. Eine Minute zu spät (Auswertung) reicht einer weiter (Toleranz 5 min)."""
    raten = {"kalt|1": [2.6, 5], "mild|1": [2.6, 5], "kalt|2": [5.0, 5], "mild|2": [5.0, 5]}
    spaet = S.rechnen(_eingabe(jetzt=datetime(2026, 10, 29, 5, 0, tzinfo=TZ), innen=14.0, aussen=4.7, vorhersage=(),
                               raten=raten, anzahl=2, stufen=True))
    assert spaet.anzahl == 2 and spaet.zusatz and spaet.warm_m <= spaet.ziel_m
    knapp = S.rechnen(_eingabe(jetzt=datetime(2026, 10, 29, 3, 31, tzinfo=TZ), innen=13.9, aussen=4.7, vorhersage=(),
                               raten=raten, anzahl=2, stufen=True))
    assert knapp.anzahl == 1 and not knapp.zusatz


def test_fest_beginn_plan_beginn_oder_jetzt():
    assert S.fest_beginn(210, 210) == 210 and S.fest_beginn(210, 215) == 210      # Auswertung bis 5 min später
    assert S.fest_beginn(210, 216) == 216                                          # Automatik später an: ab jetzt


def test_plan_kennt_seine_verschiebung():
    """Die Verschiebung „früher“ steht im Plan selbst (eine Regel): Regen am Vortag mit Kleidung trocknen."""
    p = tagesplan(MORGEN, LISTE_710, [], HeizRegeln(trocknen_frueher_min=15), WetterTag(regen_vortag_mm=6), trocknen=True,
                  warm=WarmAb(vor_min=30, aufheiz_min=60))
    assert p.frueher == (("frueher_nach_regen", 15),) and p.vor - p.start == 15


def test_wochenende_schnell_genug():
    """Code-Review: Freitag 13:00 → Montag 07:10 (≈ 66 h Auskühlen, stündliche Vorhersage) – unter 20 ms je Rechnung."""
    import time
    jetzt = datetime(2026, 10, 30, 13, 0, tzinfo=TZ)
    vh = _vorhersage([5 - (i % 24) / 4 for i in range(72)], datetime(2026, 10, 30, 14, tzinfo=TZ))
    e = _eingabe(jetzt=jetzt, tag=date(2026, 11, 2), vorhersage=vh, raten={"kalt|1": [2.6, 5], "mild|1": [2.6, 5],
                 "kalt|2": [5.0, 5], "mild|2": [5.0, 5]}, anzahl=2, stufen=True)
    S.rechnen(e)
    t0 = time.perf_counter()
    for _ in range(10):
        s = S.rechnen(e)
    ms = (time.perf_counter() - t0) / 10 * 1000
    assert s is not None and s.tag == date(2026, 11, 2) and ms < 20, f"{ms:.1f} ms"


def test_grenze_vorbei_ohne_heizen_ist_faellig_nicht_begrenzt_in_der_zukunft():
    """2. Review, Befund 2: 06:00, frühestens war 04:40 (06:40 − 2 h), es heizt noch nichts – nicht „Startet heute um 04:40 –
    früher nicht“, sondern „Startet jetzt (fällig um 04:40)“, spät."""
    jetzt = datetime(2026, 10, 29, 6, 0, tzinfo=TZ)
    s = S.rechnen(_eingabe(jetzt=jetzt, tag=MORGEN, warm=WarmAb(vor_min=30, max_min=120), innen=12.0, vorhersage=()))
    assert s.begrenzt and s.beginn_m == 280 and s.spaet and s.warm_m > s.ziel_m
    assert S.anzeige(s, jetzt)["satz"].startswith("Startet jetzt (fällig um 04:40)")


def test_laeuft_vorheizbeginn_aus_dem_festgehaltenen_plan():
    """2. Review, Befund 5: Automatik erst 05:00 an, festgehalten Beginn 300 (jetzt), Vorheizen laut Plan 03:30, früher
    20 min – der Beginn des Vorheizens kommt aus dem Festgehaltenen, nicht aus Beginn + früher."""
    jetzt = datetime(2026, 10, 29, 5, 30, tzinfo=TZ)
    fest = {"tag": "2026-10-29", "beginn": 300, "auf_beginn": 210, "frueher": [["noch_frueher", 20]], "aufheiz_min": 190,
            "rate": 2.6, "warm": 400}
    s = S.rechnen(_eingabe(jetzt=jetzt, innen=16.0, fest=fest))
    assert s.laeuft and s.beginn_m == 300 and s.auf_beginn_m == 210 and s.plan_aufheiz_min == 190


def test_sommerzeit_umstellung_echte_minuten():
    """2. Review, Befund 6: in den Nächten der Zeitumstellung zählt die Start-Logik echte Zeit. Ohne Auskühlen braucht
    es 300 min bis 06:40 – im Herbst (+1 h) beginnt die Uhr um 02:40, im Frühling (−1 h) um 00:40; der Plan bekommt die
    Aufheizzeit in Wanduhr-Minuten (240 bzw. 360)."""
    from zoneinfo import ZoneInfo
    wien = ZoneInfo("Europe/Vienna")
    for jetzt, tag, beginn, auf_wand in ((datetime(2026, 10, 24, 20, 0, tzinfo=wien), date(2026, 10, 25), "02:40", 240),
                                         (datetime(2026, 3, 28, 20, 0, tzinfo=wien), date(2026, 3, 29), "00:40", 360)):
        s = S.rechnen(_eingabe(jetzt=jetzt, tag=tag, aussen=None, vorhersage=(), innen=21.9 - 5 * 2.6, raten=RATEN,
                               warm=WarmAb(vor_min=30, max_min=480)))
        a = S.anzeige(s, jetzt)
        assert (a["beginn"], a["ziel"], a["arbeitsbeginn"]) == (beginn, "06:40", "07:10") and s.ziel_m - s.beginn_m == 300
        assert s.plan_aufheiz_min == auf_wand
        plan = tagesplan(tag, [Arbeitszeit(ab=date(2026, 1, 1), name="AZ", tage={tag.weekday(): (A, 990)})], [], HeizRegeln(),
                         WetterTag(), trocknen=False, warm=WarmAb(vor_min=30, max_min=480, aufheiz_min=s.plan_aufheiz_min))
        assert f"{plan.vor // 60:02d}:{plan.vor % 60:02d}" == beginn          # Plan (Wanduhr) beginnt zur selben Uhrzeit
