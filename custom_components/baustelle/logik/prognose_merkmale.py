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

Spätere Lieferungen (P2) ergänzen hier Qualität, Exposition, Tages-, Start- und Abkühlmerkmale.
"""

from __future__ import annotations

from collections.abc import Iterable
from functools import lru_cache
import hashlib

from .prognose_typen import Betriebsart, Klassifikation, Regelungsart
from .regelung import SollGrund

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
