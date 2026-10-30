"""Statistik aus der eigenen Datenbank (docs/bauplan-datenbank.md Phase 5, BSM-014).

Beantwortet Abfragen wie `recorder/statistics_during_period` – gleiche Form, gleiche Statistik-IDs (die eigenen
Sensoren der Integration, die Energiezähler der Shellys, die Fühler) – aus den Minuten (Periode `5minute`, `hour`)
bzw. den Tagessummen (`day`, `month`). So ziehen Auswertung, Abrechnung, Bericht, CSV und Seite um, ohne dass sich ihr
Code ändert. Was die Datenbank noch nicht kennt („ohne Automatik“, „Ersparnis“) oder wenn eine Baustelle auf
`auswertung_quelle = statistik` steht (Rückweg), bleibt bei der HA-Statistik.

Anders als HA liefert die Datenbank auch die laufende Stunde bzw. den laufenden Tag (bis zur letzten Minute); die
5-Minuten-Ergänzung der Seite braucht es für diese IDs deshalb nicht (leer).
"""

from __future__ import annotations

from collections import defaultdict
from collections.abc import Iterable
from dataclasses import dataclass
from datetime import date, datetime, timedelta
import time
from typing import TYPE_CHECKING, Any

from sqlalchemy import Connection, select

from homeassistant.core import HomeAssistant
from homeassistant.helpers import entity_registry as er
from homeassistant.util import dt as dt_util

from ..const import DOMAIN, ROLLE_HEIZKOERPER
from ..logik.tag import GeraetZeile, strom_s, geraet_tag
from . import DATA_DB, schema as s

if TYPE_CHECKING:
    from ..steuerung import Steuerung
    from .verbindung import Datenbank

QUELLE_DATENBANK, QUELLE_STATISTIK = "datenbank", "statistik"
HEUTE_FRISCH_S = 60   # Tagessumme von heute höchstens so alt (sonst vor dem Antworten neu rechnen)
_heute_gerechnet: dict[str, float] = {}


@dataclass(frozen=True)
class Ziel:
    """Was eine Statistik-ID in der Datenbank bedeutet."""

    art: str          # energie_baustelle | energie_bereich | kosten_bereich | energie_geraet | heizzeit | strom | pumpzeit | zyklen | temperatur | aussen
    st: Steuerung
    wessen: str       # entry_id, bereich_id oder geraet_id


def _ziele(hass: HomeAssistant, ids: Iterable[str]) -> dict[str, Ziel]:
    """Statistik-IDs der geladenen Baustellen, die die Datenbank beantworten kann."""
    gesucht = set(ids)
    reg = er.async_get(hass)
    ziele: dict[str, Ziel] = {}
    for entry in hass.config_entries.async_loaded_entries(DOMAIN):
        st: Steuerung | None = getattr(entry, "runtime_data", None)
        if st is None or st.e.get("auswertung_quelle", QUELLE_DATENBANK) == QUELLE_STATISTIK:
            continue
        eid = entry.entry_id
        eigene = {e.unique_id: e.entity_id for e in er.async_entries_for_config_entry(reg, eid)}

        def merken(unique_id: str, art: str, wessen: str) -> None:
            if (entity_id := eigene.get(unique_id)) in gesucht:
                ziele[entity_id] = Ziel(art, st, wessen)

        merken(f"{eid}_energie", "energie_baustelle", eid)
        merken(f"{eid}_aussen", "aussen", eid)
        for bid, info in st.bereiche.items():
            merken(f"{bid}_energie", "energie_bereich", bid)
            merken(f"{bid}_kosten", "kosten_bereich", bid)   # Audit 0.8.165: € mit dem Preis des jeweiligen Tages
            merken(f"{bid}_heizzeit", "heizzeit", bid)
            merken(f"{bid}_heizzeit_strom", "strom", bid)
            if info.fuehler in gesucht:
                ziele[info.fuehler] = Ziel("temperatur", st, bid)
        for gid, g in st.geraete.items():
            merken(f"{gid}_pumpzeit", "pumpzeit", gid)
            merken(f"{gid}_pumpzyklen", "zyklen", gid)
            if g.energie and g.energie in gesucht:
                ziele[g.energie] = Ziel("energie_geraet", st, gid)
    return ziele


def _ts(t: datetime) -> float:
    return dt_util.as_utc(t).timestamp()


def _utc(t: datetime) -> datetime:
    return t if t.tzinfo else t.replace(tzinfo=dt_util.UTC)


# ---------------------------------------------------------------------- aus den Minuten (5minute, hour)
def _aus_minuten(v: Connection, ziele: dict[str, Ziel], start: datetime, ende: datetime, schritt_s: int) -> dict[str, list[dict[str, Any]]]:
    def eimer(t: datetime) -> float:
        ts = _ts(t)
        return ts - ts % schritt_s

    gm, bm, wm = s.geraet_minute, s.bereich_minute, s.wetter_minute
    ergebnis: dict[str, list[dict[str, Any]]] = {}
    zeilen_cache: dict[str, list[Any]] = {}
    zuordnung_cache: dict[str, dict[str, tuple[str, str]]] = {}

    def zuordnung(st: Steuerung) -> dict[str, tuple[str, str]]:
        """Gerät → (Bereich, Rolle), auch für entfernte Geräte (Tabelle `geraet`) – sonst zählten sie in jeden Bereich
        (Audit 0.8.165)."""
        bid = st.entry.entry_id
        if bid not in zuordnung_cache:
            g = s.geraet
            alle = {r.id: (r.bereich_id, r.rolle) for r in v.execute(select(g.c.id, g.c.bereich_id, g.c.rolle).where(g.c.baustelle_id == bid))}
            zuordnung_cache[bid] = {**alle, **{gid: (x.bereich, x.rolle) for gid, x in st.geraete.items()}}
        return zuordnung_cache[bid]

    preis_cache: dict[tuple[str, date], float] = {}

    def preis(st: Steuerung, t: datetime) -> float:
        tag = dt_util.as_local(t).date()
        if (st.entry.entry_id, tag) not in preis_cache:
            preis_cache[(st.entry.entry_id, tag)] = st.preis_am(tag)
        return preis_cache[(st.entry.entry_id, tag)]

    def geraete_zeilen(bid: str) -> list[Any]:   # Minuten aller Geräte einer Baustelle im Zeitraum (einmal je Baustelle)
        if bid not in zeilen_cache:
            zeilen_cache[bid] = list(v.execute(select(gm.c.geraet_id, gm.c.zeit, gm.c.dauer_s, gm.c.sekunden_ein, gm.c.leistung_w_max,
                                                      gm.c.energie_wh, gm.c.sekunden_strom).where(gm.c.baustelle_id == bid, gm.c.zeit >= start, gm.c.zeit < ende)
                                               .order_by(gm.c.zeit)))
        return zeilen_cache[bid]

    for stat_id, z in ziele.items():
        st, bid = z.st, z.st.entry.entry_id
        werte: dict[float, float] = defaultdict(float)
        gewicht: dict[float, float] = defaultdict(float)
        if z.art in ("energie_baustelle", "energie_bereich", "kosten_bereich", "energie_geraet", "pumpzeit"):
            wo = zuordnung(st)
            for r in geraete_zeilen(bid):
                if z.art in ("energie_bereich", "kosten_bereich") and wo.get(r.geraet_id, ("", ""))[0] != z.wessen:
                    continue
                if z.art in ("energie_geraet", "pumpzeit") and r.geraet_id != z.wessen:
                    continue
                if z.art == "pumpzeit":
                    werte[eimer(_utc(r.zeit))] += (r.sekunden_ein or 0) / 3600
                elif r.energie_wh is not None:
                    werte[eimer(_utc(r.zeit))] += r.energie_wh / 1000 * (preis(st, _utc(r.zeit)) if z.art == "kosten_bereich" else 1)
        elif z.art in ("heizzeit", "strom"):
            zieht = float(st.e.get("heizung", {}).get("zieht_strom_w") or 50)
            je_minute: dict[datetime, int] = {}
            wo = zuordnung(st)
            for r in geraete_zeilen(bid):
                bereich, rolle = wo.get(r.geraet_id, ("", ""))
                if bereich != z.wessen:
                    continue
                if z.art == "strom" and rolle != ROLLE_HEIZKOERPER:
                    continue
                t = _utc(r.zeit)
                zeile = GeraetZeile(t, r.dauer_s, r.sekunden_ein, r.leistung_w_max, r.energie_wh, r.sekunden_strom)
                sek = strom_s(zeile, zieht) if z.art == "strom" else (r.sekunden_ein or 0)
                je_minute[t] = max(je_minute.get(t, 0), sek)   # irgendein Gerät (wie logik/tag)
            for t, sek in je_minute.items():
                werte[eimer(t)] += sek / 3600
        elif z.art == "zyklen":
            je_eimer: dict[float, list[GeraetZeile]] = defaultdict(list)
            for r in geraete_zeilen(bid):
                if r.geraet_id == z.wessen:
                    je_eimer[eimer(_utc(r.zeit))].append(GeraetZeile(_utc(r.zeit), r.dauer_s, r.sekunden_ein, r.leistung_w_max, r.energie_wh))
            for e, liste in je_eimer.items():
                werte[e] = geraet_tag(liste, 50).zyklen
        elif z.art == "temperatur":
            for r in v.execute(select(bm.c.zeit, bm.c.dauer_s, bm.c.temperatur).where(
                    bm.c.bereich_id == z.wessen, bm.c.zeit >= start, bm.c.zeit < ende, bm.c.temperatur.is_not(None))):
                werte[eimer(_utc(r.zeit))] += r.temperatur * r.dauer_s
                gewicht[eimer(_utc(r.zeit))] += r.dauer_s
        elif z.art == "aussen":
            for r in v.execute(select(wm.c.zeit, wm.c.dauer_s, wm.c.aussen_temp).where(
                    wm.c.baustelle_id == bid, wm.c.zeit >= start, wm.c.zeit < ende, wm.c.aussen_temp.is_not(None))):
                werte[eimer(_utc(r.zeit))] += r.aussen_temp * r.dauer_s
                gewicht[eimer(_utc(r.zeit))] += r.dauer_s
        mittel = z.art in ("temperatur", "aussen")
        ergebnis[stat_id] = [
            {"start": e, "end": e + schritt_s, **({"mean": w / gewicht[e]} if mittel else {"change": round(w, 6)})}
            for e, w in sorted(werte.items()) if not mittel or gewicht[e] > 0]
    return ergebnis


# ---------------------------------------------------------------------- aus den Tagessummen (day, month)
def _aus_tagen(v: Connection, ziele: dict[str, Ziel], start: datetime, ende: datetime, monat: bool) -> dict[str, list[dict[str, Any]]]:
    zone = dt_util.get_default_time_zone()
    von, bis = dt_util.as_local(start).date(), dt_util.as_local(ende - timedelta(microseconds=1)).date()

    def eimer(tag: date) -> tuple[float, float]:
        if monat:
            a = datetime(tag.year, tag.month, 1, tzinfo=zone)
            b = datetime(tag.year + (tag.month == 12), tag.month % 12 + 1, 1, tzinfo=zone)
        else:
            a = datetime(tag.year, tag.month, tag.day, tzinfo=zone)
            b = a + timedelta(days=1)
        return _ts(a), _ts(b)

    tb, tg = s.tag_bereich, s.tag_geraet
    ergebnis: dict[str, list[dict[str, Any]]] = {}
    for stat_id, z in ziele.items():
        bid = z.st.entry.entry_id
        werte: dict[tuple[float, float], list[float]] = defaultdict(list)
        if z.art in ("energie_baustelle", "energie_bereich", "kosten_bereich", "heizzeit", "strom", "temperatur", "aussen"):
            spalte = {"energie_baustelle": tb.c.kwh, "energie_bereich": tb.c.kwh, "kosten_bereich": tb.c.eur, "heizzeit": tb.c.heizzeit_min,
                      "strom": tb.c.strom_min, "temperatur": tb.c.temp_mittel, "aussen": tb.c.aussen_mittel}[z.art]
            bedingung = [tb.c.baustelle_id == bid, tb.c.datum >= von, tb.c.datum <= bis]
            if z.art in ("energie_bereich", "kosten_bereich", "heizzeit", "strom", "temperatur"):
                bedingung.append(tb.c.bereich_id == z.wessen)
            je_tag: dict[date, list[float]] = defaultdict(list)
            for r in v.execute(select(tb.c.datum, spalte.label("w")).where(*bedingung)):
                if r.w is not None:
                    je_tag[r.datum].append(float(r.w))
            for tag, liste in je_tag.items():
                if z.art == "aussen":
                    werte[eimer(tag)].append(liste[0])          # je Baustelle gleich (je Container eingetragen)
                elif z.art == "temperatur":
                    werte[eimer(tag)].append(liste[0])
                else:
                    werte[eimer(tag)].append(sum(liste) / (60 if z.art in ("heizzeit", "strom") else 1))
        else:   # energie_geraet, pumpzeit, zyklen
            spalte = {"energie_geraet": tg.c.kwh, "pumpzeit": tg.c.laufzeit_min, "zyklen": tg.c.zyklen}[z.art]
            for r in v.execute(select(tg.c.datum, spalte.label("w")).where(
                    tg.c.geraet_id == z.wessen, tg.c.datum >= von, tg.c.datum <= bis)):
                if r.w is not None:
                    werte[eimer(r.datum)].append(float(r.w) / (60 if z.art == "pumpzeit" else 1))
        mittel = z.art in ("temperatur", "aussen")
        ergebnis[stat_id] = [
            {"start": a, "end": b, **({"mean": sum(w) / len(w)} if mittel else {"change": round(sum(w), 6)})}
            for (a, b), w in sorted(werte.items()) if w]
    return ergebnis


async def _heute_frisch(db: Datenbank, st: Steuerung) -> None:
    """Tagessumme von heute vor dem Antworten nachziehen (höchstens alle HEUTE_FRISCH_S Sekunden)."""
    bid = st.entry.entry_id
    if time.monotonic() - _heute_gerechnet.get(bid, -1e9) < HEUTE_FRISCH_S:
        return
    _heute_gerechnet[bid] = time.monotonic()
    from .tage import async_tage_rechnen   # noqa: PLC0415
    await async_tage_rechnen(db, st, [dt_util.now().date()])


async def async_aus_datenbank(
    hass: HomeAssistant, ids: set[str], start: datetime, ende: datetime, periode: str
) -> tuple[dict[str, list[dict[str, Any]]], set[str]]:
    """(Antworten der Datenbank, IDs, die bei der HA-Statistik bleiben)."""
    db = hass.data.get(DATA_DB)
    if db is None or not db.bereit or periode not in ("5minute", "hour", "day", "month"):
        return {}, ids
    ziele = _ziele(hass, ids)
    if not ziele:
        return {}, ids
    rest = ids - set(ziele)
    if periode == "5minute":   # die Datenbank hat die laufende Stunde schon – keine Ergänzung nötig
        return {k: [] for k in ziele}, rest
    if periode in ("day", "month") and ende > dt_util.start_of_local_day():
        for st in {z.st for z in ziele.values()}:
            await _heute_frisch(db, st)
    s_utc, e_utc = dt_util.as_utc(start), dt_util.as_utc(ende)
    if periode == "hour":
        antwort = await db.async_ausfuehren(lambda v: _aus_minuten(v, ziele, s_utc, e_utc, 3600))
    else:
        antwort = await db.async_ausfuehren(lambda v: _aus_tagen(v, ziele, s_utc, e_utc, periode == "month"))
    if antwort is None:   # Datenbank nicht lesbar: alles bei der HA-Statistik
        return {}, ids
    return antwort, rest
