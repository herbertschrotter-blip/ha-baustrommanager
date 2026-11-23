// Übersicht mit Lit (BSM-022 Stufe 3f): Kopf (Baustelle, Strom, Wetter, Leistung), Chips (Automatik, Status, Warnungen),
// Raster der Container und „Meine Kacheln“ (kacheln.js). Zahlen und Texte kommen aus der Integration; die Seite ordnet nur zu.
import { html, nothing } from 'lit';
import { unsafeHTML } from 'lit/directives/unsafe-html.js';
import { de, zahl } from '../hilfen.js';
import { FARBE, TEXT, illu, kwVon, wertHtml } from '../tabellen.js';
import { wetterIcon } from '../symbole.js';
import { bereichVorlage } from './kacheln.js';

export function uebersichtVorlage(p) {
  const d = p.d, B = d.bereiche, kw = B.reduce((s, b) => s + kwVon(b), 0), W = d.warnungen.filter(w => !w.stumm);
  const st = W.filter(w => w.stufe === 'stoerung').length, hi = W.length - st;
  const an = B.flatMap(b => b.geraete).filter(g => g.an).length, alle = B.flatMap(b => b.geraete).length;
  const [wz, wt, wtemp] = p.wetterJetzt(), auf = art => () => p.einblenden(art);
  p.pumpenWerte();
  const L = d.e.staffel && p.last().A.length ? p.last() : null;
  const karte = (b, i) => html`<div class="glas-panel glas-k ${b.z}" role="button" tabindex="0" data-id=${b.id} style="animation-delay:${i * 60}ms;--c:${FARBE[b.z]}" @click=${() => p.containerOeffnen(b.id)}>
        <div class="glas-illu">${unsafeHTML(illu(b))}</div>
        <div class="glas-name">${b.name}</div>${p.firma(b.firma).eigen ? nothing : html`<div class="firma-tag">${p.firma(b.firma).name}</div>`}${b.tuer && b.tuer.offen ? html`<div class="tuer-tag">🚪 offen ${b.tuer.offen} min</div>` : nothing}
        <div class="glas-zeile"><span class="glas-wert">${unsafeHTML(wertHtml(b))}</span><span class="glas-kwk">${de(kwVon(b))} kW</span></div>
        <div class="glas-status"><span class="glas-dot"></span>${TEXT(b)}</div>
        <div class="glas-geraete">${b.geraete.map(g => html`<i class=${g.an ? 'an' : ''}></i>`)}<span>${b.geraete.length} ${b.pumpe ? 'Pumpen' : 'Geräte'}</span></div>
        ${b.bedarf ? html`<button class="bedarf-knopf ${b.bedarfBis ? 'an' : ''}" data-id=${b.id} @click=${e => { e.stopPropagation(); return b.bedarfBis ? p.bedarfAus(b.id) : p.bedarfAuf(b.id); }}>${b.bedarfBis ? `■ bis ${b.bedarfBis}` : '▶ jetzt heizen'}</button>` : nothing}</div>`;
  return html`<div class="glas-kopf glas-panel">
        <div><div class="klickbar" @click=${auf('baustellen')}><div class="glas-klein">BAUSTELLE</div><div class="glas-titel">${d.titel} <span class="pfeil">▾</span></div>
        ${L ? html`<button class="strom-knopf" @click=${e => { e.stopPropagation(); return p.einblenden('strom'); }}>${unsafeHTML(p.stromBalken(L, true))}<span class="strom-t"><b>${de(L.gesamt)} kW</b> · ${L.A.length} ${L.A.length === 1 ? 'Anschluss' : 'Anschlüsse'} · ${L.laufen} Heizkörper an${L.warten ? ` · ${L.warten} wartet` : ''} ›</span></button>` : nothing}</div>
          <button class="kopf-wetter ${d.wetterEid ? '' : 'nur-admin'}" @click=${d.wetterEid ? auf('wetter') : p.nurAdmin(auf('wetterquelle'))}>${unsafeHTML(wetterIcon(wz, 22))}<span>${zahl(wtemp) ? de(wtemp) + '°' : '–'}</span><span class="kw-t">${wt}</span></button></div>
        <button class="glas-kw kw-knopf" title="Leistung jetzt ${de(kw)} kW · Verbrauch in kWh anzeigen" aria-label="Leistung jetzt ${de(kw)} kW – Verbrauch in kWh anzeigen" @click=${auf('verbrauch')}><span class="blitz ${kw ? 'an' : ''}">⚡</span>${de(kw)}<small> kW</small><span class="kw-ziel">Verbrauch <span class="kw-pfeil">›</span></span></button></div>
      <div class="glas-chips">
        <button class="glas-panel chip auto-chip ${d.e.auto ? 'on' : ''}" role="switch" aria-checked=${String(d.e.auto)} title="Automatik ${d.e.auto ? 'ausschalten' : 'einschalten'}" @click=${() => p.automatikUmschalten()}><span class="mini-sw"><i></i></span>Automatik</button>
        <button class="chip-status ${d.e.auto ? 'amber' : ''}" title="Heizplan anzeigen" @click=${auf('heizplan')}>${p.statusText()} <span class="pfeil">›</span></button>
        ${W.length ? html`<button class="glas-panel chip warn-chip ${st ? 'rot' : 'gelb'}" @click=${auf('warnungen')}>⚠ ${W.length === 1 ? `${p.bName(W[0].b)}: ${W[0].titel}`
          : [st ? `${st} ${st === 1 ? 'Störung' : 'Störungen'}` : '', hi ? `${hi} ${hi === 1 ? 'Hinweis' : 'Hinweise'}` : ''].filter(Boolean).join(' · ')}</button>` : nothing}
        <span class="chip-leise">${an} von ${alle} Geräten an</span>
      </div>
      <div class="glas-raster">${B.map(karte)}
        <button class="glas-panel glas-k neu nur-admin" @click=${p.nurAdmin(() => p.einblenden('container-neu'))}><span>+</span>Container</button></div>
      ${bereichVorlage(p)}`;
}
