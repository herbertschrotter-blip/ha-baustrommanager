"""Inventar lesen und ändern (BSM-031.05, docs/bauplan-inventar.md §2) – reine Datenbankzugriffe; Nummern nach den
Regeln aus `logik/inventar.py`."""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import Connection, and_, func, insert, select, update

from ..logik.inventar import MIT_GG, STATUS_AUSRUESTUNG, firmenkuerzel_pruefen, naechste, nummer_frei
from . import schema as s


def _zeile(r: Any) -> dict[str, Any]:
    return {k: (w.isoformat() if isinstance(w, datetime) else w) for k, w in r._mapping.items()}


def lesen(v: Connection) -> dict[str, Any]:
    """Alles fürs Inventar: Container und Ausrüstung mit ihren Einsätzen, Bereiche ohne Container, Firmen."""
    return {
        "container": [_zeile(r) for r in v.execute(select(s.container))],
        "einsaetze": [_zeile(r) for r in v.execute(select(s.container_einsatz).order_by(s.container_einsatz.c.von))],
        "ausruestung": [_zeile(r) for r in v.execute(select(s.ausruestung))],
        "ausruestung_einsaetze": [_zeile(r) for r in v.execute(
            select(s.ausruestung_einsatz).order_by(s.ausruestung_einsatz.c.von))],
        "bereiche_ohne": [_zeile(r) for r in v.execute(
            select(s.bereich.c.id, s.bereich.c.baustelle_id, s.bereich.c.name)
            .where(s.bereich.c.container_id.is_(None), s.bereich.c.entfernt.is_(None), s.bereich.c.art == "container"))],
        "geraete": [_zeile(r) for r in v.execute(   # Typ des Heizkörpers (Konvektor/Radiator) für den Namen
            select(s.geraet.c.id, s.geraet.c.typ, s.geraet.c.rolle).where(s.geraet.c.entfernt.is_(None)))],
        "firmen": [_zeile(r) for r in v.execute(
            select(s.firma.c.baustelle_id, s.firma.c.id, s.firma.c.name, s.firma.c.kuerzel, s.firma.c.eigen)
            .where(s.firma.c.entfernt.is_(None)))],
    }


def container_anlegen(v: Connection, *, art: str, baustelle_id: str, instanz_id: str | None, jetzt: datetime,
                      firma_kuerzel: str | None = None, bereich_id: str | None = None, nr: int | None = None,
                      bereich_name: str | None = None) -> dict[str, Any]:
    """Neuer Container mit erstem Einsatz auf `baustelle_id`. Eigen: nächste Nummer der ganzen Datenbank oder `nr`
    (Bestand: nur eine nie vergebene); fremd (`firma_kuerzel`): nächste Nummer dieser Firma auf dieser Baustelle. Mit
    `bereich_id` wird der Bereich verknüpft; mit `bereich_name` (M12 „+ Container“: Bereich gerade erst angelegt, noch
    nicht gespiegelt) steht er danach auch dann in der Tabelle, wenn das Spiegeln noch aussteht."""
    cid = uuid.uuid4().hex
    werte: dict[str, Any]
    if firma_kuerzel:
        kuerzel = firmenkuerzel_pruefen(firma_kuerzel)
        auf_baustelle = select(s.container_einsatz.c.container_id).where(s.container_einsatz.c.baustelle_id == baustelle_id)
        vorhanden = v.execute(select(s.container.c.fremd_nr).where(
            s.container.c.firma_kuerzel == kuerzel, s.container.c.id.in_(auf_baustelle))).scalars()
        werte = {"nr": None, "firma_kuerzel": kuerzel, "fremd_nr": naechste(vorhanden)}
    else:
        alle = list(v.execute(select(s.container.c.nr)).scalars())
        werte = {"nr": nummer_frei(nr, alle) if nr else naechste(alle), "firma_kuerzel": None, "fremd_nr": None}
    v.execute(insert(s.container).values(id=cid, art=art, status="aktiv", angelegt=jetzt, **werte))
    v.execute(insert(s.container_einsatz).values(container_id=cid, von=jetzt, baustelle_id=baustelle_id,
                                                 bereich_id=bereich_id, instanz_id=instanz_id))
    if bereich_id and not v.execute(update(s.bereich).where(s.bereich.c.id == bereich_id).values(container_id=cid)).rowcount \
            and bereich_name:
        v.execute(insert(s.bereich).values(id=bereich_id, baustelle_id=baustelle_id, name=bereich_name, art="container",
                                           container_id=cid, angelegt=jetzt))
    return {"id": cid, "art": art, **werte}


def container_status(v: Connection, cid: str, status: str, jetzt: datetime) -> bool:
    """aktiv | ausgeschieden; beim Ausscheiden enden der laufende Einsatz (die Daten bleiben bei der Baustelle) und die
    Einsätze seiner Ausrüstung – sie wird frei für einen anderen Container (BSM-034.01)."""
    if status not in ("aktiv", "ausgeschieden"):
        raise ValueError(status)
    if not v.execute(update(s.container).where(s.container.c.id == cid).values(status=status)).rowcount:
        return False
    if status == "ausgeschieden":
        v.execute(update(s.container_einsatz).where(and_(s.container_einsatz.c.container_id == cid,
                                                         s.container_einsatz.c.bis.is_(None))).values(bis=jetzt))
        v.execute(update(s.bereich).where(s.bereich.c.container_id == cid).values(container_id=None))
        lfd = s.ausruestung_einsatz
        v.execute(update(lfd).where(and_(lfd.c.container_id == cid, lfd.c.bis.is_(None))).values(bis=jetzt))
    return True


def ausruestung_status(v: Connection, aid: str, status: str) -> bool:
    """aktiv | inaktiv | verliehen | defekt (logik/geraete.STATUS)."""
    if status not in STATUS_AUSRUESTUNG:
        raise ValueError(status)
    return bool(v.execute(update(s.ausruestung).where(s.ausruestung.c.id == aid).values(status=status)).rowcount)


def firma_kuerzel(v: Connection, baustelle_id: str, firma_id: str, kuerzel: str) -> bool:
    """Kürzel einer Firma der Baustelle setzen (2–5 Buchstaben)."""
    k = firmenkuerzel_pruefen(kuerzel)
    return bool(v.execute(update(s.firma).where(s.firma.c.baustelle_id == baustelle_id, s.firma.c.id == firma_id)
                          .values(kuerzel=k)).rowcount)


def umbenennung_merken(v: Connection, *, container_id: str, benutzer: str | None, jetzt: datetime,
                       schritte: list[dict[str, Any]], status: str) -> int:
    """Eine Umbenennung mit allen Schritten (alt → neu, Ergebnis) für Nachholen und Rückgängig (§6); liefert die Nummer."""
    r = v.execute(insert(s.umbenennung).values(zeit=jetzt, benutzer=benutzer, container_id=container_id,
                                               schritte=schritte, status=status))
    schluessel = r.inserted_primary_key
    assert schluessel is not None
    return int(schluessel[0])


def umbenennung_letzte(v: Connection, container_id: str) -> dict[str, Any] | None:
    """Jüngste Umbenennung eines Containers (für Nachholen und Rückgängig)."""
    r = v.execute(select(s.umbenennung).where(s.umbenennung.c.container_id == container_id)
                  .order_by(s.umbenennung.c.id.desc()).limit(1)).first()
    return _zeile(r) if r is not None else None


def umbenennung_aendern(v: Connection, nr: int, schritte: list[dict[str, Any]], status: str) -> int:
    """Schritte und Status einer Umbenennung nach dem Nachholen."""
    v.execute(update(s.umbenennung).where(s.umbenennung.c.id == nr).values(schritte=schritte, status=status))
    return nr


def umbenennungen_offen(v: Connection) -> list[str]:
    """Container, deren jüngste Umbenennung `teilweise` ist (selbst nachholen)."""
    juengste = select(s.umbenennung.c.container_id, func.max(s.umbenennung.c.id).label("nr")) \
        .group_by(s.umbenennung.c.container_id).subquery()
    return list(v.execute(select(s.umbenennung.c.container_id)
                          .join(juengste, s.umbenennung.c.id == juengste.c.nr)
                          .where(s.umbenennung.c.status == "teilweise")).scalars())


def ausruestung_zuordnen(v: Connection, *, kennung: str, typ: str, modell: str | None, container_id: str,
                         geraet_id: str | None, jetzt: datetime) -> dict[str, Any]:
    """Ausrüstung (per `kennung`, sonst neu) einem Container zuordnen: neuer Einsatz, bei PLUG/PUMP/BTR mit der nächsten
    Gerätenummer im Container. Steckt sie schon in diesem Container, bleibt alles (mit `geraet_id` nachgetragen); steckt
    sie in einem anderen, `ValueError` – erst dort beenden."""
    a = v.execute(select(s.ausruestung).where(s.ausruestung.c.kennung == kennung)).first()
    if a is None:
        aid = uuid.uuid4().hex
        v.execute(insert(s.ausruestung).values(id=aid, typ=typ, modell=modell, kennung=kennung, status="aktiv", angelegt=jetzt))
    else:
        aid = a.id
        if a.status == "defekt":
            raise ValueError("Ausrüstung ist defekt – nicht zuordenbar")
    lfd = s.ausruestung_einsatz
    laufend = v.execute(select(lfd).where(lfd.c.ausruestung_id == aid, lfd.c.bis.is_(None))).first()
    if laufend is not None:
        if laufend.container_id != container_id:
            raise ValueError("Ausrüstung steckt schon in einem anderen Container")
        if geraet_id and laufend.geraet_id != geraet_id:
            v.execute(update(lfd).where(lfd.c.ausruestung_id == aid, lfd.c.von == laufend.von).values(geraet_id=geraet_id))
        return {"id": aid, "gg": laufend.gg, "neu": False}
    gg = None
    if typ in MIT_GG:
        gg = naechste(v.execute(select(lfd.c.gg).where(lfd.c.container_id == container_id, lfd.c.bis.is_(None))).scalars())
    v.execute(insert(lfd).values(ausruestung_id=aid, von=jetzt, container_id=container_id, gg=gg, geraet_id=geraet_id))
    return {"id": aid, "gg": gg, "neu": True}


def status_fuer_geraet(v: Connection, geraet_id: str, status: str) -> bool:
    """Status der Ausrüstung, die gerade als Gerät `geraet_id` (Unter-Eintrag) eingesetzt ist (BSM-034.02); False, wenn
    das Gerät nicht im Inventar ist."""
    if status not in STATUS_AUSRUESTUNG:
        raise ValueError(status)
    lfd = s.ausruestung_einsatz
    ids = select(lfd.c.ausruestung_id).where(lfd.c.geraet_id == geraet_id, lfd.c.bis.is_(None))
    return bool(v.execute(update(s.ausruestung).where(s.ausruestung.c.id.in_(ids)).values(status=status)).rowcount)


def container_von_bereich(v: Connection, bereich_id: str) -> str | None:
    """Container, mit dem der Bereich verknüpft ist (Inventar), sonst None."""
    return v.execute(select(s.bereich.c.container_id).where(s.bereich.c.id == bereich_id)).scalar()


def geraet_entfernt(v: Connection, geraet_id: str, jetzt: datetime) -> int:
    """Gerät (Unter-Eintrag) gelöscht: laufenden Einsatz seiner Ausrüstung beenden – sie wird frei (BSM-034.02)."""
    lfd = s.ausruestung_einsatz
    return v.execute(update(lfd).where(lfd.c.geraet_id == geraet_id, lfd.c.bis.is_(None)).values(bis=jetzt)).rowcount


def geraet_im_container(v: Connection, *, kennung: str, modell: str | None, container_id: str | None, geraet_id: str | None,
                        jetzt: datetime, typ: str = "PLUG") -> dict[str, Any] | None:
    """Gerät (Shelly) steckt jetzt im Bereich mit `container_id` (None = Bereich ohne Inventar): ein laufender Einsatz in
    einem anderen Container endet, im neuen beginnt einer (PLUG, nächste GG). Defekte Ausrüstung bleibt draußen.
    Was HA sagt, gilt – der Abgleich (BSM-034.04) zieht das Inventar nach, nicht umgekehrt."""
    lfd = s.ausruestung_einsatz
    a = v.execute(select(s.ausruestung).where(s.ausruestung.c.kennung == kennung)).first()
    if a is not None:
        v.execute(update(lfd).where(lfd.c.ausruestung_id == a.id, lfd.c.bis.is_(None),
                                    lfd.c.container_id != (container_id or "")).values(bis=jetzt))
    if geraet_id:
        v.execute(update(lfd).where(lfd.c.geraet_id == geraet_id, lfd.c.bis.is_(None),
                                    lfd.c.container_id != (container_id or "")).values(bis=jetzt))
    if container_id is None or (a is not None and a.status == "defekt"):
        return None
    return ausruestung_zuordnen(v, kennung=kennung, typ=typ, modell=modell, container_id=container_id,
                                geraet_id=geraet_id, jetzt=jetzt)


def ausruestung_entfernen(v: Connection, aid: str, jetzt: datetime) -> bool:
    """Laufenden Einsatz einer Ausrüstung beenden (sie wird frei); ihre Geschichte bleibt."""
    lfd = s.ausruestung_einsatz
    return bool(v.execute(update(lfd).where(lfd.c.ausruestung_id == aid, lfd.c.bis.is_(None)).values(bis=jetzt)).rowcount)
