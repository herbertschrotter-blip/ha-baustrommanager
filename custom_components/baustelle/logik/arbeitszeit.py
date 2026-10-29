"""Arbeitszeit und Heizplan eines Tages – reine Fachlogik ohne Home-Assistant-Code.

Zeiten sind Minuten seit Mitternacht (`int`), Tage `datetime.date`, Wochentag `0 = Montag`.
Vorbild ist das abgenommene Mockup (`mockups/quelle/glas-app.js`: `planTag`, `heizzeiten`, `statusText`,
`bedarfBlock`), Vorgabe der Bauplan 0.7 Abschnitt 2.1.

Ein Tagesplan besteht aus den Abschnitten (wie der Zeitstrahl im Mockup):
`[start, vor)` Frühstart · `[vor, a)` Vorheizen · `[a, b)` Arbeitszeit · `[b, nach)` Nachheizen · `[nach, ende)` Kleidung trocknen.

Entscheidungen, wo der Bauplan offen ist (im Sinne des Mockups):
- Die Arbeitszeit wird je Tag gewählt (`gueltige_arbeitszeit(liste, tag)`); das Mockup nimmt die heute gültige für die
  ganze Woche, was nur bei einem Wechsel innerhalb der Woche abweicht.
- Eine Ausnahme `arbeit`/`zeiten` geht vor `frei` (Feiertag/Urlaub): wer an einem Feiertag ausdrücklich eine Ausnahme
  einträgt, will arbeiten. Eine Ausnahme `frei` macht den Tag immer frei.
- Frühstart gilt nur mit `fruehstart=True` (Schalter „Kälte-Frühstart“ im Mockup); fehlende Wetterwerte ändern nichts.
- `start` wird bei 0, `ende` bei 1440 begrenzt (das Mockup rechnet ohne Grenze, zeigt aber nur 04:00–20:00); über
  Mitternacht wird nicht in den Nachbartag geheizt.
- Arbeitszeiten mit `bis <= von` (leer oder verdreht) gelten als frei; das Mockup lässt sie beim Speichern gar nicht zu.
- Haben mehrere Arbeitszeiten dasselbe `ab`, gilt wie im Mockup (`azListe` stabil sortiert, `.at(-1)`) die zuletzt
  eingetragene.
- Der Abschnitt vor dem Vorheizen heißt immer „fruehstart“, auch wenn er (teils) vom Regen am Vortag kommt – das Mockup
  zeichnet beides als einen Abschnitt „Frühstart“.
- Lernende Container mit gelernter Aufheizzeit (`WarmAb`, AN-0004): Vorheizen = „Soll erreicht vor Beginn“ + Aufheizzeit,
  die Aufheizzeit höchstens `max_min` (Grenze vom Ziel, FE-0031/FE-0032); kein Kälte-Frühstart; Nachheizen = „warm
  halten“. Früher nach Regen und Kleidung trocknen kommen wie bisher dazu (Herbert 01.10.2026).
"""

from __future__ import annotations

from collections.abc import Callable, Iterable
from dataclasses import dataclass, field
from datetime import date, datetime, timedelta
from enum import StrEnum
from typing import Any

from .regen import VORGABE_STUFEN, TrocknenStufe, stufe

TAG_MINUTEN = 24 * 60


class AusnahmeArt(StrEnum):
    """Art einer Einmal-Ausnahme von der Arbeitszeit (Texte wie Mockup `AUSNAHME`)."""

    ARBEIT = "arbeit"  # zusätzlich arbeiten
    ZEITEN = "zeiten"  # andere Zeiten
    FREI = "frei"  # frei


class PlanGrund(StrEnum):
    """Warum der Plan eines Tages von der Arbeitszeit abweicht."""

    AUSNAHME = "ausnahme"
    FRUEHSTART = "fruehstart"
    FRUEHER_NACH_REGEN = "frueher_nach_regen"
    TROCKNEN = "trocknen"
    GELERNT = "gelernt"   # AN-0004: Beginn aus der gelernten Aufheizzeit


class Abschnitt(StrEnum):
    """Abschnitt eines Tagesplans (Zeitstrahl im Mockup)."""

    FRUEHSTART = "fruehstart"
    VORHEIZEN = "vorheizen"
    ARBEITSZEIT = "arbeitszeit"
    NACHHEIZEN = "nachheizen"
    TROCKNEN = "trocknen"
    FENSTER = "fenster"   # FE-0012: eigenes Zeitfenster einer Ausnahme – heizt genau seine Zeit (Regelung: wie Arbeitszeit)


def minuten(uhrzeit: str) -> int:
    """„07:30“ → 450."""
    stunden, minute = uhrzeit.split(":")
    return int(stunden) * 60 + int(minute)


def uhrzeit(minute: int) -> str:
    """450 → „07:30“."""
    return f"{minute // 60:02d}:{minute % 60:02d}"


@dataclass(frozen=True)
class Arbeitszeit:
    """Arbeitszeiten je Wochentag, gültig ab `ab`; `None` = frei an diesem Wochentag."""

    ab: date
    name: str
    tage: dict[int, tuple[int, int] | None] = field(default_factory=dict)

    @classmethod
    def aus_store(cls, daten: dict[str, Any]) -> Arbeitszeit:
        """Aus dem Store (`{"ab": "2026-10-05", "name": …, "tage": {"0": ["07:00", "16:30"], …}}`)."""
        tage: dict[int, tuple[int, int] | None] = {}
        for schluessel, zeit in (daten.get("tage") or {}).items():
            tage[int(schluessel)] = (minuten(zeit[0]), minuten(zeit[1])) if zeit else None
        return cls(ab=date.fromisoformat(daten["ab"]), name=daten.get("name", ""), tage=tage)


@dataclass(frozen=True)
class Ausnahme:
    """Einmal-Ausnahme von der Arbeitszeit für genau ein Datum."""

    datum: date
    art: str  # AusnahmeArt
    von: int = 0
    bis: int = 0
    notiz: str = ""

    @classmethod
    def aus_store(cls, daten: dict[str, Any]) -> Ausnahme:
        """Aus dem Store (`{"datum": "2026-10-03", "art": "arbeit", "von": "07:00", "bis": "12:00", "notiz": ""}`)."""
        von, bis = daten.get("von"), daten.get("bis")
        return cls(
            datum=date.fromisoformat(daten["datum"]),
            art=AusnahmeArt(daten["art"]),
            von=minuten(von) if von else 0,
            bis=minuten(bis) if bis else 0,
            notiz=daten.get("notiz") or "",
        )


@dataclass(frozen=True)
class HeizRegeln:
    """Einstellungen für den Heizplan (Standardwerte wie im Mockup)."""

    vorheizen_min: int = 45
    nachheizen_min: int = 15
    fruehstart: bool = True
    fruehstart_unter: float = 0.0
    fruehstart_min: int = 30
    # AN-0021: Kleidung trocknen gestuft nach dem Regen in der Arbeitszeit (logik/regen)
    trocknen_stufen: tuple[TrocknenStufe, ...] = VORGABE_STUFEN


@dataclass(frozen=True)
class WarmAb:
    """„Warm ab“ eines lernenden Containers (AN-0004, Optimum Start).

    Soll erreicht `vor_min` vor Arbeitsbeginn, warm halten bis `nach_min` nach Arbeitsende, nie früher als `max_min`
    vor dem Ziel „warm um“ (Arbeitsbeginn − `vor_min`) beginnen – Herbert 29.10.2026 (FE-0031/FE-0032, Mockup start.html;
    bis 0.8.156 vor Arbeitsbeginn). `aufheiz_min`: Minuten vom Beginn bis zum Ziel (die Start-Logik `logik/start.py`
    liefert Ziel − Start); None = noch nicht gelernt – dann gelten Vorheizen, Kälte-Frühstart und Nachheizen wie bisher.
    """

    vor_min: int = 0
    nach_min: int = 0
    max_min: int = 120
    aufheiz_min: int | None = None

    def fruehestens(self, a: int) -> int:
        """Grenze „Frühestens“: `max_min` vor dem Ziel (Arbeitsbeginn `a` − `vor_min`) – die Regel steht nur hier."""
        return a - self.vor_min - self.max_min


@dataclass(frozen=True)
class WetterTag:
    """Wetter eines Tages für den Plan; fehlende Werte sind None."""

    frueh_min_temp: float | None = None
    regen_vortag_mm: float | None = None
    regen_heute_mm: float | None = None
    # AN-0021: Regen in der Arbeitszeit (logik/regen.regen_arbeitszeit) – nur er zählt für „Kleidung trocknen“
    regen_az_vortag_mm: float | None = None
    regen_az_heute_mm: float | None = None


@dataclass(frozen=True)
class Plan:
    """Heizplan eines Tages: `start ≤ vor ≤ a < b ≤ nach ≤ ende` (Minuten)."""

    start: int
    vor: int
    a: int
    b: int
    nach: int
    ende: int
    gruende: tuple[str, ...] = ()
    ausnahme: Ausnahme | None = None
    # FE-0012: weitere Zeitfenster des Tages, die nicht an die Arbeitszeit grenzen – heizen genau `(von, bis)`
    eigene: tuple[tuple[int, int], ...] = ()
    ausnahmen: tuple[Ausnahme, ...] = ()
    # FE-0031/32: warum `start` vor `vor` liegt – (Grund, Minuten): „fruehstart“, „frueher_nach_regen“, „noch_frueher“
    frueher: tuple[tuple[str, int], ...] = ()

    def abschnitte(self) -> list[tuple[int, int, Abschnitt]]:
        """Nicht leere Abschnitte `(von, bis, art)` in zeitlicher Folge (Mockup `heizzeiten`)."""
        teile = [
            (self.start, self.vor, Abschnitt.FRUEHSTART),
            (self.vor, self.a, Abschnitt.VORHEIZEN),
            (self.a, self.b, Abschnitt.ARBEITSZEIT),
            (self.b, self.nach, Abschnitt.NACHHEIZEN),
            (self.nach, self.ende, Abschnitt.TROCKNEN),
        ]
        eigene = [(von, bis, Abschnitt.FENSTER) for von, bis in self.eigene]
        return sorted([t for t in teile if t[1] > t[0]] + [t for t in eigene if t[1] > t[0]], key=lambda t: t[0])

    def abschnitt(self, minute: int) -> Abschnitt | None:
        """Abschnitt zur Minute (für die Regelung: ein eigenes Fenster zählt wie Arbeitszeit); None, wenn nicht geheizt."""
        for von, bis, art in self.abschnitte():
            if von <= minute < bis:
                return Abschnitt.ARBEITSZEIT if art == Abschnitt.FENSTER else art
        return None

    def heizt(self, minute: int) -> bool:
        return self.abschnitt(minute) is not None

    def heiz_ende(self, minute: int) -> int:
        """Ende des zusammenhängenden Heizens ab `minute` (Arbeitszeit-Block bzw. eigenes Fenster)."""
        ende = minute
        for von, bis, _ in self.abschnitte():
            if von <= ende < bis or von == ende:
                ende = max(ende, bis)
        return ende

    def naechster_start(self, minute: int) -> int | None:
        """Nächster Beginn des Heizens nach `minute` an diesem Tag."""
        starts = [von for von, bis, _ in self.abschnitte() if von > minute]
        return min(starts) if starts else None


# Arbeitszeit einer neuen Baustelle (Mockup „Herbst 2026“): Mo–Do 07:00–16:30, Fr 07:00–12:30 – Store-Form je Wochentag
STANDARD_TAGE: dict[str, list[str] | None] = {
    "0": ["07:00", "16:30"], "1": ["07:00", "16:30"], "2": ["07:00", "16:30"], "3": ["07:00", "16:30"],
    "4": ["07:00", "12:30"], "5": None, "6": None,
}
STANDARD_NAME = "Arbeitszeit"


def erste_arbeitszeit(heute: date) -> dict[str, Any]:
    """Automatisch angelegte Arbeitszeit einer neuen Baustelle; die erste eigene ersetzt sie (FE-0002)."""
    return {"ab": heute.isoformat(), "name": STANDARD_NAME, "auto": True,
            "tage": {k: (list(v) if v else None) for k, v in STANDARD_TAGE.items()}}


def ist_automatisch(eintrag: dict[str, Any]) -> bool:
    """Automatisch angelegt? Vor 0.7.28 ohne Kennzeichen gespeichert: dann am Namen und den Standardzeiten erkannt."""
    if "auto" in eintrag:
        return bool(eintrag["auto"])
    tage = {str(k): (list(v) if v else None) for k, v in (eintrag.get("tage") or {}).items()}
    return eintrag.get("name") == STANDARD_NAME and tage == STANDARD_TAGE


def arbeitszeiten_bereinigen(liste: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Beim Laden: automatische kennzeichnen (vor 0.7.28 ohne Kennzeichen) und wegnehmen, sobald es eine eigene gibt –
    dieselbe Regel wie beim Speichern, damit schon gespeicherte eigene Arbeitszeiten sofort gelten (FE-0002)."""
    markiert = [{**a, "auto": ist_automatisch(a)} for a in liste]
    eigene = [a for a in markiert if not a["auto"]]
    return eigene or markiert


def arbeitszeiten_speichern(liste: list[dict[str, Any]], neu: dict[str, Any], alt_ab: str | None = None) -> list[dict[str, Any]]:
    """Arbeitszeit anlegen oder ändern (`alt_ab` = bisheriges `ab` beim Ändern), nach `ab` sortiert.

    Eine eigene Arbeitszeit ersetzt die automatisch angelegte (FE-0002: sonst gewann die automatische ab dem Tag der
    Anlage gegen eine eigene mit früherem Datum). Doppeltes `ab` → `ValueError`.
    """
    andere = [a for a in liste if a["ab"] != alt_ab and not ist_automatisch(a)]
    if any(a["ab"] == neu["ab"] for a in andere):
        raise ValueError(neu["ab"])
    return sorted([*andere, {k: v for k, v in neu.items() if k != "auto"}], key=lambda a: a["ab"])


def arbeitszeit_loeschen(liste: list[dict[str, Any]], ab: str) -> list[dict[str, Any]]:
    """Arbeitszeit löschen; unbekannt → `KeyError`, die letzte bleibt (ohne Arbeitszeit liefe nur der Frostschutz) → `ValueError`."""
    rest = [a for a in liste if a["ab"] != ab]
    if len(rest) == len(liste):
        raise KeyError(ab)
    if not rest:
        raise ValueError("letzte")
    return rest


def gueltige_arbeitszeit(liste: Iterable[Arbeitszeit], tag: date) -> Arbeitszeit | None:
    """Die jüngste Arbeitszeit, die am `tag` schon begonnen hat; alte bleiben gespeichert, künftige gelten erst ab `ab`."""
    gueltig: Arbeitszeit | None = None
    for arbeitszeit in liste:
        # bei gleichem `ab` gewinnt die spätere in der Liste (Mockup: stabil sortiert, `.at(-1)`)
        if arbeitszeit.ab <= tag and (gueltig is None or arbeitszeit.ab >= gueltig.ab):
            gueltig = arbeitszeit
    return gueltig


def ausnahmen_am(ausnahmen: Iterable[Ausnahme], tag: date) -> list[Ausnahme]:
    """Alle Ausnahmen eines Tages (FE-0012: mehrere Zeitfenster je Tag), nach Beginn."""
    return sorted((x for x in ausnahmen if x.datum == tag), key=lambda x: (x.von, x.bis))


def ausnahme_am(ausnahmen: Iterable[Ausnahme], tag: date) -> Ausnahme | None:
    """Die maßgebliche Ausnahme eines Tages: „frei“, wenn eingetragen (hebt alle auf), sonst die erste."""
    am = ausnahmen_am(ausnahmen, tag)
    return next((x for x in am if x.art == AusnahmeArt.FREI), am[0] if am else None)


def fenster_am(
    liste: Iterable[Arbeitszeit], ausnahmen: Iterable[Ausnahme], tag: date, frei: bool = False
) -> tuple[tuple[int, int] | None, list[tuple[int, int]]]:
    """Arbeitszeit-Block und eigene Zeitfenster eines Tages (FE-0012, Herbert 02.10.2026).

    „frei“ hebt alles auf. „andere Zeiten“ ersetzt die Arbeitszeit, „zusätzlich arbeiten“ kommt dazu. Der Block ist die
    Arbeitszeit, sonst das längste „andere Zeiten“, sonst das längste Fenster überhaupt. Ein Fenster, das an den Block
    grenzt oder ihn überschneidet, verlängert ihn (Vor-/Nachheizen gelten für den ganzen Block); die übrigen stehen für
    sich und heizen genau ihre Zeit. `frei` (Feiertag, Urlaub): die Arbeitszeit gilt nicht, nur die Ausnahmen. Nur
    ungültige „andere Zeiten“ (bis nicht nach von) machen den Tag frei.
    """
    am = ausnahmen_am(ausnahmen, tag)
    if any(x.art == AusnahmeArt.FREI for x in am):
        return None, []
    zeiten_alle = [x for x in am if x.art == AusnahmeArt.ZEITEN]
    zeiten = [(x.von, x.bis) for x in zeiten_alle if x.bis > x.von]
    if zeiten_alle and not zeiten:
        return None, []
    extra = [(x.von, x.bis) for x in am if x.art == AusnahmeArt.ARBEIT and x.bis > x.von]
    regel = None
    if not zeiten and not frei and (az := gueltige_arbeitszeit(liste, tag)) is not None:
        r = az.tage.get(tag.weekday())
        regel = r if r is not None and r[1] > r[0] else None
    rest = sorted(zeiten + extra)
    laenge = lambda f: (f[1] - f[0], -f[0])  # noqa: E731 – längstes, bei Gleichstand das frühere
    if regel is not None:
        block = regel
    elif zeiten or extra:
        block = max(zeiten or extra, key=laenge)
        rest.remove(block)
    else:
        return None, []
    weiter = True
    while weiter:
        weiter = False
        for f in list(rest):
            if f[0] <= block[1] and f[1] >= block[0]:
                block = (min(f[0], block[0]), max(f[1], block[1]))
                rest.remove(f)
                weiter = True
    return block, rest


def frei_gilt(frei: bool, ausnahme: Ausnahme | None) -> bool:
    """Ist der Tag frei? Urlaub und freier Feiertag (`frei`), außer eine Ausnahme `arbeit`/`zeiten` geht vor – wer an
    einem Feiertag ausdrücklich eine Ausnahme einträgt, will arbeiten. Eine Ausnahme `frei` macht den Tag immer frei
    (dann gilt auch der Modus für freie Tage, Szenarien). Gilt für Plan, Regelung und Status."""
    if ausnahme is not None:
        return ausnahme.art == AusnahmeArt.FREI
    return frei


def arbeit_am(liste: Iterable[Arbeitszeit], ausnahmen: Iterable[Ausnahme], tag: date) -> tuple[int, int] | None:
    """Arbeitszeit-Block `(a, b)` eines Tages (mit Ausnahmen, `fenster_am`); `frei` → None."""
    return fenster_am(liste, ausnahmen, tag)[0]


def tagesplan(
    tag: date,
    liste: Iterable[Arbeitszeit],
    ausnahmen: Iterable[Ausnahme],
    regeln: HeizRegeln,
    wetter: WetterTag,
    trocknen: bool,
    frei: bool = False,
    warm: WarmAb | None = None,
) -> Plan | None:
    """Heizplan eines Containers an einem Tag (Mockup `planTag`); None, wenn frei.

    `frei` ist Feiertag oder Urlaub (der Aufrufer prüft `feiertag_frei`). Eine Ausnahme `arbeit`/`zeiten` geht vor.
    `trocknen` ist der Schalter „Kleidung trocknen“ des Containers. `warm`: lernender Container (AN-0004).
    """
    ausnahmen = list(ausnahmen)
    ausnahme = ausnahme_am(ausnahmen, tag)
    if frei_gilt(frei, ausnahme):
        return None
    zeit, eigene = fenster_am(liste, ausnahmen, tag, frei)
    if zeit is None:
        return None
    a, b = zeit
    if b <= a:
        return None
    alle = tuple(ausnahmen_am(ausnahmen, tag))
    gruende: list[str] = [PlanGrund.AUSNAHME] if ausnahme is not None else []
    aufheiz = warm.aufheiz_min if warm is not None else None
    gelernt = aufheiz is not None
    if warm is not None and aufheiz is not None:
        vor = max(a - warm.vor_min - aufheiz, warm.fruehestens(a))
        gruende.append(PlanGrund.GELERNT)
    else:
        vor = a - regeln.vorheizen_min
    frueher: list[tuple[str, int]] = []
    if not gelernt and regeln.fruehstart and wetter.frueh_min_temp is not None and wetter.frueh_min_temp < regeln.fruehstart_unter:
        frueher.append((PlanGrund.FRUEHSTART.value, regeln.fruehstart_min))
        gruende.append(PlanGrund.FRUEHSTART)
    # AN-0021: früher nach dem Regen in der Arbeitszeit gestern, länger nach dem von heute – gestuft
    if trocknen and (st_v := stufe(wetter.regen_az_vortag_mm, regeln.trocknen_stufen)) is not None:
        frueher.append((PlanGrund.FRUEHER_NACH_REGEN.value, st_v.frueher_min))
        gruende.append(PlanGrund.FRUEHER_NACH_REGEN)
    extra = sum(m for _, m in frueher)
    laenger = 0
    if trocknen and (st_h := stufe(wetter.regen_az_heute_mm, regeln.trocknen_stufen)) is not None:
        laenger = st_h.laenger_min
        gruende.append(PlanGrund.TROCKNEN)
    nach = b + (warm.nach_min if warm is not None and gelernt else regeln.nachheizen_min)
    return Plan(
        start=max(0, vor - extra),
        vor=max(0, vor),
        a=a,
        b=b,
        nach=min(TAG_MINUTEN, nach),
        ende=min(TAG_MINUTEN, nach + laenger),
        gruende=tuple(gruende),
        ausnahme=ausnahme,
        eigene=tuple(eigene),
        ausnahmen=alle,
        frueher=tuple(frueher),
    )


def bedarf_fenster(termine: Iterable[tuple[datetime, datetime]], vorheizen_min: int) -> list[tuple[datetime, datetime]]:
    """Heizfenster eines Bedarfs-Containers: jeder Termin ab `von − vorheizen` bis `bis`, nach Beginn sortiert.

    Wie Mockup `heizzeiten` für Bedarfs-Container („heizt ab 08:15“ bei Termin 09:00 und 45 min Vorheizen).
    Serien löst der Kalender auf (RRULE), hier kommen nur einzelne Termine an.
    """
    vorlauf = timedelta(minutes=vorheizen_min)
    return sorted(((von - vorlauf, bis) for von, bis in termine if bis > von), key=lambda f: f[0])


def im_fenster(fenster: Iterable[tuple[datetime, datetime]], jetzt: datetime) -> bool:
    """Liegt `jetzt` in einem der Fenster `[von, bis)`?"""
    return any(von <= jetzt < bis for von, bis in fenster)


class StatusArt(StrEnum):
    """Kurzstatus der Baustelle (Mockup `statusText`)."""

    HEIZT = "heizt"  # „♨ heizt bis {minute}“
    START = "start"  # „Start um {minute}“ (heute)
    AUS = "aus"  # „aus · morgen ab {minute}“ bzw. „aus · Mi ab …“; ohne Tag: „aus“


@dataclass(frozen=True)
class Status:
    """Kurzstatus: Art, Tag und Minute des nächsten Schaltpunkts (Ende bzw. Start)."""

    art: StatusArt
    tag: date | None = None
    minute: int | None = None


def status(heute: date, minute: int, plan_am: Callable[[date], Plan | None]) -> Status:
    """Kurzstatus wie Mockup `statusText`: heizt bis Ende, Start heute oder nächster Start in den kommenden 7 Tagen."""
    plan = plan_am(heute)
    if plan is not None and plan.heizt(minute):
        return Status(StatusArt.HEIZT, heute, plan.heiz_ende(minute))
    if plan is not None and (start := plan.naechster_start(minute)) is not None:
        return Status(StatusArt.START, heute, start)
    for k in range(1, 8):
        tag = heute + timedelta(days=k)
        naechster = plan_am(tag)
        if naechster is not None:
            return Status(StatusArt.AUS, tag, naechster.naechster_start(-1) if naechster.naechster_start(-1) is not None else naechster.start)
    return Status(StatusArt.AUS)


def _spannen(p: Plan | None) -> list[tuple[int, int]]:
    """Geheizte Zeit eines Plans als sortierte, zusammengelegte Spannen (Minuten)."""
    if p is None:
        return []
    roh = sorted([(p.start, p.ende), *p.eigene])
    aus: list[tuple[int, int]] = []
    for a, b in roh:
        if b <= a:
            continue
        if aus and a <= aus[-1][1]:
            aus[-1] = (aus[-1][0], max(aus[-1][1], b))
        else:
            aus.append((a, b))
    return aus


def _ohne(x: list[tuple[int, int]], y: list[tuple[int, int]]) -> list[tuple[int, int]]:
    """Spannen aus `x`, die nicht in `y` liegen."""
    aus = []
    for a, b in x:
        teile = [(a, b)]
        for c, d in y:
            teile = [t for s, e in teile for t in ((s, min(e, c)), (max(s, d), e)) if t[1] > t[0]]
        aus.extend(teile)
    return aus


def abweichung(mit: Plan | None, ohne: Plan | None) -> dict[str, Any]:
    """FE-0034 (Mockup heizung-neu.html, Variante A): wo der Plan eines Tages mit Ausnahme vom Normalplan ohne Ausnahme
    abweicht – `normal` {start, ende} (None = normal frei), `teile` [[von, bis, „mehr“ | „weniger“]] (mehr = zusätzlich
    geheizt, weniger = entfällt) und `diff_min` (mehr − weniger). Die Seite legt die Teile nur über die Spur."""
    m, o = _spannen(mit), _spannen(ohne)
    teile = [[a, b, "mehr"] for a, b in _ohne(m, o)] + [[a, b, "weniger"] for a, b in _ohne(o, m)]
    teile.sort(key=lambda t: t[0])
    return {"normal": {"start": ohne.start, "ende": ohne.ende} if ohne is not None else None, "teile": teile,
            "diff_min": sum((t[1] - t[0]) * (1 if t[2] == "mehr" else -1) for t in teile)}
