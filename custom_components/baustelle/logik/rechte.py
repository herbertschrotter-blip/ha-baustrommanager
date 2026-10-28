"""Wer auf der Seite was darf (Herbert 04.10.2026, Bauplan 0.7 §8) – ohne HA-Code.

Lesen dürfen alle HA-Benutzer, ändern nur Admins. Ausnahmen für die Bedienung vor Ort: das Gefühl am Rad, Warnungen
stumm schalten und jetzt heizen (auch „Bei Bedarf“ und schnell aufheizen). Melden darf jeder, den Status einer
Meldung ändern oder sie löschen nur Admins.
"""

from __future__ import annotations

from typing import Any

AKTIONEN_ALLE = ("gefuehl", "warnung_stumm", "jetzt_heizen", "boost", "bedarf", "bedarf_aus")
LESEN = ("struktur", "auswertung", "abrechnung", "ohne", "bericht", "protokoll", "meldungen", "statistik", "verlauf", "oeffnungen",
         "inventar", "inventar_vorschau", "inventar_kandidaten")
MELDUNG_ALLE = ("neu", "bild")


def darf(admin: bool, befehl: str, aktion: str | None = None) -> bool:
    """Darf der Benutzer den Befehl (`baustelle/<befehl>`, bei `aktion`/`meldung` mit Unteraktion) ausführen?"""
    if admin or befehl in LESEN:
        return True
    if befehl == "aktion":
        return aktion in AKTIONEN_ALLE
    if befehl == "meldung":
        return aktion in MELDUNG_ALLE
    return False


def rechte(admin: bool) -> dict[str, Any]:
    """Für die Seite: darf alles ändern, und welche Aktionen auch ohne Admin gehen."""
    return {"aendern": admin, "aktionen": list(AKTIONEN_ALLE)}
