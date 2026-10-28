"""Heizung: Hochrechnung der Heizperiode mit Energiesignatur und Heizgradtagen (BSM-033.02, Bauplan Hochrechnung §4).

Beim Start und stündlich (:50, damit „bisher“ mit heute frisch bleibt; BSM-033.03): je Container die Tage der laufenden Heizperiode aus
der Datenbank (`db/tage.hochrechnung_tage`), dazu die Vorhersage der nächsten Tage (Tagesmittel aus `wetter_tage`) und
die Klimamittel (Einstellung `heizung.klimamittel`, sonst Vorgabe). Gerechnet wird nur in `logik/hochrechnung`; das
Ergebnis liegt bei der Heizung (`Heizung.hochrechnung`) – Sensor `prognose_heizperiode` und `baustelle/auswertung`
lesen es; dazu für die Karte „Heizperiode“ die Tagesreihe, die Punkte der Signatur je Container, Klimamittel und
Vorhersage. Ohne Datenbank bleibt es bei der bisherigen Hochrechnung (Tagesschnitt seit Zählbeginn).

FE-0030: Heiztage je Container nach dem Heizplan (`heiztage`): Arbeitszeiten, Ausnahmen und Feiertage/Urlaub der ganzen
Heizperiode (Kalender, `kern/kalender.async_frei_tage`), Modus des Containers; Regel in `logik/hochrechnung.heiztage_container`.
"""

from __future__ import annotations

from collections.abc import Callable, Mapping
from dataclasses import replace
from datetime import date, datetime, timedelta
import logging
from typing import TYPE_CHECKING, Any

from homeassistant.core import HomeAssistant, callback
from homeassistant.helpers.event import async_track_time_change
from homeassistant.util import dt as dt_util

from ...const import CONF_ENDE, CONF_HEIZPERIODE_BIS, CONF_HEIZPERIODE_VON, ROLLE_HEIZKOERPER
from ...db import DATA_DB
from ...kern.staffelung import nenn_kw
from ...db.tage import hochrechnung_tage, stunden
from ...kern.kalender import async_frei_tage
from ..basis import mitternacht
from ...logik import baseline as b, hochrechnung as h, tagesverlauf as tv
from ...logik.arbeitszeit import WetterTag, tagesplan
from ...logik.signatur import Tag, berechnen
from ...logik.auswertung import heizperiode_bis, heizperiode_ende

from . import baseline as h_baseline, zaehlen as h_zaehlen

if TYPE_CHECKING:
    from ...steuerung import Steuerung
    from . import Heizung

_LOGGER = logging.getLogger(__name__)
STUENDLICH = {"minute": 50, "second": 0}


def zeitraum(st: Steuerung, heute: date) -> tuple[date, date]:
    """Erster und letzter Tag der laufenden Heizperiode (Ende der Baustelle, wenn früher)."""
    o = st.entry.options
    von = min(12, max(1, int(o.get(CONF_HEIZPERIODE_VON) or 10)))
    bis = min(12, max(1, int(o.get(CONF_HEIZPERIODE_BIS) or 4)))
    ende_hp = heizperiode_ende(heute, von, bis)
    beginn = date(ende_hp.year - (bis < von), von, 1)
    ende = o.get(CONF_ENDE)
    return beginn, heizperiode_bis(heute, von, bis, date.fromisoformat(ende) if ende else None)


def vorhersage(st: Steuerung, heute: date) -> dict[date, float]:
    """Tagesmittel der Vorhersage ab morgen (`wetter_tage`, kern/wetter)."""
    aus: dict[date, float] = {}
    for iso, werte in (st.lz.get("wetter_tage") or {}).items():
        tag = date.fromisoformat(iso)
        if tag > heute and isinstance(werte.get("mittel"), (int, float)):
            aus[tag] = float(werte["mittel"])
    return aus


def _signatur(tage: list[Tag]) -> dict[str, Any]:
    """Signatur der ganzen Baustelle (Kachel „Wetter“, Erkenntnis „je Grad kälter“) mit ihren Punkten."""
    sig = berechnen(tage)
    return {"stand": sig.stand, "tage": sig.tage, "grenze": sig.grenze, "kwh_je_grad": sig.kwh_je_grad, "grundlast": sig.grundlast,
            "bezug": sig.bezug, "cv_rmse": sig.cv_rmse, "punkte": [[round(t.aussen, 2), round(t.kwh, 2)] for t in tage]}


def aussen_heute(st: Steuerung, heute: date, roh: dict[str, list[h.TagRoh]]) -> float | None:
    """Außentemperatur für den Rest von heute: Tagesmittel der Vorhersage, sonst das bis jetzt gemessene Mittel."""
    mittel = ((st.lz.get("wetter_tage") or {}).get(heute.isoformat()) or {}).get("mittel")
    if isinstance(mittel, (int, float)):
        return float(mittel)
    gemessen = [t.aussen for liste in roh.values() for t in liste if t.datum == heute and t.aussen is not None]
    return sum(gemessen) / len(gemessen) if gemessen else None


def rest_heute(jetzt: datetime) -> float:
    """Anteil des heutigen Tages, der noch kommt (0–1; Sommerzeit: 23 h / 25 h)."""
    beginn = dt_util.start_of_local_day(jetzt)
    morgen = dt_util.start_of_local_day(jetzt.date() + timedelta(days=1))
    return max(0.0, min(1.0, (morgen - jetzt).total_seconds() / (morgen - beginn).total_seconds()))


def heiztage(hz: Heizung, beginn: date, ende: date, frei: Mapping[str, set[date]] | None = None
             ) -> dict[str, frozenset[date] | None]:
    """Heiztage je Container (FE-0030): Tage mit Heizplan der Baustelle (`logik/arbeitszeit.tagesplan` – Arbeitszeit,
    Ausnahmen, frei an Feiertag/Urlaub); `frei` = Feiertage/Urlaub aus den Kalendern für die ganze Heizperiode, dazu die
    der laufenden Wochen. Welche Container wie zählen, sagt `logik/hochrechnung.heiztage_container`."""
    st, f = hz.st, frei or {}
    az, ausn, regeln = st.arbeitszeiten(), st.ausnahmen(), hz.heiz_regeln()

    def art(d: date) -> str | None:
        return "urlaub" if d in f.get("urlaub", ()) else "feiertag" if d in f.get("feiertag", ()) else None

    alle = h.tage(beginn, ende)
    geplant = {d for d in alle if tagesplan(d, az, ausn, regeln, WetterTag(), False, frei=hz.ist_frei(d, art(d))) is not None}
    return {bz.id: h.heiztage_container(alle, geplant.__contains__, hz.modus(bz.id), st.automatik) for bz in hz.bereiche()}


def ergebnis(hz: Heizung, roh: dict[str, list[h.TagRoh]], heute: date, anteil_heute: float = 0.0,
             frei: Mapping[str, set[date]] | None = None) -> dict[str, Any]:
    """Hochrechnung aus den Tagen je Container (ohne Datenbank, damit testbar); `anteil_heute` = Rest von heute (0–1);
    `frei` = Feiertage/Urlaub der Heizperiode (FE-0030)."""
    st = hz.st
    beginn, ende = zeitraum(st, heute)
    plan = heiztage(hz, beginn, ende, frei)
    eigen = (st.e.get("heizung") or {}).get("klimamittel")
    klima = h.klimamittel(eigen)
    vor = vorhersage(st, heute)
    ids = [b.id for b in hz.bereiche()]
    roh = {bid: roh.get(bid, []) for bid in ids}
    ohne_tage = b.zaehlende_tage(h_baseline.laeufe(hz))   # BSM-033.04: Tage der Baseline-Läufe
    aussen = aussen_heute(st, heute, roh)
    reste = {bid: h.container_rest(roh[bid], heute, ende, vor, klima, beginn, ohne_tage.get(bid, set()),
                                   rest_heute=anteil_heute, aussen_heute=aussen, heiztage=plan.get(bid)) for bid in ids}
    # Ersparnis nach IPMVP: Signatur „ohne“ je Container, Heizperiode damit; andere über das Verhältnis je Heizkörper-Typ
    ohne = {bid: h.ohne_container(roh[bid], ohne_tage.get(bid, set()), heute, beginn, ende, vor, klima) for bid in ids}
    mit = {bid: sum(t.kwh or 0.0 for t in roh[bid] if beginn <= t.datum <= heute) + reste[bid].rest_kwh for bid in ids}
    typen = {bid: h_baseline._typ({g.typ for g in st.geraete_in(bid) if g.rolle == ROLLE_HEIZKOERPER}) for bid in ids}
    ohne_kwh = h.ohne_baustelle(ohne, mit, typen)
    _kosten_nachtragen(hz, roh)
    container = [{
        "bereich": bid, "methode": r.methode, "rest_kwh": r.rest_kwh, "unten_kwh": r.unten_kwh, "oben_kwh": r.oben_kwh,
        "normjahr_kwh": r.normjahr_kwh, "stand": r.signatur.stand, "grund": r.signatur.grund, "tage": r.signatur.tage,
        "grenze": r.signatur.grenze, "kwh_je_grad": r.signatur.kwh_je_grad, "grundlast": r.signatur.grundlast,
        "cv_rmse": r.signatur.cv_rmse,
        "punkte": [[t.aussen, round(t.kwh or 0.0, 2)] for t in roh[bid] if h.tag_zaehlt(t, heute) and h.heiztag(t.datum, plan.get(bid))],
    } for bid, r in reste.items()]
    rest_temps = [t for t, _ in h.temperaturen(h.tage(heute, ende), vor, klima)]
    reihe = h.reihe(roh, reste, heute, beginn, ende,
                    ohne_kwh if ohne_kwh is not None else h_zaehlen.hochrechnung_heizperiode(hz, "ohne", schaetzung=True),
                    ohne_wie_mit=ohne_kwh is not None)
    tw = h.tageswerte(roh, reste, heute, beginn, ende, reihe, vor, klima, aussen)   # BSM-033.04: Tag/Woche/Monat
    return {"heute": heute.isoformat(), "beginn": beginn.isoformat(), "ende": ende.isoformat(), "reste": reste,
            "container": container, "hgt_rest": h.hgt_summe(rest_temps[1:]), "vorhersage_tage": len(vor),
            "bisher_kwh": h.bisher(roh, heute, beginn),
            "signatur": _signatur(h.baustelle_tage(roh, heute, plan)),
            "reihe": reihe, "perioden": {art: h.perioden(tw, art, heute) for art in h.PERIODEN},
            "ohne": {"methode": "baseline" if ohne_kwh is not None else "schaetzung", "kwh": ohne_kwh,
                     "container": [{"bereich": bid, "stand": o.signatur.stand, "tage": o.tage, "heizperiode_kwh": o.heizperiode_kwh,
                                    "grenze": o.signatur.grenze, "kwh_je_grad": o.signatur.kwh_je_grad,
                                    "grundlast": o.signatur.grundlast, "cv_rmse": o.signatur.cv_rmse,
                                    "kwh_je_tag": (o.heizperiode_kwh / max(1, (ende - beginn).days + 1)) if o.heizperiode_kwh else None}
                                   for bid, o in ohne.items()]},
            "baseline": {"an": h_baseline.eingeschaltet(hz), "laeufe": [l.als_dict() for l in h_baseline.laeufe(hz)][-12:]},
            "klima": list(klima), "klima_vorgabe": eigen is None,
            "vorhersage": [[d.isoformat(), t] for d, t in sorted(vor.items()) if d <= ende]}


def _kosten_nachtragen(hz: Heizung, roh: dict[str, list[h.TagRoh]]) -> None:
    """Gemessene Kosten beendeter Baseline-Läufe (Verbrauch der Lauftage × Preis) – zählen gegen den Monatsrahmen."""
    liste, neu = h_baseline.laeufe(hz), False
    for i, l in enumerate(liste):
        if l.status in ("fertig", "abgebrochen") and l.kosten_eur is None:
            letzter = l.ende or (l.bis - timedelta(days=1))
            tage = {t.datum: t for t in roh.get(l.bereich, [])}
            liste[i] = replace(l, kosten_eur=round(sum((tage[d].kwh or 0.0) * hz.st.preis_am(d)
                                                       for d in l.tage() if d <= letzter and d in tage), 2))
            neu = True
    if neu:
        h_baseline._speichern(hz, liste)


async def async_rechnen(hass: HomeAssistant, hz: Heizung) -> None:
    st = hz.st
    db = hass.data.get(DATA_DB)
    if db is None or not db.bereit or not hz.aktiv():
        return
    jetzt = dt_util.now()
    heute = jetzt.date()
    beginn, ende = zeitraum(st, heute)
    hz.hochrechnung_lauf += 1   # nur die zuletzt gestartete Rechnung zählt (eine ältere, langsamere überschreibt sonst)
    lauf = hz.hochrechnung_lauf
    zone = dt_util.get_default_time_zone()
    roh = await db.async_ausfuehren(lambda v: hochrechnung_tage(v, st.entry.entry_id, beginn, heute, zone))
    if roh is None:
        _LOGGER.debug("Hochrechnung: Tage nicht lesbar (%s)", db.fehler)
        return
    frei = await async_frei_tage(st, mitternacht(beginn), mitternacht(ende + timedelta(days=1)))   # FE-0030
    if lauf != hz.hochrechnung_lauf:
        return
    hz.hochrechnung = ergebnis(hz, roh, heute, rest_heute(jetzt), frei)


async def async_tagesverlauf(hass: HomeAssistant, hz: Heizung, tag: date) -> dict[str, Any]:
    """Verlauf 24 h eines Tages der Heizperiode (BSM-033.04): gemessen je Stunde aus der Datenbank, Prognose und „ohne“
    aus dem Tageswert der Hochrechnung verteilt (logik/tagesverlauf), Außentemperatur, Heizzeit laut Plan."""
    st, jetzt = hz.st, dt_util.now()
    z = next((x for x in ((hz.hochrechnung or {}).get("perioden") or {}).get("tag", []) if x["von"] == tag.isoformat()), None)
    if z is None:
        return {"datum": tag.isoformat(), "stunden": [], "heizzeit": []}
    ids = {b.id for b in hz.bereiche()}
    geraete = {g.id: g.bereich for g in st.geraete.values() if g.bereich in ids}
    ohne_tage = b.zaehlende_tage(h_baseline.laeufe(hz))
    db = hass.data.get(DATA_DB)
    ist: dict[int, float] = {}
    aussen: dict[int, float] = {}
    profil_tage: list[list[float]] = []
    if db is not None and db.bereit:
        zone = dt_util.get_default_time_zone()
        erg = await db.async_ausfuehren(lambda v: stunden(v, st.entry.entry_id, geraete, ohne_tage, tag, zone))
        if erg is not None:
            ist, aussen, profil_tage = erg
    heute = jetzt.date()
    ab = 24 if tag < heute else jetzt.hour if tag == heute else 0
    ist = {h: w for h, w in ist.items() if h < ab or (tag == heute and h == ab)}
    vorhersage = {dt_util.parse_datetime(k).hour: v for k, v in (st.lz.get("wetter_stunden") or {}).items()   # type: ignore[union-attr]
                  if (t := dt_util.parse_datetime(k)) is not None and t.date() == tag and t.hour >= ab}
    plan = hz.plan(tag, False)
    fenster = [(a, e) for a, e, _ in plan.abschnitte()] if plan is not None else []
    sig = (hz.hochrechnung or {}).get("signatur") or {}
    profil = tv.ohne_profil(profil_tage)
    S = tv.verlauf(ist=ist, aussen_gemessen={h: t for h, t in aussen.items() if h < ab or tag < heute},
                   aussen_vorhersage=vorhersage, mittel=z.get("aussen"), ab=ab, prog_kwh=z.get("prog") or 0.0,
                   ohne_kwh=z.get("ohne"), fenster=fenster, grenze=sig.get("grenze"), profil=profil,
                   max_kwh_h=sum(nenn_kw(st, g) for g in st.geraete.values()
                                 if g.bereich in ids and g.rolle == ROLLE_HEIZKOERPER and st.geraet_aktiv(g)) or None)
    return {"datum": tag.isoformat(), "jetzt_h": jetzt.hour + jetzt.minute / 60 if tag == heute else None,
            "stunden": [[x.h, x.ist, x.prog, x.ohne, x.aussen, x.quelle] for x in S], "heizzeit": tv.heizzeit(fenster),
            "frei": plan is None or not fenster, "ohne_quelle": "baseline" if profil else "temperatur"}


def werte(hz: Heizung) -> dict[str, Any] | None:
    """Hochrechnung der Baustelle aus dem letzten Ergebnis (bisher = Tage der Heizperiode aus der Datenbank); None ohne
    Ergebnis (dann gilt der Tagesschnitt)."""
    if not hz.hochrechnung:
        return None
    return {**h.baustelle(hz.hochrechnung["bisher_kwh"], hz.hochrechnung["reste"]),
            "ohne_kwh": (hz.hochrechnung.get("ohne") or {}).get("kwh")}


@callback
def hochrechnung_planen(hass: HomeAssistant, st: Steuerung) -> Callable[[], None]:
    """Beim Start und stündlich."""
    from . import Heizung   # noqa: PLC0415

    hz = Heizung.von(st)
    st.entry.async_create_background_task(hass, async_rechnen(hass, hz), "baustelle_hochrechnung")

    async def _stuendlich(_jetzt: datetime) -> None:
        await async_rechnen(hass, hz)
    return async_track_time_change(hass, _stuendlich, **STUENDLICH)
