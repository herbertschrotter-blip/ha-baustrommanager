"""Was für einen Container eingeschaltet ist – reine Fachlogik ohne Home-Assistant-Code.

Mockup `mockups/eingestellt.html`, Variante C (Herbert 28.10.2026): Im Kopf der Container-Ansicht steht zugeklappt
„⚙ 11 eingestellt ▾“, aufgeklappt je Herkunft eine Zeile Chips („nur hier“ = Container, „Baustelle“). Diese Liste
entscheidet hier, die Seite zeigt sie nur an (`laufzeit.container.<id>.eingestellt`, api-0.7):

- **Nur was an ist und den Container betrifft.** Vorheizen, Nachheizen und Kälte-Frühstart nicht bei lernenden
  Containern (Fühler + lernende Regelung, nicht Zeitplan oder Bei Bedarf – sie heizen selbst so früh, dass das Soll
  rechtzeitig erreicht ist, logik/arbeitszeit „Warm ab“); „Warm ab“ nur bei lernenden mit eigenem Wert. Bei Bedarf:
  kein Nachheizen, kein Kälte-Frühstart, keine Feiertage (Bedarf geht vor „frei“, logik/regelung), kein Trocknen
  (kein Heizplan); Vorheizen gilt vor jedem Termin. Zusatz erst ab zwei Heizkörpern, Vorrang nur ungleich „normal“ und
  mit Staffelung, Tür-Pause nur mit Tür- oder Fensterkontakt, Frostschutz ohne Fühler nur mit Außen-Grenze.
- **Wirkt es gerade?** (`wirkt`, sonst `grund`) nach der Reihenfolge von logik/regelung: Automatik aus → nur der
  Frostschutz, wenn er auch ohne Automatik gilt. Modus Hand → Frostschutz und Tür offen gehen vor, die Automatik schaltet
  sonst nichts; das Notprogramm bleibt wirksam (im Plug „nicht anfassen“, sein Frostschutz läuft weiter, logik/notprogramm)
  und sagt das im Satz. Modus Aus → nur der Frostschutz (und das Notprogramm mit seinem Frostschutz). Lernende Regelung
  im Zeitplan: wirkt nur im Modus Thermostat oder Bei Bedarf. Taste am Plug: wirkt nur mit dem Notprogramm.
- **Reihenfolge** = Anzeige: erst der Container (lernen, warm, trocknen, stufen, prio, tuer), dann die Baustelle
  (frost, vorheizen, nachheizen, fruehstart, feiertag, staffel, notprogramm, taste).
- `ziel` sagt der Seite, wohin „ändern ›“ springt; sie bildet es nur auf ihre Navigation ab: `container:<zeile>` (unten
  in der Container-Ansicht), `bearbeiten:<zeile>` (Container bearbeiten), `regeln:<zeile>` (Heizung › Regeln),
  `strom[:vorrang]` (Einstellungen › Strom), `notprogramm` (Einstellungen › Notprogramm), `urlaub` (Urlaub & Feiertage).
"""

from __future__ import annotations

from collections.abc import Mapping, Sequence
from dataclasses import dataclass, field
from typing import Any

from .regelung import FROST_SPANNE, frost_aus_wert

CONTAINER = "container"
BAUSTELLE = "baustelle"

HAND = "Gerade ohne Wirkung: im Modus Hand schaltet die Automatik nicht – nur Frostschutz und Tür offen gehen vor."
AUS = "Gerade ohne Wirkung: im Modus Aus heizt nur der Frostschutz."
AUTOMATIK_AUS = "Gerade ohne Wirkung: die Automatik der Baustelle ist aus – sie schaltet nichts."
AUTOMATIK_AUS_FROST = "Gerade ohne Wirkung: die Automatik der Baustelle ist aus – sie schaltet nur den Frostschutz."
LERNEN_ZEITPLAN = "Gerade ohne Wirkung: die lernende Regelung wirkt nur im Modus Thermostat oder Bei Bedarf."
TASTE_OHNE_NP = "Gerade ohne Wirkung: die Taste wirkt nur mit dem Notprogramm."


@dataclass(frozen=True)
class Lage:
    """Was für die Liste eines Containers zählt (Einstellungen der Baustelle und des Containers, Geräte, Sensoren)."""

    heizung: Mapping[str, Any]
    staffel: Mapping[str, Any]
    bereich: Mapping[str, Any]
    automatik: bool
    modus: str                                  # wirksamer Modus: plan | thermo | bedarf | hand | aus
    fuehler: bool
    heizkoerper: int = 0                        # aktive Heizkörper
    primaer: str | None = None                  # Name des Primärheizkörpers (Zusatz nur bei Bedarf)
    zusatz: Sequence[str] = field(default_factory=tuple)   # Namen der Zusatz-Heizkörper
    kontakte: Sequence[str] = field(default_factory=tuple)  # Namen der Türen und Fenster („Tür 1“, „Fenster 2“)


def zahl(x: float) -> str:
    """Wie die Seite: Komma, höchstens eine Nachkommastelle, echtes Minus („−3“, „1,5“)."""
    r = round(float(x), 1)
    t = str(int(r)) if r == int(r) else f"{r:.1f}".replace(".", ",")
    return t.replace("-", "−")


def _vor_t(v: int) -> str:
    return f"{v} min vor Arbeitsbeginn" if v else "bei Arbeitsbeginn"


def _nach_t(v: int) -> str:
    return f"{v} min nach Arbeitsende" if v else "bis Arbeitsende"


def lernend(lage: Lage) -> bool:
    """Heizt nach „Warm ab“ statt Vorheizen, Kälte-Frühstart und Nachheizen (Fühler, lernende Regelung, nicht Zeitplan
    oder Bei Bedarf – im Modus Hand oder Aus gilt es, sobald er wieder auf Thermostat steht)."""
    return lage.fuehler and bool(lage.bereich.get("lernen")) and lage.modus in ("thermo", "hand", "aus")


def _liste(lage: Lage) -> list[dict[str, Any]]:
    h, b, st = lage.heizung, lage.bereich, lage.staffel
    bedarf, lern = lage.modus == "bedarf", lernend(lage)
    L: list[dict[str, Any]] = []

    def dazu(k: str, ic: str, text: str, kurz: str, satz: str, von: str, ziel: str) -> None:
        L.append({"k": k, "ic": ic, "text": text, "kurz": kurz, "satz": satz, "von": von, "wirkt": True, "grund": None, "ziel": ziel})

    # ---- nur dieser Container
    if b.get("lernen") and lage.fuehler:
        satz = ("Lernt bei jedem Heizen mit: wie schnell dieser Container warm wird und wie viel er nach dem Ausschalten "
                "nachwärmt – damit er pünktlich warm ist und nicht zu warm wird.")
        if not bedarf:
            satz += " Im Modus Thermostat heizt er selbst so früh, dass das Soll rechtzeitig erreicht ist – statt Vorheizen, Kälte-Frühstart und Nachheizen."
        dazu("lernen", "🧠", "Lernende Regelung", "lernend", satz, CONTAINER, "container:lernen")
    vor_e, nach_e = b.get("warm_vor"), b.get("warm_nach")
    if lern and (vor_e is not None or nach_e is not None):
        vor_b, nach_b = int(h.get("warm_vor_min", 0)), int(h.get("warm_nach_min", 0))
        teile: list[str] = []
        texte: list[str] = []
        kurz: list[str] = []
        if vor_e is not None:
            teile.append(f"Das Soll ist {_vor_t(int(vor_e))} erreicht, z. B. zum Umziehen (die Baustelle: {_vor_t(vor_b)})")
            texte.append(f"warm {int(vor_e)} min vor Beginn" if vor_e else "warm bei Beginn")
            kurz.append(f"−{int(vor_e)} min" if vor_e else "bei Beginn")
        if nach_e is not None:
            teile.append(f"warm gehalten wird {_nach_t(int(nach_e))} (die Baustelle: {_nach_t(nach_b)})")
            texte.append(f"warm {int(nach_e)} min länger" if nach_e else "warm bis Ende")
            kurz.append(f"+{int(nach_e)} min" if nach_e else "bis Ende")
        dazu("warm", "⏱", " · ".join(texte), " · ".join(kurz), "Eigener Wert dieses Containers: " + "; ".join(teile) + ".",
             CONTAINER, "bearbeiten:warm")
    if b.get("trocknen") and not bedarf:
        dazu("trocknen", "👕", "Kleidung trocknen", "trocknen",
             f"Nach Regen ab {zahl(h.get('trocknen_ab_mm', 2))} mm heizt dieser Container {int(h.get('trocknen_laenger_min', 45))} min "
             f"länger nach der Arbeit und am nächsten Morgen {int(h.get('trocknen_frueher_min', 15))} min früher.",
             CONTAINER, "container:trocknen")
    if b.get("stufen") and lage.heizkoerper >= 2:
        erst = f"der Primärheizkörper ({lage.primaer})" if lage.primaer else "der Primärheizkörper"
        wer = ", ".join(lage.zusatz) if lage.zusatz else "der Zusatz"
        dazu("stufen", "🔥", "Zusatz nur bei Bedarf", "Zusatz",
             f"Zuerst heizt {erst}; {wer} {'kommen' if len(lage.zusatz) > 1 else 'kommt'} dazu, wenn es draußen unter "
             f"{zahl(h.get('stufen_kalt', -5))} °C hat, der Raum mehr als {zahl(h.get('stufen_abstand', 1.5))} °C unter dem Soll ist "
             f"oder einer nach {int(h.get('stufen_min', 30))} min nicht reicht.", CONTAINER, "bearbeiten:stufen")
    prio = b.get("prio") or "normal"
    if prio in ("hoch", "niedrig") and st.get("an", True):
        dazu("prio", "⬆" if prio == "hoch" else "⬇", f"Vorrang {prio}", "Vorrang" if prio == "hoch" else "später",
             "Dürfen nicht alle Heizkörper zugleich (Staffelung), kommt dieser Container "
             + ("vor den anderen dran." if prio == "hoch" else "nach den anderen dran.") + " Frostschutz geht immer vor.",
             CONTAINER, "strom:vorrang")
    if lage.kontakte:
        pause, melden = int(h.get("tuer_pause_min", 3)), int(h.get("tuer_melden_min", 10))
        namen = ", ".join(f"„{n}“" for n in lage.kontakte)
        was = "die Tür" if len(lage.kontakte) == 1 and lage.kontakte[0].startswith("Tür") else "eine Tür oder ein Fenster"
        dazu("tuer", "🚪", f"Tür-Pause {pause} min", f"Tür {pause}′",
             f"{'Kontakt' if len(lage.kontakte) == 1 else 'Kontakte'} {namen}: Ist {was} offen, pausiert die Heizung nach "
             f"{pause} min; nach {melden} min kommt eine Nachricht.", CONTAINER, "regeln:tuer")

    # ---- Baustelle (gilt für alle Container)
    if h.get("frost", True):
        immer = " – auch wenn die Automatik aus ist" if h.get("frost_immer") else ""
        if lage.fuehler:
            g = float(h.get("frost_grenze", 5))
            aus = frost_aus_wert(g, h.get("frost_aus"))
            wann = ("nachts und am Wochenende" if h.get("frei_modus") == "aus" else "nachts, am Wochenende und im Urlaub")
            dazu("frost", "❄", f"Frostschutz unter {zahl(g)}°", f"{zahl(g)}°",
                 f"Hält den Container auch {wann} über {zahl(g)} °C (aus erst über {zahl(aus)} °C){immer}.", BAUSTELLE, "regeln:frost")
        elif h.get("frost_aussen") is not None:
            g = float(h["frost_aussen"])
            dazu("frost", "❄", f"Frostschutz unter {zahl(g)}° außen", f"{zahl(g)}° außen",
                 f"Ohne Fühler: Ist es draußen kälter als {zahl(g)} °C, heizt der Container (aus erst ab {zahl(g + FROST_SPANNE)} °C), "
                 f"der Heizkörperthermostat regelt dann selbst{immer}.", BAUSTELLE, "regeln:frost")
    vh = int(h.get("vorheizen_min", 0) or 0)
    if vh and not lern:
        dazu("vorheizen", "🌅", f"Vorheizen {vh} min", f"{vh}′ vor",
             f"Heizt {vh} min vor jedem Termin an." if bedarf else f"Heizt jeden Arbeitstag {vh} min vor Arbeitsbeginn an, damit es warm ist, wenn es losgeht.",
             BAUSTELLE, "regeln:vorheizen")
    nh = int(h.get("nachheizen_min", 0) or 0)
    if nh and not lern and not bedarf:
        dazu("nachheizen", "🌇", f"Nachheizen {nh} min", f"{nh}′ nach", f"Heizt nach Arbeitsende noch {nh} min weiter.",
             BAUSTELLE, "regeln:nachheizen")
    if h.get("fruehstart") and not lern and not bedarf:
        fm = int(h.get("fruehstart_min", 30))
        dazu("fruehstart", "⏰", f"Kälte-Frühstart +{fm} min", f"+{fm}′ kalt",
             f"Ist es morgens kälter als {zahl(h.get('fruehstart_unter', 0))} °C, heizt der Container zusätzlich {fm} min früher an.",
             BAUSTELLE, "regeln:fruehstart")
    if h.get("feiertag_frei") and not bedarf:
        fm = h.get("frei_modus", "frost")
        if fm == "absenk" and lage.fuehler:
            ab = zahl(h.get("absenk", 10))
            dazu("feiertag", "🏖", f"Feiertage frei · absenken {ab}°", f"frei {ab}°",
                 f"An Feiertagen und im Urlaub wird nicht geheizt; der Container hält dann {ab} °C.", BAUSTELLE, "urlaub")
        elif fm == "aus":
            dazu("feiertag", "🏖", "Feiertage frei · alles aus", "frei aus",
                 "An Feiertagen und im Urlaub ist alles aus – auch der Frostschutz.", BAUSTELLE, "urlaub")
        else:
            dazu("feiertag", "🏖", "Feiertage frei", "frei",
                 "An Feiertagen und im Urlaub wird nicht geheizt, nur der Frostschutz läuft.", BAUSTELLE, "urlaub")
    if st.get("an", True):
        dazu("staffel", "⚡", "Staffelung", "Staffel",
             f"Die Heizkörper teilen sich den Anschluss: {int(st.get('nutzbar_prozent', 67))} % je Anschluss nutzbar, höchstens "
             f"{int(st.get('max_gleichzeitig', 5))} zugleich; wer wartet, kommt im Rundlauf dran.", BAUSTELLE, "strom")
    if h.get("notprogramm"):
        satz = "Fallen Home Assistant oder das Netz aus, heizen die Plugs dieses Containers nach dem Programm der nächsten 7 Tage weiter."
        if lage.modus == "hand":
            satz = ("Fallen Home Assistant oder das Netz aus, lassen die Plugs dieses Containers im Modus Hand die Heizung, "
                    "wie sie ist – nur der Frostschutz läuft im Plug weiter.")
        elif lage.modus == "aus":
            satz = "Fallen Home Assistant oder das Netz aus, halten die Plugs dieses Containers im Modus Aus nur den Frostschutz."
        dazu("notprogramm", "🛟", "Notprogramm", "Not", satz, BAUSTELLE, "notprogramm")
    if h.get("taste"):
        dazu("taste", "🔘", "Taste = 1 h heizen", "Taste",
             "Drücken der Taste am Plug heizt den Container 1 h (mit Fühler bis zum Soll), nochmal drücken beendet – auch ohne Home Assistant.",
             BAUSTELLE, "notprogramm")
    return L


def _grund(lage: Lage, k: str) -> str | None:
    """Warum eine eingeschaltete Einstellung gerade nicht wirkt (None = wirkt); Reihenfolge wie logik/regelung."""
    h = lage.heizung
    if not lage.automatik:
        frost_immer = bool(h.get("frost_immer")) and bool(h.get("frost", True))
        if k == "frost" and frost_immer:
            return None
        return AUTOMATIK_AUS_FROST if frost_immer else AUTOMATIK_AUS
    if lage.modus == "hand":
        return None if k in ("frost", "tuer", "notprogramm") else HAND
    if lage.modus == "aus":
        return None if k in ("frost", "notprogramm") else AUS
    if k == "lernen" and lage.modus not in ("thermo", "bedarf"):
        return LERNEN_ZEITPLAN
    if k == "taste" and not h.get("notprogramm"):
        return TASTE_OHNE_NP
    return None


def eingestellt(lage: Lage) -> list[dict[str, Any]]:
    """Eingeschaltete Einstellungen eines Containers für die Seite: `[{k, ic, text, kurz, satz, von, wirkt, grund, ziel}]`."""
    L = _liste(lage)
    for x in L:
        g = _grund(lage, x["k"])
        x["wirkt"], x["grund"] = g is None, g
    return L
