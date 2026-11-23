// Assistent „+ Gerät hinzufügen“ und „+ Container“ (UI-Bericht M12, Mockup ordnung.html as-1 … as-5, cn-eigen/-fremd/-belegt,
// abgenommen 23.11.2026). Fünf Schritte: freier Schalter (je Kanal) oder Sensor → Container → was hängt dran (eine Typenliste) →
// Namensvorschau des neuen Geräts vor dem Schreiben (eigener Name „⚠ weicht ab“) → anlegen und umbenennen in einem (oder „Nur
// anlegen, Namen lassen“), danach Rückgängig. Herberts Entscheidungen A/B (23.11.2026): umbenannt wird nur das neue Gerät; Schritt 1
// bietet jeden freien Schalter einzeln an. Kandidaten, Typen (passt / passt nicht mit Grund), Namen, Nummern und das Muster der
// Namen liefert die Integration (baustelle/geraet_*, baustelle/container_*, docs/api-0.7.md §13); die Seite zeigt nur an.
import { html, nothing } from 'lit';
import { live } from 'lit/directives/live.js';
import { de } from '../hilfen.js';

const GRIFF = html`<div class="griff"></div>`;
const knopf = (t, fn, art = '', k = '', aus = false) => html`<button class="knopf ${art} ${aus ? 'aus' : ''}" data-k=${k || nothing} ?disabled=${aus} @click=${fn}>${t}</button>`;
const IC = { PLUG: '🔌', TEMP: '🌡', DOOR: '🚪', FEN: '🪟' };
const SCHRITTE = ['Gerät', 'Container', 'Was hängt dran', 'Namen', 'Fertig'];
const NUR_ADMINS = 'Hinzufügen dürfen nur Admins – du kannst dir alles ansehen';
const rechteHinweis = (p, t = NUR_ADMINS) => p.nurLesen() ? html`<div class="leise amber-t ga-fuss nm-rechte">🔒 ${t}</div>` : nothing;
const radio = an => html`<span class="ga-radio ${an ? 'on' : ''}"></span>`;
const datum = iso => { const t = iso ? new Date(iso) : null; return t && !isNaN(t) ? t.toLocaleString('de-AT', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : ''; };
const zustand = (p, eid) => { const z = eid && p._hass && p._hass.states[eid]; if (!z) return ''; const e = z.attributes && z.attributes.unit_of_measurement; return `${z.state}${e ? ' ' + e : ''}`; };

/* Container der Baustelle mit Inventar-Name (baustelle/struktur bereiche[].namen) */
const inventarText = b => b.pumpe ? 'Pumpenschacht · nicht im Inventar' : b.namen && b.namen.container ? b.namen.container : 'nicht im Inventar – Namen bleiben';

function kopf(p, s) {
  const b = p.d.bereiche.find(x => x.id === s.bid);
  return html`${GRIFF}<div class="block-kopf ga-kopf"><h3>+ Gerät hinzufügen</h3><span class="leise">${s.vorgabe && b ? `für ${b.name}` : `Schritt ${s.schritt} von 5`}</span></div>
    <ol class="ga-schritte">${SCHRITTE.map((t, i) => html`<li class=${i + 1 === s.schritt ? 'an' : i + 1 < s.schritt ? 'fertig' : ''} data-n=${i + 1}><span>${i + 1 < s.schritt ? '✓' : i + 1}</span>${t}</li>`)}</ol>`;
}

/* Schritt 1: jeder freie Schalter einzeln (je Kanal, Shellys oben) und Fühler, Türen, Fenster – Liste der Integration, mit Suche */
function schrittGeraet(p, s) {
  const K = p.assistentKandidaten(), z = () => p.neuZeichnen(), q = (s.q || '').trim().toLowerCase();
  const frei = K || [], L = frei.filter(k => !q || `${k.name} ${k.kanal || ''} ${k.modell || ''} ${k.entity_id || ''}`.toLowerCase().includes(q));
  const an = k => s.dev === k.device_id && (s.schalter || null) === (k.schalter || null);
  return html`<input class="ga-suche" type="search" placeholder="Suchen: Name, Modell, Entity-ID" .value=${live(s.q || '')} @input=${e => { s.q = e.target.value; z(); }}>
    <div class="glas-panel liste ga-l"><div class="gruppe">Frei in Home Assistant, noch nicht zugeordnet · ${K ? frei.length : '…'}</div>
      ${K === undefined ? html`<div class="leer">lädt …</div>` : !K ? html`<div class="leer">${p.invFehler('gak') || 'Geräte nicht lesbar'}</div>`
        : !L.length ? html`<div class="leer">${q ? 'Nichts gefunden' : 'Keine freien Geräte'}</div>`
        : L.map(k => { const defekt = k.status === 'defekt', seit = datum(k.seit), jetzt = zustand(p, k.entity_id);
          return html`<button class="zeile ga-wahl ${an(k) ? 'on' : ''} ${defekt ? 'ga-aus' : ''}" data-id=${k.key} ?disabled=${defekt}
            @click=${() => { if (!an(k)) Object.assign(s, { dev: k.device_id, schalter: k.schalter || null, typ: null, nenn: null }); z(); }}>
            <div class="ga-zl"><b>${IC[k.typ] || '•'} ${k.name}${k.kanal ? html` · <span class="leise">${k.kanal}</span>` : nothing}</b><div class="leise">${[k.modell, k.typ === 'PLUG' && !k.shelly && 'kein Shelly – Name im Gerät bleibt', k.hinweis, seit && `neu seit ${seit}`, jetzt, defekt && 'defekt – nicht zuordenbar'].filter(Boolean).join(' · ')}</div></div>${radio(an(k))}</button>`; })}</div>
    <div class="leise ga-fuss">Nicht dabei? Erst in HA hinzufügen (Einstellungen › Geräte & Dienste › Shelly), dann erscheint es hier. Alternative in Home Assistant: Geräte & Dienste › Baustelle › „Gerät“.</div>
    <div class="ga-knoepfe">${knopf('Weiter ›', () => p.assistentSchritt(s, s.vorgabe && s.bid ? 3 : 2), 'amber', 'weiter', !s.dev)}${knopf('Abbrechen', () => p.schliessen(), 'leise-k')}</div>`;
}

/* Schritt 2: Container wählen (oder neuen anlegen) */
function schrittContainer(p, s) {
  const z = () => p.neuZeichnen();
  return html`<div class="glas-panel liste ga-l"><div class="gruppe">An welchen Container?</div>
      ${p.d.bereiche.map(b => html`<button class="zeile ga-wahl ${s.bid === b.id ? 'on' : ''}" data-id=${b.id} @click=${() => { if (s.bid !== b.id) { s.bid = b.id; s.typ = null; } z(); }}>
        <div class="ga-zl"><b>${b.pumpe ? '💧' : '🏠'} ${b.name}</b><div class="leise"><code>${inventarText(b)}</code> · ${b.geraete.length} ${b.pumpe ? 'Pumpen' : 'Geräte'}</div></div>${radio(s.bid === b.id)}</button>`)}
      <button class="zeile nur-admin" data-k="cn-neu" @click=${p.nurAdmin(() => p.containerNeuAuf(s))}><span class="blau">+ Neuer Container …</span><span class="leise">legt Inventar mit an</span></button></div>
    <div class="ga-knoepfe">${knopf('Weiter ›', () => p.assistentSchritt(s, 3), 'amber', 'weiter', !s.bid)}${knopf('‹ Zurück', () => p.assistentSchritt(s, 1))}</div>`;
}

/* Schritt 3: was hängt dran – die eine Typenliste der Integration; Nennleistung und Primär/Zusatz bei Heizkörpern */
function schrittTyp(p, s) {
  const T = p.assistentTypen(s), z = () => p.neuZeichnen(), b = p.d.bereiche.find(x => x.id === s.bid);
  if (T === undefined) return html`<div class="glas-panel liste ga-l"><div class="leer">lädt …</div></div>${knopf('‹ Zurück', () => p.assistentSchritt(s, s.vorgabe ? 1 : 2))}`;
  if (!T) return html`<div class="glas-panel liste ga-l"><div class="leer">${p.invFehler(p.assistentSchluessel('gat', s)) || 'Typen nicht lesbar'}</div></div>${knopf('‹ Zurück', () => p.assistentSchritt(s, s.vorgabe ? 1 : 2))}`;
  if (!s.typ || !T.typen.some(t => t.k === s.typ && t.passt)) s.typ = T.vorschlag;
  const gew = T.typen.find(t => t.k === s.typ), gruppen = [...new Set(T.typen.map(t => t.gruppe))];
  return html`<div class="leise ga-fuss">${T.geraet.name} an <b>${b ? b.name : ''}</b> – was hängt dran?</div>
    ${gruppen.map(g => html`<div class="glas-panel liste ga-l"><div class="gruppe">${g}</div>${T.typen.filter(t => t.gruppe === g).map(t => html`<button class="zeile ga-wahl ${s.typ === t.k ? 'on' : ''} ${t.passt ? '' : 'ga-aus'}" data-v=${t.k} ?disabled=${!t.passt}
        @click=${() => { s.typ = t.k; z(); }}><b>${t.text}</b>${t.passt ? radio(s.typ === t.k) : html`<span class="leise ga-grund">${t.grund}</span>`}</button>`)}</div>`)}
    ${gew && (gew.nenn || gew.rolle) ? html`<div class="glas-panel liste ga-l">
      ${gew.nenn ? html`<div class="zeile" data-zeile="nenn"><div><b>Nennleistung (Typenschild)</b><div class="leise">für Prognose und Staffelung; leer = gemessen</div></div>
        <span class="stepper klein"><button data-d="-0.1" @click=${() => p.assistentNenn(s, -0.1)}>−</button><b>${s.nenn ? `${de(s.nenn, 1)} kW` : 'gemessen'}</b><button data-d="0.1" @click=${() => p.assistentNenn(s, 0.1)}>+</button></span></div>` : nothing}
      ${gew.rolle ? html`<div class="zeile" data-zeile="rolle"><div><b>Rolle</b><div class="leise">Primär heizt zuerst, Zusatz nur bei Bedarf</div></div>
        <div class="seg klein">${[['primaer', '★ Primär'], ['zusatz', 'Zusatz']].map(([v, t]) => html`<button data-v=${v} class=${(s.rolle || 'zusatz') === v ? 'on' : ''} @click=${() => { s.rolle = v; z(); }}>${t}</button>`)}</div></div>` : nothing}</div>` : nothing}
    <div class="ga-knoepfe">${knopf('Weiter › Namen', () => p.assistentSchritt(s, 4), 'amber', 'weiter', !gew)}${knopf('‹ Zurück', () => p.assistentSchritt(s, s.vorgabe ? 1 : 2))}</div>`;
}

/* Schritt 4: Namensvorschau alt → neu, bevor etwas geschrieben wird; eigener Name statt Schema = „⚠ weicht ab“ */
function schrittNamen(p, s) {
  const V = p.assistentVorschau(s), z = () => p.neuZeichnen();
  const zurueck = knopf('‹ Zurück', () => p.assistentSchritt(s, 3));
  if (V === undefined) return html`<div class="glas-panel liste ga-l"><div class="leer">Vorschau lädt …</div></div>${zurueck}`;
  if (!V) return html`<div class="glas-panel liste ga-l"><div class="leer">${p.invFehler(p.assistentSchluessel('gav', s)) || 'Keine Vorschau'}</div></div>${zurueck}`;
  const S = (V.schritte || []).filter(r => r.zustand !== 'gleich'), kon = Object.keys(V.konflikte || {}).length, gruppen = [...new Set(S.map(r => r.gruppe || ''))];
  const umbenennen = !!V.umbenennen, text = !umbenennen ? 'Anlegen' : s.frei && (s.freiName || '').trim() ? 'Anlegen (freier Name)' : 'Anlegen und umbenennen';
  const nichts = V.moeglich === false;   // die Integration sagt, ob es so geht (Hinweis)
  const tabelle = gruppen.map(g => html`<div class="glas-panel liste inv-liste inv-gruppe"><div class="inv-g-kopf"><b class="inv-id">${g || '–'}</b></div>
      <div class="inv-tr inv-th"><span class="t-was">Was</span><span class="t-alt">heute</span><span class="t-neu">neu</span><span class="t-m"></span></div>
      ${S.filter(r => (r.gruppe || '') === g).map(r => html`<div class="inv-tr ${r.zustand}" data-ziel=${r.ziel}><span class="t-was">${r.was}</span><span class="t-alt ga-alt">${r.alt ?? '–'}</span>
        <span class="t-neu ${r.frei ? 'amber-t' : ''}">${r.neu ?? html`<span class="leise">entfernen</span>`}</span><span class="t-m">${r.frei ? html`<span class="ga-abw">⚠ weicht ab</span>` : r.zustand === 'konflikt' ? html`<span class="rot-t">✕ Konflikt</span>` : nothing}</span></div>`)}</div>`);
  return html`<div class="leise ga-fuss">${umbenennen ? html`So heißt das neue Gerät danach in Home Assistant${V.container ? html` (Schema, Container <code>${V.container}</code>)` : ''}. <b>Noch ist nichts geschrieben.</b> Andere Geräte des Containers bleiben, wie sie sind.` : V.hinweis}</div>
    ${V.im_inventar && !V.eingetragen ? html`<div class="glas-panel liste ga-l inv-warn"><div class="zeile"><div><b class="amber-t">⚠ Nicht am Container eingetragen</b><div class="leise">${V.hinweis || ''}</div></div></div></div>` : nothing}
    ${nichts ? html`<div class="leise rot-t ga-fuss">So lässt es sich nicht hinzufügen – bitte einen anderen Container oder Typ wählen.</div>` : nothing}
    ${umbenennen ? html`<div class="ga-vorschau">${S.length ? tabelle : html`<div class="glas-panel liste ga-l"><div class="leer">Alles schon nach Schema</div></div>`}</div>` : nothing}
    ${kon ? html`<div class="leise rot-t ga-fuss">${kon} Entity-ID ist schon vergeben – erst lösen (umbenennen oder löschen) oder „Nur anlegen, Namen lassen“.</div>` : nothing}
    ${(V.verweise || []).length ? html`<div class="leise amber-t ga-fuss">⚠ ${V.verweise.length} Automation/Skript/Dashboard nennt alte Entity-IDs – danach dort die neue eintragen.</div>` : nothing}
    ${V.frei_moeglich ? html`<div class="glas-panel liste ga-l"><div class="zeile" data-zeile="frei"><div class="ga-zl"><b>Eigenen Namen statt Schema</b><div class="leise">${s.frei
        ? html`<input class="ga-frei" data-f="frei" .value=${live(s.freiName || '')} placeholder="Name des Geräts" @input=${e => { s.freiName = e.target.value; }} @change=${e => { s.freiName = e.target.value; z(); }}> <span class="ga-abw">⚠ weicht ab – wird markiert, nicht gesperrt</span><div>gilt für den Gerätenamen; die Entity-IDs folgen dem Schema</div>`
        : 'erlaubt, wird dann am Container als „⚠ weicht ab“ gezeigt'}</div></div>
      <button class="sw ${s.frei ? 'on' : ''}" role="switch" aria-checked=${s.frei ? 'true' : 'false'} aria-label="Eigenen Namen statt Schema" @click=${() => { s.frei = !s.frei; z(); }}><i></i></button></div></div>` : nothing}
    <div class="ga-knoepfe">${knopf(text, p.nurAdmin(() => kon ? p.toast('Erst den Konflikt lösen') : p.assistentAnlegen(s)), `amber nur-admin`, 'anlegen', !!kon || nichts || !!s.laeuft)}${umbenennen ? knopf('Nur anlegen, Namen lassen', p.nurAdmin(() => p.assistentAnlegen(s, true)), 'nur-admin', 'namen-lassen', !!s.laeuft) : nothing}${zurueck}</div>${rechteHinweis(p)}
    <div class="leise ga-fuss">${s.laeuft ? html`<b>${s.laeuft}</b>` : 'Ein Schritt: legt das Gerät und den Inventar-Eintrag an und benennt es um. Geht etwas nicht, steht hier genau, was schon geschehen ist.'}</div>`;
}

/* Schritt 5: Ergebnis mit Rückgängig (Gutachten 0.8.192: „wieder entfernt“ nur bei Erfolg, sonst was blieb) */
function schrittFertig(p, s) {
  const r = s.erg || {}, u = r.umbenannt || {}, b = p.d.bereiche.find(x => x.id === s.bid);
  const namen = u.fehler ? html`<span class="amber-t">${u.fehler}</span>` : u.status === 'ohne_inventar' ? 'Namen bleiben (nicht im Inventar)'
    : u.status === 'nur_inventar' ? 'nur im Inventar zugeordnet, Namen bleiben' : u.status === 'eingehaengt' ? 'eingehängt, Inventar und Namen bleiben'
    : u.status === 'namen_gelassen' ? 'Namen bleiben, wie sie sind'
    : u.status === 'teilweise' ? html`<span class="amber-t">${u.anzahl} Namen geändert, ${u.offen} offen – „Nachholen“ unter 🏷 Namen in HA</span>` : `${u.anzahl || 0} Namen geändert`;
  return html`<div class="glas-panel ga-fertig"><div class="ga-gross">${s.zurueckGenommen ? '↺' : '✓'}</div>
      <b>${s.zurueckGenommen ? `${r.name} wieder entfernt` : `${r.name} hängt an ${r.container || (b ? b.name : '')}`}</b>
      ${s.zurueckGenommen ? nothing : html`<div class="leise">${r.typ || ''} · ${r.frei ? html`Name „${r.frei}“ <span class="ga-abw">⚠ weicht ab</span> · ` : nothing}${namen}</div>`}
      ${s.rueckFehler ? html`<div class="leise amber-t ga-rueck-fehler">Teilweise zurückgenommen – bleibt: ${s.rueckFehler.join('; ')}</div>` : nothing}
      <div class="ga-knoepfe">${knopf('Zum Container ›', () => p.assistentZumContainer(s), 'amber', 'zum-container')}${knopf('+ Noch ein Gerät', () => p.assistentAuf({ bid: s.vorgabe ? s.bid : null, vorgabe: s.vorgabe, zurueck: s.zurueck }), '', 'noch-eins')}
        ${s.zurueckGenommen || !r.rueck ? nothing : knopf('↺ Rückgängig', p.nurAdmin(() => p.assistentRueck(s)), 'nur-admin', 'rueck', !!s.laeuft)}</div>${s.laeuft ? html`<div class="leise">${s.laeuft}</div>` : nothing}</div>`;
}

function assistent(p, s) {
  const inhalt = s.schritt === 1 ? schrittGeraet : s.schritt === 2 ? schrittContainer : s.schritt === 3 ? schrittTyp : s.schritt === 4 ? schrittNamen : schrittFertig;
  return html`${kopf(p, s)}${inhalt(p, s)}`;
}

/* „+ Container“ (ersetzt „Neuer Container“): Container/Schacht, eigen/fremd mit Firma, Nummer (belegte gesperrt – Regel der
   Integration), Verwendung, Name auf der Seite, Namensvorschau; legt immer auch den Inventar-Container an (Entscheidung 2) */
function containerNeu(p, s) {
  const f = s.form, z = () => p.neuZeichnen(), I = p.invDaten(), V = p.containerVorschau(f);
  const fremde = p.d.firmen.filter(x => !x.eigen), fi = I && (I.firmen || []).find(x => x.id === f.firma_id && x.baustelle_id === p.d.entry);
  const seg = (opts, wert, fn) => html`<div class="seg klein">${opts.map(([v, t]) => html`<button data-v=${v} class=${v === wert ? 'on' : ''} @click=${() => { fn(v); z(); }}>${t}</button>`)}</div>`;
  const zeile = (t, sub, rechts, k) => html`<div class="zeile" data-zeile=${k}><div class="ga-zl"><b>${t}</b>${sub ? html`<div class="leise">${sub}</div>` : nothing}</div><div class="ga-zr">${rechts}</div></div>`;
  // Nummer und ihr Text (z. B. „006“) kommen von der Integration (Gutachten 0.8.192); die Seite zählt nur die Eingabe weiter
  const nr = V && V.nummer, sperre = !V || V.fehler || V.belegt || !f.name.trim() || s.laeuft;
  const nummer = f.schacht || f.ohneInventar ? nothing : f.eigen
    ? zeile('Nummer', V && V.belegt ? html`<span class="rot-t">${V.grund}</span>` : V && V.naechste_text ? `nächste freie: ${V.naechste_text}` : '',
      html`<span class="stepper klein"><button data-d="-1" @click=${() => { f.nr = Math.max(1, (f.nr || nr || 1) - 1); z(); }}>−</button><b>${(V && V.nummer_text) || '…'}</b><button data-d="1" @click=${() => { f.nr = Math.min(999, (f.nr || nr || 0) + 1); z(); }}>+</button></span>`, 'nummer')
    : zeile('Nummer', 'vergibt die Integration: die nächste dieser Firma auf der Baustelle', html`<b class="inv-id">${(V && V.nummer_text) || '–'}</b>`, 'nummer');
  return html`${GRIFF}<div class="block-kopf ga-kopf"><h3>+ Container</h3><span class="leise">${f.ohneInventar ? 'nur auf der Seite – ohne Inventar' : 'auf der Seite und im Inventar'}</span></div>
    <div class="glas-panel liste ga-l">
      ${zeile('Art', null, seg([['container', 'Container'], ['schacht', 'Pumpenschacht']], f.schacht ? 'schacht' : 'container', v => { f.schacht = v === 'schacht'; }), 'art')}
      ${f.schacht ? nothing : zeile('Gehört', 'eigen = Nummer der Baustelle; fremd = Kürzel und Nummer der Firma', seg([['eigen', 'eigen'], ['fremd', 'fremd']], f.eigen ? 'eigen' : 'fremd', v => { f.eigen = v === 'eigen'; f.nr = null; }), 'gehoert')}
      ${f.schacht || f.eigen ? nothing : zeile('Firma', fremde.length ? 'Kürzel aus dem Inventar' : 'Zuerst unter ⚙ › Firmen anlegen', html`<select data-f="firma" @change=${e => { f.firma_id = e.target.value; z(); }}><option value="">– wählen –</option>${fremde.map(x => { const k = I && (I.firmen || []).find(y => y.id === x.id); return html`<option value=${x.id} ?selected=${x.id === f.firma_id}>${x.name}${k && k.kuerzel ? ` · ${k.kuerzel}` : ''}</option>`; })}</select>`, 'firma')}
      ${!f.schacht && !f.eigen && f.firma_id && fi && !fi.kuerzel ? zeile('Firmenkürzel', '2–5 Buchstaben, gilt dann für alle Container der Firma', html`<input data-f="kuerzel" size="6" .value=${live(f.kuerzel || '')} @change=${e => { f.kuerzel = e.target.value; z(); }}>`, 'kuerzel') : nothing}
      ${nummer}
      ${f.schacht || f.ohneInventar ? nothing : zeile('Verwendung', 'Kürzel im Namen', html`<select data-f="art" @change=${e => { f.art = e.target.value; z(); }}>${Object.entries((I && I.arten) || { [f.art]: f.art }).map(([k, t]) => html`<option value=${k} ?selected=${f.art === k}>${t} · ${k}</option>`)}</select>`, 'verwendung')}
      ${zeile('Name auf der Seite', 'frei wählbar, z. B. für die Kachel', html`<input data-f="name" size="14" placeholder="z. B. Mannschaft 2" .value=${live(f.name)} @input=${e => { f.name = e.target.value; }} @change=${e => { f.name = e.target.value; z(); }}>`, 'name')}
    </div>
    <div class="glas-panel ga-vorschau-c"><div class="gruppe">Vorschau</div>
      ${V === undefined ? html`<div class="leer">lädt …</div>` : !V ? html`<div class="leer">${p.invFehler(p.containerSchluessel(f)) || 'Keine Vorschau'}</div>` : V.fehler ? html`<div class="ga-vz"><span class="rot-t">${V.fehler}</span></div>
          ${V.ohne_inventar_moeglich ? html`<div class="ga-knoepfe">${knopf('Ohne Inventar anlegen …', () => { f.ohneInventar = true; z(); }, '', 'ohne-inventar')}</div>` : nothing}`
        : html`${V.inventar ? html`<div class="ga-vz"><span class="leise">Inventar</span><code>${V.inventar}</code></div>` : html`<div class="ga-vz"><span class="leise">${V.hinweis}</span></div>`}
          ${f.ohneInventar ? html`<div class="ga-knoepfe">${knopf('‹ Doch mit Inventar', () => { f.ohneInventar = false; z(); }, '', 'mit-inventar')}</div>` : nothing}
          <div class="ga-vz"><span class="leise">Kachel auf der Seite</span><span>${f.name.trim() || '–'}</span></div>
          ${V.geraete ? html`<div class="ga-vz"><span class="leise">Geräte heißen dann</span><code>${V.geraete} …</code></div>` : nothing}`}</div>
    <div class="ga-knoepfe">${knopf('Anlegen und Gerät hinzufügen ›', p.nurAdmin(() => p.containerAnlegen(s, true)), 'amber nur-admin', 'anlegen-weiter', !!sperre)}${knopf('Nur anlegen', p.nurAdmin(() => p.containerAnlegen(s, false)), 'nur-admin', 'anlegen', !!sperre)}${knopf('Abbrechen', () => p.schliessen(), 'leise-k')}</div>
    ${rechteHinweis(p, 'Anlegen dürfen nur Admins')}${s.laeuft ? html`<div class="leise ga-fuss"><b>${s.laeuft}</b></div>` : nothing}
    <div class="leise ga-fuss">„+ Container“ in der Übersicht, unter ⚙ und im Assistenten öffnet dieses Formular. Container aus dem Firmen-Dialog oder aus Home Assistant (Geräte & Dienste › Baustelle › „Bereich“) stehen noch nicht im Inventar – aufnehmen dann über den Chip „Nicht im Inventar – aufnehmen ›“ am Container.</div>`;
}

export const ASSISTENT_EINBLENDUNGEN = { 'geraet-assistent': assistent, 'container-neu': containerNeu };
export const ASSISTENT_BREIT = ['geraet-assistent'];

export const ASSISTENT_CSS = `
.ga-kopf { padding-right: 44px; }   /* Platz für den Melden-Knopf oben rechts */
.ga-schritte { list-style: none; display: flex; gap: 4px; padding: 0; margin: 4px 0 12px; flex-wrap: wrap; }
.ga-schritte li { font-size: 12px; color: var(--ink2); display: flex; align-items: center; gap: 5px; padding: 3px 9px 3px 3px; border-radius: 12px; background: rgba(127,127,127,.12); }
.ga-schritte li span { width: 18px; height: 18px; border-radius: 50%; display: grid; place-items: center; background: rgba(127,127,127,.3); font-size: 11px; }
.ga-schritte li.an { color: var(--ink); background: color-mix(in srgb, var(--amber) 22%, transparent); }
.ga-schritte li.an span { background: var(--amber); color: #000; }
.ga-schritte li.fertig span { background: #30d158; color: #fff; }
.ga-suche { width: 100%; box-sizing: border-box; margin-bottom: 8px; }
.ga-wahl { display: flex; justify-content: space-between; align-items: center; gap: 10px; text-align: left; }
.ga-wahl.on { background: color-mix(in srgb, var(--amber) 14%, transparent); }
.ga-radio { width: 16px; height: 16px; border-radius: 50%; border: 2px solid var(--ink2); flex: none; box-sizing: border-box; }
.ga-radio.on { border-color: var(--amber); background: radial-gradient(var(--amber) 45%, transparent 50%); }
.ga-aus { opacity: .45; cursor: default; } .ga-grund { font-size: 12px; text-align: right; }
.ga-l .zeile { padding: 8px 16px; } .ga-l .gruppe { padding-left: 16px; }
.ga-zl { min-width: 0; flex: 1; } .ga-zr { flex: none; display: flex; align-items: center; gap: 6px; flex-wrap: wrap; justify-content: flex-end; max-width: 60%; }
.ga-zr select, .ga-zr input { max-width: 100%; }
.ga-fuss { margin: 6px 2px; font-size: 12px; line-height: 1.45; }
.ga-knoepfe { display: flex; flex-wrap: wrap; gap: 8px; margin: 10px 0; } .ga-knoepfe .knopf { flex: 1 1 auto; }
.ga-alt { color: var(--ink2); text-decoration: line-through; text-decoration-color: rgba(127,127,127,.6); overflow-wrap: anywhere; }
.ga-abw { font-size: 11px; padding: 1px 7px; border-radius: 8px; background: color-mix(in srgb, var(--amber) 20%, transparent); color: var(--amber); white-space: nowrap; }
.ga-frei { margin: 4px 0; max-width: 100%; box-sizing: border-box; }
.ga-fertig { padding: 18px; text-align: center; } .ga-rueck-fehler { margin-top: 6px; } .ga-gross { font-size: 40px; color: #30d158; }
.ga-vorschau-c { padding: 8px 14px; margin: 8px 0; }
.ga-vz { display: grid; grid-template-columns: minmax(90px, 1fr) 2fr; gap: 8px; padding: 5px 0; border-top: 1px solid rgba(120,120,128,.15); align-items: baseline; }
.ga-vz code { word-break: break-all; }
`;
