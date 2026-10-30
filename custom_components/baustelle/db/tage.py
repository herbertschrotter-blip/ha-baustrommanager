"""Tagessummen in der eigenen Datenbank (docs/bauplan-datenbank.md Phase 4, BSM-009).

`tag_geraet` und `tag_bereich` werden aus den Minuten gerechnet (`logik/tag`): für heute alle 15 Minuten, kurz nach
Mitternacht noch einmal für gestern, nach dem Start für alle fehlenden Tage seit Baustellenbeginn. Dazu der Abgleich
mit der HA-Langzeitstatistik, aus der die Auswertung heute rechnet – erst wenn beide gleich sind, zieht die Auswertung
um (Phase 5).
"""

from __future__ import annotations

from collections import defaultdict
from collections.abc import Mapping
from dataclasses import dataclass
from datetime import date, datetime, timedelta, tzinfo
from typing import TYPE_CHECKING, Any

from sqlalchemy import Connection, delete, func, insert, select

from homeassistant.core import HomeAssistant
from homeassistant.util import dt as dt_util

from ..logik.hochrechnung import TagRoh
from ..logik.tag import BereichZeile, GeraetZeile, bereich_tag, geraet_tag
from . import schema as s

if TYPE_CHECKING:
    from ..steuerung import Steuerung
    from .verbindung import Datenbank

ZIEHT_W = 50.0   # Standard von `heizung.zieht_strom_w` (AN-0012)


@dataclass(frozen=True)
class TagRahmen:
    """Was zum Rechnen eines Tages aus den Einstellungen gebraucht wird (ohne HA, damit testbar)."""

    baustelle_id: str
    zone: tzinfo
    geraete: Mapping[str, tuple[str, str]]   # id → (bereich, rolle)
    heizrollen: frozenset[str]
    preis: Mapping[date, float]
    firma: Mapping[tuple[str, date], str]    # (bereich, tag) → firma
    zieht_w: float = ZIEHT_W


def _grenzen(tag: date, zone: tzinfo) -> tuple[datetime, datetime]:
    von = datetime.combine(tag, datetime.min.time(), zone)
    return dt_util.as_utc(von), dt_util.as_utc(von + timedelta(days=1))


def _utc(t: datetime) -> datetime:
    return t if t.tzinfo else t.replace(tzinfo=dt_util.UTC)


def tag_rechnen(v: Connection, r: TagRahmen, tag: date) -> tuple[int, int]:
    """Einen Tag aus den Minuten rechnen und `tag_geraet`/`tag_bereich` ersetzen; (Geräte, Container) geschrieben."""
    von, bis = _grenzen(tag, r.zone)
    gm, bm, wm = s.geraet_minute, s.bereich_minute, s.wetter_minute
    je_geraet: dict[str, list[GeraetZeile]] = defaultdict(list)
    for z in v.execute(select(gm.c.geraet_id, gm.c.zeit, gm.c.dauer_s, gm.c.sekunden_ein, gm.c.leistung_w_max, gm.c.energie_wh,
                              gm.c.sekunden_strom)
                       .where(gm.c.baustelle_id == r.baustelle_id, gm.c.zeit >= von, gm.c.zeit < bis).order_by(gm.c.zeit)):
        je_geraet[z.geraet_id].append(GeraetZeile(_utc(z.zeit), z.dauer_s, z.sekunden_ein, z.leistung_w_max, z.energie_wh,
                                                  z.sekunden_strom))
    wo = dict(r.geraete)   # Audit 0.8.165: entfernte Geräte nach der Tabelle `geraet` ihrem Container zuordnen
    if fehlen := [gid for gid in je_geraet if gid not in wo]:
        tg = s.geraet
        wo.update({x.id: (x.bereich_id, x.rolle) for x in v.execute(select(tg.c.id, tg.c.bereich_id, tg.c.rolle).where(tg.c.id.in_(fehlen)))})
    je_bereich: dict[str, list[BereichZeile]] = defaultdict(list)
    for z in v.execute(select(bm.c.bereich_id, bm.c.zeit, bm.c.dauer_s, bm.c.temperatur)
                       .where(bm.c.baustelle_id == r.baustelle_id, bm.c.zeit >= von, bm.c.zeit < bis).order_by(bm.c.zeit)):
        je_bereich[z.bereich_id].append(BereichZeile(_utc(z.zeit), z.dauer_s, z.temperatur))
    aussen = {_utc(z.zeit): z.aussen_temp for z in v.execute(
        select(wm.c.zeit, wm.c.aussen_temp).where(wm.c.baustelle_id == r.baustelle_id, wm.c.zeit >= von, wm.c.zeit < bis))}
    preis = r.preis.get(tag, 0.0)

    geraete_zeilen = []
    for gid, zeilen in je_geraet.items():
        bereich_id, _rolle = wo.get(gid, ("", ""))
        t = geraet_tag(zeilen, r.zieht_w)
        geraete_zeilen.append({
            "geraet_id": gid, "datum": tag, "baustelle_id": r.baustelle_id, "bereich_id": bereich_id or None,
            "firma_id": r.firma.get((bereich_id, tag)), "kwh": t.kwh, "eur": round(t.kwh * preis, 4), "preis": preis,
            "heizzeit_min": t.heizzeit_min, "zyklen": t.zyklen, "laufzeit_min": t.heizzeit_min, "ohne_kwh": None,
            "strom_min": t.strom_min})
    bereiche: set[str] = set(je_bereich) | {wo[g][0] for g in je_geraet if g in wo}
    bereich_zeilen = []
    for b_id in sorted(bereiche):
        geraete = {g: z for g, z in je_geraet.items() if wo.get(g, ("",))[0] == b_id}
        heizer = {g for g in geraete if wo[g][1] in r.heizrollen}
        bt = bereich_tag(geraete, heizer, je_bereich.get(b_id, []), aussen, r.zieht_w)
        bereich_zeilen.append({
            "bereich_id": b_id, "datum": tag, "baustelle_id": r.baustelle_id, "firma_id": r.firma.get((b_id, tag)),
            "kwh": bt.kwh, "eur": round(bt.kwh * preis, 4), "heizzeit_min": bt.heizzeit_min, "gradh": bt.gradh,
            "temp_min": bt.temp_min, "temp_mittel": bt.temp_mittel, "temp_max": bt.temp_max,
            "aussen_mittel": bt.aussen_mittel, "ohne_kwh": None, "heiztag": bt.heiztag, "strom_min": bt.strom_min})
    v.execute(delete(s.tag_geraet).where(s.tag_geraet.c.baustelle_id == r.baustelle_id, s.tag_geraet.c.datum == tag))
    v.execute(delete(s.tag_bereich).where(s.tag_bereich.c.baustelle_id == r.baustelle_id, s.tag_bereich.c.datum == tag))
    if geraete_zeilen:
        v.execute(insert(s.tag_geraet), geraete_zeilen)
    if bereich_zeilen:
        v.execute(insert(s.tag_bereich), bereich_zeilen)
    return len(geraete_zeilen), len(bereich_zeilen)


def rahmen(st: Steuerung, tage: list[date]) -> TagRahmen:
    """Rahmen aus der laufenden Baustelle (Preis „ab“, Firma zum Tagesbeginn, Schwelle „zieht Strom“)."""
    from ..const import ROLLE_HEIZKOERPER   # noqa: PLC0415
    from ..logik.abrechnung import EIGEN, firma_von   # noqa: PLC0415

    zone = dt_util.get_default_time_zone()
    zuordnung, firmen = st.e.get("zuordnung") or [], st.e.get("firmen") or [{"id": EIGEN}]
    firma = {(b_id, tag): firma_von(zuordnung, firmen, b_id, datetime.combine(tag, datetime.min.time(), zone))
             for b_id in st.bereiche for tag in tage}
    return TagRahmen(
        baustelle_id=st.entry.entry_id, zone=zone,
        # „tatsächlich geheizt“ zählt wie in heizung.zaehlen_geraet nur bei Heizkörpern (nicht beim Bautrockner)
        geraete={gid: (g.bereich, g.rolle) for gid, g in st.geraete.items()}, heizrollen=frozenset({ROLLE_HEIZKOERPER}),
        preis={tag: st.preis_am(tag) for tag in tage}, firma=firma,
        zieht_w=float(st.e.get("heizung", {}).get("zieht_strom_w") or ZIEHT_W))


async def async_tage_rechnen(db: Datenbank, st: Steuerung, tage: list[date]) -> int:
    """Tage neu rechnen (einer Transaktion je Aufruf); Anzahl der Tage."""
    if not tage or not db.bereit:
        return 0
    r = rahmen(st, tage)

    def alle(v: Connection) -> int:
        for tag in tage:
            tag_rechnen(v, r, tag)
        return len(tage)

    erledigt = await db.async_ausfuehren(alle)
    if erledigt:
        db.geschrieben()
    return erledigt or 0


async def async_fehlende_tage(db: Datenbank, st: Steuerung, *, alle: bool = False) -> int:
    """Nach dem Start: alle Tage seit dem frühesten Minutenwert ohne Tagessumme (mit `alle` jeden Tag), dazu heute."""
    bid = st.entry.entry_id
    zone = dt_util.get_default_time_zone()
    erste = await db.async_ausfuehren(lambda v: v.execute(
        select(s.geraet_minute.c.zeit).where(s.geraet_minute.c.baustelle_id == bid).order_by(s.geraet_minute.c.zeit).limit(1)).scalar())
    if erste is None:
        return 0
    heute = dt_util.now().date()
    # vorhanden = schon gerechnet und mit Aufbau 3 (strom_min) – ältere Tage werden einmal neu gerechnet
    vorhanden = set(await db.async_ausfuehren(lambda v: [r.datum for r in v.execute(
        select(s.tag_bereich.c.datum).where(s.tag_bereich.c.baustelle_id == bid, s.tag_bereich.c.strom_min.is_not(None)).distinct())]) or [])
    tag, fehlen = dt_util.as_local(_utc(erste)).astimezone(zone).date(), []
    while tag <= heute:
        if alle or tag not in vorhanden or tag == heute:
            fehlen.append(tag)
        tag += timedelta(days=1)
    for i in range(0, len(fehlen), 14):   # in Stücken, damit die Datenbank zwischendurch frei ist
        await async_tage_rechnen(db, st, fehlen[i:i + 14])
    return len(fehlen)


async def async_abgleich(hass: HomeAssistant, db: Datenbank, st: Steuerung, von: date, bis: date) -> list[dict[str, Any]]:
    """kWh je Container und Tag: eigene Datenbank gegen HA-Langzeitstatistik (Quelle der Auswertung bis Phase 5)."""
    from homeassistant.helpers import entity_registry as er   # noqa: PLC0415
    from ..auswertung import async_je_tag   # noqa: PLC0415
    from ..const import DOMAIN   # noqa: PLC0415

    bid = st.entry.entry_id
    reg = er.async_get(hass)
    ids = {b_id: e for b_id in st.bereiche if (e := reg.async_get_entity_id("sensor", DOMAIN, f"{b_id}_energie"))}
    statistik = await async_je_tag(hass, ids, von, bis) if ids else {}
    eigen: dict[tuple[str, date], float] = {}
    for z in await db.async_ausfuehren(lambda v: list(v.execute(
            select(s.tag_bereich.c.bereich_id, s.tag_bereich.c.datum, s.tag_bereich.c.kwh)
            .where(s.tag_bereich.c.baustelle_id == bid, s.tag_bereich.c.datum >= von, s.tag_bereich.c.datum <= bis)))) or []:
        eigen[(z.bereich_id, z.datum)] = float(z.kwh or 0)
    zeilen = []
    for b_id, info in st.bereiche.items():
        tag = von
        while tag <= bis:
            a, h = eigen.get((b_id, tag)), statistik.get(b_id, {}).get(tag)
            if a is not None or h is not None:
                zeilen.append({"datum": tag.isoformat(), "bereich": info.name, "datenbank_kwh": a, "statistik_kwh": h,
                               "abweichung_kwh": None if a is None or h is None else round(a - h, 3)})
            tag += timedelta(days=1)
    return zeilen


def hochrechnung_tage(v: Connection, baustelle_id: str, von: date, bis: date, zone: tzinfo) -> dict[str, list[TagRoh]]:
    """Je Container die Tage `von` … `bis` für die Hochrechnung (BSM-033.02): Verbrauch, Außenmittel und wie viel des
    Tages mitgeschrieben ist (HA oder übernommen, ohne Stunden aus dem Notprogramm)."""
    tb, bm = s.tag_bereich, s.bereich_minute
    zeilen = list(v.execute(select(tb.c.bereich_id, tb.c.datum, tb.c.kwh, tb.c.aussen_mittel).where(
        tb.c.baustelle_id == baustelle_id, tb.c.datum >= von, tb.c.datum <= bis).order_by(tb.c.datum)))
    erfasst: dict[tuple[str, date], float] = {}
    dauer: dict[date, float] = {}
    for tag in sorted({z.datum for z in zeilen}):
        a, b = _grenzen(tag, zone)
        dauer[tag] = (b - a).total_seconds()
        for bid, sek in v.execute(select(bm.c.bereich_id, func.sum(bm.c.dauer_s)).where(
                bm.c.baustelle_id == baustelle_id, bm.c.zeit >= a, bm.c.zeit < b, bm.c.quelle != "notprogramm").group_by(bm.c.bereich_id)):
            erfasst[(bid, tag)] = float(sek or 0)
    aus: dict[str, list[TagRoh]] = defaultdict(list)
    for z in zeilen:
        aus[z.bereich_id].append(TagRoh(z.datum, z.kwh, z.aussen_mittel, erfasst.get((z.bereich_id, z.datum), 0.0), dauer[z.datum]))
    return dict(aus)


def stunden(
    v: Connection, baustelle_id: str, geraete: Mapping[str, str], tage: Mapping[str, set[date]] | None, tag: date, zone: tzinfo,
) -> tuple[dict[int, float], dict[int, float], list[list[float]]]:
    """Verlauf 24 h (BSM-033.04): Verbrauch der Geräte `geraete` (geraet_id → Container) je Stunde des Tages, Außentemperatur
    je Stunde und je Baseline-Tag eines Containers (`tage`: Container → Tage) die 24 Stundenwerte seines Verbrauchs."""
    gm, wm = s.geraet_minute, s.wetter_minute

    def je_stunde(von: date, bereich: str | None) -> list[float]:
        a, b = _grenzen(von, zone)
        aus = [0.0] * 24
        for gid, zeit, wh in v.execute(select(gm.c.geraet_id, gm.c.zeit, gm.c.energie_wh).where(
                gm.c.baustelle_id == baustelle_id, gm.c.zeit >= a, gm.c.zeit < b, gm.c.energie_wh.is_not(None))):
            if gid in geraete and (bereich is None or geraete[gid] == bereich):
                aus[dt_util.as_local(_utc(zeit)).hour] += wh / 1000
        return aus

    a, b = _grenzen(tag, zone)
    ist = je_stunde(tag, None)
    vorhanden = {dt_util.as_local(_utc(z)).hour for (z,) in v.execute(select(gm.c.zeit).where(
        gm.c.baustelle_id == baustelle_id, gm.c.zeit >= a, gm.c.zeit < b).distinct())}
    summe: dict[int, float] = defaultdict(float)
    gewicht: dict[int, float] = defaultdict(float)
    for zeit, dauer, temp in v.execute(select(wm.c.zeit, wm.c.dauer_s, wm.c.aussen_temp).where(
            wm.c.baustelle_id == baustelle_id, wm.c.zeit >= a, wm.c.zeit < b, wm.c.aussen_temp.is_not(None))):
        h = dt_util.as_local(_utc(zeit)).hour
        summe[h] += temp * dauer
        gewicht[h] += dauer
    profil = [je_stunde(d, bid) for bid, ds in (tage or {}).items() for d in sorted(ds)]
    return ({h: ist[h] for h in sorted(vorhanden)}, {h: summe[h] / gewicht[h] for h in summe if gewicht[h] > 0}, profil)
