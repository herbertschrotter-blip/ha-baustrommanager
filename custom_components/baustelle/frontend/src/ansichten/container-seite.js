// Container-Seite (UI-Bericht M8, Mockup mockups/container-seite.html, abgenommen von Herbert am 24.11.2026): „Bearbeiten“ ist die
// eine Seite eines Containers – Kopf mit Inventar-Name und Namen-Chip, Geräte mit „+ Gerät hinzufügen“, Reiter Heizung ·
// Fühler & Kontakte · Strom · Aussehen · Namen in HA. Jede Änderung gilt sofort (Herbert, 24.11.2026; statt Entwurf mit
// „Speichern“). Herkunft und Text jeder Einstellung („von der Baustelle“ / „abweichend · Baustelle X ↺“) liefert die
// Integration (laufzeit.container.<id>.einst, logik/herkunft.py); die Seite zeigt sie nur an.
import { html, nothing } from 'lit';
import { live } from 'lit/directives/live.js';
import { unsafeHTML } from 'lit/directives/unsafe-html.js';
import { de } from '../hilfen.js';
import { BEREICH_FARBEN, bcContainer } from '../symbole.js';
import { MODI, MODUS_TEXT } from '../tabellen.js';
import { schalterVorlage } from './allgemein.js';
import { eiSpringen } from './container.js';
import { namenChip, zustand } from './inventar.js';

const GRIFF = html`<div class="griff"></div>`;
const knopf = (t, fn, art = '') => html`<button class="knopf ${art}" @click=${fn}>${t}</button>`;
const seg = (opts, wert, fn, aus = () => false) => html`<div class="seg klein">${opts.map(([v, t]) => html`<button data-v=${v} class=${v === wert ? 'on' : ''} ?disabled=${aus(v)} @click=${() => fn(v)}>${t}</button>`)}</div>`;
const vz = x => x > 0 ? '+' : '−';
const TABS = [['heizung', '🔥 Heizung'], ['fuehler', '🌡 Fühler & Kontakte'], ['strom', '⚡ Strom'], ['aussehen', '🏠 Aussehen'], ['namen', '🏷 Namen in HA']];
const KONTAKT = s => s.entity_id.startsWith('binary_sensor.') && ['door', 'window', 'opening', 'garage_door'].includes(s.attributes.device_class);
const FUEHLER = s => (s.entity_id.startsWith('sensor.') && s.attributes.device_class === 'temperature') || s.entity_id.startsWith('climate.');
const LICHT = s => /^(light|switch)\./.test(s.entity_id) || (s.entity_id.startsWith('binary_sensor.') && s.attributes.device_class === 'light') || (s.entity_id.startsWith('sensor.') && s.attributes.device_class === 'illuminance');

/* Herkunft einer Einstellung: grau „von der Baustelle“ (mit „ändern ›“) oder amber „abweichend · Baustelle X ↺“ */
function marke(p, e, zurueck) {
  if (!e) return nothing;
  if (e.herkunft === 'abweichend') return html`<span class="cs-abw">abweichend · Baustelle ${e.baustelle}<button class="cs-zur nur-admin" title="zurück auf den Wert der Baustelle" aria-label="zurück auf den Wert der Baustelle" @click=${p.nurAdmin(zurueck)}>↺</button></span>`;
  return html`<span class="cs-erb" title="gilt für alle Container">von der Baustelle</span>${e.ziel ? html`<button class="cs-link" @click=${() => eiSpringen(p, e.ziel)}>ändern ›</button>` : nothing}`;
}
const zeile = (k, titel, sub, rechts, e = null, mk = nothing, extra = nothing) => html`<div class="zeile cs-zeile ${e ? `cs-z-${e.herkunft}` : ''}" data-zeile=${k}>
    <div class="cs-zl"><b>${titel}</b>${sub ? html`<div class="leise">${sub}</div>` : nothing}${mk !== nothing ? html`<div class="cs-mk">${mk}</div>` : nothing}
      ${e && e.ruht ? html`<div class="cs-ruht">${e.ruht}</div>` : nothing}${extra}</div>
    <div class="cs-zr">${rechts}</div></div>`;
const stepper = (k, t, eigen, fn, d) => html`<span class="stepper klein" data-w=${k}><button data-d=${-d} @click=${fn(-d)}>−</button><b class=${eigen ? 'eigen' : ''}>${t}</b><button data-d=${d} @click=${fn(d)}>+</button></span>`;

/* ---------- Reiter Heizung: Soll dauerhaft / nur heute, Modus, Lernen, Warm ab, Regeln der Baustelle, Heizkörper ---------- */
function sollBlock(p, b, E) {
  const e = E.soll, S = b.sollJ || {}, v = Number(S.versch) || 0, gl = p.d.e.soll_art === 'gleitend';
  return html`<div class="glas-panel cs-soll">
      ${zeile('soll', 'Soll · dauerhaft', `eigenes Soll dieses Containers, gilt jeden Arbeitstag${b.fuehler ? '' : ' – wirkt nur mit Temperaturfühler'}`,
        stepper('soll', e ? e.text : '–', e && e.herkunft === 'abweichend', dd => p.nurAdmin(() => p.csSoll(b, dd)), 0.5), e,
        html`${marke(p, e, () => p.csSetzen(b, 'soll', null, 'Soll wie die Baustelle'))}`, e && e.hinweis ? html`<div class="leise">${e.hinweis}</div>` : nothing)}
      ${!p.sollAktiv(b) && !v ? zeile('soll-heute', 'Nur heute', `wirkt nur mit Temperaturfühler im Modus Thermostat oder Bei Bedarf – wie − / + am Rad`, nothing)
        : zeile('soll-heute', 'Nur heute', v ? `heute ${vz(v)}${de(Math.abs(v), 1)} °C – gilt bis morgen früh, dann wieder ${gl ? 'gleitend' : 'dauerhaft'}` : 'verschiebt das Soll bis morgen früh – wie − / + am Rad des Containers',
        html`${v ? html`<button class="cs-zur" title="heute wieder wie dauerhaft" aria-label="nur heute zurücknehmen" @click=${() => p.sollZurueck(b)}>↺</button>` : nothing}<span class="stepper klein" data-w="heute"><button data-d="-0.5" @click=${() => p.sollSchritt(b, -0.5)}>−</button><b class=${v ? 'eigen' : ''}>${v ? `${vz(v)}${de(Math.abs(v), 1)}°` : '±0'}</b><button data-d="0.5" @click=${() => p.sollSchritt(b, 0.5)}>+</button></span>`)}
      <div class="leise cs-fuss">Am Rad des Containers gilt − / + nur heute; dauerhaft änderst du das Soll hier (Heizung › Je Container zeigt es als Schnellliste).</div></div>`;
}

function tabHeizung(p, s, b, E) {
  const H = b.geraete.filter(g => g.heizer && g.aktiv !== false), G = b.groesse, gArt = G && (s.m2Frei && G.art !== 'frei' ? 'frei' : G.art);
  const erster = H.find(g => b.stufen && (b.stufen.auto || []).includes(g.id)) || H[0];   // „automatisch“ von der Integration (AN-0015)
  const primaer = H.some(g => g.id === b.primaer) ? b.primaer : '';
  const warm = b.lern && b.lern.warm;
  const groesse = G ? html`${seg([['einzel', 'Einzel'], ['doppel', 'Doppel'], ['frei', 'm²']], gArt, p.nurAdmin(v => { s.m2Frei = v === 'frei'; return v === 'frei' ? p.neuZeichnen() : p.csGroesse(b, v); }))}
      ${gArt === 'frei' ? html`<span class="eingabe"><input type="number" step="0.5" min="4" data-f="bm2" value=${G.m2} .value=${live(String(G.m2))} @change=${p.nurAdmin(ev => p.csGroesse(b, 'frei', ev.target.value))}> m²</span>` : nothing}` : nothing;
  return html`${sollBlock(p, b, E)}
    <div class="glas-panel liste cs-gr">
      ${zeile('modus', 'Modus', MODUS_TEXT[b.modus] || '', seg(MODI, b.modus, p.nurAdmin(v => p.modusSetzen(b, v)), v => v === 'thermo' && !b.fuehler))}
      ${b.fuehler && b.lern ? zeile('lernen', '🧠 Lernende Regelung', html`${['thermo', 'bedarf'].includes(b.modus) ? 'heizt so früh, dass das Soll rechtzeitig da ist' : 'wirkt nur im Modus Thermostat oder Bei Bedarf'}${b.lern.an ? html` · <button class="cs-link" @click=${() => p.unterDialog({ art: 'lernen' })}>Lernstand ›</button>` : nothing}`,
        schalterVorlage(!!b.lern.an, () => p.lernenUmschalten(b))) : nothing}
      ${warm ? html`<div class="gruppe" data-zeile="warm">🧠 Warm ab · nur mit lernender Regelung</div>
        ${['warm_vor', 'warm_nach'].map(k => zeile(k, k === 'warm_vor' ? 'Soll erreicht' : 'Warm halten', k === 'warm_vor' ? 'wann der Raum vor Arbeitsbeginn warm ist' : 'wie lange er nach Arbeitsende warm bleibt',
          stepper(k, E[k] ? E[k].text : '–', E[k] && E[k].herkunft === 'abweichend', dd => p.nurAdmin(() => p.csWarm(b, k, dd)), 5), E[k], marke(p, E[k], () => p.csSetzen(b, k, null, 'Wie die Baustelle'))))}` : nothing}
      <div class="gruppe">Regeln der Baustelle, die hier gelten</div>
      ${zeile('vorheizen', 'Vorheizen', null, html`<span class="cs-wert">${E.vorheizen ? E.vorheizen.text : '–'}</span>`, E.vorheizen, marke(p, E.vorheizen))}
      ${zeile('frost', '❄ Frostschutz', 'auch nachts, frei und bei Automatik aus', html`<span class="cs-wert">${E.frost ? E.frost.text : '–'}</span>`, E.frost, marke(p, E.frost))}
      <div class="gruppe">Heizkörper</div>
      ${H.length >= 2 ? html`${zeile('stufen', '🔥 Zusatz-Heizkörper nur bei Bedarf', b.stufenAn ? `★ Primär: ${(H.find(g => g.id === primaer) || erster || {}).n || '–'}${primaer ? '' : ' (automatisch)'} · Zusatz: ${H.filter(g => g !== (H.find(x => x.id === primaer) || erster)).map(g => g.n).join(', ') || '–'}` : 'alle heizen gemeinsam; an: zuerst der Primärheizkörper, der Zusatz bei Kälte, weit unter dem Soll oder wenn einer es nicht schafft',
          schalterVorlage(b.stufenAn, () => p.csSetzen(b, 'stufen', !b.stufenAn)))}
        ${b.stufenAn ? html`<label class="feld cs-feld" data-zeile="primaer">★ Primärheizkörper
          <select data-f="primaer" @change=${p.nurAdmin(ev => p.csSetzen(b, 'primaer', ev.target.value || null))}>
            <option value="" ?selected=${!primaer}>automatisch · ${erster ? erster.n : '–'}</option>
            ${H.map(g => html`<option value=${g.id} ?selected=${primaer === g.id}>${g.n} · ${g.typ}</option>`)}</select></label>` : nothing}` : nothing}
      ${zeile('trocknen', '👕 Kleidung trocknen nach Regen', E.trocknen ? `Werte der Baustelle: ${E.trocknen.text}` : null, schalterVorlage(b.trocknen, () => p.trocknenUmschalten(b)), null, E.trocknen ? marke(p, E.trocknen) : nothing)}
      ${G ? zeile('groesse', 'Größe', `${gArt === 'doppel' ? 'Doppelcontainer' : gArt === 'frei' ? 'eigene Fläche' : 'Einzelcontainer'} ≈ ${de(G.m2, 1)} m² · ${de(G.hoehe, 2)} m hoch – für kWh je m² und als Startwert der lernenden Regelung`, groesse) : nothing}
    </div>`;
}

/* ---------- Reiter Fühler & Kontakte (mit Suche, M16) ---------- */
function zustandText(p, eid) {
  const z = eid && p._hass && p._hass.states[eid]; if (!z) return 'nicht gefunden';
  if (['unavailable', 'unknown'].includes(z.state)) return 'nicht erreichbar';
  if (eid.startsWith('binary_sensor.')) return z.attributes.device_class === 'light' ? (z.state === 'on' ? 'an' : 'aus') : z.state === 'on' ? 'offen' : 'zu';
  if (eid.startsWith('climate.')) return z.attributes.current_temperature !== undefined ? `${de(Number(z.attributes.current_temperature), 1)} °C` : z.state;
  return `${z.state}${z.attributes.unit_of_measurement ? ` ${z.attributes.unit_of_measurement}` : ''}`;
}

function wahlListe(p, s, b, platz, filter) {
  const q = (s.q || '').trim().toLowerCase(), alle = p.entitaeten(filter);
  const treffer = q ? alle.filter(([eid, n]) => n.toLowerCase().includes(q) || eid.toLowerCase().includes(q)) : alle;
  const nimm = eid => platz === 'fuehler' ? p.csFuehler(b, eid) : p.csKontakt(b, platz, eid);
  return html`<div class="cs-picker" data-wahl=${platz}><input type="search" placeholder="Suchen: Name oder Entity-ID" data-f="suche" .value=${live(s.q || '')} @input=${ev => { s.q = ev.target.value; p.neuZeichnen(); }}>
      ${treffer.slice(0, 30).map(([eid, n]) => html`<button class="zeile cs-pk" data-eid=${eid} @click=${p.nurAdmin(() => nimm(eid))}><div><b>${n}</b><div class="cs-id">${eid}</div></div><span class="leise">${zustandText(p, eid)}</span></button>`)}
      ${treffer.length > 30 ? html`<div class="leise">… ${treffer.length - 30} weitere – genauer suchen</div>` : treffer.length ? nothing : html`<div class="leer">Nichts gefunden</div>`}
      <div class="cs-pk-fuss"><button class="cs-link" @click=${p.nurAdmin(() => p.assistentAuf({ bid: b.id, vorgabe: true }))}>Neues Gerät mit dem Assistenten ›</button>
        <button class="cs-link" data-k="keiner" @click=${p.nurAdmin(() => nimm(null))}>keiner</button><button class="cs-link" @click=${() => { s.wahl = null; s.q = ''; p.neuZeichnen(); }}>schließen</button></div></div>`;
}

function tabFuehler(p, s, b, E) {
  const c = p.symAus(b), tuer1 = (c.tueren[0] && c.tueren[0].sensor) || (b.tuer && b.tuer.eid) || null;
  const plaetze = [['fuehler', '🌡', 'Temperaturfühler', b.fuehler, FUEHLER, 'nötig für Thermostat, Bei Bedarf und die lernende Regelung'],
    ...c.tueren.map((t, i) => [`tuer:${i}`, '🚪', `Tür ${i + 1}`, i === 0 ? tuer1 : t.sensor, KONTAKT, null]),
    ...c.fenster.map((f, i) => [`fenster:${i}`, '🪟', `Fenster ${i + 1}`, f.sensor, KONTAKT, null]),
    ['licht', '💡', 'Licht im Symbol', c.licht, LICHT, 'Fenster leuchten, wenn Licht brennt']];
  const auf = k => { s.wahl = s.wahl === k ? null : k; s.q = ''; p.neuZeichnen(); };
  return html`<div class="glas-panel liste cs-gr">
      ${plaetze.map(([k, ic, t, eid, filter, sub]) => html`${zeile(k.replace(':', ''), html`${ic} ${t}`, eid ? html`${p.name(eid)} · ${zustandText(p, eid)}<div class="cs-id">${eid}</div>` : (sub || 'keiner zugeordnet'),
          eid ? html`<button class="chip glas-panel nur-admin" @click=${p.nurAdmin(() => auf(k))}>ändern</button>` : html`<button class="chip glas-panel cs-plus nur-admin" @click=${p.nurAdmin(() => auf(k))}>+ zuordnen</button>`)}
        ${s.wahl === k ? wahlListe(p, s, b, k, filter) : nothing}`)}
      ${zeile('tuerpause', 'Tür-Pause', 'Tür oder Fenster offen → die Heizung pausiert', html`<span class="cs-wert">${E.tuer ? E.tuer.text : '–'}</span>`, E.tuer, marke(p, E.tuer))}
    </div>
    <div class="leise cs-fuss">Wie viele Türen und Fenster das Symbol hat und wo sie sitzen, steht unter 🏠 Aussehen. Die Suche geht über alle passenden Entitäten in Home Assistant.</div>`;
}

/* ---------- Reiter Strom ---------- */
function tabStrom(p, b, E) {
  const d = p.d;
  return html`<div class="glas-panel liste cs-gr">
      ${zeile('anschluss', 'Stromanschluss', null, html`<select data-f="anschluss" @change=${p.nurAdmin(ev => p.csSetzen(b, 'anschluss', ev.target.value, 'Anschluss gespeichert'))}>${d.anschluesse.map(a => html`<option value=${a.id} ?selected=${b.anschluss === a.id}>${a.name} · ${a.phasen === 3 ? '3 × ' : ''}${a.ampere} A</option>`)}</select>`)}
      ${zeile('vorrang', 'Vorrang in der Staffelung', 'kommt vor oder nach den anderen dran, wenn nicht alle zugleich dürfen',
        seg([['niedrig', 'niedrig'], ['normal', 'normal'], ['hoch', 'hoch']], b.prio, p.nurAdmin(v => p.csSetzen(b, 'prio', v))), E.prio, E.prio && E.prio.herkunft === 'abweichend' ? marke(p, E.prio, () => p.csSetzen(b, 'prio', 'normal')) : nothing)}
      ${zeile('staffel', '⚡ Staffelung', null, html`<span class="cs-wert">${E.staffel ? E.staffel.text : '–'}</span>`, E.staffel, marke(p, E.staffel))}
      ${zeile('firma', 'Firma · für die Abrechnung', null, html`<select data-f="firma" @change=${p.nurAdmin(ev => p.csFirma(b, ev.target.value))}>${d.firmen.map(f => html`<option value=${f.id} ?selected=${b.firma === f.id}>${f.name}</option>`)}</select>`)}
    </div>`;
}

/* ---------- Reiter Aussehen ---------- */
function tabAussehen(p, b) {
  const sym = b.symbol, sub = `${sym && sym.doppel ? 'Doppel' : 'Einzel'} · ${sym ? sym.tueren.length : 1} ${sym && sym.tueren.length === 2 ? 'Türen' : 'Tür'} · ${sym ? sym.fenster.length : 1} Fenster · Licht: ${sym && sym.licht ? p.name(sym.licht) : 'keins'}`;
  return html`<div class="glas-panel liste cs-gr">
      ${b.pumpe ? nothing : html`<button class="zeile sym-zeile" data-zeile="symbol" @click=${() => p.aussehenAuf(b)}><span class="sym-mini">${unsafeHTML(bcContainer(BEREICH_FARBEN[b.f % BEREICH_FARBEN.length], 'aus', b))}</span><div><b class="blau">Symbol · Aussehen bearbeiten</b><div class="leise">${sub}</div></div><span class="chev">›</span></button>`}
      ${zeile('name', 'Name auf der Seite', 'erscheint auf Kachel und Kopf; die Namen in Home Assistant stehen unter 🏷 Namen in HA',
        html`<input data-f="name" size="16" value=${b.name} .value=${live(b.name)} @change=${p.nurAdmin(ev => p.csName(b, ev.target.value))} @keydown=${ev => { if (ev.key === 'Enter') ev.target.blur(); }}>`)}
    </div>`;
}

/* ---------- Reiter Namen in HA: Vorschau der Integration (baustelle/inventar_vorschau), Übernehmen im bekannten Dialog ---------- */
function tabNamen(p, s, b) {
  const N = b.namen;
  if (!N || !N.container_id) return html`<div class="glas-panel liste cs-gr"><div class="zeile cs-zeile"><div class="cs-zl"><b>Namen in Home Assistant</b><div class="leise">Erst im Inventar, dann lassen sich die Namen einheitlich benennen.</div></div><div class="cs-zr">${namenChip(p, b)}</div></div></div>`;
  const V = p.invVorschau(N.container_id), R = V && V.schritte ? V.schritte : [];
  const ab = r => !['gleich', 'ok', 'entfaellt'].includes(zustand(r));   // dieselbe Regel wie die Vorschau im Inventar
  const offen = R.filter(ab).length;
  return html`<div class="glas-panel liste cs-gr">
      <div class="zeile cs-zeile" data-zeile="namen"><div class="cs-zl"><b>Namen in Home Assistant</b><div class="leise">Schema der Baustelle: Nummer · Art · Kürzel, z. B. <code>${N.container}</code>. Der HA-Bereich und die Werte der Baustelle bleiben unverändert.</div></div><div class="cs-zr">${namenChip(p, b)}</div></div>
      ${V === undefined ? html`<div class="leer">Vorschau lädt …</div>` : !V ? html`<div class="leer">Keine Vorschau</div>`
        : R.map(r => html`<div class="zeile cs-nz ${ab(r) ? 'abw' : ''}"><div class="cs-zl"><span class="leise">${r.was}${r.gruppe ? ` · ${r.gruppe}` : ''}</span>
            <div><code>${r.alt || '–'}</code>${ab(r) ? html` <span class="cs-abw">⚠ weicht ab</span><div class="cs-id">→ ${r.neu || '–'}</div>` : html` <span class="cs-ok">✓ nach Schema</span>`}</div></div></div>`)}
      ${offen ? html`<button class="knopf amber cs-breit" data-k="benennen" @click=${() => p.invAuf({ art: 'inv-vorschau', id: N.container_id, zurueck: s })}>In Home Assistant einheitlich benennen … (${offen})</button>
          <div class="leise cs-fuss">Freie Namen sind erlaubt; sie bleiben als „⚠ weicht ab“ markiert. Übernehmen können nur Admins.</div>`
        : V ? html`<div class="cs-erg">✓ Alle Namen nach Schema</div>` : nothing}
    </div>`;
}

/* ---------- Die Seite ---------- */
function geraetJetzt(g) { return g.kwJetzt > 0 ? `${de(g.kwJetzt, 1)} kW` : g.an ? 'an' : 'aus'; }

export function containerSeite(p, s) {
  const b = p.b; if (!b) { p.s.sheet = null; return nothing; }
  const E = b.einst || {}, N = b.namen, f = p.firma(b.firma), pumpe = b.pumpe;
  const tabs = pumpe ? TABS.filter(([k]) => ['strom', 'aussehen', 'namen'].includes(k)) : TABS;
  const tab = tabs.some(([k]) => k === s.tab) ? s.tab : tabs[0][0];
  const rolle = g => g.heizer && b.stufen && b.stufenAn ? (b.stufen.haupt || []).includes(g.id) ? ' · ★ Primär' : ' · Zusatz' : '';
  const inhalt = tab === 'heizung' ? tabHeizung(p, s, b, E) : tab === 'fuehler' ? tabFuehler(p, s, b, E) : tab === 'strom' ? tabStrom(p, b, E) : tab === 'aussehen' ? tabAussehen(p, b) : tabNamen(p, s, b);
  return html`${GRIFF}<div class="block-kopf cs-kopf"><div><h3>${b.name}</h3><span class="leise">${pumpe ? 'Pumpenschacht' : 'Container'}${N && N.container_id && N.container ? html` · Inventar <code>${N.container}</code>` : nothing} · ${f && !f.eigen ? f.name : 'eigen'}</span></div>${namenChip(p, b)}</div>
      <div class="glas-panel liste cs-geraete"><div class="gruppe">${pumpe ? 'Pumpen' : 'Geräte'} · ${b.geraete.length}</div>
        ${b.geraete.map((g, i) => html`<button class="zeile cs-zeile" data-i=${i} @click=${p.nurAdmin(() => p.geraetBearbeiten(b, i))}><div class="cs-zl"><b>${g.heizer ? '🔥' : pumpe ? '💧' : '🔌'} ${g.n}</b><div class="leise">${g.typ}${rolle(g)} · <code>${p.name(g.schalter)}</code>${g.status !== 'aktiv' ? ` · ${g.status}` : ''}</div></div><span class="leise">${geraetJetzt(g)} ✎</span></button>`)}
        <button class="zeile nur-admin cs-plus-z" data-k="assistent" @click=${p.nurAdmin(() => p.assistentAuf({ bid: b.id, vorgabe: true }))}><span class="blau">+ Gerät hinzufügen</span><span class="leise">Assistent: Gerät · was hängt dran · Namen</span></button></div>
      <div class="cs-legende"><span class="cs-erb">von der Baustelle</span> gilt für alle Container · <span class="cs-abw">abweichend ↺</span> eigener Wert, ↺ = zurück · ohne Marke: gibt es nur am Container · Änderungen gelten sofort</div>
      <div class="seg cs-tabs" role="tablist">${tabs.map(([k, t]) => html`<button role="tab" data-tab=${k} class=${k === tab ? 'on' : ''} aria-selected=${k === tab ? 'true' : 'false'} @click=${() => p.csTab(k)}>${t}</button>`)}</div>
      ${inhalt}
      <div class="cs-knoepfe">${knopf('Fertig', () => p.schliessen())}${knopf('Container entfernen', p.nurAdmin(() => p.bereichWeg()), 'rot nur-admin')}</div>`;
}

export const CS_BREIT = ['bereich'];
export const CS_CSS = `
.cs-kopf { display: flex; justify-content: space-between; align-items: center; gap: 10px; padding-right: 44px; }
.cs-kopf h3 { margin: 0; }
.cs-kopf code, .cs-geraete code { font-size: 11px; }
.cs-erb { font-size: 11px; padding: 1px 7px; border-radius: 8px; background: rgba(127,127,127,.2); color: var(--ink2); white-space: nowrap; }
.cs-abw { font-size: 11px; padding: 1px 4px 1px 7px; border-radius: 8px; background: color-mix(in srgb, var(--amber) 20%, transparent); color: var(--amber); white-space: nowrap; display: inline-flex; align-items: center; gap: 4px; }
.cs-zur { border: 0; background: none; color: var(--amber); font-size: 13px; padding: 0 3px; cursor: pointer; }
.cs-ok { font-size: 11px; color: var(--s3); }
.cs-mk { margin-top: 4px; display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }
.cs-ruht { font-size: 11.5px; color: var(--ink2); font-style: italic; margin-top: 2px; }
.cs-link { border: 0; background: none; padding: 0; font: inherit; font-size: 12.5px; color: var(--blau); cursor: pointer; }
.cs-zeile { display: flex; align-items: center; justify-content: space-between; gap: 12px; text-align: left; }
.cs-zl { min-width: 0; flex: 1; }
.cs-zr { flex: none; display: flex; align-items: center; gap: 6px; flex-wrap: wrap; justify-content: flex-end; max-width: 60%; }
.cs-z-baustelle .cs-wert { color: var(--ink2); }
.cs-z-abweichend > .cs-zl > b { color: var(--amber); }
.cs-wert { font-size: 13.5px; white-space: nowrap; }
.cs-id { font-family: ui-monospace, monospace; font-size: 11px; color: var(--ink2); word-break: break-all; }
.cs-legende { font-size: 11.5px; color: var(--ink2); margin: 10px 2px; line-height: 1.9; }
.cs-tabs { margin: 4px 0 10px; flex-wrap: wrap; }
.cs-tabs button { font-size: 13px; }
.cs-soll { padding: 4px 14px 10px; margin-bottom: 10px; }
.cs-soll .cs-zeile { padding: 8px 0; }
.cs-soll .cs-zeile + .cs-zeile { border-top: 1px solid var(--gridc); }
.cs-fuss { margin: 6px 2px; font-size: 12px; line-height: 1.45; }
.cs-feld { padding: 4px 12px 8px; }
.cs-knoepfe { display: flex; flex-wrap: wrap; gap: 8px; margin: 10px 0; }
.cs-knoepfe .knopf { flex: 1 1 auto; }
.cs-breit { width: 100%; margin: 10px 0 4px; }
.cs-nz.abw { background: color-mix(in srgb, var(--amber) 7%, transparent); }
.cs-erg { padding: 10px 12px; color: var(--s3); }
.cs-picker { padding: 8px 10px 10px; background: rgba(127,127,127,.1); border-radius: 12px; margin: 0 6px 8px; }
.cs-picker input { width: 100%; box-sizing: border-box; margin-bottom: 6px; }
.cs-pk { display: flex; justify-content: space-between; gap: 8px; text-align: left; }
.cs-pk-fuss { display: flex; justify-content: space-between; gap: 10px; flex-wrap: wrap; padding-top: 6px; }
.cs-plus { color: var(--blau); }
.cs-plus-z { display: flex; justify-content: space-between; gap: 10px; }
.cs-geraete .cs-zeile { width: 100%; }
.sheet .cs-geraete .zeile, .sheet .cs-gr > .zeile, .sheet .cs-gr > .cs-feld { padding: 8px 14px; }   /* Listen im Glas-Panel: Abstand zum Rand */
.sheet .cs-picker .zeile { padding: 6px 4px; }
@container (max-width: 640px) {
  .cs-kopf { flex-wrap: wrap; }
  .cs-zeile { flex-wrap: wrap; }
  .cs-zr { max-width: 100%; justify-content: flex-start; }
  .cs-zr .seg { flex-wrap: wrap; height: auto; max-width: 100%; }
  .cs-zr .seg button { padding: 4px 7px; font-size: 11.5px; }
  .cs-tabs { display: grid; grid-template-columns: 1fr 1fr; }
  .cs-tabs button { font-size: 12px; padding: 0 6px; }
  .cs-plus-z { flex-wrap: wrap; }
}`;
