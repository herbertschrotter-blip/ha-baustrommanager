// Container-Inventar mit Lit (BSM-031.07, Mockup inventar.html Variante 1, abgenommen 08.10.2026): Einstellungen ›
// 📦 Inventar mit Liste, Container, Anlegen eigen/fremd, Gerät zuordnen und Vorschau als Tabelle (Was / Alt / Neu /
// Zustand) mit Übernehmen, Nachholen und Rückgängig. Namen, Nummern, Labels, Schritte, Konflikte und Verweise kommen
// fertig von der Integration (baustelle/inventar*, docs/api-0.7.md §10); die Seite zeigt nur an und schickt Befehle.
import { html, nothing } from 'lit';

const GRIFF = html`<div class="griff"></div>`;
const knopf = (t, fn, art = '', k = '') => html`<button class="knopf ${art}" data-k=${k || nothing} @click=${fn}>${t}</button>`;
const IC = { PLUG: '🔌', HZ: '♨', TEMP: '🌡', DOOR: '🚪', FEN: '🪟', PUMP: '💧', BTR: '💨' };
const ST_TEXT = { aktiv: '● aktiv', inaktiv: '○ inaktiv', verliehen: '↗ verliehen', defekt: '✕ defekt' };   // BSM-034.02: wie das Gerät
const ST_WEITER = { aktiv: 'inaktiv', inaktiv: 'verliehen', verliehen: 'defekt', defekt: 'aktiv' };
const HAENGT = [['konvektor', 'Konvektor'], ['radiator', 'Radiator'], ['bautrockner', 'Bautrockner'], ['nichts', 'nichts']];
const FILTER = [['alle', 'Alle'], ['eigen', 'Eigen'], ['fremd', 'Fremd'], ['ausgeschieden', 'Ausgeschieden']];
const datum = iso => iso ? new Date(iso).toLocaleDateString('de-AT', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '';

/* Baustelle und Bereich eines Einsatzes (aus der Struktur aller Baustellen) */
function ort(p, e) {
  if (!e) return '';
  const b = (p.roh || []).find(x => x.baustelle && x.baustelle.entry_id === e.baustelle_id), bs = b ? b.baustelle.titel : 'andere Baustelle';
  const ber = b && e.bereich_id ? (b.bereiche || []).find(x => x.id === e.bereich_id) : null;
  return bs + (ber ? ' › ' + ber.name : '');
}
const sichtbar = (I, f) => I.container.filter(c => f === 'ausgeschieden' ? c.status === 'ausgeschieden' : c.status === 'aktiv' && (f === 'alle' || f === (c.eigen ? 'eigen' : 'fremd')));
const statusChip = (p, a) => html`<button class="inv-st ${a.status} nur-admin" title="Status ändern (aktiv → inaktiv → verliehen → defekt)"
    @click=${p.nurAdmin(() => p.invSenden({ aktion: 'ausruestung_status', ausruestung_id: a.id, status: ST_WEITER[a.status] || 'aktiv' }, `Status: ${ST_WEITER[a.status] || 'aktiv'}`))}>${ST_TEXT[a.status] || a.status}</button>`;

/* ---------- Chip „Namen ✓ / ⚠ n weichen ab / Nicht im Inventar“ ----------
   Am Container-Kopf, in „Bearbeiten“, in „Gerät bearbeiten“ und in ⚙ › Geräte. Container und Zahl liefert die Integration
   (baustelle/struktur bereiche[].namen, logik/inventar.abweichend = „Übernehmen (n)“ der Vorschau); die Seite zeigt nur an.
   Antippen öffnet die Vorschau „In Home Assistant einheitlich benennen“ bzw. das Aufnehmen ins Inventar; Schließen führt
   dorthin zurück, wo der Chip stand. `kopf`: im Container-Kopf als ck-chip (kurz am Handy). */
export function namenChip(p, b, kopf = false) {
  const N = b && b.namen; if (!N) return nothing;
  const zurueck = p.s.sheet || null;
  const inhalt = (ic, lang, kurz) => kopf ? html`<span class="ck-ic">${ic}</span><span class="ck-l">${lang}</span><span class="ck-k">${kurz}</span>` : html`${ic} ${lang}`;
  const art = kopf ? 'ck-chip' : 'chip glas-panel';
  if (!N.container_id) return html`<button class="${art} nm-chip nm-ohne nur-admin" data-k="namen" title=${p.nurLesen() ? NUR_AUFNEHMEN : 'Ins Inventar aufnehmen – danach lassen sich die Namen in Home Assistant einheitlich benennen'}
      @click=${p.nurAdmin(() => p.invAuf({ art: 'inv-neu', form: { eigen: true, art: 'MAN', bereich_id: b.id, nr: '' }, zurueck }))}>${inhalt('📦', 'Nicht im Inventar – aufnehmen ›', 'aufnehmen ›')}</button>`;
  if (N.abweichend === null || N.abweichend === undefined) return nothing;   // Baustelle nicht geladen – keine Zahl
  const ok = !N.abweichend;
  return html`<button class="${art} nm-chip ${ok ? 'nm-ok' : 'nm-ab amber-t'}" data-k="namen" data-n=${N.abweichend} title="In Home Assistant einheitlich benennen · ${N.container}"
      @click=${() => p.invAuf({ art: 'inv-vorschau', id: N.container_id, zurueck })}>${ok ? inhalt('✓', 'Namen ✓', 'Namen ✓') : inhalt('⚠', `${N.abweichend} weichen ab`, `${N.abweichend} ab`)}</button>`;
}
const NUR_ADMINS = 'Übernehmen dürfen nur Admins – du siehst die Vorschau', NUR_AUFNEHMEN = 'Ins Inventar aufnehmen dürfen nur Admins';
/* Rechte: wer nicht übernehmen darf, liest es am Knopf (statt eines grauen Knopfs ohne Grund) */
const rechteHinweis = (p, t = NUR_ADMINS) => p.nurLesen() ? html`<div class="leise amber-t inv-p nm-rechte">🔒 ${t}</div>` : nothing;
const benennenText = (p, c) => { const b = c && c.einsatz && p.d.bereiche.find(x => x.id === c.einsatz.bereich_id), n = b && b.namen && b.namen.abweichend;
  return `In Home Assistant einheitlich benennen …${n ? ` · ⚠ ${n}` : b && b.namen && n === 0 ? ' · ✓' : ''}`; };

/* ---------- Gruppe der Einstellungen ---------- */
export function invGruppeVorlage(p) {
  const I = p.invDaten(), C = I ? sichtbar(I, 'alle') : [];
  const kurz = I === undefined ? 'lädt …' : !I ? 'Datenbank nicht erreichbar' : `${C.length} Container · ${C.filter(c => !c.eigen).length} fremd · ${C.reduce((s, c) => s + c.ausruestung.length, 0)} Geräte`;
  return { k: 'inventar', ic: '📦', t: 'Inventar', kurz, inhalt: () => invInhalt(p, I) };
}

function invInhalt(p, I) {
  if (I === undefined) return html`<div class="glas-panel liste inv-liste"><div class="leer">Inventar lädt …</div></div>`;
  if (!I) return html`<div class="glas-panel liste inv-liste"><div class="leer">${p.invFehler() || 'Das Inventar braucht die Datenbank – sie ist gerade nicht erreichbar.'}</div></div>`;
  const f = p.s.invFilter || 'alle', C = sichtbar(I, f), hier = I.bereiche_ohne.filter(b => b.baustelle_id === p.d.entry);
  const zeile = c => html`<button class="zeile inv-c" data-id=${c.id} @click=${() => p.invAuf({ art: 'inv-container', id: c.id })}><div class="inv-c-t"><b class="inv-id">${c.name}</b>${c.eigen ? nothing : html`<span class="badge">fremd${(I.firmen.find(x => x.kuerzel === c.firma_kuerzel) || {}).name ? ' · ' + I.firmen.find(x => x.kuerzel === c.firma_kuerzel).name : ''}</span>`}
      <div class="leise">${c.art_label} · ${c.status === 'aktiv' ? ort(p, c.einsatz) || 'ohne Einsatz' : 'ausgeschieden'}</div></div>
      <span class="leise inv-zahl">${c.nicht_in_ha ? html`<span class="amber-t">${c.nicht_in_ha} nicht in HA</span> · ` : nothing}${c.ausruestung.length} ${c.ausruestung.length === 1 ? 'Gerät' : 'Geräte'}</span><span class="chev">›</span></button>`;
  return html`<div class="seg glas-panel inv-filter">${FILTER.map(([k, t]) => html`<button data-v=${k} class=${f === k ? 'on' : ''} @click=${() => { p.s.invFilter = k; p.neuZeichnen(); }}>${t} <span class="leise">${sichtbar(I, k).length}</span></button>`)}</div>
    <div class="glas-panel liste inv-liste"><div class="gruppe">${FILTER.find(x => x[0] === f)[1]} · ${C.length}</div>${C.length ? C.map(zeile) : html`<div class="leer">Keine Container</div>`}
      ${f !== 'ausgeschieden' ? html`<button class="zeile nur-admin" data-k="neu" @click=${p.nurAdmin(() => p.invAuf({ art: 'inv-neu', form: { eigen: true, art: 'MAN' } }))}><span class="blau">+ Container anlegen</span></button>` : nothing}</div>
    ${hier.length && f !== 'ausgeschieden' ? html`<div class="glas-panel liste inv-liste"><div class="gruppe">Noch nicht im Inventar · ${p.d.titel}</div>
      ${hier.map(b => html`<button class="zeile nur-admin inv-bestand" data-id=${b.id} @click=${p.nurAdmin(() => p.invAuf({ art: 'inv-neu', form: { eigen: true, art: 'MAN', bereich_id: b.id, nr: '' } }))}><div><b>${b.name}</b><div class="leise">Container der Baustelle – mit Shellys, Fühler und Tür übernehmen</div></div><span class="leise">übernehmen ›</span></button>`)}</div>` : nothing}
    ${I.ausruestung_frei.length && f !== 'ausgeschieden' ? html`<div class="glas-panel liste inv-liste"><div class="gruppe">Ausrüstung ohne Container · ${I.ausruestung_frei.length}</div>
      ${I.ausruestung_frei.map(a => html`<div class="zeile"><div><b>${IC[a.typ] || ''} ${a.typ_label}</b><div class="leise">${a.modell || ''}</div></div>${statusChip(p, a)}</div>`)}</div>` : nothing}
    <div class="leise p-fuss">Nummern eigener Container gelten für die ganze Firma und werden nie neu vergeben. Fremdcontainer heißen nach Firmenkürzel und Nummer je Baustelle; verlassen sie die Baustelle, scheiden sie aus – ihre Daten bleiben bei der Baustelle.</div>`;
}

/* ---------- Einblendung: Container ---------- */
function containerSheet(p, s) {
  const I = p.invDaten(), c = I && I.container.find(x => x.id === s.id);
  if (!c) return html`${GRIFF}<div class="leer">${I === undefined ? 'lädt …' : 'Container nicht gefunden'}</div>${knopf('Schließen', () => p.schliessen(), 'leise-k')}`;
  const aktiv = c.status === 'aktiv', firma = I.firmen.find(x => x.kuerzel === c.firma_kuerzel);
  const hier = c.einsatz && c.einsatz.baustelle_id === p.d.entry && p.d.bereiche.find(x => x.id === c.einsatz.bereich_id);   // M12: Bereich dieser Baustelle → Assistent
  const zeileA = a => html`<div class="zeile"><div class="inv-g"><b class="inv-id">${a.name || a.typ_label}</b>${a.nicht_in_ha ? html` <span class="amber-t inv-fremd" title="Steht im Inventar, Home Assistant ordnet es diesem Container aber nicht zu – ✕ nimmt es heraus">nicht in HA</span>` : nothing}<div class="leise">${IC[a.typ] || ''} ${a.modell || ''} · ${a.typ_label}${a.gg ? ' · GG ' + String(a.gg).padStart(2, '0') : ''}</div></div>
      ${statusChip(p, a)}${aktiv ? html`<button class="inv-x nur-admin" title="Aus dem Container nehmen (wird frei)" @click=${p.nurAdmin(() => p.invSenden({ aktion: 'ausruestung_entfernen', ausruestung_id: a.id }, 'Aus dem Container genommen'))}>✕</button>` : nothing}</div>`;
  return html`${GRIFF}<div class="block-kopf"><h3 class="inv-id inv-gross">${c.name}</h3></div>
    <div class="leise inv-unterzeile">${c.art_label} · ${c.eigen ? 'eigener Container · Nr. ' + String(c.nr).padStart(3, '0') : `Fremdcontainer · ${firma ? firma.name : ''} (${c.firma_kuerzel})`}${aktiv ? '' : ' · ausgeschieden'}</div>
    <div class="glas-panel liste inv-liste"><div class="gruppe">Einsatz</div><div class="zeile"><span>${aktiv ? ort(p, c.einsatz) || 'ohne Einsatz' : 'keiner'}</span><span class="leise">${c.einsatz ? 'seit ' + datum(c.einsatz.von) : ''}</span></div>
      <div class="zeile"><span>Labels</span><span class="leise">${c.labels.join(', ')}</span></div></div>
    <div class="glas-panel liste inv-liste"><div class="gruppe">Ausrüstung · ${c.ausruestung.length}${c.nicht_in_ha ? html` · <span class="amber-t">${c.nicht_in_ha} nicht in HA</span>` : nothing}</div>${c.ausruestung.length ? c.ausruestung.map(zeileA) : html`<div class="leer">Noch keine Ausrüstung</div>`}
      ${aktiv ? html`<button class="zeile nur-admin" data-k="zuordnen-auf" @click=${p.nurAdmin(() => hier ? p.assistentAuf({ bid: hier.id, vorgabe: true }) : p.invAuf({ art: 'inv-zuordnen', id: c.id, haengt: 'konvektor' }))}><span class="blau">+ Gerät zuordnen</span>${hier ? html`<span class="leise">Assistent</span>` : nothing}</button>` : nothing}</div>
    <div class="glas-panel liste inv-liste"><div class="gruppe">Geschichte</div>${c.geschichte.slice().reverse().map(e => html`<div class="zeile"><span>${ort(p, e)}</span><span class="leise">${e.bis ? datum(e.von) + ' – ' + datum(e.bis) : 'seit ' + datum(e.von)}</span></div>`)}</div>
    ${aktiv && c.einsatz && c.einsatz.bereich_id ? html`${knopf(benennenText(p, c), () => p.invAuf({ art: 'inv-vorschau', id: c.id }), 'amber', 'pruefen')}${knopf('Rückgängig …', p.nurAdmin(() => p.invAuf({ art: 'inv-vorschau', id: c.id, rueck: true })), 'nur-admin', 'rueck')}` : nothing}
    ${aktiv ? (s.sicher ? knopf(`${c.name} wirklich ausscheiden`, p.nurAdmin(() => p.invSenden({ aktion: 'container_status', container_id: c.id, status: 'ausgeschieden' }, 'Ausgeschieden', true)), 'rot nur-admin', 'ausscheiden')
      : knopf('Ausscheiden …', p.nurAdmin(() => { s.sicher = true; p.neuZeichnen(); }), 'leise-k nur-admin', 'ausscheiden')) : nothing}
    ${knopf('Schließen', () => p.schliessen(), 'leise-k')}`;
}

/* ---------- Einblendung: Container anlegen ---------- */
function anlegenSheet(p, s) {
  const I = p.invDaten(), f = s.form, z = () => p.neuZeichnen();
  if (!I) return html`${GRIFF}<div class="leer">lädt …</div>`;
  const firmen = I.firmen.filter(x => x.baustelle_id === p.d.entry && !x.eigen), fi = firmen.find(x => x.id === f.firma_id);
  const hier = I.bereiche_ohne.filter(b => b.baustelle_id === p.d.entry);
  return html`${GRIFF}<h3>Container anlegen</h3><div class="leise inv-unterzeile">auf ${p.d.titel} · Name und Nummer vergibt die Integration</div>
    <div class="seg klein inv-seg">${[[true, 'Eigener'], [false, 'Fremdcontainer']].map(([w, t]) => html`<button class=${f.eigen === w ? 'on' : ''} @click=${() => { f.eigen = w; z(); }}>${t}</button>`)}</div>
    <div class="feld">Art<div class="inv-arten">${Object.entries(I.arten).map(([k, t]) => html`<button class="inv-art ${f.art === k ? 'on' : ''}" data-v=${k} @click=${() => { f.art = k; z(); }}><b>${k}</b><span>${t}</span></button>`)}</div></div>
    ${f.eigen ? html`<div class="zeile inv-feldzeile"><div><b>Nummer</b><div class="leise">${f.bereich_id ? 'Bestand: bisherige Nummer behalten (frei lassen = nächste freie)' : 'nächste freie für die ganze Firma – nie doppelt'}</div></div>
        ${f.bereich_id ? html`<input class="inv-nr" type="number" min="1" max="999" placeholder=${String(I.naechste_nr).padStart(3, '0')} .value=${f.nr || ''} @input=${e => { f.nr = e.target.value; }}>` : html`<b class="inv-id inv-riesig">${String(I.naechste_nr).padStart(3, '0')}</b>`}</div>`
      : html`<label class="feld">Firma<select @change=${e => { f.firma_id = e.target.value; z(); }}><option value="">– wählen –</option>${firmen.map(x => html`<option value=${x.id} ?selected=${x.id === f.firma_id}>${x.name}${x.kuerzel ? ` (${x.kuerzel})` : ''}</option>`)}</select></label>
        ${fi && !fi.kuerzel ? html`<label class="feld">Firmenkürzel (2–5 Buchstaben)<input .value=${f.kuerzel || ''} @input=${e => { f.kuerzel = e.target.value; }}></label>` : nothing}
        ${firmen.length ? nothing : html`<div class="leise inv-p">Zuerst die Firma unter Einstellungen › Firmen anlegen</div>`}`}
    <label class="feld">Bereich der Baustelle<select @change=${e => { f.bereich_id = e.target.value || null; z(); }}><option value="">– keiner (nur Inventar) –</option>${hier.map(b => html`<option value=${b.id} ?selected=${b.id === f.bereich_id}>${b.name}</option>`)}</select></label>
    ${knopf(f.bereich_id ? 'Anlegen und einheitlich benennen …' : 'Anlegen', p.nurAdmin(() => p.invAnlegen(f, fi)), 'amber nur-admin', 'anlegen')}${rechteHinweis(p, 'Anlegen dürfen nur Admins')}${knopf('Abbrechen', () => p.schliessen(), 'leise-k')}`;
}

/* ---------- Einblendung: Gerät zuordnen ---------- */
function zuordnenSheet(p, s) {
  const I = p.invDaten(), c = I && I.container.find(x => x.id === s.id), K = p.invKandidaten(), z = () => p.neuZeichnen();
  if (!c) return html`${GRIFF}<div class="leer">lädt …</div>`;
  const wahl = K && K.find(k => k.device_id === s.wahl);
  return html`${GRIFF}<h3>Gerät zuordnen</h3><div class="leise inv-unterzeile">zu <span class="inv-id">${c.name}</span> · ${ort(p, c.einsatz)}</div>
    <div class="glas-panel liste inv-liste"><div class="gruppe">Geräte in Home Assistant</div>
      ${K === undefined ? html`<div class="leer">lädt …</div>` : !K || !K.length ? html`<div class="leer">Keine freien Geräte</div>`
        : K.map(k => html`<button class="zeile" data-id=${k.device_id} @click=${() => { if (k.status === 'defekt') return; s.wahl = k.device_id; z(); }}><div><b>${IC[k.typ] || ''} ${k.name}</b><div class="leise">${k.modell || ''}${k.status === 'defekt' ? ' · defekt – nicht zuordenbar' : ''}${k.verwendet ? ' · heute in ' + k.verwendet : ''}</div></div><span class=${s.wahl === k.device_id ? 'blau' : 'leise'}>${k.status === 'defekt' ? '–' : s.wahl === k.device_id ? '✓' : '○'}</span></button>`)}
      <div class="zeile"><span class="leise">Neue Shellys und Fühler erscheinen hier, sobald Home Assistant sie kennt</span></div></div>
    ${wahl && wahl.typ === 'PLUG' ? html`<div class="feld">Was hängt an diesem Plug?<div class="seg klein inv-seg">${HAENGT.map(([k, t]) => html`<button class=${s.haengt === k ? 'on' : ''} data-v=${k} @click=${() => { s.haengt = k; z(); }}>${t}</button>`)}</div></div>` : nothing}
    ${knopf('Zuordnen und einheitlich benennen …', () => p.invZuordnenVorschau(c, s), 'amber', 'zuordnen')}
    <div class="leise inv-p">Zuerst die Vorschau der Namen – zugeordnet und umbenannt wird erst nach dem Bestätigen.</div>${knopf('Abbrechen', () => p.invAuf({ art: 'inv-container', id: c.id }), 'leise-k')}`;
}

/* ---------- Einblendung: Vorschau (Tabelle) mit Übernehmen, Nachholen, Rückgängig ---------- */
const MARKE = { gleich: html`<span class="inv-m leise">= unverändert</span>`, neu: html`<span class="inv-m gruen-t">+ neu</span>`, aendern: html`<span class="inv-m leise">ändern</span>`,
  konflikt: html`<span class="inv-m rot-t">✕ Konflikt</span>`, ok: html`<span class="inv-m gruen-t">✓ erledigt</span>`, fehler: html`<span class="inv-m amber-t">◐ offen</span>`,
  entfaellt: html`<span class="inv-m leise">– entfällt</span>`, weg: html`<span class="inv-m rot-t">− entfernen</span>` };
const wert = w => w === null || w === undefined || w === '' ? html`<span class="leise">–</span>` : html`<span class="inv-w ${/^[a-z_]+\.[a-z0-9_]+$/.test(w) ? 'inv-id' : ''}">${w}</span>`;
function zustand(r) {
  if (r.ergebnis && r.ergebnis !== 'gleich') return r.ergebnis;
  if (r.ziel === 'label' && !r.neu) return r.zustand === 'gleich' ? 'gleich' : 'weg';
  return r.zustand;
}

function vorschauSheet(p, s) {
  const I = p.invDaten(), c = I && I.container.find(x => x.id === s.id), rueck = !!s.rueck, erg = s.ergebnis, Z = s.zuordnen;
  const V = erg ? erg : rueck ? p.invRueckVorschau(s.id) : Z ? p.invZuordnenDaten(s.id, Z) : p.invVorschau(s.id);
  // zurück: dorthin, wo der Chip stand (Container, Bearbeiten, Gerät) – sonst zum Inventar-Container; Zuordnen: zur Auswahl
  const zu = () => Z ? p.invAuf({ art: 'inv-zuordnen', id: s.id, wahl: Z.device_id, haengt: Z.haengt }) : s.zurueck !== undefined ? p.schliessen() : p.invAuf({ art: 'inv-container', id: s.id });
  const halb = erg && (erg.status === 'teilweise' || erg.status === 'zurueck_teilweise');
  const titel = erg ? (rueck ? (halb ? 'Teilweise zurückgenommen' : 'Zurückgenommen') : halb ? 'Teilweise erledigt' : 'Erledigt') : rueck ? 'Umbenennung zurücknehmen' : 'In Home Assistant einheitlich benennen';
  const kopf = html`${GRIFF}<div class="block-kopf"><h3>${titel}</h3></div><div class="leise inv-unterzeile"><span class="inv-id">${c ? c.name : ''}</span> · ${rueck ? 'neu → alt, in umgekehrter Reihenfolge' : Z ? `${Z.name || 'Gerät'} wird zugeordnet · alt → neu, gruppiert nach Gerät` : 'alt → neu, gruppiert nach Gerät'}</div>`;
  if (s.laeuft) return html`${kopf}<div class="glas-panel liste inv-liste"><div class="leer nm-laeuft">${s.laeuft}</div></div>${knopf('Warten abbrechen – Namen lassen', () => p.invWartenAbbrechen(s), 'leise-k', 'warten-abbrechen')}`;   // nach dem Zuordnen: wartet aufs Neu-Laden
  if (V === undefined) return html`${kopf}<div class="glas-panel liste inv-liste"><div class="leer">Vorschau lädt …</div></div>${knopf('Schließen', zu, 'leise-k')}`;
  if (!V) return html`${kopf}<div class="glas-panel liste inv-liste"><div class="leer">${p.invFehler(rueck ? 'invr:' + s.id : Z ? p.invZuordnenSchluessel(s.id, Z) : 'invv:' + s.id) || 'Keine Vorschau'}</div></div>${knopf('Schließen', zu, 'leise-k')}`;
  const S = V.schritte || [], offen = S.filter(r => !['gleich', 'ok', 'entfaellt'].includes(zustand(r)));
  const kon = Object.keys(V.konflikte || {}).length, gruppen = [...new Set(S.map(r => r.gruppe || ''))];
  const zahlen = html`<div class="inv-zahlen"><span class="chip glas-panel">${rueck ? '↶' : '✎'} ${offen.length} ${rueck ? 'Schritte zurück' : offen.length === 1 ? 'Änderung' : 'Änderungen'}</span>
    ${S.length - offen.length ? html`<span class="chip glas-panel">= ${S.length - offen.length} ${erg ? 'erledigt oder gleich' : 'unverändert'}</span>` : nothing}${kon ? html`<span class="chip glas-panel rot-t">✕ ${kon} Konflikt</span>` : nothing}</div>`;
  const verweise = (V.verweise || []).length ? html`<div class="glas-panel liste inv-liste inv-warn"><div class="zeile"><div><b class="amber-t">⚠ ${V.verweise.length} ${V.verweise.length === 1 ? 'Eintrag nennt' : 'Einträge nennen'} alte Entity-IDs</b><div class="leise">Home Assistant passt eigene Automationen, Skripte und Dashboards nicht an – danach dort die neue ID eintragen. Verlauf und Statistik ziehen mit.</div></div></div>
    ${V.verweise.map(v => html`<div class="zeile"><div class="inv-g"><b>${v.name}</b><div class="leise">${v.art} · <span class="inv-id">${v.alt}</span> → <span class="inv-id">${v.neu}</span></div></div></div>`)}</div>` : nothing;
  const tabelle = gruppen.map(g => { const R = S.filter(r => (r.gruppe || '') === g);
    return html`<div class="glas-panel liste inv-liste inv-gruppe"><div class="inv-g-kopf"><b class="inv-id">${g || '–'}</b></div>
      <div class="inv-tr inv-th"><span class="t-was">Was</span><span class="t-alt">Alt</span><span class="t-neu">Neu</span><span class="t-m">Zustand</span></div>
      ${R.map(r => { const st = zustand(r); return html`<div class="inv-tr ${st}"><span class="t-was">${r.was}</span><span class="t-alt">${wert(r.alt)}</span><span class="t-neu">${st === 'gleich' ? html`<span class="leise">=</span>` : wert(r.neu)}</span><span class="t-m">${MARKE[st] || st}</span>
        ${r.fehler ? html`<span class="inv-hinweis amber-t">${r.fehler}</span>` : st === 'konflikt' ? html`<span class="inv-hinweis rot-t">${r.neu} ist schon vergeben – Schritt bleibt aus, bis sie umbenannt oder gelöscht ist</span>` : nothing}</div>`; })}</div>`; });
  let ende;
  if (erg) ende = html`${halb ? html`<div class="leise amber-t inv-p">${rueck ? 'Nochmal „Zurücknehmen“ holt den Rest nach.' : 'Fehlende Schritte holt „Nachholen“ – Plug-Namen auch die Integration selbst, sobald der Plug erreichbar ist.'}</div>
      ${knopf(rueck ? 'Rest zurücknehmen' : 'Nachholen', p.nurAdmin(() => p.invAusfuehren({ ...s, zuordnen: null })), 'amber nur-admin', 'ausfuehren')}${rechteHinweis(p)}` : nothing}${knopf('Schließen', () => s.zurueck !== undefined ? p.schliessen() : p.invAuf({ art: 'inv-container', id: s.id }), 'leise-k')}`;
  else if (Z && V.zuordnen && V.zuordnen.eingetragen === false) ende = html`<div class="glas-panel liste inv-liste inv-warn"><div class="zeile"><div><b class="amber-t">⚠ Nicht am Container eingetragen</b><div class="leise">${V.zuordnen.hinweis || ''}</div></div></div></div>
    ${knopf('Nur zuordnen, Namen lassen', p.nurAdmin(() => p.invZuordnenAusfuehren(s, false)), 'amber nur-admin', 'nur-zuordnen')}${rechteHinweis(p)}
    ${knopf('Zurück', zu, 'leise-k')}`;   // Regel der Integration (sensor_verdrahtung): z. B. zweiter Fühler – nichts umzubenennen
  else if (Z) ende = html`${knopf(kon ? 'Erst den Konflikt lösen' : `Zuordnen und umbenennen (${offen.length})`, p.nurAdmin(() => kon ? p.toast('Erst den Konflikt lösen – oder nur zuordnen') : p.invZuordnenAusfuehren(s, true)), `amber nur-admin ${kon ? 'aus' : ''}`, 'ausfuehren')}
    ${knopf('Nur zuordnen, Namen lassen', p.nurAdmin(() => p.invZuordnenAusfuehren(s, false)), 'nur-admin', 'nur-zuordnen')}${rechteHinweis(p)}
    <div class="leise inv-p">nur Admins · zugeordnet wird erst jetzt · danach wie beim Umbenennen: das Schalten des Containers pausiert kurz, die Automatik bleibt an</div>
    ${knopf('Zurück', zu, 'leise-k')}`;
  else ende = html`${knopf(rueck ? 'Zurücknehmen' : offen.length ? `Übernehmen (${offen.length})` : 'Alles nach Schema', p.nurAdmin(() => (kon || !offen.length) ? p.toast(kon ? 'Erst den Konflikt lösen' : 'Nichts zu tun') : p.invAusfuehren(s)), `amber nur-admin ${kon || !offen.length ? 'aus' : ''}`, 'ausfuehren')}
    ${!rueck ? knopf('Rückgängig …', p.nurAdmin(() => p.invAuf({ art: 'inv-vorschau', id: s.id, rueck: true, zurueck: s.zurueck })), 'nur-admin', 'rueck') : nothing}${rechteHinweis(p)}
    <div class="leise inv-p">nur Admins · das Schalten des Containers pausiert dafür kurz, die Automatik bleibt an${rueck ? ' · nur die jüngste Umbenennung des Containers' : ' · Verweise der Integration (Schalter, Leistung, Energie, Fühler, Tür) ziehen mit, der Bereich bleibt'}</div>
    ${knopf('Abbrechen', zu, 'leise-k', 'abbrechen')}`;
  return html`${kopf}${zahlen}${verweise}<div class="inv-inhalt">${tabelle}</div>${!erg && V.hinweis ? html`<div class="leise inv-p">${V.hinweis}</div>` : nothing}${ende}`;
}

export const INVENTAR_EINBLENDUNGEN = { 'inv-container': containerSheet, 'inv-neu': anlegenSheet, 'inv-zuordnen': zuordnenSheet, 'inv-vorschau': vorschauSheet };
export const INV_BREIT = ['inv-vorschau'];

export const INV_CSS = `
.inv-id { font-family: ui-monospace, "SF Mono", Menlo, Consolas, monospace; font-size: 13px; letter-spacing: .2px; overflow-wrap: anywhere; }
.inv-gross { font-size: 20px; } .inv-riesig { font-size: 18px; font-weight: 600; color: var(--ink); }
.inv-unterzeile { padding: 0 4px 6px; } .inv-p { padding: 6px 4px; }
.inv-filter .leise { font-size: 11px; } .inv-filter button { flex: 1 1 auto; min-width: 0; padding: 7px 4px; }
.inv-c { text-align: left; } .inv-c-t { flex: 1; min-width: 0; } .inv-c .badge { margin-left: 6px; } .inv-zahl { white-space: nowrap; }
.inv-g { min-width: 0; flex: 1; }
.inv-st { font-size: 12px; padding: 3px 10px !important; border-radius: 12px !important; white-space: nowrap; background: rgba(120,120,128,.18) !important; flex: none; }
.inv-st.aktiv { color: #30d158; } .inv-st.inaktiv { color: var(--leise, #8e8e93); } .inv-st.verliehen { color: var(--blau); } .inv-st.defekt { color: var(--rot); }
.inv-x { flex: none; padding: 3px 8px !important; color: var(--ink2) !important; background: none !important; }
.inv-arten { display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px; }
.inv-art { display: flex; flex-direction: column; align-items: center; gap: 1px; padding: 7px 4px !important; border-radius: 12px !important; background: rgba(120,120,128,.18) !important; color: var(--ink) !important; text-align: center !important; }
.inv-art span { font-size: 11px; color: var(--ink2); } .inv-art.on { outline: 2px solid var(--amber); }
.inv-seg button { flex: 1; } .inv-feldzeile { align-items: center; } .inv-nr { width: 80px; text-align: right; }
.inv-zahlen { display: flex; flex-wrap: wrap; gap: 6px; }
.inv-liste .zeile { padding: 8px 16px; } .inv-warn .zeile { align-items: flex-start; }
.inv-g-kopf { padding: 8px 14px 4px; }
.inv-tr { display: grid; grid-template-columns: minmax(90px, 1.1fr) 1.6fr 1.6fr minmax(84px, .8fr); gap: 8px; padding: 6px 14px; font-size: 13px; align-items: start; border-top: 1px solid rgba(120,120,128,.15); }
.inv-th { color: var(--ink2); font-size: 11px; text-transform: uppercase; letter-spacing: .4px; border-top: none; }
.inv-tr .inv-w { overflow-wrap: anywhere; min-width: 0; } .inv-tr > span { min-width: 0; }
.inv-tr.gleich { opacity: .55; } .inv-tr.konflikt { background: rgba(255,69,58,.08); }
.inv-hinweis { grid-column: 1 / -1; font-size: 12px; }
.inv-m { white-space: nowrap; font-size: 12px; }
.knopf.aus { opacity: .5; }
.nm-chip { white-space: nowrap; } .chip.nm-chip { font-size: 12px; padding: 4px 10px; } .nm-ok { color: var(--gruen, #30d158); }
.nm-zeile { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; padding: 2px 4px 8px; }
@container (max-width: 520px) {
  .inv-tr { grid-template-columns: 1fr 1fr; } .inv-tr .t-was { grid-column: 1 / -1; color: var(--ink2); font-size: 12px; } .inv-th { display: none; }
  .inv-arten { grid-template-columns: repeat(2, 1fr); }
}
@container (min-width: 700px) { .sheet.breit { width: min(900px, calc(100% - 48px)); max-height: 88%; } }
`;
