"""FE-0029: Rücksprünge der HA-Statistik zählen 0, ein nachgetragener Zähler springt nicht – auf dem Weg zur Seite.

Die HA-Langzeitstatistik (`auswertung._aus_ha`) ist ein Modell: „ohne Automatik (24/7)“ +8,3 kWh je Stunde, nach zwei
Neustarts in der Datenbank-Panne rückwärts (wie 17./18.10.2026). Geprüft werden `baustelle/statistik` (Seite: Verlauf,
Diagramme), `baustelle/auswertung` (Kachel „Gespart“) und `baustelle/zaehler_korrigieren`.
"""

from __future__ import annotations

from datetime import datetime, timedelta
from typing import Any

import pytest

from homeassistant.core import HomeAssistant
from homeassistant.util import dt as dt_util

from custom_components.baustelle import auswertung

from .conftest import eid

ZUWACHS = 8.3
# Rücksprünge (Beginn der Stunde UTC → Änderung) – in der Woche ab Mo 28.09.2026 (Baustelle steht am 29.09. 16:50)
RUECK = {datetime(2026, 9, 28, 15, tzinfo=dt_util.UTC): -146.8, datetime(2026, 9, 29, 10, tzinfo=dt_util.UTC): -187.5}


class HaStatistik:
    """Stundenwerte des Sensors „ohne Automatik“ wie der Recorder; Tag = Summe der Stunden (lokal)."""

    def __init__(self, hass: HomeAssistant, ohne: str) -> None:
        self.hass, self.ohne = hass, ohne
        self.sprung: dict[datetime, float] = {}   # Stunde → nachgetragener Betrag (Zustand gesprungen)
        self.abfragen: list[str] = []

    def stunde(self, t: datetime) -> float:
        return RUECK.get(t, ZUWACHS) + self.sprung.get(t, 0.0)

    async def __call__(self, hass, ids, start: datetime, ende: datetime, periode: str, arten: set[str]) -> dict[str, list[dict[str, Any]]]:
        self.abfragen.append(periode)
        if self.ohne not in ids:
            return {}
        zone = dt_util.get_default_time_zone()
        t = dt_util.as_utc(start).replace(minute=0, second=0, microsecond=0)
        bis = min(dt_util.as_utc(ende), dt_util.utcnow().replace(minute=0, second=0, microsecond=0))
        eimer: dict[datetime, list[float]] = {}
        while t < bis:
            beginn = t if periode == "hour" else t.astimezone(zone).replace(hour=0)
            eimer.setdefault(beginn, []).append(self.stunde(t))
            t += timedelta(hours=1)
        laenge = timedelta(hours=1) if periode == "hour" else timedelta(days=1)
        punkte = [{"start": b.timestamp(), "end": (b + laenge).timestamp(), **({"change": sum(w)} if "change" in arten else {})}
                  for b, w in sorted(eimer.items())]
        return {self.ohne: punkte}


@pytest.fixture
def ha(hass: HomeAssistant, baustelle, monkeypatch) -> HaStatistik:
    modell = HaStatistik(hass, eid(hass, "sensor", f"{baustelle.entry_id}_energie_ohne_automatik"))
    monkeypatch.setattr(auswertung, "_aus_ha", modell)
    hass.config.components.add("recorder")
    return modell


@pytest.fixture
async def ws(hass: HomeAssistant, baustelle, hass_ws_client):
    client = await hass_ws_client(hass)
    nr = {"id": 0}

    async def rufe(typ: str, **felder) -> dict[str, Any]:
        nr["id"] += 1
        await client.send_json({"id": nr["id"], "type": typ, "entry_id": baustelle.entry_id, **felder})
        return await client.receive_json()

    return rufe


async def _statistik(ws, ha: HaStatistik, periode: str) -> list[dict[str, Any]]:
    antwort = await ws("baustelle/statistik", start_time="2026-09-27T22:00:00+00:00", statistic_ids=[ha.ohne], period=periode,
                       types=["change", "mean", "state"])
    assert antwort["success"], antwort
    return antwort["result"][ha.ohne]


async def test_seite_bekommt_keinen_ruecksprung(hass: HomeAssistant, ws, ha) -> None:
    """Ticket FE-0029: Stunden mit Rücksprung zählen 0, der Tag ist die Summe der bereinigten Stunden."""
    stunden = await _statistik(ws, ha, "hour")
    assert min(p["change"] for p in stunden) == 0.0 and sum(p["change"] == 0.0 for p in stunden) == len(RUECK)
    tage = await _statistik(ws, ha, "day")
    assert [p["change"] for p in tage] == pytest.approx([24 * ZUWACHS - ZUWACHS, sum(p["change"] for p in stunden[24:])])
    assert all(p["change"] > 0 for p in tage)
    assert "hour" in ha.abfragen[-1:]   # Tag aus den Stunden gerechnet


async def test_kachel_gespart_ohne_ruecksprung(hass: HomeAssistant, ws, ha) -> None:
    r = (await ws("baustelle/auswertung", zeitraum="Woche"))["result"]
    g = r["gespart_reihen"]
    stunden = (datetime(2026, 9, 29, 14, tzinfo=dt_util.UTC) - datetime(2026, 9, 27, 22, tzinfo=dt_util.UTC)) // timedelta(hours=1)
    assert r["summen"]["ohne"] == pytest.approx((stunden - len(RUECK)) * ZUWACHS)
    assert all(v is None or v >= 0 for v in g["ohne_kwh"]) and g["ohne_kwh"][0] == pytest.approx(23 * ZUWACHS)


async def test_zaehler_korrigieren_ohne_sprung(hass: HomeAssistant, baustelle, ws, ha, freezer, hass_admin_user) -> None:
    """Zähler „ohne“ einmalig +362,1 kWh: Zählerstand stimmt, Statistik und Kachel zeigen keinen Sprung, Protokoll."""
    st = baustelle.runtime_data
    vorher = st.zaehler.get("ohne", 0.0)
    gruppen, hass_admin_user.groups = hass_admin_user.groups, []   # ohne Admin-Recht
    antwort = await ws("baustelle/zaehler_korrigieren", key="ohne", plus_kwh=362.1, grund="Datenbank-Panne 16.–19.10.")
    assert not antwort["success"] and antwort["error"]["code"] == "unauthorized"
    hass_admin_user.groups = gruppen
    assert (await ws("baustelle/zaehler_korrigieren", key="energie", plus_kwh=1, grund="nein"))["error"]["code"] == "invalid_format"
    antwort = await ws("baustelle/zaehler_korrigieren", key="ohne", plus_kwh=362.1, grund="Datenbank-Panne 16.–19.10.")
    assert antwort["success"], antwort
    e = antwort["result"]
    assert st.zaehler["ohne"] == pytest.approx(vorher + 362.1)
    assert e["sprung"]["energie_ohne_automatik"] == pytest.approx(362.1) and "ersparnis" in e["sprung"]
    assert st.e["korrekturen"] == [e] and e["von"] == hass_admin_user.name
    assert st.e["protokoll"][0][3] == "Zähler „ohne“ um 362,1 kWh nachgetragen: Datenbank-Panne 16.–19.10."
    assert float(hass.states.get(ha.ohne).state) == pytest.approx(vorher + 362.1, abs=0.01)   # Sensor gleich nachgezogen
    # HA schreibt den Sprung in die Stunde der Korrektur (hier 29.09. 14:00 UTC); eine Stunde später ist sie in der Statistik
    stunde = dt_util.utcnow().replace(minute=0, second=0, microsecond=0)
    ha.sprung[stunde] = 362.1
    freezer.tick(timedelta(hours=1))
    stunden = await _statistik(ws, ha, "hour")
    assert max(p["change"] for p in stunden) == pytest.approx(ZUWACHS)   # kein +362-Sprung
    tage = await _statistik(ws, ha, "day")
    assert tage[1]["change"] == pytest.approx(sum(p["change"] for p in stunden[24:]))
    # Gegenprobe: ohne den gemerkten Ausgleich wäre der Sprung da
    st.e["korrekturen"] = []
    assert max(p["change"] for p in await _statistik(ws, ha, "hour")) == pytest.approx(362.1 + ZUWACHS)
