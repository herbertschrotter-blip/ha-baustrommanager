// WU-0020: Vorschlag „In der Container-Ansicht wischen“ auf Basis des Master-Mockups (Ticket von Herbert, Handy:
// „durch einfaches links und rechts wischen den vorherigen oder nächsten Container ansehen“).
// Baut mockups/wischen.html: node mockups/quelle/wischen.js   ·   prüfen: node mockups/quelle/vorschau/pruefen.cjs mockups/wischen.html
//
// Vorschlag: oben in der Container-Ansicht zwischen „‹ Übersicht“ und „Bearbeiten“ ‹ › und die Position („2 / 4“ oder
// Punkte), damit es am Desktop geht und man es findet; dazu Wischen (waagrecht > 60 px und deutlich mehr waagrecht als
// senkrecht, kurze Schiebe-Animation) und am Desktop die Pfeiltasten. Reihenfolge wie die Kacheln der Übersicht.
// Kein Wischen auf Schiebereglern, Diagrammen, Thermostat-Rad, Knöpfen und Eingaben und nicht bei offener Einblendung.
// Umschaltbar über die Leiste: Variante A nur Container / B Container und Pumpenschächte; Rand: am Ende stoppen / im Kreis;
// Position: „2 / 4“ / Punkte; Hinweis „← wischen →“ einmal beim ersten Öffnen am Handy.
// Die Seite rechnet dabei nichts Fachliches: Reihenfolge = d.bereiche (wie die Übersicht), Wechsel = containerOeffnen.
// Bilder: node mockups/quelle/wischen.js --bilder <ordner>
const rahmen = require('./rahmen');

/* Läuft nur im Browser (als Text eingesetzt, Node führt es nie aus) */
function browser(R) {
  const { html, nothing } = R;
  const W = window.WISCH = { v: 'a', rand: 'stopp', anzeige: 'zahl', hinweis: 'an', gesehen: false, uhr: null };
  const SCHWELLE = 60, VERHAELTNIS = 1.5;   // px waagrecht; waagrecht muss 1,5× so weit sein wie senkrecht
  const NICHT = 'button, a, input, select, textarea, label, svg, canvas, [role="slider"], [role="switch"], .seg, .chart-wrap, .c-kern, .glas-chips, .c-chips';

  /* Reihenfolge wie die Kacheln der Übersicht (uebersicht.js: B.map(karte)) */
  const liste = p => (p.d ? p.d.bereiche : []).filter(b => W.v === 'b' || !b.pumpe);
  const lage = p => { const L = liste(p), i = p.b ? L.indexOf(p.b) : -1; return { L, i, n: L.length }; };
  const ziel = (p, dir) => { const { L, i, n } = lage(p); if (i < 0 || n < 2) return null;
    const j = i + dir; return j >= 0 && j < n ? L[j] : W.rand === 'kreis' ? L[(j + n) % n] : null; };
  const seiteEl = p => p.renderRoot && p.renderRoot.querySelector('.scroll > .seite');
  const anim = (el, k, o) => el && el.animate ? el.animate(k, o).finished.catch(() => {}) : Promise.resolve();

  async function wechseln(p, dir, von = 'none') {
    const z = ziel(p, dir), el = seiteEl(p);
    if (el) el.style.transform = '';
    if (!z) return abprall(p, dir, von);
    W.gesehen = true;
    await anim(el, [{ transform: von, opacity: 1 }, { transform: `translateX(${-dir * 35}%)`, opacity: 0 }], { duration: 150, easing: 'ease-in', fill: 'forwards' });
    p.containerOeffnen(z.id);
    await (p.updateComplete || Promise.resolve());
    const sc = p.renderRoot.querySelector('.scroll'); if (sc) sc.scrollTop = 0;
    anim(seiteEl(p), [{ transform: `translateX(${dir * 35}%)`, opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 220, easing: 'cubic-bezier(.2,.7,.2,1)' });
  }
  const abprall = (p, dir, von) => anim(seiteEl(p), [{ transform: von }, { transform: `translateX(${-dir * 18}px)` }, { transform: 'none' }], { duration: 260, easing: 'ease-out' });

  /* Wischen: Zeiger-Ereignisse am Shadow Root (Finger, Stift, am Desktop auch Maus mit gedrückter Taste) */
  function anhaengen(p) {
    const r = p.renderRoot; if (!r || p._wisch) return; p._wisch = true;
    let z = null;   // { x, y, el, waag }
    const weg = () => { if (z && z.el) { z.el.style.transform = ''; z.el.style.userSelect = ''; } z = null; };
    r.addEventListener('pointerdown', e => {
      if (p.s.view !== 'container' || p.s.sheet || (e.pointerType === 'mouse' && e.button !== 0)) return;
      const t = e.composedPath()[0];
      if (!t || !t.closest || t.closest(NICHT) || !t.closest('.seite') || lage(p).i < 0 || lage(p).n < 2) return;
      z = { x: e.clientX, y: e.clientY, el: seiteEl(p), waag: false };
    });
    r.addEventListener('pointermove', e => {
      if (!z) return;
      const dx = e.clientX - z.x, dy = e.clientY - z.y;
      if (!z.waag) { if (Math.abs(dx) < 10 && Math.abs(dy) < 10) return;
        if (Math.abs(dx) > Math.abs(dy) * VERHAELTNIS) { z.waag = true; if (z.el) z.el.style.userSelect = 'none'; } else return weg(); }   // senkrecht: normal scrollen
      const frei = ziel(p, dx < 0 ? 1 : -1);
      if (z.el) z.el.style.transform = `translateX(${frei ? dx : dx * 0.25}px)`;   // am Ende („stoppen“): zäh, federt zurück
    });
    const los = e => {
      if (!z) return;
      const dx = e.clientX - z.x, dy = e.clientY - z.y, el = z.el, von = el ? el.style.transform || 'none' : 'none', ok = z.waag && Math.abs(dx) > SCHWELLE && Math.abs(dx) > Math.abs(dy) * VERHAELTNIS;
      weg();
      if (ok) wechseln(p, dx < 0 ? 1 : -1, von);
      else if (von !== 'none') anim(el, [{ transform: von }, { transform: 'none' }], { duration: 180, easing: 'ease-out' });
    };
    r.addEventListener('pointerup', los);
    r.addEventListener('pointercancel', weg);   // Browser übernimmt (senkrechtes Scrollen)
  }
  /* Pfeiltasten am Desktop (nicht in Eingaben, nicht bei offener Einblendung) */
  document.addEventListener('keydown', e => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    const t = e.composedPath()[0]; if (t && t.closest && t.closest('input, select, textarea')) return;
    for (const p of R.P()) if (!p.narrow && p.s.view === 'container' && !p.s.sheet && lage(p).i >= 0) { e.preventDefault(); wechseln(p, e.key === 'ArrowRight' ? 1 : -1); }
  });

  /* Kopfzeile der Container-Ansicht: ‹ Übersicht · ‹ 2 / 4 › · Bearbeiten (ersetzt die Zeile der Seite) */
  R.abschnitt({ ansicht: 'container', wann: p => p.b && lage(p).i >= 0 && lage(p).n > 1, vor: p => {
    anhaengen(p);
    const { L, i, n } = lage(p), vor = ziel(p, -1), nach = ziel(p, 1);
    const hinweis = W.hinweis === 'an' && p.narrow && !W.gesehen;
    if (hinweis && !W.uhr) W.uhr = setTimeout(() => { W.uhr = null; W.gesehen = true; R.neuAlle(); }, 3500);   // echt: einmal je Gerät (localStorage)
    return html`${R.band(`WU-0020 · Variante ${W.v === 'a' ? 'A: nur Container' : 'B: Container und Pumpenschächte'} · ${W.rand === 'kreis' ? 'im Kreis' : 'am Ende stoppen'}`)}
      <div class="zurueck-zeile w-zeile"><button class="glas-panel chip" @click=${() => p.gehe('uebersicht')}>‹ Übersicht</button>
        <div class="glas-panel w-nav" role="group" aria-label="Container blättern">
          <button class="w-pfeil" ?disabled=${!vor} title=${vor ? `Vorheriger: ${vor.name}` : 'erster'} aria-label="Vorheriger" @click=${() => wechseln(p, -1)}>‹</button>
          ${W.anzeige === 'punkte'
            ? html`<span class="w-punkte" aria-label="${i + 1} von ${n}">${L.map((b, k) => html`<i class=${k === i ? 'an' : b.pumpe ? 'pumpe' : ''} title=${b.name}></i>`)}</span>`
            : html`<span class="w-pos">${i + 1} / ${n}</span>`}
          <button class="w-pfeil" ?disabled=${!nach} title=${nach ? `Nächster: ${nach.name}` : 'letzter'} aria-label="Nächster" @click=${() => wechseln(p, 1)}>›</button>${R.marke}</div>
        <button class="glas-panel chip" @click=${() => p.einblenden('bereich')}>Bearbeiten</button>
        ${hinweis ? html`<div class="w-hinweis" @click=${() => { W.gesehen = true; R.neuAlle(); }}>← wischen →</div>` : nothing}</div>`; },
    nach: p => html`<div class="leise w-fuss">WU-0020: Wischen nach links = nächster, nach rechts = vorheriger ${W.v === 'a' ? 'Container' : 'Container oder Pumpenschacht'} (Reihenfolge wie in der Übersicht${W.rand === 'kreis' ? ', nach dem letzten wieder der erste' : ''}). Nicht auf Rad, Diagramm, Schiebereglern und Knöpfen und nicht bei offener Einblendung. Am Desktop: ‹ › oder die Pfeiltasten.</div>` });

  R.stil(`
.w-zeile ~ .zurueck-zeile { display: none; }   /* Zeile der Seite: hier durch die eigene ersetzt */
.seite:has(.w-zeile) { touch-action: pan-y; }   /* senkrecht scrollt der Browser, waagrecht bekommt die Seite */
.w-zeile { position: relative; align-items: center; gap: 8px; }
.w-nav { display: inline-flex; align-items: center; gap: 2px; padding: 2px 4px; border-radius: 999px; min-width: 0; }
.w-pfeil { width: 34px; height: 30px; border: 0; background: none; color: var(--ink); font-size: 22px; line-height: 1; cursor: pointer; border-radius: 999px; }
.w-pfeil:disabled { opacity: .25; cursor: default; }
.w-pos { font-size: 13px; font-variant-numeric: tabular-nums; color: var(--ink2); min-width: 38px; text-align: center; white-space: nowrap; }
.w-punkte { display: inline-flex; gap: 5px; padding: 0 2px; align-items: center; }
.w-punkte i { width: 6px; height: 6px; border-radius: 50%; background: var(--ink2); opacity: .45; }
.w-punkte i.pumpe { border-radius: 1px; }
.w-punkte i.an { background: var(--amber); opacity: 1; width: 8px; height: 8px; }
.w-nav .r-marke { margin-left: 2px; margin-right: 4px; }
.w-hinweis { position: absolute; top: calc(100% + 8px); left: 50%; transform: translateX(-50%); z-index: 3; font-size: 13px; padding: 6px 14px; border-radius: 999px;
  background: color-mix(in srgb, var(--amber) 85%, transparent); color: #000; white-space: nowrap; animation: w-wink 1.2s ease-in-out 3; cursor: pointer; }
@keyframes w-wink { 0%, 100% { transform: translateX(-50%); } 30% { transform: translateX(calc(-50% - 10px)); } 70% { transform: translateX(calc(-50% + 10px)); } }
.w-fuss { font-size: 12px; padding: 0 4px; }`);

  /* Vorführ-Leiste */
  R.vorfuehren(w => {
    Object.assign(W, { v: w.variante, rand: w.rand, anzeige: w.anzeige, hinweis: w.hinweis, gesehen: false });
    if (W.uhr) { clearTimeout(W.uhr); W.uhr = null; }
    for (const q of R.P()) {
      if (!q.d) continue;   // Daten noch nicht da (beim ersten Aufruf der Leiste)
      q.s.sheet = null;
      const L = liste(q), S = q.d.bereiche.find(b => b.pumpe);
      const b = w.zeigen === 'erster' ? L[0] : w.zeigen === 'letzter' ? L[L.length - 1] : w.zeigen === 'schacht' ? S || L[0] : L[1] || L[0];
      if (b) q.containerOeffnen(b.id);
      if (w.zeigen === 'einblendung') q.einblenden('bereich');
      q.neuZeichnen();
    }
  });
}

const V = [['a', 'A · nur Container'], ['b', 'B · Container und Pumpenschächte']];
const RAND = [['stopp', 'am Ende stoppen'], ['kreis', 'im Kreis']];
const ANZEIGE = [['zahl', '„2 / 4“'], ['punkte', 'Punkte •••']];
const HINWEIS = [['an', '„← wischen →“ einmal (Handy)'], ['aus', 'kein Hinweis']];
const ZEIGEN = [['mitte', 'Container 2'], ['erster', 'erster Container'], ['letzter', 'letzter Container'], ['schacht', 'Pumpenschacht'], ['einblendung', 'mit offener Einblendung']];
const f = (name, variante, rand, anzeige, zeigen, hinweis = 'aus') => ({ name, werte: { variante, rand, anzeige, hinweis, zeigen } });
const faelle = [
  f('a-mitte-zahl', 'a', 'stopp', 'zahl', 'mitte', 'an'),
  f('a-mitte-punkte', 'a', 'stopp', 'punkte', 'mitte'),
  f('a-erster-stopp', 'a', 'stopp', 'zahl', 'erster'),
  f('a-letzter-kreis', 'a', 'kreis', 'zahl', 'letzter'),
  f('a-schacht', 'a', 'stopp', 'zahl', 'schacht'),
  f('b-schacht-zahl', 'b', 'stopp', 'zahl', 'schacht'),
  f('b-schacht-punkte', 'b', 'kreis', 'punkte', 'schacht'),
  f('a-einblendung', 'a', 'stopp', 'zahl', 'einblendung'),
  { name: 'a-weiter-klick', werte: { variante: 'a', rand: 'stopp', anzeige: 'zahl', hinweis: 'aus', zeigen: 'erster' }, klick: ['›'] },
];
rahmen.bauen({ datei: 'wischen.html', titel: 'Baustelle – Container wischen (WU-0020)', leiste: 'WU-0020 Container wischen', browser, faelle,
  auswahl: [{ id: 'variante', t: 'Variante', optionen: V }, { id: 'rand', t: 'Rand', optionen: RAND }, { id: 'anzeige', t: 'Position', optionen: ANZEIGE },
    { id: 'hinweis', t: 'Hinweis', optionen: HINWEIS }, { id: 'zeigen', t: 'zeigen', optionen: ZEIGEN }] });
