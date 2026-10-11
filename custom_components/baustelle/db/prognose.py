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

**P2b – Kontext für Altdaten** (Herbert 11.10.2026): Minuten mit Quelle `ha` vor dem ersten Ereignis eines Containers
bekommen einen rekonstruierten Kontext (`logik/prognose_merkmale.kontext_rekonstruiert`): Modus aus dem nachgespielten
Verlauf `bereiche` (+ `bereiche.<id>.modus/auto/bedarf`), Fühler = `bereich.fuehler`, bestätigt durch Temperaturwerte am
Tag; Heizkörper wie oben – ohne Inventar-Einsatz nur an Tagen, an denen `tag_geraet.bereich_id` jedes Heizkörpers der
heutigen Zuordnung entspricht (und es damit Minutenzeilen hat), sonst unbelegt. Wechsel bei Grundwechsel gegenüber der
Vorminute, nach einer Lücke und in der Minute einer Einstellungs-/Geräteänderung. **Abnahmeprüfung:** ab dem ersten
Ereignis (`rekonstruktion_pruef_tage` lang) wird je Minute rekonstruiert und mit dem Ereignis verglichen
(`pruefe_rekonstruktion`); unter `rekonstruktion_treffer_min` bleibt jede rekonstruierte Minute des Containers unbelegt.
"""

from __future__ import annotations

from bisect import bisect_left, bisect_right
from collections import defaultdict
from collections.abc import Mapping, Sequence
import copy
from dataclasses import dataclass, field
from datetime import date, datetime, timedelta, tzinfo
import math
from typing import Any

from sqlalchemy import Connection, func, or_, select

from homeassistant.util import dt as dt_util

from ..logik import geraete as geraete_logik
from ..logik.baseline import Lauf
from ..logik.prognose_merkmale import (
    QUELLE_HA,
    QUELLE_VERLAUF,
    bestaetigter_lauf,
    betriebskontext,
    konfiguration_id,
    kontext_rekonstruiert,
    nachweis_s,
    pruefe_rekonstruktion,
    regelungsart,
    wechsel_rekonstruiert,
)
from ..logik.prognose_regeln import PrognoseRegeln
from ..logik.prognose_typen import BereichIntervall, GeraetIntervall, Intervall, Leistungsreferenz, RekonstruktionsPruefung
from ..logik.regelung import modus_von
from . import schema as s

ROLLEN_HEIZKOERPER = ("heizung", "heizkoerper")   # `geraet.rolle` steht in der API-Schreibweise (daten.ROLLE_API)
P1_AUFBAU = 10                      # ab diesem Aufbau gibt es Alters- und Staffelnachweise
GERAET_STATUS = "geraet.status"     # Gerätestatus aus der Seite (geraete.py), Wert {"geraet", "status"}
VERLAEUFE = ("heizung", "geraete", "bereiche")   # Einstellungen mit Verlauf je Zeitpunkt


@dataclass(frozen=True)
class PrognoseRahmen:
    """Was zum Lesen gebraucht wird (ohne HA, damit testbar)."""

    baustelle_id: str
    zone: tzinfo
    bereiche: tuple[str, ...]        # Container
    laeufe: tuple[Lauf, ...] = ()    # Baseline-Läufe (lz) für die bestätigte Lauf-ID
    regeln: PrognoseRegeln = field(default_factory=PrognoseRegeln)


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
    erstes_ereignis: dict[str, datetime] = field(default_factory=dict)            # P2b: je Container
    tag_geraet: dict[tuple[str, date], str | None] = field(default_factory=dict)   # P2b: (Gerät, Tag) → Container
    pruef_zeilen: dict[str, list[Any]] = field(default_factory=dict)              # P2b: Minuten der Abnahmeprüfung


def _utc(t: datetime) -> datetime:
    return t if t.tzinfo else t.replace(tzinfo=dt_util.UTC)


def _uebernahme(v: Connection, bid: str) -> datetime | None:
    wert = v.execute(select(s.zustand.c.wert).where(s.zustand.c.baustelle_id == bid, s.zustand.c.schluessel == "uebernahme")).scalar()
    zeit = wert.get("zeit") if isinstance(wert, dict) else None
    return dt_util.as_utc(datetime.fromisoformat(zeit)) if zeit else None


def prognose_rohdaten(v: Connection, r: PrognoseRahmen, von: datetime, bis: datetime, *, pruefung: bool = True) -> Rohdaten:
    """Alle Zeilen für [von, bis) lesen – nur Abfragen, keine Zuordnung (läuft in der Datenbanksperre). `pruefung`
    False: die Zeilen der Abnahmeprüfung nicht lesen (P3: Abschnitte eines langen Zeitraums, die Prüfung liegt schon vor
    und geht an `minuten_bauen`)."""
    bid = r.baustelle_id
    bm, gm, wm, ev, es = s.bereich_minute, s.geraet_minute, s.wetter_minute, s.ereignis, s.einstellung
    p1 = v.execute(select(s.schema_version.c.angewendet).where(s.schema_version.c.version == P1_AUFBAU)).scalar()
    einstellungen = list(v.execute(
        select(es.c.id, es.c.ab, es.c.quelle, es.c.schluessel, es.c.wert, es.c.geraet_id).where(
            es.c.baustelle_id == bid, es.c.ab < bis,
            or_(es.c.schluessel.in_(VERLAEUFE) & es.c.bereich_id.is_(None) & es.c.geraet_id.is_(None),
                *(es.c.schluessel.like(f"{k}.%") for k in VERLAEUFE), es.c.schluessel == GERAET_STATUS))
        .order_by(es.c.ab, es.c.id)))
    heizkoerper = list(v.execute(select(s.geraet.c.id, s.geraet.c.bereich_id, s.geraet.c.typ, s.geraet.c.angelegt, s.geraet.c.entfernt)
                                 .where(s.geraet.c.baustelle_id == bid, s.geraet.c.rolle.in_(ROLLEN_HEIZKOERPER)).order_by(s.geraet.c.id)))
    ids = [g.id for g in heizkoerper]
    fuehler = {z.id: bool(z.fuehler) for z in v.execute(select(s.bereich.c.id, s.bereich.c.fuehler).where(s.bereich.c.id.in_(r.bereiche)))}
    ae = list(v.execute(select(s.ausruestung_einsatz).where(s.ausruestung_einsatz.c.geraet_id.in_(ids)))) if ids else []
    ce = list(v.execute(select(s.container_einsatz).where(s.container_einsatz.c.container_id.in_({z.container_id for z in ae})))) if ae else []
    erstes = {z.bereich_id: _utc(z.zeit) for z in v.execute(
        select(ev.c.bereich_id, func.min(ev.c.zeit).label("zeit")).where(
            ev.c.baustelle_id == bid, ev.c.art == "prognose_kontext", ev.c.bereich_id.in_(r.bereiche)).group_by(ev.c.bereich_id))}
    # P2b: Abnahmeprüfung ab dem ersten Ereignis – vor dem Zeitraum beginnen, wenn das erste Ereignis davor liegt
    dauer = timedelta(days=r.regeln.rekonstruktion_pruef_tage)
    pruef = {b: (t, min(t + dauer, bis)) for b, t in erstes.items() if t < bis} if pruefung else {}
    ereignisse: dict[str, list[tuple[datetime, Mapping[str, Any]]]] = defaultdict(list)
    art = ev.c.art == "prognose_kontext"
    for b in r.bereiche:
        # je Fenster ([von, bis) und die Abnahmeprüfung) das letzte Ereignis davor und alle darin – nicht dazwischen
        gesehen: dict[tuple[datetime, int], Mapping[str, Any]] = {}
        for a, e in [(von, bis), *([pruef[b]] if b in pruef else [])]:
            vorher = v.execute(select(ev.c.id, ev.c.zeit, ev.c.wert).where(
                ev.c.baustelle_id == bid, art, ev.c.bereich_id == b, ev.c.zeit < a)
                .order_by(ev.c.zeit.desc(), ev.c.id.desc()).limit(1)).first()
            darin = list(v.execute(select(ev.c.id, ev.c.zeit, ev.c.wert).where(
                ev.c.baustelle_id == bid, art, ev.c.bereich_id == b, ev.c.zeit >= a, ev.c.zeit < e)))
            for z in ([vorher] if vorher is not None else []) + darin:
                gesehen[(_utc(z.zeit), z.id)] = z.wert if isinstance(z.wert, dict) else {}
        ereignisse[b] = [(t, w) for (t, _), w in sorted(gesehen.items(), key=lambda x: x[0])]
    roh = Rohdaten(_utc(p1) if p1 is not None else None, _uebernahme(v, bid), einstellungen, heizkoerper, fuehler, ae, ce,
                   ereignisse, defaultdict(dict), erstes_ereignis=erstes)
    for b, (a, e) in pruef.items():
        roh.pruef_zeilen[b] = list(v.execute(select(bm.c.zeit, bm.c.dauer_s, bm.c.temperatur, bm.c.quelle).where(
            bm.c.baustelle_id == bid, bm.c.bereich_id == b, bm.c.zeit >= a, bm.c.zeit < e).order_by(bm.c.zeit)))
    if ids:   # Tagessummen je Gerät (nur für die Tage der Fenster): welchem Container es zugerechnet wurde
        tg = s.tag_geraet
        tage = [(a.astimezone(r.zone).date(), e.astimezone(r.zone).date()) for a, e in [(von, bis), *pruef.values()]]
        for z in v.execute(select(tg.c.geraet_id, tg.c.datum, tg.c.bereich_id).where(
                tg.c.baustelle_id == bid, tg.c.geraet_id.in_(ids),
                or_(*((tg.c.datum >= a) & (tg.c.datum <= e) for a, e in tage)))):
            roh.tag_geraet[(z.geraet_id, z.datum)] = z.bereich_id
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


class _Rekonstruktion:
    """P2b: Kontext je Zeitpunkt ohne Ereignis – Modus, Fühler, Heizkörper aus dem Verlauf und den Stammdaten."""

    def __init__(self, roh: Rohdaten, r: PrognoseRahmen, verlauf: Mapping[str, _Verlauf], zuordnung: _Zuordnung) -> None:
        self.roh, self.r, self.verlauf, self.zuordnung = roh, r, verlauf, zuordnung
        self.temp_tage = {(b, t.astimezone(r.zone).date()) for b, zeilen in roh.bereich_zeilen.items()
                          for t, z in zeilen.items() if z.temperatur is not None}
        self.temp_tage |= {(b, _utc(z.zeit).astimezone(r.zone).date()) for b, zeilen in roh.pruef_zeilen.items()
                           for z in zeilen if z.temperatur is not None}
        zeiten = [_utc(z.ab) for z in roh.einstellungen]
        zeiten += [_utc(x) for g in roh.heizkoerper for x in (g.angelegt, g.entfernt) if x is not None]
        zeiten += [_utc(x) for z in (*roh.ausruestung_einsatz, *roh.container_einsatz) for x in (z.von, z.bis) if x is not None]
        self.aenderungen = sorted(zeiten)

    def fuehler(self, b: str, t: datetime) -> bool:
        """Fühler laut Stammdaten, bestätigt durch Temperaturwerte am lokalen Tag."""
        return bool(self.roh.fuehler.get(b)) and (b, t.astimezone(self.r.zone).date()) in self.temp_tage

    def aenderung(self, t: datetime, ende: datetime) -> bool:
        i = bisect_left(self.aenderungen, t)
        return i < len(self.aenderungen) and self.aenderungen[i] < ende

    def heizkoerper(self, b: str, t: datetime) -> list[tuple[str, str]] | None:
        """(ID, Typ) der aktiven Heizkörper zum Zeitpunkt; None, wenn die Zuordnung nicht belegt ist."""
        geraete_e, _, _ = self.verlauf["geraete"].am(t)
        if geraete_e is None:
            return None
        tag = t.astimezone(self.r.zone).date()
        aus = []
        for g in self.roh.heizkoerper:
            drin = self.zuordnung.im_bereich(g, b, t)
            if g.id not in self.zuordnung.einsaetze:   # vor dem Inventar: Tagessummen müssen die Zuordnung bestätigen
                tag_b = self.roh.tag_geraet.get((g.id, tag), "<fehlt>")
                if drin and tag_b != b:
                    return None
                if not drin and tag_b == b:
                    return None
            if drin and geraete_logik.schaltet(geraete_logik.status_von(geraete_e.get(g.id))):
                aus.append((g.id, g.typ))
        return aus

    def art_und_konfiguration(self, b: str, t: datetime) -> tuple[str, str] | None:
        bereiche_e, _, _ = self.verlauf["bereiche"].am(t)
        heizung, _, _ = self.verlauf["heizung"].am(t)
        fuehler = self.fuehler(b, t)
        modus = modus_von((bereiche_e or {}).get(b) if bereiche_e is not None else None, fuehler)
        hk = self.heizkoerper(b, t)
        if modus is None or hk is None or heizung is None:   # wie kontext_rekonstruiert: nur mit belegter Heizung
            return None
        art = regelungsart(modus, fuehler)
        return art, konfiguration_id(art, hk)


def minuten_bauen(
    roh: Rohdaten, r: PrognoseRahmen, pruefungen_vorher: Mapping[str, RekonstruktionsPruefung] | None = None,
) -> tuple[dict[str, tuple[BereichIntervall, ...]], dict[str, RekonstruktionsPruefung]]:
    """Je Container die Minuten als `BereichIntervall` (zeitlich sortiert) und die Abnahmeprüfung der Rekonstruktion –
    ohne Datenbank. `pruefungen_vorher`: schon gerechnete Abnahmeprüfung (P3, Abschnitte ohne Prüfzeilen)."""
    verlauf = {schl: _Verlauf(schl, roh.einstellungen, roh.uebernahme) for schl in VERLAEUFE}
    zuordnung = _Zuordnung(roh)
    rek = _Rekonstruktion(roh, r, verlauf, zuordnung)
    aus: dict[str, tuple[BereichIntervall, ...]] = {}
    pruefungen: dict[str, RekonstruktionsPruefung] = {}
    for b in r.bereiche:
        ev_b = roh.ereignisse.get(b, [])
        ev_zeiten = [t for t, _ in ev_b]
        vergleiche = []
        for z in roh.pruef_zeilen.get(b, []):
            t = _utc(z.zeit)
            i = bisect_right(ev_zeiten, t)
            if z.quelle != QUELLE_HA or i == 0:
                continue
            echt = ev_b[i - 1][1]
            if echt.get("regelungsart") in (None, "unbekannt") or not echt.get("konfiguration_id"):
                continue   # das Ereignis selbst belegt nichts – kein Vergleich, keine Abweichung
            vergleiche.append((t, (str(echt.get("regelungsart")), str(echt.get("konfiguration_id"))), rek.art_und_konfiguration(b, t)))
        vorher = (pruefungen_vorher or {}).get(b)
        pruefungen[b] = vorher if vorher is not None else pruefe_rekonstruktion(b, vergleiche, r.regeln)
        kandidaten = [g for g in roh.heizkoerper if g.id in zuordnung.einsaetze or g.bereich_id == b]
        zeiten = set(roh.bereich_zeilen.get(b, {})) | {t for g in kandidaten for t in roh.geraet_zeilen.get(g.id, {})
                                                       if zuordnung.im_bereich(g, b, t)}
        aus[b] = tuple(_intervall(r, roh, b, t, kandidaten, zuordnung, ev_b, ev_zeiten, verlauf, rek, pruefungen[b])
                       for t in sorted(zeiten))
    return aus, pruefungen


def prognose_minuten(v: Connection, r: PrognoseRahmen, von: datetime, bis: datetime) -> dict[str, tuple[BereichIntervall, ...]]:
    """Lesen und Zusammensetzen in einem Schritt (Tests, kleine Zeiträume)."""
    return minuten_bauen(prognose_rohdaten(v, r, von, bis), r)[0]


def _intervall(  # noqa: PLR0913 – eine Zeile aus mehreren Tabellen zusammensetzen
    r: PrognoseRahmen, roh: Rohdaten, b: str, t: datetime, kandidaten: Sequence[Any], zuordnung: _Zuordnung,
    ev_b: Sequence[tuple[datetime, Mapping[str, Any]]], ev_zeiten: Sequence[datetime], verlauf: Mapping[str, _Verlauf],
    rek: _Rekonstruktion, pruefung: RekonstruktionsPruefung,
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
    grund = zeile.grund if zeile is not None else None
    quelle = zeile.quelle if zeile is not None else None
    staffel = nachweis_s(zeile.staffel_begrenzt_s, d) if zeile is not None else None
    lauf_id = bestaetigter_lauf(r.laeufe, b, t.astimezone(r.zone).date())
    tuer = zeile is not None and zeile.tuer_offen_s is not None
    erstes = roh.erstes_ereignis.get(b)
    if quelle == QUELLE_HA and (erstes is None or t < erstes):
        # P2b: Altminute vor dem ersten Ereignis – rekonstruierter Kontext, nur mit bestandener Abnahmeprüfung
        vorher = roh.bereich_zeilen.get(b, {}).get(t - timedelta(minutes=1))
        lueckenlos = vorher is not None and _utc(vorher.zeit) + timedelta(seconds=int(vorher.dauer_s)) == t
        bereiche_e, _, _ = verlauf["bereiche"].am(t)
        fuehler = rek.fuehler(b, t)
        kontext = kontext_rekonstruiert(
            grund=grund, modus=modus_von(bereiche_e.get(b) if bereiche_e is not None else None, fuehler), fuehler=fuehler,
            heizung=heizung, heizkoerper=rek.heizkoerper(b, t), lauf_id=lauf_id, staffel_bekannt=staffel is not None,
            tuer_beobachtet=tuer, freigegeben=pruefung.freigegeben,
            wechsel=wechsel_rekonstruiert(vorher.grund if vorher is not None else None, lueckenlos, grund, rek.aenderung(t, ende)))
    else:
        ereignis = ev_b[i - 1][1] if i > 0 else None
        am_ende = ev_b[j][1] if j < len(ev_b) and ev_zeiten[j] == ende else None
        kontext = betriebskontext(
            grund=grund, ereignis=ereignis, ereignisse_im_intervall=[w for _, w in ev_b[i:j]], ereignis_am_ende=am_ende,
            heizung=heizung, heizkoerper=[(g.id, g.typ) for g in aktiv], fuehler=roh.fuehler.get(b, False), lauf_id=lauf_id,
            staffel_bekannt=staffel is not None, tuer_beobachtet=tuer, zeile_vorhanden=zeile is not None)
    a = roh.aussen.get(t)
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


# ---------------------------------------------------------------------- P4a: Ist von heute für die Schattenprognose
def ist_heute(v: Connection, baustelle_id: str, geraete: Mapping[str, str], von: datetime
              ) -> tuple[dict[tuple[str, datetime], float], dict[tuple[str, datetime], float], datetime]:
    """Ab `von` je Container (`geraete`: Gerät → Container) und UTC-Stunde: gemessene Energie (kWh) und mitgeschriebene
    Sekunden; dazu `gemessen_bis` = Ende der gebuchten Container-Minuten (nicht „jetzt“; ohne Minute bleibt es `von`)."""
    bm, gm = s.bereich_minute, s.geraet_minute
    bis = von
    erfasst: dict[tuple[str, datetime], float] = defaultdict(float)
    for bid, zeit, dauer in v.execute(select(bm.c.bereich_id, bm.c.zeit, bm.c.dauer_s).where(
            bm.c.baustelle_id == baustelle_id, bm.c.zeit >= von)):
        t = _utc(zeit)
        bis = max(bis, t + timedelta(seconds=float(dauer or 0)))
        erfasst[(bid, t.replace(minute=0, second=0, microsecond=0))] += float(dauer or 0)
    energie: dict[tuple[str, datetime], float] = defaultdict(float)
    for gid, zeit, wh in v.execute(select(gm.c.geraet_id, gm.c.zeit, gm.c.energie_wh).where(
            gm.c.baustelle_id == baustelle_id, gm.c.zeit >= von, gm.c.zeit < bis, gm.c.energie_wh.is_not(None))):
        if (b := geraete.get(gid)) is not None:
            energie[(b, _utc(zeit).replace(minute=0, second=0, microsecond=0))] += float(wh) / 1000
    return dict(energie), dict(erfasst), bis
