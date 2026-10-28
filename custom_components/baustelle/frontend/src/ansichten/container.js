// Container im Detail mit Lit (BSM-022 Stufe 3d; WU-0004, Mockup glas.html „D mit Thermostat-Rad“). Zahlen, Soll,
// Regeltext und Heizzeiten kommen aus der Integration; die Seite ordnet nur zu. Rad, Tagesdiagramm und Balken bleiben bis
// Stufe 4 SVG-Text (unsafeHTML). Neue Messwerte zeichnen nur, was sich geändert hat (B4).
import { html, nothing } from 'lit';
import { sensorLeisteVorlage } from './geraete.js';
import { unsafeHTML } from 'lit/directives/unsafe-html.js';
import { TAGE, de, kurzDatum, minu, naechsterTermin, plusTage, uhr, wtag, zahl } from '../hilfen.js';
import { FARBE, MODI, TEXT, WIEDER, kwVon } from '../tabellen.js';
import { IC_MINUS, IC_PLUS, IC_POWER } from '../symbole.js';
import { schalterVorlage } from './allgemein.js';
import { zeitraumVorlage } from './zeitraum.js';
import { blaetterZeile } from './wischen.js';   // WU-0020

const OHNE_SOLL = { plan: 'Zeitplan – der Heizkörperthermostat regelt', hand: 'Hand – kein Soll', aus: 'Aus – nur Frostschutz' };

/* Thermostat-Rad (SVG der Seite) mit − + in der Öffnung unten */
function rad(p, b) {
  const mitSoll = p.sollAktiv(b);
  return html`<div class="c-rad">${unsafeHTML(p.cRadSvg(b))}
      ${mitSoll ? html`<div class="c-rad-pm"><button class="c-pm" data-d="-0.5" aria-label="Soll niedriger" @click=${() => p.sollSchritt(b, -0.5)}>${unsafeHTML(IC_MINUS)}</button><button class="c-pm" data-d="0.5" aria-label="Soll höher" @click=${() => p.sollSchritt(b, 0.5)}>${unsafeHTML(IC_PLUS)}</button></div>`
        : html`<div class="leise c-ohne-t">${OHNE_SOLL[b.modus] || ''}</div>`}</div>`;
}

/* Soll gleitend (Herbert 01.10.2026, Mockup soll-gleitend.html): Gefühl unter dem Rad, Verschiebung mit „↺ gleitend“ */
function gefuehl(p, b) {
  if (!p.sollAktiv(b)) return nothing;
  const S = b.sollJ || {}, gl = p.d.e.soll_art === 'gleitend', G = p.d.sollG;
  const knopf = (v, t) => html`<button data-v=${v} @click=${() => p.gefuehl(b, v)}>${t}</button>`;
  return html`<div class="sg-box"><div class="sg-gefuehl">${knopf(-1, '🥶 zu kalt')}${knopf(0, '👍 passt')}${knopf(1, '🥵 zu warm')}</div>
      ${gl && S.versch ? html`<div class="sg-versch"><span>gleitend ${G ? de(G.soll, 1) : '–'} °C <b>${S.versch > 0 ? '+' : '−'}${de(Math.abs(S.versch), 1)}</b> · bis morgen früh</span><button class="glas-panel chip" @click=${() => p.sollZurueck(b)}>↺ gleitend</button></div>` : nothing}
      <div class="sg-gefuehl-t">${gl ? (S.versch ? '+ / − lernt mit wie „zu kalt“ / „zu warm“' : `Soll gleitend ${G ? de(G.soll, 1) : '–'} °C${zahl(S.eigen) && S.eigen ? ` ${S.eigen > 0 ? '+' : '−'}${de(Math.abs(S.eigen), 1)} eigenes Soll = ${de(p.sollVon(b), 1)} °C` : ''} – dein Gefühl hilft beim Lernen`) : 'hilft beim gleitenden Soll (Heizung › Regeln)'}</div></div>`;
}

const ohneFuehler = b => html`<div class="c-ohne glas-panel"><small>LEISTUNG JETZT</small><b>${de(kwVon(b))}<small> kW</small></b><span class="leise">kein Fühler – der Heizkörperthermostat regelt</span></div>`;

/* Kacheln: je Kachel ein eigenes Diagramm (FE-0009) */
function kacheln(p, b) {
  const d = p.d, heuteNr = TAGE.indexOf(p.z.HEUTE_TAG), kwh7 = p.verbrauch(d, b.id, 'Woche'), h7 = p.heizStunden(d, b, 'Woche');
  const kwh = kwh7 ? kwh7[heuteNr] : null, h = h7 ? h7[heuteNr] : null;
  return [['⚡', de(kwVon(b)), 'kW jetzt', 'leistung'], ['🔋', zahl(kwh) ? de(kwh) : '–', 'kWh heute', 'verbrauch'], ['€', zahl(kwh) ? de(kwh * d.e.preis, 2) : '–', 'Kosten heute', 'verbrauch', 'eur'], ['⏱', zahl(h) ? de(h) : '–', 'h Heizzeit', 'heizzeit-c']]
    .map(([i, v, t, s, art]) => html`<button class="glas-panel c-kachel" data-s=${s} @click=${() => p.einblenden(s, art ? { id: b.id, t: art } : { id: b.id })}><span>${i}</span><b>${v}</b><small>${t}</small></button>`);
}

/* Nur bei Bedarf: jetzt heizen, Termine aus dem Kalender (eine Zeile je Serie wie im Mockup, vorbei ist vorbei) */
function bedarf(p, b) {
  const H = p.z.HEUTE, offen = t => t.datum > H || (t.datum === H && t.bis > p.z.JETZT), serien = new Map();
  for (const t of p.d.termine.filter(t => t.b === b.id)) {
    const k = t.rrule && t.uid ? t.uid : t, alt = serien.get(k);
    if (!alt || (!offen(alt) && offen(t))) serien.set(k, t);
  }
  const T = [...serien.values()].filter(t => t.wieder !== 'einmal' || offen(t))
    .map(t => ({ t, n: t.wieder === 'einmal' || offen(t) ? t.datum : naechsterTermin(t, plusTage(H, 1)) })).sort((x, y) => (x.n || '9').localeCompare(y.n || '9'));
  const vor = m => uhr(minu(m) - p.d.e.vorheizen), ende = p.arbeitsende(), kal = p.d.termineKal;
  return html`<div class="glas-panel block"><div class="block-kopf"><b>Nur bei Bedarf</b><span class="leise">heizt nicht nach der Arbeitszeit · sonst nur Frostschutz</span></div>
      ${b.bedarfBis ? html`<div class="bedarf-an"><b>♨ heizt bis ${b.bedarfBis}${b.boost ? ' · ⚡ schnell' : ''}</b><button class="chip glas-panel" @click=${() => p.bedarfAus(b.id)}>Beenden</button></div>`
        : html`<div class="bedarf-dauer">${[['60', '1 h'], ['120', '2 h'], ...(ende ? [['ende', 'bis Arbeitsende']] : [])].map(([v, t]) => html`<button class="chip glas-panel" data-v=${v} @click=${() => p.bedarfAn(b.id, v)}>▶ ${t}</button>`)}</div>`}
      <div class="gruppe-t">Termine · ${kal ? `Kalender „${p.name(kal)}“` : 'kein Kalender gewählt'}</div>
      ${T.length ? T.map(({ t, n }) => html`<div class="zeile ereignis"><span class="zeit t-wann">${t.wieder === 'einmal' ? `${wtag(t.datum)} ${kurzDatum(t.datum)}` : t.wieder === 'woche' ? `jeden ${wtag(t.datum)}` : `jeden 2. ${wtag(t.datum)}`}</span>
          <div><b>${t.von}–${t.bis}</b> ${t.titel}${t.wieder !== 'einmal' ? html` <span class="badge">${WIEDER[t.wieder]}</span>` : nothing}<div class="leise">${n && t.wieder !== 'einmal' ? `nächster ${wtag(n)} ${kurzDatum(n)} · ` : ''}heizt ab ${vor(t.von)}${t.boost ? ' · ⚡ schnell' : ''}</div></div>
          <button class="x nur-admin" title="Termin löschen" @click=${p.nurAdmin(() => p.terminWeg(t))}>✕</button></div>`) : html`<div class="leise">Keine Termine</div>`}
      <button class="zeile nur-admin" @click=${p.nurAdmin(() => p.einblenden(kal ? 'termin' : 'wetterquelle', { id: b.id }))}><span class="blau">${kal ? '+ Termin eintragen' : 'Kalender für Termine wählen'}</span></button></div>`;
}

/* Geräte-Chips: Ein/Aus (Handbetrieb), Schalter „aktiv“, ✎ Gerät bearbeiten */
function geraete(p, b) {
  const d = p.d;
  return b.geraete.map((g, i) => { const off = b.offline || !g.erreichbar, an = g.an && g.aktiv;
    const st = b.stufen && b.stufen.an ? (b.stufen.zusatz.includes(g.id) ? (b.stufen.zusatz_an ? html` · <em class="warte">Zusatz – ${b.stufen.text}</em>` : ' · Zusatz – wartet, einer reicht') : ' · ★ Primär') : '';   // AN-0006, AN-0015
    const info = !g.aktiv ? `${g.status} – die Automatik lässt es aus` : off ? html`<span class="rot-t">offline</span>` : html`${g.typ} · ${an ? de(zahl(g.kwJetzt) ? g.kwJetzt : g.kw, 2) + ' kW' : 'aus'}${st}`;
    return html`<div class="c-chip glas-panel ${an ? 'an' : ''} ${g.aktiv ? '' : 'inaktiv'}" data-i=${i}>
        <span class="c-chip-t">${g.typ === 'Steckdose' || g.typ === 'Bautrockner' ? '⏻' : '♨'} <b>${g.n}</b><small>${info}${g.hand && g.aktiv ? html` · <em class="hand">✋ Hand</em>` : nothing}${g.warte && g.aktiv ? html` · <em class="warte">wartet – ${(d.anschluesse.find(a => a.id === b.anschluss) || {}).name || 'Anschluss'} ausgelastet</em>` : nothing}</small>
          ${g.hand && g.aktiv ? html`<button class="link" @click=${() => p.geraetAutomatik(b, i)}>Automatik übernehmen</button>` : nothing}</span>
        <button class="c-power ${an ? 'an' : ''}" ?disabled=${!g.aktiv || off} aria-label="${g.n} ${g.an ? 'ausschalten' : 'einschalten'}" title="${g.an ? 'Ausschalten' : 'Einschalten'} (Handbetrieb)" @click=${() => p.geraetSchalten(b, i)}>${unsafeHTML(IC_POWER)}</button>
        ${g.status === 'verliehen' || g.status === 'defekt'   /* BSM-034.02: Status ändern im ✎ Gerät */
          ? html`<button class="c-aktiv link nur-admin" data-status=${g.status} title="Status ändern" @click=${p.nurAdmin(() => p.geraetBearbeiten(b, i))}><small>${g.status}</small></button>`
          : html`<label class="c-aktiv" title="Gerät aktiv – aus: die Automatik schaltet es nicht, keine Warnungen">${schalterVorlage(g.aktiv, () => p.geraetAktiv(b, i))}<small>aktiv</small></label>`}
        <button class="bs-ic nur-admin" title="Gerät bearbeiten" aria-label="${g.n} bearbeiten" @click=${p.nurAdmin(() => p.geraetBearbeiten(b, i))}>✎</button></div>`; });
}

export function containerVorlage(p) {
  const d = p.d, b = p.b, { c, chart } = p.containerTeile(b), vT = p.zrV('c-Tag');
  return html`${blaetterZeile(p)}
      <div class="glas-panel c-d-held ${b.z}" style="--c:${FARBE[b.z]}">
        <div class="c-d-info"><div><div class="glas-klein">CONTAINER</div><div class="glas-titel">${b.name}</div>
          <div class="glas-status"><span class="glas-dot"></span>${TEXT(b)}</div><div class="leise">${p.cRegelText(b)}</div></div>
          <div class="c-d-knoepfe"><div class="seg klein">${MODI.map(([k, t]) => html`<button data-v=${k} class=${b.modus === k ? 'on' : ''} ?disabled=${k === 'thermo' && !b.fuehler} title=${k === 'thermo' && !b.fuehler ? 'kein Temperaturfühler' : nothing} @click=${() => p.modusSetzen(b, k)}>${t}</button>`)}</div>
            <button class="glas-panel chip ${b.boost ? 'amber' : ''}" @click=${() => p.boostUmschalten(b)}>⚡ ${b.boost ? 'Aufheizen beenden' : 'Schnell aufheizen'}</button></div></div>
        <div class="c-kern">${b.fuehler && b.t !== null ? html`${rad(p, b)}${gefuehl(p, b)}` : ohneFuehler(b)}</div>
      </div>
      <div class="c-kacheln c-live-kennz">${kacheln(p, b)}</div>
      ${b.bedarf ? bedarf(p, b) : nothing}
      <div class="glas-panel block c-live"><div class="block-kopf"><div class="seg klein">${[['heute', vT ? 'Tag' : 'Heute'], ['woche', 'Woche'], ['stunden', 'Heizzeit']].map(([k, t]) => html`<button data-v=${k} class=${k === c ? 'on' : ''} @click=${() => { p.s.cvd = k; p.neuZeichnen(); }}>${t}</button>`)}</div>
        <span class="leise">${c === 'heute' ? (vT ? 'Temperatur und Verbrauch je Stunde' : p.heuteText(b)) : c === 'woche' ? 'kWh je Tag' : 'Stunden geheizt je Tag'}</span></div>
        ${c === 'heute' ? zeitraumVorlage(p, 'c-Tag', 'Tag', p.zrGrenze()) : zeitraumVorlage(p, 'c-Woche', 'Woche', p.zrGrenze())}
        <div class="chart-wrap">${unsafeHTML(chart)}</div></div>
      <div class="glas-panel block"><div class="block-kopf"><b>Geräte</b><span class="leise">⏻ = Handbetrieb · aktiv aus = die Automatik lässt es aus</span></div>
        ${b.geraete.length ? html`<div class="c-chips">${geraete(p, b)}</div>` : html`<div class="leise">Noch kein Gerät</div>`}</div>
      ${sensorLeisteVorlage(p, b)}
      <div class="glas-panel liste">
        ${b.tuer && b.tuer.offen ? html`<div class="zeile"><div><b>🚪 ${b.tuer.sensor}</b><div class="leise">${b.tuer.offen ? `offen seit ${b.tuer.offen} min – Heizung pausiert nach ${d.e.tuer_pause} min, Meldung nach ${d.e.tuer_melden} min` : 'zu'}</div></div></div>` : nothing}
        ${!b.fuehler || !b.lern ? nothing : html`<div class="zeile"><div><b>🧠 Lernende Regelung</b><div class="leise">${['thermo', 'bedarf'].includes(b.modus) ? 'lernt, wie lange der Raum nach dem Ausschalten nachheizt, und schaltet früher ab' : 'wirkt nur im Modus Thermostat oder Bei Bedarf'}${b.lern.an ? html` · <button class="link" @click=${() => p.einblenden('lernen')}>Lernstand ›</button>` : nothing}</div></div>${schalterVorlage(b.lern.an, () => p.lernenUmschalten(b))}</div>`}
        <div class="zeile"><span>👕 Kleidung trocknen nach Regen</span>${schalterVorlage(b.trocknen, () => p.trocknenUmschalten(b))}</div>
      </div>`;
}
