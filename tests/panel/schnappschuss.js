// Schnappschuss der Seite für Umbauten ohne Verhaltensänderung (BSM-022 Stufe 1a–1c, bauplan-lit §3 „gleiche Ausgabe/Befehle“):
// rendert die gebaute Seite mit fester Uhr im DOM von happy-dom durch alle Ansichten, Container und Einblendungen und schreibt
// je Schritt das HTML von `.ui` und die gesendeten WebSocket-Befehle als JSON. Vorher/Nachher vergleichen:
//   node tests/panel/schnappschuss.js <baustelle-panel.js> <ausgabe.json>
//   node tests/panel/schnappschuss.js --vergleich <vorher.json> <nachher.json>
'use strict';
const fs = require('fs');
const path = require('path');
const argv = process.argv.slice(2);

if (argv[0] === '--vergleich') {
  // Lit-Markierungen (<!--?lit$…$-->, <!---->) sind keine Ausgabe – beim Vergleich weglassen (BSM-022 2b)
  const ohneLit = o => JSON.parse(JSON.stringify(o, (k, v) => k === 'html' && typeof v === 'string' ? v.replace(/<!--\??(?:lit\$\d+\$)?-->/g, '') : v));
  const [a, b] = argv.slice(1).map(f => ohneLit(JSON.parse(fs.readFileSync(f, 'utf8'))));
  const unterschiede = [];
  for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) {
    if (JSON.stringify(a[k]) === JSON.stringify(b[k])) continue;
    const x = JSON.stringify(a[k] ?? null), y = JSON.stringify(b[k] ?? null);
    let i = 0; while (i < x.length && x[i] === y[i]) i++;
    unterschiede.push(`${k}: …${x.slice(Math.max(0, i - 60), i + 60)}… ≠ …${y.slice(Math.max(0, i - 60), i + 60)}…`);
  }
  console.log(unterschiede.length ? `${unterschiede.length} Schritte verschieden:\n` + unterschiede.slice(0, 15).join('\n') : `gleich: ${Object.keys(a).length} Schritte (HTML und Befehle)`);
  process.exit(unterschiede.length ? 1 : 0);
}

const [datei, ziel] = argv;
if (!datei || !ziel) { console.error('Aufruf: node tests/panel/schnappschuss.js <baustelle-panel.js> <ausgabe.json>'); process.exit(2); }

/* feste Uhr: 29.09.2026 16:20 (wie Beispiel und Mockup), läuft nicht weiter */
const JETZT = Date.parse('2026-09-29T16:20:00+02:00'), _Date = Date;
global.Date = class extends _Date { constructor(...a) { if (a.length) super(...a); else super(JETZT); } static now() { return JETZT; } };
global.Date.parse = _Date.parse; global.Date.UTC = _Date.UTC;

const umgebung = require('./umgebung.js');
umgebung.einrichten();
global.fetch = async () => ({ ok: true, json: async () => [{ version: '0.0.0', datum: '2026-10-01', punkte: ['Beispiel'] }] });
console.warn = () => {};
umgebung.seiteLaden(datei);

const STRUKTUR = JSON.parse(fs.readFileSync(path.join(__dirname, 'struktur-0.7.json'), 'utf8'));
const VEKTOR = Object.fromEntries(['abrechnung', 'je-geraet', 'typvergleich', 'wetter', 'kennzahlen', 'verlauf', 'monate'].map(n => {
  const f = path.join(__dirname, '..', 'vektoren', `auswertung-${n}.json`);
  return [n, fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')).faelle : []];
}));
const befehle = [];
const { hass } = require('./beispiel-hass.js').beispielHass({ STRUKTUR, REFERENZ: true, VEKTOR, WELT: 'struktur-0.7', JETZT,
  welt: () => STRUKTUR, mit: m => befehle.push(JSON.parse(JSON.stringify(m))) });
const ruhe = async (n = 20) => { for (let i = 0; i < n; i++) await new Promise(r => setImmediate(r)); };

(async () => {
  const panel = document.createElement('baustelle-panel');
  panel.panel = { config: { version: '0.0.0' } }; panel.narrow = false; panel.hass = hass;
  document.body.appendChild(panel); await ruhe(40);
  const ui = panel.shadowRoot.querySelector('.ui'), e = umgebung.helfer(panel), aus = {};
  // ds: data-Attribute (alte Ansichten, data-act) oder CSS-Selektor (Lit-Vorlagen, @click; Text muss in beiden Ständen passen)
  const klickSel = sel => { const x = panel.shadowRoot.querySelector(sel); if (x) x.dispatchEvent(new MouseEvent('click', { bubbles: true, composed: true })); else aus[`fehlt ${sel}`] = { html: '', befehle: [] }; };
  const schritt = async (name, ds) => { const ab = befehle.length; if (typeof ds === 'string') klickSel(ds); else if (ds) e.klick(ds); await ruhe(); aus[name] = { html: ui.innerHTML, befehle: befehle.slice(ab) }; };
  await schritt('start');
  for (const v of ['uebersicht', 'heizung', 'pumpen', 'auswertung', 'verlauf', 'einst']) await schritt(`tab ${v}`, { act: 'tab', v });
  await schritt('tab uebersicht 2', { act: 'tab', v: 'uebersicht' });
  for (const b of STRUKTUR[0].bereiche) { await schritt(`container ${b.id}`, { act: 'container', id: b.id }); await schritt(`zurück ${b.id}`, { act: 'tab', v: 'uebersicht' }); }
  for (const s of ['verbrauch', 'wetter', 'warnungen', 'baustellen', 'heizplan', 'strom', 'nachrichten', 'bericht', 'urlaub', 'melden']) {
    await schritt(`sheet ${s}`, s === 'melden' ? { act: 'melden' } : { act: 'sheet', s }); await schritt(`zu ${s}`, { act: 'zu' }); }
  await schritt('tab einst 2', { act: 'tab', v: 'einst' });
  for (const g of ['baustelle', 'heizung', 'notprogramm', 'container', 'geraete', 'pumpen', 'strom', 'firmen', 'meldungen', 'bericht', 'app', 'ueber'])
    await schritt(`einst ${g}`, { act: 'ev-gruppe', v: g });
  // Verlauf und Detailseite (Stufe 3b) – Selektoren über die Struktur, damit alter und neuer Stand gleich getroffen werden
  const tippen = async (name, sel, text) => { const x = panel.shadowRoot.querySelector(sel); const ab = befehle.length; if (x) { x.value = text; x.dispatchEvent(new Event('input', { bubbles: true, composed: true })); } await ruhe(); aus[name] = { html: ui.innerHTML, befehle: befehle.slice(ab) }; };
  await schritt('verlauf', { act: 'tab', v: 'verlauf' });
  await schritt('verlauf vergleich', '.vl-reiter .seg.klein button:nth-child(2)');
  await schritt('verlauf sortieren', '.vl-tab-kopf button:nth-child(4)');
  await schritt('verlauf sortieren 2', '.vl-tab-kopf button:nth-child(4)');
  await schritt('verlauf karten', '.vl-reiter .seg.klein button:nth-child(1)');
  await schritt('verlauf protokoll', '.vl-reiter .seg:not(.klein) button:nth-child(2)');
  await schritt('protokoll warnungen', '.vl-filter .vb-wer button:nth-child(2)');
  await schritt('protokoll alle', '.vl-filter .vb-wer button:nth-child(1)');
  await tippen('protokoll suche', '.vl-suche', 'zzzz-nichts');
  await tippen('protokoll suche leer', '.vl-suche', '');
  await schritt('verlauf baustellen', '.vl-reiter .seg:not(.klein) button:nth-child(1)');
  await schritt('bsdetail', '.vl-karte:not(.aktiv)');
  await schritt('bsdetail zurück', '.zurueck-zeile button:nth-child(1)');
  await schritt('einst dev', { act: 'ev-gruppe', v: 'dev' });
  await schritt('einst dev werkzeuge', { act: 'ev-dev', v: 'werkzeuge' });
  await schritt('tab dev', { act: 'tab', v: 'dev' });
  for (const [i, f] of ['offen', 'erledigt', 'alle'].entries()) await schritt(`dev ${f}`, `.seite .seg.klein button:nth-child(${i + 1})`);
  // Pumpen und Pumpenschacht (Stufe 3c)
  await schritt('pumpen', { act: 'tab', v: 'pumpen' });
  for (const [i, c] of ['zyklen', 'verbrauch', 'pumpzeit'].entries()) await schritt(`pumpen ${c}`, `.seite .block .seg button:nth-child(${[2, 3, 1][i]})`);
  await schritt('pumpen stepper +', '.seite .stepper button:nth-child(3)');
  await schritt('pumpen stepper −', '.seite .stepper button:nth-child(1)');
  if (panel.shadowRoot.querySelector('.seite .warn-zeile')) await schritt('pumpen warnung', '.seite .warn-zeile');
  await schritt('pumpen zurück', { act: 'tab', v: 'pumpen' });
  await schritt('pumpen meldungen', '.seite .block:last-child button.zeile');
  await schritt('pumpen 2', { act: 'tab', v: 'pumpen' });
  await schritt('schacht', '.seite .block-kopf .chip');
  for (const [i, c] of ['zyklen', 'verbrauch', 'pumpzeit'].entries()) await schritt(`schacht ${c}`, `.c-live .seg button:nth-child(${[2, 3, 1][i]})`);
  await schritt('schacht früher', '.zr-nav .zr-pf:first-child');
  await schritt('schacht aktuell', '.zr-akt');
  await schritt('schacht kalender', '.zr-auf');
  await schritt('schacht kalender zurück', '.zr-kal-kopf .zr-pf:first-child');
  await schritt('schacht kalender heute', '.zr-kal-fuss .chip');
  await schritt('schacht kennzahlen', '.c-live-kennz');
  await schritt('schacht kennzahlen zu', { act: 'zu' });
  await schritt('schacht bearbeiten', '.zurueck-zeile button:nth-child(2)');
  await schritt('schacht bearbeiten zu', { act: 'zu' });
  await schritt('schacht automatik', '.seite .liste .zeile .sw');
  if (panel.shadowRoot.querySelector('.seite .zeile.geraet .sw')) await schritt('schacht gerät', '.seite .zeile.geraet .sw');
  await schritt('schacht geräte bearbeiten', '.seite .block:not(.c-live) > button.zeile');
  await schritt('schacht geräte bearbeiten zu', { act: 'zu' });
  await schritt('schacht schwellen', '.seite > .liste:last-child button.zeile');
  await schritt('schacht 2', '.seite .block-kopf .chip');
  await schritt('schacht übersicht', '.zurueck-zeile button:nth-child(1)');
  // Container (Stufe 3d): mit Fühler und Lernen, dann bei Bedarf
  const B = panel.d.bereiche, mitF = B.find(b => !b.pumpe && b.fuehler && b.lern) || B.find(b => !b.pumpe && b.fuehler), bed = B.find(b => b.bedarf);
  if (mitF) {
    const c = mitF.id;
    await schritt(`c ${c}`, { act: 'container', id: c });
    for (const [i, v] of ['woche', 'stunden', 'heute'].entries()) await schritt(`c ${c} ${v}`, `.c-live .block-kopf .seg button:nth-child(${i === 2 ? 1 : i + 2})`);
    await schritt(`c ${c} tag früher`, '.c-live .zr-nav .zr-pf:first-child');
    await schritt(`c ${c} tag kalender`, '.c-live .zr-auf');
    await schritt(`c ${c} tag kalender heute`, '.c-live .zr-kal-fuss .chip');
    await schritt(`c ${c} soll +`, '.c-rad-pm .c-pm:nth-child(2)');
    await schritt(`c ${c} gefühl`, '.ck-gefuehl button:nth-child(1)');
    if (panel.shadowRoot.querySelector('.ckd-soll .ck-zurueck')) await schritt(`c ${c} gleitend`, '.ckd-soll .ck-zurueck');
    await schritt(`c ${c} chip`, '.ck-d .ckd-g[data-g="Jetzt"] .ck-chip');
    await schritt(`c ${c} modus auf`, '.ck-d .ck-chip.modus');
    await schritt(`c ${c} modus hand`, '.ck-modi button:nth-child(4)');
    await schritt(`c ${c} boost`, '.ck-d .ck-chip.ck-boost');
    for (const n of [1, 2, 3, 4]) { await schritt(`c ${c} kachel ${n}`, `.c-kacheln .c-kachel:nth-child(${n})`); await schritt(`c ${c} kachel ${n} zu`, { act: 'zu' }); }
    await schritt(`c ${c} gerät aktiv`, '.c-chip .c-aktiv .sw');
    await schritt(`c ${c} gerät power`, '.c-chip .c-power:not([disabled])');
    await schritt(`c ${c} gerät bearbeiten`, '.c-chip .bs-ic'); await schritt(`c ${c} gerät bearbeiten zu`, { act: 'zu' });
    if (panel.shadowRoot.querySelector('.c-chip .link')) await schritt(`c ${c} gerät automatik`, '.c-chip .link');
    await schritt(`c ${c} trocknen`, '.seite > .liste .zeile:last-child .sw');
    if (mitF.lern) { await schritt(`c ${c} lernen`, '.seite > .liste .zeile:not(:last-child) .sw');
      if (panel.shadowRoot.querySelector('.seite > .liste .link')) { await schritt(`c ${c} lernstand`, '.seite > .liste .link'); await schritt(`c ${c} lernstand zu`, { act: 'zu' }); } }
    await schritt(`c ${c} bearbeiten`, '.zurueck-zeile button:nth-child(2)'); await schritt(`c ${c} bearbeiten zu`, { act: 'zu' });
    await schritt(`c ${c} zurück`, '.zurueck-zeile button:nth-child(1)');
  }
  if (bed) {
    const c = bed.id;
    await schritt(`c ${c}`, { act: 'container', id: c });
    await schritt(`c ${c} 1 h`, '.bedarf-dauer .chip:nth-child(1)');
    if (panel.shadowRoot.querySelector('.bedarf-an .chip')) await schritt(`c ${c} beenden`, '.bedarf-an .chip');
    if (panel.shadowRoot.querySelector('.ereignis .x')) await schritt(`c ${c} termin weg`, '.ereignis .x');
    await schritt(`c ${c} termin neu`, '.seite .block .zeile .blau'); await schritt(`c ${c} termin neu zu`, { act: 'zu' });
  }
  // Einblendungen der Container-Ansicht (Stufe 3d): Leistung, Heizzeit, Bei Bedarf, Termin, Lernstand
  const feld = async (name, sel, wert, art = 'input') => { const x = panel.shadowRoot.querySelector(sel); const ab = befehle.length;
    if (x) { x.value = wert; x.dispatchEvent(new Event('input', { bubbles: true, composed: true })); if (art === 'change') x.dispatchEvent(new Event('change', { bubbles: true, composed: true })); }
    else aus[`fehlt ${sel}`] = { html: '', befehle: [] };
    await ruhe(); aus[name] = { html: ui.innerHTML, befehle: befehle.slice(ab) }; };
  if (mitF) {
    await schritt('e c', { act: 'container', id: mitF.id });
    await schritt('e leistung', '.c-kacheln .c-kachel:nth-child(1)');
    await schritt('e leistung tag', '.sheet .seg button:nth-child(2)');
    await schritt('e leistung stunde', '.sheet .seg button:nth-child(1)');
    await feld('e leistung regler', '.sheet .lh-regler input', '5', 'change');
    await feld('e leistung regler zu weit', '.sheet .lh-regler input', '23', 'change');
    await schritt('e leistung früher', '.sheet .zr-nav .zr-pf:first-child');
    await feld('e leistung regler gestern', '.sheet .lh-regler input', '20', 'change');
    await schritt('e leistung zu', '.sheet > .knopf');
    await schritt('e heizzeit', '.c-kacheln .c-kachel:nth-child(4)');
    await schritt('e heizzeit woche', '.sheet .seg button:nth-child(2)');
    await schritt('e heizzeit früher', '.sheet .zr-nav .zr-pf:first-child');
    await schritt('e heizzeit monat', '.sheet .seg button:nth-child(3)');
    await schritt('e heizzeit zu', '.sheet > .knopf');
    const pol = panel.d.bereiche.find(x => x.id === mitF.id); pol.modus = 'thermo';
    pol.lern = { an: true, zyklen: 3, anteil: 38, erwartet: .8, aus_bei: 19.2, zyklus_min: 10, kint: { wert: .57, start: .6, fort: .06 }, kext: { wert: .01, start: .01, fort: 0 },
      nachlauf: { 'oel|lang|kalt': { grad: 1.2, min: 12, n: 3 } }, treffer: [.3, -.1, .2] };
    await panel.neuZeichnen(); await schritt('e mit lernen');
    await schritt('e lernstand', '.seite > .liste .link');
    await schritt('e lernstand mild', '.sheet .block-kopf .seg button:nth-child(2)');
    await schritt('e lernstand reset', '.sheet .knopf.rot');
    await schritt('e lernstand 2', '.seite > .liste .link');
    await schritt('e lernstand zu', '.sheet .knopf.leise-k');
    await schritt('e zurück', { act: 'tab', v: 'uebersicht' });
  }
  if (bed) {
    await schritt('e bedarf', { act: 'bedarf-auf', id: bed.id });
    await schritt('e bedarf schnell', '.sheet .zeile .sw');
    await schritt('e bedarf 1 h', '.sheet .bedarf-dauer .knopf:nth-child(1)');
    await schritt('e bedarf 2', { act: 'bedarf-auf', id: bed.id });
    await schritt('e bedarf abbrechen', '.sheet > .knopf.leise-k');
    await schritt('e bedarf 3', { act: 'bedarf-auf', id: bed.id });
    await schritt('e termin', '.sheet button.zeile');
    await feld('e termin titel', '.sheet .feld input', 'Besprechung Test');
    await schritt('e termin woche', '.sheet .seg button:nth-child(2)');
    await schritt('e termin schnell', '.sheet .zeile .sw');
    await feld('e termin von', '.sheet .raster-2 .feld:nth-child(1) input', '07:30');
    await schritt('e termin eintragen', '.sheet .knopf.amber');
    await schritt('e termin 2', { act: 'sheet', s: 'termin', id: bed.id });
    await feld('e termin titel leer', '.sheet .feld input', '  ');
    await schritt('e termin eintragen leer', '.sheet .knopf.amber');
    await schritt('e termin abbrechen', '.sheet .knopf.leise-k');
  }
  // Reiter Heizung (Stufe 3d): Kacheln als Einblendung, darin die Bedienung je Block
  const wenn = async (name, sel) => { if (panel.shadowRoot.querySelector(sel)) await schritt(name, sel); };
  await schritt('h', { act: 'tab', v: 'heizung' });
  await schritt('h automatik', '.seite .glas-kopf .sw'); await schritt('h automatik 2', '.seite .glas-kopf .sw');
  await schritt('h heute', '.seite .hz-held'); await wenn('h heute container', '.sheet .hz-ohne .chip'); await schritt('h heute zu', { act: 'tab', v: 'heizung' });
  for (let n = 1; n <= 8; n++) {
    await schritt(`h ${n}`, `.hz-raster .hz-kachel:nth-child(${n})`);
    if (n === 2) { await schritt('h wann woche', '.sheet .block-kopf .seg button:nth-child(2)'); await wenn('h wann zelle', '.sheet .hz-zelle'); await wenn('h wann tag', '.sheet .vb-wer button:nth-child(1)'); }
    if (n === 3) { await wenn('h jc soll', '.sheet .jc .stepper button:nth-child(3)'); await wenn('h jc trocknen', '.sheet .jc .sw');
      await feld('h jc modus', '.sheet .jc-modus', 'hand', 'change'); }
    if (n === 4) { await wenn('h az weg', '.sheet .am-fenster .x'); await wenn('h az früher', '.sheet .az-name ~ button.zeile:nth-last-child(2)'); await wenn('h ausn heute', '.sheet .bedarf-dauer .chip:nth-child(1)'); }
    if (n === 5) { await wenn('h ausn dazu', '.sheet .am-tag > button.zeile'); }
    if (n === 6) { await schritt('h regeln +', '.sheet .rv-karte .stepper button:nth-child(3)'); await schritt('h regeln frühstart', '.sheet .rv-karte .sw');
      await schritt('h regeln gleitend', '.sheet .rv-karte .zeile:not(.unter) .seg button:nth-child(2)'); await wenn('h regeln vergessen', '.sheet .rv-karte .rv-link');
      await wenn('h regeln basis', '.sheet .rv-karte .zeile.unter .seg button:nth-child(1)'); await schritt('h regeln fest', '.sheet .rv-karte .zeile:not(.unter) .seg button:nth-child(1)'); }
    if (n === 7) await schritt('h trocknen +', '.sheet .stepper button:nth-child(3)');
    if (n === 8) { await schritt('h urlaub feiertag', '.sheet .zeile .sw'); await schritt('h urlaub absenken', '.sheet .seg button:nth-child(2)'); await wenn('h urlaub weg', '.sheet .zeile.unter .x');
      await schritt('h urlaub neu', '.sheet .hz-innen > button.zeile:last-of-type'); }
    await schritt(`h ${n} zu`, { act: 'zu' });
  }
  // Dialoge der Heizung (Stufe 3d): Heizplan, Arbeitszeit, Neue Arbeitszeit, Ausnahme
  await schritt('d heizplan', { act: 'sheet', s: 'heizplan' });
  await schritt('d heizplan jetzt', '.sheet .bedarf-dauer .chip:nth-child(1)');
  await schritt('d heizplan ausnahme', '.sheet .bedarf-dauer .chip:nth-child(2)');
  await schritt('d ausnahme frei', '.sheet .seg button:nth-child(3)');
  await schritt('d ausnahme arbeit', '.sheet .seg button:nth-child(1)');
  await feld('d ausnahme datum', '.sheet .feld input[type="date"]', '2026-10-02');
  await feld('d ausnahme von', '.sheet .raster-2 .feld:nth-child(1) input', '13:00');
  await feld('d ausnahme notiz', '.sheet .feld:last-of-type input', 'Betonieren');
  await schritt('d ausnahme speichern', '.sheet .knopf.amber');
  await schritt('d ausnahme 2', { act: 'ausn-neu', v: 'frei' });
  await schritt('d ausnahme abbrechen', '.sheet .knopf.leise-k');
  await schritt('d heizplan 2', { act: 'sheet', s: 'heizplan' });
  await schritt('d heizplan arbeitszeit', '.sheet .knopf.amber');
  await schritt('d az', '.hz-raster .hz-kachel:nth-child(4)');
  await schritt('d az auf', '.sheet .az-name ~ button.zeile');
  await schritt('d az vorlage', '.sheet > .knopf:nth-of-type(2)');
  await schritt('d azn sa', '.sheet .zeile.azn:nth-of-type(8) .sw');   // Mo = 3. div (Griff, Raster davor)
  await schritt('d azn wie mo', '.sheet > button.zeile');
  await feld('d azn name', '.sheet .raster-2 .feld:nth-child(2) input', 'Winter');
  await feld('d azn mo bis', '.sheet .zeile.azn input[data-p="1"]', '17:00');
  await schritt('d azn speichern', '.sheet .knopf.amber');
  await schritt('d az 2', '.hz-raster .hz-kachel:nth-child(4)');
  await schritt('d az 2 auf', '.sheet .az-name ~ button.zeile');
  await schritt('d az bearbeiten', '.sheet .knopf.amber');
  await feld('d azn ab leer', '.sheet .raster-2 .feld:nth-child(1) input', '');
  await schritt('d azn speichern leer', '.sheet .knopf.amber');
  await schritt('d azn abbrechen', '.sheet .knopf.leise-k');
  await schritt('d az 3', '.hz-raster .hz-kachel:nth-child(4)');
  await schritt('d az 3 auf', '.sheet .az-name ~ button.zeile');
  await schritt('d az löschen', '.sheet .knopf.rot');
  // Einstellungen (Stufe 3e): je Gruppe die Bedienung; Knöpfe über ihren Text (trifft alten und neuen Stand)
  const text = async (name, sel, t) => { const ab = befehle.length, x = [...panel.shadowRoot.querySelectorAll(sel)].find(y => y.textContent.includes(t));
    if (x) x.dispatchEvent(new MouseEvent('click', { bubbles: true, composed: true })); else aus[`fehlt ${sel} „${t}“`] = { html: '', befehle: [] };
    await ruhe(); aus[name] = { html: ui.innerHTML, befehle: befehle.slice(ab) }; };
  const gruppe = async g => schritt(`e3 ${g}`, `.ev-nav button:nth-child(${['baustelle', 'heizung', 'notprogramm', 'container', 'geraete', 'pumpen', 'strom', 'firmen', 'meldungen', 'bericht', 'app'].indexOf(g) + 1})`);
  const zu = async n => schritt(`${n} zu`, { act: 'zu' });
  await schritt('e3', { act: 'tab', v: 'einst' });
  await gruppe('baustelle'); await text('e3 name', '.ev-inhalt button.zeile', 'Name'); await zu('e3 name'); await text('e3 wetter', '.ev-inhalt button.zeile', 'Regenmenge'); await zu('e3 wetter');
  await text('e3 abschliessen', '.ev-inhalt button.zeile', 'abschließen'); await zu('e3 abschliessen');
  await gruppe('heizung'); await schritt('e3 automatik', '.ev-inhalt .liste .sw'); await schritt('e3 automatik 2', '.ev-inhalt .liste .sw');
  await text('e3 az', '.ev-inhalt button.zeile', 'Arbeitszeit'); await zu('e3 az');
  await gruppe('container'); await text('e3 bereich', '.ev-inhalt button.zeile', 'Poliercontainer'); await zu('e3 bereich'); await text('e3 neu', '.ev-inhalt button.zeile', 'Container oder Schacht'); await zu('e3 neu');
  await gruppe('geraete');
  await gruppe('pumpen'); await schritt('e3 pumpen +', '.ev-inhalt .stepper button:nth-child(3)'); await schritt('e3 pumpen auto', '.ev-inhalt .liste .sw');
  await gruppe('strom'); await text('e3 preis neu', '.ev-inhalt button.zeile', 'Neuer Preis'); await zu('e3 preis neu');
  await text('e3 anschluss', '.ev-inhalt button.zeile', 'Anschluss hinzufügen'); await zu('e3 anschluss'); await text('e3 prio', '.ev-inhalt .seg button', 'hoch');
  await schritt('e3 nutzbar', '.ev-inhalt .stepper button:nth-child(3)'); await schritt('e3 staffel', '.ev-inhalt .liste > .zeile .sw'); await schritt('e3 staffel 2', '.ev-inhalt .liste > .zeile .sw');
  await gruppe('firmen'); await text('e3 firma', '.ev-inhalt button.zeile', 'Firma hinzufügen'); await zu('e3 firma');
  await gruppe('meldungen'); await schritt('e3 knöpfe', '.ev-inhalt .liste .sw'); await text('e3 test', '.ev-inhalt button.zeile', 'Test-Nachricht'); await schritt('e3 kalt', '.ev-inhalt .stepper button:nth-child(3)');
  await text('e3 beispiele', '.ev-inhalt button.zeile', 'Beispiele ansehen'); await zu('e3 beispiele');
  await gruppe('bericht'); await text('e3 bericht woche', '.ev-inhalt .seg button', 'Woche'); await schritt('e3 bericht handy', '.ev-inhalt .zeile.unter .sw');
  await text('e3 bericht senden', '.ev-inhalt button.zeile', 'Jetzt senden');
  await feld('e3 mail', '.ev-inhalt input[type="email"]', 'bau@example.org', 'change');
  await gruppe('app'); await schritt('e3 erklär', '.ev-inhalt .liste .sw'); await schritt('e3 erklär 2', '.ev-inhalt .liste .sw'); await text('e3 vorlage', '.ev-inhalt button.zeile', 'Vorschlag');
  await schritt('e3 dev', { act: 'ev-gruppe', v: 'dev' }); await text('e3 dev werkzeuge', '.ev-dev-reiter button', 'Werkzeuge'); await text('e3 dev meldungen', '.ev-dev-reiter button', 'Meldungen');
  await schritt('e3 über', { act: 'ev-gruppe', v: 'ueber' });
  // Dialoge rund um die Baustelle (Stufe 3e): Name, Neue Baustelle, Beginn/Ende, Wetter, Abschließen, Urlaub, Bericht,
  // Nachrichten, Strompreis, Löschen, Baustelle bearbeiten
  const auswahl = async (name, sel, wert) => feld(name, sel, wert, 'change');
  await schritt('b', { act: 'tab', v: 'einst' }); await schritt('b gruppe', { act: 'ev-gruppe', v: 'baustelle' });
  await text('b name', '.ev-inhalt button.zeile', 'Name'); await feld('b name leer', '.sheet .feld input', '  '); await schritt('b name speichern leer', '.sheet .knopf.amber');
  await feld('b name tippen', '.sheet .feld input', 'ÖWG Dobl Neu'); await schritt('b name speichern', '.sheet .knopf.amber');
  await text('b neu', '.ev-inhalt button.zeile', 'Neue Baustelle'); await feld('b neu tippen', '.sheet .feld input', 'Test'); await zu('b neu');
  await text('b zeitraum', '.ev-inhalt button.zeile', 'Beginn und Ende'); await feld('b zeitraum beginn', '.sheet .raster-2 .feld:nth-child(1) input', '2026-09-01');
  await auswahl('b zeitraum hp', '.sheet select', '11'); await schritt('b zeitraum speichern', '.sheet .knopf.amber');
  await text('b zeitraum 2', '.ev-inhalt button.zeile', 'Heizperiode'); await feld('b zeitraum ende früh', '.sheet .raster-2 .feld:nth-child(2) input', '2020-01-01'); await schritt('b zeitraum falsch', '.sheet .knopf.amber'); await zu('b zeitraum 2');
  await text('b wetter', '.ev-inhalt button.zeile', 'Wetter'); await auswahl('b wetter wahl', '.sheet select', ''); await schritt('b wetter speichern', '.sheet .knopf.amber');
  await text('b abschliessen', '.ev-inhalt button.zeile', 'abschließen'); await schritt('b abschliessen abbrechen', '.sheet .knopf.leise-k');
  await schritt('b bericht g', { act: 'ev-gruppe', v: 'bericht' }); await text('b bericht', '.ev-inhalt button.zeile', 'Beispiel ansehen'); await zu('b bericht');
  await schritt('b nachrichten g', { act: 'ev-gruppe', v: 'meldungen' }); await text('b nachrichten', '.ev-inhalt button.zeile', 'Beispiele ansehen');
  await wenn('b nachrichten knopf', '.sheet .noti-knoepfe button'); await schritt('b nachrichten zu', '.sheet .knopf.leise-k');
  await schritt('b strom g', { act: 'ev-gruppe', v: 'strom' }); await text('b preis', '.ev-inhalt button.zeile', 'Neuer Preis'); await feld('b preis tippen', '.sheet .feld:nth-of-type(2) input', '0,29');
  await schritt('b preis speichern', '.sheet .knopf.amber'); await text('b preis 2', '.ev-inhalt button.zeile', 'Neuer Preis'); await feld('b preis falsch', '.sheet .feld:nth-of-type(2) input', 'x'); await schritt('b preis speichern falsch', '.sheet .knopf.amber'); await schritt('b preis abbrechen', '.sheet .knopf.leise-k');
  await wenn('b preis weg', '.ev-inhalt .sp-zeile .x');
  await schritt('b urlaub', { act: 'sheet', s: 'urlaub' }); await feld('b urlaub name', '.sheet .feld input', 'Ferien'); await feld('b urlaub bis', '.sheet .raster-2 .feld:nth-child(2) input', '2026-10-01');
  await schritt('b urlaub falsch', '.sheet .knopf.amber'); await feld('b urlaub bis 2', '.sheet .raster-2 .feld:nth-child(2) input', '2026-10-20'); await schritt('b urlaub eintragen', '.sheet .knopf.amber');
  const andere = panel.alle.find(x => x.entry !== panel.d.entry);
  if (andere) { await schritt('b löschen', { act: 'sheet', s: 'bs-loeschen', id: andere.entry }); await schritt('b löschen abbrechen', '.sheet .knopf.leise-k'); }
  await schritt('b löschen weg', { act: 'sheet', s: 'bs-loeschen', id: 'gibt-es-nicht' }); await zu('b löschen weg');
  await schritt('b bearbeiten', { act: 'bs-bearbeiten', id: panel.d.entry }); await text('b bearbeiten firma', '.sheet button.zeile', 'Firma hinzufügen'); await zu('b bearbeiten firma');
  await schritt('b bearbeiten 2', { act: 'bs-bearbeiten', id: panel.d.entry }); await text('b bearbeiten container', '.sheet button.zeile', 'Poliercontainer'); await zu('b bearbeiten container');
  await schritt('b bearbeiten 3', { act: 'bs-bearbeiten', id: panel.d.entry }); await text('b bearbeiten preis', '.sheet button.zeile', 'Neuer Preis'); await zu('b bearbeiten preis');
  await schritt('b bearbeiten 4', { act: 'bs-bearbeiten', id: panel.d.entry }); await text('b bearbeiten alle', '.sheet button.zeile', 'Alle Einstellungen');
  await schritt('b bearbeiten 5', { act: 'bs-bearbeiten', id: panel.d.entry }); await schritt('b bearbeiten fertig', '.sheet .knopf.amber');
  // Dialoge für Container und Geräte (Stufe 3e): Firma, Anschluss, Container neu, Bearbeiten, Aussehen, Gerät
  const alleSel = async (name, sel, i) => { const x = panel.shadowRoot.querySelectorAll(sel)[i], ab = befehle.length; if (x) x.dispatchEvent(new MouseEvent('click', { bubbles: true, composed: true })); else aus[`fehlt ${sel}[${i}]`] = { html: '', befehle: [] }; await ruhe(); aus[name] = { html: ui.innerHTML, befehle: befehle.slice(ab) }; };
  await schritt('g', { act: 'tab', v: 'einst' }); await schritt('g firmen', { act: 'ev-gruppe', v: 'firmen' });
  await text('g firma', '.ev-inhalt button.zeile', 'Firma hinzufügen'); await feld('g firma name', '.sheet .feld input', 'Trockenbau Maier');
  await alleSel('g firma c', '.sheet .zeile .sw', 0); await text('g firma neu', '.sheet button.zeile', 'Neuer Container'); await feld('g firma neu name', '.sheet .fc-neu input', 'Lager Ost');
  await text('g firma neu art', '.sheet .fc-neu .seg button', 'Schacht'); await text('g firma neu 2', '.sheet button.zeile', 'Neuer Container'); await alleSel('g firma neu weg', '.sheet .fc-neu .x', 1);
  await schritt('g firma speichern', '.sheet .knopf.amber');
  await text('g firma eigen', '.ev-inhalt button.zeile', 'eigene'); await zu('g firma eigen');
  await text('g firma leer', '.ev-inhalt button.zeile', 'Firma hinzufügen'); await schritt('g firma leer speichern', '.sheet .knopf.amber'); await zu('g firma leer');
  await schritt('g strom', { act: 'ev-gruppe', v: 'strom' }); await text('g an', '.ev-inhalt button.zeile', 'Anschluss hinzufügen'); await feld('g an name', '.sheet .feld input', 'Verteiler West');
  await text('g an 63', '.sheet .seg button', '63 A'); await text('g an schuko', '.sheet .seg button', 'Schuko'); await schritt('g an res', '.sheet .stepper button:nth-child(3)'); await alleSel('g an c', '.sheet .zeile .sw', 0);
  await schritt('g an speichern', '.sheet .knopf.amber');
  await alleSel('g an alt', '.ev-inhalt button.zeile.unter', 0); await wenn('g an löschen', '.sheet .knopf.rot'); await wenn('g an alt zu', '.sheet .knopf.leise-k');
  await schritt('g cont', { act: 'ev-gruppe', v: 'container' }); await text('g neu', '.ev-inhalt button.zeile', 'Container oder Schacht'); await feld('g neu name', '.sheet .feld input', 'Lager Nord');
  await text('g neu schacht', '.sheet .seg button', 'Pumpenschacht'); await text('g neu container', '.sheet .seg button', 'Container');
  { const sel = panel.shadowRoot.querySelectorAll('.sheet label.feld select')[1], wert = sel && sel.options[1] ? sel.options[1].value : '';
    await feld('g neu shelly', '.sheet label.feld:nth-of-type(3) select', wert, 'change'); }
  await wenn('g neu typ da', '.sheet label.feld:nth-of-type(4) select'); await feld('g neu typ', '.sheet label.feld:nth-of-type(4) select', 'Konvektor', 'change'); await schritt('g neu anlegen', '.sheet .knopf.amber');
  await text('g b', '.ev-inhalt button.zeile', 'Poliercontainer'); await feld('g b name', '.sheet > .feld input', 'Polier');
  await wenn('g b zusatz', '.sheet > .zeile .sw'); await text('g b doppel', '.sheet .seg button', 'Doppel'); await text('g b m2', '.sheet .seg button', 'm²'); await feld('g b m2 wert', '.sheet input[type="number"]', '18');
  await feld('g b tür', '.sheet .feld:nth-last-of-type(3) select', '', 'change'); await feld('g b firma', '.sheet .feld:nth-last-of-type(1) select', 'eigen', 'change');
  await feld('g b gerät name', '.sheet .ge-zeile input', 'Radiator A'); await alleSel('g b gerät weg', '.sheet .ge-zeile .x', 0); await alleSel('g b gerät zurück', '.sheet .ge-zeile.weg .chip', 0);
  await text('g b gerät neu', '.sheet button.zeile', 'Gerät hinzufügen'); await alleSel('g b gerät neu weg', '.sheet .ge-zeile .x', 2);
  await schritt('g b speichern', '.sheet .knopf.amber');
  await text('g b2', '.ev-inhalt button.zeile', 'Polier'); await schritt('g aussehen', '.sheet .sym-zeile');
  await schritt('g sym doppel', '.sheet .liste .zeile .sw'); await alleSel('g sym farbe', '.sheet .sym-farbe', 2); await alleSel('g sym rahmen', '.sheet .sym-farben .knopf', 0); await alleSel('g sym rahmen 2', '.sheet .sym-farben:last-of-type .sym-farbe', 1);
  await text('g sym tür neu', '.sheet button.zeile', '+ Tür'); await text('g sym seite', '.sheet .seg button', 'Seite'); await text('g sym rechts', '.sheet .seg button', 'rechts');
  await alleSel('g sym tür weg', '.sheet .knopf.klein[aria-label="entfernen"]', 0); await feld('g sym sensor', '.sheet label.zeile.unter select', '', 'change');
  await feld('g sym farbe eigen', '.sheet input[type="color"]', '#123456', 'change'); await wenn('g sym standard', '.sheet > .knopf:not(.leise-k):not(.amber)'); await schritt('g sym fertig', '.sheet > .knopf:last-child');
  await text('g b3', '.ev-inhalt button.zeile', 'Polier'); await schritt('g gerät', '.sheet .ge-zeile .bs-ic'); await feld('g gerät name', '.sheet > .feld input', 'Radiator B');
  await feld('g gerät typ', '.sheet .raster-2 .feld:nth-child(1) select', 'Konvektor', 'change'); await schritt('g gerät aktiv', '.sheet > .zeile .sw'); await wenn('g gerät kw', '.sheet .stepper button:nth-child(3)');
  await schritt('g gerät speichern', '.sheet .knopf.amber');
  // Notprogramm (Stufe 3e, zuletzt): Gruppe und Einzelheiten je Plug
  await schritt('n', { act: 'tab', v: 'einst' }); await schritt('n gruppe', { act: 'ev-gruppe', v: 'notprogramm' });
  await alleSel('n plug', '.ev-inhalt .liste:nth-of-type(3) button.zeile', 0);
  await wenn('n probe 60', '.sheet .seg button:nth-child(2)'); await wenn('n probe ende', '.sheet .knopf.klein');
  await text('n prüfen sheet', '.sheet > .knopf', 'Jetzt prüfen'); await schritt('n plug zu', '.sheet > .knopf:last-child');
  await text('n prüfen', '.ev-inhalt button.zeile', 'Jetzt prüfen'); await alleSel('n taste', '.ev-inhalt .liste .zeile .sw', 1); await alleSel('n taste 2', '.ev-inhalt .liste .zeile .sw', 1);
  await alleSel('n aus', '.ev-inhalt .liste .zeile .sw', 0); await alleSel('n an', '.ev-inhalt .liste .zeile .sw', 0);
  // Übersicht (Stufe 3f): Kopf, Chips, Raster
  await schritt('u', { act: 'tab', v: 'uebersicht' });
  await schritt('u baustellen', '.seite .glas-kopf .klickbar'); await zu('u baustellen');
  await wenn('u strom', '.seite .strom-knopf'); await zu('u strom');
  await schritt('u wetter', '.seite .kopf-wetter'); await zu('u wetter');
  await schritt('u kw', '.seite .kw-knopf'); await zu('u kw');
  await schritt('u status', '.seite .chip-status'); await zu('u status');
  await wenn('u warnungen', '.seite .warn-chip'); await zu('u warnungen');
  await schritt('u automatik', '.seite .auto-chip'); await schritt('u automatik 2', '.seite .auto-chip');
  await wenn('u bedarf', '.seite .glas-k .bedarf-knopf'); await zu('u bedarf');
  await schritt('u neu', '.seite .glas-k.neu'); await zu('u neu');
  await schritt('u karte', '.seite .glas-raster .glas-k:nth-child(1)'); await schritt('u zurück', { act: 'tab', v: 'uebersicht' });
  // Meine Kacheln (Stufe 3f): Raster, Antippen, Layout, Katalog
  await schritt('k', { act: 'tab', v: 'uebersicht' });
  for (let n = 0; n < 4; n++) { await alleSel(`k auf ${n}`, '.kk-bereich .aw-frei-s .kk', n); await schritt(`k auf ${n} zurück`, { act: 'tab', v: 'uebersicht' }); await zu(`k auf ${n} zu`); }
  await text('k layout', '.kk-bereich .kk-knoepfe button', 'Anpassen'); await wenn('k dia', '.kk-bereich .aw-dia-k'); await wenn('k dia 2', '.kk-bereich .aw-dia-k');
  await wenn('k art', '.kk-bereich .aw-art-k'); await alleSel('k weg', '.kk-bereich .aw-x', 0); await text('k fertig', '.kk-bereich .kk-knoepfe button', 'Fertig');
  await text('k plus', '.kk-bereich .kk-knoepfe button', 'Kachel'); await feld('k suche', '.sheet input[type="search"]', 'temp');
  await feld('k suche leer', '.sheet input[type="search"]', ''); await text('k filter', '.sheet .kk-chip', 'Container'); await text('k je', '.sheet .kk-chip', 'je Container');
  await text('k filter alle', '.sheet .kk-chip', 'Alle'); await text('k je aus', '.sheet .kk-chip', 'je Container'); await text('k eur', '.sheet .kk-chip', '€'); await text('k eur aus', '.sheet .kk-chip', '€');
  await feld('k suche temp', '.sheet input[type="search"]', 'Temperatur'); await alleSel('k wahl', '.sheet .kk-tr-zeile', 1); await alleSel('k wahl id', '.sheet .kk-wahl .vb-wer button', 1); await text('k wahl L', '.sheet .kk-wahl .seg button', 'Groß');
  await wenn('k wahl dia', '.sheet .kk-wahl .sw'); await alleSel('k gk', '.sheet .kk-tr-gr button', 0); await schritt('k hinzu', '.sheet .kk-wahl .knopf.amber');
  await text('k plus 2', '.kk-bereich button', 'Kachel'); await feld('k suche vg', '.sheet input[type="search"]', 'gegenüber'); await alleSel('k vg', '.sheet .kk-tr-zeile', 1);
  await alleSel('k vg id', '.sheet .vg-chips button', 2); await alleSel('k vg id weg', '.sheet .vg-chips button', 0); await alleSel('k vg id weg 2', '.sheet .vg-chips button', 1);
  await text('k vg woche', '.sheet .kk-wahl .seg button', 'diese Woche'); await text('k vg L', '.sheet .kk-wahl .seg button', 'Groß'); await text('k vg linien', '.sheet .kk-wahl .seg button', 'Linien');
  await schritt('k vg hinzu', '.sheet .kk-wahl .knopf.amber');
  await text('k plus 3', '.kk-bereich button', 'Kachel'); await feld('k suche preis', '.sheet input[type="search"]', 'Preis'); await alleSel('k preis', '.sheet .kk-tr-zeile', 0); await text('k preis M', '.sheet .kk-wahl .seg button', 'Mittel');
  await schritt('k preis hinzu', '.sheet .kk-wahl .knopf.amber'); await wenn('k sim +', '.kk-bereich .sp-sim button:nth-child(3)'); await wenn('k sim −', '.kk-bereich .sp-sim button:nth-child(1)');
  await text('k plus 4', '.kk-bereich button', 'Kachel'); await schritt('k katalog zu', '.sheet > .kk-kat > .knopf');
  // Einblendungen der Übersicht (Stufe 3f): Verbrauch, Wetter, Warnungen, Baustellen, Strom
  await schritt('e2', { act: 'tab', v: 'uebersicht' });
  await schritt('e2 vb', '.seite .kw-knopf'); await text('e2 vb woche', '.sheet > .seg button', 'Woche'); await text('e2 vb firma', '.sheet .vb-gruppe button', 'Firma');
  await text('e2 vb teil', '.sheet .vb-gruppe button', 'Container'); await text('e2 vb alle', '.sheet .vb-wer button', 'Alle gestapelt'); await alleSel('e2 vb eins', '.sheet .vb-wer button', 2);
  await text('e2 vb summe', '.sheet .vb-wer button', 'Summe'); await schritt('e2 vb früher', '.sheet .zr-nav .zr-pf:first-child'); await zu('e2 vb');
  await schritt('e2 c', '.seite .glas-raster .glas-k:nth-child(1)'); await schritt('e2 kachel vb', '.c-kacheln .c-kachel:nth-child(2)');
  await wenn('e2 ohne typ', '.sheet .vb-gruppe:last-of-type .seg button:nth-child(2)'); await zu('e2 kachel vb'); await schritt('e2 ü', { act: 'tab', v: 'uebersicht' });
  await schritt('e2 wetter', '.seite .kopf-wetter'); await text('e2 wetter tag', '.sheet > .seg button', 'Tag'); await alleSel('e2 wetter 3', '.sheet > .seg button', 2); await zu('e2 wetter');
  await wenn('e2 warn', '.seite .warn-chip'); await wenn('e2 warn stumm', '.sheet .wk-knoepfe .chip:last-child'); await wenn('e2 warn stumm 2', '.sheet .wk-knoepfe .chip:last-child');
  await wenn('e2 warn prot', '.sheet button.zeile'); await schritt('e2 ü2', { act: 'tab', v: 'uebersicht' });
  await wenn('e2 warn 2', '.seite .warn-chip'); await wenn('e2 warn hin', '.sheet .wk-knoepfe .chip:first-child'); await schritt('e2 ü3', { act: 'tab', v: 'uebersicht' });
  await schritt('e2 bs', '.seite .glas-kopf .klickbar'); await alleSel('e2 bs edit', '.sheet .bs-ic', 0); await zu('e2 bs edit');
  await schritt('e2 bs 2', '.seite .glas-kopf .klickbar'); await alleSel('e2 bs weg', '.sheet .bs-zeile .x', 1); await zu('e2 bs weg');
  await schritt('e2 bs 3', '.seite .glas-kopf .klickbar'); await wenn('e2 bs neu', '.sheet > button.zeile'); await zu('e2 bs neu');
  await schritt('e2 bs 4', '.seite .glas-kopf .klickbar'); await alleSel('e2 bs wahl', '.sheet .bs-wahl', 1); await schritt('e2 bs zurück', { act: 'bs-wahl', id: panel.d.entry });
  await schritt('e2 bs 5', '.seite .glas-kopf .klickbar'); await alleSel('e2 bs wahl selbst', '.sheet .bs-wahl', 0);
  await wenn('e2 strom', '.seite .strom-knopf'); await alleSel('e2 strom rang', '.sheet .sr-zeile', 0); await alleSel('e2 strom rang 2', '.sheet .sr-zeile', 0);
  await text('e2 strom einst', '.sheet .knopf', 'Anschlüsse'); await schritt('e2 ü4', { act: 'tab', v: 'uebersicht' });
  // Auswertung (Stufe 3f): Leiste, Zeitraum, Scope, Preis, Anpassen, Layout, Bausteine, Detail
  await schritt('a', { act: 'tab', v: 'auswertung' });
  for (const z of ['Woche', 'Jahr', 'Tag', 'Monat']) await text(`a ${z}`, '.aw-leiste .seg:first-child button', z);
  await schritt('a früher', '.seite .zr-nav .zr-pf:first-child'); await schritt('a kalender', '.seite .zr-auf'); await schritt('a kalender zu', '.seite .zr-kal-fuss .chip');
  await text('a alle', '.aw-leiste .seg:nth-child(2) button', 'Alle laufenden'); await text('a diese', '.aw-leiste .seg:nth-child(2) button', 'Diese Baustelle');
  await text('a sim', '.aw-knoepfe button', 'Preis'); await alleSel('a sim +', '.sp-band .sp-sim button', 1); await alleSel('a sim −', '.sp-band .sp-sim button', 0); await schritt('a sim zurück', '.sp-band .rv-link');
  await text('a firma', '.seite .seg.klein button', 'Firma'); await text('a container', '.seite .seg.klein button', 'Container');
  for (const n of [0, 1, 2, 3, 4, 5]) { await alleSel(`a detail ${n}`, '.seite .aw-k, .seite .aw-karte', n); await zu(`a detail ${n}`); await schritt(`a detail ${n} tab`, { act: 'tab', v: 'auswertung' }); }
  await alleSel('a link', '.seite .aw-inhalt button.zeile', 0); await zu('a link'); await schritt('a link tab', { act: 'tab', v: 'auswertung' });
  await text('a anpassen', '.aw-knoepfe button', 'Anpassen'); await alleSel('a vorlage', '.aw-vorlagen-k button', 0); await alleSel('a runter', '.aw-wahl .aw-wahl-k button[aria-label="nach unten"]', 0);
  await alleSel('a hoch', '.aw-wahl .aw-wahl-k button[aria-label="nach oben"]', 2); await alleSel('a stufe', '.aw-wahl .aw-wahl-k .seg button', 1); await alleSel('a an', '.aw-wahl .aw-wahl-k .sw', 3);
  await alleSel('a an 2', '.aw-wahl .aw-wahl-k .sw', 3); await text('a misch', '.aw-wahl button.zeile', 'Vorschlag'); await text('a anpassen fertig', '.aw-knoepfe button', 'Fertig');
  await text('a layout', '.aw-knoepfe button', 'Layout'); await wenn('a layout dia', '.seite .aw-dia-k'); await alleSel('a layout weg', '.seite .aw-x', 0); await text('a layout fertig', '.aw-knoepfe button', 'Fertig');
  await text('a plus', '.aw-knoepfe button', 'Kachel'); await zu('a plus');
  await alleSel('a temp', '.seite .aw-inhalt .seg button', 1); await alleSel('a temp 2', '.seite .aw-inhalt .seg button', 2);
  await schritt('tab uebersicht 3', { act: 'tab', v: 'uebersicht' });
  await schritt('automatik', { act: 'auto' });
  // Nicht-Admin (Bauplan 0.7 §8): gesperrte Schalter senden nichts, Vor-Ort-Aktionen schon
  for (const b of STRUKTUR) b.rechte = { aendern: false, aktionen: ['gefuehl', 'warnung_stumm', 'jetzt_heizen', 'boost', 'bedarf', 'bedarf_aus'] };
  panel.cache = {}; await panel._laden(); await schritt('nur-lesen start');
  await schritt('nur-lesen automatik', { act: 'auto' });
  await schritt('nur-lesen u auto', '.seite .auto-chip'); await wenn('nur-lesen u bedarf', '.seite .glas-k .bedarf-knopf'); await zu('nur-lesen u bedarf');
  await schritt('nur-lesen warnungen', { act: 'sheet', s: 'warnungen' });
  const w = panel.d.warnungen[0]; if (w) await schritt('nur-lesen warnung stumm', { act: 'w-stumm', id: w.id });
  await schritt('nur-lesen zu', { act: 'zu' });
  await schritt('nur-lesen einst', { act: 'tab', v: 'einst' });
  for (const g of ['heizung', 'container', 'geraete']) await schritt(`nur-lesen einst ${g}`, { act: 'ev-gruppe', v: g });
  await schritt('nur-lesen pumpen', { act: 'tab', v: 'pumpen' });
  await schritt('nur-lesen pumpen stepper', '.seite .stepper button:nth-child(3)');
  await schritt('nur-lesen schacht', '.seite .block-kopf .chip');
  await schritt('nur-lesen schacht automatik', '.seite .liste .zeile .sw');
  if (mitF) { await schritt('nur-lesen c', { act: 'container', id: mitF.id });
    await schritt('nur-lesen c gerät bearbeiten', '.c-chip .bs-ic'); await schritt('nur-lesen c boost', '.ck-d .ck-chip.ck-boost');
    await schritt('nur-lesen c modus auf', '.ck-d .ck-chip.modus');
    await schritt('nur-lesen c modus', '.ck-modi button:nth-child(4)'); await schritt('nur-lesen c gefühl', '.ck-gefuehl button:nth-child(1)'); }
  if (bed) { await schritt('nur-lesen c bedarf', { act: 'container', id: bed.id });
    await schritt('nur-lesen c bedarf termin neu', '.seite .block .zeile .blau'); await schritt('nur-lesen c bedarf 1 h', '.bedarf-dauer .chip:nth-child(1)');
    if (panel.shadowRoot.querySelector('.ereignis .x')) await schritt('nur-lesen c termin weg', '.ereignis .x'); }
  await schritt('nur-lesen h', { act: 'tab', v: 'heizung' }); await schritt('nur-lesen az', '.hz-raster .hz-kachel:nth-child(4)');
  await schritt('nur-lesen az auf', '.sheet .az-name ~ button.zeile'); await schritt('nur-lesen az bearbeiten', '.sheet .knopf.amber'); await schritt('nur-lesen az löschen', '.sheet .knopf.rot');
  await schritt('nur-lesen heizplan', { act: 'sheet', s: 'heizplan' }); await schritt('nur-lesen heizplan jetzt', '.sheet .bedarf-dauer .chip:nth-child(1)');
  await schritt('nur-lesen e3', { act: 'tab', v: 'einst' }); await schritt('nur-lesen e3 strom', { act: 'ev-gruppe', v: 'strom' });
  await text('nur-lesen e3 preis neu', '.ev-inhalt button.zeile', 'Neuer Preis'); await schritt('nur-lesen e3 staffel', '.ev-inhalt .liste > .zeile .sw');
  await schritt('nur-lesen e3 bericht', { act: 'ev-gruppe', v: 'bericht' }); await feld('nur-lesen e3 mail', '.ev-inhalt input[type="email"]', 'x@example.org', 'change');
  await schritt('nur-lesen b bearbeiten', { act: 'bs-bearbeiten', id: panel.d.entry }); await text('nur-lesen b bearbeiten name', '.sheet button.zeile', 'Name'); await zu('nur-lesen b bearbeiten');
  await schritt('nur-lesen b nachrichten', { act: 'sheet', s: 'nachrichten' }); await zu('nur-lesen b nachrichten');
  await schritt('nur-lesen g', { act: 'ev-gruppe', v: 'container' }); await text('nur-lesen g b', '.ev-inhalt button.zeile', 'Polier'); await schritt('nur-lesen g b speichern', '.sheet .knopf.amber');
  await wenn('nur-lesen g b gerät', '.sheet .ge-zeile .bs-ic'); await zu('nur-lesen g b');
  await schritt('nur-lesen a', { act: 'tab', v: 'auswertung' }); await text('nur-lesen a layout', '.aw-knoepfe button', 'Layout'); await alleSel('nur-lesen a weg', '.seite .aw-x', 0); await text('nur-lesen a fertig', '.aw-knoepfe button', 'Fertig');
  await schritt('nur-lesen a einst', { act: 'tab', v: 'einst' });
  await schritt('nur-lesen n', { act: 'ev-gruppe', v: 'notprogramm' }); await alleSel('nur-lesen n an', '.ev-inhalt .liste .zeile .sw', 0);
  await alleSel('nur-lesen n plug', '.ev-inhalt .liste:nth-of-type(3) button.zeile', 0); await wenn('nur-lesen n probe', '.sheet .seg button:nth-child(2)'); await zu('nur-lesen n plug');
  aus.toast = { html: panel.letzterToast || '', befehle: [] };
  fs.writeFileSync(ziel, JSON.stringify(aus));
  console.log(`Schnappschuss: ${Object.keys(aus).length} Schritte, ${befehle.length} Befehle → ${ziel}`);
  process.exit(0);
})().catch(err => { console.error(err); process.exit(1); });
