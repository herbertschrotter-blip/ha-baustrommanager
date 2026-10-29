// Einblendungen der Übersicht mit Lit (BSM-022 Stufe 3f): Verbrauch (auch für die Auswertung), Wetter, Warnungen,
// Baustelle wählen, Stromverteilung mit Rangliste, Bild einer Meldung. Zahlen, Reihen und Diagramm liefert die Seite
// (verbrauchDaten, last, Diagramme als SVG-Text); hier nur die Anzeige. Ereignisse nur über @click, keine data-Ereigniswege.
import { html, nothing } from 'lit';
import { unsafeHTML } from 'lit/directives/unsafe-html.js';
import { de, kurzDatum, plusTage, wtag, zahl } from '../hilfen.js';
import { wetterIcon } from '../symbole.js';
import { WETTER_TEXT } from '../tabellen.js';
import { zeitraumVorlage } from './zeitraum.js';

const GRIFF = html`<div class="griff"></div>`;
const LAEDT = html`<div class="leer">Lädt …</div>`;
const knopf = (t, fn, art = '') => html`<button class="knopf ${art}" @click=${fn}>${t}</button>`;
const ZEITRAEUME = ['Tag', 'Woche', 'Monat', 'Jahr'];
const svg = s => unsafeHTML(s);   // SVG-Text der Seite (wetterIcon, Diagramme)

/** Verbrauch je Container, Baustelle oder Firma (Einblendung „verbrauch“ mit ziel 'sheet', Auswertung mit ziel 'aw');
 *  Reihen, Summen und Diagramm von p.verbrauchDaten. data-v/data-id nur als Test-Merkmal. */
export function verbrauchVorlage(p, st, ziel, kennzahlen) {
  const V = p.verbrauchDaten(st, ziel), { Q, z, aus, alle, eur, einC, basis, oa, laedt, reihen, sum, spitze, wo, preis } = V;
  return html`<div class="block-kopf">${ziel === 'sheet' ? html`<h3>${eur ? 'Kosten' : 'Verbrauch'}</h3>` : html`<b>Verbrauch</b>`}<span class="leise">${V.titel}</span></div>
      <div class="seg">${ZEITRAEUME.map(v => html`<button data-v=${v} class=${v === z ? 'on' : ''} @click=${() => p.zeitraumWahl(ziel, v)}>${v}</button>`)}</div>
      ${ziel === 'aw' ? nothing : zeitraumVorlage(p, ziel, z, p.zrGrenze(alle))}
      <div class="vb-gruppe"><span class="leise">stapeln nach</span><div class="seg klein">${[['teil', alle ? 'Baustelle' : 'Container'], ['firma', 'Firma']].map(([k, t]) => html`<button data-v=${k} class=${(st.gruppe || 'teil') === k ? 'on' : ''} @click=${() => p.vbGruppe(ziel, k)}>${t}</button>`)}</div></div>
      <div class="vb-wer"><button class=${!aus.length ? 'on' : ''} @click=${() => p.vbWer(ziel, '')}><i style="background:var(--s1)"></i>Summe</button>
        <button data-id="*" class=${V.alleGewaehlt ? 'on' : ''} @click=${() => p.vbWer(ziel, '*')}>Alle gestapelt</button>
        ${Q.map(q => html`<button data-id=${q.id} class=${st.auswahl.includes(q.id) ? 'on' : ''} @click=${() => p.vbWer(ziel, q.id)}><i style="background:${q.farbe}"></i>${q.name}${st.auswahl.includes(q.id) ? ' ✓' : ''}</button>`)}</div>
      ${kennzahlen ? html`<div class="kennz"><div><b>${laedt ? '–' : de(sum, sum < 100 ? 1 : 0)}</b><span>kWh ${{ Tag: 'heute', Woche: 'diese Woche', Monat: 'im Monat', Jahr: 'im Jahr' }[z]}${reihen.length > 1 ? ' zusammen' : ''}</span></div>
        <div><b>${laedt ? '–' : de(sum * preis, 2)} €</b><span>Kosten</span></div><div><b>${laedt ? '–' : wo}</b><span>Spitze ${laedt ? '–' : de(spitze, 1)} kWh</span></div></div>` : nothing}
      ${einC ? html`<div class="vb-gruppe"><span class="leise">ohne Automatik mit</span><div class="seg klein">${[['geraet', 'Ø je Gerät'], ['typ', 'Ø je Typ']].map(([k, t]) => html`<button data-v=${k} class=${basis === k ? 'on' : ''} @click=${() => p.ohneBasisWahl(k)}>${t}</button>`)}</div></div>
        ${oa && oa.ergebnis ? html`<div class="kennz"><div><b>${de(oa.ohne_kwh, oa.ohne_kwh < 100 ? 1 : 0)}</b><span>kWh ohne Automatik</span></div><div><b>${de(oa.ergebnis.gespart_eur, 2)} €</b><span>gespart</span></div><div><b>${de(oa.ergebnis.prozent, 0)} %</b><span>weniger</span></div></div>`
          : oa ? html`<div class="leise">Noch keine gemessene Leistung der Heizkörper – „ohne Automatik“ folgt nach dem ersten Heizen.</div>` : nothing}
        <div class="leise">So rechnet „ohne Automatik“: ${basis === 'typ' ? 'die Ø-Leistung aller Heizkörper desselben Typs (Ölradiator bzw. Konvektor)' : 'jeder Heizkörper mit seiner gemessenen Ø-Leistung im Betrieb (sobald er Strom zieht, ab 5 W)'} rund um die Uhr seit Beginn der Baustelle; gespart = ohne Automatik − tatsächlich verbraucht, mal Strompreis.</div>` : nothing}
      <div class="leise">${V.einheit} ${V.je}${aus.length > 1 ? ' · gestapelt, oberste Kante = Summe' : ''}</div>
      <div class="chart-wrap">${laedt ? LAEDT : svg(V.chart)}</div>
      ${V.jeReihe.length ? html`<div class="vb-je">${V.jeReihe.map(r => html`<div><i style="background:${r.farbe}"></i><span class="n">${r.name}</span><b>${de(r.su, r.su < 100 ? 1 : 0)} kWh</b><span>${de(r.su * preis, 2)} €</span><span class="leise">Spitze ${r.spitzeBei}</span></div>`)}</div>` : nothing}`;
}

const verbrauch = (p, s) => html`${GRIFF}${verbrauchVorlage(p, s, 'sheet', true)}${knopf('Schließen', () => p.schliessen())}`;

/* Wetter: jetzt, stündlich, Tagesverlauf (heute/morgen) oder 3 Tage; Folgen für die Heizung von der Integration (Plan) */
function wetter(p, s) {
  const d = p.d, a = s.wa || 'std', e = d.e, ws = p.zustand(d.wetterEid), w = d.wetter || {};
  // AN-0021: „Kleidung trocknen“ nur, wenn der Plan der Integration es für den Tag vorsieht (Regen in der Arbeitszeit)
  const folge = (t, iso) => html`${zahl(t) && t < e.frueh_temp ? html`<span class="w-folge blau">Frühstart</span>` : nothing}${((d.plan[iso] || {}).gruende || []).includes('trocknen') ? html`<span class="w-folge amber">Kleidung trocknen</span>` : nothing}${zahl(t) && t > e.grenze ? html`<span class="w-folge">über Heizgrenze</span>` : nothing}`;
  const H = p.vorhersage.hourly, D = p.vorhersage.daily, jetzt = d.z.jetztMs;
  const regen = x => html`<span class="w-regen">${x && zahl(x.precipitation) && x.precipitation > 0 ? de(x.precipitation) + ' mm' : '–'}</span>`;
  let inhalt;
  if (a === 'std') {
    const std = (H || []).filter(x => Date.parse(x.datetime) > jetzt - 36e5).slice(0, 6);
    inhalt = H === null ? LAEDT : !std.length ? html`<div class="leer">Keine stündliche Vorhersage</div>` : html`<div class="w-std">${std.map(x => html`<div><span class="leise">${p.lokal(x.datetime).slice(11, 13)}:00</span>${svg(wetterIcon(p.nachtWetter(x.condition, Date.parse(x.datetime)), 36))}<b>${de(x.temperature, 0)}°</b>
          ${regen(x)}<span class="leise">${zahl(x.precipitation_probability) ? x.precipitation_probability : 0} %</span></div>`)}</div>`;
  } else if (a === 'tag') {
    const teile = [['Morgen', 7], ['Mittag', 12], ['Nachmittag', 16], ['Nacht', 22]], jetztH = +d.z.JETZT.slice(0, 2);
    const tagSt = p.statistik('Tag'), aussen = tagSt && tagSt.werte[p.eid(d, d.entry, 'aussen')];
    const stunde = (tag, h) => (H || []).find(x => p.lokal(x.datetime).slice(0, 13) === `${tag} ${String(h).padStart(2, '0')}`);
    inhalt = H === null ? LAEDT : [['Heute', d.z.HEUTE], ['Morgen', plusTage(d.z.HEUTE, 1)]].map(([name, tag]) => html`<div class="w-tag"><div class="w-tag-n">${name}</div><div class="w-teile">${teile.map(([t, h]) => {
      const x = stunde(tag, h), vorbei = tag === d.z.HEUTE && h < jetztH, temp = x ? x.temperature : vorbei && aussen ? aussen[h] : null;
      return html`<div class=${vorbei ? 'vorbei' : ''}><span class="leise">${t}</span>${svg(wetterIcon(x ? p.nachtWetter(x.condition, Date.parse(x.datetime)) : (ws ? p.nachtWetter(ws.state) : 'cloudy'), 34))}<b>${zahl(temp) ? de(temp, 0) + '°' : '–'}</b>${regen(x)}</div>`; })}</div></div>`);
  } else {
    const tage = (D || []).filter(x => p.lokal(x.datetime).slice(0, 10) > d.z.HEUTE).slice(0, 3);
    inhalt = D === null ? LAEDT : !tage.length ? html`<div class="leer">Keine Tagesvorhersage</div>` : html`<div class="w-3">${tage.map(x => { const t = p.lokal(x.datetime).slice(0, 10); return html`<div class="w-3z">
          <div class="w-3t"><b>${wtag(t)}</b><span class="leise">${kurzDatum(t)}</span></div>${svg(wetterIcon(x.condition, 40))}
          <div class="w-3w"><b>${de(x.temperature, 0)}°</b><span class="leise">${de(x.templow, 0)}°</span></div>
          <div class="w-3r">${regen(x)}<span class="leise">${zahl(x.precipitation_probability) ? x.precipitation_probability : 0} %</span></div>
          <div class="w-3f">${folge(x.templow, t)}</div></div>`; })}</div>`;
  }
  const [wz, wt, wtemp] = p.wetterJetzt(), gef = ws && ws.attributes.apparent_temperature;
  const morgen = plusTage(d.z.HEUTE, 1), pm = d.plan[morgen], wm = p.wetterTag(morgen), g = (pm && pm.gruende) || [];
  const fuer = [g.includes('frueher_nach_regen') ? `Kleidung trocknen morgen früh aktiv${d.trocknen && zahl(d.trocknen.heute_mm) ? ` (${de(d.trocknen.heute_mm, 1)} mm Regen in der Arbeitszeit heute, ${d.trocknen.frueher_morgen_min} min früher)` : ''}` : '',
    g.includes('fruehstart') ? `Kälte-Frühstart morgen ${e.frueh_min} min früher${zahl(wm.kalt) ? ` (${de(wm.kalt, 0).replace('-', '−')} °C)` : ''}` : ''].filter(Boolean);
  return html`${GRIFF}<h3>Wetter · ${p.name(d.wetterEid) || d.titel}</h3><div class="w-jetzt">${svg(wetterIcon(wz, 72))}<div><b>${zahl(wtemp) ? de(wtemp) + ' °C' : '–'}</b><div class="leise">${[ws ? WETTER_TEXT[p.nachtWetter(ws.state)] || ws.state : wt, zahl(w.regen_heute) && w.regen_heute > 0 ? `${de(w.regen_heute, w.regen_heute % 1 ? 1 : 0)} mm Regen heute` : '', zahl(gef) ? `gefühlt ${de(gef, 0)} °C` : ''].filter(Boolean).join(' · ')}</div></div></div>
        <div class="seg">${[['std', 'Stündlich'], ['tag', 'Tagesverlauf'], ['3', '3 Tage']].map(([k, t]) => html`<button data-v=${k} class=${a === k ? 'on' : ''} @click=${() => p.wetterAnsicht(k)}>${t}</button>`)}</div>
        <div class="w-inhalt">${inhalt}</div>
        <div class="leise">Für die Heizung: ${fuer.length ? fuer.join(', ') + '.' : 'morgen nichts Besonderes.'}</div>${knopf('Schließen', () => p.schliessen())}`;
}

/* Warnungen: offen (Störungen, Hinweise) und stumm bis morgen; „stumm“ ist eine Vor-Ort-Aktion (warnung_stumm) */
function warnungen(p) {
  const d = p.d, W = d.warnungen;
  const karte = w => html`<div class="wk ${w.stufe} ${w.stumm ? 'stumm' : ''}"><div class="wk-kopf"><b>${p.bName(w.b)}</b><span class="leise">${p.seitText(w.seitIso)}</span></div>
        <div class="wk-titel">${w.titel}</div><div class="leise">${w.hilfe}</div>
        <div class="wk-knoepfe">${w.b && d.bereiche.some(b => b.id === w.b) ? html`<button class="chip glas-panel" data-id=${w.b} @click=${() => p.gehe('container', w.b)}>Zum Container ›</button>` : nothing}
          <button class="chip glas-panel" data-id=${w.id} @click=${() => p.warnungStumm(w.id)}>${w.stumm ? '🔔 wieder melden' : '🔕 bis morgen stumm'}</button></div></div>`;
  const gruppe = (titel, liste) => liste.length ? html`<div class="gruppe-t">${titel} · ${liste.length}</div>${liste.map(karte)}` : nothing;
  const offen = W.filter(w => !w.stumm);
  return html`${GRIFF}<div class="block-kopf"><h3>Warnungen</h3><span class="leise">${offen.length} offen</span></div>
        ${offen.length ? nothing : html`<div class="leer">Alles in Ordnung ✓</div>`}
        ${gruppe('Störungen', offen.filter(w => w.stufe === 'stoerung'))}${gruppe('Hinweise', offen.filter(w => w.stufe === 'hinweis'))}${gruppe('Stumm bis morgen', W.filter(w => w.stumm))}
        <button class="zeile" @click=${() => p.warnungenProtokoll()}><span class="blau">Alle Einträge im Protokoll</span><span class="chev">›</span></button>
        ${knopf('Schließen', () => p.schliessen(), 'leise-k')}`;
}

/* Baustelle wählen: öffnen (frei), bearbeiten, löschen und neu anlegen (nur Admins) */
function baustellen(p) {
  const d = p.d;
  return html`${GRIFF}<h3>Baustelle wählen</h3>${p.alle.map(b => html`<div class="zeile bs-zeile"><button class="bs-wahl" data-id=${b.entry} @click=${() => p.baustelleOeffnen(b.entry)}><span>${b.titel}${d && b.entry === d.entry ? ' ✓' : ''}</span><span class="badge ${b.aktiv ? 'gruen' : ''}">${b.aktiv ? 'aktiv' : 'abgeschlossen'}</span></button>
        <button class="bs-ic nur-admin" data-id=${b.entry} title="Bearbeiten" aria-label="${b.titel} bearbeiten" @click=${p.nurAdmin(() => p.bsBearbeiten(b.entry))}>✎</button><button class="x nur-admin" data-id=${b.entry} title="Löschen" aria-label="${b.titel} löschen" @click=${p.nurAdmin(() => p.einblenden('bs-loeschen', { id: b.entry }))}>✕</button></div>`)}
      <button class="zeile nur-admin" @click=${p.nurAdmin(() => p.einblenden('baustelle-neu'))}><span class="blau">+ Neue Baustelle</span></button>`;
}

/* Zustand eines Heizkörpers in der Stromverteilung: [Text, Klasse] (FE-0011: gemessen) */
const stromZustand = x => x.b.offline || !x.g.erreichbar ? ['offline', 'rot-t'] : x.b.boost && x.g.an ? ['heizt – schnell, Vorrang', 'amber-t'] : x.b.z === 'pause' ? ['pausiert – Tür offen', 'lila']
  : x.g.warte ? [`wartet${zahl(x.g.warte.dran_in_min) ? ` – dran in ${x.g.warte.dran_in_min} min` : ''}`, 'blau']
  : x.g.an ? (zahl(x.g.kwJetzt) && x.g.kwJetzt < 0.05 ? ['an · zieht gerade nichts (Thermostat)', 'leise'] : [`heizt · ${de(zahl(x.g.kwJetzt) ? x.g.kwJetzt : x.g.kw, 2)} kW`, 'amber-t']) : ['aus', 'leise'];

/** Rangliste der Staffelung (Herbert 01.10.2026, Mockup staffel-rang.html): Reihenfolge und Bedarf in °C rechnet die
 *  Integration (laufzeit.staffel.rang, laufzeit.container.<id>.bedarf) – hier nur die Anzeige */
/* AN-0017: Zustand je Zeile und Kopfzeile kommen von der Integration (laufzeit.staffel.rangliste) – Klasse nur zur Farbe */
const RANG_KLASSE = { heizt: 'amber-t', wartet: 'blau', satt: 'leise', tuer_offen: 'lila', zurueckgehalten: 'leise', aus: 'leise' };
const rangZustand = (z, x, zustand) => !z ? zustand(x) : x.b.offline || !x.g.erreichbar ? ['offline', 'rot-t']
  : [`${z.text}${z.zustand === 'wartet' && x.g.warte && zahl(x.g.warte.dran_in_min) ? ` – dran in ${x.g.warte.dran_in_min} min` : ''}`, RANG_KLASSE[z.zustand] || 'leise'];
export function stromRang(p, L, zustand = stromZustand) {
  const d = p.d, rl = (d.staffel && d.staffel.rangliste) || null, rang = rl ? rl.zeilen.map(z => z.id) : (d.staffel && d.staffel.rang) || [], offen = p.s.srOffen || [];
  const zNach = Object.fromEntries(((rl && rl.zeilen) || []).map(z => [z.id, z]));
  const nachId = Object.fromEntries(L.hk.map(x => [x.g.id, x])), zeilen = rang.map(id => nachId[id]).filter(Boolean);
  if (!zeilen.length) return nothing;
  const f = (v, k = 2) => `${v > 0 ? '+' : v < 0 ? '−' : ''}${de(Math.abs(v), k)}`, gesehen = new Set();
  const letzterAn = [...zeilen].reverse().find(x => x.g.an);
  return html`<div class="sr-kopf"><b>Rangliste</b><span class="leise">oben = zuerst an, unten = gibt zuerst ab</span></div>
      ${rl && rl.kopf ? html`<div class="sr-lage">${rl.kopf}</div>` : nothing}
      <div class="sr-liste">${zeilen.map((x, i) => {
        const { b, g } = x, B = b.bedarfGrad, erster = !gesehen.has(b.id); gesehen.add(b.id);
        const stufen = html`${b.z === 'frost' ? html`<span class="sr-stufe frost">❄ Frostschutz</span>` : nothing}${b.boost ? html`<span class="sr-stufe boost">⚡ Schnell</span>` : nothing}${erster ? html`<span class="sr-stufe erster">erster im Container</span>` : html`<span class="sr-stufe">Zweitgerät</span>`}${b.prio && b.prio !== 'normal' ? html`<span class="sr-stufe">Priorität ${b.prio}</span>` : nothing}`;
        const [zt, zk] = rangZustand(zNach[g.id], x, zustand), auf = offen.includes(g.id);
        const mitFuehler = B && zahl(B.jetzt);
        const wert = B ? html`<div class="sr-bedarf">${f(B.summe)} °C<small>${mitFuehler ? `Bedarf in ${B.horizont_min} min` : 'ohne Fühler'}</small></div>` : html`<div class="sr-bedarf">–<small>noch nicht gerechnet</small></div>`;
        const teile = !B ? [] : mitFuehler ? [
          [`jetzt ${de(b.t, 1)} °C, Soll ${de(p.sollVon(b), 1)} °C`, B.jetzt],
          ...(zahl(B.abkuehlen) ? [[`kühlt ohne Heizen ${de(B.abkuehl_h, 1)} °C/h ab (${B.gemessen ? 'gemessen' : 'gelernt'}) → in ${B.horizont_min} min`, B.abkuehlen]] : []),
          ...(B.nachlauf ? [['heizt nach dem Aus noch nach (gelernt)', B.nachlauf]] : []),
          ...(B.ziel ? [[`schafft das Soll bis Arbeitsbeginn nicht (${zahl(B.aufheiz_h) ? `${de(B.aufheiz_h, 1)} °C/h gelernt` : 'gelernt'})`, B.ziel]] : []),
          ...(B.gerecht ? [[`wenig Heizzeit in der letzten Stunde (${B.heiz_min} min)`, B.gerecht]] : []),
        ] : [['Ohne Fühler kein Bedarf – kommt über die Heizzeit der letzten Stunde reihum dran', B.gerecht]];
        const aufTeil = !auf || !teile.length ? nothing : html`<div class="sr-auf">${teile.map(([t, v]) => html`<span>${t}</span><b>${f(v)} °C</b>`)}<span class="summe">Bedarf</span><b class="summe">${f(B.summe)} °C</b></div>`;
        return html`<div class="sr-zeile" data-id=${g.id} role="button" tabindex="0" @click=${() => p.stromRangAuf(g.id)}><span class="sr-nr">${i + 1}</span><div class="sr-name"><b>${b.name} · ${g.n}</b><div>${stufen}</div></div>${wert}
          <div class="sr-zust"><span class=${zk}>${zt}${x === letzterAn && g.an ? ' · gibt als nächstes ab' : ''}</span> <span class="leise">· antippen: woraus</span></div>${aufTeil}</div>`; })}</div>`;
}

/* Stromverteilung: je Anschluss Heizung/Pumpen/Sonstiges/Reserve und die Heizkörper; Zahlen von der Integration (p.last) */
function strom(p) {
  const d = p.d, L = p.last(), e = d.e;
  return html`${GRIFF}<div class="block-kopf"><h3>Stromverteilung</h3><span class="leise">${L.laufen} von ${L.hk.length} Heizkörpern an · höchstens ${L.max}</span></div>
        <div class="strom-leg"><span><i class="s-heiz"></i>Heizung ${de(L.heiz)} kW</span><span><i class="s-pumpe"></i>Pumpen ${de(L.pumpe)} kW</span><span><i class="s-sonst"></i>Sonstiges ${de(L.sonst)} kW</span><span><i class="s-res"></i>Reserve (Kran, Werkzeug)</span></div>
        ${L.A.map(a => { const w = v => `${a.grenze > 0 ? Math.max(0, v / a.grenze * 100) : 0}%`;
          return html`<div class="an-block"><div class="an-kopf"><b>${a.name}</b><span class="leise">${a.phasen === 3 ? '3 × ' : ''}${a.ampere ?? '–'} A · ${de(a.heiz + a.pumpe + a.sonst)} von ${de(a.grenze)} kW</span></div>
          <div class="strom-spur"><i class="s-heiz" style="width:${w(a.heiz)}"></i><i class="s-pumpe" style="width:${w(a.pumpe)}"></i><i class="s-sonst" style="width:${w(a.sonst)}"></i><i class="s-res" style="width:${w(a.reserve)}"></i></div>
          <div class="leise">${a.frei < 2 ? html`<span class="amber-t">nur ${de(Math.max(0, a.frei))} kW frei</span>` : `${de(a.frei)} kW frei`} für Heizungen</div>
          ${L.hk.filter(x => x.b.anschluss === a.id).map(x => { const [t, k] = stromZustand(x); return html`<div class="zeile"><span>${x.b.name} · ${x.g.n}</span><span class=${k}>${t}</span></div>`; })}</div>`; })}
        ${e.staffel ? stromRang(p, L, stromZustand) : nothing}
        <div class="hinweis-k">Je Anschluss gilt: ${e.nutzbar} % der Anschlussleistung (vorsichtig, weil die Verteilung auf die Phasen unbekannt ist) minus Reserve minus alles, was gerade läuft (gemessen). Gerechnet wird mit dem gemessenen Verbrauch: ein eingeschalteter Heizkörper, dessen Thermostat gerade abgeschaltet hat, zählt mit dem, was er zieht. Ist der Anschluss länger als 30 s zu voll, geht der unterste der Rangliste aus – bei gleichem Rang der größere. Die Rangliste: Frostschutz, Schnell aufheizen, erster im Container, Priorität, dann der Bedarf in °C (jetzt unter dem Soll + Abkühlen ohne Heizen − Nachlauf + was bis Arbeitsbeginn fehlt + wenig Heizzeit in der letzten Stunde). Ein Heizkörper kommt erst dazu, wenn eine Minute lang genug für seine volle Leistung frei ist. Jeder läuft mindestens ${e.min_lauf} min und pausiert mindestens ${e.min_pause} min; dürfen nicht alle, wechseln sie alle ${e.takt} min – der oberste Wartende gegen den untersten Laufenden. Jeder Container bekommt zuerst einen Heizkörper; ein zweiter im selben Container kommt erst dazu, wenn Platz ist, und verdrängt nie den einzigen eines anderen.</div>
        ${knopf('Anschlüsse einstellen', () => p.einstGruppe('strom'), 'leise-k')}${knopf('Schließen', () => p.schliessen(), 'leise-k')}`;
}

/* WU-0016: Bild einer Meldung groß */
function mBild(p, s) {
  const m = (p.meldungen() || []).find(x => x.id === s.id), u = m && p.mlBild(m, s.i);
  return html`${GRIFF}<h3>${(m && m.ticket) || 'Meldung'} · Bild ${s.i + 1}</h3>${u ? html`<img class="mb-gross" src=${u} alt="Bild">` : LAEDT}${knopf('Schließen', () => p.schliessen())}`;
}

/** Einblendungen der Übersicht (Art → Vorlage) */
export const UEBERSICHT_EINBLENDUNGEN = { verbrauch, wetter, warnungen, baustellen, strom, 'm-bild': mBild };
