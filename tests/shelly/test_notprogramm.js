// Notprogramm (custom_components/baustelle/shelly/notprogramm.js) in einem nachgebauten Shelly Plug S Gen3 laufen lassen
// (Bauplan 0.7 §9, BSM-016): Speicher (KVS), Relais mit Zähler, BLU-Messwerte, Uhr, Timer, HTTP-Lebenszeichen, Taste.
// Prüft die Fälle aus §9 und die Grenzen des Geräts (BSM-013): höchstens 5 gleichzeitige Aufrufe, Speicherwert ≤ 253
// Zeichen, höchstens 50 Schlüssel, Schlüssel ≤ 42 Zeichen, höchstens 5 Timer.
// Aufruf: node tests/shelly/test_notprogramm.js custom_components/baustelle/shelly/notprogramm.js
'use strict';
const fs = require('fs');
const datei = process.argv[2];
if (!datei) { console.error('Aufruf: node tests/shelly/test_notprogramm.js <notprogramm.js>'); process.exit(2); }
const QUELLE = fs.readFileSync(datei, 'utf8');

const T0 = 1791158400;   // 05.10.2026 00:00 UTC (durch 6 h teilbar)

// Ein Plug: alles, was das Skript vom Gerät sieht
function plug({ kvs = {}, uhr = T0, sensoren = {} } = {}) {
  const p = {
    kvs: { ...kvs }, uhr, sensoren, relais: false, wh: 1000, offen: 0, maxOffen: 0, timer: [], endpunkte: {},
    handler: [], status: [], ereignisse: [], warteschlange: [], schaltungen: [], fehler: [],
  };
  function pruefeKvs() {
    const k = Object.keys(p.kvs);
    if (k.length > 50) p.fehler.push(`mehr als 50 Schlüssel (${k.length})`);
    for (const s of k) {
      if (s.length > 42) p.fehler.push(`Schlüssel zu lang: ${s}`);
      if (String(p.kvs[s]).length > 253) p.fehler.push(`Wert zu lang: ${s} (${String(p.kvs[s]).length})`);
    }
  }
  const rpc = {
    'KVS.GetMany': (a) => {
      const muster = new RegExp('^' + a.match.replace(/\*/g, '.*') + '$');
      return { items: Object.keys(p.kvs).filter(k => muster.test(k)).map(k => ({ key: k, value: p.kvs[k], etag: 'x' })) };
    },
    'KVS.Get': (a) => (a.key in p.kvs ? { value: p.kvs[a.key], etag: 'x' } : null),
    'KVS.Set': (a) => { p.kvs[a.key] = a.value; pruefeKvs(); return { etag: 'x' }; },
    'Switch.Set': (a) => { const war = p.relais; p.relais = a.on; p.schaltungen.push([p.uhr, a.on]); return { was_on: war }; },
  };
  const Shelly = {
    call(methode, args, cb) {
      if (!rpc[methode]) p.fehler.push(`unbekannter Aufruf ${methode}`);
      p.offen++; p.maxOffen = Math.max(p.maxOffen, p.offen);
      if (p.offen > 5) p.fehler.push(`mehr als 5 Aufrufe gleichzeitig (${methode})`);
      p.warteschlange.push(() => { p.offen--; const r = rpc[methode] ? rpc[methode](args) : null; if (cb) cb(r, r === null ? -1 : 0, ''); });
    },
    getComponentStatus(name, id) {
      if (name === 'sys') return { unixtime: p.uhr || null };
      if (name === 'switch' && id === 0) return { id: 0, output: p.relais, aenergy: { total: p.wh } };
      const m = /^bthomesensor:(\d+)$/.exec(name);
      if (m) { const s = p.sensoren[m[1]]; return s ? { id: +m[1], value: s.wert, last_updated_ts: s.ts } : null; }
      p.fehler.push(`unbekannter Status ${name}`); return null;
    },
    addEventHandler(f) { p.handler.push(f); },
    addStatusHandler(f) { p.status.push(f); },
    emitEvent(name, daten) { p.ereignisse.push([name, daten]); },
  };
  const Timer = { set(ms, wiederholen, f) { p.timer.push({ ms, wiederholen, f, naechst: ms }); if (p.timer.length > 5) p.fehler.push('mehr als 5 Timer'); return p.timer.length; } };
  const HTTPServer = { registerEndpoint(name, f) { p.endpunkte[name] = f; } };
  new Function('Shelly', 'Timer', 'HTTPServer', QUELLE)(Shelly, Timer, HTTPServer);

  p.abarbeiten = () => { while (p.warteschlange.length) p.warteschlange.shift()(); };
  // Minuten vergehen lassen; je Minute zieht ein eingeschaltetes Relais 2 kW (≈ 33 Wh)
  p.minuten = (n, jeMinute) => {
    for (let i = 0; i < n; i++) {
      if (p.uhr) p.uhr += 60;
      if (p.relais) p.wh += 2000 / 60;
      if (jeMinute) jeMinute(p);
      for (const t of p.timer) { t.naechst -= 60000; if (t.naechst <= 0) { t.f(); t.naechst += t.ms; } }
      p.abarbeiten();
    }
  };
  p.hb = (abfrage = '') => {
    const res = { code: 0, body: '', send() { this.gesendet = true; } };
    p.endpunkte.hb({ query: abfrage, method: 'GET' }, res);
    p.abarbeiten();
    return JSON.parse(res.body);
  };
  p.sensorTaste = () => { for (const f of p.handler) f({ component: 'bthomedevice:201', id: 201, info: { component: 'bthomedevice:201', id: 201, event: 'single_push', ts: p.uhr } }); p.abarbeiten(); };
  // Taste am Relais (momentary): der Plug schaltet um und meldet die Quelle „button“ (am Gerät geprüft 06.10.2026)
  p.taste = () => { p.relais = !p.relais; for (const f of p.status) f({ component: 'switch:0', id: 0, delta: { id: 0, output: p.relais, source: 'button' } }); p.abarbeiten(); };
  p.haSchaltet = an => { p.relais = an; for (const f of p.status) f({ component: 'switch:0', id: 0, delta: { id: 0, output: an, source: 'WS_in' } }); p.abarbeiten(); };
  p.abarbeiten();
  return p;
}

const cfg = (x = {}) => JSON.stringify({ v: 1, m: 'thermo', tol: 0.3, fe: 5, fa: 7, t: 202, d: null, tp: 3, ...x });
const fenster = (...f) => f.map(([s, e, soll]) => `${T0 + s * 3600},${T0 + e * 3600},${soll}`).join(';');
const frisch = (wert) => ({ wert, ts: T0 });   // ts wird in den Fällen nachgezogen
function fuehler(p, nr, wert) { p.sensoren[nr] = { wert, ts: p.uhr }; }

let fehlerZahl = 0, faelle = 0;
function fall(name, f) {
  faelle++;
  try { const p = f(); if (p && p.fehler.length) throw new Error(p.fehler.join('; ')); console.log(`ok   ${name}`); }
  catch (e) { fehlerZahl++; console.log(`FEHL ${name}\n     ${e.message}`); }
}
function gleich(ist, soll, was) { if (JSON.stringify(ist) !== JSON.stringify(soll)) throw new Error(`${was}: ist ${JSON.stringify(ist)}, soll ${JSON.stringify(soll)}`); }

// Grundstand: Thermostat 20 °C von 6–18 Uhr, Fühler 202 sendet laufend
const GRUND = { bs_cfg: cfg(), bs_p0: fenster([6, 18, 20]) };
function mitFuehler(wert) { return (p) => fuehler(p, 202, typeof wert === 'function' ? wert(p) : wert); }

fall('Programm wird beim Start mit einem Aufruf geladen', () => {
  const p = plug({ kvs: { ...GRUND, bs_p1: fenster([30, 42, 21]), anderes: 'x' } });
  const a = p.hb();
  gleich([a.v, a.programm, a.fenster], [7, 1, 2], 'hb-Antwort (Version, Programm, Fenster)');
  gleich(p.maxOffen, 1, 'gleichzeitige Aufrufe beim Laden');
  return p;
});

fall('Nach dem Start: 15 min warten, bevor das Skript übernimmt', () => {
  const p = plug({ kvs: { ...GRUND, bs_cfg: cfg({ m: 'plan' }) }, uhr: T0 + 7 * 3600 });
  p.minuten(15);
  gleich(p.schaltungen, [], 'in den ersten 15 min');
  p.minuten(1);
  gleich(p.relais, true, 'danach Zeitplan');
  gleich(p.hb().nb > 0, true, 'hb meldet den Notbetrieb');
  gleich(p.hb().nb, 0, 'danach nicht mehr');
  return p;
});

fall('Lebenszeichen frisch: das Skript schaltet nicht', () => {
  const p = plug({ kvs: GRUND, uhr: T0 + 7 * 3600 });   // 07:00, im Fenster, zu kalt
  for (let i = 0; i < 12; i++) { p.hb(); p.minuten(5, mitFuehler(15)); }
  gleich(p.schaltungen, [], 'Schaltungen mit HA');
  return p;
});

fall('Lebenszeichen bleibt aus: Thermostat übernimmt nach 15 min', () => {
  const p = plug({ kvs: GRUND, uhr: T0 + 7 * 3600 });
  p.hb();
  p.minuten(15, mitFuehler(15));
  gleich(p.schaltungen, [], 'bis 15 min ohne Lebenszeichen');
  p.minuten(1, mitFuehler(15));
  gleich(p.relais, true, 'Relais nach 16 min (15 °C < 19,7)');
  p.minuten(10, mitFuehler(20));
  gleich(p.relais, true, 'innerhalb der Toleranz bleibt der Zustand');
  p.minuten(1, mitFuehler(20.5));
  gleich(p.relais, false, 'über Soll + Toleranz aus');
  p.minuten(1, mitFuehler(20));
  gleich(p.relais, false, 'innerhalb der Toleranz bleibt aus');
  return p;
});

fall('Fenster endet: aus; HA meldet sich zurück: Skript hält still', () => {
  const p = plug({ kvs: { ...GRUND, bs_cfg: cfg({ m: 'plan' }) } });
  p.minuten(17 * 60); p.hb();
  p.minuten(20);
  gleich(p.relais, true, 'Zeitplan im Fenster ein');
  p.minuten(45);                            // 18:05
  gleich(p.relais, false, 'nach dem Fenster aus');
  p.hb(); const n = p.schaltungen.length;
  p.relais = true;                          // HA schaltet ein
  p.minuten(10);
  gleich(p.schaltungen.length, n, 'nach dem Lebenszeichen keine Schaltung');
  gleich(p.relais, true, 'Relais bleibt, wie HA es will');
  return p;
});

fall('Frostschutz in jedem Modus, mit Rückschaltung', () => {
  const p = plug({ kvs: { ...GRUND, bs_cfg: cfg({ m: 'aus' }) } });
  p.minuten(2 * 60); p.hb(); p.minuten(16, mitFuehler(8));
  gleich(p.schaltungen, [], 'Modus aus, warm genug: bleibt aus');
  p.minuten(1, mitFuehler(4.5));
  gleich(p.relais, true, 'unter 5 °C ein');
  p.minuten(10, mitFuehler(6));
  gleich(p.relais, true, 'zwischen 5 und 7 °C bleibt ein');
  p.minuten(1, mitFuehler(7));
  gleich(p.relais, false, 'Modus aus: ab 7 °C wieder aus');
  return p;
});

fall('Hand: nach dem Frost einmal aus, danach nicht anfassen', () => {
  const p = plug({ kvs: { ...GRUND, bs_cfg: cfg({ m: 'hand' }) }, uhr: T0 + 2 * 3600 });
  p.hb(); p.minuten(16, mitFuehler(4));
  gleich(p.relais, true, 'Frost ein');
  p.minuten(1, mitFuehler(7.2));
  gleich(p.relais, false, 'Frost vorbei: aus');
  p.relais = true;                          // jemand schaltet von Hand ein
  p.minuten(30, mitFuehler(8));
  gleich(p.relais, true, 'danach nicht mehr anfassen');
  return p;
});

fall('Frostschutz vorbei außerhalb des Fensters: Zeitplan schaltet aus', () => {
  const p = plug({ kvs: GRUND });
  p.minuten(2 * 60); p.hb(); p.minuten(16, mitFuehler(4));
  gleich(p.relais, true, 'Frost ein');
  p.minuten(1, mitFuehler(7.5));
  gleich(p.relais, false, 'über 7 °C, kein Fenster: aus');
  return p;
});

fall('Ohne Uhrzeit: nur Frostschutz', () => {
  const p = plug({ kvs: { ...GRUND, bs_cfg: cfg({ m: 'plan' }) }, uhr: 0 });
  p.relais = true;
  p.minuten(30, (q) => { q.sensoren[202] = { wert: 10, ts: 0 }; });
  gleich(p.relais, false, 'ohne Uhrzeit aus');
  p.minuten(1, (q) => { q.sensoren[202] = { wert: 3, ts: 0 }; });
  gleich(p.relais, true, 'ohne Uhrzeit unter 5 °C ein');
  gleich(Object.keys(p.kvs).filter(k => k.startsWith('bb_')), [], 'ohne Uhrzeit kein Stundenbuch');
  return p;
});

fall('Fühler veraltet: Thermostat wie Zeitplan, kein Frostschutz', () => {
  const p = plug({ kvs: GRUND });
  p.sensoren[202] = { wert: 25, ts: T0 };    // letzter Wert um 00:00
  p.minuten(7 * 60); p.hb(); p.minuten(16);
  gleich(p.relais, true, 'Fühler 7 h alt: im Fenster ein, trotz 25 °C');
  p.minuten(11 * 60);
  gleich(p.relais, false, 'nach dem Fenster aus');
  p.sensoren[202] = { wert: 2, ts: p.uhr - 3600 };
  p.minuten(1);
  gleich(p.relais, false, 'veralteter Frostwert schaltet nicht');
  return p;
});

fall('Tür länger offen als die Pause: aus, danach wieder Programm', () => {
  const p = plug({ kvs: { ...GRUND, bs_cfg: cfg({ m: 'plan', d: 201 }) } });
  p.minuten(7 * 60); p.hb(); p.minuten(16);
  gleich(p.relais, true, 'Fenster ein');
  p.minuten(3, (q) => fuehler(q, 201, true));
  gleich(p.relais, true, 'Tür 3 min offen: noch ein');
  p.minuten(2, (q) => fuehler(q, 201, true));
  gleich(p.relais, false, 'Tür über 3 min offen: aus');
  p.minuten(1, (q) => fuehler(q, 201, false));
  gleich(p.relais, true, 'Tür zu: wieder ein');
  return p;
});

fall('BSM-034.03: mehrere Türen und Fenster – irgendeiner offen pausiert', () => {
  const p = plug({ kvs: { ...GRUND, bs_cfg: cfg({ m: 'plan', d: [201, 205] }) } });
  p.minuten(7 * 60); p.hb(); p.minuten(16);
  gleich(p.relais, true, 'Fenster ein');
  p.minuten(2, (q) => fuehler(q, 205, true));
  gleich(p.relais, true, 'Fenster 2 min gekippt: noch ein');
  p.minuten(1, (q) => { fuehler(q, 205, true); fuehler(q, 201, true); });
  p.minuten(2, (q) => { fuehler(q, 205, false); fuehler(q, 201, true); });
  gleich(p.relais, false, 'Fenster zu, Tür noch offen – seit über 3 min irgendein Kontakt offen: aus');
  p.minuten(1, (q) => { fuehler(q, 205, false); fuehler(q, 201, false); });
  gleich(p.relais, true, 'alle zu: wieder ein');
  return p;
});

fall('Hand: das Skript fasst das Relais nicht an', () => {
  const p = plug({ kvs: { ...GRUND, bs_cfg: cfg({ m: 'hand' }) } });
  p.minuten(7 * 60); p.hb(); p.relais = true;
  p.minuten(12 * 60, mitFuehler(25));
  gleich(p.schaltungen, [], 'Schaltungen im Modus Hand');
  return p;
});

fall('Taste mit HA: nur melden; ohne HA: 1 h heizen, zweites Drücken beendet', () => {
  const p = plug({ kvs: GRUND, uhr: T0 + 20 * 3600 });
  p.hb();
  p.taste();
  gleich(p.ereignisse.length, 1, 'Ereignis an HA');
  gleich(p.ereignisse[0][1].bis, p.uhr + 3600, 'Ereignis nennt das Ende');
  gleich(p.schaltungen, [], 'mit HA schaltet die Taste nicht selbst');
  p.taste();                                // beenden
  gleich(p.ereignisse[1][1].bis, 0, 'zweites Drücken beendet');
  p.minuten(20, mitFuehler(18));            // jetzt ohne HA, außerhalb des Fensters
  gleich(p.relais, false, 'ohne Fenster aus');
  p.taste();
  gleich(p.relais, true, 'ohne HA: Taste schaltet sofort ein');
  p.minuten(59, mitFuehler(18));
  gleich(p.relais, true, 'eine Stunde lang ein');
  p.minuten(2, mitFuehler(18));
  gleich(p.relais, false, 'nach einer Stunde aus');
  p.taste(); p.taste();
  gleich(p.relais, false, 'ein und gleich wieder aus');
  return p;
});

fall('Schalten durch HA zählt nicht als Taste', () => {
  const p = plug({ kvs: GRUND, uhr: T0 + 10 * 3600 });
  p.hb(); p.haSchaltet(true); p.haSchaltet(false);
  gleich(p.ereignisse, [], 'kein Tastenereignis');
  gleich(p.hb().taste, 0, 'Taste nicht gesetzt');
  return p;
});

fall('Taste eines Bluetooth-Sensors zählt nicht als Taste am Plug', () => {
  const p = plug({ kvs: GRUND, uhr: T0 + 20 * 3600 });
  p.hb(); p.minuten(20, mitFuehler(18));
  p.sensorTaste();
  gleich(p.ereignisse, [], 'kein Ereignis an HA');
  gleich(p.hb().taste, 0, 'Taste nicht gesetzt');
  gleich(p.relais, false, 'ohne HA nicht eingeschaltet');
  return p;
});

fall('hb?neu lädt das geänderte Programm', () => {
  const p = plug({ kvs: GRUND });
  p.kvs.bs_p0 = fenster([6, 18, 20], [20, 22, 18]);
  p.kvs.bs_cfg = cfg({ v: 2 });
  gleich(p.hb().fenster, 1, 'ohne neu: alter Stand');
  const a = p.hb('neu');
  gleich([a.programm, a.fenster], [1, 1], 'Antwort kommt vor dem Laden');
  gleich([p.hb().programm, p.hb().fenster], [2, 2], 'danach neuer Stand');
  return p;
});

fall('Stundenbuch: eine Woche Notbetrieb, Werte ≤ 253 Zeichen, Ring', () => {
  const kvs = { ...GRUND, bs_cfg: cfg({ m: 'plan', d: 201 }) };
  for (let tag = 0; tag < 7; tag++) kvs['bs_p' + tag] = fenster([24 * tag + 6, 24 * tag + 18, 20]);
  const p = plug({ kvs });
  p.hb();
  // 9 Tage ohne HA, Fühler wechselt, Tür jede Stunde kurz offen
  p.minuten(9 * 24 * 60, (q) => { fuehler(q, 202, 18 + (q.uhr / 60 % 50) / 10); fuehler(q, 201, q.uhr / 60 % 60 < 2); });
  const bb = Object.keys(p.kvs).filter(k => k.startsWith('bb_'));
  gleich(bb.length, 28, 'Schlüssel im Ring');
  const zeilen = bb.flatMap(k => p.kvs[k].split(';').map(z => z.split(',').map(Number)));
  for (const k of bb) {
    const st = p.kvs[k].split(';').map(z => +z.split(',')[0]);
    if (new Set(st.map(s => Math.floor(s / 6))).size !== 1) throw new Error(`${k} mischt Blöcke: ${p.kvs[k]}`);
  }
  const ende = Math.floor(p.uhr / 3600);
  if (Math.min(...zeilen.map(z => z[0])) < ende - 7 * 24) throw new Error('Ring hält älter als 7 Tage');
  const voll = zeilen.find(z => z[0] === Math.floor(T0 / 3600) + 6 * 24 + 10);   // Tag 7, 10–11 Uhr
  gleich(voll && voll[2], 60, 'Minuten ein in einer Heizstunde');
  if (!(voll[1] > 0 && voll[1] <= 2000)) throw new Error(`Wh unplausibel: ${voll[1]}`);
  if (!(voll[3] >= 180 && voll[3] <= 230)) throw new Error(`Temperatur*10 unplausibel: ${voll[3]}`);
  gleich(voll[4], 120, 'Tür offen in s');
  const nacht = zeilen.find(z => z[0] === Math.floor(T0 / 3600) + 6 * 24 + 2);
  gleich([nacht[1], nacht[2]], [0, 0], 'Nachtstunde ohne Strom');
  console.log(`     längster Wert ${Math.max(...bb.map(k => p.kvs[k].length))} Zeichen, höchstens ${p.maxOffen} Aufrufe gleichzeitig`);
  return p;
});

fall('Rückkehr von HA: angefangene Stunde kommt beim ersten Lebenszeichen ins Buch', () => {
  const p = plug({ kvs: { ...GRUND, bs_cfg: cfg({ m: 'plan' }) }, uhr: T0 + 7 * 3600 });
  p.hb(); p.minuten(16 + 60 + 25);          // Notbetrieb ab 07:16, 08:00 Stundenwechsel, jetzt 08:41
  const h8 = Math.floor(T0 / 3600) + 8;
  const vorher = Object.values(p.kvs).filter(v => String(v).includes(h8 + ',')).length;
  gleich(vorher, 0, 'Stunde 8 noch nicht im Buch');
  gleich(p.hb().nb > 0, true, 'Antwort nennt den Notbetrieb');
  const zeile = Object.values(p.kvs).join(';').split(';').find(z => z.startsWith(h8 + ','));
  gleich(!!zeile, true, 'Stunde 8 nach dem Lebenszeichen im Buch');
  gleich(+zeile.split(',')[2], 42, 'Minuten ein in der angefangenen Stunde (Takte 08:00 … 08:41)');
  const n = JSON.stringify(p.kvs); p.hb(); p.minuten(10); for (let i = 0; i < 3; i++) { p.hb(); p.minuten(5); }
  gleich(JSON.stringify(p.kvs), n, 'danach schreibt es nichts mehr');
  return p;
});

fall('Rückkehr von HA: Buch bleibt, nichts wird mehr geschrieben', () => {
  const p = plug({ kvs: GRUND });
  p.hb(); p.minuten(3 * 60);
  if (!Object.keys(p.kvs).some(k => k.startsWith('bb_'))) throw new Error('kein Stundenbuch im Notbetrieb');
  p.hb();                                   // schreibt die angefangene Stunde
  const vorher = JSON.stringify(p.kvs);
  for (let i = 0; i < 36; i++) { p.minuten(5); p.hb(); }
  gleich(JSON.stringify(p.kvs), vorher, 'Speicher mit HA unverändert');
  return p;
});

fall('Ohne Programm im Speicher: das Skript tut nichts', () => {
  const p = plug({ kvs: {} });
  p.relais = true;
  p.minuten(24 * 60, mitFuehler(2));
  gleich(p.schaltungen, [], 'Schaltungen ohne bs_cfg');
  gleich(p.hb().programm, null, 'hb meldet kein Programm');
  return p;
});


// ---------------------------------------------------------------- Audit 0.8.165: Frost ohne Fühler, Startversatz, nur Frost
fall('Ohne Fühler: Frost-Fenster aus der Vorhersage heizen, außerhalb aus', () => {
  const frostF = `${T0 + 20 * 3600},${T0 + 26 * 3600}`;   // 20–02 Uhr unter der Frostgrenze außen
  const p = plug({ kvs: { ...GRUND, bs_f: frostF }, uhr: T0 + 19 * 3600 });
  p.minuten(16);                                          // Notbetrieb, kein Fühlerwert, außerhalb der Heizzeit
  gleich(p.relais, false, '19:16 ohne Frost-Fenster');
  p.minuten(60);
  gleich(p.relais, true, '20:16 im Frost-Fenster');
  p.minuten(6 * 60);
  gleich(p.relais, false, 'nach dem Frost-Fenster');
  return p;
});

fall('Frost-Fenster gelten nicht ohne Frostschutz und nicht mit frischem Fühler', () => {
  const frostF = `${T0 + 20 * 3600},${T0 + 26 * 3600}`;
  const ohne = plug({ kvs: { ...GRUND, bs_cfg: cfg({ fe: null, fa: null }), bs_f: frostF }, uhr: T0 + 19 * 3600 });
  ohne.minuten(90);
  gleich(ohne.relais, false, 'Frostschutz aus');
  const mit = plug({ kvs: { ...GRUND, bs_f: frostF }, uhr: T0 + 19 * 3600 });
  mit.minuten(90, mitFuehler(12));
  gleich(mit.relais, false, 'Fühler sagt 12 °C');
  return mit;
});

fall('Startversatz: ein erst nach vs Minuten, aus sofort', () => {
  const p = plug({ kvs: { ...GRUND, bs_cfg: cfg({ m: 'plan', vs: 3 }) }, uhr: T0 + 7 * 3600 });
  p.minuten(16);
  gleich(p.relais, false, 'erste Minute im Notbetrieb');
  p.minuten(2);
  gleich(p.relais, false, 'nach 2 min');
  p.minuten(1);
  gleich(p.relais, true, 'nach 3 min + 1');
  p.minuten(11 * 60);                                     // 18:xx – Fenster vorbei
  gleich(p.relais, false, 'aus ohne Versatz');
  return p;
});

fall('Nur Frostschutz (Anschluss zu voll): kein Plan, aber Frost und Taste', () => {
  const p = plug({ kvs: { ...GRUND, bs_cfg: cfg({ m: 'plan', nf: 1 }) }, uhr: T0 + 7 * 3600 });
  p.minuten(30, mitFuehler(15));
  gleich(p.schaltungen, [], 'im Fenster, aber nur Frost');
  p.minuten(1, mitFuehler(3));
  gleich(p.relais, true, 'Frost');
  p.minuten(1, mitFuehler(8));
  gleich(p.relais, false, 'Frost vorbei');
  p.taste();
  gleich(p.relais, true, 'Taste: 1 h heizen');
  p.minuten(5, mitFuehler(8));
  gleich(p.relais, true, 'Taste hält');
  return p;
});

console.log(`${faelle - fehlerZahl}/${faelle} Fälle bestanden`);
process.exit(fehlerZahl ? 1 : 0);
