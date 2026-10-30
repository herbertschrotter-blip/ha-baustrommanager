"""Lernende Regelung (0.8) – TPI-Regelung mit gelerntem Nachlauf und gelernten K-Werten, ohne Home-Assistant-Code.

Vorbild ist das bewährte TPI-Verfahren von Versatile Thermostat (Herbert 30.09.2026: „Gleich B“, Mockup glas.html):
je Zyklus von `ZYKLUS_MIN` Minuten ein Einschaltanteil

    Anteil = K innen × (Soll − innen − erwarteter Nachlauf) + K außen × (Soll − außen), begrenzt auf 0…1.

Dazu lernt jeder Container selbst:
- **Nachlauf:** Nach jedem Ausschalten steigt der Fühler noch (Ölradiatoren speichern Wärme). Gemessen wird bis zur
  Spitze, gemerkt je Heizkörperart (mit Ölradiator / nur Konvektor), Heizdauer davor (kurz/mittel/lang) und
  Außentemperatur (kalt/mild) als gleitender Mittelwert. Beim Regeln wird er vom Innenwert „vorweggenommen“.
- **K innen** (Trägheit): liegt die Spitze nach dem Ausschalten deutlich über dem Soll, wird er kleiner, deutlich
  darunter größer (je Messung ein Schritt).
- **K außen** (Wärmeverlust): bleibt der Raum in einem ruhigen Zyklus nahe am Soll im Mittel darunter, wird er größer,
  darüber kleiner.
- **Aufheizen** (AN-0004, „Optimum Start“ wie Honeywell/Netatmo): wie viele °C je Stunde der Raum beim durchgehenden
  Heizen gewinnt, je Außentemperatur (kalt/mild) und Anzahl laufender Heizkörper (AN-0006: „kalt|1“, „kalt|2“ …).
  Daraus rechnet `aufheiz_min`, wie lange der Container bis zum Soll
  braucht – der Heizplan beginnt dann selbst so früh, dass das Soll rechtzeitig erreicht ist (`arbeitszeit.WarmAb`).
  Die Kälte steckt in der Rate, darum braucht ein lernender Container keinen Kälte-Frühstart.

- **Auskühlzeit τ** (FE-0031/FE-0032, Start-Logik `logik/start.py`): wie schnell der Container ohne Heizen der
  Außentemperatur entgegen auskühlt (dT/dt = −(innen − außen) ÷ τ). Gemessen in Zeiten ohne Heizen (alle Heizkörper aus,
  Nachlauf vorbei, Tür zu, nicht von Hand, außerhalb `TAU_TAG` – keine Sonne), mindestens `TAU_MIN_H` Stunden, höchstens
  `TAU_MAX_H` (dann beginnt gleich die nächste Messung), über die echte Zeit (eine Lücke über `TAU_LUECKE_MIN` beendet
  die Messung): τ = Σ(innen − außen)·Δt ÷ (innen am Anfang − innen am Ende),
  also (innen − außen) ÷ Abkühlung je Stunde über die ganze Messung. Plausibel nur mit mindestens `TAU_MIN_ABFALL` °C
  Abkühlung, `TAU_AB_DIFF` °C Abstand zu außen und τ in `TAU_GRENZEN`; gleitend gemittelt wie das Aufheizen (`tau` =
  [τ in h, Anzahl]). Bis `TAU_N` Messungen gilt der Startwert `TAU_START_H`. Weicht die Prognose ab, lernt er so von
  selbst nach.

**Tür offen** (WU-0009): Ein offener Türkontakt oder ein Raum, der beim Heizen in `OFFEN_FENSTER_MIN` Minuten um
mindestens `OFFEN_ABFALL` °C (oder in `OFFEN_LANG_MIN` Minuten um `OFFEN_LANG_ABFALL` °C) kälter wird, obwohl es draußen
kaum kälter wird („Tür vermutlich offen“, wie die Fenster-offen-Erkennung von Versatile Thermostat), verwirft die
laufenden Messungen (Aufheizen, Nachlauf, K außen); bis `OFFEN_RUHE_MIN` Minuten danach beginnt keine neue. „Beim
Heizen“ heißt (FE-0025): der Plug ist jede Minute an und ein Heizkörper zieht mindestens einmal Strom – ein Radiator mit
eigenem Thermostat taktet (etwa 3 min an, 4 min aus), ohne dass der Raum dadurch kälter werden dürfte. Die Heizung
pausiert dann `VERMUTET_PAUSE_MIN` Minuten (Aufrufer).

Alle Werte sind begrenzt; ohne Messung gilt Nachlauf 0 und die Startwerte – dann verhält sich die Regelung wie TPI.
Zeiten sind `datetime` (mit Zone), Temperaturen °C.
"""

from __future__ import annotations

from collections.abc import Iterable, Mapping
from dataclasses import dataclass
from datetime import datetime, timedelta
from math import ceil, floor
from typing import Any, overload

ZYKLUS_MIN = 10
VERSATZ_MIN = 3                # je Container um so viele Minuten versetzt, damit nicht alle zur selben Minute einschalten
MIN_EIN_MIN = 2                # kürzere Pulse lohnen nicht: Anteil unter 20 % → aus, über 80 % → ganz ein
KINT_START, KEXT_START = 0.6, 0.01
KINT_GRENZEN = (0.1, 2.0)
KEXT_GRENZEN = (0.0, 0.1)
KINT_SCHRITT = 0.05            # je Messung ±5 %
KEXT_SCHRITT = 0.001
LERN_ZYKLEN = 50               # ab so vielen Anpassungen gilt ein K-Wert als gelernt
NACHLAUF_MAX = 3.0
GEWICHT = 0.2                  # gleitender Mittelwert: neuer Wert zählt 20 %
KALT_UNTER = 5.0               # Außentemperatur darunter: „kalt“
STOPP_AB_MIN = 20              # bleibt er so lange aus, ist es ein Ausschalten (sonst nur eine TPI-Pause)
BEOBACHTEN_MAX_MIN = 90
SPITZE_VORBEI = 0.2            # so weit unter der Spitze: sie ist vorbei
TREFFER_TOLERANZ = 0.3         # Spitze so nahe am Soll gilt als getroffen
TREFFER_MAX = 10
EIN_FENSTER_MIN = 60           # Heizdauer = Minuten „ein“ in der Stunde vor dem Ausschalten
KLASSEN = (("kurz", 15), ("mittel", 45), ("lang", None))
ARTEN = ("oel", "konvektor")
BAENDER = ("kalt", "mild")
AUF_AB_GRAD = 1.0              # Aufheizen zählt, wenn es so weit unter dem Soll beginnt
AUF_MIN_MIN = 20               # … mindestens so lange durchgehend heizt
AUF_MIN_ANSTIEG = 0.5          # … und der Raum mindestens so viel wärmer wird
AUF_MAX_MIN = 240
AUF_N = 3                      # ab so vielen Messungen je Außenband rechnet der Container den Beginn selbst
AUF_GRENZEN = (0.2, 20.0)      # °C je Stunde
AUF_RASTER_MIN = 5             # Aufheizdauer auf 5 min aufgerundet (ruhiger Plan)
OFFEN_FENSTER_MIN = 10         # Tür vermutlich offen: in so vielen Minuten Heizen …
OFFEN_ABFALL = 0.3             # … so viel °C kälter geworden …
OFFEN_AUSSEN = 0.2             # … während es draußen höchstens so viel kälter wurde
OFFEN_LANG_MIN = 30            # FE-0025: oder in so vielen Minuten Heizen …
OFFEN_LANG_ABFALL = 0.6        # … so viel °C kälter (langsamer Abfall bei taktenden Radiatoren) …
OFFEN_LANG_AUSSEN = 0.4        # … draußen höchstens so viel kälter
OFFEN_RUHE_MIN = 10            # danach so lange nichts lernen
VERMUTET_PAUSE_MIN = 10        # FE-0025: so lange pausiert die Heizung bei „Tür vermutlich offen“, dann neuer Versuch
TAU_START_H = 12.0             # FE-0031/32: Auskühlzeit τ (h), solange nichts gemessen ist (vorsichtig: kühlt eher zu schnell)
TAU_N = 2                      # ab so vielen Messungen gilt τ als gelernt
TAU_GRENZEN = (2.0, 100.0)     # plausibles τ in Stunden – sonst wird die Messung verworfen
TAU_MIN_H = 2.0                # eine Messung dauert mindestens so lange …
TAU_MAX_H = 10.0               # … und höchstens so lange (dann gleich die nächste)
TAU_MIN_ABFALL = 0.5           # … und der Raum kühlt mindestens so viel ab (Fühler in 0,1-°C-Schritten)
TAU_AB_DIFF = 4.0              # … bei mindestens so viel Abstand innen − außen im Mittel
TAU_TAG = (8, 16)              # von 8 bis 16 Uhr wird nicht gemessen (Sonne wärmt den Container)
TAU_LUECKE_MIN = 10            # fehlen länger Werte (Neustart, Fühler weg), endet die Messung an der Lücke


# ---------------------------------------------------------------------------------------------------------- Regeln
@dataclass(frozen=True)
class Tpi:
    """Was die Regelung eines lernenden Containers zur Minute braucht."""

    kint: float
    kext: float
    nachlauf: float
    aussen: float | None
    minute_im_zyklus: int


UEBER_SOLL_AUS = 1.0   # Audit 0.8.165: ab Soll + 1 °C immer aus (sonst heizt ein großes kext auch weit über dem Soll weiter)


def tpi_anteil(innen: float, soll: float, t: Tpi) -> float:
    """Einschaltanteil 0…1 (siehe Modul-Docstring); ohne Außentemperatur nur der innere Teil; ab `UEBER_SOLL_AUS` über
    dem Soll 0."""
    if innen >= soll + UEBER_SOLL_AUS:
        return 0.0
    wert = t.kint * (soll - innen - t.nachlauf) + (t.kext * (soll - t.aussen) if t.aussen is not None else 0.0)
    return max(0.0, min(1.0, wert))


def tpi_ein(anteil: float, minute_im_zyklus: int, heizt_gerade: bool = False) -> bool:
    """Ein zu Beginn des Zyklus für `anteil × ZYKLUS_MIN` Minuten; sehr kurze Pulse bzw. Pausen entfallen.

    Kurze Läufe vermeiden (07.10.2026: 5 s, 33 s, 1 min im Protokoll): neu einschalten nur, wenn im Fenster noch
    mindestens `MIN_EIN_MIN` Minuten bleiben (sonst ein Start kurz vor der vollen Minute oder nach Staffelung/Pause);
    läuft er schon, bleibt er im Fenster an – zu Beginn des Zyklus mindestens `MIN_EIN_MIN`, auch wenn der Anteil
    inzwischen geschrumpft ist (solange noch Wärme fehlt).
    """
    dauer, m = anteil * ZYKLUS_MIN, minute_im_zyklus % ZYKLUS_MIN
    if dauer > ZYKLUS_MIN - MIN_EIN_MIN:
        return True
    if heizt_gerade:
        return m < dauer or (anteil > 0 and m < MIN_EIN_MIN)
    return dauer >= MIN_EIN_MIN and dauer - m >= MIN_EIN_MIN


def zyklus_minute(jetzt: datetime, nr: int) -> int:
    """Minute im TPI-Zyklus (0 … `ZYKLUS_MIN` − 1) für den Container Nummer `nr` (um `VERSATZ_MIN` je Nummer versetzt)."""
    return (jetzt.hour * 60 + jetzt.minute + VERSATZ_MIN * nr) % ZYKLUS_MIN


def takt_anzeige(anteil: float, minute_im_zyklus: int, an: bool, jetzt: datetime) -> dict[str, Any]:
    """Takt der lernenden Regelung für die Seite (laufzeit.container.<id>.takt, Mockup takt.html Variante B).

    - `art`: „dauernd“, wenn der an-Teil länger als `ZYKLUS_MIN − MIN_EIN_MIN` wäre (`tpi_ein` heizt dann durch),
      „erreicht“, wenn er kürzer als `MIN_EIN_MIN` ist (kein neuer Start), sonst „runde“.
    - `an_min`/`aus_min`: an- und aus-Teil je Runde, auf ½ min gerundet (zusammen `zyklus_min`).
    - `phase`: was gerade läuft (`an` = ein Heizkörper ist eingeschaltet).
    - `bis`: Ende der laufenden Phase (HH:MM) nach `tpi_ein` mit dem Anteil von jetzt – Minute für Minute vorausgerechnet,
      im an-Teil also mit der Mindestlaufzeit, in der Pause der Beginn der nächsten Runde. `None`, wenn sich in einer
      Runde nichts ändert (dauernd an, Soll erreicht) – und wenn der Heizkörper gerade anders steht, als `tpi_ein` will
      (die Runde ist unterbrochen: Staffelung, Mindestpause, Tür; ein Schaltbefehl ist noch unterwegs). Dann gilt nichts
      vorausgerechnet, statt ein falsches „bis“.
    - `minute`: Stelle „jetzt“ in der Runde (0 … `zyklus_min`), nur bei „runde“.
    """
    dauer, m = anteil * ZYKLUS_MIN, minute_im_zyklus % ZYKLUS_MIN
    art = "dauernd" if dauer > ZYKLUS_MIN - MIN_EIN_MIN else "erreicht" if dauer < MIN_EIN_MIN else "runde"
    an_min = {"dauernd": float(ZYKLUS_MIN), "erreicht": 0.0}.get(art, floor(dauer * 2 + 0.5) / 2)
    if art == "erreicht" and an:   # läuft noch die Mindestlaufzeit zu Ende (tpi_ein): eine Runde, nicht „Soll erreicht“
        art, an_min = "runde", float(MIN_EIN_MIN)
    bis = None
    if tpi_ein(anteil, m, an) == an:   # sonst: Runde unterbrochen
        start = jetzt.replace(second=0, microsecond=0) - timedelta(minutes=m)
        k = next((k for k in range(m + 1, m + ZYKLUS_MIN + 1) if tpi_ein(anteil, k, an) != an), None)
        bis = None if k is None else (start + timedelta(minutes=k)).strftime("%H:%M")
    return {"art": art, "anteil": round(anteil * 100), "zyklus_min": ZYKLUS_MIN, "an_min": an_min, "aus_min": ZYKLUS_MIN - an_min,
            "phase": "an" if an else "pause", "bis": bis,
            "minute": round(m + jetzt.second / 60, 1) if art == "runde" else None}


def klasse(ein_minuten: float) -> str:
    for name, bis in KLASSEN:
        if bis is None or ein_minuten < bis:
            return name
    return KLASSEN[-1][0]


def band(aussen: float | None) -> str:
    return "kalt" if aussen is not None and aussen < KALT_UNTER else "mild"


def schluessel(art: str, kl: str, bd: str) -> str:
    return f"{art}|{kl}|{bd}"


def ein_minuten(log: Iterable[tuple[datetime, datetime | None]], jetzt: datetime, fenster_min: float = EIN_FENSTER_MIN) -> float:
    """Minuten „ein“ in den letzten `fenster_min` Minuten; `None` als Ende = läuft noch."""
    ab = jetzt.timestamp() - fenster_min * 60
    summe = 0.0
    for start, ende in log:
        von, bis = max(start.timestamp(), ab), (ende or jetzt).timestamp()
        if bis > von:
            summe += bis - von
    return summe / 60


def nachlauf_erwartet(tabelle: Mapping[str, list[float]], art: str, kl: str, bd: str) -> float:
    """Gelernter Nachlauf; fehlt der Fall, der des anderen Außenbands, sonst 0 (wie ohne Lernen)."""
    for b in (bd, *(x for x in BAENDER if x != bd)):
        wert = tabelle.get(schluessel(art, kl, b))
        if wert and wert[2] > 0:
            return float(wert[0])
    return 0.0


def mittel_neu(alt: list[float] | None, grad: float, minuten: float) -> list[float]:
    """[Nachlauf °C, Minuten bis zur Spitze, Anzahl] – der erste Wert zählt ganz, danach gleitend mit `GEWICHT`."""
    grad = max(0.0, min(NACHLAUF_MAX, grad))
    if not alt or alt[2] <= 0:
        return [round(grad, 3), round(minuten, 1), 1]
    return [round(alt[0] + GEWICHT * (grad - alt[0]), 3), round(alt[1] + GEWICHT * (minuten - alt[1]), 1), int(alt[2]) + 1]


def kint_neu(kint: float, abweichung: float) -> float:
    """Spitze − Soll nach einem Ausschalten: deutlich drüber → kleiner, deutlich drunter → größer."""
    if abweichung > TREFFER_TOLERANZ:
        kint *= 1 - KINT_SCHRITT
    elif abweichung < -TREFFER_TOLERANZ:
        kint *= 1 + KINT_SCHRITT
    return round(max(KINT_GRENZEN[0], min(KINT_GRENZEN[1], kint)), 4)


def kext_neu(kext: float, mittel_unter_soll: float) -> float:
    """Mittlere Abweichung (Soll − innen) eines ruhigen Zyklus: bleibt es kühler → größer, wärmer → kleiner."""
    if mittel_unter_soll > TREFFER_TOLERANZ:
        kext += KEXT_SCHRITT
    elif mittel_unter_soll < -TREFFER_TOLERANZ:
        kext -= KEXT_SCHRITT
    return round(max(KEXT_GRENZEN[0], min(KEXT_GRENZEN[1], kext)), 4)


# ------------------------------------------------------------------------------------------------- Lernstand je Minute
def neuer_stand() -> dict[str, Any]:
    """Lernstand eines Containers (JSON-fähig, im Store unter laufzeit.lernen.<container>)."""
    return {"kint": KINT_START, "kext": KEXT_START, "n_kint": 0, "n_kext": 0, "nachlauf": {}, "treffer": [], "zyklen": 0,
            "ein": [], "beob": None, "zyklus": None, "letzte": None, "aufheizen": {}, "auf": None,
            "verlauf": [], "ruhe_bis": None, "offen": None, "tau": None, "ab": None}


@overload
def _zeit(text: str) -> datetime: ...
@overload
def _zeit(text: None) -> None: ...
def _zeit(text: str | None) -> datetime | None:
    return datetime.fromisoformat(text) if text else None


def _iso(zeit: datetime) -> str:
    return zeit.isoformat(timespec="seconds")


def takt(
    stand: dict[str, Any], *, jetzt: datetime, heizt: bool, innen: float | None, soll: float, aussen: float | None,
    art: str, regelt: bool, anzahl: int = 1, tuer_offen: bool = False, hand: bool = False, kint_ok: bool = True,
    an: bool | None = None, vermutet: bool | None = None,
) -> dict[str, Any]:
    """Eine Minute Lernen: Ein-Zeiten mitschreiben, Nachlauf nach dem Ausschalten beobachten, K-Werte anpassen.

    `heizt`: ein Heizkörper des Containers zieht gerade Strom. `art`: „oel“ oder „konvektor“ (was eingeschaltet ist
    bzw. zuletzt war). `regelt`: der Container regelt gerade selbst (lernender Thermostat) – nur dann wird K außen
    gelernt. `anzahl`: so viele Heizkörper ziehen gerade Strom (Aufheizen je Anzahl). `tuer_offen`: Türkontakt offen.
    `hand`: von Hand geschaltet – dann wird nichts gelernt (Szenarien, Herbert 01.10.2026). `kint_ok`: False, wenn
    nicht die Regelung ausschaltet (z. B. Ende von „Schnell aufheizen“) – dann kein K innen aus diesem Ausschalten.
    `an`: ein Heizkörper ist eingeschaltet (ohne Angabe: `heizt`). `vermutet`: „Tür vermutlich offen“, wenn der Aufrufer
    es schon erkannt hat (FE-0025: auch ohne Lernen); ohne Angabe rechnet `takt` es selbst aus dem Verlauf.
    Gibt den neuen Stand zurück (der alte bleibt unverändert).
    """
    s = {**neuer_stand(), **stand}
    # Tür offen (WU-0009): Verlauf der letzten Minuten, Erkennung am Temperaturabfall, Ruhezeit
    s["verlauf"] = tuer_verlauf(s["verlauf"], jetzt=jetzt, innen=innen, aussen=aussen, heizt=heizt, an=an)
    if vermutet is None:
        vermutet = tuer_vermutet(s["verlauf"], jetzt)
    if tuer_offen or vermutet:
        if s["offen"] is None:
            s["offen"] = {"art": "kontakt" if tuer_offen else "vermutet", "seit": _iso(jetzt)}
        s["ruhe_bis"] = _iso(datetime.fromtimestamp(jetzt.timestamp() + OFFEN_RUHE_MIN * 60, jetzt.tzinfo))
        s["auf"] = s["beob"] = s["zyklus"] = None
    elif s["offen"] is not None and (s["ruhe_bis"] is None or jetzt >= _zeit(s["ruhe_bis"])):
        s["offen"] = None
    if hand:   # von Hand geschaltet: laufende Messungen verwerfen, keine neuen
        s["auf"] = s["beob"] = s["zyklus"] = None
    ruhe = hand or (s["ruhe_bis"] is not None and jetzt < _zeit(s["ruhe_bis"]))
    log = [(_zeit(a), _zeit(e)) for a, e in s["ein"]]
    lief = bool(log) and log[-1][1] is None
    # Ein-Zeiten der letzten zwei Stunden
    if heizt and not lief:
        log.append((jetzt, None))
        if s["beob"] is not None:    # wieder ein, bevor die Spitze klar war
            s = _beob_ende(s, jetzt, abbruch=True)
    elif not heizt and lief:
        start = log[-1][0]
        log[-1] = (start, jetzt)
        # Ausgangswert: Temperatur der letzten Heizminute – das Ausschalten wird erst eine Minute später gesehen
        ab = s["letzte"] if s["letzte"] is not None else innen
        if ab is not None and not ruhe:
            dauer = ein_minuten(log, jetzt)
            s["beob"] = {"aus": _iso(jetzt), "temp": ab, "spitze": max(ab, innen if innen is not None else ab),
                         "spitze_zeit": _iso(jetzt), "soll": soll, "schluessel": schluessel(art, klasse(dauer), band(aussen)),
                         "kint": kint_ok}
    # Aufheizen (AN-0004): durchgehend heizen von deutlich unter dem Soll
    auf = s["auf"]
    if auf is not None:
        dauer_auf = (jetzt - _zeit(auf["start"])).total_seconds() / 60
        ende_temp = innen if heizt else s["letzte"]
        anders = heizt and int(auf.get("n", 1)) != anzahl     # ein Heizkörper mehr oder weniger: neue Messung
        if not heizt or anders or (innen is not None and innen >= soll - SPITZE_VORBEI) or dauer_auf >= AUF_MAX_MIN:
            s = _auf_ende(s, dauer_auf, ende_temp)
            if anders and not ruhe and innen is not None and innen <= soll - AUF_AB_GRAD:
                s["auf"] = {"start": _iso(jetzt), "temp": innen, "band": band(aussen), "n": anzahl}
    elif heizt and not ruhe and innen is not None and innen <= soll - AUF_AB_GRAD and (not lief or s["ruhe_bis"] is not None):
        s["ruhe_bis"] = None     # nach einer Ruhezeit beginnt die Messung neu, auch wenn der Heizkörper durchlief
        s["auf"] = {"start": _iso(jetzt), "temp": innen, "band": band(aussen), "n": anzahl}
    if innen is not None:
        s["letzte"] = innen
    grenze = jetzt.timestamp() - 2 * 3600
    s["ein"] = [[_iso(a), _iso(e) if e else None] for a, e in log if e is None or e.timestamp() > grenze]
    # Nachlauf beobachten
    b = s["beob"]
    if b is not None and innen is not None and not heizt:
        if innen > b["spitze"]:
            s["beob"] = b = {**b, "spitze": innen, "spitze_zeit": _iso(jetzt)}
        seit = (jetzt - _zeit(b["aus"])).total_seconds() / 60
        if innen <= b["spitze"] - SPITZE_VORBEI or seit >= BEOBACHTEN_MAX_MIN:
            s = _beob_ende(s, jetzt, abbruch=False)
    # Auskühlzeit τ (FE-0031/32): ohne Heizen, Nachlauf vorbei, Tür zu, nachts
    ruhig = (not heizt and not an and not ruhe and s["beob"] is None and innen is not None
             and aussen is not None and not TAU_TAG[0] <= jetzt.hour < TAU_TAG[1])
    s = _tau_takt(s, jetzt, innen, aussen, ruhig)
    # K außen: ruhiger Zyklus nahe am Soll (je ZYKLUS_MIN Minuten ein Mittelwert)
    z = s["zyklus"]
    if not regelt or ruhe or innen is None or abs(soll - innen) >= 1.0:
        s["zyklus"] = None
    elif z is None or (jetzt - _zeit(z["start"])).total_seconds() / 60 >= ZYKLUS_MIN:
        if z is not None and z["n"] >= ZYKLUS_MIN - 1:
            s["kext"] = kext_neu(float(s["kext"]), z["summe"] / z["n"])
            s["n_kext"] = int(s["n_kext"]) + 1
        s["zyklus"] = {"start": _iso(jetzt), "summe": soll - innen, "n": 1}
    else:
        s["zyklus"] = {**z, "summe": z["summe"] + soll - innen, "n": z["n"] + 1}
    return s


def tuer_verlauf(
    verlauf: list[list[Any]], *, jetzt: datetime, innen: float | None, aussen: float | None, heizt: bool, an: bool | None = None,
) -> list[list[Any]]:
    """Verlauf für `tuer_vermutet` um die Minute `jetzt` fortschreiben: `[Zeit, innen, außen, zieht Strom, ist an]`,
    nur die letzten `OFFEN_LANG_MIN` Minuten. `an` ohne Angabe: wie `heizt`."""
    grenze = jetzt.timestamp() - (OFFEN_LANG_MIN + 1) * 60
    return [v for v in verlauf if _zeit(v[0]).timestamp() > grenze] + [[_iso(jetzt), innen, aussen, heizt, heizt if an is None else an]]


def tuer_vermutet(verlauf: list[list[Any]], jetzt: datetime) -> bool:
    """Raum in den letzten `OFFEN_FENSTER_MIN` Minuten beim Heizen um `OFFEN_ABFALL` °C kälter, draußen höchstens
    `OFFEN_AUSSEN` °C kälter – oder in `OFFEN_LANG_MIN` Minuten um `OFFEN_LANG_ABFALL` °C, draußen höchstens
    `OFFEN_LANG_AUSSEN` (ohne Außenwert: nur der Raum). Beim Heizen: jede Minute an, mindestens einmal Strom (FE-0025)."""
    return (_kaelter_beim_heizen(verlauf, jetzt, OFFEN_FENSTER_MIN, OFFEN_ABFALL, OFFEN_AUSSEN)
            or _kaelter_beim_heizen(verlauf, jetzt, OFFEN_LANG_MIN, OFFEN_LANG_ABFALL, OFFEN_LANG_AUSSEN))


def _kaelter_beim_heizen(verlauf: list[list[Any]], jetzt: datetime, minuten: int, abfall: float, aussen_max: float) -> bool:
    fenster = [v for v in verlauf if (jetzt - _zeit(v[0])).total_seconds() / 60 <= minuten]
    if len(fenster) < 2 or (jetzt - _zeit(fenster[0][0])).total_seconds() / 60 < minuten - 1:
        return False
    # Einträge vor FE-0025 haben kein „an“ – dann gilt „zieht Strom“
    if not all(v[4] if len(v) > 4 else v[3] for v in fenster) or not any(v[3] for v in fenster):
        return False
    if fenster[0][1] is None or fenster[-1][1] is None:
        return False
    innen_ab = fenster[0][1] - fenster[-1][1]
    aussen = [v[2] for v in fenster if v[2] is not None]
    aussen_ab = aussen[0] - aussen[-1] if len(aussen) >= 2 else 0.0
    return innen_ab >= abfall and aussen_ab <= aussen_max


def _auf_ende(s: dict[str, Any], minuten: float, temp: float | None) -> dict[str, Any]:
    """Aufheizen abschließen: lang genug und spürbar wärmer → Rate (°C/h) in den Mittelwert des Außenbands."""
    auf = s["auf"]
    s = {**s, "auf": None}
    if temp is None or minuten < AUF_MIN_MIN or temp - auf["temp"] < AUF_MIN_ANSTIEG:
        return s
    rate = min(AUF_GRENZEN[1], max(AUF_GRENZEN[0], (temp - auf["temp"]) / minuten * 60))
    k = auf_schluessel(auf["band"], int(auf.get("n", 1)))
    alt = s["aufheizen"].get(k)
    if alt is None:
        neu = [round(rate, 3), 1]
    else:   # erste Messungen gleich gewichtet, danach gleitend wie beim Nachlauf
        n = int(alt[1]) + 1
        neu = [round(alt[0] + (rate - alt[0]) * max(GEWICHT, 1 / n), 3), n]
    s["aufheizen"] = {**s["aufheizen"], k: neu}
    return s


def _tau_takt(s: dict[str, Any], jetzt: datetime, innen: float | None, aussen: float | None, ruhig: bool) -> dict[str, Any]:
    """Eine Minute Auskühlen messen: mit der echten Zeit seit dem letzten Wert integrieren (Σ(innen − außen)·Δt); bei
    Störung, nach einer Lücke über `TAU_LUECKE_MIN` oder nach `TAU_MAX_H` abschließen (bis zum letzten Wert)."""
    ab = s.get("ab")
    if ab is not None and "letzte" not in ab:   # Messung aus einer Vorversion ohne Zeitstempel: neu beginnen
        s, ab = {**s, "ab": None}, None
    if ab is not None:
        dt = (jetzt - _zeit(ab["letzte"])).total_seconds() / 60
        stunden = (jetzt - _zeit(ab["start"])).total_seconds() / 3600
        if not ruhig or dt > TAU_LUECKE_MIN or stunden >= TAU_MAX_H:
            s = {**s, "ab": None, "tau": tau_mittel(s.get("tau"), tau_messung(ab))}
            ab = None
        else:
            assert innen is not None and aussen is not None
            mitte = (innen + ab["ende"]) / 2 - (aussen + ab.get("aussen", aussen)) / 2   # Trapez über Δt
            return {**s, "ab": {**ab, "summe": round(ab["summe"] + mitte * dt, 3), "min": round(ab["min"] + dt, 2),
                                "ende": innen, "aussen": aussen, "letzte": _iso(jetzt)}}
    if ruhig:
        assert innen is not None and aussen is not None
        s = {**s, "ab": {"start": _iso(jetzt), "letzte": _iso(jetzt), "innen": innen, "aussen": aussen, "summe": 0.0, "min": 0.0,
                         "ende": innen}}
    return s


def tau_messung(ab: Mapping[str, Any]) -> float | None:
    """τ in Stunden aus einer Messung: Σ(innen − außen)·Δt (°C·min) ÷ 60 ÷ Abkühlung; None, wenn nicht plausibel
    (kürzer als `TAU_MIN_H` gemessene Zeit, zu wenig Abkühlung oder Abstand nach außen, τ außerhalb `TAU_GRENZEN`)."""
    minuten = float(ab.get("min") or 0)
    abfall = float(ab["innen"]) - float(ab["ende"])
    if minuten < TAU_MIN_H * 60 or abfall < TAU_MIN_ABFALL or float(ab["summe"]) / minuten < TAU_AB_DIFF:
        return None
    tau = float(ab["summe"]) / 60 / abfall
    return tau if TAU_GRENZEN[0] <= tau <= TAU_GRENZEN[1] else None


def tau_mittel(alt: list[float] | None, tau: float | None) -> list[float] | None:
    """[τ, Anzahl]: erste Messungen gleich gewichtet, danach gleitend mit `GEWICHT` (wie das Aufheizen)."""
    if tau is None:
        return alt
    if not alt:
        return [round(tau, 2), 1]
    n = int(alt[1]) + 1
    return [round(float(alt[0]) + (tau - float(alt[0])) * max(GEWICHT, 1 / n), 2), n]


def auf_schluessel(bd: str, anzahl: int) -> str:
    """Schlüssel der Aufheizrate: Außenband und Anzahl laufender Heizkörper („kalt|1“)."""
    return f"{bd}|{max(1, int(anzahl))}"


def aufheiz_min(stand: Mapping[str, Any], *, innen: float | None, soll: float, aussen: float | None, anzahl: int = 1) -> int | None:
    """Minuten bis zum Soll mit der gelernten Rate (Außenband, Anzahl Heizkörper; auf 5 min aufgerundet); None = noch
    nicht gelernt."""
    e = (stand.get("aufheizen") or {}).get(auf_schluessel(band(aussen), anzahl))
    if innen is None or not e or int(e[1]) < AUF_N or float(e[0]) <= 0:
        return None
    roh = max(0.0, soll - innen) / float(e[0]) * 60
    return int(ceil(roh / AUF_RASTER_MIN - 1e-9) * AUF_RASTER_MIN)


def _beob_ende(s: dict[str, Any], jetzt: datetime, *, abbruch: bool) -> dict[str, Any]:
    """Beobachtung abschließen: zu kurz unterbrochen (TPI-Pause) → verwerfen, sonst Nachlauf, Treffer, K innen lernen."""
    b = s["beob"]
    s = {**s, "beob": None}
    seit = (jetzt - _zeit(b["aus"])).total_seconds() / 60
    if abbruch and seit < STOPP_AB_MIN:
        return s
    grad = b["spitze"] - b["temp"]
    minuten = (_zeit(b["spitze_zeit"]) - _zeit(b["aus"])).total_seconds() / 60
    s["nachlauf"] = {**s["nachlauf"], b["schluessel"]: mittel_neu(s["nachlauf"].get(b["schluessel"]), grad, minuten)}
    s["zyklen"] = int(s["zyklen"]) + 1
    abweichung = b["spitze"] - b["soll"]
    s["treffer"] = [*s["treffer"], round(abweichung, 2)][-TREFFER_MAX:]
    if b.get("kint", True) and b["soll"] - b["temp"] < 1.0:      # nahe am Soll von der Regelung ausgeschaltet: K innen
        s["kint"] = kint_neu(float(s["kint"]), abweichung)
        s["n_kint"] = int(s["n_kint"]) + 1
    return s


def anzeige(stand: Mapping[str, Any]) -> dict[str, Any]:
    """Lernstand für die Seite: K-Werte mit Fortschritt, Nachlauf-Tabelle, Treffer."""
    s = {**neuer_stand(), **stand}
    return {
        "zyklen": s["zyklen"],
        "kint": {"wert": s["kint"], "start": KINT_START, "fort": min(1.0, s["n_kint"] / LERN_ZYKLEN)},
        "kext": {"wert": s["kext"], "start": KEXT_START, "fort": min(1.0, s["n_kext"] / LERN_ZYKLEN)},
        "nachlauf": {k: {"grad": v[0], "min": v[1], "n": v[2]} for k, v in s["nachlauf"].items()},
        "treffer": list(s["treffer"]),
        "aufheizen": {k: {"rate": v[0], "n": v[1]} for k, v in s["aufheizen"].items()},
        "offen": s["offen"], "ruhe_bis": s["ruhe_bis"],
        "auf_n": AUF_N,
        # FE-0031/32: Auskühlzeit τ (h) mit Anzahl Messungen; `gelernt` ab TAU_N, sonst gilt der Startwert
        "tau": {"h": float(s["tau"][0]) if s["tau"] else None, "n": int(s["tau"][1]) if s["tau"] else 0,
                "start": TAU_START_H, "n_noetig": TAU_N, "misst": s["ab"] is not None},
    }
