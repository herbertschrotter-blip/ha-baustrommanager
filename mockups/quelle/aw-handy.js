// Vorschlag „Auswertung am Handy kompakter“ (Herbert 26.11.2026, Screenshot 0.8.202): Am Handy füllen Kopf, Zeitraumleiste,
// „vergleichen mit“ und Sprungleiste schon den ersten Bildschirm, der Inhalt beginnt erst nach dem Scrollen.
// Nur das Handy ändert sich, der PC bleibt wie abgenommen (M13/M14, mockups/auswertung-neu.html).
// Baut mockups/auswertung-handy.html: node mockups/quelle/aw-handy.js   ·   Bilder: node mockups/quelle/aw-handy.js --bilder <ordner>
//
// Varianten (nur Handy):
//   A  eine Leiste: [Monat ▾] ‹ November 2026 › [⚙] – klebt oben; „Monat ▾“ bzw. ⚙ öffnet eine Einblendung mit Zeitraum,
//      Vergleich, Diese/Alle, ✎ Anordnung und 💶 Preis. Darunter die Sprungleiste als eine Zeile zum Wischen.
//   B  zwei schmale Zeilen: Zeitraum als wischbare Leiste (Tag … seit Beginn) und ‹ November 2026 › mit Chip „vs. Oktober ▾“
//      und ⚙ (Diese/Alle, Anordnung, Preis in der Einblendung); Sprungleiste als eine Zeile zum Wischen.
//   heute  wie 0.8.202
// Der Titel „Auswertung“ mit Baustellenname entfällt am Handy (der Reiter unten sagt schon „Auswertung“); der Name der
// Baustelle steht klein in der Leiste, wenn „Alle laufenden“ gewählt ist, steht dort „alle laufenden“.
'use strict';
const rahmen = require('./rahmen');

/* Läuft nur im Browser (als Text eingesetzt, Node führt es nie aus) */
function browser(R) {
  const { html, nothing } = R;
  const G = window.AW_HANDY = { v: 'a' };
  const ZR = [['Tag', 'Tag'], ['Woche', 'Woche'], ['Monat', 'Monat'], ['Jahr', 'Jahr'], ['Heizperiode', 'Heizperiode'], ['Gesamt', 'seit Beginn']];
  const VG = [['', 'kein Vergleich'], ['vorperiode', 'Vorperiode'], ['vorjahr', 'Vorjahr'], ['ohne', 'ohne Automatik']];
  const AB = [['verbrauch', 'Verbrauch'], ['ersparnis', 'Ersparnis'], ['heizperiode', 'Heizperiode'], ['abrechnung', 'Abrechnung'], ['geraete', 'Geräte']];
  const zrKurz = z => (ZR.find(x => x[0] === z) || [z, z])[1];
  const vgl = p => p.s.aw.vergleich ?? 'vorperiode';
  const vgKurz = p => { const v = vgl(p); return v === '' ? 'kein Vergleich' : v === 'ohne' ? 'vs. ohne Automatik' : v === 'vorjahr' ? 'vs. Vorjahr' : `vs. ${p.zrVgl(p.s.aw.zeitraum, p.zrV('aw')) || 'davor'}`; };
  const nav = p => { const z = p.s.aw.zeitraum, v = p.zrV('aw'), max = p.zrMax(z, p.zrGrenze(p.s.awScope === 'alle'));
    return html`<span class="awh-nav"><button aria-label="früher" ?disabled=${z === 'Gesamt' || v >= max} @click=${() => p.zrSchritt('aw', max, 1)}>‹</button>
      <b>${p.zrText(z, v)}</b><button aria-label="später" ?disabled=${z === 'Gesamt' || v <= 0} @click=${() => p.zrSchritt('aw', max, -1)}>›</button></span>`; };
  const springe = (p, k) => { const el = p.renderRoot.querySelector(`[data-aw-ab="${k}"]`); if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' }); };
  const sprung = p => html`<div class="awh-sprung">${AB.filter(([k]) => !(p.d.e.aw_aus || []).includes(k)).map(([k, t]) => html`<button class="chip glas-panel" @click=${() => springe(p, k)}>${t}</button>`)}</div>`;
  const auf = p => R.auf(p, { art: 'awh-filter' });
  const wer = p => p.s.awScope === 'alle' ? 'alle laufenden' : p.d.titel;

  /* Einblendung „Zeitraum & Anzeige“ – alles, was am Handy nicht in die Leiste passt */
  R.einblendung('awh-filter', p => html`<div class="griff"></div><div class="block-kopf"><h3>Auswertung einstellen</h3></div>
    ${G.v === 'a' ? html`<div class="gruppe">Zeitraum</div><div class="seg awh-seg">${ZR.map(([k, t]) => html`<button class=${p.s.aw.zeitraum === k ? 'on' : ''} @click=${() => p.zeitraumWahl('aw', k)}>${t}</button>`)}</div>
      <div class="gruppe">vergleichen mit</div><div class="seg awh-seg">${VG.filter(([k]) => !(p.s.aw.zeitraum === 'Gesamt' && k && k !== 'ohne')).map(([k, t]) => html`<button class=${vgl(p) === k ? 'on' : ''} @click=${() => p.awVergleich(k)}>${t}</button>`)}</div>` : nothing}
    <div class="gruppe">Baustellen</div><div class="seg awh-seg">${[['diese', 'Diese Baustelle'], ['alle', `Alle laufenden (${p.laufende().length})`]].map(([k, t]) => html`<button class=${(p.s.awScope || 'diese') === k ? 'on' : ''} @click=${() => p.awScopeWahl(k)}>${t}</button>`)}</div>
    <div class="glas-panel liste awh-liste"><button class="zeile" @click=${() => { p.schliessen(); p.awAnordnung(); }}><span>✎ Anordnung der Abschnitte</span><span class="chev">›</span></button>
      <button class="zeile" @click=${() => p.simUmschalten()}><span>💶 Preis</span><span class="leise">${p.s.awSim ? `simuliert ${p.simPreis().toFixed(2).replace('.', ',')} €` : 'tatsächlich'}</span></button></div>
    <button class="knopf amber" @click=${() => p.schliessen()}>Fertig</button>`);

  /* Kopf am Handy ersetzen: orig = [Kopf, Leiste+Sprungleiste, Abschnitte] der echten Auswertung */
  R.abschnitt({ ansicht: 'auswertung', wann: p => !!p.narrow && G.v !== 'heute', statt: (p, orig) => {
    const v = orig && orig.values, abschnitte = v ? v[v.length - 1] : orig, kopfEcht = v ? v[0] : nothing;
    const leiste = G.v === 'a'
      ? html`<div class="glas-panel awh-leiste klebt">${R.band('Variante A · eine Leiste')}<div class="awh-z1">
          <button class="chip glas-panel awh-zr" @click=${() => auf(p)}>${zrKurz(p.s.aw.zeitraum)} ▾</button>${nav(p)}<button class="chip glas-panel awh-ein" aria-label="einstellen" @click=${() => auf(p)}>⚙</button></div>
          <div class="leise awh-unter">${wer(p)} · ${vgKurz(p)}${p.s.aw.filter ? html` · <button class="rv-link" @click=${() => p.awFilter(null)}>${p.bereichName(p.s.aw.filter)} ✕</button>` : nothing}</div>${sprung(p)}</div>`
      : html`<div class="glas-panel awh-leiste klebt">${R.band('Variante B · zwei Zeilen')}
          <div class="seg awh-wisch">${ZR.map(([k, t]) => html`<button class=${p.s.aw.zeitraum === k ? 'on' : ''} @click=${() => p.zeitraumWahl('aw', k)}>${t}</button>`)}</div>
          <div class="awh-z1">${nav(p)}<select class="awh-vg" @change=${e => p.awVergleich(e.target.value)}>${VG.filter(([k]) => !(p.s.aw.zeitraum === 'Gesamt' && k && k !== 'ohne')).map(([k]) => html`<option value=${k} ?selected=${vgl(p) === k}>${k === vgl(p) ? vgKurz(p) : (VG.find(x => x[0] === k) || [])[1]}</option>`)}</select>
            <button class="chip glas-panel awh-ein" aria-label="einstellen" @click=${() => auf(p)}>⚙</button></div>
          <div class="leise awh-unter">${wer(p)}${p.s.aw.filter ? html` · <button class="rv-link" @click=${() => p.awFilter(null)}>${p.bereichName(p.s.aw.filter)} ✕</button>` : nothing}</div>${sprung(p)}</div>`;
    return html`${p.s.aw.anord ? kopfEcht : nothing}${leiste}${abschnitte}`; } });

  R.stil(`
.awh-leiste { padding: 8px 10px 6px; margin-bottom: 8px; display: flex; flex-direction: column; gap: 6px; }
.awh-leiste.klebt { position: sticky; top: 0; z-index: 3; }
.awh-z1 { display: flex; align-items: center; gap: 6px; } .awh-zr { white-space: nowrap; font-weight: 600; }
.awh-nav { flex: 1; display: flex; align-items: center; justify-content: space-between; min-width: 0; }
.awh-nav b { font-size: 15px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.awh-nav button { background: none; border: 0; color: var(--ink); font-size: 22px; padding: 0 8px; } .awh-nav button:disabled { opacity: .3; }
.awh-ein { padding: 4px 10px; font-size: 16px; } .awh-unter { font-size: 12px; padding: 0 2px; }
.awh-sprung, .awh-wisch { display: flex; gap: 6px; overflow-x: auto; scrollbar-width: none; flex-wrap: nowrap; } .awh-sprung::-webkit-scrollbar, .awh-wisch::-webkit-scrollbar { display: none; }
.awh-sprung .chip { white-space: nowrap; font-size: 12px; padding: 4px 10px; } .awh-wisch button { white-space: nowrap; flex: 0 0 auto; }
.awh-vg { font: inherit; font-size: 12px; padding: 3px 6px; border-radius: 8px; border: 1px solid var(--gridc); background: transparent; color: var(--ink); max-width: 42%; }
.awh-seg { flex-wrap: wrap; margin-bottom: 8px; } .awh-liste { margin: 8px 0 12px; }`);

  R.vorfuehren(async w => {
    G.v = w.variante;
    if (!window.baustelleBeispiel || !window.baustelleBeispiel.welt) return;
    for (const q of R.P()) { if (!q.d) continue; q.s.sheet = null; q.gehe('auswertung'); q.s.aw ||= { zeitraum: 'Monat', v: 0 }; q.s.aw.anord = false; q.s.aw.filter = null;
      if (w.zeigen === 'filter' && q.narrow && G.v !== 'heute') R.auf(q, { art: 'awh-filter' });
      if (w.zeigen === 'gefiltert') q.s.aw.filter = (q.d.bereiche.find(b => !b.pumpe) || {}).id || null; }
    R.neuAlle();
  });
}

const V = [['a', 'A · eine Leiste'], ['b', 'B · zwei Zeilen'], ['heute', 'heute (0.8.202)']];
const ZEIGEN = [['start', 'Start'], ['filter', '⚙ / Zeitraum ▾ angetippt'], ['gefiltert', 'ein Container gefiltert']];
const faelle = [];
for (const v of ['a', 'b', 'heute']) faelle.push({ name: `${v}-start`, werte: { variante: v, zeigen: 'start' } });
for (const v of ['a', 'b']) faelle.push({ name: `${v}-filter`, werte: { variante: v, zeigen: 'filter' } }, { name: `${v}-gefiltert`, werte: { variante: v, zeigen: 'gefiltert' } });
rahmen.bauen({ datei: 'auswertung-handy.html', titel: 'Baustelle – Auswertung am Handy', leiste: 'Auswertung am Handy · A/B/heute', browser, faelle,
  auswahl: [{ id: 'variante', t: 'Variante', optionen: V }, { id: 'zeigen', t: 'zeigen', optionen: ZEIGEN }] });
