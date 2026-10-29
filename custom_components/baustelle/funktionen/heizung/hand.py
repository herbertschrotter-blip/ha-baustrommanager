"""Heizung: nach dem Schalten, Handbetrieb übernehmen und beenden (BSM-023)."""

from __future__ import annotations

from datetime import datetime
from typing import TYPE_CHECKING

from homeassistant.const import STATE_ON
from homeassistant.util import dt as dt_util

from ...const import ROLLE_HEIZKOERPER
from ...logik import regen as regen_logik, warnungen as warn_logik
from ...logik.regelung import HAND_NACHFRIST_MIN, hand_ende, heizgrenze_bezug
from ...texte import GRUND_TEXT
from .typen import HAND_ENDE_TEXT, HEIZ_GRUENDE, WETTER_PROTOKOLL_AB

if TYPE_CHECKING:
    from . import Heizung
    from ...steuerung import GeraetInfo, WetterWerte
    from ..basis import SollJeBereich
    from collections.abc import Sequence


def nach_schalten(hz: Heizung, jetzt: datetime, wetter: WetterWerte) -> None:
    """Einmal am Morgen die Wetter-Entscheidung ins Protokoll (Mockup „05:00 wetter …“), dazu jeder Wechsel."""
    hz._aussen_merken(jetzt, wetter.aussen)   # Soll gleitend: Tagesmittel außen
    hz._tuer_vermuten(jetzt, wetter)   # FE-0025: vor dem Lernen, das die Vermutung übernimmt
    hz._lernen(jetzt, wetter)
    st = hz.st
    zu_warm = hz.zu_warm(wetter)
    heute = jetzt.date().isoformat()
    h = st.e["heizung"]
    if jetzt.time() >= WETTER_PROTOKOLL_AB and st.lz.get("wetter_protokoll") != heute:
        st.lz["wetter_protokoll"] = heute
        wt = st.wetter_tag_plan(jetzt.date())
        teile = []
        if (g := regen_logik.stufe(wt.regen_az_vortag_mm, hz.trocknen_stufen())) is not None and wt.regen_az_vortag_mm is not None:
            teile.append(f"Regen {warn_logik._zahl(wt.regen_az_vortag_mm, 1)} mm gestern in der Arbeitszeit – heute "
                         f"{g.frueher_min} min früher (Kleidung trocknen)")
        if wt.frueh_min_temp is not None and h["fruehstart"] and wt.frueh_min_temp < float(h["fruehstart_unter"]):
            teile.append(f"Kalter Morgen {warn_logik._zahl(wt.frueh_min_temp)} °C – Frühstart {h['fruehstart_min']} min früher")
        bezug = heizgrenze_bezug(str(h["heizgrenze_basis"]), wetter.aussen_max, wetter.aussen)
        if bezug is not None:
            was = "Höchstwert" if h["heizgrenze_basis"] == "tageshoechst" else "jetzt"
            teile.append(
                f"Heizgrenze überschritten ({was} {warn_logik._zahl(bezug, 0)} °C) – heute wird nicht geheizt" if zu_warm
                else f"Heizgrenze nicht erreicht ({was} {warn_logik._zahl(bezug, 0)} °C) – es wird geheizt"
            )
        for text in teile:
            st.protokoll("wetter", None, text)
        hz._zu_warm_vorher = zu_warm
        st.einstellungen.speichern()
    elif hz._zu_warm_vorher is not None and zu_warm != hz._zu_warm_vorher:
        st.protokoll("wetter", None, "Heizgrenze überschritten – Heizung aus" if zu_warm else "Heizgrenze unterschritten – es wird wieder geheizt")
    hz._zu_warm_vorher = zu_warm


def nach_soll(hz: Heizung, soll: SollJeBereich) -> None:
    """Handbetrieb beenden nach `logik/regelung.hand_ende` (FE-0004): Frostschutz/Tür, mit Fühler am Soll, nach der
    Höchstdauer (`hand_h`) oder am nächsten Schaltpunkt."""
    jetzt = dt_util.now()
    max_minuten = float(hz.st.e["meldungen_einst"].get("hand_h") or 8) * 60
    for gid in list(hz.st.lz["hand"]):
        g = hz.st.geraete.get(gid)
        if g is None or g.rolle != ROLLE_HEIZKOERPER or g.bereich not in soll:
            continue
        s, lage = soll[g.bereich]
        if s.ein is None:
            continue
        phase = bool(s.ein) if lage.temperatur is None else s.grund in HEIZ_GRUENDE
        vorher = hz._hand_phase.setdefault(gid, phase)
        z = hz.st.hass.states.get(g.schalter)
        seit = hz.hand_seit(g)
        ende = hand_ende(
            grund=s.grund, phase_vorher=vorher, phase=phase, an=z is not None and z.state == STATE_ON,
            temperatur=lage.temperatur, soll=lage.soll,
            minuten=(jetzt - seit).total_seconds() / 60 if seit is not None else None, max_minuten=max_minuten,
            lassen=warn_logik.warn_key(warn_logik.Art.HAND_ZU_LANGE, g.bereich, g.id) in hz.st.e["stumm"],   # „So lassen“
            nachfrist_min=float(hz.st.e["heizung"].get("hand_nachfrist_min", HAND_NACHFRIST_MIN)),   # AN-0012
        )
        if ende is not None:
            hz.hand_beenden(gid, HAND_ENDE_TEXT[ende].format(
                grund=GRUND_TEXT.get(s.grund, s.grund), soll=warn_logik._zahl(lage.soll), h=warn_logik._zahl(max_minuten / 60, 0)))


def hand_setzen(hz: Heizung, g: GeraetInfo, an: bool) -> bool:
    """Gerät auf Hand: Heizkörper bis zum nächsten Schaltpunkt, andere, solange sie eingeschaltet sind."""
    hand = hz.st.lz["hand"]
    if g.rolle != ROLLE_HEIZKOERPER and not an:
        if hand.pop(g.id, None) is not None:
            hz.st.einstellungen.speichern()
        return True
    if g.id not in hand:
        hand[g.id] = dt_util.now().isoformat(timespec="seconds")
        hz._hand_phase.pop(g.id, None)
        hz.st.einstellungen.speichern()
    hz.st.protokoll("schalten", g.bereich, f"{g.name} von Hand {'eingeschaltet' if an else 'ausgeschaltet'}")
    return True


def hand_nach_einstellung(hz: Heizung, pfad: Sequence[str]) -> None:
    """Wer Soll, Modus oder Automatik ändert, will, dass es sofort gilt – der Handbetrieb dort endet (FE-0004)."""
    pfad = list(pfad)
    if pfad[0] == "bereiche" and len(pfad) > 2 and pfad[2] in ("soll", "modus", "auto", "bedarf"):
        betroffen = {pfad[1]}
    elif pfad in (["automatik"], ["heizung", "soll"]):
        betroffen = set(hz.st.bereiche)
    else:
        return
    for g in [g for g in hz.st.geraete.values() if g.bereich in betroffen]:
        hz.hand_beenden(g.id, "Einstellung geändert – Automatik übernimmt")


def hand_beenden(hz: Heizung, gid: str, grund: str = "") -> None:
    if hz.st.lz["hand"].pop(gid, None) is not None:
        hz._hand_phase.pop(gid, None)
        hz.st.einstellungen.speichern()
        g = hz.st.geraete.get(gid)
        if g is not None and grund:
            hz.st.protokoll("schalten", g.bereich, f"{g.name}: {grund}")
