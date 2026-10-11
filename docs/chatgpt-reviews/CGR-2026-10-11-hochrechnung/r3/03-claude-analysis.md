# Runde 3 – Einschätzung Claude

## Gesamturteil

Die Spezifikation ist vollständig und 1:1 umsetzbar: Klassifikation jedes `grund`-Werts, Masken R/F statt Stromminuten,
GDH mit gespeichertem Soll, Frostziel 6 °C ohne 5-%-Aufschlag, Fenster 120/180 min mit Vorlauf, H als gewichteter
Median je Tag → Median über Tage, Rückfall Tagesregression durch den Ursprung, Prognose minutenbasiert und additiv,
neun gepaarte Szenarien, Stufen A–D getrennt für H und Prognose, 30 Testfälle mit Zahlen. Die Testzahlen habe ich
stichprobenhaft nachgerechnet (GDH_frost 192, MAD-Band, gleitendes Soll 21,35 °C, neun Szenarien 6,8/10/13,8) – sie
stimmen.

Übernehmen ohne Änderung: §1 Klassifikation, §2.2 Masken, §3.3 Schätzer, §4.2–4.5, §5, §6, Liefergrenzen §7.

## Antworten auf die Adapter-Rückfragen (am Code geprüft)

| Frage | Befund im Repo |
|---|---|
| Historische Konfiguration | **Ja.** `einstellung` ist versioniert (`ab`), ebenso `arbeitszeit` (`ab`), `ausnahme` je Datum, Geräte über `container_einsatz`/`ausruestung_einsatz` (`von`). Modus, Frostpolitik, frei_modus lassen sich je Minute rekonstruieren. |
| Alter der Messwerte | **Nein.** `bereich_minute.temperatur` und `geraet_minute` speichern kein Alter des Ursprungswerts. |
| Staffelungsbegrenzung | **Nein.** Wird nicht je Minute gespeichert. |

## Kritik

1. **Frische streng ausgelegt = kein H aus der bisherigen Saison.** Nach §2.3/§3.2 sperrt `frische_unbekannt`
   stationäre Fenster. Da das Alter nie gespeichert wurde, gäbe es aus den vorhandenen 10 Tagen kein einziges Fenster;
   Stufe C frühestens Wochen nach P1. Vorschlag: ab P1 Alter (`temp_alter_s`) und Staffelung je Minute speichern;
   für Altdaten einen Ersatznachweis zulassen – Temperatur ändert sich innerhalb des Fensters (kein eingefrorener
   Wert über > 30 min), Plug `erreichbar` und Energie lückenlos – mit Kennzeichen `frische_ersatz`, höchstens Stufe C.
2. **Strenge Fensterkriterien im Pilot.** 100 % Abdeckung, drei Zyklen je Heizkörper, Spanne ≤ 0,6 K: mit 5
   Heizkörpern in mehreren Containern wird die Ausbeute klein sein. Das ist ehrlich, aber man muss es sehen: P3 zuerst
   als Diagnose (Fenster je Container + Verwerfungsgründe), bevor über Schwellen geredet wird.
3. **Umfang.** P1–P4 sind vier Lieferungen mit DB-Lesern, neuer Logik und Schattenausgabe; realistisch mehrere
   Sitzungen. P0 (Kennzeichnung) kommt vorher, unabhängig davon.

## Vorschlag Reihenfolge

P0 Kennzeichnung → P1 Klassifikation + neue Minutenspalten (Alter, Staffelung) → P2 Tagesmerkmale mit Diagnose →
P3 Fenster/H mit Diagnose (Zahlen an ChatGPT, wie gewünscht) → P4 Schattenprognose.
