"""Auswertung aus der Langzeitstatistik – reine Fachlogik ohne Home-Assistant-Code.

Bisher rechnete das die Seite selbst (`frontend/baustelle-panel.js`: `zeitraum`, `statistik`, `verbrauch`,
`abrechnungDaten`, `firmaAm`, `bucketMs`, `csv`, `heizperiodeEnde`, `verlaufWerte`, `kennzahlen`,
`monateJeContainer`, `typVergleich`, `jeGeraet`; der Wetter-Einfluss kommt seit BSM-033 aus der Energiesignatur). Hier steht jede Regel einmal;
Integration, Bericht und Seite nehmen dieselben Zahlen (docs/bauplan-module.md). Geprüft gegen die Referenzwerte der
Seite in `tests/vektoren/auswertung-*.json`.

Eingaben sind die Antworten von `recorder/statistics_during_period` (je Statistik-ID eine Liste von Punkten mit `start`
und `change` bzw. `mean`; `start` als Zeitstempel in s oder ms, ISO-Text oder datetime) und Werte aus Store/Zählern.

Abweichend von der Seite (fachlich richtig, wie Bericht und Zähler der Integration – docs/bauplan-module.md §5):

- **Firma je Tag:** Verbrauch gehört der Firma, der der Container zu Tagesbeginn gehört (`firma_am_tag`); ein
  Wechsel mitten am Tag gilt ab dem Folgetag. Die Seite nahm bei „Tag“ die Firma je Stunde und beim „Jahr“ die Firma am
  Monatsersten für den ganzen Monat – für das Jahr bekommt `abrechnung` deshalb Werte je Tag.
- **Heiztage ohne Zähler:** Tage ab Beginn, an denen ein Container geheizt hat (Heizzeit > 0, wie Zähler `heiztage` und
  Bericht), nicht Tage mit mehr als 0,5 kWh der ganzen Baustelle; Monate = Monate mit einem Heiztag. Seit 0.8.29 zählt
  die tatsächlich geheizte Zeit (Strom gezogen, AN-0011); Tage davor zählen nach der eingeschalteten Zeit
  (`heizzeit_geheizt`).
"""

from __future__ import annotations

import math
from calendar import monthrange
from collections.abc import Callable, Collection, Iterable, Mapping, Sequence
from dataclasses import dataclass
from datetime import date, datetime, timedelta, timezone, tzinfo
from typing import Any, TypeGuard

from .abrechnung import EIGEN, firma_von, zahl as fest
from . import groesse

ARTEN = ("Tag", "Woche", "Monat", "Jahr")
TAGE = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"]
MONATE = ["Jän", "Feb", "Mär", "Apr", "Mai", "Jun", "Jul", "Aug", "Sep", "Okt", "Nov", "Dez"]
HEIZER = ("heizung", "heizkoerper")
EIGENE_FIRMA = {"id": EIGEN, "name": "Eigene Firma", "eigen": True}

Punkt = Mapping[str, Any]
Statistik = Mapping[str, Sequence[Punkt]]


def ist_zahl(wert: Any) -> TypeGuard[float | int | str]:
    """Endliche Zahl (auch als Text) – wie `zahl()` der Seite."""
    if wert is None or wert == "" or isinstance(wert, bool):
        return False
    try:
        return math.isfinite(float(wert))
    except (TypeError, ValueError):
        return False


def summe(werte: Iterable[Any]) -> float:
    """Summe, fehlende Werte zählen 0."""
    ergebnis = 0.0
    for wert in werte:
        ergebnis += float(wert) if ist_zahl(wert) else 0.0
    return ergebnis


def addieren(reihen: Sequence[Sequence[float | None]]) -> list[float]:
    """Reihen stellenweise addieren; Länge der ersten Reihe, fehlende Werte zählen 0."""
    if not reihen:
        return []
    ergebnis = [v or 0.0 for v in reihen[0]]
    for reihe in reihen[1:]:
        ergebnis = [v + (reihe[i] or 0.0 if i < len(reihe) else 0.0) for i, v in enumerate(ergebnis)]
    return ergebnis


def js_runden(wert: float) -> int:
    """Auf ganze Zahl, bei genau halb nach oben (`Math.round`)."""
    unten = math.floor(wert)
    return int(unten + 1 if wert - unten >= 0.5 else unten)


# ------------------------------------------------------------------ Zeit


def mitternacht(tag: date, zone: tzinfo) -> datetime:
    """Tagesbeginn 00:00 in der Zone der Baustelle (UTC)."""
    return datetime(tag.year, tag.month, tag.day, tzinfo=zone).astimezone(timezone.utc)


def zeitpunkt(start: float | int | str | datetime) -> datetime:
    """Beginn eines Statistik-Punkts als datetime (Zahl < 1e11 in Sekunden, sonst Millisekunden)."""
    if isinstance(start, datetime):
        return start if start.tzinfo else start.replace(tzinfo=timezone.utc)
    if isinstance(start, (int, float)):
        return datetime.fromtimestamp(start if start < 1e11 else start / 1000, timezone.utc)
    return datetime.fromisoformat(start)


def lokal(start: float | int | str | datetime, zone: tzinfo) -> datetime:
    """Beginn eines Statistik-Punkts in der Zone der Baustelle."""
    return zeitpunkt(start).astimezone(zone)


@dataclass(frozen=True)
class Zeitraum:
    """Zeitraum der Auswertung: Tag (je Stunde), Woche/Monat (je Tag), Jahr (je Monat)."""

    art: str
    von: date
    bis: date   # erster Tag danach
    periode: str   # hour, day, month (wie der Recorder)
    n: int
    labels: tuple[str, ...]
    monat: int | None = None   # 1–12 (nur Monat)
    jahr: int | None = None   # nur Monat und Jahr

    def index(self, zeit: datetime) -> int:
        """Stelle einer lokalen Zeit im Zeitraum; -1 außerhalb (Woche: ohne Prüfung der Grenzen, wie die Seite)."""
        tag = zeit.date()
        if self.art == "Tag":
            return zeit.hour if tag == self.von else -1
        if self.art == "Woche":
            return (tag - self.von).days
        if self.art == "Monat":
            return tag.day - 1 if (tag.year, tag.month) == (self.von.year, self.von.month) else -1
        return tag.month - 1 if tag.year == self.jahr else -1

    def beginn(self, i: int, zone: tzinfo) -> datetime:
        """Beginn der i-ten Stunde/Tag/Monat (UTC)."""
        if self.periode == "hour":
            return mitternacht(self.von, zone) + timedelta(hours=i)
        if self.periode == "day":
            return mitternacht(self.von + timedelta(days=i), zone)
        return mitternacht(date(self.jahr or self.von.year, i + 1, 1), zone)

    def label_csv(self, i: int) -> str:
        """Spalte „Zeit“ im CSV: 07:00, 29.09.2026 bzw. Sep 2026."""
        if self.art == "Tag":
            return f"{self.labels[i]}:00"
        if self.art == "Jahr":
            return f"{MONATE[i]} {self.jahr}"
        return (self.von + timedelta(days=i)).strftime("%d.%m.%Y")


def zeitraum(art: str, heute: date, versatz: int = 0) -> Zeitraum:
    """Zeitraum `art` mit `heute`; `versatz` 1 = der davor (gestern, Vorwoche, Vormonat, Vorjahr)."""
    if art == "Tag":
        tag = heute - timedelta(days=versatz)
        return Zeitraum(art, tag, tag + timedelta(days=1), "hour", 24, tuple(f"{h:02d}" for h in range(24)))
    if art == "Woche":
        montag = heute - timedelta(days=heute.weekday() + 7 * versatz)
        return Zeitraum(art, montag, montag + timedelta(days=7), "day", 7, tuple(TAGE))
    if art == "Monat":
        m, j = heute.month - 1 - versatz, heute.year
        while m < 0:
            m, j = m + 12, j - 1
        n = monthrange(j, m + 1)[1]
        von = date(j, m + 1, 1)
        return Zeitraum(art, von, von + timedelta(days=n), "day", n, tuple(f"{i + 1}." for i in range(n)), m + 1, j)
    if art != "Jahr":
        raise ValueError(f"unbekannter Zeitraum {art!r}")
    j = heute.year - versatz
    return Zeitraum(art, date(j, 1, 1), date(j + 1, 1, 1), "month", 12, tuple(MONATE), None, j)


def reihen(zr: Zeitraum, statistik: Statistik, zone: tzinfo) -> dict[str, list[float | None]]:
    """Statistik je ID als Wert je Stunde/Tag/Monat des Zeitraums (Änderung addiert, sonst Mittel); ohne Wert None."""
    ergebnis: dict[str, list[float | None]] = {}
    for sid, punkte in statistik.items():
        werte: list[float | None] = [None] * zr.n
        for p in punkte or []:
            i = zr.index(lokal(p["start"], zone))
            if i < 0 or i >= zr.n:
                continue
            if ist_zahl(p.get("change")):
                werte[i] = (werte[i] or 0.0) + float(p["change"])
            elif ist_zahl(p.get("mean")):
                werte[i] = float(p["mean"])
        ergebnis[sid] = werte
    return ergebnis


def verbrauch(werte: Mapping[str, Sequence[float | None]], ids: Sequence[str], n: int) -> list[float]:
    """kWh je Periode eines Containers: Energie des Containers bzw. Summe seiner Geräte (`ids`)."""
    teile = [[v or 0.0 for v in (werte.get(sid) or [0.0] * n)] for sid in ids]
    return addieren(teile) or [0.0] * n


# ------------------------------------------------------------------ Abrechnung nach Firma


def _firma(firmen: Sequence[Mapping[str, Any]], fid: str) -> Mapping[str, Any]:
    """Firma zur ID; unbekannt → die erste (eigene) Firma."""
    return next((f for f in firmen if f.get("id") == fid), firmen[0])


def firma_am_tag(baustelle: Mapping[str, Any], bereich: str, zeit: datetime, zone: tzinfo) -> Mapping[str, Any]:
    """Firma, der der Container am Tag von `zeit` gehört (zu Tagesbeginn); gelöschte Firma → eigene Firma."""
    firmen = baustelle.get("firmen") or [EIGENE_FIRMA]
    beginn = mitternacht(zeit.astimezone(zone).date(), zone).astimezone(zone)  # in der Zone: `ab` ohne Zone gilt dort
    return _firma(firmen, firma_von(list(baustelle.get("zuordnung") or []), firmen, bereich, beginn))


def abrechnung(
    baustellen: Sequence[Mapping[str, Any]],
    werte: Mapping[str, Mapping[str, Sequence[tuple[Any, float | None]]]],
    zone: tzinfo,
    preis_fn: Callable[[str, date], float] | None = None,
) -> list[dict[str, Any]]:
    """kWh je Firma und Container: `[{"firma", "eigen", "kwh", "container": [{"entry", "bereich", "kwh"}]}]`.

    Mit `preis_fn(entry, tag)` zusätzlich „eur“ je Firma und Container – jeder Tag mit dem Preis, der damals galt
    (Strompreis mit „gilt ab“, Herbert 04.10.2026).

    `werte[entry][bereich]` = `[(beginn, kWh), …]` je Stunde oder Tag (beim Jahr je Tag, nicht je Monat). Firmen
    verschiedener Baustellen mit gleichem Namen sind eine Zeile; die eigene Firma zuerst, sonst in der Reihenfolge des
    ersten Verbrauchs. Firmen ohne Verbrauch fehlen.
    """
    zeilen: dict[str, dict[str, Any]] = {}
    for b in baustellen:
        for bereich in b["bereiche"]:
            for beginn, kwh in werte[b["entry"]][bereich["id"]]:
                if not kwh:
                    continue
                f = firma_am_tag(b, bereich["id"], zeitpunkt(beginn), zone)
                zeile = zeilen.setdefault(EIGEN if f.get("eigen") else f["name"], {"f": f, "c": {}, "kwh": 0.0, "eur": 0.0})
                zeile["kwh"] += kwh
                c = zeile["c"].setdefault((b["entry"], bereich["id"]), {"entry": b["entry"], "bereich": bereich["id"], "kwh": 0.0, "eur": 0.0})
                c["kwh"] += kwh
                if preis_fn is not None:
                    e = kwh * preis_fn(b["entry"], zeitpunkt(beginn).astimezone(zone).date())
                    zeile["eur"] += e
                    c["eur"] += e
    liste = sorted(zeilen.values(), key=lambda z: 0 if z["f"].get("eigen") else 1)
    return [
        {"firma": z["f"]["name"], "eigen": bool(z["f"].get("eigen")), "kwh": z["kwh"],
         **({"eur": z["eur"]} if preis_fn is not None else {}),
         "container": [c if preis_fn is not None else {k: v for k, v in c.items() if k != "eur"} for c in z["c"].values()]}
        for z in liste
    ]


def firmen_reihen(
    baustellen: Sequence[Mapping[str, Any]],
    werte: Mapping[str, Mapping[str, Sequence[tuple[Any, float | None]]]],
    zr: Zeitraum,
    zone: tzinfo,
) -> dict[str, list[float]]:
    """kWh je Firma und Periode des Zeitraums (Verbrauch gestapelt nach Firma): `{"eigen" bzw. Firmenname: [kWh, …]}`.

    Firma je Tag wie `abrechnung` (dieselben `werte`, je Stunde oder Tag); die Periode kommt aus dem Beginn, beim Jahr
    zählen so die Tage eines Monats je nach ihrer Firma. Firmen ohne Verbrauch fehlen.
    """
    ergebnis: dict[str, list[float]] = {}
    for b in baustellen:
        for bereich in b["bereiche"]:
            for beginn, kwh in werte[b["entry"]][bereich["id"]]:
                i = zr.index(lokal(beginn, zone))
                if not kwh or i < 0 or i >= zr.n:
                    continue
                f = firma_am_tag(b, bereich["id"], zeitpunkt(beginn), zone)
                ergebnis.setdefault(EIGEN if f.get("eigen") else f["name"], [0.0] * zr.n)[i] += kwh
    return ergebnis


def _feld(wert: Any) -> str:
    """CSV-Feld; mit Semikolon, Anführungszeichen oder Zeilenumbruch in Anführungszeichen."""
    text = str(wert)
    return '"' + text.replace('"', '""') + '"' if any(z in text for z in ';"\n') else text


def _zeile(felder: Iterable[Any]) -> str:
    return ";".join(_feld(f) for f in felder)


def _namen(baustellen: Sequence[Mapping[str, Any]]) -> tuple[dict[str, str], dict[tuple[str, str], str]]:
    titel = {b["entry"]: b["titel"] for b in baustellen}
    container = {(b["entry"], c["id"]): c["name"] for b in baustellen for c in b["bereiche"]}
    return titel, container


def csv_firma(daten: Sequence[Mapping[str, Any]], baustellen: Sequence[Mapping[str, Any]], art: str, preis: float) -> list[str]:
    """Zeilen der Abrechnung als CSV (Kopf + je Firma und Container), Dezimalkomma ohne Tausendertrennung."""
    titel, container = _namen(baustellen)
    zeilen = [_zeile(["Zeitraum", "Firma", "Baustelle", "Container", "kWh", "Preis €/kWh", "Betrag €"])]
    for z in daten:
        for c in z["container"]:
            eur = c.get("eur", c["kwh"] * preis)   # mit Preis je Tag: Preis = Mittel des Containers
            zeilen.append(_zeile([art, z["firma"], titel[c["entry"]], container[(c["entry"], c["bereich"])],
                                  fest(c["kwh"], 2), fest(eur / c["kwh"] if c["kwh"] else preis, 2), fest(eur, 2)]))
    return zeilen


def csv_verbrauch(
    baustellen: Sequence[Mapping[str, Any]],
    werte: Mapping[str, Mapping[str, Sequence[tuple[Any, float | None]]]],
    zr: Zeitraum,
    preis: float,
    zone: tzinfo,
    preis_fn: Callable[[str, date], float] | None = None,
) -> list[str]:
    """Verbrauch je Periode, Baustelle und Container als CSV (Firma zu Beginn der Periode, nach dem Tag); mit `preis_fn`
    jede Periode mit dem Preis ihres Beginns."""
    zeilen = [_zeile(["Zeit", "Baustelle", "Firma", "Container", "kWh", "Kosten €"])]
    for b in baustellen:
        for bereich in b["bereiche"]:
            for i, (beginn, kwh) in enumerate(werte[b["entry"]][bereich["id"]]):
                f = firma_am_tag(b, bereich["id"], zeitpunkt(beginn), zone)
                w = float(kwh) if ist_zahl(kwh) else 0.0
                p = preis_fn(b["entry"], zeitpunkt(beginn).astimezone(zone).date()) if preis_fn is not None else preis
                zeilen.append(_zeile([zr.label_csv(i), b["titel"], f["name"], bereich["name"], fest(w, 3), fest(w * p, 2)]))
    return zeilen


# ------------------------------------------------------------------ Heizperiode


def heizperiode_ende(heute: date, von: int, bis: int) -> date:
    """Letzter Tag der laufenden (bzw. zuletzt begonnenen) Heizperiode `von`–`bis` (Monate), wie `zaehlen.tage_heizperiode`."""
    jahr = heute.year if heute.month >= von else heute.year - 1
    ende_jahr = jahr if bis >= von else jahr + 1
    return date(ende_jahr, bis, monthrange(ende_jahr, bis)[1])


def heizperiode_bis(heute: date, von: int, bis: int, ende: date | None) -> date:
    """Bis wann die Hochrechnung zählt: geplantes Ende der Baustelle, wenn es vor dem Ende der Heizperiode liegt."""
    hp = heizperiode_ende(heute, von, bis)
    return ende if ende is not None and ende < hp else hp


# ------------------------------------------------------------------ Verlauf und Kennzahlen


def verlauf_zeitraum(heute: date, beginn: date | None, ende: date | None) -> tuple[date, date]:
    """Tage für den Verlauf einer Baustelle: seit Beginn, mindestens die letzten 12 Monate; bis Ende bzw. heute."""
    vor12 = date(heute.year - 1, heute.month + 1, 1) if heute.month < 12 else date(heute.year, 1, 1)
    von = min(beginn or vor12, vor12)
    return von, (ende or heute) + timedelta(days=1)


def heizzeit_geheizt(
    ein: Mapping[str, Iterable[tuple[date, float | None]]], strom: Mapping[str, Iterable[tuple[date, float | None]]]
) -> dict[str, list[tuple[date, float | None]]]:
    """Heizzeit je Container und Tag für die Heiztage: tatsächlich geheizt (Strom gezogen, AN-0011), wo es den Wert für
    den Tag gibt; sonst (Tage vor 0.8.29) die eingeschaltete Zeit."""
    ergebnis: dict[str, list[tuple[date, float | None]]] = {}
    for bid in {*ein, *strom}:
        tage = dict(ein.get(bid, ()))
        tage.update(strom.get(bid, ()))
        ergebnis[bid] = sorted(tage.items())
    return ergebnis


def heiztag_daten(heizzeit: Mapping[str, Iterable[tuple[date, float | None]]], von: date | None = None, bis: date | None = None) -> set[date]:
    """Tage (von–bis einschließlich) mit Heizzeit über 0 in irgendeinem Container – wie der Zähler `heiztage`.

    `heizzeit[bereich]` = `[(tag, Stunden), …]`; Pumpenschächte gibt der Aufrufer nicht hinein.
    """
    return {
        tag for werte in heizzeit.values() for tag, stunden in werte
        if (stunden or 0) > 0 and (von is None or tag >= von) and (bis is None or tag <= bis)
    }


def verlauf_werte(
    energie: Sequence[Punkt] | None,
    heizzeit: Mapping[str, Sequence[Punkt]],
    zone: tzinfo,
    beginn: date | None = None,
    heiztage_zaehler: float | None = None,
    heizzeit_strom: Mapping[str, Sequence[Punkt]] | None = None,
) -> dict[str, Any]:
    """Heiztage, Monate mit Heizung und kWh je Monat (`JJJJ-MM`) einer Baustelle aus der Tagesstatistik.

    `energie`: Energie der Baustelle je Tag; `heizzeit`: Heizzeit je Container und Tag (eingeschaltet), `heizzeit_strom`:
    davon tatsächlich geheizt (`heizzeit_geheizt`). Heiztage zählt die Integration (`heiztage_zaehler`); nur ohne Zähler
    kommen sie aus der Heizzeit.
    """
    je_monat: dict[str, float] = {}
    je_tag: dict[str, float] = {}   # kWh je Tag `JJJJ-MM-TT` (Chronik der Seite, WU-0006)
    for p in energie or []:
        tag = lokal(p["start"], zone)
        wert = float(p["change"]) if ist_zahl(p.get("change")) else 0.0
        je_monat[tag.strftime("%Y-%m")] = je_monat.get(tag.strftime("%Y-%m"), 0.0) + wert
        je_tag[tag.strftime("%Y-%m-%d")] = je_tag.get(tag.strftime("%Y-%m-%d"), 0.0) + wert
    def je_tag_h(punkte: Mapping[str, Sequence[Punkt]]) -> dict[str, list[tuple[date, float]]]:
        return {sid: [(lokal(p["start"], zone).date(), float(p["change"]) if ist_zahl(p.get("change")) else 0.0)
                      for p in werte] for sid, werte in punkte.items()}

    tage = heiztag_daten(heizzeit_geheizt(je_tag_h(heizzeit), je_tag_h(heizzeit_strom or {})), von=beginn)
    heiztage = heiztage_zaehler if ist_zahl(heiztage_zaehler) else len(tage)
    return {"heiztage": heiztage, "monate": len({(t.year, t.month) for t in tage}), "je_monat": je_monat, "je_tag": je_tag}


def kennzahlen(
    zaehler: Mapping[str, Any],
    zustaende: Mapping[str, float | None],
    preis: float,
    container: int,
    heiztage: float,
    monate: int,
) -> dict[str, Any]:
    """Kennzahlen einer Baustelle (Verlauf): kWh, €, gespart, dazu die Werte für den Vergleich der Baustellen.

    `zustaende`: aktuelle Werte der Sensoren `energie`, `kosten`, `ersparnis` (None ohne Wert) – nur, wenn der Zähler fehlt.
    """
    energie, kosten = zustaende.get("energie"), zustaende.get("kosten")
    kwh = float(zaehler["energie"]) if ist_zahl(zaehler.get("energie")) else (energie if energie is not None else 0.0)
    if ist_zahl(zaehler.get("kosten")):
        eur = float(zaehler["kosten"])
    else:
        eur = kosten if kosten is not None else kwh * preis
    gespart = zustaende.get("ersparnis")
    if gespart is None and ist_zahl(zaehler.get("ohne")) and ist_zahl(zaehler.get("energie_heizen")):
        gespart = max(0.0, float(zaehler["ohne"]) - float(zaehler["energie_heizen"])) * preis
    return {
        "kwh": kwh, "eur": eur, "gespart": gespart, "container": container, "heiztage": heiztage, "monate": monate,
        "vergleich": {
            "tag": kwh / heiztage if heiztage else 0.0,   # kWh je Heiztag
            "monat": eur / monate if monate else 0.0,   # € je Monat mit Heizung
            "ges": kwh,
        },
    }


def veraenderung(jetzt: float | None, vorher: float | None) -> int | None:
    """Veränderung zum Zeitraum davor in ganzen % (Pfeile der Auswertung); ohne Wert davor None."""
    if jetzt is None or vorher is None or vorher <= 0:
        return None
    return js_runden((jetzt - vorher) / vorher * 100)


def perioden_grenzen(zr: Zeitraum, zone: tzinfo) -> list[datetime]:
    """Beginn jeder Periode des Zeitraums und das Ende (n + 1 Zeitpunkte, UTC) – Stunde, Tag oder Monat."""
    beginn = mitternacht(zr.von, zone)
    if zr.periode == "hour":
        ende = mitternacht(zr.bis, zone)
        return [min(beginn + timedelta(hours=i), ende) for i in range(zr.n)] + [ende]
    if zr.periode == "day":
        return [mitternacht(zr.von + timedelta(days=i), zone) for i in range(zr.n + 1)]
    return [mitternacht(date(zr.von.year + (i // 12), i % 12 + 1, 1), zone) for i in range(zr.n + 1)]


def stunden_je_periode(zr: Zeitraum, ab: datetime, bis: datetime, zone: tzinfo) -> list[float]:
    """Stunden je Periode, die in [ab, bis) liegen – „ohne Automatik“ läuft 24/7, aber erst ab Beginn und bis jetzt."""
    g = perioden_grenzen(zr, zone)
    return [max(0.0, (min(e, bis) - max(s, ab)).total_seconds() / 3600) for s, e in zip(g, g[1:])]


def ohne_kw(
    geraete: Sequence[tuple[str, str]], mittel_w: Mapping[str, float | None], basis: str, inaktiv: Collection[str] = (),
) -> dict[str, float]:
    """Leistung je Heizkörper für „ohne Automatik“ (WU-0013): `geraet` = seine gemessene Ø-Leistung im Betrieb,
    `typ` = Ø aller Heizkörper desselben Typs (Ölradiator/Konvektor); ohne Messung: Ø des Typs, sonst nicht dabei.
    Inaktive Heizkörper liefen auch ohne Automatik nicht – sie sind nicht dabei (FE-0020); ihre Messung zählt aber im
    Ø des Typs. `geraete`: (id, typ) aller Heizkörper der Baustelle; Ergebnis in kW."""
    je_typ: dict[str, list[float]] = {}
    for gid, typ in geraete:
        if ist_zahl(mittel_w.get(gid)):
            je_typ.setdefault(typ, []).append(float(mittel_w[gid]))   # type: ignore[arg-type]
    typ_mittel = {t: sum(v) / len(v) for t, v in je_typ.items()}
    kw: dict[str, float] = {}
    for gid, typ in geraete:
        if gid in inaktiv:
            continue
        eigen = mittel_w.get(gid)
        wert = typ_mittel.get(typ) if basis == "typ" or not ist_zahl(eigen) else float(eigen)
        if wert is not None:
            kw[gid] = round(wert / 1000, 3)
    return kw


OHNE_HINWEIS = "grobe Obergrenze, nicht belastbar"   # BSM-033.05 (Audit 11.10.2026): „ohne“ = jeder Heizkörper 24 h


def ohne_hinweis(methode: str | None) -> str | None:
    """Hinweis zu „ohne Automatik“ und „gespart“ (BSM-033.05): aus einer gemessenen Baseline keiner, sonst ist „ohne“ die
    Schätzung Dauerbetrieb und damit nur eine grobe Obergrenze."""
    return None if methode == "baseline" else OHNE_HINWEIS


def ohne_automatik(kwh: float, ohne: float, preis: float) -> dict[str, Any] | None:
    """„Ohne Automatik“: Kosten im Dauerbetrieb (`ohne` kWh), gespart in € und % dagegen, dazu der Hinweis (der Zähler
    rechnet immer Dauerbetrieb); ohne Wert (0) None."""
    if ohne <= 0:
        return None
    return {"ohne_eur": ohne * preis, "gespart_eur": max(0.0, ohne - kwh) * preis, "prozent": max(0.0, 1 - kwh / ohne) * 100,
            "hinweis": ohne_hinweis(None)}


def monate_zeitraum(heute: date, beginn: date | None, ende: date | None) -> tuple[date, date, list[str]]:
    """Verbrauch je Monat: erster Tag der Anfrage, Tag danach und die Monate `JJJJ-MM` (höchstens 36)."""
    von = beginn or heute - timedelta(days=365)
    bis = (ende or heute) + timedelta(days=1)
    monate: list[str] = []
    j, m = von.year, von.month
    while (j, m) <= (bis.year, bis.month) and len(monate) < 36:
        monate.append(f"{j}-{m:02d}")
        j, m = (j + 1, 1) if m == 12 else (j, m + 1)
    if bis.day == 1 and len(monate) > 1:
        monate.pop()
    return von.replace(day=1), bis, monate


def monate_je_container(
    monate: Sequence[str], bereiche: Sequence[Mapping[str, Any]], statistik: Statistik, zone: tzinfo
) -> dict[str, Any]:
    """kWh je Monat und Container: `{"labels": ["Nov", …], "reihen": [{"name", "v"}]}` (Container ohne Energie: 0)."""
    reihen_ = []
    for b in bereiche:
        werte = [0.0] * len(monate)
        for p in (statistik.get(b["energie"]) or []) if b.get("energie") else []:
            monat = lokal(p["start"], zone).strftime("%Y-%m")
            if monat in monate and ist_zahl(p.get("change")):
                werte[monate.index(monat)] += float(p["change"])
        reihen_.append({"name": b["name"], "v": werte})
    return {"labels": [MONATE[int(k[5:7]) - 1] for k in monate], "reihen": reihen_}


def geld(kwh: float | None, preis: float) -> float | None:
    """€ zu einer Energiemenge (kWh × Preis der Baustelle); ohne Wert kein Betrag."""
    return None if kwh is None else kwh * preis


def abrechnung_geld(daten: Sequence[Mapping[str, Any]], preis: float) -> list[dict[str, Any]]:
    """Abrechnung je Firma: € und Anteil in % am Verbrauch aller Firmen, je Container €."""
    ges = summe(z["kwh"] for z in daten)
    return [
        {**z, "eur": z.get("eur", z["kwh"] * preis), "anteil": z["kwh"] / ges * 100 if ges else 0.0,
         "container": [{**c, "eur": c.get("eur", c["kwh"] * preis)} for c in z["container"]]}
        for z in daten
    ]


def hochrechnung_werte(
    bisher_kwh: float | None, mit_kwh: float | None, ohne_kwh: float | None, preis: float
) -> dict[str, float | None]:
    """Hochrechnung der Heizperiode in kWh und €: bisher, mit Automatik, ohne (24/7) und gespart (nie unter 0)."""
    gespart = None if mit_kwh is None or ohne_kwh is None else max(0.0, ohne_kwh - mit_kwh) * preis
    return {"bisher_kwh": bisher_kwh, "bisher_eur": geld(bisher_kwh, preis), "mit_kwh": mit_kwh, "mit_eur": geld(mit_kwh, preis),
            "ohne_kwh": ohne_kwh, "ohne_eur": geld(ohne_kwh, preis), "gespart_eur": gespart}


def hochrechnung_signatur(
    werte: dict[str, Any], signatur: Mapping[str, Any] | None, ergebnis: Mapping[str, Any] | None, preis: float
) -> dict[str, Any]:
    """Hochrechnung (`hochrechnung_werte`) um die Signatur ergänzt (BSM-033.02): Methode, Spanne und Normjahr in kWh und €,
    Heizgradtage des Rests und je Container Signatur, Punkte und Rest; für die Karte „Heizperiode“ (BSM-033.03) die
    Tagesreihe `reihe` ([Tag, tatsächlich, mit, unten, oben, ohne] kWh aufsummiert), Klimamittel und Vorhersage; je Tag,
    Woche und Monat `perioden` mit €-Beträgen (BSM-033.04). Ohne
    Signatur: Methode „tagesschnitt“, Spanne leer."""
    s = signatur or {}
    e = ergebnis or {}
    aus = {**werte, "methode": s.get("methode") or "tagesschnitt"}
    for k in ("unten", "oben", "normjahr"):
        kwh = s.get(f"{k}_kwh")
        aus[f"{k}_kwh"], aus[f"{k}_eur"] = kwh, geld(kwh, preis)
    aus["hgt_rest"] = e.get("hgt_rest")
    aus["vorhersage_tage"] = e.get("vorhersage_tage")
    aus["container"] = [{**c, "rest_eur": geld(c.get("rest_kwh"), preis)} for c in e.get("container") or []]
    # BSM-033.03: Karte „Heizperiode“ – bisher aus den Tagen der Heizperiode, Tagesreihe, Klimamittel, Vorhersage
    if e.get("bisher_kwh") is not None:
        aus["bisher_kwh"], aus["bisher_eur"] = e["bisher_kwh"], geld(e["bisher_kwh"], preis)
    for k in ("reihe", "klima", "klima_vorgabe", "vorhersage", "beginn", "ende", "baseline"):
        aus[k] = e.get(k)
    # BSM-033.04: Tag/Woche/Monat – je Zeitraum dazu die Beträge in €
    aus["perioden"] = {art: [{**z, **{f"{k}_eur": geld(z.get(k), preis) for k in ("ist", "prog", "mit", "unten", "oben", "ohne", "gespart")}}
                             for z in liste] for art, liste in (e.get("perioden") or {}).items()}
    aus["ohne_methode"] = (e.get("ohne") or {}).get("methode") or "schaetzung"   # BSM-033.04: gemessen oder 24/7 geschätzt
    aus["ohne_hinweis"] = ohne_hinweis(aus["ohne_methode"])
    return aus


def monate_summen(reihen_: Sequence[Mapping[str, Any]], preis: float) -> list[dict[str, float]]:
    """Je Container über alle Monate: kWh, € und Anteil in % am Verbrauch aller Container (alle 0 → 0 %)."""
    kwh = [summe(r["v"]) for r in reihen_]
    ges = summe(kwh)
    return [{"kwh": k, "eur": k * preis, "anteil": k / ges * 100 if ges else 0.0} for k in kwh]


def csv_text(zeilen: Sequence[str]) -> str:
    """CSV-Datei wie die Seite sie speichert: BOM (Excel erkennt UTF-8), Zeilen mit CRLF, keine Zeilenumschaltung am Ende."""
    return "\ufeff" + "\r\n".join(zeilen)


def csv_monate(titel: str, preis: float, daten: Mapping[str, Any]) -> list[str]:
    """Verbrauch je Monat und Container als CSV (Detailseite einer Baustelle)."""
    zeilen = [_zeile(["Monat", "Baustelle", "Container", "kWh", "Kosten €"])]
    for r in daten["reihen"]:
        for i, v in enumerate(r["v"]):
            zeilen.append(_zeile([daten["labels"][i], titel, r["name"], fest(v, 2), fest(v * preis, 2)]))
    return zeilen


# ------------------------------------------------------------------ Ölradiator oder Konvektor


def typ_vergleich(
    bereiche: Sequence[Mapping[str, Any]],
    zaehler: Mapping[str, Any],
    energie: Mapping[str, float | None],
    heizzeit: Mapping[str, float | None],
    heiztage: float,
    preis: float,
) -> dict[str, Any]:
    """Je Typ kWh je Heizstunde, Aufheiz- und Abkühlrate (°C/h, Mittel der Container), Kosten je Heiztag; dazu `weniger`
    = um wie viel % der Ölradiator weniger je Heizstunde braucht als der Konvektor (gerundet, None ohne Werte).

    `bereiche`: `[{"id", "geraete": [{"rolle", "typ"}]}]`; `energie`/`heizzeit`: Summe je Typ (kWh bzw. h).
    """
    def rate(typ: str, art: str) -> float | None:
        werte = [
            zaehler[f"{art}:{b['id']}"] for b in bereiche
            if any(g.get("rolle") in HEIZER and (g.get("typ") or "oelradiator") == typ for g in b["geraete"])
            and ist_zahl(zaehler.get(f"{art}:{b['id']}"))
        ]
        return summe(werte) / len(werte) if werte else None

    ergebnis: dict[str, Any] = {}
    for typ in ("oelradiator", "konvektor"):
        en, hz = energie.get(typ), heizzeit.get(typ)
        ergebnis[typ] = {
            "kwh_h": en / hz if en is not None and hz else None,
            "auf": rate(typ, "aufheiz"),
            "ab": rate(typ, "abkuehl"),
            "tag": en / heiztage * preis if en is not None and heiztage else None,
        }
    o, k = ergebnis["oelradiator"]["kwh_h"], ergebnis["konvektor"]["kwh_h"]
    ergebnis["weniger"] = js_runden((1 - o / k) * 100) if o is not None and k is not None and k > 0 else None
    return ergebnis


VGL_MIN_GRADH = 20.0   # ab so vielen Gradstunden zählt ein Container im Vergleich


def typ_vergleich_fair(container: Sequence[Mapping[str, Any]]) -> dict[str, Any]:
    """Ölradiator oder Konvektor – fair verglichen (AN-0008, Herbert 01.10.2026).

    Gezählt werden nur Zeiten, in denen ein Container mit Fühler im Modus Thermostat geregelt wurde (Zähler `vgl_*`),
    und nur Container mit einem einzigen Heizkörper-Typ (gemischte zählen für keinen). Kennzahl ist kWh je Gradstunde
    (Strom je Stunde und °C, um den es drinnen wärmer ist als draußen), dazu Aufheiz- und Abkühlrate und – für
    verschieden große Container – kWh je Gradstunde und m² (AN-0014; ohne Größe ein Einzelcontainer).

    `container`: `[{"id", "name", "typen": [..], "fuehler": bool, "modus", "kwh", "gradh", "auf", "ab"[, "m2"]}]`.
    """
    zaehlen: dict[str, list[Mapping[str, Any]]] = {"oelradiator": [], "konvektor": []}
    ausgeschlossen: list[dict[str, str]] = []
    for c in container:
        typen = sorted(set(c.get("typen") or []))
        if not typen:
            continue
        if len(typen) > 1:
            grund = "Ölradiator und Konvektor gemischt"
        elif not c.get("fuehler"):
            grund = "ohne Fühler"
        elif not (ist_zahl(c.get("gradh")) and float(c["gradh"]) >= VGL_MIN_GRADH):
            grund = "noch zu wenig im Modus Thermostat gemessen" if c.get("modus") == "thermo" else "nicht im Modus Thermostat"
        else:
            zaehlen.setdefault(typen[0], []).append(c)
            continue
        ausgeschlossen.append({"name": str(c.get("name") or c.get("id")), "grund": grund})

    def mittel_von(liste: Sequence[Mapping[str, Any]], k: str) -> float | None:
        werte = [float(c[k]) for c in liste if ist_zahl(c.get(k))]
        return summe(werte) / len(werte) if werte else None

    ergebnis: dict[str, Any] = {}
    for typ in ("oelradiator", "konvektor"):
        liste = zaehlen.get(typ, [])
        gradh = summe(float(c["gradh"]) for c in liste)
        kwh = summe(float(c["kwh"]) for c in liste if ist_zahl(c.get("kwh")))
        gradh_m2 = summe(float(c["gradh"]) * groesse.flaeche(c.get("m2")) for c in liste)
        ergebnis[typ] = {"kwh_gradh": kwh / gradh if gradh else None, "kwh_gradh_m2": kwh / gradh_m2 if gradh_m2 else None, "auf": mittel_von(liste, "auf"),
                         "ab": mittel_von(liste, "ab"), "container": [str(c.get("name") or c.get("id")) for c in liste],
                         "ids": [str(c.get("id")) for c in liste]}
    o, k = ergebnis["oelradiator"]["kwh_gradh"], ergebnis["konvektor"]["kwh_gradh"]
    ergebnis["weniger"] = js_runden((1 - o / k) * 100) if o is not None and k is not None and k > 0 else None
    ergebnis["vergleichbar"] = o is not None and k is not None
    ergebnis["ausgeschlossen"] = ausgeschlossen
    return ergebnis


# ------------------------------------------------------------------ Wetter-Einfluss

WETTER_TAGE = 30
WETTER_MIN_TAGE = 5


def typ_ersparnis(oel: Sequence[float], typ: Mapping[str, Any], preis: float) -> dict[str, Any] | None:
    """Was die Ölradiatoren gegenüber Konvektoren gespart haben (AN-0008): ihr tatsächlicher Verbrauch je Periode und
    derselbe Verbrauch mal dem Faktor Konvektor ÷ Ölradiator (kWh je Gradstunde) – „mit Konvektoren“. None, solange
    der faire Vergleich fehlt."""
    o, k = typ["oelradiator"]["kwh_gradh"], typ["konvektor"]["kwh_gradh"]
    if not typ.get("vergleichbar") or not o or k is None:
        return None
    faktor = k / o
    waere = [round(v * faktor, 3) for v in oel]
    erspart = summe(waere) - summe(oel)
    return {"faktor": faktor, "oel": [round(v, 3) for v in oel], "konvektor": waere, "oel_kwh": summe(oel),
            "konvektor_kwh": summe(waere), "erspart_kwh": erspart, "erspart_eur": erspart * preis}


def wetter_aus_signatur(sig: Mapping[str, Any] | None, preis: float) -> dict[str, Any]:
    """Wetter-Einfluss aus der Energiesignatur der Baustelle (BSM-033, ersetzt die einfache Gerade): Punkte der gezählten Tage
    und – sobald die Signatur gut oder brauchbar ist – der schräge Teil als Gerade `kWh = k · außen + d0` mit `null0` =
    Heizgrenze (darüber Grundlast), `eur_je_grad` = Mehrkosten am Tag je Grad kälter. Lernt sie noch: `gerade` None."""
    s = sig or {}
    gerade = None
    if s.get("stand") in ("gut", "brauchbar") and ist_zahl(s.get("kwh_je_grad")) and ist_zahl(s.get("grundlast")):
        j, ref = float(s["kwh_je_grad"]), s.get("grenze") if ist_zahl(s.get("grenze")) else s.get("bezug")
        gerade = {"k": -j, "d0": float(s["grundlast"]) + j * float(ref or 0.0), "null0": s.get("grenze"),
                  "grenze": s.get("grenze"), "eur_je_grad": j * preis}
    return {"punkte": s.get("punkte") or [], "gerade": gerade, "stand": s.get("stand"), "tage": s.get("tage")}


# ------------------------------------------------------------------ Je Gerät

MITTEL_MIN_W = 50


def je_geraet(
    geraete: Sequence[Mapping[str, Any]],
    zaehler: Mapping[str, Any],
    statistik: Statistik,
    pumpzeit: Mapping[str, Sequence[float | None]],
) -> list[dict[str, Any]]:
    """Je Gerät Ø kW im Betrieb (Zähler `mittel:<id>`, ab 50 W), kWh im Zeitraum (Energiezähler), Stunden.

    Stunden sind bei Pumpen die gemessene Pumpzeit, sonst eine Schätzung kWh ÷ Ø kW (docs/bauplan-module.md §5).
    `geraete`: `[{"id", "bereich", "rolle", "energie"}]`; `statistik`: Änderung je Energiezähler; `pumpzeit[id]`: Stunden
    je Periode.
    """
    zeilen = []
    for g in geraete:
        mw = zaehler.get(f"mittel:{g['id']}")
        mittel = float(mw) / 1000 if ist_zahl(mw) and float(mw) > MITTEL_MIN_W else None
        punkte = statistik.get(g["energie"]) if g.get("energie") else None
        kwh = summe(p.get("change") for p in punkte) if punkte is not None else None
        if g.get("rolle") == "pumpe":
            std = summe(pumpzeit[g["id"]]) if g["id"] in pumpzeit else None
        else:
            std = kwh / mittel if kwh is not None and mittel is not None else None
        zeilen.append({"bereich": g["bereich"], "geraet": g["id"], "mittel": mittel, "kwh": kwh, "std": std})
    return zeilen


# ---------------------------------------------------------------- Rangliste und Erkenntnisse (WU-0005, Auswertung 6)
ERKENNTNIS_AB_PROZENT = 15      # so viel mehr/weniger als der Zeitraum davor ist eine Erkenntnis wert
TYP_AB_PROZENT = 5              # Ölradiator/Konvektor: ab so viel Unterschied
SPARSAM_AB_H = 1.0              # kWh je Heizstunde erst ab so viel Heizzeit vergleichen
ERKENNTNISSE_MAX = 5


def rangliste(container: Iterable[Mapping[str, Any]], preis: float) -> list[dict[str, Any]]:
    """Container nach Verbrauch: `container` = [{bereich, name, kwh, heizzeit[, baustelle, m2]}] → dazu €, kWh je
    Heizstunde (ohne Heizzeit None), kWh je m² (AN-0014; ohne Größe ein Einzelcontainer) und Anteil in % an allen;
    absteigend nach kWh, bei Gleichstand nach Name."""
    liste = [dict(c) for c in container]
    ges = sum(float(c.get("kwh") or 0) for c in liste)
    for c in liste:
        kwh, h = float(c.get("kwh") or 0), float(c.get("heizzeit") or 0)
        c.update(kwh=kwh, heizzeit=h, eur=geld(kwh, preis), kwh_h=kwh / h if h > 0 else None,
                 anteil=kwh / ges * 100 if ges > 0 else 0.0, kwh_m2=groesse.je_m2(kwh, c.get("m2")))
    return sorted(liste, key=lambda c: (-c["kwh"], str(c.get("name") or "")))


def erkenntnisse(
    rang: Sequence[Mapping[str, Any]], *, ohne: Mapping[str, float] | None, gerade: Mapping[str, Any] | None,
    veraenderung_kwh: int | None, typ_weniger: float | None,
) -> list[dict[str, Any]]:
    """Was fällt auf – höchstens `ERKENNTNISSE_MAX`, in dieser Reihenfolge: gespart gegenüber Dauerbetrieb, größter
    Verbraucher (ab zwei Containern mit Verbrauch), sparsamster Container (kWh je Heizstunde, ab zwei Containern mit
    mindestens `SPARSAM_AB_H` h, nicht der größte), Wetter je Grad kälter, deutlich mehr/weniger als davor, Ölradiator
    gegen Konvektor. Nur Daten – den Text macht die Seite."""
    liste: list[dict[str, Any]] = []
    if ohne and ohne.get("gespart_eur", 0) > 0:
        liste.append({"art": "gespart", "eur": ohne["gespart_eur"], "prozent": ohne.get("prozent"), "hinweis": ohne.get("hinweis")})
    mit = [c for c in rang if c["kwh"] > 0]
    if len(mit) >= 2:
        g = mit[0]
        liste.append({"art": "groesster", "bereich": g.get("bereich"), "name": g.get("name"), "kwh": g["kwh"], "anteil": g["anteil"]})
        vgl = [c for c in mit if c["heizzeit"] >= SPARSAM_AB_H and c["kwh_h"] is not None]
        if len(vgl) >= 2:
            s = min(vgl, key=lambda c: c["kwh_h"])
            if s is not g:
                liste.append({"art": "sparsamster", "bereich": s.get("bereich"), "name": s.get("name"), "kwh_h": s["kwh_h"]})
    if gerade and gerade.get("k") is not None and gerade["k"] < 0:
        liste.append({"art": "wetter", "kwh_je_grad": -gerade["k"], "eur_je_grad": gerade.get("eur_je_grad"), "null0": gerade.get("null0")})
    if veraenderung_kwh is not None and abs(veraenderung_kwh) >= ERKENNTNIS_AB_PROZENT:
        liste.append({"art": "mehr" if veraenderung_kwh > 0 else "weniger", "prozent": abs(veraenderung_kwh)})
    if typ_weniger is not None and abs(typ_weniger) >= TYP_AB_PROZENT:
        liste.append({"art": "typ", "weniger": typ_weniger})
    return liste[:ERKENNTNISSE_MAX]
