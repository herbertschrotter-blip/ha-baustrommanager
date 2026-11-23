// Reiter Pumpen und Pumpenschacht im Detail mit Lit (BSM-022 Stufe 3c). Zahlen kommen aus der Integration (Statistik,
// Struktur); die Seite ordnet nur zu. Diagramme und Schacht-Bild bleiben bis Stufe 4 SVG-Text (unsafeHTML).
import { html, nothing } from 'lit';
import { unsafeHTML } from 'lit/directives/unsafe-html.js';
import { TAGE, de, erkl, stdMin, summe, zahl } from '../hilfen.js';
import { FARBE, TEXT, WARTE, illu, kwVon, wertHtml } from '../tabellen.js';
import { balken } from '../diagramme.js';
import { kopfVorlage, schalterVorlage, stepperVorlage } from './allgemein.js';
import { zeitraumVorlage } from './zeitraum.js';

const LAEDT = html`<div class="leer">Lädt …</div>`;
const CHARTS = [['pumpzeit', 'Pumpzeit'], ['zyklen', 'Zyklen'], ['verbrauch', 'Verbrauch']];

/* Reiter Pumpen (0.7.8, wie 0.6.3): Kennzahlen, Warnungen der Schächte, je Schacht Pumpen und Diagramm, Überwachung */
export function pumpenVorlage(p) {
  const d = p.d, e = d.e, P = d.bereiche.filter(b => b.pumpe), pc = p.s.pchart || 'pumpzeit', st = (k, s, fmt) => stepperVorlage(p, k, s, fmt);
  const heuteNr = TAGE.indexOf(p.z.HEUTE_TAG), pumpen = P.flatMap(b => b.geraete.filter(g => g.rolle === 'pumpe'));
  const W = d.warnungen.filter(w => !w.stumm && P.some(b => b.id === w.b));
  const je = P.map(b => ({ b, h7: p.heizStunden(d, b, 'Woche'), z7: p.zyklen(d, b, 'Woche'), v7: p.verbrauch(d, b.id, 'Woche') }));
  const zyk = je.every(x => x.z7) ? summe(je.map(x => x.z7[heuteNr] || 0)) : null, lauf = je.every(x => x.h7) ? summe(je.map(x => x.h7[heuteNr] || 0)) : null;
  const chartWahl = k => { p.s.pchart = k; p.neuZeichnen(); };
  // UI-Bericht Maßnahme 3: Schwelle und ihre Meldung an einem Ort (vorher Meldungen unter Einstellungen)
  const melden = k => html`<div class="zeile unter" data-m=${k}><span>aufs Handy melden</span>${schalterVorlage(e[k], () => p.einstellungUmschalten(k))}</div>`;
  return html`${kopfVorlage('Pumpen', d.titel)}
      <div class="glas-panel kennz">${[['Zyklen heute', zahl(zyk) ? zyk : '–'], ['Laufzeit heute', stdMin(lauf)], ['Pumpen an', `${pumpen.filter(g => g.an).length} von ${pumpen.length}`]].map(([k, v]) => html`<div><b>${v}</b><span>${k}</span></div>`)}</div>
      ${W.map(w => html`<button class="glas-panel warn-zeile ${w.stufe}" data-id=${w.b} @click=${() => p.gehe('container', w.b)}><b>⚠ ${p.bName(w.b)}: ${w.titel}</b><span class="leise">${p.seitText(w.seitIso)}${w.hilfe ? ` · ${w.hilfe}` : ''}</span></button>`)}
      ${je.map(({ b, h7, z7, v7 }) => { const r = pc === 'zyklen' ? z7 : pc === 'verbrauch' ? v7 : h7;
        return html`<div class="glas-panel block"><div class="block-kopf"><b>${b.name}</b><button class="chip glas-panel" data-id=${b.id} @click=${() => p.containerOeffnen(b.id)}>öffnen ›</button></div>
        <div class="p-schacht"><div class="p-illu">${unsafeHTML(illu(b))}</div><div>${b.geraete.length ? b.geraete.map(g => html`<div class="zeile geraet"><span class="g-ic ${g.an ? 'an' : ''}">💧</span><div class="g-t"><b>${g.n}</b><span class="leise">${!g.erreichbar ? 'offline' : g.an ? `läuft${zahl(g.kwJetzt) ? ` · ${de(g.kwJetzt, 2)} kW` : ''}` : 'aus'}</span></div></div>`) : html`<div class="leise">Noch keine Pumpe</div>`}
          <div class="leise">heute ${z7 ? z7[heuteNr] : '–'} Zyklen · ${stdMin(h7 ? h7[heuteNr] : null)} gelaufen</div></div></div>
        <div class="seg">${CHARTS.map(([k, t]) => html`<button data-pc=${k} class=${k === pc ? 'on' : ''} @click=${() => chartWahl(k)}>${t}</button>`)}</div>
        <div class="chart-wrap">${r ? unsafeHTML(balken(`p${pc}-${b.id}`, r, TAGE, pc === 'zyklen' ? 'Zyklen' : pc === 'verbrauch' ? 'kWh' : 'h', pc === 'zyklen' ? 0 : 1)) : LAEDT}</div></div>`; })}
      <div class="glas-panel block"><div class="block-kopf"><b>Überwachung</b><span class="leise">wann eine Pumpe gemeldet wird – Schwellen und Meldungen</span></div>
        <div class="zeile"><div><b>Trockenlauf</b><div class="leise">Pumpe läuft, zieht aber weniger als</div></div>${st('trocken_w', 5, v => `${de(v, 0)} W`)}</div>${melden('m_trocken')}
        <div class="zeile"><div><b>Dauerlauf</b><div class="leise">läuft ohne Pause länger als</div></div>${st('dauer_min', 5, v => `${v} min`)}</div>${melden('m_dauer')}
        <div class="zeile"><div><b>Schaltet oft</b><div class="leise">mehr Zyklen je Stunde als</div></div>${st('zyklen_h', 1, v => `${v}`)}</div>${melden('m_zyklen')}
        <button class="zeile" data-k="offline-meldung" @click=${() => p.einstGruppe('meldungen')}><div><b>Offline</b><div class="leise">Shelly antwortet nicht (Stromausfall?) – melden nach ${de(e.offline_min, 0)} min, ${e.m_offline ? 'aufs Handy' : 'nicht melden'} · gilt für alle Geräte</div></div><span class="chev">Meldungen ›</span></button>
        <button class="zeile" @click=${() => p.einstGruppe('meldungen')}><span class="blau">Empfänger und weitere Meldungen</span><span class="chev">Einstellungen ›</span></button>
        ${unsafeHTML(erkl(e.erklaer, 'Pumpen werden nie geschaltet, nur überwacht. Ein Zyklus ist einmal an und wieder aus. Viele Zyklen je Stunde deuten auf einen hängenden Schwimmer oder steigendes Grundwasser, Trockenlauf auf einen leeren Schacht oder eine verstopfte Pumpe.'))}</div>`;
}

/* Pumpenschacht im Detail: Kennzahlen und Diagramm (containerLive), Automatik, Pumpen schalten, Überwachung */
export function schachtVorlage(p) {
  const d = p.d, b = p.b, { tabs, c, chart, kennz, zr } = p.containerLive(b);
  const chartWahl = k => { p.s.chart = k; p.neuZeichnen(); };
  return html`<div class="zurueck-zeile"><button class="glas-panel chip" @click=${() => p.gehe('uebersicht')}>‹ Übersicht</button>
        <button class="glas-panel chip" @click=${() => p.einblenden('bereich')}>Bearbeiten</button></div>
      <div class="glas-panel c-held ${b.z}" style="--c:${FARBE[b.z]}">
        <div class="c-illu">${unsafeHTML(illu(b))}</div>
        <div class="c-text"><div class="glas-klein">PUMPENSCHACHT</div><div class="glas-titel">${b.name}</div>
          <div class="c-wert">${unsafeHTML(wertHtml(b))}</div><div class="glas-status"><span class="glas-dot"></span>${TEXT(b)}</div>
          <div class="c-kw">⚡ ${de(kwVon(b))} kW jetzt</div></div>
      </div>
      <button class="glas-panel kennz kennz-knopf c-live-kennz" @click=${() => p.einblenden('verbrauch', { id: b.id })}>${kennz.map(([k, v]) => html`<div><b>${v}</b><span>${k}</span></div>`)}<span class="kennz-mehr">Verbrauch ›</span></button>
      <div class="glas-panel block c-live"><div class="seg">${tabs.map(([k, t]) => html`<button data-c=${k} class=${k === c ? 'on' : ''} @click=${() => chartWahl(k)}>${t}</button>`)}</div>
        ${zeitraumVorlage(p, ...zr)}<div class="chart-wrap">${unsafeHTML(chart)}</div></div>
      <div class="glas-panel liste">
        ${b.tuer ? html`<div class="zeile"><div><b>🚪 ${b.tuer.sensor}</b><div class="leise">${b.tuer.offen ? `offen seit ${b.tuer.offen} min – Heizung pausiert nach ${d.e.tuer_pause} min, Meldung nach ${d.e.tuer_melden} min` : 'zu'}</div></div><span class="tuer-z ${b.tuer.offen ? 'offen' : ''}">${b.tuer.offen ? 'offen' : 'zu'}</span></div>` : nothing}
        <div class="zeile"><span>♨ Automatik für diesen Schacht</span>${schalterVorlage(b.auto, () => p.bereichAuto(b))}</div>
      </div>
      <div class="glas-panel block"><div class="block-kopf"><b>Pumpen</b><span class="leise">Schalten = Handbetrieb bis zum nächsten Schaltpunkt</span></div>
        ${b.geraete.length ? nothing : html`<div class="leise">Noch kein Gerät</div>`}
        ${b.geraete.map((g, i) => html`<div class="zeile geraet" data-i=${i}><span class="g-ic ${g.an ? 'an' : ''}">${g.typ === 'Pumpe' ? '💧' : g.typ === 'Steckdose' || g.typ === 'Bautrockner' ? '⏻' : '♨'}</span>
          <div class="g-t"><b>${g.n}</b><span class="leise">${g.typ} · ${de(g.kw, 2)} kW${g.hand ? html` · <em class="hand">Hand</em>` : nothing}${g.warte ? html` · <em class="warte">wartet – ${(WARTE[g.warte.grund] || WARTE.anschluss_voll)(p.anschluss(b.anschluss).name)}${zahl(g.warte.dran_in_min) ? `, dran in ${g.warte.dran_in_min} min` : ''}</em>` : nothing}</span></div>
          ${b.offline || !g.erreichbar ? html`<span class="leise rot-t">offline</span>` : schalterVorlage(g.an, () => p.geraetSchalten(b, i))}</div>`)}
        <button class="zeile" @click=${() => p.einblenden('bereich')}><span class="blau">Geräte bearbeiten</span><span class="chev">›</span></button></div>
      <div class="glas-panel liste"><div class="zeile"><span>Trockenlauf (unter ${de(d.e.trocken_w, 0)} W beim Laufen)</span><span class="ok">${d.e.m_trocken ? '● überwacht' : '○ aus'}</span></div>
        <div class="zeile"><span>Dauerlauf über ${d.e.dauer_min} min</span><span class="ok">${d.e.m_dauer ? '● überwacht' : '○ aus'}</span></div>
        <div class="zeile"><span>Stromausfall / offline (nach ${de(d.e.offline_min, 0)} min)</span><span class="ok">${d.e.m_offline ? '● überwacht' : '○ aus'}</span></div>
        <button class="zeile" @click=${() => p.gehe('pumpen')}><span class="blau">Schwellen und Meldungen im Reiter Pumpen</span><span class="chev">›</span></button></div>`;
}
