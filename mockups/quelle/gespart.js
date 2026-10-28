// Vorschlag „Kachel Gespart zeigt, was gespart wurde“ auf Basis des Master-Mockups (Befund Herbert, 28.10.2026: „warum sieht
// das Diagramm bei Gespart gleich aus wie bei Kosten & Verbrauch? das kann doch nicht sein“).
// Baut mockups/gespart.html: node mockups/quelle/gespart.js   ·   prüfen: node mockups/quelle/vorschau/pruefen.cjs mockups/gespart.html
// Bilder: node mockups/quelle/gespart.js --bilder <ordner>
//
// Heute (alt.js kkDaten, Fall 'b-gespart'): Funke (M) und Fläche (L) zeigen dieselbe Reihe wie „Kosten & Verbrauch“
// (kkSumme = Verbrauch MIT Automatik); nur L legt eine gestrichelte Linie „ohne Automatik“ (Statistik energie_ohne_automatik)
// darüber, bei „alle laufenden Baustellen“ fehlt sie; L bekommt die Kachelbreite nicht (dia(id) ohne w, b-kosten seit 0.8.148).
// Vorschlag: die Kachel zeigt, was je Zeitraum (Stunde/Tag/Monat-Tag) gespart wurde – drei Varianten:
//   A  L Balken „gespart €“ je Stunde/Tag in voller Kachelbreite; M Funke der gesparten Reihe (grün); S nur die Zahl (groß, mittig)
//   B  L Fläche „mit Automatik“ und Linie „ohne (24/7)“, die Lücke dazwischen grün als „gespart“; M und S wie A
//   C  L Balken gespart je Zeitraum + dünne Linie „gespart bisher“ (aufsummiert, rechte Achse); M die aufsummierte Linie; S wie A
//   heute  unverändert zum Vergleich
// Alle Varianten: grün (var(--s3), wie b-gespart heute), Diagramm L in voller Breite (dia(id, w)), auch bei „alle laufenden“.
//
// DATEN – WICHTIG: Die Seite rechnet nichts Fachliches. Die Integration muss dafür eine Reihe „gespart je Zeitraum“ liefern
// (je Stunde bei Tag, je Tag bei Woche/Monat, je Monat bei Jahr; jeweils kWh UND €, € mit dem je Tag gültigen Preis), dazu
// „ohne (24/7)“ als Reihe in € für Variante B und für C die aufsummierte Reihe „gespart bisher“ (oder die Seite summiert nur
// fürs Zeichnen – zu klären). Für „alle laufenden Baustellen“ dieselben Reihen über alle (heute fehlt dort „ohne“).
// Die Summe der Reihe muss zur Zahl der Kachel passen (summen.ohne_automatik.gespart_eur).
// Im Mockup stehen dafür BEISPIELDATEN in diesem Vorschlagsmodul (beispielReihen): „mit“ = Verbrauch des Beispiel-hass × Preis,
// „ohne“ = Dauerbetrieb (nachts etwas mehr, je Stunde nie unter „mit“), so gewählt, dass ohne = 3 × mit wie summen.ohne_automatik
// des Beispiel-hass; gespart = ohne − mit (Summe = 2 × Verbrauch wie dort). Kommende Stunden/Tage bleiben leer.
// Die Zeichenfunktionen hier (balkenBreit, lueckeBreit) wären im Bau neue Funktionen in src/diagramme.js (mit Hover wie flaeche).
const rahmen = require('./rahmen');

/* Läuft nur im Browser (als Text eingesetzt, Node führt es nie aus) */
function browser(R) {
  const G = window.GS = { v: 'A' };
  const JEDES = { Tag: 6, Woche: 1, Monat: 7, Jahr: 3 };   // = KK_JEDES der Seite
  const GRUEN = 'var(--s3)';
  const de = (v, k = 0) => Number(v).toLocaleString('de-AT', { minimumFractionDigits: k, maximumFractionDigits: k });
  const ist = v => typeof v === 'number' && isFinite(v);

  /* ---------- Beispieldaten (im Bau: von der Integration) ---------- */
  function beispielReihen(p, c, oa) {
    const d = p.d, preis = d.e.preis, zr = p.zeitraum(c.z, c.v), n = zr.labels.length;
    const mit0 = p.kkSumme(c) || Array(n).fill(0), jetzt = zr.index(p.lokal(d.z.jetztMs, d.z.zone));
    const fertig = i => jetzt < 0 || i <= jetzt;   // kommende Stunden/Tage: noch nichts
    const summe = mit0.reduce((a, v, i) => a + (fertig(i) ? v || 0 : 0), 0);
    const form = i => c.z === 'Tag' ? 1 + .25 * Math.cos((i - 3) / 24 * 2 * Math.PI) : 1 + .15 * Math.sin(i * 1.7);   // nachts/kalte Tage etwas mehr
    // ohne (24/7) ≥ mit in jeder Stunde (alle Heizkörper dauernd an); Grundlast so gewählt, dass ohne ≈ 3 × mit wie im Beispiel-hass
    const mit = mit0.map((v, i) => fertig(i) ? (v || 0) * preis : null), ziel = 3 * summe * preis;
    const ohneBei = g => mit.map((v, i) => v === null ? null : Math.max(v, g * form(i)));
    let lo = 0, hi = Math.max(ziel, 1);
    for (let k = 0; k < 40; k++) { const m = (lo + hi) / 2, su = ohneBei(m).reduce((a, v) => a + (v || 0), 0); if (su > ziel) hi = m; else lo = m; }
    const ohne = summe > 0 ? ohneBei(lo) : mit.map(v => v === null ? null : (c.z === 'Tag' ? 1.2 : 25) * preis);
    let gespart = mit.map((v, i) => v === null ? null : Math.max(0, ohne[i] - v));
    const roh = gespart.reduce((a, v) => a + (v || 0), 0);   // passt die Zahl der Integration zum Zeitraum: Reihe genau auf summen.ohne_automatik.gespart_eur
    if (oa && oa.gespart_eur > 0 && roh > 0) { const k = oa.gespart_eur / roh; gespart = gespart.map(v => v === null ? null : v * k);
      for (let i = 0; i < n; i++) if (mit[i] !== null) ohne[i] = mit[i] + gespart[i]; }
    let s = 0; const bisher = gespart.map(v => v === null ? null : (s += v));
    const sum = a => a.reduce((x, v) => x + (v || 0), 0);
    return { zr, mit, ohne, gespart, bisher, eur: sum(gespart), ohneEur: sum(ohne), mitEur: sum(mit), kwh: sum(gespart) / preis };
  }

  /* ---------- Zeichnen (Vorschlag für src/diagramme.js) ---------- */
  const raster = (hi, L, W, R, y, stufe, rechts = null) => [...Array(Math.round(hi / stufe) + 1)].map((_, k) => k * stufe).map(v =>
    `<line x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}" class="gr"/><text x="${L - 5}" y="${y(v) + 3}" class="ax" text-anchor="end">${de(v, stufe < 1 ? 1 : 0)}</text>`
    + (rechts ? `<text x="${W - R + 5}" y="${y(v) + 3}" class="ax">${de(v * rechts, v * rechts < 10 && rechts * stufe < 1 ? 1 : 0)}</text>` : '')).join('');
  const glatt = hi0 => { const st = [.1, .2, .5, 1, 2, 5, 10, 20, 50, 100, 200, 500, 1000].find(x => hi0 / x <= 4) || 2000; return { st, hi: Math.ceil(hi0 / st) * st || st }; };
  const achse = (labels, x, H) => labels.map((t, i) => i % JEDES[G.z] ? '' : `<text x="${x(i)}" y="${H - 6}" class="ax" text-anchor="middle">${t}</text>`).join('');

  function balkenBreit(werte, labels, W, kum) {   // A und C: Balken gespart je Zeitraum, C mit „gespart bisher“ (rechte Achse)
    const H = 160, L = 30, R = kum ? 34 : 8, T = 20, U = 22, n = labels.length, { st, hi } = glatt(Math.max(...werte.map(v => v || 0), 0) * 1.1);
    const bw = (W - L - R) / n, y = v => T + (1 - v / hi) * (H - T - U), x = i => L + (i + .5) * bw;
    const b = werte.map((v, i) => { if (!ist(v) || v <= 0) return ''; const h = H - U - y(v), bx = L + i * bw + Math.min(2, bw * .15), w = Math.max(1, bw - 2 * Math.min(2, bw * .15)), r = Math.min(3, w / 2, h);
      return `<path d="M${bx.toFixed(1)} ${H - U}V${(y(v) + r).toFixed(1)}q0 -${r} ${r} -${r}h${(w - 2 * r).toFixed(1)}q${r} 0 ${r} ${r}V${H - U}z" fill="${GRUEN}" opacity="${kum ? .55 : .9}"/>`; }).join('');
    let linie = '', fakt = null;
    if (kum) { const top = Math.max(...kum.filter(ist), 0) || 1;   // rechte Achse auf denselben Rasterlinien: Faktor rechts/links
      const st2 = [.1, .2, .25, .5, 1, 2, 2.5, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000, 2000, 5000].find(q => q * hi / st >= top) || 10000; fakt = st2 / st;
      const yk = v => T + (1 - v / (hi * fakt)) * (H - T - U);
      linie = `<path d="${kum.map((v, i) => ist(v) ? `${i && ist(kum[i - 1]) ? 'L' : 'M'}${x(i).toFixed(1)} ${yk(v).toFixed(1)}` : '').join('')}" fill="none" stroke="var(--ink)" stroke-width="1.6" stroke-linejoin="round" opacity=".85"/>`
        + (() => { const j = kum.map(ist).lastIndexOf(true); return j >= 0 ? `<circle cx="${x(j).toFixed(1)}" cy="${yk(kum[j]).toFixed(1)}" r="3" fill="var(--ink)"/>` : ''; })(); }
    const kopf = `<text x="${L - 5}" y="${T - 5}" class="ax ax-e" text-anchor="end">€</text>${kum ? `<text x="${W - R + 5}" y="${T - 5}" class="ax ax-e">∑ €</text>` : ''}`;
    return `<svg class="chart gs-svg" viewBox="0 0 ${W} ${H}">${raster(hi, L, W, R, y, st, fakt)}${achse(labels, x, H)}${b}${linie}${kopf}</svg>`;
  }

  function lueckeBreit(mit, ohne, labels, W) {   // B: Fläche mit, Linie ohne, Lücke grün
    const H = 160, L = 30, R = 8, T = 20, U = 22, n = labels.length, { st, hi } = glatt(Math.max(...ohne.map(v => v || 0), ...mit.map(v => v || 0), 0) * 1.1);
    const x = i => L + i / Math.max(1, n - 1) * (W - L - R), y = v => T + (1 - v / hi) * (H - T - U);
    const idx = mit.map((v, i) => ist(v) ? i : -1).filter(i => i >= 0), P = (a, I) => I.map((i, k) => `${k ? 'L' : 'M'}${x(i).toFixed(1)} ${y(a[i]).toFixed(1)}`).join('');
    const zur = (a, I) => [...I].reverse().map(i => `L${x(i).toFixed(1)} ${y(a[i]).toFixed(1)}`).join('');
    if (!idx.length) return '<div class="leer">Noch keine Werte</div>';
    const a0 = idx[0], a1 = idx[idx.length - 1];
    const fl = `<path d="${P(mit, idx)}L${x(a1).toFixed(1)} ${y(0)}L${x(a0).toFixed(1)} ${y(0)}z" fill="var(--s1)" opacity=".28"/><path d="${P(mit, idx)}" fill="none" stroke="var(--s1)" stroke-width="1.8" stroke-linejoin="round"/>`;
    const lu = `<path d="${P(ohne, idx)}${zur(mit, idx)}z" fill="${GRUEN}" opacity=".38"/>`;
    const oh = `<path d="${P(ohne, idx)}" fill="none" stroke="var(--ink2)" stroke-width="1.6" stroke-dasharray="5 4" stroke-linejoin="round"/>`;
    const m = idx[Math.floor(idx.length / 2)], mitte = (y(ohne[m]) + y(mit[m])) / 2;
    const tx = idx.length > 2 && y(mit[m]) - y(ohne[m]) > 16 ? `<text x="${x(m).toFixed(1)}" y="${(mitte + 3).toFixed(1)}" class="gs-in" text-anchor="middle">gespart</text>` : '';
    return `<svg class="chart gs-svg" viewBox="0 0 ${W} ${H}">${raster(hi, L, W, R, y, st)}${achse(labels, x, H)}${fl}${lu}${oh}${tx}<text x="${L - 5}" y="${T - 5}" class="ax ax-e" text-anchor="end">€</text></svg>`;
  }

  const funke = (v, farbe) => { v = v.map(q => ist(q) ? q : null); const w = 120, h = 40, z = v.filter(q => q !== null); if (z.length < 2) return '';
    const lo = Math.min(0, ...z), hi = Math.max(...z), sp = hi - lo || 1, pts = v.map((q, i) => q === null ? null : [i / (v.length - 1) * w, h - 3 - (q - lo) / sp * (h - 8)]).filter(Boolean);
    const dL = pts.map((q, i) => `${i ? 'L' : 'M'}${q[0].toFixed(1)} ${q[1].toFixed(1)}`).join('');
    return `<svg class="kk-funke" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none"><path d="${dL}L${pts.at(-1)[0].toFixed(1)} ${h}L${pts[0][0].toFixed(1)} ${h}z" fill="${farbe}" opacity=".2"/>`
      + `<path d="${dL}" fill="none" stroke="${farbe}" stroke-width="2" vector-effect="non-scaling-stroke" stroke-linejoin="round"/></svg>`; };
  const legende = t => `<div class="gs-leg">${t}</div>`;

  /* ---------- Kachel b-gespart ersetzen (nur die Werte; Aufbau S/M/L bleibt der der Seite) ---------- */
  const alt = R.proto.kkDaten;
  R.proto.kkDaten = function (x, b, c) {
    const D = alt.call(this, x, b, c);
    if (x.k !== 'b-gespart' || G.v === 'heute') return D;
    const eigen = c.ort === 'ue' && c.z !== G.z;   // Vorführung: auch auf der Übersicht der gewählte Zeitraum (Seite: dieser Monat)
    if (eigen) c = { ...c, z: G.z, v: 0 };
    const oa = eigen ? null : c.S.ohne_automatik, B = beispielReihen(this, c, oa), wann = this.zrText(c.z, c.v);
    if (oa) Object.assign(B, { eur: oa.gespart_eur, ohneEur: oa.ohne_eur, mitEur: oa.ohne_eur - oa.gespart_eur });   // Summen wie die Integration (Kachel-Zahl unverändert)
    const prozent = oa ? oa.prozent : B.ohneEur > 0 ? (1 - B.mitEur / B.ohneEur) * 100 : null;
    const je = c.z === 'Tag' ? 'je Stunde' : c.z === 'Jahr' ? 'je Monat' : 'je Tag';
    const N = { ...D, zahl: de(B.eur, B.eur < 10 ? 2 : 0), einh: '€', wo: wann, farbe: GRUEN,
      vgl: `${de(B.kwh, 0)} kWh · ${prozent === null ? '–' : de(prozent, 0)} % weniger als rund um die Uhr (${de(B.ohneEur, 0)} €)`,
      kennz: [['gespart', `${de(B.eur, 0)} €`], ['gespart', `${de(B.kwh, 0)} kWh`], ['ohne (24/7)', `${de(B.ohneEur, 0)} €`], ['mit Automatik', `${de(B.mitEur, 0)} €`]] };
    if (G.v === 'C') { N.funke = B.bisher; N.mini = `${funke(B.bisher, GRUEN)}<span class="kk-wo gs-mini">gespart bisher · ${wann}</span>`; }
    else { N.funke = B.gespart; N.mini = `${funke(B.gespart, GRUEN)}<span class="kk-wo gs-mini">gespart ${je}</span>`; }
    const lab = B.zr.labels;
    N.dia = (id, w = 320) => {   // w = 320 am Handy (halbe Breite): Legende kurz
      const kurz = w <= 320;
      if (G.v === 'A') return `${balkenBreit(B.gespart, lab, w, null)}${legende(`<span><i style="background:${GRUEN}"></i>gespart € ${je}</span>`)}`;
      if (G.v === 'B') return `${lueckeBreit(B.mit, B.ohne, lab, w)}${legende(kurz ? `<span><i style="background:${GRUEN}"></i>gespart</span><span><i class="gs-gestr"></i>24/7</span>`
        : `<span><i style="background:var(--s1)"></i>mit Automatik</span><span><i class="gs-gestr"></i>ohne (24/7)</span><span><i style="background:${GRUEN}"></i>Lücke = gespart</span>`)}`;
      return `${balkenBreit(B.gespart, lab, w, B.bisher)}${legende(kurz ? `<span><i style="background:${GRUEN}"></i>${je}</span><span><i style="background:var(--ink)"></i>∑ bisher</span>`
        : `<span><i style="background:${GRUEN}"></i>gespart ${je}</span><span><i style="background:var(--ink)"></i>gespart bisher (∑, rechts)</span>`)}`;
    };
    return N;
  };

  /* Varianten-Band über „Meine Kacheln“ bzw. der Auswertung */
  const BAND = { A: 'Variante A · Balken „gespart €“ je Zeitraum', B: 'Variante B · Lücke zwischen „mit“ und „ohne (24/7)“', C: 'Variante C · Balken + „gespart bisher“ aufsummiert', heute: 'heute · gleiche Reihe wie Kosten & Verbrauch' };
  const band = p => R.html`<div class="gs-band">${R.band(BAND[G.v])}${R.marke}<span class="leise">Beispieldaten · ${G.z === 'Tag' ? 'heute' : G.z === 'Woche' ? 'diese Woche' : 'dieser Monat'}${p.s.view === 'uebersicht' ? ' (Übersicht sonst: dieser Monat)' : ''}</span></div>`;
  R.vorlage({ merkmal: '<div class="kk-bereich">', fn: (t, p) => R.html`${band(p)}${t}` });
  R.abschnitt({ ansicht: 'auswertung', vor: p => band(p) });

  R.stil(`
.gs-band { display: flex; align-items: center; flex-wrap: wrap; gap: 4px 8px; margin: 10px 0 0; } .gs-band .r-band { margin: 0; } .gs-band .leise { font-size: 12px; color: var(--ink2); }
.kk-dia .gs-svg { flex: 1 1 0; min-height: 0; width: 100%; height: 100%; }
.kk-dia:has(.gs-svg) { flex-direction: column; align-items: stretch; gap: 2px; }
.gs-leg { display: flex; flex-wrap: wrap; gap: 2px 12px; font-size: 11px; color: var(--ink2); }
.gs-leg i { display: inline-block; width: 10px; height: 10px; border-radius: 3px; margin-right: 5px; vertical-align: -1px; }
.gs-leg i.gs-gestr { height: 2px; border-radius: 0; vertical-align: 3px; background: repeating-linear-gradient(90deg, var(--ink2) 0 4px, transparent 4px 7px); }
.gs-in { font-size: 10px; font-weight: 600; fill: var(--s3); }
.gs-mini { text-align: center; font-size: 11px; }`);

  /* ---------- Vorführ-Leiste ---------- */
  const GROESSEN = { alle: ['S', 'M', 'L'], S: ['S'], M: ['M'], L: ['L'] };
  R.vorfuehren(w => {
    Object.assign(G, { v: w.variante, z: w.zeitraum });
    if (!window.baustelleBeispiel || !window.baustelleBeispiel.welt) return;
    for (const q of R.P()) {
      if (!q.d) continue;
      const gs = GROESSEN[w.groesse].map(st => q.kkGross({ k: 'b-gespart', an: true }, st));
      const vgl = w.vergleich === 'ja' ? [q.kkGross({ k: 'b-kosten', an: true }, 'L')] : [];
      if (w.ort === 'aw') {
        q.gehe('auswertung'); q.awVorlage('misch', false); q.s.awScope = w.scope;
        q.s.aw ||= { zeitraum: 'Monat', auswahl: q.d.bereiche.map(b => b.id) }; q.s.aw.zeitraum = w.zeitraum; q.s.aw.v = 0;
        q.s.awListe = [...gs, ...vgl, ...q.awAuswahl().filter(x => x.k !== 'b-gespart')];
      } else { q.s.kkUe = [...gs, ...vgl]; q.gehe('uebersicht'); }
      q.s.sheet = null; q.neuZeichnen();
    }
  });
}

const V = [['A', 'A · Balken gespart € je Zeitraum'], ['B', 'B · Lücke mit / ohne (24/7)'], ['C', 'C · Balken + gespart bisher (∑)'], ['heute', 'heute (zum Vergleich)']];
const ORT = [['ue', 'Übersicht'], ['aw', 'Auswertung']];
const ZR = [['Tag', 'Tag (je Stunde)'], ['Woche', 'Woche (je Tag)'], ['Monat', 'Monat (je Tag)']];
const GR = [['alle', 'S, M und L'], ['S', 'nur S'], ['M', 'nur M'], ['L', 'nur L']];
const VGL = [['ja', '+ Kosten & Verbrauch L daneben'], ['nein', 'ohne']];
const SCOPE = [['diese', 'diese Baustelle'], ['alle', 'alle laufenden']];
const faelle = [];
for (const v of ['A', 'B', 'C']) for (const o of ['ue', 'aw']) for (const z of ['Tag', 'Woche', 'Monat'])
  faelle.push({ name: `${v.toLowerCase()}-${o}-${z.toLowerCase()}`, werte: { variante: v, ort: o, zeitraum: z, groesse: 'alle', vergleich: 'ja', scope: 'diese' }, scroll: o === 'ue' ? '.gs-band' : undefined });
faelle.push({ name: 'b-aw-monat-alle', werte: { variante: 'B', ort: 'aw', zeitraum: 'Monat', groesse: 'alle', vergleich: 'ja', scope: 'alle' } });
faelle.push({ name: 'heute-ue-monat', werte: { variante: 'heute', ort: 'ue', zeitraum: 'Monat', groesse: 'alle', vergleich: 'ja', scope: 'diese' }, scroll: '.gs-band' });
rahmen.bauen({ datei: 'gespart.html', titel: 'Baustelle – Kachel Gespart (Vorschlag)', leiste: 'Kachel „Gespart“ · 3 Varianten', browser, faelle,
  auswahl: [{ id: 'variante', t: 'Variante', optionen: V }, { id: 'ort', t: 'Ort', optionen: ORT }, { id: 'zeitraum', t: 'Zeitraum', optionen: ZR },
    { id: 'groesse', t: 'Größe', optionen: GR }, { id: 'vergleich', t: 'Vergleich', optionen: VGL }, { id: 'scope', t: 'Auswertung für', optionen: SCOPE }] });
