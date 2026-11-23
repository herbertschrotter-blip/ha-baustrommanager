// Vorschlag „Ordnung der Oberfläche“ – UI-Bericht vom 23.11.2026, Stufe 2 und 3 (Maßnahmen 7–16), auf der echten Seite
// (Master-Mockup glas.html, Stand 0.8.190 mit Stufe 1). Nur Entwurf, nichts davon ist gebaut.
// Baut mockups/ordnung.html: node mockups/quelle/ordnung.js   ·   Bilder: node mockups/quelle/ordnung.js --bilder <ordner>
//
// Entscheidungen von Herbert (23.11.2026), auf denen der Entwurf steht:
//   (1) Heizregeln werden im Reiter Heizung bearbeitet, ⚙ › Heizung zeigt nur die Kurzfassung mit Sprung (gebaut in 0.8.190).
//   (2) „+ Container“ legt immer auch den Inventar-Container an (eigen/fremd, Nummer, Name mit Vorschau).
//   (3) Umbenennen: nach jedem Hinzufügen Vorschau + Bestätigen; freie Namen werden „⚠ weicht ab“ markiert, nicht gesperrt.
//   (4) HA-Unter-Einträge „Bereich“/„Gerät“ bleiben (als „Alternative in Home Assistant“ genannt).
//   (5) Auswertung: feste Abschnitte mit einer Zeitraumleiste; die Anordnung speichert die Integration. Die Hauptreiter bleiben.
//
// Was die Variante zeigt (Leiste „zeigen“):
//   M7/M8   Container-Seite = Dialog „Bearbeiten“ (Einblendung 'bereich' der Seite ersetzt, damit führen alle 5 Wege hierher):
//           Kopf mit Inventar-Name und Namen-Chip, Geräte-Liste mit „+ Gerät hinzufügen“, Gruppen Heizung · Fühler & Kontakte ·
//           Strom · Aussehen · Namen in HA. Jede Zeile trägt ihre Herkunft: „von der Baustelle“ (grau, ändern ›) · „abweichend ↺“
//           (amber, Wert der Baustelle daneben, ↺ = zurück) · ohne Marke = gibt es nur am Container. Soll in zwei klar getrennten
//           Zeilen „dauerhaft“ (eigenes Soll) und „nur heute“ (wie das Rad am Container, bis morgen früh).
//   M9      Grundlagen für Hochrechnung und Baseline (Heizperiode, Klimamittel, Baseline) im Reiter Heizung als eigene Karte und
//           Einblendung; die Auswertung zeigt nur „einstellen ›“.
//   M10/M12 Assistent „+ Gerät hinzufügen“ (von überall gleich): HA-Gerät → Container → was hängt dran (eine Typenliste) →
//           Namensvorschau (vor dem Schreiben) → anlegen und umbenennen, Ergebnis mit Rückgängig. „+ Container“ (Einblendung
//           'container-neu' ersetzt) mit eigen/fremd, Nummer und Namensvorschau, legt das Inventar mit an.
//   M11     Baustellen-Detail auch für die laufende Baustelle (aus Auswertung › Abrechnung & Export).
//   M13/M14 Auswertung (Ansicht ganz ersetzt): eine Zeitraumleiste für alles, Vergleich Vorperiode/Vorjahr/ohne Automatik,
//           feste Abschnitte Verbrauch & Kosten · Ersparnis · Heizperiode & Wetter · Abrechnung & Export · Geräte & Pumpen;
//           Ausnahmen vom gewählten Zeitraum sind gekennzeichnet („⏱ eigener Zeitraum“). Filter „Container“, wenn man von
//           einer Kachel kommt. Eine Definition von „Gespart“, € überall zum Tagespreis aus der Integration.
//   M15     Karte „Was fehlt noch“ oben in der Übersicht; jeder Punkt springt in Assistent, Container-Seite oder Umbenennen.
//   M16     Entitätswahl mit Suche (Fühler & Kontakte), Anordnung der Auswertung in der Integration, Speichern sofort überall.
//
// DATEN – die Seite rechnet nichts: Herkunft je Einstellung, Anzahl abweichender Namen, Namensvorschau (Schema), Kandidaten
// für den Assistenten, „Was fehlt noch“, alle kWh/€/Gespart-Werte und die Vergleichswerte liefert die Integration. Vorschlag:
//   baustelle/struktur  bereiche[].einst = [{ k, wert, text, herkunft: 'baustelle'|'abweichend'|'container', baustelle: text, ziel }]
//                       bereiche[].namen = { gesamt, abweichend, frei: [k…] }   (gibt es seit Stufe 1 als Chip)
//                       fehlt = [{ k, ic, text, satz, ziel: { art: 'assistent'|'container'|'namen'|'notprogramm', … } }]
//   baustelle/geraet_kandidaten → [{ id, ic, name, modell, zustand, art: 'plug'|'fuehler'|'kontakt'|'licht', seit }]
//   baustelle/namen_vorschau { geraet, bereich, typ, frei? } → [{ was, alt, neu, gleich, frei }]  (logik/inventar, ohne zu schreiben)
//   baustelle/container_vorschau { eigen, firma, nummer, kuerzel } → { inventar, naechste_nummer, geraete_muster, belegt }
//   baustelle/auswertung { zeitraum, vergleich, filter } → abschnitte{ verbrauch, ersparnis, heizperiode, abrechnung, geraete }
//                       je Abschnitt eigener_zeitraum (Text) wo er nicht dem gewählten folgt; anordnung (gespeichert in der Integration)
// Beispielwerte unten (Poliercontainer, 001_C_POL …) wie im Beispiel-hass (tests/panel/beispiel-hass.js).
const rahmen = require('./rahmen');

/* Läuft nur im Browser (als Text eingesetzt, Node führt es nie aus) */
function browser(R) {
  const { html, nothing } = R;
  const BID = 'polier';
  const G = window.ORDNUNG = { tab: 'heizung', picker: false, namenVorschau: false, namenFertig: false,
    as: { schritt: 1, geraet: 'plug9', bid: 'polier', typ: 'konvektor', frei: false, freiName: 'Konvektor Polier' },
    cn: { art: 'container', eigen: true, firma: 'STRA', nummer: 6, kuerzel: 'MAN', name: 'Mannschaft 2' },
    aw: { zr: 'monat', vergl: 'vorperiode', filter: null, alle: false }, sprung: null };
  const neu = () => R.neuAlle();
  const sprung = (t) => html`${G.sprung === t ? html`<span class="or-sprung">Mockup: springt zu ${t}</span>` : nothing}`;
  const zeigeSprung = t => () => { G.sprung = G.sprung === t ? null : t; neu(); };
  const sw = (an, fn) => html`<button class="sw ${an ? 'on' : ''}" role="switch" aria-checked=${an ? 'true' : 'false'} @click=${fn}><i></i></button>`;
  const seg = (opts, wert, fn) => html`<div class="seg klein">${opts.map(([v, t]) => html`<button class=${v === wert ? 'on' : ''} @click=${() => fn(v)}>${t}</button>`)}</div>`;

  /* ================= Herkunft: von der Baustelle · abweichend ↺ · nur am Container ================= */
  // Beispieldaten wie baustelle/struktur bereiche[polier].einst liefern soll (Text und Herkunft kommen von der Integration)
  const E = window.ORDNUNG_E = {
    soll: { t: 'Soll dauerhaft', wert: 21, herkunft: 'abweichend', baustelle: '20,0 °C' },
    heute: { wert: 0 },
    modus: { wert: 'thermo' },
    lernen: { wert: true },
    warm_vor: { t: 'Soll erreicht', wert: 'bei Beginn', alt: 'bei Beginn', herkunft: 'baustelle', ziel: 'Heizung › Regeln › Vor der Arbeit' },
    warm_nach: { t: 'Warm halten', wert: '30 min länger', alt: 'bis Ende', herkunft: 'abweichend', baustelle: 'bis Ende' },
    vorheizen: { t: 'Vorheizen', wert: '45 min', herkunft: 'baustelle', ruht: 'wirkt nicht – die lernende Regelung rechnet selbst', ziel: 'Heizung › Regeln › Vor der Arbeit' },
    frost: { t: '❄ Frostschutz', wert: 'unter 5 °C, aus über 7 °C', herkunft: 'baustelle', ziel: 'Heizung › Regeln › Frostschutz' },
    tuer: { t: 'Tür-Pause', wert: 'nach 3 min', herkunft: 'baustelle', ziel: 'Heizung › Regeln › Tür offen' },
    stufen: { wert: true },
    trocknen: { wert: true, werte: '2 mm · 45 min länger · 15 min früher', herkunft: 'baustelle' },
    groesse: { wert: 'doppel' },
    vorrang: { t: 'Vorrang in der Staffelung', wert: 'hoch', herkunft: 'abweichend', baustelle: 'normal' },
    staffel: { t: '⚡ Staffelung', wert: 'an · 67 % je Anschluss nutzbar', herkunft: 'baustelle', ziel: 'Einstellungen › Strom' },
  };
  const marke = (x, zurueck) => x.herkunft === 'baustelle'
    ? html`<span class="or-erb" title="gilt für alle Container">von der Baustelle</span>`
    : x.herkunft === 'abweichend'
      ? html`<span class="or-abw" title="eigener Wert dieses Containers">abweichend · Baustelle ${x.baustelle}<button class="or-zur" aria-label="zurück auf den Wert der Baustelle" @click=${zurueck}>↺</button></span>`
      : nothing;
  const zurueckAuf = (x, wert) => () => { x.herkunft = 'baustelle'; x.wert = wert; neu(); };
  const zeile = (titel, sub, rechts, x, opt = {}) => html`<div class="zeile or-zeile ${x && x.herkunft === 'baustelle' ? 'or-z-erb' : ''} ${x && x.herkunft === 'abweichend' ? 'or-z-abw' : ''}" data-k=${opt.k || nothing}>
      <div class="or-zl"><b>${titel}</b>${sub ? html`<div class="leise">${sub}</div>` : nothing}
        ${x ? html`<div class="or-mk">${marke(x, opt.zurueck)}${x.herkunft === 'baustelle' && x.ziel ? html` <button class="or-link" @click=${zeigeSprung(x.ziel)}>ändern ›</button>${sprung(x.ziel)}` : nothing}</div>` : nothing}
        ${x && x.ruht ? html`<div class="or-ruht">${x.ruht}</div>` : nothing}</div>
      <div class="or-zr">${rechts}</div></div>`;

  /* ================= Container-Seite (ersetzt den Dialog „Bearbeiten“, Einblendung 'bereich') ================= */
  const GERAETE = [
    { ic: '🔥', n: 'Radiator 1', typ: 'Ölradiator · ★ Primär', name: '001-01_C_HZ_POL_Oelradiator01', jetzt: '1,9 kW' },
    { ic: '🔥', n: 'Heizung 03', typ: 'Konvektor · Zusatz', name: 'Heizung 03', jetzt: 'aus', frei: true },
    { ic: '🌡', n: 'Fühler', typ: 'Shelly H&T Gen3', name: '001_C_TEMP_POL', jetzt: '19,4 °C' },
  ];
  const NAMEN = [
    { was: 'Container (Inventar)', alt: '001_C_POL', neu: '001_C_POL', gleich: true },
    { was: 'Plug Radiator 1', alt: '001-01_C_PLUG_POL', neu: '001-01_C_PLUG_POL', gleich: true },
    { was: 'Heizkörper an Plug 1', alt: '001-01_C_HZ_POL_Oelradiator01', neu: '001-01_C_HZ_POL_Oelradiator01', gleich: true },
    { was: 'Plug Heizung 03', alt: 'Heizung 03', neu: '001-02_C_PLUG_POL', gleich: false, frei: true, ids: ['switch.heizung_03 → switch.001_02_c_plug_pol', 'sensor.heizung_03_power → sensor.001_02_c_plug_pol_leistung'] },
    { was: 'Temperaturfühler', alt: '001_C_TEMP_POL', neu: '001_C_TEMP_POL', gleich: true },
  ];
  const namenChip = () => { const n = G.namenFertig ? 0 : NAMEN.filter(x => !x.gleich).length;
    return html`<button class="chip glas-panel or-nchip ${n ? 'warn' : 'ok'}" @click=${() => { G.tab = 'namen'; neu(); }}>${n ? `⚠ ${n} Name weicht ab` : 'Namen ✓'}</button>`; };
  const TABS = [['heizung', '🔥 Heizung'], ['fuehler', '🌡 Fühler & Kontakte'], ['strom', '⚡ Strom'], ['aussehen', '🏠 Aussehen'], ['namen', '🏷 Namen in HA']];

  const sollBlock = () => html`<div class="glas-panel or-soll">
      <div class="or-soll-z" data-k="soll-dauer"><div class="or-zl"><b>Soll · dauerhaft</b><div class="leise">eigenes Soll dieses Containers, gilt jeden Arbeitstag</div>
          <div class="or-mk">${marke(E.soll, () => { E.soll.herkunft = 'baustelle'; E.soll.wert = 20; neu(); })}${E.soll.herkunft === 'baustelle' ? html`<span class="or-erb">von der Baustelle</span>` : nothing}</div></div>
        <span class="stepper"><button @click=${() => { E.soll.wert -= .5; E.soll.herkunft = E.soll.wert === 20 ? 'baustelle' : 'abweichend'; neu(); }}>−</button><b class=${E.soll.herkunft === 'abweichend' ? 'eigen' : ''}>${E.soll.wert.toFixed(1).replace('.', ',')} °C</b><button @click=${() => { E.soll.wert += .5; E.soll.herkunft = E.soll.wert === 20 ? 'baustelle' : 'abweichend'; neu(); }}>+</button></span></div>
      <div class="or-soll-z" data-k="soll-heute"><div class="or-zl"><b>Nur heute</b><div class="leise">${E.heute.wert ? `heute ${E.heute.wert > 0 ? '+' : ''}${String(E.heute.wert).replace('.', ',')} °C – gilt bis morgen 03:30, dann wieder ${E.soll.wert.toFixed(1).replace('.', ',')} °C` : 'verschiebt das Soll bis morgen früh – wie − / + am Rad des Containers'}</div></div>
        <span class="stepper klein"><button @click=${() => { E.heute.wert -= .5; neu(); }}>−</button><b>${E.heute.wert ? `${E.heute.wert > 0 ? '+' : ''}${String(E.heute.wert).replace('.', ',')} °` : '±0'}</b><button @click=${() => { E.heute.wert += .5; neu(); }}>+</button></span></div>
      <div class="leise or-fuss">Am Rad des Containers steht künftig „nur heute“ unter − / +; dauerhaft wird das Soll nur hier geändert (Heizung › Je Container zeigt es als Schnellliste).</div></div>`;

  const MODI = [['plan', 'Zeitplan'], ['thermo', 'Thermostat'], ['bedarf', 'Bei Bedarf'], ['hand', 'Hand'], ['aus', 'Aus']];
  const tabHeizung = () => html`${sollBlock()}
    <div class="glas-panel liste or-gr">
      ${zeile('Modus', 'Thermostat: hält das Soll mit dem Fühler in der Arbeitszeit', seg(MODI, E.modus.wert, v => { E.modus.wert = v; neu(); }), null, { k: 'modus' })}
      ${zeile('🧠 Lernende Regelung', html`heizt so früh, dass das Soll rechtzeitig da ist · <button class="or-link" @click=${zeigeSprung('Lernstand')}>Lernstand ›</button>${sprung('Lernstand')}`, sw(E.lernen.wert, () => { E.lernen.wert = !E.lernen.wert; neu(); }), null, { k: 'lernen' })}
      <div class="gruppe">🧠 Warm ab · nur mit lernender Regelung</div>
      ${zeile(E.warm_vor.t, 'wann der Raum vor Arbeitsbeginn warm ist', html`<span class="stepper klein"><button @click=${() => { E.warm_vor.wert = '15 min vorher'; E.warm_vor.herkunft = 'abweichend'; E.warm_vor.baustelle = 'bei Beginn'; neu(); }}>−</button><b class=${E.warm_vor.herkunft === 'abweichend' ? 'eigen' : ''}>${E.warm_vor.wert}</b><button @click=${() => { E.warm_vor.wert = 'bei Beginn'; E.warm_vor.herkunft = 'baustelle'; neu(); }}>+</button></span>`, E.warm_vor, { k: 'warm_vor', zurueck: zurueckAuf(E.warm_vor, 'bei Beginn') })}
      ${zeile(E.warm_nach.t, 'wie lange er nach Arbeitsende warm bleibt', html`<span class="stepper klein"><button>−</button><b class=${E.warm_nach.herkunft === 'abweichend' ? 'eigen' : ''}>${E.warm_nach.wert}</b><button>+</button></span>`, E.warm_nach, { k: 'warm_nach', zurueck: zurueckAuf(E.warm_nach, 'bis Ende') })}
      <div class="gruppe">Regeln der Baustelle, die hier gelten</div>
      ${zeile(E.vorheizen.t, null, html`<span class="or-wert">${E.vorheizen.wert}</span>`, E.vorheizen, { k: 'vorheizen' })}
      ${zeile(E.frost.t, 'auch nachts, frei und bei Automatik aus', html`<span class="or-wert">${E.frost.wert}</span>`, E.frost, { k: 'frost' })}
      <div class="gruppe">Heizkörper</div>
      ${zeile('🔥 Zusatz-Heizkörper nur bei Bedarf', '★ Primär: Radiator 1 (automatisch) · Zusatz: Heizung 03', sw(E.stufen.wert, () => { E.stufen.wert = !E.stufen.wert; neu(); }), null, { k: 'stufen' })}
      ${zeile('👕 Kleidung trocknen nach Regen', html`Werte der Baustelle: ${E.trocknen.werte}`, sw(E.trocknen.wert, () => { E.trocknen.wert = !E.trocknen.wert; neu(); }), null, { k: 'trocknen' })}
      ${zeile('Größe', 'Doppelcontainer ≈ 28,0 m² · 2,30 m hoch – Startwert der lernenden Regelung', seg([['einzel', 'Einzel'], ['doppel', 'Doppel'], ['frei', 'm²']], E.groesse.wert, v => { E.groesse.wert = v; neu(); }), null, { k: 'groesse' })}
    </div>`;

  const KONTAKTE = [
    { k: 'fuehler', ic: '🌡', t: 'Temperaturfühler', wert: 'Shelly H&T Gen3 · 19,4 °C', id: 'sensor.001_c_temp_pol_temperatur', sub: 'nötig für Thermostat, Bei Bedarf und die lernende Regelung' },
    { k: 'tuer1', ic: '🚪', t: 'Tür 1', wert: 'Tür Polier · zu', id: 'binary_sensor.tuer_polier', pause: true },
    { k: 'tuer2', ic: '🚪', t: 'Tür 2', wert: null },
    { k: 'fenster1', ic: '🪟', t: 'Fenster 1', wert: 'Polier Fenster 1 · zu', id: 'binary_sensor.polier_fenster_1' },
    { k: 'fenster2', ic: '🪟', t: 'Fenster 2', wert: 'Polier Fenster 2 · gekippt', id: 'binary_sensor.polier_fenster_2' },
    { k: 'licht', ic: '💡', t: 'Licht im Symbol', wert: null },
  ];
  const PICKER = [['binary_sensor.tuer_mannschaft_neu', 'Tür Mannschaft (neu)', 'Tür · zu · frei'], ['binary_sensor.shelly_blu_dw_3c2a', 'Shelly BLU Door/Window', 'Tür · zu · frei'], ['binary_sensor.tuer_magazin', 'Tür Magazin', 'Tür · Magazin']];
  const tabFuehler = () => html`<div class="glas-panel liste or-gr">
      ${KONTAKTE.map(x => html`${zeile(html`${x.ic} ${x.t}`, x.wert ? html`${x.wert}<div class="or-id">${x.id}</div>${x.pause ? html`<div class="leise">pausiert die Heizung, wenn offen</div>` : nothing}` : (x.sub || 'keiner zugeordnet'),
          x.wert ? html`<button class="chip glas-panel" @click=${() => { G.picker = x.k; neu(); }}>ändern</button>` : html`<button class="chip glas-panel or-plus" @click=${() => { G.picker = x.k; neu(); }}>+ zuordnen</button>`, null, { k: x.k })}
        ${G.picker === x.k ? html`<div class="or-picker"><input type="search" placeholder="Suchen: Name, Bereich, Entity-ID" .value=${'tür'}>
          ${PICKER.map(([id, n, s]) => html`<button class="zeile or-pk"><div><b>${n}</b><div class="or-id">${id}</div></div><span class="leise">${s}</span></button>`)}
          <div class="or-pk-fuss"><button class="or-link" @click=${() => { G.as = { ...G.as, schritt: 1, geraet: 'blu' }; R.auf(R.P()[0], { art: 'or-assist', zurueck: { art: 'bereich' } }); R.auf(R.P()[1], { art: 'or-assist', zurueck: { art: 'bereich' } }); }}>Neues Gerät mit dem Assistenten ›</button>
            <button class="or-link" @click=${() => { G.picker = false; neu(); }}>schließen</button></div></div>` : nothing}`)}
      ${zeile(E.tuer.t, 'Tür offen → Heizung pausiert', html`<span class="or-wert">${E.tuer.wert}</span>`, E.tuer, { k: 'tuerpause' })}
    </div>
    <div class="leise or-fuss">Alle Türen, Fenster und das Licht stehen hier an einer Stelle; wo sie im Symbol sitzen, steht unter 🏠 Aussehen. Die Liste sucht über alle Entitäten (wie die Auswahl in HA).</div>`;

  const tabStrom = () => html`<div class="glas-panel liste or-gr">
      ${zeile('Stromanschluss', 'Baustrom 1 · 3 × 32 A · Starkstrom', html`<select><option>Baustrom 1 · 3 × 32 A</option><option>Baustrom 2 · 16 A</option></select>`, null, { k: 'anschluss' })}
      ${zeile(E.vorrang.t, 'kommt vor den anderen dran, wenn nicht alle zugleich dürfen', seg([['niedrig', 'niedrig'], ['normal', 'normal'], ['hoch', 'hoch']], E.vorrang.wert, v => { E.vorrang.wert = v; E.vorrang.herkunft = v === 'normal' ? 'baustelle' : 'abweichend'; neu(); }), E.vorrang, { k: 'vorrang', zurueck: zurueckAuf(E.vorrang, 'normal') })}
      ${zeile(E.staffel.t, null, html`<span class="or-wert">${E.staffel.wert}</span>`, E.staffel, { k: 'staffel' })}
      ${zeile('Firma · für die Abrechnung', null, html`<select><option>Eigene Firma</option><option>Strabag AG</option><option>Elektro Huber GmbH</option></select>`, null, { k: 'firma' })}
      ${zeile('Kosten heute', 'zum Tagespreis 0,28 €/kWh – von der Integration', html`<button class="or-link" @click=${() => auswertungFilter()}>2,40 € · in der Auswertung ›</button>`, null, { k: 'kosten' })}
    </div>`;

  const tabAussehen = (p) => html`<div class="glas-panel liste or-gr">
      ${zeile('Symbol', 'Doppelcontainer · blau · 1 Tür · 2 Fenster · Licht: keins', html`<button class="chip glas-panel" @click=${() => p.b && p.aussehenAuf(p.b)}>Aussehen bearbeiten ›</button>`, null, { k: 'symbol' })}
      ${zeile('Name auf der Seite', 'erscheint auf Kachel und Kopf; der Name in HA steht unter 🏷 Namen in HA', html`<input value="Poliercontainer" size="16">`, null, { k: 'name' })}
    </div>`;

  const tabNamen = () => { const offen = G.namenFertig ? [] : NAMEN.filter(x => !x.gleich);
    return html`<div class="glas-panel liste or-gr">
      <div class="zeile or-zeile"><div class="or-zl"><b>Namen in Home Assistant</b><div class="leise">Schema der Baustelle: Nummer · Art · Kürzel, z. B. <code>001-02_C_PLUG_POL</code>. Der HA-Bereich „Poliercontainer“ und die Werte der Baustelle bleiben unverändert.</div></div>${namenChip()}</div>
      ${NAMEN.map(x => html`<div class="zeile or-nz ${!x.gleich && !G.namenFertig ? 'abw' : ''}"><div class="or-zl"><span class="leise">${x.was}</span>
          <div><code>${G.namenFertig ? x.neu : x.alt}</code>${!x.gleich && !G.namenFertig ? html` <span class="or-abw">⚠ weicht ab${x.frei ? ' · freier Name' : ''}</span>` : html` <span class="or-ok">✓ nach Schema</span>`}</div>
          ${!x.gleich && !G.namenFertig && G.namenVorschau ? html`<div class="or-neu">→ <code>${x.neu}</code>${x.ids.map(i => html`<div class="or-id">${i}</div>`)}<div class="or-id">Name im Shelly → ${x.neu}</div></div>` : nothing}</div></div>`)}
      ${offen.length ? (G.namenVorschau
        ? html`<div class="or-knoepfe"><button class="knopf amber" @click=${() => { G.namenFertig = true; G.namenVorschau = false; neu(); }}>Übernehmen (${offen.length})</button><button class="knopf" @click=${() => { G.namenVorschau = false; neu(); }}>Freien Namen behalten</button></div>
           <div class="leise or-fuss">Freie Namen sind erlaubt; sie bleiben als „⚠ weicht ab“ markiert (Chip am Container, „Was fehlt noch“). Nur Admins können übernehmen.</div>`
        : html`<button class="knopf amber or-breit" @click=${() => { G.namenVorschau = true; neu(); }}>In Home Assistant einheitlich benennen … (${offen.length})</button>`)
        : html`<div class="or-erg">✓ Alle Namen nach Schema · <button class="or-link" @click=${() => { G.namenFertig = false; neu(); }}>↺ Rückgängig</button></div>`}
    </div>`; };

  const containerSeite = (p) => { const b = p.b || { name: 'Poliercontainer' };
    return html`<div class="griff"></div>${R.band('Vorschlag Ordnung · M8: „Bearbeiten“ ist die eine Container-Seite')}
      <div class="block-kopf or-kopf"><div><h3>${b.name}</h3><span class="leise">Container · Inventar <code>001_C_POL</code> · eigen</span></div>${namenChip()}</div>
      <div class="glas-panel liste or-geraete"><div class="gruppe">Geräte · ${GERAETE.length}</div>
        ${GERAETE.map(g => html`<div class="zeile"><div class="or-zl"><b>${g.ic} ${g.n}</b><div class="leise">${g.typ} · <code>${g.name}</code>${g.frei && !G.namenFertig ? html` <span class="or-abw">⚠ weicht ab</span>` : nothing}</div></div><span class="leise">${g.jetzt} ✎</span></div>`)}
        <button class="zeile or-plus-z" @click=${() => assistent({ schritt: 1, bid: 'polier', vorgabe: true })}><span class="blau">+ Gerät hinzufügen</span><span class="leise">Assistent: Gerät · was hängt dran · Namen</span></button></div>
      <div class="or-legende"><span class="or-erb">von der Baustelle</span> gilt für alle Container · <span class="or-abw">abweichend ↺</span> eigener Wert, ↺ = zurück · ohne Marke: gibt es nur am Container · Änderungen gelten sofort</div>
      <div class="seg or-tabs">${TABS.map(([k, t]) => html`<button class=${G.tab === k ? 'on' : ''} @click=${() => { G.tab = k; G.picker = false; neu(); }}>${t}</button>`)}</div>
      ${G.tab === 'heizung' ? tabHeizung() : G.tab === 'fuehler' ? tabFuehler() : G.tab === 'strom' ? tabStrom() : G.tab === 'aussehen' ? tabAussehen(p) : tabNamen()}
      <div class="or-knoepfe or-unten"><button class="knopf" @click=${() => p.schliessen()}>Fertig</button><button class="knopf rot">Container entfernen</button></div>`; };
  R.einblendung('bereich', containerSeite, { breit: () => true });

  /* ================= Assistent „+ Gerät hinzufügen“ (M10/M12) ================= */
  // baustelle/geraet_kandidaten (Integration: HA-Geräte ohne Zuordnung, neueste zuerst)
  const KAND = [
    { id: 'plug9', ic: '🔌', n: 'Shelly Plug S Gen3', sub: 'shellyplugsg3-8c1a · neu seit heute 10:42 · 0 W', art: 'plug' },
    { id: 'plug4', ic: '🔌', n: 'Heizung 04', sub: 'Shelly Plus Plug S · frei · 0 W', art: 'plug' },
    { id: 'ht', ic: '🌡', n: 'Shelly H&T Gen3', sub: '21,2 °C · frei', art: 'fuehler' },
    { id: 'blu', ic: '🚪', n: 'Shelly BLU Door/Window', sub: 'zu · frei', art: 'kontakt' },
  ];
  const CONT = [['polier', 'Poliercontainer', '001_C_POL', '2 Heizkörper · Fühler'], ['mannschaft', 'Mannschaft', 'STRA-01_C_MAN', 'Strabag · 2 Heizkörper'], ['magazin', 'Magazin', '002_C_LAG', '1 Heizkörper · ohne Fühler'],
    ['sanitaer', 'Sanitär', '003_C_SAN', '1 Heizkörper'], ['besprechung', 'Besprechung', '004_C_BES', 'Bei Bedarf · ohne Fühler']];
  // eine Typenliste für alle Wege (Seite, Inventar, HA-Unter-Eintrag): passt / passt nicht zum gewählten Gerät (Integration)
  const TYPEN = [['Am Plug', [['oel', '🔥 Ölradiator', 'plug'], ['konvektor', '🔥 Konvektor', 'plug'], ['trockner', '💨 Bautrockner', 'plug'], ['pumpe', '💧 Pumpe (nur Schacht)', 'plug'], ['steckdose', '🔌 Steckdose / sonstiges', 'plug']]],
    ['Sensor', [['fuehler', '🌡 Temperaturfühler', 'fuehler'], ['tuer', '🚪 Tür', 'kontakt'], ['fenster', '🪟 Fenster', 'kontakt'], ['licht', '💡 Licht', 'licht']]]];
  const VORSCHAU = { plug9: [['Gerät in HA', 'Shelly Plug S Gen3', '001-03_C_PLUG_POL'], ['Schalter', 'switch.shellyplugsg3_8c1a', 'switch.001_03_c_plug_pol'], ['Leistung', 'sensor.shellyplugsg3_8c1a_power', 'sensor.001_03_c_plug_pol_leistung'],
    ['Heizkörper auf der Seite', '–', '001-03_C_HZ_POL_Konvektor02'], ['Name im Shelly', 'shellyplugsg3-8c1a', '001-03_C_PLUG_POL']] };
  const assistent = (o) => { G.as = { ...G.as, ...o }; for (const q of R.P()) R.auf(q, { art: 'or-assist', zurueck: q.s.sheet && q.s.sheet.art === 'bereich' ? { art: 'bereich' } : null }); };
  const SCHRITTE = ['Gerät', 'Container', 'Was hängt dran', 'Namen', 'Fertig'];
  const assist = (p) => { const a = G.as, k = KAND.find(x => x.id === a.geraet) || KAND[0], c = CONT.find(x => x[0] === a.bid) || CONT[0], weiter = n => () => { a.schritt = n; neu(); };
    const kopf = html`<div class="griff"></div>${R.band('Vorschlag Ordnung · M12: ein Assistent „+ Gerät hinzufügen“ von überall')}
      <div class="block-kopf"><h3>+ Gerät hinzufügen</h3><span class="leise">${a.vorgabe ? `für ${c[1]}` : 'Schritt ' + a.schritt + ' von 5'}</span></div>
      <ol class="or-schritte">${SCHRITTE.map((t, i) => html`<li class=${i + 1 === a.schritt ? 'an' : i + 1 < a.schritt ? 'fertig' : ''}><span>${i + 1 < a.schritt ? '✓' : i + 1}</span>${t}</li>`)}</ol>`;
    let inhalt;
    if (a.schritt === 1) inhalt = html`<input class="or-suche" type="search" placeholder="Suchen: Name, Modell, Bereich">
      <div class="glas-panel liste"><div class="gruppe">Neu in Home Assistant, noch nicht zugeordnet · ${KAND.length}</div>
        ${KAND.map(x => html`<button class="zeile or-wahl ${a.geraet === x.id ? 'on' : ''}" @click=${() => { a.geraet = x.id; neu(); }}><div class="or-zl"><b>${x.ic} ${x.n}</b><div class="leise">${x.sub}</div></div><span class="or-radio"></span></button>`)}</div>
      <div class="leise or-fuss">Nicht dabei? Erst in HA hinzufügen (Einstellungen › Geräte & Dienste › Shelly), dann erscheint es hier. Alternative in Home Assistant: Geräte & Dienste › Baustelle › „Gerät“ – derselbe Ablauf.</div>
      <div class="or-knoepfe"><button class="knopf amber" @click=${weiter(a.vorgabe ? 3 : 2)}>Weiter ›</button><button class="knopf leise-k" @click=${() => p.schliessen()}>Abbrechen</button></div>`;
    else if (a.schritt === 2) inhalt = html`<div class="glas-panel liste"><div class="gruppe">An welchen Container?</div>
        ${CONT.map(x => html`<button class="zeile or-wahl ${a.bid === x[0] ? 'on' : ''}" @click=${() => { a.bid = x[0]; neu(); }}><div class="or-zl"><b>${x[1]}</b><div class="leise"><code>${x[2]}</code> · ${x[3]}</div></div><span class="or-radio"></span></button>`)}
        <button class="zeile" @click=${() => { for (const q of R.P()) R.auf(q, { ...CN_SHEET(), zurueck: { art: 'or-assist' } }); }}><span class="blau">+ Neuer Container …</span><span class="leise">legt Inventar mit an</span></button></div>
      <div class="or-knoepfe"><button class="knopf amber" @click=${weiter(3)}>Weiter ›</button><button class="knopf" @click=${weiter(1)}>‹ Zurück</button></div>`;
    else if (a.schritt === 3) inhalt = html`<div class="leise or-fuss">${k.ic} ${k.n} an <b>${c[1]}</b> – was hängt dran?</div>
      ${TYPEN.map(([g, L]) => html`<div class="glas-panel liste"><div class="gruppe">${g}</div>${L.map(([v, t, art]) => { const passt = art === k.art;
        return html`<button class="zeile or-wahl ${a.typ === v ? 'on' : ''} ${passt ? '' : 'or-aus'}" ?disabled=${!passt} @click=${() => { a.typ = v; neu(); }}><b>${t}</b>${passt ? html`<span class="or-radio"></span>` : html`<span class="leise">passt nicht zu ${k.n}</span>`}</button>`; })}</div>`)}
      ${['oel', 'konvektor', 'trockner'].includes(a.typ) ? html`<div class="glas-panel liste">${zeile('Nennleistung (Typenschild)', 'für Prognose und Staffelung; leer = gemessen', html`<span class="stepper klein"><button>−</button><b>2,0 kW</b><button>+</button></span>`)}
        ${zeile('Rolle', 'Primär heizt zuerst, Zusatz nur bei Bedarf', seg([['primaer', '★ Primär'], ['zusatz', 'Zusatz']], 'zusatz', () => {}))}</div>` : nothing}
      <div class="or-knoepfe"><button class="knopf amber" @click=${weiter(4)}>Weiter › Namen</button><button class="knopf" @click=${weiter(a.vorgabe ? 1 : 2)}>‹ Zurück</button></div>`;
    else if (a.schritt === 4) inhalt = html`<div class="leise or-fuss">So heißt es danach in Home Assistant (Schema der Baustelle). Noch ist nichts geschrieben.</div>
      <div class="glas-panel or-vorschau"><div class="or-vz kopf"><span>Was</span><span>heute</span><span>neu</span></div>
        ${VORSCHAU.plug9.map(([w, alt, neuN], i) => html`<div class="or-vz"><span class="leise">${w}</span><code class="alt">${alt}</code><code class=${a.frei && i === 0 ? 'or-frei' : ''}>${a.frei && i === 0 ? a.freiName : neuN}</code></div>`)}</div>
      <div class="glas-panel liste">${zeile('Eigenen Namen statt Schema', a.frei ? html`<input .value=${a.freiName} @input=${e => { a.freiName = e.target.value; neu(); }}> <span class="or-abw">⚠ weicht ab – wird markiert, nicht gesperrt</span>` : 'erlaubt, wird dann am Container als „⚠ weicht ab“ gezeigt', sw(a.frei, () => { a.frei = !a.frei; neu(); }))}</div>
      <div class="or-knoepfe"><button class="knopf amber" @click=${weiter(5)}>${a.frei ? 'Anlegen (freier Name)' : 'Anlegen und umbenennen'}</button><button class="knopf" @click=${weiter(3)}>‹ Zurück</button></div>
      <div class="leise or-fuss">Ein Schritt: legt Gerät und Inventar-Eintrag an und benennt um. Bricht etwas ab, bleibt nichts halb (heute ordnet „Zuordnen“ schon vor der Vorschau zu).</div>`;
    else inhalt = html`<div class="glas-panel or-fertig"><div class="or-gross">✓</div><b>${k.n} hängt an ${c[1]}</b>
        <div class="leise">als Konvektor (Zusatz) · ${a.frei ? html`Name „${a.freiName}“ <span class="or-abw">⚠ weicht ab</span>` : '5 Namen geändert, auch im Shelly'}</div>
        <div class="or-knoepfe"><button class="knopf amber" @click=${() => { for (const q of R.P()) R.auf(q, { art: 'bereich' }); }}>Zum Container ›</button><button class="knopf" @click=${weiter(1)}>+ Noch ein Gerät</button><button class="knopf leise-k">↺ Rückgängig</button></div></div>`;
    return html`${kopf}${inhalt}`; };
  R.einblendung('or-assist', assist, { breit: () => true });

  /* ================= + Container (ersetzt 'container-neu'): legt Inventar mit an (Entscheidung 2) ================= */
  // Die Seite erwartet bei 'container-neu' ein Formular (einblenden in alt.js); der Vorschlag ersetzt nur die Vorlage
  const CN_SHEET = () => ({ art: 'container-neu', form: { name: '', art: 'Container', fuehler: '', schalter: '', typ: 'Ölradiator' } });
  const KUERZEL = [['MAN', 'Mannschaft'], ['POL', 'Polier'], ['LAG', 'Lager/Magazin'], ['SAN', 'Sanitär'], ['BES', 'Besprechung'], ['BUE', 'Büro']];
  const containerNeu = (p) => { const c = G.cn, nr = String(c.nummer).padStart(c.eigen ? 3 : 2, '0'), inv = c.art === 'schacht' ? `${nr}_S_PUMP` : c.eigen ? `${nr}_C_${c.kuerzel}` : `${c.firma}-${nr}_C_${c.kuerzel}`;
    const belegt = c.eigen && c.nummer <= 4;
    return html`<div class="griff"></div>${R.band('Vorschlag Ordnung · M12: „+ Container“ legt den Inventar-Container mit an')}
      <div class="block-kopf"><h3>+ Container</h3><span class="leise">auf der Seite und im Inventar</span></div>
      <div class="glas-panel liste or-gr">
        ${zeile('Art', null, seg([['container', 'Container'], ['schacht', 'Pumpenschacht']], c.art, v => { c.art = v; neu(); }))}
        ${c.art === 'container' ? zeile('Gehört', 'eigen = Nummer der Baustelle; fremd = Kürzel und Nummer der Firma', seg([['eigen', 'eigen'], ['fremd', 'fremd']], c.eigen ? 'eigen' : 'fremd', v => { c.eigen = v === 'eigen'; c.nummer = c.eigen ? 6 : 2; neu(); })) : nothing}
        ${!c.eigen && c.art === 'container' ? zeile('Firma', 'Kürzel aus ⚙ › Firmen', html`<select @change=${e => { c.firma = e.target.value; neu(); }}><option value="STRA">Strabag AG · STRA</option><option value="HUB">Elektro Huber GmbH · HUB</option></select>`) : nothing}
        ${zeile('Nummer', belegt ? html`<span class="or-warn">${nr} ist schon vergeben</span>` : `nächste freie: ${c.eigen ? '006' : '02'}`, html`<span class="stepper klein"><button @click=${() => { c.nummer = Math.max(1, c.nummer - 1); neu(); }}>−</button><b>${nr}</b><button @click=${() => { c.nummer += 1; neu(); }}>+</button></span>`)}
        ${c.art === 'container' ? zeile('Verwendung', 'Kürzel im Namen', html`<select @change=${e => { c.kuerzel = e.target.value; neu(); }}>${KUERZEL.map(([v, t]) => html`<option value=${v} ?selected=${c.kuerzel === v}>${t} · ${v}</option>`)}</select>`) : nothing}
        ${zeile('Name auf der Seite', 'frei wählbar, z. B. für die Kachel', html`<input .value=${c.name} size="14" @input=${e => { c.name = e.target.value; neu(); }}>`)}
      </div>
      <div class="glas-panel or-vorschau"><div class="gruppe">Vorschau</div>
        <div class="or-vz"><span class="leise">Inventar und Bereich in HA</span><code>${inv}</code></div>
        <div class="or-vz"><span class="leise">Kachel auf der Seite</span><span>${c.name}</span></div>
        <div class="or-vz"><span class="leise">Geräte heißen dann</span><code>${inv.replace(/_(C|S)_/, '-01_$1_PLUG_').replace('_PLUG_PUMP', '_PLUG_PUMP')} …</code></div></div>
      <div class="or-knoepfe"><button class="knopf amber" ?disabled=${belegt} @click=${() => assistent({ schritt: 1, bid: 'neu', vorgabe: true })}>Anlegen und Gerät hinzufügen ›</button><button class="knopf" ?disabled=${belegt}>Nur anlegen</button><button class="knopf leise-k" @click=${() => p.schliessen()}>Abbrechen</button></div>
      <div class="leise or-fuss">Alle Wege (Übersicht, ⚙ › Container, Baustelle bearbeiten, Firma, Inventar) öffnen dieses eine Formular. Alternative in Home Assistant: Geräte & Dienste › Baustelle › „Bereich“ – legt ebenfalls das Inventar an.</div>`; };
  R.einblendung('container-neu', containerNeu, { breit: () => false });

  /* ================= Grundlagen für Hochrechnung und Baseline (M9) – im Reiter Heizung ================= */
  const KLIMA = [['Okt', '9,8'], ['Nov', '4,6'], ['Dez', '0,9'], ['Jan', '−0,6'], ['Feb', '1,2'], ['Mär', '5,4'], ['Apr', '9,9']];
  const grundlagenKarte = (p) => html`<div class="glas-panel liste or-grundlagen" data-or="grundlagen"><div class="gruppe">📈 Grundlagen für Hochrechnung und Baseline ${R.marke}</div>
      <button class="zeile" @click=${() => R.auf(p, { art: 'or-grundlagen' })}><div class="or-zl"><b>Heizperiode</b><div class="leise">Oktober – April · bis 30.04.2027</div></div><span class="leise">›</span></button>
      <button class="zeile" @click=${() => R.auf(p, { art: 'or-grundlagen' })}><div class="or-zl"><b>Klimamittel</b><div class="leise">Monatsmittel außen 1991–2020, Graz · eigene Werte: keine</div></div><span class="leise">›</span></button>
      <button class="zeile" @click=${() => R.auf(p, { art: 'or-grundlagen' })}><div class="or-zl"><b>🧪 Baseline messen</b><div class="leise">an · höchstens 60 € je Monat · nächster Lauf Di 01.12.</div></div><span class="leise">›</span></button>
      <div class="leise or-fuss">Ergebnisse stehen in der Auswertung (Heizperiode & Wetter, Ersparnis); dort nur „einstellen ›“.</div></div>`;
  const grundlagen = () => html`<div class="griff"></div>${R.band('Vorschlag Ordnung · M9: Einstellung hier, Ergebnis in der Auswertung')}
      <div class="block-kopf"><h3>Grundlagen für Hochrechnung und Baseline</h3><span class="leise">Heizung</span></div>
      <div class="glas-panel liste or-gr"><div class="gruppe">Heizperiode</div>
        ${zeile('von – bis', 'gilt für Hochrechnung und Baseline; heute auch unter ⚙ › Baustelle', html`<select><option>Oktober</option></select> – <select><option>April</option></select>`)}</div>
      <div class="glas-panel liste or-gr"><div class="gruppe">Klimamittel · °C außen je Monat</div>
        <div class="or-klima">${KLIMA.map(([m, v]) => html`<label><span class="leise">${m}</span><input .value=${v} size="4"></label>`)}</div>
        ${zeile('Quelle', 'Werte der nächsten Messstelle; eigene Werte überschreiben sie', html`<button class="chip glas-panel">↺ Messstelle</button>`)}</div>
      <div class="glas-panel liste or-gr"><div class="gruppe">🧪 Baseline messen</div>
        ${zeile('Testläufe ohne Automatik', 'ein Kontrolltag je Monat und Bauart, um „gespart“ zu belegen', sw(true, () => {}))}
        ${zeile('Kostenrahmen', 'je Monat', html`<span class="stepper klein"><button>−</button><b>60 €</b><button>+</button></span>`)}
        ${zeile('Nächster Lauf', 'Di 01.12. · Mannschaft · Konvektor', html`<button class="chip glas-panel">Absagen</button> <button class="chip glas-panel">Einplanen …</button>`)}</div>
      <div class="or-knoepfe"><button class="knopf" @click=${() => { for (const q of R.P()) { q.s.sheet = null; q.gehe('auswertung'); } }}>Ergebnisse in der Auswertung ›</button></div>`;
  R.einblendung('or-grundlagen', grundlagen, { breit: () => false });
  R.abschnitt({ ansicht: 'heizung', nach: p => grundlagenKarte(p) });

  /* ================= Karte „Was fehlt noch“ (M15) – Übersicht ================= */
  const FEHLT = [
    { ic: '🌡', t: 'Besprechung hat keinen Temperaturfühler', s: 'Bei Bedarf und Thermostat brauchen einen', los: 'Fühler zuordnen ›', f: () => assistent({ schritt: 1, geraet: 'ht', bid: 'besprechung', typ: 'fuehler', vorgabe: false }) },
    { ic: '🔌', t: 'Shelly Plug S Gen3 gehört zu keinem Container', s: 'neu in HA seit heute 10:42', los: 'Zuordnen ›', f: () => assistent({ schritt: 1, geraet: 'plug9', vorgabe: false }) },
    { ic: '🏷', t: 'Poliercontainer: 1 Name weicht ab', s: 'Heizung 03 – freier Name', los: 'Einheitlich benennen ›', f: () => { G.tab = 'namen'; G.namenVorschau = true; for (const q of R.P()) { q.containerOeffnen(BID); q.s.sheet = { art: 'bereich' }; q.neuZeichnen(); } } },
    { ic: '🛟', t: 'Plug Lager 09 hat kein Notprogramm', s: 'Gen1 – kann kein Skript', los: 'Ansehen ›', f: zeigeSprung('Einstellungen › Notprogramm') },
  ];
  const fehltKarte = () => html`<div class="glas-panel or-fehlt" data-or="fehlt"><div class="or-fehlt-k"><b>Was fehlt noch · ${FEHLT.length}</b>${R.marke}<span class="leise">prüft die Integration beim Start und täglich</span></div>
      ${FEHLT.map(x => html`<div class="or-fz"><span class="or-fic">${x.ic}</span><div class="or-zl"><b>${x.t}</b><div class="leise">${x.s}</div></div><button class="chip glas-panel" @click=${x.f}>${x.los}</button></div>`)}
      ${sprung('Einstellungen › Notprogramm')}</div>`;
  R.abschnitt({ ansicht: 'uebersicht', wann: () => G.fehlt !== false, vor: () => fehltKarte() });

  /* ================= Container-Ansicht: Kennzahlen springen gefiltert in die Auswertung (M13) ================= */
  const auswertungFilter = () => { G.aw = { ...G.aw, filter: 'Poliercontainer' }; for (const q of R.P()) { q.s.sheet = null; q.gehe('auswertung'); } };
  R.abschnitt({ ansicht: 'container', wann: p => p.b && p.b.id === BID, nach: () => html`<button class="glas-panel zeile or-aw-link" @click=${auswertungFilter}><span>📊 Mehr zu diesem Container in der Auswertung</span>${R.marke}<span class="leise">gefiltert ›</span></button>` });

  /* ================= Auswertung (M13/M14): eine Zeitraumleiste, feste Abschnitte ================= */
  const ZR = [['tag', 'Tag'], ['woche', 'Woche'], ['monat', 'Monat'], ['jahr', 'Jahr'], ['hp', 'Heizperiode'], ['gesamt', 'seit Beginn']];
  const ZR_T = { tag: 'Mo 23.11.2026', woche: 'KW 48 · 23.–29.11.', monat: 'November 2026', jahr: '2026', hp: 'Heizperiode 2026/27', gesamt: 'seit 01.09.2026' };
  const VG = [['', 'kein Vergleich'], ['vorperiode', 'Vorperiode'], ['vorjahr', 'Vorjahr'], ['ohne', 'ohne Automatik']];
  const VG_T = { vorperiode: 'Oktober 2026', vorjahr: 'November 2025 (Baustelle Dobl)', ohne: 'gerechnet ohne Automatik (24/7 auf Soll)' };
  const ABSCHN = [['verbrauch', 'Verbrauch & Kosten'], ['ersparnis', 'Ersparnis'], ['heizperiode', 'Heizperiode & Wetter'], ['abrechnung', 'Abrechnung & Export'], ['geraete', 'Geräte & Pumpen']];
  // Beispielwerte (baustelle/auswertung, je Zeitraum und Vergleich von der Integration)
  const TAGE = [62, 71, 58, 80, 77, 40, 22, 66, 74, 69, 85, 90, 44, 25, 70, 78, 81, 76, 88, 41, 20, 72, 79];
  const VTAGE = [55, 60, 61, 64, 70, 35, 20, 58, 61, 66, 70, 74, 39, 24, 60, 66, 71, 70, 72, 36, 19, 63, 70];
  const OHNE = TAGE.map(v => Math.round(v * 1.9 + 18));
  const RANG = [['Poliercontainer', 412, '115,40', 1], ['Mannschaft', 388, '108,60', 2], ['Magazin', 301, '84,30', 3], ['Sanitär', 255, '71,40', 4], ['Besprechung', 96, '26,90', 5]];
  const balken = (werte, vergl, farbe = 'var(--s1)') => { const max = Math.max(...werte, ...(vergl || [0]));
    return html`<div class="or-balken">${werte.map((v, i) => html`<div class="or-bs">${vergl ? html`<i class="v" style="height:${vergl[i] / max * 100}%"></i>` : nothing}<i style="height:${v / max * 100}%;background:${farbe}"></i></div>`)}</div>`; };
  const delta = (t, gut) => html`<span class="or-delta ${gut ? 'gut' : 'schlecht'}">${t}</span>`;
  const abschnittKopf = (k, t, eigen) => html`<span class="or-anker" data-or=${k}></span><div class="or-ak"><h3>${t}</h3>${eigen ? html`<span class="or-eigen" title="folgt nicht der Zeitraumleiste">⏱ ${eigen}</span>` : html`<span class="leise">${ZR_T[G.aw.zr]}${G.aw.filter ? ` · ${G.aw.filter}` : ''}</span>`}</div>`;
  const vgl = () => G.aw.vergl;
  const auswertung = (p) => { const a = G.aw, filt = a.filter, f = filt ? .3 : 1, kwh = Math.round(2317 * f), eur = (648.7 * f).toFixed(2).replace('.', ',');
    const vText = { vorperiode: ['▲ 11 % zu Oktober', '▲ 9 % zu Oktober'], vorjahr: ['▼ 6 % zu Nov. 2025', '▲ 3 % zu Nov. 2025'], ohne: ['▼ 47 % zu ohne Automatik', '▼ 47 %'] }[vgl()];
    return html`${R.band('Vorschlag Ordnung · M13/M14: eine Zeitraumleiste, feste Abschnitte – Anordnung in der Integration gespeichert')}
    <div class="glas-panel or-aw-kopf"><div><span class="leise">ÖWG DOBL ZWARING</span><h2>Auswertung</h2></div>
      <div class="or-aw-k-r"><div class="seg klein"><button class=${a.alle ? '' : 'on'} @click=${() => { a.alle = false; neu(); }}>Diese Baustelle</button><button class=${a.alle ? 'on' : ''} @click=${() => { a.alle = true; neu(); }}>Alle laufenden (2)</button></div>
        <button class="chip glas-panel" @click=${zeigeSprung('Anordnung (Abschnitte ein/aus, Reihenfolge) – gespeichert in der Integration, gleich auf Handy und PC')}>✎ Anordnung</button>
        <button class="chip glas-panel" @click=${zeigeSprung('Preis simulieren')}>💶 Preis: tatsächlich</button></div>
      ${sprung('Anordnung (Abschnitte ein/aus, Reihenfolge) – gespeichert in der Integration, gleich auf Handy und PC')}</div>
    <div class="glas-panel or-zrl" data-or="zeitraum">
      <div class="seg klein or-zr-seg">${ZR.map(([v, t]) => html`<button class=${a.zr === v ? 'on' : ''} @click=${() => { a.zr = v; neu(); }}>${t}</button>`)}</div>
      <div class="or-zr-nav"><button aria-label="zurück">‹</button><b>${ZR_T[a.zr]}</b><button aria-label="vor">›</button></div>
      <label class="or-vg">vergleichen mit <select @change=${e => { a.vergl = e.target.value; neu(); }}>${VG.map(([v, t]) => html`<option value=${v} ?selected=${a.vergl === v}>${t}</option>`)}</select></label>
      ${filt ? html`<button class="chip glas-panel or-filter" @click=${() => { a.filter = null; neu(); }}>Container: ${filt} ✕</button>` : nothing}
      ${a.vergl ? html`<span class="leise or-vg-t">Vergleich: ${VG_T[a.vergl]} – graue Balken</span>` : nothing}</div>
    <div class="or-sprungleiste">${ABSCHN.map(([k, t]) => html`<button class="chip glas-panel" @click=${() => { const el = p.renderRoot.querySelector(`[data-or="${k}"]`); if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' }); }}>${t}</button>`)}</div>

    <section class="glas-panel or-ab">${abschnittKopf('verbrauch', '⚡ Verbrauch & Kosten')}
      <div class="or-kz"><div><span class="leise">Kosten</span><b class="or-gross-z">${eur} €</b>${vText ? delta(vText[1], vgl() === 'ohne') : nothing}<div class="leise">zum Tagespreis der Integration</div></div>
        <div><span class="leise">Verbrauch</span><b class="or-gross-z">${kwh.toLocaleString('de-AT')} kWh</b>${vText ? delta(vText[0], vgl() !== 'vorperiode') : nothing}</div>
        <div><span class="leise">Heizzeit</span><b class="or-gross-z">${filt ? 84 : 312} h</b></div></div>
      ${balken(TAGE, vgl() === 'ohne' ? OHNE : vgl() ? VTAGE : null)}
      <div class="leise or-achse"><span>1.</span><span>8.</span><span>15.</span><span>23.</span></div>
      ${filt ? nothing : html`<div class="or-rang">${RANG.map(([n, k, e, i]) => html`<button class="zeile" @click=${() => { a.filter = n; neu(); }}><span>${i} ${n}</span><span class="or-rb"><i style="width:${k / 412 * 100}%;background:var(--s${i})"></i></span><b>${k} kWh</b><span class="leise">${e} €</span></button>`)}</div>`}
    </section>

    <section class="glas-panel or-ab">${abschnittKopf('ersparnis', '🌱 Ersparnis')}
      <div class="or-kz"><div><span class="leise">gespart durch die Automatik</span><b class="or-gross-z or-gut">${filt ? '156,10' : '520,30'} €</b><div class="leise">${filt ? 562 : 1873} kWh weniger als ohne Automatik</div></div>
        <div class="or-def"><b>Eine Rechnung für „gespart“</b> (überall gleich): ohne Automatik = jeder Heizkörper 24/7 auf Soll, nach Energiesignatur und Außentemperatur; belegt durch Baseline-Läufe (Spanne ± 14 %). Die bisherige „grobe Obergrenze“ fällt weg.</div></div>
      ${balken(TAGE.map(v => Math.round(v * .9 + 18)), null, 'var(--s3)')}
      <div class="or-zeile2"><span class="leise">Baseline-Läufe: 3 von 3 · zuletzt 03.11. Mannschaft · Abweichung zur Prognose −6 %</span><button class="or-link" @click=${() => { for (const q of R.P()) { q.gehe('heizung'); R.auf(q, { art: 'or-grundlagen' }); } }}>Baseline einstellen ›</button></div>
    </section>

    <section class="glas-panel or-ab">${abschnittKopf('heizperiode', '🌡 Heizperiode & Wetter', 'ganze Heizperiode Okt–Apr')}
      <div class="or-kz"><div><span class="leise">Hochrechnung Heizperiode</span><b class="or-gross-z">≈ 6 992 €</b><div class="leise">milder Winter 6 100 € · kalter 8 050 €</div></div>
        <div><span class="leise">kWh je Grad (Energiesignatur)</span><b class="or-gross-z">3,4</b><div class="leise">ein Name statt Wetter-Einfluss / Signatur</div></div>
        <div><span class="leise">Außen Ø ${ZR_T[a.zr]}</span><b class="or-gross-z">3,8 °C</b><div class="leise">Klimamittel 4,6 °C</div></div></div>
      ${balken([520, 980, 1410, 1610, 1380, 900, 470], [480, 900, 1300, 1500, 1300, 860, 450], 'var(--s4)')}
      <div class="leise or-achse"><span>Okt</span><span>Dez</span><span>Feb</span><span>Apr</span></div>
      <div class="or-zeile2"><span class="leise">Heizperiode Oktober – April · Klimamittel 1991–2020</span><button class="or-link" @click=${() => { for (const q of R.P()) { q.gehe('heizung'); R.auf(q, { art: 'or-grundlagen' }); } }}>einstellen ›</button></div>
    </section>

    <section class="glas-panel or-ab">${abschnittKopf('abrechnung', '🧾 Abrechnung & Export')}
      <div class="or-tab"><div class="or-tz kopf"><span>Firma</span><span>kWh</span><span>€</span></div>
        ${[['Eigene Firma', 1529, '428,10'], ['Strabag AG', 612, '171,40'], ['Elektro Huber GmbH', 176, '49,20']].map(([n, k, e]) => html`<div class="or-tz"><span>${n}</span><span>${k}</span><b>${e}</b></div>`)}</div>
      <div class="or-csv"><span class="leise">Alle Exporte an einer Stelle:</span>
        <button class="chip glas-panel">⇩ Abrechnung je Firma (CSV)</button><button class="chip glas-panel">⇩ Verbrauch je Tag</button><button class="chip glas-panel">⇩ Je Gerät</button><button class="chip glas-panel">⇩ seit Beginn je Monat</button>
        <button class="chip glas-panel" @click=${zeigeSprung('Bericht-Beispiel (⚙ › Bericht)')}>📨 Bericht-Beispiel</button></div>
      ${sprung('Bericht-Beispiel (⚙ › Bericht)')}
      <button class="zeile or-bsd" @click=${() => R.auf(p, { art: 'or-bsdetail' })}><div class="or-zl"><b>Baustellen-Detail · läuft seit 01.09.2026</b><div class="leise">Verbrauch je Monat und Container, CSV seit Beginn – auch ohne Abschließen</div></div><span class="leise">›</span></button>
    </section>

    <section class="glas-panel or-ab">${abschnittKopf('geraete', '🔌 Geräte & Pumpen')}
      <div class="or-tab"><div class="or-tz kopf vier"><span>Gerät</span><span>Ø kW</span><span>h</span><span>kWh</span></div>
        ${[['Radiator 1 · Polier', '1,9', 96, 182], ['Heizung 03 · Polier', '2,0', 48, 96], ['Konvektor · Mannschaft', '2,0', 101, 202], ['Ölradiator · Magazin', '1,5', 104, 156], ['Pumpe · Schacht 1', '0,8', 12, 9.6]].map(([n, k, h, w]) => html`<div class="or-tz vier"><span>${n}</span><span>${k}</span><span>${h}</span><b>${String(w).replace('.', ',')}</b></div>`)}</div>
      <div class="or-zeile2"><span class="leise">Ölradiator gegen Konvektor: kWh je Gradstunde und m² 0,031 / 0,027 · gleicher Zeitraum wie oben</span></div>
    </section>`; };
  R.abschnitt({ ansicht: 'auswertung', statt: p => auswertung(p) });

  /* ================= Baustellen-Detail für die laufende Baustelle (M11) ================= */
  const MON = ['Sep', 'Okt', 'Nov'], BSD = [['Poliercontainer', [180, 352, 412], 944], ['Mannschaft', [170, 330, 388], 888], ['Magazin', [120, 260, 301], 681], ['Sanitär', [110, 222, 255], 587], ['Besprechung', [30, 71, 96], 197]];   // Summen von der Integration
  R.einblendung('or-bsdetail', () => html`<div class="griff"></div>${R.band('Vorschlag Ordnung · M11: Baustellen-Detail auch während die Baustelle läuft')}
      <div class="block-kopf"><h3>ÖWG Dobl Zwaring</h3><span class="leise">läuft · seit 01.09.2026</span></div>
      <div class="or-tab"><div class="or-tz kopf fuenf"><span>Container</span>${MON.map(m => html`<span>${m}</span>`)}<span>Summe</span></div>
        ${BSD.map(([n, w, summe]) => html`<div class="or-tz fuenf"><span>${n}</span>${w.map(v => html`<span>${v}</span>`)}<b>${summe}</b></div>`)}</div>
      <div class="leise or-fuss">kWh je Monat; Summen und € liefert die Integration. November läuft noch (bis heute).</div>
      <div class="or-knoepfe"><button class="knopf amber">⇩ CSV seit Beginn</button><button class="knopf">Baustelle abschließen …</button></div>`, { breit: () => true });

  R.stil(`
.or-erb { font-size: 11px; padding: 1px 7px; border-radius: 8px; background: rgba(127,127,127,.2); color: var(--ink2); white-space: nowrap; }
.or-abw { font-size: 11px; padding: 1px 4px 1px 7px; border-radius: 8px; background: color-mix(in srgb, var(--amber) 20%, transparent); color: var(--amber); white-space: nowrap; display: inline-flex; align-items: center; gap: 4px; }
.or-zur { border: 0; background: none; color: var(--amber); font-size: 13px; padding: 0 3px; cursor: pointer; }
.or-ok { font-size: 11px; color: var(--s3); }
.or-warn { color: var(--rot); }
.or-mk { margin-top: 4px; display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }
.or-ruht { font-size: 11.5px; color: var(--ink2); font-style: italic; margin-top: 2px; }
.or-link { border: 0; background: none; padding: 0; font: inherit; font-size: 12.5px; color: var(--blau); cursor: pointer; }
.or-sprung { display: block; font-size: 11px; color: var(--amber); margin-top: 2px; }
.or-zeile { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.or-zl { min-width: 0; flex: 1; }
.or-zr { flex: none; display: flex; align-items: center; gap: 6px; flex-wrap: wrap; justify-content: flex-end; max-width: 60%; }
.or-z-erb .or-wert { color: var(--ink2); }
.or-z-abw > .or-zl > b { color: var(--amber); }
.stepper b.eigen { color: var(--amber); }
.or-wert { font-size: 13.5px; white-space: nowrap; }
.or-id { font-family: ui-monospace, monospace; font-size: 11px; color: var(--ink2); word-break: break-all; }
code { font-family: ui-monospace, monospace; font-size: 12px; }
.or-kopf { display: flex; justify-content: space-between; align-items: center; gap: 10px; }
.or-kopf h3 { margin: 0; }
.or-nchip.warn { color: var(--amber); border-color: var(--amber); }
.or-nchip.ok { color: var(--s3); }
.or-legende { font-size: 11.5px; color: var(--ink2); margin: 10px 2px; line-height: 1.9; }
.or-tabs { margin: 4px 0 10px; flex-wrap: wrap; }
.or-tabs button { font-size: 13px; }
.or-soll { padding: 10px 14px; margin-bottom: 10px; }
.or-soll-z { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 8px 0; }
.or-soll-z + .or-soll-z { border-top: 1px solid var(--gridc); }
.or-fuss { margin: 6px 2px; font-size: 12px; line-height: 1.45; }
.or-knoepfe { display: flex; flex-wrap: wrap; gap: 8px; margin: 10px 0; }
.or-knoepfe .knopf { flex: 1 1 auto; }
.or-breit { width: 100%; margin: 10px 0; }
.or-erg { padding: 10px 0; color: var(--s3); }
.or-nz.abw { background: color-mix(in srgb, var(--amber) 7%, transparent); }
.or-neu { margin-top: 4px; padding-left: 8px; border-left: 2px solid var(--amber); }
.or-picker { padding: 8px 10px 10px; background: rgba(127,127,127,.1); border-radius: 12px; margin: 0 6px 8px; }
.or-picker input { width: 100%; box-sizing: border-box; margin-bottom: 6px; }
.or-pk { display: flex; justify-content: space-between; gap: 8px; }
.or-pk-fuss { display: flex; justify-content: space-between; padding-top: 6px; }
.or-plus { color: var(--blau); }
.or-plus-z { display: flex; justify-content: space-between; }
.or-geraete code { font-size: 11px; }
.or-schritte { list-style: none; display: flex; gap: 4px; padding: 0; margin: 4px 0 12px; flex-wrap: wrap; }
.or-schritte li { font-size: 12px; color: var(--ink2); display: flex; align-items: center; gap: 5px; padding: 3px 9px 3px 3px; border-radius: 12px; background: rgba(127,127,127,.12); }
.or-schritte li span { width: 18px; height: 18px; border-radius: 50%; display: grid; place-items: center; background: rgba(127,127,127,.3); font-size: 11px; }
.or-schritte li.an { color: var(--ink); background: color-mix(in srgb, var(--amber) 22%, transparent); }
.or-schritte li.an span { background: var(--amber); color: #000; }
.or-schritte li.fertig span { background: var(--s3); color: #fff; }
.or-suche { width: 100%; box-sizing: border-box; margin-bottom: 8px; }
.or-wahl { display: flex; justify-content: space-between; align-items: center; gap: 10px; }
.or-wahl.on { background: color-mix(in srgb, var(--amber) 14%, transparent); }
.or-radio { width: 16px; height: 16px; border-radius: 50%; border: 2px solid var(--ink2); flex: none; }
.or-wahl.on .or-radio { border-color: var(--amber); background: radial-gradient(var(--amber) 45%, transparent 50%); }
.or-aus { opacity: .45; }
.or-vorschau { padding: 8px 14px; margin: 8px 0; }
.or-vz { display: grid; grid-template-columns: minmax(90px, 1fr) 1.4fr 1.6fr; gap: 8px; padding: 5px 0; border-top: 1px solid var(--gridc); align-items: baseline; }
.or-vz.kopf { border-top: 0; font-size: 11px; color: var(--ink2); text-transform: uppercase; letter-spacing: .5px; }
.or-vz code { word-break: break-all; }
.or-vz code.alt { color: var(--ink2); text-decoration: line-through; text-decoration-color: rgba(127,127,127,.6); }
.or-vorschau .or-vz:not(.kopf) { grid-template-columns: minmax(90px, 1fr) 2fr; }
.or-vorschau .or-vz:has(code.alt) { grid-template-columns: minmax(90px, 1fr) 1.4fr 1.6fr; }
.or-frei { color: var(--amber); }
.or-fertig { padding: 18px; text-align: center; }
.or-gross { font-size: 40px; color: var(--s3); }
.or-klima { display: flex; flex-wrap: wrap; gap: 8px; padding: 6px 12px 10px; }
.or-klima label { display: flex; flex-direction: column; font-size: 12px; gap: 2px; }
.or-grundlagen { margin-top: 14px; }
.or-fehlt { padding: 12px 16px; margin-bottom: 14px; }
.or-fehlt-k { display: flex; align-items: baseline; gap: 8px; flex-wrap: wrap; margin-bottom: 4px; }
.or-fehlt-k .leise { margin-left: auto; font-size: 11.5px; }
.or-fz { display: flex; align-items: center; gap: 10px; padding: 8px 0; border-top: 1px solid var(--gridc); }
.or-fic { font-size: 20px; flex: none; }
.or-aw-link { display: flex; justify-content: space-between; gap: 8px; margin-top: 14px; padding: 12px 16px; width: 100%; box-sizing: border-box; }
.or-aw-kopf { display: flex; justify-content: space-between; align-items: center; gap: 12px; flex-wrap: wrap; padding: 14px 18px; margin-bottom: 12px; }
.or-aw-kopf h2 { margin: 2px 0 0; font-size: 22px; }
.or-aw-k-r { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }
.or-anker { display: block; position: relative; top: -150px; height: 0; }   /* Sprungziel über dem Kopf: die Zeitraumleiste klebt oben */
.or-zrl { position: sticky; top: 0; z-index: 3; display: flex; flex-wrap: wrap; align-items: center; gap: 10px 14px; padding: 10px 14px; margin-bottom: 10px; backdrop-filter: blur(18px); -webkit-backdrop-filter: blur(18px); }
.or-zr-nav { display: flex; align-items: center; gap: 10px; }
.or-zr-nav button { font-size: 18px; padding: 0 6px; color: var(--ink2); }
.or-vg { font-size: 12.5px; color: var(--ink2); display: flex; align-items: center; gap: 6px; }
.or-vg-t { flex-basis: 100%; font-size: 11.5px; }
.or-filter { color: var(--amber); }
.or-sprungleiste { display: flex; gap: 6px; flex-wrap: wrap; margin-bottom: 12px; }
.or-sprungleiste .chip { font-size: 12.5px; }
.or-ab { padding: 14px 18px; margin-bottom: 14px; scroll-margin-top: 110px; }
.or-ak { display: flex; justify-content: space-between; align-items: baseline; gap: 10px; margin-bottom: 10px; scroll-margin-top: 110px; }
.or-ak h3 { margin: 0; font-size: 16px; }
.or-ak .leise { font-size: 12px; }
.or-eigen { font-size: 11.5px; padding: 2px 8px; border-radius: 8px; border: 1px dashed var(--amber); color: var(--amber); white-space: nowrap; }
.or-kz { display: flex; flex-wrap: wrap; gap: 14px 34px; margin-bottom: 12px; }
.or-kz > div { display: flex; flex-direction: column; gap: 2px; }
.or-gross-z { font-size: 26px; font-weight: 700; }
.or-gut { color: var(--s3); }
.or-def { max-width: 46ch; font-size: 12.5px; color: var(--ink2); line-height: 1.45; }
.or-def b { color: var(--ink); }
.or-delta { font-size: 12px; }
.or-delta.gut { color: var(--s3); }
.or-delta.schlecht { color: var(--amber); }
.or-balken { display: flex; align-items: flex-end; gap: 3px; height: 110px; }
.or-bs { flex: 1; height: 100%; position: relative; display: flex; align-items: flex-end; }
.or-bs i { position: absolute; bottom: 0; left: 0; right: 0; border-radius: 3px 3px 0 0; }
.or-bs i.v { background: rgba(127,127,127,.35); left: -1px; right: -1px; }
.or-bs i:not(.v) { left: 20%; right: 20%; }
.or-achse { display: flex; justify-content: space-between; font-size: 11px; margin-top: 4px; }
.or-rang { margin-top: 10px; }
.or-rang .zeile { display: grid; grid-template-columns: 130px 1fr 70px 60px; gap: 10px; align-items: center; padding: 6px 0; width: 100%; }
.or-rb { height: 6px; background: rgba(127,127,127,.15); border-radius: 3px; overflow: hidden; }
.or-rb i { display: block; height: 100%; }
.or-zeile2 { display: flex; justify-content: space-between; gap: 10px; flex-wrap: wrap; margin-top: 10px; font-size: 12px; }
.or-tab { margin-bottom: 10px; }
.or-tz { display: grid; grid-template-columns: 1fr 70px 80px; gap: 8px; padding: 6px 0; border-top: 1px solid var(--gridc); font-size: 13.5px; }
.or-tz.vier { grid-template-columns: 1fr 56px 46px 64px; }
.or-tz.fuenf { grid-template-columns: 1fr repeat(4, 54px); }
.or-tz > :not(:first-child) { text-align: right; }
.or-tz.kopf { border-top: 0; font-size: 11px; color: var(--ink2); text-transform: uppercase; letter-spacing: .4px; }
.or-csv { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; margin: 6px 0 10px; }
.or-csv .chip { font-size: 12.5px; }
.or-bsd { display: flex; justify-content: space-between; border-top: 1px solid var(--gridc); padding-top: 10px; width: 100%; }
@container (min-width: 700px) { .or-zrl { top: 72px; } }   /* Desktop: unter der schwebenden Reiterleiste */
@container (max-width: 640px) {
  .or-anker { top: -110px; }
  .or-zeile { flex-wrap: wrap; }
  .or-zr { max-width: 100%; justify-content: flex-start; }
  .or-zr .seg { flex-wrap: wrap; height: auto; max-width: 100%; }
  .or-zr .seg button { padding: 4px 7px; font-size: 11.5px; }
  .or-tabs { display: grid; grid-template-columns: 1fr 1fr; }
  .or-tabs button { font-size: 12px; padding: 0 6px; }
  .or-rang .zeile { grid-template-columns: 1fr 56px 52px; }
  .or-rang .or-rb { display: none; }
  .or-zr-seg { flex-wrap: wrap; }
  .or-gross-z { font-size: 21px; }
  .or-kz { gap: 10px 20px; }
  .or-vz, .or-vorschau .or-vz:has(code.alt) { grid-template-columns: 1fr; gap: 1px; }
  .or-vz.kopf { display: none; }
  .or-ak { flex-wrap: wrap; }
  .or-tz.fuenf { grid-template-columns: 1fr repeat(4, 40px); font-size: 12.5px; }
  .or-fehlt-k .leise { margin-left: 0; flex-basis: 100%; }
  .or-fz { flex-wrap: wrap; }
  .or-fz .chip { margin-left: 30px; }
}`);

  /* ---------- Vorführ-Leiste ---------- */
  const startwerte = () => { Object.assign(G, { tab: 'heizung', picker: false, namenVorschau: false, namenFertig: false, sprung: null, fehlt: true,
    as: { schritt: 1, geraet: 'plug9', bid: 'polier', typ: 'konvektor', frei: false, freiName: 'Konvektor Polier', vorgabe: false },
    cn: { art: 'container', eigen: true, firma: 'STRA', nummer: 6, kuerzel: 'MAN', name: 'Mannschaft 2' },
    aw: { zr: 'monat', vergl: 'vorperiode', filter: null, alle: false } });
    Object.assign(E.soll, { wert: 21, herkunft: 'abweichend' }); E.heute.wert = 0; Object.assign(E.warm_vor, { wert: 'bei Beginn', herkunft: 'baustelle' }); Object.assign(E.vorrang, { wert: 'hoch', herkunft: 'abweichend' }); };
  R.vorfuehren(async w => {
    startwerte();
    const z = w.zeigen;
    if (!window.baustelleBeispiel || !window.baustelleBeispiel.welt) return;
    for (const q of R.P()) {
      if (!q.d) continue;
      q.s.sheet = null;
      if (z === 'fehlt') q.gehe('uebersicht');
      else if (z.startsWith('cs-')) { q.containerOeffnen(BID); G.tab = z.slice(3).replace(/-.*/, ''); if (z === 'cs-fuehler-suche') G.picker = 'tuer2'; if (z === 'cs-namen-vorschau') G.namenVorschau = true; if (z === 'cs-heizung-geaendert') { E.heute.wert = 1; } q.s.sheet = { art: 'bereich' }; }
      else if (z.startsWith('as-')) { q.containerOeffnen(BID); const n = +z.slice(3, 4); G.as.schritt = n; if (z === 'as-4-frei') G.as.frei = true; q.s.sheet = { art: 'or-assist' }; }
      else if (z.startsWith('cn-')) { q.gehe('uebersicht'); if (z === 'cn-fremd') { G.cn.eigen = false; G.cn.nummer = 2; } if (z === 'cn-belegt') G.cn.nummer = 3; q.s.sheet = CN_SHEET(); }
      else if (z === 'heizung') q.gehe('heizung');
      else if (z === 'grundlagen') { q.gehe('heizung'); q.s.sheet = { art: 'or-grundlagen' }; }
      else if (z.startsWith('aw')) { q.gehe('auswertung'); if (z === 'aw-vorjahr') G.aw.vergl = 'vorjahr'; if (z === 'aw-ohne') G.aw.vergl = 'ohne'; if (z === 'aw-filter') G.aw.filter = 'Poliercontainer'; if (z === 'aw-heute') G.aw.vergl = ''; }
      else if (z === 'bsdetail') { q.gehe('auswertung'); q.s.sheet = { art: 'or-bsdetail' }; }
      else if (z === 'container') q.containerOeffnen(BID);
      await q.neuZeichnen();
    }
  });
}

const ZEIGEN = [
  ['fehlt', 'M15 Übersicht · Was fehlt noch'],
  ['cs-heizung', 'M8 Container-Seite · Heizung'], ['cs-heizung-geaendert', 'M8 · Heizung, nur heute +1 °C'], ['cs-fuehler', 'M8 · Fühler & Kontakte'], ['cs-fuehler-suche', 'M8/M16 · Kontakt wählen mit Suche'],
  ['cs-strom', 'M8 · Strom'], ['cs-aussehen', 'M8 · Aussehen'], ['cs-namen', 'M8 · Namen in HA'], ['cs-namen-vorschau', 'M8/M10 · Namen: Vorschau'],
  ['as-1', 'M12 Assistent 1 · Gerät'], ['as-2', 'M12 Assistent 2 · Container'], ['as-3', 'M12 Assistent 3 · Was hängt dran'], ['as-4', 'M12 Assistent 4 · Namen'], ['as-4-frei', 'M12 Assistent 4 · freier Name'], ['as-5', 'M12 Assistent 5 · Fertig'],
  ['cn-eigen', 'M12 + Container · eigen'], ['cn-fremd', 'M12 + Container · fremd'], ['cn-belegt', 'M12 + Container · Nummer belegt'],
  ['heizung', 'M9 Reiter Heizung · Grundlagen-Karte'], ['grundlagen', 'M9 Grundlagen bearbeiten'],
  ['aw', 'M13 Auswertung · Vorperiode'], ['aw-vorjahr', 'M13 Auswertung · Vorjahr'], ['aw-ohne', 'M13/M14 · ohne Automatik'], ['aw-filter', 'M13 · gefiltert (aus dem Container)'],
  ['container', 'M13 Container · Sprung in die Auswertung'], ['bsdetail', 'M11 Baustellen-Detail (laufend)'],
];
const faelle = ZEIGEN.map(([z]) => ({ name: z, werte: { zeigen: z } }));
faelle.push({ name: 'aw-ersparnis', werte: { zeigen: 'aw' }, scroll: '[data-or="ersparnis"]' }, { name: 'aw-heizperiode', werte: { zeigen: 'aw' }, scroll: '[data-or="heizperiode"]' },
  { name: 'aw-abrechnung', werte: { zeigen: 'aw' }, scroll: '[data-or="abrechnung"]' }, { name: 'aw-geraete', werte: { zeigen: 'aw' }, scroll: '[data-or="geraete"]' },
  { name: 'heizung-karte', werte: { zeigen: 'heizung' }, scroll: '[data-or="grundlagen"]' }, { name: 'cs-heizung-unten', werte: { zeigen: 'cs-heizung' }, scroll: '[data-k="stufen"]' },
  { name: 'cs-fuehler-suche-offen', werte: { zeigen: 'cs-fuehler-suche' }, scroll: '[data-k="tuer2"]' }, { name: 'cs-namen-vorschau-offen', werte: { zeigen: 'cs-namen-vorschau' }, scroll: '.or-nz.abw' });
rahmen.bauen({ datei: 'ordnung.html', titel: 'Baustelle – Ordnung der Oberfläche (Stufe 2/3)', leiste: 'Ordnung der Oberfläche · Stufe 2/3 · Maßnahmen 7–16', browser, faelle,
  auswahl: [{ id: 'zeigen', t: 'zeigen', optionen: ZEIGEN }] });
