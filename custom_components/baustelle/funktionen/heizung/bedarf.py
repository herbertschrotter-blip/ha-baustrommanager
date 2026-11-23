"""Heizung: Bedarf in °C für die Staffelung (BSM-023)."""

from __future__ import annotations

from datetime import datetime
from typing import TYPE_CHECKING, Any

from homeassistant.util import dt as dt_util

from ...logik import bedarf as bedarf_logik, lernen
from ...logik.regelung import LageContainer
from ...logik.zaehlen import rate
from . import start as h_start

if TYPE_CHECKING:
    from . import Heizung


def bedarf(hz: Heizung, bid: str, lage: LageContainer, jetzt: datetime | None = None) -> bedarf_logik.Bedarf | None:
    """Bedarf eines Containers in °C (Trend, Nachlauf, Zielzeit, Gerechtigkeit) – auch für die Seite gemerkt."""
    info = hz.st.bereiche.get(bid)
    if info is None:
        return None
    jetzt = jetzt or dt_util.now()
    heizer = hz.heizer_von(bid)
    laeuft = any(hz._zieht_strom(g) for g in heizer)
    innen = lage.temperatur
    trend = bedarf_logik.trend_c_h(hz._temp_punkte.get(bid, []), jetzt) if innen is not None else None
    nachlauf = hz.tpi_jetzt.get(bid, (None, 0.0))[1]
    ziel = 0.0
    plan = hz.plaene.get(bid)
    if innen is not None and plan is not None:
        bis = plan.a - hz._warm_vor.get(bid, 0) - (jetzt.hour * 60 + jetzt.minute)
        ziel = bedarf_logik.ziel_fehlt(innen, lage.soll, hz._aufheiz_rate(bid), bis)
    gelernt = hz.st.zaehler.get(f"abkuehl:{bid}")   # gelernte Abkühlrate (Trägheit, wie im Vergleich Öl/Konvektor)
    if not laeuft and trend is not None:
        hz._abkuehl_zuletzt[bid] = max(0.0, -trend)
    elif gelernt is None:
        gelernt = hz._abkuehl_zuletzt.get(bid)   # noch nichts gelernt: die zuletzt gemessene Abkühlung
    b = bedarf_logik.bedarf(innen=innen, soll=lage.soll, trend_h=trend, abkuehl_gelernt_h=float(gelernt) if gelernt is not None else None,
                            nachlauf=nachlauf, laeuft=laeuft, ziel=ziel,
                            zuschlag_gerecht=hz._gerecht(bid, jetzt))
    hz.bedarf_jetzt[bid] = b
    return b


def _aufheiz_rate(hz: Heizung, bid: str) -> float | None:
    """Gelernte Aufheizrate (°C/h) für das Wetter von jetzt und die Zahl der Heizkörper (wie „Warm ab“)."""
    stand = hz.lern_staende.get(bid) or {}
    anzahl = 1 if hz.stufen_an(bid) and not hz._zusatz_gelernt.get(bid) else (len(hz.heizer_von(bid)) or 1)
    rate = lernen.rate_fuer(stand, h_start.kw_nenn(hz, bid), lernen.band(hz.st.daten.wetter.aussen), anzahl)   # 0.8.182: je kW
    return rate[0] if rate else None


def _gerecht(hz: Heizung, bid: str, jetzt: datetime) -> float:
    """Zuschlag für wenig Heizzeit in der letzten Stunde gegenüber dem Schnitt der Container mit Heizkörpern."""
    alle = [b.id for b in hz.bereiche() if hz.heizer_von(b.id)]
    if len(alle) < 2:
        return 0.0
    return bedarf_logik.gerecht(hz._heiz_min(bid, jetzt), sum(hz._heiz_min(b, jetzt) for b in alle) / len(alle))


def bedarf_anzeige(hz: Heizung, bid: str) -> dict[str, Any] | None:
    """Bedarf für die Seite (laufzeit.container.<id>.bedarf) – zuletzt in der Staffelung gerechnet."""
    b = hz.bedarf_jetzt.get(bid)
    if b is None:
        return None
    return {"summe": b.summe, "jetzt": b.jetzt, "abkuehlen": b.abkuehlen, "abkuehl_h": b.abkuehl_h, "gemessen": b.gemessen,
            "trend_h": b.trend_h, "nachlauf": b.nachlauf, "aufheiz_h": hz._aufheiz_rate(bid),
            "ziel": b.ziel, "gerecht": b.gerecht, "heiz_min": round(hz._heiz_min(bid, dt_util.now())),
            "horizont_min": bedarf_logik.HORIZONT_MIN}
