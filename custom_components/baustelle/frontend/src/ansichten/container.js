// Container im Detail mit Lit (BSM-022 Stufe 3d; WU-0004, Mockup glas.html „D mit Thermostat-Rad“). Zahlen, Soll,
// Regeltext und Heizzeiten kommen aus der Integration; die Seite ordnet nur zu. Rad, Tagesdiagramm und Balken bleiben bis
// Stufe 4 SVG-Text (unsafeHTML). Neue Messwerte zeichnen nur, was sich geändert hat (B4).
import { html, nothing } from 'lit';
import { sensorLeisteVorlage } from './geraete.js';
import { unsafeHTML } from 'lit/directives/unsafe-html.js';
import { TAGE, de, kurzDatum, minu, naechsterTermin, plusTage, uhr, wtag, zahl } from '../hilfen.js';
import { BATTERIE_SCHWACH, FARBE, MODI, TEXT, WIEDER, kwVon } from '../tabellen.js';
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

/* ---------- Kopf der Container-Ansicht (Mockup container-kopf.html, Variante D2, Herbert 28.10.2026) ----------
   Rad ganz links mit Soll und Gefühl darunter, rechts Name und die Gruppen als Kästchen: Steuerung · Jetzt · Plan · Lernen ·
   Hinweise (nur wenn da). Jeder Chip zeigt ein Feld, das die Integration liefert (laufzeit.container.<id>: text, tuer,
   boost_bis, modus, lernen, soll, symbol.fenster; struktur: sensoren[].batterie); Antippen zeigt den Satz, den die Seite
   schon schreibt (TEXT, cRegelText, warmText, offenText, Tür-Zeile, Soll-Zeile). Handy: kurze Chips (.ck-k). */
const ZUST_IC = { heizt: '🔥', pause: '⏸', aus: '○', frost: '❄', trocknen: '👕', offline: '⚠', bereit: '💤' };
const ZUST_KURZ = { heizt: 'heizt', pause: 'Pause', aus: 'aus', frost: 'Frost', trocknen: 'trocknet', offline: 'offline', bereit: 'bereit' };
const REGEL_T = { plan: 'Heizplan', thermo: 'Thermostat', bedarf: 'bei Bedarf', hand: 'von Hand', aus: 'nur Frostschutz' };
const vz = x => x > 0 ? '+' : '−';

/* Antipp-Zustand je Container (Satz offen, Modus-Auswahl offen) – nur Anzeige, wechselt der Container, ist alles zu */
const ckZ = p => p.s.ck && p.s.ck.id === p.b.id ? p.s.ck : { id: p.b.id, info: null, modus: false, ei: false };
const ckSetzen = (p, x) => { p.s.ck = { ...ckZ(p), ...x }; p.neuZeichnen(); };

/* Takt der lernenden Regelung (Mockup takt.html, Variante B, Herbert 28.10.2026): Art, Minuten, Phase und „bis“ liefert die
   Integration (laufzeit.container.<id>.takt); die Seite formatiert nur (4.5 → „4½“) und zeichnet die 10-Minuten-Runde. */
const minT = x => { const g = Math.floor(x); return Math.abs(x - g - 0.5) < 0.01 ? (g ? `${g}½` : '½') : de(x, 0); };
function rundeBalken(T) {   // an-Teil amber, aus-Teil grau, Marke „jetzt“; bei Soll erreicht kein Balken
  if (T.art === 'erreicht') return nothing;
  const an = T.an_min / T.zyklus_min * 100, jetzt = zahl(T.minute) ? Math.min(100, T.minute / T.zyklus_min * 100) : null;
  return html`<span class="tk-runde" aria-hidden="true"><span class="tk-bahn"><span class="tk-an ${an >= 100 ? 'voll' : ''}" style="flex:${an} 0 0"></span>${an < 100 ? html`<span class="tk-aus" style="flex:${100 - an} 0 0"></span>` : nothing}
      ${jetzt === null ? nothing : html`<span class="tk-jetzt" style="left:${jetzt}%"><i>jetzt</i></span>`}</span>
      <span class="tk-skala">${T.art === 'runde' ? html`<span><i class="tk-q an"></i>${minT(T.an_min)} min an · <i class="tk-q"></i>${minT(T.aus_min)} min aus</span>` : html`<span><i class="tk-q an"></i>dauernd an</span>`}<span>Runde ${T.zyklus_min} min</span></span></span>`;
}
function taktJetzt(p, b, T) {
  const ist = de(b.t), soll = de(p.sollVon(b)), Z = T.zyklus_min, pause = T.phase === 'pause';
  if (T.art === 'dauernd' && !pause) return { k: 'zust', ic: '🔥', ton: 'warm', lang: 'heizt durch', kurz: 'durch', breit: true,
    info: html`Noch deutlich unter dem Soll (${ist} von ${soll} °C): Die Heizung läuft durchgehend. Kurz vor dem Soll läuft sie in Runden (je ${Z} Minuten an und aus), damit es nicht zu warm wird.${rundeBalken(T)}` };
  if (T.art === 'erreicht') return { k: 'zust', ic: '✓', ton: '', lang: 'Soll erreicht', kurz: 'am Soll', breit: true,
    info: html`Soll erreicht (${ist} von ${soll} °C): Die Heizung bleibt aus. Wird es kühler, läuft sie wieder in kurzen Runden.` };
  if (T.art === 'dauernd') return { k: 'zust', ic: '⏸', ton: '', lang: 'Pause', kurz: 'Pause', breit: true,   // Runde unterbrochen (Staffelung)
    info: html`Noch deutlich unter dem Soll (${ist} von ${soll} °C): Die Heizung soll durchgehend laufen. <b>Gerade Pause – sie wartet, bis sie wieder heizen darf.</b>` };
  const lang = `${pause ? 'Pause' : 'an'}${T.bis ? ` bis ${T.bis}` : ''}`;
  const jetzt = T.bis ? (pause ? `Gerade Pause, wieder an um ${T.bis}.` : `Gerade an, Pause ab ${T.bis}.`) : (pause ? 'Gerade Pause – sie wartet, bis sie wieder heizen darf.' : 'Gerade an.');
  return { k: 'zust', ic: pause ? '⏸' : '🔥', ton: pause ? '' : 'warm', lang, kurz: lang, breit: true,
    info: html`Fast am Soll (${ist} von ${soll} °C): Die Heizung läuft in Runden – je ${Z} Minuten etwa ${minT(T.an_min)} min an und ${minT(T.aus_min)} min aus, damit es nicht zu warm wird.
      <b>${jetzt}</b> Je näher am Soll, desto kürzer läuft sie.${rundeBalken(T)}` };
}
function taktRunde(T) {   // ◔ immer sichtbar, solange die Integration einen Takt liefert (Herbert: auch dauernd an / Soll erreicht)
  const Z = T.zyklus_min;
  if (T.art === 'dauernd') return { k: 'takt', ic: '◔', ton: '', lang: 'dauernd an', kurz: 'dauernd', breit: true,
    info: html`Noch weit unter dem Soll: Die Heizung läuft die ganze ${Z}-Minuten-Runde durch. Kurz vor dem Soll läuft sie nur noch einen Teil jeder Runde.${rundeBalken(T)}` };
  if (T.art === 'erreicht') return { k: 'takt', ic: '◔', ton: '', lang: `0 von ${Z} min`, kurz: `0/${Z} min`, breit: true,
    info: `Am Soll: In dieser ${Z}-Minuten-Runde bleibt die Heizung aus (0 von ${Z} min). Wird es kühler, läuft sie wieder einen Teil jeder Runde.` };
  return { k: 'takt', ic: '◔', ton: '', lang: `${minT(T.an_min)} von ${Z} min`, kurz: `${minT(T.an_min)}/${Z} min`, breit: true,
    info: html`In jeder ${Z}-Minuten-Runde läuft die Heizung gerade etwa ${minT(T.an_min)} min (${T.anteil} %). Das rechnet die Automatik laufend neu – je näher am Soll, desto kürzer.${rundeBalken(T)}` };
}

function kopfChips(p, b) {
  const d = p.d, L = [], text = TEXT(b), lern = b.lern && b.lern.an && ['thermo', 'bedarf'].includes(b.modus) ? b.lern : null, T = b.takt;
  const erst = text.split(' · ')[0].replace(/^⚡\s*/, '') || b.z;   // erster Teil des Zustandstexts der Integration
  if (T) L.push(taktJetzt(p, b, T));   // Takt: was gerade läuft und bis wann (statt des Zustandstexts)
  else L.push({ k: 'zust', ic: ZUST_IC[b.z] || '•', ton: b.z === 'heizt' ? 'warm' : b.z === 'frost' ? 'blau' : b.z === 'offline' ? 'rot' : '',
    lang: erst, kurz: ZUST_KURZ[b.z] || erst, info: text });
  if (b.tuer && b.tuer.offen) L.push({ k: 'tuer', ic: '🚪', ton: 'amber', lang: `Tür offen seit ${b.tuer.offen} min`, kurz: `${b.tuer.offen} min`,
    info: `${b.tuer.sensor}: offen seit ${b.tuer.offen} min – Heizung pausiert nach ${d.e.tuer_pause} min, Meldung nach ${d.e.tuer_melden} min` });
  for (const [i, f] of ((b.symbol && b.symbol.fenster) || []).entries()) if (f.sensor && f.zustand && f.zustand !== 'zu')
    L.push({ k: `fenster${i}`, g: 'fenster', ic: '🪟', ton: 'amber', lang: `Fenster ${f.zustand}`, kurz: f.zustand, info: `Fenster (${p.name(f.sensor)}): ${f.zustand}` });
  for (const s of b.sensoren || []) if (s.art === 'fuehler' && zahl(s.batterie) && s.batterie < BATTERIE_SCHWACH)   // Grenze wie die Geräteliste
    L.push({ k: `bat-${s.entity_id}`, g: 'bat', ic: '🔋', ton: s.batterie < 10 ? 'rot' : 'amber', lang: `Fühler schwach ${de(s.batterie, 0)} %`, kurz: `${de(s.batterie, 0)} %`,
      info: `${s.name || p.name(s.entity_id)}: Batterie ${de(s.batterie, 0)} % – bald tauschen` });
  if (lern) {
    const w = lern.warm;
    if (w && w.gelernt && w.plan) L.push({ k: 'warm', ic: '⏱', ton: '', lang: `warm um ${uhr(w.plan.ziel)} · ab ${uhr(w.plan.start)}`, kurz: uhr(w.plan.ziel), info: p.warmText(b) });
    else if (w) L.push({ k: 'warm', ic: '⏱', ton: '', lang: 'Aufheizen lernt noch', kurz: 'lernt', info: p.warmText(b) });
    // „🧠 lernt mit“ entfällt (eingestellt.html C): „Lernende Regelung“ steht nur noch unter Eingestellt, mit dem Satz von dort
    if (lern.offen) L.push({ k: 'lern', ic: '🧠', ton: 'amber', lang: 'lernt gerade nicht', kurz: 'lernt nicht', info: p.offenText(b) || p.cRegelText(b) });
    if (zahl(lern.erwartet)) L.push({ k: 'nach', ic: '↘', ton: '', lang: `wärmt nach +${de(lern.erwartet)}°`, kurz: `+${de(lern.erwartet)}°`,
      info: `Wärmt nach dem Ausschalten noch etwa ${de(lern.erwartet)} °C nach – darum schaltet die Automatik früher ab (bei ${de(lern.aus_bei)} °C).` });
    if (T) L.push(taktRunde(T));
  } else L.push({ k: 'regel', ic: 'ⓘ', ton: '', lang: REGEL_T[b.modus] || 'Regel', kurz: REGEL_T[b.modus] || 'Regel', info: p.cRegelText(b) });
  return L;
}

const chipText = c => html`<span class="ck-l">${c.lang}</span><span class="ck-k">${c.kurz}</span>`;
function chip(p, c) {
  const auf = ckZ(p).info === c.k;
  return html`<button class="ck-chip ${c.ton} ${auf ? 'auf' : ''}" data-k=${c.k} aria-expanded=${auf ? 'true' : 'false'}
      @click=${() => ckSetzen(p, { info: auf ? null : c.k, modus: false })}><span class="ck-ic">${c.ic}</span>${chipText(c)}</button>`;
}
const info = (p, L) => { const c = L.find(x => x.k === ckZ(p).info);
  return c ? html`<div class=${c.breit ? 'ck-info tk-info' : 'ck-info'} role="note"><span>${c.info}</span><button aria-label="schließen" @click=${() => ckSetzen(p, { info: null })}>✕</button></div>` : nothing; };

/* ---------- Eingestellt (Mockup eingestellt.html, Variante C, Herbert 28.10.2026) ----------
   Unter dem Namen zugeklappt „⚙ 11 eingestellt ▾“ (am Desktop im Modus Hand „· n ruhen“), aufgeklappt je Herkunft eine
   Zeile Chips („nur hier“, „Baustelle“); Antippen: ein Satz + „ändern ›“. Was an ist und gilt, Texte, Sätze, Reihenfolge,
   wirkt/grund und das Sprungziel liefert die Integration (laufzeit.container.<id>.eingestellt, logik/eingestellt.py); die
   Seite zählt nur die Chips und bildet `ziel` auf ihre vorhandene Navigation ab. Handy: kurze Chips (.ck-k). */
const EI_ZEILEN = [['container', 'nur hier'], ['baustelle', 'Baustelle']];
const EI_VON = { baustelle: 'Einstellung der Baustelle – gilt für alle Container.', container: 'Einstellung nur dieses Containers.' };
const hin = (p, sel) => p.updateComplete.then(() => { const el = p.ui && p.ui.querySelector(sel); if (el && el.scrollIntoView) el.scrollIntoView({ block: 'center' }); });
/** „ändern ›“: Sprungziel der Integration → vorhandene Wege der Seite (Einblendung, Reiter, Einstellungsgruppe) */
export function eiSpringen(p, ziel) {
  const [art, z] = String(ziel || '').split(':');
  if (art === 'container') { ckSetzen(p, { info: null }); return hin(p, `.c-einst [data-z="${z}"]`); }   // unten in dieser Ansicht
  if (art === 'bearbeiten') { p.einblenden('bereich'); return hin(p, `.sheet [data-zeile="${z}"]`); }   // Container bearbeiten
  if (art === 'regeln') { p.hzAuf('regeln'); return hin(p, `.sheet [data-r="${z}"]`); }   // Heizung › Regeln
  if (art === 'urlaub') return p.hzAuf('urlaub');   // Urlaub & Feiertage
  if (art === 'strom') { p.einstGruppe('strom'); return z ? hin(p, `.ev-inhalt [data-r="${z}"]`) : p.updateComplete; }   // Einstellungen › Strom
  if (art === 'notprogramm') return p.einstGruppe('notprogramm');   // Einstellungen › Notprogramm
  return undefined;
}
function eingestellt(p, b) {
  const L = b.eingestellt || [];
  if (!L.length) return nothing;
  const z = ckZ(p), ruhen = L.filter(c => c.wirkt === false).length, offen = L.find(c => z.info === `ei-${c.k}`);
  const chipE = c => { const k = `ei-${c.k}`, auf = z.info === k, ruht = c.wirkt === false;
    return html`<button class="ck-chip ei-chip ${ruht ? 'ei-ruht' : ''} ${auf ? 'auf' : ''}" data-k=${k} aria-expanded=${auf ? 'true' : 'false'} title=${ruht ? 'an, wirkt gerade nicht' : nothing}
        @click=${() => ckSetzen(p, { info: auf ? null : k, modus: false })}><span class="ck-ic">${c.ic}</span><span class="ck-l">${c.text}</span><span class="ck-k">${c.kurz}</span></button>`; };
  const satz = offen ? html`<div class="ck-info ei-info" role="note"><span>${offen.wirkt === false && offen.grund ? html`<b class="ei-grund">${offen.grund}</b> ` : nothing}${offen.satz}
        <span class="ei-von-t">${EI_VON[offen.von] || ''}</span> <button class="ei-aendern" @click=${() => eiSpringen(p, offen.ziel)}>ändern ›</button></span>
      <button aria-label="schließen" @click=${() => ckSetzen(p, { info: null })}>✕</button></div>` : nothing;
  const zeilen = EI_ZEILEN.map(([v, t]) => [v, t, L.filter(c => c.von === v)]).filter(([, , X]) => X.length)
    .map(([v, t, X]) => html`<div class="ei-zeile" data-von=${v}><span class="ei-von">${t}</span>${X.map(chipE)}</div>`);
  return html`<button class="ck-chip ei-c ${z.ei ? 'auf' : ''}" aria-expanded=${z.ei ? 'true' : 'false'} @click=${() => ckSetzen(p, { ei: !z.ei, info: null, modus: false })}>
      <span class="ck-ic">⚙</span><span class="ck-l">${L.length} eingestellt${ruhen ? html` <span class="ei-ruht-t">· ${ruhen} ruhen</span>` : nothing}</span><span class="ck-k">${L.length} eingestellt</span> ${z.ei ? '▴' : '▾'}</button>
    ${z.ei ? html`<div class="ei-b">${zeilen}</div>${satz}` : nothing}`;
}

/* Soll unter dem Rad: kurze Chips statt Satz (Werte der Integration: soll.eigen/versch, soll_gleitend.soll); „↺ gleitend“ bleibt */
function sollChips(p, b) {
  const S = b.sollJ || {}, gl = p.d.e.soll_art === 'gleitend', G = p.d.sollG, gs = G ? de(G.soll, 1) : '–', L = [];
  if (gl) L.push({ k: 'sgl', ic: '〰', ton: '', lang: `gleitend ${gs}°`, kurz: `${gs}°`,
    info: `Soll gleitend ${gs} °C${zahl(S.eigen) && S.eigen ? ` ${vz(S.eigen)}${de(Math.abs(S.eigen), 1)} eigenes Soll = ${de(p.sollVon(b), 1)} °C` : ''} – dein Gefühl hilft beim Lernen` });
  if (gl && zahl(S.eigen) && S.eigen) L.push({ k: 'seig', ic: '👤', ton: 'amber', lang: `${vz(S.eigen)}${de(Math.abs(S.eigen), 1)} eigen`, kurz: `${vz(S.eigen)}${de(Math.abs(S.eigen), 1)}`,
    info: `Soll gleitend ${gs} °C ${vz(S.eigen)}${de(Math.abs(S.eigen), 1)} eigenes Soll = ${de(p.sollVon(b), 1)} °C – dein Gefühl hilft beim Lernen` });
  if (gl && S.versch) L.push({ k: 'sver', ic: '±', ton: 'amber', lang: `${vz(S.versch)}${de(Math.abs(S.versch), 1)} bis morgen`, kurz: `${vz(S.versch)}${de(Math.abs(S.versch), 1)}`,
    info: `gleitend ${gs} °C ${vz(S.versch)}${de(Math.abs(S.versch), 1)} · bis morgen früh – + / − lernt mit wie „zu kalt“ / „zu warm“ · ↺ gleitend setzt zurück` });
  if (!gl) L.push({ k: 'sfest', ic: 'ⓘ', ton: '', lang: 'Soll fest', kurz: 'fest', info: 'hilft beim gleitenden Soll (Heizung › Regeln)' });
  const zurueck = gl && S.versch ? html`<button class="ck-chip ck-zurueck" title="zurück auf gleitendes Soll" @click=${() => p.sollZurueck(b)}><span class="ck-ic">↺</span><span class="ck-l">gleitend</span><span class="ck-k">gleitend</span></button>` : nothing;
  return html`<div class="ck-soll">${L.map(c => chip(p, c))}${zurueck}</div>${info(p, L)}`;
}
const gefuehl = (p, b) => html`<div class="ck-gefuehl">${[[-1, '🥶', 'zu kalt'], [0, '👍', 'passt'], [1, '🥵', 'zu warm']].map(([v, i, t]) =>
  html`<button data-v=${v} title=${t} aria-label=${t} @click=${() => p.gefuehl(b, v)}>${i}</button>`)}</div>`;

function kopf(p, b) {
  const L = kopfChips(p, b), z = ckZ(p), von = ks => L.filter(c => ks.includes(c.g || c.k));
  const modusT = (MODI.find(m => m[0] === b.modus) || ['', '–'])[1];
  const steuerung = html`<button class="ck-chip modus ${z.modus ? 'auf' : ''}" aria-haspopup="listbox" aria-expanded=${z.modus ? 'true' : 'false'}
        @click=${() => ckSetzen(p, { modus: !z.modus, info: null })}><span class="ck-ic">⚙</span>${modusT} ▾</button>
      <button class="ck-chip ck-boost ${b.boost ? 'amber auf' : ''}" @click=${() => p.boostUmschalten(b)}><span class="ck-ic">⚡</span><span class="ck-l">${b.boost ? 'Aufheizen beenden' : 'Schnell aufheizen'}</span><span class="ck-k">${b.boost ? 'beenden' : 'Aufheizen'}</span></button>`;
  const modi = z.modus ? html`<div class="ck-info ck-modi" role="listbox">${MODI.map(([k, t]) => html`<button role="option" data-v=${k} class=${b.modus === k ? 'on' : ''} aria-selected=${b.modus === k ? 'true' : 'false'}
        ?disabled=${k === 'thermo' && !b.fuehler} title=${k === 'thermo' && !b.fuehler ? 'kein Temperaturfühler' : nothing} @click=${() => { ckSetzen(p, { modus: false }); return p.modusSetzen(b, k); }}>${t}</button>`)}</div>` : nothing;
  const GR = [['Steuerung', steuerung, modi, []], ['Jetzt', null, null, von(['zust', 'tuer', 'fenster'])], ['Plan', null, null, von(['warm', 'regel'])],
    ['Lernen', null, null, von(['lern', 'nach', 'takt'])], ['Hinweise', null, null, von(['bat'])]];
  const gruppe = ([t, fest, dazu, X]) => fest || X.length ? html`<div class="ckd-g" data-g=${t}><div class="ckd-gt">${t}</div><div class="ck-chips">${fest || nothing}${X.map(c => chip(p, c))}</div>${dazu || info(p, X)}</div>` : nothing;
  const mitRad = b.fuehler && b.t !== null, mitSoll = mitRad && p.sollAktiv(b);
  return html`<div class="glas-panel ck ck-d ck-d2 ${b.z}" style="--c:${FARBE[b.z]}">
      <div class="ckd-name ei-name"><div class="ck-name"><span class="ck-art">Container</span><span class="ck-titel">${b.name}</span></div>${eingestellt(p, b)}</div>
      <div class="ckd-rad c-kern">${mitRad ? rad(p, b) : ohneFuehler(b)}${mitSoll ? html`<div class="ckd-soll"><div class="ckd-gt">Soll</div>${sollChips(p, b)}${gefuehl(p, b)}</div>` : nothing}</div>
      <div class="ckd-gruppen">${GR.map(gruppe)}</div></div>`;
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
      ${kopf(p, b)}
      <div class="c-kacheln c-live-kennz">${kacheln(p, b)}</div>
      ${b.bedarf ? bedarf(p, b) : nothing}
      <div class="glas-panel block c-live"><div class="block-kopf"><div class="seg klein">${[['heute', vT ? 'Tag' : 'Heute'], ['woche', 'Woche'], ['stunden', 'Heizzeit']].map(([k, t]) => html`<button data-v=${k} class=${k === c ? 'on' : ''} @click=${() => { p.s.cvd = k; p.neuZeichnen(); }}>${t}</button>`)}</div>
        <span class="leise">${c === 'heute' ? (vT ? 'Temperatur und Verbrauch je Stunde' : p.heuteText(b)) : c === 'woche' ? 'kWh je Tag' : 'Stunden geheizt je Tag'}</span></div>
        ${c === 'heute' ? zeitraumVorlage(p, 'c-Tag', 'Tag', p.zrGrenze()) : zeitraumVorlage(p, 'c-Woche', 'Woche', p.zrGrenze())}
        <div class="chart-wrap">${unsafeHTML(chart)}</div></div>
      <div class="glas-panel block"><div class="block-kopf"><b>Geräte</b><span class="leise">⏻ = Handbetrieb · aktiv aus = die Automatik lässt es aus</span></div>
        ${b.geraete.length ? html`<div class="c-chips">${geraete(p, b)}</div>` : html`<div class="leise">Noch kein Gerät</div>`}</div>
      ${sensorLeisteVorlage(p, b)}
      <div class="glas-panel liste c-einst">
        ${b.tuer && b.tuer.offen ? html`<div class="zeile"><div><b>🚪 ${b.tuer.sensor}</b><div class="leise">${b.tuer.offen ? `offen seit ${b.tuer.offen} min – Heizung pausiert nach ${d.e.tuer_pause} min, Meldung nach ${d.e.tuer_melden} min` : 'zu'}</div></div></div>` : nothing}
        ${!b.fuehler || !b.lern ? nothing : html`<div class="zeile" data-z="lernen"><div><b>🧠 Lernende Regelung</b><div class="leise">${['thermo', 'bedarf'].includes(b.modus) ? 'lernt, wie lange der Raum nach dem Ausschalten nachheizt, und schaltet früher ab' : 'wirkt nur im Modus Thermostat oder Bei Bedarf'}${b.lern.an ? html` · <button class="link" @click=${() => p.einblenden('lernen')}>Lernstand ›</button>` : nothing}</div></div>${schalterVorlage(b.lern.an, () => p.lernenUmschalten(b))}</div>`}
        <div class="zeile" data-z="trocknen"><span>👕 Kleidung trocknen nach Regen</span>${schalterVorlage(b.trocknen, () => p.trocknenUmschalten(b))}</div>
      </div>`;
}
