// Rahmen für Vorschlags-Mockups auf der echten Lit-Seite (ab BSM-031.04; Anleitung in mockups/README.md „Vorschläge bauen“).
// Ein Vorschlag ist eine eigene Datei neben glas.html: glas.html (echte Seite + Beispieldaten) wird eingelesen, der Rahmen
// hängt ein Modul an, das Teile der Seite ergänzt oder ersetzt, und baut die Vorführ-Leiste. Das Vorschlags-Skript liefert
// nur den Inhalt.
//
// Node (im Vorschlags-Skript):
//   const rahmen = require('./rahmen');
//   rahmen.bauen({ datei: 'thema.html', titel, leiste, auswahl, vorher, browser, faelle });
//     datei    Zielname in mockups/
//     titel    <title>; leiste: Text vorne in der Vorführ-Leiste
//     auswahl  [{ id, t, optionen: [[wert, text], …] }]  → Auswahlfelder der Leiste (z. B. variante, lage, zeigen)
//     vorher   zusätzlicher Quelltext vor dem Vorschlag (z. B. container-zeichner.js)
//     browser  function (R) { … } – läuft nur im Browser (als Text eingesetzt), R = Rahmen-API unten
//     faelle   [{ name, werte: { id: wert, … }, klick: ['Knopftext', …], scroll: 'css' }] – Ansichten für Bilder und Prüfung
//              (klick: Knöpfe der Reihe nach antippen, Text beginnt damit; scroll: Element nach oben scrollen)
//   Aufruf: node mockups/quelle/<thema>.js [--bilder <ordner>]
//     --bilder: Chromium (puppeteer-core aus dem Frontend) öffnet die Datei, stellt jeden Fall über die Leiste ein und
//     speichert <ordner>/<fall>-desktop.png und -390.png; meldet Konsolenfehler und waagrechtes Überlaufen (Seite, Einblendung).
//
// Browser (R in browser(R)):
//   R.html`…`, R.nothing        Vorlagen in derselben Form wie Lit (die Seite bündelt Lit; @click, .value, ?selected gehen)
//   R.gruppe({ k, ic, t, kurz(p), inhalt(p), nach: 'container', marke: true, wann(p) })   Einstellungen-Gruppe (Seitenleiste + Chips)
//   R.gruppeWeg({ k, wann(p) })  Gruppe der Seite ausblenden (Seitenleiste + Chips), z. B. wenn ein Vorschlag sie ersetzt (BSM-034.05)
//   R.reiter({ k, t, tKurz, inhalt(p), nach: 'verlauf', wann(p) })                       Reiter oben mit eigener Ansicht (p.gehe(k))
//   R.abschnitt({ ansicht: 'container', vor(p), nach(p), wann(p) })                       vor/nach den Inhalt einer Ansicht der Seite
//   R.einblendung(art, vorlage(p, s), { breit(s) })                                        Einblendung im Sheet-Platz der Seite;
//       öffnen mit R.auf(p, { art, …, zurueck }) – Schließen kehrt zu s.zurueck zurück, wenn das eine Rahmen-Einblendung ist
//   R.vorlage({ merkmal, fn(t, p), wann(p) })   jede Lit-Vorlage der Seite (auch in Dialogen), deren Text merkmal enthält
//       (z. B. 'data-zeile="stufen"'), durch fn(t, p) ersetzen oder in fn ändern (Rückgabe undefined = t bleibt) (AN-0015)
//   R.stil(css)                 zusätzliche Stile im Shadow Root (nur Variablen der Seite: --ink, --ink2, --amber, …)
//   R.vorfuehren(fn(werte))     Leiste geändert (und beim Start): werte = { id: wert } der Auswahlfelder
//   R.P(), R.neuAlle()          beide Seiten (Handy, Desktop) bzw. neu zeichnen
//   R.marke ('neu'), R.band(text)  Etikett „neu“ bzw. Varianten-Band oben in Ansicht/Einblendung
//   R.svg(text)                 SVG-Text als Knoten (für Symbole)
// Was ein neues Mockup zusätzlich braucht, kommt hierher in den Rahmen, nicht in die Einzeldatei.
'use strict';
const fs = require('fs'), path = require('path');
const repo = path.join(__dirname, '..', '..');

/* Läuft im Browser: hängt sich in den Prototyp von baustelle-panel ein (wie die alten Varianten, aber für die Lit-Seite) */
function laufzeit() {
  const html = (strings, ...values) => ({ _$litType$: 1, strings, values });   // Form einer Lit-Vorlage (lit-html)
  const nothing = Symbol.for('lit-nothing');
  const K = customElements.get('baustelle-panel'), proto = K.prototype, alt = { ui: proto._ui, schliessen: proto.schliessen, updated: proto.updated };
  const GRUPPEN = [], WEG = [], REITER = [], ABSCHNITTE = [], EINBL = {}, STILE = [], VORLAGEN = [];
  let vorfuehren = null;
  const suche = (t, test, f) => { if (!t || typeof t !== 'object') return; if (Array.isArray(t)) return t.forEach(x => suche(x, test, f));
    if (Array.isArray(t.strings) && test(t)) f(t); if (Array.isArray(t.values)) t.values.forEach(x => suche(x, test, f)); };
  const enthaelt = s => t => t.strings.some(x => x.includes(s));
  const kopie = it => ({ ...it, values: [...it.values] });
  const gilt = (x, p) => !x.wann || x.wann(p);
  const marke = html`<span class="r-marke">neu</span>`;
  const tief = (t, test, f) => { if (!t || typeof t !== 'object') return t;   // von innen nach außen: erst die Werte, dann die Vorlage selbst
    if (Array.isArray(t)) { for (let i = 0; i < t.length; i++) t[i] = tief(t[i], test, f); return t; }
    if (!Array.isArray(t.values)) return t;   // Vorlage oder Direktive (keyed …) mit Werten
    for (let i = 0; i < t.values.length; i++) t.values[i] = tief(t.values[i], test, f);
    if (!Array.isArray(t.strings) || !test(t)) return t; const n = f(t); return n === undefined ? t : n; };
  const seiteErsetzen = (t, fn) => suche(t, enthaelt('<div class="seite '), x => { const i = x.values.length - 1; x.values[i] = fn(x.values[i]); });

  proto._ui = function () {
    const S = this.s, p = this, t = alt.ui.call(this);
    // Einstellungen: eigene Gruppen in Seitenleiste und Chips; Inhalt, wenn gewählt
    // (einstellungen.js: Seitenleiste-Eintrag = [trenn, k, class, click, ic, t, kurz], Chip = [class, k, click, ic, t])
    if (S.view === 'einst') {
      const G = GRUPPEN.filter(g => gilt(g, p)), aktiv = G.find(g => g.k === S.evGruppe), weg = new Set(WEG.filter(w => gilt(w, p)).map(w => w.k));
      if (weg.size) for (const s of ['<nav class="ev-nav', '<div class="ev-chips">'])   // Seitenleiste-Eintrag und Chip: values[1] = k
        suche(t, enthaelt(s), x => { const L = x.values[0]; if (Array.isArray(L)) x.values[0] = L.filter(it => !weg.has(it.values[1])); });
      if (aktiv) suche(t, enthaelt('class="ev-inhalt"'), x => { const j = x.strings.findIndex(s => s.includes('class="ev-ic">'));
        x.values[j] = aktiv.ic; x.values[j + 1] = aktiv.marke ? html`${aktiv.t}${marke}` : aktiv.t; x.values[j + 2] = aktiv.kurz ? aktiv.kurz(p) : ''; x.values[j + 3] = aktiv.inhalt(p); });
      suche(t, enthaelt('<nav class="ev-nav'), x => { const L = x.values[0]; if (aktiv) for (const it of L) it.values[2] = '';
        for (const g of G) { const i = Math.max(0, L.findIndex(it => it.values[1] === (g.nach || 'container'))), n = kopie(L[i]);
          n.values.splice(1, 6, g.k, g === aktiv ? 'on' : '', () => p.einstGruppeWahl(g.k), g.ic, g.marke ? html`${g.t}${marke}` : g.t, g.kurz ? g.kurz(p) : ''); L.splice(i + 1, 0, n); } });
      suche(t, enthaelt('<div class="ev-chips">'), x => { const L = x.values[0]; if (aktiv) for (const it of L) it.values[0] = '';
        for (const g of G) { const i = Math.max(0, L.findIndex(it => it.values[1] === (g.nach || 'container'))), n = kopie(L[i]);
          n.values.splice(0, 5, g === aktiv ? 'amber' : '', g.k, () => p.einstGruppeWahl(g.k), g.ic, g.t); L.splice(i + 1, 0, n); } });
    }
    // Reiter oben (alt.js _ui: Reiter = [k, class, click, text]); eigene Ansicht über s.view = k
    const R = REITER.filter(r => gilt(r, p)), j = t.strings.findIndex(s => s.includes('<nav class="glas-nav')), L = j >= 0 && t.values[j + 1];
    if (R.length && Array.isArray(L)) for (const r of R) { const i = L.findIndex(it => it.values[0] === (r.nach || 'verlauf')), n = kopie(L[i < 0 ? 0 : i]);
      n.values[0] = r.k; n.values[1] = S.view === r.k ? 'on' : ''; n.values[2] = () => p.gehe(r.k); n.values[3] = p.narrow && r.tKurz ? r.tKurz : r.t; L.splice(i + 1, 0, n); t.values[j] = 'sechs'; }
    const r = R.find(x => x.k === S.view); if (r) seiteErsetzen(t, () => r.inhalt(p));
    // Abschnitte vor/nach dem Inhalt einer Ansicht
    for (const a of ABSCHNITTE) if (a.ansicht === S.view && gilt(a, p)) seiteErsetzen(t, orig => html`${a.vor ? a.vor(p) : nothing}${orig}${a.nach ? a.nach(p) : nothing}`);
    // Einblendungen im Sheet-Platz der Seite (alt.js _ui: <div class="sheet glas-panel ${an}">${melden}${sheet}</div>)
    const sh = S.sheet, e = sh && EINBL[sh.art];
    if (e) { const k = t.strings.findIndex(s => s.includes('class="sheet glas-panel ')); if (k >= 0) { t.values[k] = 'an r-sheet' + (e.breit && e.breit(sh) ? ' r-breit' : ''); t.values[k + 2] = e.vorlage(p, sh); } }
    // Vorlagen der Seite gezielt ersetzen (Merkmal im Vorlagentext)
    for (const v of VORLAGEN) if (gilt(v, p)) t.values = t.values.map(x => tief(x, enthaelt(v.merkmal), y => v.fn(y, p)));
    return t;
  };
  proto.schliessen = function () { const sh = this.s.sheet;
    if (sh && EINBL[sh.art] && sh.zurueck && EINBL[sh.zurueck.art]) { this.s.sheet = sh.zurueck; return this.neuZeichnen(); }
    return alt.schliessen.call(this); };
  const BASIS = `.r-marke { font-size: 10px; font-weight: 600; padding: 1px 6px; border-radius: 6px; background: var(--amber); color: #000; margin-left: 6px; vertical-align: 1px; letter-spacing: 0; text-transform: none; }
.r-band { align-self: flex-start; font-size: 12px; padding: 4px 12px; border-radius: 12px; background: color-mix(in srgb, var(--amber) 22%, transparent); color: var(--amber); border: 1px dashed var(--amber); margin: 0 0 10px; display: inline-block; }
.sheet .r-band { margin: 2px 0 4px; }
.r-sheet .glas-panel.liste > .zeile, .r-sheet .glas-panel.liste > .gruppe { padding-left: 16px; padding-right: 16px; }   /* Zeilen in Listen der Einblendung nicht am Rand */
@container (min-width: 700px) { .sheet.r-breit { width: min(900px, calc(100% - 48px)); max-height: 88%; } }`;
  const blatt = css => { const s = new CSSStyleSheet(); s.replaceSync(css); return s; };
  STILE.push(blatt(BASIS));
  proto.updated = function (...a) { const r = this.renderRoot; if (r && STILE.some(s => !r.adoptedStyleSheets.includes(s))) r.adoptedStyleSheets = [...r.adoptedStyleSheets.filter(s => !STILE.includes(s)), ...STILE]; return alt.updated.apply(this, a); };

  const P = () => window.baustelleBeispiel ? window.baustelleBeispiel.P : [];
  window.RAHMEN = {
    html, nothing, K, proto, marke, P,
    neuAlle: () => { for (const q of P()) q.neuZeichnen(); },
    band: text => html`<div class="r-band">${text}</div>`,
    svg: s => { const d = document.createElement('div'); d.innerHTML = s; return d.firstElementChild; },
    auf: (p, s) => { p.s.sheet = s; return p.neuZeichnen(); },
    gruppe: g => GRUPPEN.push(g), gruppeWeg: w => WEG.push(w), reiter: r => REITER.push(r), abschnitt: a => ABSCHNITTE.push(a), vorlage: v => VORLAGEN.push(v),
    einblendung: (art, vorlage, o = {}) => { EINBL[art] = { vorlage, ...o }; },
    stil: css => STILE.push(blatt(css)),
    vorfuehren: fn => { vorfuehren = fn; },
    _leiste: werte => { if (vorfuehren) vorfuehren(werte); },
  };
}

/* Mockup bauen: glas.html + Laufzeit + Vorschlag + Leiste */
function bauen(o) {
  let html = fs.readFileSync(path.join(repo, 'mockups', 'glas.html'), 'utf8');
  const ersetze = (a, b) => { if (!html.includes(a)) throw new Error('glas.html: nicht gefunden: ' + a.slice(0, 60) + ' – Rahmen an die neue glas.js anpassen'); html = html.replace(a, b); };
  ersetze('<title>Baustelle – Master-Mockup</title>', `<title>${o.titel}</title>`);
  html = html.replace(/<b>Baustelle · Master-Mockup · Seite ([^<]*)<\/b>/, `<b>${o.leiste} · Vorschlag auf Seite $1</b>`);
  const felder = (o.auswahl || []).map(a => `<label>${a.t} <select data-r="${a.id}">${a.optionen.map(([v, t]) => `<option value="${v}">${t}</option>`).join('')}</select></label>`).join('\n');
  ersetze('<button id="neu">Beispiel neu laden</button>', '<button id="neu">Beispiel neu laden</button>\n' + felder);
  const start = html.indexOf('<script type="module">\n/* Start wie in HA');   // eigenes Modul nach dem Seiten-Modul, vor dem Start
  if (start < 0) throw new Error('glas.html: Start-Modul nicht gefunden');
  const code = `/* ================= Rahmen (mockups/quelle/rahmen.js) ================= */\n(${laufzeit.toString()})();\n`
    + `/* ================= Vorschlag: ${o.datei} ================= */\n${o.vorher || ''}\n(${o.browser.toString()})(window.RAHMEN);`;
  html = html.slice(0, start) + '<script type="module">\n' + code.replace(/<\/script/gi, '<\\/script') + '\n</script>\n' + html.slice(start);
  ersetze('setInterval(hassNeu, 60000);', `setInterval(hassNeu, 60000);
/* Rahmen: Vorführ-Leiste */
const rFelder = [...document.querySelectorAll('select[data-r]')], rWerte = () => Object.fromEntries(rFelder.map(s => [s.dataset.r, s.value]));
for (const s of rFelder) s.onchange = () => window.RAHMEN._leiste(rWerte());
window.RAHMEN._leiste(rWerte());`);
  const ziel = path.join(repo, 'mockups', o.datei);
  fs.writeFileSync(ziel, html);
  console.log(`mockups/${o.datei} gebaut (${Math.round(html.length / 1024)} KB)`);
  const i = process.argv.indexOf('--bilder');
  if (i > 0) return bilder(ziel, process.argv[i + 1], o.faelle || [{ name: 'start', werte: {} }]);
}

/* Bilder und Prüfung im Browser: je Fall Desktop und 390 px, Konsolenfehler, waagrechtes Überlaufen */
// Bekanntes Überlaufen der echten Seite (auch in glas.html), nicht vom Vorschlag: Leisten mit eigenem Scrollen (Chips, Modus-Leiste
// im Container-Kopf). Der Container-Kopf am Handy ist seit BSM-031.11 (0.8.114) nicht mehr zu breit.
const BEKANNT_SEITE = ['.ev-chips', '.chips', '[class*=leiste]', '.c-d-knoepfe .seg', 'svg *'];   // Zierrat im Thermostat-Rad (svg)
async function bilder(datei, ordner, faelle) {
  const { createServer } = require('http'), FRONTEND = path.join(repo, 'custom_components', 'baustelle', 'frontend');
  const puppeteer = require(require.resolve('puppeteer-core', { paths: [FRONTEND] }));
  const CHROME = process.env.CHROME_PFAD || ['/usr/bin/chromium', '/usr/bin/chromium-browser', '/usr/bin/google-chrome'].find(fs.existsSync);
  fs.mkdirSync(ordner, { recursive: true });
  const inhalt = fs.readFileSync(datei);
  const server = createServer((q, r) => { if (q.url === '/favicon.ico') { r.writeHead(204); return r.end(); } r.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); r.end(inhalt); });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox', '--disable-gpu'] });
  const page = await browser.newPage(), fehler = [];
  await page.setViewport({ width: 1440, height: 824 });   // Seite rechnet mit 100vh: 824 = Innenhöhe des Handy-Rahmens (844 − 2 × 10), sonst liegt die Reiterleiste unter dem Rand
  page.on('pageerror', e => fehler.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') fehler.push('console: ' + m.text()); });
  await page.goto(`http://127.0.0.1:${server.address().port}/`, { waitUntil: 'load' });
  await page.addStyleTag({ content: '.bar { position: static !important; } .desktop { height: 826px !important; }' });   // Leiste klebt sonst über den Bildern; Desktop so hoch wie 100vh
  await new Promise(r => setTimeout(r, 2500));
  const probleme = [];
  let geklickt = false;
  for (const f of faelle) {
    if (geklickt) { await page.reload({ waitUntil: 'load' }); await page.addStyleTag({ content: '.bar { position: static !important; } .desktop { height: 826px !important; }' }); await new Promise(r => setTimeout(r, 2500)); }   // nach Bedienung frische Beispieldaten
    geklickt = !!(f.klick && f.klick.length);
    await page.evaluate(w => { if (!window.RAHMEN) return; for (const s of document.querySelectorAll('select[data-r]')) if (s.dataset.r in w) s.value = w[s.dataset.r];
      window.RAHMEN._leiste(Object.fromEntries([...document.querySelectorAll('select[data-r]')].map(s => [s.dataset.r, s.value]))); }, f.werte);
    await new Promise(r => setTimeout(r, 900));
    for (const t of f.klick || []) {   // Knöpfe der Reihe nach antippen (Text beginnt mit t; Einblendung zuerst, sonst Seite) – nur am Desktop,
      // weil beide Seiten dieselben Beispieldaten teilen (ein Klick je Seite würde doppelt anlegen); Bild dann nur Desktop
      const ok = await page.evaluate(t => { const r = document.querySelector('#desktop baustelle-panel').shadowRoot, alle = [...r.querySelectorAll('.sheet.an button'), ...r.querySelectorAll('.scroll button, .glas-nav button')];
        const b = alle.find(x => x.textContent.trim().startsWith(t)); if (b) b.click(); return !!b; }, t);
      if (!ok) probleme.push(`${f.name}: Knopf „${t}“ nicht gefunden`);
      await new Promise(r => setTimeout(r, 500));
    }
    if (f.scroll) { await page.evaluate(sel => { for (const p of document.querySelectorAll('baustelle-panel')) { const el = p.shadowRoot.querySelector(sel), box = el && el.closest('.sheet, .scroll');
      if (el && box) box.scrollTop += el.getBoundingClientRect().top - box.getBoundingClientRect().top - 12; } }, f.scroll); await new Promise(r => setTimeout(r, 300)); }
    const ueber = await page.evaluate(BEKANNT => [...document.querySelectorAll('baustelle-panel')].flatMap(p => { const r = p.shadowRoot, wo = p.parentElement.id;
      // Überlaufen: Behälter breiter als sichtbar; genannt werden die tiefsten Elemente, die rechts hinausragen
      // (Chipleisten und Segmente mit eigenem Scrollen zählen nicht – so auch auf der echten Seite)
      return ['.scroll', '.sheet.an', '.sheet.an .glas-panel', '.scroll .glas-panel'].flatMap(sel => [...r.querySelectorAll(sel)].filter(el => el.scrollWidth > el.clientWidth + 1).map(el => { const re = el.getBoundingClientRect().right;
        const raus = [...el.querySelectorAll('*')].filter(x => x.getBoundingClientRect().right > re + 1 && !x.closest(BEKANNT) && ![...x.children].some(k => k.getBoundingClientRect().right > re + 1));
        return { wo, sel, w: el.scrollWidth + ' > ' + el.clientWidth, raus: raus.slice(0, 4).map(x => x.tagName.toLowerCase() + (x.className && typeof x.className === 'string' ? '.' + x.className.trim().split(/\s+/).join('.') : '') + ' +' + Math.round(x.getBoundingClientRect().right - re) + 'px') }; })
        .filter(u => u.raus.length).map(u => `${u.wo} ${u.sel} ${u.w}: ${u.raus.join(', ')}`)); }), BEKANNT_SEITE.join(', '));
    for (const u of ueber) probleme.push(`${f.name}: läuft über – ${u}`);
    for (const [id, n] of f.klick && f.klick.length ? [['desktop', 'desktop']] : [['desktop', 'desktop'], ['telefon', '390']]) { const el = await page.$('#' + id); await el.screenshot({ path: path.join(ordner, `${f.name}-${n}.png`) }); }
  }
  await browser.close(); server.close();
  for (const x of fehler) probleme.push(x);
  console.log(probleme.length ? probleme.join('\n') + `\n${probleme.length} Probleme` : `${faelle.length} Fälle · keine Konsolenfehler, nichts läuft über · Bilder in ${ordner}`);
  if (probleme.length) process.exitCode = 1;
}

module.exports = { bauen, bilder };
