"""Geräte einer Baustelle: Status und was nach dem Entfernen übrig bleibt – ohne Home-Assistant-Code.

Status (BSM-034.02, Bauplan Geräte §4, Herbert 09.10.2026): ein Feld je Gerät – aktiv, inaktiv, verliehen, defekt; im
Inventar dieselben vier Werte. Nur „aktiv“ schaltet die Automatik, zählt in der Staffelung und meldet Warnungen.

BSM-034.01 (Bauplan Geräte §3 Fehler 6): Einstellungen je Gerät, Zähler, „stumm“ und Reparatur-Hinweise hängen an der
ID des Unter-Eintrags (Gerät `gid`, Container `bid`). Wird einer gelöscht, räumt die Integration beim nächsten Laden auf.
Die Werte im Verlauf (Datenbank, Langzeitstatistik) bleiben.
"""

from __future__ import annotations

from collections.abc import Iterable, Mapping
from typing import Any

STATUS = ("aktiv", "inaktiv", "verliehen", "defekt")
STATUS_TEXT = {"aktiv": "aktiv", "inaktiv": "inaktiv", "verliehen": "verliehen", "defekt": "defekt"}


def status_von(eintrag: Mapping[str, Any] | None) -> str:
    """Status aus den Einstellungen des Geräts; vor 0.8.116 stand dort nur `aktiv: False` (= inaktiv, WU-0004)."""
    e = eintrag or {}
    if e.get("status") in STATUS:
        return str(e["status"])
    return "inaktiv" if e.get("aktiv") is False else "aktiv"


def schaltet(status: str) -> bool:
    """Nur ein aktives Gerät schaltet die Automatik, zählt in der Staffelung und meldet Warnungen."""
    return status == "aktiv"


FEHLER_TEXT = {   # wie translations (config_subentries.geraet.error), für die Seite
    "kein_schalter": "Bitte einen Schalter wählen.",
    "schalter_fehlt": "Diesen Schalter gibt es in Home Assistant nicht (mehr) – z. B. umbenannt. Bitte neu wählen.",
    "schalter_andere_baustelle": "Dieser Shelly gehört einer anderen aktiven Baustelle. Die erst abschließen.",
    "schalter_vergeben": "Dieser Shelly ist in dieser Baustelle schon zugeordnet.",
    "kein_bereich": "Zuerst einen Container oder Bereich anlegen.",
    "rolle_passt_nicht": "Pumpen gehören in einen Pumpenschacht, alles andere in einen Container.",
    "kein_name": "Bitte einen Namen eingeben.",
    "kein_geraet": "Gerät nicht gefunden – die Seite neu laden.",
}


def pruefen(*, schalter: str, rolle: str, bereich_art: str | None, vergeben_hier: bool, andere_baustelle: bool,
            name: str = "x", schalter_fehlt: bool = False) -> str | None:
    """Darf dieser Shelly mit dieser Rolle in diesen Bereich? Fehlerschlüssel (wie im HA-Dialog, translations) oder None.

    Ein Schalter gehört nur einer aktiven Baustelle und dort nur einem Gerät; eine Pumpe nur in einen Pumpenschacht und
    in einen Pumpenschacht nur Pumpen (BSM-034.02: dieselbe Regel für HA-Dialog, Seite und Inventar). Ein neu gewählter
    Schalter muss in HA existieren (`schalter_fehlt`; z. B. ein alter Entwurf nach dem Umbenennen, Gutachten 0.8.190).
    """
    if not schalter.startswith("switch."):
        return "kein_schalter"
    if schalter_fehlt:
        return "schalter_fehlt"
    if andere_baustelle:
        return "schalter_andere_baustelle"
    if vergeben_hier:
        return "schalter_vergeben"
    if bereich_art is None:
        return "kein_bereich"
    if (bereich_art == "pumpenschacht") != (rolle == "pumpe"):
        return "rolle_passt_nicht"
    if not name.strip():
        return "kein_name"
    return None


def status_protokoll(name: str, status: str) -> str:
    return f"{name}: {STATUS_TEXT.get(status, status)}" + ("" if schaltet(status) else " – die Automatik lässt es aus")


# Zähler je Gerät bzw. je Container: Schlüssel `<art>:<id>` (bei `stand` auch `stand:<id>:zeit`)
ZAEHLER_GERAET = ("stand", "mittel", "pumpzeit", "zyklen")
ZAEHLER_BEREICH = ("energie", "kosten", "heizzeit", "heizzeit_strom", "aufheiz", "abkuehl", "gradh",
                   "vgl_kwh", "vgl_gradh", "vgl_aufheiz", "vgl_abkuehl")


def _weg_zaehler(key: str, bereiche: set[str], geraete: set[str]) -> bool:
    art, _, rest = key.partition(":")
    kennung = rest.split(":", 1)[0]
    if not kennung:
        return False
    return (art in ZAEHLER_GERAET and kennung not in geraete) or (art in ZAEHLER_BEREICH and kennung not in bereiche)


def _weg_stumm(key: str, bereiche: set[str], geraete: set[str]) -> bool:
    """Warnungs-Schlüssel `art[:bereich[:gerät]]` (logik/warnungen.warn_key)."""
    teile = key.split(":")
    return (len(teile) > 1 and teile[1] not in bereiche) or (len(teile) > 2 and "." not in teile[2] and teile[2] not in geraete)


def reste_entfernen(daten: dict[str, Any], bereiche: Iterable[str], geraete: Iterable[str]) -> list[str]:
    """Einstellungen je Gerät, Zähler und „stumm“ gelöschter Geräte und Container aus `daten` (Einstellungen der
    Baustelle) entfernen; liefert die entfernten Schlüssel (`geraete:<gid>`, `zaehler:<key>`, `stumm:<key>`)."""
    b, g = set(bereiche), set(geraete)
    weg: list[str] = []
    for gid in [x for x in daten.get("geraete") or {} if x not in g]:
        del daten["geraete"][gid]
        weg.append(f"geraete:{gid}")
    for key in [k for k in daten.get("zaehler") or {} if _weg_zaehler(k, b, g)]:
        del daten["zaehler"][key]
        weg.append(f"zaehler:{key}")
    for key in [k for k in daten.get("stumm") or {} if _weg_stumm(k, b, g)]:
        del daten["stumm"][key]
        weg.append(f"stumm:{key}")
    return weg


def hinweise_reste(issue_ids: Iterable[str], entry_id: str, geraete: Iterable[str], erwartet: Iterable[str]) -> list[str]:
    """Reparatur-Hinweise dieser Baustelle, die zu keinem Gerät bzw. keiner erwarteten Entität mehr gehören
    (`ohne_leistung_<entry>_<gid>`, `fehlt_<entry>_<entity_id>`)."""
    g, e = set(geraete), set(erwartet)
    ohne, fehlt = f"ohne_leistung_{entry_id}_", f"fehlt_{entry_id}_"
    return [i for i in issue_ids
            if (i.startswith(ohne) and i[len(ohne):] not in g) or (i.startswith(fehlt) and i[len(fehlt):] not in e)]
