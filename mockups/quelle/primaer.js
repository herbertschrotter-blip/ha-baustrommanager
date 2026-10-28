// AN-0015: Vorschlag „Primärheizkörper je Container statt Zusatz-Häkchen am Gerät“ auf Basis des Master-Mockups.
// Baut mockups/primaer.html: node mockups/quelle/primaer.js   ·   prüfen: node mockups/quelle/vorschau/pruefen.cjs mockups/primaer.html
//
// Heute: Häkchen „🔥 Zusatz-Heizkörper“ im ✎ Gerät, Haupt = alle nicht markierten (bei 3 Heizkörpern mehrdeutig).
// Vorschlag: der Container bestimmt genau einen Primärheizkörper (ohne Wahl der erste), alle anderen sind Zusatz.
//   A  Auswahlliste „★ Primärheizkörper“ im Dialog „Bearbeiten“ direkt unter „Zusatz nur bei Bedarf“
//   B  Stern ★ an jedem Heizkörper in der Geräteliste desselben Dialogs (antippen = primär)
// In beiden: ✎ Gerät zeigt die Rolle nur noch an (Primär / Zusatz), die Container-Ansicht zeigt „★ Primär“ statt „Haupt“.
// Daten: echte Seite mit Beispieldaten, Poliercontainer mit 2 oder 3 Heizkörpern (der dritte ist ein Beispielgerät);
// die Integration liefert laufzeit.container.<id>.stufen (haupt = [Primär], zusatz = Rest) wie heute.
// Bilder: node mockups/quelle/primaer.js --bilder <ordner>
const rahmen = require('./rahmen');

/* Läuft nur im Browser (als Text eingesetzt, Node führt es nie aus) */
function browser(R) {
  const { html, nothing } = R;
  const BID = 'polier', DRITTER = { id: 'polier_r3', name: 'Radiator 3', bereich: BID, schalter: 'switch.polier_r3', rolle: 'heizung', typ: 'konvektor',
    leistung: 'sensor.polier_r3_leistung', energie: 'sensor.polier_r3_energie', nenn_kw: 2 };
  const G = window.PRIM = { v: 'A', n: 2, stufen: true, lage: 'wartet', prim: '' };
  const heizer = b => (b ? b.geraete.filter(g => g.heizer) : []);
  const primVon = b => { const H = heizer(b); return H.find(g => g.id === G.prim) || H[0] || null; };   // ohne Wahl: der erste

  /* ---------- Beispieldaten: wie die Integration sie liefern würde (Struktur + Laufzeit) ---------- */
  function schreiben() {
    const B = window.baustelleBeispiel, w = B && B.welt && B.welt[0]; if (!w) return;
    w.geraete = w.geraete.filter(g => g.id !== DRITTER.id);
    if (G.n === 3) { const i = w.geraete.map(g => g.bereich).lastIndexOf(BID); w.geraete.splice(i + 1, 0, { ...DRITTER }); }
    const H = w.geraete.filter(g => g.bereich === BID && g.rolle === 'heizung'), prim = H.find(g => g.id === G.prim) || H[0];
    const lz = w.laufzeit, vorlage = lz.geraete.polier_r2 || {};
    if (G.n === 3) lz.geraete[DRITTER.id] = { ...vorlage, notprogramm: null };
    const zusatzAn = G.lage === 'an';
    let kw = 0;
    for (const g of H) { const an = !G.stufen || g === prim || zusatzAn; lz.geraete[g.id] = { ...lz.geraete[g.id], an, kw: an ? g.nenn_kw : 0 }; kw += an ? g.nenn_kw : 0; }
    w.einstellungen.bereiche = w.einstellungen.bereiche || {};
    w.einstellungen.bereiche[BID] = { ...(w.einstellungen.bereiche[BID] || {}), stufen: G.stufen, primaer: G.prim || null };   // Vorschlag: neues Feld „primaer“
    const c = lz.container[BID];
    c.kw = Math.round(kw * 100) / 100;
    c.stufen = { an: G.stufen, haupt: [prim.id], zusatz: H.filter(g => g !== prim).map(g => g.id), zusatz_an: G.stufen && zusatzAn,
      grund: G.stufen && zusatzAn ? 'weit_unter' : null, text: G.stufen && zusatzAn ? 'weit unter dem Soll' : '' };
    B.B.states[DRITTER.schalter] = { entity_id: DRITTER.schalter, state: 'on', attributes: { friendly_name: 'Radiator 3 polier' } };
    B.B.states[DRITTER.leistung] = { entity_id: DRITTER.leistung, state: '1980', attributes: { device_class: 'power' } };
  }
  const neuLaden = () => { schreiben(); window.baustelleBeispiel.hassNeu(); return Promise.all(R.P().map(q => { q.cache = {}; return q._laden(); })); };
  const waehle = id => { G.prim = id; const s = document.querySelector('select[data-r="primaer"]'); if (s) s.value = id || 'auto'; neuLaden(); };   // im Mockup gilt die Wahl gleich

  /* ---------- Dialog „Bearbeiten“: Zeile „Zusatz nur bei Bedarf“ + Primärheizkörper ---------- */
  const hinweisAus = html`<div class="leise p-hinweis">Alle heizen gemeinsam – Primär zählt erst mit „Zusatz nur bei Bedarf“.</div>`;
  R.vorlage({ merkmal: 'data-zeile="stufen"', fn: (t, p) => {
    const b = p.b, e = p.bereichEntwurf(b, p.s.sheet), H = heizer(b), P = primVon(b), schalter = t.values[0];
    const zusatz = H.filter(g => g !== P).map(g => g.n).join(', ');
    return html`${R.band(G.v === 'A' ? 'Variante A · Auswahlliste' : 'Variante B · Stern in der Geräteliste')}
      <div class="zeile" data-zeile="stufen"><div><b>🔥 Zusatz-Heizkörper nur bei Bedarf</b><div class="leise">zuerst heizt der Primärheizkörper; die anderen kommen bei Kälte, weit unter dem Soll oder wenn er es allein nicht schafft.</div></div>${schalter}</div>
      ${G.v === 'A' ? html`<label class="zeile p-prim ${e.stufen ? '' : 'p-aus'}" data-zeile="primaer"><div><b>★ Primärheizkörper</b>${R.marke}<div class="leise">${e.stufen ? `Zusatz: ${zusatz}` : 'heizt zuerst, sobald „Zusatz nur bei Bedarf“ an ist'}</div></div>
          <select @change=${ev => waehle(ev.target.value)}><option value="" ?selected=${!G.prim}>automatisch · ${H[0] ? H[0].n : '–'}</option>${H.map(g => html`<option value=${g.id} ?selected=${G.prim === g.id}>${g.n} · ${g.typ}</option>`)}</select></label>`
      : html`<div class="zeile p-prim ${e.stufen ? '' : 'p-aus'}" data-zeile="primaer"><div><b>★ Primär: ${P ? P.n : '–'}</b>${R.marke}<div class="leise">${G.prim ? '' : 'automatisch der erste · '}ändern mit ★ in der Geräteliste unten${e.stufen ? ` · Zusatz: ${zusatz}` : ''}</div></div></div>`}
      ${e.stufen ? nothing : hinweisAus}`; } });
  /* Variante B: Stern vor jedem Heizkörper der Geräteliste */
  R.vorlage({ merkmal: '<div class="ge-zeile" data-i=', wann: () => G.v === 'B', fn: (t, p) => {
    const b = p.b, g = b && b.geraete[t.values[0]]; if (!g || !g.heizer || heizer(b).length < 2) return undefined;
    const e = p.bereichEntwurf(b, p.s.sheet), ist = primVon(b) === g;
    return html`<div class="p-ge"><button class="p-stern ${ist ? 'on' : ''} ${e.stufen ? '' : 'p-aus'}" title=${ist ? 'Primärheizkörper' : 'als Primärheizkörper wählen'} aria-label="${g.n} ${ist ? 'ist primär' : 'primär machen'}" @click=${() => waehle(g.id)}>${ist ? '★' : '☆'}</button>${t}</div>`; } });

  /* ---------- ✎ Gerät: Rolle nur noch Anzeige ---------- */
  R.vorlage({ merkmal: 'data-zeile="zusatz"', fn: (t, p) => {
    const b = p.b, g = b && b.geraete[p.s.sheet.i]; if (!g) return undefined;
    const P = primVon(b), ist = P === g;
    const text = !b.stufenAn ? 'alle heizen gemeinsam – Primär zählt erst mit „Zusatz nur bei Bedarf“' : ist ? 'heizt zuerst; die anderen kommen nur bei Bedarf dazu' : `heizt dazu, wenn ${P.n} allein nicht reicht`;
    return html`<div class="zeile" data-zeile="rolle"><div><b>Rolle im Container</b>${R.marke}<div class="leise">${text} · festgelegt im Container unter Bearbeiten</div></div>
      <span class="p-rolle ${ist ? 'on' : ''}">${ist ? '★ Primär' : '🔥 Zusatz'}</span></div>`; } });

  /* ---------- Container-Ansicht: „★ Primär“ statt „Haupt“ ---------- */
  const tausche = (t, f) => { if (Array.isArray(t)) return t.forEach(x => tausche(x, f)); if (!t || !Array.isArray(t.values)) return;
    t.values.forEach((v, i) => { if (typeof v === 'string' && v === ' · Haupt') t.values[i] = f(); else tausche(v, f); }); };
  R.vorlage({ merkmal: 'class="c-chip glas-panel ', fn: t => { tausche(t, () => html` · <b class="p-prim-t">★ Primär</b>${R.marke}`); } });

  R.stil(`
.p-prim select { max-width: 52%; } .p-prim.p-aus > div, .p-prim.p-aus select { opacity: .55; }
.p-hinweis { padding: 2px 0 8px; color: var(--amber); }
.p-ge { display: flex; align-items: center; gap: 6px; } .p-ge > .ge-zeile { flex: 1; min-width: 0; }
.p-stern { flex: none; width: 34px; height: 34px; border-radius: 50%; border: 1px solid rgba(127,127,127,.35); background: transparent; color: var(--ink2); font-size: 18px; cursor: pointer; }
.p-stern.on { color: var(--amber); border-color: var(--amber); } .p-stern.p-aus { opacity: .55; }
.p-rolle { font-size: 13px; padding: 3px 10px; border-radius: 10px; background: rgba(120,120,128,.2); white-space: nowrap; } .p-rolle.on { color: var(--amber); }
.p-prim-t { color: var(--amber); font-weight: 600; }`);

  /* ---------- Vorführ-Leiste ---------- */
  R.vorfuehren(async w => {
    Object.assign(G, { v: w.variante, n: +w.heizkoerper, stufen: w.zusatz === 'an', lage: w.lage, prim: w.primaer === 'auto' ? '' : w.primaer });
    if (G.n === 2 && G.prim === DRITTER.id) G.prim = '';
    if (!window.baustelleBeispiel || !window.baustelleBeispiel.welt) return;
    await neuLaden();
    for (const q of R.P()) {
      if (!q.d) continue;
      q.s.sheet = null; q.containerOeffnen(BID);
      const b = q.b, H = heizer(b), P = primVon(b);
      if (w.zeigen === 'dialog') q.bereichEinst(BID);
      else if (w.zeigen === 'geraet-primaer' || w.zeigen === 'geraet-zusatz') {
        const g = w.zeigen === 'geraet-primaer' ? P : H.find(x => x !== P);
        q.geraetBearbeiten(b, b.geraete.indexOf(g));
      }
      q.neuZeichnen();
    }
  });
}

const V = [['A', 'A · Auswahlliste im Container-Dialog'], ['B', 'B · Stern ★ in der Geräteliste']];
const N = [['2', '2 Heizkörper'], ['3', '3 Heizkörper']];
const ZUSATZ = [['an', 'Zusatz nur bei Bedarf: an'], ['aus', 'Zusatz nur bei Bedarf: aus']];
const PRIM = [['auto', 'Primär: nicht gewählt (der erste)'], ['polier_r2', 'Primär: Radiator 2'], ['polier_r3', 'Primär: Radiator 3 (nur bei 3)']];
const LAGE = [['wartet', 'Zusatz wartet'], ['an', 'Zusatz an (weit unter dem Soll)']];
const ZEIGEN = [['dialog', 'Dialog: Container bearbeiten'], ['geraet-primaer', '✎ Gerät: Primär'], ['geraet-zusatz', '✎ Gerät: Zusatz'], ['container', 'Container-Ansicht']];
const faelle = [];
for (const v of ['A', 'B']) for (const n of ['2', '3']) for (const z of ['an', 'aus'])
  faelle.push({ name: `${v.toLowerCase()}-dialog-${n}hk-zusatz-${z}`, werte: { variante: v, heizkoerper: n, zusatz: z, primaer: 'auto', lage: 'wartet', zeigen: 'dialog' } });
faelle.push({ name: 'a-dialog-3hk-primaer-r3', werte: { variante: 'A', heizkoerper: '3', zusatz: 'an', primaer: 'polier_r3', lage: 'wartet', zeigen: 'dialog' } });
faelle.push({ name: 'b-dialog-3hk-primaer-r2', werte: { variante: 'B', heizkoerper: '3', zusatz: 'an', primaer: 'polier_r2', lage: 'wartet', zeigen: 'dialog' } });
for (const z of ['geraet-primaer', 'geraet-zusatz']) faelle.push({ name: `${z}-3hk`, werte: { variante: 'A', heizkoerper: '3', zusatz: 'an', primaer: 'polier_r2', lage: 'wartet', zeigen: z } });
faelle.push({ name: 'geraet-zusatz-aus', werte: { variante: 'A', heizkoerper: '2', zusatz: 'aus', primaer: 'auto', lage: 'wartet', zeigen: 'geraet-zusatz' } });
for (const n of ['2', '3']) for (const l of ['wartet', 'an'])
  faelle.push({ name: `container-${n}hk-${l}`, werte: { variante: 'A', heizkoerper: n, zusatz: 'an', primaer: 'polier_r2', lage: l, zeigen: 'container' }, scroll: '.c-chip' });
rahmen.bauen({ datei: 'primaer.html', titel: 'Baustelle – Primärheizkörper (AN-0015)', leiste: 'AN-0015 Primärheizkörper · 2 Varianten', browser, faelle,
  auswahl: [{ id: 'variante', t: 'Variante', optionen: V }, { id: 'heizkoerper', t: 'Container', optionen: N }, { id: 'zusatz', t: 'Schalter', optionen: ZUSATZ },
    { id: 'primaer', t: 'Wahl', optionen: PRIM }, { id: 'lage', t: 'Lage', optionen: LAGE }, { id: 'zeigen', t: 'zeigen', optionen: ZEIGEN }] });
