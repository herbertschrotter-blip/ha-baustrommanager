"""Regen eines Tages aus Vorhersage und Messung (FE-0026), ohne Home-Assistant-Code.

Der Heizplan verlängert sich bei Regen („Kleidung trocknen“, heute ≥ `trocknen_ab_mm`) und beginnt am Tag danach
früher. Bisher galt für heute der höchste Wert, den eine Vorhersage je genannt hatte: sagte sie morgens 6,8 mm und
mittags nur noch 0,5 mm, blieb es den ganzen Tag bei 6,8 mm – auch gegen eine Messung.

Jetzt:
- **Stündliche Vorhersage:** je Stunde gemerkt. Vergangene Stunden bleiben, wie sie zuletzt vorhergesagt waren (die
  Vorhersage nennt sie nicht mehr, der Regen ist aber gefallen); die laufende und alle kommenden Stunden nimmt die
  neueste Vorhersage. Regen des Tages = Summe der Stunden.
- **Nur Tagesvorhersage:** die neueste gilt.
- **Gemessen** (Regensensor als Tagessumme, Bauplan 0.7 „gemessener Regen geht vor“): der höchste Messwert des Tages
  (`regen_mess`) gilt vor jeder Vorhersage.

**Kleidung trocknen nur nach Regen in der Arbeitszeit (AN-0021, Herbert 29.10.2026):** Regen um 3 Uhr früh oder nach
Feierabend macht keine Kleidung nass. Es zählt nur der Regen in der Arbeitszeit des Tages (`regen_arbeitszeit`), gestuft
(`TrocknenStufe`, Vorgabe ab 2 mm 60 min länger / 15 min früher, ab 5 mm 100 / 30): „länger heute“ nach dem Regen in der
Arbeitszeit heute, „früher morgen“ nach dem von gestern.
"""

from __future__ import annotations

from collections.abc import Iterable, Mapping, Sequence
from dataclasses import dataclass
from datetime import datetime
from typing import Any


def stunden_merken(alt: Mapping[str, float] | None, neu: Mapping[str, float] | None, jetzt: datetime) -> dict[str, float]:
    """Regen je Stunde (ISO-Zeit des Stundenbeginns → mm): vergangene Stunden aus `alt`, ab der laufenden aus `neu`.
    Ohne neue stündliche Vorhersage bleibt `alt`."""
    if neu is None:
        return dict(alt or {})
    ab = jetzt.replace(minute=0, second=0, microsecond=0)
    vorbei = {k: v for k, v in (alt or {}).items() if datetime.fromisoformat(k) < ab}
    kommend = {k: v for k, v in neu.items() if datetime.fromisoformat(k) >= ab}
    return dict(sorted({**vorbei, **kommend}.items()))


def regen_vorhersage(stunden: Mapping[str, float] | None, tag_mm: float | None) -> float | None:
    """Regen des Tages laut Vorhersage: Summe der Stunden, ohne Stunden der Wert der Tagesvorhersage."""
    if stunden:
        return round(sum(stunden.values()), 2)
    return tag_mm


def regen_des_tages(werte: Mapping[str, Any]) -> float | None:
    """Gemessen vor Vorhersage."""
    mess = werte.get("regen_mess")
    return float(mess) if mess is not None else werte.get("regen")


# ------------------------------------------------------------------ AN-0021: Regen in der Arbeitszeit, gestuft


@dataclass(frozen=True)
class TrocknenStufe:
    """Ab `ab_mm` Regen in der Arbeitszeit: heute `laenger_min` länger heizen, am Tag danach `frueher_min` früher."""

    ab_mm: float
    laenger_min: int
    frueher_min: int


VORGABE_STUFEN = (TrocknenStufe(2.0, 60, 15), TrocknenStufe(5.0, 100, 30))
ALTE_VORGABE = (2.0, 45, 15)   # bis 0.8.160: eine Stufe „ab 2 mm 45 min länger, 15 min früher“


def stufen_aus(roh: Iterable[Mapping[str, Any]] | None, ab_mm: float = 2.0, laenger_min: int = 45,
               frueher_min: int = 15) -> tuple[TrocknenStufe, ...]:
    """Stufen aus der Einstellung `trocknen_stufen` (aufsteigend nach mm). Ohne sie gelten die alten Einstellungen
    `trocknen_ab_mm`/`_laenger_min`/`_frueher_min` weiter (kein Datenverlust): unverändert (Vorgabe 2 mm/45/15) → die
    neue Vorgabe; selbst eingestellt → das ist Stufe 1, dazu Stufe 2 der Vorgabe, wenn sie darüber liegt."""
    stufen = []
    for x in roh or []:
        try:
            stufen.append(TrocknenStufe(float(x["ab_mm"]), int(x["laenger_min"]), int(x["frueher_min"])))
        except (KeyError, TypeError, ValueError):
            continue
    if stufen:
        return tuple(sorted(stufen, key=lambda st: st.ab_mm))
    eigen = TrocknenStufe(float(ab_mm), int(laenger_min), int(frueher_min))
    if (eigen.ab_mm, eigen.laenger_min, eigen.frueher_min) == ALTE_VORGABE:
        return VORGABE_STUFEN
    zwei = VORGABE_STUFEN[-1]
    hoeher = zwei.ab_mm > eigen.ab_mm and zwei.laenger_min >= eigen.laenger_min and zwei.frueher_min >= eigen.frueher_min
    return (eigen, zwei) if hoeher else (eigen,)


def stufe(mm: float | None, stufen: Sequence[TrocknenStufe]) -> TrocknenStufe | None:
    """Die höchste Stufe, deren Grenze `mm` erreicht; ohne Wert oder unter der ersten keine."""
    if mm is None:
        return None
    treffer = [s for s in stufen if mm >= s.ab_mm]
    return max(treffer, key=lambda s: s.ab_mm) if treffer else None


def regen_arbeitszeit(
    stunden: Mapping[str, float] | None, a: int, b: int, tag_mm: float | None = None,
    mess_beginn: float | None = None, mess_ende: float | None = None,
) -> float | None:
    """Regen (mm) in der Arbeitszeit `[a, b)` (Minuten des Tages).

    - **Regensensor** (Tageszähler): Stand bei Arbeitsbeginn gemerkt (`mess_beginn`) → Differenz bis zum Stand bei
      Arbeitsende bzw. jetzt (`mess_ende`).
    - **Stündliche Vorhersage** (`stunden`, wie `stunden_merken` – vergangene wie gemerkt, kommende laut Vorhersage):
      die Stunden in der Arbeitszeit, eine angebrochene anteilig.
    - **Nur Tagesvorhersage:** die Tagessumme (`tag_mm`) – sie sagt nicht, wann es regnet.
    """
    if b <= a:
        return 0.0
    if mess_beginn is not None and mess_ende is not None:
        return round(max(0.0, mess_ende - mess_beginn), 2)
    if stunden:
        mm = 0.0
        for k, v in stunden.items():
            zeit = datetime.fromisoformat(k)
            von = zeit.hour * 60 + zeit.minute
            teil = max(0, min(b, von + 60) - max(a, von)) / 60
            mm += float(v) * teil
        return round(mm, 2)
    return tag_mm


def _mm(v: float) -> str:
    return (f"{v:.1f}" if v % 1 else f"{v:.0f}").replace(".", ",")


def trocknen_anzeige(heute_mm: float | None, gestern_mm: float | None, stufen: Sequence[TrocknenStufe]) -> dict[str, Any]:
    """Für die Seite und das Protokoll (AN-0021): Regen in der Arbeitszeit heute und gestern, was daraus folgt (heute
    länger, morgen früher, heute früher) und der Text, z. B. „3,5 mm Regen in der Arbeitszeit heute → 60 min länger,
    morgen 15 min früher“."""
    h, g = stufe(heute_mm, stufen), stufe(gestern_mm, stufen)
    if heute_mm is None:
        text = "kein Regenwert für die Arbeitszeit"
    elif h is not None:
        text = f"{_mm(heute_mm)} mm Regen in der Arbeitszeit heute → {h.laenger_min} min länger, morgen {h.frueher_min} min früher"
    else:
        text = f"{_mm(heute_mm)} mm Regen in der Arbeitszeit heute (ab {_mm(stufen[0].ab_mm) if stufen else '–'} mm) → nicht nötig"
    if g is not None and gestern_mm is not None:
        text += f" · gestern {_mm(gestern_mm)} mm → heute {g.frueher_min} min früher"
    return {
        "heute_mm": heute_mm, "gestern_mm": gestern_mm, "laenger_min": h.laenger_min if h else 0,
        "frueher_morgen_min": h.frueher_min if h else 0, "frueher_heute_min": g.frueher_min if g else 0,
        "aktiv": h is not None, "text": text,
        "stufen": [{"ab_mm": s.ab_mm, "laenger_min": s.laenger_min, "frueher_min": s.frueher_min} for s in stufen],
        "stufen_text": " · ".join(f"ab {_mm(s.ab_mm)} mm: +{s.laenger_min} min, morgen {s.frueher_min} min früher" for s in stufen),
    }
