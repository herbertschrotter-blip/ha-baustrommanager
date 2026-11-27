// Wahl einer Entität mit Suche (UI-Bericht M16, Mockup mockups/kontaktwahl.html, abgenommen von Herbert am 27.11.2026):
// dieselbe Liste überall, wo eine Entität gewählt wird – Container-Seite › Fühler & Kontakte (gilt sofort), Gerät bearbeiten
// und Wetter und Kalender (Entwurf, gilt mit „Speichern“). Suche über Name und Entity-ID, höchstens 30 Treffer; die Liste
// kommt aus den Entitäten von Home Assistant (p.entitaeten), die Seite rechnet nichts.
import { html, nothing } from 'lit';
import { live } from 'lit/directives/live.js';
import { de } from '../hilfen.js';

const TREFFER = 30;

/** Kurzer Zustand einer Entität für die Liste (offen/zu, °C, Wetter …) */
export function zustandText(p, eid) {
  const z = eid && p._hass && p._hass.states[eid]; if (!z) return 'nicht gefunden';
  if (['unavailable', 'unknown'].includes(z.state)) return 'nicht erreichbar';
  if (eid.startsWith('binary_sensor.')) return z.attributes.device_class === 'light' ? (z.state === 'on' ? 'an' : 'aus') : z.state === 'on' ? 'offen' : 'zu';
  if (eid.startsWith('climate.')) return z.attributes.current_temperature !== undefined ? `${de(Number(z.attributes.current_temperature), 1)} °C` : z.state;
  if (eid.startsWith('weather.')) return z.attributes.temperature !== undefined ? `${z.state} · ${de(Number(z.attributes.temperature), 1)} °C` : z.state;
  if (eid.startsWith('calendar.')) return z.state === 'on' ? 'Termin läuft' : 'kein Termin jetzt';
  return `${z.state}${z.attributes.unit_of_measurement ? ` ${z.attributes.unit_of_measurement}` : ''}`;
}

/** Liste mit Suche. o = { platz, liste: [[eid, name]…], wert, leer (Text der Zeile „kein Wert“, null = keine), nimm(eid|null),
 *  schliessen(), fuss (weitere Knöpfe unten) }. Suchtext in s.q (Sheet), wie die Container-Seite. */
export function wahlListe(p, s, o) {
  const q = (s.q || '').trim().toLowerCase(), alle = o.liste;
  const treffer = q ? alle.filter(([eid, n]) => String(n).toLowerCase().includes(q) || eid.toLowerCase().includes(q)) : alle;
  return html`<div class="cs-picker" data-wahl=${o.platz}><input type="search" placeholder="Suchen: Name oder Entity-ID" data-f="suche" .value=${live(s.q || '')} @input=${ev => { s.q = ev.target.value; p.neuZeichnen(); }}>
      ${o.leer ? html`<button class="zeile cs-pk" data-k="leer" @click=${p.nurAdmin(() => o.nimm(null))}><div><b>${o.leer}</b></div><span class="leise">${o.wert ? '' : '✓'}</span></button>` : nothing}
      ${treffer.slice(0, TREFFER).map(([eid, n]) => html`<button class="zeile cs-pk ${eid === o.wert ? 'kw-an' : ''}" data-eid=${eid} @click=${p.nurAdmin(() => o.nimm(eid))}><div><b>${n}</b><div class="cs-id">${eid}</div></div><span class="leise">${eid === o.wert ? '✓ ' : ''}${zustandText(p, eid)}</span></button>`)}
      ${treffer.length > TREFFER ? html`<div class="leise">… ${treffer.length - TREFFER} weitere – genauer suchen</div>` : treffer.length ? nothing : html`<div class="leer">Nichts gefunden</div>`}
      <div class="cs-pk-fuss">${o.fuss || html`<span class="leise">${treffer.length} von ${alle.length}</span>`}<button class="cs-link" @click=${() => o.schliessen()}>schließen</button></div></div>`;
}

/** Wahlfeld für Dialoge mit Entwurf: zeigt Name, Entity-ID und Zustand von ziel[k]; „ändern“ klappt die Liste auf (s.wahl = k).
 *  Die Wahl schreibt nur den Entwurf, gespeichert wird mit „Speichern“. */
export function wahlFeld(p, s, ziel, k, liste, leer) {
  const eid = ziel[k] || '', auf = s.wahl === k;
  const zu = () => { s.wahl = null; s.q = ''; p.neuZeichnen(); };
  return html`<div class="kw-feld" data-f=${k}><button class="zeile kw-wert" data-kw=${k} @click=${() => { s.wahl = auf ? null : k; s.q = ''; p.neuZeichnen(); }}>
      <div>${eid ? html`<b>${p.name(eid) || eid}</b><div class="cs-id">${eid}</div>` : html`<b class="leise">${leer || 'keiner'}</b>`}</div>
      <span class="kw-r">${eid ? html`<span class="leise">${zustandText(p, eid)}</span>` : nothing}<span class="blau">${auf ? 'schließen' : 'ändern'}</span></span></button>
    ${auf ? wahlListe(p, s, { platz: k, liste, wert: eid, leer, nimm: v => { ziel[k] = v || ''; zu(); }, schliessen: zu }) : nothing}</div>`;
}

export const WAHL_CSS = `
.kw-feld { margin-top: 4px; }
.kw-feld > .kw-wert { width: 100%; box-sizing: border-box; border: 1px solid rgba(127,127,127,.35); border-radius: 10px; padding: 8px 10px; background: rgba(127,127,127,.06); text-align: left; display: flex; justify-content: space-between; align-items: center; gap: 10px; }
.kw-r { display: inline-flex; align-items: center; gap: 10px; flex-wrap: wrap; justify-content: flex-end; text-align: right; }
.kw-feld .cs-picker { margin: 6px 0 4px; }
.cs-pk.kw-an b { color: var(--blau); }
@container (max-width: 520px) { .kw-feld > .kw-wert { flex-wrap: wrap; } .kw-r { justify-content: flex-start; } }`;
