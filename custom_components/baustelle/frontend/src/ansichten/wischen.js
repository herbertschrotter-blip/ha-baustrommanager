// WU-0020: In der Container-Ansicht zwischen Containern blättern (Mockup wischen.html, Variante A, Herbert 28.10.2026).
// Nur Container (keine Pumpenschächte), am Ende stoppen (Rand federt, Knopf ausgegraut), Position „2 / 6“.
// Bedienung: ‹ › in der Kopfzeile, Pfeiltasten ← → am Desktop, Wischen mit Finger oder Stift (nicht mit der Maus, damit
// Text markierbar bleibt). Reihenfolge wie die Kacheln der Übersicht (d.bereiche); Wechsel über containerOeffnen → gehe.
// Die Seite rechnet dabei nichts Fachliches.
import { html, nothing } from 'lit';

export const WISCH_SCHWELLE = 60, WISCH_VERHAELTNIS = 1.5;   // px waagrecht; waagrecht mindestens 1,5× so weit wie senkrecht
const NICHT = 'button, a, input, select, textarea, label, svg, canvas, [role="slider"], [role="switch"], .seg, .chart-wrap, .c-kern, .c-chips, .glas-chips, .ck-chips, .ck-soll, .ck-gefuehl, .ck-info';   // Kopf der Container-Ansicht: Chips, Soll, Gefühl, Satz
const HINWEIS_SPEICHER = 'baustelle-wischen-hinweis';

/* Lage des offenen Containers in der Reihenfolge der Übersicht (ohne Pumpenschächte) */
export function wischLage(p) {
  const L = p.d ? p.d.bereiche.filter(b => !b.pumpe) : [], b = p.b, i = b && !b.pumpe ? L.indexOf(b) : -1;
  return { L, i, n: L.length };
}
const ziel = (p, dir) => { const { L, i, n } = wischLage(p); if (i < 0 || n < 2) return null; const j = i + dir; return j >= 0 && j < n ? L[j] : null; };
const seiteEl = p => p.renderRoot && p.renderRoot.querySelector('.scroll > .seite');
const anim = (el, k, o) => el && typeof el.animate === 'function' ? el.animate(k, o).finished.catch(() => {}) : Promise.resolve();
const bereit = p => p.s.view === 'container' && !p.s.sheet && wischLage(p).i >= 0 && wischLage(p).n > 1;

/* Zum vorherigen (dir −1) oder nächsten (dir +1) Container; am Ende federt der Rand */
export async function wischWechseln(p, dir, von = 'none') {
  if (p._wischLaeuft) return;   // ein Wechsel nach dem anderen (schnelles Doppeltippen)
  const z = ziel(p, dir), el = seiteEl(p);
  if (el) el.style.transform = '';
  if (!z) return anim(el, [{ transform: von }, { transform: `translateX(${-dir * 18}px)` }, { transform: 'none' }], { duration: 260, easing: 'ease-out' });
  p._wischLaeuft = true;
  // Ausblenden hält sein Ende (fill), bis das Einblenden läuft – dann wird es beendet, sonst bliebe die Seite unsichtbar,
  // wenn Lit dasselbe Element weiterverwendet oder nicht gewechselt wird
  const raus = el && typeof el.animate === 'function'
    ? el.animate([{ transform: von, opacity: 1 }, { transform: `translateX(${-dir * 35}%)`, opacity: 0 }], { duration: 150, easing: 'ease-in', fill: 'forwards' }) : null;
  try {
    wischHinweisWeg(p);
    if (raus) await raus.finished.catch(() => {});
    if (bereit(p)) await p.containerOeffnen(z.id);   // in der Zwischenzeit Einblendung geöffnet oder weg → nicht wechseln
  } finally { p._wischLaeuft = false; }
  anim(seiteEl(p), [{ transform: `translateX(${dir * 35}%)`, opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 220, easing: 'cubic-bezier(.2,.7,.2,1)' });
  if (raus) raus.cancel();
}

/* Wischen: Zeiger-Ereignisse am Shadow Root, nur Finger und Stift */
export function wischenAn(p, root) {
  let z = null;   // { id, x, y, el, waag }
  const weg = () => { if (z && z.el) { z.el.style.transform = ''; z.el.style.userSelect = ''; } z = null; };
  root.addEventListener('pointerdown', e => {
    if (e.pointerType !== 'touch' && e.pointerType !== 'pen') return;
    if (!bereit(p)) return;
    const t = (e.composedPath && e.composedPath()[0]) || e.target;
    if (!t || !t.closest || t.closest(NICHT) || !t.closest('.seite')) return;
    z = { id: e.pointerId, x: e.clientX, y: e.clientY, el: seiteEl(p), waag: false };
  });
  root.addEventListener('pointermove', e => {
    if (!z || e.pointerId !== z.id) return;
    if (!bereit(p)) return weg();
    const dx = e.clientX - z.x, dy = e.clientY - z.y;
    if (!z.waag) {
      if (Math.abs(dx) < 10 && Math.abs(dy) < 10) return;
      if (Math.abs(dx) <= Math.abs(dy) * WISCH_VERHAELTNIS) return weg();   // senkrecht: der Browser scrollt
      z.waag = true; if (z.el) z.el.style.userSelect = 'none';
    }
    if (z.el) z.el.style.transform = `translateX(${ziel(p, dx < 0 ? 1 : -1) ? dx : dx * 0.25}px)`;   // am Ende zäh
  });
  root.addEventListener('pointerup', e => {
    if (!z || e.pointerId !== z.id) return;
    const dx = e.clientX - z.x, dy = e.clientY - z.y, el = z.el, von = (el && el.style.transform) || 'none';
    const ok = z.waag && bereit(p) && Math.abs(dx) > WISCH_SCHWELLE && Math.abs(dx) >= Math.abs(dy) * WISCH_VERHAELTNIS;
    weg();
    if (ok) wischWechseln(p, dx < 0 ? 1 : -1, von);
    else if (von !== 'none') anim(el, [{ transform: von }, { transform: 'none' }], { duration: 180, easing: 'ease-out' });
  });
  root.addEventListener('pointercancel', weg);   // Browser übernimmt (senkrechtes Scrollen)
}

/* Pfeiltasten am Desktop: nicht in Eingaben, nicht mit Zusatztasten (Alt+← = Zurück), nicht bei offener Einblendung */
export function wischTaste(p, e) {
  if ((e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') || e.altKey || e.ctrlKey || e.metaKey || e.shiftKey || e.defaultPrevented) return;
  if (p.narrow || !bereit(p)) return;
  const t = (e.composedPath && e.composedPath()[0]) || e.target;
  if (t && t.closest && t.closest('input, select, textarea, [contenteditable], [role="slider"]')) return;
  e.preventDefault();
  wischWechseln(p, e.key === 'ArrowRight' ? 1 : -1);
}

/* Hinweis „← wischen →“ einmal je Gerät (im Browser gemerkt), nur am Handy */
function hinweisZeigen(p) {
  if (!p.narrow) return false;
  if (p._wischHinweis === undefined) {
    let gesehen = false;
    try { gesehen = !!localStorage.getItem(HINWEIS_SPEICHER); } catch (e) { gesehen = false; }
    p._wischHinweis = !gesehen;
    if (p._wischHinweis) {
      try { localStorage.setItem(HINWEIS_SPEICHER, '1'); } catch (e) { /* ohne Speicher: nur in dieser Sitzung */ }
      setTimeout(() => wischHinweisWeg(p), 3500);
    }
  }
  return p._wischHinweis;
}
function wischHinweisWeg(p) { if (p._wischHinweis) { p._wischHinweis = false; p.neuZeichnen(); } }

/* Kopfzeile der Container-Ansicht: ‹ Übersicht · ‹ 2 / 6 › · Bearbeiten */
export function blaetterZeile(p) {
  const { i, n } = wischLage(p), mit = i >= 0 && n > 1, vor = mit && ziel(p, -1), nach = mit && ziel(p, 1), hinweis = mit && hinweisZeigen(p);
  return html`<div class="zurueck-zeile w-zeile"><button class="glas-panel chip" @click=${() => p.gehe('uebersicht')}>‹ Übersicht</button>
      ${mit ? html`<div class="glas-panel w-nav" role="group" aria-label="Container blättern">
        <button class="w-pfeil" data-w="-1" ?disabled=${!vor} title=${vor ? `Vorheriger: ${vor.name}` : 'erster Container'} aria-label="Vorheriger Container" @click=${() => wischWechseln(p, -1)}>‹</button>
        <span class="w-pos">${i + 1} / ${n}</span>
        <button class="w-pfeil" data-w="1" ?disabled=${!nach} title=${nach ? `Nächster: ${nach.name}` : 'letzter Container'} aria-label="Nächster Container" @click=${() => wischWechseln(p, 1)}>›</button></div>` : nothing}
      <button class="glas-panel chip" @click=${() => p.einblenden('bereich')}>Bearbeiten</button>
      ${hinweis ? html`<div class="w-hinweis" @click=${() => wischHinweisWeg(p)}>← wischen →</div>` : nothing}</div>`;
}

export const WISCHEN_CSS = `
.seite:has(.w-nav) { touch-action: pan-y pinch-zoom; }   /* senkrecht scrollt (und zoomt) der Browser, waagrecht bekommt die Seite */
.w-zeile { position: relative; align-items: center; gap: 8px; }
.w-nav { display: inline-flex; align-items: center; gap: 2px; padding: 2px 4px; border-radius: 999px; min-width: 0; }
.w-pfeil { width: 34px; height: 30px; border: 0; background: none; color: var(--ink); font-size: 22px; line-height: 1; cursor: pointer; border-radius: 999px; }
.w-pfeil:disabled { opacity: .25; cursor: default; }
.w-pos { font-size: 13px; font-variant-numeric: tabular-nums; color: var(--ink2); min-width: 38px; text-align: center; white-space: nowrap; }
.w-hinweis { position: absolute; top: calc(100% + 8px); left: 50%; transform: translateX(-50%); z-index: 3; font-size: 13px; padding: 6px 14px; border-radius: 999px;
  background: color-mix(in srgb, var(--amber) 85%, transparent); color: #000; white-space: nowrap; animation: w-wink 1.2s ease-in-out 3; cursor: pointer; }
@keyframes w-wink { 0%, 100% { transform: translateX(-50%); } 30% { transform: translateX(calc(-50% - 10px)); } 70% { transform: translateX(calc(-50% + 10px)); } }
`;
