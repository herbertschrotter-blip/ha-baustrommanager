# Bauplan 0.7.0

Vorlage ist das abgenommene Mockup `mockups/glas.html` (Abnahme 30.09.2026, `mockups/README.md`). **Strikt ans Mockup**
(Herbert): Aufbau, Gestaltung, Texte und Abläufe kommen von dort. Abweichungen, die das echte System erzwingt, werden
vorher mit Herbert geklärt und hier unter „Abweichungen“ eingetragen.

Entscheidungen (30.09.2026):

- **Neu anfangen:** Die Einstellungen starten mit den neuen Standardwerten; der alte Wochenplan wird nicht übernommen.
  **Zähler bleiben** (Energie, Kosten, Zeiten, Zyklen, Zählerstände).
- **Einstellungs-Entitäten entfernen:** Einstellungen gibt es nur auf der Seite. Es bleiben der Automatik-Schalter,
  die Sensoren (Status, Temperatur, Verbrauch, Kosten, Zeiten …) und die Problem-/Läuft-Sensoren.
- **Zweig `v0.7.0`**, alles fertig und grün, dann zusammenführen und **einmal** einspielen (Sicherung vorher, Neustart
  durch Herbert).

Zeiten in der Fachlogik: Minuten seit Mitternacht (`int`), Tage als `datetime.date`, Wochentag `0 = Montag`.
Fachlogik liegt in `custom_components/baustelle/logik/` **ohne HA-Code**, jede Datei mit Tests in `tests/logik/`.

## 1. Datenmodell (Store Version 2, `.storage/baustelle.<entry_id>`)

```json
{
  "automatik": false,
  "preis": 0.28,
  "arbeitszeiten": [{"ab": "2026-10-05", "name": "Herbst 2026",
                     "tage": {"0": ["07:00", "16:30"], "1": [...], "2": [...], "3": [...], "4": ["07:00", "12:30"], "5": null, "6": null}}],
  "ausnahmen": [{"datum": "2026-10-03", "art": "arbeit|zeiten|frei", "von": "07:00", "bis": "12:00", "notiz": ""}],
  "heizung": {"vorheizen_min": 45, "nachheizen_min": 15, "soll": 20.0, "toleranz": 0.3,
              "heizgrenze": 15.0, "heizgrenze_basis": "jetzt|tageshoechst",
              "fruehstart": true, "fruehstart_unter": 0.0, "fruehstart_min": 30,
              "frost": true, "frost_grenze": 5.0,
              "trocknen_ab_mm": 2.0, "trocknen_laenger_min": 45, "trocknen_frueher_min": 15,
              "tuer_pause_min": 3, "tuer_melden_min": 10, "boost_min": 30, "feiertag_frei": true,
              "hand_nachfrist_min": 30, "fuehler_halten_min": 15, "zieht_strom_w": 50},   # AN-0012: bisher fest
  "staffel": {"an": true, "nutzbar_prozent": 67, "max_gleichzeitig": 5, "min_lauf_min": 10, "min_pause_min": 5, "takt_min": 15},
  "anschluesse": [{"id": "a1", "name": "Anschluss 1", "ampere": 32, "phasen": 3, "reserve_kw": 3.0}],
  "firmen": [{"id": "eigen", "name": "Eigene Firma", "eigen": true}],
  "zuordnung": [{"bereich": "<subentry_id>", "firma": "eigen", "ab": "2026-10-01T00:00:00+02:00"}],
  "bereiche": {"<subentry_id>": {"auto": true, "trocknen": false, "soll": null, "bedarf": false, "prio": "normal",
                                  "anschluss": "a1", "tuer": null}},
  "laufzeit": {"bedarf_bis": {"<bid>": "ISO"}, "boost_bis": {"<bid>": "ISO"}, "jetzt_bis": null, "hand": {"<gid>": "ISO"}},
  "meldungen_einst": {"empfaenger": [], "knoepfe": true, "arten": {"<art>": true}, "kalt_min": 60, "hand_h": 8,
                      "zyklen_h": 10, "dauerlauf_min": 20, "trocken_unter_w": 30, "offline_min": 5},
  "bericht": {"haeufigkeit": "aus|woche|monat|beides", "handy": true, "mail": false, "mail_an": "", "mail_dienst": "", "csv": true},
  "termine_kalender": null,
  "stumm": {"<warnungs-key>": "ISO bis"},
  "meldungen": [{"id": "", "art": "fehler|wunsch|anregung", "text": "", "kontext": "", "zeit": "ISO", "version": "0.7.0",
                 "geraet": "Handy|Desktop", "status": "offen|erledigt", "stand": null}],
  "melden_knopf": true,
  "protokoll": [["ISO", "warnung|ok|schalten|wetter|nachricht|einstellung", "<bid>|null", "Text"]],
  "zaehler": {"…": "unverändert aus 0.6"}
}
```

- `protokoll`: neueste zuerst, höchstens **1000** Einträge; jeder Eintrag geht zusätzlich ins HA-Logbuch (`logbook.py`).
- `zuordnung`: Verlauf der Firmen je Container; es gilt der letzte Eintrag mit `ab <= Zeitpunkt`. Frühere Werte bleiben
  bei der bisherigen Firma. Fehlt ein Eintrag → `eigen`.
- Termine der Bedarfs-Container kommen aus dem lokalen Kalender `termine_kalender` (Serien = RRULE im Kalender).
- Laden einer Version-1-Datei: nur `zaehler` übernehmen, alles andere Standard (Entscheidung „neu anfangen“).

## 2. Fachlogik (Stufe 1)

### 2.1 `logik/arbeitszeit.py`

```python
@dataclass(frozen=True) class Arbeitszeit: ab: date; name: str; tage: dict[int, tuple[int, int] | None]
@dataclass(frozen=True) class Ausnahme: datum: date; art: str  # "arbeit"|"zeiten"|"frei"; von: int; bis: int; notiz: str = ""
@dataclass(frozen=True) class HeizRegeln: vorheizen_min=45, nachheizen_min=15, fruehstart=True, fruehstart_unter=0.0,
    fruehstart_min=30, trocknen_ab_mm=2.0, trocknen_laenger_min=45, trocknen_frueher_min=15
@dataclass(frozen=True) class WetterTag: frueh_min_temp: float | None = None; regen_vortag_mm: float | None = None; regen_heute_mm: float | None = None
@dataclass(frozen=True) class Plan: start: int; vor: int; a: int; b: int; nach: int; ende: int; gruende: tuple[str, ...]; ausnahme: Ausnahme | None
def gueltige_arbeitszeit(liste, tag: date) -> Arbeitszeit | None      # jüngste mit ab <= tag
def arbeit_am(liste, ausnahmen, tag) -> tuple[int, int] | None          # Ausnahme vor Arbeitszeit; "frei" → None
def tagesplan(tag, liste, ausnahmen, regeln, wetter, trocknen: bool, frei: bool = False) -> Plan | None
def bedarf_fenster(termine: list[tuple[datetime, datetime]], vorheizen_min) -> list[tuple[datetime, datetime]]
```

Regeln (wie Mockup `planTag`):
- `vor = a − vorheizen`, `nach = b + nachheizen`.
- Frühstart: `frueh_min_temp < fruehstart_unter` → `start = vor − fruehstart_min`, Grund `fruehstart`.
- Nach Regen früher: `trocknen and regen_vortag_mm >= trocknen_ab_mm` → zusätzlich `− trocknen_frueher_min`, Grund `frueher_nach_regen`.
- Kleidung trocknen: `trocknen and regen_heute_mm >= trocknen_ab_mm` → `ende = nach + trocknen_laenger_min`, Grund `trocknen`.
- Ausnahme: Grund `ausnahme`; `frei` (Ausnahme oder Feiertag/Urlaub) → `None`.

### 2.2 `logik/regelung.py` – Soll je Container

```python
@dataclass(frozen=True) class LageContainer:
    minute: int; plan: Plan | None; automatik: bool; auto: bool; temperatur: float | None; soll: float
    frost: bool; frost_grenze: float; zu_warm: bool; frei: bool; tuer_offen_min: float | None
    bedarf: bool; bedarf_aktiv: bool     # Bedarfs-Container: Schalter/Termin läuft
    boost: bool; heizt_gerade: bool; toleranz: float = 0.3
@dataclass(frozen=True) class Soll: ein: bool | None; grund: str
def soll_container(lage, tuer_pause_min: int) -> Soll
```

Reihenfolge: Automatik aus → `None` („automatik_aus“). Frostschutz (Fühler unter `frost_grenze`, bis +2 °C) → ein, gilt
immer. Tür länger als `tuer_pause_min` offen → aus („tuer_offen“). Container-Automatik aus → `None` („hand“). Boost →
ein bis Soll (Fühler) bzw. solange `boost` wahr („boost“). Bedarfs-Container: nur `bedarf_aktiv` heizt („bedarf“),
sonst aus („bereit“). Frei (Ausnahme/Feiertag/Urlaub) → aus („frei“). Zu warm (Heizgrenze) → aus („heizgrenze“).
Im Plan-Fenster `[start, ende)`: mit Fühler Thermostat (Hysterese `toleranz`), ohne Fühler ein („arbeitszeit“,
„vorheizen“, „nachheizen“, „trocknen“, „fruehstart“). Sonst aus („ausserhalb“).

### 2.3 `logik/staffel.py` – Staffelung je Anschluss

```python
@dataclass(frozen=True) class Anschluss: id: str; grenze_kw: float; reserve_kw: float   # grenze = A·230·Phasen·nutzbar%
@dataclass(frozen=True) class Last: id: str; anschluss: str; kw: float; heizer: bool; an: bool; will: bool
    prio: int  # 0 niedrig, 1 normal, 2 hoch; frost: bool; boost: bool; defizit: float | None
    an_seit_min: float; aus_seit_min: float; wartet_seit_min: float
@dataclass(frozen=True) class StaffelRegeln: max_gleichzeitig=5; min_lauf_min=10; min_pause_min=5; takt_min=15; neue_je_schritt=1
@dataclass(frozen=True) class StaffelErgebnis: an: frozenset[str]; wartet: dict[str, str]; frei_kw: dict[str, float]
def staffeln(anschluesse, lasten, regeln, frei_stabil_kw: dict[str, float] | None = None) -> StaffelErgebnis
```

- Geschaltet werden nur `heizer`; alle anderen Lasten zählen nur mit.
- `frei = grenze − reserve − Summe(laufende Lasten)` je Anschluss.
- Überlast (`frei < 0`) → sofort den zuletzt eingeschalteten Nicht-Frost-/Nicht-Boost-Heizer aus (auch vor Mindestlaufzeit).
- Mindestlaufzeit halten, Mindestpause einhalten, höchstens `max_gleichzeitig` Heizer, höchstens `neue_je_schritt`
  Einschaltungen pro Aufruf (Anlaufstaffel).
- Neu einschalten nur, wenn `frei_stabil_kw` (kleinster freier Wert der letzten Minute, vom Aufrufer) die Leistung deckt.
- Rundlauf: passen nicht alle, tauscht nach `takt_min` der am längsten laufende gegen den besten Wartenden.
- Reihenfolge: Frost > Boost > Priorität > größtes Defizit > längste Wartezeit.
- `wartet[id]` = Grund („anschluss_voll“, „max_gleichzeitig“, „mindestpause“, „rundlauf“).

### 2.4 `logik/warnungen.py`

```python
@dataclass(frozen=True) class Warnung: key: str; art: str; stufe: str  # "stoerung"|"hinweis"; bereich: str | None; geraet: str | None; seit: datetime; werte: dict
def pruefe(zustand: BaustellenZustand, einst: WarnEinstellungen, jetzt: datetime) -> list[Warnung]
def zu_melden(neu: list[Warnung], bisher: set[str], stumm: dict[str, datetime], jetzt) -> list[Warnung]
```

Arten: Störung `offline`, `baustelle_offline`, `trockenlauf`, `dauerlauf`, `zyklen_oft`, `keine_leistung`, `frostgefahr`;
Hinweis `zu_kalt` (in der Arbeitszeit länger als `kalt_min` unter Soll−1 °C), `fuehler_fehlt`, `kein_wetter`,
`hand_zu_lange` (> `hand_h`), `tuer_offen`. Nachricht aufs Handy: Störungen sofort (einmal je Problem), `tuer_offen` nach
`tuer_melden_min`; Hinweise sonst nur Protokoll und Chip. Stumm bis Zeitpunkt unterdrückt Nachricht und Chip, nicht das
Protokoll. Pumpenlogik aus `logik/pumpen.py` weiterverwenden.

### 2.5 `logik/abrechnung.py`

```python
def firma_am(zuordnung: list[dict], bereich: str, zeit: datetime) -> str
def aufteilen(kwh_je_bereich_und_tag: dict[str, dict[date, float]], zuordnung, preis) -> dict[str, dict]  # firma → {kwh, eur, container: {bid: kwh}}
def csv_zeilen(kopf: list[str], zeilen: list[list]) -> str   # Semikolon, Dezimalkomma, keine Tausendertrennung, BOM, CRLF
```

### 2.6 `logik/bericht.py`

```python
def naechster_bericht(jetzt: datetime, haeufigkeit: str) -> tuple[datetime, str] | None  # Mo 07:00 „woche“, am 1. 07:00 „monat“
def zeitraum(art: str, zeitpunkt: datetime) -> tuple[date, date]                        # Vorwoche Mo–So bzw. Vormonat
def text_kurz(daten: dict) -> str          # Handy: Summe, Kosten, Warnungen
def text_mail(daten: dict) -> tuple[str, str]   # Betreff, Inhalt (wie Mockup „Bericht · Beispiel“)
```

## 3. Integration (Stufe 2)

- Store v2 laden/speichern (§1), Zähler aus v1 übernehmen.
- Steuerung: jede Minute und bei Zustandsänderungen `soll_container` → `staffeln` → schalten. Handbedienung = Gerät bis
  zum nächsten Schaltpunkt auf Hand (wie 0.6).
- Entitäten entfernen: Zeitplan je Wochentag, Regeln, Modus-Auswahl, Soll-Nummern usw.; behalten: `switch.*_automatik`,
  Sensoren, Problem-/Läuft-Sensoren.
- WebSocket: `baustelle/struktur` (erweitert um alle Store-Daten und Laufzeit), `baustelle/setzen` (Pfad + Wert, mit
  Prüfschema), `baustelle/aktion` (bedarf, boost, jetzt_heizen, geraet, warnung_stumm, bericht_jetzt),
  `baustelle/liste` (arbeitszeit/ausnahme/anschluss/firma/meldung: anlegen, ändern, löschen), `baustelle/protokoll`.
- `logbook.py` (eigene Ereignisse lesbar), Handy-Nachrichten mit Aktionen (`mobile_app_notification_action`),
  Bericht-Planer, Termine aus dem Kalender (`calendar.get_events`, alle 15 min).
- Geräte weiter über die Subentry-Dialoge anlegen/entfernen; Seite ruft diese auf.
- `tools/changelog.py` erzeugt `frontend/changelog.json` aus `CHANGELOG.md` (Test prüft Gleichstand).

## 4. Seite (Stufe 3)

Neu aus dem Mockup-Code: `mockups/quelle/glas-app.js`, `glas.css`, `himmel.frag`, `himmel.js`, Wettersymbole und
Container-Grafiken. Beispieldaten (`daten()`) werden durch einen Adapter auf `baustelle/struktur`, Verlauf und Statistik
ersetzt, Aktionen durch WebSocket-Aufrufe. Vorführ-Leiste (Tageszeit/Wetter) entfällt: Tageszeit aus `sun.sun`, Wetter
aus der Wetter-Entität. Test: `tests/panel/test_panel.js` rendert alle Ansichten, Einblendungen und Aktionen.

## 5. Entscheidungen aus Stufe 1 und Abweichungen vom Mockup

Entscheidungen (im Sinne des Mockups, 30.09.2026):

- Regelung: Frostschutz schaltet unter `frost_grenze` ein und bis `frost_grenze + 2 °C` weiter (Aufrufer führt `frost_vorher`);
  Tür pausiert ab `tuer_pause_min` („nach 3 min“); Bedarf mit Fühler regelt auf Soll; eine Ausnahme „arbeiten/andere Zeiten“
  gilt auch an einem Feiertag; die Arbeitszeit wird je Tag gewählt; Zeiten mit `bis <= von` gelten als frei;
  „alle jetzt heizen“ (`laufzeit.jetzt_bis`) heizt wie in der Arbeitszeit, auch an freien Tagen und über der Heizgrenze.
- Staffelung: Überlast wirft zuerst normale, dann Boost-, zuletzt Frost-Heizer ab; Frost verdrängt beim Tausch auch Boost;
  `max_gleichzeitig` gilt für die ganze Baustelle; Heizer an unbekanntem Anschluss werden nicht gestaffelt.
- Warnungen: Handy-Nachricht bei Störungen sofort, bei `tuer_offen` nach `tuer_melden_min` und bei `hand_zu_lange` nach
  `hand_h` (wie die Beispiele „Nachrichten aufs Handy“ im Mockup); übrige Hinweise nur Protokoll und Chip.
  `keine_leistung` ohne Messwert gibt keine Warnung. Zahlen in Texten kaufmännisch gerundet wie im Mockup.
- Abrechnung: Zuordnung zur Firma je **Stunde** (Recorder-Stundenwerte) – „der Verbrauch wird ab jetzt zugeordnet“.
  CSV setzt Felder mit `;` oder `"` in Anführungszeichen (RFC 4180). Fällt ein Montag auf den 1., gehen beide Berichte.

Entscheidungen aus Stufe 2 (Integration, 30.09.2026, im Sinne des Mockups):

- Geschaltet werden nur Heizkörper (Rolle `heizkoerper`); Bautrockner, Steckdosen und Pumpen zählen in der Staffelung nur
  mit (Mockup „geschaltet werden nur Heizungen“, „Pumpen und andere Verbraucher werden mitgezählt, aber nie
  geschaltet“). In 0.6 folgten Bautrockner noch dem Zeitplan.
- Leistung eines Heizkörpers für die Staffelung: gemessenes Mittel im Betrieb (Zähler `mittel:<gid>`), sonst 2,0 kW; ein
  laufender Heizkörper zählt immer mit dieser Leistung (auch wenn sein Thermostat gerade nicht zieht).
- Handbetrieb (wie 0.6, aber je Gerät): Schalten in HA oder auf der Seite stellt das Gerät auf Hand; bei Heizkörpern endet
  er am nächsten Schaltpunkt (die Automatik würde anders schalten als beim Umschalten auf Hand, mit Fühler: Wechsel
  zwischen Heizzeit und aus); andere Geräte bleiben auf Hand, bis sie ausgeschaltet oder per „Automatik übernehmen“
  zurückgestellt werden.
- „Bis morgen stumm“ gilt bis morgen 07:00. Die Frühstart-Nachricht („Morgen −4 °C“) kommt um 18:00 am Vorabend, „Noch
  früher“ startet 30 min früher (Store `laufzeit.frueher`), „Morgen nicht heizen“ trägt eine Ausnahme „frei“ ein.
- Wetter je Tag (Frühwert 4–8 Uhr, Höchstwert, Regen) aus `weather.get_forecasts` wird im Store gemerkt
  (`laufzeit.wetter_tage`), damit „nach Regen früher“ am Folgetag und der Frühstart nach 8 Uhr noch stimmen; gemessener
  Regen (Wetterstation, `regen_mess`) geht vor. Regen heute (FE-0026, `logik/regen.py`): je Stunde gemerkt
  (`regen_h`) – vergangene Stunden bleiben, die laufende und kommende nimmt die neueste Vorhersage; nicht mehr der
  höchste Wert des Tages.
- Standardwerte der Einstellungen wie Mockup; abweichend: Bericht per Mail aus (ohne Adresse und Mail-Dienst), eine erste
  Arbeitszeit „Arbeitszeit“ ab dem Tag der Umstellung (Mo–Do 07:00–16:30, Fr 07:00–12:30 wie „Herbst 2026“), Empfänger
  aus den bisherigen Optionen übernommen.
- Meldungen (Melden-Knopf) liegen in einem eigenen Store für die ganze Integration, nicht in `baustelle.<entry_id>`.
- Bericht: Verbrauch aus der Langzeitstatistik der Energie-Sensoren je Container als **Tageswerte**; die Aufteilung nach
  Firma rechnet `logik/abrechnung.aufteilen` je Tag (ein Wechsel gilt ab dem Folgetag). „gespart durch Automatik“ =
  Änderung des Sensors „Ersparnis“ im Zeitraum.
- Den CSV-Anhang kann in HA nur der SMTP-Dienst mitschicken; bei anderen Mail-Diensten steht in der Mail ein Hinweis auf
  die Abrechnung auf der Seite.
- Speichern (Prüfung Stufe 2): Ein anstehender Schreibvorgang wird nicht mehr verschoben – die Zähler landen spätestens
  30 s nach einer Änderung in der Datei, auch wenn alle paar Sekunden neue Messwerte kommen (`Store.async_delay_save`
  allein verschiebt bei jedem Aufruf und hätte bis zum Herunterfahren nie geschrieben).
- Protokoll der Staffelung: der kurze Wartegrund „anlauf“ (einer nach dem anderen) kommt nicht ins Protokoll, nur echtes
  Warten (Anschluss voll, höchstens gleichzeitig, Mindestpause, Rundlauf).

Abweichungen vom Mockup:

- Einstellungen → Meldungen, Fußzeile: statt „Störungen gehen als Nachricht aufs Handy, Hinweise nur ins Protokoll und in
  den Warnung-Chip“ → „Störungen, offene Tür und langer Handbetrieb kommen aufs Handy, andere Hinweise nur ins Protokoll
  und in den Warnung-Chip“ (das Mockup widerspricht sich hier selbst; die Beispiel-Nachrichten gehen vor).

Abweichungen vom Mockup auf der Seite (Stufe 3, 30.09.2026 – was das echte System erzwingt):

- Vorführ-Leiste entfällt: Tageszeit aus `sun.sun` (Nacht unter −6°, Morgen/Abend bis 12° Sonnenhöhe), Wetter aus der
  Wetter-Entität der Baustelle, Hell/Dunkel aus dem HA-Theme. Auf dem Handy (`narrow`) oben links ein kleiner Knopf ☰
  für die Seitenleiste von HA (HA zeigt bei eigenen Seiten keinen Kopf).
- Feste Beispieltexte werden echte Werte: Name der Baustelle, Wetter- und Kalendernamen („Open-Meteo · Zone
  Baustelle“, Kalender „Besprechungen“/„Baustelle Urlaub“/„Feiertage“ → Name der gewählten Entität), Version und
  HA-Version, Feiertage aus dem Feiertagskalender, Heizplan-Gründe mit den Werten der Vorhersage je Tag.
- „Kälte-Frühstart morgen“ (Heizung › Heute) leuchtet nur, wenn die Vorhersage für morgen unter der Grenze liegt.
- Bearbeiten (Container): zusätzlich Auswahl **Temperaturfühler** (sonst nach dem Anlegen nicht mehr änderbar);
  Gerätetyp zusätzlich **Bautrockner** (Rolle der Integration). Neuer Container: Shelly „– später –“ möglich; beim
  Pumpenschacht heißt die Auswahl „Gerät“ mit „Pumpe“ (im Mockup bleibt dort „Heizkörper“ stehen).
- Einstellungen › Wetter: zusätzlich die Kalender **Urlaub, Feiertage, Termine** (Bedarfs-Container); ohne gewählten
  Kalender zeigen „+ Termin eintragen“/„+ Urlaub eintragen“ stattdessen „Kalender … wählen“.
- Auswertung › Ölradiator oder Konvektor: Zeile „Aufheizen“ in °C/h (gemessene Aufheizrate) statt „Aufheizen auf
  18 °C“ in Minuten; „Kosten je Tag“ = Energie des Typs / Heiztage × Preis; Fußsatz aus den Messwerten, gebaut wie im
  Mockup („braucht länger, hält die Wärme aber besser und verbraucht rund … % weniger“; ohne Messung „Noch zu wenige
  Messungen“); fett wie im Mockup der Nachteil. Kennzahlen-Pfeile nur, wenn es einen Vergleichswert gibt.
- Bericht · Beispiel kommt von der Integration (`baustelle/bericht`, dieselben Zahlen und Texte wie beim Senden) und zeigt
  den Zeitraum, den der Bericht wirklich schickt (Vorwoche bzw. Vormonat). „Je Container“ wie im Mockup mit den
  Pumpenschächten – in der Mail ebenso (bisher nur Container).
- Nachrichten · Beispiele mit den Containern der Baustelle; ein Tipp auf einen Knopf zeigt nur einen Hinweis (die
  echte Aktion kommt aus der Handy-Nachricht).
- „Bis morgen stumm“ = bis morgen 07:00 (wie die Integration).
- Die Mockup-Einblendung „baustelle“ (nie geöffnet) entfällt; „Baustelle wählen“ wechselt die Baustelle bzw. öffnet
  eine abgeschlossene als Detailseite. „Stand der Seite mitschicken“ geht als Feld `seite` mit der Meldung (api §5;
  `stand` ist dort der Zeitpunkt der Statusänderung).
- Über: Badge „in Arbeit“ und „Neu in … · geplant“ mit der Liste aus dem Mockup nur, solange die Version noch nicht in
  `CHANGELOG.md` steht; danach „Neu in …“ mit Datum und den Punkten aus dem Changelog.
- Baustelle nicht geladen (Einrichtung in HA fehlgeschlagen): Status-Chip „nicht geladen – Integration prüfen“.
- Anschluss-Einblendung: nimmt man einen Container aus der Liste, hängt er danach am ersten anderen Anschluss (wie im
  Mockup; die Integration ordnet ihn um).
- Neu zeichnen im Hintergrund (neue Werte der Integration) ohne die Einblend-Animationen der Kacheln, sonst flackert die
  Seite bei jeder Zustandsänderung; Scrollstand von Seite und Einblendung bleibt.
- Wo Werte fehlen: „–“, „Noch keine Werte“, „Keine Termine“ usw.; während Werte geladen werden „Lädt …“.
- „Baustelle wählen“ (AN-0001, Herbert 30.09.2026): je Baustelle zusätzlich ✎ Bearbeiten (laufende → Einstellungen ›
  Baustelle, abgeschlossene → Detailseite) und ✕ Löschen mit Abfrage „Endgültig löschen“ (REST
  `config/config_entries/entry/<id>` wie Geräte & Dienste; Zähler und Einstellungen weg, Langzeitstatistik der Shellys
  bleibt). Im Mockup gab es dort nur Wechseln und „+ Neue Baustelle“.
- 0.7.8 (Mockup glas.html, Erweiterung abgenommen 30.09.2026): „Je Gerät“ – Stunden ≈ kWh ÷ Ø kW (die Integration
  zählt Heizstunden je Container, nicht je Gerät), bei Pumpen die gemessene Pumpzeit; kWh aus dem Energiezähler des
  Shelly (ohne Zähler „–“). Modus-Standard ohne gesetzten Wert wie 0.7: mit Fühler Thermostat, sonst Zeitplan.
  Frostschutz „aus über“ ohne gesetzten Wert = Grenze + 2 °C. „Alles aus“ im Urlaub schaltet auch den Frostschutz ab
  (Mockup-Text). Die Stepper „ein unter“/„aus über“ lassen sich nicht übereinander schieben.
- Reiter Heizung (0.7.11, Mockup `heizung-varianten.html` Variante A, abgenommen 30.09.2026): Heute-Karte + 8 Kacheln;
  die Einblendungen zeigen die bisherigen Blöcke unverändert („Heute“ zusammen mit „Wann heizt was“, „Arbeitszeit“
  zusammen mit „Ausnahmen“). Kacheln am Handy 2, ab 700 px Breite 4 Spalten.
- Versions-Hinweis (Herbert 30.09.2026, nicht im Mockup): oben auf der Seite „Neue Version … – bitte neu laden“ mit
  Knopf, wenn die Version von HA (`baustelle/struktur`) oder die neueste in `changelog.json` auf der Platte (höchstens
  alle 10 min, am Speicher vorbei) neuer ist als `SEITE_VERSION` der geladenen Seite. „Neu laden“ holt
  `baustelle-panel.js` mit `cache: 'reload'` und lädt die Seite neu. `SEITE_VERSION` setzt `tools/changelog.py`; ein
  Test prüft Gleichstand mit CHANGELOG.md und `manifest.json`.

### Abgleich Seite ↔ Integration (30.09.2026)

Geprüft mit einer echten Baustelle (`tests/integration/test_abgleich.py`: ein Arbeitstag Minute für Minute mit
Fake-Shellys, Tür, Anschlüssen, Firmen, Arbeitszeit, Ausnahmen, Terminen, Warnungen; die Antwort liegt in
`tests/panel/struktur-echt.json`). Die Seite rendert dagegen ohne undefined/NaN, und jeder Befehl, den sie dabei sendet
(WebSocket und REST-Dialoge), geht danach an die echte Integration und wird angenommen. Dabei geändert:

- **Termin-Serien:** Der Kalender (lokaler Kalender von HA) liefert eine Serie je Vorkommen mit derselben `uid`. Die
  Seite zeigt wie im Mockup eine Zeile je Serie; „nächster …“ ist das nächste noch nicht vorbeigegangene Vorkommen.
  Einmalige Termine, die schon vorbei sind, stehen nicht mehr in der Liste. Löschen löscht die ganze Serie (`uid` ohne
  `recurrence_id`); ein Termin ohne `uid` (Kalender ohne Kennung) wird nicht gelöscht, sondern mit Hinweis abgelehnt.
- **Heiztage** (Verlauf, abgeschlossene Baustelle, Ölradiator/Konvektor „Kosten je Tag“) kommen aus dem Zähler der
  Integration (`zaehler.heiztage`: Tage, an denen eine Heizung lief). Aus der Langzeitstatistik zählt die Seite nur,
  wenn der Zähler fehlt. Vorher zählte die Seite jeden Tag mit mehr als 0,5 kWh der ganzen Baustelle, Pumpen
  eingeschlossen.
- **Stepper-Grenzen:** Die Seite schickt nur Werte, die die Integration annimmt (`panel.py` `SETZEN`); die Untergrenzen
  bleiben wie im Mockup (z. B. Kälte-Frühstart ab 0 °C, Takt ab 5 min). Vorher gingen z. B. „schnell aufheizen 0 min“
  oder „Vorheizen 245 min“ als Fehler zurück.
- **Nicht geladene Baustelle:** Die Seite fragt `baustelle/protokoll` und `baustelle/bericht` dafür nicht mehr ab (die
  Integration kennt sie nicht und antwortet `not_found`).
- **Nachrichten · Beispiele:** „nicht erreichbar“ nimmt den Container der Warnung (auch wenn im Container noch ein
  anderes Gerät erreichbar ist), „auf Hand“ das Gerät, das wirklich auf Hand steht (auch eine Heizung).

## 6. Offen nach 0.7.5 (Stand 30.09.2026)

Eingespielt ist 0.7.5; Sicherung vor dem Umstieg: HA-Backup „vor Baustelle 0.7.0“ (ID 304b1b2d). Tickets aus dem
Melden-Knopf: `python3 tools/ticket.py liste` (Ticket-Profil in CLAUDE.md).

- [x] **AN-0001** (Anregung): „Wie kann ich Baustellen bearbeiten oder löschen?“ – in 0.7.6 Bearbeiten und Löschen im
      Fenster „Baustelle wählen“ (§5).
- [x] **Versions-Hinweis auf der Seite:** in 0.7.7 (§5).
- [x] **Aus der Seite 0.6.3 fehlt in 0.7** – in 0.7.8 gebaut (api §7). Herbert 30.09.2026: **alle Punkte kommen zurück**; zuerst ins Mockup
      (`mockups/glas.html`, **abgenommen 30.09.2026**, mockups/README.md), nach Abnahme bauen (Seite, dann neue Logik für Modus je Container, Urlaub/Feiertag
      absenken/aus, Frostschutz Ein/Aus). Punkte: eigener Reiter Pumpen; offline-Zeit
      und Trockenlauf-Schwelle einstellbar; Urlaub/Feiertag „absenken“ oder „aus“; Frostschutz mit Ein-/Aus-Wert; Modus
      je Container (Zeitplan/Thermostat/Hand/Aus); Beginn/Ende der Baustelle; Heizperiode samt Hochrechnung;
      Temperatur-Tagesmittel und alle Container in einem Temperaturdiagramm; Leistung heute als kW-Kurve; Tabelle
      „Je Gerät“ (Ø Leistung); Test-Meldung; Erklärtexte.
- [ ] **Im Echtbetrieb prüfen:** WebGL-Himmel, Glas-Blur, Animationen (Handy + Desktop gegen `mockups/glas.html`);
      Recorder-Statistik im Bericht; uid/rrule der Termine aus dem lokalen Kalender; CSV-Anhang (nur SMTP).
- [x] Kleinigkeiten (0.7.9, Herbert 30.09.2026): Heiztage im Bericht wie Integration (Heizzeit, ohne Pumpen);
      Geräte-Entitäten mit Container vorne („immer“); Frostschutz bei Automatik aus nur mit eigenem Schalter „auch bei
      Automatik aus“ (startet aus – die Regel „schaltet nur, wenn Herbert die Automatik einschaltet“ bleibt);
      Kälte-Frühstart auf der Seite bis −15 °C (neuer Stepper, fehlte bisher).
- [ ] Push nach GitHub durch Herbert (Push-Policy user-only), der Zweig `v0.7.0` ist in `main` zusammengeführt.

## 7. Offen nach der Bewertung (Stand 04.10.2026, 0.8.48)

Ergebnis einer Bewertung der Integration als Ganzes (Sitzung „ha-baustelle Teil 2“). Backend, Datenbasis und Tests sind
gut; vor dem Einsatz in der Firma auf mehreren Baustellen fehlt:

- [x] **Berechtigungen** (0.8.49, Plan §8): Die Seite ist mit `require_admin=False` für jeden HA-Benutzer offen, und keiner der
      WebSocket-Befehle in `panel.py` prüft Admin-Rechte. Ändern (setzen, aktion, liste, Tickets) nur für Admins oder eine
      eigene Gruppe, lesen für alle – mit Tests. Wichtigster Punkt vor einem zentralen Firmen-Server.
- [ ] **Rückfallebene in den Shellys** (Plan §9): Fällt der zentrale Server oder das WireGuard-VPN aus, schaltet auf der Baustelle
      niemand. Abschaltautomatik bzw. einfacher Zeitplan im Gerät festlegen und testen, bevor eine zweite Baustelle über
      VPN läuft.
- [ ] **Stabilisieren:** eine Zeit lang nur Tickets, keine neuen Funktionen (153 Commits in 6 Tagen, viele Fehler kurz
      nach Funktionen) – mindestens einen kalten Monat Pilotbetrieb.
- [ ] **Code der Seite aufteilen:** `frontend/baustelle-panel.js` ist ein Block (≈ 4.700 Zeilen, ≈ 550 KB, HTML als
      Text + `innerHTML`). In Module zerlegen (Himmel, Diagramme, je Ansicht) mit Bündler, langfristig Lit-Komponenten
      wie HA; `funktionen/heizung.py` (≈ 1.200 Zeilen) und `steuerung.py` (≈ 1.300) weiter zerlegen.
- [ ] **Speicherdatei** (→ `bauplan-datenbank.md`, eigene Datenbank): Einstellungen, Zähler und bis zu 1.000 Protokolleinträge liegen in einer Store-Datei, die bei
      jeder Änderung ganz geschrieben wird – bei vielen Baustellen Protokoll trennen bzw. ins Logbuch/Recorder.
- [x] **Beispieldaten Pumpen** (BSM-004, 35a8e80): Im Master-Mockup zeigt der Reiter Pumpen „203 h 13 min Laufzeit heute“ und eine
      überladene Achse (Beispiel-hass, `tests/panel/beispiel-hass.js`) – korrigieren.
- [ ] **Betrieb in der Firma:** zweite Person, die den Code versteht; kurze Betriebsanleitung (einspielen, sichern,
      Störung).

Präsentation für die Firma (Chef): Artifact „Baustelle – weniger Heizkosten“ (16:9) und PDF im A4-Hochformat, erstellt
04.10.2026 mit Messwerten der Pilotbaustelle (−71 %, ≈ 1.000 € je Heizkörper und Winter, 2,7 t CO₂). Platzhalter
offen: Anzahl Heizkörper der Firma, zweite Baustelle. Für die Bildschirmfotos wurde Chromium vorübergehend im
Terminal-Add-on installiert (verschwindet beim Neustart des Add-ons).

## 8. Berechtigungen (Herbert, 04.10.2026)

Entscheidungen:

- **Lesen alle, ändern nur Admins.** Die Seite bleibt für jeden HA-Benutzer sichtbar (`require_admin=False`).
  Geprüft wird mit HA-Bordmitteln (`connection.user.is_admin`), keine eigene Gruppe, keine neue Einstellung.
- **Ausnahmen für Nicht-Admins** (Bedienung vor Ort): `gefuehl` (zu kalt / passt / zu warm), `warnung_stumm`,
  `jetzt_heizen`, `boost`, `bedarf`, `bedarf_aus` (Knopf „Bei Bedarf“ = jetzt heizen bis …). Alle anderen Aktionen,
  `setzen` und `liste` nur für Admins.
- **Meldungen:** Jeder darf melden (`meldung` `neu`), die Liste sehen und Bilder ansehen; Status ändern, wieder öffnen
  und löschen nur Admins. Der Dienst `baustelle.ticket` bleibt, wie er ist (Dienste ruft die Seite nicht auf; Claude
  ruft ihn mit dem Token aus dem Terminal).
- **Anzeige:** Für Nicht-Admins oben der Hinweis „Nur ansehen“; Schalter, Regler, Speichern- und Bearbeiten-Knöpfe
  ausgegraut, Blättern, Reiter, Zeiträume und die erlaubten Aktionen gehen weiter. Gesperrt wird **immer** in der
  Integration; die Seite zeigt nur an.

Umsetzung:

1. `logik/rechte.py` (ohne HA-Code, Test `tests/logik/test_rechte.py`): `AKTIONEN_ALLE` (die Ausnahmen oben),
   `darf(admin, befehl, aktion=None) -> bool` und `rechte(admin) -> {"aendern": bool, "aktionen": [..]}`. Die Regel
   steht nur hier.
2. `panel.py`: in `setzen`, `liste`, `aktion` und `meldung` vor jeder Änderung `darf(...)`; sonst Fehler
   `unauthorized` („Nur Admins dürfen ändern“). `baustelle/struktur` liefert je Baustelle `rechte` für den
   angemeldeten Benutzer (api-0.7 §1, Beispiel `tests/panel/struktur-0.7.json`).
3. Seite: liest `rechte` (fehlt das Feld → alles erlaubt, wie bisher); `nur-lesen` am Wurzelelement, Hinweis oben,
   eine Prüfung vor den Aufrufen (`ws`, direkte `callWS`, Dialoge/Flows) und vor dem Öffnen der Bearbeiten-Fenster;
   Schalter (`schalter()`) und Speichern-Knöpfe ausgegraut.
4. Tests: Logik (jede Kombination), Integration mit Nicht-Admin (jeder ändernde Befehl abgewiesen, erlaubte Aktionen
   und `meldung neu` gehen, `struktur.rechte` stimmt), Panel-Test mit `rechte.aendern = false` (Hinweis da, Schalter
   gesperrt, Aufruf unterbleibt).

Bleibt offen (HA-Grenze): Die Entitäten der Integration (z. B. Schalter „Automatik“) kann in HA jeder Benutzer
außerhalb der Gruppe „Nur lesen“ schalten; HA kennt keine Rechte je Entität. Container und Baustellen anlegen,
ändern und löschen laufen über Config-/Subentry-Flows und sind in HA schon nur für Admins.

## 9. Rückfallebene in den Shellys (Herbert, 05.10.2026) – Plan, noch nicht gebaut

Ziel: Fällt HA, der zentrale Server oder das VPN aus, heizen die Plugs (Shelly Plug S Gen3: Skripte, Speicher (KVS),
Bluetooth/BTHome) mit einem gespeicherten Programm selbst weiter.

Entscheidungen:

- **Fühler: Shelly BLU H&T statt FRITZ!Smart Control 440** je Container. Der Plug liest ihn direkt (Bluetooth), HA liest
  ihn über die Plugs mit (Bluetooth-Proxy). Türsensor ebenso als Shelly BLU Door/Window. Die Hardware muss vorher
  beschafft werden.
- **Notprogramm mit Lebenszeichen:** HA schreibt täglich und bei jeder Änderung das fertige Programm der nächsten
  7 Tage in den Plug (Fenster je Tag, Soll, Toleranz, Frostgrenzen, Fühler, Tür; Feiertage, Urlaub, Ausnahmen und die
  gelernte Vorheizzeit schon eingerechnet) und meldet sich alle paar Minuten. Das Skript im Plug tut nichts, solange
  das Lebenszeichen frisch ist (z. B. < 15 min); bleibt es aus, übernimmt es, bis HA zurück ist. Nie zwei Steuerungen
  zugleich. Das Skript rechnet keine Fachregeln, es führt nur die Tabelle aus (Fachregeln bleiben in `logik/`).
- **Je Modus:** Zeitplan ganz; Thermostat mit Fühler (Soll ± Toleranz im Fenster, ohne Fühler Rückfall auf Zeitplan);
  Bei Bedarf: laufende Anforderung zu Ende, danach Frostschutz; Hand: kein Programm; Aus: aus; Frostschutz in jedem
  Modus mit Fühler; Tür offen → Pause.
- **Staffelung im Notbetrieb: keine Grenze** – jeder Plug heizt nach seinem Programm.
- **Ohne Uhrzeit** (Strom weg und kein Internet): nur Frostschutz, bis die Zeit wieder da ist. Seit 05.10.2026 holen
  die Plugs die Zeit von der FRITZ!Box (192.168.178.1, BSM-012) – hilft, wenn nur die Plugs neu starten; bei Stromausfall
  der ganzen Baustelle hilft erst eine USV für den Router.
- **Taste am Plug: Drücken = 1 h heizen** (wie „Bei Bedarf“, mit und ohne HA), nochmal drücken beendet. Ausschalten
  von Hand geht dann nur über die Seite.

- **Sensoren im Notbetrieb** (Herbert, 05.10.2026): Das Skript nimmt nur Sensoren, die am Plug selbst gekoppelt sind,
  und davon genau die Messwerte, deren Nummer HA ins Programm schreibt. HA findet sie über die Bluetooth-Adresse des
  Fühlers bzw. Türsensors, der dem Container in der Integration zugeordnet ist (nie „irgendein“ gekoppelter Sensor).
  **Die Integration hält die Kopplungen selbst in Ordnung:** fehlende Fühler/Tür des Containers am Plug koppeln,
  fremde entfernen, Namen nach Herberts Schema (`NNN_C_TEMP_<Kürzel>_Temperatur` …), jede Änderung im Protokoll;
  ohne frischen Wert Warnung „Notprogramm <Plug>: Fühler fehlt – im Notbetrieb nur Zeitplan“. Ein Sensor darf an
  mehreren Plugs eines Containers gekoppelt sein (Poliercontainer: beide Plugs). `BTHome.AddDevice` arbeitet
  verzögert – nachsehen statt auf die Antwort warten.

- **Erprobt an Plug 002-01 (BSM-013, 05.10.2026, Trockenlauf ohne Schalten):** Skript-Speicher 1,5 KB, Spitze 4,6 KB,
  ≈ 5,5 KB frei neben dem Bluetooth-Skript von HA; höchstens wenige gleichzeitige Aufrufe je Skript („Too many calls in
  progress“) → Programm mit **einem** `KVS.GetMany` (`bs_*`) laden, Stundenbuch unter eigenem Präfix `bb_`; KVS-Werte
  **höchstens 253 Zeichen** (≈ 9 Fenster je Schlüssel), **höchstens 50 Schlüssel** je Plug (gebraucht: 1 + 7 + 28);
  BTHome-Messwert `bthomesensor:<nr>` liefert `value` und `last_updated_ts` – der BLU H&T wurde gelesen und die
  Entscheidung stimmte (Soll 23,0, innen 22,5 → würde einschalten). Offen: Ereignis der Taste (braucht einen
  Tastendruck vor Ort, schaltet heute das Relais) und Übertragung mit Wartezeit nach dem Hochladen.

- **Skript gebaut (BSM-016, 0.8.62):** `custom_components/baustelle/shelly/notprogramm.js` (wird mit der Integration
  ausgeliefert, `VERSION` im Skript), Simulationstest `tests/shelly/test_notprogramm.js` (nachgebauter Plug, alle Fälle
  oben, Grenzen des Geräts). Vertrag mit HA: `bs_cfg` = `{"v","m","tol","fe","fa","t","d","tp"}` (v = Stand des
  Programms, m = `plan|thermo|bedarf|hand|aus`, t/d = Nummer des Messwerts), `bs_p0…bs_p6` = „start,ende,soll;…“ in
  Unix-Sekunden; bei „Bei Bedarf“ schreibt HA nur die laufende Anforderung als Fenster. Lebenszeichen
  `GET /script/<id>/hb` (`?neu` lädt das Programm neu) antwortet `{"v","programm","fenster","nb","taste"}`. Das Skript
  zählt die **Minuten ohne Lebenszeichen** (keine Uhrzeit nötig) und übernimmt nach 15 – auch nach einem Neustart des
  Plugs erst nach 15 min. Höchstens zwei Aufrufe gleichzeitig; Stundenbuch `bb_<0…27>` bis 137 Zeichen je Schlüssel.

- **Übertragung gebaut (BSM-017, 0.8.63):** `notprogramm.py` – alle 5 min je Heizkörper-Plug (Adresse aus der
  Shelly-Integration, Gen2+): Skript anlegen/neu hochladen/starten (ohne Kommentarzeilen, Stücke zu 800 Zeichen, UTF-8),
  Programm aus `logik/notprogramm` (7 Tage, Fenster auf 15 min nach außen gerundet, nur geänderte Schlüssel schreiben,
  danach `hb?neu`), Lebenszeichen. Fühler/Tür nur, wenn genau dieser Sensor am Plug gekoppelt ist (Bluetooth-Adresse
  des Geräts in HA ↔ `bthomesensor` mit Objekt 69 bzw. 45). Abbildung der Regelung im Docstring von
  `logik/notprogramm.py` (Hand/Automatik aus → nicht anfassen, Modus aus → aus, Bei Bedarf → Termine, frei → absenken
  oder nur Frostschutz; keine Heizgrenze, kein Lernen, keine Zusatzstufe). Startet aus (`heizung.notprogramm`).

- **Kopplungen gebaut (BSM-030, 0.8.65):** je Runde und Plug plant `logik/notprogramm.kopplungen` die Schritte (erst
  entfernen, dann anlegen, dann benennen): BLU-Fühler (Objekte 1/46/69) und -Tür (1/45/63/100) des Containers koppeln,
  fremde Geräte samt Messwerten entfernen, zusätzliche Messwerte gewollter Geräte (Licht am Display) behalten und
  benennen. Name = Gerätename in HA (Herberts Schema) + `_Batterie`/`_Feuchte`/`_Temperatur`/`_Tuer`/`_Drehung`/
  `_Lichtstufe`/`_Licht`. `BTHome.AddDevice` antwortet nicht – nach 3 s weiter, ein gescheiterter Schritt kommt in der
  nächsten Runde wieder dran. Protokoll „Notprogramm <Gerät>: … gekoppelt / entfernt / umbenannt“.

- **Anzeige gebaut (BSM-019, 0.8.66):** Einstellungen › Notprogramm (Mockup `mockups/notprogramm.html`), „Jetzt prüfen“
  und Dienst `baustelle.notprogramm_pruefen`, Warnung `notprogramm` nach 15 min, Protokoll „Notbetrieb … bis …“ beim
  ersten Lebenszeichen danach (das Skript meldet „Notbetrieb seit“). Hinweis „Fühler nicht am Plug“ statt eigener Warnung.

- **Nachtragen gebaut (BSM-020, 0.8.67):** Skript Version 4 schreibt beim ersten Lebenszeichen nach dem Notbetrieb die
  angefangene Stunde ins Stundenbuch; die Integration holt es in der Runde danach ab (`bb_*`, Stunden im Ausfall),
  trägt es in die eigene Datenbank nach (`db/nachtrag.py`, Bauplan Datenbank Phase 7), rechnet die Tage neu und schreibt
  „Notbetrieb … nachgetragen: … h, … kWh“ ins Protokoll. Begann der Notbetrieb ohne Uhrzeit (Skript meldet 1), gibt es
  kein Stundenbuch: Protokoll „ohne Uhrzeit – Verbrauch als Summe bei der Rückkehr“.

- **Taste gebaut (BSM-018, 0.8.71/0.8.72):** Einstellung `heizung.taste` (startet aus, braucht das Notprogramm). Am
  Gerät geprüft (06.10.2026, Plug 004-01): Mit `PLUGS_UI.controls.switch:0.in_mode = detached` meldet der Plug S Gen3
  **nichts** – die Taste ist still. Mit `momentary` (ab Werk) schaltet sie um und der Plug meldet `switch:0` mit
  `source: "button"` (HA: `WS_in`). Darum bleibt die Taste am Relais; Skript v5 erkennt die Quelle „button“
  (`Shelly.addStatusHandler`), meldet „baustelle_taste“ und heizt ohne HA selbst. Die Integration schaltet die
  Event-Entität des Skripts (`event.<plug>_baustelle`) ein, setzt `laufzeit.taste_bis` (1 h bzw. beenden) und hebt den
  Handbetrieb auf, den das Umschalten ausgelöst hat (auch 5 s danach, falls HA das Umschalten später meldet). Regel
  `taste` in logik/regelung: nach Frostschutz, Tür und Hand, vor Boost, Modus, frei, Heizgrenze und Plan.

- **Ausfall-Probe gebaut (BSM-021, 0.8.73):** je Heizungs-Plug in den Einzelheiten (Seite) bzw. `baustelle/notprogramm_probe`
  (`geraet`, `minuten` 30–240, 0 = beenden; nur Admins). Während der Probe kein Lebenszeichen an den Plug und die
  Automatik schaltet ihn nicht (`Steuerung.ruhe`); er behält sein Programm. Danach übernimmt HA wieder, der Plug meldet
  „Notbetrieb seit“, und HA **vergleicht** das Stundenbuch mit der eigenen Messung (Datenbank, Quelle „ha“) statt es
  einzutragen: Protokoll „Ausfall-Probe …: Stundenbuch … kWh, … min ein · HA gemessen …“, Ergebnis in den Einzelheiten.
  Sinnvoll an einem kühlen Tag über einen Schaltpunkt (z. B. 05:00 für 2 h über den Beginn des Vorheizens).
- **Ausfall-Probe am echten Plug (07.10.2026, 002-01_C_HZ_MAN_Konvektor01, 120 min ab 04:58):** Notbetrieb 05:11–07:01
  (110 min; Übernahme 15 min nach dem letzten Lebenszeichen), das Skript hat selbst geheizt (05:20: an, 1,9 kW, Quelle
  `loopback`). Stundenbuch 05:00 861 Wh/29 min, 06:00 423 Wh/13 min (Tür 60 s), 07:00 22 Wh/1 min. Vergleich nach der
  Übergabe: **Stundenbuch 1,31 kWh, 43 min ein · HA gemessen 1,30 kWh, 44 min ein** – stimmt. HA hat um 07:01 wieder
  übernommen und schaltet normal. Nebenbefund derselben Nacht (0.8.84): Fehlgriff der Taste nach einem WLAN-Abriss
  (004-01, 01:11) und Warnflut „zieht keinen Strom“ durch Thermostat-Pausen des Radiators.

Offen: Gerätepasswort als `!secret`, falls je eins gesetzt wird.

## 10. Daten zentral (Herbert, 05.10.2026) – Plan, noch nicht gebaut

> **Überholt (05.10.2026):** Herbert hat sich für eine **eigene Datenbank der Integration für alle Daten**
> entschieden – Plan und Umbau in `docs/bauplan-datenbank.md`. Der Text unten bleibt als Verlauf.

Ziel: die Daten für die Seite **und** außerhalb von HA (Excel, Power BI, Buchhaltung), mehrere HA-Instanzen zentral,
Rohdaten (Minutenwerte) über Jahre.

Entscheidungen:

- **Keine eigene Datenbank in der Integration.** Ebene 1 bleibt in jeder HA-Instanz: Einstellungen im Store, Messwerte
  in der HA-Langzeitstatistik (Stundenwerte, dauerhaft), daraus Auswertung, Abrechnung, Bericht, CSV; Lücken nach
  Ausfällen werden aus dem Stundenbuch der Plugs nachgetragen (§9).
- **Ebene 2 zentral: PostgreSQL + TimescaleDB** in der Firma. Jede HA-Instanz schreibt ihre Zustände laufend hinein
  (Anbindung prüfen: benutzerdefinierte Integration LTSS „Long Time State Storage“); für die zentrale HA-Instanz kann
  dieselbe Datenbank auch der Recorder sein (`db_url`). Zeitreihen über Jahre mit Verdichtung (TimescaleDB).
- **Zuordnung mitliefern:** Die Integration hängt an ihre Sensoren Merkmale (Baustelle, Container, Firma, Gerätetyp),
  damit die zentralen Daten ohne HA auswertbar sind; für Excel/Power BI Ansichten (Views) je Baustelle und Firma.

Offen: Server und Betrieb der Datenbank in der Firma (Sicherung, Zugänge), Pufferung bei VPN-Ausfall (LTSS schreibt nur,
solange die Verbindung steht – die Lücken füllt Ebene 1), Reihenfolge nach dem Pilot-Winter (§7 „Stabilisieren“).
