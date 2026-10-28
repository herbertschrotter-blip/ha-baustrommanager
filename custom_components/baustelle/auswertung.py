"""Auswertung für Seite, Bericht und CSV: holt die Langzeitstatistik (Recorder) und rechnet mit `logik/auswertung.py`.

Die Seite rechnet nichts Fachliches mehr, sie holt die Werte über `baustelle/auswertung` und `baustelle/abrechnung`
(panel.py, api-0.7 §8). Der Bericht (nachrichten.py) nimmt dieselben Funktionen – so zeigen Seite, Bericht und CSV
dieselben Zahlen (docs/bauplan-module.md).

Statistik-IDs sind die eigenen Sensoren (unique_id → entity_id aus der Registry): `<bid>_energie`, `<bid>_heizzeit`,
`<gid>_pumpzeit`, `<entry>_energie`, `<entry>_energie_ohne_automatik`, `<entry>_aussen`. Abgeschlossene oder nicht
geladene Baustellen (Verlauf) kommen aus der Einrichtung (Subentries), ohne Einstellungen und Zähler – wie in
`baustelle/struktur`.
"""

from __future__ import annotations

from collections.abc import Callable, Iterable, Mapping, Sequence
from dataclasses import dataclass
from datetime import date, datetime, timedelta, tzinfo
from typing import TYPE_CHECKING, Any, cast

from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.helpers import entity_registry as er
from homeassistant.util import dt as dt_util

from .const import (
    ART_CONTAINER,
    CONF_ART,
    CONF_BEGINN,
    CONF_BEREICH,
    CONF_ENDE,
    CONF_ENERGIE,
    CONF_HEIZPERIODE_BIS,
    CONF_HEIZPERIODE_VON,
    CONF_ROLLE,
    CONF_STATUS,
    CONF_TYP,
    DOMAIN,
    ROLLE_HEIZKOERPER,
    ROLLE_PUMPE,
    STATUS_AKTIV,
    SUB_BEREICH,
    SUB_GERAET,
)
from .logik import auswertung as a, preise as preise_logik
from .logik import ruecksprung, zeitraum
from .logik.abrechnung import EIGEN

if TYPE_CHECKING:
    from .steuerung import Steuerung

Statistik = dict[str, list[dict[str, Any]]]


# ------------------------------------------------------------------ Quelle: eine Baustelle



def beginn_der_baustelle(entry: ConfigEntry) -> tuple[date, bool]:
    """Beginn der Baustelle nach `logik/zeitraum` (leer = Tag der Anlage) und ob er automatisch gilt (AN-0002)."""
    wert = entry.options.get(CONF_BEGINN)
    angelegt = dt_util.as_local(entry.created_at).date()
    return zeitraum.beginn(date.fromisoformat(wert) if wert else None, angelegt), not wert

@dataclass
class Quelle:
    """Eine Baustelle, wie die Auswertung sie braucht (geladen: aus der Steuerung, sonst aus der Einrichtung)."""

    entry: ConfigEntry
    st: Steuerung | None
    ids: dict[str, str]   # unique_id → entity_id der eigenen Sensoren
    bereiche: list[dict[str, Any]]   # {"id", "name", "art"}
    geraete: list[dict[str, Any]]   # {"id", "bereich", "rolle", "typ", "energie"}, nach Bereichen geordnet

    def eid(self, besitzer: str, key: str) -> str | None:
        return self.ids.get(f"{besitzer}_{key}")

    @property
    def zaehler(self) -> dict[str, Any]:
        return self.st.zaehler if self.st is not None else {}

    @property
    def preis(self) -> float:
        return float(self.st.e["preis"]) if self.st is not None else 0.0

    @property
    def preise(self) -> list[tuple[date, float]]:
        """Strompreis mit „gilt ab“ (logik/preise)."""
        return preise_logik.liste(self.st.e.get("preise") if self.st is not None else None, self.preis)

    def m2(self, bereich: str) -> float | None:
        """Fläche innen des Containers (AN-0014); None = Einzelcontainer."""
        return self.st.einstellungen.bereich(bereich).get("groesse_m2") if self.st is not None else None

    def option_datum(self, key: str) -> date | None:
        wert = self.entry.options.get(key)
        return date.fromisoformat(wert) if wert else None

    @property
    def beginn(self) -> date:
        return beginn_der_baustelle(self.entry)[0]

    def baustelle(self) -> dict[str, Any]:
        """Baustelle in der Form von `logik/auswertung` (Firmen und Zuordnung für die Abrechnung)."""
        e = self.st.e if self.st is not None else {}
        return {
            "entry": self.entry.entry_id, "titel": self.entry.title,
            "firmen": e.get("firmen") or [a.EIGENE_FIRMA], "zuordnung": e.get("zuordnung") or [],
            "bereiche": [{"id": b["id"], "name": b["name"]} for b in self.bereiche],
        }

    def energie_ids(self, bid: str) -> list[str]:
        """Energie eines Containers: sein Sensor, sonst die Energiezähler seiner Geräte (wie die Seite)."""
        eigen = self.eid(bid, "energie")
        return [eigen] if eigen else [g["energie"] for g in self.geraete if g["bereich"] == bid and g["energie"]]

    def pumpen(self) -> list[dict[str, Any]]:
        return [g for g in self.geraete if g["rolle"] == ROLLE_PUMPE]


def quelle(hass: HomeAssistant, entry: ConfigEntry) -> Quelle:
    registry = er.async_get(hass)
    ids = {e.unique_id: e.entity_id for e in er.async_entries_for_config_entry(registry, entry.entry_id)}
    st: Steuerung | None = getattr(entry, "runtime_data", None)
    bereiche: list[dict[str, Any]]
    geraete: list[dict[str, Any]]
    if st is not None:
        bereiche = [{"id": b.id, "name": b.name, "art": b.art} for b in st.bereiche.values()]
        geraete = [{"id": g.id, "bereich": g.bereich, "rolle": g.rolle, "typ": g.typ, "energie": g.energie}
                   for g in st.geraete.values()]
    else:
        subs = list(entry.subentries.values())
        bereiche = [{"id": s.subentry_id, "name": s.title, "art": s.data.get(CONF_ART)}
                    for s in subs if s.subentry_type == SUB_BEREICH]
        geraete = [{"id": s.subentry_id, "bereich": s.data.get(CONF_BEREICH), "rolle": s.data.get(CONF_ROLLE),
                    "typ": s.data.get(CONF_TYP), "energie": s.data.get(CONF_ENERGIE)}
                   for s in subs if s.subentry_type == SUB_GERAET]
    geraete = [g for b in bereiche for g in geraete if g["bereich"] == b["id"]]
    return Quelle(entry, st, ids, bereiche, geraete)


def laufende(hass: HomeAssistant) -> list[ConfigEntry]:
    """Alle laufenden Baustellen (Auswertung „Alle laufenden“)."""
    return [e for e in hass.config_entries.async_entries(DOMAIN) if e.options.get(CONF_STATUS, STATUS_AKTIV) == STATUS_AKTIV]


# ------------------------------------------------------------------ Langzeitstatistik


async def async_statistik(
    hass: HomeAssistant, ids: Iterable[str | None], start: datetime, ende: datetime, periode: str, arten: set[str]
) -> Statistik:
    """Langzeitstatistik wie `recorder/statistics_during_period` (Periode hour/day/month/5minute).

    BSM-014: zuerst aus der eigenen Datenbank (`db/statistik`), was sie nicht kennt aus der HA-Statistik (ohne Recorder
    leer). Gleiche Form wie HA – Auswertung, Abrechnung, Bericht und CSV merken keinen Unterschied.
    """
    gesucht: set[str] = {i for i in ids if i}
    if not gesucht:
        return {}
    from .db.statistik import async_aus_datenbank  # noqa: PLC0415 – db → auswertung (Kreis beim Import)

    ergebnis, rest = await async_aus_datenbank(hass, gesucht, start, ende, periode)
    if not rest or "recorder" not in hass.config.components:
        return ergebnis
    daten = await _aus_ha(hass, set(rest), start, ende, periode, arten)
    if "change" in arten:
        daten = await _zaehler_bereinigen(hass, daten, start, ende, periode)
    return {**daten, **ergebnis}


async def _aus_ha(hass: HomeAssistant, ids: set[str], start: datetime, ende: datetime, periode: str, arten: set[str]) -> Statistik:
    """HA-Langzeitstatistik (`statistics_during_period`) so, wie HA sie liefert."""
    from homeassistant.components.recorder.statistics import statistics_during_period  # noqa: PLC0415
    from homeassistant.helpers.recorder import get_instance  # noqa: PLC0415

    daten = await get_instance(hass).async_add_executor_job(
        statistics_during_period, hass, start, ende, ids, periode, None, arten
    )
    return cast(Statistik, daten)


def _ausgleich(hass: HomeAssistant, ids: Iterable[str]) -> dict[str, list[tuple[float, float]]]:
    """Ausgleich nachgetragener Zähler (`baustelle/zaehler_korrigieren`) je Statistik-ID der geladenen Baustellen."""
    gesucht, reg = set(ids), er.async_get(hass)
    je: dict[str, list[tuple[float, float]]] = {}
    for entry in hass.config_entries.async_loaded_entries(DOMAIN):
        st: Steuerung | None = getattr(entry, "runtime_data", None)
        if st is None or not st.e.get("korrekturen"):
            continue
        for sensor, liste in ruecksprung.ausgleich(st.e["korrekturen"]).items():
            entity_id = reg.async_get_entity_id("sensor", DOMAIN, f"{entry.entry_id}_{sensor}")
            if entity_id in gesucht:
                je.setdefault(entity_id, []).extend(liste)
    return je


async def _zaehler_bereinigen(hass: HomeAssistant, daten: Statistik, start: datetime, ende: datetime, periode: str) -> Statistik:
    """FE-0029: Zähler aus der HA-Statistik nach `logik/ruecksprung` – Rücksprung zählt 0, Nachtrag ohne Sprung. Je
    Stunde (bzw. 5 Minuten) bereinigt; Tag, Woche und Monat als Summe der bereinigten Stunden. Die eigene Datenbank
    rechnet aus den Minuten und kennt keine Rücksprünge."""
    zaehler = {sid for sid, punkte in daten.items() if any(a.ist_zahl(p.get("change")) for p in punkte)}
    if not zaehler:
        return daten
    ausgleich = _ausgleich(hass, zaehler)
    if periode in ("5minute", "hour"):
        return {sid: ruecksprung.bereinigt(p, ausgleich.get(sid, ())) if sid in zaehler else p for sid, p in daten.items()}
    stunden = await _aus_ha(hass, zaehler, start, ende, "hour", {"change"})
    return {sid: ruecksprung.zusammenfassen(p, ruecksprung.bereinigt(stunden.get(sid, []), ausgleich.get(sid, ())))
            if sid in zaehler else p for sid, p in daten.items()}


def _zone() -> tzinfo:
    return dt_util.get_default_time_zone()


async def async_je_tag(hass: HomeAssistant, ids: dict[str, str], von: date, bis: date) -> dict[str, dict[date, float]]:
    """Änderung je Tag (von–bis einschließlich) je Schlüssel (`{schlüssel: entity_id}`) – für den Bericht."""
    zone = _zone()
    roh = await async_statistik(hass, ids.values(), a.mitternacht(von, zone),
                                a.mitternacht(date.fromordinal(bis.toordinal() + 1), zone), "day", {"change"})
    ergebnis: dict[str, dict[date, float]] = {}
    for key, entity_id in ids.items():
        for p in roh.get(entity_id, []):
            ergebnis.setdefault(key, {})[a.lokal(p["start"], zone).date()] = float(p.get("change") or 0.0)
    return ergebnis


def _zeitraum_dict(zr: a.Zeitraum) -> dict[str, Any]:
    return {"art": zr.art, "von": zr.von.isoformat(), "bis": zr.bis.isoformat(), "periode": zr.periode, "n": zr.n,
            "labels": list(zr.labels), "monat": zr.monat, "jahr": zr.jahr}


# ------------------------------------------------------------------ Abrechnung nach Firma


def werte_je_tag(q: Quelle, je_tag: dict[str, dict[date, float]]) -> dict[str, list[tuple[datetime, float]]]:
    """kWh je Container und Tag (Bericht) in der Form von `logik/auswertung.abrechnung`."""
    zone = _zone()
    return {b["id"]: [(a.mitternacht(t, zone), k) for t, k in sorted(je_tag.get(b["id"], {}).items())] for b in q.bereiche}


def preis_fn(quellen: list[Quelle], preis_sim: float | None = None) -> Callable[[str, date], float] | None:
    """Preis je Baustelle und Tag (Strompreis mit „gilt ab“); beim Simulieren keiner – dann gilt der eine Preis."""
    if preis_sim is not None:
        return None
    preise = {q.entry.entry_id: q.preise for q in quellen}
    return lambda entry, tag: preise_logik.preis_am(preise[entry], tag)


def abrechnung_daten(
    quellen: list[Quelle], werte: Mapping[str, Mapping[str, Sequence[tuple[Any, float | None]]]], preis: float,
    pfn: Callable[[str, date], float] | None = None,
) -> list[dict[str, Any]]:
    """Abrechnung je Firma und Container mit € und Anteil, Namen der Container und Baustellen (Seite und Bericht)."""
    zone = _zone()
    daten = a.abrechnung_geld(a.abrechnung([q.baustelle() for q in quellen], werte, zone, pfn), preis)
    titel = {q.entry.entry_id: q.entry.title for q in quellen}
    namen = {(q.entry.entry_id, b["id"]): b["name"] for q in quellen for b in q.bereiche}
    return [
        {**z, "id": EIGEN if z["eigen"] else z["firma"],
         "container": [{**c, "titel": titel[c["entry"]], "name": namen[(c["entry"], c["bereich"])]} for c in z["container"]]}
        for z in daten
    ]


def csv_abrechnung(quellen: list[Quelle], daten: list[dict[str, Any]], zeitraum: str, preis: float) -> str:
    """Abrechnung je Firma und Container als CSV-Datei (Seite „Abrechnung als CSV“ und Anhang des Berichts)."""
    return a.csv_text(a.csv_firma(daten, [q.baustelle() for q in quellen], zeitraum, preis))


async def async_abrechnung(
    hass: HomeAssistant, entry: ConfigEntry, art: str, versatz: int = 0, scope: str = "diese", preis_sim: float | None = None
) -> dict[str, Any]:
    """Befehl `baustelle/abrechnung`: Tabelle je Firma und Container, Verbrauch je Firma und Periode, beide CSV."""
    zone, heute = _zone(), dt_util.now().date()
    zr = a.zeitraum(art, heute, versatz)
    haupt = quelle(hass, entry)
    quellen = [haupt] if scope == "diese" else [quelle(hass, e) for e in laufende(hass)]
    preis = haupt.preis if preis_sim is None else preis_sim
    pfn = preis_fn(quellen, preis_sim)   # jeder Tag mit dem Preis, der damals galt; beim Simulieren der eine Preis
    # Tag je Stunde, sonst je Tag (auch beim Jahr: die Firma gilt je Tag)
    periode = "hour" if zr.periode == "hour" else "day"
    ids = [i for q in quellen for b in q.bereiche for i in q.energie_ids(b["id"])]
    roh = await async_statistik(hass, ids, a.mitternacht(zr.von, zone), a.mitternacht(zr.bis, zone), periode, {"change"})
    je_periode = a.reihen(zr, {i: roh.get(i, []) for i in ids}, zone)
    werte: dict[str, dict[str, list[tuple[Any, float | None]]]] = {}
    werte_zeitraum: dict[str, dict[str, list[tuple[Any, float | None]]]] = {}
    for q in quellen:
        eid = q.entry.entry_id
        werte[eid], werte_zeitraum[eid] = {}, {}
        for b in q.bereiche:
            teile = q.energie_ids(b["id"])
            je: dict[datetime, float] = {}
            for sid in teile:
                for p in roh.get(sid, []):
                    t = a.zeitpunkt(p["start"])
                    je[t] = je.get(t, 0.0) + (float(p["change"]) if a.ist_zahl(p.get("change")) else 0.0)
            werte[eid][b["id"]] = sorted(je.items())
            v = a.verbrauch(je_periode, teile, zr.n)
            werte_zeitraum[eid][b["id"]] = [(zr.beginn(i, zone), v[i]) for i in range(zr.n)]
    daten = abrechnung_daten(quellen, werte, preis, pfn)
    baustellen = [q.baustelle() for q in quellen]
    kwh, eur = sum(z["kwh"] for z in daten), sum(z["eur"] for z in daten)
    if pfn is not None:
        preis = eur / kwh if kwh else preise_logik.preis_am(haupt.preise, zr.bis - timedelta(days=1))   # Mittel im Zeitraum
    return {
        "zeitraum": _zeitraum_dict(zr), "preis": preis, "simuliert": preis_sim is not None, "kwh": kwh, "firmen": daten,
        "reihen": a.firmen_reihen(baustellen, werte, zr, zone),
        "csv": {"firma": csv_abrechnung(quellen, daten, art, preis),
                "verbrauch": a.csv_text(a.csv_verbrauch(baustellen, werte_zeitraum, zr, preis, zone, pfn))},
    }


# ------------------------------------------------------------------ Auswertung
async def _preis_zeitraum(hass: HomeAssistant, quellen: list[Quelle], zr: a.Zeitraum) -> float:
    """Preis eines Zeitraums: Tagespreise gewichtet mit dem Verbrauch je Tag (logik/preise) – alle € der Auswertung
    passen so zur Summe der Tage. Mehrere Baustellen: gemeinsam gewichtet."""
    zone, bis = _zone(), zr.bis - timedelta(days=1)
    ids = {q.entry.entry_id: q.eid(q.entry.entry_id, "energie") for q in quellen}
    roh = await async_statistik(hass, [i for i in ids.values() if i], a.mitternacht(zr.von, zone), a.mitternacht(zr.bis, zone), "day", {"change"})
    kwh = geld = 0.0
    for q in quellen:
        punkte = [(a.lokal(p["start"], zone).date(), float(p["change"]) if a.ist_zahl(p.get("change")) else None)
                  for p in roh.get(ids[q.entry.entry_id] or "", [])]
        k = sum(v for _, v in punkte if v and v > 0)
        kwh += k
        geld += k * preise_logik.preis_mittel(q.preise, punkte, bis)
    return geld / kwh if kwh > 0 else preise_logik.preis_am(quellen[0].preise, bis)




def _zustand(hass: HomeAssistant, entity_id: str | None) -> float | None:
    s = hass.states.get(entity_id) if entity_id else None
    return float(s.state) if s is not None and a.ist_zahl(s.state) else None


async def _summen(hass: HomeAssistant, q: Quelle, zr: a.Zeitraum) -> dict[str, Any]:
    """kWh, Heizzeit (Container), Pumpzeit und „ohne Automatik“ einer Baustelle im Zeitraum; dazu die Pumpzeit je Pumpe."""
    zone, eid = _zone(), q.entry.entry_id
    container = [b for b in q.bereiche if b["art"] == ART_CONTAINER]
    alle = [*(i for b in q.bereiche for i in q.energie_ids(b["id"])), *(q.eid(b["id"], "heizzeit") for b in container),
            *(q.eid(g["id"], "pumpzeit") for g in q.pumpen()), q.eid(eid, "energie_ohne_automatik")]
    ids = [i for i in alle if i]
    roh = await async_statistik(hass, ids, a.mitternacht(zr.von, zone), a.mitternacht(zr.bis, zone), zr.periode,
                                {"change", "mean"})
    w = a.reihen(zr, {i: roh.get(i, []) for i in ids}, zone)
    leer: list[float | None] = [None] * zr.n
    pumpzeit = {g["id"]: w.get(q.eid(g["id"], "pumpzeit") or "", leer) for g in q.pumpen()}
    return {
        "kwh": sum(a.summe(a.verbrauch(w, q.energie_ids(b["id"]), zr.n)) for b in q.bereiche),
        "heizzeit": sum(a.summe(w.get(q.eid(b["id"], "heizzeit") or "", leer)) for b in container),
        "pumpzeit": sum(a.summe(v) for v in pumpzeit.values()),
        "ohne": a.summe(w.get(q.eid(eid, "energie_ohne_automatik") or "", leer)),
        # je Periode (Kachel „Gespart“): Verbrauch mit Automatik und „ohne Automatik“; ohne jeden Wert None
        "mit_je": a.reihe_offen([w.get(i, leer) for b in q.bereiche for i in q.energie_ids(b["id"])], zr.n),
        "ohne_je": a.reihe_offen([w.get(q.eid(eid, "energie_ohne_automatik") or "", leer)], zr.n),
        "pumpzeit_je": pumpzeit,
        # je Container (Rangliste der Auswertung, WU-0005)
        "je_container": [{"bereich": b["id"], "name": b["name"], "baustelle": q.entry.title,
                          "kwh": a.summe(a.verbrauch(w, q.energie_ids(b["id"]), zr.n)),
                          "heizzeit": a.summe(w.get(q.eid(b["id"], "heizzeit") or "", leer)), "m2": q.m2(b["id"])} for b in container],
    }


async def async_verlauf(hass: HomeAssistant, q: Quelle) -> dict[str, Any]:
    """Verlauf einer Baustelle: Kennzahlen (kWh, €, gespart, Heiztage, Monate, Vergleich), kWh je Monat, Verbrauch je
    Monat und Container mit CSV (Seite „Verlauf“ und Detailseite)."""
    zone, heute, eid = _zone(), dt_util.now().date(), q.entry.entry_id
    beginn, ende = q.beginn, q.option_datum(CONF_ENDE)
    von, bis = a.verlauf_zeitraum(heute, beginn, ende)
    energie = q.eid(eid, "energie")
    heizzeit = {b["id"]: i for b in q.bereiche if b["art"] == ART_CONTAINER and (i := q.eid(b["id"], "heizzeit"))}
    strom = {b["id"]: i for b in q.bereiche if b["art"] == ART_CONTAINER and (i := q.eid(b["id"], "heizzeit_strom"))}
    roh = await async_statistik(hass, [energie, *heizzeit.values(), *strom.values()], a.mitternacht(von, zone),
                                a.mitternacht(bis, zone), "day", {"change"})
    vw = a.verlauf_werte(roh.get(energie) if energie else None, {b: roh.get(i, []) for b, i in heizzeit.items()}, zone,
                         beginn, q.zaehler.get("heiztage"), {b: roh.get(i, []) for b, i in strom.items()})
    zustaende = {k: _zustand(hass, q.eid(eid, k)) for k in ("energie", "kosten", "ersparnis")}
    kennzahlen = a.kennzahlen(q.zaehler, zustaende, q.preis, len(q.bereiche), vw["heiztage"], vw["monate"])
    # Verbrauch je Monat und Container
    m_von, m_bis, monate = a.monate_zeitraum(heute, beginn, ende)
    bereiche = [{"id": b["id"], "name": b["name"], "energie": q.eid(b["id"], "energie")} for b in q.bereiche]
    roh_m = await async_statistik(hass, [b["energie"] for b in bereiche], a.mitternacht(m_von, zone),
                                  a.mitternacht(m_bis, zone), "month", {"change"})
    je_monat = a.monate_je_container(monate, bereiche, roh_m, zone)
    return {
        **kennzahlen, "je_monat": vw["je_monat"], "je_tag": vw["je_tag"],   # je_tag: Chronik der Seite (WU-0006)
        "monate_je_container": {"labels": je_monat["labels"],
                                "reihen": [{"bereich": b["id"], **r, **x} for b, r, x in
                                           zip(bereiche, je_monat["reihen"], a.monate_summen(je_monat["reihen"], q.preis),
                                               strict=True)]},
        "csv": a.csv_text(a.csv_monate(q.entry.title, q.preis, je_monat)),
    }


async def async_ohne(
    hass: HomeAssistant, entry: ConfigEntry, bereich: str, art: str, versatz: int = 0, basis: str = "geraet"
) -> dict[str, Any]:
    """Befehl `baustelle/ohne` (WU-0013): „ohne Automatik“ eines Containers im Zeitraum – seine Heizkörper mit ihrer
    Ø-Leistung im Betrieb (je Gerät gemessen oder je Typ gemittelt) 24/7 ab Beginn der Baustelle bis jetzt, dazu der
    tatsächliche Verbrauch und das Gesparte."""
    zone, jetzt = _zone(), dt_util.now()
    zr = a.zeitraum(art, jetzt.date(), versatz)
    q = quelle(hass, entry)
    heizer_alle = [g for g in q.geraete if g["rolle"] == ROLLE_HEIZKOERPER]
    mittel = {g["id"]: (q.st.zaehler.get(f"mittel:{g['id']}") if q.st is not None else None) for g in heizer_alle}
    inaktiv = {g["id"] for g in heizer_alle if q.st is not None and (i := q.st.geraete.get(g["id"])) is not None and not q.st.geraet_aktiv(i)}
    kw = a.ohne_kw([(g["id"], str(g["typ"] or "")) for g in heizer_alle], mittel, basis, inaktiv)   # FE-0020
    eigene = [g for g in heizer_alle if g["bereich"] == bereich]
    kw_summe = sum(kw.get(g["id"], 0.0) for g in eigene)
    beginn, _ = beginn_der_baustelle(entry)
    stunden = a.stunden_je_periode(zr, a.mitternacht(beginn, zone), jetzt, zone)
    reihe = [round(kw_summe * h, 3) for h in stunden]
    ids = q.energie_ids(bereich)
    roh = await async_statistik(hass, ids, a.mitternacht(zr.von, zone), a.mitternacht(zr.bis, zone), zr.periode, {"change"}) if ids else {}
    w = a.reihen(zr, {i: roh.get(i, []) for i in ids}, zone)
    kwh = a.summe(a.verbrauch(w, ids, zr.n))
    ohne = a.summe(reihe)
    return {"zeitraum": _zeitraum_dict(zr), "basis": basis, "preis": q.preis, "kw": round(kw_summe, 3), "reihe": reihe,
            "ohne_kwh": ohne, "kwh": kwh, "ergebnis": a.ohne_automatik(kwh, ohne, q.preis),
            "geraete": [{"id": g["id"], "typ": g["typ"], "kw": kw.get(g["id"])} for g in eigene]}


async def async_auswertung(
    hass: HomeAssistant, entry: ConfigEntry, art: str, versatz: int = 0, scope: str = "diese", preis_sim: float | None = None
) -> dict[str, Any]:
    """Befehl `baustelle/auswertung`: Kennzahlen des Zeitraums (mit Vergleich zum Zeitraum davor), Ohne Automatik, Je
    Gerät, Wetter-Einfluss, Ölradiator/Konvektor und Heizperiode."""
    zone, heute, eid = _zone(), dt_util.now().date(), entry.entry_id
    zr, zr_vorher = a.zeitraum(art, heute, versatz), a.zeitraum(art, heute, versatz + 1)
    q = quelle(hass, entry)
    quellen = [q] if scope == "diese" else [q if e.entry_id == eid else quelle(hass, e) for e in laufende(hass)]
    jetzt = [await _summen(hass, x, zr) for x in quellen]
    vorher = [await _summen(hass, x, zr_vorher) for x in quellen]
    summen = {k: sum(s[k] for s in jetzt) for k in ("kwh", "heizzeit", "pumpzeit", "ohne")}
    davor = {k: sum(s[k] for s in vorher) for k in ("kwh", "heizzeit", "pumpzeit")}
    vorher_ganz = all(x.beginn <= zr_vorher.von for x in quellen)   # Zeitraum davor ganz in der Baustelle?
    preis = preis_sim if preis_sim is not None else await _preis_zeitraum(hass, quellen, zr)
    # Je Gerät (diese Baustelle): kWh aus den Energiezählern der Geräte, Pumpzeit aus der Statistik
    eigene = next((s for x, s in zip(quellen, jetzt, strict=True) if x is q), None) or await _summen(hass, q, zr)
    g_ids = sorted({g["energie"] for g in q.geraete if g["energie"]})
    roh_g = await async_statistik(hass, g_ids, a.mitternacht(zr.von, zone), a.mitternacht(zr.bis, zone), zr.periode,
                                  {"change"})
    # Ölradiator oder Konvektor: Heiztage wie im Verlauf (Zähler, sonst aus der Heizzeit)
    verlauf = await async_verlauf(hass, q)
    # Ölradiator oder Konvektor – fair (AN-0008): nur Zeiten im Modus Thermostat mit Fühler, kWh je Gradstunde
    from .funktionen.heizung import Heizung   # hier, sonst Kreis-Import (heizung → steuerung → auswertung)
    z = q.zaehler
    typ = a.typ_vergleich_fair([
        {"id": b["id"], "name": b["name"], "typen": [g["typ"] for g in q.geraete if g["bereich"] == b["id"] and g["rolle"] == ROLLE_HEIZKOERPER],
         "fuehler": bool(q.st and q.st.bereiche.get(b["id"]) and q.st.bereiche[b["id"]].fuehler),
         "modus": Heizung.von(q.st).modus(b["id"]) if q.st is not None else None,
         "kwh": z.get(f"vgl_kwh:{b['id']}"), "gradh": z.get(f"vgl_gradh:{b['id']}"),
         "auf": z.get(f"vgl_aufheiz:{b['id']}"), "ab": z.get(f"vgl_abkuehl:{b['id']}"), "m2": q.m2(b["id"]),
         **_heizkoerper_kw(q, b["id"])}   # FE-0023/AN-0016: Geräte und kW je Seite, Aufheizen je kW
        for b in q.bereiche if b["art"] == ART_CONTAINER
    ])
    typ["seit"] = z.get("seit")   # FE-0023: die vgl-Zähler laufen seit Zählbeginn, nicht nur im gewählten Zeitraum
    # Was die Ölradiatoren gegenüber Konvektoren gespart haben – ihr Verbrauch im Zeitraum, umgerechnet (AN-0008)
    oel_ids = [i for bid in typ["oelradiator"]["ids"] for i in q.energie_ids(bid)]
    typ["ersparnis"] = None
    if typ["vergleichbar"] and oel_ids:
        roh_o = await async_statistik(hass, oel_ids, a.mitternacht(zr.von, zone), a.mitternacht(zr.bis, zone), zr.periode, {"change"})
        oel = a.verbrauch(a.reihen(zr, {i: roh_o.get(i, []) for i in oel_ids}, zone), oel_ids, zr.n)
        typ["ersparnis"] = a.typ_ersparnis(oel, typ, preis)
    rang = a.rangliste([c for s in jetzt for c in s["je_container"]], preis)
    hr_werte, hr_erg = _hochrechnung(q)
    wetter = a.wetter_aus_signatur((hr_erg or {}).get("signatur"), preis)   # BSM-033: Energiesignatur der Baustelle
    gerade = wetter["gerade"]
    oa = a.ohne_automatik(summen["kwh"], summen["ohne"], preis)
    gespart = a.gespart_reihen(a.reihe_offen([x["mit_je"] for x in jetzt], zr.n), a.reihe_offen([x["ohne_je"] for x in jetzt], zr.n), preis)
    hp_von = min(12, max(1, int(entry.options.get(CONF_HEIZPERIODE_VON) or 10)))
    hp_bis = min(12, max(1, int(entry.options.get(CONF_HEIZPERIODE_BIS) or 4)))
    return {
        "zeitraum": _zeitraum_dict(zr), "preis": preis, "simuliert": preis_sim is not None,
        "summen": {**summen, "eur": a.geld(summen["kwh"], preis), "vorher": davor,
                   "veraenderung": {k: a.veraenderung(summen[k], davor[k], vorher_ganz) for k in davor},
                   "ohne_automatik": oa},
        # Kachel „Gespart“ (Herbert 28.10.2026): je Periode mit, ohne (24/7) und gespart in kWh und € – über `scope`
        "gespart_reihen": gespart,
        # Rangliste der Container und „Was fällt auf“ (WU-0005, logik/auswertung) – über `scope`
        "rangliste": rang,
        "erkenntnisse": a.erkenntnisse(rang, ohne=oa, gerade=gerade, veraenderung_kwh=a.veraenderung(summen["kwh"], davor["kwh"], vorher_ganz),
                                       typ_weniger=typ.get("weniger") if isinstance(typ, dict) else None),
        "je_geraet": [{**z, "eur": a.geld(z["kwh"], preis)}
                      for z in a.je_geraet(q.geraete, q.zaehler, roh_g, eigene["pumpzeit_je"])],
        "wetter": wetter,
        "typ": typ,
        "heizperiode": {"ende": a.heizperiode_ende(heute, hp_von, hp_bis).isoformat(),
                        "bis": a.heizperiode_bis(heute, hp_von, hp_bis, q.option_datum(CONF_ENDE)).isoformat()},
        "heiztage": verlauf["heiztage"],
        # Hochrechnung (Sensoren prognose_heizperiode*, Zähler energie_heizen) in kWh und € – die Seite zeigt sie nur an
        "hochrechnung": a.hochrechnung_signatur(
            a.hochrechnung_werte(q.zaehler.get("energie_heizen"), _zustand(hass, q.eid(eid, "prognose_heizperiode")),
                                 _zustand(hass, q.eid(eid, "prognose_heizperiode_ohne")), preis),
            hr_werte, hr_erg, preis),
        # BSM-033.09: Schattenprognose V2 – ausdrücklich getrennt von „hochrechnung“ (Legacy), die Seite nutzt sie noch nicht
        "prognose_v2": _prognose_v2(q),
    }


def _prognose_v2(q: Quelle) -> dict[str, Any] | None:
    if q.st is None:
        return None
    from .funktionen.heizung import Heizung   # noqa: PLC0415  (Kreis-Import, wie oben)
    from .funktionen.heizung.prognose_schatten import zusammenfassung   # noqa: PLC0415

    return zusammenfassung(Heizung.von(q.st).prognose_v2)


def _heizkoerper_kw(q: Quelle, bid: str) -> dict[str, Any]:
    """Heizkörper eines Containers: wie viele und ihre eingebaute Leistung (kW); ohne Steuerung (andere Baustelle) nur
    die Anzahl."""
    if q.st is None:
        return {"anzahl": sum(1 for g in q.geraete if g["bereich"] == bid and g["rolle"] == ROLLE_HEIZKOERPER), "kw": None}
    heizer = [g for g in q.st.geraete_in(bid) if g.rolle == ROLLE_HEIZKOERPER]
    return {"anzahl": len(heizer), "kw": round(sum(q.st.nenn_kw(g) for g in heizer), 2) if heizer else None}


def _hochrechnung(q: Quelle) -> tuple[dict[str, Any] | None, dict[str, Any] | None]:
    """Hochrechnung mit Signatur der Heizung (BSM-033.02): (Werte der Baustelle, letztes Ergebnis)."""
    if q.st is None:
        return None, None
    from .funktionen.heizung import Heizung   # noqa: PLC0415  (Kreis-Import, wie oben)
    from .funktionen.heizung.hochrechnung import werte   # noqa: PLC0415

    hz = Heizung.von(q.st)
    return werte(hz), hz.hochrechnung
