// Vorschlag „Eingestellt“ im Kopf der Container-Ansicht (Variante D2 seit 0.8.151, src/ansichten/container.js kopf) auf Basis
// des Master-Mockups. Wunsch Herbert, 28.10.2026: „Sollten auch so aktiviert Chips stehen? Was ich alles eingeschaltet habe?
// Frostschutz usw.?“ Der Kopf zeigt bisher nur, was gerade passiert (Steuerung · Jetzt · Plan · Lernen · Hinweise).
// Neu: was für diesen Container eingeschaltet ist, als Chips – nur was an ist. Antippen erklärt in einem Satz, was es bewirkt,
// mit „ändern ›“ (springt zur Einstellung; im Mockup nur angedeutet).
// Baut mockups/eingestellt.html: node mockups/quelle/eingestellt.js   ·   Bilder: node mockups/quelle/eingestellt.js --bilder <ordner>
//
// Varianten:
//   A  eigenes Kästchen „Eingestellt“ in der Reihe der Kästchen (über die ganze Breite), Chips in zwei Zeilen „nur hier“
//      (Container) und „Baustelle“
//   B  schmale Chip-Zeile unter dem Containernamen (dezent, kleiner), „nur hier …“ · „Baustelle …“
//   C  zugeklappt „⚙ 11 eingestellt ▾“ unter dem Namen, aufgeklappt die Chips wie B
//   heute  unverändert zum Vergleich
// Lagen: viele an (lernender Poliercontainer) · wenige (Zeitplan, nur Grundregeln) · Modus Hand (Chips gedimmt, was nicht wirkt).
//
// Welche Einstellungen es gibt (nur was es wirklich gibt und den Container betrifft; Namen wie in der Seite):
//   Container (einstellungen.py STANDARD_BEREICH, Z. 138–155):
//     lernen      🧠 Lernende Regelung          Z. 148 · Seite container.js:203
//     warm_vor    Warm ab › Soll erreicht       Z. 149 · einblendungen-einrichtung.js:94 (nur eigener Wert, sonst Baustelle)
//     trocknen    👕 Kleidung trocknen          Z. 140 · container.js:204, heizung.js:229
//     stufen      🔥 Zusatz-Heizkörper nur bei Bedarf (+ primaer ★)   Z. 151–152 · einblendungen-einrichtung.js:113, 101
//     prio        Vorrang (niedrig/normal/hoch) Z. 143 · einstellungen.js:57 (nur wenn nicht „normal“)
//     tuer        Türkontakt (+ Tür-Pause der Baustelle)              Z. 145 · einblendungen-einrichtung.js:120, heizung.js:187
//   Baustelle (einstellungen.py STANDARD, heizung Z. 49–99, staffel Z. 100):
//     frost, frost_grenze, frost_aus, frost_immer   ❄ Frostschutz   Z. 76–81 · heizung.js:192
//     vorheizen_min   Vorheizen        Z. 50 · heizung.js:176   (nicht für lernende Container – dann Warm ab)
//     nachheizen_min  Nachheizen       Z. 51 · heizung.js:188   (nicht für lernende)
//     fruehstart      Kälte-Frühstart  Z. 63–65 · heizung.js:177 (nicht für lernende)
//     feiertag_frei, frei_modus, absenk   An Feiertagen frei / Urlaub & freie Feiertage   Z. 79–80, 93 · heizung.js:239–240, 193
//     staffel.an      ⚡ Staffelung     Z. 100 · heizung.js:196, einstellungen.js:50
//     notprogramm     🛟 Notprogramm    Z. 94 · notprogramm.js:22
//     taste           Taste am Plug = 1 h heizen   Z. 95 · notprogramm.js:23
//   Bewusst nicht als Chip: Modus (steht unter Steuerung), eigenes Soll / Soll gleitend (Chips unter dem Rad), Heizgrenze,
//   Schaltabstand, Fühler ohne Wert, Heizt tatsächlich ab (Werte ohne „an/aus“), Automatik (ganze Baustelle, Kopf der Seite),
//   Baseline-Läufe (Z. 96, nicht am Container sichtbar), bedarf (heute Modus „Bei Bedarf“).
//
// DATEN – die Seite rechnet nichts: Welche Einstellungen für diesen Container an sind und wirken (z. B. Vorheizen nicht bei
// lernenden, Zusatz erst ab 2 Heizkörpern, im Modus Hand nur Frostschutz und Tür), Text und Satz liefert die Integration.
// Vorschlag für laufzeit.container.<id>:
//   eingestellt: [{ k: 'frost',                      // Schlüssel (stabil; auch für data-k)
//                   ic: '❄',                         // Symbol
//                   text: 'Frostschutz unter 5°',    // Chip am Desktop
//                   kurz: '5°',                      // Chip am Handy
//                   satz: 'Hält den Container …',    // ein Satz beim Antippen
//                   von: 'baustelle' | 'container',  // Herkunft
//                   wirkt: true,                     // false = an, wirkt gerade nicht (gedimmt) …
//                   grund: 'im Modus Hand …',        // … und warum (nur bei wirkt: false)
//                   ziel: 'regeln:frost' }]          // wohin „ändern ›“ springt (Seite kennt nur die Sprungziele)
//   Reihenfolge = Reihenfolge der Anzeige (erst Container, dann Baustelle). Sprungziele (Seite, nur Navigation):
//   regeln:<zeile> → Heizung › Regeln · container:<zeile> → unten in der Container-Ansicht · bearbeiten:<zeile> → Container
//   bearbeiten · strom[:vorrang] → Einstellungen › Strom · notprogramm → Einstellungen › Notprogramm · urlaub → Urlaub & Feiertage.
// Beispielwerte (glas.html / tests/panel/struktur-0.7.json: Vorheizen 45, Nachheizen 15, Frostschutz 5 °C, Tür 3/10 min,
// Trocknen 2 mm/45/15 min, Staffelung 67 %/5) stehen unten in LAGEN.
const rahmen = require('./rahmen');

/* Läuft nur im Browser (als Text eingesetzt, Node führt es nie aus) */
function browser(R) {
  const { html, nothing } = R;
  const BID = 'polier';
  const G = window.EINGESTELLT = { v: 'a', lage: 'viele', info: null, auf: false, sprung: null };

  /* ---------- Beispieldaten je Lage: wie die Integration sie liefern soll (laufzeit.container.polier.eingestellt) ---------- */
  const E = {
    lernen: { k: 'lernen', ic: '🧠', text: 'Lernende Regelung', kurz: 'lernend', von: 'container', ziel: 'container:lernen',
      satz: 'Lernt, wie schnell dieser Container warm wird und wie viel er nachwärmt, und heizt selbst so früh, dass das Soll rechtzeitig erreicht ist – statt Vorheizen, Kälte-Frühstart und Nachheizen.' },
    warm: { k: 'warm', ic: '⏱', text: 'warm 30 min vor Beginn', kurz: '−30 min', von: 'container', ziel: 'bearbeiten:warm',
      satz: 'Eigener Wert dieses Containers: Das Soll ist 30 min vor Arbeitsbeginn erreicht, z. B. zum Umziehen (die Baustelle: bei Beginn).' },
    trocknen: { k: 'trocknen', ic: '👕', text: 'Kleidung trocknen', kurz: 'trocknen', von: 'container', ziel: 'container:trocknen',
      satz: 'Nach Regen ab 2 mm heizt dieser Container 45 min länger nach der Arbeit und am nächsten Morgen 15 min früher.' },
    stufen: { k: 'stufen', ic: '🔥', text: 'Zusatz nur bei Bedarf', kurz: 'Zusatz', von: 'container', ziel: 'bearbeiten:stufen',
      satz: 'Zuerst heizt der Primärheizkörper (Radiator 1); Radiator 2 kommt dazu, wenn es draußen unter −5 °C hat, der Raum mehr als 1,5 °C unter dem Soll ist oder einer nach 30 min nicht reicht.' },
    prio: { k: 'prio', ic: '⬆', text: 'Vorrang hoch', kurz: 'Vorrang', von: 'container', ziel: 'strom:vorrang',
      satz: 'Dürfen nicht alle Heizkörper zugleich (Staffelung), kommt dieser Container vor den anderen dran. Frostschutz geht immer vor.' },
    tuer: { k: 'tuer', ic: '🚪', text: 'Tür-Pause 3 min', kurz: 'Tür 3′', von: 'container', ziel: 'regeln:tuer',
      satz: 'Türkontakt „Tür 1“: Ist die Tür offen, pausiert die Heizung nach 3 min; nach 10 min kommt eine Nachricht.' },
    frost: { k: 'frost', ic: '❄', text: 'Frostschutz unter 5°', kurz: '5°', von: 'baustelle', ziel: 'regeln:frost',
      satz: 'Hält den Container auch nachts, am Wochenende und im Urlaub über 5 °C (aus erst über 7 °C) – auch wenn die Automatik aus ist.' },
    frostKurz: { k: 'frost', ic: '❄', text: 'Frostschutz unter 5°', kurz: '5°', von: 'baustelle', ziel: 'regeln:frost',
      satz: 'Hält den Container auch nachts, am Wochenende und im Urlaub über 5 °C (aus erst über 7 °C).' },
    vorheizen: { k: 'vorheizen', ic: '🌅', text: 'Vorheizen 45 min', kurz: '45′ vor', von: 'baustelle', ziel: 'regeln:vorheizen',
      satz: 'Heizt jeden Arbeitstag 45 min vor Arbeitsbeginn an, damit es warm ist, wenn es losgeht.' },
    nachheizen: { k: 'nachheizen', ic: '🌇', text: 'Nachheizen 15 min', kurz: '15′ nach', von: 'baustelle', ziel: 'regeln:nachheizen',
      satz: 'Heizt nach Arbeitsende noch 15 min weiter.' },
    feiertag: { k: 'feiertag', ic: '🏖', text: 'Feiertage frei · absenken 10°', kurz: 'frei 10°', von: 'baustelle', ziel: 'urlaub',
      satz: 'An Feiertagen (Kalender „Feiertage“) und im Urlaub wird nicht geheizt; mit Fühler hält der Container 10 °C.' },
    feiertagFrost: { k: 'feiertag', ic: '🏖', text: 'Feiertage frei', kurz: 'frei', von: 'baustelle', ziel: 'urlaub',
      satz: 'An Feiertagen (Kalender „Feiertage“) und im Urlaub wird nicht geheizt, nur der Frostschutz läuft.' },
    staffel: { k: 'staffel', ic: '⚡', text: 'Staffelung', kurz: 'Staffel', von: 'baustelle', ziel: 'strom',
      satz: 'Die Heizkörper teilen sich den Anschluss: 67 % je Anschluss nutzbar, höchstens 5 zugleich; wer wartet, kommt im Rundlauf dran.' },
    notprogramm: { k: 'notprogramm', ic: '🛟', text: 'Notprogramm', kurz: 'Not', von: 'baustelle', ziel: 'notprogramm',
      satz: 'Fallen Home Assistant oder das Netz aus, heizen die Plugs dieses Containers nach dem Programm der nächsten 7 Tage weiter.' },
    taste: { k: 'taste', ic: '🔘', text: 'Taste = 1 h heizen', kurz: 'Taste', von: 'baustelle', ziel: 'notprogramm',
      satz: 'Drücken der Taste am Plug heizt den Container 1 h (mit Fühler bis zum Soll), nochmal drücken beendet – auch ohne Home Assistant.' },
  };
  const HAND = 'Gerade ohne Wirkung: im Modus Hand schaltet die Automatik nicht – nur Frostschutz und Tür offen gehen vor.';
  const ruht = x => ({ ...x, wirkt: false, grund: HAND });
  const VIELE = [E.lernen, E.warm, E.trocknen, E.stufen, E.prio, E.tuer, E.frost, E.feiertag, E.staffel, E.notprogramm, E.taste];
  const LAGEN = {
    viele: { modus: 'thermo', lernen: true, eingestellt: VIELE },
    wenige: { modus: 'plan', lernen: false, eingestellt: [E.frostKurz, E.vorheizen, E.nachheizen, E.feiertagFrost] },
    hand: { modus: 'hand', lernen: true,
      eingestellt: VIELE.map(x => ['frost', 'tuer', 'notprogramm'].includes(x.k) ? x : ruht(x)) },
  };
  const ZIEL = {   // nur Navigation (Seite): Sprungziel → wohin
    'regeln:frost': 'Heizung › Regeln › Frostschutz', 'regeln:tuer': 'Heizung › Regeln › Tür offen', 'regeln:vorheizen': 'Heizung › Regeln › Vorheizen',
    'regeln:nachheizen': 'Heizung › Regeln › Nachheizen', 'container:lernen': 'unten in dieser Ansicht › Lernende Regelung',
    'container:trocknen': 'unten in dieser Ansicht › Kleidung trocknen', 'bearbeiten:warm': 'Container bearbeiten › Warm ab',
    'bearbeiten:stufen': 'Container bearbeiten › Zusatz-Heizkörper', 'strom:vorrang': 'Einstellungen › Strom › Vorrang',
    strom: 'Einstellungen › Strom › Staffelung', notprogramm: 'Einstellungen › Notprogramm', urlaub: 'Heizung › Urlaub & Feiertage',
  };
  const liste = () => LAGEN[G.lage].eingestellt;

  function schreiben() {
    const B = window.baustelleBeispiel, w = B && B.welt && B.welt[0]; if (!w) return;
    const L = LAGEN[G.lage], c = w.laufzeit.container[BID];
    c.modus = L.modus; c.lernen = { ...(c.lernen || {}), an: L.lernen };
    c.eingestellt = L.eingestellt;   // neues Feld (Vorschlag)
  }
  const neuLaden = () => { schreiben(); window.baustelleBeispiel.hassNeu(); return Promise.all(R.P().map(q => { q.cache = {}; return q._laden(); })); };

  /* ---------- Chips und Satz: nur Felder von oben, die Seite zeigt nur an ---------- */
  const zu = () => { for (const q of R.P()) if (q.s.ck) q.s.ck = { ...q.s.ck, info: null, modus: false }; };
  const chip = c => html`<button class="ck-chip ei-chip ${c.wirkt === false ? 'ei-ruht' : ''} ${G.info === c.k ? 'auf' : ''}" data-k=${'ei-' + c.k}
      aria-expanded=${G.info === c.k ? 'true' : 'false'} title=${c.wirkt === false ? 'an, wirkt gerade nicht' : nothing}
      @click=${() => { G.info = G.info === c.k ? null : c.k; G.sprung = null; zu(); R.neuAlle(); }}>
      <span class="ck-ic">${c.ic}</span><span class="ck-l">${c.text}</span><span class="ck-k">${c.kurz}</span></button>`;
  const satz = () => { const c = liste().find(x => x.k === G.info); if (!c) return nothing;
    return html`<div class="ck-info ei-info" role="note"><span>${c.wirkt === false ? html`<b class="ei-grund">${c.grund}</b> ` : nothing}${c.satz}
        <span class="ei-von-t">${c.von === 'baustelle' ? 'Einstellung der Baustelle – gilt für alle Container.' : 'Einstellung nur dieses Containers.'}</span>
        <button class="ei-aendern" @click=${() => { G.sprung = c.ziel; R.neuAlle(); }}>ändern ›</button>
        ${G.sprung === c.ziel ? html`<span class="ei-sprung">Mockup: springt zu ${ZIEL[c.ziel] || c.ziel}</span>` : nothing}</span>
      <button aria-label="schließen" @click=${() => { G.info = null; G.sprung = null; R.neuAlle(); }}>✕</button></div>`; };
  const teile = () => [['container', 'nur hier'], ['baustelle', 'Baustelle']].map(([v, t]) => [t, liste().filter(x => x.von === v)]).filter(([, L]) => L.length);
  const zeilen = () => teile().map(([t, L]) => html`<div class="ei-zeile"><span class="ei-von">${t}</span>${L.map(chip)}</div>`);

  /* A: eigenes Kästchen in der Reihe der Kästchen */
  const kaestchen = () => html`<div class="ckd-g ei-g" data-g="Eingestellt"><div class="ckd-gt">Eingestellt · ${liste().length}</div>
      <div class="ei-zeilen">${zeilen()}</div>${satz()}</div>`;
  /* B: schmale Zeile unter dem Namen */
  const zeileB = () => html`<div class="ei-b">${zeilen()}</div>${satz()}`;
  /* C: zugeklappt, aufgeklappt wie B */
  const zeileC = () => { const n = liste().length, ruhen = liste().filter(x => x.wirkt === false).length;
    return html`<button class="ck-chip ei-c ${G.auf ? 'auf' : ''}" aria-expanded=${G.auf ? 'true' : 'false'} @click=${() => { G.auf = !G.auf; G.info = null; G.sprung = null; R.neuAlle(); }}>
        <span class="ck-ic">⚙</span><span class="ck-l">${n} eingestellt${ruhen ? html` <span class="ei-ruht-t">· ${ruhen} ruhen</span>` : nothing}</span><span class="ck-k">${n} eingestellt</span> ${G.auf ? '▴' : '▾'}</button>
      ${G.auf ? html`<div class="ei-b">${zeilen()}</div>${satz()}` : nothing}`; };

  /* Kopf D2 der echten Seite (container.js kopf): values = [z, farbe, name, rad, soll, gruppen] – gleich aufgebaut, mit Einschub */
  R.vorlage({ merkmal: 'class="glas-panel ck ck-d ck-d2 ', wann: p => p.s.view === 'container' && p.b && p.b.id === BID,
    fn: t => {
      if (G.v === 'heute') return html`${R.band('heute (0.8.155) zum Vergleich')}${t}`;
      const v = t.values, unter = G.v === 'b' ? zeileB() : G.v === 'c' ? zeileC() : nothing;
      const band = { a: 'Vorschlag Eingestellt · A: eigenes Kästchen in der Reihe', b: 'Vorschlag Eingestellt · B: schmale Zeile unter dem Namen', c: 'Vorschlag Eingestellt · C: zugeklappt unter dem Namen' }[G.v];
      return html`${R.band(band)}<div class="glas-panel ck ck-d ck-d2 ei-kopf ei-v-${G.v} ${v[0]}" style="--c:${v[1]}">
        <div class="ckd-name ei-name"><div class="ck-name"><span class="ck-art">Container</span><span class="ck-titel">${v[2]}</span></div>${unter}</div>
        <div class="ckd-rad c-kern">${v[3]}${v[4]}</div>
        <div class="ckd-gruppen">${v[5]}${G.v === 'a' ? kaestchen() : nothing}</div></div>`;
    } });
  // Chip der Seite angetippt: unser Satz geht zu
  R.vorlage({ merkmal: 'class="ckd-g" data-g=', wann: p => p.s.view === 'container' && p.b && p.b.id === BID && p.s.ck && p.s.ck.info, fn: () => { G.info = null; } });

  R.stil(`
.ei-name { flex-direction: column; align-items: flex-start; justify-content: flex-end; gap: 6px; }
.ei-name > .ei-info { align-self: stretch; }
.ei-von { font-size: 10.5px; letter-spacing: .6px; text-transform: uppercase; color: var(--ink2); opacity: .8; white-space: nowrap; }
.ei-chip .ck-ic { font-size: 1em; }
.ei-chip.ei-ruht { opacity: .5; border-style: dashed; }
.ei-chip.ei-ruht.auf { opacity: .85; }
/* A: Kästchen über die ganze Breite, je Herkunft eine Zeile */
.ckd-gruppen .ei-g { grid-column: 1 / -1; }
.ei-zeilen { display: flex; flex-direction: column; gap: 6px; }
.ei-zeile { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; }
.ei-zeile > .ei-von { min-width: 72px; }
.ck-d .ei-g .ck-chip { height: 30px; padding: 0 11px; font-size: 13.5px; }
/* B, C: schmal unter dem Namen */
.ei-b { display: flex; flex-direction: column; gap: 4px; }
.ei-b .ei-zeile { gap: 4px 5px; }
.ei-b .ei-zeile > .ei-von { min-width: 64px; }
.ck-d .ei-b .ck-chip { height: 24px; padding: 0 8px; font-size: 12px; gap: 4px; background: transparent; }
.ck-d .ei-b .ck-chip.auf { background: rgba(120,120,128,.32); }
.ck-d .ck-chip.ei-c { height: 26px; padding: 0 10px; font-size: 12.5px; gap: 5px; }
.ei-ruht-t { color: var(--ink2); }
.ei-info > span { max-width: 70ch; }
.ei-grund { font-weight: 600; color: var(--ink); }
.ei-von-t { opacity: .85; }
.ei-aendern { border: 0; background: none; padding: 0; font: inherit; color: var(--blau); cursor: pointer; white-space: nowrap; }
.ei-sprung { display: block; margin-top: 2px; font-size: 11px; color: var(--amber); }
@container (max-width: 640px) {
  .ei-name { align-items: center; }
  .ei-b, .ei-zeile { justify-content: center; }
  .ck-d .ei-b .ck-chip { height: 24px; padding: 0 7px; font-size: 11.5px; }
  .ck-d .ei-g .ck-chip { height: 26px; padding: 0 8px; font-size: 12px; }
  .ei-zeile > .ei-von { min-width: 0; flex-basis: 100%; text-align: center; }
  .ei-von { font-size: 9.5px; }
  .ei-info { text-align: left; }
}`);

  /* ---------- Vorführ-Leiste ---------- */
  R.vorfuehren(async w => {
    Object.assign(G, { v: w.variante, lage: w.lage, info: null, auf: false, sprung: null });
    if (!window.baustelleBeispiel || !window.baustelleBeispiel.welt) return;
    await neuLaden();
    for (const q of R.P()) { if (!q.d) continue; q.s.sheet = null; q.s.ck = null; q.containerOeffnen(BID); }
    if (w.zeigen !== 'zu') G.auf = true;
    if (['frost', 'trocknen', 'vorheizen'].includes(w.zeigen)) G.info = liste().some(x => x.k === w.zeigen) ? w.zeigen : null;
    if (w.zeigen === 'aendern') { G.info = 'frost'; G.sprung = 'regeln:frost'; }
    R.neuAlle();
  });
}

const V = [['a', 'A · eigenes Kästchen'], ['b', 'B · Zeile unter dem Namen'], ['c', 'C · zugeklappt'], ['heute', 'heute (unverändert)']];
const LAGE = [['viele', 'viele an (lernend)'], ['wenige', 'wenige (Zeitplan)'], ['hand', 'Modus Hand']];
const ZEIGEN = [['zu', 'nur Chips (C zu)'], ['auf', 'C aufgeklappt'], ['frost', '❄ Frostschutz angetippt'], ['trocknen', '👕 Trocknen angetippt'], ['aendern', '„ändern ›“ angetippt']];
const faelle = [];
for (const v of ['a', 'b', 'c']) for (const l of ['viele', 'wenige', 'hand']) faelle.push({ name: `${v}-${l}`, werte: { variante: v, lage: l, zeigen: 'zu' } });
faelle.push({ name: 'heute-viele', werte: { variante: 'heute', lage: 'viele', zeigen: 'zu' } }, { name: 'heute-hand', werte: { variante: 'heute', lage: 'hand', zeigen: 'zu' } });
for (const l of ['viele', 'hand']) faelle.push({ name: `c-${l}-auf`, werte: { variante: 'c', lage: l, zeigen: 'auf' } });
for (const v of ['a', 'b', 'c']) faelle.push({ name: `${v}-viele-frost`, werte: { variante: v, lage: 'viele', zeigen: 'frost' } });
faelle.push({ name: 'a-hand-trocknen', werte: { variante: 'a', lage: 'hand', zeigen: 'trocknen' } }, { name: 'b-viele-aendern', werte: { variante: 'b', lage: 'viele', zeigen: 'aendern' } });
rahmen.bauen({ datei: 'eingestellt.html', titel: 'Baustelle – Eingestellt im Container-Kopf', leiste: 'Container-Kopf · Eingestellt · A/B/C/heute', browser, faelle,
  auswahl: [{ id: 'variante', t: 'Variante', optionen: V }, { id: 'lage', t: 'Lage', optionen: LAGE }, { id: 'zeigen', t: 'zeigen', optionen: ZEIGEN }] });
