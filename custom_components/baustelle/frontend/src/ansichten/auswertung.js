// Auswertung mit Lit (BSM-022 Stufe 3f; WU-0005 Bausteine, Mockup glas.html Variante 6). Kopf mit Layout/Anpassen/Preis/CSV,
// Leiste (Zeitraum, Scope, ‹ Zeitraum ›), Bausteine im Raster (kacheln.js) und die Einblendung „aw-detail“. Alle Zahlen
// (Summen, Vergleich, Wetter-Gerade, Typvergleich, Ersparnis, Hochrechnung, Abrechnung, je Gerät, Erkenntnisse) kommen von
// der Integration (p.awDaten, p.abDaten); die Seite ordnet nur an. Diagramme bleiben bis Stufe 4 SVG-Text (unsafeHTML).
import { html, nothing } from 'lit';
import { unsafeHTML } from 'lit/directives/unsafe-html.js';
import { de, erkl, esc, kurzDatum, summe, wtag, zahl } from '../hilfen.js';
import { BEREICH_FARBEN } from '../symbole.js';
import { flaeche, linien } from '../diagramme.js';
import { AW_BAUSTEINE, AW_VORLAGEN, KK, awStufen } from '../kacheln-daten.js';
import { kopfVorlage, schalterVorlage } from './allgemein.js';
import { zeitraumVorlage } from './zeitraum.js';
import { verbrauchVorlage } from './einblendungen-uebersicht.js';
import { kachelVorlage, rasterVorlage } from './kacheln.js';
import { heizperiodeVorlage } from './heizperiode.js';

const LAEDT = html`<div class="leer">Lädt …</div>`;
const STUNDEN = [...Array(24)].map((_, h) => String(h).padStart(2, '0'));
const WANN = { Tag: 'heute', Woche: 'diese Woche', Monat: 'dieser Monat', Jahr: 'dieses Jahr' };
const farbeVon = b => b ? BEREICH_FARBEN[b.f % BEREICH_FARBEN.length] : 'var(--ink2)';

const awVgl = (p, z) => p.zrVgl(z, p.zrV('aw'));
const awDelta = dl => dl === null || dl === undefined ? '' : html`<em class="aw-delta ${dl > 0 ? 'mehr' : 'weniger'}">${dl > 0 ? '▲' : '▼'} ${Math.abs(dl)} %</em>`;

/* ---- Blöcke, die nur die Auswertung zeigt (0.7.8) ---- */

/* Abrechnung: je Firma die Container mit kWh und Kosten im gewählten Zeitraum (rechnet die Integration, Firma je Tag) */
function abrechnung(p, z) {
  const lauf = p.s.awScope === 'alle' ? p.laufende() : [p.d], preis = p.d.e.preis, vs = p.zrV('aw'), a = p.abDaten(z, undefined, p.d, vs), zeilen = a && (a.firmen || []);
  const wann = p.zrText(z, vs);
  return html`<div class="glas-panel block"><div class="block-kopf"><b>Abrechnung nach Firma</b><span class="leise">${wann} · ${de(preis, 2)} € je kWh</span></div>
      ${!zeilen ? LAEDT : !zeilen.length ? html`<div class="leer">Noch kein Verbrauch in diesem Zeitraum</div>` : zeilen.map(f => html`<div class="ab-firma ${f.eigen ? 'eigen' : ''}"><div class="ab-kopf"><b>${f.firma}</b><span><b>${de(f.eur, 2)} €</b> <span class="leise">${de(f.kwh, 0)} kWh · ${de(f.anteil, 0)} %</span></span></div>
        ${(f.container || []).map(x => html`<div class="ab-c"><span>${x.name}${lauf.length > 1 ? html` <span class="leise">· ${x.titel}</span>` : nothing}</span><span class="leise">${de(x.kwh, 0)} kWh · ${de(x.eur, 2)} €</span></div>`)}</div>`)}
      <button class="knopf" data-art="firma" @click=${() => p.csv('firma')}>⇩ Abrechnung als CSV</button></div>`;
}

function leistungHeute(p) {
  const d = p.d, Q = d.bereiche.map(b => ({ name: b.name, farbe: farbeVon(b), v: p.verbrauch(d, b.id, 'Tag') }));
  return html`<div class="glas-panel block"><div class="block-kopf"><b>Leistung heute</b><span class="leise">kW je Stunde (Mittel)</span></div>
      <div class="chart-wrap">${Q.some(q => !q.v) ? LAEDT : Q.length ? unsafeHTML(flaeche('kw-heute', Q, STUNDEN, 'kW', 6)) : html`<div class="leer">Noch keine Container</div>`}</div>
      <div class="leise">gestapelt nach Container – oben die ganze Baustelle</div></div>`;
}

function temperaturen(p) {
  const d = p.d, tv = p.s.tv || 'heute', C = d.bereiche.filter(b => !b.pumpe && b.fuehler), aid = p.eid(d, d.entry, 'aussen');
  const aussen = { name: 'Außen', farbe: 'var(--ink2)', aussen: true };
  let inhalt;
  if (tv === 'heute') { const st = p.statistik('Tag');
    inhalt = !st ? LAEDT : unsafeHTML(linien('tp-heute', [...C.map(b => ({ name: b.name, farbe: farbeVon(b), v: [...(st.werte[b.fuehler] || []), null] })), ...(aid ? [{ ...aussen, v: [...(st.werte[aid] || []), null] }] : [])],
      [...STUNDEN, '24'], 6, i => `${String(i).padStart(2, '0')}:00`));
  } else { const n = tv === '7' ? 7 : 30, t = p.tempTage(n);
    inhalt = !t ? LAEDT : unsafeHTML(linien(`tp-${n}`, [...C.map(b => ({ name: b.name, farbe: farbeVon(b), v: t.werte[b.fuehler] || Array(n).fill(null) })), ...(aid ? [{ ...aussen, v: t.werte[aid] || Array(n).fill(null) }] : [])],
      t.tage.map(kurzDatum), n === 7 ? 1 : 5, i => `${wtag(t.tage[i])} ${kurzDatum(t.tage[i])} · Tagesmittel`)); }
  return html`<div class="glas-panel block"><div class="block-kopf"><b>Temperaturen</b><span class="leise">alle Container mit Fühler</span></div>
      <div class="seg">${[['heute', 'Heute'], ['7', '7 Tage'], ['30', '30 Tage']].map(([k, t]) => html`<button data-v=${k} class=${tv === k ? 'on' : ''} @click=${() => p.tvWahl(k)}>${t}</button>`)}</div>
      <div class="chart-wrap">${C.length ? inhalt : html`<div class="leer">Kein Container mit Temperaturfühler</div>`}</div>
      <div class="leise">${tv === 'heute' ? 'Stundenmittel, gestrichelt außen.' : 'Tagesmittel je Container, gestrichelt außen.'}${d.bereiche.some(b => !b.pumpe && !b.fuehler) ? ' Container ohne Fühler fehlen.' : ''}</div></div>`;
}

/* Je Gerät: Ø kW, kWh, Stunden, € – rechnet die Integration (je_geraet) */
function geraeteBlock(p, z, A) {
  const d = p.d;
  if (!A) return html`<div class="glas-panel block"><div class="block-kopf"><b>Je Gerät</b></div>${LAEDT}</div>`;
  const zeilen = (A.je_geraet || []).map(r => { const b = d.bereiche.find(x => x.id === r.bereich), g = b && b.geraete.find(x => x.id === r.geraet); return g ? { ...r, b, g } : null; }).filter(Boolean);
  const f = (v, k) => zahl(v) ? de(v, k) : '–';
  return html`<div class="glas-panel block"><div class="block-kopf"><b>Je Gerät</b><span class="leise">${WANN[z]}</span></div>
      ${zeilen.length ? html`<div class="tab-scroll"><table class="vergleich je-geraet"><tr><th>Gerät</th><th>Ø kW</th><th>Stunden</th><th>kWh</th><th>€</th></tr>
        ${zeilen.map(({ b, g, mittel, kwh, std, eur }) => html`<tr><td><b>${g.n}</b><div class="leise">${b.name} · ${g.typ}</div></td><td>${f(mittel, 2)}</td><td>${f(std, 1)}</td><td>${f(kwh, 1)}</td><td>${zahl(kwh) ? de(eur, 2) : '–'}</td></tr>`)}</table></div>`
        : html`<div class="leer">Noch keine Geräte</div>`}
      ${unsafeHTML(erkl(d.e.erklaer, 'Ø kW ist die mittlere Leistung, während das Gerät läuft – so sieht man, ob ein Heizkörper schwächer ist als angegeben. kWh kommen aus dem Zählerstand des Shelly (ohne Energiezähler „–“), Stunden ≈ kWh ÷ Ø kW, bei Pumpen die gemessene Pumpzeit.'))}</div>`;
}

/* „Was fällt auf“: die Integration wählt aus (logik/auswertung.erkenntnisse), die Seite macht nur den Text */
function erkenntnisse(p, A, z) {
  return ((A && A.erkenntnisse) || []).map(x => ({
    gespart: ['💶', `${de(x.eur, 0)} € gespart`, `Die Automatik spart ${de(x.prozent, 0)} % gegenüber Dauerbetrieb${x.hinweis ? ` (${x.hinweis})` : ''}.`, 'ohne'],
    groesster: ['🔥', `${x.name} verbraucht am meisten`, `${de(x.kwh, 0)} kWh · ${de(x.anteil, 0)} % des Verbrauchs.`, 'geraete'],
    sparsamster: ['⚙', `${x.name} heizt am sparsamsten`, `${de(x.kwh_h, 2)} kWh je Heizstunde.`, 'vergleich'],
    wetter: ['🌡', `Je Grad kälter +${de(x.kwh_je_grad, 1)} kWh am Tag`, [zahl(x.eur_je_grad) ? `≈ ${de(x.eur_je_grad, 2)} € je Grad` : '', zahl(x.null0) ? `unter ${de(x.null0, 0)} °C außen wird geheizt` : ''].filter(Boolean).join(' · '), 'wetter'],
    mehr: ['📈', `${x.prozent} % mehr als ${awVgl(p, z)}`, 'Verbrauch im Vergleich zum Zeitraum davor.', 'verlauf'],
    weniger: ['📉', `${x.prozent} % weniger als ${awVgl(p, z)}`, 'Verbrauch im Vergleich zum Zeitraum davor.', 'verlauf'],
    typ: ['⚖', x.weniger > 0 ? `Ölradiator ${de(x.weniger, 0)} % sparsamer` : `Konvektor ${de(-x.weniger, 0)} % sparsamer`, 'aus eigenen Messungen je Heizstunde.', 'vergleich'],
  })[x.art]).filter(Boolean);
}

/* FE-0006: Verbrauch als Kachel – gestapelt je Container/Baustelle oder Firma (quellen wie das große Diagramm), füllt die Kachel.
   Nur Anordnung der Balken (Pixel); die kWh kommen aus der Statistik bzw. der Integration (quellen). */
function diagramm(p, z, gr) {
  const st = p.s.aw, Q = p.quellen(st, 'aw'), werte = Q.map(q => ({ q, v: q.v(z) }));
  const alle = p.s.awScope === 'alle', firma = st.gruppe === 'firma', kopf = html`<div class="aw-dia-kopf"><b>Verbrauch</b>
      <div class="seg klein">${[['teil', alle ? 'Baustelle' : 'Container'], ['firma', 'Firma']].map(([k, t]) => html`<button data-v=${k} class=${(firma ? 'firma' : 'teil') === k ? 'on' : ''} @click=${() => p.vbGruppe('aw', k)}>${t}</button>`)}</div></div>`;
  if (werte.some(x => !x.v)) return html`<div class="glas-panel aw-dia">${kopf}${LAEDT}</div>`;
  const zr = p.zeitraum(z, st.v || 0), labels = zr.labels, n = labels.length, reihen = werte.map(({ q, v }) => ({ name: q.name, farbe: q.farbe, v }));
  const summen = labels.map((_, i) => reihen.reduce((a, r) => a + (r.v[i] || 0), 0)), ges = summe(summen);
  const W = gr.w * 160, H = Math.max(90, gr.h * 110 + (gr.h - 1) * 12 - 78), L = 30, R = 6, T = 6, U = 16, hi = Math.max(...summen, 0) * 1.1 || 1;
  const stufe = hi > 200 ? 100 : hi > 40 ? 20 : hi > 12 ? 5 : hi > 4 ? 2 : hi > 1.5 ? .5 : .2, y = v => T + (1 - v / hi) * (H - T - U), bw = (W - L - R) / n, jedes = Math.max(1, Math.ceil(n / (gr.w * 4)));
  const raster = [...Array(Math.floor(hi / stufe) + 1)].map((_, q) => q * stufe).map(v => `<line x1="${L}" x2="${W - R}" y1="${y(v).toFixed(1)}" y2="${y(v).toFixed(1)}" class="gr"/><text x="${L - 4}" y="${(y(v) + 3).toFixed(1)}" class="ax" text-anchor="end">${de(v, stufe < 1 ? 1 : 0)}</text>`).join('');
  const bars = labels.map((lab, i) => { let unten = 0;
    return reihen.map(r => { const v = r.v[i] || 0; if (!(v > 0)) return ''; const y1 = y(unten + v), y0 = y(unten); unten += v;
      return `<rect x="${(L + i * bw + bw * .12).toFixed(1)}" y="${y1.toFixed(1)}" width="${(bw * .76).toFixed(1)}" height="${Math.max(0, y0 - y1).toFixed(1)}" fill="${r.farbe}" rx="1.5"><title>${esc(String(lab))} · ${esc(r.name)} · ${de(v, 1)} kWh</title></rect>`; }).join('')
      + (i % jedes === 0 ? `<text x="${(L + i * bw + bw / 2).toFixed(1)}" y="${H - 3}" class="ax" text-anchor="middle">${esc(String(lab))}</text>` : ''); }).join('');
  // SVG als Ganzes per unsafeHTML (Inhalt eines Lit-<svg> bräuchte unsafeSVG)
  return html`<div class="glas-panel aw-dia">${kopf}
      ${unsafeHTML(`<svg class="aw-dia-svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet">${raster}${bars}</svg>`)}
      <div class="aw-dia-leg">${reihen.map(r => html`<span><i style="background:${r.farbe}"></i>${r.name}</span>`)}<span class="leise">${de(ges, ges < 100 ? 1 : 0)} kWh · kWh je ${{ Tag: 'Stunde', Woche: 'Tag', Monat: 'Tag', Jahr: 'Monat' }[z]}</span></div></div>`;
}

/* ---- Bausteine (WU-0005): die Seite ordnet sie nach dem eigenen Layout an (Variante 6) ---- */
function bausteine(p) {
  const d = p.d, aw = p.s.aw ||= { zeitraum: 'Monat', auswahl: d.bereiche.map(b => b.id) }, z = aw.zeitraum, vs = aw.v || 0;
  const alle = p.s.awScope === 'alle';
  // Kennzahlen, Vergleich zum Zeitraum davor, Ohne Automatik, Wetter, Ölradiator/Konvektor, Je Gerät: von der Integration (api §8)
  const A = p.awDaten(z, vs), S = (A && A.summen) || {}, vd = k => (S.veraenderung || {})[k] ?? null, oa = S.ohne_automatik || null;
  const kwh = A ? S.kwh : null, hz = A ? S.heizzeit : null, pz = A ? S.pumpzeit : null, ohne = A ? S.ohne : null;
  const vgl = p.zrVgl(z, vs);
  const kz = (wert, text, dl) => html`<div><b>${wert}</b><span>${text}</span>${dl !== null ? html`<em class="${dl > 0 ? 'mehr' : 'weniger'}">${dl > 0 ? '▲' : '▼'} ${Math.abs(dl)} %</em>` : nothing}</div>`;
  // AN-0008: fair – nur Zeiten im Modus Thermostat mit Fühler, Container mit einem Typ, kWh je Gradstunde (Integration)
  const T = ['oelradiator', 'konvektor'].map(t => { const x = (A && A.typ && A.typ[t]) || {}; return { kwhG: x.kwh_gradh ?? null, kwhGm2: x.kwh_gradh_m2 ?? null, auf: x.auf ?? null, ab: x.ab ?? null, container: x.container || [] }; });
  const vglOk = !!(A && A.typ && A.typ.vergleichbar), aussen = (A && A.typ && A.typ.ausgeschlossen) || [];
  // Was die Ölradiatoren gegenüber Konvektoren gespart haben (Integration: typ.ersparnis)
  const er = A && A.typ && A.typ.ersparnis, zrE = p.zeitraum(z, vs);
  const ersparT = !er ? '' : html`<div class="kennz"><div><b>${de(er.oel_kwh, er.oel_kwh < 100 ? 1 : 0)}</b><span>kWh Ölradiatoren</span></div>
        <div><b>${de(er.konvektor_kwh, er.konvektor_kwh < 100 ? 1 : 0)}</b><span>kWh mit Konvektoren</span></div>
        <div><b class="${er.erspart_eur < 0 ? 'rot-t' : ''}">${de(Math.abs(er.erspart_eur), 2)} €</b><span>${er.erspart_eur < 0 ? 'mehr' : 'erspart'}</span></div></div>
      <div class="leise">${{ Tag: 'kWh je Stunde', Woche: 'kWh je Tag', Monat: 'kWh je Tag', Jahr: 'kWh je Monat' }[z]} · ${p.zrText(z, vs)}</div>
      <div class="chart-wrap">${unsafeHTML(flaeche(`typ-er-${z}-${vs}`, [{ name: 'Ölradiatoren (tatsächlich)', v: er.oel, farbe: 'var(--s1)' }], zrE.labels, 'kWh',
        z === 'Tag' ? 6 : z === 'Monat' ? 7 : z === 'Woche' ? 1 : 3, { name: 'mit Konvektoren', v: er.konvektor }))}</div>
      <div class="leise">„Mit Konvektoren“ = der tatsächliche Verbrauch der Ölradiatoren mal ${de(er.faktor, 2)} – so viel mehr bzw. weniger brauchen Konvektoren hier je Gradstunde.</div>`;
  const f = (v, fn) => zahl(v) ? fn(v) : '–';
  // wie Mockup: fett ist der Nachteil (mehr kWh, langsamer aufheizen, schneller abkühlen); Kosten ohne Hervorhebung
  const nachteil = (i, hoch) => { const a = T[0][i], b = T[1][i]; if (hoch === null || !zahl(a) || !zahl(b) || a === b) return [false, false]; return hoch ? [a > b, b > a] : [a < b, b < a]; };
  const zelle = (v, fett, fn) => fett ? html`<b>${f(v, fn)}</b>` : f(v, fn);
  const zeile = (titel, i, hoch, fn) => { const [x, y] = nachteil(i, hoch); return html`<tr><td>${titel}</td><td>${zelle(T[0][i], x, fn)}</td><td>${zelle(T[1][i], y, fn)}</td></tr>`; };
  const weniger = (A && A.typ && A.typ.weniger) ?? null;
  const cmp = i => zahl(T[0][i]) && zahl(T[1][i]) && T[0][i] !== T[1][i] ? Math.sign(T[0][i] - T[1][i]) : 0;
  // Fußsatz aus den Messwerten, gebaut wie im Mockup („braucht länger, hält die Wärme aber besser und verbraucht rund 16 % weniger“)
  const auf = cmp('auf') < 0 ? 'braucht länger' : cmp('auf') > 0 ? 'heizt schneller auf' : '';
  const ab = cmp('ab') < 0 ? `hält die Wärme ${auf === 'braucht länger' ? 'aber ' : ''}besser` : cmp('ab') > 0 ? 'kühlt schneller ab' : '';
  const vb = weniger > 0 ? `verbraucht rund ${weniger} % weniger` : weniger < 0 ? `verbraucht rund ${-weniger} % mehr` : '';
  const teile = [auf, ab, vb].filter(Boolean), fussSatz = !vglOk ? 'Noch nicht vergleichbar – es braucht je einen Container nur mit Ölradiator und nur mit Konvektor, mit Fühler im Modus Thermostat.'
    : teile.length ? `Der Ölradiator ${teile.length > 1 ? `${teile.slice(0, -1).join(', ')} und ${teile.at(-1)}` : teile[0]}.` : 'Noch zu wenige Messungen für einen Vergleich.';
  // leer ('') = nur für diese Baustelle (Anpassen zeigt den Hinweis, Detail „Nur für diese Baustelle“)
  const B = {
    kennzahlen: html`<div class="glas-panel kennz vier">${kz(zahl(kwh) ? de(kwh, 0) : '–', 'kWh', vd('kwh'))}${kz(zahl(kwh) ? `${de(S.eur, 0)} €` : '–', 'Kosten', vd('kwh'))}${kz(zahl(hz) ? `${de(hz, 0)} h` : '–', 'Heizzeit', vd('heizzeit'))}${kz(zahl(pz) ? `${de(pz, 1)} h` : '–', 'Pumpzeit', vd('pumpzeit'))}</div>
      <div class="leise vgl">Pfeile: im Vergleich zu ${vgl}</div>`,
    verlauf: html`<div class="glas-panel block">${verbrauchVorlage(p, aw, 'aw', false)}</div>`,
    leistung: alle ? '' : leistungHeute(p),
    temperaturen: alle ? '' : temperaturen(p),
    abrechnung: abrechnung(p, z),
    geraete: alle ? '' : geraeteBlock(p, z, A),
    // BSM-033.03: „Wetter-Einfluss“ und „Hochrechnung“ sind jetzt die Karte „Heizperiode“ (Reiter Signatur bzw. Hochrechnung)
    wetter: alle ? '' : heizperiodeVorlage(p, A, 'sig'),
    ohne: html`<div class="glas-panel block"><div class="block-kopf"><b>Ohne Automatik</b><span class="leise">wenn alles rund um die Uhr liefe</span></div>
        ${!zahl(ohne) || !zahl(kwh) ? (ohne === null || kwh === null ? LAEDT : html`<div class="leer">Noch keine Werte</div>`) : !oa ? html`<div class="leer">Noch keine Werte</div>` : html`
        <div class="hbar"><span class="hb-n">mit Automatik</span><span class="hb-spur"><i style="width:${Math.min(100, kwh / ohne * 100)}%;background:var(--s1)"></i></span><span class="hb-w">${de(S.eur, 0)} €</span></div>
        <div class="hbar"><span class="hb-n">ohne (24/7)</span><span class="hb-spur"><i style="width:100%;background:var(--s2)"></i></span><span class="hb-w">${de(oa.ohne_eur, 0)} €</span></div>
        <div class="gespart">gespart <b>${de(oa.gespart_eur, 2)} €</b> · ${de(oa.prozent, 0)} %</div>
        ${oa.hinweis ? html`<div class="hp-grob">⚠ ${oa.hinweis}</div>` : nothing}`}
        <div class="leise">So rechnet „ohne Automatik“: jeder Heizkörper mit seiner gemessenen Ø-Leistung im Betrieb (sobald er Strom zieht, ab 5 W) rund um die Uhr seit Beginn der Baustelle; gespart = ohne Automatik − tatsächlich verbraucht, mal Strompreis.</div></div>`,   // AN-0007: woher der Vergleich kommt
    hochrechnung: alle ? '' : heizperiodeVorlage(p, A),
    vergleich: html`<div class="glas-panel block"><div class="block-kopf"><b>Ölradiator oder Konvektor</b><span class="leise">fair: gleiche Regelung · aus eigenen Messungen</span></div>
        <table class="vergleich"><tr><th></th><th>Ölradiator</th><th>Konvektor</th></tr>
          ${zeile('kWh je Gradstunde', 'kwhG', true, v => de(v, 3))}
          ${zeile('kWh je Gradstunde und m²', 'kwhGm2', true, v => de(v, 4))}
          ${zeile('Aufheizen', 'auf', false, v => `${de(v, 1)} °C/h`)}
          ${zeile('Abkühlen nach Aus', 'ab', true, v => `${de(v, 1)} °C/h`)}
          <tr><td>zählt</td><td class="leise">${T[0].container.join(', ') || '–'}</td><td class="leise">${T[1].container.join(', ') || '–'}</td></tr></table>
        <div class="leise fuss">${fussSatz}</div>
        ${ersparT}
        ${aussen.length ? html`<div class="leise">Nicht im Vergleich: ${aussen.map(x => `${x.name} (${x.grund})`).join(', ')}.</div>` : nothing}
        <div class="leise">kWh je Gradstunde = Strom je Stunde und °C, um den es drinnen wärmer ist als draußen. Gezählt werden nur Zeiten, in denen ein Container mit Fühler im Modus Thermostat geregelt wird; Container mit beiden Typen zählen nicht.</div></div>`,
  };
  return { B, A, z, alle };
}

/* Ein Baustein im Raster bzw. in der Einblendung; '' = nichts zu zeigen (fällt aus dem Raster) */
function stueck(p, k, B, A, z, gr = { w: 4, h: 4 }) {
  const d = p.d, S = (A && A.summen) || {}, oa = S.ohne_automatik, h = A && A.hochrechnung, rang = (A && A.rangliste) || [], preis = d.e.preis;
  const kachel = (kk, inhalt) => html`<button class="glas-panel aw-k" data-k=${kk} @click=${() => p.awDetail(kk)}>${inhalt}</button>`, laed = !A;
  const vs = p.zrV('aw'), eur = zahl(S.eur) ? `${de(S.eur, 2)} €` : '–', max = Math.max(1, ...rang.map(c => c.kwh || 0)), wann = (vs ? p.zrText(z, vs) : WANN[z]).toUpperCase();
  const temp = id => { const b = d.bereiche.find(x => x.id === id); return b && b.t !== null ? `${de(b.t)}°` : '–'; };
  const hierVon = c => d.bereiche.find(b => b.id === c.bereich);
  const auf = (hier, c) => hier ? () => p.containerOeffnen(c.bereich) : null;
  switch (k) {
    case 'betrag': return laed ? html`<div class="glas-panel block">${LAEDT}</div>` : html`<div class="glas-panel aw-betrag"><div><small>KOSTEN · ${wann}</small><b>${eur}</b>
          <span>${zahl(S.kwh) ? de(S.kwh, 0) : '–'} kWh ${awDelta((S.veraenderung || {}).kwh)} <span class="leise">zu ${awVgl(p, z)}</span></span></div>
        <div class="aw-betrag-r"><div><small>GESPART DURCH AUTOMATIK</small><b class="gruen-t">${oa ? `${de(oa.gespart_eur, 0)} €` : '–'}</b>${oa && oa.hinweis ? html`<span class="hp-grob">${oa.hinweis}</span>` : nothing}</div>
          <div><small>HOCHRECHNUNG HEIZPERIODE</small><b>${h && zahl(h.mit_eur) ? `≈ ${de(h.mit_eur, 0)} €` : '–'}</b></div></div></div>`;
    case 'rangliste': if (gr.w <= 2) return html`<div class="glas-panel block aw-klein"><div class="block-kopf"><b>Wer verbraucht was</b><span class="leise">Top 3</span></div>
          ${laed ? LAEDT : !rang.length ? html`<div class="leer">Noch kein Verbrauch</div>` : rang.slice(0, 3).map((c, i) => { const hier = hierVon(c);
            return html`<button class="aw-rang aw-rang-z" data-id=${hier ? c.bereich : nothing} ?disabled=${!hier} @click=${auf(hier, c)}><span><em>${i + 1}</em> ${c.name}</span><i style="width:${(c.kwh || 0) / max * 100}%;background:${farbeVon(hier)}"></i><em>${de(c.kwh, 0)} kWh · ${de(c.eur, 2)} €</em></button>`; })}</div>`;
      return html`<div class="glas-panel block"><div class="block-kopf"><b>Wer verbraucht was</b><span class="leise">antippen öffnet den Container</span></div>
        ${laed ? LAEDT : !rang.length ? html`<div class="leer">Noch kein Verbrauch in diesem Zeitraum</div>` : html`<div class="aw-tab-kopf"><span></span><span>kWh</span><span>€</span><span>Heizzeit</span><span>kWh/h</span><span>kWh/m²</span><span>jetzt</span></div>
        ${rang.map((c, i) => { const hier = hierVon(c);
          return html`<button class="aw-tab-zeile" data-id=${hier ? c.bereich : nothing} ?disabled=${!hier} @click=${auf(hier, c)}><span class="aw-tab-name"><span><em>${i + 1}</em>${c.name}</span>${p.s.awScope === 'alle' ? html`<small>${c.baustelle || ''}</small>` : nothing}
            <i style="width:${(c.kwh || 0) / max * 100}%;background:${farbeVon(hier)}"></i></span><b>${de(c.kwh, 0)}</b><span>${de(c.eur, 2)}</span><span>${de(c.heizzeit, 1)} h</span><span>${zahl(c.kwh_h) ? de(c.kwh_h, 2) : '–'}</span><span>${zahl(c.kwh_m2) ? de(c.kwh_m2, 2) : '–'}</span><span>${hier ? temp(c.bereich) : '–'}</span></button>`; })}`}</div>`;
    case 'erkenntnisse': { const E = erkenntnisse(p, A, z);
      return laed ? html`<div class="glas-panel block">${LAEDT}</div>` : !E.length ? html`<div class="glas-panel block"><div class="block-kopf"><b>Was fällt auf</b></div><div class="leer">Noch nichts Auffälliges</div></div>`
        : html`<div class="aw-karten">${E.map(([i, t, x, kk]) => html`<button class="glas-panel aw-karte" data-k=${kk} @click=${() => p.awDetail(kk)}><span>${i}</span><b>${t}</b><small>${x}</small></button>`)}</div>`; }
    case 'k-kosten': return kachel('abrechnung', html`<small>KOSTEN · ${wann}</small><b>${eur}</b><span>${zahl(S.kwh) ? de(S.kwh, 0) : '–'} kWh ${awDelta((S.veraenderung || {}).kwh)}</span>`);
    case 'k-gespart': return kachel('ohne', html`<small>GESPART</small><b class="gruen-t">${oa ? `${de(oa.gespart_eur, 0)} €` : '–'}</b><span>${oa ? `${de(oa.prozent, 0)} % durch Automatik` : 'noch keine Werte'}</span>${oa && oa.hinweis ? html`<span class="hp-grob">${oa.hinweis}</span>` : nothing}`);
    case 'k-hoch': return kachel('hochrechnung', html`<small>HOCHRECHNUNG</small><b>${h && zahl(h.mit_eur) ? `${de(h.mit_eur, 0)} €` : '–'}</b><span>bis Ende Heizperiode</span>`);
    case 'k-wer': { const W = rang.slice(0, 4);
      return kachel('geraete', html`<small>WER VERBRAUCHT</small>${W.length ? W.map(c => html`<div class="aw-rang"><span>${c.name}</span><i style="width:${(c.kwh || 0) / max * 100}%;background:${farbeVon(hierVon(c))}"></i><em>${de(c.kwh, 0)} kWh</em></div>`) : html`<span>–</span>`}`); }
    case 'k-firmen': { const ab = p.abDaten(z, undefined, p.d, vs), F = (ab && ab.firmen) || [];
      return kachel('abrechnung', html`<small>FIRMEN</small>${F.length ? F.map(f => html`<div class="aw-zeile"><span>${f.firma}</span><b>${de(f.eur ?? (f.kwh || 0) * preis, 2)} €</b></div>`) : html`<span>–</span>`}`); }
    case 'k-wetter': { const g = A && A.wetter && A.wetter.gerade; return kachel('wetter', html`<small>WETTER</small><b>${g && g.k < 0 ? `+${de(-g.k, 1)}` : '–'}</b><span>kWh je Grad kälter</span>`); }
    case 'k-oel': { const w = A && A.typ && A.typ.weniger; return kachel('vergleich', html`<small>ÖLRADIATOR</small><b>${zahl(w) ? `${w > 0 ? '−' : '+'}${de(Math.abs(w), 0)} %` : '–'}</b><span>gegenüber Konvektor</span>`); }
    case 'k-temp': { const C = d.bereiche.filter(b => !b.pumpe && b.t !== null).slice(0, 4);
      return kachel('temperaturen', html`<small>TEMPERATUREN JETZT</small>${C.length ? C.map(b => html`<div class="aw-zeile"><span>${b.name}</span><b>${de(b.t)} °C</b></div>`) : html`<span>kein Fühler</span>`}`); }
    case 'links': return html`<div class="glas-panel liste">${[['abrechnung', '💶 Abrechnung nach Firma'], ['geraete', '♨ Je Gerät'], ['temperaturen', '🌡 Temperaturen'], ['wetter', '🌦 Energiesignatur'], ['vergleich', '⚖ Ölradiator oder Konvektor'], ['hochrechnung', '📅 Heizperiode · Hochrechnung']]
      .filter(([kk]) => B[kk]).map(([kk, t]) => html`<button class="zeile" data-k=${kk} @click=${() => p.awDetail(kk)}><span>${t}</span><span class="chev">›</span></button>`)}</div>`;
    case 'verlauf': return diagramm(p, z, gr);   // FE-0006: füllt die Kachel, ohne eigene Zeitraum-Leiste
    case 'wetter': return gr.w <= 1 ? stueck(p, 'k-wetter', B, A, z) : B.wetter;
    default: return B[k] || '';
  }
}

/* Kopf: Layout, Anpassen, Preis simulieren, CSV, ＋ Kachel (data-aw nur Test-Merkmal) */
function kopf(p, alle) {
  const S = p.s, layout = S.awLayout, bearb = S.awBearb;
  return kopfVorlage('Auswertung', alle ? 'ALLE LAUFENDEN BAUSTELLEN' : p.d.titel, html`<span class="aw-knoepfe"><button class="glas-panel chip ${layout ? 'amber' : ''}" data-aw="layout" @click=${() => p.awLayoutUmschalten()}>${layout ? '✓ Fertig' : '✥ Layout'}</button>
        <button class="glas-panel chip ${bearb ? 'amber' : ''}" data-aw="bearb" @click=${() => p.awBearbUmschalten()}>${bearb ? '✓ Fertig' : '✎ Anpassen'}</button><button class="glas-panel chip ${S.awSim ? 'sp-chip-sim' : ''}" data-aw="sim" @click=${() => p.simUmschalten()}>💶 ${S.awSim ? `simuliert ${de(p.simPreis(), 2)} €` : 'Preis: tatsächlich'}</button><button class="glas-panel chip" data-aw="csv" @click=${() => p.csv()}>⇩ CSV</button><button class="glas-panel chip kk-plus" data-aw="kk-plus" @click=${() => p.kkPlus('aw')}>＋ Kachel</button></span>`);
}

/* Leiste: Band „Simuliert“, Zeitraum, Scope, ‹ Zeitraum › */
function leiste(p, z, alle) {
  const S = p.s;
  return html`${S.awSim ? html`<div class="sp-band">🧮 Simuliert: alle € dieser Auswertung mit <span class="sp-sim"><button class="glas-panel chip" data-d="-0.01" @click=${() => p.spSim(-0.01)}>−</button><b>${de(p.simPreis(), 2)} €/kWh</b><button class="glas-panel chip" data-d="0.01" @click=${() => p.spSim(0.01)}>+</button></span> <button class="rv-link" data-aw="sim-zurueck" @click=${() => p.simUmschalten()}>zurück auf tatsächlich</button></div>` : nothing}<div class="aw-leiste"><div class="seg glas-panel">${['Tag', 'Woche', 'Monat', 'Jahr'].map(t => html`<button data-v=${t} class=${z === t ? 'on' : ''} @click=${() => p.zeitraumWahl('aw', t)}>${t}</button>`)}</div>
      <div class="seg glas-panel">${[['diese', 'Diese Baustelle'], ['alle', `Alle laufenden (${p.laufende().length})`]].map(([k, t]) => html`<button data-v=${k} class=${(S.awScope || 'diese') === k ? 'on' : ''} @click=${() => p.awScopeWahl(k)}>${t}</button>`)}</div></div>
      ${zeitraumVorlage(p, 'aw', z, p.zrGrenze(alle))}`;
}

/* Anpassen: Vorlagen, Bausteine ein/aus, Reihenfolge, Größenstufe (gemerkt je Browser über p.awMerken) */
function anpassen(p, L, B, alle) {
  return html`<div class="glas-panel block aw-vorlagen"><div class="block-kopf"><b>Vorlage</b><span class="leise">stellt Bausteine, Reihenfolge und Größe ein – danach frei anpassbar</span></div>
          <div class="aw-vorlagen-k">${Object.entries(AW_VORLAGEN).map(([k, [t]]) => html`<button class="glas-panel chip" data-v=${k} @click=${() => p.awVorlageWahl(k)}>${t}</button>`)}</div></div>
        <div class="glas-panel liste aw-wahl"><div class="gruppe">Bausteine · ein/aus, Reihenfolge, Größe (nur Stufen, die zum Inhalt passen)</div>
          ${L.map((x, i) => html`<div class="zeile" data-i=${i}><div><b>${p.kkName(x)}</b><div class="leise">${AW_BAUSTEINE[x.k] ? AW_BAUSTEINE[x.k][1] : `Kachel · ${KK[x.k].text}`}${alle && !B[x.k] && B[x.k] !== undefined ? ' · nur für diese Baustelle' : ''}</div></div>
            <div class="aw-wahl-k"><button class="glas-panel chip" ?disabled=${!i} aria-label="nach oben" @click=${() => p.awVerschieben(i, i - 1)}>↑</button><button class="glas-panel chip" ?disabled=${i >= L.length - 1} aria-label="nach unten" @click=${() => p.awVerschieben(i, i + 1)}>↓</button>
              <div class="seg klein">${awStufen(x.k).map(([n, w, h]) => html`<button data-v=${n} class=${x.st === n ? 'on' : ''} title="${w}×${h}" @click=${() => p.awStufeWahl(i, n)}>${n}</button>`)}</div>${schalterVorlage(x.an, () => p.awAn(i), 'vor-ort')}</div></div>`)}
          <button class="zeile" data-v="misch" @click=${() => p.awVorlageWahl('misch')}><span class="blau">Auf Vorschlag zurücksetzen</span></button></div>`;
}

export function auswertungVorlage(p) {
  const { B, A, z, alle } = bausteine(p), L = p.awAuswahl(), layout = p.s.awLayout;
  const k = kopf(p, alle), l = leiste(p, z, alle);
  if (p.s.awBearb) return html`${k}${l}
      ${anpassen(p, L, B, alle)}`;
  const an = L.filter(x => x.an), c = p.kkCtx('aw');
  const teile = an.map((x, i) => ({ x, i, inhalt: KK[x.k] ? kachelVorlage(p, x, i, 'aw', c) : stueck(p, x.k, B, A, z, x) })).filter(t => t.inhalt);
  return html`${k}${l}
      ${layout ? html`<div class="leise aw-hinweis">Kachel am Griff ⠿ ziehen zum Verschieben · am Griff ◢ ziehen für die Größe (rastet im Raster ein) · 📈 Diagramm der großen Kachel ein/aus · ✕ blendet aus</div>` : nothing}
      ${teile.length || !layout ? rasterVorlage(p, 'aw', teile, layout) : html`<div class="leer">Nichts ausgewählt – „＋ Kachel“</div>`}`;
}

/** Einblendung „aw-detail“ (WU-0005): Details einer Kachel/Karte; rechnet die Bausteine selbst (Daten aus dem Zwischenspeicher
    von p.awDaten/p.abDaten) – vorher über this._awTeile aus dem letzten Zeichnen der Auswertung */
export function awDetailEinblendung(p, s) {
  const { B, A, z } = bausteine(p), inhalt = stueck(p, s.k, B, A, z);
  return html`<div class="griff"></div><div class="aw-detail">${inhalt || html`<div class="leer">Nur für diese Baustelle</div>`}</div><button class="knopf leise-k" @click=${() => p.schliessen()}>Schließen</button>`;
}
