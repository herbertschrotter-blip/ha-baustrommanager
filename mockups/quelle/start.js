// Vorschlag „Start-Logik“: eine Rechnung für den Heizbeginn, die Kopf (Jetzt, Plan) und Dialog „Lernstand“ gleich zeigen
// (Container-Kopf Variante D2, src/ansichten/container.js kopfChips; Dialog src/ansichten/einblendungen-container.js
// lernenEinblendung + alt.js aufheizTeil/warmText), auf Basis des Master-Mockups.
// Tickets FE-0031/FE-0032, Herbert 28.10.2026: Abends stand unter Jetzt „aus bis 5:15“ (morgen, gerechnet mit 18,3 °C von
// jetzt) und der Plan-Chip „warm um … · ab 2:10“ (der abgelaufene Plan von heute früh, „Frühestens 5 h“ bei 11,2 °C/kalt) –
// Widerspruch; der Dialog mischte festgehaltene Werte mit Werten von jetzt, die Vorschau rechnete ohne Auskühlen über Nacht.
// Entscheidung: eine Start-Logik (später logik/start.py) – Regelung, Jetzt-Text, Plan-Chip und Dialog zeigen dasselbe Ergebnis.
// Überarbeitung Herbert 29.10.2026: nur noch Variante B (Zeitstrahl) + „heute“. „Es gibt doch Wetterdaten stündlich und er
// weiß, wieviel Grad bei welcher Temperatur der Container auskühlt – damit eine Prognose erstellen, die laufend mit aktuellen
// Temperaturdaten angepasst wird.“ Grenze „Frühestens 5 h“ zählt vom Ziel „warm um“ (06:40 − 5 h = 01:40).
// Baut mockups/start.html: node mockups/quelle/start.js   ·   Bilder: node mockups/quelle/start.js --bilder <ordner>
//
// Kopf: Jetzt „⏸ aus bis morgen 03:30“ und Plan „⏱ morgen ab 03:30 · warm 06:35“ – gleiche Uhrzeit, gleicher Tag (tagsüber bzw.
// nach Mitternacht „heute“). Antippen: Satz der Start-Logik + „So rechnet der Start ›“ (öffnet den Lernstand). Im Lernstand
// statt der Zeile „Heute ab …“ der Abschnitt „So rechnet der Start“:
//   B  Zeitstrahl vom Abend bis Arbeitsbeginn: Innentemperatur links vom Jetzt-Strich gemessen (durchgezogen), rechts Prognose
//      (gestrichelt) – Auskühlen blau (gebogen: Stunde für Stunde (innen − außen) ÷ τ mit der stündlichen Vorhersage), Aufheizen
//      amber; Außentemperatur je Stunde als dezente zweite Linie mit Stundenpunkten; Soll, Grenze „frühestens“, Start, warm.
//      Darunter Kacheln Ziel · Kühlt bis zum Start ab · Aufheizen · Grenze (bzw. nachts „Warm“), Werte gelernt/geschätzt markiert.
//   heute  unverändert (zeigt den Widerspruch aus FE-0031/FE-0032)
// Lagen: abends (morgen) · nachts, heizt schon (heute; gemessen 20:47–04:50, danach Prognose) · Grenze erreicht (sehr kalt,
// Start 01:40 begrenzt, warm erst ≈ 07:00) · noch nicht gelernt (τ und Aufheizrate geschätzt).
// Beispielwerte gerechnet mit 1-min-Schritten: dT = −(innen − außen(t)) ÷ τ, außen linear zwischen den Vorhersagestunden;
// Aufheizen mit der gelernten Rate; Start = spätester 5-min-Zeitpunkt, mit dem es bis zum Ziel warm ist. τ ≈ 15 h (mit τ 12 h
// käme der Start bei 13,3 °C heraus – 15 h passt zu „Start bei ~13,9 °C“).
//
// DATEN – die Seite rechnet nichts. Die Start-Logik (logik/start.py) rechnet je Container bei jedem neuen Messwert und jeder
// neuen Vorhersage nach und liefert laufzeit.container.<id>.start; Regelung, `text` und lernen.warm.plan kommen aus derselben Rechnung:
//   start: { tag: 'heute' | 'morgen' | '2026-10-31', tag_t: 'morgen', tag_grund: 'heute ist die Arbeit vorbei (bis 16:30)',
//            jetzt: '20:47', laeuft: false,         // Stand der Rechnung; laeuft = Start vorbei, heizt gerade auf
//            beginn: '03:30', warm: '06:35',        // Start und erwartetes „warm um“ (≤ ziel, bei begrenzt später)
//            ziel: '06:40', arbeitsbeginn: '07:10', vor_min: 30,
//            soll: 21.9, innen_jetzt: 18.3, innen_start: 13.9,
//            tau_h: 15, tau_n: 9, tau_geschaetzt: false,   // Auskühlzeit τ (gelernt aus tau_n Nächten bzw. geschätzt)
//            aussen_von: 8, aussen_bis: 4,          // Außen laut Vorhersage jetzt → zum Start/Ende (für den Satz)
//            rate: 2.6, rate_n: 14, anzahl: 1, rate_einer: null, rate_geschaetzt: false,   // Aufheizen °C/h mit `anzahl` Heizkörpern
//            aufheiz_min: 185,
//            grenze: '01:40', grenze_h: 5,          // „Frühestens … h vor dem Ziel“ (ziel − grenze_h)
//            begrenzt: false, beginn_ohne: null,    // Grenze greift; Start, den die Rechnung ohne Grenze hätte
//            geschaetzt: false, schaetz_grund: null,
//            satz: 'Startet morgen um 03:30 …',     // ein Satz für Kopf-Chips
//            kurve: [[1080, 20.0, 'gemessen'], …, [1650, 13.9, 'prognose'], …],   // Innen: [Minuten ab heute 0:00, °C, Quelle]
//            aussen_vorhersage: [[1080, 10, 'gemessen'], [1260, 8, 'vorhersage'], …],   // Außen je Stunde: [min, °C, Quelle]
//            schritte: [{ k: 'ziel' | 'kuehl' | 'auf' | 'warm' | 'grenze', t, wert, rechnung,
//                         marke: 'gelernt' | 'geschaetzt' | 'gemessen' | 'einstellung' | null, marke_t, ton: '' | 'amber' | 'ergebnis' }] }
//   Kopf: Jetzt-Chip = erster Teil von `text` (wie heute), Plan-Chip = `${tag_t} ab ${beginn} · warm ${warm}` (laeuft: „heute ab …“,
//   begrenzt: „warm ≈ …“ amber, geschaetzt: Etikett „geschätzt“); Handy kurz „03:30 → 06:35“. Antippen: `satz`.
//   Die Seite setzt nur ein und zeichnet: Achsen = Skalierung der gelieferten Punkte; Farbe = vor/nach `beginn`, Strich =
//   Quelle des Punkts (gemessen durchgezogen, prognose gestrichelt).
const rahmen = require('./rahmen');

/* Läuft nur im Browser (als Text eingesetzt, Node führt es nie aus) */
function browser(R) {
  const { html, nothing } = R;
  const BID = 'polier';
  const G = window.START = { v: 'b', lage: 'abends', info: null };
  const de = (x, n = 1) => Number(x).toLocaleString('de-AT', { minimumFractionDigits: n, maximumFractionDigits: n }).replace('-', '−');
  const mVon = s => { const [h, m] = s.split(':').map(Number); return h * 60 + m; };
  const mUhr = m => { m = ((Math.round(m) % 1440) + 1440) % 1440; return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`; };

  /* ---------- Beispieldaten je Lage: wie die Start-Logik sie liefern soll (laufzeit.container.polier.start) ---------- */
  const S0 = { ziel: '06:40', arbeitsbeginn: '07:10', vor_min: 30, soll: 21.9, grenze: '01:40', grenze_h: 5, rate_einer: null, begrenzt: false, beginn_ohne: null,
    geschaetzt: false, schaetz_grund: null, tau_geschaetzt: false, rate_geschaetzt: false };
  const g = (L, q) => L.map(([m, c]) => [m, c, q]);
  const AUSSEN_MILD = [...g([[1080, 10], [1140, 9.3], [1200, 8.6]], 'gemessen'),
    ...g([[1260, 8], [1320, 7.5], [1380, 7], [1440, 6.4], [1500, 5.8], [1560, 5.2], [1620, 4.7], [1680, 4.3], [1740, 4.1], [1800, 4.0], [1860, 4.2]], 'vorhersage')];
  const ABEND_GEMESSEN = g([[1080, 20.0], [1140, 19.3], [1200, 18.8], [1247, 18.3]], 'gemessen');
  const ZIEL = { k: 'ziel', t: 'Ziel', wert: 'warm um 06:40', rechnung: 'Arbeitsbeginn 07:10 − 30 min „Soll erreicht vorher“', marke: 'einstellung', marke_t: 'Warm ab' };
  const LAGEN = {
    abends: { ...S0, tag: 'morgen', tag_t: 'morgen', tag_grund: 'heute ist die Arbeit vorbei (bis 16:30)', jetzt: '20:47', laeuft: false,
      beginn: '03:30', warm: '06:35', innen_jetzt: 18.3, innen_start: 13.9, tau_h: 15, tau_n: 9, aussen_von: 8, aussen_bis: 4,
      rate: 2.6, rate_n: 14, anzahl: 1, aufheiz_min: 185,
      satz: 'Startet morgen um 03:30: Bis dahin kühlt es auf etwa 13,9 °C ab (außen laut Vorhersage 8 → 4 °C), aufheizen dauert mit einem Heizkörper rund 3 h 05 min – warm um 06:35, vor dem Ziel 06:40.',
      kurve: [...ABEND_GEMESSEN, ...g([[1260, 18.2], [1320, 17.5], [1380, 16.8], [1440, 16.2], [1500, 15.5], [1560, 14.9], [1620, 14.2], [1650, 13.9], [1835, 21.9], [1870, 21.9]], 'prognose')],
      aussen_vorhersage: AUSSEN_MILD,
      schritte: [
        { k: 'kuehl', t: 'Kühlt bis zum Start ab', wert: '≈ 13,9 °C um 03:30', rechnung: 'Auskühlzeit τ ≈ 15 h · außen laut Vorhersage 8 → 4 °C · je Stunde (innen − außen) ÷ τ', marke: 'gelernt', marke_t: 'τ gelernt aus 9 Nächten' },
        ZIEL,
        { k: 'auf', t: 'Aufheizen', wert: '≈ 3 h 05 min', rechnung: '8,0 °C ÷ 2,6 °C/h · 1 Heizkörper reicht', marke: 'gelernt', marke_t: 'gelernt aus 14 Mal' },
        { k: 'grenze', t: 'Grenze', wert: 'frühestens 01:40', rechnung: '06:40 − 5 h · nicht erreicht', marke: 'einstellung', marke_t: 'Frühestens' }],
      text: 'aus bis morgen 03:30 · gelernter Beginn', zustand: 'aus',
      chipJ: ['⏸', 'aus bis morgen 03:30', 'morgen 03:30', ''], chipP: ['⏱', 'morgen ab 03:30 · warm 06:35', '03:30 → 06:35', ''] },
    nachts: { ...S0, tag: 'heute', tag_t: 'heute', tag_grund: 'Arbeitstag, Start ist vorbei – heizt gerade auf', jetzt: '04:50', laeuft: true,
      beginn: '03:30', warm: '06:35', innen_jetzt: 17.3, innen_start: 14.0, tau_h: 15, tau_n: 9, aussen_von: 4.6, aussen_bis: 4.4,
      rate: 2.6, rate_n: 14, anzahl: 1, aufheiz_min: 105,
      satz: 'Heizt seit 03:30 (da hatte es gemessen 14,0 °C, vorhergesagt waren 13,9 °C) und ist jetzt bei 17,3 °C: noch 4,6 °C, mit 2,6 °C/h etwa 1 h 45 min – warm um 06:35, vor dem Ziel 06:40.',
      kurve: [...g([[-193, 18.3], [-180, 18.2], [-120, 17.4], [-60, 16.8], [0, 16.1], [60, 15.5], [120, 14.8], [180, 14.2], [210, 14.0], [240, 15.2], [270, 16.4], [290, 17.3]], 'gemessen'),
        ...g([[395, 21.9], [430, 21.9]], 'prognose')],
      aussen_vorhersage: [...g([[-180, 8.2], [-120, 7.4], [-60, 6.9], [0, 6.5], [60, 6.0], [120, 5.4], [180, 5.0], [240, 4.6]], 'gemessen'), ...g([[300, 4.3], [360, 4.2], [420, 4.4]], 'vorhersage')],
      schritte: [
        { k: 'kuehl', t: 'Ausgekühlt bis zum Start', wert: '14,0 °C um 03:30', rechnung: 'gemessen · Prognose war 13,9 °C – τ ≈ 15 h passt', marke: 'gemessen', marke_t: 'gemessen' },
        ZIEL,
        { k: 'auf', t: 'Noch aufheizen', wert: '≈ 1 h 45 min', rechnung: '17,3 → 21,9 °C: 4,6 °C ÷ 2,6 °C/h · 1 Heizkörper', marke: 'gelernt', marke_t: 'gelernt aus 14 Mal' },
        { k: 'warm', t: 'Warm', wert: '≈ 06:35', rechnung: '04:50 + 1 h 45 min · rechtzeitig vor 06:40', marke: null, ton: 'ergebnis' }],
      text: 'heizt auf 21,9 °C · gelernter Beginn', zustand: 'heizt',
      chipJ: ['🔥', 'heizt seit 03:30', 'seit 03:30', 'warm'], chipP: ['⏱', 'heute ab 03:30 · warm 06:35', '03:30 → 06:35', ''] },
    grenze: { ...S0, tag: 'morgen', tag_t: 'morgen', tag_grund: 'heute ist die Arbeit vorbei (bis 16:30)', jetzt: '20:47', laeuft: false,
      beginn: '01:40', warm: '07:00', innen_jetzt: 12.0, innen_start: 6.9, tau_h: 15, tau_n: 9, aussen_von: -4, aussen_bis: -10,
      rate: 2.8, rate_n: 8, anzahl: 2, rate_einer: 1.4, aufheiz_min: 320, begrenzt: true, beginn_ohne: '01:20',
      satz: 'Startet morgen um 01:40 – früher nicht (Grenze „Frühestens 5 h“ vor 06:40). Bis dahin kühlt es bei −4 → −10 °C außen auf etwa 6,9 °C ab; mit beiden Heizkörpern ist es erst um etwa 07:00 warm, 20 min nach dem Ziel, vor Arbeitsbeginn.',
      kurve: [...g([[1080, 13.9], [1140, 13.0], [1200, 12.4], [1247, 12.0]], 'gemessen'),
        ...g([[1260, 11.8], [1320, 10.7], [1380, 9.7], [1440, 8.6], [1500, 7.6], [1540, 6.9], [1860, 21.9], [1870, 21.9]], 'prognose')],
      aussen_vorhersage: [...g([[1080, -1], [1140, -2], [1200, -3]], 'gemessen'),
        ...g([[1260, -4], [1320, -5], [1380, -6], [1440, -7], [1500, -8], [1560, -8.7], [1620, -9.3], [1680, -9.8], [1740, -10], [1800, -10], [1860, -9.6]], 'vorhersage')],
      schritte: [
        { k: 'kuehl', t: 'Kühlt bis zum Start ab', wert: '≈ 6,9 °C um 01:40', rechnung: 'Auskühlzeit τ ≈ 15 h · außen laut Vorhersage −4 → −10 °C · je Stunde (innen − außen) ÷ τ', marke: 'gelernt', marke_t: 'τ gelernt aus 9 Nächten' },
        ZIEL,
        { k: 'auf', t: 'Aufheizen', wert: '≈ 5 h 20 min', rechnung: '15,0 °C ÷ 2,8 °C/h mit 2 Heizkörpern · einer allein 1,4 °C/h, zu langsam', marke: 'gelernt', marke_t: 'gelernt aus 8 Mal' },
        { k: 'grenze', t: 'Grenze', wert: 'frühestens 01:40', rechnung: '06:40 − 5 h · erreicht: bräuchte 01:20, warm erst ≈ 07:00 (20 min nach dem Ziel, vor Arbeitsbeginn)', marke: 'einstellung', marke_t: 'Frühestens', ton: 'amber' }],
      text: 'aus bis morgen 01:40 · gelernter Beginn, begrenzt', zustand: 'aus',
      chipJ: ['⏸', 'aus bis morgen 01:40', 'morgen 01:40', ''], chipP: ['⏱', 'morgen ab 01:40 · warm ≈ 07:00', '01:40 → 07:00', 'amber'] },
    geschaetzt: { ...S0, tag: 'morgen', tag_t: 'morgen', tag_grund: 'heute ist die Arbeit vorbei (bis 16:30)', jetzt: '20:47', laeuft: false,
      beginn: '02:35', warm: '06:40', innen_jetzt: 18.3, innen_start: 13.7, tau_h: 12, tau_n: 0, tau_geschaetzt: true, aussen_von: 8, aussen_bis: 4,
      rate: 2.0, rate_n: 0, rate_geschaetzt: true, anzahl: 1, aufheiz_min: 245, geschaetzt: true, schaetz_grund: 'aus der Größe (6 m-Container), dem Wärmeverlust und der Heizleistung (2 kW)',
      satz: 'Startet morgen um 02:35, damit es um 06:40 21,9 °C hat – noch geschätzt (Auskühlen und Aufheizen aus Größe und Heizleistung, vorsichtig gerechnet).',
      kurve: [...ABEND_GEMESSEN, ...g([[1260, 18.1], [1320, 17.3], [1380, 16.5], [1440, 15.7], [1500, 14.9], [1560, 14.2], [1595, 13.7], [1840, 21.9], [1870, 21.9]], 'prognose')],
      aussen_vorhersage: AUSSEN_MILD,
      schritte: [
        { k: 'kuehl', t: 'Kühlt bis zum Start ab', wert: '≈ 13,7 °C um 02:35', rechnung: 'Auskühlzeit τ ≈ 12 h aus Größe und Wärmeverlust · außen laut Vorhersage 8 → 4 °C', marke: 'geschaetzt', marke_t: 'τ noch geschätzt' },
        ZIEL,
        { k: 'auf', t: 'Aufheizen', wert: '≈ 4 h 05 min', rechnung: '8,2 °C ÷ 2,0 °C/h · aus 6 m-Container und 2 kW', marke: 'geschaetzt', marke_t: 'noch geschätzt · 0 von 3 gemessen' },
        { k: 'grenze', t: 'Grenze', wert: 'frühestens 01:40', rechnung: '06:40 − 5 h · nicht erreicht', marke: 'einstellung', marke_t: 'Frühestens' }],
      text: 'aus bis morgen 02:35 · geschätzter Beginn', zustand: 'aus',
      chipJ: ['⏸', 'aus bis morgen 02:35', 'morgen 02:35', ''], chipP: ['⏱', 'morgen ab 02:35 · warm 06:40', '02:35 → 06:40', ''] },
  };
  // heute (0.8.156): Jetzt aus dem Text der Regelung (rechnet von jetzt), Plan aus dem festgehaltenen Plan von heute früh
  const HEUTE = { text: 'aus bis 5:15 · gelernter Beginn', zustand: 'aus', temperatur: 18.3,
    warm: { gelernt: true, n: 14, n_noetig: 3, band: 'kalt', soll: 21.9, innen: 11.2, rate: 2.1, aufheiz_min: 300, vor: 30, plan: { start: 130, ziel: 400, ende: 990, begrenzt: true } } };

  function schreiben() {
    const B = window.baustelleBeispiel, w = B && B.welt && B.welt[0]; if (!w) return;
    const L = LAGEN[G.lage], br = w.bereiche.find(x => x.id === BID); br.name = '001_C_POL';
    w.einstellungen.heizung = { ...(w.einstellungen.heizung || {}), soll_art: 'gleitend' };
    w.laufzeit.soll_gleitend = { ...(w.laufzeit.soll_gleitend || {}), soll: 21.9 };
    const c = w.laufzeit.container[BID], alt = G.v === 'heute';
    const warm = alt ? HEUTE.warm : { gelernt: !L.geschaetzt, n: L.rate_n, n_noetig: 3, band: L.aussen_von < 5 ? 'kalt' : 'mild', soll: L.soll, innen: L.innen_jetzt, rate: L.rate, aufheiz_min: L.aufheiz_min, vor: L.vor_min,
      plan: { start: mVon(L.beginn), ziel: mVon(L.ziel), ende: 990, begrenzt: L.begrenzt } };   // aus derselben Rechnung wie start
    const lern = { an: true, anteil: null, zyklus_min: 10, erwartet: 0.4, aus_bei: 21.5, offen: null, warm, ...(c.lernen || {}) };
    lern.warm = warm; lern.an = true; lern.offen = null;
    lern.aufheizen = G.lage === 'geschaetzt' && !alt ? {} : { 'mild|1': { rate: 2.6, n: 14 }, 'kalt|1': { rate: 1.4, n: 5 }, 'kalt|2': { rate: 2.8, n: 8 } }; lern.auf_n = 3;   // Tabelle „Aufheizen“ passend zu start
    Object.assign(c, { modus: 'thermo', zustand: alt ? HEUTE.zustand : L.zustand, grund: 'gelernt', text: alt ? HEUTE.text : L.text, temperatur: alt ? HEUTE.temperatur : L.innen_jetzt,
      lernen: lern, takt: null, tuer: { offen: false, seit: null }, boost_bis: null, soll: { wert: 21.9, versch: 0, eigen: 0 },
      start: alt ? undefined : L });   // start: neues Feld (Vorschlag)
    const f = c.symbol && c.symbol.fenster && c.symbol.fenster.find(x => x.sensor); if (f) f.zustand = 'zu';
  }
  const neuLaden = () => { schreiben(); window.baustelleBeispiel.hassNeu(); return Promise.all(R.P().map(q => { q.cache = {}; return q._laden(); })); };
  const ST = () => LAGEN[G.lage];

  /* ---------- Kopf: Jetzt- und Plan-Chip aus start ---------- */
  const lernenAuf = p => { G.info = null; p.einblenden('lernen'); };
  function kopfChips() {
    const S = ST(), [ji, jl, jk, jt] = S.chipJ, [pi, pl, pk, pt] = S.chipP;
    return {
      jetzt: { k: 'st-jetzt', ic: ji, ton: jt, lang: jl, kurz: jk, info: p => html`${S.satz} <button class="st-link" @click=${() => lernenAuf(p)}>So rechnet der Start ›</button>` },
      plan: { k: 'st-plan', ic: pi, ton: pt, lang: html`${pl}${S.geschaetzt ? html` <span class="st-mini">geschätzt</span>` : nothing}`, kurz: pk,
        info: p => html`${S.satz}${S.begrenzt ? html` <b>Grenze erreicht.</b>` : nothing} <span class="st-stand">Rechnet laufend nach · Stand ${S.jetzt}.</span> <button class="st-link" @click=${() => lernenAuf(p)}>So rechnet der Start ›</button>` } };
  }
  const chip = c => html`<button class="ck-chip ${c.ton} ${G.info === c.k ? 'auf' : ''}" data-k=${c.k} aria-expanded=${G.info === c.k ? 'true' : 'false'}
      @click=${() => { G.info = G.info === c.k ? null : c.k; for (const q of R.P()) if (q.s.ck) q.s.ck = { ...q.s.ck, info: null, modus: false }; R.neuAlle(); }}>
      <span class="ck-ic">${c.ic}</span><span class="ck-l">${c.lang}</span><span class="ck-k">${c.kurz}</span></button>`;
  const info = (p, c) => c && G.info === c.k ? html`<div class="ck-info tk-info" role="note"><span>${c.info(p)}</span><button aria-label="schließen" @click=${() => { G.info = null; R.neuAlle(); }}>✕</button></div>` : nothing;
  const kVon = t => t && Array.isArray(t.strings) && t.strings.some(s => s.includes('class="ck-chip ')) ? t.values[2] : null;

  R.vorlage({ merkmal: 'class="ckd-g" data-g=', wann: p => G.v !== 'heute' && p.s.view === 'container' && p.b && p.b.id === BID,
    fn: (t, p) => {
      const gr = t.values[0], C = kopfChips();
      if (p.s.ck && p.s.ck.info) G.info = null;
      if (gr === 'Jetzt') { const rest = (t.values[3] || []).filter(c => kVon(c) !== 'zust'); t.values[3] = [chip(C.jetzt), ...rest]; if (G.info === C.jetzt.k) t.values[4] = info(p, C.jetzt); }
      if (gr === 'Plan') { const rest = (t.values[3] || []).filter(c => kVon(c) !== 'warm'); t.values[3] = [chip(C.plan), ...rest]; if (G.info === C.plan.k) t.values[4] = info(p, C.plan); }
      return t;
    } });
  const BAND = { b: 'Vorschlag Start · B: Zeitstrahl – gemessen, Prognose, Außen je Stunde', heute: 'heute (0.8.156) zum Vergleich – Jetzt und Plan rechnen getrennt' };
  R.vorlage({ merkmal: 'class="glas-panel ck ck-d ck-d2 ', wann: p => p.s.view === 'container' && p.b && p.b.id === BID, fn: t => html`${R.band(BAND[G.v])}${t}` });

  /* ---------- Dialog Lernstand: Abschnitt „So rechnet der Start“ statt „Heute ab …“ ---------- */
  const MARKE = { gelernt: 'st-m-gel', geschaetzt: 'st-m-ges', gemessen: 'st-m-mes', einstellung: 'st-m-ein' };
  const marke = s => s.marke ? html`<span class="st-m ${MARKE[s.marke]}">${s.marke === 'geschaetzt' ? '≈ ' : s.marke === 'gelernt' ? '🧠 ' : ''}${s.marke_t}</span>` : nothing;

  function kurve(p, S) {   // Zeitstrahl – Achsen nur Skalierung der gelieferten Punkte
    const W = p.narrow ? 320 : 440, H = p.narrow ? 226 : 236, l = 30, r = W - 12, o = 46, u = H - 34, fs = p.narrow ? 10 : 11;
    const K = S.kurve, A = S.aussen_vorhersage, alle = [...K, ...A];
    const morgen = S.tag === 'morgen' ? 1440 : 0, bg = mVon(S.beginn) + morgen, wm = mVon(S.warm) + morgen, ab = mVon(S.arbeitsbeginn) + morgen, gr = mVon(S.grenze) + morgen;
    const jt = mVon(S.jetzt);   // Stand der Rechnung (Minuten ab heute 0:00 wie kurve)
    const t0 = Math.min(...alle.map(k => k[0])), t1 = Math.max(ab, ...alle.map(k => k[0])) + 10;
    const cMin = Math.floor(Math.min(...alle.map(k => k[1])) - 1), cMax = Math.ceil(S.soll + 1);
    const x = m => +(l + (m - t0) / (t1 - t0) * (r - l)).toFixed(1), y = c => +(u - (c - cMin) / (cMax - cMin) * (u - o)).toFixed(1);
    const T = [];
    T.push(`<rect class="st-band" x="${x(bg)}" y="${o - 4}" width="${x(wm) - x(bg)}" height="${u - o + 4}"></rect>`);
    T.push(`<line class="st-soll" x1="${l}" x2="${r}" y1="${y(S.soll)}" y2="${y(S.soll)}"></line><text class="st-ax" x="${l - 4}" y="${y(S.soll) + 4}" text-anchor="end" font-size="${fs}">${de(S.soll, 0)}°</text>`);
    if (cMin < 0) T.push(`<line class="st-null" x1="${l}" x2="${r}" y1="${y(0)}" y2="${y(0)}"></line><text class="st-ax" x="${l - 4}" y="${y(0) + 4}" text-anchor="end" font-size="${fs}">0°</text>`);
    T.push(`<text class="st-ax" x="${l - 4}" y="${y(cMin) + 4}" text-anchor="end" font-size="${fs}">${de(cMin, 0)}°</text>`);
    const grL = gr < jt;   // Beschriftung der Grenze auf der Seite weg vom Jetzt-Strich
    T.push(`<line class="st-gr" x1="${x(gr)}" x2="${x(gr)}" y1="${o - 30}" y2="${u}"></line><text class="st-ax st-gr-t" x="${x(gr) + (grL ? -3 : 3)}" y="${o - 26}" text-anchor="${grL ? 'end' : 'start'}" font-size="${fs - 1}">frühestens ${S.grenze}</text>`);
    // Außen je Stunde: dezente Linie, gemessen durchgezogen, Vorhersage gestrichelt, Punkte je Stunde
    for (let i = 1; i < A.length; i++) T.push(`<line class="st-aussen ${A[i][2] === 'vorhersage' ? 'prog' : ''}" x1="${x(A[i - 1][0])}" y1="${y(A[i - 1][1])}" x2="${x(A[i][0])}" y2="${y(A[i][1])}"></line>`);
    for (const a of A) T.push(`<circle class="st-apkt ${a[2] === 'vorhersage' ? 'prog' : ''}" cx="${x(a[0])}" cy="${y(a[1])}" r="${a[2] === 'vorhersage' ? 2.2 : 1.6}"></circle>`);
    const aL = A[A.length - 1];
    T.push(`<text class="st-ax st-a-t" x="${x(aL[0])}" y="${y(aL[1]) - 6}" text-anchor="end" font-size="${fs - 1}">außen ${de(aL[1], 0)}°</text>`);
    // Innen: Farbe vor/nach Start, Strich nach Quelle
    for (let i = 1; i < K.length; i++) { const [m0, c0] = K[i - 1], [m1, c1, q] = K[i];
      T.push(`<line class="st-i ${m1 <= bg ? 'kalt' : 'warm'} ${q === 'prognose' ? 'prog' : ''}" x1="${x(m0)}" y1="${y(c0)}" x2="${x(m1)}" y2="${y(c1)}"></line>`); }
    // Jetzt-Strich: links gemessen, rechts Prognose
    T.push(`<line class="st-jetzt" x1="${x(jt)}" x2="${x(jt)}" y1="${o - 36}" y2="${u}"></line><text class="st-ax st-fett" x="${x(jt) - 3}" y="${o - 8}" text-anchor="end" font-size="${fs}">jetzt ${S.jetzt}</text>`);
    T.push(`<text class="st-ax st-klein" x="${x(jt) - 3}" y="${o - 26}" text-anchor="end" font-size="${fs - 1}">◂ gemessen</text><text class="st-ax st-klein" x="${x(jt) + 3}" y="${o - 26}" font-size="${fs - 1}">Prognose ▸</text>`);
    const kj = K.find(k => k[0] === jt) || K[0];
    T.push(`<circle class="st-pkt" cx="${x(kj[0])}" cy="${y(kj[1])}" r="3.5"></circle><text class="st-wert" x="${x(kj[0]) + (S.laeuft ? -6 : 5)}" y="${y(kj[1]) - 7}" text-anchor="${S.laeuft ? 'end' : 'start'}" font-size="${fs}">${de(kj[1])}°</text>`);
    T.push(`<circle class="st-pkt kalt" cx="${x(bg)}" cy="${y(S.innen_start)}" r="3.5"></circle><text class="st-wert" x="${x(bg) + 5}" y="${y(S.innen_start) + 4}" font-size="${fs}">${S.laeuft ? '' : '≈ '}${de(S.innen_start)}°</text>`);
    T.push(`<circle class="st-pkt warm" cx="${x(wm)}" cy="${y(S.soll)}" r="3.5"></circle><text class="st-ax st-fett" x="${x(wm)}" y="${o - 8}" text-anchor="middle" font-size="${fs}">warm ${S.warm}</text>`);
    // Zeitachse: erster Punkt, Start, Arbeitsbeginn
    T.push(`<line class="st-achse" x1="${l}" x2="${r}" y1="${u}" y2="${u}"></line>`);
    for (const [m, t, an, kl] of [[t0, mUhr(t0), 'start', ''], [bg, `${S.beginn} Start`, 'middle', 'st-fett'], [ab, S.arbeitsbeginn, 'end', '']])
      T.push(`<line class="st-tick" x1="${x(m)}" x2="${x(m)}" y1="${u}" y2="${u + 4}"></line><text class="st-ax ${kl}" x="${x(m)}" y="${u + 16}" text-anchor="${an}" font-size="${fs}">${t}</text>`);
    const el = R.svg(`<svg class="st-svg" viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="Innen- und Außentemperatur bis zum Arbeitsbeginn">${T.join('')}</svg>`);
    const legende = html`<div class="st-leg"><span><i class="st-l-gem"></i>gemessen</span><span><i class="st-l-prog"></i>Prognose</span><span><i class="st-l-kalt"></i>kühlt ab</span><span><i class="st-l-warm"></i>heizt</span><span><i class="st-l-aus"></i>außen je Stunde (Vorhersage)</span></div>`;
    return html`<div class="st-kurve">${el}</div>${legende}
      <div class="st-zahlen">${S.schritte.map(z => html`<div class="st-z ${z.ton || ''} ${z.k === 'kuehl' ? 'breit' : ''}" data-k=${z.k}><span class="st-t">${z.t}</span><b>${z.wert}</b><span class="st-r">${z.rechnung}</span>${marke(z)}</div>`)}</div>`;
  }

  function abschnitt(p) {
    const S = ST();
    const kopf = html`<div class="gruppe-t st-gt">So rechnet der Start</div>
        <div class="st-ergebnis ${S.begrenzt ? 'amber' : ''}"><span>${S.laeuft ? html`Heizt seit <b>${S.beginn}</b> · warm um <b>≈ ${S.warm}</b>` : html`Start <b>${S.tag_t} ${S.beginn}</b> · warm um <b>${S.begrenzt ? '≈ ' : ''}${S.warm}</b>`}</span>
          ${S.geschaetzt ? html`<span class="st-m st-m-ges">≈ noch geschätzt</span>` : nothing}${S.begrenzt ? html`<span class="st-m st-m-amb">Grenze erreicht</span>` : nothing}</div>`;
    return html`<div class="st-ab">${R.band(BAND.b)}${kopf}${kurve(p, S)}
      ${S.geschaetzt ? html`<div class="leise st-fuss">Noch nicht gelernt: geschätzt ${S.schaetz_grund}, mit Reserve. Nach ein paar Nächten lernt er τ, nach 3 gemessenen Aufheizungen die Rate.</div>` : nothing}
      <div class="leise st-fuss">↻ Rechnet bei jedem neuen Messwert und jeder neuen Vorhersage nach; weicht das Auskühlen ab, lernt er τ nach · Stand ${S.jetzt} · Regelung, „Jetzt“ und „Plan“ zeigen dieselbe Rechnung</div></div>`;
  }
  R.vorlage({ merkmal: '<h3>Lernstand · ', wann: p => p.s.sheet && p.s.sheet.art === 'lernen',
    fn: (t, p) => {
      if (G.v === 'heute') { t.values[0] = html`${t.values[0]}${R.band(BAND.heute)}`; return t; }
      t.values[3] = html`${t.values[3] || nothing}${abschnitt(p)}`;   // nach dem Kopf, vor „Regelung“
      const a = t.values.find(v => v && Array.isArray(v.values) && typeof v.values[0] === 'string' && v.values[0].includes('class="wa-heute"'));
      if (a) a.values = [a.values[0].replace(/<div class="wa-heute">[\s\S]*?<\/div><\/div>/, '<div class="leise">Wann der Container startet, steht oben unter „So rechnet der Start“.</div>')];
      return t;
    } });

  R.stil(`
.ckd-gruppen .ckd-g:has(> .tk-info) { grid-column: 1 / -1; }
.sheet:not(.an) { visibility: hidden; }   /* Bilder: zugeklappte Einblendung blieb sonst als dunkler Streifen im Bild */
@container (min-width: 641px) { .ckd-gruppen .ckd-g[data-g="Plan"] { grid-column: span 2; } }   /* Plan-Chip mit Tag und zwei Uhrzeiten: zwei Spalten breit */
.tk-info { justify-content: space-between; } .tk-info > span { max-width: 66ch; }
.tk-info b { font-weight: 600; color: var(--ink); }
.st-link { border: 0; background: none; padding: 0; font: inherit; color: var(--blau); cursor: pointer; white-space: nowrap; }
.st-stand { opacity: .8; }
.st-mini { font-size: 10.5px; padding: 0 5px; border-radius: 5px; border: 1px dashed var(--amber); color: var(--amber); margin-left: 2px; }
.st-ab { margin: 4px 0 14px; padding: 12px 14px; border-radius: 14px; background: rgba(120,120,128,.12); display: flex; flex-direction: column; gap: 8px; }
.st-ab .r-band { margin: 0; }
.st-gt { margin: 0 0 -4px; }
.st-ergebnis { font-size: 17px; display: flex; flex-wrap: wrap; align-items: center; gap: 4px 8px; }
.st-ergebnis b { font-weight: 650; color: var(--ink); }
.st-m { font-size: 11px; padding: 1px 7px; border-radius: 8px; white-space: nowrap; border: 1px solid rgba(120,120,128,.35); color: var(--ink2); }
.st-m-gel { border-color: color-mix(in srgb, var(--blau) 55%, transparent); color: var(--blau); }
.st-m-ges, .st-m-amb { border: 1px dashed var(--amber); color: var(--amber); }
.st-m-mes { opacity: .8; }
.st-fuss { font-size: 12px; }
.st-kurve { width: 100%; }
.st-svg { display: block; overflow: visible; }
.st-svg .st-achse, .st-svg .st-tick { stroke: var(--ink2); stroke-width: 1; opacity: .5; }
.st-svg .st-soll { stroke: var(--ink2); stroke-dasharray: 3 4; opacity: .6; }
.st-svg .st-null { stroke: var(--ink2); stroke-width: .8; opacity: .3; }
.st-svg .st-gr { stroke: var(--amber); stroke-dasharray: 2 3; stroke-width: 1.2; }
.st-svg .st-gr-t { fill: var(--amber); }
.st-svg .st-band { fill: var(--amber); opacity: .12; }
.st-svg .st-i { stroke-width: 2.6; stroke-linecap: round; }
.st-svg .st-i.kalt { stroke: var(--blau); } .st-svg .st-i.warm { stroke: var(--amber); }
.st-svg .st-i.prog { stroke-dasharray: 5 4; stroke-linecap: butt; }
.st-svg .st-aussen { stroke: var(--ink2); stroke-width: 1.2; opacity: .55; } .st-svg .st-aussen.prog { stroke-dasharray: 3 3; }
.st-svg .st-apkt { fill: var(--ink2); opacity: .7; }
.st-svg .st-a-t { opacity: .85; }
.st-svg .st-pkt { fill: var(--ink); } .st-svg .st-pkt.warm { fill: var(--amber); } .st-svg .st-pkt.kalt { fill: var(--blau); }
.st-svg .st-jetzt { stroke: var(--ink); stroke-width: 1.2; opacity: .75; }
.st-svg text { fill: var(--ink2); font-family: inherit; }
.st-svg .st-fett, .st-svg .st-wert { fill: var(--ink); font-weight: 600; }
.st-svg .st-klein { opacity: .8; }
.st-leg { display: flex; flex-wrap: wrap; gap: 4px 12px; font-size: 11.5px; color: var(--ink2); }
.st-leg span { display: inline-flex; align-items: center; gap: 5px; white-space: nowrap; }
.st-leg i { display: inline-block; width: 16px; height: 0; border-top: 2.5px solid var(--ink2); }
.st-leg .st-l-prog { border-top-style: dashed; }
.st-leg .st-l-kalt { border-top-color: var(--blau); } .st-leg .st-l-warm { border-top-color: var(--amber); }
.st-leg .st-l-aus { border-top-width: 1.2px; border-top-style: dashed; opacity: .7; }
.st-zahlen { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; }
.st-z { display: flex; flex-direction: column; gap: 2px; padding: 8px 10px; border-radius: 10px; background: rgba(120,120,128,.12); min-width: 0; }
.st-z.breit { grid-column: 1 / -1; }
.st-z.breit ~ .st-z:last-child:nth-child(even) { grid-column: 1 / -1; }   /* übrig bleibende Kachel über die ganze Breite */
.st-z .st-t { font-size: 11px; text-transform: uppercase; letter-spacing: .5px; color: var(--ink2); }
.st-z b { color: var(--ink); font-weight: 650; }
.st-z .st-r { font-size: 12px; color: var(--ink2); }
.st-z .st-m { align-self: flex-start; margin-top: 2px; white-space: normal; }
.st-z.amber b { color: var(--amber); }
.st-z.ergebnis { background: color-mix(in srgb, var(--amber) 14%, transparent); }
@container (max-width: 640px) {
  .st-ab { padding: 10px 10px; }
  .st-ergebnis { font-size: 15.5px; }
}`);

  /* ---------- Vorführ-Leiste ---------- */
  R.vorfuehren(async w => {
    Object.assign(G, { v: w.variante, lage: w.lage, info: null });
    if (!window.baustelleBeispiel || !window.baustelleBeispiel.welt) return;
    await neuLaden();
    for (const q of R.P()) { if (!q.d) continue; q.s.sheet = null; q.s.ck = null; q.containerOeffnen(BID); }
    if (w.zeigen === 'plan' || w.zeigen === 'jetzt') {
      if (G.v === 'heute') { for (const q of R.P()) if (q.b) q.s.ck = { id: q.b.id, info: w.zeigen === 'plan' ? 'warm' : 'zust', modus: false }; }
      else G.info = w.zeigen === 'plan' ? 'st-plan' : 'st-jetzt';
    }
    if (w.zeigen === 'dialog') for (const q of R.P()) if (q.b) q.einblenden('lernen');
    R.neuAlle();
  });
}

const V = [['b', 'B · Zeitstrahl mit Prognose'], ['heute', 'heute (Widerspruch)']];
const LAGE = [['abends', 'abends (morgen)'], ['nachts', 'nachts, heizt schon (heute)'], ['grenze', 'Grenze erreicht (sehr kalt)'], ['geschaetzt', 'noch nicht gelernt (geschätzt)']];
const ZEIGEN = [['dialog', 'Dialog Lernstand'], ['kopf', 'nur Kopf'], ['plan', 'Plan-Chip angetippt'], ['jetzt', 'Jetzt-Chip angetippt']];
const faelle = [];
faelle.push({ name: 'heute-plan', werte: { variante: 'heute', lage: 'abends', zeigen: 'plan' } }, { name: 'heute-jetzt', werte: { variante: 'heute', lage: 'abends', zeigen: 'jetzt' } });
for (const l of ['abends', 'nachts', 'grenze', 'geschaetzt']) faelle.push({ name: `kopf-${l}-plan`, werte: { variante: 'b', lage: l, zeigen: 'plan' } });
faelle.push({ name: 'kopf-abends-jetzt', werte: { variante: 'b', lage: 'abends', zeigen: 'jetzt' } }, { name: 'kopf-grenze', werte: { variante: 'b', lage: 'grenze', zeigen: 'kopf' } });
for (const l of ['abends', 'nachts', 'grenze', 'geschaetzt']) faelle.push({ name: `b-${l}-dialog`, werte: { variante: 'b', lage: l, zeigen: 'dialog' } });
faelle.push({ name: 'heute-dialog', werte: { variante: 'heute', lage: 'abends', zeigen: 'dialog' }, scroll: '.wa-heute' });
rahmen.bauen({ datei: 'start.html', titel: 'Baustelle – Start-Logik', leiste: 'Container · Start-Logik · B/heute', browser, faelle,
  auswahl: [{ id: 'variante', t: 'Variante', optionen: V }, { id: 'lage', t: 'Lage', optionen: LAGE }, { id: 'zeigen', t: 'zeigen', optionen: ZEIGEN }] });
