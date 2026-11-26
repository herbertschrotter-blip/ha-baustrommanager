// Verbrauch & Wetter (M13, Mockup mockups/auswertung-neu.html, abgenommen 26.11.2026): kWh gestapelt je Container, Linie der
// Außentemperatur mit eigener °C-Achse, Wetter je Zeitschritt, Vergleich grau dahinter, Antippen zeigt die Zahlen; zweite
// Ansicht „nach Temperatur“: Ø kWh je Temperaturband und Wetter. Alle Werte (auch die Bänder und die Sätze) kommen von der
// Integration (baustelle/verbrauch_wetter, logik/verbrauch_wetter); hier wird nur gezeichnet (Pixel, Achsen, Text).
import { html, nothing } from 'lit';
import { unsafeHTML } from 'lit/directives/unsafe-html.js';
import { de, esc, kwNr, zahl } from '../hilfen.js';
import { BEREICH_FARBEN } from '../symbole.js';

const WI = { sonne: '☀', wolken: '⛅', trueb: '☁', regen: '🌧', schnee: '❄' };
const WT = { sonne: 'sonnig', wolken: 'heiter', trueb: 'trüb', regen: 'Regen', schnee: 'Schnee' };
const AUFL_T = { stunde: 'je Stunde', tag: 'je Tag', woche: 'je Woche', monat: 'je Monat' };
const BAND_T = { unter_m2: '< −2 °C', m2_2: '−2 bis 2 °C', '2_6': '2 bis 6 °C', ueber_6: 'über 6 °C' };
const GRUPPEN = [['sonnig', 'sonnig', 'var(--amber)'], ['trueb', 'trüb', 'var(--ink2)'], ['nass', 'Regen/Schnee', 'var(--s1)']];
const WTAG = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];
const MON = ['Jän', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'];
const LAEDT = html`<div class="leer">Lädt …</div>`;

/* Beschriftung eines Zeitschritts aus `von` (ISO) – kurz für die Achse, lang fürs Antippen */
function beschriftung(von, au) {
  const tag = von.slice(0, 10), d = new Date(tag + 'T12:00:00Z'), t = +tag.slice(8, 10), m = +tag.slice(5, 7);
  if (au === 'stunde') { const h = +von.slice(11, 13); return { kurz: h % 6 === 0 ? (h === 0 ? `${WTAG[d.getUTCDay()]}` : `${h} h`) : '', lang: `${WTAG[d.getUTCDay()]} ${t}.${m}. · ${h}–${h + 1} h` }; }
  if (au === 'tag') return { kurz: `${t}.`, lang: `${WTAG[d.getUTCDay()]} ${t}.${m}.${tag.slice(0, 4)}` };
  if (au === 'woche') { const kw = kwNr(tag); return { kurz: `KW ${kw}`, lang: `KW ${kw} · ab ${t}.${m}.` }; }
  return { kurz: MON[m - 1], lang: `${MON[m - 1]} ${tag.slice(0, 4)}` };
}

const farbe = (p, bid) => { const b = p.d.bereiche.find(x => x.id === bid); return b ? BEREICH_FARBEN[b.f % BEREICH_FARBEN.length] : 'var(--ink2)'; };

function svgZeit(p, V, o) {
  const P = V.punkte, { W, H, stapel, vgl, wahl } = o, L = 34, R = 34, O = 26, U = 22, iw = W - L - R, ih = H - O - U, n = P.length, bw = iw / Math.max(1, n);
  const wert = (q, c) => c ? (q.je_container[c] || 0) : q.kwh;
  const T = P.map(q => q.aussen).filter(zahl), kmax = Math.max(1e-6, ...P.map((q, i) => Math.max(stapel.reduce((s, [c]) => s + wert(q, c), 0), vgl && zahl(vgl[i]) ? vgl[i] : 0))) * 1.08;
  const tmin = T.length ? Math.min(0, ...T) - 1 : -1, tmax = T.length ? Math.max(...T) + 1 : 10;
  const y = v => O + ih - v / kmax * ih, yt = t => O + ih - (t - tmin) / (tmax - tmin) * ih, eng = W <= 400;
  let s = `<svg class="aw-wd" viewBox="0 0 ${W} ${H}" role="img" aria-label="Verbrauch und Wetter">`;
  for (let g = 0; g <= 3; g++) { const v = kmax / 1.08 * g / 3; s += `<line x1="${L}" x2="${W - R}" y1="${y(v).toFixed(1)}" y2="${y(v).toFixed(1)}" class="gl"/><text x="${L - 4}" y="${(y(v) + 3).toFixed(1)}" class="ax l">${de(v, v < 10 ? 1 : 0)}</text>`; }
  if (T.length) { for (let g = Math.ceil(tmin / 5) * 5; g <= tmax; g += 5) s += `<text x="${W - R + 4}" y="${(yt(g) + 3).toFixed(1)}" class="ax t">${g}°</text>`;
    if (tmin < 0) s += `<line x1="${L}" x2="${W - R}" y1="${yt(0).toFixed(1)}" y2="${yt(0).toFixed(1)}" class="null"/>`; }
  P.forEach((q, i) => { const x = L + i * bw, w = Math.max(1, bw * (n > 60 ? 0.9 : 0.7)), x0 = x + (bw - w) / 2, b = beschriftung(q.von, V.aufloesung);
    if (vgl && zahl(vgl[i])) s += `<rect x="${(x0 - w * 0.12).toFixed(1)}" width="${(w * 1.24).toFixed(1)}" y="${y(vgl[i]).toFixed(1)}" height="${(O + ih - y(vgl[i])).toFixed(1)}" class="vg"/>`;
    let unten = O + ih; for (const [c, f] of stapel) { const h = wert(q, c) / kmax * ih; if (h > 0) s += `<rect x="${x0.toFixed(1)}" width="${w.toFixed(1)}" y="${(unten - h).toFixed(1)}" height="${h.toFixed(1)}" style="fill:${f}" data-i="${i}"/>`; unten -= h; }
    if (q.wetter && ((n <= 31 && (!eng || n <= 12 || i % 2 === 0)) || i % 6 === 0)) s += `<text x="${(x + bw / 2).toFixed(1)}" y="${O - 9}" class="wi">${WI[q.wetter] || ''}</text>`;
    if (b.kurz && (!eng || n <= 12 || i % 5 === 0) && (n <= 40 || V.aufloesung === 'stunde' || i % Math.ceil(n / 20) === 0)) s += `<text x="${(x + bw / 2).toFixed(1)}" y="${H - 6}" class="ax m">${esc(b.kurz)}</text>`;
    s += `<rect x="${x.toFixed(1)}" width="${bw.toFixed(1)}" y="${O}" height="${ih}" class="hit" data-i="${i}"/>`; });
  const pkt = P.map((q, i) => zahl(q.aussen) ? `${(L + (i + 0.5) * bw).toFixed(1)},${yt(q.aussen).toFixed(1)}` : null).filter(Boolean);
  if (pkt.length > 1) s += `<polyline class="tl" points="${pkt.join(' ')}"/>`;
  if (n <= 31) P.forEach((q, i) => { if (zahl(q.aussen)) s += `<circle cx="${(L + (i + 0.5) * bw).toFixed(1)}" cy="${yt(q.aussen).toFixed(1)}" r="2.4" class="tp"/>`; });
  if (wahl !== null && P[wahl]) s += `<rect x="${(L + wahl * bw).toFixed(1)}" width="${bw.toFixed(1)}" y="${O}" height="${ih}" class="sel"/>`;
  return `${s}<text x="${L - 4}" y="${O - 14}" class="ax l">kWh</text>${T.length ? `<text x="${W - R + 4}" y="${O - 14}" class="ax t">°C</text>` : ''}</svg>`;
}

function svgBand(V, o) {
  const { W, H } = o, L = 34, O = 14, U = 34, ih = H - O - U, iw = W - L - 8, B = Object.keys(BAND_T), gw = iw / B.length, Z = V.baender.zellen;
  const zelle = (b, g) => Z.find(z => z.band === b && z.gruppe === g), max = Math.max(1e-6, ...Z.map(z => z.kwh)) * 1.1, y = v => O + ih - v / max * ih;
  let s = `<svg class="aw-wd" viewBox="0 0 ${W} ${H}" role="img" aria-label="Verbrauch nach Temperatur und Wetter">`;
  for (let g = 0; g <= 3; g++) { const v = max / 1.1 * g / 3; s += `<line x1="${L}" x2="${W - 8}" y1="${y(v).toFixed(1)}" y2="${y(v).toFixed(1)}" class="gl"/><text x="${L - 4}" y="${(y(v) + 3).toFixed(1)}" class="ax l">${de(v, v < 10 ? 1 : 0)}</text>`; }
  B.forEach((b, k) => { const x = L + k * gw, bw = gw * 0.8 / GRUPPEN.length;
    GRUPPEN.forEach(([g, , f], j) => { const xx = x + gw * 0.1 + j * bw, z = zelle(b, g);
      s += z ? `<rect x="${(xx + 1).toFixed(1)}" width="${(bw - 2).toFixed(1)}" y="${y(z.kwh).toFixed(1)}" height="${(O + ih - y(z.kwh)).toFixed(1)}" style="fill:${f}"/><text x="${(xx + bw / 2).toFixed(1)}" y="${(y(z.kwh) - 4).toFixed(1)}" class="ax m">${de(z.kwh, z.kwh < 10 ? 1 : 0)}</text><text x="${(xx + bw / 2).toFixed(1)}" y="${O + ih + 12}" class="ax m klein">${z.anzahl}×</text>`
        : `<text x="${(xx + bw / 2).toFixed(1)}" y="${O + ih - 4}" class="ax m klein">–</text>`; });
    s += `<text x="${(x + gw / 2).toFixed(1)}" y="${H - 6}" class="ax m b">${esc(BAND_T[b])}</text>`; });
  return `${s}</svg>`;
}

/* Satz unter „nach Temperatur“ aus den Zahlen der Integration */
function bandSatz(V, wer) {
  const b = V.baender, teile = [];
  if (zahl(b.kalt_zu_warm)) teile.push(`Bei ${BAND_T[b.kalt_band]} braucht ${wer} rund ${de(b.kalt_zu_warm, 1)}-mal so viel wie bei ${BAND_T[b.warm_band]}`);
  if (zahl(b.trueb_mehr_prozent)) teile.push(b.trueb_mehr_prozent >= 0 ? `trübe ${V.aufloesung === 'stunde' ? 'Stunden' : 'Tage'} kosten bei gleicher Temperatur rund ${b.trueb_mehr_prozent} % mehr als sonnige`
    : `sonnige kosten bei gleicher Temperatur rund ${-b.trueb_mehr_prozent} % mehr als trübe`);
  return teile.length ? `${teile.join('; ')}.` : 'Noch zu wenige Zeitschritte mit Temperatur und Wetter für einen Vergleich.';
}

export function wetterDiagramm(p) {
  const aw = p.s.aw, wd = aw.wd ||= { art: 'zeit', au: null, fuer: 'gestapelt', wahl: null };
  if (p.s.awScope === 'alle') return html`<div class="aw-wd-box" data-aw-wd><div class="aw-wd-k"><b>Verbrauch & Wetter</b></div><div class="leer">Nur für eine Baustelle – das Wetter gilt je Baustelle. „Diese Baustelle“ wählen.</div></div>`;
  const fuer = aw.filter || (wd.fuer !== 'gestapelt' && wd.fuer !== 'gesamt' ? wd.fuer : null);
  const V = p.vwDaten(aw.zeitraum, p.zrV('aw'), wd.au, fuer, aw.vergleich === 'vorjahr' ? 'vorjahr' : aw.vergleich === '' || aw.vergleich === 'ohne' ? '' : 'vorperiode');
  const kopf = (au, auL) => html`<div class="aw-wd-k"><b>Verbrauch & Wetter</b>
      <span class="seg klein">${[['zeit', 'über die Zeit'], ['band', 'nach Temperatur']].map(([k, t]) => html`<button data-wd=${k} class=${wd.art === k ? 'on' : ''} @click=${() => { wd.art = k; wd.wahl = null; p.neuZeichnen(); }}>${t}</button>`)}</span>
      ${auL.length > 1 ? html`<span class="seg klein">${auL.map(k => html`<button data-au=${k} class=${au === k ? 'on' : ''} @click=${() => { wd.au = k; wd.wahl = null; p.neuZeichnen(); }}>${AUFL_T[k]}</button>`)}</span>` : html`<span class="leise">${AUFL_T[au] || ''}</span>`}
      ${aw.filter || p.s.awScope === 'alle' ? nothing : html`<select data-aw="wd-fuer" @change=${e => { wd.fuer = e.target.value; wd.wahl = null; p.neuZeichnen(); }}>
        <option value="gestapelt" ?selected=${wd.fuer === 'gestapelt'}>Baustelle · nach Container</option><option value="gesamt" ?selected=${wd.fuer === 'gesamt'}>Baustelle gesamt</option>
        ${p.d.bereiche.filter(b => !b.pumpe).map(b => html`<option value=${b.id} ?selected=${wd.fuer === b.id}>${b.name}</option>`)}</select>`}</div>`;
  if (!V) return html`<div class="aw-wd-box" data-aw-wd>${kopf(wd.au || '', [])}${LAEDT}</div>`;
  if (!V.punkte) return html`<div class="aw-wd-box" data-aw-wd>${kopf(V.aufloesung || '', [])}<div class="leer">Die Integration antwortet nicht</div></div>`;
  const au = V.aufloesung, schmal = !!p.narrow, W = schmal ? 340 : 820, H = schmal ? 210 : 250, einheit = `kWh ${AUFL_T[au]}`;
  const stapel = fuer ? [[fuer, farbe(p, fuer)]] : wd.fuer === 'gesamt' ? [[null, 'var(--s1)']] : V.container.map(c => [c.id, farbe(p, c.id)]);
  const name = c => (V.container.find(x => x.id === c) || {}).name || c, wer = fuer ? name(fuer) : 'die Baustelle';
  const wahl = zahl(wd.wahl) && V.punkte[wd.wahl] ? wd.wahl : null, q = wahl !== null ? V.punkte[wahl] : null;
  const klick = e => { const t = e.target.closest && e.target.closest('[data-i]'); if (!t) return; const i = +t.dataset.i; wd.wahl = wd.wahl === i ? null : i; p.neuZeichnen(); };
  if (!V.punkte.length) return html`<div class="aw-wd-box" data-aw-wd>${kopf(au, V.aufloesungen)}<div class="leer">Noch kein Verbrauch in diesem Zeitraum</div></div>`;
  const wert = x => (fuer ? x.je_container[fuer] || 0 : x.kwh);
  return html`<div class="aw-wd-box" data-aw-wd>${kopf(au, V.aufloesungen)}
    <div class="aw-wd-svg" @click=${klick}>${unsafeHTML(wd.art === 'band' ? svgBand(V, { W, H }) : svgZeit(p, V, { W, H, stapel, vgl: V.vergleich, wahl }))}</div>
    ${wd.art === 'band' ? html`<div class="aw-wd-leg">${GRUPPEN.map(([, t, f]) => html`<span><i style="background:${f}"></i>${t}</span>`)}<span class="leise">Ø ${einheit} je Band · Anzahl darunter</span></div>
        <div class="leise aw-wd-satz">${bandSatz(V, wer)}</div>`
      : html`<div class="aw-wd-leg">${stapel.length > 1 ? stapel.map(([c, f]) => html`<span><i style="background:${f}"></i>${name(c)}</span>`) : html`<span><i style="background:${stapel[0][1]}"></i>${fuer ? name(fuer) : 'Baustelle'} · ${einheit}</span>`}
          <span><i class="linie"></i>außen °C</span><span class="leise">${V.mit_wetter ? '☀ ⛅ ☁ 🌧 ❄ Wetter' : 'Wetter erst ab 0.8.201 aufgezeichnet'}${V.vergleich ? ' · grau: Vergleich' : ''}</span></div>
        ${q ? html`<div class="aw-wd-pkt"><b>${beschriftung(q.von, au).lang}</b><span>${de(wert(q), 1)} kWh</span>${q.wetter ? html`<span>${WI[q.wetter]} ${WT[q.wetter]}</span>` : nothing}
            ${zahl(q.aussen) ? html`<span>außen ${de(q.aussen, 1)} °C</span>` : nothing}<span class="leise">${[zahl(q.wind) ? `Wind ${de(q.wind, 0)} km/h` : '', zahl(q.regen) ? `Regen ${de(q.regen, 1)} mm` : ''].filter(Boolean).join(' · ')}</span>
            ${V.vergleich && zahl(V.vergleich[wahl]) ? html`<span class="leise">Vergleich ${de(V.vergleich[wahl], 1)} kWh</span>` : nothing}</div>`
          : html`<div class="leise aw-wd-satz">Balken antippen für die Zahlen ${{ stunde: 'dieser Stunde', tag: 'dieses Tages', woche: 'dieser Woche', monat: 'dieses Monats' }[au]}.</div>`}`}</div>`;
}
