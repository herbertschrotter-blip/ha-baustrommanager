"""Sensoren eines Containers: die eine Liste (BSM-034.03, Bauplan Geräte §5 .03, Herbert 09.10.2026) – ohne HA-Code.

Keine eigene Ablage: Die Liste entsteht aus dem Fühler des Containers (Unter-Eintrag), seinem Türkontakt (Einstellung
`tuer`) und dem Aussehen (`symbol`: Türen, Fenster, Licht, logik/symbol). Der Türkontakt ist Tür 1, wenn die keinen
eigenen Sensor hat. Dieselbe Liste gilt überall: Pause der Heizung, Beobachten, fehlende Sensoren, Mitschreiben,
› Geräte, Inventar, Notprogramm.

Regeln:
- Jede Tür und jedes Fenster pausiert wie früher der Türkontakt – offen oder gekippt (der Kontakt meldet bei beidem
  „offen“; Herbert 09.10.2026: Fenster nach derselben Regel). Maßgeblich ist der am längsten offene Kontakt.
- Batterie (Prozent) in zwei Stufen, `batterie_stufe`: unter `BATTERIE_KRITISCH` (10 %) „kritisch“ – je Sensor eine
  Warnung `fuehler_fehlt` (logik/warnungen) –, unter `BATTERIE_SCHWACH` (25 %) „schwach“ – nur Anzeige (Geräteliste,
  Kopf der Container-Ansicht, rot bei kritisch). Die Seite bekommt die Stufe fertig (`struktur.bereiche[].sensoren[]`).
- Offen seit (FE-0036/37): HA setzt beim Neustart den letzten Wechsel jedes Sensors neu – die Tür wäre wieder „1 min
  offen“ und die Pause begänne von vorn. Darum merkt die Integration je Kontakt, seit wann er offen ist, und wann sie
  den Wechsel gesehen hat (`offen_merken`). Ein neuer Wechsel zählt als neue Öffnung, außer er liegt höchstens `ANLAUF`
  um den Start der Integration (Neustart, Kontakt meldet sich neu). Zu vergisst den Merker, nicht
  erreichbar lässt ihn stehen (gilt solange als zu).
"""

from __future__ import annotations

from collections.abc import Iterable, Mapping
from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import Any

from .symbol import standard

ARTEN = ("fuehler", "tuer", "fenster", "licht")
KONTAKTE = ("tuer", "fenster")
NAME = {"fuehler": "Fühler", "tuer": "Tür", "fenster": "Fenster", "licht": "Licht"}


@dataclass(frozen=True)
class Sensor:
    art: str          # fuehler | tuer | fenster | licht
    entity_id: str
    nr: int           # 1, 2, … je Art (Tür 1, Tür 2, Fenster 1 …)

    @property
    def name(self) -> str:
        return NAME[self.art] if self.art in ("fuehler", "licht") else f"{NAME[self.art]} {self.nr}"

    def als_dict(self) -> dict[str, Any]:
        return {"art": self.art, "entity_id": self.entity_id, "nr": self.nr, "name": self.name}


def sensoren(fuehler: str | None, tuer: str | None, symbol: Mapping[str, Any] | None) -> list[Sensor]:
    """Fühler, Türen, Fenster, Licht eines Containers; jede Entität nur einmal (die erste Rolle zählt)."""
    s = symbol or standard()
    roh: list[tuple[str, str | None]] = [("fuehler", fuehler)]
    roh += [("tuer", t.get("sensor") or (tuer if i == 0 else None)) for i, t in enumerate(s.get("tueren") or [])]
    if not s.get("tueren"):
        roh.append(("tuer", tuer))
    roh += [("fenster", f.get("sensor")) for f in s.get("fenster") or []]
    roh.append(("licht", s.get("licht")))
    aus: list[Sensor] = []
    zaehler = dict.fromkeys(ARTEN, 0)
    for art, eid in roh:
        if art in KONTAKTE:
            zaehler[art] += 1   # Nummer wie im Aussehen (Fenster 2 bleibt Fenster 2, auch wenn Fenster 1 keinen Sensor hat)
        if eid and all(x.entity_id != eid for x in aus):
            aus.append(Sensor(art, eid, zaehler[art] if art in KONTAKTE else 1))
    return aus


def aus_einstellungen(fuehler: str | None, bereich: Mapping[str, Any]) -> list[Sensor]:
    """Die Liste aus dem Fühler und den Einstellungen des Containers (Türkontakt `tuer`, Aussehen `symbol`)."""
    return sensoren(fuehler, bereich.get("tuer"), bereich.get("symbol"))


def kontakte(liste: Iterable[Sensor]) -> list[str]:
    """Entitäten aller Türen und Fenster – jeder pausiert."""
    return [s.entity_id for s in liste if s.art in KONTAKTE]


def offen_seit(zeiten: Iterable[datetime | None]) -> datetime | None:
    """Seit wann offen: der am längsten offene Kontakt (None = alle zu)."""
    offen = [z for z in zeiten if z is not None]
    return min(offen) if offen else None


ANLAUF = timedelta(minutes=10)   # FE-0036/37: so lange um den Start meldet sich ein Kontakt noch neu

Merker = tuple[datetime, datetime]   # (offen seit, zuletzt gesehener Wechsel des Sensors)


def offen_merken(merker: Merker | None, offen: bool | None, geaendert: datetime | None,
                 gestartet: datetime, jetzt: datetime | None = None) -> tuple[datetime | None, Merker | None]:
    """Seit wann ein Kontakt offen ist und der neue Merker. `offen` None = nicht erreichbar, `geaendert` = letzter
    Wechsel laut HA, `gestartet` = Start der Integration (FE-0036/37).

    Nicht erreichbar gilt als zu – nur im Anlauf nach dem Start nicht: Meldet sich der Kontakt noch nicht, gilt der
    gemerkte Stand weiter (sonst verschwände „Tür offen“ kurz, und die Nachricht käme ein zweites Mal)."""
    if offen is None or geaendert is None:
        if merker is not None and jetzt is not None and abs(jetzt - gestartet) <= ANLAUF:
            return merker[0], merker
        return None, merker
    if not offen:
        return None, None
    if merker is not None and (geaendert == merker[1] or abs(geaendert - gestartet) <= ANLAUF):
        seit = min(merker[0], geaendert)
        return seit, (seit, geaendert)
    return geaendert, (geaendert, geaendert)


BATTERIE_SCHWACH = 25.0    # % – Anzeige „schwach“
BATTERIE_KRITISCH = 10.0   # % – „kritisch“, ab hier warnt die Integration (fuehler_fehlt, logik/warnungen)


def batterie_stufe(prozent: float | None) -> str | None:
    """None (ok oder unbekannt), „schwach“ (< BATTERIE_SCHWACH) oder „kritisch“ (< BATTERIE_KRITISCH)."""
    if prozent is None:
        return None
    if prozent < BATTERIE_KRITISCH:
        return "kritisch"
    return "schwach" if prozent < BATTERIE_SCHWACH else None
