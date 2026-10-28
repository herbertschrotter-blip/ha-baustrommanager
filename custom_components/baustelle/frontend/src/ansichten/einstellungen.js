// Einstellungen mit Lit (BSM-022 Stufe 3e; WU-0007, Mockup einstellungen-varianten.html Variante 1 „Seitenleiste“).
// Alle Einstellungen in Gruppen: links die Seitenleiste, auf dem Handy Chips oben. Jede Gruppe ist eine eigene Vorlage
// (vorher schnitt einstBlock() die Gruppen per Titelsuche aus einem HTML-Text). Die Heizung-Blöcke kommen aus heizung.js,
// „Entwicklung“ und „Über“ aus dev.js/ueber.js, das Notprogramm aus notprogramm.js, Geräte und Inventar aus geraete.js (BSM-034.05).
import { html, nothing } from 'lit';
import { MONATE, de, zahl } from '../hilfen.js';
import { BEREICH_FARBEN } from '../symbole.js';
import { kopfVorlage, schalterVorlage, stepperVorlage } from './allgemein.js';
import { HZ_BLOECKE } from './heizung.js';
import { preisListeVorlage } from './einblendungen-baustelle.js';
import { devVorlage } from './dev.js';
import { ueberVorlage } from '../ueber.js';
import { npGruppeVorlage } from './notprogramm.js';
import { geraeteGruppeVorlage } from './geraete.js';

const liste = (titel, inhalt) => html`<div class="glas-panel liste"><div class="gruppe">${titel}</div>${inhalt}</div>`;
const zeile = (t, x, sub = '') => html`<div class="zeile"><div><b>${t}</b>${sub ? html`<div class="leise">${sub}</div>` : nothing}</div>${x}</div>`;
const knopf = (t, wert, fn, cls = '') => html`<button class="zeile ${cls}" @click=${fn}><span>${t}</span><span class="leise">${wert} ›</span></button>`;

function baustelle(p) {
  const d = p.d, e = d.e, o = d.optionen, nm = x => x ? p.name(x) : '–', tk = o.termine_kalender || e.termine_kalender, auf = art => p.nurAdmin(() => p.einblenden(art));
  return html`<div class="glas-panel liste"><div class="gruppe">Baustelle</div>
        <button class="zeile nur-admin" @click=${auf('name')}><span>Name</span><span class="leise">${d.titel} ›</span></button>
        <button class="zeile nur-admin" @click=${auf('zeitraum-bs')}><span>Beginn und Ende</span><span class="leise">${p.bsZeit(d)} ›</span></button>
        <button class="zeile nur-admin" @click=${auf('zeitraum-bs')}><span>Heizperiode</span><span class="leise">${MONATE[d.hp[0] - 1]} – ${MONATE[d.hp[1] - 1]} ›</span></button>
        <button class="zeile" @click=${() => p.einblenden('abschliessen')}><span>Baustelle abschließen</span><span class="leise">kommt in den Verlauf ›</span></button>
        <button class="zeile nur-admin" @click=${auf('baustelle-neu')}><span class="blau">+ Neue Baustelle</span></button></div>
      ${liste('Wetter und Kalender', html`${knopf('Wetter', o.wetter ? nm(o.wetter) : 'keins gewählt', auf('wetterquelle'), 'nur-admin')}${knopf('Außentemperatur', o.temp_sensor ? nm(o.temp_sensor) : 'aus der Vorhersage', auf('wetterquelle'), 'nur-admin')}${knopf('Regenmenge', o.regen_sensor ? nm(o.regen_sensor) : 'aus der Vorhersage', auf('wetterquelle'), 'nur-admin')}${knopf('Urlaub', o.urlaub_kalender ? `Kalender „${nm(o.urlaub_kalender)}“` : 'kein Kalender', auf('wetterquelle'), 'nur-admin')}${knopf('Feiertage', o.feiertag_kalender ? nm(o.feiertag_kalender) : 'kein Kalender', auf('wetterquelle'), 'nur-admin')}${knopf('Termine (Bei Bedarf)', tk ? nm(tk) : 'kein Kalender', auf('wetterquelle'), 'nur-admin')}`)}`;
}

const heizung = p => html`${liste('Automatik', zeile('Automatik', schalterVorlage(p.d.e.auto, () => p.automatikUmschalten()), 'die Integration schaltet die Heizungen nach Plan und Regeln'))}${['regeln', 'trocknen', 'urlaub'].map(k => HZ_BLOECKE[k](p, 'glas-panel block'))}${liste('Zeiten', html`${knopf('Arbeitszeit', 'ändern, neue ab Datum', () => p.hzAuf('az'))}${knopf('Ausnahmen', 'einmalig', () => p.hzAuf('ausn'))}${knopf('Heizplan · diese Woche', 'ansehen', () => p.hzAuf('plan'))}`)}`;

const container = p => { const d = p.d; return html`<div class="glas-panel liste"><div class="gruppe">Container und Geräte</div>
        ${d.bereiche.map(b => html`<button class="zeile" data-id=${b.id} @click=${() => p.bereichEinst(b.id)}><span><i class="farbpunkt" style="background:${BEREICH_FARBEN[b.f % 6]}"></i>${b.name}</span><span class="leise">${b.geraete.length} ${b.pumpe ? 'Pumpen' : 'Geräte'} ›</span></button>`)}
        <button class="zeile nur-admin" @click=${p.nurAdmin(() => p.einblenden('container-neu'))}><span class="blau">+ Container oder Schacht</span></button></div>${HZ_BLOECKE.container(p, 'glas-panel block')}`; };

function pumpen(p) {
  const st = (k, s, fmt) => stepperVorlage(p, k, s, fmt), P = p.d.bereiche.filter(b => b.pumpe);
  return liste('Überwachung der Pumpen', html`${zeile('Offline – melden nach', st('offline_min', 1, v => `${v} min`))}${zeile('Trockenlauf unter', st('trocken_w', 5, v => `${v} W`))}${zeile('Dauerlauf länger als', st('dauer_min', 5, v => `${v} min`))}${zeile('Schaltet oft ab', st('zyklen_h', 1, v => `${v} / h`))}${P.map(b => zeile(`♨ Automatik · ${b.name}`, schalterVorlage(b.auto, () => p.bereichAuto(b))))}`);
}

function strom(p) {
  const d = p.d, e = d.e, st = (k, s, fmt) => stepperVorlage(p, k, s, fmt);
  return html`<div class="glas-panel liste"><div class="gruppe">Strom</div>
        ${preisListeVorlage(p)}
        <div class="zeile"><div><b>⚡ Staffelung</b><div class="leise">verteilt die Heizungen auf den freien Strom – geschaltet werden nur Heizungen</div></div>${schalterVorlage(e.staffel, () => p.einstellungUmschalten('staffel'))}</div>
        ${e.staffel ? html`<div class="gruppe-t gt-einzug">Anschlüsse</div>
        ${d.anschluesse.map(a => html`<button class="zeile unter" data-id=${a.id} @click=${() => p.anschlussAuf(a.id)}><div><b>${a.name}</b><div class="leise">${a.phasen === 3 ? '3 × ' : ''}${a.ampere} A · Reserve ${de(a.reserve)} kW · ${d.bereiche.filter(b => b.anschluss === a.id).map(b => b.name).join(', ') || 'keine Container'}</div></div><span class="chev">›</span></button>`)}
        <button class="zeile unter" @click=${() => p.anschlussAuf()}><span class="blau">+ Anschluss hinzufügen</span></button>
        <div class="zeile unter"><div><span>Nutzbar je Anschluss</span><div class="leise">vorsichtig, weil unbekannt ist, welche Steckdose an welcher Phase hängt</div></div>${st('nutzbar', 5, v => `${v} %`)}</div>
        <div class="zeile unter"><span>Höchstens gleichzeitig</span>${st('max_gleich', 1, v => `${v} Heizk.`)}</div>
        <div class="zeile unter"><span>Mindestlaufzeit</span>${st('min_lauf', 1, v => `${v} min`)}</div>
        <div class="zeile unter"><span>Mindestpause</span>${st('min_pause', 1, v => `${v} min`)}</div>
        <div class="zeile unter"><div><span>Wechsel im Rundlauf</span><div class="leise">wenn nicht alle gleichzeitig dürfen</div></div>${st('takt', 5, v => `${v} min`)}</div>
        <div class="zeile unter"><span class="leise">Gesamtzähler: keiner – gerechnet wird mit den Shellys und der Reserve je Anschluss. Später kann je Anschluss ein Zähler dazukommen.</span></div>
        <div class="gruppe-t gt-einzug" data-r="vorrang">Vorrang, wenn nicht alle dürfen</div>
        ${d.bereiche.filter(b => !b.pumpe).map(b => html`<div class="zeile unter"><span>${b.name}</span><div class="seg klein">${['niedrig', 'normal', 'hoch'].map(v => html`<button data-v=${v} class=${(b.prio || 'normal') === v ? 'on' : ''} @click=${() => p.vorrang(b, v)}>${v}</button>`)}</div></div>`)}
        <div class="leise p-fuss">Frostschutz geht immer vor. Pumpen und andere Verbraucher werden mitgezählt, aber nie geschaltet.</div>` : nothing}</div>`;
}

const firmen = p => { const d = p.d; return html`<div class="glas-panel liste"><div class="gruppe">Firmen · für die Abrechnung</div>
        ${d.firmen.map(f => { const n = d.bereiche.filter(b => (b.firma || 'eigen') === f.id).length;
          return html`<button class="zeile" data-id=${f.id} @click=${() => p.firmaAuf(f.id)}><span>${f.name}${f.eigen ? html` <span class="badge">eigene</span>` : nothing}</span><span class="leise">${n} Container ›</span></button>`; })}
        <button class="zeile" @click=${() => p.firmaAuf()}><span class="blau">+ Firma hinzufügen</span></button></div>`; };

function meldungen(p) {
  const e = p.d.e, st = (k, s, fmt) => stepperVorlage(p, k, s, fmt), sw = k => schalterVorlage(e[k], () => p.einstellungUmschalten(k));
  const m = (t, k) => html`<div class="zeile"><span>${t}</span>${sw(k)}</div>`;
  return html`<div class="glas-panel liste"><div class="gruppe">Meldungen · Störungen</div>
        <div class="zeile"><span>Empfänger</span><span class="leise">${e.empfaenger}</span></div>
        <div class="zeile"><div><b>Knöpfe in der Nachricht</b><div class="leise">direkt aus der Nachricht reagieren, z. B. „bis morgen stumm“</div></div>${sw('knoepfe')}</div>
        <button class="zeile" @click=${() => p.einblenden('nachrichten')}><span class="blau">Beispiele ansehen</span><span class="chev">›</span></button>
        <button class="zeile" @click=${() => p.testMeldung()}><span class="blau">Test-Nachricht senden</span></button>
        ${m(`Stromausfall / offline (nach ${de(e.offline_min, 0)} min)`, 'm_offline')}${m(`Pumpe Trockenlauf (unter ${de(e.trocken_w, 0)} W)`, 'm_trocken')}${m(`Pumpe Dauerlauf über ${e.dauer_min} min`, 'm_dauer')}${m(`Pumpe schaltet oft (ab ${e.zyklen_h} je Stunde)`, 'm_zyklen')}${m('Heizkörper zieht keinen Strom', 'm_leistung')}${m('Frostgefahr trotz Frostschutz', 'm_frost')}${m('Gerät schaltet sich selbst wieder ein (Auto-ON am Shelly?)', 'm_selbst')}
        <div class="gruppe">Hinweise</div>
        ${m(`Zu kalt trotz Heizung (nach ${e.kalt_min} min)`, 'm_kalt')}${m('Fühler meldet nichts / Batterie schwach', 'm_fuehler')}${m('Keine Wettervorhersage', 'm_wetter')}${m(`Handbetrieb länger als ${e.hand_h} h`, 'm_hand')}
        <div class="leise p-fuss">Störungen, offene Tür und langer Handbetrieb kommen aufs Handy, andere Hinweise nur ins Protokoll und in den Warnung-Chip.</div></div>
      ${liste('Schwellen der Hinweise', html`${zeile('Zu kalt trotz Heizung nach', st('kalt_min', 15, v => `${v} min`))}${zeile('Handbetrieb länger als', st('hand_h', 1, v => `${de(v)} h`))}${zeile('Tür offen – Nachricht nach', st('tuer_melden', 5, v => `${v} min`))}`)}`;
}

function bericht(p) {
  const e = p.d.e, sw = k => schalterVorlage(e[k], () => p.einstellungUmschalten(k));
  return html`<div class="glas-panel liste"><div class="gruppe">Bericht</div>
        <div class="zeile"><span>Wie oft</span><div class="seg klein">${[['aus', 'aus'], ['woche', 'Woche'], ['monat', 'Monat'], ['beides', 'beides']].map(([k, t]) => html`<button data-v=${k} class=${e.bericht === k ? 'on' : ''} @click=${() => p.einstellungWert('bericht', k)}>${t}</button>`)}</div></div>
        ${e.bericht !== 'aus' ? html`<div class="zeile unter"><span class="leise">${{ woche: 'jeden Montag 07:00 für die Vorwoche', monat: 'am 1. des Monats 07:00 für den Vormonat', beides: 'Montag 07:00 und am 1. des Monats' }[e.bericht] || ''}</span></div>
        <div class="zeile unter"><span>📱 aufs Handy</span>${sw('bericht_handy')}</div>
        <div class="zeile unter"><span>✉ per E-Mail</span>${sw('bericht_mail')}</div>
        ${e.bericht_mail ? html`<label class="zeile unter"><span>an</span><input type="email" value=${e.mail} .value=${e.mail} class="mail-feld nur-admin" @change=${p.nurAdmin(ev => p.mailSetzen(ev.target.value))}></label>
        <div class="zeile unter"><span>Abrechnung als CSV anhängen</span>${sw('bericht_csv')}</div>
        <div class="zeile unter"><span class="leise">über den Dienst notify.${e.mail_dienst || 'baustelle_mail'} (z. B. Google Mail oder SMTP in HA eingerichtet)</span></div>` : nothing}
        <button class="zeile" @click=${() => p.einblenden('bericht')}><span class="blau">Beispiel ansehen</span><span class="chev">›</span></button>
        <button class="zeile" @click=${() => p.berichtSenden()}><span class="blau">Jetzt senden</span></button>` : nothing}</div>`;
}

const ansicht = p => { const e = p.d.e; return liste('Ansicht', html`${zeile('Erklärungen anzeigen', schalterVorlage(e.erklaer, () => p.einstellungUmschalten('erklaer')), 'kurze Texte „ⓘ“ unter Heizung, Pumpen und Auswertung')}${zeile('Melden-Knopf', schalterVorlage(e.melden, () => p.einstellungUmschalten('melden')), 'kleiner Knopf in jedem Fenster für Fehler, Wünsche und Anregungen')}<button class="zeile" @click=${() => p.awVorlageWahl('misch')}><span>Auswertung auf Vorschlag zurücksetzen</span><span class="leise">gilt für diesen Browser</span></button>`); };

function entwicklung(p) {
  const dev = (p.s.evDev || 'meldungen') === 'meldungen', setze = k => { p.s.evDev = k; p.neuZeichnen(); };
  return html`<div class="seg ev-dev-reiter">${[['meldungen', 'Meldungen'], ['werkzeuge', 'Werkzeuge']].map(([k, t]) => html`<button data-v=${k} class=${(dev ? 'meldungen' : 'werkzeuge') === k ? 'on' : ''} @click=${() => setze(k)}>${t}</button>`)}</div>
    ${dev ? devVorlage(p, { teil: 'meldungen' }) : html`${devVorlage(p, { teil: 'werkzeuge' })}${liste('Für Tests', html`<button class="zeile" @click=${() => p.testMeldung()}><span class="blau">Test-Nachricht senden</span></button><button class="zeile" @click=${() => p.einblenden('nachrichten')}><span>Beispiel-Nachrichten</span><span class="chev">›</span></button>`)}`}`;
}

/* Gruppen: Schlüssel, Symbol, Titel, Kurzwert, Inhalt */
function gruppen(p) {
  const d = p.d, e = d.e, M = p.meldungen(), P = d.bereiche.filter(b => b.pumpe), C = d.bereiche.filter(b => !b.pumpe), geraete = d.bereiche.reduce((a, b) => a + b.geraete.length, 0);
  const mAn = ['m_offline', 'm_trocken', 'm_dauer', 'm_zyklen', 'm_leistung', 'm_frost', 'm_selbst', 'm_kalt', 'm_fuehler', 'm_wetter', 'm_hand'].filter(k => e[k]).length;
  const offen = M === null ? '–' : M.filter(m => p.meldungOffen(m)).length, np = npGruppeVorlage(p);
  return [
    { k: 'baustelle', ic: '🏗', t: 'Baustelle', kurz: `${d.titel} · ${p.bsZeit(d)}`, inhalt: () => baustelle(p) },
    { k: 'heizung', ic: '🔥', t: 'Heizung', kurz: `Automatik ${e.auto ? 'an' : 'aus'} · Soll ${de(e.soll)} °C · Vorheizen ${e.vorheizen} min`, inhalt: () => heizung(p) },
    np,
    { k: 'container', ic: '🏠', t: 'Container & Geräte', kurz: `${C.length} Container · ${P.length} ${P.length === 1 ? 'Schacht' : 'Schächte'} · ${geraete} Geräte`, inhalt: () => container(p) },
    geraeteGruppeVorlage(p),   // BSM-034.05: Übersicht und 📦 Inventar in einer Gruppe
    { k: 'pumpen', ic: '💧', t: 'Pumpen', kurz: P.length ? `offline nach ${e.offline_min} min · Trockenlauf unter ${e.trocken_w} W` : 'keine Schächte', inhalt: () => pumpen(p) },
    { k: 'strom', ic: '⚡', t: 'Strom & Staffelung', kurz: `${de(e.preis, 2)} €/kWh · Staffelung ${e.staffel ? 'an' : 'aus'}`, inhalt: () => strom(p) },
    { k: 'firmen', ic: '🏢', t: 'Firmen', kurz: `${d.firmen.length} ${d.firmen.length === 1 ? 'Firma' : 'Firmen'} für die Abrechnung`, inhalt: () => firmen(p) },
    { k: 'meldungen', ic: '🔔', t: 'Meldungen', kurz: `${mAn} von 11 an${e.empfaenger ? ` · ${e.empfaenger}` : ''}`, inhalt: () => meldungen(p) },
    { k: 'bericht', ic: '📊', t: 'Bericht', kurz: { aus: 'aus', woche: 'jede Woche', monat: 'jeden Monat', beides: 'Woche und Monat' }[e.bericht] || e.bericht, inhalt: () => bericht(p) },
    { k: 'app', ic: '🖥', t: 'Ansicht', kurz: `Erklärungen ${e.erklaer ? 'an' : 'aus'} · Melden-Knopf ${e.melden ? 'an' : 'aus'}`, inhalt: () => ansicht(p) },
    { k: 'dev', ic: '🛠', t: 'Entwicklung', kurz: `${offen} offene Meldungen · Diagnose`, dev: true, inhalt: () => entwicklung(p) },
    { k: 'ueber', ic: 'ℹ', t: 'Über', kurz: `Version ${p.seiteVersion}`, inhalt: () => ueberVorlage(p, { mitZurueck: false }) },
  ];
}

export function einstellungenVorlage(p) {
  if (p.s.evGruppe === 'inventar') { p.s.evGruppe = 'geraete'; p.s.gerReiter = 'inventar'; }   // BSM-034.05: Inventar ist ein Reiter der Geräte
  const G = gruppen(p), g = G.find(x => x.k === p.s.evGruppe) || G[0], schmal = p.narrow, wahl = k => () => p.einstGruppeWahl(k);
  const nav = html`<nav class="ev-nav glas-panel">${G.map(x => html`${x.dev ? html`<div class="ev-trenn"></div>` : nothing}<button data-v=${x.k} class=${x === g ? 'on' : ''} @click=${wahl(x.k)}><span class="ev-ic">${x.ic}</span><span>${x.t}</span><small>${x.kurz}</small></button>`)}</nav>`;
  const chips = html`<div class="ev-chips">${G.map(x => html`<button class="glas-panel chip ${x === g ? 'amber' : ''}" data-v=${x.k} @click=${wahl(x.k)}>${x.ic} ${x.t}</button>`)}</div>`;
  return html`${kopfVorlage('Einstellungen', p.d.titel)}<div class=${schmal ? 'schmal' : ''}>${schmal ? chips : nothing}<div class="ev-sl">${schmal ? nothing : nav}
      <div class="ev-inhalt"><div class="ev-titel"><span class="ev-ic">${g.ic}</span><div><b>${g.t}</b><div class="leise">${g.kurz}</div></div></div>${g.inhalt()}</div></div></div>`;
}
