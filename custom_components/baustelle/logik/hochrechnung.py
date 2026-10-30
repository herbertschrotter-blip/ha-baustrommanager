"""Hochrechnung der Heizperiode mit Energiesignatur und Heizgradtagen (BSM-033.02, Bauplan Hochrechnung §4) – ohne HA-Code.

Je Container:
- **Welche Tage zählen** (`tag_zaehlt`): ganze Tage vor heute, mit Verbrauch und Außentemperatur (Tagesmittel über 24 h),
  zu mindestens `VOLL_ANTEIL` mitgeschrieben (HA oder übernommen) – Tage mit Ausfall oder Notbetrieb fallen weg (Herbert 10.10.2026).
- **Rest der Heizperiode** (morgen bis zum Ende): je Tag der erwartete Verbrauch aus der Signatur (`logik/signatur`)
  bei der Außentemperatur des Tages – aus der Vorhersage, sonst aus den Klimamitteln (Monatsmittel, zwischen den
  Monatsmitten linear). **Heute** (`rest_heute`, Anteil des Tages, der noch kommt): der gemessene Verbrauch bis jetzt
  zählt zu „bisher“, der Rest des Tages anteilig bei der Außentemperatur von heute (Vorhersage, sonst gemessen bis jetzt,
  sonst Klimamittel) – sonst läge die Hochrechnung tagsüber um den Rest des Tages zu niedrig.
- **Nur Heiztage** (`heiztage`, FE-0030, Herbert 28.10.2026): Tage ohne Heizplan (Wochenende, Feiertag, Urlaub, Ausnahme
  frei, Container aus) gehören nicht in die Signatur und bekommen im Rest 0 kWh; `heiztage_container` sagt je Container,
  welche Tage das sind (None = jeder Tag, wenn kein Plan das Heizen bestimmt).
- **Solange die Signatur lernt oder unsicher ist** (FE-0030): Gradtagverfahren – kWh je Heizgradtag der bisherigen
  Heiztage (Summe kWh ÷ Summe HGT 20/12) × Heizgradtage jedes künftigen Heiztags (Vorhersage, sonst Klimamittel), also
  kältere Monate mehr (`methode` „heizgradtage“). Hatten die bisherigen Heiztage keine Heizgradtage (alle ab 12 °C):
  Tagesschnitt der Heiztage × Resttage mit Heizplan („tagesschnitt“). Beides ohne Spanne.
- **Spanne**: wärmerer bzw. kälterer Winter (alle Tage ohne Vorhersage um `WINTER_K` wärmer/kälter) und die Streuung der
  Signatur (1,645 · rmse · √Tage, rund 90 %).

Für die Baustelle: bisher + Summe der Reste; Spanne nur, wenn jeder Container eine Signatur hat. **Tagesreihe** (`reihe`,
BSM-033.03): je Tag der Heizperiode aufsummiert tatsächlich (bis heute), Prognose mit Automatik (mit Spanne) und ohne
Automatik (bis zur gemessenen Baseline die bisherige Schätzung 24/7 – gleichmäßig über die Tage, wie sie gerechnet ist);
heute: „mit“ = gemessen + Rest von heute; der letzte Tag ist die Hochrechnung. Bisher = Summe der Tage der Heizperiode bis heute (heute mit, soweit gerechnet).
**Heizgradtage** nach ÖNORM B 8135 (HGT 20/12): je Tag 20 − außen, wenn außen unter 12 °C. **Witterungsbereinigt**
(Normjahr): die ganze Heizperiode bei Klimamitteln – damit lassen sich Baustellen und Jahre vergleichen.
**Tag/Woche/Monat** (`tageswerte`, `perioden`, BSM-033.04): dieselben Zahlen je Tag (nicht aufsummiert) und je Zeitraum.
"""

from __future__ import annotations

from collections.abc import Callable, Collection, Iterable, Mapping, Sequence
from dataclasses import dataclass
from datetime import date, timedelta
from math import sqrt

from .signatur import Signatur, Tag, berechnen, erwartet

VOLL_ANTEIL = 0.95          # so viel des Tages muss HA mitgeschrieben haben
WINTER_K = 1.5              # wärmerer/kälterer Winter für die Spanne (Streuung der Monatsmittel im Winter)
Z90 = 1.645                 # rund 90 % bei Normalverteilung
HGT_INNEN, HGT_GRENZE = 20.0, 12.0

# Klimamittel je Monat (°C), Näherung für Graz 1991–2020 (GeoSphere Austria) – je Baustelle als Einstellung
# `klimamittel` (12 Werte, Jänner zuerst) zu ersetzen, bis dahin Vorgabe.
KLIMA_GRAZ: tuple[float, ...] = (0.3, 2.0, 6.3, 11.1, 15.6, 19.4, 21.1, 20.6, 15.8, 10.6, 5.4, 1.0)


@dataclass(frozen=True)
class TagRoh:
    datum: date
    kwh: float | None
    aussen: float | None
    erfasst_s: float              # mitgeschriebene Sekunden des Tages (ohne Stunden aus dem Notprogramm)
    dauer_s: float = 86400.0      # Länge des Tages (Sommerzeit: 23 h / 25 h)


@dataclass(frozen=True)
class ContainerRest:
    rest_kwh: float
    unten_kwh: float | None
    oben_kwh: float | None
    methode: str                  # "signatur" | "heizgradtage" | "tagesschnitt" | "keine"
    signatur: Signatur
    normjahr_kwh: float | None    # ganze Heizperiode bei Klimamitteln (nur mit Signatur)
    je_tag: tuple[float, ...] = ()            # erwarteter Verbrauch je Resttag (Mitte)
    je_tag_warm: tuple[float, ...] = ()       # … im wärmeren Winter (nur mit Signatur)
    je_tag_kalt: tuple[float, ...] = ()       # … im kälteren Winter
    rmse: float = 0.0
    heute_kwh: float = 0.0                    # Rest von heute (in rest_kwh, unten_kwh und oben_kwh enthalten)


def klimamittel(werte: Sequence[float] | None) -> tuple[float, ...]:
    """Gültige 12 Monatsmittel aus der Einstellung, sonst die Vorgabe."""
    if werte is not None and len(werte) == 12 and all(isinstance(v, (int, float)) for v in werte):
        return tuple(float(v) for v in werte)
    return KLIMA_GRAZ


def klimamittel_pruefen(werte: object) -> list[float] | None:
    """Einstellung `heizung.klimamittel`: None (Vorgabe) oder genau 12 Zahlen von −30 bis 35 °C; sonst ValueError."""
    if werte is None:
        return None
    if not isinstance(werte, (list, tuple)) or len(werte) != 12:
        raise ValueError("Klimamittel: genau 12 Monatswerte")
    aus = []
    for v in werte:
        if isinstance(v, bool) or not isinstance(v, (int, float)) or not -30 <= v <= 35:
            raise ValueError("Klimamittel: Zahlen von −30 bis 35 °C")
        aus.append(round(float(v), 1))
    return aus


def klima_tag(tag: date, klima: Sequence[float]) -> float:
    """Klimamittel eines Tages: zwischen den Monatsmitten (15.) linear."""
    m = tag.month - 1
    mitte = date(tag.year, tag.month, 15)
    if tag >= mitte:
        nach = date(tag.year + (tag.month == 12), tag.month % 12 + 1, 15)
        a, b, t0, t1 = klima[m], klima[(m + 1) % 12], mitte, nach
    else:
        vor = date(tag.year - (tag.month == 1), (tag.month - 2) % 12 + 1, 15)
        a, b, t0, t1 = klima[(m - 1) % 12], klima[m], vor, mitte
    return a + (b - a) * (tag - t0).days / (t1 - t0).days


def hgt(aussen: float) -> float:
    """Heizgradtag 20/12 (ÖNORM B 8135)."""
    return HGT_INNEN - aussen if aussen < HGT_GRENZE else 0.0


def tag_zaehlt(t: TagRoh, heute: date) -> bool:
    return t.datum < heute and t.kwh is not None and t.aussen is not None and t.erfasst_s >= VOLL_ANTEIL * t.dauer_s


def tage(von: date, bis: date) -> list[date]:
    """Tage von … bis (einschließlich); leer, wenn bis vor von."""
    return [von + timedelta(days=i) for i in range((bis - von).days + 1)]


def temperaturen(rest: Iterable[date], vorhersage: Mapping[date, float], klima: Sequence[float]) -> list[tuple[float, bool]]:
    """Je Tag (außen °C, aus der Vorhersage?)."""
    return [(vorhersage[d], True) if d in vorhersage else (klima_tag(d, klima), False) for d in rest]


def heiztage_container(
    tage_: Iterable[date], geplant: Callable[[date], bool], modus: str, automatik: bool,
) -> frozenset[date] | None:
    """Heiztage eines Containers (FE-0030): die Tage mit Heizplan (`geplant`: Arbeitszeit, Ausnahmen, Feiertag/Urlaub –
    `logik/arbeitszeit.tagesplan`); Modus „aus“: keiner. None = jeder Tag zählt, weil kein Heizplan das Heizen bestimmt:
    Automatik aus, Modus „hand“ und „bedarf“ (Termine sind nur für die nächsten Tage bekannt)."""
    if not automatik or modus in ("hand", "bedarf"):
        return None
    if modus == "aus":
        return frozenset()
    return frozenset(d for d in tage_ if geplant(d))


def heiztag(d: date, heiztage: Collection[date] | None) -> bool:
    """Zählt der Tag als Heiztag? Ohne Angabe (None) jeder."""
    return heiztage is None or d in heiztage


def kwh_je_hgt(gezaehlt: Iterable[TagRoh]) -> float | None:
    """Gradtagverfahren (FE-0030): Verbrauch ÷ Heizgradtage 20/12 derselben Tage; None ohne Heizgradtage."""
    liste = [t for t in gezaehlt if t.aussen is not None]
    summe = sum((hgt(t.aussen) for t in liste), 0.0)   # type: ignore[arg-type]  # oben auf None geprüft
    return sum(t.kwh or 0.0 for t in liste) / summe if summe > 0 else None


def container_rest(
    roh: Sequence[TagRoh], heute: date, ende: date, vorhersage: Mapping[date, float], klima: Sequence[float],
    beginn: date, ohne_tage: Collection[date] = (), *, rest_heute: float = 0.0, aussen_heute: float | None = None,
    heiztage: Collection[date] | None = None,
) -> ContainerRest:
    """Rest der Heizperiode eines Containers (Rest von heute, morgen bis `ende`); `beginn` = erster Tag der Heizperiode
    (Normjahr). Tage eines Baseline-Laufs (`ohne_tage`, BSM-033.04) zählen nicht für die Signatur mit Automatik.
    `rest_heute`: Anteil des heutigen Tages, der noch kommt (0–1); `aussen_heute`: Außentemperatur dafür.
    `heiztage` (FE-0030): nur diese Tage gehen in die Signatur und in den Rest (andere 0 kWh); None = jeder Tag."""
    gezaehlt = [t for t in roh if tag_zaehlt(t, heute) and t.datum not in ohne_tage and heiztag(t.datum, heiztage)]
    sig = berechnen(Tag(t.aussen, t.kwh) for t in gezaehlt)    # type: ignore[arg-type]  # tag_zaehlt prüft None
    rest_tage = tage(max(heute + timedelta(days=1), beginn), ende)
    temps = temperaturen(rest_tage, vorhersage, klima)
    plan = [heiztag(d, heiztage) for d in rest_tage]
    anteil = min(1.0, max(0.0, rest_heute)) if beginn <= heute <= ende and heiztag(heute, heiztage) else 0.0
    t_heute = aussen_heute if aussen_heute is not None else klima_tag(heute, klima)
    if erwartet(sig, 0.0) is None:
        if not gezaehlt:
            return ContainerRest(0.0, None, None, "keine", sig, None, (0.0,) * len(rest_tage))
        k = kwh_je_hgt(gezaehlt)
        if k is not None:
            je = tuple(k * hgt(t) if p else 0.0 for (t, _), p in zip(temps, plan))
            heute_kwh = anteil * k * hgt(t_heute)
            return ContainerRest(heute_kwh + sum(je), None, None, "heizgradtage", sig, None, je, heute_kwh=heute_kwh)
        schnitt = sum(t.kwh or 0.0 for t in gezaehlt) / len(gezaehlt)
        return ContainerRest(schnitt * (sum(plan) + anteil), None, None, "tagesschnitt", sig, None,
                             tuple(schnitt if p else 0.0 for p in plan), heute_kwh=schnitt * anteil)

    def je_tag(verschiebung: float) -> tuple[float, ...]:
        return tuple((erwartet(sig, t + (0.0 if fest else verschiebung)) or 0.0) if p else 0.0
                     for (t, fest), p in zip(temps, plan))

    mitte, warm, kalt = je_tag(0.0), je_tag(WINTER_K), je_tag(-WINTER_K)
    heute_kwh = anteil * (erwartet(sig, t_heute) or 0.0)
    streuung = Z90 * (sig.rmse or 0.0) * sqrt(sum(plan) + anteil)
    norm = sum(erwartet(sig, klima_tag(d, klima)) or 0.0 for d in tage(beginn, ende) if heiztag(d, heiztage))
    return ContainerRest(heute_kwh + sum(mitte), heute_kwh + max(0.0, sum(warm) - streuung), heute_kwh + sum(kalt) + streuung,
                         "signatur", sig, norm, mitte, warm, kalt, sig.rmse or 0.0, heute_kwh)


def baustelle(bisher_kwh: float | None, reste: Mapping[str, ContainerRest]) -> dict[str, float | str | None]:
    """Hochrechnung der Baustelle: bisher + Reste; Spanne nur, wenn alle Container eine Signatur haben. Methode: die
    „signatur“, wenn jeder Container eine hat; sonst „heizgradtage“, wenn kein Container mit dem Tagesschnitt rechnet;
    sonst „tagesschnitt“ (wie bisher); ohne gezählte Tage „keine“."""
    if bisher_kwh is None:
        return {"mit_kwh": None, "unten_kwh": None, "oben_kwh": None, "methode": "keine", "normjahr_kwh": None}
    werte = list(reste.values())
    alle = bool(werte) and all(r.methode == "signatur" for r in werte)
    methoden = {r.methode for r in werte}
    methode = ("signatur" if alle else "heizgradtage" if "heizgradtage" in methoden and "tagesschnitt" not in methoden
               else "tagesschnitt" if methoden - {"keine"} else "keine")
    return {
        "mit_kwh": bisher_kwh + sum(r.rest_kwh for r in werte) if methode != "keine" else None,
        "unten_kwh": bisher_kwh + sum(r.unten_kwh or 0.0 for r in werte) if alle else None,
        "oben_kwh": bisher_kwh + sum(r.oben_kwh or 0.0 for r in werte) if alle else None,
        "methode": methode,
        "normjahr_kwh": sum(r.normjahr_kwh or 0.0 for r in werte) if alle else None,
    }


def hgt_summe(temps: Iterable[float]) -> float:
    return sum(hgt(t) for t in temps)


def bisher(roh: Mapping[str, Sequence[TagRoh]], heute: date, beginn: date) -> float:
    """Verbrauch der Heizperiode bis heute (alle Container, heute so weit gerechnet)."""
    return sum(t.kwh or 0.0 for liste in roh.values() for t in liste if beginn <= t.datum <= heute)


def reihe(
    roh: Mapping[str, Sequence[TagRoh]], reste: Mapping[str, ContainerRest], heute: date, beginn: date, ende: date,
    ohne_kwh: float | None, *, ohne_wie_mit: bool = False,
) -> list[tuple[str, float | None, float, float | None, float | None, float | None]]:
    """Je Tag der Heizperiode (Tag, tatsächlich, mit, unten, oben, ohne), aufsummiert in kWh (siehe Modul-Docstring).
    `ohne_wie_mit`: „ohne“ aus der Baseline (BSM-033.04) verläuft wie „mit“ (wetterabhängig), nicht gleichmäßig."""
    alle_tage = tage(beginn, ende)
    je_tag: dict[date, float] = {}
    for liste in roh.values():
        for t in liste:
            if beginn <= t.datum <= heute:
                je_tag[t.datum] = je_tag.get(t.datum, 0.0) + (t.kwh or 0.0)
    werte = list(reste.values())
    spanne = bool(werte) and all(r.methode == "signatur" for r in werte)
    aus: list[tuple[str, float | None, float, float | None, float | None, float | None]] = []
    ist = mit = warm = kalt = 0.0
    k = 0
    for i, d in enumerate(alle_tage):
        ohne = round(ohne_kwh * (i + 1) / len(alle_tage), 3) if ohne_kwh is not None else None
        if d <= heute:
            ist += je_tag.get(d, 0.0)
            mit = warm = kalt = ist + (sum(r.heute_kwh for r in werte) if d == heute else 0.0)
            aus.append((d.isoformat(), round(ist, 3), round(mit, 3), round(mit, 3) if spanne else None,
                        round(mit, 3) if spanne else None, ohne))
            continue
        mit += sum(r.je_tag[k] for r in werte if k < len(r.je_tag))
        if spanne:
            warm += sum(r.je_tag_warm[k] for r in werte)
            kalt += sum(r.je_tag_kalt[k] for r in werte)
        k += 1
        streu = sum(Z90 * r.rmse * sqrt(k) for r in werte) if spanne else 0.0
        aus.append((d.isoformat(), None, round(mit, 3), round(max(ist, warm - streu), 3) if spanne else None,
                    round(kalt + streu, 3) if spanne else None, ohne))
    if ohne_wie_mit and ohne_kwh is not None and aus and aus[-1][2] > 0:
        f = ohne_kwh / aus[-1][2]
        aus = [(t, i, m, u, o, round(m * f, 3)) for t, i, m, u, o, _ in aus]
    return aus


@dataclass(frozen=True)
class Tageswert:
    """Ein Tag der Heizperiode für die Ansicht Tag/Woche/Monat (BSM-033.04): gemessen bis jetzt, Prognose (Rest von heute
    bzw. ganzer Tag), Spanne (milder/kalter Winter, nur mit Signatur), ohne Automatik, Außentemperatur und ihre Herkunft."""

    datum: date
    ist: float | None          # gemessen (bis heute)
    prog: float                # Prognose mit Automatik (heute: Rest des Tages)
    unten: float | None
    oben: float | None
    ohne: float | None
    aussen: float | None
    quelle: str                # "gemessen" | "vorhersage" | "klima"


def tageswerte(
    roh: Mapping[str, Sequence[TagRoh]], reste: Mapping[str, ContainerRest], heute: date, beginn: date, ende: date,
    reihe_: Sequence[tuple[str, float | None, float, float | None, float | None, float | None]],
    vorhersage: Mapping[date, float], klima: Sequence[float], aussen_heute: float | None = None,
) -> list[Tageswert]:
    """Je Tag der Heizperiode die Werte (nicht aufsummiert); „ohne“ aus der Tagesreihe (`reihe`, gleiche Rechnung)."""
    werte = list(reste.values())
    spanne = bool(werte) and all(r.methode == "signatur" for r in werte)
    ist: dict[date, float] = {}
    temp: dict[date, list[float]] = {}
    for liste in roh.values():
        for t in liste:
            if beginn <= t.datum <= heute:
                ist[t.datum] = ist.get(t.datum, 0.0) + (t.kwh or 0.0)
                if t.aussen is not None:
                    temp.setdefault(t.datum, []).append(t.aussen)
    aus: list[Tageswert] = []
    vorher_ohne, k = 0.0, 0
    for i, d in enumerate(tage(beginn, ende)):
        o = reihe_[i][5] if i < len(reihe_) else None
        ohne = None if o is None else o - vorher_ohne
        vorher_ohne = o or 0.0
        if d < heute:
            tt = temp.get(d)
            aus.append(Tageswert(d, ist.get(d, 0.0), 0.0, None, None, ohne, sum(tt) / len(tt) if tt else None, "gemessen"))
            continue
        if d == heute:
            rest = sum(r.heute_kwh for r in werte)
            tt = temp.get(d)
            aussen, quelle = ((aussen_heute, "vorhersage") if aussen_heute is not None
                              else (sum(tt) / len(tt), "gemessen") if tt else (klima_tag(d, klima), "klima"))
            aus.append(Tageswert(d, ist.get(d, 0.0), rest, rest if spanne else None, rest if spanne else None, ohne, aussen, quelle))
            continue
        prog = sum(r.je_tag[k] for r in werte if k < len(r.je_tag))
        unten = sum(r.je_tag_warm[k] for r in werte) if spanne else None
        oben = sum(r.je_tag_kalt[k] for r in werte) if spanne else None
        k += 1
        aussen, quelle = (vorhersage[d], "vorhersage") if d in vorhersage else (klima_tag(d, klima), "klima")
        aus.append(Tageswert(d, None, prog, unten, oben, ohne, aussen, quelle))
    return aus


PERIODEN = ("tag", "woche", "monat")


def perioden(werte: Sequence[Tageswert], art: str, heute: date) -> list[dict[str, object]]:
    """Tage zu Zeiträumen (Tag, Woche ab Montag, Monat) zusammengefasst: tatsächlich, Prognose (Rest), mit = beides,
    Spanne (nur wenn jeder Tag mit Prognose eine hat), ohne, gespart, Ø außen, Herkunft der Temperatur."""
    def schluessel(d: date) -> date:
        return d if art == "tag" else d - timedelta(days=d.weekday()) if art == "woche" else d.replace(day=1)

    gruppen: dict[date, list[Tageswert]] = {}
    for w in werte:
        gruppen.setdefault(schluessel(w.datum), []).append(w)
    aus: list[dict[str, object]] = []
    for g in gruppen.values():
        ist = sum(w.ist or 0.0 for w in g)
        prog = sum(w.prog for w in g)
        mit_prog = [w for w in g if w.datum >= heute]
        spanne = bool(mit_prog) and all(w.unten is not None for w in mit_prog)
        ohne = None if any(w.ohne is None for w in g) else sum(w.ohne or 0.0 for w in g)
        temps = [w.aussen for w in g if w.aussen is not None]
        aus.append({
            "von": g[0].datum.isoformat(), "bis": g[-1].datum.isoformat(),
            "ist": round(ist, 3) if any(w.ist is not None for w in g) else None, "prog": round(prog, 3),
            "mit": round(ist + prog, 3),
            "unten": round(ist + sum(w.unten or 0.0 for w in mit_prog), 3) if spanne else None,
            "oben": round(ist + sum(w.oben or 0.0 for w in mit_prog), 3) if spanne else None,
            "ohne": round(ohne, 3) if ohne is not None else None,
            "gespart": round(ohne - ist - prog, 3) if ohne is not None else None,
            "aussen": round(sum(temps) / len(temps), 1) if temps else None,
            "quellen": [q for q in ("gemessen", "vorhersage", "klima") if any(w.quelle == q for w in g)],
            "heute": any(w.datum == heute for w in g), "vorbei": g[-1].datum < heute,
        })
    return aus


def baustelle_tage(
    roh: Mapping[str, Sequence[TagRoh]], heute: date, heiztage: Mapping[str, Collection[date] | None] | None = None,
) -> list[Tag]:
    """Tage der ganzen Baustelle für ihre Signatur (Kachel „Wetter“, Erkenntnis): nur Tage, an denen jeder Container zählt
    und mindestens einer Heiztag hat (FE-0030: Tage, an denen niemand heizt, raus; ein Container im Modus „aus“ oder mit
    anderem Plan nimmt der Baustelle nicht ihre Tage); kWh summiert, Außentemperatur gemittelt (dieselbe Messung)."""
    je_tag: dict[date, list[tuple[str, TagRoh]]] = {}
    for bid, liste in roh.items():
        for t in liste:
            if tag_zaehlt(t, heute):
                je_tag.setdefault(t.datum, []).append((bid, t))
    n = len(roh)
    return [Tag(sum(t.aussen for _, t in ts) / n, sum(t.kwh for _, t in ts))   # type: ignore[misc]  # tag_zaehlt prüft None
            for d, ts in sorted(je_tag.items())
            if n and len(ts) == n and any(heiztag(d, (heiztage or {}).get(bid)) for bid, _ in ts)]


# ------------------------------------------------------------------ Ersparnis nach IPMVP (BSM-033.04)

@dataclass(frozen=True)
class Ohne:
    signatur: Signatur
    tage: int                       # gemessene Baseline-Tage
    heizperiode_kwh: float | None   # ganze Heizperiode „ohne Automatik“ (nur mit guter/brauchbarer Signatur)


def ohne_container(
    roh: Sequence[TagRoh], ohne_tage: Collection[date], heute: date, beginn: date, ende: date,
    vorhersage: Mapping[date, float], klima: Sequence[float],
) -> Ohne:
    """Signatur „ohne Automatik“ aus den Baseline-Tagen und die Heizperiode damit gerechnet: jeder Tag bis heute bei
    seiner gemessenen Außentemperatur (Baseline-Tage mit ihrem Verbrauch), danach Vorhersage bzw. Klimamittel."""
    gemessen = [t for t in roh if t.datum in ohne_tage and tag_zaehlt(t, heute)]
    sig = berechnen(Tag(t.aussen, t.kwh, automatik=False) for t in gemessen)   # type: ignore[arg-type]
    if erwartet(sig, 0.0) is None:
        return Ohne(sig, len(gemessen), None)
    je_tag = {t.datum: t for t in roh}
    summe = 0.0
    for d in tage(beginn, ende):
        t = je_tag.get(d)
        if d in ohne_tage and t is not None and t.kwh is not None:
            summe += t.kwh
        elif d <= heute:
            aussen = t.aussen if t is not None and t.aussen is not None else klima_tag(d, klima)
            summe += erwartet(sig, aussen) or 0.0
        else:
            summe += erwartet(sig, vorhersage.get(d, klima_tag(d, klima))) or 0.0
    return Ohne(sig, len(gemessen), summe)


GLEICH = "gleich"   # Container ohne Heizkörper: die Automatik schaltet dort nichts, „ohne“ = „mit“
EIGEN = "eigen"     # Container mit eigener Signatur „ohne“


def quelle_ohne(
    bid: str, typen: Mapping[str, str], gemessen: Collection[str], ohne_lauf: Collection[str] = (),
) -> str | tuple[str, ...] | None:
    """Woher „ohne Automatik“ eines Containers kommt (IPMVP, Bauplan Hochrechnung §6): `EIGEN` (eigene Signatur „ohne“),
    `GLEICH` (ohne Heizkörper – nichts zu messen, „ohne“ = „mit“), die gemessenen Container, deren Verhältnis ohne ÷ mit
    gilt (derselbe Heizkörper-Typ; ein Container, der nie einen Lauf bekommt – `ohne_lauf`, z. B. Modus aus –, nimmt alle
    gemessenen, wenn es keinen desselben Typs gibt), oder None (noch nicht möglich)."""
    if bid in gemessen:
        return EIGEN
    typ = typen.get(bid, "")
    if not typ:
        return GLEICH
    gleich_typ = tuple(b for b in gemessen if typen.get(b, "") == typ)
    if gleich_typ:
        return gleich_typ
    if bid in ohne_lauf and gemessen:
        return tuple(gemessen)
    return None


def gemessen_ohne(ohne: Mapping[str, Ohne], mit_kwh: Mapping[str, float]) -> list[str]:
    """Container mit eigener Signatur „ohne“, deren Verhältnis ohne ÷ mit taugt (Heizperiode „ohne“ und „mit“ > 0)."""
    return [bid for bid, o in ohne.items() if o.heizperiode_kwh is not None and mit_kwh.get(bid)]


def quellen(
    ohne: Mapping[str, Ohne], mit_kwh: Mapping[str, float], typen: Mapping[str, str], ohne_lauf: Collection[str] = (),
) -> dict[str, str | tuple[str, ...] | None]:
    """Je Container die Quelle von „ohne Automatik“ (`quelle_ohne`) – dieselbe Regel für die Rechnung und die Anzeige."""
    gemessen = gemessen_ohne(ohne, mit_kwh)
    return {bid: EIGEN if (o := ohne.get(bid)) is not None and o.heizperiode_kwh is not None
            else quelle_ohne(bid, typen, gemessen, ohne_lauf) for bid in mit_kwh}


def ohne_baustelle(
    ohne: Mapping[str, Ohne], mit_kwh: Mapping[str, float], typen: Mapping[str, str], ohne_lauf: Collection[str] = (),
) -> float | None:
    """„Ohne Automatik“ der ganzen Heizperiode aus den Baseline-Messungen: gemessene Container mit ihrer Signatur, die
    anderen nach `quellen` (Verhältnis ohne ÷ mit gemessener Container, ohne Heizkörper „ohne“ = „mit“); None, solange
    das nicht für jeden Container geht (dann bleibt die Schätzung 24/7)."""
    verh = {bid: ohne[bid].heizperiode_kwh / mit_kwh[bid] for bid in gemessen_ohne(ohne, mit_kwh)}   # type: ignore[operator]
    summe = 0.0
    for bid, q in quellen(ohne, mit_kwh, typen, ohne_lauf).items():
        if q == EIGEN:
            summe += ohne[bid].heizperiode_kwh   # type: ignore[operator]
        elif q == GLEICH:
            summe += mit_kwh[bid]
        elif isinstance(q, tuple):
            summe += mit_kwh[bid] * sum(verh[b] for b in q) / len(q)
        else:
            return None
    return summe if mit_kwh else None
