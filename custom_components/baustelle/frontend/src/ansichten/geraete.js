// Einstellungen › 🔌 Geräte (BSM-034.05, Mockup geraete.html Variante 1, abgenommen 10.10.2026): Reiter Übersicht und
// 📦 Inventar (das bisherige Inventar, inventar.js). Übersicht: eine Liste aller Schaltgeräte und Sensoren nach Container
// mit Erreichbar-Punkt, Zustand, Batterie, Signal, Status und Warnungen; Zähler und Filter. Ein Gerät öffnet den
// Gerätedialog (✎ Gerät, einblendungen-einrichtung.js), ein Sensor die Einblendung „Sensor“. Dazu die Sensor-Leiste im
// Container. Sensorliste, Batterie mit Stufe, Status und Warnungen kommen fertig von der Integration (bereiche[].sensoren,
// laufzeit.geraete, warnungen, geraete_links); die Seite zählt nur zur Anzeige.
import { html, nothing } from 'lit';
import { unsafeHTML } from 'lit/directives/unsafe-html.js';
import { de, zahl } from '../hilfen.js';
import { sigHtml } from '../symbole.js';
import { invGruppeVorlage } from './inventar.js';

const GRIFF = html`<div class="griff"></div>`;
const IC = { heizung: '♨', trockner: '💨', pumpe: '💧', steckdose: '🔌', fuehler: '🌡', tuer: '🚪', fenster: '🪟', licht: '💡' };
const ST_TEXT = { inaktiv: 'inaktiv', verliehen: 'verliehen', defekt: 'defekt' };
const FILTER = [['alle', 'Alle'], ['schalt', 'Schaltgeräte'], ['sensor', 'Sensoren'], ['probleme', 'Probleme']];
const leer = s => !s || s.state === 'unavailable' || s.state === 'unknown';

/* Eine Zeile je Schaltgerät und Sensor (Anzeige; Zustände von der Integration bzw. aus HA) */
export function geraeteZeilen(p) {
  const d = p.d, L = (d.r && d.r.geraete_links) || {}, st = eid => eid && p._hass && p._hass.states[eid];
  const zahlVon = eid => { const s = st(eid); return s && zahl(s.state) ? Number(s.state) : null; };
  const aus = [];
  for (const b of d.bereiche) {
    for (const g of b.geraete) {
      const l = L[g.schalter] || {};
      aus.push({ art: 'schalt', id: g.id, b, g, ic: IC[g.rolle] || (g.heizer ? '♨' : '🔌'), name: g.n, unter: g.typ, eid: g.schalter, np: g.np,
        zustand: !g.erreichbar ? 'nicht erreichbar' : g.an ? `an · ${de(zahl(g.kwJetzt) ? g.kwJetzt : g.kw, 2)} kW` : 'aus',
        weg: !g.erreichbar, status: g.status || 'aktiv', bat: null, batStufe: null, sig: zahlVon(l.signal), w: d.warnungen.filter(w => w.g === g.id) });
    }
    for (const s of b.sensoren || []) {
      const l = L[s.entity_id] || {}, z = st(s.entity_id), e = (z && z.attributes && z.attributes.unit_of_measurement) || '';
      aus.push({ art: 'sensor', id: s.entity_id, b, s, ic: IC[s.art] || '•', name: s.name, unter: p.name(s.entity_id) || s.entity_id, eid: s.entity_id,
        zustand: leer(z) ? 'meldet nichts' : s.art === 'tuer' || s.art === 'fenster' ? (z.state === 'on' ? 'offen' : 'zu')
          : s.art === 'licht' && (z.state === 'on' || z.state === 'off') ? (z.state === 'on' ? 'an' : 'aus') : zahl(z.state) ? `${de(+z.state)} ${e}`.trim() : z.state,
        weg: leer(z), status: 'aktiv', bat: zahl(s.batterie) ? Number(s.batterie) : null, batStufe: s.batterie_stufe || null, sig: zahlVon(l.signal),
        w: d.warnungen.filter(w => w.key && w.key.endsWith(':' + s.entity_id)) });
    }
  }
  return aus;
}
const zaehlen = X => ({ n: X.length, weg: X.filter(x => x.weg).length, warn: X.filter(x => x.w.length).length,
  bat: X.filter(x => x.w.some(w => /Batterie/.test(w.titel))).length, nicht: X.filter(x => x.status !== 'aktiv').length });
/* Batterie mit der Stufe der Integration (struktur …sensoren[].batterie_stufe: kritisch rot, schwach gelb) */
const batterie = x => x.bat === null ? nothing : html`<span class=${x.batStufe === 'kritisch' ? 'rot-t' : x.batStufe === 'schwach' ? 'amber-t' : 'leise'} title="Batterie">🔋 ${de(x.bat, 0)} %</span>`;
const signal = db => db === null ? nothing : unsafeHTML(sigHtml(db));

/* Zeile antippen: Gerät → Gerätedialog, Sensor → Einblendung „Sensor“ */
const oeffnen = (p, x) => x.art === 'schalt' ? p.geraetOeffnen(x.b.id, x.id) : p.sensorOeffnen(x.b.id, x.eid);

function zeile(p, x) {
  return html`<button class="zeile ger g-zeile" data-id=${x.id} @click=${() => oeffnen(p, x)}>
      <span class="ger-ic">${x.ic}<i class="ger-punkt ${x.weg ? 'weg' : 'da'}" title=${x.weg ? 'nicht erreichbar' : 'erreichbar'}></i></span>
      <div><b>${x.name}${ST_TEXT[x.status] ? html` <span class="g-st ${x.status}">${ST_TEXT[x.status]}</span>` : nothing}</b>
        <div class="leise">${x.unter}${x.np ? ' · 🛟 Notprogramm' : ''}</div>${x.w.map(w => html`<div class="g-w ${w.stufe}">⚠ ${w.titel}</div>`)}</div>
      <span class="ger-z ${x.weg ? 'rot-t' : ''}">${x.zustand}<span class="g-z2">${batterie(x)}${x.weg ? nothing : signal(x.sig)}</span></span><span class="chev">›</span></button>`;
}

function uebersicht(p) {
  const X = geraeteZeilen(p), Z = zaehlen(X), f = p.s.gerFilter || 'alle';
  const F = X.filter(x => f === 'alle' || (f === 'probleme' ? x.weg || x.w.length || x.status !== 'aktiv' : x.art === f));
  const nachC = p.d.bereiche.map(b => [b, F.filter(x => x.b === b)]).filter(([, l]) => l.length);
  return html`<div class="g-zahlen"><span class="chip glas-panel">${Z.n} Geräte</span>
      <span class="chip glas-panel ${Z.weg ? 'rot-t' : ''}">● ${Z.n - Z.weg} erreichbar${Z.weg ? ` · ${Z.weg} nicht` : ''}</span>
      ${Z.warn ? html`<span class="chip glas-panel amber-t">⚠ ${Z.warn} mit Warnung</span>` : nothing}
      ${Z.bat ? html`<span class="chip glas-panel rot-t">🔋 ${Z.bat} Batterie schwach</span>` : nothing}
      ${Z.nicht ? html`<span class="chip glas-panel">${Z.nicht} nicht aktiv</span>` : nothing}</div>
    <div class="seg glas-panel g-filter">${FILTER.map(([k, t]) => html`<button data-v=${k} class=${f === k ? 'on' : ''} @click=${() => { p.s.gerFilter = k; p.neuZeichnen(); }}>${t}</button>`)}</div>
    ${nachC.map(([b, l]) => html`<div class="glas-panel liste"><div class="gruppe g-gruppe"><span>${b.pumpe ? '💧' : '🏠'} ${b.name}</span>
        <button class="link blau" @click=${() => p.containerOeffnen(b.id)}>${l.length} · Container ›</button></div>${l.map(x => zeile(p, x))}</div>`)}
    ${nachC.length ? nothing : html`<div class="glas-panel liste"><div class="leer">Keine Geräte in diesem Filter</div></div>`}
    <div class="leise p-fuss">Ein Gerät antippen: Zustand, Warnungen, Status, Einstellungen und Inventar an einer Stelle.</div>`;
}

/* Gruppe der Einstellungen (ersetzt › Geräte und › 📦 Inventar) */
export function geraeteGruppeVorlage(p) {
  const X = geraeteZeilen(p), Z = zaehlen(X), inv = invGruppeVorlage(p), r = p.s.gerReiter || 'uebersicht';
  const reiter = html`<div class="seg glas-panel g-reiter">${[['uebersicht', 'Übersicht'], ['inventar', '📦 Inventar']].map(([k, t]) =>
    html`<button data-v=${k} class=${r === k ? 'on' : ''} @click=${() => { p.s.gerReiter = k; p.neuZeichnen(); }}>${t}</button>`)}</div>`;
  return { k: 'geraete', ic: '🔌', t: 'Geräte', kurz: r === 'inventar' ? inv.kurz : `${Z.n} Geräte · ${Z.weg ? `${Z.weg} nicht erreichbar` : 'alle erreichbar'}${Z.warn ? ` · ${Z.warn} mit Warnung` : ''}`,
    inhalt: () => html`${reiter}${r === 'inventar' ? inv.inhalt() : uebersicht(p)}` };
}

/* Sensor-Leiste im Container: jeder Fühler, jede Tür, jedes Fenster, Licht mit Zustand, Batterie, Signal */
export function sensorLeisteVorlage(p, b) {
  const X = geraeteZeilen(p).filter(x => x.b === b && x.art === 'sensor');
  return X.length ? html`<div class="glas-panel g-sensoren">${X.map(x => html`<button class="chip g-sensor ${x.weg ? 'weg' : ''} ${x.w.length ? 'warn' : ''}" data-eid=${x.eid}
      @click=${() => oeffnen(p, x)}>${x.ic} ${x.name} · ${x.zustand} ${batterie(x)}${x.weg ? nothing : signal(x.sig)}</button>`)}</div>` : nothing;
}

/* Abschnitte des Gerätedialogs: Jetzt, Warnungen, Inventar (für ✎ Gerät und „Sensor“) */
export function jetztVorlage(p, x) {
  const zl = (k, v) => html`<div class="zeile"><span>${k}</span><span class="leise g-wert">${v}</span></div>`;
  const l = ((p.d.r && p.d.r.geraete_links) || {})[x.eid] || {}, href = l.web || l.ha;   // WU-0010: Website des Geräts, sonst HA-Geräteseite
  return html`<div class="glas-panel liste g-liste"><div class="gruppe">Jetzt</div>
      ${zl('Zustand', html`<span class=${x.weg ? 'rot-t' : ''}>${x.zustand}</span>`)}
      ${zl('Erreichbar', html`<i class="ger-punkt-i ${x.weg ? 'weg' : 'da'}"></i> ${x.weg ? 'nein' : 'ja'}`)}
      ${x.weg || x.sig === null ? nothing : zl('Signal', html`${signal(x.sig)} ${de(x.sig, 0)} dBm`)}
      ${x.bat !== null ? zl('Batterie', batterie(x)) : nothing}
      ${href ? html`<a class="zeile" href=${href} target="_blank" rel="noopener"><span>${l.geraet || 'Gerät'}${l.modell ? html` <span class="leise">· ${l.modell}</span>` : nothing}</span><span class="blau">${l.web ? 'Website' : 'in Home Assistant'} ↗</span></a>` : nothing}
      ${x.np ? zl('Notprogramm', `🛟 ${{ bereit: 'bereit', not: 'im Notbetrieb', fehler: 'Fehler', aus: 'aus', offen: 'noch nicht geprüft' }[x.np.zustand] || x.np.zustand || '–'}`) : nothing}</div>
    ${x.w.length ? html`<div class="glas-panel liste g-liste"><div class="gruppe">Warnungen · ${x.w.length}</div>${x.w.map(w => html`<div class="zeile g-wz"><div><b class=${w.stufe === 'stoerung' ? 'rot-t' : 'amber-t'}>⚠ ${w.titel}</b>${w.hilfe ? html`<div class="leise">${w.hilfe}</div>` : nothing}</div>
      <button class="chip glas-panel" @click=${() => p.warnungStumm(w.id)}>${w.stumm ? 'stumm' : 'bis morgen stumm'}</button></div>`)}</div>` : nothing}`;
}
export function inventarVorlage(p, x) {
  const I = p.invDaten(), z = I && I.container.flatMap(c => c.ausruestung.map(a => ({ c, a }))).find(({ a }) => x.art === 'schalt' && a.geraet_id === x.id);
  const zl = (k, v) => html`<div class="zeile"><span>${k}</span><span class="leise">${v}</span></div>`;
  return html`<div class="glas-panel liste g-liste"><div class="gruppe">Inventar</div>
    ${I === undefined ? html`<div class="leer">lädt …</div>` : !I ? html`<div class="leer">Datenbank nicht erreichbar</div>`
      : z ? html`${zl('Name', html`<b class="inv-id">${z.a.name || z.a.typ_label}</b>`)}${zl('Container', z.c.name)}${z.a.modell ? zl('Modell', z.a.modell) : nothing}${z.a.nicht_in_ha ? html`<div class="zeile amber-t">nicht in HA</div>` : nothing}
        <button class="zeile" @click=${() => p.invAuf({ art: 'inv-container', id: z.c.id, zurueck: p.s.sheet })}><span class="blau">Container im Inventar ›</span></button>`
      : html`<div class="zeile"><span class="leise">${x.art === 'schalt' ? 'noch nicht im Inventar – trägt der Abgleich nach, sobald der Container im Inventar ist' : 'im Inventar über den Container'}</span></div>`}</div>`;
}

/* Einblendung „Sensor“: Jetzt, Warnungen, wo er eingestellt ist (Fühler/Türkontakt in Bearbeiten, sonst Aussehen) */
function sensor(p, s) {
  const x = geraeteZeilen(p).find(y => y.art === 'sensor' && y.eid === s.eid && y.b.id === s.bid);
  if (!x) { p.s.sheet = null; return nothing; }
  const wo = x.s.art === 'fuehler' || (x.s.art === 'tuer' && x.b.tuer && x.b.tuer.eid === x.eid) ? 'bearbeiten' : 'aussehen';
  return html`${GRIFF}<div class="block-kopf"><h3>${x.ic} ${x.name}</h3><span class="leise">${x.b.name}</span></div>
    ${jetztVorlage(p, x)}
    <div class="glas-panel liste g-liste"><div class="gruppe">Einstellungen</div>
      <div class="zeile"><span>Sensor</span><span class="leise">${x.unter}</span></div>
      <div class="zeile"><div class="leise">${x.s.art === 'fuehler' ? 'Fühler: regelt das Soll und schreibt die Temperatur mit.' : x.s.art === 'licht' ? 'Licht: nur im Symbol.' : 'Offen oder gekippt pausiert die Heizung (Tür-Pause).'}</div></div>
      <button class="zeile nur-admin" data-k="sensor-aendern" @click=${p.nurAdmin(() => { p.s.cid = x.b.id; return wo === 'bearbeiten' ? p.einblenden('bereich') : p.aussehenAuf(x.b); })}>
        <span class="blau">${wo === 'bearbeiten' ? (x.s.art === 'fuehler' ? 'Fühler ändern' : 'Türkontakt ändern') + ' (Bearbeiten)' : 'Ändern im Aussehen'} ›</span></button></div>
    ${inventarVorlage(p, x)}
    <button class="knopf leise-k" @click=${() => p.schliessen()}>Schließen</button>`;
}
export const GERAETE_EINBLENDUNGEN = { sensor };

export const GERAETE_CSS = `
.g-zahlen { display: flex; flex-wrap: wrap; gap: 6px; margin: 0 0 10px; } .g-zahlen .chip { font-size: 12px; padding: 5px 10px; }
.g-filter, .g-reiter { margin: 0 0 10px; }
.g-gruppe { display: flex; justify-content: space-between; align-items: center; gap: 8px; } .g-gruppe .link { font-size: 11px; letter-spacing: 1px; text-transform: uppercase; }
.zeile.ger.g-zeile { width: 100%; text-align: left; }
.g-w { font-size: 12px; margin-top: 2px; } .g-w.stoerung { color: var(--rot); } .g-w.hinweis { color: var(--amber); }
.g-z2 { display: flex; gap: 6px; align-items: center; justify-content: flex-end; font-size: 11px; }
.ger-z { font-size: 12.5px; text-align: right; white-space: nowrap; display: flex; flex-direction: column; align-items: flex-end; gap: 2px; }
.g-st { font-size: 11px; font-weight: 500; padding: 1px 6px; border-radius: 8px; background: rgba(120,120,128,.2); } .g-st.defekt { color: var(--rot); } .g-st.verliehen { color: var(--blau); }
.ger-punkt-i { display: inline-block; width: 9px; height: 9px; border-radius: 50%; } .ger-punkt-i.da { background: #30d158; } .ger-punkt-i.weg { background: var(--rot); }
.g-wert { display: inline-flex; gap: 6px; align-items: center; } .g-wz { align-items: flex-start; gap: 8px; } .g-wz .chip { font-size: 11px; white-space: nowrap; }
.g-sensoren { display: flex; flex-wrap: wrap; gap: 6px; padding: 8px 10px; border-radius: 18px; } .g-sensor { font-size: 12px; display: inline-flex; gap: 5px; align-items: center; }
.g-liste > .zeile, .g-liste > .gruppe { padding-left: 16px; padding-right: 16px; } a.zeile { text-decoration: none; color: inherit; }
.g-sensor.weg { opacity: .6; } .g-sensor.warn { border-color: var(--amber); }`;
