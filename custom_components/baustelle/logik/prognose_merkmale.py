"""Prognose V2: Klassifikation und Merkmale je Minute (Bauvorlage CGR-2026-10-11-hochrechnung r5 §6) – ohne HA-Code.

Lieferung P1 (BSM-033.06):

- **Klassifikation** (`klassifiziere_minute`, §6.1): Betriebsart einer gespeicherten Minute aus `grund`; `zustand` und
  `quelle` machen sie nur ungültig, ändern die Art eines gültigen Grunds aber nicht (`aus`/`heizt`/`bereit` im
  Zustand überschreiben ihn nicht, `arbeitszeit` + `aus` = TPI-aus bleibt REGULAER). Reihenfolge: fehlende Zeile oder
  fehlender/unbekannter Grund → notprogramm → offline → `pause` ohne `tuer_offen` → Quelle.
- **Regelungsart** (`regelungsart`): thermo nur mit Fühler; Zeitplan (und thermo/bedarf ohne Fühler) = plan.
- **Konfigurations-ID** (`konfiguration_id`): Regelungsart und Heizkörper (ID, Typ) – ändert sich eines davon, beginnt
  eine neue Konfiguration, und Training wird nicht vermischt.
- **Nachweiszeiten** (`nachweis_s`): negative oder überlange Sekunden aus der Datenbank werden zurückgewiesen (None).

Lieferung P2 (BSM-033.07, §6.2–§6.4, §8.3 Abkühlen):

- **Betriebskontext** (`betriebskontext`): aus dem Ereignis `prognose_kontext` (Regelungsart, Konfiguration) und der zum
  Zeitpunkt gültigen Einstellung `heizung` (Frostpolitik). Ohne Ereignis oder ohne belegte Einstellung bleibt der
  Kontext unbelegt – nie mit heutigen Einstellungen aufgefüllt. Bestätigt die Konfigurations-ID des Ereignisses die
  Heizkörper zum Zeitpunkt nicht, ist er ebenfalls unbelegt. Wechsel innerhalb der Minute (Grund, Regelungsart,
  Konfiguration) → `wechsel_im_intervall`, kein Training; Zustand und Soll allein sind kein Wechsel.
- **Minutenqualität** (`pruefe_minuten`): Klassifikation plus `kontext_noetig` (belegter Kontext) und
  `lauf_bestaetigen` (bestätigte Lauf-ID) – `betrieb_gueltig` der Klassifikation allein reicht nicht. Frische direkt
  nur mit bekanntem Innenalter ≤ `messalter_max_s`; bekannt alte Neudaten fallen nie auf Ersatz zurück.
- **Ersatznachweis** (`frische_ersatz`): nur für historische Unbekannte über ein Fenster samt Vorlauf – lückenlos,
  Plugs erreichbar, Werte gültig, quantisierte Konstanz höchstens `ersatz_konstanz_max_s`, keine bekannte Sperre,
  Pulsprüfung je Heizkörper gegen die im Gerät eingestellte Leistung (`p_ref`, nie das gelernte Mittel).
- **Exposition** je Minute: R = reguläre gültige thermo-Freigabe (TPI-aus bleibt R), P = reguläre Freigabe im
  Zeitplan, F = Frostbereitschaft außerhalb R/P (auch `ausserhalb`/`frei`; `frei_modus` aus hat keine).
- **Tagesmerkmale** (`tagesmerkmale`): lokaler Tag mit realer Dauer (23/24/25 h); GDH_R mit gespeichertem Soll, GDH_F
  mit Frostziel (Ein + Aus)/2; Energie je Betriebsart; Abdeckung je Gerät, gemeinsam für R∪P und F, längste
  gemeinsame Lücke; Eignung `training_thermo`/`training_plan` mit Gründen als stabile Codes. `merkmale` liefert Tage
  und Abkühlepisoden in einem Durchgang (Qualität je Minute nur einmal gerechnet).
- **Starts** (`starts`): R-Beginn nach mindestens `start_pause_min` ohne R oder Sollerhöhung über `start_sollsprung_k`;
  Innen vorher = Median der `start_vorlauf_min` davor, mindestens `start_gueltig_min` belegte Minuten.
- **Abkühlepisoden** (`abkuehlepisoden`): nach dem Ausschalten Nachlauf verwerfen (Konvektor/Öl), dann ohne Strom, ohne
  Tür und Sonderbetrieb, mit Mindestdauer, Anfangsabstand zu außen und Mindestabnahme.

Alle Schwellen stehen in `PrognoseRegeln`; `None` bleibt unbekannt und wird nie zu 0.
"""

from __future__ import annotations

from bisect import bisect_left
from collections import defaultdict
from collections.abc import Iterable, Mapping, Sequence
from datetime import UTC, date, datetime, time, timedelta
from decimal import ROUND_HALF_UP, Decimal
from functools import lru_cache
import hashlib
from itertools import pairwise
from statistics import median
from typing import Any
from zoneinfo import ZoneInfo

from .baseline import Lauf
from .prognose_regeln import PrognoseRegeln
from .prognose_typen import (
    AbkuehlEpisode,
    BereichIntervall,
    BetriebsKontext,
    Betriebsart,
    Intervall,
    Klassifikation,
    MinutenQualitaet,
    Nachweis,
    Regelungsart,
    StartMerkmal,
    TagesMerkmale,
)
from .regelung import SollGrund, frost_aus_wert

# §6.1 Grundabbildung (jeder Wert von SollGrund steht genau einmal hier)
GRUND_ART: dict[str, Betriebsart] = {
    SollGrund.ARBEITSZEIT: "REGULAER", SollGrund.VORHEIZEN: "REGULAER", SollGrund.FRUEHSTART: "REGULAER",
    SollGrund.NACHHEIZEN: "REGULAER", SollGrund.TROCKNEN: "REGULAER", SollGrund.BEDARF: "REGULAER",
    SollGrund.ABSENKEN: "REGULAER", SollGrund.HEIZGRENZE: "REGULAER",
    SollGrund.FROST: "FROST", SollGrund.BEREIT: "FROST", SollGrund.FREI: "FROST", SollGrund.AUSSERHALB: "FROST",
    SollGrund.BASELINE: "BASELINE",
    SollGrund.BOOST: "SONSTIGE", SollGrund.TASTE: "SONSTIGE", SollGrund.HAND: "SONSTIGE",
    SollGrund.TUER_OFFEN: "SONSTIGE", SollGrund.AUS: "SONSTIGE", SollGrund.AUTOMATIK_AUS: "SONSTIGE",
}

QUELLE_HA = "ha"
QUELLE_VERLAUF = "import_verlauf"       # Altdaten aus dem HA-Verlauf: nur mit belegtem Betriebskontext (P2)
QUELLE_STATISTIK = "import_statistik"   # Stundenwerte: kein minutengenaues Training
QUELLE_NOTPROGRAMM = "notprogramm"


def klassifiziere_minute(grund: str | None, zustand: str | None, quelle: str | None, zeile_vorhanden: bool) -> Klassifikation:
    """Betriebsart und Gültigkeit einer Minute (§6.1); Gründe als stabile Codes.

    `betrieb_gueltig` heißt noch nicht trainingsfähig: die Codes `kontext_noetig` (Quelle import_verlauf, Betriebskontext
    belegen) und `lauf_bestaetigen` (Grund baseline, bestätigte Lauf-ID und Zeit) MUSS P2 auswerten, bevor eine solche
    Minute ins Training geht.
    """
    if not zeile_vorhanden:
        return Klassifikation("SONSTIGE", False, ("zeile_fehlt",))
    art = GRUND_ART.get(grund) if grund else None
    if art is None:
        return Klassifikation("SONSTIGE", False, ("grund_fehlt" if not grund else "grund_unbekannt",))
    if quelle == QUELLE_NOTPROGRAMM:
        return Klassifikation("SONSTIGE", False, ("notprogramm",))
    if zustand == "offline":
        return Klassifikation("SONSTIGE", False, ("offline",))
    gueltig, gruende = True, []
    if zustand == "pause" and grund != SollGrund.TUER_OFFEN:
        gueltig = False
        gruende.append("pause_ohne_tuer")
    if quelle == QUELLE_VERLAUF:
        gruende.append("kontext_noetig")
    elif quelle == QUELLE_STATISTIK:
        gueltig = False
        gruende.append("quelle_statistik")
    elif quelle != QUELLE_HA:
        gueltig = False
        gruende.append("quelle_unbekannt")
    if grund == SollGrund.HEIZGRENZE:
        gruende.append("regulaer_gesperrt")   # Regelungszeit, aber keine reguläre Freigabe
    if art == "BASELINE":
        gruende.append("lauf_bestaetigen")    # zählt erst mit bestätigter Lauf-ID und Zeit (P3)
    return Klassifikation(art, gueltig, tuple(gruende))


def regelungsart(modus: str | None, fuehler: bool) -> Regelungsart:
    """Regelungsart eines Containers aus dem Modus der Heizung (`thermo`, `plan`, `bedarf`, `hand`, `aus`)."""
    if modus in ("thermo", "bedarf"):
        return "thermo" if fuehler else "plan"
    if modus == "plan":
        return "plan"
    if modus in ("hand", "aus"):
        return "aus"
    return "unbekannt"


def konfiguration_id(art: Regelungsart, heizkoerper: Iterable[tuple[str, str]]) -> str:
    """Kurze, stabile ID aus Regelungsart und Heizkörpern (ID, Typ) – Reihenfolge egal."""
    return _konfiguration_id(art, tuple(sorted(heizkoerper)))


@lru_cache(maxsize=256)   # je Auswertung und Container gefragt: nur bei geänderter Ausstattung neu rechnen
def _konfiguration_id(art: str, heizkoerper: tuple[tuple[str, str], ...]) -> str:
    text = art + "|" + ";".join(f"{g}:{t}" for g, t in heizkoerper)
    return "k" + hashlib.sha1(text.encode()).hexdigest()[:10]   # noqa: S324 – Kennung, kein Schutz


def nachweis_s(wert: float | None, obergrenze: float) -> int | None:
    """Gespeicherte Nachweissekunden prüfen: None bleibt None, negativ oder über `obergrenze` → None (zurückgewiesen)."""
    if wert is None or wert < 0 or wert > obergrenze:
        return None
    return int(wert)


# ---------------------------------------------------------------------- P2: Betriebskontext (Adapter-Helfer)
ARTEN: tuple[Betriebsart, ...] = ("REGULAER", "FROST", "BASELINE", "SONSTIGE")
REGELUNGSARTEN: tuple[Regelungsart, ...] = ("thermo", "plan", "aus", "unbekannt")
KONTEXT_SCHLUESSEL = ("grund", "regelungsart", "konfiguration_id")   # Wechsel davon = Kontextwechsel (nicht Zustand/Soll)
LAUF_BESTAETIGT = ("laeuft", "fertig")
TYP_OEL = "oelradiator"
TYP_KONVEKTOR = "konvektor"
MINUTE_S = 60   # eine Zeile je Minute; längere Intervalle (Stundenimporte, dauer_s 3600) sind kein Minutenwert


def regulaer_freigegeben(grund: str | None) -> bool | None:
    """Reguläre Freigabe aus dem gespeicherten Grund: regulär außer Heizgrenze; unbekannter Grund → None."""
    art = GRUND_ART.get(grund) if grund else None
    if art is None:
        return None
    return art == "REGULAER" and grund != SollGrund.HEIZGRENZE


def frost_bereit(frost: bool, frei_modus: str | None, grund: str | None, fuehler: bool, frost_aussen_c: float | None) -> bool:
    """Frostbereitschaft nach der Politik der Regelung (`regelung.frostschutz`): Frostschutz an, nicht im Urlaub mit
    „alles aus“ (`frei_modus` aus), und ein Auslöser – Fühler oder Außengrenze (`frost_aussen`)."""
    if not frost or (grund == SollGrund.FREI and frei_modus == "aus"):
        return False
    return fuehler or frost_aussen_c is not None


def kontext_gewechselt(vorher: Mapping[str, Any] | None, ereignisse: Sequence[Mapping[str, Any]]) -> bool:
    """Ändert sich Grund, Regelungsart oder Konfiguration innerhalb eines Intervalls (Ereignisse darin, zeitlich)?"""
    alt = vorher
    for e in ereignisse:
        if alt is not None and any(alt.get(k) != e.get(k) for k in KONTEXT_SCHLUESSEL):
            return True
        alt = e
    return False


def bestaetigter_lauf(laeufe: Iterable[Lauf], bereich: str, tag: date) -> str | None:
    """Lauf-ID eines bestätigten Baseline-Laufs am lokalen Tag (laufend/fertig; abgebrochen nur vor dem Abbruchtag)."""
    for l in laeufe:
        if l.bereich != bereich or not l.von <= tag < l.bis:
            continue
        if l.status in LAUF_BESTAETIGT or (l.status == "abgebrochen" and l.ende is not None and tag < l.ende):
            return l.id
    return None


def betriebskontext(
    *, grund: str | None, ereignis: Mapping[str, Any] | None, ereignisse_im_intervall: Sequence[Mapping[str, Any]],
    heizung: Mapping[str, Any] | None, heizkoerper: Iterable[tuple[str, str]], fuehler: bool, lauf_id: str | None,
    staffel_bekannt: bool, tuer_beobachtet: bool, ereignis_am_ende: Mapping[str, Any] | None = None,
    zeile_vorhanden: bool = True,
) -> BetriebsKontext:
    """Betriebskontext einer gespeicherten Minute aus Belegen zum Zeitpunkt (§4 P2).

    `ereignis`: letztes `prognose_kontext` bis Intervallbeginn; `ereignisse_im_intervall`: die danach bis vor das Ende;
    `ereignis_am_ende`: eines genau zum Intervallende (der Grund der Zeile ist der Stand am Ende). `heizung`: die zum
    Zeitpunkt gültige, belegte Einstellung `heizung` (None = nicht belegt); `heizkoerper`: (ID, Typ) der Heizkörper des
    Containers zum Zeitpunkt; `fuehler`: Container hat einen Raumfühler (Regelungsart thermo zählt ebenfalls).

    Belegt nur, wenn die Konfigurations-ID des Ereignisses die Heizkörper bestätigt und der gespeicherte Grund zum
    Grund des letzten Ereignisses passt (sonst widersprechen sich Zeile und Ereignis). Fehlen Frostschutz-Schalter oder
    Frostgrenze in der Einstellung, ist die Frostbereitschaft unbekannt (None) – nie 0 °C angenommen.
    """
    art: Regelungsart = "unbekannt"
    kid = ""
    belegt = False
    if ereignis is not None:
        roh = ereignis.get("regelungsart")
        art = roh if roh in REGELUNGSARTEN else "unbekannt"
        kid = str(ereignis.get("konfiguration_id") or "")
        letzter = ereignisse_im_intervall[-1] if ereignisse_im_intervall else ereignis
        grund_passt = not zeile_vorhanden or grund in {letzter.get("grund"), (ereignis_am_ende or {}).get("grund")}
        belegt = (heizung is not None and art != "unbekannt" and kid == konfiguration_id(art, heizkoerper) and grund_passt)
    grenze_roh = heizung.get("frost_grenze") if heizung is not None else None
    grenze = float(grenze_roh) if isinstance(grenze_roh, (int, float)) else None
    aus_roh = heizung.get("frost_aus") if heizung is not None else None
    aus_roh = aus_roh if isinstance(aus_roh, (int, float)) else None   # kein Wert = Grenze + 2 K (wie die Regelung)
    aussen_roh = heizung.get("frost_aussen") if heizung is not None else None
    frost_aussen = float(aussen_roh) if isinstance(aussen_roh, (int, float)) else None
    frost_an = heizung.get("frost") if heizung is not None else None
    bereit = (None if heizung is None or grenze is None or not isinstance(frost_an, bool)
              else frost_bereit(frost_an, heizung.get("frei_modus"), grund, fuehler or art == "thermo", frost_aussen))
    return BetriebsKontext(
        konfiguration_id=kid, regelungsart=art, regulaer_freigegeben=regulaer_freigegeben(grund), frost_bereit=bereit,
        # ohne Grenze: Platzhalter 0, ungenutzt (frost_bereit None → keine Frostexposition)
        frost_grenze_c=grenze if grenze is not None else 0.0,
        frost_aus_c=frost_aus_wert(grenze, None if aus_roh is None else float(aus_roh)) if grenze is not None else 0.0,
        frost_aussen_c=frost_aussen, baseline_lauf_id=lauf_id, tuer_beobachtet=tuer_beobachtet, kontext_belegt=belegt,
        wechsel_im_intervall=kontext_gewechselt(ereignis, ereignisse_im_intervall), staffel_rekonstruiert_frei=None,
        anschlussbelegung_belegt=staffel_bekannt, sperrereignis=False, sonstige_eingriffe=())


# ---------------------------------------------------------------------- P2: Minutenqualität (§6.3)
def _dauer_s(m: BereichIntervall) -> float:
    return (m.zeit.bis - m.zeit.von).total_seconds()


def _codes(gruende: Iterable[str]) -> tuple[str, ...]:
    return tuple(dict.fromkeys(gruende))


def _energie_ok(g: Any) -> bool:
    return bool(g.energie_gueltig) and g.energie_wh is not None


def _gesperrt(m: BereichIntervall) -> bool:
    """Bekannte Sperre/Abwurf: Container- oder Gerätesperrzeit > 0 oder Sperrereignis."""
    return (m.kontext.sperrereignis or (m.staffel_begrenzt_s or 0) > 0
            or any((g.staffel_gesperrt_s or 0) > 0 for g in m.geraete))


def _frisch(m: BereichIntervall, r: PrognoseRegeln) -> bool | None:
    """Innenalter belegt frisch (True), belegt zu alt (False) oder unbekannt (None)."""
    if m.temp_alter_s is None:
        return None
    return m.temp_alter_s <= r.messalter_max_s


def _pruefe(m: BereichIntervall, r: PrognoseRegeln) -> tuple[Klassifikation, MinutenQualitaet]:
    k = klassifiziere_minute(m.grund, m.zustand, m.quelle, m.zeile_vorhanden)
    g: list[str] = list(k.gruende)
    betrieb = k.betrieb_gueltig
    if m.zeile_vorhanden and not m.kontext.kontext_belegt:
        betrieb = False
        g.append("kontext_fehlt")   # gilt auch für kontext_noetig (import_verlauf)
    if "lauf_bestaetigen" in k.gruende and m.kontext.baseline_lauf_id is None:
        betrieb = False
        g.append("lauf_unbestaetigt")
    thermo = m.kontext.regelungsart == "thermo"
    if betrieb and k.art == "REGULAER" and thermo and m.soll_c is None:
        betrieb = False
        g.append("soll_fehlt")
    energie = tuple((x.geraet_id, _energie_ok(x)) for x in m.geraete)
    if not m.geraete:
        g.append("keine_geraete")
    elif not all(ok for _, ok in energie):
        g.append("energie_fehlt")
    if any(x.erreichbar is False for x in m.geraete):
        g.append("geraet_offline")
    innen = m.innen_gueltig and m.innen_c is not None
    aussen = m.aussen_gueltig and m.aussen_c is not None
    if not innen:
        g.append("innen_fehlt")
    if not aussen:
        g.append("aussen_fehlt")
    frisch = _frisch(m, r)
    frische: Nachweis = "direkt" if frisch and innen else "keiner"
    if frisch is False:
        g.append("messalter_ueberschritten")   # bekannt alt: kein Ersatzweg
    elif frisch is None:
        g.append("frische_ersatz_noetig" if m.altersnachweis_alt else "messalter_unbekannt")
    if m.aussen_frisch is False:
        frische = "keiner"
        g.append("aussen_alt")
    elif m.aussen_frisch is None and aussen:
        g.append("aussen_frische_unbelegt")   # Unsicherheit sichtbar, sperrt die direkte Frische nicht
    staffel: Nachweis
    if _gesperrt(m):
        staffel = "keiner"
        g.append("staffel_begrenzt")
    elif m.staffel_begrenzt_s is not None:
        staffel = "direkt"
    elif m.kontext.staffel_rekonstruiert_frei:
        staffel = "rekonstruiert"
    else:
        staffel = "keiner"
        g.append("staffel_ersatz_noetig" if m.altersnachweis_alt else "staffel_unbekannt")
    if m.kontext.wechsel_im_intervall:
        g.append("wechsel_im_intervall")
    if _dauer_s(m) > MINUTE_S:
        g.append("kein_minutenwert")   # Stundenimporte: Ist-/Abrechnungsdaten, kein Training
    if k.art == "SONSTIGE" and GRUND_ART.get(m.grund or "") == "SONSTIGE":
        g.append("sonderbetrieb")
    if m.zeile_vorhanden and not m.kontext.tuer_beobachtet:
        g.append("tuer_unbekannt")   # Unsicherheit, kein erfundenes „zu“
    g.extend(m.kontext.sonstige_eingriffe)
    training = (betrieb and k.art != "SONSTIGE" and bool(m.geraete) and all(ok for _, ok in energie) and aussen
                and _dauer_s(m) <= MINUTE_S and not m.kontext.wechsel_im_intervall and staffel != "keiner"
                and not m.kontext.sonstige_eingriffe and (not thermo or (innen and frische == "direkt")))
    return k, MinutenQualitaet(energie, innen, aussen, betrieb, frische, staffel, training, _codes(g))


def pruefe_minuten(minuten: Sequence[BereichIntervall], regeln: PrognoseRegeln) -> tuple[MinutenQualitaet, ...]:
    """Qualität je Minute (§6.3): Betrieb samt Kontext/Lauf, Energie je Gerät, Innen, Außen, Frische und Staffelung."""
    return tuple(_pruefe(m, regeln)[1] for m in minuten)


def quantisiere(wert: float, aufloesung: float) -> Decimal:
    """Messwert auf die Auflösung des Fühlers (Decimal, kaufmännisch half-up)."""
    return Decimal(repr(wert)).quantize(Decimal(repr(aufloesung)), rounding=ROUND_HALF_UP)


def laengste_konstanz_s(minuten: Sequence[BereichIntervall], regeln: PrognoseRegeln) -> float:
    """Längste lückenlose Folge gleicher quantisierter Innenwerte in Sekunden."""
    laengste = lauf = 0.0
    wert: Decimal | None = None
    bis: datetime | None = None
    for m in minuten:
        q = None if m.innen_c is None else quantisiere(m.innen_c, regeln.sensor_aufloesung_k)
        if q is not None and q == wert and bis == m.zeit.von:
            lauf += _dauer_s(m)
        else:
            lauf = _dauer_s(m) if q is not None else 0.0
        wert, bis = q, m.zeit.bis
        laengste = max(laengste, lauf)
    return laengste


def _pulse(minuten: Sequence[BereichIntervall], ids: Sequence[str], r: PrognoseRegeln) -> list[str]:
    """Pulsprüfung je Heizkörper: genug volle Stromminuten mit belegtem Strom, Median E/dt im Band um P_ref."""
    fehler: list[str] = []
    for gid in ids:
        voll: list[float] = []
        p_ref = None
        for m in minuten:
            d = _dauer_s(m)
            for g in m.geraete:
                if g.geraet_id != gid:
                    continue
                if p_ref is None:
                    p_ref = g.p_ref
                if (_energie_ok(g) and g.strom_belegt and g.sekunden_ein is not None and g.sekunden_strom is not None
                        and g.sekunden_ein >= d and g.sekunden_strom >= d and d > 0):
                    voll.append(g.energie_wh / 1000 / (d / 3600))
        if p_ref is None or p_ref.kw <= 0:
            fehler.append("p_ref_fehlt")
        elif len(voll) < r.puls_minuten_min:
            fehler.append("puls_zu_wenig")
        elif not r.puls_rel_min * p_ref.kw <= median(voll) <= r.puls_rel_max * p_ref.kw:
            fehler.append("puls_ausserhalb")
    return fehler


def frische_ersatz(minuten: Sequence[BereichIntervall], regeln: PrognoseRegeln) -> MinutenQualitaet:
    """Qualität eines Fensters samt Vorlauf (§6.3): direkt, wo Alter und Staffelung belegt sind; Ersatz nur für
    historische Unbekannte – nie für bekannt alte oder unbekannte Neudaten. Konstanz über `ersatz_konstanz_max_s` heißt
    nur „Ersatz nicht erfüllt“, kein Defekt."""
    ms = sorted(minuten, key=lambda m: m.zeit.von)
    if not ms:
        return MinutenQualitaet((), False, False, False, "keiner", "keiner", False, ("leer",))
    paare = [_pruefe(m, regeln) for m in ms]
    g: list[str] = []
    luecke = any(a.zeit.bis != b.zeit.von for a, b in pairwise(ms))
    if luecke:
        g.append("luecke")
    ids = sorted({x.geraet_id for m in ms for x in m.geraete})
    energie = tuple((gid, all(any(x.geraet_id == gid and _energie_ok(x) for x in m.geraete) for m in ms)) for gid in ids)
    if not ids:
        g.append("keine_geraete")
    erreichbar = all(x.erreichbar is True for m in ms for x in m.geraete)
    if not erreichbar:
        g.append("geraet_nicht_erreichbar")
    innen = all(q.innen_gueltig for _, q in paare)
    aussen = all(q.aussen_gueltig for _, q in paare)
    betrieb = all(q.betrieb_gueltig for _, q in paare)
    if not betrieb:
        g.append("betrieb_ungueltig")
    alt = [m for m in ms if m.temp_alter_s is None and m.altersnachweis_alt]
    frische: Nachweis
    if any(_frisch(m, regeln) is False for m in ms):
        frische = "keiner"
        g.append("messalter_ueberschritten")
    elif any(m.temp_alter_s is None and not m.altersnachweis_alt for m in ms):
        frische = "keiner"
        g.append("messalter_unbekannt")
    elif not alt:
        frische = "direkt"
    elif laengste_konstanz_s(ms, regeln) > regeln.ersatz_konstanz_max_s:
        frische = "keiner"
        g.append("konstanz_zu_lang")
    else:
        frische = "ersatz"
    if any(m.aussen_frisch is False for m in ms):
        frische = "keiner"
        g.append("aussen_alt")
    staffel: Nachweis
    unbekannt = [m for m in ms if m.staffel_begrenzt_s is None]
    if any(_gesperrt(m) for m in ms):
        staffel = "keiner"
        g.append("staffel_begrenzt")
    elif not unbekannt:
        staffel = "direkt"
    elif all(m.kontext.staffel_rekonstruiert_frei for m in unbekannt):
        staffel = "rekonstruiert"
    elif all(m.altersnachweis_alt for m in unbekannt):
        staffel = "ersatz"
    else:
        staffel = "keiner"
        g.append("staffel_unbekannt")
    if "ersatz" in (frische, staffel):
        if fehler := _pulse(ms, ids, regeln):
            g.extend(fehler)
            frische = "keiner" if frische == "ersatz" else frische
            staffel = "keiner" if staffel == "ersatz" else staffel
        if not all(m.kontext.anschlussbelegung_belegt for m in ms):
            g.append("anschlussbelegung_unbelegt")
    if frische == "ersatz":
        g.append("frische_ersatz")
    if staffel == "ersatz":
        g.append("staffel_ersatz")
    wechsel = any(m.kontext.wechsel_im_intervall for m in ms)
    if wechsel:
        g.append("wechsel_im_intervall")
    sonder = any(k.art == "SONSTIGE" for k, _ in paare)
    if sonder:
        g.append("sonderbetrieb")
    training = (not luecke and bool(ids) and all(ok for _, ok in energie) and erreichbar and innen and aussen and betrieb
                and frische in ("direkt", "ersatz") and staffel != "keiner" and not wechsel and not sonder
                and all(_dauer_s(m) <= MINUTE_S for m in ms))
    return MinutenQualitaet(energie, innen, aussen, betrieb, frische, staffel, training, _codes(g))


# ---------------------------------------------------------------------- P2: Exposition, Starts, Tage (§6.2, §6.4)
def _exposition(m: BereichIntervall, k: Klassifikation, q: MinutenQualitaet) -> str | None:
    """R (thermo regulär), P (Zeitplan regulär), F (Frostbereitschaft außerhalb R/P) oder None."""
    if not q.betrieb_gueltig:
        return None
    if k.art == "REGULAER" and m.kontext.regulaer_freigegeben is True:
        if m.kontext.regelungsart == "thermo":
            return "R"
        if m.kontext.regelungsart == "plan":
            return "P"
    if k.art in ("REGULAER", "FROST") and m.kontext.frost_bereit is True:
        return "F"
    return None


def _gemeinsam(m: BereichIntervall, q: MinutenQualitaet) -> bool:
    """Gemeinsam gültig: Betrieb, Außen, Energie jedes Geräts, – bei thermo – Innen, und kein Kontextwechsel."""
    return (q.betrieb_gueltig and q.aussen_gueltig and bool(q.energie_je_geraet_gueltig)
            and all(ok for _, ok in q.energie_je_geraet_gueltig) and not m.kontext.wechsel_im_intervall
            and (q.innen_gueltig or m.kontext.regelungsart != "thermo"))


def _belegt_innen(m: BereichIntervall, r: PrognoseRegeln) -> bool:
    """Innenwert für den Start: gültig und frisch belegt oder historisch ohne Altersnachweis (Ersatz)."""
    if m.innen_c is None or not m.innen_gueltig:
        return False
    frisch = _frisch(m, r)
    return frisch is True or (frisch is None and m.altersnachweis_alt)


_Bewertet = tuple[BereichIntervall, Klassifikation, MinutenQualitaet]


def _bewerten(minuten: Sequence[BereichIntervall], r: PrognoseRegeln) -> dict[str, list[_Bewertet]]:
    """Je Container zeitlich sortiert, Qualität je Minute genau einmal gerechnet."""
    je: dict[str, list[_Bewertet]] = defaultdict(list)
    for m in sorted(minuten, key=lambda m: (m.bereich_id, m.zeit.von)):
        k, q = _pruefe(m, r)
        je[m.bereich_id].append((m, k, q))
    return je


def starts(minuten: Sequence[BereichIntervall], regeln: PrognoseRegeln) -> tuple[StartMerkmal, ...]:
    """Starts (§6.4) je Container: R-Beginn nach mindestens `start_pause_min` ohne R oder Sollerhöhung über
    `start_sollsprung_k`; Vorheizen → Arbeitszeit ohne Lücke bleibt ein Start. Liegt der Beginn der Beobachtung näher
    als die Pause, ist der Start unbekannt und wird nicht gezählt. War die Pause nicht durchgehend belegt (Datenlücke
    oder ungültige Minuten), zählt der Start mit dem Code `start_nach_luecke` – „ohne R“ ist dann nicht bewiesen."""
    return tuple(s for liste in _bewerten(minuten, regeln).values() for s in _starts_bereich(liste, regeln))


def _starts_bereich(liste: Sequence[_Bewertet], regeln: PrognoseRegeln) -> list[StartMerkmal]:
    if not liste:
        return []
    pause = timedelta(minutes=regeln.start_pause_min)
    vorlauf = timedelta(minutes=regeln.start_vorlauf_min)
    beobachtet_ab = liste[0][0].zeit.von
    beginne = [m.zeit.von for m, _, _ in liste]
    r_ende: datetime | None = None
    r_soll: float | None = None
    unbelegt = False   # seit dem letzten R eine Lücke oder ungültige Minute
    bis_vorher: datetime | None = None
    aus: list[StartMerkmal] = []
    for i, (m, k, q) in enumerate(liste):
        if bis_vorher is not None and m.zeit.von > bis_vorher:
            unbelegt = True
        bis_vorher = m.zeit.bis
        if _exposition(m, k, q) != "R" or m.soll_c is None:
            if not q.betrieb_gueltig:
                unbelegt = True
            continue
        g: list[str] = []
        neu = m.zeit.von - (r_ende or beobachtet_ab) >= pause
        if neu and unbelegt:
            g.append("start_nach_luecke")
        if not neu and r_ende is not None and r_soll is not None and m.soll_c - r_soll > regeln.start_sollsprung_k:
            neu = True
            g.append("sollsprung")
        r_ende, r_soll, unbelegt = m.zeit.bis, m.soll_c, False
        if not neu:
            continue
        werte: list[float] = []
        sekunden = 0.0
        for v, _, _ in liste[bisect_left(beginne, m.zeit.von - vorlauf):i]:
            if v.zeit.bis <= m.zeit.von and _belegt_innen(v, regeln):
                assert v.innen_c is not None
                werte.append(v.innen_c)
                sekunden += _dauer_s(v)
                if v.temp_alter_s is None:
                    g.append("start_frische_ersatz")
        innen = median(werte) if werte and sekunden >= regeln.start_gueltig_min * 60 else None
        if innen is None:
            g.append("start_unbekannt")
        aus.append(StartMerkmal(
            episode_id=f"{m.bereich_id}:{m.zeit.von.isoformat()}", beginn=m.zeit.von, soll_c=m.soll_c, innen_start_c=innen,
            delta_start_k=None if innen is None else max(0.0, m.soll_c - innen), konfiguration_id=m.kontext.konfiguration_id,
            gruende=_codes(g)))
    return aus


def _quote(teil: float, ganz: float) -> float | None:
    return teil / ganz if ganz > 0 else None


def tagesmerkmale(
    minuten: Sequence[BereichIntervall], heute: date, zeitzone: str, regeln: PrognoseRegeln,
) -> tuple[TagesMerkmale, ...]:
    """Merkmale je Container und abgeschlossenem lokalem Tag (§6.2, §6.4); Tage ab `heute` fehlen."""
    return merkmale(minuten, heute, zeitzone, regeln)[0]


def merkmale(
    minuten: Sequence[BereichIntervall], heute: date, zeitzone: str, regeln: PrognoseRegeln,
) -> tuple[tuple[TagesMerkmale, ...], tuple[AbkuehlEpisode, ...]]:
    """Tagesmerkmale und Abkühlepisoden in einem Durchgang (Qualität je Minute nur einmal gerechnet)."""
    zone = ZoneInfo(zeitzone)
    tage: list[TagesMerkmale] = []
    episoden: list[AbkuehlEpisode] = []
    for bereich, liste in sorted(_bewerten(minuten, regeln).items()):
        je_tag: dict[date, list[_Bewertet]] = defaultdict(list)
        for x in liste:
            je_tag[x[0].zeit.von.astimezone(zone).date()].append(x)
        alle_starts = _starts_bereich(liste, regeln)
        for datum, tag_liste in sorted(je_tag.items()):
            if datum >= heute:
                continue
            tag_starts = tuple(s for s in alle_starts if s.beginn.astimezone(zone).date() == datum)
            tage.append(_tag(bereich, datum, tag_liste, tag_starts, zone, regeln))
        episoden.extend(_abkuehl_bereich(liste, regeln))
    return tuple(tage), tuple(episoden)


def _tag(  # noqa: C901, PLR0912, PLR0915 – eine Tagesbilanz, Schritt für Schritt
    bereich: str, datum: date, liste: Sequence[_Bewertet], tag_starts: tuple[StartMerkmal, ...], zone: ZoneInfo,
    r: PrognoseRegeln,
) -> TagesMerkmale:
    von = datetime.combine(datum, time(), zone).astimezone(UTC)
    bis = datetime.combine(datum + timedelta(days=1), time(), zone).astimezone(UTC)
    tag_s = (bis - von).total_seconds()
    arten: dict[str, float] = dict.fromkeys(ARTEN, 0.0)
    ist = reg_joint = gdh_r = gdh_f = gdh_innen = 0.0
    r_s = p_s = f_s = joint_rp_s = joint_f_s = betrieb_s = innen_s = aussen_s = 0.0
    aussen_summe = 0.0
    kapazitaet: float | None = 0.0
    abgedeckt: dict[str, float] = defaultdict(float)
    fehlt_zugeordnet: dict[str, float] = defaultdict(float)
    konfig: dict[str, float] = defaultdict(float)
    regelungsarten: dict[str, float] = defaultdict(float)
    gruende: list[str] = []
    info: list[str] = []
    luecke = laengste = 0.0
    zuletzt = von
    tuer_lauf = 0.0
    tuer_ende: datetime | None = None
    geraete_tag = sorted({x.geraet_id for m, _, _ in liste for x in m.geraete})
    for m, k, q in liste:
        d = _dauer_s(m)
        h = d / 3600
        exp = _exposition(m, k, q)
        gem = _gemeinsam(m, q)
        e_kwh = sum(x.energie_wh for x in m.geraete if _energie_ok(x)) / 1000
        ist += e_kwh
        arten[k.art] += e_kwh
        for gid in geraete_tag:
            x = next((y for y in m.geraete if y.geraet_id == gid), None)
            if x is None:
                fehlt_zugeordnet[gid] += d
            elif _energie_ok(x):
                abgedeckt[gid] += d
        if m.zeile_vorhanden:
            konfig[m.kontext.konfiguration_id] += d
            if m.kontext.kontext_belegt:
                regelungsarten[m.kontext.regelungsart] += d
        betrieb_s += d if q.betrieb_gueltig else 0.0
        innen_s += d if q.innen_gueltig else 0.0
        if q.aussen_gueltig:
            assert m.aussen_c is not None
            aussen_s += d
            aussen_summe += m.aussen_c * d
        # Gründe, die den ganzen Tag vom Training ausschließen
        if "notprogramm" in q.gruende:
            gruende.append("notprogramm")
        if "offline" in q.gruende:
            gruende.append("offline")
        if k.art == "BASELINE":
            gruende.append("baseline")
        if "sonderbetrieb" in q.gruende:
            gruende.append("sonderbetrieb")
        if m.kontext.wechsel_im_intervall:
            info.append("wechsel_im_intervall")   # nur diese Minute zählt nicht (Lücke), nicht der ganze Tag
        if _gesperrt(m):
            gruende.append("staffel_begrenzt")
        if m.kontext.sonstige_eingriffe:
            gruende.append("sondereingriff")
        if "kein_minutenwert" in q.gruende:
            gruende.append("kein_minutenwert")
        # gemeinsame Lücke: Zeit ohne Zeile oder nicht gemeinsam gültig
        if m.zeit.von > zuletzt:
            luecke += (m.zeit.von - zuletzt).total_seconds()
        if gem:
            laengste, luecke = max(laengste, luecke), 0.0
        else:
            luecke += d
        zuletzt = max(zuletzt, m.zeit.bis)
        # Exposition
        if exp in ("R", "P"):
            if exp == "R":
                r_s += d
            else:
                p_s += d
            if kapazitaet is not None:
                refs = [x.p_ref for x in m.geraete]
                kapazitaet = None if not refs or any(p is None for p in refs) else kapazitaet + sum(
                    p.kw for p in refs if p is not None) * h
            if gem:
                joint_rp_s += d
                reg_joint += e_kwh
                assert m.aussen_c is not None
                if exp == "R":
                    assert m.soll_c is not None and m.innen_c is not None
                    gdh_r += max(0.0, m.soll_c - m.aussen_c) * h
                    gdh_innen += max(0.0, m.innen_c - m.aussen_c) * h
            if not m.kontext.tuer_beobachtet:
                info.append("tuer_unbekannt")
            offen = m.tuer_offen_s or 0
            if offen > 0:
                tuer_lauf = (tuer_lauf if tuer_ende == m.zeit.von else 0.0) + offen
                tuer_ende = m.zeit.bis
                if tuer_lauf > r.tuer_offen_max_s:
                    gruende.append("tuer_offen")
        elif exp == "F":
            f_s += d
            if gem:
                joint_f_s += d
                assert m.aussen_c is not None
                ziel = (m.kontext.frost_grenze_c + m.kontext.frost_aus_c) / 2
                gdh_f += max(0.0, ziel - m.aussen_c) * h
        if exp in ("R", "P") and q.frische == "keiner" and "frische_ersatz_noetig" in q.gruende:
            info.append("frische_ersatz_noetig")
        if exp is not None and "aussen_frische_unbelegt" in q.gruende:
            info.append("aussen_frische_unbelegt")
    if bis > zuletzt:
        luecke += (bis - zuletzt).total_seconds()
    laengste = max(laengste, luecke)
    q_energie = tuple((gid, abgedeckt[gid] / (tag_s - fehlt_zugeordnet[gid])) if tag_s > fehlt_zugeordnet[gid] else (gid, 0.0)
                      for gid in geraete_tag)
    q_betrieb, q_innen, q_aussen = betrieb_s / tag_s, innen_s / tag_s, aussen_s / tag_s
    q_rp, q_f = _quote(joint_rp_s, r_s + p_s), _quote(joint_f_s, f_s)
    if len([k for k in konfig if k]) > 1:
        gruende.append("konfiguration_gewechselt")
    if len(regelungsarten) > 1:
        gruende.append("modus_gewechselt")
    if not geraete_tag:
        gruende.append("keine_geraete")
    if q_betrieb < r.abdeckung_min:
        gruende.append("betrieb_abdeckung")
    if q_aussen < r.abdeckung_min:
        gruende.append("aussen_abdeckung")
    if any(w < r.abdeckung_min for _, w in q_energie):
        gruende.append("energie_abdeckung")
    if q_rp is not None and q_rp < r.abdeckung_min:
        gruende.append("abdeckung_r")
    if q_f is not None and q_f < r.abdeckung_min:
        gruende.append("abdeckung_f")
    if laengste > r.gemeinsame_luecke_max_s:
        gruende.append("luecke_zu_lang")
    gemeinsam = list(_codes(gruende))
    art_tag = max(regelungsarten, key=lambda a: regelungsarten[a]) if regelungsarten else "unbekannt"
    thermo: list[str] = []
    if art_tag == "thermo" or r_s > 0:
        if r_s == 0:
            thermo.append("keine_regelzeit")
        if q_innen < r.abdeckung_min:
            thermo.append("innen_abdeckung")
        if any(s.delta_start_k is not None and s.delta_start_k > r.tagesfit_start_max_k for s in tag_starts):
            thermo.append("start_zu_kalt")
        if r_s / 3600 < r.tagesfit_aktiv_min_h:
            thermo.append("regelzeit_zu_kurz")
        if gdh_r < r.tagesfit_gdh_min_kh:
            thermo.append("gdh_zu_klein")
    plan: list[str] = []
    if art_tag == "plan" or p_s > 0:
        if p_s == 0:
            plan.append("keine_planzeit")
        if kapazitaet is None:
            plan.append("p_ref_fehlt")
    if not thermo and not plan and r_s == 0 and p_s == 0:
        thermo.append("keine_regelzeit")
    training_thermo = not gemeinsam and not thermo and r_s > 0
    training_plan = not gemeinsam and not plan and p_s > 0
    vollstaendig = bool(geraete_tag) and all(abs(w - 1.0) < 1e-9 for _, w in q_energie)
    return TagesMerkmale(
        datum=datum, bereich_id=bereich, konfiguration_id=max(konfig, key=lambda c: konfig[c]) if konfig else "",
        dauer_h=tag_s / 3600, ist_belegt_kwh=ist, ist_vollstaendig=vollstaendig,
        energie_arten_kwh=tuple((a, arten[a]) for a in ARTEN), regulaer_joint_kwh=reg_joint, gdh_aktiv_kh=gdh_r,
        gdh_frost_kh=gdh_f, gdh_innen_kh=gdh_innen, aktiv_h=r_s / 3600, frost_h=f_s / 3600, plan_h=p_s / 3600,
        kapazitaet_regulaer_kwh=kapazitaet if r_s + p_s > 0 else None,
        aussen_mittel_c=aussen_summe / aussen_s if aussen_s > 0 else None, q_energie_je_geraet=q_energie,
        q_betrieb=q_betrieb, q_innen=q_innen, q_aussen=q_aussen, q_joint_r=q_rp, q_joint_f=q_f,
        laengste_joint_luecke_s=laengste, starts=tag_starts, training_thermo=training_thermo, training_plan=training_plan,
        gruende=_codes([*gemeinsam, *thermo, *plan, *info]))


# ---------------------------------------------------------------------- P2: Abkühlepisoden (§8.3, Merkmale für P4b)
def _heizt(m: BereichIntervall) -> bool | None:
    """Messbare Heizenergie in der Minute: Strom über „zieht Strom“ (sonst Energie > 0); unbekannt → None."""
    if not m.geraete:
        return None
    unbekannt = False
    for g in m.geraete:
        if g.sekunden_strom is not None:
            if g.sekunden_strom > 0:
                return True
        elif g.energie_wh is not None and g.energie_gueltig:
            if g.energie_wh > 0:
                return True
        else:
            unbekannt = True
    return None if unbekannt else False


def abkuehlepisoden(minuten: Sequence[BereichIntervall], regeln: PrognoseRegeln) -> tuple[AbkuehlEpisode, ...]:
    """Abkühlepisoden (§8.3): nach dem Ausschalten den Nachlauf verwerfen (Konvektor `konvektor_vorlauf_min`, mit Öl
    oder unbekanntem Typ `oel_vorlauf_min`), dann lückenlos ohne Heizenergie, Tür, Sonderbetrieb und mit gültigen
    Werten; mindestens `abkuehl_episode_min_h`, anfangs Innen − Außen ≥ `innen_aussen_min_k`, Abnahme ≥
    `abkuehl_abnahme_min_k`. Eine Störung beendet die Episode; die nächste beginnt erst nach dem nächsten Heizen."""
    return tuple(e for liste in _bewerten(minuten, regeln).values() for e in _abkuehl_bereich(liste, regeln))


def _abkuehl_bereich(liste: Sequence[_Bewertet], regeln: PrognoseRegeln) -> list[AbkuehlEpisode]:
    aus: list[AbkuehlEpisode] = []
    lauf: list[BereichIntervall] = []
    info: list[str] = []
    aus_seit: datetime | None = None
    vorher: BereichIntervall | None = None

    def schliessen() -> None:
        if lauf:
            a, e = lauf[0], lauf[-1]
            assert a.innen_c is not None and e.innen_c is not None and a.aussen_c is not None
            if ((e.zeit.bis - a.zeit.von).total_seconds() / 3600 >= regeln.abkuehl_episode_min_h
                    and a.innen_c - a.aussen_c >= regeln.innen_aussen_min_k
                    and a.innen_c - e.innen_c >= regeln.abkuehl_abnahme_min_k):
                aus.append(AbkuehlEpisode(Intervall(a.zeit.von, e.zeit.bis), a.bereich_id, a.kontext.konfiguration_id,
                                          tuple(lauf), a.innen_c, e.innen_c, _codes(info)))
        lauf.clear()
        info.clear()

    for m, k, q in liste:
        if vorher is not None and vorher.zeit.bis != m.zeit.von:
            schliessen()
            aus_seit = None
        vorher = m
        h = _heizt(m)
        if h is not False:
            schliessen()
            aus_seit = m.zeit.bis if h else None
            continue
        if aus_seit is None:
            continue
        typen = {g.typ for g in m.geraete}
        nachlauf = regeln.konvektor_vorlauf_min if typen == {TYP_KONVEKTOR} else regeln.oel_vorlauf_min
        if m.zeit.von < aus_seit + timedelta(minutes=nachlauf):
            continue
        frisch = _frisch(m, regeln)
        ok = (q.betrieb_gueltig and q.innen_gueltig and q.aussen_gueltig and k.art in ("REGULAER", "FROST")
              and not (m.tuer_offen_s or 0) > 0 and not _gesperrt(m) and not m.kontext.wechsel_im_intervall
              and (frisch is True or (frisch is None and m.altersnachweis_alt))
              and (not lauf or lauf[0].kontext.konfiguration_id == m.kontext.konfiguration_id))
        if not ok:
            schliessen()
            aus_seit = None
            continue
        if frisch is None:
            info.append("frische_ersatz")
        if None in typen:
            info.append("typ_unbekannt")
        if not m.kontext.tuer_beobachtet:
            info.append("tuer_unbekannt")   # wie im Tag: Unsicherheit, kein erfundenes „zu“
        lauf.append(m)
    schliessen()
    return aus
