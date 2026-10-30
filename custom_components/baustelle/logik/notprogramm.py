"""Programm für das Notprogramm in den Plugs – reine Fachlogik ohne Home-Assistant-Code (Bauplan 0.7 §9, BSM-017).

Das Skript im Plug (`shelly/notprogramm.js`) rechnet keine Fachregeln, es führt nur die Tabelle aus, die HA hier baut:
`bs_cfg` (Modus, Toleranz, Frostgrenzen, Nummern der Messwerte, Tür-Pause, Stand) und `bs_p0…bs_p6` (Fenster
„start,ende,soll;…“ in Unix-Sekunden, ein Schlüssel je Wochentag des Beginns).

Abbildung der Regelung (logik/regelung) auf das Skript:
- Automatik aus, Container auf Hand oder Gerät auf Hand → `hand` (nicht anfassen); Frostschutz nur mit „Frostschutz
  auch ohne Automatik“. Gerät inaktiv → `aus` ohne Frostschutz (die Automatik lässt es aus).
- Modus aus → `aus` (nur Frostschutz); Bei Bedarf → `bedarf` (Fenster = Termine mit Vorheizen und laufende
  Anforderung); Thermostat mit Fühler am Plug → `thermo`, sonst `plan` (in der Heizzeit an).
- Frei (Urlaub, freier Feiertag): kein Fenster; mit „absenken“ und Thermostat den ganzen Tag auf `absenk`.
- Vereinfachungen im Notbetrieb: keine Heizgrenze, kein Lernen (Hysterese statt TPI), keine Zusatzstufe, Frostschutz
  auch bei „frei: alles aus“ (Rückfallebene – lieber warm als eingefroren).
- Fenster werden auf `RASTER_MIN` nach außen gerundet (Beginn früher, Ende später), damit „Warm ab“, das sich mit der
  Temperatur verschiebt, nicht alle paar Minuten neu in den Plug geschrieben werden muss (Flash).
"""

from __future__ import annotations

from collections.abc import Iterable, Mapping
from dataclasses import dataclass
from datetime import datetime, timedelta
import json
import zlib

from .arbeitszeit import Plan
from .regelung import frost_aus_wert

MAX_WERT = 253        # längster KVS-Wert am Plug S Gen3 (BSM-013)
RASTER_MIN = 15
TAGE = 7
LEER = "-"            # leerer Tag (das Skript überspringt Teile ohne drei Zahlen)

Fenster = tuple[int, int, float]   # Unix-Sekunden von, bis, Soll


@dataclass(frozen=True)
class Vorgaben:
    """Was für einen Plug gilt (Einstellungen der Baustelle und des Containers, Lage des Geräts)."""

    automatik: bool
    auto: bool
    hand: bool
    aktiv: bool
    modus: str
    bedarf: bool
    toleranz: float
    frost: bool
    frost_grenze: float
    frost_aus: float | None
    frost_immer: bool
    tuer_pause_min: int
    temp_nr: int | None
    tuer_nrn: tuple[int, ...] = ()   # Messwerte aller Türen und Fenster am Plug (BSM-034.03)


def modus(v: Vorgaben) -> str:
    """Modus im Skript: plan | thermo | bedarf | hand | aus."""
    if not v.aktiv:
        return "aus"
    if not v.automatik or not v.auto or v.hand:
        return "hand"
    if v.modus == "aus":
        return "aus"
    if v.bedarf or v.modus == "bedarf":
        return "bedarf"
    return "thermo" if v.modus == "thermo" and v.temp_nr is not None else "plan"


def frost(v: Vorgaben) -> tuple[float | None, float | None]:
    """Frostschutz ein unter / aus über (°C); (None, None) = kein Frostschutz im Plug."""
    if not v.aktiv or not v.frost or (not v.automatik and not v.frost_immer):
        return None, None
    return v.frost_grenze, frost_aus_wert(v.frost_grenze, v.frost_aus)


def minuten_fenster(plan: Plan | None) -> list[tuple[int, int]]:
    """Heizzeiten eines Tagesplans als zusammenhängende Fenster in Minuten (Abschnitte zusammengelegt)."""
    if plan is None:
        return []
    raus: list[tuple[int, int]] = []
    for von, bis, _ in plan.abschnitte():
        if raus and von <= raus[-1][1]:
            raus[-1] = (raus[-1][0], max(raus[-1][1], bis))
        else:
            raus.append((von, bis))
    return raus


def runden(f: Fenster) -> Fenster:
    """Beginn auf das Raster abrunden, Ende aufrunden."""
    r = RASTER_MIN * 60
    return (f[0] // r * r, -(-f[1] // r) * r, round(f[2], 1))


def zusammenfassen(fenster: Iterable[Fenster]) -> list[Fenster]:
    """Gerundet, nach Beginn sortiert; überlappende oder anstoßende Fenster mit gleichem Soll zu einem."""
    raus: list[Fenster] = []
    for f in sorted(runden(f) for f in fenster if f[1] > f[0]):
        if raus and f[0] <= raus[-1][1] and f[2] == raus[-1][2]:
            raus[-1] = (raus[-1][0], max(raus[-1][1], f[1]), f[2])
        else:
            raus.append(f)
    return raus


def _text(fenster: list[Fenster]) -> str:
    return ";".join(f"{s},{e},{soll:g}" for s, e, soll in fenster) or LEER


def tag_wert(fenster: list[Fenster]) -> str:
    """Wert eines Tages; zu lang → die Fenster mit der kleinsten Lücke verbinden (heizt eher mehr), bis er passt."""
    f = list(fenster)
    while len(_text(f)) > MAX_WERT and len(f) > 1:
        i = min(range(len(f) - 1), key=lambda k: f[k + 1][0] - f[k][1])
        f[i:i + 2] = [(f[i][0], max(f[i][1], f[i + 1][1]), max(f[i][2], f[i + 1][2]))]
    return _text(f)


def programm(v: Vorgaben, fenster: Iterable[Fenster], wochentag: Mapping[int, int], jetzt: int) -> dict[str, str]:
    """KVS-Werte für einen Plug: `bs_cfg` und `bs_p0…bs_p6`.

    `fenster`: alle Heizfenster der nächsten Tage (Unix-Sekunden, Soll); `wochentag`: Beginn eines Tages (Unix-Sekunden,
    lokale Mitternacht) → Wochentag 0–6, für die Tage, die das Programm abdeckt. Vergangene Fenster fallen weg; ein Fenster
    zählt zu dem Tag, an dem es beginnt (begann es vor heute, zu heute).
    """
    tage = sorted(wochentag)
    je_tag: dict[int, list[Fenster]] = {wochentag[t]: [] for t in tage}
    for f in zusammenfassen(fenster):
        if f[1] <= jetzt:
            continue
        beginn = max((t for t in tage if t <= f[0]), default=tage[0])
        je_tag[wochentag[beginn]].append(f)
    fe, fa = frost(v)
    werte = {f"bs_p{w}": tag_wert(je_tag.get(w, [])) for w in range(TAGE)}
    cfg: dict[str, object] = {"m": modus(v), "tol": v.toleranz, "fe": fe, "fa": fa, "t": v.temp_nr, "d": list(v.tuer_nrn) or None,
                              "tp": v.tuer_pause_min}
    stand = zlib.crc32(json.dumps([cfg, werte], sort_keys=True).encode()) % 100000
    werte["bs_cfg"] = json.dumps({"v": stand, **cfg}, separators=(",", ":"))
    return werte


def gueltig_bis(werte: Mapping[str, str]) -> int | None:
    """Ende des letzten Fensters im Programm (Unix-Sekunden) – so lange heizt der Plug ohne HA nach Plan; None ohne Fenster."""
    enden = [int(teil.split(",")[1]) for k, w in werte.items() if k.startswith("bs_p") and w != LEER
             for teil in w.split(";") if teil.count(",") == 2]
    return max(enden, default=None)


def stand(werte: Mapping[str, str]) -> int | None:
    """Stand (`v`) eines Programms – das Skript nennt ihn in der Antwort auf das Lebenszeichen."""
    try:
        return int(json.loads(werte["bs_cfg"])["v"])
    except (KeyError, ValueError, TypeError):
        return None


# ---------------------------------------------------------------------- Kopplungen am Plug (BSM-030)
# Messwerte je Rolle (BTHome-Objekte) und ihr Namensteil nach Herberts Schema (`<Gerät>_<Messwert>`)
OBJEKTE = {"fuehler": (1, 46, 69), "tuer": (1, 45, 63, 100)}
MESSWERT = {1: "Batterie", 30: "Licht", 45: "Tuer", 46: "Feuchte", 63: "Drehung", 69: "Temperatur", 100: "Lichtstufe"}


@dataclass(frozen=True)
class Kopplung:
    """Ein Schritt am Plug: `art` geraet_weg | sensor_weg | geraet_neu | sensor_neu | geraet_name | sensor_name."""

    art: str
    adresse: str
    nr: int | None = None        # Komponenten-Nummer (bthomedevice:<nr> bzw. bthomesensor:<nr>)
    obj: int | None = None
    name: str | None = None


LEBENSZEICHEN_FRISCH = timedelta(minutes=5)   # Audit 0.8.165


def haengt(geschaltet: datetime | None, jetzt: datetime) -> bool:
    """Hängt die Steuerung? Hat sie seit `LEBENSZEICHEN_FRISCH` nicht mehr durchgeschaltet (Audit 0.8.165), bekommen die
    Plugs kein Lebenszeichen mehr – ihr Notprogramm übernimmt nach `HB_MAX_MIN`, statt passiv zu bleiben."""
    return geschaltet is None or jetzt - geschaltet > LEBENSZEICHEN_FRISCH


def verwaist(bekannt: Mapping[str, str], aktuell: Mapping[str, str], fremd: Iterable[str]) -> tuple[list[str], list[str]]:
    """Plugs mit Skript, die keine Heizkörper dieser Baustelle mehr sind (BSM-034.01, Bauplan Geräte §3 Fehler 1).

    `bekannt` = Gerät → Schalter aller Plugs, die das Skript bekommen haben; `aktuell` = dasselbe für die Heizkörper-Plugs
    jetzt; `fremd` = Schalter anderer aktiver Baustellen. Ergebnis (abschalten, vergessen): Ein entfernter oder auf eine
    andere Rolle umgestellter Plug wird abgeschaltet, sonst ginge er mit dem alten Programm in Notbetrieb. Steckt derselbe
    Schalter wieder als Heizkörper hier (neuer Unter-Eintrag) oder in einer anderen Baustelle, ist deren Runde zuständig:
    nur vergessen. Statt Schaltern dürfen es Geräte sein (Audit 0.8.165: ein Plug kann mehrere Schalter haben).
    """
    hier, andere = set(aktuell.values()), set(fremd)
    abschalten: list[str] = []
    vergessen: list[str] = []
    for gid, schalter in bekannt.items():
        if gid in aktuell:
            continue
        (vergessen if schalter in hier or schalter in andere else abschalten).append(gid)
    return abschalten, vergessen


def kopplungen(gewollt: Mapping[str, tuple[str, str]], geraete: Mapping[str, tuple[int, str | None]],
               sensoren: Mapping[tuple[str, int], tuple[int, str | None]]) -> list[Kopplung]:
    """Was am Plug zu tun ist, damit genau die Sensoren des Containers gekoppelt und richtig benannt sind.

    `gewollt`: Bluetooth-Adresse → (Gerätename in HA, Rolle `fuehler`|`tuer`); `geraete`: gekoppelte Geräte am Plug
    (Adresse → Nummer, Name); `sensoren`: gekoppelte Messwerte ((Adresse, Objekt) → Nummer, Name). Adressen klein.
    Fremde Geräte samt Messwerten kommen weg; bei gewollten bleiben zusätzliche Messwerte (z. B. Licht am Display),
    sie werden nur benannt. Reihenfolge: erst entfernen, dann anlegen, dann benennen.
    """
    weg = [Kopplung("sensor_weg", a, nr) for (a, _), (nr, _) in sorted(sensoren.items()) if a not in gewollt]
    weg += [Kopplung("geraet_weg", a, nr) for a, (nr, _) in sorted(geraete.items()) if a not in gewollt]
    neu: list[Kopplung] = []
    namen: list[Kopplung] = []
    for a, (name, rolle) in sorted(gewollt.items()):
        if a not in geraete:
            neu.append(Kopplung("geraet_neu", a, name=name))
        elif geraete[a][1] != name:
            namen.append(Kopplung("geraet_name", a, geraete[a][0], name=name))
        for obj in OBJEKTE[rolle]:
            if (a, obj) not in sensoren:
                neu.append(Kopplung("sensor_neu", a, obj=obj, name=f"{name}_{MESSWERT[obj]}"))
        for (sa, obj), (nr, alt) in sorted(sensoren.items()):
            if sa == a and obj in MESSWERT and alt != f"{name}_{MESSWERT[obj]}":
                namen.append(Kopplung("sensor_name", a, nr, obj, f"{name}_{MESSWERT[obj]}"))
    return weg + neu + namen


# ---------------------------------------------------------------------- Stundenbuch nach einem Ausfall (BSM-020)
@dataclass(frozen=True)
class BuchStunde:
    """Eine Stunde aus dem Stundenbuch des Plugs (`bb_<n>` = „stunde,wh,min_ein,temp*10,tuer_s;…“)."""

    stunde: int                 # Unix-Stunde (Sekunden / 3600)
    wh: float
    min_ein: int
    temperatur: float | None
    tuer_s: int


def buch_lesen(werte: Mapping[str, str]) -> list[BuchStunde]:
    """Alle Stunden aus den `bb_*`-Werten, nach Zeit sortiert; kaputte Teile fallen weg, doppelte Stunden: die letzte."""
    stunden: dict[int, BuchStunde] = {}
    for k, w in werte.items():
        if not k.startswith("bb_") or not w:
            continue
        for teil in w.split(";"):
            x = teil.split(",")
            try:
                stunden[int(x[0])] = BuchStunde(int(x[0]), max(0.0, float(x[1])), max(0, int(x[2])),
                                                float(x[3]) / 10 if x[3] else None, max(0, int(x[4])))
            except (IndexError, ValueError):
                continue
    return [stunden[h] for h in sorted(stunden)]


def im_ausfall(buch: Iterable[BuchStunde], von: int, bis: int) -> list[BuchStunde]:
    """Die Stunden, die in den Notbetrieb von `von` bis `bis` (Unix-Sekunden) fallen."""
    return [s for s in buch if s.stunde * 3600 < bis and (s.stunde + 1) * 3600 > von]
