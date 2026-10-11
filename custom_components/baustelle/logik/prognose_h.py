"""Prognose V2: stationäre Fenster, robustes H, Tagesregression und Duty (Bauvorlage CGR-2026-10-11-hochrechnung r5 §7.1)
– ohne HA-Code. Lieferung P3 (BSM-033.08).

- **Episode** je Container: lückenlose reguläre thermo-Freigabe (R) mit gültigem Betrieb, Energie jedes Heizkörpers,
  Innen, Außen und Soll, ohne Sperre, Sonder-/Eingriff und ohne Türöffnung über `tuer_offen_max_s` am Stück. Neu beginnt
  sie bei Lücke, Wechsel von Regelungsart oder Konfiguration, Sollsprung über `start_sollsprung_k` und nach Tür, Sperre
  oder Sonderbetrieb. Ein reiner Grundwechsel zwischen regulären Gründen (Vorheizen → Arbeitszeit) unterbricht nicht –
  auch nicht als Wechselminute. Beginnt die Eingabe mitten in einer Episode, ist der Anker unbekannt: daraus entstehen
  keine Fenster (sonst lägen die Blöcke anders als bei vollständigen Daten).
- **Fenster:** Anker = Episodenbeginn; erst Vorlauf (Konvektor `konvektor_vorlauf_min`, mit Öl oder unbekanntem Typ
  `oel_vorlauf_min`), dann nicht überlappende Blöcke (`konvektor_fenster_min` bzw. `oel_fenster_min`); der Rest am Ende
  wird verworfen. Kriterien §7.1: Sollspanne, Innenspanne, OLS-Trend, Randmittel, Innen − Außen, Sollnähe, Duty
  zwischen `duty_fenster_min` und `duty_fenster_max`, je Heizkörper mindestens `zyklen_min` vollständige belegte
  Strom-ein/aus-Zyklen; Qualität des Fensters samt Vorlauf aus `prognose_merkmale.fenster_qualitaet` (direkt oder
  Ersatz). Verworfene Fenster kommen mit ihren Gründen mit (Evidenzbericht).
- **Robustes H:** H_w = E/X; je lokalem Tag (Mittelpunkt des Fensters) gewichteter Median mit Gewicht X; Container-H =
  Median der Tage; s_H = `mad_faktor`·MAD; ab `ausreisser_tage_min` Tagen einmal Ausreißer über max(3·s_H, 0,30·H)
  entfernen. Band u = max(Mindestband·H, 2·s_H), Mindestband `h_band_c_min_rel`, bei Ersatz/rekonstruiertem Kontext
  `band_min_rel` (±50 %). Stufe höchstens `stufe_hoechstens` der benutzten Fenster.
- **Direkt und Ersatz getrennt** (`schaetze_h_pfade`); `schaetze_h` nimmt den direkten Schätzer, sobald er die
  C-Evidenz hat, sonst den Ersatzschätzer mit C-Evidenz, sonst keinen (A).
- **Tagesregression** durch den Ursprung (`schaetze_h_tage`, höchstens B, Band ±`h_band_ersatz_min_rel`) und **Duty**
  im Planmodus (`schaetze_duty`, höchstens B).

Alle Schwellen stehen in `PrognoseRegeln`; `None` bleibt unbekannt.
"""

from __future__ import annotations

from bisect import bisect_left
from collections import Counter, defaultdict
from collections.abc import Iterable, Mapping, Sequence
from dataclasses import dataclass, replace
from datetime import date, datetime, timedelta
from statistics import median
from zoneinfo import ZoneInfo

from .prognose_merkmale import (
    MINUTE_S,
    TYP_KONVEKTOR,
    Bewertung,
    band_min_rel,
    bewerte_minute,
    bewerten,
    energie_ok,
    fenster_qualitaet,
    ist_gesperrt,
    nachlauf_min,
    stufe_hoechstens,
)
from .prognose_regeln import PrognoseRegeln
from .prognose_stufe import evidenz_h, stufe_min
from .prognose_typen import (
    MODELL_VERSION,
    BereichIntervall,
    DutySchaetzung,
    Fenster,
    HEvidenz,
    HSchaetzung,
    Intervall,
    Klassifikation,
    MinutenQualitaet,
    ModellKontext,
    Stufe,
    TagesMerkmale,
)

EPS = 1e-9   # Rechengenauigkeit für Grenzvergleiche (z. B. Duty 0,90 aus summierten Minuten), keine Fachschwelle

Bewertet = tuple[BereichIntervall, Klassifikation, MinutenQualitaet]

# Codes, mit denen `bewerte_fenster` ein Fenster verwirft (die übrigen Codes eines Fensters sind Hinweise)
VERWERFUNGSGRUENDE = ("soll_spanne", "soll_fehlt", "innen_spanne", "innen_trend", "randmittel", "innen_aussen_zu_klein",
                      "sollnaehe", "p_ref_fehlt", "duty_zu_klein", "duty_zu_gross", "zyklen_unbelegt", "zyklen_zu_wenig",
                      "qualitaet")


def _h(m: BereichIntervall) -> float:
    return (m.zeit.bis - m.zeit.von).total_seconds() / 3600


def fensterlaenge_min(typen: Iterable[str | None], regeln: PrognoseRegeln) -> int:
    """Blocklänge: nur Konvektoren `konvektor_fenster_min`, sonst (Öl oder unbekannter Typ) `oel_fenster_min`."""
    return regeln.konvektor_fenster_min if set(typen) == {TYP_KONVEKTOR} else regeln.oel_fenster_min


# ---------------------------------------------------------------------- Zyklen und Kriterien (auch für Plateaus)
class ZyklenZaehler:
    """Vollständige Strom-ein/aus-Zyklen eines Geräts: eine Ein-Phase (Strom > 0) mit Aus-Minute davor und danach im
    selben Fenster. Ohne gemessenen Strom (`strom_belegt`) in einer Minute ist die Zahl unbekannt (None) – ein aus dem
    Relay abgeleiteter Strom ist kein Thermostatnachweis."""

    def __init__(self) -> None:
        self.zyklen: int | None = 0
        self._aus_gesehen = False
        self._an = False
        self._an_nach_aus = False

    def weiter(self, m: BereichIntervall, gid: str) -> None:
        if self.zyklen is None:
            return
        g = next((x for x in m.geraete if x.geraet_id == gid), None)
        if g is None or not g.strom_belegt or g.sekunden_strom is None:
            self.zyklen = None
            return
        if g.sekunden_strom > 0:
            if not self._an:
                self._an, self._an_nach_aus = True, self._aus_gesehen
        else:
            if self._an and self._an_nach_aus:
                self.zyklen += 1
            self._an = False
            self._aus_gesehen = True


def zyklen(minuten: Sequence[BereichIntervall], gid: str) -> int | None:
    """Vollständige belegte Strom-ein/aus-Zyklen eines Geräts in zeitlich sortierten Minuten."""
    z = ZyklenZaehler()
    for m in minuten:
        z.weiter(m, gid)
    return z.zyklen


def _trend_k_h(ms: Sequence[BereichIntervall]) -> float:
    """OLS-Steigung Innen über die Zeit (Minutenmitten) in K/h."""
    t0 = ms[0].zeit.von
    xs = [((m.zeit.von - t0).total_seconds() + (m.zeit.bis - m.zeit.von).total_seconds() / 2) / 3600 for m in ms]
    ys = [m.innen_c for m in ms]
    mx, my = sum(xs) / len(xs), sum(ys) / len(ys)   # type: ignore[arg-type]
    sxx = sum((x - mx) ** 2 for x in xs)
    return 0.0 if sxx == 0 else sum((x - mx) * (y - my) for x, y in zip(xs, ys, strict=True)) / sxx   # type: ignore[operator]


def _mittel(ms: Sequence[BereichIntervall], wert) -> float:   # noqa: ANN001 – Zugriff auf ein Feld
    dauer = sum(_h(m) for m in ms)
    return sum(wert(m) * _h(m) for m in ms) / dauer


def bewerte_fenster(  # noqa: C901, PLR0912 – die Kriterien §7.1 der Reihe nach
    block: Sequence[Bewertet], vorlauf: Sequence[Bewertet], art: str, regeln: PrognoseRegeln, *,
    sollnaehe: bool, lauf_id: str | None = None, hinweise: Iterable[str] = (),
) -> Fenster:
    """Ein Fenster (oder Plateau) nach §7.1 prüfen; `sollnaehe` False = Baseline (ohne Komfort-Soll). Die Minuten sind
    Episodenminuten (Innen, Außen, Energie belegt)."""
    r = regeln
    ms = [m for m, _, _ in block]
    dauer_h = sum(_h(m) for m in ms)
    energie = sum(g.energie_wh for m in ms for g in m.geraete if energie_ok(g)) / 1000
    x = sum(max(0.0, m.innen_c - m.aussen_c) * _h(m) for m in ms)   # type: ignore[operator]
    innen = [m.innen_c for m in ms]
    gr: list[str] = []
    soll_mittel = None
    if all(m.soll_c is not None for m in ms):
        soll_mittel = _mittel(ms, lambda m: m.soll_c)
        sollwerte = [m.soll_c for m in ms]
        if sollnaehe and max(sollwerte) - min(sollwerte) > r.soll_spanne_max_k + EPS:   # type: ignore[type-var,operator]
            gr.append("soll_spanne")
    elif sollnaehe:
        gr.append("soll_fehlt")
    if max(innen) - min(innen) > r.innen_spanne_max_k + EPS:   # type: ignore[type-var,operator]
        gr.append("innen_spanne")
    if abs(_trend_k_h(ms)) > r.innen_trend_max_k_h + EPS:
        gr.append("innen_trend")
    rand = timedelta(minutes=r.randmittel_dauer_min)
    anfang = [m for m in ms if m.zeit.bis <= ms[0].zeit.von + rand]
    schluss = [m for m in ms if m.zeit.von >= ms[-1].zeit.bis - rand]
    if anfang and schluss and abs(_mittel(anfang, lambda m: m.innen_c) - _mittel(schluss, lambda m: m.innen_c)) \
            > r.randmittel_diff_max_k + EPS:
        gr.append("randmittel")
    if _mittel(ms, lambda m: m.innen_c - m.aussen_c) < r.innen_aussen_min_k - EPS:
        gr.append("innen_aussen_zu_klein")
    if sollnaehe and soll_mittel is not None:
        nah = sum(_h(m) for m in ms if abs(m.innen_c - m.soll_c) <= r.sollnaehe_max_k + EPS)   # type: ignore[operator]
        if nah / dauer_h < r.sollnaehe_anteil_min - EPS:
            gr.append("sollnaehe")
    ids = sorted({g.geraet_id for m in ms for g in m.geraete})
    refs = {}
    for m in ms:
        for g in m.geraete:
            refs.setdefault(g.geraet_id, g.p_ref)
    p_max = sum(p.kw for p in refs.values() if p is not None) if ids and all(
        refs.get(i) is not None and refs[i].kw > 0 for i in ids) else None   # type: ignore[union-attr]
    if p_max is None:
        gr.append("p_ref_fehlt")
    else:
        duty = energie / (p_max * dauer_h)
        if duty < r.duty_fenster_min - EPS:
            gr.append("duty_zu_klein")
        elif duty > r.duty_fenster_max + EPS:
            gr.append("duty_zu_gross")   # Sättigung/Volllast: kein H aus scheinbarem Plateau
    z = tuple((i, zyklen(ms, i)) for i in ids)
    if any(n is None for _, n in z):
        gr.append("zyklen_unbelegt")
    elif any(n < r.zyklen_min for _, n in z):   # type: ignore[operator]
        gr.append("zyklen_zu_wenig")
    alle = [*vorlauf, *block]
    q = fenster_qualitaet([m for m, _, _ in alle], [(k, q) for _, k, q in alle], r)
    if not q.trainingsfaehig:
        gr.append("qualitaet")
    blockierend = list(gr)
    if not all(m.kontext.tuer_beobachtet for m in ms):
        gr.append("tuer_unbekannt")   # Unsicherheit, kein Ausschluss
    return Fenster(
        zeit=Intervall(ms[0].zeit.von, ms[-1].zeit.bis), bereich_id=ms[0].bereich_id,
        konfiguration_id=ms[0].kontext.konfiguration_id, art=art,   # type: ignore[arg-type]
        energie_kwh=energie, x_innen_kh=x, innen_mittel_c=_mittel(ms, lambda m: m.innen_c),
        aussen_mittel_c=_mittel(ms, lambda m: m.aussen_c), p_max_kw=p_max,
        zyklen_je_geraet=tuple((i, n if n is not None else 0) for i, n in z), frische=q.frische, staffel=q.staffel,
        gueltig=not blockierend, gruende=tuple(dict.fromkeys([*gr, *q.gruende, *hinweise])), soll_mittel_c=soll_mittel,
        qualitaet=q, lauf_id=lauf_id)


# ---------------------------------------------------------------------- Episoden und reguläre Fenster
def _r_minute(m: BereichIntervall, k: Klassifikation, q: MinutenQualitaet) -> bool:
    """Episodenminute: reguläre thermo-Freigabe mit gültigem Betrieb und allen Werten, ohne Sperre/Eingriff/Wechsel."""
    return (k.art == "REGULAER" and m.kontext.regulaer_freigegeben is True and m.kontext.regelungsart == "thermo"
            and q.betrieb_gueltig and bool(m.geraete) and all(energie_ok(g) for g in m.geraete)
            and all(g.erreichbar is not False for g in m.geraete)
            and m.innen_c is not None and m.innen_gueltig and m.aussen_c is not None and m.aussen_gueltig
            and m.soll_c is not None and _h(m) * 3600 <= MINUTE_S and not ist_gesperrt(m)
            and not m.kontext.wechsel_im_intervall and not m.kontext.sonstige_eingriffe)


def _grundwechsel_dulden(liste: list[Bewertet], regeln: PrognoseRegeln) -> set[int]:
    """Wechselminuten, in denen sich nur der Grund zwischen regulären Freigaben ändert (Vorheizen → Arbeitszeit):
    Nachbarminuten lückenlos, gleiche Regelungsart und Konfiguration, alle drei R. Die Minute zählt dann normal mit
    (Energie gehört ganz zur selben Konfiguration) und trägt den Hinweis `grundwechsel`."""
    geduldet: set[int] = set()
    for i in range(1, len(liste) - 1):
        m = liste[i][0]
        if not m.kontext.wechsel_im_intervall:
            continue
        a, b = liste[i - 1][0], liste[i + 1][0]
        if a.zeit.bis != m.zeit.von or m.zeit.bis != b.zeit.von:
            continue
        if any((x.kontext.regelungsart, x.kontext.konfiguration_id) != (m.kontext.regelungsart, m.kontext.konfiguration_id)
               for x in (a, b)):
            continue
        ohne = replace(m, kontext=replace(m.kontext, wechsel_im_intervall=False))
        kandidat = (ohne, *bewerte_minute(ohne, regeln))
        if all(_r_minute(*x) for x in (liste[i - 1], kandidat, liste[i + 1])):
            liste[i] = kandidat
            geduldet.add(i)
    return geduldet


def episoden(
    liste: list[Bewertet], regeln: PrognoseRegeln, ok, neu,   # noqa: ANN001 – Prädikate je Minute
    beobachtet_ab: datetime | None = None,
) -> list[tuple[int, int, bool]]:
    """Episoden (Anfang, Ende exklusiv, Anker bekannt) aus Minuten, die `ok(i)` erfüllen; `neu(i)` erzwingt einen
    Neubeginn. Türöffnungen über `tuer_offen_max_s` am Stück beenden die Episode. Anker unbekannt, wenn die Episode
    nicht nach `beobachtet_ab` beginnt (Vorgabe: erste Minute der Eingabe) – davor kann sie schon gelaufen sein."""
    if not liste:
        return []
    ab = beobachtet_ab if beobachtet_ab is not None else liste[0][0].zeit.von
    aus: list[tuple[int, int, bool]] = []
    start: int | None = None
    tuer = 0.0
    for i, (m, _, _) in enumerate(liste):
        offen = m.tuer_offen_s or 0.0
        tuer = tuer + offen if offen > 0 else 0.0   # Türöffnung am Stück, über Minutengrenzen
        geeignet = ok(i) and tuer <= regeln.tuer_offen_max_s
        if start is not None and (not geeignet or neu(i)):
            aus.append((start, i, liste[start][0].zeit.von > ab))
            start = None
        if geeignet and start is None:
            start = i
    if start is not None:
        aus.append((start, len(liste), liste[start][0].zeit.von > ab))
    return aus


def _bloecke(liste: Sequence[Bewertet], beginne: Sequence[datetime], s: int, e: int, t0: datetime,   # noqa: ANN202
             vorlauf: timedelta, laenge: timedelta):
    """Nicht überlappende Blöcke [a, b) nach dem Vorlauf ab dem Anker `t0`; Restblock verworfen. Blöcke, deren Vorlauf
    vor dem ersten Minutenbeginn der Episode in der Eingabe liegt (Anker aus einem früheren Abschnitt), entfallen.
    `beginne`: Minutenbeginne des Containers (einmal je Container gebaut)."""
    erste, te = liste[s][0].zeit.von, liste[e - 1][0].zeit.bis
    a = t0 + vorlauf
    if a < erste + vorlauf:   # Anker aus einem früheren Abschnitt: auf den ersten vollständigen Block vorrücken
        a += ((erste + vorlauf - a) // laenge) * laenge
        while a - vorlauf < erste:
            a += laenge
    while a + laenge <= te:
        i, j = bisect_left(beginne, a, s, e), bisect_left(beginne, a + laenge, s, e)
        k = bisect_left(beginne, a - vorlauf, s, e)
        yield liste[k:i], liste[i:j]
        a += laenge


def _r_episoden(liste: list[Bewertet], regeln: PrognoseRegeln,
                beobachtet_ab: datetime | None) -> tuple[set[datetime], list[tuple[int, int, bool]]]:
    """Geduldete Grundwechsel (Zeiten) und reguläre Episoden eines Containers; `liste` ist eine eigene Kopie (geduldete
    Wechselminuten werden darin ersetzt)."""
    geduldet = {liste[i][0].zeit.von for i in _grundwechsel_dulden(liste, regeln)}

    def neu(i: int) -> bool:
        a, b = liste[i - 1][0], liste[i][0]
        return (a.zeit.bis != b.zeit.von or a.kontext.konfiguration_id != b.kontext.konfiguration_id
                or a.kontext.regelungsart != b.kontext.regelungsart
                or abs(b.soll_c - a.soll_c) > regeln.start_sollsprung_k)   # type: ignore[operator]

    return geduldet, episoden(liste, regeln, lambda i: _r_minute(*liste[i]), neu, beobachtet_ab)


def _anker(liste: Sequence[Bewertet], s: int, bekannt: bool, vorher: datetime | None) -> datetime | None:
    """Anker einer Episode: ihr Beginn, wenn er beobachtet ist, sonst der übergebene Beginn aus einem früheren
    Abschnitt (muss davor liegen), sonst unbekannt."""
    if bekannt:
        return liste[s][0].zeit.von
    return vorher if vorher is not None and vorher <= liste[s][0].zeit.von else None


def fenster_und_offene(
    minuten: Sequence[BereichIntervall], regeln: PrognoseRegeln, *, beobachtet_ab: datetime | None = None,
    anker: Mapping[str, datetime] | None = None, bewertet: Bewertung | None = None,
) -> tuple[tuple[Fenster, ...], dict[str, datetime]]:
    """`stationaere_fenster` und `offene_episoden` in einem Durchgang (Episoden nur einmal gebildet)."""
    aus: list[Fenster] = []
    offen: dict[str, datetime] = {}
    je = bewertet if bewertet is not None else bewerten(minuten, regeln)
    for b, original in je.items():
        liste = list(original)
        beginne = [m.zeit.von for m, _, _ in liste]
        geduldet, eps = _r_episoden(liste, regeln, beobachtet_ab)
        for s, e, bekannt in eps:
            t0 = _anker(liste, s, bekannt, (anker or {}).get(b))
            if t0 is None:
                continue
            if e == len(liste):
                offen[b] = t0
            typen = {g.typ for g in liste[s][0].geraete}
            v = timedelta(minutes=nachlauf_min(typen, regeln))
            w = timedelta(minutes=fensterlaenge_min(typen, regeln))
            for vor, block in _bloecke(liste, beginne, s, e, t0, v, w):
                hinweise = ["grundwechsel"] if geduldet and any(m.zeit.von in geduldet for m, _, _ in [*vor, *block]) else []
                aus.append(bewerte_fenster(block, vor, "regulaer", regeln, sollnaehe=True, hinweise=hinweise))
    return tuple(aus), offen


def stationaere_fenster(
    minuten: Sequence[BereichIntervall], regeln: PrognoseRegeln, *, beobachtet_ab: datetime | None = None,
    anker: Mapping[str, datetime] | None = None, bewertet: Bewertung | None = None,
) -> tuple[Fenster, ...]:
    """Alle vollständigen Blöcke regulärer Episoden je Container – gültig oder verworfen (Gründe).

    `beobachtet_ab`: bis wann eine beginnende Episode schon vorher gelaufen sein kann (Vorgabe erste Minute);
    `anker`: je Container der Beginn einer Episode, die am Ende eines früheren Abschnitts noch lief
    (`offene_episoden`) – damit liegen die Blöcke wie bei einem Durchgang über den ganzen Zeitraum; `bewertet`: schon
    gerechnete Bewertung derselben Minuten (`prognose_merkmale.bewerten`)."""
    return fenster_und_offene(minuten, regeln, beobachtet_ab=beobachtet_ab, anker=anker, bewertet=bewertet)[0]


def offene_episoden(
    minuten: Sequence[BereichIntervall], regeln: PrognoseRegeln, *, beobachtet_ab: datetime | None = None,
    anker: Mapping[str, datetime] | None = None, bewertet: Bewertung | None = None,
) -> dict[str, datetime]:
    """Je Container der Anker einer regulären Episode, die bis zur letzten Minute der Eingabe läuft (für den nächsten
    Abschnitt); fehlt, wenn keine läuft oder ihr Anker unbekannt ist."""
    return fenster_und_offene(minuten, regeln, beobachtet_ab=beobachtet_ab, anker=anker, bewertet=bewertet)[1]


def ist_direkt(f: Fenster) -> bool:
    """Gültiges Fenster, das Stufe D tragen darf (direkter Pfad); sonst Ersatzpfad (höchstens C)."""
    return f.gueltig and _hoechstens(f) == "D"


@dataclass(frozen=True)
class FensterZaehlung:
    """Gültige Fenster direkt/Ersatz und verworfene mit ihren Gründen (Qualitätsgründe als `qualitaet:<code>`)."""

    direkt: int
    ersatz: int
    verworfen: int
    stunden: float
    gruende: tuple[tuple[str, int], ...]


def zaehle_fenster(fenster: Sequence[Fenster]) -> FensterZaehlung:
    """Evidenzbericht: Fenster bzw. Plateaus zählen; Gründe nach Häufigkeit."""
    gueltig = [f for f in fenster if f.gueltig]
    gruende: Counter[str] = Counter()
    for f in fenster:
        if f.gueltig:
            continue
        gruende.update(c for c in f.gruende if c in VERWERFUNGSGRUENDE)
        if "qualitaet" in f.gruende and f.qualitaet is not None:
            gruende.update(f"qualitaet:{c}" for c in f.qualitaet.gruende)
    direkt = sum(1 for f in gueltig if ist_direkt(f))
    return FensterZaehlung(direkt, len(gueltig) - direkt, len(fenster) - len(gueltig),
                           sum((f.zeit.bis - f.zeit.von).total_seconds() / 3600 for f in gueltig),
                           tuple(gruende.most_common()))


def modell_konfigurationen(fenster: Sequence[Fenster], tage: Sequence[TagesMerkmale], aktuell: str | None) -> list[str]:
    """Konfigurationen, für die ein Container Modelle bekommt: aus gültigen Fenstern/Plateaus und Lerntagen, dazu die
    aktuelle (zuerst) – Modelle verschiedener Konfigurationen werden nie gemischt."""
    kids = {f.konfiguration_id for f in fenster if f.gueltig}
    kids |= {t.konfiguration_id for t in tage if t.training_thermo or t.training_plan}
    if aktuell:
        kids.add(aktuell)
    kids.discard("")
    return sorted(kids, key=lambda k: (k != aktuell, k))


# ---------------------------------------------------------------------- robustes H
@dataclass(frozen=True)
class RobustesH:
    """Ergebnis der robusten Schätzung aus Fenstern (für H regulär und H_ohne aus Plateaus)."""

    h: float
    unten: float
    oben: float
    mad: float
    s_h: float
    streuung_rel: float | None
    tage: tuple[tuple[date, float], ...]
    benutzt: tuple[Fenster, ...]
    entfernt: int
    hoechstens: Stufe


def gewichteter_median(werte: Sequence[tuple[float, float]]) -> float:
    """Gewichteter Median von (Wert, Gewicht > 0); liegt die halbe Summe genau auf einer Grenze, die Mitte der beiden."""
    paare = sorted(werte)
    halb = sum(w for _, w in paare) / 2
    summe = 0.0
    for i, (x, w) in enumerate(paare):
        summe += w
        if abs(summe - halb) <= EPS * max(1.0, halb) and i + 1 < len(paare):
            return (x + paare[i + 1][0]) / 2
        if summe > halb:
            return x
    return paare[-1][0]


def _hoechstens(f: Fenster) -> Stufe:
    return stufe_hoechstens(f.qualitaet) if f.qualitaet is not None else "C"


def robustes_h(fenster: Sequence[Fenster], zeitzone: str, regeln: PrognoseRegeln, *,
               verschiebung: timedelta = timedelta(0)) -> RobustesH | None:
    """H aus Fenstern (§7.1): Tages-H = gewichteter Median (Gewicht X) je lokalem Datum des Mittelpunkts, H = Median der
    Tage, MAD-Streuung, einmal Ausreißer ab `ausreisser_tage_min` Tagen, Band. None ohne Fenster mit X > 0."""
    zone = ZoneInfo(zeitzone)
    je: dict[date, list[Fenster]] = defaultdict(list)
    for f in fenster:
        if f.x_innen_kh > 0:
            je[(f.zeit.von + (f.zeit.bis - f.zeit.von) / 2 - verschiebung).astimezone(zone).date()].append(f)
    if not je:
        return None
    tage = {d: gewichteter_median([(f.energie_kwh / f.x_innen_kh, f.x_innen_kh) for f in fs]) for d, fs in je.items()}

    def kennzahlen(ts: dict[date, float]) -> tuple[float, float, float]:
        h = median(ts.values())
        mad = median(abs(x - h) for x in ts.values())
        return h, mad, regeln.mad_faktor * mad

    h, mad, s = kennzahlen(tage)
    entfernt = 0
    if len(tage) >= regeln.ausreisser_tage_min:
        grenze = max(regeln.ausreisser_mad_faktor * s, regeln.ausreisser_rel_min * h)
        behalten = {d: x for d, x in tage.items() if abs(x - h) <= grenze + EPS}
        if len(behalten) < len(tage):
            entfernt = sum(len(je[d]) for d in tage if d not in behalten)
            tage = behalten
            h, mad, s = kennzahlen(tage)   # genau einmal neu rechnen
    benutzt = tuple(f for d in sorted(tage) for f in je[d])
    hoechstens = stufe_min(*(_hoechstens(f) for f in benutzt))
    rel = max((band_min_rel(f.qualitaet, regeln) or regeln.h_band_c_min_rel) if f.qualitaet is not None
              else regeln.h_band_ersatz_min_rel for f in benutzt)
    u = max(rel * h, regeln.h_band_streuung_faktor * s)
    return RobustesH(h=h, unten=max(0.0, h - u), oben=h + u, mad=mad, s_h=s, streuung_rel=s / h if h > 0 else None,
                     tage=tuple(sorted(tage.items())), benutzt=benutzt, entfernt=entfernt, hoechstens=hoechstens)


def _leer(kontext: ModellKontext, gruende: tuple[str, ...], verworfen: int = 0) -> HSchaetzung:
    ev = HEvidenz(0, 0, 0.0, None, None, None, None, None, None, None, None, 0, verworfen, gruende)
    return HSchaetzung(kontext.bereich_id, kontext.konfiguration_id, MODELL_VERSION, kontext.training_bis, "keine",
                       None, None, None, ev)


def _min_max(werte: Sequence[float]) -> tuple[float | None, float | None]:
    return (min(werte), max(werte)) if werte else (None, None)


def schaetzung_aus_fenstern(
    kontext: ModellKontext, fenster: Sequence[Fenster], verworfen: int, zeitzone: str, regeln: PrognoseRegeln, *,
    verschiebung: timedelta = timedelta(0),
) -> HSchaetzung:
    """Stationäre H-Schätzung aus gültigen Fenstern eines Pfads (direkt oder Ersatz) bzw. aus Plateaus."""
    if not fenster:
        return _leer(kontext, ("keine_fenster",), verworfen)
    r = robustes_h(fenster, zeitzone, regeln, verschiebung=verschiebung)
    if r is None:
        return _leer(kontext, ("keine_fenster",), verworfen + len(fenster))
    b = r.benutzt
    dt = _min_max([f.innen_mittel_c - f.aussen_mittel_c for f in b])
    au = _min_max([f.aussen_mittel_c for f in b])
    so = _min_max([f.soll_mittel_c for f in b if f.soll_mittel_c is not None])
    gruende = ("ausreisser_entfernt",) if r.entfernt else ()
    ev = HEvidenz(fenster=len(b), tage=len(r.tage), stunden=sum((f.zeit.bis - f.zeit.von).total_seconds() / 3600 for f in b),
                  mad_kw_k=r.mad, streuung_rel=r.streuung_rel, delta_t_min_k=dt[0], delta_t_max_k=dt[1],
                  aussen_min_c=au[0], aussen_max_c=au[1], soll_min_c=so[0], soll_max_c=so[1],
                  ersatzfenster=sum(1 for f in b if _hoechstens(f) != "D"), verworfen=verworfen + r.entfernt,
                  gruende=gruende, stufe_hoechstens=r.hoechstens)
    if r.h <= 0:   # null/negativ ist kein identifiziertes Wärmeverlustmodell
        return HSchaetzung(kontext.bereich_id, kontext.konfiguration_id, MODELL_VERSION, kontext.training_bis, "keine",
                           None, None, None, replace(ev, gruende=(*gruende, "h_nicht_positiv")), r.tage)
    return HSchaetzung(kontext.bereich_id, kontext.konfiguration_id, MODELL_VERSION, kontext.training_bis, "stationaer",
                       r.h, r.unten, r.oben, ev, r.tage)


def _passend(kontext: ModellKontext, fenster: Sequence[Fenster], art: str) -> list[Fenster]:
    return [f for f in fenster if f.bereich_id == kontext.bereich_id and f.konfiguration_id == kontext.konfiguration_id
            and f.art == art and f.zeit.bis <= kontext.training_bis]


def schaetze_h_pfade(
    kontext: ModellKontext, fenster: Sequence[Fenster], regeln: PrognoseRegeln, *, zeitzone: str,
) -> tuple[HSchaetzung, HSchaetzung]:
    """Direkter und Ersatzschätzer getrennt (§6.3): direkt = Fenster, die Stufe D tragen dürfen; Ersatz = Fenster mit
    Ersatznachweis oder rekonstruiertem Kontext (`stufe_hoechstens` C). Verworfene Fenster zählen bei beiden."""
    alle = _passend(kontext, fenster, "regulaer")
    gueltig = [f for f in alle if f.gueltig]
    verworfen = len(alle) - len(gueltig)
    direkt = [f for f in gueltig if ist_direkt(f)]
    ersatz = [f for f in gueltig if not ist_direkt(f)]
    return (schaetzung_aus_fenstern(kontext, direkt, verworfen, zeitzone, regeln),
            schaetzung_aus_fenstern(kontext, ersatz, verworfen, zeitzone, regeln))


def schaetze_h(kontext: ModellKontext, fenster: Sequence[Fenster], regeln: PrognoseRegeln, *, zeitzone: str) -> HSchaetzung:
    """Container-H: direkter Schätzer mit C-Evidenz hat Vorrang, sonst der Ersatzschätzer mit C-Evidenz (höchstens C,
    Band ≥ ±50 %), sonst keine Identifikation (A, H None) mit der Evidenz des größeren Pfads."""
    return waehle_h(*schaetze_h_pfade(kontext, fenster, regeln, zeitzone=zeitzone), regeln)


def waehle_h(direkt: HSchaetzung, ersatz: HSchaetzung, regeln: PrognoseRegeln) -> HSchaetzung:
    """Wahl zwischen den getrennten Schätzern (`schaetze_h_pfade`), Regel wie `schaetze_h`."""
    for pfad, code in ((direkt, "direkt"), (ersatz, "ersatzpfad")):
        if evidenz_h(pfad, None, regeln) in ("C", "D"):
            return replace(pfad, evidenz=replace(pfad.evidenz, gruende=(*pfad.evidenz.gruende, code)))
    groesser = direkt if direkt.evidenz.fenster >= ersatz.evidenz.fenster else ersatz
    return replace(groesser, methode="keine", h_kw_k=None, h_unten_kw_k=None, h_oben_kw_k=None,
                   evidenz=replace(groesser.evidenz, gruende=(*groesser.evidenz.gruende, "evidenz_zu_gering")))


# ---------------------------------------------------------------------- Tagesregression und Duty
def schaetze_h_tage(kontext: ModellKontext, tage: Sequence[TagesMerkmale], regeln: PrognoseRegeln) -> HSchaetzung:
    """Tagesrückfall (§7.1): mindestens `tagesfit_tage_min` geeignete thermo-Tage, H = max(0, ΣGDH·E / ΣGDH²) durch den
    Ursprung (kein Grundlastfit), Band ±`h_band_ersatz_min_rel` (B-Band). Nur Nullenergie ist kein Lernbeweis."""
    ts = [t for t in tage if t.bereich_id == kontext.bereich_id and t.konfiguration_id == kontext.konfiguration_id
          and t.training_thermo]
    if len(ts) < regeln.tagesfit_tage_min:
        return replace(_leer(kontext, ("zu_wenige_tage",)), evidenz=replace(_leer(kontext, ()).evidenz, tage=len(ts),
                                                                             gruende=("zu_wenige_tage",)))
    sgg = sum(t.gdh_aktiv_kh ** 2 for t in ts)
    sge = sum(t.gdh_aktiv_kh * t.regulaer_joint_kwh for t in ts)
    se = sum(t.regulaer_joint_kwh for t in ts)
    dt = _min_max([t.gdh_aktiv_kh / t.aktiv_h for t in ts if t.aktiv_h > 0])
    au = _min_max([t.aussen_mittel_c for t in ts if t.aussen_mittel_c is not None])
    hinweise = ("kontext_rekonstruiert",) if any("kontext_rekonstruiert" in t.gruende for t in ts) else ()
    ev = HEvidenz(0, len(ts), sum(t.aktiv_h for t in ts), None, None, dt[0], dt[1], au[0], au[1], None, None, 0, 0, hinweise)
    tage_h = tuple((t.datum, t.regulaer_joint_kwh / t.gdh_aktiv_kh) for t in ts if t.gdh_aktiv_kh > 0)
    code = "nur_nullenergie" if se <= 0 else "gdh_null" if sgg <= 0 else None
    h = 0.0 if code else max(0.0, sge / sgg)
    if code or h <= 0:
        return HSchaetzung(kontext.bereich_id, kontext.konfiguration_id, MODELL_VERSION, kontext.training_bis, "keine",
                           None, None, None, replace(ev, gruende=(*hinweise, code or "h_nicht_positiv")), tage_h)
    b = regeln.h_band_ersatz_min_rel
    return HSchaetzung(kontext.bereich_id, kontext.konfiguration_id, MODELL_VERSION, kontext.training_bis,
                       "tagesregression", h, h * (1 - b), h * (1 + b), ev, tage_h)


def schaetze_duty(kontext: ModellKontext, tage: Sequence[TagesMerkmale], regeln: PrognoseRegeln) -> DutySchaetzung:
    """Planmodus (§7.1): mindestens `tagesfit_tage_min` saubere Plan-Tage, d = ΣE_R / ΣKapazität_R; Nenner 0 → None.
    Höchstens B, Witterungseinfluss nicht modelliert."""
    ts = [t for t in tage if t.bereich_id == kontext.bereich_id and t.konfiguration_id == kontext.konfiguration_id
          and t.training_plan and t.kapazitaet_regulaer_kwh is not None]
    kap = sum(t.kapazitaet_regulaer_kwh for t in ts)   # type: ignore[misc]
    e = sum(t.regulaer_joint_kwh for t in ts)
    if len(ts) < regeln.tagesfit_tage_min:
        return DutySchaetzung(kontext.bereich_id, kontext.konfiguration_id, None, len(ts), kap, e, ("zu_wenige_tage",))
    if kap <= 0:
        return DutySchaetzung(kontext.bereich_id, kontext.konfiguration_id, None, len(ts), kap, e, ("kapazitaet_null",))
    return DutySchaetzung(kontext.bereich_id, kontext.konfiguration_id, e / kap, len(ts), kap, e, ("witterung_unmodelliert",))
