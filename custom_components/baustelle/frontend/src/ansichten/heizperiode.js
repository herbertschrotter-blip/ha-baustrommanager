// Karte „Heizperiode“ der Auswertung (BSM-033.03, Mockup hochrechnung.html, abgenommen 10.10.2026): Reiter Hochrechnung
// (Prognose mit Spanne, Diagramm tatsächlich / Prognose mit / ohne Automatik über die Heizperiode), Signatur (je Container
// Streudiagramm mit Knickgerade, Heizgrenze, kWh je Grad, Grundlast, Güte) und Klima (Klimamittel, Vorhersage, Heizgradtage,
// Normjahr), dazu die Einblendung „Klimamittel“. Im Reiter Hochrechnung Umschalter Heizperiode · Monat · Woche · Tag
// (BSM-033.04, Mockup hochrechnung-j4b.html: Balken je Zeitraum aus `perioden`, Antippen zeigt die Zahlen; beim Tag der
// Verlauf 24 h aus `baustelle/tagesverlauf`). Alle Zahlen kommen von der Integration (`A.hochrechnung`, logik/hochrechnung,
// logik/signatur); die Seite rechnet nur Pixel. Die Heizperiode stellt ✎ über die Einblendung „zeitraum-bs“ ein. Vierter
// Reiter „Baseline“ (J4b, Mockup baseline.html B): Stand je Container und Läufe aus laufzeit.baseline (ansichten/baseline.js).
import { html, nothing } from 'lit';
import { unsafeHTML } from 'lit/directives/unsafe-html.js';
import { MONATE, de, zahl } from '../hilfen.js';
import { baselineHinweis, baselineReiter } from './baseline.js';

const GRIFF = html`<div class="griff"></div>`;
const LAEDT = html`<div class="leer">Lädt …</div>`;
const MONATE_VOLL = ['Jänner', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];
const STAND = { gut: ['gut', 'gruen-t'], brauchbar: ['brauchbar', 'amber-t'], unsicher: ['unsicher', 'rot-t'], lernt: ['lernt noch', 'leise'] };
const eur = x => zahl(x) ? `${de(x, 0)} €` : '–';
const tagText = iso => iso ? `${iso.slice(8, 10)}.${iso.slice(5, 7)}.${iso.slice(0, 4)}` : '';
const imZeitraum = (m, [von, bis]) => von <= bis ? m >= von && m <= bis : m >= von || m <= bis;

const stand = c => { const [t, k] = STAND[c.stand] || [c.stand, ''];
  return html`<span class="hp-st ${k}">${t}${c.stand === 'lernt' ? ` · ${c.tage}/10 Tage` : ''}</span>`; };

/* ---------- Hochrechnung ---------- */
function zahlZeile(h) {
  return html`<div class="hp-zahl">≈ ${eur(h.mit_eur)}<span class="leise"> · ${zahl(h.unten_eur) ? `${de(h.unten_eur, 0)}–${eur(h.oben_eur)}` : `${de(h.mit_kwh, 0)} kWh`}</span></div>`;
}
/* Endwert „ohne“ in der Einheit der Achse (FE-0033) */
const mengeText = (v, mwh) => mwh ? `${de(v / 1000, v < 10000 ? 1 : 0)} MWh` : `${de(v, 0)} kWh`;
/* Diagramm aus der Tagesreihe [Tag, tatsächlich, mit, unten, oben, ohne] (kWh aufsummiert) – nur Anordnung. Die Achse folgt
   tatsächlich, Prognose mit und Spanne (FE-0033); „ohne“ wird bis zum oberen Rand gezeichnet und dort abgeschnitten, am
   Austritt ↑ mit dem Endwert. */
function diagramm(h) {
  const R = h.reihe || [];
  if (R.length < 2) return nothing;
  const W = 340, H = 180, L = 36, U = 22, n = R.length;
  const max = Math.max(...R.map(r => Math.max(r[1] || 0, r[2] || 0, r[4] || 0)), 1) * 1.05;
  const raus = R.findIndex(r => r[5] !== null && r[5] > max), O = raus >= 0 ? 22 : 10;
  const x = i => L + i / (n - 1) * (W - L - 6), y = v => H - U - v / max * (H - U - O);
  const heute = Math.max(0, R.findLastIndex(r => r[1] !== null));
  const pfad = (k, von, bis) => R.slice(von, bis + 1).map((r, j) => r[k] === null ? '' : `${j ? 'L' : 'M'}${x(von + j).toFixed(1)},${y(r[k]).toFixed(1)}`).join(' ');
  const band = R[n - 1][3] !== null ? `M${x(heute).toFixed(1)},${y(R[heute][3]).toFixed(1)} ${R.slice(heute).map((r, j) => `L${x(heute + j).toFixed(1)},${y(r[4]).toFixed(1)}`).join(' ')} `
    + `${R.slice(heute).reverse().map((r, j) => `L${x(n - 1 - j).toFixed(1)},${y(r[3]).toFixed(1)}`).join(' ')} Z` : '';
  const stufen = [0, 0.25, 0.5, 0.75, 1].map(f => max / 1.05 * f), mwh = max > 4000;
  const monate = R.map((r, i) => [r[0], i]).filter(([t]) => t.endsWith('-01'));
  let pfeil = '';
  if (raus >= 0) {   // Austritt am oberen Rand (nur Pixel): zwischen dem letzten Punkt darunter und dem ersten darüber
    const a = R[raus - 1], xe = raus && a[5] !== null ? x(raus - 1 + (max - a[5]) / (R[raus][5] - a[5])) : x(raus);
    const ende = zahl(h.ohne_kwh) ? h.ohne_kwh : R[n - 1][5], t = `ohne${h.ohne_hinweis ? ' (Schätzung 24/7)' : ''} ${mengeText(ende, mwh)}`;
    pfeil = `<text class="hp-pfeil" x="${xe.toFixed(1)}" y="${O - 2}">↑</text><text class="hp-raus" x="${(xe + (xe > W / 2 ? -6 : 6)).toFixed(1)}" y="${O - 4}" text-anchor="${xe > W / 2 ? 'end' : 'start'}">${t}</text>`;
  }
  return unsafeHTML(`<svg class="hp-dia" viewBox="0 0 ${W} ${H}">
    <defs><clipPath id="hp-feld"><rect x="${L}" y="${O}" width="${W - L - 6}" height="${H - U - O}"/></clipPath></defs>
    ${stufen.map(v => `<line class="hp-gitter" data-v="${Math.round(v)}" x1="${L}" y1="${y(v)}" x2="${W - 6}" y2="${y(v)}"/><text class="hp-yt" x="${L - 4}" y="${y(v) + 3}">${de(mwh ? v / 1000 : v, mwh && max < 21000 ? 1 : 0)}</text>`).join('')}
    <text class="hp-yt" x="${L - 4}" y="8">${mwh ? 'MWh' : 'kWh'}</text>
    ${monate.map(([t, i]) => `<line class="hp-gitter" x1="${x(i)}" y1="${O}" x2="${x(i)}" y2="${H - U}"/><text x="${x(i) + 10}" y="${H - 6}">${MONATE[+t.slice(5, 7) - 1]}</text>`).join('')}
    ${band ? `<path class="hp-band" d="${band}"/>` : ''}
    ${R[0][5] !== null ? `<path class="hp-ohne"${raus >= 0 ? ' clip-path="url(#hp-feld)"' : ''} d="${pfad(5, 0, n - 1)}"/>${pfeil}` : ''}
    <path class="hp-prog" d="${pfad(2, heute, n - 1)}"/>
    ${heute ? `<path class="hp-ist" d="${pfad(1, 0, heute)}"/>` : ''}
    <line class="hp-heute" x1="${x(heute)}" y1="${O}" x2="${x(heute)}" y2="${H - U}"/><text class="hp-ht" x="${x(heute) + 3}" y="${O + 8}">heute</text></svg>`);
}
function legende(p, h) {
  return html`<div class="hp-leg">
      <span><i class="l-ist"></i>tatsächlich <b>${eur(h.bisher_eur)}</b></span>
      <span><i class="l-prog"></i>Prognose mit Automatik <b>${eur(h.mit_eur)}</b>${zahl(h.unten_eur) ? html`<span class="leise"> (${de(h.unten_eur, 0)}–${de(h.oben_eur, 0)})</span>` : nothing}</span>
      ${zahl(h.ohne_eur) ? html`<span><i class="l-ohne"></i>Prognose ohne Automatik <b>${eur(h.ohne_eur)}</b></span>` : nothing}
      ${zahl(h.gespart_eur) ? html`<span>gespart ≈ <b>${eur(h.gespart_eur)}</b></span>` : nothing}</div>
    ${h.ohne_hinweis ? html`<div class="hp-grob">⚠ „ohne Automatik“ und „gespart“: ${h.ohne_hinweis}</div>` : nothing}
    ${p.d.baseline ? baselineHinweis(p) : h.ohne_methode !== 'baseline' ? html`<div class="leise">„ohne Automatik“ ist bis zur gemessenen Baseline eine Schätzung (jeder Heizkörper rund um die Uhr).</div>` : nothing}`;   // J4b: Hinweis mit Stand; ohne laufzeit.baseline wie bisher
}
/* Woher die Zahl kommt: Text von der Integration (FE-0030, logik/auswertung.hochrechnung_herkunft) */
function herkunft(h) {
  return html`${h.herkunft_lernt ? html`<b>lernt noch</b> – ` : nothing}${h.herkunft || ''}`;
}

/* ---------- Tag / Woche / Monat (BSM-033.04, Mockup hochrechnung-j4b.html) ---------- */
const WT = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];
const AUFL = [['hp', 'Heizperiode'], ['monat', 'Monat'], ['woche', 'Woche'], ['tag', 'Tag']];
const FENSTER = { tag: [7, 14], woche: [3, 9], monat: [0, 7] };   // Zeiträume vor dem aktuellen, Anzahl im Bild
const QTEXT = { gemessen: 'gemessen', vorhersage: 'Vorhersage', klima: 'Klimamittel' };
const datum = iso => new Date(`${iso}T12:00:00`);
const tm = iso => `${iso.slice(8, 10)}.${iso.slice(5, 7)}.`;
function titel(z, art) {
  if (art === 'monat') return `${MONATE[+z.von.slice(5, 7) - 1]} ${z.von.slice(0, 4)}`;
  if (art === 'woche') return `${tm(z.von)}–${tm(z.bis)}`;
  return `${WT[datum(z.von).getDay()]} ${tm(z.von)}`;
}
/* Ausschnitt der Zeiträume (nur Anordnung): um den aktuellen Zeitraum, mit ‹ › um ein Bild weiter */
function fenster(P, art, ab) {
  const [vor, n] = FENSTER[art], jetzt = Math.max(0, P.findIndex(z => !z.vorbei));
  const start = Math.max(0, Math.min(P.length - n, (art === 'monat' ? 0 : jetzt - vor) + ab * n));
  return { Z: P.slice(start, start + n), vor: start > 0, nach: start + n < P.length };
}
const balkenMax = Z => Math.max(1, ...Z.map(z => Math.max(z.oben ?? z.mit, z.mit, z.ist || 0))) * 1.08;
const ueberRand = Z => { const m = balkenMax(Z); return Z.some(z => zahl(z.ohne) && z.ohne > m); };
function balkenSvg(Z, art, wahl) {
  const W = 340, H = 190, L = 34, U = art === 'tag' ? 30 : 22, O = art === 'tag' ? 22 : 10;
  // FE-0033: die Achse folgt tatsächlich, mit und Spanne; „ohne“ darüber wird am oberen Rand abgeschnitten (↑, Zahl beim Antippen)
  const max = balkenMax(Z), mwh = max > 4000;
  const bw = (W - L - 6) / Z.length, y = v => H - U - v / max * (H - U - O), x = i => L + i * bw;
  const stufen = [0, 0.25, 0.5, 0.75, 1].map(f => max / 1.08 * f), jetzt = Z.findIndex(z => !z.vorbei);
  const b = Z.map((z, i) => {
    const w = bw * 0.62, x0 = x(i) + bw * 0.12, ist = z.ist || 0, ow = Math.max(3, bw * 0.16), m = x0 + w / 2;
    const sp = z.prog && zahl(z.unten) && z.oben - z.unten > 0.05 * max / 10;
    const unterTag = art === 'tag' ? `<text class="hp-x2${z.heute ? ' heute' : ''}" x="${x(i) + bw / 2}" y="${H - U + 23}">${z.heute ? 'heute' : `${+z.von.slice(8, 10)}.`}</text>` : '';
    return `<g class="hp-b${i === wahl ? ' on' : ''}" data-i="${i}"><rect class="hp-hit" x="${x(i)}" y="${O}" width="${bw}" height="${H - U - O}"/>
      ${ist ? `<rect class="hp-bi" x="${x0}" y="${y(ist)}" width="${w}" height="${y(0) - y(ist)}"/>` : ''}
      ${z.prog ? `<rect class="hp-bp" x="${x0}" y="${y(z.mit)}" width="${w}" height="${y(ist) - y(z.mit)}"/>` : ''}
      ${sp ? `<path class="hp-bs" d="M${m},${y(z.oben)} V${y(z.unten)} M${x0 + w * .3},${y(z.oben)} H${x0 + w * .7} M${x0 + w * .3},${y(z.unten)} H${x0 + w * .7}"/>` : ''}
      ${zahl(z.ohne) ? `<rect class="hp-bo" x="${x0 + w + 1}" y="${y(Math.min(z.ohne, max))}" width="${ow}" height="${y(0) - y(Math.min(z.ohne, max))}"/>` : ''}
      ${zahl(z.ohne) && z.ohne > max ? `<text class="hp-pfeil" x="${x0 + w + 1 + ow / 2}" y="${O - 1}">↑</text>` : ''}
      ${art === 'tag' && zahl(z.aussen) ? `<text class="hp-bt${z.quellen.includes('klima') ? ' kl' : ''}" x="${x(i) + bw / 2}" y="${O - 8}">${de(z.aussen, 0)}°</text>` : ''}
      <text class="hp-x${z.heute ? ' heute' : ''}" x="${x(i) + bw / 2}" y="${H - U + 12}">${art === 'monat' ? MONATE[+z.von.slice(5, 7) - 1] : art === 'woche' ? tm(z.von) : WT[datum(z.von).getDay()]}</text>${unterTag}</g>`;
  }).join('');
  return unsafeHTML(`<svg class="hp-dia hp-balken" viewBox="0 0 ${W} ${H}">
    ${stufen.map(v => `<line class="hp-gitter" x1="${L}" y1="${y(v)}" x2="${W - 6}" y2="${y(v)}"/><text class="hp-yt" x="${L - 4}" y="${y(v) + 3}">${de(mwh ? v / 1000 : v, mwh ? 1 : 0)}</text>`).join('')}
    <text class="hp-yt" x="${L - 4}" y="${art === 'tag' ? O - 8 : 8}">${mwh ? 'MWh' : 'kWh'}</text>
    ${jetzt > 0 ? `<line class="hp-heute" x1="${x(jetzt)}" y1="${O}" x2="${x(jetzt)}" y2="${H - U}"/>` : ''}${b}</svg>`);
}
/* Verlauf 24 h des gewählten Tags (baustelle/tagesverlauf: [h, gemessen, Prognose, ohne, außen, Herkunft]) – nur Anordnung */
const TQ = { gemessen: 'gemessen', vorhersage: 'Vorhersage', tagesgang: 'typischer Tagesgang' };
function kurve24(p, z) {
  const v = p._holen(`tv:${p.d.entry}:${z.von}`, () => p._hass.callWS({ type: 'baustelle/tagesverlauf', entry_id: p.d.entry, datum: z.von }), z.heute ? 600000 : 3600000);
  if (v === undefined) return html`<div class="hp-titel">Verlauf 24 h</div>${LAEDT}`;
  const S = (v && v.stunden) || [];
  if (S.length !== 24) return nothing;
  const W = 340, H = 150, L = 30, R = 28, U = 18, O = 10, bw = (W - L - R) / 24;
  const max = Math.max(0.1, ...S.map(s => Math.max((s[1] || 0) + (s[2] || 0), s[3] || 0))) * 1.1;
  const T = S.map(s => s[4]), tmin = Math.floor(Math.min(...T) - 1), tmax = Math.ceil(Math.max(...T) + 1);
  const x = h => L + h * bw, y = w => H - U - w / max * (H - U - O), yt = t => H - U - (t - tmin) / (tmax - tmin) * (H - U - O);
  const svg = `<svg class="hp-dia hp-24" viewBox="0 0 ${W} ${H}">
    ${(v.heizzeit || []).map(([a, b]) => `<rect class="hp-plan" x="${x(a)}" y="${O}" width="${(b - a) * bw}" height="${H - U - O}"/>`).join('')}
    ${(v.heizzeit || []).length ? `<text class="hp-pt" x="${x(v.heizzeit[0][0]) + 3}" y="${O + 9}">Heizzeit</text>` : ''}
    ${[0, .5, 1].map(f => max / 1.1 * f).map(w => `<line class="hp-gitter" x1="${L}" y1="${y(w)}" x2="${W - R}" y2="${y(w)}"/><text class="hp-yt" x="${L - 4}" y="${y(w) + 3}">${de(w, w < 10 ? 1 : 0)}</text>`).join('')}
    <text class="hp-yt" x="${L - 4}" y="${O - 2}">kWh</text>
    ${[tmin, tmax].map(t => `<text class="hp-tt" x="${W - R + 4}" y="${yt(t) + (t === tmax ? 8 : 0)}">${t}°</text>`).join('')}
    ${S.map(([h, ist, prog]) => { const i = ist || 0, x0 = x(h) + bw * .12, b = bw * .76;
      return `${i ? `<rect class="hp-bi" x="${x0}" y="${y(i)}" width="${b}" height="${y(0) - y(i)}"/>` : ''}${prog ? `<rect class="hp-bp" x="${x0}" y="${y(i + prog)}" width="${b}" height="${y(i) - y(i + prog)}"/>` : ''}`; }).join('')}
    ${S[0][3] !== null ? `<path class="hp-ol" d="${S.map((s, h) => `${h ? 'L' : 'M'}${(x(h) + bw / 2).toFixed(1)},${y(s[3]).toFixed(1)}`).join(' ')}"/>` : ''}
    <path class="hp-tl" d="${S.map((s, h) => `${h ? 'L' : 'M'}${(x(h) + bw / 2).toFixed(1)},${yt(s[4]).toFixed(1)}`).join(' ')}"/>
    ${[0, 6, 12, 18, 24].map(h => `<text class="hp-x" x="${x(h)}" y="${H - 4}">${h}</text>`).join('')}
    ${zahl(v.jetzt_h) ? `<line class="hp-heute" x1="${x(v.jetzt_h)}" y1="${O}" x2="${x(v.jetzt_h)}" y2="${H - U}"/><text class="hp-ht" x="${x(v.jetzt_h) + 3}" y="${H - U - 4}">jetzt</text>` : ''}</svg>`;
  const quellen = [...new Set(S.map(s => s[5]))].map(q => TQ[q] || q).join(', dann ');
  return html`<div class="hp-titel">Verlauf 24 h</div>${unsafeHTML(svg)}
    <div class="hp-leg2"><span><i class="q-ist"></i>gemessen je Stunde</span><span><i class="q-prog"></i>Prognose</span>
      ${S[0][3] !== null ? html`<span><i class="q-ol"></i>ohne Automatik</span>` : nothing}<span><i class="q-tl"></i>außen ${quellen}</span></div>
    <div class="leise">${v.frei ? 'Freier Tag: nur Frostschutz.' : 'Hell: Heizzeit laut Plan; außerhalb nur Frostschutz.'}
      ${S.some(s => s[2]) ? ' Die Prognose je Stunde verteilt den Tageswert nach Heizplan und Temperatur.' : ''}
      ${S[0][3] !== null ? (v.ohne_quelle === 'baseline' ? ' „Ohne Automatik“ je Stunde nach den Baseline-Messungen.' : ' „Ohne Automatik“ gleichmäßig rund um die Uhr (Schätzung bis zur Baseline).') : ''}</div>`;
}
function detail(h, z, art, p) {
  const zeile = (k, t, kwh, e) => html`<div class=${k}><span>${t}</span><b>${de(kwh, 0)} kWh · ${eur(e)}</b></div>`;
  const restText = !z.ist ? 'Prognose mit Automatik' : art === 'tag' ? 'Rest von heute' : `Prognose Rest ${art === 'woche' ? 'der Woche' : 'des Monats'}`;
  return html`<div class="glas-panel hp-det"><div class="hp-det-k"><b>${titel(z, art)}${z.heute ? ' · heute' : ''}</b>
      <span class="leise">${zahl(z.aussen) ? `Ø ${de(z.aussen, 1)} °C außen · ` : ''}${z.quellen.map(q => QTEXT[q] || q).join(' + ')}</span></div>
    <div class="hp-det-z">
      ${zahl(z.ist) && z.ist > 0 ? zeile('', html`<i class="q-ist"></i>tatsächlich${z.prog ? ' bis jetzt' : ''}`, z.ist, z.ist_eur) : nothing}
      ${z.prog ? zeile('', html`<i class="q-prog"></i>${restText}`, z.prog, z.prog_eur) : nothing}
      ${z.prog && z.ist ? zeile('sum', 'zusammen', z.mit, z.mit_eur) : nothing}
      ${z.prog && zahl(z.unten) && z.oben - z.unten > 0.5 ? html`<div class="leise"><span>Spanne milder–kalter Winter</span><span>${de(z.unten_eur, 0)}–${eur(z.oben_eur)}</span></div>` : nothing}
      ${zahl(z.ohne) ? zeile('', html`<i class="q-ohne"></i>ohne Automatik ${h.ohne_hinweis ? '(Schätzung)' : '(gemessen)'}`, z.ohne, z.ohne_eur) : nothing}
      ${zahl(z.gespart) ? html`<div class="gesp"><span>gespart</span><b>≈ ${eur(z.gespart_eur)}</b></div>` : nothing}
      ${h.ohne_hinweis && (zahl(z.ohne) || zahl(z.gespart)) ? html`<div class="hp-grob">⚠ ${h.ohne_hinweis}</div>` : nothing}</div>
    ${art === 'tag' ? kurve24(p, z) : nothing}</div>`;
}
function zeitraeume(p, h, art) {
  const P = ((h.perioden || {})[art]) || [];
  if (!P.length) return html`<div class="leer">Keine Tage in der Heizperiode</div>`;
  const ab = p.s.hpAb || 0, { Z, vor, nach } = fenster(P, art, ab);
  const jetzt = Z.findIndex(z => !z.vorbei), wahl = Math.min(Z.length - 1, p.s.hpWahl ?? (jetzt < 0 ? Z.length - 1 : jetzt));
  const geh = d => () => { p.s.hpAb = d === null ? 0 : ab + d; p.s.hpWahl = null; p.neuZeichnen(); };
  const nav = (d, t, an) => html`<button class="chip glas-panel hp-nav" data-k=${`hp-nav${d}`} ?disabled=${!an} @click=${geh(d)}>${t}</button>`;
  return html`<div class="hp-kopf">${art !== 'monat' ? nav(-1, '‹', vor) : nothing}
      <span class="hp-zr">${titel(Z[0], art).split('–')[0]} – ${titel(Z[Z.length - 1], art).split('–').pop()}</span>
      ${art !== 'monat' ? html`${nav(1, '›', nach)}${ab ? html`<button class="chip glas-panel hp-nav" @click=${geh(null)}>heute</button>` : nothing}` : nothing}</div>
    <div @click=${e => { const g = e.target.closest('.hp-b'); if (g) { p.s.hpWahl = +g.dataset.i; p.neuZeichnen(); } }}>${balkenSvg(Z, art, wahl)}</div>
    <div class="hp-leg2"><span><i class="q-ist"></i>tatsächlich</span><span><i class="q-prog"></i>Prognose mit Automatik</span><span><i class="q-ohne"></i>ohne Automatik</span>
      ${art === 'tag' ? html`<span class="leise">°C: Vorhersage · <em>kursiv</em> = Klimamittel</span>` : nothing}</div>
    ${ueberRand(Z) ? html`<div class="leise">↑ ohne Automatik reicht über den Rand – die Zahl zeigt das Antippen.</div>` : nothing}
    ${detail(h, Z[wahl], art, p)}`;
}
function hochrechnung(p, h) {
  const a = p.s.hpAufl || 'hp';
  const seg = html`<div class="seg glas-panel hp-aufl">${AUFL.map(([k, t]) => html`<button data-v=${k} class=${a === k ? 'on' : ''} @click=${() => { p.s.hpAufl = k; p.s.hpAb = 0; p.s.hpWahl = null; p.neuZeichnen(); }}>${t}</button>`)}</div>`;
  return html`${zahlZeile(h)}${seg}${a === 'hp' ? html`${diagramm(h)}${legende(p, h)}<div class="leise hp-her">${herkunft(h)}</div>` : zeitraeume(p, h, a)}`;
}

/* ---------- Signatur ---------- */
function streu(c) {
  const P = c.punkte || [], W = 320, H = 150, tx = t => 28 + (t + 6) / 30 * (W - 36);
  const ymax = Math.max(10, ...P.map(q => q[1])), ty = v => H - 18 - v / ymax * (H - 28);
  const knick = zahl(c.grenze) ? `M${tx(-6)},${ty(c.grundlast + c.kwh_je_grad * (c.grenze + 6))} L${tx(c.grenze)},${ty(c.grundlast)} L${tx(24)},${ty(c.grundlast)}` : '';
  return unsafeHTML(`<svg class="hp-streu" viewBox="0 0 ${W} ${H}"><line class="hp-gitter" x1="28" y1="${H - 18}" x2="${W - 6}" y2="${H - 18}"/>
    ${[-5, 0, 5, 10, 15, 20].map(t => `<text x="${tx(t)}" y="${H - 4}" text-anchor="middle">${t}°</text>`).join('')}
    ${P.map(([t, v]) => `<circle cx="${tx(t).toFixed(1)}" cy="${ty(v).toFixed(1)}" r="2.6"/>`).join('')}
    ${knick ? `<path d="${knick}"/><line class="hp-grenze" x1="${tx(c.grenze)}" y1="10" x2="${tx(c.grenze)}" y2="${H - 18}"/><text class="hp-gt" x="${tx(c.grenze) + 3}" y="16">Heizgrenze ${de(c.grenze, 1)}°</text>` : ''}</svg>`);
}
function signatur(p, h) {
  const C = h.container || [];
  if (!C.length) return html`<div class="leer">Keine Container mit Heizung</div>`;
  const i = Math.min(p.s.hpC || 0, C.length - 1), c = C[i], name = x => (p.d.bereiche.find(b => b.id === x.bereich) || {}).name || x.bereich;
  const leer = !(c.punkte || []).length
    ? html`<div class="leer">${name(c)}: noch keine ganzen Tage.</div>`
    : nothing;
  return html`<label class="feld hp-wahl">Container<select @change=${e => { p.s.hpC = +e.target.value; p.neuZeichnen(); }}>${C.map((x, j) => html`<option value=${j} ?selected=${j === i}>${name(x)}</option>`)}</select></label>
    ${leer}${(c.punkte || []).length ? streu(c) : nothing}
    ${c.stand === 'lernt' ? html`<div class="leise">${name(c)} lernt noch: ${c.tage} von 10 ganzen Tagen. Danach zeigt sich, ab welcher Außentemperatur geheizt wird.</div>` : nothing}
    <div class="hpz-zeilen">${C.map(x => html`<div class="hpz-zeile"><b>${name(x)}</b>
      <span>${zahl(x.grenze) ? html`ab <b>${de(x.grenze, 1)} °C</b>` : zahl(x.kwh_je_grad) ? 'Heizgrenze noch offen' : '–'}</span>
      <span>${zahl(x.kwh_je_grad) ? `+${de(x.kwh_je_grad, 1)} kWh je Grad · Grundlast ${de(x.grundlast, 1)} kWh/Tag` : ''}</span>
      <span>${stand(x)}${zahl(x.cv_rmse) ? html`<span class="leise"> · ${de(x.cv_rmse * 100, 0)} %</span>` : nothing}</span></div>`)}</div>
    <div class="leise">Je Tag Verbrauch gegen mittlere Außentemperatur (ganze Tage ohne Ausfall). Unter der Heizgrenze steigt der
      Verbrauch je Grad kälter; die Güte ist die mittlere Abweichung (bis 20 % gut, bis 30 % brauchbar).</div>`;
}

/* ---------- Klima ---------- */
function klima(p, h) {
  const K = h.klima || [], min = Math.min(-2, ...K), max = Math.max(22, ...K), y = v => (v - min) / (max - min) * 100;
  return html`<div class="hp-monate">${K.map((t, i) => html`<div class="hp-m ${imZeitraum(i + 1, p.d.hp) ? 'hp' : ''}"><i style="height:${y(t)}%"></i><b>${de(t, 1)}</b><span>${MONATE[i]}</span></div>`)}</div>
    <div class="leise">Klimamittel ${h.klima_vorgabe ? 'Graz 1991–2020 (Vorgabe)' : '(eigene Werte)'} · hervorgehoben: Heizperiode.
      <a class="hp-link nur-admin" @click=${p.nurAdmin(() => p.einblenden('hp-klima'))}>Klimamittel ändern ›</a></div>
    ${(h.vorhersage || []).length ? html`<div class="hp-vh"><b>Vorhersage</b>${h.vorhersage.map(([t, v]) => html`<span class="chip glas-panel">${t.slice(8, 10)}.${t.slice(5, 7)}. ${de(v, 1)}°</span>`)}</div>` : nothing}
    <div class="hp-kz">${zahl(h.hgt_rest) ? html`<div><b>${de(h.hgt_rest, 0)}</b><span>Heizgradtage bis ${tagText(h.ende)}</span></div>` : nothing}
      ${zahl(h.normjahr_eur) ? html`<div><b>${eur(h.normjahr_eur)}</b><span>im Normjahr (witterungsbereinigt)</span></div>` : nothing}</div>`;
}

/* ---------- Karte ---------- */
const REITER = [['hoch', 'Hochrechnung', 'Prognose'], ['sig', 'Signatur'], ['klima', 'Klima'], ['bl', 'Baseline']];   // Baseline: J4b (hochrechnung-j4b.html)
export function heizperiodeVorlage(p, A, start = 'hoch') {
  const d = p.d, h = A && A.hochrechnung, r = p.s.hpReiter || start, [von, bis] = d.hp;
  return html`<div class="glas-panel block hp-karte"><div class="block-kopf"><b>Heizperiode</b>
      <button class="chip glas-panel hp-zeit-chip nur-admin" @click=${p.nurAdmin(() => p.einblenden('zeitraum-bs'))}>${MONATE[von - 1]}–${MONATE[bis - 1]}${h && h.ende ? ` · bis ${tagText(h.ende)}` : ''} ✎</button></div>
    <div class="seg glas-panel hp-reiter">${REITER.map(([k, t, kurz]) => html`<button data-v=${k} class=${r === k ? 'on' : ''} @click=${() => { p.s.hpReiter = k; p.neuZeichnen(); }}>${p.narrow && kurz ? kurz : t}</button>`)}</div>
    ${r === 'bl' ? baselineReiter(p) : !A ? LAEDT : !h || !zahl(h.mit_kwh) ? html`<div class="leer">Noch zu wenige Tage für eine Hochrechnung</div>`
      : r === 'sig' ? signatur(p, h) : r === 'klima' ? klima(p, h)
      : hochrechnung(p, h)}</div>`;
}

/* ---------- Einblendung Klimamittel (Einstellung heizung.klimamittel; leer = Vorgabe) ---------- */
function hpKlima(p, s) {
  const A = p.awDaten(p.s.aw.zeitraum, p.zrV('aw')), h = A && A.hochrechnung, K = (s.werte ||= [...((h && h.klima) || [])]);
  const speichern = wert => p.setzen(['heizung', 'klimamittel'], wert, 'Gespeichert').then(() => p.schliessen());
  return html`${GRIFF}<div class="block-kopf"><h3>Klimamittel</h3><span class="leise">Monatsmittel außen, °C</span></div>
    <div class="glas-panel liste hp-eingabe">${K.map((t, i) => html`<label class="feld">${MONATE_VOLL[i]}<input inputmode="decimal" .value=${de(t, 1)}
      @change=${e => { const v = parseFloat(String(e.target.value).replace(',', '.')); if (!isNaN(v)) K[i] = v; }}></label>`)}</div>
    <div class="leise">Vorgabe: Graz 1991–2020. Für eine andere Gegend die Klimamittel der nächsten Station von GeoSphere Austria
      eintragen. Die Hochrechnung nimmt sie für alle Tage ohne Vorhersage.</div>
    <div class="hp-knoepfe"><button class="knopf amber" data-k="hp-speichern" @click=${() => speichern(K.map(v => Math.round(v * 10) / 10))}>Speichern</button>
      <button class="knopf leise-k" data-k="hp-vorgabe" @click=${() => speichern(null)}>Vorgabe Graz</button>
      <button class="knopf leise-k" @click=${() => p.schliessen()}>Abbrechen</button></div>`;
}
export const HEIZPERIODE_EINBLENDUNGEN = { 'hp-klima': hpKlima };

export const HEIZPERIODE_CSS = `
.seg.hp-aufl { margin: 2px 0 8px; } .seg.hp-aufl button, .seg.hp-reiter button { padding: 6px 2px; min-width: 0; flex: 1 1 0; font-size: 12px; }
.hp-kopf { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; } .hp-zr { flex: 1; text-align: center; font-size: 13px; font-weight: 600; }
.hp-nav { font-size: 13px; padding: 3px 10px; cursor: pointer; } .hp-nav[disabled] { opacity: .35; }
.hp-balken { cursor: pointer; } .hp-balken .hp-hit { fill: transparent; } .hp-balken .hp-b.on .hp-hit { fill: rgba(127,127,127,.12); }
.hp-balken .hp-bi { fill: var(--s3); } .hp-balken .hp-bp { fill: var(--s1); opacity: .45; } .hp-balken .hp-bo { fill: var(--s2); opacity: .75; }
.hp-balken path.hp-bs { stroke: var(--s1); stroke-width: 1.2; fill: none; }
.hp-balken .hp-bt { text-anchor: middle; fill: var(--ink); } .hp-balken .hp-bt.kl { font-style: italic; fill: var(--ink2); }
.hp-balken .hp-x, .hp-balken .hp-x2 { text-anchor: middle; } .hp-balken .heute { fill: var(--amber); font-weight: 600; }
.hp-leg2 { display: flex; flex-wrap: wrap; gap: 4px 12px; font-size: 12px; margin: 2px 0 6px; }
.hp-leg2 i, .hp-det-z i { display: inline-block; width: 10px; height: 10px; border-radius: 2px; margin-right: 5px; vertical-align: -1px; }
.q-ist { background: var(--s3); } .q-prog { background: var(--s1); opacity: .45; } .q-ohne { background: var(--s2); opacity: .75; }
.hp-det { padding: 10px 12px; border-radius: 14px; margin: 4px 0; } .hp-det-k { display: flex; flex-direction: column; margin-bottom: 4px; }
.hp-det-z > div { display: flex; justify-content: space-between; gap: 8px; font-size: 13px; padding: 3px 0; } .hp-det-z b { white-space: nowrap; }
.hp-titel { font-size: 12px; color: var(--ink2); text-transform: uppercase; letter-spacing: .04em; margin: 12px 0 2px; }
.hp-24 .hp-bi { fill: var(--s3); } .hp-24 .hp-bp { fill: var(--s1); opacity: .45; } .hp-24 .hp-plan { fill: var(--amber); opacity: .14; }
.hp-24 .hp-pt { fill: var(--amber); font-size: 8px; } .hp-24 .hp-x { text-anchor: middle; } .hp-24 .hp-tt { fill: var(--ink); }
.hp-24 path.hp-ol { fill: none; stroke: var(--s2); stroke-width: 1.8; stroke-dasharray: 2 3; } .hp-24 path.hp-tl { fill: none; stroke: var(--ink); stroke-width: 1.6; }
.q-ol, .q-tl { background: none !important; height: 0 !important; width: 14px !important; } .q-ol { border-top: 2px dotted var(--s2); } .q-tl { border-top: 2px solid var(--ink); }
.hp-det-z .sum { border-top: 1px solid rgba(127,127,127,.2); } .hp-det-z .gesp b { color: #30d158; }
.hp-grob { display: block; font-size: 12px; color: var(--amber); }   /* BSM-033.05: ohne/gespart nur grobe Obergrenze */
.hp-zeit-chip { font-size: 12px; padding: 4px 10px; cursor: pointer; white-space: nowrap; }
.hp-reiter { margin: 4px 0 8px; } .hp-zahl { font-size: 26px; font-weight: 600; margin: 4px 0 2px; } .hp-zahl .leise { font-size: 14px; font-weight: 400; }
.hp-dia { width: 100%; max-width: 540px; height: auto; display: block; margin: 6px auto; }
.hp-dia text, .hp-streu text { font-size: 9px; fill: var(--ink2); } .hp-dia .hp-yt { text-anchor: end; }
.hp-gitter { stroke: rgba(127,127,127,.18); }
.hp-dia path { fill: none; stroke-width: 2.4; } .hp-dia .hp-ist { stroke: var(--s3); stroke-width: 3; }
.hp-dia .hp-prog { stroke: var(--s1); stroke-dasharray: 6 4; } .hp-dia .hp-ohne { stroke: var(--s2); stroke-dasharray: 2 3; }
.hp-dia .hp-band { fill: var(--s1); opacity: .2; stroke: none; }
.hp-dia .hp-pfeil { fill: var(--s2) !important; font-size: 11px !important; font-weight: 700; text-anchor: middle; } .hp-dia .hp-raus { fill: var(--s2) !important; }   /* FE-0033 */
.hp-heute, .hp-grenze { stroke: var(--amber); stroke-dasharray: 3 3; } .hp-ht, .hp-gt { fill: var(--amber) !important; }
.hp-leg { display: flex; flex-direction: column; gap: 4px; font-size: 13px; margin: 4px 0; }
.hp-leg i { display: inline-block; width: 18px; height: 0; margin-right: 6px; vertical-align: middle; border-top: 3px solid; }
.hp-leg .l-ist { border-color: var(--s3); } .hp-leg .l-prog { border-color: var(--s1); border-top-style: dashed; } .hp-leg .l-ohne { border-color: var(--s2); border-top-style: dotted; }
.hp-her { margin-top: 6px; } .hp-link { cursor: pointer; color: var(--blau); white-space: nowrap; }
.hp-st { font-size: 12px; white-space: nowrap; }
.hp-wahl select { width: 100%; }
.hp-streu { width: 100%; max-width: 520px; height: auto; display: block; margin: 4px auto; }
.hp-streu circle { fill: var(--ink2); opacity: .7; } .hp-streu path { fill: none; stroke: var(--s1); stroke-width: 2.5; }
.hpz-zeilen { display: flex; flex-direction: column; margin: 6px 0; }
.hpz-zeile { display: flex; flex-wrap: wrap; gap: 2px 12px; padding: 6px 0; font-size: 13px; border-bottom: 1px solid rgba(127,127,127,.15); } .hpz-zeile > b { flex: 1 1 100%; }
.hp-monate { display: grid; grid-template-columns: repeat(12, 1fr); gap: 3px; height: 120px; align-items: end; margin: 6px 0; }
.hp-m { display: flex; flex-direction: column; align-items: center; justify-content: flex-end; height: 100%; font-size: 10px; min-width: 0; }
.hp-m i { width: 70%; border-radius: 3px 3px 0 0; background: rgba(127,127,127,.3); } .hp-m.hp i { background: var(--s2); }
.hp-m b { font-weight: 500; font-size: 9px; } .hp-m span { color: var(--ink2); }
.hp-vh { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; margin: 8px 0; } .hp-vh .chip { font-size: 12px; padding: 4px 8px; }
.hp-kz { display: flex; gap: 16px; flex-wrap: wrap; } .hp-kz div { display: flex; flex-direction: column; } .hp-kz b { font-size: 18px; } .hp-kz span { font-size: 12px; color: var(--ink2); }
.hp-eingabe { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 4px 10px; padding: 10px 14px; } .hp-eingabe input { width: 100%; min-width: 0; box-sizing: border-box; }
.hp-knoepfe { display: flex; flex-direction: column; gap: 8px; margin-top: 8px; }`;
