// Vorschlag „Auswertung kompakter“ (Herbert 26.11.2026 zu 0.8.203: „auch am Desktop wird zuviel Platz verschwendet …
// ich meine vor allem den Was-fällt-auf-Teil, und das Scrollen ist auch mühselig“). Gilt für PC und Handy.
// Baut mockups/auswertung-kompakt.html: node mockups/quelle/aw-kompakt.js   ·   Bilder: node mockups/quelle/aw-kompakt.js --bilder <ordner>
//
// Beide Varianten: „Was fällt auf“ als kleine Karten nebeneinander (Symbol links, Titel, eine Zeile Text; am PC 3–4 in
// einer Reihe, am Handy 2), antippen springt wie bisher zum passenden Abschnitt.
// Varianten gegen das Scrollen:
//   A  zuklappbar: jeder Abschnitt ist eine Zeile mit seinem Kernwert (z. B. „🌱 Ersparnis · 1 297 € gespart“); offen ist
//      zu Beginn nur „Verbrauch & Kosten“. Antippen klappt auf/zu, die Sprungleiste klappt auf und springt hin. Was offen
//      ist, merkt sich die Seite.
//   B  Reiter: die Sprungleiste wird zur Reiterleiste, es ist immer nur ein Abschnitt zu sehen (kein langes Scrollen).
//   heute  wie 0.8.203
// Die Kernwerte kommen von der Integration (baustelle/auswertung, baustelle/abrechnung), die Seite rechnet nichts.
'use strict';
const rahmen = require('./rahmen');

/* Läuft nur im Browser (als Text eingesetzt, Node führt es nie aus) */
function browser(R) {
  const { html, nothing } = R;
  const G = window.AW_KOMPAKT = { v: 'a', auf: ['verbrauch'], reiter: 'verbrauch' };
  const AB = [['verbrauch', '⚡ Verbrauch & Kosten', 'Verbrauch'], ['ersparnis', '🌱 Ersparnis', 'Ersparnis'], ['heizperiode', '🌡 Heizperiode & Wetter', 'Heizperiode'],
    ['abrechnung', '🧾 Abrechnung & Export', 'Abrechnung'], ['geraete', '🔌 Geräte & Pumpen', 'Geräte']];
  const de = (x, n = 0) => (typeof x === 'number' && isFinite(x)) ? x.toLocaleString('de-AT', { minimumFractionDigits: n, maximumFractionDigits: n }) : '–';
  const reihe = p => { const alle = AB.map(x => x[0]), r = (p.d.e.aw_reihe || []).filter(k => alle.includes(k)), aus = p.d.e.aw_aus || [];
    return [...r, ...alle.filter(k => !r.includes(k))].filter(k => !aus.includes(k)); };
  /* Kernwert je Abschnitt – Zahlen aus den Antworten der Integration (dieselben, die die Abschnitte zeigen) */
  const kern = (p, k) => { const z = p.s.aw.zeitraum, v = p.zrV('aw'), A = p.awDaten(z, v) || {}, S = A.summen || {};
    if (k === 'verbrauch') return `${de(S.kwh)} kWh · ${de(S.eur, 2)} €`;
    if (k === 'ersparnis') return S.ohne_automatik ? `${de(S.ohne_automatik.gespart_eur)} € gespart` : '–';
    if (k === 'heizperiode') { const h = A.hochrechnung; return h && h.mit_eur ? `Hochrechnung ≈ ${de(h.mit_eur)} €` : 'Hochrechnung'; }
    if (k === 'abrechnung') { const ab = p.abDaten(z, undefined, p.d, v) || {}, F = ab.firmen || []; return F.length ? `${F.length} Firmen · CSV` : 'CSV'; }
    return `${(A.je_geraet || []).length} Geräte`; };
  const titel = k => AB.find(x => x[0] === k)[1];
  const kopfZeile = (p, k, offen) => html`<button class="glas-panel awk-zeile ${offen ? 'offen' : ''}" @click=${() => { G.auf = offen ? G.auf.filter(x => x !== k) : [...G.auf, k]; R.neuAlle(); }}>
      <b>${titel(k)}</b><span class="leise">${offen ? '' : kern(p, k)}</span><span class="awk-pf">${offen ? '▴' : '▾'}</span></button>`;
  const springeAuf = (p, k) => { if (G.v === 'b') { G.reiter = k; return R.neuAlle(); } if (!G.auf.includes(k)) G.auf = [...G.auf, k]; R.neuAlle();
    setTimeout(() => { const el = p.renderRoot.querySelector(`[data-awk="${k}"]`); if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' }); }, 50); };

  R.abschnitt({ ansicht: 'auswertung', wann: () => G.v !== 'heute', statt: (p, orig) => {
    const v = orig && orig.values, teile = v ? v[v.length - 1] : [], oben = v ? v.slice(0, -1) : [], K = reihe(p);
    const S = Object.fromEntries(K.map((k, i) => [k, teile[i]]));
    const leiste = html`<div class="awk-leiste ${G.v === 'b' ? 'reiter' : ''}">${R.band(G.v === 'a' ? 'Variante A · zuklappbar' : 'Variante B · Reiter')}
        ${K.map(k => html`<button class="glas-panel chip ${G.v === 'b' && G.reiter === k ? 'on' : ''} ${G.v === 'a' && G.auf.includes(k) ? 'auf' : ''}" @click=${() => springeAuf(p, k)}>${AB.find(x => x[0] === k)[2]}${G.v === 'a' ? (G.auf.includes(k) ? ' ▴' : ' ▾') : ''}</button>`)}</div>`;
    const inhalt = G.v === 'b' ? html`<div data-awk=${G.reiter}>${S[G.reiter] || S[K[0]]}</div>`
      : K.map(k => html`<div data-awk=${k} class="awk-ab">${G.auf.includes(k) ? html`<div class="awk-auf">${kopfZeile(p, k, true)}${S[k]}</div>` : kopfZeile(p, k, false)}</div>`);
    return html`<div class="awk awk-${G.v}">${oben}${leiste}${inhalt}</div>`; } });

  R.stil(`
/* beide: „Was fällt auf“ als kleine Karten nebeneinander */
.awk .aw-erk { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(100%, 230px), 1fr)); gap: 8px; }
@container (max-width: 500px) { .awk .aw-erk { grid-template-columns: 1fr 1fr; } .awk .aw-erk .aw-karte { flex-direction: column; align-items: flex-start; gap: 2px; } }
.awk .aw-erk .gruppe { grid-column: 1 / -1; margin: 0; }
.awk .aw-erk .aw-karte { display: flex; flex-direction: row; align-items: center; gap: 10px; padding: 8px 10px; min-height: 0; border: 1px solid var(--gridc); border-radius: 12px; text-align: left; }
.awk .aw-erk .aw-karte .aw-fic { font-size: 20px; flex: 0 0 auto; } .awk .aw-erk .aw-karte b { font-size: 13px; display: block; } .awk .aw-erk .aw-karte .leise { font-size: 11px; line-height: 1.3; }
.awk .aw-erk .aw-karte > div { min-width: 0; text-align: left; }
/* eigene Sprung- bzw. Reiterleiste statt der bisherigen */
.awk .aw-sprung, .awk .aw-hl-sprung { display: none; }
.awk-leiste { display: flex; gap: 6px; overflow-x: auto; scrollbar-width: none; flex-wrap: nowrap; margin: 8px 0; align-items: center; } .awk-leiste::-webkit-scrollbar { display: none; }
.awk-leiste .chip { white-space: nowrap; } .awk-leiste.reiter .chip.on { background: var(--amber); color: #000; font-weight: 600; } .awk-leiste .chip.auf { font-weight: 600; }
.awk-zeile { width: 100%; display: flex; align-items: center; gap: 12px; padding: 12px 14px; margin: 8px 0 0; text-align: left; font: inherit; color: var(--ink); cursor: pointer; }
.awk-zeile b { font-size: 16px; white-space: nowrap; } .awk-zeile .leise { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; } .awk-pf { color: var(--ink2); }
.awk-auf { position: relative; } .awk-auf > .awk-zeile { position: absolute; right: 8px; top: 6px; width: auto; padding: 4px 10px; margin: 0; z-index: 1; background: none; border: 0; box-shadow: none; }
.awk-auf > .awk-zeile b { display: none; } .awk-ab { scroll-margin-top: 180px; }`);

  R.vorfuehren(async w => {
    G.v = w.variante; G.auf = ['verbrauch']; G.reiter = 'verbrauch';
    if (w.zeigen === 'mehr') { G.auf = ['verbrauch', 'ersparnis']; G.reiter = 'heizperiode'; }
    if (!window.baustelleBeispiel || !window.baustelleBeispiel.welt) return;
    for (const q of R.P()) { if (!q.d) continue; q.s.sheet = null; q.gehe('auswertung'); q.s.aw ||= { zeitraum: 'Monat', v: 0 }; }
    R.neuAlle();
  });
}

const V = [['a', 'A · zuklappbar'], ['b', 'B · Reiter'], ['heute', 'heute (0.8.203)']];
const ZEIGEN = [['start', 'Start'], ['mehr', 'A: Ersparnis aufgeklappt · B: Reiter Heizperiode']];
const faelle = [];
for (const v of ['a', 'b', 'heute']) faelle.push({ name: `${v}-start`, werte: { variante: v, zeigen: 'start' } });
for (const v of ['a', 'b']) faelle.push({ name: `${v}-mehr`, werte: { variante: v, zeigen: 'mehr' } });
faelle.push({ name: 'a-erk', werte: { variante: 'a', zeigen: 'start' }, scroll: '.aw-erk' }, { name: 'heute-erk', werte: { variante: 'heute', zeigen: 'start' }, scroll: '.aw-erk' });
rahmen.bauen({ datei: 'auswertung-kompakt.html', titel: 'Baustelle – Auswertung kompakter', leiste: 'Auswertung kompakter · A/B/heute', browser, faelle,
  auswahl: [{ id: 'variante', t: 'Variante', optionen: V }, { id: 'zeigen', t: 'zeigen', optionen: ZEIGEN }] });
