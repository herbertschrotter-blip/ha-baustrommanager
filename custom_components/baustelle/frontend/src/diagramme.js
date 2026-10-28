// Diagramme der Seite „Baustelle“: Linie, Balken, Stufen, Streuung, Fläche, kleine Kachel-Diagramme (BSM-022 Stufe 1b).
// Nur Darstellung der Werte, die die Integration liefert.
import { de, esc, zahl } from './hilfen.js';

/* ---------- Diagramme: dünne Marken, Haarraster, Hover-Anzeige (aus dem Mockup) ---------- */
export const CHARTS = {};

export function linie(id, reihen, einheit, vb = null) {
  // mit vb: Verbrauch als Fläche im selben Diagramm – links °C, rechts kWh (Herbert, 29.09.2026)
  const W = 320, H = 160, L = 28, R = vb ? 30 : 8, T = 16, U = 22;
  const alle = reihen.flatMap(s => s.v.filter(v => zahl(v)));
  if (!alle.length) return '<div class="leer">Noch keine Werte</div>';
  let lo = Math.floor(Math.min(...alle) / 5) * 5, hi = Math.ceil(Math.max(...alle) / 5) * 5; if (hi === lo) hi = lo + 5;
  const n = (hi - lo) / 5;
  const x = i => L + i / 24 * (W - L - R), y = v => T + (1 - (v - lo) / (hi - lo)) * (H - T - U);
  const raster = [...Array(n + 1)].map((_, k) => lo + k * 5).map(v =>
    `<line x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}" class="gr"/><text x="${L - 5}" y="${y(v) + 3}" class="ax" text-anchor="end">${v}°</text>`).join('');
  const achse = [0, 6, 12, 18, 24].map(h => `<text x="${x(h)}" y="${H - 6}" class="ax" text-anchor="middle">${String(h).padStart(2, '0')}</text>`).join('');
  const pfade = reihen.map((s, k) => `<path d="${s.v.map((v, i) => !zahl(v) ? '' : `${i && zahl(s.v[i - 1]) ? 'L' : 'M'}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join('') || `M${L} ${H - U}`}" fill="none" stroke="var(--s${k + 1})" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>`).join('');
  let flaeche = '', rechts = '', yv = null;
  if (vb && vb.length) {
    // rechte Achse auf dieselben Rasterlinien legen: n Schritte, Schrittweite glatt gerundet
    const roh = Math.max(...vb, 0.01) * 1.1 / n, schritt = [.1, .2, .25, .5, 1, 1.5, 2, 2.5, 5].find(st => st >= roh) || 10, vmax = schritt * n;
    yv = v => T + (1 - v / vmax) * (H - T - U);
    const wert = i => vb[Math.min(i, vb.length - 1)] || 0, k = reihen.length + 1;
    const d = [...Array(25)].map((_, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${yv(wert(i)).toFixed(1)}`).join('');
    flaeche = `<defs><linearGradient id="vbg-${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="var(--s${k})" stop-opacity=".42"/><stop offset="1" stop-color="var(--s${k})" stop-opacity=".06"/></linearGradient></defs>
      <path class="fl-flaeche" d="${d}L${x(24)} ${yv(0)}L${x(0)} ${yv(0)}z" fill="url(#vbg-${id})"/><path class="fl-linie" d="${d}" fill="none" stroke="var(--s${k})" stroke-width="1.5" stroke-linejoin="round" opacity=".8"/>`;
    rechts = [...Array(n + 1)].map((_, q) => q * schritt).map(v => `<text x="${W - R + 5}" y="${yv(v) + 3}" class="ax">${de(v, schritt < 1 ? (schritt < .25 ? 1 : 2) : 0)}</text>`).join('')
      + `<text x="${W - R + 5}" y="${T - 7}" class="ax ax-e">kWh</text>`;
  } else vb = null;
  const links = `<text x="${L - 5}" y="${T - 7}" class="ax ax-e" text-anchor="end">°C</text>`;
  CHARTS[id] = { art: 'linie', x0: L, x1: W - R, W, n: 25, reihen, einheit, y, vb, yv, unten: H - U };
  return `<svg class="chart" data-chart="${id}" viewBox="0 0 ${W} ${H}">${raster}${achse}${flaeche}${pfade}${vb ? links + rechts : ''}<g class="hover"></g></svg>
    <div class="legende">${reihen.map((s, k) => `<span><i style="background:var(--s${k + 1})"></i>${s.name} (°C, links)</span>`).join('')}${vb ? `<span><i style="background:var(--s${reihen.length + 1})"></i>Verbrauch (kWh je Stunde, rechts)</span>` : ''}</div>`;
}

/* Mehrere Temperaturlinien über Stunden oder Tage: alle Container und außen in einem Diagramm (0.7.8) */
export function linien(id, reihen, labels, jedes, titel) {
  const W = 320, H = 170, L = 28, R = 8, T = 16, U = 22, n = labels.length;
  const alle = reihen.flatMap(s => s.v.filter(zahl));
  if (!alle.length) return '<div class="leer">Noch keine Werte</div>';
  const lo = Math.floor(Math.min(...alle) / 5) * 5, hi = Math.max(lo + 5, Math.ceil(Math.max(...alle) / 5) * 5);
  const x = i => L + i / Math.max(1, n - 1) * (W - L - R), y = v => T + (1 - (v - lo) / (hi - lo)) * (H - T - U);
  const raster = [...Array((hi - lo) / 5 + 1)].map((_, k) => lo + k * 5).map(v =>
    `<line x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}" class="gr"/><text x="${L - 5}" y="${y(v) + 3}" class="ax" text-anchor="end">${v}°</text>`).join('');
  const achse = labels.map((t, i) => i % jedes ? '' : `<text x="${x(i)}" y="${H - 6}" class="ax" text-anchor="middle">${t}</text>`).join('');
  const pfade = reihen.map(s => `<path d="${s.v.map((v, i) => !zahl(v) ? '' : `${i && zahl(s.v[i - 1]) ? 'L' : 'M'}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join('')}" fill="none" stroke="${s.farbe}" stroke-width="${s.aussen ? 1.5 : 2}" ${s.aussen ? 'stroke-dasharray="4 4"' : ''} stroke-linejoin="round" stroke-linecap="round"/>`).join('');
  CHARTS[id] = { art: 'linien', x0: L, x1: W - R, W, n, reihen, y, unten: H - U, titel };
  return `<svg class="chart" data-chart="${id}" viewBox="0 0 ${W} ${H}">${raster}${achse}${pfade}<text x="${L - 5}" y="${T - 7}" class="ax ax-e" text-anchor="end">°C</text><g class="hover"></g></svg>
    <div class="legende">${reihen.map(s => `<span><i style="background:${s.farbe}"></i>${esc(s.name)}</span>`).join('')}</div>`;
}

export function balken(id, werte, labels, einheit, d = 1) {
  werte = werte.map(v => zahl(v) ? Number(v) : 0);
  const W = 320, H = 150, L = 28, R = 8, T = 10, U = 22, n = werte.length, hi = Math.max(...werte, 0) * 1.15 || 1;
  const bw = (W - L - R) / n, y = v => T + (1 - v / hi) * (H - T - U), stufe = hi > 20 ? 10 : hi > 6 ? 2 : hi > 2 ? 1 : .5;
  const raster = [...Array(Math.floor(hi / stufe) + 1)].map((_, k) => k * stufe).map(v =>
    `<line x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}" class="gr"/><text x="${L - 5}" y="${y(v) + 3}" class="ax" text-anchor="end">${de(v, stufe < 1 ? 1 : 0)}</text>`).join('');
  const b = werte.map((v, i) => { const h = H - U - y(v), bx = L + i * bw + 1, w = bw - 2;
    return `${v > 0 ? `<path d="M${bx} ${H - U}V${y(v) + Math.min(4, h)}q0 -4 4 -4h${w - 8}q4 0 4 4V${H - U}z" fill="var(--s1)" class="bar" data-i="${i}"/>` : ''}
      <text x="${bx + w / 2}" y="${H - 6}" class="ax" text-anchor="middle">${labels[i]}</text>`; }).join('');
  CHARTS[id] = { art: 'balken', werte, labels, einheit, d };
  return `<svg class="chart" data-chart="${id}" viewBox="0 0 ${W} ${H}">${raster}${b}<rect class="treffer" x="0" y="0" width="0" height="0"/></svg>`;
}

/* AN-0005: Leistung je Messwert über eine Stunde (Stufen, wie der Shelly meldet); reihen [{name, farbe, punkte: [[ms, W]]}];
   FE-0024: jetzt [ms, 'hh:mm'] bei laufender Stunde/laufendem Tag – die Kurven enden dort, eine Linie zeigt „jetzt“ */
export function stufen(id, reihen, von, bis, einheit = 'W', achse = null, jetzt = null) {
  const W = 320, H = 160, L = 34, R = 8, T = 10, U = 22, alle = reihen.flatMap(r => r.punkte.map(p => p[1])).filter(zahl);
  const hi = Math.max(...alle, 0) * 1.1 || 100, x = t => L + (Math.min(bis, Math.max(von, t)) - von) / (bis - von) * (W - L - R), y = v => T + (1 - v / hi) * (H - T - U);
  const stufe = hi > 4000 ? 1000 : hi > 2000 ? 500 : hi > 800 ? 200 : hi > 300 ? 100 : 50;
  const raster = [...Array(Math.floor(hi / stufe) + 1)].map((_, k) => k * stufe).map(v => `<line x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}" class="gr"/><text x="${L - 5}" y="${y(v) + 3}" class="ax" text-anchor="end">${v >= 1000 ? de(v / 1000, 1) + ' k' : v}</text>`).join('');
  const marken = achse || [0, 10, 20, 30, 40, 50, 60].map(m => [von + m * 6e4, `:${String(m % 60).padStart(2, '0')}`]);   // WU-0011: Tag mit Stunden
  const achseSvg = marken.map(([t, l]) => `<text x="${x(t)}" y="${H - 6}" class="ax" text-anchor="middle">${l}</text>`).join('');
  const ende = jetzt && jetzt[0] > von && jetzt[0] < bis ? jetzt[0] : bis;
  const pfade = reihen.map(r => { let d = ''; r.punkte.forEach(([t, v], i) => { const nx = i + 1 < r.punkte.length ? r.punkte[i + 1][0] : ende; if (!zahl(v)) return;
      d += `${d ? 'L' : 'M'}${x(t).toFixed(1)} ${y(v).toFixed(1)}H${x(nx).toFixed(1)}`; });
    return d ? `<path d="${d}" fill="none" stroke="${r.farbe}" stroke-width="${r.summe ? 2.4 : 1.6}" ${r.summe ? '' : 'opacity=".75"'}/>` : ''; }).join('');
  const jetztSvg = ende < bis ? `<g class="jetzt"><line x1="${x(ende).toFixed(1)}" x2="${x(ende).toFixed(1)}" y1="${T}" y2="${H - U}" stroke="var(--s1)" stroke-dasharray="3 3" opacity=".7"/>`
    + `<text x="${x(ende).toFixed(1)}" y="${T - 1}" class="ax" text-anchor="${x(ende) > W - R - 40 ? 'end' : 'middle'}">jetzt ${jetzt[1]}</text></g>` : '';
  CHARTS[id] = { art: 'stufen', einheit, reihen, von, bis, L, B: W - R, W, x, y, unten: H - U };
  return `<svg class="chart" data-chart="${id}" viewBox="0 0 ${W} ${H}">${raster}${achseSvg}${pfade}${jetztSvg}<g class="hover"></g></svg>`;
}

export function streu(id, pkt, k, d0, grenze = null) {   // grenze: Heizgrenze der Signatur – darüber waagrecht (BSM-033)
  const W = 320, H = 170, L = 30, R = 8, T = 10, U = 24;
  const tx = [-10, -5, 0, 5, 10, 15], ymax = Math.max(50, Math.ceil(Math.max(...pkt.map(q => q[1])) / 50) * 50);
  const x = t => L + (Math.max(-10, Math.min(15, t)) + 10) / 25 * (W - L - R), y = v => T + (1 - v / ymax) * (H - T - U);
  const raster = [...Array(ymax / 50 + 1)].map((_, q) => q * 50).map(v => `<line x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}" class="gr"/><text x="${L - 5}" y="${y(v) + 3}" class="ax" text-anchor="end">${v}</text>`).join('');
  const achse = tx.map(t => `<text x="${x(t)}" y="${H - 8}" class="ax" text-anchor="middle">${t}°</text>`).join('');
  const t1 = -8, t2 = grenze !== null ? Math.min(15, grenze) : k < 0 ? Math.min(15, -d0 / k) : 15, yy = t => y(Math.max(0, Math.min(ymax, k * t + d0)));
  const trend = `<polyline points="${x(t1)},${yy(t1)} ${x(t2)},${yy(t2)}${grenze !== null && t2 < 15 ? ` ${x(15)},${yy(t2)}` : ''}" fill="none" stroke="var(--s2)" stroke-width="2" stroke-dasharray="5 4"/>`;
  const punkte = pkt.map((q, i) => `<circle class="punkt-s" data-i="${i}" cx="${x(q[0]).toFixed(1)}" cy="${y(q[1]).toFixed(1)}" r="4.5" fill="var(--s1)"/>`).join('');
  CHARTS[id] = { art: 'streu', pkt, x, y };
  return `<svg class="chart" data-chart="${id}" viewBox="0 0 ${W} ${H}">${raster}${achse}<text x="${W - R}" y="${H - 8}" class="ax" text-anchor="end" dx="0" opacity="0">.</text>${trend}${punkte}<g class="hover"></g></svg>
    <div class="legende"><span><i style="background:var(--s1)"></i>ein Heiztag</span><span><i style="background:var(--s2)"></i>Trend</span><span class="leise">x: Tagesmittel außen · y: kWh</span></div>`;
}

export function flaeche(id, reihen, labels, einheit, jedes, vergleich = null, breite = 320) {   // vergleich: { name, v } gestrichelt (WU-0013); breite: Kachel L füllt die Breite
  const W = breite, H = 160, L = 30, R = 8, T = 10, U = 22, n = labels.length, viele = reihen.length > 1;
  reihen = reihen.map(r => ({ ...r, v: labels.map((_, i) => zahl(r.v[i]) ? Number(r.v[i]) : 0) }));
  // gestapelt: jede Reihe liegt auf der Summe der darunterliegenden, die oberste Kante ist die Summe der Auswahl
  let unten = Array(n).fill(0);
  const lagen = reihen.map(r => { const u = unten, o = r.v.map((v, i) => u[i] + v); unten = o; return { ...r, u, o }; });
  const vv = vergleich ? labels.map((_, i) => zahl(vergleich.v[i]) ? Number(vergleich.v[i]) : 0) : null;
  const hi0 = Math.max(...unten, ...(vv || []), 0) * 1.1 || 1;
  const stufe = [.5, 1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000].find(st => hi0 / st <= 5) || 10000, hi = Math.ceil(hi0 / stufe) * stufe;
  const x = i => L + i / Math.max(1, n - 1) * (W - L - R), y = v => T + (1 - v / hi) * (H - T - U);
  const raster = [...Array(Math.round(hi / stufe) + 1)].map((_, k) => k * stufe).map(v =>
    `<line x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}" class="gr"/><text x="${L - 5}" y="${y(v) + 3}" class="ax" text-anchor="end">${de(v, stufe < 1 ? 1 : 0)}</text>`).join('');
  const achse = labels.map((t, i) => i % jedes ? '' : `<text x="${x(i)}" y="${H - 6}" class="ax" text-anchor="middle">${t}</text>`).join('');
  const g = k => `fl-${id.replace(/[^a-z0-9]/gi, '')}-${k}`;
  const defs = lagen.map((r, k) => `<linearGradient id="${g(k)}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${r.farbe}" stop-opacity="${viele ? .75 : .45}"/><stop offset="1" stop-color="${r.farbe}" stop-opacity="${viele ? .45 : .03}"/></linearGradient>`).join('');
  const linieD = a => a.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join('');
  const zurueck = a => a.map((v, i) => [i, v]).reverse().map(([i, v]) => `L${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join('');
  const flaechen = lagen.map((r, k) => `<path class="fl-flaeche" style="animation-delay:${k * 40}ms" d="${linieD(r.o)}${zurueck(r.u)}z" fill="url(#${g(k)})"/>`).join('');
  const kanten = lagen.map(r => `<path class="fl-linie" d="${linieD(r.o)}" fill="none" stroke="${viele ? 'var(--trenn)' : r.farbe}" stroke-width="${viele ? 1.5 : 2}" stroke-linejoin="round"/>`).join('');
  const oben = viele ? `<path d="${linieD(unten)}" fill="none" stroke="var(--ink)" stroke-width="1.5" stroke-linejoin="round" opacity=".8"/>` : '';
  const vglSvg = vv ? `<path d="${linieD(vv)}" fill="none" stroke="var(--ink2)" stroke-width="1.6" stroke-dasharray="5 4" stroke-linejoin="round"/>` : '';
  CHARTS[id] = { art: 'flaeche', x0: L, x1: W - R, W, n, reihen: lagen, labels, einheit, y, vergleich: vv, vglName: vergleich && vergleich.name };
  return `<svg class="chart" data-chart="${id}" viewBox="0 0 ${W} ${H}"><defs>${defs}</defs>${raster}${achse}${flaechen}${kanten}${oben}${vglSvg}<g class="hover"></g></svg>
    ${viele || vv ? `<div class="legende">${[...lagen].reverse().map(r => `<span><i style="background:${r.farbe}"></i>${esc(r.name)}</span>`).join('')}${vv ? `<span><i class="gestr"></i>${esc(vergleich.name)}</span>` : ''}</div>` : ''}`;
}

/* kleine Linie für M-Kacheln (nur Anzeige einer Reihe) */
export function funke(v, farbe = 'var(--s1)') {
  if (!v) return '';
  v = v.map(x => zahl(x) ? Number(x) : null); const w = 120, h = 40, z = v.filter(x => x !== null); if (z.length < 2) return '';
  const lo = Math.min(...z), hi = Math.max(...z), sp = hi - lo || 1;
  const pts = v.map((x, i) => x === null ? null : [i / (v.length - 1) * w, h - 3 - (x - lo) / sp * (h - 8)]).filter(Boolean);
  const dL = pts.map((q, i) => `${i ? 'L' : 'M'}${q[0].toFixed(1)} ${q[1].toFixed(1)}`).join('');
  return `<svg class="kk-funke" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none"><path d="${dL}L${pts.at(-1)[0].toFixed(1)} ${h}L${pts[0][0].toFixed(1)} ${h}z" fill="${farbe}" opacity=".2"/>`
    + `<path d="${dL}" fill="none" stroke="${farbe}" stroke-width="2" vector-effect="non-scaling-stroke" stroke-linejoin="round"/></svg>`;
}

export const kkBalken = (zeilen, n = 99) => { const max = Math.max(1e-9, ...zeilen.map(z => z[1] || 0));
  return zeilen.slice(0, n).map(([name, v, txt, farbe]) => `<div class="kk-balken"><span>${esc(name)}</span><i style="width:${Math.max(2, (v || 0) / max * 100)}%;background:${farbe || 'var(--s1)'}"></i><em>${txt}</em></div>`).join(''); };
