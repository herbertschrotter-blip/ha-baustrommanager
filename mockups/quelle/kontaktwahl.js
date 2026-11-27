// Vorschlag M16 „Kontaktwahl mit Suche überall“ (UI-Bericht vom 23.11.2026, Maßnahme 16) auf der echten Seite (glas.html).
// Nur Entwurf. Baut mockups/kontaktwahl.html: node mockups/quelle/kontaktwahl.js   ·   Bilder: --bilder <ordner>
//
// Stand: Die Wahl mit Suche gibt es seit 0.8.196 im Reiter „Fühler & Kontakte“ der Container-Seite (cs-picker). Herbert
// (27.11.2026, „Suche überall“): dieselbe Wahl auch dort, wo heute noch eine lange Liste steht –
//   Gerät bearbeiten      Shelly (Schalter), Leistungssensor, Energiesensor
//   Wetter und Kalender   Wetter, Außentemperatur, Regenmenge, Urlaub, Feiertage, Termine
//   Aussehen              Tür-, Fenstersensor und Licht werden dort nicht mehr gewählt (doppelt): die Zeile zeigt den
//                         zugeordneten Sensor und springt mit „ändern ›“ in Fühler & Kontakte.
// Ein Feld zeigt Name, Entity-ID und Zustand; „ändern“ klappt darunter die Liste mit Suche auf (wie cs-picker: Name oder
// Entity-ID, höchstens 30 Treffer, „keins“/„automatisch“ als eigene Zeile, schließen). In den Dialogen mit „Speichern“
// gilt die Wahl erst mit Speichern (Entwurf, wie bisher); nur auf der Container-Seite gilt sie sofort.
// DATEN: keine neuen – die Liste kommt wie bisher aus den Entitäten von Home Assistant (p.entitaeten, freieSchalter).
const rahmen = require('./rahmen');

/* Läuft nur im Browser (als Text eingesetzt, Node führt es nie aus) */
function browser(R) {
  const { html, nothing } = R;
  const BID = 'polier';
  const G = window.KW = { offen: null, q: '' };
  const neu = () => R.neuAlle();
  const zustand = (p, eid) => { const z = eid && p._hass && p._hass.states[eid]; if (!z) return '';
    if (['unavailable', 'unknown'].includes(z.state)) return 'nicht erreichbar';
    if (eid.startsWith('binary_sensor.')) return z.state === 'on' ? 'offen' : 'zu';
    if (eid.startsWith('weather.')) return z.attributes.temperature !== undefined ? `${z.state} · ${z.attributes.temperature} °C` : z.state;
    if (eid.startsWith('calendar.')) return z.state === 'on' ? 'Termin läuft' : 'kein Termin jetzt';
    return `${z.state}${z.attributes.unit_of_measurement ? ` ${z.attributes.unit_of_measurement}` : ''}`; };
  const cls = dc => x => x.entity_id.startsWith('sensor.') && x.attributes.device_class === dc;
  const beschreibbar = x => x.entity_id.startsWith('calendar.') && (Number(x.attributes.supported_features) & 1) !== 0;
  const kal = x => x.entity_id.startsWith('calendar.');
  // Feld → [Liste, Text für „leer“]
  const FELDER = {
    'geraet-edit': {
      schalter: p => [p.freieSchalter(p.s.sheet.form.schalter), null],
      leistung: p => [p.entitaeten(cls('power')), 'automatisch (vom Shelly)'],
      energie: p => [p.entitaeten(cls('energy')), 'automatisch (vom Shelly)'] },
    wetterquelle: {
      wetter: p => [p.entitaeten(x => x.entity_id.startsWith('weather.')), 'keins'],
      temp_sensor: p => [p.entitaeten(cls('temperature')), 'aus der Vorhersage'],
      regen_sensor: p => [p.entitaeten(cls('precipitation')), 'aus der Vorhersage'],
      urlaub_kalender: p => [p.entitaeten(beschreibbar), 'keiner'],
      feiertag_kalender: p => [p.entitaeten(kal), 'keiner'],
      termine_kalender: p => [p.entitaeten(kal), 'keiner'] } };

  /* Wahlfeld: aktueller Wert, „ändern“ klappt die Liste mit Suche auf */
  const wahlfeld = (p, k, liste, leer) => {
    const f = p.s.sheet.form, eid = f[k] || '', auf = G.offen === k;
    const q = G.q.trim().toLowerCase(), treffer = q ? liste.filter(([v, n]) => String(n).toLowerCase().includes(q) || v.toLowerCase().includes(q)) : liste;
    const nimm = v => { f[k] = v; G.offen = null; G.q = ''; neu(); };
    const kopf = html`<button class="zeile kw-wert" data-kw=${k} @click=${() => { G.offen = auf ? null : k; G.q = ''; neu(); }}>
        <div>${eid ? html`<b>${p.name(eid) || eid}</b><div class="cs-id">${eid}</div>` : html`<b class="leise">${leer || 'keiner'}</b>`}</div>
        <span class="kw-r">${eid ? html`<span class="leise">${zustand(p, eid)}</span>` : nothing}<span class="blau">${auf ? 'schließen' : 'ändern'}</span></span></button>`;
    if (!auf) return kopf;
    return html`${kopf}<div class="cs-picker" data-wahl=${k}>${R.marke}<input type="search" placeholder="Suchen: Name oder Entity-ID" .value=${G.q} @input=${e => { G.q = e.target.value; neu(); }}>
        ${leer ? html`<button class="zeile cs-pk" @click=${() => nimm('')}><div><b>${leer}</b></div>${eid ? nothing : html`<span class="leise">✓</span>`}</button>` : nothing}
        ${treffer.slice(0, 30).map(([v, n]) => html`<button class="zeile cs-pk ${v === eid ? 'kw-an' : ''}" @click=${() => nimm(v)}><div><b>${n}</b><div class="cs-id">${v}</div></div><span class="leise">${v === eid ? '✓ ' : ''}${zustand(p, v)}</span></button>`)}
        ${treffer.length > 30 ? html`<div class="leise">… ${treffer.length - 30} weitere – genauer suchen</div>` : treffer.length ? nothing : html`<div class="leer">Nichts gefunden</div>`}
        <div class="cs-pk-fuss"><span class="leise">${treffer.length} von ${liste.length}</span><button class="cs-link" @click=${() => { G.offen = null; G.q = ''; neu(); }}>schließen</button></div></div>`;
  };

  /* Gerät bearbeiten, Wetter und Kalender: <select data-f=k> der Entitäten → Wahlfeld */
  R.vorlage({ merkmal: '<select data-f=', wann: p => !!(p.s.sheet && FELDER[p.s.sheet.art]), fn: (t, p) => {
    const k = t.values[0], F = FELDER[p.s.sheet.art][k]; if (!F) return undefined;
    const [liste, leer] = F(p); return html`<div class="kw-feld">${wahlfeld(p, k, liste, leer)}</div>`; } });

  /* Aussehen: Sensor nicht mehr hier wählen – zeigen und nach Fühler & Kontakte springen */
  const zuFuehler = (p, platz) => { G.offen = null; for (const q of R.P()) { q.containerOeffnen(BID); q.s.sheet = { art: 'bereich' }; if (q.csTab) q.csTab('fuehler'); q.neuZeichnen(); } };
  const sensorZeile = (p, eid, platz, leer) => html`<span class="kw-r">${eid ? html`<span><b>${p.name(eid) || eid}</b>${zustand(p, eid) ? html` <span class="leise">· ${zustand(p, eid)}</span>` : nothing}</span>` : html`<span class="leise">${leer}</span>`}
      <button class="cs-link" data-kw=${platz} @click=${e => { e.preventDefault(); zuFuehler(p, platz); }}>ändern ›</button>${R.marke}</span>`;
  R.vorlage({ merkmal: '<label class="zeile unter"><span>', wann: p => !!(p.s.sheet && p.s.sheet.art === 'aussehen'), fn: (t, p) => {
    const b = p.d.bereiche.find(x => x.id === p.s.sheet.id); if (!b) return undefined;
    const n = { ...t, values: [...t.values] }, art = n.values[4], i = n.values[5], c = p.symKonfig(b), x = c[art] && c[art][i]; if (!x) return undefined;
    const eid = x.sensor || (art === 'tueren' && i === 0 && b.tuer && b.tuer.eid) || null;
    n.values[n.values.length - 1] = sensorZeile(p, eid, `${art === 'tueren' ? 'tuer' : 'fenster'}${i}`, art === 'tueren' && i === 0 ? 'wie Türkontakt des Containers' : 'keiner');
    return n; } });
  R.vorlage({ merkmal: 'Licht kommt von', wann: p => !!(p.s.sheet && p.s.sheet.art === 'aussehen'), fn: (t, p) => {
    const k = t.strings.findIndex(s => s.includes('Licht kommt von')); if (k < 0) return undefined;
    const b = p.d.bereiche.find(x => x.id === p.s.sheet.id); if (!b) return undefined;
    const n = { ...t, values: [...t.values] }; n.values[k] = sensorZeile(p, p.symKonfig(b).licht, 'licht', 'keins');
    return n; } });
  R.stil(`
.kw-feld { margin-top: 4px; }
.kw-feld > .kw-wert { width: 100%; box-sizing: border-box; border: 1px solid rgba(127,127,127,.35); border-radius: 10px; padding: 8px 10px; background: rgba(127,127,127,.06); text-align: left; }
.kw-r { display: inline-flex; align-items: center; gap: 10px; flex-wrap: wrap; justify-content: flex-end; text-align: right; }
.kw-feld .cs-picker { margin: 6px 0 4px; }
.cs-pk.kw-an b { color: var(--blau); }
@media (max-width: 520px) { .kw-feld > .kw-wert { flex-wrap: wrap; } .kw-r { justify-content: flex-start; } }`);

  /* ---------- Vorführ-Leiste ---------- */
  R.vorfuehren(async w => {
    const z = w.zeigen; G.offen = null; G.q = '';
    if (!window.baustelleBeispiel || !window.baustelleBeispiel.welt) return;
    for (const q of R.P()) {
      if (!q.d) continue;
      q.s.sheet = null;
      if (z.startsWith('geraet')) { q.containerOeffnen(BID); const b = q.d.bereiche.find(x => x.id === BID); q.geraetBearbeiten(b, 0); q.s.sheet.zurueck = null;
        if (z === 'geraet-leistung') G.offen = 'leistung'; if (z === 'geraet-shelly') { G.offen = 'schalter'; G.q = 'heizung'; } }
      else if (z.startsWith('wetter')) { q.gehe('einstellungen'); q.einblenden('wetterquelle'); if (z === 'wetter-temp') G.offen = 'temp_sensor'; if (z === 'wetter-kal') G.offen = 'urlaub_kalender'; }
      else if (z === 'aussehen') { q.containerOeffnen(BID); q.aussehenAuf({ id: BID }); q.s.sheet.zurueck = null; }
      else if (z === 'fuehler') { q.containerOeffnen(BID); q.s.sheet = { art: 'bereich' }; if (q.csTab) q.csTab('fuehler'); }
      await q.neuZeichnen();
    }
  });
}

const ZEIGEN = [
  ['geraet', 'M16 Gerät bearbeiten · alle Felder zu'], ['geraet-leistung', 'M16 Gerät bearbeiten · Leistungssensor wählen'], ['geraet-shelly', 'M16 Gerät bearbeiten · Shelly suchen („heizung“)'],
  ['wetter', 'M16 Wetter und Kalender · alle Felder zu'], ['wetter-temp', 'M16 Wetter und Kalender · Außentemperatur wählen'], ['wetter-kal', 'M16 Wetter und Kalender · Urlaubskalender wählen'],
  ['aussehen', 'M16 Aussehen · Sensoren nur anzeigen, ändern › Fühler & Kontakte'], ['fuehler', 'M16 Ziel: Container-Seite › Fühler & Kontakte (gebaut)'],
];
const faelle = ZEIGEN.map(([z]) => ({ name: z, werte: { zeigen: z } }));
faelle.push({ name: 'aussehen-unten', werte: { zeigen: 'aussehen' }, scroll: '[data-kw="licht"]' });
rahmen.bauen({ datei: 'kontaktwahl.html', titel: 'Baustelle – Kontaktwahl mit Suche (M16)', leiste: 'Schritt M16 · Wahl mit Suche überall, wo Entitäten gewählt werden',
  browser, faelle, auswahl: [{ id: 'zeigen', t: 'zeigen', optionen: ZEIGEN }] });
