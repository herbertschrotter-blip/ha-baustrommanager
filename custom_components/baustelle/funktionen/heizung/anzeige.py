"""Heizung: Warnungen, Anzeige der Container und Status (BSM-023)."""

from __future__ import annotations

from datetime import datetime, timedelta
from typing import TYPE_CHECKING, Any

from homeassistant.const import STATE_ON

from ...const import HEIZROLLEN, ROLLE_HEIZKOERPER
from ...logik import eingestellt as eingestellt_logik, lernen
from ...logik import sensoren as sensor_logik, warnungen as warn_logik
from ...logik.arbeitszeit import AusnahmeArt, StatusArt, frei_gilt, status as plan_status, uhrzeit
from ...logik.regelung import SollGrund
from ...texte import wochentag
from ..basis import mitternacht, zahl
from .typen import ABSCHNITT_TEXT, HEIZ_GRUENDE, TAKT_GRUENDE

if TYPE_CHECKING:
    from . import Heizung
    from ...logik.regelung import LageContainer, Soll
    from ...steuerung import BereichInfo, GeraetInfo
    from ..basis import SollJeBereich


def warnungen(hz: Heizung, jetzt: datetime, soll: SollJeBereich) -> list[warn_logik.ContainerZustand]:
    st = hz.st
    liste = []
    for info in hz.bereiche():
        s_c = soll.get(info.id)
        temp = st.temperatur(info.fuehler)
        soll_t = hz.soll_temperatur(info.id)
        in_az = s_c is not None and s_c[0].grund == SollGrund.ARBEITSZEIT and st.automatik
        if in_az and temp is not None and temp < soll_t - 1.0:
            hz._unter_soll_seit.setdefault(info.id, jetzt)
        else:
            hz._unter_soll_seit.pop(info.id, None)
        frost = s_c is not None and s_c[0].grund == SollGrund.FROST   # Frost geht vor: nicht „pausiert“ melden (Szenario-Befund)
        tuer_seit = None if frost or info.id in hz.tuer_trotzdem else st.kontakt_offen_seit(info.id)   # BSM-034.03
        sens = st.sensoren(info.id)
        pausiert = s_c is not None and s_c[0].grund == SollGrund.TUER_OFFEN   # sonst: Sicherheitshinweis (Szenarien)
        liste.append(
            warn_logik.ContainerZustand(
                id=info.id, temperatur=temp, soll=soll_t, in_arbeitszeit=in_az, fuehler=bool(info.fuehler),
                batterie=st.batterie(info.fuehler) if info.fuehler else None,
                batterien=tuple((x.name, x.entity_id, st.batterie(x.entity_id)) for x in sens if x.art != "fuehler"),
                unter_soll_seit=hz._unter_soll_seit.get(info.id), tuer_offen_seit=tuer_seit, tuer_pausiert=pausiert,
                modus=hz.modus(info.id),
            )
        )
    return liste


def anzeige(hz: Heizung, bid: str, info: BereichInfo, jetzt: datetime, soll: SollJeBereich, offline: bool, an: bool
) -> tuple[str, str, str]:
    """Zustand und Text eines Containers wie die Kacheln im Mockup (`TEXT(b)`)."""
    st = hz.st
    geraete = st.geraete_in(bid)
    s_c = soll.get(bid)
    grund = s_c[0].grund if s_c else SollGrund.AUTOMATIK_AUS
    heizer_an = any(
        (z := st.hass.states.get(g.schalter)) is not None and z.state == STATE_ON
        for g in geraete if g.rolle in HEIZROLLEN
    )
    # „heizt“ (Glühen, Flammen im Symbol) nur bei echtem Verbrauch: ein eingeschalteter Heizkörper zieht über
    # ZIEHT_STROM_W; ohne Leistungssensor zählt der Schalter (Meldung Herbert, 30.09.2026)
    zieht = any(hz._zieht_strom(g) for g in geraete if g.rolle in HEIZROLLEN)
    e = st.einstellungen.bereich(bid)
    # FE-0015: mit Fühler regelt die Integration auf das Soll („heizt auf 22,6 °C“), sonst gilt der Heizplan und der
    # Regler am Heizkörper – dazu der Abschnitt des Tages
    regelt = hz.modus(bid) in ("thermo", "bedarf") and st.daten.temperatur[bid] is not None
    takt = _takt(hz, bid, s_c, jetzt) if not offline else None
    takt_gilt = False   # nur in den Zweigen, in denen die lernende Regelung gerade im Takt schaltet
    aus_bis: str | None = None   # FE-0031/32: Zeit aus „aus bis …“ für den Jetzt-Chip (start.aus_bis)
    abschnitt = ABSCHNITT_TEXT.get(str(grund))
    dazu = f" · {abschnitt}" if abschnitt else ""
    if offline:
        zustand, text = "offline", "nicht erreichbar"
    elif heizer_an and not zieht and grund not in (SollGrund.TUER_OFFEN, SollGrund.BEREIT):
        zustand, text = "aus", ("an · zieht keinen Strom" if regelt else f"an · Regler am Gerät aus{dazu}")   # Szenarien
    elif grund == SollGrund.FROST and zieht:
        zustand, text = "frost", "Frostschutz"
    elif grund == SollGrund.TUER_OFFEN:
        zustand, text = "pause", "pausiert · Tür offen"
    elif grund == SollGrund.BOOST and zieht:
        zustand, text = "heizt", "⚡ schnell aufheizen"
    elif grund == SollGrund.TASTE and heizer_an:   # BSM-018
        bis = hz.bis("taste_bis", bid, jetzt)
        zustand, text = "heizt", "Taste am Plug" + (f" · bis {bis:%H:%M}" if bis else "")
    elif grund == SollGrund.BASELINE and heizer_an:   # BSM-033.04
        zustand, text = "heizt", "Baseline-Messung · Thermostat am Gerät regelt"
    elif grund == SollGrund.BEREIT:
        zustand, text = "bereit", "bei Bedarf · nur Frostschutz"
    elif grund == SollGrund.AUS and not heizer_an:
        zustand, text = "aus", "aus · nur Frostschutz"
    elif heizer_an and grund == SollGrund.TROCKNEN:
        zustand, text = "trocknen", "Kleidung trocknen"
        takt_gilt = regelt
    elif heizer_an:
        zustand = "heizt"
        if grund == SollGrund.BEDARF:
            bis = hz.bis("bedarf_bis", bid, jetzt) or hz._termin_ende(bid, jetzt)
            text = f"heizt bis {bis.strftime('%H:%M')}" if bis else "heizt · bei Bedarf"
            takt_gilt = True
        elif grund == SollGrund.HAND or not e["auto"] or any(g.id in st.lz["hand"] for g in geraete if g.rolle in HEIZROLLEN):
            text = "heizt · Hand"   # auch ein Heizkörper im Handbetrieb (FE-0004), auch ohne Fühler (Szenarien)
        elif grund == SollGrund.ABSENKEN:
            text = "heizt · abgesenkt"
        elif regelt:
            text = f"heizt auf {warn_logik._zahl(hz.soll_temperatur(bid))} °C{dazu}"
            takt_gilt = True
        else:
            text = f"heizt · Heizplan{dazu}"
    else:
        zustand = "aus"
        naechster = hz._naechster_start(jetzt, bid)
        text = f"aus bis {naechster}" if naechster else "aus"
        aus_bis = naechster
        # FE-0014: in der Heizzeit aus, weil die Regelung gerade nicht heizen will – das sagen, statt „aus bis …“
        if grund in HEIZ_GRUENDE and grund not in (SollGrund.FROST, SollGrund.ABSENKEN):
            innen = st.daten.temperatur[bid]
            takt_gilt = takt is not None
            aus_bis = None
            if takt is not None and takt["art"] != "erreicht":
                # Takt-Pause verständlich (Mockup takt.html): bis wann; ohne „bis“ ist die Runde unterbrochen
                text = f"Pause bis {takt['bis']}" if takt["bis"] else "Pause · wartet"
            elif innen is not None:
                text = f"Soll erreicht · hält {warn_logik._zahl(hz.soll_temperatur(bid))} °C"
    if an and not heizer_an and zustand == "aus":
        text = "aus · Steckdose an"
        takt_gilt = False
        aus_bis = None
    if zustand in ("aus", "bereit") and grund != SollGrund.TUER_OFFEN and hz._tuer_offen(bid):
        text = f"{text} · 🚪 Tür offen"
    if aus_bis:
        hz._aus_bis[bid] = aus_bis
    else:
        hz._aus_bis.pop(bid, None)
    if takt is not None and takt_gilt:
        hz.takt[bid] = takt
    else:
        hz.takt.pop(bid, None)
    return zustand, text, str(grund)


def _takt(hz: Heizung, bid: str, s_c: tuple[Soll, LageContainer] | None, jetzt: datetime) -> dict[str, Any] | None:
    """Takt der lernenden Regelung (logik/lernen.takt_anzeige) – nur, wenn sie gerade selbst auf das Soll regelt
    (`TAKT_GRUENDE`, mit TPI, kein Heizkörper von Hand). `an`: ein Heizkörper, den die Automatik schaltet, ist ein."""
    if s_c is None or s_c[0].grund not in TAKT_GRUENDE or (lage := s_c[1]).tpi is None or lage.temperatur is None:
        return None
    heizer = [g for g in hz.st.geraete_in(bid) if g.rolle == ROLLE_HEIZKOERPER]
    if any(g.id in hz.st.lz["hand"] for g in heizer):
        return None
    an = any((z := hz.st.hass.states.get(g.schalter)) is not None and z.state == STATE_ON for g in heizer if hz.st.geraet_aktiv(g))
    anteil = lernen.tpi_anteil(lage.temperatur, lage.soll, lage.tpi)
    return lernen.takt_anzeige(anteil, lage.tpi.minute_im_zyklus, an, jetzt)


def eingestellt(hz: Heizung, bid: str) -> list[dict[str, Any]]:
    """Eingeschaltete Einstellungen des Containers für den Kopf der Seite (logik/eingestellt, Mockup eingestellt.html C)."""
    st = hz.st
    info = st.bereiche.get(bid)
    heizer = hz.heizer_von(bid)
    namen = {g.id: g.name for g in heizer}
    haupt, zusatz = hz.haupt_und_zusatz(bid) if len(heizer) >= 2 else ([], [])
    lage = eingestellt_logik.Lage(
        heizung=st.e["heizung"], staffel=st.e["staffel"], bereich=st.einstellungen.bereich(bid), automatik=st.automatik,
        modus=hz.modus(bid), fuehler=bool(info is not None and info.fuehler), heizkoerper=len(heizer),
        primaer=namen.get(haupt[0]) if haupt else None, zusatz=tuple(namen[g] for g in zusatz if g in namen),
        kontakte=tuple(s.name for s in st.sensoren(bid) if s.art in sensor_logik.KONTAKTE),
    )
    return eingestellt_logik.eingestellt(lage)


def _zieht_strom(hz: Heizung, g: GeraetInfo) -> bool:
    """Eingeschaltet und – falls gemessen – über `zieht_w`."""
    z = hz.st.hass.states.get(g.schalter)
    if z is None or z.state != STATE_ON:
        return False
    if not g.leistung:
        return True
    w = zahl(hz.st.hass.states.get(g.leistung))
    return w is None or w > hz.zieht_w()  # Sensor ohne Wert: wie ohne Messung


def _naechster_start(hz: Heizung, jetzt: datetime, bid: str) -> str | None:
    e = hz.st.einstellungen.bereich(bid)
    if e["bedarf"] or not e["auto"] or not hz.st.automatik:
        return None
    s = plan_status(jetzt.date(), jetzt.hour * 60 + jetzt.minute, lambda t: hz.plan_bereich(t, bid, jetzt))
    if s.minute is None or s.tag is None or s.art == StatusArt.HEIZT:
        return None
    if s.tag == jetzt.date():
        return uhrzeit(s.minute)  # Mockup „aus bis 06:15“
    if s.tag == jetzt.date() + timedelta(days=1):
        return f"morgen {uhrzeit(s.minute)}"   # FE-0031/32: „aus bis morgen 03:30“ (wie der Plan-Chip)
    return f"{wochentag(s.tag)} {uhrzeit(s.minute)}"


def status(hz: Heizung, jetzt: datetime) -> tuple[str, str, datetime | None] | None:
    """Status der Baustelle und Text neben dem Automatik-Chip (Mockup `statusText`)."""
    st = hz.st
    if not st.automatik:
        return "automatik_aus", "Handbetrieb – nichts wird geschaltet", None
    heute, minute = jetzt.date(), jetzt.hour * 60 + jetzt.minute
    jetzt_bis = hz.jetzt_bis(jetzt)
    if jetzt_bis is not None:
        return "heizt", f"♨ alle heizen bis {jetzt_bis.strftime('%H:%M')}", jetzt_bis
    trocknet = any(hz.st.einstellungen.bereich(b.id).get("trocknen") for b in hz.bereiche())   # nur, wenn einer trocknet
    s = plan_status(heute, minute, lambda t: hz.plan(t, trocknet))
    naechste = mitternacht(s.tag) + timedelta(minutes=s.minute) if s.minute is not None and s.tag is not None else None
    heizt = any(z in ("heizt", "trocknen", "frost") for z in st.daten.zustand.values())
    ausnahme = next((a for a in st.ausnahmen() if a.datum == heute), None)
    if ausnahme is not None and ausnahme.art == AusnahmeArt.FREI:
        status = "frei"
    elif frei_gilt(hz.ist_frei(heute), ausnahme):
        status = st.frei_art(heute) or "frei"
    elif hz.zu_warm(st.daten.wetter):
        status = "heizgrenze"
    else:
        status = "heizt" if heizt else "bereit"
    if s.art == StatusArt.HEIZT:
        text = f"♨ heizt bis {uhrzeit(s.minute or 0)}"
    elif s.art == StatusArt.START:
        text = f"Start um {uhrzeit(s.minute or 0)}"
    elif s.tag is not None:
        wann = "morgen" if s.tag == heute + timedelta(days=1) else wochentag(s.tag)
        text = f"aus · {wann} ab {uhrzeit(s.minute or 0)}"
    else:
        text = "aus"
    return status, text, naechste
