// Einstellungen › 🔌 Geräte (BSM-034.05, Mockup geraete.html Variante 1, abgenommen 10.10.2026): Reiter Übersicht und
// 📦 Inventar (das bisherige Inventar, inventar.js). Übersicht: eine Liste aller Schaltgeräte und Sensoren nach Container
// mit Erreichbar-Punkt, Zustand, Batterie, Signal, Status und Warnungen; Zähler und Filter. Ein Gerät öffnet den
// Gerätedialog (✎ Gerät, einblendungen-einrichtung.js), ein Sensor die Einblendung „Sensor“. Dazu die Sensor-Leiste im
// Container. Sensorliste, Batterie mit Stufe, Status und Warnungen kommen fertig von der Integration (bereiche[].sensoren,
// laufzeit.geraete, warnungen, geraete_links); die Seite zählt nur zur Anzeige.
import { html, nothing } from 'lit';
import { unsafeHTML } from 'lit/directives/unsafe-html.js';
import { de, zahl } from '../hilfen.js';
import { IC_POWER, sigHtml } from '../symbole.js';
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

/* ---------- Geräte im Container (AN-0018, Mockup container-unten.html, Variante B, Herbert 29.10.2026) ----------
   Kacheln je Geräteart: ♨ Heizen (breit, kW jetzt, Satz der Staffel von der Integration, Zeile je Heizkörper mit ⏻, ✋ Hand,
   wartet), 🌡 Fühler (Temperatur, Feuchte vom selben Gerät, gemessen vor …, Batterie, Signal), 🚪 Türen & Fenster (Zustand je
   Kontakt, Türen und Fenster ohne Kontakt aus dem Aussehen) und 🔌 Sonstiges. Status (aktiv/verliehen/defekt) nur als
   Etikett – geändert wird er im Gerätedialog (Zeile antippen), ein Sensor öffnet die Einblendung „Sensor“. Alle Zahlen,
   Zustände und Sätze kommen von der Integration bzw. aus HA; die Seite ordnet nur an. Am Handy volle Breite untereinander. */
const WAND = { front: 'Front', seite: 'Seite' };
const vorText = (p, iso) => { const m = iso ? p.minSeitAb(iso, p.d.z.jetztMs) : null;
  return m === null ? '' : m < 1 ? 'gerade eben' : m < 60 ? `vor ${m} min` : m < 48 * 60 ? `vor ${Math.round(m / 60)} h` : `vor ${Math.round(m / 1440)} Tagen`; };
const zustandHk = (b, g) => !g.aktiv ? 'Automatik lässt es aus' : b.offline || !g.erreichbar ? html`<span class="rot-t">nicht erreichbar</span>`
  : g.an ? `an · ${de(zahl(g.kwJetzt) ? g.kwJetzt : g.kw, 2)} kW` : 'aus';
const rolleHk = (b, g) => !b.stufen || !b.stufen.an || !g.heizer ? '' : b.stufen.zusatz.includes(g.id) ? ' · 🔥 Zusatz' : ' · ★ Primär';   // AN-0006, AN-0015
const etikett = g => ST_TEXT[g.status] ? html` <span class="g-st ${g.status}">${ST_TEXT[g.status]}</span>` : nothing;

function zeileHk(p, b, g) {
  const i = b.geraete.indexOf(g), an = g.an && g.aktiv, zusatz = b.stufen && b.stufen.an && b.stufen.zusatz.includes(g.id);
  const warte = zusatz && !g.an && g.aktiv ? html` <span class="leise">· ${b.stufen.zusatz_an ? b.stufen.text : 'wartet – einer reicht'}</span>` : nothing;
  const auf = () => p.geraetOeffnen(b.id, g.id);
  return html`<div class="gk-hk ${g.aktiv ? '' : 'inaktiv'} ${an ? 'an' : ''}" role="button" tabindex="0" data-id=${g.id} @click=${auf}
      @keydown=${ev => { if (ev.target === ev.currentTarget && (ev.key === 'Enter' || ev.key === ' ')) { ev.preventDefault(); auf(); } }}>
      <div class="gk-mitte"><b class="gk-name">${g.n}${etikett(g)}</b><div class="leise">${g.typ} · ${de(g.kw, 1)} kW${rolleHk(b, g)}</div>
        <div class="gk-hz ${an ? 'amber-t' : ''}">${zustandHk(b, g)}${warte}</div>
        ${g.hand && g.aktiv ? html`<div class="gk-hand">✋ von Hand · <button class="link" @click=${ev => { ev.stopPropagation(); p.geraetAutomatik(b, i); }}>Automatik übernehmen</button></div>` : nothing}
        ${g.warte && g.aktiv ? html`<div class="gk-hand">wartet – ${(p.d.anschluesse.find(a => a.id === b.anschluss) || {}).name || 'Anschluss'} ausgelastet</div>` : nothing}</div>
      <button class="c-power ${an ? 'an' : ''}" ?disabled=${!g.aktiv || b.offline || !g.erreichbar} aria-label="${g.n} ${g.an ? 'ausschalten' : 'einschalten'} (von Hand)"
        title="${g.an ? 'Ausschalten' : 'Einschalten'} (Handbetrieb)" @click=${ev => { ev.stopPropagation(); p.geraetSchalten(b, i); }}>${unsafeHTML(IC_POWER)}</button></div>`;
}

function fuehlerKachel(p, b, x) {
  const L = (p.d.r && p.d.r.geraete_links) || {}, st = p._hass && p._hass.states, z = st && st[x.eid];
  const f = (L[x.eid] || {}).feuchte, fz = f && st && st[f], feuchte = fz && zahl(fz.state) ? Number(fz.state) : null;
  const gemessen = z && !leer(z) ? vorText(p, z.last_reported || z.last_updated) : '';
  return html`<button class="glas-panel gk-k gk-k-fu" data-eid=${x.eid} @click=${() => oeffnen(p, x)}><div class="gk-k-t">🌡 ${x.name}</div>
      <div class="gk-k-gross ${x.weg ? 'rot-t' : ''}">${x.weg ? 'meldet nichts' : zahl(b.t) ? html`${de(b.t, 1)}<small> °C</small>` : x.zustand}</div>
      ${feuchte !== null ? html`<div class="gk-k-z">💧 ${de(feuchte, 0)} % Feuchte</div>` : nothing}
      <div class="gk-k-fuss">${batterie(x)}${x.weg ? nothing : signal(x.sig)}${gemessen ? html`<span class="leise">${gemessen}</span>` : nothing}</div>
      ${x.w.map(w => html`<div class="g-w ${w.stufe}">⚠ ${w.titel}</div>`)}</button>`;
}

function kontakteKachel(p, b, K) {
  const sym = b.symbol || {}, laut = (art, nr) => ((art === 'tuer' ? sym.tueren : sym.fenster) || [])[nr - 1] || null;
  const wo = (art, nr) => { const o = laut(art, nr); return `${art === 'tuer' ? 'Tür' : 'Fenster'} ${nr}${o && WAND[o.wand] ? ` · ${WAND[o.wand]}` : ''}`; };
  const zust = x => { const o = x.s.art === 'fenster' && laut('fenster', x.s.nr); return x.weg ? 'meldet nichts' : o && o.zustand && o.zustand !== 'zu' && x.zustand === 'offen' ? o.zustand : x.zustand; };
  const ohneT = (sym.tueren || []).map((o, i) => [o, i + 1]).filter(([o]) => !o.sensor_aktiv);   // welcher Kontakt wirkt, sagt die Integration (sensor_aktiv)
  const ohneF = (sym.fenster || []).map((o, i) => [o, i + 1]).filter(([o]) => !o.sensor);
  return html`<div class="glas-panel gk-k gk-k-ko"><div class="gk-k-t">🚪 Türen & Fenster</div>
      ${K.map(x => { const z = zust(x); return html`<button class="gk-ko" data-eid=${x.eid} @click=${() => oeffnen(p, x)}><span>${IC[x.s.art]} ${wo(x.s.art, x.s.nr)}</span>
        <span class="gk-kz ${z === 'zu' ? '' : x.weg ? 'rot' : 'amber'}">${z}</span><span class="gk-k-fuss">${batterie(x)}${x.weg ? nothing : signal(x.sig)}</span>
        ${x.w.map(w => html`<span class="g-w ${w.stufe}">⚠ ${w.titel}</span>`)}</button>`; })}
      ${ohneT.map(([o, nr]) => html`<button class="gk-ko warn nur-admin" @click=${p.nurAdmin(() => p.einblenden('bereich'))}><span>🚪 ${wo('tuer', nr)}</span><span class="amber-t">kein Kontakt</span>
        <span class="gk-k-fuss blau">Kontakt zuordnen ›</span></button>`)}
      ${ohneF.length ? html`<div class="leise gk-k-ohne">ohne Kontakt: ${ohneF.map(([, nr]) => `Fenster ${nr}`).join(', ')}</div>` : nothing}
      ${K.length || ohneT.length ? nothing : html`<div class="leise">Kein Kontakt eingetragen</div>`}</div>`;
}

export function geraeteKachelnVorlage(p, b) {
  const X = geraeteZeilen(p).filter(x => x.b === b), S = X.filter(x => x.art === 'sensor');
  const H = b.geraete.filter(g => g.heizer), A = b.geraete.filter(g => !g.heizer), F = S.filter(x => x.s.art === 'fuehler');
  const K = S.filter(x => x.s.art === 'tuer' || x.s.art === 'fenster'), Li = S.filter(x => x.s.art === 'licht'), weg = X.filter(x => x.weg).length;
  const sym = b.symbol || {}, kontakteDa = K.length || (sym.tueren || []).length || (sym.fenster || []).length;
  return html`<div class="gk-geraete"><div class="gk-titel"><b>Geräte</b><span class="leise">${X.length} Geräte · ${weg ? html`<span class="rot-t">${weg} nicht erreichbar</span>` : 'alle erreichbar'}</span>
      <button class="link blau" @click=${() => p.einstGruppe('geraete')}>Alle Geräte ›</button></div>
    <div class="gk-kacheln">
      ${H.length ? html`<div class="glas-panel gk-k gk-k-heiz"><div class="gk-k-t">♨ Heizen</div><div class="gk-k-gross">${de(b.kw || 0, 2)}<small> kW jetzt</small></div>
        ${b.stufen && b.stufen.an && b.stufen.text ? html`<div class="leise gk-k-satz">${b.stufen.text}</div>` : nothing}${H.map(g => zeileHk(p, b, g))}</div>` : nothing}
      ${F.map(x => fuehlerKachel(p, b, x))}
      ${kontakteDa ? kontakteKachel(p, b, K) : nothing}
      ${A.length || Li.length ? html`<div class="glas-panel gk-k gk-k-so"><div class="gk-k-t">🔌 Sonstiges</div>${A.map(g => zeileHk(p, b, g))}
        ${Li.map(x => html`<button class="gk-ko" data-eid=${x.eid} @click=${() => oeffnen(p, x)}><span>💡 ${x.name}</span><span class="gk-kz ${x.zustand === 'an' ? 'amber' : ''}">${x.zustand}</span></button>`)}</div>` : nothing}
      ${b.geraete.length || S.length ? nothing : html`<div class="glas-panel gk-k leise">Noch kein Gerät</div>`}
    </div>
    <div class="leise gk-fuss">Zeile antippen: Zustand, Warnungen, Status (aktiv/verliehen/defekt) und Einstellungen · ⏻ schaltet von Hand, bis „Automatik übernehmen“.</div></div>`;
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
.g-liste > .zeile, .g-liste > .gruppe { padding-left: 16px; padding-right: 16px; } a.zeile { text-decoration: none; color: inherit; }
/* AN-0018: Geräte-Kacheln im Container (Variante B) */
.gk-geraete { margin-top: 8px; } .gk-titel { display: flex; align-items: baseline; gap: 8px; margin: 2px 4px 8px; } .gk-titel > .leise { flex: 1; }
.gk-titel .link { border: 0; background: none; font: inherit; font-size: 13px; cursor: pointer; padding: 0; white-space: nowrap; }
.gk-kacheln { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 10px; }
.gk-k { padding: 12px 14px; border-radius: 18px; display: flex; flex-direction: column; gap: 6px; text-align: left; font: inherit; color: inherit; min-width: 0; }
button.gk-k { cursor: pointer; } .gk-k-heiz, .gk-k-so { grid-column: span 2; }
.gk-k-t { font-size: 11px; letter-spacing: 1px; text-transform: uppercase; color: var(--ink2); }
.gk-k-gross { font-size: 28px; font-weight: 600; line-height: 1.1; } .gk-k-gross small { font-size: 13px; font-weight: 400; color: var(--ink2); }
.gk-k-satz { margin-top: -2px; font-size: 12px; } .gk-k-z { font-size: 13px; }
.gk-k-fuss { display: flex; gap: 8px; align-items: center; font-size: 12px; flex-wrap: wrap; }
.gk-hk { display: flex; align-items: center; gap: 10px; padding: 8px 0 2px; border-top: 1px solid rgba(127,127,127,.15); cursor: pointer; }
.gk-hk.inaktiv { opacity: .55; } .gk-mitte { flex: 1; min-width: 0; } .gk-name { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 14px; }
.gk-hz { font-size: 13px; } .gk-hand { font-size: 12px; color: var(--amber); }
.gk-hand .link { border: 0; background: none; padding: 0; font: inherit; color: var(--blau); cursor: pointer; }
.gk-ko { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 2px 8px; align-items: center; border: 0; border-top: 1px solid rgba(127,127,127,.15); background: none;
  font: inherit; color: inherit; text-align: left; padding: 7px 0 2px; cursor: pointer; font-size: 13px; }
.gk-ko > span:first-child { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; } .gk-ko .gk-k-fuss, .gk-ko .g-w { grid-column: 1 / -1; }
.gk-kz { font-size: 13px; font-weight: 600; padding: 1px 8px; border-radius: 8px; background: rgba(127,127,127,.18); }
.gk-kz.amber { background: color-mix(in srgb, var(--amber) 25%, transparent); color: var(--amber); } .gk-kz.rot { color: var(--rot); }
.gk-k-ohne { font-size: 12px; } .gk-fuss { padding: 8px 4px 0; font-size: 12px; }
@container (max-width: 640px) { .gk-kacheln { grid-template-columns: minmax(0, 1fr); } .gk-k-heiz, .gk-k-so { grid-column: auto; } .gk-k-gross { font-size: 24px; } }`;
