# Schnittstelle Seite ↔ Integration (0.7.0)

> Seit 0.8.61 liegen alle Daten in der eigenen Datenbank (nicht mehr im Store bzw. in der HA-Statistik). Was außerhalb der
> Seite mit den Daten arbeitet (Excel, Power BI, Ansichten, Aktionen, Diagnose): `docs/api-datenbank.md`.

Vertrag zwischen `frontend/baustelle-panel.js` und der Integration. Gehört zu `docs/bauplan-0.7.md`. Beide Seiten
testen dagegen: `tests/panel/struktur-0.7.json` ist ein vollständiges Beispiel dieser Struktur (Werte wie im Mockup);
`tests/integration/test_api.py` prüft, dass die echte Antwort dieselben Schlüssel und Typen hat.

Zeiten: ISO 8601 mit Zeitzone; Uhrzeiten `"HH:MM"`; Minuten seit Mitternacht als Zahl nur in `abschnitte`.

## 1. `baustelle/struktur` → Liste aller Baustellen (auch abgeschlossene)

```json
{
  "baustelle": {"entry_id": "", "titel": "", "status": "aktiv|abgeschlossen", "optionen": {}, "geladen": true,
                "version": "0.7.0", "zeitzone": "Europe/Vienna", "heute": "2026-09-29", "jetzt": "ISO",
                "beginn": "2026-09-08", "beginn_auto": false},   // geltender Beginn; auto = ohne `beginn` → Tag der Anlage (AN-0002)
  "entitaeten": {"<unique_id>": "<entity_id>"},
  "bereiche": [{"id": "", "name": "", "art": "container|pumpenschacht", "fuehler": "sensor.x|null", "nr": 0,
                "sensoren": [{"art": "fuehler|tuer|fenster|licht", "entity_id": "", "nr": 1, "name": "Tür 1", "batterie": 87,
                              "batterie_stufe": null}]}],
                // sensoren (0.8.118, BSM-034.03): die eine Liste aus Fühler, Türkontakt (= Tür 1) und Aussehen; batterie in % oder null;
                // batterie_stufe null|"schwach"|"kritisch" (logik/sensoren.batterie_stufe: < 25 % schwach, < 10 % kritisch) –
                // die Seite färbt danach (Geräteliste, Hinweise im Container-Kopf) und kennt keine Grenze
  "geraete": [{"id": "", "name": "", "bereich": "", "schalter": "switch.x", "rolle": "heizung|trockner|pumpe|steckdose",
               "typ": "oelradiator|konvektor|…", "leistung": "sensor.x|null", "energie": "sensor.x|null", "nenn_kw": 2.0}],
  "einstellungen": {"…": "Store v2 ohne zaehler, protokoll, meldungen, laufzeit (siehe bauplan §1)"},
  "rechte": {"aendern": true, "aktionen": ["gefuehl", "warnung_stumm", "jetzt_heizen", "boost", "bedarf", "bedarf_aus"]},   // für den angemeldeten Benutzer (0.8.49, bauplan §8)
  "zaehler": {"…": "wie 0.6"},
  "laufzeit": {
    "status": "automatik_aus|bereit|heizt|heizgrenze|urlaub|feiertag|frei|abgeschlossen",
    "status_text": "♨ heizt bis 17:30",
    "jetzt_bis": "ISO|null",
    "container": {"<bid>": {"zustand": "heizt|trocknen|aus|frost|offline|laeuft|pause|bereit", "grund": "<SollGrund>",
                   "text": "heizt · Arbeitszeit", "temperatur": 19.4, "kw": 3.99,
                   "bedarf_bis": "ISO|null", "boost_bis": "ISO|null", "tuer": {"offen": true, "seit": "ISO"} }},
    "geraete": {"<gid>": {"an": true, "kw": 2.0, "erreichbar": true, "hand_seit": "ISO|null", "aktiv": true,
                "status": "aktiv|inaktiv|verliehen|defekt",
                "warte": {"grund": "anschluss_voll|max_gleichzeitig|mindestpause|rundlauf|anlauf", "dran_in_min": 6} }},
    "plan_woche": [{"datum": "2026-09-28", "plan": {"start": 375, "vor": 375, "a": 420, "b": 990, "nach": 1005,
                    "ende": 1050, "gruende": ["trocknen"], "ausnahme": null}, "frei": "feiertag|urlaub|ausnahme|null"}],
    "abschnitte": {"<bid>": {"2026-09-28": [[375, 420, "vorheizen"], [420, 990, "arbeitszeit"]]}},
    // FE-0012: plan enthält "eigene": [[von, bis], …] (Zeitfenster für sich, ohne Vor-/Nachheizen; Abschnitt "fenster")
    //   und "ausnahmen": [ … alle des Tages ]; laufzeit.plan_ausnahmen = {"JJJJ-MM-TT": plan} für künftige Tage mit
    //   Ausnahmen. baustelle/liste ausnahmen: mehrere je Tag; „frei“ ersetzt alle des Tages; loeschen mit art/von/bis
    //   löscht nur dieses Fenster, nur mit datum alle des Tages.
    // FE-0034: laufzeit.plan_abweichung = {"JJJJ-MM-TT": {"normal": {"start", "ende"} | null, "teile": [[von, bis,
    //   "mehr"|"weniger"]], "diff_min"}} je Tag dieser Woche und je künftigem Tag mit Ausnahme (logik/arbeitszeit.abweichung):
    //   wo der Plan wegen der Ausnahme vom Normalplan abweicht; die Seite legt die Teile über die Spuren (Achse 0–24 Uhr).
    // AN-0019: laufzeit.heute = [{"k", "ic", "name", "titel", "text", "an", "kurz", "gruppe": "zeit|wetter|strom|frei"}] –
    //   „Heute · welche Regeln greifen“ fertig von der Integration (logik/heute.py); die Seite zeigt Karten und Satz.
    "staffel": {"an": true, "laufen": 4, "warten": 1, "max": 5,
                "anschluesse": [{"id": "", "name": "", "voll_kw": 22.1, "grenze_kw": 14.8, "reserve_kw": 4,
                                 "heiz_kw": 7.99, "pumpe_kw": 0, "sonst_kw": 1.79, "frei_kw": 1.01}],
                "rang": ["<gid>", "…"],   // oben zuerst an, unten gibt zuerst ab (Bedarf in °C, logik/bedarf)
                // AN-0017: auch Heizkörper, die laut Plan dran sind, aber nicht heizen wollen (satt, Tür offen, Zusatz)
                "rangliste": {"zeilen": [{"id": "<gid>", "zustand": "heizt|wartet|satt|tuer_offen|zurueckgehalten|aus",
                                          "text": "satt (Thermostat)"}],
                              "kopf": "Anschluss hat Platz für alle – kein Tausch nötig|Anschluss voll – wird getauscht|…"}},
    // AN-0021: Kleidung trocknen nur nach Regen in der Arbeitszeit, gestuft (logik/regen); plan_woche[].regen_az = mm je Tag
    "trocknen": {"heute_mm": 3.5, "gestern_mm": 0.0, "laenger_min": 60, "frueher_morgen_min": 15, "frueher_heute_min": 0,
                 "aktiv": true, "text": "3,5 mm Regen in der Arbeitszeit heute → 60 min länger, morgen 15 min früher",
                 "stufen": [{"ab_mm": 2.0, "laenger_min": 60, "frueher_min": 15}], "stufen_text": "ab 2 mm: +60 min, …"},
    // je Container zusätzlich laufzeit.container.<id>.bedarf (Staffelung): {"summe", "jetzt", "abkuehlen", "abkuehl_h",
    //   "gemessen", "trend_h", "nachlauf", "aufheiz_h", "ziel", "gerecht", "heiz_min", "horizont_min"} – °C bzw. °C/h, min
    // Soll gleitend (logik/soll): laufzeit.soll_gleitend = {"aussen_mittel", "tage", "start", "gefuehl", "soll", "n", "schritt",
    //   "kurve": [[t_außen, start, soll], …], "rueck": [[t_außen, -1|0|1], …]} oder null; je Container laufzeit.container.<id>.soll =
    //   {"wert", "versch", "versch_bis", "eigen"}. Einstellungen heizung.soll_art (fest|gleitend), gleit_min, gleit_max,
    //   gleit_je, gleit_bezug, gleit_tage; Aktionen baustelle/aktion gefuehl {bereich, wert}, soll_versch {bereich, d},
    //   soll_versch_weg {bereich}, gefuehl_vergessen.
    // WU-0016: baustelle/meldung neu nimmt meldung.bilder (bis 3 Data-URLs JPEG/PNG/WebP, je ≤ 1,5 MB) an, speichert sie als
    //   <config>/baustelle/meldungen/<Ticket>-<n>.<endung>, die Meldung hat "bilder": [Dateinamen]; aktion "bild"
    //   {meldung_id, nr} liefert {"url": Data-URL}; „loeschen“ löscht die Bilder mit.
    // Strompreis mit „gilt ab“: einstellungen.preise = [{"ab", "preis"}, …] (leer = nur einstellungen.preis); baustelle/liste
    //   preise speichern {ab, preis} / loeschen {ab} (der letzte bleibt); einstellungen.preis = Preis von heute.
    //   baustelle/auswertung und baustelle/abrechnung rechnen jeden Tag mit dem damaligen Preis („preis“ = gewichtetes
    //   Mittel im Zeitraum); optional {preis} simuliert alle € mit diesem Preis (Antwort „simuliert“: true).
    // baustelle/aktion zuruecksetzen: alle Zähler und alles Gelernte auf null (Einstellungen, Protokoll, HA-Statistik bleiben), lädt neu.
    "warnungen": [{"key": "", "art": "", "stufe": "stoerung|hinweis", "bereich": "<bid>|null", "geraet": "<gid>|null",
                   "titel": "nicht erreichbar", "hilfe": "", "seit": "ISO", "stumm_bis": "ISO|null"}],
    "wetter": {"aussen": 4.2, "aussen_max": 9, "frueh_min": -1.2, "regen_vortag": 6, "regen_heute": 6, "zustand": "rainy"},
    "heizgrenze": {"bezug": 9, "zu_warm": false},
    "termine": [{"bereich": "<bid>", "von": "ISO", "bis": "ISO", "titel": "", "uid": "", "rrule": "FREQ=WEEKLY|null",
                 "wiederholung": "einmal|woche|2wochen", "boost": false}],
    "protokoll": [["ISO", "art", "<bid>|null", "Text"]]
  }
}
```

- `laufzeit.protokoll`: die neuesten 20 Einträge; mehr über `baustelle/protokoll`.
- `plan_woche`/`abschnitte`: Montag bis Sonntag der laufenden Woche, von der Integration mit `logik/arbeitszeit.py`
  berechnet (die Seite rechnet den Plan **nicht** selbst nach). `abschnitte` je Container: Bedarf/Termine als
  `"termin"`, ohne Automatik leer.
- Gemessene Heizzeiten (Übersicht „Wann welche Heizung heizt“) holt die Seite über `history/history_during_period`
  der Leistungssensoren (über 50 W = zieht Strom); Verbrauch über `recorder/statistics_during_period` der
  Energie-Sensoren je Container (Stunde/Tag/Monat).

## 2. Befehle (alle mit `entry_id`, Antwort `{ok: true}` oder Fehler `invalid_format`/`not_found`)

**Rechte (0.8.49, bauplan §8):** `setzen`, `liste`, `aktion` und `meldung` (`status`, `loeschen`) nur für Admins, sonst
Fehler `unauthorized` („Nur Admins dürfen ändern“). Auch ohne Admin gehen die Aktionen aus `rechte.aktionen` sowie
`meldung` `neu` und `bild`; alle lesenden Befehle gelten für jeden Benutzer.

| type | Felder | Wirkung |
|---|---|---|
| `baustelle/setzen` | `pfad: [str]`, `wert` | Einstellung setzen, geprüft nach Schema (erlaubte Pfade: `automatik`, `preis`, `melden_knopf`, `termine_kalender`, `heizung.*`, `staffel.*`, `bericht.*`, `meldungen_einst.*`, `bereiche.<bid>.(auto\|trocknen\|soll\|bedarf\|prio\|anschluss\|tuer)`; `meldungen_einst.empfaenger` = Namen von notify-Diensten, z. B. `mobile_app_handy`) |
| `baustelle/liste` | `liste: arbeitszeiten\|ausnahmen\|anschluesse\|firmen`, `aktion: speichern\|loeschen`, `eintrag` | Eintrag anlegen/ändern/löschen. `firmen`/`anschluesse` mit `container: [bid]` ordnen zu (Firma: neuer `zuordnung`-Eintrag „ab jetzt“). Arbeitszeit mit gleichem `ab` → Fehler; ändern mit `alt_ab` (bisheriges `ab`). Neue Anschlüsse/Firmen antworten `{ok, id}`. |
| `baustelle/aktion` | `aktion` + Felder | `bedarf` (`bereich`, `minuten` oder `bis`, `boost`), `bedarf_aus` (`bereich`), `boost` (`bereich`, `an`), `jetzt_heizen` (`minuten` oder null = beenden), `schalten` (`geraet`, `an` → Handbetrieb bis zum nächsten Schaltpunkt), `automatik` (`geraet` → Handbetrieb beenden), `warnung_stumm` (`key`, `bis` oder null; ohne `bis` = morgen 07:00), `bericht_senden` (`art`: woche\|monat), `baseline_absagen` (`lauf_id`, §8) |
| `baustelle/protokoll` | `filter: alle\|warnung\|schalten\|wetter\|nachricht\|einstellung`, `vor: ISO\|null`, `limit` (Standard 50) | Liste `[ISO, art, bid\|null, Text]`, neueste zuerst; `warnung` enthält auch `ok`; `vor` = nur ältere Einträge (Nachladen) |
| `baustelle/bericht` | `art: woche\|monat` | Vorschau des Berichts, wie er jetzt ginge (dieselben Zahlen und Texte wie beim Senden): `{art, von, bis, betreff, summe, vergleich, firmen: [{name, kwh, eur}], container: [{name, kwh}], heiztage, gespart_eur\|null, warnungen: [{bereich\|null, titel}], mail_an, anhang\|null, handy}` |
| `baustelle/meldungen` | – | alle Meldungen (eine Liste für die ganze Integration) |
| `baustelle/meldung` | `aktion: neu\|status\|loeschen`, `meldung` bzw. `meldung_id` oder `meldung: {id, status}` (`status: offen\|erledigt`) | Meldung speichern/ändern. **Nicht** `id` auf oberster Ebene senden – das ist die Nummer der WebSocket-Nachricht. `neu` antwortet `{ok, id}` |

Unverändert über HA-Standard:
- Container anlegen, ändern, entfernen: Subentry-Dialoge (REST `config/config_entries/subentries/flow`,
  WS `config_entries/subentries/delete`). Geräte ab 0.8.117 über `baustelle/geraet` `speichern` (§11); die HA-Dialoge
  unter Geräte & Dienste bleiben und prüfen nach denselben Regeln.
- Baustelle anlegen/abschließen: Config-/Options-Flow.
- Termine: WS `calendar/event/create|update|delete` am Kalender `termine_kalender` (Serien per `rrule`).
- Wetter-Vorhersage: `weather/subscribe_forecast`; Tageszeit: `sun.sun`.
- Diagnose: `/api/diagnostics/config_entry/<entry_id>`.
- Verlauf „Über“: statische Datei `frontend/changelog.json` (erzeugt aus `CHANGELOG.md` durch `tools/changelog.py`).

## 3. Entitäten ab 0.7.0

Bleiben: `switch.<baustelle>_automatik`, alle Sensoren (Status, nächste Schaltzeit, Wetter, Zähler, Grund und Leistung je
Container, Zeiten/Zyklen je Gerät), Binärsensoren (erreichbar, Problem, Pumpe läuft).
Entfallen (samt Plattformen, wo leer): Zeitplan- und Regel-Entitäten (`time`, `number`, `select`, Schalter außer Automatik,
`button` Test-Meldung). Beim Start räumt die Integration die verwaisten Einträge aus der Entity-Registry.

## 4. Ergänzungen aus der Umsetzung (Integration, 30.09.2026)

- `laufzeit` enthält zusätzlich `naechste` (ISO, nächster Schaltpunkt), `probleme` (`{gid: [art]}`), `pumpe_laeuft`,
  `erreichbar` (wie 0.6, für Entitäten und Diagnose). `plan_woche[].name` = Name des Feiertags (wenn `frei: feiertag`).
- `laufzeit.warnungen` enthält auch stumme Warnungen (`stumm_bis` gesetzt) – für die Gruppe „Stumm bis morgen“.
- `laufzeit.geraete[gid].warte.dran_in_min` ist bei `mindestpause`/`rundlauf` gesetzt, sonst `null`.
- Termine: Ein Kalendereintrag gehört zu dem Bedarfs-Container, dessen `baustelle:<bid>` in der Beschreibung steht
  (die Seite schreibt das beim Anlegen hinein); sonst dem Bedarfs-Container, dessen Name im Titel oder Ort steht; gibt
  es nur einen Bedarfs-Container, gehört ihm jeder Termin. `boost` in der Beschreibung = schnell aufheizen.
  Termine kommen über `calendar.get_events` (alle 15 min und nach `setzen termine_kalender`); `uid`/`rrule` liest die
  Integration zusätzlich von der Kalender-Entität, weil `get_events` sie nicht liefert.
- `einstellungen.meldungen_einst.arten` kennt zusätzlich `fruehstart` (Nachricht am Vorabend „Morgen −4 °C“).
- Store `laufzeit` (nicht in `struktur`): zusätzlich `frueher` (Tag → Minuten aus dem Knopf „Noch früher“),
  `wetter_tage` (Vorhersage/Messung je Tag: `frueh`, `max`, `regen`), `gemeldet`, `warnungen_offen`,
  `wetter_protokoll`, `fruehstart_gemeldet`.
- Meldungen liegen in einem eigenen Store `.storage/baustelle.meldungen` (eine Liste für die ganze Integration), nicht
  je Baustelle. `baustelle/meldung neu` darf `entry_id` mitschicken (wird als `baustelle` gespeichert).
- Handy-Nachrichten: Tippen öffnet `/baustelle?baustelle=<entry_id>` (Warnung: `&container=<bid>`, Bericht:
  `&ansicht=auswertung`). Knöpfe: `URI` „Zum Container“/„Bericht öffnen“ und Aktionen
  `BAUSTELLE|<entry_id>|<befehl>|<wert>` mit `stumm_morgen`, `stumm_1h` (Warnungs-`key`), `trotzdem` (bid),
  `automatik` (gid), `frei` / `frueher` (Datum). Die Seite muss diese Adressen auswerten.
  Das `tag` der Nachricht endet auf `_<entry_id>`, damit gleiche Warnungen zweier Baustellen sich auf dem Handy nicht
  ersetzen.
- Bericht per Mail über `notify.<bericht.mail_dienst>` (`mail_an` als `target`). Den CSV-Anhang kann nur der
  SMTP-Dienst von HA mitschicken (Datei im Medienordner, `data.images`); bei anderen Diensten steht in der Mail der
  Hinweis, dass die Abrechnung auf der Seite unter Auswertung › Abrechnung liegt.

## 5. Ergänzungen aus der Umsetzung (Seite, 30.09.2026)

- Die Seite liest außer `struktur` nur die Langzeitstatistik (`recorder/statistics_during_period`, `change` bzw. `mean`)
  dieser Entitäten (Schlüssel in `entitaeten`): je Container `<bid>_energie` (Verbrauch, Abrechnung, Bericht-Beispiel),
  `<bid>_heizzeit` (Heizzeit), je Pumpe `<gid>_pumpzeit`, `<gid>_pumpzyklen`; je Baustelle `<entry>_energie`
  (Verlauf, Monate; Heiztage nur, wenn `zaehler.heiztage` fehlt), `<entry>_aussen` (Außen-Linie,
  Wetter-Einfluss); „Ohne Automatik“ nicht aus der Statistik, sondern aus `baustelle/auswertung` (`summen.ohne_automatik`,
  `gespart_reihen`); Zustand von `<entry>_ersparnis`, `<entry>_energie_<typ>`/`<entry>_heizzeit_<typ>` (Vergleich
  Ölradiator/Konvektor) und die Fühler der Container (`mean` je Stunde). Aus `zaehler`: `energie`, `kosten`, `ohne`,
  `energie_heizen`, `aufheiz:<bid>`, `abkuehl:<bid>` (°C/h).
- Gemessene Heizzeiten: `history/history_during_period` der `leistung`-Sensoren (ohne Sensor: `schalter`) ab Montag
  00:00; über 50 W bzw. `on` = zieht Strom, `unavailable` = offline.
- Abrechnung/CSV auf der Seite: Firma je Wert der Statistik nach dem Verlauf von `zuordnung` (Tag: je Stunde,
  Woche/Monat: je Tag, Jahr: je Monat) – es gibt dafür keinen eigenen Befehl.
- `baustelle/setzen`: Meldungsarten einzeln mit `pfad: ["meldungen_einst", "arten", "<art>"]`; `bereiche.<bid>.tuer`
  und `termine_kalender` = `entity_id` oder `null`; `heizung.heizgrenze_basis` = `jetzt|tageshoechst`.
- `baustelle/liste` – Einträge, wie die Seite sie schickt: `arbeitszeiten` `{ab, name, tage: {"0": ["HH:MM", "HH:MM"] | null, …}}`,
  löschen `{ab}`; `ausnahmen` `{datum, art, von, bis, notiz}`, löschen `{datum}`; `anschluesse`
  `{id?, name, ampere, phasen, reserve_kw, container}` (alle Container des Anschlusses; wer nicht mehr in der Liste
  steht, hängt danach am ersten anderen Anschluss – wie im Mockup), löschen `{id}`; `firmen` `{id?, name, container}`
  (alle Container der Firma), löschen `{id}`.
- `baustelle/aktion`: `bedarf` mit `bis` als ISO-Zeitpunkt („bis Arbeitsende“ = Ende der Arbeitszeit heute, „bis 19:00“);
  `warnung_stumm` schickt `bis` = morgen 07:00 bzw. `null` („wieder melden“).
- `baustelle/protokoll`: die Seite holt `filter: alle` (bis 200 Einträge) und filtert selbst wie das Mockup
  (Warnungen mit `ok`, Schalten mit `einstellung`); ohne Filter reichen die 20 Einträge aus `laufzeit.protokoll`.
- `baustelle/meldung`: `status` mit `meldung_id` + `status`, `loeschen` mit `meldung_id`, `neu` mit
  `meldung: {art, text, kontext, geraet, version, seite}` (`zeit`, `status`, `stand` setzt die Integration selbst).
  `seite` = „Stand der Seite mitschicken“ (Mockup): `{view, cid, baustelle, dialog}` oder `null`; wird mit der Meldung
  gespeichert (`stand` bleibt der Zeitpunkt der letzten Statusänderung).
- „Bericht · Beispiel“ (Einstellungen › Bericht) zeigt die Antwort von `baustelle/bericht` für die gewählte Häufigkeit
  (`monat` → Vormonat, sonst Vorwoche); die Seite rechnet den Bericht nicht selbst nach.
- Termine: `calendar/event/create` mit `description: "baustelle:<bid>"` (+ Zeile `boost` für schnell aufheizen),
  Serien `rrule: FREQ=WEEKLY` bzw. `FREQ=WEEKLY;INTERVAL=2`; löschen `calendar/event/delete {entity_id, uid}`.
  Urlaub: ganztägig in `optionen.urlaub_kalender` (`dtend` = Tag nach „bis“). Feiertage/Urlaub liest die Seite über
  `GET /api/calendars/<entity_id>`.
- Wetter: `weather/subscribe_forecast` (`daily` und `hourly`) für die Einblendung und die Werte je Tag in den Gründen
  des Heizplans; heute gelten `laufzeit.wetter`.
- Wetter/Kalender wählen: Options-Dialog (`wetter`, `temp_sensor`, `regen_sensor`, `urlaub_kalender`,
  `feiertag_kalender`), dazu `setzen termine_kalender`. Name: `config_entries/update {entry_id, title}`.
  Abschließen/wieder aktiv: Options-Dialog mit `status`. Neue Baustelle: Config-Dialog (`name`, `beginn` freiwillig,
  `heizung`, `pumpen`), der angehängte Dialog für den ersten Container wird verworfen.
- Diagnose: `auth/sign_path` für `/api/diagnostics/config_entry/<entry_id>`, dann Download.
- Adressen aus Handy-Nachrichten (§4) wertet die Seite beim Laden und bei `location-changed` aus:
  `baustelle` wählt die Baustelle (abgeschlossen → Detailseite), `container` öffnet den Container, `ansicht` die
  Ansicht (`uebersicht|heizung|auswertung|verlauf|einst`).
- „Über“ liest `/baustelle_static/changelog.json` (Liste `{version, datum, punkte}`, neueste zuerst).


## 6. Abgleich mit der echten Integration (30.09.2026)

- `tests/integration/test_abgleich.py` lässt eine Baustelle einen Arbeitstag lang laufen (feste Zeit 29.09.2026
  05:30–16:20, Fake-Shellys, echte Kalender-Entitäten) und schreibt die Antwort von `baustelle/struktur` nach
  `tests/panel/struktur-echt.json`, die Zustände der Entitäten und die Kalender (wie `GET /api/calendars/<id>`) nach
  `tests/panel/struktur-echt.zustaende.json`. Beide Dateien sind reproduzierbar (gleicher Inhalt bei jedem Lauf).
- `tests/panel/test_panel.js` rendert die Seite gegen `struktur-0.7.json` (Einzelprüfungen wie im Mockup) **und**
  `struktur-echt.json` (allgemein: jede Baustelle, jeder Container, jede Einblendung und Aktion). Mit
  `BAUSTELLE_AUFRUFE=<datei>` schreibt er jeden gesendeten Befehl mit; `test_abgleich.py` schickt sie danach genau so an
  HA: `baustelle/*`, `calendar/event/*`, `auth/sign_path`, `config_entries/update`, `config_entries/subentries/delete`
  über den WebSocket, die Einrichtungs-Dialoge über dieselben Flow-Manager wie die REST-Ansichten. Für
  `recorder/statistics_during_period` und `history/history_during_period` gilt: jede abgefragte Entität gibt es, und
  jede Statistik-Entität hat eine `state_class` (sonst führt der Recorder keine Langzeitstatistik).
- `laufzeit.termine`: eine Serie kommt je Vorkommen im Zeitraum (laufende und nächste Woche) mit derselben `uid` und
  `rrule` – so liefert sie der Kalender, und so plant die Integration die Heizzeiten. Die Seite fasst sie zu einer Zeile
  zusammen; `calendar/event/delete` mit dieser `uid` (ohne `recurrence_id`) löscht die ganze Serie.
- `zaehler.heiztage` (Tage, an denen ein Heizkörper tatsächlich Strom gezogen hat, ab 0.8.29; davor: eingeschaltet war) ist die Zahl, die die Seite als „Heiztage“ zeigt.
- Werte für `baustelle/setzen` aus den Steppern der Seite bleiben in den Bereichen von `panel.py` `SETZEN`.

## 7. Aus 0.6.3 zurück (0.7.8, Mockup glas.html abgenommen 30.09.2026)

- `baustelle/setzen`:
  - `bereiche.<bid>.modus` = `plan|thermo|bedarf|hand|aus` (Thermostat nur mit Fühler, sonst `invalid_format`). Setzt
    `auto` (= nicht `hand`) und `bedarf` (= `bedarf`) mit; `auto` oder `bedarf` allein setzen den Modus auf `null`
    (abgeleitet).
  - `heizung.frost_aus` (Frostschutz aus über … °C, `null` = Grenze + 2 °C; muss über `frost_grenze` liegen, sonst
    `invalid_format`), `heizung.frei_modus` = `frost|absenk|aus` (Urlaub und freie Feiertage), `heizung.absenk` (°C).
- `laufzeit.container[bid].modus`: wirksamer Modus (gesetzt oder abgeleitet: `bedarf` wenn Bedarf, `hand` wenn nicht
  auto, sonst `thermo` mit Fühler bzw. `plan`); `null` bei Pumpenschächten. Neue Gründe: `aus` (Modus Aus),
  `absenken` (Urlaub/Feiertag abgesenkt).
- `laufzeit.container[bid].firma` (Bauplan Module): Firmen-ID, der der Container jetzt gehört (letzter
  `zuordnung`-Eintrag mit `ab <= jetzt`, gelöschte Firma → `eigen`; `logik/abrechnung.firma_von`). Die Seite rechnet
  die Zuordnung nicht selbst nach.
- `baustelle/aktion`: `test_meldung` → Test-Nachricht an alle Empfänger, Antwort `{ok, an: [Namen]}`.
- Lernende Regelung (0.8, `logik/lernen.py`): Einstellung `bereiche.<id>.lernen` (bool, startet aus; wirkt mit Fühler im
  Modus Thermostat, Bei Bedarf und beim Absenken). `laufzeit.container.<id>.lernen` (nur mit Fühler, sonst `null`):
  `{an, zyklen, kint: {wert, start, fort}, kext: {…}, nachlauf: {"oel|lang|kalt": {grad, min, n}, …}, treffer: [Spitze −
  Soll …], anteil (% je Zyklus oder null), erwartet (°C), aus_bei (°C), zyklus_min}`. `baustelle/aktion` `lern_reset`
  mit `bereich` setzt den Lernstand zurück.
- Takt der lernenden Regelung (Mockup `takt.html`, Variante B, Herbert 28.10.2026; `lernen.takt_anzeige`):
  `laufzeit.container.<id>.takt` = `{art: "runde"|"dauernd"|"erreicht", anteil (%), zyklus_min, an_min, aus_min (je
  Runde, auf ½ min), phase: "an"|"pause", bis ("HH:MM" | null), minute (Stelle „jetzt“ in der Runde, nur bei „runde“,
  sonst null)}` – nur, solange der Container selbst nach TPI auf das Soll regelt (Frühstart, Vorheizen, Arbeitszeit,
  Nachheizen, Trocknen, Bei Bedarf; nicht von Hand, nicht offline, nicht bei Tür offen), sonst `null`. `dauernd` = an-Teil
  über `zyklus_min − 2` min, `erreicht` = unter 2 min. `bis`: Ende der laufenden Phase nach `tpi_ein` mit dem Anteil von
  jetzt (an-Teil mit Mindestlaufzeit, Pause bis zum Beginn der nächsten Runde); `null` bei dauernd/erreicht und wenn die
  Runde unterbrochen ist (der Heizkörper steht anders, als die Regelung will: Staffelung, Mindestpause). Der Zustandstext
  sagt dann „Pause bis 17:42“ bzw. „Pause · wartet“ (bis 0.8.153 „Takt-Pause · lernend 46 % je 10 min“).
- Eingestellt im Kopf der Container-Ansicht (Mockup `eingestellt.html`, Variante C, Herbert 28.10.2026; `logik/eingestellt.py`):
  `laufzeit.container.<id>.eingestellt` = `[{k, ic, text, kurz, satz, von: "container"|"baustelle", wirkt, grund, ziel}]` –
  nur, was an ist und den Container betrifft, in der Reihenfolge der Anzeige (erst Container: `lernen`, `warm`,
  `trocknen`, `stufen`, `prio`, `tuer`; dann Baustelle: `frost`, `vorheizen`, `nachheizen`, `fruehstart`, `feiertag`,
  `staffel`, `notprogramm`, `taste`); Pumpenschächte und Baustellen ohne Heizung `null`. `text` Chip am Desktop, `kurz` am
  Handy, `satz` beim Antippen. `wirkt: false` = an, wirkt gerade nicht, `grund` sagt warum (Automatik aus; Modus Hand:
  nur Frostschutz, Tür offen und Notprogramm wirken; Modus Aus: nur Frostschutz und Notprogramm; lernende Regelung im
  Zeitplan; Taste ohne Notprogramm), sonst `grund: null`. Nicht bei lernenden Containern (Fühler + lernend, nicht Zeitplan
  oder Bei Bedarf): Vorheizen, Nachheizen, Kälte-Frühstart; `warm` nur bei lernenden mit eigenem `warm_vor`/`warm_nach`.
  Bei Bedarf: kein Trocknen, Nachheizen, Frühstart, Feiertag; Vorheizen „vor jedem Termin“. `stufen` ab zwei Heizkörpern,
  `prio` nur hoch/niedrig mit Staffelung, `tuer` nur mit Tür- oder Fensterkontakt, `frost` ohne Fühler nur mit
  `frost_aussen`. `ziel` (Sprungziel für „ändern ›“; die Seite bildet es nur auf ihre Navigation ab): `bearbeiten:lernen`,
  `bearbeiten:trocknen` (AN-0018), `bearbeiten:warm`, `bearbeiten:stufen`, `regeln:<frost|tuer|vorheizen|nachheizen|fruehstart>`,
  `strom`, `strom:vorrang`, `notprogramm`, `urlaub`.
- „Warm ab“ (AN-0004, Optimum Start): Einstellungen `heizung.warm_vor_min` (Soll erreicht … min vor Arbeitsbeginn, 0–240),
  `heizung.warm_nach_min` (warm halten … min nach Arbeitsende, 0–240), `heizung.warm_max_min` (frühestens … min vor
  dem Ziel „warm um“ = Arbeitsbeginn − `warm_vor`, 15–480; bis 0.8.156 vor Arbeitsbeginn – FE-0031/32); je Container
  `bereiche.<id>.warm_vor` / `warm_nach` (Zahl oder `null` = wie die Baustelle).
  `laufzeit.container.<id>.lernen` zusätzlich `aufheizen: {kalt|mild: {rate (°C/h), n}}`, `auf_n` (nötige Messungen) und
  `warm` (nur lernend im Modus Thermostat, sonst `null`): `{gelernt, band, rate, n, n_noetig, vor, nach, max, vor_eigen,
  nach_eigen, aufheiz_min, innen, soll, fest, plan: {tag, start, ziel, a, b, ende, begrenzt} | null}` (Minuten seit
  Mitternacht). Seit FE-0031/32 ist `plan` der Plan des Tages mit dem nächsten Start (`plan.tag`, ISO; bis 0.8.156
  immer heute), `band`/`anzahl`/`aufheiz_min` kommen aus der Start-Logik (nach dem Start festgehalten).
  Plangrund `gelernt` in `plan_woche` und `abschnitte` der lernenden Container.
- Start-Logik (FE-0031/FE-0032, Mockup `start.html` Variante B, Herbert 29.10.2026; `logik/start.py`): eine Rechnung für
  Regelung (Plan über „Warm ab“: Aufheizzeit = Ziel − Start), Zustandstext („aus bis morgen 03:30“), Plan-Chip und Dialog.
  Tag: der nächste Tag, dessen Ziel „warm um“ noch kommt; ist heute schon gestartet (festgehalten), heute bis zum Ende
  von „warm halten“ (eigene Zeitfenster zählen nicht als Start). Gerechnet wird in echter Zeit (Zeitumstellung). Auskühlen bis zum Start je 5 min
  mit dT/dt = −(innen − außen) ÷ τ und der stündlichen Vorhersage (`laufzeit.wetter_stunden`), dann Aufheizen mit der
  gelernten Rate (Band außen zum Start, Anzahl Heizkörper, „Zusatz nur bei Bedarf“); Start = spätester 5-min-Zeitpunkt,
  mit dem es bis zum Ziel warm ist, nie vor der Grenze. `laufzeit.container.<id>.start` (nur lernend im Modus
  Thermostat mit Fühler und Innenwert, sonst `null`): `{tag: "heute"|"morgen"|ISO, tag_t ("heute"|"morgen"|"Mo"…),
  tag_grund, jetzt ("HH:MM", Stand der Rechnung), laeuft (Start vorbei, heizt auf – rechnet ab der Messung von jetzt),
  beginn, warm, ziel, arbeitsbeginn, grenze ("HH:MM"), vor_min, soll, innen_jetzt, innen_start (Prognose bzw. gemessen
  beim Start), tau_h, tau_n, tau_geschaetzt, aussen_von, aussen_bis, band, rate, rate_n, rate_geschaetzt, anzahl,
  rate_einer (°C/h eines Heizkörpers, wenn er allein zu langsam ist), aufheiz_min (Dauer der Prognose), grenze_h,
  begrenzt, beginn_ohne ("HH:MM" ohne Grenze | null), spaet (warm erst nach dem Ziel), geschaetzt, schaetz_grund,
  frueher_min, auf_beginn ("HH:MM" ohne „früher“; `beginn` = Plan-Beginn = „aus bis …“, auch wenn „Kleidung trocknen
  nach Regen“ oder „Noch früher“ den Plan vorziehen – die Verschiebung kommt aus dem Plan selbst, `Plan.frueher` =
  [(Grund, min)] mit `frueher_nach_regen`/`noch_frueher`; dann Kachel `k: "frueher"` mit Grund und Minuten), satz
  (ein Satz für die Chips), kurz („03:30 → 06:35“, Handy), aus_bis ({lang: "aus bis morgen 03:30", kurz: "morgen 03:30"}
  nur, wenn der Zustandstext gerade „aus bis …“ sagt, sonst null – Jetzt-Chip), achse_ab ("HH:MM", Anfang der Zeitachse), min: {jetzt, beginn, warm, ziel, arbeitsbeginn, grenze}
  (echte Minuten ab heute 0:00, morgen ≈ +1440, gestern negativ – nur zum Zeichnen), kurve: [[min, °C, "gemessen"|"prognose"]],
  aussen_vorhersage: [[min, °C, "gemessen"|"vorhersage"]], schritte: [{k: "kuehl"|"ziel"|"auf"|"grenze"|"warm", t, wert,
  rechnung, marke: "gelernt"|"geschaetzt"|"gemessen"|"einstellung"|null, marke_t, ton: ""|"amber"|"ergebnis"}]}`
  (`k` auch `"frueher"`).
  Ohne Lernstand: τ = 12 h, Rate aus der Größe (`geschaetzt`). Rechnet bei jedem neuen Messwert und jeder neuen
  Vorhersage nach (höchstens einmal je Minute). `text` nennt den Tag: „aus bis 06:15“ (heute), „aus bis morgen 06:15“,
  „aus bis Mo 06:15“ (alle Container, bis 0.8.156 ohne „morgen“).
- Auskühlzeit τ (FE-0031/32, `logik/lernen.py`): `lernen.tau = {h (τ in Stunden | null), n (Messungen), start (12),
  n_noetig (2), misst (bool)}`. Gemessen ohne Heizen (Heizkörper aus, Nachlauf vorbei, Tür zu, nicht von Hand, nicht
  8–16 Uhr), 2–10 h je Messung (echte Zeit, eine Lücke über 10 min beendet sie): τ = Σ(innen − außen)·Δt ÷ Abkühlung; plausibel ab 0,5 °C Abkühlung, 4 °C Abstand und τ
  2–100 h; gleitend gemittelt. Store: `laufzeit.lernen.<id>.tau = [τ, n]`, laufende Messung `ab`.
- Intern (Store): `laufzeit.warm_start.<id>` ist seit FE-0031/32 `{tag, beginn, aufheiz_min, innen_start, prognose,
  warm, band, anzahl, rate, rate_n, zusatz, geschaetzt, begrenzt, tau_h, auf_beginn (Beginn des Vorheizens laut Plan), frueher: [[Grund-Code, min], …]}` (bis 0.8.156 `[tag, aufheiz_min, zusatz,
  geschätzt]`, wird weiter gelesen); `laufzeit.start_verlauf.<id>` = `[[Zeit, innen, außen], …]` alle 15 min, 12 h.
- Zusatz-Heizkörper nur bei Bedarf (AN-0006, `logik/stufen.py`): je Container `bereiche.<id>.stufen` (bool) und
  `bereiche.<id>.primaer` (Geräte-ID des Primärheizkörpers, `null` = automatisch; AN-0015 – genau einer primär, die
  anderen Zusatz), je Gerät `geraete.<id>.zusatz` (bool, nur noch Rückfall ohne Wahl; die Seite setzt es nicht mehr), Schwellen `heizung.stufen_abstand` (°C unter Soll),
  `stufen_min` (min Laufzeit des ersten), `stufen_anstieg` (°C), `stufen_kalt` (°C außen). `laufzeit.container.<id>.stufen`
  (ab zwei Heizkörpern, sonst `null`): `{an, haupt: [ids], zusatz: [ids], zusatz_an, grund, text, auto: [id]}` (`auto`: primär ohne Wahl, AN-0015); `laufzeit.geraete.<id>.zusatz`.
  Aufheizen lernt je Anzahl laufender Heizkörper: `lernen.aufheizen` mit Schlüsseln `kalt|1`, `mild|2` …; `lernen.warm.anzahl`.
- Ölradiator oder Konvektor (AN-0008): `baustelle/auswertung` → `typ = {oelradiator|konvektor: {kwh_gradh, kwh_gradh_m2,
  auf, auf_je_kw, ab, anzahl, kw, m2, container: [Namen], ids}, weniger, vergleichbar, nur_einer, seit,
  ausgeschlossen: [{name, grund}], ersparnis: {faktor, oel, konvektor, oel_kwh, konvektor_kwh, erspart_kwh,
  erspart_eur} | null}`; Zähler `vgl_kwh`, `vgl_gradh`, `vgl_aufheiz`, `vgl_abkuehl` je Container (seit `seit`, dem
  Zählbeginn – nicht je Zeitraum). FE-0023/AN-0016: `weniger` und der Faktor der Ersparnis je Gradstunde und m²;
  `anzahl`/`kw`/`m2` = Heizkörper, eingebaute Leistung und Fläche der zählenden Container; `auf_je_kw` = Aufheizen je kW;
  `nur_einer` = eine Seite hat nur einen Container.
- Ohne Automatik je Container (WU-0013): `baustelle/ohne` mit `entry_id`, `bereich`, `zeitraum`, `versatz`, `basis`
  (`geraet` | `typ`) → `{zeitraum, basis, preis, kw, reihe: [kWh je Periode], ohne_kwh, kwh, ergebnis: {ohne_eur,
  gespart_eur, prozent} | null, geraete: [{id, typ, kw}]}`; 24/7 ab Beginn der Baustelle bis jetzt.
- Geräteübersicht (WU-0010): `geraete_links` = `{entity_id: {web (configuration_url, nur http/https), ha (Geräteseite),
  geraet, hersteller, modell, batterie (Batterie-Sensor am Gerät), signal (Signalstärke-Sensor am Gerät, AN-0009), feuchte (Feuchte-Sensor am Gerät, für die Fühler-Kachel, AN-0018)}}` für alle benutzten Entitäten (Schalter, Leistung,
  Energie, Fühler, Türkontakte, Außen, Regen, Wetter); ohne Geräteeintrag alle Felder `null`.
- Szenarien (Runde 2): je Gerät `geraete.<id>.nenn_kw` (kW ohne Messung, `null` = Standard: Heizkörper 2,0, Pumpe 0,8;
  seit 28.10.2026 bei jedem Heizkörper als „Nennleistung (Typenschild)“ = P_ref der Prognose, auch mit Leistungssensor –
  gemessenes Mittel und laufende Messung gehen in der Staffelung weiter vor);
  `geraete[].nenn_kw_eigen` in der Struktur. `lz.tuer_trotzdem` (intern). Warnungen `keine_leistung`/`zu_kalt` nur bei
  Modus thermo/bedarf, `hand_zu_lange` nicht im Modus Hand. `bereiche.<id>.lernen = true` ohne Fühler wird abgelehnt.
- Szenarien (Herbert 01.10.2026): `heizung.frost_aussen` (°C, `null` = aus; Standard −3): Frostschutz für Container
  ohne Fühler nach der Außentemperatur (aus ab +2 °C). Fühler kurz weg: 15 min der letzte Wert (`laufzeit.fuehler_zuletzt`
  intern), Außenwert weg: Wetter-Entität, sonst der letzte bis 6 h. Tür offen pausiert nur, wenn geheizt würde oder ein
  Heizkörper läuft; sonst Warnung `tuer_offen` mit `werte.pausiert = false` (Hinweis ohne „Trotzdem heizen“).
- Tür offen schützt das Lernen (WU-0009): `lernen.offen` = `{art: "vermutet"|"kontakt", seit}` oder `null`, `lernen.ruhe_bis`
  (bis dahin keine neue Messung). Vermutet: beim Heizen in 10 min ≥ 0,3 °C kälter (außen ≤ 0,2 °C kälter) oder in
  30 min ≥ 0,6 °C (außen ≤ 0,4 °C); „beim Heizen“ = Plug jede Minute an, mindestens einmal Strom (FE-0025, taktende
  Radiatoren). Erkannt wird auch ohne Lernen; die Heizung pausiert dann 10 min (Grund `tuer_offen`) und versucht es neu.
- Gerät aktiv/inaktiv (WU-0004): `baustelle/aktion` `aktiv` mit `geraet` und `an` (bool) – ab 0.8.116 dasselbe wie
  `baustelle/geraet` Status aktiv bzw. inaktiv (§11). Nicht aktiv: einmal ausschalten, danach schaltet die Automatik es
  nicht, es zählt nicht in der Staffelung, keine Warnungen; gespeichert unter `einstellungen.geraete.<id>.status` (bis
  0.8.115 `aktiv: false`, wird weiter als „inaktiv“ gelesen), sichtbar in `laufzeit.geraete.<id>.status` und `.aktiv`. `geraete[]` hat zusätzlich
  `leistung_eigen`/`energie_eigen` (selbst gewählter Sensor, sonst `null` = am Shelly automatisch erkannt).
  Gerät bearbeiten: ab 0.8.117 `baustelle/geraet` `speichern` mit Schritt `aendern` (§11), vorher Subentry-Dialog `geraet`.
- `baustelle/setzen`: `erklaer` (Erklärtexte der Seite), `heizung.frost_immer` (0.7.9: Frostschutz auch bei
  ausgeschalteter Automatik – dann schaltet nur der Frostschutz; Standard aus), `heizung.notprogramm` (0.8.63, BSM-017:
  Notprogramm in den Plugs – Skript und Programm einspielen, Lebenszeichen alle 5 min; Standard aus, Ausschalten hält
  das Skript an; Stand je Plug in der Diagnose unter `notprogramm`, Bauplan 0.7 §9).
- Container-Symbol (0.8.68, BSM-032; Rahmen 0.8.70): `baustelle/setzen` `bereiche.<id>.symbol` = `{doppel, farbe: "#rrggbb"|null, rahmen: "#rrggbb"|null,
  tueren: [{wand: "front"|"seite", pos, sensor}] (1–2), fenster: [{wand, pos, sensor}] (1–4), licht: entity_id|null}` oder
  `null` (Standard: eine Tür links, ein Fenster); `pos` wird auf 0,15/0,33/0,5/0,67/0,85 gerundet (logik/symbol).
  `laufzeit.container.<id>.symbol` = dasselbe mit Zustand: `eigen`, je Tür `offen` und `sensor_aktiv` (Tür 1 ohne Sensor:
  Türkontakt des Containers), je Fenster `zustand: "zu"|"gekippt"|"offen"` (offen + Drehung ≥ 5° am selben Gerät =
  gekippt), `licht_an` (an bzw. Helligkeit > 50 lx); Pumpenschächte `null`.
- Ausfall-Probe (0.8.73, BSM-021): `baustelle/notprogramm_probe` (`entry_id`, `geraet`, `minuten` 0–240; 0 = beenden; nur
  Admins) → Stand des Plugs; `laufzeit.geraete.<id>.notprogramm` mit `probe_bis` und `probe_ergebnis` =
  `{von, bis, stunden, buch_kwh, buch_min, ha_kwh, ha_min}`.
- Taste am Plug (0.8.71, BSM-018): `baustelle/setzen` `heizung.taste` (bool, Standard aus, wirkt nur mit
  `heizung.notprogramm`); `laufzeit.taste_bis` = Container → Ende (ISO); Grund `taste`, Text „Taste am Plug · bis …“.
- Notprogramm anzeigen (0.8.66, BSM-019): `laufzeit.notprogramm` = `{an, geprueft}`; je Heizkörper-Plug
  `laufzeit.geraete.<id>.notprogramm` = `{zustand: "aus"|"offen"|"bereit"|"not"|"fehler", fehler, fehler_seit, version,
  programm, bis, modus: "thermo"|"plan"|"bedarf"|"hand"|"aus", soll, toleranz, frost_ein, frost_aus, fuehler, tuer,
  notbetrieb_seit, notbetrieb_zuletzt: [von, bis], zuletzt, skript_id, fuehler_fehlt}` (andere Geräte `null`).
  `baustelle/notprogramm_pruefen` (`entry_id`, nur Admins) und Dienst `baustelle.notprogramm_pruefen` (nur Admins) stoßen
  sofort eine Runde an; die Antwort ist der Stand wie in der Diagnose. Warnung `notprogramm` (Hinweis), wenn ein Plug
  15 min lang nicht bereit ist; Protokoll „Notbetrieb <Plug>: … bis … (… min)“, wenn ein Plug nach einem Ausfall wieder
  antwortet.
- Bericht (0.7.9): `heiztage` = Tage mit Heizzeit > 0 in einem Container (Statistik `<bid>_heizzeit`), wie `zaehler.heiztage`.
- Beginn/Ende und Heizperiode: Options-Dialog (`beginn`, `ende`, `heizperiode_von`, `heizperiode_bis` als `"1"`…`"12"`).
  Beginn leer = Tag der Anlage. Ende (`logik/zeitraum.ende_beim_speichern`): beim Abschließen immer heute, bleibt
  abgeschlossen → eingetragenes Ende, wieder aktiv → kein Ende, aktiv → geplantes Ende bleibt (AN-0002).
  Die Hochrechnung (`<entry>_prognose_heizperiode…`) zählt nur bis zum geplanten Ende, wenn es in der Heizperiode liegt.

## 8. Auswertung und Abrechnung von der Integration (0.7.14, Bauplan Module Phase 2)

Die Seite rechnet nichts Fachliches mehr: Kennzahlen, Abrechnung nach Firma, CSV, Heizperiode, Heiztage, Verlauf,
Ölradiator/Konvektor, Wetter-Einfluss und Je Gerät kommen von der Integration (`auswertung.py` holt die
Langzeitstatistik, `logik/auswertung.py` rechnet) – mit € und % dort, wo die Seite sie zeigt. Einzige Ausnahme
(Bauplan Module §5): Werte, die die Seite selbst aus der Statistik als Diagramm zeigt (Verbrauch-Block mit frei
gewählten Reihen, „Kosten heute“ eines Containers, Hinweise beim Zeigen auf ein Diagramm, Hochrechnung aus den
Sensoren), rechnet sie zur Anzeige mit dem Preis der Baustelle (`einstellungen.preis`) in € um. Bericht und CSV-Anhang nehmen dieselben Funktionen – für denselben
Zeitraum (Vorwoche = `Woche`/`versatz: 1`, Vormonat = `Monat`/`versatz: 1`) dieselben Zahlen. Nur reine
Diagramm-Reihen (Verbrauch je Container, Temperaturen, Leistung) holt die Seite weiter selbst über
`recorder/statistics_during_period`.

Gemeinsame Felder: `entry_id` (auch abgeschlossene oder nicht geladene Baustelle; unbekannt → `not_found`),
`zeitraum: Tag|Woche|Monat|Jahr` (Standard `Monat`), `versatz` (0 = laufender, 1 = der davor …, höchstens 4000 – Tage bis zum Beginn der Baustelle, FE-0008), `scope: diese|alle`
(`alle` = alle laufenden Baustellen; Preis der Baustelle `entry_id`). Zeitraum in der Antwort:
`{"art", "von", "bis" (erster Tag danach), "periode": "hour|day|month", "n", "labels", "monat" (1–12|null), "jahr"}`.

| type | Felder | Antwort |
|---|---|---|
| `baustelle/auswertung` | gemeinsame, `teil: zeitraum\|verlauf` (Standard `zeitraum`) | siehe unten |
| `baustelle/abrechnung` | gemeinsame | siehe unten |

`baustelle/auswertung`, `teil: zeitraum` (Reiter Auswertung):

```json
{"zeitraum": {}, "preis": 0.28,
 "summen": {"kwh": 0, "eur": 0, "heizzeit": 0, "pumpzeit": 0, "ohne": 0,
            "vorher": {"kwh": 0, "heizzeit": 0, "pumpzeit": 0}, "veraenderung": {"kwh": 5, "heizzeit": null, "pumpzeit": null},
            "ohne_automatik": {"ohne_eur": 0, "gespart_eur": 0, "prozent": 0} },
 "je_geraet": [{"bereich": "<bid>", "geraet": "<gid>", "mittel": 1.98, "kwh": 12.1, "std": 6.1, "eur": 3.39}],
 "wetter": {"punkte": [[4.2, 18.5]], "gerade": {"k": -1.2, "d0": 20, "null0": 16.7, "eur_je_grad": 0.34}},
 "typ": {"oelradiator": {"kwh_h": 1.6, "auf": 2.7, "ab": 2.7, "tag": 3.05}, "konvektor": {}, "weniger": 17},
 "heizperiode": {"ende": "2027-04-30", "bis": "2027-04-30"}, "heiztage": 16,
 "hochrechnung": {"bisher_kwh": 412, "bisher_eur": 115.36, "mit_kwh": 2310, "mit_eur": 646.8, "ohne_kwh": 10626,
                  "ohne_eur": 2975.28, "gespart_eur": 2328.48},
 "gespart_reihen": {"mit_kwh": [1.2, 3.4, null], "mit_eur": [0.34, 0.95, null], "ohne_kwh": [5.0, 5.1, null], "ohne_eur": [1.4, 1.43, null],
                    "gespart_kwh": [3.8, 1.7, null], "gespart_eur": [1.06, 0.48, null],
                    "summe": {"mit_kwh": 4.6, "mit_eur": 1.29, "ohne_kwh": 10.1, "ohne_eur": 2.83, "gespart_kwh": 5.5, "gespart_eur": 1.54}},
 "rangliste": [{"bereich": "<bid>", "name": "Polier", "baustelle": "…", "kwh": 60, "heizzeit": 25, "eur": 16.8, "kwh_h": 2.4, "anteil": 60}],
 "erkenntnisse": [{"art": "gespart|groesster|sparsamster|wetter|mehr|weniger|typ", "…": "Werte je Art"}]}
```

- `rangliste` (Container über `scope`, absteigend nach kWh; `kwh_h` ohne Heizzeit `null`) und `erkenntnisse` (höchstens 5,
  Regeln in `logik/auswertung.erkenntnisse`; nur Daten, den Text macht die Seite) – WU-0005.
- `summen` über `scope`; `heizzeit` nur Container, `pumpzeit` nur Pumpen; `veraenderung` in ganzen % zum Zeitraum davor
  (`null` ohne Wert davor); `ohne_automatik` `null`, solange „ohne Automatik“ 0 ist, sonst mit `ohne_eur` (Kosten im
  Dauerbetrieb, 0.7.24).
- `gespart_reihen` (Kachel „Gespart“, Mockup `gespart.html` Variante B, Herbert 28.10.2026) über `scope` (auch „alle
  laufenden“): je Periode des Zeitraums (`zeitraum.n`: Tag je Stunde, Woche/Monat je Tag, Jahr je Monat) „mit
  Automatik“ (Energie der Container), „ohne (24/7)“ und „gespart“ in kWh und € (× `preis`), dazu `summe`. Regel einmal in
  `logik/auswertung.gespart_reihen`: Σ`gespart` = `summen.ohne_automatik.gespart_eur` (Σohne − Σmit, nie unter 0); je
  Periode nie unter 0 – die Perioden, in denen der Zähler „ohne Automatik“ über „mit“ liegt, teilen sich die Summe im
  Verhältnis ihres Abstands (liegt er nie darunter, ist es genau der Abstand); `ohne` je Periode = `mit` + `gespart` (die
  gestrichelte Linie der Kachel, Σ = `ohne_automatik.ohne_eur`, solange Σohne ≥ Σmit). Perioden ganz ohne Wert (kommende
  Stunden/Tage) `null`; `null` wie `ohne_automatik`, solange „ohne Automatik“ 0 ist. Die Seite zeichnet nur.
- `je_geraet`, `wetter`, `typ`, `heizperiode`, `heiztage` immer für die Baustelle `entry_id`. `je_geraet` nach
  Containern geordnet; `mittel` Ø kW im Betrieb (ab 50 W), `std` bei Pumpen gemessen, sonst kWh ÷ Ø kW (Schätzung).
  `wetter.gerade` `null` unter 5 Heiztagen; `eur_je_grad` = −k · Preis (Mehrkosten am Tag je Grad kälter, `null` bei
  k ≥ 0; 0.7.24). `heizperiode.bis` = geplantes Ende, wenn es vor dem Ende der Heizperiode liegt.
- `hochrechnung` (Karte „Heizperiode“, Bauplan Hochrechnung §4/§5) dazu: `methode` `signatur|heizgradtage|tagesschnitt|keine`
  (FE-0030: `heizgradtage`, solange eine Signatur lernt – kWh je Heizgradtag der bisherigen Heiztage × Heizgradtage jedes
  künftigen Heiztags; `tagesschnitt` nur, wenn die bisherigen Heiztage keine Heizgradtage hatten), je Container
  `container[].methode` ebenso; `herkunft` (Text unter dem Diagramm, von der Integration) und `herkunft_lernt` (Seite
  setzt davor fett „lernt noch“). Signatur, `punkte` und Rest zählen nur **Heiztage** nach Heizplan (Arbeitszeit,
  Ausnahmen, Feiertag/Urlaub der ganzen Heizperiode, Container nicht „aus“); Tage ohne Heizplan haben im Rest 0 kWh.
- **Baseline-Läufe (J4b, FE-0033, Mockup `baseline.html` Variante B; Regeln in `logik/baseline.py`):** `laufzeit.baseline`
  in `baustelle/struktur` (Heizung aktiv, sonst `null`; `baustelle/auswertung` › `hochrechnung.baseline` bleibt `{an,
  laeufe}` aus der letzten Hochrechnung):
  `{an, rahmen: {monat: "2026-10", budget_eur, gemessen_eur, geplant_eur, rest_eur}, vorschau, container, laeufe, offen,
  hinweis, stand_t}`. `rahmen`: Monat von heute; gemessen = Kosten beendeter Läufe (bis sie nachgetragen sind – am Tag
  nach dem letzten Tag – ihre Schätzung), geplant = Schätzung geplanter und laufender Läufe, Rest wie beim Planen (`monat_rest`, abgesagte zählen nicht, Monat des ersten Tags). `vorschau` (nur an, mit
  Automatik und ohne geplanten/laufenden Lauf): nächster Block und Container nach `planen` – `{von, letzter, bereich,
  name, von_t, letzter_t, schaetzung_eur, plant_am, plant_am_t}` (geplant und angekündigt am Vortag 12:00; ist heute schon
  geplant worden, frühestens übermorgen), sonst `null`. `container[]`
  je Container der Heizung: `{bereich, name, typ: oelradiator|konvektor|gemischt|"", tage (zählende Baseline-Tage), noetig
  (10), stand (Signatur „ohne“: lernt|gut|brauchbar|unsicher, ohne Tage null), fertig (gut – dann kein Lauf mehr),
  kein_lauf ("ohne Heizkörper"|"Modus aus"|"ohne Automatik"|"bei Bedarf"|null), uebernimmt ([bereich] – gemessene
  Container, deren Verhältnis ohne ÷ mit gilt – aus `hochrechnung.ohne.container[].quelle`, `logik/hochrechnung.quellen`)}`. `laeufe[]` (letzte 12) = `Lauf.als_dict` (`id, bereich, von, bis`
  (ausschließlich), `status geplant|laeuft|fertig|abgebrochen|abgesagt, schaetzung_eur, kosten_eur, kwh, grund, ende,
  angekuendigt, abbruch_um`, Metadaten) und dazu `name, typ, letzter` (letzter Tag inklusive), `von_t, letzter_t`
  („Sa 31.10.“), `tage, zaehlt` (zählende
  Tage, abgebrochen: die vor dem Abbruchtag), `angekuendigt_t, abbruch_t` („Fr 30.10. 12:00“), `bis_t` („So 24:00“),
  `bisher_kwh, bisher_eur` (nur während des Laufs: Zähler des Containers seit dem Start, sonst `null`; `kwh` und
  `kosten_eur` kommen erst am Tag nach dem letzten Tag). `offen` = der geplante bzw. laufende Lauf (wie in `laeufe`) oder `null`. `hinweis` = „Prognose
  ohne Automatik: Schätzung 24/7 – wird durch Baseline-Läufe ersetzt.“, solange `ohne_methode` `schaetzung` ist, sonst
  `null`; `stand_t` = Satz darunter („1 von 4 Containern gemessen · nächster Lauf Sa 31.10. (003_C_MAN).“, aus: „Baseline
  messen ist aus.“). Während eines Laufs `laufzeit.container.<id>.baseline` = `{lauf_id, von, letzter, von_t, letzter_t,
  bis (ISO, Ende ausschließlich), bis_t, bisher_kwh, bisher_eur}`, sonst `null`. `baustelle/aktion` `baseline_absagen`
  mit `lauf_id` (nur Admins): wie der Knopf „Absagen“ der Nachricht – geplant → abgesagt, läuft → abgebrochen (der Tag
  zählt nicht), Grund „über die Seite (Benutzer)“, Uhrzeit in `abbruch_um`; kein offener Lauf mit dieser ID → `not_found`.
  Einschalten und Kostenrahmen über `baustelle/setzen` `heizung.baseline` bzw. `heizung.baseline_eur_monat`.
  „Ohne Automatik“ der Baustelle (`ohne_methode: baseline`) gilt, sobald jeder Container eine Quelle hat
  (`logik/hochrechnung.quelle_ohne`): eigene Signatur „ohne“, das Verhältnis gemessener Container desselben Typs, ohne
  Heizkörper „ohne“ = „mit“ (bis 0.8.158 blieb es dann für immer bei der Schätzung), ein Container, der nie einen Lauf
  bekommt (Modus aus, ohne Automatik, bei Bedarf), ohne gleichartigen gemessenen das Verhältnis aller gemessenen.

`baustelle/auswertung`, `teil: verlauf` (Reiter Verlauf, Detailseite; `zeitraum`/`scope` ohne Bedeutung):

```json
{"kwh": 412, "eur": 115.36, "gespart": 515.2, "gespart_text": "gespart seit 08.09.", "container": 7, "heiztage": 16, "monate": 1, "je_tag": {"2026-09-30": 25.4},
 "vergleich": {"tag": 25.75, "monat": 115.36, "ges": 412},
 "je_monat": {"2026-09": 340.9},
 "monate_je_container": {"labels": ["Sep"], "reihen": [{"bereich": "<bid>", "name": "Polier", "v": [330.9],
                                                     "kwh": 330.9, "eur": 92.65, "anteil": 97.1}]},
 "csv": "﻿Monat;Baustelle;Container;kWh;Kosten €\r\n…"}
```

- `monate_je_container.reihen[]`: `kwh`, `eur` und `anteil` (% an allen Containern) über alle Monate (0.7.24,
  `auswertung.monate_summen`).

`baustelle/abrechnung` (Reiter Auswertung: Abrechnung nach Firma, Verbrauch gestapelt nach Firma, beide CSV):

```json
{"zeitraum": {}, "preis": 0.28, "kwh": 81.0,
 "firmen": [{"id": "eigen|<Firmenname>", "firma": "Eigene Firma", "eigen": true, "kwh": 68.0, "eur": 19.04, "anteil": 84.0,
             "container": [{"entry": "", "titel": "", "bereich": "<bid>", "name": "", "kwh": 14.4, "eur": 4.04}]}],
 "reihen": {"eigen": [0.2, 1.4], "Elektro Huber GmbH": [0, 0.5]},
 "csv": {"firma": "﻿Zeitraum;Firma;Baustelle;Container;kWh;Preis €/kWh;Betrag €\r\n…",
         "verbrauch": "﻿Zeit;Baustelle;Firma;Container;kWh;Kosten €\r\n…"}}
```

- Firma je Tag: der Verbrauch eines Tages gehört der Firma, der der Container zu Tagesbeginn gehört (auch beim Tag je
  Stunde und beim Jahr); Firmen mit gleichem Namen auf verschiedenen Baustellen sind eine Zeile, eigene Firma zuerst.
- `reihen`: kWh je Firma und Periode des Zeitraums (Firmen ohne Verbrauch fehlen).
- CSV wie bisher auf der Seite: BOM, Semikolon, Dezimalkomma ohne Tausendertrennung, CRLF, Felder mit `;`, `"` oder
  Zeilenumbruch in Anführungszeichen (RFC 4180). „Verbrauch“ je Periode eine Zeile (Firma zu Beginn der Periode).

**Funktionen (0.7.18, Bauplan Module Phase 5):** Jede Baustelle in `baustelle/struktur` hat neben `baustelle` das Feld
`"funktionen": ["heizung", "pumpen"]` – die eingeschalteten Funktionen nach den Optionen `heizung`/`pumpen`
(`funktionen.aktive`, je Funktion ein Modul in `funktionen/`), auch bei einer nicht geladenen Baustelle. Die Seite zeigt
den Reiter Heizung nur mit `heizung`, den Reiter Pumpen nur mit `pumpen` und mindestens einem Pumpenschacht.


## 9. Statistik aus der eigenen Datenbank (0.8.58, BSM-014)

`baustelle/statistik` (`start_time`, `end_time`, `statistic_ids`, `period`: 5minute|hour|day|week|month, `types`,
`entry_id`) antwortet wie `recorder/statistics_during_period` – `{statistic_id: [{start, end, change|mean}]}`, `start`
in Sekunden – aus der eigenen Datenbank: die eigenen Sensoren (`<bid>_energie`, `<entry>_energie`, `<bid>_heizzeit`,
`<bid>_heizzeit_strom`, `<gid>_pumpzeit`, `<gid>_pumpzyklen`, `<entry>_aussen`), die Energiezähler der Shellys und die
Fühler. Anders als HA mit der laufenden Stunde bzw. dem laufenden Tag; für diese IDs ist `5minute` leer. Was die
Datenbank nicht kennt (`<entry>_energie_ohne_automatik`, `<entry>_ersparnis`) kommt aus der HA-Statistik. Einstellung
`auswertung_quelle` (`baustelle/setzen`, `datenbank`|`statistik`) schaltet eine Baustelle auf die HA-Statistik zurück.

**Zähler aus der HA-Statistik bereinigt (FE-0029, `logik/ruecksprung.py`):** Für alles, was aus der HA-Statistik kommt
(`baustelle/statistik`, `baustelle/auswertung`, `baustelle/abrechnung`, Bericht, CSV – alle über
`auswertung.async_statistik`), gilt je Stunde bzw. 5 Minuten: eine negative `change` (Zähler läuft nach einem Neustart
rückwärts) zählt 0. `day`/`week`/`month` sind dann die Summe der bereinigten Stunden (die Integration holt dafür die
Stundenwerte dazu). `mean` und `state` bleiben unverändert. Die eigene Datenbank rechnet aus den Minuten und kennt keine
Rücksprünge.

`baustelle/zaehler_korrigieren` (nur Admins; `entry_id`, `key`: `ohne`, `plus_kwh` 0,001–100000, `grund` 3–300 Zeichen)
trägt einen Zähler einmalig nach (z. B. „ohne Automatik“ nach der Datenbank-Panne 16.–19.10.2026) → der gespeicherte
Eintrag `{zeit, key, kwh, grund, von, sprung: {sensor: betrag}}`. `sprung` = um wie viel jeder Zähler-Sensor mit
Statistik dadurch springt (`energie_ohne_automatik` in kWh, `ersparnis` in €). Die Einträge stehen in der Einstellung
`korrekturen`; `async_statistik` zieht jeden Sprung vom Abschnitt ab, in dem er liegt (ist der kleiner, von den folgenden; nie
unter 0; liegt der Abschnitt außerhalb der Abfrage, nichts) – Zählerstand und Sensoren stimmen wieder, Diagramme und Summen zeigen keinen Sprung. Protokoll („Zähler „ohne“
um … kWh nachgetragen: …“) und Einstellung `aktion.zaehler_korrigieren` mit Benutzer. Unbekannter `key` →
`invalid_format`.

`baustelle/verlauf` (0.8.60; `start_time`, `end_time`, `entity_ids`, `entry_id`) antwortet wie
`history/history_during_period` mit `minimal_response` – `{entity_id: [{s, lu}]}`, erster Eintrag = Zustand zu Beginn –
aus der eigenen Datenbank: Leistungssensoren der Geräte aus jedem gespeicherten Messwert (`messwert`), Schalter ohne
Leistungsmessung aus den Minuten; andere Entitäten aus dem HA-Verlauf.

`baustelle/oeffnungen` (alle Benutzer; `entry_id`, `bereich`, `tag` ISO-Datum, Vorgabe heute) – Tür und Fenster offen
im Tagesdiagramm des Containers (Mockup `tuer-diagramm.html`, Variante A) → `{tag, laufend, oeffnungen: [{entity_id,
art: tuer|fenster, name, von: "HH:MM", bis: "HH:MM"|null, min}]}`, nach Beginn sortiert. Kontakte = alle Türen und
Fenster der Sensorliste des Containers (`logik/sensoren`), Verlauf aus dem HA-Verlauf (wie `baustelle/verlauf`), heute
ergänzt um den jetzigen Zustand. Regeln in `logik/oeffnungen.py`: Öffnungen unter 10 s fallen weg (Prellen); schon vor
Mitternacht offen → `von` "00:00"; `unavailable`/`unknown` beendet keine Öffnung (sie endet erst mit „zu“); `laufend`
(heute) und noch offen → `bis` null („offen seit“), an früheren Tagen über Mitternacht offen → `bis` "24:00"; `min`
abgeschlossen mindestens 1. Ohne Kontakte oder für künftige Tage leere Liste; unbekannter Bereich → `not_found`. Die
Seite fragt nur Container mit Tür- oder Fensterkontakt (heute 30 s, frühere Tage 1 h zwischengespeichert).

## 10. Container-Inventar (0.8.107, BSM-031.05, Bauplan Inventar)

Das Inventar liegt in der Datenbank über allen Baustellen (Aufbau 9). Ohne erreichbare Datenbank antworten beide Befehle
mit Fehler `nicht_bereit`. Namen, Labels und Nummern bildet die Integration (`logik/inventar.py`), die Seite zeigt sie nur.

**`baustelle/inventar`** (alle Benutzer) → `{container, ausruestung_frei, bereiche_ohne, firmen, arten, geraete,
naechste_nr, aendern}`

- `container[]`: `id`, `name` (`002_C_MAN`, `STRA-01_C_MAN`), `nr`, `art`, `art_label`, `eigen`, `firma_kuerzel`,
  `fremd_nr`, `status` (aktiv/ausgeschieden), `labels`, `einsatz` (aktueller: `baustelle_id`, `bereich_id`, `von`; sonst
  `null`), `geschichte` (alle Einsätze mit `von`/`bis`), `ausruestung[]` (`id`, `typ`, `typ_label`, `name`
  (`002-01_C_PLUG_MAN`), `gg`, `status`, `modell`, `geraet_id`, `seit`, `nicht_in_ha`), `nicht_in_ha` (Anzahl)
- Abgleich (0.8.120, BSM-034.04): beim Start jeder Baustelle, täglich 03:40 und nach Änderungen an Türkontakt oder
  Aussehen trägt die Integration nach, was HA einem Bereich mit Inventar-Container zuordnet (Shellys, Fühler, Türen,
  Fenster; Protokoll „Inventar nachgetragen: …“); was nur im Inventar steckt, markiert `nicht_in_ha` – es bleibt, bis
  jemand es mit `ausruestung_entfernen` herausnimmt. Plugs aus dem Inventar, die in keiner Baustelle Heizkörper sind,
  schaltet das Notprogramm ab (Skript von vor 0.8.115).
- `ausruestung_frei[]`: Ausrüstung ohne Container; `bereiche_ohne[]`: Container-Bereiche der Baustellen ohne
  Inventar-Container (`id`, `baustelle_id`, `name`); `firmen[]` mit `kuerzel`
- `arten`, `geraete`: die Kürzeltabelle mit deutschen Labels; `naechste_nr`: nächste Nummer für einen eigenen Container;
  `aendern`: darf der Benutzer ändern (Admin)

**`baustelle/inventar_aendern`** (nur Admins, sonst `unauthorized`), `aktion`:

| aktion | Felder | Ergebnis |
|---|---|---|
| `container_anlegen` | `entry_id`, `art`, optional `firma_kuerzel` (fremd), `bereich_id` (verknüpfen), `nr` (nur eigen, 0.8.112: feste Nummer für den Bestand – nur eine nie vergebene) | `{id, art, nr, firma_kuerzel, fremd_nr}` – Nummer sonst automatisch (eigen: ganze Datenbank, fremd: je Baustelle und Firma); mit `bereich_id` zusätzlich `ausruestung` [{id, typ, gg, neu}]: Shellys des Bereichs (GG nach Namen), Fühler und Tür kommen ins Inventar |
| `container_status` | `container_id`, `status` (aktiv/ausgeschieden) | `{ok}`; ausgeschieden beendet den Einsatz und löst den Bereich |
| `ausruestung_status` | `ausruestung_id`, `status` (aktiv/inaktiv/verliehen/defekt; `inaktiv` ab 0.8.116) | `{ok}`; steckt sie als Shelly in einer geladenen Baustelle, bekommt das Gerät denselben Status (ab 0.8.116 ein Feld, §11; 0.8.112–0.8.115: verliehen/defekt = inaktiv) |
| `firma_kuerzel` | `entry_id`, `firma_id`, `kuerzel` (2–5 Buchstaben) | `{ok}` |
| `ausruestung_zuordnen` (0.8.112) | `container_id`, `device_id` (HA-Gerät), optional `typ` (sonst erkannt), `haengt` bei Plugs (`konvektor`, `radiator`, `bautrockner`, `nichts`) | `{id, gg, neu, typ, verdrahtet}` – Ausrüstung per Kennung (MAC, sonst HA-Gerät; nur in der Datenbank), neuer Einsatz, GG bei PLUG/PUMP/BTR die nächste im Container. Steht der Container mit Bereich auf einer geladenen Baustelle, hängt die Integration das Gerät dort ein: Shelly als Unter-Eintrag (Rolle/Typ aus `haengt`, vorhandener wird angepasst), Fühler bzw. Tür am Bereich, wenn dort noch keiner steht (`verdrahtet` sagt, was geschah). Defekt, in einem anderen Container oder Shelly einer anderen aktiven Baustelle → `invalid_format`; schon in diesem Container → `neu: false` |
| `ausruestung_entfernen` (0.8.112) | `ausruestung_id` | `{ok}`; der laufende Einsatz endet, die Ausrüstung ist frei (in HA bleibt alles, wie es ist) |

Falsche Eingaben (Kürzel, Status, Nummer vergeben, fehlende Felder) → `invalid_format`, ohne die Datenbank zu berühren;
unbekannter Container, Ausrüstung oder Firma → `not_found` (ab 0.8.113, vorher `invalid_format`).

**`baustelle/inventar_kandidaten`** (alle Benutzer, 0.8.112) → `{geraete: [{device_id, name, modell, typ, ausruestung_id,
status, entity_id, verwendet}]}`: HA-Geräte, die als Ausrüstung taugen (Shelly mit Schalter → PLUG, Temperatur → TEMP,
Tür → DOOR, Fenster → FEN) und in keinem Container stecken; `ausruestung_id`/`status`, wenn schon als freie Ausrüstung
bekannt; `verwendet` = „Baustelle › Bereich“, wenn eine Baustelle das Gerät heute nutzt.

**`baustelle/inventar_vorschau`** (alle Benutzer, 0.8.108, BSM-031.06a), `container_id` → `{schritte, konflikte, zaehler,
hinweis}` – **ändert nichts**. Für einen Container mit Bereich auf einer geladenen Baustelle (sonst `not_found`):
je Schritt `gruppe` (Name des Geräts nach dem Schema), `ziel` (`geraet`, `entitaet_name`, `entitaet_id`, `plug`,
`unter_eintrag`, `label`), `ref`, `was`, `alt`, `neu`, `zustand` (`gleich`, `aendern`, `neu`, `konflikt`). GG der Plugs:
vorhandene aus dem Inventar, sonst fortlaufend nach Namen. Die Namen der BTHome-Kopplungen an den Plugs zieht die
Kopplungspflege (BSM-030) aus den HA-Gerätenamen selbst nach. Am Shelly-Gerät zählen nur Schalter, Leistung und
Energie, mit denen die Integration rechnet; eigene Entitäten der Integration und weitere Messwerte derselben Endung
bleiben, wie sie sind. Eigene Labels (Bauplan Inventar §5), die nicht mehr passen, stehen als Schritt mit `neu: null`.
Ab 0.8.112 dazu `verweise` [{art (Automation/Skript/Dashboard), name, alt, neu}]: eigene Automationen, Skripte und
Dashboards, die eine Entity-ID nennen, die sich ändern würde – HA passt sie nicht an (Bauplan §6.2).

**`baustelle/inventar_umbenennen`** (nur Admins, sonst `unauthorized`; 0.8.109, BSM-031.06b), `container_id` →
`{id, status, schritte, geaendert, nachgeholt}`. Bildet die Vorschau selbst neu (übernimmt nie die der Seite); bei einem Konflikt
Fehler `konflikt` (Nachricht nennt alt → neu) und **nichts** ändert sich, ohne Bereich `not_found`. Sonst in fester
Reihenfolge: Entitätsregister (Name und Entity-ID), HA-Gerät (`name_by_user`), Labels (fehlende anlegen, nur eigene
entfernen), dann die eigenen Verweise (Unter-Einträge: Schalter, Leistung, Energie, Fühler, Name des Heizkörpers;
Optionen; Einstellungen der Bereiche wie Tür und Symbol), zuletzt der Name im Plug selbst (`Sys.SetConfig`, 0.8.110,
BSM-031.06c; nur Shelly Gen2+ mit Adresse in der Shelly-Integration, sonst entfällt der Schritt; ist der Schalter
`unavailable`, gilt der Plug als nicht erreichbar). Die Steuerung der Baustelle hält dabei an und lädt danach einmal
neu (nur wenn sich in HA etwas ändert). Je Schritt `ergebnis`: `ok`, `gleich`, `fehler` (mit `fehler`) oder
`entfaellt` (Plug ohne Shelly Gen2+, BTHome – zieht die Kopplungspflege nach). `status`: `ausgefuehrt`, `teilweise`
(etwas fehlgeschlagen) oder `nichts` (schon alles nach Schema; dann kein Eintrag). **Nachholen:** Ist die jüngste
Umbenennung des Containers `teilweise`, führt derselbe Befehl nur die fehlenden Schritte aus und trägt sie dort ein
(`nachgeholt: true`, gleiche `id`, nachgeholte Schritte mit `nachgeholt`, der alte Wert bleibt für Rückgängig). Die
Integration holt Plug-Namen offener Umbenennungen auch selbst nach, alle 30 Minuten, sobald der Plug erreichbar ist
(nie Schritte in HA, kein Neu-Laden; Benutzer „automatisch“).

**`baustelle/inventar_rueckgaengig`** (0.8.111, BSM-031.06d), `container_id`, optional `vorschau` (Standard `false`).
Nimmt die **jüngste** Umbenennung des Containers zurück (Status `ausgefuehrt`, `teilweise` oder `zurueck_teilweise`,
sonst `not_found`). Mit `vorschau: true` (alle Benutzer) → `{id, schritte, konflikte}`: die Umkehr-Schritte (erledigte
Schritte mit vertauschtem alt/neu, umgekehrte Reihenfolge, `ref` = aktuelle Entity-ID, `nr` = Platz in der
Umbenennung), ändert nichts. Ohne (nur Admins, sonst `unauthorized`): ist eine alte Entity-ID inzwischen vergeben
(Registry oder Zustand), Fehler `konflikt` und nichts ändert sich; sonst wie beim Umbenennen (anhalten, in HA, eigene
Verweise, Plug-Name, einmal neu laden) → `{id, status, schritte}`. Ein HA-Gerät, das wieder seinen eigenen Namen trägt,
hat kein `name_by_user` mehr; ein Name, der vorher leer war, wird wieder leer. In der Umbenennung je Schritt `zurueck`
(Ergebnis) und ggf. `zurueck_fehler`; Status `zurueck` oder `zurueck_teilweise` (nochmal aufrufen holt den Rest nach).
Im Protokoll „Umbenennung zurückgenommen (NNN_C_ART): …“. `id` = Zeile in der Tabelle `umbenennung` (mit allen Schritten, für Nachholen und Rückgängig),
`geaendert` = welche eigenen Verweise angepasst wurden. Im Protokoll der Baustelle eine Zeile „Umbenannt nach Schema
(NNN_C_ART): …“.

## 11. Geräte (BSM-034.02, ab 0.8.116)

Eine Stelle für Änderungen an Geräten (`kern/geraete`, Bauplan Geräte §4). Nur Admins.

**`baustelle/geraet`** `{entry_id, geraet, aktion, …}` → `{ok, status, geaendert}`

| `aktion` | Felder | Wirkung |
|---|---|---|
| `status` | `status`: aktiv / inaktiv / verliehen / defekt | ein Feld je Gerät (`logik/geraete`): nur „aktiv“ schaltet die Automatik, zählt in der Staffelung und meldet Warnungen; beim Wechsel weg von aktiv einmal ausschalten und Handbetrieb beenden. Protokoll „<Name>: verliehen – die Automatik lässt es aus“, Einstellung in der Datenbank (`geraet.status`); steckt das Gerät als Ausrüstung im Inventar, bekommt sie denselben Status. Umgekehrt setzt `inventar_aendern` `ausruestung_status` das Gerät (§10) |

| `speichern` (0.8.117) | `schritte`: Liste aus `{aktion: anlegen, bereich, schalter, name, rolle, typ, leistung?, energie?}`, `{aktion: aendern, geraet, …nur geänderte Felder}`, `{aktion: entfernen, geraet}`; `leistung`/`energie` leer oder `null` = automatisch | Erst alle Schritte prüfen (`logik/geraete.pruefen`: Schalter, nur eine aktive Baustelle und ein Gerät, Bereich vorhanden, Pumpe ⇔ Pumpenschacht, Name) – spätere Schritte sehen die früheren; ein Fehler → nichts geändert, Fehlercode = Schlüssel (`schalter_vergeben`, `rolle_passt_nicht`, …), Meldung deutsch. Dann am Stück: Inventar (Entfernen beendet den Einsatz der Ausrüstung; Anlegen oder Verschieben in einen Bereich mit Container beginnt dort einen als PLUG, ein Einsatz in einem anderen Container endet), Unter-Einträge, Protokoll („… angelegt in …“, „… nach … verschoben“, „… entfernt – Werte bleiben im Verlauf“); danach einmal neu geladen, die Antwort `{ok, neu: [ids]}` kommt erst danach |

Unbekannte Baustelle oder Gerät → `not_found`; falscher Status → `invalid_format`. Lädt die Baustelle gerade neu, wartet
der Befehl bis zu 15 s. Das Zuordnen im Inventar (§10) prüft nach denselben Regeln.

**Sensoren je Container (0.8.118, BSM-034.03):** Die Liste `bereiche[].sensoren` (logik/sensoren) gilt überall: Jede
Tür und jedes Fenster (offen oder gekippt) pausiert wie früher der Türkontakt, maßgeblich ist der am längsten offene;
`laufzeit.container.<id>.tuer` = `{offen, seit}` über alle Kontakte (null ohne Kontakt). Alle Sensoren werden beobachtet,
als fehlend gemeldet (Reparatur-Hinweis), stehen in `geraete_links`, im Mitschreiben (`tuer_offen_s` = irgendein Kontakt
offen; Ereignis `tuer` mit `sensor`) und im Inventar (Bestand, Vorschau; Zuordnen eines Tür- oder Fensterkontakts trägt ihn
ins Aussehen ein). Batterie-Stufe `logik/sensoren.batterie_stufe` (Grenzen `BATTERIE_SCHWACH` 25 %, `BATTERIE_KRITISCH`
10 %, je genau einmal): `sensoren[].batterie_stufe` für die Anzeige; bei „kritisch“ Warnung `fuehler_fehlt` je Sensor
(„Tür 1: Batterie schwach, 5 %“, Schlüssel `fuehler_fehlt:<bereich>:<entity_id>`), „schwach“ zeigt nur die Seite.

## 12. Gespart, Rangliste, Trocknen, Urlaubskalender (29.10.2026, FE-0035, AN-0017, AN-0021, AN-0022)

- **€ aus kWh je Tag (FE-0035):** „gespart“ und „ohne (24/7)“ rechnen je Periode mit dem Preis der Periode
  (`logik/auswertung.geld_je`, `perioden_preise`; Jahr: aus den Tagen zu Monaten, `gespart_zusammen`), die Summen sind die
  Summe der Perioden. `summen.ohne_automatik` kommt aus `gespart_reihen` (`ohne_eur` = Σ Linie „ohne“, bei Σohne < Σmit
  also = „mit“). „alle laufenden“: je Baustelle mit ihren Preisen, dann addiert. Verlauf: `gespart` = dieselbe Rechnung
  über die Tage seit Beginn bis heute (nicht mehr der Sensor `ersparnis`), `gespart_text` „gespart seit TT.MM.“.
  `baustelle/ohne` rechnet `ergebnis` ebenso (Jahr: Mittel der Tagespreise ab Beginn). Sensor `ersparnis` bucht jede
  Änderung der gesparten kWh zum Preis des Tages (Zähler `ersparnis_kwh`/`ersparnis_eur`, `logik/zaehlen.ersparnis_buchen`);
  beim Umstellen Startwert = bisheriger Wert (kein Sprung in der Statistik).
- **Rangliste (AN-0017):** `laufzeit.staffel.rangliste` (oben). Getauscht wird weiter nur, wer heizen will.
- **Kleidung trocknen (AN-0021):** Einstellung `heizung.trocknen_stufen` = `[{ab_mm, laenger_min, frueher_min}]` (1–5,
  `null` = aus `trocknen_ab_mm`/`_laenger_min`/`_frueher_min`: unverändert 2/45/15 → Vorgabe 2 mm 60/15 und 5 mm 100/30,
  sonst eigene Werte als Stufe 1). Regen in der Arbeitszeit: Regensensor (Stand bei Arbeitsbeginn/-ende,
  `wetter_tage[].regen_mess_a/_b`), sonst die Stunden der Vorhersage in der Arbeitszeit, sonst die Tagessumme; je Tag
  `wetter_tage[].regen_az`.
- **Urlaubskalender (AN-0022):** Die Seite bietet für Urlaub nur Kalender mit `supported_features` & 1 (CREATE_EVENT) an;
  ohne einen zeigt sie den Hinweis auf „Lokaler Kalender“.
