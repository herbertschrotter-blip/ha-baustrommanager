// Zuordnungstabellen der Seite „Baustelle“: Zustände, Modi, Gerätetypen, Meldungsarten → Anzeige (BSM-022 Stufe 1c).
import { de, zahl } from './hilfen.js';
import { BEREICH_FARBEN, bcContainer, bcSchacht } from './symbole.js';
export const FARBE = { bereit: '#8e8e93', heizt: '#ff9f0a', trocknen: '#ff9f0a', aus: '#8e8e93', frost: '#64d2ff', offline: '#ff453a', laeuft: '#0a84ff', pause: '#bf5af2' };

export const WIEDER = { einmal: 'einmalig', woche: 'jede Woche', '2wochen': 'alle 2 Wochen' };

export const AUSNAHME = { arbeit: 'zusätzlich arbeiten', zeiten: 'andere Zeiten', frei: 'frei' };

/* Zuordnung der Geräte: Rolle und Typ der Integration → Anzeige wie im Mockup */
export const HEIZER = g => ['heizung', 'heizkoerper'].includes(g.rolle);

export const TYP_TEXT = g => g.rolle === 'pumpe' ? 'Pumpe' : HEIZER(g) ? (g.typ === 'konvektor' ? 'Konvektor' : 'Ölradiator')
  : ['trockner', 'bautrockner'].includes(g.rolle) ? 'Bautrockner' : 'Steckdose';

/* Modus je Container (0.7.8): wie im Mockup, Thermostat nur mit Fühler */
export const MODI = [['plan', 'Zeitplan'], ['thermo', 'Thermostat'], ['bedarf', 'Bei Bedarf'], ['hand', 'Hand'], ['aus', 'Aus']];

export const FREI_TEXT = { frost: 'nur Frostschutz', absenk: 'abgesenkt', aus: 'alles aus' };

export const ARTEN = { m_selbst: 'selbst_ein', m_offline: 'offline', m_trocken: 'trockenlauf', m_dauer: 'dauerlauf', m_zyklen: 'zyklen_oft', m_leistung: 'keine_leistung', m_frost: 'frostgefahr',
  m_kalt: 'zu_kalt', m_fuehler: 'fuehler_fehlt', m_wetter: 'kein_wetter', m_hand: 'hand_zu_lange' };
export const TICKET_STATUS = { neu: 'neu', angenommen: 'angenommen', in_arbeit: 'in Arbeit', geloest: 'gelöst', geschlossen: 'geschlossen', verworfen: 'verworfen', offen: 'neu', erledigt: 'geschlossen' };

/* Container und Schächte: Zustandstext, Leistung jetzt, Wert und Bild der Kachel (BSM-022 Stufe 3c aus der Seite) */
export const kwVon = b => zahl(b.kw) ? Number(b.kw) : b.geraete.reduce((s, g) => s + (g.an ? g.kw : 0), 0);
export const wertHtml = b => b.pumpe ? `${zahl(b.zyklen) ? b.zyklen : '–'}<small> Zyklen</small>` : b.t !== null ? `${de(b.t)}<small>°C</small>` : '–';
export const illu = b => b.pumpe ? bcSchacht(b.z === 'laeuft') : bcContainer(BEREICH_FARBEN[b.f % BEREICH_FARBEN.length], b.z === 'pause' || b.z === 'bereit' ? 'aus' : b.z, b);
const TEXT_MOCKUP = b => b.boost ? '⚡ schnell aufheizen' : ({ heizt: b.bedarf && b.bedarfBis ? `heizt bis ${b.bedarfBis}` : b.t === null ? 'an · Thermostat regelt' : 'heizt · Arbeitszeit',
  trocknen: 'Kleidung trocknen', aus: 'aus', frost: 'Frostschutz', offline: 'nicht erreichbar', laeuft: 'Pumpe läuft', pause: 'pausiert · Tür offen', bereit: 'bei Bedarf · nur Frostschutz' })[b.z] || '';
export const TEXT = b => b.text || TEXT_MOCKUP(b);

/* Warum ein Gerät wartet (Staffelung der Integration) */
export const WARTE = { anschluss_voll: a => `${a} ausgelastet`, max_gleichzeitig: () => 'höchstens gleichzeitig erreicht', mindestpause: () => 'Mindestpause',
  rundlauf: () => 'Rundlauf', anlauf: () => 'Anlaufstaffel' };

/* Zustand des Wetters (weather.*) → Text */
export const WETTER_TEXT = { sunny: 'Sonnig', 'clear-night': 'Klar', exceptional: 'Unwetter', partlycloudy: 'Heiter', 'partlycloudy-night': 'Heiter', cloudy: 'Bewölkt', windy: 'Windig', 'windy-variant': 'Windig',
  rainy: 'Regen', pouring: 'Starkregen', hail: 'Hagel', lightning: 'Gewitter', 'lightning-rainy': 'Gewitter', fog: 'Nebel', snowy: 'Schnee', 'snowy-rainy': 'Schneeregen' };
