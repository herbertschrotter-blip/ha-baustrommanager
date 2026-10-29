// Reiter Heizung mit Lit (BSM-022 Stufe 3d; Kacheln 0.7.11, Mockup heizung-varianten.html Variante A). Jeder Block ist eine
// eigene Vorlage: der Reiter zeigt Kacheln, ein Tipp öffnet den Block als Einblendung (Art „hz“), die Einstellungen binden
// Regeln, Trocknen, Urlaub und Je Container als dauerhafte Lit-Bereiche ein (bis 3e). Plan, Soll und Heizzeiten kommen
// von der Integration; Zeitstrahl, Heizplan und Soll-Kurve bleiben bis Stufe 4 SVG/HTML-Text der Seite (unsafeHTML).
import { html, nothing } from 'lit';
import { live } from 'lit/directives/live.js';
import { unsafeHTML } from 'lit/directives/unsafe-html.js';
import { TAGE, datum, dauer, de, erkl, kurzDatum, minu, plusTage, uhr, wtag, zahl } from '../hilfen.js';
import { AUSNAHME, MODI } from '../tabellen.js';
import { kopfVorlage, schalterVorlage, stepperVorlage } from './allgemein.js';
import { baselineRegeln } from './baseline.js';
import { KEIN_URLAUBSKALENDER, beschreibbar } from './einblendungen-baustelle.js';

const LAEDT = html`<div class="leer">Lädt …</div>`;
const ACHSE = html`<div class="tl-achse">${['04', '08', '12', '16', '20'].map(h => html`<span>${h}</span>`)}</div>`;
const grad = v => `${de(v, 1)} °C`, min = v => `${v} min`, minus = v => `${de(v, 0).replace('-', '−')} °C`, mm = v => `${de(v, 1)} mm`;

/* Kopf mit Automatik-Schalter (Reiter und Block „Heute“) */
const kopf = p => kopfVorlage('Heizung', p.d.titel, html`<div>${schalterVorlage(p.d.e.auto, () => p.automatikUmschalten())}</div>`);

/* Große Karte „Heute“ (öffnet den Block Heute) */
function held(p) {
  const d = p.d, e = d.e, H = p.z.HEUTE, pl = p.planTag(p.z.HEUTE_TAG), hg = d.heizgrenze || {}, pm = d.plan[plusTage(H, 1)], L = p.last(), status = p.statusText();
  const chips = [
    !e.auto ? '⏸ Automatik aus' : '',
    pl ? `🕖 ${uhr(pl.a)}–${uhr(pl.b)}` : html`🕖 ${unsafeHTML(p.freiText(H))}`,
    hg.zu_warm ? '🌡 zu warm – kein Heizen' : '',
    pl && pl.codes.includes('trocknen') ? `🌧 trocknen +${d.trocknen ? d.trocknen.laenger_min : e.tr_laenger} min` : '',
    pl && pl.codes.includes('fruehstart') ? '❄ Frühstart heute' : pm && (pm.gruende || []).includes('fruehstart') ? '❄ Frühstart morgen' : '',
    e.staffel && L.warten ? `⚡ ${L.warten} wartet` : '',
    d.jetztBis ? `♨ alle heizen bis ${d.jetztBis}` : '',
  ].filter(Boolean);
  return html`<div class="glas-panel hz-held klickbar" data-k="heute" role="button" tabindex="0" @click=${() => p.hzAuf('heute')}>
      <div class="hz-held-kopf"><div><div class="glas-klein">HEUTE · ${p.z.HEUTE_TAG} ${kurzDatum(H)}</div><div class="hz-status ${/heizt|♨/.test(status) ? 'an' : ''}">${status}</div></div><span class="chev">›</span></div>
      <div class="tl">${unsafeHTML(p.zeitstrahl(pl, true))}${ACHSE}</div>
      ${chips.length ? html`<div class="hz-chips">${chips.map(c => html`<span class="hz-chip">${c}</span>`)}</div>` : nothing}</div>`;
}

export function heizungVorlage(p) {
  const k = p.hzKurz(), heuteNr = TAGE.indexOf(p.z.HEUTE_TAG), max = Math.max(1, ...k.woche);
  const kachel = (id, sym, titel, wert, unter, extra = nothing) => html`<button class="glas-panel hz-kachel" data-k=${id} @click=${() => p.hzAuf(id)}>
      <span class="hz-k-kopf"><span class="hz-sym">${sym}</span><span class="chev">›</span></span>
      <span class="hz-k-titel">${titel}</span><b class="hz-k-wert">${wert}</b>${extra}<span class="leise hz-k-unter">${unter || ''}</span></button>`;
  const mini = html`<span class="hz-mini">${k.woche.map((h, i) => html`<i style="height:${Math.max(3, h / max * 100)}%" class=${i === heuteNr ? 'heute' : ''}></i>`)}</span>`;
  return html`${kopf(p)}${held(p)}
      <div class="hz-raster">
        ${kachel('plan', '📅', 'Diese Woche', k.plan, 'Heizplan aus Arbeitszeit und Wetter', mini)}
        ${kachel('wann', '🔥', 'Wann heizt was', k.wann, 'gemessen je Heizkörper')}
        ${kachel('container', '🏠', 'Container', k.container, k.container2)}
        ${kachel('az', '👷', 'Arbeitszeit', k.az, k.az2)}
        ${kachel('ausn', '✳️', 'Ausnahmen', k.ausn, k.ausn2)}
        ${kachel('regeln', '⚙️', 'Regeln', k.regeln, k.regeln2)}
        ${kachel('trocknen', '👕', 'Kleidung trocknen', k.trocknen, k.trocknen2)}
        ${kachel('urlaub', '🏖', 'Urlaub & Feiertage', k.urlaub, k.urlaub2)}
      </div>`;
}

/* ---- Blöcke (cls: „glas-panel block“ im Reiter/in den Einstellungen, „block hz-innen“ in der Einblendung) ---- */

function heute(p, cls) {
  const d = p.d, e = d.e, pl = p.planTag(p.z.HEUTE_TAG), az = p.azJetzt, hg = d.heizgrenze || {}, w = d.wetter || {}, tr = d.trocknen;
  const bezug = zahl(hg.bezug) ? hg.bezug : e.basis === 'jetzt' ? w.aussen : w.aussen_max;
  const ft = p.feiertage(), naechster = ft && ft[0], morgen = plusTage(p.z.HEUTE, 1), wm = p.wetterTag(morgen), pm = d.plan[morgen];
  const regel = (ic, titel, text, an) => html`<div class="hr-zeile ${an ? 'an' : ''}"><span class="hr-ic">${ic}</span><div><b>${titel}</b><div class="leise">${text}</div></div><span class="hr-an">${an ? '●' : '○'}</span></div>`;
  const C = d.bereiche.filter(b => !b.pumpe), lernend = C.filter(b => b.lern && b.lern.warm);   // AN-0004
  const freiT = e.urlaub === 'absenk' ? `heute abgesenkt auf ${de(e.absenk)} °C (mit Fühler), sonst Frostschutz` : e.urlaub === 'aus' ? 'heute alles aus – auch kein Frostschutz' : 'heute nur Frostschutz';
  const frei = { urlaub: ['Urlaub', freiT], feiertag: ['Feiertag', freiT] }[d.status], feiertagsKal = d.optionen.feiertag_kalender;
  const L = e.staffel ? p.last() : null;
  return html`<div class=${cls}><div class="block-kopf"><b>Heute</b><span class="leise">welche Regeln greifen</span></div>
        ${regel('🕖', `Arbeitszeit ${pl ? `${uhr(pl.a)}–${uhr(pl.b)}` : 'frei'}`, `${az ? `„${az.name}“` : 'keine Arbeitszeit'} · heizt ${pl ? `${uhr(pl.extra)}–${uhr(pl.ende)}` : 'nicht'}`, !!pl)}
        ${pl ? html`<div class="zeile unter hz-rechnung"><span class="leise">${p.planRechnung(pl)}</span></div>` : nothing}
        ${lernend.map(b => html`<div class="zeile unter"><span class="leise">🧠 <b>${b.name}</b>: ${p.warmText(b)}</span></div>`)}
        ${regel('🌡', `Heizgrenze ${de(e.grenze, 0)} °C`, zahl(bezug) ? `${e.basis === 'jetzt' ? 'jetzt' : 'Höchstwert heute'} ${de(bezug, 0)} °C → ${hg.zu_warm ?? bezug > e.grenze ? 'zu warm, es wird nicht geheizt' : 'es wird geheizt'}` : 'kein Wert vom Wetter', !(hg.zu_warm ?? (zahl(bezug) && bezug > e.grenze)))}
        ${regel('🌧', 'Kleidung trocknen', tr ? `${tr.text}${tr.aktiv && pl ? `, bis ${uhr(pl.ende)}` : ''}` : 'kein Regenwert vom Wetter', !!(tr && (tr.aktiv || tr.frueher_heute_min)))}
        ${regel('❄', 'Kälte-Frühstart morgen', zahl(wm.kalt) ? `${de(wm.kalt).replace('-', '−')} °C erwartet (unter ${de(e.frueh_temp, 0).replace('-', '−')} °C) → ${wm.kalt < e.frueh_temp ? `${e.frueh_min} min früher` : 'nicht nötig'}${pm && (pm.gruende || []).includes('frueher_nach_regen') ? `, dazu ${tr ? tr.frueher_morgen_min : e.tr_frueher} min nach Regen` : ''}` : 'noch keine Vorhersage für morgen', e.fruehstart && zahl(wm.kalt) && wm.kalt < e.frueh_temp)}
        ${L ? regel('⚡', `Staffelung: ${L.laufen} von ${L.hk.length} Heizkörpern`, `${L.warten ? `${L.warten} wartet, weil ein Anschluss ausgelastet ist` : 'alle haben Platz'} · höchstens ${e.max_gleich} gleichzeitig · Vorheizen startet 15 min früher, damit alle warm werden`, true) : nothing}
        ${frei ? regel('🏖', frei[0], frei[1], true) : regel('🏖', 'Kein Urlaub, kein Feiertag', naechster ? `nächster Feiertag ${wtag(naechster.von)} ${kurzDatum(naechster.von)} ${naechster.name}` : feiertagsKal ? (ft === null ? 'Feiertage laden …' : 'kein Feiertag im Kalender') : 'kein Feiertagskalender gewählt', false)}</div>`;
}

/* Wann welche Heizung heizt: Tag (gemessen + Plan je Heizkörper) oder Woche (Stunden je Tag) */
function wann(p, cls) {
  const art = p.s.hzArt || 'tag', tag = p.s.hzTag || p.z.HEUTE_TAG, C = p.d.bereiche.filter(b => !b.pumpe);
  const A = 4 * 60, B = 21 * 60, x = m => Math.max(0, Math.min(100, (m - A) / (B - A) * 100)), breite = (a, b) => Math.max(0, x(b) - x(a));
  const std = segs => segs.reduce((a, q) => a + (q[1] - q[0]), 0) / 60, HZ = b => b.geraete.filter(g => g.heizer);
  const ohne = b => html`<div class="hz-c"><span class="hz-cn">${b.name}</span><span class="leise hz-cp">noch kein Heizkörper</span></div>
      <div class="hz-ohne"><button class="chip glas-panel" data-id=${b.id} @click=${() => p.containerOeffnen(b.id)}>+ Heizkörper zuordnen</button></div>`;   // FE-0007
  const tagNr = TAGE.indexOf(tag), heuteNr = TAGE.indexOf(p.z.HEUTE_TAG), jetzt = minu(p.z.JETZT);
  const setze = (a, t) => { if (t) p.s.hzTag = t; if (a) p.s.hzArt = a; p.neuZeichnen(); };
  p.mess = p.messung();
  const k = html`<div class="block-kopf"><b>Wann welche Heizung heizt</b><div class="seg klein">${[['tag', 'Tag'], ['woche', 'Woche']].map(([kk, t]) => html`<button data-v=${kk} class=${art === kk ? 'on' : ''} @click=${() => setze(kk)}>${t}</button>`)}</div></div>`;
  if (p.mess === null) return html`<div class=${cls}>${k}${LAEDT}</div>`;
  let inhalt;
  if (!C.length) inhalt = html`<div class="leer">Keine Container</div>`;
  else if (art === 'tag') {
    const zukunft = tagNr > heuteNr, h = tagNr === heuteNr;
    inhalt = html`<div class="vb-wer">${p.z.WOCHE.map(([t, dd]) => html`<button data-v=${t} class=${t === tag ? 'on' : ''} @click=${() => setze(null, t)}>${t === p.z.HEUTE_TAG ? 'heute' : t} ${dd.slice(0, 2)}.</button>`)}</div>
        <div class="leise">${zukunft ? 'Noch nichts gemessen – blass der Plan.' : h ? 'Bis jetzt gemessen, danach blass der Plan.' : 'Gemessen an der Leistung: kräftig = zieht Strom (über 50 W).'}</div>
        <div class="hz-tag">${C.map(b => { if (!HZ(b).length) return ohne(b); const plan = p.heizzeiten(b, tag), ph = std(plan);
          return html`<div class="hz-c"><span class="hz-cn">${b.name}${b.bedarf ? html` <span class="leise">bei Bedarf</span>` : nothing}${b.offline ? html` <span class="rot-t">offline</span>` : nothing}</span><span class="leise hz-cp">${ph ? `${de(ph)} h geplant` : b.bedarf ? 'kein Termin' : !b.auto ? 'Hand' : 'frei'}</span></div>
            ${HZ(b).map(g => { const a = p.aktiv(b, g, tag), ah = std(a.an);
              return html`<div class="hz-zeile"><span class="hz-n hz-g">${g.n}</span>
                <div class="tl-spur hz">${plan.map(q => html`<i class="hz-plan ${!zukunft && (!h || q[1] <= jetzt) ? 'vorbei' : ''}" style="left:${x(q[0])}%;width:${breite(q[0], q[1])}%"></i>`)}
                  ${zukunft ? nothing : a.an.map(q => html`<i class="hz-an" style="left:${x(q[0])}%;width:${breite(q[0], q[1])}%"></i>`)}
                  ${a.off.map(q => html`<i class="hz-off" style="left:${x(q[0])}%;width:${breite(q[0], q[1])}%"></i>`)}
                  ${h ? html`<i class="tl-jetzt" style="left:${x(jetzt)}%"></i>` : nothing}</div>
                <span class="hz-h">${zukunft ? '–' : `${de(ah)} h`}</span></div>`; })}`; })}
          <div class="hz-zeile achse"><span></span>${ACHSE}<span></span></div></div>
        <div class="hp-legende"><span><i class="hz-an"></i>zieht Strom</span><span><i class="hz-plan"></i>geplant</span><span><i class="hz-off"></i>offline</span><span class="leise">Lücken im Plan: Thermostat, Staffelung, Tür offen</span></div>`;
  } else {
    const zeilen = C.flatMap(b => HZ(b).length ? HZ(b).map(g => ({ b, g, h: TAGE.map((t, kk) => kk > heuteNr ? std(p.heizzeiten(b, t)) : std(p.aktiv(b, g, t).an)) })) : [{ b, g: null, h: null }]);
    const max = Math.max(...zeilen.flatMap(z => z.h || []), 1);
    inhalt = html`<div class="hz-woche"><div class="hz-wk"><span></span>${p.z.WOCHE.map(([t, dd]) => html`<span class=${t === p.z.HEUTE_TAG ? 'heute' : ''}>${t}<br><small>${dd.slice(0, 2)}.</small></span>`)}<span>Σ</span></div>
        ${zeilen.map(({ b, g, h }) => !g ? html`<div class="hz-wz"><span class="hz-n">${b.name}</span><button class="hz-wz-ohne leise" data-id=${b.id} @click=${() => p.containerOeffnen(b.id)}>noch kein Heizkörper · zuordnen</button></div>`
          : html`<div class="hz-wz"><span class="hz-n">${b.name} <span class="leise">· ${g.n}</span></span>${h.map((v, kk) => html`<button class="hz-zelle ${kk > heuteNr ? 'geplant' : ''}" data-v=${TAGE[kk]} style="--a:${v ? .15 + .75 * v / max : 0}" title="${b.name} · ${g.n} ${TAGE[kk]}: ${de(v)} h ${kk > heuteNr ? 'geplant' : 'gemessen'}" @click=${() => setze('tag', TAGE[kk])}>${v ? de(v, v % 1 ? 1 : 0) : ''}</button>`)}<b class="hz-sum">${de(h.slice(0, heuteNr + 1).reduce((a, v) => a + v, 0), 0)} h</b></div>`)}</div>
        <div class="leise">Stunden, in denen der Heizkörper Strom gezogen hat (heute bis jetzt); kommende Tage blass und kursiv = geplant. Σ = bisher gemessen. Tippen zeigt den Tag.</div>`;
  }
  return html`<div class=${cls}>${k}${inhalt}</div>`;
}

const plan = (p, cls) => html`<div class=${cls}><div class="block-kopf"><b>Heizplan · diese Woche</b><span class="leise">aus Arbeitszeit und Wetter</span></div>${unsafeHTML(p.heizplanInhalt())}</div>`;

function arbeitszeit(p, cls) {
  const L = p.azListe, jetzt = p.azJetzt, neu = html`<button class="zeile" @click=${() => p.azNeu(p.azJetzt)}><span class="blau">+ Neue Arbeitszeit ab …</span></button>`;
  if (!jetzt) return html`<div class=${cls}><div class="block-kopf"><b>Arbeitszeit</b></div><div class="leise">Noch keine Arbeitszeit – ohne Arbeitszeit läuft nur der Frostschutz.</div>
      ${neu}</div>`;
  const geplant = L.filter(a => a.ab > p.z.HEUTE), frueher = L.filter(a => a.ab < jetzt.ab).reverse(), idx = a => p.d.arbeitszeiten.indexOf(a);
  const auf = a => () => p.einblenden('az', { i: idx(a) });
  return html`<div class=${cls}><div class="block-kopf"><b>Arbeitszeit</b><span class="badge gruen">${jetzt.ab <= p.z.HEUTE ? 'gilt seit' : 'gilt ab'} ${datum(jetzt.ab)}</span></div>
      <div class="az-name">${jetzt.name}</div>
      ${jetzt.auto ? html`<div class="leise">Automatisch angelegt – wird ersetzt, sobald du eine eigene Arbeitszeit speicherst (auch mit früherem Datum).</div>` : nothing}
      <button class="zeile" data-i=${idx(jetzt)} @click=${auf(jetzt)}><span class="blau">Bearbeiten oder löschen</span><span class="chev">›</span></button>
      ${TAGE.map(t => { const z = jetzt.tage[t]; return html`<div class="zeile az ${t === p.z.HEUTE_TAG ? 'heute' : ''}"><b class="tag-n">${t}</b>
        <span class="fenster">${z ? html`<em>${z[0]}–${z[1]}</em>` : html`<span class="leise">frei</span>`}</span><span class="leise">${z ? dauer(z[0], z[1]) : ''}</span></div>`; })}
      ${geplant.filter(a => a !== jetzt).map(a => html`<button class="zeile" data-i=${idx(a)} @click=${auf(a)}><span><span class="badge blau-b">geplant</span> ab ${datum(a.ab)} · ${a.name}</span><span class="chev">›</span></button>`)}
      ${frueher.length ? html`<button class="zeile" @click=${() => { p.s.azAlt = !p.s.azAlt; p.neuZeichnen(); }}><span>Frühere Arbeitszeiten (${frueher.length})</span><span class="chev">${p.s.azAlt ? '⌄' : '›'}</span></button>` : nothing}
      ${p.s.azAlt ? frueher.map(a => html`<button class="zeile unter" data-i=${idx(a)} @click=${auf(a)}><span>${datum(a.ab)} · ${a.name}</span><span class="leise">${a.tage.Mo ? a.tage.Mo.join('–') : ''} ›</span></button>`) : nothing}
      ${neu}</div>`;
}

/* FE-0012: Ausnahmen je Tag mit mehreren Zeitfenstern; Arbeitszeit-Block und eigene Fenster rechnet die Integration (plan) */
function ausnahmen(p, cls) {
  const H = p.z.HEUTE, L = p.d.ausnahmen.filter(a => a.datum >= H), tage = [...new Set(L.map(a => a.datum))].sort();
  const badge = a => a.art === 'frei' ? nothing : html`<span class="badge ${a.art === 'zeiten' ? '' : 'blau-b'}">${AUSNAHME[a.art]}</span>`;
  return html`<div class=${cls}><div class="block-kopf"><b>Ausnahmen</b><span class="leise">einmalig – mehrere Zeitfenster je Tag möglich</span></div>
      <div class="bedarf-dauer">${[['heute-laenger', '+ Heute länger'], ['morgen-spaeter', '+ Morgen später'], ['samstag', '+ Samstag arbeiten'], ['frei', '+ Freier Tag']].map(([k, t]) => html`<button class="chip glas-panel" data-v=${k} @click=${() => p.ausnahmeNeu(k)}>${t}</button>`)}</div>
      ${tage.length ? tage.map(t => { const A = L.filter(a => a.datum === t).sort((x, y) => (x.von || '').localeCompare(y.von || '')), frei = A.some(a => a.art === 'frei'), pl = p.planIso(t);
        const az = p.azJetzt && p.azJetzt.tage[wtag(t)], basis = !frei && !A.some(a => a.art === 'zeiten') && az ? html`<div class="am-fenster leise">${az.join('–')} laut Arbeitszeit</div>` : nothing;
        return html`<div class="am-tag"><div class="am-tag-kopf"><b>${wtag(t)} ${kurzDatum(t)}</b>${frei ? html`<span class="badge">frei</span>` : nothing}</div>${basis}
          ${A.map(a => html`<div class="am-fenster">${a.art === 'frei' ? html`<b>frei</b>` : html`<b>${a.von}–${a.bis}</b>`} ${badge(a)}${a.notiz ? html` <span class="leise">${a.notiz}</span>` : nothing}
            <button class="x nur-admin" title="dieses Zeitfenster löschen" @click=${p.nurAdmin(() => p.ausnahmeWeg(a))}>✕</button></div>`)}
          ${frei || !pl ? nothing : html`<div class="am-strahl">${unsafeHTML(p.zeitstrahl(pl, t === H))}<div class="tl-achse"><span>04</span><span>12</span><span>20</span></div></div>
            <div class="am-hinweis">${p.planFensterText(pl)}</div>`}
          ${frei ? nothing : html`<button class="zeile" data-d=${t} @click=${() => p.ausnahmeDazu(t)}><span class="blau">+ weiteres Zeitfenster an diesem Tag</span></button>`}</div>`; }) : html`<div class="leise">Keine Ausnahmen</div>`}
      <button class="zeile" @click=${() => p.ausnahmeNeu('')}><span class="blau">+ Ausnahme für einen anderen Tag</span></button></div>`;
}

/* Solltemperatur fest oder gleitend – alle Zahlen von der Integration (laufzeit.soll_gleitend, logik/soll) */
function soll(p, z, st) {
  const e = p.d.e, G = p.d.sollG, gl = e.soll_art === 'gleitend', f = v => `${v >= 0 ? '+' : '−'}${de(Math.abs(v), 1)} °C`;
  const k = z('🌡 Solltemperatur', 'für Container mit Fühler; ohne Fühler regelt der Heizkörperthermostat',
    html`<div class="seg klein">${[['fest', 'fest'], ['gleitend', 'gleitend']].map(([kk, t]) => html`<button data-v=${kk} class=${e.soll_art === kk ? 'on' : ''} @click=${() => p.einstellungWert('soll_art', kk)}>${t}</button>`)}</div>`);
  if (!gl) return html`${k}${z('Soll', '', st('soll', .5, grad), true)}`;
  const heute = !G ? html`<div class="leise">Noch keine Außentemperatur – bis dahin gilt das feste Soll.</div>`
    : html`<div class="sg-heute"><span>Grundwert („mindestens“)${e.gleit_min >= 21 ? ' – Aufenthaltsräume (§ 36 BauV)' : ''}</span><b>${grad(e.gleit_min)}</b>
        <span>kalte Tage: Außenmittel der letzten ${G.tage} Tage ${de(G.aussen_mittel, 1)} °C</span><b>${f(G.start - e.gleit_min)}</b>
        <span>dein Gefühl: ${G.n} ${G.n === 1 ? 'Rückmeldung' : 'Rückmeldungen'} bei ähnlichem Wetter (je ${de(G.schritt, 2)} °C)</span><b>${f(G.gefuehl)}</b>
        <span class="summe">Soll heute</span><b class="summe">${grad(G.soll)}</b></div>${unsafeHTML(p.sollKurve(G))}`;
  return html`${k}${heute}${z('mindestens', e.gleit_min < 21 ? html`<span class="amber-t">unter 21 °C – § 36 BauV verlangt für Aufenthaltsräume 21 °C</span>` : 'nie darunter (§ 36 BauV: Aufenthaltsräume 21 °C)', st('gleit_min', .5, grad), true)}${z('höchstens', '', st('gleit_max', .5, grad), true)}${z('wärmer je Grad kälter draußen', `unter ${de(e.gleit_bezug, 0)} °C Außenmittel`, st('gleit_je', .05, v => `+${de(v, 2)} °C`), true)}${z('ab Außenmittel unter', '', st('gleit_bezug', 1, v => `${de(v, 0)} °C`), true)}${z('Außenmittel über', 'wie EN 16798-1: jüngere Tage zählen mehr', st('gleit_tage', 1, v => `${v} ${v === 1 ? 'Tag' : 'Tage'}`), true)}${z('dein Gefühl', '„zu kalt / passt / zu warm“ und + / − im Container verschieben das Soll bei ähnlichem Wetter, höchstens ±1,5 °C', html`<button class="rv-link" @click=${() => p.gefuehlVergessen()}>vergessen</button>`, true)}<div class="leise">Ein eigenes Soll im Container gilt als Verschiebung gegenüber dem der Baustelle (Je Container).</div>`;
}

/* AN-0012: Regeln nach Tagesablauf gruppiert (Mockup regeln-varianten.html, Variante B, abgenommen 01.10.2026) */
function regelnInhalt(p) {
  const e = p.d.e, C = p.d.bereiche.filter(b => !b.pumpe), lernend = C.filter(b => b.lern && b.lern.warm), st = (k, s, fmt) => stepperVorlage(p, k, s, fmt);
  const z = (titel, text, ctrl, unter, r) => html`<div class="zeile${unter ? ' unter' : ''}" data-r=${r || nothing}><div>${unter ? html`<span>${titel}</span>` : html`<b>${titel}</b>`}${text ? html`<div class="leise">${text}</div>` : nothing}</div>${ctrl || nothing}</div>`;
  const link = fn => html`<button class="rv-link" @click=${fn}>ändern ›</button>`;
  const nichtLern = lernend.length ? html` · <i>nicht für lernende Container</i>` : nothing, bool = k => schalterVorlage(e[k], () => p.einstellungUmschalten(k));
  const R = {
    vorheizen: z('Vorheizen', html`vor Arbeitsbeginn, damit es warm ist${nichtLern}`, st('vorheizen', 5, min), false, 'vorheizen'),
    frueh: html`${z('Kälte-Frühstart', html`unter ${minus(e.frueh_temp)} zusätzlich früher${nichtLern}`, bool('fruehstart'), false, 'fruehstart')}${e.fruehstart ? html`${z('wenn morgens kälter als', '', st('frueh_temp', 1, minus), true)}${z('so viel früher', '', st('frueh_min', 5, min), true)}` : nothing}`,
    lernend: z('🧠 Lernende Container', `heizen selbst so früh, dass das Soll rechtzeitig erreicht ist – statt Vorheizen, Kälte-Frühstart und Nachheizen. Bis genug gelernt ist, gelten die Werte oben.${lernend.length ? ` Jetzt: ${lernend.map(b => b.name).join(', ')}.` : ' Gilt für Container mit Fühler, Modus Thermostat und lernender Regelung.'}`, ''),
    warm_vor: z('Soll erreicht', 'vor Arbeitsbeginn, z. B. zum Umziehen', st('warm_vor', 5, v => v ? `${v} min vorher` : 'bei Beginn'), true),
    warm_max: z('Frühestens', 'vor Arbeitsbeginn – Grenze, falls der Raum sehr kalt ist', st('warm_max', 15, v => `${v} min vorher`), true),
    soll: soll(p, z, st),
    toleranz: z('Schaltabstand ± um das Soll', 'Thermostat: ein unter Soll − Abstand, aus über Soll + Abstand', st('toleranz', .1, v => `± ${de(v, 1)} °C`), true),
    grenze: z('Heizgrenze', 'nicht heizen, wenn es wärmer ist', st('grenze', .5, grad)),
    basis: z('Grundlage', '', html`<div class="seg klein">${['jetzt', 'Tageshöchstwert'].map(v => html`<button data-v=${v} class=${e.basis === v ? 'on' : ''} @click=${() => p.heizgrenzeBasis(v)}>${v}</button>`)}</div>`, true),
    boost: z('⚡ Schnell aufheizen', 'alle Heizkörper eines Containers zugleich, Vorrang in der Staffelung – bis zum Soll, ohne Fühler für', st('boost_min', 5, min)),
    zusatz: !C.some(b => b.geraete.filter(g => g.heizer).length >= 2) ? nothing : html`${z('🔥 Zusatz-Heizkörper', `in Containern mit „Zusatz nur bei Bedarf“: zuerst heizt einer, der Zusatz kommt dazu, wenn …${(() => { const n = C.filter(b => b.stufenAn); return n.length ? ` Jetzt: ${n.map(b => b.name).join(', ')}.` : ' Einschalten im Container unter Bearbeiten.'; })()}`, '')}${z('… der Raum weiter unter dem Soll ist als', '', st('stufen_abstand', .5, grad), true)}${z('… einer schon so lange läuft', '', st('stufen_min', 5, min), true)}${z('… und es dabei weniger wärmer wurde als', '', st('stufen_anstieg', .1, v => `${de(v)} °C`), true)}${z('… es draußen kälter ist als (beide von Anfang an)', '', st('stufen_kalt', 1, minus), true)}`,
    tuer: html`${z('🚪 Tür offen', 'Heizung pausieren nach', st('tuer_pause', 1, min), false, 'tuer')}${z('Nachricht nach', '', st('tuer_melden', 5, min), true)}`,
    nachheizen: z('Nachheizen', html`nach Arbeitsende, jeden Tag${nichtLern}`, st('nachheizen', 5, min), false, 'nachheizen'),
    warm_nach: z('Warm halten (lernende)', 'nach Arbeitsende; Kleidung trocknen kommt dazu', st('warm_nach', 5, v => v ? `${v} min länger` : 'bis Ende'), true),
    trocknen: z('👕 Kleidung trocknen', `nach Regen in der Arbeitszeit · ${p.d.trocknen ? p.d.trocknen.stufen_text : `ab ${de(e.tr_mm, 1)} mm: +${e.tr_laenger} min, morgen ${e.tr_frueher} min früher`}`, link(() => p.hzAuf('trocknen'))),
    hand: z('✋ Handbetrieb übernehmen nach', 'Läuft ein Heizkörper zu lange von Hand, kommt eine Nachricht – ohne „So lassen“ übernimmt die Automatik so viel später', st('hand_nachfrist', 5, min)),
    frost: html`${z('❄ Frostschutz', 'hält jeden Container über der Grenze, auch außerhalb der Arbeitszeit', bool('frost'), false, 'frost')}${e.frost ? html`${z('ein unter', '', st('frost_temp', .5, grad), true)}${z('aus über', '', st('frost_aus', .5, grad), true)}${z('ohne Fühler: ein, wenn draußen unter', 'aus erst 2 °C darüber; der Heizkörperthermostat regelt dann selbst', e.frost_aussen === null ? html`<span class="leise">aus</span>` : st('frost_aussen', 1, minus), true)}${z('auch bei Automatik aus', 'schaltet dann nur den Frostschutz, sonst nichts', bool('frost_immer'), true)}` : nothing}`,
    urlaub: z('🏖 Urlaub & freie Feiertage', { frost: 'nur Frostschutz', absenk: `absenken auf ${de(e.absenk)} °C`, aus: 'alles aus' }[e.urlaub], link(() => p.hzAuf('urlaub'))),
    zieht: z('Heizt tatsächlich ab', 'Leistung, ab der ein Heizkörper als „heizt“ zählt – Heizzeit geheizt, Heiztage, Warm ab, Lernen, Wann heizt was', st('zieht_w', 5, v => `${v} W`)),
    fuehler: z('🌡 Fühler ohne Wert', 'meldet ein Fühler nichts, gilt sein letzter Wert noch so lange – danach regelt der Container wie ohne Fühler', st('fuehler_halten', 5, min)),
    staffel: z('⚡ Staffelung', e.staffel ? `${e.nutzbar} % je Anschluss nutzbar · höchstens ${e.max_gleich} gleichzeitig · mindestens ${e.min_lauf} min an, ${e.min_pause} min Pause` : 'aus – alle Heizkörper dürfen zugleich', link(() => p.einstGruppe('strom'))),
  };
  const karte = (ic, titel, unter, teile) => html`<div class="rv-kopf"><b>${ic} ${titel}</b><span class="leise">${unter}</span></div><div class="rv-karte">${teile.map(k => R[k])}</div>`;
  const FEST = [
    ['Außentemperatur ohne Wert', '6 h', 'der letzte Außenwert gilt noch so lange (Heizgrenze, Frostschutz ohne Fühler)'],
    ['Frostschutz ohne Fühler aus', '+2 °C', 'über der Außen-Grenze, damit er nicht dauernd ein- und ausschaltet'],
    ['„Schaltet sich selbst ein“', '3× in 10 min', 'so oft musste die Automatik ein Gerät ausschalten – dann Störung statt Protokoll jede Minute'],
    ['Lernen: Takt', '10 min, mind. 2 min ein', 'Thermostat lernend: Anteil je Takt; kürzere Pulse lohnen nicht'],
    ['Lernen: Aufheizen zählt', 'ab 1 °C unter Soll, ≥ 20 min, ≥ 0,5 °C', 'so wird die Aufheizrate gemessen; ab 3 Messungen je Außenband rechnet der Container selbst'],
    ['Lernen: kalt / mild', 'unter 5 °C außen', 'Aufheizraten getrennt nach kaltem und mildem Wetter'],
    ['Tür vermutlich offen', '−0,3 °C in 10 min', 'beim Heizen, während es draußen kaum kälter wurde – danach 10 min nichts lernen'],
  ];
  return html`${karte('🌅', 'Vor der Arbeit', 'warm, wenn es losgeht', ['vorheizen', 'frueh', 'lernend', 'warm_vor', 'warm_max'])}${karte('👷', 'In der Arbeitszeit', 'auf das Soll halten', ['soll', 'toleranz', 'grenze', 'basis', 'boost', 'zusatz', 'tuer'])}${karte('🌇', 'Nach der Arbeit', 'warm halten, trocknen, übernehmen', ['nachheizen', 'warm_nach', 'trocknen', 'hand'])}${karte('🌙', 'Nachts, frei, Urlaub', 'nur Frostschutz', ['frost', 'urlaub'])}${karte('⏱', 'Immer', 'Messung und Strom', ['zieht', 'fuehler', 'staffel'])}${baselineRegeln(p)}<div class="rv-kopf"><b>📐 Feste Regeln</b><span class="leise">bewährte Schwellen, nicht änderbar</span></div><div class="rv-karte">${FEST.map(([t, w, x]) => html`<div class="rv-fest"><span>${t}</span><b>${w}</b><div class="leise">${x}</div></div>`)}</div>${unsafeHTML(erkl(e.erklaer, 'Vorheizen und Nachheizen gelten jeden Arbeitstag. Die Verlängerungen zählen zusammen: vor der Arbeit Vorheizen + Kälte-Frühstart + früher nach Regen, danach Nachheizen + Kleidung trocknen (AN-0003). Die Heizgrenze verhindert Heizen an warmen Tagen. Der Frostschutz springt unter „ein“ an und hört erst über „aus“ wieder auf, damit der Heizkörper nicht dauernd ein- und ausschaltet.'))}`;
}

const regeln = (p, cls) => html`<div class=${cls}><div class="block-kopf"><b>So wird geheizt</b><span class="leise">nach Tagesablauf</span></div>
        ${regelnInhalt(p)}</div>`;

/* AN-0021: Stufen nach dem Regen in der Arbeitszeit – die Integration liefert sie (laufzeit.trocknen.stufen; nach dem
   Speichern zuerst die gespeicherte Einstellung), die Seite ändert nur die Einstellung heizung.trocknen_stufen */
const TR_GRENZEN = { ab_mm: [0, 100, .5], laenger_min: [0, 480, 5], frueher_min: [0, 240, 5] };
function trocknen(p, cls) {
  const d = p.d, tr = d.trocknen, eigen = ((d.r && d.r.einstellungen && d.r.einstellungen.heizung) || {}).trocknen_stufen;
  const S = (eigen || (tr && tr.stufen) || []).map(x => ({ ...x }));
  const speichern = liste => p.setzen(['heizung', 'trocknen_stufen'], [...liste].sort((a, b) => a.ab_mm - b.ab_mm));
  const schritt = (i, k, r) => { const [lo, hi, st] = TR_GRENZEN[k], n = S.map(x => ({ ...x })); n[i][k] = Math.min(hi, Math.max(lo, Math.round((n[i][k] + r * st) * 10) / 10)); speichern(n); };
  const stepper = (i, k, fmt) => html`<span class="stepper klein"><button data-tr=${`${i}-${k}-`} @click=${() => schritt(i, k, -1)}>−</button><b>${fmt(S[i][k])}</b><button data-tr=${`${i}-${k}+`} @click=${() => schritt(i, k, 1)}>+</button></span>`;
  const neu = () => { const l = S[S.length - 1] || { ab_mm: 0, laenger_min: 45, frueher_min: 15 }; const g = k => TR_GRENZEN[k][1];   // Eingabehilfe für die neue Stufe, in den Grenzen der Einstellung
    speichern([...S, { ab_mm: Math.min(g('ab_mm'), l.ab_mm + 3), laenger_min: Math.min(g('laenger_min'), l.laenger_min + 30), frueher_min: Math.min(g('frueher_min'), l.frueher_min + 15) }]); };
  return html`<div class=${cls}><div class="block-kopf"><b>👕 Kleidung trocknen</b><span class="leise">nur Regen in der Arbeitszeit zählt</span></div>
        ${tr ? html`<div class="zeile unter"><span class="leise">${tr.text}</span></div>` : nothing}
        ${S.map((x, i) => html`<div class="tr-stufe" data-stufe=${i}><div class="zeile"><b>Stufe ${i + 1}</b>${S.length > 1 ? html`<button class="x nur-admin" title="Stufe entfernen" data-tr-weg=${i} @click=${p.nurAdmin(() => speichern(S.filter((_, j) => j !== i)))}>✕</button>` : nothing}</div>
          <div class="zeile unter"><span>ab Regen in der Arbeitszeit</span>${stepper(i, 'ab_mm', mm)}</div>
          <div class="zeile unter"><span>heute länger (nach dem Nachheizen)</span>${stepper(i, 'laenger_min', min)}</div>
          <div class="zeile unter"><span>am nächsten Morgen früher</span>${stepper(i, 'frueher_min', min)}</div></div>`)}
        ${S.length < 5 ? html`<button class="zeile nur-admin" data-tr-neu @click=${p.nurAdmin(neu)}><span class="blau">+ Stufe</span></button>` : nothing}
        <div class="leise">Regen nachts oder nach Feierabend zählt nicht. Es gilt die höchste erreichte Stufe.</div></div>`;
}

/* Je Container: Modus, Kleidung trocknen, eigenes Soll */
function jeContainer(p, cls) {
  const e = p.d.e, C = p.d.bereiche.filter(b => !b.pumpe);
  return html`<div class=${cls}><div class="block-kopf"><b>Je Container</b><span class="leise">Modus · Trocknen · Soll</span></div>
        ${C.map(b => { const sl = p.sollVon(b);
          return html`<div class="jc" data-id=${b.id}><div class="jc-name"><b>${b.name}</b><span class="leise">${b.offline ? 'offline' : b.t !== null ? `🌡 ${de(b.t)} °C` : 'ohne Fühler'}</span></div>
            <div class="jc-ctrl"><select class="jc-modus nur-admin" .value=${live(b.modus)} title="Modus" aria-label="Modus ${b.name}" @change=${p.nurAdmin(ev => p.modusSetzen(b, ev.target.value))}>${MODI.map(([k, t]) => html`<option value=${k} ?selected=${b.modus === k} ?disabled=${k === 'thermo' && !b.fuehler}>${t}</option>`)}</select>
              <span class="jc-l">👕</span>${schalterVorlage(b.trocknen, () => p.trocknenUmschalten(b), 'klein')}
              ${b.fuehler ? html`<span class="stepper klein"><button data-d="-0.5" @click=${() => p.containerSoll(b, -0.5)}>−</button><b class=${b.soll !== undefined ? 'eigen' : ''}>${de(sl)}°</b><button data-d="0.5" @click=${() => p.containerSoll(b, 0.5)}>+</button></span>`
                : html`<span class="leise jc-th">Thermostat</span>`}</div></div>`; })}
        <div class="leise">Ein eigener Sollwert (bernstein) gilt nur für diesen Container, sonst gilt ${de(e.soll)} °C.</div>
        ${unsafeHTML(erkl(e.erklaer, 'Zeitplan: an in der Heizzeit, der Heizkörper regelt selbst. Thermostat: in der Heizzeit nach dem Fühler auf das Soll (nur mit Fühler). Bei Bedarf: nur per Schalter oder Termin. Hand: die Automatik schaltet nicht. Aus: nur Frostschutz.'))}</div>`;
}

function urlaub(p, cls) {
  const d = p.d, e = d.e, ft = p.feiertage(), ur = p.urlaube(), urlaubsKal = d.optionen.urlaub_kalender, feiertagsKal = d.optionen.feiertag_kalender;
  return html`<div class=${cls}><div class="block-kopf"><b>Urlaub & Feiertage</b></div>
        <div class="zeile"><div><b>An Feiertagen frei</b><div class="leise">${feiertagsKal ? `Feiertage aus dem Kalender „${p.name(feiertagsKal)}“` : 'noch kein Feiertagskalender gewählt'}</div></div>${schalterVorlage(e.feiertag_frei, () => p.einstellungUmschalten('feiertag_frei'))}</div>
        <div class="zeile modus-z"><div><b>Im Urlaub und an freien Feiertagen</b><div class="leise">${{ frost: 'nur Frostschutz', absenk: `mit Fühler auf ${de(e.absenk)} °C halten, ohne Fühler nur Frostschutz`, aus: 'alles aus – auch kein Frostschutz. Nur, wenn nichts einfrieren kann.' }[e.urlaub]}</div></div>
          <div class="seg klein">${[['frost', 'nur Frostschutz'], ['absenk', 'absenken'], ['aus', 'alles aus']].map(([k, t]) => html`<button data-v=${k} class=${e.urlaub === k ? 'on' : ''} @click=${() => p.einstellungWert('urlaub', k)}>${t}</button>`)}</div></div>
        ${e.urlaub === 'absenk' ? html`<div class="zeile unter"><span>absenken auf</span>${stepperVorlage(p, 'absenk', .5, grad)}</div>` : nothing}
        ${ft === null ? html`<div class="leise">Lädt …</div>` : ft.slice(0, 4).map(f => { const t = wtag(f.von), we = t === 'Sa' || t === 'So';
          return html`<div class="zeile unter"><span><b class="ft-d">${t} ${kurzDatum(f.von)}</b> ${f.name}</span><span class="leise">${we ? 'Wochenende' : 'frei'}</span></div>`; })}
        <div class="gruppe-t">Urlaub · ${urlaubsKal ? `Kalender „${p.name(urlaubsKal)}“` : 'kein Kalender gewählt'}</div>
        ${ur === null ? html`<div class="leise">Lädt …</div>` : ur.length ? ur.map(u => html`<div class="zeile unter"><span><b>${u.name}</b> <span class="leise">${kurzDatum(u.von)} – ${datum(u.bis)}</span></span><button class="x nur-admin" title="Urlaub löschen" @click=${p.nurAdmin(() => p.urlaubWeg(u))}>✕</button></div>`) : html`<div class="leise">Kein Urlaub eingetragen</div>`}
        ${!p.entitaeten(beschreibbar).length ? html`<div class="leise kal-hinweis" data-k="kein-urlaubskalender">${KEIN_URLAUBSKALENDER}</div>` : nothing}
        <button class="zeile nur-admin" @click=${p.nurAdmin(() => p.einblenden(urlaubsKal ? 'urlaub' : 'wetterquelle'))}><span class="blau">${urlaubsKal ? '+ Urlaub eintragen' : 'Kalender für Urlaub wählen'}</span></button></div>`;
}

/** Blöcke je Schlüssel (Kacheln, Einstellungen); Titel und Symbol der Einblendung wie bisher */
export const HZ_BLOECKE = { heute, wann, plan, az: arbeitszeit, ausn: ausnahmen, regeln, trocknen, container: jeContainer, urlaub };
const HZ_TITEL = { heute: ['🕖', 'Heute'], wann: ['🔥', 'Wann heizt was'], plan: ['📅', 'Diese Woche'], az: ['👷', 'Arbeitszeit'], ausn: ['✳️', 'Ausnahmen'], regeln: ['⚙️', 'Regeln'],
  trocknen: ['👕', 'Kleidung trocknen'], container: ['🏠', 'Container'], urlaub: ['🏖', 'Urlaub & Feiertage'] };

/** Block als Einblendung (Art „hz“): Heute mit „Wann heizt was“, Arbeitszeit mit Ausnahmen */
export function hzEinblendung(p, s) {
  const k = HZ_TITEL[s.k] ? s.k : 'heute', [sym, titel] = HZ_TITEL[k], cls = 'block hz-innen';
  const inhalt = k === 'heute' ? html`${heute(p, cls)}${wann(p, cls)}` : k === 'az' ? html`${arbeitszeit(p, cls)}${ausnahmen(p, cls)}` : HZ_BLOECKE[k](p, cls);
  return html`<div class="griff"></div><div class="block-kopf"><h3>${sym} ${titel}</h3></div>${inhalt}<button class="knopf" @click=${() => p.schliessen()}>Schließen</button>`;
}
