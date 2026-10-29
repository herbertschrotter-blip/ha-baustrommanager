"""Heizung › Heute: welche Regeln heute greifen (AN-0019, Mockup heizung-neu.html C, Herbert 29.10.2026) – ohne HA-Code.

Bisher baute die Seite diese Sätze selbst (heizung.js `heute()`); jetzt liefert die Integration je Regel eine Zeile
`{k, ic, name, titel, text, an, kurz, gruppe}` in `laufzeit.heute`, die Seite zeigt nur an:
- `titel`/`text`: Kopf und ganzer Satz (wie bisher), `an`: greift heute (Punkt ● / ○),
- `name` und `kurz`: Name und Kurzwert der Übersichtskarte („Heizgrenze“ · „es wird geheizt“),
- `gruppe`: `zeit` · `wetter` · `strom` · `frei` (Reihenfolge = Anzeige).

Regeln: Arbeitszeit (heizt laut Plan), Heizgrenze (Bezug jetzt bzw. Höchstwert gegen die Grenze; `zu_warm` der
Integration geht vor), Kleidung trocknen (AN-0021, Text aus logik/regen), Kälte-Frühstart morgen (Vorhersage morgen gegen
die Schwelle, dazu früher nach Regen), Staffelung (nur wenn an), Frei (Urlaub/Feiertag mit dem Urlaubsmodus, sonst der
nächste Feiertag).
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date
from typing import Any

from .arbeitszeit import Plan, PlanGrund
from .start import TAGE_KURZ, zahl

GRUPPEN = ("zeit", "wetter", "strom", "frei")


@dataclass(frozen=True)
class HeuteLage:
    """Was die Regeln für heute brauchen (der Aufrufer liest es aus Einstellungen, Plan, Wetter und Staffel)."""

    plan: Plan | None = None                 # Heizplan der Baustelle heute (None = frei)
    arbeitszeit: str | None = None           # Name der gültigen Arbeitszeit
    grenze: float = 15.0                     # Heizgrenze °C
    basis: str = "max"                       # „jetzt“ oder Höchstwert des Tages
    bezug: float | None = None               # Außentemperatur, mit der verglichen wird
    zu_warm: bool | None = None              # Entscheidung der Integration (geht vor)
    trocknen: dict[str, Any] | None = None   # logik/regen.trocknen_anzeige
    morgen_kalt: float | None = None         # Tiefstwert morgen früh laut Vorhersage
    fruehstart: bool = True
    frueh_temp: float = -3.0
    frueh_min: int = 15
    morgen_nach_regen: bool = False          # Plan morgen hat „früher nach Regen“
    staffel: tuple[int, int, int, int] | None = None   # (laufen, Heizkörper, warten, höchstens zugleich); None = aus
    frei: str | None = None                  # „urlaub“ | „feiertag“ heute
    urlaub: str = "frost"                    # was an freien Tagen läuft: frost | absenk | aus
    absenk: float = 10.0
    naechster_feiertag: tuple[date, str] | None = None
    feiertag_kalender: bool = False


def _uhr(m: int) -> str:
    return f"{m // 60:02d}:{m % 60:02d}"


def _zeile(k: str, ic: str, name: str, titel: str, text: str, an: bool, kurz: str, gruppe: str) -> dict[str, Any]:
    return {"k": k, "ic": ic, "name": name, "titel": titel, "text": text, "an": an, "kurz": kurz, "gruppe": gruppe}


def regeln(l: HeuteLage) -> list[dict[str, Any]]:
    """Die Zeilen „Heute · welche Regeln greifen“ in der Reihenfolge der Anzeige."""
    pl, aus = l.plan, []
    # Arbeitszeit
    zeit = f"{_uhr(pl.a)}–{_uhr(pl.b)}" if pl else "frei"
    aus.append(_zeile("arbeitszeit", "🕖", "Arbeitszeit", f"Arbeitszeit {zeit}",
                      f"{f'„{l.arbeitszeit}“' if l.arbeitszeit else 'keine Arbeitszeit'} · heizt {f'{_uhr(pl.start)}–{_uhr(pl.ende)}' if pl else 'nicht'}",
                      pl is not None, zeit, "zeit"))
    # Heizgrenze
    zu_warm = l.zu_warm if l.zu_warm is not None else (l.bezug is not None and l.bezug > l.grenze)
    folge = "zu warm, es wird nicht geheizt" if zu_warm else "es wird geheizt"
    aus.append(_zeile("grenze", "🌡", "Heizgrenze", f"Heizgrenze {zahl(l.grenze, 0)} °C",
                      f"{'jetzt' if l.basis == 'jetzt' else 'Höchstwert heute'} {zahl(l.bezug, 0)} °C → {folge}" if l.bezug is not None else "kein Wert vom Wetter",
                      not zu_warm, folge if l.bezug is not None else "kein Wert", "wetter"))
    # Kleidung trocknen
    tr = l.trocknen
    if tr is None:
        text, an, kurz = "kein Regenwert vom Wetter", False, "kein Regenwert"
    else:
        text = f"{tr['text']}{f', bis {_uhr(pl.ende)}' if tr.get('aktiv') and pl else ''}"
        an = bool(tr.get("aktiv") or tr.get("frueher_heute_min"))
        kurz = (f"+{tr['laenger_min']} min{f' bis {_uhr(pl.ende)}' if pl else ''}" if tr.get("aktiv")
                else f"heute {tr['frueher_heute_min']} min früher" if tr.get("frueher_heute_min")
                else "kein Regenwert" if tr.get("heute_mm") is None else "nicht nötig")
    aus.append(_zeile("trocknen", "🌧", "Kleidung trocknen", "Kleidung trocknen", text, an, kurz, "wetter"))
    # Kälte-Frühstart morgen
    if l.morgen_kalt is not None:
        kalt = l.morgen_kalt < l.frueh_temp
        folge = f"{l.frueh_min} min früher" if kalt else "nicht nötig"
        nach_regen = int((tr or {}).get("frueher_morgen_min") or 0) if l.morgen_nach_regen else 0
        dazu = f", dazu {nach_regen} min nach Regen" if nach_regen else ""
        text = f"{zahl(l.morgen_kalt)} °C erwartet (unter {zahl(l.frueh_temp, 0)} °C) → {folge}{dazu}"
        aus.append(_zeile("fruehstart", "❄", "Frühstart morgen", "Kälte-Frühstart morgen", text, l.fruehstart and kalt,
                          f"{folge}{dazu}" if l.fruehstart else "aus", "wetter"))
    else:
        aus.append(_zeile("fruehstart", "❄", "Frühstart morgen", "Kälte-Frühstart morgen", "noch keine Vorhersage für morgen",
                          False, "keine Vorhersage", "wetter"))
    # Staffelung
    if l.staffel is not None:
        laufen, n, warten, hoechstens = l.staffel
        aus.append(_zeile("staffel", "⚡", "Staffelung", f"Staffelung: {laufen} von {n} Heizkörpern",
                          f"{f'{warten} wartet, weil ein Anschluss ausgelastet ist' if warten else 'alle haben Platz'} · höchstens {hoechstens} "
                          "gleichzeitig · Vorheizen startet 15 min früher, damit alle warm werden", True, f"{laufen} von {n} laufen", "strom"))
    # Frei
    if l.frei in ("urlaub", "feiertag"):
        satz = (f"heute abgesenkt auf {zahl(l.absenk)} °C (mit Fühler), sonst Frostschutz" if l.urlaub == "absenk"
                else "heute alles aus – auch kein Frostschutz" if l.urlaub == "aus" else "heute nur Frostschutz")
        titel = "Urlaub" if l.frei == "urlaub" else "Feiertag"
        aus.append(_zeile("frei", "🏖", "Frei & Feiertage", titel, satz, True, titel, "frei"))
    else:
        if l.naechster_feiertag is not None:
            t, name = l.naechster_feiertag
            text = f"nächster Feiertag {TAGE_KURZ[t.weekday()]} {t.day:02d}.{t.month:02d}. {name}"
            kurz = f"nächster {TAGE_KURZ[t.weekday()]} {t.day:02d}.{t.month:02d}."
        else:
            text = "kein Feiertag im Kalender" if l.feiertag_kalender else "kein Feiertagskalender gewählt"
            kurz = "keiner"
        aus.append(_zeile("frei", "🏖", "Frei & Feiertage", "Kein Urlaub, kein Feiertag", text, False, kurz, "frei"))
    return aus


def morgen_nach_regen(plan_morgen: Plan | None) -> bool:
    """Hat der Plan von morgen „früher nach Regen“ (AN-0021)?"""
    return plan_morgen is not None and PlanGrund.FRUEHER_NACH_REGEN in plan_morgen.gruende
