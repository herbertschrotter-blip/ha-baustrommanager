// Dialoge rund um die Baustelle mit Lit (BSM-022 Stufe 3e): Name, Neue Baustelle, Beginn/Ende/Heizperiode, Wetter und
// Kalender, Abschließen, Löschen, Urlaub, Bericht (Inhalt von der Integration), Nachrichten, Strompreis, Baustelle
// bearbeiten. Formulare sind Entwurf in s.form bzw. s (getrennt von den Serverdaten); Speichern über die Seite.
import { html, nothing } from 'lit';
import { live } from 'lit/directives/live.js';
import { MONATE, TAGE, datum, de, plusTage, uhr, zahl } from '../hilfen.js';
import { BEREICH_FARBEN } from '../symbole.js';

const GRIFF = html`<div class="griff"></div>`;
const LAEDT = html`<div class="leer">Lädt …</div>`;
const knopf = (t, fn, art = '') => html`<button class="knopf ${art}" @click=${fn}>${t}</button>`;
/* Feld eines Entwurfs: Wert als Attribut (Ausgabe wie bisher) und Eigenschaft (live); data-f nur als Test-Merkmal */
const feld = (ziel, k, typ, ph, extra = {}) => html`<input type=${typ || nothing} step=${extra.step || nothing} min=${extra.min ?? nothing} value=${ziel[k] ?? ''} .value=${live(String(ziel[k] ?? ''))} placeholder=${ph || nothing} data-f=${k} @input=${e => { ziel[k] = e.target.value; }}>`;
/** Auswahlliste aus [wert, name] (wie BaustellePanel.optionen, als Vorlage) */
export const optionenVorlage = (liste, aktuell, leer) => html`${leer ? html`<option value="">${leer}</option>` : nothing}${liste.map(([v, n]) => html`<option value=${v} ?selected=${v === aktuell}>${n}</option>`)}`;
const auswahl = (ziel, k, liste, leer) => { const setze = e => { ziel[k] = e.target.value; };
  return html`<select data-f=${k} @input=${setze} @change=${setze}>${optionenVorlage(liste, ziel[k], leer)}</select>`; };

/** Strompreise mit Gültigkeit (Einstellungen › Strom und „Baustelle bearbeiten“) */
export function preisListeVorlage(p) {
  const e = p.d.e, H = p.z.HEUTE, L = (e.preise.length ? e.preise : [{ ab: null, preis: e.preis }]).slice().sort((a, b) => String(b.ab).localeCompare(String(a.ab))), jetzt = L.find(x => !x.ab || x.ab <= H);
  return html`<div class="gruppe-t">Strompreis</div>${L.map((x, i) => { const bis = i && L[i - 1].ab ? plusTage(L[i - 1].ab, -1) : null;
      return html`<div class="sp-zeile"><b>${de(x.preis, 2)} €/kWh</b><span class="leise">${x === jetzt ? html`<span class="badge gruen">gilt jetzt</span> ` : x.ab > H ? html`<span class="badge blau-b">geplant</span> ` : nothing}${x.ab && x.ab > '2000-01-01' ? `ab ${datum(x.ab)}` : 'bisher'}${bis ? ` bis ${datum(bis)}` : ''}</span>
        ${L.length > 1 && x.ab ? html`<button class="x nur-admin" title="Preis löschen" @click=${p.nurAdmin(() => p.preisWeg(x.ab))}>✕</button>` : nothing}</div>`; })}
      <button class="zeile" @click=${() => p.preisNeu()}><span class="blau">+ Neuer Preis ab …</span></button>
      <div class="leise">Auswertung, Abrechnung nach Firma und CSV rechnen jeden Tag mit dem Preis, der an dem Tag galt. Ein neuer Preis ändert nichts an Vergangenem.</div>`;
}

function name(p, s) {
  return html`${GRIFF}<h3>${{ name: 'Name', 'baustelle-neu': 'Neue Baustelle' }[s.art] || ''}</h3>
      <label class="feld">Name${feld(s.form, 'name', null, 'z. B. Wohnbau Kalsdorf')}</label>
      ${knopf('Speichern', p.nurAdmin(() => s.art === 'name' ? p.nameSpeichern() : p.baustelleAnlegen()), 'amber nur-admin')}`;
}

function zeitraum(p, s) {
  const f = s.form, mon = i => html`<select data-f=${'hp' + i} @input=${e => { f.hp[i] = +e.target.value; }} @change=${e => { f.hp[i] = +e.target.value; }}>${MONATE.map((m, k) => html`<option value=${k + 1} ?selected=${f.hp[i] === k + 1}>${m}</option>`)}</select>`;
  return html`${GRIFF}<h3>Beginn, Ende, Heizperiode</h3>
      <div class="raster-2"><label class="feld">Beginn${feld(f, 'beginn', 'date')}</label><label class="feld">Ende (geplant)${feld(f, 'ende', 'date')}</label></div>
      <div class="leise">Gezählt wird ab Beginn. <b>Beginn leer</b> = automatisch der Tag, an dem die Baustelle angelegt wurde${p.d.beginnAuto && p.d.beginn ? ` (${datum(p.d.beginn)})` : ''}.
        <b>Ende leer</b> = offen; beim Abschließen wird immer der Tag des Abschließens eingetragen – ein geplantes Ende dient nur der Hochrechnung.</div>
      <div class="raster-2"><label class="feld">Heizperiode von${mon(0)}</label><label class="feld">bis${mon(1)}</label></div>
      <div class="leise">Die Auswertung rechnet Verbrauch und Kosten auf die Heizperiode hoch – bis zum Ende der Baustelle, wenn es früher liegt.</div>
      ${knopf('Speichern', p.nurAdmin(() => p.zeitraumBsSpeichern()), 'amber nur-admin')}${knopf('Abbrechen', () => p.schliessen(), 'leise-k')}`;
}

/* AN-0022: Urlaub trägt die Seite in den Kalender ein – nur Kalender, die Termine anlegen können (HA: supported_features mit
   CalendarEntityFeature.CREATE_EVENT = 1, z. B. „Lokaler Kalender“; Feiertags-Kalender können es nicht) */
const CREATE_EVENT = 1;
export const beschreibbar = x => x.entity_id.startsWith('calendar.') && (Number(x.attributes.supported_features) & CREATE_EVENT) !== 0;
export const KEIN_URLAUBSKALENDER = 'Kein beschreibbarer Kalender – lege unter Einstellungen › Geräte & Dienste › „Lokaler Kalender“ einen an, z. B. „Baustelle Urlaub“.';
function wetterquelle(p, s) {
  const f = s.form, kal = p.entitaeten(x => x.entity_id.startsWith('calendar.')), urlaubKal = p.entitaeten(beschreibbar);
  const alt = f.urlaub_kalender && !urlaubKal.some(([v]) => v === f.urlaub_kalender) ? [[f.urlaub_kalender, `${p.name(f.urlaub_kalender) || f.urlaub_kalender} (nicht beschreibbar)`]] : [];
  return html`${GRIFF}<h3>Wetter</h3>
        <label class="feld">Wetter${auswahl(f, 'wetter', p.entitaeten(x => x.entity_id.startsWith('weather.')), '– keins –')}</label>
        <label class="feld">Außentemperatur${auswahl(f, 'temp_sensor', p.entitaeten(x => x.entity_id.startsWith('sensor.') && x.attributes.device_class === 'temperature'), 'aus der Vorhersage')}</label>
        <label class="feld">Regenmenge${auswahl(f, 'regen_sensor', p.entitaeten(x => x.entity_id.startsWith('sensor.') && x.attributes.device_class === 'precipitation'), 'aus der Vorhersage')}</label>
        <div class="gruppe-t">Kalender</div>
        <label class="feld">Urlaub${auswahl(f, 'urlaub_kalender', [...urlaubKal, ...alt], '– keiner –')}</label>
        ${!urlaubKal.length ? html`<div class="leise kal-hinweis" data-k="kein-urlaubskalender">${KEIN_URLAUBSKALENDER}</div>` : alt.length ? html`<div class="leise kal-hinweis amber-t">Der gewählte Kalender kann keine Termine anlegen – Urlaub eintragen geht damit nicht.</div>` : nothing}
        <label class="feld">Feiertage${auswahl(f, 'feiertag_kalender', kal, '– keiner –')}</label>
        <label class="feld">Termine (Container nur bei Bedarf)${auswahl(f, 'termine_kalender', kal, '– keiner –')}</label>
        ${knopf('Speichern', p.nurAdmin(() => p.wetterquelleSpeichern()), 'amber nur-admin')}`;
}

const abschliessen = p => html`${GRIFF}<h3>Baustelle abschließen?</h3><div class="leise">Die Heizung wird abgeschaltet. Als Ende wird heute (${datum(p.z.HEUTE)}) eingetragen. Werte und Diagramme bleiben im Verlauf, gelöscht wird nichts.</div>${knopf('Abschließen', p.nurAdmin(() => p.abschliessen()), 'rot nur-admin')}${knopf('Abbrechen', () => p.schliessen(), 'leise-k')}`;

function loeschen(p, s) {
  const x = p.alle.find(y => y.entry === s.id);
  if (!x) return html`${GRIFF}<h3>Baustelle löschen</h3><div class="leise">Diese Baustelle gibt es nicht mehr.</div>${knopf('Schließen', () => p.schliessen(), 'leise-k')}`;
  return html`${GRIFF}<h3>„${x.titel}“ löschen?</h3><div class="leise">Die Baustelle wird aus HA entfernt – mit Containern, Geräten, Einstellungen und Zählern. Sie steht danach auch nicht im Verlauf. Die Messwerte der Shellys bleiben in HA.${x.aktiv ? ' Wer die Werte behalten will, schließt die Baustelle stattdessen ab.' : ''}</div>
        ${knopf('Endgültig löschen', p.nurAdmin(() => p.bsLoeschen()), 'rot nur-admin')}${knopf('Abbrechen', () => p.schliessen(), 'leise-k')}`;
}

function urlaub(p, s) {
  const d = p.d, kz = d.optionen.urlaub_kalender && p.zustand(d.optionen.urlaub_kalender);
  if (!d.optionen.urlaub_kalender || (kz && !beschreibbar(kz))) {
    const keiner = !p.entitaeten(beschreibbar).length;
    return html`${GRIFF}<h3>Urlaub eintragen</h3><div class="leise">${keiner ? KEIN_URLAUBSKALENDER : d.optionen.urlaub_kalender ? 'Der gewählte Kalender kann keine Termine anlegen – bitte einen beschreibbaren wählen.' : 'Zuerst einen Kalender für den Urlaub wählen.'}</div>${keiner ? nothing : knopf('Kalender wählen', p.nurAdmin(() => p.einblenden('wetterquelle')), 'amber nur-admin')}${knopf('Abbrechen', () => p.schliessen(), 'leise-k')}`;
  }
  return html`${GRIFF}<h3>Urlaub eintragen</h3><label class="feld">Name${feld(s.form, 'name', null, 'z. B. Semesterferien')}</label>
      <div class="raster-2"><label class="feld">Von${feld(s.form, 'von', 'date')}</label><label class="feld">Bis${feld(s.form, 'bis', 'date')}</label></div>
      <div class="leise">Wird in den Kalender „${p.name(d.optionen.urlaub_kalender)}“ eingetragen; in der Zeit läuft nur der Frostschutz.</div>${knopf('Eintragen', p.nurAdmin(() => p.urlaubSpeichern()), 'amber nur-admin')}${knopf('Abbrechen', () => p.schliessen(), 'leise-k')}`;
}

/* Bericht · Beispiel: Inhalt von der Integration (baustelle/bericht) – dieselben Zahlen und Texte, die der Bericht verschickt */
function bericht(p) {
  const d = p.d, e = d.e, v = p.berichtDaten();
  if (!v) return html`${GRIFF}<h3>Bericht · Beispiel</h3>${v === undefined ? LAEDT : html`<div class="leer">Bericht nicht verfügbar</div>`}${knopf('Schließen', () => p.schliessen(), 'leise-k')}`;
  const z = (a, b) => html`<div class="mail-z"><span>${a}</span>${b === undefined ? nothing : html`<span>${b}</span>`}</div>`;
  return html`${GRIFF}<h3>Bericht · Beispiel</h3>
        <div class="mail"><div class="mail-kopf"><div><span class="leise">An</span> ${v.mail_an ? v.mail_an : '—'}</div><div><span class="leise">Betreff</span> ${v.betreff}</div>
          ${v.anhang ? html`<div class="mail-anhang">📎 ${v.anhang}</div>` : nothing}</div>
          <div class="mail-inhalt"><b>${v.summe}</b> ${v.vergleich ? html`<span class="leise">${v.vergleich}</span>` : nothing}
            <div class="mail-t">Je Firma</div>${(v.firmen || []).length ? v.firmen.map(f => z(f.name, `${de(f.kwh, 0)} kWh · ${de(f.eur, 2)} €`)) : z('–')}
            <div class="mail-t">Je Container</div>${(v.container || []).map(c => z(c.name, `${de(c.kwh, 0)} kWh`))}
            <div class="mail-t">Heizung</div>${z('Heiztage', zahl(v.heiztage) ? v.heiztage : '–')}${z('gespart durch Automatik', zahl(v.gespart_eur) ? `${de(v.gespart_eur, 0)} €` : '–')}
            <div class="mail-t">Offene Warnungen</div>${(v.warnungen || []).length ? v.warnungen.map(w => z(w.bereich ? `${w.bereich}: ${w.titel}` : w.titel)) : z('keine')}</div></div>
        <div class="leise">${e.bericht_handy ? 'Aufs Handy kommt eine Kurzfassung (Summe, Kosten, Warnungen) mit Knopf „Bericht öffnen“. ' : ''}Die E-Mail geht über einen Mail-Dienst in HA (Google Mail oder SMTP); die Zugangsdaten stehen in secrets.yaml.</div>
        ${knopf('Schließen', () => p.schliessen(), 'leise-k')}`;
}

/* Nachrichten aufs Handy – Beispiele mit echten Containern: bevorzugt der, auf den es gerade passt */
function nachrichten(p) {
  const d = p.d, B = d.bereiche, c = k => (B[k] || B[0] || { name: 'Container', id: '' });
  const wOff = d.warnungen.find(w => w.art === 'offline' && w.b), GB = B.flatMap(b => b.geraete.map(g => ({ b, g })));
  const off = (wOff && B.find(b => b.id === wOff.b)) || B.find(b => b.offline) || c(0);   // Container der Warnung „nicht erreichbar“
  const pumpe = B.find(b => b.pumpe), steck = GB.find(x => x.g.hand && !x.g.heizer) || GB.find(x => x.g.hand) || GB.find(x => !x.g.heizer && x.g.rolle !== 'pumpe');
  const n = (ic, titel, text, knoepfe) => html`<div class="noti"><div class="noti-kopf"><span class="noti-app">🏗 Home Assistant · jetzt</span></div><b>${ic} ${titel}</b><div>${text}</div>
        ${d.e.knoepfe ? html`<div class="noti-knoepfe">${knoepfe.map(k => html`<button @click=${() => p.toast(`„${k}“ – so reagierst du direkt aus der Nachricht`)}>${k}</button>`)}</div>` : nothing}</div>`;
  const tuer = B.find(b => b.tuer && b.tuer.offen) || B.find(b => b.tuer) || c(0), pl = p.planTag(TAGE[(TAGE.indexOf(p.z.HEUTE_TAG) + 1) % 7]);
  const frueh = pl ? pl.vor - d.e.frueh_min : null;   // Frühstart; „Noch früher“ startet 30 min davor (Integration: laufzeit.frueher)
  return html`${GRIFF}<h3>Nachrichten aufs Handy</h3><div class="leise">So kommen sie in der Home-Assistant-App an. ${d.e.knoepfe ? 'Tippe einen Knopf zum Ausprobieren.' : 'Knöpfe sind ausgeschaltet.'}</div>
        ${n('⚠', `${off.name} nicht erreichbar`, 'Seit 10:42 keine Antwort – Stromausfall oder Stecker gezogen?', ['Zum Container', 'Bis morgen stumm'])}
        ${n('🚪', `${tuer.name}: Tür seit ${d.e.tuer_melden} min offen`, 'Die Heizung ist pausiert und heizt wieder, sobald die Tür zu ist.', ['Trotzdem heizen', '1 h stumm'])}
        ${n('❄', 'Morgen −4 °C', `Vorheizen startet schon um ${pl ? uhr(frueh) : '05:30'}. Arbeitsbeginn ${pl ? uhr(pl.a) : '07:00'}.`, ['Morgen nicht heizen', `Noch früher (${pl ? uhr(frueh - 30) : '05:00'})`])}
        ${n('✋', `${steck ? `${steck.g.n} ${steck.b.name}` : (pumpe ? pumpe.name : c(0).name)} seit ${d.e.hand_h} h auf Hand`, 'Von Hand eingeschaltet und nicht zurückgestellt.', ['Automatik übernehmen', 'So lassen'])}
        <div class="leise">Die Knöpfe sind Aktionen der HA-App (mobile_app). Ein Tipp löst die Aktion aus und landet im Protokoll.</div>${knopf('Schließen', () => p.schliessen(), 'leise-k')}`;
}

const preisNeu = (p, s) => html`${GRIFF}<h3>Neuer Strompreis</h3><label class="feld">gilt ab${feld(s, 'ab', 'date')}</label>
        <label class="feld">Preis je kWh${feld(s, 'preis', 'number', null, { step: '0.01', min: '0' })}</label>
        <div class="leise">Bis zu diesem Tag gilt weiter der bisherige Preis – Vergangenes bleibt, wie es war.</div>${knopf('Speichern', p.nurAdmin(() => p.preisSpeichern()), 'amber nur-admin')}${knopf('Abbrechen', () => p.schliessen(), 'leise-k')}`;

/* AN-0002: ✎ im Dialog „Baustellen“ – nur die Daten dieser Baustelle; Staffelung, Bericht, Meldungen und App bleiben unter Einstellungen */
function bearbeiten(p) {
  const d = p.d, o = d.optionen, auf = art => p.nurAdmin(() => p.einblenden(art));
  return html`${GRIFF}<div class="block-kopf"><h3>Baustelle bearbeiten</h3><span class="leise">${d.titel}</span></div>
        <div class="gruppe-t">Baustelle</div>
        <button class="zeile nur-admin" @click=${auf('name')}><span>Name</span><span class="leise">${d.titel} ›</span></button>
        <button class="zeile nur-admin" @click=${auf('zeitraum-bs')}><span>Beginn und Ende</span><span class="leise">${p.bsZeit(d)} ›</span></button>
        <button class="zeile nur-admin" @click=${auf('zeitraum-bs')}><span>Heizperiode</span><span class="leise">${MONATE[d.hp[0] - 1]} – ${MONATE[d.hp[1] - 1]} ›</span></button>
        <div class="gruppe-t">Ort</div>
        <button class="zeile nur-admin" @click=${auf('wetterquelle')}><span>Wetter</span><span class="leise">${o.wetter ? p.name(o.wetter) : 'keins gewählt'} ›</span></button>
        <button class="zeile nur-admin" @click=${auf('wetterquelle')}><span>Außentemperatur</span><span class="leise">${o.temp_sensor ? p.name(o.temp_sensor) : 'aus der Vorhersage'} ›</span></button>
        <div class="gruppe-t">Container und Geräte · ${d.bereiche.length}</div>
        ${d.bereiche.map(b => html`<button class="zeile" data-id=${b.id} @click=${() => p.bereichEinst(b.id)}><span><i class="farbpunkt" style="background:${BEREICH_FARBEN[b.f % 6]}"></i>${b.name}</span><span class="leise">${b.geraete.length} ${b.pumpe ? 'Pumpen' : 'Geräte'} ›</span></button>`)}
        <button class="zeile nur-admin" @click=${auf('container-neu')}><span class="blau">+ Container oder Schacht</span></button>
        <div class="gruppe-t">Strom und Abrechnung</div>
        ${preisListeVorlage(p)}
        ${d.firmen.map(f => { const n = d.bereiche.filter(b => (b.firma || 'eigen') === f.id).length;
          return html`<button class="zeile" data-id=${f.id} @click=${() => p.firmaAuf(f.id)}><span>${f.name}${f.eigen ? html` <span class="badge">eigene</span>` : nothing}</span><span class="leise">${n} Container ›</span></button>`; })}
        <button class="zeile" @click=${() => p.firmaAuf()}><span class="blau">+ Firma hinzufügen</span></button>
        ${d.aktiv ? html`<button class="zeile" @click=${() => p.einblenden('abschliessen')}><span>Baustelle abschließen</span><span class="leise">kommt in den Verlauf ›</span></button>` : nothing}
        <div class="leise p-fuss">Staffelung, Bericht, Meldungen und App stehen unter Einstellungen.</div>
        <button class="zeile" @click=${() => p.gehe('einst')}><span class="blau">Alle Einstellungen</span><span class="chev">›</span></button>
        ${knopf('Fertig', () => p.schliessen(), 'amber')}`;
}

/** Dialoge rund um die Baustelle (Art → Vorlage) */
export const BAUSTELLE_EINBLENDUNGEN = { name, 'baustelle-neu': name, 'zeitraum-bs': zeitraum, wetterquelle, abschliessen, 'bs-loeschen': loeschen, urlaub, bericht, nachrichten, 'preis-neu': preisNeu, 'bs-bearbeiten': bearbeiten };
