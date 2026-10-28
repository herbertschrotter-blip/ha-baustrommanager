# Bauplan Geräte zusammenführen

Geräte (Shellys, Heizkörper, Pumpen, Bautrockner, Fühler, Türen, Fenster, Licht) und ihre Einstellungen und Zustände
liegen heute an sieben Stellen und werden über verschiedene Wege geändert; das Inventar ist nur in einer Richtung
angebunden. Ziel: **jede Eigenschaft hat genau einen Besitzer**, jede Ansicht ändert sie über dieselbe Funktion der
Integration, ein Abgleich hält Inventar, HA und Einstellungen beieinander.

Stand: .01 fertig (0.8.115), .02 fertig (0.8.116/0.8.117), .03 fertig (0.8.118/0.8.119), .04 fertig (0.8.120), .05 fertig (0.8.122, 10.10.2026) – Etappe K komplett; Plan vom 09.10.2026 (Sitzung „ha-baustelle Teil 6“, Herbert: „kochen die alle ihr eigenes Süppchen?“), Befund
aus zwei Durchsichten (Integration, Seite) auf 0.8.114. Aufgabe BSM-034, Unteraufgaben .01–.05 = Stufen in §5.

## 1. Befund – wo Geräte gespeichert sind

| Ablage | Inhalt | geschrieben von |
|---|---|---|
| Unter-Einträge in HA (`bereich`, `geraet`) | Shelly im Container, Rolle, Typ, Leistung/Energie, Fühler, Name (doppelt: Titel und `data.name`) | Container anlegen, Bearbeiten, ✎ Gerät (HA-Dialoge direkt), Inventar › Zuordnen (`_verdrahten`), Umbenennen |
| Einstellungen je Container (`e.bereiche[bid]`) | `tuer`, `symbol` (Tür 1–2, Fenster 1–4, Licht mit Sensoren), Anschluss, Modus, Zusatz, Primärheizkörper (`primaer`, AN-0015), Größe … | `baustelle/setzen` (Bearbeiten teils sofort, teils bei Speichern), Aussehen, Inventar (Tür) |
| Einstellungen je Gerät (`e.geraete[gid]`) | `aktiv`, `zusatz` (nur Rückfall ohne `primaer`), `nenn_kw` | Container-Chip (`aktion aktiv`), ✎ Gerät, Inventar-Status (nur Inventar → hier) |
| Laufzeit, Zähler | Handbetrieb, Zählerstände, Warnungen je gid/bid | Steuerung, Notprogramm |
| Datenbank-Spiegel (`geraet`, `bereich`) | Kopie für Excel/Auswertung (aufgelöste Sensoren, gerechnete Nennleistung; ohne aktiv/zusatz/Symbol-Sensoren; `geraet.ausruestung_id` nie geschrieben) | `spiegeln` nur beim Start, nach `setzen`/`liste` |
| Inventar (Datenbank) | Container, Ausrüstung mit Kennung, Status, GG, Einsätze, Umbenennungen | nur das Inventar |
| Notprogramm (Speicher, Plug) | Skript, Programm, BTHome-Kopplungen (nur Fühler und Tür) | Notprogramm-Runde |

Schlüssel: Unter-Eintrag-ID (gid/bid) für fast alles; Entity-ID in Unter-Einträgen und Einstellungen; HA-Gerät und
Kennung (`mac:…`, `bluetooth:…`, `ha:…`) nur im Inventar; Bluetooth-Adresse im Notprogramm in anderem Format.

## 2. Befund – wo Geräte auf der Seite vorkommen

Übersicht (Punkte, „X von Y an“, Stromverteilung, Kachel „Geräte erreichbar & Signal“) · Container (Chips: ⏻ Hand,
aktiv, ✎; Tür; Leistungskurve) · Pumpenschacht (Pumpen schalten, ohne aktiv/Automatik übernehmen) · Heizung (Plan je
Heizkörper) · Einstellungen › Container & Geräte, › Geräte (nach Funktion, Batterie/Signal), › Notprogramm (Plugs), ›
📦 Inventar, › Pumpen, › Strom · Dialoge Container anlegen, Bearbeiten, ✎ Gerät, Aussehen, Anschluss, Firma, Inventar
(Container, Zuordnen, Vorschau) · Auswertung je Gerät.

## 3. Lücken

**Doppelt änderbar**
- aktiv/inaktiv an drei Stellen (Chip sofort, ✎ bei Speichern, Inventar-Status); Abgleich nur Inventar → Steuerung –
  ein Gerät kann im Inventar „defekt“ und im Container „aktiv“ sein.
- Fühler an vier, Tür an drei Stellen; Tür 2, Fenster, Licht nur im Symbol: keine Türpause, nicht in › Geräte, kein
  Reparatur-Hinweis, nicht im Inventar/Notprogramm/Mitschreiben.
- Shelly zuordnen über vier Wege; das Inventar prüft weniger als der HA-Dialog (Rolle/Art, fremde Baustelle nur
  geladene).
- Drei Wortlisten für Gerätetypen (Ölradiator/Konvektor …, „Was hängt dran?“, PLUG/HZ/TEMP …).
- Anschluss und Firma je zweimal (Bearbeiten und eigener Dialog); fünf Geräte- bzw. Containerlisten.

**Nur in eine Richtung**
- Shelly über Bearbeiten löschen/hinzufügen → Inventar merkt nichts (Einsatz bleibt offen, Gerät „belegt“).
- Inventar › ✕ beendet nur den Inventar-Einsatz; der Shelly regelt im Container weiter.
- Seite lädt nach Inventar-Änderungen nicht neu.

**Fehler (Stufe 1)**
1. Entfernter oder auf „Steckdose“ umgestellter Plug behält das Notprogramm-Skript (`notprogramm.plugs()` kennt nur
   aktuelle Heizkörper) – kann mit altem Programm in Notbetrieb gehen.
2. Container ausscheiden beendet die Einsätze seiner Ausrüstung nicht – sie ist nie mehr zuordenbar.
3. Bearbeiten › Speichern schreibt automatisch gefundene Leistungs-/Energiesensoren fest (`bereichSpeichern` mit
   `g.leistung` statt `leistungEigen`).
4. ✎ an einer Pumpe: Typliste ohne „Pumpe“, Containerliste ohne Schächte – angezeigt wird etwas anderes, als
   gespeichert würde.
5. ~~Bestand übernehmen speichert Pumpen und Bautrockner als PLUG (`async_bestand`).~~ Kein Fehler (Herbert
   09.10.2026): PLUG ist der Shelly selbst, wie beim Zuordnen; was dranhängt, steht in der Rolle (Name `…_C_BTR_…`),
   Pumpenschächte kommen nicht ins Inventar.
6. Reste gelöschter Geräte/Container bleiben (`e.geraete`, Handbetrieb, Zähler, Stumm-Schlüssel, Reparatur-Hinweise
   `ohne_leistung_*` gelöschter Baustellen).
7. Bearbeiten und ✎ mischen „sofort gespeichert“ und „bei Speichern“ – Abbrechen nimmt nur einen Teil zurück.

## 4. Grundsätze

| Eigenschaft | einziger Besitzer | geändert nur über |
|---|---|---|
| Welcher Shelly in welchem Container, Rolle, Typ, Name | Unter-Eintrag `geraet` | `kern/geraete` (Stufe 2) – Dialoge der Seite rufen sie über WebSocket |
| Fühler, Türen, Fenster, Licht eines Containers | eine Sensorliste je Container (Stufe 3) | `kern/geraete` |
| Status aktiv / inaktiv / verliehen / defekt | ein Feld je Gerät, mit dem Inventar in beide Richtungen abgeglichen | `kern/geraete` |
| Kennung, Nummer, Geschichte | Inventar (Datenbank) | Inventar; Einsätze zieht der Abgleich nach |
| Anzeige-Zustand (an, kW, erreichbar, Batterie, Signal) | gerechnet von der Integration (`baustelle/struktur`) | – |

Fachregeln (welche Rolle in welche Art, was ein Status bewirkt, was der Abgleich als Abweichung meldet) in `logik/`
mit Test; die Seite rechnet nichts. Jede Änderung schreibt Protokoll und Datenbank-Spiegel mit.

## 5. Stufen (je eigene Lieferung, einzeln einspielbar)

| ☐ | Stufe | Inhalt | Herbert sieht |
|---|---|---|---|
| ☑ | .01 Sofort-Fehler | Fehler 1–7 aus §3, Seite lädt nach Inventar-Änderungen neu – **0.8.115** (Fehler 5 entfällt) | kaum – sicherer |
| ☑ | .02 Baustein `kern/geraete` – Lieferung 1 Status **0.8.116**, Lieferung 2 Anlegen/Ändern/Verschieben/Entfernen **0.8.117** | Zuordnen, Entfernen, Verschieben, Rolle/Typ, Status über eine Stelle (Prüfregeln wie der HA-Dialog); Status als ein Feld, Abgleich mit Inventar in beide Richtungen; Bearbeiten, ✎, Chip und Inventar rufen dieselben Befehle | ein Status statt drei Schalter |
| ☑ | .03 Sensoren vereinheitlichen – Lieferung 1 **0.8.118** (Integration, Seite, Inventar, Batterie), Lieferung 2 Notprogramm **0.8.119** | je Container eine Sensorliste (Fühler, Türen, Fenster, Licht); jede Tür pausiert, alle in › Geräte, Reparatur-Hinweisen, Mitschreiben, Inventar, Notprogramm | Tür 2/Fenster wirken |
| ☑ | .04 Abgleich – **0.8.120** (nachtragen, „nicht in HA“ anzeigen, verwaiste Plugs abschalten) | beim Start, täglich und nach jeder Änderung: Inventar ↔ HA, offene Einsätze, Reste gelöschter Geräte, Notprogramm abschalten; Abweichungen im Inventar („2 Geräte ohne Inventar“) | Hinweis im Inventar |
| ☑ | .05 Seite zusammenführen – **0.8.122** (Mockup `geraete.html` Variante 1) | **erst Mockup**: Gruppe „Geräte“ mit Reitern Übersicht/Inventar, ein Gerätedialog statt drei (überall gleich sofort oder überall erst bei Speichern), einheitliche Symbole und Zähler, Gerätewarnungen sichtbar, Batterie/Signal im Container | neue Ansicht |

## 6. Entscheidungen (Herbert, 09.10.2026)

| Frage | Entscheidung |
|---|---|
| Status eines Geräts | **ein Feld** aktiv / inaktiv / verliehen / defekt an einer Stelle; Container-Chip, ✎ und Inventar zeigen und ändern dasselbe (.02) |
| Wann speichern Geräte- und Container-Dialog | **alles erst bei „Speichern“**, Abbrechen nimmt alles zurück; sofort wirken nur die Schalter direkt im Container (⏻, aktiv) (.01 für die heutigen Dialoge, .05) |
| Fenster | **pausieren wie Türen** – offen oder gekippt nach derselben Regel (.03) |
| HA-Dialoge (Geräte & Dienste › Baustelle) | **bleiben**; der Abgleich (.04) zieht Änderungen von dort ins Inventar nach |
| .02 in wie vielen Lieferungen | **zwei**: 1) Status, 2) Zuordnen/Entfernen/Verschieben/Rolle über `kern/geraete` |
| Status auf der Seite bis .05 | ✎ Gerät mit vier Knöpfen; Container-Chip schaltet schnell aktiv↔inaktiv, zeigt verliehen/defekt (Tippen → ✎); Inventar-Knopf mit allen vier |
| „inaktiv“ im Inventar | **vier Werte überall** – das Inventar kennt auch „inaktiv“ |
| Ablage der Sensorliste (.03) | **keine neue Ablage**: aus Fühler, Türkontakt (= Tür 1) und Aussehen gebildet (`logik/sensoren`) |
| Batterie (.03) | **für alle Sensoren** eine Warnung bei schwacher Batterie |
| .03 in wie vielen Lieferungen | **zwei**: 1) Integration, Seite, Inventar, Batterie; 2) Notprogramm mit mehreren Türen/Fenstern |
| Abgleich HA → Inventar (.04, 10.10.2026) | **selbst nachtragen** (HA gilt), mit Protokoll |
| Abgleich Inventar → HA (.04) | **nur anzeigen** („nicht in HA“), entfernen nur von Hand |
| Seite „Geräte“ (.05, 10.10.2026) | **Mockup `mockups/geraete.html` Variante 1**: Einstellungen › 🔌 Geräte mit Reitern Übersicht/Inventar (ersetzt › Geräte und › 📦 Inventar), eine Liste, ein Gerätedialog, Sensor-Leiste im Container |

## 7. Tests

- `tests/logik/`: Regeln für Rolle/Art, Status-Wirkung, Abgleich (Abweichungen), Sensorliste.
- Integration (SQLite, PostgreSQL wo Datenbank betroffen): jeder Weg (Bearbeiten, ✎, Chip, Inventar) ändert alle
  Ablagen gleich; Löschen beendet Einsatz, räumt Reste, schaltet Notprogramm ab; Ausscheiden gibt Ausrüstung frei.
- Panel/Browser: Dialoge nach Mockup (.05), Neuladen nach Inventar-Änderung.
