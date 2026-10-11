"""Heizung: Baseline-Läufe „ohne Automatik“ (BSM-033.04, Bauplan Hochrechnung §6) – Ablauf, Regeln in `logik/baseline`.

Jede Minute (`takt`, aus `Heizung.nach_schalten`): ausgeschaltet → offene Läufe absagen/abbrechen; ein geplanter Lauf
beginnt an seinem ersten Tag um 00:00 und endet nach dem letzten Tag; ein laufender bricht ab bei Automatik aus,
offener Tür/Fenster über die Tür-Pause, Taste, Bedarf oder Termin. Ab 12:00 einmal am Tag: Lauf für morgen planen und
ankündigen (Nachricht mit „Absagen“). Startet aus (`heizung.baseline`); geschaltet wird über den Soll-Grund `BASELINE`
(plan.py → logik/regelung), Frost, Hand und Tür-Pause bleiben davor. Läufe in `lz["baseline"]`.
"""

from __future__ import annotations

from datetime import date, datetime, timedelta
import logging
from typing import TYPE_CHECKING, Any
import uuid

from homeassistant.util import dt as dt_util

from ...const import ROLLE_HEIZKOERPER
from ...kern.staffelung import nenn_kw
from ...logik import baseline as b
from ...logik.arbeitszeit import ausnahme_am, frei_gilt

if TYPE_CHECKING:
    from . import Heizung

LZ = "baseline"
_LOGGER = logging.getLogger(__name__)


def _lz(hz: Heizung) -> dict[str, Any]:
    stand: dict[str, Any] = hz.st.lz.setdefault(LZ, {})
    stand.setdefault("laeufe", [])
    return stand


def laeufe(hz: Heizung) -> list[b.Lauf]:
    return [b.Lauf.aus_dict(d) for d in _lz(hz)["laeufe"]]


def _speichern(hz: Heizung, liste: list[b.Lauf]) -> None:
    _lz(hz)["laeufe"] = [l.als_dict() for l in liste][-60:]
    hz.st.einstellungen.speichern()


def eingeschaltet(hz: Heizung) -> bool:
    return bool(hz.st.e["heizung"].get("baseline"))


def laeuft(hz: Heizung, bid: str, jetzt: datetime) -> bool:
    """Läuft gerade ein Baseline-Lauf in diesem Container (für den Soll-Grund)?"""
    return eingeschaltet(hz) and b.laeuft_am(laeufe(hz), bid, jetzt.date()) is not None


def frei(hz: Heizung, tag: date) -> bool:
    """Ein freier Tag: keine Arbeitszeit (Wochenende) oder frei (Urlaub, Feiertag, Ausnahme frei)."""
    return frei_gilt(hz.ist_frei(tag), ausnahme_am(hz.st.ausnahmen(), tag)) or hz.plan(tag, False) is None


def _typ(typen: set[str]) -> str:
    return "" if not typen else next(iter(typen)) if len(typen) == 1 else "gemischt"


def kandidaten(hz: Heizung, heute: date) -> list[b.Kandidat]:
    st, aus = hz.st, []
    tage = b.zaehlende_tage(laeufe(hz))
    ohne = {c["bereich"]: c for c in ((hz.hochrechnung or {}).get("ohne") or {}).get("container", [])}
    for info in hz.bereiche():
        e = st.einstellungen.bereich(info.id)
        if not e.get("auto", True) or e.get("bedarf") or hz.modus(info.id) == "aus":
            continue   # Container ohne Automatik, bei Bedarf oder aus: kein Lauf
        heizer = [g for g in st.geraete_in(info.id) if g.rolle == ROLLE_HEIZKOERPER and st.geraet_aktiv(g)]
        gesperrt = frozenset(d for von, bis, _ in hz.termin_fenster(info.id)
                             for d in (von.date() + timedelta(days=i) for i in range((bis.date() - von.date()).days + 1)))
        o = ohne.get(info.id) or {}
        aus.append(b.Kandidat(info.id, info.name, _typ({g.typ for g in heizer}), sum(nenn_kw(st, g) for g in heizer),
                              len(tage.get(info.id, ())), o.get("stand") == "gut", o.get("kwh_je_tag"), gesperrt))
    return aus


def _bedarf_oder_termin(hz: Heizung, bid: str, jetzt: datetime) -> tuple[bool, bool]:
    bedarf = hz.bis("bedarf_bis", bid, jetzt) is not None or hz.bis("boost_bis", bid, jetzt) is not None
    termin = any(von <= jetzt < bis for von, bis, _ in hz.termin_fenster(bid))
    return bedarf, termin


def absagen(hz: Heizung, lauf_id: str, grund: str) -> bool:
    """Lauf absagen (vor dem Start) bzw. abbrechen (Knopf in der Nachricht, Seite)."""
    liste, heute = laeufe(hz), dt_util.now().date()
    for i, l in enumerate(liste):
        if l.id == lauf_id and l.status in b.OFFEN:
            liste[i] = b.abbrechen(l, heute, grund)
            _speichern(hz, liste)
            hz.st.protokoll("schalten", l.bereich, f"Baseline {'abgesagt' if l.status == 'geplant' else 'abgebrochen'}: {grund}")
            return True
    return False


def _konfiguration(hz: Heizung, bid: str) -> str | None:
    """Konfigurations-ID für die Metadaten – ein Fehler dabei darf den Lauf nicht aufhalten (dann None)."""
    try:
        return hz.prognose_kontext(bid)[1]
    except Exception:   # noqa: BLE001 – nur Metadaten
        _LOGGER.exception("Konfiguration für den Baseline-Lauf nicht bestimmbar")
        return None


def takt(hz: Heizung, jetzt: datetime) -> None:
    st, heute = hz.st, jetzt.date()
    liste = laeufe(hz)
    vorher = list(liste)
    an = eingeschaltet(hz)
    namen = {i.id: i.name for i in hz.bereiche()}
    for i, l in enumerate(liste):
        if l.status not in b.OFFEN:
            continue
        if not an:
            liste[i] = b.abbrechen(l, heute, "Baseline ausgeschaltet")
        elif l.status == "geplant" and heute >= l.von:
            if heute >= l.bis:
                liste[i] = b.abbrechen(l, heute, "verpasst")
            else:
                # BSM-033.06: Konfiguration und Annahme „Thermostate unverändert“ beim Start einfrieren
                liste[i] = l = b.starten(l, dt_util.utcnow(), _konfiguration(hz, l.bereich))
                st.protokoll("schalten", l.bereich, f"Baseline startet: alle Heizkörper ohne Automatik bis {l.bis - timedelta(days=1):%d.%m.}")
        if liste[i].status == "laeuft":
            l = liste[i]
            if heute >= l.bis:
                liste[i] = b.Lauf(**{**l.__dict__, "status": "fertig"})
                st.protokoll("schalten", l.bereich, "Baseline fertig – Automatik übernimmt")
            else:
                e = st.einstellungen.bereich(l.bereich)
                offen = st.kontakt_offen_seit(l.bereich)
                bedarf, termin = _bedarf_oder_termin(hz, l.bereich, jetzt)
                grund = b.abbruch_grund(
                    automatik=st.automatik and bool(e.get("auto", True)),
                    tuer_offen_min=(jetzt - offen).total_seconds() / 60 if offen is not None else None,
                    tuer_pause_min=float(st.e["heizung"]["tuer_pause_min"]),
                    taste=hz.bis("taste_bis", l.bereich, jetzt) is not None, bedarf=bedarf, termin=termin)
                if grund:
                    liste[i] = b.abbrechen(l, heute, grund)
                    st.protokoll("schalten", l.bereich, f"Baseline abgebrochen: {grund}")
                    st.nachrichten.melden("Baseline abgebrochen", f"{namen.get(l.bereich, l.bereich)}: {grund}. Die Automatik übernimmt.",
                                          tag="baseline", bereich=l.bereich, protokoll=False)
    stand = _lz(hz)
    if an and st.automatik and jetzt.hour >= 12 and stand.get("geplant_am") != heute.isoformat():
        stand["geplant_am"] = heute.isoformat()
        morgen = heute + timedelta(days=1)
        lauf = b.planen(heute, lambda d: frei(hz, d), kandidaten(hz, heute), liste,
                        float(st.e["heizung"].get("baseline_eur_monat", b.BUDGET_EUR)), st.preis_am(morgen), uuid.uuid4().hex[:8])
        if lauf is not None and lauf.von == morgen:
            liste.append(lauf)
            name, letzter = namen.get(lauf.bereich, lauf.bereich), lauf.bis - timedelta(days=1)
            zeit = f"{lauf.von:%d.%m.}" if lauf.von == letzter else f"{lauf.von:%d.%m.}–{letzter:%d.%m.}"
            st.nachrichten.melden(
                "Baseline-Messung morgen",
                f"{name}: {zeit} alle Heizkörper ohne Automatik (der Thermostat am Gerät regelt), etwa {lauf.schaetzung_eur:.0f} €. "
                "Damit wird gemessen, was die Automatik spart.",
                aktionen=[st.nachrichten._aktion("baseline_absagen", lauf.id, "Absagen")], tag="baseline", bereich=lauf.bereich)
        else:
            st.einstellungen.speichern()
    if liste != vorher:
        _speichern(hz, liste)
