// „Meine Kacheln“ und Kachel-Katalog mit Lit (BSM-022 Stufe 3f; WU-0014, WU-0017). Kacheln S/M/L, Raster mit Layout
// (verschieben/Größe über die Griffe data-zug → BaustellePanel.zugStart, ✕, 📈), Katalog mit Suche und Filtern.
// Werte und Diagramme liefert die Seite (kkDaten, vgWerte, vgDia, spKachel-Daten über awDaten); hier nur die Anzeige.
import { html, nothing } from 'lit';
import { live } from 'lit/directives/live.js';
import { unsafeHTML } from 'lit/directives/unsafe-html.js';
import { de, esc, stdMin, zahl } from '../hilfen.js';
import { BEREICH_FARBEN } from '../symbole.js';
import { funke, kkBalken } from '../diagramme.js';
import { AW_VORLAGEN, KK, KK_BEREICHE, KK_GROESSE } from '../kacheln-daten.js';
import { schalterVorlage } from './allgemein.js';

const roh = v => unsafeHTML(String(v ?? ''));   // Werte der Kachel-Daten enthalten teils Auszeichnung (z. B. ▲ %)
const kopf = (ic, name) => html`<div class="kk-kopf"><span class="kk-ic">${ic}</span><small>${name}</small></div>`;
const huelle = (p, x, i, ort, gr, inhalt, tip) => ort === 'kat' ? html`<div class="glas-panel kk kk-${gr}">${inhalt}</div>`
  : html`<div class="glas-panel kk kk-${gr}" role="button" tabindex="0" data-ort=${ort} data-i=${i} title=${tip} @click=${() => p.kkAufI(ort, i)}>${inhalt}</div>`;
const fb = b => BEREICH_FARBEN[b.f % BEREICH_FARBEN.length];
/* S-Kachel (Herbert 28.10.2026): Breite der Zahl in em (Ziffern .56, Satzzeichen .3, Leerzeichen .28, sonst .6; 3 % Luft) und der
   Einheit (13 px) für die Schriftgröße im CSS (.kk-S .kk-zahl) – die Zahl passt sich am Handy der Kachelbreite an; reicht auch
   die kleinste Größe nicht, bricht sie um statt abgeschnitten zu werden */
const breiteS = (zahlText, einh) => { const t = String(zahlText ?? '').replace(/<[^>]*>/g, '').replace(/&[a-z#0-9]+;/gi, 'x');
  const em = [...t].reduce((a, ch) => a + (/\d/.test(ch) ? .56 : /[:.,/]/.test(ch) ? .3 : /\s/.test(ch) ? .28 : .6), 0) * 1.03;
  return `--kk-n:${Math.max(.6, em).toFixed(2)};--kk-e:${einh ? Math.round((String(einh).length + 1) * 7.5) : 0}px`; };

/* WU-0017: Vergleich kWh / Kosten – 2 bis 4 Container gegenüber */
function vergleich(p, x, i, ort, c) {
  const e = KK[x.k], W0 = p.vgWerte(x, c), R = W0.R, gr = x.st, eur = W0.eur;
  const wert = v => zahl(v) ? (eur ? `${de(v, 2)} €` : `${de(v, v < 100 ? 1 : 0)} kWh`) : '–';
  const { vorne, hinten, min } = W0, diff = vorne && hinten && vorne !== hinten ? vorne.su - hinten.su : null;
  const unter = diff === null ? (R.length ? 'gleich viel' : 'keine Container') : html`${vorne.b.name} <b>+${wert(diff)}</b>${min > 0 ? ` (+${de((vorne.su / min - 1) * 100, 0)} %)` : ''} zu ${hinten.b.name}`;
  const zeilen = html`<div class="vg-zeilen">${R.map(q => html`<div><span><i style="background:${fb(q.b)}"></i>${q.b.name}</span><b>${wert(q.su)}</b></div>`)}</div>`;
  const k = kopf(e.ic, e.name);
  let inhalt;
  if (gr === 'S') inhalt = html`${k}${zeilen}`;
  else if (gr === 'M') inhalt = html`<div class="kk-m-l">${k}<span class="kk-wo">${W0.wann}</span><span class="kk-vgl">${unter}</span></div><div class="kk-m-r">${unsafeHTML(kkBalken(R.map(q => [q.b.name, q.su || 0, wert(q.su), fb(q.b)])))}</div>`;
  else inhalt = html`${k}<div class="kk-l-zeile"><span class="kk-wo">${W0.wann}</span></div><span class="kk-vgl">${unter}</span>${x.dia !== false ? html`<div class="kk-dia">${roh(p.vgDia(W0, x.art) || '<div class="leer">Noch keine Werte</div>')}</div>${zeilen}`
    : html`<table class="vg-tab"><tr><th></th><th>kWh</th><th>€</th><th>mehr</th><th>Heizzeit</th><th>kWh/h</th></tr>${R.map(q => html`<tr><td><i style="background:${fb(q.b)}"></i>${q.b.name}</td>
          <td>${zahl(q.kwh) ? de(q.kwh, 1) : '–'}</td><td>${zahl(q.kwh) ? de(q.kwh * p.d.e.preis, 2) : '–'}</td><td>${zahl(q.su) && zahl(min) && q.su > min ? `+${wert(q.su - min)}` : '–'}</td><td>${stdMin(q.h)}</td><td>${q.h > 0 ? de(q.kwh / q.h, 2) : '–'}</td></tr>`)}</table>`}`;
  return huelle(p, x, i, ort, gr, inhalt, `${p.kkName(x)} – antippen öffnet den Verbrauch`);
}

/* Preis simulieren: mit einem anderen Strompreis gerechnet (Werte der Integration) */
function preis(p, x, i, ort, c) {
  const sim = p.simPreis(), A2 = p.awDaten(c.z, c.v, ort === 'aw' ? p.s.awScope || 'diese' : 'diese', p.d, sim), S2 = (A2 && A2.summen) || {}, S = c.S;
  const echt = S.eur, simE = S2.eur, kwh = S.kwh, diff = zahl(simE) && zahl(echt) ? simE - echt : null, gr = x.st, k = kopf('🧮', 'Preis simulieren');
  const knopfSim = (dd, t, label) => html`<button class="glas-panel chip" data-d=${dd} aria-label=${label} @click=${e => { e.stopPropagation(); return p.spSim(dd); }}>${t}</button>`;
  const regler = html`<div class="sp-sim">${knopfSim(-0.01, '−', 'Preis niedriger')}<b>${de(sim, 2)} €</b>${knopfSim(0.01, '+', 'Preis höher')}</div>`;
  const zahlT = zahl(simE) ? de(simE, simE < 100 ? 2 : 0) : '–', zahlH = html`<b class="kk-zahl" style=${breiteS(zahlT, '€')}>${zahlT}<small> €</small></b>`;
  const unter = diff === null ? 'lädt …' : `${diff > 0 ? '+' : diff < 0 ? '−' : '±'}${de(Math.abs(diff), 2)} € gegenüber tatsächlich ${de(echt, 2)} €`;
  let inhalt;
  if (gr === 'S') inhalt = html`${k}${zahlH}<span class="kk-wo">bei ${de(sim, 2)} €/kWh</span>`;
  else if (gr === 'M') inhalt = html`<div class="kk-m-l">${k}${zahlH}<span class="kk-vgl">${unter}</span></div><div class="kk-m-r">${regler}<span class="kk-wo">${zahl(kwh) ? de(kwh, 0) : '–'} kWh · ${p.zrText(c.z, c.v)}</span></div>`;
  else inhalt = html`${k}<div class="kk-l-zeile">${zahlH}<span class="kk-wo">${p.zrText(c.z, c.v)}</span></div><span class="kk-vgl">${unter}</span>${regler}
      <div class="kk-dia zeilen"><div class="kk-dia-in">${unsafeHTML(kkBalken([['tatsächlich', echt || 0, zahl(echt) ? `${de(echt, 2)} €` : '–', 'var(--s1)'], [`bei ${de(sim, 2)} €`, simE || 0, zahl(simE) ? `${de(simE, 2)} €` : '–', '#bf5af2']]))}</div></div>
      <div class="leise">tatsächlich = je Tag der damals gültige Preis · simuliert = alle ${zahl(kwh) ? de(kwh, 0) : '–'} kWh × ${de(sim, 2)} €</div>`;
  return huelle(p, x, i, ort, gr, inhalt, 'antippen: Auswertung mit diesem Preis');
}

/** Eine Kachel S/M/L; ort 'ue' | 'aw' | 'kat' (Vorschau im Katalog, nicht antippbar) */
export function kachelVorlage(p, x, i, ort, c) {
  if (KK[x.k] && KK[x.k].je === 'v') return vergleich(p, x, i, ort, c);
  if (x.k === 'b-preis') return preis(p, x, i, ort, c);
  const e = KK[x.k], b = e.je ? p.kkB(x) : null, gr = x.st, k = kopf(e.ic, e.name);
  if (e.je && !b) return html`<div class="glas-panel kk">${k}<span class="kk-wo">kein ${e.je === 'p' ? 'Schacht' : 'Container'} vorhanden</span></div>`;
  const D = p.kkDaten(x, b, c), mitDia = gr === 'L' && x.dia !== false;
  const wo = html`<span class="kk-wo">${b ? b.name : D.wo || ''}</span>`, zahlH = html`<b class="kk-zahl" style=${breiteS(D.zahl, D.einh)}>${roh(D.zahl)}${D.einh ? html`<small> ${D.einh}</small>` : nothing}</b>`;
  let inhalt;
  if (gr === 'S') inhalt = html`${k}${zahlH}${!b && D.unter ? html`<span class="kk-wo">${roh(D.unter)}</span>` : wo}`;
  else if (gr === 'M') { const rechts = D.mini || funke(D.funke, D.farbe);
    inhalt = html`<div class="kk-m-l">${k}${zahlH}<span class="kk-vgl">${roh(D.vgl)}</span>${b ? wo : nothing}</div><div class="kk-m-r">${rechts ? roh(rechts) : html`<span class="kk-wo">${b ? D.wo || '' : ''}</span>`}</div>`; }
  else {
    const dia = mitDia ? D.dia(`kk-${ort}-${i}-${x.k}-${b ? b.id : 'b'}-${c.zc}${c.vc}`, p.narrow ? 320 : 640) : '';   // Herbert 28.10.2026: L füllt die Breite
    inhalt = html`${k}<div class="kk-l-zeile">${zahlH}${wo}</div><span class="kk-vgl">${roh(D.vgl)}</span>${mitDia ? html`<div class="kk-dia ${D.zeilen ? 'zeilen' : ''}">${dia ? roh(dia) : html`<div class="leer">Noch keine Werte</div>`}</div>`
      : html`<div class="kk-kennz">${(D.kennz || []).map(([kk, v]) => html`<div><b>${roh(v)}</b><span>${kk}</span></div>`)}</div>`}`;
  }
  return huelle(p, x, i, ort, gr, inhalt, `${p.kkName(x)} – antippen öffnet die Ansicht`);
}

/** Raster mit Layout (ziehen, Größe, ✕, 📈) – Übersicht und Auswertung gleich; teile = [{ x, i, inhalt }].
    data-ort/data-i/data-zug lesen die Griffe beim Ziehen (zugStart) – kein Klick-Ereignisweg */
export function rasterVorlage(p, ort, teile, layout) {
  return html`<div class="aw-raster ${layout ? 'layout' : ''}" data-ort=${ort}>${teile.map(({ x, i, inhalt }) => html`<div class="aw-frei-s ${p.s.kkFrisch === `${ort}:${x.k}:${x.id || ''}` ? 'kk-frisch' : ''}" data-i=${i} style="--w:${x.w};--h:${x.h}"><div class="aw-inhalt">${inhalt}</div>
        ${layout ? html`<div class="aw-ueber"><span class="aw-griff" data-zug="move" title="verschieben">⠿</span><span class="aw-name">${p.kkName(x)} · <b class="aw-mass">${x.st}</b></span>
          ${KK[x.k] && x.st === 'L' ? html`<button class="aw-dia-k ${x.dia !== false ? 'on' : ''}" title="mit oder ohne Diagramm" aria-label="Diagramm ein/aus" @click=${() => p.kkDiaUm(ort, i)}>📈</button>` : nothing}
          ${KK[x.k] && KK[x.k].je === 'v' && x.st === 'L' && x.dia !== false ? html`<button class="aw-dia-k aw-art-k on" title="Balken oder Linien" aria-label="Balken oder Linien" @click=${() => p.vgArtUm(ort, i)}>${x.art === 'linien' ? '〰' : '▮▮'}</button>` : nothing}
          <button class="aw-x nur-admin" aria-label=${KK[x.k] ? 'entfernen' : 'ausblenden'} @click=${p.nurAdmin(() => p.kkWeg(ort, i))}>✕</button><span class="aw-groesse" data-zug="size" title="Größe ändern">◢</span></div>` : nothing}</div>`)}
      ${layout ? nothing : html`<button class="glas-panel kk-neu-k" data-ort=${ort} @click=${() => p.kkPlus(ort)}><span>+</span>Kachel</button>`}</div>`;
}

/** „Meine Kacheln“ auf der Übersicht */
export function bereichVorlage(p) {
  const L = p.kkListe('ue'), layout = p.s.kkLayout, c = p.kkCtx('ue');
  const teile = L.map((x, i) => ({ x, i, inhalt: kachelVorlage(p, x, i, 'ue', c) }));
  return html`<div class="kk-bereich"><div class="kk-titel"><b>Meine Kacheln</b>
        <span class="kk-knoepfe">${L.length ? html`<button class="glas-panel chip ${layout ? 'amber' : ''}" @click=${() => p.kkLayoutUm()}>${layout ? '✓ Fertig' : '✥ Anpassen'}</button>` : nothing}<button class="glas-panel chip kk-plus" data-ort="ue" @click=${() => p.kkPlus('ue')}>＋ Kachel</button></span></div>
      ${layout ? html`<div class="leise aw-hinweis">Kachel am Griff ⠿ ziehen zum Verschieben · am Griff ◢ ziehen für die Größe · 📈 Diagramm der großen Kachel ein/aus · ✕ entfernen</div>` : nothing}
      ${rasterVorlage(p, 'ue', teile, layout)}</div>`;
}

/* ---- Katalog (Einblendung „kk-katalog“): Suche mit Filter-Chips, Schnellknöpfe S/M/L, Auswahl mit Vorschau ---- */
function wahlVergleich(p, s, e) {
  const B = p.d.bereiche.filter(b => !b.pumpe), ort = s.ort === 'aw' ? 'Auswertung' : 'Übersicht', z = () => p.neuZeichnen();
  s.ids = (s.ids || B.slice(0, 2).map(b => b.id)).filter(id => B.some(b => b.id === id)); s.zr ||= 'Tag'; s.vgArt ||= 'balken';
  if (!['S', 'M', 'L'].includes(s.st)) s.st = 'M';
  const um = id => { const j = s.ids.indexOf(id);   // 2 bis 4 Container
    if (j >= 0) { if (s.ids.length <= 2) return p.toast('Mindestens 2 Container'); s.ids.splice(j, 1); } else { if (s.ids.length >= 4) return p.toast('Höchstens 4 Container'); s.ids.push(id); }
    return z(); };
  return html`<div class="kk-wahl"><div class="gruppe-t">Container · 2 bis 4 wählen</div><div class="vb-wer vg-chips">${B.map(b => html`<button data-id=${b.id} class=${s.ids.includes(b.id) ? 'on' : ''} @click=${() => um(b.id)}><i style="background:${fb(b)}"></i>${b.name}</button>`)}</div>
      ${s.ort === 'aw' ? html`<div class="leise">Zeitraum: der gewählte der Auswertung</div>` : html`<div class="gruppe-t">Zeitraum</div><div class="seg">${[['Tag', 'heute'], ['Woche', 'diese Woche'], ['Monat', 'dieser Monat']].map(([k, t]) => html`<button data-v=${k} class=${s.zr === k ? 'on' : ''} @click=${() => { s.zr = k; z(); }}>${t}</button>`)}</div>`}
      <div class="gruppe-t">Größe</div><div class="seg">${KK_GROESSE.map(([g, t, m]) => html`<button data-v=${g} class=${s.st === g ? 'on' : ''} @click=${() => { s.st = g; z(); }}>${t} · ${m}</button>`)}</div>
      ${s.st === 'L' ? html`<div class="zeile kk-sw"><div><span>mit Diagramm</span><div class="leise">aus: Tabelle kWh, €, mehr als der sparsamste, Heizzeit, kWh je Stunde</div></div>${schalterVorlage(s.dia, () => { s.dia = !s.dia; z(); }, 'vor-ort')}</div>
        ${s.dia ? html`<div class="seg">${[['balken', '▮▮ Balken'], ['linien', '〰 Linien']].map(([k, t]) => html`<button data-v=${k} class=${s.vgArt === k ? 'on' : ''} @click=${() => { s.vgArt = k; z(); }}>${t}</button>`)}</div>` : nothing}` : nothing}
      <div class="gruppe-t">Vorschau</div><div class="aw-raster kk-vorschau"><div class="aw-frei-s" style="--w:${s.st === 'S' ? 1 : 2};--h:${s.st === 'L' ? 2 : 1}"><div class="aw-inhalt">${kachelVorlage(p, { k: e.k, ids: s.ids, zr: s.zr, st: s.st, dia: s.dia, art: s.vgArt }, 0, 'kat', p.kkCtx(s.ort))}</div></div></div>
      <button class="knopf amber" ?disabled=${s.ids.length < 2} @click=${() => p.kkHinzu(s)}>Zur ${ort} hinzufügen</button></div>`;
}

function wahl(p, s, e) {
  if (e.je === 'v') return wahlVergleich(p, s, e);   // WU-0017
  const opts = e.je ? p.kkWahlListe(e.k) : [], ort = s.ort === 'aw' ? 'Auswertung' : 'Übersicht', z = () => p.neuZeichnen();
  if (e.je && !opts.some(b => b.id === s.id)) s.id = opts[0] && opts[0].id;
  if (!e.stufen.some(q => q[0] === s.st)) s.st = (e.stufen.find(q => q[0] === 'M') || e.stufen[0])[0];
  if (e.baustein) { const x = p.awAuswahl().find(y => y.k === e.k);
    return html`<div class="kk-wahl"><div class="gruppe-t">Größe</div><div class="seg">${e.stufen.map(([g, w, h]) => html`<button data-v=${g} class=${s.st === g ? 'on' : ''} @click=${() => { s.st = g; z(); }}>${g} · ${w}×${h}</button>`)}</div>
        ${x && x.an ? html`<div class="leise">ist schon in der Auswertung – „Hinzufügen“ stellt nur die Größe um</div>` : nothing}<button class="knopf amber" @click=${() => p.kkHinzu(s)}>Zur Auswertung hinzufügen</button></div>`; }
  return html`<div class="kk-wahl">
      ${e.je ? html`<div class="gruppe-t">${e.je === 'p' ? 'Schacht' : 'Container'}${e.je === 'f' ? ' · nur mit Fühler' : ''}</div><div class="vb-wer">${opts.map(b => html`<button data-id=${b.id} class=${b.id === s.id ? 'on' : ''} @click=${() => { s.id = b.id; z(); }}><i style="background:${fb(b)}"></i>${b.name}</button>`)}</div>` : nothing}
      <div class="gruppe-t">Größe</div><div class="seg">${KK_GROESSE.map(([g, t, m]) => html`<button data-v=${g} class=${s.st === g ? 'on' : ''} @click=${() => { s.st = g; z(); }}>${t} · ${m}</button>`)}</div>
      <div class="leise">${{ S: 'Symbol und eine Zahl', M: 'Zahl, Vergleich und Mini-Verlauf', L: s.dia ? 'mit Diagramm' : 'vier Kennzahlen statt Diagramm' }[s.st]}</div>
      ${s.st === 'L' ? html`<div class="zeile kk-sw"><div><span>mit Diagramm</span><div class="leise">aus: vier Kennzahlen statt Diagramm</div></div>${schalterVorlage(s.dia, () => { s.dia = !s.dia; z(); }, 'vor-ort')}</div>` : nothing}
      <div class="gruppe-t">Vorschau</div><div class="aw-raster kk-vorschau"><div class="aw-frei-s" style="--w:${s.st === 'S' ? 1 : 2};--h:${s.st === 'L' ? 2 : 1}"><div class="aw-inhalt">${kachelVorlage(p, { k: e.k, id: s.id, st: s.st, dia: s.dia }, 0, 'kat', p.kkCtx(s.ort))}</div></div></div>
      <button class="knopf amber" @click=${() => p.kkHinzu(s)}>Zur ${ort} hinzufügen</button></div>`;
}

function treffer(p, s) {
  const q = (s.q || '').toLowerCase().split(/\s+/).filter(Boolean), bt = k => (KK_BEREICHE.find(x => x[0] === k) || [])[1] || '', z = () => p.neuZeichnen();
  const markiere = t => { let h = esc(t); for (const w of q.filter(x => x.length > 1)) h = h.replace(new RegExp(`(${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi'), '<mark>$1</mark>'); return unsafeHTML(h); };
  const L = p.kkEintraege(s.ort).filter(e => ((s.f || 'alle') === 'alle' || e.ber === s.f) && (!s.nurJe || e.je) && (!s.nurEur || /euro/.test(`${e.such} ${e.name} ${e.text}`.toLowerCase()))
    && q.every(w => `${e.name} ${e.text} ${e.such} ${bt(e.ber)}`.toLowerCase().includes(w)));
  if (!L.length) return html`<div class="kk-tr-leer">Keine Kachel gefunden – anderes Wort oder Filter „Alle“.</div>`;
  const zeile = e => { if (s.k === e.k) s.k = null; else { s.k = e.k; s.id = null; } z(); };
  const groesse = (e, g) => ev => { ev.stopPropagation(); if (s.k !== e.k) s.id = null; s.k = e.k; s.st = g; z(); };
  /* Herbert 28.10.2026 (Mockup katalog-markiert.html, Variante B): schon eingebaute Kacheln des Orts markiert – linker Balken,
     eingebaute Größe umrandet, bei Kacheln je Container die Container mit Größe darunter */
  const an = p.kkListe(s.ort).filter(x => x.an);
  const wer = (e, D) => D.map(x => { const b = e.je && e.je !== 'v' ? p.kkB(x) : null; return b ? `${b.name} ${x.st}` : x.st; });
  return html`<div class="leise">${L.length} ${L.length === 1 ? 'Kachel' : 'Kacheln'}</div>${L.map(e => { const on = s.k === e.k, D = an.filter(x => x.k === e.k), st = new Set(D.map(x => x.st));
      const je = D.length && e.je && e.je !== 'v' ? wer(e, D).join(' · ') : '';
      return html`<div class="kk-tr-zeile ${on ? 'on' : ''} ${D.length ? 'kk-drin' : ''}" data-k=${e.k} role="button" tabindex="0" @click=${() => zeile(e)}><span class="kk-z-ic">${e.ic}</span><div class="kk-z-t"><b>${markiere(e.name)}</b>${je ? html`<span class="kk-tr-wer">${je}</span>` : nothing}<div class="leise">${bt(e.ber)} · ${markiere(e.text)}</div></div>
        <span class="kk-tr-gr">${e.stufen.map(([g]) => html`<button data-v=${g} class="${on && s.st === g ? 'on' : ''} ${st.has(g) ? 'kk-gr-drin' : ''}" title=${st.has(g) ? 'schon eingebaut in dieser Größe' : nothing} @click=${groesse(e, g)}>${g}</button>`)}</span></div>${on ? html`${D.length && !e.baustein ? html`<div class="leise kk-offen-hin">schon ${D.length > 1 ? `${D.length}× ` : ''}eingebaut (${wer(e, D).join(', ')}) – „Hinzufügen“ legt eine weitere an</div>` : nothing}${wahl(p, s, e)}` : nothing}`; })}`;
}

/** Einblendung „kk-katalog“ (Übersicht und Auswertung) */
export function katalogEinblendung(p, s) {
  const z = () => p.neuZeichnen(), chip = (an, t, fn) => html`<button class="kk-chip ${an ? 'on' : ''}" @click=${() => { fn(); s.k = null; z(); }}>${t}</button>`;
  return html`<div class="griff"></div><div class="kk-kat kk-such"><h3>＋ Kachel · ${s.ort === 'aw' ? 'Auswertung' : 'Übersicht'}</h3>
      <input type="search" data-f="q" placeholder="Suchen – z. B. Kosten, Temperatur, Pumpe" value=${s.q || ''} .value=${live(s.q || '')} autocomplete="off" @input=${e => { s.q = e.target.value; s.k = null; z(); }}>
      <div class="kk-chips">${[['alle', 'Alle'], ...KK_BEREICHE.filter(([k]) => k !== 'auswertung' || s.ort === 'aw')].map(([k, t]) => chip((s.f || 'alle') === k, t, () => { s.f = k; }))}
        ${chip(s.nurJe, 'je Container', () => { s.nurJe = !s.nurJe; })}${chip(s.nurEur, '€', () => { s.nurEur = !s.nurEur; })}</div>
      <div class="kk-treffer">${treffer(p, s)}</div>
      ${s.ort === 'aw' ? html`<details class="kk-vorlagen"><summary>Vorlage laden</summary><div class="aw-vorlagen-k">${Object.entries(AW_VORLAGEN).map(([k, [t]]) => html`<button class="glas-panel chip" data-v=${k} @click=${() => p.awVorlageWahl(k)}>${t}</button>`)}</div></details>` : nothing}
      <button class="knopf" @click=${() => p.schliessen()}>Schließen</button></div>`;
}
