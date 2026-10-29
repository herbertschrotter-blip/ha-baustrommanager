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
    kwh: float | None = None          # gemessen (Tage des Laufs), mit `kosten_eur` nachgetragen (J4b)
    angekuendigt: datetime | None = None   # Zeitpunkt der Nachricht am Vortag (J4b)
    abbruch_um: datetime | None = None     # Zeitpunkt von Abbruch bzw. Absage (J4b)

    def tage(self) -> list[date]:
        return [self.von + timedelta(days=i) for i in range((self.bis - self.von).days)]

    def als_dict(self) -> dict[str, object]:
        return {"id": self.id, "bereich": self.bereich, "von": self.von.isoformat(), "bis": self.bis.isoformat(),
                "status": self.status, "schaetzung_eur": round(self.schaetzung_eur, 2), "kosten_eur": self.kosten_eur,
                "grund": self.grund, "ende": self.ende.isoformat() if self.ende else None,
                "thermostat_unveraendert": self.thermostat_unveraendert, "thermostatstellung": self.thermostatstellung,
                "annahme_am": self.annahme_am.isoformat() if self.annahme_am else None,
                "konfiguration_id": self.konfiguration_id, "p_ref_belege": list(self.p_ref_belege),
                "kwh": self.kwh, "angekuendigt": self.angekuendigt.isoformat() if self.angekuendigt else None,
                "abbruch_um": self.abbruch_um.isoformat() if self.abbruch_um else None}

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
                    tuple(str(b) for b in belege) if isinstance(belege, (list, tuple)) else (),
                    None if d.get("kwh") is None else float(d["kwh"]),   # type: ignore[arg-type]
                    datetime.fromisoformat(str(d["angekuendigt"])) if d.get("angekuendigt") else None,
                    datetime.fromisoformat(str(d["abbruch_um"])) if d.get("abbruch_um") else None)


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


def abbrechen(l: Lauf, heute: date, grund: str, um: datetime | None = None) -> Lauf:
    """Abbruch: Tage ab heute zählen nicht mehr; vor dem Start heißt es „abgesagt“. `um` = Uhrzeit für die Anzeige."""
    if l.status == "geplant":
        return replace(l, status="abgesagt", grund=grund, abbruch_um=um)
    return replace(l, status="abgebrochen", grund=grund, ende=heute, abbruch_um=um)


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


# ------------------------------------------------------------------ Anzeige (J4b, Mockup baseline.html Variante B)

TAGE_KURZ = ("Mo", "Di", "Mi", "Do", "Fr", "Sa", "So")
HINWEIS = "Prognose ohne Automatik: Schätzung 24/7 – wird durch Baseline-Läufe ersetzt."
PLAN_UHR = 12               # Planen und Ankündigen am Vortag ab 12:00


def tag_t(d: date) -> str:
    """„Sa 31.10.“"""
    return f"{TAGE_KURZ[d.weekday()]} {d:%d.%m.}"


def zeit_t(z: datetime) -> str:
    """„Fr 30.10. 12:00“ (in der Zone, in der `z` steht)."""
    return f"{tag_t(z.date())} {z:%H:%M}"


def letzter_tag(l: Lauf) -> date:
    return l.bis - timedelta(days=1)


def kein_lauf(*, typ: str, auto: bool, bedarf: bool, modus: str) -> str | None:
    """Warum ein Container keinen Lauf bekommt (None = er kann einen bekommen)."""
    if not typ:
        return "ohne Heizkörper"
    if modus == "aus":
        return "Modus aus"
    if not auto:
        return "ohne Automatik"
    if bedarf or modus == "bedarf":
        return "bei Bedarf"
    return None


def rahmen(laeufe: Iterable[Lauf], heute: date, budget: float) -> dict[str, object]:
    """Kostenrahmen des laufenden Monats: gemessen (Kosten beendeter Läufe), geplant (Schätzung geplanter und laufender
    Läufe), Rest wie `monat_rest` (abgesagte zählen nicht; gezählt im Monat des ersten Tags)."""
    im_monat = [l for l in laeufe if l.status != "abgesagt" and (l.von.year, l.von.month) == (heute.year, heute.month)]
    # beendet, aber noch ohne gemessene Kosten (bis zur nächsten Hochrechnung): mit der Schätzung unter „gemessen“
    gemessen = sum((l.kosten_eur if l.kosten_eur is not None else l.schaetzung_eur for l in im_monat if l.status not in OFFEN), 0.0)
    geplant = sum((l.schaetzung_eur for l in im_monat if l.status in OFFEN), 0.0)
    return {"monat": f"{heute:%Y-%m}", "budget_eur": round(budget, 2), "gemessen_eur": round(gemessen, 2),
            "geplant_eur": round(geplant, 2), "rest_eur": round(monat_rest(im_monat, heute.year, heute.month, budget), 2)}


def bis_t(l: Lauf) -> str:
    """Ende eines Laufs als Text: „So 24:00“ (Ende des letzten Tags)."""
    return f"{TAGE_KURZ[letzter_tag(l).weekday()]} 24:00"


def _bisher(l: Lauf, bisher: tuple[float, float] | None) -> tuple[float | None, float | None]:
    if l.status != "laeuft" or bisher is None:
        return None, None
    return round(bisher[0], 2), round(bisher[1], 2)


def kopf_anzeige(l: Lauf, bisher: tuple[float, float] | None, bis: str) -> dict[str, object]:
    """Laufender Lauf für den Kopf des Containers (`bis` = Ende als ISO-Zeitpunkt in der Zone der Baustelle)."""
    kwh, eur = _bisher(l, bisher)
    return {"lauf_id": l.id, "von": l.von.isoformat(), "letzter": letzter_tag(l).isoformat(), "von_t": tag_t(l.von),
            "letzter_t": tag_t(letzter_tag(l)), "bis": bis, "bis_t": bis_t(l), "bisher_kwh": kwh, "bisher_eur": eur}


def lauf_anzeige(l: Lauf, name: str, typ: str, bisher: tuple[float, float] | None = None) -> dict[str, object]:
    """Ein Lauf für die Seite: dazu letzter Tag (inklusive), Anzahl Tage, zählende Tage, Texte für Uhrzeiten und – solange
    er läuft – `bisher` (kWh, €) seit dem Start."""
    zaehlt = len(zaehlende_tage([l]).get(l.bereich, ()))
    kwh, eur = _bisher(l, bisher)
    return {**l.als_dict(), "name": name, "typ": typ, "letzter": letzter_tag(l).isoformat(), "tage": len(l.tage()), "zaehlt": zaehlt,
            "von_t": tag_t(l.von), "letzter_t": tag_t(letzter_tag(l)),
            "kwh": None if l.kwh is None else round(l.kwh, 2),
            "angekuendigt_t": zeit_t(l.angekuendigt) if l.angekuendigt else None,
            "abbruch_t": zeit_t(l.abbruch_um) if l.abbruch_um else None,
            "bis_t": bis_t(l), "bisher_kwh": kwh, "bisher_eur": eur}


def plant_am(von: date, jetzt: datetime) -> datetime:
    """Wann ein Lauf, der am Tag `von` beginnt, geplant und angekündigt wird: am Vortag um 12:00 (frühestens jetzt)."""
    vortag = von - timedelta(days=1)
    return max(jetzt, jetzt.replace(year=vortag.year, month=vortag.month, day=vortag.day, hour=PLAN_UHR, minute=0, second=0, microsecond=0))


def vorschau(l: Lauf | None, name: str, jetzt: datetime) -> dict[str, object] | None:
    """Nächster Lauf nach `planen`, solange noch keiner geplant ist (Seite: „voraussichtlich …“)."""
    if l is None:
        return None
    am = plant_am(l.von, jetzt)
    return {"von": l.von.isoformat(), "letzter": letzter_tag(l).isoformat(), "von_t": tag_t(l.von), "letzter_t": tag_t(letzter_tag(l)),
            "bereich": l.bereich, "name": name,
            "schaetzung_eur": round(l.schaetzung_eur, 2), "plant_am": am.isoformat(), "plant_am_t": zeit_t(am)}


@dataclass(frozen=True)
class Stand:
    """Stand eines Containers für die Anzeige (Signatur „ohne“ aus der Hochrechnung)."""
    bereich: str
    name: str
    typ: str
    tage: int                       # zählende Baseline-Tage
    stand: str | None               # Stand der Signatur „ohne“ (lernt|gut|brauchbar|unsicher)
    kein_lauf: str | None = None
    uebernimmt: tuple[str, ...] = ()   # gemessene Container, deren Verhältnis gilt (ohne eigene Messung)


def stand_anzeige(c: Stand, noetig: int) -> dict[str, object]:
    """Stand je Container: Tage/nötig, Signatur „ohne“ (ohne Tage kein Stand), fertig = gut (dann kein Lauf mehr)."""
    stand = c.stand if c.tage else None
    return {"bereich": c.bereich, "name": c.name, "typ": c.typ, "tage": c.tage, "noetig": noetig, "stand": stand,
            "fertig": stand == "gut", "kein_lauf": c.kein_lauf, "uebernimmt": list(c.uebernimmt)}


def offener(laeufe: Iterable[Lauf]) -> Lauf | None:
    """Der geplante bzw. laufende Lauf (es gibt höchstens einen)."""
    return next((l for l in laeufe if l.status in OFFEN), None)


def stand_text(*, an: bool, automatik: bool, container: Sequence[dict[str, object]], offen: Lauf | None,
               vor: dict[str, object] | None, namen: dict[str, str]) -> str:
    """Stand unter dem Hinweis der Hochrechnung: „1 von 4 Containern gemessen · nächster Lauf Sa 31.10. (003_C_MAN).“"""
    if not an:
        return "Baseline messen ist aus."
    mit = [c for c in container if not c["kein_lauf"]]
    text = f"{sum(1 for c in mit if c['fertig'])} von {len(mit)} {'Container' if len(mit) == 1 else 'Containern'} gemessen"
    if offen is not None:
        art = "Lauf läuft" if offen.status == "laeuft" else "nächster Lauf"
        text += f" · {art} {tag_t(offen.von)} ({namen.get(offen.bereich, offen.bereich)})"
    elif not automatik:
        text += " · Läufe nur mit eingeschalteter Automatik"
    elif vor is not None:
        text += f" · nächster Lauf voraussichtlich {tag_t(date.fromisoformat(str(vor['von'])))}"
    return text if text.endswith(".") else text + "."
