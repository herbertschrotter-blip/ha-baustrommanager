// WU-0014 (Wunsch Herbert 28.10.2026): Kachel-Katalog „＋ Kachel · Übersicht/Auswertung“ – Größenknöpfe mittig und
// sichtbar, welche Kacheln schon eingebaut sind (Zeile und Größenknopf hervorgehoben).
// Baut mockups/katalog-markiert.html: node mockups/quelle/katalog-markiert.js
// prüfen: node mockups/quelle/vorschau/pruefen.cjs mockups/katalog-markiert.html   ·   Bilder: … --bilder <ordner>
//
// Heute: S/M/L-Knöpfe (.kk-tr-gr button) ohne festes Maß und ohne Ausrichtung – der Buchstabe sitzt nicht mittig;
// die Liste zeigt nicht, was schon in der Übersicht/Auswertung liegt.
// Vorschlag (beide Varianten): Knöpfe 30 × 30 px, Buchstabe waagrecht und senkrecht mittig (XL der Auswertung breiter).
//   A  Zeile getönt + Häkchen ✓ am Symbol + „eingebaut · M“ / „2× eingebaut · M, L“; Größenknopf der eingebauten Größe gefüllt
//   B  nur linker Amber-Balken an der Zeile, Größenknopf der eingebauten Größe umrandet; je Container klein darunter
//      „Poliercontainer L · Mannschaft M“ (ohne Präfix) – GEWÄHLT von Herbert 28.10.2026, A bleibt zum Vergleich
// Gewählte Größe (Zeile offen) bleibt wie heute voll Amber – „eingebaut“ ist schwächer (A getönt, B Rand).
// Daten: eingebaut = was die Seite in kkListe(ort) hat (Übersicht: KK_START b-kosten M, b-gespart M, h-wann M;
// Auswertung: Vorlage „Mischform“), wahlweise mit zusätzlichen Kacheln für den Fall „2× eingebaut“.
const rahmen = require('./rahmen');

/* Läuft nur im Browser (als Text eingesetzt, Node führt es nie aus) */
function browser(R) {
  const { html, nothing } = R;
  const G = window.KM = { v: 'B', mittig: true };   // Herbert 28.10.2026: Variante B gewählt

  /* eingebaut: Kacheln der Liste des Orts mit diesem Schlüssel (nur sichtbare) */
  const drin = (p, k) => { const ort = p.s.sheet && p.s.sheet.ort; if (!ort) return [];
    return p.kkListe(ort).filter(x => x.an && x.k === k); };
  const wer = (p, L) => L.map(x => { const e = p.kkEintraege(p.s.sheet.ort).find(y => y.k === x.k), b = e && e.je && e.je !== 'v' ? p.kkB(x) : null;
    return b ? `${b.name} ${x.st}` : x.st; });   // je Container: mit Name, damit „2× eingebaut“ sagt, wo
  const hinweis = (p, L) => { const t = wer(p, L).join(', ');
    if (G.v === 'A') return L.length > 1 ? `${L.length}× eingebaut · ${t}` : `eingebaut · ${t}`;
    // B (Herbert 28.10.2026): kein Text „schon da“ – nur bei Kacheln je Container die Container mit Größe, ohne Präfix
    const W = wer(p, L); return W.some(x => x.includes(' ')) ? W.join(' · ') : ''; };

  /* Zeile im Katalog (ansichten/kacheln.js treffer): values = [on, k, click, ic, name, bereich, text, knöpfe, wahl] */
  R.vorlage({ merkmal: '<div class="kk-tr-zeile ', fn: (t, p) => {
    const k = t.values[1], L = drin(p, k), m = G.mittig ? ' km-m' : '';
    if (!L.length) { if (!m) return undefined; const n0 = { ...t, values: [...t.values] }; n0.values[0] += m; return n0; }
    const n = { ...t, values: [...t.values] }, st = new Set(L.map(x => x.st)), on = n.values[0] === 'on';
    n.values[0] = `${n.values[0]}${m} km-drin km-${G.v.toLowerCase()}`;
    if (G.v === 'A') n.values[3] = html`${n.values[3]}<i class="km-ck" aria-label="eingebaut">✓</i>`;
    const h = hinweis(p, L); if (h) n.values[4] = html`${n.values[4]}<span class="km-hin ${G.v === 'B' ? 'km-hin-b' : ''}">${h}</span>`;
    if (Array.isArray(n.values[7])) n.values[7] = n.values[7].map(b => { const g = b.values[0];
      return st.has(g) ? html`<button data-v=${g} class="${b.values[1]} km-gr" title="schon eingebaut in dieser Größe" @click=${b.values[2]}>${g}</button>` : b; });
    if (on && n.values[8] !== nothing && n.values[8]) n.values[8] = html`<div class="leise km-offen">${G.v === 'A' ? '✓ ' : ''}schon ${L.length > 1 ? `${L.length}× ` : ''}eingebaut (${wer(p, L).join(', ')}) – „Hinzufügen“ legt eine weitere an${R.marke}</div>${n.values[8]}`;
    return n; } });

  /* Kopf des Katalogs: Varianten-Band und Legende über der Trefferliste */
  R.vorlage({ merkmal: 'class="kk-treffer">', fn: (t, p) => {
    const j = t.strings.findIndex(s => s.includes('class="kk-treffer">')); if (j < 0) return undefined;
    const ort = p.s.sheet.ort, n = p.kkListe(ort).filter(x => x.an).length, n2 = { ...t, values: [...t.values] };
    const leg = G.v === 'A' ? html`<span class="km-leg"><i class="km-ck statisch">✓</i> getönt = schon in der ${ort === 'aw' ? 'Auswertung' : 'Übersicht'} · <b class="km-muster a">M</b> eingebaute Größe</span>`
      : html`<span class="km-leg"><i class="km-balken"></i> = schon in der ${ort === 'aw' ? 'Auswertung' : 'Übersicht'} · <b class="km-muster b">M</b> eingebaute Größe</span>`;
    n2.values[j] = html`${R.band(G.v === 'A' ? 'Variante A · Zeile getönt + Größe gefüllt + ✓' : 'Variante B · Amber-Balken + Größe umrandet (gewählt 28.10.2026)')}
      <div class="km-kopf">${leg}${R.marke}<span class="leise">${n} ${n === 1 ? 'Kachel' : 'Kacheln'} eingebaut</span></div>${t.values[j]}`;
    return n2; } });

  R.stil(`
.km-m .kk-tr-gr { align-items: center; }   /* Wunsch 1: gleich große Knöpfe, Buchstabe waagrecht und senkrecht mittig (XL breiter) */
.km-m .kk-tr-gr button { box-sizing: border-box; min-width: 30px; height: 30px; padding: 0 7px; margin: 0; display: inline-flex; align-items: center; justify-content: center;
  text-align: center; line-height: 1; font-size: 13px; }
.km-hin { display: inline-block; margin-left: 8px; font-size: 11px; font-weight: 600; color: var(--amber); white-space: normal; max-width: 100%; vertical-align: 1px; }   /* langer Text (2× je Container) bricht um */
.km-hin-b { display: block; margin: 1px 0 0; font-weight: 500; color: var(--ink2); }   /* B: Container klein unter dem Namen */
.km-drin .kk-z-ic { position: relative; }
.km-ck { position: absolute; right: -3px; bottom: -3px; width: 15px; height: 15px; border-radius: 50%; background: var(--amber); color: #1a1000; font-size: 10px; font-style: normal; font-weight: 700;
  display: inline-flex; align-items: center; justify-content: center; line-height: 1; }
.km-ck.statisch { position: static; vertical-align: -2px; }
.kk-tr-zeile.km-a { background: color-mix(in srgb, var(--amber) 7%, transparent); border-radius: 12px; box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--amber) 30%, transparent); padding-left: 6px; padding-right: 6px; }
.kk-tr-zeile.km-a.on { background: color-mix(in srgb, var(--amber) 14%, transparent); }
.kk-tr-gr button.km-gr:not(.on) { background: color-mix(in srgb, var(--amber) 32%, transparent); color: var(--ink); font-weight: 600; }
.kk-tr-zeile.km-b { box-shadow: inset 3px 0 0 var(--amber); padding-left: 10px; border-radius: 0 10px 10px 0; }
.kk-tr-zeile.km-b .kk-tr-gr button.km-gr:not(.on) { background: transparent; box-shadow: inset 0 0 0 1.5px var(--amber); color: var(--amber); }
.km-kopf { display: flex; align-items: center; gap: 4px 8px; flex-wrap: wrap; font-size: 12px; color: var(--ink2); margin: 0 0 2px; } .km-kopf > .leise { margin-left: auto; }
.km-leg { display: inline-flex; align-items: center; gap: 5px; flex-wrap: wrap; }
.km-balken { display: inline-block; width: 3px; height: 14px; background: var(--amber); border-radius: 2px; }
.km-muster { display: inline-flex; align-items: center; justify-content: center; width: 22px; height: 22px; border-radius: 7px; font-size: 11px; color: var(--ink); }
.km-muster.a { background: color-mix(in srgb, var(--amber) 32%, transparent); } .km-muster.b { box-shadow: inset 0 0 0 1.5px var(--amber); color: var(--amber); }
.km-offen { color: var(--amber); padding: 2px 4px 0; }`);
  /* ---------- Vorführ-Leiste ---------- */
  const UE_START = [['b-kosten', 'M'], ['b-gespart', 'M'], ['h-wann', 'M']];   // = KK_START der Seite (kacheln-daten.js)
  R.vorfuehren(async w => {
    Object.assign(G, { v: w.variante, mittig: w.knoepfe === 'mittig' });
    if (!window.baustelleBeispiel || !window.baustelleBeispiel.welt) return;
    for (const q of R.P()) {
      if (!q.d) continue;
      const C = q.kkWahlListe('c-temp'), K = q.kkWahlListe('c-kosten');
      q.s.kkUe = UE_START.map(([k, st]) => q.kkGross({ k, an: true }, st));
      q.awVorlage('misch', false);
      if (w.bestand === 'mehr') {   // zusätzlich: dieselbe Kachel zweimal (je Container) → „2× eingebaut“
        if (C[0]) q.s.kkUe.push(q.kkGross({ k: 'c-temp', an: true, id: C[0].id, dia: true }, 'L'));
        if (C[1]) q.s.kkUe.push(q.kkGross({ k: 'c-temp', an: true, id: C[1].id }, 'M'));
        if (K[0]) q.awAuswahl().push(q.kkGross({ k: 'c-kosten', an: true, id: K[0].id }, 'S'));
        if (K[1]) q.awAuswahl().push(q.kkGross({ k: 'c-kosten', an: true, id: K[1].id }, 'M'));
      }
      const ort = w.ort;
      q.gehe(ort === 'aw' ? 'auswertung' : 'uebersicht');
      q.kkPlus(ort);
      if (w.zeigen === 'offen') { const s = q.s.sheet, k = ort === 'aw' ? 'betrag' : 'b-kosten', x = q.kkListe(ort).find(y => y.an && y.k === k);
        s.k = k; s.st = x ? x.st : 'M'; }
      if (w.zeigen === 'suche') { q.s.sheet.q = 'temperatur'; }
      q.neuZeichnen();
    }
  });
}

const V = [['B', 'B · Amber-Balken + Größe umrandet (gewählt)'], ['A', 'A · Zeile getönt + Größe gefüllt + ✓ (Vergleich)']];
const ORT = [['ue', 'Übersicht'], ['aw', 'Auswertung']];
const BESTAND = [['start', 'Beispieldaten (Übersicht 3, Auswertung Mischform)'], ['mehr', '+ Kacheln je Container doppelt (2× eingebaut)']];
const KNOEPFE = [['mittig', 'S/M/L mittig (neu)'], ['heute', 'S/M/L wie heute']];
const ZEIGEN = [['liste', 'Liste'], ['offen', 'eingebaute Kachel geöffnet'], ['suche', 'Suche „temperatur“']];
const faelle = [];
for (const v of ['B', 'A']) for (const o of ['ue', 'aw']) for (const b of ['start', 'mehr'])
  faelle.push({ name: `${v.toLowerCase()}-${o}-${b}`, werte: { variante: v, ort: o, bestand: b, knoepfe: 'mittig', zeigen: 'liste' } });
for (const v of ['B', 'A']) faelle.push({ name: `${v.toLowerCase()}-ue-offen`, werte: { variante: v, ort: 'ue', bestand: 'start', knoepfe: 'mittig', zeigen: 'offen' } });
for (const v of ['B', 'A']) faelle.push({ name: `${v.toLowerCase()}-ue-suche-mehr`, werte: { variante: v, ort: 'ue', bestand: 'mehr', knoepfe: 'mittig', zeigen: 'suche' } });
faelle.push({ name: 'heute-knoepfe', werte: { variante: 'A', ort: 'ue', bestand: 'start', knoepfe: 'heute', zeigen: 'liste' } });
rahmen.bauen({ datei: 'katalog-markiert.html', titel: 'Baustelle – Kachel-Katalog: eingebaut markiert (WU-0014)', leiste: 'WU-0014 Katalog · eingebaut markiert · 2 Varianten', browser, faelle,
  auswahl: [{ id: 'variante', t: 'Variante', optionen: V }, { id: 'ort', t: 'Ort', optionen: ORT }, { id: 'bestand', t: 'Eingebaut', optionen: BESTAND },
    { id: 'knoepfe', t: 'Knöpfe', optionen: KNOEPFE }, { id: 'zeigen', t: 'zeigen', optionen: ZEIGEN }] });
