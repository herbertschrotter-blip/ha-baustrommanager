"""Start-Logik eines lernenden Containers (FE-0031/FE-0032, Herbert 29.10.2026, Mockup start.html Variante B) – ohne
Home-Assistant-Code.

**Eine Rechnung** für den Heizbeginn: Regelung (Plan über `arbeitszeit.WarmAb`), Jetzt-Text („aus bis morgen 03:30“),
Plan-Chip („morgen ab 03:30 · warm 06:35“) und Dialog „Lernstand“ › „So rechnet der Start“ lesen dasselbe Ergebnis.

- **Tag** (`tag_waehlen`): der nächste Tag, dessen Ziel noch kommt; ist heute schon gestartet, heute bis zum Ende von
  „warm halten“. Abends nach der Arbeit ist es morgen – wie „aus bis morgen …“.
- **Ziel** „warm um“ = Arbeitsbeginn − „Soll erreicht vorher“ (`WarmAb.vor_min`), Soll der Arbeitszeit.
- **Auskühlen Stunde für Stunde** bis zum Start: in Schritten von `SCHRITT_MIN` Minuten nähert sich die Innen- der
  Außentemperatur mit der Auskühlzeit τ (dT/dt = −(innen − außen) ÷ τ, je Schritt exakt gelöst). Außen kommt aus der
  stündlichen Wettervorhersage (zwischen den Stunden linear, vor der ersten Stunde vom Wert von jetzt aus); ohne
  Vorhersage gilt der Wert von jetzt, ganz ohne Außenwert wird nicht ausgekühlt (wie bis 0.8.156). Mit Frostschutz
  kühlt er nicht unter die Frostschutzgrenze.
- **Aufheizen** mit der gelernten Rate (Außenband zum Start, Anzahl Heizkörper; „Zusatz nur bei Bedarf“: reicht
  einer bis zum Ziel ohne Grenze, sonst alle – AN-0006). Nicht gelernt: Rate aus der Containergröße
  (`groesse.rate_geschaetzt`), τ = `lernen.TAU_START_H`.
- **Start** = spätester Zeitpunkt im 5-min-Raster, mit dem es bis zum Ziel warm ist. **Grenze „frühestens“ zählt vom
  Ziel** (`WarmAb.fruehestens`, Herbert 29.10.2026; bis 0.8.156 vom Arbeitsbeginn): reicht sie nicht, startet er an der
  Grenze (`begrenzt`, `beginn_ohne` = Start ohne Grenze). Ist der Start schon vorbei (fällig), heizt er ab jetzt.
- **Läuft das Aufheizen schon** (heute, nach dem festgehaltenen Start `fest`), rechnet sie ab der Messung von jetzt
  weiter („nachts“): warm = jetzt + (Soll − innen) ÷ Rate.

Minuten zählen ab heute 0:00 (Tag von `jetzt`; morgen 03:30 = 1650, gestern 20:47 = −193). Zeiten sind `datetime` in
der Zone der Baustelle.
"""

from __future__ import annotations

from collections.abc import Callable, Mapping, Sequence
from bisect import bisect_left
from dataclasses import dataclass, field, replace
from datetime import UTC, date, datetime, time, timedelta, tzinfo
from math import ceil, exp, floor
from typing import Any

from . import groesse, lernen
from .arbeitszeit import Plan, WarmAb, uhrzeit

RASTER_MIN = 5            # Start und Aufheizdauer im 5-min-Raster (wie lernen.AUF_RASTER_MIN)
SCHRITT_MIN = 5           # Auskühlen in Schritten von 5 min
ZEIGEN_H = 3              # Kurve: gemessen ab so vielen Stunden vor jetzt (bzw. vor dem Start)
AUSSEN_ABSTAND_MIN = 55   # gemessene Außenwerte in der Kurve: etwa einer je Stunde
TAGE_KURZ = ("Mo", "Di", "Mi", "Do", "Fr", "Sa", "So")
NACHHOLEN_MIN = 5         # festhalten: liegt der Plan-Beginn höchstens so lange zurück, gilt er als Beginn, sonst jetzt
FRUEHER_TEXT = {"frueher_nach_regen": "Kleidung trocknen nach Regen", "noch_frueher": "Noch früher",
                "fruehstart": "Kälte-Frühstart"}   # Gründe aus Plan.frueher (arbeitszeit.tagesplan, plan.py)


def tag_waehlen(heute: date, minute: int, plan_am: Callable[[date], Plan | None], vor_min: int,
                gestartet_heute: bool = False) -> date | None:
    """Tag des nächsten Vorheiz-Starts (in 7 Tagen; sonst None).

    - Heute schon gestartet (festgehalten): heute, bis der Plan von heute mit „warm halten“ endet (`nach`) – Dialog und
      Chip zeigen dann den Start von heute früh.
    - Sonst der nächste Tag, dessen Ziel „warm um“ (Arbeitsbeginn − `vor_min`) noch kommt; heute nur, wenn es noch vor
      dem Ziel ist. Eigene Zeitfenster (FE-0012) und „warm halten“ zählen nicht als Start.
    """
    for k in range(8):
        tag = heute + timedelta(days=k)
        p = plan_am(tag)
        if p is None:
            continue
        if k == 0 and gestartet_heute and minute < p.nach:
            return tag
        if k > 0 or minute < p.a - vor_min:
            return tag
    return None


@dataclass(frozen=True)
class Eingabe:
    """Was die Start-Logik je Container braucht (der Aufrufer liest es aus HA, Lernstand und Einstellungen)."""

    jetzt: datetime
    tag: date                                  # Tag des Starts (`tag_waehlen`)
    a: int                                     # Arbeitsbeginn an diesem Tag (Minuten)
    warm: WarmAb                               # „Soll erreicht vorher“ (vor_min) und „Frühestens“ (max_min)
    soll: float
    innen: float | None
    aussen: float | None = None
    vorhersage: tuple[tuple[datetime, float], ...] = ()                 # stündlich: (Stundenbeginn, °C)
    verlauf: tuple[tuple[datetime, float | None, float | None], ...] = ()   # gemessen: (Zeit, innen, außen)
    tau: Sequence[float] | None = None         # Lernstand `tau` = [τ in h, Anzahl]
    raten: Mapping[str, Sequence[float]] = field(default_factory=dict)  # Lernstand `aufheizen` {"kalt|1": [°C/h, n]}
    anzahl: int = 1                            # aktive Heizkörper im Container
    stufen: bool = False                       # „Zusatz nur bei Bedarf“ (AN-0006)
    m2: float | None = None                    # Größe für die Schätzung
    untergrenze: float | None = None           # Frostschutz an: so tief kühlt er nicht aus
    fest: Mapping[str, Any] | None = None      # beim Start festgehalten (`festhalten`): {tag, beginn, innen_start, …}
    heute_ende: int | None = None              # Arbeitsende heute (für den Grund „heute ist die Arbeit vorbei“)
    # früher beginnen als gerechnet: (Grund, Minuten) aus dem Plan (`Plan.frueher`: „frueher_nach_regen“, „noch_frueher“);
    # der Plan beginnt um so viel früher als das Vorheizen, darum auch der Start
    frueher: tuple[tuple[str, int], ...] = ()


@dataclass(frozen=True)
class Start:
    """Ergebnis der Start-Logik. Minuten ab heute 0:00 (`beginn_m` …); `aufheiz_min` ist die Aufheizdauer der Prognose,
    `plan_aufheiz_min` = Ziel − Start (für `WarmAb.aufheiz_min`, damit der Plan genau zum Start beginnt)."""

    tag: date
    jetzt_m: int
    beginn_m: int
    warm_m: int
    ziel_m: int
    a_m: int
    grenze_m: int
    soll: float
    innen_jetzt: float
    innen_start: float
    tau_h: float
    tau_n: int
    tau_geschaetzt: bool
    aussen_von: float | None
    aussen_bis: float | None
    band: str
    rate: float
    rate_n: int
    rate_geschaetzt: bool
    anzahl: int
    rate_einer: float | None
    aufheiz_min: int
    begrenzt: bool
    beginn_ohne_m: int | None
    spaet: bool                    # schon zu spät für das Ziel: heizt ab jetzt, warm erst nach dem Ziel
    laeuft: bool                   # Start vorbei, heizt gerade auf (festgehalten)
    zusatz: bool                   # Zusatz-Heizkörper beim Aufheizen dabei (AN-0006)
    stufen: bool                   # „Zusatz nur bei Bedarf“ an
    prognose_start: float | None   # laeuft: vorhergesagte Temperatur beim Start (festgehalten)
    kurve: tuple[tuple[int, float, str], ...]
    aussen_kurve: tuple[tuple[int, float, str], ...]
    vor_min: int
    max_min: int
    auf_beginn_m: int = 0          # Start der Rechnung ohne „früher“ (= Beginn des Vorheizens im Plan)
    ziel_wand: int = 0             # Ziel als Wanduhr-Minute am Tag des Starts (für den Plan)
    null_utc: datetime = datetime(2000, 1, 1, tzinfo=UTC)   # heute 0:00 (Ortszeit) in UTC – Bezug aller *_m
    zone: tzinfo | None = None

    def uhr(self, m: int) -> str:
        """Echte Minute ab heute 0:00 → „HH:MM“ in Ortszeit."""
        t = (self.null_utc + timedelta(minutes=m)).astimezone(self.zone) if self.zone is not None else self.null_utc + timedelta(minutes=m)
        return f"{t.hour:02d}:{t.minute:02d}"

    def wand(self, m: int) -> int:
        """Echte Minute ab heute 0:00 → Wanduhr-Minute am Tag des Starts (davor negativ)."""
        t = (self.null_utc + timedelta(minutes=m)).astimezone(self.zone) if self.zone is not None else self.null_utc + timedelta(minutes=m)
        return (t.date() - self.tag).days * 1440 + t.hour * 60 + t.minute
    frueher: tuple[tuple[str, int], ...] = ()   # (Grund, Minuten), um die der Plan früher beginnt

    @property
    def frueher_min(self) -> int:
        return max(0, self.auf_beginn_m - self.beginn_m)

    @property
    def plan_aufheiz_min(self) -> int:
        """Ziel − Beginn des Vorheizens in Wanduhr-Minuten des Tages (wie der Plan): daraus rechnet `tagesplan` `vor`;
        „früher“ zieht er selbst davon ab."""
        return max(0, self.ziel_wand - self.wand(self.auf_beginn_m))

    @property
    def geschaetzt(self) -> bool:
        return self.tau_geschaetzt or self.rate_geschaetzt


# ---------------------------------------------------------------------------------------------------- Hilfen
def _min(t: datetime, heute: date) -> int:
    """Minuten ab heute 0:00 in echter Zeit (über die Umstellung der Sommerzeit hinweg: 60 min mehr bzw. weniger als die
    Wanduhr) – Zone von `t`."""
    null = datetime.combine(heute, time(), tzinfo=t.tzinfo)
    return int((t.astimezone(UTC) - null.astimezone(UTC)).total_seconds() // 60)


def _wand(tag: date, minute: int, heute: date, zone: tzinfo | None) -> int:
    """Wanduhr-Minute `minute` am Tag `tag` (Plan, Arbeitszeit) → echte Minuten ab heute 0:00."""
    return _min(datetime.combine(tag, time(), tzinfo=zone) + timedelta(minutes=minute), heute)


def _raster_auf(minuten: float) -> int:
    """Auf 5 min aufrunden; Rundungsreste der Rechnung (unter 1/100 min) zählen nicht."""
    return int(ceil(round(minuten, 2) / RASTER_MIN - 1e-9) * RASTER_MIN)


def _aufheiz(innen: float, soll: float, rate: float) -> int:
    """Minuten bis zum Soll mit `rate` °C/h, auf 5 min aufgerundet."""
    return _raster_auf(max(0.0, soll - innen) / rate * 60) if rate > 0 else 0


def zahl(x: float, stellen: int = 1) -> str:
    """Wie die Seite: Komma, echtes Minus; `stellen` = höchstens so viele Nachkommastellen."""
    r = round(float(x), stellen)
    t = str(int(r)) if r == int(r) else f"{r:.{stellen}f}".replace(".", ",")
    return t.replace("-", "−")


def dauer(minuten: int) -> str:
    """185 → „3 h 05 min“, 45 → „45 min“, 300 → „5 h“."""
    h, m = divmod(max(0, int(minuten)), 60)
    if not h:
        return f"{m} min"
    return f"{h} h" if not m else f"{h} h {m:02d} min"


def _aussen_fn(e: Eingabe, jetzt_m: int, heute: date) -> Callable[[float], float] | None:
    """Außentemperatur je Minute: vom Wert von jetzt linear zur Vorhersage, danach die letzte Stunde."""
    pkt: list[tuple[float, float]] = [(float(jetzt_m), float(e.aussen))] if e.aussen is not None else []
    pkt += sorted((float(m), float(c)) for t, c in e.vorhersage if (m := _min(t, heute)) > jetzt_m)
    if not pkt:
        return None

    return lambda m: _bei(pkt, m)   # linear zwischen den Stunden (bisect), davor/danach der Rand


def auskuehlen(innen: float, von_m: int, bis_m: int, tau_h: float, aussen: Callable[[float], float] | None,
               untergrenze: float | None = None) -> list[tuple[int, float]]:
    """Innentemperatur ohne Heizen von `von_m` bis `bis_m` (Minuten): je Schritt T = a + (T − a)·e^(−Δt/τ) mit der
    Außentemperatur `a` in der Mitte des Schritts. Punkte bei `von_m` und im `SCHRITT_MIN`-Raster."""
    punkte = [(von_m, innen)]
    t, m = innen, von_m
    unten = None if untergrenze is None else min(untergrenze, innen)
    naechste = (von_m // SCHRITT_MIN + 1) * SCHRITT_MIN
    while naechste <= bis_m:
        dt = naechste - m
        if aussen is not None and tau_h > 0:
            a = aussen(m + dt / 2)
            t = a + (t - a) * exp(-dt / 60 / tau_h)
        if unten is not None:
            t = max(t, unten)
        punkte.append((naechste, t))
        m, naechste = naechste, naechste + SCHRITT_MIN
    return punkte


def _bei(punkte: Sequence[tuple[float, float]], m: float) -> float:
    """Wert der Kurve bei Minute `m` (linear zwischen den Punkten; davor der erste, danach der letzte)."""
    if m <= punkte[0][0]:
        return punkte[0][1]
    if m >= punkte[-1][0]:
        return punkte[-1][1]
    i = bisect_left(punkte, (m, float("-inf")))
    (m0, c0), (m1, c1) = punkte[i - 1], punkte[i]
    return c0 + (c1 - c0) * (m - m0) / (m1 - m0) if m1 > m0 else c1


def _rate_gelernt(raten: Mapping[str, Sequence[float]], bd: str, anzahl: int) -> tuple[float, int] | None:
    e = raten.get(lernen.auf_schluessel(bd, anzahl))
    if e and int(e[1]) >= lernen.AUF_N and float(e[0]) > 0:
        return float(e[0]), int(e[1])
    return None


def _rate_n(raten: Mapping[str, Sequence[float]], bd: str, anzahl: int) -> int:
    e = raten.get(lernen.auf_schluessel(bd, anzahl))
    return int(e[1]) if e else 0


@dataclass(frozen=True)
class _Lauf:
    beginn: int
    warm: int
    innen_start: float
    band: str
    rate: float
    rate_n: int
    rate_geschaetzt: bool
    aufheiz: int
    begrenzt: bool
    beginn_ohne: int | None
    spaet: bool


def _suchen(e: Eingabe, kurve: Sequence[tuple[int, float]], aussen: Callable[[float], float] | None, jetzt_m: int,
            ziel_m: int, grenze_m: int, anzahl: int) -> _Lauf:
    """Spätester Start im 5-min-Raster, mit dem es bis `ziel_m` warm ist; nicht vor der Grenze `grenze_m`.

    Liegt er schon vor jetzt (fällig, z. B. die Auswertung kam erst eine Minute später), bleibt er stehen – die Regelung
    heizt dann ab jetzt (der Plan beginnt in der Vergangenheit) und die Prognose rechnet ab der Temperatur von jetzt."""
    geschaetzt = groesse.rate_geschaetzt(e.m2)

    def rate(m: float) -> tuple[str, float, int, bool]:
        a = aussen(max(m, jetzt_m)) if aussen is not None else e.aussen
        bd = lernen.band(a)
        g = _rate_gelernt(e.raten, bd, anzahl)
        return (bd, g[0], g[1], False) if g else (bd, geschaetzt, _rate_n(e.raten, bd, anzahl), True)

    def auf(m: float) -> int:   # vor jetzt: die Temperatur von jetzt (früher war es eher wärmer)
        return _aufheiz(_bei(kurve, max(m, jetzt_m)), e.soll, rate(m)[1])

    ohne = None
    s = floor(ziel_m / RASTER_MIN) * RASTER_MIN
    while s > jetzt_m:   # nur zwischen jetzt und dem Ziel wird gesucht (Kurve der Prognose)
        if s + auf(s) <= ziel_m:
            ohne = s
            break
        s -= RASTER_MIN
    if ohne is None:   # vor jetzt gilt die Temperatur von jetzt: der späteste Start direkt (fällig bzw. ohne Grenze)
        ohne = floor(min(jetzt_m, ziel_m - auf(jetzt_m)) / RASTER_MIN) * RASTER_MIN
    if ohne >= grenze_m:
        beginn, begrenzt = ohne, False
    else:
        beginn, begrenzt = grenze_m, True
    ab = max(beginn, jetzt_m)
    bd, r, n, ges = rate(ab)
    t0 = _bei(kurve, ab)
    a = _aufheiz(t0, e.soll, r)
    warm = ab + a
    # spät: warm erst nach dem Ziel, ohne dass die Grenze schuld ist – oder die Grenze liegt schon zurück (fällig)
    return _Lauf(beginn, warm, t0, bd, r, n, ges, a, begrenzt, ohne if begrenzt else None,
                 warm > ziel_m and (not begrenzt or beginn < jetzt_m))


def einer_reicht(einer: _Lauf, ziel_m: int) -> bool:
    """AN-0006: ein Heizkörper reicht, wenn seine Rate gelernt ist, die Grenze nicht greift und er bis zum Ziel warm ist –
    höchstens `RASTER_MIN` später (eine verspätete Auswertung). Ist der Start überfällig (z. B. Automatik spät an) und
    käme er später, heizen alle."""
    return not einer.rate_geschaetzt and not einer.begrenzt and einer.warm <= ziel_m + RASTER_MIN


# ---------------------------------------------------------------------------------------------------- Rechnung
def rechnen(e: Eingabe) -> Start | None:
    """Start eines lernenden Containers (siehe Modul-Docstring); None ohne Innentemperatur."""
    if e.innen is None:
        return None
    heute, zone = e.jetzt.date(), e.jetzt.tzinfo
    jetzt_m = _min(e.jetzt, heute)
    versatz = _wand(e.tag, 0, heute, zone)
    a_m = _wand(e.tag, e.a, heute, zone)
    ziel_m = _wand(e.tag, e.a - e.warm.vor_min, heute, zone)
    grenze_m = _wand(e.tag, max(0, e.warm.fruehestens(e.a)), heute, zone)   # vor Mitternacht des Tages beginnt kein Plan
    tau_gelernt = e.tau is not None and int(e.tau[1]) >= lernen.TAU_N and float(e.tau[0]) > 0
    tau_h = float(e.tau[0]) if tau_gelernt and e.tau is not None else lernen.TAU_START_H
    tau_n = int(e.tau[1]) if e.tau else 0
    aussen = _aussen_fn(e, jetzt_m, heute)
    fest = e.fest if e.fest and e.fest.get("tag") == e.tag.isoformat() and e.fest.get("beginn") is not None else None
    gemeinsam: dict[str, Any] = dict(tag=e.tag, jetzt_m=jetzt_m, ziel_m=ziel_m, a_m=a_m, grenze_m=grenze_m, soll=e.soll, innen_jetzt=e.innen,
                     tau_h=tau_h, tau_n=tau_n, tau_geschaetzt=not tau_gelernt, vor_min=e.warm.vor_min, max_min=e.warm.max_min,
                     stufen=e.stufen and e.anzahl >= 2, ziel_wand=e.a - e.warm.vor_min,
                     null_utc=datetime.combine(heute, time(), tzinfo=zone).astimezone(UTC), zone=zone)
    if fest is not None and jetzt_m >= _wand(e.tag, int(fest["beginn"]), heute, zone):
        return _laeuft(e, fest, aussen, gemeinsam, versatz)
    kurve = auskuehlen(e.innen, jetzt_m, max(ziel_m, jetzt_m), tau_h, aussen, e.untergrenze)
    alle = max(1, e.anzahl)
    rate_einer = None
    if e.stufen and alle >= 2:   # AN-0006: reicht einer (gelernt, ohne Grenze)? sonst alle
        einer = _suchen(e, kurve, aussen, jetzt_m, ziel_m, grenze_m, 1)
        if einer_reicht(einer, ziel_m):
            lauf, anzahl, zusatz = einer, 1, False
        else:
            beide = _suchen(e, kurve, aussen, jetzt_m, ziel_m, grenze_m, alle)
            if not beide.rate_geschaetzt:
                lauf, anzahl, zusatz = beide, alle, True
                rate_einer = None if einer.rate_geschaetzt else einer.rate
            elif not einer.rate_geschaetzt:   # nur für einen gelernt: so rechnen, beide laufen mit
                lauf, anzahl, zusatz = einer, 1, True
            else:
                lauf, anzahl, zusatz = einer, 1, False
    else:
        lauf, anzahl, zusatz = _suchen(e, kurve, aussen, jetzt_m, ziel_m, grenze_m, alle), alle, False
    # „früher“ (Regen, Noch früher): der Plan beginnt um so viel früher – der Start auch; ab da wird geheizt, also
    # rechnen Temperatur beim Start und „warm um“ ab dort (nicht vor Mitternacht des Tages, wie der Plan)
    extra = sum(max(0, int(m)) for _, m in e.frueher)
    auf_beginn = lauf.beginn
    if extra:
        b = max(versatz, lauf.beginn - extra)
        ab = max(b, jetzt_m)
        t0 = _bei(kurve, ab)
        a = _aufheiz(t0, e.soll, lauf.rate)
        lauf = replace(lauf, beginn=b, warm=ab + a, innen_start=t0, aufheiz=a,
                       spaet=ab + a > ziel_m and (not lauf.begrenzt or b < jetzt_m))
    return Start(
        **gemeinsam, auf_beginn_m=auf_beginn, frueher=tuple((g, int(m)) for g, m in e.frueher if int(m) > 0),
        beginn_m=lauf.beginn, warm_m=lauf.warm, innen_start=round(lauf.innen_start, 2),
        aussen_von=e.aussen if e.aussen is not None else (aussen(jetzt_m) if aussen else None),
        aussen_bis=aussen(lauf.beginn) if aussen is not None else None, band=lauf.band, rate=lauf.rate,
        rate_n=lauf.rate_n, rate_geschaetzt=lauf.rate_geschaetzt, anzahl=anzahl, rate_einer=rate_einer,
        aufheiz_min=lauf.aufheiz, begrenzt=lauf.begrenzt, beginn_ohne_m=lauf.beginn_ohne, spaet=lauf.spaet, laeuft=False,
        zusatz=zusatz, prognose_start=None,
        kurve=_kurve(e, kurve, jetzt_m, lauf.beginn, lauf.warm, a_m),
        aussen_kurve=_aussen_kurve(e, aussen, jetzt_m, min(jetzt_m, lauf.beginn), a_m, heute),
    )


def _laeuft(e: Eingabe, fest: Mapping[str, Any], aussen: Callable[[float], float] | None, gemeinsam: dict[str, Any],
            versatz: int) -> Start:
    """Start vorbei, heizt gerade auf: ab der Messung von jetzt weiter mit der Rate vom Start."""
    assert e.innen is not None
    heute = e.jetzt.date()
    jetzt_m, a_m = gemeinsam["jetzt_m"], gemeinsam["a_m"]
    zone = e.jetzt.tzinfo
    beginn = _wand(e.tag, int(fest["beginn"]), heute, zone)
    frueher = tuple((str(g), int(m)) for g, m in (fest.get("frueher") or []))
    # Beginn des Vorheizens: festgehalten aus dem Plan; ältere Stände ohne ihn: Beginn + „früher“
    auf_beginn = (_wand(e.tag, int(fest["auf_beginn"]), heute, zone) if fest.get("auf_beginn") is not None
                  else beginn + sum(m for _, m in frueher))
    rate = float(fest.get("rate") or groesse.rate_geschaetzt(e.m2))
    if e.innen < e.soll and jetzt_m < gemeinsam["ziel_m"]:
        rest = _aufheiz(e.innen, e.soll, rate)
        warm = jetzt_m + rest
    else:   # schon warm oder das Ziel ist vorbei (Arbeitszeit): die Prognose vom Start
        rest = 0
        warm = versatz + int(fest["warm"]) if fest.get("warm") is not None else min(jetzt_m, gemeinsam["ziel_m"])
    innen_start = fest.get("innen_start")
    punkte = [(m, c, "gemessen") for m, c in _gemessen(e, heute, min(jetzt_m, beginn) - ZEIGEN_H * 60, jetzt_m)]
    punkte.append((jetzt_m, round(e.innen, 1), "gemessen"))
    if warm > jetzt_m:
        punkte.append((warm, round(e.soll, 1), "prognose"))
    if a_m > max(warm, jetzt_m):
        punkte.append((a_m, round(e.soll, 1), "prognose"))
    return Start(
        **gemeinsam, beginn_m=beginn, warm_m=warm, auf_beginn_m=auf_beginn, frueher=frueher,
        innen_start=round(float(innen_start), 2) if innen_start is not None else round(e.innen, 2),
        aussen_von=e.aussen, aussen_bis=aussen(warm) if aussen is not None else e.aussen,
        band=str(fest.get("band") or lernen.band(e.aussen)), rate=rate, rate_n=int(fest.get("rate_n") or 0),
        rate_geschaetzt=bool(fest.get("geschaetzt")), anzahl=int(fest.get("anzahl") or 1), rate_einer=None,
        aufheiz_min=rest, begrenzt=bool(fest.get("begrenzt")), beginn_ohne_m=None, spaet=False, laeuft=True,
        zusatz=bool(fest.get("zusatz")),
        prognose_start=float(fest["prognose"]) if fest.get("prognose") is not None else None,
        kurve=tuple(_ordnen(punkte)),
        aussen_kurve=_aussen_kurve(e, aussen, jetzt_m, min(jetzt_m, beginn), a_m, heute),
    )


def _gemessen(e: Eingabe, heute: date, ab_m: int, bis_m: int) -> list[tuple[int, float]]:
    return [(m, round(float(innen), 1)) for t, innen, _ in e.verlauf
            if innen is not None and ab_m <= (m := _min(t, heute)) < bis_m]


def _ordnen(punkte: list[tuple[int, float, str]]) -> list[tuple[int, float, str]]:
    """Nach Minute, je Minute der letzte Punkt."""
    je: dict[int, tuple[int, float, str]] = {}
    for p in punkte:
        je[p[0]] = p
    return [je[m] for m in sorted(je)]


def _kurve(e: Eingabe, kurve: Sequence[tuple[int, float]], jetzt_m: int, beginn: int, warm: int,
           a_m: int) -> tuple[tuple[int, float, str], ...]:
    """Innen: gemessen bis jetzt, dann Prognose – je volle Stunde bis zum Start, Start, warm, Arbeitsbeginn."""
    assert e.innen is not None
    heute = e.jetzt.date()
    punkte = [(m, c, "gemessen") for m, c in _gemessen(e, heute, jetzt_m - ZEIGEN_H * 60, jetzt_m)]
    punkte.append((jetzt_m, round(e.innen, 1), "gemessen"))
    stunde = (jetzt_m // 60 + 1) * 60
    while stunde < beginn:
        punkte.append((stunde, round(_bei(kurve, stunde), 1), "prognose"))
        stunde += 60
    if beginn > jetzt_m:
        punkte.append((beginn, round(_bei(kurve, beginn), 1), "prognose"))
    punkte.append((warm, round(e.soll, 1), "prognose"))
    if a_m > warm:
        punkte.append((a_m, round(e.soll, 1), "prognose"))
    return tuple(_ordnen(punkte))


def _aussen_kurve(e: Eingabe, aussen: Callable[[float], float] | None, jetzt_m: int, ab_m: int, a_m: int,
                  heute: date) -> tuple[tuple[int, float, str], ...]:
    """Außen je Stunde: gemessen (Verlauf, etwa stündlich) bis jetzt, dann die Vorhersage bis über den Arbeitsbeginn."""
    punkte: list[tuple[int, float, str]] = []
    for t, _, au in e.verlauf:
        m = _min(t, heute)
        if au is not None and ab_m - ZEIGEN_H * 60 <= m < jetzt_m and (not punkte or m - punkte[-1][0] >= AUSSEN_ABSTAND_MIN):
            punkte.append((m, round(float(au), 1), "gemessen"))
    if e.aussen is not None:
        punkte.append((jetzt_m, round(e.aussen, 1), "gemessen"))
    for t, c in sorted(e.vorhersage):
        m = _min(t, heute)
        if m > jetzt_m:
            punkte.append((m, round(float(c), 1), "vorhersage"))
            if m >= a_m:
                break
    if not punkte and aussen is not None:
        punkte.append((jetzt_m, round(aussen(jetzt_m), 1), "vorhersage"))
    return tuple(_ordnen(punkte))


# ---------------------------------------------------------------------------------------------------- Festhalten
def fest_beginn(plan_start: int, minute: int) -> int:
    """Beginn, der festgehalten wird: der Plan-Beginn, wenn er höchstens `NACHHOLEN_MIN` zurückliegt (Auswertung kam
    etwas später), sonst jetzt (z. B. Automatik erst nach dem Start eingeschaltet – geheizt wird ab jetzt)."""
    return plan_start if minute - plan_start <= NACHHOLEN_MIN else minute


def festhalten(s: Start, innen: float | None, minute: int, aufheiz_min: int | None = None) -> dict[str, Any]:
    """Beim Start festhalten (Store `laufzeit.warm_start.<id>`, nur am Tag des Starts = heute): was der Dialog nach dem
    Start zeigt und womit er weiterrechnet. `minute` = tatsächlicher Beginn (Minuten ab 0:00), `innen` = gemessen,
    `aufheiz_min` = Aufheizzeit des Plans, der gerade gilt (sonst Ziel − Start)."""
    return {
        "tag": s.tag.isoformat(), "beginn": minute,
        "aufheiz_min": s.plan_aufheiz_min if aufheiz_min is None else aufheiz_min,
        "innen_start": round(innen, 2) if innen is not None else None, "prognose": round(s.innen_start, 2),
        "warm": s.warm_m, "band": s.band, "anzahl": s.anzahl, "rate": s.rate, "rate_n": s.rate_n, "zusatz": s.zusatz,
        "geschaetzt": s.rate_geschaetzt, "begrenzt": s.begrenzt, "tau_h": round(s.tau_h, 2),
        "frueher": [list(x) for x in s.frueher],
    }


# ---------------------------------------------------------------------------------------------------- Anzeige
def _tag(s: Start, heute: date) -> tuple[str, str]:
    tage = (s.tag - heute).days
    if tage == 0:
        return "heute", "heute"
    if tage == 1:
        return "morgen", "morgen"
    return s.tag.isoformat(), TAGE_KURZ[s.tag.weekday()]


def _heizkoerper(anzahl: int) -> str:
    return "einem Heizkörper" if anzahl <= 1 else ("beiden Heizkörpern" if anzahl == 2 else f"{anzahl} Heizkörpern")


def anzeige(s: Start, jetzt: datetime, heute_ende: int | None = None, m2: float | None = None) -> dict[str, Any]:
    """Für die Seite (`laufzeit.container.<id>.start`, api-0.7): Uhrzeiten, Werte, ein Satz, Kurve und Kacheln – die
    Seite rechnet nichts mehr, sie zeichnet nur (`min` = dieselben Zeitpunkte als Minuten ab heute 0:00)."""
    heute = jetzt.date()
    tag, tag_t = _tag(s, heute)
    if s.laeuft:
        tag_grund = "Arbeitstag, Start ist vorbei – heizt gerade auf"
    elif tag != "heute":
        tag_grund = (f"heute ist die Arbeit vorbei (bis {uhrzeit(heute_ende)})" if heute_ende is not None
                     else "heute wird nicht gearbeitet")
    else:
        tag_grund = "Arbeitstag, der Start kommt noch"
    grenze_h = s.max_min / 60
    av = None if s.aussen_von is None else round(s.aussen_von)
    ab = None if s.aussen_bis is None else round(s.aussen_bis)
    aussen_t = (f"außen laut Vorhersage {zahl(av, 0)} → {zahl(ab, 0)} °C" if av is not None and ab is not None and av != ab
                else f"außen etwa {zahl(av if av is not None else (ab or 0), 0)} °C" if av is not None or ab is not None else None)
    hk = _heizkoerper(s.anzahl)
    spaet_min = s.warm_m - s.ziel_m
    if s.laeuft:
        prog = f", vorhergesagt waren {zahl(s.prognose_start)} °C" if s.prognose_start is not None else ""
        if s.jetzt_m >= s.ziel_m:
            satz = (f"Heute um {s.uhr(s.beginn_m)} gestartet (da hatte es gemessen {zahl(s.innen_start)} °C{prog}), "
                    f"gerechnet warm um {s.uhr(s.warm_m)} – jetzt {zahl(s.innen_jetzt)} °C, Soll {zahl(s.soll)} °C.")
        elif s.innen_jetzt < s.soll:
            satz = (f"Heizt seit {s.uhr(s.beginn_m)} (da hatte es gemessen {zahl(s.innen_start)} °C{prog}) und ist jetzt bei "
                    f"{zahl(s.innen_jetzt)} °C: noch {zahl(s.soll - s.innen_jetzt)} °C, mit {zahl(s.rate)} °C/h etwa "
                    f"{dauer(s.aufheiz_min)} – warm um {s.uhr(s.warm_m)}"
                    + (f", vor dem Ziel {s.uhr(s.ziel_m)}." if spaet_min <= 0 else f", {spaet_min} min nach dem Ziel {s.uhr(s.ziel_m)}."))
        else:
            satz = (f"Heizt seit {s.uhr(s.beginn_m)} (da hatte es gemessen {zahl(s.innen_start)} °C{prog}) – jetzt "
                    f"{zahl(s.innen_jetzt)} °C, das Soll {zahl(s.soll)} °C ist erreicht.")
    elif s.spaet or s.beginn_m <= s.jetzt_m:
        satz = (f"Startet jetzt (fällig um {s.uhr(s.beginn_m)}): Es hat {zahl(s.innen_jetzt)} °C, aufheizen dauert mit {hk} rund "
                f"{dauer(s.aufheiz_min)} – "
                f"warm um etwa {s.uhr(s.warm_m)}" + (f", {spaet_min} min nach dem Ziel {s.uhr(s.ziel_m)}." if spaet_min > 0 else "."))
    elif s.geschaetzt:
        was = ("Auskühlen und Aufheizen aus Größe und Heizleistung" if s.tau_geschaetzt and s.rate_geschaetzt
               else "Auskühlen noch geschätzt" if s.tau_geschaetzt else "Aufheizen aus der Größe")
        satz = (f"Startet {tag_t} um {s.uhr(s.beginn_m)}, damit es um {s.uhr(s.ziel_m)} {zahl(s.soll)} °C hat – noch geschätzt "
                f"({was}, vorsichtig gerechnet).")
        if s.begrenzt:
            satz += f" Früher nicht (Grenze „Frühestens {dauer(s.max_min)}“), warm erst um etwa {s.uhr(s.warm_m)}."
    elif s.begrenzt:
        satz = (f"Startet {tag_t} um {s.uhr(s.beginn_m)} – früher nicht (Grenze „Frühestens {dauer(s.max_min)}“ vor "
                f"{s.uhr(s.ziel_m)}). Bis dahin kühlt es{' bei ' + aussen_t.replace('außen laut Vorhersage ', '').replace('außen etwa ', '') + ' außen' if aussen_t else ''} "
                f"auf etwa {zahl(s.innen_start)} °C ab; mit {hk} ist es erst um etwa {s.uhr(s.warm_m)} warm, "
                f"{spaet_min} min nach dem Ziel, {'vor' if s.warm_m <= s.a_m else 'nach'} Arbeitsbeginn.")
    else:
        satz = (f"Startet {tag_t} um {s.uhr(s.beginn_m)}: Bis dahin kühlt es auf etwa {zahl(s.innen_start)} °C ab"
                + (f" ({aussen_t})" if aussen_t else "")
                + f", aufheizen dauert mit {hk} rund {dauer(s.aufheiz_min)} – warm um {s.uhr(s.warm_m)}, vor dem Ziel {s.uhr(s.ziel_m)}.")
    if s.frueher and not s.laeuft:
        satz += f" Dazu {_frueher_t(s)} – darum schon um {s.uhr(s.beginn_m)}."
    schritte = _schritte(s, aussen_t, hk, m2, spaet_min)
    return {
        "tag": tag, "tag_t": tag_t, "tag_grund": tag_grund, "jetzt": s.uhr(s.jetzt_m), "laeuft": s.laeuft,
        "beginn": s.uhr(s.beginn_m), "warm": s.uhr(s.warm_m), "ziel": s.uhr(s.ziel_m), "arbeitsbeginn": s.uhr(s.a_m),
        "vor_min": s.vor_min, "soll": round(s.soll, 1), "innen_jetzt": round(s.innen_jetzt, 1),
        "innen_start": round(s.innen_start, 1), "tau_h": round(s.tau_h, 1), "tau_n": s.tau_n,
        "tau_geschaetzt": s.tau_geschaetzt,
        "aussen_von": None if s.aussen_von is None else round(s.aussen_von, 1),
        "aussen_bis": None if s.aussen_bis is None else round(s.aussen_bis, 1),
        "band": s.band, "rate": round(s.rate, 2), "rate_n": s.rate_n, "anzahl": s.anzahl,
        "rate_einer": None if s.rate_einer is None else round(s.rate_einer, 2), "rate_geschaetzt": s.rate_geschaetzt,
        "aufheiz_min": s.aufheiz_min, "grenze": s.uhr(s.grenze_m), "grenze_h": round(grenze_h, 2),
        "begrenzt": s.begrenzt, "beginn_ohne": None if s.beginn_ohne_m is None else s.uhr(s.beginn_ohne_m),
        "spaet": s.spaet, "geschaetzt": s.geschaetzt,
        "schaetz_grund": (f"aus der Größe ({zahl(groesse.flaeche(m2))} m²) und dem Wärmeverlust"
                          if s.geschaetzt else None),
        "satz": satz, "kurz": f"{s.uhr(s.beginn_m)} → {s.uhr(s.warm_m)}",
        "frueher_min": s.frueher_min, "auf_beginn": s.uhr(s.auf_beginn_m),
        "min": {"jetzt": s.jetzt_m, "beginn": s.beginn_m, "warm": s.warm_m, "ziel": s.ziel_m, "arbeitsbeginn": s.a_m,
                "grenze": s.grenze_m},
        "kurve": [list(p) for p in s.kurve], "aussen_vorhersage": [list(p) for p in s.aussen_kurve],
        # Beschriftung des Anfangs der Zeitachse (Ortszeit; die Minuten zählen echte Zeit, auch über die Zeitumstellung)
        "achse_ab": s.uhr(min([s.jetzt_m, s.beginn_m] + [p[0] for p in s.kurve] + [p[0] for p in s.aussen_kurve])),
        "schritte": schritte,
    }


def _grund_t(g: str) -> str:
    return FRUEHER_TEXT.get(g, g)


def _frueher_t(s: Start) -> str:
    """„20 min früher (Kleidung trocknen nach Regen 15 min, Noch früher 5 min)“."""
    teile = ", ".join(f"{_grund_t(g)} {m} min" for g, m in s.frueher)
    return f"{s.frueher_min} min früher ({teile})" if len(s.frueher) > 1 else f"{s.frueher_min} min früher ({_grund_t(s.frueher[0][0])})"


def _schritte(s: Start, aussen_t: str | None, hk: str, m2: float | None, spaet_min: int) -> list[dict[str, Any]]:
    """Kacheln „So rechnet der Start“: Kühlt ab · Ziel · Aufheizen · Grenze (nachts: Warm)."""
    tau_marke = ("geschaetzt", "τ noch geschätzt") if s.tau_geschaetzt else ("gelernt", f"τ gelernt aus {s.tau_n} Messungen")
    if s.laeuft:
        kuehl = {"k": "kuehl", "t": "Ausgekühlt bis zum Start", "wert": f"{zahl(s.innen_start)} °C um {s.uhr(s.beginn_m)}",
                 "rechnung": "gemessen" + (f" · Prognose war {zahl(s.prognose_start)} °C" if s.prognose_start is not None else ""),
                 "marke": "gemessen", "marke_t": "gemessen"}
    else:
        tau_t = (f"Auskühlzeit τ ≈ {zahl(s.tau_h, 0)} h" + (" aus Größe und Wärmeverlust" if s.tau_geschaetzt else ""))
        kuehl = {"k": "kuehl", "t": "Kühlt bis zum Start ab", "wert": f"≈ {zahl(s.innen_start)} °C um {s.uhr(s.beginn_m)}",
                 "rechnung": " · ".join(x for x in (tau_t, aussen_t or "ohne Außentemperatur – kein Auskühlen gerechnet",
                                                     "je Stunde (innen − außen) ÷ τ" if aussen_t else None) if x),
                 "marke": tau_marke[0], "marke_t": tau_marke[1]}
    ziel = {"k": "ziel", "t": "Ziel", "wert": f"warm um {s.uhr(s.ziel_m)}",
            "rechnung": (f"Arbeitsbeginn {s.uhr(s.a_m)} − {s.vor_min} min „Soll erreicht vorher“" if s.vor_min
                         else f"Arbeitsbeginn {s.uhr(s.a_m)}"),
            "marke": "einstellung", "marke_t": "Warm ab"}
    rate_marke = (("geschaetzt", f"noch geschätzt · {s.rate_n} von {lernen.AUF_N} gemessen") if s.rate_geschaetzt
                  else ("gelernt", f"gelernt aus {s.rate_n} Mal"))
    if s.rate_geschaetzt:
        wie = f"aus {zahl(groesse.flaeche(m2))} m²-Container"
    elif s.anzahl >= 2 and s.rate_einer is not None:
        wie = f"mit {s.anzahl} Heizkörpern · einer allein {zahl(s.rate_einer)} °C/h, zu langsam"
    elif s.anzahl >= 2:
        wie = f"mit {s.anzahl} Heizkörpern"
    else:
        wie = "1 Heizkörper" + (" reicht" if s.stufen and not s.zusatz else "")
    if s.laeuft and s.jetzt_m >= s.ziel_m:   # Ziel vorbei: was beim Start gerechnet war
        auf: dict[str, Any] = {"k": "auf", "t": "Aufheizen", "wert": f"≈ {dauer(max(0, s.warm_m - s.beginn_m))}",
               "rechnung": f"{zahl(s.innen_start)} → {zahl(s.soll)} °C mit {zahl(s.rate)} °C/h · {wie}",
               "marke": rate_marke[0], "marke_t": rate_marke[1]}
        warm: dict[str, Any] = {"k": "warm", "t": "Warm", "wert": f"≈ {s.uhr(s.warm_m)}", "rechnung": "gerechnet beim Start",
                "marke": None, "marke_t": None, "ton": "ergebnis"}
        return [kuehl, ziel, auf, warm] + _frueher_kachel(s)
    if s.laeuft:
        auf = {"k": "auf", "t": "Noch aufheizen", "wert": f"≈ {dauer(s.aufheiz_min)}",
               "rechnung": f"{zahl(s.innen_jetzt)} → {zahl(s.soll)} °C: {zahl(max(0.0, s.soll - s.innen_jetzt))} °C ÷ "
                           f"{zahl(s.rate)} °C/h · {wie}",
               "marke": rate_marke[0], "marke_t": rate_marke[1]}
        warm = {"k": "warm", "t": "Warm", "wert": f"≈ {s.uhr(s.warm_m)}",
                "rechnung": f"{s.uhr(s.jetzt_m)} + {dauer(s.aufheiz_min)} · "
                            + (f"rechtzeitig vor {s.uhr(s.ziel_m)}" if spaet_min <= 0 else f"{spaet_min} min nach dem Ziel {s.uhr(s.ziel_m)}"),
                "marke": None, "marke_t": None, "ton": "ergebnis"}
        return [kuehl, ziel, auf, warm] + _frueher_kachel(s)
    auf = {"k": "auf", "t": "Aufheizen", "wert": f"≈ {dauer(s.aufheiz_min)}",
           "rechnung": f"{zahl(max(0.0, s.soll - s.innen_start))} °C ÷ {zahl(s.rate)} °C/h · {wie}",
           "marke": rate_marke[0], "marke_t": rate_marke[1]}
    if s.begrenzt:
        gr_r = (f"{s.uhr(s.ziel_m)} − {dauer(s.max_min)} · erreicht: "
                + (f"bräuchte {s.uhr(s.beginn_ohne_m)}, " if s.beginn_ohne_m is not None else "")
                + f"warm erst ≈ {s.uhr(s.warm_m)} ({spaet_min} min nach dem Ziel, {'vor' if s.warm_m <= s.a_m else 'nach'} Arbeitsbeginn)")
    else:
        gr_r = f"{s.uhr(s.ziel_m)} − {dauer(s.max_min)} · nicht erreicht"
    grenze = {"k": "grenze", "t": "Grenze", "wert": f"frühestens {s.uhr(s.grenze_m)}", "rechnung": gr_r,
              "marke": "einstellung", "marke_t": "Frühestens", "ton": "amber" if s.begrenzt else ""}
    return [kuehl, ziel, auf, grenze] + _frueher_kachel(s)


def _frueher_kachel(s: Start) -> list[dict[str, Any]]:
    """Eigene Kachel, wenn der Plan früher beginnt („Kleidung trocknen nach Regen“, „Noch früher“)."""
    if not s.frueher:
        return []
    return [{"k": "frueher", "t": "Früher", "wert": f"+{s.frueher_min} min früher",
             "rechnung": " · ".join(f"{_grund_t(g)} +{m} min" for g, m in s.frueher)
                         + f" · gerechnet {s.uhr(s.auf_beginn_m)} → Start {s.uhr(s.beginn_m)}",
             "marke": "einstellung", "marke_t": " · ".join(_grund_t(g) for g, _ in s.frueher), "ton": ""}]
