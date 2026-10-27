// Melde-Dialog mit Lit – zweiter Teil des Lit-Piloten (BSM-022 Stufe 2a.2, docs/bauplan-lit.md).
// Der Entwurf (Art, Text, Bilder, „Stand mitschicken“) liegt in p.s.sheet.form, getrennt von den Daten der Integration;
// das Textfeld ist mit live() gebunden: Neuzeichnen während des Tippens lässt Text, Auswahl und Fokus stehen.
// Eigene Ereignisse über @click/@input/@change (kein data-act/data-ml/data-mb) – ein Renderer, ein Ereignisweg.
import { html, nothing } from 'lit';
import { live } from 'lit/directives/live.js';
import { kurzDatum, wtag } from './hilfen.js';

export const MB_MAX = 3, MB_PX = 1600;   // WU-0016: Bilder je Meldung, größte Kante
// FE-0027: alle Bilder zusammen höchstens so viele Zeichen (Data-URL) – HA nimmt je WebSocket-Nachricht höchstens 4 MiB
export const MB_SUMME = 3_000_000;
const FRAGE = { fehler: 'Was ist passiert, was hättest du erwartet?', wunsch: 'Was wünschst du dir?', anregung: 'Deine Idee' };

function bilderBox(p, f) {
  const B = f.bilder || [], pc = !p.narrow, auf = pc && typeof navigator !== 'undefined' && navigator.mediaDevices && navigator.mediaDevices.getDisplayMedia;
  const gewaehlt = e => { [...(e.target.files || [])].forEach(x => p.mbDatei(x, 'gewählt')); e.target.value = ''; };
  return html`<div class="mb-box"><div class="mb-kopf"><b>📷 Screenshot</b><span class="leise">${B.length} von ${MB_MAX}</span></div>
      ${B.length >= MB_MAX ? nothing : html`<div class="mb-knoepfe"><label>📎 Bild wählen<input type="file" accept="image/*" multiple @change=${gewaehlt}></label>${auf ? html`<button @click=${() => p.mbFenster()}>🖥 Fenster aufnehmen</button>` : nothing}</div>`}
      <div class="mb-hinweis">${pc ? html`oder einen Screenshot mit <b>Strg+V</b> einfügen (z. B. nach Win+Shift+S)` : 'Screenshot mit den Handy-Tasten machen, dann hier wählen'} · wird auf höchstens ${MB_PX} px verkleinert</div>
      ${B.length ? html`<div class="mb-bilder">${B.map((x, i) => html`<div class="mb-bild ${x.b > x.h ? 'quer' : ''}"><img src=${x.url} alt="Bild ${i + 1}"><button class="x" aria-label="Bild entfernen" @click=${() => { B.splice(i, 1); p.litNeu(); }}>✕</button><small>${x.b}×${x.h} · ${x.kb} KB</small></div>`)}</div>` : nothing}</div>`;
}

/** p = BaustellePanel, f = p.s.sheet.form */
export function meldenVorlage(p, f) {
  const d = p.d;
  const setze = (k, v) => { f[k] = v; p.litNeu(); };
  return html`<div class="griff"></div><h3>Melden</h3><div class="leise">Fehler, Wunsch oder Anregung – landet im Entwicklermenü.</div>
        <div class="seg">${[['fehler', 'Fehler'], ['wunsch', 'Wunsch'], ['anregung', 'Anregung']].map(([k, t]) => html`<button class=${f.art === k ? 'on' : ''} @click=${() => setze('art', k)}>${t}</button>`)}</div>
        <label class="feld">${FRAGE[f.art]}<textarea rows="4" name="ml-text" placeholder="kurz beschreiben" .value=${live(f.text)} @input=${e => { f.text = e.target.value; }}></textarea></label>
        <div class="ml-kontext"><div><span class="leise">Fenster</span> ${f.kontext}</div><div><span class="leise">Version</span> ${p.version} · ${f.geraet} · ${d ? `${wtag(d.z.HEUTE)} ${kurzDatum(d.z.HEUTE)} ${d.z.JETZT}` : ''}</div></div>
        ${bilderBox(p, f)}
        <div class="zeile"><div><b>Stand der Seite mitschicken</b><div class="leise">Zustand und Einstellungen als Anhang – hilft beim Nachstellen, ohne Zugangsdaten</div></div><button class="sw ml-stand ${f.stand ? 'on' : ''}" role="switch" aria-checked=${f.stand ? 'true' : 'false'} @click=${() => setze('stand', !f.stand)}><i></i></button></div>
        <button class="knopf amber ml-senden" @click=${() => p.meldungSenden()}>Senden</button><button class="knopf leise-k ml-zurueck" @click=${() => p.meldenZu()}>Abbrechen</button>`;
}
