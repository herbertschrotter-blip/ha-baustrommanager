"""Heizung: Start-Logik der lernenden Container (FE-0031/FE-0032, Mockup start.html Variante B).

Liest Einstellungen, Lernstand, Fühler, Außenwert, stündliche Vorhersage (`laufzeit.wetter_stunden`, `kern/wetter`) und
den gemessenen Verlauf und lässt `logik/start.py` rechnen. Regelung (`plan.warm_ab`), Zustandstext („aus bis …“ über
den Plan), Plan-Chip und Dialog lesen dasselbe Ergebnis. Je Minute und Eingabe höchstens einmal gerechnet.
"""

from __future__ import annotations

from datetime import date, datetime, timedelta
from typing import TYPE_CHECKING, Any

from homeassistant.util import dt as dt_util

from ...logik import start as start_logik
from ...logik.arbeitszeit import WarmAb
from ..basis import ZAEHLER_SPEICHERN_S, zeit

if TYPE_CHECKING:
    from . import Heizung

VERLAUF_MIN = 15   # gemessener Verlauf (innen, außen) für die Kurve: alle 15 min …
VERLAUF_H = 12     # … die letzten 12 Stunden (Store `laufzeit.start_verlauf.<id>`)


def lernend_thermo(hz: Heizung, bid: str) -> bool:
    """Lernender Container mit Fühler im Modus Thermostat – nur für ihn gilt „Warm ab“ und die Start-Logik."""
    info = hz.st.bereiche.get(bid)
    return bool(info is not None and info.fuehler and hz.st.einstellungen.bereich(bid).get("lernen") and hz.modus(bid) == "thermo")


def warm_einst(hz: Heizung, bid: str, aufheiz_min: int | None = None) -> WarmAb:
    """„Warm ab“ aus den Einstellungen (Baustelle, je Container eigene Werte)."""
    e, h = hz.st.einstellungen.bereich(bid), hz.st.e["heizung"]
    return WarmAb(
        vor_min=int(e["warm_vor"] if e.get("warm_vor") is not None else h.get("warm_vor_min", 0)),
        nach_min=int(e["warm_nach"] if e.get("warm_nach") is not None else h.get("warm_nach_min", 0)),
        max_min=int(h.get("warm_max_min", 120)), aufheiz_min=aufheiz_min,
    )


def fest(hz: Heizung, bid: str) -> dict[str, Any] | None:
    """Beim Start festgehalten (Store `laufzeit.warm_start.<id>`); bis 0.8.156 als Liste [Tag, Aufheizzeit, Zusatz,
    geschätzt] gespeichert – die wird ohne Beginn gelesen."""
    f = (hz.st.lz.get("warm_start") or {}).get(bid)
    if isinstance(f, list) and f:
        return {"tag": f[0], "aufheiz_min": f[1], "zusatz": bool(f[2]) if len(f) > 2 else False,
                "geschaetzt": bool(f[3]) if len(f) > 3 else False, "beginn": None}
    return dict(f) if isinstance(f, dict) else None


def verlauf_merken(hz: Heizung, bid: str, jetzt: datetime, innen: float | None, aussen: float | None) -> None:
    """Alle `VERLAUF_MIN` Minuten innen und außen merken (für die gemessene Kurve im Dialog)."""
    if innen is None:
        return
    alle = hz.st.lz.setdefault("start_verlauf", {})
    liste = alle.setdefault(bid, [])
    t = jetzt.replace(second=0, microsecond=0)
    if liste and (z := zeit(liste[-1][0])) is not None and (t - z).total_seconds() < VERLAUF_MIN * 60:
        return
    liste.append([t.isoformat(timespec="minutes"), innen, aussen])
    grenze = t - timedelta(hours=VERLAUF_H)
    alle[bid] = [x for x in liste if (z := zeit(x[0])) is not None and z >= grenze]
    hz._start_runde += 1
    hz.st.einstellungen.speichern(ZAEHLER_SPEICHERN_S)


def verlauf_aufraeumen(hz: Heizung) -> bool:
    """Verlauf nur für lernende Container im Thermostat: entfernte oder nicht mehr lernende Container verlieren ihn."""
    alle = hz.st.lz.get("start_verlauf") or {}
    weg = [bid for bid in alle if bid not in hz.st.bereiche or not lernend_thermo(hz, bid)]
    for bid in weg:
        del alle[bid]
    return bool(weg)


def _vorhersage(hz: Heizung) -> tuple[tuple[datetime, float], ...]:
    aus = []
    for iso, temp in (hz.st.lz.get("wetter_stunden") or {}).items():
        t = dt_util.parse_datetime(iso)
        if t is not None and isinstance(temp, (int, float)):
            aus.append((dt_util.as_local(t), float(temp)))
    return tuple(sorted(aus))


def _verlauf(hz: Heizung, bid: str) -> tuple[tuple[datetime, float | None, float | None], ...]:
    aus = []
    for x in (hz.st.lz.get("start_verlauf") or {}).get(bid) or []:
        t = zeit(x[0])
        if t is not None:
            aus.append((dt_util.as_local(t), x[1], x[2] if len(x) > 2 else None))
    return tuple(aus)


def _plan_ohne(hz: Heizung, bid: str, tag: date) -> Any:
    """Plan des Tages mit „Warm ab“, aber ohne Aufheizzeit (Arbeitsbeginn, Ende – unabhängig vom Start)."""
    return hz.plan(tag, bool(hz.st.einstellungen.bereich(bid)["trocknen"]), warm_einst(hz, bid, 0))


def _vorhersage_gelesen(hz: Heizung) -> tuple[tuple[datetime, float], ...]:
    """Vorhersage nur neu lesen, wenn eine neue da ist (`kern/wetter` ersetzt `wetter_stunden` als Ganzes)."""
    roh = hz.st.lz.get("wetter_stunden") or {}
    alt = hz._vorhersage_cache
    if alt is not None and alt[0] is roh and alt[1] == len(roh):
        return alt[2]
    neu = _vorhersage(hz)
    hz._vorhersage_cache = (roh, len(roh), neu)
    return neu


def _fest_t(f: dict[str, Any] | None) -> tuple[Any, ...] | None:
    return None if f is None else tuple(sorted((k, tuple(map(tuple, v)) if isinstance(v, list) else v) for k, v in f.items()))


def start(hz: Heizung, bid: str, jetzt: datetime | None = None) -> start_logik.Start | None:
    """Ergebnis der Start-Logik (logik/start.rechnen) für einen lernenden Container; sonst None.

    Wird je Auswertung vielfach gefragt (Plan, Zustandstext, Woche, Anzeige): in derselben Auswertung (`_start_runde`,
    zählt `aufraeumen` hoch) und Minute bei gleichem Fühler- und Außenwert gilt das letzte Ergebnis, ohne die Eingabe
    neu zu bauen; sonst wird die Eingabe gebaut und nur bei einer Änderung neu gerechnet."""
    if not lernend_thermo(hz, bid):
        hz._start_cache.pop(bid, None)
        return None
    jetzt = (jetzt or dt_util.now()).replace(second=0, microsecond=0)
    st = hz.st
    info = st.bereiche[bid]
    innen, aussen = st.temperatur(info.fuehler), st.daten.wetter.aussen
    # schneller Schlüssel: Stand (`_start_runde` zählt nur bei echten Änderungen: Einstellung, Lernstand, Plan,
    # Festhalten, Verlauf), Minute, Fühler, außen, Soll und die Vorhersage (wird als Ganzes ersetzt)
    schnell = (hz._start_runde, jetzt, innen, aussen, hz.soll_temperatur(bid), id(st.lz.get("wetter_stunden")))
    alt = hz._start_cache.get(bid)
    if alt is not None and alt[0] == schnell:
        return alt[2]
    hz.start_eingaben += 1
    e, h = st.einstellungen.bereich(bid), st.e["heizung"]
    heute, minute = jetzt.date(), jetzt.hour * 60 + jetzt.minute
    f = fest(hz, bid)
    warm = warm_einst(hz, bid)
    tag = start_logik.tag_waehlen(heute, minute, lambda t: _plan_ohne(hz, bid, t), warm.vor_min,
                                  gestartet_heute=f is not None and f.get("tag") == heute.isoformat())
    plan = _plan_ohne(hz, bid, tag) if tag is not None else None
    if tag is None or plan is None:
        hz._start_cache[bid] = (schnell, None, None)
        return None
    stand = hz.lern_staende.get(bid) or {}
    eingabe = start_logik.Eingabe(
        jetzt=jetzt, tag=tag, a=plan.a, warm=warm, soll=hz.soll_temperatur(bid),
        innen=innen, aussen=aussen, vorhersage=_vorhersage_gelesen(hz),
        verlauf=_verlauf(hz, bid), tau=stand.get("tau"), raten=dict(stand.get("aufheizen") or {}),
        anzahl=len(hz.heizer_von(bid)) or 1, stufen=hz.stufen_an(bid), m2=e.get("groesse_m2"),
        untergrenze=float(h["frost_grenze"]) if h.get("frost") else None, fest=f,
        frueher=tuple((str(g), int(m)) for g, m in plan.frueher),   # die Verschiebung des Plans selbst (eine Regel)
    )
    zeichen = (jetzt, tag, eingabe.a, eingabe.warm, eingabe.soll, innen, aussen, eingabe.vorhersage,
               tuple(eingabe.tau) if eingabe.tau else None, tuple(sorted((k, tuple(v)) for k, v in eingabe.raten.items())),
               eingabe.anzahl, eingabe.stufen, eingabe.m2, eingabe.untergrenze, _fest_t(f), eingabe.frueher,
               len(eingabe.verlauf), eingabe.verlauf[-1][0] if eingabe.verlauf else None)
    if alt is not None and alt[1] == zeichen:
        hz._start_cache[bid] = (schnell, zeichen, alt[2])
        return alt[2]
    ergebnis = start_logik.rechnen(eingabe)
    hz.start_gerechnet += 1
    hz._start_cache[bid] = (schnell, zeichen, ergebnis)
    return ergebnis


def festhalten(hz: Heizung, bid: str, warm: WarmAb | None, plan: Any, beginn: int, jetzt: datetime) -> None:
    """Ab dem Start bis Arbeitsbeginn festhalten (Store, übersteht Neustarts): Aufheizzeit für die Regelung, Beginn des
    Vorheizens und „früher“ aus dem Plan, dazu die Werte beim Start für den Dialog (gemessen, Prognose, Band, Rate).
    `jetzt` = Zeit der Auswertung (dieselbe Minute wie der Plan)."""
    alle = hz.st.lz.setdefault("warm_start", {})
    heute = jetzt.date()
    s = start(hz, bid, jetzt)
    info = hz.st.bereiche[bid]
    if s is not None and s.tag == heute and not s.laeuft:
        neu = start_logik.festhalten(s, hz.st.temperatur(info.fuehler), beginn, warm.aufheiz_min if warm is not None else None)
    else:
        neu = {"tag": heute.isoformat(), "beginn": beginn, "aufheiz_min": warm.aufheiz_min if warm is not None else None,
               "innen_start": hz.st.temperatur(info.fuehler), "zusatz": bool(hz._zusatz_gelernt.get(bid)),
               "geschaetzt": bool(hz._geschaetzt.get(bid))}
    neu.update(auf_beginn=plan.vor, frueher=[list(x) for x in plan.frueher])   # aus dem Plan, der gerade gilt
    alle[bid] = neu
    hz._start_runde += 1
    hz.st.einstellungen.speichern()


def anzeige(hz: Heizung, bid: str) -> dict[str, Any] | None:
    """`laufzeit.container.<id>.start` (api-0.7): dieselbe Rechnung wie Regelung und Zustandstext."""
    jetzt = dt_util.now()
    s = start(hz, bid, jetzt)
    if s is None:
        return None
    heute_plan = _plan_ohne(hz, bid, jetzt.date())
    aus = start_logik.anzeige(s, jetzt, heute_ende=heute_plan.b if heute_plan is not None else None,
                              m2=hz.st.einstellungen.bereich(bid).get("groesse_m2"))
    # Jetzt-Chip „⏸ aus bis …“: nur, wenn der Zustandstext gerade „aus bis …“ sagt (anzeige.py merkt sich die Zeit)
    bis = hz._aus_bis.get(bid)
    aus["aus_bis"] = {"lang": f"aus bis {bis}", "kurz": bis} if bis else None
    return aus
