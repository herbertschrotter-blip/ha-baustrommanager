"""Gemeinsame Bausteine der Prognose-V2-Tests P3 (Minuten, Geräte, Fenster, Tage) – keine Tests."""

from __future__ import annotations

from datetime import UTC, date, datetime, time, timedelta
from zoneinfo import ZoneInfo

from logik.prognose_merkmale import konfiguration_id
from logik.prognose_typen import (
    BereichIntervall,
    BetriebsKontext,
    Fenster,
    GeraetIntervall,
    Intervall,
    Leistungsreferenz,
    MinutenQualitaet,
    TagesMerkmale,
)

WIEN = ZoneInfo("Europe/Vienna")
TAG = date(2026, 11, 10)
KID = konfiguration_id("thermo", [("hk1", "konvektor")])
P_REF = Leistungsreferenz(2.0, "geraet_einstellung", datetime(2026, 10, 1, tzinfo=UTC), "einstellung:1")


def lokal(stunde: float, tag: date = TAG) -> datetime:
    return (datetime.combine(tag, time(), WIEN) + timedelta(hours=stunde)).astimezone(UTC)


def kontext(**kw) -> BetriebsKontext:
    werte = {"konfiguration_id": KID, "regelungsart": "thermo", "regulaer_freigegeben": True, "frost_bereit": False,
             "frost_grenze_c": 5.0, "frost_aus_c": 7.0, "frost_aussen_c": None, "baseline_lauf_id": None,
             "tuer_beobachtet": True, "kontext_belegt": True, "wechsel_im_intervall": False,
             "staffel_rekonstruiert_frei": None, "anschlussbelegung_belegt": True, "sperrereignis": False,
             "sonstige_eingriffe": (), "kontext_nachweis": "direkt"}
    werte.update(kw)
    return BetriebsKontext(**werte)


def geraet(von: datetime, *, an: float = 0.0, kw: float = 2.0, gid: str = "hk1", typ: str = "konvektor",
           d: float = 60, **extra) -> GeraetIntervall:
    """Gerätminute mit `an` Sekunden Strom bei `kw` Leistung; Relay an (wie in der Regelung oder im Baseline-Lauf)."""
    werte = {"zeit": Intervall(von, von + timedelta(seconds=d)), "geraet_id": gid, "energie_wh": kw * 1000 * an / 3600,
             "energie_gueltig": True, "sekunden_ein": d, "sekunden_strom": an, "strom_belegt": True,
             "leistung_w": kw * 1000 * an / d, "leistung_w_max": kw * 1000 if an else 0.0, "erreichbar": True,
             "heizanforderung_s": an, "staffel_gesperrt_s": 0.0, "p_ref": P_REF, "quelle": "ha", "typ": typ}
    werte.update(extra)
    return GeraetIntervall(**werte)


def minute(von: datetime, *, geraete=None, k=None, d: float = 60, **kw) -> BereichIntervall:
    werte = {"zeit": Intervall(von, von + timedelta(seconds=d)), "bereich_id": "c1", "zeile_vorhanden": True,
             "grund": "arbeitszeit", "zustand": "heizt", "quelle": "ha", "innen_c": 22.0, "innen_gueltig": True,
             "temp_alter_s": 30, "altersnachweis_alt": False, "soll_c": 22.0, "aussen_c": 12.0, "aussen_gueltig": True,
             "aussen_frisch": None, "tuer_offen_s": 0.0, "staffel_begrenzt_s": 0.0}
    werte.update(kw)
    werte["kontext"] = k or kontext()
    werte["geraete"] = tuple(geraete) if geraete is not None else (geraet(von),)
    return BereichIntervall(**werte)


def takt(i: int, an: int = 5, periode: int = 10) -> float:
    """TPI-Takt: `an` von `periode` Minuten voll an (Duty an/periode, eine Ein-Phase je Periode)."""
    return 60.0 if i % periode < an else 0.0


def episode(von: datetime, n: int, *, innen=None, strom=takt, typ: str = "konvektor", vorher: bool = True,
            k=None, **kw) -> list[BereichIntervall]:
    """Eine Minute „ausserhalb“ (Anker sichtbar), dann `n` Minuten Arbeitszeit; `innen(i)`, `strom(i)` je Minute."""
    aus = []
    if vorher:
        t = von - timedelta(minutes=1)
        aus.append(minute(t, grund="ausserhalb", zustand="aus", k=kontext(regulaer_freigegeben=False),
                          geraete=[geraet(t, typ=typ)]))
    for i in range(n):
        t = von + timedelta(minutes=i)
        werte = dict(kw)
        if innen is not None:
            werte["innen_c"] = innen(i)
        aus.append(minute(t, k=k, geraete=[geraet(t, an=strom(i), typ=typ)], **werte))
    return aus


def qualitaet(frische: str = "direkt", staffel: str = "direkt", gruende: tuple[str, ...] = ()) -> MinutenQualitaet:
    return MinutenQualitaet((("hk1", True),), True, True, True, frische, staffel, True, gruende)   # type: ignore[arg-type]


def fenster(von: datetime, h: float, *, x: float = 20.0, stunden: float = 2.0, gueltig: bool = True,
            q: MinutenQualitaet | None = None, art: str = "regulaer", bereich: str = "c1", kid: str = KID,
            innen: float = 22.0, aussen: float = 12.0, lauf_id: str | None = None) -> Fenster:
    """Fenster mit H_w = h (E = h·X)."""
    q = q or qualitaet()
    return Fenster(Intervall(von, von + timedelta(hours=stunden)), bereich, kid, art, h * x, x, innen, aussen, 2.0,   # type: ignore[arg-type]
                   (("hk1", 6),), q.frische, q.staffel, gueltig, () if gueltig else ("innen_trend",), 22.0, q, lauf_id)


def tagm(datum: date, *, gdh: float = 0.0, e: float = 0.0, aktiv_h: float = 10.0, plan_h: float = 0.0,
         kapazitaet: float | None = None, thermo: bool = True, plan: bool = False, kid: str = KID,
         gruende: tuple[str, ...] = ()) -> TagesMerkmale:
    return TagesMerkmale(
        datum=datum, bereich_id="c1", konfiguration_id=kid, dauer_h=24.0, ist_belegt_kwh=e, ist_vollstaendig=True,
        energie_arten_kwh=(("REGULAER", e),), regulaer_joint_kwh=e, gdh_aktiv_kh=gdh, gdh_frost_kh=0.0, gdh_innen_kh=gdh,
        aktiv_h=aktiv_h, frost_h=0.0, plan_h=plan_h, kapazitaet_regulaer_kwh=kapazitaet, aussen_mittel_c=12.0,
        q_energie_je_geraet=(("hk1", 1.0),), q_betrieb=1.0, q_innen=1.0, q_aussen=1.0, q_joint_r=1.0, q_joint_f=None,
        laengste_joint_luecke_s=0.0, starts=(), training_thermo=thermo, training_plan=plan, gruende=gruende)
