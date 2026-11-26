"""Verbrauch & Wetter (M13, Mockup `mockups/auswertung-neu.html`, abgenommen 26.11.2026): kWh, Außentemperatur, Wetter,
Wind und Regen in einem Diagramm – je Stunde, Tag, Woche oder Monat – und der Ø Verbrauch je Temperaturband und Wetter.

Die Integration rechnet alles hier (Regel „die Seite rechnet nichts Fachliches“), die Seite zeichnet nur. Eingang sind
Stundenwerte: kWh je Container (Langzeitstatistik der Zähler) und das Wetter aus `wetter_minute` (Minuten je Zustand der
Wetter-Entität, Ø Wind, Stand des Tages-Regens).
"""

from __future__ import annotations

from collections import Counter, defaultdict
from collections.abc import Iterable, Mapping, Sequence
from dataclasses import dataclass, field
from datetime import date, datetime, timedelta
from typing import Any

AUFLOESUNGEN = ("stunde", "tag", "woche", "monat")
# Welche Auflösung zu welchem Zeitraum passt (Mockup): die erste ist die Vorgabe
AUFLOESUNG_JE_ZEITRAUM: dict[str, tuple[str, ...]] = {
    "Tag": ("stunde",), "Woche": ("stunde", "tag"), "Monat": ("tag", "woche"), "Jahr": ("woche", "monat"),
    "Heizperiode": ("woche", "monat"), "Gesamt": ("tag", "woche", "monat"),
}

# Zustände der Wetter-Entität (HA `weather`) → Klasse des Diagramms
KLASSE: dict[str, str] = {
    "sunny": "sonne", "clear-night": "sonne", "partlycloudy": "wolken", "windy": "wolken", "windy-variant": "wolken",
    "cloudy": "trueb", "fog": "trueb", "exceptional": "trueb",
    "rainy": "regen", "pouring": "regen", "lightning": "regen", "lightning-rainy": "regen", "hail": "regen",
    "snowy": "schnee", "snowy-rainy": "schnee",
}
KLASSEN = ("sonne", "wolken", "trueb", "regen", "schnee")
NASS_ANTEIL = 1 / 6   # Regen oder Schnee zählt für den Zeitschritt, sobald er so viel der Wetterzeit ausmacht

# Bänder der Ansicht „nach Temperatur“ (untere Grenze einschließlich) und die drei Wettergruppen
BAENDER: tuple[tuple[str, float | None, float | None], ...] = (
    ("unter_m2", None, -2.0), ("m2_2", -2.0, 2.0), ("2_6", 2.0, 6.0), ("ueber_6", 6.0, None),
)
GRUPPEN: dict[str, tuple[str, ...]] = {"sonnig": ("sonne", "wolken"), "trueb": ("trueb",), "nass": ("regen", "schnee")}


def klasse(zustand: str | None) -> str | None:
    """Klasse eines Zustands der Wetter-Entität; unbekannt → None."""
    return KLASSE.get(zustand or "")


def aufloesung(zeitraum: str, gewuenscht: str | None) -> str:
    """Gewünschte Auflösung, wenn sie zum Zeitraum passt, sonst die Vorgabe des Zeitraums."""
    erlaubt = AUFLOESUNG_JE_ZEITRAUM.get(zeitraum, ("tag",))
    return gewuenscht if gewuenscht in erlaubt else erlaubt[0]


@dataclass
class Stunde:
    """Eine Stunde (lokale Zeit): kWh je Container, Ø außen, Minuten je Klasse, Ø Wind, Stand des Tages-Regens (mm)."""

    beginn: datetime
    kwh: dict[str, float] = field(default_factory=dict)
    aussen: float | None = None
    wetter_min: dict[str, float] = field(default_factory=dict)
    wind: float | None = None
    regen_stand: float | None = None   # höchster Stand des Tageszählers in dieser Stunde


def eimer(beginn: datetime, aufl: str) -> datetime | date:
    """Schlüssel des Zeitschritts: Stunde, Tag, Montag der Woche bzw. Erster des Monats."""
    if aufl == "stunde":
        return beginn.replace(minute=0, second=0, microsecond=0)
    tag = beginn.date()
    if aufl == "tag":
        return tag
    if aufl == "woche":
        return tag - timedelta(days=tag.weekday())
    if aufl == "monat":
        return tag.replace(day=1)
    raise ValueError(f"unbekannte Auflösung {aufl!r}")


def wetter_des_schritts(minuten: Mapping[str, float]) -> str | None:
    """Wetter eines Zeitschritts: Schnee bzw. Regen, sobald er ein Sechstel der Zeit ausmacht, sonst das häufigste."""
    gesamt = sum(v for v in minuten.values() if v > 0)
    if gesamt <= 0:
        return None
    for nass in ("schnee", "regen"):
        if minuten.get(nass, 0) / gesamt >= NASS_ANTEIL:
            return nass
    return max(KLASSEN, key=lambda k: (minuten.get(k, 0), -KLASSEN.index(k)))


def _regen(stunden: Sequence[Stunde], aufl: str) -> dict[Any, float | None]:
    """Regen je Zeitschritt in mm aus dem Stand des Tageszählers: je Stunde der Zuwachs seit der Stunde davor (am selben
    Tag), sonst die Tagessummen (höchster Stand) der Tage im Zeitschritt."""
    erg: dict[Any, float | None] = {}
    if aufl == "stunde":
        zuletzt: dict[date, float] = {}
        for s in sorted(stunden, key=lambda x: x.beginn):
            k = eimer(s.beginn, aufl)
            if s.regen_stand is None:
                erg.setdefault(k, None)
                continue
            tag = s.beginn.date()
            if tag not in zuletzt and s.beginn.hour != 0:   # Stunden davor fehlen: der Stand seit Mitternacht ist nicht diese Stunde
                erg.setdefault(k, None)
                zuletzt[tag] = s.regen_stand
                continue
            erg[k] = round(max(0.0, s.regen_stand - zuletzt.get(tag, 0.0)), 1)
            zuletzt[tag] = max(zuletzt.get(tag, 0.0), s.regen_stand)
        return erg
    je_tag: dict[date, float] = {}
    for s in stunden:
        if s.regen_stand is not None:
            je_tag[s.beginn.date()] = max(je_tag.get(s.beginn.date(), 0.0), s.regen_stand)
    for s in stunden:
        erg.setdefault(eimer(s.beginn, aufl), None)
    for tag, mm in je_tag.items():
        k = eimer(datetime.combine(tag, datetime.min.time()), aufl)
        erg[k] = round((erg.get(k) or 0.0) + mm, 1)
    return erg


def punkte(stunden: Iterable[Stunde], aufl: str, container: Sequence[str]) -> list[dict[str, Any]]:
    """Zeitschritte des Diagramms in zeitlicher Folge: `von` (ISO), `kwh` (Summe der Container), `je_container`,
    `aussen` (Ø der Stunden mit Wert), `wetter` (Klasse), `wind` (Ø km/h), `regen` (mm)."""
    liste = list(stunden)
    gruppen: dict[Any, list[Stunde]] = defaultdict(list)
    for s in liste:
        gruppen[eimer(s.beginn, aufl)].append(s)
    regen = _regen(liste, aufl)
    erg = []
    for k in sorted(gruppen):
        G = gruppen[k]
        je = {c: round(sum(s.kwh.get(c, 0.0) for s in G), 3) for c in container}
        t = [s.aussen for s in G if s.aussen is not None]
        w = [s.wind for s in G if s.wind is not None]
        minuten: Counter[str] = Counter()
        for s in G:
            minuten.update(s.wetter_min)
        erg.append({
            "von": k.isoformat(), "kwh": round(sum(je.values()), 3), "je_container": je,
            "aussen": round(sum(t) / len(t), 1) if t else None, "wetter": wetter_des_schritts(minuten),
            "wind": round(sum(w) / len(w), 1) if w else None, "regen": regen.get(k),
        })
    return erg


def band(t: float) -> str:
    """Schlüssel des Temperaturbands."""
    for k, unten, oben in BAENDER:
        if (unten is None or t >= unten) and (oben is None or t < oben):
            return k
    return BAENDER[-1][0]


def baender(punkte_: Iterable[Mapping[str, Any]], container: str | None = None) -> dict[str, Any]:
    """Ansicht „nach Temperatur“: je Band und Wettergruppe Ø kWh je Zeitschritt und Anzahl; dazu, wie viel mehr das
    kälteste Band als das wärmste braucht (Faktor) und wie viel mehr trübe als sonnige Zeitschritte bei gleicher
    Temperatur brauchen (%, Mittel über die Bänder mit beiden). Zeitschritte ohne Temperatur oder Wetter zählen nicht.
    `container`: nur dieser Container statt der ganzen Baustelle."""
    werte: dict[tuple[str, str], list[float]] = defaultdict(list)
    je_band: dict[str, list[float]] = defaultdict(list)
    for p in punkte_:
        if p.get("aussen") is None:
            continue
        kwh = float(p["je_container"].get(container, 0.0)) if container else float(p["kwh"])
        b = band(float(p["aussen"]))
        je_band[b].append(kwh)
        g = next((g for g, ks in GRUPPEN.items() if p.get("wetter") in ks), None)
        if g:
            werte[(b, g)].append(kwh)
    zellen = [{"band": b, "gruppe": g, "kwh": round(sum(v) / len(v), 2), "anzahl": len(v)}
              for (b, _u, _o) in BAENDER for g in GRUPPEN if (v := werte.get((b, g)))]
    mittel = {b: sum(v) / len(v) for b, v in je_band.items() if v}
    belegt = [b for b, _u, _o in BAENDER if b in mittel]
    faktor = None
    if len(belegt) >= 2 and mittel[belegt[-1]] > 0:
        faktor = round(mittel[belegt[0]] / mittel[belegt[-1]], 1)
    unterschiede = []
    for b, _u, _o in BAENDER:
        s, t = werte.get((b, "sonnig")), werte.get((b, "trueb"))
        if s and t and sum(s) > 0:
            unterschiede.append((sum(t) / len(t)) / (sum(s) / len(s)) - 1)
    return {
        "zellen": zellen,
        "kalt_band": belegt[0] if faktor is not None else None, "warm_band": belegt[-1] if faktor is not None else None,
        "kalt_zu_warm": faktor,
        "trueb_mehr_prozent": round(sum(unterschiede) / len(unterschiede) * 100) if unterschiede else None,
    }


def stelle(von: str, beginn: date, aufl: str) -> int:
    """Stelle eines Zeitschritts (`von` ISO) ab dem Beginn des Zeitraums: Stunden, Tage, Wochen bzw. Monate."""
    if aufl == "stunde":
        t = datetime.fromisoformat(von)
        return (t.date() - beginn).days * 24 + t.hour
    tag = date.fromisoformat(von[:10])
    if aufl == "tag":
        return (tag - beginn).days
    if aufl == "woche":
        return ((tag - timedelta(days=tag.weekday())) - (beginn - timedelta(days=beginn.weekday()))).days // 7
    return (tag.year - beginn.year) * 12 + tag.month - beginn.month


def vergleich_angleichen(jetzt: Sequence[Mapping[str, Any]], vorher: Sequence[Mapping[str, Any]], aufl: str,
                         beginn_jetzt: date, beginn_vorher: date, container: str | None = None) -> list[float | None]:
    """kWh des Vergleichszeitraums je Zeitschritt von `jetzt`, nach der Stelle im Zeitraum angeglichen (1. Tag zum 1. Tag,
    auch wenn einem der Zeiträume Schritte fehlen); fehlt der Schritt → None."""
    davor = {stelle(str(p["von"]), beginn_vorher, aufl): p for p in vorher}
    erg: list[float | None] = []
    for p in jetzt:
        q = davor.get(stelle(str(p["von"]), beginn_jetzt, aufl))
        erg.append(None if q is None else round(float(q["je_container"].get(container, 0.0)) if container else float(q["kwh"]), 3))
    return erg


def schritt_beginn(t: datetime, je_tag: bool) -> datetime:
    """Beginn der Stunde bzw. (`je_tag`) des Tages, in dem `t` liegt – Schlüssel beim Zusammenführen der Quellen."""
    t = t.replace(minute=0, second=0, microsecond=0)
    return t.replace(hour=0) if je_tag else t


def wetter_zusammen(x: Stunde, wetter: Sequence[Mapping[str, Any]], aussen_statistik: float | None) -> None:
    """Wetterstunden (aus `wetter_minute`) in einen Schritt eintragen: Ø außen (sonst der Wert der Statistik), Ø Wind,
    Minuten je Klasse, höchster Stand des Tages-Regens."""
    ta = [w["aussen"] for w in wetter if w.get("aussen") is not None]
    x.aussen = sum(ta) / len(ta) if ta else aussen_statistik
    wi = [w["wind"] for w in wetter if w.get("wind") is not None]
    x.wind = sum(wi) / len(wi) if wi else None
    for w in wetter:
        for k, m in (w.get("wetter_min") or {}).items():
            x.wetter_min[k] = x.wetter_min.get(k, 0.0) + m
    rs = [w["regen_stand"] for w in wetter if w.get("regen_stand") is not None]
    x.regen_stand = max(rs) if rs else None
