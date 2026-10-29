// Datenadapter der Seite „Baustelle“: Antwort baustelle/struktur (docs/api-0.7.md §1) → Modell der Seite, Zeit in der
// Zone der Baustelle (BSM-022 Stufe 1c). Ordnet zu und formatiert – gerechnet wird in der Integration.
import { TAGE, plusTage, kurzDatum, wtag, datum, zahl } from './hilfen.js';
import { ARTEN, AUSNAHME, FARBE, FREI_TEXT, HEIZER, MODI, TYP_TEXT, WIEDER } from './tabellen.js';

const LOKAL_FMT = {};

/* Zeit in der Zone der Baustelle: 'YYYY-MM-DD HH:MM' */
export function lokal(t, zone) {
  const ms = typeof t === 'number' ? t : Date.parse(t);
  if (!Number.isFinite(ms)) return '';
  const k = zone || '';
  if (!(k in LOKAL_FMT)) {
    try { LOKAL_FMT[k] = new Intl.DateTimeFormat('sv-SE', { timeZone: zone || undefined, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }); }
    catch (e) { LOKAL_FMT[k] = new Intl.DateTimeFormat('sv-SE', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }); }
  }
  return LOKAL_FMT[k].format(ms).replace('T', ' ');
}

/* Mitternacht (oder Uhrzeit) eines Tages in der Zone der Baustelle als Zeitpunkt */
export function zoneMs(tag, zeit = '00:00', zone) {
  const g = Date.parse(`${tag}T${zeit}:00Z`), l = Date.parse(lokal(g, zone).replace(' ', 'T') + ':00Z');
  return Number.isFinite(l) ? g - (l - g) : g;
}

export function minSeitAb(iso, jetztMs) { const ms = Date.parse(iso); return Number.isFinite(ms) ? Math.max(0, Math.round((jetztMs - ms) / 60000)) : null; }

export function protokollZeile(p, z, ersatzZone) {
  const l = lokal(p[0], z.zone === undefined ? ersatzZone : z.zone) || '', t = l.slice(0, 10);
  const tag = t === z.HEUTE ? 'Heute' : t === plusTage(z.HEUTE, -1) ? 'Gestern' : `${wtag(t)} ${kurzDatum(t)}`;
  return [tag, l.slice(11, 16), p[1] || 'einstellung', p[2] || null, p[3] || '', t];   // t = Tag JJJJ-MM-TT (Chronik, WU-0006)
}

/* ---- Adapter: baustelle/struktur (docs/api-0.7.md §1) → Modell der Seite (Form wie im Mockup) ---- */
export function bauen(r, hass, ersatzZone) {
  const lokalZ = (t, zone) => lokal(t, zone === undefined ? ersatzZone : zone);   // ohne Zone: die der angezeigten Baustelle (wie bisher)
  const bs = r.baustelle || {}, lz = r.laufzeit || {}, e0 = r.einstellungen || {}, opt = bs.optionen || {}, zone = bs.zeitzone;
  const jetztIso = bs.jetzt || new Date().toISOString(), jl = lokalZ(jetztIso, zone) || '';
  const heute = bs.heute || jl.slice(0, 10) || new Date().toISOString().slice(0, 10);
  const montag = plusTage(heute, -((new Date(heute + 'T12:00:00Z').getUTCDay() + 6) % 7));
  const WOCHE_ISO = TAGE.map((_, k) => plusTage(montag, k));
  const z = { HEUTE: heute, HEUTE_TAG: TAGE[WOCHE_ISO.indexOf(heute)] || 'Mo', JETZT: jl.slice(11, 16) || '00:00', WOCHE_ISO,
    WOCHE: WOCHE_ISO.map((iso, k) => [TAGE[k], kurzDatum(iso)]), zone, jetztMs: Number.isFinite(Date.parse(jetztIso)) ? Date.parse(jetztIso) : Date.now() };
  const h = e0.heizung || {}, st = e0.staffel || {}, me = e0.meldungen_einst || {}, ar = me.arten || {}, be = e0.bericht || {};
  const v = (x, std) => zahl(x) ? Number(x) : std;
  const namen = s => { const x = hass && hass.states[`notify.${s}`]; return (x && x.attributes.friendly_name) || String(s).replace(/^mobile_app_/, '').replace(/_/g, ' '); };
  const e = { preis: v(e0.preis, 0), preise: Array.isArray(e0.preise) ? e0.preise : [], feiertag_frei: h.feiertag_frei !== false, boost_min: v(h.boost_min, 30), soll_art: h.soll_art === 'gleitend' ? 'gleitend' : 'fest', gleit_min: v(h.gleit_min, 21), gleit_max: v(h.gleit_max, 24),
    gleit_je: v(h.gleit_je, 0.1), gleit_bezug: v(h.gleit_bezug, 12), gleit_tage: v(h.gleit_tage, 3), toleranz: v(h.toleranz, 0.3), hand_nachfrist: v(h.hand_nachfrist_min, 30),
    fuehler_halten: v(h.fuehler_halten_min, 15), zieht_w: v(h.zieht_strom_w, 50), melden: e0.melden_knopf !== false,
    staffel: st.an !== false, nutzbar: v(st.nutzbar_prozent, 67), max_gleich: v(st.max_gleichzeitig, 5), min_lauf: v(st.min_lauf_min, 10), min_pause: v(st.min_pause_min, 5), takt: v(st.takt_min, 15),
    tuer_pause: v(h.tuer_pause_min, 3), tuer_melden: v(h.tuer_melden_min, 10), knoepfe: me.knoepfe !== false,
    bericht: be.haeufigkeit || 'aus', bericht_handy: be.handy !== false, bericht_mail: !!be.mail, mail: be.mail_an || '', mail_dienst: be.mail_dienst || '', bericht_csv: be.csv !== false,
    vorheizen: v(h.vorheizen_min, 45), nachheizen: v(h.nachheizen_min, 15), warm_vor: v(h.warm_vor_min, 0), frost_aussen: h.frost_aussen === null ? null : v(h.frost_aussen, -3), warm_nach: v(h.warm_nach_min, 0), warm_max: v(h.warm_max_min, 120), stufen_abstand: v(h.stufen_abstand, 1.5), stufen_min: v(h.stufen_min, 30), stufen_anstieg: v(h.stufen_anstieg, 0.3), stufen_kalt: v(h.stufen_kalt, -5), soll: v(h.soll, 20), grenze: v(h.heizgrenze, 15), basis: h.heizgrenze_basis === 'jetzt' ? 'jetzt' : 'Tageshöchstwert',
    fruehstart: h.fruehstart !== false, frueh_temp: v(h.fruehstart_unter, 0), frueh_min: v(h.fruehstart_min, 30), frost: h.frost !== false, frost_temp: v(h.frost_grenze, 5),
    tr_mm: v(h.trocknen_ab_mm, 2), tr_laenger: v(h.trocknen_laenger_min, 45), tr_frueher: v(h.trocknen_frueher_min, 15),
    empfaenger: (me.empfaenger || opt.empfaenger || []).map(namen).join(', ') || 'keiner gewählt',
    dauer_min: v(me.dauerlauf_min, 20), kalt_min: v(me.kalt_min, 60), hand_h: v(me.hand_h, 8), zyklen_h: v(me.zyklen_h, 10), trocken_w: v(me.trocken_unter_w, 30),
    auto: !!e0.automatik,
    frost_aus: v(h.frost_aus, v(h.frost_grenze, 5) + 2), urlaub: FREI_TEXT[h.frei_modus] ? h.frei_modus : 'frost', absenk: v(h.absenk, 10),
    offline_min: v(me.offline_min, 5), erklaer: e0.erklaer !== false, frost_immer: !!h.frost_immer, notprogramm: !!h.notprogramm, taste: !!h.taste,
    baseline: !!h.baseline, baseline_eur: v(h.baseline_eur_monat, 60) };   // J4b: Baseline-Läufe (startet aus)
  for (const [k, art] of Object.entries(ARTEN)) e[k] = ar[art] !== false;
  const anschluesse = (e0.anschluesse || []).map(a => ({ id: a.id, name: a.name || a.id, ampere: v(a.ampere, 16), phasen: v(a.phasen, 3), reserve: v(a.reserve_kw, 0) }));
  const firmen = (e0.firmen && e0.firmen.length ? e0.firmen : [{ id: 'eigen', name: 'Eigene Firma', eigen: true }]).map(f => ({ ...f }));
  const zuordnung = e0.zuordnung || [], jetztMs = z.jetztMs;   // Firma je Container jetzt: Integration (laufzeit.container[bid].firma)
  const ebAlle = e0.bereiche || {}, cAlle = lz.container || {}, gAlle = lz.geraete || {};
  const bereiche = (r.bereiche || []).map((b, i) => {
    const eb = ebAlle[b.id] || {}, c = cAlle[b.id] || {}, pumpe = b.art === 'pumpenschacht';
    const geraete = (r.geraete || []).filter(g => g.bereich === b.id).map(g => { const x = gAlle[g.id] || {};
      return { id: g.id, n: g.name || g.id, typ: TYP_TEXT(g), rolle: g.rolle, gtyp: g.typ, heizer: HEIZER(g), kw: v(g.nenn_kw, 0), kwJetzt: x.kw, an: !!x.an,
        hand: !!x.hand_seit, hand_seit: x.hand_seit || null, warte: x.warte || null, erreichbar: x.erreichbar !== false, schalter: g.schalter, leistung: g.leistung, energie: g.energie,
        aktiv: x.aktiv !== false, status: x.status || (x.aktiv === false ? 'inaktiv' : 'aktiv'), zusatz: !!x.zusatz, np: x.notprogramm || null, nennKwEigen: zahl(g.nenn_kw_eigen) ? Number(g.nenn_kw_eigen) : null, leistungEigen: g.leistung_eigen || null, energieEigen: g.energie_eigen || null }; });
    let zst = c.zustand in FARBE ? c.zustand : (pumpe ? 'aus' : 'aus');
    const offline = zst === 'offline' || (geraete.length > 0 && geraete.every(g => !g.erreichbar));
    if (offline) zst = 'offline';
    const tuerS = eb.tuer && hass && hass.states[eb.tuer];
    const tuer = eb.tuer ? { eid: eb.tuer, sensor: (tuerS && tuerS.attributes.friendly_name) || eb.tuer, offen: c.tuer && c.tuer.offen ? Math.max(1, minSeitAb(c.tuer.seit, jetztMs) ?? 1) : 0 } : undefined;
    return { id: b.id, name: b.name || b.id, f: zahl(b.nr) ? Number(b.nr) : i, art: b.art, pumpe, fuehler: b.fuehler || null, sensoren: b.sensoren || [], z: zst, grund: c.grund || null,
      t: zahl(c.temperatur) ? Number(c.temperatur) : null, kw: zahl(c.kw) ? Number(c.kw) : null, text: c.text || '', geraete,
      auto: eb.auto !== false, trocknen: !!eb.trocknen, stufenAn: !!eb.stufen, primaer: eb.primaer || null, stufen: c.stufen || null, sollJ: c.soll || null, bedarfGrad: c.bedarf || null, soll: zahl(eb.soll) ? Number(eb.soll) : undefined, bedarf: !!eb.bedarf, prio: eb.prio || 'normal',
      anschluss: eb.anschluss || (anschluesse[0] && anschluesse[0].id) || null, firma: c.firma || 'eigen', tuer, offline,
      bedarfBisIso: c.bedarf_bis || null, bedarfBis: c.bedarf_bis ? lokalZ(c.bedarf_bis, zone).slice(11, 16) : null,
      boost: !!c.boost_bis, boostBis: c.boost_bis || null,
      modus: pumpe ? null : MODI.some(m => m[0] === c.modus) ? c.modus : eb.bedarf ? 'bedarf' : eb.auto === false ? 'hand' : b.fuehler ? 'thermo' : 'plan',
      lern: c.lernen || null, start: c.start || null, takt: c.takt || null, baseline: c.baseline || null, eingestellt: Array.isArray(c.eingestellt) ? c.eingestellt : [], groesse: c.groesse || null, symbol: c.symbol || null, warmVor: zahl(eb.warm_vor) ? Number(eb.warm_vor) : null, warmNach: zahl(eb.warm_nach) ? Number(eb.warm_nach) : null };   // lernende Regelung (0.8): Lernstand von der Integration
  });
  const plan = {}, frei = {};
  const freiName = {};
  for (const [iso, q] of Object.entries(lz.plan_ausnahmen || {})) plan[iso] = q || null;   // FE-0012: Tage mit Ausnahmen (auch später)
  for (const p of lz.plan_woche || []) { plan[p.datum] = p.plan || null; frei[p.datum] = p.frei || null; if (p.name) freiName[p.datum] = p.name; }
  const warnungen = (lz.warnungen || []).map(w => ({ id: w.key, key: w.key, art: w.art, stufe: w.stufe === 'stoerung' ? 'stoerung' : 'hinweis', b: w.bereich || null, g: w.geraet || null,
    titel: w.titel || w.art || '', hilfe: w.hilfe || '', seitIso: w.seit, stumm: !!(w.stumm_bis && Date.parse(w.stumm_bis) > jetztMs) }));
  const termine = (lz.termine || []).map(t => { const l = lokalZ(t.von, zone), lb = lokalZ(t.bis, zone);
    return { b: t.bereich, datum: l.slice(0, 10), von: l.slice(11, 16), bis: lb.slice(11, 16), titel: t.titel || '', uid: t.uid, rrule: t.rrule || null,
      wieder: WIEDER[t.wiederholung] ? t.wiederholung : 'einmal', boost: !!t.boost }; });
  const tage = e0.arbeitszeiten || [];
  const arbeitszeiten = tage.map(a => ({ ab: a.ab, name: a.name || '', auto: a.auto === true, tage: Object.fromEntries(TAGE.map((t, k) => { const x = (a.tage || {})[k] ?? (a.tage || {})[String(k)]; return [t, x && x[0] && x[1] ? [x[0], x[1]] : null]; })) }));
  const aktiv = (bs.status || opt.status || 'aktiv') !== 'abgeschlossen';
  const zl = r.zaehler || {};
  const wetterEid = opt.wetter || null;
  return { r, entry: bs.entry_id, titel: bs.titel || 'Baustelle', aktiv, geladen: bs.geladen !== false, version: bs.version, optionen: opt, ent: r.entitaeten || {}, z, e,
    funktionen: r.funktionen || ['heizung', 'pumpen'],
    bereiche, anschluesse, firmen, zuordnung, arbeitszeiten, ausnahmen: (e0.ausnahmen || []).map(a => ({ datum: a.datum, art: a.art in AUSNAHME ? a.art : 'zeiten', von: a.von || '07:00', bis: a.bis || '16:30', notiz: a.notiz || '' })),
    warnungen, termine, plan, frei, freiName, abschnitte: lz.abschnitte || {}, staffel: lz.staffel || null, sollG: lz.soll_gleitend || null, wetter: lz.wetter || {}, heizgrenze: lz.heizgrenze || {},
    status: lz.status || (aktiv ? 'bereit' : 'abgeschlossen'), statusText: lz.status_text || '', jetztBis: lz.jetzt_bis ? lokalZ(lz.jetzt_bis, zone).slice(11, 16) : null,
    np: lz.notprogramm || null, baseline: lz.baseline || null, protokoll: (lz.protokoll || []).map(p => protokollZeile(p, z, ersatzZone)), zaehler: zl, termineKal: e0.termine_kalender || null, wetterEid,
    beginn: bs.beginn || opt.beginn || null, beginnAuto: bs.beginn_auto === true, ende: opt.ende || null,   // Beginn leer = Tag der Anlage (AN-0002)
    hp: [Math.min(12, Math.max(1, parseInt(opt.heizperiode_von, 10) || 10)), Math.min(12, Math.max(1, parseInt(opt.heizperiode_bis, 10) || 4))] };
}
