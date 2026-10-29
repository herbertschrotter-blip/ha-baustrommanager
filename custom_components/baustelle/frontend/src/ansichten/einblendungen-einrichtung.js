// Dialoge für Container und Geräte mit Lit (BSM-022 Stufe 3e): Firma, Anschluss, Neuer Container, Container bearbeiten
// (mit Größe, „Warm ab“ und Geräteliste), Aussehen (BSM-032), Gerät bearbeiten. Entwürfe in s.form bzw. s.edit, getrennt
// von den Serverdaten; gespeichert wird über die Seite (Options-/Unterdialoge der Integration, baustelle/liste, setzen).
import { html, nothing } from 'lit';
import { geraeteZeilen, inventarVorlage, jetztVorlage } from './geraete.js';
import { live } from 'lit/directives/live.js';
import { unsafeHTML } from 'lit/directives/unsafe-html.js';
import { de, zahl } from '../hilfen.js';
import { BEREICH_FARBEN, SYMBOL_STANDARD, bcContainer } from '../symbole.js';
import { schalterVorlage } from './allgemein.js';
import { optionenVorlage } from './einblendungen-baustelle.js';

const GRIFF = html`<div class="griff"></div>`;
const knopf = (t, fn, art = '') => html`<button class="knopf ${art}" @click=${fn}>${t}</button>`;
/* Textfeld eines Entwurfs: Wert als Attribut und Eigenschaft (live); data-f nur als Test-Merkmal */
const text = (ziel, k, ph, nach, extra = {}) => html`<input type=${extra.typ || nothing} step=${extra.step || nothing} min=${extra.min ?? nothing} value=${ziel[k] ?? ''} .value=${live(String(ziel[k] ?? ''))} placeholder=${ph || nothing} ?disabled=${!!extra.aus} data-f=${extra.marke || k} data-i=${extra.i ?? nothing} @input=${e => { ziel[k] = e.target.value; if (nach) nach(); }}>`;
const auswahl = (ziel, k, inhalt, nach, marke, i) => { const setze = e => { ziel[k] = e.target.value; if (nach) nach(); };
  return html`<select data-f=${marke || k} data-i=${i ?? nothing} @input=${setze} @change=${setze}>${inhalt}</select>`; };

/* Firma: Name, Container zuordnen, neue Container gleich mit anlegen; die eigene Firma zeigt nur ihre Container */
function firma(p, s) {
  const d = p.d, f = s.form, neu = !f.id, eigen = !neu && p.firma(f.id).eigen, z = () => p.neuZeichnen();
  const frei = d.bereiche.filter(b => (b.firma || 'eigen') === 'eigen' || (!neu && b.firma === f.id));   // wählbar: ohne fremde Firma, dazu die eigenen
  const um = id => { f.container = f.container.includes(id) ? f.container.filter(x => x !== id) : [...f.container, id]; z(); };
  return html`${GRIFF}<h3>${neu ? 'Neue Firma' : 'Firma'}</h3>
        <label class="feld">Name${text(f, 'name', 'z. B. Trockenbau Maier', null, { aus: eigen })}</label>
        ${eigen ? html`<div class="gruppe-t">Container der eigenen Firma</div>
          ${d.bereiche.filter(b => (b.firma || 'eigen') === 'eigen').map(b => html`<div class="zeile"><span>${b.name}</span></div>`)}
          <div class="leise">Hierher gehören alle Container, die keiner anderen Firma zugeordnet sind.</div>`
        : html`<div class="gruppe-t">Container zuordnen</div>
          ${frei.length ? frei.map(b => html`<div class="zeile" data-id=${b.id}><span>${b.name}</span>${schalterVorlage(f.container.includes(b.id), () => um(b.id))}</div>`)
            : html`<div class="leise">Alle Container sind schon anderen Firmen zugeordnet.</div>`}
          ${f.neu.map((c, i) => html`<div class="zeile fc-neu">${text(c, 'name', 'Name des Containers', null, { marke: 'fnc', i })}
            <div class="seg klein">${['Container', 'Schacht'].map(a => html`<button data-v=${a} class=${c.art === a ? 'on' : ''} @click=${() => { c.art = a; z(); }}>${a}</button>`)}</div>
            <button class="x nur-admin" title="nicht anlegen" @click=${p.nurAdmin(() => { f.neu.splice(i, 1); z(); })}>✕</button></div>`)}
          <button class="zeile" @click=${() => { f.neu.push({ name: '', art: 'Container' }); z(); }}><span class="blau">+ Neuer Container für diese Firma</span></button>
          <div class="leise">Nur Container ohne andere Firma sind wählbar. Nimmst du einen weg, gehört er wieder der eigenen Firma. Frühere Werte bleiben bei der bisherigen Firma.</div>`}
        ${eigen ? knopf('Schließen', () => p.schliessen(), 'leise-k') : html`${knopf('Speichern', p.nurAdmin(() => p.firmaSpeichern()), 'amber nur-admin')}${neu ? nothing : knopf('Firma löschen', p.nurAdmin(() => p.firmaWeg()), 'rot nur-admin')}${knopf('Abbrechen', () => p.schliessen(), 'leise-k')}`}`;
}

/* Stromanschluss: Absicherung, Art, Reserve, Container am Anschluss */
function anschluss(p, s) {
  const d = p.d, f = s.form, neu = !f.id, z = () => p.neuZeichnen();
  const um = id => { f.container = f.container.includes(id) ? f.container.filter(x => x !== id) : [...f.container, id]; z(); };
  return html`${GRIFF}<h3>${neu ? 'Neuer Anschluss' : 'Anschluss'}</h3>
        <label class="feld">Name${text(f, 'name', 'z. B. Verteiler West')}</label>
        <div class="zeile"><span>Absicherung</span><div class="seg klein">${[16, 32, 63].map(v => html`<button data-v=${v} class=${f.ampere === v ? 'on' : ''} @click=${() => { f.ampere = v; z(); }}>${v} A</button>`)}</div></div>
        <div class="zeile"><span>Art</span><div class="seg klein">${[3, 1].map(v => html`<button data-v=${v} class=${f.phasen === v ? 'on' : ''} @click=${() => { f.phasen = v; z(); }}>${v === 3 ? 'Starkstrom (CEE)' : 'Schuko 230 V'}</button>`)}</div></div>
        <div class="zeile"><div><span>Reserve</span><div class="leise">für Ungemessenes wie Kran oder Werkzeug</div></div><span class="stepper"><button data-d="-1" @click=${() => { f.reserve = Math.max(0, f.reserve - 1); z(); }}>−</button><b>${de(f.reserve)} kW</b><button data-d="1" @click=${() => { f.reserve = Math.max(0, f.reserve + 1); z(); }}>+</button></span></div>
        <div class="leise">Anschlussleistung ${de(f.ampere * .23 * f.phasen)} kW, davon rechnet die Staffelung mit ${d.e.nutzbar} % = ${de(f.ampere * .23 * f.phasen * d.e.nutzbar / 100)} kW, abzüglich ${de(f.reserve)} kW Reserve.</div>
        <div class="gruppe-t">Container an diesem Anschluss</div>
        ${d.bereiche.map(b => html`<div class="zeile" data-id=${b.id}><span>${b.name} <span class="leise">${f.container.includes(b.id) ? '' : '· ' + p.anschluss(b.anschluss).name}</span></span>${schalterVorlage(f.container.includes(b.id), () => um(b.id))}</div>`)}
        <div class="leise">Ein Container hängt an genau einem Anschluss.</div>
        ${knopf('Speichern', p.nurAdmin(() => p.anschlussSpeichern()), 'amber nur-admin')}${!neu && d.anschluesse.length > 1 ? knopf('Anschluss löschen', p.nurAdmin(() => p.anschlussWeg()), 'rot nur-admin') : nothing}${knopf('Abbrechen', () => p.schliessen(), 'leise-k')}`;
}

/* Neuer Container oder Pumpenschacht, optional gleich mit Fühler und Shelly (WU-0008: Heizungsart erst mit Shelly) */
function containerNeu(p, s) {
  const f = s.form, schacht = f.art === 'Pumpenschacht', z = () => p.neuZeichnen();
  const fuehler = p.entitaeten(x => (x.entity_id.startsWith('sensor.') && x.attributes.device_class === 'temperature') || x.entity_id.startsWith('climate.'));
  return html`${GRIFF}<h3>Neuer Container</h3>
      <label class="feld">Name${text(f, 'name', 'z. B. Lager Nord')}</label>
      <div class="feld">Art<div class="seg klein">${['Container', 'Pumpenschacht'].map(v => html`<button data-v=${v} class=${f.art === v ? 'on' : ''} @click=${() => { f.art = v; f.typ = v === 'Pumpenschacht' ? 'Pumpe' : 'Ölradiator'; z(); }}>${v}</button>`)}</div></div>
      <label class="feld">Temperaturfühler${auswahl(f, 'fuehler', optionenVorlage(fuehler, f.fuehler, '– keiner –'))}</label>
      <label class="feld">Shelly${auswahl(f, 'schalter', optionenVorlage(p.freieSchalter().map(([v, n]) => [v, `${n} (${v})`]), f.schalter, '– später –'), z)}</label>
      ${f.schalter ? html`<label class="feld">${schacht ? 'Welches Gerät hängt an diesem Shelly?' : 'Welche Heizung hängt an diesem Shelly?'}${auswahl(f, 'typ', optionenVorlage((schacht ? ['Pumpe'] : ['Ölradiator', 'Konvektor']).map(t => [t, t]), f.typ))}</label>`
        : html`<div class="leise">Ohne Shelly wird nur der ${schacht ? 'Schacht' : 'Container'} angelegt – ${schacht ? 'Pumpen' : 'Heizungen'} kommen später unter „Bearbeiten“ dazu.</div>`}
      ${knopf('Anlegen', p.nurAdmin(() => p.containerAnlegen()), 'amber nur-admin')}${knopf('Abbrechen', () => p.schliessen(), 'leise-k')}`;
}

/* AN-0014: Größe – Einzel, Doppel oder m² frei; Werte und Schätzung von der Integration */
function groesse(p, b, e) {
  const G = b.groesse, T = G.typen, art = e.groesseArt, typ = k => `${k === 'einzel' ? 'Einzel' : 'Doppel'}container innen ${de(T[k].laenge, 2)} × ${de(T[k].breite, 2)} m ≈ ${de(T[k].m2, 1)} m² · ${de(G.hoehe, 2)} m hoch ≈ ${de(T[k].m3, 0)} m³`;
  const w = b.lern && b.lern.warm, gleich = art === G.art && (art !== 'frei' || Number(e.m2) === G.m2);
  const setze = k => { e.groesseArt = k; if (k === 'frei' && !zahl(e.m2)) e.m2 = G.m2; p.neuZeichnen(); };
  return html`<div class="zeile"><div><b>Größe</b><div class="leise">für Vergleiche (kWh je m²) und als Startwert der lernenden Regelung</div></div>
      <div class="seg klein">${[['einzel', 'Einzel'], ['doppel', 'Doppel'], ['frei', 'm²']].map(([k, t]) => html`<button data-v=${k} class=${art === k ? 'on' : ''} @click=${() => setze(k)}>${t}</button>`)}</div></div>
      ${art === 'frei' ? html`<label class="zeile unter"><span>Fläche innen</span><span class="eingabe">${text(e, 'm2', null, null, { typ: 'number', step: '0.5', min: '4', marke: 'bm2' })} m²</span></label>
        <div class="leise" style="padding:0 0 6px 12px">Höhe ${de(G.hoehe, 2)} m${gleich ? ` ≈ ${de(G.m3, 0)} m³` : ''}</div>` : html`<div class="leise" style="padding:0 0 6px 12px">${typ(art)}</div>`}
      ${w && w.geschaetzt && gleich ? html`<div class="leise" style="padding:0 0 6px 12px">🧠 Noch nichts gelernt: Aufheizen geschätzt aus der Größe – ${de(w.geschaetzt, 1)} °C/h</div>` : nothing}`;
}

/* Container bearbeiten: Name, Zusatz-Heizkörper, Bei Bedarf, Warm ab, Größe, Aussehen, Fühler, Tür, Anschluss, Firma, Geräte */
function bereich(p, s) {
  const d = p.d, b = p.b; if (!b) { p.s.sheet = null; return nothing; }
  const e = p.bereichEntwurf(b, s), z = () => p.neuZeichnen();
  const typen = b.pumpe ? ['Pumpe'] : ['Ölradiator', 'Konvektor', 'Bautrockner', 'Steckdose'];
  const tueren = p.entitaeten(x => x.entity_id.startsWith('binary_sensor.') && ['door', 'window', 'opening', 'garage_door'].includes(x.attributes.device_class));
  const fuehler = p.entitaeten(x => (x.entity_id.startsWith('sensor.') && x.attributes.device_class === 'temperature') || x.entity_id.startsWith('climate.'));
  if (e.fuehler && !fuehler.some(x => x[0] === e.fuehler)) fuehler.unshift([e.fuehler, p.name(e.fuehler)]);
  if (e.tuer && !tueren.some(x => x[0] === e.tuer)) tueren.unshift([e.tuer, p.name(e.tuer)]);
  const warm = () => { const w = { vor: e.warmVor ?? d.e.warm_vor, nach: e.warmNach ?? d.e.warm_nach, vor_eigen: e.warmVor !== null, nach_eigen: e.warmNach !== null };   // AN-0004
    const sw = (k, v, eigen, f) => html`<span class="stepper klein" data-w=${k}><button data-d="-5" @click=${p.nurAdmin(() => p.warmEigen(e, k, -5))}>−</button><b class=${eigen ? 'eigen' : ''}>${f(v)}</b><button data-d="5" @click=${p.nurAdmin(() => p.warmEigen(e, k, 5))}>+</button></span>`;
    return html`<div class="gruppe-t" data-zeile="warm">🧠 Warm ab</div><div class="zeile"><div><span>Soll erreicht</span><div class="leise">${w.vor_eigen ? 'eigener Wert' : 'wie die Baustelle'}</div></div>${sw('vor', w.vor, w.vor_eigen, v => v ? `${v} min vorher` : 'bei Beginn')}</div>
            <div class="zeile"><div><span>Warm halten</span><div class="leise">${w.nach_eigen ? 'eigener Wert' : 'wie die Baustelle'}</div></div>${sw('nach', w.nach, w.nach_eigen, v => v ? `${v} min länger` : 'bis Ende')}</div>
            ${w.vor_eigen || w.nach_eigen ? html`<button class="zeile" @click=${p.nurAdmin(() => p.warmZurueck(e))}><span class="blau">Wie die Baustelle</span></button>` : nothing}`; };
  // AN-0015 (Mockup primaer.html A): genau ein Primärheizkörper je Container, die anderen sind Zusatz
  const primaerWahl = () => { const H = b.geraete.filter(g => g.heizer && g.aktiv !== false);
    const erster = H.find(g => b.stufen && (b.stufen.auto || []).includes(g.id)) || H[0];   // „automatisch“ von der Integration
    const wahl = H.some(g => g.id === e.primaer) ? e.primaer : '', haupt = H.find(g => g.id === wahl) || erster;
    return html`<label class="feld ${e.stufen ? '' : 'gedimmt'}" data-zeile="primaer">★ Primärheizkörper
        <select @change=${ev => { e.primaer = ev.target.value; z(); }}>
          <option value="" ?selected=${!wahl}>automatisch · ${erster ? erster.n : '–'}</option>
          ${H.map(g => html`<option value=${g.id} ?selected=${wahl === g.id}>${g.n} · ${g.typ}</option>`)}</select>
        <span class="leise">${e.stufen ? `Zusatz: ${H.filter(g => g !== haupt).map(g => g.n).join(', ') || '–'}` : 'Alle heizen gemeinsam – Primär zählt erst mit „Zusatz nur bei Bedarf“'}</span></label>`; };
  const geraet = (g, i) => g.weg ? html`<div class="ge-zeile weg" data-i=${i}><span>${g.n} wird entfernt</span><button class="chip glas-panel" @click=${() => { g.weg = false; z(); }}>rückgängig</button></div>`
    : html`<div class="ge-zeile" data-i=${i}><div class="ge-felder">
            ${g.neu ? auswahl(g, 'schalter', optionenVorlage(p.freieSchalter().map(([v, n]) => [v, `${n} (${v})`]), g.schalter, '– Shelly wählen –'), null, null, i) : html`<span class="leise ge-shelly">${p.name(g.schalter)} · ${g.schalter}</span>`}
            <div class="ge-zwei">${text(g, 'n', 'Name', null, { i })}${auswahl(g, 'typ', typen.map(t => html`<option ?selected=${g.typ === t}>${t}</option>`), null, null, i)}</div></div>
            ${g.neu ? nothing : html`<button class="bs-ic nur-admin" title="Gerät bearbeiten" aria-label="${g.n} bearbeiten" @click=${p.nurAdmin(() => p.geraetBearbeiten(b, i))}>✎</button>`}<button class="x nur-admin" title="Gerät entfernen" @click=${p.nurAdmin(() => { if (g.neu) e.geraete.splice(i, 1); else g.weg = true; z(); })}>✕</button></div>`;
  return html`${GRIFF}<div class="block-kopf"><h3>Bearbeiten</h3><span class="leise">${b.pumpe ? 'Pumpenschacht' : 'Container'}</span></div>
        <label class="feld">Name${text(e, 'name')}</label>
        ${!b.pumpe && b.geraete.filter(g => g.heizer).length >= 2 ? html`<div class="zeile" data-zeile="stufen"><div><b>🔥 Zusatz-Heizkörper nur bei Bedarf</b><div class="leise">zuerst heizt der Primärheizkörper; der Zusatz kommt bei Kälte, weit unter dem Soll oder wenn einer es nicht schafft.</div></div>${schalterVorlage(e.stufen, () => { e.stufen = !e.stufen; z(); })}</div>
        ${primaerWahl()}` : nothing}
        ${b.pumpe ? nothing : html`<div class="zeile" data-zeile="bedarf"><div><b>Nur bei Bedarf heizen</b><div class="leise">z. B. Besprechungscontainer: heizt nur per Schalter oder Termin, sonst Frostschutz</div></div>${schalterVorlage(e.bedarf, () => { e.bedarf = !e.bedarf; z(); })}</div>`}
        ${b.pumpe || !b.fuehler || !b.lern ? nothing : html`<div class="zeile" data-zeile="lernen"><div><b>🧠 Lernende Regelung</b><div class="leise">${['thermo', 'bedarf'].includes(b.modus) ? 'lernt, wie schnell der Raum warm wird und wie viel er nachwärmt, und heizt so früh, dass das Soll rechtzeitig da ist' : 'wirkt nur im Modus Thermostat oder Bei Bedarf'}${b.lern.an ? html` · <button class="link blau" @click=${() => p.unterDialog({ art: 'lernen' })}>Lernstand ›</button>` : nothing}</div></div>${schalterVorlage(e.lernen, () => { e.lernen = !e.lernen; z(); })}</div>`}
        ${b.pumpe ? nothing : html`<div class="zeile" data-zeile="trocknen"><div><b>👕 Kleidung trocknen nach Regen</b><div class="leise">nach Regen länger nach der Arbeit und früher am Morgen heizen (Werte unter Heizung › Regeln)</div></div>${schalterVorlage(e.trocknen, () => { e.trocknen = !e.trocknen; z(); })}</div>`}
        ${b.lern && b.lern.warm ? warm() : nothing}
        ${b.pumpe || !b.groesse ? nothing : groesse(p, b, e)}
        ${b.pumpe ? nothing : html`<div class="glas-panel liste"><button class="zeile sym-zeile" @click=${() => p.aussehenAuf(b)}><span class="sym-mini">${unsafeHTML(bcContainer(BEREICH_FARBEN[b.f % BEREICH_FARBEN.length], 'aus', b))}</span><div><b class="blau">🏠 Aussehen</b><div class="leise">${b.symbol && b.symbol.doppel ? 'Doppel' : 'Einzel'} · ${b.symbol ? b.symbol.tueren.length : 1} ${b.symbol && b.symbol.tueren.length === 2 ? 'Türen' : 'Tür'} · ${b.symbol ? b.symbol.fenster.length : 1} Fenster · Farbe, Sensoren</div></div><span class="chev">›</span></button></div>`}
        ${b.pumpe ? nothing : html`<label class="feld">Temperaturfühler${auswahl(e, 'fuehler', optionenVorlage(fuehler, e.fuehler, '– keiner –'))}</label>`}
        ${b.pumpe ? nothing : html`<label class="feld">Türkontakt${auswahl(e, 'tuer', optionenVorlage(tueren, e.tuer, 'keiner'))}</label>`}
        <label class="feld">Stromanschluss${auswahl(e, 'anschluss', d.anschluesse.map(a => html`<option value=${a.id} ?selected=${e.anschluss === a.id}>${a.name} · ${a.phasen === 3 ? '3 × ' : ''}${a.ampere} A</option>`), z)}</label>
        <label class="feld">Firma · für die Abrechnung${auswahl(e, 'firma', d.firmen.map(f => html`<option value=${f.id} ?selected=${e.firma === f.id}>${f.name}</option>`))}</label>
        <div class="gruppe-t">${b.pumpe ? 'Pumpen' : 'Geräte'} · ${e.geraete.filter(g => !g.weg).length}</div>
        ${e.geraete.map(geraet)}
        <button class="zeile" @click=${() => { e.geraete.push({ neu: true, schalter: '', n: '', typ: b.pumpe ? 'Pumpe' : 'Ölradiator' }); z(); }}><span class="blau">+ Gerät hinzufügen</span></button>
        <div class="leise">Der Heizkörpertyp gilt nur für den Vergleich Ölradiator/Konvektor. Entfernte Geräte behalten ihre Werte im Verlauf.</div>
        ${knopf('Speichern', p.nurAdmin(() => p.bereichSpeichern()), 'amber nur-admin')}${knopf('Container entfernen', p.nurAdmin(() => p.bereichWeg()), 'rot nur-admin')}${knopf('Abbrechen', () => p.schliessen(), 'leise-k')}`;
}

/* BSM-032: Container-Symbol – Aussehen bearbeiten; die Integration prüft und liefert den Zustand aus den Sensoren */
function aussehen(p, s) {
  const b = p.d.bereiche.find(x => x.id === s.id); if (!b) return html`${GRIFF}<div class="leer">Container nicht gefunden</div>${knopf('Schließen', () => p.schliessen())}`;
  const c = p.symKonfig(b), ist = b.symbol || SYMBOL_STANDARD, std = BEREICH_FARBEN[b.f % BEREICH_FARBEN.length], aendern = x => p.symAendern(b, x);
  const vorschau = { ...c, licht_an: ist.licht_an, tueren: c.tueren.map((t, i) => ({ ...t, offen: !!(ist.tueren[i] && ist.tueren[i].offen) })),
    fenster: c.fenster.map((f, i) => ({ ...f, zustand: (ist.fenster[i] && ist.fenster[i].zustand) || 'zu' })) };
  const kontakte = p.entitaeten(x => x.entity_id.startsWith('binary_sensor.') && ['door', 'window', 'opening', 'garage_door'].includes(x.attributes.device_class));
  const lichter = p.entitaeten(x => /^(light|switch)\./.test(x.entity_id) || (x.entity_id.startsWith('binary_sensor.') && x.attributes.device_class === 'light') || (x.entity_id.startsWith('sensor.') && x.attributes.device_class === 'illuminance'));
  const seg = (fn, wert, opts) => html`<div class="seg klein">${opts.map(([v, t]) => html`<button data-v=${v} class=${String(wert) === String(v) ? 'on' : ''} @click=${() => fn(v)}>${t}</button>`)}</div>`;
  const wahl = (wert, fn, marke) => html`<select data-f=${marke || nothing} @change=${e => fn(e.target.value)}>${wert}</select>`;
  const element = (art, x, i, n) => html`<div class="zeile"><b>${art === 'tueren' ? '🚪 Tür' : '🪟 Fenster'} ${i + 1}</b>${n > 1 ? html`<button class="knopf klein" aria-label="entfernen" @click=${() => aendern(k => { if (k[art].length > 1) k[art].splice(i, 1); })}>✕</button>` : nothing}</div>
      <div class="zeile unter"><span>Wand</span>${seg(v => aendern(k => { k[art][i].wand = v; }), x.wand, [['front', 'Front'], ['seite', 'Seite']])}</div>
      <div class="zeile unter" data-z="lage" data-art=${art} data-i=${i}><span>${art === 'tueren' ? 'Sitzt' : 'Lage'}</span>${art === 'tueren' ? seg(v => aendern(k => { k[art][i].pos = +v; }), x.pos < .4 ? .15 : x.pos > .6 ? .85 : .5, [[.15, 'links'], [.5, 'Mitte'], [.85, 'rechts']]) : seg(v => aendern(k => { k[art][i].pos = +v; }), x.pos, [[.15, 'links'], [.33, '◧'], [.5, 'Mitte'], [.67, '◨'], [.85, 'rechts']])}</div>
      <label class="zeile unter"><span>${art === 'tueren' ? 'Türsensor' : 'Fenstersensor'}</span>${wahl(optionenVorlage(kontakte, x.sensor || '', art === 'tueren' && i === 0 ? 'wie Türkontakt des Containers' : 'keiner'), v => aendern(k => { k[art][i].sensor = v || null; }))}</label>`;
  const neu = art => aendern(k => { if (k[art].length < (art === 'tueren' ? 2 : 4)) { const frei = [.15, .33, .5, .67, .85].find(v => !k[art].some(y => y.wand === 'front' && y.pos === v)) ?? .5; k[art].push({ wand: 'front', pos: frei, sensor: null }); } });
  const farbe = (fb, an, fn, label) => html`<button data-v=${fb} class="sym-farbe ${an ? 'on' : ''}" style="background:${fb}" aria-label="${label} ${fb}" @click=${fn}></button>`;
  return html`${GRIFF}<div class="block-kopf"><h3>🏠 Aussehen · ${b.name}</h3></div><div class="sym-vorschau">${unsafeHTML(bcContainer(std, b.z === 'pause' || b.z === 'bereit' ? 'aus' : b.z, { symbol: vorschau }))}</div>
      <div class="glas-panel liste"><div class="zeile"><div><b>Doppelcontainer</b><div class="leise">zwei Container nebeneinander – das Symbol wird tiefer</div></div>${schalterVorlage(c.doppel, () => aendern(k => { k.doppel = !k.doppel; }))}</div>
        <div class="zeile"><span>Farbe</span><span class="sym-farben">${['#3987e5', '#eb6834', '#1baf7a', '#c98500', '#d55181', '#199e70', '#7e57c2', '#78909c'].map(fb => farbe(fb, (c.farbe || std) === fb, () => aendern(k => { k.farbe = fb; }), 'Farbe'))}<input type="color" value=${c.farbe || std} .value=${live(c.farbe || std)} aria-label="eigene Farbe" @change=${e => aendern(k => { k.farbe = e.target.value; })}></span></div>
        <div class="zeile"><div><span>Rahmen</span><div class="leise">Stahlrahmen an Ecken, oben und unten (20 cm)</div></div><span class="sym-farben"><button data-v="" class="knopf klein ${c.rahmen ? '' : 'on'}" @click=${() => aendern(k => { k.rahmen = null; })}>kein</button>${['#c62828', '#37474f', '#eceff1', '#1565c0', '#f9a825', '#2e7d32'].map(fb => farbe(fb, c.rahmen === fb, () => aendern(k => { k.rahmen = fb; }), 'Rahmen'))}<input type="color" value=${c.rahmen || '#37474f'} .value=${live(c.rahmen || '#37474f')} aria-label="eigene Rahmenfarbe" @change=${e => aendern(k => { k.rahmen = e.target.value; })}></span></div></div>
      <div class="glas-panel liste"><div class="gruppe">Türen · ${c.tueren.length} von 2</div>${c.tueren.map((x, i) => element('tueren', x, i, c.tueren.length))}${c.tueren.length < 2 ? html`<button class="zeile" data-art="tueren" @click=${() => neu('tueren')}><span class="blau">+ Tür</span></button>` : nothing}</div>
      <div class="glas-panel liste"><div class="gruppe">Fenster · ${c.fenster.length} von 4</div>${c.fenster.map((x, i) => element('fenster', x, i, c.fenster.length))}${c.fenster.length < 4 ? html`<button class="zeile" data-art="fenster" @click=${() => neu('fenster')}><span class="blau">+ Fenster</span></button>` : nothing}</div>
      <div class="glas-panel liste"><div class="gruppe">Licht im Symbol</div><label class="zeile"><div><span>Licht kommt von</span><div class="leise">Fenster leuchten, wenn im Container Licht brennt</div></div>${wahl(optionenVorlage(lichter, c.licht || '', 'keins'), v => aendern(k => { k.licht = v || null; }), 'licht')}</label></div>
      <div class="leise p-fuss">Türen sitzen links, mittig oder rechts an ihrer Wand; mehrere Fenster verteilen sich gleichmäßig auf den Platz daneben. Tür offen/zu, Fenster offen/gekippt/zu und Licht kommen von den zugeordneten Sensoren; ohne Sensor bleibt das Element zu bzw. dunkel.</div>
      ${b.symbol && b.symbol.eigen && !s.std ? html`<button class="knopf" @click=${() => p.symStandard()}>Standard (eine Tür, ein Fenster)</button>` : nothing}
      ${knopf('Speichern', p.nurAdmin(() => p.symSpeichern(b)), 'amber nur-admin')}${knopf('Abbrechen', () => p.schliessen(), 'leise-k')}`;
}

/* WU-0004: Gerät bearbeiten – Name, Shelly, Typ, Container, Leistungs-/Energiesensor (leer = automatisch), aktiv */
function geraetEdit(p, s) {
  const d = p.d, b = p.b, g = b && b.geraete[s.i]; if (!g) { p.s.sheet = null; return nothing; }
  const x = geraeteZeilen(p).find(y => y.art === 'schalt' && y.id === g.id);   // BSM-034.05: Jetzt, Warnungen, Inventar wie in › Geräte
  const f = s.form, typen = b.pumpe ? ['Pumpe'] : ['Ölradiator', 'Konvektor', 'Bautrockner', 'Steckdose'];   // wie im Bearbeiten-Dialog
  const leistung = p.entitaeten(x => x.entity_id.startsWith('sensor.') && x.attributes.device_class === 'power');
  const energie = p.entitaeten(x => x.entity_id.startsWith('sensor.') && x.attributes.device_class === 'energy');
  const auto = (eid, eigen) => `automatisch${!eigen && eid ? ` · ${p.name(eid) || eid}` : ''}`;
  return html`${GRIFF}<div class="block-kopf"><h3>Gerät bearbeiten</h3><span class="leise">${b.name}</span></div>
        ${x ? jetztVorlage(p, x) : nothing}
        <div class="gruppe-t">Einstellungen</div>
        <label class="feld">Name${text(f, 'n')}</label>
        <label class="feld">Shelly (Schalter)${auswahl(f, 'schalter', optionenVorlage(p.freieSchalter(g.schalter).map(([v, n]) => [v, `${n} (${v})`]), f.schalter))}</label>
        <div class="raster-2"><label class="feld">Typ${auswahl(f, 'typ', typen.map(t => html`<option ?selected=${f.typ === t}>${t}</option>`))}</label>
          <label class="feld">${b.pumpe ? 'Pumpenschacht' : 'Container'}${auswahl(f, 'bereich', optionenVorlage(d.bereiche.filter(x => !!x.pumpe === !!b.pumpe).map(x => [x.id, x.name]), f.bereich))}</label></div>
        <label class="feld">Leistungssensor${auswahl(f, 'leistung', optionenVorlage(leistung, f.leistung, auto(g.leistung, g.leistungEigen)))}</label>
        <label class="feld">Energiesensor${auswahl(f, 'energie', optionenVorlage(energie, f.energie, auto(g.energie, g.energieEigen)))}</label>
        <div class="zeile" data-zeile="status"><div><b>Status</b><div class="leise">nur „aktiv“ schaltet die Automatik, zählt in der Staffelung und meldet Warnungen; gilt auch im Inventar</div></div>
          <div class="seg klein">${[['aktiv', 'aktiv'], ['inaktiv', 'inaktiv'], ['verliehen', 'verliehen'], ['defekt', 'defekt']].map(([v, t]) => html`<button data-v=${v} class=${f.status === v ? 'on' : ''} @click=${() => { f.status = v; p.neuZeichnen(); }}>${t}</button>`)}</div></div>
        ${g.heizer || !g.leistung ? html`<div class="zeile" data-zeile="nenn"><div>${g.heizer   // 28.10.2026: Typenschild für jeden Heizkörper (P_ref der Prognose), auch mit Leistungssensor
          ? html`<b>Nennleistung (Typenschild)</b><div class="leise">Referenz für die Prognose; zählt in der Staffelung, wenn keine Messung da ist${f.nennKw === null ? ' · nicht eingetragen' : ''}</div>`
          : html`<b>Leistung ohne Messung</b><div class="leise">zählt so in der Staffelung, wenn das Gerät an ist${f.nennKw === null ? ' · Standard' : ''}</div>`}</div><span class="stepper klein"><button data-d="-0.1" @click=${() => p.geraetNennKw(f, g, -0.1)}>−</button><b class=${f.nennKw !== null ? 'eigen' : ''}>${de(f.nennKw ?? g.kw, 1)} kW</b><button data-d="0.1" @click=${() => p.geraetNennKw(f, g, 0.1)}>+</button></span></div>` : nothing}
        ${g.heizer && b.stufen ? html`<div class="zeile" data-zeile="rolle"><div><b>Rolle im Container: ${b.stufen.haupt.includes(g.id) ? '★ Primär' : '🔥 Zusatz'}</b><div class="leise">${!b.stufenAn ? 'alle heizen gemeinsam' : b.stufen.haupt.includes(g.id) ? 'heizt zuerst' : `heizt dazu, wenn ${(b.geraete.find(x => b.stufen.haupt.includes(x.id)) || {}).n || 'der Primäre'} nicht reicht`} · festgelegt im Container unter „Bearbeiten“</div></div></div>` : nothing}
        <div class="leise">Neuer Shelly: die Werte des alten bleiben im Verlauf. Anderer Container: der Verbrauch zählt ab jetzt dort.</div>
        ${x ? inventarVorlage(p, x) : nothing}
        ${knopf('Speichern', p.nurAdmin(() => p.geraetSpeichern()), 'amber nur-admin')}${knopf('Abbrechen', () => p.schliessen(), 'leise-k')}`;
}

/** Dialoge für Container und Geräte (Art → Vorlage) */
export const EINRICHTUNG_EINBLENDUNGEN = { firma, anschluss, 'container-neu': containerNeu, bereich, aussehen, 'geraet-edit': geraetEdit };
