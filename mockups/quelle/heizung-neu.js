// Vorschlag „Heizung neu“ auf Basis des Master-Mockups (Reiter Heizung, Einblendungen „hz“). Drei Tickets von Herbert,
// 29.10.2026, je drei Varianten, in der Vorführ-Leiste je Thema unabhängig umschaltbar (+ „heute“ = Seite 0.8.160):
//   AN-0019  „Die ganze Liste ist zu lange, die Infos sollen alle erhalten bleiben, aber anders angeordnet, gruppiert, mit
//            Dropdowns usw.“ – Einblendung Heizung › Heute (Block „Heute · welche Regeln greifen“ + „Wann welche Heizung
//            heizt“, heizung.js heute()/wann()). Nichts fällt weg, nur die Anordnung ändert sich:
//     A  Gruppen zum Aufklappen: 🕖 Heizzeit heute · 🌦 Wetter · ⚡ Strom · 🏖 Frei & Feiertage · 🔥 Wann heizt was;
//        Kopf je Gruppe mit Kurzfassung und „n von m greifen“, „Wann heizt was“ je Container zugeklappt (eine Spur je
//        Container, ▾ zeigt die Heizkörper)
//     B  Segmente oben „Was greift | Wann heizt was“, darüber eine Zeile mit dem, was gerade greift; kompakte Zeilen
//        (Symbol · Regel · Kurzwert · ●), Antippen klappt den ganzen Satz auf
//     C  Übersicht-Karten (2 Spalten) mit Kurzwert und Punkt, „mehr ▾“ zeigt den Satz unter den Karten; „Wann heizt was“
//        als breite Karte mit einer Spur je Container, „alle Heizkörper ▾“
//   AN-0020  „Die Regelliste ist auch zu unübersichtlich. Designe es neu.“ – Heizung › Regeln (regelnInhalt, 5 Gruppen nach
//            Tagesablauf + „🧪 Baseline messen“ + „📐 Feste Regeln“). Bedienelemente bleiben die der Seite:
//     A  Schalter-Liste mit Gruppen: je Gruppe eine zugeklappte Zeile mit dem, was eingestellt ist (Chips), Antippen öffnet
//        die bisherigen Zeilen dieser Gruppe (eine Gruppe offen)
//     B  Karten mit der Wirkung in einem Satz: je Regel Name, Wert und ein Satz; Antippen öffnet darunter die Einstellung
//     C  Tabelle Regel | Wert | an – darunter klein „wirkt wann“; Antippen öffnet die Einstellung in der Zeile
//   FE-0034  (Wunschteil) Heizplan-Balken: eine Zeitachse für alle Spuren (Leiste: 04–22 oder 0–24 Uhr), alle Spuren gleich
//            lang, heute mit Balken, und Ausnahmen andersfarbig am Balken – überall: Diese Woche, Heute-Karte im Reiter,
//            Ausnahmen, „Wann welche Heizung heizt“ (je Container und Heizkörper). Farbe der Ausnahme: --s5 (Reihenfarbe
//            der Seite, weder Bernstein noch Blau, die schon belegt sind).
//     A  Ausnahme-Abschnitt in eigener Farbe (zusätzlich = voll, entfällt = blass) + Legende
//     B  Ausnahme gestreift und umrandet, Marke ✳ über dem Beginn; entfällt = gestrichelter Rahmen
//     C  Balken in den normalen Farben, dazu der Normalplan als gestrichelter Geisterbalken, in der Tageszeile Badge
//        „Ausnahme“ mit dem Unterschied („+1 h 30 min · normal 06:15–16:45“)
//   Der Fehler „heute fehlt der Balken, Spuren unterschiedlich lang“ wird getrennt behoben – hier haben alle Spuren dieselbe
//   Breite (Raster 48 px | Rest | 44 px, minmax(0, 1fr)) und heute hat seinen Balken.
// Baut mockups/heizung-neu.html: node mockups/quelle/heizung-neu.js   ·   Bilder: node mockups/quelle/heizung-neu.js --bilder <ordner>
//
// DATEN – die Seite rechnet nichts. Was die Varianten zusätzlich brauchen (im Mockup aus Arbeitszeit und Ausnahmen
// nachgebildet, Funktion ausnInfo unten):
//   FE-0034: laufzeit.plan_woche[].plan bzw. plan_ausnahmen[iso] je Tag zusätzlich
//     normal: { start, ende } | null        // Heizzeit laut Arbeitszeit ohne Ausnahme (Minuten), null = normal frei
//     ausnahme_teile: [[von, bis, 'mehr' | 'weniger']]   // Minuten, in denen der Plan wegen einer Ausnahme vom Normalplan
//                                           // abweicht (mehr = zusätzlich geheizt, weniger = entfällt); bei einem freien
//                                           // Ausnahmetag (plan null) steht das Feld am Eintrag von plan_woche
//     ausnahme_diff: '+1 h 30 min'          // Unterschied als Text für C (oder Minuten: ausnahme_diff_min: 90)
//   laufzeit.abschnitte[<container>][iso]: Abschnitte mit Art 'ausnahme' sind nicht nötig – die Seite legt die
//     ausnahme_teile des Tages über die Spur jedes Containers, der dem Plan folgt (nicht „Bei Bedarf“/Hand). Will man es je
//     Container genau (z. B. lernender Beginn), dann je Abschnitt ein viertes Feld: [von, bis, art, 'ausnahme'].
//   Achse: fest in der Seite (04–22 oder 0–24, Entscheidung offen), keine Daten nötig.
//   AN-0019: Heute-Regeln je Zeile zusätzlich kurz (Kurzwert für B/C, z. B. „es wird geheizt“, „+45 min bis 17:30“) und
//     gruppe ('zeit' | 'wetter' | 'strom' | 'frei') – heute baut die Seite die Sätze selbst (heute()), im Mockup wird der
//     Kurzwert aus dem Satz genommen (Teil nach „→“).
//   AN-0020: je Regel ein Satz „Wirkung“ und „wirkt wann“ – das sind feste Texte mit Einstellungswerten, keine Rechnung;
//     sie können in der Seite stehen (tabellen.js) wie heute die Erklärungen. Keine neuen Felder der Integration.
const rahmen = require('./rahmen');

/* Läuft nur im Browser (als Text eingesetzt, Node führt es nie aus) */
function browser(R) {
  const { html, nothing } = R;
  const G = window.HZN = { an19: 'a', an20: 'a', fe34: 'a', achse: '4-22', auf19: { zeit: true }, offenC: new Set(), aufAlle: false, seg19: 'regeln', r19: null, auf20: null, r20: null };
  const TAGE = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];
  const z2 = n => String(n).padStart(2, '0');
  const uhr = m => `${z2(Math.floor(m / 60))}:${z2(Math.round(m % 60))}`;
  const minu = s => +s.slice(0, 2) * 60 + +s.slice(3, 5);
  const de = (x, n = 1) => Number(x).toLocaleString('de-AT', { maximumFractionDigits: n });
  const grad = v => `${de(v, 1)} °C`, minus = v => `${de(v, 0).replace('-', '−')} °C`;
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const dauerT = m => { m = Math.round(Math.abs(m)); const h = Math.floor(m / 60), r = m % 60; return [h ? `${h} h` : '', r ? `${r} min` : ''].filter(Boolean).join(' ') || '0 min'; };
  const roh = s => { const d = document.createElement('div'); d.style.display = 'contents'; d.innerHTML = s; return d; };
  const neu = () => R.neuAlle();
  const imHz = (p, k) => p.s.sheet && p.s.sheet.art === 'hz' && p.s.sheet.k === k;

  /* ================= FE-0034: Achse, Spur, Ausnahme ================= */
  const achse = () => G.achse === '0-24' ? [0, 1440] : [240, 1320];
  const X = m => { const [A, B] = achse(); return Math.max(0, Math.min(100, (m - A) / (B - A) * 100)); };
  const achseS = () => { const [A, B] = achse(), hs = []; for (let h = Math.ceil(A / 240) * 4; h * 60 <= B; h += 4) hs.push(h);
    return `<div class="hn-achse">${hs.map(h => { const x = X(h * 60); return `<span style="left:${x}%;${x <= 0 ? 'transform:none' : x >= 100 ? 'transform:translateX(-100%)' : ''}">${z2(h)}</span>`; }).join('')}</div>`; };

  // Steht für die neuen Felder der Integration (normal, ausnahme_teile, ausnahme_diff) – im Mockup aus Arbeitszeit + Ausnahmen
  function ausnInfo(p, iso) {
    const A = p.d.ausnahmen.filter(a => a.datum === iso); if (!A.length) return null;
    const pl = p.d.plan[iso], e = p.d.e, az = p.azJetzt, tag = TAGE[(new Date(iso + 'T12:00:00').getDay() + 6) % 7], zt = az && az.tage[tag];
    const normal = zt ? { a: minu(zt[0]), b: minu(zt[1]) } : null;
    if (normal) { normal.start = normal.a - e.vorheizen; normal.ende = normal.b + e.nachheizen; }
    const teile = [], P = pl ? [pl.a, pl.nach] : null, N = normal ? [normal.a, normal.ende] : null;
    if (P && !N) teile.push([pl.vor, pl.nach, 'mehr']);
    else if (P && N) { if (P[0] < N[0]) teile.push([P[0], N[0], 'mehr']); if (P[1] > N[1]) teile.push([N[1], P[1], 'mehr']);
      if (P[0] > N[0]) teile.push([N[0], P[0], 'weniger']); if (P[1] < N[1]) teile.push([P[1], N[1], 'weniger']); }
    else if (!P && N) teile.push([normal.start, normal.ende, 'weniger']);
    const diff = teile.reduce((s, t) => s + (t[2] === 'mehr' ? 1 : -1) * (t[1] - t[0]), 0);
    return { normal, teile, diff: `${diff >= 0 ? '+' : '−'}${dauerT(diff)}`, normalT: normal ? `normal ${uhr(normal.start)}–${uhr(normal.ende)}` : 'normal frei',
      text: A.map(a => a.notiz || ({ frei: 'frei', arbeit: 'zusätzlich arbeiten', zeiten: 'andere Zeiten' }[a.art] || a.art)).join(' · ') };
  }
  const planSeg = pl => pl ? [[pl.extra, pl.vor, 'tl-extra'], [pl.vor, pl.a, 'tl-vor'], [pl.a, pl.b, 'tl-heiz'], [pl.b, pl.nach, 'tl-vor'], [pl.nach, pl.ende, 'tl-trock'],
    ...(pl.eigene || []).map(f => [f[0], f[1], 'tl-eigen'])] : [];
  // Spur als Text (die Seite setzt Zeitstrahl und Heizplan als Text ein): seg = [[von, bis, klasse]]
  function spurS(p, iso, seg, o = {}) {
    const v = G.fe34, ai = iso && o.ausn !== false ? ausnInfo(p, iso) : null;
    const i = (a, b, c) => b > a ? `<i class="${c}" style="left:${X(a)}%;width:${X(b) - X(a)}%"></i>` : '';
    let ov = '', mk = '';
    if (ai && (v === 'a' || v === 'b')) ov = ai.teile.map(([a, b, k]) => i(a, b, `hn-ov hn-v${v} ${k}`)).join('');
    if (ai && v === 'b') mk = ai.teile.filter(t => t[2] === 'mehr').map(([a]) => `<b class="hn-mk" style="left:${X(a)}%">✳</b>`).join('');
    if (ai && v === 'c' && ai.normal) ov = i(ai.normal.start, ai.normal.ende, 'hn-geist');
    if (o.nurOv) return ov;
    const j = o.jetzt ? `<i class="tl-jetzt" style="left:${X(minu(p.z.JETZT))}%"></i>` : '';
    return `<div class="hn-w hn-f${v}${mk ? ' mit-mk' : ''}">${mk}<div class="tl-spur hn-spur ${o.cls || ''}">${seg.map(q => i(q[0], q[1], q[2])).join('')}${ov}${j}</div></div>`;
  }
  const legendeAusn = () => ({ a: '<span><i class="hn-l-a"></i>Ausnahme · zusätzlich</span><span><i class="hn-l-a2"></i>entfällt</span>',
    b: '<span><i class="hn-l-b"></i><b class="hn-mk-l">✳</b> Ausnahme</span><span><i class="hn-l-b2"></i>entfällt</span>',
    c: '<span><i class="hn-l-c"></i>normal laut Arbeitszeit</span><span><span class="badge hn-badge">Ausnahme</span></span>' }[G.fe34] || '');

  const P0 = R.proto, alt = { zeitstrahl: P0.zeitstrahl, planIso: P0.planIso, heizplan: P0.heizplanInhalt, hzAuf: P0.hzAuf };
  P0.planIso = function (iso) { const o = alt.planIso.call(this, iso); if (o) o.iso = iso; return o; };
  P0.zeitstrahl = function (pl, jetzt = false) { if (G.fe34 === 'heute') return alt.zeitstrahl.call(this, pl, jetzt); return spurS(this, pl && pl.iso, planSeg(pl), { jetzt }); };
  /* Diese Woche (heizplanInhalt): gleiche Spurbreite, heute mit Balken, Ausnahmen je Variante */
  P0.heizplanInhalt = function () {
    if (G.fe34 === 'heute') return alt.heizplan.call(this);
    const p = this, e = p.d.e, v = G.fe34;
    const zeilen = p.z.WOCHE.map(([t, d], k) => { const iso = p.z.WOCHE_ISO[k], pl = p.planIso(iso), h = t === p.z.HEUTE_TAG, ai = ausnInfo(p, iso);
      const gr = pl ? pl.gruende.map(g => /^Ausnahme/.test(g) ? (v === 'c' ? '' : `<span class="hn-at">${esc(g)}</span>`) : esc(g)).filter(Boolean).join(' · ') : (v === 'c' && ai ? '' : p.freiText(iso));
      const badge = v === 'c' && ai ? `<div class="hn-c-zeile"><span class="badge hn-badge">Ausnahme</span> <b>${esc(ai.diff)}</b> <span class="leise">${esc(ai.text)} · ${esc(ai.normalT)}</span></div>` : '';
      return `<div class="hn-hp-z ${h ? 'heute' : ''} ${ai ? 'ausn' : ''}"><div class="hp-tag"><b>${h ? 'heute' : t}</b><span>${d}</span></div>
        <div class="hp-mitte">${spurS(p, iso, planSeg(pl), { jetzt: h })}${badge}<div class="leise">${gr}</div></div>
        <div class="hp-zeit">${pl ? `${uhr(pl.extra)}<br>${uhr(pl.ende)}` : '–'}</div></div>`; }).join('');
    return `<div class="r-band">Vorschlag FE-0034 · ${{ a: 'A: Ausnahme in eigener Farbe', b: 'B: gestreift + Marke ✳', c: 'C: Badge + Normalplan als Geisterbalken' }[v]}</div>
      <div class="hp-legende"><span><i class="tl-extra"></i>Frühstart</span><span><i class="tl-eigen"></i>eigenes Zeitfenster</span><span><i class="tl-vor"></i>Vor- und Nachheizen ${e.vorheizen}/${e.nachheizen} min</span><span><i class="tl-heiz"></i>Arbeitszeit</span><span><i class="tl-trock"></i>Kleidung trocknen</span>${legendeAusn()}</div>
      <div class="hp">${zeilen}<div class="hn-hp-z achse"><div></div>${achseS()}<div></div></div></div>`;
  };
  // gemeinsame Achse statt der festen 04 … 20 (Heute-Karte, Wann heizt was, Ausnahmen)
  // ACHSE der Seite ist eine eigene Vorlage; in Ausnahmen steht die Achse im Text der Vorlage (dort den Text tauschen, Vorlage bleibt)
  const KACHE = new Map();
  R.vorlage({ merkmal: '<div class="tl-achse">', wann: () => G.fe34 !== 'heute', fn: t => {
    if (t.strings[0].startsWith('<div class="tl-achse">')) return roh(achseS());
    const k = G.achse, m = KACHE.get(t.strings) || {}; KACHE.set(t.strings, m);
    if (!m[k]) { const neuS = t.strings.map(x => x.replace(/<div class="tl-achse">(<span>\d+<\/span>)+<\/div>/, achseS())); m[k] = Object.assign(neuS, { raw: neuS }); }
    return { ...t, strings: m[k] }; } });
  // Wann heizt was der Seite (Variante „heute“ von AN-0019 und Kachel „Wann heizt was“): Spur auf die gemeinsame Achse + Ausnahme
  R.vorlage({ merkmal: 'class="tl-spur hz"', wann: () => G.fe34 !== 'heute', fn: (t, p) => {
    const alt = v => 240 + v / 100 * 1020, um = it => { if (!it || !Array.isArray(it.values)) return it; const v = [...it.values], n = v.length;
      if (it.strings.join('').includes('tl-jetzt')) v[n - 1] = X(alt(v[n - 1])); else { const l = alt(v[n - 2]), r = alt(v[n - 2] + v[n - 1]); v[n - 2] = X(l); v[n - 1] = X(r) - X(l); }
      return { ...it, values: v }; };
    const vals = t.values.map(v => Array.isArray(v) ? v.map(um) : um(v)), tag = p.s.hzTag || p.z.HEUTE_TAG, iso = p.z.WOCHE_ISO[TAGE.indexOf(tag)];
    const ov = vals.some(v => Array.isArray(v) && v.length) ? spurS(p, iso, [], { nurOv: true }) : '', n = vals.length - 2;   // Vorlage ist die ganze hz-zeile: [Name, Plan, an, offline, jetzt, Stunden]
    vals[n] = html`${vals[n]}${ov ? roh(ov) : nothing}`;
    return { ...t, values: vals };
  } });

  // Legende von Wann heizt was der Seite: Ausnahme dazu
  R.vorlage({ merkmal: '<i class="hz-an"></i>zieht Strom', wann: () => G.fe34 !== 'heute', fn: t => html`${t}${roh(`<div class="hp-legende hn-leg2">${legendeAusn()}</div>`)}` });

  /* ================= AN-0019: Heute · welche Regeln greifen + Wann heizt was ================= */
  const suche = (t, s, f) => { if (!t || typeof t !== 'object') return; if (Array.isArray(t)) return t.forEach(x => suche(x, s, f));
    if (Array.isArray(t.strings) && t.strings.some(x => x.includes(s))) f(t); if (Array.isArray(t.values)) t.values.forEach(x => suche(x, s, f)); };
  // Zeilen der Seite (heute()): hr-zeile = [an, ic, titel, text, ●] · Rechnung · lernende
  function regeln19(t) {
    const Z = [], L = []; let rechnung = null;
    suche(t, 'class="hr-zeile ', x => Z.push({ an: x.values[0] === 'an', ic: x.values[1], titel: x.values[2], text: x.values[3] }));
    suche(t, 'hz-rechnung', x => { rechnung = x.values[0]; });
    suche(t, '🧠 <b>', x => L.push({ name: x.values[0], text: x.values[1] }));
    const von = ic => Z.find(z => z.ic === ic);
    return { Z, rechnung, L, az: von('🕖'), grenze: von('🌡'), trocknen: von('🌧'), frueh: von('❄'), staffel: von('⚡'), frei: von('🏖') };
  }
  const kurz = z => { const s = String(z.text); if (s.includes('→')) return s.split('→').pop().trim(); if (/ · heizt /.test(s)) return 'heizt ' + s.split(' · heizt ').pop(); return s.split(' · ')[0]; };
  const NAME19 = { '🕖': 'Arbeitszeit', '🌡': 'Heizgrenze', '🌧': 'Kleidung trocknen', '❄': 'Frühstart morgen', '⚡': 'Staffelung', '🏖': 'Frei & Feiertage' };
  const gruppen19 = r => [
    { k: 'zeit', ic: '🕖', t: 'Heizzeit heute', Z: [r.az].filter(Boolean), kurz: r.az ? `${r.az.titel} · ${kurz(r.az)}` : '' },
    { k: 'wetter', ic: '🌦', t: 'Wetter', Z: [r.grenze, r.trocknen, r.frueh].filter(Boolean) },
    ...(r.staffel ? [{ k: 'strom', ic: '⚡', t: 'Strom', Z: [r.staffel], kurz: r.staffel.titel.replace('Staffelung: ', '') + ' laufen' }] : []),
    { k: 'frei', ic: '🏖', t: 'Frei & Feiertage', Z: [r.frei].filter(Boolean), kurz: r.frei ? (r.frei.an ? r.frei.titel : String(r.frei.text)) : '' },
  ].map(g => ({ ...g, n: g.Z.filter(z => z.an).length, kurz: g.kurz || (g.Z.filter(z => z.an).map(z => NAME19[z.ic]).join(' · ') || 'nichts nötig') }));
  const hrZeile = z => html`<div class="hr-zeile ${z.an ? 'an' : ''}"><span class="hr-ic">${z.ic}</span><div><b>${z.titel}</b><div class="leise">${z.text}</div></div><span class="hr-an">${z.an ? '●' : '○'}</span></div>`;
  const zusatz = (r, z) => z === r.az ? html`${r.rechnung ? html`<div class="zeile unter hz-rechnung"><span class="leise">${r.rechnung}</span></div>` : nothing}
    ${r.L.map(l => html`<div class="zeile unter"><span class="leise">🧠 <b>${l.name}</b>: ${l.text}</span></div>`)}` : nothing;

  /* Wann welche Heizung heizt – kompakt: eine Spur je Container, ▾ die Heizkörper (Woche: Tabelle der Seite) */
  function wann19(p, orig, o = {}) {
    const art = p.s.hzArt || 'tag', tag = p.s.hzTag || p.z.HEUTE_TAG, iso = p.z.WOCHE_ISO[TAGE.indexOf(tag)], C = p.d.bereiche.filter(b => !b.pumpe), HZ = b => b.geraete.filter(g => g.heizer);
    const tagNr = TAGE.indexOf(tag), heuteNr = TAGE.indexOf(p.z.HEUTE_TAG), zukunft = tagNr > heuteNr, h = tagNr === heuteNr, jetzt = minu(p.z.JETZT);
    const std = s => s.reduce((a, q) => a + (q[1] - q[0]), 0) / 60, setze = (a, t) => { if (t) p.s.hzTag = t; if (a) p.s.hzArt = a; p.neuZeichnen(); };
    const kopf = html`<div class="hn-wk">${o.titel === false ? nothing : html`<b>Wann welche Heizung heizt</b>`}<div class="seg klein">${[['tag', 'Tag'], ['woche', 'Woche']].map(([k, t]) => html`<button class=${art === k ? 'on' : ''} @click=${() => setze(k)}>${t}</button>`)}</div></div>`;
    if (p.mess === null) return html`${kopf}<div class="leer">Lädt …</div>`;
    if (art === 'woche') return html`${kopf}${orig || nothing}`;
    const spur = (plan, an, off, folgt) => roh(spurS(p, iso, [...plan.map(q => [q[0], q[1], `hz-plan ${!zukunft && (!h || q[1] <= jetzt) ? 'vorbei' : ''}`]), ...(zukunft ? [] : an.map(q => [q[0], q[1], 'hz-an'])), ...off.map(q => [q[0], q[1], 'hz-off'])], { jetzt: h, cls: 'hz', ausn: folgt && plan.length > 0 }));
    const alle = o.alle || G.aufAlle;
    return html`${kopf}<div class="vb-wer">${p.z.WOCHE.map(([t, dd]) => html`<button class=${t === tag ? 'on' : ''} @click=${() => setze(null, t)}>${t === p.z.HEUTE_TAG ? 'heute' : t} ${dd.slice(0, 2)}.</button>`)}</div>
      <div class="leise">${zukunft ? 'Noch nichts gemessen – blass der Plan.' : h ? 'Bis jetzt gemessen, danach blass der Plan.' : 'Gemessen an der Leistung: kräftig = zieht Strom (über 50 W).'}</div>
      <div class="hn-wc">${C.map(b => {
        if (!HZ(b).length) return html`<div class="hn-c ohne"><span class="hn-cn">${b.name}</span><button class="rv-link" @click=${() => p.containerOeffnen(b.id)}>noch kein Heizkörper · + zuordnen</button></div>`;
        const plan = p.heizzeiten(b, tag), ph = std(plan), A = HZ(b).map(g => ({ g, a: p.aktiv(b, g, tag) })), an = A.flatMap(x => x.a.an), off = A.flatMap(x => x.a.off);
        const geheizt = Math.max(0, ...A.map(x => std(x.a.an))), auf = alle || G.offenC.has(b.id), folgt = !b.bedarf && b.auto !== false;
        const um = () => { G.offenC.has(b.id) ? G.offenC.delete(b.id) : G.offenC.add(b.id); neu(); };
        return html`<div class="hn-c ${auf ? 'auf' : ''}"><button class="hn-ck" aria-expanded=${auf ? 'true' : 'false'} @click=${um}>
            <span class="hn-cn">${b.name}${b.bedarf ? html` <span class="leise">bei Bedarf</span>` : nothing}${b.offline ? html` <span class="rot-t">offline</span>` : nothing}</span>
            <span class="leise hn-cp">${ph ? `${de(ph)} h geplant` : b.bedarf ? 'kein Termin' : !b.auto ? 'Hand' : 'frei'}${zukunft ? '' : ` · ${de(geheizt)} h geheizt`}</span>
            <span class="hn-cz">${HZ(b).length} ${HZ(b).length === 1 ? 'Heizk.' : 'Heizk.'} ${auf ? '▴' : '▾'}</span></button>
          ${auf ? A.map(x => html`<div class="hn-hz"><span class="hn-g">${x.g.n}</span>${spur(plan, x.a.an, x.a.off, folgt)}<span class="hn-h">${zukunft ? '–' : `${de(std(x.a.an))} h`}</span></div>`)
            : html`<div class="hn-hz eins">${spur(plan, an, off, folgt)}</div>`}</div>`; })}
        <div class="hn-hz achse"><span></span>${roh(achseS())}<span></span></div></div>
      <div class="hp-legende"><span><i class="hz-an"></i>zieht Strom</span><span><i class="hz-plan"></i>geplant</span><span><i class="hz-off"></i>offline</span>${G.fe34 !== 'heute' ? roh(legendeAusn()) : nothing}<span class="leise">Lücken im Plan: Thermostat, Staffelung, Tür offen</span></div>`;
  }

  function heute19(p, r, orig) {
    const v = G.an19, Gs = gruppen19(r), band = R.band({ a: 'Vorschlag AN-0019 · A: Gruppen zum Aufklappen', b: 'Vorschlag AN-0019 · B: Segmente + kompakte Zeilen', c: 'Vorschlag AN-0019 · C: Übersicht-Karten' }[v]);
    if (v === 'a') {
      const gruppe = (k, ic, t, kurzT, n, m, inhalt) => { const auf = !!G.auf19[k];
        return html`<div class="hn-gr ${auf ? 'auf' : ''}"><button class="hn-gk" aria-expanded=${auf ? 'true' : 'false'} @click=${() => { G.auf19 = { ...G.auf19, [k]: !auf }; neu(); }}>
            <span class="hn-gic">${ic}</span><span class="hn-gt"><b>${t}</b><span class="leise">${kurzT}</span></span>
            ${m ? html`<span class="hn-zahl ${n ? '' : 'nein'}">${n} von ${m}</span>` : nothing}<span class="chev">${auf ? '⌃' : '⌄'}</span></button>
          ${auf ? html`<div class="hn-gi">${inhalt()}</div>` : nothing}</div>`; };
      const C = p.d.bereiche.filter(b => !b.pumpe && b.geraete.some(g => g.heizer));
      return html`<div class="block hz-innen">${band}<div class="block-kopf"><b>Heute</b><span class="leise">${Gs.reduce((s, g) => s + g.n, 0)} Regeln greifen</span></div>
        ${Gs.map(g => gruppe(g.k, g.ic, g.t, g.kurz, g.n, g.Z.length > 1 ? g.Z.length : 0, () => g.Z.map(z => html`${hrZeile(z)}${zusatz(r, z)}`)))}
        ${gruppe('wann', '🔥', 'Wann welche Heizung heizt', `${C.length} Container · ${C.reduce((s, b) => s + b.geraete.filter(g => g.heizer).length, 0)} Heizkörper – je Container aufklappen`, 0, 0, () => wann19(p, orig, { titel: false }))}</div>`;
    }
    if (v === 'b') {
      const greift = r.Z.filter(z => z.an);
      const zeile = (z, gk) => { const k = z.ic, auf = G.r19 === k;
        return html`<button class="hn-kz ${z.an ? 'an' : ''} ${auf ? 'auf' : ''}" aria-expanded=${auf ? 'true' : 'false'} @click=${() => { G.r19 = auf ? null : k; neu(); }}>
            <span class="hr-ic">${z.ic}</span><span class="hn-kt">${NAME19[z.ic]}</span><span class="hn-kw">${z.ic === '🕖' ? z.titel.replace('Arbeitszeit ', '') : kurz(z)}</span><span class="hr-an">${z.an ? '●' : '○'}</span></button>
          ${auf ? html`<div class="hn-kd"><b>${z.titel}</b><div class="leise">${z.text}</div>${zusatz(r, z)}</div>` : nothing}`; };
      return html`<div class="block hz-innen">${band}
        <div class="hn-greift">${greift.length ? html`<span class="leise">greift:</span>${greift.map(z => html`<span class="hz-chip">${z.ic} ${NAME19[z.ic]}</span>`)}` : html`<span class="leise">heute greift keine Regel</span>`}</div>
        <div class="seg hn-seg">${[['regeln', `Was greift · ${greift.length}`], ['wann', 'Wann heizt was']].map(([k, t]) => html`<button class=${G.seg19 === k ? 'on' : ''} @click=${() => { G.seg19 = k; neu(); }}>${t}</button>`)}</div>
        ${G.seg19 === 'regeln' ? Gs.map(g => html`<div class="gruppe-t hn-gt2">${g.ic} ${g.t}</div>${g.Z.map(z => zeile(z, g.k))}`) : wann19(p, orig, { titel: false })}</div>`;
    }
    // C: Karten
    const karten = r.Z, sel = karten.find(z => z.ic === G.r19);
    return html`<div class="block hz-innen">${band}<div class="block-kopf"><b>Heute</b><span class="leise">tippen für den ganzen Satz</span></div>
      <div class="hn-karten">${karten.map(z => { const auf = G.r19 === z.ic;
        return html`<button class="hn-karte ${z.an ? 'an' : ''} ${auf ? 'auf' : ''}" @click=${() => { G.r19 = auf ? null : z.ic; neu(); }}>
          <span class="hn-k1"><span>${z.ic}</span><span class="hr-an">${z.an ? '●' : '○'}</span></span><span class="hn-k2">${NAME19[z.ic]}</span>
          <b class="hn-k3">${z.ic === '🕖' ? z.titel.replace('Arbeitszeit ', '') : kurz(z)}</b><span class="hn-k4">${auf ? 'weniger ▴' : 'mehr ▾'}</span></button>`; })}</div>
      ${sel ? html`<div class="hn-kd glas-panel">${hrZeile(sel)}${zusatz(r, sel)}</div>` : nothing}
      <div class="hn-wkarte glas-panel">${wann19(p, orig, {})}
        <button class="hn-alle" @click=${() => { G.aufAlle = !G.aufAlle; neu(); }}>${G.aufAlle ? 'nur Container ▴' : 'alle Heizkörper ▾'}</button></div></div>`;
  }
  // Block „Heute“ der Seite: Zeilen merken, nichts zeigen; vom Block „Wann …“ die Woche merken und den Inhalt weglassen –
  // sein Kopf (die Vorlage mit dem Titel) zeigt dann beides in der neuen Anordnung
  const n19 = p => G.an19 !== 'heute' && imHz(p, 'heute');
  R.vorlage({ merkmal: '<b>Heute</b><span class="leise">welche Regeln greifen</span>', wann: n19, fn: (t, p) => { p._hn19 = regeln19(t); p._hnWoche = null; return nothing; } });
  R.vorlage({ merkmal: '<div class="hz-woche">', wann: n19, fn: (t, p) => { p._hnWoche = t; return nothing; } });
  R.vorlage({ merkmal: 'class="hz-tag"', wann: n19, fn: () => nothing });
  R.vorlage({ merkmal: '<b>Wann welche Heizung heizt</b>', wann: p => n19(p) && p._hn19, fn: (t, p) => heute19(p, p._hn19, p._hnWoche) });
  R.vorlage({ merkmal: '<b>Heute</b><span class="leise">welche Regeln greifen</span>', wann: p => G.an19 === 'heute' && imHz(p, 'heute'), fn: t => html`${R.band('AN-0019 · heute (0.8.160) zum Vergleich')}${t}` });

  /* ================= AN-0020: Regeln ================= */
  const KEYS = [['vorheizen', 'frueh', 'lernend', 'warm_vor', 'warm_max'], ['soll', 'toleranz', 'grenze', 'basis', 'boost', 'zusatz', 'tuer'], ['nachheizen', 'warm_nach', 'trocknen', 'hand'], ['frost', 'urlaub'], ['zieht', 'fuehler', 'staffel']];
  // [Symbol, Name, an (true/false, null = Wert), Wert, Wirkung in einem Satz, wirkt wann] – feste Texte mit Einstellungswerten
  const RM = (p, e) => { const lern = p.d.bereiche.filter(b => !b.pumpe && b.lern && b.lern.warm), zus = p.d.bereiche.filter(b => b.stufenAn);
    const nl = lern.length ? ' · nicht für lernende' : '';
    return {
      vorheizen: ['🌅', 'Vorheizen', null, `${e.vorheizen} min`, `Heizt jeden Arbeitstag ${e.vorheizen} min vor Arbeitsbeginn an, damit es warm ist, wenn es losgeht.`, 'vor der Arbeit' + nl],
      frueh: ['❄', 'Kälte-Frühstart', e.fruehstart, e.fruehstart ? `+${e.frueh_min} min` : 'aus', `Ist es morgens kälter als ${minus(e.frueh_temp)}, startet die Heizung zusätzlich ${e.frueh_min} min früher.`, 'an kalten Morgen' + nl],
      lernend: ['🧠', 'Lernende Container', null, lern.length ? `${lern.length} lernen` : 'keiner', `Container mit Fühler und lernender Regelung heizen selbst so früh, dass das Soll rechtzeitig erreicht ist – statt Vorheizen, Frühstart und Nachheizen.${lern.length ? ` Jetzt: ${lern.map(b => b.name).join(', ')}.` : ''}`, 'vor und nach der Arbeit'],
      warm_vor: ['⏱', 'Soll erreicht', null, e.warm_vor ? `${e.warm_vor} min vorher` : 'bei Beginn', 'Lernende Container sind so viel vor Arbeitsbeginn warm, z. B. zum Umziehen.', 'vor der Arbeit · lernende'],
      warm_max: ['⏱', 'Frühestens', null, `${e.warm_max} min vorher`, 'So früh startet ein lernender Container höchstens, auch wenn der Raum sehr kalt ist.', 'vor der Arbeit · lernende'],
      soll: ['🌡', 'Solltemperatur', null, e.soll_art === 'gleitend' ? `gleitend ab ${grad(e.gleit_min)}` : grad(e.soll), 'Container mit Fühler halten in der Arbeitszeit dieses Soll; ohne Fühler regelt der Heizkörperthermostat.', 'in der Arbeitszeit · mit Fühler'],
      toleranz: ['↕', 'Schaltabstand', null, `± ${de(e.toleranz, 1)} °C`, 'Thermostat: ein unter Soll − Abstand, aus über Soll + Abstand – damit nicht dauernd geschaltet wird.', 'in der Arbeitszeit · mit Fühler'],
      grenze: ['🌡', 'Heizgrenze', null, grad(e.grenze), `Ist es draußen wärmer als ${grad(e.grenze)}, wird nicht geheizt.`, 'an warmen Tagen'],
      basis: ['📏', 'Grundlage Heizgrenze', null, e.basis, `Die Heizgrenze vergleicht mit ${e.basis === 'jetzt' ? 'der Außentemperatur jetzt' : 'dem Höchstwert des Tages'}.`, 'an warmen Tagen'],
      boost: ['⚡', 'Schnell aufheizen', null, `${e.boost_min} min`, 'Knopf im Container: alle Heizkörper zugleich, mit Vorrang in der Staffelung – bis zum Soll, ohne Fühler so lange.', 'auf Knopfdruck'],
      zusatz: ['🔥', 'Zusatz-Heizkörper', zus.length > 0, zus.length ? `${zus.length} Container` : 'nirgends an', `Zuerst heizt einer; der Zusatz kommt dazu, wenn der Raum mehr als ${grad(e.stufen_abstand)} unter dem Soll ist, einer ${e.stufen_min} min nicht reicht oder es draußen unter ${minus(e.stufen_kalt)} hat.`, 'in der Arbeitszeit · ab 2 Heizkörpern'],
      tuer: ['🚪', 'Tür offen', null, `Pause nach ${e.tuer_pause} min`, `Ist die Tür offen, pausiert die Heizung nach ${e.tuer_pause} min; nach ${e.tuer_melden} min kommt eine Nachricht.`, 'immer · mit Türkontakt'],
      nachheizen: ['🌇', 'Nachheizen', null, `${e.nachheizen} min`, `Heizt nach Arbeitsende noch ${e.nachheizen} min weiter.`, 'nach der Arbeit' + nl],
      warm_nach: ['🌇', 'Warm halten', null, e.warm_nach ? `${e.warm_nach} min länger` : 'bis Ende', 'Lernende Container halten das Soll so lange nach Arbeitsende; Kleidung trocknen kommt dazu.', 'nach der Arbeit · lernende'],
      trocknen: ['👕', 'Kleidung trocknen', null, `+${e.tr_laenger} min`, `Nach Regen ab ${de(e.tr_mm, 1)} mm heizt es ${e.tr_laenger} min länger nach der Arbeit und am nächsten Morgen ${e.tr_frueher} min früher.`, 'nach Regen'],
      hand: ['✋', 'Handbetrieb übernehmen', null, `nach ${e.hand_nachfrist} min`, 'Läuft ein Heizkörper zu lange von Hand, kommt eine Nachricht; ohne „So lassen“ übernimmt die Automatik so viel später.', 'nach Handbetrieb'],
      frost: ['❄', 'Frostschutz', e.frost, e.frost ? `unter ${grad(e.frost_temp)}` : 'aus', `Hält jeden Container über ${grad(e.frost_temp)} (aus erst über ${grad(e.frost_aus)}), auch nachts und am Wochenende${e.frost_immer ? ' – auch bei Automatik aus' : ''}.`, 'außerhalb der Arbeitszeit'],
      urlaub: ['🏖', 'Urlaub & freie Feiertage', null, { frost: 'nur Frostschutz', absenk: `absenken ${grad(e.absenk)}`, aus: 'alles aus' }[e.urlaub], 'Was an Urlaubstagen und freien Feiertagen läuft (Kalender unter Urlaub & Feiertage).', 'an freien Tagen'],
      zieht: ['🔌', 'Heizt tatsächlich ab', null, `${e.zieht_w} W`, 'Ab dieser Leistung zählt ein Heizkörper als „heizt“ – für Heizzeit, Heiztage, Lernen und Wann heizt was.', 'immer · Messung'],
      fuehler: ['🌡', 'Fühler ohne Wert', null, `${e.fuehler_halten} min`, 'Meldet ein Fühler nichts, gilt sein letzter Wert noch so lange; danach regelt der Container wie ohne Fühler.', 'bei Ausfall eines Fühlers'],
      staffel: ['⚡', 'Staffelung', e.staffel, e.staffel ? `${e.nutzbar} % · max ${e.max_gleich}` : 'aus', e.staffel ? `Die Heizkörper teilen sich den Anschluss: ${e.nutzbar} % nutzbar, höchstens ${e.max_gleich} zugleich, mindestens ${e.min_lauf} min an, ${e.min_pause} min Pause.` : 'Alle Heizkörper dürfen zugleich.', 'immer · Strom'],
      baseline: ['🧪', 'Baseline messen', e.baseline, e.baseline ? `${de(e.baseline_eur, 0)} € / Monat` : 'aus', 'An freien Tagen heizt ein Container ohne Automatik, nur sein Thermostat regelt – so wird gemessen, was die Automatik spart.', 'an freien Tagen · Wochenende'],
    }; };
  // regelnInhalt der Seite: values = [Karte × 5, Baseline, feste Regeln, Erklärung]; Karte = [ic, titel, unter, Zeilen]
  function teile20(inner) {
    const v = inner.values, G5 = v.slice(0, 5).map((k, i) => ({ id: 'g' + i, ic: k.values[0], t: k.values[1], unter: k.values[2], rows: Object.fromEntries(KEYS[i].map((key, j) => [key, k.values[3][j]])), keys: KEYS[i].filter((key, j) => k.values[3][j] !== nothing) }));
    return { G5, baseline: v[5], fest: v[6], erkl: v[7] };
  }
  function regeln20(p, inner) {
    const { G5, baseline, fest, erkl } = teile20(inner), M = RM(p, p.d.e), v = G.an20;
    const band = R.band({ a: 'Vorschlag AN-0020 · A: Gruppen mit Zusammenfassung', b: 'Vorschlag AN-0020 · B: Karten mit Wirkung in einem Satz', c: 'Vorschlag AN-0020 · C: Tabelle' }[v]);
    const BL = baseline === nothing ? [] : [{ id: 'bl', ic: '🧪', t: 'Baseline messen', unter: 'Testläufe ohne Automatik', keys: ['baseline'], rows: { baseline } }];
    const Gr = [...G5, ...BL], festG = { id: 'fest', ic: '📐', t: 'Feste Regeln', unter: 'bewährte Schwellen, nicht änderbar' };
    const chips = g => g.keys.map(k => M[k]).filter(m => m[2] !== false).map((m, i) => html`${i ? ' · ' : ''}<span class="hn-sum">${m[1]} <b>${m[3]}</b></span>`);
    const aus = g => g.keys.map(k => M[k]).filter(m => m[2] === false);
    if (v === 'a') {
      const kopf = (g, inhalt) => { const auf = G.auf20 === g.id;
        return html`<div class="hn-gr ${auf ? 'auf' : ''}"><button class="hn-gk" aria-expanded=${auf ? 'true' : 'false'} @click=${() => { G.auf20 = auf ? null : g.id; neu(); }}>
            <span class="hn-gic">${g.ic}</span><span class="hn-gt"><b>${g.t} <span class="leise hn-unter">${g.unter}</span></b>
            ${inhalt ? html`<span class="hn-chips">${chips(g)}${aus(g).length ? html` · <span class="hn-sum aus">${aus(g).map(m => m[1]).join(', ')} aus</span>` : nothing}</span>` : html`<span class="leise">${FEST_N} feste Schwellen</span>`}</span>
            <span class="chev">${auf ? '⌃' : '⌄'}</span></button>
          ${auf ? html`<div class="hn-gi rv-karte">${inhalt ? g.keys.map(k => g.rows[k]) : fest}</div>` : nothing}</div>`; };
      return html`${band}${Gr.map(g => kopf(g, true))}${kopf(festG, false)}${erkl}`;
    }
    const offen = k => G.r20 === k, um = k => () => { G.r20 = offen(k) ? null : k; neu(); };
    if (v === 'b') {
      const karte = (g, k) => { const m = M[k];
        return html`<div class="hn-rk ${m[2] === false ? 'aus' : ''} ${offen(k) ? 'auf' : ''}"><button class="hn-rk-k" aria-expanded=${offen(k) ? 'true' : 'false'} @click=${um(k)}>
            <span class="hn-rk-1"><span class="hn-rk-ic">${m[0]}</span><b>${m[1]}</b><span class="hn-wert ${m[2] === false ? 'aus' : m[2] === true ? 'an' : ''}">${m[3]}</span></span>
            <span class="hn-rk-2">${m[4]}</span><span class="hn-rk-3">${m[5]} · <span class="blau">${offen(k) ? 'fertig ▴' : 'ändern ▾'}</span></span></button>
          ${offen(k) ? html`<div class="hn-rk-e">${g.rows[k]}</div>` : nothing}</div>`; };
      return html`${band}${Gr.map(g => html`<div class="rv-kopf"><b>${g.ic} ${g.t}</b><span class="leise">${g.unter}</span></div><div class="hn-rks">${g.keys.map(k => karte(g, k))}</div>`)}
        <div class="rv-kopf"><b>📐 Feste Regeln</b><span class="leise">bewährte Schwellen, nicht änderbar</span></div><div class="rv-karte">${fest}</div>${erkl}`;
    }
    // C: Tabelle
    const zeile = (g, k) => { const m = M[k];
      return html`<button class="hn-tz ${m[2] === false ? 'aus' : ''} ${offen(k) ? 'auf' : ''}" aria-expanded=${offen(k) ? 'true' : 'false'} @click=${um(k)}>
          <span class="hn-t1"><b>${m[0]} ${m[1]}</b><span class="leise">${m[5]}</span></span><span class="hn-t2">${m[3]}</span>
          <span class="hn-t3">${m[2] === null ? html`<span class="leise">–</span>` : html`<span class="hn-pkt ${m[2] ? 'an' : ''}">${m[2] ? 'an' : 'aus'}</span>`}</span><span class="chev">${offen(k) ? '⌃' : '›'}</span></button>
        ${offen(k) ? html`<div class="hn-te">${m[4] ? html`<div class="leise hn-te-s">${m[4]}</div>` : nothing}${g.rows[k]}</div>` : nothing}`; };
    return html`${band}<div class="hn-tab"><div class="hn-tk"><span>Regel · wirkt wann</span><span>Wert</span><span>an</span><span></span></div>
        ${Gr.map(g => html`<div class="hn-tg">${g.ic} ${g.t} <span class="leise">${g.unter}</span></div>${g.keys.map(k => zeile(g, k))}`)}
        <div class="hn-tg">📐 Feste Regeln <span class="leise">nicht änderbar</span></div><div class="hn-fest">${fest}</div></div>${erkl}`;
  }
  const FEST_N = 7;
  R.vorlage({ merkmal: '<b>So wird geheizt</b>', fn: (t, p) => {
    if (G.an20 === 'heute') return html`${R.band('AN-0020 · heute (0.8.160) zum Vergleich')}${t}`;
    return html`<div class=${t.values[0]}><div class="block-kopf"><b>So wird geheizt</b><span class="leise">${{ a: 'nach Tagesablauf · antippen zum Einstellen', b: 'was jede Regel bewirkt', c: 'alle Regeln auf einen Blick' }[G.an20]}</span></div>${regeln20(p, t.values[1])}</div>`;
  } });

  /* Band in der Einblendung „Diese Woche“ (FE-0034 heute) und in Ausnahmen */
  R.vorlage({ merkmal: '<b>Ausnahmen</b><span class="leise">einmalig', wann: () => G.fe34 !== 'heute', fn: t => html`${R.band({ a: 'FE-0034 · A: Ausnahme in eigener Farbe', b: 'FE-0034 · B: gestreift + Marke ✳', c: 'FE-0034 · C: Normalplan als Geisterbalken' }[G.fe34])}${t}` });
  R.vorlage({ merkmal: 'class="glas-panel hz-held klickbar"', wann: () => G.fe34 !== 'heute', fn: t => html`${R.band('FE-0034 · gemeinsame Achse ' + (G.achse === '0-24' ? '0–24' : '04–22') + ' Uhr')}${t}` });

  R.stil(`
/* FE-0034 */
.hn-w { position: relative; } .hn-w.mit-mk { padding-top: 10px; }
.hn-spur { overflow: hidden; } .hn-spur i { position: absolute; top: 0; bottom: 0; }
.hn-ov.hn-va.mehr { background: var(--s5); }
.hn-ov.hn-va.weniger { background: color-mix(in srgb, var(--s5) 30%, transparent); }
.hn-ov.hn-vb.mehr { background: repeating-linear-gradient(45deg, var(--s5) 0 3px, transparent 3px 6px); box-shadow: inset 0 0 0 1.5px var(--s5); border-radius: 3px; }
.hn-ov.hn-vb.weniger { border: 1.5px dashed var(--s5); box-sizing: border-box; border-radius: 3px; }
.hn-mk { position: absolute; top: -1px; transform: translateX(-50%); font-size: 10px; line-height: 1; color: var(--s5); font-weight: 700; }
.tl-spur i.hn-geist { border: 1.5px dashed var(--ink); box-sizing: border-box; border-radius: 4px; opacity: .8; background: none; }
.hn-achse { position: relative; height: 14px; font-size: 11px; color: var(--ink2); margin-top: 4px; } .hn-achse span { position: absolute; transform: translateX(-50%); top: 0; }
.hn-hp-z { display: grid; grid-template-columns: 48px minmax(0, 1fr) 44px; gap: 10px; align-items: center; padding: 7px 0; }
.hn-hp-z + .hn-hp-z { border-top: 1px solid var(--gridc); } .hn-hp-z.achse { border-top: 0; padding-top: 0; }
.hn-hp-z.heute { background: rgba(255,255,255,.07); border-radius: 12px; margin: 0 -8px; padding: 7px 8px; } .hell .hn-hp-z.heute { background: rgba(0,0,0,.05); }
.hn-hp-z.heute .hp-tag b { color: var(--amber); }
.hn-hp-z .tl-spur { height: 14px; border-radius: 5px; }
.hn-hp-z.ausn .hp-tag b::after { content: ' •'; color: var(--s5); }
.hn-at { color: var(--s5); font-weight: 600; }
.badge.hn-badge { background: color-mix(in srgb, var(--s5) 24%, transparent); color: var(--s5); font-weight: 600; }
.hn-c-zeile { font-size: 12px; margin-top: 4px; } .hn-c-zeile .leise { font-size: 11px; }
.hp-legende i.hn-l-a { background: var(--s5); } .hp-legende i.hn-l-a2 { background: color-mix(in srgb, var(--s5) 30%, transparent); }
.hp-legende i.hn-l-b { background: repeating-linear-gradient(45deg, var(--s5) 0 3px, transparent 3px 6px); box-shadow: inset 0 0 0 1.5px var(--s5); }
.hp-legende i.hn-l-b2 { border: 1.5px dashed var(--s5); box-sizing: border-box; } .hn-mk-l { color: var(--s5); font-size: 10px; }
.hp-legende i.hn-l-c { border: 1.5px dashed var(--ink); box-sizing: border-box; }
.hn-leg2 { margin-top: 4px; }
.hp-legende .hn-badge { font-size: 10px; padding: 1px 6px; }
.tl .hn-w + .hn-achse, .am-strahl .hn-achse { margin-top: 3px; }
/* AN-0019 */
.hn-gr { border-radius: 14px; background: rgba(120,120,128,.10); margin: 8px 0; } .block .hn-gr { margin: 0; }
.hn-gk { display: flex; align-items: center; gap: 10px; width: 100%; padding: 10px 12px; box-sizing: border-box; text-align: left; }
.hn-gic { font-size: 18px; width: 24px; text-align: center; flex: none; }
.hn-gt { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; } .hn-gt > b { font-size: 14px; }
.hn-gt > .leise { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.hn-gr.auf .hn-gt > .leise { white-space: normal; }
.hn-unter { font-weight: 400; margin-left: 4px; }
.hn-zahl { flex: none; font-size: 11px; padding: 2px 8px; border-radius: 10px; background: color-mix(in srgb, var(--amber) 22%, transparent); color: var(--amber); white-space: nowrap; }
.hn-zahl.nein { background: rgba(142,142,147,.25); color: var(--ink2); }
.hn-gi { padding: 0 12px 8px; } .hn-gi.rv-karte { background: none; margin: 0; padding: 0 12px 6px; }
.hn-gi > .hr-zeile:first-child { border-top: 1px solid var(--gridc); }
.hn-wk { display: flex; justify-content: space-between; align-items: center; gap: 8px; margin: 6px 0; }
.hn-wc { display: flex; flex-direction: column; gap: 2px; margin-top: 6px; }
.hn-c { border-top: 1px solid var(--gridc); padding: 6px 0; } .hn-c:first-child { border-top: 0; }
.hn-c.ohne { display: flex; justify-content: space-between; align-items: baseline; gap: 8px; font-size: 12.5px; }
.hn-ck { display: flex; flex-wrap: wrap; gap: 2px 8px; align-items: baseline; width: 100%; font-size: 12.5px; text-align: left; margin-bottom: 4px; } .hn-ck .hn-cn { flex: 1 1 auto; }
.hn-cn { font-weight: 600; } .hn-cp { font-size: 11px; white-space: nowrap; } .hn-cz { font-size: 11px; color: var(--blau); white-space: nowrap; }
.hn-hz { display: grid; grid-template-columns: 82px minmax(0, 1fr) 40px; gap: 8px; align-items: center; margin: 3px 0; }
.hn-hz.eins { grid-template-columns: minmax(0, 1fr); } .hn-hz.achse { margin-top: 0; } .hn-wc .hn-hz.eins + .hn-hz.achse, .hn-wc > .hn-hz.achse { grid-template-columns: 82px minmax(0, 1fr) 40px; }
.hn-g { font-size: 12px; color: var(--ink2); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; } .hn-h { font-size: 11px; color: var(--ink2); text-align: right; }
.hn-hz .tl-spur { height: 12px; border-radius: 5px; }
.hn-greift { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; margin: 6px 0 10px; }
.hn-seg { margin-bottom: 6px; }
.hn-gt2 { margin-top: 12px; }
.hn-kz { display: grid; grid-template-columns: 26px minmax(0, 1fr) auto 14px; gap: 8px; align-items: center; width: 100%; padding: 8px 0; border-top: 1px solid var(--gridc); text-align: left; opacity: .6; font-size: 14px; }
.hn-kz.an, .hn-kz.auf { opacity: 1; } .hn-kz.an .hr-an { color: var(--amber); }
.hn-kt { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; } .hn-kw { font-size: 12px; color: var(--ink2); text-align: right; max-width: 190px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.hn-kz.an .hn-kw { color: var(--ink); }
.hn-kd { padding: 2px 0 10px 34px; font-size: 13px; }
.hn-karten { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; margin: 8px 0; }
.hn-karte { display: flex; flex-direction: column; gap: 2px; padding: 10px 12px; border-radius: 14px; background: rgba(120,120,128,.12); text-align: left; opacity: .7; min-width: 0; }
.hn-karte.an, .hn-karte.auf { opacity: 1; } .hn-karte.auf { box-shadow: inset 0 0 0 1.5px var(--amber); } .hn-karte.an .hr-an { color: var(--amber); }
.hn-k1 { display: flex; justify-content: space-between; font-size: 17px; } .hn-k2 { font-size: 12px; color: var(--ink2); }
.hn-k3 { font-size: 14px; line-height: 1.25; overflow: hidden; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; } .hn-k4 { font-size: 11px; color: var(--blau); margin-top: 2px; }
.hn-kd.glas-panel { padding: 4px 12px 8px; border-radius: 14px; margin: 0 0 8px; }
.hn-wkarte { padding: 4px 12px 10px; border-radius: 14px; margin-top: 4px; }
.hn-alle { color: var(--blau); font-size: 13px; margin-top: 6px; }
/* AN-0020 */
.hn-chips { font-size: 12px; color: var(--ink2); line-height: 1.4; overflow: hidden; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; } .hn-gr.auf .hn-chips { -webkit-line-clamp: unset; }
.hn-sum b { color: var(--ink); font-weight: 600; } .hn-sum.aus { opacity: .75; }
.hn-chip { font-size: 11px; padding: 2px 7px; border-radius: 9px; background: rgba(120,120,128,.2); color: var(--ink2); white-space: nowrap; } .hn-chip b { color: var(--ink); font-weight: 600; }
.hn-chip.aus { opacity: .7; text-decoration: line-through; }
.hn-rks { display: grid; grid-template-columns: minmax(0, 1fr); gap: 6px; margin-bottom: 6px; }
.hn-rk { border-radius: 14px; background: rgba(120,120,128,.10); } .hn-rk.aus { opacity: .7; } .hn-rk.auf { opacity: 1; box-shadow: inset 0 0 0 1.5px color-mix(in srgb, var(--amber) 60%, transparent); }
.hn-rk-k { display: flex; flex-direction: column; gap: 3px; width: 100%; padding: 9px 12px; box-sizing: border-box; text-align: left; }
.hn-rk-1 { display: flex; align-items: center; gap: 8px; } .hn-rk-1 b { flex: 1; min-width: 0; font-size: 14px; } .hn-rk-ic { width: 20px; text-align: center; }
.hn-wert { font-size: 12px; font-weight: 600; padding: 2px 8px; border-radius: 10px; background: rgba(120,120,128,.22); white-space: nowrap; }
.hn-wert.an { background: color-mix(in srgb, var(--amber) 24%, transparent); color: var(--amber); } .hn-wert.aus { color: var(--ink2); }
.hn-rk-2 { font-size: 13px; line-height: 1.35; } .hn-rk-3 { font-size: 11px; color: var(--ink2); }
.hn-rk-e { padding: 0 12px 6px; border-top: 1px solid var(--gridc); }
.hn-tab { display: flex; flex-direction: column; margin-top: 6px; }
.hn-tk, .hn-tz { display: grid; grid-template-columns: minmax(0, 1fr) minmax(70px, auto) 34px 14px; gap: 8px; align-items: center; }
.hn-tk { font-size: 10.5px; letter-spacing: .5px; text-transform: uppercase; color: var(--ink2); padding: 4px 0; border-bottom: 1px solid var(--gridc); }
.hn-tg { font-size: 13px; font-weight: 600; margin: 12px 0 2px; } .hn-tg .leise { font-weight: 400; font-size: 11px; }
.hn-tz { width: 100%; padding: 6px 0; border-top: 1px solid var(--gridc); text-align: left; font-size: 13px; } .hn-tz.aus { opacity: .65; } .hn-tz.auf { opacity: 1; }
.hn-t1 { display: flex; flex-direction: column; min-width: 0; } .hn-t1 b { font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; } .hn-t1 .leise { font-size: 11px; }
.hn-t2 { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; } .hn-t3 { text-align: center; }
.hn-pkt { font-size: 10.5px; padding: 1px 6px; border-radius: 8px; background: rgba(142,142,147,.25); color: var(--ink2); } .hn-pkt.an { background: color-mix(in srgb, var(--amber) 24%, transparent); color: var(--amber); }
.hn-te { padding: 0 0 6px 10px; border-left: 2px solid color-mix(in srgb, var(--amber) 50%, transparent); margin: 0 0 6px 4px; } .hn-te-s { margin: 2px 0 2px; }
.hn-fest { padding: 0 2px; }
@container (max-width: 520px) { .hn-hz { grid-template-columns: 70px minmax(0, 1fr) 34px; } .hn-wc .hn-hz.eins + .hn-hz.achse, .hn-wc > .hn-hz.achse { grid-template-columns: 70px minmax(0, 1fr) 34px; } .hn-kw { max-width: 150px; } }
`);

  /* Kacheln/„hz“ der Seite: eigene Varianten greifen ohne neue Einblendungs-Art (Vorlagen oben) */
  void alt.hzAuf;

  /* ---------- Vorführ-Leiste ---------- */
  R.vorfuehren(w => {
    Object.assign(G, { an19: w.an19, an20: w.an20, fe34: w.fe34, achse: w.achse, auf19: { zeit: true }, offenC: new Set(), aufAlle: false, seg19: 'regeln', r19: null, auf20: null, r20: null });
    const auf = /-auf$/.test(w.zeigen);
    if (w.zeigen === 'heute-auf') {
      if (G.an19 === 'a') { G.auf19 = { zeit: true, wetter: true, wann: true }; G.offenC = new Set(['polier']); }
      if (G.an19 === 'b') { G.seg19 = 'wann'; G.offenC = new Set(['polier']); }
      if (G.an19 === 'c') { G.r19 = '🌧'; G.aufAlle = true; }
    }
    if (w.zeigen === 'heute-regel') { G.r19 = '🕖'; if (G.an19 === 'a') G.auf19 = { zeit: true, wetter: true, strom: true, frei: true }; }
    if (w.zeigen === 'heute-mi') { G.seg19 = 'wann'; G.auf19 = { zeit: false, wann: true }; }
    if (w.zeigen === 'regeln-auf') { G.auf20 = 'g0'; G.r20 = 'frueh'; }
    if (!window.baustelleBeispiel || !window.baustelleBeispiel.welt) return;
    for (const q of R.P()) {
      if (!q.d) continue;
      q.s.sheet = null; q.gehe('heizung'); q.s.hzArt = 'tag'; q.s.hzTag = null;
      const z = w.zeigen.replace(/-auf$|-regel$/, '');
      if (z === 'heute') q.hzAuf('heute');
      if (z === 'heute-woche') { q.s.hzArt = 'woche'; q.hzAuf('heute'); }
      if (z === 'heute-mi') { q.s.hzTag = 'Mi'; q.hzAuf('heute'); }
      if (z === 'regeln') q.hzAuf('regeln');
      if (z === 'woche') q.hzAuf('plan');
      if (z === 'ausn') q.hzAuf('az');
      void auf;
    }
    R.neuAlle();
  });
}

const V = t => [['a', `A · ${t[0]}`], ['b', `B · ${t[1]}`], ['c', `C · ${t[2]}`], ['heute', 'heute (0.8.160)']];
const ZEIGEN = [['heute', 'Heute (Einblendung)'], ['heute-auf', 'Heute – aufgeklappt'], ['heute-regel', 'Heute – Arbeitszeit angetippt'], ['heute-mi', 'Heute – Tag Mi (Ausnahme)'],
  ['heute-woche', 'Heute – Wann: Woche'], ['regeln', 'Regeln'], ['regeln-auf', 'Regeln – eine offen'], ['woche', 'Diese Woche'], ['reiter', 'Reiter Heizung'], ['ausn', 'Arbeitszeit + Ausnahmen']];
const faelle = [];
const f = (name, werte) => faelle.push({ name, werte: { an19: 'heute', an20: 'heute', fe34: 'a', achse: '4-22', zeigen: 'heute', ...werte } });
for (const v of ['a', 'b', 'c', 'heute']) f(`an19-${v}`, { an19: v, zeigen: 'heute' });
for (const v of ['a', 'b', 'c']) f(`an19-${v}-auf`, { an19: v, zeigen: 'heute-auf' });
f('an19-b-regel', { an19: 'b', zeigen: 'heute-regel' });
for (const v of ['a', 'b', 'c', 'heute']) f(`an20-${v}`, { an20: v, zeigen: 'regeln' });
for (const v of ['a', 'b', 'c']) f(`an20-${v}-auf`, { an20: v, zeigen: 'regeln-auf' });
for (const v of ['a', 'b', 'c', 'heute']) f(`fe34-${v}-woche`, { fe34: v, zeigen: 'woche' });
f('fe34-a-woche-024', { fe34: 'a', achse: '0-24', zeigen: 'woche' });
for (const v of ['a', 'b', 'c']) f(`fe34-${v}-mi`, { fe34: v, an19: 'heute', zeigen: 'heute-mi' });
f('fe34-b-mi-neu', { fe34: 'b', an19: 'b', zeigen: 'heute-mi' });
f('fe34-b-ausn', { fe34: 'b', zeigen: 'ausn' });
f('fe34-c-ausn', { fe34: 'c', zeigen: 'ausn' });
f('fe34-a-reiter', { fe34: 'a', zeigen: 'reiter' });
for (const x of faelle) { const z = x.werte.zeigen, v = x.werte.an19;
  if (z === 'ausn') x.scroll = '.am-tag';
  if (z === 'heute-mi') x.scroll = v === 'heute' ? '.hz-tag' : '.hn-wc';
  if (z === 'heute-auf' && v === 'a') x.scroll = '.hn-gr:nth-of-type(2)';
  if (z === 'heute-auf' && v === 'c') x.scroll = '.hn-kd'; }
const nur = process.env.HZN_NUR ? new RegExp(process.env.HZN_NUR) : null;   // nur einige Fälle als Bild (z. B. HZN_NUR=fe34)
rahmen.bauen({ datei: 'heizung-neu.html', titel: 'Baustelle – Heizung neu (AN-0019, AN-0020, FE-0034)', leiste: 'Heizung neu · AN-0019 · AN-0020 · FE-0034', browser, faelle: nur ? faelle.filter(x => nur.test(x.name)) : faelle,
  auswahl: [{ id: 'zeigen', t: 'zeigen', optionen: ZEIGEN },
    { id: 'an19', t: 'AN-0019 Heute', optionen: V(['Gruppen', 'Segmente', 'Karten']) },
    { id: 'an20', t: 'AN-0020 Regeln', optionen: V(['Gruppen', 'Karten mit Satz', 'Tabelle']) },
    { id: 'fe34', t: 'FE-0034 Balken', optionen: V(['eigene Farbe', 'gestreift + ✳', 'Geisterbalken']) },
    { id: 'achse', t: 'Achse', optionen: [['4-22', '04–22 Uhr'], ['0-24', '0–24 Uhr']] }] });
