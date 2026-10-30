"""Texte für Warnungen, Handy-Nachrichten und das Protokoll – wörtlich wie im abgenommenen Mockup, wo es sie gibt.

Mockup `mockups/quelle/glas-app.js`: Daten `warnungen` (Feld `hilfe`), Einblendung „nachrichten“, Daten `protokoll`.
Ohne HA-Code, damit die Seite dieselben Texte aus `baustelle/struktur` bekommt.
"""

from __future__ import annotations

from datetime import date, datetime

from .logik.regelung import SollGrund
from .logik.warnungen import Art, Warnung, _zahl, titel

HILFE: dict[str, str] = {
    Art.OFFLINE: "Shelly antwortet nicht. Stecker und Sicherung prüfen – bei Stromausfall meldet er sich von selbst zurück.",
    Art.BAUSTELLE_OFFLINE: "Kein Gerät der Baustelle antwortet. Stromausfall oder Internet weg? Nach dem Ausfall melden sich die Shellys von selbst zurück.",
    Art.TROCKENLAUF: "Die Pumpe läuft, zieht aber zu wenig Strom. Schacht leer oder Ansaugung verstopft?",
    Art.DAUERLAUF: "Die Pumpe läuft ohne Pause. Schwimmer hängt oder starker Zufluss?",
    Art.ZYKLEN_OFT: "Üblich sind hier 3–5. Schwimmer prüfen – oder das Grundwasser steigt.",
    Art.KEINE_LEISTUNG: "Eingeschaltet, aber der Heizkörper zieht keinen Strom. Heizkörper-Schalter oder Thermostat am Gerät prüfen.",
    Art.FROSTGEFAHR: "Unter der Frostgrenze ({grenze} °C), obwohl der Frostschutz heizt. Tür offen? Heizkörper prüfen.",
    Art.ZU_KALT: "Erreicht in der Arbeitszeit das Soll nicht. Tür oder Fenster offen? Heizkörper zu schwach?",
    Art.FUEHLER_FEHLT: "Der Temperaturfühler meldet nichts oder die Batterie ist fast leer. Ohne Fühler bleibt die Heizung in der Heizzeit an.",
    Art.KEIN_WETTER: "Keine Vorhersage – Frühstart, Kleidung trocknen und Heizgrenze rechnen ohne Wetter.",
    Art.HAND_ZU_LANGE: "Von Hand eingeschaltet und nicht zurückgestellt. Soll wieder die Automatik übernehmen?",
    Art.NOTPROGRAMM: "Der Plug nimmt das Notprogramm nicht an. Fällt Home Assistant jetzt aus, heizt er nach dem zuletzt geladenen Programm bzw. danach nur Frostschutz. Einstellungen › Notprogramm › Jetzt prüfen; hilft das nicht, den Plug neu starten.",
    Art.SELBST_EIN: "Das Gerät schaltet sich immer wieder selbst ein, die Automatik muss es ständig ausschalten. Am Shelly einen Timer „Auto ON“ (automatisch einschalten) oder einen Zeitplan prüfen und abschalten.",
    Art.TUER_OFFEN: "Heizt wieder, sobald die Tür zu ist. Nach {melden} min kommt eine Nachricht aufs Handy.",
}

SYMBOL: dict[str, str] = {Art.TUER_OFFEN: "🚪", Art.HAND_ZU_LANGE: "✋", Art.FROSTGEFAHR: "❄"}


def hilfe(w: Warnung, tuer_melden_min: float = 10) -> str:
    """Hilfetext einer Warnung (Mockup `hilfe`)."""
    text = HILFE.get(w.art, "")
    if w.art == Art.TUER_OFFEN and not w.werte.get("pausiert", True):
        text = "Gerade wird nicht geheizt – ein Hinweis, falls die Tür nicht offen bleiben soll. Nach {melden} min kommt eine Nachricht aufs Handy."
    return text.format(grenze=_zahl(w.werte.get("grenze", 5), 0), melden=int(tuer_melden_min))


def uhr(zeit: datetime) -> str:
    return zeit.strftime("%H:%M")


def nachricht(w: Warnung, bereich_name: str | None) -> tuple[str, str]:
    """Titel und Text der Handy-Nachricht (Mockup „Nachrichten aufs Handy“)."""
    ort = bereich_name or "Baustelle"
    name = w.werte.get("name") or ""
    match w.art:
        case Art.OFFLINE:
            wer = f"{name} ({ort})" if name else ort
            return f"⚠ {wer} nicht erreichbar", f"Seit {uhr(w.seit)} keine Antwort – Stromausfall oder Stecker gezogen?"
        case Art.BAUSTELLE_OFFLINE:
            return "⚠ Baustelle nicht erreichbar", f"Seit {uhr(w.seit)} antwortet kein Gerät – Stromausfall oder Internet weg?"
        case Art.TUER_OFFEN:
            return (
                f"🚪 {ort}: Tür seit {w.werte.get('minuten', 0)} min offen",
                "Die Heizung ist pausiert und heizt wieder, sobald die Tür zu ist." if w.werte.get("pausiert", True)
                else "Es wird gerade nicht geheizt – bitte prüfen, ob die Tür offen bleiben soll.",
            )
        case Art.HAND_ZU_LANGE:
            stunden = int(w.werte.get("stunden", 0))
            dauer = f"{stunden // 24} {'Tag' if stunden // 24 == 1 else 'Tagen'}" if stunden >= 24 else f"{stunden} h"
            return f"✋ {name or 'Gerät'} {ort} seit {dauer} auf Hand", "Von Hand eingeschaltet und nicht zurückgestellt."
    return f"{SYMBOL.get(w.art, '⚠')} {ort}: {titel(w)}", hilfe(w)


def wieder_ok(w: Warnung) -> str:
    """Protokolltext, wenn ein Problem vorbei ist (Mockup „wieder erreichbar“, „Pumpe 1 wieder normal“)."""
    name = w.werte.get("name") or ""
    match w.art:
        case Art.OFFLINE | Art.BAUSTELLE_OFFLINE:
            return f"{name} wieder erreichbar".strip()
        case Art.TROCKENLAUF | Art.DAUERLAUF | Art.ZYKLEN_OFT:
            return f"{name or 'Pumpe'} wieder normal"
        case Art.NOTPROGRAMM:
            return f"{name or 'Plug'}: Notprogramm wieder bereit"
        case Art.TUER_OFFEN:
            return "Tür zu – Heizung läuft weiter" if w.werte.get("pausiert", True) else "Tür wieder zu"
    return f"wieder in Ordnung: {titel(w)}"


def protokoll_warnung(w: Warnung) -> str:
    """Protokolltext einer neuen Warnung (Mockup: „Frostgefahr: 4,2 °C trotz Frostschutz“)."""
    if w.art == Art.FROSTGEFAHR:
        return f"{titel(w)} trotz Frostschutz"
    return titel(w)


# Protokoll und Kacheln: Grund, aus dem ein Bereich gerade heizt oder nicht (logik/regelung.SollGrund)
GRUND_TEXT: dict[str, str] = {
    SollGrund.FRUEHSTART: "Frühstart",
    SollGrund.VORHEIZEN: "Vorheizen",
    SollGrund.ARBEITSZEIT: "Arbeitszeit",
    SollGrund.NACHHEIZEN: "Nachheizen",
    SollGrund.TROCKNEN: "Kleidung trocknen",
    SollGrund.BEDARF: "Bei Bedarf",
    SollGrund.BOOST: "Schnell aufheizen",
    SollGrund.TASTE: "Taste am Plug · 1 h heizen",
    SollGrund.BASELINE: "Baseline-Messung · ohne Automatik",
    SollGrund.FROST: "Frostschutz",
    SollGrund.TUER_OFFEN: "Tür offen – Heizung pausiert",
    SollGrund.BEREIT: "Bedarf vorbei",
    SollGrund.FREI: "Frei",
    SollGrund.HEIZGRENZE: "Heizgrenze",
    SollGrund.AUSSERHALB: "Heizzeit vorbei",
    SollGrund.AUS: "Aus – nur Frostschutz",
    SollGrund.ABSENKEN: "Abgesenkt",
    SollGrund.STOERUNG: "Störung – nur Frostschutz",
}
TAGE_KURZ = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"]


def wochentag(tag: date) -> str:
    return TAGE_KURZ[tag.weekday()]
