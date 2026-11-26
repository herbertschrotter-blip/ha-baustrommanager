// Auswertung mit Lit – M13/M14 (Mockup mockups/auswertung-neu.html, abgenommen 26.11.2026): eine Zeitraumleiste für alles
// (Tag … seit Beginn, ‹ ›, vergleichen mit Vorperiode/Vorjahr/ohne Automatik, Filter Container), Sprungleiste und feste
// Abschnitte Verbrauch & Kosten · Ersparnis · Heizperiode & Wetter · Abrechnung & Export · Geräte & Pumpen; die Anordnung
// (nur ein/aus und Reihenfolge) speichert die Integration (aw_reihe, aw_aus). Kachel-Raster, Vorlagen und Größen gibt es
// hier nicht mehr. Alle Zahlen kommen von der Integration (p.awDaten, p.abDaten, p.vwDaten); die Seite ordnet nur an.
import { html, nothing } from 'lit';
import { unsafeHTML } from 'lit/directives/unsafe-html.js';
import { de, erkl, esc, kurzDatum, summe, wtag, zahl } from '../hilfen.js';
import { BEREICH_FARBEN } from '../symbole.js';
import { flaeche, linien } from '../diagramme.js';
import { kopfVorlage, schalterVorlage } from './allgemein.js';
import { zeitraumVorlage } from './zeitraum.js';
import { heizperiodeVorlage } from './heizperiode.js';
import { zuGrundlagen } from './grundlagen.js';
import { wetterDiagramm } from './verbrauch-wetter.js';

const LAEDT = html`<div class="leer">Lädt …</div>`;
const STUNDEN = [...Array(24)].map((_, h) => String(h).padStart(2, '0'));
const WANN = { Tag: 'heute', Woche: 'diese Woche', Monat: 'dieser Monat', Jahr: 'dieses Jahr' };
const farbeVon = b => b ? BEREICH_FARBEN[b.f % BEREICH_FARBEN.length] : 'var(--ink2)';

const awVgl = (p, z) => p.zrVgl(z, p.zrV('aw'));
const awDelta = dl => dl === null || dl === undefined ? '' : html`<em class="aw-delta ${dl > 0 ? 'mehr' : 'weniger'}">${dl > 0 ? '▲' : '▼'} ${Math.abs(dl)} %</em>`;

/* ---- Blöcke, die nur die Auswertung zeigt (0.7.8) ---- */

/* Abrechnung: je Firma die Container mit kWh und Kosten im gewählten Zeitraum (rechnet die Integration, Firma je Tag) */
function abrechnung(p, z) {
  const lauf = p.s.awScope === 'alle' ? p.laufende() : [p.d], preis = p.d.e.preis, vs = p.zrV('aw'), a = p.abDaten(z, undefined, p.d, vs), zeilen = a && (a.firmen || []);
  const wann = p.zrText(z, vs);
  return html`<div class="glas-panel block"><div class="block-kopf"><b>Abrechnung nach Firma</b><span class="leise">${wann} · ${de(preis, 2)} € je kWh</span></div>
      ${!zeilen ? LAEDT : !zeilen.length ? html`<div class="leer">Noch kein Verbrauch in diesem Zeitraum</div>` : zeilen.map(f => html`<div class="ab-firma ${f.eigen ? 'eigen' : ''}"><div class="ab-kopf"><b>${f.firma}</b><span><b>${de(f.eur, 2)} €</b> <span class="leise">${de(f.kwh, 0)} kWh · ${de(f.anteil, 0)} %</span></span></div>
        ${(f.container || []).map(x => html`<div class="ab-c"><span>${x.name}${lauf.length > 1 ? html` <span class="leise">· ${x.titel}</span>` : nothing}</span><span class="leise">${de(x.kwh, 0)} kWh · ${de(x.eur, 2)} €</span></div>`)}</div>`)}
      <button class="knopf" data-art="firma" @click=${() => p.csv('firma')}>⇩ Abrechnung als CSV</button></div>
    <button class="glas-panel zeile aw-bsd" data-k="bs-detail" @click=${() => p.bsDetail(p.d.entry)}><div><b>🏗 Ganze Baustelle seit Beginn</b>
      <div class="leise">Verbrauch je Monat und Container, Abrechnung nach Firma, CSV – auch während sie läuft</div></div><span class="chev">›</span></button>`;
}

function leistungHeute(p) {
  const d = p.d, Q = d.bereiche.map(b => ({ name: b.name, farbe: farbeVon(b), v: p.verbrauch(d, b.id, 'Tag') }));
  return html`<div class="glas-panel block"><div class="block-kopf"><b>Leistung heute</b><span class="leise">kW je Stunde (Mittel)</span></div>
      <div class="chart-wrap">${Q.some(q => !q.v) ? LAEDT : Q.length ? unsafeHTML(flaeche('kw-heute', Q, STUNDEN, 'kW', 6)) : html`<div class="leer">Noch keine Container</div>`}</div>
      <div class="leise">gestapelt nach Container – oben die ganze Baustelle</div></div>`;
}

function temperaturen(p) {
  const d = p.d, tv = p.s.tv || 'heute', C = d.bereiche.filter(b => !b.pumpe && b.fuehler), aid = p.eid(d, d.entry, 'aussen');
  const aussen = { name: 'Außen', farbe: 'var(--ink2)', aussen: true };
  let inhalt;
  if (tv === 'heute') { const st = p.statistik('Tag');
    inhalt = !st ? LAEDT : unsafeHTML(linien('tp-heute', [...C.map(b => ({ name: b.name, farbe: farbeVon(b), v: [...(st.werte[b.fuehler] || []), null] })), ...(aid ? [{ ...aussen, v: [...(st.werte[aid] || []), null] }] : [])],
      [...STUNDEN, '24'], 6, i => `${String(i).padStart(2, '0')}:00`));
  } else { const n = tv === '7' ? 7 : 30, t = p.tempTage(n);
    inhalt = !t ? LAEDT : unsafeHTML(linien(`tp-${n}`, [...C.map(b => ({ name: b.name, farbe: farbeVon(b), v: t.werte[b.fuehler] || Array(n).fill(null) })), ...(aid ? [{ ...aussen, v: t.werte[aid] || Array(n).fill(null) }] : [])],
      t.tage.map(kurzDatum), n === 7 ? 1 : 5, i => `${wtag(t.tage[i])} ${kurzDatum(t.tage[i])} · Tagesmittel`)); }
  return html`<div class="glas-panel block"><div class="block-kopf"><b>Temperaturen</b><span class="leise">alle Container mit Fühler</span></div>
      <div class="seg">${[['heute', 'Heute'], ['7', '7 Tage'], ['30', '30 Tage']].map(([k, t]) => html`<button data-v=${k} class=${tv === k ? 'on' : ''} @click=${() => p.tvWahl(k)}>${t}</button>`)}</div>
      <div class="chart-wrap">${C.length ? inhalt : html`<div class="leer">Kein Container mit Temperaturfühler</div>`}</div>
      <div class="leise">${tv === 'heute' ? 'Stundenmittel, gestrichelt außen.' : 'Tagesmittel je Container, gestrichelt außen.'}${d.bereiche.some(b => !b.pumpe && !b.fuehler) ? ' Container ohne Fühler fehlen.' : ''}</div></div>`;
}

/* Je Gerät: Ø kW, kWh, Stunden, € – rechnet die Integration (je_geraet) */
function geraeteBlock(p, z, A) {
  const d = p.d, wann = p.zrText(z, p.zrV('aw'));   // gewählter Zeitraum samt ‹ › (z. B. „Oktober 2026“)
  if (!A) return html`<div class="glas-panel block"><div class="block-kopf"><b>Je Gerät</b></div>${LAEDT}</div>`;
  const zeilen = (A.je_geraet || []).map(r => { const b = d.bereiche.find(x => x.id === r.bereich), g = b && b.geraete.find(x => x.id === r.geraet); return g ? { ...r, b, g } : null; }).filter(Boolean);
  const f = (v, k) => zahl(v) ? de(v, k) : '–';
  return html`<div class="glas-panel block"><div class="block-kopf"><b>Je Gerät</b><span class="leise">${wann}</span></div>
      ${zeilen.length ? html`<div class="tab-scroll"><table class="vergleich je-geraet"><tr><th>Gerät</th><th>Ø kW</th><th>Stunden</th><th>kWh</th><th>€</th></tr>
        ${zeilen.map(({ b, g, mittel, kwh, std, eur }) => html`<tr><td><b>${g.n}</b><div class="leise">${b.name} · ${g.typ}</div></td><td>${f(mittel, 2)}</td><td>${f(std, 1)}</td><td>${f(kwh, 1)}</td><td>${zahl(kwh) ? de(eur, 2) : '–'}</td></tr>`)}</table></div>`
        : html`<div class="leer">Noch keine Geräte</div>`}
      ${unsafeHTML(erkl(d.e.erklaer, 'Ø kW ist die mittlere Leistung, während das Gerät läuft – so sieht man, ob ein Heizkörper schwächer ist als angegeben. kWh kommen aus dem Zählerstand des Shelly (ohne Energiezähler „–“), Stunden ≈ kWh ÷ Ø kW, bei Pumpen die gemessene Pumpzeit.'))}</div>`;
}

/* „Was fällt auf“: die Integration wählt aus (logik/auswertung.erkenntnisse), die Seite macht nur den Text */
function erkenntnisse(p, A, z) {
  return ((A && A.erkenntnisse) || []).map(x => ({
    gespart: ['💶', `${de(x.eur, 0)} € gespart`, `Die Automatik spart ${de(x.prozent, 0)} % gegenüber Dauerbetrieb${x.hinweis ? ` (${x.hinweis})` : ''}.`, 'ohne'],
    groesster: ['🔥', `${x.name} verbraucht am meisten`, `${de(x.kwh, 0)} kWh · ${de(x.anteil, 0)} % des Verbrauchs.`, 'geraete'],
    sparsamster: ['⚙', `${x.name} heizt am sparsamsten`, `${de(x.kwh_h, 2)} kWh je Heizstunde.`, 'vergleich'],
    wetter: ['🌡', `Je Grad kälter +${de(x.kwh_je_grad, 1)} kWh am Tag`, [zahl(x.eur_je_grad) ? `≈ ${de(x.eur_je_grad, 2)} € je Grad` : '', zahl(x.null0) ? `unter ${de(x.null0, 0)} °C außen wird geheizt` : ''].filter(Boolean).join(' · '), 'wetter'],
    mehr: ['📈', `${x.prozent} % mehr als ${vglText(p, A) || awVgl(p, z)}`, 'Verbrauch im Vergleich zum Zeitraum davor.', 'verlauf'],
    weniger: ['📉', `${x.prozent} % weniger als ${vglText(p, A) || awVgl(p, z)}`, 'Verbrauch im Vergleich zum Zeitraum davor.', 'verlauf'],
    bauart: ['🔎', `${x.name} braucht ${Math.abs(x.prozent)} % ${x.prozent > 0 ? 'mehr' : 'weniger'} als gleich gebaute`, x.prozent > 0 ? 'Gleicher Aufbau, gleicher Heizkörper – oft eine offene Tür, eine undichte Stelle oder eine falsch eingetragene Leistung.' : 'Gleicher Aufbau, gleicher Heizkörper – weniger geheizt (z. B. öfter leer oder kühler eingestellt).', 'wetter'],
    typ: ['⚖', x.weniger > 0 ? `Ölradiator ${de(x.weniger, 0)} % sparsamer` : `Konvektor ${de(-x.weniger, 0)} % sparsamer`, 'aus eigenen Messungen je Heizstunde.', 'vergleich'],
  })[x.art]).filter(Boolean);
}

/* Ölradiator oder Konvektor (AN-0008, fair): Tabelle, Fußsatz, Ersparnis – Werte von der Integration (typ) */
function vergleichBlock(p, A, z, vs) {
  // AN-0008: fair – nur Zeiten im Modus Thermostat mit Fühler, Container mit einem Typ, kWh je Gradstunde (Integration)
  const T = ['oelradiator', 'konvektor'].map(t => { const x = (A && A.typ && A.typ[t]) || {}; return { kwhG: x.kwh_gradh ?? null, kwhGm2: x.kwh_gradh_m2 ?? null, auf: x.auf ?? null, ab: x.ab ?? null,
    aufKw: x.auf_je_kw ?? null, anzahl: x.anzahl ?? null, kw: x.kw ?? null, m2: x.m2 ?? null, container: x.container || [] }; });
  // FE-0023/AN-0016: je Seite Geräte · kW · m², Bezug der Zahlen (Zählbeginn), Hinweis bei nur einem Container je Art
  const seite = t => zahl(t.anzahl) ? [`${t.anzahl} Heizkörper`, zahl(t.kw) ? `${de(t.kw, 1)} kW` : null, zahl(t.m2) ? `${de(t.m2, 0)} m²` : null].filter(Boolean).join(' · ') : '–';
  const seit = A && A.typ && A.typ.seit ? `${A.typ.seit.slice(8, 10)}.${A.typ.seit.slice(5, 7)}.${A.typ.seit.slice(0, 4)}` : null;
  const nurEiner = !!(A && A.typ && A.typ.nur_einer);
  const vglOk = !!(A && A.typ && A.typ.vergleichbar), aussen = (A && A.typ && A.typ.ausgeschlossen) || [];
  // Was die Ölradiatoren gegenüber Konvektoren gespart haben (Integration: typ.ersparnis)
  const er = A && A.typ && A.typ.ersparnis, zrE = A && A.zeitraum && A.zeitraum.labels ? A.zeitraum : p.zeitraum(z, vs);
  const ersparT = !er ? '' : html`<div class="kennz"><div><b>${de(er.oel_kwh, er.oel_kwh < 100 ? 1 : 0)}</b><span>kWh Ölradiatoren</span></div>
        <div><b>${de(er.konvektor_kwh, er.konvektor_kwh < 100 ? 1 : 0)}</b><span>kWh mit Konvektoren</span></div>
        <div><b class="${er.erspart_eur < 0 ? 'rot-t' : ''}">${de(Math.abs(er.erspart_eur), 2)} €</b><span>${er.erspart_eur < 0 ? 'mehr' : 'erspart'}</span></div></div>
      <div class="leise">${{ Tag: 'kWh je Stunde', Woche: 'kWh je Tag', Monat: 'kWh je Tag' }[z] || 'kWh je Monat'} · ${p.zrText(z, vs)}</div>
      <div class="chart-wrap">${unsafeHTML(flaeche(`typ-er-${z}-${vs}`, [{ name: 'Ölradiatoren (tatsächlich)', v: er.oel, farbe: 'var(--s1)' }], zrE.labels, 'kWh',
        z === 'Tag' ? 6 : z === 'Monat' ? 7 : z === 'Woche' ? 1 : z === 'Jahr' ? 3 : 1, { name: 'mit Konvektoren', v: er.konvektor }))}</div>
      <div class="leise">„Mit Konvektoren“ = der tatsächliche Verbrauch der Ölradiatoren im gewählten Zeitraum mal ${de(er.faktor, 2)} – so viel mehr bzw. weniger brauchen Konvektoren hier je Gradstunde und m².</div>`;
  const f = (v, fn) => zahl(v) ? fn(v) : '–';
  // wie Mockup: fett ist der Nachteil (mehr kWh, langsamer aufheizen, schneller abkühlen); Kosten ohne Hervorhebung
  const nachteil = (i, hoch) => { const a = T[0][i], b = T[1][i]; if (hoch === null || !zahl(a) || !zahl(b) || a === b) return [false, false]; return hoch ? [a > b, b > a] : [a < b, b < a]; };
  const zelle = (v, fett, fn) => fett ? html`<b>${f(v, fn)}</b>` : f(v, fn);
  const zeile = (titel, i, hoch, fn) => { const [x, y] = nachteil(i, hoch); return html`<tr><td>${titel}</td><td>${zelle(T[0][i], x, fn)}</td><td>${zelle(T[1][i], y, fn)}</td></tr>`; };
  const weniger = (A && A.typ && A.typ.weniger) ?? null;
  const cmp = i => zahl(T[0][i]) && zahl(T[1][i]) && T[0][i] !== T[1][i] ? Math.sign(T[0][i] - T[1][i]) : 0;
  // Fußsatz aus den Messwerten, gebaut wie im Mockup („braucht länger, hält die Wärme aber besser und verbraucht rund 16 % weniger“)
  const auf = cmp('auf') < 0 ? 'braucht länger' : cmp('auf') > 0 ? 'heizt schneller auf' : '';
  const ab = cmp('ab') < 0 ? `hält die Wärme ${auf === 'braucht länger' ? 'aber ' : ''}besser` : cmp('ab') > 0 ? 'kühlt schneller ab' : '';
  const vb = weniger > 0 ? `verbraucht rund ${weniger} % weniger` : weniger < 0 ? `verbraucht rund ${-weniger} % mehr` : '';
  const teile = [auf, ab, vb].filter(Boolean), fussSatz = !vglOk ? 'Noch nicht vergleichbar – es braucht je einen Container nur mit Ölradiator und nur mit Konvektor, mit Fühler im Modus Thermostat.'
    : teile.length ? `Der Ölradiator ${teile.length > 1 ? `${teile.slice(0, -1).join(', ')} und ${teile.at(-1)}` : teile[0]}.` : 'Noch zu wenige Messungen für einen Vergleich.';
  return html`<div class="glas-panel block"><div class="block-kopf"><b>Ölradiator oder Konvektor</b><span class="leise">fair: gleiche Regelung · aus eigenen Messungen</span></div>
        <table class="vergleich"><tr><th></th><th>Ölradiator</th><th>Konvektor</th></tr>
          <tr class="vgl-geraete"><td>im Vergleich</td><td class="leise">${seite(T[0])}</td><td class="leise">${seite(T[1])}</td></tr>
          ${zeile('kWh je Gradstunde', 'kwhG', true, v => de(v, 3))}
          ${zeile('kWh je Gradstunde und m²', 'kwhGm2', true, v => de(v, 4))}
          ${zeile('Aufheizen', 'auf', false, v => `${de(v, 1)} °C/h`)}
          ${zeile('Aufheizen je kW', 'aufKw', false, v => `${de(v, 2)} °C/h`)}
          ${zeile('Abkühlen nach Aus', 'ab', true, v => `${de(v, 1)} °C/h`)}
          <tr><td>zählt</td><td class="leise">${T[0].container.join(', ') || '–'}</td><td class="leise">${T[1].container.join(', ') || '–'}</td></tr></table>
        <div class="leise fuss">${fussSatz}</div>
        ${vglOk && nurEiner ? html`<div class="hp-grob vgl-einer">⚠ Nur ein Container je Art – das vergleicht eher diese Container (Dämmung, Größe, Tür) als Ölradiator und Konvektor.</div>` : nothing}
        <div class="leise vgl-bezug">Tabelle: ${seit ? `seit ${seit} (Zählbeginn)` : 'seit Zählbeginn'}, unabhängig vom gewählten Zeitraum; Aufheizen und Abkühlen als gleitendes Mittel der letzten Messungen. Die Prozentzahl rechnet je m².</div>
        ${ersparT}
        ${aussen.length ? html`<div class="leise">Nicht im Vergleich: ${aussen.map(x => `${x.name} (${x.grund})`).join(', ')}.</div>` : nothing}
        <div class="leise">kWh je Gradstunde = Strom je Stunde und °C, um den es drinnen wärmer ist als draußen. Verglichen wird je Container, nicht je Gerät: Ein Container braucht die Wärme, die er verliert, egal wie viele Heizkörper sie liefern – Elektroheizer setzen Strom gleich in Wärme um, Unterschiede kommen vor allem vom Container und vom Nachheizen. Gezählt werden nur Zeiten, in denen ein Container mit Fühler im Modus Thermostat geregelt wird; Container mit beiden Typen zählen nicht.</div></div>`;
}

/* ---- M13/M14: feste Abschnitte ---- */
export const AW_ABSCHNITTE = [['verbrauch', '⚡ Verbrauch & Kosten', 'Verbrauch & Kosten'], ['ersparnis', '🌱 Ersparnis', 'Ersparnis'],
  ['heizperiode', '🌡 Heizperiode & Wetter', 'Heizperiode & Wetter'], ['abrechnung', '🧾 Abrechnung & Export', 'Abrechnung & Export'], ['geraete', '🔌 Geräte & Pumpen', 'Geräte & Pumpen']];
const HERKUNFT = { verbrauch: 'Kosten · Kennzahlen · Verbrauch & Wetter · Was fällt auf · Wer verbraucht was', ersparnis: 'Gespart durch die Automatik · ohne Automatik',
  heizperiode: 'Heizperiode (Hochrechnung) · Signatur · Temperaturen', abrechnung: 'Abrechnung nach Firma · alle CSV · Baustelle seit Beginn', geraete: 'Je Gerät · Ölradiator oder Konvektor' };
export const AW_ZEITRAEUME = [['Tag', 'Tag'], ['Woche', 'Woche'], ['Monat', 'Monat'], ['Jahr', 'Jahr'], ['Heizperiode', 'Heizperiode'], ['Gesamt', 'seit Beginn']];
const VERGLEICHE = [['', 'kein Vergleich'], ['vorperiode', 'Vorperiode'], ['vorjahr', 'Vorjahr'], ['ohne', 'ohne Automatik']];
/* Reihenfolge und ausgeblendete Abschnitte (Integration: aw_reihe, aw_aus); unbekannte fallen weg, fehlende kommen hinten dazu */
export function awReihe(p) {
  const alle = AW_ABSCHNITTE.map(x => x[0]), r = (p.d && Array.isArray(p.d.e.aw_reihe) ? p.d.e.aw_reihe : []).filter(k => alle.includes(k));
  return [...r, ...alle.filter(k => !r.includes(k))];
}
const awAus = p => (p.d && Array.isArray(p.d.e.aw_aus) ? p.d.e.aw_aus : []);
const vglArt = p => { const v = p.s.aw.vergleich ?? 'vorperiode'; return p.s.aw.zeitraum === 'Gesamt' && v !== 'ohne' ? '' : v; };   // seit Beginn: nur „ohne Automatik“
/* Text des Vergleichs aus der Antwort der Integration (welcher Zeitraum) – für die Pfeile */
function vglText(p, A) {
  const v = A && A.vergleich, z = v && v.zeitraum;
  if (!v || !vglArt(p)) return '';
  if (v.art === 'ohne') return 'ohne Automatik';
  return z ? p.zrText(z.art, 0, z) : '';
}
/* Text des gewählten Zeitraums; Heizperiode und „seit Beginn“ aus der Antwort der Integration (Grenzen rechnet sie) */
const zrTextAw = (p, A, z, v) => ((z === 'Heizperiode' || z === 'Gesamt') && A && A.zeitraum && A.zeitraum.von ? p.zrText(z, v, A.zeitraum) : p.zrText(z, v));
const delta = (dl, text, gutWennWeniger = true) => !zahl(dl) ? nothing : html`<em class="aw-delta ${dl > 0 ? 'mehr' : 'weniger'} ${(dl < 0) === gutWennWeniger ? 'gut' : ''}">${dl > 0 ? '▲' : '▼'} ${Math.abs(dl)} %${text ? html` <span class="leise">zu ${text}</span>` : nothing}</em>`;
const kopfAbschnitt = (p, k, t, eigen, A) => html`<span class="aw-anker" data-aw-ab=${k}></span><div class="aw-ab-kopf"><h3>${t}</h3>${eigen
  ? html`<span class="aw-eigen" title="folgt nicht der Zeitraumleiste">⏱ ${eigen}</span>` : html`<span class="leise">${zrTextAw(p, A, p.s.aw.zeitraum, p.zrV('aw'))}${p.s.aw.filter ? ` · ${p.bereichName(p.s.aw.filter)}` : ''}</span>`}</div>`;
/* zu einem Abschnitt springen; ist er per Anordnung aus, zeigt die Einblendung „aw-detail“ den Inhalt (`detail`) */
/* Reiter (Mockup auswertung-kompakt.html, Variante B, abgenommen 26.11.2026): immer nur ein Abschnitt sichtbar; der gewählte,
   sonst der erste der Anordnung */
const sichtbar = p => awReihe(p).filter(k => !awAus(p).includes(k));
export const awReiter = p => { const L = sichtbar(p), r = p.s.aw && p.s.aw.reiter; return L.includes(r) ? r : L[0]; };
/* zu einem Abschnitt wechseln; ist er per Anordnung aus, zeigt die Einblendung „aw-detail“ den Inhalt (`detail`) */
const springe = (p, k, detail) => { if (sichtbar(p).includes(k)) { p.s.aw.reiter = k; Promise.resolve(p.neuZeichnen()).then(() => { const el = p.renderRoot && p.renderRoot.querySelector(`[data-aw-ab="${k}"]`); if (el && el.scrollIntoView) el.scrollIntoView({ behavior: 'smooth', block: 'start' }); }); }
  else if (detail) p.awDetail(detail); };
const reiterLeiste = (p, cls) => html`<div class=${cls} role="tablist">${sichtbar(p).map(k => html`<button class="glas-panel chip ${awReiter(p) === k ? 'on' : ''}" role="tab" aria-selected=${awReiter(p) === k} data-sprung=${k} @click=${() => springe(p, k)}>${((t) => (cls === 'aw-sprung' ? t : t.split(' ')[0]))(AW_ABSCHNITTE.find(x => x[0] === k)[2])}</button>`)}</div>`;
/* „Was fällt auf“ → der Abschnitt, in dem es steht */
const ZU_ABSCHNITT = { ohne: 'ersparnis', geraete: 'verbrauch', vergleich: 'geraete', wetter: 'heizperiode', verlauf: 'verbrauch' };

/* „Wer verbraucht was“: Rangliste der Integration, antippen filtert auf den Container */
function rangListe(p, A) {
  const rang = (A && A.rangliste) || [], max = Math.max(1, ...rang.map(c => c.kwh || 0));
  if (!A) return LAEDT;
  return !rang.length ? html`<div class="leer">Noch kein Verbrauch in diesem Zeitraum</div>` : html`<div class="aw-rang-liste"><div class="gruppe">Wer verbraucht was${p.s.awScope === 'alle' ? '' : ' · antippen filtert'}</div>
      ${rang.map((c, i) => { const hier = p.d.bereiche.find(b => b.id === c.bereich);
        return html`<button class="zeile aw-rz" data-id=${c.bereich} ?disabled=${!hier} @click=${() => { if (p.s.sheet) p.schliessen(); p.awFilter(c.bereich); }}><span><em>${i + 1}</em> ${c.name}${p.s.awScope === 'alle' ? html` <small class="leise">${c.baustelle || ''}</small>` : nothing}</span>
          <span class="aw-rb"><i style="width:${(c.kwh || 0) / max * 100}%;background:${farbeVon(hier)}"></i></span><b>${de(c.kwh, 0)} kWh</b><span class="leise">${de(c.eur, 2)} € · ${zahl(c.kwh_h) ? `${de(c.kwh_h, 2)} kWh/h` : '–'}</span></button>`; })}</div>`;
}

function verbrauchAbschnitt(p, A, z) {
  const S = (A && A.summen) || {}, mitV = !!vglArt(p), v = mitV ? S.veraenderung || {} : {}, vt = vglText(p, A), filt = p.s.aw.filter;
  const E = erkenntnisse(p, A, z);
  return html`<section class="glas-panel aw-ab" data-aw-abschnitt="verbrauch">${kopfAbschnitt(p, 'verbrauch', '⚡ Verbrauch & Kosten', null, A)}
    ${!A ? LAEDT : html`<div class="aw-kz">
      <div><span class="leise">Kosten</span><b class="aw-gross">${zahl(S.eur) ? `${de(S.eur, 2)} €` : '–'}</b>${delta(v.eur, vt)}<div class="leise">zum Preis des Tages${A.simuliert ? ' · simuliert' : ''}</div></div>
      <div><span class="leise">Verbrauch</span><b class="aw-gross">${zahl(S.kwh) ? `${de(S.kwh, 0)} kWh` : '–'}</b>${delta(v.kwh, vt)}</div>
      <div><span class="leise">Heizzeit</span><b class="aw-gross">${zahl(S.heizzeit) ? `${de(S.heizzeit, 0)} h` : '–'}</b>${delta(v.heizzeit, vglArt(p) === 'ohne' ? '' : vt, false)}</div>
      ${filt ? nothing : html`<div><span class="leise">Pumpzeit</span><b class="aw-gross">${zahl(S.pumpzeit) ? `${de(S.pumpzeit, 1)} h` : '–'}</b></div>`}</div>`}
    ${wetterDiagramm(p)}
    ${A && E.length ? html`<div class="aw-erk ${p.narrow ? 'schmal' : ''}"><div class="gruppe">Was fällt auf</div>${E.map(([i, t, x, kk]) => html`<button class="zeile aw-karte" data-k=${kk} @click=${() => springe(p, ZU_ABSCHNITT[kk] || 'verbrauch', kk)}><span class="aw-fic">${i}</span><div><b>${t}</b><div class="leise">${x}</div></div></button>`)}</div>` : nothing}
    ${filt || !A ? nothing : rangListe(p, A)}
  </section>`;
}

function ersparnisAbschnitt(p, A) {
  const S = (A && A.summen) || {}, oa = S.ohne_automatik, g = A && A.gespart_reihen, filt = p.s.aw.filter, h = A && A.hochrechnung, bl = h && h.baseline;
  const reihe = g ? (g.gespart_eur || []) : [], hi = Math.max(0, ...reihe.map(x => x || 0)) || 1;
  return html`<section class="glas-panel aw-ab" data-aw-abschnitt="ersparnis">${kopfAbschnitt(p, 'ersparnis', '🌱 Ersparnis', null, A)}
    ${!A ? LAEDT : filt ? html`<div class="leer">„Ohne Automatik“ rechnet die Integration für die ganze Baustelle – Filter aufheben, um die Ersparnis zu sehen.</div>`
      : !oa ? html`<div class="leer">Noch keine Werte</div>` : html`<div class="aw-kz">
        <div><span class="leise">gespart durch die Automatik</span><b class="aw-gross gruen-t">${de(oa.gespart_eur, 2)} €</b><div class="leise">${de(oa.prozent, 0)} % weniger als ohne Automatik</div></div>
        <div><span class="leise">mit Automatik</span><b class="aw-gross">${de(S.eur, 0)} €</b></div><div><span class="leise">ohne (24/7)</span><b class="aw-gross">${de(oa.ohne_eur, 0)} €</b></div></div>
      ${reihe.length ? html`<div class="aw-balken" title="gespart je ${{ hour: 'Stunde', day: 'Tag', month: 'Monat' }[A.zeitraum && A.zeitraum.periode] || 'Zeitschritt'} (€)">${reihe.map((x, i) => html`<i style="height:${Math.max(0, (x || 0) / hi * 100)}%" title="${((A.zeitraum || {}).labels || [])[i] ?? i + 1} · ${de(x || 0, 2)} €"></i>`)}</div>` : nothing}
      <div class="leise">So rechnet „ohne Automatik“: jeder Heizkörper mit seiner gemessenen Ø-Leistung im Betrieb rund um die Uhr seit Beginn der Baustelle; gespart = ohne Automatik − tatsächlich verbraucht, mal Strompreis des Tages.${oa.hinweis ? ` ⚠ ${oa.hinweis}` : ''}</div>`}
    <div class="aw-zeile2"><span class="leise">${bl && zahl(bl.laeufe) ? `Baseline-Läufe: ${bl.laeufe}` : 'Baseline-Läufe belegen „ohne Automatik“ mit Messungen'}</span><button class="rv-link" data-k="aw-baseline" @click=${() => zuGrundlagen(p)}>Baseline einstellen ›</button></div>
  </section>`;
}

function heizperiodeAbschnitt(p, A) {
  const alle = p.s.awScope === 'alle';
  return html`<section class="glas-panel aw-ab" data-aw-abschnitt="heizperiode">${kopfAbschnitt(p, 'heizperiode', '🌡 Heizperiode & Wetter', 'ganze Heizperiode')}
    ${alle ? html`<div class="leer">Nur für eine Baustelle – „Diese Baustelle“ wählen.</div>` : html`<div class="aw-hp-voll">${heizperiodeVorlage(p, A)}</div>${temperaturen(p)}`}
  </section>`;
}

function abrechnungAbschnitt(p, z) {
  return html`<section class="glas-panel aw-ab" data-aw-abschnitt="abrechnung">${kopfAbschnitt(p, 'abrechnung', '🧾 Abrechnung & Export')}
    ${abrechnung(p, z)}
    <div class="aw-csv"><span class="leise">Alle Exporte an einer Stelle:</span><button class="glas-panel chip" data-aw="csv-firma" @click=${() => p.csv('firma')}>⇩ Abrechnung je Firma</button>
      <button class="glas-panel chip" data-aw="csv" @click=${() => p.csv()}>⇩ Verbrauch je Zeitschritt</button></div>
  </section>`;
}

function geraeteAbschnitt(p, A, z) {
  const alle = p.s.awScope === 'alle';
  return html`<section class="glas-panel aw-ab" data-aw-abschnitt="geraete">${kopfAbschnitt(p, 'geraete', '🔌 Geräte & Pumpen')}
    ${alle ? html`<div class="leer">Nur für eine Baustelle – „Diese Baustelle“ wählen.</div>` : html`${geraeteBlock(p, z, A)}${vergleichBlock(p, A, z, p.zrV('aw'))}`}
  </section>`;
}

/* Kopf: Diese/Alle, ✎ Anordnung (Einblendung im Kopf), 💶 Preis */
function kopf(p, alle) {
  const S = p.s, an = !!S.aw.anord, L = awReihe(p), aus = awAus(p);
  return html`${kopfVorlage('Auswertung', alle ? 'ALLE LAUFENDEN BAUSTELLEN' : p.d.titel, html`<span class="aw-knoepfe">
      <span class="seg glas-panel klein">${[['diese', 'Diese Baustelle'], ['alle', `Alle laufenden (${p.laufende().length})`]].map(([k, t]) => html`<button data-v=${k} data-aw-scope=${k} class=${(S.awScope || 'diese') === k ? 'on' : ''} @click=${() => p.awScopeWahl(k)}>${t}</button>`)}</span>
      <button class="glas-panel chip ${an ? 'amber' : ''}" data-aw="anordnung" @click=${() => p.awAnordnung()}>${an ? '✓ Fertig' : '✎ Anordnung'}</button>
      <button class="glas-panel chip ${S.awSim ? 'sp-chip-sim' : ''}" data-aw="sim" @click=${() => p.simUmschalten()}>💶 ${S.awSim ? `simuliert ${de(p.simPreis(), 2)} €` : 'Preis: tatsächlich'}</button></span>`)}
    ${an ? html`<div class="glas-panel block aw-anord"><div class="gruppe">Abschnitte · gespeichert in der Integration, gleich auf Handy und PC</div>
      ${L.map((k, i) => html`<div class="zeile ${aus.includes(k) ? 'aus' : ''}" data-ab=${k}>${schalterVorlage(!aus.includes(k), () => p.awAbschnittAn(k), 'vor-ort')}
        <div class="aw-zl"><b>${AW_ABSCHNITTE.find(x => x[0] === k)[2]}</b><div class="leise">${HERKUNFT[k]}</div></div>
        <button class="glas-panel chip" ?disabled=${!i} aria-label="nach oben" @click=${() => p.awAbschnittSchieben(k, -1)}>↑</button><button class="glas-panel chip" ?disabled=${i === L.length - 1} aria-label="nach unten" @click=${() => p.awAbschnittSchieben(k, 1)}>↓</button></div>`)}
      <div class="aw-knoepfe-u"><button class="knopf" data-aw="standard" @click=${() => p.awAnordnungStandard()}>↺ Standard</button><button class="knopf amber" @click=${() => p.awAnordnung()}>Fertig</button></div></div>` : nothing}`;
}

/* Band „Simuliert“ (Preis simulieren) – am PC über der Zeitraumleiste, am Handy über der Leiste */
const simBand = p => p.s.awSim ? html`<div class="sp-band">🧮 Simuliert: alle € dieser Auswertung mit <span class="sp-sim"><button class="glas-panel chip" data-d="-0.01" @click=${() => p.spSim(-0.01)}>−</button><b>${de(p.simPreis(), 2)} €/kWh</b><button class="glas-panel chip" data-d="0.01" @click=${() => p.spSim(0.01)}>+</button></span> <button class="rv-link" data-aw="sim-zurueck" @click=${() => p.simUmschalten()}>zurück auf tatsächlich</button></div>` : nothing;

/* Zeitraumleiste: Simuliert-Band, Zeitraum, ‹ › (Tag … Jahr mit Kalender, Heizperiode blättern, seit Beginn fest), Vergleich, Filter */
function leiste(p, A, z, alle) {
  const S = p.s, aw = S.aw, filt = aw.filter, vgl = vglArt(p), v = p.zrV('aw');
  const nav = z === 'Gesamt' ? html`<div class="zr-zeile"><div class="zr-nav glas-panel"><span class="zr-mitte"><b>${zrTextAw(p, A, 'Gesamt', 0)}</b></span></div></div>`
    : z === 'Heizperiode' ? html`<div class="zr-zeile" data-ziel="aw"><div class="zr-nav glas-panel"><button class="zr-pf" ?disabled=${v >= p.zrMax('Heizperiode', p.zrGrenze(alle))} aria-label="früher" @click=${() => p.zrSchritt('aw', p.zrMax('Heizperiode', p.zrGrenze(alle)), 1)}>‹</button>
        <span class="zr-mitte"><b>${zrTextAw(p, A, 'Heizperiode', v)}</b></span><button class="zr-pf" ?disabled=${v <= 0} aria-label="später" @click=${() => p.zrSchritt('aw', 99, -1)}>›</button></div></div>`
    : zeitraumVorlage(p, 'aw', z, p.zrGrenze(alle));
  return html`${simBand(p)}
    <div class="glas-panel aw-leiste aw-zrl ${p.narrow ? '' : 'klebt'}" data-aw-ab-leiste>
      <div class="seg klein">${AW_ZEITRAEUME.map(([k, t]) => html`<button data-v=${k} class=${z === k ? 'on' : ''} @click=${() => p.zeitraumWahl('aw', k)}>${t}</button>`)}</div>
      ${nav}
      <label class="aw-vg">vergleichen mit <select data-aw="vergleich" @change=${e => p.awVergleich(e.target.value)}>${VERGLEICHE.filter(([k]) => !(z === 'Gesamt' && k !== '' && k !== 'ohne')).map(([k, t]) => html`<option value=${k} ?selected=${vgl === k}>${t}</option>`)}</select></label>
      ${filt ? html`<button class="glas-panel chip aw-filter" data-aw="filter-weg" @click=${() => p.awFilter(null)}>Container: ${p.bereichName(filt)} ✕</button>` : nothing}
      ${A && vgl ? html`<span class="leise aw-vg-t">Vergleich: ${vglText(p, A) || 'keiner'}${vgl !== 'ohne' ? ' – graue Balken im Diagramm' : ''}</span>` : nothing}</div>
    ${reiterLeiste(p, 'aw-sprung')}`;
}

/* Daten der Auswertung für den gewählten Zeitraum, Vergleich und Filter */
export function awAntwort(p) {
  const aw = p.s.aw ||= { zeitraum: 'Monat', v: 0 }, z = aw.zeitraum, vs = aw.v || 0;
  return { A: p.awDaten(z, vs, undefined, p.d, undefined, { vergleich: vglArt(p) || 'vorperiode', bereich: aw.filter || null }), z, vs };
}

/* Handy (Mockup auswertung-handy.html, Variante A, abgenommen 26.11.2026): eine klebende Leiste „Monat ▾ ‹ Zeitraum › ⚙“,
   darunter klein Baustelle · Vergleich (· Filter ✕) und die Sprungleiste als eine Zeile zum Wischen; alles Weitere in der
   Einblendung „aw-einstellen“. Der große Kopf erscheint nur für die Anordnung. */
const vgKurz = (p, A) => { const v = vglArt(p); if (!v) return 'kein Vergleich'; const t = vglText(p, A); return t ? `vs. ${t}` : v === 'vorjahr' ? 'vs. Vorjahr' : 'vs. davor'; };
function handyLeiste(p, A, z, alle) {
  const v = p.zrV('aw'), max = z === 'Gesamt' ? 0 : p.zrMax(z, p.zrGrenze(alle)), filt = p.s.aw.filter, auf = () => { p.s.sheet = { art: 'aw-einstellen' }; return p.neuZeichnen(); };
  return html`<div class="glas-panel aw-hl klebt" data-aw-ab-leiste>
    <div class="aw-hl-z1"><button class="glas-panel chip aw-hl-zr" data-aw="zr-wahl" @click=${auf}>${(AW_ZEITRAEUME.find(x => x[0] === z) || [z, z])[1]} ▾</button>
      ${z === 'Heizperiode' || z === 'Gesamt' ? html`<span class="aw-hl-nav"><button aria-label="früher" ?disabled=${v >= max} @click=${() => p.zrSchritt('aw', max, 1)}>‹</button><b>${zrTextAw(p, A, z, v)}</b>
        <button aria-label="später" ?disabled=${v <= 0} @click=${() => p.zrSchritt('aw', max, -1)}>›</button></span>` : html`<span class="aw-hl-kal">${zeitraumVorlage(p, 'aw', z, p.zrGrenze(alle))}</span>`}
      <button class="glas-panel chip aw-hl-ein" data-aw="einstellen" aria-label="Auswertung einstellen" @click=${auf}>⚙</button></div>
    <div class="leise aw-hl-unter">${alle ? 'alle laufenden' : p.d.titel} · ${vgKurz(p, A)}${p.s.awSim ? ` · 💶 ${de(p.simPreis(), 2)} €` : ''}${filt ? html` · <button class="rv-link" data-aw="filter-weg" @click=${() => p.awFilter(null)}>${p.bereichName(filt)} ✕</button>` : nothing}</div>
    ${reiterLeiste(p, 'aw-hl-sprung')}</div>`;
}

/** Einblendung „aw-einstellen“ (Handy): Zeitraum, vergleichen mit, Diese/Alle, Anordnung, Preis */
export function awEinstellenEinblendung(p) {
  const z = p.s.aw.zeitraum, vgl = vglArt(p);
  return html`<div class="griff"></div><div class="block-kopf"><h3>Auswertung einstellen</h3></div>
    <div class="gruppe">Zeitraum</div><div class="seg aw-es-seg">${AW_ZEITRAEUME.map(([k, t]) => html`<button data-v=${k} class=${z === k ? 'on' : ''} @click=${() => p.zeitraumWahl('aw', k)}>${t}</button>`)}</div>
    <div class="gruppe">vergleichen mit</div><div class="seg aw-es-seg">${VERGLEICHE.filter(([k]) => !(z === 'Gesamt' && k !== '' && k !== 'ohne')).map(([k, t]) => html`<button data-vg=${k} class=${vgl === k ? 'on' : ''} @click=${() => p.awVergleich(k)}>${t}</button>`)}</div>
    <div class="gruppe">Baustellen</div><div class="seg aw-es-seg">${[['diese', 'Diese Baustelle'], ['alle', `Alle laufenden (${p.laufende().length})`]].map(([k, t]) => html`<button data-aw-scope=${k} class=${(p.s.awScope || 'diese') === k ? 'on' : ''} @click=${() => p.awScopeWahl(k)}>${t}</button>`)}</div>
    <div class="glas-panel liste aw-es-liste"><button class="zeile" data-aw="anordnung" @click=${() => { p.schliessen(); if (!p.s.aw.anord) p.awAnordnung(); }}><span>✎ Anordnung der Abschnitte</span><span class="chev">›</span></button>
      <button class="zeile" data-aw="sim" @click=${() => p.simUmschalten()}><span>💶 Preis</span><span class="leise">${p.s.awSim ? `simuliert ${de(p.simPreis(), 2)} €` : 'tatsächlich'}</span></button></div>
    <button class="knopf amber" @click=${() => p.schliessen()}>Fertig</button>`;
}

export function auswertungVorlage(p) {
  const { A, z } = awAntwort(p), alle = p.s.awScope === 'alle', aus = awAus(p);
  const S = { verbrauch: () => verbrauchAbschnitt(p, A, z), ersparnis: () => ersparnisAbschnitt(p, A), heizperiode: () => heizperiodeAbschnitt(p, A),
    abrechnung: () => abrechnungAbschnitt(p, z), geraete: () => geraeteAbschnitt(p, A, z) };
  const r = awReiter(p), teile = r ? [S[r]()] : [];
  if (p.narrow) return html`${p.s.aw.anord ? kopf(p, alle) : nothing}${simBand(p)}${handyLeiste(p, A, z, alle)}${teile}`;
  return html`${kopf(p, alle)}${leiste(p, A, z, alle)}${teile}`;
}

/** Einblendung „aw-detail“ (Sprung von Kacheln der Übersicht und aus der Baseline): der passende Teil der Auswertung */
export function awDetailEinblendung(p, s) {
  const { A, z } = awAntwort(p), alle = p.s.awScope === 'alle';
  const T = { abrechnung: () => abrechnung(p, z), geraete: () => (alle ? '' : geraeteBlock(p, z, A)), temperaturen: () => (alle ? '' : temperaturen(p)),
    wetter: () => (alle ? '' : heizperiodeVorlage(p, A, 'sig', 'hpReiterSig')), hochrechnung: () => (alle ? '' : heizperiodeVorlage(p, A)), vergleich: () => vergleichBlock(p, A, z, p.zrV('aw')),
    ohne: () => ersparnisAbschnitt(p, A), rangliste: () => html`<div class="glas-panel block">${rangListe(p, A)}</div>`, verlauf: () => html`<div class="glas-panel block">${wetterDiagramm(p)}</div>`, leistung: () => (alle ? '' : leistungHeute(p)) };
  const inhalt = (T[s.k] || (() => ''))();
  return html`<div class="griff"></div><div class="aw-detail">${inhalt || html`<div class="leer">Nur für diese Baustelle</div>`}</div><button class="knopf leise-k" @click=${() => p.schliessen()}>Schließen</button>`;
}
