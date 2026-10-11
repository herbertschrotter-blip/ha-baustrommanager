"""Aufbau einer Baustelle für die eigene Seite (WebSocket `baustelle/struktur`, api-0.7 §1) und die Diagnose."""

from __future__ import annotations

from datetime import date, datetime, timedelta
from typing import TYPE_CHECKING, Any

from homeassistant.config_entries import ConfigEntry
from homeassistant.const import STATE_ON, STATE_UNAVAILABLE, STATE_UNKNOWN
from homeassistant.core import HomeAssistant
from homeassistant.helpers import device_registry as dr, entity_registry as er
from homeassistant.util import dt as dt_util

from .auswertung import beginn_der_baustelle
from .const import (
    ART_CONTAINER, CONF_ENERGIE, CONF_LEISTUNG, CONF_REGEN_SENSOR, CONF_STATUS, CONF_TEMP_SENSOR, CONF_WETTER, STATUS_AKTIV,
)
from .funktionen import aktive
from .funktionen.heizung import Heizung
from .funktionen.pumpen import Pumpen
from .logik import groesse, symbol as symbol_logik
from .logik.abrechnung import EIGEN, firma_von
from .logik.arbeitszeit import Plan, uhrzeit
from .logik.regelung import heizgrenze_bezug
from .logik.sensoren import kontakte
from .logik.warnungen import titel as warn_titel
from .notprogramm import DATA_NOTPROGRAMM
from . import texte

if TYPE_CHECKING:
    from .steuerung import Steuerung

PROTOKOLL_IN_STRUKTUR = 20
NICHT_IN_EINSTELLUNGEN = ("zaehler", "protokoll", "meldungen", "laufzeit")
ROLLE_API = {"heizkoerper": "heizung", "bautrockner": "trockner", "pumpe": "pumpe", "steckdose": "steckdose"}


def _iso(zeit: datetime | None) -> str | None:
    return zeit.isoformat(timespec="seconds") if zeit is not None else None


def plan_dict(plan: Plan | None) -> dict[str, Any] | None:
    if plan is None:
        return None
    def aus(a: Any) -> dict[str, Any]:
        return {"datum": a.datum.isoformat(), "art": str(a.art), "von": uhrzeit(a.von) if a.von else None,
                "bis": uhrzeit(a.bis) if a.bis else None, "notiz": a.notiz}

    return {
        "start": plan.start, "vor": plan.vor, "a": plan.a, "b": plan.b, "nach": plan.nach, "ende": plan.ende,
        "gruende": [str(g) for g in plan.gruende],
        "ausnahme": None if plan.ausnahme is None else aus(plan.ausnahme),
        "eigene": [list(f) for f in plan.eigene],               # FE-0012: Fenster für sich (genau diese Zeit)
        "ausnahmen": [aus(a) for a in plan.ausnahmen],
    }


def _woche(heute: date) -> list[date]:
    montag = heute - timedelta(days=heute.weekday())
    return [montag + timedelta(days=k) for k in range(7)]


def _plan_woche(st: Steuerung, heute: date) -> list[dict[str, Any]]:
    tage = []
    for tag in _woche(heute):
        frei = "ausnahme" if any(a.datum == tag and str(a.art) == "frei" for a in st.ausnahmen()) else st.frei_art(tag)
        eintrag: dict[str, Any] = {"datum": tag.isoformat(), "plan": plan_dict(Heizung.von(st).plan(tag, True)), "frei": frei}
        if frei == "feiertag" and tag in st.kalender_namen:
            eintrag["name"] = st.kalender_namen[tag]
        tage.append(eintrag)
    return tage


def _plan_ausnahmen(st: Steuerung, heute: date) -> dict[str, Any]:
    """FE-0012: Heizplan jedes künftigen Tages mit Ausnahmen (auch nach dieser Woche) – für die Liste der Ausnahmen."""
    tage = sorted({a.datum for a in st.ausnahmen() if a.datum >= heute})
    return {t.isoformat(): plan_dict(Heizung.von(st).plan(t, True)) for t in tage[:31]}


def _minute_im_tag(zeit: datetime, tag: date) -> int:
    if zeit.date() < tag:
        return 0
    if zeit.date() > tag:
        return 24 * 60
    return zeit.hour * 60 + zeit.minute


def _abschnitte(st: Steuerung, heute: date, jetzt: datetime) -> dict[str, dict[str, list[list[Any]]]]:
    """Heizzeiten je Container und Tag der Woche (Mockup `heizzeiten`); Termine als „vorheizen“ + „termin“."""
    heizung = Heizung.von(st)
    vorheizen = timedelta(minutes=int(st.e["heizung"]["vorheizen_min"]))
    ergebnis: dict[str, dict[str, list[list[Any]]]] = {}
    for info in heizung.bereiche():
        e = st.einstellungen.bereich(info.id)
        je_tag: dict[str, list[list[Any]]] = {}
        for tag in _woche(heute):
            teile: list[list[Any]] = []
            if e["bedarf"]:
                for t in heizung.termine:
                    von, bis = dt_util.parse_datetime(t["von"]), dt_util.parse_datetime(t["bis"])
                    if t["bereich"] != info.id or von is None or bis is None:
                        continue
                    von, bis = dt_util.as_local(von), dt_util.as_local(bis)
                    if von.date() != tag:
                        continue
                    teile.append([_minute_im_tag(von - vorheizen, tag), _minute_im_tag(von, tag), "vorheizen"])
                    teile.append([_minute_im_tag(von, tag), _minute_im_tag(bis, tag), "termin"])
                if tag == heute and (bis := heizung.bis("bedarf_bis", info.id, jetzt)) is not None:
                    teile.append([_minute_im_tag(jetzt, tag), _minute_im_tag(bis, tag), "termin"])
            elif e["auto"]:
                plan = heizung.plan_bereich(tag, info.id, jetzt)   # lernend: mit „Warm ab“ (AN-0004)
                teile = [[von, bis, str(art)] for von, bis, art in plan.abschnitte()] if plan else []
            je_tag[tag.isoformat()] = [x for x in teile if x[1] > x[0]]
        ergebnis[info.id] = je_tag
    return ergebnis


def _zahl(hass: HomeAssistant, entity_id: str | None) -> float | None:
    if not entity_id or (s := hass.states.get(entity_id)) is None or s.state in (STATE_UNAVAILABLE, STATE_UNKNOWN):
        return None
    try:
        return float(s.state)
    except ValueError:
        return None


def _drehung(hass: HomeAssistant, entity_id: str) -> float | None:
    """Drehung (°) des Geräts hinter einem Fensterkontakt (BLU Door/Window: Sensor mit Einheit ° am selben Gerät)."""
    ents = er.async_get(hass)
    eintrag = ents.async_get(entity_id)
    if eintrag is None or eintrag.device_id is None:
        return None
    for e in er.async_entries_for_device(ents, eintrag.device_id):
        if e.domain == "sensor" and (s := hass.states.get(e.entity_id)) is not None and s.attributes.get("unit_of_measurement") == "°":
            return _zahl(hass, e.entity_id)
    return None


def _symbol(st: Steuerung, bid: str) -> dict[str, Any]:
    """Container-Symbol (BSM-032): Aussehen und Zustand aus den Sensoren, fertig zum Zeichnen (logik/symbol)."""
    hass, e = st.hass, st.einstellungen.bereich(bid)
    eigen = e.get("symbol")
    cfg = eigen or symbol_logik.standard()
    def an(eid: str | None) -> bool | None:
        z = hass.states.get(eid) if eid else None
        return None if z is None or z.state in (STATE_UNAVAILABLE, STATE_UNKNOWN) else z.state == STATE_ON

    tueren = [{**t, "sensor_aktiv": (eid := t["sensor"] or (e.get("tuer") if i == 0 else None)), "offen": bool(an(eid))}
              for i, t in enumerate(cfg["tueren"])]   # Tür 1 ohne eigenen Sensor: der Türkontakt des Containers
    fenster = [{**f, "zustand": symbol_logik.fenster_zustand(an(f["sensor"]), _drehung(hass, f["sensor"]) if f["sensor"] else None)}
               for f in cfg["fenster"]]
    licht = cfg.get("licht")
    s = hass.states.get(licht) if licht else None
    return {"eigen": eigen is not None, "doppel": cfg["doppel"], "farbe": cfg["farbe"], "rahmen": cfg.get("rahmen"), "tueren": tueren, "fenster": fenster,
            "licht": licht, "licht_an": bool(s is not None and symbol_logik.licht_an(s.state, _zahl(hass, licht)))}


def laufzeit(st: Steuerung) -> dict[str, Any]:
    """Laufzeit-Teil der Struktur (api-0.7 §1 `laufzeit`)."""
    hass = st.hass
    jetzt = dt_util.now()
    heute = jetzt.date()
    d = st.daten
    lz = st.lz
    heizung, pumpen = Heizung.von(st), Pumpen.von(st)
    container: dict[str, Any] = {}
    for bid, info in st.bereiche.items():
        kw = sum(
            (_zahl(hass, g.leistung) or 0.0) / 1000 for g in st.geraete_in(bid)
            if g.leistung and (s := hass.states.get(g.schalter)) is not None and s.state == STATE_ON
        )
        tuer = None   # BSM-034.03: irgendeine Tür oder ein Fenster offen (der am längsten offene)
        if info.art == ART_CONTAINER and kontakte(st.sensoren(bid)):
            seit = st.kontakt_offen_seit(bid)
            tuer = {"offen": seit is not None, "seit": _iso(seit)}
        container[bid] = {
            "zustand": d.zustand.get(bid, "aus"), "grund": d.grund.get(bid), "text": d.text.get(bid, ""),
            "temperatur": d.temperatur.get(bid), "kw": round(kw, 3),
            "bedarf_bis": _iso(heizung.bis("bedarf_bis", bid, jetzt)),
            "boost_bis": _iso(heizung.bis("boost_bis", bid, jetzt)),
            "tuer": tuer,
            "modus": heizung.modus(bid) if info.art == ART_CONTAINER else None,
            "lernen": heizung.lern_anzeige(bid) if info.art == ART_CONTAINER else None,   # lernende Regelung (0.8)
            "stufen": heizung.stufen_anzeige(bid) if info.art == ART_CONTAINER else None,   # Zusatz-Heizkörper (AN-0006)
            "bedarf": heizung.bedarf_anzeige(bid) if info.art == ART_CONTAINER else None,   # Bedarf in °C (Staffelung)
            "soll": heizung.soll_anzeige(bid) if info.art == ART_CONTAINER else None,   # Soll jetzt (fest/gleitend)
            "groesse": groesse.anzeige(st.einstellungen.bereich(bid).get("groesse_m2")) if info.art == ART_CONTAINER else None,   # AN-0014
            "symbol": _symbol(st, bid) if info.art == ART_CONTAINER else None,   # BSM-032
            "firma": firma_von(st.e.get("zuordnung") or [], st.e.get("firmen") or [{"id": EIGEN}], bid, jetzt),
        }
    geraete: dict[str, Any] = {}
    np = st.hass.data.get(DATA_NOTPROGRAMM, {}).get(st.entry.entry_id)
    for gid, g in st.geraete.items():
        s = hass.states.get(g.schalter)
        an = s is not None and s.state == STATE_ON
        leistung = _zahl(hass, g.leistung)
        geraete[gid] = {
            "an": an,
            "kw": round(leistung / 1000, 3) if leistung is not None else (st.nenn_kw(g) if an else 0.0),
            "erreichbar": s is not None and s.state not in (STATE_UNAVAILABLE, STATE_UNKNOWN),
            "hand_seit": lz["hand"].get(gid),
            "warte": d.warte.get(gid),
            "aktiv": st.geraet_aktiv(g),   # WU-0004
            "status": st.geraet_status(g),   # BSM-034.02: aktiv | inaktiv | verliehen | defekt
            "zusatz": bool((st.e.get("geraete") or {}).get(gid, {}).get("zusatz")),   # AN-0006
            "notprogramm": np.geraet_info(gid) if np is not None else None,   # BSM-019
        }
    stumm = st.e["stumm"]
    tuer_melden = st.e["heizung"]["tuer_melden_min"]
    warnungen = [
        {"key": w.key, "art": w.art, "stufe": w.stufe, "bereich": w.bereich, "geraet": w.geraet, "titel": warn_titel(w),
         "hilfe": texte.hilfe(w, tuer_melden), "seit": _iso(w.seit),
         "stumm_bis": stumm.get(w.key) if (z := dt_util.parse_datetime(str(stumm.get(w.key) or ""))) and z > jetzt else None}
        for w in d.warnungen
    ]
    w = d.wetter
    h = st.e["heizung"]
    return {
        "status": d.status,
        "status_text": d.status_text,
        "naechste": _iso(d.naechste),
        "jetzt_bis": _iso(heizung.jetzt_bis(jetzt)),
        "container": container,
        "geraete": geraete,
        "plan_woche": _plan_woche(st, heute) if heizung.aktiv() else [],
        "plan_ausnahmen": _plan_ausnahmen(st, heute) if heizung.aktiv() else {},
        "abschnitte": _abschnitte(st, heute, jetzt) if heizung.aktiv() else {},
        "staffel": d.staffel,
        "soll_gleitend": heizung.gleit_anzeige() if heizung.aktiv() else None,   # Soll gleitend (Herbert 01.10.2026)
        "warnungen": warnungen,
        "wetter": {"aussen": w.aussen, "aussen_max": w.aussen_max, "frueh_min": w.frueh, "regen_vortag": w.regen_vortag,
                   "regen_heute": w.regen_heute, "zustand": w.zustand},
        "heizgrenze": {"bezug": heizgrenze_bezug(str(h["heizgrenze_basis"]), w.aussen_max, w.aussen),
                       "zu_warm": heizung.zu_warm(w)},
        "termine": list(heizung.termine),
        "protokoll": st.e["protokoll"][:PROTOKOLL_IN_STRUKTUR],
        # wie 0.6 (Entitäten, Diagnose)
        "probleme": d.probleme,
        "pumpe_laeuft": pumpen.pumpe_laeuft,
        "erreichbar": d.erreichbar,
        "notprogramm": {"an": np.an, "geprueft": np.geprueft.isoformat(timespec="seconds") if np.geprueft else None}
        if np is not None else None,   # BSM-019
    }


def struktur(hass: HomeAssistant, entry: ConfigEntry, version: str = "") -> dict[str, Any]:
    """Einrichtung, Entitäten (Schlüssel → entity_id), Einstellungen, Zähler und Laufzeit einer Baustelle."""
    registry = er.async_get(hass)
    jetzt = dt_util.now()
    beginn, beginn_auto = beginn_der_baustelle(entry)
    daten: dict[str, Any] = {
        "baustelle": {
            "entry_id": entry.entry_id, "titel": entry.title,
            "status": entry.options.get(CONF_STATUS, STATUS_AKTIV), "optionen": dict(entry.options),
            # geltender Beginn (leer = Tag der Anlage, AN-0002) und ob er automatisch gilt
            "beginn": beginn.isoformat(), "beginn_auto": beginn_auto,
            "geladen": getattr(entry, "runtime_data", None) is not None, "version": version,
            "zeitzone": str(hass.config.time_zone), "heute": jetzt.date().isoformat(), "jetzt": _iso(jetzt),
        },
        "funktionen": aktive(entry.options),  # eingeschaltete Funktionen (api-0.7 §8), auch nicht geladen
        "entitaeten": {e.unique_id: e.entity_id for e in er.async_entries_for_config_entry(registry, entry.entry_id)},
    }
    st: Steuerung | None = getattr(entry, "runtime_data", None)
    if st is None:
        daten.update(bereiche=[], geraete=[], einstellungen={}, zaehler={}, laufzeit={})
        return daten
    daten.update(
        bereiche=[{"id": b.id, "name": b.name, "art": b.art, "fuehler": b.fuehler, "nr": b.nr,
                   # BSM-034.03: die eine Sensorliste (Fühler, Türen, Fenster, Licht) mit Batterie (%)
                   "sensoren": [{**x.als_dict(), "batterie": st.batterie(x.entity_id)} for x in st.sensoren(b.id)]}
                  for b in st.bereiche.values()],
        geraete=[
            {"id": g.id, "name": g.name, "bereich": g.bereich, "schalter": g.schalter,
             "rolle": ROLLE_API.get(g.rolle, g.rolle), "typ": g.typ, "leistung": g.leistung, "energie": g.energie,
             # selbst gewählt (sonst automatisch am Shelly erkannt) – für „Gerät bearbeiten“ (WU-0004)
             "leistung_eigen": (s.data.get(CONF_LEISTUNG) if (s := entry.subentries.get(g.id)) else None) or None,
             "energie_eigen": (s.data.get(CONF_ENERGIE) if (s := entry.subentries.get(g.id)) else None) or None,
             "nenn_kw": st.nenn_kw(g),
             "nenn_kw_eigen": (st.e.get("geraete") or {}).get(g.id, {}).get("nenn_kw")}   # im Gerät eingestellt (Szenarien)
            for g in st.geraete.values()
        ],
        einstellungen={k: v for k, v in st.e.items() if k not in NICHT_IN_EINSTELLUNGEN},
        zaehler={k: v for k, v in st.zaehler.items() if not k.startswith("stand:")},
        laufzeit=laufzeit(st),
        geraete_links=_geraete_links(hass, st, entry),   # WU-0010: Geräteübersicht
    )
    return daten


def _geraete_links(hass: HomeAssistant, st: Steuerung, entry: ConfigEntry) -> dict[str, dict[str, Any]]:
    """Je benutzter Entität das Gerät aus dem Geräteregister (WU-0010): Website (`configuration_url`, nur http/https),
    Geräteseite in HA, Name, Hersteller, Modell und ein Batterie-Sensor am selben Gerät."""
    ents: set[str | None] = set()
    for g in st.geraete.values():
        ents |= {g.schalter, g.leistung, g.energie}
    for b in st.bereiche.values():
        ents |= {x.entity_id for x in st.sensoren(b.id)}   # BSM-034.03: alle Sensoren des Containers
    ents |= {entry.options.get(k) for k in (CONF_TEMP_SENSOR, CONF_REGEN_SENSOR, CONF_WETTER)}
    ereg, dreg = er.async_get(hass), dr.async_get(hass)
    links: dict[str, dict[str, Any]] = {}
    for eid in sorted(e for e in ents if e):
        eintrag = ereg.async_get(eid)
        geraet = dreg.async_get(eintrag.device_id) if eintrag is not None and eintrag.device_id else None
        if not isinstance(geraet, dr.DeviceEntry):
            links[eid] = {"web": None, "ha": None, "geraet": None, "hersteller": None, "modell": None, "batterie": None, "signal": None}
            continue
        url = str(geraet.configuration_url or "")
        am_geraet = er.async_entries_for_device(ereg, geraet.id)
        def klasse(x: er.RegistryEntry) -> str | None:
            return x.device_class or x.original_device_class
        batterie = next((x.entity_id for x in am_geraet if klasse(x) == "battery" and x.entity_id.startswith("sensor.")), None)
        # AN-0009: Funk-/WLAN-Signal am selben Gerät (dBm), auch wenn HA ihn standardmäßig ausgeblendet hat
        signal = next((x.entity_id for x in am_geraet if klasse(x) == "signal_strength" and x.entity_id.startswith("sensor.")), None)
        links[eid] = {
            "web": url if url.startswith(("http://", "https://")) else None,
            "ha": f"/config/devices/device/{geraet.id}",
            "geraet": geraet.name_by_user or geraet.name, "hersteller": geraet.manufacturer, "modell": geraet.model,
            "batterie": batterie, "signal": signal,
        }
    return links
