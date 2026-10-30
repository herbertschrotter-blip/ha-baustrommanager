"""Kern: Staffelung über alle Anschlüsse – Nennleistung, Anlauf, Abwurf, Anzeige (BSM-023)."""

from __future__ import annotations

from datetime import datetime, timedelta
from typing import TYPE_CHECKING, Any

from homeassistant.const import STATE_ON, STATE_UNAVAILABLE, STATE_UNKNOWN
from homeassistant.core import callback
from homeassistant.helpers.event import async_call_later
from homeassistant.util import dt as dt_util

from ..const import ZIEHT_STROM_W
from ..funktionen.basis import SollJeBereich, minuten_seit as _minuten_seit, zahl as _zahl
from ..logik import staffel as staffel_logik
from .typen import ANLAUF_S, GeraetInfo, HOCHFAHREN_UNSICHER, PRIO, STABIL_S

if TYPE_CHECKING:
    from ..steuerung import Steuerung


def nenn_kw(st: Steuerung, g: GeraetInfo) -> float:
    """Leistung eines Geräts für die Staffelung: gemessenes Mittel im Betrieb, sonst `standard_kw` seiner Funktion."""
    mittel_w = st.zaehler.get(f"mittel:{g.id}")
    if isinstance(mittel_w, (int, float)) and mittel_w > ZIEHT_STROM_W:
        return round(mittel_w / 1000, 3)
    eigen = (st.e.get("geraete") or {}).get(g.id, {}).get("nenn_kw")   # im Gerät eingestellt (Szenarien)
    if isinstance(eigen, (int, float)):
        return float(eigen)
    return f.standard_kw if (f := st._je_rolle.get(g.rolle)) is not None else 0.0


def _staffeln(st: Steuerung, jetzt: datetime, soll: SollJeBereich) -> tuple[set[str], dict[str, bool | None]]:
    """Staffelung über alle Anschlüsse; liefert die Geräte, die laufen sollen, und das Ziel je geschaltetem Gerät."""
    s = st.e["staffel"]
    anschluesse = [
        staffel_logik.anschluss(a["id"], float(a["ampere"]), int(a["phasen"]), float(a["reserve_kw"]),
                                float(s["nutzbar_prozent"]))
        for a in st.e["anschluesse"]
    ]
    lasten: list[staffel_logik.Last] = []
    ziel: dict[str, bool | None] = {}
    anfordern: dict[str, tuple[bool, bool]] = {}   # BSM-033.06: (will ein vor der Staffelung, erreichbar) – nur beobachtet
    for g in st.geraete.values():
        zustand = st.hass.states.get(g.schalter)
        erreichbar = zustand is not None and zustand.state not in (STATE_UNAVAILABLE, STATE_UNKNOWN)
        an = erreichbar and zustand is not None and zustand.state == STATE_ON
        if erreichbar:
            st._lief[g.id] = an
        letzter = st._letzter_befehl.get(g.id)
        if erreichbar and letzter is not None and jetzt - letzter[1] < timedelta(seconds=55):
            an = letzter[0]   # eigener Befehl noch unterwegs: zählt schon als geschaltet
        e = st.einstellungen.bereich(g.bereich)
        leistung_w = _zahl(st.hass.states.get(g.leistung)) if g.leistung else None
        s_c = soll.get(g.bereich)
        f = st._je_rolle.get(g.rolle)
        ein = (f.geraet_ein(g, s_c[0]) if f is not None else s_c[0].ein) if s_c is not None else None
        schaltet = (
            f is not None and f.schaltbar(g) and ein is not None
            and st.funktion_von(g).hand_seit(g) is None and erreichbar and st.geraet_aktiv(g)
            and g.id not in st.ruhe
        )
        # Einschaltanforderung vor der Staffelung, unabhängig von der Erreichbarkeit (offline bleibt unterscheidbar)
        anfordern[g.id] = (bool(f is not None and f.schaltbar(g) and ein and st.funktion_von(g).hand_seit(g) is None
                                and st.geraet_aktiv(g) and g.id not in st.ruhe), erreichbar)
        seit = dt_util.as_local(zustand.last_changed) if zustand is not None else None
        if seit is not None and seit > jetzt:
            seit = None  # Uhr zurückgestellt: Zeitpunkt unbekannt
        # WU-0015: nach einem Neustart zeigt last_changed den Start, nicht das echte Schalten – ein Gerät, das die
        # Integration seither nicht selbst geschaltet hat, war wohl länger aus: keine Mindestpause ab dem Start
        seit_unbekannt = (
            seit is not None and seit <= st._gestartet + HOCHFAHREN_UNSICHER and g.id not in st._letzter_befehl
        )
        an_seit = _minuten_seit(seit, jetzt) if an else 0.0
        unterwegs = letzter is not None and letzter[0] and jetzt - letzter[1] < timedelta(seconds=55)
        if schaltet:
            # FE-0011: gemessener Verbrauch; wer dazukommen will (und die ersten Minuten danach), zählt voll –
            # auch solange der eigene Einschaltbefehl noch unterwegs ist
            kw = staffel_logik.last_kw(leistung_w, st.nenn_kw(g), an, 0.0 if unterwegs else an_seit)
            ziel[g.id] = bool(ein)
        elif not erreichbar and st._lief.get(g.id):
            kw, an = st.nenn_kw(g), True   # offline, lief aber zuletzt: vorsichtig weiter mitzählen (Szenarien)
        else:
            kw = (leistung_w / 1000 if leistung_w is not None else (st.nenn_kw(g) if an else 0.0)) if an else 0.0
        if schaltet and ein and not an:
            st._wartet_seit.setdefault(g.id, jetzt)
        else:
            st._wartet_seit.pop(g.id, None)
        vorrang = st.funktion_von(g).staffel_vorrang(s_c, schaltet, g.bereich) if s_c is not None else {}
        if schaltet and s_c is not None and s_c[0].ein and not ein and vorrang.get("im_plan"):
            vorrang = {**vorrang, "ruht": staffel_logik.Ruhe.ZURUECKGEHALTEN}   # Bereich heizt, das Gerät bleibt aus
        lasten.append(
            staffel_logik.Last(
                id=g.id, anschluss=e.get("anschluss") or "", kw=kw, heizer=schaltet, an=an, gruppe=g.bereich,
                nenn_kw=st.nenn_kw(g) if schaltet else None,
                will=bool(schaltet and ein), prio=PRIO.get(e.get("prio") or "normal", 1), **vorrang,
                an_seit_min=an_seit,
                aus_seit_min=_minuten_seit(seit, jetzt) if not an and not seit_unbekannt else 1e9,
                wartet_seit_min=_minuten_seit(st._wartet_seit.get(g.id), jetzt) if g.id in st._wartet_seit else 0.0,
            )
        )
    frei_jetzt = staffel_logik.frei_je_anschluss(anschluesse, lasten)
    st._frei_verlauf.append((jetzt, frei_jetzt))
    while st._frei_verlauf and not 0 <= (jetzt - st._frei_verlauf[0][0]).total_seconds() <= STABIL_S:
        st._frei_verlauf.popleft()
    stabil = {
        a.id: min(werte[a.id] for _, werte in st._frei_verlauf if a.id in werte) for a in anschluesse
    }
    st.daten.warte = {}
    if s["an"]:
        ergebnis = staffel_logik.staffeln(
            anschluesse, lasten,
            staffel_logik.StaffelRegeln(
                max_gleichzeitig=int(s["max_gleichzeitig"]), min_lauf_min=float(s["min_lauf_min"]),
                min_pause_min=float(s["min_pause_min"]), takt_min=float(s["takt_min"]),
            ),
            stabil,
            st._abwerfen(jetzt, frei_jetzt),
        )
        an_set = set(ergebnis.an)
        for gid, grund in ergebnis.wartet.items():
            dran = ergebnis.dran_in_min.get(gid)
            st.daten.warte[gid] = {"grund": grund, "dran_in_min": None if dran is None else max(0, round(dran))}
        st._anlauf_begrenzen(jetzt, lasten, an_set)
        frei_nach = ergebnis.frei_kw
    else:
        an_set = {l.id for l in lasten if l.heizer and l.will}
        frei_nach = {a: round(f, 3) for a, f in frei_jetzt.items()}
    st._staffel_anzeige(anschluesse, lasten, frei_nach)
    st.daten.staffel_beobachtung = {
        gid: (will, staffel_logik.gesperrt(will, erreichbar, gid in an_set, (st.daten.warte.get(gid) or {}).get("grund")))
        for gid, (will, erreichbar) in anfordern.items()
    }
    return an_set, ziel


def _anlauf_begrenzen(st: Steuerung, jetzt: datetime, lasten: list[staffel_logik.Last], an_set: set[str]) -> None:
    """Anlaufstaffel: von den neu einzuschaltenden Geräten höchstens eines je ANLAUF_S; die übrigen warten
    („anlauf“) und werden nach ANLAUF_S erneut ausgewertet. Reihenfolge `staffel.anlauf_folge`."""
    neue = staffel_logik.anlauf_folge([l for l in lasten if l.id in an_set and not l.an])
    if not neue:
        return
    frei = st._letzter_anlauf is None or not 0 <= (jetzt - st._letzter_anlauf).total_seconds() < ANLAUF_S
    erlaubt = {neue[0].id} if frei else set()
    if erlaubt:
        st._letzter_anlauf = jetzt
    zurueck = [l.id for l in neue if l.id not in erlaubt]
    for gid in zurueck:
        an_set.discard(gid)
        st.daten.warte[gid] = {"grund": "anlauf", "dran_in_min": 0}
    if zurueck and st._anlauf_geplant is None:
        @callback
        def _weiter(_now: datetime) -> None:
            st._anlauf_geplant = None
            st.auswerten()
        st._anlauf_geplant = async_call_later(st.hass, ANLAUF_S, _weiter)


def _abwerfen(st: Steuerung, jetzt: datetime, frei: dict[str, float]) -> dict[str, bool]:
    """Abwurf je Anschluss erst, wenn er `staffel.UEBERLAST_S` lang zu voll ist (kurze Spitzen, z. B. ein Thermostat,
    der kurz anspringt); dann wird noch einmal ausgewertet."""
    erlaubt: dict[str, bool] = {}
    for aid, f in frei.items():
        if f >= -staffel_logik.TOLERANZ_KW:
            st._ueberlast_seit.pop(aid, None)
            continue
        seit = st._ueberlast_seit.setdefault(aid, jetzt)
        erlaubt[aid] = (jetzt - seit).total_seconds() >= staffel_logik.UEBERLAST_S
        if not erlaubt[aid] and st._ueberlast_geplant is None:
            @callback
            def _nochmal(_now: datetime) -> None:
                st._ueberlast_geplant = None
                st.auswerten()
            st._ueberlast_geplant = async_call_later(st.hass, staffel_logik.UEBERLAST_S + 1, _nochmal)
    return erlaubt


def _staffel_anzeige(st: Steuerung, anschluesse: list[staffel_logik.Anschluss], lasten: list[staffel_logik.Last], frei: dict[str, float]
) -> None:
    """Anschlüsse mit Leistung je Funktion (`staffel_feld`, sonst `sonst_kw`) und die laufenden geschalteten Geräte."""
    s = st.e["staffel"]
    feld = {g.id: f.staffel_feld if (f := st._je_rolle.get(g.rolle)) is not None else "" for g in st.geraete.values()}
    felder = [f.staffel_feld for f in st.funktionen if f.staffel_feld]
    liste = []
    for a, roh in zip(anschluesse, st.e["anschluesse"], strict=True):
        laufend = [l for l in lasten if l.an and l.anschluss == a.id]
        eintrag: dict[str, Any] = {
            "id": a.id, "name": roh.get("name", a.id),
            "voll_kw": round(float(roh["ampere"]) * 230 * int(roh["phasen"]) / 1000, 3),
            "grenze_kw": round(a.grenze_kw, 3), "reserve_kw": a.reserve_kw,
        }
        for name in [*felder, "sonst_kw"]:
            eintrag[name] = round(sum(l.kw for l in laufend if (feld.get(l.id) or "sonst_kw") == name), 3)
        eintrag["frei_kw"] = frei.get(a.id, 0.0)
        liste.append(eintrag)
    geschaltet = [g for g in st.geraete.values() if (f := st._je_rolle.get(g.rolle)) is not None and f.schaltbar(g)]
    st.daten.staffel = {
        "an": bool(s["an"]),
        "laufen": sum(1 for g in geschaltet if (zst := st.hass.states.get(g.schalter)) is not None and zst.state == STATE_ON),
        "warten": len(st.daten.warte),
        "max": int(s["max_gleichzeitig"]),
        "anschluesse": liste,
        "rang": staffel_logik.rangliste(lasten),   # oben zuerst an, unten gibt zuerst ab (Bedarf in °C)
        # AN-0017: je Zeile Zustand und Text, Kopfzeile (Platz für alle / wird getauscht)
        "rangliste": staffel_logik.rang_anzeige(lasten, {g: w["grund"] for g, w in st.daten.warte.items()},
                                                int(s["max_gleichzeitig"]), bool(s["an"])),
    }
