// Dialoge für Container und Geräte mit Lit (BSM-022 Stufe 3e): Firma, Anschluss, Aussehen (BSM-032), Gerät bearbeiten; „Bearbeiten“
// eines Containers ist die Container-Seite (container-seite.js, UI-Bericht M8). Entwürfe in s.form, getrennt
// von den Serverdaten; gespeichert wird über die Seite (Options-/Unterdialoge der Integration, baustelle/liste, setzen).
import { html, nothing } from 'lit';
import { geraeteZeilen, inventarVorlage, jetztVorlage } from './geraete.js';
import { containerSeite } from './container-seite.js';
import { live } from 'lit/directives/live.js';
import { unsafeHTML } from 'lit/directives/unsafe-html.js';
import { de } from '../hilfen.js';
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
        <div class="leise">Neuer Shelly: die Werte des alten bleiben im Verlauf. Anderer Container: der Verbrauch zählt ab jetzt dort. Entfernt: die Werte bleiben im Verlauf, das Inventar zieht mit.</div>
        ${x ? inventarVorlage(p, x) : nothing}
        ${knopf('Speichern', p.nurAdmin(() => p.geraetSpeichern()), 'amber nur-admin')}
        ${s.wegFrage ? knopf(`${g.n} wirklich entfernen`, p.nurAdmin(() => p.geraetEntfernen(b, g)), 'rot nur-admin') : knopf('Gerät entfernen …', p.nurAdmin(() => { s.wegFrage = true; p.neuZeichnen(); }), 'rot nur-admin')}${knopf('Abbrechen', () => p.schliessen(), 'leise-k')}`;
}

/** Dialoge für Container und Geräte (Art → Vorlage) */
export const EINRICHTUNG_EINBLENDUNGEN = { firma, anschluss, bereich: containerSeite, aussehen, 'geraet-edit': geraetEdit };   // „Bearbeiten“ = Container-Seite (container-seite.js, M8)   // „+ Container“: assistent.js (M12)
