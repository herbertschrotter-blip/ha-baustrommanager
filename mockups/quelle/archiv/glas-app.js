/* Klickbarer Prototyp der Baustellen-Seite im Glas-Stil (Beispieldaten, keine Verbindung zu HA). */
function esc(s) { return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
const de = (x, d = 1) => Number(x).toLocaleString('de-AT', { minimumFractionDigits: d, maximumFractionDigits: d });
const FARBE = { bereit: '#8e8e93', heizt: '#ff9f0a', trocknen: '#ff9f0a', aus: '#8e8e93', frost: '#64d2ff', offline: '#ff453a', laeuft: '#0a84ff', pause: '#bf5af2' };
const TAGE = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];
const zufall = seed => () => (seed = (seed * 9301 + 49297) % 233280) / 233280;

const az = (ab, name, moDo, fr) => ({ ab, name, tage: { Mo: moDo, Di: moDo, Mi: moDo, Do: moDo, Fr: fr, Sa: null, So: null } });
const HEUTE = '2026-09-29', HEUTE_TAG = 'Di', JETZT = '16:20';
const VERSION = '0.7.0', VERSION_DATUM = '2026-10';
const ICON_MELDEN = '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" d="M4 5h16v11H9l-5 4z"/><path stroke="currentColor" stroke-width="1.8" stroke-linecap="round" d="M12 8v3.5M12 13.6v.2"/></svg>';
const WOCHE_ISO = ['2026-09-28', '2026-09-29', '2026-09-30', '2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04'];
const WOCHE = [['Mo', '28.09.'], ['Di', '29.09.'], ['Mi', '30.09.'], ['Do', '01.10.'], ['Fr', '02.10.'], ['Sa', '03.10.'], ['So', '04.10.']];
const WETTER_WOCHE = { Di: { regen: 6 }, Mi: { kalt: -1.2, regenVortag: 6 }, Fr: { regen: 5.5 } };   // aus der Vorhersage
const minu = t => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
const uhr = m => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
const datum = iso => iso.split('-').reverse().join('.');
const WIEDER = { einmal: 'einmalig', woche: 'jede Woche', '2wochen': 'alle 2 Wochen' };
const tageZwischen = (a, b) => Math.round((new Date(b + 'T12:00:00') - new Date(a + 'T12:00:00')) / 864e5);
/* Liegt ein (wiederkehrender) Termin auf diesem Tag? */
const terminAm = (t, iso) => { const d = tageZwischen(t.datum, iso); return t.wieder === 'einmal' ? d === 0 : d >= 0 && d % (t.wieder === '2wochen' ? 14 : 7) === 0; };
const naechsterTermin = (t, ab) => { for (let k = 0; k < 28; k++) { const d = new Date(ab + 'T12:00:00'); d.setDate(d.getDate() + k); const iso = d.toISOString().slice(0, 10); if (terminAm(t, iso)) return iso; } return null; };
/* neu 0.8 (aus 0.6.3 zurück, Herbert 30.09.2026) */
const NEU = '<span class="badge neu08">neu</span>';
const MODI = [['plan', 'Zeitplan'], ['thermo', 'Thermostat'], ['bedarf', 'Bei Bedarf'], ['hand', 'Hand'], ['aus', 'Aus']];
const MODUS_TEXT = { plan: 'an in der Heizzeit – der Thermostat am Heizkörper regelt', thermo: 'in der Heizzeit auf das Soll nach dem Fühler',
  bedarf: 'nur per Schalter oder Termin, sonst Frostschutz', hand: 'die Automatik schaltet nicht – Schalter unten', aus: 'alles aus, Frostschutz bleibt' };
const erkl = (an, text) => an ? `<div class="erkl">ⓘ ${text}</div>` : '';
const AUSNAHME = { arbeit: 'zusätzlich arbeiten', zeiten: 'andere Zeiten', frei: 'frei' };
const kurzDatum = iso => iso.split('-').reverse().slice(0, 2).join('.') + '.';
const wtag = iso => ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'][new Date(iso + 'T12:00:00').getDay()];
const dauer = (a, b) => { const m = minu(b) - minu(a); return `${Math.floor(m / 60)} h${m % 60 ? ' ' + String(m % 60).padStart(2, '0') : ''}`; };
function daten() {
  const r = zufall(7);
  const aussen = [...Array(25)].map((_, h) => 4.2 + 3.2 * Math.sin((h - 9) / 24 * 2 * Math.PI) + (r() - .5) * .6);
  const reihe = (n, a, b) => [...Array(n)].map(() => a + r() * (b - a));
  const bereich = (id, name, f, z, t, geraete, extra = {}) => ({ id, name, f, z, t, geraete, auto: true, trocknen: false,
    innen: aussen.map((a, h) => t === null ? null : Math.max(a + 2, (h >= 7 && h <= 17 ? t : h === 6 ? t - 3 : h === 18 ? t - 2 : t - 6) + (r() - .5))),
    kwh7: reihe(7, 6, 16).map((v, i) => i > 4 ? v * .15 : v), h7: reihe(7, 3, 7).map((v, i) => i > 4 ? 0 : v), ...extra });
  const g = (n, typ, kw, an) => ({ n, typ, kw, an, hand: false });
  // Anschluss je Container (welche Steckdose an welcher Phase hängt, ist auf der Baustelle nicht bekannt – daher keine Phasen)
  const ANSCHLUSS = { besprechung: 'sued', polier: 'nord', mannschaft: 'nord', sanitaer: 'nord', magazin: 'sued', lager: 'sued', schacht: 'sued' };
  const anschliessen = liste => { for (const b of liste) b.anschluss = ANSCHLUSS[b.id] || 'nord'; return liste; };
  return {
    aussen,
    baustellen: [
      { name: 'ÖWG Dobl Zwaring', aktiv: true, zeit: 'seit 08.09.2026', kwh: 412, eur: 115.4, container: 6, heiztage: 16, monate: .75, gespart: 1840,
        verlauf: { Sep: 412 }, namen: ['Poliercontainer', 'Mannschaft', 'Magazin', 'Sanitär', 'Lager Süd', 'Pumpenschacht Nord'] },
      { name: 'Reihenhäuser Kalsdorf', aktiv: true, zeit: 'seit 21.09.2026', kwh: 186, eur: 52.1, container: 3, heiztage: 7, monate: .3, gespart: 700,
        verlauf: { Sep: 186 }, namen: ['Polier Kalsdorf', 'Mannschaft Kalsdorf', 'Lager Kalsdorf'] },
      { name: 'Wohnanlage Lieboch', aktiv: false, zeit: '03.11.2025 – 17.04.2026', kwh: 3480, eur: 974.4, container: 5, heiztage: 118, monate: 5.5, gespart: 6120,
        verlauf: { Nov: 520, Dez: 760, Jän: 830, Feb: 690, Mär: 480, Apr: 200 }, namen: ['Polier', 'Mannschaft 1', 'Mannschaft 2', 'Sanitär', 'Magazin'] },
      { name: 'Volksschule Wundschuh', aktiv: false, zeit: '12.01.2025 – 28.03.2025', kwh: 1920, eur: 537.6, container: 3, heiztage: 55, monate: 2.5, gespart: 2990,
        verlauf: {}, namen: ['Polier', 'Mannschaft', 'Sanitär'] },
    ],
    // Stromanschlüsse (Baustromverteiler): Absicherung, Starkstrom ja/nein, Reserve für Ungemessenes (Kran, Werkzeug)
    // Termine für Container „nur bei Bedarf“ – aus dem lokalen HA-Kalender „Besprechungen“
    termine: [{ b: 'besprechung', datum: '2026-09-24', wieder: 'woche', von: '09:00', bis: '10:30', titel: 'Baubesprechung' }, { b: 'besprechung', datum: '2026-10-02', wieder: 'einmal', von: '13:00', bis: '14:00', titel: 'Abnahme Rohbau' }],
    // Meldungen aus dem Melden-Knopf (Entwicklermenü)
    meldungen: [
      { id: 'm1', art: 'wunsch', text: 'Eigene Kachel für Bautrockner mit Laufzeit, damit man sie der Firma verrechnen kann.', kontext: 'Übersicht', zeit: 'Mo 28.09. 17:02', version: '0.7.0', geraet: 'Handy', status: 'offen' },
      { id: 'm2', art: 'fehler', text: 'Nebel-Symbol war im Dunkelmodus kaum zu sehen.', kontext: 'Übersicht · Wetter', zeit: 'Mo 28.09. 20:15', version: '0.6.2', geraet: 'Desktop', status: 'erledigt' },
    ],
    anschluesse: [{ id: 'nord', name: 'Verteiler Nord (Kran)', ampere: 32, phasen: 3, reserve: 4 }, { id: 'sued', name: 'Verteiler Süd', ampere: 32, phasen: 3, reserve: 3 }],
    firmen: [{ id: 'eigen', name: 'Eigene Firma', eigen: true }, { id: 'huber', name: 'Elektro Huber GmbH' }, { id: 'leitner', name: 'Installateur Leitner' }],
    // zweite laufende Baustelle (nur für die Auswertung „Alle laufenden“)
    kalsdorf: [
      bereich('k-polier', 'Polier Kalsdorf', 6, 'heizt', 20.1, [g('Radiator', 'Ölradiator', 2.0, 1)], { firma: 'eigen', modus: 'thermo' }),
      bereich('k-mannschaft', 'Mannschaft Kalsdorf', 7, 'heizt', 18.9, [g('Radiator 1', 'Konvektor', 2.0, 1), g('Radiator 2', 'Konvektor', 2.0, 1)], { firma: 'eigen', modus: 'thermo' }),
      bereich('k-lager', 'Lager Kalsdorf', 8, 'aus', null, [g('Radiator', 'Ölradiator', 1.5, 0)], { firma: 'huber', modus: 'plan' }),
    ],
    bereiche: anschliessen([
      bereich('polier', 'Poliercontainer', 0, 'heizt', 19.4, [g('Radiator 1', 'Ölradiator', 2.0, 1), g('Radiator 2', 'Konvektor', 1.99, 1)], { trocknen: true, firma: 'eigen', modus: 'thermo', tuer: { sensor: 'Tür Polier', offen: 0 } }),
      bereich('mannschaft', 'Mannschaft', 1, 'trocknen', 17.8, [g('Radiator 1', 'Ölradiator', 2.0, 1), { ...g('Konvektor', 'Konvektor', 2.0, 0), warte: 6 }, g('Trockner', 'Steckdose', 1.79, 1)], { trocknen: true, firma: 'eigen', prio: 'hoch', modus: 'thermo' }),
      bereich('magazin', 'Magazin', 2, 'pause', null, [g('Radiator', 'Ölradiator', 1.5, 0), g('Steckdose', 'Steckdose', 0.4, 0)], { firma: 'huber', prio: 'niedrig', modus: 'plan', tuer: { sensor: 'Tür Magazin', offen: 6 } }),
      bereich('sanitaer', 'Sanitär', 3, 'frost', 4.2, [g('Frostwächter', 'Konvektor', 2.0, 1)], { firma: 'eigen', modus: 'aus', auto: true }),
      bereich('lager', 'Lager Süd', 4, 'offline', null, [g('Radiator', 'Ölradiator', 2.0, 0)], { offline: true, firma: 'leitner', modus: 'plan' }),
      bereich('besprechung', 'Besprechung', 3, 'bereit', 11.6, [g('Radiator', 'Ölradiator', 2.0, 0)], { firma: 'eigen', bedarf: true, bedarfBis: null, modus: 'bedarf' }),
      bereich('schacht', 'Pumpenschacht Nord', 5, 'laeuft', null, [g('Pumpe 1', 'Pumpe', 0.76, 1), g('Pumpe 2 (Reserve)', 'Pumpe', 0.76, 0)],
        { pumpe: true, firma: 'eigen', zyklen: 36, lauf: '1 h 12 min', laengster: '4 min', kwh7: reihe(7, 0.6, 1.4), h7: reihe(7, 0.8, 1.8), zyk7: reihe(7, 20, 44).map(Math.round) }),
    ]),
    // Arbeitszeiten mit Startdatum: es gilt die jüngste, die schon begonnen hat; alte bleiben gespeichert
    arbeitszeiten: [
      az('2025-11-03', 'Winter 2025/26', ['07:30', '16:30'], ['07:30', '12:00']),
      az('2026-03-30', 'Sommer 2026', ['06:30', '16:00'], ['06:30', '12:00']),
      az('2026-09-28', 'Herbst 2026', ['07:00', '16:30'], ['07:00', '12:30']),
      az('2026-11-02', 'Winter 2026/27', ['07:30', '16:30'], ['07:30', '12:00']),
    ],
    // Baustelle: Beginn/Ende und Heizperiode (Monate) – neu 0.8
    bs: { beginn: null, angelegt: '2026-09-08', ende: '2027-05-28', hp: [10, 4] },   // beginn leer = Tag der Anlage (AN-0002)
    e: { frost_aus: 7, urlaub: 'frost', absenk: 10, offline_min: 5, trocken_w: 30, erklaer: true, preis: 0.28, feiertag_frei: true, boost_min: 30, melden: true,
      staffel: true, nutzbar: 67, max_gleich: 5, min_lauf: 10, min_pause: 5, takt: 15,
      tuer_pause: 3, tuer_melden: 10, knoepfe: true,
      bericht: 'woche', bericht_handy: true, bericht_mail: true, mail: 'herbert@example.at', bericht_csv: true, vorheizen: 45, nachheizen: 15, soll: 20, grenze: 15, basis: 'Tageshöchstwert', fruehstart: true, frueh_temp: 0, frueh_min: 30, frost: true, frost_temp: 5,
      tr_mm: 2, tr_laenger: 45, tr_frueher: 15, empfaenger: 'Handy Herbert', m_offline: true, m_trocken: true, m_dauer: true, dauer_min: 20,
      m_leistung: true, m_kalt: true, kalt_min: 60, m_frost: true, m_fuehler: true, m_wetter: true, m_hand: true, hand_h: 8, m_zyklen: true, zyklen_h: 10 },
    feiertage: [['2026-10-26', 'Nationalfeiertag'], ['2026-11-01', 'Allerheiligen'], ['2026-12-08', 'Mariä Empfängnis'], ['2026-12-25', 'Christtag'],
      ['2026-12-26', 'Stefanitag'], ['2027-01-01', 'Neujahr'], ['2027-01-06', 'Heilige Drei Könige']],
    urlaube: [{ name: 'Weihnachten', von: '2026-12-23', bis: '2027-01-06' }],
    // Einmal-Ausnahmen von der Arbeitszeit (gelten genau für ein Datum)
    ausnahmen: [{ datum: '2026-09-30', art: 'zeiten', von: '07:00', bis: '18:00', notiz: 'Kranmontage – länger' }, { datum: '2026-10-03', art: 'arbeit', von: '07:00', bis: '12:00', notiz: 'Samstag betonieren' }],
    // offene Warnungen: stufe 'stoerung' (rot) oder 'hinweis' (gelb)
    warnungen: [
      { id: 'w1', stufe: 'stoerung', b: 'lager', titel: 'nicht erreichbar', seit: 'seit 10:42', hilfe: 'Shelly antwortet nicht. Stecker und Sicherung prüfen – bei Stromausfall meldet er sich von selbst zurück.' },
      { id: 'w2', stufe: 'stoerung', b: 'sanitaer', titel: 'Frostgefahr: 4,2 °C', seit: 'seit 05:40', hilfe: 'Unter der Frostgrenze (5 °C), obwohl der Frostschutz heizt. Tür offen? Heizkörper prüfen.' },
      { id: 'w3', stufe: 'hinweis', b: 'mannschaft', titel: 'zu kalt: 17,8 °C statt 20 °C', seit: 'seit 07:00', hilfe: 'Erreicht in der Arbeitszeit das Soll nicht. Tür oder Fenster offen? Heizkörper zu schwach?' },
      { id: 'w4', stufe: 'hinweis', b: 'magazin', titel: 'Steckdose seit 3 Tagen auf Hand', seit: 'seit Sa 26.09.', hilfe: 'Von Hand eingeschaltet und nicht zurückgestellt. Soll wieder die Automatik übernehmen?' },
      { id: 'w6', stufe: 'hinweis', b: 'magazin', titel: 'Tür seit 6 min offen – Heizung pausiert', seit: 'seit 16:14', hilfe: 'Heizt wieder, sobald die Tür zu ist. Nach 10 min kommt eine Nachricht aufs Handy.' },
      { id: 'w5', stufe: 'hinweis', b: 'schacht', titel: 'Pumpe schaltet oft: 14 Zyklen je Stunde', seit: 'seit 13:10', hilfe: 'Üblich sind hier 3–5. Schwimmer prüfen – oder das Grundwasser steigt.' },
    ],
    // Protokoll: dauerhaft bei der Baustelle gespeichert, zusätzlich im HA-Logbuch
    protokoll: [
      ['Heute', '16:30', 'schalten', 'mannschaft', 'Arbeitsende – Nachheizen 15 min, dann Kleidung trocknen 45 min'],
      ['Heute', '16:14', 'schalten', 'magazin', 'Tür offen – Heizung pausiert'],
      ['Heute', '16:08', 'schalten', 'mannschaft', 'Staffelung: Konvektor wartet, Radiator 1 heizt weiter (Rundlauf 15 min)'],
      ['Heute', '13:10', 'warnung', 'schacht', 'Pumpe schaltet oft: 14 Zyklen je Stunde'],
      ['Heute', '10:43', 'nachricht', null, 'An Handy Herbert: „Lager Süd nicht erreichbar – Stromausfall?“'],
      ['Heute', '10:42', 'warnung', 'lager', 'nicht erreichbar'],
      ['Heute', '07:40', 'warnung', 'mannschaft', 'zu kalt: 17,8 °C statt 20 °C'],
      ['Heute', '07:00', 'schalten', null, 'Arbeitsbeginn – Arbeitszeit „Herbst 2026“ 07:00–16:30'],
      ['Heute', '06:15', 'schalten', null, 'Vorheizen – alle Container ein'],
      ['Heute', '05:40', 'warnung', 'sanitaer', 'Frostgefahr: 4,2 °C trotz Frostschutz'],
      ['Heute', '05:00', 'wetter', null, 'Regen 6 mm seit gestern – heute Kleidung trocknen'],
      ['Gestern', '16:45', 'schalten', null, 'Nachheizen beendet – alle Container aus'],
      ['Gestern', '14:05', 'ok', 'lager', 'wieder erreichbar'],
      ['Gestern', '13:20', 'warnung', 'lager', 'nicht erreichbar'],
      ['Gestern', '07:00', 'schalten', null, 'Arbeitsbeginn 07:00'],
      ['Gestern', '06:15', 'schalten', null, 'Vorheizen – alle Container ein'],
      ['Gestern', '05:00', 'wetter', null, 'Heizgrenze nicht erreicht (Höchstwert 9 °C) – es wird geheizt'],
      ['Mo 28.09.', '18:02', 'einstellung', null, 'Neue Arbeitszeit „Herbst 2026“ gilt ab 28.09.2026'],
      ['Mo 28.09.', '09:30', 'schalten', 'magazin', 'Steckdose von Hand eingeschaltet'],
      ['Mo 28.09.', '06:15', 'schalten', null, 'Vorheizen – alle Container ein'],
      ['Sa 26.09.', '11:35', 'ok', 'schacht', 'Pumpe 1 wieder normal'],
      ['Sa 26.09.', '11:12', 'nachricht', null, 'An Handy Herbert: „Pumpenschacht Nord: Dauerlauf 25 min“'],
      ['Sa 26.09.', '11:10', 'warnung', 'schacht', 'Pumpe 1 Dauerlauf 25 min'],
    ],
  };
}

const AKTIV = z => ['heizt', 'trocknen', 'frost', 'laeuft'].includes(z);
const kwVon = b => b.geraete.reduce((s, g) => s + (g.an ? g.kw : 0), 0);
const wertHtml = b => b.pumpe ? `${b.zyklen}<small> Zyklen</small>` : b.t !== null ? `${de(b.t)}<small>°C</small>` : '–';
const illu = b => b.pumpe ? bcSchacht(b.z === 'laeuft') : bcContainer(BEREICH_FARBEN[b.f % BEREICH_FARBEN.length], b.z === 'pause' || b.z === 'bereit' ? 'aus' : b.z);
const TEXT = b => b.boost ? '⚡ schnell aufheizen' : ({ heizt: b.bedarf ? `heizt bis ${b.bedarfBis}` : b.t === null ? 'an · Thermostat regelt' : 'heizt · Arbeitszeit', trocknen: 'Kleidung trocknen', aus: 'aus bis 06:15', frost: 'Frostschutz', offline: 'nicht erreichbar', laeuft: 'Pumpe läuft', pause: 'pausiert · Tür offen', bereit: 'bei Bedarf · nur Frostschutz' })[b.z];
const knopf2 = (t, act, text) => `<button class="knopf leise-k" data-act="${act}" data-t="${text}">${t}</button>`;
// mdi:cog – dasselbe Zahnrad wie in Home Assistant (im Panel später <ha-icon icon="mdi:cog">)
const ICON_COG = '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path fill="currentColor" d="M12,15.5A3.5,3.5 0 0,1 8.5,12A3.5,3.5 0 0,1 12,8.5A3.5,3.5 0 0,1 15.5,12A3.5,3.5 0 0,1 12,15.5M19.43,12.97C19.47,12.65 19.5,12.33 19.5,12C19.5,11.67 19.47,11.34 19.43,11L21.54,9.37C21.73,9.22 21.78,8.95 21.66,8.73L19.66,5.27C19.54,5.05 19.27,4.96 19.05,5.05L16.56,6.05C16.04,5.66 15.5,5.32 14.87,5.07L14.5,2.42C14.46,2.18 14.25,2 14,2H10C9.75,2 9.54,2.18 9.5,2.42L9.13,5.07C8.5,5.32 7.96,5.66 7.44,6.05L4.95,5.05C4.73,4.96 4.46,5.05 4.34,5.27L2.34,8.73C2.21,8.95 2.27,9.22 2.46,9.37L4.57,11C4.53,11.34 4.5,11.67 4.5,12C4.5,12.33 4.53,12.65 4.57,12.97L2.46,14.63C2.27,14.78 2.21,15.05 2.34,15.27L4.34,18.73C4.46,18.95 4.73,19.03 4.95,18.95L7.44,17.94C7.96,18.34 8.5,18.68 9.13,18.93L9.5,21.58C9.54,21.82 9.75,22 10,22H14C14.25,22 14.46,21.82 14.5,21.58L14.87,18.93C15.5,18.67 16.04,18.34 16.56,17.94L19.05,18.95C19.27,19.03 19.54,18.95 19.66,18.73L21.66,15.27C21.78,15.05 21.73,14.78 21.54,14.63L19.43,12.97Z"/></svg>';
const schalter = (on, act, extra = '') => `<button class="sw ${on ? 'on' : ''}" data-act="${act}" ${extra} role="switch" aria-checked="${!!on}"><i></i></button>`;

/* ---------- Diagramme: dünne Marken, Haarraster, Hover-Anzeige ---------- */
function linie(id, reihen, einheit, vb = null) {
  // mit vb: Verbrauch als Fläche im selben Diagramm – links °C, rechts kWh (Herbert, 29.09.2026)
  const W = 320, H = 160, L = 28, R = vb ? 30 : 8, T = 16, U = 22;
  const alle = reihen.flatMap(s => s.v.filter(v => v !== null));
  const lo = Math.floor(Math.min(...alle) / 5) * 5, hi = Math.ceil(Math.max(...alle) / 5) * 5, n = (hi - lo) / 5;
  const x = i => L + i / 24 * (W - L - R), y = v => T + (1 - (v - lo) / (hi - lo)) * (H - T - U);
  const raster = [...Array(n + 1)].map((_, k) => lo + k * 5).map(v =>
    `<line x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}" class="gr"/><text x="${L - 5}" y="${y(v) + 3}" class="ax" text-anchor="end">${v}°</text>`).join('');
  const achse = [0, 6, 12, 18, 24].map(h => `<text x="${x(h)}" y="${H - 6}" class="ax" text-anchor="middle">${String(h).padStart(2, '0')}</text>`).join('');
  const pfade = reihen.map((s, k) => `<path d="${s.v.map((v, i) => v === null ? '' : `${i && s.v[i - 1] !== null ? 'L' : 'M'}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join('')}" fill="none" stroke="var(--s${k + 1})" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>`).join('');
  let flaeche = '', rechts = '', yv = null;
  if (vb) {
    // rechte Achse auf dieselben Rasterlinien legen: n Schritte, Schrittweite glatt gerundet
    const roh = Math.max(...vb) * 1.1 / n, schritt = [.1, .2, .25, .5, 1, 1.5, 2, 2.5, 5].find(st => st >= roh) || 10, vmax = schritt * n;
    yv = v => T + (1 - v / vmax) * (H - T - U);
    const wert = i => vb[Math.min(i, vb.length - 1)], k = reihen.length + 1;
    const d = [...Array(25)].map((_, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${yv(wert(i)).toFixed(1)}`).join('');
    flaeche = `<defs><linearGradient id="vbg-${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="var(--s${k})" stop-opacity=".42"/><stop offset="1" stop-color="var(--s${k})" stop-opacity=".06"/></linearGradient></defs>
      <path class="fl-flaeche" d="${d}L${x(24)} ${yv(0)}L${x(0)} ${yv(0)}z" fill="url(#vbg-${id})"/><path class="fl-linie" d="${d}" fill="none" stroke="var(--s${k})" stroke-width="1.5" stroke-linejoin="round" opacity=".8"/>`;
    rechts = [...Array(n + 1)].map((_, q) => q * schritt).map(v => `<text x="${W - R + 5}" y="${yv(v) + 3}" class="ax">${de(v, schritt < 1 ? (schritt < .25 ? 1 : 2) : 0)}</text>`).join('')
      + `<text x="${W - R + 5}" y="${T - 7}" class="ax ax-e">kWh</text>`;
  }
  const links = `<text x="${L - 5}" y="${T - 7}" class="ax ax-e" text-anchor="end">°C</text>`;
  CHARTS[id] = { art: 'linie', x0: L, x1: W - R, W, n: 25, reihen, einheit, y, vb, yv, unten: H - U };
  return `<svg class="chart" data-chart="${id}" viewBox="0 0 ${W} ${H}">${raster}${achse}${flaeche}${pfade}${vb ? links + rechts : ''}<g class="hover"></g></svg>
    <div class="legende">${reihen.map((s, k) => `<span><i style="background:var(--s${k + 1})"></i>${s.name} (°C, links)</span>`).join('')}${vb ? `<span><i style="background:var(--s${reihen.length + 1})"></i>Verbrauch (kWh je Stunde, rechts)</span>` : ''}</div>`;
}
function balken(id, werte, labels, einheit, d = 1) {
  const W = 320, H = 150, L = 28, R = 8, T = 10, U = 22, n = werte.length, hi = Math.max(...werte) * 1.15 || 1;
  const bw = (W - L - R) / n, y = v => T + (1 - v / hi) * (H - T - U), stufe = hi > 20 ? 10 : hi > 6 ? 2 : hi > 2 ? 1 : .5;
  const raster = [...Array(Math.floor(hi / stufe) + 1)].map((_, k) => k * stufe).map(v =>
    `<line x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}" class="gr"/><text x="${L - 5}" y="${y(v) + 3}" class="ax" text-anchor="end">${de(v, stufe < 1 ? 1 : 0)}</text>`).join('');
  const b = werte.map((v, i) => { const h = H - U - y(v), bx = L + i * bw + 1, w = bw - 2;
    return `<path d="M${bx} ${H - U}V${y(v) + Math.min(4, h)}q0 -4 4 -4h${w - 8}q4 0 4 4V${H - U}z" fill="var(--s1)" class="bar" data-i="${i}"/>
      <text x="${bx + w / 2}" y="${H - 6}" class="ax" text-anchor="middle">${labels[i]}</text>`; }).join('');
  CHARTS[id] = { art: 'balken', werte, labels, einheit, d };
  return `<svg class="chart" data-chart="${id}" viewBox="0 0 ${W} ${H}">${raster}${b}<rect class="treffer" x="0" y="0" width="0" height="0"/></svg>`;
}
const CHARTS = {};
function streu(id, pkt, k, d0) {
  const W = 320, H = 170, L = 30, R = 8, T = 10, U = 24;
  const tx = [-10, -5, 0, 5, 10, 15], ymax = Math.ceil(Math.max(...pkt.map(q => q[1])) / 50) * 50;
  const x = t => L + (t + 10) / 25 * (W - L - R), y = v => T + (1 - v / ymax) * (H - T - U);
  const raster = [...Array(ymax / 50 + 1)].map((_, q) => q * 50).map(v => `<line x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}" class="gr"/><text x="${L - 5}" y="${y(v) + 3}" class="ax" text-anchor="end">${v}</text>`).join('');
  const achse = tx.map(t => `<text x="${x(t)}" y="${H - 8}" class="ax" text-anchor="middle">${t}°</text>`).join('');
  const t1 = -8, t2 = Math.min(15, -d0 / k);
  const trend = `<line x1="${x(t1)}" y1="${y(k * t1 + d0)}" x2="${x(t2)}" y2="${y(Math.max(0, k * t2 + d0))}" stroke="var(--s2)" stroke-width="2" stroke-dasharray="5 4"/>`;
  const punkte = pkt.map((q, i) => `<circle class="punkt-s" data-i="${i}" cx="${x(q[0]).toFixed(1)}" cy="${y(q[1]).toFixed(1)}" r="4.5" fill="var(--s1)"/>`).join('');
  CHARTS[id] = { art: 'streu', pkt, x, y };
  return `<svg class="chart" data-chart="${id}" viewBox="0 0 ${W} ${H}">${raster}${achse}<text x="${W - R}" y="${H - 8}" class="ax" text-anchor="end" dx="0" opacity="0">.</text>${trend}${punkte}<g class="hover"></g></svg>
    <div class="legende"><span><i style="background:var(--s1)"></i>ein Heiztag</span><span><i style="background:var(--s2)"></i>Trend</span><span class="leise">x: Tagesmittel außen · y: kWh</span></div>`;
}
function flaeche(id, reihen, labels, einheit, jedes) {
  const W = 320, H = 160, L = 30, R = 8, T = 10, U = 22, n = labels.length, viele = reihen.length > 1;
  // gestapelt: jede Reihe liegt auf der Summe der darunterliegenden, die oberste Kante ist die Summe der Auswahl
  let unten = Array(n).fill(0);
  const lagen = reihen.map(r => { const u = unten, o = r.v.map((v, i) => u[i] + v); unten = o; return { ...r, u, o }; });
  const hi0 = Math.max(...unten) * 1.1 || 1;
  const stufe = [.5, 1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000].find(st => hi0 / st <= 5) || 10000, hi = Math.ceil(hi0 / stufe) * stufe;
  const x = i => L + i / (n - 1) * (W - L - R), y = v => T + (1 - v / hi) * (H - T - U);
  const raster = [...Array(hi / stufe + 1)].map((_, k) => k * stufe).map(v =>
    `<line x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}" class="gr"/><text x="${L - 5}" y="${y(v) + 3}" class="ax" text-anchor="end">${de(v, stufe < 1 ? 1 : 0)}</text>`).join('');
  const achse = labels.map((t, i) => i % jedes ? '' : `<text x="${x(i)}" y="${H - 6}" class="ax" text-anchor="middle">${t}</text>`).join('');
  const g = k => `fl-${id.replace(/[^a-z0-9]/gi, '')}-${k}`;
  const defs = lagen.map((r, k) => `<linearGradient id="${g(k)}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${r.farbe}" stop-opacity="${viele ? .75 : .45}"/><stop offset="1" stop-color="${r.farbe}" stop-opacity="${viele ? .45 : .03}"/></linearGradient>`).join('');
  const linie = a => a.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join('');
  const zurueck = a => a.map((v, i) => [i, v]).reverse().map(([i, v]) => `L${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join('');
  const flaechen = lagen.map((r, k) => `<path class="fl-flaeche" style="animation-delay:${k * 40}ms" d="${linie(r.o)}${zurueck(r.u)}z" fill="url(#${g(k)})"/>`).join('');
  const kanten = lagen.map(r => `<path class="fl-linie" d="${linie(r.o)}" fill="none" stroke="${viele ? 'var(--trenn)' : r.farbe}" stroke-width="${viele ? 1.5 : 2}" stroke-linejoin="round"/>`).join('');
  const oben = viele ? `<path d="${linie(unten)}" fill="none" stroke="var(--ink)" stroke-width="1.5" stroke-linejoin="round" opacity=".8"/>` : '';
  CHARTS[id] = { art: 'flaeche', x0: L, x1: W - R, W, n, reihen: lagen, labels, einheit, y };
  return `<svg class="chart" data-chart="${id}" viewBox="0 0 ${W} ${H}"><defs>${defs}</defs>${raster}${achse}${flaechen}${kanten}${oben}<g class="hover"></g></svg>
    ${viele ? `<div class="legende">${[...lagen].reverse().map(r => `<span><i style="background:${r.farbe}"></i>${esc(r.name)}</span>`).join('')}</div>` : ''}`;
}
const STUNDEN = [...Array(24)].map((_, h) => String(h).padStart(2, '0'));
/* Mehrere Temperaturlinien über Stunden oder Tage (neu 0.8): alle Container und außen in einem Diagramm */
function linien(id, reihen, labels, jedes, titel) {
  const W = 320, H = 170, L = 28, R = 8, T = 16, U = 22, n = labels.length;
  const alle = reihen.flatMap(s => s.v.filter(v => v !== null));
  const lo = Math.floor(Math.min(...alle) / 5) * 5, hi = Math.ceil(Math.max(...alle) / 5) * 5 || lo + 5;
  const x = i => L + i / (n - 1) * (W - L - R), y = v => T + (1 - (v - lo) / (hi - lo)) * (H - T - U);
  const raster = [...Array((hi - lo) / 5 + 1)].map((_, k) => lo + k * 5).map(v =>
    `<line x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}" class="gr"/><text x="${L - 5}" y="${y(v) + 3}" class="ax" text-anchor="end">${v}°</text>`).join('');
  const achse = labels.map((t, i) => i % jedes ? '' : `<text x="${x(i)}" y="${H - 6}" class="ax" text-anchor="middle">${t}</text>`).join('');
  const pfade = reihen.map(s => `<path d="${s.v.map((v, i) => v === null ? '' : `${i && s.v[i - 1] !== null ? 'L' : 'M'}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join('')}" fill="none" stroke="${s.farbe}" stroke-width="${s.aussen ? 1.5 : 2}" ${s.aussen ? 'stroke-dasharray="4 4"' : ''} stroke-linejoin="round" stroke-linecap="round"/>`).join('');
  CHARTS[id] = { art: 'linien', x0: L, x1: W - R, W, n, reihen, y, unten: H - U, titel };
  return `<svg class="chart" data-chart="${id}" viewBox="0 0 ${W} ${H}">${raster}${achse}${pfade}<text x="${L - 5}" y="${T - 7}" class="ax ax-e" text-anchor="end">°C</text><g class="hover"></g></svg>
    <div class="legende">${reihen.map(s => `<span><i style="background:${s.farbe}"></i>${esc(s.name)}</span>`).join('')}</div>`;
}
/* FE-0008: früheren Zeitraum wählen – Versatz 0 = aktuell, 1 = davor …; Grenze = Baustellenbeginn (im Mockup Okt 2025, damit man blättern kann) */
let ZR_VAR = '4';   // abgenommen: 4 · Pfeile + Kalender (Herbert 01.10.2026); 1–3 waren die Vorschläge
const ZR_GRENZE = '2025-10-01', MONATE_LANG = ['Jänner', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];
const isoPlus = (iso, n) => { const t = new Date(iso + 'T12:00:00Z'); t.setUTCDate(t.getUTCDate() + n); return t.toISOString().slice(0, 10); };
const tageAb = (a, b) => Math.round((Date.parse(b + 'T12:00:00Z') - Date.parse(a + 'T12:00:00Z')) / 864e5);
const kw = iso => { const t = new Date(iso + 'T12:00:00Z'), d = (t.getUTCDay() + 6) % 7; t.setUTCDate(t.getUTCDate() - d + 3); const j = new Date(Date.UTC(t.getUTCFullYear(), 0, 4)); return 1 + Math.round(((t - j) / 864e5 - 3 + ((j.getUTCDay() + 6) % 7)) / 7); };
function zrMax(z) {
  const [J, M] = [+HEUTE.slice(0, 4), +HEUTE.slice(5, 7)], [gJ, gM] = [+ZR_GRENZE.slice(0, 4), +ZR_GRENZE.slice(5, 7)];
  return { Tag: tageAb(ZR_GRENZE, HEUTE), Woche: Math.floor(tageAb(ZR_GRENZE, WOCHE_ISO[0]) / 7) + 1, Monat: (J - gJ) * 12 + M - gM, Jahr: J - gJ }[z];
}
function zrInfo(z, v) {
  if (z === 'Tag') { const t = isoPlus(HEUTE, -v); return { text: v === 0 ? 'Heute' : v === 1 ? 'Gestern' : `${wtag(t)} ${datum(t)}`, unter: v < 2 ? `${wtag(t)} ${datum(t)}` : '', kurz: `${wtag(t)} ${t.slice(8, 10)}.`, iso: t }; }
  if (z === 'Woche') { const mo = isoPlus(WOCHE_ISO[0], -7 * v), so = isoPlus(mo, 6);
    return { text: v === 0 ? 'Diese Woche' : v === 1 ? 'Vorwoche' : `KW ${kw(mo)}`, unter: `KW ${kw(mo)} · ${datum(mo).slice(0, 6)}–${datum(so)}`, kurz: `KW ${kw(mo)}`, iso: mo }; }
  if (z === 'Monat') { let m = +HEUTE.slice(5, 7) - 1 - v, j = +HEUTE.slice(0, 4); while (m < 0) { m += 12; j--; }
    return { text: `${MONATE_LANG[m]} ${j}`, unter: v === 0 ? 'aktueller Monat' : '', kurz: `${MONATE[m]}${m === 0 || v === 0 ? ` ${String(j).slice(2)}` : ''}`, iso: `${j}-${String(m + 1).padStart(2, '0')}-01` }; }
  const j = +HEUTE.slice(0, 4) - v; return { text: String(j), unter: v === 0 ? 'aktuelles Jahr' : '', kurz: String(j), iso: `${j}-01-01` };
}
/* Versatz zu einem Datum im Kalender (FE-0008, Variante 4) */
function zrVersatz(z, iso) {
  const J = +HEUTE.slice(0, 4), M = +HEUTE.slice(5, 7), j = +iso.slice(0, 4), m = +iso.slice(5, 7);
  if (z === 'Tag') return tageAb(iso, HEUTE);
  if (z === 'Woche') { const t = new Date(iso + 'T12:00:00Z'), mo = isoPlus(iso, -((t.getUTCDay() + 6) % 7)); return tageAb(mo, WOCHE_ISO[0]) / 7; }
  if (z === 'Monat') return (J - j) * 12 + M - m;
  return J - j;
}
const zrFaktor = (z, v) => v ? .55 + .45 * Math.abs(Math.sin(v * 1.7 + z.length)) : 1;   // Mockup: andere Werte für frühere Zeiträume
const MONATE = ['Jän', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'];
/* Verbrauch in kWh je Stunde (Tag), je Tag (Monat) oder je Monat (Jahr); Baustelle = Summe der Container */
function verbrauch(bereiche, cid, zeitraum) {
  const eins = (b, k) => { const r = zufall(k * 97 + b.f * 13 + 5), p = b.geraete.reduce((s, g) => s + g.kw, 0) * (b.pumpe ? .25 : 1);
    if (zeitraum === 'Tag') return [...Array(24)].map((_, h) => { const heiz = h >= 6 && h < (b.trocknen ? 18 : 17);   // Vorheizen, Arbeitszeit, Nachheizen (+ Trocknen)
      return b.z === 'frost' ? p * (.3 + r() * .2) : b.offline && h > 10 ? 0 : heiz ? p * (.65 + r() * .3) : p * r() * .06; });
    if (zeitraum === 'Woche') return TAGE.map((_, d) => d > 4 ? p * r() * .5 : p * (4.2 + r() * 1.8));
    if (zeitraum === 'Monat') return [...Array(30)].map((_, d) => { const we = [5, 6].includes((d + 1) % 7); return we ? p * r() * .6 : p * (4.2 + r() * 1.8); });
    return MONATE.map((_, m) => { const saison = [1, .95, .8, .45, .08, 0, 0, 0, .8, 1, 1.05, .95][m]; return p * 135 * saison * (.9 + r() * .2); });
  };
  const k = { Tag: 1, Monat: 2, Jahr: 3, Woche: 4 }[zeitraum];
  const liste = cid ? bereiche.filter(b => b.id === cid) : bereiche; // cid null = Summe der Baustelle
  return liste.map(b => eins(b, k)).reduce((a, w) => a.map((v, i) => v + w[i]));
}

/* ---------- Stimmung: Hintergrund nach Tageszeit (sun.sun) und Wetter (weather.*) ---------- */
/* Symbole für runde Knöpfe als SVG – Schriftzeichen (−, +, ⏻) sitzen je nach Schrift außermittig */
const IC_MINUS = '<svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 12h12" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/></svg>';
const IC_PLUS = '<svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 12h12M12 6v12" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/></svg>';
const IC_POWER = '<svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4v7" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/><path d="M7.3 7.2a7 7 0 1 0 9.4 0" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/></svg>';   // WU-0004: Container-Ansicht bisher / a / b / c (Vorführ-Leiste)
/* WU-0005 Variante 6: alle Bausteine [Name, Beschreibung] und der Vorschlag [Schlüssel, an, breit] */
const AW_BAUSTEINE = {
  betrag: ['Kosten groß', 'Betrag des Zeitraums, Vergleich, Gespart, Hochrechnung (aus 2)'], kennzahlen: ['Kennzahlen', 'kWh, Kosten, Heizzeit, gespart mit Vergleich (aus 3)'],
  rangliste: ['Wer verbraucht was', 'Rangliste der Container (aus 3)'], verlauf: ['Verbrauchsdiagramm', 'gestapelt nach Container, Baustelle oder Firma (aus 4)'],
  erkenntnisse: ['Was fällt auf', 'Erkenntnis-Karten (aus 3/4)'], rechnung: ['Aufteilung je Firma', 'Rechnungszeilen mit CSV und Bericht (aus 2)'],
  'k-kosten': ['Kachel Kosten', 'kurz (aus 1)'], 'k-gespart': ['Kachel Gespart', 'kurz (aus 1)'], 'k-hoch': ['Kachel Hochrechnung', 'kurz (aus 1)'],
  'k-wer': ['Kachel Wer verbraucht', 'Top 4 als Balken (aus 1)'], 'k-firmen': ['Kachel Firmen', 'Betrag je Firma (aus 1)'], 'k-wetter': ['Kachel Wetter', 'kWh je Grad kälter (aus 1)'],
  'k-oel': ['Kachel Ölradiator', 'Vergleich kurz (aus 1)'], 'k-temp': ['Kachel Temperaturen', 'jetzt je Container (aus 1)'],
  abrechnung: ['Abrechnung nach Firma', 'ganzer Block'], geraete: ['Je Gerät', 'Tabelle je Gerät'], temperaturen: ['Temperaturen', 'Diagramm heute/7/30 Tage'],
  wetter: ['Wetter-Einfluss', 'Streudiagramm'], ohne: ['Ohne Automatik', 'Vergleich mit Dauerbetrieb'], hochrechnung: ['Hochrechnung Heizperiode', 'ganzer Block'],
  vergleich: ['Ölradiator oder Konvektor', 'Tabelle'], leistung: ['Leistung heute', 'Diagramm heute'], links: ['Weitere Auswertungen', 'Liste zum Antippen (aus 4)'],
};
/* Vorlagen = die Varianten 1–5 als Bausteine [Schlüssel, Breite, Höhe] (Herbert 30.09.2026: „v1–4 als Vorlagen bei Anpassen“) */
const AW_VORLAGEN = {
  kacheln: ['1 · Kacheln', [['k-kosten', 2, 2], ['k-gespart', 1, 2], ['k-hoch', 1, 2], ['verlauf', 4, 4], ['k-wer', 2, 2], ['k-firmen', 2, 2], ['k-wetter', 1, 2], ['k-oel', 1, 2], ['k-temp', 2, 2]]],
  kosten: ['2 · Kosten im Fokus', [['betrag', 4, 2], ['rechnung', 4, 4], ['verlauf', 4, 4], ['links', 4, 3]]],
  wer: ['3 · Wer verbraucht was', [['kennzahlen', 4, 1], ['rangliste', 4, 4], ['erkenntnisse', 4, 2]]],
  verlauf: ['4 · Verlauf mit Erkenntnissen', [['verlauf', 4, 4], ['erkenntnisse', 4, 2], ['kennzahlen', 4, 1], ['links', 4, 3]]],
  misch: ['5 · Mischform (Vorschlag)', [['betrag', 4, 2], ['rangliste', 4, 4], ['verlauf', 4, 4], ['erkenntnisse', 4, 2], ['k-wetter', 2, 2], ['k-oel', 2, 2], ['links', 4, 3]]],
};
/* FE-0006: Größenstufen je Baustein [Name, Breite, Höhe] – nur Größen, die zum Inhalt passen */
const ST_KACHEL = [['S', 1, 1], ['M', 2, 1], ['L', 2, 2]];
const AW_STUFEN = {
  betrag: [['M', 2, 2], ['L', 4, 2]], kennzahlen: [['M', 2, 2], ['L', 4, 1]], rangliste: [['M', 2, 3], ['L', 4, 3], ['XL', 4, 4]],
  verlauf: [['S', 2, 2], ['M', 2, 3], ['L', 4, 3], ['XL', 4, 4]], erkenntnisse: [['M', 2, 2], ['L', 4, 2]], rechnung: [['M', 2, 4], ['L', 4, 4]],
  abrechnung: [['M', 2, 4], ['L', 4, 4]], links: [['M', 2, 3], ['L', 4, 3]], geraete: [['L', 4, 4]], temperaturen: [['M', 2, 3], ['L', 4, 3]],
  wetter: [['S', 1, 1], ['M', 2, 3], ['L', 4, 3]], ohne: [['M', 2, 2], ['L', 4, 2]], hochrechnung: [['M', 2, 3], ['L', 4, 2]], vergleich: [['M', 2, 3], ['L', 4, 3]],
  leistung: [['M', 2, 3], ['L', 4, 3]],
};
const awStufen = k => AW_STUFEN[k] || ST_KACHEL;
/* nächstliegende erlaubte Stufe zu einer gewünschten Größe */
const awStufe = (k, w, h) => awStufen(k).reduce((best, st) => { const dd = Math.abs(st[1] - w) * 2 + Math.abs(st[2] - h); return dd < best[0] ? [dd, st] : best; }, [1e9, null])[1];
const AW_HOEHE = { betrag: 2, kennzahlen: 1, rangliste: 4, verlauf: 4, erkenntnisse: 2, rechnung: 4, links: 3, abrechnung: 4, geraete: 4, temperaturen: 4, wetter: 4, ohne: 2, hochrechnung: 3, vergleich: 3, leistung: 3 };
const AW_STANDARD = [['betrag', true, true], ['rangliste', true, true], ['verlauf', true, true], ['erkenntnisse', true, true], ['k-wetter', true, false], ['k-oel', true, false],
  ['rechnung', false, true], ['kennzahlen', false, true], ['k-kosten', false, false], ['k-gespart', false, false], ['k-hoch', false, false], ['k-wer', false, false], ['k-firmen', false, false], ['k-temp', false, false],
  ['abrechnung', false, true], ['geraete', false, true], ['temperaturen', false, true], ['wetter', false, true], ['ohne', false, true], ['hochrechnung', false, true], ['vergleich', false, true], ['leistung', false, true], ['links', true, true]];   // WU-0005: Auswertung bisher / 1–4 (Vorführ-Leiste)
const STIMMUNG = { phase: 'tag', wetter: 'klar', zeit: Date.now() };
/* Vorführung: sun.sun für Datum und Uhrzeit nachgebildet (Mitteleuropa, etwa 47° N / 15° O) – im Panel kommt es aus HA */
function vorfuehrSonne(ms) {
  const rad = Math.PI / 180, breite = 47 * rad, d = new Date(ms);
  const tag = n => { const t0 = Date.UTC(d.getFullYear(), d.getMonth(), d.getDate() + n), nr = (t0 - Date.UTC(d.getFullYear(), 0, 0)) / 864e5;
    const dekl = 23.44 * rad * Math.sin(2 * Math.PI * (nr - 81) / 365), mittag = t0 + 11 * 36e5;   // Sonnenmittag bei 15° O ≈ 11:00 UTC
    const halb = Math.acos(-Math.tan(breite) * Math.tan(dekl)) / Math.PI * 12 * 36e5;
    return { dekl, mittag, auf: mittag - halb, ab: mittag + halb }; };
  const h = tag(0), m = tag(1), w = (ms - h.mittag) / 36e5 * 15 * rad;
  const hoehe = Math.asin(Math.sin(breite) * Math.sin(h.dekl) + Math.cos(breite) * Math.cos(h.dekl) * Math.cos(w)) / rad;
  const iso = x => new Date(x).toISOString();
  return { state: hoehe > -.83 ? 'above_horizon' : 'below_horizon', attributes: { elevation: +hoehe.toFixed(2), rising: ms < h.mittag,
    next_rising: iso(ms < h.auf ? h.auf : m.auf), next_setting: iso(ms < h.ab ? h.ab : m.ab) } };
}
/* Tageszeit aus sun.sun wie im Panel: Nacht unter −6°, Morgen/Abend bis 12° über dem Horizont */
function phaseAusSonne(sonne) {
  const a = sonne.attributes, hoehe = a.elevation;
  return hoehe < -6 ? 'nacht' : hoehe < 12 ? (a.rising === false ? 'abend' : 'morgen') : 'tag';
}
STIMMUNG.phase = phaseAusSonne(vorfuehrSonne(STIMMUNG.zeit));
const WETTER_ANZEIGE = { klar: ['sunny', 'Sonnig'], wolkig: ['cloudy', 'Bewölkt'], regen: ['rainy', 'Regen · 6 mm'], nebel: ['fog', 'Nebel'],
  schnee: ['snowy', 'Schnee · 2 cm'], gewitter: ['lightning-rainy', 'Gewitter · 9 mm'] };
const wetterJetzt = () => { const [w, t] = WETTER_ANZEIGE[STIMMUNG.wetter]; return [w === 'sunny' && STIMMUNG.phase === 'nacht' ? 'clear-night' : w, w === 'sunny' && STIMMUNG.phase === 'nacht' ? 'Klar' : t]; };
function partikel(phase, wetter) {
  const r = zufall(42), z = (a, b) => (a + r() * (b - a)).toFixed(2);
  const tropfen = n => [...Array(n)].map(() => `<i class="tropfen" style="left:${z(-10, 130)}%;--l:${z(12, 26)}px;--d:${z(.55, 1)}s;--v:-${z(0, 2)}s;opacity:${z(.35, .9)}"></i>`).join('');
  const teile = [];
  if (wetter === 'regen') teile.push(tropfen(70));
  if (wetter === 'gewitter') teile.push(tropfen(120), '<i class="blitzlicht"></i>');
  if (wetter === 'schnee') teile.push([...Array(60)].map(() => `<i class="flocke" style="left:${z(-5, 105)}%;--d:${z(7, 14)}s;--v:-${z(0, 14)}s"><b style="--s:${z(2, 5)}px;--w:${z(2, 4)}s"></b></i>`).join(''));
  if (wetter === 'nebel') teile.push([...Array(4)].map((_, k) => `<i class="schwade" style="top:${10 + k * 22}%;--d:${24 + k * 7}s;--v:-${k * 6}s"></i>`).join(''));
  if (wetter === 'wolkig' || wetter === 'regen' || wetter === 'gewitter') teile.push([...Array(3)].map((_, k) => `<i class="wolke" style="top:${z(-5, 45)}%;--d:${z(50, 80)}s;--v:-${z(0, 60)}s"></i>`).join(''));
  if (wetter === 'klar' && phase === 'nacht') teile.push([...Array(45)].map(() => `<i class="stern" style="left:${z(0, 100)}%;top:${z(0, 60)}%;--v:-${z(0, 4)}s;--s:${z(1, 2.4)}px"></i>`).join(''));
  if (wetter === 'klar' && phase !== 'nacht') teile.push('<i class="strahlen"></i>');
  return teile.join('');
}
const APPS = [];

/* ---------- App ---------- */
class App {
  constructor(root) {
    this.root = root; APPS.push(this);
    root.innerHTML = `<div class="glas-bg"><i class="k1"></i><i class="k2"></i><i class="k3"></i><div class="dunst"></div><div class="partikel"></div></div><div class="ui"></div>`;
    this.bg = root.querySelector('.glas-bg'); this.ui = root.querySelector('.ui');
    this.himmel = Himmel.an(this.bg);          // WebGL-Himmel; ohne WebGL bleibt der CSS-Hintergrund
    this.d = daten();
    this.s = { view: 'uebersicht', cid: null, auto: true, sheet: null, chart: 'temp', zeitraum: 'Woche', verlauf: 'aktiv' };
    root.addEventListener('click', e => this.klick(e));
    root.addEventListener('input', e => this.eingabe(e));
    root.addEventListener('pointermove', e => this.hover(e));
    root.addEventListener('pointerdown', e => this.zugStart(e));   // WU-0005: Layout-Modus der Auswertung
    root.addEventListener('pointerleave', () => this.tip(null));
    this.stimmung(false);
    this.render();
  }
  stimmung(neuZeichnen = true) {
    const { phase, wetter } = STIMMUNG;
    if (this.bg.dataset.phase !== phase || this.bg.dataset.wetter !== wetter) this.bg.querySelector('.partikel').innerHTML = partikel(phase, wetter);
    this.bg.dataset.phase = phase; this.bg.dataset.wetter = wetter;
    const sonne = vorfuehrSonne(STIMMUNG.zeit), lauf = himmelLauf(sonne, STIMMUNG.zeit);
    this.himmel?.setze(phase, wetter, document.body.classList.contains('hell'), sonne, lauf);
    this.bg.style.setProperty('--sonne-x', (lauf.uSonnePos[0] * 100).toFixed(1) + '%'); this.bg.style.setProperty('--sonne-y', (lauf.uSonnePos[1] * 100).toFixed(1) + '%');
    if (neuZeichnen) this.render();
  }
  /* Beginn leer = Tag der Anlage; Ende leer = offen, beim Abschließen gilt der Tag des Abschließens (AN-0002) */
  bsZeit() { const b = this.d.bs; return `${datum(b.beginn || b.angelegt)}${b.beginn ? '' : ' (angelegt)'} – ${b.ende ? datum(b.ende) : 'offen'}`; }
  get azListe() { return [...this.d.arbeitszeiten].sort((a, b) => a.ab.localeCompare(b.ab)); }
  get azJetzt() { return this.azListe.filter(a => a.ab <= HEUTE).at(-1); }
  /* Heizplan eines Tages aus Arbeitszeit, Vorheizen, Kälte-Frühstart und Kleidung trocknen */
  planTag(tag, trocknen = true) {
    const iso = WOCHE_ISO[TAGE.indexOf(tag)], aus = this.d.ausnahmen.find(x => x.datum === iso);
    const zeit = aus ? (aus.art === 'frei' ? null : [aus.von, aus.bis]) : this.azJetzt.tage[tag], e = this.d.e, w = WETTER_WOCHE[tag] || {};
    if (!zeit) return null;
    const [a, b] = zeit.map(minu), gruende = aus ? [`Ausnahme: ${aus.notiz || AUSNAHME[aus.art]}`] : [];
    let extra = 0;
    if (e.fruehstart && w.kalt !== undefined && w.kalt < e.frueh_temp) { extra += e.frueh_min; gruende.push(`Frühstart ${de(w.kalt).replace('-', '−')} °C`); }
    if (trocknen && w.regenVortag >= e.tr_mm) { extra += e.tr_frueher; gruende.push(`früher nach Regen`); }
    const tr = trocknen && w.regen >= e.tr_mm ? e.tr_laenger : 0;
    if (tr) gruende.push(`Kleidung trocknen, ${de(w.regen, w.regen % 1 ? 1 : 0)} mm Regen`);
    return { vor: a - e.vorheizen, extra: a - e.vorheizen - extra, a, b, nach: b + e.nachheizen, ende: b + e.nachheizen + tr, gruende, ausnahme: aus };
  }
  statusText() {
    if (!this.s.auto) return 'Handbetrieb – nichts wird geschaltet';
    if (this.d.jetztBis) return `♨ alle heizen bis ${this.d.jetztBis}`;
    const p = this.planTag(HEUTE_TAG), j = minu(JETZT);
    if (p && j >= p.extra && j < p.ende) return `♨ heizt bis ${uhr(p.ende)}`;
    if (p && j < p.extra) return `Start um ${uhr(p.extra)}`;
    const i = WOCHE.findIndex(w => w[0] === HEUTE_TAG);
    for (let k = 1; k < 8; k++) { const t = WOCHE[(i + k) % 7][0], q = this.planTag(t); if (q) return `aus · ${k === 1 ? 'morgen' : t} ab ${uhr(q.extra)}`; }
    return 'aus';
  }
  zeitstrahl(p, jetzt = false) {
    const A = 4 * 60, B = 20 * 60, x = m => Math.max(0, Math.min(100, (m - A) / (B - A) * 100));
    const seg = (von, bis, k) => bis > von ? `<i class="${k}" style="left:${x(von)}%;width:${x(bis) - x(von)}%"></i>` : '';
    const inhalt = p ? seg(p.extra, p.vor, 'tl-extra') + seg(p.vor, p.a, 'tl-vor') + seg(p.a, p.b, 'tl-heiz') + seg(p.b, p.nach, 'tl-vor') + seg(p.nach, p.ende, 'tl-trock') : '';
    return `<div class="tl-spur">${inhalt}${jetzt ? `<i class="tl-jetzt" style="left:${x(minu(JETZT))}%"></i>` : ''}</div>`;
  }
  bName(id) { return id ? (this.d.bereiche.find(b => b.id === id) || { name: id }).name : 'Baustelle'; }
  /* Staffelung: gemessene Last, Grenze und freier Platz (nur Heizungen werden geschaltet) */
  last() {
    const heizt = x => ['Ölradiator', 'Konvektor'].includes(x.g.typ), summe = l => l.reduce((a, x) => a + x.g.kw, 0);
    const alleG = this.d.bereiche.flatMap(b => b.geraete.map(g => ({ b, g }))), an = alleG.filter(x => x.g.an && !x.b.offline);
    // Phasenverteilung unbekannt → vorsichtig nur einen Teil der Anschlussleistung nutzen (Einstellung „nutzbar“)
    const A = this.d.anschluesse.map(a => {
      const q = an.filter(x => x.b.anschluss === a.id), voll = a.ampere * 230 / 1000 * a.phasen, grenze = voll * this.d.e.nutzbar / 100;
      const heiz = summe(q.filter(heizt)), pumpe = summe(q.filter(x => x.g.typ === 'Pumpe')), sonst = summe(q.filter(x => !heizt(x) && x.g.typ !== 'Pumpe'));
      return { ...a, voll, grenze, heiz, pumpe, sonst, frei: grenze - a.reserve - heiz - pumpe - sonst };
    });
    const s3 = k => A.reduce((x, a) => x + a[k], 0), hk = alleG.filter(heizt);
    return { A, heiz: s3('heiz'), pumpe: s3('pumpe'), sonst: s3('sonst'), grenze: s3('grenze'), reserve: this.d.anschluesse.reduce((x, a) => x + a.reserve, 0),
      gesamt: s3('heiz') + s3('pumpe') + s3('sonst'), hk, laufen: hk.filter(x => x.g.an && !x.b.offline).length, warten: hk.filter(x => x.g.warte).length };
  }
  stromBalken(L, klein) {
    const w = v => `${Math.max(0, v / L.grenze * 100)}%`;
    return `<div class="strom ${klein ? 'klein' : ''}"><div class="strom-spur"><i class="s-heiz" style="width:${w(L.heiz)}"></i><i class="s-pumpe" style="width:${w(L.pumpe)}"></i><i class="s-sonst" style="width:${w(L.sonst)}"></i>
      <i class="s-res" style="width:${w(L.reserve)}"></i></div></div>`;
  }
  bedarfBlock(b) {
    const T = this.d.termine.filter(t => t.b === b.id).map(t => ({ t, n: naechsterTermin(t, HEUTE) })).sort((x, y) => (x.n || '9').localeCompare(y.n || '9'));
    const vor = m => uhr(minu(m) - this.d.e.vorheizen);
    return `<div class="glas-panel block"><div class="block-kopf"><b>Nur bei Bedarf</b><span class="leise">heizt nicht nach der Arbeitszeit · sonst nur Frostschutz</span></div>
      ${b.bedarfBis ? `<div class="bedarf-an"><b>♨ heizt bis ${b.bedarfBis}${b.boost ? ' · ⚡ schnell' : ''}</b><button class="chip glas-panel" data-act="bedarf-aus" data-id="${b.id}">Beenden</button></div>`
        : `<div class="bedarf-dauer">${[['60', '1 h'], ['120', '2 h'], ['ende', 'bis Arbeitsende']].map(([v, t]) => `<button class="chip glas-panel" data-act="bedarf-an" data-id="${b.id}" data-v="${v}">▶ ${t}</button>`).join('')}</div>`}
      <div class="gruppe-t">Termine · Kalender „Besprechungen“</div>
      ${T.length ? T.map(({ t, n }) => `<div class="zeile ereignis"><span class="zeit t-wann">${t.wieder === 'einmal' ? `${wtag(t.datum)} ${kurzDatum(t.datum)}` : t.wieder === 'woche' ? `jeden ${wtag(t.datum)}` : `jeden 2. ${wtag(t.datum)}`}</span>
          <div><b>${t.von}–${t.bis}</b> ${esc(t.titel)}${t.wieder !== 'einmal' ? ` <span class="badge">${WIEDER[t.wieder]}</span>` : ''}<div class="leise">${n && t.wieder !== 'einmal' ? `nächster ${wtag(n)} ${kurzDatum(n)} · ` : ''}heizt ab ${vor(t.von)}${t.boost ? ' · ⚡ schnell' : ''}</div></div>
          <button class="x" data-act="termin-weg" data-i="${this.d.termine.indexOf(t)}" title="Termin löschen">✕</button></div>`).join('') : '<div class="leise">Keine Termine</div>'}
      <button class="zeile" data-act="sheet" data-s="termin" data-id="${b.id}"><span class="blau">+ Termin eintragen</span></button></div>`;
  }
  /* Heizzeiten eines Containers an einem Tag der Woche: Segmente [von, bis, art] in Minuten */
  heizzeiten(b, t) {
    if (b.pumpe) return [];
    const iso = WOCHE_ISO[TAGE.indexOf(t)], e = this.d.e;
    if (b.bedarf) {
      const seg = this.d.termine.filter(x => x.b === b.id && terminAm(x, iso)).flatMap(x => [[minu(x.von) - e.vorheizen, minu(x.von), 'vor'], [minu(x.von), minu(x.bis), 'termin']]);
      if (t === HEUTE_TAG && b.bedarfBis) seg.push([minu(JETZT), minu(b.bedarfBis), 'termin']);
      return seg;
    }
    if (!b.auto || b.modus === 'hand' || b.modus === 'aus') return [];
    const p = this.planTag(t, b.trocknen); if (!p) return [];
    return [[p.extra, p.vor, 'extra'], [p.vor, p.a, 'vor'], [p.a, p.b, 'heiz'], [p.b, p.nach, 'vor'], [p.nach, p.ende, 'trock']].filter(x => x[1] > x[0]);
  }
  /* Wann ein Heizkörper wirklich Strom zieht (Leistung über 50 W) – im Mockup aus Plan und typischem Takten nachgebildet,
     im Panel aus dem Verlauf der Leistungssensoren (history). Für die Zukunft gibt es nur den Plan. */
  aktiv(b, g, t) {
    const heizer = ['Ölradiator', 'Konvektor'].includes(g.typ); if (!heizer) return { an: [], off: [] };
    const tagNr = TAGE.indexOf(t), heuteNr = TAGE.indexOf(HEUTE_TAG); if (tagNr > heuteNr) return { an: [], off: [] };
    const ende = tagNr === heuteNr ? minu(JETZT) : 24 * 60, r = zufall(b.f * 131 + b.geraete.indexOf(g) * 17 + tagNr * 7 + 3), oel = g.typ === 'Ölradiator';
    let plan = this.heizzeiten(b, t).map(q => [q[0], q[1]]).sort((p1, p2) => p1[0] - p2[0]);
    if (b.z === 'frost' && !plan.length) plan = [[0, 24 * 60]];
    const an = [], off = [];
    const offline = b.offline && tagNr === heuteNr ? minu('10:42') : b.offline && tagNr < heuteNr ? 13 * 60 + 20 : null;
    for (const [von, bis] of plan) {
      let m = von, voll = von + 50;                         // erst durchheizen, dann taktet der Thermostat
      while (m < Math.min(bis, ende)) {
        const lauf = m < voll ? voll - m : oel ? 16 + r() * 20 : 7 + r() * 9, pause = oel ? 5 + r() * 9 : 6 + r() * 8;
        an.push([m, Math.min(m + lauf, bis, ende)]); m += lauf + (m < voll ? 0 : pause);
      }
    }
    // Pausen: Staffelung (wartet), Tür offen, offline
    const schneide = (von, bis) => { for (const q of an) { if (q[0] < bis && q[1] > von) { if (q[0] >= von) q[0] = Math.min(q[1], bis); else q[1] = Math.max(q[0], von); } } };
    if (g.warte && tagNr === heuteNr) { for (let m = 13 * 60 + 30; m < ende; m += 30) schneide(m, m + 15); schneide(16 * 60 + 8, ende); }
    if (b.z === 'pause' && tagNr === heuteNr) schneide(16 * 60 + 14, ende);
    if (offline !== null) { schneide(offline, ende); off.push([offline, ende]); }
    return { an: an.filter(q => q[1] - q[0] > 1), off };
  }
  uebersichtHeizzeiten() {
    const art = this.s.hzArt || 'tag', tag = this.s.hzTag || HEUTE_TAG, C = this.d.bereiche.filter(b => !b.pumpe);
    const A = 4 * 60, B = 21 * 60, x = m => Math.max(0, Math.min(100, (m - A) / (B - A) * 100)), breite = (a, b) => Math.max(0, x(b) - x(a));
    const std = segs => segs.reduce((a, q) => a + (q[1] - q[0]), 0) / 60;
    const HZ = b => b.geraete.filter(g => ['Ölradiator', 'Konvektor'].includes(g.typ));
    const ohne = b => `<div class="hz-c"><span class="hz-cn">${esc(b.name)}</span><span class="leise hz-cp">noch kein Heizkörper</span></div>
      <div class="hz-ohne"><button class="chip glas-panel" data-act="container" data-id="${b.id}">+ Heizkörper zuordnen</button></div>`;   // FE-0007: Container ohne Heizkörper trotzdem zeigen
    const tagNr = TAGE.indexOf(tag), heuteNr = TAGE.indexOf(HEUTE_TAG), jetzt = minu(JETZT);
    let inhalt;
    if (art === 'tag') {
      const zukunft = tagNr > heuteNr, heute = tagNr === heuteNr;
      inhalt = `<div class="vb-wer">${WOCHE.map(([t, d]) => `<button data-act="hz-tag" data-v="${t}" class="${t === tag ? 'on' : ''}">${t === HEUTE_TAG ? 'heute' : t} ${d.slice(0, 2)}.</button>`).join('')}</div>
        <div class="leise">${zukunft ? 'Noch nichts gemessen – blass der Plan.' : heute ? 'Bis jetzt gemessen, danach blass der Plan.' : 'Gemessen an der Leistung: kräftig = zieht Strom (über 50 W).'}</div>
        <div class="hz-tag">${C.map(b => { if (!HZ(b).length) return ohne(b); const plan = this.heizzeiten(b, tag), ph = std(plan);
          return `<div class="hz-c"><span class="hz-cn">${esc(b.name)}${b.bedarf ? ' <span class="leise">bei Bedarf</span>' : ''}${b.offline ? ' <span class="rot-t">offline</span>' : ''}</span><span class="leise hz-cp">${ph ? `${de(ph)} h geplant` : b.bedarf ? 'kein Termin' : b.modus === 'aus' ? 'aus' : !b.auto || b.modus === 'hand' ? 'Hand' : 'frei'}</span></div>
            ${HZ(b).map(g => { const a = this.aktiv(b, g, tag), ah = std(a.an), mess = heute ? Math.min(jetzt, 24 * 60) : 24 * 60;
              return `<div class="hz-zeile"><span class="hz-n hz-g">${esc(g.n)}</span>
                <div class="tl-spur hz">${plan.map(q => `<i class="hz-plan ${!zukunft && (!heute || q[1] <= jetzt) ? 'vorbei' : ''}" style="left:${x(q[0])}%;width:${breite(q[0], q[1])}%"></i>`).join('')}
                  ${zukunft ? '' : a.an.map(q => `<i class="hz-an" style="left:${x(q[0])}%;width:${breite(q[0], q[1])}%"></i>`).join('')}
                  ${a.off.map(q => `<i class="hz-off" style="left:${x(q[0])}%;width:${breite(q[0], q[1])}%"></i>`).join('')}
                  ${heute ? `<i class="tl-jetzt" style="left:${x(jetzt)}%"></i>` : ''}</div>
                <span class="hz-h">${zukunft ? '–' : `${de(ah)} h`}</span></div>`; }).join('')}`; }).join('')}
          <div class="hz-zeile achse"><span></span><div class="tl-achse">${['04', '08', '12', '16', '20'].map(h => `<span>${h}</span>`).join('')}</div><span></span></div></div>
        <div class="hp-legende"><span><i class="hz-an"></i>zieht Strom</span><span><i class="hz-plan"></i>geplant</span><span><i class="hz-off"></i>offline</span><span class="leise">Lücken im Plan: Thermostat, Staffelung, Tür offen</span></div>`;
    } else {
      const zeilen = C.flatMap(b => HZ(b).length ? HZ(b).map(g => ({ b, g, h: TAGE.map((t, k) => k > heuteNr ? std(this.heizzeiten(b, t)) : std(this.aktiv(b, g, t).an)) })) : [{ b, g: null, h: null }]);
      const max = Math.max(...zeilen.flatMap(z => z.h || []), 1);
      inhalt = `<div class="hz-woche"><div class="hz-wk"><span></span>${WOCHE.map(([t, d]) => `<span class="${t === HEUTE_TAG ? 'heute' : ''}">${t}<br><small>${d.slice(0, 2)}.</small></span>`).join('')}<span>Σ</span></div>
        ${zeilen.map(({ b, g, h }) => !g ? `<div class="hz-wz"><span class="hz-n">${esc(b.name)}</span><button class="hz-wz-ohne leise" data-act="container" data-id="${b.id}">noch kein Heizkörper · zuordnen</button></div>` : `<div class="hz-wz"><span class="hz-n">${esc(b.name)} <span class="leise">· ${esc(g.n)}</span></span>${h.map((v, k) => `<button class="hz-zelle ${k > heuteNr ? 'geplant' : ''}" data-act="hz-tag" data-v="${TAGE[k]}" data-art="tag" style="--a:${v ? .15 + .75 * v / max : 0}" title="${esc(b.name)} · ${esc(g.n)} ${TAGE[k]}: ${de(v)} h ${k > heuteNr ? 'geplant' : 'gemessen'}">${v ? de(v, v % 1 ? 1 : 0) : ''}</button>`).join('')}<b class="hz-sum">${de(h.slice(0, heuteNr + 1).reduce((a, v) => a + v, 0), 0)} h</b></div>`).join('')}</div>
        <div class="leise">Stunden, in denen der Heizkörper Strom gezogen hat (heute bis jetzt); kommende Tage blass und kursiv = geplant. Σ = bisher gemessen. Tippen zeigt den Tag.</div>`;
    }
    return `<div class="glas-panel block"><div class="block-kopf"><b>Wann welche Heizung heizt</b><div class="seg klein">${[['tag', 'Tag'], ['woche', 'Woche']].map(([k, t]) => `<button data-act="hz-art" data-v="${k}" class="${art === k ? 'on' : ''}">${t}</button>`).join('')}</div></div>${inhalt}</div>`;
  }
  anschluss(id) { return this.d.anschluesse.find(a => a.id === id) || this.d.anschluesse[0]; }
  laufende() { return [{ id: 'dobl', name: 'ÖWG Dobl Zwaring', bereiche: this.d.bereiche }, { id: 'kalsdorf', name: 'Reihenhäuser Kalsdorf', bereiche: this.d.kalsdorf }]; }
  firma(id) { return this.d.firmen.find(f => f.id === id) || this.d.firmen[0]; }
  /* Was im Verbrauch gestapelt wird: Container dieser Baustelle, laufende Baustellen oder Firmen */
  quellen(st, ziel) {
    const alle = ziel === 'aw' && this.s.awScope === 'alle', lauf = alle ? this.laufende() : [this.laufende()[0]];
    const summe = arr => arr.reduce((a, w) => a.map((v, i) => v + w[i]));
    if (st.gruppe === 'firma') return this.d.firmen.map((f, k) => ({ f, k, teile: lauf.flatMap(l => l.bereiche.filter(b => (b.firma || 'eigen') === f.id).map(b => [l, b])) }))
      .filter(x => x.teile.length).map(({ f, k, teile }) => ({ id: f.id, name: f.name, farbe: `var(--s${k + 1})`, v: z => summe(teile.map(([l, b]) => verbrauch(l.bereiche, b.id, z))) }));
    if (alle) return lauf.map((l, k) => ({ id: l.id, name: l.name, farbe: `var(--s${k + 1})`, v: z => verbrauch(l.bereiche, null, z) }));
    return this.d.bereiche.map(b => ({ id: b.id, name: b.name, farbe: BEREICH_FARBEN[b.f % BEREICH_FARBEN.length], v: z => { const f = ziel === 'aw' ? zrFaktor(z, st.v || 0) : 1; return verbrauch(this.d.bereiche, b.id, z).map(x => x * f); } }));
  }
  verbrauchInhalt(st, ziel, kennzahlen) {
    const Q = this.quellen(st, ziel), z = st.zeitraum, aus = Q.filter(q => st.auswahl.includes(q.id)), alleGewaehlt = aus.length === Q.length;
    const alle = ziel === 'aw' && this.s.awScope === 'alle', summenName = alle ? 'Alle laufenden' : 'ÖWG Dobl Zwaring';
    const reihen = aus.length ? aus.map(q => ({ name: q.name, v: q.v(z), farbe: q.farbe })) : [{ name: 'Summe', v: Q.map(q => q.v(z)).reduce((a, w) => a.map((v, i) => v + w[i])), farbe: 'var(--s1)' }];
    const labels = z === 'Tag' ? [...Array(24)].map((_, h) => String(h).padStart(2, '0')) : z === 'Woche' ? TAGE : z === 'Monat' ? [...Array(30)].map((_, d) => `${d + 1}.`) : MONATE;
    const summeJe = labels.map((_, i) => reihen.reduce((a, r) => a + r.v[i], 0)), summe = summeJe.reduce((a, v) => a + v, 0);
    const spitze = Math.max(...summeJe), wo = labels[summeJe.indexOf(spitze)];
    const einheit = z === 'Tag' ? 'kWh/h' : 'kWh', je = { Tag: 'je Stunde · heute', Woche: 'je Tag · diese Woche', Monat: 'je Tag · September', Jahr: 'je Monat · 2026' }[z];
    const was = st.gruppe === 'firma' ? 'Firmen' : alle ? 'Baustellen' : 'Container';
    const titel = !aus.length ? `${summenName} · Summe` : aus.length === 1 ? esc(aus[0].name) : `${aus.length} ${was} gestapelt`;
    const zd = `data-ziel="${ziel}"`;
    return `<div class="block-kopf">${ziel === 'sheet' ? '<h3>Verbrauch</h3>' : '<b>Verbrauch</b>'}<span class="leise">${titel}</span></div>
      <div class="seg">${['Tag', 'Woche', 'Monat', 'Jahr'].map(v => `<button data-act="vb-zeitraum" ${zd} data-v="${v}" class="${v === z ? 'on' : ''}">${v}</button>`).join('')}</div>
      <div class="vb-gruppe"><span class="leise">stapeln nach</span><div class="seg klein">${[['teil', alle ? 'Baustelle' : 'Container'], ['firma', 'Firma']].map(([k, t]) => `<button data-act="vb-gruppe" ${zd} data-v="${k}" class="${(st.gruppe || 'teil') === k ? 'on' : ''}">${t}</button>`).join('')}</div></div>
      <div class="vb-wer"><button data-act="vb-wer" ${zd} class="${!aus.length ? 'on' : ''}"><i style="background:var(--s1)"></i>Summe</button>
        <button data-act="vb-wer" ${zd} data-id="*" class="${alleGewaehlt ? 'on' : ''}">Alle gestapelt</button>
        ${Q.map(q => `<button data-act="vb-wer" ${zd} data-id="${q.id}" class="${st.auswahl.includes(q.id) ? 'on' : ''}"><i style="background:${q.farbe}"></i>${esc(q.name)}${st.auswahl.includes(q.id) ? ' ✓' : ''}</button>`).join('')}</div>
      ${kennzahlen ? `<div class="kennz"><div><b>${de(summe, summe < 100 ? 1 : 0)}</b><span>kWh ${{ Tag: 'heute', Woche: 'diese Woche', Monat: 'im Monat', Jahr: 'im Jahr' }[z]}${reihen.length > 1 ? ' zusammen' : ''}</span></div>
        <div><b>${de(summe * this.d.e.preis, 2)} €</b><span>Kosten</span></div><div><b>${wo}</b><span>Spitze ${de(spitze, 1)} kWh</span></div></div>` : ''}
      <div class="leise">${einheit} ${je}${aus.length > 1 ? ' · gestapelt, oberste Kante = Summe' : ''}</div>
      <div class="chart-wrap">${flaeche(`vb-${ziel}-${this.s.awScope || ''}-${st.gruppe || ''}-${aus.map(q => q.id).join('_') || 'alle'}-${z}`, reihen, labels, einheit, z === 'Tag' ? 6 : z === 'Monat' ? 7 : z === 'Woche' ? 1 : 3)}</div>
      ${reihen.length > 1 ? `<div class="vb-je">${reihen.map(r => { const su = r.v.reduce((a, v) => a + v, 0), sp = Math.max(...r.v);
          return `<div><i style="background:${r.farbe}"></i><span class="n">${esc(r.name)}</span><b>${de(su, su < 100 ? 1 : 0)} kWh</b><span>${de(su * this.d.e.preis, 2)} €</span><span class="leise">Spitze ${labels[r.v.indexOf(sp)]}</span></div>`; }).join('')}</div>` : ''}`;
  }
  /* Abrechnung: je Firma die Container mit kWh und Kosten im gewählten Zeitraum */
  abrechnung(z) {
    const lauf = this.s.awScope === 'alle' ? this.laufende() : [this.laufende()[0]], p = this.d.e.preis;
    const zeilen = this.d.firmen.map(f => ({ f, c: lauf.flatMap(l => l.bereiche.filter(b => (b.firma || 'eigen') === f.id).map(b => ({ l, b, kwh: verbrauch(l.bereiche, b.id, z).reduce((a, v) => a + v, 0) }))) }))
      .filter(x => x.c.length).map(x => ({ ...x, kwh: x.c.reduce((a, c) => a + c.kwh, 0) }));
    const ges = zeilen.reduce((a, x) => a + x.kwh, 0);
    return `<div class="glas-panel block"><div class="block-kopf"><b>Abrechnung nach Firma</b><span class="leise">${{ Tag: 'heute', Woche: 'diese Woche', Monat: 'September 2026', Jahr: '2026' }[z]} · ${de(p, 2)} € je kWh</span></div>
      ${zeilen.map(({ f, c, kwh }) => `<div class="ab-firma ${f.eigen ? 'eigen' : ''}"><div class="ab-kopf"><b>${esc(f.name)}</b><span><b>${de(kwh * p, 2)} €</b> <span class="leise">${de(kwh, 0)} kWh · ${de(kwh / ges * 100, 0)} %</span></span></div>
        ${c.map(x => `<div class="ab-c"><span>${esc(x.b.name)}${lauf.length > 1 ? ` <span class="leise">· ${esc(x.l.name)}</span>` : ''}</span><span class="leise">${de(x.kwh, 0)} kWh · ${de(x.kwh * p, 2)} €</span></div>`).join('')}</div>`).join('')}
      <button class="knopf" data-act="csv" data-art="firma">⇩ Abrechnung als CSV</button></div>`;
  }
  heizplanInhalt() {
    return `<div class="hp-legende"><span><i class="tl-extra"></i>Frühstart</span><span><i class="tl-vor"></i>Vor- und Nachheizen ${this.d.e.vorheizen}/${this.d.e.nachheizen} min</span><span><i class="tl-heiz"></i>Arbeitszeit</span><span><i class="tl-trock"></i>Kleidung trocknen</span></div>
      <div class="hp">${WOCHE.map(([t, d]) => { const p = this.planTag(t), h = t === HEUTE_TAG;
        return `<div class="hp-zeile ${h ? 'heute' : ''} ${this.d.ausnahmen.some(x => x.datum === WOCHE_ISO[TAGE.indexOf(t)]) ? 'ausn' : ''}"><div class="hp-tag"><b>${h ? 'heute' : t}</b><span>${d}</span></div>
          <div class="hp-mitte">${this.zeitstrahl(p, h)}<div class="leise">${p ? p.gruende.join(' · ') : (() => { const a = this.d.ausnahmen.find(x => x.datum === WOCHE_ISO[TAGE.indexOf(t)]); return a ? `Ausnahme: frei${a.notiz ? ' – ' + esc(a.notiz) : ''} · nur Frostschutz` : 'frei · nur Frostschutz'; })()}</div></div>
          <div class="hp-zeit">${p ? `${uhr(p.extra)}<br>${uhr(p.ende)}` : '–'}</div></div>`; }).join('')}
        <div class="hp-zeile achse"><div></div><div class="tl-achse">${['04', '08', '12', '16', '20'].map(h => `<span>${h}</span>`).join('')}</div><div></div></div></div>`;
  }
  get b() { return this.d.bereiche.find(x => x.id === this.s.cid); }
  gehe(view, cid = null) { this.s.view = view; this.s.cid = cid; this.s.sheet = null; this.render(true); }
  csv(art) {
    // Export (Semikolon, deutsches Komma – öffnet direkt in Excel). art 'firma': Abrechnung je Firma und Container
    const z = (this.s.aw || { zeitraum: 'Monat' }).zeitraum, p = this.d.e.preis, lauf = this.s.awScope === 'alle' ? this.laufende() : [this.laufende()[0]];
    const labels = z === 'Tag' ? [...Array(24)].map((_, h) => `${String(h).padStart(2, '0')}:00`) : z === 'Woche' ? WOCHE.map(w => `${w[0]} ${w[1]}`) : z === 'Monat' ? [...Array(30)].map((_, d) => `${String(d + 1).padStart(2, '0')}.09.2026`) : MONATE.map(m => `${m} 2026`);
    const zeilen = [], zahl = (v, d) => v.toFixed(d).replace('.', ',');   // ohne Tausendertrennung, damit Excel es als Zahl liest
    if (art === 'firma') {
      zeilen.push(['Zeitraum', 'Firma', 'Baustelle', 'Container', 'kWh', 'Preis €/kWh', 'Betrag €'].join(';'));
      for (const f of this.d.firmen) for (const l of lauf) for (const b of l.bereiche.filter(b => (b.firma || 'eigen') === f.id)) {
        const k = verbrauch(l.bereiche, b.id, z).reduce((a, v) => a + v, 0); zeilen.push([z, f.name, l.name, b.name, zahl(k, 2), zahl(p, 2), zahl(k * p, 2)].join(';')); }
    } else {
      zeilen.push(['Zeit', 'Baustelle', 'Firma', 'Container', 'kWh', 'Kosten €'].join(';'));
      for (const l of lauf) for (const b of l.bereiche) verbrauch(l.bereiche, b.id, z).forEach((v, i) => zeilen.push([labels[i], l.name, this.firma(b.firma).name, b.name, zahl(v, 3), zahl(v * p, 2)].join(';')));
    }
    const name = `baustelle-${art === 'firma' ? 'abrechnung' : 'verbrauch'}-${lauf.length > 1 ? 'alle' : 'oewg-dobl-zwaring'}-${z.toLowerCase()}.csv`;
    if (typeof Blob !== 'undefined' && typeof URL !== 'undefined' && URL.createObjectURL && typeof document.createElement === 'function') {
      const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob(['﻿' + zeilen.join('\r\n')], { type: 'text/csv;charset=utf-8' })); a.download = name; a.click();
    }
    this.toast(`${name} · ${zeilen.length - 1} Zeilen`);
    return zeilen;
  }
  neuerContainer(name, p, firma) {
    const d = this.d;
    d.bereiche.push({ id: 'n' + d.bereiche.length + Date.now().toString(36), name, f: d.bereiche.length, z: 'aus', t: null, auto: true, trocknen: false, pumpe: p, firma, zyklen: 0, lauf: '0 min', laengster: '–',
      innen: [], kwh7: Array(7).fill(0), h7: Array(7).fill(0), zyk7: Array(7).fill(0), geraete: [{ n: p ? 'Pumpe 1' : 'Heizung 03', typ: p ? 'Pumpe' : 'Ölradiator', kw: p ? .76 : 2, an: 0, hand: false }] });
  }
  meldungenMarkdown() {
    const ART = { fehler: 'Fehler', wunsch: 'Wunsch', anregung: 'Anregung' };
    return this.d.meldungen.map(m => `- [${m.status === 'erledigt' ? 'x' : ' '}] **${ART[m.art]}** (${m.zeit}, v${m.version}, ${m.geraet}, ${m.kontext}): ${m.text}`).join('\n');
  }
  toast(t) { const el = this.root.querySelector('.toast'); el.textContent = t; el.classList.remove('an'); void el.offsetWidth; el.classList.add('an'); }

  render(neu = false) {
    const scroll = this.root.querySelector('.scroll'), pos = scroll && !neu ? scroll.scrollTop : 0;
    // Reiter Pumpen nur, wenn die Baustelle Pumpenschächte hat (neu 0.8)
    const tabs = [['uebersicht', 'Übersicht'], ['heizung', 'Heizung'], ...(this.d.bereiche.some(b => b.pumpe) ? [['pumpen', 'Pumpen']] : []), ['auswertung', 'Auswertung'], ['verlauf', 'Verlauf'], ['einst', '⚙']];
    const aktivTab = this.s.view === 'container' ? 'uebersicht' : this.s.view === 'bsdetail' ? 'verlauf' : ['ueber', 'dev'].includes(this.s.view) ? 'einst' : this.s.view;
    this.ui.innerHTML = `<div class="scroll"><div class="seite ${neu ? 'rein' : ''}">${this['v_' + this.s.view]()}</div></div>
      <nav class="glas-nav glas-panel ${tabs.length > 5 ? 'sechs' : ''}">${tabs.map(([k, t]) => `<button data-act="tab" data-v="${k}" class="${k === aktivTab ? 'on' : ''} ${k === 'einst' ? 'nav-ic' : ''}" ${k === 'einst' ? 'aria-label="Einstellungen" title="Einstellungen"' : ''}>${k === 'einst' ? ICON_COG : t}</button>`).join('')}</nav>
      <div class="schleier ${this.s.sheet ? 'an' : ''}" data-act="zu"></div>
      <div class="sheet glas-panel ${this.s.sheet ? 'an' : ''}">${this.s.sheet ? this.sheet() : ''}</div>
      <div class="tip"></div><div class="toast glas-panel"></div>
      ${this.d.e.melden && this.s.sheet?.art !== 'melden' ? `<button class="melden-knopf glas-panel ${this.s.sheet ? 'ueber-sheet' : ''}" data-act="melden" title="Fehler, Wunsch oder Anregung melden" aria-label="Melden">${ICON_MELDEN}</button>` : ''}`;
    this.root.querySelector('.scroll').scrollTop = pos;
  }

  kopf(titel, klein, rechts = '') {
    return `<div class="glas-kopf glas-panel"><div><div class="glas-klein">${klein}</div><div class="glas-titel">${titel}</div></div>${rechts}</div>`;
  }

  /* ---- Übersicht ---- */
  v_uebersicht() {
    const B = this.d.bereiche, kw = B.reduce((s, b) => s + kwVon(b), 0), W = this.d.warnungen.filter(w => !w.stumm);
    const st = W.filter(w => w.stufe === 'stoerung').length, hi = W.length - st;
    const an = B.flatMap(b => b.geraete).filter(g => g.an).length, alle = B.flatMap(b => b.geraete).length;
    return `<div class="glas-kopf glas-panel">
        <div><div class="klickbar" data-act="sheet" data-s="baustellen"><div class="glas-klein">BAUSTELLE</div><div class="glas-titel">ÖWG Dobl Zwaring <span class="pfeil">▾</span></div>
        ${this.d.e.staffel ? (() => { const L = this.last(); return `<button class="strom-knopf" data-act="sheet" data-s="strom">${this.stromBalken(L, true)}<span class="strom-t"><b>${de(L.gesamt)} kW</b> · ${L.A.length} Anschlüsse · ${L.laufen} Heizkörper an${L.warten ? ` · ${L.warten} wartet` : ''} ›</span></button>`; })() : ''}</div>
          <button class="kopf-wetter" data-act="sheet" data-s="wetter">${wetterIcon(wetterJetzt()[0], 22)}<span>${STIMMUNG.wetter === 'schnee' ? '−2,1°' : STIMMUNG.phase === 'nacht' ? '1,8°' : '4,2°'}</span><span class="kw-t">${wetterJetzt()[1]}</span></button></div>
        <button class="glas-kw kw-knopf" data-act="sheet" data-s="verbrauch" title="Verbrauch anzeigen"><span class="blitz ${kw ? 'an' : ''}">⚡</span>${de(kw)}<small> kW</small><span class="kw-pfeil">›</span></button></div>
      <div class="glas-chips">
        <button class="glas-panel chip auto-chip ${this.s.auto ? 'on' : ''}" data-act="auto" role="switch" aria-checked="${this.s.auto}" title="Automatik ${this.s.auto ? 'ausschalten' : 'einschalten'}"><span class="mini-sw"><i></i></span>Automatik</button>
        <button class="chip-status ${this.s.auto ? 'amber' : ''}" data-act="sheet" data-s="heizplan" title="Heizplan anzeigen">${this.statusText()} <span class="pfeil">›</span></button>
        ${W.length ? `<button class="glas-panel chip warn-chip ${st ? 'rot' : 'gelb'}" data-act="sheet" data-s="warnungen">⚠ ${W.length === 1 ? `${esc(this.bName(W[0].b))}: ${esc(W[0].titel)}`
          : [st ? `${st} ${st === 1 ? 'Störung' : 'Störungen'}` : '', hi ? `${hi} ${hi === 1 ? 'Hinweis' : 'Hinweise'}` : ''].filter(Boolean).join(' · ')}</button>` : ''}
        <span class="chip-leise">${an} von ${alle} Geräten an</span>
      </div>
      <div class="glas-raster">${B.map((b, i) => `<div class="glas-panel glas-k ${b.z}" role="button" tabindex="0" data-act="container" data-id="${b.id}" style="animation-delay:${i * 60}ms;--c:${FARBE[b.z]}">
        <div class="glas-illu">${illu(b)}</div>
        <div class="glas-name">${esc(b.name)}</div>${this.firma(b.firma).eigen ? '' : `<div class="firma-tag">${esc(this.firma(b.firma).name)}</div>`}${b.tuer?.offen ? `<div class="tuer-tag">🚪 offen ${b.tuer.offen} min</div>` : ''}
        <div class="glas-zeile"><span class="glas-wert">${wertHtml(b)}</span><span class="glas-kwk">${de(kwVon(b))} kW</span></div>
        <div class="glas-status"><span class="glas-dot"></span>${TEXT(b)}</div>
        <div class="glas-geraete">${b.geraete.map(g => `<i class="${g.an ? 'an' : ''}"></i>`).join('')}<span>${b.geraete.length} ${b.pumpe ? 'Pumpen' : 'Geräte'}</span></div>
        ${b.bedarf ? `<button class="bedarf-knopf ${b.bedarfBis ? 'an' : ''}" data-act="${b.bedarfBis ? 'bedarf-aus' : 'bedarf-auf'}" data-id="${b.id}">${b.bedarfBis ? `■ bis ${b.bedarfBis}` : '▶ jetzt heizen'}</button>` : ''}</div>`).join('')}
        <button class="glas-panel glas-k neu" data-act="sheet" data-s="container-neu"><span>+</span>Container</button></div>`;
  }

  /* ---- Container ---- */
  /* Lernende Regelung (neu 0.8): Beispielwerte für den Prototyp – echt kommen sie von der Integration */
  lernStand(b) {
    const r = zufall([...String(b.id)].reduce((x, c) => x + c.charCodeAt(0), 11)), n = 37 + Math.round(r() * 20);
    const nachlauf = (oel, kalt) => [['kurz', '< 15 min'], ['mittel', '15–45 min'], ['lang', '> 45 min']].map(([k, t], i) => ({ k, t,
      grad: oel ? [.3, .8, 1.4][i] * (kalt ? .85 : 1.1) : [.05, .1, .15][i], min: oel ? [8, 15, 24][i] : [3, 4, 5][i], zyklen: oel ? [9, 14, 6][i] : [4, 3, 0][i] }));
    return { zyklen: n, kint: { wert: .52, start: .6, fort: Math.min(1, n / 50) }, kext: { wert: .014, start: .01, fort: Math.min(1, (n - 12) / 50) },
      anteil: 38, erwartet: .8, nachlauf, treffer: [.3, .1, -.2, .2, 0].map(x => x + (r() - .5) * .1) };
  }

  v_container() {
    if (!this.b.pumpe) return this.v_container_d();   // WU-0004: D mit Thermostat-Rad (abgenommen 30.09.2026)
    const b = this.b, tl = this.zeitleiste(b);
    const tabs = b.pumpe ? [['pumpzeit', 'Pumpzeit'], ['zyklen', 'Zyklen'], ['verbrauch', 'Verbrauch']] : [['temp', 'Temperatur'], ['leistung', 'Leistung'], ['verbrauch', 'Verbrauch'], ['heizzeit', 'Heizzeit']];
    if (!tabs.some(t => t[0] === this.s.chart)) this.s.chart = tabs[0][0];
    const c = this.s.chart, tage = TAGE, mitVb = this.s.tempVb !== false;
    const chart = c === 'temp' ? (b.t === null ? '<div class="leer">Kein Temperaturfühler zugeordnet · <button class="link" data-act="tab" data-v="einst">zuordnen</button></div>'
        : linie(`t-${b.id}-${mitVb ? 'vb' : ''}`, [{ name: 'Innen', v: b.innen }, { name: 'Außen', v: this.d.aussen }], '°C', mitVb ? verbrauch(this.d.bereiche, b.id, 'Tag') : null))
      : c === 'leistung' ? flaeche('kw-' + b.id, [{ name: b.name, farbe: BEREICH_FARBEN[b.f % BEREICH_FARBEN.length], v: verbrauch(this.d.bereiche, b.id, 'Tag') }], STUNDEN, 'kW', 6)
        + `<div class="leise">Leistung heute in kW, Stundenmittel ${NEU}</div>`
      : c === 'verbrauch' ? balken('v-' + b.id, b.kwh7, tage, 'kWh') : c === 'zyklen' ? balken('z-' + b.id, b.zyk7, tage, 'Zyklen', 0) : balken('h-' + b.id, b.h7, tage, 'h');
    const kennz = b.pumpe ? [['Zyklen heute', b.zyklen], ['Laufzeit', b.lauf], ['Längster Lauf', b.laengster]]
      : [['kWh heute', de(b.kwh7[2])], ['Kosten', `${de(b.kwh7[2] * this.d.e.preis, 2)} €`], ['Heizzeit', `${de(b.h7[2])} h`]];
    return `<div class="zurueck-zeile"><button class="glas-panel chip" data-act="tab" data-v="uebersicht">‹ Übersicht</button>
        <button class="glas-panel chip" data-act="sheet" data-s="bereich">Bearbeiten</button></div>
      <div class="glas-panel c-held ${b.z}" style="--c:${FARBE[b.z]}">
        <div class="c-illu">${illu(b)}</div>
        <div class="c-text"><div class="glas-klein">${b.pumpe ? 'PUMPENSCHACHT' : 'CONTAINER'}</div><div class="glas-titel">${esc(b.name)}</div>
          <div class="c-wert">${wertHtml(b)}</div><div class="glas-status"><span class="glas-dot"></span>${TEXT(b)}</div>
          <div class="c-kw">⚡ ${de(kwVon(b))} kW jetzt</div></div>
      </div>
      <button class="glas-panel kennz kennz-knopf" data-act="sheet" data-s="verbrauch" data-id="${b.id}">${kennz.map(([k, v]) => `<div><b>${v}</b><span>${k}</span></div>`).join('')}<span class="kennz-mehr">Verbrauch ›</span></button>
      <div class="glas-panel block"><div class="seg">${tabs.map(([k, t]) => `<button data-act="chart" data-c="${k}" class="${k === c ? 'on' : ''}">${t}</button>`).join('')}</div>
        ${c === 'temp' && b.t !== null ? `<div class="chart-optionen"><button class="chip auto-chip ${mitVb ? 'on' : ''}" data-act="temp-vb"><span class="mini-sw"><i></i></span>Verbrauch einblenden</button></div>` : ''}
        <div class="chart-wrap">${chart}</div></div>
      ${b.bedarf ? this.bedarfBlock(b) : ''}
      ${b.pumpe || b.bedarf ? '' : `<div class="glas-panel block"><div class="block-kopf"><b>Heute</b><span class="leise">Vorheizen · Arbeitszeit · Nachheizen · Kleidung trocknen</span></div>${tl}
        <div class="regelung">${b.modus === 'thermo' && b.lernen ? (() => { const l = this.lernStand(b), soll = b.soll ?? this.d.e.soll;
            return `<b>🧠 Thermostat · lernend</b><span>${l.anteil} % je 10 min · Nachlauf +${de(l.erwartet)} °C erwartet → aus bei ${de(soll - l.erwartet)} °C (Soll ${de(soll)} °C, jetzt ${de(b.t)} °C)</span>`; })()
          : b.modus === 'thermo' ? `<b>🌡 Thermostat</b><span>regelt in der Heizzeit auf ${de(b.soll ?? this.d.e.soll)} °C (jetzt ${de(b.t)} °C)</span>`
          : b.modus === 'plan' ? `<b>Zeitplan</b><span>Heizung bleibt in der Heizzeit an, der Thermostat am Heizkörper regelt</span>`
          : b.modus === 'hand' ? `<b>Hand</b><span>die Automatik schaltet diesen Container nicht</span>` : `<b>Aus</b><span>nur Frostschutz (ein unter ${de(this.d.e.frost_temp)} °C, aus über ${de(this.d.e.frost_aus)} °C)</span>`}</div></div>`}
      <div class="glas-panel liste">
        ${b.tuer ? `<div class="zeile"><div><b>🚪 ${esc(b.tuer.sensor)}</b><div class="leise">${b.tuer.offen ? `offen seit ${b.tuer.offen} min – Heizung pausiert nach ${this.d.e.tuer_pause} min, Meldung nach ${this.d.e.tuer_melden} min` : 'zu'}</div></div><span class="tuer-z ${b.tuer.offen ? 'offen' : ''}">${b.tuer.offen ? 'offen' : 'zu'}</span></div>` : ''}
        ${b.pumpe ? '' : `<div class="zeile"><div><b>⚡ Schnell aufheizen</b><div class="leise">${b.boost ? `läuft – alle Heizkörper an, ${b.t !== null ? `bis ${de(b.soll ?? this.d.e.soll)} °C` : `noch ${this.d.e.boost_min} min`}` : `alle Heizkörper zugleich, Vorrang in der Staffelung`}</div></div>
          <button class="chip glas-panel ${b.boost ? 'amber' : ''}" data-act="boost" data-id="${b.id}">${b.boost ? 'Beenden' : 'Start'}</button></div>`}
        ${b.pumpe ? `<div class="zeile"><span>♨ Automatik für diesen Schacht</span>${schalter(b.auto, 'b-auto')}</div>`
          : `<div class="zeile modus-z"><div><b>Modus</b> ${NEU}<div class="leise">${MODUS_TEXT[b.modus]}</div></div>
            <div class="seg klein">${MODI.map(([k, t]) => `<button data-act="modus" data-id="${b.id}" data-v="${k}" class="${b.modus === k ? 'on' : ''}" ${k === 'thermo' && b.t === null ? 'disabled title="kein Temperaturfühler"' : ''}>${t}</button>`).join('')}</div></div>`}
        ${b.pumpe || b.t === null ? '' : `<div class="zeile"><div><b>🧠 Lernende Regelung</b> ${NEU}<div class="leise">${['thermo', 'bedarf'].includes(b.modus) ? 'lernt, wie lange der Raum nach dem Ausschalten nachheizt, und schaltet früher ab' : 'wirkt nur im Modus Thermostat oder Bei Bedarf'}${b.lernen ? ` · <button class="link" data-act="sheet" data-s="lernen">Lernstand ›</button>` : ''}</div></div>${schalter(b.lernen, 'b-lernen')}</div>`}
        ${b.pumpe ? '' : `<div class="zeile"><span>👕 Kleidung trocknen nach Regen</span>${schalter(b.trocknen, 'b-trocknen')}</div>`}
      </div>
      <div class="glas-panel block"><div class="block-kopf"><b>${b.pumpe ? 'Pumpen' : 'Geräte'}</b><span class="leise">Schalten = Handbetrieb bis zum nächsten Schaltpunkt</span></div>
        ${b.geraete.map((g, i) => `<div class="zeile geraet"><span class="g-ic ${g.an ? 'an' : ''}">${g.typ === 'Pumpe' ? '💧' : g.typ === 'Steckdose' ? '⏻' : '♨'}</span>
          <div class="g-t"><b>${esc(g.n)}</b><span class="leise">${g.typ} · ${de(g.kw, 2)} kW${g.hand ? ' · <em class="hand">Hand</em>' : ''}${g.warte ? ` · <em class="warte">wartet – ${esc(this.anschluss(b.anschluss).name)} ausgelastet, dran in ${g.warte} min</em>` : ''}${b.z === 'pause' && ['Ölradiator', 'Konvektor'].includes(g.typ) ? ' · <em class="warte">pausiert – Tür offen</em>' : ''}</span></div>
          ${b.offline ? '<span class="leise rot-t">offline</span>' : schalter(g.an, 'geraet', `data-i="${i}"`)}</div>`).join('')}
        <button class="zeile" data-act="sheet" data-s="bereich"><span class="blau">Geräte bearbeiten</span><span class="chev">›</span></button></div>
      ${b.pumpe ? `<div class="glas-panel liste"><div class="zeile"><span>Trockenlauf (unter ${this.d.e.trocken_w} W beim Laufen)</span><span class="ok">● überwacht</span></div>
        <div class="zeile"><span>Dauerlauf über ${this.d.e.dauer_min} min</span><span class="ok">● überwacht</span></div>
        <div class="zeile"><span>Stromausfall / offline (nach ${this.d.e.offline_min} min)</span><span class="ok">● überwacht</span></div>
        <button class="zeile" data-act="tab" data-v="pumpen"><span class="blau">Schwellen im Reiter Pumpen</span><span class="chev">›</span></button></div>` : ''}`;
  }

  /* ================= WU-0004: drei Varianten der Container-Ansicht (Vorführ-Leiste „Container-Ansicht“) ================= */
  cvSoll(b) { return b.soll ?? this.d.e.soll; }
  cvDiagramm(b, c) {
    const mitVb = this.s.tempVb !== false;
    return c === 'temp' ? (b.t === null ? '<div class="leer">Kein Temperaturfühler</div>'
        : linie(`cv-t-${b.id}`, [{ name: 'Innen', v: b.innen }, { name: 'Außen', v: this.d.aussen }], '°C', mitVb ? verbrauch(this.d.bereiche, b.id, 'Tag') : null))
      : c === 'leistung' ? flaeche('cv-kw-' + b.id, [{ name: b.name, farbe: BEREICH_FARBEN[b.f % BEREICH_FARBEN.length], v: verbrauch(this.d.bereiche, b.id, 'Tag') }], STUNDEN, 'kW', 6)
      : c === 'verbrauch' ? balken('cv-v-' + b.id, b.kwh7, TAGE, 'kWh') : balken('cv-h-' + b.id, b.h7, TAGE, 'h');
  }
  cvWerte(b) { return { kw: kwVon(b), kwh: b.kwh7[2], eur: b.kwh7[2] * this.d.e.preis, h: b.h7[2] }; }
  cvSteller(b) { return `<div class="cv-soll"><button class="glas-panel cv-pm" data-act="c-soll" data-d="-0.5" aria-label="Soll niedriger">${IC_MINUS}</button>
      <div><b>${de(this.cvSoll(b))}<small> °C</small></b><span class="leise">Soll</span></div>
      <button class="glas-panel cv-pm" data-act="c-soll" data-d="0.5" aria-label="Soll höher">${IC_PLUS}</button></div>`; }
  cvModus(b) { return `<div class="seg klein">${MODI.map(([k, t]) => `<button data-act="modus" data-id="${b.id}" data-v="${k}" class="${b.modus === k ? 'on' : ''}" ${k === 'thermo' && b.t === null ? 'disabled' : ''}>${t}</button>`).join('')}</div>`; }
  cvBoost(b, gross = false) { return `<button class="glas-panel chip ${gross ? 'cv-gross' : ''} ${b.boost ? 'amber' : ''}" data-act="boost" data-id="${b.id}">⚡ ${b.boost ? 'Aufheizen beenden' : 'Schnell aufheizen'}</button>`; }
  cvGeraete(b, chips = false) {
    /* Chip: Ein/Aus-Knopf (Hand) und Schalter „aktiv“ nebeneinander (Herbert 30.09.2026); inaktiv = Automatik lässt es aus */
    return b.geraete.map((g, i) => chips
      ? `<div class="cv-chip glas-panel ${g.an && !g.inaktiv ? 'an' : ''} ${g.inaktiv ? 'inaktiv' : ''}">
          <span class="cv-chip-t">${g.typ === 'Steckdose' ? '⏻' : '♨'} <b>${esc(g.n)}</b>
            <small>${g.inaktiv ? 'inaktiv – die Automatik lässt es aus' : `${g.typ} · ${g.an ? de(g.kw, 2) + ' kW' : 'aus'}`}${g.hand && !g.inaktiv ? ' · <em class="hand">✋ Hand</em>' : ''}</small>
            ${g.hand && !g.inaktiv ? `<button class="link" data-act="g-automatik" data-i="${i}">Automatik übernehmen</button>` : ''}</span>
          <button class="cv-power ${g.an && !g.inaktiv ? 'an' : ''}" data-act="geraet" data-i="${i}" ${g.inaktiv ? 'disabled' : ''} aria-label="${esc(g.n)} ${g.an ? 'ausschalten' : 'einschalten'}" title="${g.an ? 'Ausschalten' : 'Einschalten'} (Handbetrieb)">${IC_POWER}</button>
          <label class="cv-aktiv" title="Gerät aktiv – aus: die Automatik schaltet es nicht, keine Warnungen">${schalter(!g.inaktiv, 'g-aktiv', `data-i="${i}"`)}<small>aktiv</small></label>
          <button class="bs-ic" data-act="g-bearbeiten" data-i="${i}" title="Gerät bearbeiten" aria-label="${esc(g.n)} bearbeiten">✎</button></div>`
      : `<div class="zeile geraet"><span class="g-ic ${g.an ? 'an' : ''}">♨</span><div class="g-t"><b>${esc(g.n)}</b><span class="leise">${g.typ} · ${de(g.kw, 2)} kW${g.hand ? ' · <em class="hand">Hand</em>' : ''}</span></div>${schalter(g.an, 'geraet', `data-i="${i}"`)}</div>`).join('');
  }
  cvRegelText(b) {
    if (b.modus === 'thermo' && b.lernen) { const l = this.lernStand(b), soll = this.cvSoll(b);
      return `🧠 Thermostat · lernend – ${l.anteil} % je 10 min · Nachlauf +${de(l.erwartet)} °C → aus bei ${de(soll - l.erwartet)} °C`; }
    return b.modus === 'thermo' ? `Thermostat regelt auf ${de(this.cvSoll(b))} °C` : b.modus === 'plan' ? 'Zeitplan – der Heizkörperthermostat regelt'
      : b.modus === 'hand' ? 'Hand – die Automatik schaltet nicht' : b.modus === 'bedarf' ? 'nur bei Bedarf' : 'Aus – nur Frostschutz';
  }
  /* Temperaturring: 5–30 °C, Bogen bis Ist, Marke beim Soll */
  cvRing(b) {
    const soll = this.cvSoll(b), t = b.t, w = x => Math.max(0, Math.min(1, (x - 5) / 25)), R = 52, U = 2 * Math.PI * R * .75;
    const pos = f => { const a = (135 + 270 * f) * Math.PI / 180; return [60 + R * Math.cos(a), 60 + R * Math.sin(a)]; };
    const [sx, sy] = pos(w(soll)), farbe = t === null ? 'var(--ink2)' : t > soll + .5 ? '#ff9f0a' : t < soll - .5 ? '#64a8ff' : '#30d158';
    return `<svg viewBox="0 0 120 120" class="cv-ring-svg"><circle cx="60" cy="60" r="${R}" fill="none" stroke="var(--gridc)" stroke-width="9" stroke-linecap="round" stroke-dasharray="${U} 999" transform="rotate(135 60 60)"/>
      ${t === null ? '' : `<circle cx="60" cy="60" r="${R}" fill="none" stroke="${farbe}" stroke-width="9" stroke-linecap="round" stroke-dasharray="${U * w(t)} 999" transform="rotate(135 60 60)"/>`}
      <circle cx="${sx}" cy="${sy}" r="5" fill="var(--ink)" stroke="var(--panel-rand)" stroke-width="2"/>
      <text x="60" y="58" text-anchor="middle" class="cv-ring-t">${t === null ? '–' : de(t)}°</text><text x="60" y="76" text-anchor="middle" class="cv-ring-k">Soll ${de(soll)}°</text></svg>`;
  }
  /* Tagesdiagramm: Heizzeit als Band, Innen/Außen, Soll gestrichelt, Heizen als Balken unten, Jetzt-Marke */
  cvTag(b) {
    const W = 640, H = 220, L = 34, Rr = 10, T = 12, B = 44, p = this.planTag(HEUTE_TAG, b.trocknen), soll = this.cvSoll(b);
    const x = h => L + (W - L - Rr) * h / 24, alle = [...b.innen, ...this.d.aussen, soll].filter(v => v !== null);
    const lo = Math.floor(Math.min(...alle) - 1), hi = Math.ceil(Math.max(...alle) + 1), y = v => T + (H - T - B) * (1 - (v - lo) / (hi - lo));
    const pfad = v => v.map((t, h) => t === null ? '' : `${h && v[h - 1] !== null ? 'L' : 'M'}${x(h + .5).toFixed(1)} ${y(t).toFixed(1)}`).join(' ');
    const kw = verbrauch(this.d.bereiche, b.id, 'Tag'), kmax = Math.max(1, ...kw), jetzt = +JETZT.slice(0, 2) + +JETZT.slice(3) / 60;
    const band = p ? `<rect x="${x(p.extra / 60)}" y="${T}" width="${x(p.ende / 60) - x(p.extra / 60)}" height="${H - T - B}" fill="var(--amber)" opacity=".1"/>
      <rect x="${x(p.a / 60)}" y="${T}" width="${x(p.b / 60) - x(p.a / 60)}" height="${H - T - B}" fill="var(--amber)" opacity=".1"/>` : '';
    const raster = [lo, Math.round((lo + hi) / 2), hi].map(v => `<line x1="${L}" x2="${W - Rr}" y1="${y(v)}" y2="${y(v)}" stroke="var(--gridc)"/><text x="${L - 6}" y="${y(v) + 4}" text-anchor="end" class="cv-achse">${v}°</text>`).join('');
    const stunden = [0, 6, 12, 18, 24].map(h => `<text x="${x(h)}" y="${H - 4}" text-anchor="middle" class="cv-achse">${String(h).padStart(2, '0')}</text>`).join('');
    const bars = kw.map((k, h) => k > 0 ? `<rect x="${x(h) + 2}" y="${H - B + 6 + 22 * (1 - k / kmax)}" width="${x(1) - x(0) - 4}" height="${22 * k / kmax}" rx="2" fill="${BEREICH_FARBEN[b.f % BEREICH_FARBEN.length]}" opacity=".8"/>` : '').join('');
    return `<svg viewBox="0 0 ${W} ${H}" class="cv-tag-svg">${band}${raster}
      <line x1="${L}" x2="${W - Rr}" y1="${y(soll)}" y2="${y(soll)}" stroke="var(--ink)" stroke-dasharray="5 4" opacity=".6"/><text x="${W - Rr}" y="${y(soll) - 5}" text-anchor="end" class="cv-achse">Soll ${de(soll)}°</text>
      <path d="${pfad(this.d.aussen)}" fill="none" stroke="var(--ink2)" stroke-width="1.5" opacity=".7"/>
      ${b.t === null ? '' : `<path d="${pfad(b.innen)}" fill="none" stroke="#ff9f0a" stroke-width="2.6"/>`}
      ${bars}<line x1="${x(jetzt)}" x2="${x(jetzt)}" y1="${T}" y2="${H - B + 28}" stroke="var(--ink)" opacity=".5"/>${stunden}</svg>
      <div class="cv-legende"><span><i style="background:#ff9f0a"></i>innen</span><span><i style="background:var(--ink2)"></i>außen</span><span><i class="gestr"></i>Soll</span><span><i style="background:var(--amber);opacity:.35"></i>Heizzeit</span><span><i style="background:${BEREICH_FARBEN[b.f % BEREICH_FARBEN.length]}"></i>geheizt (kWh je Stunde)</span></div>`;
  }
  cvZurueck() { return `<div class="zurueck-zeile"><button class="glas-panel chip" data-act="tab" data-v="uebersicht">‹ Übersicht</button><button class="glas-panel chip" data-act="sheet" data-s="bereich">Bearbeiten</button></div>`; }
  cvExtras(b) {
    return `${b.tuer ? `<div class="zeile"><div><b>🚪 ${esc(b.tuer.sensor)}</b><div class="leise">${b.tuer.offen ? `offen seit ${b.tuer.offen} min` : 'zu'}</div></div></div>` : ''}
      ${b.t === null ? '' : `<div class="zeile"><div><b>🧠 Lernende Regelung</b>${b.lernen ? ' · <button class="link" data-act="sheet" data-s="lernen">Lernstand ›</button>' : ''}</div>${schalter(b.lernen, 'b-lernen')}</div>`}
      <div class="zeile"><span>👕 Kleidung trocknen nach Regen</span>${schalter(b.trocknen, 'b-trocknen')}</div>`;
  }

  /* D – gewählte Mischung (Herbert 30.09.2026: „mir gefällt A, aber das Diagramm aus B“): Kopf und Kacheln aus A,
     in der Mitte das Tagesdiagramm aus B (Reiter Heute/Woche/Heizzeit), Geräte als Chips */
  v_container_d() {
    const b = this.b, w = this.cvWerte(b), c = ['heute', 'woche', 'stunden'].includes(this.s.cvd) ? this.s.cvd : 'heute';
    const inhalt = c === 'heute' ? this.cvTag(b) : c === 'woche' ? balken('cv-dw-' + b.id, b.kwh7, TAGE, 'kWh') : balken('cv-dh-' + b.id, b.h7, TAGE, 'h');
    return `${this.cvZurueck()}
      <div class="glas-panel cv-d-held ${b.z}" style="--c:${FARBE[b.z]}">
        <div class="cv-d-info"><div><div class="glas-klein">CONTAINER</div><div class="glas-titel">${esc(b.name)}</div>
          <div class="glas-status"><span class="glas-dot"></span>${TEXT(b)}</div><div class="leise">${this.cvRegelText(b)}</div></div>
          <div class="cv-d-knoepfe">${this.cvModus(b)}${this.cvBoost(b)}</div></div>
        <div class="cv-kern cv-kern-1">${b.t === null ? this.cvOhneFuehler(b) : this.cvKern1(b, this.cvSollAktiv(b))}</div>
      </div>
      <div class="cv-kacheln">${[['⚡', de(w.kw), 'kW jetzt'], ['🔋', de(w.kwh), 'kWh heute'], ['€', de(w.eur, 2), 'Kosten heute'], ['⏱', de(w.h), 'h Heizzeit']].map(([i, v, t]) =>
        `<button class="glas-panel cv-kachel" data-act="sheet" data-s="verbrauch" data-id="${b.id}"><span>${i}</span><b>${v}</b><small>${t}</small></button>`).join('')}</div>
      <div class="glas-panel block cv-b-tag"><div class="block-kopf"><div class="seg klein">${[['heute', 'Heute'], ['woche', 'Woche'], ['stunden', 'Heizzeit']].map(([k, t]) => `<button data-act="cvd" data-v="${k}" class="${k === c ? 'on' : ''}">${t}</button>`).join('')}</div>
        <span class="leise">${c === 'heute' ? this.zeitleisteText(b) : c === 'woche' ? 'kWh je Tag' : 'Stunden geheizt je Tag'}</span></div>
        <div class="chart-wrap">${inhalt}</div></div>
      <div class="glas-panel block"><div class="block-kopf"><b>Geräte</b><span class="leise">Schalten = Handbetrieb</span></div><div class="cv-chips">${this.cvGeraete(b, true)}</div></div>
      <div class="glas-panel liste">${this.cvExtras(b)}</div>`;
  }

  /* ---- WU-0004: vier Designs für Ist/Soll mit Steuerung (Leiste „Soll/Ist-Design“) ---- */
  cvLage(b) {   // Farbe und Text je Abstand Ist ↔ Soll
    const soll = this.cvSoll(b), t = b.t, d = t - soll;
    return { soll, t, d, farbe: d > .5 ? '#ff9f0a' : d < -.5 ? '#64a8ff' : '#30d158',
      text: Math.abs(d) <= .5 ? 'am Soll' : `${de(Math.abs(d))}° ${d > 0 ? 'über' : 'unter'} Soll`,
      trend: b.innen.filter(v => v !== null).slice(-3) };
  }
  /* Soll gilt nur, wenn die Integration selbst nach dem Fühler regelt: Thermostat oder Bei Bedarf (mit Fühler) */
  cvSollAktiv(b) { return b.t !== null && ['thermo', 'bedarf'].includes(b.modus); }
  cvOhneSollText(b) { return { plan: 'Zeitplan – der Heizkörperthermostat regelt', hand: 'Hand – kein Soll', aus: 'Aus – nur Frostschutz' }[b.modus] || ''; }
  cvOhneFuehler(b) { return `<div class="cv-ohne glas-panel"><small>LEISTUNG JETZT</small><b>${de(kwVon(b))}<small> kW</small></b><span class="leise">kein Fühler – der Heizkörperthermostat regelt</span></div>`; }
  cvPlusMinus(klasse = '') { return [`<button class="cv-pm ${klasse}" data-act="c-soll" data-d="-0.5" aria-label="Soll niedriger">${IC_MINUS}</button>`, `<button class="cv-pm ${klasse}" data-act="c-soll" data-d="0.5" aria-label="Soll höher">${IC_PLUS}</button>`]; }
  /* 1 · Thermostat-Rad: Strichkranz 5–30 °C, zwischen Ist und Soll farbig, Soll-Knopf, − + in der Öffnung unten */
  cvKern1(b, mitSoll = true) {
    const l = this.cvLage(b), w = x => Math.max(0, Math.min(1, (x - 5) / 25)), R = 78, ang = f => (135 + 270 * f) * Math.PI / 180;
    if (!mitSoll) l.farbe = 'var(--ink)';
    const [von, bis] = mitSoll ? [Math.min(w(l.t), w(l.soll)), Math.max(w(l.t), w(l.soll))] : [0, w(l.t)];
    const striche = [...Array(61)].map((_, i) => { const f = i / 60, a = ang(f), an = f >= von - .001 && f <= bis + .001, lang = i % 10 === 0;
      return `<line x1="${100 + (R - (lang ? 14 : 9)) * Math.cos(a)}" y1="${100 + (R - (lang ? 14 : 9)) * Math.sin(a)}" x2="${100 + R * Math.cos(a)}" y2="${100 + R * Math.sin(a)}" stroke="${an ? l.farbe : 'var(--ink2)'}" stroke-width="${an ? 3 : 1.6}" stroke-linecap="round" opacity="${an ? 1 : .35}"/>`; }).join('');
    const ks = ang(w(l.soll)), [m, p] = this.cvPlusMinus('rund');
    return `<div class="cv-rad"><svg viewBox="0 0 200 200"><defs><radialGradient id="cvRadG" cx="50%" cy="40%" r="60%"><stop offset="0" stop-color="rgba(255,255,255,.16)"/><stop offset="1" stop-color="rgba(255,255,255,.02)"/></radialGradient></defs>
      <circle cx="100" cy="100" r="${R - 20}" fill="url(#cvRadG)" stroke="var(--panel-rand)"/>${striche}
      ${mitSoll ? `<circle cx="${100 + R * Math.cos(ks)}" cy="${100 + R * Math.sin(ks)}" r="8" fill="#fff" stroke="${l.farbe}" stroke-width="3"/>` : ''}
      <text x="100" y="80" text-anchor="middle" class="cv-rad-k">IST</text><text x="100" y="112" text-anchor="middle" class="cv-rad-t">${de(l.t)}°</text>
      ${mitSoll ? `<text x="100" y="134" text-anchor="middle" class="cv-rad-s" fill="${l.farbe}">Soll ${de(l.soll)}°</text>` : ''}</svg>
      ${mitSoll ? `<div class="cv-rad-pm">${m}${p}</div>` : `<div class="leise cv-ohne-t">${this.cvOhneSollText(b)}</div>`}</div>`;
  }
  zeitleisteText(b) { const p = this.planTag(HEUTE_TAG, b.trocknen); return p ? `Heizzeit ${uhr(p.extra)}–${uhr(p.ende)} · Arbeitszeit ${uhr(p.a)}–${uhr(p.b)}` : 'heute frei'; }

  zeitleiste(b) {
    const p = this.planTag(HEUTE_TAG, b.trocknen);
    return `<div class="tl">${this.zeitstrahl(p, true)}<div class="tl-achse">${['04', '08', '12', '16', '20'].map(h => `<span>${h}</span>`).join('')}</div></div>
      ${p ? `<div class="leise">Arbeitszeit ${uhr(p.a)}–${uhr(p.b)} · heizt ${uhr(p.extra)}–${uhr(p.ende)}${p.gruende.length ? ' · ' + p.gruende.join(' · ') : ''}</div>` : ''}`;
  }

  /* ---- Heizung ---- */
  v_heizung() {
    const e = this.d.e, st = (k, d, fmt) => `<span class="stepper"><button data-act="st" data-k="${k}" data-d="${-d}">−</button><b>${fmt(e[k])}</b><button data-act="st" data-k="${k}" data-d="${d}">+</button></span>`;
    const grad = v => `${de(v, 1)} °C`, min = v => `${v} min`, mm = v => `${de(v, 1)} mm`;
    const p = this.planTag(HEUTE_TAG), az = this.azJetzt, hoechst = 9, jetztT = 4.2, bezug = e.basis === 'jetzt' ? jetztT : hoechst;
    const naechster = this.d.feiertage.find(f => f[0] > HEUTE);
    const regel = (ic, titel, text, an) => `<div class="hr-zeile ${an ? 'an' : ''}"><span class="hr-ic">${ic}</span><div><b>${titel}</b><div class="leise">${text}</div></div><span class="hr-an">${an ? '●' : '○'}</span></div>`;
    const C = this.d.bereiche.filter(b => !b.pumpe);
    return `${this.kopf('Heizung', 'ÖWG DOBL ZWARING', `<div>${schalter(this.s.auto, 'auto')}</div>`)}
      <div class="glas-panel block"><div class="block-kopf"><b>Heute</b><span class="leise">welche Regeln greifen</span></div>
        ${regel('🕖', `Arbeitszeit ${p ? `${uhr(p.a)}–${uhr(p.b)}` : 'frei'}`, `„${esc(az.name)}“ · heizt ${p ? `${uhr(p.extra)}–${uhr(p.ende)}` : 'nicht'}`, !!p)}
        ${regel('🌡', `Heizgrenze ${de(e.grenze, 0)} °C`, `${e.basis === 'jetzt' ? 'jetzt' : 'Höchstwert heute'} ${de(bezug, 0)} °C → ${bezug > e.grenze ? 'zu warm, es wird nicht geheizt' : 'es wird geheizt'}`, bezug <= e.grenze)}
        ${regel('🌧', 'Kleidung trocknen', `6 mm Regen seit gestern (ab ${de(e.tr_mm)} mm) → ${e.tr_laenger} min länger, bis ${p ? uhr(p.ende) : '–'}`, 6 >= e.tr_mm)}
        ${regel('❄', 'Kälte-Frühstart morgen', `−1,2 °C erwartet (unter ${de(e.frueh_temp, 0)} °C) → ${e.frueh_min} min früher, dazu ${e.tr_frueher} min nach Regen`, e.fruehstart)}
        ${e.staffel ? (() => { const L = this.last(); return regel('⚡', `Staffelung: ${L.laufen} von ${L.hk.length} Heizkörpern`, `${L.warten ? `${L.warten} wartet, weil ein Anschluss ausgelastet ist` : 'alle haben Platz'} · höchstens ${e.max_gleich} gleichzeitig · Vorheizen startet 15 min früher, damit alle warm werden`, true); })() : ''}
        ${regel('🏖', 'Kein Urlaub, kein Feiertag', `nächster Feiertag ${wtag(naechster[0])} ${kurzDatum(naechster[0])} ${naechster[1]}`, false)}</div>
      ${this.uebersichtHeizzeiten()}
      <div class="glas-panel block"><div class="block-kopf"><b>Heizplan · diese Woche</b><span class="leise">aus Arbeitszeit und Wetter</span></div>${this.heizplanInhalt()}</div>
      ${this.azBlock()}
      ${this.ausnahmenBlock()}
      <div class="glas-panel block"><div class="block-kopf"><b>So wird geheizt</b><span class="leise">in der Arbeitszeit immer</span></div>
        <div class="zeile"><div><b>Vorheizen</b><div class="leise">vor Arbeitsbeginn, damit es warm ist</div></div>${st('vorheizen', 5, min)}</div>
        <div class="zeile"><div><b>Nachheizen</b><div class="leise">nach Arbeitsende, jeden Tag</div></div>${st('nachheizen', 5, min)}</div>
        <div class="zeile"><div><b>⚡ Schnell aufheizen</b><div class="leise">alle Heizkörper eines Containers zugleich, Vorrang in der Staffelung – bis zum Soll, ohne Fühler für</div></div>${st('boost_min', 5, min)}</div>
        <div class="zeile"><div><b>🚪 Tür offen</b><div class="leise">Heizung pausieren nach</div></div>${st('tuer_pause', 1, min)}</div>
        <div class="zeile unter"><span>Nachricht nach</span>${st('tuer_melden', 5, min)}</div>
        <div class="zeile"><div><b>🌡 Solltemperatur</b><div class="leise">für Container mit Fühler; ohne Fühler regelt der Heizkörperthermostat</div></div>${st('soll', .5, grad)}</div>
        <div class="zeile"><div><b>Heizgrenze</b><div class="leise">nicht heizen, wenn es wärmer ist</div></div>${st('grenze', .5, grad)}</div>
        <div class="zeile"><span>Grundlage</span><div class="seg klein">${['jetzt', 'Tageshöchstwert'].map(v => `<button data-act="basis" data-v="${v}" class="${e.basis === v ? 'on' : ''}">${v}</button>`).join('')}</div></div>
        <div class="zeile"><div><b>Kälte-Frühstart</b><div class="leise">unter ${de(e.frueh_temp, 0)} °C zusätzlich früher</div></div>${schalter(e.fruehstart, 'e-bool', 'data-k="fruehstart"')}</div>
        ${e.fruehstart ? `<div class="zeile unter"><span>so viel früher</span>${st('frueh_min', 5, min)}</div>` : ''}
        <div class="zeile"><div><b>Frostschutz</b><div class="leise">hält jeden Container über der Grenze, auch außerhalb der Arbeitszeit</div></div>${schalter(e.frost, 'e-bool', 'data-k="frost"')}</div>
        ${e.frost ? `<div class="zeile unter"><span>ein unter ${NEU}</span>${st('frost_temp', .5, grad)}</div>
        <div class="zeile unter"><span>aus über</span>${st('frost_aus', .5, grad)}</div>` : ''}
        ${erkl(e.erklaer, 'Vorheizen und Nachheizen gelten jeden Arbeitstag. Die Heizgrenze verhindert Heizen an warmen Tagen. Der Frostschutz springt unter „ein“ an und hört erst über „aus“ wieder auf, damit der Heizkörper nicht dauernd ein- und ausschaltet. Ohne Fühler kennt die Seite keine Innentemperatur – dann gilt die Außentemperatur.')}</div>
      <div class="glas-panel block"><div class="block-kopf"><b>👕 Kleidung trocknen</b><span class="leise">nach Regen zusätzlich zum Nachheizen</span></div>
        <div class="zeile"><span>ab Regen (seit gestern)</span>${st('tr_mm', .5, mm)}</div>
        <div class="zeile"><span>zusätzlich nach dem Nachheizen</span>${st('tr_laenger', 5, min)}</div>
        <div class="zeile"><span>am nächsten Morgen früher</span>${st('tr_frueher', 5, min)}</div></div>
      <div class="glas-panel block"><div class="block-kopf"><b>Je Container</b><span class="leise">Modus · Trocknen · Soll</span></div>
        ${C.map(b => { const soll = b.soll ?? e.soll;
          return `<div class="jc"><div class="jc-name"><b>${esc(b.name)}</b><span class="leise">${b.offline ? 'offline' : b.t !== null ? `🌡 ${de(b.t)} °C` : 'ohne Fühler'}</span></div>
            <div class="jc-ctrl"><select class="jc-modus" data-jm="${b.id}" title="Modus">${MODI.map(([k, t]) => `<option value="${k}" ${b.modus === k ? 'selected' : ''} ${k === 'thermo' && b.t === null ? 'disabled' : ''}>${t}</option>`).join('')}</select>
              <span class="jc-l">👕</span>${schalter(b.trocknen, 'tr-b', `data-id="${b.id}"`).replace('class="sw', 'class="sw klein')}
              ${b.t !== null ? `<span class="stepper klein"><button data-act="jc-soll" data-id="${b.id}" data-d="-0.5">−</button><b class="${b.soll !== undefined ? 'eigen' : ''}">${de(soll)}°</b><button data-act="jc-soll" data-id="${b.id}" data-d="0.5">+</button></span>`
                : '<span class="leise jc-th">Thermostat</span>'}</div></div>`; }).join('')}
        <div class="leise">Ein eigener Sollwert (bernstein) gilt nur für diesen Container, sonst gilt ${de(e.soll)} °C. Modus ${NEU}</div>
        ${erkl(e.erklaer, 'Zeitplan: an in der Heizzeit, der Heizkörper regelt selbst. Thermostat: in der Heizzeit nach dem Fühler auf das Soll (nur mit Fühler). Bei Bedarf: nur per Schalter oder Termin. Hand: die Automatik schaltet nicht. Aus: nur Frostschutz.')}</div>
      <div class="glas-panel block"><div class="block-kopf"><b>Urlaub &amp; Feiertage</b></div>
        <div class="zeile"><div><b>An Feiertagen frei</b><div class="leise">Feiertage aus dem Kalender „Feiertage“ – Österreich, jedes Jahr neu berechnet</div></div>${schalter(e.feiertag_frei, 'e-bool', 'data-k="feiertag_frei"')}</div>
        <div class="zeile modus-z"><div><b>Im Urlaub und an freien Feiertagen</b> ${NEU}<div class="leise">${{ frost: 'nur Frostschutz', absenk: `mit Fühler auf ${de(e.absenk)} °C halten, ohne Fühler nur Frostschutz`, aus: 'alles aus – auch kein Frostschutz. Nur, wenn nichts einfrieren kann.' }[e.urlaub]}</div></div>
          <div class="seg klein">${[['frost', 'nur Frostschutz'], ['absenk', 'absenken'], ['aus', 'alles aus']].map(([k, t]) => `<button data-act="e-wert" data-k="urlaub" data-v="${k}" class="${e.urlaub === k ? 'on' : ''}">${t}</button>`).join('')}</div></div>
        ${e.urlaub === 'absenk' ? `<div class="zeile unter"><span>absenken auf</span>${st('absenk', .5, grad)}</div>` : ''}
        ${this.d.feiertage.filter(f => f[0] > HEUTE).slice(0, 4).map(f => { const t = wtag(f[0]), we = t === 'Sa' || t === 'So';
          return `<div class="zeile unter"><span><b class="ft-d">${t} ${kurzDatum(f[0])}</b> ${f[1]}</span><span class="leise">${we ? 'Wochenende' : 'frei'}</span></div>`; }).join('')}
        <div class="gruppe-t">Urlaub · Kalender „Baustelle Urlaub“</div>
        ${this.d.urlaube.map((u, i) => `<div class="zeile unter"><span><b>${esc(u.name)}</b> <span class="leise">${kurzDatum(u.von)} – ${datum(u.bis)}</span></span><button class="x" data-act="urlaub-weg" data-i="${i}" title="Urlaub löschen">✕</button></div>`).join('') || '<div class="leise">Kein Urlaub eingetragen</div>'}
        <button class="zeile" data-act="sheet" data-s="urlaub"><span class="blau">+ Urlaub eintragen</span></button></div>`;
  }
  ausnahmenBlock() {
    const L = this.d.ausnahmen.filter(a => a.datum >= HEUTE).sort((a, b) => a.datum.localeCompare(b.datum));
    return `<div class="glas-panel block"><div class="block-kopf"><b>Ausnahmen</b><span class="leise">einmalig – die Arbeitszeit bleibt, wie sie ist</span></div>
      <div class="bedarf-dauer">${[['heute-laenger', '+ Heute länger'], ['morgen-spaeter', '+ Morgen später'], ['samstag', '+ Samstag arbeiten'], ['frei', '+ Freier Tag']].map(([k, t]) => `<button class="chip glas-panel" data-act="ausn-neu" data-v="${k}">${t}</button>`).join('')}</div>
      ${L.length ? L.map(a => `<div class="zeile ereignis"><span class="zeit t-wann">${wtag(a.datum)} ${kurzDatum(a.datum)}</span>
          <div><b>${a.art === 'frei' ? 'frei' : `${a.von}–${a.bis}`}</b> <span class="badge ${a.art === 'frei' ? '' : 'blau-b'}">${AUSNAHME[a.art]}</span>${a.notiz ? `<div class="leise">${esc(a.notiz)}</div>` : ''}</div>
          <button class="x" data-act="ausn-weg" data-d="${a.datum}" title="Ausnahme löschen">✕</button></div>`).join('') : '<div class="leise">Keine Ausnahmen</div>'}
      <button class="zeile" data-act="ausn-neu" data-v=""><span class="blau">+ Ausnahme für einen anderen Tag</span></button></div>`;
  }
  azBlock() {
    const L = this.azListe, jetzt = this.azJetzt, geplant = L.filter(a => a.ab > HEUTE), frueher = L.filter(a => a.ab < jetzt.ab).reverse();
    const idx = a => this.d.arbeitszeiten.indexOf(a);
    return `<div class="glas-panel block"><div class="block-kopf"><b>Arbeitszeit</b><span class="badge gruen">gilt seit ${datum(jetzt.ab)}</span></div>
      <div class="az-name">${esc(jetzt.name)}</div>
      ${jetzt.auto ? '<div class="leise">Automatisch angelegt – wird ersetzt, sobald du eine eigene Arbeitszeit speicherst (auch mit früherem Datum).</div>' : ''}
      <button class="zeile" data-act="sheet" data-s="az" data-i="${idx(jetzt)}"><span class="blau">Bearbeiten oder löschen</span><span class="chev">›</span></button>
      ${TAGE.map(t => { const z = jetzt.tage[t]; return `<div class="zeile az ${t === HEUTE_TAG ? 'heute' : ''}"><b class="tag-n">${t}</b>
        <span class="fenster">${z ? `<em>${z[0]}–${z[1]}</em>` : '<span class="leise">frei</span>'}</span><span class="leise">${z ? dauer(z[0], z[1]) : ''}</span></div>`; }).join('')}
      ${geplant.map(a => `<button class="zeile" data-act="sheet" data-s="az" data-i="${idx(a)}"><span><span class="badge blau-b">geplant</span> ab ${datum(a.ab)} · ${esc(a.name)}</span><span class="chev">›</span></button>`).join('')}
      ${frueher.length ? `<button class="zeile" data-act="az-alt"><span>Frühere Arbeitszeiten (${frueher.length})</span><span class="chev">${this.s.azAlt ? '⌄' : '›'}</span></button>` : ''}
      ${this.s.azAlt ? frueher.map(a => `<button class="zeile unter" data-act="sheet" data-s="az" data-i="${idx(a)}"><span>${datum(a.ab)} · ${esc(a.name)}</span><span class="leise">${a.tage.Mo ? a.tage.Mo.join('–') : ''} ›</span></button>`).join('') : ''}
      <button class="zeile" data-act="az-neu"><span class="blau">+ Neue Arbeitszeit ab …</span></button></div>`;
  }

  /* ---- Auswertung ---- */
  v_auswertung() {
    return this.v_auswertung_6();   // WU-0005: Auswertung aus Bausteinen (abgenommen 30.09.2026); 1–5 sind Vorlagen
    const aw = this.s.aw ||= { zeitraum: 'Monat', auswahl: this.d.bereiche.map(b => b.id) }, z = aw.zeitraum, preis = this.d.e.preis;
    const alle = this.s.awScope === 'alle', lauf = alle ? this.laufende() : [this.laufende()[0]];
    const kwh = lauf.reduce((a, l) => a + verbrauch(l.bereiche, null, z).reduce((x, v) => x + v, 0), 0), ohne = kwh * 4.6;
    const vergleich = { Tag: ['gestern', 8, -3, 5], Woche: ['Vorwoche', -4, -6, 12], Monat: ['Vormonat', 31, 26, -8], Jahr: ['2025', 12, 9, 4] }[z];
    const kz = (wert, text, delta) => `<div><b>${wert}</b><span>${text}</span><em class="${delta > 0 ? 'mehr' : 'weniger'}">${delta > 0 ? '▲' : '▼'} ${Math.abs(delta)} %</em></div>`;
    // Wetter-Einfluss: letzte 30 Heiztage, kWh je Tag gegen Tagesmittel außen
    const r = zufall(11), pkt = [...Array(30)].map(() => { const t = -6 + r() * 20; return [t, Math.max(4, 7.4 * (15.5 - t) + (r() - .5) * 22)]; });
    const mx = pkt.reduce((a, q) => a + q[0], 0) / 30, my = pkt.reduce((a, q) => a + q[1], 0) / 30;
    const k = pkt.reduce((a, q) => a + (q[0] - mx) * (q[1] - my), 0) / pkt.reduce((a, q) => a + (q[0] - mx) ** 2, 0), d0 = my - k * mx, null0 = -d0 / k;
    return `${this.kopf('Auswertung', alle ? 'ALLE LAUFENDEN BAUSTELLEN' : 'ÖWG DOBL ZWARING', `<button class="glas-panel chip" data-act="csv">⇩ CSV</button>`)}
      <div class="seg glas-panel">${[['diese', 'Diese Baustelle'], ['alle', `Alle laufenden (${this.laufende().length})`]].map(([k, t]) => `<button data-act="aw-scope" data-v="${k}" class="${(this.s.awScope || 'diese') === k ? 'on' : ''}">${t}</button>`).join('')}</div>
      <div class="glas-panel kennz vier">${kz(de(kwh, 0), 'kWh', vergleich[1])}${kz(`${de(kwh * preis, 0)} €`, 'Kosten', vergleich[1])}${kz(`${de(kwh / 11, 0)} h`, 'Heizzeit', vergleich[2])}${kz(`${de(kwh / 90, 1)} h`, 'Pumpzeit', vergleich[3])}</div>
      <div class="leise vgl">Pfeile: im Vergleich zu ${vergleich[0]}</div>
      <div class="glas-panel block">${this.verbrauchInhalt(aw, 'aw', false)}</div>
      ${alle ? '' : this.leistungHeute()}
      ${alle ? '' : this.temperaturen()}
      ${this.abrechnung(z)}
      ${alle ? '' : this.jeGeraet(z)}
      <div class="glas-panel block"><div class="block-kopf"><b>Wetter-Einfluss</b><span class="leise">letzte 30 Heiztage · kWh je Tag gegen Außentemperatur</span></div>
        <div class="chart-wrap">${streu('streu', pkt, k, d0)}</div>
        <div class="hinweis-k">Je Grad kälter <b>≈ +${de(-k, 1)} kWh</b> am Tag (${de(-k * preis, 2)} €). Ab etwa <b>${de(null0, 0)} °C</b> wird kaum mehr geheizt – die Heizgrenze steht auf ${de(this.d.e.grenze, 0)} °C.</div></div>
      <div class="glas-panel block"><div class="block-kopf"><b>Ohne Automatik</b><span class="leise">wenn alles rund um die Uhr liefe</span></div>
        <div class="hbar"><span class="hb-n">mit Automatik</span><span class="hb-spur"><i style="width:${kwh / ohne * 100}%;background:var(--s1)"></i></span><span class="hb-w">${de(kwh * preis, 0)} €</span></div>
        <div class="hbar"><span class="hb-n">ohne (24/7)</span><span class="hb-spur"><i style="width:100%;background:var(--s2)"></i></span><span class="hb-w">${de(ohne * preis, 0)} €</span></div>
        <div class="gespart">gespart <b>${de((ohne - kwh) * preis, 2)} €</b> · ${de((1 - kwh / ohne) * 100, 0)} %</div>
        ${erkl(this.d.e.erklaer, '„Ohne Automatik“ rechnet mit der gemessenen Leistung je Heizkörper, als liefe er rund um die Uhr – so, wie es ohne Steuerung oft ist.')}</div>
      ${alle ? '' : this.hochrechnung(412)}
      <div class="glas-panel block"><div class="block-kopf"><b>Ölradiator oder Konvektor</b><span class="leise">nur zum Vergleich · aus eigenen Messungen</span></div>
        <table class="vergleich"><tr><th></th><th>Ölradiator</th><th>Konvektor</th></tr>
          <tr><td>kWh je Heizstunde</td><td>1,62</td><td><b>1,94</b></td></tr>
          <tr><td>Aufheizen auf 18 °C</td><td><b>48 min</b></td><td>31 min</td></tr>
          <tr><td>Abkühlen nach Aus</td><td>2,1 °C/h</td><td><b>3,4 °C/h</b></td></tr>
          <tr><td>Kosten je Tag</td><td>2,72 €</td><td>3,26 €</td></tr></table>
        <div class="leise fuss">Der Ölradiator braucht länger, hält die Wärme aber besser und verbraucht rund 16 % weniger.</div></div>`;
  }


  /* ================= WU-0005: vier Varianten der Auswertung (Vorführ-Leiste „Auswertung“) ================= */
  awDaten() {
    const aw = this.s.aw ||= { zeitraum: 'Monat', auswahl: this.d.bereiche.map(b => b.id) }, z = aw.zeitraum, p = this.d.e.preis;
    const alle = this.s.awScope === 'alle', lauf = alle ? this.laufende() : [this.laufende()[0]];
    const container = lauf.flatMap(l => l.bereiche.filter(b => !b.pumpe).map(b => { const kwh = verbrauch(l.bereiche, b.id, z).reduce((a, v) => a + v, 0);
      return { l, b, kwh, eur: kwh * p, h: kwh / (1.7 + (b.f % 3) * .15), temp: b.t }; })).sort((x, y) => y.kwh - x.kwh);
    const fz = zrFaktor(z, aw.v || 0); container.forEach(c => { c.kwh *= fz; c.eur *= fz; c.h *= fz; c.proH = c.h ? c.kwh / c.h : 0; });
    const kwh = container.reduce((a, c) => a + c.kwh, 0), ohne = kwh * 4.6;
    const vergleich = { Tag: ['gestern', 8, -3], Woche: ['Vorwoche', -4, -6], Monat: ['Vormonat', 31, 26], Jahr: ['2025', 12, 9] }[z];
    const rz = zufall(11), pkt = [...Array(30)].map(() => { const t = -6 + rz() * 20; return [t, Math.max(4, 7.4 * (15.5 - t) + (rz() - .5) * 22)]; });
    const mx = pkt.reduce((a, q) => a + q[0], 0) / 30, my = pkt.reduce((a, q) => a + q[1], 0) / 30;
    const k = pkt.reduce((a, q) => a + (q[0] - mx) * (q[1] - my), 0) / pkt.reduce((a, q) => a + (q[0] - mx) ** 2, 0), d0 = my - k * mx;
    const firmen = this.d.firmen.map(f => ({ f, c: container.filter(x => (x.b.firma || 'eigen') === f.id) })).filter(x => x.c.length).map(x => ({ ...x, kwh: x.c.reduce((a, c) => a + c.kwh, 0) }));
    const [von, bis] = this.d.bs.hp, mon = (bis - von + 12) % 12 + 1, hoch = 412 / .75 * mon * 1.35 * p;
    const zi = zrInfo(z, aw.v || 0), zText = (aw.v || 0) < 2 && z !== 'Monat' && z !== 'Jahr' ? zi.text.toLowerCase() : zi.text;
    return { aw, z, p, alle, lauf, container, kwh, ohne, vergleich, pkt, k, d0, null0: -d0 / k, firmen, hoch, zText };
  }
  awKopf(D, rechts = '') {
    return `${this.kopf('Auswertung', D.alle ? 'ALLE LAUFENDEN BAUSTELLEN' : 'ÖWG DOBL ZWARING', rechts || `<button class="glas-panel chip" data-act="csv">⇩ CSV</button>`)}
      <div class="aw-leiste"><div class="seg glas-panel">${['Tag', 'Woche', 'Monat', 'Jahr'].map(t => `<button data-act="vb-zeitraum" data-ziel="aw" data-v="${t}" class="${D.z === t ? 'on' : ''}">${t}</button>`).join('')}</div>
        <div class="seg glas-panel">${[['diese', 'Diese Baustelle'], ['alle', `Alle (${this.laufende().length})`]].map(([k, t]) => `<button data-act="aw-scope" data-v="${k}" class="${(this.s.awScope || 'diese') === k ? 'on' : ''}">${t}</button>`).join('')}</div></div>${this.zrWahl(D.z)}`;
  }
  /* FE-0008: drei Varianten, einen früheren Zeitraum zu wählen (Vorführ-Leiste „FE-0008 Zeitraum“) */
  zrWahl(z) {
    const v = this.s.aw.v || 0, max = zrMax(z), i = zrInfo(z, v);
    const pfeile = mitte => `<div class="zr-nav glas-panel"><button class="zr-pf" data-act="zr-schritt" data-d="1" ${v >= max ? 'disabled' : ''} aria-label="früher">‹</button>${mitte}
      <button class="zr-pf" data-act="zr-schritt" data-d="-1" ${v <= 0 ? 'disabled' : ''} aria-label="später">›</button></div>${v ? '<button class="glas-panel chip zr-akt" data-act="zr-setz" data-v="0">Aktuell</button>' : ''}`;
    const titel = `<b>${i.text}</b>${i.unter ? `<small>${i.unter}</small>` : ''}`;
    if (ZR_VAR === '1') return `<div class="zr-zeile">${pfeile(`<div class="zr-mitte">${titel}</div>`)}</div>`;
    if (ZR_VAR === '4') {
      const k = this.s.zrKal, mitte = `<button class="zr-mitte zr-auf" data-act="zr-kal">${titel}<span class="zr-pfeil">${k ? '▴' : '▾'}</span></button>`;
      return `<div class="zr-zeile">${pfeile(mitte)}${k ? this.zrKalender(z, v, k) : ''}</div>`;
    }
    if (ZR_VAR === '2') {
      const offen = this.s.zrOffen, liste = z === 'Tag' ? '' : [...Array(max + 1)].map((_, k) => { const x = zrInfo(z, k);
        return `<button class="zr-eintrag ${k === v ? 'on' : ''}" data-act="zr-setz" data-v="${k}"><span>${x.text}</span><small>${k === 0 ? 'aktuell' : x.unter && x.unter !== x.text ? x.unter : ''}</small>${k === v ? '<b>✓</b>' : ''}</button>`; }).join('');
      const mitte = z === 'Tag' ? `<label class="zr-mitte zr-datum">${titel}<input type="date" data-zrd value="${i.iso}" min="${ZR_GRENZE}" max="${HEUTE}" aria-label="Tag wählen"></label>`
        : `<button class="zr-mitte zr-auf" data-act="zr-liste">${titel}<span class="zr-pfeil">${offen ? '▴' : '▾'}</span></button>`;
      return `<div class="zr-zeile">${pfeile(mitte)}${offen && z !== 'Tag' ? `<div class="zr-liste glas-panel">${liste}</div>` : ''}</div>`;
    }
    // 3 · Zeitstrahl: alle Zeiträume als Balken, der neueste rechts; antippen wählt
    const n = Math.min(max, z === 'Tag' ? 59 : max) + 1, werte = [...Array(n)].map((_, k) => zrFaktor(z, k)), hoch = Math.max(...werte);
    return `<div class="zr-zeile"><div class="zr-strahl glas-panel">${[...Array(n)].map((_, k) => { const x = zrInfo(z, k);
        return `<button class="zr-balken ${k === v ? 'on' : ''}" data-act="zr-setz" data-v="${k}" title="${x.text}"><i style="height:${Math.round(werte[k] / hoch * 100)}%"></i><span>${k === 0 && z !== 'Jahr' ? (z === 'Tag' ? 'heute' : z === 'Woche' ? 'jetzt' : x.kurz) : x.kurz}</span></button>`; }).join('')}</div>
      <div class="zr-gewaehlt"><span>${titel}</span>${v ? '<button class="glas-panel chip" data-act="zr-setz" data-v="0">Aktuell</button>' : ''}</div></div>`;
  }
  /* Kalender skaliert mit dem Zeitraum: Tag → Monat mit Tagen, Woche → Monat mit KW-Zeilen, Monat → Jahr mit Monaten, Jahr → 12 Jahre */
  zrKalender(z, v, k) {
    const max = zrMax(z), wahl = zrInfo(z, v).iso, ok = iso => { const x = zrVersatz(z, iso); return x >= 0 && x <= max; };
    const knopf = (iso, text, cls = '') => { const x = zrVersatz(z, iso), an = x >= 0 && x <= max;
      return `<button class="zr-k ${cls} ${x === v ? 'on' : ''} ${x === 0 ? 'jetzt' : ''}" ${an ? `data-act="zr-setz" data-v="${x}"` : 'disabled'}>${text}</button>`; };
    let kopf, inhalt, cls;
    if (z === 'Tag' || z === 'Woche') {
      const erster = `${k.j}-${String(k.m + 1).padStart(2, '0')}-01`, t = new Date(erster + 'T12:00:00Z'), start = isoPlus(erster, -((t.getUTCDay() + 6) % 7));
      const wochen = []; for (let w = start; w.slice(0, 7) <= erster.slice(0, 7) && wochen.length < 6; w = isoPlus(w, 7)) wochen.push(w);
      kopf = `${MONATE_LANG[k.m]} ${k.j}`; cls = 'zr-kal-tage';
      inhalt = `<div class="zr-kw-kopf"><span>KW</span>${TAGE.map(x => `<span>${x}</span>`).join('')}</div>` + wochen.map(mo => {
        const tage = [...Array(7)].map((_, i) => isoPlus(mo, i)), fremd = iso => iso.slice(0, 7) !== erster.slice(0, 7) ? 'fremd' : '';
        if (z === 'Woche') { const x = zrVersatz('Woche', mo), an = x >= 0 && x <= max;
          return `<button class="zr-woche ${x === v ? 'on' : ''} ${x === 0 ? 'jetzt' : ''}" ${an ? `data-act="zr-setz" data-v="${x}"` : 'disabled'}><b>${kw(mo)}</b>${tage.map(d => `<span class="${fremd(d)}">${+d.slice(8)}</span>`).join('')}</button>`; }
        return `<div class="zr-woche-z"><b>${kw(mo)}</b>${tage.map(d => knopf(d, +d.slice(8), fremd(d))).join('')}</div>`; }).join('');
    } else if (z === 'Monat') {
      kopf = String(k.j); cls = 'zr-kal-monate';
      inhalt = MONATE.map((n, m) => knopf(`${k.j}-${String(m + 1).padStart(2, '0')}-01`, n)).join('');
    } else {
      const J0 = +HEUTE.slice(0, 4), ab = J0 - Math.min(max, 11); kopf = ab === J0 ? String(J0) : `${ab}–${J0}`; cls = 'zr-kal-jahre';   // nur Jahre seit Baustellenbeginn
      inhalt = [...Array(J0 - ab + 1)].map((_, i) => knopf(`${ab + i}-01-01`, ab + i)).join('');
    }
    const schritt = z === 'Jahr' ? 12 : 1, zurueck = z === 'Tag' || z === 'Woche' ? isoPlus(`${k.j}-${String(k.m + 1).padStart(2, '0')}-01`, -1) : `${k.j - schritt}-12-31`;
    const vor = z === 'Tag' || z === 'Woche' ? (k.m === 11 ? `${k.j + 1}-01-01` : `${k.j}-${String(k.m + 2).padStart(2, '0')}-01`) : `${k.j + 1}-01-01`;
    const nochFrueher = z !== 'Jahr' && zrVersatz(z, zurueck) <= max, nochSpaeter = z !== 'Jahr' && zrVersatz(z, vor) >= 0;
    return `<div class="zr-kal glas-panel"><div class="zr-kal-kopf"><button class="zr-pf" data-act="zr-kal-nav" data-d="-1" ${nochFrueher ? '' : 'disabled'} aria-label="zurück">‹</button><b>${kopf}</b>
        <button class="zr-pf" data-act="zr-kal-nav" data-d="1" ${nochSpaeter ? '' : 'disabled'} aria-label="vor">›</button></div>
      <div class="${cls}">${inhalt}</div>
      <div class="zr-kal-fuss"><button class="glas-panel chip" data-act="zr-setz" data-v="0">${{ Tag: 'Heute', Woche: 'Diese Woche', Monat: 'Dieser Monat', Jahr: 'Dieses Jahr' }[z]}</button></div></div>`;
  }
  awDelta(d) { return `<em class="aw-delta ${d > 0 ? 'mehr' : 'weniger'}">${d > 0 ? '▲' : '▼'} ${Math.abs(d)} %</em>`; }
  awWetter(D) {
    return `<div class="glas-panel block"><div class="block-kopf"><b>Wetter-Einfluss</b><span class="leise">letzte 30 Heiztage · kWh je Tag gegen Außentemperatur</span></div>
      <div class="chart-wrap">${streu('aw-streu', D.pkt, D.k, D.d0)}</div>
      <div class="hinweis-k">Je Grad kälter <b>≈ +${de(-D.k, 1)} kWh</b> am Tag (${de(-D.k * D.p, 2)} €). Ab etwa <b>${de(D.null0, 0)} °C</b> wird kaum mehr geheizt.</div></div>`;
  }
  awOhne(D) {
    return `<div class="glas-panel block"><div class="block-kopf"><b>Ohne Automatik</b><span class="leise">wenn alles rund um die Uhr liefe</span></div>
      <div class="hbar"><span class="hb-n">mit Automatik</span><span class="hb-spur"><i style="width:${D.kwh / D.ohne * 100}%;background:var(--s1)"></i></span><span class="hb-w">${de(D.kwh * D.p, 0)} €</span></div>
      <div class="hbar"><span class="hb-n">ohne (24/7)</span><span class="hb-spur"><i style="width:100%;background:var(--s2)"></i></span><span class="hb-w">${de(D.ohne * D.p, 0)} €</span></div>
      <div class="gespart">gespart <b>${de((D.ohne - D.kwh) * D.p, 2)} €</b> · ${de((1 - D.kwh / D.ohne) * 100, 0)} %</div></div>`;
  }
  awVergleich() {
    return `<div class="glas-panel block"><div class="block-kopf"><b>Ölradiator oder Konvektor</b><span class="leise">aus eigenen Messungen</span></div>
      <table class="vergleich"><tr><th></th><th>Ölradiator</th><th>Konvektor</th></tr><tr><td>kWh je Heizstunde</td><td>1,62</td><td><b>1,94</b></td></tr>
        <tr><td>Aufheizen auf 18 °C</td><td><b>48 min</b></td><td>31 min</td></tr><tr><td>Abkühlen nach Aus</td><td>2,1 °C/h</td><td><b>3,4 °C/h</b></td></tr><tr><td>Kosten je Tag</td><td>2,72 €</td><td>3,26 €</td></tr></table>
      <div class="leise fuss">Der Ölradiator braucht länger, hält die Wärme aber besser und verbraucht rund 16 % weniger.</div></div>`;
  }
  awBlock(k, D) {
    return { verbrauch: `<div class="glas-panel block">${this.verbrauchInhalt(D.aw, 'aw', false)}</div>`, abrechnung: this.abrechnung(D.z), geraete: this.jeGeraet(D.z),
      temperaturen: this.temperaturen(), wetter: this.awWetter(D), ohne: this.awOhne(D), hochrechnung: this.hochrechnung(412), vergleich: this.awVergleich(), leistung: this.leistungHeute() }[k] || '';
  }
  awErkenntnisse(D) {
    const top = D.container[0], eff = [...D.container].filter(c => c.h > 0).sort((a, b) => a.proH - b.proH)[0];
    return [
      ['💶', `${de((D.ohne - D.kwh) * D.p, 0)} € gespart`, `Die Automatik hat ${de((1 - D.kwh / D.ohne) * 100, 0)} % gegenüber Dauerbetrieb eingespart.`, 'ohne'],
      top && ['🔥', `${esc(top.b.name)} verbraucht am meisten`, `${de(top.kwh, 0)} kWh · ${de(top.kwh / D.kwh * 100, 0)} % des Verbrauchs ${D.zText}.`, 'geraete'],
      ['🌡', `Je Grad kälter +${de(-D.k, 1)} kWh am Tag`, `Unter ${de(D.null0, 0)} °C außen wird geheizt – kalte Tage kosten rund ${de(-D.k * D.p, 2)} € je Grad.`, 'wetter'],
      D.vergleich[1] > 15 && ['📈', `${D.vergleich[1]} % mehr als ${D.vergleich[0]}`, 'Mehr Heiztage und kältere Morgen – der Kälte-Frühstart hat öfter angefangen.', 'verbrauch'],
      eff && ['⚙', `${esc(eff.b.name)} heizt am sparsamsten`, `${de(eff.proH, 2)} kWh je Heizstunde – mit Ölradiator, der Wärme länger hält.`, 'vergleich'],
    ].filter(Boolean);
  }

  /* ---- WU-0005: Bausteine aus allen Varianten (für 5 · Mischform und 6 · Selbst zusammenstellen) ---- */
  awStueck(k, D, gr = { w: 4, h: 4 }) {
    const max = Math.max(1, ...D.container.map(c => c.kwh)), gespart = (D.ohne - D.kwh) * D.p;
    const kachel = (kk, inhalt) => `<button class="glas-panel aw-k" data-act="aw-detail" data-k="${kk}">${inhalt}</button>`;
    switch (k) {
      case 'betrag': return `<div class="glas-panel aw-betrag"><div><small>KOSTEN ${D.zText.toUpperCase()}</small><b>${de(D.kwh * D.p, 2)} €</b>
          <span>${de(D.kwh, 0)} kWh ${this.awDelta(D.vergleich[1])} <span class="leise">zu ${D.vergleich[0]}</span></span></div>
        <div class="aw-betrag-r"><div><small>GESPART DURCH AUTOMATIK</small><b class="gruen-t">${de(gespart, 0)} €</b></div><div><small>HOCHRECHNUNG HEIZPERIODE</small><b>≈ ${de(D.hoch, 0)} €</b></div></div></div>`;
      case 'kennzahlen': return `<div class="glas-panel kennz vier">${[[`${de(D.kwh, 0)}`, 'kWh', D.vergleich[1]], [`${de(D.kwh * D.p, 0)} €`, 'Kosten', D.vergleich[1]], [`${de(D.container.reduce((a, c) => a + c.h, 0), 0)} h`, 'Heizzeit', D.vergleich[2]], [`${de(gespart, 0)} €`, 'gespart', null]]
        .map(([w, t, d]) => `<div><b>${w}</b><span>${t}</span>${d === null ? '' : this.awDelta(d)}</div>`).join('')}</div>`;
      case 'k-kosten': return kachel('abrechnung', `<small>KOSTEN · ${D.zText.toUpperCase()}</small><b>${de(D.kwh * D.p, 2)} €</b><span>${de(D.kwh, 0)} kWh ${this.awDelta(D.vergleich[1])}</span>`);
      case 'k-gespart': return kachel('ohne', `<small>GESPART</small><b class="gruen-t">${de(gespart, 0)} €</b><span>${de((1 - D.kwh / D.ohne) * 100, 0)} % durch Automatik</span>`);
      case 'k-hoch': return kachel('hochrechnung', `<small>HOCHRECHNUNG</small><b>${de(D.hoch, 0)} €</b><span>bis Ende Heizperiode</span>`);
      case 'k-wer': return kachel('geraete', `<small>WER VERBRAUCHT</small>${D.container.slice(0, 4).map(c => `<div class="aw-rang"><span>${esc(c.b.name)}</span><i style="width:${c.kwh / max * 100}%;background:${BEREICH_FARBEN[c.b.f % 6]}"></i><em>${de(c.kwh, 0)} kWh</em></div>`).join('')}`);
      case 'k-firmen': return kachel('abrechnung', `<small>FIRMEN</small>${D.firmen.map(x => `<div class="aw-zeile"><span>${esc(x.f.name)}</span><b>${de(x.kwh * D.p, 2)} €</b></div>`).join('')}`);
      case 'k-wetter': return kachel('wetter', `<small>WETTER</small><b>+${de(-D.k, 1)}</b><span>kWh je Grad kälter</span>`);
      case 'k-oel': return kachel('vergleich', `<small>ÖLRADIATOR</small><b>−16 %</b><span>gegenüber Konvektor</span>`);
      case 'k-temp': return kachel('temperaturen', `<small>TEMPERATUREN JETZT</small>${this.d.bereiche.filter(b => !b.pumpe && b.t !== null).slice(0, 3).map(b => `<div class="aw-zeile"><span>${esc(b.name)}</span><b>${de(b.t)} °C</b></div>`).join('')}`);
      case 'rangliste': if (gr.w <= 2) return `<div class="glas-panel block aw-klein"><div class="block-kopf"><b>Wer verbraucht was</b><span class="leise">Top 3</span></div>
          ${D.container.slice(0, 3).map((c, i) => `<button class="aw-rang aw-rang-z" data-act="container" data-id="${c.b.id}"><span><em>${i + 1}</em> ${esc(c.b.name)}</span><i style="width:${c.kwh / max * 100}%;background:${BEREICH_FARBEN[c.b.f % 6]}"></i><em>${de(c.kwh, 0)} kWh · ${de(c.eur, 2)} €</em></button>`).join('')}</div>`;
        return `<div class="glas-panel block"><div class="block-kopf"><b>Wer verbraucht was</b><span class="leise">${D.zText} · antippen öffnet den Container</span></div>
        <div class="aw-tab-kopf"><span></span><span>kWh</span><span>€</span><span>Heizzeit</span><span>kWh/h</span><span>jetzt</span></div>
        ${D.container.map((c, i) => `<button class="aw-tab-zeile" data-act="container" data-id="${c.b.id}"><span class="aw-tab-name"><em>${i + 1}</em>${esc(c.b.name)}${D.alle ? `<small>${esc(c.l.name)}</small>` : ''}
            <i style="width:${c.kwh / max * 100}%;background:${BEREICH_FARBEN[c.b.f % 6]}"></i></span><b>${de(c.kwh, 0)}</b><span>${de(c.eur, 2)}</span><span>${de(c.h, 1)} h</span><span>${de(c.proH, 2)}</span><span>${c.temp !== null ? de(c.temp) + '°' : '–'}</span></button>`).join('')}</div>`;
      case 'erkenntnisse': return `<div class="aw-karten">${this.awErkenntnisse(D).map(([i, t, x, kk]) => `<button class="glas-panel aw-karte" data-act="aw-detail" data-k="${kk}"><span>${i}</span><b>${t}</b><small>${x}</small></button>`).join('')}</div>`;
      case 'verlauf': return this.awDiagramm(D, gr);   // FE-0006: füllt die Kachel, ohne eigene Zeitraum-Leiste
      case 'rechnung': return `<div class="glas-panel block aw-rechnung"><div class="block-kopf"><b>Aufteilung</b><span class="leise">je Firma und Container</span></div>
        ${D.firmen.map(x => `<div class="aw-r-firma"><div class="aw-r-kopf"><b>${esc(x.f.name)}</b><b>${de(x.kwh * D.p, 2)} €</b></div>
          ${x.c.map(c => `<div class="aw-r-zeile"><span>${esc(c.b.name)}</span><span class="leise">${de(c.kwh, 1)} kWh × ${de(D.p, 2)} €</span><span>${de(c.eur, 2)} €</span></div>`).join('')}</div>`).join('')}
        <div class="aw-r-summe"><span>Summe</span><b>${de(D.kwh * D.p, 2)} €</b></div>
        <div class="aw-r-knoepfe"><button class="glas-panel chip" data-act="csv">⇩ Abrechnung als CSV</button><button class="glas-panel chip" data-act="sheet" data-s="bericht">✉ Bericht ansehen</button></div></div>`;
      case 'links': return `<div class="glas-panel liste">${[['abrechnung', '💶 Abrechnung nach Firma'], ['geraete', '♨ Je Gerät'], ['temperaturen', '🌡 Temperaturen'], ['wetter', '🌦 Wetter-Einfluss'], ['vergleich', '⚖ Ölradiator oder Konvektor'], ['hochrechnung', '📅 Hochrechnung Heizperiode']]
        .map(([kk, t]) => `<button class="zeile" data-act="aw-detail" data-k="${kk}"><span>${t}</span><span class="chev">›</span></button>`).join('')}</div>`;
      case 'wetter': if (gr.w <= 1) return this.awStueck('k-wetter', D); return this.awBlock(k, D);
      default: return this.awBlock(k, D);   // ganze Blöcke: abrechnung, geraete, temperaturen, wetter, ohne, hochrechnung, vergleich, leistung
    }
  }

  /* 6 · Selbst zusammenstellen: Bausteine aus allen Varianten ein/aus, Reihenfolge ↑↓, schmal/breit – gemerkt je Browser */
  v_auswertung_6() {
    const D = this.awDaten(), L = this.awAuswahl(), bearb = this.s.awBearb, layout = this.s.awLayout;
    const kopf = `<span class="aw-knoepfe"><button class="glas-panel chip ${layout ? 'amber' : ''}" data-act="aw-layout">${layout ? '✓ Fertig' : '✥ Layout'}</button>
      <button class="glas-panel chip ${bearb ? 'amber' : ''}" data-act="aw-bearb">${bearb ? '✓ Fertig' : '✎ Anpassen'}</button></span>`;
    const gr = (i, x, k, max) => `<span class="aw-gr"><small>${k === 'w' ? 'Breite' : 'Höhe'}</small><button class="glas-panel chip" data-act="aw-gr" data-i="${i}" data-k="${k}" data-d="-1" ${x[k] <= 1 ? 'disabled' : ''}>−</button><b>${x[k]}</b><button class="glas-panel chip" data-act="aw-gr" data-i="${i}" data-k="${k}" data-d="1" ${x[k] >= max ? 'disabled' : ''}>+</button></span>`;
    if (bearb) return `${this.awKopf(D, kopf)}
      <div class="glas-panel block aw-vorlagen"><div class="block-kopf"><b>Vorlage</b><span class="leise">stellt Bausteine, Reihenfolge und Größe ein – danach frei anpassbar</span></div>
        <div class="aw-vorlagen-k">${Object.entries(AW_VORLAGEN).map(([k, [t]]) => `<button class="glas-panel chip" data-act="aw-vorlage" data-v="${k}">${t}</button>`).join('')}</div></div>
      <div class="glas-panel liste aw-wahl"><div class="gruppe">Bausteine · ein/aus, Reihenfolge, Größe (nur Stufen, die zum Inhalt passen)</div>
        ${L.map((x, i) => `<div class="zeile"><div><b>${AW_BAUSTEINE[x.k][0]}</b><div class="leise">${AW_BAUSTEINE[x.k][1]}</div></div>
          <div class="aw-wahl-k"><button class="glas-panel chip" data-act="aw-hoch" data-i="${i}" ${i ? '' : 'disabled'} aria-label="nach oben">↑</button><button class="glas-panel chip" data-act="aw-runter" data-i="${i}" ${i < L.length - 1 ? '' : 'disabled'} aria-label="nach unten">↓</button>
            <div class="seg klein">${awStufen(x.k).map(([n, w, h]) => `<button data-act="aw-stufe" data-i="${i}" data-v="${n}" class="${x.st === n ? 'on' : ''}" title="${w}×${h}">${n}</button>`).join('')}</div>${schalter(x.an, 'aw-an', `data-i="${i}"`)}</div></div>`).join('')}
        <button class="zeile" data-act="aw-standard"><span class="blau">Auf Vorschlag zurücksetzen</span></button></div>`;
    const an = L.filter(x => x.an);
    return `${this.awKopf(D, kopf)}
      ${layout ? '<div class="leise aw-hinweis">Kachel am Griff ⠿ ziehen zum Verschieben · am Griff ◢ ziehen für die Größe (rastet im Raster ein) · ✕ blendet aus</div>' : ''}
      ${an.length ? `<div class="aw-raster ${layout ? 'layout' : ''}">${an.map((x, i) => `<div class="aw-frei-s" data-i="${i}" style="--w:${x.w};--h:${x.h}">
          <div class="aw-inhalt">${this.awStueck(x.k, D, x)}</div>
          ${layout ? `<div class="aw-ueber"><span class="aw-griff" data-zug="move" title="verschieben">⠿</span><span class="aw-name">${AW_BAUSTEINE[x.k][0]} · <b class="aw-mass">${x.st}</b></span>
            <button class="aw-x" data-act="aw-weg" data-i="${i}" aria-label="ausblenden">✕</button><span class="aw-groesse" data-zug="size" title="Größe ändern">◢</span></div>` : ''}</div>`).join('')}</div>`
        : '<div class="leer">Nichts ausgewählt – „✎ Anpassen“</div>'}`;
  }
  /* Layout-Modus: Kacheln ziehen (Reihenfolge) und Größe ziehen (rastet im Raster ein) – Maus und Finger (Pointer-Ereignisse) */
  zugStart(ev) {
    const griff = ev.target.closest && ev.target.closest('[data-zug]'); if (!griff || !this.root.contains(griff)) return;
    const kachel = griff.closest('.aw-frei-s'), raster = kachel.parentElement, art = griff.dataset.zug;
    const an = this.awAuswahl().filter(x => x.an), item = an[+kachel.dataset.i]; if (!item) return;
    ev.preventDefault();
    const cs = getComputedStyle(raster), spalten = cs.gridTemplateColumns.split(' ').length, luecke = parseFloat(cs.columnGap) || 12;
    const breite = (raster.getBoundingClientRect().width - luecke * (spalten - 1)) / spalten, hoehe = parseFloat(cs.gridAutoRows) || 110;
    const x0 = ev.clientX, y0 = ev.clientY, w0 = item.w, h0 = item.h, mass = kachel.querySelector('.aw-mass');
    kachel.classList.add(art === 'move' ? 'zieht' : 'waechst');
    let ziel = null;
    const bewegt = e => {
      if (art === 'size') {
        const st = awStufe(item.k, w0 + (e.clientX - x0) / (breite + luecke), h0 + (e.clientY - y0) / (hoehe + luecke));   // rastet auf Stufen ein (FE-0006)
        Object.assign(item, { w: st[1], h: st[2], st: st[0] });
        kachel.style.setProperty('--w', item.w); kachel.style.setProperty('--h', item.h); if (mass) mass.textContent = item.st;
      } else {
        kachel.style.transform = `translate(${e.clientX - x0}px, ${e.clientY - y0}px)`;
        kachel.style.pointerEvents = 'none';
        const unter = document.elementFromPoint(e.clientX, e.clientY), k = unter && unter.closest && unter.closest('.aw-frei-s');
        raster.querySelectorAll('.aw-frei-s.ziel').forEach(x => x.classList.remove('ziel'));
        ziel = k && k !== kachel && raster.contains(k) ? k : null; if (ziel) ziel.classList.add('ziel');
      }
    };
    const fertig = () => {
      window.removeEventListener('pointermove', bewegt); window.removeEventListener('pointerup', fertig); window.removeEventListener('pointercancel', fertig);
      if (art === 'move' && ziel) {
        const L = this.awAuswahl(), nach = an[+ziel.dataset.i], von = L.indexOf(item);
        L.splice(von, 1); L.splice(L.indexOf(nach) + (+ziel.dataset.i > +kachel.dataset.i ? 1 : 0), 0, item);
      }
      this.awMerken(); this.render();
    };
    window.addEventListener('pointermove', bewegt); window.addEventListener('pointerup', fertig); window.addEventListener('pointercancel', fertig);
  }
  awAuswahl() {
    if (!this.s.awListe) { let l = null; try { l = JSON.parse(localStorage.getItem('baustelle-aw-bausteine') || 'null'); } catch (e) { l = null; }
      if (!Array.isArray(l)) { this.awVorlage('misch'); return this.s.awListe; }
      const standard = AW_STANDARD.map(([k, an, b]) => ({ k, an, w: b ? 4 : 2, h: AW_HOEHE[k] || 2 }));
      const bekannt = Array.isArray(l) ? l.filter(x => x && AW_BAUSTEINE[x.k]).map(x => ({ k: x.k, an: !!x.an, w: x.w || (x.b ? 4 : 2), h: x.h || AW_HOEHE[x.k] || 2 })) : [];
      this.s.awListe = [...bekannt, ...standard.filter(x => !bekannt.some(y => y.k === x.k))].map(x => this.awGross(x)); }
    return this.s.awListe;
  }
  awVorlage(name) {
    const v = AW_VORLAGEN[name][1], rest = Object.keys(AW_BAUSTEINE).filter(k => !v.some(x => x[0] === k));
    this.s.awListe = [...v.map(([k, w, h]) => ({ k, an: true, w, h })), ...rest.map(k => ({ k, an: false, w: 4, h: AW_HOEHE[k] || 2 }))].map(x => this.awGross(x));
    this.awMerken();
  }
  awGross(x) { const st = awStufe(x.k, x.w, x.h); return { ...x, w: st[1], h: st[2], st: st[0] }; }   // FE-0006: auf eine Stufe
  /* FE-0006: Verbrauch als Kachel – gestapelt je Container oder Firma, füllt die Kachel, Achsen kompakt, Legende in einer Zeile */
  awDiagramm(D, gr) {
    const gruppe = this.s.awGruppe === 'firma' ? 'firma' : 'container', z = D.z, n0 = verbrauch(this.d.bereiche, null, z).length;
    const reihen = gruppe === 'firma'
      ? D.firmen.map((x, i) => ({ name: x.f.name, farbe: ['var(--s1)', 'var(--s2)', 'var(--s3)', '#bf5af2'][i % 4], v: x.c.map(c => verbrauch(c.l.bereiche, c.b.id, z)).reduce((a, v) => a.map((q, j) => q + (v[j] || 0)), Array(n0).fill(0)) }))
      : D.container.map(c => ({ name: c.b.name, farbe: BEREICH_FARBEN[c.b.f % 6], v: verbrauch(c.l.bereiche, c.b.id, z) }));
    const n = Math.max(1, ...reihen.map(r => r.v.length)), summen = [...Array(n)].map((_, i) => reihen.reduce((a, r) => a + (r.v[i] || 0), 0));
    const W = gr.w * 160, H = Math.max(90, gr.h * 110 + (gr.h - 1) * 12 - 78), L = 30, R = 6, T = 6, U = 16, hi = Math.max(...summen) * 1.1 || 1;
    const stufe = hi > 200 ? 100 : hi > 40 ? 20 : hi > 12 ? 5 : hi > 4 ? 2 : 1, y = v => T + (1 - v / hi) * (H - T - U), bw = (W - L - R) / n;
    const label = i => z === 'Tag' ? String(i).padStart(2, '0') : z === 'Woche' ? TAGE[i] : z === 'Jahr' ? MONATE[i] : String(i + 1), jedes = Math.max(1, Math.ceil(n / (gr.w * 4)));
    const raster = [...Array(Math.floor(hi / stufe) + 1)].map((_, q) => q * stufe).map(v => `<line x1="${L}" x2="${W - R}" y1="${y(v).toFixed(1)}" y2="${y(v).toFixed(1)}" class="gr"/><text x="${L - 4}" y="${(y(v) + 3).toFixed(1)}" class="ax" text-anchor="end">${v}</text>`).join('');
    const bars = [...Array(n)].map((_, i) => { let unten = 0;
      return reihen.map(r => { const v = r.v[i] || 0; if (!v) return ''; const y1 = y(unten + v), y0 = y(unten); unten += v;
        return `<rect x="${(L + i * bw + bw * .12).toFixed(1)}" y="${y1.toFixed(1)}" width="${(bw * .76).toFixed(1)}" height="${Math.max(0, y0 - y1).toFixed(1)}" fill="${r.farbe}" rx="1.5"><title>${label(i)} · ${esc(r.name)} · ${de(v, 1)} kWh</title></rect>`; }).join('')
        + (i % jedes === 0 ? `<text x="${(L + i * bw + bw / 2).toFixed(1)}" y="${H - 3}" class="ax" text-anchor="middle">${label(i)}</text>` : ''); }).join('');
    return `<div class="glas-panel aw-dia"><div class="aw-dia-kopf"><b>Verbrauch</b><span class="leise">${D.zText} · ${de(D.kwh, 0)} kWh</span>
        <div class="seg klein">${[['container', 'Container'], ['firma', 'Firma']].map(([k, t]) => `<button data-act="aw-gruppe" data-v="${k}" class="${gruppe === k ? 'on' : ''}">${t}</button>`).join('')}</div></div>
      <svg class="aw-dia-svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet">${raster}${bars}</svg>
      <div class="aw-dia-leg">${reihen.map(r => `<span><i style="background:${r.farbe}"></i>${esc(r.name)}</span>`).join('')}<span class="leise">kWh je ${{ Tag: 'Stunde', Woche: 'Tag', Monat: 'Tag', Jahr: 'Monat' }[z]}</span></div></div>`;
  }
  awMerken() { try { localStorage.setItem('baustelle-aw-bausteine', JSON.stringify(this.s.awListe)); } catch (e) { /* egal */ } }

  /* ---- Pumpen (neu 0.8, wie 0.6.3 eigener Reiter) ---- */
  v_pumpen() {
    const P = this.d.bereiche.filter(b => b.pumpe), e = this.d.e, pc = this.s.pchart || 'pumpzeit';
    const st = (k, d, fmt) => `<span class="stepper"><button data-act="st" data-k="${k}" data-d="${-d}">−</button><b>${fmt(e[k])}</b><button data-act="st" data-k="${k}" data-d="${d}">+</button></span>`;
    const pumpen = P.flatMap(b => b.geraete), W = this.d.warnungen.filter(w => !w.stumm && P.some(b => b.id === w.b));
    return `${this.kopf('Pumpen', 'ÖWG DOBL ZWARING', NEU)}
      <div class="glas-panel kennz">${[['Zyklen heute', P.reduce((a, b) => a + b.zyklen, 0)], ['Laufzeit', P[0].lauf], ['Pumpen an', `${pumpen.filter(g => g.an).length} von ${pumpen.length}`]].map(([k, v]) => `<div><b>${v}</b><span>${k}</span></div>`).join('')}</div>
      ${W.map(w => `<button class="glas-panel warn-zeile ${w.stufe}" data-act="w-hin" data-id="${w.b}"><b>⚠ ${esc(this.bName(w.b))}: ${esc(w.titel)}</b><span class="leise">${w.seit} · ${esc(w.hilfe)}</span></button>`).join('')}
      ${P.map(b => `<div class="glas-panel block"><div class="block-kopf"><b>${esc(b.name)}</b><button class="chip glas-panel" data-act="container" data-id="${b.id}">öffnen ›</button></div>
        <div class="p-schacht"><div class="p-illu">${illu(b)}</div><div>${b.geraete.map(g => `<div class="zeile geraet"><span class="g-ic ${g.an ? 'an' : ''}">💧</span><div class="g-t"><b>${esc(g.n)}</b><span class="leise">${g.an ? `läuft · ${de(g.kw, 2)} kW` : 'aus'}</span></div></div>`).join('')}
          <div class="leise">heute ${b.zyklen} Zyklen · ${b.lauf} gelaufen · längster Lauf ${b.laengster}</div></div></div>
        <div class="seg">${[['pumpzeit', 'Pumpzeit'], ['zyklen', 'Zyklen'], ['verbrauch', 'Verbrauch']].map(([k, t]) => `<button data-act="p-chart" data-v="${k}" class="${k === pc ? 'on' : ''}">${t}</button>`).join('')}</div>
        <div class="chart-wrap">${pc === 'zyklen' ? balken('pz-' + b.id, b.zyk7, TAGE, 'Zyklen', 0) : pc === 'verbrauch' ? balken('pv-' + b.id, b.kwh7, TAGE, 'kWh') : balken('ph-' + b.id, b.h7, TAGE, 'h')}</div></div>`).join('')}
      <div class="glas-panel block"><div class="block-kopf"><b>Überwachung</b><span class="leise">wann eine Pumpe gemeldet wird</span></div>
        <div class="zeile"><div><b>Offline</b><div class="leise">Shelly antwortet nicht (Stromausfall?) – melden nach</div></div>${st('offline_min', 1, v => `${v} min`)}</div>
        <div class="zeile"><div><b>Trockenlauf</b><div class="leise">Pumpe läuft, zieht aber weniger als</div></div>${st('trocken_w', 5, v => `${v} W`)}</div>
        <div class="zeile"><div><b>Dauerlauf</b><div class="leise">läuft ohne Pause länger als</div></div>${st('dauer_min', 5, v => `${v} min`)}</div>
        <div class="zeile"><div><b>Schaltet oft</b><div class="leise">mehr Zyklen je Stunde als</div></div>${st('zyklen_h', 1, v => `${v}`)}</div>
        <button class="zeile" data-act="tab-einst"><span class="blau">Welche Meldungen aufs Handy gehen</span><span class="chev">Einstellungen ›</span></button>
        ${erkl(e.erklaer, 'Pumpen werden nie geschaltet, nur überwacht. Ein Zyklus ist einmal an und wieder aus. Viele Zyklen je Stunde deuten auf einen hängenden Schwimmer oder steigendes Grundwasser, Trockenlauf auf einen leeren Schacht oder eine verstopfte Pumpe.')}</div>`;
  }
  /* Temperaturen: heute stündlich, 7/30 Tage als Tagesmittel – alle Container mit Fühler und außen (neu 0.8) */
  temperaturen() {
    const tv = this.s.tv || 'heute', C = this.d.bereiche.filter(b => !b.pumpe && b.t !== null && !b.offline), r = zufall(23);
    const farbe = b => BEREICH_FARBEN[b.f % BEREICH_FARBEN.length], aussen = { name: 'Außen', farbe: 'var(--ink2)', aussen: true };
    let inhalt;
    if (tv === 'heute') inhalt = linien('tp-heute', [...C.map(b => ({ name: b.name, farbe: farbe(b), v: b.innen })), { ...aussen, v: this.d.aussen }], [...STUNDEN, '24'], 6, i => `${String(i).padStart(2, '0')}:00`);
    else {
      const n = tv === '7' ? 7 : 30, tage = [...Array(n)].map((_, k) => { const d = new Date(HEUTE + 'T12:00:00'); d.setDate(d.getDate() - n + 1 + k); return d.toISOString().slice(0, 10); });
      const aussenM = tage.map((_, k) => 8 - k * (n === 7 ? .5 : .18) + (r() - .5) * 3);
      const reihen = C.map(b => ({ name: b.name, farbe: farbe(b), v: aussenM.map(a => Math.max(a + 3, (b.soll ?? this.d.e.soll) - 3.2 + (r() - .5) * 1.4)) }));
      inhalt = linien(`tp-${n}`, [...reihen, { ...aussen, v: aussenM }], tage.map(kurzDatum), n === 7 ? 1 : 5, i => `${wtag(tage[i])} ${kurzDatum(tage[i])} · Tagesmittel`);
    }
    return `<div class="glas-panel block"><div class="block-kopf"><b>Temperaturen</b>${NEU}</div>
      <div class="seg">${[['heute', 'Heute'], ['7', '7 Tage'], ['30', '30 Tage']].map(([k, t]) => `<button data-act="tv" data-v="${k}" class="${tv === k ? 'on' : ''}">${t}</button>`).join('')}</div>
      <div class="chart-wrap">${inhalt}</div>
      <div class="leise">${tv === 'heute' ? 'Alle Container mit Fühler, gestrichelt außen.' : 'Tagesmittel je Container, gestrichelt außen.'} Container ohne Fühler fehlen.</div></div>`;
  }
  leistungHeute() {
    const Q = this.d.bereiche.map(b => ({ name: b.name, farbe: BEREICH_FARBEN[b.f % BEREICH_FARBEN.length], v: verbrauch(this.d.bereiche, b.id, 'Tag') }));
    return `<div class="glas-panel block"><div class="block-kopf"><b>Leistung heute</b>${NEU}</div>
      <div class="chart-wrap">${flaeche('kw-heute', Q, STUNDEN, 'kW', 6)}</div><div class="leise">kW je Stunde (Mittel), gestapelt nach Container – oben die ganze Baustelle.</div></div>`;
  }
  jeGeraet(z) {
    const h = { Tag: 1, Woche: 7, Monat: 30, Jahr: 150 }[z], zeilen = this.d.bereiche.flatMap(b => b.geraete.map((g, k) => {
      const r = zufall(b.f * 31 + k * 7 + 1), mittel = g.kw * (g.typ === 'Pumpe' ? .95 : .82 + r() * .1), std = (g.typ === 'Pumpe' ? 1.2 : g.typ === 'Steckdose' ? 2.5 : 6.5) * h * (.8 + r() * .4) * (b.offline ? .4 : 1);
      return { b, g, mittel, std, kwh: mittel * std }; }));
    return `<div class="glas-panel block"><div class="block-kopf"><b>Je Gerät</b>${NEU}<span class="leise">${z === 'Tag' ? 'heute' : `dieser ${z === 'Woche' ? 'Woche' : z === 'Monat' ? 'Monat' : 'Jahr'}`}</span></div>
      <div class="tab-scroll"><table class="vergleich je-geraet"><tr><th>Gerät</th><th>Ø kW</th><th>Stunden</th><th>kWh</th><th>€</th></tr>
        ${zeilen.map(({ b, g, mittel, std, kwh }) => `<tr><td><b>${esc(g.n)}</b><div class="leise">${esc(b.name)} · ${g.typ}</div></td><td>${de(mittel, 2)}</td><td>${de(std, 1)}</td><td>${de(kwh, 1)}</td><td>${de(kwh * this.d.e.preis, 2)}</td></tr>`).join('')}</table></div>
      ${erkl(this.d.e.erklaer, 'Ø kW ist die mittlere Leistung, während das Gerät läuft – so sieht man, ob ein Heizkörper schwächer ist als angegeben. Stunden = Zeit mit mehr als 50 W.')}</div>`;
  }
  hochrechnung(kwhBisher) {
    const bs = this.d.bs, p = this.d.e.preis, [von, bis] = bs.hp, mon = (bis - von + 12) % 12 + 1;
    const bisher = 0.75, rest = mon - bisher, mit = kwhBisher / bisher * mon * 1.35, ohne = mit * 4.6;
    return `<div class="glas-panel block"><div class="block-kopf"><b>Hochrechnung Heizperiode</b>${NEU}<span class="leise">${MONATE[von - 1]}–${MONATE[bis - 1]} · ${mon} Monate</span></div>
      <div class="hbar"><span class="hb-n">bisher</span><span class="hb-spur"><i style="width:${kwhBisher / ohne * 100}%;background:var(--s3)"></i></span><span class="hb-w">${de(kwhBisher * p, 0)} €</span></div>
      <div class="hbar"><span class="hb-n">mit Automatik</span><span class="hb-spur"><i style="width:${mit / ohne * 100}%;background:var(--s1)"></i></span><span class="hb-w">${de(mit * p, 0)} €</span></div>
      <div class="hbar"><span class="hb-n">ohne (24/7)</span><span class="hb-spur"><i style="width:100%;background:var(--s2)"></i></span><span class="hb-w">${de(ohne * p, 0)} €</span></div>
      <div class="gespart">bis ${MONATE[bis - 1]} rund <b>${de(mit, 0)} kWh</b> · ${de(mit * p, 0)} € – gespart ≈ <b>${de((ohne - mit) * p, 0)} €</b></div>
      <div class="leise">noch ${de(rest, 1)} Monate · aus dem bisherigen Verbrauch je Heiztag und der Kälte der Monate (kältere Monate zählen mehr). Heizperiode unter Einstellungen › Baustelle.</div>
      ${erkl(this.d.e.erklaer, 'Die Hochrechnung nimmt den Verbrauch je Heiztag bisher und rechnet ihn auf die Heizperiode hoch. Endet die Baustelle früher, zählt nur bis zum Ende.')}</div>`;
  }

  v_verlauf() { return this.v_verlauf_5(); }   // WU-0006: Archiv + Protokoll (abgenommen 01.10.2026)


  /* ================= WU-0006: vier Varianten des Verlaufs (Vorführ-Leiste „Verlauf“) ================= */
  vlMonate(b) { const M = ['Okt', 'Nov', 'Dez', 'Jän', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep']; return M.map(m => b.verlauf[m] || 0); }
  vlFunke(werte, farbe, w = 120, h = 34) {
    const max = Math.max(1, ...werte), bw = w / werte.length;
    return `<svg class="vl-funke" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none">${werte.map((v, i) => `<rect x="${(i * bw + 1).toFixed(1)}" y="${(h - v / max * h).toFixed(1)}" width="${(bw - 2).toFixed(1)}" height="${(v / max * h).toFixed(1)}" rx="1.5" fill="${farbe}" opacity="${v ? .9 : .15}"/>`).join('')}</svg>`;
  }
  vlSumme() { const BS = this.d.baustellen; return { kwh: BS.reduce((a, b) => a + b.kwh, 0), eur: BS.reduce((a, b) => a + b.eur, 0), gespart: BS.reduce((a, b) => a + (b.gespart || 0), 0) * this.d.e.preis, n: BS.length, aktiv: BS.filter(b => b.aktiv).length }; }
  vlProtokollKnopf() { return `<button class="glas-panel chip" data-act="sheet" data-s="vl-protokoll">📜 Protokoll</button>`; }
  /* Tageswerte für Kalender und Chronik (Beispiel): kWh je Tag aus den Monatswerten verteilt, nur Werktage mit Heizung */
  vlTage(b) {
    const r = zufall(b.name.length * 7 + 3), tage = [], heute = new Date(HEUTE + 'T12:00:00');
    for (let k = 364; k >= 0; k--) { const t = new Date(heute); t.setDate(t.getDate() - k); const mon = ['Jän', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'][t.getMonth()];
      const wt = t.getDay(), monat = b.verlauf[mon] || 0, kwh = monat && wt > 0 && wt < 6 ? monat / 21 * (.6 + r() * .8) : 0; tage.push({ iso: t.toISOString().slice(0, 10), wt, kwh }); }
    return tage;
  }

  /* 1 · Archiv: Baustellen als große Karten mit Mini-Verlauf, Summe oben, Protokoll über Knopf */
  v_verlauf_1(teil = false) {
    const BS = this.d.baustellen, S = this.vlSumme(), sortiert = [...BS].sort((a, b) => (b.aktiv - a.aktiv));
    return `${teil ? '' : this.kopf('Verlauf', 'BAUSTELLEN', this.vlProtokollKnopf())}
      <div class="glas-panel kennz vier">${[[S.n, `Baustellen · ${S.aktiv} aktiv`], [de(S.kwh, 0), 'kWh gesamt'], [`${de(S.eur, 0)} €`, 'Kosten gesamt'], [`${de(S.gespart, 0)} €`, 'gespart']].map(([w, t]) => `<div><b>${w}</b><span>${t}</span></div>`).join('')}</div>
      <div class="vl-archiv">${sortiert.map(b => { const i = BS.indexOf(b), farbe = `var(--s${i + 1})`;
        return `<button class="glas-panel vl-karte ${b.aktiv ? 'aktiv' : ''}" data-act="bs-oeffnen" data-i="${i}">
          <div class="bs-kopf"><b>${esc(b.name)}</b><span class="badge ${b.aktiv ? 'gruen' : ''}">${b.aktiv ? 'aktiv' : 'abgeschlossen'}</span></div>
          <div class="leise">${b.zeit} · ${b.container} Container · ${b.heiztage} Heiztage</div>
          ${this.vlFunke(this.vlMonate(b), farbe)}<div class="vl-monate"><span>Okt</span><span>Sep</span></div>
          <div class="vl-zahlen"><div><b>${de(b.kwh, 0)}</b><small>kWh</small></div><div><b>${de(b.eur, 0)} €</b><small>Kosten</small></div><div><b>${de(b.kwh / b.heiztage, 1)}</b><small>kWh/Heiztag</small></div><div><b class="gruen-t">${de((b.gespart || 0) * this.d.e.preis, 0)} €</b><small>gespart</small></div></div>
          <span class="leise vl-mehr">${b.aktiv ? 'Übersicht ›' : 'ansehen ›'}</span></button>`; }).join('')}</div>`;
  }
  /* 2 · Chronik: Protokoll als Zeitleiste nach Tagen mit Filter und Suche, Tagessumme je Tag; Baustellen kompakt daneben */
  v_verlauf_2(teil = false) {
    const BS = this.d.baustellen, f = this.s.pfilter || 'alle', q = (this.s.vlSuche || '').toLowerCase();
    const ART = { warnung: ['⚠', 'var(--rot)'], ok: ['✓', '#30d158'], schalten: ['⏻', 'var(--amber)'], wetter: ['☁', 'var(--blau)'], nachricht: ['✉', 'var(--ink2)'], einstellung: ['⚙', 'var(--ink2)'] };
    const passt = e => (f === 'alle' || e[2] === f || (f === 'warnung' && e[2] === 'ok') || (f === 'schalten' && e[2] === 'einstellung')) && (!q || `${e[3] ? this.bName(e[3]) : ''} ${e[4]}`.toLowerCase().includes(q));
    const tage = []; for (const e of this.d.protokoll.filter(passt)) { const t = tage.at(-1); if (t && t.tag === e[0]) t.e.push(e); else tage.push({ tag: e[0], e: [e] }); }
    const r = zufall(5);
    return `${teil ? '' : this.kopf('Verlauf', 'CHRONIK')}
      <div class="vl-chronik ${teil ? 'ohne-seite' : ''}"><div>
        <div class="glas-panel vl-filter"><input class="vl-suche" placeholder="Suchen (Container, Text) …" value="${esc(this.s.vlSuche || '')}" data-vls>
          <div class="vb-wer">${[['alle', 'Alle'], ['warnung', '⚠ Warnungen'], ['schalten', '⏻ Schalten'], ['wetter', '☁ Wetter'], ['nachricht', '✉ Nachrichten']].map(([k, t]) => `<button data-act="pfilter" data-v="${k}" class="${f === k ? 'on' : ''}">${t}</button>`).join('')}</div></div>
        ${tage.length ? tage.map(t => { const kwh = 6 + r() * 18;
          return `<div class="glas-panel vl-tag"><div class="vl-tag-kopf"><b>${t.tag}</b><span class="leise">${de(kwh, 1)} kWh · ${de(kwh * this.d.e.preis, 2)} € · ${t.e.length} Einträge</span></div>
            ${t.e.map(e => { const [ic, farbe] = ART[e[2]] || ['•', 'var(--ink2)']; return `<div class="vl-ereignis"><span class="zeit">${e[1]}</span><span class="vl-punkt" style="background:${farbe}">${ic}</span><div>${e[3] ? `<b>${esc(this.bName(e[3]))}</b> ` : ''}<span class="leise">${esc(e[4])}</span></div></div>`; }).join('')}</div>`; }).join('')
          : '<div class="glas-panel block"><div class="leer">Keine Einträge</div></div>'}</div>
        ${teil ? '' : `<div class="vl-seite"><div class="glas-panel liste"><div class="gruppe">Baustellen</div>${BS.map((b, i) => `<button class="zeile" data-act="bs-oeffnen" data-i="${i}"><span><i class="farbpunkt" style="background:var(--s${i + 1})"></i>${esc(b.name)}</span><span class="leise">${de(b.kwh, 0)} kWh · ${b.aktiv ? 'aktiv' : 'fertig'} ›</span></button>`).join('')}</div></div>`}
      </div>`;
  }
  /* 3 · Vergleich: sortierbare Tabelle aller Baustellen, 12-Monats-Diagramm */
  v_verlauf_3(teil = false) {
    const BS = this.d.baustellen, sp = this.s.vlSort || 'tag', ab = this.s.vlAb !== false;
    const spalten = [['name', 'Baustelle'], ['tag', 'kWh/Heiztag'], ['monat', '€/Monat'], ['kwh', 'kWh'], ['eur', '€'], ['heiztage', 'Heiztage'], ['container', 'Cont.']];
    const wert = (b, k) => ({ name: b.name, tag: b.kwh / b.heiztage, monat: b.eur / b.monate, kwh: b.kwh, eur: b.eur, heiztage: b.heiztage, container: b.container })[k];
    const zeilen = BS.map((b, i) => ({ b, i })).sort((x, y) => { const a = wert(x.b, sp), c = wert(y.b, sp); return (typeof a === 'string' ? a.localeCompare(c) : a - c) * (ab ? -1 : 1); });
    const besterTag = Math.min(...BS.map(b => b.kwh / b.heiztage));
    const MON = ['Okt', 'Nov', 'Dez', 'Jän', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep'], reihen = BS.map((b, i) => ({ name: b.name, v: this.vlMonate(b), farbe: `var(--s${i + 1})` })).filter(x => x.v.some(Boolean));
    return `${teil ? '' : this.kopf('Verlauf', 'VERGLEICH DER BAUSTELLEN', this.vlProtokollKnopf())}
      <div class="glas-panel block vl-tabelle"><div class="block-kopf"><b>Alle Baustellen</b><span class="leise">Spalte antippen sortiert · kWh je Heiztag ist am besten vergleichbar</span></div>
        <div class="vl-tab-kopf">${spalten.map(([k, t]) => `<button data-act="vl-sort" data-v="${k}" class="${sp === k ? 'on' : ''}">${t}${sp === k ? (ab ? ' ▼' : ' ▲') : ''}</button>`).join('')}</div>
        ${zeilen.map(({ b, i }) => `<button class="vl-tab-zeile" data-act="bs-oeffnen" data-i="${i}"><span class="vl-tab-name"><i class="farbpunkt" style="background:var(--s${i + 1})"></i>${esc(b.name)}<small>${b.aktiv ? 'aktiv' : b.zeit}</small></span>
          <b class="${b.kwh / b.heiztage === besterTag ? 'gruen-t' : ''}">${de(b.kwh / b.heiztage, 1)}</b><span>${de(b.eur / b.monate, 0)}</span><span>${de(b.kwh, 0)}</span><span>${de(b.eur, 0)}</span><span>${b.heiztage}</span><span>${b.container}</span></button>`).join('')}</div>
      <div class="glas-panel block"><div class="block-kopf"><b>Letzte 12 Monate</b><span class="leise">kWh je Monat, gestapelt nach Baustelle</span></div><div class="chart-wrap">${flaeche('vl-zwoelf', reihen, MON, 'kWh', 2)}</div></div>`;
  }
  /* 5 · gewählt (Herbert 01.10.2026): Archiv als Einstieg, Vergleich als Umschalter, Chronik als eigener Reiter „Protokoll“ */
  v_verlauf_5() {
    const reiter = this.s.vlReiter || 'bs', art = this.s.vlArt || 'karten';
    return `${this.kopf('Verlauf', reiter === 'bs' ? 'BAUSTELLEN' : esc(this.d.baustellen[0].name).toUpperCase())}
      <div class="vl-reiter"><div class="seg glas-panel">${[['bs', 'Baustellen'], ['prot', 'Protokoll']].map(([k, t]) => `<button data-act="vl-reiter" data-v="${k}" class="${reiter === k ? 'on' : ''}">${t}</button>`).join('')}</div>
        ${reiter === 'bs' ? `<div class="seg glas-panel klein">${[['karten', '▦ Karten'], ['tabelle', '☰ Vergleich']].map(([k, t]) => `<button data-act="vl-art" data-v="${k}" class="${art === k ? 'on' : ''}">${t}</button>`).join('')}</div>` : ''}</div>
      ${reiter === 'prot' ? this.v_verlauf_2(true) : art === 'tabelle' ? this.v_verlauf_3(true) : this.v_verlauf_1(true)}`;
  }
  v_ueber() {
    const neu = ['Staffelung der Heizungen je Stromanschluss', 'Arbeitszeiten mit Startdatum, Vor- und Nachheizen', 'Firmen und Abrechnung, Auswertung über alle laufenden Baustellen',
      'Container nur bei Bedarf, Termine und Serien, schnell aufheizen', 'Türkontakt, Warnungen mit Stufen, dauerhaftes Protokoll', 'Handy-Nachrichten mit Knöpfen, Wochen-/Monatsbericht per E-Mail',
      'Glas-Oberfläche mit Himmel nach Tageszeit und Wetter', 'Seite „Über“ und Melden-Knopf'];
    const offen = this.s.cl ?? 0;
    return `<div class="zurueck-zeile"><button class="glas-panel chip" data-act="tab" data-v="einst">‹ Einstellungen</button></div>
      <div class="glas-panel ueber-kopf"><div class="ueber-illu">${bcContainer(BEREICH_FARBEN[0], 'heizt')}</div>
        <div><div class="glas-klein">HOME-ASSISTANT-INTEGRATION</div><div class="glas-titel">Baustelle</div><div class="ueber-v">Version <b>${VERSION}</b> <span class="badge blau-b">in Arbeit</span></div>
          <div class="leise">Heizung und Pumpen auf der Baustelle · Integration und Seite haben dieselbe Nummer</div></div></div>
      <div class="glas-panel liste"><div class="gruppe">Dieses System</div>
        <div class="zeile"><span>Integration / Seite</span><span class="leise">${VERSION} · baustelle</span></div>
        <div class="zeile"><span>Home Assistant</span><span class="leise">2026.9.4</span></div>
        <div class="zeile"><span>Quellcode</span><span class="leise">GitHub · herbertschrotter-blip/ha-baustrommanager (öffentlich, MIT-Lizenz)</span></div>
        <div class="zeile"><span>Baustellen</span><span class="leise">${this.d.baustellen.filter(b => b.aktiv).length} laufend · ${this.d.baustellen.filter(b => !b.aktiv).length} abgeschlossen</span></div></div>
      <div class="glas-panel block"><div class="block-kopf"><b>Neu in ${VERSION}</b><span class="leise">geplant</span></div>${neu.map(n => `<div class="cl-punkt">${esc(n)}</div>`).join('')}</div>
      <div class="glas-panel block"><div class="block-kopf"><b>Verlauf</b><span class="leise">aus CHANGELOG.md</span></div>
        ${CHANGELOG.map((c, i) => `<button class="zeile cl-v" data-act="cl" data-i="${i}"><span><b>${c.version}</b> <span class="leise">${datum(c.datum)}</span></span><span class="chev">${offen === i ? '⌄' : '›'}</span></button>
          ${offen === i ? `<div class="cl-liste">${c.punkte.map(p => `<div class="cl-punkt">${esc(p)}</div>`).join('')}</div>` : ''}`).join('')}</div>
      ${this.d.e.melden ? `<button class="knopf" data-act="melden">Fehler, Wunsch oder Anregung melden</button>` : ''}`;
  }
  v_dev() {
    const f = this.s.mfilter || 'offen', M = this.d.meldungen.filter(m => f === 'alle' || m.status === f);
    const ART = { fehler: ['Fehler', 'rot-b'], wunsch: ['Wunsch', 'blau-b'], anregung: ['Anregung', 'gruen'] };
    return `<div class="zurueck-zeile"><button class="glas-panel chip" data-act="tab" data-v="einst">‹ Einstellungen</button></div>
      ${this.kopf('Entwicklung', 'NUR FÜR DICH')}
      <div class="glas-panel block"><div class="block-kopf"><b>Meldungen</b><div class="seg klein">${[['offen', 'offen'], ['erledigt', 'erledigt'], ['alle', 'alle']].map(([k, t]) => `<button data-act="mfilter" data-v="${k}" class="${f === k ? 'on' : ''}">${t} ${k === 'alle' ? this.d.meldungen.length : this.d.meldungen.filter(m => m.status === k).length}</button>`).join('')}</div></div>
        ${M.length ? M.map(m => `<div class="ml ${m.status}"><div class="ml-kopf"><span class="badge ${ART[m.art][1]}">${ART[m.art][0]}</span><span class="leise">${m.zeit} · ${m.geraet} · v${m.version}</span></div>
          <div class="ml-text">${esc(m.text)}</div><div class="leise">📍 ${esc(m.kontext)}</div>
          <div class="wk-knoepfe"><button class="chip glas-panel" data-act="m-status" data-id="${m.id}">${m.status === 'offen' ? '✓ erledigt' : '↺ wieder offen'}</button><button class="chip glas-panel" data-act="m-weg" data-id="${m.id}">Löschen</button></div></div>`).join('')
          : '<div class="leer">Keine Meldungen</div>'}
        <div class="wk-knoepfe"><button class="chip glas-panel" data-act="m-md">Als Markdown kopieren</button><button class="chip glas-panel" data-act="m-json">Als JSON herunterladen</button></div>
        <div class="leise">Meldungen bleiben bei den Daten der Integration (auch in der Sicherung). Markdown passt direkt in ein GitHub-Issue.</div></div>
      <div class="glas-panel liste"><div class="gruppe">Werkzeuge</div>
        <button class="zeile" data-act="toast" data-t="Diagnose wird heruntergeladen (wie in HA unter Geräte & Dienste)"><span>Diagnose herunterladen</span><span class="chev">›</span></button>
        <div class="zeile"><span>Melden-Knopf in jedem Fenster</span>${schalter(this.d.e.melden, 'e-bool', 'data-k="melden"')}</div>
        <div class="zeile"><span>Version</span><span class="leise">${VERSION} · ${VERSION_DATUM}</span></div></div>`;
  }
  v_bsdetail() {
    const b = this.d.baustellen[this.s.bs], r = zufall(this.s.bs * 7 + 3), MON = Object.keys(b.verlauf).length ? Object.keys(b.verlauf) : ['Jän', 'Feb', 'Mär'];
    const gesamt = MON.map(x => b.verlauf[x] || b.kwh / MON.length), ant = b.namen.map(() => .5 + r()), su = ant.reduce((a, v) => a + v, 0);
    const reihen = b.namen.map((n, k) => ({ name: n, v: gesamt.map(g => g * ant[k] / su), farbe: BEREICH_FARBEN[k % BEREICH_FARBEN.length] }));
    return `<div class="zurueck-zeile"><button class="glas-panel chip" data-act="tab" data-v="verlauf">‹ Verlauf</button><button class="glas-panel chip" data-act="csv">⇩ CSV</button></div>
      ${this.kopf(esc(b.name), 'ABGESCHLOSSEN · NUR ANSEHEN')}
      <div class="leise vgl">${b.zeit}</div>
      <div class="glas-panel kennz vier"><div><b>${de(b.kwh, 0)}</b><span>kWh</span></div><div><b>${de(b.eur, 0)} €</b><span>Kosten</span></div><div><b>${b.heiztage}</b><span>Heiztage</span></div><div><b>${de(b.gespart * this.d.e.preis, 0)} €</b><span>gespart</span></div></div>
      <div class="glas-panel block"><div class="block-kopf"><b>Verbrauch je Monat</b><span class="leise">gestapelt nach Container</span></div>
        <div class="chart-wrap">${flaeche('bs-' + this.s.bs, reihen, MON, 'kWh', 1)}</div>
        <div class="vb-je">${reihen.map(q => { const s2 = q.v.reduce((a, v) => a + v, 0); return `<div><i style="background:${q.farbe}"></i><span class="n">${esc(q.name)}</span><b>${de(s2, 0)} kWh</b><span>${de(s2 * this.d.e.preis, 0)} €</span><span class="leise">${de(s2 / b.kwh * 100, 0)} %</span></div>`; }).join('')}</div></div>
      <div class="glas-panel block"><div class="block-kopf"><b>Protokoll</b><span class="leise">Auszug</span></div>
        ${[['17.04.', 'einstellung', 'Baustelle abgeschlossen – Heizung aus, Werte gespeichert'], ['03.03.', 'warnung', 'Sanitär: Frostgefahr 3,8 °C trotz Frostschutz'], ['02.03.', 'ok', 'Sanitär: wieder über 5 °C'], ['24.12.', 'schalten', 'Urlaub Weihnachten – nur Frostschutz bis 06.01.'], ['03.11.', 'einstellung', 'Baustelle angelegt, 5 Container']]
          .map(([t, a, x]) => `<div class="zeile ereignis"><span class="zeit">${t}</span><span class="p-ic">${{ einstellung: '⚙', warnung: '⚠', ok: '✓', schalten: '⏻' }[a]}</span><div><span>${x}</span></div></div>`).join('')}</div>
      ${knopf2('Wieder aktiv setzen', 'toast', 'Baustelle wieder aktiv – Automatik bleibt aus, bis du sie einschaltest')}`;
  }
  protokoll() {
    const f = this.s.pfilter || 'alle', ART = { warnung: ['⚠', 'var(--rot)'], ok: ['✓', '#30d158'], schalten: ['⏻', 'var(--amber)'], wetter: ['☁', 'var(--blau)'], nachricht: ['✉', 'var(--ink2)'], einstellung: ['⚙', 'var(--ink2)'] };
    const passt = e => f === 'alle' || e[2] === f || (f === 'warnung' && e[2] === 'ok') || (f === 'schalten' && e[2] === 'einstellung');
    let liste = this.d.protokoll.filter(passt); const mehr = !this.s.pmehr && liste.length > 12; if (mehr) liste = liste.slice(0, 12);
    let tag = '';
    return `<div class="glas-panel block"><div class="block-kopf"><b>Protokoll</b><span class="leise">bleibt mit der Baustelle gespeichert · auch im HA-Logbuch</span></div>
      <div class="vb-wer">${[['alle', 'Alle'], ['warnung', 'Warnungen'], ['schalten', 'Schalten'], ['wetter', 'Wetter'], ['nachricht', 'Nachrichten']].map(([k, t]) => `<button data-act="pfilter" data-v="${k}" class="${f === k ? 'on' : ''}">${t}</button>`).join('')}</div>
      ${liste.length ? liste.map(e => { const [ic, farbe] = ART[e[2]], kopf = e[0] !== tag ? `<div class="p-tag">${(tag = e[0])}</div>` : '';
        return `${kopf}<div class="zeile ereignis"><span class="zeit">${e[1]}</span><span class="p-ic" style="color:${farbe}">${ic}</span><div>${e[3] ? `<b>${esc(this.bName(e[3]))}</b> ` : ''}<span class="${e[3] ? 'leise' : ''}">${esc(e[4])}</span></div></div>`; }).join('')
        : '<div class="leer">Keine Einträge</div>'}
      ${mehr ? '<button class="zeile" data-act="pmehr"><span class="blau">Ältere Einträge laden</span></button>' : ''}</div>`;
  }

  /* ---- Einstellungen ---- */
  v_einst() {
    const e = this.d.e, st = (k, d, fmt) => `<span class="stepper"><button data-act="st" data-k="${k}" data-d="${-d}">−</button><b>${fmt(e[k])}</b><button data-act="st" data-k="${k}" data-d="${d}">+</button></span>`;
    return `${this.kopf('Einstellungen', 'ÖWG DOBL ZWARING')}
      <div class="glas-panel liste"><div class="gruppe">Baustelle</div>
        <button class="zeile" data-act="sheet" data-s="name"><span>Name</span><span class="leise">ÖWG Dobl Zwaring ›</span></button>
        <button class="zeile" data-act="sheet" data-s="zeitraum-bs"><span>Beginn und Ende ${NEU}</span><span class="leise">${this.bsZeit()} ›</span></button>
        <button class="zeile" data-act="sheet" data-s="zeitraum-bs"><span>Heizperiode ${NEU}</span><span class="leise">${MONATE[this.d.bs.hp[0] - 1]} – ${MONATE[this.d.bs.hp[1] - 1]} ›</span></button>
        <button class="zeile" data-act="sheet" data-s="abschliessen"><span>Baustelle abschließen</span><span class="leise">kommt in den Verlauf ›</span></button>
        <button class="zeile" data-act="sheet" data-s="baustelle-neu"><span class="blau">+ Neue Baustelle</span></button></div>
      <div class="glas-panel liste"><div class="gruppe">App</div>
        <button class="zeile" data-act="tab" data-v="ueber"><span>Über</span><span class="leise">Version ${VERSION} ›</span></button>
        <div class="zeile"><div><b>Erklärungen anzeigen</b> ${NEU}<div class="leise">kurze Texte „ⓘ“ unter Heizung, Pumpen und Auswertung</div></div>${schalter(e.erklaer, 'e-bool', 'data-k="erklaer"')}</div>
        <div class="zeile"><div><b>Melden-Knopf</b><div class="leise">kleiner Knopf in jedem Fenster für Fehler, Wünsche und Anregungen</div></div>${schalter(e.melden, 'e-bool', 'data-k="melden"')}</div>
        <button class="zeile" data-act="tab" data-v="dev"><span>Entwicklung</span><span class="leise">${this.d.meldungen.filter(m => m.status === 'offen').length} offene Meldungen ›</span></button></div>
      <div class="glas-panel liste"><div class="gruppe">Firmen · für die Abrechnung</div>
        ${this.d.firmen.map(f => { const n = this.d.bereiche.filter(b => (b.firma || 'eigen') === f.id).length;
          return `<button class="zeile" data-act="firma-auf" data-id="${f.id}"><span>${esc(f.name)}${f.eigen ? ' <span class="badge">eigene</span>' : ''}</span><span class="leise">${n} Container ›</span></button>`; }).join('')}
        <button class="zeile" data-act="firma-auf"><span class="blau">+ Firma hinzufügen</span></button></div>
      <div class="glas-panel liste"><div class="gruppe">Container und Geräte</div>
        ${this.d.bereiche.map(b => `<button class="zeile" data-act="bereich-einst" data-id="${b.id}"><span><i class="farbpunkt" style="background:${BEREICH_FARBEN[b.f % 6]}"></i>${esc(b.name)}</span><span class="leise">${b.geraete.length} ${b.pumpe ? 'Pumpen' : 'Geräte'} ›</span></button>`).join('')}
        <button class="zeile" data-act="sheet" data-s="container-neu"><span class="blau">+ Container oder Schacht</span></button></div>
      <div class="glas-panel liste"><div class="gruppe">Strom</div>
        <label class="zeile"><span>Preis je kWh</span><span class="eingabe"><input type="number" step="0.01" data-k="preis" value="${e.preis}"> €</span></label>
        <div class="zeile"><div><b>⚡ Staffelung</b><div class="leise">verteilt die Heizungen auf den freien Strom – geschaltet werden nur Heizungen</div></div>${schalter(e.staffel, 'e-bool', 'data-k="staffel"')}</div>
        ${e.staffel ? `<div class="gruppe-t gt-einzug">Anschlüsse</div>
        ${this.d.anschluesse.map(a => `<button class="zeile unter" data-act="anschluss-auf" data-id="${a.id}"><div><b>${esc(a.name)}</b><div class="leise">${a.phasen === 3 ? '3 × ' : ''}${a.ampere} A · Reserve ${de(a.reserve)} kW · ${this.d.bereiche.filter(b => b.anschluss === a.id).map(b => esc(b.name)).join(', ') || 'keine Container'}</div></div><span class="chev">›</span></button>`).join('')}
        <button class="zeile unter" data-act="anschluss-auf"><span class="blau">+ Anschluss hinzufügen</span></button>
        <div class="zeile unter"><div><span>Nutzbar je Anschluss</span><div class="leise">vorsichtig, weil unbekannt ist, welche Steckdose an welcher Phase hängt</div></div>${st('nutzbar', 5, v => `${v} %`)}</div>
        <div class="zeile unter"><span>Höchstens gleichzeitig</span>${st('max_gleich', 1, v => `${v} Heizk.`)}</div>
        <div class="zeile unter"><span>Mindestlaufzeit</span>${st('min_lauf', 1, v => `${v} min`)}</div>
        <div class="zeile unter"><span>Mindestpause</span>${st('min_pause', 1, v => `${v} min`)}</div>
        <div class="zeile unter"><div><span>Wechsel im Rundlauf</span><div class="leise">wenn nicht alle gleichzeitig dürfen</div></div>${st('takt', 5, v => `${v} min`)}</div>
        <div class="zeile unter"><span class="leise">Gesamtzähler: keiner – gerechnet wird mit den Shellys und der Reserve je Anschluss. Später kann je Anschluss ein Zähler dazukommen.</span></div>
        <div class="gruppe-t gt-einzug">Vorrang, wenn nicht alle dürfen</div>
        ${this.d.bereiche.filter(b => !b.pumpe).map(b => `<div class="zeile unter"><span>${esc(b.name)}</span><div class="seg klein">${['niedrig', 'normal', 'hoch'].map(v => `<button data-act="prio" data-id="${b.id}" data-v="${v}" class="${(b.prio || 'normal') === v ? 'on' : ''}">${v}</button>`).join('')}</div></div>`).join('')}
        <div class="leise p-fuss">Frostschutz geht immer vor. Pumpen und andere Verbraucher werden mitgezählt, aber nie geschaltet.</div>` : ''}</div>
      <div class="glas-panel liste"><div class="gruppe">Wetter und Kalender</div>
        <button class="zeile" data-act="sheet" data-s="wetterquelle"><span>Wetter</span><span class="leise">Open-Meteo · Zone Baustelle ›</span></button>
        <button class="zeile" data-act="sheet" data-s="wetterquelle"><span>Außentemperatur</span><span class="leise">aus der Vorhersage ›</span></button>
        <button class="zeile" data-act="sheet" data-s="urlaub"><span>Urlaub</span><span class="leise">Kalender „Baustelle Urlaub“ ›</span></button>
        <div class="zeile"><span>Feiertage</span><span class="leise">Österreich, automatisch</span></div></div>
      <div class="glas-panel liste"><div class="gruppe">Bericht</div>
        <div class="zeile"><span>Wie oft</span><div class="seg klein">${[['aus', 'aus'], ['woche', 'Woche'], ['monat', 'Monat'], ['beides', 'beides']].map(([k, t]) => `<button data-act="e-wert" data-k="bericht" data-v="${k}" class="${e.bericht === k ? 'on' : ''}">${t}</button>`).join('')}</div></div>
        ${e.bericht !== 'aus' ? `<div class="zeile unter"><span class="leise">${{ woche: 'jeden Montag 07:00 für die Vorwoche', monat: 'am 1. des Monats 07:00 für den Vormonat', beides: 'Montag 07:00 und am 1. des Monats' }[e.bericht]}</span></div>
        <div class="zeile unter"><span>📱 aufs Handy</span>${schalter(e.bericht_handy, 'e-bool', 'data-k="bericht_handy"')}</div>
        <div class="zeile unter"><span>✉ per E-Mail</span>${schalter(e.bericht_mail, 'e-bool', 'data-k="bericht_mail"')}</div>
        ${e.bericht_mail ? `<label class="zeile unter"><span>an</span><input type="email" value="${esc(e.mail)}" data-k="mail" class="mail-feld"></label>
        <div class="zeile unter"><span>Abrechnung als CSV anhängen</span>${schalter(e.bericht_csv, 'e-bool', 'data-k="bericht_csv"')}</div>
        <div class="zeile unter"><span class="leise">über den Dienst notify.baustelle_mail (z. B. Google Mail oder SMTP in HA eingerichtet)</span></div>` : ''}
        <button class="zeile" data-act="sheet" data-s="bericht"><span class="blau">Beispiel ansehen</span><span class="chev">›</span></button>
        <button class="zeile" data-act="toast" data-t="Bericht für die Vorwoche gesendet"><span class="blau">Jetzt senden</span></button>` : ''}</div>
      <div class="glas-panel liste"><div class="gruppe">Meldungen · Störungen</div>
        <div class="zeile"><span>Empfänger</span><span class="leise">${e.empfaenger}</span></div>
        <div class="zeile"><div><b>Knöpfe in der Nachricht</b><div class="leise">direkt aus der Nachricht reagieren, z. B. „bis morgen stumm“</div></div>${schalter(e.knoepfe, 'e-bool', 'data-k="knoepfe"')}</div>
        <button class="zeile" data-act="sheet" data-s="nachrichten"><span class="blau">Beispiele ansehen</span><span class="chev">›</span></button>
        <button class="zeile" data-act="test-meldung"><span class="blau">Test-Nachricht senden</span>${NEU}</button>
        <div class="zeile"><span>Stromausfall / offline (nach ${e.offline_min} min)</span>${schalter(e.m_offline, 'e-bool', 'data-k="m_offline"')}</div>
        <div class="zeile"><span>Pumpe Trockenlauf (unter ${e.trocken_w} W)</span>${schalter(e.m_trocken, 'e-bool', 'data-k="m_trocken"')}</div>
        <div class="zeile"><span>Pumpe Dauerlauf über ${e.dauer_min} min</span>${schalter(e.m_dauer, 'e-bool', 'data-k="m_dauer"')}</div>
        <div class="zeile"><span>Pumpe schaltet oft (ab ${e.zyklen_h} je Stunde)</span>${schalter(e.m_zyklen, 'e-bool', 'data-k="m_zyklen"')}</div>
        <div class="zeile"><span>Heizkörper zieht keinen Strom</span>${schalter(e.m_leistung, 'e-bool', 'data-k="m_leistung"')}</div>
        <div class="zeile"><span>Frostgefahr trotz Frostschutz</span>${schalter(e.m_frost, 'e-bool', 'data-k="m_frost"')}</div>
        <div class="gruppe">Hinweise</div>
        <div class="zeile"><span>Zu kalt trotz Heizung (nach ${e.kalt_min} min)</span>${schalter(e.m_kalt, 'e-bool', 'data-k="m_kalt"')}</div>
        <div class="zeile"><span>Fühler meldet nichts / Batterie schwach</span>${schalter(e.m_fuehler, 'e-bool', 'data-k="m_fuehler"')}</div>
        <div class="zeile"><span>Keine Wettervorhersage</span>${schalter(e.m_wetter, 'e-bool', 'data-k="m_wetter"')}</div>
        <div class="zeile"><span>Handbetrieb länger als ${e.hand_h} h</span>${schalter(e.m_hand, 'e-bool', 'data-k="m_hand"')}</div>
        <div class="leise p-fuss">Störungen gehen als Nachricht aufs Handy, Hinweise nur ins Protokoll und in den Warnung-Chip.</div></div>`;
  }

  /* ---- Einblendungen von unten ---- */
  sheet() {
    const s = this.s.sheet, knopf = (t, act = 'zu', art = '') => `<button class="knopf ${art}" data-act="${act}">${t}</button>`;
    const griff = '<div class="griff"></div>';
    if (s.art === 'verbrauch') {
      return `${griff}${this.verbrauchInhalt(s, 'sheet', true)}
        ${knopf('Schließen')}`;
    }
    if (s.art === 'wetter') {
      const a = s.wa || 'std', e = this.d.e;
      const folge = (t, mm) => [t < e.frueh_temp ? '<span class="w-folge blau">Frühstart</span>' : '', mm >= e.tr_mm ? '<span class="w-folge amber">Kleidung trocknen</span>' : '',
        t > e.grenze ? '<span class="w-folge">über Heizgrenze</span>' : ''].join('');
      let inhalt;
      if (a === 'std') {
        const std = [['17', 'rainy', 3.8, .8, 70], ['18', 'rainy', 3.1, .4, 55], ['19', 'cloudy', 2.4, 0, 20], ['20', 'cloudy', 1.9, 0, 10], ['21', 'fog', 1.2, 0, 5], ['22', 'clear-night', .6, 0, 0]];
        inhalt = `<div class="w-std">${std.map(([h, w, t, r, p]) => `<div><span class="leise">${h}:00</span>${wetterIcon(w, 36)}<b>${de(t, 0)}°</b>
          <span class="w-regen">${r ? de(r) + ' mm' : '–'}</span><span class="leise">${p} %</span></div>`).join('')}</div>`;
      } else if (a === 'tag') {
        const teile = ['Morgen', 'Mittag', 'Nachmittag', 'Nacht'];
        const tage = [['Heute', [['rainy', 2.1, 2.4], ['pouring', 4.8, 2.9], ['rainy', 4.2, .7], ['fog', 1.0, 0]], 2],
          ['Morgen', [['fog', -1.2, 0], ['partlycloudy', 5.4, 0], ['sunny', 7.1, 0], ['clear-night', 0.4, 0]], 0]];
        inhalt = tage.map(([name, abschnitte, vorbei]) => `<div class="w-tag"><div class="w-tag-n">${name}</div><div class="w-teile">${abschnitte.map(([w, t, r], k) =>
          `<div class="${k < vorbei ? 'vorbei' : ''}"><span class="leise">${teile[k]}</span>${wetterIcon(w, 34)}<b>${de(t, 0)}°</b><span class="w-regen">${r ? de(r) + ' mm' : '–'}</span></div>`).join('')}</div></div>`).join('');
      } else {
        const tage = [['Mi', '30.09.', 'fog', 7.1, -1.2, 0, 10], ['Do', '01.10.', 'partlycloudy', 9.4, 1.8, 0, 15], ['Fr', '02.10.', 'rainy', 8.2, 4.1, 5.5, 80]];
        inhalt = `<div class="w-3">${tage.map(([t, d, w, hi, lo, mm, p]) => `<div class="w-3z">
          <div class="w-3t"><b>${t}</b><span class="leise">${d}</span></div>${wetterIcon(w, 40)}
          <div class="w-3w"><b>${de(hi, 0)}°</b><span class="leise">${de(lo, 0)}°</span></div>
          <div class="w-3r"><span class="w-regen">${mm ? de(mm) + ' mm' : '–'}</span><span class="leise">${p} %</span></div>
          <div class="w-3f">${folge(lo, mm)}</div></div>`).join('')}</div>`;
      }
      return `${griff}<h3>Wetter · Dobl</h3><div class="w-jetzt">${wetterIcon('rainy', 72)}<div><b>4,2 °C</b><div class="leise">Regen · 6 mm seit gestern · gefühlt 1 °C</div></div></div>
        <div class="seg">${[['std', 'Stündlich'], ['tag', 'Tagesverlauf'], ['3', '3 Tage']].map(([k, t]) => `<button data-act="wa" data-v="${k}" class="${a === k ? 'on' : ''}">${t}</button>`).join('')}</div>
        <div class="w-inhalt">${inhalt}</div>
        <div class="leise">Für die Heizung: Kleidung trocknen morgen früh aktiv (Regen über ${de(e.tr_mm)} mm), Kälte-Frühstart morgen 15 min früher (−1 °C).</div>${knopf('Schließen')}`;
    }
    if (s.art === 'warnungen') {
      const W = this.d.warnungen, karte = w => `<div class="wk ${w.stufe} ${w.stumm ? 'stumm' : ''}"><div class="wk-kopf"><b>${esc(this.bName(w.b))}</b><span class="leise">${w.seit}</span></div>
        <div class="wk-titel">${esc(w.titel)}</div><div class="leise">${esc(w.hilfe)}</div>
        <div class="wk-knoepfe">${w.b ? `<button class="chip glas-panel" data-act="w-hin" data-id="${w.b}">Zum Container ›</button>` : ''}
          <button class="chip glas-panel" data-act="w-stumm" data-id="${w.id}">${w.stumm ? '🔔 wieder melden' : '🔕 bis morgen stumm'}</button></div></div>`;
      const gruppe = (titel, liste) => liste.length ? `<div class="gruppe-t">${titel} · ${liste.length}</div>${liste.map(karte).join('')}` : '';
      const offen = W.filter(w => !w.stumm);
      return `${griff}<div class="block-kopf"><h3>Warnungen</h3><span class="leise">${offen.length} offen</span></div>
        ${offen.length ? '' : '<div class="leer">Alles in Ordnung ✓</div>'}
        ${gruppe('Störungen', offen.filter(w => w.stufe === 'stoerung'))}${gruppe('Hinweise', offen.filter(w => w.stufe === 'hinweis'))}${gruppe('Stumm bis morgen', W.filter(w => w.stumm))}
        <button class="zeile" data-act="w-protokoll"><span class="blau">Alle Einträge im Protokoll</span><span class="chev">›</span></button>
        ${knopf('Schließen', 'zu', 'leise-k')}`;
    }
    if (s.art === 'baustellen') return `${griff}<h3>Baustelle wählen</h3>${this.d.baustellen.map((b, i) => `<div class="zeile bs-zeile"><button class="bs-wahl" data-act="zu"><span>${esc(b.name)}</span><span class="badge ${b.aktiv ? 'gruen' : ''}">${b.aktiv ? 'aktiv' : 'abgeschlossen'}</span></button>
        <button class="bs-ic" data-act="sheet" data-s="bs-bearbeiten" data-i="${i}" title="Bearbeiten" aria-label="${esc(b.name)} bearbeiten">✎</button></div>`).join('')}
      <button class="zeile" data-act="sheet" data-s="baustelle-neu"><span class="blau">+ Neue Baustelle</span></button>`;
    if (s.art === 'heizplan') {
      const az = this.azJetzt;
      return `${griff}<div class="block-kopf"><h3>Heizplan · diese Woche</h3><span class="leise">${esc(az.name)} · seit ${datum(az.ab)}</span></div>
        ${this.s.auto ? '' : '<div class="warn-k"><b>Automatik ist aus</b><div class="leise">Der Plan wird gerade nicht ausgeführt.</div></div>'}
        ${this.heizplanInhalt()}
        <div class="bedarf-dauer">${this.d.jetztBis ? `<button class="chip glas-panel amber" data-act="jetzt-aus">■ alle heizen bis ${this.d.jetztBis} – beenden</button>` : `<button class="chip glas-panel" data-act="jetzt-an">▶ alle jetzt 1 h heizen</button>`}<button class="chip glas-panel" data-act="ausn-neu" data-v="">+ Ausnahme</button></div>
        ${knopf('Arbeitszeit ändern', 'az-heizung', 'amber')}${knopf('Schließen', 'zu', 'leise-k')}`;
    }
    if (s.art === 'az') {
      const a = this.d.arbeitszeiten[s.i], geplant = a.ab > HEUTE, aktuell = a === this.azJetzt;
      return `${griff}<div class="block-kopf"><h3>${esc(a.name)}</h3><span class="badge ${aktuell ? 'gruen' : geplant ? 'blau-b' : ''}">${aktuell ? 'gilt jetzt' : geplant ? 'geplant' : 'früher'}</span></div>
        <div class="leise">gilt ab ${datum(a.ab)}</div>
        ${TAGE.map(t => `<div class="zeile"><b class="tag-n">${t}</b><span>${a.tage[t] ? a.tage[t].join('–') : '<span class="leise">frei</span>'}</span></div>`).join('')}
        ${a.auto ? '<div class="leise">Automatisch angelegt – wird durch deine erste eigene Arbeitszeit ersetzt.</div>' : ''}
        ${knopf('Bearbeiten', 'az-bearbeiten', 'amber')}${knopf('Als Vorlage für eine neue', 'az-vorlage')}
        ${this.d.arbeitszeiten.length > 1 ? knopf('Löschen', 'az-weg', 'rot') : '<div class="leise">Die letzte Arbeitszeit lässt sich nicht löschen – ohne Arbeitszeit liefe nur der Frostschutz.</div>'}${knopf('Schließen', 'zu', 'leise-k')}`;
    }
    if (s.art === 'firma') {
      const f = s.form, neu = !f.id, eigen = !neu && this.firma(f.id).eigen;
      // wählbar: Container ohne fremde Firma, dazu die, die schon dieser Firma gehören
      const frei = this.d.bereiche.filter(b => (b.firma || 'eigen') === 'eigen' || (!neu && b.firma === f.id));
      return `${griff}<h3>${neu ? 'Neue Firma' : 'Firma'}</h3>
        <label class="feld">Name<input value="${esc(f.name)}" placeholder="z. B. Trockenbau Maier" data-fn ${eigen ? 'disabled' : ''}></label>
        ${eigen ? `<div class="gruppe-t">Container der eigenen Firma</div>
          ${this.d.bereiche.filter(b => (b.firma || 'eigen') === 'eigen').map(b => `<div class="zeile"><span>${esc(b.name)}</span></div>`).join('')}
          <div class="leise">Hierher gehören alle Container, die keiner anderen Firma zugeordnet sind.</div>`
        : `<div class="gruppe-t">Container zuordnen</div>
          ${frei.length ? frei.map(b => `<div class="zeile"><span>${esc(b.name)}</span>${schalter(f.container.includes(b.id), 'firma-c', `data-id="${b.id}"`)}</div>`).join('')
            : '<div class="leise">Alle Container sind schon anderen Firmen zugeordnet.</div>'}
          ${f.neu.map((c, i) => `<div class="zeile fc-neu"><input value="${esc(c.name)}" placeholder="Name des Containers" data-fnc="${i}">
            <div class="seg klein">${['Container', 'Schacht'].map(a => `<button data-act="fc-art" data-i="${i}" data-v="${a}" class="${c.art === a ? 'on' : ''}">${a}</button>`).join('')}</div>
            <button class="x" data-act="fc-weg" data-i="${i}" title="nicht anlegen">✕</button></div>`).join('')}
          <button class="zeile" data-act="fc-neu"><span class="blau">+ Neuer Container für diese Firma</span></button>
          <div class="leise">Nur Container ohne andere Firma sind wählbar. Nimmst du einen weg, gehört er wieder der eigenen Firma. Frühere Werte bleiben bei der bisherigen Firma.</div>`}
        ${eigen ? knopf('Schließen', 'zu', 'leise-k') : knopf('Speichern', 'firma-speichern', 'amber') + (neu ? '' : knopf('Firma löschen', 'firma-weg', 'rot')) + knopf('Abbrechen', 'zu', 'leise-k')}`;
    }
    if (s.art === 'strom') {
      const L = this.last(), e = this.d.e;
      const zustand = x => x.b.offline ? ['offline', 'rot-t'] : x.b.boost && x.g.an ? ['heizt – schnell, Vorrang', 'amber-t'] : x.b.z === 'pause' ? ['pausiert – Tür offen', 'lila'] : x.g.warte ? [`wartet – dran in ${x.g.warte} min`, 'blau'] : x.g.an ? ['heizt', 'amber-t'] : ['aus', 'leise'];
      const pw = (v, p) => `${Math.max(0, v / p.max * 100)}%`;
      return `${griff}<div class="block-kopf"><h3>Stromverteilung</h3><span class="leise">${L.laufen} von ${L.hk.length} Heizkörpern an · höchstens ${e.max_gleich}</span></div>
        <div class="strom-leg"><span><i class="s-heiz"></i>Heizung ${de(L.heiz)} kW</span><span><i class="s-pumpe"></i>Pumpen ${de(L.pumpe)} kW</span><span><i class="s-sonst"></i>Sonstiges ${de(L.sonst)} kW</span><span><i class="s-res"></i>Reserve (Kran, Werkzeug)</span></div>
        ${L.A.map(a => { const w = v => `${Math.max(0, v / a.grenze * 100)}%`;
          return `<div class="an-block"><div class="an-kopf"><b>${esc(a.name)}</b><span class="leise">${a.phasen === 3 ? '3 × ' : ''}${a.ampere} A · ${de(a.heiz + a.pumpe + a.sonst)} von ${de(a.grenze)} kW</span></div>
          <div class="strom-spur"><i class="s-heiz" style="width:${w(a.heiz)}"></i><i class="s-pumpe" style="width:${w(a.pumpe)}"></i><i class="s-sonst" style="width:${w(a.sonst)}"></i><i class="s-res" style="width:${w(a.reserve)}"></i></div>
          <div class="leise">${a.frei < 2 ? `<span class="amber-t">nur ${de(Math.max(0, a.frei))} kW frei</span>` : `${de(a.frei)} kW frei`} für Heizungen</div>
          ${L.hk.filter(x => x.b.anschluss === a.id).map(x => { const [t, k] = zustand(x); return `<div class="zeile"><span>${esc(x.b.name)} · ${esc(x.g.n)}</span><span class="${k}">${t}</span></div>`; }).join('')}</div>`; }).join('')}
        <div class="hinweis-k">Je Anschluss gilt: ${e.nutzbar} % der Anschlussleistung (vorsichtig, weil die Verteilung auf die Phasen unbekannt ist) minus Reserve minus alles, was schon läuft. Ein Heizkörper kommt erst dazu, wenn eine Minute lang genug frei ist. Jeder läuft mindestens ${e.min_lauf} min und pausiert mindestens ${e.min_pause} min; dürfen nicht alle, wechseln sie alle ${e.takt} min – wer am weitesten unter dem Soll ist, zuerst.</div>
        ${knopf('Anschlüsse einstellen', 'tab-einst', 'leise-k')}${knopf('Schließen', 'zu', 'leise-k')}`;
    }
    if (s.art === 'anschluss') {
      const f = s.form, neu = !f.id;
      return `${griff}<h3>${neu ? 'Neuer Anschluss' : 'Anschluss'}</h3>
        <label class="feld">Name<input value="${esc(f.name)}" placeholder="z. B. Verteiler West" data-an="name"></label>
        <div class="zeile"><span>Absicherung</span><div class="seg klein">${[16, 32, 63].map(v => `<button data-act="an-wert" data-k="ampere" data-v="${v}" class="${f.ampere === v ? 'on' : ''}">${v} A</button>`).join('')}</div></div>
        <div class="zeile"><span>Art</span><div class="seg klein">${[3, 1].map(v => `<button data-act="an-wert" data-k="phasen" data-v="${v}" class="${f.phasen === v ? 'on' : ''}">${v === 3 ? 'Starkstrom (CEE)' : 'Schuko 230 V'}</button>`).join('')}</div></div>
        <div class="zeile"><div><span>Reserve</span><div class="leise">für Ungemessenes wie Kran oder Werkzeug</div></div><span class="stepper"><button data-act="an-res" data-d="-1">−</button><b>${de(f.reserve)} kW</b><button data-act="an-res" data-d="1">+</button></span></div>
        <div class="leise">Anschlussleistung ${de(f.ampere * .23 * f.phasen)} kW, davon rechnet die Staffelung mit ${this.d.e.nutzbar} % = ${de(f.ampere * .23 * f.phasen * this.d.e.nutzbar / 100)} kW, abzüglich ${de(f.reserve)} kW Reserve.</div>
        <div class="gruppe-t">Container an diesem Anschluss</div>
        ${this.d.bereiche.map(b => `<div class="zeile"><span>${esc(b.name)} <span class="leise">${f.container.includes(b.id) ? '' : '· ' + esc(this.anschluss(b.anschluss).name)}</span></span>${schalter(f.container.includes(b.id), 'an-c', `data-id="${b.id}"`)}</div>`).join('')}
        <div class="leise">Ein Container hängt an genau einem Anschluss.</div>
        ${knopf('Speichern', 'an-speichern', 'amber')}${!neu && this.d.anschluesse.length > 1 ? knopf('Anschluss löschen', 'an-weg', 'rot') : ''}${knopf('Abbrechen', 'zu', 'leise-k')}`;
    }
    if (s.art === 'nachrichten') {
      const n = (ic, titel, text, knoepfe, b) => `<div class="noti"><div class="noti-kopf"><span class="noti-app">🏗 Home Assistant · jetzt</span></div><b>${ic} ${titel}</b><div>${text}</div>
        ${this.d.e.knoepfe ? `<div class="noti-knoepfe">${knoepfe.map(k => `<button data-act="n-knopf" data-t="${k}" data-b="${b || ''}">${k}</button>`).join('')}</div>` : ''}</div>`;
      return `${griff}<h3>Nachrichten aufs Handy</h3><div class="leise">So kommen sie in der Home-Assistant-App an. ${this.d.e.knoepfe ? 'Tippe einen Knopf zum Ausprobieren.' : 'Knöpfe sind ausgeschaltet.'}</div>
        ${n('⚠', 'Lager Süd nicht erreichbar', 'Seit 10:42 keine Antwort – Stromausfall oder Stecker gezogen?', ['Zum Container', 'Bis morgen stumm'], 'lager')}
        ${n('🚪', 'Magazin: Tür seit 10 min offen', 'Die Heizung ist pausiert und heizt wieder, sobald die Tür zu ist.', ['Trotzdem heizen', '1 h stumm'], 'magazin')}
        ${n('❄', 'Morgen −4 °C', 'Vorheizen startet schon um 05:30. Arbeitsbeginn 07:00.', ['Morgen nicht heizen', 'Noch früher (05:00)'])}
        ${n('✋', 'Steckdose Magazin seit 8 h auf Hand', 'Von Hand eingeschaltet und nicht zurückgestellt.', ['Automatik übernehmen', 'So lassen'], 'magazin')}
        <div class="leise">Die Knöpfe sind Aktionen der HA-App (mobile_app). Ein Tipp löst die Aktion aus und landet im Protokoll.</div>${knopf('Schließen', 'zu', 'leise-k')}`;
    }
    if (s.art === 'bericht') {
      const e = this.d.e, mon = e.bericht === 'monat', z = mon ? 'Monat' : 'Woche', L = this.laufende()[0], p = e.preis;
      const je = L.bereiche.map(b => [b, verbrauch(L.bereiche, b.id, z).reduce((a, v) => a + v, 0)]), ges = je.reduce((a, x) => a + x[1], 0);
      const fi = this.d.firmen.map(f => [f, je.filter(([b]) => (b.firma || 'eigen') === f.id).reduce((a, x) => a + x[1], 0)]).filter(x => x[1] > 0);
      return `${griff}<h3>Bericht · Beispiel</h3>
        <div class="mail"><div class="mail-kopf"><div><span class="leise">An</span> ${e.bericht_mail ? esc(e.mail) : '—'}</div><div><span class="leise">Betreff</span> Baustelle ÖWG Dobl Zwaring – ${mon ? 'September 2026' : 'Woche 21.–27.09.2026'}</div>
          ${e.bericht_mail && e.bericht_csv ? `<div class="mail-anhang">📎 abrechnung-${mon ? '2026-09' : 'kw39'}.csv</div>` : ''}</div>
          <div class="mail-inhalt"><b>${mon ? 'September' : 'Vorwoche'}: ${de(ges, 0)} kWh · ${de(ges * p, 2)} €</b> <span class="leise">(${mon ? '+31 % zum August' : '−4 % zur Woche davor'})</span>
            <div class="mail-t">Je Firma</div>${fi.map(([f, k]) => `<div class="mail-z"><span>${esc(f.name)}</span><span>${de(k, 0)} kWh · ${de(k * p, 2)} €</span></div>`).join('')}
            <div class="mail-t">Je Container</div>${je.map(([b, k]) => `<div class="mail-z"><span>${esc(b.name)}</span><span>${de(k, 0)} kWh</span></div>`).join('')}
            <div class="mail-t">Heizung</div><div class="mail-z"><span>Heiztage</span><span>${mon ? 16 : 5}</span></div><div class="mail-z"><span>gespart durch Automatik</span><span>${de(ges * 3.6 * p, 0)} €</span></div>
            <div class="mail-t">Offene Warnungen</div>${this.d.warnungen.filter(w => !w.stumm).map(w => `<div class="mail-z"><span>${esc(this.bName(w.b))}: ${esc(w.titel)}</span></div>`).join('')}</div></div>
        <div class="leise">${e.bericht_handy ? 'Aufs Handy kommt eine Kurzfassung (Summe, Kosten, Warnungen) mit Knopf „Bericht öffnen“. ' : ''}Die E-Mail geht über einen Mail-Dienst in HA (Google Mail oder SMTP); die Zugangsdaten stehen in secrets.yaml.</div>
        ${knopf('Schließen', 'zu', 'leise-k')}`;
    }
    if (s.art === 'bedarf') {
      const b = this.d.bereiche.find(x => x.id === s.cid);
      return `${griff}<h3>${esc(b.name)} heizen</h3><div class="leise">Jetzt ${b.t !== null ? `${de(b.t)} °C` : 'ohne Fühler'} · wird ${b.t !== null ? `in etwa ${Math.round((this.d.e.soll - b.t) * 4)} min warm` : 'sofort eingeschaltet'}</div>
        <div class="zeile"><div><b>⚡ Schnell aufheizen</b><div class="leise">alle Heizkörper zugleich, Vorrang in der Staffelung</div></div>${schalter(s.boost, 'bedarf-boost')}</div>
        <div class="bedarf-dauer gross">${[['60', '1 Stunde'], ['120', '2 Stunden'], ['ende', 'bis Arbeitsende (16:30)'], ['abend', 'bis 19:00']].map(([v, t]) => `<button class="knopf" data-act="bedarf-an" data-id="${b.id}" data-v="${v}">▶ ${t}</button>`).join('')}</div>
        <button class="zeile" data-act="sheet" data-s="termin" data-id="${b.id}"><span class="blau">Lieber einen Termin eintragen</span><span class="chev">›</span></button>
        ${knopf('Abbrechen', 'zu', 'leise-k')}`;
    }
    if (s.art === 'termin') {
      const f = s.form;
      return `${griff}<h3>Termin eintragen</h3>
        <label class="feld">Titel<input value="${esc(f.titel)}" placeholder="z. B. Baubesprechung" data-tm="titel"></label>
        <label class="feld">${f.wieder === 'einmal' ? 'Tag' : 'Ab (Wochentag gilt für die Serie)'}<input type="date" value="${f.datum}" data-tm="datum"></label>
        <div class="zeile"><span>Wiederholen</span><div class="seg klein">${Object.entries(WIEDER).map(([k, t]) => `<button data-act="tm-wieder" data-v="${k}" class="${f.wieder === k ? 'on' : ''}">${t}</button>`).join('')}</div></div>
        <div class="zeile"><div><b>⚡ Schnell aufheizen</b><div class="leise">vor dem Termin alle Heizkörper zugleich</div></div>${schalter(f.boost, 'tm-boost')}</div>
        <div class="raster-2"><label class="feld">von<input type="time" value="${f.von}" data-tm="von"></label><label class="feld">bis<input type="time" value="${f.bis}" data-tm="bis"></label></div>
        ${f.wieder !== 'einmal' && f.datum ? `<div class="leise">Serie: ${WIEDER[f.wieder]} am ${wtag(f.datum)} ab ${datum(f.datum)}</div>` : ''}
        <div class="leise">Kommt in den HA-Kalender „Besprechungen“ (Serien als Wiederholung im Kalender). Die Heizung startet ${this.d.e.vorheizen} min vorher (Vorheizen) und hört zum Ende auf.</div>
        ${knopf('Eintragen', 'termin-speichern', 'amber')}${knopf('Abbrechen', 'zu', 'leise-k')}`;
    }
    if (s.art === 'melden') {
      const f = s.form;
      return `${griff}<h3>Melden</h3><div class="leise">Fehler, Wunsch oder Anregung – landet im Entwicklermenü.</div>
        <div class="seg">${[['fehler', 'Fehler'], ['wunsch', 'Wunsch'], ['anregung', 'Anregung']].map(([k, t]) => `<button data-act="ml-art" data-v="${k}" class="${f.art === k ? 'on' : ''}">${t}</button>`).join('')}</div>
        <label class="feld">${{ fehler: 'Was ist passiert, was hättest du erwartet?', wunsch: 'Was wünschst du dir?', anregung: 'Deine Idee' }[f.art]}<textarea rows="4" data-ml="text" placeholder="kurz beschreiben">${esc(f.text)}</textarea></label>
        <div class="ml-kontext"><div><span class="leise">Fenster</span> ${esc(f.kontext)}</div><div><span class="leise">Version</span> ${VERSION} · ${f.geraet} · Di 29.09. ${JETZT}</div></div>
        <div class="zeile"><div><b>Stand der Seite mitschicken</b><div class="leise">Zustand und Einstellungen als Anhang – hilft beim Nachstellen, ohne Zugangsdaten</div></div>${schalter(f.stand, 'ml-stand')}</div>
        ${knopf('Senden', 'ml-senden', 'amber')}${knopf('Abbrechen', 'ml-zurueck', 'leise-k')}`;
    }
    if (s.art === 'ausnahme') {
      const f = s.form, az = this.azJetzt.tage[wtag(f.datum)];
      return `${griff}<h3>Ausnahme</h3>
        <label class="feld">Tag<input type="date" value="${f.datum}" data-au="datum"></label>
        <div class="leise">${wtag(f.datum)} ${kurzDatum(f.datum)} · laut Arbeitszeit ${az ? az.join('–') : 'frei'}</div>
        <div class="seg">${Object.entries(AUSNAHME).map(([k, t]) => `<button data-act="au-art" data-v="${k}" class="${f.art === k ? 'on' : ''}">${t}</button>`).join('')}</div>
        ${f.art === 'frei' ? '<div class="leise">An diesem Tag wird nicht geheizt, nur der Frostschutz läuft.</div>'
          : `<div class="raster-2"><label class="feld">von<input type="time" value="${f.von}" data-au="von"></label><label class="feld">bis<input type="time" value="${f.bis}" data-au="bis"></label></div>
          <div class="leise">Vorheizen ${this.d.e.vorheizen} min und Nachheizen ${this.d.e.nachheizen} min gelten auch hier – geheizt wird ${uhr(minu(f.von) - this.d.e.vorheizen)}–${uhr(minu(f.bis) + this.d.e.nachheizen)}.</div>`}
        <label class="feld">Notiz<input value="${esc(f.notiz)}" placeholder="z. B. Betonieren" data-au="notiz"></label>
        ${knopf('Speichern', 'au-speichern', 'amber')}${knopf('Abbrechen', 'zu', 'leise-k')}`;
    }
    if (s.art === 'az-neu') {
      const f = s.form;
      return `${griff}<h3>${f.i !== undefined ? 'Arbeitszeit bearbeiten' : 'Neue Arbeitszeit'}</h3>
        <div class="raster-2"><label class="feld">Gilt ab<input type="date" value="${f.ab}" data-azn="ab"></label><label class="feld">Name<input value="${esc(f.name)}" placeholder="z. B. Winter" data-azn="name"></label></div>
        ${TAGE.map(t => { const z = f.tage[t]; return `<div class="zeile azn"><b class="tag-n">${t}</b>${schalter(!!z, 'azn-tag', `data-t="${t}"`)}
          ${z ? `<input type="time" value="${z[0]}" data-azt="${t}" data-p="0"><span class="leise">bis</span><input type="time" value="${z[1]}" data-azt="${t}" data-p="1">` : '<span class="leise frei">frei</span>'}</div>`; }).join('')}
        <button class="zeile" data-act="azn-wie-mo"><span class="blau">Di–Do wie Montag</span></button>
        <div class="leise">${f.i !== undefined ? 'Es gilt immer die jüngste Arbeitszeit, die schon begonnen hat.' : 'Die bisherige Arbeitszeit bleibt gespeichert. Liegt das Datum in der Zukunft, gilt die neue automatisch ab diesem Tag.'}
          ${this.d.arbeitszeiten.some(x => x.auto) ? ' Die automatisch angelegte Arbeitszeit fällt beim Speichern weg.' : ''}</div>
        ${knopf('Speichern', 'azn-speichern', 'amber')}${knopf('Abbrechen', 'zu', 'leise-k')}`;
    }
    if (s.art === 'zeitraum-bs') { const f = s.form ||= { ...this.d.bs, hp: [...this.d.bs.hp] };
      const mon = i => `<select data-hp="${i}">${MONATE.map((m, k) => `<option value="${k + 1}" ${f.hp[i] === k + 1 ? 'selected' : ''}>${m}</option>`).join('')}</select>`;
      return `${griff}<h3>Beginn, Ende, Heizperiode</h3>
      <div class="raster-2"><label class="feld">Beginn<input type="date" value="${f.beginn || ''}" data-bsz="beginn"></label><label class="feld">Ende (geplant)<input type="date" value="${f.ende || ''}" data-bsz="ende"></label></div>
      <div class="leise">Gezählt wird ab Beginn. <b>Beginn leer</b> = automatisch der Tag, an dem die Baustelle angelegt wurde (${datum(this.d.bs.angelegt)}).
        <b>Ende leer</b> = offen; beim Abschließen wird immer der Tag des Abschließens eingetragen – ein geplantes Ende dient nur der Hochrechnung.</div>
      <div class="raster-2"><label class="feld">Heizperiode von${mon(0)}</label><label class="feld">bis${mon(1)}</label></div>
      <div class="leise">Die Auswertung rechnet Verbrauch und Kosten auf die Heizperiode hoch – bis zum Ende der Baustelle, wenn es früher liegt.</div>
      ${knopf('Speichern', 'bsz-speichern', 'amber')}${knopf('Abbrechen', 'zu', 'leise-k')}`; }
    if (s.art === 'container-neu') return `${griff}<h3>Neuer Container</h3>
      <label class="feld">Name<input value="" placeholder="z. B. Lager Nord" data-neu="name"></label>
      <div class="feld">Art<div class="seg klein">${['Container', 'Pumpenschacht'].map(v => `<button data-act="neu-art" data-v="${v}" class="${(s.neuArt || 'Container') === v ? 'on' : ''}">${v}</button>`).join('')}</div></div>
      <label class="feld">Temperaturfühler<select><option>– keiner –</option><option>Poliercontainer Temperatur</option></select></label>
      <label class="feld">Shelly<select><option>Heizung 03 (Shelly Plug S)</option><option>Heizung 04 (Shelly Plug S)</option></select></label>
      <label class="feld">Heizkörper<select><option>Ölradiator</option><option>Konvektor</option></select></label>
      ${knopf('Anlegen', 'neu-anlegen', 'amber')}${knopf('Abbrechen', 'zu', 'leise-k')}`;
    if (s.art === 'bereich') {
      const b = this.b, e = s.edit ||= { bedarf: !!b.bedarf, name: b.name, anschluss: b.anschluss || this.d.anschluesse[0].id, tuer: b.tuer?.sensor || '', firma: b.firma || 'eigen', geraete: b.geraete.map(g => ({ ...g })) };
      const typen = b.pumpe ? ['Pumpe'] : ['Ölradiator', 'Konvektor', 'Steckdose'];
      const wahl = (i, g) => `<select data-ge="typ" data-i="${i}">${typen.map(t => `<option ${g.typ === t ? 'selected' : ''}>${t}</option>`).join('')}</select>`;
      return `${griff}<div class="block-kopf"><h3>Bearbeiten</h3><span class="leise">${b.pumpe ? 'Pumpenschacht' : 'Container'}</span></div>
        <label class="feld">Name<input value="${esc(e.name)}" data-b="name"></label>
        ${b.pumpe ? '' : `<div class="zeile"><div><b>Nur bei Bedarf heizen</b><div class="leise">z. B. Besprechungscontainer: heizt nur per Schalter oder Termin, sonst Frostschutz</div></div>${schalter(e.bedarf, 'ge-bedarf')}</div>`}
        ${b.pumpe ? '' : `<label class="feld">Türkontakt<select data-btuer>${['', 'Tür Polier', 'Tür Magazin', 'Tür Mannschaft (neu)'].map(t => `<option value="${t}" ${(e.tuer || '') === t ? 'selected' : ''}>${t ? `${t} · Shelly Door/Window` : 'keiner'}</option>`).join('')}</select></label>`}
        <label class="feld">Stromanschluss<select data-ban>${this.d.anschluesse.map(a => `<option value="${a.id}" ${e.anschluss === a.id ? 'selected' : ''}>${esc(a.name)} · ${a.phasen === 3 ? '3 × ' : ''}${a.ampere} A</option>`).join('')}</select></label>
        <label class="feld">Firma · für die Abrechnung<select data-bf="firma">${this.d.firmen.map(f => `<option value="${f.id}" ${e.firma === f.id ? 'selected' : ''}>${esc(f.name)}</option>`).join('')}</select></label>
        <div class="gruppe-t">${b.pumpe ? 'Pumpen' : 'Geräte'} · ${e.geraete.filter(g => !g.weg).length}</div>
        ${e.geraete.map((g, i) => g.weg ? `<div class="ge-zeile weg"><span>${esc(g.n)} wird entfernt</span><button class="chip glas-panel" data-act="ge-zurueck" data-i="${i}">rückgängig</button></div>`
          : `<div class="ge-zeile"><div class="ge-felder">
            ${g.neu ? `<select data-ge="shelly" data-i="${i}">${['Heizung 03 · Shelly Plug S', 'Heizung 04 · Shelly Plug S', 'Pumpe 3 · Shelly Plus 1PM'].map(x => `<option ${g.shelly === x ? 'selected' : ''}>${x}</option>`).join('')}</select>` : `<span class="leise ge-shelly">${esc(g.shelly || g.n.toLowerCase().replace(/[^a-z0-9]+/g, '_'))} · Shelly Plug S</span>`}
            <div class="ge-zwei"><input value="${esc(g.n)}" data-ge="n" data-i="${i}" placeholder="Name">${wahl(i, g)}</div></div>
            ${g.neu ? '' : `<button class="bs-ic" data-act="g-bearbeiten" data-i="${i}" title="Gerät bearbeiten" aria-label="${esc(g.n)} bearbeiten">✎</button>`}<button class="x" data-act="ge-weg" data-i="${i}" title="Gerät entfernen">✕</button></div>`).join('')}
        <button class="zeile" data-act="ge-neu"><span class="blau">+ Gerät hinzufügen</span></button>
        <div class="leise">Der Heizkörpertyp gilt nur für den Vergleich Ölradiator/Konvektor. Entfernte Geräte behalten ihre Werte im Verlauf.</div>
        ${knopf('Speichern', 'b-speichern', 'amber')}${knopf('Container entfernen', 'b-weg', 'rot')}${knopf('Abbrechen', 'zu', 'leise-k')}`;
    }
    if (s.art === 'geraet-edit') {   // WU-0004: jedes Gerät bearbeiten (Name, Shelly, Typ, Sensoren, Container, aktiv)
      const b = this.b, g = b.geraete[s.i], f = s.form ||= { n: g.n, typ: g.typ, shelly: g.shelly || `${g.n} · Shelly Plug S`, leistung: 'auto', energie: 'auto', bereich: b.id, aktiv: !g.inaktiv };
      const opt = (liste, wert) => liste.map(([v, t]) => `<option value="${esc(v)}" ${v === wert ? 'selected' : ''}>${esc(t)}</option>`).join('');
      const stamm = f.shelly.split(' · ')[0].toLowerCase().replace(/\s+/g, '_');
      return `${griff}<div class="block-kopf"><h3>Gerät bearbeiten</h3><span class="leise">${esc(b.name)}</span></div>
        <label class="feld">Name<input value="${esc(f.n)}" data-gf="n"></label>
        <label class="feld">Shelly (Schalter)<select data-gf="shelly">${opt([f.shelly, 'Heizung 03 · Shelly Plug S', 'Heizung 04 · Shelly Plug S'].map(x => [x, x]), f.shelly)}</select></label>
        <div class="raster-2"><label class="feld">Typ<select data-gf="typ">${opt(['Ölradiator', 'Konvektor', 'Steckdose'].map(x => [x, x]), f.typ)}</select></label>
          <label class="feld">Container<select data-gf="bereich">${opt(this.d.bereiche.filter(x => !x.pumpe).map(x => [x.id, x.name]), f.bereich)}</select></label></div>
        <label class="feld">Leistungssensor<select data-gf="leistung">${opt([['auto', `automatisch · sensor.${stamm}_leistung`], ['w', `sensor.${stamm}_leistung`]], f.leistung)}</select></label>
        <label class="feld">Energiesensor<select data-gf="energie">${opt([['auto', `automatisch · sensor.${stamm}_energie`], ['e1', `sensor.${stamm}_energie`], ['e2', `sensor.${stamm}_energieverbrauch`]], f.energie)}</select></label>
        <div class="zeile"><div><b>Aktiv</b><div class="leise">aus: die Automatik schaltet das Gerät nicht, es zählt nicht in der Staffelung, keine Warnungen</div></div>${schalter(f.aktiv, 'gf-aktiv')}</div>
        <div class="leise">Neuer Shelly: die Werte des alten bleiben im Verlauf. Anderer Container: Verbrauch zählt ab jetzt dort.</div>
        ${knopf('Speichern', 'gf-speichern', 'amber')}${knopf('Abbrechen', 'zu', 'leise-k')}`;
    }
    if (s.art === 'vl-protokoll') return `${griff}${this.protokoll()}${knopf('Schließen', 'zu', 'leise-k')}`;   // WU-0006
    if (s.art === 'aw-detail') {   // WU-0005: Detail einer Kachel/Karte
      const D = this.awDaten(); return `${griff}<div class="aw-detail">${this.awBlock(s.k, D)}</div>${knopf('Schließen', 'zu', 'leise-k')}`;
    }
    if (s.art === 'lernen') {
      const b = this.b, l = this.lernStand(b), kalt = (s.lk || 'kalt') === 'kalt', soll = b.soll ?? this.d.e.soll;
      const balkenK = (name, k) => `<div class="zeile"><div><b>${name}</b> ${de(k.wert, 3)} <span class="leise">(Start ${de(k.start, 2)})</span>
          <div class="lern-fort"><i style="width:${Math.round(k.fort * 100)}%"></i></div></div><span class="leise">${k.fort >= 1 ? 'gelernt' : `${Math.round(k.fort * 50)}/50 Zyklen`}</span></div>`;
      const zelle = z => z.zyklen ? `<b>+${de(z.grad)} °C</b><span class="leise">${z.min} min · ${z.zyklen}×</span>` : '<span class="leise">noch nicht gelernt</span>';
      const oel = l.nachlauf(true, kalt), kon = l.nachlauf(false, kalt), mittel = l.treffer.reduce((x, y) => x + Math.abs(y), 0) / l.treffer.length;
      return `${griff}<div class="block-kopf"><h3>Lernstand · ${esc(b.name)}</h3><span class="leise">${l.zyklen} Heizzyklen gemessen</span></div>
        <div class="gruppe-t">Regelung (TPI, 10-min-Zyklen)</div>
        ${balkenK('K innen – Trägheit des Raums', l.kint)}${balkenK('K außen – Wärmeverlust nach außen', l.kext)}
        <div class="leise">Einschaltanteil = K innen × (Soll − innen − Nachlauf) + K außen × (Soll − außen)</div>
        <div class="block-kopf"><div class="gruppe-t">Nachlauf nach dem Ausschalten</div><div class="seg klein">${[['kalt', 'kalt < 5 °C'], ['mild', 'mild']].map(([k, t]) => `<button data-act="lern-k" data-v="${k}" class="${(s.lk || 'kalt') === k ? 'on' : ''}">${t}</button>`).join('')}</div></div>
        <div class="lern-tab"><span></span><b>mit Ölradiator</b><b>nur Konvektor</b>
          ${oel.map((z, i) => `<span>${z.t}</span><div>${zelle(z)}</div><div>${zelle(kon[i])}</div>`).join('')}</div>
        <div class="leise">Wie weit die Temperatur nach dem Ausschalten noch steigt und wann die Spitze kommt, je nach Heizdauer davor. Zwei Heizkörper zählen mit ihrer Summe.</div>
        <div class="gruppe-t">Soll getroffen · letzte Zyklen (Soll ${de(soll)} °C)</div>
        <div class="lern-treffer">${l.treffer.map(x => `<span class="${Math.abs(x) <= .3 ? 'gut' : ''}">${x >= 0 ? '+' : '−'}${de(Math.abs(x))}</span>`).join('')}<b>Ø ±${de(mittel)} °C</b></div>
        ${knopf('Lernstand zurücksetzen', 'lern-reset', 'rot')}${knopf('Schließen', 'zu', 'leise-k')}`;
    }
    if (s.art === 'baustelle') { const b = this.d.baustellen[s.i], r = zufall(s.i + 3), m = ['Sep', 'Okt', 'Nov', 'Dez', 'Jän', 'Feb', 'Mär', 'Apr'].slice(0, b.aktiv ? 2 : 6);
      return `${griff}<h3>${esc(b.name)}</h3><div class="leise">${b.zeit}</div>
        <div class="kennz"><div><b>${de(b.kwh, 0)}</b><span>kWh</span></div><div><b>${de(b.eur, 2)} €</b><span>Kosten</span></div><div><b>${b.container}</b><span>Container</span></div></div>
        <div class="chart-wrap">${balken('bs-' + s.i, m.map(() => b.kwh / m.length * (.5 + r())), m, 'kWh', 0)}</div>
        ${b.aktiv ? knopf('Öffnen', 'zu', 'amber') : knopf('Wieder aktiv setzen', 'toast-zu', 'leise-k')}`; }
    /* AN-0002: ✎ im Dialog „Baustellen“ – nur die Daten dieser Baustelle; Technik (Staffelung, Bericht, Meldungen, App) bleibt unter Einstellungen */
    if (s.art === 'bs-bearbeiten') {
      const bs = this.d.baustellen[s.i] || this.d.baustellen[0], d = this.d, e = d.e;
      return `${griff}<div class="block-kopf"><h3>Baustelle bearbeiten</h3><span class="leise">${esc(bs.name)}</span></div>
        <div class="gruppe-t">Baustelle</div>
        <button class="zeile" data-act="sheet" data-s="name"><span>Name</span><span class="leise">${esc(bs.name)} ›</span></button>
        <button class="zeile" data-act="sheet" data-s="zeitraum-bs"><span>Beginn und Ende</span><span class="leise">${this.bsZeit()} ›</span></button>
        <button class="zeile" data-act="sheet" data-s="zeitraum-bs"><span>Heizperiode</span><span class="leise">${MONATE[d.bs.hp[0] - 1]} – ${MONATE[d.bs.hp[1] - 1]} ›</span></button>
        <div class="gruppe-t">Ort</div>
        <button class="zeile" data-act="sheet" data-s="wetterquelle"><span>Wetter</span><span class="leise">Open-Meteo · Zone Baustelle ›</span></button>
        <button class="zeile" data-act="sheet" data-s="wetterquelle"><span>Außentemperatur</span><span class="leise">aus der Vorhersage ›</span></button>
        <div class="gruppe-t">Container und Geräte · ${d.bereiche.length}</div>
        ${d.bereiche.map(b => `<button class="zeile" data-act="bereich-einst" data-id="${b.id}"><span><i class="farbpunkt" style="background:${BEREICH_FARBEN[b.f % 6]}"></i>${esc(b.name)}</span><span class="leise">${b.geraete.length} ${b.pumpe ? 'Pumpen' : 'Geräte'} ›</span></button>`).join('')}
        <button class="zeile" data-act="sheet" data-s="container-neu"><span class="blau">+ Container oder Schacht</span></button>
        <div class="gruppe-t">Strom und Abrechnung</div>
        <label class="zeile"><span>Preis je kWh</span><span class="eingabe"><input type="number" step="0.01" data-k="preis" value="${e.preis}"> €</span></label>
        ${d.firmen.map(f => { const n = d.bereiche.filter(b => (b.firma || 'eigen') === f.id).length;
          return `<button class="zeile" data-act="firma-auf" data-id="${f.id}"><span>${esc(f.name)}${f.eigen ? ' <span class="badge">eigene</span>' : ''}</span><span class="leise">${n} Container ›</span></button>`; }).join('')}
        <button class="zeile" data-act="firma-auf"><span class="blau">+ Firma hinzufügen</span></button>
        ${bs.aktiv ? '<button class="zeile" data-act="sheet" data-s="abschliessen"><span>Baustelle abschließen</span><span class="leise">kommt in den Verlauf ›</span></button>' : ''}
        <div class="leise p-fuss">Staffelung, Bericht, Meldungen und App stehen unter Einstellungen.</div>
        <button class="zeile" data-act="tab" data-v="einst"><span class="blau">Alle Einstellungen</span><span class="chev">›</span></button>
        ${knopf('Fertig', 'zu', 'amber')}`;
    }
    if (s.art === 'abschliessen') return `${griff}<h3>Baustelle abschließen?</h3><div class="leise">Die Heizung wird abgeschaltet. Als Ende wird heute (${datum(HEUTE)}) eingetragen. Werte und Diagramme bleiben im Verlauf, gelöscht wird nichts.</div>${knopf('Abschließen', 'toast-zu', 'rot')}${knopf('Abbrechen', 'zu', 'leise-k')}`;
    if (s.art === 'urlaub') return `${griff}<h3>Urlaub eintragen</h3><label class="feld">Name<input value="${esc(s.form.name)}" placeholder="z. B. Semesterferien" data-ur="name"></label>
      <div class="raster-2"><label class="feld">Von<input type="date" value="${s.form.von}" data-ur="von"></label><label class="feld">Bis<input type="date" value="${s.form.bis}" data-ur="bis"></label></div>
      <div class="leise">Wird in den Kalender „Baustelle Urlaub“ eingetragen; in der Zeit läuft nur der Frostschutz.</div>${knopf('Eintragen', 'urlaub-speichern', 'amber')}${knopf('Abbrechen', 'zu', 'leise-k')}`;
    return `${griff}<h3>${{ name: 'Name', 'baustelle-neu': 'Neue Baustelle', wetterquelle: 'Wetter' }[s.art] || ''}</h3>
      ${s.art === 'wetterquelle' ? `<label class="feld">Wetter<select><option>Open-Meteo · Zone Baustelle Dobl Zwaring</option></select></label><label class="feld">Außentemperatur<select><option>aus der Vorhersage</option></select></label><label class="feld">Regenmenge<select><option>aus der Vorhersage</option></select></label>`
        : `<label class="feld">Name<input value="${s.art === 'name' ? 'ÖWG Dobl Zwaring' : ''}" placeholder="z. B. Wohnbau Kalsdorf"></label>`}
      ${knopf('Speichern', 'toast-zu', 'amber')}`;
  }

  /* Unterdialoge aus „Baustelle bearbeiten“ (AN-0002) kehren beim Schließen dorthin zurück */
  get merke() { const s = this.s.sheet; return s && (s.art === 'bs-bearbeiten' ? s : s.zurueck) || null; }
  get zurueck() { const s = this.s.sheet; return (s && s.zurueck) || null; }

  /* ---- Aktionen ---- */
  klick(ev) {
    const el = ev.target.closest('[data-act]'); if (!el || !this.root.contains(el)) return;
    const a = el.dataset.act, d = this.d, b = this.b;
    const neu = () => this.render();
    switch (a) {
      case 'tab': return this.gehe(el.dataset.v);
      case 'container': this.s.chart = 'temp'; return this.gehe('container', el.dataset.id);
      case 'container-lager': return this.gehe('container', 'lager');
      case 'w-hin': return this.gehe('container', el.dataset.id);
      case 'w-stumm': { const w = d.warnungen.find(x => x.id === el.dataset.id); w.stumm = !w.stumm; neu(); return this.toast(w.stumm ? 'Stumm bis morgen – bleibt im Protokoll' : 'Wird wieder gemeldet'); }
      case 'w-protokoll': this.s.verlauf = 'aktiv'; this.s.pfilter = 'warnung'; return this.gehe('verlauf');
      case 'pfilter': this.s.pfilter = el.dataset.v; this.s.pmehr = false; return neu();
      case 'pmehr': this.s.pmehr = true; return neu();
      case 'sheet': if (el.dataset.s === 'termin') { this.s.sheet = { art: 'termin', form: { b: el.dataset.id || this.s.cid, titel: '', datum: '2026-10-08', von: '09:00', bis: '10:00', wieder: 'einmal', boost: false } }; return neu(); }
      if (el.dataset.s === 'urlaub') { this.s.sheet = { art: 'urlaub', form: { name: '', von: '2027-02-15', bis: '2027-02-19' } }; return neu(); }
      this.s.sheet = { art: el.dataset.s, t: el.dataset.t, i: +el.dataset.i, auswahl: el.dataset.id ? [el.dataset.id] : [], zeitraum: 'Tag', zurueck: this.merke }; return neu();
      case 'wa': this.s.sheet.wa = el.dataset.v; return neu();
      case 'vb-gruppe': { const st = el.dataset.ziel === 'aw' ? this.s.aw : this.s.sheet; st.gruppe = el.dataset.v; st.auswahl = this.quellen(st, el.dataset.ziel).map(q => q.id); return neu(); }
      case 'aw-scope': this.s.awScope = el.dataset.v; this.s.aw.auswahl = this.quellen(this.s.aw, 'aw').map(q => q.id); return neu();
      case 'vb-zeitraum': { const st = el.dataset.ziel === 'aw' ? this.s.aw : this.s.sheet; if (st.zeitraum !== el.dataset.v) st.v = 0; st.zeitraum = el.dataset.v; this.s.zrOffen = false; this.s.zrKal = null; return neu(); }
      case 'zr-schritt': { const aw = this.s.aw; aw.v = Math.max(0, Math.min(zrMax(aw.zeitraum), (aw.v || 0) + +el.dataset.d)); this.s.zrOffen = false; this.s.zrKal = null; return neu(); }
      case 'zr-setz': this.s.aw.v = +el.dataset.v; this.s.zrOffen = false; this.s.zrKal = null; return neu();
      case 'zr-liste': this.s.zrOffen = !this.s.zrOffen; return neu();
      case 'zr-kal': { if (this.s.zrKal) { this.s.zrKal = null; return neu(); } const iso = zrInfo(this.s.aw.zeitraum, this.s.aw.v || 0).iso; this.s.zrKal = { j: +iso.slice(0, 4), m: +iso.slice(5, 7) - 1 }; return neu(); }
      case 'zr-kal-nav': { const k = this.s.zrKal, d = +el.dataset.d, z = this.s.aw.zeitraum;
        if (z === 'Tag' || z === 'Woche') { k.m += d; if (k.m < 0) { k.m = 11; k.j--; } if (k.m > 11) { k.m = 0; k.j++; } } else k.j += d * (z === 'Jahr' ? 12 : 1); return neu(); }
      case 'vb-wer': { const sh = el.dataset.ziel === 'aw' ? this.s.aw : this.s.sheet, id = el.dataset.id;
        if (!id) sh.auswahl = []; else if (id === '*') sh.auswahl = this.quellen(sh, el.dataset.ziel || 'sheet').map(q => q.id);
        else sh.auswahl = sh.auswahl.includes(id) ? sh.auswahl.filter(x => x !== id) : [...sh.auswahl, id];
        return neu(); }
      case 'bereich-einst': this.s.cid = el.dataset.id; this.s.sheet = { art: 'bereich', zurueck: this.merke }; return neu();
      case 'zu': this.s.sheet = this.zurueck; return neu();
      case 'melden': { const namen = { uebersicht: 'Übersicht', container: 'Container', heizung: 'Heizung', auswertung: 'Auswertung', verlauf: 'Verlauf', einst: 'Einstellungen', ueber: 'Über', dev: 'Entwicklung', bsdetail: 'Baustelle (abgeschlossen)' };
        const kontext = [namen[this.s.view] || this.s.view, this.s.view === 'container' && this.b ? this.b.name : '', this.s.sheet ? `Dialog „${this.s.sheet.art}“` : ''].filter(Boolean).join(' · ');
        const geraet = this.root.getBoundingClientRect().width < 700 ? 'Handy' : 'Desktop';
        this.s.sheet = { art: 'melden', vorher: this.s.sheet, form: { art: 'wunsch', text: '', kontext, geraet, stand: true } }; return neu(); }
      case 'ml-art': this.s.sheet.form.art = el.dataset.v; return neu();
      case 'ml-stand': this.s.sheet.form.stand = !this.s.sheet.form.stand; return neu();
      case 'ml-zurueck': this.s.sheet = this.s.sheet.vorher || null; return neu();
      case 'ml-senden': { const f = this.s.sheet.form; if (!f.text.trim()) return this.toast('Bitte kurz beschreiben');
        d.meldungen.unshift({ id: 'm' + Date.now().toString(36), art: f.art, text: f.text.trim(), kontext: f.kontext, zeit: `Di 29.09. ${JETZT}`, version: VERSION, geraet: f.geraet, status: 'offen', stand: f.stand ? { view: this.s.view, cid: this.s.cid } : null });
        this.s.sheet = this.s.sheet.vorher || null; neu(); return this.toast('Danke – steht unter Einstellungen › Entwicklung'); }
      case 'mfilter': this.s.mfilter = el.dataset.v; return neu();
      case 'm-status': { const m = d.meldungen.find(x => x.id === el.dataset.id); m.status = m.status === 'offen' ? 'erledigt' : 'offen'; return neu(); }
      case 'm-weg': d.meldungen = d.meldungen.filter(x => x.id !== el.dataset.id); neu(); return this.toast('Meldung gelöscht');
      case 'm-md': { const md = this.meldungenMarkdown(); if (typeof navigator !== 'undefined' && navigator.clipboard) navigator.clipboard.writeText(md).catch(() => {}); return this.toast(`${d.meldungen.length} Meldungen als Markdown kopiert`); }
      case 'm-json': { const text = JSON.stringify(d.meldungen, null, 2);
        if (typeof Blob !== 'undefined' && typeof document.createElement === 'function') { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type: 'application/json' })); a.download = 'baustelle-meldungen.json'; a.click(); }
        return this.toast('baustelle-meldungen.json'); }
      case 'cl': { const i = +el.dataset.i; this.s.cl = this.s.cl === i ? -1 : i; return neu(); }
      case 'toast': return this.toast(el.dataset.t);
      case 'toast-zu': this.s.sheet = this.zurueck; neu(); return this.toast('Gespeichert');
      case 'auto': this.s.auto = !this.s.auto; neu(); return this.toast(this.s.auto ? 'Automatik ein' : 'Automatik aus – Geräte bleiben, wie sie sind');
      case 'bedarf-auf': this.s.sheet = { art: 'bedarf', cid: el.dataset.id, boost: false }; return neu();
      case 'bedarf-an': { const x = d.bereiche.find(y => y.id === el.dataset.id), v = el.dataset.v;
        x.bedarfBis = v === 'ende' ? '16:30' : v === 'abend' ? '19:00' : uhr(minu(JETZT) + +v); x.z = 'heizt'; x.boost = !!this.s.sheet?.boost; x.geraete.forEach(g => { if (['Ölradiator', 'Konvektor'].includes(g.typ)) { g.an = 1; g.warte = 0; } });
        d.protokoll.unshift(['Heute', JETZT, 'schalten', x.id, `nach Bedarf eingeschaltet bis ${x.bedarfBis}`]); this.s.sheet = this.zurueck; neu(); return this.toast(`${x.name} heizt bis ${x.bedarfBis}`); }
      case 'bedarf-aus': { const x = d.bereiche.find(y => y.id === el.dataset.id); x.bedarfBis = null; x.boost = false; x.z = 'bereit'; x.geraete.forEach(g => g.an = 0);
        d.protokoll.unshift(['Heute', JETZT, 'schalten', x.id, 'Bedarf beendet – nur Frostschutz']); neu(); return this.toast(`${x.name} aus – nur Frostschutz`); }
      case 'termin-weg': { const t = d.termine.splice(+el.dataset.i, 1)[0]; neu(); return this.toast(`Termin „${t.titel}“ gelöscht`); }
      case 'termin-speichern': { const f = this.s.sheet.form; if (!f.titel.trim() || !f.datum || f.bis <= f.von) return this.toast('Bitte Titel, Tag und Uhrzeit prüfen');
        d.termine.push({ b: f.b, datum: f.datum, wieder: f.wieder, boost: f.boost, von: f.von, bis: f.bis, titel: f.titel.trim() });
        this.s.sheet = this.zurueck; neu(); return this.toast(`Eingetragen${f.wieder !== 'einmal' ? ` – ${WIEDER[f.wieder]} am ${wtag(f.datum)}` : ''} – heizt ab ${uhr(minu(f.von) - d.e.vorheizen)}`); }
      case 'bedarf-boost': this.s.sheet.boost = !this.s.sheet.boost; return neu();
      case 'tm-wieder': this.s.sheet.form.wieder = el.dataset.v; return neu();
      case 'tm-boost': this.s.sheet.form.boost = !this.s.sheet.form.boost; return neu();
      case 'boost': { const x = d.bereiche.find(y => y.id === el.dataset.id); x.boost = !x.boost;
        if (x.boost) { x.geraete.forEach(g => { if (['Ölradiator', 'Konvektor'].includes(g.typ)) { g.an = 1; g.warte = 0; } }); if (x.z === 'aus' || x.z === 'bereit') x.z = 'heizt'; }
        d.protokoll.unshift(['Heute', JETZT, 'schalten', x.id, x.boost ? 'Schnell aufheizen gestartet – alle Heizkörper an, Vorrang in der Staffelung' : 'Schnell aufheizen beendet']);
        neu(); return this.toast(x.boost ? `${x.name}: schnell aufheizen` : `${x.name}: normal weiter`); }
      case 'hz-art': this.s.hzArt = el.dataset.v; return neu();
      case 'hz-tag': this.s.hzTag = el.dataset.v; if (el.dataset.art) this.s.hzArt = 'tag'; return neu();
      case 'ausn-neu': { const v = el.dataset.v, az = this.azJetzt.tage;
        const vor = { 'heute-laenger': { datum: HEUTE, art: 'zeiten', von: (az[HEUTE_TAG] || ['07:00'])[0], bis: '18:00', notiz: 'heute länger' },
          'morgen-spaeter': { datum: '2026-09-30', art: 'zeiten', von: '09:00', bis: (az.Mi || ['', '16:30'])[1], notiz: 'morgen später' },
          samstag: { datum: '2026-10-03', art: 'arbeit', von: '07:00', bis: '12:00', notiz: '' }, frei: { datum: '2026-10-02', art: 'frei', von: '07:00', bis: '16:30', notiz: 'Zwickeltag' } }[v]
          || { datum: '2026-10-05', art: 'zeiten', von: '07:00', bis: '16:30', notiz: '' };
        this.s.sheet = { art: 'ausnahme', form: { ...vor } }; return neu(); }
      case 'au-art': this.s.sheet.form.art = el.dataset.v; return neu();
      case 'au-speichern': { const f = this.s.sheet.form; if (!f.datum || (f.art !== 'frei' && f.bis <= f.von)) return this.toast('Bitte Tag und Uhrzeit prüfen');
        d.ausnahmen = d.ausnahmen.filter(x => x.datum !== f.datum); d.ausnahmen.push({ datum: f.datum, art: f.art, von: f.von, bis: f.bis, notiz: f.notiz.trim() });
        d.protokoll.unshift(['Heute', JETZT, 'einstellung', null, `Ausnahme ${wtag(f.datum)} ${kurzDatum(f.datum)}: ${f.art === 'frei' ? 'frei' : `${f.von}–${f.bis}`}${f.notiz.trim() ? ' – ' + f.notiz.trim() : ''}`]);
        this.s.sheet = this.zurueck; neu(); return this.toast(`Ausnahme ${wtag(f.datum)} ${kurzDatum(f.datum)} gespeichert`); }
      case 'ausn-weg': { d.ausnahmen = d.ausnahmen.filter(x => x.datum !== el.dataset.d); neu(); return this.toast('Ausnahme gelöscht – es gilt wieder die Arbeitszeit'); }
      case 'jetzt-an': d.jetztBis = uhr(minu(JETZT) + 60); d.protokoll.unshift(['Heute', JETZT, 'schalten', null, `Alle Container jetzt heizen bis ${d.jetztBis}`]); neu(); return this.toast(`Alle heizen bis ${d.jetztBis}`);
      case 'jetzt-aus': d.jetztBis = null; neu(); return this.toast('Zurück zum Plan');
      case 'b-auto': b.auto = !b.auto; return neu();
      case 'modus': { const x = d.bereiche.find(y => y.id === el.dataset.id); this.modus(x, el.dataset.v); neu(); return this.toast(`${x.name}: ${MODI.find(m => m[0] === x.modus)[1]}`); }
      case 'p-chart': this.s.pchart = el.dataset.v; return neu();
      case 'tv': this.s.tv = el.dataset.v; return neu();
      case 'test-meldung': d.protokoll.unshift(['Heute', JETZT, 'nachricht', null, `An ${d.e.empfaenger}: „Test – Nachrichten der Baustelle kommen an“`]); return this.toast(`Test-Nachricht an ${d.e.empfaenger} gesendet`);
      case 'bsz-speichern': { const f = this.s.sheet.form; if (f.ende && f.ende < (f.beginn || d.bs.angelegt)) return this.toast('Bitte Beginn und Ende prüfen');
        d.bs = { ...d.bs, beginn: f.beginn || null, ende: f.ende || null, hp: f.hp.map(Number) }; this.s.sheet = this.zurueck; neu(); return this.toast('Gespeichert'); }
      case 'b-trocknen': case 'tr-b': { const x = a === 'tr-b' ? d.bereiche.find(y => y.id === el.dataset.id) : b; x.trocknen = !x.trocknen; return neu(); }
      case 'geraet': { const g = b.geraete[+el.dataset.i]; g.an = g.an ? 0 : 1; g.hand = b.auto;
        const an = b.geraete.some(x => x.an); if (b.pumpe) b.z = b.geraete[0].an ? 'laeuft' : 'aus'; else b.z = an ? (b.z === 'aus' ? 'heizt' : b.z) : 'aus';
        neu(); return b.auto && this.toast('Handbetrieb bis zum nächsten Schaltpunkt'); }
      case 'chart': this.s.chart = el.dataset.c; return neu();
      case 'zeitraum': this.s.zeitraum = el.dataset.v; return neu();
      case 'verlauf': this.s.verlauf = el.dataset.v; return neu();
      case 'basis': d.e.basis = el.dataset.v; return neu();
      case 'e-bool': d.e[el.dataset.k] = !d.e[el.dataset.k]; return neu();
      case 'st': { const k = el.dataset.k, min = { nutzbar: 30, max_gleich: 1, min_lauf: 1, takt: 5, tuer_pause: 1, tuer_melden: 1, offline_min: 1, trocken_w: 5, dauer_min: 5, zyklen_h: 2 }[k] || 0;
        if (k === 'frost_aus' && d.e.frost_aus + +el.dataset.d <= d.e.frost_temp) return this.toast('„aus über“ muss über „ein unter“ liegen');
        if (k === 'frost_temp' && d.e.frost_temp + +el.dataset.d >= d.e.frost_aus) return this.toast('„ein unter“ muss unter „aus über“ liegen'); d.e[k] = Math.min(k === 'nutzbar' ? 100 : 1e9, Math.max(min, Math.round((d.e[k] + +el.dataset.d) * 10) / 10)); return neu(); }
      case 'jc-auto': { const x = d.bereiche.find(y => y.id === el.dataset.id); x.auto = !x.auto; return neu(); }
      case 'jc-soll': { const x = d.bereiche.find(y => y.id === el.dataset.id); x.soll = Math.round(((x.soll ?? d.e.soll) + +el.dataset.d) * 2) / 2; return neu(); }
      case 'urlaub-weg': { const u = d.urlaube.splice(+el.dataset.i, 1)[0]; neu(); return this.toast(`${u.name} gelöscht`); }
      case 'urlaub-speichern': { const f = this.s.sheet.form; if (!f.von || !f.bis || f.bis < f.von) return this.toast('Bitte Von und Bis prüfen');
        d.urlaube.push({ name: f.name.trim() || 'Urlaub', von: f.von, bis: f.bis }); d.urlaube.sort((a, b) => a.von.localeCompare(b.von)); this.s.sheet = this.zurueck; neu(); return this.toast('Eingetragen – in der Zeit nur Frostschutz'); }
      case 'vl-reiter': this.s.vlReiter = el.dataset.v; return neu();
      case 'vl-art': this.s.vlArt = el.dataset.v; return neu();
      case 'vl-sort': { const v = el.dataset.v; this.s.vlAb = this.s.vlSort === v ? !(this.s.vlAb !== false) : true; this.s.vlSort = v; return neu(); }
      case 'vgl': this.s.vglArt = el.dataset.v; return neu();
      case 'bs-oeffnen': { const i = +el.dataset.i; if (d.baustellen[i].aktiv) return this.gehe('uebersicht'); this.s.bs = i; return this.gehe('bsdetail'); }
      case 'csv': return this.csv(el.dataset.art);
      case 'firma-auf': { const f = el.dataset.id ? this.firma(el.dataset.id) : null;
        this.s.sheet = { art: 'firma', zurueck: this.merke, form: { id: f?.id, name: f?.name || '', neu: [], container: f ? d.bereiche.filter(b => (b.firma || 'eigen') === f.id).map(b => b.id) : [] } }; return neu(); }
      case 'firma-c': { const c = this.s.sheet.form.container, id = el.dataset.id; this.s.sheet.form.container = c.includes(id) ? c.filter(x => x !== id) : [...c, id]; return neu(); }
      case 'firma-speichern': { const f = this.s.sheet.form; if (!f.name.trim()) return this.toast('Bitte einen Namen eingeben');
        let id = f.id; if (!id) { id = 'f' + Date.now().toString(36); d.firmen.push({ id, name: f.name.trim() }); } else this.firma(id).name = f.name.trim();
        for (const b of d.bereiche) { if (f.container.includes(b.id)) b.firma = id; else if ((b.firma || 'eigen') === id && id !== 'eigen') b.firma = 'eigen'; }
        const neue = f.neu.filter(c => c.name.trim()); for (const c of neue) this.neuerContainer(c.name.trim(), c.art === 'Schacht', id);
        this.s.sheet = this.zurueck; neu(); return this.toast(`${f.name.trim()} gespeichert${neue.length ? ` · ${neue.length} Container angelegt` : ''}`); }
      case 'fc-neu': this.s.sheet.form.neu.push({ name: '', art: 'Container' }); return neu();
      case 'fc-weg': this.s.sheet.form.neu.splice(+el.dataset.i, 1); return neu();
      case 'fc-art': this.s.sheet.form.neu[+el.dataset.i].art = el.dataset.v; return neu();
      case 'firma-weg': { const id = this.s.sheet.form.id; for (const b of d.bereiche) if (b.firma === id) b.firma = 'eigen'; d.firmen = d.firmen.filter(f => f.id !== id); this.s.sheet = this.zurueck; neu(); return this.toast('Firma gelöscht – Container gehören wieder der eigenen Firma'); }
      case 'e-wert': { const v = el.dataset.v; d.e[el.dataset.k] = isNaN(+v) ? v : +v; return neu(); }
      case 'prio': d.bereiche.find(x => x.id === el.dataset.id).prio = el.dataset.v; return neu();
      case 'n-knopf': d.protokoll.unshift(['Heute', JETZT, 'nachricht', el.dataset.b || null, `Knopf „${el.dataset.t}“ in der Nachricht gedrückt`]); return this.toast(`„${el.dataset.t}“ ausgeführt – steht im Protokoll`);
      case 'anschluss-auf': { const a = el.dataset.id ? this.anschluss(el.dataset.id) : null;
        this.s.sheet = { art: 'anschluss', form: { id: a?.id, name: a?.name || '', ampere: a?.ampere || 32, phasen: a?.phasen || 3, reserve: a?.reserve ?? 3, container: a ? d.bereiche.filter(b => b.anschluss === a.id).map(b => b.id) : [] } }; return neu(); }
      case 'an-wert': this.s.sheet.form[el.dataset.k] = +el.dataset.v; return neu();
      case 'an-res': this.s.sheet.form.reserve = Math.max(0, this.s.sheet.form.reserve + +el.dataset.d); return neu();
      case 'an-c': { const c = this.s.sheet.form.container, id = el.dataset.id; this.s.sheet.form.container = c.includes(id) ? c.filter(x => x !== id) : [...c, id]; return neu(); }
      case 'an-speichern': { const f = this.s.sheet.form; if (!f.name.trim()) return this.toast('Bitte einen Namen eingeben');
        let a = f.id && this.anschluss(f.id); if (!a) { a = { id: 'a' + Date.now().toString(36) }; d.anschluesse.push(a); }
        Object.assign(a, { name: f.name.trim(), ampere: f.ampere, phasen: f.phasen, reserve: f.reserve });
        const rest = d.anschluesse.find(x => x !== a) || a;
        for (const b of d.bereiche) { if (f.container.includes(b.id)) b.anschluss = a.id; else if (b.anschluss === a.id && rest !== a) b.anschluss = rest.id; }
        this.s.sheet = this.zurueck; neu(); return this.toast(`${a.name} gespeichert`); }
      case 'an-weg': { const id = this.s.sheet.form.id, rest = d.anschluesse.find(x => x.id !== id); for (const b of d.bereiche) if (b.anschluss === id) b.anschluss = rest.id;
        d.anschluesse = d.anschluesse.filter(x => x.id !== id); this.s.sheet = this.zurueck; neu(); return this.toast(`Gelöscht – Container hängen jetzt an ${rest.name}`); }
      case 'tab-einst': return this.gehe('einst');
      case 'g-bearbeiten': this.s.sheet = { art: 'geraet-edit', i: +el.dataset.i, zurueck: this.s.sheet && this.s.sheet.art === 'bereich' ? this.s.sheet : null }; return neu();
      case 'gf-aktiv': this.s.sheet.form.aktiv = !this.s.sheet.form.aktiv; return neu();
      case 'gf-speichern': { const f = this.s.sheet.form, g = b.geraete[this.s.sheet.i]; Object.assign(g, { n: f.n.trim() || g.n, typ: f.typ, shelly: f.shelly, inaktiv: !f.aktiv });
        if (!f.aktiv) { g.an = 0; g.hand = false; }
        this.s.sheet = this.zurueck; neu(); return this.toast(`${g.n} gespeichert`); }
      case 'g-aktiv': { const g = b.geraete[+el.dataset.i]; g.inaktiv = !g.inaktiv; if (g.inaktiv) { g.an = 0; g.hand = false; }
        neu(); return this.toast(g.inaktiv ? `${g.n} inaktiv – die Automatik lässt es aus` : `${g.n} wieder aktiv`); }
      case 'g-automatik': { const g = b.geraete[+el.dataset.i]; g.hand = false; neu(); return this.toast(`${g.n}: Automatik übernimmt`); }
      case 'aw-bearb': this.s.awBearb = !this.s.awBearb; return neu();
      case 'aw-an': { const x = this.awAuswahl()[+el.dataset.i]; x.an = !x.an; this.awMerken(); return neu(); }
      case 'aw-hoch': case 'aw-runter': { const L = this.awAuswahl(), i = +el.dataset.i, j = a === 'aw-hoch' ? i - 1 : i + 1; if (j < 0 || j >= L.length) return; [L[i], L[j]] = [L[j], L[i]]; this.awMerken(); return neu(); }
      case 'aw-standard': this.awVorlage('misch'); return neu();
      case 'aw-vorlage': this.awVorlage(el.dataset.v); neu(); return this.toast(`Vorlage „${AW_VORLAGEN[el.dataset.v][0]}“ übernommen – frei weiter anpassbar`);
      case 'aw-layout': this.s.awLayout = !this.s.awLayout; this.s.awBearb = false; return neu();
      case 'aw-weg': { const x = this.awAuswahl().filter(y => y.an)[+el.dataset.i]; x.an = false; this.awMerken(); return neu(); }
      case 'aw-stufe': { const x = this.awAuswahl()[+el.dataset.i], st = awStufen(x.k).find(q => q[0] === el.dataset.v); if (!st) return; Object.assign(x, { w: st[1], h: st[2], st: st[0] }); this.awMerken(); return neu(); }
      case 'aw-gruppe': this.s.awGruppe = el.dataset.v; return neu();
      case 'aw-gr': { const x = this.awAuswahl()[+el.dataset.i], k = el.dataset.k; x[k] = Math.max(1, Math.min(k === 'w' ? 4 : 6, x[k] + +el.dataset.d)); this.awMerken(); return neu(); }
      case 'aw-detail': this.s.sheet = { art: 'aw-detail', k: el.dataset.k }; return neu();
      case 'cvd': this.s.cvd = el.dataset.v; return neu();
      case 'c-soll': b.soll = Math.max(5, Math.min(30, this.cvSoll(b) + +el.dataset.d)); return neu();
      case 'b-lernen': b.lernen = !b.lernen; neu(); return this.toast(b.lernen ? `${b.name}: lernende Regelung ein – lernt ab dem nächsten Heizzyklus` : `${b.name}: lernende Regelung aus – Lernstand bleibt`);
      case 'lern-k': this.s.sheet.lk = el.dataset.v; return neu();
      case 'lern-reset': this.s.sheet = this.zurueck; neu(); return this.toast(`${b.name}: Lernstand zurückgesetzt`);
      case 'az-alt': this.s.azAlt = !this.s.azAlt; return neu();
      case 'az-heizung': return this.gehe('heizung');
      case 'az-neu': case 'az-vorlage': { const v = a === 'az-vorlage' ? d.arbeitszeiten[this.s.sheet.i] : this.azJetzt;
        this.s.sheet = { art: 'az-neu', form: { ab: '2026-10-05', name: '', tage: JSON.parse(JSON.stringify(v.tage)) } }; return neu(); }
      case 'az-bearbeiten': { const i = this.s.sheet.i, v = d.arbeitszeiten[i];
        this.s.sheet = { art: 'az-neu', zurueck: this.s.sheet.zurueck, form: { i, ab: v.ab, name: v.auto ? '' : v.name, tage: JSON.parse(JSON.stringify(v.tage)) } }; return neu(); }
      case 'az-weg': { const x = d.arbeitszeiten[this.s.sheet.i]; if (d.arbeitszeiten.length < 2) return this.toast('Die letzte Arbeitszeit bleibt'); d.arbeitszeiten.splice(this.s.sheet.i, 1); this.s.sheet = this.zurueck; neu(); return this.toast(`${x.name} gelöscht`); }
      case 'azn-tag': { const t = el.dataset.t, f = this.s.sheet.form; f.tage[t] = f.tage[t] ? null : [...(f.tage.Mo || ['07:00', '16:30'])]; return neu(); }
      case 'azn-wie-mo': { const f = this.s.sheet.form; for (const t of ['Di', 'Mi', 'Do']) f.tage[t] = f.tage.Mo ? [...f.tage.Mo] : null; return neu(); }
      case 'azn-speichern': { const f = this.s.sheet.form;
        if (!f.ab) return this.toast('Bitte ein Startdatum wählen');
        const bisher = f.i !== undefined ? d.arbeitszeiten[f.i] : null;
        if (d.arbeitszeiten.some(x => x.ab === f.ab && x !== bisher && !x.auto)) return this.toast(`Ab ${datum(f.ab)} gibt es schon eine Arbeitszeit`);
        const eintrag = { ab: f.ab, name: f.name.trim() || `ab ${datum(f.ab)}`, tage: f.tage };
        // FE-0002: eine eigene Arbeitszeit ersetzt die automatisch angelegte
        d.arbeitszeiten = d.arbeitszeiten.filter(x => x !== bisher && !x.auto).concat(eintrag); this.s.sheet = this.zurueck; neu();
        const gilt = this.azJetzt === eintrag;
        return this.toast(bisher ? 'Gespeichert' + (gilt ? ' – gilt jetzt' : '') : f.ab > HEUTE ? `Geplant – gilt ab ${datum(f.ab)}` : gilt ? 'Gilt jetzt – die bisherige bleibt gespeichert' : 'Gespeichert – eine jüngere Arbeitszeit gilt weiter'); }
      case 'neu-art': this.s.sheet.neuArt = el.dataset.v; return neu();
      case 'neu-anlegen': { const name = this.root.querySelector('[data-neu="name"]').value.trim() || 'Neuer Container';
        this.neuerContainer(name, this.s.sheet.neuArt === 'Pumpenschacht', 'eigen'); this.s.sheet = this.zurueck; neu(); return this.toast(`${name} angelegt`); }
      case 'b-speichern': { const e = this.s.sheet.edit, kw = { Ölradiator: 2, Konvektor: 2, Steckdose: .5, Pumpe: .76 };
        if (e.name.trim()) b.name = e.name.trim();
        b.firma = e.firma; b.anschluss = e.anschluss;
        if (e.bedarf !== !!b.bedarf) { b.modus = e.bedarf ? 'bedarf' : b.t !== null ? 'thermo' : 'plan'; b.bedarf = e.bedarf; b.bedarfBis = null; if (e.bedarf) { b.z = 'bereit'; b.geraete.forEach(g => g.an = 0); } else if (b.z === 'bereit') b.z = 'aus'; } b.tuer = e.tuer ? { sensor: e.tuer, offen: b.tuer?.sensor === e.tuer ? b.tuer.offen : 0 } : undefined;
        const weg = e.geraete.filter(g => g.weg).length;
        b.geraete = e.geraete.filter(g => !g.weg).map(g => g.neu ? { n: g.n || g.shelly.split(' · ')[0], typ: g.typ, kw: kw[g.typ], an: 0, hand: false } : { ...g });
        this.s.sheet = this.zurueck; neu(); return this.toast(weg ? `Gespeichert · ${weg} entfernt – Werte bleiben im Verlauf` : 'Gespeichert'); }
      case 'ge-bedarf': this.s.sheet.edit.bedarf = !this.s.sheet.edit.bedarf; return neu();
      case 'ge-weg': { const g = this.s.sheet.edit.geraete[+el.dataset.i]; if (g.neu) this.s.sheet.edit.geraete.splice(+el.dataset.i, 1); else g.weg = true; return neu(); }
      case 'ge-zurueck': this.s.sheet.edit.geraete[+el.dataset.i].weg = false; return neu();
      case 'ge-neu': this.s.sheet.edit.geraete.push({ neu: true, shelly: 'Heizung 03 · Shelly Plug S', n: '', typ: b.pumpe ? 'Pumpe' : 'Ölradiator' }); return neu();
      case 'temp-vb': this.s.tempVb = this.s.tempVb === false; return neu();
      case 'b-weg': d.bereiche = d.bereiche.filter(x => x !== b); this.toast(`${b.name} entfernt – Werte bleiben im Verlauf`); return this.gehe('uebersicht');
    }
  }
  eingabe(ev) {
    const el = ev.target;
    if (el.dataset.k === 'preis') this.d.e.preis = +el.value || 0;
    if ('zrd' in el.dataset && el.value) { this.s.aw.v = Math.max(0, Math.min(zrMax('Tag'), tageAb(el.value, HEUTE))); return this.render(); }
    if (el.dataset.azn) this.s.sheet.form[el.dataset.azn] = el.value;
    if (el.dataset.gf) this.s.sheet.form[el.dataset.gf] = el.value;
    if (el.dataset.vls !== undefined) { this.s.vlSuche = el.value; this.render(); const x = this.root.querySelector('[data-vls]'); if (x && x.focus) { x.focus(); x.setSelectionRange?.(el.value.length, el.value.length); } }
    if (el.dataset.ur) this.s.sheet.form[el.dataset.ur] = el.value;
    if (el.dataset.tm) this.s.sheet.form[el.dataset.tm] = el.value;
    if (el.dataset.au) { this.s.sheet.form[el.dataset.au] = el.value; if (el.dataset.au === 'datum') this.render(); }
    if (el.dataset.ml) this.s.sheet.form[el.dataset.ml] = el.value;
    if (el.dataset.ge) this.s.sheet.edit.geraete[+el.dataset.i][el.dataset.ge] = el.value;
    if (el.dataset.bf) this.s.sheet.edit.firma = el.value;
    if (el.dataset.btuer !== undefined) this.s.sheet.edit.tuer = el.value;
    if (el.dataset.k === 'mail') this.d.e.mail = el.value;
    if (el.dataset.ban !== undefined) { this.s.sheet.edit.anschluss = el.value; this.render(); }
    if (el.dataset.an) this.s.sheet.form[el.dataset.an] = el.value;
    if (el.dataset.fn !== undefined) this.s.sheet.form.name = el.value;
    if (el.dataset.fnc !== undefined) this.s.sheet.form.neu[+el.dataset.fnc].name = el.value;
    if (el.dataset.b === 'name' && this.s.sheet?.edit) this.s.sheet.edit.name = el.value;
    if (el.dataset.azt) this.s.sheet.form.tage[el.dataset.azt][+el.dataset.p] = el.value;
    if (el.dataset.jm) { const x = this.d.bereiche.find(y => y.id === el.dataset.jm); this.modus(x, el.value); this.render(); this.toast(`${x.name}: ${MODI.find(m => m[0] === x.modus)[1]}`); }
    if (el.dataset.bsz) this.s.sheet.form[el.dataset.bsz] = el.value;
    if (el.dataset.hp) this.s.sheet.form.hp[+el.dataset.hp] = +el.value;
  }
  /* Modus je Container (neu 0.8): Zeitplan/Thermostat/Bei Bedarf/Hand/Aus */
  modus(b, m) {
    b.modus = m; b.auto = m !== 'hand'; b.bedarf = m === 'bedarf'; b.boost = false;
    if (m === 'bedarf') { b.bedarfBis = null; b.z = 'bereit'; b.geraete.forEach(g => g.an = 0); }
    else if (m === 'aus') { b.z = b.t !== null && b.t < this.d.e.frost_temp ? 'frost' : 'aus'; b.geraete.forEach(g => g.an = b.z === 'frost' ? 1 : 0); }
    else if (b.z === 'bereit' || b.z === 'aus') { b.z = 'heizt'; b.geraete.forEach(g => { if (['Ölradiator', 'Konvektor'].includes(g.typ)) g.an = 1; }); }
  }
  hover(ev) {
    const svg = ev.target.closest('svg.chart'); if (!svg) return this.tip(null);
    const c = CHARTS[svg.dataset.chart], r = svg.getBoundingClientRect(), fx = (ev.clientX - r.left) / r.width;
    if (c.art === 'streu') {
      const r = svg.getBoundingClientRect(), vx = (ev.clientX - r.left) / r.width * 320, vy = ((ev.clientY ?? 0) - (r.top ?? 0)) / r.width * 320;
      let best = 0, bd = 1e9; c.pkt.forEach((q, i) => { const dd = (c.x(q[0]) - vx) ** 2 + (c.y(q[1]) - vy) ** 2; if (dd < bd) { bd = dd; best = i; } });
      if (bd > 900) { svg.querySelector('.hover').innerHTML = ''; return this.tip(null); }
      const q = c.pkt[best];
      svg.querySelector('.hover').innerHTML = `<circle cx="${c.x(q[0])}" cy="${c.y(q[1])}" r="7" fill="none" stroke="var(--ink)" stroke-width="1.5"/>`;
      return this.tip(ev, `<b>${de(q[0], 1)} °C außen</b><div>${de(q[1], 0)} kWh · ${de(q[1] * this.d.e.preis, 2)} €</div>`);
    }
    if (c.art === 'flaeche') {
      const vx = fx * c.W, i = Math.max(0, Math.min(c.n - 1, Math.round((vx - c.x0) / (c.x1 - c.x0) * (c.n - 1)))), x = c.x0 + i / (c.n - 1) * (c.x1 - c.x0);
      const h = c.einheit === 'kWh/h' || c.einheit === 'kW', sum = c.reihen.reduce((a, r) => a + r.v[i], 0), p = this.d.e.preis, eh = c.einheit === 'kW' ? 'kW' : 'kWh';
      if (c.einheit === 'kW') { svg.querySelector('.hover').innerHTML = `<line x1="${x}" x2="${x}" y1="10" y2="138" class="kreuz"/>` + c.reihen.map(r => `<circle cx="${x}" cy="${c.y(r.o[i])}" r="3.5" fill="${r.farbe}" class="punkt"/>`).join('');
        return this.tip(ev, `<b>${c.labels[i]}:00</b>` + (c.reihen.length > 1 ? [...c.reihen].reverse().map(r => `<div><i style="background:${r.farbe}"></i>${esc(r.name)} <b>${de(r.v[i], 2)} ${eh}</b></div>`).join('') + `<div class="tip-summe">zusammen <b>${de(sum, 2)} ${eh}</b></div>` : `<div>${de(sum, 2)} ${eh}</div>`)); }
      svg.querySelector('.hover').innerHTML = `<line x1="${x}" x2="${x}" y1="10" y2="138" class="kreuz"/>` + c.reihen.map(r => `<circle cx="${x}" cy="${c.y(r.o[i])}" r="3.5" fill="${r.farbe}" class="punkt"/>`).join('');
      return this.tip(ev, `<b>${c.labels[i]}${h ? ':00' : ''}</b>` + (c.reihen.length > 1
        ? [...c.reihen].reverse().map(r => `<div><i style="background:${r.farbe}"></i>${esc(r.name)} <b>${de(r.v[i], 2)} kWh</b></div>`).join('') + `<div class="tip-summe">zusammen <b>${de(sum, 2)} kWh</b> · ${de(sum * p, 2)} €</div>`
        : `<div>${de(sum, 2)} kWh</div><div class="leise">${de(sum * p, 2)} €</div>`));
    }
    if (c.art === 'linien') {
      const vx = fx * c.W, i = Math.max(0, Math.min(c.n - 1, Math.round((vx - c.x0) / (c.x1 - c.x0) * (c.n - 1)))), x = c.x0 + i / (c.n - 1) * (c.x1 - c.x0);
      svg.querySelector('.hover').innerHTML = `<line x1="${x}" x2="${x}" y1="10" y2="${c.unten}" class="kreuz"/>` + c.reihen.map(s => s.v[i] === null ? '' : `<circle cx="${x}" cy="${c.y(s.v[i])}" r="3.5" fill="${s.farbe}" class="punkt"/>`).join('');
      return this.tip(ev, `<b>${c.titel(i)}</b>${c.reihen.map(s => s.v[i] === null ? '' : `<div><i style="background:${s.farbe}"></i>${esc(s.name)} <b>${de(s.v[i])} °C</b></div>`).join('')}`);
    }
    if (c.art === 'linie') {
      const vx = fx * c.W, i = Math.max(0, Math.min(24, Math.round((vx - c.x0) / (c.x1 - c.x0) * 24))), x = c.x0 + i / 24 * (c.x1 - c.x0);
      const v = c.vb ? c.vb[Math.min(i, c.vb.length - 1)] : null, kv = c.reihen.length + 1;
      svg.querySelector('.hover').innerHTML = `<line x1="${x}" x2="${x}" y1="10" y2="${c.unten}" class="kreuz"/>` + c.reihen.map((s, k) => s.v[i] === null ? '' : `<circle cx="${x}" cy="${c.y(s.v[i])}" r="4" fill="var(--s${k + 1})" class="punkt"/>`).join('')
        + (c.vb ? `<circle cx="${x}" cy="${c.yv(v)}" r="3.5" fill="var(--s${kv})" class="punkt"/>` : '');
      this.tip(ev, `<b>${String(i).padStart(2, '0')}:00</b>${c.reihen.map((s, k) => s.v[i] === null ? '' : `<div><i style="background:var(--s${k + 1})"></i>${s.name} <b>${de(s.v[i])} ${c.einheit}</b></div>`).join('')}`
        + (c.vb ? `<div><i style="background:var(--s${kv})"></i>Verbrauch <b>${de(v, 2)} kWh</b></div>` : ''));
    } else {
      const bar = ev.target.closest('.bar'); svg.querySelectorAll('.bar').forEach(x => x.classList.toggle('matt', !!bar && x !== bar));
      if (!bar) return this.tip(null); const i = +bar.dataset.i;
      this.tip(ev, `<b>${c.labels[i]}</b><div>${de(c.werte[i], c.d)} ${c.einheit}</div>`);
    }
  }
  tip(ev, html) {
    const t = this.root.querySelector('.tip'); if (!t) return;
    if (!ev || !html) { t.classList.remove('an'); this.root.querySelectorAll('.chart .hover').forEach(h => h.innerHTML = ''); this.root.querySelectorAll('.bar.matt').forEach(x => x.classList.remove('matt')); return; }
    const r = this.root.getBoundingClientRect(); t.innerHTML = html; t.classList.add('an');
    const x = Math.min(ev.clientX - r.left + 12, r.width - t.offsetWidth - 8); t.style.left = x + 'px'; t.style.top = (ev.clientY - r.top - t.offsetHeight - 12) + 'px';
  }
}
document.querySelectorAll('.app').forEach(el => new App(el));
document.getElementById('modus').onclick = () => { document.body.classList.toggle('hell'); APPS.forEach(a => a.stimmung(false)); };
{ const el = document.getElementById('az-auto'); if (el) el.onclick = () => APPS.forEach(a => { a.d.arbeitszeiten = [{ ...az('2026-09-28', 'Arbeitszeit', ['07:00', '16:30'], ['07:00', '12:30']), auto: true }]; a.gehe('heizung'); }); }
{ const el = document.getElementById('zrvar'); if (el) el.onchange = () => { ZR_VAR = el.value; APPS.forEach(a => { a.s.view = 'auswertung'; a.s.zrOffen = false; a.s.zrKal = null; a.render(true); }); }; }
{ const el = document.getElementById('wetter'); if (el) el.onchange = () => { STIMMUNG.wetter = el.value; APPS.forEach(a => a.stimmung()); }; }
/* Vorführ-Leiste: Datum und Uhrzeit bestimmen den Sonnenstand; Zeitraffer = ein Tag in 48 s */
const datumEl = document.getElementById('datum'), uhrEl = document.getElementById('uhr'), uhrText = document.getElementById('uhr-text'), rafferEl = document.getElementById('raffer');
const zwei = n => String(n).padStart(2, '0');
function zeitAnzeigen() {
  const d = new Date(STIMMUNG.zeit);
  if (datumEl) datumEl.value = `${d.getFullYear()}-${zwei(d.getMonth() + 1)}-${zwei(d.getDate())}`;
  if (uhrEl) uhrEl.value = d.getHours() * 60 + d.getMinutes();
  if (uhrText) uhrText.textContent = `${zwei(d.getHours())}:${zwei(d.getMinutes())}`;
}
function zeitSetzen(ms, neuZeichnen = true) {
  const alt = STIMMUNG.phase; STIMMUNG.zeit = ms; STIMMUNG.phase = phaseAusSonne(vorfuehrSonne(ms));
  zeitAnzeigen(); APPS.forEach(a => a.stimmung(neuZeichnen || alt !== STIMMUNG.phase));
}
function zeitAusLeiste() {
  const [j, m, t] = (datumEl.value || '').split('-').map(Number), d = new Date(STIMMUNG.zeit);
  if (j) d.setFullYear(j, m - 1, t); d.setHours(0, +uhrEl.value, 0, 0); return d.getTime();
}
if (datumEl) datumEl.onchange = () => zeitSetzen(zeitAusLeiste());
if (uhrEl) uhrEl.oninput = () => zeitSetzen(zeitAusLeiste(), false);
let raffer = null;
if (rafferEl) rafferEl.onclick = () => {
  if (raffer) { clearInterval(raffer); raffer = null; rafferEl.textContent = '▶ Zeitraffer'; return; }
  rafferEl.textContent = '⏸ Zeitraffer'; raffer = setInterval(() => zeitSetzen(STIMMUNG.zeit + 6 * 6e4, false), 200);
};
zeitAnzeigen();
