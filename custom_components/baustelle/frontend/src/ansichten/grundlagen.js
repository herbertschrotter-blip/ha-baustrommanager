// Grundlagen für Hochrechnung und Baseline im Reiter Heizung (UI-Bericht Maßnahme 9, Mockup mockups/grundlagen.html,
// abgenommen von Herbert am 24.11.2026): eine Karte unter den Kacheln, ein Tipp öffnet die Einblendung (Art „hz“, Block
// „grundlagen“) mit Heizperiode, Klimamittel und Baseline messen. Eingestellt wird nur hier; die Auswertung › Heizperiode
// zeigt die Ergebnisse und springt mit „einstellen ›“ hierher. Werte liefert die Integration (Optionen heizperiode_von/_bis,
// Einstellung heizung.klimamittel – leer = Vorgabe Graz aus logik/hochrechnung –, laufzeit.baseline); die Seite ordnet an.
import { html, nothing } from 'lit';
import { MONATE, MONATE_LANG, de } from '../hilfen.js';
import { baselineRegeln } from './baseline.js';

const imZeitraum = (m, [von, bis]) => von <= bis ? m >= von && m <= bis : m >= von || m <= bis;

/** Von überall (Auswertung › Heizperiode, Reiter Baseline) in die Einblendung springen */
export const zuGrundlagen = p => { p.gehe('heizung'); return p.hzAuf('grundlagen'); };

/* Klimamittel der Hochrechnung (Vorgabe oder eigene Werte); lädt mit den Daten der Auswertung */
const hochrechnung = p => { const A = p.s.aw ? p.awDaten(p.s.aw.zeitraum, p.zrV('aw')) : p.awDaten('Monat', 0); return A ? A.hochrechnung || null : undefined; };   // Reiter Auswertung noch nie offen: Monat
const eigeneKlima = p => { const h = ((p.d.r && p.d.r.einstellungen) || {}).heizung || {}; return Array.isArray(h.klimamittel) && h.klimamittel.length === 12; };

/** Karte im Reiter Heizung: drei Zeilen mit der Kurzfassung, jede öffnet die Einblendung */
export function grundlagenKarte(p) {
  const d = p.d, [von, bis] = d.hp, B = d.baseline, auf = () => p.hzAuf('grundlagen'), l = B && B.offen;
  const zeile = (k, titel, text) => html`<button class="zeile gl-zeile" data-k=${`gl-${k}`} @click=${auf}><div><b>${titel}</b><div class="leise">${text}</div></div><span class="chev">›</span></button>`;
  const bl = !B ? null : !d.e.baseline ? 'aus' : `an · höchstens ${de(d.e.baseline_eur, 0)} € je Monat${l ? ` · ${l.status === 'laeuft' ? 'läuft jetzt' : `nächster Lauf ${l.von_t}`}` : ''}`;
  return html`<div class="glas-panel liste gl-karte" data-k="grundlagen"><div class="gruppe">📈 Grundlagen für Hochrechnung und Baseline</div>
      ${zeile('heizperiode', 'Heizperiode', `${MONATE_LANG[von - 1]} – ${MONATE_LANG[bis - 1]}`)}
      ${zeile('klima', 'Klimamittel', eigeneKlima(p) ? 'eigene Werte' : 'Vorgabe Graz 1991–2020')}
      ${bl === null ? nothing : zeile('baseline', '🧪 Baseline messen', bl)}
      <div class="leise gl-fuss">Die Ergebnisse stehen in der Auswertung › Heizperiode.</div></div>`;
}

/* Klimamittel: 12 Monate, Heizperiode hervorgehoben; Speichern bzw. „Vorgabe Graz“ (heizung.klimamittel = null) */
function klima(p, s) {
  const h = hochrechnung(p);
  if (h === undefined) return html`<div class="leise">Lädt …</div>`;
  const K = (s.klima ||= [...((h && h.klima) || [])]);
  if (K.length !== 12) return html`<div class="leise">Klimamittel kommen mit der ersten Hochrechnung.</div>`;
  const speichern = wert => p.setzen(['heizung', 'klimamittel'], wert, 'Gespeichert').then(() => { s.klima = null; p.neuZeichnen(); });
  return html`<div class="gl-klima">${K.map((t, i) => html`<label class=${imZeitraum(i + 1, p.d.hp) ? 'gl-hp' : ''}><span>${MONATE[i]}</span>
      <input inputmode="decimal" data-m=${i} .value=${de(t, 1)} @change=${e => { const v = parseFloat(String(e.target.value).replace(',', '.').replace('−', '-')); if (!isNaN(v)) K[i] = v; }}></label>`)}</div>
    <div class="leise">${h && h.klima_vorgabe ? 'Vorgabe Graz 1991–2020' : 'Eigene Werte'}. Für eine andere Gegend die Monatsmittel der nächsten Station von GeoSphere Austria
      eintragen. Die Hochrechnung nimmt sie für alle Tage ohne Vorhersage. Hervorgehoben: Heizperiode.</div>
    <div class="gl-knoepfe nur-admin"><button class="knopf amber" data-k="gl-klima-speichern" @click=${p.nurAdmin(() => speichern(K.map(v => Math.round(v * 10) / 10)))}>Klimamittel speichern</button>
      <button class="knopf leise-k" data-k="gl-klima-vorgabe" @click=${p.nurAdmin(() => speichern(null))}>↺ Vorgabe Graz</button></div>`;
}

/** Block „grundlagen“ (Einblendung im Reiter Heizung) */
export function grundlagen(p, cls) {
  const d = p.d, [von, bis] = d.hp, s = p.s.sheet || {};
  const wahl = (k, wert, fn) => html`<select data-k=${k} @change=${e => p.nurAdmin(fn)(+e.target.value)}>${MONATE_LANG.map((m, i) => html`<option value=${i + 1} ?selected=${i + 1 === wert}>${m}</option>`)}</select>`;
  const bl = baselineRegeln(p);
  return html`<div class=${cls}>
      <div class="gruppe-t">Heizperiode</div>
      <div class="zeile"><div><b>von – bis</b><div class="leise">derselbe Wert wie ⚙ › Baustelle › Beginn und Ende; gilt für Hochrechnung, Heizgradtage und Baseline</div></div>
        <span class="gl-hp-wahl">${wahl('gl-hp-von', von, v => p.heizperiodeSetzen(v, bis))} – ${wahl('gl-hp-bis', bis, v => p.heizperiodeSetzen(von, v))}</span></div>
      <div class="gruppe-t">Klimamittel · °C außen je Monat</div>
      ${klima(p, s)}
      ${bl === nothing ? nothing : html`<div class="gl-bl">${bl}</div>`}</div>`;
}

export const GRUNDLAGEN_CSS = `
.gl-karte .gl-zeile { text-align: left; } .gl-fuss { padding: 6px 14px 10px; font-size: 12px; }
.gl-hp-wahl { display: flex; align-items: center; gap: 6px; white-space: nowrap; }
.gl-klima { display: grid; grid-template-columns: repeat(auto-fill, minmax(64px, 1fr)); gap: 8px; padding: 6px 0 8px; }
.gl-klima label { display: flex; flex-direction: column; gap: 2px; font-size: 12px; color: var(--ink2); }
.gl-klima input { width: 100%; box-sizing: border-box; padding: 6px; border-radius: 8px; border: 1px solid rgba(127,127,127,.3); background: transparent; color: inherit; font: inherit; }
.gl-klima label.gl-hp span { color: var(--amber); font-weight: 600; } .gl-klima label.gl-hp input { border-color: var(--amber); }
.gl-knoepfe { display: flex; gap: 8px; flex-wrap: wrap; margin: 8px 0 4px; }
.gl-bl { margin-top: 12px; } .gl-bl .bl-regeln { margin-top: 0; }
`;
