"""Container-Inventar: Kürzel, Namen, Entity-IDs, Labels, Nummern (BSM-031.03, docs/bauplan-inventar.md §3–§5) – ohne
Home-Assistant-Code.

Schema (Herbert 05./08.10.2026, Kürzel deutsch): Container `NNN_C_<Art>` (eigen, Nummer für die ganze Firma) bzw.
`<FIRMA>-NN_C_<Art>` (fremd, Nummer je Baustelle und Firma); Geräte nach ihrem Container `NNN-GG_C_<Typ>_<Art>`,
Heizkörper zusätzlich `_<Konvektor|Radiator><Nr>`; Fühler, Tür, Fenster am Container `NNN_C_<Typ>_<Art>` (ab dem zweiten
mit `_2` …); Messwerte `<Gerätename>_<Endung>`. Entity-IDs: Name klein, `-` → `_`. Labels deutsch.
"""

from __future__ import annotations

import re
from collections.abc import Iterable, Mapping
from typing import Any

from .geraete import STATUS
from .symbol import sensor_eintragen

# Die eine Kürzeltabelle (§3) – neue Kürzel nur hier, mit Test
CONTAINER_ARTEN: dict[str, str] = {
    "POL": "Polier", "MAN": "Mannschaft", "BES": "Besprechung", "BUE": "Büro",
    "LAG": "Lager", "MAT": "Material", "SAN": "Sanitär", "TRO": "Trocken",
}
GERAETE: dict[str, str] = {   # Kürzel → Label (Gerätetyp)
    "PLUG": "Shelly Plug", "HZ": "Heizkörper", "TEMP": "Shelly H&Temp Sensor", "DOOR": "Shelly Door Sensor",
    "FEN": "Shelly Door Sensor", "PUMP": "Pumpe", "BTR": "Bautrockner",
}
AM_CONTAINER = ("TEMP", "DOOR", "FEN")
SENSOR_TYP = {"fuehler": "TEMP", "tuer": "DOOR", "fenster": "FEN"}   # Sensorliste (logik/sensoren) → Inventar; Licht nicht   # gehören zum Container, nicht zu einem Plug (ohne GG)
HEIZTYPEN = {"konvektor": "Konvektor", "oelradiator": "Radiator", "radiator": "Radiator"}
ENDUNGEN = ("Temperatur", "Feuchte", "Batterie", "Tuer", "Drehung", "Lichtstufe", "Licht")
LABEL_CONTAINER = "Container"
STATUS_AUSRUESTUNG = STATUS   # dieselben vier Werte wie der Status des Geräts (logik/geraete, BSM-034.02)

_KUERZEL = re.compile(r"^[A-Z]{2,5}$")


class InventarFehler(ValueError):
    """Ungültige Angabe (unbekanntes Kürzel, Firmenkürzel, Nummer)."""


def _art(art: str) -> str:
    if art not in CONTAINER_ARTEN:
        raise InventarFehler(f"unbekannte Containerart {art!r}")
    return art


def firmenkuerzel_pruefen(kuerzel: str | None) -> str:
    """2–5 Großbuchstaben (A–Z), z. B. STRA; Kleinbuchstaben werden groß."""
    k = (kuerzel or "").strip().upper()
    if not _KUERZEL.match(k):
        raise InventarFehler("Firmenkürzel: 2 bis 5 Buchstaben (A–Z)")
    return k


def praefix(*, nr: int | None = None, firma: str | None = None, fremd_nr: int | None = None) -> str:
    """Nummernteil des Containers: eigen `002`, fremd `STRA-01`."""
    if firma:
        if not fremd_nr or fremd_nr < 1:
            raise InventarFehler("Fremdcontainer braucht eine Nummer je Baustelle")
        return f"{firmenkuerzel_pruefen(firma)}-{fremd_nr:02d}"
    if not nr or nr < 1:
        raise InventarFehler("eigener Container braucht eine Nummer")
    return f"{nr:03d}"


def container_name(art: str, *, nr: int | None = None, firma: str | None = None, fremd_nr: int | None = None) -> str:
    """`002_C_MAN` bzw. `STRA-01_C_MAN`."""
    return f"{praefix(nr=nr, firma=firma, fremd_nr=fremd_nr)}_C_{_art(art)}"


def geraet_name(praefix_: str, art: str, typ: str, gg: int | None = None, *, heiztyp: str | None = None,
                heiz_nr: int = 1, nr: int = 1) -> str:
    """Name eines Geräts im Container `praefix_` (aus `praefix`).

    PLUG/PUMP/BTR: `002-01_C_PLUG_MAN`; HZ: `002-01_C_HZ_MAN_Konvektor01` (GG des schaltenden Plugs); TEMP/DOOR/FEN am
    Container ohne GG: `002_C_TEMP_MAN`, ab dem zweiten `002_C_DOOR_MAN_2`."""
    _art(art)
    if typ not in GERAETE:
        raise InventarFehler(f"unbekannter Gerätetyp {typ!r}")
    if typ in AM_CONTAINER:
        return f"{praefix_}_C_{typ}_{art}" + (f"_{nr}" if nr > 1 else "")
    if not gg or gg < 1:
        raise InventarFehler(f"{typ} braucht eine Gerätenummer im Container")
    name = f"{praefix_}-{gg:02d}_C_{typ}_{art}"
    if typ == "HZ":
        name += f"_{HEIZTYPEN.get((heiztyp or '').lower(), 'Konvektor')}{heiz_nr:02d}"
    return name


def messwert_name(geraet: str, endung: str) -> str:
    """`<Gerätename>_<Endung>`, z. B. `002_C_TEMP_MAN_Temperatur`."""
    return f"{geraet}_{endung}"


def entity_id(domain: str, name: str) -> str:
    """Entity-ID aus dem Namen: klein, `-` und andere Zeichen → `_` (wie HA, ohne doppelte `_`)."""
    objekt = re.sub(r"_+", "_", re.sub(r"[^a-z0-9]", "_", name.lower())).strip("_")
    return f"{domain}.{objekt}"


def labels(art: str, typ: str | None = None, firma: str | None = None) -> list[str]:
    """Labels eines Containers bzw. Geräts: „Container“, die Art, bei Geräten der Gerätetyp, bei Fremden die Firma."""
    aus = [LABEL_CONTAINER, CONTAINER_ARTEN[_art(art)]]
    if typ:
        aus.append(GERAETE[typ])
    if firma:
        aus.append(firma)
    return list(dict.fromkeys(aus))   # FEN und DOOR haben dasselbe Label – nichts doppelt


def eigene_labels() -> set[str]:
    """Alle Labels, die das Inventar setzt – nur diese darf es auch wieder entfernen (§5)."""
    return {LABEL_CONTAINER, *CONTAINER_ARTEN.values(), *GERAETE.values()}


def naechste(vorhanden: Iterable[int | None]) -> int:
    """Nächste Nummer: größte bisher + 1, nie eine Lücke füllen (eine Nummer gilt für immer)."""
    return max((n for n in vorhanden if n), default=0) + 1


def konflikte(neu: Mapping[str, str], belegt: Iterable[str]) -> dict[str, str]:
    """Entity-IDs, die schon eine fremde Entität trägt: {alt: neu} der Schritte, die so nicht gehen. Eine Umbenennung
    auf sich selbst oder unter den umbenannten Entitäten im Kreis ist kein Konflikt."""
    frei_werdend = set(neu)
    belegt_set = set(belegt) - frei_werdend
    gesehen: set[str] = set()
    aus: dict[str, str] = {}
    for alt, ziel in neu.items():
        if ziel != alt and (ziel in belegt_set or ziel in gesehen):
            aus[alt] = ziel
        gesehen.add(ziel)
    return aus


def _aktuell(einsaetze: list[dict[str, Any]], schluessel: str, wert: str) -> dict[str, Any] | None:
    laufend = [e for e in einsaetze if e.get(schluessel) == wert and not e.get("bis")]
    return laufend[-1] if laufend else None


def aufbereiten(roh: Mapping[str, Any]) -> dict[str, Any]:
    """Inventar für die Seite (BSM-031.05): Container mit Namen, Labels, aktuellem Einsatz, Geschichte und Ausrüstung
    mit Namen; freie Ausrüstung; Bereiche ohne Container; Firmen; Kürzeltabelle und nächste Nummer. `roh` aus
    `db/inventar.lesen`. Die Seite rechnet nichts davon nach."""
    einsaetze: list[dict[str, Any]] = list(roh.get("einsaetze") or [])
    a_einsaetze: list[dict[str, Any]] = list(roh.get("ausruestung_einsaetze") or [])
    heiztyp = {g["id"]: g.get("typ") for g in roh.get("geraete") or []}
    firmen_namen = {f.get("kuerzel"): f["name"] for f in roh.get("firmen") or [] if f.get("kuerzel")}
    ausruestung = {a["id"]: a for a in roh.get("ausruestung") or []}
    container_aus: list[dict[str, Any]] = []
    belegt: set[str] = set()
    for c in roh.get("container") or []:
        fremd = bool(c.get("firma_kuerzel"))
        try:
            p = praefix(nr=c.get("nr"), firma=c.get("firma_kuerzel"), fremd_nr=c.get("fremd_nr"))
            name = container_name(c["art"], nr=c.get("nr"), firma=c.get("firma_kuerzel"), fremd_nr=c.get("fremd_nr"))
        except InventarFehler:
            p, name = "", c["id"]
        geraete: list[dict[str, Any]] = []
        zaehler: dict[str, int] = {}
        for e in a_einsaetze:
            if e.get("container_id") != c["id"] or e.get("bis") or (a := ausruestung.get(e["ausruestung_id"])) is None:
                continue
            belegt.add(a["id"])
            typ = a["typ"]
            zaehler[typ] = zaehler.get(typ, 0) + 1
            try:
                gname = geraet_name(p, c["art"], typ, e.get("gg"), heiztyp=heiztyp.get(e.get("geraet_id") or ""),
                                    nr=zaehler[typ]) if p else None
            except InventarFehler:
                gname = None
            geraete.append({"id": a["id"], "typ": typ, "typ_label": GERAETE.get(typ, typ), "name": gname, "gg": e.get("gg"),
                            "status": a.get("status"), "modell": a.get("modell"), "geraet_id": e.get("geraet_id"), "seit": e["von"]})
        geraete.sort(key=lambda g: (g["gg"] is None, g["gg"] or 0, g["typ"]))
        container_aus.append({
            "id": c["id"], "name": name, "nr": c.get("nr"), "art": c["art"], "art_label": CONTAINER_ARTEN.get(c["art"], c["art"]),
            "eigen": not fremd, "firma_kuerzel": c.get("firma_kuerzel"), "fremd_nr": c.get("fremd_nr"), "status": c.get("status"),
            "labels": labels(c["art"], firma=firmen_namen.get(c.get("firma_kuerzel"))) if c["art"] in CONTAINER_ARTEN else [],
            "einsatz": _aktuell(einsaetze, "container_id", c["id"]),
            "geschichte": [e for e in einsaetze if e.get("container_id") == c["id"]],
            "ausruestung": geraete,
        })
    container_aus.sort(key=lambda c: (not c["eigen"], c["nr"] or 0, c["firma_kuerzel"] or "", c["fremd_nr"] or 0))
    frei = [{"id": a["id"], "typ": a["typ"], "typ_label": GERAETE.get(a["typ"], a["typ"]), "status": a.get("status"),
             "modell": a.get("modell")} for a in ausruestung.values() if a["id"] not in belegt]
    return {
        "container": container_aus,
        "ausruestung_frei": sorted(frei, key=lambda a: (a["typ"], a["id"])),
        "bereiche_ohne": list(roh.get("bereiche_ohne") or []),
        "firmen": list(roh.get("firmen") or []),
        "arten": CONTAINER_ARTEN, "geraete": GERAETE,
        "naechste_nr": naechste(c.get("nr") for c in roh.get("container") or []),
    }


# ---------------------------------------------------------------------- Vorschau der Umbenennung (BSM-031.06a, §6)
# Endung je Messwert (device_class); Leistung/Energie am Plug so angenommen (Bauplan Inventar §8, offen)
ENDUNG_JE_KLASSE: dict[str, str] = {
    "temperature": "Temperatur", "humidity": "Feuchte", "battery": "Batterie", "door": "Tuer", "window": "Tuer",
    "opening": "Tuer", "illuminance": "Licht", "power": "Leistung", "energy": "Energie",
}


def _schritt(ziel: str, ref: str, was: str, alt: str | None, neu: str | None) -> dict[str, Any]:
    zustand = "gleich" if alt == neu else ("neu" if not alt else "aendern")
    return {"ziel": ziel, "ref": ref, "was": was, "alt": alt, "neu": neu, "zustand": zustand}


def _entitaet(e: Mapping[str, Any], name: str) -> list[dict[str, Any]]:
    """Name und Entity-ID einer Entität (`entity_id`, `name`) auf `name` bringen."""
    domain = str(e["entity_id"]).split(".", 1)[0]
    return [_schritt("entitaet_name", e["entity_id"], "Name", e.get("name"), name),
            _schritt("entitaet_id", e["entity_id"], "Entity-ID", e["entity_id"], entity_id(domain, name))]


def _messwerte(geraet: str, entitaeten: Iterable[Mapping[str, Any]]) -> list[dict[str, Any]]:
    """Je Endung nur die erste Entität (zwei gleiche Namen gingen nicht; weitere bleiben, wie sie sind)."""
    aus: list[dict[str, Any]] = []
    vergeben: set[str] = set()
    for e in entitaeten:
        if (endung := ENDUNG_JE_KLASSE.get(str(e.get("klasse") or ""))) and endung not in vergeben:
            vergeben.add(endung)
            aus += _entitaet(e, messwert_name(geraet, endung))
    return aus


def _labels(ref: str, soll: list[str], ist: Iterable[str]) -> list[dict[str, Any]]:
    """Fehlende Labels dazu; eigene Labels (§5), die nicht mehr passen (andere Art), weg – fremde bleiben."""
    vorhanden = list(dict.fromkeys(ist))
    dazu = [_schritt("label", ref, "Label", None, label) for label in soll if label not in vorhanden]
    weg = [_schritt("label", ref, "Label", label, None) for label in vorhanden
           if label in eigene_labels() and label not in soll]
    return dazu + weg


def vorschau(eingabe: Mapping[str, Any], belegt: Iterable[str] = ()) -> dict[str, Any]:
    """Schritte alt → neu für einen Container (Bauplan Inventar §6) – rechnet nur, ändert nichts.

    `eingabe`: `art`, `praefix` (aus `praefix`), `firma` (Name, nur fremd), `plugs` [{`gg`, `geraet_id` (Unter-Eintrag),
    `name`, `rolle`, `typ`, `geraet` {id, name}, `schalter` {entity_id, name}, `entitaeten` [{entity_id, name, klasse}],
    `plug_name`, `bthome` [{nr, name, neu}], `labels`}], `sensoren` [{`typ` TEMP/DOOR/FEN, `geraet`, `entitaeten`,
    `labels`}]. `belegt`: alle Entity-IDs in HA (für Konflikte).
    Ergebnis: `schritte` (je mit `gruppe`), `konflikte` {alt: neu}, `zaehler` {aendern, neu, gleich, konflikt}."""
    art, p, firma = eingabe["art"], eingabe["praefix"], eingabe.get("firma")
    schritte: list[dict[str, Any]] = []
    for pl in sorted(eingabe.get("plugs") or [], key=lambda x: x.get("gg") or 0):
        gruppe = geraet_name(p, art, "PLUG", pl["gg"])
        teil: list[dict[str, Any]] = []
        if pl.get("geraet"):
            teil.append(_schritt("geraet", pl["geraet"]["id"], "HA-Gerät", pl["geraet"].get("name"), gruppe))
            teil += _labels(pl["geraet"]["id"], labels(art, "PLUG", firma), pl.get("labels") or [])
        if pl.get("schalter"):
            teil += _entitaet(pl["schalter"], gruppe)
        teil += _messwerte(gruppe, pl.get("entitaeten") or [])
        if pl.get("plug_name") is not None:
            teil.append(_schritt("plug", pl["geraet_id"], "Plug-Name", pl.get("plug_name"), gruppe))
        if pl.get("rolle") in ("heizkoerper", "bautrockner"):
            typ = "BTR" if pl.get("rolle") == "bautrockner" else "HZ"
            teil.append(_schritt("unter_eintrag", pl["geraet_id"], "Heizkörper (Integration)", pl.get("name"),
                                 geraet_name(p, art, typ, pl["gg"], heiztyp=pl.get("typ"))))
        for k in pl.get("bthome") or []:
            teil.append(_schritt("bthome", f'{pl["geraet_id"]}:{k["nr"]}', "BTHome-Kopplung", k.get("name"), k.get("neu")))
        schritte += [{**s, "gruppe": gruppe} for s in teil]
    anzahl: dict[str, int] = {}
    for se in eingabe.get("sensoren") or []:
        anzahl[se["typ"]] = anzahl.get(se["typ"], 0) + 1
        gruppe = geraet_name(p, art, se["typ"], nr=anzahl[se["typ"]])
        teil = []
        if se.get("geraet"):
            teil.append(_schritt("geraet", se["geraet"]["id"], "HA-Gerät", se["geraet"].get("name"), gruppe))
            teil += _labels(se["geraet"]["id"], labels(art, se["typ"], firma), se.get("labels") or [])
        teil += _messwerte(gruppe, se.get("entitaeten") or [])
        schritte += [{**s, "gruppe": gruppe} for s in teil]
    neu_ids = {s["alt"]: s["neu"] for s in schritte if s["ziel"] == "entitaet_id" and s["alt"] != s["neu"]}
    konfl = konflikte(neu_ids, belegt)
    for s in schritte:
        if s["ziel"] == "entitaet_id" and s["alt"] in konfl:
            s["zustand"] = "konflikt"
    zaehler = {z: sum(1 for s in schritte if s["zustand"] == z) for z in ("aendern", "neu", "gleich", "konflikt")}
    return {"schritte": schritte, "konflikte": konfl, "zaehler": zaehler}


def abweichend(schritte: Iterable[Mapping[str, Any]]) -> int:
    """Wie viele Schritte der Vorschau vom Schema abweichen (Chip „⚠ n weichen ab“ an Container, Dialogen und Geräten):
    alles, was nicht schon gleich ist – dieselbe Zahl wie „Übernehmen (n)“ in der Vorschau; 0 = „Namen ✓“."""
    return sum(1 for s in schritte if s.get("zustand") != "gleich")


NEU_ZUGEORDNET = "neu"   # Platzhalter für den Unter-Eintrag eines Plugs, den erst das Zuordnen anlegt (Vorschau)


def sensor_verdrahtung(typ: str, entity_id: str | None, *, fuehler: str | None, tuer: str | None,
                       symbol: Mapping[str, Any] | None) -> dict[str, Any] | None:
    """Was das Zuordnen eines Fühlers, Tür- oder Fensterkontakts am Container einträgt – die eine Regel für Zuordnen
    (`_verdrahten`) und Vorschau. None = nichts (kein Messwert, Container hat schon einen Fühler, Tür/Fenster schon
    eingetragen oder kein Platz im Aussehen); sonst `{"feld": "fuehler"|"tuer"|"symbol", "wert": …, "text": …}`."""
    if not entity_id or typ not in AM_CONTAINER:
        return None
    if typ == "TEMP":
        return None if fuehler else {"feld": "fuehler", "wert": entity_id, "text": "als Fühler des Containers eingetragen"}
    if typ == "DOOR" and not tuer:
        return {"feld": "tuer", "wert": entity_id, "text": "als Türkontakt des Containers eingetragen"}
    art = "tuer" if typ == "DOOR" else "fenster"
    if (neu := sensor_eintragen(dict(symbol) if symbol else None, art, entity_id, tuer)) is None:
        return None
    nr = next(i + 1 for i, x in enumerate(neu["tueren" if art == "tuer" else "fenster"]) if x["sensor"] == entity_id)
    return {"feld": "symbol", "wert": neu, "text": f"als {'Tür' if art == 'tuer' else 'Fenster'} {nr} des Containers eingetragen"}


def nicht_eingetragen(typ: str) -> str:
    """Hinweis in der Zuordnen-Vorschau, wenn `sensor_verdrahtung` nichts einträgt: das Gerät kommt nur ins Inventar."""
    was = {"TEMP": "Der Container hat schon einen Fühler", "DOOR": "Der Türkontakt ist schon eingetragen oder es ist kein "
           "Platz für eine weitere Tür", "FEN": "Das Fenster ist schon eingetragen oder es ist kein Platz für ein weiteres"}
    return f"{was.get(typ, 'Das Gerät wird am Container nicht eingetragen')} – es wird nur im Inventar zugeordnet, " \
           "seine Namen bleiben."


def mit_zuordnung(eingabe: Mapping[str, Any], *, typ: str, geraet: Mapping[str, Any], entitaeten: list[dict[str, Any]],
                  labels_: list[str], schalter: Mapping[str, Any] | None = None, haengt: str | None = None,
                  verdrahtet: bool = True) -> dict[str, Any]:
    """Eingabe der Vorschau, als wäre das HA-Gerät schon zugeordnet (Zuordnen: erst die Vorschau, dann schreiben).

    Ein Plug bekommt die nächste Gerätenummer nach den im Inventar gespeicherten (`gg_fest`, wie `naechste`) und
    Rolle/Typ nach „Was hängt an diesem Plug?“ (`HAENGT`); Fühler, Tür und Fenster kommen ans Ende ihrer Art. Steckt
    das Gerät schon im Container oder trägt das Zuordnen den Sensor nicht am Container ein (`verdrahtet` False, Regel
    `sensor_verdrahtung`, z. B. zweiter Fühler), bleibt die Eingabe, wie sie ist."""
    aus = {**eingabe, "plugs": list(eingabe.get("plugs") or []), "sensoren": list(eingabe.get("sensoren") or [])}
    gid = geraet.get("id")
    if any((x.get("geraet") or {}).get("id") == gid for x in aus["plugs"] + aus["sensoren"]):
        return aus
    if typ == "PLUG":
        rolle, heiztyp = HAENGT.get(haengt or "konvektor", HAENGT["konvektor"])
        # wie das Inventar: nächste nach den gespeicherten Nummern; Plugs ohne gespeicherte (`gg_fest` False) zählen danach
        gg = naechste(x.get("gg") for x in aus["plugs"] if x.get("gg_fest", True))
        lose = [x for x in aus["plugs"] if not x.get("gg_fest", True)]
        aus["plugs"] = [x for x in aus["plugs"] if x.get("gg_fest", True)] + [{**x, "gg": gg + i} for i, x in enumerate(lose, 1)]
        aus["plugs"].append({
            "gg": gg, "gg_fest": True, "geraet_id": NEU_ZUGEORDNET, "name": geraet.get("name"),
            "rolle": rolle, "typ": heiztyp, "geraet": dict(geraet), "schalter": dict(schalter or {}),
            "entitaeten": [e for e in entitaeten if e.get("klasse") in ("power", "energy")],
            "plug_name": geraet.get("original"), "labels": list(labels_)})
    elif typ in AM_CONTAINER:
        if verdrahtet:
            aus["sensoren"].append({"typ": typ, "geraet": dict(geraet), "entitaeten": list(entitaeten), "labels": list(labels_)})
    else:
        raise InventarFehler(f"Gerätetyp {typ} lässt sich nicht zuordnen")
    return aus


# ---------------------------------------------------------------------- Umbenennen ausführen (BSM-031.06b, §6)
ERGEBNIS_ERLEDIGT = ("ok", "gleich", "entfaellt")   # entfällt: kein Shelly Gen2+ bzw. BTHome (Kopplungspflege)


def ausfuehrbar(schritte: Iterable[Mapping[str, Any]]) -> list[dict[str, Any]]:
    """Was in HA zu tun ist, nach Ziel zusammengefasst und in der festen Reihenfolge (§6.3): je Entität Name und
    Entity-ID in einem Schritt, dann HA-Gerät, Labels, Unter-Eintrag. Plug-Name und BTHome macht nicht HA (06c)."""
    reihenfolge = ("entitaet", "geraet", "label", "unter_eintrag")
    aus: dict[tuple[str, str], dict[str, Any]] = {}
    for s in schritte:
        if s["zustand"] in ("gleich", "konflikt") or s["ziel"] in ("plug", "bthome"):
            continue
        art = "entitaet" if s["ziel"] in ("entitaet_name", "entitaet_id") else s["ziel"]
        eintrag = aus.setdefault((art, s["ref"]), {"art": art, "ref": s["ref"], "dazu": [], "weg": []})
        if s["ziel"] == "entitaet_name":
            eintrag["name"] = s["neu"]
        elif s["ziel"] == "entitaet_id":
            eintrag["entity_id"] = s["neu"]
        elif art == "label":
            (eintrag["dazu"] if s["neu"] else eintrag["weg"]).append(s["neu"] or s["alt"])
        else:
            eintrag["name"] = s["neu"]
    return sorted(aus.values(), key=lambda e: reihenfolge.index(e["art"]))


def ids_getauscht(schritte: Iterable[Mapping[str, Any]]) -> dict[str, str]:
    """{alte Entity-ID: neue} der erledigten Schritte – für die eigenen Verweise der Integration."""
    return {s["alt"]: s["neu"] for s in schritte
            if s["ziel"] == "entitaet_id" and s.get("ergebnis") == "ok" and s["alt"] != s["neu"]}


def verweise_tauschen(wert: Any, ids: Mapping[str, str]) -> Any:
    """Entity-IDs in Einstellungen und Unter-Einträgen (auch verschachtelt, z. B. Symbol mit Tür- und Fenstersensoren)
    durch die neuen ersetzen; alles andere bleibt."""
    if isinstance(wert, str):
        return ids.get(wert, wert)
    if isinstance(wert, Mapping):
        return {k: verweise_tauschen(w, ids) for k, w in wert.items()}
    if isinstance(wert, list):
        return [verweise_tauschen(w, ids) for w in wert]
    return wert


def status(schritte: Iterable[Mapping[str, Any]]) -> str:
    """`ausgefuehrt`, wenn jeder Schritt erledigt ist; sonst `teilweise` (fehlgeschlagen oder noch offen, z. B. der
    Plug-Name) – die fehlenden lassen sich nachholen (§6.5)."""
    return "ausgefuehrt" if all(s.get("ergebnis") in ERGEBNIS_ERLEDIGT for s in schritte) else "teilweise"


def fuer_plug(schritte: Iterable[Mapping[str, Any]]) -> list[dict[str, Any]]:
    """Plug-Namen, die im Shelly selbst zu setzen sind (`Sys.SetConfig`, 06c) – nach den Schritten in HA."""
    return [dict(s) for s in schritte if s["ziel"] == "plug" and s["zustand"] != "gleich"]


def nachholen_mischen(alt: Iterable[Mapping[str, Any]], neu: Iterable[Mapping[str, Any]]) -> list[dict[str, Any]]:
    """Ergebnis eines Nachholens in eine `teilweise` gebliebene Umbenennung eintragen (§6.5).

    Ein offener oder fehlgeschlagener Schritt gilt als erledigt, wenn er jetzt geklappt hat oder inzwischen schon passt
    (`gleich`); sein alter Wert bleibt für Rückgängig. Schlägt er wieder fehl, steht der neue Fehler da. Schritte, die erst
    beim Nachholen dazukamen, werden angehängt."""
    neu_je = {(s["ziel"], s["ref"]): dict(s) for s in neu}
    aus: list[dict[str, Any]] = []
    for s in alt:
        n = neu_je.pop((s["ziel"], s["ref"]), None)
        if s.get("ergebnis") in ERGEBNIS_ERLEDIGT or n is None:
            aus.append(dict(s))
        elif n.get("ergebnis") in ERGEBNIS_ERLEDIGT:
            aus.append({**{k: w for k, w in s.items() if k != "fehler"}, "ergebnis": "ok", "nachgeholt": True})
        else:
            aus.append({**s, "ergebnis": n.get("ergebnis"), **({"fehler": n["fehler"]} if n.get("fehler") else {})})
    aus += [n for n in neu_je.values() if n.get("ergebnis") != "gleich"]
    return aus


# ---------------------------------------------------------------------- Rückgängig (BSM-031.06d, §6.6)
RUECKGAENGIG_MOEGLICH = ("ausgefuehrt", "teilweise", "zurueck_teilweise")


def rueckgaengig(schritte: Iterable[Mapping[str, Any]]) -> list[dict[str, Any]]:
    """Umkehr-Schritte einer Umbenennung: jeder erledigte Schritt (`ok`, noch nicht zurück) mit vertauschtem alt/neu, in
    umgekehrter Reihenfolge. Entitäten heißen inzwischen nach der neuen Entity-ID – `ref` ist die aktuelle. `nr` = Platz
    des Schritts in der Umbenennung (für das Ergebnis). Ergebnis im Format der Vorschau (`ausfuehrbar`, `fuer_plug`)."""
    liste = list(schritte)
    aktuell = {s["ref"]: s["neu"] for s in liste if s["ziel"] == "entitaet_id" and s.get("ergebnis") == "ok"}
    aus: list[dict[str, Any]] = []
    for nr in range(len(liste) - 1, -1, -1):
        s = liste[nr]
        if s.get("ergebnis") != "ok" or s.get("zurueck") in ERGEBNIS_ERLEDIGT:
            continue
        ref = aktuell.get(s["ref"], s["ref"]) if s["ziel"] in ("entitaet_name", "entitaet_id") else s["ref"]
        aus.append({**{k: s[k] for k in ("ziel", "was", "gruppe") if k in s}, "ref": ref, "alt": s["neu"], "neu": s["alt"],
                    "zustand": "aendern", "nr": nr})
    return aus


def zurueck_eintragen(schritte: Iterable[Mapping[str, Any]], umkehr: Iterable[Mapping[str, Any]]) -> tuple[list[dict[str, Any]], str]:
    """Ergebnis des Rückgängig je Schritt der Umbenennung eintragen (`zurueck`, ggf. `zurueck_fehler`) und Status:
    `zurueck`, wenn alles Erledigte zurück ist, sonst `zurueck_teilweise` (nochmal Rückgängig holt den Rest)."""
    aus = [dict(s) for s in schritte]
    for u in umkehr:
        ziel = aus[u["nr"]]
        ziel["zurueck"] = u["ergebnis"]
        ziel.pop("zurueck_fehler", None)
        if u.get("fehler"):
            ziel["zurueck_fehler"] = u["fehler"]
    fertig = all(s.get("zurueck") in ERGEBNIS_ERLEDIGT for s in aus if s.get("ergebnis") == "ok")
    return aus, "zurueck" if fertig else "zurueck_teilweise"


# ---------------------------------------------------------------------- Ausrüstung zuordnen (BSM-031.07, §2, §8)
MIT_GG = ("PLUG", "PUMP", "BTR")   # bekommen eine Gerätenummer im Container
HAENGT: dict[str, tuple[str, str]] = {   # „Was hängt an diesem Plug?“ → (Rolle, Typ) des Unter-Eintrags
    "konvektor": ("heizkoerper", "konvektor"), "radiator": ("heizkoerper", "oelradiator"),
    "bautrockner": ("bautrockner", "konvektor"), "nichts": ("steckdose", "konvektor"),
}


def typ_vorschlag(*, schalter: bool, klassen: Iterable[str]) -> str | None:
    """Gerätetyp eines HA-Geräts für das Inventar: Shelly mit Schalter → PLUG; mit Temperatur → TEMP; Tür → DOOR;
    Fenster → FEN; sonst keiner (taugt nicht als Ausrüstung)."""
    k = set(klassen)
    if schalter:
        return "PLUG"
    if "temperature" in k:
        return "TEMP"
    if k & {"door", "opening", "garage_door"}:
        return "DOOR"
    if "window" in k:
        return "FEN"
    return None


def nummer_frei(nr: int, vorhanden: Iterable[int | None]) -> int:
    """Eine bestimmte Nummer für einen eigenen Container (Bestand übernehmen, §1: Nummern bleiben) – nur, wenn sie nie
    vergeben war. Sonst `InventarFehler`."""
    if nr < 1 or nr > 999:
        raise InventarFehler("Nummer 1 bis 999")
    if nr in set(vorhanden):
        raise InventarFehler(f"Nummer {nr:03d} ist schon vergeben – eine Nummer gilt für immer")
    return nr


# ---------------------------------------------------------------------- Abgleich Inventar ↔ HA (BSM-034.04)
def abgleich(ha: Iterable[str], im_container: Mapping[str, str]) -> tuple[list[str], list[str]]:
    """Ein Bereich mit Inventar-Container: `ha` = Kennungen dessen, was HA dem Bereich zuordnet (Shellys, Fühler, Türen,
    Fenster), `im_container` = Kennung → Ausrüstung der laufenden Einsätze im Container.

    Ergebnis (nachtragen, nicht_in_ha): Was HA hat und das Inventar nicht, trägt der Abgleich nach (Herbert 10.10.2026:
    HA gilt, der Abgleich zieht nach). Was nur im Inventar steckt, wird nur angezeigt – nichts verschwindet von selbst.
    """
    ha_set = list(dict.fromkeys(ha))
    nachtragen = [k for k in ha_set if k not in im_container]
    nicht_in_ha = [aid for k, aid in im_container.items() if k not in ha_set]
    return nachtragen, nicht_in_ha
