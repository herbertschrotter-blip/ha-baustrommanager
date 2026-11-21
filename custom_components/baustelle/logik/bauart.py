"""Hochrechnung je Bauart (0.8.176, Herbert 20.11.2026, Bauplan Hochrechnung §4a) – ohne HA-Code.

Baucontainer sind gleich gebaut; sie unterscheiden sich nur in **Einzel oder Doppel** und im **Heizkörper-Typ**
(Ölradiator, Konvektor). Die Messung bestätigt das (002 und 003, beide Einzel mit Konvektor: 7,6 und 7,5 kWh je Heiztag;
der Doppelcontainer 001 bei Kälte das 1,9-fache). Darum lernt die Hochrechnung **je Bauart gemeinsam**:

- **Bauart** (`bauart`) = Heizkörper-Typ × Größe (`groesse`: Doppel, wenn das Symbol „doppel“ zeigt oder die Fläche die
  eines Doppelcontainers ist; eine freie Fläche ist eine Bauart für sich); ein Container ohne Heizkörper ist eine Bauart
  für sich (nichts zu teilen).
- **Je Einheit** (`einheiten`): ein Doppelcontainer zählt 2 Einheiten, ein Einzelcontainer 1. Die Tage aller Container
  einer Bauart gehen je Einheit (kWh ÷ Einheiten) in **eine** Energiesignatur bzw. einen Wert kWh je Heizgradtag
  (`modelle`). Hat eine Bauart noch keine Tage, nimmt sie je Einheit kWh je Heizgradtag der anderen Bauarten desselben
  Heizkörper-Typs, sonst aller mit Heizkörper („ersatz“).
- **Anlauftage** (`anlauf`): die ersten `ANLAUF_TAGE` Heiztage mit Verbrauch eines Containers in der Heizperiode zählen
  nicht (vor allen anderen Filtern bestimmt – ein Baseline- oder Ausfalltag am Anfang verschiebt sie nicht) – ein ausgekühlter, feuchter Container braucht beim ersten Aufheizen deutlich mehr (003: 18 statt 8 kWh).
- **Faktor je Container** (`faktor`): sein Verbrauch gegen das Modell seiner Bauart an seinen eigenen Tagen, zur 1 hin
  gedämpft (`DAEMPFUNG_TAGE`). Die Hochrechnung des Containers = Modell × Einheiten × Faktor. Allein in seiner Bauart
  ergibt das genau die eigene Signatur (kleinste Quadrate: Summe der Abweichungen 0).
- **Hinweis** (`abweichung`): weicht ein Container mit mindestens `HINWEIS_MIN_TAGE` eigenen Tagen um mindestens
  `HINWEIS_ANTEIL` von den anderen seiner Bauart ab (offene Tür, Dichtung, falsche Leistung), steht das unter „Was fällt
  auf“ – nur, wenn die anderen zusammen ebenfalls mindestens `HINWEIS_MIN_TAGE` Tage haben.
- **Faktor in %** (`faktor_prozent`) für die Anzeige: erst ab `FAKTOR_ZEIGEN_AB` Abweichung.
- **„Ohne Automatik“ je Bauart** (`ohne_modelle`, 0.8.180, Herbert 21.11.2026: „nicht jeden Container einzeln messen“):
  die Baseline-Tage aller Container einer Bauart gehen je Einheit in **eine** Signatur „ohne“. Jeder Container der
  Bauart rechnet damit × Einheiten × seinem Faktor (aus „mit Automatik“ – derselbe Container verliert mit und ohne
  Automatik gleich viel Wärme). Gemessen wird je Bauart, nicht je Container (`logik/baseline`).
"""

from __future__ import annotations

from collections.abc import Collection, Mapping, Sequence
from dataclasses import dataclass, replace
from datetime import date

from .groesse import art as groesse_art
from .hochrechnung import TagRoh, hgt, kwh_je_hgt
from .signatur import Signatur, Tag, berechnen, erwartet

EINZEL, DOPPEL, FREI = "einzel", "doppel", "frei"
FAKTOR_ZEIGEN_AB = 0.05   # Faktor erst ab dieser Abweichung von 1 anzeigen
ANLAUF_TAGE = 2           # erste Heiztage eines Containers zählen nicht (erstes Aufheizen)
DAEMPFUNG_TAGE = 5        # so viele Tage „Faktor 1“ kommen beim Faktor dazu (wenige eigene Tage → nahe 1)
HINWEIS_ANTEIL = 0.20     # ab dieser Abweichung von den anderen der Bauart ein Hinweis
HINWEIS_MIN_TAGE = 7      # … mit so vielen eigenen Tagen


def groesse(symbol_doppel: bool, m2: float | None) -> str:
    """Einzel, Doppel oder frei: Doppel, wenn das Symbol es zeigt oder die Fläche die eines Doppelcontainers ist."""
    a = groesse_art(m2)
    return DOPPEL if symbol_doppel or a == DOPPEL else FREI if a == FREI else EINZEL


def bauart(typ: str, groesse_: str, bid: str) -> str:
    """Schlüssel der Bauart; ohne Heizkörper (Typ leer) oder mit freier Fläche je Container eine eigene."""
    if not typ:
        return f":{bid}"
    return f"{typ}:{FREI}:{bid}" if groesse_ == FREI else f"{typ}:{groesse_}"


def einheiten(groesse_: str) -> int:
    return 2 if groesse_ == DOPPEL else 1


def anlauf(roh: Sequence[TagRoh], heiztage: Collection[date] | None, n: int = ANLAUF_TAGE) -> frozenset[date]:
    """Die ersten `n` Heiztage mit Verbrauch des Containers (nach Datum, vor allen anderen Filtern)."""
    tage = sorted(t.datum for t in roh if (t.kwh or 0.0) > 0 and (heiztage is None or t.datum in heiztage))
    return frozenset(tage[:n])


def je_einheit(tage: Sequence[TagRoh], n: int) -> list[TagRoh]:
    return [replace(t, kwh=(t.kwh or 0.0) / n) for t in tage]


@dataclass(frozen=True)
class Modell:
    """Verbrauch einer Einheit (Einzelcontainer) einer Bauart."""

    bauart: str
    signatur: Signatur              # gemeinsame Signatur je Einheit
    kwh_je_hgt: float | None        # je Einheit (Gradtagverfahren, solange die Signatur lernt)
    schnitt: float | None           # kWh je Tag und Einheit (ohne Heizgradtage)
    quelle: str                     # "bauart" (eigene Tage) | "typ" | "alle" (ersatz) | "keine"
    container: tuple[str, ...]      # Container mit Tagen in der Bauart

    def kwh(self, aussen: float) -> float | None:
        """Erwarteter Verbrauch einer Einheit an einem Tag: Signatur, sonst Gradtage, sonst Tagesschnitt."""
        if (e := erwartet(self.signatur, aussen)) is not None:
            return e
        if self.kwh_je_hgt is not None:
            return self.kwh_je_hgt * hgt(aussen)
        return self.schnitt


def modelle(
    gezaehlt: Mapping[str, Sequence[TagRoh]], arten: Mapping[str, str], typen: Mapping[str, str],
    einh: Mapping[str, int],
) -> dict[str, Modell]:
    """Je Bauart das gemeinsame Modell aus den Tagen ihrer Container (je Einheit, ohne Anlauftage – der Aufrufer gibt
    die gezählten Tage ohne Anlauf)."""
    pool: dict[str, list[TagRoh]] = {}
    mit_tagen: dict[str, list[str]] = {}
    for bid, ts in gezaehlt.items():
        pool.setdefault(arten[bid], []).extend(je_einheit(ts, einh[bid]))
        if ts:
            mit_tagen.setdefault(arten[bid], []).append(bid)
    typ_von = {arten[bid]: typen.get(bid, "") for bid in arten}
    aus: dict[str, Modell] = {}
    for art in set(arten.values()):
        tage = pool.get(art, [])
        sig = berechnen(Tag(t.aussen, t.kwh) for t in tage)   # type: ignore[arg-type]  # tag_zaehlt prüft None
        if tage:
            aus[art] = Modell(art, sig, kwh_je_hgt(tage), sum(t.kwh or 0.0 for t in tage) / len(tage), "bauart",
                              tuple(sorted(mit_tagen.get(art, []))))
            continue
        typ = typ_von[art]
        gleich = [t for a, ts in pool.items() if a != art and typ and typ_von.get(a) == typ for t in ts]
        alle = [t for a, ts in pool.items() if a != art and typ and typ_von.get(a) for t in ts]
        quelle, ers = ("typ", gleich) if gleich else ("alle", alle) if alle else ("keine", [])
        aus[art] = Modell(art, sig, kwh_je_hgt(ers) if ers else None, None, quelle if kwh_je_hgt(ers) is not None else "keine", ())
    return aus


@dataclass(frozen=True)
class Faktor:
    wert: float                # gedämpft – damit rechnet der Container
    roh: float | None          # eigener Verbrauch ÷ Modell an seinen Tagen (None ohne Tage bzw. ohne Modell)
    tage: int                  # eigene Tage


def faktor(eigene: Sequence[TagRoh], modell: Modell, n: int) -> Faktor:
    """Verbrauch des Containers gegen das Modell seiner Bauart × Einheiten, an seinen eigenen Tagen."""
    paare = [(t.kwh or 0.0, modell.kwh(t.aussen)) for t in eigene if t.aussen is not None]
    erw = sum(n * (e or 0.0) for _, e in paare)
    if not paare or erw <= 0 or any(e is None for _, e in paare):
        return Faktor(1.0, None, len(eigene))
    r = sum(k for k, _ in paare) / erw
    k = len(paare)
    return Faktor((k * r + DAEMPFUNG_TAGE) / (k + DAEMPFUNG_TAGE), r, len(eigene))


def abweichung(eigene: Sequence[TagRoh], andere: Sequence[tuple[Sequence[TagRoh], int]], n: int) -> float | None:
    """Mehr (+) oder weniger (−) als die anderen Container derselben Bauart, je Einheit, als Anteil – gemessen an deren
    gemeinsamem Modell, damit Tage bei verschiedener Kälte vergleichbar sind. None mit zu wenig Tagen oder ohne andere."""
    if len(eigene) < HINWEIS_MIN_TAGE or sum(len(ts) for ts, _ in andere) < HINWEIS_MIN_TAGE:
        return None
    vgl = modelle({str(i): ts for i, (ts, _) in enumerate(andere)}, {str(i): "x" for i in range(len(andere))},
                  {str(i): "t" for i in range(len(andere))}, {str(i): m for i, (_, m) in enumerate(andere)})["x"]
    f = faktor(eigene, vgl, n)
    return None if f.roh is None else f.roh - 1.0


def hinweis(wert: float | None) -> bool:
    return wert is not None and abs(wert) >= HINWEIS_ANTEIL


def faktor_prozent(f: float) -> int | None:
    """Faktor als ganze % über (+) bzw. unter (−) der Bauart; None unter `FAKTOR_ZEIGEN_AB`."""
    return round((f - 1) * 100) if abs(f - 1) >= FAKTOR_ZEIGEN_AB else None


def ohne_modelle(
    gemessen: Mapping[str, Sequence[TagRoh]], arten: Mapping[str, str], einh: Mapping[str, int],
) -> dict[str, tuple[Signatur, int]]:
    """Je Bauart die gemeinsame Signatur „ohne Automatik“ je Einheit aus den gezählten Baseline-Tagen ihrer Container
    und die Zahl dieser Tage (Container-Tage: zwei Container am selben Tag sind zwei Tage)."""
    pool: dict[str, list[TagRoh]] = {art: [] for art in set(arten.values())}
    for bid, ts in gemessen.items():
        pool[arten[bid]].extend(je_einheit(ts, einh[bid]))
    return {art: (berechnen(Tag(t.aussen, t.kwh, automatik=False) for t in ts), len(ts))   # type: ignore[arg-type]
            for art, ts in pool.items()}
