// Seite „Über“ mit Lit – erster Teil des Lit-Piloten (BSM-022 Stufe 2a.1, docs/bauplan-lit.md).
// Eigene Ansicht und Gruppe der Einstellungen; Ereignisse über @click (kein data-act).
import { html, nothing } from 'lit';
import { unsafeHTML } from 'lit/directives/unsafe-html.js';
import { datum, verNeuer } from './hilfen.js';
import { BEREICH_FARBEN, bcContainer } from './symbole.js';

const NEU_GEPLANT = ['Staffelung der Heizungen je Stromanschluss', 'Arbeitszeiten mit Startdatum, Vor- und Nachheizen', 'Firmen und Abrechnung, Auswertung über alle laufenden Baustellen',
  'Container nur bei Bedarf, Termine und Serien, schnell aufheizen', 'Türkontakt, Warnungen mit Stufen, dauerhaftes Protokoll', 'Handy-Nachrichten mit Knöpfen, Wochen-/Monatsbericht per E-Mail',
  'Glas-Oberfläche mit Himmel nach Tageszeit und Wetter', 'Seite „Über“ und Melden-Knopf'];

/** p = BaustellePanel; mitZurueck: eigene Ansicht (mit „‹ Einstellungen“) oder Gruppe in den Einstellungen.
    V = Version dieser Seite; die Integration (Python) liest ihre Nummer erst beim Neustart von HA – nach einem reinen
    Seiten-Update stehen beide getrennt da */
export function ueberVorlage(p, { mitZurueck = true } = {}) {
  const V = p.seiteVersion, I = p.version, gleich = I === V || I === '–', cl = p.changelog, offen = p.s.cl ?? 0, eigen = cl && cl.find(c => c.version === V);
  const neu = eigen ? eigen.punkte : NEU_GEPLANT;
  const ha = (p.hass && p.hass.config && p.hass.config.version) || '–';
  const umschalten = i => { p.s.cl = (p.s.cl ?? 0) === i ? -1 : i; p.litNeu(); };   // nur dieser Bereich wird neu gezeichnet
  return html`${mitZurueck ? html`<div class="zurueck-zeile"><button class="glas-panel chip" @click=${() => p.gehe('einst')}>‹ Einstellungen</button></div>` : nothing}
      <div class="glas-panel ueber-kopf"><div class="ueber-illu">${unsafeHTML(bcContainer(BEREICH_FARBEN[0], 'heizt'))}</div>
        <div><div class="glas-klein">HOME-ASSISTANT-INTEGRATION</div><div class="glas-titel">Baustelle</div><div class="ueber-v">Version <b>${V}</b>${eigen ? nothing : html` <span class="badge blau-b">in Arbeit</span>`}</div>
          <div class="leise">Heizung und Pumpen auf der Baustelle · ${gleich ? 'Integration und Seite haben dieselbe Nummer'
            : verNeuer(V, I) ? `die Integration läuft noch mit ${I} und übernimmt ${V} beim nächsten Neustart von Home Assistant` : `die Integration ist schon auf ${I} – Seite neu laden`}</div></div></div>
      <div class="glas-panel liste"><div class="gruppe">Dieses System</div>
        ${gleich ? html`<div class="zeile"><span>Integration / Seite</span><span class="leise">${V} · baustelle</span></div>`
          : html`<div class="zeile"><span>Seite</span><span class="leise">${V}</span></div><div class="zeile"><span>Integration</span><span class="leise">${I} · baustelle${verNeuer(V, I) ? ' · bis zum Neustart' : ''}</span></div>`}
        <div class="zeile"><span>Home Assistant</span><span class="leise">${ha}</span></div>
        <div class="zeile"><span>Quellcode</span><span class="leise">GitHub · herbertschrotter-blip/ha-baustrommanager (öffentlich, MIT-Lizenz)</span></div>
        <div class="zeile"><span>Baustellen</span><span class="leise">${p.alle.filter(b => b.aktiv).length} laufend · ${p.alle.filter(b => !b.aktiv).length} abgeschlossen</span></div></div>
      <div class="glas-panel block"><div class="block-kopf"><b>Neu in ${V}</b><span class="leise">${eigen ? datum(eigen.datum) : 'geplant'}</span></div>${neu.map(n => html`<div class="cl-punkt">${n}</div>`)}</div>
      <div class="glas-panel block"><div class="block-kopf"><b>Verlauf</b><span class="leise">aus CHANGELOG.md</span></div>
        ${cl === null ? html`<div class="leer">Lädt …</div>` : !cl.length ? html`<div class="leise">Kein Verlauf vorhanden</div>` : cl.map((c, i) => html`<button class="zeile cl-v" aria-expanded=${offen === i ? 'true' : 'false'} @click=${() => umschalten(i)}><span><b>${c.version}</b> <span class="leise">${datum(c.datum)}</span></span><span class="chev">${offen === i ? '⌄' : '›'}</span></button>
          ${offen === i ? html`<div class="cl-liste">${(c.punkte || []).map(t => html`<div class="cl-punkt">${t}</div>`)}</div>` : nothing}`)}</div>
      ${!p.d || p.d.e.melden ? html`<button class="knopf" @click=${() => p.meldenAuf()}>Fehler, Wunsch oder Anregung melden</button>` : nothing}`;
}
