// Vorschlag „Takt verständlich“ im Kopf der Container-Ansicht (Variante D2 seit 0.8.151, src/ansichten/container.js kopf)
// auf Basis des Master-Mockups. Befund Herbert, 28.10.2026: „Vorher war es komplett unverständlich … wenn ich draufklicke,
// soll dargestellt werden, was momentan läuft und wie lange es laufen soll. Aber verständlich.“
// Baut mockups/takt.html: node mockups/quelle/takt.js   ·   Bilder: node mockups/quelle/takt.js --bilder <ordner>
//
// Heute: unter Jetzt „⏸ Takt“ (Antippen: „Takt-Pause · lernend 46 % je 10 min“, Text der Integration aus
// funktionen/heizung/anzeige.py), unter Lernen „🧠 lernt“, „↘ +0,4°“ (Nachlauf ohne Erklärung), „◔ 46 %“. Läuft die
// Heizung gerade im an-Teil der Runde, steht nur „heizt auf 22,4 °C“ da – vom Takt sieht man nichts.
// Vorschlag:
//   A  Jetzt „⏸ Pause bis 17:42“ bzw. „🔥 an bis 17:38“; Antippen erklärt in einem Satz die Runde (je 10 min etwa 4½ an,
//      5½ aus), was gerade läuft und bis wann. Lernen „◔ 4½ von 10 min“, „↘ wärmt nach +0,4°“, „🧠 lernt mit“ – jedes
//      Antippen ein kurzer Satz. Dauernd an (über 80 %): „🔥 heizt durch“; Soll erreicht (unter 20 %): „✓ Soll erreicht“.
//   B  wie A, dazu im Satz ein kleiner Balken der 10-Minuten-Runde (an-Teil amber, aus-Teil grau, Marke „jetzt“)
//   heute  unverändert zum Vergleich
//
// DATEN – die Seite rechnet nichts: Uhrzeiten und Minuten muss die Integration liefern (heute gibt es nur den Satz
// „Takt-Pause · lernend 46 % je 10 min“ und lernen.anteil nur in der Pause). Vorschlag für laufzeit.container.<id>:
//   takt: { art: 'runde' | 'dauernd' | 'erreicht',   // runde = 20–80 % (logik/lernen.py tpi_ein, MIN_EIN_MIN), dauernd > 80 %, erreicht < 20 %
//           anteil: 46,                               // % (wie lernen.anteil, aber auch im an-Teil der Runde)
//           zyklus_min: 10,                           // = lernen.ZYKLUS_MIN
//           an_min: 4.5, aus_min: 5.5,                // je Runde, auf ½ min gerundet (an_min + aus_min = zyklus_min)
//           phase: 'an' | 'pause',                    // was gerade läuft
//           bis: '17:42',                             // Ende der Phase (HH:MM, lokale Zeit); bei dauernd/erreicht null
//           minute: 7.5 }                             // nur Variante B: Stelle „jetzt“ in der Runde (0…zyklus_min)
//   dazu für die Sätze: innen (temperatur), soll (soll.wert), lernen.erwartet (Nachlauf), lernen.aus_bei – gibt es schon.
// Die Seite formatiert nur (4.5 → „4½“). Beispielwerte stehen unten in LAGEN; die übrigen Felder schreibt das Mockup in den
// Beispiel-hass wie die Integration (text, zustand, temperatur, lernen, soll).
const rahmen = require('./rahmen');

/* Läuft nur im Browser (als Text eingesetzt, Node führt es nie aus) */
function browser(R) {
  const { html, nothing } = R;
  const BID = 'polier', SOLL = 22.4;
  const G = window.TAKT = { v: 'a', lage: 'pause', info: null };
  const de = (x, n = 1) => Number(x).toLocaleString('de-AT', { minimumFractionDigits: n, maximumFractionDigits: n });
  const minT = x => { const g = Math.floor(x); return Math.abs(x - g - 0.5) < 0.01 ? (g ? `${g}½` : '½') : de(x, 0); };   // 4.5 → „4½“

  /* ---------- Beispieldaten je Lage: wie die Integration sie liefern soll (laufzeit.container.polier) ---------- */
  const LERN = { an: true, anteil: null, zyklus_min: 10, erwartet: 0.4, aus_bei: 22.0, offen: null,
    warm: { gelernt: true, n: 5, n_noetig: 3, band: 'mild', soll: SOLL, innen: 18.4, rate: 1.2, aufheiz_min: 270, vor: 20, plan: { start: 130, ziel: 400, ende: 1020, begrenzt: false } } };
  const LAGEN = {
    pause: { zustand: 'aus', text: 'Takt-Pause · lernend 46 % je 10 min', temperatur: 20.3, lernen: { ...LERN, anteil: 46 },
      takt: { art: 'runde', anteil: 46, zyklus_min: 10, an_min: 4.5, aus_min: 5.5, phase: 'pause', bis: '17:42', minute: 7.5 } },
    heizt: { zustand: 'heizt', text: 'heizt auf 22,4 °C · Arbeitszeit', temperatur: 20.3, lernen: LERN,
      takt: { art: 'runde', anteil: 46, zyklus_min: 10, an_min: 4.5, aus_min: 5.5, phase: 'an', bis: '17:38', minute: 2 } },
    dauernd: { zustand: 'heizt', text: 'heizt auf 22,4 °C · Arbeitszeit', temperatur: 18.1, lernen: LERN,
      takt: { art: 'dauernd', anteil: 100, zyklus_min: 10, an_min: 10, aus_min: 0, phase: 'an', bis: null, minute: null } },
    erreicht: { zustand: 'aus', text: 'Soll erreicht · hält 22,4 °C', temperatur: 22.5, lernen: LERN,
      takt: { art: 'erreicht', anteil: 0, zyklus_min: 10, an_min: 0, aus_min: 10, phase: 'pause', bis: null, minute: null } },
  };
  function schreiben() {
    const B = window.baustelleBeispiel, w = B && B.welt && B.welt[0]; if (!w) return;
    const L = LAGEN[G.lage];
    const br = w.bereiche.find(x => x.id === BID); br.name = '001_C_POL';
    w.einstellungen.heizung = { ...(w.einstellungen.heizung || {}), soll_art: 'gleitend' };
    w.laufzeit.soll_gleitend = { ...(w.laufzeit.soll_gleitend || {}), soll: SOLL };
    const c = w.laufzeit.container[BID];
    Object.assign(c, { modus: 'thermo', zustand: L.zustand, grund: 'arbeitszeit', text: L.text, temperatur: L.temperatur, lernen: L.lernen,
      tuer: { offen: false, seit: null }, boost_bis: null, soll: { wert: SOLL, versch: 0, eigen: 0 }, takt: L.takt });   // takt: neues Feld (Vorschlag)
    const f = c.symbol && c.symbol.fenster && c.symbol.fenster.find(x => x.sensor); if (f) f.zustand = 'zu';
  }
  const neuLaden = () => { schreiben(); window.baustelleBeispiel.hassNeu(); return Promise.all(R.P().map(q => { q.cache = {}; return q._laden(); })); };

  /* ---------- Chips und Sätze (A, B): nur Felder von oben, die Seite formatiert nur ---------- */
  function rundeBalken(T) {   // Variante B: 10-Minuten-Runde, an amber, aus grau, Marke „jetzt“
    if (G.v !== 'b' || T.art === 'erreicht') return nothing;
    const an = T.an_min / T.zyklus_min * 100, jetzt = T.minute === null ? null : T.minute / T.zyklus_min * 100;
    return html`<span class="tk-runde" aria-hidden="true">
        <span class="tk-bahn"><span class="tk-an" style="flex:${an} 0 0"></span><span class="tk-aus" style="flex:${100 - an} 0 0"></span>
          ${jetzt === null ? nothing : html`<span class="tk-jetzt" style="left:${jetzt}%"><i>jetzt</i></span>`}</span>
        <span class="tk-skala">${T.art === 'runde' ? html`<span><i class="tk-q an"></i>${minT(T.an_min)} min an · <i class="tk-q"></i>${minT(T.aus_min)} min aus</span>` : html`<span><i class="tk-q an"></i>dauernd an</span>`}<span>Runde ${T.zyklus_min} min</span></span></span>`;
  }
  function jetztChip(b, T) {
    const ist = de(b.t), soll = de(SOLL);
    if (T.art === 'dauernd') return { k: 'tk-jetzt', ic: '🔥', ton: 'warm', lang: 'heizt durch', kurz: 'durch',
      info: html`Noch deutlich unter dem Soll (${ist} von ${soll} °C): Die Heizung läuft durchgehend. Kurz vor dem Soll läuft sie in Runden (je ${T.zyklus_min} Minuten an und aus), damit es nicht zu warm wird.${rundeBalken(T)}` };
    if (T.art === 'erreicht') return { k: 'tk-jetzt', ic: '✓', ton: '', lang: 'Soll erreicht', kurz: 'am Soll',
      info: html`Soll erreicht (${ist} von ${soll} °C): Die Heizung bleibt aus. Wird es kühler, läuft sie wieder in kurzen Runden.` };
    const pause = T.phase === 'pause';
    return { k: 'tk-jetzt', ic: pause ? '⏸' : '🔥', ton: pause ? '' : 'warm', lang: pause ? `Pause bis ${T.bis}` : `an bis ${T.bis}`, kurz: pause ? `Pause bis ${T.bis}` : `an bis ${T.bis}`,
      info: html`Fast am Soll (${ist} von ${soll} °C): Die Heizung läuft in Runden – je ${T.zyklus_min} Minuten etwa ${minT(T.an_min)} min an und ${minT(T.aus_min)} min aus, damit es nicht zu warm wird.
        <b>${pause ? `Gerade Pause, wieder an um ${T.bis}.` : `Gerade an, Pause ab ${T.bis}.`}</b> Je näher am Soll, desto kürzer läuft sie.${rundeBalken(T)}` };
  }
  function lernChips(b, T) {
    const l = b.lern, L = [];
    L.push({ k: 'tk-lern', ic: '🧠', ton: '', lang: 'lernt mit', kurz: 'lernt',
      info: 'Lernt bei jedem Heizen mit: wie schnell dieser Container warm wird und wie viel er nach dem Ausschalten nachwärmt – damit er pünktlich warm ist und nicht zu warm wird.' });
    L.push({ k: 'tk-nach', ic: '↘', ton: '', lang: `wärmt nach +${de(l.erwartet)}°`, kurz: `+${de(l.erwartet)}°`,
      info: `Wärmt nach dem Ausschalten noch etwa ${de(l.erwartet)} °C nach – darum schaltet die Automatik früher ab (bei ${de(l.aus_bei)} °C).` });
    if (T.art === 'runde') L.push({ k: 'tk-runde', ic: '◔', ton: '', lang: `${minT(T.an_min)} von ${T.zyklus_min} min`, kurz: `${minT(T.an_min)}/${T.zyklus_min} min`,
      info: html`In jeder ${T.zyklus_min}-Minuten-Runde läuft die Heizung gerade etwa ${minT(T.an_min)} min (${T.anteil} %). Das rechnet die Automatik laufend neu – je näher am Soll, desto kürzer.${rundeBalken(T)}` });
    return L;
  }
  const chip = c => html`<button class="ck-chip ${c.ton} ${G.info === c.k ? 'auf' : ''}" data-k=${c.k} aria-expanded=${G.info === c.k ? 'true' : 'false'}
      @click=${() => { G.info = G.info === c.k ? null : c.k; for (const q of R.P()) if (q.s.ck) q.s.ck = { ...q.s.ck, info: null, modus: false }; R.neuAlle(); }}>
      <span class="ck-ic">${c.ic}</span><span class="ck-l">${c.lang}</span><span class="ck-k">${c.kurz}</span></button>`;
  const info = L => { const c = L.find(x => x.k === G.info);
    return c ? html`<div class="ck-info tk-info" role="note"><span>${c.info}</span><button aria-label="schließen" @click=${() => { G.info = null; R.neuAlle(); }}>✕</button></div>` : nothing; };
  const kVon = t => t && Array.isArray(t.strings) && t.strings.some(s => s.includes('class="ck-chip ')) ? t.values[2] : null;   // chip(): values[2] = data-k

  /* Gruppen Jetzt und Lernen der echten Seite: Zustands- bzw. Lern-Chips durch die neuen ersetzen (Tür, Fenster bleiben) */
  R.vorlage({ merkmal: 'class="ckd-g" data-g=', wann: p => G.v !== 'heute' && p.s.view === 'container' && p.b && p.b.id === BID,
    fn: (t, p) => {
      const g = t.values[0], b = p.b, T = LAGEN[G.lage].takt;
      if (p.s.ck && p.s.ck.info) G.info = null;   // Chip der Seite angetippt: unser Satz geht zu
      if (g === 'Jetzt') { const X = [jetztChip(b, T)]; const rest = (t.values[3] || []).filter(c => kVon(c) !== 'zust');
        t.values[3] = [...X.map(chip), ...rest]; if (G.info && X.some(c => c.k === G.info)) t.values[4] = info(X); }
      if (g === 'Lernen') { const X = lernChips(b, T); const rest = (t.values[3] || []).filter(c => !['lern', 'nach', 'takt'].includes(kVon(c)));
        t.values[3] = [...X.map(chip), ...rest]; if (G.info && X.some(c => c.k === G.info)) t.values[4] = info(X); }
      return t;
    } });
  R.vorlage({ merkmal: 'class="glas-panel ck ck-d ck-d2 ', wann: p => p.s.view === 'container' && p.b && p.b.id === BID,
    fn: t => html`${R.band({ a: 'Vorschlag Takt · Variante A: was gerade läuft und bis wann, in Sätzen', b: 'Vorschlag Takt · Variante B: wie A, mit Balken der 10-Minuten-Runde', heute: 'heute (0.8.152) zum Vergleich' }[G.v])}${t}` });

  R.stil(`
.ckd-gruppen .ckd-g:has(> .tk-info) { grid-column: 1 / -1; }   /* Satz offen: Kästchen über die ganze Breite, sonst zu schmal zum Lesen */
.tk-info { justify-content: space-between; } .tk-info > span { max-width: 62ch; }
.tk-info b { font-weight: 600; color: var(--ink); }
.tk-runde { display: block; margin: 10px 0 2px; max-width: 340px; }
.tk-bahn { position: relative; display: flex; height: 10px; border-radius: 5px; overflow: visible; background: rgba(120,120,128,.25); }
.tk-an { background: var(--amber); border-radius: 5px 0 0 5px; } .tk-aus { background: rgba(120,120,128,.35); border-radius: 0 5px 5px 0; }
.tk-aus[style^="flex:0 "] { display: none; } .tk-an[style^="flex:100 "] { border-radius: 5px; }
.tk-jetzt { position: absolute; top: -4px; bottom: -4px; width: 2px; margin-left: -1px; background: var(--ink); border-radius: 1px; }
.tk-jetzt i { position: absolute; bottom: 100%; left: 50%; transform: translateX(-50%); font-style: normal; font-size: 10px; line-height: 1; padding-bottom: 2px; color: var(--ink); white-space: nowrap; }
.tk-runde { padding-top: 12px; }
.tk-skala { position: relative; display: flex; flex-wrap: wrap; justify-content: space-between; font-size: 10.5px; color: var(--ink2); margin-top: 4px; gap: 2px 10px; }
.tk-info .tk-skala > span { flex: none; min-width: auto; white-space: nowrap; }   /* .ck-info span der Seite: flex 1, min-width 0 */
.tk-q { display: inline-block; width: 8px; height: 8px; border-radius: 2px; margin: 0 4px 0 0; background: rgba(120,120,128,.55); vertical-align: 0; } .tk-q.an { background: var(--amber); }
`);

  /* ---------- Vorführ-Leiste ---------- */
  R.vorfuehren(async w => {
    Object.assign(G, { v: w.variante, lage: w.lage, info: null });
    if (!window.baustelleBeispiel || !window.baustelleBeispiel.welt) return;
    await neuLaden();
    for (const q of R.P()) { if (!q.d) continue; q.s.sheet = null; q.s.ck = null; q.containerOeffnen(BID); }
    const T = LAGEN[G.lage].takt;
    const neu = { jetzt: 'tk-jetzt', runde: T.art === 'runde' ? 'tk-runde' : null, nach: 'tk-nach', lern: 'tk-lern' }[w.zeigen] || null;
    const alt = { jetzt: 'zust', runde: 'takt', nach: 'nach', lern: 'lern' }[w.zeigen] || null;
    if (G.v === 'heute') { for (const q of R.P()) if (q.b) q.s.ck = { id: q.b.id, info: alt, modus: false }; }
    else G.info = neu;
    R.neuAlle();
  });
}

const V = [['a', 'A · Sätze: was läuft, bis wann'], ['b', 'B · wie A, mit Balken der Runde'], ['heute', 'heute (unverändert)']];
const LAGE = [['pause', 'Runde: gerade Pause'], ['heizt', 'Runde: heizt gerade'], ['dauernd', '100 % dauernd an'], ['erreicht', 'Soll erreicht']];
const ZEIGEN = [['zu', 'nur Chips'], ['jetzt', 'Jetzt angetippt'], ['runde', '◔ Runde angetippt'], ['nach', '↘ Nachwärmen angetippt'], ['lern', '🧠 lernt angetippt']];
const faelle = [];
for (const v of ['a', 'b', 'heute']) for (const l of ['pause', 'heizt', 'dauernd', 'erreicht']) faelle.push({ name: `${v}-${l}-jetzt`, werte: { variante: v, lage: l, zeigen: 'jetzt' } });
for (const v of ['a', 'b', 'heute']) faelle.push({ name: `${v}-pause-chips`, werte: { variante: v, lage: 'pause', zeigen: 'zu' } });
for (const z of ['runde', 'nach', 'lern']) faelle.push({ name: `a-pause-${z}`, werte: { variante: 'a', lage: 'pause', zeigen: z } });
faelle.push({ name: 'b-pause-runde', werte: { variante: 'b', lage: 'pause', zeigen: 'runde' } }, { name: 'heute-pause-runde', werte: { variante: 'heute', lage: 'pause', zeigen: 'runde' } });
rahmen.bauen({ datei: 'takt.html', titel: 'Baustelle – Takt verständlich', leiste: 'Container-Kopf · Takt verständlich · A/B/heute', browser, faelle,
  auswahl: [{ id: 'variante', t: 'Variante', optionen: V }, { id: 'lage', t: 'Lage', optionen: LAGE }, { id: 'zeigen', t: 'zeigen', optionen: ZEIGEN }] });
