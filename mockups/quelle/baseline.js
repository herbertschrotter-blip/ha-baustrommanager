// Vorschlag „Baseline-Läufe anzeigen“ (BSM-033.04 Teil b / J4b, Bauplan Hochrechnung §6) auf Basis des Master-Mockups.
// Ticket FE-0033, Herbert 28.10.2026: „Wird berücksichtigt, dass sich das Heizkörperthermostat von selbst abschaltet? Das
// könnte man doch simulieren und anpassen mit Testläufen am Wochenende wie schon mal besprochen“ – genau das sind die
// Baseline-Läufe (J4a, gebaut 0.8.127, aus): an freien Tagen hängen alle Heizkörper eines Containers ohne Automatik am Strom,
// ihr eigener Thermostat regelt; daraus entsteht die Signatur „ohne Automatik“ und ersetzt die Schätzung 24/7.
// Baut mockups/baseline.html: node mockups/quelle/baseline.js   ·   Bilder: node mockups/quelle/baseline.js --bilder <ordner>
//
// Ort: abgenommen ist seit 11.10.2026 (hochrechnung-j4b.html) ein Reiter „Baseline“ in der Karte Heizperiode; gebaut wurde er
// noch nicht (0.8.125 hat nur Hochrechnung · Signatur · Klima). Darauf baut der Vorschlag auf:
//   A  alles in Auswertung › Heizperiode › Reiter „Baseline“ (Schalter, Kostenrahmen, nächster Lauf, Stand je Container,
//      Läufe). Begründung: die Läufe sind eine Messung für die Hochrechnung, Kosten und Ergebnis stehen neben dem, was sie
//      verbessern; der Hinweis im Diagramm führt mit „Baseline ›“ direkt hin. Empfehlung.
//   B  Einstellen in Heizung › Regeln (eigene Karte „🧪 Baseline messen“: Schalter, Kostenrahmen − 60 € +, nächster Lauf mit
//      Absagen) – im Reiter „Baseline“ der Heizperiode dann nur Stand je Container und Läufe (mit „einstellen ›“).
//      Für: Schalter und Rahmen stehen bei den anderen Heizregeln. Gegen: dieselbe Sache an zwei Orten.
// Beide: Hinweis unter der Legende der Hochrechnung, solange „ohne“ geschätzt ist („Schätzung 24/7 – wird durch
// Baseline-Läufe ersetzt“, dazu der Stand); im Container-Kopf während eines Laufs unter Jetzt der Chip
// „🧪 Baseline-Lauf bis So 24:00 · Thermostat regelt“ statt „heizt“ (Antippen: ein Satz, bisher kWh/€, „Lauf abbrechen“).
//
// DATEN – die Seite rechnet nichts (Beispielwerte unten in LAGEN, so wie die Integration sie liefern soll).
// Schon da (baustelle/auswertung › hochrechnung, logik/auswertung.hochrechnung_signatur):
//   baseline.an (bool) · baseline.laeufe (letzte 12, Lauf.als_dict: id, bereich, von, bis (Tag danach, ausschließlich),
//     status geplant|laeuft|fertig|abgebrochen|abgesagt, schaetzung_eur, kosten_eur (erst nach dem Ende, stündlich
//     nachgetragen), grund, ende (Tag des Abbruchs), thermostat_unveraendert ('angenommen' ab Start), thermostatstellung,
//     annahme_am, konfiguration_id, p_ref_belege)
//   ohne_methode ('baseline' | 'schaetzung') · ohne_hinweis ('grobe Obergrenze, nicht belastbar' bzw. null)
//   Einstellungen heizung.baseline (aus) und heizung.baseline_eur_monat (60) – baustelle/setzen erlaubt beide (panel.py)
//   laufzeit.container.<id>: zustand 'heizt', grund 'baseline', text 'Baseline-Messung · Thermostat am Gerät regelt' (anzeige.py)
// Fehlt (Vorschlag, Name in baustelle/auswertung › hochrechnung.baseline):
//   rahmen: { monat: '2026-10', budget_eur: 60, gemessen_eur, geplant_eur, rest_eur }   // logik/baseline.monat_rest gibt
//     es, die Seite bekommt es nicht; gemessen = kosten_eur der Läufe des Monats, geplant = schaetzung_eur offener Läufe
//   je Lauf zusätzlich: letzter (letzter Tag, inklusive – heute nur bis−1), tage (Anzahl), zaehlt (zählende Tage nach
//     logik/baseline.zaehlende_tage – auch beim Abbruch: Tage vor `ende`), kwh (gemessen), bisher_kwh/bisher_eur (läuft:
//     bis jetzt, heute erst nach dem Ende), angekuendigt (Zeitpunkt der Nachricht), abbruch_um ('2026-11-15T09:12'),
//     name, typ (oelradiator|konvektor|gemischt)
//   vorschau: { von, letzter, bereich, schaetzung_eur, plant_am: '2026-10-30T12:00' } | null   // nächster freier Block und
//     Container nach logik/baseline.planen, solange noch nichts geplant ist (heute plant die Integration erst um 12:00 am Vortag)
//   container: [{ bereich, typ, tage (zählende Baseline-Tage), noetig (signatur.MIN_TAGE = 10), stand ('lernt'|'gut'|'brauchbar'|
//     'unsicher'|null), fertig (stand gut), kein_lauf ('ohne Heizkörper' | 'Modus aus' | 'ohne Automatik' | null), uebernimmt
//     (Verhältnis von <bereich>, wenn ohne eigene Messung) }]   // hochrechnung.ohne.container (stand, tage) gibt es in
//     funktionen/heizung/hochrechnung.ergebnis, aber hochrechnung_signatur reicht `ohne` nicht an die Seite weiter;
//     typ/kein_lauf stecken in baseline.kandidaten
//   hinweis: Text für die Legende („Schätzung 24/7 – wird durch Baseline-Läufe ersetzt“) und stand_t („1 von 4 Containern
//     gemessen · nächster Lauf Sa 31.10.“) – oder die Seite setzt den Satz aus container/vorschau zusammen (nur Text)
//   laufzeit.container.<id>.baseline: { bis: '2026-11-02T00:00', bis_t: 'So 24:00', lauf_id, bisher_kwh, bisher_eur } im Lauf
//   Aktion: baustelle/aktion `baseline_absagen` { lauf_id } (heute nur der Nachrichtenknopf, nachrichten.py)
const rahmen = require('./rahmen');

/* Läuft nur im Browser (als Text eingesetzt, Node führt es nie aus) */
function browser(R) {
  const { html, nothing } = R;
  const G = window.BL = { v: 'a', lage: 'angekuendigt', reiter: false, alle: false, info: null, rahmen: 60 };
  const de = (x, n = 0) => Number(x).toLocaleString('de-AT', { minimumFractionDigits: n, maximumFractionDigits: n });
  const eur = (x, n = 2) => `${de(x, n)} €`;
  const WT = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];
  const tagT = s => { const d = new Date(s + 'T12:00:00'); return `${WT[d.getDay()]} ${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.`; };
  const zeitT = s => `${tagT(s.slice(0, 10))} ${s.slice(11, 16)}`;
  const TYP = { oelradiator: 'Ölradiator', konvektor: 'Konvektor', gemischt: 'gemischt', '': 'ohne Heizkörper' };
  const NAMEN = { polier: '001_C_POL', sanitaer: '002_C_SAN', mannschaft: '003_C_MAN', besprechung: '004_C_BES', magazin: '005_C_MAG', lager: '006_C_LAG' };
  const LAUF_BID = 'mannschaft';

  /* ---------- Beispieldaten je Lage: so soll die Integration baseline liefern (siehe Kopf) ---------- */
  const L = (id, bereich, von, letzter, status, x = {}) => ({ id, bereich, name: NAMEN[bereich], von, letzter, status, tage: letzter === von ? 1 : 2, zaehlt: 0, kwh: null,
    schaetzung_eur: 9.2, kosten_eur: null, grund: null, abbruch_um: null, thermostat_unveraendert: status === 'geplant' ? 'unbekannt' : 'angenommen', ...x });
  const C0 = [
    { bereich: 'polier', typ: 'oelradiator', tage: 0, noetig: 10, stand: null, fertig: false, kein_lauf: null },
    { bereich: 'sanitaer', typ: 'konvektor', tage: 0, noetig: 10, stand: null, fertig: false, kein_lauf: null },
    { bereich: 'mannschaft', typ: 'konvektor', tage: 0, noetig: 10, stand: null, fertig: false, kein_lauf: null },
    { bereich: 'besprechung', typ: 'gemischt', tage: 0, noetig: 10, stand: null, fertig: false, kein_lauf: null },
    { bereich: 'magazin', typ: '', tage: 0, noetig: 10, stand: null, fertig: false, kein_lauf: 'ohne Heizkörper' },
    { bereich: 'lager', typ: '', tage: 0, noetig: 10, stand: null, fertig: false, kein_lauf: 'ohne Heizkörper' }];
  const R1 = L('r1', 'mannschaft', '2026-10-31', '2026-11-01', 'geplant', { angekuendigt: '2026-10-30T12:00' });
  const MEHR = [   // neueste zuerst; abwechselnd Ölradiator (nur 001_C_POL) und Konvektor (002/003, der mit weniger Tagen)
    L('r12', 'mannschaft', '2027-01-16', '2027-01-17', 'abgebrochen', { zaehlt: 1, kwh: 23.4, kosten_eur: 4.68, grund: 'Bedarf', abbruch_um: '2027-01-17T07:40' }),
    L('r11', 'polier', '2027-01-09', '2027-01-10', 'fertig', { zaehlt: 2, kwh: 39.0, kosten_eur: 7.80, schaetzung_eur: 7.9 }),
    L('r10', 'sanitaer', '2027-01-02', '2027-01-03', 'fertig', { zaehlt: 2, kwh: 45.5, kosten_eur: 9.10 }),
    L('r9', 'polier', '2026-12-26', '2026-12-27', 'fertig', { zaehlt: 2, kwh: 41.0, kosten_eur: 8.20, schaetzung_eur: 7.9 }),
    L('r8', 'mannschaft', '2026-12-19', '2026-12-20', 'fertig', { zaehlt: 2, kwh: 47.0, kosten_eur: 9.40 }),
    L('r7', 'polier', '2026-12-12', '2026-12-13', 'fertig', { zaehlt: 2, kwh: 38.5, kosten_eur: 7.70, schaetzung_eur: 7.9 }),
    L('r6', 'sanitaer', '2026-12-05', '2026-12-06', 'fertig', { zaehlt: 2, kwh: 44.0, kosten_eur: 8.80 }),
    L('r5', 'sanitaer', '2026-11-28', '2026-11-29', 'abgesagt', { grund: 'über die Nachricht abgesagt' }),
    L('r4', 'polier', '2026-11-21', '2026-11-22', 'fertig', { zaehlt: 2, kwh: 36.0, kosten_eur: 7.20, schaetzung_eur: 7.9 }),
    L('r3', 'sanitaer', '2026-11-14', '2026-11-15', 'abgebrochen', { zaehlt: 1, kwh: 22.0, kosten_eur: 4.40, grund: 'Tür oder Fenster offen', abbruch_um: '2026-11-15T09:12' }),
    L('r2', 'polier', '2026-11-07', '2026-11-08', 'fertig', { zaehlt: 2, kwh: 37.5, kosten_eur: 7.50, schaetzung_eur: 7.9 }),
    L('r1', 'mannschaft', '2026-10-31', '2026-11-01', 'fertig', { zaehlt: 2, kwh: 46.0, kosten_eur: 9.20 })];
  const LAGEN = {
    aus: { jetzt: 'Do 29.10. 10:00', an: false, laeufe: [], container: C0, rahmen: { monat: 'Oktober', budget_eur: 60, gemessen_eur: 0, geplant_eur: 0, rest_eur: 60 }, vorschau: null },
    leer: { jetzt: 'Do 29.10. 10:00', an: true, laeufe: [], container: C0, rahmen: { monat: 'Oktober', budget_eur: 60, gemessen_eur: 0, geplant_eur: 0, rest_eur: 60 },
      vorschau: { von: '2026-10-31', letzter: '2026-11-01', bereich: 'mannschaft', name: '003_C_MAN', schaetzung_eur: 9.2, plant_am: '2026-10-30T12:00' } },
    angekuendigt: { jetzt: 'Fr 30.10. 14:00', an: true, laeufe: [R1], container: C0, rahmen: { monat: 'Oktober', budget_eur: 60, gemessen_eur: 0, geplant_eur: 9.2, rest_eur: 50.8 }, vorschau: null },
    laeuft: { jetzt: 'Sa 31.10. 15:00', an: true, laeufe: [{ ...R1, status: 'laeuft', thermostat_unveraendert: 'angenommen', bisher_kwh: 13.1, bisher_eur: 2.62, bis_t: 'So 24:00' }], container: C0,
      rahmen: { monat: 'Oktober', budget_eur: 60, gemessen_eur: 0, geplant_eur: 9.2, rest_eur: 50.8 }, vorschau: null },
    mehrere: { jetzt: 'Mo 18.01. 10:00', an: true, laeufe: MEHR, rahmen: { monat: 'Jänner', budget_eur: 60, gemessen_eur: 21.58, geplant_eur: 0, rest_eur: 38.42 },
      vorschau: { von: '2027-01-23', letzter: '2027-01-24', bereich: 'sanitaer', name: '002_C_SAN', schaetzung_eur: 9.2, plant_am: '2027-01-22T12:00' },
      container: [
        { bereich: 'polier', typ: 'oelradiator', tage: 10, noetig: 10, stand: 'gut', fertig: true, kein_lauf: null },
        { bereich: 'sanitaer', typ: 'konvektor', tage: 5, noetig: 10, stand: 'lernt', fertig: false, kein_lauf: null },
        { bereich: 'mannschaft', typ: 'konvektor', tage: 5, noetig: 10, stand: 'lernt', fertig: false, kein_lauf: null },
        { bereich: 'besprechung', typ: 'gemischt', tage: 0, noetig: 10, stand: null, fertig: false, kein_lauf: null },
        ...C0.slice(4)] },
  };
  const lage = () => LAGEN[G.lage];
  const an = () => lage().an;

  /* Beispiel-hass: Namen wie auf der Baustelle; im Lauf schreibt die Integration den Container wie bei Soll-Grund BASELINE */
  function schreiben() {
    const B = window.baustelleBeispiel, w = B && B.welt && B.welt[0]; if (!w) return;
    for (const b of w.bereiche) if (NAMEN[b.id]) b.name = NAMEN[b.id];
    const c = w.laufzeit.container[LAUF_BID]; if (!c) return;
    if (G.lage === 'laeuft') Object.assign(c, { modus: 'thermo', zustand: 'heizt', grund: 'baseline', text: 'Baseline-Messung · Thermostat am Gerät regelt', boost_bis: null, bedarf_bis: null, takt: null,
      baseline: { lauf_id: 'r1', bis: '2026-11-02T00:00', bis_t: 'So 24:00', bisher_kwh: 13.1, bisher_eur: 2.62 } });   // baseline: neues Feld (Vorschlag)
  }
  const neuLaden = () => { schreiben(); window.baustelleBeispiel.hassNeu(); return Promise.all(R.P().map(q => { q.cache = {}; return q._laden(); })); };

  /* ---------- Bausteine ---------- */
  const ST = { geplant: ['geplant', 'amber-t'], laeuft: ['läuft', 'blau-t'], fertig: ['zählt', 'gruen-t'], abgebrochen: ['abgebrochen', 'rot-t'], abgesagt: ['abgesagt', 'leise'] };
  const schalter = () => html`<button class="sw ${an() ? 'on' : ''}" role="switch" aria-checked=${an()} @click=${() => { G.lage = an() ? 'aus' : 'leer'; R.neuAlle(); }}><i></i></button>`;
  const SATZ = 'An freien Tagen heizt ein Container ohne Automatik, nur sein Thermostat am Heizkörper regelt – so wird gemessen, was die Automatik wirklich spart.';
  const schalterZeile = () => html`<div class="bl-zeile1"><div><b>Baseline messen</b> <span class="leise">(Testläufe ohne Automatik)</span><div class="leise">${SATZ}</div></div>${schalter()}</div>`;
  function rahmenZeile(p, stepper) {
    const r = lage().rahmen, g = r.gemessen_eur, v = r.geplant_eur, B = G.rahmen;
    return html`<div class="bl-zeile1 bl-rahmen ${stepper ? '' : 'klickbar'}" @click=${stepper ? null : () => R.auf(p, { art: 'bl-rahmen' })}><div>
        <b>Kostenrahmen</b> <span class="leise">je Monat</span>
        <div class="bl-balken" title="gemessen · geplant · frei"><i class="g" style="width:${g / B * 100}%"></i><i class="v" style="width:${v / B * 100}%"></i></div>
        <div class="leise">${r.monat}: ${eur(g)} gemessen${v ? html` · ≈ ${eur(v, 0)} geplant` : nothing} · <b class="bl-rest">${eur(r.rest_eur)} übrig</b></div></div>
      ${stepper ? html`<span class="stepper"><button @click=${() => { G.rahmen = Math.max(0, G.rahmen - 10); R.neuAlle(); }}>−</button><b>${G.rahmen} €</b><button @click=${() => { G.rahmen += 10; R.neuAlle(); }}>+</button></span>`
        : html`<span class="chip glas-panel">${G.rahmen} € ✎</span>`}</div>`;
  }
  function naechster(p) {
    const S = lage(), l = S.laeufe.find(x => x.status === 'geplant' || x.status === 'laeuft'), v = S.vorschau;
    const zr = x => `${tagT(x.von)}${x.letzter !== x.von ? ` – ${tagT(x.letzter)}` : ''}`;
    if (l && l.status === 'laeuft') return html`<div class="glas-panel bl-lauf laeuft"><div class="bl-lauf-k"><b>🧪 Läuft jetzt</b><span class="hp-st blau-t">bis ${l.bis_t}</span></div>
        <div><b>${l.name}</b> · ${zr(l)} · alle Heizkörper ohne Automatik, der Thermostat am Gerät regelt</div>
        <div class="leise">bisher ${de(l.bisher_kwh, 1)} kWh · ${eur(l.bisher_eur)} · geschätzt ≈ ${eur(l.schaetzung_eur, 0)} · endet früher bei offener Tür, Taste am Plug, Bedarf oder Termin</div>
        <button class="knopf rot" @click=${() => { G.lage = 'aus'; R.neuAlle(); }}>Lauf abbrechen – Automatik übernimmt</button></div>`;
    if (l) return html`<div class="glas-panel bl-lauf"><div class="bl-lauf-k"><b>Nächster Lauf</b><span class="hp-st amber-t">angekündigt</span></div>
        <div class="bl-gross">${zr(l)} · <b>${l.name}</b> · ≈ ${eur(l.schaetzung_eur, 0)}</div>
        <div class="leise">00:00 bis 24:00 · ${TYP.konvektor} · Ankündigung ${zeitT(l.angekuendigt)} aufs Handy · ohne Absage startet er</div>
        <button class="knopf leise-k bl-absagen" @click=${() => { G.lage = 'leer'; R.neuAlle(); }}>Absagen</button></div>`;
    if (v) return html`<div class="glas-panel bl-lauf leer"><div class="bl-lauf-k"><b>Nächster Lauf</b><span class="hp-st leise">noch nicht geplant</span></div>
        <div class="bl-gross">voraussichtlich ${zr(v)} · <b>${v.name}</b> · ≈ ${eur(v.schaetzung_eur, 0)}</div>
        <div class="leise">wird ${zeitT(v.plant_am)} geplant und aufs Handy angekündigt (mit „Absagen“) – nur Wochenende und freie Tage</div></div>`;
    return nothing;
  }
  function standListe(p) {
    const C = lage().container;
    return html`<div class="bl-titel">Stand je Container</div>
      <div class="bl-stand">${C.map(c => {
        const name = NAMEN[c.bereich], t = c.tage, n = c.noetig;
        const rechts = c.kein_lauf ? html`<span class="leise">${c.kein_lauf} – kein Lauf</span>`
          : c.fertig ? html`<span class="hp-st gruen-t">Signatur ohne: gut · fertig ✓</span>`
          : c.stand === 'lernt' ? html`<span class="hp-st">Signatur ohne: lernt · ${t}/${n} Tage</span>`
          : html`<span class="leise">noch nicht gemessen${c.typ === 'gemischt' ? ' · nach den reinen Typen' : ''}</span>`;
        return html`<div class="bl-s ${c.kein_lauf ? 'aus' : ''}"><b>${name}</b><span class="leise bl-typ">${TYP[c.typ]}</span>
          ${c.kein_lauf ? html`<span></span>` : html`<span class="bl-tage" title="${t} von ${n} Tagen ohne Automatik"><span class="bl-tbahn"><i style="width:${Math.min(100, t / n * 100)}%" class=${c.fertig ? 'ok' : ''}></i></span><span class="bl-tz">${t}/${n}</span></span>`}
          ${rechts}</div>`; })}</div>
      <div class="leise">Tage „ohne“ = ganze Tage eines Laufs, die zählen. Ein Container ist fertig, sobald seine Signatur „ohne Automatik“ gut ist;
        dann läuft er nicht mehr. Gemischte Container (Ölradiator und Konvektor) kommen nach den reinen.</div>`;
  }
  function laufListe() {
    const A = lage().laeufe.filter(l => l.status !== 'geplant' && l.status !== 'laeuft');
    if (!A.length) return html`<div class="bl-titel">Läufe</div><div class="leise">Noch keine Läufe.</div>`;
    const zeig = G.alle ? A : A.slice(0, 5);
    return html`<div class="bl-titel">Läufe <span class="leise">· ${A.length}</span></div>
      <div class="bl-liste">${zeig.map(l => { const [t, k] = ST[l.status];
        return html`<div class="bl-l"><span class="bl-l-d">${tagT(l.von)}${l.letzter !== l.von ? `–${tagT(l.letzter).slice(3)}` : ''}</span><span class="bl-l-c">${l.name}</span>
          <span class="bl-l-z">${l.status === 'abgesagt' ? '–' : `${l.zaehlt}/${l.tage} Tg`}</span><span class="bl-l-k">${l.kwh === null ? '–' : `${de(l.kwh, 1)} kWh`}</span>
          <span class="bl-l-e">${l.kosten_eur === null ? '–' : eur(l.kosten_eur)}</span><span class="hp-st ${k} bl-l-s">${t}</span>
          ${l.grund ? html`<span class="leise bl-l-g">${l.abbruch_um ? `${zeitT(l.abbruch_um)}: ` : ''}${l.grund}${l.status === 'abgebrochen' ? ` · ${l.zaehlt ? `${l.zaehlt === 1 ? 'erster Tag zählt' : `${l.zaehlt} Tage zählen`}` : 'kein Tag zählt'}` : ''}</span>` : nothing}</div>`; })}</div>
      ${A.length > 5 ? html`<button class="bl-mehr" @click=${() => { G.alle = !G.alle; R.neuAlle(); }}>${G.alle ? 'weniger ▴' : `alle ${A.length} Läufe ▾`}</button>` : nothing}`;
  }
  const thermostat = () => html`<div class="bl-hinweis">🌡 Der Thermostat am Heizkörper schaltet selbst ab, wenn es warm genug ist – genau das misst ein Lauf.
      Annahme: Am Wochenende verstellt niemand die Thermostate (im Lauf festgehalten als „Thermostat unverändert: angenommen“).</div>`;

  /* Reiter „Baseline“ in der Karte Heizperiode */
  function reiterInhalt(p) {
    const S = lage();
    if (G.v === 'b') return html`${R.band('Variante B · Einstellen in Heizung › Regeln, hier nur Ergebnis')}
      <div class="bl-zeile1"><div><b>Baseline messen</b> <span class="leise">· ${S.an ? 'an' : 'aus'}</span><div class="leise">Testläufe ohne Automatik – Schalter, Kostenrahmen und Absagen unter Heizung › Regeln.</div></div>
        <button class="chip glas-panel" @click=${() => { p.gehe('heizung'); p.hzAuf('regeln'); }}>einstellen ›</button></div>
      ${S.an ? naechster(p) : nothing}${standListe(p)}${laufListe()}${thermostat()}`;
    return html`${R.band('Variante A · alles im Reiter Baseline der Heizperiode')}${schalterZeile()}
      ${S.an ? html`${rahmenZeile(p, false)}${naechster(p)}${standListe(p)}${laufListe()}${thermostat()}`
        : html`<div class="leise bl-aus">Aus: „ohne Automatik“ bleibt eine Schätzung (jeder Heizkörper rund um die Uhr) – zu hoch, weil der Thermostat am Heizkörper
          in Wirklichkeit immer wieder abschaltet. Eingeschaltet plant die Integration an Wochenenden und freien Tagen je einen Container für bis zu 48 h
          (abwechselnd Ölradiator und Konvektor), im Kostenrahmen, und kündigt jeden Lauf am Vortag um 12:00 aufs Handy an – mit „Absagen“.</div>${thermostat()}`}`;
  }

  /* Karte Heizperiode der Seite: vierter Reiter „Baseline“ (die anderen Reiter bleiben, wie sie sind) */
  R.vorlage({ merkmal: 'class="glas-panel block hp-karte"', fn: (t, p) => {
    const j = t.strings.findIndex(s => s.includes('hp-reiter">')); if (j < 0) return t;
    const L0 = t.values[j]; if (!Array.isArray(L0)) return t;
    const Lb = L0.map(b => { const n = { ...b, values: [...b.values] }; const klick = n.values[2]; if (G.reiter) n.values[1] = ''; n.values[2] = () => { G.reiter = false; klick(); }; return n; });
    Lb.push(html`<button data-v="bl" class=${G.reiter ? 'on' : ''} @click=${() => { G.reiter = true; R.neuAlle(); }}>Baseline</button>`);
    const n = { ...t, values: [...t.values] }; n.values[j] = Lb;
    if (G.reiter) n.values[n.values.length - 1] = reiterInhalt(p);
    return n;
  } });

  /* Legende der Hochrechnung: Hinweis, solange „ohne“ geschätzt ist (die alte Zeile „… bis zur gemessenen Baseline …“ ersetzt er) */
  function hinweis(p) {
    const S = lage(), C = S.container.filter(c => !c.kein_lauf), f = C.filter(c => c.fertig).length, v = S.vorschau, l = S.laeufe.find(x => x.status === 'geplant' || x.status === 'laeuft');
    const stand = !S.an ? html`Baseline messen ist aus.` : html`${f} von ${C.length} Containern gemessen${l ? html` · ${l.status === 'laeuft' ? 'Lauf läuft' : 'nächster Lauf'} ${tagT(l.von)} (${l.name})` : v ? html` · nächster Lauf voraussichtlich ${tagT(v.von)}` : nothing}.`;
    return html`<div class="bl-leg glas-panel"><span class="bl-leg-ic">🧪</span><div><b>Prognose ohne Automatik: Schätzung 24/7 – wird durch Baseline-Läufe ersetzt.</b>
        <div class="leise">${stand} <a class="hp-link" @click=${() => { G.reiter = true; R.neuAlle(); }}>${S.an ? 'Baseline ›' : 'einschalten ›'}</a></div></div></div>`;
  }
  R.vorlage({ merkmal: '<div class="hp-leg">', fn: (t, p) => html`${t}${hinweis(p)}` });

  /* Container-Kopf im Lauf: Chip unter Jetzt statt „heizt · Baseline-Messung …“ */
  const chip = (p, c) => html`<button class="ck-chip ${c.ton} ${G.info ? 'auf' : ''}" data-k="bl-lauf" aria-expanded=${G.info ? 'true' : 'false'}
      @click=${() => { G.info = !G.info; for (const q of R.P()) if (q.s.ck) q.s.ck = { ...q.s.ck, info: null, modus: false }; R.neuAlle(); }}>
      <span class="ck-ic">${c.ic}</span><span class="ck-l">${c.lang}</span><span class="ck-k">${c.kurz}</span></button>`;
  const kVon = t => t && Array.isArray(t.strings) && t.strings.some(s => s.includes('class="ck-chip ')) ? t.values[2] : null;
  R.vorlage({ merkmal: 'class="ckd-g" data-g=', wann: p => G.lage === 'laeuft' && p.s.view === 'container' && p.b && p.b.id === LAUF_BID, fn: (t, p) => {
    if (t.values[0] !== 'Jetzt') return t;
    if (p.s.ck && p.s.ck.info) G.info = false;
    const bl = { bis_t: 'So 24:00', bisher_kwh: 13.1, bisher_eur: 2.62 };
    const c = { ic: '🧪', ton: 'blau', lang: `Baseline-Lauf bis ${bl.bis_t} · Thermostat regelt`, kurz: `bis ${bl.bis_t}` };
    t.values[3] = [chip(p, c), ...(t.values[3] || []).filter(x => kVon(x) !== 'zust')];
    if (G.info) t.values[4] = html`<div class="ck-info bl-info" role="note"><span>Baseline-Lauf von Sa 31.10. 00:00 bis So 01.11. 24:00: Alle Heizkörper hängen ohne Automatik am Strom,
        der Thermostat am Heizkörper regelt selbst. So misst die Integration, was die Automatik spart. Bisher ${de(bl.bisher_kwh, 1)} kWh · ${eur(bl.bisher_eur)}.
        Er endet früher, wenn die Tür länger offen ist, jemand die Taste am Plug drückt, Bedarf oder ein Termin kommt.
        <button class="bl-ab" @click=${() => { G.lage = 'aus'; G.info = false; R.vorfuehrenNeu(); }}>Lauf abbrechen – Automatik übernimmt</button></span>
        <button aria-label="schließen" @click=${() => { G.info = false; R.neuAlle(); }}>✕</button></div>`;
    return t;
  } });
  R.vorlage({ merkmal: 'class="glas-panel ck ck-d ck-d2 ', wann: p => G.lage === 'laeuft' && p.s.view === 'container' && p.b && p.b.id === LAUF_BID,
    fn: t => html`${R.band('Container-Kopf während eines Baseline-Laufs (A und B gleich)')}${t}` });

  /* Variante B: Karte „🧪 Baseline messen“ in Heizung › Regeln (vor den festen Regeln) */
  R.vorlage({ merkmal: '<b>📐 Feste Regeln</b>', wann: () => G.v === 'b', fn: (t, p) => html`<div class="rv-kopf bl-regeln"><b>🧪 Baseline messen ${R.marke}</b><span class="leise">Testläufe ohne Automatik</span></div>
    <div class="rv-karte bl-rv">${R.band('Variante B')}<div class="zeile"><div><b>Baseline messen</b><div class="leise">${SATZ}</div></div>${schalter()}</div>
      ${an() ? html`<div class="zeile unter bl-rv-rahmen">${rahmenZeile(p, true)}</div>${naechster(p) === nothing ? nothing : html`<div class="bl-rv-lauf">${naechster(p)}</div>`}
        <div class="zeile unter"><span class="leise">Stand je Container und alle Läufe</span><button class="rv-link" @click=${() => { p.schliessen(); p.gehe('auswertung'); G.reiter = true; p.awDetail('hochrechnung'); }}>Auswertung › Heizperiode ›</button></div>` : nothing}</div>${t}` });

  /* Einblendung Kostenrahmen (A) */
  R.einblendung('bl-rahmen', p => html`<div class="block-kopf"><h3>Kostenrahmen Baseline</h3><span class="leise">je Monat</span></div>
      <div class="glas-panel liste bl-eing"><div class="zeile"><span>€ je Monat</span><span class="stepper"><button @click=${() => { G.rahmen = Math.max(0, G.rahmen - 10); R.neuAlle(); }}>−</button><b>${G.rahmen} €</b><button @click=${() => { G.rahmen += 10; R.neuAlle(); }}>+</button></span></div></div>
      <div class="leise">Ein Lauf wird nur geplant, wenn seine geschätzten Kosten in den Rest des Monats passen (gezählt im Monat seines ersten Tags).
        Gemessene Kosten fertiger und abgebrochener Läufe zählen gegen den Rahmen, abgesagte nicht. Vorgabe 60 €.</div>
      <button class="knopf" @click=${() => p.schliessen()}>Fertig</button>`, { breit: () => false });

  R.stil(`
.hp-leg ~ .leise:not(.hp-her) { display: none; }   /* alte Zeile „… bis zur gemessenen Baseline eine Schätzung …“ – ersetzt durch den Hinweis */
.bl-leg { display: flex; gap: 10px; align-items: flex-start; padding: 10px 12px; border-radius: 14px; margin: 8px 0 4px; font-size: 13px; }
.bl-leg-ic { font-size: 18px; line-height: 1.2; } .bl-leg b { font-weight: 600; }
.bl-zeile1 { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 8px 0; border-bottom: 1px solid rgba(127,127,127,.15); }
.bl-zeile1 > div { flex: 1; min-width: 0; } .bl-rahmen.klickbar { cursor: pointer; }
.bl-balken { display: flex; height: 6px; border-radius: 3px; background: rgba(127,127,127,.2); margin: 6px 0 3px; overflow: hidden; }
.bl-balken i { display: block; height: 100%; } .bl-balken i.g { background: var(--amber); } .bl-balken i.v { background: color-mix(in srgb, var(--amber) 40%, transparent); }
.bl-rest { font-weight: 600; color: var(--ink); }
.bl-lauf { text-align: left; padding: 10px 12px; border-radius: 14px; margin: 10px 0; display: flex; flex-direction: column; gap: 4px; font-size: 13px; }
.bl-lauf.laeuft { box-shadow: inset 3px 0 0 var(--blau); } .bl-lauf.leer { opacity: .9; }
.bl-lauf-k { display: flex; justify-content: space-between; gap: 8px; } .bl-gross { font-size: 15px; } .bl-lauf .knopf { margin-top: 6px; padding: 9px !important; }
.blau-t { color: var(--blau); }
.bl-titel { font-size: 12px; color: var(--ink2); text-transform: uppercase; letter-spacing: .04em; margin: 14px 0 2px; }
.bl-stand { display: flex; flex-direction: column; }
.bl-s { text-align: left; display: grid; grid-template-columns: minmax(80px, auto) 1fr minmax(90px, 140px) auto; gap: 2px 10px; align-items: center; padding: 6px 0; font-size: 13px; border-bottom: 1px solid rgba(127,127,127,.15); }
.bl-s.aus { opacity: .6; } .bl-typ { font-size: 12px; }
.bl-tage { display: flex; align-items: center; gap: 6px; } .bl-tbahn { flex: 1; height: 6px; border-radius: 3px; background: rgba(127,127,127,.2); overflow: hidden; }
.bl-tbahn i { display: block; height: 100%; background: var(--s2); } .bl-tbahn i.ok { background: #30d158; } .bl-tz { font-size: 12px; color: var(--ink2); min-width: 32px; text-align: right; }
.bl-liste { display: flex; flex-direction: column; }
.bl-l { text-align: left; display: grid; grid-template-columns: auto minmax(86px, 1fr) auto auto auto auto; gap: 2px 10px; padding: 6px 0; font-size: 13px; border-bottom: 1px solid rgba(127,127,127,.15); align-items: baseline; }
.bl-l-d { white-space: nowrap; } .bl-l-c { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; } .bl-l-z, .bl-l-k, .bl-l-e { text-align: right; white-space: nowrap; } .bl-l-s { text-align: right; }
.bl-l-g { grid-column: 2 / -1; font-size: 12px; }
.bl-mehr { background: none; border: 0; color: var(--blau); font: inherit; font-size: 13px; padding: 6px 0; cursor: pointer; }
.bl-hinweis { font-size: 12px; color: var(--ink2); margin-top: 12px; padding: 8px 10px; border-radius: 10px; background: rgba(120,120,128,.10); }
.bl-aus { margin: 8px 0; }
.ck-chip.blau { color: var(--blau); background: color-mix(in srgb, var(--blau) 14%, transparent); }
.ckd-gruppen .ckd-g:has(> .bl-info) { grid-column: 1 / -1; } .bl-info > span { max-width: 64ch; }
.bl-ab { display: block; margin-top: 8px; background: none; border: 0; padding: 0; font: inherit; font-weight: 600; color: var(--rot); cursor: pointer; }
.bl-rv .zeile.unter .bl-zeile1 { border: 0; padding: 0; width: 100%; } .bl-rv-rahmen { display: block !important; }
.bl-rv-lauf { padding: 0 12px; } .bl-rv .r-band { margin: 8px 12px 0; }
.bl-eing { padding: 4px 0; }
@container (max-width: 520px) {
  .bl-rahmen { flex-wrap: wrap; } .bl-rahmen > div { flex-basis: 100%; }
  .bl-s { grid-template-columns: 1fr auto; } .bl-s .bl-typ { text-align: right; } .bl-s .bl-tage { grid-column: 1 / -1; } .bl-s > :last-child { grid-column: 1 / -1; }
  .bl-l { grid-template-columns: auto 1fr auto; grid-template-areas: "d s c" "z k e" "g g g"; }
  .bl-l-d { grid-area: d; } .bl-l-s { grid-area: s; text-align: left; } .bl-l-c { grid-area: c; text-align: right; }
  .bl-l-z { grid-area: z; text-align: left; } .bl-l-k { grid-area: k; } .bl-l-e { grid-area: e; } .bl-l-g { grid-area: g; }
}`);

  /* ---------- Vorführ-Leiste ---------- */
  let letzte = null;
  async function zeigen(w) {
    letzte = w;
    Object.assign(G, { v: w.variante, lage: w.lage, alle: false, info: w.zeigen === 'kopf-satz' });
    if (!window.baustelleBeispiel || !window.baustelleBeispiel.welt) return;
    await neuLaden();
    for (const q of R.P()) {
      if (!q.d) continue;
      q.s.sheet = null; q.s.ck = null;
      if (w.zeigen === 'kopf' || w.zeigen === 'kopf-satz') { q.containerOeffnen(LAUF_BID); continue; }
      if (w.zeigen === 'regeln') { q.gehe('heizung'); q.hzAuf('regeln'); continue; }
      q.gehe('auswertung'); q.s.hpReiter = 'hoch'; q.s.hpAufl = 'hp';
      G.reiter = w.zeigen === 'reiter' || w.zeigen === 'rahmen';
      q.s.sheet = w.zeigen === 'rahmen' ? { art: 'bl-rahmen' } : { art: 'aw-detail', k: 'hochrechnung' };   // Karte Heizperiode = Detail der Kachel Hochrechnung
    }
    R.neuAlle();
  }
  R.vorfuehrenNeu = () => { const s = document.querySelector('select[data-r="lage"]'); if (s) s.value = G.lage; if (letzte) zeigen({ ...letzte, lage: G.lage, zeigen: letzte.zeigen === 'kopf-satz' ? 'kopf' : letzte.zeigen }); };
  R.vorfuehren(zeigen);
}

const V = [['a', 'A · alles im Reiter Baseline (Heizperiode)'], ['b', 'B · Einstellen in Heizung › Regeln']];
const LAGE = [['aus', 'aus'], ['leer', 'an, noch keine Läufe'], ['angekuendigt', 'Lauf angekündigt (Fr 14:00)'], ['laeuft', 'Lauf läuft (Sa 15:00)'], ['mehrere', 'mehrere Läufe, 1 Container fertig']];
const ZEIGEN = [['reiter', 'Heizperiode › Baseline'], ['hinweis', 'Heizperiode › Hochrechnung (Hinweis)'], ['kopf', 'Container-Kopf (im Lauf)'], ['kopf-satz', 'Container-Kopf, Chip angetippt'],
  ['regeln', 'Heizung › Regeln'], ['rahmen', 'Einblendung Kostenrahmen (A)']];
const faelle = [];
for (const v of ['a', 'b']) for (const l of ['aus', 'leer', 'angekuendigt', 'laeuft', 'mehrere']) faelle.push({ name: `${v}-${l}-reiter`, werte: { variante: v, lage: l, zeigen: 'reiter' }, scroll: '.hp-karte' });
for (const l of ['aus', 'angekuendigt', 'mehrere']) faelle.push({ name: `hinweis-${l}`, werte: { variante: 'a', lage: l, zeigen: 'hinweis' }, scroll: '.bl-leg' });
faelle.push({ name: 'a-mehrere-stand', werte: { variante: 'a', lage: 'mehrere', zeigen: 'reiter' }, scroll: '.bl-stand' },
  { name: 'a-mehrere-laeufe', werte: { variante: 'a', lage: 'mehrere', zeigen: 'reiter' }, scroll: '.bl-liste' },
  { name: 'a-mehrere-alle', werte: { variante: 'a', lage: 'mehrere', zeigen: 'reiter' }, klick: ['alle 12 Läufe'], scroll: '.bl-liste' },
  { name: 'a-laeuft-unten', werte: { variante: 'a', lage: 'laeuft', zeigen: 'reiter' }, scroll: '.bl-stand' });
faelle.push({ name: 'kopf-laeuft', werte: { variante: 'a', lage: 'laeuft', zeigen: 'kopf' } }, { name: 'kopf-laeuft-satz', werte: { variante: 'a', lage: 'laeuft', zeigen: 'kopf-satz' } });
for (const l of ['aus', 'angekuendigt', 'laeuft']) faelle.push({ name: `b-regeln-${l}`, werte: { variante: 'b', lage: l, zeigen: 'regeln' }, scroll: '.bl-regeln' });
faelle.push({ name: 'a-rahmen', werte: { variante: 'a', lage: 'angekuendigt', zeigen: 'rahmen' } });
rahmen.bauen({ datei: 'baseline.html', titel: 'Baustelle – Baseline-Läufe', leiste: 'J4b Baseline-Läufe (FE-0033) · A/B', browser, faelle,
  auswahl: [{ id: 'variante', t: 'Variante', optionen: V }, { id: 'lage', t: 'Lage', optionen: LAGE }, { id: 'zeigen', t: 'zeigen', optionen: ZEIGEN }] });
