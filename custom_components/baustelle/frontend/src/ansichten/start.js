// „So rechnet der Start“ im Lernstand (Mockup start.html, Variante B, Herbert 29.10.2026; FE-0031/FE-0032).
// Alle Werte, Uhrzeiten, Sätze, Kacheln und Kurvenpunkte liefert die Integration (laufzeit.container.<id>.start,
// logik/start.py); die Seite setzt nur ein und zeichnet: Achsen = Skalierung der gelieferten Punkte, Farbe = vor/nach dem
// Start, Strich = Quelle des Punkts (gemessen durchgezogen, Prognose gestrichelt), Zeitpunkte aus `start.min`.
import { html, nothing } from 'lit';
import { unsafeHTML } from 'lit/directives/unsafe-html.js';
import { de } from '../hilfen.js';

const MARKE = { gelernt: 'st-m-gel', geschaetzt: 'st-m-ges', gemessen: 'st-m-mes', einstellung: 'st-m-ein' };
const marke = s => s.marke ? html`<span class="st-m ${MARKE[s.marke] || ''}">${s.marke === 'geschaetzt' ? '≈ ' : s.marke === 'gelernt' ? '🧠 ' : ''}${s.marke_t}</span>` : nothing;
const grad = (x, n = 1) => de(x, n).replace('-', '−');
const uhrMin = m => { m = ((Math.round(m) % 1440) + 1440) % 1440; return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`; };

/** Zeitstrahl als SVG-Text: Innen gemessen/Prognose, Außen je Stunde, Soll, Grenze, Jetzt, Start, warm */
export function startKurveSvg(S, schmal) {
  const W = schmal ? 320 : 440, H = schmal ? 226 : 236, l = 30, r = W - 12, o = 46, u = H - 34, fs = schmal ? 10 : 11;
  const K = S.kurve || [], A = S.aussen_vorhersage || [], M = S.min || {}, alle = [...K, ...A];
  if (!K.length) return '';
  const bg = M.beginn, wm = M.warm, ab = M.arbeitsbeginn, gr = M.grenze, jt = M.jetzt;
  const t0 = Math.min(...alle.map(k => k[0]), bg, jt), t1 = Math.max(ab, wm, ...alle.map(k => k[0])) + 10;
  const cMin = Math.floor(Math.min(...alle.map(k => k[1])) - 1), cMax = Math.ceil(Math.max(S.soll, ...alle.map(k => k[1])) + 1);
  const x = m => +(l + (m - t0) / (t1 - t0) * (r - l)).toFixed(1), y = c => +(u - (c - cMin) / (cMax - cMin) * (u - o)).toFixed(1);
  const T = [];
  if (wm > bg) T.push(`<rect class="st-band" x="${x(bg)}" y="${o - 4}" width="${(x(wm) - x(bg)).toFixed(1)}" height="${u - o + 4}"></rect>`);
  T.push(`<line class="st-soll" x1="${l}" x2="${r}" y1="${y(S.soll)}" y2="${y(S.soll)}"></line><text class="st-ax" x="${l - 4}" y="${y(S.soll) + 4}" text-anchor="end" font-size="${fs}">${grad(S.soll, 0)}°</text>`);
  if (cMin < 0) T.push(`<line class="st-null" x1="${l}" x2="${r}" y1="${y(0)}" y2="${y(0)}"></line><text class="st-ax" x="${l - 4}" y="${y(0) + 4}" text-anchor="end" font-size="${fs}">0°</text>`);
  T.push(`<text class="st-ax" x="${l - 4}" y="${y(cMin) + 4}" text-anchor="end" font-size="${fs}">${grad(cMin, 0)}°</text>`);
  if (gr >= t0) { const links = gr < jt && x(gr) - l > 80;   // Beschriftung weg vom Jetzt-Strich, nie über den Rand
    T.push(`<line class="st-gr" x1="${x(gr)}" x2="${x(gr)}" y1="${o - 30}" y2="${u}"></line><text class="st-ax st-gr-t" x="${x(gr) + (links ? -3 : 3)}" y="${o - 26}" text-anchor="${links ? 'end' : 'start'}" font-size="${fs - 1}">frühestens ${S.grenze}</text>`); }
  for (let i = 1; i < A.length; i++) T.push(`<line class="st-aussen ${A[i][2] === 'vorhersage' ? 'prog' : ''}" x1="${x(A[i - 1][0])}" y1="${y(A[i - 1][1])}" x2="${x(A[i][0])}" y2="${y(A[i][1])}"></line>`);
  for (const a of A) T.push(`<circle class="st-apkt ${a[2] === 'vorhersage' ? 'prog' : ''}" cx="${x(a[0])}" cy="${y(a[1])}" r="${a[2] === 'vorhersage' ? 2.2 : 1.6}"></circle>`);
  if (A.length) { const aL = A[A.length - 1]; T.push(`<text class="st-ax st-a-t" x="${x(aL[0])}" y="${y(aL[1]) - 6}" text-anchor="end" font-size="${fs - 1}">außen ${grad(aL[1], 0)}°</text>`); }
  for (let i = 1; i < K.length; i++) { const [m0, c0] = K[i - 1], [m1, c1, q] = K[i];
    T.push(`<line class="st-i ${m1 <= bg ? 'kalt' : 'warm'} ${q === 'prognose' ? 'prog' : ''}" x1="${x(m0)}" y1="${y(c0)}" x2="${x(m1)}" y2="${y(c1)}"></line>`); }
  T.push(`<line class="st-jetzt" x1="${x(jt)}" x2="${x(jt)}" y1="${o - 36}" y2="${u}"></line><text class="st-ax st-fett" x="${x(jt) - 3}" y="${o - 8}" text-anchor="end" font-size="${fs}">jetzt ${S.jetzt}</text>`);
  T.push(`<text class="st-ax st-klein" x="${x(jt) - 3}" y="${o - 26}" text-anchor="end" font-size="${fs - 1}">◂ gemessen</text>`);
  if (t1 - jt > 30) T.push(`<text class="st-ax st-klein" x="${x(jt) + 3}" y="${o - 26}" font-size="${fs - 1}">Prognose ▸</text>`);
  const kj = K.find(k => k[0] === jt) || K[K.length - 1];
  T.push(`<circle class="st-pkt" cx="${x(kj[0])}" cy="${y(kj[1])}" r="3.5"></circle><text class="st-wert" x="${x(kj[0]) + (S.laeuft ? -6 : 5)}" y="${y(kj[1]) - 7}" text-anchor="${S.laeuft ? 'end' : 'start'}" font-size="${fs}">${grad(kj[1])}°</text>`);
  T.push(`<circle class="st-pkt kalt" cx="${x(bg)}" cy="${y(S.innen_start)}" r="3.5"></circle><text class="st-wert" x="${x(bg) + 5}" y="${y(S.innen_start) + 4}" font-size="${fs}">${S.laeuft ? '' : '≈ '}${grad(S.innen_start)}°</text>`);
  T.push(`<circle class="st-pkt warm" cx="${x(wm)}" cy="${y(S.soll)}" r="3.5"></circle><text class="st-ax st-fett" x="${x(wm)}" y="${o - 8}" text-anchor="middle" font-size="${fs}">warm ${S.warm}</text>`);
  T.push(`<line class="st-achse" x1="${l}" x2="${r}" y1="${u}" y2="${u}"></line>`);
  const gesetzt = [];   // Zeitachse: Start zuerst, dann Arbeitsbeginn und Anfang – zu nahe Beschriftungen entfallen
  for (const [m, t, an, kl] of [[bg, `${S.beginn} Start`, 'middle', 'st-fett'], [ab, S.arbeitsbeginn, 'end', ''], [t0, S.achse_ab || uhrMin(t0), 'start', '']]) {
    if (gesetzt.some(g => Math.abs(x(g) - x(m)) < 70)) continue;
    gesetzt.push(m);
    T.push(`<line class="st-tick" x1="${x(m)}" x2="${x(m)}" y1="${u}" y2="${u + 4}"></line><text class="st-ax ${kl}" x="${x(m)}" y="${u + 16}" text-anchor="${an}" font-size="${fs}">${t}</text>`);
  }
  return `<svg class="st-svg" viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="Innen- und Außentemperatur bis zum Arbeitsbeginn">${T.join('')}</svg>`;
}

/** Abschnitt „So rechnet der Start“ im Lernstand (statt der Zeile „Heute ab …“) */
export function startAbschnitt(p, b) {
  const S = b && b.start; if (!S) return nothing;
  const kopf = html`<div class="gruppe-t st-gt">So rechnet der Start</div>
    <div class="st-ergebnis ${S.begrenzt ? 'amber' : ''}"><span>${S.laeuft ? html`Heizt seit <b>${S.beginn}</b> · warm um <b>≈ ${S.warm}</b>` : html`Start <b>${S.tag_t} ${S.beginn}</b> · warm um <b>${S.begrenzt ? '≈ ' : ''}${S.warm}</b>`}</span>
      ${S.geschaetzt ? html`<span class="st-m st-m-ges">≈ noch geschätzt</span>` : nothing}${S.begrenzt ? html`<span class="st-m st-m-amb">Grenze erreicht</span>` : nothing}</div>`;
  const legende = html`<div class="st-leg"><span><i class="st-l-gem"></i>gemessen</span><span><i class="st-l-prog"></i>Prognose</span><span><i class="st-l-kalt"></i>kühlt ab</span><span><i class="st-l-warm"></i>heizt</span><span><i class="st-l-aus"></i>außen je Stunde (Vorhersage)</span></div>`;
  const kacheln = html`<div class="st-zahlen">${(S.schritte || []).map(z => html`<div class="st-z ${z.ton || ''} ${z.k === 'kuehl' ? 'breit' : ''}" data-k=${z.k}><span class="st-t">${z.t}</span><b>${z.wert}</b><span class="st-r">${z.rechnung}</span>${marke(z)}</div>`)}</div>`;
  return html`<div class="st-ab" data-start=${S.tag}>${kopf}<div class="st-kurve">${unsafeHTML(startKurveSvg(S, !!p.narrow))}</div>${legende}${kacheln}
    ${S.geschaetzt ? html`<div class="leise st-fuss">Noch nicht gelernt: geschätzt ${S.schaetz_grund}, mit Reserve. Nach ein paar Nächten lernt er τ, nach 3 gemessenen Aufheizungen die Rate.</div>` : nothing}
    <div class="leise st-fuss">↻ Rechnet bei jedem neuen Messwert und jeder neuen Vorhersage nach; weicht das Auskühlen ab, lernt er τ nach · Stand ${S.jetzt} · Regelung, „Jetzt“ und „Plan“ zeigen dieselbe Rechnung</div></div>`;
}

/** CSS des Abschnitts und des Plan-Chips (aus dem Mockup start.html) */
export const START_STIL = `
@container (min-width: 641px) { .ck-d .ckd-gruppen .ckd-g[data-g="Plan"] { grid-column: span 2; } }   /* Plan-Chip mit Tag und zwei Uhrzeiten: zwei Spalten breit */
.st-link { border: 0; background: none; padding: 0; font: inherit; color: var(--blau); cursor: pointer; white-space: nowrap; }
.st-stand { opacity: .8; }
.st-mini { font-size: 10.5px; padding: 0 5px; border-radius: 5px; border: 1px dashed var(--amber); color: var(--amber); margin-left: 2px; }
.st-ab { margin: 4px 0 14px; padding: 12px 14px; border-radius: 14px; background: rgba(120,120,128,.12); display: flex; flex-direction: column; gap: 8px; }
.st-gt { margin: 0 0 -4px; }
.st-ergebnis { font-size: 17px; display: flex; flex-wrap: wrap; align-items: center; gap: 4px 8px; }
.st-ergebnis b { font-weight: 650; color: var(--ink); }
.st-m { font-size: 11px; padding: 1px 7px; border-radius: 8px; white-space: nowrap; border: 1px solid rgba(120,120,128,.35); color: var(--ink2); }
.st-m-gel { border-color: color-mix(in srgb, var(--blau) 55%, transparent); color: var(--blau); }
.st-m-ges, .st-m-amb { border: 1px dashed var(--amber); color: var(--amber); }
.st-m-mes { opacity: .8; }
.st-fuss { font-size: 12px; }
.st-kurve { width: 100%; }
.st-svg { display: block; overflow: visible; }
.st-svg .st-achse, .st-svg .st-tick { stroke: var(--ink2); stroke-width: 1; opacity: .5; }
.st-svg .st-soll { stroke: var(--ink2); stroke-dasharray: 3 4; opacity: .6; }
.st-svg .st-null { stroke: var(--ink2); stroke-width: .8; opacity: .3; }
.st-svg .st-gr { stroke: var(--amber); stroke-dasharray: 2 3; stroke-width: 1.2; }
.st-svg .st-gr-t { fill: var(--amber); }
.st-svg .st-band { fill: var(--amber); opacity: .12; }
.st-svg .st-i { stroke-width: 2.6; stroke-linecap: round; }
.st-svg .st-i.kalt { stroke: var(--blau); } .st-svg .st-i.warm { stroke: var(--amber); }
.st-svg .st-i.prog { stroke-dasharray: 5 4; stroke-linecap: butt; }
.st-svg .st-aussen { stroke: var(--ink2); stroke-width: 1.2; opacity: .55; } .st-svg .st-aussen.prog { stroke-dasharray: 3 3; }
.st-svg .st-apkt { fill: var(--ink2); opacity: .7; }
.st-svg .st-a-t { opacity: .85; }
.st-svg .st-pkt { fill: var(--ink); } .st-svg .st-pkt.warm { fill: var(--amber); } .st-svg .st-pkt.kalt { fill: var(--blau); }
.st-svg .st-jetzt { stroke: var(--ink); stroke-width: 1.2; opacity: .75; }
.st-svg text { fill: var(--ink2); font-family: inherit; }
.st-svg .st-fett, .st-svg .st-wert { fill: var(--ink); font-weight: 600; }
.st-svg .st-klein { opacity: .8; }
.st-leg { display: flex; flex-wrap: wrap; gap: 4px 12px; font-size: 11.5px; color: var(--ink2); }
.st-leg span { display: inline-flex; align-items: center; gap: 5px; white-space: nowrap; }
.st-leg i { display: inline-block; width: 16px; height: 0; border-top: 2.5px solid var(--ink2); }
.st-leg .st-l-prog { border-top-style: dashed; }
.st-leg .st-l-kalt { border-top-color: var(--blau); } .st-leg .st-l-warm { border-top-color: var(--amber); }
.st-leg .st-l-aus { border-top-width: 1.2px; border-top-style: dashed; opacity: .7; }
.st-zahlen { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; }
.st-z { display: flex; flex-direction: column; gap: 2px; padding: 8px 10px; border-radius: 10px; background: rgba(120,120,128,.12); min-width: 0; }
.st-z.breit { grid-column: 1 / -1; }
.st-z.breit ~ .st-z:last-child:nth-child(even) { grid-column: 1 / -1; }   /* übrig bleibende Kachel über die ganze Breite */
.st-z .st-t { font-size: 11px; text-transform: uppercase; letter-spacing: .5px; color: var(--ink2); }
.st-z b { color: var(--ink); font-weight: 650; }
.st-z .st-r { font-size: 12px; color: var(--ink2); }
.st-z .st-m { align-self: flex-start; margin-top: 2px; white-space: normal; }
.st-z.amber b { color: var(--amber); }
.st-z.ergebnis { background: color-mix(in srgb, var(--amber) 14%, transparent); }
@container (max-width: 640px) {
  .st-ab { padding: 10px 10px; }
  .st-ergebnis { font-size: 15.5px; }
}`;
