"""Lasttest Tagessummen (BSM-009): 30 Tage Minutenwerte für 10 Geräte in 5 Containern – ein Tag in unter 1 s.

Ein Jahr wären zwölfmal so viele Zeilen; die Abfrage eines Tages geht über den Schlüssel (Gerät, Zeit) bzw.
(Baustelle, Zeit) und hängt deshalb kaum von der Menge ab.

Gemessen wird die CPU-Zeit dieses Prozesses (SQLite rechnet im Prozess), nicht die Wanduhr: Im gemeinsamen Prüflauf
teilen sich Integrationstests (xdist auf allen Kernen), Panel- und Browser-Test den Pi, die Wanduhr misst dann vor allem
das Warten auf einen Kern (BSM-035). Bester von drei Läufen (`tag_rechnen` ersetzt den Tag, ist also wiederholbar);
eine echte Verlangsamung trifft jeden Lauf und bleibt rot (Gegenprobe: zehnfache Arbeit → 6,9 s CPU, rot; allein
und unter Last sonst gleichmäßig um 0,65 s).
"""

from datetime import date, datetime, timedelta, timezone
import time

from sqlalchemy import create_engine, func, insert, select

from custom_components.baustelle.db import schema as s
from custom_components.baustelle.db.migration import migrieren
from custom_components.baustelle.db.tage import TagRahmen, tag_rechnen

TAGE, GERAETE, BEREICHE = 30, 10, 5


def test_ein_tag_aus_einem_monat_minuten(tmp_path) -> None:
    pfad = tmp_path / "last.db"
    engine = create_engine(f"sqlite:///{pfad}")
    migrieren(engine, pfad)
    start = datetime(2026, 11, 1, tzinfo=timezone.utc)
    geraete = {f"g{i}": (f"b{i % BEREICHE}", "heizkoerper") for i in range(GERAETE)}
    with engine.begin() as v:
        for tag in range(TAGE):
            gz, bz = [], []
            for minute in range(1440):
                t = start + timedelta(days=tag, minutes=minute)
                an = 360 <= minute < 1020
                gz += [{"geraet_id": g, "zeit": t, "baustelle_id": "b", "dauer_s": 60, "sekunden_ein": 60 if an else 0,
                        "leistung_w": 2000.0 if an else 0.0, "leistung_w_max": 2000.0 if an else 0.0,
                        "energie_wh": 33.3 if an else 0.0, "zaehlerstand_kwh": None, "erreichbar": True, "quelle": "ha"} for g in geraete]
                bz += [{"bereich_id": f"b{i}", "zeit": t, "baustelle_id": "b", "dauer_s": 60, "temperatur": 19.0,
                        "quelle": "ha"} for i in range(BEREICHE)]
            v.execute(insert(s.geraet_minute), gz)
            v.execute(insert(s.bereich_minute), bz)
    r = TagRahmen(baustelle_id="b", zone=timezone.utc, geraete=geraete, heizrollen=frozenset({"heizkoerper"}),
                  preis={date(2026, 11, 15): 0.2}, firma={})
    dauer = float("inf")
    for _ in range(3):
        beginn = time.process_time()
        with engine.begin() as v:
            assert tag_rechnen(v, r, date(2026, 11, 15)) == (GERAETE, BEREICHE)
        dauer = min(dauer, time.process_time() - beginn)
    with engine.connect() as v:
        kwh = v.execute(select(func.sum(s.tag_geraet.c.kwh))).scalar()
        anzahl = v.execute(select(func.count()).select_from(s.geraet_minute)).scalar()
    engine.dispose()
    assert anzahl == TAGE * 1440 * GERAETE
    assert kwh == round(GERAETE * 660 * 33.3 / 1000, 1) or abs(kwh - GERAETE * 660 * 33.3 / 1000) < 0.01
    assert dauer < 1.0, f"ein Tag dauerte {dauer:.2f} s CPU"
