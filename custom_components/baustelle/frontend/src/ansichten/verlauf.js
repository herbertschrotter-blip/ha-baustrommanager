// Verlauf (Archiv, Vergleich, Chronik) und abgeschlossene Baustelle mit Lit (BSM-022 Stufe 3b). Zahlen kommen aus der
// Integration (p.kennz, p.verlaufDaten); die Seite ordnet nur zu. Diagramme bleiben bis Stufe 4 SVG-Text (unsafeHTML).
import { html, nothing } from 'lit';
import { unsafeHTML } from 'lit/directives/unsafe-html.js';
import { MONATE, de, kurzDatum, zahl } from '../hilfen.js';
import { BEREICH_FARBEN } from '../symbole.js';
import { flaeche } from '../diagramme.js';
import { kopfVorlage } from './allgemein.js';

const LAEDT = html`<div class="leer">Lädt …</div>`;

/* Archiv: Summe über alle, je Baustelle eine Karte mit Mini-Verlauf der letzten 12 Monate (aktive zuerst) */
function archiv(p) {
  const BS = [...p.alle].sort((a, b) => (b.aktiv - a.aktiv)), K = new Map(BS.map(b => [b.entry, p.kennz(b)])), MONK = p.vlMonatsKeys(), laedt = BS.some(b => K.get(b.entry).laedt);
  const sum = k => BS.reduce((a, b) => a + (K.get(b.entry)[k] || 0), 0);
  const zahl0 = (v, n = 0) => zahl(v) ? de(v, n) : '–';
  return html`<div class="glas-panel kennz vier">${[[BS.length, `Baustellen · ${BS.filter(b => b.aktiv).length} aktiv`], [laedt ? '–' : de(sum('kwh'), 0), 'kWh gesamt'], [laedt ? '–' : `${de(sum('eur'), 0)} €`, 'Kosten gesamt'], [laedt ? '–' : `${de(sum('gespart'), 0)} €`, 'gespart']].map(([w, t]) => html`<div><b>${w}</b><span>${t}</span></div>`)}</div>
      ${BS.length ? html`<div class="vl-archiv">${BS.map(b => { const k = K.get(b.entry), i = p.alle.indexOf(b), farbe = `var(--s${(i % 6) + 1})`;
        return html`<button class="glas-panel vl-karte ${b.aktiv ? 'aktiv' : ''}" data-bs=${b.entry} @click=${() => p.baustelleOeffnen(b.entry)}>
          <div class="bs-kopf"><b>${b.titel}</b><span class="badge ${b.aktiv ? 'gruen' : ''}">${b.aktiv ? 'aktiv' : 'abgeschlossen'}</span></div>
          <div class="leise">${k.zeit} · ${k.container} Container · ${k.laedt ? '–' : k.heiztage} Heiztage</div>
          ${unsafeHTML(p.vlFunke(MONK.map(m => k.jeMonat[m] || 0), farbe))}<div class="vl-monate"><span>${MONATE[+MONK[0].slice(5) - 1]}</span><span>${MONATE[+MONK[11].slice(5) - 1]}</span></div>
          <div class="vl-zahlen"><div><b>${k.laedt ? '–' : zahl0(k.kwh)}</b><small>kWh</small></div><div><b>${k.laedt ? '–' : `${zahl0(k.eur)} €`}</b><small>Kosten</small></div>
            <div><b>${k.laedt ? '–' : zahl0(k.vergleich.tag, 1)}</b><small>kWh/Heiztag</small></div><div><b class="gruen-t">${zahl(k.gespart) ? `${de(k.gespart, 0)} €` : '–'}</b><small>${k.gespartText}</small></div></div>
          <span class="leise vl-mehr">${b.aktiv ? 'Übersicht ›' : 'ansehen ›'}</span></button>`; })}</div>` : html`<div class="glas-panel block"><div class="leer">Noch keine Baustelle</div></div>`}`;
}

/* Vergleich: sortierbare Tabelle aller Baustellen (Werte der Integration), darunter die letzten 12 Monate */
function vergleich(p) {
  const BS = p.alle, K = new Map(BS.map(b => [b.entry, p.kennz(b)])), sp = p.s.vlSort || 'tag', ab = p.s.vlAb !== false, MONK = p.vlMonatsKeys();
  const spalten = [['name', 'Baustelle'], ['tag', 'kWh/Heiztag'], ['monat', '€/Monat'], ['kwh', 'kWh'], ['eur', '€'], ['heiztage', 'Heiztage'], ['container', 'Cont.']];
  const wert = (b, kk) => { const k = K.get(b.entry); return ({ name: b.titel, tag: k.vergleich.tag, monat: k.vergleich.monat, kwh: k.kwh, eur: k.eur, heiztage: k.heiztage, container: k.container })[kk]; };
  const zeilen = BS.map((b, i) => ({ b, i })).sort((x, y) => { const a = wert(x.b, sp), c = wert(y.b, sp); return (typeof a === 'string' ? String(a).localeCompare(String(c)) : (a ?? -1) - (c ?? -1)) * (ab ? -1 : 1); });
  const tage = BS.map(b => wert(b, 'tag')).filter(v => zahl(v) && v > 0), bester = tage.length > 1 ? Math.min(...tage) : null;
  const reihen = BS.map((b, i) => ({ name: b.titel, v: MONK.map(m => K.get(b.entry).jeMonat[m] || 0), farbe: `var(--s${(i % 6) + 1})` })).filter(x => x.v.some(v => v > .5));
  const laedt = BS.some(b => K.get(b.entry).laedt), f = (v, n = 0) => zahl(v) ? de(v, n) : '–';
  const sortiere = k => { p.s.vlAb = p.s.vlSort === k ? !(p.s.vlAb !== false) : true; p.s.vlSort = k; p.neuZeichnen(); };
  return html`<div class="glas-panel block vl-tabelle"><div class="block-kopf"><b>Alle Baustellen</b><span class="leise">Spalte antippen sortiert · kWh je Heiztag ist am besten vergleichbar</span></div>
        <div class="vl-tab-kopf">${spalten.map(([k, t]) => html`<button class=${sp === k ? 'on' : ''} data-sp=${k} @click=${() => sortiere(k)}>${t}${sp === k ? (ab ? ' ▼' : ' ▲') : ''}</button>`)}</div>
        ${zeilen.map(({ b, i }) => { const k = K.get(b.entry); return html`<button class="vl-tab-zeile" data-bs=${b.entry} @click=${() => p.baustelleOeffnen(b.entry)}><span class="vl-tab-name"><span><i class="farbpunkt" style="background:var(--s${(i % 6) + 1})"></i>${b.titel}</span><small>${k.zeit}</small></span>
          <b class=${bester !== null && k.vergleich.tag === bester ? 'gruen-t' : ''}>${f(k.vergleich.tag, 1)}</b><span>${f(k.vergleich.monat)}</span><span>${f(k.kwh)}</span><span>${f(k.eur)}</span><span>${k.laedt ? '–' : k.heiztage}</span><span>${k.container}</span></button>`; })}</div>
      <div class="glas-panel block"><div class="block-kopf"><b>Letzte 12 Monate</b><span class="leise">kWh je Monat, gestapelt nach Baustelle</span></div>
        <div class="chart-wrap">${laedt ? LAEDT : reihen.length ? unsafeHTML(flaeche('zwoelf', reihen, MONK.map(m => MONATE[+m.slice(5) - 1]), 'kWh', 2)) : html`<div class="leer">Noch keine Werte</div>`}</div></div>`;
}

/* Chronik: Protokoll der Baustelle nach Tagen mit Tagessumme (kWh je Tag aus der Integration), Filter und Suche.
   Das Suchfeld bleibt beim Neuzeichnen stehen (Lit) – Fokus und Cursor brauchen keine Rettung mehr */
function chronik(p) {
  const d = p.d, f = p.s.pfilter || 'alle', q = (p.s.vlSuche || '').toLowerCase().trim(), v = p.verlaufDaten(d), jeTag = (v && v.je_tag) || {};
  const ART = { warnung: ['⚠', 'var(--rot)'], ok: ['✓', '#30d158'], schalten: ['⏻', 'var(--amber)'], wetter: ['☁', 'var(--blau)'], nachricht: ['✉', 'var(--ink2)'], einstellung: ['⚙', 'var(--ink2)'] };
  const quelle = p.protokollQuelle(d);
  const passt = e => (f === 'alle' || e[2] === f || (f === 'warnung' && e[2] === 'ok') || (f === 'schalten' && e[2] === 'einstellung'))
    && (!q || `${e[3] ? p.bName(e[3]) : ''} ${e[4]}`.toLowerCase().includes(q));
  const tage = []; for (const e of quelle.filter(passt)) { const t = tage.at(-1); if (t && t.tag === e[0]) t.e.push(e); else tage.push({ tag: e[0], iso: e[5], e: [e] }); }
  const filter = k => { p.s.pfilter = k; p.s.pmehr = false; p.neuZeichnen(); };
  return html`<div class="glas-panel vl-filter"><input class="vl-suche" placeholder="Suchen (Container, Text) …" .value=${p.s.vlSuche || ''} @input=${e => { p.s.vlSuche = e.target.value; p.neuZeichnen(); }}>
        <div class="vb-wer">${[['alle', 'Alle'], ['warnung', '⚠ Warnungen'], ['schalten', '⏻ Schalten'], ['wetter', '☁ Wetter'], ['nachricht', '✉ Nachrichten']].map(([k, t]) => html`<button class=${f === k ? 'on' : ''} data-pf=${k} @click=${() => filter(k)}>${t}</button>`)}</div></div>
      ${tage.length ? tage.map(t => { const kwh = t.iso ? jeTag[t.iso] : null;
        return html`<div class="glas-panel vl-tag"><div class="vl-tag-kopf"><b>${t.tag}</b><span class="leise">${zahl(kwh) ? `${de(kwh, 1)} kWh · ${de(kwh * d.e.preis, 2)} € · ` : ''}${t.e.length} ${t.e.length === 1 ? 'Eintrag' : 'Einträge'}</span></div>
          ${t.e.map(e => { const [ic, farbe] = ART[e[2]] || ['•', 'var(--ink2)']; return html`<div class="vl-ereignis"><span class="zeit">${e[1]}</span><span class="vl-punkt" style="background:${farbe}">${ic}</span><div>${e[3] ? html`<b>${p.bName(e[3])}</b> ` : nothing}<span class="leise">${e[4]}</span></div></div>`; })}</div>`; })
        : html`<div class="glas-panel block"><div class="leer">${q || f !== 'alle' ? 'Nichts gefunden' : 'Noch keine Einträge'}</div></div>`}`;
}

export function verlaufVorlage(p) {
  const reiter = p.s.vlReiter || 'bs', art = p.s.vlArt || 'karten', prot = reiter === 'prot' && p.d;
  const setze = (k, v) => { p.s[k] = v; p.neuZeichnen(); };
  return html`${kopfVorlage('Verlauf', prot ? p.d.titel.toUpperCase() : 'BAUSTELLEN')}
      <div class="vl-reiter"><div class="seg glas-panel">${[['bs', 'Baustellen'], ['prot', 'Protokoll']].map(([k, t]) => html`<button class=${reiter === k ? 'on' : ''} data-vr=${k} ?disabled=${k === 'prot' && !p.d} @click=${() => setze('vlReiter', k)}>${t}</button>`)}</div>
        ${prot ? nothing : html`<div class="seg glas-panel klein">${[['karten', '▦ Karten'], ['tabelle', '☰ Vergleich']].map(([k, t]) => html`<button class=${art === k ? 'on' : ''} data-va=${k} @click=${() => setze('vlArt', k)}>${t}</button>`)}</div>`}</div>
      ${prot ? chronik(p) : art === 'tabelle' ? vergleich(p) : archiv(p)}`;
}

/* Abgeschlossene (oder laufende) Baustelle im Detail: Kennzahlen, Verbrauch je Monat, Protokoll-Auszug */
export function bsdetailVorlage(p) {
  const x = p.alle.find(y => y.entry === p.s.bs), zurueck = html`<button class="glas-panel chip" @click=${() => p.gehe('verlauf')}>‹ Verlauf</button>`;
  if (!x) return html`<div class="zurueck-zeile">${zurueck}</div><div class="glas-panel block"><div class="leer">Baustelle nicht gefunden</div></div>`;
  const k = p.kennz(x), m = k.monate && { labels: k.monate.labels, reihen: k.monate.reihen.map((r, i) => { const b = x.bereiche.find(y => y.id === r.bereich);   // Verbrauch je Monat und Container: Integration
    return { name: r.name, v: r.v, kwh: r.kwh, eur: r.eur, anteil: r.anteil, farbe: BEREICH_FARBEN[(b && zahl(b.f) ? b.f : i) % BEREICH_FARBEN.length] }; }) };
  const eintraege = p.bsProtokoll(x);
  const ART = { einstellung: '⚙', warnung: '⚠', ok: '✓', schalten: '⏻', wetter: '☁', nachricht: '✉' };
  return html`<div class="zurueck-zeile">${zurueck}<button class="glas-panel chip bs-csv" @click=${() => p.csv()}>⇩ CSV</button></div>
      ${kopfVorlage(x.titel, x.aktiv ? 'LAUFEND' : 'ABGESCHLOSSEN · NUR ANSEHEN')}
      <div class="leise vgl">${k.zeit}</div>
      <div class="glas-panel kennz vier"><div><b>${de(k.kwh, 0)}</b><span>kWh</span></div><div><b>${de(k.eur, 0)} €</b><span>Kosten</span></div><div><b>${k.laedt ? '–' : k.heiztage}</b><span>Heiztage</span></div><div><b>${zahl(k.gespart) ? `${de(k.gespart, 0)} €` : '–'}</b><span>gespart</span></div></div>
      <div class="glas-panel block"><div class="block-kopf"><b>Verbrauch je Monat</b><span class="leise">gestapelt nach Container</span></div>
        ${!m ? LAEDT : !m.reihen.length ? html`<div class="leer">Keine Container</div>` : html`<div class="chart-wrap">${unsafeHTML(flaeche('bs-' + x.entry, m.reihen, m.labels, 'kWh', 1))}</div>
        <div class="vb-je">${m.reihen.map(q => html`<div><i style="background:${q.farbe}"></i><span class="n">${q.name}</span><b>${de(q.kwh, 0)} kWh</b><span>${de(q.eur, 0)} €</span><span class="leise">${de(q.anteil, 0)} %</span></div>`)}</div>`}</div>
      <div class="glas-panel block"><div class="block-kopf"><b>Protokoll</b><span class="leise">Auszug</span></div>
        ${eintraege === null ? LAEDT : eintraege.length ? eintraege.map(e => { const l = p.lokal(e[0], x.z.zone); return html`<div class="zeile ereignis"><span class="zeit">${kurzDatum(l)}</span><span class="p-ic">${ART[e[1]] || '•'}</span><div><span>${e[2] ? `${(x.bereiche.find(b => b.id === e[2]) || { name: e[2] }).name}: ` : ''}${e[3]}</span></div></div>`; }) : html`<div class="leer">Keine Einträge</div>`}</div>
      ${x.aktiv ? nothing : html`<button class="knopf leise-k bs-aktiv" @click=${() => p.baustelleAktiv(x.entry)}>Wieder aktiv setzen</button>`}`;
}
