"""Prognose V2, P2 (BSM-033.07, Bauplan Hochrechnung §8): gespeicherte Minuten eines Zeitraums als `BereichIntervall`.

Nur Lesen und Zuordnen (Bauvorlage r5 §4); Schwellen, Qualität, Tage und Starts rechnet `logik/prognose_merkmale`.
Zweistufig, damit die globale Datenbanksperre kurz bleibt: `prognose_rohdaten` liest in der Sperre nur Zeilen,
`minuten_bauen` setzt sie außerhalb (eigener Executor-Job) zu `BereichIntervall` zusammen.

- **Einstellungen je Zeitpunkt** (`heizung`, `geraete`): Ausgangsstand ist die jüngste ganze Zeile (Übernahme bzw.
  Speichern der ganzen Einstellung), darauf werden die Punkt-Zeilen von `baustelle/setzen` (`heizung.frost_grenze`,
  `geraete.<id>.nenn_kw`) und der Gerätestatus (`geraet.status`) in der Reihenfolge von `ab` nachgespielt. Eine
  Übernahme-Zeile (`quelle` migration, rückdatiert auf den Baustellenbeginn) belegt erst ab dem Zeitpunkt der
  Übernahme; davor bleibt der Kontext unbelegt – nie mit heutigen Werten aufgefüllt.
- **Ereignisse** `prognose_kontext`: je Container das letzte vor `von` und alle in [von, bis).
- **Heizkörper zum Zeitpunkt:** ab Aufbau 9 die Einsatzintervalle des Inventars (`ausruestung_einsatz` mit
  `geraet_id` → `container_einsatz` → Container), sonst `geraet` mit `angelegt` ≤ t < `entfernt`; aktiv nach dem
  Status in der Einstellung `geraete` zum Zeitpunkt.
- Altersnachweis „alt“: Minuten vor Aufbau 10 (P1-Spalten) und übernommene Verlaufsdaten (`import_verlauf`).
- P_ref: die im Gerät eingestellte Leistung (`geraete.<id>.nenn_kw` zum Zeitpunkt), nie das gelernte Mittel.
- Minuten ohne Container-Zeile, aber mit Gerätezeilen, kommen als `zeile_vorhanden=False` mit (die Energie bleibt
  erhalten); Zeit ganz ohne Zeilen bleibt Lücke – die Fachlogik rechnet mit den echten Tagesdauern.
- Stundenimporte (`dauer_s` 3600) kommen mit ihrer Dauer; die Fachlogik schließt sie vom Training aus.
"""

from __future__ import annotations

from bisect import bisect_left, bisect_right
from collections import defaultdict
from collections.abc import Mapping, Sequence
import copy
from dataclasses import dataclass, field
from datetime import datetime, timedelta, tzinfo
import math
from typing import Any

from sqlalchemy import Connection, or_, select

from homeassistant.util import dt as dt_util

from ..logik import geraete as geraete_logik
from ..logik.baseline import Lauf
from ..logik.prognose_merkmale import QUELLE_VERLAUF, bestaetigter_lauf, betriebskontext, nachweis_s
from ..logik.prognose_typen import BereichIntervall, GeraetIntervall, Intervall, Leistungsreferenz
from . import schema as s

ROLLEN_HEIZKOERPER = ("heizung", "heizkoerper")   # `geraet.rolle` steht in der API-Schreibweise (daten.ROLLE_API)
P1_AUFBAU = 10                      # ab diesem Aufbau gibt es Alters- und Staffelnachweise
GERAET_STATUS = "geraet.status"     # Gerätestatus aus der Seite (geraete.py), Wert {"geraet", "status"}


@dataclass(frozen=True)
class PrognoseRahmen:
    """Was zum Lesen gebraucht wird (ohne HA, damit testbar)."""

    baustelle_id: str
    zone: tzinfo
    bereiche: tuple[str, ...]        # Container
    laeufe: tuple[Lauf, ...] = ()    # Baseline-Läufe (lz) für die bestätigte Lauf-ID


@dataclass
class Rohdaten:
    """Gelesene Zeilen (in der Datenbanksperre), noch ohne Zuordnung."""

    p1_ab: datetime | None
    uebernahme: datetime | None
    einstellungen: list[Any]
    heizkoerper: list[Any]
    fuehler: dict[str, bool]
    ausruestung_einsatz: list[Any]
    container_einsatz: list[Any]
    ereignisse: dict[str, list[tuple[datetime, Mapping[str, Any]]]]
    bereich_zeilen: dict[str, dict[datetime, Any]]
    geraet_zeilen: dict[str, dict[datetime, Any]] = field(default_factory=dict)   # je Gerät nach Zeit
    aussen: dict[datetime, float | None] = field(default_factory=dict)


def _utc(t: datetime) -> datetime:
    return t if t.tzinfo else t.replace(tzinfo=dt_util.UTC)


def _uebernahme(v: Connection, bid: str) -> datetime | None:
    wert = v.execute(select(s.zustand.c.wert).where(s.zustand.c.baustelle_id == bid, s.zustand.c.schluessel == "uebernahme")).scalar()
    zeit = wert.get("zeit") if isinstance(wert, dict) else None
    return dt_util.as_utc(datetime.fromisoformat(zeit)) if zeit else None


def prognose_rohdaten(v: Connection, r: PrognoseRahmen, von: datetime, bis: datetime) -> Rohdaten:
    """Alle Zeilen für [von, bis) lesen – nur Abfragen, keine Zuordnung (läuft in der Datenbanksperre)."""
    bid = r.baustelle_id
    bm, gm, wm, ev, es = s.bereich_minute, s.geraet_minute, s.wetter_minute, s.ereignis, s.einstellung
    p1 = v.execute(select(s.schema_version.c.angewendet).where(s.schema_version.c.version == P1_AUFBAU)).scalar()
    einstellungen = list(v.execute(
        select(es.c.id, es.c.ab, es.c.quelle, es.c.schluessel, es.c.wert, es.c.geraet_id).where(
            es.c.baustelle_id == bid, es.c.ab < bis,
            or_(es.c.schluessel.in_(("heizung", "geraete")) & es.c.bereich_id.is_(None) & es.c.geraet_id.is_(None),
                es.c.schluessel.like("heizung.%"), es.c.schluessel.like("geraete.%"), es.c.schluessel == GERAET_STATUS))
        .order_by(es.c.ab, es.c.id)))
    heizkoerper = list(v.execute(select(s.geraet.c.id, s.geraet.c.bereich_id, s.geraet.c.typ, s.geraet.c.angelegt, s.geraet.c.entfernt)
                                 .where(s.geraet.c.baustelle_id == bid, s.geraet.c.rolle.in_(ROLLEN_HEIZKOERPER)).order_by(s.geraet.c.id)))
    ids = [g.id for g in heizkoerper]
    fuehler = {z.id: bool(z.fuehler) for z in v.execute(select(s.bereich.c.id, s.bereich.c.fuehler).where(s.bereich.c.id.in_(r.bereiche)))}
    ae = list(v.execute(select(s.ausruestung_einsatz).where(s.ausruestung_einsatz.c.geraet_id.in_(ids)))) if ids else []
    ce = list(v.execute(select(s.container_einsatz).where(s.container_einsatz.c.container_id.in_({z.container_id for z in ae})))) if ae else []
    ereignisse: dict[str, list[tuple[datetime, Mapping[str, Any]]]] = defaultdict(list)
    for b in r.bereiche:   # das letzte Ereignis vor `von` trägt den Kontext in den Zeitraum
        vorher = v.execute(select(ev.c.zeit, ev.c.wert).where(
            ev.c.baustelle_id == bid, ev.c.art == "prognose_kontext", ev.c.bereich_id == b, ev.c.zeit < von)
            .order_by(ev.c.zeit.desc(), ev.c.id.desc()).limit(1)).first()
        if vorher is not None:
            ereignisse[b].append((_utc(vorher.zeit), vorher.wert if isinstance(vorher.wert, dict) else {}))
    for z in v.execute(select(ev.c.bereich_id, ev.c.zeit, ev.c.wert).where(
            ev.c.baustelle_id == bid, ev.c.art == "prognose_kontext", ev.c.bereich_id.in_(r.bereiche), ev.c.zeit >= von,
            ev.c.zeit < bis).order_by(ev.c.zeit, ev.c.id)):
        ereignisse[z.bereich_id].append((_utc(z.zeit), z.wert if isinstance(z.wert, dict) else {}))
    roh = Rohdaten(_utc(p1) if p1 is not None else None, _uebernahme(v, bid), einstellungen, heizkoerper, fuehler, ae, ce,
                   ereignisse, defaultdict(dict))
    if ids:
        for z in v.execute(select(gm).where(gm.c.baustelle_id == bid, gm.c.geraet_id.in_(ids), gm.c.zeit >= von, gm.c.zeit < bis)):
            roh.geraet_zeilen.setdefault(z.geraet_id, {})[_utc(z.zeit)] = z
    roh.aussen = {_utc(z.zeit): z.aussen_temp for z in v.execute(
        select(wm.c.zeit, wm.c.aussen_temp).where(wm.c.baustelle_id == bid, wm.c.zeit >= von, wm.c.zeit < bis))}
    for z in v.execute(select(bm).where(bm.c.baustelle_id == bid, bm.c.bereich_id.in_(r.bereiche), bm.c.zeit >= von,
                                        bm.c.zeit < bis)):
        roh.bereich_zeilen[z.bereich_id][_utc(z.zeit)] = z
    return roh


class _Verlauf:
    """Stand einer Einstellung je Zeitpunkt: ganze Zeile als Ausgangsstand, Punkt-Zeilen nach `ab` nachgespielt."""

    def __init__(self, schluessel: str, zeilen: Sequence[Any], uebernahme: datetime | None) -> None:
        self.uebernahme = uebernahme
        self.staende: list[tuple[datetime, dict[str, Any], Any, dict[tuple[str, ...], Any]]] = []
        wert: dict[str, Any] | None = None
        basis: Any = None
        herkunft: dict[tuple[str, ...], Any] = {}
        for z in zeilen:
            if z.schluessel == schluessel:
                wert, basis, herkunft = copy.deepcopy(z.wert) if isinstance(z.wert, dict) else {}, z, {}
            else:
                pfad_wert = _pfad(schluessel, z)
                if pfad_wert is None or wert is None:   # Änderung ohne Ausgangsstand ist nicht belegbar
                    continue
                pfad, neu = pfad_wert
                wert = copy.deepcopy(wert)
                ziel = wert
                for teil in pfad[:-1]:
                    ziel = ziel.setdefault(teil, {})
                ziel[pfad[-1]] = neu
                herkunft = {**herkunft, pfad: z}
            self.staende.append((_utc(z.ab), wert, basis, herkunft))
        self.ab = [x[0] for x in self.staende]

    def am(self, t: datetime) -> tuple[dict[str, Any] | None, Any, dict[tuple[str, ...], Any]]:
        """(Wert, Ausgangszeile, Herkunft je Pfad); Wert None, wenn zum Zeitpunkt nicht belegt."""
        i = bisect_right(self.ab, t)
        if i == 0:
            return None, None, {}
        _, wert, basis, herkunft = self.staende[i - 1]
        if basis.quelle == "migration" and (self.uebernahme is None or t < self.uebernahme):
            return None, None, {}
        return wert, basis, herkunft


def _pfad(schluessel: str, z: Any) -> tuple[tuple[str, ...], Any] | None:
    if schluessel == "geraete" and z.schluessel == GERAET_STATUS:
        w = z.wert if isinstance(z.wert, dict) else {}
        return ((str(w["geraet"]), "status"), w.get("status")) if w.get("geraet") else None
    teile = tuple(z.schluessel.split("."))
    if teile[0] != schluessel or len(teile) < 2:
        return None
    return teile[1:], z.wert


def _deckt(von: datetime, bis: datetime | None, t: datetime) -> bool:
    return _utc(von) <= t and (bis is None or t < _utc(bis))


class _Zuordnung:
    """Heizkörper je Container und Zeitpunkt: Inventar-Einsätze, sonst `geraet` mit angelegt/entfernt."""

    def __init__(self, roh: Rohdaten) -> None:
        self.geraete = roh.heizkoerper
        self.einsaetze: dict[str, list[Any]] = defaultdict(list)
        for z in roh.ausruestung_einsatz:
            self.einsaetze[z.geraet_id].append(z)
        self.container: dict[str, list[Any]] = defaultdict(list)
        for z in roh.container_einsatz:
            self.container[z.container_id].append(z)

    def im_bereich(self, g: Any, b: str, t: datetime) -> bool:
        if g.id in self.einsaetze:   # ab Aufbau 9: das Inventar kennt die Geschichte
            return any(_deckt(a.von, a.bis, t) and any(c.bereich_id == b and _deckt(c.von, c.bis, t) for c in self.container[a.container_id])
                       for a in self.einsaetze[g.id])
        return g.bereich_id == b and _deckt(g.angelegt, g.entfernt, t)


def minuten_bauen(roh: Rohdaten, r: PrognoseRahmen) -> dict[str, tuple[BereichIntervall, ...]]:
    """Je Container die Minuten als `BereichIntervall` (zeitlich sortiert) – ohne Datenbank."""
    verlauf = {schl: _Verlauf(schl, roh.einstellungen, roh.uebernahme) for schl in ("heizung", "geraete")}
    zuordnung = _Zuordnung(roh)
    aus: dict[str, tuple[BereichIntervall, ...]] = {}
    for b in r.bereiche:
        kandidaten = [g for g in roh.heizkoerper if g.id in zuordnung.einsaetze or g.bereich_id == b]
        zeiten = set(roh.bereich_zeilen.get(b, {})) | {t for g in kandidaten for t in roh.geraet_zeilen.get(g.id, {})
                                                       if zuordnung.im_bereich(g, b, t)}
        ev_b = roh.ereignisse.get(b, [])
        ev_zeiten = [t for t, _ in ev_b]
        aus[b] = tuple(_intervall(r, roh, b, t, kandidaten, zuordnung, ev_b, ev_zeiten, verlauf) for t in sorted(zeiten))
    return aus


def prognose_minuten(v: Connection, r: PrognoseRahmen, von: datetime, bis: datetime) -> dict[str, tuple[BereichIntervall, ...]]:
    """Lesen und Zusammensetzen in einem Schritt (Tests, kleine Zeiträume)."""
    return minuten_bauen(prognose_rohdaten(v, r, von, bis), r)


def _intervall(  # noqa: PLR0913 – eine Zeile aus mehreren Tabellen zusammensetzen
    r: PrognoseRahmen, roh: Rohdaten, b: str, t: datetime, kandidaten: Sequence[Any], zuordnung: _Zuordnung,
    ev_b: Sequence[tuple[datetime, Mapping[str, Any]]], ev_zeiten: Sequence[datetime], verlauf: Mapping[str, _Verlauf],
) -> BereichIntervall:
    zeile = roh.bereich_zeilen.get(b, {}).get(t)
    hk = [g for g in kandidaten if zuordnung.im_bereich(g, b, t)]
    d = int(zeile.dauer_s) if zeile is not None else next(
        (int(roh.geraet_zeilen[g.id][t].dauer_s) for g in hk if t in roh.geraet_zeilen.get(g.id, {})), 60)
    ende = t + timedelta(seconds=d)
    heizung, _, _ = verlauf["heizung"].am(t)
    geraete_e, geraete_basis, herkunft = verlauf["geraete"].am(t)
    einst_geraete: Mapping[str, Any] = geraete_e or {}
    aktiv = [g for g in hk if geraete_logik.schaltet(geraete_logik.status_von(einst_geraete.get(g.id)))]
    geraete = tuple(_geraet(g, t, d, roh.geraet_zeilen.get(g.id, {}).get(t), einst_geraete,
                            herkunft.get((g.id, "nenn_kw")) or herkunft.get((g.id,)) or geraete_basis)
                    for g in aktiv)
    i = bisect_right(ev_zeiten, t)
    j = bisect_left(ev_zeiten, ende)
    ereignis = ev_b[i - 1][1] if i > 0 else None
    am_ende = ev_b[j][1] if j < len(ev_b) and ev_zeiten[j] == ende else None
    grund = zeile.grund if zeile is not None else None
    staffel = nachweis_s(zeile.staffel_begrenzt_s, d) if zeile is not None else None
    kontext = betriebskontext(
        grund=grund, ereignis=ereignis, ereignisse_im_intervall=[w for _, w in ev_b[i:j]], ereignis_am_ende=am_ende,
        heizung=heizung, heizkoerper=[(g.id, g.typ) for g in aktiv], fuehler=roh.fuehler.get(b, False),
        lauf_id=bestaetigter_lauf(r.laeufe, b, t.astimezone(r.zone).date()), staffel_bekannt=staffel is not None,
        tuer_beobachtet=zeile is not None and zeile.tuer_offen_s is not None, zeile_vorhanden=zeile is not None)
    a = roh.aussen.get(t)
    quelle = zeile.quelle if zeile is not None else None
    innen = zeile.temperatur if zeile is not None else None
    return BereichIntervall(
        zeit=Intervall(t, ende), bereich_id=b, zeile_vorhanden=zeile is not None, grund=grund,
        zustand=zeile.zustand if zeile is not None else None, quelle=quelle, innen_c=innen, innen_gueltig=innen is not None,
        temp_alter_s=nachweis_s(zeile.temp_alter_s, math.inf) if zeile is not None else None,
        altersnachweis_alt=quelle == QUELLE_VERLAUF or roh.p1_ab is None or t < roh.p1_ab,
        soll_c=zeile.soll if zeile is not None else None, aussen_c=a, aussen_gueltig=a is not None, aussen_frisch=None,
        tuer_offen_s=None if zeile is None or zeile.tuer_offen_s is None else float(zeile.tuer_offen_s),
        staffel_begrenzt_s=None if staffel is None else float(staffel), kontext=kontext, geraete=geraete)


def _geraet(g: Any, t: datetime, d: int, z: Any | None, einst: Mapping[str, Any], beleg: Any | None) -> GeraetIntervall:
    nenn = (einst.get(g.id) or {}).get("nenn_kw")
    p_ref = (Leistungsreferenz(float(nenn), "geraet_einstellung", _utc(beleg.ab), f"einstellung:{beleg.id}")
             if beleg is not None and isinstance(nenn, (int, float)) and nenn > 0 else None)
    zeit = Intervall(t, t + timedelta(seconds=d))
    if z is None or int(z.dauer_s) != d:
        return GeraetIntervall(zeit, g.id, None, False, None, None, False, None, None, None, None, None, p_ref, "fehlt", g.typ)
    anforderung = nachweis_s(z.heizanforderung_s, d)
    return GeraetIntervall(
        zeit=zeit, geraet_id=g.id, energie_wh=z.energie_wh, energie_gueltig=z.energie_wh is not None and z.energie_wh >= 0,
        sekunden_ein=z.sekunden_ein, sekunden_strom=z.sekunden_strom,
        strom_belegt=z.leistung_w is not None or z.leistung_w_max is not None,   # gemessene Leistung, nicht nur Relay
        leistung_w=z.leistung_w, leistung_w_max=z.leistung_w_max, erreichbar=z.erreichbar, heizanforderung_s=anforderung,
        staffel_gesperrt_s=nachweis_s(z.staffel_gesperrt_s, anforderung if anforderung is not None else d),
        p_ref=p_ref, quelle=z.quelle, typ=g.typ)
