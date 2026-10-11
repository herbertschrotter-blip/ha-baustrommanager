# Runde 5 – Einschätzung Claude

## Gesamturteil

Die Bauvorlage führt die Runden 2–4 widerspruchsfrei zusammen: Modulschnitt (10 neue Dateien `prognose_*.py`,
`minute.py` erweitert), vollständige Typverträge, eine Regelklasse `PrognoseRegeln` als einziger Ort aller Schwellen,
Adapter-Vertrag je Lieferung, genau vier neue Spalten, Baseline-Metadaten im bestehenden JSON, Anzeige-Texte je Stufe,
Testplan je Datei mit beiden Zahlenkatalogen und eine Tabelle der aufgelösten Widersprüche. ChatGPT sieht keine offene
Bauentscheidung mehr. Ich auch nicht.

## Am Code geprüft (alles zutreffend)

- `db/mitschreiben.py:179` `_abschliessen()` schreibt Grund/Soll/Zustand aus dem End-Snapshot der Minute → Wechsel
  innerhalb der Minute gehen verloren; Lösung über den vorhandenen `ereignis`-Pfad (`art="prognose_kontext"`) passt
  (Tabelle `ereignis` mit `art`/`wert` JSON vorhanden).
- `funktionen/heizung/plan.py:158` `zu_warm()` liegt im Adapter → wird nach `logik/regelung.py` herausgezogen.
- Fühler werden über `async_track_state_change_event` beobachtet (`steuerung.py:237`, `db/mitschreiben.py`) – das
  sieht gleiche Werte nicht; für `temp_alter_s` braucht es den gefilterten Berichtspfad.
- `logik/baseline.Lauf` hat `als_dict()`; die fünf Metadatenfelder lassen sich additiv anhängen.

## Einwände für den Bau (keine Rückfrage an ChatGPT nötig)

1. **Umfang gegen Pilot:** rund 40 Typen und 10 Module für fünf Heizkörper. Ich baue strikt je Lieferung und lege nur
   die Typen an, die die jeweilige Lieferung braucht; der Vertrag aus §2 bleibt Zielbild. Feldnamen passe ich an
   bestehende Namen im Repo an, wo sie schon existieren (z. B. `Arbeitszeit`, `WetterTag`).
2. **P1 berührt den Kernpfad** (`kern/staffelung.py`, neuer Berichtspfad für Fühler, Schemaänderung). Nur Beobachtung,
   keine Regeländerung; Einspielen erst nach grünen Checks einschließlich `integration-pg`, Neustart nur durch Herbert.
3. **P0** (Kennzeichnung) bleibt die erste Lieferung – sie ist unabhängig und schnell.
