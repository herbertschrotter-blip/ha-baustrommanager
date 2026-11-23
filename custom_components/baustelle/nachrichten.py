"""Handy-Nachrichten mit Knöpfen, Frühstart-Hinweis am Vorabend und Wochen-/Monatsbericht (Bauplan 0.7 §3).

Nachrichten gehen an die Dienste `notify.<empfaenger>` (Companion App: `notify.mobile_app_<handy>`). Knöpfe sind
Aktionen der HA-App (`data.actions`); ein Tipp kommt als Ereignis `mobile_app_notification_action` zurück und wird hier
ausgewertet (Mockup „Nachrichten aufs Handy“: Zum Container, Bis morgen stumm, Trotzdem heizen, 1 h stumm,
Morgen nicht heizen, Noch früher, Automatik übernehmen, So lassen). Jeder Tipp landet im Protokoll.

Aktionskennung: `BAUSTELLE|<entry_id>|<befehl>|<wert>`; „Zum Container“ und „Bericht öffnen“ sind `URI`-Aktionen auf
die Seite (`/baustelle?baustelle=<entry_id>&container=<bid>` bzw. `&ansicht=auswertung`).

Bericht: `logik/bericht.py` (Zeitpunkt, Zeitraum, Texte), Verbrauch je Container und Tag aus der Langzeitstatistik
(Recorder) der Energie-Sensoren je Container, Abrechnung nach Firma und CSV mit denselben Funktionen wie die Seite
(`auswertung.py`, `logik/auswertung.py`). Die E-Mail geht über
`notify.<bericht.mail_dienst>`. Einen CSV-Anhang kann in HA nur der SMTP-Dienst mitschicken (Datei im Medienordner,
`data.images`); bei anderen Diensten steht in der Mail ein Hinweis, dass die CSV auf der Seite zu holen ist.
"""

from __future__ import annotations

from datetime import date, datetime, timedelta
import logging
from pathlib import Path
from typing import TYPE_CHECKING, Any

from homeassistant.core import CALLBACK_TYPE, Event, HomeAssistant, callback
from homeassistant.helpers import entity_registry as er
from homeassistant.util import dt as dt_util

from .const import AKTION_PRAEFIX, DOMAIN, EVENT_NACHRICHT_AKTION, URL_SEITE
from . import auswertung
from .funktionen.heizung import FRUEHER_MIN, FRUEHSTART_NACHRICHT, Heizung
from .logik import auswertung as auswertung_logik, bericht as bericht_logik, warnungen as warn_logik
from .logik.arbeitszeit import AusnahmeArt, uhrzeit
from . import texte

if TYPE_CHECKING:
    from .steuerung import Steuerung

_LOGGER = logging.getLogger(__name__)

HINWEIS_OHNE_ANHANG = (
    "Die Abrechnung als CSV liegt auf der Seite unter Auswertung › Abrechnung – "
    "der Mail-Dienst kann keine Anhänge mitschicken."
)


def _ist_datum(wert: str) -> bool:
    try:
        date.fromisoformat(wert)
    except ValueError:
        return False
    return True


def empfaenger_dienste(hass: HomeAssistant) -> list[str]:
    """Benachrichtigungsdienste, die als Empfänger taugen, z. B. mobile_app_<handy> der Companion App."""
    return sorted(s for s in hass.services.async_services_for_domain("notify") if s != "send_message")


def empfaenger_name(dienst: str) -> str:
    """„mobile_app_handy_herbert“ → „Handy Herbert“."""
    name = dienst.removeprefix("mobile_app_").replace("_", " ").strip()
    return " ".join(w[:1].upper() + w[1:] for w in name.split()) or dienst


class Nachrichten:
    """Nachrichten, Knöpfe und Bericht einer Baustelle."""

    def __init__(self, steuerung: Steuerung) -> None:
        self.st = steuerung
        self.hass = steuerung.hass

    # ------------------------------------------------------------------ Grundlagen
    @callback
    def async_start(self) -> CALLBACK_TYPE:
        """Auf Knöpfe in Nachrichten hören."""
        return self.hass.bus.async_listen(EVENT_NACHRICHT_AKTION, self._knopf)

    @property
    def einst(self) -> dict[str, Any]:
        einst: dict[str, Any] = self.st.e["meldungen_einst"]
        return einst

    def _aktion(self, befehl: str, wert: str, titel: str) -> dict[str, str]:
        return {"action": f"{AKTION_PRAEFIX}|{self.st.entry.entry_id}|{befehl}|{wert}", "title": titel}

    def _url(self, **teile: str) -> str:
        abfrage = "&".join(f"{k}={v}" for k, v in {"baustelle": self.st.entry.entry_id, **teile}.items())
        return f"{URL_SEITE}?{abfrage}"

    @callback
    def melden(
        self, titel: str, text: str, *, aktionen: list[dict[str, str]] | None = None, tag: str | None = None,
        url: str | None = None, bereich: str | None = None, protokoll: bool = True,
    ) -> list[str]:
        """Nachricht an alle Empfänger; liefert die Namen, an die sie ging (und trägt sie ins Protokoll ein)."""
        gesendet: list[str] = []
        daten: dict[str, Any] = {"url": url or self._url(), "clickAction": url or self._url()}
        if tag:
            # je Baustelle eindeutig: sonst ersetzt z. B. „baustelle_offline“ oder der Frühstart einer Baustelle die
            # Nachricht einer anderen auf dem Handy (gleicher tag = gleiche Nachricht)
            daten["tag"] = f"{tag}_{self.st.entry.entry_id}"
        if aktionen and self.einst.get("knoepfe", True):
            daten["actions"] = aktionen
        for dienst in self.einst.get("empfaenger") or []:
            if not self.hass.services.has_service("notify", dienst):
                _LOGGER.warning("Benachrichtigungsdienst notify.%s gibt es nicht", dienst)
                continue
            self.hass.async_create_task(
                self.hass.services.async_call(
                    "notify", dienst, {"title": titel, "message": text, "data": daten}
                ),
                "baustelle_melden",
                eager_start=False,
            )
            gesendet.append(empfaenger_name(dienst))
        if gesendet and protokoll:
            ohne_symbol = titel.split(" ", 1)[1] if titel[:1] and not titel[:1].isalnum() else titel
            self.st.protokoll("nachricht", bereich, f"An {', '.join(gesendet)}: „{ohne_symbol}“")
        return gesendet

    # ------------------------------------------------------------------ Warnungen
    @callback
    def warnung_melden(self, w: warn_logik.Warnung) -> None:
        """Warnung aufs Handy, mit den Knöpfen aus dem Mockup."""
        name = self.st.bereiche[w.bereich].name if w.bereich in self.st.bereiche else None
        titel, text = texte.nachricht(w, name)
        if w.art == warn_logik.Art.TUER_OFFEN:
            aktionen = ([self._aktion("trotzdem", w.bereich or "", "Trotzdem heizen")] if w.werte.get("pausiert", True) else []) + [
                self._aktion("stumm_1h", w.key, "1 h stumm")]
        elif w.art == warn_logik.Art.HAND_ZU_LANGE:
            aktionen = [self._aktion("automatik", w.geraet or "", "Automatik übernehmen"),
                        self._aktion("stumm_morgen", w.key, "So lassen")]
        else:
            aktionen = []
            if w.bereich:
                aktionen.append({"action": "URI", "title": "Zum Container", "uri": self._url(container=w.bereich)})
            aktionen.append(self._aktion("stumm_morgen", w.key, "Bis morgen stumm"))
        self.melden(titel, text, aktionen=aktionen, tag=f"baustelle_{w.key}", bereich=w.bereich,
                    url=self._url(container=w.bereich) if w.bereich else None)

    # ------------------------------------------------------------------ Frühstart am Vorabend
    @callback
    def fruehstart_pruefen(self, jetzt: datetime) -> None:
        """Um 18:00: kommt morgen der Kälte-Frühstart, eine Nachricht mit „Morgen nicht heizen“ / „Noch früher“."""
        morgen = jetzt.date() + timedelta(days=1)
        lz = self.st.lz
        if (
            not self.st.automatik
            or jetzt.time() < FRUEHSTART_NACHRICHT
            or lz.get("fruehstart_gemeldet") == morgen.isoformat()
            or not self.einst.get("arten", {}).get("fruehstart", True)
        ):
            return
        plan = Heizung.von(self.st).plan(morgen, True)
        if plan is None or "fruehstart" not in plan.gruende:
            return
        lz["fruehstart_gemeldet"] = morgen.isoformat()
        self.st.einstellungen.speichern()
        temp = self.st.wetter_tag_plan(morgen).frueh_min_temp
        grad = warn_logik._zahl(temp or 0, 0).replace("-", "−")
        # frühester Beginn aller Container – lernende beginnen selbst (AN-0004), nicht nach dem Plan der Baustelle
        hz = Heizung.von(self.st)
        starts = [p.start for b in hz.bereiche() if (e := self.st.einstellungen.bereich(b.id)).get("auto", True)
                  and not e.get("bedarf") and hz.heizer_von(b.id) and (p := hz.plan_bereich(morgen, b.id)) is not None]
        start = min(starts) if starts else plan.start
        frueher = uhrzeit(max(0, start - FRUEHER_MIN))
        self.melden(
            f"❄ Morgen {grad} °C",
            f"Vorheizen startet schon um {uhrzeit(start)}. Arbeitsbeginn {uhrzeit(plan.a)}.",
            aktionen=[self._aktion("frei", morgen.isoformat(), "Morgen nicht heizen"),
                      self._aktion("frueher", morgen.isoformat(), f"Noch früher ({frueher})")],
            tag="baustelle_fruehstart",
        )

    # ------------------------------------------------------------------ Knöpfe
    @callback
    def _knopf(self, event: Event) -> None:
        teile = str(event.data.get("action") or "").split("|", 3)
        if len(teile) != 4 or teile[0] != AKTION_PRAEFIX or teile[1] != self.st.entry.entry_id:
            return
        self.knopf(teile[2], teile[3])

    @callback
    def knopf(self, befehl: str, wert: str) -> None:
        """Einen Knopf aus einer Nachricht ausführen (auch aus Tests)."""
        st = self.st
        jetzt = dt_util.now()
        if befehl in ("stumm_morgen", "stumm_1h"):
            if befehl == "stumm_1h":
                bis, texte_bis = jetzt + timedelta(hours=1), "1 h stumm"
            else:
                from .steuerung import morgen_frueh  # noqa: PLC0415

                bis, texte_bis = morgen_frueh(jetzt), "bis morgen stumm"
            st.e["stumm"][wert] = bis.isoformat(timespec="seconds")
            w = next((x for x in st.daten.warnungen if x.key == wert), None)
            st.protokoll("nachricht", w.bereich if w else None,
                         f"Knopf „{texte_bis}“: {warn_logik.titel(w) if w else wert}")
        elif befehl == "baseline_absagen":   # BSM-033.04: Baseline-Lauf absagen bzw. abbrechen
            from .funktionen.heizung.baseline import absagen   # noqa: PLC0415
            absagen(Heizung.von(st), wert, "Knopf „Absagen“")
        elif befehl == "trotzdem" and wert in st.bereiche:
            Heizung.von(st).tuer_trotzdem.add(wert)
            Heizung.von(st).trotzdem_merken()
            st.warnung_vergessen(wert, warn_logik.Art.TUER_OFFEN)   # die Tür ist nicht zu – kein „Tür zu“ ins Protokoll
            st.protokoll("nachricht", wert, "Knopf „Trotzdem heizen“: heizt trotz offener Tür, bis sie zu ist")
        elif befehl == "automatik" and wert in st.geraete:
            g = st.geraete[wert]
            Heizung.von(st).hand_beenden(wert)
            st.protokoll("nachricht", g.bereich, f"Knopf „Automatik übernehmen“: {g.name} wieder auf Automatik")
        elif befehl in ("frei", "frueher") and not _ist_datum(wert):
            _LOGGER.debug("Knopf %s mit ungültigem Datum %s", befehl, wert)
            return
        elif befehl == "frei":
            tag = date.fromisoformat(wert)
            st.e["ausnahmen"] = [a for a in st.e["ausnahmen"] if a.get("datum") != wert]
            st.e["ausnahmen"].append({"datum": wert, "art": AusnahmeArt.FREI.value, "von": None, "bis": None,
                                      "notiz": "Morgen nicht heizen (Nachricht)"})
            st.protokoll("nachricht", None, f"Knopf „Morgen nicht heizen“: {tag.strftime('%d.%m.%Y')} frei")
        elif befehl == "frueher":
            frueher = st.lz.setdefault("frueher", {})
            frueher[wert] = int(frueher.get(wert) or 0) + FRUEHER_MIN
            heizung = Heizung.von(st)
            heizung.plan_neu()
            plan = heizung.plan(date.fromisoformat(wert), True)
            wann = uhrzeit(plan.start) if plan else "–"
            st.protokoll("nachricht", None, f"Knopf „Noch früher“: Start um {wann}")
        else:
            _LOGGER.debug("Unbekannter Knopf %s %s", befehl, wert)
            return
        st.einstellungen.speichern()
        st.auswerten()

    # ------------------------------------------------------------------ Bericht
    def naechster_bericht(self, jetzt: datetime) -> tuple[datetime, str] | None:
        b = self.st.e["bericht"]
        if not (b.get("handy") or b.get("mail")):
            return None
        try:
            return bericht_logik.naechster_bericht(jetzt, b.get("haeufigkeit") or "aus")
        except ValueError:
            return None

    async def async_bericht_senden(self, art: str, zeitpunkt: datetime | None = None) -> dict[str, Any]:
        """Bericht(e) bauen und schicken; `art` woche|monat|beides."""
        zeitpunkt = zeitpunkt or dt_util.now()
        arten = ["woche", "monat"] if art == "beides" else [art]
        ergebnis: dict[str, Any] = {}
        for a in arten:
            ergebnis[a] = await self._async_ein_bericht(a, zeitpunkt)
        return ergebnis

    async def async_bericht_daten(self, art: str, zeitpunkt: datetime) -> dict[str, Any]:
        """Inhalt des Berichts `art` (woche|monat) zum Zeitpunkt – für das Senden und die Vorschau auf der Seite."""
        st = self.st
        von, bis = bericht_logik.zeitraum(art, zeitpunkt)
        vorher_von, vorher_bis = bericht_logik.zeitraum(art, datetime.combine(von, datetime.min.time()))
        je_tag = await self.async_verbrauch_je_tag(vorher_von, bis)
        im = {bid: {t: k for t, k in tage.items() if von <= t <= bis} for bid, tage in je_tag.items()}
        davor = sum(k for tage in je_tag.values() for t, k in tage.items() if vorher_von <= t <= vorher_bis)
        kwh = sum(sum(t.values()) for t in im.values())
        # Abrechnung nach Firma wie auf der Seite (baustelle/abrechnung): Firma je Tag, dieselbe CSV; jeder Tag mit
        # dem Strompreis, der damals galt
        q = auswertung.quelle(self.hass, st.entry)
        pfn = auswertung.preis_fn([q])
        firmen = auswertung.abrechnung_daten([q], {st.entry.entry_id: auswertung.werte_je_tag(q, im)}, q.preis, pfn)
        eur = sum(f["eur"] for f in firmen)
        preis = eur / kwh if kwh else q.preis
        namen = {bid: info.name for bid, info in st.bereiche.items()}
        stumm = {k: z for k, v in st.e["stumm"].items() if (z := dt_util.parse_datetime(str(v))) is not None}
        offen = warn_logik.sichtbar(st.daten.warnungen, stumm, dt_util.now())
        daten = {
            "baustelle": st.entry.title, "art": art, "von": von, "bis": bis, "kwh": kwh, "eur": eur,
            "vergleich_prozent": (kwh - davor) / davor * 100 if davor > 0 else None,
            "firmen": [{"name": f["firma"], "kwh": f["kwh"], "eur": f["eur"]} for f in firmen],
            # wie Mockup „Bericht · Beispiel“: alle Container und Pumpenschächte der Baustelle
            "container": [{"name": namen[bid], "kwh": sum(im.get(bid, {}).values())} for bid in namen],
            # wie Zähler `heiztage` und Seite: Tage, an denen ein Heizkörper geheizt hat (Pumpen zählen nicht)
            "heiztage": bericht_logik.heiztage(await self.async_heizzeit_je_tag(von, bis), von, bis),
            "gespart_eur": await self.async_gespart(von, bis),
            "warnungen": [{"bereich": namen.get(w.bereich) if w.bereich else None, "titel": warn_logik.titel(w)}
                          for w in offen],
        }
        return {"daten": daten, "firmen": firmen, "quelle": q, "preis": preis}

    async def async_bericht_vorschau(self, art: str, zeitpunkt: datetime | None = None) -> dict[str, Any]:
        """Bericht, wie er jetzt ginge (Seite: Einstellungen › Bericht › Beispiel ansehen) – ohne zu senden."""
        b = self.st.e["bericht"]
        inhalt = await self.async_bericht_daten(art, zeitpunkt or dt_util.now())
        daten = inhalt["daten"]
        mail = bool(b.get("mail"))
        return {
            "art": art, "von": daten["von"].isoformat(), "bis": daten["bis"].isoformat(),
            "betreff": bericht_logik.betreff(daten), "summe": bericht_logik.summe_text(daten),
            "vergleich": bericht_logik.vergleich_text(daten).strip(),
            "firmen": [f for f in daten["firmen"] if (f.get("kwh") or 0) > 0], "container": daten["container"],
            "heiztage": daten["heiztage"], "gespart_eur": daten["gespart_eur"], "warnungen": daten["warnungen"],
            "mail_an": str(b.get("mail_an") or "") if mail else "",
            "anhang": bericht_logik.anhang_name(art, daten["von"]) if mail and b.get("csv") else None,
            "handy": bool(b.get("handy")),
        }

    async def _async_ein_bericht(self, art: str, zeitpunkt: datetime) -> dict[str, Any]:
        st = self.st
        b = st.e["bericht"]
        teile = await self.async_bericht_daten(art, zeitpunkt)
        daten, preis = teile["daten"], teile["preis"]
        von, bis = daten["von"], daten["bis"]
        zeitraum = bericht_logik.zeitraum_text(art, von, bis)
        ergebnis: dict[str, Any] = {"betreff": bericht_logik.betreff(daten), "handy": [], "mail": None, "anhang": None}
        if b.get("handy"):
            ergebnis["handy"] = self.melden(
                bericht_logik.betreff(daten), bericht_logik.text_kurz(daten),
                aktionen=[{"action": "URI", "title": "Bericht öffnen", "uri": self._url(ansicht="auswertung")}],
                tag=f"baustelle_bericht_{art}", url=self._url(ansicht="auswertung"), protokoll=False,
            )
        dienst = str(b.get("mail_dienst") or "").removeprefix("notify.")
        if b.get("mail") and dienst:
            betreff, inhalt = bericht_logik.text_mail(daten)
            aufruf: dict[str, Any] = {"title": betreff, "message": inhalt}
            if b.get("mail_an"):
                aufruf["target"] = [x.strip() for x in str(b["mail_an"]).replace(";", ",").split(",") if x.strip()]
            if b.get("csv"):
                text = auswertung.csv_abrechnung([teile["quelle"]], teile["firmen"], zeitraum, preis)
                pfad = await self._async_anhang(dienst, bericht_logik.anhang_name(art, von), text)
                if pfad:
                    aufruf["data"] = {"images": [pfad]}
                    ergebnis["anhang"] = pfad
                else:
                    aufruf["message"] = f"{inhalt}\n\n{HINWEIS_OHNE_ANHANG}"
            if self.hass.services.has_service("notify", dienst):
                await self.hass.services.async_call("notify", dienst, aufruf, blocking=False)
                ergebnis["mail"] = aufruf
            else:
                _LOGGER.warning("Mail-Dienst notify.%s gibt es nicht", dienst)
        wohin = [*ergebnis["handy"], *(["E-Mail" + (f" {b['mail_an']}" if b.get("mail_an") else "")] if ergebnis["mail"] else [])]
        if wohin:
            st.protokoll("nachricht", None, f"Bericht {zeitraum} an {', '.join(wohin)}")
        return ergebnis

    def kann_anhaenge(self, dienst: str) -> bool:
        """Nur der SMTP-Dienst von HA schickt Dateien mit (`data.images`, auch Nicht-Bilder)."""
        try:
            from homeassistant.components.notify.legacy import NOTIFY_SERVICES  # noqa: PLC0415
        except ImportError:
            return False
        for dienst_obj in (self.hass.data.get(NOTIFY_SERVICES) or {}).get("smtp", []):
            namen = {getattr(dienst_obj, "_service_name", None), *getattr(dienst_obj, "registered_targets", {}).keys()}
            if dienst in namen:
                return True
        return False

    async def _async_anhang(self, dienst: str, name: str, text: str) -> str | None:
        """CSV in den Medienordner schreiben (von HA für Anhänge freigegeben); None, wenn der Dienst es nicht kann."""
        if not self.kann_anhaenge(dienst):
            return None
        ordner = next(iter(self.hass.config.media_dirs.values()), None)
        if not ordner or not self.hass.config.is_allowed_path(ordner):
            return None
        ziel = Path(ordner) / DOMAIN / name

        def schreiben() -> None:
            ziel.parent.mkdir(parents=True, exist_ok=True)
            ziel.write_text(text, encoding="utf-8", newline="")

        await self.hass.async_add_executor_job(schreiben)
        return str(ziel)

    def _statistik_ids(self, schluessel: dict[str, str]) -> dict[str, str]:
        """unique_id → entity_id der eigenen Sensoren (für die Langzeitstatistik)."""
        registry = er.async_get(self.hass)
        ids = {}
        for key, uid in schluessel.items():
            if entity_id := registry.async_get_entity_id("sensor", DOMAIN, uid):
                ids[key] = entity_id
        return ids

    async def async_verbrauch_je_tag(self, von: date, bis: date) -> dict[str, dict[date, float]]:
        """kWh je Container und Tag aus der Langzeitstatistik der Energie-Sensoren je Container."""
        return await self._async_je_tag({bid: f"{bid}_energie" for bid in self.st.bereiche}, von, bis)

    async def async_heizzeit_je_tag(self, von: date, bis: date) -> dict[str, dict[date, float]]:
        """Heizstunden je Container (ohne Pumpenschächte) und Tag – für die Heiztage wie der Zähler `heiztage`:
        tatsächlich geheizt (AN-0011), an Tagen vor 0.8.29 eingeschaltet."""
        bereiche = Heizung.von(self.st).bereiche()
        ein = await self._async_je_tag({b.id: f"{b.id}_heizzeit" for b in bereiche}, von, bis)
        strom = await self._async_je_tag({b.id: f"{b.id}_heizzeit_strom" for b in bereiche}, von, bis)
        return {bid: {t: w for t, w in werte if w is not None} for bid, werte in auswertung_logik.heizzeit_geheizt(
            {b: w.items() for b, w in ein.items()}, {b: w.items() for b, w in strom.items()}).items()}

    async def _async_je_tag(self, schluessel: dict[str, str], von: date, bis: date) -> dict[str, dict[date, float]]:
        return await auswertung.async_je_tag(self.hass, self._statistik_ids(schluessel), von, bis)

    async def async_gespart(self, von: date, bis: date) -> float | None:
        """€, die die Automatik im Zeitraum gespart hat (Änderung des Sensors „Ersparnis“)."""
        werte = (await self._async_je_tag({"ersparnis": f"{self.st.entry.entry_id}_ersparnis"}, von, bis)).get("ersparnis")
        return sum(werte.values()) if werte else None
