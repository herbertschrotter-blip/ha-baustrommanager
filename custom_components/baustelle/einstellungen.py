"""Einstellungen und Laufzeitdaten einer Baustelle (Store Version 2, Bauplan 0.7 §1).

Sie liegen je Baustelle in einem `Store` (JSON unter `.storage/baustelle.<entry_id>`, in der Sicherung enthalten)
und werden nur noch auf der eigenen Seite bedient (WebSocket `baustelle/setzen`, `baustelle/liste`).

Version 1 (0.6) wird beim Laden umgestellt: Entscheidung „neu anfangen“ (30.09.2026) – nur die Zähler bleiben,
alles andere startet mit den Standardwerten (wie im abgenommenen Mockup).

Die Meldungen aus dem Melden-Knopf gelten für die ganze Integration und liegen in einem eigenen Store
(`.storage/baustelle.meldungen`, `Meldungen`).
"""

from __future__ import annotations

import copy
import json
import logging
import os
from typing import Any

from homeassistant.core import HomeAssistant
from homeassistant.helpers.storage import Store
from homeassistant.util import dt as dt_util
from homeassistant.util.file import write_utf8_file

from .const import DOMAIN
from .db import DATA_DB, instanz_von, meldungen_merken
from .db.schreiber import arbeit
from .db.speicher import OHNE, baustelle_laden, meldungen_laden
from .logik.arbeitszeit import arbeitszeiten_bereinigen, erste_arbeitszeit
from .logik.geraete import reste_entfernen
from .logik.warnungen import Art

_LOGGER = logging.getLogger(__name__)
STORE_VERSION = 2
SPEICHER_VERZOEGERUNG_S = 2
PROTOKOLL_MAX = 1000
MELDUNGEN_KEY = f"{DOMAIN}.meldungen"

EIGEN = "eigen"
ANSCHLUSS_STANDARD = "a1"

STANDARD: dict[str, Any] = {
    "automatik": False,
    "preis": 0.28,
    "preise": [],   # Strompreis mit „gilt ab“ (logik/preise): [{"ab": "2026-09-01", "preis": 0.28}, …]; leer = nur `preis`
    "arbeitszeiten": [],  # beim ersten Laden: eine Arbeitszeit ab heute (siehe `logik.arbeitszeit.erste_arbeitszeit`)
    "ausnahmen": [],
    "heizung": {
        "vorheizen_min": 45,
        "nachheizen_min": 15,
        "soll": 20.0,
        # Soll gleitend nach draußen und nach dem Gefühl (Herbert 01.10.2026, logik/soll): fest | gleitend
        "soll_art": "fest",
        "gleit_min": 21.0,        # § 36 BauV: Aufenthaltsräume mindestens 21 °C (frei einstellbar)
        "gleit_max": 24.0,
        "gleit_je": 0.1,          # °C wärmer je Grad, um den das Außenmittel unter `gleit_bezug` liegt
        "gleit_bezug": 12.0,
        "gleit_tage": 3,
        "toleranz": 0.3,
        "heizgrenze": 15.0,
        "heizgrenze_basis": "tageshoechst",
        "fruehstart": True,
        "fruehstart_unter": 0.0,
        "fruehstart_min": 30,
        # lernende Container (AN-0004): Soll erreicht … min vor Arbeitsbeginn, warm halten … min nach Arbeitsende,
        # frühestens … min vor Arbeitsbeginn heizen
        "warm_vor_min": 0,
        "warm_nach_min": 0,
        "warm_max_min": 120,
        # Zusatz-Heizkörper nur bei Bedarf (AN-0006): weit unter dem Soll, einer schafft es nicht, außergewöhnlich kalt
        "stufen_abstand": 1.5,
        "stufen_min": 30,
        "stufen_anstieg": 0.3,
        "stufen_kalt": -5.0,
        "frost": True,
        "frost_grenze": 5.0,
        "frost_aus": None,        # Frostschutz aus über … °C; None = Grenze + 2 °C (neu 0.7.8)
        "frei_modus": "frost",    # Urlaub und freie Feiertage: frost | absenk | aus (neu 0.7.8)
        "absenk": 10.0,
        "frost_immer": False,     # Frostschutz auch bei ausgeschalteter Automatik (startet aus)
        "frost_aussen": -3.0,     # ohne Fühler: Frostschutz ein unter dieser Außentemperatur (None = aus; Szenarien)
        "trocknen_ab_mm": 2.0,
        "trocknen_laenger_min": 45,
        "trocknen_frueher_min": 15,
        # AN-0021: Stufen nach dem Regen in der Arbeitszeit [{ab_mm, laenger_min, frueher_min}]; None = aus den drei
        # Werten oben (unverändert → Vorgabe 2 mm 60/15, 5 mm 100/30; logik/regen.stufen_aus)
        "trocknen_stufen": None,
        "tuer_pause_min": 3,
        "tuer_melden_min": 10,
        "boost_min": 30,
        # AN-0012: bisher fest – Handbetrieb übernehmen nach der Nachricht, Fühler ohne Wert halten, „heizt tatsächlich“ ab W
        "hand_nachfrist_min": 30,
        "fuehler_halten_min": 15,
        "zieht_strom_w": 50,
        "feiertag_frei": True,
        "notprogramm": False,     # Notprogramm in den Plugs (BSM-017, startet aus wie die Automatik)
        "taste": False,           # Taste am Plug = 1 h heizen (BSM-018, braucht das Notprogramm; startet aus)
        "baseline": False,        # Baseline-Läufe ohne Automatik (BSM-033.04, startet aus wie die Automatik)
        "baseline_eur_monat": 60.0,   # Kostenrahmen der Baseline-Läufe je Monat (Herbert 11.10.2026)
        "klimamittel": None,      # 12 Monatsmittel außen °C für die Hochrechnung (BSM-033.03); None = Vorgabe Graz
    },
    "staffel": {"an": True, "nutzbar_prozent": 67, "max_gleichzeitig": 5, "min_lauf_min": 10, "min_pause_min": 5,
                "takt_min": 15},
    "anschluesse": [{"id": ANSCHLUSS_STANDARD, "name": "Anschluss 1", "ampere": 32, "phasen": 3, "reserve_kw": 3.0}],
    "firmen": [{"id": EIGEN, "name": "Eigene Firma", "eigen": True}],
    "zuordnung": [],
    "bereiche": {},
    # „frueher“: Nachricht „Noch früher“ – Tag (ISO) → zusätzliche Minuten Frühstart; „regen“: Regen je Tag (mm) für
    # „nach Regen früher“ am Folgetag
    "laufzeit": {"bedarf_bis": {}, "boost_bis": {}, "taste_bis": {}, "jetzt_bis": None, "hand": {}, "frueher": {}, "regen": {},
                 "lernen": {}, "warm_start": {},
                 "aussen_tage": {}, "gefuehl": [], "soll_versch": {},
                 "np_plugs": {}},   # Notprogramm: Gerät → Schalter aller Plugs mit Skript (zum Abschalten, BSM-034.01)   # Soll gleitend: Tagesmittel außen, Rückmeldungen, + / −   # lernen: Lernstand je Container (logik/lernen, 0.8)
    "meldungen_einst": {
        "empfaenger": [],
        "knoepfe": True,
        "arten": {str(a): True for a in Art},
        "kalt_min": 60,
        "hand_h": 8,
        "zyklen_h": 10,
        "dauerlauf_min": 20,
        "trocken_unter_w": 30,
        "offline_min": 5,
    },
    "bericht": {"haeufigkeit": "woche", "handy": True, "mail": False, "mail_an": "", "mail_dienst": "", "csv": True},
    "termine_kalender": None,
    "stumm": {},
    "melden_knopf": True,
    "auswertung_quelle": "datenbank",   # BSM-014: Auswertung aus der eigenen Datenbank; „statistik“ = HA-Langzeitstatistik
    "erklaer": True,          # Erklärtexte „ⓘ“ auf der Seite (0.7.8)
    "geraete": {},            # je Gerät {"aktiv": False} = inaktiv: Automatik lässt es aus, keine Warnungen (WU-0004);
                              # {"zusatz": True} = Zusatz-Heizkörper (AN-0006)
    # FE-0029: einmalig nachgetragene Zähler (baustelle/zaehler_korrigieren) – Ausgleich für die Statistik (logik/ruecksprung)
    "korrekturen": [],
    "protokoll": [],
    # Zähler wie 0.6: Energie, Kosten, Zeiten, Zyklen, Mittel; „stand:<gerät>“ = letzter Zählerstand des Shelly
    "zaehler": {},
}

STANDARD_BEREICH: dict[str, Any] = {
    "auto": True,
    "trocknen": False,
    "soll": None,
    "bedarf": False,
    "prio": "normal",
    "anschluss": ANSCHLUSS_STANDARD,
    "tuer": None,
    # Modus (neu 0.7.8): plan | thermo | bedarf | hand | aus; None = aus `auto`/`bedarf` und Fühler abgeleitet
    "modus": None,
    "lernen": False,   # lernende Regelung (0.8): TPI mit gelerntem Nachlauf, startet aus
    "warm_vor": None,  # AN-0004: eigener Wert für „Soll erreicht vor Beginn“; None = wie die Baustelle
    "warm_nach": None,
    "stufen": False,   # AN-0006: Zusatz-Heizkörper nur bei Bedarf (ab 2 Heizkörpern)
    "primaer": None,   # AN-0015: Primärheizkörper (Geräte-ID); None = automatisch
    "groesse_m2": None,   # AN-0014: Fläche innen in m²; None = Einzelcontainer (13,5 m²), Doppel 28 m²
    "symbol": None,       # BSM-032: Aussehen des Container-Symbols (logik/symbol); None = eine Tür, ein Fenster
}


def _ergaenzen(ziel: dict[str, Any], vorlage: dict[str, Any]) -> dict[str, Any]:
    """Fehlende Schlüssel aus der Vorlage übernehmen (neue Einstellungen nach Updates)."""
    for schluessel, wert in vorlage.items():
        if schluessel not in ziel or (ziel[schluessel] is None and wert is not None and isinstance(wert, dict)):
            ziel[schluessel] = copy.deepcopy(wert)
        elif isinstance(wert, dict) and isinstance(ziel[schluessel], dict):
            _ergaenzen(ziel[schluessel], wert)
    return ziel


class _BaustelleStore(Store[dict[str, Any]]):
    """Store mit Umstellung von Version 1 (0.6): nur die Zähler bleiben."""

    async def _async_migrate_func(
        self, old_major_version: int, old_minor_version: int, old_data: dict[str, Any]
    ) -> dict[str, Any]:
        if old_major_version < 2:
            return {"zaehler": dict((old_data or {}).get("zaehler") or {}), "_von_v1": True}
        return old_data


class Einstellungen:
    """Gespeicherte Einstellungen und Laufzeitdaten einer Baustelle."""

    def __init__(self, hass: HomeAssistant, entry_id: str) -> None:
        self._hass = hass
        self._entry_id = entry_id
        self._store: Store[dict[str, Any]] = _BaustelleStore(hass, STORE_VERSION, f"{DOMAIN}.{entry_id}")
        self.daten: dict[str, Any] = copy.deepcopy(STANDARD)
        self.von_v1 = False
        self._faellig: float | None = None  # Loop-Zeit, zu der der eingeplante Schreibvorgang läuft
        # BSM-015: eigene Datenbank als Quelle – was zuletzt dorthin geschrieben wurde (nur Änderungen schreiben)
        self.quelle = "store"
        self._db_alt: dict[str, str] = {}
        self._db_merker = False

    async def async_laden(self, bereich_ids: list[str], empfaenger: list[str] | None = None,
                          geraet_ids: list[str] | None = None) -> None:
        """Laden, fehlende Werte ergänzen, Einstellungen gelöschter Bereiche (mit `geraet_ids` auch Einstellungen, Zähler
        und „stumm“ gelöschter Geräte und Container, logik/geraete) entfernen.

        `empfaenger` (aus den Optionen von 0.6) wird übernommen, solange im Store noch keiner eingetragen ist.
        """
        gespeichert = await self._db_laden()
        if gespeichert is None:   # Datenbank noch nicht Quelle (erster Start mit 0.8.61) oder nicht lesbar: Store
            gespeichert = await self._store.async_load() or {}
        self.von_v1 = bool(gespeichert.pop("_von_v1", False))
        neu = not gespeichert or self.von_v1
        self.daten = _ergaenzen(gespeichert, STANDARD)
        if neu and not self.daten["arbeitszeiten"]:
            self.daten["arbeitszeiten"] = [erste_arbeitszeit(dt_util.now().date())]
        # automatische kennzeichnen und wegnehmen, sobald es eine eigene gibt (FE-0002)
        bereinigt = arbeitszeiten_bereinigen(self.daten["arbeitszeiten"])
        geaendert = bereinigt != self.daten["arbeitszeiten"]
        self.daten["arbeitszeiten"] = bereinigt
        if empfaenger and not self.daten["meldungen_einst"]["empfaenger"]:
            self.daten["meldungen_einst"]["empfaenger"] = list(empfaenger)
        bereiche = self.daten["bereiche"]
        for bid in list(bereiche):
            if bid not in bereich_ids:
                del bereiche[bid]
        erster = (self.daten["anschluesse"] or [{"id": ANSCHLUSS_STANDARD}])[0]["id"]
        for bid in bereich_ids:
            b = bereiche.setdefault(bid, {})
            _ergaenzen(b, {**STANDARD_BEREICH, "anschluss": erster})
        if geraet_ids is not None and (weg := reste_entfernen(self.daten, bereich_ids, geraet_ids)):
            _LOGGER.debug("Reste gelöschter Geräte und Container entfernt: %s", weg)
            geaendert = True
        del self.daten["protokoll"][PROTOKOLL_MAX:]
        if neu or geaendert or (self.quelle == "store" and self._db_bereit()):
            self.speichern()   # beim ersten Start mit der Datenbank: ganzer Stand als Ausgangsstand (Merker)

    def speichern(self, verzoegerung: float = SPEICHER_VERZOEGERUNG_S) -> None:
        """Verzögert speichern (mehrere Änderungen hintereinander → ein Schreibvorgang).

        `Store.async_delay_save` verschiebt einen eingeplanten Schreibvorgang bei jedem Aufruf nach hinten. Die
        Zähler ändern sich bei jedem Messwert (alle paar Sekunden) – dann würde nie geschrieben und bei Stromausfall
        gingen die Zähler seit dem letzten Neustart verloren. Deshalb: steht schon ein Schreibvorgang an, der
        spätestens zur gewünschten Zeit läuft, bleibt er (er schreibt den dann aktuellen Stand, `data_func`).
        """
        jetzt = self._hass.loop.time()
        ziel = jetzt + verzoegerung
        if self._faellig is not None and jetzt < self._faellig <= ziel:
            return
        self._faellig = ziel
        self._store.async_delay_save(self._sichern, verzoegerung)

    def _sichern(self) -> dict[str, Any]:
        """Beim (verzögerten) Speichern: Änderungen auch in die eigene Datenbank (BSM-015); Store bleibt Kopie."""
        self._db_schreiben()
        return self.daten

    async def async_jetzt_speichern(self) -> None:
        """Sofort speichern (beim Entladen)."""
        self._faellig = None
        self._db_schreiben()
        if (db := self._hass.data.get(DATA_DB)) is not None:
            await db.schreiber.async_schreiben()
        await self._store.async_save(self.daten)

    # ------------------------------------------------------------------ eigene Datenbank (BSM-015)
    def _db_bereit(self) -> bool:
        db = self._hass.data.get(DATA_DB)
        return db is not None and db.bereit

    async def _db_laden(self) -> dict[str, Any] | None:
        db = self._hass.data.get(DATA_DB)
        if db is None or not db.bereit:
            if db is not None:
                _LOGGER.warning("Datenbank nicht lesbar (%s) – Einstellungen aus der Store-Kopie", db.fehler)
            return None
        daten = await db.async_ausfuehren(lambda v: baustelle_laden(v, self._entry_id))
        if daten is None:
            return None
        self.quelle, self._db_merker = "datenbank", True
        self._db_alt = self._db_stand(daten)
        return daten

    @staticmethod
    def _db_stand(daten: dict[str, Any]) -> dict[str, str]:
        stand = {f"e:{k}": json.dumps(w, sort_keys=True, default=str) for k, w in daten.items() if k not in OHNE}
        stand["zaehler"] = json.dumps(daten.get("zaehler") or {}, sort_keys=True, default=str)
        stand.update({f"lz:{k}": json.dumps(w, sort_keys=True, default=str) for k, w in (daten.get("laufzeit") or {}).items()})
        return stand

    def _db_schreiben(self) -> None:
        """Was sich seit dem letzten Schreiben geändert hat, in die Datenbank (über die Warteschlange)."""
        if not self._db_bereit():
            return
        neu = self._db_stand(self.daten)
        geaendert = {k for k, t in neu.items() if self._db_alt.get(k) != t}
        if not geaendert and self._db_merker:
            return
        einstellungen = {k[2:]: json.loads(neu[k]) for k in geaendert if k.startswith("e:")}
        laufzeit = {k[3:]: json.loads(neu[k]) for k in geaendert if k.startswith("lz:")}
        zaehler = json.loads(neu["zaehler"]) if "zaehler" in geaendert else None
        quelle, merker, bid = ("speichern" if self._db_merker else "umstellung"), not self._db_merker, self._entry_id
        db = self._hass.data[DATA_DB]
        db.schreiber.dazu(arbeit("baustelle_speichern", bid, einstellungen, zaehler, laufzeit, quelle, merker))
        self._hass.async_create_task(db.schreiber.async_schreiben(), "baustelle_einstellungen_datenbank")
        self._db_alt, self._db_merker, self.quelle = neu, True, "datenbank"

    async def async_entfernen(self) -> None:
        """Datei beim Löschen der Baustelle entfernen."""
        await self._store.async_remove()

    def bereich(self, bereich_id: str) -> dict[str, Any]:
        """Einstellungen eines Bereichs."""
        bereich: dict[str, Any] = self.daten["bereiche"].setdefault(bereich_id, copy.deepcopy(STANDARD_BEREICH))
        return bereich

    def protokoll(self, eintrag: list[Any]) -> None:
        """Eintrag vorne anfügen, höchstens `PROTOKOLL_MAX` behalten."""
        liste = self.daten["protokoll"]
        liste.insert(0, eintrag)
        del liste[PROTOKOLL_MAX:]
        self.speichern()


ART_TEXT = {"fehler": "Fehler", "wunsch": "Wunsch", "anregung": "Anregung"}
# Tickets: Präfix je Art, Nummer je Art aufsteigend ab 0001 (Herbert, 30.09.2026)
PRAEFIX = {"fehler": "FE", "wunsch": "WU", "anregung": "AN"}
# Status wie im Skill „ticket“: neu → angenommen → in_arbeit → geloest → geschlossen, daneben verworfen
TICKET_STATUS = ["neu", "angenommen", "in_arbeit", "geloest", "geschlossen", "verworfen"]
STATUS_TEXT = {"neu": "neu", "angenommen": "angenommen", "in_arbeit": "in Arbeit", "geloest": "gelöst",
               "geschlossen": "geschlossen", "verworfen": "verworfen"}
TICKET_OFFEN = {"neu", "angenommen", "in_arbeit", "geloest"}
STATUS_ALT = {"offen": "neu", "erledigt": "geschlossen"}  # Meldungen aus 0.7.0–0.7.3


def meldungen_markdown(liste: list[dict[str, Any]], stand: str) -> str:
    """Tickets lesbar: offene zuerst, je Ticket Nummer, Art, Status, Zeit, Version, Gerät, Fenster, Seite, Text, Verlauf."""
    offen = [m for m in liste if m.get("status") in TICKET_OFFEN]
    erledigt = [m for m in liste if m.get("status") not in TICKET_OFFEN]
    zeilen = ["# Meldungen aus dem Melden-Knopf (Tickets)", "",
              f"Stand: {stand} · offen: {len(offen)} · erledigt: {len(erledigt)}", "",
              "Diese Datei schreibt die Integration Baustelle bei jeder Änderung neu. Quelle ist ihr Speicher; "
              "Status und Notizen ändert `tools/ticket.py` (Dienst baustelle.ticket), angesehen und geschlossen wird "
              "auf der Seite unter Einstellungen › Entwicklung.", ""]
    for titel, teil in (("Offen", offen), ("Erledigt", erledigt)):
        zeilen += [f"## {titel}", ""]
        if not teil:
            zeilen += ["(keine)", ""]
        for m in teil:
            kopf = " · ".join(str(x) for x in (
                m.get("ticket"), ART_TEXT.get(str(m.get("art")), m.get("art")), STATUS_TEXT.get(str(m.get("status")), m.get("status")),
                str(m.get("zeit") or "")[:16].replace("T", " "), f"v{m.get('version')}" if m.get("version") else "", m.get("geraet")) if x)
            zeilen += [f"### {kopf}", "", str(m.get("text") or "").strip(), ""]
            if m.get("kontext"):
                zeilen.append(f"- Fenster: {m['kontext']}")
            if m.get("seite"):
                zeilen.append(f"- Seite: `{json.dumps(m['seite'], ensure_ascii=False)}`")
            if m.get("baustelle"):
                zeilen.append(f"- Baustelle: {m['baustelle']}")
            if m.get("bilder"):   # WU-0016
                zeilen.append("- Bilder: " + ", ".join(f"baustelle/meldungen/{b}" for b in m["bilder"]))
            zeilen.append(f"- id: {m.get('id')}")
            for v in m.get("verlauf") or []:
                teile = [STATUS_TEXT.get(v.get("status"), v.get("status")) if v.get("status") else "",
                         f"v{v['version']}" if v.get("version") else "", f"Commit {v['commit']}" if v.get("commit") else "",
                         v.get("notiz") or ""]
                zeilen.append(f"- {str(v.get('zeit') or '')[:16].replace('T', ' ')} ({v.get('von') or '–'}): " + " · ".join(t for t in teile if t))
            zeilen.append("")
    return "\n".join(zeilen)


def _meldungen_schreiben(ordner: str, liste: list[dict[str, Any]], stand: str) -> None:
    os.makedirs(ordner, exist_ok=True)
    write_utf8_file(os.path.join(ordner, "meldungen.json"), json.dumps(liste, ensure_ascii=False, indent=2) + "\n")
    write_utf8_file(os.path.join(ordner, "meldungen.md"), meldungen_markdown(liste, stand) + "\n")


class Meldungen:
    """Meldungen aus dem Melden-Knopf (Fehler, Wünsche, Anregungen) – eine Liste für die ganze Integration.

    Quelle ist der Store; zusätzlich schreibt die Integration die Liste lesbar nach `<config>/baustelle/meldungen.json`
    und `meldungen.md` (beim Laden und nach jeder Änderung), damit sie ohne Zugriff auf `.storage/` gelesen und
    abgearbeitet werden kann. Die Meldungen enthalten nur, was im Melden-Dialog steht – keine Zugangsdaten.
    """

    def __init__(self, hass: HomeAssistant) -> None:
        self._hass = hass
        self._store: Store[dict[str, Any]] = Store(hass, 1, MELDUNGEN_KEY)
        self.liste: list[dict[str, Any]] = []
        self.nummern: dict[str, int] = {}
        self._geladen = False
        self.ordner = hass.config.path(DOMAIN)

    async def async_laden(self) -> list[dict[str, Any]]:
        if not self._geladen:
            aus_db = None
            if (db := self._hass.data.get(DATA_DB)) is not None and db.bereit:   # BSM-015: Datenbank ist Quelle
                instanz = instanz_von(db)
                aus_db = await db.async_ausfuehren(lambda v: meldungen_laden(v, instanz))
            if aus_db is not None:
                self.liste, self.nummern = aus_db
            else:   # erster Start mit 0.8.61 bzw. Datenbank nicht lesbar: Store
                daten = (await self._store.async_load()) or {}
                self.liste = list(daten.get("meldungen") or [])
                self.nummern = {k: int(v) for k, v in (daten.get("nummern") or {}).items()}
                if db is not None and db.bereit:
                    meldungen_merken(self._hass, copy.deepcopy(self.liste), dict(self.nummern))   # Umstellung
            self._geladen = True
            if self._nummerieren():
                self.speichern()
            else:
                await self.async_exportieren()
        return self.liste

    def _nummerieren(self) -> bool:
        """Ältere Meldungen ohne Ticketnummer nummerieren (älteste zuerst), alte Status auf die Ticket-Status umstellen."""
        geaendert = False
        for m in reversed(self.liste):
            if m.get("status") in STATUS_ALT:
                m["status"] = STATUS_ALT[m["status"]]
                geaendert = True
            if not m.get("ticket"):
                m["ticket"] = self.neue_nummer(str(m.get("art") or "fehler"))
                geaendert = True
        return geaendert

    def neue_nummer(self, art: str) -> str:
        """Nächste Ticketnummer der Art, z. B. FE-0001."""
        praefix = PRAEFIX.get(art, "FE")
        n = self.nummern.get(praefix, 0) + 1
        self.nummern[praefix] = n
        return f"{praefix}-{n:04d}"

    def finden(self, schluessel: str) -> dict[str, Any] | None:
        """Ticket nach Nummer (FE-0001, groß/klein egal) oder id."""
        s = schluessel.strip().upper()
        return next((m for m in self.liste if str(m.get("ticket", "")).upper() == s or m.get("id") == schluessel.strip()), None)

    def aendern(self, m: dict[str, Any], *, status: str | None = None, notiz: str | None = None,
                version: str | None = None, commit: str | None = None, von: str = "") -> None:
        """Status/Notiz eines Tickets ändern und im Verlauf festhalten."""
        jetzt = dt_util.now().isoformat(timespec="seconds")
        eintrag = {"zeit": jetzt, "von": von}
        if status:
            m["status"] = STATUS_ALT.get(status, status)
            m["stand"] = jetzt
            eintrag["status"] = m["status"]
        for k, v in (("notiz", notiz), ("version", version), ("commit", commit)):
            if v:
                eintrag[k] = v
        m.setdefault("verlauf", []).append(eintrag)
        self.speichern()

    async def async_exportieren(self) -> None:
        """Lesbare Kopie nach <config>/baustelle/ schreiben (im Hintergrund-Thread)."""
        await self._hass.async_add_executor_job(
            _meldungen_schreiben, self.ordner, copy.deepcopy(self.liste), dt_util.now().isoformat(timespec="seconds"))

    def speichern(self) -> None:
        self._store.async_delay_save(lambda: {"meldungen": self.liste, "nummern": self.nummern}, SPEICHER_VERZOEGERUNG_S)
        meldungen_merken(self._hass, copy.deepcopy(self.liste), dict(self.nummern))   # eigene Datenbank (Quelle seit BSM-015)
        self._hass.async_create_task(self.async_exportieren(), "baustelle_meldungen_exportieren")
