// Wunsch Herbert (28.10.2026): Tür und Fenster offen im Temperatur-Diagramm der Container-Ansicht (Reiter „Heute“/„Tag“).
// Baut mockups/tuer-diagramm.html: node mockups/quelle/tuer-diagramm.js   ·   prüfen: node mockups/quelle/vorschau/pruefen.cjs mockups/tuer-diagramm.html
//
// Heute: cTag() (src/alt.js) zeichnet Heizzeit als Band, innen/außen, Soll, geheizte kWh je Stunde, Jetzt-Marke – Türen und
// Fenster kommen nicht vor. Vorschlag: jede Öffnung eines Tür- oder Fensterkontakts (b.sensoren, art tuer/fenster) als Band
// von „auf“ bis „zu“, noch offen = bis „jetzt“; kurze Öffnungen mindestens 2 px; Tür in var(--rot), Fenster in var(--blau).
//   A  halbdurchsichtiges Band über die ganze Höhe (Temperaturen + kWh-Streifen), oben eine kräftige Kante
//   B  eigene Spur unter der Zeitachse (je eine Zeile Tür / Fenster) + dünne senkrechte Linie über die Höhe beim Öffnen
// Darüberfahren (Maus) oder Antippen: „Tür 1 offen 07:12–07:31 (19 min)“ bzw. „Fenster 2 offen seit 11:40“; überlappt eine
// andere Öffnung, steht sie als zweite Zeile dabei. Legende „Tür offen“ / „Fenster offen“ nur, wenn es solche Öffnungen gibt.
// Die Wochen-Ansicht der Container-Seite ist ein kWh-Balkendiagramm (kein Temperaturverlauf) – dort keine Bänder.
// Daten: Vorschlag laufzeit.container.<id>.oeffnungen = [{ entity_id, art, name, von: 'HH:MM', bis: 'HH:MM' | null, min }]
// (fertig von der Integration, die Seite zeichnet nur); Beispielöffnungen am Beispieltag (29.09.2026, jetzt 16:20), keine
// echten Kennungen. Frühere Tage (‹ im Zeitraum): dieselbe Liste aus dem Verlauf der Kontakte.
// Bilder: node mockups/quelle/tuer-diagramm.js --bilder <ordner>
const rahmen = require('./rahmen');

/* Läuft nur im Browser (als Text eingesetzt, Node führt es nie aus) */
function browser(R) {
  const BID = 'polier';
  const G = window.TUER = { v: 'A', lage: 'heute' };
  const SENS = [
    { art: 'tuer', entity_id: 'binary_sensor.tuer_polier', nr: 1, name: 'Tür 1', batterie: 80 },
    { art: 'fenster', entity_id: 'binary_sensor.polier_fenster_1', nr: 1, name: 'Fenster 1', batterie: 64 },
    { art: 'fenster', entity_id: 'binary_sensor.polier_fenster_2', nr: 2, name: 'Fenster 2', batterie: 71 }];
  const T1 = SENS[0], F1 = SENS[1], F2 = SENS[2];
  const hm = m => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
  const auf = (s, von, bis) => ({ entity_id: s.entity_id, art: s.art, name: s.name, von: hm(von), bis: bis === null ? null : hm(bis), min: bis === null ? null : bis - von });
  /* Beispielöffnungen – so, wie die Integration sie liefern würde (Minuten ab Mitternacht nur hier zum Hinschreiben) */
  const HEUTE = [auf(T1, 418, 424), auf(T1, 432, 451), auf(T1, 585, 586), auf(F1, 615, 650), auf(F2, 640, 668), auf(T1, 722, 760), auf(F1, 730, 745), auf(T1, 930, 933)];
  const OFFEN = [auf(F2, 700, null), auf(T1, 968, null)];   // Lage „Tür gerade offen“: dazu Fenster 2 seit 11:40, Tür 1 seit 16:08
  const FRUEHER = [auf(T1, 425, 440), auf(F1, 600, 630), auf(T1, 725, 752), auf(T1, 1012, 1013)];
  const liste = vs => G.lage === 'ohne' ? [] : vs ? FRUEHER : G.lage === 'offen' ? [...HEUTE, ...OFFEN] : HEUTE;

  /* ---------- Beispieldaten: Sensoren des Containers, Zustand der Kontakte, Vorschlagsfeld oeffnungen ---------- */
  function schreiben() {
    const B = window.baustelleBeispiel, w = B && B.welt && B.welt[0]; if (!w) return;
    const b = w.bereiche.find(x => x.id === BID); if (!b) return;
    b.sensoren = [...b.sensoren.filter(s => s.art !== 'tuer' && s.art !== 'fenster'), ...SENS.map(s => ({ ...s }))];
    const offen = G.lage === 'offen', c = w.laufzeit.container[BID];
    c.tuer = { offen, seit: offen ? '2026-09-29T16:08:00+02:00' : null };
    c.oeffnungen = liste(0);   // Vorschlag: neues Feld
    const st = (eid, on, n) => { B.B.states[eid] = { entity_id: eid, state: on ? 'on' : 'off', attributes: { friendly_name: n, device_class: n.startsWith('Tür') ? 'door' : 'window' } }; };
    st(T1.entity_id, offen, 'Tür 1 polier'); st(F1.entity_id, false, 'Fenster 1 polier'); st(F2.entity_id, offen, 'Fenster 2 polier');
  }
  const neuLaden = () => { schreiben(); window.baustelleBeispiel.hassNeu(); return Promise.all(R.P().map(q => { q.cache = {}; return q._laden(); })); };

  /* ---------- Tagesdiagramm: Bänder in das SVG von cTag einsetzen (Maße wie in cTag: L 34, R 10, oben 12, unten 44) ---------- */
  const altTag = R.proto.cTag;
  const schluessel = o => `${o.entity_id}@${o.von}`;
  const dauer = m => m < 60 ? `${m} min` : `${Math.floor(m / 60)} h${m % 60 ? ` ${m % 60} min` : ''}`;
  const text = o => o.bis ? `${o.name} offen ${o.von}–${o.bis} (${dauer(o.min)})` : `${o.name} offen seit ${o.von}`;
  const minVon = t => { const [h, m] = t.split(':'); return +h * 60 + +m; };
  const farbe = o => o.art === 'tuer' ? 'var(--rot)' : 'var(--blau)';
  R.proto.cTag = function (b, vs = 0) {
    const s = altTag.call(this, b, vs), m = typeof s === 'string' && s.match(/viewBox="0 0 (\d+) (\d+)" class="c-tag-svg">/);
    if (!m || b.id !== BID) return s;
    const W = +m[1], H = +m[2], L = 34, Rr = 10, T = 12, B = 44, unten = H - B + 28, jm = this.z.JETZT.split(':'), jetzt = +jm[0] * 60 + +jm[1];
    const x = min => L + (W - L - Rr) * Math.min(1440, Math.max(0, min)) / 1440;
    const O = liste(vs).map(o => { const a = minVon(o.von), e = o.bis ? minVon(o.bis) : (vs ? 1440 : jetzt), x1 = x(a), w = Math.max(2, x(e) - x1);
      return { ...o, a, e, x1, w, k: schluessel(o) }; });
    const mitT = O.some(o => o.art === 'tuer'), mitF = O.some(o => o.art === 'fenster'), B2 = G.v === 'B' && O.length;
    const zeile = o => !B2 ? null : mitT && mitF ? (o.art === 'tuer' ? H + 3 : H + 12) : H + 3;
    const hBand = mitT && mitF ? 7 : 9, Hn = B2 ? H + (mitT && mitF ? 22 : 15) : H;
    let unter = '', oben = '';
    for (const o of O) {
      const f = farbe(o), mitte = o.x1 + o.w / 2, hit = Math.max(12, o.w);
      if (!B2) {
        unter += `<rect x="${o.x1.toFixed(1)}" y="${T}" width="${o.w.toFixed(1)}" height="${unten - T}" fill="${f}" opacity="${o.art === 'tuer' ? .22 : .2}"/>`
          + `<rect x="${o.x1.toFixed(1)}" y="${T}" width="${o.w.toFixed(1)}" height="3" fill="${f}" opacity=".9"/>`;
        oben += `<rect class="o-hit" data-o="${o.k}" x="${(mitte - hit / 2).toFixed(1)}" y="${T}" width="${hit.toFixed(1)}" height="${unten - T}" fill="transparent"><title>${text(o)}</title></rect>`;
      } else {
        const y = zeile(o);
        oben += `<line x1="${o.x1.toFixed(1)}" x2="${o.x1.toFixed(1)}" y1="${T}" y2="${unten}" stroke="${f}" stroke-width="1" opacity=".75"/>`
          + `<rect x="${o.x1.toFixed(1)}" y="${y}" width="${o.w.toFixed(1)}" height="${hBand}" rx="2" fill="${f}" opacity=".85"/>`
          + `<rect class="o-hit" data-o="${o.k}" x="${(mitte - hit / 2).toFixed(1)}" y="${T}" width="${hit.toFixed(1)}" height="${y + hBand - T}" fill="transparent"><title>${text(o)}</title></rect>`;
      }
    }
    if (B2) { const spur = y => `<rect x="${L}" y="${y}" width="${W - L - Rr}" height="${hBand}" rx="2" fill="var(--gridc)" opacity=".6"/>`;
      unter = (mitT && mitF ? spur(H + 3) + spur(H + 12) : spur(H + 3));
      oben = unter + oben; unter = ''; }
    let svg = s.replace(m[0], `viewBox="0 0 ${W} ${Hn}" class="c-tag-svg">${unter}`);
    const ende = svg.indexOf('</svg>'); svg = svg.slice(0, ende) + oben + svg.slice(ende);
    // Legende: nur, was es an diesem Tag gibt
    const neu = '<span class="r-marke">neu</span>', leg = (mitT ? `<span><i style="background:var(--rot);opacity:${B2 ? .85 : .45}"></i>Tür offen${neu}</span>` : '')
      + (mitF ? `<span><i style="background:var(--blau);opacity:${B2 ? .85 : .45}"></i>Fenster offen${neu}</span>` : '');
    const li = svg.lastIndexOf('</div>'); if (leg) svg = svg.slice(0, li) + leg + svg.slice(li);
    // Anzeige beim Darüberfahren/Antippen (je Seite eigener Stand: this._otip)
    const sel = O.find(o => o.k === this._otip);
    let tip = '';
    if (sel) {
      const zugleich = O.filter(o => o !== sel && o.a < sel.e && o.e > sel.a);
      const pct = ((sel.x1 + sel.w / 2) / W * 100).toFixed(1);
      tip = `<div class="o-tip" style="left:clamp(90px, ${pct}%, calc(100% - 90px))"><b style="color:${farbe(sel)}">${text(sel)}</b>${zugleich.map(o => `<div class="leise">gleichzeitig: ${text(o)}</div>`).join('')}</div>`;
    }
    const i = svg.indexOf('</svg>') + 6;
    return `<div class="o-wrap">${svg.slice(0, i)}${tip}</div>${svg.slice(i)}`;
  };

  /* ---------- Bedienung: Maus darüber, Antippen (am Handy), woanders tippen schließt ---------- */
  const altUpd = R.proto.updated;
  R.proto.updated = function (...a) {
    const r = this.renderRoot, p = this;
    if (r && !r._oev) {
      r._oev = true;
      const ziel = e => e.composedPath().find(x => x && x.dataset && x.dataset.o !== undefined);
      const setze = k => { if (p._otip !== k) { p._otip = k; p.neuZeichnen(); } };
      r.addEventListener('click', e => { const t = ziel(e); if (t) setze(p._otip === t.dataset.o && e.pointerType !== 'mouse' ? null : t.dataset.o); else if (p._otip) setze(null); });
      r.addEventListener('pointerover', e => { if (e.pointerType !== 'mouse') return; const t = ziel(e); if (t) setze(t.dataset.o); });
      r.addEventListener('pointerout', e => { if (e.pointerType !== 'mouse') return; const t = ziel(e), n = e.relatedTarget;
        if (t && !(n && n.dataset && n.dataset.o !== undefined)) setze(null); });
    }
    return altUpd.apply(this, a);
  };

  R.stil(`
.o-wrap { position: relative; }
.o-hit { cursor: pointer; }
.o-tip { position: absolute; top: 2px; transform: translateX(-50%); max-width: min(320px, 92%); padding: 6px 10px; border-radius: 10px; font-size: 12px; line-height: 1.35;
  background: var(--sheet, rgba(28,28,30,.96)); border: 1px solid var(--panel-rand); box-shadow: 0 6px 18px rgba(0,0,0,.35); pointer-events: none; z-index: 2; white-space: normal; }
.o-tip .leise { font-size: 11px; }`);

  /* ---------- Vorführ-Leiste ---------- */
  const TIPS = { 'tip-tuer': `${T1.entity_id}@07:12`, 'tip-ueberlapp': `${F2.entity_id}@10:40`, 'tip-offen': `${F2.entity_id}@11:40`, 'tip-kurz': `${T1.entity_id}@09:45` };
  R.vorfuehren(async w => {
    Object.assign(G, { v: w.variante, lage: w.lage });
    if (!window.baustelleBeispiel || !window.baustelleBeispiel.welt) return;
    await neuLaden();
    for (const q of R.P()) {
      if (!q.d) continue;
      q.s.sheet = null; q.containerOeffnen(BID); q.s.cvd = 'heute';
      q._otip = TIPS[w.zeigen] || null;
      q.neuZeichnen();
    }
  });
}

const V = [['A', 'A · Band über die ganze Höhe'], ['B', 'B · eigene Spur unten + Linie beim Öffnen']];
const LAGE = [['heute', 'heute mit Öffnungen'], ['offen', 'Tür gerade offen (und Fenster 2 seit 11:40)'], ['ohne', 'ohne Öffnungen']];
const ZEIGEN = [['diagramm', 'Diagramm'], ['tip-tuer', 'angetippt: Tür 1 07:12–07:31'], ['tip-ueberlapp', 'angetippt: Fenster 2 (überlappt Fenster 1)'],
  ['tip-kurz', 'angetippt: kurze Öffnung (1 min)'], ['tip-offen', 'angetippt: Fenster 2 offen seit 11:40 (nur Lage „Tür gerade offen“)']];
const faelle = [];
for (const v of ['A', 'B']) {
  for (const l of ['heute', 'offen', 'ohne']) faelle.push({ name: `${v.toLowerCase()}-${l}`, werte: { variante: v, lage: l, zeigen: 'diagramm' }, scroll: '.c-live' });
  faelle.push({ name: `${v.toLowerCase()}-tip-tuer`, werte: { variante: v, lage: 'heute', zeigen: 'tip-tuer' }, scroll: '.c-live' });
  faelle.push({ name: `${v.toLowerCase()}-tip-offen`, werte: { variante: v, lage: 'offen', zeigen: 'tip-offen' }, scroll: '.c-live' });
}
faelle.push({ name: 'a-tip-ueberlapp', werte: { variante: 'A', lage: 'heute', zeigen: 'tip-ueberlapp' }, scroll: '.c-live' });
faelle.push({ name: 'b-tip-kurz', werte: { variante: 'B', lage: 'heute', zeigen: 'tip-kurz' }, scroll: '.c-live' });
rahmen.bauen({ datei: 'tuer-diagramm.html', titel: 'Baustelle – Tür und Fenster im Temperatur-Diagramm', leiste: 'Tür/Fenster offen im Tagesdiagramm · 2 Varianten', browser, faelle,
  auswahl: [{ id: 'variante', t: 'Variante', optionen: V }, { id: 'lage', t: 'Lage', optionen: LAGE }, { id: 'zeigen', t: 'zeigen', optionen: ZEIGEN }] });
