// Beispiel-hass der Seite „Baustelle“: Zustände, Statistik, Verlauf und Antworten der Integration wie im echten HA.
// Eine Quelle für den Panel-Test (tests/panel/test_panel.js, Node) und das Master-Mockup (mockups/glas.html, Browser).
// beispielHass({ STRUKTUR, REFERENZ, ZUSTAENDE, VEKTOR, WELT, JETZT, welt, fehlt, haengt, mit, mitRest })
//   welt(): aktuelle Baustellen (der Test tauscht sie aus) · fehlt()/haengt(): Struktur-Fehler bzw. hängt
//   mit(m)/mitRest(r): jeden WebSocket- bzw. REST-Aufruf mitschreiben
(function (wurzel) {
'use strict';
/* BSM-033.03: Hochrechnung wie baustelle/auswertung › hochrechnung (logik/hochrechnung): Tagesreihe der Heizperiode,
   je Container Signatur mit Punkten, Klimamittel und Vorhersage – Beispielwerte (Modell kWh = Grundlast + je Grad · (Grenze − außen)) */
const KLIMA_BSP = [0.3, 2.0, 6.3, 11.1, 15.6, 19.4, 21.1, 20.6, 15.8, 10.6, 5.4, 1.0];
function beispielHochrechnung(b, preis) {
  const C = b.bereiche.filter(c => c.art !== 'pumpenschacht'), P = [[15.5, 1.9, 2.1, 0.12], [14.0, 2.4, 1.6, 0.17], [16.0, 2.1, 2.4, 0.24], [13.0, 0.9, 0.8, 0.27]];
  const sig = C.map((c, i) => { const [g, k, d0, cv] = P[i % 4];
    return { bereich: c.id, methode: 'signatur', stand: cv <= 0.2 ? 'gut' : 'brauchbar', grund: null, tage: 30 + i, grenze: g, kwh_je_grad: k, grundlast: d0, cv_rmse: cv,
      punkte: Array.from({ length: 24 }, (_, n) => { const t = -4 + (n * 7 + i * 3) % 22; return [t, +(d0 + k * Math.max(0, g - t) + Math.sin(n * 2.3 + i) * cv * 4).toFixed(2)]; }) }; });
  const tagKwh = t => sig.reduce((s, c) => s + c.grundlast + c.kwh_je_grad * Math.max(0, c.grenze - t), 0);
  const reihe = [], start = Date.UTC(2025, 9, 1), n = 212, heute = 106;
  let ist = 0, mit = 0, unten = 0, oben = 0;
  for (let i = 0; i < n; i++) {
    const d = new Date(start + i * 864e5), m = d.getUTCMonth(), t = KLIMA_BSP[m] + (KLIMA_BSP[(m + 1) % 12] - KLIMA_BSP[m]) * (d.getUTCDate() - 1) / 31, ohne = +(9000 * (i + 1) / n).toFixed(3);
    if (i <= heute) { ist += tagKwh(t + Math.sin(i) * 2); mit = unten = oben = ist; reihe.push([d.toISOString().slice(0, 10), +ist.toFixed(3), +ist.toFixed(3), +ist.toFixed(3), +ist.toFixed(3), ohne]); }
    else { mit += tagKwh(t); unten += tagKwh(t + 1.5); oben += tagKwh(t - 1.5); const k = i - heute, st = 1.645 * 3 * Math.sqrt(k);
      reihe.push([d.toISOString().slice(0, 10), null, +mit.toFixed(3), +Math.max(ist, unten - st).toFixed(3), +(oben + st).toFixed(3), ohne]); }
  }
  const z = reihe[n - 1], bisher = reihe[heute][1];
  // BSM-033.04: je Tag/Woche/Monat (wie logik/hochrechnung.perioden; heute: gemessen + Rest des Tages)
  const tage = reihe.map((r, i) => { const v = reihe[i - 1] || [null, 0, 0, 0, 0, 0], d = new Date(r[0] + 'T00:00:00Z'), m = d.getUTCMonth();
    const vorbei = i < heute, jetzt = i === heute, wert = r[2] - v[2], ist = i <= heute ? (jetzt ? wert * 0.6 : wert) : null;
    return { d, ist, prog: vorbei ? 0 : jetzt ? wert * 0.4 : wert, unten: vorbei ? 0 : jetzt ? wert * 0.4 : wert * 0.9, oben: vorbei ? 0 : jetzt ? wert * 0.4 : wert * 1.12,
      ohne: r[5] - v[5], aussen: KLIMA_BSP[m] + Math.sin(i) * 2, quelle: i < heute ? 'gemessen' : i <= heute + 6 ? 'vorhersage' : 'klima', heute: jetzt }; });
  const perioden = art => { const G = [];
    for (const t of tage) { const k = art === 'tag' ? t.d.getTime() : art === 'monat' ? t.d.getUTCFullYear() * 12 + t.d.getUTCMonth() : Math.floor((t.d.getTime() / 864e5 + 3) / 7);
      let g = G[G.length - 1]; if (!g || g.k !== k) G.push(g = { k, T: [] }); g.T.push(t); }
    return G.map(({ T }) => { const S = f => T.reduce((s, t) => s + (t[f] || 0), 0), ist = S('ist'), prog = S('prog'), ohne = S('ohne'), vorbei = !T.some(t => t.ist === null || t.heute);
      const q = ['gemessen', 'vorhersage', 'klima'].filter(x => T.some(t => t.quelle === x)), e = x => x === null ? null : x * preis;
      const z = { von: T[0].d.toISOString().slice(0, 10), bis: T[T.length - 1].d.toISOString().slice(0, 10), ist: T.some(t => t.ist !== null) ? ist : null, prog, mit: ist + prog,
        unten: vorbei ? null : ist + S('unten'), oben: vorbei ? null : ist + S('oben'), ohne, gespart: ohne - ist - prog,
        aussen: T.reduce((s, t) => s + t.aussen, 0) / T.length, quellen: q, heute: T.some(t => t.heute), vorbei };
      for (const k of ['ist', 'prog', 'mit', 'unten', 'oben', 'ohne', 'gespart']) z[k + '_eur'] = e(z[k]);
      return z; }); };
  return { bisher_kwh: bisher, bisher_eur: bisher * preis, mit_kwh: z[2], mit_eur: z[2] * preis, ohne_kwh: z[5], ohne_eur: z[5] * preis, gespart_eur: (z[5] - z[2]) * preis,
    methode: 'signatur', ohne_methode: 'schaetzung', ohne_hinweis: 'grobe Obergrenze, nicht belastbar', unten_kwh: z[3], unten_eur: z[3] * preis, oben_kwh: z[4], oben_eur: z[4] * preis, normjahr_kwh: z[2] * 1.03, normjahr_eur: z[2] * 1.03 * preis,
    hgt_rest: 1860, vorhersage_tage: 6, herkunft_lernt: false, herkunft: 'aus der Energiesignatur je Container · nächste 6 Tage aus der Vorhersage, danach Klimamittel · noch 1\u00a0860 Heizgradtage', container: sig.map(c => ({ ...c, rest_kwh: 400, rest_eur: 400 * preis })), reihe,
    klima: KLIMA_BSP, klima_vorgabe: true, vorhersage: [['2026-01-16', 1.5], ['2026-01-17', -0.5], ['2026-01-18', -2.0], ['2026-01-19', 0.5], ['2026-01-20', 2.5], ['2026-01-21', 3.0]],
    beginn: '2025-10-01', ende: '2026-04-30', perioden: { tag: perioden('tag'), woche: perioden('woche'), monat: perioden('monat') } };
}

function beispielHass({ STRUKTUR, REFERENZ = false, ZUSTAENDE = null, VEKTOR = {}, WELT = null, JETZT = Date.parse('2026-09-29T16:20:00+02:00'),
  welt = () => STRUKTUR, fehlt = () => false, haengt = () => false, mit = () => {}, mitRest = () => {} }) {
  const api = [];
  const zufall = s => () => (s = (s * 9301 + 49297) % 233280) / 233280;
  const hash = t => { let h = 7; for (const c of t) h = (h * 31 + c.charCodeAt(0)) % 100003; return h; };
  function statistik(m) {
    const von = Date.parse(m.start_time), bis = Math.min(Date.parse(m.end_time || new Date(JETZT).toISOString()), JETZT), erg = {};
    for (const id of m.statistic_ids) {
      const r = zufall(hash(id + m.period)), punkte = [];
      // BSM-004: die Seite holt die laufende Stunde aus der 5-Minuten-Statistik – wie eine Stunde, je Punkt ein Zwölftel
      const fuenf = m.period === '5minute', std = m.period === 'hour' || fuenf, k = fuenf ? 1 / 12 : 1, schritt = fuenf ? 3e5 : 36e5;
      for (let t = von; t < bis;) {
        const h = new Date(t).getUTCHours() + 2, tag = new Date(t).getUTCDay();
        let p = {};
        if (/aussen|temperatur/.test(id)) p = { mean: id.includes('aussen') ? 4 + 3 * Math.sin((h - 9) / 24 * 2 * Math.PI) + r() : 17 + r() * 3 };
        else if (/pumpzyklen/.test(id)) p = { change: fuenf ? (r() < 1 / 12 ? 1 : 0) : Math.round((std ? 1 : 30) * r()) };
        else if (/heizzeit|pumpzeit/.test(id)) p = { change: (std ? .7 * k : m.period === 'day' ? 6 : 150) * r() };
        else p = { change: (std ? (h >= 6 && h < 18 ? 2.5 : .2) * k : m.period === 'day' ? (tag === 0 || tag === 6 ? 2 : 14) : 300) * (.6 + r() * .6) * (id.includes('ohne') ? 4 : 1) };
        punkte.push({ start: t, end: t + schritt, ...p });
        if (std) t += schritt; else if (m.period === 'day') t += 864e5; else { const d = new Date(t); d.setUTCMonth(d.getUTCMonth() + 1); t = d.getTime(); }
      }
      erg[id] = punkte;
    }
    return erg;
  }
  /* Tür/Fenster offen wie die Integration (logik/oeffnungen): Beispielöffnungen im Poliercontainer, heute und frühere Tage */
  function oeffnungen(m) {
    const heute = new Date(JETZT + 2 * 36e5).toISOString().slice(0, 10), tag = m.tag || heute;
    const hm = x => `${String(Math.floor(x / 60)).padStart(2, '0')}:${String(x % 60).padStart(2, '0')}`;
    const T1 = ['binary_sensor.tuer_polier', 'tuer', 'Tür 1'], F1 = ['binary_sensor.polier_fenster_1', 'fenster', 'Fenster 1'], F2 = ['binary_sensor.polier_fenster_2', 'fenster', 'Fenster 2'];
    const auf = ([entity_id, art, name], von, bis) => ({ entity_id, art, name, von: hm(von), bis: hm(bis), min: Math.max(1, bis - von) });
    const liste = m.bereich !== 'polier' || tag > heute ? [] : tag === heute
      ? [auf(T1, 432, 451), auf(T1, 585, 586), auf(F1, 615, 650), auf(F2, 640, 668), auf(T1, 722, 760), auf(F1, 730, 745), auf(T1, 930, 933)]
      : [auf(T1, 425, 440), auf(F1, 600, 630), auf(T1, 725, 752), auf(T1, 1012, 1013)];
    return { tag, laufend: tag === heute, oeffnungen: liste };
  }
  function verlauf(m) {
    const von = Date.parse(m.start_time), erg = {};
    for (const id of m.entity_ids) {
      const liste = [];
      for (let t = von, k = 0; t < JETZT; t += 20 * 6e4, k++) {
        const h = (new Date(t).getUTCHours() + 2) % 24, an = h >= 6 && h < 17 && k % 3 !== 2;
        liste.push({ s: id.includes('lager_r') && t > Date.parse('2026-09-29T10:42:00+02:00') ? 'unavailable' : an ? '1980' : '0.4', lu: t / 1000 });
      }
      erg[id] = liste;
    }
    return erg;
  }
  const meldungen = [
    { id: 'm1', art: 'wunsch', text: 'Eigene Kachel für Bautrockner mit Laufzeit, damit man sie der Firma verrechnen kann.', kontext: 'Übersicht', zeit: '2026-09-28T17:02:00+02:00', version: '0.7.0', geraet: 'Handy', status: 'offen', stand: null },
    { id: 'm2', art: 'fehler', text: 'Nebel-Symbol war im Dunkelmodus kaum zu sehen.', kontext: 'Übersicht · Wetter', zeit: '2026-09-28T20:15:00+02:00', version: '0.6.2', geraet: 'Desktop', status: 'erledigt', stand: null }];
  const states = {};
  const setze = (eid, state, attributes = {}) => { states[eid] = { entity_id: eid, state: String(state), attributes: { friendly_name: eid.split('.')[1].replace(/_/g, ' '), ...attributes } }; };
  for (const b of STRUKTUR) for (const eid of Object.values(b.entitaeten)) setze(eid, eid.startsWith('switch') || eid.startsWith('binary') ? 'on' : '12.5');
  for (const b of STRUKTUR) for (const g of b.geraete) { setze(g.schalter, 'on', { friendly_name: `${g.name} ${g.bereich}` }); setze(g.leistung, '1980', { device_class: 'power' }); }
  setze('sun.sun', 'above_horizon', { elevation: 18, rising: false });
  if (ZUSTAENDE) for (const [eid, z] of Object.entries(ZUSTAENDE.zustaende)) states[eid] = { entity_id: eid, state: z.state, attributes: z.attributes };   // echte Zustände
  if (REFERENZ) {
    setze('sensor.dobl_energie', '412', {}); setze('sensor.dobl_energie_oelradiator', '240'); setze('sensor.dobl_heizzeit_oelradiator', '148'); setze('sensor.dobl_energie_konvektor', '160'); setze('sensor.dobl_heizzeit_konvektor', '82');
    setze('sensor.dobl_ersparnis', '515.2');
    setze('sun.sun', 'above_horizon', { elevation: 18, rising: false });
    setze('weather.dobl', 'rainy', { friendly_name: 'Open-Meteo Dobl', temperature: 4.2, apparent_temperature: 1 });
    setze('weather.kalsdorf', 'cloudy', { friendly_name: 'Open-Meteo Kalsdorf', temperature: 4.6 });
    for (const t of ['polier', 'mannschaft', 'sanitaer', 'besprechung']) setze(`sensor.${t}_temperatur`, '19', { device_class: 'temperature', friendly_name: `${t} Temperatur` });
    setze('binary_sensor.tuer_polier', 'off', { device_class: 'door', friendly_name: 'Tür Polier' });
    setze('binary_sensor.tuer_magazin', 'on', { device_class: 'door', friendly_name: 'Tür Magazin' });
    setze('binary_sensor.tuer_mannschaft', 'off', { device_class: 'door', friendly_name: 'Tür Mannschaft (neu)' });
    setze('switch.heizung_03', 'off', { friendly_name: 'Heizung 03' }); setze('switch.heizung_04', 'off', { friendly_name: 'Heizung 04' });
    setze('calendar.besprechungen', 'off', { friendly_name: 'Besprechungen' }); setze('calendar.baustelle_urlaub', 'off', { friendly_name: 'Baustelle Urlaub' });
    setze('calendar.feiertage_oesterreich', 'off', { friendly_name: 'Feiertage' }); setze('notify.mobile_app_handy_herbert', 'unknown', { friendly_name: 'Handy Herbert' });
    setze('sensor.regen_dobl', '6', { device_class: 'precipitation' });
  // AN-0009: Signalstärke der Shellys (dBm) für die Geräteübersicht
  STRUKTUR[0].geraete.forEach((g, i) => { if (g.schalter) setze(g.schalter.replace('switch.', 'sensor.') + '_signal', [-48, -62, -71, -80, -90][i % 5], { device_class: 'signal_strength', unit_of_measurement: 'dBm' }); });
  }
  const vorhersage = art => art === 'daily'
    ? ['2026-09-29', '2026-09-30', '2026-10-01', '2026-10-02', '2026-10-03'].map((t, i) => ({ datetime: `${t}T12:00:00+02:00`, condition: ['rainy', 'fog', 'partlycloudy', 'rainy', 'sunny'][i], temperature: [9, 7.1, 9.4, 8.2, 11][i], templow: [2, -1.2, 1.8, 4.1, 3][i], precipitation: [6, 0, 0, 5.5, 0][i], precipitation_probability: [90, 10, 15, 80, 5][i] }))
    : [...Array(30)].map((_, i) => ({ datetime: new Date(JETZT + (i + 1) * 36e5 - 20 * 6e4).toISOString(), condition: i < 2 ? 'rainy' : i < 5 ? 'cloudy' : 'clear-night', temperature: 3.8 - i * .3, precipitation: i < 2 ? .8 - i * .4 : 0, precipitation_probability: Math.max(0, 70 - i * 15) }));
  /* ---------- Auswertung und Abrechnung wie die Integration (api §8) ----------
     Die Seite rechnet nichts Fachliches mehr. Für die Beispiel-Welten nimmt der Fake die Werte, die logik/auswertung.py für
     genau diese Baustellen liefert (tests/vektoren/auswertung-*.json, `erwartet`), sonst einfache erfundene Werte. */
  const vektorFall = (art, name) => WELT ? (VEKTOR[art] || []).find(f => f.name === `${WELT} ${name}`) : undefined;
  const zz = (v, d) => Number(v).toFixed(d).replace('.', ',');
  const csvText = zeilen => '\ufeff' + zeilen.join('\r\n');
  function perioden(z, heute) { const [j, m] = heute.split('-').map(Number); return { Tag: 24, Woche: 7, Monat: new Date(Date.UTC(j, m, 0)).getUTCDate(), Jahr: 12 }[z]; }
  function fakeAbrechnung(m) {
    const b = welt().find(x => x.baustelle.entry_id === m.entry_id), preis = (b.einstellungen || {}).preis ?? 0;
    const lauf = m.scope === 'alle' ? welt().filter(x => (x.baustelle.status || 'aktiv') !== 'abgeschlossen') : [b];
    const f = vektorFall('abrechnung', `${m.entry_id} ${m.scope} ${m.zeitraum}`);
    const titel = e => (welt().find(x => x.baustelle.entry_id === e) || { baustelle: { titel: e } }).baustelle.titel;
    const name = (e, bid) => ((welt().find(x => x.baustelle.entry_id === e) || { bereiche: [] }).bereiche.find(x => x.id === bid) || { name: bid }).name;
    const zeilen = f ? f.erwartet.zeilen : [{ firma: 'Eigene Firma', eigen: true, kwh: 0, container: lauf.flatMap(l => l.bereiche.map((c, i) => ({ entry: l.baustelle.entry_id, bereich: c.id, kwh: 10 + i }))) }];
    if (!f) zeilen[0].kwh = zeilen[0].container.reduce((a, c) => a + c.kwh, 0);
    const ges = zeilen.reduce((a, z) => a + z.kwh, 0), n = perioden(m.zeitraum, b.baustelle.heute || '2026-09-29');
    const csvFirma = f ? f.erwartet.csv_firma : ['Zeitraum;Firma;Baustelle;Container;kWh;Preis €/kWh;Betrag €', ...zeilen.flatMap(z => z.container.map(c => [m.zeitraum, z.firma, titel(c.entry), name(c.entry, c.bereich), zz(c.kwh, 2), zz(preis, 2), zz(c.kwh * preis, 2)].join(';')))];
    const csvVerbrauch = f ? f.erwartet.csv_verbrauch : ['Zeit;Baustelle;Firma;Container;kWh;Kosten €', ...zeilen[0].container.flatMap(c => [...Array(n)].map((_, i) => [`${i + 1}.`, titel(c.entry), 'Eigene Firma', name(c.entry, c.bereich), zz(c.kwh / n, 3), zz(c.kwh / n * preis, 2)].join(';')))];
    return { zeitraum: { art: m.zeitraum, n }, preis, kwh: ges,
      firmen: zeilen.map(z => ({ id: z.eigen ? 'eigen' : z.firma, firma: z.firma, eigen: z.eigen, kwh: z.kwh, eur: z.kwh * preis, anteil: ges ? z.kwh / ges * 100 : 0,
        container: z.container.map(c => ({ ...c, titel: titel(c.entry), name: name(c.entry, c.bereich), eur: c.kwh * preis })) })),
      reihen: Object.fromEntries(zeilen.filter(z => z.kwh).map(z => [z.eigen ? 'eigen' : z.firma, Array(n).fill(z.kwh / n)])),
      csv: { firma: csvText(csvFirma), verbrauch: csvText(csvVerbrauch) } };
  }
  /* Kachel „Gespart“ wie baustelle/auswertung › gespart_reihen (logik/auswertung.gespart_reihen): je Stunde/Tag/Monat mit, ohne (24/7)
     und gespart in kWh und €; Summen wie summen.ohne_automatik (ohne = 3 × mit, gespart = 2 × mit); kommende Perioden null */
  function beispielGespart(m, kwh, preis, heute) {
    const n = perioden(m.zeitraum, heute), [j, mo, t] = heute.split('-').map(Number), h = new Date(JETZT + 2 * 36e5).getUTCHours();
    const jetzt = (m.versatz || 0) > 0 ? n - 1 : { Tag: h, Woche: (new Date(Date.UTC(j, mo - 1, t)).getUTCDay() + 6) % 7, Monat: t - 1, Jahr: mo - 1 }[m.zeitraum];
    if (!kwh) return null;
    const da = i => i <= jetzt, tag = m.zeitraum === 'Tag';
    const w = [...Array(n)].map((_, i) => da(i) ? (tag ? (i >= 6 && i < 17 ? 1.5 : 0.2) : 1 + .15 * Math.sin(i * 1.7)) : 0);
    const f = [...Array(n)].map((_, i) => da(i) ? (tag ? (i >= 6 && i < 17 ? 1 : 1.15) : 1 + .1 * Math.cos(i)) : 0);
    const sw = w.reduce((a, x) => a + x, 0), sf = f.reduce((a, x) => a + x, 0);
    const mit = w.map((x, i) => da(i) ? kwh * x / sw : null), ohne = f.map((x, i) => da(i) ? 3 * kwh * x / sf : null);
    const R = { mit_kwh: mit, ohne_kwh: ohne, gespart_kwh: mit.map((x, i) => x === null ? null : ohne[i] - x) };
    for (const k of ['mit', 'ohne', 'gespart']) R[k + '_eur'] = R[k + '_kwh'].map(x => x === null ? null : x * preis);
    R.summe = { mit_kwh: kwh, mit_eur: kwh * preis, ohne_kwh: 3 * kwh, ohne_eur: 3 * kwh * preis, gespart_kwh: 2 * kwh, gespart_eur: 2 * kwh * preis };
    return R;
  }
  function fakeAuswertung(m) {
    const b = welt().find(x => x.baustelle.entry_id === m.entry_id), id = m.entry_id, zl = b.zaehler || {}, preis = (b.einstellungen || {}).preis ?? 0;
    if (m.teil === 'verlauf') {
      const k = vektorFall('kennzahlen', id), v = vektorFall('verlauf', id), mo = vektorFall('monate', id);
      const kwh = k ? k.erwartet.kwh : zl.energie ?? 0, heiztage = zl.heiztage ?? (k ? k.erwartet.heiztage : 0);
      const roh = mo ? mo.erwartet.reihen.map((r, i) => ({ bereich: (b.bereiche[i] || {}).id || null, ...r })) : b.bereiche.map(c => ({ bereich: c.id, name: c.name, v: [50] }));
      const ges = roh.reduce((a, r) => a + r.v.reduce((x, y) => x + y, 0), 0);   // kWh, € und Anteil je Container wie logik/auswertung.monate_summen
      const reihen = roh.map(r => { const s = r.v.reduce((x, y) => x + y, 0); return { ...r, kwh: s, eur: s * preis, anteil: ges ? s / ges * 100 : 0 }; });
      return { kwh, eur: k ? k.erwartet.eur : zl.kosten ?? 0, gespart: k ? k.erwartet.gespart : null, container: b.bereiche.length, heiztage, monate: k ? k.erwartet.monate : 1,
        vergleich: k ? k.erwartet.vergleich : { tag: heiztage ? kwh / heiztage : 0, monat: 0, ges: kwh }, je_monat: v ? v.erwartet.je_monat : { '2026-09': 100 },
        monate_je_container: { labels: mo ? mo.erwartet.labels : ['Sep'], reihen },
        csv: csvText(mo ? mo.erwartet.csv : ['Monat;Baustelle;Container;kWh;Kosten €', ...reihen.map(r => ['Sep', b.baustelle.titel, r.name, zz(r.v[0], 2), zz(r.v[0] * preis, 2)].join(';'))]) };
    }
    const abr = fakeAbrechnung({ ...m, versatz: 0 }), kwh = abr.kwh, pumpen = b.geraete.some(g => g.rolle === 'pumpe');
    const tv = vektorFall('typvergleich', id), w = vektorFall('wetter', id), g = vektorFall('je-geraet', `${id} ${m.zeitraum}`), leer = { kwh_h: null, auf: null, ab: null, tag: null };
    const ende = (b.baustelle.optionen || {}).ende;
    return { zeitraum: abr.zeitraum, preis,
      summen: { kwh, eur: kwh * preis, heizzeit: 42.5, pumpzeit: pumpen ? 3.25 : 0, ohne: kwh * 3, vorher: { kwh: kwh * .9, heizzeit: 40, pumpzeit: pumpen ? 3 : 0 },
        veraenderung: { kwh: kwh ? 11 : null, heizzeit: 6, pumpzeit: pumpen ? 8 : null }, ohne_automatik: kwh ? { ohne_eur: kwh * 3 * preis, gespart_eur: kwh * 2 * preis, prozent: 66.7, hinweis: 'grobe Obergrenze, nicht belastbar' } : null },
      je_geraet: (g ? g.erwartet.zeilen : b.geraete.map(x => ({ bereich: x.bereich, geraet: x.id, mittel: null, kwh: 1.5, std: null }))).map(z => ({ ...z, eur: z.kwh === null ? null : z.kwh * preis })),
      wetter: w ? { punkte: w.erwartet.punkte, gerade: w.erwartet.regression && { ...w.erwartet.regression, eur_je_grad: w.erwartet.regression.k < 0 ? -w.erwartet.regression.k * preis : null } } : { punkte: [], gerade: null },
      // AN-0008: fairer Vergleich (kWh je Gradstunde, nur Thermostat mit Fühler, ein Typ je Container)
    // FE-0023/AN-0016: je Seite Geräte · kW · m², Aufheizen je kW, Zählbeginn, nur ein Container je Art
    typ: REFERENZ ? { oelradiator: { kwh_gradh: 0.085, kwh_gradh_m2: 0.0061, auf: 2.1, auf_je_kw: 0.35, ab: 0.6, anzahl: 3, kw: 6, m2: 14, container: ['Poliercontainer'] },
      konvektor: { kwh_gradh: 0.102, kwh_gradh_m2: 0.0073, auf: 3.0, auf_je_kw: 0.75, ab: 1.1, anzahl: 2, kw: 4, m2: 14, container: ['Sanitär'] },
      weniger: 17, vergleichbar: true, nur_einer: true, seit: '2026-09-29T07:00:00+02:00', ausgeschlossen: [{ name: 'Mannschaft', grund: 'Ölradiator und Konvektor gemischt' }, { name: 'Magazin', grund: 'ohne Fühler' }],
      ersparnis: (() => { const n = perioden(m.zeitraum, b.baustelle.heute || '2026-09-29'), oel = Array.from({ length: n }, (_, i) => m.zeitraum === 'Tag' ? (i >= 6 && i < 17 ? 1.4 : 0) : 9 + (i % 4)),
        f = 0.102 / 0.085, k = oel.map(v => +(v * f).toFixed(3)), so = oel.reduce((a, x) => a + x, 0), sk = k.reduce((a, x) => a + x, 0);
        return { faktor: f, oel, konvektor: k, oel_kwh: so, konvektor_kwh: sk, erspart_kwh: sk - so, erspart_eur: (sk - so) * preis }; })() }
      : { oelradiator: { kwh_gradh: null, auf: null, ab: null, container: [], ids: [] }, konvektor: { kwh_gradh: null, auf: null, ab: null, container: [], ids: [] }, weniger: null, vergleichbar: false, ausgeschlossen: [], ersparnis: null },
      heizperiode: { ende: '2026-04-30', bis: ende && ende < '2026-04-30' ? ende : '2026-04-30' }, heiztage: zl.heiztage ?? 0,
      hochrechnung: beispielHochrechnung(b, preis),
      gespart_reihen: beispielGespart(m, kwh, preis, b.baustelle.heute || '2026-09-29'),
      // WU-0005: Rangliste und Erkenntnisse (wie logik/auswertung.rangliste/erkenntnisse)
      rangliste: b.bereiche.filter(c => c.art !== 'pumpenschacht').map((c, i) => ({ bereich: c.id, name: c.name, baustelle: b.baustelle.titel, kwh: 40 - i * 5, heizzeit: 20 - i, eur: (40 - i * 5) * preis, kwh_h: (40 - i * 5) / (20 - i), anteil: 0 })),
      erkenntnisse: kwh ? [{ art: 'gespart', eur: kwh * 2 * preis, prozent: 66.7 }, { art: 'groesster', bereich: b.bereiche[0].id, name: b.bereiche[0].name, kwh: 40, anteil: 38 }, { art: 'wetter', kwh_je_grad: 7.2, eur_je_grad: 2, null0: 15.5 }, { art: 'mehr', prozent: 18 }] : [] };
  }

  /* BSM-031.07: Container-Inventar wie die Integration (baustelle/inventar = logik/inventar.aufbereiten, Vorschau,
     Umbenennen, Rückgängig, Kandidaten) – Beispiel über der ersten Baustelle; Befehle ändern den Stand wie echt */
  const ARTEN = { POL: 'Polier', MAN: 'Mannschaft', BES: 'Besprechung', BUE: 'Büro', LAG: 'Lager', MAT: 'Material', SAN: 'Sanitär', TRO: 'Trocken' };
  const GERAETE = { PLUG: 'Shelly Plug', HZ: 'Heizkörper', TEMP: 'Shelly H&Temp Sensor', DOOR: 'Shelly Door Sensor', FEN: 'Shelly Door Sensor', PUMP: 'Pumpe', BTR: 'Bautrockner' };
  let inv = null, umb = null;
  function inventar() {
    if (inv) return inv;
    const b = welt()[0], bs = b.baustelle.entry_id, C = b.bereiche.filter(x => x.art === 'container'), c1 = C[0] ? C[0].id : null;
    const g1 = b.geraete.find(g => g.bereich === c1), e = (cid, bid, von, bis = null, bau = bs) => ({ container_id: cid, baustelle_id: bau, bereich_id: bid, instanz_id: 'i1', von, bis });
    const jetzt = e('c1', c1, '2026-09-01T06:00:00+00:00');
    inv = { container: [
      { id: 'c1', name: '001_C_POL', nr: 1, art: 'POL', art_label: 'Polier', eigen: true, firma_kuerzel: null, fremd_nr: null, status: 'aktiv', labels: ['Container', 'Polier'],
        einsatz: jetzt, geschichte: [e('c1', null, '2026-03-09T06:00:00+00:00', '2026-08-28T15:00:00+00:00', 'wundschuh'), jetzt],
        ausruestung: [{ id: 'a1', typ: 'PLUG', typ_label: 'Shelly Plug', name: '001-01_C_PLUG_POL', gg: 1, status: 'aktiv', modell: 'Shelly Plug S Gen3', geraet_id: g1 ? g1.id : null, seit: jetzt.von },
          { id: 'a2', typ: 'TEMP', typ_label: 'Shelly H&Temp Sensor', name: '001_C_TEMP_POL', gg: null, status: 'aktiv', modell: 'Shelly H&T Gen3', geraet_id: null, seit: jetzt.von, nicht_in_ha: true }], nicht_in_ha: 1 },   // BSM-034.04
      { id: 'f1', name: 'STRA-01_C_MAN', nr: null, art: 'MAN', art_label: 'Mannschaft', eigen: false, firma_kuerzel: 'STRA', fremd_nr: 1, status: 'aktiv', labels: ['Container', 'Mannschaft', 'Strabag AG'],
        einsatz: e('f1', null, '2026-09-22T06:00:00+00:00'), geschichte: [e('f1', null, '2026-09-22T06:00:00+00:00')], ausruestung: [] },
      { id: 'x1', name: '002_C_LAG', nr: 2, art: 'LAG', art_label: 'Lager', eigen: true, firma_kuerzel: null, fremd_nr: null, status: 'ausgeschieden', labels: ['Container', 'Lager'],
        einsatz: null, geschichte: [e('x1', null, '2026-06-02T06:00:00+00:00', '2026-09-30T15:00:00+00:00')], ausruestung: [] }],
      ausruestung_frei: [{ id: 'a9', typ: 'DOOR', typ_label: 'Shelly Door Sensor', status: 'defekt', modell: 'Shelly BLU Door/Window' }],
      bereiche_ohne: C.slice(1).map(x => ({ id: x.id, baustelle_id: bs, name: x.name })),
      firmen: [{ baustelle_id: bs, id: 'f-stra', name: 'Strabag AG', kuerzel: 'STRA', eigen: false }, { baustelle_id: bs, id: 'f-hube', name: 'Elektro Huber GmbH', kuerzel: null, eigen: false }],
      arten: ARTEN, geraete: GERAETE, naechste_nr: 3, aendern: true };
    return inv;
  }
  const kopie = x => JSON.parse(JSON.stringify(x));
  const nichtGefunden = t => { throw { code: 'not_found', message: t }; };
  function invVorschau(cid) {
    const c = inventar().container.find(x => x.id === cid);
    if (!c || !c.einsatz || !c.einsatz.bereich_id) nichtGefunden('Container ohne Bereich auf einer geladenen Baustelle');
    const g = '001-01_C_PLUG_POL', t = '001_C_TEMP_POL', fertig = umb && umb.status === 'ausgefuehrt';
    const s = (gruppe, ziel, ref, was, alt, neu, zustand) => ({ gruppe, ziel, ref, was, alt, neu, zustand: fertig && ziel !== 'plug' ? 'gleich' : zustand });
    const schritte = [s(g, 'geraet', 'dev1', 'HA-Gerät', 'Heizung 01', g, 'aendern'), s(g, 'label', 'dev1', 'Label', null, 'Container', 'neu'), s(g, 'label', 'dev1', 'Label', 'Lager', null, 'aendern'),
      s(g, 'entitaet_name', 'switch.heizung_01', 'Name', null, g, 'neu'), s(g, 'entitaet_id', 'switch.heizung_01', 'Entity-ID', 'switch.heizung_01', 'switch.001_01_c_plug_pol', 'aendern'),
      s(g, 'plug', 'g1', 'Plug-Name', 'heizung-01', g, fertig ? 'gleich' : 'aendern'), s(g, 'unter_eintrag', 'g1', 'Heizkörper (Integration)', 'Radiator 1', '001-01_C_HZ_POL_Radiator01', 'aendern'),
      s(t, 'geraet', 'dev2', 'HA-Gerät', 'BLU H&T', t, 'aendern'), s(t, 'entitaet_id', 'sensor.polier_temperatur', 'Entity-ID', 'sensor.polier_temperatur', 'sensor.001_c_temp_pol_temperatur', 'aendern')];
    const z = k => schritte.filter(x => x.zustand === k).length;
    return { schritte, konflikte: {}, zaehler: { aendern: z('aendern'), neu: z('neu'), gleich: z('gleich'), konflikt: 0 },
      verweise: fertig ? [] : [{ art: 'Automation', name: 'Polier morgens vorheizen', alt: 'switch.heizung_01', neu: 'switch.001_01_c_plug_pol' }],
      hinweis: 'BTHome-Namen an den Plugs zieht die Kopplungspflege nach' };
  }
  function invUmbenennen(cid) {   // erst teilweise (Plug offline), dann nachgeholt – wie die Integration
    const v = invVorschau(cid), offen = v.schritte.filter(x => x.zustand !== 'gleich');
    if (!offen.length) return { id: null, status: 'nichts', schritte: v.schritte, geaendert: [] };
    const nach = !!umb && umb.status === 'teilweise', erg = v.schritte.map(x => ({ ...x, ergebnis: x.zustand === 'gleich' ? 'gleich' : x.ziel === 'plug' && !nach ? 'fehler' : 'ok',
      ...(x.ziel === 'plug' && !nach ? { fehler: 'nicht erreichbar' } : {}) }));
    umb = { id: 1, status: nach ? 'ausgefuehrt' : 'teilweise', schritte: erg };
    return { id: 1, status: umb.status, schritte: erg, geaendert: ['Unter-Eintrag 001-01_C_HZ_POL_Radiator01'], nachgeholt: nach };
  }
  function invRueck(m) {
    if (!umb || !['ausgefuehrt', 'teilweise'].includes(umb.status)) nichtGefunden('Keine Umbenennung, die sich zurücknehmen lässt (nur die jüngste je Container)');
    const umkehr = umb.schritte.map((x, nr) => ({ ...x, nr })).filter(x => x.ergebnis === 'ok').reverse()
      .map(({ ergebnis, fehler, ...x }) => ({ ...x, ref: x.ziel === 'entitaet_id' || x.ziel === 'entitaet_name' ? 'switch.001_01_c_plug_pol' : x.ref, alt: x.neu, neu: x.alt, zustand: 'aendern' }));
    if (m.vorschau) return { id: 1, schritte: umkehr, konflikte: {} };
    umb = { ...umb, status: 'zurueck' };
    return { id: 1, status: 'zurueck', schritte: umkehr.map(x => ({ ...x, ergebnis: 'ok' })) };
  }
  function invAendern(m) {
    const I = inventar(), c = I.container.find(x => x.id === m.container_id), alle = [...I.container.flatMap(x => x.ausruestung), ...I.ausruestung_frei];
    switch (m.aktion) {
      case 'container_anlegen': {
        const id = 'n' + I.container.length, nr = m.firma_kuerzel ? null : m.nr || I.naechste_nr, fnr = m.firma_kuerzel ? 1 + I.container.filter(x => x.firma_kuerzel === m.firma_kuerzel).length : null;
        const name = m.firma_kuerzel ? `${m.firma_kuerzel}-${String(fnr).padStart(2, '0')}_C_${m.art}` : `${String(nr).padStart(3, '0')}_C_${m.art}`;
        const einsatz = { container_id: id, baustelle_id: m.entry_id, bereich_id: m.bereich_id || null, instanz_id: 'i1', von: '2026-09-29T14:20:00+00:00', bis: null };
        I.container.push({ id, name, nr, art: m.art, art_label: ARTEN[m.art], eigen: !m.firma_kuerzel, firma_kuerzel: m.firma_kuerzel || null, fremd_nr: fnr, status: 'aktiv',
          labels: ['Container', ARTEN[m.art]], einsatz, geschichte: [einsatz], ausruestung: [] });
        if (!m.firma_kuerzel) I.naechste_nr = Math.max(I.naechste_nr, nr + 1);
        I.bereiche_ohne = I.bereiche_ohne.filter(x => x.id !== m.bereich_id);
        return { id, art: m.art, nr, firma_kuerzel: m.firma_kuerzel || null, fremd_nr: fnr, ...(m.bereich_id ? { ausruestung: [] } : {}) };
      }
      case 'container_status': if (!c) nichtGefunden('nicht gefunden'); c.status = m.status; if (m.status === 'ausgeschieden') { c.einsatz = null; c.geschichte.forEach(x => { x.bis = x.bis || '2026-09-29T14:20:00+00:00'; }); } return { ok: true };
      case 'ausruestung_status': { const a = alle.find(x => x.id === m.ausruestung_id); if (!a) nichtGefunden('nicht gefunden'); a.status = m.status; return { ok: true }; }
      case 'ausruestung_entfernen': { const k = I.container.find(x => x.ausruestung.some(a => a.id === m.ausruestung_id)); if (!k) nichtGefunden('keine laufende Zuordnung');
        const a = k.ausruestung.find(x => x.id === m.ausruestung_id); k.ausruestung = k.ausruestung.filter(x => x !== a); I.ausruestung_frei.push({ id: a.id, typ: a.typ, typ_label: a.typ_label, status: a.status, modell: a.modell }); return { ok: true }; }
      case 'ausruestung_zuordnen': { const k = invKandidaten().find(x => x.device_id === m.device_id); if (!c || !k) nichtGefunden('Container oder Gerät nicht gefunden');
        const gg = k.typ === 'PLUG' ? 1 + Math.max(0, ...c.ausruestung.map(a => a.gg || 0)) : null;
        c.ausruestung.push({ id: 'z' + m.device_id, typ: k.typ, typ_label: GERAETE[k.typ], name: null, gg, status: 'aktiv', modell: k.modell, geraet_id: null, seit: '2026-09-29T14:20:00+00:00' });
        return { id: 'z' + m.device_id, gg, neu: true, typ: k.typ, verdrahtet: k.typ === 'PLUG' ? 'Shelly im Bereich angelegt' : null }; }
      case 'firma_kuerzel': { const f = I.firmen.find(x => x.id === m.firma_id); if (!f) nichtGefunden('nicht gefunden'); f.kuerzel = String(m.kuerzel).toUpperCase(); return { ok: true }; }
      default: return { ok: true };
    }
  }
  function invKandidaten() {
    const belegt = new Set(inventar().container.flatMap(c => c.ausruestung.map(a => a.id)));
    return [{ device_id: 'd9', name: 'Plug Lager 09', modell: 'Shelly Plug S Gen3', typ: 'PLUG', ausruestung_id: null, status: null, entity_id: 'switch.plug_lager_09', verwendet: null },
      { device_id: 'd8', name: 'Shelly H&T Gen3', modell: 'Shelly H&T Gen3', typ: 'TEMP', ausruestung_id: null, status: null, entity_id: 'sensor.shelly_h_t_gen3_temperatur', verwendet: null },
      { device_id: 'd7', name: 'Shelly BLU Door/Window', modell: 'Shelly BLU Door/Window', typ: 'DOOR', ausruestung_id: 'a9', status: 'defekt', entity_id: 'binary_sensor.tuer_lager', verwendet: null }]
      .filter(k => !belegt.has('z' + k.device_id));
  }
  const hass = {
    states, themes: { darkMode: true }, config: { version: '2026.9.4' }, language: 'de',
    connection: { subscribeMessage: (cb, msg) => { cb({ type: msg.forecast_type, forecast: vorhersage(msg.forecast_type) }); return Promise.resolve(() => {}); } },
    callWS: async m => {
      mit(m);
      switch (m.type) {
        case 'baustelle/struktur': if (fehlt()) throw { code: 'unknown_command', message: 'Unknown command.' }; if (haengt()) return new Promise(() => {}); return JSON.parse(JSON.stringify(welt()));
        case 'recorder/statistics_during_period': case 'baustelle/statistik': return statistik(m);   // BSM-014: Statistik aus der Datenbank (gleiche Form)
        case 'baustelle/auswertung': return fakeAuswertung(m);
        case 'baustelle/abrechnung': return fakeAbrechnung(m);
        case 'baustelle/tagesverlauf': {   // BSM-033.04: Verlauf 24 h wie hochrechnung.async_tagesverlauf (Beispiel: heute 10 Uhr, Werktag 05–16 Uhr)
          const tag = new Date(m.datum + 'T12:00:00'), wt = tag.getDay() > 0 && tag.getDay() < 6, heute = m.datum === '2026-01-15', vorbei = m.datum < '2026-01-15';
          const ab = vorbei ? 24 : heute ? 10 : 0, w = h => (wt && h >= 5 && h < 16 ? (h === 5 ? 2.6 : 1) : 0.08), t = h => 1 + 3 * Math.sin(2 * Math.PI * (h + 0.5 - 9) / 24);
          const stunden = Array.from({ length: 24 }, (_, h) => [h, h < ab || (heute && h === ab) ? +(9 * w(h) * (h === ab ? 0.4 : 1)).toFixed(3) : null, h >= ab ? +(9 * w(h) * (h === ab ? 0.6 : 1)).toFixed(3) : null,
            +(4.5 + (1 - t(h)) * 0.4).toFixed(3), +t(h).toFixed(1), h < ab ? 'gemessen' : h < ab + 12 ? 'vorhersage' : 'tagesgang']);
          return { datum: m.datum, jetzt_h: heute ? 10.3 : null, stunden, heizzeit: wt ? [[5, 16]] : [], frei: !wt, ohne_quelle: 'temperatur' }; }
        case 'baustelle/ohne': { const n = { Tag: 24, Woche: 7, Monat: 30, Jahr: 12 }[m.zeitraum] || 24, kw = m.basis === 'typ' ? 1.8 : 2.0;   // WU-0013
          const reihe = Array.from({ length: n }, (_, i) => m.zeitraum === 'Tag' ? (i <= 16 ? kw : 0) : kw * 24 * (i < 5 ? 1 : 0)), ohne = reihe.reduce((a, b) => a + b, 0), kwh = ohne * 0.35;
          return { zeitraum: { art: m.zeitraum, n }, basis: m.basis || 'geraet', preis: 0.28, kw, reihe, ohne_kwh: ohne, kwh,
            ergebnis: { ohne_eur: ohne * 0.28, gespart_eur: (ohne - kwh) * 0.28, prozent: 65, hinweis: 'grobe Obergrenze, nicht belastbar' }, geraete: [] }; }
        case 'history/history_during_period': case 'baustelle/verlauf': return verlauf(m);
        case 'baustelle/oeffnungen': return oeffnungen(m);   // Tür/Fenster offen im Tagesdiagramm (Mockup tuer-diagramm, Variante A)   // BSM-014: Verlauf aus der Datenbank
        case 'baustelle/protokoll': { const b = welt().find(x => x.baustelle.entry_id === m.entry_id); const p = b.laufzeit.protokoll.length ? b.laufzeit.protokoll : [['2026-04-17T12:00:00+02:00', 'einstellung', null, 'Baustelle abgeschlossen – Heizung aus, Werte gespeichert'], ['2026-03-03T06:00:00+02:00', 'warnung', `${m.entry_id}-3`, 'Frostgefahr 3,8 °C trotz Frostschutz'], ['2026-03-02T11:00:00+02:00', 'ok', `${m.entry_id}-3`, 'wieder über 5 °C']];
          return [...p, ...p.map(e => [e[0].replace('2026-09-2', '2026-09-1'), ...e.slice(1)])].slice(0, m.limit); }
        case 'baustelle/meldungen': return JSON.parse(JSON.stringify(meldungen));
        case 'baustelle/meldung': if (m.aktion === 'bild') return { url: 'data:image/svg+xml;utf8,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 9 16"><rect width="9" height="16" fill="#456"/></svg>') };   // WU-0016
          return { ok: true, ...(m.aktion === 'neu' ? { ticket: 'FE-0099' } : {}) };
        case 'baustelle/bericht': { const b = welt().find(x => x.baustelle.entry_id === m.entry_id), mon = m.art === 'monat', titel = b ? b.baustelle.titel : '';   // wie nachrichten.async_bericht_vorschau
          return { art: m.art, von: mon ? '2026-08-01' : '2026-09-21', bis: mon ? '2026-08-31' : '2026-09-27', betreff: `Baustelle ${titel} – ${mon ? 'August 2026' : 'Woche 21.–27.09.2026'}`,
            summe: mon ? 'August: 1 480 kWh · 414,40 €' : 'Vorwoche: 312 kWh · 87,47 €', vergleich: mon ? '(+31 % zum Juli)' : '(−4 % zur Woche davor)',
            firmen: [{ name: 'Eigene Firma', kwh: 250, eur: 70 }, { name: 'Elektro Huber GmbH', kwh: 62.4, eur: 17.47 }], container: (b ? b.bereiche : []).map((c, i) => ({ name: c.name, kwh: 10 * i })),
            heiztage: 5, gespart_eur: null, warnungen: [{ bereich: 'Lager Süd', titel: 'nicht erreichbar' }, { bereich: null, titel: 'Keine Wettervorhersage' }], mail_an: 'herbert@example.at', anhang: mon ? 'abrechnung-2026-08.csv' : 'abrechnung-kw39.csv', handy: true }; }
        case 'auth/sign_path': return { path: `${m.path}?authSig=abc` };
        case 'baustelle/setzen': { const b = welt().find(x => x.baustelle.entry_id === m.entry_id); let o = b.einstellungen;   // wie die Integration: Wert bleibt gespeichert
          for (const k of m.pfad.slice(0, -1)) o = o[k] ||= {}; o[m.pfad.at(-1)] = m.wert; return { ok: true }; }
        case 'baustelle/inventar': return kopie(inventar());
        case 'baustelle/inventar_vorschau': return kopie(invVorschau(m.container_id));
        case 'baustelle/inventar_umbenennen': return kopie(invUmbenennen(m.container_id));
        case 'baustelle/inventar_rueckgaengig': return kopie(invRueck(m));
        case 'baustelle/inventar_kandidaten': return { geraete: kopie(invKandidaten()) };
        case 'baustelle/inventar_aendern': return kopie(invAendern(m));
        default: return { ok: true };
      }
    },
    callApi: async (methode, pfad, daten) => {   // REST wie die Seite ihn ruft; mitgeschrieben für test_abgleich.py
      const antwort = await callApiFake(methode, pfad, daten);
      mitRest({ type: 'rest', methode, pfad, daten: daten ?? null, antwort: methode === 'GET' ? null : JSON.parse(JSON.stringify(antwort ?? null)) });
      return antwort;
    },
    callService: async () => { throw new Error('Die Seite soll Dienste nicht direkt aufrufen'); },
  };
  async function callApiFake(methode, pfad, daten) {
    {
      api.push([methode, pfad, daten]);
      if (methode === 'GET' && ZUSTAENDE) return JSON.parse(JSON.stringify((ZUSTAENDE.kalender || {})[pfad.split('?')[0].slice(10)] || []));   // echte Kalender
      if (methode === 'GET' && pfad.startsWith('calendars/calendar.feiertage')) return [['2026-10-26', 'Nationalfeiertag'], ['2026-11-01', 'Allerheiligen'], ['2026-12-08', 'Mariä Empfängnis'], ['2026-12-25', 'Christtag'], ['2026-12-26', 'Stefanitag']]
        .map(([t, n], i) => ({ summary: n, start: { date: t }, end: { date: t }, uid: 'f' + i }));
      if (methode === 'GET') return [{ summary: 'Weihnachten', start: { date: '2026-12-23' }, end: { date: '2027-01-07' }, uid: 'urlaub-1' }];
      if (methode === 'DELETE') return {};
      if (/flow$/.test(pfad)) return { type: 'form', flow_id: 'F' + api.length };
      if (pfad.includes('subentries') && daten && daten.art) {   // neuer Bereich → erscheint in der Struktur
        const b = welt()[0]; if (!b.bereiche.some(x => x.name === daten.name)) b.bereiche.push({ id: 'neu-' + b.bereiche.length, name: daten.name, art: daten.art, fuehler: daten.fuehler || null, nr: b.bereiche.length });
        return { type: 'create_entry' };
      }
      if (pfad.includes('subentries')) return api.some(a => a[2] && a[2].subentry_id) ? { type: 'abort', reason: 'reconfigure_successful' } : { type: 'create_entry' };
      if (pfad.includes('options')) return { type: 'create_entry' };
      return { type: 'create_entry', result: { entry_id: 'neu' }, next_flow: ['config_subentries_flow', 'S1'] };
    }
  }

  return { hass, states, api, meldungen, setze, statistik, verlauf, vorhersage, fakeAuswertung, fakeAbrechnung };
}
if (typeof module === 'object' && module.exports) module.exports = { beispielHass };
else wurzel.beispielHass = beispielHass;
})(typeof globalThis !== 'undefined' ? globalThis : this);
