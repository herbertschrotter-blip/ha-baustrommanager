"""Staffelung der Heizungen je Stromanschluss – reine Fachlogik ohne Home-Assistant-Code.

Vorbild ist das abgenommene Mockup (`mockups/quelle/glas-app.js`, `last()` und die Einblendung „Stromverteilung“):

    Je Anschluss gilt: nutzbar % der Anschlussleistung minus Reserve minus alles, was schon läuft.
    Ein Heizkörper kommt erst dazu, wenn eine Minute lang genug frei ist. Jeder läuft mindestens `min_lauf` min
    und pausiert mindestens `min_pause` min; dürfen nicht alle, wechseln sie alle `takt` min –
    wer am weitesten unter dem Soll ist, zuerst.

Geschaltet werden nur Heizer (Ölradiator, Konvektor). Pumpen, Steckdosen und Trockner zählen nur mit.
Leistungen in kW, Dauern in Minuten. `staffeln` wird regelmäßig (z. B. jede Minute) aufgerufen und liefert den
Soll-Zustand aller Heizer nach diesem Schritt.

Ablauf eines Schritts:

1. Heizer, die laut Regelung nicht heizen sollen (`will` falsch), gehen aus – ohne Staffel-Grund.
2. Überlast (`frei < 0`): je Anschluss sofort den zuletzt eingeschalteten Heizer aus, auch vor der Mindestlaufzeit;
   zuerst normale, dann Boost-, zuletzt Frost-Heizer.
3. Laufen mehr als `max_gleichzeitig`: die überzähligen (zuletzt eingeschaltete zuerst) nach der Mindestlaufzeit aus;
   Frost/Boost zuletzt.
4. Wartende in der Reihenfolge Frost > Boost > Priorität > größtes Defizit > längste Wartezeit einschalten, solange
   Platz ist (`frei_stabil_kw`), höchstens `max_gleichzeitig`, höchstens `neue_je_schritt` neue je Aufruf.
   Passt ein Wartender nicht, tauscht der Rundlauf: der am längsten laufende Heizer (mindestens `takt_min`) geht aus.

Entscheidungen, wo der Bauplan (Abschnitt 2.3) offen ist – jeweils im Sinne des Mockups:

- Mindestlaufzeit schützt nur vor Abschalten *durch die Staffelung* (Rundlauf, `max_gleichzeitig`). Will die Regelung
  aus (Tür offen, Arbeitsende, Thermostat), geht der Heizer sofort aus. Bei Überlast gilt sie nicht (Bauplan).
- Rundlauf tauscht nur, wenn der Wartende nicht schlechter eingestuft ist (Frost, Boost, Priorität) als der Laufende;
  innerhalb derselben Stufe wird reihum getauscht. Frost- und Boost-Heizer werden nicht im Rundlauf herausgetauscht.
- Vorrang (Mockup: „Schnell aufheizen … Vorrang in der Staffelung“): ein wartender Frost-/Boost-Heizer verdrängt einen
  normalen Heizer schon nach dessen Mindestlaufzeit, nicht erst nach `takt_min`.
- Frost hat Vorrang vor Boost: ein wartender Frost-Heizer verdrängt nach der Mindestlaufzeit auch einen Boost-Heizer
  (Reihenfolge Frost > Boost aus dem Bauplan). Laufende Frost-Heizer werden nie getauscht.
- Ein Tausch geschieht nur, wenn der Wartende danach wirklich Platz hat – sonst bliebe der Anschluss ungenutzt.
- Zusätzlicher Wartegrund „anlauf“: Platz wäre da, aber in diesem Schritt wurden schon `neue_je_schritt` eingeschaltet.
- „rundlauf“ heißt: wartet auf den nächsten Tausch; `dran_in_min` sagt wann (Mockup „wartet – dran in 6 min“).
  Auch „mindestpause“ bekommt `dran_in_min`. Das Feld ist eine Ergänzung zu Bauplan 2.3.
- `max_gleichzeitig` gilt über alle Anschlüsse (Mockup: „x von y Heizkörpern an · höchstens 5“).
- Ohne Fühler (`defizit` None) zählt das Defizit als 0.
- Ein Heizer an einem unbekannten Anschluss wird nicht gestaffelt: er folgt `will` und zählt nicht mit.
- `frei_stabil_kw`: fehlt ein Anschluss oder ist sein Wert None (noch keine Messung), gilt der freie Platz von jetzt.
- Vergleiche mit dem freien Platz rechnen mit einer Toleranz von `TOLERANZ_KW`, damit Rundungsreste der Kommazahlen
  einen genau passenden Heizer weder abwerfen noch sperren (sonst pendelt er an der Grenze an/aus).
- `frei_kw` ist der freie Platz nach den Schaltungen dieses Schritts (ohne `frei_stabil_kw`).
- Der Schalter „Staffelung aus“ (`staffel.an`) ist Sache des Aufrufers: ohne Staffelung folgen die Heizer `will`.
- **Einer je Container zuerst** (AN-0013, Herbert 01.10.2026): einschalten darf zuerst ein Container, in dem noch kein
  Heizer läuft (nach Frost und Boost, vor Priorität und Defizit); ein Zweitgerät verdrängt im Rundlauf nie den einzigen
  laufenden Heizer eines anderen Containers; abgegeben und abgeworfen werden zuerst Zweitgeräte. Ohne `gruppe` gilt
  das nicht.
- **Bedarf in °C** (Herbert 01.10.2026, `logik/bedarf`): `defizit` ist der Bedarf in 15 min (Trend, Nachlauf,
  Zielzeit, Gerechtigkeit). Innerhalb einer Stufe kommt der höhere Bedarf zuerst; abgeworfen und abgegeben wird der
  unterste – bei gleichem Rang der größere Verbraucher (weniger Schaltungen). Der Rundlauf tauscht weiter jeden Takt:
  der oberste Wartende gegen den untersten Laufenden (so kommt jeder Container dran).
- **Überlast erst nach `UEBERLAST_S`** (Vorbild Lastmanager): der Aufrufer sagt je Anschluss, ob abgeworfen werden darf
  (`abwerfen`); solange nicht, wird dort nur nichts Neues eingeschaltet.
- Gerechnet wird mit dem **gemessenen** Verbrauch (FE-0011, Herbert 01.10.2026): ein eingeschalteter Heizkörper, dessen
  Thermostat gerade abgeschaltet hat, zählt mit dem, was er zieht (`last_kw`). Springt er wieder an und der Anschluss
  wird zu voll, geht sofort der zuletzt eingeschaltete aus (Schritt 2) und die Heizkörper wechseln im Rundlauf.
  Wer dazukommen will, zählt mit seiner vollen Leistung; ein eben eingeschalteter die ersten `ANLAUF_MIN` Minuten
  ebenso, bis die Messung nachkommt.
- **Harte Grenze nach Nennleistung** (Audit 0.8.165): ein satter Heizer zieht gerade nichts, springt sein Thermostat
  an, zieht er voll – springen alle gleichzeitig an, wäre der Anschluss weit über der Absicherung. Darum kommt ein
  Heizer nur dazu, wenn alle laufenden Heizer mit ihrer Nennleistung (`nenn_kw`), die übrigen Lasten und die Reserve
  zusammen unter `hart_kw` bleiben (100 % der Absicherung). Abgeworfen wird dafür nicht – nur nichts Neues eingeschaltet.
  Phasen und Steckdosenkreise bildet die Staffelung nicht ab: bei Drehstrom gilt die Summe über alle Phasen.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from enum import StrEnum
from collections.abc import Collection
from typing import Any

SPANNUNG_V = 230
UEBERLAST_S = 30    # so lange darf ein Anschluss zu voll sein, bevor abgeworfen wird (kurze Spitzen ignorieren)
ANLAUF_MIN = 2      # so lange zählt ein eben eingeschalteter Heizer mindestens mit seiner vollen Leistung (FE-0011)
TOLERANZ_KW = 1e-6  # 1 mW: Rundungsreste der Kommazahlen, keine Messgenauigkeit


class Warten(StrEnum):
    """Warum ein Heizer, der heizen will, gerade nicht darf."""

    ANSCHLUSS_VOLL = "anschluss_voll"
    MAX_GLEICHZEITIG = "max_gleichzeitig"
    MINDESTPAUSE = "mindestpause"
    RUNDLAUF = "rundlauf"
    ANLAUF = "anlauf"


class Prio:
    """Priorität eines Containers (Bauplan: 0 niedrig, 1 normal, 2 hoch)."""

    NIEDRIG = 0
    NORMAL = 1
    HOCH = 2


@dataclass(frozen=True)
class Anschluss:
    """Ein Baustromverteiler: nutzbare Grenze und Reserve für Ungemessenes (Kran, Werkzeug)."""

    id: str
    grenze_kw: float
    reserve_kw: float
    hart_kw: float | None = None   # volle Absicherung (Grenze nach Nennleistung); None = ohne


@dataclass(frozen=True)
class Last:
    """Ein Gerät an einem Anschluss. Nur `heizer` werden geschaltet; alle anderen zählen nur mit.

    `an`: läuft gerade. `will`: Regelung will heizen. `defizit`: Soll minus Ist in °C (None ohne Fühler).
    `gruppe`: Container des Geräts – im Rundlauf wird nie gegen ein Gerät desselben Containers getauscht (der Raum
    gewönne nichts).
    """

    id: str
    anschluss: str
    kw: float
    heizer: bool
    an: bool
    will: bool = False
    prio: int = Prio.NORMAL
    frost: bool = False
    boost: bool = False
    defizit: float | None = None
    an_seit_min: float = 0.0
    aus_seit_min: float = 1e9
    wartet_seit_min: float = 0.0
    gruppe: str = ""
    im_plan: bool = False   # AN-0017: laut Plan gerade dran (Automatik an, Heizzeit läuft) – auch wer satt ist
    ruht: str = ""          # warum ein Heizer im Plan gerade nicht heizen will (Ruhe: satt, tuer_offen, zurueckgehalten)
    nenn_kw: float | None = None   # Nennleistung für die harte Grenze (None = `kw`)


@dataclass(frozen=True)
class StaffelRegeln:
    """Einstellungen der Staffelung."""

    max_gleichzeitig: int = 5
    min_lauf_min: float = 10
    min_pause_min: float = 5
    takt_min: float = 15
    neue_je_schritt: int = 1


@dataclass(frozen=True)
class StaffelErgebnis:
    """Soll-Zustand nach einem Schritt: `an` = Heizer, die laufen sollen; `wartet` = Grund je wartendem Heizer."""

    an: frozenset[str]
    wartet: dict[str, str]
    frei_kw: dict[str, float]
    dran_in_min: dict[str, float] = field(default_factory=dict)


def grenze_kw(ampere: float, phasen: int, nutzbar_prozent: float) -> float:
    """Nutzbare Grenze eines Anschlusses: Ampere · 230 V · Phasen · nutzbar % (in kW)."""
    return ampere * SPANNUNG_V * phasen / 1000 * nutzbar_prozent / 100


def anschluss(id: str, ampere: float, phasen: int, reserve_kw: float, nutzbar_prozent: float = 67) -> Anschluss:
    """Anschluss aus den Einstellungen (Absicherung, Phasen, Reserve) und „nutzbar je Anschluss“."""
    return Anschluss(id=id, grenze_kw=grenze_kw(ampere, phasen, nutzbar_prozent), reserve_kw=reserve_kw,
                     hart_kw=grenze_kw(ampere, phasen, 100))


def _nenn(last: Last) -> float:
    """Womit ein Gerät gegen die harte Grenze zählt: Heizer mit der Nennleistung, alle anderen wie gemessen."""
    return max(last.kw, last.nenn_kw) if last.heizer and last.nenn_kw is not None else last.kw


def last_kw(gemessen_w: float | None, nenn_kw: float, an: bool, an_seit_min: float) -> float:
    """Womit ein schaltbarer Heizer in der Staffelung zählt (FE-0011): läuft er, mit der gemessenen Leistung – in den
    ersten `ANLAUF_MIN` Minuten mindestens mit der vollen; ohne Messung und wenn er erst dazukommen will, voll."""
    if not an or gemessen_w is None:
        return nenn_kw
    gemessen = max(0.0, gemessen_w) / 1000
    return max(gemessen, nenn_kw) if an_seit_min < ANLAUF_MIN else gemessen


def gesperrt(will: bool, erreichbar: bool, laeuft: bool, wartegrund: str | None) -> bool | None:
    """Tatsächliches Staffelungs-Veto eines Geräts nach einem Schritt (Prognose V2, BSM-033.06) – nur beobachtet.

    Gesperrt ist ein Gerät, das die Regelung einschalten will (`will`), das aber nach Staffelung und Anlaufstaffel nicht
    laufen darf. Ohne Wunsch kein Veto – auch offline (sonst machte ein dauerhaft offline Gerät die Sperre seines
    Containers immer unbekannt). Mit Wunsch entscheidet die Staffelung ein nicht erreichbares Gerät nicht (None =
    unbekannt). Die Mindestpause ist kein Veto der Staffelung, sondern Schutz des Geräts.
    """
    if not will:
        return False
    if not erreichbar:
        return None
    return not laeuft and wartegrund != Warten.MINDESTPAUSE


def frei_je_anschluss(anschluesse: list[Anschluss], lasten: list[Last]) -> dict[str, float]:
    """Freier Platz je Anschluss: Grenze − Reserve − alles, was läuft (Heizer, Pumpen, Steckdosen)."""
    return {
        a.id: a.grenze_kw - a.reserve_kw - sum(l.kw for l in lasten if l.an and l.anschluss == a.id)
        for a in anschluesse
    }


def _stufe(last: Last) -> tuple[bool, bool, int]:
    """Frost > Boost > Priorität."""
    return (last.frost, last.boost, last.prio)


def _rang(last: Last, erster: bool = False) -> tuple[Any, ...]:
    """Einschalt-Reihenfolge (größer = zuerst): Frost > Boost > erster seines Containers > Priorität > Defizit > Wartezeit."""
    defizit = last.defizit if last.defizit is not None else 0.0
    return (last.frost, last.boost, erster, last.prio, defizit, last.wartet_seit_min)


def _reihenfolge(lasten: list[Last], laufend: dict[str, int] | None = None) -> list[Last]:
    """`laufend`: laufende Heizer je Container – wer der erste seines Containers wäre, kommt vor (AN-0013)."""
    n = laufend or {}
    return sorted(sorted(lasten, key=lambda l: l.id), key=lambda l: _rang(l, bool(l.gruppe) and not n.get(l.gruppe)), reverse=True)


def anlauf_folge(lasten: list[Last]) -> list[Last]:
    """Anlaufstaffel des Aufrufers (einer nach dem anderen): Frost > Boost > Priorität, bei Gleichstand nach id."""
    return sorted(lasten, key=lambda l: (not l.frost, not l.boost, -l.prio, l.id))


def _bedarf(last: Last) -> float:
    return last.defizit if last.defizit is not None else 0.0


def _abschalt_reihenfolge(lasten: list[Last], laufend: dict[str, int] | None = None) -> list[Last]:
    """Der unterste zuerst: normale vor Boost vor Frost; darin Zweitgeräte (AN-0013), niedrige Priorität, kleiner Bedarf;
    bei Gleichstand der größere Verbraucher, dann der zuletzt eingeschaltete."""
    n = laufend or {}
    return sorted(lasten, key=lambda l: (l.frost, l.boost, bool(l.gruppe) and n.get(l.gruppe, 0) <= 1, l.prio, _bedarf(l),
                                         -l.kw, l.an_seit_min, l.id))


class Ruhe(StrEnum):
    """Warum ein Heizer im Plan gerade nicht heizen will (AN-0017) – die Funktion bzw. der Kern setzt `Last.ruht`."""

    SATT = "satt"                        # Thermostat: Soll erreicht
    TUER_OFFEN = "tuer_offen"
    ZURUECKGEHALTEN = "zurueckgehalten"  # Bereich heizt, dieses Gerät (Zusatz) bleibt aus, solange eines reicht


RANG_TEXT = {"heizt": "heizt", "wartet": "wartet", Ruhe.SATT: "satt (Thermostat)", Ruhe.TUER_OFFEN: "Tür offen",
             Ruhe.ZURUECKGEHALTEN: "Zusatz zurückgehalten", "aus": "aus"}
TAUSCH = (Warten.ANSCHLUSS_VOLL, Warten.RUNDLAUF)


def rangliste(lasten: list[Last]) -> list[str]:
    """Heizer (laufend, wollend oder laut Plan gerade dran – AN-0017, auch satte) von oben (zuerst an) nach unten
    (gibt zuerst ab) – für die Seite. Getauscht und rotiert wird weiter nur, wer heizen will (`staffeln`)."""
    heizer = [l for l in lasten if l.heizer and (l.an or l.will or l.im_plan)]
    laufend = [l for l in heizer if l.an]
    erste: dict[str, str] = {}
    for l in sorted(laufend, key=lambda l: (-l.prio, -_bedarf(l), l.id)) + sorted(heizer, key=lambda l: (not l.will, -l.prio, -_bedarf(l), l.id)):
        if l.gruppe:
            erste.setdefault(l.gruppe, l.id)
    return [l.id for l in sorted(sorted(heizer, key=lambda l: (-l.kw, l.id)),
                                 key=lambda l: (l.frost, l.boost, l.an or l.will, not l.gruppe or erste.get(l.gruppe) == l.id, l.prio,
                                                _bedarf(l)), reverse=True)]   # wer nur im Plan ist (satt …), steht unter allen, die heizen wollen


def rang_zustand(last: Last, wartet: Collection[str] = ()) -> str:
    """Zustand einer Zeile der Rangliste (AN-0017): heizt (läuft oder wird jetzt eingeschaltet), wartet (will, darf
    noch nicht – steht in `wartet`), sonst warum er ruht (satt, Tür offen, zurückgehalten)."""
    if last.an or (last.will and last.id not in wartet):
        return "heizt"
    if last.will:
        return "wartet"
    return last.ruht or "aus"


def rang_anzeige(lasten: list[Last], wartet: dict[str, str], max_gleichzeitig: int, an: bool = True) -> dict[str, Any]:
    """Rangliste für die Seite (AN-0017): Reihenfolge (`rangliste`), je Zeile Zustand und Text, dazu die Kopfzeile – ob
    der Anschluss Platz für alle hat oder getauscht wird. `wartet`: Wartegrund je Heizer aus `staffeln`."""
    nach_id = {l.id: l for l in lasten}
    zeilen = [{"id": i, "zustand": (z := rang_zustand(nach_id[i], wartet)), "text": RANG_TEXT.get(z, z)} for i in rangliste(lasten)]
    gruende = set(wartet.values())
    if not an:
        kopf = "Staffelung aus – es heizt, wer heizen will"
    elif gruende & set(TAUSCH):
        kopf = "Anschluss voll – wird getauscht"
    elif Warten.MAX_GLEICHZEITIG in gruende:
        kopf = f"Höchstens {max_gleichzeitig} gleichzeitig – wird getauscht"
    else:
        kopf = "Anschluss hat Platz für alle – kein Tausch nötig"
    return {"zeilen": zeilen, "kopf": kopf}


def staffeln(
    anschluesse: list[Anschluss],
    lasten: list[Last],
    regeln: StaffelRegeln,
    frei_stabil_kw: dict[str, float] | None = None,
    abwerfen: dict[str, bool] | None = None,
) -> StaffelErgebnis:
    """Ein Schritt der Staffelung über alle Anschlüsse."""
    bekannt = {a.id for a in anschluesse}
    frei_ist = frei_je_anschluss(anschluesse, lasten)
    stabil = frei_stabil_kw or {}
    # Platz für neue Heizer: der kleinere Wert aus jetzt und der letzten Minute
    platz = {a: f if stabil.get(a) is None else min(f, stabil[a]) for a, f in frei_ist.items()}

    heizer = [l for l in lasten if l.heizer]
    an: set[str] = {l.id for l in heizer if l.an and l.will}
    wartet: dict[str, str] = {}
    dran_in: dict[str, float] = {}
    nach_id = {l.id: l for l in heizer}

    # Heizer an unbekanntem Anschluss: nicht gestaffelt
    frei_folgen = {l.id for l in heizer if l.anschluss not in bekannt and l.will}
    an -= {l.id for l in heizer if l.anschluss not in bekannt}

    def laufend() -> dict[str, int]:   # laufende Heizer je Container (AN-0013)
        n: dict[str, int] = {}
        for i in an:
            g = nach_id[i].gruppe
            if g:
                n[g] = n.get(g, 0) + 1
        return n

    # Harte Grenze: Last je Anschluss, wenn alle laufenden Heizer voll zögen
    hart = {a.id: a.hart_kw for a in anschluesse if a.hart_kw is not None}
    voll = {a.id: a.reserve_kw + sum(_nenn(l) for l in lasten if l.an and l.anschluss == a.id and (not l.heizer or l.id in an))
            for a in anschluesse}

    def ueber_hart(k: Last, statt: Last | None = None) -> bool:
        if k.anschluss not in hart:
            return False
        weg = _nenn(statt) if statt is not None and statt.anschluss == k.anschluss else 0.0
        return voll[k.anschluss] - weg + _nenn(k) > hart[k.anschluss] + TOLERANZ_KW

    def schalte_aus(last: Last) -> None:
        an.discard(last.id)
        frei_ist[last.anschluss] += last.kw
        platz[last.anschluss] += last.kw
        voll[last.anschluss] -= _nenn(last)

    def schalte_ein(last: Last) -> None:
        an.add(last.id)
        frei_ist[last.anschluss] -= last.kw
        platz[last.anschluss] -= last.kw
        voll[last.anschluss] += _nenn(last)

    # 1. Regelung will nicht mehr → aus (die Leistung wird frei)
    for l in heizer:
        if l.an and not l.will and l.anschluss in bekannt:
            frei_ist[l.anschluss] += l.kw
            platz[l.anschluss] += l.kw

    # 2. Überlast → sofort der zuletzt eingeschaltete aus
    abgeworfen: set[str] = set()
    gesperrt: set[str] = set()   # zu voll, aber noch nicht lange genug (UEBERLAST_S): nichts Neues
    for a in anschluesse:
        if frei_ist[a.id] < -TOLERANZ_KW and abwerfen is not None and not abwerfen.get(a.id, True):
            gesperrt.add(a.id)
            continue
        while frei_ist[a.id] < -TOLERANZ_KW:
            dran = _abschalt_reihenfolge([nach_id[i] for i in an if nach_id[i].anschluss == a.id], laufend())
            if not dran:
                break
            l = dran[0]
            schalte_aus(l)
            abgeworfen.add(l.id)
            wartet[l.id] = Warten.ANSCHLUSS_VOLL

    # 3. Mehr als max_gleichzeitig → überzählige nach der Mindestlaufzeit aus
    for l in _abschalt_reihenfolge([nach_id[i] for i in an], laufend()):
        if len(an) <= regeln.max_gleichzeitig:
            break
        if l.an_seit_min >= regeln.min_lauf_min:
            schalte_aus(l)
            abgeworfen.add(l.id)
            wartet[l.id] = Warten.MAX_GLEICHZEITIG

    # 4. Wartende einschalten, sonst Rundlauf
    neu = 0
    ueberlast = {nach_id[i].anschluss for i in abgeworfen if wartet[i] == Warten.ANSCHLUSS_VOLL} | gesperrt
    kandidaten = [l for l in heizer if l.will and l.id not in an and l.id not in abgeworfen and l.anschluss in bekannt]
    getauscht: set[str] = set()
    offen = list(kandidaten)
    while offen:
        k = _reihenfolge(offen, laufend())[0]   # neu je Schritt: wer jetzt der erste seines Containers wäre
        offen.remove(k)
        if k.aus_seit_min < regeln.min_pause_min:
            wartet[k.id] = Warten.MINDESTPAUSE
            dran_in[k.id] = regeln.min_pause_min - k.aus_seit_min
            continue
        zu_voll = k.anschluss in ueberlast or k.kw > platz[k.anschluss] + TOLERANZ_KW or ueber_hart(k)
        zu_viele = len(an) >= regeln.max_gleichzeitig
        if not zu_voll and not zu_viele:
            if neu >= regeln.neue_je_schritt:
                wartet[k.id] = Warten.ANLAUF
                continue
            schalte_ein(k)
            neu += 1
            continue

        # Rundlauf: wer darf gegen k getauscht werden, und ab wann?
        vorrang = k.frost or k.boost
        n_lauf = laufend()
        k_erster = bool(k.gruppe) and not n_lauf.get(k.gruppe)
        moeglich: list[tuple[float, Last]] = []
        for i in an:
            r = nach_id[i]
            if r.frost or (r.boost and not k.frost) or i in getauscht or not r.an:
                continue
            if k.gruppe and r.gruppe == k.gruppe:   # gleicher Container: Tausch brächte dem Raum nichts
                continue
            r_einzig = bool(r.gruppe) and n_lauf.get(r.gruppe, 0) <= 1
            if r_einzig and k.gruppe and not k_erster and not vorrang:
                continue   # AN-0013: ein Zweitgerät verdrängt nicht den einzigen Heizer eines anderen Containers
            if zu_voll and (
                r.anschluss != k.anschluss
                or k.anschluss in ueberlast
                or k.kw > platz[k.anschluss] + r.kw + TOLERANZ_KW
                or ueber_hart(k, r)
            ):
                continue
            if vorrang:
                ab = regeln.min_lauf_min
            elif _stufe(k) >= _stufe(r) or (k_erster and not r_einzig and not r.boost):   # AN-0013: erster vor Zweitgerät
                ab = max(regeln.takt_min, regeln.min_lauf_min)
            else:
                continue
            moeglich.append((ab - r.an_seit_min, r))

        jetzt = [r for rest, r in moeglich if rest <= 0]
        if jetzt and neu < regeln.neue_je_schritt:
            # normale vor Boost; Zweitgeräte vor dem einzigen eines Containers (AN-0013); dann der unterste (Priorität,
            # Bedarf), bei Gleichstand der größere und der am längsten laufende
            r = min(jetzt, key=lambda x: (x.boost, bool(x.gruppe) and n_lauf.get(x.gruppe, 0) <= 1, x.prio, _bedarf(x),
                                          -x.kw, -x.an_seit_min, x.id))
            schalte_aus(r)
            getauscht.add(r.id)
            wartet[r.id] = Warten.RUNDLAUF
            dran_in[r.id] = max(regeln.takt_min, regeln.min_lauf_min)
            schalte_ein(k)
            getauscht.add(k.id)
            neu += 1
        elif jetzt:
            wartet[k.id] = Warten.ANLAUF
        elif moeglich:
            wartet[k.id] = Warten.RUNDLAUF
            dran_in[k.id] = min(rest for rest, _ in moeglich)
        else:
            wartet[k.id] = Warten.ANSCHLUSS_VOLL if zu_voll else Warten.MAX_GLEICHZEITIG

    return StaffelErgebnis(
        an=frozenset(an | frei_folgen),
        wartet={i: str(g) for i, g in wartet.items()},
        frei_kw={a: round(f, 3) for a, f in frei_ist.items()},
        dran_in_min=dran_in,
    )
