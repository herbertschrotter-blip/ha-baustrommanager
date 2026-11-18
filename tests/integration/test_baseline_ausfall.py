"""Baseline-Tage zählen nur, wenn der Container gemessen wurde (Bauplan Hochrechnung §6): Die Hochrechnung bewertet die
Lauftage aus der Datenbank (Heizkörper erreichbar, nicht Notprogramm) – auch rückwirkend für einen schon fertigen Lauf."""

from __future__ import annotations

from datetime import date, datetime, timedelta
from zoneinfo import ZoneInfo

from sqlalchemy import insert

from homeassistant.core import HomeAssistant

from custom_components.baustelle.daten import struktur
from custom_components.baustelle.db import DATA_DB, schema as s
from custom_components.baustelle.funktionen.heizung import Heizung
from custom_components.baustelle.funktionen.heizung import baseline as hb
from custom_components.baustelle.funktionen.heizung.hochrechnung import async_rechnen
from custom_components.baustelle.logik.baseline import Lauf

from .conftest import C1, HK1, baustelle_anlegen

WIEN = ZoneInfo("Europe/Vienna")
SA, SO, MO = date(2026, 11, 14), date(2026, 11, 15), date(2026, 11, 16)


def _null(d: date) -> datetime:
    return datetime.combine(d, datetime.min.time(), WIEN)


async def test_tag_mit_ausfall_zaehlt_nicht(hass: HomeAssistant, freezer, shellys, nachrichten) -> None:
    entry = await baustelle_anlegen(hass, freezer, zeit="2026-11-20 10:00:00+01:00")
    assert await hass.config_entries.async_setup(entry.entry_id)
    await hass.async_block_till_done()
    st, bid = entry.runtime_data, entry.entry_id
    st.e["heizung"]["baseline"] = True
    hz = Heizung.von(st)
    # Sa: HA schreibt mit, Heizkörper die ganzen 24 h erreichbar; So: HA schreibt weiter, der Heizkörper ist ab 06:00 offline
    tb = [{"bereich_id": C1, "datum": d, "baustelle_id": bid, "kwh": 8.0, "aussen_mittel": 3.0} for d in (SA, SO)]
    bm = [{"bereich_id": C1, "zeit": _null(d) + timedelta(hours=h), "baustelle_id": bid, "dauer_s": 3600, "quelle": "ha"}
          for d in (SA, SO) for h in range(24)]
    gm = [{"geraet_id": HK1, "zeit": _null(d) + timedelta(hours=h), "baustelle_id": bid, "dauer_s": 3600, "quelle": "ha",
           "erreichbar": d == SA or h < 6} for d in (SA, SO) for h in range(24)]

    def schreiben(v):
        v.execute(insert(s.tag_bereich), tb)
        v.execute(insert(s.bereich_minute), bm)
        v.execute(insert(s.geraet_minute), gm)
        return True
    assert await hass.data[DATA_DB].async_ausfuehren(schreiben) is not None
    hb._speichern(hz, [Lauf("a8f0d4a7", C1, SA, MO, "fertig", 9.0)])
    assert hb.zaehlende(hz) == {C1: {SA, SO}}   # vor der Bewertung wie bisher

    await async_rechnen(hass, hz)
    assert hb.ausfall(hz) == {"a8f0d4a7": {SO.isoformat(): "offline"}}
    assert st.lz["baseline"]["ausfall"] == {"a8f0d4a7": {SO.isoformat(): "offline"}}   # gemerkt (übersteht den Neustart)
    assert hb.zaehlende(hz) == {C1: {SA}}
    # der Tag mit Ausfall lief trotzdem ohne Automatik: nie in die Signatur „mit Automatik“ (Selbst-Review 17.11.2026)
    assert hb.lauf_tage(hz) == {C1: {SA, SO}}
    assert next(c for c in hz.hochrechnung["container"] if c["bereich"] == C1)["tage"] == 0
    l = next(x for x in struktur(hass, entry)["laufzeit"]["baseline"]["laeufe"] if x["id"] == "a8f0d4a7")
    assert l["status"] == "fertig" and l["zaehlt"] == 1 and l["tage"] == 2
    assert l["grund"] == "offline: So 15.11. – zählt nicht"


async def test_offline_tag_zaehlt_auch_mit_automatik_nicht(hass: HomeAssistant, freezer, shellys, nachrichten) -> None:
    """0.8.175: Ein Tag, an dem ein Heizkörper offline war, fehlt auch in der Signatur „mit Automatik“ (Summe zu niedrig)."""
    entry = await baustelle_anlegen(hass, freezer, zeit="2026-11-20 10:00:00+01:00")
    assert await hass.config_entries.async_setup(entry.entry_id)
    await hass.async_block_till_done()
    st, bid = entry.runtime_data, entry.entry_id
    hz = Heizung.von(st)
    di = MO + timedelta(days=1)
    tb = [{"bereich_id": C1, "datum": d, "baustelle_id": bid, "kwh": 8.0, "aussen_mittel": 3.0} for d in (MO, di)]
    bm = [{"bereich_id": C1, "zeit": _null(d) + timedelta(hours=h), "baustelle_id": bid, "dauer_s": 3600, "quelle": "ha"}
          for d in (MO, di) for h in range(24)]
    gm = [{"geraet_id": HK1, "zeit": _null(d) + timedelta(hours=h), "baustelle_id": bid, "dauer_s": 3600, "quelle": "ha",
           "erreichbar": d == MO or h < 6} for d in (MO, di) for h in range(24)]

    def schreiben(v):
        v.execute(insert(s.tag_bereich), tb)
        v.execute(insert(s.bereich_minute), bm)
        v.execute(insert(s.geraet_minute), gm)
        return True
    assert await hass.data[DATA_DB].async_ausfuehren(schreiben) is not None

    await async_rechnen(hass, hz)
    assert next(c for c in hz.hochrechnung["container"] if c["bereich"] == C1)["tage"] == 1   # nur Mo
