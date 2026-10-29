"""Heizung: Zähler – Heizzeit, Heiztage, Energie, Temperaturverhalten, Hochrechnung (BSM-023)."""

from __future__ import annotations

from datetime import date, datetime
from typing import TYPE_CHECKING

from homeassistant.util import dt as dt_util

from ...const import ART_CONTAINER, CONF_ENDE, CONF_HEIZPERIODE_BIS, CONF_HEIZPERIODE_VON, ROLLE_HEIZKOERPER
from ...logik.zaehlen import (
    ABKUEHL_MIN_H,
    AUFHEIZ_MIN_H,
    gradstunden,
    hochrechnung,
    mittel,
    mittel_im_betrieb,
    ersparnis_buchen as ersparnis_logik,
    rate,
    tage_heizperiode,
)
from ..basis import ZAEHLER_SPEICHERN_S

if TYPE_CHECKING:
    from . import Heizung
    from ...steuerung import GeraetInfo


def zaehlen_geraet(hz: Heizung, g: GeraetInfo, an: bool, leistung: float | None, stunden: float) -> bool:
    """Mittlere Leistung im Betrieb, Heizzeit je Typ; True, wenn das Gerät eingeschaltet ist."""
    z = hz.st.zaehler
    mittel_w = mittel_im_betrieb(z.get(f"mittel:{g.id}"), leistung if an else None)
    if mittel_w is not None:
        z[f"mittel:{g.id}"] = mittel_w
        if hz.aktiv() and hz.st.geraet_aktiv(g):   # FE-0020: inaktive liefen auch ohne Automatik nicht
            hz._ohne_w += mittel_w
    if not an:
        return False
    if g.rolle == ROLLE_HEIZKOERPER:
        hz.st.zaehler_plus(f"heizzeit_typ:{g.typ}", stunden)
        if leistung is None or leistung > hz.zieht_w():   # AN-0011: tatsächlich geheizt (ohne Messung: wie geschaltet)
            hz._strom_jetzt.add(g.bereich)
    return True


def zaehlen_bereich(hz: Heizung, bid: str, heizt: bool, jetzt: datetime, stunden: float) -> None:
    punkte = hz._heiz_punkte.setdefault(bid, [])   # Heizzeit der letzten Stunde (Bedarf: Gerechtigkeit)
    if heizt:
        punkte.append((jetzt, stunden * 60))
    while punkte and (jetzt - punkte[0][0]).total_seconds() > 3600:
        punkte.pop(0)
    if heizt:
        hz.st.zaehler_plus(f"heizzeit:{bid}", stunden)   # eingeschaltet
    if bid in hz._strom_jetzt:   # AN-0011: davon tatsächlich geheizt (Strom über 50 W) – nur das ist ein Heiztag
        hz._strom_jetzt.discard(bid)
        hz._heiztag = True
        hz.st.zaehler_plus(f"heizzeit_strom:{bid}", stunden)
    hz._temperaturverhalten(bid, heizt, jetzt, stunden)


def energie_buchen(hz: Heizung, g: GeraetInfo, kwh: float) -> None:
    """Energie fürs Heizen (Ersparnis) und je Heizkörper-Typ (Vergleich Ölradiator/Konvektor)."""
    hz.st.zaehler_plus("energie_heizen", kwh)
    if g.rolle == ROLLE_HEIZKOERPER:
        hz.st.zaehler_plus(f"energie_typ:{g.typ}", kwh)
        if hz.vergleichbar(g.bereich):
            hz.st.zaehler_plus(f"vgl_kwh:{g.bereich}", kwh)
    hz.ersparnis_buchen()


def ersparnis_buchen(hz: Heizung) -> None:
    """Sensor „Ersparnis“: Änderung der gesparten kWh zum Preis von heute (`logik/zaehlen.ersparnis_buchen`, FE-0035)."""
    st, neu = hz.st, hz.ersparnis_kwh()
    alt = st.zaehler.get("ersparnis_kwh")
    if alt is not None and abs(neu - float(alt)) < 1e-12:
        return
    st.zaehler["ersparnis_kwh"], st.zaehler["ersparnis_eur"] = ersparnis_logik(
        alt, st.zaehler.get("ersparnis_eur"), neu, st.preis_am(dt_util.now().date()))
    st.einstellungen.speichern(ZAEHLER_SPEICHERN_S)


def energie_ausbuchen(hz: Heizung, g: GeraetInfo, kwh: float) -> None:
    """FE-0016: falsch gezählte Energie zurücknehmen (Energie fürs Heizen, je Typ, fairer Vergleich)."""
    hz.st.zaehler_minus("energie_heizen", kwh)
    if g.rolle == ROLLE_HEIZKOERPER:
        hz.st.zaehler_minus(f"energie_typ:{g.typ}", kwh)
        hz.st.zaehler_minus(f"vgl_kwh:{g.bereich}", kwh)
    hz.ersparnis_buchen()


def zaehlen_ende(hz: Heizung, jetzt: datetime, stunden: float) -> None:
    """„Ohne Automatik“ (24-h-Dauerbetrieb) und Heiztage."""
    st = hz.st
    st.zaehler_plus("ohne", hz._ohne_w * stunden / 1000)
    hz.ersparnis_buchen()
    if hz._heiztag and st.zaehler.get("heiztag_letzter") != jetzt.date().isoformat():
        st.zaehler["heiztag_letzter"] = jetzt.date().isoformat()
        st.zaehler_plus("heiztage", 1)
    hz._ohne_w, hz._heiztag = 0.0, False


def _temperaturverhalten(hz: Heizung, bid: str, heizt: bool, jetzt: datetime, stunden: float) -> None:
    """Aufheiz- und Abkühlrate (°C/h) und Gradstunden innen–außen eines Containers mit Fühler."""
    st = hz.st
    info = st.bereiche[bid]
    innen = st.temperatur(info.fuehler)
    if info.art != ART_CONTAINER or innen is None:
        hz._phase.pop(bid, None)
        return
    st.zaehler_plus(f"gradh:{bid}", gradstunden(innen, st.daten.wetter.aussen, stunden))
    fair = hz.vergleichbar(bid)   # AN-0008: nur im Modus Thermostat mit Fühler und einem Typ
    if fair:
        st.zaehler_plus(f"vgl_gradh:{bid}", gradstunden(innen, st.daten.wetter.aussen, stunden))
    phase = hz._phase.get(bid)
    if phase is None or phase[0] != heizt:
        hz._phase[bid] = (heizt, jetzt, innen)
        return
    dauer = (jetzt - phase[1]).total_seconds() / 3600
    if dauer < (AUFHEIZ_MIN_H if heizt else ABKUEHL_MIN_H):
        return
    aenderung = rate(phase[2], innen, dauer)
    key = f"aufheiz:{bid}" if heizt else f"abkuehl:{bid}"
    if aenderung is not None and (aenderung > 0 if heizt else aenderung < 0):
        st.zaehler[key] = mittel(st.zaehler.get(key), abs(aenderung))
        if fair:
            st.zaehler[f"vgl_{key}"] = mittel(st.zaehler.get(f"vgl_{key}"), abs(aenderung))
        st.einstellungen.speichern(ZAEHLER_SPEICHERN_S)
    hz._phase[bid] = (heizt, jetzt, innen)


def mittel_typ(hz: Heizung, typ: str) -> float | None:
    """Mittlere Leistung im Betrieb aller Heizkörper eines Typs (Vergleich Ölradiator/Konvektor)."""
    z = hz.st.zaehler
    werte = [
        z[f"mittel:{g.id}"]
        for g in hz.st.geraete.values()
        if g.rolle == ROLLE_HEIZKOERPER and g.typ == typ and f"mittel:{g.id}" in z
    ]
    return sum(werte) / len(werte) if werte else None


def hochrechnung_heizperiode(hz: Heizung, key: str, *, schaetzung: bool = False) -> float | None:
    """Hochrechnung der Heizperiode (kWh): mit Automatik aus Energiesignatur und Klimamitteln (BSM-033.02), solange es
    davon noch keine gibt – und „ohne Automatik“ bis zur gemessenen Baseline (BSM-033.04) – Tagesschnitt seit Zählbeginn."""
    st = hz.st
    if not schaetzung and key in ("energie_heizen", "ohne"):
        from .hochrechnung import werte   # noqa: PLC0415

        feld = "mit_kwh" if key == "energie_heizen" else "ohne_kwh"   # ohne: gemessene Baseline (BSM-033.04)
        if (w := werte(hz)) is not None and w.get(feld) is not None:
            return float(w[feld])
    seit = dt_util.parse_datetime(st.zaehler["seit"]) if st.zaehler.get("seit") else None
    if seit is None:
        return None
    jetzt = dt_util.now()
    von = int(st.entry.options.get(CONF_HEIZPERIODE_VON, 10))
    bis = int(st.entry.options.get(CONF_HEIZPERIODE_BIS, 4))
    jahr = jetzt.year if jetzt.month >= von else jetzt.year - 1
    tage = (jetzt - seit).total_seconds() / 86400
    ende = st.entry.options.get(CONF_ENDE)
    bis_tag = date.fromisoformat(ende) if ende else None   # geplantes Ende der Baustelle (neu 0.7.8)
    return hochrechnung(st.zaehler.get(key, 0.0), tage, tage_heizperiode(von, bis, jahr, bis_tag))
