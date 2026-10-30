"""Notprogramm in den Plugs einrichten und aktuell halten (Bauplan 0.7 §9, BSM-017).

Alle 5 min je Heizungs-Plug (Shelly Gen2+, Adresse aus der Shelly-Integration):
1. Skript `baustelle` vorhanden, in der Version von `shelly/notprogramm.js` und gestartet? Sonst anlegen bzw. neu
   hochladen (`Script.Create`, `Script.PutCode` in Stücken, `Script.SetConfig enable`, `Script.Start`).
2. Programm rechnen (logik/notprogramm) und geänderte Schlüssel per `KVS.Set` schreiben, danach `hb?neu`.
3. Lebenszeichen `GET /script/<id>/hb` – solange es kommt, schaltet das Skript nicht.

Der Fühler bzw. die Tür kommt nur ins Programm, wenn genau dieser Sensor am Plug gekoppelt ist: gesucht wird über die
Bluetooth-Adresse des Geräts in HA (BTHome) unter den `bthomesensor`-Komponenten des Plugs (Temperatur 69, Fenster 45).
Die Kopplungen hält die Integration selbst in Ordnung (BSM-030): BLU-Fühler und -Tür des Containers koppeln (an jedem
Plug des Containers), fremde Kopplungen entfernen, Namen nach Herberts Schema (Gerätename in HA + `_Temperatur` …);
jede Änderung im Protokoll. Andere Komponenten (Skripte, Schalter) fasst sie nicht an.

Taste am Plug (BSM-018, `heizung.taste`, startet aus, braucht das Notprogramm): Die Taste bleibt am Relais (`PLUGS_UI`
`in_mode: momentary`, ab Werk; am Gerät geprüft 06.10.2026: „detached“ legt die Taste beim Plug S Gen3 still). Das
Skript erkennt das Umschalten mit der Quelle „button“ und meldet „baustelle_taste“; die Integration schaltet die
Event-Entität des Skripts ein (Shelly-Integration) und setzt für den Container 1 h heizen bzw. beendet es
(`laufzeit.taste_bis`, Regel in logik/regelung); den Handbetrieb, den das Umschalten ausgelöst hat, hebt sie auf. Ohne HA
heizt das Skript selbst 1 h.

Startet ausgeschaltet (`heizung.notprogramm`): Erst wenn Herbert es einschaltet, spielt die Integration etwas in die
Plugs. Ausschalten hält das Skript an und nimmt den Autostart weg – sonst übernähme es 15 min später.
Ohne Gerätepasswort (BSM-001 verworfen); ein Plug mit Passwort meldet „Passwort gesetzt“.
"""

from __future__ import annotations

import asyncio
from dataclasses import dataclass, field
from datetime import datetime, timedelta
import json
import logging
from pathlib import Path
import re
from collections.abc import Iterable
from typing import TYPE_CHECKING, Any, cast

import aiohttp

from homeassistant.const import STATE_UNAVAILABLE, STATE_UNKNOWN
from homeassistant.core import CALLBACK_TYPE, Event, EventStateChangedData, HomeAssistant, callback
from homeassistant.helpers import device_registry as dr, entity_registry as er
from homeassistant.helpers.aiohttp_client import async_get_clientsession
from homeassistant.helpers.event import async_call_later, async_track_state_change_event, async_track_time_interval
from homeassistant.util import dt as dt_util

from .const import DOMAIN, ROLLE_HEIZKOERPER
from .db import DATA_DB
from .db.nachtrag import messung, nachtragen
from .db.tage import async_tage_rechnen
from .logik import notprogramm as logik
from .logik.arbeitszeit import ausnahme_am, bedarf_fenster, frei_gilt
from .logik.sensoren import kontakte

if TYPE_CHECKING:
    from .funktionen.heizung import Heizung
    from .steuerung import GeraetInfo, Steuerung

_LOGGER = logging.getLogger(__name__)

DATA_NOTPROGRAMM = f"{DOMAIN}_notprogramm"
SKRIPT = Path(__file__).parent / "shelly" / "notprogramm.js"
SKRIPT_NAME = "baustelle"
INTERVALL = timedelta(minutes=5)
ERSTE_RUNDE_S = 60
HAENGT = "Steuerung hängt – kein Lebenszeichen, das Notprogramm übernimmt"
STUECK = 800          # Zeichen je Script.PutCode (BSM-013)
WARTEN_S = 2.0        # nach dem Start, bis der Endpunkt `hb` antwortet
TIMEOUT_S = 10
OHNE_ANTWORT_S = 3
OBJ_TEMPERATUR, OBJ_FENSTER = 69, 45
TASTE_MIN = 60                 # Taste am Plug: so lange heizen (wie TASTE_S im Skript)
TASTE_EREIGNIS = "baustelle_taste"
TASTE_FRISCH_S = 60   # ein Druck zählt nur, wenn sein Ereignis so frisch ist (07.10.2026: Wiederkehr nach „nicht verfügbar“)
HAND_NACH_TASTE_S = 5
HB_MAX_MIN = 15                # so lange wartet das Skript auf das Lebenszeichen (wie HB_MAX_MIN im Skript)
OHNE_UHRZEIT = 1_000_000_000   # „Notbetrieb seit“ kleiner: begann ohne Uhrzeit (das Skript meldet dann 1)


class PlugFehler(Exception):
    """Ein Plug antwortet nicht oder mit Fehler."""


def skript_lesen() -> tuple[int, str]:
    """Version und Code zum Hochladen (ganze Kommentarzeilen und Leerzeilen weg – spart Speicher im Plug)."""
    text = SKRIPT.read_text(encoding="utf-8")
    treffer = re.search(r"^let VERSION = (\d+);", text, re.M)
    if treffer is None:
        raise ValueError("notprogramm.js ohne VERSION")
    code = "\n".join(z for z in text.splitlines() if z.strip() and not z.lstrip().startswith("//"))
    return int(treffer.group(1)), code + "\n"


def geraet_von(hass: HomeAssistant, entity_id: str) -> str | None:
    """Gerät hinter einer Entität (ein Plug hat mehrere Schalter-Entitäten, z. B. BLE – Audit 0.8.165)."""
    return e.device_id if (e := er.async_get(hass).async_get(entity_id)) is not None else None


def shelly_host(hass: HomeAssistant, entity_id: str) -> str | None:
    """Adresse des Shelly (Gen2+, Shelly-Integration) hinter einer Entität – auch fürs Umbenennen (BSM-031.06c)."""
    eintrag = er.async_get(hass).async_get(entity_id)
    geraet = dr.async_get(hass).async_get(eintrag.device_id) if eintrag is not None and eintrag.device_id else None
    entry = hass.config_entries.async_get_entry(geraet.config_entry_id) if geraet is not None and geraet.config_entry_id else None
    if entry is not None and entry.domain == "shelly" and entry.data.get("host") and int(entry.data.get("gen") or 1) >= 2:
        return str(entry.data["host"])
    return None


class Plug:
    """RPC über HTTP an einen Shelly Gen2+."""

    def __init__(self, session: aiohttp.ClientSession, host: str) -> None:
        self._session, self._host = session, host

    async def rpc(self, methode: str, params: dict[str, Any] | None = None, *, ohne_antwort: bool = False) -> Any:
        """Aufruf; `ohne_antwort`: das Gerät antwortet nicht verlässlich (BTHome.AddDevice) – kurz warten, dann weiter."""
        # UTF-8 statt \u-Maskierung: Script.PutCode lehnt maskierte Umlaute ab (BSM-013)
        daten = json.dumps({"id": 1, "method": methode, "params": params or {}}, ensure_ascii=False).encode()
        try:
            async with self._session.post(f"http://{self._host}/rpc", data=daten,
                                          timeout=aiohttp.ClientTimeout(total=OHNE_ANTWORT_S if ohne_antwort else TIMEOUT_S),
                                          headers={"Content-Type": "application/json"}) as antwort:
                if antwort.status == 401:
                    raise PlugFehler("Passwort gesetzt")
                inhalt = await antwort.json(content_type=None)
        except TimeoutError as err:
            if ohne_antwort:
                return None
            raise PlugFehler(f"{methode}: {err.__class__.__name__}") from err
        except (aiohttp.ClientError, ValueError) as err:
            raise PlugFehler(f"{methode}: {err.__class__.__name__}") from err
        if not isinstance(inhalt, dict) or "error" in inhalt:
            raise PlugFehler(f"{methode}: {(inhalt or {}).get('error', {}).get('message', 'Fehler')}")
        return inhalt.get("result")

    async def hb(self, skript_id: int, neu: bool = False) -> dict[str, Any]:
        url = f"http://{self._host}/script/{skript_id}/hb" + ("?neu" if neu else "")
        try:
            async with self._session.get(url, timeout=aiohttp.ClientTimeout(total=TIMEOUT_S)) as antwort:
                if antwort.status != 200:
                    raise PlugFehler(f"Lebenszeichen: HTTP {antwort.status}")
                inhalt = await antwort.json(content_type=None)
        except (aiohttp.ClientError, TimeoutError, ValueError) as err:
            raise PlugFehler(f"Lebenszeichen: {err.__class__.__name__}") from err
        return cast(dict[str, Any], inhalt)


def _iso(t: datetime | None) -> str | None:
    return t.isoformat(timespec="seconds") if t else None


@dataclass
class Stand:
    """Was die Integration über einen Plug weiß (Diagnose, später Anzeige BSM-019)."""

    skript_id: int | None = None
    version: int | None = None
    programm: int | None = None       # Stand, den das Skript geladen hat
    notbetrieb: int = 0               # Notbetrieb seit (Unix-Sekunden, 0 = nein) laut letzter Antwort
    fuehler: int | None = None
    tuer: list[int] | None = None   # Messwerte der Türen und Fenster am Plug (BSM-034.03)
    fehler: str | None = None
    fehler_seit: datetime | None = None
    zuletzt: datetime | None = None
    bis: int | None = None            # Programm gültig bis (Ende des letzten Fensters)
    cfg: dict[str, Any] = field(default_factory=dict)   # was im Plug gilt (Modus, Frost, Toleranz …)
    soll: float | None = None
    notbetrieb_zuletzt: tuple[datetime, datetime] | None = None
    nachtrag_offen: tuple[int, int] | None = None   # Notbetrieb (Unix-Sekunden von, bis), dessen Stundenbuch noch fehlt
    probe_bis: datetime | None = None               # BSM-021: Ausfall-Probe läuft bis
    probe_vergleich: bool = False                   # der nächste Nachtrag ist die Probe: vergleichen statt eintragen
    probe_ergebnis: dict[str, Any] | None = None
    geschrieben: dict[str, str] | None = field(default=None, repr=False)
    geprueft_aus: bool = False

    def zustand(self, an: bool) -> str:
        """aus | offen (noch nicht geprüft) | fehler | not (Notbetrieb laut letzter Antwort) | bereit."""
        if not an:
            return "aus"
        if self.fehler:
            return "fehler"
        if self.zuletzt is None:
            return "offen"
        return "not" if self.notbetrieb else "bereit"

    def info(self, an: bool = True) -> dict[str, Any]:
        """Für Seite (`laufzeit.geraete.<id>.notprogramm`) und Diagnose."""
        return {"zustand": self.zustand(an), "fehler": self.fehler, "fehler_seit": _iso(self.fehler_seit),
                "version": self.version, "programm": self.programm,
                "bis": _iso(dt_util.utc_from_timestamp(self.bis)) if self.bis else None,
                "modus": self.cfg.get("m"), "soll": self.soll, "toleranz": self.cfg.get("tol"),
                "frost_ein": self.cfg.get("fe"), "frost_aus": self.cfg.get("fa"),
                "fuehler": self.fuehler, "tuer": self.tuer,
                "notbetrieb_seit": _iso(dt_util.utc_from_timestamp(self.notbetrieb)) if self.notbetrieb else None,
                "notbetrieb_zuletzt": [_iso(t) for t in self.notbetrieb_zuletzt] if self.notbetrieb_zuletzt else None,
                "zuletzt": _iso(self.zuletzt), "skript_id": self.skript_id,
                "probe_bis": _iso(self.probe_bis), "probe_ergebnis": self.probe_ergebnis}


class Notprogramm:
    """Hält Skript, Programm und Lebenszeichen auf allen Heizungs-Plugs einer Baustelle aktuell."""

    def __init__(self, hass: HomeAssistant, st: Steuerung) -> None:
        self.hass, self.st = hass, st
        self.stand: dict[str, Stand] = {}
        self._sperre = asyncio.Lock()
        self._skript: tuple[int, str] | None = None
        self.geprueft: datetime | None = None
        self._tasten: dict[str, str] = {}        # Event-Entität des Skripts → Gerät (BSM-018)
        self._taste_zuletzt: dict[str, datetime] = {}   # zuletzt verarbeiteter Druck je Event-Entität
        self._tasten_abmelden: CALLBACK_TYPE | None = None
        self._hand_timer: CALLBACK_TYPE | None = None

    @callback
    def async_start(self) -> CALLBACK_TYPE:
        abmelden = [async_track_time_interval(self.hass, self._async_takt, INTERVALL),
                    async_call_later(self.hass, ERSTE_RUNDE_S, self._async_takt)]

        @callback
        def stop() -> None:
            for f in abmelden:
                f()
            if self._tasten_abmelden is not None:
                self._tasten_abmelden()
            if self._hand_timer is not None:
                self._hand_timer()
        return stop

    @property
    def an(self) -> bool:
        return bool(self.st.e["heizung"].get("notprogramm"))

    @property
    def taste(self) -> bool:
        return self.an and bool(self.st.e["heizung"].get("taste"))

    async def _async_takt(self, _jetzt: datetime | None = None) -> None:
        await self.async_runde()

    async def async_runde(self) -> None:
        """Eine Runde über alle Plugs (nie zwei gleichzeitig; läuft schon eine, auf ihr Ende warten)."""
        if self._sperre.locked():
            async with self._sperre:
                return
        async with self._sperre:
            if self._skript is None:
                self._skript = await self.hass.async_add_executor_job(skript_lesen)
            session = async_get_clientsession(self.hass)
            haengt = logik.haengt(self.st.geschaltet.get("heizung"), dt_util.now())
            for g, host in self.plugs():
                stand = self.stand.setdefault(g.id, Stand())
                try:
                    if self.an and haengt:
                        raise PlugFehler(HAENGT)   # die Plugs zählen selbst bis zum Notbetrieb (`HB_MAX_MIN`)
                    if self.an:
                        self._merken(g)
                        await self._async_plug(g, Plug(session, host), stand)
                    elif not stand.geprueft_aus:
                        await self._async_abschalten(Plug(session, host), stand)
                    stand.fehler, stand.fehler_seit = None, None
                except PlugFehler as err:
                    if stand.fehler != str(err):
                        _LOGGER.info("Notprogramm %s: %s", g.name, err)
                    stand.fehler, stand.fehler_seit = str(err), stand.fehler_seit or dt_util.now()
                except Exception as err:  # noqa: BLE001  (Audit 0.8.165: ein Plug darf die anderen nicht aufhalten)
                    if stand.fehler != str(err):
                        _LOGGER.exception("Notprogramm %s", g.name)
                    stand.fehler, stand.fehler_seit = str(err), stand.fehler_seit or dt_util.now()
            try:
                await self._async_verwaiste(session)
            except Exception:  # noqa: BLE001
                _LOGGER.exception("Notprogramm: verwaiste Plugs")
            self.geprueft = dt_util.now()
            self._tasten_beobachten()
            # Warnung „Notprogramm nicht bereit“ (logik/warnungen, nach 15 min) – nur, solange es eingeschaltet ist
            self.st.notprogramm_fehler = {gid: (s.fehler_seit, s.fehler or "") for gid, s in self.stand.items()
                                          if self.an and s.fehler_seit is not None}

    # ------------------------------------------------------------------ Plugs
    def plugs(self) -> list[tuple[GeraetInfo, str]]:
        """Heizkörper-Plugs der Baustelle mit Adresse (Shelly-Integration, Gen2+)."""
        return [(g, host) for g in self.st.geraete.values()
                if g.rolle == ROLLE_HEIZKOERPER and (host := shelly_host(self.hass, g.schalter)) is not None]

    @property
    def _bekannt(self) -> dict[str, str]:
        return cast("dict[str, str]", self.st.lz.setdefault("np_plugs", {}))

    def _merken(self, g: GeraetInfo) -> None:
        """Plug bekommt das Skript: merken, damit es nach Entfernen oder Umstellen abgeschaltet wird."""
        if self._bekannt.get(g.id) != g.schalter:
            self._bekannt[g.id] = g.schalter
            self.st.einstellungen.speichern()

    async def _async_verwaiste(self, session: aiohttp.ClientSession) -> None:
        """Skript in Plugs abschalten, die kein Heizkörper dieser Baustelle mehr sind (logik/notprogramm.verwaist)."""
        from .config_flow import geraete_anderer_baustellen  # noqa: PLC0415  (config_flow lädt die Integration)

        # Audit 0.8.165: über das Gerät vergleichen – ein Plug hat mehrere Schalter-Entitäten (z. B. BLE), sonst gälte
        # ein Heizkörper-Plug unter seinem zweiten Schalter als verwaist
        def geraet(schalter: str) -> str:
            return geraet_von(self.hass, schalter) or schalter

        aktuell = {g.id: g.schalter for g, _ in self.plugs()}
        abschalten, vergessen = logik.verwaist(
            {gid: geraet(s) for gid, s in self._bekannt.items()}, {gid: geraet(s) for gid, s in aktuell.items()},
            {geraet(s) for s in geraete_anderer_baustellen(self.hass, self.st.entry.entry_id)})
        for gid in abschalten:
            schalter = self._bekannt[gid]
            if (host := shelly_host(self.hass, schalter)) is None:
                continue   # Shelly nicht (mehr) in HA – nächste Runde wieder versuchen
            try:
                await self._async_abschalten(Plug(session, host), Stand())
            except PlugFehler as err:
                _LOGGER.info("Notprogramm %s abschalten: %s", schalter, err)
                continue
            self.st.protokoll("einstellung", None, f"Notprogramm in {schalter} abgeschaltet – kein Heizkörper der Baustelle mehr")
            vergessen.append(gid)
        for gid in vergessen:
            self._bekannt.pop(gid, None)
        for gid in [x for x in self.stand if x not in aktuell]:
            del self.stand[gid]
        if vergessen:
            self.st.einstellungen.speichern()

    def _bt_adresse(self, entity_id: str | None) -> str | None:
        """Bluetooth-Adresse des Geräts hinter einer Entität (BTHome), klein geschrieben."""
        if not entity_id or (eintrag := er.async_get(self.hass).async_get(entity_id)) is None or eintrag.device_id is None:
            return None
        geraet = dr.async_get(self.hass).async_get(eintrag.device_id)
        for art, wert in geraet.connections if isinstance(geraet, dr.DeviceEntry) else ():
            if art == dr.CONNECTION_BLUETOOTH:
                return wert.lower()
        return None

    async def _gekoppelt(self, plug: Plug) -> tuple[dict[str, tuple[int, str | None]], dict[tuple[str, int], tuple[int, str | None]]]:
        """Gekoppelte Geräte (Adresse → Nummer, Name) und Messwerte ((Adresse, Objekt) → Nummer, Name) am Plug."""
        geraete: dict[str, tuple[int, str | None]] = {}
        sensoren: dict[tuple[str, int], tuple[int, str | None]] = {}
        offset = 0
        while True:
            r = await plug.rpc("Shelly.GetComponents", {"dynamic_only": True, "include": ["config"], "offset": offset})
            teile = r.get("components") or []
            for k in teile:
                c, key = k.get("config") or {}, str(k.get("key", ""))
                if not c.get("addr"):
                    continue
                if key.startswith("bthomesensor:"):
                    sensoren.setdefault((str(c["addr"]).lower(), int(c.get("obj_id", -1))), (int(c["id"]), c.get("name")))
                elif key.startswith("bthomedevice:"):
                    geraete.setdefault(str(c["addr"]).lower(), (int(c["id"]), c.get("name")))
            offset += len(teile)
            if not teile or offset >= int(r.get("total") or 0):
                return geraete, sensoren

    def _gewollt(self, g: GeraetInfo) -> dict[str, tuple[str, str]]:
        """BLU-Sensoren des Containers: Bluetooth-Adresse → (Gerätename in HA, Rolle) – Fühler, alle Türen und Fenster
        (BSM-034.03, Sensorliste des Containers; Licht nicht)."""
        raus: dict[str, tuple[str, str]] = {}
        for s in self.st.sensoren(g.bereich):
            if s.art == "licht":
                continue
            if (a := self._bt_adresse(s.entity_id)) is not None and a not in raus and (name := self._geraet_name(s.entity_id)):
                raus[a] = (name, "fuehler" if s.art == "fuehler" else "tuer")
        return raus

    def _geraet_name(self, entity_id: str | None) -> str | None:
        eintrag = er.async_get(self.hass).async_get(entity_id or "")
        geraet = dr.async_get(self.hass).async_get(eintrag.device_id) if eintrag is not None and eintrag.device_id else None
        if not isinstance(geraet, dr.DeviceEntry):
            return None
        adresse = next((w for art, w in geraet.connections if art == dr.CONNECTION_BLUETOOTH), "")
        return geraet.name_by_user or geraet.name or f"BLU_{adresse.replace(':', '')[-4:].upper()}"

    async def _async_kopplungen(self, g: GeraetInfo, plug: Plug) -> bool:
        """Kopplungen am Plug in Ordnung bringen (logik/notprogramm.kopplungen); True, wenn sich etwas geändert hat.

        Ein Schritt, der scheitert, wird in der nächsten Runde wieder versucht (z. B. Messwert vor dem Gerät angelegt).
        """
        geraete, sensoren = await self._gekoppelt(plug)
        gewollt = self._gewollt(g)
        namen = {a: n for a, (_, n) in geraete.items()} | {a: n for a, (n, _) in gewollt.items()}
        texte: list[str] = []
        for k in logik.kopplungen(gewollt, geraete, sensoren):
            try:
                match k.art:
                    case "sensor_weg":
                        await plug.rpc("BTHome.DeleteSensor", {"id": k.nr})
                    case "geraet_weg":
                        await plug.rpc("BTHome.DeleteDevice", {"id": k.nr})
                        texte.append(f"{namen.get(k.adresse) or k.adresse} entfernt")
                    case "geraet_neu":
                        await plug.rpc("BTHome.AddDevice", {"config": {"addr": k.adresse, "name": k.name}}, ohne_antwort=True)
                        texte.append(f"{k.name} gekoppelt")
                    case "sensor_neu":
                        await plug.rpc("BTHome.AddSensor", {"config": {"addr": k.adresse, "obj_id": k.obj, "idx": 0, "name": k.name}})
                    case "geraet_name":
                        await plug.rpc("BTHomeDevice.SetConfig", {"id": k.nr, "config": {"name": k.name}})
                        texte.append(f"{k.name} umbenannt")
                    case "sensor_name":
                        await plug.rpc("BTHomeSensor.SetConfig", {"id": k.nr, "config": {"name": k.name}})
            except PlugFehler as err:
                _LOGGER.info("Notprogramm %s: Kopplung %s %s: %s", g.name, k.art, k.name or k.nr, err)
                continue
        if texte:
            self.st.protokoll("einstellung", g.bereich, f"Notprogramm {g.name}: " + ", ".join(dict.fromkeys(texte)))
        return bool(texte)

    # ------------------------------------------------------------------ Skript
    async def _async_skript(self, plug: Plug, stand: Stand) -> int:
        """Skript-ID; fehlt es, anlegen und hochladen; steht es, starten."""
        liste = (await plug.rpc("Script.List")).get("scripts") or []
        eigenes = next((s for s in liste if s.get("name") == SKRIPT_NAME), None)
        if eigenes is None:
            skript_id = int((await plug.rpc("Script.Create", {"name": SKRIPT_NAME}))["id"])
            await self._async_hochladen(plug, skript_id)
            stand.geschrieben = None
            return skript_id
        skript_id = int(eigenes["id"])
        if not eigenes.get("enable"):
            await plug.rpc("Script.SetConfig", {"id": skript_id, "config": {"enable": True}})
        if not eigenes.get("running"):
            await plug.rpc("Script.Start", {"id": skript_id})
            await asyncio.sleep(WARTEN_S)
        return skript_id

    async def _async_hochladen(self, plug: Plug, skript_id: int, laeuft: bool = False) -> None:
        assert self._skript is not None
        code = self._skript[1]
        if laeuft:
            await plug.rpc("Script.Stop", {"id": skript_id})
        for i in range(0, len(code), STUECK):
            await plug.rpc("Script.PutCode", {"id": skript_id, "code": code[i:i + STUECK], "append": i > 0})
        await plug.rpc("Script.SetConfig", {"id": skript_id, "config": {"enable": True}})
        await plug.rpc("Script.Start", {"id": skript_id})
        await asyncio.sleep(WARTEN_S)

    async def _async_abschalten(self, plug: Plug, stand: Stand) -> None:
        """Notprogramm aus: eigenes Skript anhalten und Autostart weg (einmal je Start bzw. Ausschalten)."""
        liste = (await plug.rpc("Script.List")).get("scripts") or []
        for s in liste:
            if s.get("name") == SKRIPT_NAME and (s.get("running") or s.get("enable")):
                await plug.rpc("Script.Stop", {"id": s["id"]})
                await plug.rpc("Script.SetConfig", {"id": s["id"], "config": {"enable": False}})
                await self._async_taste_modus(plug)
        stand.geprueft_aus, stand.geschrieben = True, None

    # ------------------------------------------------------------------ eine Runde je Plug
    async def _async_plug(self, g: GeraetInfo, plug: Plug, stand: Stand) -> None:
        assert self._skript is not None
        stand.geprueft_aus = False
        skript_id = await self._async_skript(plug, stand)
        stand.skript_id = skript_id
        if stand.probe_bis is not None:   # BSM-021: Ausfall-Probe – kein Lebenszeichen, bis sie vorbei ist
            if dt_util.now() < stand.probe_bis:
                return
            self._probe_ende(g, stand)
        nachtrag = stand.nachtrag_offen   # erst in der nächsten Runde: das Skript schreibt die angefangene Stunde nach dem Lebenszeichen
        antwort = await plug.hb(skript_id)
        self._notbetrieb_vorbei(g, stand, int(antwort.get("nb") or 0))
        if antwort.get("v") != self._skript[0]:
            await self._async_hochladen(plug, skript_id, laeuft=True)
            stand.geschrieben = None
            antwort = await plug.hb(skript_id)
        await self._async_kopplungen(g, plug)
        await self._async_taste_modus(plug)
        self._taste_entitaet(g, skript_id)
        _, sensoren = await self._gekoppelt(plug)
        messwerte = {k: nr for k, (nr, _) in sensoren.items()}
        info = self.st.bereiche[g.bereich]
        stand.fuehler = messwerte.get((a, OBJ_TEMPERATUR)) if (a := self._bt_adresse(info.fuehler)) else None
        tueren = [nr for x in kontakte(self.st.sensoren(g.bereich))
                  if (a := self._bt_adresse(x)) and (nr := messwerte.get((a, OBJ_FENSTER))) is not None]
        stand.tuer = list(dict.fromkeys(tueren)) or None
        werte = self.werte(g, stand.fuehler, stand.tuer)
        if stand.geschrieben is None:
            stand.geschrieben = {k["key"]: k["value"] for k in
                                 ((await plug.rpc("KVS.GetMany", {"match": "bs_*"})).get("items") or [])}
        neu = {k: w for k, w in werte.items() if stand.geschrieben.get(k) != w}
        for k, w in neu.items():   # einzeln nacheinander (höchstens wenige Aufrufe gleichzeitig, BSM-013)
            await plug.rpc("KVS.Set", {"key": k, "value": w})
            stand.geschrieben[k] = w
        if neu or antwort.get("programm") != logik.stand(werte):
            antwort = await plug.hb(skript_id, neu=True)
            antwort["programm"] = logik.stand(werte)   # die Antwort kommt vor dem Laden
        stand.version, stand.programm = antwort.get("v"), antwort.get("programm")
        stand.notbetrieb, stand.zuletzt = 0, dt_util.utcnow()   # das Lebenszeichen hat den Notbetrieb gerade beendet
        stand.bis, stand.cfg = logik.gueltig_bis(werte), json.loads(werte["bs_cfg"])
        stand.soll = cast("Heizung", self.st.funktion("heizung")).soll_temperatur(g.bereich)
        if nachtrag is not None:
            await self._async_nachtragen(g, plug, stand, nachtrag)

    async def _async_probe_vergleich(self, g: GeraetInfo, stand: Stand, stunden: list[logik.BuchStunde], von: int, bis: int,
                                     db: Any) -> None:
        """Stundenbuch gegen die eigene Messung von HA im selben Zeitraum (Datenbank, Minuten mit Quelle „ha“)."""
        a, b = dt_util.utc_from_timestamp(von), dt_util.utc_from_timestamp(bis)
        ha = await db.async_ausfuehren(lambda v: messung(v, g.id, a, b))
        if ha is None:
            return
        buch_wh, buch_min = sum(s.wh for s in stunden), sum(s.min_ein for s in stunden)
        stand.probe_ergebnis = {"von": _iso(dt_util.as_local(a)), "bis": _iso(dt_util.as_local(b)), "stunden": len(stunden),
                                "buch_kwh": round(buch_wh / 1000, 3), "buch_min": buch_min,
                                "ha_kwh": round(ha[0] / 1000, 3), "ha_min": round(ha[1] / 60)}
        stand.nachtrag_offen, stand.probe_vergleich = None, False
        e = stand.probe_ergebnis
        self.st.protokoll("einstellung", g.bereich, f"Ausfall-Probe {g.name}: Stundenbuch {e['buch_kwh']:.2f} kWh, {e['buch_min']} min ein · "
                          f"HA gemessen {e['ha_kwh']:.2f} kWh, {e['ha_min']} min ein".replace(".", ","))

    async def _kvs(self, plug: Plug, muster: str) -> dict[str, str]:
        """KVS-Werte nach Muster, seitenweise wie das Gerät sie liefert."""
        raus: dict[str, str] = {}
        offset = 0
        while True:
            r = await plug.rpc("KVS.GetMany", {"match": muster, "offset": offset})
            teile = r.get("items") or []
            raus.update({str(k["key"]): str(k.get("value") or "") for k in teile})
            offset += len(teile)
            if not teile or offset >= int(r.get("total") or offset):
                return raus

    async def _async_nachtragen(self, g: GeraetInfo, plug: Plug, stand: Stand, ausfall: tuple[int, int]) -> None:
        """Stundenbuch nach einem Notbetrieb in die eigene Datenbank (BSM-020); bleibt offen, bis es geklappt hat."""
        db = self.hass.data.get(DATA_DB)
        if db is None or not db.bereit:
            return
        von, bis = ausfall
        stunden = logik.im_ausfall(logik.buch_lesen(await self._kvs(plug, "bb_*")), von, bis)
        if stand.probe_vergleich:   # Probe: HA hat die ganze Zeit mitgemessen – vergleichen statt doppelt eintragen
            await self._async_probe_vergleich(g, stand, stunden, von, bis, db)
            return
        zone, bid = dt_util.get_default_time_zone(), self.st.entry.entry_id
        erg = await db.async_ausfuehren(lambda v: nachtragen(v, bid, g.id, g.bereich, stunden, dt_util.utc_from_timestamp(von),
                                                             dt_util.utc_from_timestamp(bis), zone))
        if erg is None:
            return
        db.geschrieben()
        stand.nachtrag_offen = None
        if erg.tage:
            await async_tage_rechnen(db, self.st, list(erg.tage))
        if erg.stunden:
            self.st.protokoll("einstellung", g.bereich, f"Notbetrieb {g.name} nachgetragen: {erg.stunden} h aus dem Stundenbuch, "
                              f"{erg.wh / 1000:.2f} kWh, {erg.sekunden_ein / 3600:.1f} h eingeschaltet".replace(".", ","))

    # ------------------------------------------------------------------ Ausfall-Probe (BSM-021)
    def probe_starten(self, g: GeraetInfo, minuten: int) -> None:
        """Dem Plug `minuten` lang kein Lebenszeichen schicken; die Automatik schaltet ihn in der Zeit nicht."""
        stand = self.stand.setdefault(g.id, Stand())
        stand.probe_bis, stand.probe_ergebnis = dt_util.now() + timedelta(minutes=minuten), None
        self.st.ruhe.add(g.id)
        self.st.protokoll("einstellung", g.bereich, f"Ausfall-Probe {g.name}: bis {stand.probe_bis:%H:%M} kein Lebenszeichen – "
                          f"der Plug übernimmt nach {HB_MAX_MIN} min, die Automatik schaltet ihn so lange nicht")

    def probe_beenden(self, g: GeraetInfo) -> None:
        stand = self.stand.get(g.id)
        if stand is not None and stand.probe_bis is not None:
            stand.probe_bis = dt_util.now()

    def _probe_ende(self, g: GeraetInfo, stand: Stand) -> None:
        stand.probe_bis, stand.probe_vergleich = None, True
        self.st.ruhe.discard(g.id)
        self.st.protokoll("einstellung", g.bereich, f"Ausfall-Probe {g.name}: vorbei – Home Assistant übernimmt wieder")

    def _notbetrieb_vorbei(self, g: GeraetInfo, stand: Stand, seit: int) -> None:
        """Meldet das Skript „Notbetrieb seit …“, war HA so lange weg: ins Protokoll (Bauplan §9) und merken."""
        if not seit:
            return
        if seit < OHNE_UHRZEIT:   # Notbetrieb begann ohne Uhrzeit: kein Stundenbuch, der Verbrauch zählt als Summe bei der Rückkehr
            self.st.protokoll("warnung", g.bereich, f"Notbetrieb {g.name} bis {dt_util.now():%H:%M} – ohne Uhrzeit begonnen: "
                              "kein Stundenbuch, der Verbrauch zählt als Summe bei der Rückkehr")
            return
        stand.nachtrag_offen = (seit, int(dt_util.utcnow().timestamp()))
        von, bis = dt_util.as_local(dt_util.utc_from_timestamp(seit)), dt_util.now()
        stand.notbetrieb_zuletzt = (von, bis)
        minuten = max(1, round((bis - von).total_seconds() / 60))
        self.st.protokoll("warnung", g.bereich, f"Notbetrieb {g.name}: {von:%d.%m. %H:%M} bis {bis:%H:%M} ({minuten} min) – "
                          + ("Ausfall-Probe" if stand.probe_vergleich else "der Plug hat ohne Home Assistant nach dem Notprogramm geheizt"))

    # ------------------------------------------------------------------ Taste am Plug (BSM-018)
    async def _async_taste_modus(self, plug: Plug) -> None:
        """Taste am Relais lassen: eine früher getrennte Taste (`detached`, 0.8.71) wieder auf `momentary`."""
        try:
            cfg = await plug.rpc("PLUGS_UI.GetConfig")
        except PlugFehler:
            return   # Plug ohne PLUGS_UI
        if ((cfg or {}).get("controls") or {}).get("switch:0", {}).get("in_mode") == "detached":
            await plug.rpc("PLUGS_UI.SetConfig", {"config": {"controls": {"switch:0": {"in_mode": "momentary"}}}})

    def _taste_entitaet(self, g: GeraetInfo, skript_id: int) -> None:
        """Event-Entität des Skripts am Plug finden (Shelly-Integration) und, wenn die Taste an ist, einschalten."""
        ents = er.async_get(self.hass)
        eintrag = ents.async_get(g.schalter)
        if eintrag is None or eintrag.device_id is None:
            return
        for e in er.async_entries_for_device(ents, eintrag.device_id, include_disabled_entities=True):
            if e.domain == "event" and e.platform == "shelly" and str(e.unique_id).endswith(f"-script:{skript_id}"):
                if self.taste and e.disabled_by == er.RegistryEntryDisabler.INTEGRATION:
                    ents.async_update_entity(e.entity_id, disabled_by=None)   # HA lädt die Shelly-Integration danach neu
                self._tasten[e.entity_id] = g.id

    @callback
    def _tasten_beobachten(self) -> None:
        if self._tasten_abmelden is not None:
            self._tasten_abmelden()
            self._tasten_abmelden = None
        if self._tasten:
            self._tasten_abmelden = async_track_state_change_event(self.hass, list(self._tasten), self._taste_gedrueckt)

    @callback
    def _taste_gedrueckt(self, event: Event[EventStateChangedData]) -> None:
        neu, alt, eid = event.data["new_state"], event.data["old_state"], event.data["entity_id"]
        if (not self.taste or neu is None or alt is None or neu.state in (STATE_UNAVAILABLE, STATE_UNKNOWN)
                or neu.state == alt.state or neu.attributes.get("event_type") != TASTE_EREIGNIS):
            return
        # Kommt die Entität nach „nicht verfügbar“ zurück, trägt sie das alte Ereignis wieder – kein neuer Druck
        # (004-01, 07.10.2026 01:11: WLAN-Abriss löste „1 h heizen“ aus). Zählt nur ein frisches, neueres Ereignis.
        zeit = dt_util.parse_datetime(neu.state)
        if zeit is None or abs((dt_util.utcnow() - zeit).total_seconds()) > TASTE_FRISCH_S:
            return
        if (vorher := self._taste_zuletzt.get(eid)) is not None and zeit <= vorher:
            return
        self._taste_zuletzt[eid] = zeit
        if (gid := self._tasten.get(eid)) is not None and gid in self.st.geraete:
            self.taste_druecken(self.st.geraete[gid])

    @callback
    def taste_druecken(self, g: GeraetInfo) -> None:
        """1 h heizen im Container des Plugs; läuft es schon, beenden (Herbert 05.10.2026)."""
        st, bid, jetzt = self.st, g.bereich, dt_util.now()
        lz = st.lz.setdefault("taste_bis", {})
        for h in st.geraete_in(bid):   # das Umschalten durch die Taste hat Handbetrieb ausgelöst – die Regelung übernimmt
            st.lz["hand"].pop(h.id, None)
        if cast("Heizung", st.funktion("heizung")).bis("taste_bis", bid, jetzt) is not None:
            lz.pop(bid, None)
            st.protokoll("schalten", bid, f"Taste am Plug {g.name}: 1 h heizen beendet")
        else:
            ende = jetzt + timedelta(minutes=TASTE_MIN)
            lz[bid] = ende.isoformat(timespec="seconds")
            st.protokoll("schalten", bid, f"Taste am Plug {g.name}: 1 h heizen bis {ende:%H:%M}")
        st.einstellungen.speichern()
        st.auswerten()
        # meldet HA das Umschalten erst nach dem Tastenereignis, entsteht der Handbetrieb danach – dann nochmal aufheben
        @callback
        def nachher(_: datetime) -> None:
            self._hand_timer = None
            self._hand_nach_taste(bid, jetzt)
        if self._hand_timer is not None:
            self._hand_timer()
        self._hand_timer = async_call_later(self.hass, HAND_NACH_TASTE_S, nachher)

    @callback
    def _hand_nach_taste(self, bid: str, druck: datetime) -> None:
        geaendert = False
        for h in self.st.geraete_in(bid):
            seit = dt_util.parse_datetime(str(self.st.lz["hand"].get(h.id) or ""))
            if seit is not None and abs((seit - druck).total_seconds()) <= 2 * HAND_NACH_TASTE_S:
                self.st.lz["hand"].pop(h.id, None)
                geaendert = True
        if geaendert:
            self.st.einstellungen.speichern()
            self.st.auswerten()

    # ------------------------------------------------------------------ Programm
    def werte(self, g: GeraetInfo, temp_nr: int | None, tuer_nrn: Iterable[int] | None, jetzt: datetime | None = None) -> dict[str, str]:
        """KVS-Werte für den Plug eines Heizkörpers (logik/notprogramm)."""
        st = self.st
        h = cast("Heizung", st.funktion("heizung"))
        jetzt = jetzt or dt_util.now()
        bid, eh, e = g.bereich, st.e["heizung"], st.einstellungen.bereich(g.bereich)
        v = logik.Vorgaben(
            automatik=st.automatik, auto=bool(e["auto"]), hand=g.id in st.lz["hand"], aktiv=st.geraet_aktiv(g),
            modus=h.modus(bid), bedarf=bool(e["bedarf"]), toleranz=float(eh["toleranz"]), frost=bool(eh["frost"]),
            frost_grenze=float(eh["frost_grenze"]), frost_aus=None if eh.get("frost_aus") is None else float(eh["frost_aus"]),
            frost_immer=bool(eh.get("frost_immer")), tuer_pause_min=int(eh["tuer_pause_min"]), temp_nr=temp_nr, tuer_nrn=tuple(tuer_nrn or ()),
        )
        soll, modus = h.soll_temperatur(bid), logik.modus(v)
        fenster: list[logik.Fenster] = []
        wochentag: dict[int, int] = {}
        for i in range(logik.TAGE):
            tag = jetzt.date() + timedelta(days=i)
            beginn = dt_util.start_of_local_day(tag)
            wochentag[int(beginn.timestamp())] = tag.weekday()
            if modus == "bedarf":
                continue
            plan = h.plan_bereich(tag, bid, jetzt) if i == 0 else h.plan(tag, bool(e["trocknen"]))
            for von, bis in logik.minuten_fenster(plan):
                fenster.append((int((beginn + timedelta(minutes=von)).timestamp()),
                                int((beginn + timedelta(minutes=bis)).timestamp()), soll))
            frei = frei_gilt(h.ist_frei(tag), ausnahme_am(st.ausnahmen(), tag))
            if plan is None and frei and eh.get("frei_modus") == "absenk" and modus == "thermo":
                fenster.append((int(beginn.timestamp()), int((beginn + timedelta(days=1)).timestamp()), float(eh.get("absenk") or 10.0)))
        if modus == "bedarf":
            termine = [(von, bis) for von, bis, _ in h.termin_fenster(bid)]
            fenster += [(int(a.timestamp()), int(b.timestamp()), soll) for a, b in bedarf_fenster(termine, int(eh["vorheizen_min"]))]
            if (ende := h.bis("bedarf_bis", bid, jetzt)) is not None:
                fenster.append((int(jetzt.timestamp()), int(ende.timestamp()), soll))
        for ende in (h.bis("boost_bis", bid, jetzt), h.jetzt_bis(jetzt)):   # Boost, „alle jetzt heizen“
            if ende is not None:
                fenster.append((int(jetzt.timestamp()), int(ende.timestamp()), soll))
        return logik.programm(v, fenster, wochentag, int(jetzt.timestamp()))

    def info(self) -> dict[str, Any]:
        """Für die Diagnose (ohne Adressen)."""
        return {"an": self.an, "skript": self._skript[0] if self._skript else None,
                "geprueft": self.geprueft.isoformat(timespec="seconds") if self.geprueft else None,
                "plugs": {self.st.geraete[gid].name if gid in self.st.geraete else gid: s.info(self.an) for gid, s in self.stand.items()}}

    def geraet_info(self, gid: str) -> dict[str, Any] | None:
        """Zustand des Notprogramms eines Heizkörper-Plugs für die Seite; None für andere Geräte."""
        g = self.st.geraete.get(gid)
        if g is None or g.rolle != ROLLE_HEIZKOERPER:
            return None
        s = self.stand.get(gid, Stand())
        info = s.info(self.an)
        # Hinweis: Container regelt mit Fühler, der Plug kennt ihn aber nicht (FRITZ-Fühler, nicht gekoppelt) → nur Zeitplan
        info["fuehler_fehlt"] = (s.zuletzt is not None and s.fuehler is None and bool(self.st.bereiche[g.bereich].fuehler)
                                 and cast("Heizung", self.st.funktion("heizung")).modus(g.bereich) == "thermo")
        return info
