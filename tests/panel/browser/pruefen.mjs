// Browser-Test der Seite „Baustelle“ (BSM-022 Stufe 0b.1, docs/bauplan-lit.md §6): das Master-Mockup (echtes Bundle mit
// Beispieldaten) in Chromium 136 über puppeteer-core, Bedienung nur über den Browser (Klick, Tastatur, Mausrad).
// Keine Verbindung zu Home Assistant: ein lokaler HTTP-Server liefert nur mockups/glas.html.
//   node tests/panel/browser/pruefen.mjs [--bericht datei.json] [--bilder ordner]
//   Chromium: CHROME_PFAD oder /usr/bin/chromium; puppeteer-core aus custom_components/baustelle/frontend/node_modules.
// B1–B7 halten den Stand vor Lit fest. Was heute bekanntermaßen versagt, steht in BEKANNT (wird gemeldet, nicht rot);
// jeder andere Fehler macht den Lauf rot.
import { createRequire } from 'node:module';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createServer } from 'node:http';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const FRONTEND = join(REPO, 'custom_components', 'baustelle', 'frontend');
const puppeteer = createRequire(join(FRONTEND, 'package.json'))('puppeteer-core');
const VERSION = JSON.parse(readFileSync(join(FRONTEND, 'version.json'), 'utf8')).version;
const arg = n => { const i = process.argv.indexOf(n); return i > 0 ? process.argv[i + 1] : null; };
const BILDER = arg('--bilder'), BERICHT = arg('--bericht');
const CHROME = process.env.CHROME_PFAD || ['/usr/bin/chromium', '/usr/bin/chromium-browser', '/usr/bin/google-chrome'].find(existsSync);
if (!CHROME) { console.error('Chromium nicht gefunden (CHROME_PFAD setzen)'); process.exit(2); }
if (BILDER) mkdirSync(BILDER, { recursive: true });

/* Heute bekannte Fehler (bauplan-lit §1) – werden in eigenen Stufen behoben und dann hier gestrichen */
const BEKANNT = {};   // B4 „Rest bleibt“ in 3d behoben (Container mit Lit)

const html = readFileSync(join(REPO, 'mockups', 'glas.html'));
const server = createServer((q, r) => { if (q.url === '/favicon.ico') { r.writeHead(204); r.end(); } else if (['/', '/glas.html'].includes(q.url.split('?')[0])) { r.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); r.end(html); } else { r.writeHead(404); r.end(); } });
await new Promise(r => server.listen(0, '127.0.0.1', r));
const URL_ = `http://127.0.0.1:${server.address().port}/`;

const D = '#desktop baustelle-panel', T = '#telefon baustelle-panel';
const ergebnisse = [], t0 = Date.now();
const warte = ms => new Promise(r => setTimeout(r, ms));

/* Vor dem Laden: Zähler für window-Listener und Intervalle; Himmel als CSS (Standard), mit WebGL oder mit Ausfall */
const vorbereitung = himmel => {
  window.__z = { listener: { paste: 0, 'location-changed': 0 }, intervalle: new Set() };
  const add = window.addEventListener, rem = window.removeEventListener;
  window.addEventListener = function (t, ...a) { if (t in window.__z.listener) window.__z.listener[t]++; return add.call(this, t, ...a); };
  window.removeEventListener = function (t, ...a) { if (t in window.__z.listener) window.__z.listener[t]--; return rem.call(this, t, ...a); };
  const si = window.setInterval, ci = window.clearInterval;
  window.setInterval = (...a) => { const id = si(...a); window.__z.intervalle.add(id); return id; };
  window.clearInterval = id => { window.__z.intervalle.delete(id); return ci(id); };
  if (himmel !== 'webgl') {
    const gc = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (art, ...a) {
      if (/webgl/.test(art)) { if (himmel === 'ausfall') throw new Error('WebGL-Ausfall (Test)'); return null; }
      return gc.call(this, art, ...a);
    };
  }
};

async function seite(browser, himmel = 'css') {
  const page = await browser.newPage(), fehler = [];
  await page.setViewport({ width: 1400, height: 1000 });
  page.on('pageerror', e => fehler.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') fehler.push('console: ' + m.text()); });
  await page.evaluateOnNewDocument(vorbereitung, himmel);
  await page.goto(URL_, { waitUntil: 'load' });   // kein networkidle: der Himmel läuft
  await page.waitForFunction(sel => { const p = document.querySelector(sel); return p && p.d && p.shadowRoot.querySelector('nav button[data-v]') && !p.shadowRoot.textContent.includes('Lädt …'); },
    { timeout: 30000 }, D);
  return { page, fehler };
}
// fn ist eine Pfeilfunktion ohne Parameter; sie sieht p (Element), sr (Shadow Root), BB (Testzugang des Mockups), a0, a1 …
const panel = (page, sel, fn, ...a) => page.evaluate((sel, quelle, ...a) => { const p = document.querySelector(sel);
  return new Function('p', 'sr', 'BB', ...a.map((_, i) => 'a' + i), `return (${quelle})();`)(p, p.shadowRoot, window.baustelleBeispiel, ...a); }, sel, String(fn), ...a);
const klick = async (page, sel) => { await page.waitForSelector(sel, { visible: true, timeout: 5000 }); await page.click(sel); await warte(120); };
const schreibAnzahl = (page, ab) => page.evaluate(ab => window.baustelleBeispiel.TEST.aufrufe.slice(ab).filter(m => ['baustelle/setzen', 'baustelle/aktion'].includes(m.type)).map(m => m.type + (m.aktion ? ':' + m.aktion : '')), ab);
const aufrufZahl = page => page.evaluate(() => window.baustelleBeispiel.TEST.aufrufe.length);
// Warten, bis die Scrollposition zur Ruhe kommt (der Scrollbereich bleibt seit 2b stehen, nichts bricht ab). Weiches Scrollen
// ist abgeschaltet (START); das Mausrad-Ereignis kommt trotzdem verzögert an – daher erst warten, dann dreimal denselben Wert
const ruhig = async (page, sel, innen, prop) => { await warte(400); let alt = null, gleich = 0;
  for (let i = 0; i < 40; i++) { const w = await page.evaluate((sel, innen, prop) => document.querySelector(sel).shadowRoot.querySelector(innen)[prop], sel, innen, prop);
    gleich = w === alt ? gleich + 1 : 0; if (gleich >= 2) return w; alt = w; await warte(120); } return alt; };
// Mausrad an der Mausposition drehen und warten, bis es angekommen ist: erst die Ruhelage, dann das Rad, dann warten, bis sich die
// Position geändert hat (unter Last kommt das Rad-Ereignis erst nach über einer Sekunde an – eine feste Wartezeit las
// dann noch die alte Position, BSM-035), dann wieder die Ruhelage. Kommt nichts an (Ende der Fläche), zählt die Ruhelage.
const rad = async (page, sel, innen, prop, delta) => { const vorher = await ruhig(page, sel, innen, prop);
  await page.mouse.wheel(delta);
  await page.waitForFunction((sel, innen, prop, vorher) => document.querySelector(sel).shadowRoot.querySelector(innen)[prop] !== vorher,
    { timeout: 10000, polling: 'raf' }, sel, innen, prop, vorher).catch(() => {});
  return ruhig(page, sel, innen, prop); };
const bild = async (page, name) => { if (BILDER) await page.screenshot({ path: join(BILDER, name + '.jpg'), type: 'jpeg', quality: 70, clip: { x: 0, y: 0, width: 1400, height: 1000 } }); };

async function fall(name, browser, ablauf, himmel) {
  const start = Date.now(), pruef = [];
  const erwarte = (text, ok, info = '') => pruef.push({ text, ok: !!ok, info });
  let s; const frisch = browser === 'frisch', b = frisch ? await puppeteer.launch(START) : browser;
  try { s = await seite(b, himmel); await ablauf(s.page, erwarte); }
  catch (e) { pruef.push({ text: 'Ablauf', ok: false, info: String(e && e.stack || e).split('\n').slice(0, 3).join(' | ') }); }
  if (s) { erwarte('keine Fehler im Browser', !s.fehler.length, s.fehler.slice(0, 3).join(' | ')); if (!frisch) await s.page.close().catch(() => {}); }
  if (frisch) await Promise.race([b.close(), warte(5000)]).catch(() => {}).finally(() => { try { b.process() && b.process().kill('SIGKILL'); } catch { /* schon weg */ } });
  const rot = pruef.filter(p => !p.ok);
  ergebnisse.push({ name, ok: !rot.length, ms: Date.now() - start, pruef });
  console.log(`${rot.length ? '✗' : '✓'} ${name} (${((Date.now() - start) / 1000).toFixed(1)} s)` + rot.map(p => `\n    ✗ ${p.text}${p.info ? ' – ' + p.info : ''}`).join(''));
}

// Jeder Fall bekommt einen frischen Browser: Chromium auf dem Pi hängt selten nach vielen Seiten in einem Prozess – so
// trifft ein Hänger höchstens einen Fall, und kein Zustand schleppt sich von Fall zu Fall
const START = { executablePath: CHROME, headless: true, protocolTimeout: 30000, args: ['--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage', '--lang=de-AT', '--disable-smooth-scrolling'] };   // Mausrad springt sofort (B3 sonst zufällig rot)
const browser = 'frisch';
const chromeVersion = await (async () => { const b = await puppeteer.launch(START); const v = await b.version(); await b.close(); return v; })();

/* B1 Start: Ladezustand endet, Ansicht und Version sichtbar */
await fall('B1 Start', browser, async (page, erwarte) => {
  const r = await panel(page, D, () => ({ version: p.version, tabs: sr.querySelectorAll('nav button[data-v]').length, himmel: !!p.himmel, phase: p.bg.dataset.phase,
    name: p.d && p.d.name, sichtbar: !!sr.querySelector('.seite') && sr.querySelector('.seite').getBoundingClientRect().height > 100 }));
  const leiste = await page.$eval('.bar b', e => e.textContent);
  erwarte('Ansicht sichtbar, Reiter da', r.sichtbar && r.tabs >= 5, JSON.stringify(r));
  erwarte(`Version ${VERSION} in Leiste und Seite`, leiste.includes(VERSION) && r.version === VERSION, `${leiste} / ${r.version}`);
  erwarte('CSS-Himmel (WebGL aus)', !r.himmel && !!r.phase);
  await bild(page, 'b1-start');
});

/* Start mit WebGL und mit erzwungenem Ausfall */
await fall('Start mit Ausfall des WebGL', browser, async (page, erwarte) => {
  const r = await panel(page, D, () => ({ himmel: !!p.himmel, phase: p.bg.dataset.phase, tabs: sr.querySelectorAll('nav button[data-v]').length }));
  erwarte('Seite läuft mit CSS-Himmel weiter', !r.himmel && r.phase && r.tabs >= 5, JSON.stringify(r));
}, 'ausfall');
if (process.env.BAUSTELLE_WEBGL !== '1') {
  console.log('– Start mit WebGL übersprungen: im Container auf dem Pi gibt es kein WebGL (läuft auf GitHub mit BAUSTELLE_WEBGL=1)');
  ergebnisse.push({ name: 'Start mit WebGL', ok: true, uebersprungen: true, ms: 0, pruef: [] });
} else {
  const gpu = await puppeteer.launch({ executablePath: CHROME, headless: true, protocolTimeout: 30000, args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-dev-shm-usage'] });
  await fall('Start mit WebGL', gpu, async (page, erwarte) => {
    await warte(500);
    const r = await panel(page, D, () => ({ himmel: !!p.himmel, canvas: !!sr.querySelector('canvas.himmel') }));
    erwarte('WebGL-Himmel läuft', r.himmel && r.canvas, JSON.stringify(r));
    const bleibt = await panel(page, D, async () => { const cv = sr.querySelector('canvas.himmel'), h = p.himmel;
      BB.welt[0].baustelle.titel = 'Himmel bleibt'; await p._laden(); await p.neuZeichnen(); await new Promise(r => setTimeout(r, 200));
      return { canvas: sr.querySelector('canvas.himmel') === cv && cv.isConnected, himmel: p.himmel === h, neu: sr.querySelector('.ui').textContent.includes('Himmel bleibt') }; });
    erwarte('Canvas und Himmel bleiben beim Neuzeichnen (Stufe 1b)', bleibt.canvas && bleibt.himmel && bleibt.neu, JSON.stringify(bleibt));
  }, 'webgl');
  await gpu.close();
}

/* B2 Eingabeschutz: Melde-Text bleibt bei neuer Strukturantwort; nach dem Fokuswechsel sind die neuen Daten sichtbar */
await fall('B2 Eingabeschutz', browser, async (page, erwarte) => {
  await klick(page, `${D} >>> button.melden-knopf`);
  const ta = `${D} >>> textarea[name="ml-text"]`;
  await klick(page, ta); await page.keyboard.type('Heizung schaltet nicht');
  await bild(page, 'b2-eingabe');
  await page.keyboard.press('Home'); await page.keyboard.down('Shift'); for (let i = 0; i < 7; i++) await page.keyboard.press('ArrowRight'); await page.keyboard.up('Shift');
  const r = await panel(page, D, async () => {
    const ta = sr.querySelector('textarea[name="ml-text"]');
    BB.welt[0].baustelle.titel = 'Geänderte Baustelle B2'; await p._laden(); await new Promise(r => setTimeout(r, 100));
    const jetzt = sr.querySelector('textarea[name="ml-text"]');
    return { verarbeitet: p.roh[0].baustelle.titel, sofort: sr.querySelector('.ui').textContent.includes('Geänderte Baustelle B2'), gleich: jetzt === ta && ta.isConnected, text: ta.value, von: ta.selectionStart, bis: ta.selectionEnd, fokus: sr.activeElement === ta, wartet: !!p._wartet };
  });
  // ab 2a.2 ist das Melde-Feld ein Lit-Bereich: kein Aufschub mehr, die neuen Daten erscheinen sofort (vorher erst nach dem Fokuswechsel)
  erwarte('neue Strukturantwort verarbeitet und sofort sichtbar', r.verarbeitet === 'Geänderte Baustelle B2' && !r.wartet && r.sofort, JSON.stringify(r));
  erwarte('Text, Auswahl, Fokus und Knoten bleiben', r.gleich && r.text === 'Heizung schaltet nicht' && r.von === 0 && r.bis === 7 && r.fokus, JSON.stringify(r));
  await klick(page, `${D} >>> .sheet h3`);
  await warte(200);
  const n = await panel(page, D, () => ({ sichtbar: sr.querySelector('.ui').textContent.includes('Geänderte Baustelle B2'), text: (sr.querySelector('textarea[name="ml-text"]') || {}).value }));
  erwarte('nach dem Fokuswechsel neue Daten sichtbar, Entwurf bleibt', n.sichtbar && n.text === 'Heizung schaltet nicht', JSON.stringify(n));
});

/* B3 Scrollschutz: Hauptansicht, lange Einblendung, Chipleiste */
await fall('B3 Scrollschutz', browser, async (page, erwarte) => {
  const update = (sel, wert) => panel(page, sel, async () => { BB.welt[0].bereiche[0].name = a0; await p._laden(); await new Promise(r => setTimeout(r, 150)); return sr.querySelector('.ui').textContent.includes(a0); }, wert);
  // Hauptansicht (Desktop)
  await page.mouse.move(900, 600);
  const vor = await rad(page, D, '.scroll', 'scrollTop', { deltaY: 500 });
  const neu1 = await update(D, 'Polier-Container');
  const nach = await ruhig(page, D, '.scroll', 'scrollTop');
  erwarte('Hauptansicht: Position bleibt (±1 px)', vor > 50 && Math.abs(nach - vor) <= 1 && neu1, `vor ${vor}, nach ${nach}, verarbeitet ${neu1}`);
  // lange Einblendung: Warnungen
  await klick(page, `${D} >>> .warn-chip`); await warte(900);   // Einblendung fährt ein
  const sbox = await (await page.$(`${D} >>> .sheet.an`)).boundingBox();
  await page.mouse.move(sbox.x + sbox.width / 2, sbox.y + Math.min(sbox.height, 800) / 2); await warte(150);
  for (let i = 0; i < 3 && await ruhig(page, D, '.sheet', 'scrollTop') < 20; i++) await rad(page, D, '.sheet', 'scrollTop', { deltaY: 300 });
  const unter = await panel(page, D, () => { const t = sr.elementFromPoint(a0, a1); return t ? t.tagName + '.' + t.className : String(t); }, sbox.x + sbox.width / 2, sbox.y + Math.min(sbox.height, 800) / 2);
  const svor = await panel(page, D, () => ({ top: sr.querySelector('.sheet').scrollTop, hoch: sr.querySelector('.sheet').scrollHeight - sr.querySelector('.sheet').clientHeight }));
  const neu2 = await update(D, 'Polier-Contain3r');
  const snach = await ruhig(page, D, '.sheet', 'scrollTop');
  erwarte('Einblendung: Position bleibt (±1 px)', svor.top > 20 && Math.abs(snach - svor.top) <= 1 && neu2, `vor ${JSON.stringify(svor)}, nach ${snach}, verarbeitet ${neu2}, unter der Maus ${unter}, Kasten ${JSON.stringify(sbox)}`);
  await klick(page, `${D} >>> .schleier.an`);
  // Chipleiste der Einstellungen (Handy)
  await klick(page, `${T} >>> nav button[data-v="einst"]`);
  await klick(page, `${T} >>> .ev-chips [data-v="firmen"]`); await warte(200);
  const box = await (await page.$(`${T} >>> .ev-chips`)).boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  const cvor = await rad(page, T, '.ev-chips', 'scrollLeft', { deltaX: 30 });
  const neu3 = await update(T, 'Polier-Contain4r');
  const cnach = await ruhig(page, T, '.ev-chips', 'scrollLeft');
  erwarte('Chipleiste: Position bleibt (±1 px)', cvor > 0 && Math.abs(cnach - cvor) <= 1, `vor ${cvor}, nach ${cnach}, verarbeitet ${neu3}`);
});

/* B4 Container live: (1) neue 5-Minuten-Statistik → Kennzahlen neu, Position bleibt, Rest bleibt (seit 3d: dieselben Knoten,
   Lit zeichnet nur Geändertes);
   (2) neuer Sensorwert bei offener Einblendung → angekommen, aber Diagramm unverändert (heutige Unterdrückung) */
await fall('B4 Container live', browser, async (page, erwarte) => {
  await klick(page, `${D} >>> .glas-k[data-id="polier"]`); await warte(400);
  await page.mouse.move(900, 600); await rad(page, D, '.scroll', 'scrollTop', { deltaY: 200 });
  const merken = () => panel(page, D, () => { window.__rest = [sr.querySelector('.ck-d .ckd-name'), sr.querySelector('.ck-d .ck-chip.modus'), sr.querySelector('.gk-hk .c-power'), sr.querySelector('.c-live .seg button')]; window.__wrap = sr.querySelector('.c-live .chart-wrap');
    return { w: window.__wrap.innerHTML, k: sr.querySelector('.c-live-kennz').textContent, scroll: sr.querySelector('.scroll').scrollTop, lg: p._liveGezeichnet || 0 }; });
  const zustand = (statistik) => panel(page, D, () => {
    if (a0) BB.TEST.statistik = (m, r) => { if (m.period !== '5minute') return r; for (const id in r) r[id] = r[id].map(x => x.change != null ? { ...x, change: x.change + 2 } : x); return r; };
    const eids = Object.entries(BB.welt[0].entitaeten).filter(([k]) => k.startsWith('polier_')).map(([, v]) => v);   // eigene Entitäten lösen aus
    for (const eid of eids) { const alt = BB.B.states[eid]; if (alt && Number.isFinite(+alt.state)) BB.B.states[eid] = { ...alt, state: String(+alt.state + 1) }; }
    VERSATZ += a0 ? 61000 : 11000; BB.hassNeu(); return eids.length;   // Uhr weiter: Live-Sperre 10 s, 5-Minuten-Statistik 60 s
  }, statistik);
  await panel(page, D, () => { window.__render = 0; const r = p.neuZeichnen.bind(p); p.neuZeichnen = (...a) => { window.__render++; return r(...a); }; });
  const vor = await merken(); const n = await zustand(true); await warte(600);
  const r = await panel(page, D, () => ({ w: sr.querySelector('.c-live .chart-wrap').innerHTML, k: sr.querySelector('.c-live-kennz').textContent, scroll: sr.querySelector('.scroll').scrollTop,
    render: window.__render, rest: window.__rest.every(x => x && x.isConnected && sr.contains(x)), stat: BB.TEST.aufrufe.filter(m => m.type === 'baustelle/statistik' && m.period === '5minute').length }));
  await panel(page, D, () => { BB.TEST.statistik = null; });
  erwarte('neue Statistik: Kennzahlen neu, Position bleibt', n > 0 && r.k !== vor.k && Math.abs(r.scroll - vor.scroll) <= 1, `${vor.k.slice(0, 40)} → ${r.k.slice(0, 40)}, Scroll ${vor.scroll}→${r.scroll}`);
  erwarte('B4 Rest bleibt', r.rest, `Knoten ${r.rest ? 'bleiben' : 'ersetzt'}, neuZeichnen ${r.render}×, 5-Minuten-Abfragen ${r.stat}`);
  // (2) Einblendung offen, nur Sensorwert
  await klick(page, `${D} >>> .c-kachel[data-s="leistung"]`); await warte(400);
  const vor2 = await merken(); await zustand(false); await warte(400);
  const r2 = await panel(page, D, () => ({ w: sr.querySelector('.c-live .chart-wrap').innerHTML, lg: p._liveGezeichnet || 0 }));
  erwarte('offene Einblendung: Wert angekommen, Diagramm unverändert', r2.lg > vor2.lg && r2.w === vor2.w, `liveGezeichnet ${vor2.lg}→${r2.lg}, gleich ${r2.w === vor2.w}`);
});

/* B5 Leistung: Regler mit der Tastatur, Daten kommen verzögert; Datenteil neu, Regler/Fokus/Scroll bleiben */
await fall('B5 Leistung', browser, async (page, erwarte) => {
  await klick(page, `${D} >>> .glas-k[data-id="polier"]`); await warte(200);
  await klick(page, `${D} >>> .c-kachel[data-s="leistung"]`); await warte(400);
  const regler = `${D} >>> input[data-lh]`;
  await page.waitForSelector(regler, { visible: true });
  const vor = await panel(page, D, () => { window.__regler = sr.querySelector('input[data-lh]'); window.__daten = sr.querySelector('.lh-daten');
    return { wert: +window.__regler.value, kopf: sr.querySelector('.lh-wert').textContent, daten: window.__daten.innerHTML, scroll: sr.querySelector('.sheet').scrollTop }; });
  await page.evaluate(() => { window.baustelleBeispiel.TEST.verzoegerung = 400; });
  await page.focus(regler); await page.keyboard.press('ArrowLeft'); await page.keyboard.press('ArrowLeft');
  await warte(1200);
  const r = await panel(page, D, () => ({ wert: +sr.querySelector('input[data-lh]').value, gleich: sr.querySelector('input[data-lh]') === window.__regler, fokus: sr.activeElement === window.__regler,
    kopf: sr.querySelector('.lh-wert').textContent, daten: sr.querySelector('.lh-daten').innerHTML, datenKnoten: sr.querySelector('.lh-daten') === window.__daten, scroll: sr.querySelector('.sheet').scrollTop, h: p.s.sheet && p.s.sheet.h }));
  await page.evaluate(() => { window.baustelleBeispiel.TEST.verzoegerung = 0; });
  erwarte('Stunde gewählt, Datenteil neu', r.wert === vor.wert - 2 && r.h === r.wert && r.kopf !== vor.kopf && r.daten !== vor.daten, `${vor.wert}→${r.wert}, h ${r.h}, ${vor.kopf}→${r.kopf}`);
  erwarte('Regler, Fokus, Datenbereich und Scroll bleiben', r.gleich && r.fokus && r.datenKnoten && Math.abs(r.scroll - vor.scroll) <= 1, JSON.stringify({ gleich: r.gleich, fokus: r.fokus, datenKnoten: r.datenKnoten, scroll: [vor.scroll, r.scroll] }));
});

/* B6 Befehle und Rechte: ein Klick = genau ein Auftrag; Nicht-Admin ändert nichts, Vor-Ort-Aktion geht */
await fall('B6 Befehle/Rechte', browser, async (page, erwarte) => {
  let ab = await aufrufZahl(page);
  await klick(page, `${D} >>> .auto-chip`); await warte(200);
  const admin = await schreibAnzahl(page, ab);
  erwarte('Admin: Automatik-Schalter sendet genau einen Auftrag', admin.length === 1 && admin[0] === 'baustelle/setzen', admin.join(', '));
  await panel(page, D, async () => { for (const b of BB.welt) b.rechte = { aendern: false, aktionen: ['gefuehl', 'warnung_stumm', 'jetzt_heizen', 'boost', 'bedarf', 'bedarf_aus'] }; await p._laden(); await new Promise(r => setTimeout(r, 150)); });
  ab = await aufrufZahl(page);
  await klick(page, `${D} >>> .auto-chip`); await warte(200);
  const gesperrt = await schreibAnzahl(page, ab), toast = await panel(page, D, () => sr.querySelector('.toast').textContent);
  erwarte('Nicht-Admin: kein Auftrag, Hinweis „Nur ansehen“', !gesperrt.length && /ansehen/i.test(toast), `${gesperrt.join(', ')} / ${toast}`);
  await klick(page, `${D} >>> .warn-chip`); await warte(200);
  ab = await aufrufZahl(page);
  await klick(page, `${D} >>> .sheet .wk-knoepfe .chip:last-child`); await warte(200);
  const vorOrt = await schreibAnzahl(page, ab);
  erwarte('Nicht-Admin: Warnung stumm (Vor-Ort-Aktion) genau ein Auftrag', vorOrt.length === 1 && vorOrt[0] === 'baustelle/aktion:warnung_stumm', vorOrt.join(', '));
});

/* Lit-Pilot „Über“ (Stufe 2a.1): Lit-Bereich übersteht Navigation und Neuzeichnen des alten Renderers; Aufklappen
   zeichnet nur den Lit-Bereich */
await fall('Lit-Pilot Über', browser, async (page, erwarte) => {
  await klick(page, `${D} >>> nav button[data-v="einst"]`);
  // seit 3e sind die ganzen Einstellungen Lit (kein Lit-Bereich im alten Renderer mehr): Gruppenwechsel zeichnen „Über“ neu
  await klick(page, `${D} >>> .ev-nav [data-v="ueber"]`); await warte(200);
  const merken = () => panel(page, D, () => { window.__lit = sr.querySelector('.ev-inhalt .ueber-kopf'); return !!window.__lit; });
  let navOk = 0;
  for (let i = 0; i < 20; i++) {
    await klick(page, `${D} >>> .ev-nav [data-v="${i % 2 ? 'app' : 'heizung'}"]`);
    await klick(page, `${D} >>> .ev-nav [data-v="ueber"]`);
    if (await panel(page, D, () => !!sr.querySelector('.ev-inhalt .ueber-kopf') && sr.querySelector('.ev-nav [data-v="ueber"]').classList.contains('on'))) navOk++;
  }
  erwarte('20 Navigationen: „Über“ jedes Mal da', navOk === 20, `${navOk}/20`);
  erwarte('„Über“ in den Einstellungen gezeichnet', await merken());
  let updOk = 0;
  for (let i = 0; i < 20; i++) {
    const ok = await panel(page, D, async () => { BB.welt[0].baustelle.titel = 'Titel ' + a0; await p._laden(); await p.neuZeichnen(); await new Promise(r => setTimeout(r, 30));
      const k = sr.querySelector('.ev-inhalt .ueber-kopf'); return k === window.__lit && k.isConnected && p.d.titel === 'Titel ' + a0; }, i);
    if (ok) updOk++;
  }
  erwarte('20 Daten-Updates mit Neuzeichnen: derselbe Lit-Knoten', updOk === 20, `${updOk}/20`);
  const r = await panel(page, D, () => { window.__render = 0; const ro = p.neuZeichnen.bind(p); p.neuZeichnen = (...x) => { window.__render++; return ro(...x); };
    window.__seite = sr.querySelector('.seite'); return sr.querySelectorAll('button.cl-v').length; });
  await klick(page, `${D} >>> button.cl-v:nth-of-type(2)`);   // Eintrag 0 ist schon offen
  const auf = await panel(page, D, () => ({ render: window.__render, seite: sr.querySelector('.seite') === window.__seite, offen: [...sr.querySelectorAll('button.cl-v')].findIndex(b => b.getAttribute('aria-expanded') === 'true'), liste: !!sr.querySelector('.cl-liste') }));
  erwarte('Verlauf aufklappen: nur Lit-Bereich neu (kein render der Seite)', r > 1 && auf.render === 0 && auf.seite && auf.liste && auf.offen === 1, JSON.stringify(auf));
  await klick(page, `${D} >>> .ev-inhalt button.knopf`);
  const melden = await panel(page, D, () => p.s.sheet && p.s.sheet.art);
  erwarte('Melden-Knopf in „Über“ öffnet den Melde-Dialog', melden === 'melden', String(melden));
});

/* Lit-Pilot Melde-Dialog (Stufe 2a.2): Tippen während Updates, Bild einfügen/entfernen, Abbrechen, Senden = ein Auftrag */
await fall('Lit-Pilot Melden', browser, async (page, erwarte) => {
  await klick(page, `${D} >>> button.melden-knopf`);
  const ta = `${D} >>> textarea[name="ml-text"]`;
  await klick(page, ta);
  let ok = 0; const text = 'Heizung im Polier schaltet zu spät';
  for (let i = 0; i < text.length; i++) {
    await page.keyboard.type(text[i]);
    if (i < 20) await panel(page, D, async () => { BB.welt[0].baustelle.titel = 'T' + a0; await p._laden(); await p.neuZeichnen(); }, i);   // 20 Updates mitten im Tippen (bauplan-lit §5)
  }
  const r = await panel(page, D, () => { const t = sr.querySelector('textarea[name="ml-text"]'); window.__ta = t;
    return { text: t.value, fokus: sr.activeElement === t, ende: t.selectionStart === t.value.length, entwurf: p.s.sheet.form.text, titel: p.d.titel }; });
  erwarte('Tippen während 20 Neuzeichnungen: Text, Fokus, Cursor bleiben', r.text === text && r.fokus && r.ende && r.entwurf === text && r.titel.startsWith('T'), JSON.stringify(r));
  // Bild über Einfügen (Strg+V): ClipboardEvent mit Bilddatei
  await page.evaluate(async () => { const c = document.createElement('canvas'); c.width = 40; c.height = 20; c.getContext('2d').fillRect(0, 0, 40, 20);
    const blob = await new Promise(r => c.toBlob(r, 'image/png')), dt = new DataTransfer(); dt.items.add(new File([blob], 'bild.png', { type: 'image/png' }));
    window.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt })); });
  await warte(600);
  const b = await panel(page, D, () => ({ bilder: sr.querySelectorAll('.sheet .mb-bild').length, ta: sr.querySelector('textarea[name="ml-text"]') === window.__ta, text: sr.querySelector('textarea[name="ml-text"]').value }));
  erwarte('Strg+V fügt ein Bild ein, Textfeld bleibt', b.bilder === 1 && b.ta && b.text === text, JSON.stringify(b));
  await klick(page, `${D} >>> .sheet .mb-bild button.x`);
  erwarte('✕ entfernt das Bild', await panel(page, D, () => sr.querySelectorAll('.sheet .mb-bild').length) === 0);
  await klick(page, `${D} >>> .sheet .ml-zurueck`);
  erwarte('Abbrechen schließt den Dialog', await panel(page, D, () => !p.s.sheet));
  await klick(page, `${D} >>> button.melden-knopf`);
  await klick(page, ta); await page.keyboard.type('Knopf zu klein');
  const ab = await aufrufZahl(page);
  await klick(page, `${D} >>> .sheet .ml-senden`); await warte(300);
  const gesendet = await page.evaluate(ab => window.baustelleBeispiel.TEST.aufrufe.slice(ab).filter(m => m.type === 'baustelle/meldung'), ab);
  erwarte('Senden: genau ein Auftrag mit dem Text', gesendet.length === 1 && gesendet[0].meldung.text === 'Knopf zu klein', JSON.stringify(gesendet.map(m => m.meldung && m.meldung.text)));
});

/* Stufe 2b (LitElement): hass vor/nach dem Einhängen, 20 Wiederanschlüsse ohne Mehrfachaufrufe, Menü, Theme, schmal/breit */
await fall('2b LitElement', browser, async (page, erwarte) => {
  const r = await page.evaluate(async () => {
    const BB = window.baustelleBeispiel, da = document.querySelector('#desktop'), warte = ms => new Promise(x => setTimeout(x, ms)), erg = {};
    const fertig = async el => { for (let i = 0; i < 50 && !(el.shadowRoot && el.shadowRoot.querySelector('nav button[data-v]') && el.d); i++) await warte(50); return !!(el.shadowRoot && el.shadowRoot.querySelector('nav button[data-v]')); };
    const alt = da.querySelector('baustelle-panel'), hass = alt.hass; alt.remove();
    const a = document.createElement('baustelle-panel'); a.panel = alt.panel; a.narrow = false; a.hass = hass; da.appendChild(a); erg.vorher = await fertig(a); a.remove();
    const b = document.createElement('baustelle-panel'); b.panel = alt.panel; b.narrow = false; da.appendChild(b); await warte(100); b.hass = hass; erg.nachher = await fertig(b);
    // 20 Wiederanschlüsse: je höchstens eine Strukturabfrage, keine doppelten Takte/Abos
    const ab = BB.TEST.aufrufe.length;
    for (let i = 0; i < 20; i++) { b.remove(); await warte(10); da.appendChild(b); await warte(30); }
    await warte(300);
    erg.struktur = BB.TEST.aufrufe.slice(ab).filter(m => m.type === 'baustelle/struktur').length; erg.abos = BB.TEST.abos; erg.intervalle = window.__z.intervalle.size;
    erg.zeichnet = !!b.shadowRoot.querySelector('.ui .seite');
    // Menü (schmal) und schmal/breit
    let menue = 0; b.addEventListener('hass-toggle-menu', () => menue++);
    b.narrow = true; await b.updateComplete; erg.knopfSchmal = !!b.shadowRoot.querySelector('.menue-knopf');
    b.shadowRoot.querySelector('.menue-knopf').click(); erg.menue = menue;
    b.narrow = false; await b.updateComplete; erg.knopfBreit = !!b.shadowRoot.querySelector('.menue-knopf');
    // Theme: hell/dunkel aus hass.themes
    b.hass = { ...b.hass, themes: { darkMode: false } }; await warte(50); erg.hell = b.shadowRoot.querySelector('.wurzel').classList.contains('hell');
    b.hass = { ...b.hass, themes: { darkMode: true } }; await warte(50); erg.dunkel = !b.shadowRoot.querySelector('.wurzel').classList.contains('hell');
    return erg;
  });
  erwarte('hass vor dem Einhängen gesetzt: Seite steht', r.vorher, JSON.stringify(r));
  erwarte('hass nach dem Einhängen gesetzt: Seite steht', r.nachher);
  erwarte('20 Wiederanschlüsse: höchstens eine Strukturabfrage je Anschluss, Takt und Abos wie bei zwei Seiten', r.struktur <= 20 && r.abos === 4 && r.intervalle === 3 && r.zeichnet, `${r.struktur} Abfragen, ${r.abos} Abos, ${r.intervalle} Takte`);
  erwarte('schmal: Menü-Knopf da, ein Klick = ein hass-toggle-menu; breit: kein Menü-Knopf', r.knopfSchmal && r.menue === 1 && !r.knopfBreit, JSON.stringify({ schmal: r.knopfSchmal, menue: r.menue, breit: r.knopfBreit }));
  erwarte('Theme hell/dunkel folgt hass.themes', r.hell && r.dunkel, JSON.stringify({ hell: r.hell, dunkel: r.dunkel }));
});

/* Stufe 3a: Laden, Fehler, leere Baustelle, Erholung (Lit-Vorlagen) */
await fall('3a Laden/Fehler/Leer', browser, async (page, erwarte) => {
  const r = await page.evaluate(async () => {
    const BB = window.baustelleBeispiel, da = document.querySelector('#desktop'), warte = ms => new Promise(x => setTimeout(x, ms)), erg = {};
    const text = el => el.shadowRoot.querySelector('.ui .seite') ? el.shadowRoot.querySelector('.ui .seite').textContent : '';
    const alt = da.querySelector('baustelle-panel'), hass = alt.hass; alt.remove();
    BB.TEST.haengt = true;
    const p = document.createElement('baustelle-panel'); p.panel = alt.panel; p.narrow = false; p.hass = hass; da.appendChild(p); await warte(300);
    erg.laedt = text(p).includes('Lädt …');
    BB.TEST.haengt = false; BB.TEST.fehlt = true; await p._laden(); await p.updateComplete; erg.fehler = text(p).includes('Die Integration antwortet nicht');
    BB.TEST.fehlt = false; await p._laden(); await p.updateComplete; erg.erholt = !!p.d && !text(p).includes('antwortet nicht') && !!p.shadowRoot.querySelector('.ui .seite .glas-kopf');
    const sicher = BB.welt.splice(0); await p._laden(); await p.updateComplete; erg.leer = text(p).includes('KEINE LAUFENDE BAUSTELLE');
    const knopf = [...p.shadowRoot.querySelectorAll('.ui .seite button.zeile')].find(b => b.textContent.includes('Neue Baustelle'));
    if (knopf) { knopf.click(); await p.updateComplete; } erg.neu = p.s.sheet && p.s.sheet.art;
    p.s.sheet = null; BB.welt.push(...sicher); await p._laden(); await p.updateComplete; erg.zurueck = !!p.d && !text(p).includes('KEINE LAUFENDE');
    return erg;
  });
  erwarte('Struktur hängt: „Lädt …“', r.laedt, JSON.stringify(r));
  erwarte('Struktur schlägt fehl: Fehlertext', r.fehler);
  erwarte('Antwort kommt wieder: Seite erholt sich', r.erholt);
  erwarte('keine laufende Baustelle: Leer-Ansicht, „+ Neue Baustelle“ öffnet den Dialog', r.leer && r.neu === 'baustelle-neu');
  erwarte('Baustelle wieder da: normale Ansicht', r.zurueck);
});

/* Stufe 3b: Verlauf – Suche ohne Fokus-Rettung (Tippen, Treffer neu), Filter, Vergleich sortieren, abgeschlossene
   Baustelle öffnen, CSV, zurück */
await fall('3b Verlauf', browser, async (page, erwarte) => {
  await klick(page, `${D} >>> nav button[data-v="verlauf"]`);
  await klick(page, `${D} >>> [data-vr="prot"]`);
  const suche = `${D} >>> .vl-suche`;
  await klick(page, suche); await page.keyboard.type('zzzz');
  const r = await panel(page, D, () => ({ fokus: sr.activeElement === sr.querySelector('.vl-suche'), wert: sr.querySelector('.vl-suche').value, nichts: sr.querySelector('.ui .seite').textContent.includes('Nichts gefunden'), cursor: sr.querySelector('.vl-suche').selectionStart }));
  erwarte('Suche: Fokus und Cursor bleiben beim Tippen, Treffer neu', r.fokus && r.wert === 'zzzz' && r.cursor === 4 && r.nichts, JSON.stringify(r));
  for (let i = 0; i < 4; i++) await page.keyboard.press('Backspace');
  await klick(page, `${D} >>> .vl-filter [data-pf="warnung"]`);
  const f = await panel(page, D, () => ({ an: sr.querySelector('.vl-filter [data-pf="warnung"]').classList.contains('on'), filter: p.s.pfilter }));
  erwarte('Filter Warnungen', f.an && f.filter === 'warnung', JSON.stringify(f));
  await klick(page, `${D} >>> [data-vr="bs"]`); await klick(page, `${D} >>> [data-va="tabelle"]`);
  await klick(page, `${D} >>> [data-sp="kwh"]`);
  const sortiert = await panel(page, D, () => ({ an: sr.querySelector('[data-sp="kwh"]').classList.contains('on'), zeilen: sr.querySelectorAll('.vl-tab-zeile').length }));
  erwarte('Vergleich nach kWh sortiert', sortiert.an && sortiert.zeilen > 1, JSON.stringify(sortiert));
  await klick(page, `${D} >>> [data-va="karten"]`);
  await klick(page, `${D} >>> .vl-karte:not(.aktiv)`);
  const det = await panel(page, D, () => { const geschrieben = []; p.datei = (inhalt, name) => geschrieben.push([name, inhalt.length]); window.__csv = geschrieben;
    return { view: p.s.view, titel: (sr.querySelector('.ui .seite .glas-titel') || {}).textContent }; });
  erwarte('abgeschlossene Baustelle öffnet die Detailseite', det.view === 'bsdetail' && !!det.titel, JSON.stringify(det));
  await klick(page, `${D} >>> .bs-csv`);
  const csv = await page.evaluate(() => window.__csv);
  erwarte('CSV der Baustelle wird erzeugt', csv.length === 1 && /\.csv$/.test(csv[0][0]) && csv[0][1] > 50, JSON.stringify(csv));
  await klick(page, `${D} >>> .zurueck-zeile button`);
  erwarte('zurück in den Verlauf', await panel(page, D, () => p.s.view) === 'verlauf');
});

/* Stufe 3c: Pumpen und Schacht – Diagramme, Stepper (ein Auftrag), Schacht öffnen, Zeitraum, Automatik und Pumpe schalten
   (je ein Auftrag), Schalter bleibt bei neuen Daten derselbe Knoten, verspätete Statistik nach Baustellenwechsel */
await fall('3c Pumpen', browser, async (page, erwarte) => {
  await klick(page, `${D} >>> nav button[data-v="pumpen"]`);
  await klick(page, `${D} >>> .seite .seg [data-pc="zyklen"]`);
  const pz = await panel(page, D, () => ({ an: sr.querySelector('.seite .seg [data-pc="zyklen"]').classList.contains('on'), svg: !!sr.querySelector('.seite .chart-wrap svg'), s: p.s.pchart }));
  erwarte('Pumpen: Diagramm Zyklen', pz.an && pz.svg && pz.s === 'zyklen', JSON.stringify(pz));
  let ab = await aufrufZahl(page);
  await klick(page, `${D} >>> .stepper [data-k="trocken_w"][data-d="5"]`);
  erwarte('Stepper Trockenlauf = genau ein Auftrag', JSON.stringify(await schreibAnzahl(page, ab)) === '["baustelle/setzen"]');
  await klick(page, `${D} >>> .seite .block-kopf .chip[data-id="schacht"]`);
  const sch = await panel(page, D, () => ({ view: p.s.view, cid: p.s.cid, titel: sr.querySelector('.c-held .glas-titel').textContent }));
  erwarte('Schacht öffnet', sch.view === 'container' && sch.cid === 'schacht' && !!sch.titel, JSON.stringify(sch));
  await klick(page, `${D} >>> .c-live .seg [data-c="verbrauch"]`);
  erwarte('Schacht-Diagramm Verbrauch', await panel(page, D, () => p.s.chart === 'verbrauch' && !!sr.querySelector('.c-live .chart-wrap svg')));
  await klick(page, `${D} >>> .c-live .zr-auf`);
  erwarte('Zeitraum-Kalender auf', await panel(page, D, () => !!sr.querySelector('.c-live .zr-kal')));
  await klick(page, `${D} >>> .c-live .zr-kal-fuss .chip`);
  erwarte('Kalender zu, aktuelle Woche', await panel(page, D, () => !sr.querySelector('.c-live .zr-kal') && p.zrV('c-Woche') === 0));
  // neue Daten der Integration: der Schalter bleibt derselbe Knoten (Lit), die Ansicht zeichnet nur Geändertes
  const knoten = await page.evaluateHandle(sel => document.querySelector(sel).shadowRoot.querySelector('.seite .liste .zeile .sw'), D);
  await panel(page, D, () => { p.cache = {}; return p._laden(); }); await warte(300);
  erwarte('Schalter bleibt bei neuen Daten stehen', await page.evaluate((k, sel) => k === document.querySelector(sel).shadowRoot.querySelector('.seite .liste .zeile .sw'), knoten, D));
  ab = await aufrufZahl(page);
  await klick(page, `${D} >>> .seite .liste .zeile .sw`);
  erwarte('Automatik des Schachts = genau ein Auftrag', JSON.stringify(await schreibAnzahl(page, ab)) === '["baustelle/setzen"]');
  if (await panel(page, D, () => !!sr.querySelector('.seite .zeile.geraet .sw'))) {
    ab = await aufrufZahl(page); await klick(page, `${D} >>> .seite .zeile.geraet .sw`);
    erwarte('Pumpe schalten = genau ein Auftrag', JSON.stringify(await schreibAnzahl(page, ab)) === '["baustelle/aktion:schalten"]'); }
  // verspätete Statistik: kommt erst, wenn schon eine andere Baustelle offen ist
  const sp = await page.evaluate(async sel => {
    const p = document.querySelector(sel), BB = window.baustelleBeispiel, warte = ms => new Promise(r => setTimeout(r, ms)), entry = p.d.entry, gehalten = [];
    const andere = BB.welt.find(x => x.baustelle.entry_id !== entry); if (!andere) return { andere: false };
    BB.TEST.statistik = (m, r) => m.entry_id === entry ? new Promise(x => gehalten.push(() => x(r))) : r;
    p.cache = {}; p.gehe('pumpen'); await warte(300);
    const laedt = p.shadowRoot.querySelector('.ui .seite').textContent.includes('Lädt …');
    p.baustelleOeffnen(andere.baustelle.entry_id); await warte(300);
    const vorher = { entry: p.d.entry, view: p.s.view, text: p.shadowRoot.querySelector('.ui .seite').textContent };
    BB.TEST.statistik = null; for (const g of gehalten) g(); await warte(500);
    const nachher = { entry: p.d.entry, view: p.s.view, text: p.shadowRoot.querySelector('.ui .seite').textContent };
    return { andere: true, gehalten: gehalten.length, laedt, gleich: vorher.entry === nachher.entry && vorher.view === nachher.view && vorher.text === nachher.text, neu: nachher.entry === andere.baustelle.entry_id };
  }, D);
  erwarte('verspätete Statistik nach Baustellenwechsel ändert die neue Baustelle nicht', sp.andere && sp.gehalten > 0 && sp.laedt && sp.neu && sp.gleich, JSON.stringify(sp));
});

/* Stufe 3d: Container – Modus, Soll, Schnell aufheizen, Gerät schalten, Trocknen je genau ein Auftrag; Diagrammwahl;
   Nicht-Admin: ✎ und Termin gesperrt (ausgegraut, Hinweis, keine Einblendung), Schnell aufheizen geht (Vor-Ort) */
await fall('3d Container', browser, async (page, erwarte) => {
  await klick(page, `${D} >>> .glas-k[data-id="polier"]`); await warte(300);
  const einer = async (sel, soll, text) => { const ab = await aufrufZahl(page); await klick(page, `${D} >>> ${sel}`); await warte(150);
    const a = await schreibAnzahl(page, ab); erwarte(`${text} = genau ein Auftrag`, JSON.stringify(a) === JSON.stringify([soll]), a.join(', ')); };
  const modusAuf = async () => { const ab = await aufrufZahl(page); await klick(page, `${D} >>> .ck-d .ck-chip.modus`);
    erwarte('Modus-Chip öffnet die Auswahl, ohne zu senden', !(await schreibAnzahl(page, ab)).length && await panel(page, D, () => !!sr.querySelector('.ck-modi'))); };
  await modusAuf(); await einer('.ck-modi button:not(.on):not([disabled])', 'baustelle/setzen', 'Modus wechseln');
  await modusAuf(); const ab0 = await aufrufZahl(page); await klick(page, `${D} >>> .ck-modi button.on`);
  erwarte('gewählter Modus sendet nichts', !(await schreibAnzahl(page, ab0)).length);
  await einer('.c-rad-pm .c-pm[data-d="0.5"]', 'baustelle/setzen', 'Soll +');
  await einer('.ck-d .ck-chip.ck-boost', 'baustelle/aktion:boost', 'Schnell aufheizen');
  { const ab = await aufrufZahl(page); await klick(page, `${D} >>> .ck-d .ckd-g[data-g="Jetzt"] .ck-chip`);
    const z = await panel(page, D, () => { const i = sr.querySelector('.ck-d .ck-info span'); return i ? i.textContent : ''; });
    erwarte('Kopf: Antippen eines Chips zeigt den Satz, sendet nichts', !!z && !(await schreibAnzahl(page, ab)).length, z);
    await klick(page, `${D} >>> .ck-d .ck-info > button`); }
  { const l = await panel(page, D, () => { const k = sr.querySelector('.ck-d'), r = sr.querySelector('.ck-d .ckd-rad').getBoundingClientRect(), g = sr.querySelector('.ck-d .ckd-gruppen').getBoundingClientRect(),
      s = sr.querySelector('.ck-d .c-rad svg').getBoundingClientRect(), gs = [...sr.querySelectorAll('.ck-d .ckd-g')].map(x => x.getBoundingClientRect());
      return { links: r.right <= g.left + 1, rad: Math.round(s.width), nebeneinander: gs.length > 1 && Math.abs(gs[0].top - gs[1].top) < 2, lang: getComputedStyle(k.querySelector('.ck-l')).display !== 'none' }; });
    erwarte('Kopf Desktop: Rad 220 px links, Gruppen als Kästchen nebeneinander, lange Chips', l.links && l.rad === 220 && l.nebeneinander && l.lang, JSON.stringify(l)); }
  await einer('.gk-k-heiz .gk-hk .c-power', 'baustelle/aktion:schalten', 'Gerät schalten (AN-0018: ⏻ an der Zeile der Kachel Heizen)');
  { const l = await panel(page, D, () => { const k = [...sr.querySelectorAll('.gk-kacheln > .gk-k')].map(x => x.getBoundingClientRect());
      return { n: k.length, reihe: k.length > 1 && Math.abs(k[0].top - k[1].top) < 2, heiz: Math.round(sr.querySelector('.gk-k-heiz').getBoundingClientRect().width), fu: Math.round(sr.querySelector('.gk-k-fu').getBoundingClientRect().width) }; });
    erwarte('AN-0018 Desktop: Kacheln je Geräteart nebeneinander, Heizen doppelt so breit', l.n >= 3 && l.reihe && l.heiz > 1.7 * l.fu, JSON.stringify(l)); }
  await klick(page, `${D} >>> .w-zeile > button.chip:last-of-type`); await warte(200);
  await klick(page, `${D} >>> .sheet [data-zeile="trocknen"] .sw`); await warte(100);   // AN-0018: in Bearbeiten, gespeichert mit „Speichern“
  { const ab = await aufrufZahl(page); await klick(page, `${D} >>> .sheet .knopf.amber`); await warte(300);
    const pf = await page.evaluate(ab => window.baustelleBeispiel.TEST.aufrufe.slice(ab).filter(m => m.type === 'baustelle/setzen').map(m => m.pfad.join('.')), ab);
    erwarte('Kleidung trocknen (AN-0018: Bearbeiten › Speichern) setzt bereiche.<id>.trocknen', pf.some(x => /^bereiche\.[^.]+\.trocknen$/.test(x)), pf.join(', '));
    erwarte('Bearbeiten › Speichern schreibt nur Geändertes (kein groesse_m2 ohne Änderung)', pf.length === 1, pf.join(', ')); }
  await panel(page, D, () => { p.s.sheet = null; return p.neuZeichnen(); });
  await klick(page, `${D} >>> .c-live .seg [data-v="woche"]`);
  erwarte('Diagramm Woche', await panel(page, D, () => p.s.cvd === 'woche' && !!sr.querySelector('.c-live .chart-wrap svg')));
  // Reiter Heizung (3d): Block als Einblendung, Modus je Container (Auswahlliste), Regler – je genau ein Auftrag
  await klick(page, `${D} >>> nav button[data-v="heizung"]`);
  await klick(page, `${D} >>> .hz-raster .hz-kachel[data-k="container"]`);
  { const ab = await aufrufZahl(page); await page.select(`${D} >>> .sheet .jc[data-id="polier"] .jc-modus`, 'hand'); await warte(200);
    const a = await schreibAnzahl(page, ab); erwarte('Heizung: Modus je Container = genau ein Auftrag', JSON.stringify(a) === '["baustelle/setzen"]', a.join(', ')); }
  await einer('.sheet .jc[data-id="polier"] .stepper button[data-d="0.5"]', 'baustelle/setzen', 'Heizung: Soll je Container +');
  await klick(page, `${D} >>> .sheet > .knopf`);
  await klick(page, `${D} >>> .hz-raster .hz-kachel[data-k="trocknen"]`);
  await einer('.sheet .stepper button[data-tr="0-ab_mm+"]', 'baustelle/setzen', 'Heizung: Kleidung trocknen Stufe 1 ab Regen + (AN-0021)');
  await klick(page, `${D} >>> .sheet > .knopf`);
  await klick(page, `${D} >>> nav button[data-v="uebersicht"]`); await klick(page, `${D} >>> .glas-k[data-id="polier"]`);
  await panel(page, D, async () => { for (const b of BB.welt) b.rechte = { aendern: false, aktionen: ['gefuehl', 'warnung_stumm', 'jetzt_heizen', 'boost', 'bedarf', 'bedarf_aus'] }; await p._laden(); await new Promise(r => setTimeout(r, 150)); });
  let ab = await aufrufZahl(page);
  await klick(page, `${D} >>> .gk-k-heiz .gk-hk`);   // AN-0018: Zeile antippen zeigt den Gerätedialog (ansehen), Speichern bleibt gesperrt
  const nl = await panel(page, D, () => ({ sheet: p.s.sheet && p.s.sheet.art }));
  erwarte('Nicht-Admin: Zeile öffnet den Gerätedialog zum Ansehen, sendet nichts', nl.sheet === 'geraet-edit' && !(await schreibAnzahl(page, ab)).length, JSON.stringify(nl));
  await panel(page, D, () => { p.s.sheet = null; return p.neuZeichnen(); });
  await einer('.ck-d .ck-chip.ck-boost', 'baustelle/aktion:boost', 'Nicht-Admin: Schnell aufheizen (Vor-Ort)');
  await klick(page, `${D} >>> .ck-d .ck-chip.modus`); ab = await aufrufZahl(page); await klick(page, `${D} >>> .ck-modi [data-v="hand"]`);
  erwarte('Nicht-Admin: Modus ändert nichts', !(await schreibAnzahl(page, ab)).length);
});

/* Stufe 3d: Einblendungen der Container-Ansicht – Bei Bedarf → Termin: Tippen während neuer Daten (Text, Fokus, Knoten
   bleiben), Eintragen = genau ein Auftrag; Nicht-Admin: „schnell aufheizen“ bleibt frei (Vor-Ort), Termin gesperrt */
await fall('3d Einblendungen', browser, async (page, erwarte) => {
  // 3f: „Meine Kacheln“ – im Anpassen-Modus Kachel 1 auf Kachel 2 ziehen: Reihenfolge neu, keine Reste vom Ziehen
  { const vor = await panel(page, D, () => { p.s.kkLayout = true; p.neuZeichnen(); return p.kkListe('ue').map(x => x.k); }); await warte(300);
    await panel(page, D, () => sr.querySelector('.kk-bereich').scrollIntoView({ block: 'center' })); await warte(500);   // Griffe ins Bild
    const g = await (await page.$(`${D} >>> .kk-bereich .aw-frei-s:nth-child(1) .aw-griff`)).boundingBox(), z = await (await page.$(`${D} >>> .kk-bereich .aw-frei-s:nth-child(2)`)).boundingBox();
    await page.mouse.move(g.x + g.width / 2, g.y + g.height / 2); await page.mouse.down(); await page.mouse.move(z.x + z.width / 2, z.y + z.height / 2, { steps: 8 }); await page.mouse.up(); await warte(300);
    const r = await panel(page, D, () => ({ k: p.kkListe('ue').map(x => x.k), rest: [...sr.querySelectorAll('.kk-bereich .aw-frei-s')].some(x => x.style.transform || x.style.pointerEvents || x.classList.contains('zieht') || x.classList.contains('ziel')) }));
    erwarte('Kacheln: Ziehen ändert die Reihenfolge, keine Reste', r.k[0] === vor[1] && r.k[1] === vor[0] && !r.rest, JSON.stringify({ vor, ...r }));
    await panel(page, D, () => { p.s.kkLayout = false; p.neuZeichnen(); }); await warte(200); }
  const bed = await panel(page, D, () => (p.d.bereiche.find(b => b.bedarf) || {}).id);
  await klick(page, `${D} >>> .glas-k[data-id="${bed}"] .bedarf-knopf`); await warte(400);
  await klick(page, `${D} >>> .sheet .zeile .sw.vor-ort`);
  erwarte('Bei Bedarf: schnell aufheizen umgeschaltet', await panel(page, D, () => p.s.sheet.boost === true));
  await klick(page, `${D} >>> .sheet button.zeile`);
  const titel = `${D} >>> .sheet input[data-tm="titel"]`;
  await klick(page, titel); await page.keyboard.type('Baubespr');
  await panel(page, D, async () => { window.__feld = sr.querySelector('.sheet input[data-tm="titel"]'); for (let i = 0; i < 5; i++) { p.cache = {}; await p._laden(); } });
  await page.keyboard.type('echung');
  const r = await panel(page, D, () => ({ wert: sr.querySelector('.sheet input[data-tm="titel"]').value, gleich: sr.querySelector('.sheet input[data-tm="titel"]') === window.__feld, fokus: sr.activeElement === window.__feld, form: p.s.sheet.form.titel }));
  erwarte('Termin: Tippen während neuer Daten – Text, Fokus, Knoten bleiben', r.wert === 'Baubesprechung' && r.gleich && r.fokus && r.form === 'Baubesprechung', JSON.stringify(r));
  const ab = await aufrufZahl(page); await klick(page, `${D} >>> .sheet .knopf.amber`);
  const ev = await page.evaluate(ab => window.baustelleBeispiel.TEST.aufrufe.slice(ab).filter(m => m.type === 'calendar/event/create').map(m => m.event.summary), ab);
  erwarte('Termin eintragen = genau ein Auftrag', JSON.stringify(ev) === '["Baubesprechung"]', JSON.stringify(ev));
  // Neue Arbeitszeit (3d): Name tippen während neuer Daten, Samstag dazu, Speichern = genau ein Auftrag
  await panel(page, D, () => { p.gehe('heizung'); p.azNeu(p.azJetzt); });
  const name = `${D} >>> .sheet input[data-f="name"]`;
  await klick(page, name); await page.keyboard.type('Win');
  await panel(page, D, async () => { window.__az = sr.querySelector('.sheet input[data-f="name"]'); for (let i = 0; i < 3; i++) { p.cache = {}; await p._laden(); } });
  await page.keyboard.type('ter');
  const azr = await panel(page, D, () => ({ wert: sr.querySelector('.sheet input[data-f="name"]').value, gleich: sr.querySelector('.sheet input[data-f="name"]') === window.__az, fokus: sr.activeElement === window.__az }));
  erwarte('Arbeitszeit: Tippen während neuer Daten – Text, Fokus, Knoten bleiben', azr.wert === 'Winter' && azr.gleich && azr.fokus, JSON.stringify(azr));
  await panel(page, D, () => sr.querySelectorAll('.sheet .zeile.azn')[5].querySelector('.sw').click()); await warte(120);   // Samstag
  const ab2 = await aufrufZahl(page); await klick(page, `${D} >>> .sheet .knopf.amber`);
  const az = await page.evaluate(ab => window.baustelleBeispiel.TEST.aufrufe.slice(ab).filter(m => m.type === 'baustelle/liste').map(m => `${m.liste}:${m.eintrag.name}:${!!m.eintrag.tage['5']}`), ab2);
  erwarte('Arbeitszeit speichern = genau ein Auftrag (mit Samstag)', JSON.stringify(az) === '["arbeitszeiten:Winter:true"]', JSON.stringify(az));
  await panel(page, D, () => p.gehe('uebersicht')); await warte(200);
  await panel(page, D, async () => { for (const b of BB.welt) b.rechte = { aendern: false, aktionen: ['gefuehl', 'warnung_stumm', 'jetzt_heizen', 'boost', 'bedarf', 'bedarf_aus'] }; await p._laden(); await new Promise(x => setTimeout(x, 150)); });
  await klick(page, `${D} >>> .glas-k[data-id="${bed}"] .bedarf-knopf`); await warte(300);
  const nl = await panel(page, D, () => ({ frei: getComputedStyle(sr.querySelector('.sheet .zeile .sw.vor-ort')).opacity, termin: getComputedStyle(sr.querySelector('.sheet button.zeile')).opacity }));
  await klick(page, `${D} >>> .sheet button.zeile`);
  const art = await panel(page, D, () => p.s.sheet && p.s.sheet.art);
  erwarte('Nicht-Admin: schnell aufheizen frei, Termin ausgegraut und gesperrt', +nl.frei > .9 && +nl.termin < .6 && art === 'bedarf', JSON.stringify({ ...nl, art }));
});

/* B7 Lebenszyklus: 20 × entfernen/einhängen – Timer, Abos, window-Listener nehmen nicht zu */
await fall('B7 Lebenszyklus', browser, async (page, erwarte) => {
  const stand = () => page.evaluate(() => ({ paste: window.__z.listener.paste, ort: window.__z.listener['location-changed'], intervalle: window.__z.intervalle.size, abos: window.baustelleBeispiel.TEST.abos }));
  // Erwartung je eingehängter Seite: 1 Minutentakt, 2 Wetter-Abos (täglich/stündlich); dazu der Takt des Mockups
  const soll = { intervalle: 2 + 1, abos: 2 * 2 };
  const vor = await stand();
  erwarte('Ausgangsstand: Takt und Abos je Seite', vor.intervalle === soll.intervalle && vor.abos === soll.abos, JSON.stringify(vor));
  await page.evaluate(async () => { const el = document.querySelector('#desktop baustelle-panel'), da = el.parentNode;
    for (let i = 0; i < 20; i++) { el.remove(); await new Promise(r => setTimeout(r, 10)); da.appendChild(el); await new Promise(r => setTimeout(r, 10)); } });
  await warte(300);
  const nach = await stand();
  erwarte('dasselbe Element: window-Listener und Takt nehmen nicht zu', nach.paste === vor.paste && nach.ort === vor.ort && nach.intervalle === soll.intervalle, `${JSON.stringify(vor)} → ${JSON.stringify(nach)}`);
  erwarte('B7 Abos nach Wiedereinhängen', nach.abos === soll.abos, `${JSON.stringify(vor)} → ${JSON.stringify(nach)}`);
  const vor2 = await stand();
  await page.evaluate(async () => { const da = document.querySelector('#desktop');
    for (let i = 0; i < 20; i++) { const alt = da.querySelector('baustelle-panel'), neu = document.createElement('baustelle-panel');
      neu.panel = alt.panel; neu.narrow = false; neu.hass = alt.hass; alt.remove(); da.appendChild(neu); await new Promise(r => setTimeout(r, 20)); } });
  await warte(300);
  const nach2 = await stand();
  erwarte('neue Elemente: Takt und Abos wie bei einer Seite', nach2.intervalle === soll.intervalle && nach2.abos === soll.abos, `${JSON.stringify(vor2)} → ${JSON.stringify(nach2)}`);
  erwarte('B7 neue Elemente', nach2.paste === vor2.paste && nach2.ort === vor2.ort, `${JSON.stringify(vor2)} → ${JSON.stringify(nach2)}`);
});

/* B8 Container am Handy (BSM-031.11): nichts ragt rechts aus der Seite – das Rad, „zu kalt / passt / zu warm“ und die
   Kacheln stehen untereinander; nur die Modus-Leiste darf in sich scrollen (wie die Chipleisten) */
await fall('B8 Container am Handy', browser, async (page, erwarte) => {
  const ids = await panel(page, T, () => p.d.bereiche.filter(b => !b.pumpe).map(b => b.id));
  for (const id of ids) {
    await panel(page, T, () => p.containerOeffnen(a0), id); await warte(600);
    const raus = await panel(page, T, () => { const sc = sr.querySelector('.scroll'), re = sc.getBoundingClientRect().right;
      return [...sc.querySelectorAll('*')].filter(x => x.getBoundingClientRect().right > re + 1 && !x.closest('svg, .chips, [class*=leiste]')
        && ![...x.children].some(k => k.getBoundingClientRect().right > re + 1)).slice(0, 3)
        .map(x => `${x.tagName.toLowerCase()}.${String(x.className).trim()} +${Math.round(x.getBoundingClientRect().right - re)}px`); });
    const rad = await panel(page, T, () => { const k = sr.querySelector('.c-kern'), sc = sr.querySelector('.scroll'); return !k || k.getBoundingClientRect().right <= sc.getBoundingClientRect().right + 1; });
    erwarte(`${id}: nichts ragt hinaus, Rad sichtbar`, !raus.length && rad, raus.join(', '));
    const k = await panel(page, T, () => { const c = sr.querySelector('.ck-d'); if (!c) return null; const n = c.querySelector('.ckd-name').getBoundingClientRect(), r = c.querySelector('.ckd-rad').getBoundingClientRect(),
      s = c.querySelector('.ckd-rad > .c-rad svg'), gs = [...c.querySelectorAll('.ckd-g')].map(x => x.getBoundingClientRect()), l = c.querySelector('.ck-l'), kz = c.querySelector('.ck-k');
      return { unter: n.bottom <= r.top + 1, rad: s ? Math.round(s.getBoundingClientRect().width) : 170, zwei: gs.length < 2 || (Math.abs(gs[0].top - gs[1].top) < 2 && gs[1].left > gs[0].left), kurz: getComputedStyle(l).display === 'none' && getComputedStyle(kz).display !== 'none' }; });
    erwarte(`${id}: Kopf am Handy – Name über dem Rad (170 px), Gruppen zweispaltig, kurze Chips`, k && k.unter && k.rad === 170 && k.zwei && k.kurz, JSON.stringify(k));
    /* Eingestellt (eingestellt.html C) aufgeklappt mit Satz: kurze Chips, Zeilen zentriert, nichts ragt hinaus */
    const ei = await panel(page, T, async () => { const L = p.b.eingestellt || []; if (!L.length) return null;
      p.s.ck = { id: p.b.id, info: `ei-${L[0].k}`, modus: false, ei: true }; await p.neuZeichnen(); await new Promise(r => setTimeout(r, 200));
      const sc = sr.querySelector('.scroll'), re = sc.getBoundingClientRect().right, c = sr.querySelector('.ck-d .ei-b .ck-chip');
      const raus = [...sr.querySelectorAll('.ck-d .ckd-name *')].filter(x => x.getBoundingClientRect().right > re + 1).map(x => `${x.tagName.toLowerCase()}.${String(x.className).trim()}`);
      const r = { n: sr.querySelectorAll('.ck-d .ei-b .ck-chip').length, raus, satz: !!sr.querySelector('.ck-d .ckd-name > .ei-info'),
        kurz: !!c && getComputedStyle(c.querySelector('.ck-l')).display === 'none' && getComputedStyle(c.querySelector('.ck-k')).display !== 'none' };
      p.s.ck = null; await p.neuZeichnen(); return r; });
    if (ei) erwarte(`${id}: Eingestellt am Handy aufgeklappt – kurze Chips, Satz, nichts ragt hinaus`, ei.n > 0 && ei.satz && ei.kurz && !ei.raus.length, JSON.stringify(ei));
  }
});

/* B9 Kacheln S am Handy (Herbert 28.10.2026): die Zahl jeder S-Kachel passt in die Kachel (vorher abgeschnitten „6…“) und
   steht am Handy (390 px, zwei Spalten) in einer Zeile, kurze Zahlen bleiben 34 px wie am Desktop; im schmalen Telefon-Rahmen
   des Mockups (vier Spalten) bricht sie notfalls um statt abgeschnitten zu werden. Dazu Kachel „Gespart“ L (Mockup gespart.html,
   Variante B) in voller Breite mit Lücke und Legende */
await fall('B9 Kacheln S am Handy', browser, async (page, erwarte) => {
  const zeige = sel => panel(page, sel, () => { const keys = p.kkEintraege('ue').map(e => e.k);
    p.s.kkUe = [...keys.map(k => p.kkGross({ k, an: true }, 'S')), p.kkGross({ k: 'b-gespart', an: true, dia: true }, 'L')]; p.s.sheet = null; p.gehe('uebersicht'); p.neuZeichnen(); return keys.length; });
  const messen = sel => panel(page, sel, () => [...sr.querySelectorAll('.aw-raster[data-ort="ue"] .kk-S .kk-zahl')].map(z => ({
    text: z.textContent.trim(), px: parseFloat(getComputedStyle(z).fontSize), zu: z.scrollWidth > z.clientWidth + 1, zeilen: Math.round(z.offsetHeight / (parseFloat(getComputedStyle(z).fontSize) * 1.15)),
    raus: z.closest('.kk').scrollHeight > z.closest('.kk').clientHeight + 1 })));
  const kurz = z => z.text.length <= 7;
  await zeige(T); await zeige(D); await warte(1500);
  const r = await messen(T), d = await messen(D);
  erwarte(`Telefon-Rahmen: alle ${r.length} S-Zahlen ganz sichtbar`, r.length === d.length && r.length >= 15 && r.every(z => !z.zu && !z.raus), JSON.stringify(r.filter(z => z.zu || z.raus)));
  erwarte('Desktop: S-Zahlen passen, kurze 34 px wie bisher', d.length >= 15 && d.every(z => !z.zu && z.zeilen === 1) && d.filter(kurz).every(z => z.px === 34), JSON.stringify(d.filter(z => z.zu || z.zeilen !== 1 || (kurz(z) && z.px !== 34))));
  for (const [sel, w] of [[T, '320 128'], [D, '640 160']]) {
    const g = await panel(page, sel, () => { const kk = sr.querySelector('.aw-raster[data-ort="ue"] .kk-L'), svg = kk && kk.querySelector('.kk-dia svg.chart'), leg = kk && kk.querySelector('.kk-leg');
      const q = svg && svg.getBoundingClientRect(), dia = kk && kk.querySelector('.kk-dia').getBoundingClientRect();
      return svg && { vb: svg.getAttribute('viewBox'), luecke: !!svg.querySelector('path.kk-luecke'), leg: leg && leg.textContent, voll: Math.abs(q.width - dia.width) < 2, legSicht: !!leg && leg.getBoundingClientRect().height > 0 && leg.getBoundingClientRect().bottom <= kk.getBoundingClientRect().bottom + 1 }; });
    erwarte(`Gespart L ${w}: volle Breite, Lücke, Legende sichtbar`, g && g.vb === `0 0 ${w}` && g.luecke && g.voll && g.legSicht && g.leg.includes('gespart'), JSON.stringify(g));
  }
  await bild(page, 'b9-kacheln-s');
  await page.setViewport({ width: 390, height: 844 }); await zeige(T); await warte(1500);   // echtes Handy: zwei Spalten
  const h = await messen(T);
  erwarte(`Handy 390 px: alle ${h.length} S-Zahlen in einer Zeile, keine abgeschnitten`, h.length === d.length && h.every(z => !z.zu && !z.raus && z.zeilen === 1), JSON.stringify(h.filter(z => z.zu || z.raus || z.zeilen !== 1)));
  erwarte('Handy 390 px: kurze Zahlen bleiben 34 px', h.filter(kurz).every(z => z.px === 34), JSON.stringify(h.filter(kurz).map(z => [z.text, z.px])));
});

/* B10 Baseline-Läufe am Handy (J4b, Mockup baseline.html B, FE-0033): Karte „🧪 Baseline messen“ in Heizung › Regeln und der
   Reiter „Baseline“ der Heizperiode ragen nicht hinaus (Kostenrahmen bricht um, Stand und Läufe zweizeilig); im Container-Kopf
   während eines Laufs der kurze Chip „🧪 bis So 24:00“ */
await fall('B10 Baseline am Handy', browser, async (page, erwarte) => {
  await page.setViewport({ width: 390, height: 844 });
  const raus = () => panel(page, T, () => { const sc = sr.querySelector('.sheet') || sr.querySelector('.scroll'), re = sc.getBoundingClientRect().right;
    return [...sc.querySelectorAll('.bl-rv *, .bl-stand *, .bl-liste *, .bl-lauf *, .bl-leg *')].filter(x => x.getBoundingClientRect().right > re + 1 && !x.closest('svg'))
      .slice(0, 3).map(x => `${x.tagName.toLowerCase()}.${String(x.className).trim()} +${Math.round(x.getBoundingClientRect().right - re)}px`); });
  await panel(page, T, () => { p.gehe('heizung'); p.s.rvAuf = 'bl'; return p.hzAuf('regeln'); }); await warte(800);   // AN-0020: Gruppe Baseline offen
  const k = await panel(page, T, () => { const c = sr.querySelector('.sheet .bl-rv'); if (!c) return null; c.scrollIntoView(); const r = c.querySelector('.bl-rahmen');
    return { rahmen: !!r && getComputedStyle(r).flexWrap === 'wrap', lauf: !!c.querySelector('.bl-lauf') }; });
  const r1 = await raus();
  erwarte('Regeln: Karte da, Kostenrahmen bricht um, nichts ragt hinaus', k && k.rahmen && k.lauf && !r1.length, JSON.stringify(k) + ' ' + r1.join(', '));
  await bild(page, 'b10-regeln');
  await panel(page, T, () => { p.s.hpReiter = 'bl'; p.gehe('auswertung'); return p.awDetail('hochrechnung'); }); await warte(1200);
  const s = await panel(page, T, () => { const z = sr.querySelector('.bl-stand .bl-s'), l = sr.querySelector('.bl-liste .bl-l');
    return z && l && { stand: getComputedStyle(z).gridTemplateColumns.split(' ').length, lauf: getComputedStyle(l).gridTemplateColumns.split(' ').length }; });
  const r2 = await raus();
  erwarte('Reiter Baseline: Stand und Läufe zweispaltig, nichts ragt hinaus', s && s.stand === 2 && s.lauf === 3 && !r2.length, JSON.stringify(s) + ' ' + r2.join(', '));
  await bild(page, 'b10-reiter');
  const c = await panel(page, T, async () => { const b = p.d.bereiche.find(x => !x.pumpe && x.fuehler) || p.d.bereiche.find(x => !x.pumpe); p.containerOeffnen(b.id);
    await new Promise(r => setTimeout(r, 300)); const x = p.d.bereiche.find(y => y.id === b.id);
    x.baseline = { lauf_id: 'r9', von: '2026-10-03', letzter: '2026-10-04', von_t: 'Sa 03.10.', letzter_t: 'So 04.10.', bis: '2026-10-05T00:00:00+02:00', bis_t: 'So 24:00', bisher_kwh: 13.1, bisher_eur: 2.62 };
    p.s.ck = null; await p.neuZeichnen(); await new Promise(r => setTimeout(r, 200));
    const ch = sr.querySelector('.ck-d .ck-chip[data-k="zust"]'), sc = sr.querySelector('.scroll');
    return ch && { kurz: getComputedStyle(ch.querySelector('.ck-k')).display !== 'none' && getComputedStyle(ch.querySelector('.ck-l')).display === 'none', text: ch.querySelector('.ck-k').textContent,
      drin: ch.getBoundingClientRect().right <= sc.getBoundingClientRect().right + 1 }; });
  erwarte('Container-Kopf im Lauf: kurzer Chip „bis So 24:00“ am Handy', c && c.kurz && c.text === 'bis So 24:00' && c.drin, JSON.stringify(c));
  await bild(page, 'b10-kopf');
});

/* B11 Wochenplan „Diese Woche“ (FE-0034): alle Spuren gleich breit und > 0, auch an einem Tag ohne Gründe (heute). Die
   Heizperiode definierte früher .hp-zeile/.hp-zeit seitenweit als Flex-Zeile – die Spur schrumpfte dann auf den Text */
await fall('B11 Wochenplan Spuren', browser, async (page, erwarte) => {
  const messen = sel => panel(page, sel, () => [...sr.querySelectorAll('.sheet .hp .hp-zeile:not(.achse)')].map(z => {
    const s = z.querySelector('.tl-spur'); return { tag: z.querySelector('.hp-tag b').textContent, w: s ? Math.round(s.getBoundingClientRect().width) : -1,
      grid: getComputedStyle(z).display === 'grid' }; }));
  for (const [sel, name] of [[D, 'Desktop'], [T, 'Telefon']]) {
    await panel(page, sel, () => { p.gehe('heizung'); return p.hzAuf('plan'); }); await warte(600);
    const r = await messen(sel), w = r.map(z => z.w);
    erwarte(`${name}: ${r.length} Tage, alle Spuren gleich breit und > 0, Zeile als Raster`, r.length === 7 && w.every(x => x > 40 && x === w[0]) && r.every(z => z.grid), JSON.stringify(r));
    // Tag ohne Gründe (z. B. heute ohne Wetter-Anpassung): die Spur bleibt so breit wie die anderen
    await panel(page, sel, () => { const iso = p.z.WOCHE_ISO[p.z.WOCHE.findIndex(([t]) => t === p.z.HEUTE_TAG)], q = p.d.plan[iso];
      if (q) q.gruende = []; p.s.sheet = null; p.neuZeichnen(); return p.hzAuf('plan'); }); await warte(600);
    const o = await messen(sel), h = o.find(z => z.tag === 'heute');
    erwarte(`${name}: heute ohne Gründe – Spur so breit wie die anderen`, h && h.w > 40 && o.every(z => z.w === h.w), JSON.stringify(o));
  }
  await bild(page, 'b11-wochenplan');
});

server.close();
const gesamt = Date.now() - t0;
let rot = 0; const bekannteTreffer = [];
for (const e of ergebnisse) for (const p of e.pruef) if (!p.ok) { if (BEKANNT[p.text]) bekannteTreffer.push(`${p.text}: ${BEKANNT[p.text]} (${p.info})`); else rot++; }
for (const [k, v] of Object.entries(BEKANNT)) if (!ergebnisse.some(e => e.pruef.some(p => p.text === k && !p.ok))) console.log(`ℹ bekannt, aber nicht mehr aufgetreten – aus BEKANNT streichen: ${k} (${v})`);
if (bekannteTreffer.length) console.log('⚠ bekannte Fehler (nicht rot):\n  ' + bekannteTreffer.join('\n  '));
console.log(`Browser-Test ${rot ? 'ROT' : 'grün'}: ${ergebnisse.length} Fälle, ${(gesamt / 1000).toFixed(1)} s, ${chromeVersion}, puppeteer-core ${createRequire(join(FRONTEND, 'package.json'))('puppeteer-core/package.json').version}`);
if (BERICHT) writeFileSync(BERICHT, JSON.stringify({ version: VERSION, chrome: chromeVersion, gesamt_ms: gesamt, ergebnisse, bekannt: bekannteTreffer }, null, 1));
process.exit(rot ? 1 : 0);
