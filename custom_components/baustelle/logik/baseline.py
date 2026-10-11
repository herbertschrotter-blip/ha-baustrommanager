"""Baseline-Läufe „ohne Automatik“ (BSM-033.04, Bauplan Hochrechnung §6) – ohne HA-Code.

Ein Lauf hält alle Heizkörper eines Containers über ganze freie Tage durchgehend am Strom (der Thermostat am Heizkörper
regelt). Aus diesen Tagen entsteht die Signatur „ohne Automatik“ (IPMVP Option B). Entscheidungen Herbert 11.10.2026:
ganzer Container, Kostenrahmen je Monat (Vorgabe 60 €), Ankündigung am Vortag 12:00 mit „Absagen“, nur freie Tage.

- **Block** (`freier_block`): erster freier Tag ab einem Datum, mit dem nächsten freien Tag zusammen höchstens
  `MAX_TAGE` Tage (Samstag + Sonntag = 48 h).
- **Container** (`container_waehlen`): nicht fertig (Signatur „ohne“ noch nicht gut), Container mit nur einem
  Heizkörper-Typ zuerst, abwechselnd Ölradiator und Konvektor, dann die wenigsten Baseline-Tage.
- **Kosten** (`schaetzung_eur`): erwarteter Verbrauch (Signatur „ohne“), sonst Nennleistung × Stunden × `ANTEIL`
  (Thermostat regelt etwa die Hälfte der Zeit) × Strompreis. Ein Lauf passt, wenn er in den Rest des Monatsrahmens geht
  (`monat_rest`: Rahmen − gemessene bzw. geschätzte Kosten der Läufe des Monats, abgesagte zählen nicht).
- **Abbruch** (`abbruch_grund`): Automatik aus, Tür/Fenster länger als die Tür-Pause offen, Taste, Bedarf, Termin.
- **Zählende Tage** (`zaehlende_tage`): alle Tage eines fertigen Laufs, bei einem abgebrochenen die Tage vor dem Abbruch.
- **Metadaten für die Prognose V2** (BSM-033.06, Bauvorlage r5 §5.3): `starten` friert beim Laufbeginn Konfiguration
  und Annahme ein. Die Thermostate am Heizkörper gelten als unverändert *angenommen* (Herbert: Läufe am Wochenende,
  niemand verstellt) – eine Annahme, keine Messung; die Stellung selbst bleibt „unbekannt“. Alte Läufe ohne diese
  Felder lesen sich als „unbekannt“.
"""

from __future__ import annotations

from collections.abc import Callable, Iterable, Sequence
from dataclasses import dataclass, field, replace
from datetime import date, datetime, timedelta

from .prognose_typen import THERMOSTAT_NACHWEISE, THERMOSTATSTELLUNGEN, ThermostatNachweis, Thermostatstellung

MAX_TAGE = 2                # höchstens zwei ganze Tage je Lauf (48 h)
SUCHE_TAGE = 14             # so weit voraus wird ein freier Block gesucht
ANTEIL = 0.5                # ohne Signatur: der Thermostat am Heizkörper lässt ihn etwa die Hälfte der Zeit heizen
BUDGET_EUR = 60.0           # Vorgabe Kostenrahmen je Monat (Herbert 11.10.2026)
OFFEN = ("geplant", "laeuft")
STATUS = ("geplant", "laeuft", "fertig", "abgebrochen", "abgesagt")


@dataclass(frozen=True)
class Lauf:
    id: str
    bereich: str
    von: date                       # erster Tag (00:00)
    bis: date                       # Tag nach dem letzten Tag (00:00, ausschließlich)
    status: str = "geplant"
    schaetzung_eur: float = 0.0
    kosten_eur: float | None = None   # gemessen, sobald fertig/abgebrochen
    grund: str | None = None          # warum abgebrochen/abgesagt
    ende: date | None = None          # Tag des Abbruchs (zählt nicht mehr)
    thermostat_unveraendert: ThermostatNachweis = "unbekannt"   # P1: beim Start „angenommen“
    thermostatstellung: Thermostatstellung = "unbekannt"
    annahme_am: datetime | None = None
    konfiguration_id: str | None = None
    p_ref_belege: tuple[str, ...] = ()

    def tage(self) -> list[date]:
        return [self.von + timedelta(days=i) for i in range((self.bis - self.von).days)]

    def als_dict(self) -> dict[str, object]:
        return {"id": self.id, "bereich": self.bereich, "von": self.von.isoformat(), "bis": self.bis.isoformat(),
                "status": self.status, "schaetzung_eur": round(self.schaetzung_eur, 2), "kosten_eur": self.kosten_eur,
                "grund": self.grund, "ende": self.ende.isoformat() if self.ende else None,
                "thermostat_unveraendert": self.thermostat_unveraendert, "thermostatstellung": self.thermostatstellung,
                "annahme_am": self.annahme_am.isoformat() if self.annahme_am else None,
                "konfiguration_id": self.konfiguration_id, "p_ref_belege": list(self.p_ref_belege)}

    @staticmethod
    def aus_dict(d: dict[str, object]) -> Lauf:
        nachweis, stellung, belege = d.get("thermostat_unveraendert"), d.get("thermostatstellung"), d.get("p_ref_belege")
        return Lauf(str(d["id"]), str(d["bereich"]), date.fromisoformat(str(d["von"])), date.fromisoformat(str(d["bis"])),
                    str(d.get("status") or "geplant"), float(d.get("schaetzung_eur") or 0.0),   # type: ignore[arg-type]
                    None if d.get("kosten_eur") is None else float(d["kosten_eur"]),   # type: ignore[arg-type]
                    d.get("grund") or None, date.fromisoformat(str(d["ende"])) if d.get("ende") else None,   # type: ignore[arg-type]
                    nachweis if nachweis in THERMOSTAT_NACHWEISE else "unbekannt",   # type: ignore[arg-type]
                    stellung if stellung in THERMOSTATSTELLUNGEN else "unbekannt",   # type: ignore[arg-type]
                    datetime.fromisoformat(str(d["annahme_am"])) if d.get("annahme_am") else None,
                    str(d["konfiguration_id"]) if d.get("konfiguration_id") else None,
                    tuple(str(b) for b in belege) if isinstance(belege, (list, tuple)) else ())


@dataclass(frozen=True)
class Kandidat:
    bereich: str
    name: str
    typ: str                        # "oelradiator" | "konvektor" | "gemischt" | "" (keine Heizkörper)
    nenn_kw: float                  # Summe der Heizkörper
    baseline_tage: int = 0
    fertig: bool = False            # Signatur „ohne“ ist gut
    erwartet_kwh_tag: float | None = None   # aus der Signatur „ohne“, wenn es sie schon gibt
    gesperrt: frozenset[date] = field(default_factory=frozenset)   # Tage mit Termin oder Bedarf


def freier_block(ab: date, frei: Callable[[date], bool], suche: int = SUCHE_TAGE) -> tuple[date, date] | None:
    """Erster freier Block ab `ab` (höchstens `MAX_TAGE` Tage): (erster Tag, Tag danach)."""
    for i in range(suche):
        d = ab + timedelta(days=i)
        if frei(d):
            n = 1
            while n < MAX_TAGE and frei(d + timedelta(days=n)):
                n += 1
            return d, d + timedelta(days=n)
    return None


def container_waehlen(kandidaten: Iterable[Kandidat], letzter_typ: str | None, tage: Sequence[date]) -> Kandidat | None:
    """Nächster Container (siehe Modul-Docstring); ohne Heizkörper, fertig oder an einem der Tage gesperrt zählt keiner."""
    frei = [k for k in kandidaten if not k.fertig and k.typ and k.nenn_kw > 0 and not k.gesperrt.intersection(tage)]
    if not frei:
        return None
    return min(frei, key=lambda k: (k.typ == "gemischt", k.typ == letzter_typ, k.baseline_tage, k.name))


def schaetzung_eur(k: Kandidat, tage: int, preis: float) -> float:
    kwh = k.erwartet_kwh_tag * tage if k.erwartet_kwh_tag is not None else k.nenn_kw * 24 * tage * ANTEIL
    return kwh * preis


def monat_rest(laeufe: Iterable[Lauf], jahr: int, monat: int, budget: float) -> float:
    """Rest des Monatsrahmens (nach dem ersten Tag des Laufs gezählt)."""
    verbraucht = sum(l.kosten_eur if l.kosten_eur is not None else l.schaetzung_eur
                     for l in laeufe if l.status != "abgesagt" and (l.von.year, l.von.month) == (jahr, monat))
    return budget - verbraucht


def planen(
    heute: date, frei: Callable[[date], bool], kandidaten: Sequence[Kandidat], laeufe: Sequence[Lauf], budget: float,
    preis: float, neue_id: str,
) -> Lauf | None:
    """Nächsten Lauf ab morgen planen; keiner, solange einer geplant ist oder läuft, oder wenn der Rahmen nicht reicht."""
    if any(l.status in OFFEN for l in laeufe):
        return None
    block = freier_block(heute + timedelta(days=1), frei)
    if block is None:
        return None
    von, bis = block
    tage = [von + timedelta(days=i) for i in range((bis - von).days)]
    letzter = max((l for l in laeufe if l.status != "abgesagt"), key=lambda l: l.von, default=None)
    typen = {k.bereich: k.typ for k in kandidaten}
    k = container_waehlen(kandidaten, typen.get(letzter.bereich) if letzter else None, tage)
    if k is None:
        return None
    eur = schaetzung_eur(k, len(tage), preis)
    if eur > monat_rest(laeufe, von.year, von.month, budget):
        return None
    return Lauf(neue_id, k.bereich, von, bis, "geplant", eur)


def abbruch_grund(*, automatik: bool, tuer_offen_min: float | None, tuer_pause_min: float, taste: bool, bedarf: bool,
                  termin: bool) -> str | None:
    """Warum ein laufender Lauf endet (None = weiter)."""
    if not automatik:
        return "Automatik aus"
    if tuer_offen_min is not None and tuer_offen_min > tuer_pause_min:
        return "Tür oder Fenster offen"
    if taste:
        return "Taste am Plug"
    if bedarf:
        return "Bedarf"
    if termin:
        return "Termin"
    return None


def starten(l: Lauf, jetzt: datetime, konfiguration_id: str | None, p_ref_belege: Sequence[str] = ()) -> Lauf:
    """Lauf beginnt: Status „laeuft“, Metadaten für die Prognose eingefroren (Thermostate angenommen unverändert)."""
    return replace(l, status="laeuft", thermostat_unveraendert="angenommen", thermostatstellung="unbekannt",
                   annahme_am=jetzt, konfiguration_id=konfiguration_id, p_ref_belege=tuple(p_ref_belege))


def abbrechen(l: Lauf, heute: date, grund: str) -> Lauf:
    """Abbruch: Tage ab heute zählen nicht mehr; vor dem Start heißt es „abgesagt“."""
    if l.status == "geplant":
        return replace(l, status="abgesagt", grund=grund)
    return replace(l, status="abgebrochen", grund=grund, ende=heute)


def zaehlende_tage(laeufe: Iterable[Lauf]) -> dict[str, set[date]]:
    """Je Container die Tage „ohne Automatik“ (für `logik/signatur.je_betrieb`)."""
    aus: dict[str, set[date]] = {}
    for l in laeufe:
        if l.status == "fertig":
            aus.setdefault(l.bereich, set()).update(l.tage())
        elif l.status == "abgebrochen" and l.ende is not None:
            aus.setdefault(l.bereich, set()).update(d for d in l.tage() if d < l.ende)
    return aus


def laeuft_am(laeufe: Iterable[Lauf], bereich: str, tag: date) -> Lauf | None:
    return next((l for l in laeufe if l.bereich == bereich and l.status == "laeuft" and l.von <= tag < l.bis), None)
