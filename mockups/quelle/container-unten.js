// Vorschlag „Container unten aufräumen“ (AN-0018) und „Kachel Hochrechnung L mit Linien“ (AN-0023) auf Basis des Master-Mockups.
// Baut mockups/container-unten.html: node mockups/quelle/container-unten.js   ·   Bilder: node mockups/quelle/container-unten.js --bilder <ordner>
//
// ===== AN-0018 (Herbert, Container 001_C_POL): „Der untere Bereich ab ‚Geräte‘ gehört aufgeräumt und neu designt, und zwar
// ganz. Lernen, Tür und Kleidung brauchen wir sowieso nicht mehr, weil sie ja im Kopf als Chip angezeigt werden, oder? Und der
// Teil mit Geräte muss klarer sein: mit Türsensor, Fenstersensor, Temp-Sensor usw. und Heizkörper in einer Kachel, aber
// verständlich.“
//
// Heute unten (src/ansichten/container.js containerVorlage, ab „Geräte“) und wohin es wandert:
//   Block „Geräte“ (geraete())
//     ♨ Name, Typ · an x kW / aus · ★ Primär / Zusatz – wartet  → neue Geräte-Kachel, Gruppe Heizen (Zeile je Heizkörper)
//     ⏻ Ein/Aus = Handbetrieb                                    → bleibt an der Zeile (⏻), Erklärung als Satz unten in der Kachel
//     ✋ Hand · „Automatik übernehmen“                            → bleibt an der Zeile
//     wartet – Anschluss ausgelastet                              → bleibt an der Zeile (rechts unter dem Zustand)
//     Schalter „aktiv“ / verliehen / defekt                       → raus aus der Zeile: ist dasselbe wie Status im Gerätedialog
//                                                                   (✎ Gerät › Status, data-zeile="status"); inaktive Zeile gedimmt
//                                                                   mit Etikett „inaktiv“/„verliehen“/„defekt“
//     ✎ Gerät bearbeiten                                          → Zeile antippen (› am Ende) öffnet den Gerätedialog wie heute
//     Kopfzeile „⏻ = Handbetrieb · aktiv aus = …“                 → ein Satz unten in der Kachel
//   Sensor-Leiste (geraete.js sensorLeisteVorlage): 🌡/🚪/🪟/💡 Name · Zustand, 🔋, Signal, antippen = Einblendung „Sensor“
//                                                               → neue Geräte-Kachel, Gruppen Fühler und Türen & Fenster (Zeilen,
//                                                                 antippen öffnet weiter die Einblendung „Sensor“)
//   Liste c-einst
//     🚪 Tür offen seit … – pausiert nach … / Meldung nach …    → raus: steht im Kopf (Jetzt › 🚪 Tür offen seit …, Antippen = derselbe Satz)
//     🧠 Lernende Regelung (Schalter) + „Lernstand ›“           → raus: Chip im Kopf (⚙ eingestellt › 🧠 Lernende Regelung); Schalter
//                                                                 wandert nach „Bearbeiten“ (neue Zeile data-zeile="lernen", mit
//                                                                 „Lernstand ›“); „ändern ›“ des Chips springt dorthin (ziel
//                                                                 bearbeiten:lernen statt container:lernen). Lernstand außerdem über
//                                                                 Plan › „So rechnet der Start ›“ wie heute.
//     👕 Kleidung trocknen nach Regen (Schalter)                → raus: Chip im Kopf (⚙ eingestellt › 👕 Kleidung trocknen); Schalter
//                                                                 nach „Bearbeiten“ (data-zeile="trocknen"), ziel bearbeiten:trocknen.
//   Ist Lernen/Trocknen aus, gibt es keinen Chip – dann bleibt nur „Bearbeiten“ (oben rechts neben ‹ Übersicht). Darum stehen
//   beide Schalter dort immer.
//
// Neue Geräte-Kachel – drei Varianten:
//   A  eine Kachel „Geräte“ mit Gruppen-Zeilen: Heizen · Fühler · Türen und Fenster · Sonstiges (wie Einstellungen › Geräte)
//   B  Kacheln je Gerätart nebeneinander (Heizen breit, Fühler, Türen & Fenster, Sonstiges), je Kachel die Hauptzahl groß
//   C  Grundriss des Containers (von oben, Türen/Fenster wie im Symbol, Heizkörper an der Rückwand, Fühler) mit Nummern + Liste
//   heute  unverändert zum Vergleich
// Lagen: Poliercontainer (2 Heizkörper, Fühler, Tür, Fenster) · ohne Türsensor (+ Bautrockner unter Sonstiges) · Fühler-Batterie schwach.
// zeigen: unten (Kachel) · Bearbeiten (neue Zeilen Lernen/Trocknen) · Kopf (⚙ eingestellt aufgeklappt).
//
// DATEN – die Seite rechnet nichts (Werte unten in LAGEN als Beispiel, so wie sie ankommen sollen):
//   Heizkörper (struktur geraete[] + laufzeit.geraete, heute b.geraete): id, n (Name), typ, nenn_kw (Typenschild), an, kwJetzt
//     (Leistungssensor), erreichbar, status (aktiv/inaktiv/verliehen/defekt), hand, warte (Anschluss ausgelastet),
//     Rolle: b.stufen.haupt/zusatz/zusatz_an/text (Integration) → ★ Primär / 🔥 Zusatz + Satz; „jetzt“ der Gruppe = b.kw.
//   Fühler (struktur bereiche[].sensoren[] art fuehler): name, entity_id, batterie, batterie_stufe (wie heute);
//     Temperatur = b.t; NEU feuchte_entity (HA-Zustand, wie die Seite Zustände schon liest) und Messalter: last_reported des
//     HA-Zustands, nur als „vor … min“ formatiert; „veraltet“ (rot) entscheidet die Integration (NEU sensoren[].veraltet bzw. die
//     vorhandene Warnung). Signal aus geraete_links[eid].signal (wie heute).
//   Türen/Fenster: sensoren[] art tuer/fenster (Zustand offen/zu/gekippt wie heute aus HA bzw. symbol.fenster[].zustand),
//     batterie, batterie_stufe; Ort „Front/Seite“ und Kontakte OHNE Sensor aus symbol.tueren/fenster (sensor null) – nur Anzeige.
//     Tür-Pause-Satz wie heute aus e.tuer_pause.
//   Sonstiges: b.geraete mit rolle steckdose/trockner/licht.
//   Bearbeiten: lernen.an, trocknen (wie heute, Dienst lernen/trocknen); logik/eingestellt.py: ziel der Chips lernen/trocknen
//     → bearbeiten:lernen / bearbeiten:trocknen.
//
// ===== AN-0023 (Auswertung, Kachel „Hochrechnung Heizperiode“ in L): „nicht dieses Diagramm, das sagt sehr wenig aus, sondern
// das, das kommt, wenn ich reinklicke, mit den Linien.“ Heute: Balken bisher/mit/ohne (alt.js kkDaten 'b-hoch', dia: balken).
// Neu: das Liniendiagramm der Karte Heizperiode (heizperiode.js diagramm, seit 0.8.158: Achse folgt tatsächlich/mit/Spanne,
// „ohne“ am oberen Rand abgeschnitten mit ↑ und Endwert) in voller Kachelbreite.
//   1  volle Linien: Achse, Monate, heute, Spanne; Legende darunter mit €-Werten (tatsächlich · mit · ohne), Zeile: Spanne · gespart
//   2  kompakt: ohne Achsenzahlen, € direkt am Linienende (heute, Ende Prognose, ↑ ohne), Legende eine Zeile ohne Werte
//   heute  Balken zum Vergleich
// DATEN: A.hochrechnung (unverändert): reihe [Tag, tatsächlich, mit, unten, oben, ohne] (kWh aufsummiert), bisher_eur, mit_eur,
//   unten_eur, oben_eur, ohne_eur, ohne_kwh, gespart_eur, ohne_hinweis. Die Seite rechnet nur Pixel. Im Bau: diagramm() aus
//   heizperiode.js exportieren und mit Breite/„kompakt“ aufrufen statt sie zu kopieren (eine Zeichenfunktion).
const rahmen = require('./rahmen');

/* Läuft nur im Browser (als Text eingesetzt, Node führt es nie aus) */
function browser(R) {
  const { html, nothing } = R;
  const BID = 'polier';
  const G = window.CU = { v: 'a', hoch: '1', lage: 'polier', ansicht: 'container', an: {}, lern: true, trock: true };
  const de = (v, k = 1) => Number(v).toLocaleString('de-AT', { minimumFractionDigits: k, maximumFractionDigits: k });
  const ist = v => typeof v === 'number' && isFinite(v);

  /* ---------- Beispieldaten je Lage (Form wie von der Integration bzw. HA) ---------- */
  const HK = [
    { id: 'polier_r1', ic: '♨', n: '001-01_C_HZ_POL_Radiator01', typ: 'Ölradiator', nenn_kw: 2.0, an: true, kwJetzt: 1.98, erreichbar: true, status: 'aktiv',
      rolle: 'primaer', rolle_t: '★ Primär', rolle_satz: 'heizt zuerst', sig: -58 },
    { id: 'polier_r2', ic: '♨', n: '001-02_C_HZ_POL_Radiator01', typ: 'Ölradiator', nenn_kw: 2.0, an: false, kwJetzt: 0, erreichbar: true, status: 'aktiv',
      rolle: 'zusatz', rolle_t: '🔥 Zusatz', rolle_satz: 'wartet – einer reicht', sig: -66 },
  ];
  const FU = { eid: 'sensor.polier_temperatur', ic: '🌡', n: '001_C_TEMP_POL', name: 'Fühler', t: 19.3, feuchte: 54, bat: 100, stufe: null, alter: 'vor 2 min', sig: -61 };
  const TUER = { eid: 'binary_sensor.tuer_polier', art: 'tuer', ic: '🚪', n: '001_C_DOOR_POL_Tuer', wo: 'Tür 1 · Front', zustand: 'zu', bat: 100, stufe: null, alter: 'vor 23 min', sig: -70 };
  const FEN = { eid: 'binary_sensor.polier_fenster', art: 'fenster', ic: '🪟', n: '001_C_WIN_POL_Fenster2', wo: 'Fenster 2 · Front', zustand: 'gekippt', bat: 80, stufe: null, alter: 'vor 1 h', sig: -74 };
  const LAGEN = {
    polier: { hk: HK, fu: [FU], kontakte: [TUER, FEN], ohne: [{ art: 'fenster', ic: '🪟', wo: 'Fenster 1 · Front' }, { art: 'fenster', ic: '🪟', wo: 'Fenster 3 · Seite' }], sonst: [], kw: 1.98 },
    ohnetuer: { hk: HK, fu: [FU], kontakte: [FEN], ohne: [{ art: 'tuer', ic: '🚪', wo: 'Tür 1 · Front', warn: 'kein Türkontakt – die Tür-Pause wirkt hier nicht' },
      { art: 'fenster', ic: '🪟', wo: 'Fenster 1 · Front' }, { art: 'fenster', ic: '🪟', wo: 'Fenster 3 · Seite' }],
      sonst: [{ id: 'polier_tr', ic: '💨', n: '001_C_TR_POL_Bautrockner', typ: 'Bautrockner', nenn_kw: 0.65, an: true, kwJetzt: 0.55, erreichbar: true, status: 'aktiv', sig: -63 }], kw: 2.53 },
    batterie: { hk: [HK[0], { ...HK[1], status: 'verliehen' }], fu: [{ ...FU, bat: 12, stufe: 'schwach', alter: 'vor 4 min', warn: 'Batterie 12 % – bald tauschen' }],
      kontakte: [TUER, { ...FEN, zustand: 'zu' }], ohne: [{ art: 'fenster', ic: '🪟', wo: 'Fenster 1 · Front' }, { art: 'fenster', ic: '🪟', wo: 'Fenster 3 · Seite' }], sonst: [], kw: 1.98 },
  };
  const L = () => LAGEN[G.lage];

  /* Beispiel-hass passend zur Lage (damit der Kopf dieselben Chips zeigt) */
  function schreiben() {
    const B = window.baustelleBeispiel, w = B && B.welt && B.welt[0]; if (!w) return;
    const b = w.bereiche.find(x => x.id === BID), c = w.laufzeit.container[BID];
    if (!G.orig) G.orig = { sensoren: JSON.parse(JSON.stringify(b.sensoren)), tueren: JSON.parse(JSON.stringify(c.symbol.tueren)), ein: JSON.parse(JSON.stringify(c.eingestellt || [])) };
    const S = JSON.parse(JSON.stringify(G.orig.sensoren));
    if (!S.some(s => s.entity_id === FEN.eid)) S.push({ art: 'fenster', entity_id: FEN.eid, nr: 2, name: 'Fenster 2', batterie: 80, batterie_stufe: null });
    for (const s of S) if (s.art === 'fuehler') { s.batterie = L().fu[0].bat; s.batterie_stufe = L().fu[0].stufe; }
    b.sensoren = G.lage === 'ohnetuer' ? S.filter(s => s.art !== 'tuer') : S;
    c.kw = L().kw; const lg = w.laufzeit.geraete || {};   // Kopf-Kachel „kW jetzt“ passend zur Geräte-Kachel (Radiator 2 wartet)
    if (lg.polier_r2) Object.assign(lg.polier_r2, { an: false, kw: 0 }); if (lg.polier_r1) Object.assign(lg.polier_r1, { an: true, kw: 1.98 });
    c.symbol.tueren = G.orig.tueren.map(t => ({ ...t, sensor_aktiv: G.lage === 'ohnetuer' ? null : t.sensor_aktiv }));
    c.eingestellt = G.orig.ein.filter(e => G.lage !== 'ohnetuer' || e.k !== 'tuer')
      .map(e => G.v !== 'heute' && (e.k === 'lernen' || e.k === 'trocknen') ? { ...e, ziel: `bearbeiten:${e.k}` } : e);   // Vorschlag logik/eingestellt.py
  }
  const neuLaden = () => { schreiben(); window.baustelleBeispiel.hassNeu(); return Promise.all(R.P().map(q => { q.cache = {}; return q._laden(); })); };

  /* ---------- Bausteine (nur Anzeige) ---------- */
  const sig = db => { if (!ist(db)) return nothing; const n = db >= -55 ? 4 : db >= -67 ? 3 : db >= -75 ? 2 : db >= -85 ? 1 : 0;
    return html`<span class="ger-sig s${n}" title="Signal ${db} dBm">${[1, 2, 3, 4].map(k => html`<i class=${k <= n ? 'an' : ''}></i>`)}</span>`; };
  const bat = x => ist(x.bat) ? html`<span class=${x.stufe === 'kritisch' ? 'rot-t' : x.stufe === 'schwach' ? 'amber-t' : 'leise'} title="Batterie">🔋 ${de(x.bat, 0)} %</span>` : nothing;
  const punkt = x => html`<i class="ger-punkt ${x.erreichbar === false ? 'weg' : 'da'}"></i>`;
  const ST = { inaktiv: 'inaktiv', verliehen: 'verliehen', defekt: 'defekt' };
  const anVon = g => g.id in G.an ? G.an[g.id] : g.an;
  const aktiv = g => g.status === 'aktiv';
  const handVon = g => g.id in G.an;
  const zustT = g => !aktiv(g) ? 'Automatik lässt es aus' : g.erreichbar === false ? 'nicht erreichbar' : anVon(g) ? `an · ${de(handVon(g) ? g.nenn_kw : g.kwJetzt, 2)} kW` : 'aus';
  const KZ = { zu: ['zu', ''], offen: ['offen', 'amber'], gekippt: ['gekippt', 'amber'] };
  const kz = z => { const [t, k] = KZ[z] || [z, '']; return html`<span class="cu-kz ${k}">${t}</span>`; };
  const p0 = () => R.P()[0];
  const geraet = (p, g) => p.b && p.b.geraete.some(x => x.id === g.id) ? p.geraetOeffnen(p.b.id, g.id) : p.toast && p.toast('Mockup: öffnet den Gerätedialog');
  const sensor = (p, x) => x.eid ? p.sensorOeffnen(p.b.id, x.eid) : undefined;
  const power = (p, g) => html`<button class="cu-pow ${anVon(g) && aktiv(g) ? 'an' : ''}" ?disabled=${!aktiv(g) || g.erreichbar === false}
      aria-label="${g.n} ${anVon(g) ? 'ausschalten' : 'einschalten'} (von Hand)" title="von Hand ${anVon(g) ? 'aus' : 'ein'}"
      @click=${e => { e.stopPropagation(); G.an = { ...G.an, [g.id]: !anVon(g) }; R.neuAlle(); }}>⏻</button>`;
  const hand = g => handVon(g) && aktiv(g) ? html`<span class="cu-hand">✋ von Hand · <button class="link" @click=${e => { e.stopPropagation(); const n = { ...G.an }; delete n[g.id]; G.an = n; R.neuAlle(); }}>Automatik übernehmen</button></span>` : nothing;
  const etikett = g => ST[g.status] ? html` <span class="g-st ${g.status}">${ST[g.status]}</span>` : nothing;

  /* Zeilen (A und C) */
  const zeileHK = (p, g, nr) => html`<div class="zeile ger cu-z ${aktiv(g) ? '' : 'cu-inaktiv'} ${anVon(g) && aktiv(g) ? 'cu-an' : ''}" role="button" @click=${() => geraet(p, g)}>
      <span class="ger-ic">${nr ? html`<b class="cu-nr">${nr}</b>` : g.ic}${punkt(g)}</span>
      <div class="cu-mitte"><b class="cu-name">${g.n}${etikett(g)}</b><div class="leise">${g.typ} · ${de(g.nenn_kw, 1)} kW${g.rolle_t ? html` · <span class=${g.rolle === 'primaer' ? 'cu-prim' : ''}>${g.rolle_t}</span>` : nothing}${!anVon(g) && aktiv(g) && g.rolle === 'zusatz' ? html`<span class="cu-rs"> – ${g.rolle_satz}</span>` : nothing}</div>${hand(g)}</div>
      <span class="ger-z"><span class=${anVon(g) && aktiv(g) ? 'amber-t' : ''}>${zustT(g)}</span>${!anVon(g) && aktiv(g) && g.rolle_satz && g.rolle === 'zusatz' ? html`<span class="g-z2 leise cu-rs-r">${g.rolle_satz}</span>` : html`<span class="g-z2">${sig(g.sig)}</span>`}</span>
      ${power(p, g)}<span class="chev">›</span></div>`;
  const zeileFU = (p, x, nr) => html`<button class="zeile ger cu-z" @click=${() => sensor(p, x)}>
      <span class="ger-ic">${nr ? html`<b class="cu-nr">${nr}</b>` : x.ic}${punkt(x)}</span>
      <div class="cu-mitte"><b class="cu-name">${x.name} <span class="leise cu-eid">${x.n}</span></b><div class="leise"><span class="cu-lang">regelt das Soll · </span>gemessen ${x.alter}</div>${x.warn ? html`<div class="g-w warn">⚠ ${x.warn}</div>` : nothing}</div>
      <span class="ger-z"><b class="cu-temp">${de(x.t, 1)} °C</b><span class="g-z2"><span class="leise">💧 ${de(x.feuchte, 0)} %</span>${bat(x)}${sig(x.sig)}</span></span><span></span><span class="chev">›</span></button>`;
  const zeileKO = (p, x, nr) => html`<button class="zeile ger cu-z" @click=${() => sensor(p, x)}>
      <span class="ger-ic">${nr ? html`<b class="cu-nr">${nr}</b>` : x.ic}${punkt(x)}</span>
      <div class="cu-mitte"><b class="cu-name">${x.wo} <span class="leise cu-eid">${x.n}</span></b><div class="leise"><span class="cu-lang">${x.art === 'tuer' ? `offen: Heizung pausiert nach ${p.d.e.tuer_pause} min` : 'offen oder gekippt: Heizung pausiert'} · </span>${x.alter}</div></div>
      <span class="ger-z">${kz(x.zustand)}<span class="g-z2">${bat(x)}${sig(x.sig)}</span></span><span></span><span class="chev">›</span></button>`;
  const ohneZeilen = (p, O) => [O.filter(o => o.warn).map(o => html`<button class="zeile cu-ohne warn" @click=${() => { p.einblenden('bereich'); }}><span>${o.ic} <b>${o.wo}</b> · ${o.warn}</span><span class="blau">Kontakt zuordnen ›</span></button>`),
    O.some(o => !o.warn) ? html`<div class="zeile cu-ohne leise"><span>ohne Kontakt: ${O.filter(o => !o.warn).map(o => o.wo).join(' · ')}</span></div>` : nothing];
  const gruppe = (ic, t, rechts) => html`<div class="gruppe cu-gr"><span>${ic} ${t}</span>${rechts ? html`<span class="cu-gr-r">${rechts}</span>` : nothing}</div>`;
  const zahlen = () => { const X = L(), n = X.hk.length + X.fu.length + X.kontakte.length + X.sonst.length; return `${n} Geräte · alle erreichbar`; };
  const kopfK = p => html`<div class="block-kopf cu-kopf"><b>Geräte</b><span class="leise">${zahlen()}</span><button class="link blau cu-alle" @click=${() => p.einstGruppe('geraete')}>Alle Geräte ›</button></div>`;
  const fuss = html`<div class="leise cu-fuss">Zeile antippen: Zustand, Warnungen, Status (aktiv/verliehen/defekt) und Einstellungen · ⏻ schaltet von Hand, bis „Automatik übernehmen“.</div>`;
  const stufenSatz = p => { const s = p.b && p.b.stufen; return s && s.text ? s.text : 'zuerst der Primäre, der Zusatz bei Bedarf'; };

  /* ---------- A: eine Kachel mit Gruppen-Zeilen ---------- */
  const varA = p => { const X = L();
    return html`<div class="glas-panel liste cu-geraete cu-a">${kopfK(p)}
      ${gruppe('♨', `Heizen · ${X.hk.length} Heizkörper`, `jetzt ${de(X.kw, 2)} kW`)}${X.hk.map(g => zeileHK(p, g))}
      ${gruppe('🌡', 'Fühler')}${X.fu.map(x => zeileFU(p, x))}
      ${gruppe('🚪', 'Türen und Fenster')}${X.kontakte.map(x => zeileKO(p, x))}${ohneZeilen(p, X.ohne)}
      ${X.sonst.length ? html`${gruppe('🔌', 'Sonstiges')}${X.sonst.map(g => zeileHK(p, g))}` : nothing}
      ${fuss}</div>`; };

  /* ---------- B: Kacheln je Gerätart ---------- */
  const miniHK = (p, g) => html`<div class="cu-mhk ${aktiv(g) ? '' : 'cu-inaktiv'}" role="button" @click=${() => geraet(p, g)}>
      <div class="cu-mitte"><b class="cu-name">${g.n}${etikett(g)}</b><div class="leise">${g.typ} · ${de(g.nenn_kw, 1)} kW${g.rolle_t ? ` · ${g.rolle_t}` : ''}</div>
        <div class=${anVon(g) && aktiv(g) ? 'amber-t cu-mz' : 'cu-mz'}>${zustT(g)}${!anVon(g) && aktiv(g) && g.rolle === 'zusatz' ? html` <span class="leise">· ${g.rolle_satz}</span>` : nothing}</div>${hand(g)}</div>${power(p, g)}</div>`;
  const varB = p => { const X = L(), f = X.fu[0];
    return html`<div class="cu-geraete cu-b"><div class="cu-b-titel"><b>Geräte</b><span class="leise">${zahlen()}</span><button class="link blau cu-alle" @click=${() => p.einstGruppe('geraete')}>Alle Geräte ›</button></div>
      <div class="cu-kacheln">
        <div class="glas-panel cu-k cu-k-heiz"><div class="cu-k-t">♨ Heizen</div><div class="cu-k-gross">${de(X.kw, 2)}<small> kW jetzt</small></div>
          <div class="leise cu-k-satz">${stufenSatz(p)}</div>${X.hk.map(g => miniHK(p, g))}</div>
        <button class="glas-panel cu-k cu-k-fu" @click=${() => sensor(p, f)}><div class="cu-k-t">🌡 Fühler</div><div class="cu-k-gross">${de(f.t, 1)}<small> °C</small></div>
          <div class="cu-k-z">💧 ${de(f.feuchte, 0)} % Feuchte</div><div class="cu-k-fuss">${bat(f)}${sig(f.sig)}<span class="leise">${f.alter}</span></div>${f.warn ? html`<div class="g-w warn">⚠ ${f.warn}</div>` : nothing}</button>
        <div class="glas-panel cu-k cu-k-ko"><div class="cu-k-t">🚪 Türen & Fenster</div>
          ${X.kontakte.map(x => html`<button class="cu-ko" @click=${() => sensor(p, x)}><span>${x.ic} ${x.wo}</span>${kz(x.zustand)}<span class="cu-k-fuss">${bat(x)}${sig(x.sig)}</span></button>`)}
          ${X.ohne.filter(o => o.warn).map(o => html`<button class="cu-ko warn" @click=${() => p.einblenden('bereich')}><span>${o.ic} ${o.wo}</span><span class="amber-t">kein Kontakt</span><span class="blau cu-k-fuss">zuordnen ›</span></button>`)}
          ${X.ohne.some(o => !o.warn) ? html`<div class="leise cu-k-ohne">ohne Kontakt: ${X.ohne.filter(o => !o.warn).map(o => o.wo.split(' · ')[0]).join(', ')}</div>` : nothing}</div>
        ${X.sonst.length ? html`<div class="glas-panel cu-k cu-k-so"><div class="cu-k-t">🔌 Sonstiges</div>${X.sonst.map(g => miniHK(p, g))}</div>` : nothing}
      </div>${fuss}</div>`; };

  /* ---------- C: Grundriss + Liste ---------- */
  function grundriss(p) {   // nur Pixel: Wände aus symbol (front unten, seite rechts), Heizkörper an der Rückwand in Reihenfolge
    const X = L(), sym = (p.b && p.b.symbol) || { tueren: [], fenster: [], doppel: false }, W = 240, H = sym.doppel ? 150 : 96, x0 = 10, y0 = 18;
    const nr = []; let n = 0;
    const hk = X.hk.map((g, i) => { n++; nr.push(n); const x = x0 + (i + 1) / (X.hk.length + 1) * W; const an = anVon(g) && aktiv(g);
      return `<rect class="gr-hk ${an ? 'an' : ''} ${aktiv(g) ? '' : 'inaktiv'}" x="${x - 22}" y="${y0 + 4}" width="44" height="10" rx="3"/><circle class="gr-nr" cx="${x}" cy="${y0 + 26}" r="8"/><text class="gr-nt" x="${x}" y="${y0 + 29}">${n}</text>`; }).join('');
    n++; const fn = n;
    const fu = `<circle class="gr-fu" cx="${x0 + 14}" cy="${y0 + H / 2}" r="5"/><circle class="gr-nr" cx="${x0 + 32}" cy="${y0 + H / 2}" r="8"/><text class="gr-nt" x="${x0 + 32}" y="${y0 + H / 2 + 3}">${fn}</text><text class="gr-t" x="${x0 + 44}" y="${y0 + H / 2 + 3}">${de(X.fu[0].t, 1)} °C</text>`;
    const kontaktNr = {}; for (const k of X.kontakte) { n++; kontaktNr[k.eid] = n; }
    const zust = eid => (X.kontakte.find(k => k.eid === eid) || {}).zustand;
    const wand = (o, i, art) => {
      const front = o.wand !== 'seite', len = art === 'tuer' ? 30 : 34, mit = art === 'tuer' ? (G.lage === 'ohnetuer' ? null : TUER.eid) : (o.sensor ? FEN.eid : null);
      const z = mit && zust(mit), auf = z && z !== 'zu', kn = mit && kontaktNr[mit];
      const cx = front ? x0 + o.pos * W : x0 + W, cy = front ? y0 + H : y0 + o.pos * H;
      const seg = front ? `M${cx - len / 2},${cy} L${cx + len / 2},${cy}` : `M${cx},${cy - len / 2} L${cx},${cy + len / 2}`;
      const lx = front ? cx : cx + 14, ly = front ? cy + 16 : cy + 3;
      return `<path class="gr-${art} ${auf ? 'auf' : ''} ${mit ? '' : 'ohne'}" d="${seg}"/>${kn ? `<circle class="gr-nr" cx="${lx}" cy="${ly - 3}" r="8"/><text class="gr-nt" x="${lx}" y="${ly}">${kn}</text>` : `<text class="gr-t gr-oh" x="${lx}" y="${ly}">${art === 'tuer' ? 'Tür' : 'F'}${art === 'tuer' && !mit ? ' ⚠' : ''}</text>`}`; };
    const tueren = (sym.tueren || []).map((o, i) => wand(o, i, 'tuer')).join(''), fenster = (sym.fenster || []).map((o, i) => wand(o, i, 'fenster')).join('');
    const naht = sym.doppel ? `<line class="gr-naht" x1="${x0}" y1="${y0 + H / 2}" x2="${x0 + W}" y2="${y0 + H / 2}"/>` : '';
    return { svg: R.svg(`<svg class="cu-grundriss" viewBox="0 0 ${W + 40} ${H + 44}"><text class="gr-t" x="${x0}" y="11">Rückwand</text><rect class="gr-raum" x="${x0}" y="${y0}" width="${W}" height="${H}" rx="4"/>${naht}${hk}${fu}${tueren}${fenster}<text class="gr-t" x="${x0 + W / 2}" y="${y0 + H + 38}" text-anchor="middle">Front</text></svg>`),
      nr: { hk: nr, fu: fn, ko: kontaktNr } };
  }
  const varC = p => { const X = L(), g = grundriss(p);
    return html`<div class="glas-panel liste cu-geraete cu-c">${kopfK(p)}
      <div class="cu-c-in"><div class="cu-plan">${g.svg}<div class="leise cu-plan-t">von oben · Türen und Fenster wie im 🏠 Aussehen · amber = an bzw. offen</div></div>
        <div class="cu-c-liste">${X.hk.map((h, i) => zeileHK(p, h, g.nr.hk[i]))}${X.fu.map(x => zeileFU(p, x, g.nr.fu))}${X.kontakte.map(x => zeileKO(p, x, g.nr.ko[x.eid]))}${ohneZeilen(p, X.ohne)}
          ${X.sonst.map(h => zeileHK(p, h))}</div></div>${fuss}</div>`; };

  /* ---------- Unteren Teil der Container-Ansicht ersetzen (ab „Geräte“ bis Ende) ---------- */
  const SCHNITT = '<div class="glas-panel block"><div class="block-kopf"><b>Geräte</b>', CACHE = new WeakMap();
  const BAND = { a: 'Vorschlag AN-0018 · A: eine Kachel mit Gruppen', b: 'Vorschlag AN-0018 · B: Kacheln je Gerätart', c: 'Vorschlag AN-0018 · C: Grundriss + Liste' };
  R.vorlage({ merkmal: 'class="glas-panel liste c-einst"', wann: p => p.s.view === 'container' && p.b && p.b.id === BID,
    fn: (t, p) => {
      if (G.v === 'heute') return undefined;
      const k = t.strings.findIndex(s => s.includes(SCHNITT)); if (k < 0) throw new Error('container.js: Block „Geräte“ nicht gefunden');
      let S = CACHE.get(t.strings);
      if (!S) { S = [...t.strings.slice(0, k), t.strings[k].split(SCHNITT)[0], '']; Object.defineProperty(S, 'raw', { value: S }); CACHE.set(t.strings, S); }
      const neu = html`<div class="cu-band">${R.band(BAND[G.v])}${R.marke}</div>${G.v === 'b' ? varB(p) : G.v === 'c' ? varC(p) : varA(p)}`;
      return { ...t, strings: S, values: [...t.values.slice(0, k), neu] };
    } });
  // „heute“: Band vor dem alten Block
  R.vorlage({ merkmal: '<b>Geräte</b><span class="leise">⏻ = Handbetrieb', wann: p => G.v === 'heute' && p.s.view === 'container', fn: t => html`<div class="cu-band">${R.band('heute (0.8.160) zum Vergleich')}</div>${t}` });

  /* Bearbeiten: Lernen und Trocknen als Zeilen (nach „Nur bei Bedarf heizen“) */
  const sw = (on, fn) => html`<button class="sw ${on ? 'on' : ''}" role="switch" aria-checked=${!!on} @click=${fn}><i></i></button>`;
  R.vorlage({ merkmal: 'data-zeile="bedarf"', wann: p => G.v !== 'heute' && p.b && p.b.id === BID, fn: (t, p) => html`${t}
    <div class="zeile cu-neu" data-zeile="lernen"><div><b>🧠 Lernende Regelung ${R.marke}</b><div class="leise">lernt, wie schnell der Raum warm wird und wie viel er nachwärmt, und heizt so früh, dass das Soll rechtzeitig da ist (nur Thermostat/Bei Bedarf) · <button class="link blau" @click=${() => p.einblenden('lernen')}>Lernstand ›</button></div></div>${sw(G.lern, () => { G.lern = !G.lern; R.neuAlle(); })}</div>
    <div class="zeile cu-neu" data-zeile="trocknen"><div><b>👕 Kleidung trocknen nach Regen ${R.marke}</b><div class="leise">nach Regen länger nach der Arbeit und früher am Morgen heizen (Werte unter Heizung › Regeln)</div></div>${sw(G.trock, () => { G.trock = !G.trock; R.neuAlle(); })}</div>` });

  /* ---------- AN-0023: Kachel b-hoch in L mit Linien ---------- */
  function linien(h, w, kompakt) {
    const Rh = h.reihe || []; if (Rh.length < 2) return '';
    const W = w, H = w < 300 ? 150 : 140, Lr = kompakt ? 8 : 34, Rr = kompakt ? (w < 300 ? 46 : 64) : 8, U = 18, n = Rh.length;
    const max = Math.max(...Rh.map(r => Math.max(r[1] || 0, r[2] || 0, r[4] || 0)), 1) * 1.05;
    const raus = Rh.findIndex(r => r[5] !== null && r[5] > max), O = raus >= 0 ? 22 : 10;
    const x = i => Lr + i / (n - 1) * (W - Lr - Rr), y = v => H - U - v / max * (H - U - O);
    const heute = Math.max(0, Rh.findLastIndex(r => r[1] !== null)), mwh = max > 4000;
    const pfad = (k, von, bis) => Rh.slice(von, bis + 1).map((r, j) => r[k] === null ? '' : `${j ? 'L' : 'M'}${x(von + j).toFixed(1)},${y(r[k]).toFixed(1)}`).join(' ');
    const band = Rh[n - 1][3] !== null ? `M${x(heute).toFixed(1)},${y(Rh[heute][3]).toFixed(1)} ${Rh.slice(heute).map((r, j) => `L${x(heute + j).toFixed(1)},${y(r[4]).toFixed(1)}`).join(' ')} ${Rh.slice(heute).reverse().map((r, j) => `L${x(n - 1 - j).toFixed(1)},${y(r[3]).toFixed(1)}`).join(' ')} Z` : '';
    const MON = ['Jän', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'];
    const monate = Rh.map((r, i) => [r[0], i]).filter(([t]) => t.endsWith('-01')).filter((_, j) => !kompakt || w > 400 || j % 2 === 0);
    const stufen = kompakt ? [0] : [0, 0.25, 0.5, 0.75, 1].map(f => max / 1.05 * f);
    const eur = v => ist(v) ? `${de(v, 0)} €` : '';
    let pfeil = '';
    if (raus >= 0) { const a = Rh[raus - 1], xe = raus && a[5] !== null ? x(raus - 1 + (max - a[5]) / (Rh[raus][5] - a[5])) : x(raus);
      const t = kompakt ? `ohne ${eur(h.ohne_eur)}` : `ohne ${mwh ? `${de((h.ohne_kwh || Rh[n - 1][5]) / 1000, 0)} MWh` : `${de(h.ohne_kwh || Rh[n - 1][5], 0)} kWh`}`;
      pfeil = `<text class="hp-pfeil" x="${xe.toFixed(1)}" y="${O - 2}">↑</text><text class="hp-raus" x="${(xe + 6).toFixed(1)}" y="${O - 4}">${t}</text>`; }
    const ende = kompakt ? `<circle class="cu-pt ist" cx="${x(heute)}" cy="${y(Rh[heute][1])}" r="3.5"/><text class="cu-wert ist" x="${x(heute) - 5}" y="${y(Rh[heute][1]) - 7}" text-anchor="end">${eur(h.bisher_eur)}</text>
      <circle class="cu-pt prog" cx="${x(n - 1)}" cy="${y(Rh[n - 1][2])}" r="3.5"/><text class="cu-wert prog" x="${x(n - 1) + 6}" y="${y(Rh[n - 1][2]) + 4}">≈ ${eur(h.mit_eur)}</text>` : '';
    return `<svg class="hp-dia cu-hoch ${kompakt ? 'kompakt' : ''}" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet">
      <defs><clipPath id="cu-feld-${W}${kompakt ? 'k' : ''}"><rect x="${Lr}" y="${O}" width="${W - Lr - Rr}" height="${H - U - O}"/></clipPath></defs>
      ${stufen.map(v => `<line class="hp-gitter" x1="${Lr}" y1="${y(v)}" x2="${W - Rr}" y2="${y(v)}"/>${kompakt ? '' : `<text class="hp-yt" x="${Lr - 4}" y="${y(v) + 3}">${de(mwh ? v / 1000 : v, mwh && max < 21000 ? 1 : 0)}</text>`}`).join('')}
      ${kompakt ? '' : `<text class="hp-yt" x="${Lr - 4}" y="8">${mwh ? 'MWh' : 'kWh'}</text>`}
      ${monate.map(([t, i]) => `${kompakt ? '' : `<line class="hp-gitter" x1="${x(i)}" y1="${O}" x2="${x(i)}" y2="${H - U}"/>`}<text x="${x(i) + 3}" y="${H - 5}">${MON[+t.slice(5, 7) - 1]}</text>`).join('')}
      ${band ? `<path class="hp-band" d="${band}"/>` : ''}
      ${Rh[0][5] !== null ? `<path class="hp-ohne"${raus >= 0 ? ` clip-path="url(#cu-feld-${W}${kompakt ? 'k' : ''})"` : ''} d="${pfad(5, 0, n - 1)}"/>${pfeil}` : ''}
      <path class="hp-prog" d="${pfad(2, heute, n - 1)}"/>${heute ? `<path class="hp-ist" d="${pfad(1, 0, heute)}"/>` : ''}
      <line class="hp-heute" x1="${x(heute)}" y1="${O}" x2="${x(heute)}" y2="${H - U}"/><text class="hp-ht" x="${x(heute) + 3}" y="${O + 8}">heute</text>${ende}</svg>`;
  }
  const altKk = R.proto.kkDaten;
  R.proto.kkDaten = function (x, b, c) {
    const D = altKk.call(this, x, b, c);
    if (x.k !== 'b-hoch' || G.hoch === 'heute') return D;
    let h = (c.A && c.A.hochrechnung) || {}; const eur = v => ist(v) ? `${de(v, 0)} €` : '–';
    if (G.hd === 'hoch' && h.reihe) h = { ...h, reihe: h.reihe.map(r => [...r.slice(0, 5), r[5] === null ? null : r[5] * 4]), ohne_kwh: h.ohne_kwh * 4, ohne_eur: h.ohne_eur * 4, gespart_eur: h.ohne_eur * 4 - h.mit_eur };   // nur Beispieldaten
    const N = { ...D };
    if (G.hoch === '2') N.vgl = '';
    if (G.hoch === '1') N.vgl = `Spanne ${ist(h.unten_eur) ? `${de(h.unten_eur, 0)}–${eur(h.oben_eur)}` : '–'} · gespart ≈ ${eur(h.gespart_eur)}${h.ohne_hinweis ? ' (grob)' : ''}`;
    N.dia = (id, w = 320) => { const k = G.hoch === '2', kurz = w <= 320, svg = linien(h, kurz ? 210 : k ? 440 : 540, k);
      const leg = k ? `<div class="cu-leg"><span><i class="l-ist"></i>tatsächlich</span><span><i class="l-prog"></i>${kurz ? 'mit' : 'Prognose mit Automatik'}</span><span><i class="l-ohne"></i>${kurz ? 'ohne' : 'ohne Automatik'}</span></div>`
        : `<div class="cu-leg"><span><i class="l-ist"></i>tatsächlich <b>${eur(h.bisher_eur)}</b></span><span><i class="l-prog"></i>${kurz ? 'mit' : 'mit Automatik'} <b>${eur(h.mit_eur)}</b></span><span><i class="l-ohne"></i>ohne <b>${eur(h.ohne_eur)}</b></span></div>`;
      return `<div class="cu-dia">${svg}</div>${leg}`; };
    return N;
  };
  const BAND_H = { 1: 'Vorschlag AN-0023 · 1: volle Linien, Legende mit €', 2: 'Vorschlag AN-0023 · 2: kompakt, € am Linienende', heute: 'heute (0.8.160) · Balken' };
  R.abschnitt({ ansicht: 'auswertung', vor: () => html`<div class="cu-band">${R.band(BAND_H[G.hoch])}${G.hoch === 'heute' ? nothing : R.marke}</div>` });

  R.stil(`
.cu-band { display: flex; align-items: center; gap: 6px; margin: 14px 0 0; } .cu-band .r-band { margin: 0; }
.cu-geraete { margin-top: 8px; }
.cu-kopf { padding: 12px 16px 2px; gap: 8px; } .cu-kopf .leise { flex: 1; }
.cu-alle, .cu-b-titel .link { border: 0; background: none; font: inherit; font-size: 13px; cursor: pointer; padding: 0; white-space: nowrap; }
.cu-gr { display: flex; justify-content: space-between; gap: 8px; border-top: 1px solid rgba(127,127,127,.15); margin-top: 6px; padding-top: 10px; }
.cu-gr-r { text-transform: none; letter-spacing: 0; font-size: 12px; color: var(--amber); }
.zeile.ger.cu-z { grid-template-columns: 28px minmax(0, 1fr) auto 36px 14px; text-align: left; border: 0; background: none; font: inherit; color: inherit; cursor: pointer; }
.cu-mitte { min-width: 0; } .cu-name { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 14px; }
.cu-eid { font-weight: 400; font-size: 11px; }
.cu-temp { font-size: 17px; }
.cu-prim { color: var(--amber); }
.cu-inaktiv { opacity: .55; }
.cu-hand { display: block; font-size: 12px; color: var(--amber); } .cu-hand .link { border: 0; background: none; padding: 0; font: inherit; color: var(--blau); cursor: pointer; }
.cu-pow { width: 34px; height: 34px; border-radius: 50%; border: 1px solid var(--panel-rand, rgba(127,127,127,.3)); background: rgba(127,127,127,.12); color: var(--ink2); font-size: 16px; cursor: pointer; padding: 0; }
.cu-pow.an { background: var(--amber); color: #fff; border-color: transparent; box-shadow: 0 0 10px rgba(255,159,10,.45); }
.cu-pow:disabled { opacity: .35; cursor: not-allowed; }
.cu-kz { font-size: 13px; font-weight: 600; padding: 1px 8px; border-radius: 8px; background: rgba(127,127,127,.18); } .cu-kz.amber { background: color-mix(in srgb, var(--amber) 25%, transparent); color: var(--amber); }
.cu-ohne { min-height: 32px; font-size: 13px; border: 0; background: none; font: inherit; color: inherit; text-align: left; flex-wrap: wrap; } .cu-ohne.warn { color: var(--amber); cursor: pointer; } .cu-ohne.leise { font-size: 12px; }
.cu-fuss { padding: 8px 16px 12px; border-top: 1px solid rgba(127,127,127,.15); margin-top: 4px; }
.g-w.warn { color: var(--amber); font-size: 12px; }
.cu-nr { display: inline-flex; width: 20px; height: 20px; border-radius: 50%; align-items: center; justify-content: center; font-size: 12px; background: rgba(127,127,127,.25); }
/* B */
.cu-b-titel { display: flex; align-items: baseline; gap: 8px; margin: 2px 4px 8px; } .cu-b-titel .leise { flex: 1; }
.cu-kacheln { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 10px; }
.cu-k { padding: 12px 14px; border-radius: 18px; display: flex; flex-direction: column; gap: 6px; text-align: left; font: inherit; color: inherit; min-width: 0; }
button.cu-k { cursor: pointer; }
.cu-k-heiz { grid-column: span 2; } .cu-k-so { grid-column: span 2; }
.cu-k-t { font-size: 11px; letter-spacing: 1px; text-transform: uppercase; color: var(--ink2); }
.cu-k-gross { font-size: 28px; font-weight: 600; line-height: 1.1; } .cu-k-gross small { font-size: 13px; font-weight: 400; color: var(--ink2); }
.cu-k-satz { margin-top: -2px; }
.cu-k-fuss { display: flex; gap: 8px; align-items: center; font-size: 12px; flex-wrap: wrap; }
.cu-mhk { display: flex; align-items: center; gap: 10px; padding: 8px 0 2px; border-top: 1px solid rgba(127,127,127,.15); cursor: pointer; } .cu-mhk .cu-mitte { flex: 1; }
.cu-mz { font-size: 13px; }
.cu-ko { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 2px 8px; align-items: center; border: 0; border-top: 1px solid rgba(127,127,127,.15); background: none; font: inherit; color: inherit; text-align: left; padding: 7px 0 2px; cursor: pointer; font-size: 13px; }
.cu-ko > span:first-child { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; } .cu-ko .cu-k-fuss { grid-column: 1 / -1; }
.cu-k-ohne { font-size: 12px; }
/* C */
.cu-c-in { display: grid; grid-template-columns: minmax(220px, 300px) minmax(0, 1fr); gap: 4px 12px; align-items: start; padding: 6px 0 0 12px; }
.cu-plan { padding: 6px 0; } .cu-grundriss { width: 100%; height: auto; display: block; } .cu-plan-t { font-size: 11px; }
.cu-grundriss .gr-raum { fill: rgba(127,127,127,.08); stroke: var(--ink2); stroke-width: 2; }
.cu-grundriss .gr-naht { stroke: var(--ink2); stroke-dasharray: 3 3; opacity: .6; }
.cu-grundriss .gr-hk { fill: rgba(127,127,127,.35); } .cu-grundriss .gr-hk.an { fill: var(--amber); } .cu-grundriss .gr-hk.inaktiv { opacity: .4; }
.cu-grundriss .gr-fu { fill: var(--s1); }
.cu-grundriss .gr-nr { fill: rgba(127,127,127,.3); } .cu-grundriss .gr-nt { font-size: 10px; font-weight: 700; text-anchor: middle; fill: var(--ink); }
.cu-grundriss .gr-t { font-size: 10px; fill: var(--ink2); } .cu-grundriss .gr-oh { text-anchor: middle; }
.cu-grundriss path { stroke-width: 6; fill: none; } .cu-grundriss .gr-tuer { stroke: var(--ink); } .cu-grundriss .gr-fenster { stroke: var(--blau); }
.cu-grundriss .auf { stroke: var(--amber) !important; } .cu-grundriss .ohne { stroke-dasharray: 3 3; opacity: .6; }
.cu-c-liste .zeile { padding-left: 4px; }
.cu-rs { display: none; }
@container (max-width: 640px) {
  .cu-kacheln { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .cu-k-gross { font-size: 24px; }
  .cu-c-in { grid-template-columns: minmax(0, 1fr); padding: 4px 0 0; } .cu-plan { padding: 6px 16px; }
  .zeile.ger.cu-z { grid-template-columns: 24px minmax(0, 1fr) auto 34px 10px; gap: 2px 8px; padding: 8px 12px; }
  .cu-name { font-size: 13px; } .cu-eid, .cu-lang, .cu-rs-r { display: none; } .cu-rs { display: inline; }
  .cu-ko { grid-template-columns: minmax(0, 1fr); } .cu-ko > .cu-kz, .cu-ko > .amber-t { justify-self: start; }
}
/* AN-0023 */
.kk-dia:has(.cu-dia) { flex-direction: column; align-items: stretch; gap: 2px; }
.cu-dia { flex: 1 1 0; min-height: 0; display: flex; } .cu-dia .hp-dia { max-width: none; width: 100%; height: 100%; margin: 0; }
.cu-hoch .cu-wert { font-size: 11px !important; font-weight: 600; } .cu-hoch .cu-wert.ist { fill: var(--s3) !important; } .cu-hoch .cu-wert.prog { fill: var(--s1) !important; }
.cu-hoch .cu-pt.ist { fill: var(--s3); } .cu-hoch .cu-pt.prog { fill: var(--s1); }
.cu-leg { display: flex; flex-wrap: wrap; gap: 2px 14px; font-size: 12px; color: var(--ink2); } .cu-leg b { color: var(--ink); font-weight: 600; }
.cu-leg i { display: inline-block; width: 16px; height: 0; margin-right: 5px; vertical-align: middle; border-top: 3px solid; }
.cu-leg .l-ist { border-color: var(--s3); } .cu-leg .l-prog { border-color: var(--s1); border-top-style: dashed; } .cu-leg .l-ohne { border-color: var(--s2); border-top-style: dotted; }`);

  /* ---------- Vorführ-Leiste ---------- */
  R.vorfuehren(async w => {
    Object.assign(G, { v: w.variante, hoch: w.hoch, hd: w.hdaten, lage: w.lage, ansicht: w.ansicht, an: {} });
    if (!window.baustelleBeispiel || !window.baustelleBeispiel.welt) return;
    await neuLaden();
    for (const q of R.P()) {
      if (!q.d) continue; q.s.sheet = null; q.s.ck = null;
      if (w.ansicht === 'auswertung') {
        q.gehe('auswertung'); q.awVorlage('misch', false);
        q.s.awListe = [q.kkGross({ k: 'b-hoch', an: true }, 'L'), ...q.awAuswahl().filter(x => x.k !== 'b-hoch')];
      } else {
        q.containerOeffnen(BID);
        if (w.zeigen === 'kopf') q.s.ck = { id: BID, info: null, modus: false, ei: true };
      }
      q.neuZeichnen();
    }
  });
}

const V = [['a', 'A · eine Kachel mit Gruppen'], ['b', 'B · Kacheln je Gerätart'], ['c', 'C · Grundriss + Liste'], ['heute', 'heute (unverändert)']];
const HOCH = [['1', '1 · volle Linien'], ['2', '2 · kompakt'], ['heute', 'heute (Balken)']];
const ANSICHT = [['container', 'Container (AN-0018)'], ['auswertung', 'Auswertung (AN-0023)']];
const LAGE = [['polier', 'Poliercontainer'], ['ohnetuer', 'ohne Türsensor'], ['batterie', 'Fühler-Batterie schwach']];
const HDATEN = [['beispiel', 'Beispiel (ohne unter mit)'], ['hoch', 'ohne über der Achse (↑)']];
const ZEIGEN = [['unten', 'unten (Geräte)'], ['kopf', 'Kopf: ⚙ eingestellt auf']];
const faelle = [];
for (const v of ['a', 'b', 'c']) for (const l of ['polier', 'ohnetuer', 'batterie'])
  faelle.push({ name: `${v}-${l}`, werte: { ansicht: 'container', variante: v, lage: l, zeigen: 'unten', hoch: '1' }, scroll: '.cu-band' });
faelle.push({ name: 'heute-polier', werte: { ansicht: 'container', variante: 'heute', lage: 'polier', zeigen: 'unten', hoch: '1' }, scroll: '.cu-band' });
faelle.push({ name: 'a-kopf', werte: { ansicht: 'container', variante: 'a', lage: 'polier', zeigen: 'kopf', hoch: '1' } });
faelle.push({ name: 'a-bearbeiten', werte: { ansicht: 'container', variante: 'a', lage: 'polier', zeigen: 'unten', hoch: '1' }, klick: ['Bearbeiten'], scroll: '[data-zeile="lernen"]' });
for (const h of ['1', '2', 'heute']) for (const hd of ['beispiel', 'hoch']) faelle.push({ name: `hoch-${h}-${hd}`, werte: { ansicht: 'auswertung', variante: 'a', lage: 'polier', zeigen: 'unten', hoch: h, hdaten: hd } });
rahmen.bauen({ datei: 'container-unten.html', titel: 'Baustelle – Container unten und Hochrechnung L (Vorschlag)', leiste: 'AN-0018 Container unten · AN-0023 Hochrechnung L', browser, faelle,
  auswahl: [{ id: 'ansicht', t: 'Ansicht', optionen: ANSICHT }, { id: 'variante', t: 'Container', optionen: V }, { id: 'lage', t: 'Lage', optionen: LAGE },
    { id: 'zeigen', t: 'zeigen', optionen: ZEIGEN }, { id: 'hoch', t: 'Hochrechnung L', optionen: HOCH }, { id: 'hdaten', t: 'Daten', optionen: HDATEN }] });
