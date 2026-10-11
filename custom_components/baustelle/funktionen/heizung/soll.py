"""Heizung: Soll je Container – gleitendes Soll, Gefühl, Verschieben, Außentemperatur (BSM-023)."""

from __future__ import annotations

from datetime import date, datetime, timedelta
from typing import TYPE_CHECKING, Any

from homeassistant.util import dt as dt_util

from ...logik import soll as soll_logik
from ...logik import warnungen as warn_logik
from .typen import VERSCH_BIS

if TYPE_CHECKING:
    from . import Heizung


def soll_temperatur(hz: Heizung, bid: str) -> float:
    """Soll eines Containers: fest (eigenes oder das der Baustelle) oder gleitend (Herbert 01.10.2026) – dann gilt ein
    eigenes Soll als Verschiebung gegenüber dem der Baustelle, dazu + / − am Rad bis morgen früh."""
    b, h = hz.st.einstellungen.bereich(bid), hz.st.e["heizung"]
    if h.get("soll_art") != "gleitend":
        return float(b["soll"] if b.get("soll") is not None else h["soll"])
    g = hz.gleit_info()
    wert = g["soll"] if g is not None else float(h["soll"])
    wert += soll_logik.versatz(b.get("soll"), float(h["soll"]))
    return round(wert + hz.versch(bid), 2)


def gleit_info(hz: Heizung) -> dict[str, Any] | None:
    """Soll gleitend der Baustelle jetzt: Außenmittel, Startwert, Gefühl, Soll – None ohne Außentemperatur."""
    t_m = hz.aussen_mittel()
    if t_m is None:
        return None
    r, rueck = hz.gleit_regeln(), hz.gefuehl_liste()
    return {"aussen_mittel": round(t_m, 2), "tage": r.tage, "start": round(soll_logik.startwert(t_m, r), 2),
            "gefuehl": round(soll_logik.gefuehl(rueck, t_m), 2), "soll": soll_logik.gleitend(t_m, r, rueck),
            "n": sum(1 for x, _ in rueck if abs(x - t_m) <= soll_logik.GEFUEHL_UMKREIS)}


def gleit_anzeige(hz: Heizung) -> dict[str, Any] | None:
    """Für die Seite (laufzeit.soll_gleitend): Werte von jetzt, Kurve und Rückmeldungen."""
    g = hz.gleit_info()
    if g is None:
        return None
    return {**g, "kurve": soll_logik.kurve(hz.gleit_regeln(), hz.gefuehl_liste()),
            "rueck": [[round(x, 1), r] for x, r in hz.gefuehl_liste()[-60:]], "schritt": soll_logik.GEFUEHL_SCHRITT}


def gefuehl_merken(hz: Heizung, bid: str, wert: int, jetzt: datetime) -> None:
    """„zu kalt / passt / zu warm“ – gemeinsam für die Baustelle beim Außenmittel von jetzt."""
    t_m = hz.aussen_mittel(jetzt)
    if t_m is None:
        return
    liste = hz.st.lz.setdefault("gefuehl", [])
    liste.append([jetzt.date().isoformat(), round(t_m, 2), wert])
    del liste[:-300]
    text = {-1: "zu kalt", 0: "passt", 1: "zu warm"}[wert]
    hz.st.protokoll("einstellung", bid, f"{hz.st.bereiche[bid].name}: {text} bei {warn_logik._zahl(t_m)} °C Außenmittel")


def soll_verschieben(hz: Heizung, bid: str, d: float, jetzt: datetime) -> None:
    """+ / − am Rad: Soll bis morgen früh verschieben und als Gefühl merken (+ = zu kalt, − = zu warm)."""
    neu = round(hz.versch(bid) + d, 2)
    bis = datetime.combine(jetzt.date() + timedelta(days=1), VERSCH_BIS, tzinfo=jetzt.tzinfo)
    versch = hz.st.lz.setdefault("soll_versch", {})
    if neu:
        versch[bid] = [neu, bis.isoformat(timespec="seconds")]
    else:
        versch.pop(bid, None)
    hz.gefuehl_merken(bid, -1 if d > 0 else 1, jetzt)


def _aussen_merken(hz: Heizung, jetzt: datetime, aussen: float | None) -> None:
    """Einmal je Minute die Außentemperatur ins Tagesmittel (10 Tage)."""
    minute = int(jetzt.timestamp() // 60)
    if aussen is None or hz._aussen_minute == minute:
        return
    hz._aussen_minute = minute
    roh = hz.st.lz.setdefault("aussen_tage", {})
    t = roh.setdefault(jetzt.date().isoformat(), [0.0, 0])
    t[0], t[1] = round(t[0] + aussen, 2), t[1] + 1
    for alt in [k for k in roh if k < (jetzt.date() - timedelta(days=10)).isoformat()]:
        del roh[alt]


def aussen_mittel(hz: Heizung, jetzt: datetime | None = None) -> float | None:
    """Gleitendes Mittel der Tagesmittel außen (logik/soll, wie EN 16798-1); ohne Vortage das von heute."""
    jetzt = jetzt or dt_util.now()
    roh = hz.st.lz.get("aussen_tage") or {}
    tage = {date.fromisoformat(t): v[0] / v[1] for t, v in roh.items() if v and v[1]}
    heute = tage.pop(jetzt.date(), None)
    t_m = soll_logik.aussen_mittel(tage, jetzt.date(), hz.gleit_regeln().tage, heute)
    return t_m if t_m is not None else hz.st.daten.wetter.aussen
