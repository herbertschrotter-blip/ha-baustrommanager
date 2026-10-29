// Baseline-Läufe anzeigen (J4b, Ticket FE-0033, Mockup baseline.html Variante B, Herbert 29.10.2026; Bauplan Hochrechnung §6):
// Karte „🧪 Baseline messen“ in Heizung › Regeln (Schalter, Kostenrahmen − 60 € +, nächster Lauf mit „Absagen“ bzw.
// „Lauf abbrechen“, Link zur Heizperiode), Reiter „Baseline“ der Karte Heizperiode (Stand je Container, Läufe, „einstellen ›“),
// Hinweis unter der Legende der Hochrechnung und Chip im Container-Kopf während eines Laufs. Alle Werte liefert die
// Integration (laufzeit.baseline, laufzeit.container.<id>.baseline; logik/baseline.py); die Seite ordnet nur an.
import { html, nothing } from 'lit';
import { MONATE_LANG, de, zahl } from '../hilfen.js';
import { schalterVorlage } from './allgemein.js';

const TYP = { oelradiator: 'Ölradiator', konvektor: 'Konvektor', gemischt: 'gemischt', '': 'ohne Heizkörper' };
const ST = { geplant: ['geplant', 'amber-t'], laeuft: ['läuft', 'blau-t'], fertig: ['zählt', 'gruen-t'], abgebrochen: ['abgebrochen', 'rot-t'], abgesagt: ['abgesagt', 'leise'] };
const SATZ = 'An freien Tagen heizt ein Container ohne Automatik, nur sein Thermostat am Heizkörper regelt – so wird gemessen, was die Automatik wirklich spart.';
const LISTE_KURZ = 5;
const eur = (x, n = 2) => zahl(x) ? `${de(x, n)} €` : '–';
/* Zeitraum „Sa 31.10. – So 01.11.“ aus den Texten der Integration (von_t, letzter_t) */
const zeitraum = x => `${x.von_t}${x.letzter !== x.von ? ` – ${x.letzter_t}` : ''}`;
const name = (p, bid, fallback) => fallback || ((p.d.bereiche || []).find(b => b.id === bid) || {}).name || bid;
const zurHeizperiode = p => { p.s.hpReiter = 'bl'; p.gehe('auswertung'); return p.awDetail('hochrechnung'); };

/* Kostenrahmen: Balken gemessen · geplant · frei, darunter der Monat; in Regeln mit − 60 € + */
function rahmenZeile(p) {
  const r = p.d.baseline.rahmen || {}, B = r.budget_eur || 0, g = r.gemessen_eur || 0, v = r.geplant_eur || 0;
  const breite = x => B > 0 ? Math.min(100, x / B * 100) : 0, monat = r.monat ? MONATE_LANG[+r.monat.slice(5, 7) - 1] : '';
  return html`<div class="bl-zeile1 bl-rahmen"><div>
      <b>Kostenrahmen</b> <span class="leise">je Monat</span>
      <div class="bl-balken" title="gemessen · geplant · frei"><i class="g" style="width:${breite(g)}%"></i><i class="v" style="width:${breite(v)}%"></i></div>
      <div class="leise">${monat}: ${eur(g)} gemessen${v ? html` · ≈ ${eur(v, 0)} geplant` : nothing} · <b class="bl-rest">${eur(r.rest_eur)} übrig</b></div></div>
    <span class="stepper"><button data-k="bl-rahmen" data-d="-10" @click=${() => p.baselineRahmen(-10)}>−</button><b>${de(p.d.e.baseline_eur, 0)} €</b><button data-k="bl-rahmen" data-d="10" @click=${() => p.baselineRahmen(10)}>+</button></span></div>`;
}

/* Nächster Lauf: läuft (mit bisher und „Lauf abbrechen“), angekündigt (mit „Absagen“) oder voraussichtlich (Vorschau) */
export function naechsterLauf(p) {
  const B = p.d.baseline, l = B.offen, v = B.vorschau;   // offen: logik/baseline.offener
  if (l && l.status === 'laeuft') return html`<div class="glas-panel bl-lauf laeuft"><div class="bl-lauf-k"><b>🧪 Läuft jetzt</b><span class="hp-st blau-t">bis ${l.bis_t}</span></div>
      <div><b>${name(p, l.bereich, l.name)}</b> · ${zeitraum(l)} · alle Heizkörper ohne Automatik, der Thermostat am Gerät regelt</div>
      <div class="leise">bisher ${zahl(l.bisher_kwh) ? `${de(l.bisher_kwh, 1)} kWh · ${eur(l.bisher_eur)}` : '–'} · geschätzt ≈ ${eur(l.schaetzung_eur, 0)} · endet früher bei offener Tür, Taste am Plug, Bedarf oder Termin</div>
      <button class="knopf rot nur-admin" data-k="bl-abbrechen" @click=${p.nurAdmin(() => p.baselineAbsagen(l))}>Lauf abbrechen – Automatik übernimmt</button></div>`;
  if (l) return html`<div class="glas-panel bl-lauf"><div class="bl-lauf-k"><b>Nächster Lauf</b><span class="hp-st amber-t">angekündigt</span></div>
      <div class="bl-gross">${zeitraum(l)} · <b>${name(p, l.bereich, l.name)}</b> · ≈ ${eur(l.schaetzung_eur, 0)}</div>
      <div class="leise">00:00 bis 24:00 · ${TYP[l.typ] || l.typ || ''}${l.angekuendigt_t ? ` · Ankündigung ${l.angekuendigt_t} aufs Handy` : ''} · ohne Absage startet er</div>
      <button class="knopf leise-k bl-absagen nur-admin" data-k="bl-absagen" @click=${p.nurAdmin(() => p.baselineAbsagen(l))}>Absagen</button></div>`;
  if (v) return html`<div class="glas-panel bl-lauf leer"><div class="bl-lauf-k"><b>Nächster Lauf</b><span class="hp-st leise">noch nicht geplant</span></div>
      <div class="bl-gross">voraussichtlich ${zeitraum(v)} · <b>${name(p, v.bereich, v.name)}</b> · ≈ ${eur(v.schaetzung_eur, 0)}</div>
      <div class="leise">wird ${v.plant_am_t} geplant und aufs Handy angekündigt (mit „Absagen“) – nur Wochenende und freie Tage</div></div>`;
  return nothing;
}

/* Heizung › Regeln: Karte „🧪 Baseline messen“ (vor den festen Regeln) */
export function baselineRegeln(p) {
  const B = p.d.baseline;
  if (!B) return nothing;
  const an = p.d.e.baseline, n = an ? naechsterLauf(p) : nothing;
  return html`<div class="rv-kopf bl-regeln"><b>🧪 Baseline messen</b><span class="leise">Testläufe ohne Automatik</span></div>
    <div class="rv-karte bl-rv" data-r="baseline"><div class="zeile"><div><b>Baseline messen</b><div class="leise">${SATZ}</div></div>${schalterVorlage(an, () => p.baselineUmschalten())}</div>
      ${an ? html`<div class="zeile unter bl-rv-rahmen">${rahmenZeile(p)}</div>${n === nothing ? nothing : html`<div class="bl-rv-lauf">${n}</div>`}
        <div class="zeile unter"><span class="leise">Stand je Container und alle Läufe</span><button class="rv-link" data-k="bl-heizperiode" @click=${() => zurHeizperiode(p)}>Auswertung › Heizperiode ›</button></div>` : nothing}</div>`;
}

/* Reiter „Baseline“ der Heizperiode: Stand je Container und Läufe; Einstellen unter Heizung › Regeln */
function standListe(p) {
  const C = p.d.baseline.container || [];
  return html`<div class="bl-titel">Stand je Container</div>
    <div class="bl-stand">${C.map(c => {
      const t = c.tage, n = c.noetig, uebernimmt = (c.uebernimmt || []).map(x => name(p, x)).join(', ');
      const rechts = c.kein_lauf ? html`<span class="leise">${c.kein_lauf} – kein Lauf</span>`
        : c.fertig ? html`<span class="hp-st gruen-t">Signatur ohne: gut · fertig ✓</span>`
        : c.stand ? html`<span class="hp-st">Signatur ohne: ${c.stand === 'lernt' ? 'lernt' : c.stand} · ${t}/${n} Tage</span>`
        : html`<span class="leise">noch nicht gemessen${c.typ === 'gemischt' ? ' · nach den reinen Typen' : ''}${uebernimmt ? ` · rechnet wie ${uebernimmt}` : ''}</span>`;
      return html`<div class="bl-s ${c.kein_lauf ? 'aus' : ''}" data-b=${c.bereich}><b>${name(p, c.bereich, c.name)}</b><span class="leise bl-typ">${TYP[c.typ] ?? c.typ}</span>
        ${c.kein_lauf ? html`<span></span>` : html`<span class="bl-tage" title="${t} von ${n} Tagen ohne Automatik"><span class="bl-tbahn"><i style="width:${Math.min(100, t / n * 100)}%" class=${c.fertig ? 'ok' : ''}></i></span><span class="bl-tz">${t}/${n}</span></span>`}
        ${rechts}</div>`; })}</div>
    <div class="leise">Tage „ohne“ = ganze Tage eines Laufs, die zählen. Ein Container ist fertig, sobald seine Signatur „ohne Automatik“ gut ist;
      dann läuft er nicht mehr. Gemischte Container (Ölradiator und Konvektor) kommen nach den reinen.</div>`;
}
function laufListe(p) {
  const A = (p.d.baseline.laeufe || []).filter(l => l.status !== 'geplant' && l.status !== 'laeuft').slice().reverse();   // neueste zuerst
  if (!A.length) return html`<div class="bl-titel">Läufe</div><div class="leise">Noch keine Läufe.</div>`;
  const zeig = p.s.blAlle ? A : A.slice(0, LISTE_KURZ);
  return html`<div class="bl-titel">Läufe <span class="leise">· ${A.length}</span></div>
    <div class="bl-liste">${zeig.map(l => { const [t, k] = ST[l.status] || [l.status, ''];
      return html`<div class="bl-l" data-l=${l.id}><span class="bl-l-d">${l.von_t}${l.letzter !== l.von ? `–${l.letzter_t.slice(3)}` : ''}</span><span class="bl-l-c">${name(p, l.bereich, l.name)}</span>
        <span class="bl-l-z">${l.status === 'abgesagt' ? '–' : `${l.zaehlt}/${l.tage} Tg`}</span><span class="bl-l-k">${zahl(l.kwh) ? `${de(l.kwh, 1)} kWh` : '–'}</span>
        <span class="bl-l-e">${zahl(l.kosten_eur) ? eur(l.kosten_eur) : '–'}</span><span class="hp-st ${k} bl-l-s">${t}</span>
        ${l.grund ? html`<span class="leise bl-l-g">${l.abbruch_t ? `${l.abbruch_t}: ` : ''}${l.grund}${l.status === 'abgebrochen' ? ` · ${l.zaehlt ? (l.zaehlt === 1 ? 'erster Tag zählt' : `${l.zaehlt} Tage zählen`) : 'kein Tag zählt'}` : ''}</span>` : nothing}</div>`; })}</div>
    ${A.length > LISTE_KURZ ? html`<button class="bl-mehr" data-k="bl-alle" @click=${() => { p.s.blAlle = !p.s.blAlle; p.neuZeichnen(); }}>${p.s.blAlle ? 'weniger ▴' : `alle ${A.length} Läufe ▾`}</button>` : nothing}`;
}
const thermostat = html`<div class="bl-hinweis">🌡 Der Thermostat am Heizkörper schaltet selbst ab, wenn es warm genug ist – genau das misst ein Lauf.
    Annahme: Am Wochenende verstellt niemand die Thermostate (im Lauf festgehalten als „Thermostat unverändert: angenommen“).</div>`;
export function baselineReiter(p) {
  const B = p.d.baseline;
  if (!B) return html`<div class="leer">Keine Heizung auf dieser Baustelle</div>`;
  return html`<div class="bl-zeile1"><div><b>Baseline messen</b> <span class="leise">· ${B.an ? 'an' : 'aus'}</span><div class="leise">Testläufe ohne Automatik – Schalter, Kostenrahmen und Absagen unter Heizung › Regeln.</div></div>
      <button class="chip glas-panel" data-k="bl-einstellen" @click=${() => { p.gehe('heizung'); return p.hzAuf('regeln'); }}>einstellen ›</button></div>
    ${B.an ? naechsterLauf(p) : nothing}${standListe(p)}${laufListe(p)}${thermostat}`;
}

/* Unter der Legende der Hochrechnung, solange „ohne Automatik“ geschätzt ist (Text und Stand von der Integration) */
export function baselineHinweis(p) {
  const B = p.d.baseline;
  if (!B || !B.hinweis) return nothing;
  return html`<div class="bl-leg glas-panel"><span class="bl-leg-ic">🧪</span><div><b>${B.hinweis}</b>
      <div class="leise">${B.stand_t} <a class="hp-link" data-k="bl-zum-reiter" @click=${() => { p.s.hpReiter = 'bl'; p.neuZeichnen(); }}>${B.an ? 'Baseline ›' : 'einschalten ›'}</a></div></div></div>`;
}

/* Container-Kopf während eines Laufs: Chip unter Jetzt statt des Zustands (laufzeit.container.<id>.baseline) */
export function baselineChip(p, b) {
  const L = b.baseline;
  return { k: 'zust', ic: '🧪', ton: 'blau', lang: `Baseline-Lauf bis ${L.bis_t} · Thermostat regelt`, kurz: `bis ${L.bis_t}`, breit: true,
    info: html`Baseline-Lauf von ${L.von_t} 00:00 bis ${L.letzter_t} 24:00: Alle Heizkörper hängen ohne Automatik am Strom, der Thermostat am Heizkörper regelt selbst.
      So misst die Integration, was die Automatik spart.${zahl(L.bisher_kwh) ? ` Bisher ${de(L.bisher_kwh, 1)} kWh · ${eur(L.bisher_eur)}.` : ''}
      Er endet früher, wenn die Tür länger offen ist, jemand die Taste am Plug drückt, Bedarf oder ein Termin kommt.
      <button class="bl-ab nur-admin" data-k="bl-kopf-abbrechen" @click=${p.nurAdmin(() => p.baselineAbsagen({ id: L.lauf_id, status: 'laeuft' }))}>Lauf abbrechen – Automatik übernimmt</button>` };
}

export const BASELINE_CSS = `
.bl-leg { display: flex; gap: 10px; align-items: flex-start; padding: 10px 12px; border-radius: 14px; margin: 8px 0 4px; font-size: 13px; }
.bl-leg-ic { font-size: 18px; line-height: 1.2; } .bl-leg b { font-weight: 600; }
.bl-zeile1 { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 8px 0; border-bottom: 1px solid rgba(127,127,127,.15); }
.bl-zeile1 > div { flex: 1; min-width: 0; }
.bl-balken { display: flex; height: 6px; border-radius: 3px; background: rgba(127,127,127,.2); margin: 6px 0 3px; overflow: hidden; }
.bl-balken i { display: block; height: 100%; } .bl-balken i.g { background: var(--amber); } .bl-balken i.v { background: color-mix(in srgb, var(--amber) 40%, transparent); }
.bl-rest { font-weight: 600; color: var(--ink); }
.bl-lauf { text-align: left; padding: 10px 12px; border-radius: 14px; margin: 10px 0; display: flex; flex-direction: column; gap: 4px; font-size: 13px; }
.bl-lauf.laeuft { box-shadow: inset 3px 0 0 var(--blau); } .bl-lauf.leer { opacity: .9; }
.bl-lauf-k { display: flex; justify-content: space-between; gap: 8px; } .bl-gross { font-size: 15px; } .bl-lauf .knopf { margin-top: 6px; padding: 9px !important; }
.blau-t { color: var(--blau); }
.bl-titel { font-size: 12px; color: var(--ink2); text-transform: uppercase; letter-spacing: .04em; margin: 14px 0 2px; }
.bl-stand { display: flex; flex-direction: column; }
.bl-s { text-align: left; display: grid; grid-template-columns: minmax(80px, auto) 1fr minmax(90px, 140px) auto; gap: 2px 10px; align-items: center; padding: 6px 0; font-size: 13px; border-bottom: 1px solid rgba(127,127,127,.15); }
.bl-s.aus { opacity: .6; } .bl-typ { font-size: 12px; }
.bl-tage { display: flex; align-items: center; gap: 6px; } .bl-tbahn { flex: 1; height: 6px; border-radius: 3px; background: rgba(127,127,127,.2); overflow: hidden; }
.bl-tbahn i { display: block; height: 100%; background: var(--s2); } .bl-tbahn i.ok { background: #30d158; } .bl-tz { font-size: 12px; color: var(--ink2); min-width: 32px; text-align: right; }
.bl-liste { display: flex; flex-direction: column; }
.bl-l { text-align: left; display: grid; grid-template-columns: auto minmax(86px, 1fr) auto auto auto auto; gap: 2px 10px; padding: 6px 0; font-size: 13px; border-bottom: 1px solid rgba(127,127,127,.15); align-items: baseline; }
.bl-l-d { white-space: nowrap; } .bl-l-c { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; } .bl-l-z, .bl-l-k, .bl-l-e { text-align: right; white-space: nowrap; } .bl-l-s { text-align: right; }
.bl-l-g { grid-column: 2 / -1; font-size: 12px; }
.bl-mehr { background: none; border: 0; color: var(--blau); font: inherit; font-size: 13px; padding: 6px 0; cursor: pointer; }
.bl-hinweis { font-size: 12px; color: var(--ink2); margin-top: 12px; padding: 8px 10px; border-radius: 10px; background: rgba(120,120,128,.10); }
.bl-ab { display: block; margin-top: 8px; background: none; border: 0; padding: 0; font: inherit; font-weight: 600; color: var(--rot); cursor: pointer; }
.bl-rv .zeile.unter .bl-zeile1 { border: 0; padding: 0; width: 100%; } .bl-rv-rahmen { display: block !important; }
.bl-rv-lauf { padding: 0 12px; }
.c-rad.bl-ged svg { opacity: .45; }   /* Soll wirkt im Baseline-Lauf nicht: der Thermostat am Heizkörper regelt */
@container (max-width: 520px) {
  .bl-rahmen { flex-wrap: wrap; } .bl-rahmen > div { flex-basis: 100%; }
  .bl-s { grid-template-columns: 1fr auto; } .bl-s .bl-typ { text-align: right; } .bl-s .bl-tage { grid-column: 1 / -1; } .bl-s > :last-child { grid-column: 1 / -1; }
  .bl-l { grid-template-columns: auto 1fr auto; grid-template-areas: "d s c" "z k e" "g g g"; }
  .bl-l-d { grid-area: d; } .bl-l-s { grid-area: s; text-align: left; } .bl-l-c { grid-area: c; text-align: right; }
  .bl-l-z { grid-area: z; text-align: left; } .bl-l-k { grid-area: k; } .bl-l-e { grid-area: e; } .bl-l-g { grid-area: g; }
}`;
