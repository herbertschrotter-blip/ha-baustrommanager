// Vorschlag „Kopf der Container-Ansicht mit Zustands-Chips“ auf Basis des Master-Mockups (Wunsch Herbert, 28.10.2026:
// „da kennt sich keiner aus, zuviel Text. Mach was mit Chips, z. B. Tür offen usw., passe die Schrift der Kachelgröße
// entsprechend besser an und auch das Layout darin ein wenig.“).
// Baut mockups/container-kopf.html: node mockups/quelle/container-kopf.js   ·   prüfen: node mockups/quelle/vorschau/pruefen.cjs mockups/container-kopf.html
//
// Heute (container.js containerVorlage): CONTAINER, Name, Zustandstext, Regeltext (ein langer Satz), Modus-Segmente,
// „Schnell aufheizen“; rechts Rad, „zu kalt / passt / zu warm“ und der Satz zum gleitenden Soll.
// Vorschlag: der Fließtext wird in kurze Zustands-Chips zerlegt; den bisherigen Satz zeigt ein Antippen des Chips
// (kleine Einblendung unter den Chips). Schrift nach Breite des Kopfs (Name groß, Chips mittel, Erklärung klein).
//   D  gewählt (Herbert, 28.10.2026), Standard der Leiste: Desktop Rad ganz links, rechts Name, Modus-Auswahl-Chip,
//      „Schnell aufheizen“-Chip und Zustands-Chips ausführlich, Soll-Chips und Gefühl-Knöpfe kompakt; Handy: Name, darunter
//      das Rad (kompakt), dann Soll und Chips kurz („🚪 4 min“, „⏸ Takt“, „⏱ 06:40“), weniger Abstand, Gefühl als Symbole
//      Chips in festen Gruppen (Herbert, 28.10.2026): Steuerung · Jetzt · Plan · Lernen · Hinweise (nur wenn da); Soll unter dem Rad
//   D2 wie D, die Gruppen als kleine Kästchen nebeneinander (Vergleich)
//   A  Chips-Leiste unter dem Namen, Rad rechts wie heute
//   B  zweispaltig: links Name + Modus + Chips gruppiert (Zustand / Plan / Lernen), rechts Rad mit Soll-Chips
//   C  kompakt: Rad links groß, rechts Name, eine Zeile Chips, Modus als Auswahl-Chip, „Schnell aufheizen“ als Chip
// Die Seite rechnet nichts: jeder Chip zeigt ein Feld, das die Integration heute schon liefert (laufzeit.container.<id>:
// text, tuer, boost_bis, modus, lernen, soll, symbol.fenster; struktur: sensoren[].batterie) – die Einblendung zeigt die
// Sätze, die die Seite heute schon schreibt (TEXT, cRegelText, warmText, offenText, Tür-Zeile, Soll-Zeile).
// Der Kopf der Seite (.c-d-held) bleibt im Mockup gezeichnet, wird aber ausgeblendet und durch den Vorschlag ersetzt.
// Bilder: node mockups/quelle/container-kopf.js --bilder <ordner>
const rahmen = require('./rahmen');

/* Läuft nur im Browser (als Text eingesetzt, Node führt es nie aus) */
function browser(R) {
  const { html, nothing } = R;
  const BID = 'polier';
  const G = window.KOPF = { v: 'd', lage: 'heizt', info: null, modusAuf: false };
  const MODI = [['plan', 'Zeitplan'], ['thermo', 'Thermostat'], ['bedarf', 'Bei Bedarf'], ['hand', 'Hand'], ['aus', 'Aus']];   // wie tabellen.js MODI
  const de = (x, n = 1) => Number(x).toLocaleString('de-AT', { minimumFractionDigits: n, maximumFractionDigits: n });
  const uhr = m => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;

  /* ---------- Beispieldaten je Lage: wie die Integration sie liefert (laufzeit.container.polier) ---------- */
  const LERN = { an: true, anteil: null, zyklus_min: 10, erwartet: 0.3, aus_bei: 21.6, offen: null,
    warm: { gelernt: true, n: 5, n_noetig: 3, band: 'mild', soll: 21.9, innen: 18.4, rate: 1.2, aufheiz_min: 270, vor: 20, plan: { start: 130, ziel: 400, ende: 1020, begrenzt: false } } };
  const LAGEN = {
    heizt: { modus: 'thermo', zustand: 'heizt', grund: 'arbeitszeit', text: 'heizt auf 21,9 °C · Arbeitszeit', temperatur: 20.8, tuer: { offen: false, seit: null }, lernen: LERN, fenster: 'zu' },
    tuer: { modus: 'thermo', zustand: 'pause', grund: 'tuer_offen', text: 'pausiert · Tür offen', temperatur: 19.6, tuer: { offen: true, min: 4 }, lernen: { ...LERN, offen: { art: 'sensor' } }, fenster: 'gekippt' },
    takt: { modus: 'thermo', zustand: 'aus', grund: 'arbeitszeit', text: 'Takt-Pause · lernend 15 % je 10 min', temperatur: 22.6, tuer: { offen: false, seit: null }, lernen: { ...LERN, anteil: 15 }, fenster: 'zu' },
    boost: { modus: 'thermo', zustand: 'heizt', grund: 'boost', text: '⚡ schnell aufheizen', temperatur: 17.9, tuer: { offen: false, seit: null }, lernen: LERN, fenster: 'zu', boost: 25 },
    hand: { modus: 'hand', zustand: 'heizt', grund: 'hand', text: 'heizt · Hand', temperatur: 21.2, tuer: { offen: false, seit: null }, lernen: LERN, fenster: 'zu', batterie: 12 },
    frost: { modus: 'aus', zustand: 'frost', grund: 'frost', text: 'Frostschutz', temperatur: 4.6, tuer: { offen: false, seit: null }, lernen: LERN, fenster: 'zu', batterie: 21 },
  };
  function schreiben() {
    const B = window.baustelleBeispiel, w = B && B.welt && B.welt[0]; if (!w) return;
    const L = LAGEN[G.lage], jetzt = Date.now(), iso = ms => new Date(ms).toISOString();
    const br = w.bereiche.find(x => x.id === BID); br.name = '001_C_POL';
    for (const s of br.sensoren) if (s.art === 'fuehler') s.batterie = L.batterie ?? 78;
    w.einstellungen.heizung = { ...(w.einstellungen.heizung || {}), soll_art: 'gleitend' };
    w.laufzeit.soll_gleitend = { ...(w.laufzeit.soll_gleitend || {}), soll: 22.4 };
    const c = w.laufzeit.container[BID];
    Object.assign(c, { modus: L.modus, zustand: L.zustand, grund: L.grund, text: L.text, temperatur: L.temperatur, lernen: L.lernen,
      tuer: L.tuer.offen ? { offen: true, seit: iso(jetzt - L.tuer.min * 6e4) } : L.tuer, boost_bis: L.boost ? iso(jetzt + L.boost * 6e4) : null,
      soll: { wert: 21.9, versch: 0, eigen: -0.5 } });
    const f = c.symbol && c.symbol.fenster && c.symbol.fenster.find(x => x.sensor); if (f) f.zustand = L.fenster;
  }
  const neuLaden = () => { schreiben(); window.baustelleBeispiel.hassNeu(); return Promise.all(R.P().map(q => { q.cache = {}; return q._laden(); })); };

  /* ---------- Chips: nur Felder, die es heute schon gibt; Satz der Einblendung = Text der Seite ---------- */
  const ZUST = { heizt: '🔥', pause: '⏸', aus: '○', frost: '❄', trocknen: '👕', offline: '⚠', bereit: '💤' };
  function chips(p, b) {
    const d = p.d, L = [], lern = b.lern && b.lern.an && ['thermo', 'bedarf'].includes(b.modus) ? b.lern : null;
    const kurz = (b.text || '').split(' · ')[0].replace(/^⚡\s*/, '');   // erster Teil des Zustandstexts der Integration
    const ic = /^Takt-Pause/.test(b.text || '') ? '⏸' : ZUST[b.z] || '•';
    if (G.v[0] === 'd' || !(b.boost && /^⚡/.test(b.text || ''))) L.push({ k: 'zust', g: 'zustand', ic, t: kurz || b.z, ton: b.z === 'heizt' ? 'warm' : b.z === 'frost' ? 'blau' : b.z === 'offline' ? 'rot' : '', info: b.text });
    if (b.boost) L.push({ k: 'boost', g: 'zustand', ic: '⚡', t: 'Schnell aufheizen läuft', ton: 'amber', info: 'Schnell aufheizen läuft – Ende mit ⚡ „Aufheizen beenden“' });
    if (b.modus === 'hand') L.push({ k: 'hand', g: 'zustand', ic: '✋', t: 'Hand', ton: 'amber', info: p.cRegelText(b) });
    if (b.tuer && b.tuer.offen) L.push({ k: 'tuer', g: 'zustand', ic: '🚪', t: `Tür offen ${b.tuer.offen} min`, ton: 'amber',
      info: `${b.tuer.sensor}: offen seit ${b.tuer.offen} min – Heizung pausiert nach ${d.e.tuer_pause} min, Meldung nach ${d.e.tuer_melden} min` });
    for (const f of (b.symbol && b.symbol.fenster) || []) if (f.sensor && f.zustand && f.zustand !== 'zu')
      L.push({ k: 'fenster', g: 'zustand', ic: '🪟', t: `Fenster ${f.zustand}`, ton: 'amber', info: `Fenster (${f.sensor}): ${f.zustand}` });
    for (const s of b.sensoren || []) if (s.art === 'fuehler' && s.batterie !== null && s.batterie < 25)   // Grenze wie die Geräteliste (geraete.js)
      L.push({ k: 'bat', g: 'zustand', ic: '🔋', t: `Fühler schwach ${s.batterie} %`, ton: s.batterie < 10 ? 'rot' : 'amber', info: `${s.name}: Batterie ${s.batterie} % – bald tauschen` });
    if (lern) {
      const w = lern.warm;
      if (w && w.gelernt && w.plan) L.push({ k: 'warm', g: 'plan', ic: '⏱', t: `warm um ${uhr(w.plan.ziel)}`, ton: '', info: p.warmText(b) });
      else if (w) L.push({ k: 'warm', g: 'plan', ic: '⏱', t: 'Aufheizen lernt noch', ton: '', info: p.warmText(b) });
      L.push({ k: 'lern', g: 'lernen', ic: '🧠', t: lern.offen ? 'lernt gerade nicht' : 'lernt', ton: lern.offen ? 'amber' : '', info: p.offenText(b) || p.cRegelText(b) });
      if (G.v[0] === 'd' && /^Takt-Pause/.test(b.text || '') && lern.anteil !== null) L.push({ k: 'takt', g: 'lernen', ic: '◔', t: `Takt ${lern.anteil} % je ${lern.zyklus_min} min`, ton: '', info: b.text });
      L.push({ k: 'nach', g: 'lernen', ic: '↘', t: `Nachlauf +${de(lern.erwartet)}°`, ton: '', info: `Nachlauf +${de(lern.erwartet)} °C → aus bei ${de(lern.aus_bei)} °C` });
    } else if (b.modus !== 'hand') L.push({ k: 'regel', g: 'plan', ic: 'ⓘ', t: { plan: 'Heizplan', thermo: 'Thermostat', bedarf: 'bei Bedarf', aus: 'nur Frostschutz' }[b.modus] || 'Regel', ton: '', info: p.cRegelText(b) });
    for (const c of L) Object.assign(c, langKurz(b, c));
    return L;
  }
  /* Variante D: ausführlicher Text (Desktop) und kurzer Text (Handy) je Chip – nur Felder, die die Seite schon hat */
  const ZKURZ = { heizt: 'heizt', pause: 'Pause', aus: 'aus', frost: 'Frost', trocknen: 'trocknet', offline: 'offline', bereit: 'bereit' };
  function langKurz(b, c) {
    const lern = b.lern || {}, w = lern.warm, takt = /^Takt-Pause/.test(b.text || '');
    switch (c.k) {
      case 'zust': return takt ? { lang: 'Takt-Pause', kurz: 'Takt' }   // „15 % je 10 min“ steht in D in der Gruppe Lernen
        : { lang: c.t, kurz: ZKURZ[b.z] || c.t };
      case 'takt': return { lang: c.t, kurz: `${lern.anteil} %` };
      case 'boost': return { lang: 'Schnell aufheizen läuft', kurz: 'läuft' };
      case 'tuer': return { lang: `Tür offen seit ${b.tuer.offen} min`, kurz: `${b.tuer.offen} min` };
      case 'fenster': return { lang: c.t, kurz: c.t.replace(/^Fenster /, '') };
      case 'bat': return { lang: c.t, kurz: c.t.replace(/^Fühler schwach /, '') };
      case 'warm': return w && w.gelernt && w.plan ? { lang: `warm um ${uhr(w.plan.ziel)} · ab ${uhr(w.plan.start)}`, kurz: uhr(w.plan.ziel) } : { lang: c.t, kurz: 'lernt' };
      case 'lern': return { lang: c.t, kurz: lern.offen ? 'lernt nicht' : 'lernt' };
      case 'nach': return { lang: c.t, kurz: c.t.replace(/^Nachlauf /, '') };
      case 'sgl': return { lang: c.t, kurz: c.t.replace(/^gleitend /, '') };
      case 'seig': return { lang: c.t, kurz: c.t.replace(/ eigen$/, '') };
      default: return { lang: c.t, kurz: c.t };
    }
  }
  const chipText = c => G.v[0] === 'd' ? html`<span class="ck-l">${c.lang || c.t}</span><span class="ck-k">${c.kurz || c.t}</span>` : c.t;
  const chip = c => html`<button class="ck-chip ${c.ton} ${G.info === c.k ? 'auf' : ''}" aria-expanded=${G.info === c.k ? 'true' : 'false'}
      @click=${() => { G.info = G.info === c.k ? null : c.k; G.modusAuf = false; R.neuAlle(); }}><span class="ck-ic">${c.ic}</span>${chipText(c)}</button>`;
  const info = L => { const c = L.find(x => x.k === G.info); return c ? html`<div class="ck-info" role="note"><span>${c.info}</span><button aria-label="schließen" @click=${() => { G.info = null; R.neuAlle(); }}>✕</button></div>` : nothing; };
  const reihe = (L, cls = '') => html`<div class="ck-chips ${cls}">${L.map(chip)}</div>${info(L)}`;

  /* Soll unter dem Rad: kurze Chips statt Satz (Werte der Integration: soll.eigen/versch, soll_gleitend.soll) */
  function sollChips(p, b) {
    if (!p.sollAktiv(b)) return nothing;
    const S = b.sollJ || {}, gl = p.d.e.soll_art === 'gleitend', Gs = p.d.sollG, L = [];
    if (gl) L.push({ k: 'sgl', ic: '〰', t: `gleitend ${Gs ? de(Gs.soll) : '–'}°`, ton: '', info: 'Soll gleitend: folgt dem Wetter (Heizung › Regeln)' });
    if (gl && S.eigen) L.push({ k: 'seig', ic: '👤', t: `${S.eigen > 0 ? '+' : '−'}${de(Math.abs(S.eigen))} eigen`, ton: 'amber',
      info: `Soll gleitend ${Gs ? de(Gs.soll) : '–'} °C ${S.eigen > 0 ? '+' : '−'}${de(Math.abs(S.eigen))} eigenes Soll = ${de(p.sollVon(b))} °C – dein Gefühl hilft beim Lernen` });
    if (gl && S.versch) L.push({ k: 'sver', ic: '±', t: `${S.versch > 0 ? '+' : '−'}${de(Math.abs(S.versch))} bis morgen`, ton: 'amber', info: '+ / − lernt mit wie „zu kalt“ / „zu warm“ · ↺ gleitend setzt zurück' });
    for (const c of L) Object.assign(c, langKurz(b, c));
    if (!gl) L.push({ k: 'sfest', ic: 'ⓘ', t: 'Soll fest', ton: '', info: 'hilft beim gleitenden Soll (Heizung › Regeln)' });
    return html`<div class="ck-soll">${L.map(chip)}</div>${info(L)}`;
  }
  const gefuehl = (p, b, nurIc) => p.sollAktiv(b) ? html`<div class="ck-gefuehl">${[[-1, '🥶', 'zu kalt'], [0, '👍', 'passt'], [1, '🥵', 'zu warm']].map(([v, i, t]) =>
    html`<button title=${t} aria-label=${t} @click=${() => p.gefuehl(b, v)}>${i}${nurIc ? nothing : html` <span>${t}</span>`}</button>`)}</div>` : nothing;
  const modusSeg = (p, b) => html`<div class="seg klein ck-seg">${MODI.map(([k, t]) => html`<button class=${b.modus === k ? 'on' : ''} ?disabled=${k === 'thermo' && !b.fuehler} @click=${() => p.modusSetzen(b, k)}>${t}</button>`)}</div>`;
  const boostKnopf = (p, b) => html`<button class="glas-panel chip ck-boost ${b.boost ? 'amber' : ''}" @click=${() => p.boostUmschalten(b)}>⚡ ${b.boost ? 'Aufheizen beenden' : 'Schnell aufheizen'}</button>`;
  const kopfName = b => html`<div class="ck-name"><span class="ck-art">Container</span><span class="ck-titel">${b.name}</span></div>`;

  /* Vorlagen-Teile der Seite wiederverwenden: Rad (mit − +) bzw. „kein Fühler“ */
  const finde = (t, s) => { let r = null; const geh = x => { if (r || !x || typeof x !== 'object') return; if (Array.isArray(x)) return x.forEach(geh);
    if (Array.isArray(x.strings) && x.strings.some(y => y.includes(s))) { r = x; return; } if (Array.isArray(x.values)) x.values.forEach(geh); }; geh(t); return r; };

  function kopf(p, t) {
    const b = p.b, L = chips(p, b), kern = finde(t, 'class="c-rad"') || finde(t, 'class="c-ohne glas-panel"');
    const band = R.band(`Vorschlag Kopf · Variante ${{ d: 'D: gewählt – Rad links, Chips in Gruppen (Handy: Name, Rad, Gruppen kurz)', d2: 'D2: wie D, Gruppen als Kästchen nebeneinander', a: 'A: Chips unter dem Namen', b: 'B: zweispaltig, Chips gruppiert', c: 'C: kompakt, Rad links' }[G.v]}`);
    if (G.v === 'a') return html`${band}<div class="glas-panel ck ck-a ${b.z}">
        <div class="ck-links">${kopfName(b)}${R.marke}${reihe(L)}
          <div class="ck-bedien">${modusSeg(p, b)}${boostKnopf(p, b)}</div></div>
        <div class="ck-rechts">${kern}${gefuehl(p, b)}${sollChips(p, b)}</div></div>`;
    if (G.v === 'b') {
      const gruppe = (g, t) => { const X = L.filter(c => c.g === g); return X.length ? html`<div class="ck-gruppe"><div class="ck-gt">${t}</div>${reihe(X)}</div>` : nothing; };
      return html`${band}<div class="glas-panel ck ck-b ${b.z}">
        <div class="ck-links">${kopfName(b)}${R.marke}<div class="ck-bedien">${modusSeg(p, b)}${boostKnopf(p, b)}</div>
          <div class="ck-gruppen">${gruppe('zustand', 'Zustand')}${gruppe('plan', 'Plan')}${gruppe('lernen', 'Lernen')}</div></div>
        <div class="ck-rechts">${kern}${sollChips(p, b)}${gefuehl(p, b)}</div></div>`;
    }
    const modusT = (MODI.find(m => m[0] === b.modus) || ['', '–'])[1];
    if (G.v[0] === 'd') {   // D / D2: feste Gruppen in fester Reihenfolge (Herbert, 28.10.2026: „gruppieren bzw. nach Thema“)
      const von = ks => ks.map(k => L.find(c => c.k === k)).filter(Boolean);
      const steuerung = [html`<button class="ck-chip modus ${G.modusAuf ? 'auf' : ''}" aria-haspopup="listbox" aria-expanded=${G.modusAuf ? 'true' : 'false'}
              @click=${() => { G.modusAuf = !G.modusAuf; G.info = null; R.neuAlle(); }}><span class="ck-ic">⚙</span>${modusT} ▾</button>`,
        html`<button class="ck-chip ${b.boost ? 'amber auf' : ''}" @click=${() => p.boostUmschalten(b)}><span class="ck-ic">⚡</span><span class="ck-l">${b.boost ? 'Aufheizen beenden' : 'Schnell aufheizen'}</span><span class="ck-k">${b.boost ? 'beenden' : 'Aufheizen'}</span></button>`];
      const modi = G.modusAuf ? html`<div class="ck-info ck-modi" role="listbox">${MODI.map(([k, t]) => html`<button role="option" class=${b.modus === k ? 'on' : ''} ?disabled=${k === 'thermo' && !b.fuehler}
              @click=${() => { G.modusAuf = false; p.modusSetzen(b, k); }}>${t}</button>`)}</div>` : nothing;
      const GR = [['Steuerung', steuerung, modi, []], ['Jetzt', null, null, von(['zust', 'tuer', 'fenster'])], ['Plan', null, null, von(['warm', 'regel'])],
        ['Lernen', null, null, von(['lern', 'nach', 'takt'])], ['Hinweise', null, null, von(['bat'])]];   // Hand zeigt der Modus-Chip
      const zeile = ([t, fest, dazu, X]) => fest || X.length ? html`<div class="ckd-g" data-g=${t}><div class="ckd-gt">${t}</div><div class="ck-chips">${fest || nothing}${X.map(chip)}</div>${dazu || info(X)}</div>` : nothing;
      return html`${band}<div class="glas-panel ck ck-d ${G.v === 'd2' ? 'ck-d2' : ''} ${b.z}">
        <div class="ckd-name">${kopfName(b)}${R.marke}</div>
        <div class="ckd-rad">${kern}<div class="ckd-soll"><div class="ckd-gt">Soll</div>${sollChips(p, b)}${gefuehl(p, b, true)}</div></div>
        <div class="ckd-rest ckd-gruppen">${GR.map(zeile)}</div></div>`;
    }
    return html`${band}<div class="glas-panel ck ck-c ${b.z}">
        <div class="ck-rechts">${kern}${gefuehl(p, b, true)}</div>
        <div class="ck-links">${kopfName(b)}${R.marke}
          <div class="ck-chips ck-leiste">
            <button class="ck-chip modus ${G.modusAuf ? 'auf' : ''}" aria-haspopup="listbox" aria-expanded=${G.modusAuf ? 'true' : 'false'}
              @click=${() => { G.modusAuf = !G.modusAuf; G.info = null; R.neuAlle(); }}><span class="ck-ic">⚙</span>${modusT} ▾</button>
            <button class="ck-chip ${b.boost ? 'amber auf' : ''}" @click=${() => p.boostUmschalten(b)}><span class="ck-ic">⚡</span>${b.boost ? 'Aufheizen beenden' : 'Schnell aufheizen'}</button>
            ${L.filter(c => c.k !== 'boost').map(chip)}</div>
          ${G.modusAuf ? html`<div class="ck-info ck-modi" role="listbox">${MODI.map(([k, t]) => html`<button role="option" class=${b.modus === k ? 'on' : ''} ?disabled=${k === 'thermo' && !b.fuehler}
              @click=${() => { G.modusAuf = false; p.modusSetzen(b, k); }}>${t}</button>`)}</div>` : info(L)}
          ${sollChips(p, b)}</div></div>`;
  }

  R.vorlage({ merkmal: 'class="glas-panel c-d-held ', wann: p => p.s.view === 'container' && p.b && !p.b.pumpe, fn: (t, p) => { t.values[0] = html`${t.values[0]}${kopf(p, t)}`; return t; } });

  R.stil(`
.ck ~ .c-d-held { display: none; }   /* Kopf der Seite: hier durch den Vorschlag ersetzt */
.ck { container-type: inline-size; display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 14px 22px; align-items: start; padding: 16px 18px; margin-bottom: 12px; }
.ck-links { display: flex; flex-direction: column; gap: 10px; min-width: 0; }
.ck-rechts { display: flex; flex-direction: column; align-items: center; gap: 8px; min-width: 0; }
.ck-name { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.ck-art { font-size: 11px; letter-spacing: 1.4px; text-transform: uppercase; color: var(--ink2); }
.ck-titel { font-size: clamp(22px, 4.4cqi, 32px); font-weight: 700; line-height: 1.1; overflow-wrap: anywhere; }
.ck-name + .r-marke { align-self: flex-start; margin: -4px 0 0; }
.ck-chips { display: flex; flex-wrap: wrap; gap: 6px; }
.ck-chip { display: inline-flex; align-items: center; gap: 6px; font: inherit; font-size: clamp(13px, 2.2cqi, 15px); line-height: 1.2; padding: 6px 12px; border-radius: 999px;
  border: 1px solid transparent; background: rgba(120,120,128,.2); color: var(--ink); cursor: pointer; white-space: nowrap; }
.ck-chip .ck-ic { font-size: 1.05em; }
.ck-chip.warm { color: var(--amber); background: color-mix(in srgb, var(--amber) 16%, transparent); }
.ck-chip.amber { color: var(--amber); border-color: color-mix(in srgb, var(--amber) 55%, transparent); }
.ck-chip.rot { color: var(--rot); border-color: color-mix(in srgb, var(--rot) 55%, transparent); }
.ck-chip.blau { color: var(--blau); background: color-mix(in srgb, var(--blau) 16%, transparent); }
.ck-chip.auf { border-color: var(--ink2); background: rgba(120,120,128,.32); }
.ck-info { display: flex; gap: 10px; align-items: flex-start; font-size: 12.5px; line-height: 1.4; color: var(--ink2); padding: 8px 10px 8px 12px; border-radius: 12px;
  background: rgba(120,120,128,.14); border: 1px solid var(--panel-rand); }
.ck-info span { flex: 1; min-width: 0; }
.ck-info > button { border: 0; background: none; color: var(--ink2); font-size: 13px; cursor: pointer; padding: 0 2px; }
.ck-bedien { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; margin-top: 4px; }
.ck-seg { max-width: 100%; overflow-x: auto; scrollbar-width: none; }
.ck-boost { font-size: 13px; }
.ck-gefuehl { display: flex; gap: 6px; justify-content: center; }
.ck-gefuehl button { border: 0; border-radius: 14px; padding: 7px 10px; font: inherit; font-size: 13px; background: rgba(120,120,128,.18); color: var(--ink); cursor: pointer; white-space: nowrap; }
.ck-gefuehl button:active { background: var(--amber); color: #1a1000; }
.ck-soll { display: flex; flex-wrap: wrap; gap: 6px; justify-content: center; }
.ck-soll .ck-chip { font-size: 12.5px; padding: 4px 10px; }
.ck-rechts > .ck-info { max-width: 260px; }
/* B: Gruppen mit kleiner Überschrift */
.ck-gruppen { display: flex; flex-direction: column; gap: 8px; margin-top: 4px; }
.ck-gruppe { display: grid; grid-template-columns: 64px minmax(0, 1fr); gap: 6px 10px; align-items: start; }
.ck-gruppe > .ck-info { grid-column: 2; }
.ck-gt { font-size: 11px; letter-spacing: 1px; text-transform: uppercase; color: var(--ink2); padding-top: 8px; }
/* D (gewählt): Desktop Rad ganz links (Soll darunter), rechts Name und die Gruppen als Zeilen mit Überschrift links */
.ck-d { grid-template-columns: auto minmax(0, 1fr); grid-template-areas: "rad name" "rad rest"; gap: 10px 24px; align-items: start; }
.ckd-name { grid-area: name; display: flex; align-items: flex-end; gap: 6px; min-width: 0; } .ckd-name .r-marke { margin: 0 0 6px; }
.ckd-rad { grid-area: rad; display: flex; flex-direction: column; align-items: center; gap: 6px; } .ck-d .c-rad, .ck-d .c-rad svg { width: 220px; height: 220px; }
.ckd-soll { display: flex; flex-wrap: wrap; justify-content: center; align-items: center; gap: 6px; max-width: 240px; }
.ckd-soll > .ckd-gt { flex-basis: 100%; text-align: center; padding: 0; } .ckd-soll .ck-soll { justify-content: center; } .ckd-soll .ck-info { flex-basis: 100%; }
.ckd-gruppen { grid-area: rest; display: flex; flex-direction: column; gap: 10px; min-width: 0; }
.ckd-g { display: grid; grid-template-columns: 78px minmax(0, 1fr); gap: 6px 10px; align-items: center; }
.ckd-g > .ck-info { grid-column: 2; }
.ckd-gt { font-size: 11px; letter-spacing: .8px; text-transform: uppercase; color: var(--ink2); }
.ck-d .ck-chips { gap: 6px; }
.ck-d .ckd-g .ck-chip { height: 32px; padding: 0 12px; }
.ck-d .ckd-g[data-g="Hinweise"] .ckd-gt { color: var(--amber); }
.ck-d .ck-gefuehl button { padding: 5px 9px; font-size: 15px; }
.ck-d .ck-chip.modus { font-weight: 600; }
.ck-k { display: none; }
/* D2: Gruppen als kleine Kästchen nebeneinander */
.ck-d2 .ckd-gruppen { display: grid; grid-template-columns: repeat(auto-fill, minmax(190px, 1fr)); gap: 8px; }
.ck-d2 .ckd-g { display: flex; flex-direction: column; align-items: stretch; gap: 6px; padding: 8px 10px 10px; border-radius: 12px; background: rgba(120,120,128,.12); border: 1px solid var(--panel-rand); }
.ck-d2 .ckd-g > .ck-info { grid-column: auto; }
/* C: Rad links groß, eine Zeile Chips */
.ck-c { grid-template-columns: auto minmax(0, 1fr); align-items: center; }
.ck-c .c-rad, .ck-c .c-rad svg { width: 240px; height: 240px; }
.ck-c .ck-leiste { flex-wrap: nowrap; overflow-x: auto; scrollbar-width: none; padding-bottom: 2px; }
.ck-c .ck-chip.modus { font-weight: 600; }
.ck-c .ck-soll { justify-content: flex-start; }
.ck-modi { flex-wrap: wrap; gap: 6px; } .ck-modi button { border: 0; border-radius: 10px; padding: 6px 12px; font: inherit; font-size: 13px; background: rgba(120,120,128,.2); color: var(--ink); cursor: pointer; }
.ck-modi button.on { background: var(--amber); color: #1a1000; font-weight: 600; } .ck-modi button:disabled { opacity: .4; }
/* schmal (Handy, Seite unter 700 px): untereinander, Rad mittig; C bleibt nebeneinander mit kleinerem Rad */
@container (max-width: 640px) {
  .ck-d { grid-template-columns: minmax(0, 1fr); grid-template-areas: "name" "rad" "rest"; gap: 6px; padding: 12px 12px 14px; }
  .ck-d .ckd-gruppen { gap: 8px; }
  .ck-d .ckd-g { display: flex; flex-direction: column; align-items: stretch; gap: 3px; }
  .ck-d .ckd-gt { font-size: 10px; letter-spacing: .6px; }
  .ck-d .ckd-g .ck-chip { height: 28px; padding: 0 9px; }
  .ck-d2 .ckd-gruppen { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 6px; }
  .ck-d2 .ckd-g { padding: 6px 8px 8px; } .ck-d2 .ck-chips { justify-content: flex-start; }
  .ck-d .ckd-name { justify-content: center; text-align: center; } .ck-d .ck-name { align-items: center; }
  .ck-d .ck-titel { font-size: 22px; } .ck-d .ck-art { font-size: 10px; }
  .ck-d .ckd-rad { justify-self: center; } .ck-d .c-rad, .ck-d .c-rad svg { width: 170px; height: 170px; }
  .ck-d .ckd-soll { gap: 5px 8px; }
  .ck-d .ck-chips { gap: 5px; }
  .ck-d .ck-chip { font-size: 13px; padding: 5px 9px; gap: 4px; }
  .ck-d .ck-soll .ck-chip { font-size: 12px; padding: 3px 8px; }
  .ck-d .ck-l { display: none; } .ck-d .ck-k { display: inline; }
  .ck-d .ck-info { font-size: 11.5px; padding: 6px 8px 6px 10px; }
  .ck-d .ck-gefuehl button { padding: 4px 8px; font-size: 14px; }
  .ck-a, .ck-b { grid-template-columns: minmax(0, 1fr); }
  .ck-a .ck-rechts, .ck-b .ck-rechts { order: 2; }
  .ck-titel { font-size: 24px; }
  .ck-chip { font-size: 14px; padding: 7px 12px; }
  .ck-c { grid-template-columns: 150px minmax(0, 1fr); gap: 10px 12px; padding: 14px; }
  .ck-c .c-rad, .ck-c .c-rad svg { width: 150px; height: 150px; }
  .ck-c .ck-titel { font-size: 21px; }
  .ck-c .ck-leiste { flex-wrap: wrap; overflow: visible; }
  .ck-c .ck-chip { font-size: 13px; padding: 6px 10px; }
  .ck-gruppe { grid-template-columns: minmax(0, 1fr); gap: 4px; } .ck-gruppe > .ck-info { grid-column: 1; } .ck-gt { padding-top: 0; }
}`);

  /* ---------- Vorführ-Leiste ---------- */
  R.vorfuehren(async w => {
    Object.assign(G, { v: w.variante, lage: w.lage, modusAuf: false, info: null });
    if (!window.baustelleBeispiel || !window.baustelleBeispiel.welt) return;
    await neuLaden();
    for (const q of R.P()) { if (!q.d) continue; q.s.sheet = null; q.containerOeffnen(BID); }
    const b = R.P()[0] && R.P()[0].b, L = b ? chips(R.P()[0], b) : [];
    if (w.zeigen === 'chip') G.info = (L.find(c => c.ton === 'amber') || L.find(c => c.k === 'lern') || L[0] || {}).k || null;
    else if (w.zeigen === 'soll') G.info = 'seig';
    else if (w.zeigen === 'modus') G.modusAuf = true;
    R.neuAlle();
  });
}

const V = [['d', 'D · gewählt: Rad links, Chips in Gruppen'], ['d2', 'D2 · wie D, Gruppen als Kästchen'], ['a', 'A · Chips unter dem Namen, Rad rechts'], ['b', 'B · zweispaltig, Chips gruppiert'], ['c', 'C · kompakt, Rad links groß']];
const LAGE = [['heizt', 'heizt, Tür zu'], ['tuer', 'Tür offen (pausiert)'], ['takt', 'Takt-Pause lernend'], ['boost', 'Schnell aufheizen läuft'], ['hand', 'Hand · Fühler schwach'], ['frost', 'Aus · Frostschutz']];
const ZEIGEN = [['zu', 'nur Chips'], ['chip', 'Chip angetippt (Erklärung)'], ['soll', 'Soll-Chip angetippt'], ['modus', 'Modus-Auswahl (C, D)']];
const faelle = [];
for (const v of ['d', 'd2', 'a', 'b', 'c']) for (const l of ['heizt', 'tuer', 'takt', 'hand', 'frost']) faelle.push({ name: `${v}-${l}`, werte: { variante: v, lage: l, zeigen: 'zu' } });
faelle.push({ name: 'd-boost', werte: { variante: 'd', lage: 'boost', zeigen: 'zu' } }, { name: 'd-soll-erklaerung', werte: { variante: 'd', lage: 'heizt', zeigen: 'soll' } },
  { name: 'd-modus', werte: { variante: 'd', lage: 'heizt', zeigen: 'modus' } }, { name: 'd-tuer-erklaerung', werte: { variante: 'd', lage: 'tuer', zeigen: 'chip' } });
for (const v of ['d', 'd2', 'a', 'b', 'c']) faelle.push({ name: `${v}-takt-erklaerung`, werte: { variante: v, lage: 'takt', zeigen: 'chip' } });
faelle.push({ name: 'a-tuer-erklaerung', werte: { variante: 'a', lage: 'tuer', zeigen: 'chip' } });
faelle.push({ name: 'b-soll-erklaerung', werte: { variante: 'b', lage: 'heizt', zeigen: 'soll' } });
faelle.push({ name: 'c-modus', werte: { variante: 'c', lage: 'heizt', zeigen: 'modus' } });
faelle.push({ name: 'c-boost', werte: { variante: 'c', lage: 'boost', zeigen: 'zu' } });
rahmen.bauen({ datei: 'container-kopf.html', titel: 'Baustelle – Container-Kopf mit Chips', leiste: 'Container-Kopf · Chips statt Text · 3 Varianten', browser, faelle,
  auswahl: [{ id: 'variante', t: 'Variante', optionen: V }, { id: 'lage', t: 'Lage', optionen: LAGE }, { id: 'zeigen', t: 'zeigen', optionen: ZEIGEN }] });
