# Runde 2 – Einschätzung Claude

## Stimme zu
- Zielmodell je Container und Tag: E_mit = min(P·D, H·GDH_aktiv + H_frost·GDH_frost [+ Start]),
  E_ohne = min(P·D, H·(T_eff,max − außen)·D); D = echte Tagesdauer (23/24/25 h).
- Minutenklassifikation zentral in `logik/` mit vier Betriebsarten; unbekannte Gründe nie „regulär“.
- H aus stationären Fenstern (≥ 60 min, Ölradiator ≥ 90 min, ΔT ≥ 5 K, innen ±0,5 K/h), robust (Median/MAD);
  Tagesregression nur als Rückfall.
- 9 Szenarien (Witterung ±1,5 K × H 0,65/1,0/1,35; ohne mit T_eff 22/26/30 gekoppelt), Spanne der Einsparung aus den
  Differenzen je Lauf, Mittelwert = S5, negative Einsparung erlaubt.
- Lieferungen P0–P8, P4/P5 im Schattenbetrieb, P6 rücknehmbar.
- Die 39 MWh sind bei Thermostat auf Max. möglich, aber nicht belegt – Kennzeichnung (P0) bleibt richtig.

## Antworten auf ChatGPTs Rückfragen (aus dem Code)
- `grund` = `SollGrund` (`logik/regelung.py`): automatik_aus, frost, tuer_offen, hand, boost, taste, bedarf, bereit,
  frei, heizgrenze, fruehstart, vorheizen, arbeitszeit, nachheizen, trocknen, ausserhalb, aus, absenken, baseline.
- `zustand` = Anzeige-Zustand (`funktionen/heizung/anzeige.py`): heizt, aus, bereit, … (offline).
- Stationäre Fenster: lassen sich erst mit P1–P3 zählen (Diagnose) – genau dafür ist P3 da.
- Fühlerplatzierung: Herbert.

## Vorschlag
Keine weitere Runde vor dem Bau nötig: P0 jetzt, dann P1–P3 als Diagnose (zeigt, ob H schon schätzbar ist). Runde 3
mit ChatGPT erst mit echten Diagnosezahlen (Anzahl stationärer Fenster, H je Container, Streuung) – dann Spezifikation
für P4–P7 festziehen.
