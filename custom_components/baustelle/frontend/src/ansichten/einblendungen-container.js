// Einblendungen der Container-Ansicht mit Lit (BSM-022 Stufe 3d): Leistung, Heizzeit, Bei Bedarf, Termin, Lernstand.
// Daten und SVG liefert die Seite (leistungDaten, heizzeitDaten, Diagramme); hier nur die Anzeige. Der Regler der
// Leistung bleibt beim Ziehen und Nachladen stehen – Lit tauscht nur den Datenteil (WU-0012 ohne Sonderweg).
import { html, nothing } from 'lit';
import { live } from 'lit/directives/live.js';
import { unsafeHTML } from 'lit/directives/unsafe-html.js';
import { datum, de, wtag, zahl } from '../hilfen.js';
import { WIEDER } from '../tabellen.js';
import { schalterVorlage } from './allgemein.js';
import { zeitraumVorlage } from './zeitraum.js';
import { startAbschnitt } from './start.js';

const GRIFF = html`<div class="griff"></div>`;
const LAEDT = html`<div class="leer">Lädt …</div>`;
const knopf = (t, fn, art = '') => html`<button class="knopf ${art}" @click=${fn}>${t}</button>`;
const ZEITRAEUME = ['Tag', 'Woche', 'Monat', 'Jahr'];

const leistungTeil = (x, laufend) => html`<div class="kennz"><div><b>${de(x.mittel / 1000, 2)}</b><span>kW im Mittel</span></div><div><b>${de(x.spitze / 1000, 2)}</b><span>kW Spitze</span></div><div><b>${x.messwerte}</b><span>Messwerte</span></div></div>
        <div class="chart-wrap">${unsafeHTML(x.chart)}</div>
        <div class="legende">${x.zeige.map(r => html`<span><i style="background:${r.farbe}"></i>${r.name}</span>`)}<span class="leise">jeder Messwert des Shellys${laufend ? ' · bis jetzt' : ''}</span></div>`;

/* Leistung einer Stunde oder des ganzen Tags (AN-0005, WU-0011) */
export function leistungEinblendung(p, s) {
  const L = p.leistungDaten(s); if (!L) return nothing;
  const stunde = e => { const h = Math.min(+e.target.value, L.max); if (s.h !== h) { s.h = h; p.neuZeichnen(); } };
  const art = k => { s.lart = k; p.neuZeichnen(); };
  const daten = L.zustand === 'ohne' ? html`<div class="leer">Kein Leistungssensor an den Geräten</div>`
    : L.zustand === 'laedt' ? (L.letzt ? html`<div class="lh-laedt">${leistungTeil(L.letzt, L.letzt.laufend)}</div>` : LAEDT) : leistungTeil(L.daten, L.laufend);
  return html`${GRIFF}<div class="block-kopf"><h3>Leistung · ${L.b.name}</h3><span class="leise lh-wert">${L.wert}</span></div>
      <div class="seg">${[['stunde', 'Stunde'], ['tag', 'Tag']].map(([k, t]) => html`<button data-v=${k} class=${(L.ganzerTag ? 'tag' : 'stunde') === k ? 'on' : ''} @click=${() => art(k)}>${t}</button>`)}</div>
      ${zeitraumVorlage(p, 'sheet', 'Tag', p.zrGrenze())}${L.ganzerTag ? nothing : html`<div class="lh-regler" style="--spur:${L.spur}">
        <input type="range" min="0" max="23" step="1" value=${L.h} .value=${live(String(L.h))} data-lh aria-label="Stunde wählen" @input=${stunde} @change=${stunde}>
        <div class="lh-skala">${[0, 6, 12, 18, 23].map(k => html`<span style="left:${(k / 23 * 100).toFixed(1)}%">${k === 23 ? '23' : L.hh(k)}</span>`)}</div></div>`}<div class="lh-daten">${daten}</div>
    ${knopf('Schließen', () => p.schliessen())}`;
}

/* Heizzeit (Pumpzeit) je Stunde, Tag oder Monat (FE-0009, AN-0011) */
export function heizzeitEinblendung(p, s) {
  const H = p.heizzeitDaten(s); if (!H) return nothing;
  const { b, z } = H, seg = html`<div class="seg">${ZEITRAEUME.map(x => html`<button data-v=${x} class=${x === z ? 'on' : ''} @click=${() => p.zeitraumWahl('sheet', x)}>${x}</button>`)}</div>
      ${zeitraumVorlage(p, 'sheet', z, p.zrGrenze())}`;
  if (H.strom) return html`${GRIFF}<div class="block-kopf"><h3>Heizzeit · ${b.name}</h3><span class="leise">${H.text}</span></div>
      ${seg}
      <div class="kennz"><div><b>${zahl(H.su) ? de(H.su, 1) : '–'}</b><span>h eingeschaltet</span></div><div><b>${zahl(H.ss) ? de(H.ss, 1) : '–'}</b><span>h tatsächlich geheizt</span></div>
        <div><b>${zahl(H.su) && H.su > 0 && zahl(H.ss) ? `${de(Math.min(100, H.ss / H.su * 100), 0)} %` : '–'}</b><span>davon mit Strom</span></div></div>
      <div class="leise">h ${H.je} · ${H.text}</div>
      <div class="chart-wrap">${H.chart ? unsafeHTML(H.chart) : LAEDT}</div>
      <div class="leise">Eingeschaltet = der Shelly ist an. Tatsächlich geheizt = es fließt Strom (über ${p.d.e.zieht_w} W) – schaltet der Thermostat am Heizkörper ab, ist der Shelly an, geheizt wird aber nicht. Ohne Leistungssensor gilt die Schaltzeit. „Tatsächlich geheizt“ wird ab 0.8.29 gezählt.</div>${knopf('Schließen', () => p.schliessen())}`;
  return html`${GRIFF}<div class="block-kopf"><h3>${b.pumpe ? 'Pumpzeit' : 'Heizzeit'} · ${b.name}</h3><span class="leise">${H.text}</span></div>
      ${seg}
      <div class="kennz"><div><b>${zahl(H.su) ? de(H.su, 1) : '–'}</b><span>Stunden ${b.pumpe ? 'gepumpt' : 'geheizt'}</span></div><div><b>${H.r ? de(Math.max(...H.r, 0), 1) : '–'}</b><span>h am meisten ${H.je}</span></div></div>
      <div class="leise">h ${H.je} · ${H.text}</div>
      <div class="chart-wrap">${H.chart ? unsafeHTML(H.chart) : LAEDT}</div>${knopf('Schließen', () => p.schliessen())}`;
}

/* Jetzt heizen (Bei Bedarf): Dauer wählen, optional schnell aufheizen, oder lieber einen Termin */
export function bedarfEinblendung(p, s) {
  const b = p.d.bereiche.find(x => x.id === s.cid); if (!b) { p.s.sheet = null; return nothing; }
  const ende = p.arbeitsende(), warm = b.t !== null ? Math.max(0, Math.round((p.sollVon(b) - b.t) * 4)) : null;
  return html`${GRIFF}<h3>${b.name} heizen</h3><div class="leise">Jetzt ${b.t !== null ? `${de(b.t)} °C` : 'ohne Fühler'} · wird ${b.t !== null ? `in etwa ${warm} min warm` : 'sofort eingeschaltet'}</div>
        <div class="zeile"><div><b>⚡ Schnell aufheizen</b><div class="leise">alle Heizkörper zugleich, Vorrang in der Staffelung</div></div>${schalterVorlage(s.boost, () => { s.boost = !s.boost; p.neuZeichnen(); }, 'vor-ort')}</div>
        <div class="bedarf-dauer gross">${[['60', '1 Stunde'], ['120', '2 Stunden'], ...(ende ? [['ende', `bis Arbeitsende (${ende})`]] : []), ['abend', 'bis 19:00']].map(([v, t]) => html`<button class="knopf" data-v=${v} @click=${() => p.bedarfAn(b.id, v)}>▶ ${t}</button>`)}</div>
        <button class="zeile nur-admin" @click=${p.nurAdmin(() => p.einblenden('termin', { id: b.id }))}><span class="blau">Lieber einen Termin eintragen</span><span class="chev">›</span></button>
        ${knopf('Abbrechen', () => p.schliessen(), 'leise-k')}`;
}

/* Termin in den HA-Kalender (Serien als Wiederholung); das Formular ist Entwurf in s.form, getrennt von den Serverdaten */
export function terminEinblendung(p, s) {
  const f = s.form, kal = p.d.termineKal, feld = k => e => { f[k] = e.target.value; };
  const eingabe = (k, typ = nothing, ph = nothing) => html`<input type=${typ} value=${f[k]} .value=${live(f[k])} placeholder=${ph} data-tm=${k} @input=${feld(k)}>`;
  return html`${GRIFF}<h3>Termin eintragen</h3>
        <label class="feld">Titel${eingabe('titel', nothing, 'z. B. Baubesprechung')}</label>
        <label class="feld">${f.wieder === 'einmal' ? 'Tag' : 'Ab (Wochentag gilt für die Serie)'}${eingabe('datum', 'date')}</label>
        <div class="zeile"><span>Wiederholen</span><div class="seg klein">${Object.entries(WIEDER).map(([k, t]) => html`<button data-v=${k} class=${f.wieder === k ? 'on' : ''} @click=${() => { f.wieder = k; p.neuZeichnen(); }}>${t}</button>`)}</div></div>
        <div class="zeile"><div><b>⚡ Schnell aufheizen</b><div class="leise">vor dem Termin alle Heizkörper zugleich</div></div>${schalterVorlage(f.boost, () => { f.boost = !f.boost; p.neuZeichnen(); }, 'vor-ort')}</div>
        <div class="raster-2"><label class="feld">von${eingabe('von', 'time')}</label><label class="feld">bis${eingabe('bis', 'time')}</label></div>
        ${f.wieder !== 'einmal' && f.datum ? html`<div class="leise">Serie: ${WIEDER[f.wieder]} am ${wtag(f.datum)} ab ${datum(f.datum)}</div>` : nothing}
        <div class="leise">Kommt in den HA-Kalender „${kal ? p.name(kal) : 'Termine'}“ (Serien als Wiederholung im Kalender). Die Heizung startet ${p.d.e.vorheizen} min vorher (Vorheizen) und hört zum Ende auf.</div>
        ${knopf('Eintragen', p.nurAdmin(() => p.terminSpeichern()), 'amber nur-admin')}${knopf('Abbrechen', () => p.schliessen(), 'leise-k')}`;
}

/* Lernstand der lernenden Regelung: Regelparameter, Nachlauf je Heizdauer, Treffer */
export function lernenEinblendung(p, s) {
  const b = p.b, l = b && b.lern; if (!l) { p.s.sheet = null; return nothing; }
  const kalt = (s.lk || 'kalt') === 'kalt', soll = p.sollVon(b), bd = kalt ? 'kalt' : 'mild';
  const balkenK = (name, k) => html`<div class="zeile"><div><b>${name}</b> ${de(k.wert, 3)} <span class="leise">(Start ${de(k.start, 2)})</span>
          <div class="lern-fort"><i style="width:${Math.round(k.fort * 100)}%"></i></div></div><span class="leise">${k.fort >= 1 ? 'gelernt' : `${Math.round(k.fort * 50)}/50 Zyklen`}</span></div>`;
  const zelle = (art, kl) => { const z = (l.nachlauf || {})[`${art}|${kl}|${bd}`];
    return z && z.n ? html`<b>+${de(z.grad)} °C</b><span class="leise">${de(z.min, 0)} min · ${z.n}×</span>` : html`<span class="leise">noch nicht gelernt</span>`; };
  const tr = l.treffer || [], mittel = tr.length ? tr.reduce((x, y) => x + Math.abs(y), 0) / tr.length : null, offen = p.offenText(b);
  return html`${GRIFF}<div class="block-kopf"><h3>Lernstand · ${b.name}</h3><span class="leise">${l.zyklen} Heizzyklen gemessen</span></div>
        ${offen ? html`<div class="wa-heute">${offen}. Laufende Messungen sind verworfen; gelernt wird wieder 10 min, nachdem es vorbei ist.</div>` : nothing}
        ${startAbschnitt(p, b)}
        <div class="gruppe-t">Regelung (TPI, ${l.zyklus_min}-min-Zyklen)</div>
        ${balkenK('K innen – Trägheit des Raums', l.kint)}${balkenK('K außen – Wärmeverlust nach außen', l.kext)}
        <div class="leise">Einschaltanteil = K innen × (Soll − innen − Nachlauf) + K außen × (Soll − außen)</div>
        ${unsafeHTML(p.aufheizTeil(b))}
        <div class="block-kopf"><div class="gruppe-t">Nachlauf nach dem Ausschalten</div><div class="seg klein">${[['kalt', 'kalt < 5 °C'], ['mild', 'mild']].map(([k, t]) => html`<button data-v=${k} class=${(s.lk || 'kalt') === k ? 'on' : ''} @click=${() => { s.lk = k; p.neuZeichnen(); }}>${t}</button>`)}</div></div>
        <div class="lern-tab"><span></span><b>mit Ölradiator</b><b>nur Konvektor</b>
          ${[['kurz', '< 15 min'], ['mittel', '15–45 min'], ['lang', '> 45 min']].map(([kl, t]) => html`<span>${t}</span><div>${zelle('oel', kl)}</div><div>${zelle('konvektor', kl)}</div>`)}</div>
        <div class="leise">Wie weit die Temperatur nach dem Ausschalten noch steigt und wann die Spitze kommt, je nach Heizdauer davor. Zwei Heizkörper zählen mit ihrer Summe.</div>
        <div class="gruppe-t">Soll getroffen · letzte Zyklen (Soll ${de(soll)} °C)</div>
        ${tr.length ? html`<div class="lern-treffer">${tr.map(x => html`<span class=${Math.abs(x) <= .3 ? 'gut' : ''}>${x >= 0 ? '+' : '−'}${de(Math.abs(x))}</span>`)}<b>Ø ±${de(mittel)} °C</b></div>` : html`<div class="leer">Noch keine Messung – der erste Wert kommt nach dem nächsten Ausschalten</div>`}
        ${html`<button class="knopf rot nur-admin" @click=${p.nurAdmin(() => p.lernZuruecksetzen(b))}>Lernstand zurücksetzen</button>`}${knopf('Schließen', () => p.schliessen(), 'leise-k')}`;
}

/** Einblendungen, die Lit zeichnet (Art → Vorlage) */
export const CONTAINER_EINBLENDUNGEN = { leistung: leistungEinblendung, 'heizzeit-c': heizzeitEinblendung, bedarf: bedarfEinblendung, termin: terminEinblendung, lernen: lernenEinblendung };
