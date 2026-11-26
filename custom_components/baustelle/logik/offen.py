"""Was fehlt noch – reine Fachlogik ohne Home-Assistant-Code.

UI-Bericht M15 (Mockup `mockups/was-fehlt.html`, abgenommen 26.11.2026): Karte „Was fehlt noch“ ganz unten in der
Übersicht. Diese Liste entscheidet hier, die Seite zeigt sie nur an (`laufzeit.offen`); leer = keine Karte.

- **Fühler:** Container im Modus Thermostat oder Bei Bedarf ohne Temperaturfühler – beide regeln ohne Fühler nur nach
  Zeitplan (logik/prognose_merkmale „Regelungsart“). Ziel `fuehler` mit `bereich` (Assistent „+ Gerät“ für den Container).
- **Freier Shelly:** ein Shelly-Schalter in Home Assistant, den keine Baustelle verwendet (wie Schritt 1 des Assistenten);
  andere Schalter (Saugroboter, Mäher …) zählen nicht, ebenso wenig ein freier Kanal eines Shellys, von dem schon ein
  Kanal auf einer Baustelle steckt (2PM, Pro 4PM). Je Gerät ein Punkt. „seit“ vor 2000 = unbekannt (HA setzt für alte
  Geräte 1970). Ziel `zuordnen` mit `device_id` und `schalter` (Assistent mit dem Gerät gewählt).
- **Namen:** Container, deren Namen in Home Assistant vom Schema abweichen (Inventar, Chip „⚠ n weichen ab“).
  Ziel `namen` mit `bereich` (Container-Seite › Namen in HA).
- **Nur mit Heizung:** Fühler- und Notprogramm-Punkte nur, wenn die Funktion Heizung an ist.
- **Notprogramm:** ist es eingeschaltet, ein Heizkörper-Plug, der es nicht tragen kann (kein Shelly Gen2+, kein Skript).
  Ziel `notprogramm`.
- **Wetter:** keine Wetter-Entität eingestellt, obwohl eine Funktion sie braucht (Heizung, wie die Warnung
  „kein Wetter“) – ohne sie kein Wetter in der Auswertung und keine Vorhersage für den Frühstart. Ziel `wetterquelle`.

Reihenfolge = Anzeige: Fühler, freie Shellys, Namen, Notprogramm, Wetter; innerhalb nach Name.
"""

from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass
from datetime import datetime

MODUS_MIT_FUEHLER = {"thermo": ("Thermostat", "ohne ihn regelt er nur nach Zeitplan"),
                     "bedarf": ("Bei Bedarf", "ohne ihn heizt er bei Bedarf durch, ohne aufs Soll zu achten")}
SEIT_AB = 2000   # früher = unbekannt (Geräteregister alter HA-Stände: 1970-01-01)


@dataclass(frozen=True)
class Container:
    id: str
    name: str
    modus: str | None
    fuehler: bool
    abweichend: int | None = None   # Namen, die vom Schema abweichen (None = unbekannt, ohne Inventar)


@dataclass(frozen=True)
class FreierSchalter:
    device_id: str
    schalter: str
    name: str
    seit: datetime | None = None
    shelly: bool = True
    kanal_belegt: bool = False   # ein anderer Kanal desselben Geräts steckt schon auf einer Baustelle


@dataclass(frozen=True)
class Plug:
    id: str
    name: str


def _seit(seit: datetime | None, jetzt: datetime) -> str:
    if seit is None or seit.year < SEIT_AB:
        return "in Home Assistant, keinem Container zugeordnet"
    if seit.date() == jetzt.date():
        return f"neu in HA seit heute {seit:%H:%M}"
    return f"in HA seit {seit:%d.%m.%Y}"


def _name(x: Container | FreierSchalter | Plug) -> str:
    return x.name.casefold()


def offen(container: Sequence[Container], freie: Sequence[FreierSchalter], plugs_ohne: Sequence[Plug], *,
          heizung: bool, notprogramm_an: bool, wetter: bool, braucht_wetter: bool, jetzt: datetime) -> list[dict[str, str]]:
    """Die Punkte der Karte, fertig zum Anzeigen: key, ic, titel, text, los (Knopf), ziel (dazu bereich bzw.
    device_id und schalter). `jetzt` und `seit` in
    derselben Zeitzone (der der Baustelle)."""
    aus: list[dict[str, str]] = []
    reihe = sorted(container, key=_name)
    for c in reihe:
        if heizung and c.modus in MODUS_MIT_FUEHLER and not c.fuehler:
            modus, folge = MODUS_MIT_FUEHLER[c.modus]
            aus.append({"key": f"fuehler:{c.id}", "ic": "🌡", "titel": f"{c.name} hat keinen Temperaturfühler",
                        "text": f"Modus „{modus}“ braucht einen – {folge}",
                        "los": "Fühler zuordnen ›", "ziel": "fuehler", "bereich": c.id})
    je_geraet: dict[str, FreierSchalter] = {}
    for s in freie:
        if s.shelly and not s.kanal_belegt:
            je_geraet.setdefault(s.device_id, s)
    for s in sorted(je_geraet.values(), key=_name):
        aus.append({"key": f"zuordnen:{s.device_id}", "ic": "🔌", "titel": f"{s.name} gehört zu keinem Container",
                    "text": _seit(s.seit, jetzt), "los": "Zuordnen ›", "ziel": "zuordnen",
                    "device_id": s.device_id, "schalter": s.schalter})
    for c in reihe:
        if c.abweichend:
            n = c.abweichend
            aus.append({"key": f"namen:{c.id}", "ic": "🏷",
                        "titel": f"{c.name}: {n} {'Name weicht' if n == 1 else 'Namen weichen'} ab",
                        "text": "in Home Assistant anders benannt als nach dem Schema", "los": "Einheitlich benennen ›",
                        "ziel": "namen", "bereich": c.id})
    if heizung and notprogramm_an:
        for p in sorted(plugs_ohne, key=_name):
            aus.append({"key": f"notprogramm:{p.id}", "ic": "🛟", "titel": f"{p.name} hat kein Notprogramm",
                        "text": "kein Shelly Gen2+ – kann kein Skript, heizt bei Ausfall von HA nicht selbst",
                        "los": "Ansehen ›", "ziel": "notprogramm"})
    if braucht_wetter and not wetter:
        aus.append({"key": "wetter", "ic": "🌦", "titel": "Keine Wetter-Entität eingestellt",
                    "text": "ohne sie kein Wetter in der Auswertung und keine Vorhersage für den Frühstart",
                    "los": "Einstellen ›", "ziel": "wetterquelle"})
    return aus
