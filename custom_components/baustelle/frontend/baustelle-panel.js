// Seite „Baustelle“ – gebaut mit esbuild aus custom_components/baustelle/frontend/src (nicht von Hand ändern, BSM-022)

// src/kacheln-daten.js
var AW_BAUSTEINE = {
  betrag: ["Kosten groß", "Betrag des Zeitraums, Vergleich, Gespart, Hochrechnung"],
  kennzahlen: ["Kennzahlen", "kWh, Kosten, Heizzeit, Pumpzeit mit Vergleich"],
  rangliste: ["Wer verbraucht was", "Rangliste der Container"],
  verlauf: ["Verbrauchsdiagramm", "gestapelt nach Container, Baustelle oder Firma"],
  erkenntnisse: ["Was fällt auf", "Erkenntnisse der Integration"],
  abrechnung: ["Abrechnung nach Firma", "mit CSV"],
  "k-kosten": ["Kachel Kosten", "kurz"],
  "k-gespart": ["Kachel Gespart", "kurz"],
  "k-hoch": ["Kachel Hochrechnung", "kurz"],
  "k-wer": ["Kachel Wer verbraucht", "Top 4 als Balken"],
  "k-firmen": ["Kachel Firmen", "Betrag je Firma"],
  "k-wetter": ["Kachel Wetter", "kWh je Grad kälter"],
  "k-oel": ["Kachel Ölradiator", "Vergleich kurz"],
  "k-temp": ["Kachel Temperaturen", "jetzt je Container"],
  geraete: ["Je Gerät", "Tabelle je Gerät"],
  temperaturen: ["Temperaturen", "Diagramm heute/7/30 Tage"],
  wetter: ["Heizperiode · Signatur", "Energiesignatur je Container"],
  ohne: ["Ohne Automatik", "Vergleich mit Dauerbetrieb"],
  hochrechnung: ["Heizperiode", "Hochrechnung, Signatur, Klima"],
  vergleich: ["Ölradiator oder Konvektor", "Tabelle"],
  leistung: ["Leistung heute", "Diagramm heute"],
  links: ["Weitere Auswertungen", "Liste zum Antippen"]
};
var ST_KACHEL = [["S", 1, 1], ["M", 2, 1], ["L", 2, 2]];
var AW_STUFEN = {
  betrag: [["M", 2, 2], ["L", 4, 2]],
  kennzahlen: [["M", 2, 2], ["L", 4, 2]],
  rangliste: [["M", 2, 3], ["L", 4, 3], ["XL", 4, 4]],
  verlauf: [["S", 2, 2], ["M", 2, 3], ["L", 4, 3], ["XL", 4, 4]],
  erkenntnisse: [["M", 2, 2], ["L", 4, 2]],
  abrechnung: [["M", 2, 4], ["L", 4, 4]],
  links: [["M", 2, 3], ["L", 4, 3]],
  geraete: [["L", 4, 4]],
  temperaturen: [["M", 2, 3], ["L", 4, 3]],
  wetter: [["S", 1, 1], ["M", 2, 3], ["L", 4, 3]],
  ohne: [["M", 2, 2], ["L", 4, 2]],
  hochrechnung: [["M", 2, 3], ["L", 4, 2]],
  vergleich: [["M", 2, 3], ["L", 4, 3]],
  leistung: [["M", 2, 3], ["L", 4, 3]]
};
var awStufen = (k2) => AW_STUFEN[k2] || ST_KACHEL;
var awStufe = (k2, w2, h3) => awStufen(k2).reduce((best, st) => {
  const dd = Math.abs(st[1] - w2) * 2 + Math.abs(st[2] - h3);
  return dd < best[0] ? [dd, st] : best;
}, [1e9, null])[1];
var AW_HOEHE = { betrag: 2, kennzahlen: 2, rangliste: 4, verlauf: 4, erkenntnisse: 2, abrechnung: 4, links: 3, geraete: 4, temperaturen: 4, wetter: 4, ohne: 2, hochrechnung: 3, vergleich: 3, leistung: 3 };
var AW_VORLAGEN = {
  kacheln: ["1 · Kacheln", [["k-kosten", 2, 2], ["k-gespart", 1, 2], ["k-hoch", 1, 2], ["verlauf", 4, 4], ["k-wer", 2, 2], ["k-firmen", 2, 2], ["k-wetter", 1, 2], ["k-oel", 1, 2], ["k-temp", 2, 2]]],
  kosten: ["2 · Kosten im Fokus", [["betrag", 4, 2], ["abrechnung", 4, 4], ["verlauf", 4, 4], ["links", 4, 3]]],
  wer: ["3 · Wer verbraucht was", [["kennzahlen", 4, 2], ["rangliste", 4, 4], ["erkenntnisse", 4, 2]]],
  verlauf: ["4 · Verlauf mit Erkenntnissen", [["verlauf", 4, 4], ["erkenntnisse", 4, 2], ["kennzahlen", 4, 2], ["links", 4, 3]]],
  misch: ["5 · Mischform (Vorschlag)", [["betrag", 4, 2], ["rangliste", 4, 4], ["verlauf", 4, 4], ["erkenntnisse", 4, 2], ["k-wetter", 2, 2], ["k-oel", 2, 2], ["links", 4, 3]]]
};
var AW_SPEICHER = "baustelle-aw-bausteine";
var KK_BEREICHE = [["baustelle", "Baustelle"], ["container", "Container"], ["pumpen", "Pumpen"], ["heizung", "Heizung"], ["auswertung", "Auswertung"]];
var KK = {
  "b-kosten": { ber: "baustelle", ic: "💶", name: "Kosten & Verbrauch", text: "Betrag und kWh im Zeitraum, Vergleich zum Zeitraum davor", such: "euro geld kwh strom monat" },
  "b-gespart": { ber: "baustelle", ic: "🌱", name: "Gespart · ohne Automatik", text: "Was die Automatik gegenüber Dauerbetrieb spart", such: "euro ersparnis 24/7 dauerbetrieb" },
  "b-hoch": { ber: "baustelle", ic: "📅", name: "Hochrechnung Heizperiode", text: "Kosten bis Ende der Heizperiode, mit und ohne Automatik", such: "prognose euro heizperiode ende" },
  "b-wetter": { ber: "baustelle", ic: "🌦", name: "Wetter-Einfluss", text: "kWh je Grad kälter und Heizgrenze (Energiesignatur)", such: "temperatur außen kälte grad" },
  "b-strom": { ber: "baustelle", ic: "⚡", name: "Stromverteilung · Staffelung", text: "Last je Anschluss, Grenze und Reserve", such: "anschluss ampere kw last verteiler staffel" },
  "b-oel": { ber: "baustelle", ic: "⚖", name: "Ölradiator-Ersparnis", text: "Ölradiator gegen Konvektor, fair verglichen", such: "konvektor heizkörper typ vergleich euro" },
  "b-preis": { ber: "baustelle", ic: "🧮", name: "Preis simulieren", text: "Verbrauch mit einem anderen Strompreis – was hätte es gekostet", such: "euro preis simulieren tarif was wäre wenn" },
  "b-geraete": { ber: "baustelle", ic: "📶", name: "Geräte · erreichbar & Signal", text: "Wie viele Shellys antworten, WLAN-Signal", such: "shelly wlan signal offline erreichbar" },
  "b-wer": { ber: "baustelle", ic: "🔥", name: "Wer verbraucht was", text: "Rangliste der Container nach kWh", such: "rangliste container verbrauch kwh euro" },
  "c-temp": { ber: "container", je: "f", ic: "🌡", name: "Temperatur", text: "innen jetzt, Verlauf heute mit außen", such: "grad celsius fühler innen außen" },
  "c-leistung": { ber: "container", je: "c", ic: "⚡", name: "Leistung jetzt", text: "kW gerade, Stundenmittel heute", such: "kw watt strom gerade" },
  "c-verbrauch": { ber: "container", je: "c", ic: "📊", name: "Verbrauch", text: "kWh im Zeitraum, Vergleich zum Zeitraum davor", such: "kwh energie strom tag" },
  "c-kosten": { ber: "container", je: "c", ic: "💶", name: "Kosten", text: "Euro im Zeitraum (kWh × Strompreis)", such: "euro geld preis" },
  "c-heizzeit": { ber: "container", je: "c", ic: "⏱", name: "Heizzeit", text: "eingeschaltet und tatsächlich geheizt", such: "stunden laufzeit zeit strom" },
  "c-ohne": { ber: "container", je: "c", ic: "🌱", name: "Ohne Automatik", text: "Container gegen Dauerbetrieb (24/7)", such: "gespart ersparnis dauerbetrieb euro" },
  "c-warm": { ber: "container", je: "f", ic: "🧠", name: "Warm ab (lernend)", text: "Gelernter Heizbeginn, damit das Soll rechtzeitig erreicht ist", such: "lernen aufheizen beginn start" },
  "v-kwh": { ber: "container", je: "v", ic: "⚖", name: "Vergleich kWh", text: "2–4 Container gegenüber – Verbrauch", such: "vergleich gegenüber kwh verbrauch container" },
  // WU-0017
  "v-eur": { ber: "container", je: "v", ic: "⚖", name: "Vergleich Kosten", text: "2–4 Container gegenüber – Kosten in €", such: "vergleich gegenüber euro kosten container" },
  "p-pumpzeit": { ber: "pumpen", je: "p", ic: "⏱", name: "Pumpzeit", text: "Wie lange gepumpt wurde", such: "schacht pumpe laufzeit stunden wasser" },
  "p-zyklen": { ber: "pumpen", je: "p", ic: "🔁", name: "Zyklen", text: "Ein/Aus im Zeitraum – viele deuten auf Schwimmer oder Grundwasser", such: "schacht pumpe schwimmer an aus" },
  "h-plan": { ber: "heizung", ic: "📅", name: "Heizplan heute / Woche", text: "Vorheizen, Arbeitszeit, Nachheizen, Trocknen", such: "zeitplan arbeitszeit vorheizen nachheizen woche" },
  "h-wann": { ber: "heizung", ic: "🔥", name: "Wann heizt was", text: "Heizzeiten je Container heute", such: "container zeitstrahl heute heizzeiten" }
};
var KK_GROESSE = [["S", "Klein", "1×1"], ["M", "Mittel", "2×1"], ["L", "Groß", "2×2"]];
var KK_SPEICHER = "baustelle-kacheln-uebersicht";
var KK_START = [{ k: "b-kosten", st: "M" }, { k: "b-gespart", st: "M" }, { k: "h-wann", st: "M" }];
var KK_JEDES = { Tag: 6, Woche: 1, Monat: 7, Jahr: 3 };

// src/hilfen.js
function esc(s4) {
  return String(s4 ?? "").replace(/[&<>"']/g, (c4) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c4]);
}
var zahl = (x2) => x2 !== null && x2 !== void 0 && x2 !== "" && Number.isFinite(Number(x2));
var de = (x2, d3 = 1) => {
  if (!zahl(x2)) return "–";
  const n4 = Number(x2);
  return (Math.abs(n4) < 0.5 * 10 ** -d3 ? 0 : n4).toLocaleString("de-AT", { minimumFractionDigits: d3, maximumFractionDigits: d3 });
};
var TAGE = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];
var minu = (t5) => {
  if (!t5) return 0;
  const [h3, m3] = String(t5).split(":").map(Number);
  return (h3 || 0) * 60 + (m3 || 0);
};
var uhr = (m3) => {
  m3 = Math.max(0, Math.round(zahl(m3) ? m3 : 0));
  return `${String(Math.floor(m3 / 60)).padStart(2, "0")}:${String(m3 % 60).padStart(2, "0")}`;
};
var datum = (iso) => iso ? String(iso).slice(0, 10).split("-").reverse().join(".") : "–";
var tageZwischen = (a3, b3) => Math.round((Date.parse(b3 + "T12:00:00Z") - Date.parse(a3 + "T12:00:00Z")) / 864e5);
var kwNr = (iso) => {
  const t5 = /* @__PURE__ */ new Date(iso + "T12:00:00Z"), w2 = (t5.getUTCDay() + 6) % 7;
  t5.setUTCDate(t5.getUTCDate() - w2 + 3);
  const j2 = new Date(Date.UTC(t5.getUTCFullYear(), 0, 4));
  return 1 + Math.round(((t5 - j2) / 864e5 - 3 + (j2.getUTCDay() + 6) % 7) / 7);
};
function zrVersatz(z2, iso, h3, mo) {
  if (z2 === "Tag") return tageZwischen(iso, h3);
  if (z2 === "Woche") {
    const w2 = ((/* @__PURE__ */ new Date(iso + "T12:00:00Z")).getUTCDay() + 6) % 7;
    return tageZwischen(plusTage(iso, -w2), mo) / 7;
  }
  if (z2 === "Monat") return (+h3.slice(0, 4) - +iso.slice(0, 4)) * 12 + +h3.slice(5, 7) - +iso.slice(5, 7);
  return +h3.slice(0, 4) - +iso.slice(0, 4);
}
function zrInfo(z2, v2, h3, mo) {
  if (z2 === "Tag") {
    const t5 = plusTage(h3, -v2);
    return { text: v2 === 0 ? "Heute" : v2 === 1 ? "Gestern" : `${wtag(t5)} ${datum(t5)}`, unter: v2 < 2 ? `${wtag(t5)} ${datum(t5)}` : "", iso: t5 };
  }
  if (z2 === "Woche") {
    const m3 = plusTage(mo, -7 * v2), so = plusTage(m3, 6);
    return { text: v2 === 0 ? "Diese Woche" : v2 === 1 ? "Vorwoche" : `KW ${kwNr(m3)}`, unter: `KW ${kwNr(m3)} · ${datum(m3).slice(0, 6)}–${datum(so)}`, iso: m3 };
  }
  if (z2 === "Monat") {
    let m3 = +h3.slice(5, 7) - 1 - v2, j3 = +h3.slice(0, 4);
    while (m3 < 0) {
      m3 += 12;
      j3--;
    }
    return { text: `${MONATE_LANG[m3]} ${j3}`, unter: v2 === 0 ? "aktueller Monat" : "", iso: `${j3}-${String(m3 + 1).padStart(2, "0")}-01` };
  }
  const j2 = +h3.slice(0, 4) - v2;
  return { text: String(j2), unter: v2 === 0 ? "aktuelles Jahr" : "", iso: `${j2}-01-01` };
}
var plusTage = (iso, n4) => {
  const d3 = /* @__PURE__ */ new Date(iso + "T12:00:00Z");
  d3.setUTCDate(d3.getUTCDate() + n4);
  return d3.toISOString().slice(0, 10);
};
var terminAm = (t5, iso) => {
  const d3 = tageZwischen(t5.datum, iso);
  return t5.wieder === "einmal" ? d3 === 0 : d3 >= 0 && d3 % (t5.wieder === "2wochen" ? 14 : 7) === 0;
};
var naechsterTermin = (t5, ab) => {
  for (let k2 = 0; k2 < 28; k2++) {
    const iso = plusTage(ab, k2);
    if (terminAm(t5, iso)) return iso;
  }
  return null;
};
var kurzDatum = (iso) => iso ? String(iso).slice(0, 10).split("-").reverse().slice(0, 2).join(".") + "." : "–";
var wtag = (iso) => iso ? ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"][(/* @__PURE__ */ new Date(String(iso).slice(0, 10) + "T12:00:00Z")).getUTCDay()] : "–";
var dauer = (a3, b3) => {
  const m3 = minu(b3) - minu(a3);
  return `${Math.floor(m3 / 60)} h${m3 % 60 ? " " + String(m3 % 60).padStart(2, "0") : ""}`;
};
var stdMin = (h3) => {
  if (!zahl(h3)) return "–";
  const m3 = Math.round(h3 * 60);
  return m3 >= 60 ? `${Math.floor(m3 / 60)} h ${m3 % 60} min` : `${m3} min`;
};
var MONATE = ["Jän", "Feb", "Mär", "Apr", "Mai", "Jun", "Jul", "Aug", "Sep", "Okt", "Nov", "Dez"];
var MONATE_LANG = ["Jänner", "Februar", "März", "April", "Mai", "Juni", "Juli", "August", "September", "Oktober", "November", "Dezember"];
var summe = (a3) => (a3 || []).reduce((x2, v2) => x2 + (zahl(v2) ? Number(v2) : 0), 0);
var addieren = (arr) => arr.length ? arr.reduce((a3, w2) => a3.map((v2, i7) => v2 + (w2[i7] || 0))) : [];
var erkl = (an, text2) => an ? `<div class="erkl">ⓘ ${text2}</div>` : "";
var verNeuer = (a3, b3) => {
  const x2 = String(a3 || "").split(".").map(Number), y3 = String(b3 || "").split(".").map(Number);
  for (let i7 = 0; i7 < Math.max(x2.length, y3.length); i7++) {
    const d3 = (x2[i7] || 0) - (y3[i7] || 0);
    if (Number.isNaN(d3)) return false;
    if (d3) return d3 > 0;
  }
  return false;
};

// src/symbole.js
var R_DEFS = `<defs>
  <filter id="wrFluff" x="-20%" y="-20%" width="140%" height="140%"><feTurbulence type="fractalNoise" baseFrequency=".09" numOctaves="3" seed="4" result="n"/>
    <feDisplacementMap in="SourceGraphic" in2="n" scale="4.5" xChannelSelector="R" yChannelSelector="G"/><feGaussianBlur stdDeviation=".45"/></filter>
  <filter id="wrWeich" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="1.6"/></filter>
  <filter id="wrGlow" x="-100%" y="-100%" width="300%" height="300%"><feGaussianBlur stdDeviation="2.2" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
  <filter id="wrNebel" x="-20%" y="-50%" width="140%" height="200%"><feTurbulence type="fractalNoise" baseFrequency=".05 .18" numOctaves="2" seed="7" result="n"/>
    <feDisplacementMap in="SourceGraphic" in2="n" scale="6"/><feGaussianBlur stdDeviation="1.2"/></filter>
  <radialGradient id="wrKern" cx="45%" cy="42%" r="60%"><stop offset="0" stop-color="#fffef2"/><stop offset=".45" stop-color="#ffe680"/><stop offset="1" stop-color="#ff9f0a"/></radialGradient>
  <radialGradient id="wrKorona"><stop offset="0" stop-color="#fff3b0" stop-opacity=".85"/><stop offset=".5" stop-color="#ffd54f" stop-opacity=".35"/><stop offset="1" stop-color="#ffb300" stop-opacity="0"/></radialGradient>
  <linearGradient id="wrStrahl" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#fff6c8" stop-opacity=".75"/><stop offset="1" stop-color="#fff6c8" stop-opacity="0"/></linearGradient>
  <radialGradient id="wrWeiss" cx="38%" cy="28%" r="80%"><stop offset="0" stop-color="#ffffff"/><stop offset=".55" stop-color="#eef2f5"/><stop offset="1" stop-color="#b6c2cb"/></radialGradient>
  <radialGradient id="wrGrau" cx="38%" cy="25%" r="85%"><stop offset="0" stop-color="#cfd8dc"/><stop offset=".5" stop-color="#8d9ca6"/><stop offset="1" stop-color="#4b5a64"/></radialGradient>
  <linearGradient id="wrRegen" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#8ec5ff" stop-opacity="0"/><stop offset="1" stop-color="#3d8be0"/></linearGradient>
  <radialGradient id="wrEis" cx="35%" cy="30%" r="70%"><stop offset="0" stop-color="#ffffff"/><stop offset="1" stop-color="#9cc9ee"/></radialGradient>
  <radialGradient id="wrMond" cx="38%" cy="35%" r="75%"><stop offset="0" stop-color="#fffbe6"/><stop offset=".7" stop-color="#f3e3a8"/><stop offset="1" stop-color="#d6c07a"/></radialGradient></defs>`;
var R_WOLKE_TEILE = [[22, 34, 10], [32, 27, 13], [43, 32, 10.5], [14, 40, 7], [51, 40, 7.5]];
function rWolke(dx = 0, dy = 0, s4 = 1, dunkel = false) {
  const kreise = (f3) => R_WOLKE_TEILE.map(([x2, y3, r5]) => `<circle cx="${x2}" cy="${y3}" r="${r5}" fill="${f3}"/>`).join("") + `<ellipse cx="32" cy="42" rx="21" ry="7" fill="${f3}"/>`;
  return `<g class="wi-wolke" transform="translate(${dx} ${dy}) scale(${s4})"><g transform="translate(1.5 3)" opacity=".22" filter="url(#wrWeich)">${kreise("#233")}</g>
    <g filter="url(#wrFluff)">${kreise(`url(#${dunkel ? "wrGrau" : "wrWeiss"})`)}</g></g>`;
}
function rSonne(cx = 32, cy = 32, r5 = 11) {
  return `<circle class="wb-puls" cx="${cx}" cy="${cy}" r="${r5 * 2.2}" fill="url(#wrKorona)"/>
    <g class="wi-dreh" style="transform-origin:${cx}px ${cy}px" opacity=".9">${[...Array(12)].map((_2, i7) => `<polygon points="${cx},${cy - 1.2} ${cx + r5 * 2.6},${cy} ${cx},${cy + 1.2}" fill="url(#wrStrahl)" transform="rotate(${i7 * 30} ${cx} ${cy})"/>`).join("")}</g>
    <circle cx="${cx}" cy="${cy}" r="${r5}" fill="url(#wrKern)" filter="url(#wrGlow)"/>
    <circle cx="${cx + r5 * 1.6}" cy="${cy + r5 * 1.5}" r="2.2" fill="#fff" opacity=".3"/><circle cx="${cx + r5 * 2.2}" cy="${cy + r5 * 2.1}" r="1.3" fill="#fff" opacity=".25"/>`;
}
function wetterIcon(zustand2, groesse2 = 64) {
  const regen = (n4, schnell) => [...Array(n4)].map((_2, i7) => {
    const x2 = 20 + i7 * (26 / Math.max(1, n4 - 1));
    return `<line class="wi-tropfen" style="animation-delay:${(i7 * 0.23).toFixed(2)}s;animation-duration:${schnell ? 0.7 : 1}s" x1="${x2 + 2}" y1="44" x2="${x2 - 1}" y2="55" stroke="url(#wrRegen)" stroke-width="1.8" stroke-linecap="round"/>`;
  }).join("");
  const kristall = (x2, y3, i7) => `<g class="wi-flocke" style="animation-delay:${(i7 * 0.8).toFixed(1)}s"><g class="wr-kristall" style="transform-origin:${x2}px ${y3}px">
    ${[0, 60, 120].map((w2) => `<g transform="rotate(${w2} ${x2} ${y3})" stroke="#e8f4ff" stroke-width="1.1" stroke-linecap="round"><line x1="${x2}" y1="${y3 - 4}" x2="${x2}" y2="${y3 + 4}"/>
      <line x1="${x2}" y1="${y3 - 2.4}" x2="${x2 - 1.4}" y2="${y3 - 3.6}"/><line x1="${x2}" y1="${y3 - 2.4}" x2="${x2 + 1.4}" y2="${y3 - 3.6}"/>
      <line x1="${x2}" y1="${y3 + 2.4}" x2="${x2 - 1.4}" y2="${y3 + 3.6}"/><line x1="${x2}" y1="${y3 + 2.4}" x2="${x2 + 1.4}" y2="${y3 + 3.6}"/></g>`).join("")}
    <circle cx="${x2}" cy="${y3}" r="1" fill="#fff"/></g></g>`;
  const blitz = `<g class="wi-blitz" filter="url(#wrGlow)"><path d="M34 38l-7 9 5 .5-5 10 11-12-5-.5 5-7z" fill="#fffde7" stroke="#b39ddb" stroke-width=".8" stroke-linejoin="round"/></g>`;
  const nebel = `<g filter="url(#wrNebel)" opacity=".85">${[46, 52, 58].map((y3, i7) => `<rect class="wi-nebel" style="animation-delay:${i7 * 1.1}s" x="${8 + i7 * 2}" y="${y3 - 3}" width="${48 - i7 * 4}" height="6" rx="3" fill="var(--wr-nebel)"/>`).join("")}</g>`;
  const mond = `<circle cx="34" cy="30" r="21" fill="url(#wrKorona)" opacity=".45"/><circle cx="34" cy="30" r="15" fill="url(#wrMond)" filter="url(#wrGlow)"/>
    ${[[29, 25, 2.6], [39, 33, 2], [33, 37, 1.6], [37, 23, 1.3]].map(([x2, y3, r5]) => `<circle cx="${x2}" cy="${y3}" r="${r5}" fill="#cbb46a" opacity=".45"/>`).join("")}
    ${[[10, 12], [18, 50], [54, 10], [56, 50], [8, 34]].map(([x2, y3], i7) => `<circle class="wi-stern" style="animation-delay:${i7 * 0.6}s" cx="${x2}" cy="${y3}" r="1.1" fill="#fff8e1" filter="url(#wrGlow)"/>`).join("")}`;
  const wind = `<g fill="none" stroke="var(--wr-wind)" stroke-linecap="round" filter="url(#wrWeich)" opacity=".8">${[[24, 40, 3], [34, 48, 2.2], [44, 34, 1.6]].map(([y3, l4, w2], i7) => `<path class="wi-wind" style="animation-delay:${i7 * 0.6}s" d="M${6 + i7 * 3} ${y3}q${l4 / 2} -5 ${l4} 0" stroke-width="${w2}"/>`).join("")}</g>`;
  const hagel = [0, 1, 2, 3].map((i7) => `<circle class="wi-tropfen" style="animation-delay:${i7 * 0.3}s" cx="${20 + i7 * 8}" cy="52" r="2.3" fill="url(#wrEis)"/>`).join("");
  const t5 = {
    sunny: rSonne(32, 32, 11),
    exceptional: rSonne(32, 32, 11),
    "clear-night": mond,
    partlycloudy: rSonne(23, 21, 8.5) + rWolke(5, 6, 0.9),
    "partlycloudy-night": `<g transform="translate(2 1) scale(.7)">${mond}</g>` + rWolke(5, 6, 0.9),
    cloudy: rWolke(-9, -8, 0.8, true) + rWolke(4, 2, 0.95),
    fog: rWolke(0, -9, 0.85) + nebel,
    rainy: rWolke(0, -8) + regen(4),
    pouring: rWolke(0, -8, 1, true) + regen(7, true),
    snowy: rWolke(0, -8) + [0, 1, 2].map((i7) => kristall(22 + i7 * 10, 51, i7)).join(""),
    "snowy-rainy": rWolke(0, -8) + regen(2) + kristall(36, 51, 1),
    hail: rWolke(0, -8, 1, true) + hagel,
    lightning: rWolke(0, -10, 1, true) + blitz,
    "lightning-rainy": rWolke(0, -10, 1, true) + regen(3) + blitz,
    windy: wind,
    "windy-variant": rWolke(0, -10, 0.8) + wind
  };
  return `<svg class="wi wr" viewBox="0 0 64 64" width="${groesse2}" height="${groesse2}" overflow="visible" role="img" aria-label="${esc(zustand2)}">${R_DEFS}${t5[zustand2] || rWolke(0, -4)}</svg>`;
}
var BEREICH_FARBEN = ["#3987e5", "#eb6834", "#1baf7a", "#c98500", "#d55181", "#199e70"];
var SYMBOL_STANDARD = { doppel: false, farbe: null, rahmen: null, tueren: [{ wand: "front", pos: 0.15 }], fenster: [{ wand: "front", pos: 0.67 }], licht_an: false };
function bcContainer(f3, zustand2, b3) {
  const s4 = b3 && b3.symbol || SYMBOL_STANDARD, farbe = s4.farbe || f3, dop = !!s4.doppel;
  const heizt = ["heizt", "trocknen", "frost"].includes(zustand2), off = zustand2 === "offline", licht = !!s4.licht_an;
  const DUNKEL = "#141414", LICHT = "#ffe9a8";
  const dunkler = `color-mix(in srgb, ${farbe} 70%, #000)`, heller = `color-mix(in srgb, ${farbe} 75%, #fff)`;
  const SL = dop ? 80 : 50, sdy = SL * -18 / 50, dy = dop ? 11 : 0, W = dop ? 200 : 170, H2 = dop ? 131 : 120;
  const wand = (w2) => w2 === "seite" ? { x0: 106, y0: 50, L: SL, n: -18 / 50 } : { x0: 22, y0: 30, L: 84, n: 20 / 84 };
  const para = (x2, y3, bb, d3, h3, attr) => `<path d="M${x2} ${y3}l${bb} ${d3}v${h3}l${-bb} ${-d3}z" ${attr}/>`;
  const RAND = 8, TB = 14, FB = 20, LUFT = 5, platz = /* @__PURE__ */ new Map();
  for (const w2 of ["front", "seite"]) {
    const L2 = wand(w2).L, an = (el) => (el.wand === "seite" ? "seite" : "front") === w2;
    const tl = (s4.tueren || []).filter(an).sort((a3, b4) => a3.pos - b4.pos), fl = (s4.fenster || []).filter(an).sort((a3, b4) => a3.pos - b4.pos);
    const belegt = [];
    for (const t5 of tl) {
      let c4 = t5.pos < 0.4 ? RAND + TB / 2 : t5.pos > 0.6 ? L2 - RAND - TB / 2 : L2 / 2;
      while (belegt.some(([v2, b4]) => c4 > v2 - TB / 2 - LUFT && c4 < b4 + TB / 2 + LUFT)) c4 += (t5.pos > 0.6 ? -1 : 1) * (TB + LUFT);
      platz.set(t5, { c: c4, bb: TB });
      belegt.push([c4 - TB / 2, c4 + TB / 2]);
    }
    let frei = [[RAND, L2 - RAND]];
    for (const [v2, b4] of belegt) frei = frei.flatMap(([x2, y3]) => b4 + LUFT <= x2 || v2 - LUFT >= y3 ? [[x2, y3]] : [[x2, v2 - LUFT], [b4 + LUFT, y3]]).filter(([x2, y3]) => y3 - x2 >= 10);
    if (!fl.length || !frei.length) continue;
    if (fl.length === 1 && !tl.length) {
      const bb = FB;
      platz.set(fl[0], { c: RAND + bb / 2 + Math.max(0, Math.min(1, (fl[0].pos - 0.15) / 0.7)) * (L2 - 2 * RAND - bb), bb });
      continue;
    }
    const ges = frei.reduce((a3, [x2, y3]) => a3 + y3 - x2, 0), anz = frei.map(([x2, y3]) => fl.length * (y3 - x2) / ges);
    const n4 = anz.map(Math.floor);
    let rest = fl.length - n4.reduce((a3, b4) => a3 + b4, 0);
    anz.map((v2, i7) => [v2 - Math.floor(v2), i7]).sort((a3, b4) => b4[0] - a3[0]).forEach(([, i7]) => {
      if (rest > 0) {
        n4[i7]++;
        rest--;
      }
    });
    let k2 = 0;
    frei.forEach(([x2, y3], i7) => {
      const slot = (y3 - x2) / (n4[i7] || 1);
      for (let j2 = 0; j2 < n4[i7]; j2++) platz.set(fl[k2++], { c: x2 + slot * (j2 + 0.5), bb: Math.max(8, Math.min(FB, slot - LUFT)) });
    });
  }
  const lage = (el) => {
    const p0 = platz.get(el), g2 = wand(el.wand), x2 = g2.x0 + p0.c - p0.bb / 2;
    return { x: x2, y: g2.y0 + (x2 - g2.x0) * g2.n, n: g2.n, bb: p0.bb };
  };
  const fenster2 = (fe) => {
    const a3 = lage(fe), bb = a3.bb, h3 = 21, x2 = a3.x, y3 = a3.y + 17, d3 = bb * a3.n, zst = fe.zustand || "zu";
    let r5 = para(x2 - 1.6, y3 - 1.6, bb + 3.2, d3, h3 + 3.2, 'fill="var(--rahmen)"');
    if (zst === "offen") return r5 + para(x2, y3, bb, d3, h3, `fill="${licht ? `color-mix(in srgb, ${LICHT} 55%, #000)` : DUNKEL}"`) + para(x2 - 9, y3 + 2, 9, d3 * 0.2 - 2, h3, 'fill="var(--fenster)" stroke="var(--rahmen)" stroke-width="1.4" opacity=".95"');
    r5 += para(x2, y3, bb, d3, h3, `class="${licht ? "bc-licht" : heizt ? "bc-glut" : ""}" fill="${licht ? LICHT : heizt ? "#ffb74d" : "var(--fenster)"}"`);
    if (zst === "gekippt") r5 += para(x2, y3, bb, d3, 4, `fill="${DUNKEL}" opacity=".8"`) + `<path d="M${x2 - 1} ${y3 + 4}l${bb + 2} ${d3}" stroke="var(--rahmen)" stroke-width="1.6"/>`;
    else r5 += `<path d="M${x2 + bb / 2} ${y3 + bb / 2 * a3.n}v${h3}" stroke="var(--rahmen)" stroke-width="1.4"/>`;
    if (!licht) r5 += `<path d="M${x2 + 2.5} ${y3 + 3}l${bb * 0.35} ${d3 * 0.35 + 7}" stroke="#fff" stroke-width="1.6" stroke-linecap="round" opacity="${heizt ? 0.25 : 0.35}"/>`;
    return `<g>${r5}</g>`;
  };
  const tuer = (t5) => {
    const a3 = lage(t5), bb = a3.bb, h3 = 46, x2 = a3.x, y3 = a3.y + 9, d3 = bb * a3.n;
    if (t5.offen) return para(x2, y3, bb, d3, h3, `fill="${licht ? `color-mix(in srgb, ${LICHT} 60%, #000)` : DUNKEL}" stroke="var(--rahmen)" stroke-width="1.2"`) + `<path d="M${x2} ${y3}l-7 ${5 - d3 * 0.2}v${h3}l7 -5z" fill="${dunkler}" stroke="var(--rahmen)" stroke-width="1.2"/>`;
    return para(x2, y3, bb, d3, h3, `fill="${dunkler}" stroke="var(--rahmen)" stroke-width="1.2"`) + `<path d="M${x2 + 3} ${y3 + 4 + 3 * a3.n}l8 ${8 * a3.n}v7l-8 ${-8 * a3.n}z" fill="${licht ? LICHT : heizt ? "#ffcc80" : "var(--fenster)"}" opacity=".9"/><circle cx="${x2 + bb - 2.5}" cy="${y3 + d3 + 24}" r="1.2" fill="#e0e0e0"/>`;
  };
  const rippen = (w2, k2) => {
    const g2 = wand(w2), n4 = Math.round(g2.L / (w2 === "front" ? 10.5 : 9));
    let r5 = "";
    for (let j2 = 1; j2 < n4; j2++) {
      const x2 = g2.x0 + j2 * g2.L / n4;
      r5 += `<path d="M${x2} ${g2.y0 + (x2 - g2.x0) * g2.n + 1}v58" stroke="rgba(0,0,0,${k2})" stroke-width="1.4"/>`;
    }
    return r5;
  };
  const naht = dop ? `<path d="M${106 + SL / 2} ${50 + sdy / 2}v58" stroke="rgba(0,0,0,.45)" stroke-width="2.2"/><path d="M${22 + SL / 2} ${30 + sdy / 2}l84 20" stroke="rgba(0,0,0,.3)" stroke-width="1.6"/>` : "";
  const rahmen = (() => {
    const r5 = s4.rahmen;
    if (!r5) return "";
    const P2 = 3, R2 = 4.3, nf = 20 / 84, ns = -18 / 50, rs = `color-mix(in srgb, ${r5} 72%, #000)`, rh = `color-mix(in srgb, ${r5} 80%, #fff)`;
    const band = (x2, y3, l4, d3, h3, f4) => `<path d="M${x2} ${y3}l${l4} ${d3}v${h3}l${-l4} ${-d3}z" fill="${f4}"/>`;
    const pfosten = (x2, y3, n4, f4) => band(x2, y3, P2, P2 * n4, 58, f4);
    return band(22, 30, 84, 20, R2, r5) + band(22, 88 - R2, 84, 20, R2, r5) + band(106, 50, SL, sdy, R2, rs) + band(106, 108 - R2, SL, sdy, R2, rs) + pfosten(22, 30, nf, r5) + pfosten(106 - P2, 50 - P2 * nf, nf, r5) + pfosten(106, 50, ns, rs) + pfosten(106 + SL - P2, 50 + (SL - P2) * ns, ns, rs) + (dop ? pfosten(106 + SL / 2 - P2 / 2, 50 + (SL / 2 - P2 / 2) * ns, ns, rs) : "") + `<path d="M22 30l${SL} ${sdy} 84 20" fill="none" stroke="${rh}" stroke-width="2.4" stroke-linejoin="round"/>`;
  })();
  const mx = dop ? 15 : 0, my = sdy / 2 + 9;
  return `<svg class="bc ${off ? "offline" : ""}" viewBox="0 0 ${W} ${H2}" style="--f:${farbe}"><g transform="translate(0 ${dy})">
    <ellipse cx="${86 + SL / 2 - 25}" cy="104" rx="${70 + SL / 2 - 25}" ry="9" fill="#000" opacity=".22"/>
    <path d="M22 88l84 20 ${SL} ${sdy}" fill="none" stroke="rgba(0,0,0,.45)" stroke-width="4" stroke-linecap="round"/>
    <path d="M106 50l${SL} ${sdy}v58l${-SL} ${-sdy}z" fill="${dunkler}"/>${rippen("seite", 0.18)}
    <path d="M22 30l84 20v58l-84-20z" fill="${farbe}"/>${rippen("front", 0.14)}
    <path d="M22 30l${SL} ${sdy} 84 20 ${-SL} ${-sdy}z" fill="${heller}"/><path d="M22 30l84 20 ${SL} ${sdy}" fill="none" stroke="rgba(255,255,255,.35)" stroke-width="1.2"/>
    ${naht}${rahmen}${(s4.tueren || []).map(tuer).join("")}${(s4.fenster || []).map(fenster2).join("")}
    ${zustand2 === "trocknen" ? '<g class="bc-jacke" style="transform-origin:88.5px 42px"><path d="M84 44l3-2h3l3 2-1.4 3-1.4-.6v6h-5.6v-6l-1.4.6z" fill="#1565c0"/></g>' : ""}
    ${heizt && zustand2 !== "frost" ? [0, 1, 2].map((k2) => `<path class="bc-waerme" style="animation-delay:${k2 * 0.7}s" d="M${62 + k2 * 18 + mx} ${24 - k2 + my} q4 -5 0 -10 q-4 -5 0 -10" fill="none" stroke="#ff9800" stroke-width="2.2" stroke-linecap="round"/>`).join("") : ""}
    ${zustand2 === "frost" ? [0, 1, 2].map((k2) => `<g class="bc-eis" style="animation-delay:${k2 * 0.6}s" transform="translate(${60 + k2 * 22 + mx} ${16 - k2 * 2 + my})" stroke="#bbdefb" stroke-width="1.6" stroke-linecap="round">
      <line x1="-4" y1="0" x2="4" y2="0"/><line x1="-2" y1="-3.5" x2="2" y2="3.5"/><line x1="-2" y1="3.5" x2="2" y2="-3.5"/></g>`).join("") : ""}
    ${off ? `<g class="bc-alarm"><circle cx="${W - 30}" cy="20" r="11" fill="#d03b3b"/><path d="M${W - 30} 13v9" stroke="#fff" stroke-width="3" stroke-linecap="round"/><circle cx="${W - 30}" cy="27" r="1.8" fill="#fff"/></g>` : ""}
  </g></svg>`;
}
function bcSchacht(laeuft) {
  return `<svg class="bc" viewBox="0 0 170 120">
    <ellipse cx="85" cy="104" rx="56" ry="10" fill="#000" opacity=".22"/>
    <defs><clipPath id="bcSch"><path d="M40 30v62a45 12 0 0 0 90 0V30z"/></clipPath>
      <linearGradient id="bcBeton" x1="0" x2="1"><stop offset="0" stop-color="#8d9ca6"/><stop offset=".5" stop-color="#cfd8dc"/><stop offset="1" stop-color="#78909c"/></linearGradient>
      <linearGradient id="bcWasser" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#64b5f6"/><stop offset="1" stop-color="#0d47a1"/></linearGradient></defs>
    <path d="M40 30v62a45 12 0 0 0 90 0V30z" fill="url(#bcBeton)"/>
    <g clip-path="url(#bcSch)"><g class="${laeuft ? "bc-pegel" : ""}"><path class="bc-welle" d="M0 70q15-5 30 0t30 0 30 0 30 0 30 0 30 0 30 0v60H0z" fill="url(#bcWasser)" opacity=".92"/></g>
      <g transform="translate(85 86)"><circle r="10" fill="#37474f"/><g class="${laeuft ? "bc-rad" : ""}"><path d="M0 0l0-8M0 0l7 4M0 0l-7 4" stroke="#b0bec5" stroke-width="3" stroke-linecap="round"/></g></g></g>
    <ellipse cx="85" cy="30" rx="45" ry="12" fill="#546e7a"/><ellipse cx="85" cy="30" rx="38" ry="9" fill="#263238"/>
    <path d="M85 76V10h32" fill="none" stroke="#90a4ae" stroke-width="5"/><path class="${laeuft ? "bc-fluss" : ""}" d="M85 76V10h32" fill="none" stroke="#64b5f6" stroke-width="2.4"/>
  </svg>`;
}
var ICON_MELDEN = '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" d="M4 5h16v11H9l-5 4z"/><path stroke="currentColor" stroke-width="1.8" stroke-linecap="round" d="M12 8v3.5M12 13.6v.2"/></svg>';
var ICON_COG = '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path fill="currentColor" d="M12,15.5A3.5,3.5 0 0,1 8.5,12A3.5,3.5 0 0,1 12,8.5A3.5,3.5 0 0,1 15.5,12A3.5,3.5 0 0,1 12,15.5M19.43,12.97C19.47,12.65 19.5,12.33 19.5,12C19.5,11.67 19.47,11.34 19.43,11L21.54,9.37C21.73,9.22 21.78,8.95 21.66,8.73L19.66,5.27C19.54,5.05 19.27,4.96 19.05,5.05L16.56,6.05C16.04,5.66 15.5,5.32 14.87,5.07L14.5,2.42C14.46,2.18 14.25,2 14,2H10C9.75,2 9.54,2.18 9.5,2.42L9.13,5.07C8.5,5.32 7.96,5.66 7.44,6.05L4.95,5.05C4.73,4.96 4.46,5.05 4.34,5.27L2.34,8.73C2.21,8.95 2.27,9.22 2.46,9.37L4.57,11C4.53,11.34 4.5,11.67 4.5,12C4.5,12.33 4.53,12.65 4.57,12.97L2.46,14.63C2.27,14.78 2.21,15.05 2.34,15.27L4.34,18.73C4.46,18.95 4.73,19.03 4.95,18.95L7.44,17.94C7.96,18.34 8.5,18.68 9.13,18.93L9.5,21.58C9.54,21.82 9.75,22 10,22H14C14.25,22 14.46,21.82 14.5,21.58L14.87,18.93C15.5,18.67 16.04,18.34 16.56,17.94L19.05,18.95C19.27,19.03 19.54,18.95 19.66,18.73L21.66,15.27C21.78,15.05 21.73,14.78 21.54,14.63L19.43,12.97Z"/></svg>';
var IC_MINUS = '<svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 12h12" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/></svg>';
var IC_PLUS = '<svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 12h12M12 6v12" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/></svg>';
var IC_POWER = '<svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4v7" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/><path d="M7.3 7.2a7 7 0 1 0 9.4 0" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/></svg>';
var sigStufe = (db) => db >= -55 ? 4 : db >= -67 ? 3 : db >= -75 ? 2 : db >= -85 ? 1 : 0;
var sigHtml = (db) => {
  const n4 = sigStufe(db);
  return `<span class="ger-sig s${n4}" title="Signal ${de(db, 0)} dBm" aria-label="Signal ${n4} von 4">${[1, 2, 3, 4].map((k2) => `<i class="${k2 <= n4 ? "an" : ""}"></i>`).join("")}</span>`;
};

// src/tabellen.js
var FARBE = { bereit: "#8e8e93", heizt: "#ff9f0a", trocknen: "#ff9f0a", aus: "#8e8e93", frost: "#64d2ff", offline: "#ff453a", laeuft: "#0a84ff", pause: "#bf5af2" };
var WIEDER = { einmal: "einmalig", woche: "jede Woche", "2wochen": "alle 2 Wochen" };
var AUSNAHME = { arbeit: "zusätzlich arbeiten", zeiten: "andere Zeiten", frei: "frei" };
var HEIZER = (g2) => ["heizung", "heizkoerper"].includes(g2.rolle);
var TYP_TEXT = (g2) => g2.rolle === "pumpe" ? "Pumpe" : HEIZER(g2) ? g2.typ === "konvektor" ? "Konvektor" : "Ölradiator" : ["trockner", "bautrockner"].includes(g2.rolle) ? "Bautrockner" : "Steckdose";
var MODI = [["plan", "Zeitplan"], ["thermo", "Thermostat"], ["bedarf", "Bei Bedarf"], ["hand", "Hand"], ["aus", "Aus"]];
var FREI_TEXT = { frost: "nur Frostschutz", absenk: "abgesenkt", aus: "alles aus" };
var ARTEN = {
  m_selbst: "selbst_ein",
  m_offline: "offline",
  m_trocken: "trockenlauf",
  m_dauer: "dauerlauf",
  m_zyklen: "zyklen_oft",
  m_leistung: "keine_leistung",
  m_frost: "frostgefahr",
  m_kalt: "zu_kalt",
  m_fuehler: "fuehler_fehlt",
  m_wetter: "kein_wetter",
  m_hand: "hand_zu_lange"
};
var TICKET_STATUS = { neu: "neu", angenommen: "angenommen", in_arbeit: "in Arbeit", geloest: "gelöst", geschlossen: "geschlossen", verworfen: "verworfen", offen: "neu", erledigt: "geschlossen" };
var kwVon = (b3) => zahl(b3.kw) ? Number(b3.kw) : b3.geraete.reduce((s4, g2) => s4 + (g2.an ? g2.kw : 0), 0);
var wertHtml = (b3) => b3.pumpe ? `${zahl(b3.zyklen) ? b3.zyklen : "–"}<small> Zyklen</small>` : b3.t !== null ? `${de(b3.t)}<small>°C</small>` : "–";
var illu = (b3) => b3.pumpe ? bcSchacht(b3.z === "laeuft") : bcContainer(BEREICH_FARBEN[b3.f % BEREICH_FARBEN.length], b3.z === "pause" || b3.z === "bereit" ? "aus" : b3.z, b3);
var TEXT_MOCKUP = (b3) => b3.boost ? "⚡ schnell aufheizen" : {
  heizt: b3.bedarf && b3.bedarfBis ? `heizt bis ${b3.bedarfBis}` : b3.t === null ? "an · Thermostat regelt" : "heizt · Arbeitszeit",
  trocknen: "Kleidung trocknen",
  aus: "aus",
  frost: "Frostschutz",
  offline: "nicht erreichbar",
  laeuft: "Pumpe läuft",
  pause: "pausiert · Tür offen",
  bereit: "bei Bedarf · nur Frostschutz"
}[b3.z] || "";
var TEXT = (b3) => b3.text || TEXT_MOCKUP(b3);
var BATTERIE_SCHWACH = 25;
var WARTE = {
  anschluss_voll: (a3) => `${a3} ausgelastet`,
  max_gleichzeitig: () => "höchstens gleichzeitig erreicht",
  mindestpause: () => "Mindestpause",
  rundlauf: () => "Rundlauf",
  anlauf: () => "Anlaufstaffel"
};
var WETTER_TEXT = {
  sunny: "Sonnig",
  "clear-night": "Klar",
  exceptional: "Unwetter",
  partlycloudy: "Heiter",
  "partlycloudy-night": "Heiter",
  cloudy: "Bewölkt",
  windy: "Windig",
  "windy-variant": "Windig",
  rainy: "Regen",
  pouring: "Starkregen",
  hail: "Hagel",
  lightning: "Gewitter",
  "lightning-rainy": "Gewitter",
  fog: "Nebel",
  snowy: "Schnee",
  "snowy-rainy": "Schneeregen"
};

// src/himmel.js
var HIMMEL_FS = "// Hintergrund „Himmel hinter einer Glasscheibe“: Stimmung nach Tageszeit und Wetter.\n// Eigene Umsetzung (WebGL 1 / GLSL ES 1.0). Einheiten: CSS-Pixel, y nach unten.\n#ifdef GL_FRAGMENT_PRECISION_HIGH\nprecision highp float;\n#else\nprecision mediump float;\n#endif\n\nuniform vec2 uRes;        // Gerätepixel\nuniform float uDpr;\nuniform float uTime;      // Sekunden\nuniform vec3 uG1, uG2, uG3, uF1, uF2, uF3;   // Verlauf und Lichtflecken der Stimmung\nuniform float uBlobA, uSat;\nuniform vec3 uDunstC; uniform float uDunst;\nuniform vec3 uWolkeD, uWolkeH, uNebelC;\nuniform float uWolken, uRegen, uSchnee, uNebel, uSonne, uNachtKlar, uBlitz, uBlitzX;\nuniform vec2 uSonnePos; uniform vec3 uSonneF;\nuniform vec2 uMondPos; uniform float uMondK, uMondSeite;   // Mond: Ort, cos(2π·Mondalter), +1 zunehmend / −1 abnehmend\n\nvec2 R;\n\nfloat h11(float p) { p = fract(p * .1031); p *= p + 33.33; p *= p + p; return fract(p); }\nvec3 h31(float p) { vec3 q = fract(vec3(p) * vec3(.1031, .1030, .0973)); q += dot(q, q.yzx + 33.33); return fract((q.xxy + q.yzz) * q.zyx); }\nfloat h21(vec2 p) { vec3 q = fract(vec3(p.xyx) * .1031); q += dot(q, q.yzx + 33.33); return fract((q.x + q.y) * q.z); }\nfloat rausch(vec2 p) {\n  vec2 i = floor(p), f = fract(p), u = f * f * (3. - 2. * f);\n  return mix(mix(h21(i), h21(i + vec2(1., 0.)), u.x), mix(h21(i + vec2(0., 1.)), h21(i + vec2(1., 1.)), u.x), u.y);\n}\nfloat fbm(vec2 p) {\n  float s = 0., a = .5;\n  for (int i = 0; i < 5; i++) { s += a * rausch(p); p = p * 2.03 + vec2(1.7, 9.2); a *= .5; }\n  return s;\n}\n\nvec3 fleck(vec3 col, vec3 f, vec2 c, float r, float ph, vec2 p) {\n  float k = .5 - .5 * cos(6.2832 * uTime / 14. + ph);\n  c += vec2(30., 40.) * k; r *= 1. + .15 * k;\n  float g = dot(f, vec3(.299, .587, .114));\n  f = mix(vec3(g), f, uSat);\n  float d = length(p - c) / (r + 60.);\n  return mix(col, f, uBlobA * exp(-d * d * 2.2));\n}\n\nvec3 grund(vec2 p) {\n  float a = radians(165.);\n  vec2 dir = vec2(sin(a), -cos(a));\n  float t = clamp(dot(p - R * .5, dir) / (abs(R.x * dir.x) + abs(R.y * dir.y)) + .5, 0., 1.);\n  vec3 col = t < .5 ? mix(uG1, uG2, t * 2.) : mix(uG2, uG3, t * 2. - 1.);\n  col = fleck(col, uF1, vec2(70., 70.), 130., 0., p);\n  col = fleck(col, uF2, vec2(R.x - 40., 420.), 120., -2.244, p);\n  col = fleck(col, uF3, vec2(140., R.y - 60.), 100., -4.039, p);\n  return col;\n}\n\n/* Alles hinter der Scheibe */\nvec3 szene(vec2 p) {\n  vec2 uv = p / R;\n  vec3 col = grund(p);\n\n  if (uSonne > .01) {\n    vec2 d = p - uSonnePos * R;\n    float r = length(d) / R.y;\n    float ang = atan(d.y, d.x);\n    float strahl = pow(rausch(vec2(ang * 11., uTime * .04)), 4.) * exp(-r * 4.) * smoothstep(.02, .08, r) * .05;\n    // gedämpft, damit die Schrift auf dem Glas davor lesbar bleibt\n    col += uSonneF * (exp(-r * 7.) * .08 + exp(-r * 30.) * .14 + strahl) * uSonne;\n    col = mix(col, vec3(1., .98, .93), smoothstep(.016, .011, r) * .55 * uSonne);\n  }\n\n  if (uNachtKlar > .01) {\n    vec2 id = floor(p / 26.), f = fract(p / 26.) - .5;\n    vec3 n = h31(id.x * 57.3 + id.y * 113.1);\n    float s = smoothstep(.05 + .05 * n.z, 0., length(f - (n.xy - .5) * .7)) * step(.6, n.z);\n    s *= .55 + .45 * sin(uTime * (1. + n.x * 3.) + n.y * 6.28);\n    col += vec3(.9, .95, 1.) * s * smoothstep(.9, .25, uv.y) * uNachtKlar;\n    vec2 mp = uMondPos * R, mq = (p - mp) / 20.;\n    float mr = length(p - mp), anteil = .5 - .5 * uMondK;   // beleuchteter Anteil der Scheibe\n    col += vec3(.55, .65, .9) * exp(-mr / 70.) * .35 * (.2 + .8 * anteil) * uNachtKlar;\n    float scheibe = smoothstep(21., 19.5, mr);\n    // Schattengrenze: beleuchtet, wo x (zur Lichtseite) über uMondK·√(1−y²) liegt\n    float grenze = uMondK * sqrt(max(1. - mq.y * mq.y, 0.));\n    float licht = smoothstep(grenze - .06, grenze + .06, mq.x * uMondSeite);\n    vec3 mf = vec3(.95, .94, .88) - fbm((p - mp) * .14) * .3;\n    col = mix(col, mix(col * .75 + mf * .06, mf, licht), scheibe * uNachtKlar);\n  }\n\n  if (uWolken > .01) {\n    vec2 q = uv * vec2(R.x / R.y, 1.) * 2.4 + vec2(uTime * .015, 0.);\n    float w = fbm(q + fbm(q * 1.6 + vec2(0., uTime * .02)) * 1.3);\n    float bed = mix(.62, .22, clamp(uWolken, 0., 1.));\n    float dichte = smoothstep(bed, bed + .38, w) * (1. - .35 * uv.y);\n    float licht = smoothstep(.3, .85, fbm(q * 2.1 + vec2(3.1, -uTime * .01)) * .6 + (w - bed) * .9);\n    vec3 wf = mix(uWolkeD, uWolkeH, licht);\n    wf += vec3(.8, .84, 1.) * uBlitz * (.25 + licht * .55) * .6;\n    col = mix(col, wf, clamp(dichte * uWolken * 1.15, 0., 1.));\n  }\n\n  if (uBlitz > .01) {\n    float y = uv.y;\n    float x = uBlitzX * R.x + (fbm(vec2(y * 7., uBlitzX * 40.)) - .5) * 160. + (rausch(vec2(y * 40., uBlitzX * 9.)) - .5) * 18.;\n    float strahl = smoothstep(2.5, 0., abs(p.x - x)) + smoothstep(14., 0., abs(p.x - x)) * .35;\n    col += vec3(.9, .92, 1.) * strahl * smoothstep(.62, .45, y) * uBlitz;\n    col += uBlitz * .05;\n  }\n\n  if (uRegen > .01) {\n    vec2 rp = vec2(p.x + p.y * .2, p.y);\n    float sp = floor(rp.x / 5.);\n    vec3 n = h31(sp * 13.7 + 2.);\n    float y = fract(rp.y / (R.y * .7) - uTime * (1.1 + n.x * .8) + n.y);\n    float strich = smoothstep(0., .015, y) * smoothstep(.16, .02, y) * smoothstep(.22, 0., abs(fract(rp.x / 5.) - .5));\n    col += vec3(.75, .82, .95) * strich * step(n.z, .28 * min(uRegen, 1.4)) * .16;\n  }\n\n  if (uNebel > .01) {\n    vec2 q = uv * vec2(R.x / R.y, 1.) * 2.2;\n    float n1 = fbm(q * vec2(.7, 1.5) + vec2(uTime * .03, 0.));\n    float n2 = fbm(q * vec2(1.4, 2.6) - vec2(uTime * .055, uTime * .01) + 5.2);\n    float dichte = smoothstep(.32, .8, n1 * .55 + n2 * .55);\n    vec3 nf = mix(uNebelC * .92, uNebelC * 1.18, dichte);\n    col = mix(col, nf, clamp(.3 + dichte * .6 * (.55 + .45 * uv.y), 0., 1.) * uNebel);\n  }\n\n  if (uSchnee > .01) {\n    for (int k = 0; k < 3; k++) {\n      float fk = float(k) / 2.;\n      float zelle = mix(95., 26., fk), rad = mix(4.2, 1.1, fk), v = mix(62., 22., fk), weich = mix(3.2, .6, fk);\n      vec2 q = p + vec2(sin(uTime * .4 + fk * 3.) * 24., -uTime * v);\n      vec2 id = floor(q / zelle), f = q - (id + .5) * zelle;\n      vec3 n = h31(id.x * 31.7 + id.y * 17.3 + fk * 71.);\n      vec2 o = (n.xy - .5) * zelle * .7 + vec2(sin(uTime * (.7 + n.z) + n.x * 6.28) * zelle * .12, 0.);\n      float fl = smoothstep(rad + weich, rad - weich * .3, length(f - o)) * step(n.z, .8);\n      col = mix(col, vec3(1.), fl * mix(.8, .55, fk) * uSchnee);\n    }\n  }\n\n  return mix(col, uDunstC, uDunst);\n}\n\n/* Tropfen auf der Scheibe: xy = Versatz für die Brechung, z = Wasser, w = klares Glas */\nvec4 laufend(vec2 p) {\n  float cw = 32.;\n  float spalte = floor(p.x / cw);\n  vec3 n = h31(spalte * 17.13 + 3.1);\n  if (n.x > .45 * uRegen) return vec4(0.);\n  float x0 = (spalte + .5) * cw + (n.y - .5) * cw * .18;\n  float dauer = mix(4.5, 9., n.z) / max(uRegen, .6);\n  float k = uTime / dauer + n.x * 7.;\n  vec3 m = h31(spalte * 3.7 + floor(k) * 11.9);\n  float stufen = 7.;\n  float g = fract(k) * stufen;\n  g = (floor(g) + smoothstep(.5, 1., fract(g))) / stufen;\n  float yK = mix(-.08, 1.12, g) * R.y;\n  float r = mix(4.5, 8.5, m.x);\n  float xl = x0 + sin(p.y * .02 + m.y * 6.) * 2.5;\n  vec2 q = vec2(p.x - xl, p.y - yK);\n  q.y *= q.y < 0. ? .6 : 1.05;\n  float wasser = smoothstep(1., .85, length(q) / r);\n  vec2 v = q / r;\n  float oben = yK - p.y;\n  float lang = mix(70., 200., m.z);\n  float xs = abs(p.x - xl);\n  float inSpur = step(0., oben) * smoothstep(lang, 0., oben);\n  float abst = 15.;\n  float yr = mod(oben, abst) - abst * .5;\n  float rr = r * .42 * inSpur * (.55 + .45 * h11(floor(oben / abst) + spalte * 7.));\n  vec2 qr = vec2(p.x - xl, yr);\n  float perle = rr > .2 ? smoothstep(rr, rr * .7, length(qr)) * step(abst * .7, oben) : 0.;\n  if (perle > wasser) { wasser = perle; v = qr / max(rr, .5); }\n  float klar = max(smoothstep(r * .55, r * .25, xs) * step(0., oben) * smoothstep(lang * 1.4, 0., oben), wasser);\n  return vec4(v, wasser, klar);\n}\n\nvec4 stehend(vec2 p, float zelle, float rMin, float rMax, float dichte, float seed) {\n  vec2 id = floor(p / zelle);\n  vec3 n = h31(id.x * 127.1 + id.y * 311.7 + seed);\n  float per = mix(7., 15., n.z);\n  float t = uTime / per + n.x * 5.;\n  float leben = fract(t);\n  vec3 m = h31(id.x * 7.3 + id.y * 13.1 + seed + floor(t) * 1.7);\n  float r = mix(rMin, rMax, m.x) * smoothstep(0., .12, leben) * smoothstep(1., .85, leben) * step(n.y, dichte);\n  if (r < .3) return vec4(0.);\n  vec2 c = (id + .5) * zelle + (m.yz - .5) * (zelle - 2. * rMax) * .9;\n  vec2 q = p - c;\n  float wasser = smoothstep(r, r * .8, length(q));\n  return vec4(q / r, wasser, wasser);\n}\n\nvoid main() {\n  R = uRes / uDpr;\n  vec2 p = vec2(gl_FragCoord.x, uRes.y - gl_FragCoord.y) / uDpr;\n  vec3 col = szene(p);\n  if (uRegen > .01) {\n    vec4 a = laufend(p);\n    vec4 b = stehend(p, 19., 1.2, 3.4, .5 + .3 * min(uRegen, 1.), 1.);\n    vec4 c = stehend(p, 40., 3.5, 8.5, .5 * min(uRegen, 1.), 7.);\n    float weg = a.w;\n    b.z *= 1. - weg; c.z *= 1. - weg;\n    vec4 w = a;\n    if (b.z > w.z) w = vec4(b.xy, b.z, max(a.w, b.z));\n    if (c.z > w.z) w = vec4(c.xy, c.z, max(a.w, c.z));\n    float wasser = w.z * min(uRegen, 1.);\n    if (wasser > .01) {\n      vec2 qn = w.xy;                                  // Lage im Tropfen, Mitte 0, Rand 1\n      float lq = length(qn);\n      // Linse: der Himmel erscheint verkleinert und auf dem Kopf\n      vec3 linse = szene(p - qn * 22. + vec2(0., -6.)) * 1.08;\n      linse *= 1. - .38 * smoothstep(.15, 1., -qn.y) * smoothstep(.4, 1., lq);   // oben dunkler Rand\n      linse += vec3(.9, .95, 1.) * .22 * smoothstep(.1, .9, qn.y) * smoothstep(1., .75, lq); // unten helle Sichel\n      linse *= 1. - .25 * smoothstep(.72, 1., lq);                              // Kante\n      linse += vec3(1.) * .75 * smoothstep(.2, .04, length(qn - vec2(-.3, -.42))); // Glanzpunkt\n      col = mix(col, linse, wasser);\n      col *= 1. - .18 * smoothstep(.0, .5, wasser) * smoothstep(1., .5, wasser);   // Schatten am Außenrand\n    }\n    col *= 1. - .035 * max(a.w - wasser, 0.);         // nasse Spur hinter laufenden Tropfen\n    float beschlag = (1. - max(w.w, wasser)) * .07 * min(uRegen, 1.);\n    col = mix(col, uNebelC, beschlag);\n  }\n  if (uSchnee > .01) {\n    vec2 uv = p / R;\n    float rand = min(min(uv.x, 1. - uv.x) * R.x / R.y * 1.4, (1. - uv.y) * .8);\n    float eis = smoothstep(.09, 0., rand + (fbm(p * .018) - .5) * .14) * (.4 + .6 * uv.y);\n    float kristall = smoothstep(.55, .75, fbm(p * .12 + 3.)) * .5 + .5;\n    col = mix(col, vec3(.93, .97, 1.), eis * kristall * .6 * uSchnee);\n  }\n  gl_FragColor = vec4(col, 1.);\n}\n";
var hex = (h3) => [1, 3, 5].map((i7) => parseInt(h3.slice(i7, i7 + 2), 16) / 255);
var HIMMEL_FARBEN = {
  dunkel: {
    morgen: ["#2e2748", "#4a3150", "#6b4040", "#ff8a5c", "#6a7bd6", "#d07ab8"],
    tag: ["#1c3552", "#1f4a70", "#2a5575", "#ffc766", "#3aa0ff", "#7fd0ff"],
    abend: ["#2a1a36", "#45203d", "#5a2a2c", "#ff7a2e", "#d0457a", "#7a4bd0"],
    nacht: ["#070d1c", "#0c1528", "#131a33", "#2c3e8a", "#1b4a7a", "#4b3a8a"]
  },
  hell: {
    morgen: ["#ffd9c7", "#f5e0f0", "#cfdcff", "#ff9a6a", "#9fb4ff", "#f0a0c8"],
    tag: ["#cfe6ff", "#e3f1ff", "#fff3d6", "#ffd060", "#6ab8ff", "#a8e0ff"],
    abend: ["#ffd2b0", "#f7c6d8", "#d9ccff", "#ff8a3a", "#ff6f9a", "#a58aff"],
    nacht: ["#b9c4e0", "#c9cde6", "#d8d0ec", "#6d80c8", "#7fa3dc", "#9a88d2"]
  }
};
function himmelZiel(phase, wetter2, hell) {
  const f3 = HIMMEL_FARBEN[hell ? "hell" : "dunkel"][phase].map(hex), nacht = phase === "nacht", warm = phase === "morgen" || phase === "abend";
  const gew = wetter2 === "gewitter";
  const w2 = { klar: 0, wolkig: 0.8, regen: 0.95, gewitter: 1, nebel: 0.2, schnee: 0.55 }[wetter2];
  let wolkeD, wolkeH, nebelC, dunstC;
  if (hell) {
    wolkeD = gew ? [0.4, 0.43, 0.5] : nacht ? [0.5, 0.55, 0.65] : [0.54, 0.58, 0.65];
    wolkeH = gew ? [0.7, 0.73, 0.8] : nacht ? [0.78, 0.81, 0.88] : warm ? [0.96, 0.88, 0.86] : [0.88, 0.9, 0.94];
    nebelC = [0.87, 0.89, 0.91];
    dunstC = gew ? [0.6, 0.64, 0.7] : [0.79, 0.81, 0.84];
  } else {
    wolkeD = gew ? [0.06, 0.07, 0.1] : nacht ? [0.05, 0.06, 0.09] : [0.13, 0.15, 0.2];
    wolkeH = gew ? [0.3, 0.32, 0.38] : nacht ? [0.18, 0.2, 0.27] : warm ? [0.55, 0.42, 0.45] : [0.47, 0.51, 0.58];
    nebelC = nacht ? [0.2, 0.23, 0.28] : [0.42, 0.46, 0.52];
    dunstC = gew ? [0.11, 0.13, 0.19] : [0.24, 0.27, 0.33];
  }
  const sonne = { morgen: [[0.16, 0.34], [1, 0.62, 0.36]], tag: [[0.22, 0.1], [1, 0.86, 0.58]], abend: [[0.84, 0.36], [1, 0.5, 0.3]], nacht: [[0.5, 0.1], [0, 0, 0]] }[phase];
  return {
    uG1: f3[0],
    uG2: f3[1],
    uG3: f3[2],
    uF1: f3[3],
    uF2: f3[4],
    uF3: f3[5],
    uBlobA: { klar: 0.7, wolkig: 0.28, regen: 0.22, gewitter: 0.12, nebel: 0.2, schnee: 0.3 }[wetter2] * (nacht ? 0.65 : 1),
    uSat: { klar: 1, wolkig: 0.75, regen: 0.7, gewitter: 0.6, nebel: 0.5, schnee: 0.6 }[wetter2],
    uDunstC: dunstC,
    uDunst: { klar: 0, wolkig: 0.1, regen: 0.18, gewitter: 0.22, nebel: 0.12, schnee: 0.1 }[wetter2],
    uWolkeD: wolkeD,
    uWolkeH: wolkeH,
    uNebelC: nebelC,
    uWolken: w2,
    uRegen: wetter2 === "regen" ? 1 : gew ? 1.5 : 0,
    uSchnee: wetter2 === "schnee" ? 1 : 0,
    uNebel: wetter2 === "nebel" ? 1 : 0,
    uSonne: wetter2 === "klar" && !nacht ? 1 : 0,
    uNachtKlar: wetter2 === "klar" && nacht ? 1 : 0,
    uSonnePos: sonne[0],
    uSonneF: sonne[1].map((v2) => v2 * (hell ? 0.8 : 1)),
    uMondPos: [0.8, 0.13],
    uMondK: -1,
    uMondSeite: 1
  };
}
function himmelZielBei(hoehe, steigt, wetter2, hell) {
  const anteil = (a4, b4) => Math.min(1, Math.max(0, (hoehe - a4) / (b4 - a4))), warm = steigt ? "morgen" : "abend";
  const [a3, b3, w2] = hoehe < 0 ? ["nacht", warm, anteil(-8, 0)] : [warm, "tag", anteil(4, 15)];
  const za = himmelZiel(a3, wetter2, hell), zb = himmelZiel(b3, wetter2, hell);
  const m3 = (x2, y3) => Array.isArray(x2) ? x2.map((v2, i7) => v2 + (y3[i7] - v2) * w2) : x2 + (y3 - x2) * w2;
  return Object.fromEntries(Object.keys(za).map((n4) => [n4, m3(za[n4], zb[n4])]));
}
function himmelsBahn(sonne, jetzt = Date.now()) {
  const a3 = sonne && sonne.attributes || {}, auf = Date.parse(a3.next_rising), ab = Date.parse(a3.next_setting);
  const oben = !sonne || sonne.state !== "below_horizon";
  let t5 = 0.5;
  if (Number.isFinite(auf) && Number.isFinite(ab)) {
    const start = (oben ? auf : ab) - 864e5, ende = oben ? ab : auf;
    if (ende > start) t5 = Math.min(1, Math.max(0, (jetzt - start) / (ende - start)));
  }
  return { t: t5, oben };
}
function mondAlter(jetzt = Date.now()) {
  const p4 = (jetzt - Date.UTC(2e3, 0, 6, 18, 14)) / 864e5 / 29.530588853 % 1;
  return p4 < 0 ? p4 + 1 : p4;
}
var himmelsBogen = (t5) => [0.08 + 0.84 * t5, 0.4 - 0.3 * Math.sin(Math.PI * t5)];
function himmelLauf(sonne, jetzt = Date.now()) {
  const b3 = himmelsBahn(sonne, jetzt), alter = mondAlter(jetzt), steigt = sonne && sonne.attributes && sonne.attributes.rising;
  return {
    uSonnePos: himmelsBogen(b3.oben ? b3.t : steigt === false ? 1 : 0),
    uMondPos: himmelsBogen(b3.oben ? 0.5 : b3.t),
    uMondK: Math.cos(2 * Math.PI * alter),
    uMondSeite: alter < 0.5 ? 1 : -1
  };
}
var HIMMEL_VS = "attribute vec2 a; void main() { gl_Position = vec4(a, 0., 1.); }";
var Himmel = class _Himmel {
  /* Gibt null zurück, wenn WebGL fehlt oder der Shader nicht übersetzt – dann bleibt der CSS-Hintergrund. */
  static an(bg) {
    try {
      const h3 = new _Himmel(bg);
      return h3.gl ? h3 : null;
    } catch (e6) {
      console.warn("Himmel aus:", e6);
      return null;
    }
  }
  constructor(bg) {
    this.bg = bg;
    this.cv = document.createElement("canvas");
    this.cv.className = "himmel";
    const gl = this.cv.getContext("webgl", { antialias: false, alpha: false, powerPreference: "low-power" });
    if (!gl) return;
    const sh = (typ, src) => {
      const s4 = gl.createShader(typ);
      gl.shaderSource(s4, src);
      gl.compileShader(s4);
      if (!gl.getShaderParameter(s4, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s4));
      return s4;
    };
    const pr = gl.createProgram();
    gl.attachShader(pr, sh(gl.VERTEX_SHADER, HIMMEL_VS));
    gl.attachShader(pr, sh(gl.FRAGMENT_SHADER, HIMMEL_FS));
    gl.linkProgram(pr);
    if (!gl.getProgramParameter(pr, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(pr));
    gl.useProgram(pr);
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const a3 = gl.getAttribLocation(pr, "a");
    gl.enableVertexAttribArray(a3);
    gl.vertexAttribPointer(a3, 2, gl.FLOAT, false, 0, 0);
    this.gl = gl;
    this.pr = pr;
    this.loc = {};
    this.jetzt = null;
    this.ziel = null;
    this.blitz = 0;
    this.naechsterBlitz = 3;
    this.blitzX = 0.5;
    bg.insertBefore(this.cv, bg.querySelector(".partikel"));
    bg.classList.add("gl-an");
    this.ruhig = matchMedia("(prefers-reduced-motion: reduce)").matches;
    this.ro = new ResizeObserver(() => this.groesse());
    this.ro.observe(bg);
    this.groesse();
    this.t0 = performance.now();
    this.letzt = 0;
    this.schleife = this.schleife.bind(this);
    requestAnimationFrame(this.schleife);
  }
  groesse() {
    const d3 = Math.min(devicePixelRatio || 1, 1.5);
    this.dpr = d3;
    this.cv.width = Math.round(this.bg.clientWidth * d3);
    this.cv.height = Math.round(this.bg.clientHeight * d3);
    this.gl.viewport(0, 0, this.cv.width, this.cv.height);
  }
  /* Stimmung setzen: mit Sonnenhöhe stufenlos, sonst nach Tageszeit; lauf = Sonne und Mond (himmelLauf) */
  setze(phase, wetter2, hell, sonne = null, lauf = null) {
    const a3 = sonne && sonne.attributes, hoehe = a3 ? Number(a3.elevation) : NaN;
    this.ziel = { ...Number.isFinite(hoehe) ? himmelZielBei(hoehe, a3.rising !== false, wetter2, hell) : himmelZiel(phase, wetter2, hell), ...lauf };
    this.gewitter = wetter2 === "gewitter";
    if (!this.jetzt) this.jetzt = JSON.parse(JSON.stringify(this.ziel));
  }
  u(n4, v2) {
    const l4 = this.loc[n4] ??= this.gl.getUniformLocation(this.pr, n4);
    if (l4 === null) return;
    Array.isArray(v2) ? this.gl["uniform" + v2.length + "fv"](l4, v2) : this.gl.uniform1f(l4, v2);
  }
  /* Seite verlassen: Zeichnen beenden, Leinwand entfernen und WebGL-Kontext freigeben (sonst stapeln sich beim Wiederkommen Kontexte) */
  stop() {
    this.aus = true;
    if (this.ro) this.ro.disconnect();
    try {
      const x2 = this.gl.getExtension("WEBGL_lose_context");
      if (x2) x2.loseContext();
    } catch (e6) {
    }
    if (this.cv.parentNode) this.cv.parentNode.removeChild(this.cv);
    this.bg.classList.remove("gl-an");
  }
  schleife(ms) {
    if (this.aus) return;
    requestAnimationFrame(this.schleife);
    const t5 = (ms - this.t0) / 1e3;
    if (t5 - this.letzt < 1 / 30 || !this.ziel) return;
    const dt = Math.min(t5 - this.letzt, 0.1);
    this.letzt = t5;
    const k2 = 1 - Math.exp(-dt / 0.9);
    for (const n4 in this.ziel) {
      const z2 = this.ziel[n4], j2 = this.jetzt[n4];
      this.jetzt[n4] = Array.isArray(z2) ? z2.map((v2, i7) => j2[i7] + (v2 - j2[i7]) * k2) : j2 + (z2 - j2) * k2;
    }
    if (this.gewitter && !this.ruhig) {
      this.naechsterBlitz -= dt;
      if (this.naechsterBlitz <= 0) {
        this.blitzT = 0;
        this.blitzX = 0.2 + Math.random() * 0.6;
        this.naechsterBlitz = 5 + Math.random() * 7;
      }
      if (this.blitzT !== void 0) {
        this.blitzT += dt;
        const b3 = this.blitzT;
        this.blitz = b3 < 0.08 ? 1 : b3 < 0.16 ? 0.15 : b3 < 0.24 ? 0.8 : Math.max(0, 0.8 - (b3 - 0.24) * 3);
        if (b3 > 0.6) this.blitzT = void 0;
      }
    } else this.blitz = 0;
    const gl = this.gl;
    this.u("uRes", [this.cv.width, this.cv.height]);
    this.u("uDpr", this.dpr);
    this.u("uTime", this.ruhig ? 20 : t5 % 3600);
    for (const n4 in this.jetzt) this.u(n4, this.jetzt[n4]);
    this.u("uBlitz", this.blitz);
    this.u("uBlitzX", this.blitzX);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }
};
var zufall = (seed) => () => (seed = (seed * 9301 + 49297) % 233280) / 233280;
function partikel(phase, wetter2) {
  const r5 = zufall(42), z2 = (a3, b3) => (a3 + r5() * (b3 - a3)).toFixed(2);
  const tropfen = (n4) => [...Array(n4)].map(() => `<i class="tropfen" style="left:${z2(-10, 130)}%;--l:${z2(12, 26)}px;--d:${z2(0.55, 1)}s;--v:-${z2(0, 2)}s;opacity:${z2(0.35, 0.9)}"></i>`).join("");
  const teile = [];
  if (wetter2 === "regen") teile.push(tropfen(70));
  if (wetter2 === "gewitter") teile.push(tropfen(120), '<i class="blitzlicht"></i>');
  if (wetter2 === "schnee") teile.push([...Array(60)].map(() => `<i class="flocke" style="left:${z2(-5, 105)}%;--d:${z2(7, 14)}s;--v:-${z2(0, 14)}s"><b style="--s:${z2(2, 5)}px;--w:${z2(2, 4)}s"></b></i>`).join(""));
  if (wetter2 === "nebel") teile.push([...Array(4)].map((_2, k2) => `<i class="schwade" style="top:${10 + k2 * 22}%;--d:${24 + k2 * 7}s;--v:-${k2 * 6}s"></i>`).join(""));
  if (wetter2 === "wolkig" || wetter2 === "regen" || wetter2 === "gewitter") teile.push([...Array(3)].map((_2, k2) => `<i class="wolke" style="top:${z2(-5, 45)}%;--d:${z2(50, 80)}s;--v:-${z2(0, 60)}s"></i>`).join(""));
  if (wetter2 === "klar" && phase === "nacht") teile.push([...Array(45)].map(() => `<i class="stern" style="left:${z2(0, 100)}%;top:${z2(0, 60)}%;--v:-${z2(0, 4)}s;--s:${z2(1, 2.4)}px"></i>`).join(""));
  if (wetter2 === "klar" && phase !== "nacht") teile.push('<i class="strahlen"></i>');
  return teile.join("");
}
function phaseAusSonne(sonne) {
  if (!sonne) return "tag";
  const a3 = sonne.attributes || {}, hoehe = Number(a3.elevation), steigt = a3.rising;
  if (!zahl(hoehe)) return sonne.state === "below_horizon" ? "nacht" : "tag";
  if (hoehe < -6) return "nacht";
  if (hoehe < 12) return steigt === false ? "abend" : "morgen";
  return "tag";
}

// src/diagramme.js
var CHARTS = {};
function linie(id, reihen, einheit, vb = null) {
  const W = 320, H2 = 160, L2 = 28, R2 = vb ? 30 : 8, T2 = 16, U = 22;
  const alle = reihen.flatMap((s4) => s4.v.filter((v2) => zahl(v2)));
  if (!alle.length) return '<div class="leer">Noch keine Werte</div>';
  let lo = Math.floor(Math.min(...alle) / 5) * 5, hi = Math.ceil(Math.max(...alle) / 5) * 5;
  if (hi === lo) hi = lo + 5;
  const n4 = (hi - lo) / 5;
  const x2 = (i7) => L2 + i7 / 24 * (W - L2 - R2), y3 = (v2) => T2 + (1 - (v2 - lo) / (hi - lo)) * (H2 - T2 - U);
  const raster = [...Array(n4 + 1)].map((_2, k2) => lo + k2 * 5).map((v2) => `<line x1="${L2}" x2="${W - R2}" y1="${y3(v2)}" y2="${y3(v2)}" class="gr"/><text x="${L2 - 5}" y="${y3(v2) + 3}" class="ax" text-anchor="end">${v2}°</text>`).join("");
  const achse = [0, 6, 12, 18, 24].map((h3) => `<text x="${x2(h3)}" y="${H2 - 6}" class="ax" text-anchor="middle">${String(h3).padStart(2, "0")}</text>`).join("");
  const pfade = reihen.map((s4, k2) => `<path d="${s4.v.map((v2, i7) => !zahl(v2) ? "" : `${i7 && zahl(s4.v[i7 - 1]) ? "L" : "M"}${x2(i7).toFixed(1)} ${y3(v2).toFixed(1)}`).join("") || `M${L2} ${H2 - U}`}" fill="none" stroke="var(--s${k2 + 1})" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>`).join("");
  let flaeche2 = "", rechts = "", yv = null;
  if (vb && vb.length) {
    const roh2 = Math.max(...vb, 0.01) * 1.1 / n4, schritt = [0.1, 0.2, 0.25, 0.5, 1, 1.5, 2, 2.5, 5].find((st) => st >= roh2) || 10, vmax = schritt * n4;
    yv = (v2) => T2 + (1 - v2 / vmax) * (H2 - T2 - U);
    const wert2 = (i7) => vb[Math.min(i7, vb.length - 1)] || 0, k2 = reihen.length + 1;
    const d3 = [...Array(25)].map((_2, i7) => `${i7 ? "L" : "M"}${x2(i7).toFixed(1)} ${yv(wert2(i7)).toFixed(1)}`).join("");
    flaeche2 = `<defs><linearGradient id="vbg-${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="var(--s${k2})" stop-opacity=".42"/><stop offset="1" stop-color="var(--s${k2})" stop-opacity=".06"/></linearGradient></defs>
      <path class="fl-flaeche" d="${d3}L${x2(24)} ${yv(0)}L${x2(0)} ${yv(0)}z" fill="url(#vbg-${id})"/><path class="fl-linie" d="${d3}" fill="none" stroke="var(--s${k2})" stroke-width="1.5" stroke-linejoin="round" opacity=".8"/>`;
    rechts = [...Array(n4 + 1)].map((_2, q) => q * schritt).map((v2) => `<text x="${W - R2 + 5}" y="${yv(v2) + 3}" class="ax">${de(v2, schritt < 1 ? schritt < 0.25 ? 1 : 2 : 0)}</text>`).join("") + `<text x="${W - R2 + 5}" y="${T2 - 7}" class="ax ax-e">kWh</text>`;
  } else vb = null;
  const links = `<text x="${L2 - 5}" y="${T2 - 7}" class="ax ax-e" text-anchor="end">°C</text>`;
  CHARTS[id] = { art: "linie", x0: L2, x1: W - R2, W, n: 25, reihen, einheit, y: y3, vb, yv, unten: H2 - U };
  return `<svg class="chart" data-chart="${id}" viewBox="0 0 ${W} ${H2}">${raster}${achse}${flaeche2}${pfade}${vb ? links + rechts : ""}<g class="hover"></g></svg>
    <div class="legende">${reihen.map((s4, k2) => `<span><i style="background:var(--s${k2 + 1})"></i>${s4.name} (°C, links)</span>`).join("")}${vb ? `<span><i style="background:var(--s${reihen.length + 1})"></i>Verbrauch (kWh je Stunde, rechts)</span>` : ""}</div>`;
}
function linien(id, reihen, labels, jedes, titel2) {
  const W = 320, H2 = 170, L2 = 28, R2 = 8, T2 = 16, U = 22, n4 = labels.length;
  const alle = reihen.flatMap((s4) => s4.v.filter(zahl));
  if (!alle.length) return '<div class="leer">Noch keine Werte</div>';
  const lo = Math.floor(Math.min(...alle) / 5) * 5, hi = Math.max(lo + 5, Math.ceil(Math.max(...alle) / 5) * 5);
  const x2 = (i7) => L2 + i7 / Math.max(1, n4 - 1) * (W - L2 - R2), y3 = (v2) => T2 + (1 - (v2 - lo) / (hi - lo)) * (H2 - T2 - U);
  const raster = [...Array((hi - lo) / 5 + 1)].map((_2, k2) => lo + k2 * 5).map((v2) => `<line x1="${L2}" x2="${W - R2}" y1="${y3(v2)}" y2="${y3(v2)}" class="gr"/><text x="${L2 - 5}" y="${y3(v2) + 3}" class="ax" text-anchor="end">${v2}°</text>`).join("");
  const achse = labels.map((t5, i7) => i7 % jedes ? "" : `<text x="${x2(i7)}" y="${H2 - 6}" class="ax" text-anchor="middle">${t5}</text>`).join("");
  const pfade = reihen.map((s4) => `<path d="${s4.v.map((v2, i7) => !zahl(v2) ? "" : `${i7 && zahl(s4.v[i7 - 1]) ? "L" : "M"}${x2(i7).toFixed(1)} ${y3(v2).toFixed(1)}`).join("")}" fill="none" stroke="${s4.farbe}" stroke-width="${s4.aussen ? 1.5 : 2}" ${s4.aussen ? 'stroke-dasharray="4 4"' : ""} stroke-linejoin="round" stroke-linecap="round"/>`).join("");
  CHARTS[id] = { art: "linien", x0: L2, x1: W - R2, W, n: n4, reihen, y: y3, unten: H2 - U, titel: titel2 };
  return `<svg class="chart" data-chart="${id}" viewBox="0 0 ${W} ${H2}">${raster}${achse}${pfade}<text x="${L2 - 5}" y="${T2 - 7}" class="ax ax-e" text-anchor="end">°C</text><g class="hover"></g></svg>
    <div class="legende">${reihen.map((s4) => `<span><i style="background:${s4.farbe}"></i>${esc(s4.name)}</span>`).join("")}</div>`;
}
function balken(id, werte, labels, einheit, d3 = 1) {
  werte = werte.map((v2) => zahl(v2) ? Number(v2) : 0);
  const W = 320, H2 = 150, L2 = 28, R2 = 8, T2 = 10, U = 22, n4 = werte.length, hi = Math.max(...werte, 0) * 1.15 || 1;
  const bw = (W - L2 - R2) / n4, y3 = (v2) => T2 + (1 - v2 / hi) * (H2 - T2 - U), stufe = hi > 20 ? 10 : hi > 6 ? 2 : hi > 2 ? 1 : 0.5;
  const raster = [...Array(Math.floor(hi / stufe) + 1)].map((_2, k2) => k2 * stufe).map((v2) => `<line x1="${L2}" x2="${W - R2}" y1="${y3(v2)}" y2="${y3(v2)}" class="gr"/><text x="${L2 - 5}" y="${y3(v2) + 3}" class="ax" text-anchor="end">${de(v2, stufe < 1 ? 1 : 0)}</text>`).join("");
  const b3 = werte.map((v2, i7) => {
    const h3 = H2 - U - y3(v2), bx = L2 + i7 * bw + 1, w2 = bw - 2;
    return `${v2 > 0 ? `<path d="M${bx} ${H2 - U}V${y3(v2) + Math.min(4, h3)}q0 -4 4 -4h${w2 - 8}q4 0 4 4V${H2 - U}z" fill="var(--s1)" class="bar" data-i="${i7}"/>` : ""}
      <text x="${bx + w2 / 2}" y="${H2 - 6}" class="ax" text-anchor="middle">${labels[i7]}</text>`;
  }).join("");
  CHARTS[id] = { art: "balken", werte, labels, einheit, d: d3 };
  return `<svg class="chart" data-chart="${id}" viewBox="0 0 ${W} ${H2}">${raster}${b3}<rect class="treffer" x="0" y="0" width="0" height="0"/></svg>`;
}
function stufen(id, reihen, von, bis, einheit = "W", achse = null, jetzt = null) {
  const W = 320, H2 = 160, L2 = 34, R2 = 8, T2 = 10, U = 22, alle = reihen.flatMap((r5) => r5.punkte.map((p4) => p4[1])).filter(zahl);
  const hi = Math.max(...alle, 0) * 1.1 || 100, x2 = (t5) => L2 + (Math.min(bis, Math.max(von, t5)) - von) / (bis - von) * (W - L2 - R2), y3 = (v2) => T2 + (1 - v2 / hi) * (H2 - T2 - U);
  const stufe = hi > 4e3 ? 1e3 : hi > 2e3 ? 500 : hi > 800 ? 200 : hi > 300 ? 100 : 50;
  const raster = [...Array(Math.floor(hi / stufe) + 1)].map((_2, k2) => k2 * stufe).map((v2) => `<line x1="${L2}" x2="${W - R2}" y1="${y3(v2)}" y2="${y3(v2)}" class="gr"/><text x="${L2 - 5}" y="${y3(v2) + 3}" class="ax" text-anchor="end">${v2 >= 1e3 ? de(v2 / 1e3, 1) + " k" : v2}</text>`).join("");
  const marken = achse || [0, 10, 20, 30, 40, 50, 60].map((m3) => [von + m3 * 6e4, `:${String(m3 % 60).padStart(2, "0")}`]);
  const achseSvg = marken.map(([t5, l4]) => `<text x="${x2(t5)}" y="${H2 - 6}" class="ax" text-anchor="middle">${l4}</text>`).join("");
  const ende = jetzt && jetzt[0] > von && jetzt[0] < bis ? jetzt[0] : bis;
  const pfade = reihen.map((r5) => {
    let d3 = "";
    r5.punkte.forEach(([t5, v2], i7) => {
      const nx = i7 + 1 < r5.punkte.length ? r5.punkte[i7 + 1][0] : ende;
      if (!zahl(v2)) return;
      d3 += `${d3 ? "L" : "M"}${x2(t5).toFixed(1)} ${y3(v2).toFixed(1)}H${x2(nx).toFixed(1)}`;
    });
    return d3 ? `<path d="${d3}" fill="none" stroke="${r5.farbe}" stroke-width="${r5.summe ? 2.4 : 1.6}" ${r5.summe ? "" : 'opacity=".75"'}/>` : "";
  }).join("");
  const jetztSvg = ende < bis ? `<g class="jetzt"><line x1="${x2(ende).toFixed(1)}" x2="${x2(ende).toFixed(1)}" y1="${T2}" y2="${H2 - U}" stroke="var(--s1)" stroke-dasharray="3 3" opacity=".7"/><text x="${x2(ende).toFixed(1)}" y="${T2 - 1}" class="ax" text-anchor="${x2(ende) > W - R2 - 40 ? "end" : "middle"}">jetzt ${jetzt[1]}</text></g>` : "";
  CHARTS[id] = { art: "stufen", einheit, reihen, von, bis, L: L2, B: W - R2, W, x: x2, y: y3, unten: H2 - U };
  return `<svg class="chart" data-chart="${id}" viewBox="0 0 ${W} ${H2}">${raster}${achseSvg}${pfade}${jetztSvg}<g class="hover"></g></svg>`;
}
function streu(id, pkt, k2, d0, grenze = null) {
  const W = 320, H2 = 170, L2 = 30, R2 = 8, T2 = 10, U = 24;
  const tx = [-10, -5, 0, 5, 10, 15], ymax = Math.max(50, Math.ceil(Math.max(...pkt.map((q) => q[1])) / 50) * 50);
  const x2 = (t5) => L2 + (Math.max(-10, Math.min(15, t5)) + 10) / 25 * (W - L2 - R2), y3 = (v2) => T2 + (1 - v2 / ymax) * (H2 - T2 - U);
  const raster = [...Array(ymax / 50 + 1)].map((_2, q) => q * 50).map((v2) => `<line x1="${L2}" x2="${W - R2}" y1="${y3(v2)}" y2="${y3(v2)}" class="gr"/><text x="${L2 - 5}" y="${y3(v2) + 3}" class="ax" text-anchor="end">${v2}</text>`).join("");
  const achse = tx.map((t5) => `<text x="${x2(t5)}" y="${H2 - 8}" class="ax" text-anchor="middle">${t5}°</text>`).join("");
  const t1 = -8, t22 = grenze !== null ? Math.min(15, grenze) : k2 < 0 ? Math.min(15, -d0 / k2) : 15, yy = (t5) => y3(Math.max(0, Math.min(ymax, k2 * t5 + d0)));
  const trend = `<polyline points="${x2(t1)},${yy(t1)} ${x2(t22)},${yy(t22)}${grenze !== null && t22 < 15 ? ` ${x2(15)},${yy(t22)}` : ""}" fill="none" stroke="var(--s2)" stroke-width="2" stroke-dasharray="5 4"/>`;
  const punkte = pkt.map((q, i7) => `<circle class="punkt-s" data-i="${i7}" cx="${x2(q[0]).toFixed(1)}" cy="${y3(q[1]).toFixed(1)}" r="4.5" fill="var(--s1)"/>`).join("");
  CHARTS[id] = { art: "streu", pkt, x: x2, y: y3 };
  return `<svg class="chart" data-chart="${id}" viewBox="0 0 ${W} ${H2}">${raster}${achse}<text x="${W - R2}" y="${H2 - 8}" class="ax" text-anchor="end" dx="0" opacity="0">.</text>${trend}${punkte}<g class="hover"></g></svg>
    <div class="legende"><span><i style="background:var(--s1)"></i>ein Heiztag</span><span><i style="background:var(--s2)"></i>Trend</span><span class="leise">x: Tagesmittel außen · y: kWh</span></div>`;
}
function flaeche(id, reihen, labels, einheit, jedes, vergleich3 = null, breite = 320) {
  const W = breite, H2 = 160, L2 = 30, R2 = 8, T2 = 10, U = 22, n4 = labels.length, viele = reihen.length > 1;
  reihen = reihen.map((r5) => ({ ...r5, v: labels.map((_2, i7) => zahl(r5.v[i7]) ? Number(r5.v[i7]) : 0) }));
  let unten = Array(n4).fill(0);
  const lagen = reihen.map((r5) => {
    const u3 = unten, o6 = r5.v.map((v2, i7) => u3[i7] + v2);
    unten = o6;
    return { ...r5, u: u3, o: o6 };
  });
  const vv = vergleich3 ? labels.map((_2, i7) => zahl(vergleich3.v[i7]) ? Number(vergleich3.v[i7]) : 0) : null;
  const hi0 = Math.max(...unten, ...vv || [], 0) * 1.1 || 1;
  const stufe = [0.5, 1, 2, 5, 10, 20, 50, 100, 200, 500, 1e3, 2e3, 5e3].find((st) => hi0 / st <= 5) || 1e4, hi = Math.ceil(hi0 / stufe) * stufe;
  const x2 = (i7) => L2 + i7 / Math.max(1, n4 - 1) * (W - L2 - R2), y3 = (v2) => T2 + (1 - v2 / hi) * (H2 - T2 - U);
  const raster = [...Array(Math.round(hi / stufe) + 1)].map((_2, k2) => k2 * stufe).map((v2) => `<line x1="${L2}" x2="${W - R2}" y1="${y3(v2)}" y2="${y3(v2)}" class="gr"/><text x="${L2 - 5}" y="${y3(v2) + 3}" class="ax" text-anchor="end">${de(v2, stufe < 1 ? 1 : 0)}</text>`).join("");
  const achse = labels.map((t5, i7) => i7 % jedes ? "" : `<text x="${x2(i7)}" y="${H2 - 6}" class="ax" text-anchor="middle">${t5}</text>`).join("");
  const g2 = (k2) => `fl-${id.replace(/[^a-z0-9]/gi, "")}-${k2}`;
  const defs = lagen.map((r5, k2) => `<linearGradient id="${g2(k2)}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${r5.farbe}" stop-opacity="${viele ? 0.75 : 0.45}"/><stop offset="1" stop-color="${r5.farbe}" stop-opacity="${viele ? 0.45 : 0.03}"/></linearGradient>`).join("");
  const linieD = (a3) => a3.map((v2, i7) => `${i7 ? "L" : "M"}${x2(i7).toFixed(1)} ${y3(v2).toFixed(1)}`).join("");
  const zurueck = (a3) => a3.map((v2, i7) => [i7, v2]).reverse().map(([i7, v2]) => `L${x2(i7).toFixed(1)} ${y3(v2).toFixed(1)}`).join("");
  const flaechen = lagen.map((r5, k2) => `<path class="fl-flaeche" style="animation-delay:${k2 * 40}ms" d="${linieD(r5.o)}${zurueck(r5.u)}z" fill="url(#${g2(k2)})"/>`).join("");
  const kanten = lagen.map((r5) => `<path class="fl-linie" d="${linieD(r5.o)}" fill="none" stroke="${viele ? "var(--trenn)" : r5.farbe}" stroke-width="${viele ? 1.5 : 2}" stroke-linejoin="round"/>`).join("");
  const oben = viele ? `<path d="${linieD(unten)}" fill="none" stroke="var(--ink)" stroke-width="1.5" stroke-linejoin="round" opacity=".8"/>` : "";
  const vglSvg = vv ? `<path d="${linieD(vv)}" fill="none" stroke="var(--ink2)" stroke-width="1.6" stroke-dasharray="5 4" stroke-linejoin="round"/>` : "";
  CHARTS[id] = { art: "flaeche", x0: L2, x1: W - R2, W, n: n4, reihen: lagen, labels, einheit, y: y3, vergleich: vv, vglName: vergleich3 && vergleich3.name };
  return `<svg class="chart" data-chart="${id}" viewBox="0 0 ${W} ${H2}"><defs>${defs}</defs>${raster}${achse}${flaechen}${kanten}${oben}${vglSvg}<g class="hover"></g></svg>
    ${viele || vv ? `<div class="legende">${[...lagen].reverse().map((r5) => `<span><i style="background:${r5.farbe}"></i>${esc(r5.name)}</span>`).join("")}${vv ? `<span><i class="gestr"></i>${esc(vergleich3.name)}</span>` : ""}</div>` : ""}`;
}
function luecke(id, mit, ohne, gespart, labels, jedes, breite = 320, einheit = "€") {
  const W = breite, kurz = W <= 320, H2 = kurz ? 128 : 160, L2 = 30, R2 = 8, T2 = 20, U = 22, n4 = labels.length, GRUEN = "var(--s3)";
  const idx = labels.map((_2, i8) => i8).filter((i8) => zahl(mit[i8]) && zahl(ohne[i8]));
  if (!idx.length) return '<div class="leer">Noch keine Werte</div>';
  const hi0 = Math.max(...idx.flatMap((i8) => [Number(mit[i8]), Number(ohne[i8])]), 0) * 1.1 || 1;
  const stufe = [0.1, 0.2, 0.5, 1, 2, 5, 10, 20, 50, 100, 200, 500, 1e3].find((st) => hi0 / st <= 4) || 2e3, hi = Math.ceil(hi0 / stufe) * stufe;
  const x2 = (i8) => L2 + i8 / Math.max(1, n4 - 1) * (W - L2 - R2), y3 = (v2) => T2 + (1 - Number(v2) / hi) * (H2 - T2 - U);
  const raster = [...Array(Math.round(hi / stufe) + 1)].map((_2, k2) => k2 * stufe).map((v2) => `<line x1="${L2}" x2="${W - R2}" y1="${y3(v2)}" y2="${y3(v2)}" class="gr"/><text x="${L2 - 5}" y="${y3(v2) + 3}" class="ax" text-anchor="end">${de(v2, stufe < 1 ? 1 : 0)}</text>`).join("");
  const achse = labels.map((t5, i8) => i8 % jedes ? "" : `<text x="${x2(i8)}" y="${H2 - 6}" class="ax" text-anchor="middle">${t5}</text>`).join("");
  const P2 = (a3) => idx.map((i8, k2) => `${k2 ? "L" : "M"}${x2(i8).toFixed(1)} ${y3(a3[i8]).toFixed(1)}`).join("");
  const zur = (a3) => [...idx].reverse().map((i8) => `L${x2(i8).toFixed(1)} ${y3(a3[i8]).toFixed(1)}`).join("");
  const a0 = idx[0], a1 = idx[idx.length - 1];
  const fl = `<path class="fl-flaeche" d="${P2(mit)}L${x2(a1).toFixed(1)} ${y3(0)}L${x2(a0).toFixed(1)} ${y3(0)}z" fill="var(--s1)" opacity=".28"/><path class="fl-linie" d="${P2(mit)}" fill="none" stroke="var(--s1)" stroke-width="1.8" stroke-linejoin="round"/>`;
  const lu = `<path class="kk-luecke" d="${P2(ohne)}${zur(mit)}z" fill="${GRUEN}" opacity=".38"/>`;
  const oh = `<path d="${P2(ohne)}" fill="none" stroke="var(--ink2)" stroke-width="1.6" stroke-dasharray="5 4" stroke-linejoin="round"/>`;
  const m3 = idx[Math.floor(idx.length / 2)], mitte = (y3(ohne[m3]) + y3(mit[m3])) / 2;
  const tx = idx.length > 2 && y3(mit[m3]) - y3(ohne[m3]) > 16 ? `<text x="${x2(m3).toFixed(1)}" y="${(mitte + 3).toFixed(1)}" class="kk-luecke-t" text-anchor="middle">gespart</text>` : "";
  const i7 = (farbe, t5, gestr) => `<span><i ${gestr ? 'class="gestr"' : `style="background:${farbe}"`}></i>${t5}</span>`;
  CHARTS[id] = { art: "luecke", x0: L2, x1: W - R2, W, n: n4, labels, mit, ohne, gespart, einheit, y: y3, unten: H2 - U, jedes };
  return `<svg class="chart kk-breit" data-chart="${id}" viewBox="0 0 ${W} ${H2}">${raster}${achse}${fl}${lu}${oh}${tx}<text x="${L2 - 5}" y="${T2 - 5}" class="ax ax-e" text-anchor="end">${einheit}</text><g class="hover"></g></svg><div class="kk-leg">${kurz ? i7(GRUEN, "gespart") + i7(null, "24/7", true) : i7("var(--s1)", "mit Automatik") + i7(null, "ohne (24/7)", true) + i7(GRUEN, "Lücke = gespart")}</div>`;
}
function funke(v2, farbe = "var(--s1)") {
  if (!v2) return "";
  v2 = v2.map((x2) => zahl(x2) ? Number(x2) : null);
  const w2 = 120, h3 = 40, z2 = v2.filter((x2) => x2 !== null);
  if (z2.length < 2) return "";
  const lo = Math.min(...z2), hi = Math.max(...z2), sp = hi - lo || 1;
  const pts = v2.map((x2, i7) => x2 === null ? null : [i7 / (v2.length - 1) * w2, h3 - 3 - (x2 - lo) / sp * (h3 - 8)]).filter(Boolean);
  const dL = pts.map((q, i7) => `${i7 ? "L" : "M"}${q[0].toFixed(1)} ${q[1].toFixed(1)}`).join("");
  return `<svg class="kk-funke" viewBox="0 0 ${w2} ${h3}" preserveAspectRatio="none"><path d="${dL}L${pts.at(-1)[0].toFixed(1)} ${h3}L${pts[0][0].toFixed(1)} ${h3}z" fill="${farbe}" opacity=".2"/><path d="${dL}" fill="none" stroke="${farbe}" stroke-width="2" vector-effect="non-scaling-stroke" stroke-linejoin="round"/></svg>`;
}
var kkBalken = (zeilen, n4 = 99) => {
  const max = Math.max(1e-9, ...zeilen.map((z2) => z2[1] || 0));
  return zeilen.slice(0, n4).map(([name2, v2, txt, farbe]) => `<div class="kk-balken"><span>${esc(name2)}</span><i style="width:${Math.max(2, (v2 || 0) / max * 100)}%;background:${farbe || "var(--s1)"}"></i><em>${txt}</em></div>`).join("");
};

// src/daten.js
var LOKAL_FMT = {};
function lokal(t5, zone) {
  const ms = typeof t5 === "number" ? t5 : Date.parse(t5);
  if (!Number.isFinite(ms)) return "";
  const k2 = zone || "";
  if (!(k2 in LOKAL_FMT)) {
    try {
      LOKAL_FMT[k2] = new Intl.DateTimeFormat("sv-SE", { timeZone: zone || void 0, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
    } catch (e6) {
      LOKAL_FMT[k2] = new Intl.DateTimeFormat("sv-SE", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
    }
  }
  return LOKAL_FMT[k2].format(ms).replace("T", " ");
}
function zoneMs(tag, zeit = "00:00", zone) {
  const g2 = Date.parse(`${tag}T${zeit}:00Z`), l4 = Date.parse(lokal(g2, zone).replace(" ", "T") + ":00Z");
  return Number.isFinite(l4) ? g2 - (l4 - g2) : g2;
}
function minSeitAb(iso, jetztMs) {
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? Math.max(0, Math.round((jetztMs - ms) / 6e4)) : null;
}
function protokollZeile(p4, z2, ersatzZone) {
  const l4 = lokal(p4[0], z2.zone === void 0 ? ersatzZone : z2.zone) || "", t5 = l4.slice(0, 10);
  const tag = t5 === z2.HEUTE ? "Heute" : t5 === plusTage(z2.HEUTE, -1) ? "Gestern" : `${wtag(t5)} ${kurzDatum(t5)}`;
  return [tag, l4.slice(11, 16), p4[1] || "einstellung", p4[2] || null, p4[3] || "", t5];
}
function bauen(r5, hass, ersatzZone) {
  const lokalZ = (t5, zone2) => lokal(t5, zone2 === void 0 ? ersatzZone : zone2);
  const bs = r5.baustelle || {}, lz = r5.laufzeit || {}, e0 = r5.einstellungen || {}, opt = bs.optionen || {}, zone = bs.zeitzone;
  const jetztIso = bs.jetzt || (/* @__PURE__ */ new Date()).toISOString(), jl = lokalZ(jetztIso, zone) || "";
  const heute2 = bs.heute || jl.slice(0, 10) || (/* @__PURE__ */ new Date()).toISOString().slice(0, 10);
  const montag = plusTage(heute2, -(((/* @__PURE__ */ new Date(heute2 + "T12:00:00Z")).getUTCDay() + 6) % 7));
  const WOCHE_ISO = TAGE.map((_2, k2) => plusTage(montag, k2));
  const z2 = {
    HEUTE: heute2,
    HEUTE_TAG: TAGE[WOCHE_ISO.indexOf(heute2)] || "Mo",
    JETZT: jl.slice(11, 16) || "00:00",
    WOCHE_ISO,
    WOCHE: WOCHE_ISO.map((iso, k2) => [TAGE[k2], kurzDatum(iso)]),
    zone,
    jetztMs: Number.isFinite(Date.parse(jetztIso)) ? Date.parse(jetztIso) : Date.now()
  };
  const h3 = e0.heizung || {}, st = e0.staffel || {}, me = e0.meldungen_einst || {}, ar = me.arten || {}, be = e0.bericht || {};
  const v2 = (x2, std) => zahl(x2) ? Number(x2) : std;
  const namen = (s4) => {
    const x2 = hass && hass.states[`notify.${s4}`];
    return x2 && x2.attributes.friendly_name || String(s4).replace(/^mobile_app_/, "").replace(/_/g, " ");
  };
  const e6 = {
    preis: v2(e0.preis, 0),
    preise: Array.isArray(e0.preise) ? e0.preise : [],
    feiertag_frei: h3.feiertag_frei !== false,
    boost_min: v2(h3.boost_min, 30),
    soll_art: h3.soll_art === "gleitend" ? "gleitend" : "fest",
    gleit_min: v2(h3.gleit_min, 21),
    gleit_max: v2(h3.gleit_max, 24),
    gleit_je: v2(h3.gleit_je, 0.1),
    gleit_bezug: v2(h3.gleit_bezug, 12),
    gleit_tage: v2(h3.gleit_tage, 3),
    toleranz: v2(h3.toleranz, 0.3),
    hand_nachfrist: v2(h3.hand_nachfrist_min, 30),
    fuehler_halten: v2(h3.fuehler_halten_min, 15),
    zieht_w: v2(h3.zieht_strom_w, 50),
    melden: e0.melden_knopf !== false,
    staffel: st.an !== false,
    nutzbar: v2(st.nutzbar_prozent, 67),
    max_gleich: v2(st.max_gleichzeitig, 5),
    min_lauf: v2(st.min_lauf_min, 10),
    min_pause: v2(st.min_pause_min, 5),
    takt: v2(st.takt_min, 15),
    tuer_pause: v2(h3.tuer_pause_min, 3),
    tuer_melden: v2(h3.tuer_melden_min, 10),
    knoepfe: me.knoepfe !== false,
    bericht: be.haeufigkeit || "aus",
    bericht_handy: be.handy !== false,
    bericht_mail: !!be.mail,
    mail: be.mail_an || "",
    mail_dienst: be.mail_dienst || "",
    bericht_csv: be.csv !== false,
    vorheizen: v2(h3.vorheizen_min, 45),
    nachheizen: v2(h3.nachheizen_min, 15),
    warm_vor: v2(h3.warm_vor_min, 0),
    frost_aussen: h3.frost_aussen === null ? null : v2(h3.frost_aussen, -3),
    warm_nach: v2(h3.warm_nach_min, 0),
    warm_max: v2(h3.warm_max_min, 120),
    stufen_abstand: v2(h3.stufen_abstand, 1.5),
    stufen_min: v2(h3.stufen_min, 30),
    stufen_anstieg: v2(h3.stufen_anstieg, 0.3),
    stufen_kalt: v2(h3.stufen_kalt, -5),
    soll: v2(h3.soll, 20),
    grenze: v2(h3.heizgrenze, 15),
    basis: h3.heizgrenze_basis === "jetzt" ? "jetzt" : "Tageshöchstwert",
    fruehstart: h3.fruehstart !== false,
    frueh_temp: v2(h3.fruehstart_unter, 0),
    frueh_min: v2(h3.fruehstart_min, 30),
    frost: h3.frost !== false,
    frost_temp: v2(h3.frost_grenze, 5),
    tr_mm: v2(h3.trocknen_ab_mm, 2),
    tr_laenger: v2(h3.trocknen_laenger_min, 45),
    tr_frueher: v2(h3.trocknen_frueher_min, 15),
    empfaenger: (me.empfaenger || opt.empfaenger || []).map(namen).join(", ") || "keiner gewählt",
    dauer_min: v2(me.dauerlauf_min, 20),
    kalt_min: v2(me.kalt_min, 60),
    hand_h: v2(me.hand_h, 8),
    zyklen_h: v2(me.zyklen_h, 10),
    trocken_w: v2(me.trocken_unter_w, 30),
    auto: !!e0.automatik,
    frost_aus: v2(h3.frost_aus, v2(h3.frost_grenze, 5) + 2),
    urlaub: FREI_TEXT[h3.frei_modus] ? h3.frei_modus : "frost",
    absenk: v2(h3.absenk, 10),
    offline_min: v2(me.offline_min, 5),
    erklaer: e0.erklaer !== false,
    frost_immer: !!h3.frost_immer,
    notprogramm: !!h3.notprogramm,
    taste: !!h3.taste
  };
  for (const [k2, art] of Object.entries(ARTEN)) e6[k2] = ar[art] !== false;
  const anschluesse = (e0.anschluesse || []).map((a3) => ({ id: a3.id, name: a3.name || a3.id, ampere: v2(a3.ampere, 16), phasen: v2(a3.phasen, 3), reserve: v2(a3.reserve_kw, 0) }));
  const firmen2 = (e0.firmen && e0.firmen.length ? e0.firmen : [{ id: "eigen", name: "Eigene Firma", eigen: true }]).map((f3) => ({ ...f3 }));
  const zuordnung = e0.zuordnung || [], jetztMs = z2.jetztMs;
  const ebAlle = e0.bereiche || {}, cAlle = lz.container || {}, gAlle = lz.geraete || {};
  const bereiche = (r5.bereiche || []).map((b3, i7) => {
    const eb = ebAlle[b3.id] || {}, c4 = cAlle[b3.id] || {}, pumpe = b3.art === "pumpenschacht";
    const geraete2 = (r5.geraete || []).filter((g2) => g2.bereich === b3.id).map((g2) => {
      const x2 = gAlle[g2.id] || {};
      return {
        id: g2.id,
        n: g2.name || g2.id,
        typ: TYP_TEXT(g2),
        rolle: g2.rolle,
        gtyp: g2.typ,
        heizer: HEIZER(g2),
        kw: v2(g2.nenn_kw, 0),
        kwJetzt: x2.kw,
        an: !!x2.an,
        hand: !!x2.hand_seit,
        hand_seit: x2.hand_seit || null,
        warte: x2.warte || null,
        erreichbar: x2.erreichbar !== false,
        schalter: g2.schalter,
        leistung: g2.leistung,
        energie: g2.energie,
        aktiv: x2.aktiv !== false,
        status: x2.status || (x2.aktiv === false ? "inaktiv" : "aktiv"),
        zusatz: !!x2.zusatz,
        np: x2.notprogramm || null,
        nennKwEigen: zahl(g2.nenn_kw_eigen) ? Number(g2.nenn_kw_eigen) : null,
        leistungEigen: g2.leistung_eigen || null,
        energieEigen: g2.energie_eigen || null
      };
    });
    let zst = c4.zustand in FARBE ? c4.zustand : pumpe ? "aus" : "aus";
    const offline = zst === "offline" || geraete2.length > 0 && geraete2.every((g2) => !g2.erreichbar);
    if (offline) zst = "offline";
    const tuerS = eb.tuer && hass && hass.states[eb.tuer];
    const tuer = eb.tuer ? { eid: eb.tuer, sensor: tuerS && tuerS.attributes.friendly_name || eb.tuer, offen: c4.tuer && c4.tuer.offen ? Math.max(1, minSeitAb(c4.tuer.seit, jetztMs) ?? 1) : 0 } : void 0;
    return {
      id: b3.id,
      name: b3.name || b3.id,
      f: zahl(b3.nr) ? Number(b3.nr) : i7,
      art: b3.art,
      pumpe,
      fuehler: b3.fuehler || null,
      sensoren: b3.sensoren || [],
      z: zst,
      grund: c4.grund || null,
      t: zahl(c4.temperatur) ? Number(c4.temperatur) : null,
      kw: zahl(c4.kw) ? Number(c4.kw) : null,
      text: c4.text || "",
      geraete: geraete2,
      auto: eb.auto !== false,
      trocknen: !!eb.trocknen,
      stufenAn: !!eb.stufen,
      primaer: eb.primaer || null,
      stufen: c4.stufen || null,
      sollJ: c4.soll || null,
      bedarfGrad: c4.bedarf || null,
      soll: zahl(eb.soll) ? Number(eb.soll) : void 0,
      bedarf: !!eb.bedarf,
      prio: eb.prio || "normal",
      anschluss: eb.anschluss || anschluesse[0] && anschluesse[0].id || null,
      firma: c4.firma || "eigen",
      tuer,
      offline,
      bedarfBisIso: c4.bedarf_bis || null,
      bedarfBis: c4.bedarf_bis ? lokalZ(c4.bedarf_bis, zone).slice(11, 16) : null,
      boost: !!c4.boost_bis,
      boostBis: c4.boost_bis || null,
      modus: pumpe ? null : MODI.some((m3) => m3[0] === c4.modus) ? c4.modus : eb.bedarf ? "bedarf" : eb.auto === false ? "hand" : b3.fuehler ? "thermo" : "plan",
      lern: c4.lernen || null,
      start: c4.start || null,
      takt: c4.takt || null,
      eingestellt: Array.isArray(c4.eingestellt) ? c4.eingestellt : [],
      groesse: c4.groesse || null,
      symbol: c4.symbol || null,
      warmVor: zahl(eb.warm_vor) ? Number(eb.warm_vor) : null,
      warmNach: zahl(eb.warm_nach) ? Number(eb.warm_nach) : null
    };
  });
  const plan2 = {}, frei = {};
  const freiName = {};
  for (const [iso, q] of Object.entries(lz.plan_ausnahmen || {})) plan2[iso] = q || null;
  for (const p4 of lz.plan_woche || []) {
    plan2[p4.datum] = p4.plan || null;
    frei[p4.datum] = p4.frei || null;
    if (p4.name) freiName[p4.datum] = p4.name;
  }
  const warnungen2 = (lz.warnungen || []).map((w2) => ({
    id: w2.key,
    key: w2.key,
    art: w2.art,
    stufe: w2.stufe === "stoerung" ? "stoerung" : "hinweis",
    b: w2.bereich || null,
    g: w2.geraet || null,
    titel: w2.titel || w2.art || "",
    hilfe: w2.hilfe || "",
    seitIso: w2.seit,
    stumm: !!(w2.stumm_bis && Date.parse(w2.stumm_bis) > jetztMs)
  }));
  const termine = (lz.termine || []).map((t5) => {
    const l4 = lokalZ(t5.von, zone), lb = lokalZ(t5.bis, zone);
    return {
      b: t5.bereich,
      datum: l4.slice(0, 10),
      von: l4.slice(11, 16),
      bis: lb.slice(11, 16),
      titel: t5.titel || "",
      uid: t5.uid,
      rrule: t5.rrule || null,
      wieder: WIEDER[t5.wiederholung] ? t5.wiederholung : "einmal",
      boost: !!t5.boost
    };
  });
  const tage = e0.arbeitszeiten || [];
  const arbeitszeiten = tage.map((a3) => ({ ab: a3.ab, name: a3.name || "", auto: a3.auto === true, tage: Object.fromEntries(TAGE.map((t5, k2) => {
    const x2 = (a3.tage || {})[k2] ?? (a3.tage || {})[String(k2)];
    return [t5, x2 && x2[0] && x2[1] ? [x2[0], x2[1]] : null];
  })) }));
  const aktiv = (bs.status || opt.status || "aktiv") !== "abgeschlossen";
  const zl = r5.zaehler || {};
  const wetterEid = opt.wetter || null;
  return {
    r: r5,
    entry: bs.entry_id,
    titel: bs.titel || "Baustelle",
    aktiv,
    geladen: bs.geladen !== false,
    version: bs.version,
    optionen: opt,
    ent: r5.entitaeten || {},
    z: z2,
    e: e6,
    funktionen: r5.funktionen || ["heizung", "pumpen"],
    bereiche,
    anschluesse,
    firmen: firmen2,
    zuordnung,
    arbeitszeiten,
    ausnahmen: (e0.ausnahmen || []).map((a3) => ({ datum: a3.datum, art: a3.art in AUSNAHME ? a3.art : "zeiten", von: a3.von || "07:00", bis: a3.bis || "16:30", notiz: a3.notiz || "" })),
    warnungen: warnungen2,
    termine,
    plan: plan2,
    frei,
    freiName,
    abschnitte: lz.abschnitte || {},
    staffel: lz.staffel || null,
    sollG: lz.soll_gleitend || null,
    wetter: lz.wetter || {},
    heizgrenze: lz.heizgrenze || {},
    status: lz.status || (aktiv ? "bereit" : "abgeschlossen"),
    statusText: lz.status_text || "",
    jetztBis: lz.jetzt_bis ? lokalZ(lz.jetzt_bis, zone).slice(11, 16) : null,
    np: lz.notprogramm || null,
    protokoll: (lz.protokoll || []).map((p4) => protokollZeile(p4, z2, ersatzZone)),
    zaehler: zl,
    termineKal: e0.termine_kalender || null,
    wetterEid,
    beginn: bs.beginn || opt.beginn || null,
    beginnAuto: bs.beginn_auto === true,
    ende: opt.ende || null,
    // Beginn leer = Tag der Anlage (AN-0002)
    hp: [Math.min(12, Math.max(1, parseInt(opt.heizperiode_von, 10) || 10)), Math.min(12, Math.max(1, parseInt(opt.heizperiode_bis, 10) || 4))]
  };
}

// src/rechte.js
var NUR_ANSEHEN = "Nur ansehen – ändern dürfen nur Admins";
var NUR_LESEN_SPERRE = [".sw:not(.ml-stand):not(.vor-ort)", ".nur-admin"];
function rechteVon(roh2) {
  const r5 = (roh2 || [])[0];
  return r5 && r5.rechte || { aendern: true, aktionen: [] };
}
function darfSenden(msg, rechte) {
  if (!!rechte.aendern || msg.type === "baustelle/meldung") return true;
  return msg.type === "baustelle/aktion" && rechte.aktionen.includes(msg.aktion);
}

// src/api.js
var nachricht = {
  setzen: (entry, pfad, wert2) => ({ type: "baustelle/setzen", entry_id: entry, pfad, wert: wert2 }),
  aktion: (entry, aktion, felder) => ({ type: "baustelle/aktion", entry_id: entry, aktion, ...felder }),
  liste: (entry, liste2, aktion, eintrag) => ({ type: "baustelle/liste", entry_id: entry, liste: liste2, aktion, eintrag })
};
function fehlerText(e6) {
  return e6 && e6.body && e6.body.message || e6 && e6.message || e6 && e6.code || String(e6);
}
function flowFehler(r5) {
  return r5 && (r5.type === "form" && r5.errors && (r5.errors.base || Object.values(r5.errors)[0]) || r5.type === "abort" && !["reconfigure_successful"].includes(r5.reason) && r5.reason);
}

// node_modules/@lit/reactive-element/css-tag.js
/**
 * @license
 * Copyright 2019 Google LLC
 * SPDX-License-Identifier: BSD-3-Clause
 */
var t = globalThis;
var e = t.ShadowRoot && (void 0 === t.ShadyCSS || t.ShadyCSS.nativeShadow) && "adoptedStyleSheets" in Document.prototype && "replace" in CSSStyleSheet.prototype;
var s = /* @__PURE__ */ Symbol();
var o = /* @__PURE__ */ new WeakMap();
var n = class {
  constructor(t5, e6, o6) {
    if (this._$cssResult$ = true, o6 !== s) throw Error("CSSResult is not constructable. Use `unsafeCSS` or `css` instead.");
    this.cssText = t5, this.t = e6;
  }
  get styleSheet() {
    let t5 = this.o;
    const s4 = this.t;
    if (e && void 0 === t5) {
      const e6 = void 0 !== s4 && 1 === s4.length;
      e6 && (t5 = o.get(s4)), void 0 === t5 && ((this.o = t5 = new CSSStyleSheet()).replaceSync(this.cssText), e6 && o.set(s4, t5));
    }
    return t5;
  }
  toString() {
    return this.cssText;
  }
};
var r = (t5) => new n("string" == typeof t5 ? t5 : t5 + "", void 0, s);
var S = (s4, o6) => {
  if (e) s4.adoptedStyleSheets = o6.map((t5) => t5 instanceof CSSStyleSheet ? t5 : t5.styleSheet);
  else for (const e6 of o6) {
    const o7 = document.createElement("style"), n4 = t.litNonce;
    void 0 !== n4 && o7.setAttribute("nonce", n4), o7.textContent = e6.cssText, s4.appendChild(o7);
  }
};
var c = e ? (t5) => t5 : (t5) => t5 instanceof CSSStyleSheet ? ((t6) => {
  let e6 = "";
  for (const s4 of t6.cssRules) e6 += s4.cssText;
  return r(e6);
})(t5) : t5;

// node_modules/@lit/reactive-element/reactive-element.js
/**
 * @license
 * Copyright 2017 Google LLC
 * SPDX-License-Identifier: BSD-3-Clause
 */
var { is: i2, defineProperty: e2, getOwnPropertyDescriptor: h, getOwnPropertyNames: r2, getOwnPropertySymbols: o2, getPrototypeOf: n2 } = Object;
var a = globalThis;
var c2 = a.trustedTypes;
var l = c2 ? c2.emptyScript : "";
var p = a.reactiveElementPolyfillSupport;
var d = (t5, s4) => t5;
var u = { toAttribute(t5, s4) {
  switch (s4) {
    case Boolean:
      t5 = t5 ? l : null;
      break;
    case Object:
    case Array:
      t5 = null == t5 ? t5 : JSON.stringify(t5);
  }
  return t5;
}, fromAttribute(t5, s4) {
  let i7 = t5;
  switch (s4) {
    case Boolean:
      i7 = null !== t5;
      break;
    case Number:
      i7 = null === t5 ? null : Number(t5);
      break;
    case Object:
    case Array:
      try {
        i7 = JSON.parse(t5);
      } catch (t6) {
        i7 = null;
      }
  }
  return i7;
} };
var f = (t5, s4) => !i2(t5, s4);
var b = { attribute: true, type: String, converter: u, reflect: false, useDefault: false, hasChanged: f };
Symbol.metadata ??= /* @__PURE__ */ Symbol("metadata"), a.litPropertyMetadata ??= /* @__PURE__ */ new WeakMap();
var y = class extends HTMLElement {
  static addInitializer(t5) {
    this._$Ei(), (this.l ??= []).push(t5);
  }
  static get observedAttributes() {
    return this.finalize(), this._$Eh && [...this._$Eh.keys()];
  }
  static createProperty(t5, s4 = b) {
    if (s4.state && (s4.attribute = false), this._$Ei(), this.prototype.hasOwnProperty(t5) && ((s4 = Object.create(s4)).wrapped = true), this.elementProperties.set(t5, s4), !s4.noAccessor) {
      const i7 = /* @__PURE__ */ Symbol(), h3 = this.getPropertyDescriptor(t5, i7, s4);
      void 0 !== h3 && e2(this.prototype, t5, h3);
    }
  }
  static getPropertyDescriptor(t5, s4, i7) {
    const { get: e6, set: r5 } = h(this.prototype, t5) ?? { get() {
      return this[s4];
    }, set(t6) {
      this[s4] = t6;
    } };
    return { get: e6, set(s5) {
      const h3 = e6?.call(this);
      r5?.call(this, s5), this.requestUpdate(t5, h3, i7);
    }, configurable: true, enumerable: true };
  }
  static getPropertyOptions(t5) {
    return this.elementProperties.get(t5) ?? b;
  }
  static _$Ei() {
    if (this.hasOwnProperty(d("elementProperties"))) return;
    const t5 = n2(this);
    t5.finalize(), void 0 !== t5.l && (this.l = [...t5.l]), this.elementProperties = new Map(t5.elementProperties);
  }
  static finalize() {
    if (this.hasOwnProperty(d("finalized"))) return;
    if (this.finalized = true, this._$Ei(), this.hasOwnProperty(d("properties"))) {
      const t6 = this.properties, s4 = [...r2(t6), ...o2(t6)];
      for (const i7 of s4) this.createProperty(i7, t6[i7]);
    }
    const t5 = this[Symbol.metadata];
    if (null !== t5) {
      const s4 = litPropertyMetadata.get(t5);
      if (void 0 !== s4) for (const [t6, i7] of s4) this.elementProperties.set(t6, i7);
    }
    this._$Eh = /* @__PURE__ */ new Map();
    for (const [t6, s4] of this.elementProperties) {
      const i7 = this._$Eu(t6, s4);
      void 0 !== i7 && this._$Eh.set(i7, t6);
    }
    this.elementStyles = this.finalizeStyles(this.styles);
  }
  static finalizeStyles(s4) {
    const i7 = [];
    if (Array.isArray(s4)) {
      const e6 = new Set(s4.flat(1 / 0).reverse());
      for (const s5 of e6) i7.unshift(c(s5));
    } else void 0 !== s4 && i7.push(c(s4));
    return i7;
  }
  static _$Eu(t5, s4) {
    const i7 = s4.attribute;
    return false === i7 ? void 0 : "string" == typeof i7 ? i7 : "string" == typeof t5 ? t5.toLowerCase() : void 0;
  }
  constructor() {
    super(), this._$Ep = void 0, this.isUpdatePending = false, this.hasUpdated = false, this._$Em = null, this._$Ev();
  }
  _$Ev() {
    this._$ES = new Promise((t5) => this.enableUpdating = t5), this._$AL = /* @__PURE__ */ new Map(), this._$E_(), this.requestUpdate(), this.constructor.l?.forEach((t5) => t5(this));
  }
  addController(t5) {
    (this._$EO ??= /* @__PURE__ */ new Set()).add(t5), void 0 !== this.renderRoot && this.isConnected && t5.hostConnected?.();
  }
  removeController(t5) {
    this._$EO?.delete(t5);
  }
  _$E_() {
    const t5 = /* @__PURE__ */ new Map(), s4 = this.constructor.elementProperties;
    for (const i7 of s4.keys()) this.hasOwnProperty(i7) && (t5.set(i7, this[i7]), delete this[i7]);
    t5.size > 0 && (this._$Ep = t5);
  }
  createRenderRoot() {
    const t5 = this.shadowRoot ?? this.attachShadow(this.constructor.shadowRootOptions);
    return S(t5, this.constructor.elementStyles), t5;
  }
  connectedCallback() {
    this.renderRoot ??= this.createRenderRoot(), this.enableUpdating(true), this._$EO?.forEach((t5) => t5.hostConnected?.());
  }
  enableUpdating(t5) {
  }
  disconnectedCallback() {
    this._$EO?.forEach((t5) => t5.hostDisconnected?.());
  }
  attributeChangedCallback(t5, s4, i7) {
    this._$AK(t5, i7);
  }
  _$ET(t5, s4) {
    const i7 = this.constructor.elementProperties.get(t5), e6 = this.constructor._$Eu(t5, i7);
    if (void 0 !== e6 && true === i7.reflect) {
      const h3 = (void 0 !== i7.converter?.toAttribute ? i7.converter : u).toAttribute(s4, i7.type);
      this._$Em = t5, null == h3 ? this.removeAttribute(e6) : this.setAttribute(e6, h3), this._$Em = null;
    }
  }
  _$AK(t5, s4) {
    const i7 = this.constructor, e6 = i7._$Eh.get(t5);
    if (void 0 !== e6 && this._$Em !== e6) {
      const t6 = i7.getPropertyOptions(e6), h3 = "function" == typeof t6.converter ? { fromAttribute: t6.converter } : void 0 !== t6.converter?.fromAttribute ? t6.converter : u;
      this._$Em = e6;
      const r5 = h3.fromAttribute(s4, t6.type);
      this[e6] = r5 ?? this._$Ej?.get(e6) ?? r5, this._$Em = null;
    }
  }
  requestUpdate(t5, s4, i7, e6 = false, h3) {
    if (void 0 !== t5) {
      const r5 = this.constructor;
      if (false === e6 && (h3 = this[t5]), i7 ??= r5.getPropertyOptions(t5), !((i7.hasChanged ?? f)(h3, s4) || i7.useDefault && i7.reflect && h3 === this._$Ej?.get(t5) && !this.hasAttribute(r5._$Eu(t5, i7)))) return;
      this.C(t5, s4, i7);
    }
    false === this.isUpdatePending && (this._$ES = this._$EP());
  }
  C(t5, s4, { useDefault: i7, reflect: e6, wrapped: h3 }, r5) {
    i7 && !(this._$Ej ??= /* @__PURE__ */ new Map()).has(t5) && (this._$Ej.set(t5, r5 ?? s4 ?? this[t5]), true !== h3 || void 0 !== r5) || (this._$AL.has(t5) || (this.hasUpdated || i7 || (s4 = void 0), this._$AL.set(t5, s4)), true === e6 && this._$Em !== t5 && (this._$Eq ??= /* @__PURE__ */ new Set()).add(t5));
  }
  async _$EP() {
    this.isUpdatePending = true;
    try {
      await this._$ES;
    } catch (t6) {
      Promise.reject(t6);
    }
    const t5 = this.scheduleUpdate();
    return null != t5 && await t5, !this.isUpdatePending;
  }
  scheduleUpdate() {
    return this.performUpdate();
  }
  performUpdate() {
    if (!this.isUpdatePending) return;
    if (!this.hasUpdated) {
      if (this.renderRoot ??= this.createRenderRoot(), this._$Ep) {
        for (const [t7, s5] of this._$Ep) this[t7] = s5;
        this._$Ep = void 0;
      }
      const t6 = this.constructor.elementProperties;
      if (t6.size > 0) for (const [s5, i7] of t6) {
        const { wrapped: t7 } = i7, e6 = this[s5];
        true !== t7 || this._$AL.has(s5) || void 0 === e6 || this.C(s5, void 0, i7, e6);
      }
    }
    let t5 = false;
    const s4 = this._$AL;
    try {
      t5 = this.shouldUpdate(s4), t5 ? (this.willUpdate(s4), this._$EO?.forEach((t6) => t6.hostUpdate?.()), this.update(s4)) : this._$EM();
    } catch (s5) {
      throw t5 = false, this._$EM(), s5;
    }
    t5 && this._$AE(s4);
  }
  willUpdate(t5) {
  }
  _$AE(t5) {
    this._$EO?.forEach((t6) => t6.hostUpdated?.()), this.hasUpdated || (this.hasUpdated = true, this.firstUpdated(t5)), this.updated(t5);
  }
  _$EM() {
    this._$AL = /* @__PURE__ */ new Map(), this.isUpdatePending = false;
  }
  get updateComplete() {
    return this.getUpdateComplete();
  }
  getUpdateComplete() {
    return this._$ES;
  }
  shouldUpdate(t5) {
    return true;
  }
  update(t5) {
    this._$Eq &&= this._$Eq.forEach((t6) => this._$ET(t6, this[t6])), this._$EM();
  }
  updated(t5) {
  }
  firstUpdated(t5) {
  }
};
y.elementStyles = [], y.shadowRootOptions = { mode: "open" }, y[d("elementProperties")] = /* @__PURE__ */ new Map(), y[d("finalized")] = /* @__PURE__ */ new Map(), p?.({ ReactiveElement: y }), (a.reactiveElementVersions ??= []).push("2.1.2");

// node_modules/lit-html/lit-html.js
/**
 * @license
 * Copyright 2017 Google LLC
 * SPDX-License-Identifier: BSD-3-Clause
 */
var t2 = globalThis;
var i3 = (t5) => t5;
var s2 = t2.trustedTypes;
var e3 = s2 ? s2.createPolicy("lit-html", { createHTML: (t5) => t5 }) : void 0;
var h2 = "$lit$";
var o3 = `lit$${Math.random().toFixed(9).slice(2)}$`;
var n3 = "?" + o3;
var r3 = `<${n3}>`;
var l2 = document;
var c3 = () => l2.createComment("");
var a2 = (t5) => null === t5 || "object" != typeof t5 && "function" != typeof t5;
var u2 = Array.isArray;
var d2 = (t5) => u2(t5) || "function" == typeof t5?.[Symbol.iterator];
var f2 = "[ 	\n\f\r]";
var v = /<(?:(!--|\/[^a-zA-Z])|(\/?[a-zA-Z][^>\s]*)|(\/?$))/g;
var _ = /-->/g;
var m = />/g;
var p2 = RegExp(`>|${f2}(?:([^\\s"'>=/]+)(${f2}*=${f2}*(?:[^ 	
\f\r"'\`<>=]|("|')|))|$)`, "g");
var g = /'/g;
var $ = /"/g;
var y2 = /^(?:script|style|textarea|title)$/i;
var x = (t5) => (i7, ...s4) => ({ _$litType$: t5, strings: i7, values: s4 });
var b2 = x(1);
var w = x(2);
var T = x(3);
var E = /* @__PURE__ */ Symbol.for("lit-noChange");
var A = /* @__PURE__ */ Symbol.for("lit-nothing");
var C = /* @__PURE__ */ new WeakMap();
var P = l2.createTreeWalker(l2, 129);
function V(t5, i7) {
  if (!u2(t5) || !t5.hasOwnProperty("raw")) throw Error("invalid template strings array");
  return void 0 !== e3 ? e3.createHTML(i7) : i7;
}
var N = (t5, i7) => {
  const s4 = t5.length - 1, e6 = [];
  let n4, l4 = 2 === i7 ? "<svg>" : 3 === i7 ? "<math>" : "", c4 = v;
  for (let i8 = 0; i8 < s4; i8++) {
    const s5 = t5[i8];
    let a3, u3, d3 = -1, f3 = 0;
    for (; f3 < s5.length && (c4.lastIndex = f3, u3 = c4.exec(s5), null !== u3); ) f3 = c4.lastIndex, c4 === v ? "!--" === u3[1] ? c4 = _ : void 0 !== u3[1] ? c4 = m : void 0 !== u3[2] ? (y2.test(u3[2]) && (n4 = RegExp("</" + u3[2], "g")), c4 = p2) : void 0 !== u3[3] && (c4 = p2) : c4 === p2 ? ">" === u3[0] ? (c4 = n4 ?? v, d3 = -1) : void 0 === u3[1] ? d3 = -2 : (d3 = c4.lastIndex - u3[2].length, a3 = u3[1], c4 = void 0 === u3[3] ? p2 : '"' === u3[3] ? $ : g) : c4 === $ || c4 === g ? c4 = p2 : c4 === _ || c4 === m ? c4 = v : (c4 = p2, n4 = void 0);
    const x2 = c4 === p2 && t5[i8 + 1].startsWith("/>") ? " " : "";
    l4 += c4 === v ? s5 + r3 : d3 >= 0 ? (e6.push(a3), s5.slice(0, d3) + h2 + s5.slice(d3) + o3 + x2) : s5 + o3 + (-2 === d3 ? i8 : x2);
  }
  return [V(t5, l4 + (t5[s4] || "<?>") + (2 === i7 ? "</svg>" : 3 === i7 ? "</math>" : "")), e6];
};
var S2 = class _S {
  constructor({ strings: t5, _$litType$: i7 }, e6) {
    let r5;
    this.parts = [];
    let l4 = 0, a3 = 0;
    const u3 = t5.length - 1, d3 = this.parts, [f3, v2] = N(t5, i7);
    if (this.el = _S.createElement(f3, e6), P.currentNode = this.el.content, 2 === i7 || 3 === i7) {
      const t6 = this.el.content.firstChild;
      t6.replaceWith(...t6.childNodes);
    }
    for (; null !== (r5 = P.nextNode()) && d3.length < u3; ) {
      if (1 === r5.nodeType) {
        if (r5.hasAttributes()) for (const t6 of r5.getAttributeNames()) if (t6.endsWith(h2)) {
          const i8 = v2[a3++], s4 = r5.getAttribute(t6).split(o3), e7 = /([.?@])?(.*)/.exec(i8);
          d3.push({ type: 1, index: l4, name: e7[2], strings: s4, ctor: "." === e7[1] ? I : "?" === e7[1] ? L : "@" === e7[1] ? z : H }), r5.removeAttribute(t6);
        } else t6.startsWith(o3) && (d3.push({ type: 6, index: l4 }), r5.removeAttribute(t6));
        if (y2.test(r5.tagName)) {
          const t6 = r5.textContent.split(o3), i8 = t6.length - 1;
          if (i8 > 0) {
            r5.textContent = s2 ? s2.emptyScript : "";
            for (let s4 = 0; s4 < i8; s4++) r5.append(t6[s4], c3()), P.nextNode(), d3.push({ type: 2, index: ++l4 });
            r5.append(t6[i8], c3());
          }
        }
      } else if (8 === r5.nodeType) if (r5.data === n3) d3.push({ type: 2, index: l4 });
      else {
        let t6 = -1;
        for (; -1 !== (t6 = r5.data.indexOf(o3, t6 + 1)); ) d3.push({ type: 7, index: l4 }), t6 += o3.length - 1;
      }
      l4++;
    }
  }
  static createElement(t5, i7) {
    const s4 = l2.createElement("template");
    return s4.innerHTML = t5, s4;
  }
};
function M(t5, i7, s4 = t5, e6) {
  if (i7 === E) return i7;
  let h3 = void 0 !== e6 ? s4._$Co?.[e6] : s4._$Cl;
  const o6 = a2(i7) ? void 0 : i7._$litDirective$;
  return h3?.constructor !== o6 && (h3?._$AO?.(false), void 0 === o6 ? h3 = void 0 : (h3 = new o6(t5), h3._$AT(t5, s4, e6)), void 0 !== e6 ? (s4._$Co ??= [])[e6] = h3 : s4._$Cl = h3), void 0 !== h3 && (i7 = M(t5, h3._$AS(t5, i7.values), h3, e6)), i7;
}
var R = class {
  constructor(t5, i7) {
    this._$AV = [], this._$AN = void 0, this._$AD = t5, this._$AM = i7;
  }
  get parentNode() {
    return this._$AM.parentNode;
  }
  get _$AU() {
    return this._$AM._$AU;
  }
  u(t5) {
    const { el: { content: i7 }, parts: s4 } = this._$AD, e6 = (t5?.creationScope ?? l2).importNode(i7, true);
    P.currentNode = e6;
    let h3 = P.nextNode(), o6 = 0, n4 = 0, r5 = s4[0];
    for (; void 0 !== r5; ) {
      if (o6 === r5.index) {
        let i8;
        2 === r5.type ? i8 = new k(h3, h3.nextSibling, this, t5) : 1 === r5.type ? i8 = new r5.ctor(h3, r5.name, r5.strings, this, t5) : 6 === r5.type && (i8 = new Z(h3, this, t5)), this._$AV.push(i8), r5 = s4[++n4];
      }
      o6 !== r5?.index && (h3 = P.nextNode(), o6++);
    }
    return P.currentNode = l2, e6;
  }
  p(t5) {
    let i7 = 0;
    for (const s4 of this._$AV) void 0 !== s4 && (void 0 !== s4.strings ? (s4._$AI(t5, s4, i7), i7 += s4.strings.length - 2) : s4._$AI(t5[i7])), i7++;
  }
};
var k = class _k {
  get _$AU() {
    return this._$AM?._$AU ?? this._$Cv;
  }
  constructor(t5, i7, s4, e6) {
    this.type = 2, this._$AH = A, this._$AN = void 0, this._$AA = t5, this._$AB = i7, this._$AM = s4, this.options = e6, this._$Cv = e6?.isConnected ?? true;
  }
  get parentNode() {
    let t5 = this._$AA.parentNode;
    const i7 = this._$AM;
    return void 0 !== i7 && 11 === t5?.nodeType && (t5 = i7.parentNode), t5;
  }
  get startNode() {
    return this._$AA;
  }
  get endNode() {
    return this._$AB;
  }
  _$AI(t5, i7 = this) {
    t5 = M(this, t5, i7), a2(t5) ? t5 === A || null == t5 || "" === t5 ? (this._$AH !== A && this._$AR(), this._$AH = A) : t5 !== this._$AH && t5 !== E && this._(t5) : void 0 !== t5._$litType$ ? this.$(t5) : void 0 !== t5.nodeType ? this.T(t5) : d2(t5) ? this.k(t5) : this._(t5);
  }
  O(t5) {
    return this._$AA.parentNode.insertBefore(t5, this._$AB);
  }
  T(t5) {
    this._$AH !== t5 && (this._$AR(), this._$AH = this.O(t5));
  }
  _(t5) {
    this._$AH !== A && a2(this._$AH) ? this._$AA.nextSibling.data = t5 : this.T(l2.createTextNode(t5)), this._$AH = t5;
  }
  $(t5) {
    const { values: i7, _$litType$: s4 } = t5, e6 = "number" == typeof s4 ? this._$AC(t5) : (void 0 === s4.el && (s4.el = S2.createElement(V(s4.h, s4.h[0]), this.options)), s4);
    if (this._$AH?._$AD === e6) this._$AH.p(i7);
    else {
      const t6 = new R(e6, this), s5 = t6.u(this.options);
      t6.p(i7), this.T(s5), this._$AH = t6;
    }
  }
  _$AC(t5) {
    let i7 = C.get(t5.strings);
    return void 0 === i7 && C.set(t5.strings, i7 = new S2(t5)), i7;
  }
  k(t5) {
    u2(this._$AH) || (this._$AH = [], this._$AR());
    const i7 = this._$AH;
    let s4, e6 = 0;
    for (const h3 of t5) e6 === i7.length ? i7.push(s4 = new _k(this.O(c3()), this.O(c3()), this, this.options)) : s4 = i7[e6], s4._$AI(h3), e6++;
    e6 < i7.length && (this._$AR(s4 && s4._$AB.nextSibling, e6), i7.length = e6);
  }
  _$AR(t5 = this._$AA.nextSibling, s4) {
    for (this._$AP?.(false, true, s4); t5 !== this._$AB; ) {
      const s5 = i3(t5).nextSibling;
      i3(t5).remove(), t5 = s5;
    }
  }
  setConnected(t5) {
    void 0 === this._$AM && (this._$Cv = t5, this._$AP?.(t5));
  }
};
var H = class {
  get tagName() {
    return this.element.tagName;
  }
  get _$AU() {
    return this._$AM._$AU;
  }
  constructor(t5, i7, s4, e6, h3) {
    this.type = 1, this._$AH = A, this._$AN = void 0, this.element = t5, this.name = i7, this._$AM = e6, this.options = h3, s4.length > 2 || "" !== s4[0] || "" !== s4[1] ? (this._$AH = Array(s4.length - 1).fill(new String()), this.strings = s4) : this._$AH = A;
  }
  _$AI(t5, i7 = this, s4, e6) {
    const h3 = this.strings;
    let o6 = false;
    if (void 0 === h3) t5 = M(this, t5, i7, 0), o6 = !a2(t5) || t5 !== this._$AH && t5 !== E, o6 && (this._$AH = t5);
    else {
      const e7 = t5;
      let n4, r5;
      for (t5 = h3[0], n4 = 0; n4 < h3.length - 1; n4++) r5 = M(this, e7[s4 + n4], i7, n4), r5 === E && (r5 = this._$AH[n4]), o6 ||= !a2(r5) || r5 !== this._$AH[n4], r5 === A ? t5 = A : t5 !== A && (t5 += (r5 ?? "") + h3[n4 + 1]), this._$AH[n4] = r5;
    }
    o6 && !e6 && this.j(t5);
  }
  j(t5) {
    t5 === A ? this.element.removeAttribute(this.name) : this.element.setAttribute(this.name, t5 ?? "");
  }
};
var I = class extends H {
  constructor() {
    super(...arguments), this.type = 3;
  }
  j(t5) {
    this.element[this.name] = t5 === A ? void 0 : t5;
  }
};
var L = class extends H {
  constructor() {
    super(...arguments), this.type = 4;
  }
  j(t5) {
    this.element.toggleAttribute(this.name, !!t5 && t5 !== A);
  }
};
var z = class extends H {
  constructor(t5, i7, s4, e6, h3) {
    super(t5, i7, s4, e6, h3), this.type = 5;
  }
  _$AI(t5, i7 = this) {
    if ((t5 = M(this, t5, i7, 0) ?? A) === E) return;
    const s4 = this._$AH, e6 = t5 === A && s4 !== A || t5.capture !== s4.capture || t5.once !== s4.once || t5.passive !== s4.passive, h3 = t5 !== A && (s4 === A || e6);
    e6 && this.element.removeEventListener(this.name, this, s4), h3 && this.element.addEventListener(this.name, this, t5), this._$AH = t5;
  }
  handleEvent(t5) {
    "function" == typeof this._$AH ? this._$AH.call(this.options?.host ?? this.element, t5) : this._$AH.handleEvent(t5);
  }
};
var Z = class {
  constructor(t5, i7, s4) {
    this.element = t5, this.type = 6, this._$AN = void 0, this._$AM = i7, this.options = s4;
  }
  get _$AU() {
    return this._$AM._$AU;
  }
  _$AI(t5) {
    M(this, t5);
  }
};
var j = { M: h2, P: o3, A: n3, C: 1, L: N, R, D: d2, V: M, I: k, H, N: L, U: z, B: I, F: Z };
var B = t2.litHtmlPolyfillSupport;
B?.(S2, k), (t2.litHtmlVersions ??= []).push("3.3.3");
var D = (t5, i7, s4) => {
  const e6 = s4?.renderBefore ?? i7;
  let h3 = e6._$litPart$;
  if (void 0 === h3) {
    const t6 = s4?.renderBefore ?? null;
    e6._$litPart$ = h3 = new k(i7.insertBefore(c3(), t6), t6, void 0, s4 ?? {});
  }
  return h3._$AI(t5), h3;
};

// node_modules/lit-element/lit-element.js
/**
 * @license
 * Copyright 2017 Google LLC
 * SPDX-License-Identifier: BSD-3-Clause
 */
var s3 = globalThis;
var i4 = class extends y {
  constructor() {
    super(...arguments), this.renderOptions = { host: this }, this._$Do = void 0;
  }
  createRenderRoot() {
    const t5 = super.createRenderRoot();
    return this.renderOptions.renderBefore ??= t5.firstChild, t5;
  }
  update(t5) {
    const r5 = this.render();
    this.hasUpdated || (this.renderOptions.isConnected = this.isConnected), super.update(t5), this._$Do = D(r5, this.renderRoot, this.renderOptions);
  }
  connectedCallback() {
    super.connectedCallback(), this._$Do?.setConnected(true);
  }
  disconnectedCallback() {
    super.disconnectedCallback(), this._$Do?.setConnected(false);
  }
  render() {
    return E;
  }
};
i4._$litElement$ = true, i4["finalized"] = true, s3.litElementHydrateSupport?.({ LitElement: i4 });
var o4 = s3.litElementPolyfillSupport;
o4?.({ LitElement: i4 });
(s3.litElementVersions ??= []).push("4.2.2");

// node_modules/lit-html/is-server.js
/**
 * @license
 * Copyright 2022 Google LLC
 * SPDX-License-Identifier: BSD-3-Clause
 */

// node_modules/lit-html/directive.js
/**
 * @license
 * Copyright 2017 Google LLC
 * SPDX-License-Identifier: BSD-3-Clause
 */
var t3 = { ATTRIBUTE: 1, CHILD: 2, PROPERTY: 3, BOOLEAN_ATTRIBUTE: 4, EVENT: 5, ELEMENT: 6 };
var e4 = (t5) => (...e6) => ({ _$litDirective$: t5, values: e6 });
var i5 = class {
  constructor(t5) {
  }
  get _$AU() {
    return this._$AM._$AU;
  }
  _$AT(t5, e6, i7) {
    this._$Ct = t5, this._$AM = e6, this._$Ci = i7;
  }
  _$AS(t5, e6) {
    return this.update(t5, e6);
  }
  update(t5, e6) {
    return this.render(...e6);
  }
};

// node_modules/lit-html/directives/unsafe-html.js
/**
 * @license
 * Copyright 2017 Google LLC
 * SPDX-License-Identifier: BSD-3-Clause
 */
var e5 = class extends i5 {
  constructor(i7) {
    if (super(i7), this.it = A, i7.type !== t3.CHILD) throw Error(this.constructor.directiveName + "() can only be used in child bindings");
  }
  render(r5) {
    if (r5 === A || null == r5) return this._t = void 0, this.it = r5;
    if (r5 === E) return r5;
    if ("string" != typeof r5) throw Error(this.constructor.directiveName + "() called with a non-string value");
    if (r5 === this.it) return this._t;
    this.it = r5;
    const s4 = [r5];
    return s4.raw = s4, this._t = { _$litType$: this.constructor.resultType, strings: s4, values: [] };
  }
};
e5.directiveName = "unsafeHTML", e5.resultType = 1;
var o5 = e4(e5);

// node_modules/lit-html/directive-helpers.js
/**
 * @license
 * Copyright 2020 Google LLC
 * SPDX-License-Identifier: BSD-3-Clause
 */
var { I: t4 } = j;
var r4 = (o6) => void 0 === o6.strings;
var m2 = {};
var p3 = (o6, t5 = m2) => o6._$AH = t5;

// node_modules/lit-html/directives/keyed.js
/**
 * @license
 * Copyright 2021 Google LLC
 * SPDX-License-Identifier: BSD-3-Clause
 */
var i6 = e4(class extends i5 {
  constructor() {
    super(...arguments), this.key = A;
  }
  render(r5, t5) {
    return this.key = r5, t5;
  }
  update(r5, [t5, e6]) {
    return t5 !== this.key && (p3(r5), this.key = t5), e6;
  }
});

// src/ueber.js
var NEU_GEPLANT = [
  "Staffelung der Heizungen je Stromanschluss",
  "Arbeitszeiten mit Startdatum, Vor- und Nachheizen",
  "Firmen und Abrechnung, Auswertung über alle laufenden Baustellen",
  "Container nur bei Bedarf, Termine und Serien, schnell aufheizen",
  "Türkontakt, Warnungen mit Stufen, dauerhaftes Protokoll",
  "Handy-Nachrichten mit Knöpfen, Wochen-/Monatsbericht per E-Mail",
  "Glas-Oberfläche mit Himmel nach Tageszeit und Wetter",
  "Seite „Über“ und Melden-Knopf"
];
function ueberVorlage(p4, { mitZurueck = true } = {}) {
  const V2 = p4.seiteVersion, I2 = p4.version, gleich = I2 === V2 || I2 === "–", cl = p4.changelog, offen = p4.s.cl ?? 0, eigen = cl && cl.find((c4) => c4.version === V2);
  const neu = eigen ? eigen.punkte : NEU_GEPLANT;
  const ha = p4.hass && p4.hass.config && p4.hass.config.version || "–";
  const umschalten = (i7) => {
    p4.s.cl = (p4.s.cl ?? 0) === i7 ? -1 : i7;
    p4.litNeu();
  };
  return b2`${mitZurueck ? b2`<div class="zurueck-zeile"><button class="glas-panel chip" @click=${() => p4.gehe("einst")}>‹ Einstellungen</button></div>` : A}
      <div class="glas-panel ueber-kopf"><div class="ueber-illu">${o5(bcContainer(BEREICH_FARBEN[0], "heizt"))}</div>
        <div><div class="glas-klein">HOME-ASSISTANT-INTEGRATION</div><div class="glas-titel">Baustelle</div><div class="ueber-v">Version <b>${V2}</b>${eigen ? A : b2` <span class="badge blau-b">in Arbeit</span>`}</div>
          <div class="leise">Heizung und Pumpen auf der Baustelle · ${gleich ? "Integration und Seite haben dieselbe Nummer" : verNeuer(V2, I2) ? `die Integration läuft noch mit ${I2} und übernimmt ${V2} beim nächsten Neustart von Home Assistant` : `die Integration ist schon auf ${I2} – Seite neu laden`}</div></div></div>
      <div class="glas-panel liste"><div class="gruppe">Dieses System</div>
        ${gleich ? b2`<div class="zeile"><span>Integration / Seite</span><span class="leise">${V2} · baustelle</span></div>` : b2`<div class="zeile"><span>Seite</span><span class="leise">${V2}</span></div><div class="zeile"><span>Integration</span><span class="leise">${I2} · baustelle${verNeuer(V2, I2) ? " · bis zum Neustart" : ""}</span></div>`}
        <div class="zeile"><span>Home Assistant</span><span class="leise">${ha}</span></div>
        <div class="zeile"><span>Quellcode</span><span class="leise">GitHub · herbertschrotter-blip/ha-baustrommanager (öffentlich, MIT-Lizenz)</span></div>
        <div class="zeile"><span>Baustellen</span><span class="leise">${p4.alle.filter((b3) => b3.aktiv).length} laufend · ${p4.alle.filter((b3) => !b3.aktiv).length} abgeschlossen</span></div></div>
      <div class="glas-panel block"><div class="block-kopf"><b>Neu in ${V2}</b><span class="leise">${eigen ? datum(eigen.datum) : "geplant"}</span></div>${neu.map((n4) => b2`<div class="cl-punkt">${n4}</div>`)}</div>
      <div class="glas-panel block"><div class="block-kopf"><b>Verlauf</b><span class="leise">aus CHANGELOG.md</span></div>
        ${cl === null ? b2`<div class="leer">Lädt …</div>` : !cl.length ? b2`<div class="leise">Kein Verlauf vorhanden</div>` : cl.map((c4, i7) => b2`<button class="zeile cl-v" aria-expanded=${offen === i7 ? "true" : "false"} @click=${() => umschalten(i7)}><span><b>${c4.version}</b> <span class="leise">${datum(c4.datum)}</span></span><span class="chev">${offen === i7 ? "⌄" : "›"}</span></button>
          ${offen === i7 ? b2`<div class="cl-liste">${(c4.punkte || []).map((t5) => b2`<div class="cl-punkt">${t5}</div>`)}</div>` : A}`)}</div>
      ${!p4.d || p4.d.e.melden ? b2`<button class="knopf" @click=${() => p4.meldenAuf()}>Fehler, Wunsch oder Anregung melden</button>` : A}`;
}

// node_modules/lit-html/directives/live.js
/**
 * @license
 * Copyright 2020 Google LLC
 * SPDX-License-Identifier: BSD-3-Clause
 */
var l3 = e4(class extends i5 {
  constructor(r5) {
    if (super(r5), r5.type !== t3.PROPERTY && r5.type !== t3.ATTRIBUTE && r5.type !== t3.BOOLEAN_ATTRIBUTE) throw Error("The `live` directive is not allowed on child or event bindings");
    if (!r4(r5)) throw Error("`live` bindings can only contain a single expression");
  }
  render(r5) {
    return r5;
  }
  update(i7, [t5]) {
    if (t5 === E || t5 === A) return t5;
    const o6 = i7.element, l4 = i7.name;
    if (i7.type === t3.PROPERTY) {
      if (t5 === o6[l4]) return E;
    } else if (i7.type === t3.BOOLEAN_ATTRIBUTE) {
      if (!!t5 === o6.hasAttribute(l4)) return E;
    } else if (i7.type === t3.ATTRIBUTE && o6.getAttribute(l4) === t5 + "") return E;
    return p3(i7), t5;
  }
});

// src/melden.js
var MB_MAX = 3;
var MB_PX = 1600;
var MB_SUMME = 3e6;
var FRAGE = { fehler: "Was ist passiert, was hättest du erwartet?", wunsch: "Was wünschst du dir?", anregung: "Deine Idee" };
function bilderBox(p4, f3) {
  const B2 = f3.bilder || [], pc = !p4.narrow, auf = pc && typeof navigator !== "undefined" && navigator.mediaDevices && navigator.mediaDevices.getDisplayMedia;
  const gewaehlt = (e6) => {
    [...e6.target.files || []].forEach((x2) => p4.mbDatei(x2, "gewählt"));
    e6.target.value = "";
  };
  return b2`<div class="mb-box"><div class="mb-kopf"><b>📷 Screenshot</b><span class="leise">${B2.length} von ${MB_MAX}</span></div>
      ${B2.length >= MB_MAX ? A : b2`<div class="mb-knoepfe"><label>📎 Bild wählen<input type="file" accept="image/*" multiple @change=${gewaehlt}></label>${auf ? b2`<button @click=${() => p4.mbFenster()}>🖥 Fenster aufnehmen</button>` : A}</div>`}
      <div class="mb-hinweis">${pc ? b2`oder einen Screenshot mit <b>Strg+V</b> einfügen (z. B. nach Win+Shift+S)` : "Screenshot mit den Handy-Tasten machen, dann hier wählen"} · wird auf höchstens ${MB_PX} px verkleinert</div>
      ${B2.length ? b2`<div class="mb-bilder">${B2.map((x2, i7) => b2`<div class="mb-bild ${x2.b > x2.h ? "quer" : ""}"><img src=${x2.url} alt="Bild ${i7 + 1}"><button class="x" aria-label="Bild entfernen" @click=${() => {
    B2.splice(i7, 1);
    p4.litNeu();
  }}>✕</button><small>${x2.b}×${x2.h} · ${x2.kb} KB</small></div>`)}</div>` : A}</div>`;
}
function meldenVorlage(p4, f3) {
  const d3 = p4.d;
  const setze = (k2, v2) => {
    f3[k2] = v2;
    p4.litNeu();
  };
  return b2`<div class="griff"></div><h3>Melden</h3><div class="leise">Fehler, Wunsch oder Anregung – landet im Entwicklermenü.</div>
        <div class="seg">${[["fehler", "Fehler"], ["wunsch", "Wunsch"], ["anregung", "Anregung"]].map(([k2, t5]) => b2`<button class=${f3.art === k2 ? "on" : ""} @click=${() => setze("art", k2)}>${t5}</button>`)}</div>
        <label class="feld">${FRAGE[f3.art]}<textarea rows="4" name="ml-text" placeholder="kurz beschreiben" .value=${l3(f3.text)} @input=${(e6) => {
    f3.text = e6.target.value;
  }}></textarea></label>
        <div class="ml-kontext"><div><span class="leise">Fenster</span> ${f3.kontext}</div><div><span class="leise">Version</span> ${p4.version} · ${f3.geraet} · ${d3 ? `${wtag(d3.z.HEUTE)} ${kurzDatum(d3.z.HEUTE)} ${d3.z.JETZT}` : ""}</div></div>
        ${bilderBox(p4, f3)}
        <div class="zeile"><div><b>Stand der Seite mitschicken</b><div class="leise">Zustand und Einstellungen als Anhang – hilft beim Nachstellen, ohne Zugangsdaten</div></div><button class="sw ml-stand ${f3.stand ? "on" : ""}" role="switch" aria-checked=${f3.stand ? "true" : "false"} @click=${() => setze("stand", !f3.stand)}><i></i></button></div>
        <button class="knopf amber ml-senden" @click=${() => p4.meldungSenden()}>Senden</button><button class="knopf leise-k ml-zurueck" @click=${() => p4.meldenZu()}>Abbrechen</button>`;
}

// src/ansichten/allgemein.js
var kopfVorlage = (titel2, klein, rechts = A) => b2`<div class="glas-kopf glas-panel"><div><div class="glas-klein">${klein}</div><div class="glas-titel">${titel2}</div></div>${rechts}</div>`;
var ladenVorlage = (fehler) => b2`<div class="glas-panel block">${fehler ? b2`<div class="leer">Die Integration antwortet nicht: ${fehler}</div>` : b2`<div class="leer">Lädt …</div>`}</div>`;
var leerVorlage = (p4) => b2`${kopfVorlage("Baustelle", "KEINE LAUFENDE BAUSTELLE")}
      <div class="glas-panel liste"><div class="zeile"><span class="leise">Lege eine Baustelle an – danach kommen Container und Shellys dazu.</span></div>
        <button class="zeile" @click=${() => p4.einblenden("baustelle-neu")}><span class="blau">+ Neue Baustelle</span></button>
        ${p4.alle.length ? b2`<button class="zeile" @click=${() => p4.gehe("verlauf")}><span>Abgeschlossene Baustellen</span><span class="chev">›</span></button>` : A}</div>`;
var schalterVorlage = (on, fn, cls = "") => b2`<button class="sw ${on ? "on" : ""} ${cls}" role="switch" aria-checked=${!!on} @click=${fn}><i></i></button>`;
var stepperVorlage = (p4, k2, d3, fmt) => b2`<span class="stepper"><button data-k=${k2} data-d=${-d3} @click=${() => p4.stufeSchritt(k2, -d3)}>−</button><b>${fmt(p4.d.e[k2])}</b><button data-k=${k2} data-d=${d3} @click=${() => p4.stufeSchritt(k2, d3)}>+</button></span>`;

// src/ansichten/dev.js
var ART = { fehler: ["Fehler", "rot-b"], wunsch: ["Wunsch", "blau-b"], anregung: ["Anregung", "gruen"] };
function meldungVorlage(p4, m3) {
  const letzte = (m3.verlauf || []).filter((v2) => v2.notiz || v2.version).at(-1), art = ART[m3.art] || ART.wunsch, offen = p4.meldungOffen(m3);
  return b2`<div class="ml ${offen ? "offen" : "erledigt"}" data-meldung=${m3.id}><div class="ml-kopf"><span><b class="ml-nr">${m3.ticket || ""}</b> <span class="badge ${art[1]}">${art[0]}</span> <span class="badge st-${m3.status}">${TICKET_STATUS[m3.status] || m3.status}</span></span><span class="leise">${p4.meldungZeit(m3)} · ${m3.geraet || "–"} · v${m3.version || "–"}</span></div>
          <div class="ml-text">${m3.text}</div><div class="leise">📍 ${m3.kontext || "–"}</div>
          ${(m3.bilder || []).length ? b2`<div class="ml-bilder">${m3.bilder.map((_2, i7) => {
    const u3 = p4.mlBild(m3, i7);
    return u3 ? b2`<img src=${u3} alt="Bild ${i7 + 1}" role="button" @click=${() => p4.meldungBild(m3.id, i7)}>` : b2`<span class="ml-bild-laedt"></span>`;
  })}</div>` : A}
          ${letzte ? b2`<div class="leise ml-notiz">↳ ${letzte.von || ""}: ${[letzte.version ? "v" + letzte.version : "", letzte.notiz || ""].filter(Boolean).join(" · ")}</div>` : A}
          <div class="wk-knoepfe"><button class="chip glas-panel ml-status" @click=${() => p4.meldungStatus(m3.id)}>${offen ? "✓ Schließen" : "↺ wieder öffnen"}</button><button class="chip glas-panel ml-weg" @click=${() => p4.meldungWeg(m3.id)}>Löschen</button></div></div>`;
}
function devVorlage(p4, { teil = "alle" } = {}) {
  const f3 = p4.s.mfilter || "offen", alle = p4.meldungen(), passt = (m3) => f3 === "alle" || f3 === "offen" === p4.meldungOffen(m3), M2 = (alle || []).filter(passt);
  const anzahl = (k2) => !alle ? "" : k2 === "alle" ? alle.length : alle.filter((m3) => k2 === "offen" === p4.meldungOffen(m3)).length;
  const filter = (k2) => {
    p4.s.mfilter = k2;
    p4.neuZeichnen();
  };
  const meldungen2 = b2`<div class="glas-panel block"><div class="block-kopf"><b>Meldungen</b><div class="seg klein">${[["offen", "offen"], ["erledigt", "erledigt"], ["alle", "alle"]].map(([k2, t5]) => b2`<button class=${f3 === k2 ? "on" : ""} @click=${() => filter(k2)}>${t5} ${anzahl(k2)}</button>`)}</div></div>
        ${alle === null ? b2`<div class="leer">Lädt …</div>` : M2.length ? M2.map((m3) => meldungVorlage(p4, m3)) : b2`<div class="leer">Keine Meldungen</div>`}
        <div class="wk-knoepfe"><button class="chip glas-panel dev-md" @click=${() => p4.meldungenKopieren()}>Als Markdown kopieren</button><button class="chip glas-panel dev-json" @click=${() => p4.meldungenJson()}>Als JSON herunterladen</button></div>
        <div class="leise">Jede Meldung ist ein Ticket (FE Fehler, WU Wunsch, AN Anregung). In Claude Code mit „Tickets prüfen“ abarbeiten lassen – ist ein Ticket behoben und eingespielt, setzt Claude es auf erledigt. Passt es nicht, hier wieder öffnen.</div></div>`;
  const eigen = (p4.changelog || []).find((c4) => c4.version === p4.version);
  const werkzeuge = b2`<div class="glas-panel liste"><div class="gruppe">Werkzeuge</div>
        <button class="zeile dev-diagnose" @click=${() => p4.diagnoseHerunterladen()}><span>Diagnose herunterladen</span><span class="chev">›</span></button>
        <div class="zeile"><span>Version</span><span class="leise">${p4.version}${eigen ? " · " + (eigen.datum || "").slice(0, 7) : ""}</span></div></div>`;
  if (teil === "meldungen") return meldungen2;
  if (teil === "werkzeuge") return werkzeuge;
  return b2`<div class="zurueck-zeile"><button class="glas-panel chip" @click=${() => p4.gehe("einst")}>‹ Einstellungen</button></div>
      ${kopfVorlage("Entwicklung", "NUR FÜR DICH")}
      ${meldungen2}
      ${werkzeuge}`;
}

// src/ansichten/verlauf.js
var LAEDT = b2`<div class="leer">Lädt …</div>`;
function archiv(p4) {
  const BS = [...p4.alle].sort((a3, b3) => b3.aktiv - a3.aktiv), K = new Map(BS.map((b3) => [b3.entry, p4.kennz(b3)])), MONK = p4.vlMonatsKeys(), laedt = BS.some((b3) => K.get(b3.entry).laedt);
  const sum = (k2) => BS.reduce((a3, b3) => a3 + (K.get(b3.entry)[k2] || 0), 0);
  const zahl0 = (v2, n4 = 0) => zahl(v2) ? de(v2, n4) : "–";
  return b2`<div class="glas-panel kennz vier">${[[BS.length, `Baustellen · ${BS.filter((b3) => b3.aktiv).length} aktiv`], [laedt ? "–" : de(sum("kwh"), 0), "kWh gesamt"], [laedt ? "–" : `${de(sum("eur"), 0)} €`, "Kosten gesamt"], [laedt ? "–" : `${de(sum("gespart"), 0)} €`, "gespart"]].map(([w2, t5]) => b2`<div><b>${w2}</b><span>${t5}</span></div>`)}</div>
      ${BS.length ? b2`<div class="vl-archiv">${BS.map((b3) => {
    const k2 = K.get(b3.entry), i7 = p4.alle.indexOf(b3), farbe = `var(--s${i7 % 6 + 1})`;
    return b2`<button class="glas-panel vl-karte ${b3.aktiv ? "aktiv" : ""}" data-bs=${b3.entry} @click=${() => p4.baustelleOeffnen(b3.entry)}>
          <div class="bs-kopf"><b>${b3.titel}</b><span class="badge ${b3.aktiv ? "gruen" : ""}">${b3.aktiv ? "aktiv" : "abgeschlossen"}</span></div>
          <div class="leise">${k2.zeit} · ${k2.container} Container · ${k2.laedt ? "–" : k2.heiztage} Heiztage</div>
          ${o5(p4.vlFunke(MONK.map((m3) => k2.jeMonat[m3] || 0), farbe))}<div class="vl-monate"><span>${MONATE[+MONK[0].slice(5) - 1]}</span><span>${MONATE[+MONK[11].slice(5) - 1]}</span></div>
          <div class="vl-zahlen"><div><b>${k2.laedt ? "–" : zahl0(k2.kwh)}</b><small>kWh</small></div><div><b>${k2.laedt ? "–" : `${zahl0(k2.eur)} €`}</b><small>Kosten</small></div>
            <div><b>${k2.laedt ? "–" : zahl0(k2.vergleich.tag, 1)}</b><small>kWh/Heiztag</small></div><div><b class="gruen-t">${zahl(k2.gespart) ? `${de(k2.gespart, 0)} €` : "–"}</b><small>gespart</small></div></div>
          <span class="leise vl-mehr">${b3.aktiv ? "Übersicht ›" : "ansehen ›"}</span></button>`;
  })}</div>` : b2`<div class="glas-panel block"><div class="leer">Noch keine Baustelle</div></div>`}`;
}
function vergleich(p4) {
  const BS = p4.alle, K = new Map(BS.map((b3) => [b3.entry, p4.kennz(b3)])), sp = p4.s.vlSort || "tag", ab = p4.s.vlAb !== false, MONK = p4.vlMonatsKeys();
  const spalten = [["name", "Baustelle"], ["tag", "kWh/Heiztag"], ["monat", "€/Monat"], ["kwh", "kWh"], ["eur", "€"], ["heiztage", "Heiztage"], ["container", "Cont."]];
  const wert2 = (b3, kk) => {
    const k2 = K.get(b3.entry);
    return { name: b3.titel, tag: k2.vergleich.tag, monat: k2.vergleich.monat, kwh: k2.kwh, eur: k2.eur, heiztage: k2.heiztage, container: k2.container }[kk];
  };
  const zeilen = BS.map((b3, i7) => ({ b: b3, i: i7 })).sort((x2, y3) => {
    const a3 = wert2(x2.b, sp), c4 = wert2(y3.b, sp);
    return (typeof a3 === "string" ? String(a3).localeCompare(String(c4)) : (a3 ?? -1) - (c4 ?? -1)) * (ab ? -1 : 1);
  });
  const tage = BS.map((b3) => wert2(b3, "tag")).filter((v2) => zahl(v2) && v2 > 0), bester = tage.length > 1 ? Math.min(...tage) : null;
  const reihen = BS.map((b3, i7) => ({ name: b3.titel, v: MONK.map((m3) => K.get(b3.entry).jeMonat[m3] || 0), farbe: `var(--s${i7 % 6 + 1})` })).filter((x2) => x2.v.some((v2) => v2 > 0.5));
  const laedt = BS.some((b3) => K.get(b3.entry).laedt), f3 = (v2, n4 = 0) => zahl(v2) ? de(v2, n4) : "–";
  const sortiere = (k2) => {
    p4.s.vlAb = p4.s.vlSort === k2 ? !(p4.s.vlAb !== false) : true;
    p4.s.vlSort = k2;
    p4.neuZeichnen();
  };
  return b2`<div class="glas-panel block vl-tabelle"><div class="block-kopf"><b>Alle Baustellen</b><span class="leise">Spalte antippen sortiert · kWh je Heiztag ist am besten vergleichbar</span></div>
        <div class="vl-tab-kopf">${spalten.map(([k2, t5]) => b2`<button class=${sp === k2 ? "on" : ""} data-sp=${k2} @click=${() => sortiere(k2)}>${t5}${sp === k2 ? ab ? " ▼" : " ▲" : ""}</button>`)}</div>
        ${zeilen.map(({ b: b3, i: i7 }) => {
    const k2 = K.get(b3.entry);
    return b2`<button class="vl-tab-zeile" data-bs=${b3.entry} @click=${() => p4.baustelleOeffnen(b3.entry)}><span class="vl-tab-name"><span><i class="farbpunkt" style="background:var(--s${i7 % 6 + 1})"></i>${b3.titel}</span><small>${k2.zeit}</small></span>
          <b class=${bester !== null && k2.vergleich.tag === bester ? "gruen-t" : ""}>${f3(k2.vergleich.tag, 1)}</b><span>${f3(k2.vergleich.monat)}</span><span>${f3(k2.kwh)}</span><span>${f3(k2.eur)}</span><span>${k2.laedt ? "–" : k2.heiztage}</span><span>${k2.container}</span></button>`;
  })}</div>
      <div class="glas-panel block"><div class="block-kopf"><b>Letzte 12 Monate</b><span class="leise">kWh je Monat, gestapelt nach Baustelle</span></div>
        <div class="chart-wrap">${laedt ? LAEDT : reihen.length ? o5(flaeche("zwoelf", reihen, MONK.map((m3) => MONATE[+m3.slice(5) - 1]), "kWh", 2)) : b2`<div class="leer">Noch keine Werte</div>`}</div></div>`;
}
function chronik(p4) {
  const d3 = p4.d, f3 = p4.s.pfilter || "alle", q = (p4.s.vlSuche || "").toLowerCase().trim(), v2 = p4.verlaufDaten(d3), jeTag = v2 && v2.je_tag || {};
  const ART2 = { warnung: ["⚠", "var(--rot)"], ok: ["✓", "#30d158"], schalten: ["⏻", "var(--amber)"], wetter: ["☁", "var(--blau)"], nachricht: ["✉", "var(--ink2)"], einstellung: ["⚙", "var(--ink2)"] };
  const quelle = p4.protokollQuelle(d3);
  const passt = (e6) => (f3 === "alle" || e6[2] === f3 || f3 === "warnung" && e6[2] === "ok" || f3 === "schalten" && e6[2] === "einstellung") && (!q || `${e6[3] ? p4.bName(e6[3]) : ""} ${e6[4]}`.toLowerCase().includes(q));
  const tage = [];
  for (const e6 of quelle.filter(passt)) {
    const t5 = tage.at(-1);
    if (t5 && t5.tag === e6[0]) t5.e.push(e6);
    else tage.push({ tag: e6[0], iso: e6[5], e: [e6] });
  }
  const filter = (k2) => {
    p4.s.pfilter = k2;
    p4.s.pmehr = false;
    p4.neuZeichnen();
  };
  return b2`<div class="glas-panel vl-filter"><input class="vl-suche" placeholder="Suchen (Container, Text) …" .value=${p4.s.vlSuche || ""} @input=${(e6) => {
    p4.s.vlSuche = e6.target.value;
    p4.neuZeichnen();
  }}>
        <div class="vb-wer">${[["alle", "Alle"], ["warnung", "⚠ Warnungen"], ["schalten", "⏻ Schalten"], ["wetter", "☁ Wetter"], ["nachricht", "✉ Nachrichten"]].map(([k2, t5]) => b2`<button class=${f3 === k2 ? "on" : ""} data-pf=${k2} @click=${() => filter(k2)}>${t5}</button>`)}</div></div>
      ${tage.length ? tage.map((t5) => {
    const kwh = t5.iso ? jeTag[t5.iso] : null;
    return b2`<div class="glas-panel vl-tag"><div class="vl-tag-kopf"><b>${t5.tag}</b><span class="leise">${zahl(kwh) ? `${de(kwh, 1)} kWh · ${de(kwh * d3.e.preis, 2)} € · ` : ""}${t5.e.length} ${t5.e.length === 1 ? "Eintrag" : "Einträge"}</span></div>
          ${t5.e.map((e6) => {
      const [ic, farbe] = ART2[e6[2]] || ["•", "var(--ink2)"];
      return b2`<div class="vl-ereignis"><span class="zeit">${e6[1]}</span><span class="vl-punkt" style="background:${farbe}">${ic}</span><div>${e6[3] ? b2`<b>${p4.bName(e6[3])}</b> ` : A}<span class="leise">${e6[4]}</span></div></div>`;
    })}</div>`;
  }) : b2`<div class="glas-panel block"><div class="leer">${q || f3 !== "alle" ? "Nichts gefunden" : "Noch keine Einträge"}</div></div>`}`;
}
function verlaufVorlage(p4) {
  const reiter = p4.s.vlReiter || "bs", art = p4.s.vlArt || "karten", prot = reiter === "prot" && p4.d;
  const setze = (k2, v2) => {
    p4.s[k2] = v2;
    p4.neuZeichnen();
  };
  return b2`${kopfVorlage("Verlauf", prot ? p4.d.titel.toUpperCase() : "BAUSTELLEN")}
      <div class="vl-reiter"><div class="seg glas-panel">${[["bs", "Baustellen"], ["prot", "Protokoll"]].map(([k2, t5]) => b2`<button class=${reiter === k2 ? "on" : ""} data-vr=${k2} ?disabled=${k2 === "prot" && !p4.d} @click=${() => setze("vlReiter", k2)}>${t5}</button>`)}</div>
        ${prot ? A : b2`<div class="seg glas-panel klein">${[["karten", "▦ Karten"], ["tabelle", "☰ Vergleich"]].map(([k2, t5]) => b2`<button class=${art === k2 ? "on" : ""} data-va=${k2} @click=${() => setze("vlArt", k2)}>${t5}</button>`)}</div>`}</div>
      ${prot ? chronik(p4) : art === "tabelle" ? vergleich(p4) : archiv(p4)}`;
}
function bsdetailVorlage(p4) {
  const x2 = p4.alle.find((y3) => y3.entry === p4.s.bs), zurueck = b2`<button class="glas-panel chip" @click=${() => p4.gehe("verlauf")}>‹ Verlauf</button>`;
  if (!x2) return b2`<div class="zurueck-zeile">${zurueck}</div><div class="glas-panel block"><div class="leer">Baustelle nicht gefunden</div></div>`;
  const k2 = p4.kennz(x2), m3 = k2.monate && { labels: k2.monate.labels, reihen: k2.monate.reihen.map((r5, i7) => {
    const b3 = x2.bereiche.find((y3) => y3.id === r5.bereich);
    return { name: r5.name, v: r5.v, kwh: r5.kwh, eur: r5.eur, anteil: r5.anteil, farbe: BEREICH_FARBEN[(b3 && zahl(b3.f) ? b3.f : i7) % BEREICH_FARBEN.length] };
  }) };
  const eintraege = p4.bsProtokoll(x2);
  const ART2 = { einstellung: "⚙", warnung: "⚠", ok: "✓", schalten: "⏻", wetter: "☁", nachricht: "✉" };
  return b2`<div class="zurueck-zeile">${zurueck}<button class="glas-panel chip bs-csv" @click=${() => p4.csv()}>⇩ CSV</button></div>
      ${kopfVorlage(x2.titel, x2.aktiv ? "LAUFEND" : "ABGESCHLOSSEN · NUR ANSEHEN")}
      <div class="leise vgl">${k2.zeit}</div>
      <div class="glas-panel kennz vier"><div><b>${de(k2.kwh, 0)}</b><span>kWh</span></div><div><b>${de(k2.eur, 0)} €</b><span>Kosten</span></div><div><b>${k2.laedt ? "–" : k2.heiztage}</b><span>Heiztage</span></div><div><b>${zahl(k2.gespart) ? `${de(k2.gespart, 0)} €` : "–"}</b><span>gespart</span></div></div>
      <div class="glas-panel block"><div class="block-kopf"><b>Verbrauch je Monat</b><span class="leise">gestapelt nach Container</span></div>
        ${!m3 ? LAEDT : !m3.reihen.length ? b2`<div class="leer">Keine Container</div>` : b2`<div class="chart-wrap">${o5(flaeche("bs-" + x2.entry, m3.reihen, m3.labels, "kWh", 1))}</div>
        <div class="vb-je">${m3.reihen.map((q) => b2`<div><i style="background:${q.farbe}"></i><span class="n">${q.name}</span><b>${de(q.kwh, 0)} kWh</b><span>${de(q.eur, 0)} €</span><span class="leise">${de(q.anteil, 0)} %</span></div>`)}</div>`}</div>
      <div class="glas-panel block"><div class="block-kopf"><b>Protokoll</b><span class="leise">Auszug</span></div>
        ${eintraege === null ? LAEDT : eintraege.length ? eintraege.map((e6) => {
    const l4 = p4.lokal(e6[0], x2.z.zone);
    return b2`<div class="zeile ereignis"><span class="zeit">${kurzDatum(l4)}</span><span class="p-ic">${ART2[e6[1]] || "•"}</span><div><span>${e6[2] ? `${(x2.bereiche.find((b3) => b3.id === e6[2]) || { name: e6[2] }).name}: ` : ""}${e6[3]}</span></div></div>`;
  }) : b2`<div class="leer">Keine Einträge</div>`}</div>
      ${x2.aktiv ? A : b2`<button class="knopf leise-k bs-aktiv" @click=${() => p4.baustelleAktiv(x2.entry)}>Wieder aktiv setzen</button>`}`;
}

// src/ansichten/zeitraum.js
function kalender(p4, ziel2, z2, v2, max, k2) {
  const h3 = p4.z.HEUTE, mo0 = p4.z.WOCHE_ISO[0], ver = (iso) => zrVersatz(z2, iso, h3, mo0), setz = (x2) => () => p4.zrSetzen(ziel2, max, x2);
  const knopf9 = (iso, text2, cls2 = "") => {
    const x2 = ver(iso), an = x2 >= 0 && x2 <= max;
    return b2`<button class="zr-k ${cls2} ${x2 === v2 ? "on" : ""} ${x2 === 0 ? "jetzt" : ""}" data-v=${an ? x2 : A} ?disabled=${!an} @click=${an ? setz(x2) : null}>${text2}</button>`;
  };
  let kopf5, inhalt, cls, frueher = false, spaeter = false;
  if (z2 === "Tag" || z2 === "Woche") {
    const erster = `${k2.j}-${String(k2.m + 1).padStart(2, "0")}-01`, start = plusTage(erster, -(((/* @__PURE__ */ new Date(erster + "T12:00:00Z")).getUTCDay() + 6) % 7));
    const wochen = [];
    for (let w2 = start; w2.slice(0, 7) <= erster.slice(0, 7) && wochen.length < 6; w2 = plusTage(w2, 7)) wochen.push(w2);
    kopf5 = `${MONATE_LANG[k2.m]} ${k2.j}`;
    cls = "zr-kal-tage";
    inhalt = b2`<div class="zr-kw-kopf"><span>KW</span>${TAGE.map((x2) => b2`<span>${x2}</span>`)}</div>${wochen.map((mo) => {
      const tage = [...Array(7)].map((_2, n4) => plusTage(mo, n4)), fremd = (iso) => iso.slice(0, 7) !== erster.slice(0, 7) ? "fremd" : "";
      if (z2 === "Woche") {
        const x2 = ver(mo), an = x2 >= 0 && x2 <= max;
        return b2`<button class="zr-woche ${x2 === v2 ? "on" : ""} ${x2 === 0 ? "jetzt" : ""}" data-v=${an ? x2 : A} ?disabled=${!an} @click=${an ? setz(x2) : null}><b>${kwNr(mo)}</b>${tage.map((t5) => b2`<span class=${fremd(t5)}>${+t5.slice(8)}</span>`)}</button>`;
      }
      return b2`<div class="zr-woche-z"><b>${kwNr(mo)}</b>${tage.map((t5) => knopf9(t5, +t5.slice(8), fremd(t5)))}</div>`;
    })}`;
    frueher = ver(plusTage(erster, -1)) <= max;
    spaeter = ver(plusTage(wochen.at(-1), 7)) >= 0 && plusTage(erster, 31).slice(0, 7) <= h3.slice(0, 7);
  } else if (z2 === "Monat") {
    kopf5 = String(k2.j);
    cls = "zr-kal-monate";
    inhalt = MONATE.map((n4, m3) => knopf9(`${k2.j}-${String(m3 + 1).padStart(2, "0")}-01`, n4));
    frueher = ver(`${k2.j - 1}-12-01`) <= max;
    spaeter = k2.j < +h3.slice(0, 4);
  } else {
    const J0 = +h3.slice(0, 4), ab = J0 - Math.min(max, 11);
    kopf5 = ab === J0 ? String(J0) : `${ab}–${J0}`;
    cls = "zr-kal-monate";
    inhalt = [...Array(J0 - ab + 1)].map((_2, n4) => knopf9(`${ab + n4}-01-01`, ab + n4));
  }
  return b2`<div class="zr-kal glas-panel"><div class="zr-kal-kopf"><button class="zr-pf" ?disabled=${!frueher} aria-label="zurück" @click=${() => p4.zrKalBlaettern(-1)}>‹</button><b>${kopf5}</b>
        <button class="zr-pf" ?disabled=${!spaeter} aria-label="vor" @click=${() => p4.zrKalBlaettern(1)}>›</button></div>
      <div class=${cls}>${inhalt}</div>
      <div class="zr-kal-fuss"><button class="glas-panel chip" @click=${setz(0)}>${{ Tag: "Heute", Woche: "Diese Woche", Monat: "Dieser Monat", Jahr: "Dieses Jahr" }[z2]}</button></div></div>`;
}
function zeitraumVorlage(p4, ziel2, z2, grenze) {
  const v2 = p4.zrV(ziel2), max = p4.zrMax(z2, grenze), i7 = p4.zrInfo(z2, v2), k2 = p4.s.zrKal && p4.s.zrKal.ziel === ziel2 ? p4.s.zrKal : null;
  return b2`<div class="zr-zeile" data-ziel=${ziel2}><div class="zr-nav glas-panel"><button class="zr-pf" ?disabled=${v2 >= max} aria-label="früher" title="früher" @click=${() => p4.zrSchritt(ziel2, max, 1)}>‹</button>
        <button class="zr-mitte zr-auf" @click=${() => p4.zrKalAuf(ziel2)}><b>${i7.text}</b>${i7.unter ? b2`<small>${i7.unter}</small>` : A}<span class="zr-pfeil">${k2 ? "▴" : "▾"}</span></button>
        <button class="zr-pf" ?disabled=${v2 <= 0} aria-label="später" title="später" @click=${() => p4.zrSchritt(ziel2, max, -1)}>›</button></div>
      ${v2 ? b2`<button class="glas-panel chip zr-akt" @click=${() => p4.zrSetzen(ziel2, max, 0)}>Aktuell</button>` : A}${k2 ? kalender(p4, ziel2, z2, v2, max, k2) : A}</div>`;
}

// src/ansichten/pumpen.js
var LAEDT2 = b2`<div class="leer">Lädt …</div>`;
var CHARTS2 = [["pumpzeit", "Pumpzeit"], ["zyklen", "Zyklen"], ["verbrauch", "Verbrauch"]];
function pumpenVorlage(p4) {
  const d3 = p4.d, e6 = d3.e, P2 = d3.bereiche.filter((b3) => b3.pumpe), pc = p4.s.pchart || "pumpzeit", st = (k2, s4, fmt) => stepperVorlage(p4, k2, s4, fmt);
  const heuteNr = TAGE.indexOf(p4.z.HEUTE_TAG), pumpen2 = P2.flatMap((b3) => b3.geraete.filter((g2) => g2.rolle === "pumpe"));
  const W = d3.warnungen.filter((w2) => !w2.stumm && P2.some((b3) => b3.id === w2.b));
  const je = P2.map((b3) => ({ b: b3, h7: p4.heizStunden(d3, b3, "Woche"), z7: p4.zyklen(d3, b3, "Woche"), v7: p4.verbrauch(d3, b3.id, "Woche") }));
  const zyk = je.every((x2) => x2.z7) ? summe(je.map((x2) => x2.z7[heuteNr] || 0)) : null, lauf = je.every((x2) => x2.h7) ? summe(je.map((x2) => x2.h7[heuteNr] || 0)) : null;
  const chartWahl = (k2) => {
    p4.s.pchart = k2;
    p4.neuZeichnen();
  };
  return b2`${kopfVorlage("Pumpen", d3.titel)}
      <div class="glas-panel kennz">${[["Zyklen heute", zahl(zyk) ? zyk : "–"], ["Laufzeit heute", stdMin(lauf)], ["Pumpen an", `${pumpen2.filter((g2) => g2.an).length} von ${pumpen2.length}`]].map(([k2, v2]) => b2`<div><b>${v2}</b><span>${k2}</span></div>`)}</div>
      ${W.map((w2) => b2`<button class="glas-panel warn-zeile ${w2.stufe}" data-id=${w2.b} @click=${() => p4.gehe("container", w2.b)}><b>⚠ ${p4.bName(w2.b)}: ${w2.titel}</b><span class="leise">${p4.seitText(w2.seitIso)}${w2.hilfe ? ` · ${w2.hilfe}` : ""}</span></button>`)}
      ${je.map(({ b: b3, h7, z7, v7 }) => {
    const r5 = pc === "zyklen" ? z7 : pc === "verbrauch" ? v7 : h7;
    return b2`<div class="glas-panel block"><div class="block-kopf"><b>${b3.name}</b><button class="chip glas-panel" data-id=${b3.id} @click=${() => p4.containerOeffnen(b3.id)}>öffnen ›</button></div>
        <div class="p-schacht"><div class="p-illu">${o5(illu(b3))}</div><div>${b3.geraete.length ? b3.geraete.map((g2) => b2`<div class="zeile geraet"><span class="g-ic ${g2.an ? "an" : ""}">💧</span><div class="g-t"><b>${g2.n}</b><span class="leise">${!g2.erreichbar ? "offline" : g2.an ? `läuft${zahl(g2.kwJetzt) ? ` · ${de(g2.kwJetzt, 2)} kW` : ""}` : "aus"}</span></div></div>`) : b2`<div class="leise">Noch keine Pumpe</div>`}
          <div class="leise">heute ${z7 ? z7[heuteNr] : "–"} Zyklen · ${stdMin(h7 ? h7[heuteNr] : null)} gelaufen</div></div></div>
        <div class="seg">${CHARTS2.map(([k2, t5]) => b2`<button data-pc=${k2} class=${k2 === pc ? "on" : ""} @click=${() => chartWahl(k2)}>${t5}</button>`)}</div>
        <div class="chart-wrap">${r5 ? o5(balken(`p${pc}-${b3.id}`, r5, TAGE, pc === "zyklen" ? "Zyklen" : pc === "verbrauch" ? "kWh" : "h", pc === "zyklen" ? 0 : 1)) : LAEDT2}</div></div>`;
  })}
      <div class="glas-panel block"><div class="block-kopf"><b>Überwachung</b><span class="leise">wann eine Pumpe gemeldet wird</span></div>
        <div class="zeile"><div><b>Offline</b><div class="leise">Shelly antwortet nicht (Stromausfall?) – melden nach</div></div>${st("offline_min", 1, (v2) => `${de(v2, 0)} min`)}</div>
        <div class="zeile"><div><b>Trockenlauf</b><div class="leise">Pumpe läuft, zieht aber weniger als</div></div>${st("trocken_w", 5, (v2) => `${de(v2, 0)} W`)}</div>
        <div class="zeile"><div><b>Dauerlauf</b><div class="leise">läuft ohne Pause länger als</div></div>${st("dauer_min", 5, (v2) => `${v2} min`)}</div>
        <div class="zeile"><div><b>Schaltet oft</b><div class="leise">mehr Zyklen je Stunde als</div></div>${st("zyklen_h", 1, (v2) => `${v2}`)}</div>
        <button class="zeile" @click=${() => p4.einstGruppe("meldungen")}><span class="blau">Welche Meldungen aufs Handy gehen</span><span class="chev">Einstellungen ›</span></button>
        ${o5(erkl(e6.erklaer, "Pumpen werden nie geschaltet, nur überwacht. Ein Zyklus ist einmal an und wieder aus. Viele Zyklen je Stunde deuten auf einen hängenden Schwimmer oder steigendes Grundwasser, Trockenlauf auf einen leeren Schacht oder eine verstopfte Pumpe."))}</div>`;
}
function schachtVorlage(p4) {
  const d3 = p4.d, b3 = p4.b, { tabs, c: c4, chart, kennz, zr } = p4.containerLive(b3);
  const chartWahl = (k2) => {
    p4.s.chart = k2;
    p4.neuZeichnen();
  };
  return b2`<div class="zurueck-zeile"><button class="glas-panel chip" @click=${() => p4.gehe("uebersicht")}>‹ Übersicht</button>
        <button class="glas-panel chip" @click=${() => p4.einblenden("bereich")}>Bearbeiten</button></div>
      <div class="glas-panel c-held ${b3.z}" style="--c:${FARBE[b3.z]}">
        <div class="c-illu">${o5(illu(b3))}</div>
        <div class="c-text"><div class="glas-klein">PUMPENSCHACHT</div><div class="glas-titel">${b3.name}</div>
          <div class="c-wert">${o5(wertHtml(b3))}</div><div class="glas-status"><span class="glas-dot"></span>${TEXT(b3)}</div>
          <div class="c-kw">⚡ ${de(kwVon(b3))} kW jetzt</div></div>
      </div>
      <button class="glas-panel kennz kennz-knopf c-live-kennz" @click=${() => p4.einblenden("verbrauch", { id: b3.id })}>${kennz.map(([k2, v2]) => b2`<div><b>${v2}</b><span>${k2}</span></div>`)}<span class="kennz-mehr">Verbrauch ›</span></button>
      <div class="glas-panel block c-live"><div class="seg">${tabs.map(([k2, t5]) => b2`<button data-c=${k2} class=${k2 === c4 ? "on" : ""} @click=${() => chartWahl(k2)}>${t5}</button>`)}</div>
        ${zeitraumVorlage(p4, ...zr)}<div class="chart-wrap">${o5(chart)}</div></div>
      <div class="glas-panel liste">
        ${b3.tuer ? b2`<div class="zeile"><div><b>🚪 ${b3.tuer.sensor}</b><div class="leise">${b3.tuer.offen ? `offen seit ${b3.tuer.offen} min – Heizung pausiert nach ${d3.e.tuer_pause} min, Meldung nach ${d3.e.tuer_melden} min` : "zu"}</div></div><span class="tuer-z ${b3.tuer.offen ? "offen" : ""}">${b3.tuer.offen ? "offen" : "zu"}</span></div>` : A}
        <div class="zeile"><span>♨ Automatik für diesen Schacht</span>${schalterVorlage(b3.auto, () => p4.bereichAuto(b3))}</div>
      </div>
      <div class="glas-panel block"><div class="block-kopf"><b>Pumpen</b><span class="leise">Schalten = Handbetrieb bis zum nächsten Schaltpunkt</span></div>
        ${b3.geraete.length ? A : b2`<div class="leise">Noch kein Gerät</div>`}
        ${b3.geraete.map((g2, i7) => b2`<div class="zeile geraet" data-i=${i7}><span class="g-ic ${g2.an ? "an" : ""}">${g2.typ === "Pumpe" ? "💧" : g2.typ === "Steckdose" || g2.typ === "Bautrockner" ? "⏻" : "♨"}</span>
          <div class="g-t"><b>${g2.n}</b><span class="leise">${g2.typ} · ${de(g2.kw, 2)} kW${g2.hand ? b2` · <em class="hand">Hand</em>` : A}${g2.warte ? b2` · <em class="warte">wartet – ${(WARTE[g2.warte.grund] || WARTE.anschluss_voll)(p4.anschluss(b3.anschluss).name)}${zahl(g2.warte.dran_in_min) ? `, dran in ${g2.warte.dran_in_min} min` : ""}</em>` : A}</span></div>
          ${b3.offline || !g2.erreichbar ? b2`<span class="leise rot-t">offline</span>` : schalterVorlage(g2.an, () => p4.geraetSchalten(b3, i7))}</div>`)}
        <button class="zeile" @click=${() => p4.einblenden("bereich")}><span class="blau">Geräte bearbeiten</span><span class="chev">›</span></button></div>
      <div class="glas-panel liste"><div class="zeile"><span>Trockenlauf (unter ${de(d3.e.trocken_w, 0)} W beim Laufen)</span><span class="ok">${d3.e.m_trocken ? "● überwacht" : "○ aus"}</span></div>
        <div class="zeile"><span>Dauerlauf über ${d3.e.dauer_min} min</span><span class="ok">${d3.e.m_dauer ? "● überwacht" : "○ aus"}</span></div>
        <div class="zeile"><span>Stromausfall / offline (nach ${de(d3.e.offline_min, 0)} min)</span><span class="ok">${d3.e.m_offline ? "● überwacht" : "○ aus"}</span></div>
        <button class="zeile" @click=${() => p4.gehe("pumpen")}><span class="blau">Schwellen im Reiter Pumpen</span><span class="chev">›</span></button></div>`;
}

// src/ansichten/inventar.js
var GRIFF = b2`<div class="griff"></div>`;
var knopf = (t5, fn, art = "", k2 = "") => b2`<button class="knopf ${art}" data-k=${k2 || A} @click=${fn}>${t5}</button>`;
var IC = { PLUG: "🔌", HZ: "♨", TEMP: "🌡", DOOR: "🚪", FEN: "🪟", PUMP: "💧", BTR: "💨" };
var ST_TEXT = { aktiv: "● aktiv", inaktiv: "○ inaktiv", verliehen: "↗ verliehen", defekt: "✕ defekt" };
var ST_WEITER = { aktiv: "inaktiv", inaktiv: "verliehen", verliehen: "defekt", defekt: "aktiv" };
var HAENGT = [["konvektor", "Konvektor"], ["radiator", "Radiator"], ["bautrockner", "Bautrockner"], ["nichts", "nichts"]];
var FILTER = [["alle", "Alle"], ["eigen", "Eigen"], ["fremd", "Fremd"], ["ausgeschieden", "Ausgeschieden"]];
var datum2 = (iso) => iso ? new Date(iso).toLocaleDateString("de-AT", { day: "2-digit", month: "2-digit", year: "numeric" }) : "";
function ort(p4, e6) {
  if (!e6) return "";
  const b3 = (p4.roh || []).find((x2) => x2.baustelle && x2.baustelle.entry_id === e6.baustelle_id), bs = b3 ? b3.baustelle.titel : "andere Baustelle";
  const ber = b3 && e6.bereich_id ? (b3.bereiche || []).find((x2) => x2.id === e6.bereich_id) : null;
  return bs + (ber ? " › " + ber.name : "");
}
var sichtbar = (I2, f3) => I2.container.filter((c4) => f3 === "ausgeschieden" ? c4.status === "ausgeschieden" : c4.status === "aktiv" && (f3 === "alle" || f3 === (c4.eigen ? "eigen" : "fremd")));
var statusChip = (p4, a3) => b2`<button class="inv-st ${a3.status} nur-admin" title="Status ändern (aktiv → inaktiv → verliehen → defekt)"
    @click=${p4.nurAdmin(() => p4.invSenden({ aktion: "ausruestung_status", ausruestung_id: a3.id, status: ST_WEITER[a3.status] || "aktiv" }, `Status: ${ST_WEITER[a3.status] || "aktiv"}`))}>${ST_TEXT[a3.status] || a3.status}</button>`;
function invGruppeVorlage(p4) {
  const I2 = p4.invDaten(), C2 = I2 ? sichtbar(I2, "alle") : [];
  const kurz = I2 === void 0 ? "lädt …" : !I2 ? "Datenbank nicht erreichbar" : `${C2.length} Container · ${C2.filter((c4) => !c4.eigen).length} fremd · ${C2.reduce((s4, c4) => s4 + c4.ausruestung.length, 0)} Geräte`;
  return { k: "inventar", ic: "📦", t: "Inventar", kurz, inhalt: () => invInhalt(p4, I2) };
}
function invInhalt(p4, I2) {
  if (I2 === void 0) return b2`<div class="glas-panel liste inv-liste"><div class="leer">Inventar lädt …</div></div>`;
  if (!I2) return b2`<div class="glas-panel liste inv-liste"><div class="leer">${p4.invFehler() || "Das Inventar braucht die Datenbank – sie ist gerade nicht erreichbar."}</div></div>`;
  const f3 = p4.s.invFilter || "alle", C2 = sichtbar(I2, f3), hier = I2.bereiche_ohne.filter((b3) => b3.baustelle_id === p4.d.entry);
  const zeile3 = (c4) => b2`<button class="zeile inv-c" data-id=${c4.id} @click=${() => p4.invAuf({ art: "inv-container", id: c4.id })}><div class="inv-c-t"><b class="inv-id">${c4.name}</b>${c4.eigen ? A : b2`<span class="badge">fremd${(I2.firmen.find((x2) => x2.kuerzel === c4.firma_kuerzel) || {}).name ? " · " + I2.firmen.find((x2) => x2.kuerzel === c4.firma_kuerzel).name : ""}</span>`}
      <div class="leise">${c4.art_label} · ${c4.status === "aktiv" ? ort(p4, c4.einsatz) || "ohne Einsatz" : "ausgeschieden"}</div></div>
      <span class="leise inv-zahl">${c4.nicht_in_ha ? b2`<span class="amber-t">${c4.nicht_in_ha} nicht in HA</span> · ` : A}${c4.ausruestung.length} ${c4.ausruestung.length === 1 ? "Gerät" : "Geräte"}</span><span class="chev">›</span></button>`;
  return b2`<div class="seg glas-panel inv-filter">${FILTER.map(([k2, t5]) => b2`<button data-v=${k2} class=${f3 === k2 ? "on" : ""} @click=${() => {
    p4.s.invFilter = k2;
    p4.neuZeichnen();
  }}>${t5} <span class="leise">${sichtbar(I2, k2).length}</span></button>`)}</div>
    <div class="glas-panel liste inv-liste"><div class="gruppe">${FILTER.find((x2) => x2[0] === f3)[1]} · ${C2.length}</div>${C2.length ? C2.map(zeile3) : b2`<div class="leer">Keine Container</div>`}
      ${f3 !== "ausgeschieden" ? b2`<button class="zeile nur-admin" data-k="neu" @click=${p4.nurAdmin(() => p4.invAuf({ art: "inv-neu", form: { eigen: true, art: "MAN" } }))}><span class="blau">+ Container anlegen</span></button>` : A}</div>
    ${hier.length && f3 !== "ausgeschieden" ? b2`<div class="glas-panel liste inv-liste"><div class="gruppe">Noch nicht im Inventar · ${p4.d.titel}</div>
      ${hier.map((b3) => b2`<button class="zeile nur-admin inv-bestand" data-id=${b3.id} @click=${p4.nurAdmin(() => p4.invAuf({ art: "inv-neu", form: { eigen: true, art: "MAN", bereich_id: b3.id, nr: "" } }))}><div><b>${b3.name}</b><div class="leise">Container der Baustelle – mit Shellys, Fühler und Tür übernehmen</div></div><span class="leise">übernehmen ›</span></button>`)}</div>` : A}
    ${I2.ausruestung_frei.length && f3 !== "ausgeschieden" ? b2`<div class="glas-panel liste inv-liste"><div class="gruppe">Ausrüstung ohne Container · ${I2.ausruestung_frei.length}</div>
      ${I2.ausruestung_frei.map((a3) => b2`<div class="zeile"><div><b>${IC[a3.typ] || ""} ${a3.typ_label}</b><div class="leise">${a3.modell || ""}</div></div>${statusChip(p4, a3)}</div>`)}</div>` : A}
    <div class="leise p-fuss">Nummern eigener Container gelten für die ganze Firma und werden nie neu vergeben. Fremdcontainer heißen nach Firmenkürzel und Nummer je Baustelle; verlassen sie die Baustelle, scheiden sie aus – ihre Daten bleiben bei der Baustelle.</div>`;
}
function containerSheet(p4, s4) {
  const I2 = p4.invDaten(), c4 = I2 && I2.container.find((x2) => x2.id === s4.id);
  if (!c4) return b2`${GRIFF}<div class="leer">${I2 === void 0 ? "lädt …" : "Container nicht gefunden"}</div>${knopf("Schließen", () => p4.schliessen(), "leise-k")}`;
  const aktiv = c4.status === "aktiv", firma2 = I2.firmen.find((x2) => x2.kuerzel === c4.firma_kuerzel);
  const zeileA = (a3) => b2`<div class="zeile"><div class="inv-g"><b class="inv-id">${a3.name || a3.typ_label}</b>${a3.nicht_in_ha ? b2` <span class="amber-t inv-fremd" title="Steht im Inventar, Home Assistant ordnet es diesem Container aber nicht zu – ✕ nimmt es heraus">nicht in HA</span>` : A}<div class="leise">${IC[a3.typ] || ""} ${a3.modell || ""} · ${a3.typ_label}${a3.gg ? " · GG " + String(a3.gg).padStart(2, "0") : ""}</div></div>
      ${statusChip(p4, a3)}${aktiv ? b2`<button class="inv-x nur-admin" title="Aus dem Container nehmen (wird frei)" @click=${p4.nurAdmin(() => p4.invSenden({ aktion: "ausruestung_entfernen", ausruestung_id: a3.id }, "Aus dem Container genommen"))}>✕</button>` : A}</div>`;
  return b2`${GRIFF}<div class="block-kopf"><h3 class="inv-id inv-gross">${c4.name}</h3></div>
    <div class="leise inv-unterzeile">${c4.art_label} · ${c4.eigen ? "eigener Container · Nr. " + String(c4.nr).padStart(3, "0") : `Fremdcontainer · ${firma2 ? firma2.name : ""} (${c4.firma_kuerzel})`}${aktiv ? "" : " · ausgeschieden"}</div>
    <div class="glas-panel liste inv-liste"><div class="gruppe">Einsatz</div><div class="zeile"><span>${aktiv ? ort(p4, c4.einsatz) || "ohne Einsatz" : "keiner"}</span><span class="leise">${c4.einsatz ? "seit " + datum2(c4.einsatz.von) : ""}</span></div>
      <div class="zeile"><span>Labels</span><span class="leise">${c4.labels.join(", ")}</span></div></div>
    <div class="glas-panel liste inv-liste"><div class="gruppe">Ausrüstung · ${c4.ausruestung.length}${c4.nicht_in_ha ? b2` · <span class="amber-t">${c4.nicht_in_ha} nicht in HA</span>` : A}</div>${c4.ausruestung.length ? c4.ausruestung.map(zeileA) : b2`<div class="leer">Noch keine Ausrüstung</div>`}
      ${aktiv ? b2`<button class="zeile nur-admin" data-k="zuordnen-auf" @click=${p4.nurAdmin(() => p4.invAuf({ art: "inv-zuordnen", id: c4.id, haengt: "konvektor" }))}><span class="blau">+ Gerät zuordnen</span></button>` : A}</div>
    <div class="glas-panel liste inv-liste"><div class="gruppe">Geschichte</div>${c4.geschichte.slice().reverse().map((e6) => b2`<div class="zeile"><span>${ort(p4, e6)}</span><span class="leise">${e6.bis ? datum2(e6.von) + " – " + datum2(e6.bis) : "seit " + datum2(e6.von)}</span></div>`)}</div>
    ${aktiv && c4.einsatz && c4.einsatz.bereich_id ? b2`${knopf("Namen prüfen", () => p4.invAuf({ art: "inv-vorschau", id: c4.id }), "amber", "pruefen")}${knopf("Rückgängig …", p4.nurAdmin(() => p4.invAuf({ art: "inv-vorschau", id: c4.id, rueck: true })), "nur-admin", "rueck")}` : A}
    ${aktiv ? s4.sicher ? knopf(`${c4.name} wirklich ausscheiden`, p4.nurAdmin(() => p4.invSenden({ aktion: "container_status", container_id: c4.id, status: "ausgeschieden" }, "Ausgeschieden", true)), "rot nur-admin", "ausscheiden") : knopf("Ausscheiden …", p4.nurAdmin(() => {
    s4.sicher = true;
    p4.neuZeichnen();
  }), "leise-k nur-admin", "ausscheiden") : A}
    ${knopf("Schließen", () => p4.schliessen(), "leise-k")}`;
}
function anlegenSheet(p4, s4) {
  const I2 = p4.invDaten(), f3 = s4.form, z2 = () => p4.neuZeichnen();
  if (!I2) return b2`${GRIFF}<div class="leer">lädt …</div>`;
  const firmen2 = I2.firmen.filter((x2) => x2.baustelle_id === p4.d.entry && !x2.eigen), fi = firmen2.find((x2) => x2.id === f3.firma_id);
  const hier = I2.bereiche_ohne.filter((b3) => b3.baustelle_id === p4.d.entry);
  return b2`${GRIFF}<h3>Container anlegen</h3><div class="leise inv-unterzeile">auf ${p4.d.titel} · Name und Nummer vergibt die Integration</div>
    <div class="seg klein inv-seg">${[[true, "Eigener"], [false, "Fremdcontainer"]].map(([w2, t5]) => b2`<button class=${f3.eigen === w2 ? "on" : ""} @click=${() => {
    f3.eigen = w2;
    z2();
  }}>${t5}</button>`)}</div>
    <div class="feld">Art<div class="inv-arten">${Object.entries(I2.arten).map(([k2, t5]) => b2`<button class="inv-art ${f3.art === k2 ? "on" : ""}" data-v=${k2} @click=${() => {
    f3.art = k2;
    z2();
  }}><b>${k2}</b><span>${t5}</span></button>`)}</div></div>
    ${f3.eigen ? b2`<div class="zeile inv-feldzeile"><div><b>Nummer</b><div class="leise">${f3.bereich_id ? "Bestand: bisherige Nummer behalten (frei lassen = nächste freie)" : "nächste freie für die ganze Firma – nie doppelt"}</div></div>
        ${f3.bereich_id ? b2`<input class="inv-nr" type="number" min="1" max="999" placeholder=${String(I2.naechste_nr).padStart(3, "0")} .value=${f3.nr || ""} @input=${(e6) => {
    f3.nr = e6.target.value;
  }}>` : b2`<b class="inv-id inv-riesig">${String(I2.naechste_nr).padStart(3, "0")}</b>`}</div>` : b2`<label class="feld">Firma<select @change=${(e6) => {
    f3.firma_id = e6.target.value;
    z2();
  }}><option value="">– wählen –</option>${firmen2.map((x2) => b2`<option value=${x2.id} ?selected=${x2.id === f3.firma_id}>${x2.name}${x2.kuerzel ? ` (${x2.kuerzel})` : ""}</option>`)}</select></label>
        ${fi && !fi.kuerzel ? b2`<label class="feld">Firmenkürzel (2–5 Buchstaben)<input .value=${f3.kuerzel || ""} @input=${(e6) => {
    f3.kuerzel = e6.target.value;
  }}></label>` : A}
        ${firmen2.length ? A : b2`<div class="leise inv-p">Zuerst die Firma unter Einstellungen › Firmen anlegen</div>`}`}
    <label class="feld">Bereich der Baustelle<select @change=${(e6) => {
    f3.bereich_id = e6.target.value || null;
    z2();
  }}><option value="">– keiner (nur Inventar) –</option>${hier.map((b3) => b2`<option value=${b3.id} ?selected=${b3.id === f3.bereich_id}>${b3.name}</option>`)}</select></label>
    ${knopf(f3.bereich_id ? "Anlegen und Namen prüfen" : "Anlegen", p4.nurAdmin(() => p4.invAnlegen(f3, fi)), "amber nur-admin", "anlegen")}${knopf("Abbrechen", () => p4.schliessen(), "leise-k")}`;
}
function zuordnenSheet(p4, s4) {
  const I2 = p4.invDaten(), c4 = I2 && I2.container.find((x2) => x2.id === s4.id), K = p4.invKandidaten(), z2 = () => p4.neuZeichnen();
  if (!c4) return b2`${GRIFF}<div class="leer">lädt …</div>`;
  const wahl2 = K && K.find((k2) => k2.device_id === s4.wahl);
  return b2`${GRIFF}<h3>Gerät zuordnen</h3><div class="leise inv-unterzeile">zu <span class="inv-id">${c4.name}</span> · ${ort(p4, c4.einsatz)}</div>
    <div class="glas-panel liste inv-liste"><div class="gruppe">Geräte in Home Assistant</div>
      ${K === void 0 ? b2`<div class="leer">lädt …</div>` : !K || !K.length ? b2`<div class="leer">Keine freien Geräte</div>` : K.map((k2) => b2`<button class="zeile" data-id=${k2.device_id} @click=${() => {
    if (k2.status === "defekt") return;
    s4.wahl = k2.device_id;
    z2();
  }}><div><b>${IC[k2.typ] || ""} ${k2.name}</b><div class="leise">${k2.modell || ""}${k2.status === "defekt" ? " · defekt – nicht zuordenbar" : ""}${k2.verwendet ? " · heute in " + k2.verwendet : ""}</div></div><span class=${s4.wahl === k2.device_id ? "blau" : "leise"}>${k2.status === "defekt" ? "–" : s4.wahl === k2.device_id ? "✓" : "○"}</span></button>`)}
      <div class="zeile"><span class="leise">Neue Shellys und Fühler erscheinen hier, sobald Home Assistant sie kennt</span></div></div>
    ${wahl2 && wahl2.typ === "PLUG" ? b2`<div class="feld">Was hängt an diesem Plug?<div class="seg klein inv-seg">${HAENGT.map(([k2, t5]) => b2`<button class=${s4.haengt === k2 ? "on" : ""} data-v=${k2} @click=${() => {
    s4.haengt = k2;
    z2();
  }}>${t5}</button>`)}</div></div>` : A}
    ${knopf("Zuordnen und Namen prüfen", p4.nurAdmin(() => p4.invZuordnen(c4, s4)), "amber nur-admin", "zuordnen")}${knopf("Abbrechen", () => p4.invAuf({ art: "inv-container", id: c4.id }), "leise-k")}`;
}
var MARKE = {
  gleich: b2`<span class="inv-m leise">= unverändert</span>`,
  neu: b2`<span class="inv-m gruen-t">+ neu</span>`,
  aendern: b2`<span class="inv-m leise">ändern</span>`,
  konflikt: b2`<span class="inv-m rot-t">✕ Konflikt</span>`,
  ok: b2`<span class="inv-m gruen-t">✓ erledigt</span>`,
  fehler: b2`<span class="inv-m amber-t">◐ offen</span>`,
  entfaellt: b2`<span class="inv-m leise">– entfällt</span>`,
  weg: b2`<span class="inv-m rot-t">− entfernen</span>`
};
var wert = (w2) => w2 === null || w2 === void 0 || w2 === "" ? b2`<span class="leise">–</span>` : b2`<span class="inv-w ${/^[a-z_]+\.[a-z0-9_]+$/.test(w2) ? "inv-id" : ""}">${w2}</span>`;
function zustand(r5) {
  if (r5.ergebnis && r5.ergebnis !== "gleich") return r5.ergebnis;
  if (r5.ziel === "label" && !r5.neu) return r5.zustand === "gleich" ? "gleich" : "weg";
  return r5.zustand;
}
function vorschauSheet(p4, s4) {
  const I2 = p4.invDaten(), c4 = I2 && I2.container.find((x2) => x2.id === s4.id), rueck = !!s4.rueck, erg = s4.ergebnis;
  const V2 = erg ? erg : rueck ? p4.invRueckVorschau(s4.id) : p4.invVorschau(s4.id);
  const halb = erg && (erg.status === "teilweise" || erg.status === "zurueck_teilweise");
  const titel2 = erg ? rueck ? halb ? "Teilweise zurückgenommen" : "Zurückgenommen" : halb ? "Teilweise erledigt" : "Erledigt" : rueck ? "Umbenennung zurücknehmen" : "Namen prüfen";
  const kopf5 = b2`${GRIFF}<div class="block-kopf"><h3>${titel2}</h3></div><div class="leise inv-unterzeile"><span class="inv-id">${c4 ? c4.name : ""}</span> · ${rueck ? "neu → alt, in umgekehrter Reihenfolge" : "alt → neu, gruppiert nach Gerät"}</div>`;
  if (V2 === void 0) return b2`${kopf5}<div class="glas-panel liste inv-liste"><div class="leer">Vorschau lädt …</div></div>${knopf("Schließen", () => p4.schliessen(), "leise-k")}`;
  if (!V2) return b2`${kopf5}<div class="glas-panel liste inv-liste"><div class="leer">${p4.invFehler(rueck ? "invr:" + s4.id : "invv:" + s4.id) || "Keine Vorschau"}</div></div>${knopf("Schließen", () => p4.schliessen(), "leise-k")}`;
  const S3 = V2.schritte || [], offen = S3.filter((r5) => !["gleich", "ok", "entfaellt"].includes(zustand(r5)));
  const kon = Object.keys(V2.konflikte || {}).length, gruppen2 = [...new Set(S3.map((r5) => r5.gruppe || ""))];
  const zahlen = b2`<div class="inv-zahlen"><span class="chip glas-panel">${rueck ? "↶" : "✎"} ${offen.length} ${rueck ? "Schritte zurück" : offen.length === 1 ? "Änderung" : "Änderungen"}</span>
    ${S3.length - offen.length ? b2`<span class="chip glas-panel">= ${S3.length - offen.length} ${erg ? "erledigt oder gleich" : "unverändert"}</span>` : A}${kon ? b2`<span class="chip glas-panel rot-t">✕ ${kon} Konflikt</span>` : A}</div>`;
  const verweise = (V2.verweise || []).length ? b2`<div class="glas-panel liste inv-liste inv-warn"><div class="zeile"><div><b class="amber-t">⚠ ${V2.verweise.length} ${V2.verweise.length === 1 ? "Eintrag nennt" : "Einträge nennen"} alte Entity-IDs</b><div class="leise">Home Assistant passt eigene Automationen, Skripte und Dashboards nicht an – danach dort die neue ID eintragen. Verlauf und Statistik ziehen mit.</div></div></div>
    ${V2.verweise.map((v2) => b2`<div class="zeile"><div class="inv-g"><b>${v2.name}</b><div class="leise">${v2.art} · <span class="inv-id">${v2.alt}</span> → <span class="inv-id">${v2.neu}</span></div></div></div>`)}</div>` : A;
  const tabelle = gruppen2.map((g2) => {
    const R2 = S3.filter((r5) => (r5.gruppe || "") === g2);
    return b2`<div class="glas-panel liste inv-liste inv-gruppe"><div class="inv-g-kopf"><b class="inv-id">${g2 || "–"}</b></div>
      <div class="inv-tr inv-th"><span class="t-was">Was</span><span class="t-alt">Alt</span><span class="t-neu">Neu</span><span class="t-m">Zustand</span></div>
      ${R2.map((r5) => {
      const st = zustand(r5);
      return b2`<div class="inv-tr ${st}"><span class="t-was">${r5.was}</span><span class="t-alt">${wert(r5.alt)}</span><span class="t-neu">${st === "gleich" ? b2`<span class="leise">=</span>` : wert(r5.neu)}</span><span class="t-m">${MARKE[st] || st}</span>
        ${r5.fehler ? b2`<span class="inv-hinweis amber-t">${r5.fehler}</span>` : st === "konflikt" ? b2`<span class="inv-hinweis rot-t">${r5.neu} ist schon vergeben – Schritt bleibt aus, bis sie umbenannt oder gelöscht ist</span>` : A}</div>`;
    })}</div>`;
  });
  let ende;
  if (erg) ende = b2`${halb ? b2`<div class="leise amber-t inv-p">${rueck ? "Nochmal „Zurücknehmen“ holt den Rest nach." : "Fehlende Schritte holt „Nachholen“ – Plug-Namen auch die Integration selbst, sobald der Plug erreichbar ist."}</div>
      ${knopf(rueck ? "Rest zurücknehmen" : "Nachholen", p4.nurAdmin(() => p4.invAusfuehren(s4)), "amber nur-admin", "ausfuehren")}` : A}${knopf("Schließen", () => p4.invAuf({ art: "inv-container", id: s4.id }), "leise-k")}`;
  else ende = b2`${knopf(rueck ? "Zurücknehmen" : offen.length ? `Übernehmen (${offen.length})` : "Alles nach Schema", p4.nurAdmin(() => kon || !offen.length ? p4.toast(kon ? "Erst den Konflikt lösen" : "Nichts zu tun") : p4.invAusfuehren(s4)), `amber nur-admin ${kon || !offen.length ? "aus" : ""}`, "ausfuehren")}
    ${!rueck ? knopf("Rückgängig …", p4.nurAdmin(() => p4.invAuf({ art: "inv-vorschau", id: s4.id, rueck: true })), "nur-admin", "rueck") : A}
    <div class="leise inv-p">nur Admins · das Schalten des Containers pausiert dafür kurz, die Automatik bleibt an${rueck ? " · nur die jüngste Umbenennung des Containers" : " · Verweise der Integration (Schalter, Leistung, Energie, Fühler, Tür) ziehen mit, der Bereich bleibt"}</div>
    ${knopf("Abbrechen", () => p4.invAuf({ art: "inv-container", id: s4.id }), "leise-k")}`;
  return b2`${kopf5}${zahlen}${verweise}<div class="inv-inhalt">${tabelle}</div>${!erg && V2.hinweis ? b2`<div class="leise inv-p">${V2.hinweis}</div>` : A}${ende}`;
}
var INVENTAR_EINBLENDUNGEN = { "inv-container": containerSheet, "inv-neu": anlegenSheet, "inv-zuordnen": zuordnenSheet, "inv-vorschau": vorschauSheet };
var INV_BREIT = ["inv-vorschau"];
var INV_CSS = `
.inv-id { font-family: ui-monospace, "SF Mono", Menlo, Consolas, monospace; font-size: 13px; letter-spacing: .2px; overflow-wrap: anywhere; }
.inv-gross { font-size: 20px; } .inv-riesig { font-size: 18px; font-weight: 600; color: var(--ink); }
.inv-unterzeile { padding: 0 4px 6px; } .inv-p { padding: 6px 4px; }
.inv-filter .leise { font-size: 11px; } .inv-filter button { flex: 1 1 auto; min-width: 0; padding: 7px 4px; }
.inv-c { text-align: left; } .inv-c-t { flex: 1; min-width: 0; } .inv-c .badge { margin-left: 6px; } .inv-zahl { white-space: nowrap; }
.inv-g { min-width: 0; flex: 1; }
.inv-st { font-size: 12px; padding: 3px 10px !important; border-radius: 12px !important; white-space: nowrap; background: rgba(120,120,128,.18) !important; flex: none; }
.inv-st.aktiv { color: #30d158; } .inv-st.inaktiv { color: var(--leise, #8e8e93); } .inv-st.verliehen { color: var(--blau); } .inv-st.defekt { color: var(--rot); }
.inv-x { flex: none; padding: 3px 8px !important; color: var(--ink2) !important; background: none !important; }
.inv-arten { display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px; }
.inv-art { display: flex; flex-direction: column; align-items: center; gap: 1px; padding: 7px 4px !important; border-radius: 12px !important; background: rgba(120,120,128,.18) !important; color: var(--ink) !important; text-align: center !important; }
.inv-art span { font-size: 11px; color: var(--ink2); } .inv-art.on { outline: 2px solid var(--amber); }
.inv-seg button { flex: 1; } .inv-feldzeile { align-items: center; } .inv-nr { width: 80px; text-align: right; }
.inv-zahlen { display: flex; flex-wrap: wrap; gap: 6px; }
.inv-liste .zeile { padding: 8px 16px; } .inv-warn .zeile { align-items: flex-start; }
.inv-g-kopf { padding: 8px 14px 4px; }
.inv-tr { display: grid; grid-template-columns: minmax(90px, 1.1fr) 1.6fr 1.6fr minmax(84px, .8fr); gap: 8px; padding: 6px 14px; font-size: 13px; align-items: start; border-top: 1px solid rgba(120,120,128,.15); }
.inv-th { color: var(--ink2); font-size: 11px; text-transform: uppercase; letter-spacing: .4px; border-top: none; }
.inv-tr .inv-w { overflow-wrap: anywhere; min-width: 0; } .inv-tr > span { min-width: 0; }
.inv-tr.gleich { opacity: .55; } .inv-tr.konflikt { background: rgba(255,69,58,.08); }
.inv-hinweis { grid-column: 1 / -1; font-size: 12px; }
.inv-m { white-space: nowrap; font-size: 12px; }
.knopf.aus { opacity: .5; }
@container (max-width: 520px) {
  .inv-tr { grid-template-columns: 1fr 1fr; } .inv-tr .t-was { grid-column: 1 / -1; color: var(--ink2); font-size: 12px; } .inv-th { display: none; }
  .inv-arten { grid-template-columns: repeat(2, 1fr); }
}
@container (min-width: 700px) { .sheet.breit { width: min(900px, calc(100% - 48px)); max-height: 88%; } }
`;

// src/ansichten/geraete.js
var GRIFF2 = b2`<div class="griff"></div>`;
var IC2 = { heizung: "♨", trockner: "💨", pumpe: "💧", steckdose: "🔌", fuehler: "🌡", tuer: "🚪", fenster: "🪟", licht: "💡" };
var ST_TEXT2 = { inaktiv: "inaktiv", verliehen: "verliehen", defekt: "defekt" };
var FILTER2 = [["alle", "Alle"], ["schalt", "Schaltgeräte"], ["sensor", "Sensoren"], ["probleme", "Probleme"]];
var leer = (s4) => !s4 || s4.state === "unavailable" || s4.state === "unknown";
function geraeteZeilen(p4) {
  const d3 = p4.d, L2 = d3.r && d3.r.geraete_links || {}, st = (eid) => eid && p4._hass && p4._hass.states[eid];
  const zahlVon = (eid) => {
    const s4 = st(eid);
    return s4 && zahl(s4.state) ? Number(s4.state) : null;
  };
  const aus = [];
  for (const b3 of d3.bereiche) {
    for (const g2 of b3.geraete) {
      const l4 = L2[g2.schalter] || {};
      aus.push({
        art: "schalt",
        id: g2.id,
        b: b3,
        g: g2,
        ic: IC2[g2.rolle] || (g2.heizer ? "♨" : "🔌"),
        name: g2.n,
        unter: g2.typ,
        eid: g2.schalter,
        np: g2.np,
        zustand: !g2.erreichbar ? "nicht erreichbar" : g2.an ? `an · ${de(zahl(g2.kwJetzt) ? g2.kwJetzt : g2.kw, 2)} kW` : "aus",
        weg: !g2.erreichbar,
        status: g2.status || "aktiv",
        bat: null,
        sig: zahlVon(l4.signal),
        w: d3.warnungen.filter((w2) => w2.g === g2.id)
      });
    }
    for (const s4 of b3.sensoren || []) {
      const l4 = L2[s4.entity_id] || {}, z2 = st(s4.entity_id), e6 = z2 && z2.attributes && z2.attributes.unit_of_measurement || "";
      aus.push({
        art: "sensor",
        id: s4.entity_id,
        b: b3,
        s: s4,
        ic: IC2[s4.art] || "•",
        name: s4.name,
        unter: p4.name(s4.entity_id) || s4.entity_id,
        eid: s4.entity_id,
        zustand: leer(z2) ? "meldet nichts" : s4.art === "tuer" || s4.art === "fenster" ? z2.state === "on" ? "offen" : "zu" : s4.art === "licht" && (z2.state === "on" || z2.state === "off") ? z2.state === "on" ? "an" : "aus" : zahl(z2.state) ? `${de(+z2.state)} ${e6}`.trim() : z2.state,
        weg: leer(z2),
        status: "aktiv",
        bat: zahl(s4.batterie) ? Number(s4.batterie) : null,
        sig: zahlVon(l4.signal),
        w: d3.warnungen.filter((w2) => w2.key && w2.key.endsWith(":" + s4.entity_id))
      });
    }
  }
  return aus;
}
var zaehlen = (X) => ({
  n: X.length,
  weg: X.filter((x2) => x2.weg).length,
  warn: X.filter((x2) => x2.w.length).length,
  bat: X.filter((x2) => x2.w.some((w2) => /Batterie/.test(w2.titel))).length,
  nicht: X.filter((x2) => x2.status !== "aktiv").length
});
var batterie = (b3) => b3 === null ? A : b2`<span class=${b3 < 10 ? "rot-t" : b3 < BATTERIE_SCHWACH ? "amber-t" : "leise"} title="Batterie">🔋 ${de(b3, 0)} %</span>`;
var signal = (db) => db === null ? A : o5(sigHtml(db));
var oeffnen = (p4, x2) => x2.art === "schalt" ? p4.geraetOeffnen(x2.b.id, x2.id) : p4.sensorOeffnen(x2.b.id, x2.eid);
function zeile(p4, x2) {
  return b2`<button class="zeile ger g-zeile" data-id=${x2.id} @click=${() => oeffnen(p4, x2)}>
      <span class="ger-ic">${x2.ic}<i class="ger-punkt ${x2.weg ? "weg" : "da"}" title=${x2.weg ? "nicht erreichbar" : "erreichbar"}></i></span>
      <div><b>${x2.name}${ST_TEXT2[x2.status] ? b2` <span class="g-st ${x2.status}">${ST_TEXT2[x2.status]}</span>` : A}</b>
        <div class="leise">${x2.unter}${x2.np ? " · 🛟 Notprogramm" : ""}</div>${x2.w.map((w2) => b2`<div class="g-w ${w2.stufe}">⚠ ${w2.titel}</div>`)}</div>
      <span class="ger-z ${x2.weg ? "rot-t" : ""}">${x2.zustand}<span class="g-z2">${batterie(x2.bat)}${x2.weg ? A : signal(x2.sig)}</span></span><span class="chev">›</span></button>`;
}
function uebersicht(p4) {
  const X = geraeteZeilen(p4), Z2 = zaehlen(X), f3 = p4.s.gerFilter || "alle";
  const F = X.filter((x2) => f3 === "alle" || (f3 === "probleme" ? x2.weg || x2.w.length || x2.status !== "aktiv" : x2.art === f3));
  const nachC = p4.d.bereiche.map((b3) => [b3, F.filter((x2) => x2.b === b3)]).filter(([, l4]) => l4.length);
  return b2`<div class="g-zahlen"><span class="chip glas-panel">${Z2.n} Geräte</span>
      <span class="chip glas-panel ${Z2.weg ? "rot-t" : ""}">● ${Z2.n - Z2.weg} erreichbar${Z2.weg ? ` · ${Z2.weg} nicht` : ""}</span>
      ${Z2.warn ? b2`<span class="chip glas-panel amber-t">⚠ ${Z2.warn} mit Warnung</span>` : A}
      ${Z2.bat ? b2`<span class="chip glas-panel rot-t">🔋 ${Z2.bat} Batterie schwach</span>` : A}
      ${Z2.nicht ? b2`<span class="chip glas-panel">${Z2.nicht} nicht aktiv</span>` : A}</div>
    <div class="seg glas-panel g-filter">${FILTER2.map(([k2, t5]) => b2`<button data-v=${k2} class=${f3 === k2 ? "on" : ""} @click=${() => {
    p4.s.gerFilter = k2;
    p4.neuZeichnen();
  }}>${t5}</button>`)}</div>
    ${nachC.map(([b3, l4]) => b2`<div class="glas-panel liste"><div class="gruppe g-gruppe"><span>${b3.pumpe ? "💧" : "🏠"} ${b3.name}</span>
        <button class="link blau" @click=${() => p4.containerOeffnen(b3.id)}>${l4.length} · Container ›</button></div>${l4.map((x2) => zeile(p4, x2))}</div>`)}
    ${nachC.length ? A : b2`<div class="glas-panel liste"><div class="leer">Keine Geräte in diesem Filter</div></div>`}
    <div class="leise p-fuss">Ein Gerät antippen: Zustand, Warnungen, Status, Einstellungen und Inventar an einer Stelle.</div>`;
}
function geraeteGruppeVorlage(p4) {
  const X = geraeteZeilen(p4), Z2 = zaehlen(X), inv = invGruppeVorlage(p4), r5 = p4.s.gerReiter || "uebersicht";
  const reiter = b2`<div class="seg glas-panel g-reiter">${[["uebersicht", "Übersicht"], ["inventar", "📦 Inventar"]].map(([k2, t5]) => b2`<button data-v=${k2} class=${r5 === k2 ? "on" : ""} @click=${() => {
    p4.s.gerReiter = k2;
    p4.neuZeichnen();
  }}>${t5}</button>`)}</div>`;
  return {
    k: "geraete",
    ic: "🔌",
    t: "Geräte",
    kurz: r5 === "inventar" ? inv.kurz : `${Z2.n} Geräte · ${Z2.weg ? `${Z2.weg} nicht erreichbar` : "alle erreichbar"}${Z2.warn ? ` · ${Z2.warn} mit Warnung` : ""}`,
    inhalt: () => b2`${reiter}${r5 === "inventar" ? inv.inhalt() : uebersicht(p4)}`
  };
}
function sensorLeisteVorlage(p4, b3) {
  const X = geraeteZeilen(p4).filter((x2) => x2.b === b3 && x2.art === "sensor");
  return X.length ? b2`<div class="glas-panel g-sensoren">${X.map((x2) => b2`<button class="chip g-sensor ${x2.weg ? "weg" : ""} ${x2.w.length ? "warn" : ""}" data-eid=${x2.eid}
      @click=${() => oeffnen(p4, x2)}>${x2.ic} ${x2.name} · ${x2.zustand} ${batterie(x2.bat)}${x2.weg ? A : signal(x2.sig)}</button>`)}</div>` : A;
}
function jetztVorlage(p4, x2) {
  const zl = (k2, v2) => b2`<div class="zeile"><span>${k2}</span><span class="leise g-wert">${v2}</span></div>`;
  const l4 = (p4.d.r && p4.d.r.geraete_links || {})[x2.eid] || {}, href = l4.web || l4.ha;
  return b2`<div class="glas-panel liste g-liste"><div class="gruppe">Jetzt</div>
      ${zl("Zustand", b2`<span class=${x2.weg ? "rot-t" : ""}>${x2.zustand}</span>`)}
      ${zl("Erreichbar", b2`<i class="ger-punkt-i ${x2.weg ? "weg" : "da"}"></i> ${x2.weg ? "nein" : "ja"}`)}
      ${x2.weg || x2.sig === null ? A : zl("Signal", b2`${signal(x2.sig)} ${de(x2.sig, 0)} dBm`)}
      ${x2.bat !== null ? zl("Batterie", batterie(x2.bat)) : A}
      ${href ? b2`<a class="zeile" href=${href} target="_blank" rel="noopener"><span>${l4.geraet || "Gerät"}${l4.modell ? b2` <span class="leise">· ${l4.modell}</span>` : A}</span><span class="blau">${l4.web ? "Website" : "in Home Assistant"} ↗</span></a>` : A}
      ${x2.np ? zl("Notprogramm", `🛟 ${{ bereit: "bereit", not: "im Notbetrieb", fehler: "Fehler", aus: "aus", offen: "noch nicht geprüft" }[x2.np.zustand] || x2.np.zustand || "–"}`) : A}</div>
    ${x2.w.length ? b2`<div class="glas-panel liste g-liste"><div class="gruppe">Warnungen · ${x2.w.length}</div>${x2.w.map((w2) => b2`<div class="zeile g-wz"><div><b class=${w2.stufe === "stoerung" ? "rot-t" : "amber-t"}>⚠ ${w2.titel}</b>${w2.hilfe ? b2`<div class="leise">${w2.hilfe}</div>` : A}</div>
      <button class="chip glas-panel" @click=${() => p4.warnungStumm(w2.id)}>${w2.stumm ? "stumm" : "bis morgen stumm"}</button></div>`)}</div>` : A}`;
}
function inventarVorlage(p4, x2) {
  const I2 = p4.invDaten(), z2 = I2 && I2.container.flatMap((c4) => c4.ausruestung.map((a3) => ({ c: c4, a: a3 }))).find(({ a: a3 }) => x2.art === "schalt" && a3.geraet_id === x2.id);
  const zl = (k2, v2) => b2`<div class="zeile"><span>${k2}</span><span class="leise">${v2}</span></div>`;
  return b2`<div class="glas-panel liste g-liste"><div class="gruppe">Inventar</div>
    ${I2 === void 0 ? b2`<div class="leer">lädt …</div>` : !I2 ? b2`<div class="leer">Datenbank nicht erreichbar</div>` : z2 ? b2`${zl("Name", b2`<b class="inv-id">${z2.a.name || z2.a.typ_label}</b>`)}${zl("Container", z2.c.name)}${z2.a.modell ? zl("Modell", z2.a.modell) : A}${z2.a.nicht_in_ha ? b2`<div class="zeile amber-t">nicht in HA</div>` : A}
        <button class="zeile" @click=${() => p4.invAuf({ art: "inv-container", id: z2.c.id, zurueck: p4.s.sheet })}><span class="blau">Container im Inventar ›</span></button>` : b2`<div class="zeile"><span class="leise">${x2.art === "schalt" ? "noch nicht im Inventar – trägt der Abgleich nach, sobald der Container im Inventar ist" : "im Inventar über den Container"}</span></div>`}</div>`;
}
function sensor(p4, s4) {
  const x2 = geraeteZeilen(p4).find((y3) => y3.art === "sensor" && y3.eid === s4.eid && y3.b.id === s4.bid);
  if (!x2) {
    p4.s.sheet = null;
    return A;
  }
  const wo = x2.s.art === "fuehler" || x2.s.art === "tuer" && x2.b.tuer && x2.b.tuer.eid === x2.eid ? "bearbeiten" : "aussehen";
  return b2`${GRIFF2}<div class="block-kopf"><h3>${x2.ic} ${x2.name}</h3><span class="leise">${x2.b.name}</span></div>
    ${jetztVorlage(p4, x2)}
    <div class="glas-panel liste g-liste"><div class="gruppe">Einstellungen</div>
      <div class="zeile"><span>Sensor</span><span class="leise">${x2.unter}</span></div>
      <div class="zeile"><div class="leise">${x2.s.art === "fuehler" ? "Fühler: regelt das Soll und schreibt die Temperatur mit." : x2.s.art === "licht" ? "Licht: nur im Symbol." : "Offen oder gekippt pausiert die Heizung (Tür-Pause)."}</div></div>
      <button class="zeile nur-admin" data-k="sensor-aendern" @click=${p4.nurAdmin(() => {
    p4.s.cid = x2.b.id;
    return wo === "bearbeiten" ? p4.einblenden("bereich") : p4.aussehenAuf(x2.b);
  })}>
        <span class="blau">${wo === "bearbeiten" ? (x2.s.art === "fuehler" ? "Fühler ändern" : "Türkontakt ändern") + " (Bearbeiten)" : "Ändern im Aussehen"} ›</span></button></div>
    ${inventarVorlage(p4, x2)}
    <button class="knopf leise-k" @click=${() => p4.schliessen()}>Schließen</button>`;
}
var GERAETE_EINBLENDUNGEN = { sensor };
var GERAETE_CSS = `
.g-zahlen { display: flex; flex-wrap: wrap; gap: 6px; margin: 0 0 10px; } .g-zahlen .chip { font-size: 12px; padding: 5px 10px; }
.g-filter, .g-reiter { margin: 0 0 10px; }
.g-gruppe { display: flex; justify-content: space-between; align-items: center; gap: 8px; } .g-gruppe .link { font-size: 11px; letter-spacing: 1px; text-transform: uppercase; }
.zeile.ger.g-zeile { width: 100%; text-align: left; }
.g-w { font-size: 12px; margin-top: 2px; } .g-w.stoerung { color: var(--rot); } .g-w.hinweis { color: var(--amber); }
.g-z2 { display: flex; gap: 6px; align-items: center; justify-content: flex-end; font-size: 11px; }
.ger-z { display: flex; flex-direction: column; align-items: flex-end; gap: 2px; }
.g-st { font-size: 11px; font-weight: 500; padding: 1px 6px; border-radius: 8px; background: rgba(120,120,128,.2); } .g-st.defekt { color: var(--rot); } .g-st.verliehen { color: var(--blau); }
.ger-punkt-i { display: inline-block; width: 9px; height: 9px; border-radius: 50%; } .ger-punkt-i.da { background: #30d158; } .ger-punkt-i.weg { background: var(--rot); }
.g-wert { display: inline-flex; gap: 6px; align-items: center; } .g-wz { align-items: flex-start; gap: 8px; } .g-wz .chip { font-size: 11px; white-space: nowrap; }
.g-sensoren { display: flex; flex-wrap: wrap; gap: 6px; padding: 8px 10px; border-radius: 18px; } .g-sensor { font-size: 12px; display: inline-flex; gap: 5px; align-items: center; }
.g-liste > .zeile, .g-liste > .gruppe { padding-left: 16px; padding-right: 16px; } a.zeile { text-decoration: none; color: inherit; }
.g-sensor.weg { opacity: .6; } .g-sensor.warn { border-color: var(--amber); }`;

// src/ansichten/wischen.js
var WISCH_SCHWELLE = 60;
var WISCH_VERHAELTNIS = 1.5;
var NICHT = 'button, a, input, select, textarea, label, svg, canvas, [role="slider"], [role="switch"], .seg, .chart-wrap, .c-kern, .c-chips, .glas-chips, .ck-chips, .ck-soll, .ck-gefuehl, .ck-info';
var HINWEIS_SPEICHER = "baustelle-wischen-hinweis";
function wischLage(p4) {
  const L2 = p4.d ? p4.d.bereiche.filter((b4) => !b4.pumpe) : [], b3 = p4.b, i7 = b3 && !b3.pumpe ? L2.indexOf(b3) : -1;
  return { L: L2, i: i7, n: L2.length };
}
var ziel = (p4, dir) => {
  const { L: L2, i: i7, n: n4 } = wischLage(p4);
  if (i7 < 0 || n4 < 2) return null;
  const j2 = i7 + dir;
  return j2 >= 0 && j2 < n4 ? L2[j2] : null;
};
var seiteEl = (p4) => p4.renderRoot && p4.renderRoot.querySelector(".scroll > .seite");
var anim = (el, k2, o6) => el && typeof el.animate === "function" ? el.animate(k2, o6).finished.catch(() => {
}) : Promise.resolve();
var bereit = (p4) => p4.s.view === "container" && !p4.s.sheet && wischLage(p4).i >= 0 && wischLage(p4).n > 1;
async function wischWechseln(p4, dir, von = "none") {
  if (p4._wischLaeuft) return;
  const z2 = ziel(p4, dir), el = seiteEl(p4);
  if (el) el.style.transform = "";
  if (!z2) return anim(el, [{ transform: von }, { transform: `translateX(${-dir * 18}px)` }, { transform: "none" }], { duration: 260, easing: "ease-out" });
  p4._wischLaeuft = true;
  const raus = el && typeof el.animate === "function" ? el.animate([{ transform: von, opacity: 1 }, { transform: `translateX(${-dir * 35}%)`, opacity: 0 }], { duration: 150, easing: "ease-in", fill: "forwards" }) : null;
  try {
    wischHinweisWeg(p4);
    if (raus) await raus.finished.catch(() => {
    });
    if (bereit(p4)) await p4.containerOeffnen(z2.id);
  } finally {
    p4._wischLaeuft = false;
  }
  anim(seiteEl(p4), [{ transform: `translateX(${dir * 35}%)`, opacity: 0 }, { transform: "none", opacity: 1 }], { duration: 220, easing: "cubic-bezier(.2,.7,.2,1)" });
  if (raus) raus.cancel();
}
function wischenAn(p4, root) {
  let z2 = null;
  const weg = () => {
    if (z2 && z2.el) {
      z2.el.style.transform = "";
      z2.el.style.userSelect = "";
    }
    z2 = null;
  };
  root.addEventListener("pointerdown", (e6) => {
    if (e6.pointerType !== "touch" && e6.pointerType !== "pen") return;
    if (!bereit(p4)) return;
    const t5 = e6.composedPath && e6.composedPath()[0] || e6.target;
    if (!t5 || !t5.closest || t5.closest(NICHT) || !t5.closest(".seite")) return;
    z2 = { id: e6.pointerId, x: e6.clientX, y: e6.clientY, el: seiteEl(p4), waag: false };
  });
  root.addEventListener("pointermove", (e6) => {
    if (!z2 || e6.pointerId !== z2.id) return;
    if (!bereit(p4)) return weg();
    const dx = e6.clientX - z2.x, dy = e6.clientY - z2.y;
    if (!z2.waag) {
      if (Math.abs(dx) < 10 && Math.abs(dy) < 10) return;
      if (Math.abs(dx) <= Math.abs(dy) * WISCH_VERHAELTNIS) return weg();
      z2.waag = true;
      if (z2.el) z2.el.style.userSelect = "none";
    }
    if (z2.el) z2.el.style.transform = `translateX(${ziel(p4, dx < 0 ? 1 : -1) ? dx : dx * 0.25}px)`;
  });
  root.addEventListener("pointerup", (e6) => {
    if (!z2 || e6.pointerId !== z2.id) return;
    const dx = e6.clientX - z2.x, dy = e6.clientY - z2.y, el = z2.el, von = el && el.style.transform || "none";
    const ok = z2.waag && bereit(p4) && Math.abs(dx) > WISCH_SCHWELLE && Math.abs(dx) >= Math.abs(dy) * WISCH_VERHAELTNIS;
    weg();
    if (ok) wischWechseln(p4, dx < 0 ? 1 : -1, von);
    else if (von !== "none") anim(el, [{ transform: von }, { transform: "none" }], { duration: 180, easing: "ease-out" });
  });
  root.addEventListener("pointercancel", weg);
}
function wischTaste(p4, e6) {
  if (e6.key !== "ArrowLeft" && e6.key !== "ArrowRight" || e6.altKey || e6.ctrlKey || e6.metaKey || e6.shiftKey || e6.defaultPrevented) return;
  if (p4.narrow || !bereit(p4)) return;
  const t5 = e6.composedPath && e6.composedPath()[0] || e6.target;
  if (t5 && t5.closest && t5.closest('input, select, textarea, [contenteditable], [role="slider"]')) return;
  e6.preventDefault();
  wischWechseln(p4, e6.key === "ArrowRight" ? 1 : -1);
}
function hinweisZeigen(p4) {
  if (!p4.narrow) return false;
  if (p4._wischHinweis === void 0) {
    let gesehen = false;
    try {
      gesehen = !!localStorage.getItem(HINWEIS_SPEICHER);
    } catch (e6) {
      gesehen = false;
    }
    p4._wischHinweis = !gesehen;
    if (p4._wischHinweis) {
      try {
        localStorage.setItem(HINWEIS_SPEICHER, "1");
      } catch (e6) {
      }
      setTimeout(() => wischHinweisWeg(p4), 3500);
    }
  }
  return p4._wischHinweis;
}
function wischHinweisWeg(p4) {
  if (p4._wischHinweis) {
    p4._wischHinweis = false;
    p4.neuZeichnen();
  }
}
function blaetterZeile(p4) {
  const { i: i7, n: n4 } = wischLage(p4), mit = i7 >= 0 && n4 > 1, vor = mit && ziel(p4, -1), nach = mit && ziel(p4, 1), hinweis = mit && hinweisZeigen(p4);
  return b2`<div class="zurueck-zeile w-zeile"><button class="glas-panel chip" @click=${() => p4.gehe("uebersicht")}>‹ Übersicht</button>
      ${mit ? b2`<div class="glas-panel w-nav" role="group" aria-label="Container blättern">
        <button class="w-pfeil" data-w="-1" ?disabled=${!vor} title=${vor ? `Vorheriger: ${vor.name}` : "erster Container"} aria-label="Vorheriger Container" @click=${() => wischWechseln(p4, -1)}>‹</button>
        <span class="w-pos">${i7 + 1} / ${n4}</span>
        <button class="w-pfeil" data-w="1" ?disabled=${!nach} title=${nach ? `Nächster: ${nach.name}` : "letzter Container"} aria-label="Nächster Container" @click=${() => wischWechseln(p4, 1)}>›</button></div>` : A}
      <button class="glas-panel chip" @click=${() => p4.einblenden("bereich")}>Bearbeiten</button>
      ${hinweis ? b2`<div class="w-hinweis" @click=${() => wischHinweisWeg(p4)}>← wischen →</div>` : A}</div>`;
}
var WISCHEN_CSS = `
.seite:has(.w-nav) { touch-action: pan-y pinch-zoom; }   /* senkrecht scrollt (und zoomt) der Browser, waagrecht bekommt die Seite */
.w-zeile { position: relative; align-items: center; gap: 8px; }
.w-nav { display: inline-flex; align-items: center; gap: 2px; padding: 2px 4px; border-radius: 999px; min-width: 0; }
.w-pfeil { width: 34px; height: 30px; border: 0; background: none; color: var(--ink); font-size: 22px; line-height: 1; cursor: pointer; border-radius: 999px; }
.w-pfeil:disabled { opacity: .25; cursor: default; }
.w-pos { font-size: 13px; font-variant-numeric: tabular-nums; color: var(--ink2); min-width: 38px; text-align: center; white-space: nowrap; }
.w-hinweis { position: absolute; top: calc(100% + 8px); left: 50%; transform: translateX(-50%); z-index: 3; font-size: 13px; padding: 6px 14px; border-radius: 999px;
  background: color-mix(in srgb, var(--amber) 85%, transparent); color: #000; white-space: nowrap; animation: w-wink 1.2s ease-in-out 3; cursor: pointer; }
@keyframes w-wink { 0%, 100% { transform: translateX(-50%); } 30% { transform: translateX(calc(-50% - 10px)); } 70% { transform: translateX(calc(-50% + 10px)); } }
`;

// src/ansichten/container.js
var OHNE_SOLL = { plan: "Zeitplan – der Heizkörperthermostat regelt", hand: "Hand – kein Soll", aus: "Aus – nur Frostschutz" };
function rad(p4, b3) {
  const mitSoll = p4.sollAktiv(b3);
  return b2`<div class="c-rad">${o5(p4.cRadSvg(b3))}
      ${mitSoll ? b2`<div class="c-rad-pm"><button class="c-pm" data-d="-0.5" aria-label="Soll niedriger" @click=${() => p4.sollSchritt(b3, -0.5)}>${o5(IC_MINUS)}</button><button class="c-pm" data-d="0.5" aria-label="Soll höher" @click=${() => p4.sollSchritt(b3, 0.5)}>${o5(IC_PLUS)}</button></div>` : b2`<div class="leise c-ohne-t">${OHNE_SOLL[b3.modus] || ""}</div>`}</div>`;
}
var ZUST_IC = { heizt: "🔥", pause: "⏸", aus: "○", frost: "❄", trocknen: "👕", offline: "⚠", bereit: "💤" };
var ZUST_KURZ = { heizt: "heizt", pause: "Pause", aus: "aus", frost: "Frost", trocknen: "trocknet", offline: "offline", bereit: "bereit" };
var REGEL_T = { plan: "Heizplan", thermo: "Thermostat", bedarf: "bei Bedarf", hand: "von Hand", aus: "nur Frostschutz" };
var vz = (x2) => x2 > 0 ? "+" : "−";
var ckZ = (p4) => p4.s.ck && p4.s.ck.id === p4.b.id ? p4.s.ck : { id: p4.b.id, info: null, modus: false, ei: false };
var ckSetzen = (p4, x2) => {
  p4.s.ck = { ...ckZ(p4), ...x2 };
  p4.neuZeichnen();
};
var minT = (x2) => {
  const g2 = Math.floor(x2);
  return Math.abs(x2 - g2 - 0.5) < 0.01 ? g2 ? `${g2}½` : "½" : de(x2, 0);
};
function rundeBalken(T2) {
  if (T2.art === "erreicht") return A;
  const an = T2.an_min / T2.zyklus_min * 100, jetzt = zahl(T2.minute) ? Math.min(100, T2.minute / T2.zyklus_min * 100) : null;
  return b2`<span class="tk-runde" aria-hidden="true"><span class="tk-bahn"><span class="tk-an ${an >= 100 ? "voll" : ""}" style="flex:${an} 0 0"></span>${an < 100 ? b2`<span class="tk-aus" style="flex:${100 - an} 0 0"></span>` : A}
      ${jetzt === null ? A : b2`<span class="tk-jetzt" style="left:${jetzt}%"><i>jetzt</i></span>`}</span>
      <span class="tk-skala">${T2.art === "runde" ? b2`<span><i class="tk-q an"></i>${minT(T2.an_min)} min an · <i class="tk-q"></i>${minT(T2.aus_min)} min aus</span>` : b2`<span><i class="tk-q an"></i>dauernd an</span>`}<span>Runde ${T2.zyklus_min} min</span></span></span>`;
}
function taktJetzt(p4, b3, T2) {
  const ist = de(b3.t), soll2 = de(p4.sollVon(b3)), Z2 = T2.zyklus_min, pause = T2.phase === "pause";
  if (T2.art === "dauernd" && !pause) return {
    k: "zust",
    ic: "🔥",
    ton: "warm",
    lang: "heizt durch",
    kurz: "durch",
    breit: true,
    info: b2`Noch deutlich unter dem Soll (${ist} von ${soll2} °C): Die Heizung läuft durchgehend. Kurz vor dem Soll läuft sie in Runden (je ${Z2} Minuten an und aus), damit es nicht zu warm wird.${rundeBalken(T2)}`
  };
  if (T2.art === "erreicht") return {
    k: "zust",
    ic: "✓",
    ton: "",
    lang: "Soll erreicht",
    kurz: "am Soll",
    breit: true,
    info: b2`Soll erreicht (${ist} von ${soll2} °C): Die Heizung bleibt aus. Wird es kühler, läuft sie wieder in kurzen Runden.`
  };
  if (T2.art === "dauernd") return {
    k: "zust",
    ic: "⏸",
    ton: "",
    lang: "Pause",
    kurz: "Pause",
    breit: true,
    // Runde unterbrochen (Staffelung)
    info: b2`Noch deutlich unter dem Soll (${ist} von ${soll2} °C): Die Heizung soll durchgehend laufen. <b>Gerade Pause – sie wartet, bis sie wieder heizen darf.</b>`
  };
  const lang = `${pause ? "Pause" : "an"}${T2.bis ? ` bis ${T2.bis}` : ""}`;
  const jetzt = T2.bis ? pause ? `Gerade Pause, wieder an um ${T2.bis}.` : `Gerade an, Pause ab ${T2.bis}.` : pause ? "Gerade Pause – sie wartet, bis sie wieder heizen darf." : "Gerade an.";
  return {
    k: "zust",
    ic: pause ? "⏸" : "🔥",
    ton: pause ? "" : "warm",
    lang,
    kurz: lang,
    breit: true,
    info: b2`Fast am Soll (${ist} von ${soll2} °C): Die Heizung läuft in Runden – je ${Z2} Minuten etwa ${minT(T2.an_min)} min an und ${minT(T2.aus_min)} min aus, damit es nicht zu warm wird.
      <b>${jetzt}</b> Je näher am Soll, desto kürzer läuft sie.${rundeBalken(T2)}`
  };
}
function taktRunde(T2) {
  const Z2 = T2.zyklus_min;
  if (T2.art === "dauernd") return {
    k: "takt",
    ic: "◔",
    ton: "",
    lang: "dauernd an",
    kurz: "dauernd",
    breit: true,
    info: b2`Noch weit unter dem Soll: Die Heizung läuft die ganze ${Z2}-Minuten-Runde durch. Kurz vor dem Soll läuft sie nur noch einen Teil jeder Runde.${rundeBalken(T2)}`
  };
  if (T2.art === "erreicht") return {
    k: "takt",
    ic: "◔",
    ton: "",
    lang: `0 von ${Z2} min`,
    kurz: `0/${Z2} min`,
    breit: true,
    info: `Am Soll: In dieser ${Z2}-Minuten-Runde bleibt die Heizung aus (0 von ${Z2} min). Wird es kühler, läuft sie wieder einen Teil jeder Runde.`
  };
  return {
    k: "takt",
    ic: "◔",
    ton: "",
    lang: `${minT(T2.an_min)} von ${Z2} min`,
    kurz: `${minT(T2.an_min)}/${Z2} min`,
    breit: true,
    info: b2`In jeder ${Z2}-Minuten-Runde läuft die Heizung gerade etwa ${minT(T2.an_min)} min (${T2.anteil} %). Das rechnet die Automatik laufend neu – je näher am Soll, desto kürzer.${rundeBalken(T2)}`
  };
}
var startLink = (p4) => b2`<button class="st-link" @click=${() => {
  ckSetzen(p4, { info: null });
  p4.einblenden("lernen");
}}>So rechnet der Start ›</button>`;
function planChip(p4, S3) {
  return {
    k: "warm",
    ic: "⏱",
    ton: S3.begrenzt ? "amber" : "",
    breit: true,
    kurz: S3.kurz,
    lang: b2`${S3.tag_t} ab ${S3.beginn} · warm ${S3.begrenzt ? "≈ " : ""}${S3.warm}${S3.geschaetzt ? b2` <span class="st-mini">geschätzt</span>` : A}`,
    info: b2`${S3.satz}${S3.begrenzt ? b2` <b>Grenze erreicht.</b>` : A} <span class="st-stand">Rechnet laufend nach · Stand ${S3.jetzt}.</span> ${startLink(p4)}`
  };
}
function kopfChips(p4, b3) {
  const d3 = p4.d, L2 = [], text2 = TEXT(b3), lern = b3.lern && b3.lern.an && ["thermo", "bedarf"].includes(b3.modus) ? b3.lern : null, T2 = b3.takt;
  const erst = text2.split(" · ")[0].replace(/^⚡\s*/, "") || b3.z;
  const S3 = lern && b3.start, bis = S3 && !T2 && S3.aus_bis;
  if (T2) L2.push(taktJetzt(p4, b3, T2));
  else if (bis) L2.push({ k: "zust", ic: "⏸", ton: "", lang: bis.lang, kurz: bis.kurz, breit: true, info: b2`${S3.satz} ${startLink(p4)}` });
  else L2.push({
    k: "zust",
    ic: ZUST_IC[b3.z] || "•",
    ton: b3.z === "heizt" ? "warm" : b3.z === "frost" ? "blau" : b3.z === "offline" ? "rot" : "",
    lang: erst,
    kurz: ZUST_KURZ[b3.z] || erst,
    info: text2
  });
  if (b3.tuer && b3.tuer.offen) L2.push({
    k: "tuer",
    ic: "🚪",
    ton: "amber",
    lang: `Tür offen seit ${b3.tuer.offen} min`,
    kurz: `${b3.tuer.offen} min`,
    info: `${b3.tuer.sensor}: offen seit ${b3.tuer.offen} min – Heizung pausiert nach ${d3.e.tuer_pause} min, Meldung nach ${d3.e.tuer_melden} min`
  });
  for (const [i7, f3] of (b3.symbol && b3.symbol.fenster || []).entries()) if (f3.sensor && f3.zustand && f3.zustand !== "zu")
    L2.push({ k: `fenster${i7}`, g: "fenster", ic: "🪟", ton: "amber", lang: `Fenster ${f3.zustand}`, kurz: f3.zustand, info: `Fenster (${p4.name(f3.sensor)}): ${f3.zustand}` });
  for (const s4 of b3.sensoren || []) if (s4.art === "fuehler" && zahl(s4.batterie) && s4.batterie < BATTERIE_SCHWACH)
    L2.push({
      k: `bat-${s4.entity_id}`,
      g: "bat",
      ic: "🔋",
      ton: s4.batterie < 10 ? "rot" : "amber",
      lang: `Fühler schwach ${de(s4.batterie, 0)} %`,
      kurz: `${de(s4.batterie, 0)} %`,
      info: `${s4.name || p4.name(s4.entity_id)}: Batterie ${de(s4.batterie, 0)} % – bald tauschen`
    });
  if (lern) {
    const w2 = lern.warm;
    if (S3) L2.push(planChip(p4, S3));
    else if (w2 && w2.gelernt && w2.plan) L2.push({ k: "warm", ic: "⏱", ton: "", lang: `warm um ${uhr(w2.plan.ziel)} · ab ${uhr(w2.plan.start)}`, kurz: uhr(w2.plan.ziel), info: p4.warmText(b3) });
    else if (w2) L2.push({ k: "warm", ic: "⏱", ton: "", lang: "Aufheizen lernt noch", kurz: "lernt", info: p4.warmText(b3) });
    if (lern.offen) L2.push({ k: "lern", ic: "🧠", ton: "amber", lang: "lernt gerade nicht", kurz: "lernt nicht", info: p4.offenText(b3) || p4.cRegelText(b3) });
    if (zahl(lern.erwartet)) L2.push({
      k: "nach",
      ic: "↘",
      ton: "",
      lang: `wärmt nach +${de(lern.erwartet)}°`,
      kurz: `+${de(lern.erwartet)}°`,
      info: `Wärmt nach dem Ausschalten noch etwa ${de(lern.erwartet)} °C nach – darum schaltet die Automatik früher ab (bei ${de(lern.aus_bei)} °C).`
    });
    if (T2) L2.push(taktRunde(T2));
  } else L2.push({ k: "regel", ic: "ⓘ", ton: "", lang: REGEL_T[b3.modus] || "Regel", kurz: REGEL_T[b3.modus] || "Regel", info: p4.cRegelText(b3) });
  return L2;
}
var chipText = (c4) => b2`<span class="ck-l">${c4.lang}</span><span class="ck-k">${c4.kurz}</span>`;
function chip(p4, c4) {
  const auf = ckZ(p4).info === c4.k;
  return b2`<button class="ck-chip ${c4.ton} ${auf ? "auf" : ""}" data-k=${c4.k} aria-expanded=${auf ? "true" : "false"}
      @click=${() => ckSetzen(p4, { info: auf ? null : c4.k, modus: false })}><span class="ck-ic">${c4.ic}</span>${chipText(c4)}</button>`;
}
var info = (p4, L2) => {
  const c4 = L2.find((x2) => x2.k === ckZ(p4).info);
  return c4 ? b2`<div class=${c4.breit ? "ck-info tk-info" : "ck-info"} role="note"><span>${c4.info}</span><button aria-label="schließen" @click=${() => ckSetzen(p4, { info: null })}>✕</button></div>` : A;
};
var EI_ZEILEN = [["container", "nur hier"], ["baustelle", "Baustelle"]];
var EI_VON = { baustelle: "Einstellung der Baustelle – gilt für alle Container.", container: "Einstellung nur dieses Containers." };
var hin = (p4, sel) => p4.updateComplete.then(() => {
  const el = p4.ui && p4.ui.querySelector(sel);
  if (el && el.scrollIntoView) el.scrollIntoView({ block: "center" });
});
function eiSpringen(p4, ziel2) {
  const [art, z2] = String(ziel2 || "").split(":");
  if (art === "container") {
    ckSetzen(p4, { info: null });
    return hin(p4, `.c-einst [data-z="${z2}"]`);
  }
  if (art === "bearbeiten") {
    p4.einblenden("bereich");
    return hin(p4, `.sheet [data-zeile="${z2}"]`);
  }
  if (art === "regeln") {
    p4.hzAuf("regeln");
    return hin(p4, `.sheet [data-r="${z2}"]`);
  }
  if (art === "urlaub") return p4.hzAuf("urlaub");
  if (art === "strom") {
    p4.einstGruppe("strom");
    return z2 ? hin(p4, `.ev-inhalt [data-r="${z2}"]`) : p4.updateComplete;
  }
  if (art === "notprogramm") return p4.einstGruppe("notprogramm");
  return void 0;
}
function eingestellt(p4, b3) {
  const L2 = b3.eingestellt || [];
  if (!L2.length) return A;
  const z2 = ckZ(p4), ruhen = L2.filter((c4) => c4.wirkt === false).length, offen = L2.find((c4) => z2.info === `ei-${c4.k}`);
  const chipE = (c4) => {
    const k2 = `ei-${c4.k}`, auf = z2.info === k2, ruht = c4.wirkt === false;
    return b2`<button class="ck-chip ei-chip ${ruht ? "ei-ruht" : ""} ${auf ? "auf" : ""}" data-k=${k2} aria-expanded=${auf ? "true" : "false"} title=${ruht ? "an, wirkt gerade nicht" : A}
        @click=${() => ckSetzen(p4, { info: auf ? null : k2, modus: false })}><span class="ck-ic">${c4.ic}</span><span class="ck-l">${c4.text}</span><span class="ck-k">${c4.kurz}</span></button>`;
  };
  const satz = offen ? b2`<div class="ck-info ei-info" role="note"><span>${offen.wirkt === false && offen.grund ? b2`<b class="ei-grund">${offen.grund}</b> ` : A}${offen.satz}
        <span class="ei-von-t">${EI_VON[offen.von] || ""}</span> <button class="ei-aendern" @click=${() => eiSpringen(p4, offen.ziel)}>ändern ›</button></span>
      <button aria-label="schließen" @click=${() => ckSetzen(p4, { info: null })}>✕</button></div>` : A;
  const zeilen = EI_ZEILEN.map(([v2, t5]) => [v2, t5, L2.filter((c4) => c4.von === v2)]).filter(([, , X]) => X.length).map(([v2, t5, X]) => b2`<div class="ei-zeile" data-von=${v2}><span class="ei-von">${t5}</span>${X.map(chipE)}</div>`);
  return b2`<button class="ck-chip ei-c ${z2.ei ? "auf" : ""}" aria-expanded=${z2.ei ? "true" : "false"} @click=${() => ckSetzen(p4, { ei: !z2.ei, info: null, modus: false })}>
      <span class="ck-ic">⚙</span><span class="ck-l">${L2.length} eingestellt${ruhen ? b2` <span class="ei-ruht-t">· ${ruhen} ruhen</span>` : A}</span><span class="ck-k">${L2.length} eingestellt</span> ${z2.ei ? "▴" : "▾"}</button>
    ${z2.ei ? b2`<div class="ei-b">${zeilen}</div>${satz}` : A}`;
}
function sollChips(p4, b3) {
  const S3 = b3.sollJ || {}, gl = p4.d.e.soll_art === "gleitend", G = p4.d.sollG, gs = G ? de(G.soll, 1) : "–", L2 = [];
  if (gl) L2.push({
    k: "sgl",
    ic: "〰",
    ton: "",
    lang: `gleitend ${gs}°`,
    kurz: `${gs}°`,
    info: `Soll gleitend ${gs} °C${zahl(S3.eigen) && S3.eigen ? ` ${vz(S3.eigen)}${de(Math.abs(S3.eigen), 1)} eigenes Soll = ${de(p4.sollVon(b3), 1)} °C` : ""} – dein Gefühl hilft beim Lernen`
  });
  if (gl && zahl(S3.eigen) && S3.eigen) L2.push({
    k: "seig",
    ic: "👤",
    ton: "amber",
    lang: `${vz(S3.eigen)}${de(Math.abs(S3.eigen), 1)} eigen`,
    kurz: `${vz(S3.eigen)}${de(Math.abs(S3.eigen), 1)}`,
    info: `Soll gleitend ${gs} °C ${vz(S3.eigen)}${de(Math.abs(S3.eigen), 1)} eigenes Soll = ${de(p4.sollVon(b3), 1)} °C – dein Gefühl hilft beim Lernen`
  });
  if (gl && S3.versch) L2.push({
    k: "sver",
    ic: "±",
    ton: "amber",
    lang: `${vz(S3.versch)}${de(Math.abs(S3.versch), 1)} bis morgen`,
    kurz: `${vz(S3.versch)}${de(Math.abs(S3.versch), 1)}`,
    info: `gleitend ${gs} °C ${vz(S3.versch)}${de(Math.abs(S3.versch), 1)} · bis morgen früh – + / − lernt mit wie „zu kalt“ / „zu warm“ · ↺ gleitend setzt zurück`
  });
  if (!gl) L2.push({ k: "sfest", ic: "ⓘ", ton: "", lang: "Soll fest", kurz: "fest", info: "hilft beim gleitenden Soll (Heizung › Regeln)" });
  const zurueck = gl && S3.versch ? b2`<button class="ck-chip ck-zurueck" title="zurück auf gleitendes Soll" @click=${() => p4.sollZurueck(b3)}><span class="ck-ic">↺</span><span class="ck-l">gleitend</span><span class="ck-k">gleitend</span></button>` : A;
  return b2`<div class="ck-soll">${L2.map((c4) => chip(p4, c4))}${zurueck}</div>${info(p4, L2)}`;
}
var gefuehl = (p4, b3) => b2`<div class="ck-gefuehl">${[[-1, "🥶", "zu kalt"], [0, "👍", "passt"], [1, "🥵", "zu warm"]].map(([v2, i7, t5]) => b2`<button data-v=${v2} title=${t5} aria-label=${t5} @click=${() => p4.gefuehl(b3, v2)}>${i7}</button>`)}</div>`;
function kopf(p4, b3) {
  const L2 = kopfChips(p4, b3), z2 = ckZ(p4), von = (ks) => L2.filter((c4) => ks.includes(c4.g || c4.k));
  const modusT = (MODI.find((m3) => m3[0] === b3.modus) || ["", "–"])[1];
  const steuerung = b2`<button class="ck-chip modus ${z2.modus ? "auf" : ""}" aria-haspopup="listbox" aria-expanded=${z2.modus ? "true" : "false"}
        @click=${() => ckSetzen(p4, { modus: !z2.modus, info: null })}><span class="ck-ic">⚙</span>${modusT} ▾</button>
      <button class="ck-chip ck-boost ${b3.boost ? "amber auf" : ""}" @click=${() => p4.boostUmschalten(b3)}><span class="ck-ic">⚡</span><span class="ck-l">${b3.boost ? "Aufheizen beenden" : "Schnell aufheizen"}</span><span class="ck-k">${b3.boost ? "beenden" : "Aufheizen"}</span></button>`;
  const modi = z2.modus ? b2`<div class="ck-info ck-modi" role="listbox">${MODI.map(([k2, t5]) => b2`<button role="option" data-v=${k2} class=${b3.modus === k2 ? "on" : ""} aria-selected=${b3.modus === k2 ? "true" : "false"}
        ?disabled=${k2 === "thermo" && !b3.fuehler} title=${k2 === "thermo" && !b3.fuehler ? "kein Temperaturfühler" : A} @click=${() => {
    ckSetzen(p4, { modus: false });
    return p4.modusSetzen(b3, k2);
  }}>${t5}</button>`)}</div>` : A;
  const GR = [
    ["Steuerung", steuerung, modi, []],
    ["Jetzt", null, null, von(["zust", "tuer", "fenster"])],
    ["Plan", null, null, von(["warm", "regel"])],
    ["Lernen", null, null, von(["lern", "nach", "takt"])],
    ["Hinweise", null, null, von(["bat"])]
  ];
  const gruppe = ([t5, fest, dazu, X]) => fest || X.length ? b2`<div class="ckd-g" data-g=${t5}><div class="ckd-gt">${t5}</div><div class="ck-chips">${fest || A}${X.map((c4) => chip(p4, c4))}</div>${dazu || info(p4, X)}</div>` : A;
  const mitRad = b3.fuehler && b3.t !== null, mitSoll = mitRad && p4.sollAktiv(b3);
  return b2`<div class="glas-panel ck ck-d ck-d2 ${b3.z}" style="--c:${FARBE[b3.z]}">
      <div class="ckd-name ei-name"><div class="ck-name"><span class="ck-art">Container</span><span class="ck-titel">${b3.name}</span></div>${eingestellt(p4, b3)}</div>
      <div class="ckd-rad c-kern">${mitRad ? rad(p4, b3) : ohneFuehler(b3)}${mitSoll ? b2`<div class="ckd-soll"><div class="ckd-gt">Soll</div>${sollChips(p4, b3)}${gefuehl(p4, b3)}</div>` : A}</div>
      <div class="ckd-gruppen">${GR.map(gruppe)}</div></div>`;
}
var ohneFuehler = (b3) => b2`<div class="c-ohne glas-panel"><small>LEISTUNG JETZT</small><b>${de(kwVon(b3))}<small> kW</small></b><span class="leise">kein Fühler – der Heizkörperthermostat regelt</span></div>`;
function kacheln(p4, b3) {
  const d3 = p4.d, heuteNr = TAGE.indexOf(p4.z.HEUTE_TAG), kwh7 = p4.verbrauch(d3, b3.id, "Woche"), h7 = p4.heizStunden(d3, b3, "Woche");
  const kwh = kwh7 ? kwh7[heuteNr] : null, h3 = h7 ? h7[heuteNr] : null;
  return [["⚡", de(kwVon(b3)), "kW jetzt", "leistung"], ["🔋", zahl(kwh) ? de(kwh) : "–", "kWh heute", "verbrauch"], ["€", zahl(kwh) ? de(kwh * d3.e.preis, 2) : "–", "Kosten heute", "verbrauch", "eur"], ["⏱", zahl(h3) ? de(h3) : "–", "h Heizzeit", "heizzeit-c"]].map(([i7, v2, t5, s4, art]) => b2`<button class="glas-panel c-kachel" data-s=${s4} @click=${() => p4.einblenden(s4, art ? { id: b3.id, t: art } : { id: b3.id })}><span>${i7}</span><b>${v2}</b><small>${t5}</small></button>`);
}
function bedarf(p4, b3) {
  const H2 = p4.z.HEUTE, offen = (t5) => t5.datum > H2 || t5.datum === H2 && t5.bis > p4.z.JETZT, serien = /* @__PURE__ */ new Map();
  for (const t5 of p4.d.termine.filter((t6) => t6.b === b3.id)) {
    const k2 = t5.rrule && t5.uid ? t5.uid : t5, alt = serien.get(k2);
    if (!alt || !offen(alt) && offen(t5)) serien.set(k2, t5);
  }
  const T2 = [...serien.values()].filter((t5) => t5.wieder !== "einmal" || offen(t5)).map((t5) => ({ t: t5, n: t5.wieder === "einmal" || offen(t5) ? t5.datum : naechsterTermin(t5, plusTage(H2, 1)) })).sort((x2, y3) => (x2.n || "9").localeCompare(y3.n || "9"));
  const vor = (m3) => uhr(minu(m3) - p4.d.e.vorheizen), ende = p4.arbeitsende(), kal = p4.d.termineKal;
  return b2`<div class="glas-panel block"><div class="block-kopf"><b>Nur bei Bedarf</b><span class="leise">heizt nicht nach der Arbeitszeit · sonst nur Frostschutz</span></div>
      ${b3.bedarfBis ? b2`<div class="bedarf-an"><b>♨ heizt bis ${b3.bedarfBis}${b3.boost ? " · ⚡ schnell" : ""}</b><button class="chip glas-panel" @click=${() => p4.bedarfAus(b3.id)}>Beenden</button></div>` : b2`<div class="bedarf-dauer">${[["60", "1 h"], ["120", "2 h"], ...ende ? [["ende", "bis Arbeitsende"]] : []].map(([v2, t5]) => b2`<button class="chip glas-panel" data-v=${v2} @click=${() => p4.bedarfAn(b3.id, v2)}>▶ ${t5}</button>`)}</div>`}
      <div class="gruppe-t">Termine · ${kal ? `Kalender „${p4.name(kal)}“` : "kein Kalender gewählt"}</div>
      ${T2.length ? T2.map(({ t: t5, n: n4 }) => b2`<div class="zeile ereignis"><span class="zeit t-wann">${t5.wieder === "einmal" ? `${wtag(t5.datum)} ${kurzDatum(t5.datum)}` : t5.wieder === "woche" ? `jeden ${wtag(t5.datum)}` : `jeden 2. ${wtag(t5.datum)}`}</span>
          <div><b>${t5.von}–${t5.bis}</b> ${t5.titel}${t5.wieder !== "einmal" ? b2` <span class="badge">${WIEDER[t5.wieder]}</span>` : A}<div class="leise">${n4 && t5.wieder !== "einmal" ? `nächster ${wtag(n4)} ${kurzDatum(n4)} · ` : ""}heizt ab ${vor(t5.von)}${t5.boost ? " · ⚡ schnell" : ""}</div></div>
          <button class="x nur-admin" title="Termin löschen" @click=${p4.nurAdmin(() => p4.terminWeg(t5))}>✕</button></div>`) : b2`<div class="leise">Keine Termine</div>`}
      <button class="zeile nur-admin" @click=${p4.nurAdmin(() => p4.einblenden(kal ? "termin" : "wetterquelle", { id: b3.id }))}><span class="blau">${kal ? "+ Termin eintragen" : "Kalender für Termine wählen"}</span></button></div>`;
}
function geraete(p4, b3) {
  const d3 = p4.d;
  return b3.geraete.map((g2, i7) => {
    const off = b3.offline || !g2.erreichbar, an = g2.an && g2.aktiv;
    const st = b3.stufen && b3.stufen.an ? b3.stufen.zusatz.includes(g2.id) ? b3.stufen.zusatz_an ? b2` · <em class="warte">Zusatz – ${b3.stufen.text}</em>` : " · Zusatz – wartet, einer reicht" : " · ★ Primär" : "";
    const info2 = !g2.aktiv ? `${g2.status} – die Automatik lässt es aus` : off ? b2`<span class="rot-t">offline</span>` : b2`${g2.typ} · ${an ? de(zahl(g2.kwJetzt) ? g2.kwJetzt : g2.kw, 2) + " kW" : "aus"}${st}`;
    return b2`<div class="c-chip glas-panel ${an ? "an" : ""} ${g2.aktiv ? "" : "inaktiv"}" data-i=${i7}>
        <span class="c-chip-t">${g2.typ === "Steckdose" || g2.typ === "Bautrockner" ? "⏻" : "♨"} <b>${g2.n}</b><small>${info2}${g2.hand && g2.aktiv ? b2` · <em class="hand">✋ Hand</em>` : A}${g2.warte && g2.aktiv ? b2` · <em class="warte">wartet – ${(d3.anschluesse.find((a3) => a3.id === b3.anschluss) || {}).name || "Anschluss"} ausgelastet</em>` : A}</small>
          ${g2.hand && g2.aktiv ? b2`<button class="link" @click=${() => p4.geraetAutomatik(b3, i7)}>Automatik übernehmen</button>` : A}</span>
        <button class="c-power ${an ? "an" : ""}" ?disabled=${!g2.aktiv || off} aria-label="${g2.n} ${g2.an ? "ausschalten" : "einschalten"}" title="${g2.an ? "Ausschalten" : "Einschalten"} (Handbetrieb)" @click=${() => p4.geraetSchalten(b3, i7)}>${o5(IC_POWER)}</button>
        ${g2.status === "verliehen" || g2.status === "defekt" ? b2`<button class="c-aktiv link nur-admin" data-status=${g2.status} title="Status ändern" @click=${p4.nurAdmin(() => p4.geraetBearbeiten(b3, i7))}><small>${g2.status}</small></button>` : b2`<label class="c-aktiv" title="Gerät aktiv – aus: die Automatik schaltet es nicht, keine Warnungen">${schalterVorlage(g2.aktiv, () => p4.geraetAktiv(b3, i7))}<small>aktiv</small></label>`}
        <button class="bs-ic nur-admin" title="Gerät bearbeiten" aria-label="${g2.n} bearbeiten" @click=${p4.nurAdmin(() => p4.geraetBearbeiten(b3, i7))}>✎</button></div>`;
  });
}
function containerVorlage(p4) {
  const d3 = p4.d, b3 = p4.b, { c: c4, chart } = p4.containerTeile(b3), vT = p4.zrV("c-Tag");
  return b2`${blaetterZeile(p4)}
      ${kopf(p4, b3)}
      <div class="c-kacheln c-live-kennz">${kacheln(p4, b3)}</div>
      ${b3.bedarf ? bedarf(p4, b3) : A}
      <div class="glas-panel block c-live"><div class="block-kopf"><div class="seg klein">${[["heute", vT ? "Tag" : "Heute"], ["woche", "Woche"], ["stunden", "Heizzeit"]].map(([k2, t5]) => b2`<button data-v=${k2} class=${k2 === c4 ? "on" : ""} @click=${() => {
    p4.s.cvd = k2;
    p4.neuZeichnen();
  }}>${t5}</button>`)}</div>
        <span class="leise">${c4 === "heute" ? vT ? "Temperatur und Verbrauch je Stunde" : p4.heuteText(b3) : c4 === "woche" ? "kWh je Tag" : "Stunden geheizt je Tag"}</span></div>
        ${c4 === "heute" ? zeitraumVorlage(p4, "c-Tag", "Tag", p4.zrGrenze()) : zeitraumVorlage(p4, "c-Woche", "Woche", p4.zrGrenze())}
        <div class="chart-wrap">${o5(chart)}</div></div>
      <div class="glas-panel block"><div class="block-kopf"><b>Geräte</b><span class="leise">⏻ = Handbetrieb · aktiv aus = die Automatik lässt es aus</span></div>
        ${b3.geraete.length ? b2`<div class="c-chips">${geraete(p4, b3)}</div>` : b2`<div class="leise">Noch kein Gerät</div>`}</div>
      ${sensorLeisteVorlage(p4, b3)}
      <div class="glas-panel liste c-einst">
        ${b3.tuer && b3.tuer.offen ? b2`<div class="zeile"><div><b>🚪 ${b3.tuer.sensor}</b><div class="leise">${b3.tuer.offen ? `offen seit ${b3.tuer.offen} min – Heizung pausiert nach ${d3.e.tuer_pause} min, Meldung nach ${d3.e.tuer_melden} min` : "zu"}</div></div></div>` : A}
        ${!b3.fuehler || !b3.lern ? A : b2`<div class="zeile" data-z="lernen"><div><b>🧠 Lernende Regelung</b><div class="leise">${["thermo", "bedarf"].includes(b3.modus) ? "lernt, wie lange der Raum nach dem Ausschalten nachheizt, und schaltet früher ab" : "wirkt nur im Modus Thermostat oder Bei Bedarf"}${b3.lern.an ? b2` · <button class="link" @click=${() => p4.einblenden("lernen")}>Lernstand ›</button>` : A}</div></div>${schalterVorlage(b3.lern.an, () => p4.lernenUmschalten(b3))}</div>`}
        <div class="zeile" data-z="trocknen"><span>👕 Kleidung trocknen nach Regen</span>${schalterVorlage(b3.trocknen, () => p4.trocknenUmschalten(b3))}</div>
      </div>`;
}

// src/ansichten/start.js
var MARKE2 = { gelernt: "st-m-gel", geschaetzt: "st-m-ges", gemessen: "st-m-mes", einstellung: "st-m-ein" };
var marke = (s4) => s4.marke ? b2`<span class="st-m ${MARKE2[s4.marke] || ""}">${s4.marke === "geschaetzt" ? "≈ " : s4.marke === "gelernt" ? "🧠 " : ""}${s4.marke_t}</span>` : A;
var grad = (x2, n4 = 1) => de(x2, n4).replace("-", "−");
var uhrMin = (m3) => {
  m3 = (Math.round(m3) % 1440 + 1440) % 1440;
  return `${String(Math.floor(m3 / 60)).padStart(2, "0")}:${String(m3 % 60).padStart(2, "0")}`;
};
function startKurveSvg(S3, schmal) {
  const W = schmal ? 320 : 440, H2 = schmal ? 226 : 236, l4 = 30, r5 = W - 12, o6 = 46, u3 = H2 - 34, fs = schmal ? 10 : 11;
  const K = S3.kurve || [], A2 = S3.aussen_vorhersage || [], M2 = S3.min || {}, alle = [...K, ...A2];
  if (!K.length) return "";
  const bg = M2.beginn, wm = M2.warm, ab = M2.arbeitsbeginn, gr = M2.grenze, jt = M2.jetzt;
  const t0 = Math.min(...alle.map((k2) => k2[0]), bg, jt), t1 = Math.max(ab, wm, ...alle.map((k2) => k2[0])) + 10;
  const cMin = Math.floor(Math.min(...alle.map((k2) => k2[1])) - 1), cMax = Math.ceil(Math.max(S3.soll, ...alle.map((k2) => k2[1])) + 1);
  const x2 = (m3) => +(l4 + (m3 - t0) / (t1 - t0) * (r5 - l4)).toFixed(1), y3 = (c4) => +(u3 - (c4 - cMin) / (cMax - cMin) * (u3 - o6)).toFixed(1);
  const T2 = [];
  if (wm > bg) T2.push(`<rect class="st-band" x="${x2(bg)}" y="${o6 - 4}" width="${(x2(wm) - x2(bg)).toFixed(1)}" height="${u3 - o6 + 4}"></rect>`);
  T2.push(`<line class="st-soll" x1="${l4}" x2="${r5}" y1="${y3(S3.soll)}" y2="${y3(S3.soll)}"></line><text class="st-ax" x="${l4 - 4}" y="${y3(S3.soll) + 4}" text-anchor="end" font-size="${fs}">${grad(S3.soll, 0)}°</text>`);
  if (cMin < 0) T2.push(`<line class="st-null" x1="${l4}" x2="${r5}" y1="${y3(0)}" y2="${y3(0)}"></line><text class="st-ax" x="${l4 - 4}" y="${y3(0) + 4}" text-anchor="end" font-size="${fs}">0°</text>`);
  T2.push(`<text class="st-ax" x="${l4 - 4}" y="${y3(cMin) + 4}" text-anchor="end" font-size="${fs}">${grad(cMin, 0)}°</text>`);
  if (gr >= t0) {
    const links = gr < jt && x2(gr) - l4 > 80;
    T2.push(`<line class="st-gr" x1="${x2(gr)}" x2="${x2(gr)}" y1="${o6 - 30}" y2="${u3}"></line><text class="st-ax st-gr-t" x="${x2(gr) + (links ? -3 : 3)}" y="${o6 - 26}" text-anchor="${links ? "end" : "start"}" font-size="${fs - 1}">frühestens ${S3.grenze}</text>`);
  }
  for (let i7 = 1; i7 < A2.length; i7++) T2.push(`<line class="st-aussen ${A2[i7][2] === "vorhersage" ? "prog" : ""}" x1="${x2(A2[i7 - 1][0])}" y1="${y3(A2[i7 - 1][1])}" x2="${x2(A2[i7][0])}" y2="${y3(A2[i7][1])}"></line>`);
  for (const a3 of A2) T2.push(`<circle class="st-apkt ${a3[2] === "vorhersage" ? "prog" : ""}" cx="${x2(a3[0])}" cy="${y3(a3[1])}" r="${a3[2] === "vorhersage" ? 2.2 : 1.6}"></circle>`);
  if (A2.length) {
    const aL = A2[A2.length - 1];
    T2.push(`<text class="st-ax st-a-t" x="${x2(aL[0])}" y="${y3(aL[1]) - 6}" text-anchor="end" font-size="${fs - 1}">außen ${grad(aL[1], 0)}°</text>`);
  }
  for (let i7 = 1; i7 < K.length; i7++) {
    const [m0, c0] = K[i7 - 1], [m1, c1, q] = K[i7];
    T2.push(`<line class="st-i ${m1 <= bg ? "kalt" : "warm"} ${q === "prognose" ? "prog" : ""}" x1="${x2(m0)}" y1="${y3(c0)}" x2="${x2(m1)}" y2="${y3(c1)}"></line>`);
  }
  T2.push(`<line class="st-jetzt" x1="${x2(jt)}" x2="${x2(jt)}" y1="${o6 - 36}" y2="${u3}"></line><text class="st-ax st-fett" x="${x2(jt) - 3}" y="${o6 - 8}" text-anchor="end" font-size="${fs}">jetzt ${S3.jetzt}</text>`);
  T2.push(`<text class="st-ax st-klein" x="${x2(jt) - 3}" y="${o6 - 26}" text-anchor="end" font-size="${fs - 1}">◂ gemessen</text>`);
  if (t1 - jt > 30) T2.push(`<text class="st-ax st-klein" x="${x2(jt) + 3}" y="${o6 - 26}" font-size="${fs - 1}">Prognose ▸</text>`);
  const kj = K.find((k2) => k2[0] === jt) || K[K.length - 1];
  T2.push(`<circle class="st-pkt" cx="${x2(kj[0])}" cy="${y3(kj[1])}" r="3.5"></circle><text class="st-wert" x="${x2(kj[0]) + (S3.laeuft ? -6 : 5)}" y="${y3(kj[1]) - 7}" text-anchor="${S3.laeuft ? "end" : "start"}" font-size="${fs}">${grad(kj[1])}°</text>`);
  T2.push(`<circle class="st-pkt kalt" cx="${x2(bg)}" cy="${y3(S3.innen_start)}" r="3.5"></circle><text class="st-wert" x="${x2(bg) + 5}" y="${y3(S3.innen_start) + 4}" font-size="${fs}">${S3.laeuft ? "" : "≈ "}${grad(S3.innen_start)}°</text>`);
  T2.push(`<circle class="st-pkt warm" cx="${x2(wm)}" cy="${y3(S3.soll)}" r="3.5"></circle><text class="st-ax st-fett" x="${x2(wm)}" y="${o6 - 8}" text-anchor="middle" font-size="${fs}">warm ${S3.warm}</text>`);
  T2.push(`<line class="st-achse" x1="${l4}" x2="${r5}" y1="${u3}" y2="${u3}"></line>`);
  const gesetzt = [];
  for (const [m3, t5, an, kl] of [[bg, `${S3.beginn} Start`, "middle", "st-fett"], [ab, S3.arbeitsbeginn, "end", ""], [t0, S3.achse_ab || uhrMin(t0), "start", ""]]) {
    if (gesetzt.some((g2) => Math.abs(x2(g2) - x2(m3)) < 70)) continue;
    gesetzt.push(m3);
    T2.push(`<line class="st-tick" x1="${x2(m3)}" x2="${x2(m3)}" y1="${u3}" y2="${u3 + 4}"></line><text class="st-ax ${kl}" x="${x2(m3)}" y="${u3 + 16}" text-anchor="${an}" font-size="${fs}">${t5}</text>`);
  }
  return `<svg class="st-svg" viewBox="0 0 ${W} ${H2}" width="100%" role="img" aria-label="Innen- und Außentemperatur bis zum Arbeitsbeginn">${T2.join("")}</svg>`;
}
function startAbschnitt(p4, b3) {
  const S3 = b3 && b3.start;
  if (!S3) return A;
  const kopf5 = b2`<div class="gruppe-t st-gt">So rechnet der Start</div>
    <div class="st-ergebnis ${S3.begrenzt ? "amber" : ""}"><span>${S3.laeuft ? b2`Heizt seit <b>${S3.beginn}</b> · warm um <b>≈ ${S3.warm}</b>` : b2`Start <b>${S3.tag_t} ${S3.beginn}</b> · warm um <b>${S3.begrenzt ? "≈ " : ""}${S3.warm}</b>`}</span>
      ${S3.geschaetzt ? b2`<span class="st-m st-m-ges">≈ noch geschätzt</span>` : A}${S3.begrenzt ? b2`<span class="st-m st-m-amb">Grenze erreicht</span>` : A}</div>`;
  const legende2 = b2`<div class="st-leg"><span><i class="st-l-gem"></i>gemessen</span><span><i class="st-l-prog"></i>Prognose</span><span><i class="st-l-kalt"></i>kühlt ab</span><span><i class="st-l-warm"></i>heizt</span><span><i class="st-l-aus"></i>außen je Stunde (Vorhersage)</span></div>`;
  const kacheln2 = b2`<div class="st-zahlen">${(S3.schritte || []).map((z2) => b2`<div class="st-z ${z2.ton || ""} ${z2.k === "kuehl" ? "breit" : ""}" data-k=${z2.k}><span class="st-t">${z2.t}</span><b>${z2.wert}</b><span class="st-r">${z2.rechnung}</span>${marke(z2)}</div>`)}</div>`;
  return b2`<div class="st-ab" data-start=${S3.tag}>${kopf5}<div class="st-kurve">${o5(startKurveSvg(S3, !!p4.narrow))}</div>${legende2}${kacheln2}
    ${S3.geschaetzt ? b2`<div class="leise st-fuss">Noch nicht gelernt: geschätzt ${S3.schaetz_grund}, mit Reserve. Nach ein paar Nächten lernt er τ, nach 3 gemessenen Aufheizungen die Rate.</div>` : A}
    <div class="leise st-fuss">↻ Rechnet bei jedem neuen Messwert und jeder neuen Vorhersage nach; weicht das Auskühlen ab, lernt er τ nach · Stand ${S3.jetzt} · Regelung, „Jetzt“ und „Plan“ zeigen dieselbe Rechnung</div></div>`;
}
var START_STIL = `
@container (min-width: 641px) { .ck-d .ckd-gruppen .ckd-g[data-g="Plan"] { grid-column: span 2; } }   /* Plan-Chip mit Tag und zwei Uhrzeiten: zwei Spalten breit */
.st-link { border: 0; background: none; padding: 0; font: inherit; color: var(--blau); cursor: pointer; white-space: nowrap; }
.st-stand { opacity: .8; }
.st-mini { font-size: 10.5px; padding: 0 5px; border-radius: 5px; border: 1px dashed var(--amber); color: var(--amber); margin-left: 2px; }
.st-ab { margin: 4px 0 14px; padding: 12px 14px; border-radius: 14px; background: rgba(120,120,128,.12); display: flex; flex-direction: column; gap: 8px; }
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
}`;

// src/ansichten/einblendungen-container.js
var GRIFF3 = b2`<div class="griff"></div>`;
var LAEDT3 = b2`<div class="leer">Lädt …</div>`;
var knopf2 = (t5, fn, art = "") => b2`<button class="knopf ${art}" @click=${fn}>${t5}</button>`;
var ZEITRAEUME = ["Tag", "Woche", "Monat", "Jahr"];
var leistungTeil = (x2, laufend) => b2`<div class="kennz"><div><b>${de(x2.mittel / 1e3, 2)}</b><span>kW im Mittel</span></div><div><b>${de(x2.spitze / 1e3, 2)}</b><span>kW Spitze</span></div><div><b>${x2.messwerte}</b><span>Messwerte</span></div></div>
        <div class="chart-wrap">${o5(x2.chart)}</div>
        <div class="legende">${x2.zeige.map((r5) => b2`<span><i style="background:${r5.farbe}"></i>${r5.name}</span>`)}<span class="leise">jeder Messwert des Shellys${laufend ? " · bis jetzt" : ""}</span></div>`;
function leistungEinblendung(p4, s4) {
  const L2 = p4.leistungDaten(s4);
  if (!L2) return A;
  const stunde = (e6) => {
    const h3 = Math.min(+e6.target.value, L2.max);
    if (s4.h !== h3) {
      s4.h = h3;
      p4.neuZeichnen();
    }
  };
  const art = (k2) => {
    s4.lart = k2;
    p4.neuZeichnen();
  };
  const daten = L2.zustand === "ohne" ? b2`<div class="leer">Kein Leistungssensor an den Geräten</div>` : L2.zustand === "laedt" ? L2.letzt ? b2`<div class="lh-laedt">${leistungTeil(L2.letzt, L2.letzt.laufend)}</div>` : LAEDT3 : leistungTeil(L2.daten, L2.laufend);
  return b2`${GRIFF3}<div class="block-kopf"><h3>Leistung · ${L2.b.name}</h3><span class="leise lh-wert">${L2.wert}</span></div>
      <div class="seg">${[["stunde", "Stunde"], ["tag", "Tag"]].map(([k2, t5]) => b2`<button data-v=${k2} class=${(L2.ganzerTag ? "tag" : "stunde") === k2 ? "on" : ""} @click=${() => art(k2)}>${t5}</button>`)}</div>
      ${zeitraumVorlage(p4, "sheet", "Tag", p4.zrGrenze())}${L2.ganzerTag ? A : b2`<div class="lh-regler" style="--spur:${L2.spur}">
        <input type="range" min="0" max="23" step="1" value=${L2.h} .value=${l3(String(L2.h))} data-lh aria-label="Stunde wählen" @input=${stunde} @change=${stunde}>
        <div class="lh-skala">${[0, 6, 12, 18, 23].map((k2) => b2`<span style="left:${(k2 / 23 * 100).toFixed(1)}%">${k2 === 23 ? "23" : L2.hh(k2)}</span>`)}</div></div>`}<div class="lh-daten">${daten}</div>
    ${knopf2("Schließen", () => p4.schliessen())}`;
}
function heizzeitEinblendung(p4, s4) {
  const H2 = p4.heizzeitDaten(s4);
  if (!H2) return A;
  const { b: b3, z: z2 } = H2, seg = b2`<div class="seg">${ZEITRAEUME.map((x2) => b2`<button data-v=${x2} class=${x2 === z2 ? "on" : ""} @click=${() => p4.zeitraumWahl("sheet", x2)}>${x2}</button>`)}</div>
      ${zeitraumVorlage(p4, "sheet", z2, p4.zrGrenze())}`;
  if (H2.strom) return b2`${GRIFF3}<div class="block-kopf"><h3>Heizzeit · ${b3.name}</h3><span class="leise">${H2.text}</span></div>
      ${seg}
      <div class="kennz"><div><b>${zahl(H2.su) ? de(H2.su, 1) : "–"}</b><span>h eingeschaltet</span></div><div><b>${zahl(H2.ss) ? de(H2.ss, 1) : "–"}</b><span>h tatsächlich geheizt</span></div>
        <div><b>${zahl(H2.su) && H2.su > 0 && zahl(H2.ss) ? `${de(Math.min(100, H2.ss / H2.su * 100), 0)} %` : "–"}</b><span>davon mit Strom</span></div></div>
      <div class="leise">h ${H2.je} · ${H2.text}</div>
      <div class="chart-wrap">${H2.chart ? o5(H2.chart) : LAEDT3}</div>
      <div class="leise">Eingeschaltet = der Shelly ist an. Tatsächlich geheizt = es fließt Strom (über ${p4.d.e.zieht_w} W) – schaltet der Thermostat am Heizkörper ab, ist der Shelly an, geheizt wird aber nicht. Ohne Leistungssensor gilt die Schaltzeit. „Tatsächlich geheizt“ wird ab 0.8.29 gezählt.</div>${knopf2("Schließen", () => p4.schliessen())}`;
  return b2`${GRIFF3}<div class="block-kopf"><h3>${b3.pumpe ? "Pumpzeit" : "Heizzeit"} · ${b3.name}</h3><span class="leise">${H2.text}</span></div>
      ${seg}
      <div class="kennz"><div><b>${zahl(H2.su) ? de(H2.su, 1) : "–"}</b><span>Stunden ${b3.pumpe ? "gepumpt" : "geheizt"}</span></div><div><b>${H2.r ? de(Math.max(...H2.r, 0), 1) : "–"}</b><span>h am meisten ${H2.je}</span></div></div>
      <div class="leise">h ${H2.je} · ${H2.text}</div>
      <div class="chart-wrap">${H2.chart ? o5(H2.chart) : LAEDT3}</div>${knopf2("Schließen", () => p4.schliessen())}`;
}
function bedarfEinblendung(p4, s4) {
  const b3 = p4.d.bereiche.find((x2) => x2.id === s4.cid);
  if (!b3) {
    p4.s.sheet = null;
    return A;
  }
  const ende = p4.arbeitsende(), warm = b3.t !== null ? Math.max(0, Math.round((p4.sollVon(b3) - b3.t) * 4)) : null;
  return b2`${GRIFF3}<h3>${b3.name} heizen</h3><div class="leise">Jetzt ${b3.t !== null ? `${de(b3.t)} °C` : "ohne Fühler"} · wird ${b3.t !== null ? `in etwa ${warm} min warm` : "sofort eingeschaltet"}</div>
        <div class="zeile"><div><b>⚡ Schnell aufheizen</b><div class="leise">alle Heizkörper zugleich, Vorrang in der Staffelung</div></div>${schalterVorlage(s4.boost, () => {
    s4.boost = !s4.boost;
    p4.neuZeichnen();
  }, "vor-ort")}</div>
        <div class="bedarf-dauer gross">${[["60", "1 Stunde"], ["120", "2 Stunden"], ...ende ? [["ende", `bis Arbeitsende (${ende})`]] : [], ["abend", "bis 19:00"]].map(([v2, t5]) => b2`<button class="knopf" data-v=${v2} @click=${() => p4.bedarfAn(b3.id, v2)}>▶ ${t5}</button>`)}</div>
        <button class="zeile nur-admin" @click=${p4.nurAdmin(() => p4.einblenden("termin", { id: b3.id }))}><span class="blau">Lieber einen Termin eintragen</span><span class="chev">›</span></button>
        ${knopf2("Abbrechen", () => p4.schliessen(), "leise-k")}`;
}
function terminEinblendung(p4, s4) {
  const f3 = s4.form, kal = p4.d.termineKal, feld3 = (k2) => (e6) => {
    f3[k2] = e6.target.value;
  };
  const eingabe = (k2, typ = A, ph = A) => b2`<input type=${typ} value=${f3[k2]} .value=${l3(f3[k2])} placeholder=${ph} data-tm=${k2} @input=${feld3(k2)}>`;
  return b2`${GRIFF3}<h3>Termin eintragen</h3>
        <label class="feld">Titel${eingabe("titel", A, "z. B. Baubesprechung")}</label>
        <label class="feld">${f3.wieder === "einmal" ? "Tag" : "Ab (Wochentag gilt für die Serie)"}${eingabe("datum", "date")}</label>
        <div class="zeile"><span>Wiederholen</span><div class="seg klein">${Object.entries(WIEDER).map(([k2, t5]) => b2`<button data-v=${k2} class=${f3.wieder === k2 ? "on" : ""} @click=${() => {
    f3.wieder = k2;
    p4.neuZeichnen();
  }}>${t5}</button>`)}</div></div>
        <div class="zeile"><div><b>⚡ Schnell aufheizen</b><div class="leise">vor dem Termin alle Heizkörper zugleich</div></div>${schalterVorlage(f3.boost, () => {
    f3.boost = !f3.boost;
    p4.neuZeichnen();
  }, "vor-ort")}</div>
        <div class="raster-2"><label class="feld">von${eingabe("von", "time")}</label><label class="feld">bis${eingabe("bis", "time")}</label></div>
        ${f3.wieder !== "einmal" && f3.datum ? b2`<div class="leise">Serie: ${WIEDER[f3.wieder]} am ${wtag(f3.datum)} ab ${datum(f3.datum)}</div>` : A}
        <div class="leise">Kommt in den HA-Kalender „${kal ? p4.name(kal) : "Termine"}“ (Serien als Wiederholung im Kalender). Die Heizung startet ${p4.d.e.vorheizen} min vorher (Vorheizen) und hört zum Ende auf.</div>
        ${knopf2("Eintragen", p4.nurAdmin(() => p4.terminSpeichern()), "amber nur-admin")}${knopf2("Abbrechen", () => p4.schliessen(), "leise-k")}`;
}
function lernenEinblendung(p4, s4) {
  const b3 = p4.b, l4 = b3 && b3.lern;
  if (!l4) {
    p4.s.sheet = null;
    return A;
  }
  const kalt = (s4.lk || "kalt") === "kalt", soll2 = p4.sollVon(b3), bd = kalt ? "kalt" : "mild";
  const balkenK = (name2, k2) => b2`<div class="zeile"><div><b>${name2}</b> ${de(k2.wert, 3)} <span class="leise">(Start ${de(k2.start, 2)})</span>
          <div class="lern-fort"><i style="width:${Math.round(k2.fort * 100)}%"></i></div></div><span class="leise">${k2.fort >= 1 ? "gelernt" : `${Math.round(k2.fort * 50)}/50 Zyklen`}</span></div>`;
  const zelle = (art, kl) => {
    const z2 = (l4.nachlauf || {})[`${art}|${kl}|${bd}`];
    return z2 && z2.n ? b2`<b>+${de(z2.grad)} °C</b><span class="leise">${de(z2.min, 0)} min · ${z2.n}×</span>` : b2`<span class="leise">noch nicht gelernt</span>`;
  };
  const tr = l4.treffer || [], mittel = tr.length ? tr.reduce((x2, y3) => x2 + Math.abs(y3), 0) / tr.length : null, offen = p4.offenText(b3);
  return b2`${GRIFF3}<div class="block-kopf"><h3>Lernstand · ${b3.name}</h3><span class="leise">${l4.zyklen} Heizzyklen gemessen</span></div>
        ${offen ? b2`<div class="wa-heute">${offen}. Laufende Messungen sind verworfen; gelernt wird wieder 10 min, nachdem es vorbei ist.</div>` : A}
        ${startAbschnitt(p4, b3)}
        <div class="gruppe-t">Regelung (TPI, ${l4.zyklus_min}-min-Zyklen)</div>
        ${balkenK("K innen – Trägheit des Raums", l4.kint)}${balkenK("K außen – Wärmeverlust nach außen", l4.kext)}
        <div class="leise">Einschaltanteil = K innen × (Soll − innen − Nachlauf) + K außen × (Soll − außen)</div>
        ${o5(p4.aufheizTeil(b3))}
        <div class="block-kopf"><div class="gruppe-t">Nachlauf nach dem Ausschalten</div><div class="seg klein">${[["kalt", "kalt < 5 °C"], ["mild", "mild"]].map(([k2, t5]) => b2`<button data-v=${k2} class=${(s4.lk || "kalt") === k2 ? "on" : ""} @click=${() => {
    s4.lk = k2;
    p4.neuZeichnen();
  }}>${t5}</button>`)}</div></div>
        <div class="lern-tab"><span></span><b>mit Ölradiator</b><b>nur Konvektor</b>
          ${[["kurz", "< 15 min"], ["mittel", "15–45 min"], ["lang", "> 45 min"]].map(([kl, t5]) => b2`<span>${t5}</span><div>${zelle("oel", kl)}</div><div>${zelle("konvektor", kl)}</div>`)}</div>
        <div class="leise">Wie weit die Temperatur nach dem Ausschalten noch steigt und wann die Spitze kommt, je nach Heizdauer davor. Zwei Heizkörper zählen mit ihrer Summe.</div>
        <div class="gruppe-t">Soll getroffen · letzte Zyklen (Soll ${de(soll2)} °C)</div>
        ${tr.length ? b2`<div class="lern-treffer">${tr.map((x2) => b2`<span class=${Math.abs(x2) <= 0.3 ? "gut" : ""}>${x2 >= 0 ? "+" : "−"}${de(Math.abs(x2))}</span>`)}<b>Ø ±${de(mittel)} °C</b></div>` : b2`<div class="leer">Noch keine Messung – der erste Wert kommt nach dem nächsten Ausschalten</div>`}
        ${b2`<button class="knopf rot nur-admin" @click=${p4.nurAdmin(() => p4.lernZuruecksetzen(b3))}>Lernstand zurücksetzen</button>`}${knopf2("Schließen", () => p4.schliessen(), "leise-k")}`;
}
var CONTAINER_EINBLENDUNGEN = { leistung: leistungEinblendung, "heizzeit-c": heizzeitEinblendung, bedarf: bedarfEinblendung, termin: terminEinblendung, lernen: lernenEinblendung };

// src/ansichten/heizung.js
var LAEDT4 = b2`<div class="leer">Lädt …</div>`;
var ACHSE = b2`<div class="tl-achse">${["04", "08", "12", "16", "20"].map((h3) => b2`<span>${h3}</span>`)}</div>`;
var grad2 = (v2) => `${de(v2, 1)} °C`;
var min = (v2) => `${v2} min`;
var minus = (v2) => `${de(v2, 0).replace("-", "−")} °C`;
var mm = (v2) => `${de(v2, 1)} mm`;
var kopf2 = (p4) => kopfVorlage("Heizung", p4.d.titel, b2`<div>${schalterVorlage(p4.d.e.auto, () => p4.automatikUmschalten())}</div>`);
function held(p4) {
  const d3 = p4.d, e6 = d3.e, H2 = p4.z.HEUTE, pl = p4.planTag(p4.z.HEUTE_TAG), hg = d3.heizgrenze || {}, pm = d3.plan[plusTage(H2, 1)], L2 = p4.last(), status = p4.statusText();
  const chips = [
    !e6.auto ? "⏸ Automatik aus" : "",
    pl ? `🕖 ${uhr(pl.a)}–${uhr(pl.b)}` : b2`🕖 ${o5(p4.freiText(H2))}`,
    hg.zu_warm ? "🌡 zu warm – kein Heizen" : "",
    pl && pl.codes.includes("trocknen") ? `🌧 trocknen +${e6.tr_laenger} min` : "",
    pl && pl.codes.includes("fruehstart") ? "❄ Frühstart heute" : pm && (pm.gruende || []).includes("fruehstart") ? "❄ Frühstart morgen" : "",
    e6.staffel && L2.warten ? `⚡ ${L2.warten} wartet` : "",
    d3.jetztBis ? `♨ alle heizen bis ${d3.jetztBis}` : ""
  ].filter(Boolean);
  return b2`<div class="glas-panel hz-held klickbar" data-k="heute" role="button" tabindex="0" @click=${() => p4.hzAuf("heute")}>
      <div class="hz-held-kopf"><div><div class="glas-klein">HEUTE · ${p4.z.HEUTE_TAG} ${kurzDatum(H2)}</div><div class="hz-status ${/heizt|♨/.test(status) ? "an" : ""}">${status}</div></div><span class="chev">›</span></div>
      <div class="tl">${o5(p4.zeitstrahl(pl, true))}${ACHSE}</div>
      ${chips.length ? b2`<div class="hz-chips">${chips.map((c4) => b2`<span class="hz-chip">${c4}</span>`)}</div>` : A}</div>`;
}
function heizungVorlage(p4) {
  const k2 = p4.hzKurz(), heuteNr = TAGE.indexOf(p4.z.HEUTE_TAG), max = Math.max(1, ...k2.woche);
  const kachel = (id, sym, titel2, wert2, unter, extra = A) => b2`<button class="glas-panel hz-kachel" data-k=${id} @click=${() => p4.hzAuf(id)}>
      <span class="hz-k-kopf"><span class="hz-sym">${sym}</span><span class="chev">›</span></span>
      <span class="hz-k-titel">${titel2}</span><b class="hz-k-wert">${wert2}</b>${extra}<span class="leise hz-k-unter">${unter || ""}</span></button>`;
  const mini = b2`<span class="hz-mini">${k2.woche.map((h3, i7) => b2`<i style="height:${Math.max(3, h3 / max * 100)}%" class=${i7 === heuteNr ? "heute" : ""}></i>`)}</span>`;
  return b2`${kopf2(p4)}${held(p4)}
      <div class="hz-raster">
        ${kachel("plan", "📅", "Diese Woche", k2.plan, "Heizplan aus Arbeitszeit und Wetter", mini)}
        ${kachel("wann", "🔥", "Wann heizt was", k2.wann, "gemessen je Heizkörper")}
        ${kachel("container", "🏠", "Container", k2.container, k2.container2)}
        ${kachel("az", "👷", "Arbeitszeit", k2.az, k2.az2)}
        ${kachel("ausn", "✳️", "Ausnahmen", k2.ausn, k2.ausn2)}
        ${kachel("regeln", "⚙️", "Regeln", k2.regeln, k2.regeln2)}
        ${kachel("trocknen", "👕", "Kleidung trocknen", k2.trocknen, k2.trocknen2)}
        ${kachel("urlaub", "🏖", "Urlaub & Feiertage", k2.urlaub, k2.urlaub2)}
      </div>`;
}
function heute(p4, cls) {
  const d3 = p4.d, e6 = d3.e, pl = p4.planTag(p4.z.HEUTE_TAG), az = p4.azJetzt, hg = d3.heizgrenze || {}, w2 = d3.wetter || {};
  const bezug = zahl(hg.bezug) ? hg.bezug : e6.basis === "jetzt" ? w2.aussen : w2.aussen_max;
  const ft = p4.feiertage(), naechster = ft && ft[0], morgen = plusTage(p4.z.HEUTE, 1), wm = p4.wetterTag(morgen), pm = d3.plan[morgen];
  const regel = (ic, titel2, text2, an) => b2`<div class="hr-zeile ${an ? "an" : ""}"><span class="hr-ic">${ic}</span><div><b>${titel2}</b><div class="leise">${text2}</div></div><span class="hr-an">${an ? "●" : "○"}</span></div>`;
  const C2 = d3.bereiche.filter((b3) => !b3.pumpe), lernend = C2.filter((b3) => b3.lern && b3.lern.warm);
  const freiT = e6.urlaub === "absenk" ? `heute abgesenkt auf ${de(e6.absenk)} °C (mit Fühler), sonst Frostschutz` : e6.urlaub === "aus" ? "heute alles aus – auch kein Frostschutz" : "heute nur Frostschutz";
  const frei = { urlaub: ["Urlaub", freiT], feiertag: ["Feiertag", freiT] }[d3.status], feiertagsKal = d3.optionen.feiertag_kalender;
  const L2 = e6.staffel ? p4.last() : null;
  return b2`<div class=${cls}><div class="block-kopf"><b>Heute</b><span class="leise">welche Regeln greifen</span></div>
        ${regel("🕖", `Arbeitszeit ${pl ? `${uhr(pl.a)}–${uhr(pl.b)}` : "frei"}`, `${az ? `„${az.name}“` : "keine Arbeitszeit"} · heizt ${pl ? `${uhr(pl.extra)}–${uhr(pl.ende)}` : "nicht"}`, !!pl)}
        ${pl ? b2`<div class="zeile unter hz-rechnung"><span class="leise">${p4.planRechnung(pl)}</span></div>` : A}
        ${lernend.map((b3) => b2`<div class="zeile unter"><span class="leise">🧠 <b>${b3.name}</b>: ${p4.warmText(b3)}</span></div>`)}
        ${regel("🌡", `Heizgrenze ${de(e6.grenze, 0)} °C`, zahl(bezug) ? `${e6.basis === "jetzt" ? "jetzt" : "Höchstwert heute"} ${de(bezug, 0)} °C → ${hg.zu_warm ?? bezug > e6.grenze ? "zu warm, es wird nicht geheizt" : "es wird geheizt"}` : "kein Wert vom Wetter", !(hg.zu_warm ?? (zahl(bezug) && bezug > e6.grenze)))}
        ${regel("🌧", "Kleidung trocknen", zahl(w2.regen_heute) ? `${de(w2.regen_heute, w2.regen_heute % 1 ? 1 : 0)} mm Regen seit gestern (ab ${de(e6.tr_mm)} mm) → ${w2.regen_heute >= e6.tr_mm ? `${e6.tr_laenger} min länger, bis ${pl ? uhr(pl.ende) : "–"}` : "nicht nötig"}` : "kein Regenwert vom Wetter", zahl(w2.regen_heute) && w2.regen_heute >= e6.tr_mm)}
        ${regel("❄", "Kälte-Frühstart morgen", zahl(wm.kalt) ? `${de(wm.kalt).replace("-", "−")} °C erwartet (unter ${de(e6.frueh_temp, 0).replace("-", "−")} °C) → ${wm.kalt < e6.frueh_temp ? `${e6.frueh_min} min früher` : "nicht nötig"}${pm && (pm.gruende || []).includes("frueher_nach_regen") ? `, dazu ${e6.tr_frueher} min nach Regen` : ""}` : "noch keine Vorhersage für morgen", e6.fruehstart && zahl(wm.kalt) && wm.kalt < e6.frueh_temp)}
        ${L2 ? regel("⚡", `Staffelung: ${L2.laufen} von ${L2.hk.length} Heizkörpern`, `${L2.warten ? `${L2.warten} wartet, weil ein Anschluss ausgelastet ist` : "alle haben Platz"} · höchstens ${e6.max_gleich} gleichzeitig · Vorheizen startet 15 min früher, damit alle warm werden`, true) : A}
        ${frei ? regel("🏖", frei[0], frei[1], true) : regel("🏖", "Kein Urlaub, kein Feiertag", naechster ? `nächster Feiertag ${wtag(naechster.von)} ${kurzDatum(naechster.von)} ${naechster.name}` : feiertagsKal ? ft === null ? "Feiertage laden …" : "kein Feiertag im Kalender" : "kein Feiertagskalender gewählt", false)}</div>`;
}
function wann(p4, cls) {
  const art = p4.s.hzArt || "tag", tag = p4.s.hzTag || p4.z.HEUTE_TAG, C2 = p4.d.bereiche.filter((b3) => !b3.pumpe);
  const A2 = 4 * 60, B2 = 21 * 60, x2 = (m3) => Math.max(0, Math.min(100, (m3 - A2) / (B2 - A2) * 100)), breite = (a3, b3) => Math.max(0, x2(b3) - x2(a3));
  const std = (segs) => segs.reduce((a3, q) => a3 + (q[1] - q[0]), 0) / 60, HZ = (b3) => b3.geraete.filter((g2) => g2.heizer);
  const ohne = (b3) => b2`<div class="hz-c"><span class="hz-cn">${b3.name}</span><span class="leise hz-cp">noch kein Heizkörper</span></div>
      <div class="hz-ohne"><button class="chip glas-panel" data-id=${b3.id} @click=${() => p4.containerOeffnen(b3.id)}>+ Heizkörper zuordnen</button></div>`;
  const tagNr = TAGE.indexOf(tag), heuteNr = TAGE.indexOf(p4.z.HEUTE_TAG), jetzt = minu(p4.z.JETZT);
  const setze = (a3, t5) => {
    if (t5) p4.s.hzTag = t5;
    if (a3) p4.s.hzArt = a3;
    p4.neuZeichnen();
  };
  p4.mess = p4.messung();
  const k2 = b2`<div class="block-kopf"><b>Wann welche Heizung heizt</b><div class="seg klein">${[["tag", "Tag"], ["woche", "Woche"]].map(([kk, t5]) => b2`<button data-v=${kk} class=${art === kk ? "on" : ""} @click=${() => setze(kk)}>${t5}</button>`)}</div></div>`;
  if (p4.mess === null) return b2`<div class=${cls}>${k2}${LAEDT4}</div>`;
  let inhalt;
  if (!C2.length) inhalt = b2`<div class="leer">Keine Container</div>`;
  else if (art === "tag") {
    const zukunft = tagNr > heuteNr, h3 = tagNr === heuteNr;
    inhalt = b2`<div class="vb-wer">${p4.z.WOCHE.map(([t5, dd]) => b2`<button data-v=${t5} class=${t5 === tag ? "on" : ""} @click=${() => setze(null, t5)}>${t5 === p4.z.HEUTE_TAG ? "heute" : t5} ${dd.slice(0, 2)}.</button>`)}</div>
        <div class="leise">${zukunft ? "Noch nichts gemessen – blass der Plan." : h3 ? "Bis jetzt gemessen, danach blass der Plan." : "Gemessen an der Leistung: kräftig = zieht Strom (über 50 W)."}</div>
        <div class="hz-tag">${C2.map((b3) => {
      if (!HZ(b3).length) return ohne(b3);
      const plan2 = p4.heizzeiten(b3, tag), ph = std(plan2);
      return b2`<div class="hz-c"><span class="hz-cn">${b3.name}${b3.bedarf ? b2` <span class="leise">bei Bedarf</span>` : A}${b3.offline ? b2` <span class="rot-t">offline</span>` : A}</span><span class="leise hz-cp">${ph ? `${de(ph)} h geplant` : b3.bedarf ? "kein Termin" : !b3.auto ? "Hand" : "frei"}</span></div>
            ${HZ(b3).map((g2) => {
        const a3 = p4.aktiv(b3, g2, tag), ah = std(a3.an);
        return b2`<div class="hz-zeile"><span class="hz-n hz-g">${g2.n}</span>
                <div class="tl-spur hz">${plan2.map((q) => b2`<i class="hz-plan ${!zukunft && (!h3 || q[1] <= jetzt) ? "vorbei" : ""}" style="left:${x2(q[0])}%;width:${breite(q[0], q[1])}%"></i>`)}
                  ${zukunft ? A : a3.an.map((q) => b2`<i class="hz-an" style="left:${x2(q[0])}%;width:${breite(q[0], q[1])}%"></i>`)}
                  ${a3.off.map((q) => b2`<i class="hz-off" style="left:${x2(q[0])}%;width:${breite(q[0], q[1])}%"></i>`)}
                  ${h3 ? b2`<i class="tl-jetzt" style="left:${x2(jetzt)}%"></i>` : A}</div>
                <span class="hz-h">${zukunft ? "–" : `${de(ah)} h`}</span></div>`;
      })}`;
    })}
          <div class="hz-zeile achse"><span></span>${ACHSE}<span></span></div></div>
        <div class="hp-legende"><span><i class="hz-an"></i>zieht Strom</span><span><i class="hz-plan"></i>geplant</span><span><i class="hz-off"></i>offline</span><span class="leise">Lücken im Plan: Thermostat, Staffelung, Tür offen</span></div>`;
  } else {
    const zeilen = C2.flatMap((b3) => HZ(b3).length ? HZ(b3).map((g2) => ({ b: b3, g: g2, h: TAGE.map((t5, kk) => kk > heuteNr ? std(p4.heizzeiten(b3, t5)) : std(p4.aktiv(b3, g2, t5).an)) })) : [{ b: b3, g: null, h: null }]);
    const max = Math.max(...zeilen.flatMap((z2) => z2.h || []), 1);
    inhalt = b2`<div class="hz-woche"><div class="hz-wk"><span></span>${p4.z.WOCHE.map(([t5, dd]) => b2`<span class=${t5 === p4.z.HEUTE_TAG ? "heute" : ""}>${t5}<br><small>${dd.slice(0, 2)}.</small></span>`)}<span>Σ</span></div>
        ${zeilen.map(({ b: b3, g: g2, h: h3 }) => !g2 ? b2`<div class="hz-wz"><span class="hz-n">${b3.name}</span><button class="hz-wz-ohne leise" data-id=${b3.id} @click=${() => p4.containerOeffnen(b3.id)}>noch kein Heizkörper · zuordnen</button></div>` : b2`<div class="hz-wz"><span class="hz-n">${b3.name} <span class="leise">· ${g2.n}</span></span>${h3.map((v2, kk) => b2`<button class="hz-zelle ${kk > heuteNr ? "geplant" : ""}" data-v=${TAGE[kk]} style="--a:${v2 ? 0.15 + 0.75 * v2 / max : 0}" title="${b3.name} · ${g2.n} ${TAGE[kk]}: ${de(v2)} h ${kk > heuteNr ? "geplant" : "gemessen"}" @click=${() => setze("tag", TAGE[kk])}>${v2 ? de(v2, v2 % 1 ? 1 : 0) : ""}</button>`)}<b class="hz-sum">${de(h3.slice(0, heuteNr + 1).reduce((a3, v2) => a3 + v2, 0), 0)} h</b></div>`)}</div>
        <div class="leise">Stunden, in denen der Heizkörper Strom gezogen hat (heute bis jetzt); kommende Tage blass und kursiv = geplant. Σ = bisher gemessen. Tippen zeigt den Tag.</div>`;
  }
  return b2`<div class=${cls}>${k2}${inhalt}</div>`;
}
var plan = (p4, cls) => b2`<div class=${cls}><div class="block-kopf"><b>Heizplan · diese Woche</b><span class="leise">aus Arbeitszeit und Wetter</span></div>${o5(p4.heizplanInhalt())}</div>`;
function arbeitszeit(p4, cls) {
  const L2 = p4.azListe, jetzt = p4.azJetzt, neu = b2`<button class="zeile" @click=${() => p4.azNeu(p4.azJetzt)}><span class="blau">+ Neue Arbeitszeit ab …</span></button>`;
  if (!jetzt) return b2`<div class=${cls}><div class="block-kopf"><b>Arbeitszeit</b></div><div class="leise">Noch keine Arbeitszeit – ohne Arbeitszeit läuft nur der Frostschutz.</div>
      ${neu}</div>`;
  const geplant = L2.filter((a3) => a3.ab > p4.z.HEUTE), frueher = L2.filter((a3) => a3.ab < jetzt.ab).reverse(), idx = (a3) => p4.d.arbeitszeiten.indexOf(a3);
  const auf = (a3) => () => p4.einblenden("az", { i: idx(a3) });
  return b2`<div class=${cls}><div class="block-kopf"><b>Arbeitszeit</b><span class="badge gruen">${jetzt.ab <= p4.z.HEUTE ? "gilt seit" : "gilt ab"} ${datum(jetzt.ab)}</span></div>
      <div class="az-name">${jetzt.name}</div>
      ${jetzt.auto ? b2`<div class="leise">Automatisch angelegt – wird ersetzt, sobald du eine eigene Arbeitszeit speicherst (auch mit früherem Datum).</div>` : A}
      <button class="zeile" data-i=${idx(jetzt)} @click=${auf(jetzt)}><span class="blau">Bearbeiten oder löschen</span><span class="chev">›</span></button>
      ${TAGE.map((t5) => {
    const z2 = jetzt.tage[t5];
    return b2`<div class="zeile az ${t5 === p4.z.HEUTE_TAG ? "heute" : ""}"><b class="tag-n">${t5}</b>
        <span class="fenster">${z2 ? b2`<em>${z2[0]}–${z2[1]}</em>` : b2`<span class="leise">frei</span>`}</span><span class="leise">${z2 ? dauer(z2[0], z2[1]) : ""}</span></div>`;
  })}
      ${geplant.filter((a3) => a3 !== jetzt).map((a3) => b2`<button class="zeile" data-i=${idx(a3)} @click=${auf(a3)}><span><span class="badge blau-b">geplant</span> ab ${datum(a3.ab)} · ${a3.name}</span><span class="chev">›</span></button>`)}
      ${frueher.length ? b2`<button class="zeile" @click=${() => {
    p4.s.azAlt = !p4.s.azAlt;
    p4.neuZeichnen();
  }}><span>Frühere Arbeitszeiten (${frueher.length})</span><span class="chev">${p4.s.azAlt ? "⌄" : "›"}</span></button>` : A}
      ${p4.s.azAlt ? frueher.map((a3) => b2`<button class="zeile unter" data-i=${idx(a3)} @click=${auf(a3)}><span>${datum(a3.ab)} · ${a3.name}</span><span class="leise">${a3.tage.Mo ? a3.tage.Mo.join("–") : ""} ›</span></button>`) : A}
      ${neu}</div>`;
}
function ausnahmen(p4, cls) {
  const H2 = p4.z.HEUTE, L2 = p4.d.ausnahmen.filter((a3) => a3.datum >= H2), tage = [...new Set(L2.map((a3) => a3.datum))].sort();
  const badge = (a3) => a3.art === "frei" ? A : b2`<span class="badge ${a3.art === "zeiten" ? "" : "blau-b"}">${AUSNAHME[a3.art]}</span>`;
  return b2`<div class=${cls}><div class="block-kopf"><b>Ausnahmen</b><span class="leise">einmalig – mehrere Zeitfenster je Tag möglich</span></div>
      <div class="bedarf-dauer">${[["heute-laenger", "+ Heute länger"], ["morgen-spaeter", "+ Morgen später"], ["samstag", "+ Samstag arbeiten"], ["frei", "+ Freier Tag"]].map(([k2, t5]) => b2`<button class="chip glas-panel" data-v=${k2} @click=${() => p4.ausnahmeNeu(k2)}>${t5}</button>`)}</div>
      ${tage.length ? tage.map((t5) => {
    const A2 = L2.filter((a3) => a3.datum === t5).sort((x2, y3) => (x2.von || "").localeCompare(y3.von || "")), frei = A2.some((a3) => a3.art === "frei"), pl = p4.planIso(t5);
    const az = p4.azJetzt && p4.azJetzt.tage[wtag(t5)], basis = !frei && !A2.some((a3) => a3.art === "zeiten") && az ? b2`<div class="am-fenster leise">${az.join("–")} laut Arbeitszeit</div>` : A;
    return b2`<div class="am-tag"><div class="am-tag-kopf"><b>${wtag(t5)} ${kurzDatum(t5)}</b>${frei ? b2`<span class="badge">frei</span>` : A}</div>${basis}
          ${A2.map((a3) => b2`<div class="am-fenster">${a3.art === "frei" ? b2`<b>frei</b>` : b2`<b>${a3.von}–${a3.bis}</b>`} ${badge(a3)}${a3.notiz ? b2` <span class="leise">${a3.notiz}</span>` : A}
            <button class="x nur-admin" title="dieses Zeitfenster löschen" @click=${p4.nurAdmin(() => p4.ausnahmeWeg(a3))}>✕</button></div>`)}
          ${frei || !pl ? A : b2`<div class="am-strahl">${o5(p4.zeitstrahl(pl, t5 === H2))}<div class="tl-achse"><span>04</span><span>12</span><span>20</span></div></div>
            <div class="am-hinweis">${p4.planFensterText(pl)}</div>`}
          ${frei ? A : b2`<button class="zeile" data-d=${t5} @click=${() => p4.ausnahmeDazu(t5)}><span class="blau">+ weiteres Zeitfenster an diesem Tag</span></button>`}</div>`;
  }) : b2`<div class="leise">Keine Ausnahmen</div>`}
      <button class="zeile" @click=${() => p4.ausnahmeNeu("")}><span class="blau">+ Ausnahme für einen anderen Tag</span></button></div>`;
}
function soll(p4, z2, st) {
  const e6 = p4.d.e, G = p4.d.sollG, gl = e6.soll_art === "gleitend", f3 = (v2) => `${v2 >= 0 ? "+" : "−"}${de(Math.abs(v2), 1)} °C`;
  const k2 = z2(
    "🌡 Solltemperatur",
    "für Container mit Fühler; ohne Fühler regelt der Heizkörperthermostat",
    b2`<div class="seg klein">${[["fest", "fest"], ["gleitend", "gleitend"]].map(([kk, t5]) => b2`<button data-v=${kk} class=${e6.soll_art === kk ? "on" : ""} @click=${() => p4.einstellungWert("soll_art", kk)}>${t5}</button>`)}</div>`
  );
  if (!gl) return b2`${k2}${z2("Soll", "", st("soll", 0.5, grad2), true)}`;
  const heute2 = !G ? b2`<div class="leise">Noch keine Außentemperatur – bis dahin gilt das feste Soll.</div>` : b2`<div class="sg-heute"><span>Grundwert („mindestens“)${e6.gleit_min >= 21 ? " – Aufenthaltsräume (§ 36 BauV)" : ""}</span><b>${grad2(e6.gleit_min)}</b>
        <span>kalte Tage: Außenmittel der letzten ${G.tage} Tage ${de(G.aussen_mittel, 1)} °C</span><b>${f3(G.start - e6.gleit_min)}</b>
        <span>dein Gefühl: ${G.n} ${G.n === 1 ? "Rückmeldung" : "Rückmeldungen"} bei ähnlichem Wetter (je ${de(G.schritt, 2)} °C)</span><b>${f3(G.gefuehl)}</b>
        <span class="summe">Soll heute</span><b class="summe">${grad2(G.soll)}</b></div>${o5(p4.sollKurve(G))}`;
  return b2`${k2}${heute2}${z2("mindestens", e6.gleit_min < 21 ? b2`<span class="amber-t">unter 21 °C – § 36 BauV verlangt für Aufenthaltsräume 21 °C</span>` : "nie darunter (§ 36 BauV: Aufenthaltsräume 21 °C)", st("gleit_min", 0.5, grad2), true)}${z2("höchstens", "", st("gleit_max", 0.5, grad2), true)}${z2("wärmer je Grad kälter draußen", `unter ${de(e6.gleit_bezug, 0)} °C Außenmittel`, st("gleit_je", 0.05, (v2) => `+${de(v2, 2)} °C`), true)}${z2("ab Außenmittel unter", "", st("gleit_bezug", 1, (v2) => `${de(v2, 0)} °C`), true)}${z2("Außenmittel über", "wie EN 16798-1: jüngere Tage zählen mehr", st("gleit_tage", 1, (v2) => `${v2} ${v2 === 1 ? "Tag" : "Tage"}`), true)}${z2("dein Gefühl", "„zu kalt / passt / zu warm“ und + / − im Container verschieben das Soll bei ähnlichem Wetter, höchstens ±1,5 °C", b2`<button class="rv-link" @click=${() => p4.gefuehlVergessen()}>vergessen</button>`, true)}<div class="leise">Ein eigenes Soll im Container gilt als Verschiebung gegenüber dem der Baustelle (Je Container).</div>`;
}
function regelnInhalt(p4) {
  const e6 = p4.d.e, C2 = p4.d.bereiche.filter((b3) => !b3.pumpe), lernend = C2.filter((b3) => b3.lern && b3.lern.warm), st = (k2, s4, fmt) => stepperVorlage(p4, k2, s4, fmt);
  const z2 = (titel2, text2, ctrl, unter, r5) => b2`<div class="zeile${unter ? " unter" : ""}" data-r=${r5 || A}><div>${unter ? b2`<span>${titel2}</span>` : b2`<b>${titel2}</b>`}${text2 ? b2`<div class="leise">${text2}</div>` : A}</div>${ctrl || A}</div>`;
  const link = (fn) => b2`<button class="rv-link" @click=${fn}>ändern ›</button>`;
  const nichtLern = lernend.length ? b2` · <i>nicht für lernende Container</i>` : A, bool = (k2) => schalterVorlage(e6[k2], () => p4.einstellungUmschalten(k2));
  const R2 = {
    vorheizen: z2("Vorheizen", b2`vor Arbeitsbeginn, damit es warm ist${nichtLern}`, st("vorheizen", 5, min), false, "vorheizen"),
    frueh: b2`${z2("Kälte-Frühstart", b2`unter ${minus(e6.frueh_temp)} zusätzlich früher${nichtLern}`, bool("fruehstart"), false, "fruehstart")}${e6.fruehstart ? b2`${z2("wenn morgens kälter als", "", st("frueh_temp", 1, minus), true)}${z2("so viel früher", "", st("frueh_min", 5, min), true)}` : A}`,
    lernend: z2("🧠 Lernende Container", `heizen selbst so früh, dass das Soll rechtzeitig erreicht ist – statt Vorheizen, Kälte-Frühstart und Nachheizen. Bis genug gelernt ist, gelten die Werte oben.${lernend.length ? ` Jetzt: ${lernend.map((b3) => b3.name).join(", ")}.` : " Gilt für Container mit Fühler, Modus Thermostat und lernender Regelung."}`, ""),
    warm_vor: z2("Soll erreicht", "vor Arbeitsbeginn, z. B. zum Umziehen", st("warm_vor", 5, (v2) => v2 ? `${v2} min vorher` : "bei Beginn"), true),
    warm_max: z2("Frühestens", "vor Arbeitsbeginn – Grenze, falls der Raum sehr kalt ist", st("warm_max", 15, (v2) => `${v2} min vorher`), true),
    soll: soll(p4, z2, st),
    toleranz: z2("Schaltabstand ± um das Soll", "Thermostat: ein unter Soll − Abstand, aus über Soll + Abstand", st("toleranz", 0.1, (v2) => `± ${de(v2, 1)} °C`), true),
    grenze: z2("Heizgrenze", "nicht heizen, wenn es wärmer ist", st("grenze", 0.5, grad2)),
    basis: z2("Grundlage", "", b2`<div class="seg klein">${["jetzt", "Tageshöchstwert"].map((v2) => b2`<button data-v=${v2} class=${e6.basis === v2 ? "on" : ""} @click=${() => p4.heizgrenzeBasis(v2)}>${v2}</button>`)}</div>`, true),
    boost: z2("⚡ Schnell aufheizen", "alle Heizkörper eines Containers zugleich, Vorrang in der Staffelung – bis zum Soll, ohne Fühler für", st("boost_min", 5, min)),
    zusatz: !C2.some((b3) => b3.geraete.filter((g2) => g2.heizer).length >= 2) ? A : b2`${z2("🔥 Zusatz-Heizkörper", `in Containern mit „Zusatz nur bei Bedarf“: zuerst heizt einer, der Zusatz kommt dazu, wenn …${(() => {
      const n4 = C2.filter((b3) => b3.stufenAn);
      return n4.length ? ` Jetzt: ${n4.map((b3) => b3.name).join(", ")}.` : " Einschalten im Container unter Bearbeiten.";
    })()}`, "")}${z2("… der Raum weiter unter dem Soll ist als", "", st("stufen_abstand", 0.5, grad2), true)}${z2("… einer schon so lange läuft", "", st("stufen_min", 5, min), true)}${z2("… und es dabei weniger wärmer wurde als", "", st("stufen_anstieg", 0.1, (v2) => `${de(v2)} °C`), true)}${z2("… es draußen kälter ist als (beide von Anfang an)", "", st("stufen_kalt", 1, minus), true)}`,
    tuer: b2`${z2("🚪 Tür offen", "Heizung pausieren nach", st("tuer_pause", 1, min), false, "tuer")}${z2("Nachricht nach", "", st("tuer_melden", 5, min), true)}`,
    nachheizen: z2("Nachheizen", b2`nach Arbeitsende, jeden Tag${nichtLern}`, st("nachheizen", 5, min), false, "nachheizen"),
    warm_nach: z2("Warm halten (lernende)", "nach Arbeitsende; Kleidung trocknen kommt dazu", st("warm_nach", 5, (v2) => v2 ? `${v2} min länger` : "bis Ende"), true),
    trocknen: z2("👕 Kleidung trocknen", `ab ${de(e6.tr_mm, 1)} mm Regen: +${e6.tr_laenger} min nach dem Nachheizen, am Morgen ${e6.tr_frueher} min früher`, link(() => p4.hzAuf("trocknen"))),
    hand: z2("✋ Handbetrieb übernehmen nach", "Läuft ein Heizkörper zu lange von Hand, kommt eine Nachricht – ohne „So lassen“ übernimmt die Automatik so viel später", st("hand_nachfrist", 5, min)),
    frost: b2`${z2("❄ Frostschutz", "hält jeden Container über der Grenze, auch außerhalb der Arbeitszeit", bool("frost"), false, "frost")}${e6.frost ? b2`${z2("ein unter", "", st("frost_temp", 0.5, grad2), true)}${z2("aus über", "", st("frost_aus", 0.5, grad2), true)}${z2("ohne Fühler: ein, wenn draußen unter", "aus erst 2 °C darüber; der Heizkörperthermostat regelt dann selbst", e6.frost_aussen === null ? b2`<span class="leise">aus</span>` : st("frost_aussen", 1, minus), true)}${z2("auch bei Automatik aus", "schaltet dann nur den Frostschutz, sonst nichts", bool("frost_immer"), true)}` : A}`,
    urlaub: z2("🏖 Urlaub & freie Feiertage", { frost: "nur Frostschutz", absenk: `absenken auf ${de(e6.absenk)} °C`, aus: "alles aus" }[e6.urlaub], link(() => p4.hzAuf("urlaub"))),
    zieht: z2("Heizt tatsächlich ab", "Leistung, ab der ein Heizkörper als „heizt“ zählt – Heizzeit geheizt, Heiztage, Warm ab, Lernen, Wann heizt was", st("zieht_w", 5, (v2) => `${v2} W`)),
    fuehler: z2("🌡 Fühler ohne Wert", "meldet ein Fühler nichts, gilt sein letzter Wert noch so lange – danach regelt der Container wie ohne Fühler", st("fuehler_halten", 5, min)),
    staffel: z2("⚡ Staffelung", e6.staffel ? `${e6.nutzbar} % je Anschluss nutzbar · höchstens ${e6.max_gleich} gleichzeitig · mindestens ${e6.min_lauf} min an, ${e6.min_pause} min Pause` : "aus – alle Heizkörper dürfen zugleich", link(() => p4.einstGruppe("strom")))
  };
  const karte = (ic, titel2, unter, teile) => b2`<div class="rv-kopf"><b>${ic} ${titel2}</b><span class="leise">${unter}</span></div><div class="rv-karte">${teile.map((k2) => R2[k2])}</div>`;
  const FEST = [
    ["Außentemperatur ohne Wert", "6 h", "der letzte Außenwert gilt noch so lange (Heizgrenze, Frostschutz ohne Fühler)"],
    ["Frostschutz ohne Fühler aus", "+2 °C", "über der Außen-Grenze, damit er nicht dauernd ein- und ausschaltet"],
    ["„Schaltet sich selbst ein“", "3× in 10 min", "so oft musste die Automatik ein Gerät ausschalten – dann Störung statt Protokoll jede Minute"],
    ["Lernen: Takt", "10 min, mind. 2 min ein", "Thermostat lernend: Anteil je Takt; kürzere Pulse lohnen nicht"],
    ["Lernen: Aufheizen zählt", "ab 1 °C unter Soll, ≥ 20 min, ≥ 0,5 °C", "so wird die Aufheizrate gemessen; ab 3 Messungen je Außenband rechnet der Container selbst"],
    ["Lernen: kalt / mild", "unter 5 °C außen", "Aufheizraten getrennt nach kaltem und mildem Wetter"],
    ["Tür vermutlich offen", "−0,3 °C in 10 min", "beim Heizen, während es draußen kaum kälter wurde – danach 10 min nichts lernen"]
  ];
  return b2`${karte("🌅", "Vor der Arbeit", "warm, wenn es losgeht", ["vorheizen", "frueh", "lernend", "warm_vor", "warm_max"])}${karte("👷", "In der Arbeitszeit", "auf das Soll halten", ["soll", "toleranz", "grenze", "basis", "boost", "zusatz", "tuer"])}${karte("🌇", "Nach der Arbeit", "warm halten, trocknen, übernehmen", ["nachheizen", "warm_nach", "trocknen", "hand"])}${karte("🌙", "Nachts, frei, Urlaub", "nur Frostschutz", ["frost", "urlaub"])}${karte("⏱", "Immer", "Messung und Strom", ["zieht", "fuehler", "staffel"])}<div class="rv-kopf"><b>📐 Feste Regeln</b><span class="leise">bewährte Schwellen, nicht änderbar</span></div><div class="rv-karte">${FEST.map(([t5, w2, x2]) => b2`<div class="rv-fest"><span>${t5}</span><b>${w2}</b><div class="leise">${x2}</div></div>`)}</div>${o5(erkl(e6.erklaer, "Vorheizen und Nachheizen gelten jeden Arbeitstag. Die Verlängerungen zählen zusammen: vor der Arbeit Vorheizen + Kälte-Frühstart + früher nach Regen, danach Nachheizen + Kleidung trocknen (AN-0003). Die Heizgrenze verhindert Heizen an warmen Tagen. Der Frostschutz springt unter „ein“ an und hört erst über „aus“ wieder auf, damit der Heizkörper nicht dauernd ein- und ausschaltet."))}`;
}
var regeln = (p4, cls) => b2`<div class=${cls}><div class="block-kopf"><b>So wird geheizt</b><span class="leise">nach Tagesablauf</span></div>
        ${regelnInhalt(p4)}</div>`;
function trocknen(p4, cls) {
  const st = (k2, s4, fmt) => stepperVorlage(p4, k2, s4, fmt);
  return b2`<div class=${cls}><div class="block-kopf"><b>👕 Kleidung trocknen</b><span class="leise">nach Regen zusätzlich zum Nachheizen</span></div>
        <div class="zeile"><span>ab Regen (seit gestern)</span>${st("tr_mm", 0.5, mm)}</div>
        <div class="zeile"><span>zusätzlich nach dem Nachheizen</span>${st("tr_laenger", 5, min)}</div>
        <div class="zeile"><span>am nächsten Morgen früher</span>${st("tr_frueher", 5, min)}</div></div>`;
}
function jeContainer(p4, cls) {
  const e6 = p4.d.e, C2 = p4.d.bereiche.filter((b3) => !b3.pumpe);
  return b2`<div class=${cls}><div class="block-kopf"><b>Je Container</b><span class="leise">Modus · Trocknen · Soll</span></div>
        ${C2.map((b3) => {
    const sl = p4.sollVon(b3);
    return b2`<div class="jc" data-id=${b3.id}><div class="jc-name"><b>${b3.name}</b><span class="leise">${b3.offline ? "offline" : b3.t !== null ? `🌡 ${de(b3.t)} °C` : "ohne Fühler"}</span></div>
            <div class="jc-ctrl"><select class="jc-modus nur-admin" .value=${l3(b3.modus)} title="Modus" aria-label="Modus ${b3.name}" @change=${p4.nurAdmin((ev) => p4.modusSetzen(b3, ev.target.value))}>${MODI.map(([k2, t5]) => b2`<option value=${k2} ?selected=${b3.modus === k2} ?disabled=${k2 === "thermo" && !b3.fuehler}>${t5}</option>`)}</select>
              <span class="jc-l">👕</span>${schalterVorlage(b3.trocknen, () => p4.trocknenUmschalten(b3), "klein")}
              ${b3.fuehler ? b2`<span class="stepper klein"><button data-d="-0.5" @click=${() => p4.containerSoll(b3, -0.5)}>−</button><b class=${b3.soll !== void 0 ? "eigen" : ""}>${de(sl)}°</b><button data-d="0.5" @click=${() => p4.containerSoll(b3, 0.5)}>+</button></span>` : b2`<span class="leise jc-th">Thermostat</span>`}</div></div>`;
  })}
        <div class="leise">Ein eigener Sollwert (bernstein) gilt nur für diesen Container, sonst gilt ${de(e6.soll)} °C.</div>
        ${o5(erkl(e6.erklaer, "Zeitplan: an in der Heizzeit, der Heizkörper regelt selbst. Thermostat: in der Heizzeit nach dem Fühler auf das Soll (nur mit Fühler). Bei Bedarf: nur per Schalter oder Termin. Hand: die Automatik schaltet nicht. Aus: nur Frostschutz."))}</div>`;
}
function urlaub(p4, cls) {
  const d3 = p4.d, e6 = d3.e, ft = p4.feiertage(), ur = p4.urlaube(), urlaubsKal = d3.optionen.urlaub_kalender, feiertagsKal = d3.optionen.feiertag_kalender;
  return b2`<div class=${cls}><div class="block-kopf"><b>Urlaub & Feiertage</b></div>
        <div class="zeile"><div><b>An Feiertagen frei</b><div class="leise">${feiertagsKal ? `Feiertage aus dem Kalender „${p4.name(feiertagsKal)}“` : "noch kein Feiertagskalender gewählt"}</div></div>${schalterVorlage(e6.feiertag_frei, () => p4.einstellungUmschalten("feiertag_frei"))}</div>
        <div class="zeile modus-z"><div><b>Im Urlaub und an freien Feiertagen</b><div class="leise">${{ frost: "nur Frostschutz", absenk: `mit Fühler auf ${de(e6.absenk)} °C halten, ohne Fühler nur Frostschutz`, aus: "alles aus – auch kein Frostschutz. Nur, wenn nichts einfrieren kann." }[e6.urlaub]}</div></div>
          <div class="seg klein">${[["frost", "nur Frostschutz"], ["absenk", "absenken"], ["aus", "alles aus"]].map(([k2, t5]) => b2`<button data-v=${k2} class=${e6.urlaub === k2 ? "on" : ""} @click=${() => p4.einstellungWert("urlaub", k2)}>${t5}</button>`)}</div></div>
        ${e6.urlaub === "absenk" ? b2`<div class="zeile unter"><span>absenken auf</span>${stepperVorlage(p4, "absenk", 0.5, grad2)}</div>` : A}
        ${ft === null ? b2`<div class="leise">Lädt …</div>` : ft.slice(0, 4).map((f3) => {
    const t5 = wtag(f3.von), we = t5 === "Sa" || t5 === "So";
    return b2`<div class="zeile unter"><span><b class="ft-d">${t5} ${kurzDatum(f3.von)}</b> ${f3.name}</span><span class="leise">${we ? "Wochenende" : "frei"}</span></div>`;
  })}
        <div class="gruppe-t">Urlaub · ${urlaubsKal ? `Kalender „${p4.name(urlaubsKal)}“` : "kein Kalender gewählt"}</div>
        ${ur === null ? b2`<div class="leise">Lädt …</div>` : ur.length ? ur.map((u3) => b2`<div class="zeile unter"><span><b>${u3.name}</b> <span class="leise">${kurzDatum(u3.von)} – ${datum(u3.bis)}</span></span><button class="x nur-admin" title="Urlaub löschen" @click=${p4.nurAdmin(() => p4.urlaubWeg(u3))}>✕</button></div>`) : b2`<div class="leise">Kein Urlaub eingetragen</div>`}
        <button class="zeile nur-admin" @click=${p4.nurAdmin(() => p4.einblenden(urlaubsKal ? "urlaub" : "wetterquelle"))}><span class="blau">${urlaubsKal ? "+ Urlaub eintragen" : "Kalender für Urlaub wählen"}</span></button></div>`;
}
var HZ_BLOECKE = { heute, wann, plan, az: arbeitszeit, ausn: ausnahmen, regeln, trocknen, container: jeContainer, urlaub };
var HZ_TITEL = {
  heute: ["🕖", "Heute"],
  wann: ["🔥", "Wann heizt was"],
  plan: ["📅", "Diese Woche"],
  az: ["👷", "Arbeitszeit"],
  ausn: ["✳️", "Ausnahmen"],
  regeln: ["⚙️", "Regeln"],
  trocknen: ["👕", "Kleidung trocknen"],
  container: ["🏠", "Container"],
  urlaub: ["🏖", "Urlaub & Feiertage"]
};
function hzEinblendung(p4, s4) {
  const k2 = HZ_TITEL[s4.k] ? s4.k : "heute", [sym, titel2] = HZ_TITEL[k2], cls = "block hz-innen";
  const inhalt = k2 === "heute" ? b2`${heute(p4, cls)}${wann(p4, cls)}` : k2 === "az" ? b2`${arbeitszeit(p4, cls)}${ausnahmen(p4, cls)}` : HZ_BLOECKE[k2](p4, cls);
  return b2`<div class="griff"></div><div class="block-kopf"><h3>${sym} ${titel2}</h3></div>${inhalt}<button class="knopf" @click=${() => p4.schliessen()}>Schließen</button>`;
}

// src/ansichten/einblendungen-heizung.js
var GRIFF4 = b2`<div class="griff"></div>`;
var knopf3 = (t5, fn, art = "") => b2`<button class="knopf ${art}" @click=${fn}>${t5}</button>`;
var feld = (ziel2, k2, typ, attr, nach) => b2`<input type=${typ || A} value=${ziel2[k2]} .value=${l3(ziel2[k2])} placeholder=${attr.ph || A} data-f=${attr.marke || k2} @input=${(e6) => {
  ziel2[k2] = e6.target.value;
  if (nach) nach();
}}>`;
function heizplanEinblendung(p4) {
  const d3 = p4.d, az = p4.azJetzt;
  return b2`${GRIFF4}<div class="block-kopf"><h3>Heizplan · diese Woche</h3><span class="leise">${az ? `${az.name} · seit ${datum(az.ab)}` : "keine Arbeitszeit"}</span></div>
        ${d3.e.auto ? A : b2`<div class="warn-k"><b>Automatik ist aus</b><div class="leise">Der Plan wird gerade nicht ausgeführt.</div></div>`}
        ${o5(p4.heizplanInhalt())}
        <div class="bedarf-dauer">${d3.jetztBis ? b2`<button class="chip glas-panel amber" @click=${() => p4.jetztHeizen(false)}>■ alle heizen bis ${d3.jetztBis} – beenden</button>` : b2`<button class="chip glas-panel" @click=${() => p4.jetztHeizen(true)}>▶ alle jetzt 1 h heizen</button>`}<button class="chip glas-panel" @click=${() => p4.ausnahmeNeu("")}>+ Ausnahme</button></div>
        ${knopf3("Arbeitszeit ändern", () => p4.gehe("heizung"), "amber")}${knopf3("Schließen", () => p4.schliessen(), "leise-k")}`;
}
function arbeitszeitEinblendung(p4, s4) {
  const d3 = p4.d, a3 = d3.arbeitszeiten[s4.i];
  if (!a3) {
    p4.s.sheet = null;
    return A;
  }
  const geplant = a3.ab > p4.z.HEUTE, aktuell = a3 === p4.azJetzt;
  return b2`${GRIFF4}<div class="block-kopf"><h3>${a3.name}</h3><span class="badge ${aktuell ? "gruen" : geplant ? "blau-b" : ""}">${aktuell ? "gilt jetzt" : geplant ? "geplant" : "früher"}</span></div>
        <div class="leise">gilt ab ${datum(a3.ab)}</div>
        ${TAGE.map((t5) => b2`<div class="zeile"><b class="tag-n">${t5}</b><span>${a3.tage[t5] ? a3.tage[t5].join("–") : b2`<span class="leise">frei</span>`}</span></div>`)}
        ${a3.auto ? b2`<div class="leise">Automatisch angelegt – wird durch deine erste eigene Arbeitszeit ersetzt.</div>` : A}
        ${knopf3("Bearbeiten", p4.nurAdmin(() => p4.azBearbeiten(a3)), "amber nur-admin")}${knopf3("Als Vorlage für eine neue", () => p4.azNeu(a3))}
        ${d3.arbeitszeiten.length > 1 ? knopf3("Löschen", p4.nurAdmin(() => p4.azWeg(a3)), "rot nur-admin") : b2`<div class="leise">Die letzte Arbeitszeit lässt sich nicht löschen – ohne Arbeitszeit liefe nur der Frostschutz.</div>`}${knopf3("Schließen", () => p4.schliessen(), "leise-k")}`;
}
function ausnahmeEinblendung(p4, s4) {
  const d3 = p4.d, f3 = s4.form, az = p4.azJetzt, z2 = az && az.tage[wtag(f3.datum)];
  const schon = d3.ausnahmen.filter((a3) => a3.datum === f3.datum), pl = schon.length ? p4.planIso(f3.datum) : null;
  return b2`${GRIFF4}<h3>Ausnahme</h3>
        <label class="feld">Tag${feld(f3, "datum", "date", { marke: "datum" }, () => p4.neuZeichnen())}</label>
        <div class="leise">${wtag(f3.datum)} ${kurzDatum(f3.datum)} · laut Arbeitszeit ${z2 ? z2.join("–") : "frei"}</div>
        <div class="seg">${Object.entries(AUSNAHME).map(([k2, t5]) => b2`<button data-v=${k2} class=${f3.art === k2 ? "on" : ""} @click=${() => {
    f3.art = k2;
    p4.neuZeichnen();
  }}>${t5}</button>`)}</div>
        ${f3.art === "frei" ? b2`<div class="leise">An diesem Tag wird nicht geheizt, nur der Frostschutz läuft.</div>` : b2`<div class="raster-2"><label class="feld">von${feld(f3, "von", "time", {})}</label><label class="feld">bis${feld(f3, "bis", "time", {})}</label></div>
          <div class="leise">Vorheizen ${d3.e.vorheizen} min und Nachheizen ${d3.e.nachheizen} min gelten auch hier – geheizt wird ${uhr(minu(f3.von) - d3.e.vorheizen)}–${uhr(minu(f3.bis) + d3.e.nachheizen)}.</div>`}
        ${!schon.length ? A : b2`<div class="am-schon">An diesem Tag schon eingetragen: ${schon.map((a3, i7) => b2`${i7 ? ", " : ""}<b>${a3.art === "frei" ? "frei" : `${a3.von}–${a3.bis}`}</b> ${AUSNAHME[a3.art]}`)}<br>
            ${f3.art === "frei" ? "„Frei“ ersetzt alle Zeitfenster dieses Tages." : "Das neue Fenster kommt dazu – nichts wird überschrieben. Grenzt es an die Arbeitszeit, verlängert es sie (mit Vor-/Nachheizen); sonst heizt es genau seine Zeit."}
            ${pl && f3.art !== "frei" ? b2`<div class="am-strahl" style="margin-left:0">${o5(p4.zeitstrahl(pl))}</div><div class="leise">bisher: ${p4.planFensterText(pl)}</div>` : A}</div>`}
        <label class="feld">Notiz${feld(f3, "notiz", null, { ph: "z. B. Betonieren" })}</label>
        ${knopf3("Speichern", p4.nurAdmin(() => p4.ausnahmeSpeichern()), "amber nur-admin")}${knopf3("Abbrechen", () => p4.schliessen(), "leise-k")}`;
}
function arbeitszeitNeuEinblendung(p4, s4) {
  const d3 = p4.d, f3 = s4.form, aendern = f3.alt_ab !== void 0, neu = () => p4.neuZeichnen();
  const zeit = (t5, i7) => b2`<input type="time" value=${f3.tage[t5][i7]} .value=${l3(f3.tage[t5][i7])} data-azt=${t5} data-p=${i7} @input=${(e6) => {
    f3.tage[t5][i7] = e6.target.value;
  }}>`;
  return b2`${GRIFF4}<h3>${aendern ? "Arbeitszeit bearbeiten" : "Neue Arbeitszeit"}</h3>
        <div class="raster-2"><label class="feld">Gilt ab${feld(f3, "ab", "date", {})}</label><label class="feld">Name${feld(f3, "name", null, { ph: "z. B. Winter" })}</label></div>
        ${TAGE.map((t5) => {
    const z2 = f3.tage[t5];
    return b2`<div class="zeile azn"><b class="tag-n">${t5}</b>${schalterVorlage(!!z2, () => {
      f3.tage[t5] = f3.tage[t5] ? null : [...f3.tage.Mo || ["07:00", "16:30"]];
      neu();
    })}
          ${z2 ? b2`${zeit(t5, 0)}<span class="leise">bis</span>${zeit(t5, 1)}` : b2`<span class="leise frei">frei</span>`}</div>`;
  })}
        <button class="zeile" @click=${() => {
    for (const t5 of ["Di", "Mi", "Do"]) f3.tage[t5] = f3.tage.Mo ? [...f3.tage.Mo] : null;
    neu();
  }}><span class="blau">Di–Do wie Montag</span></button>
        <div class="leise">${aendern ? "Es gilt immer die jüngste Arbeitszeit, die schon begonnen hat." : "Die bisherige Arbeitszeit bleibt gespeichert. Liegt das Datum in der Zukunft, gilt die neue automatisch ab diesem Tag."}
          ${d3.arbeitszeiten.some((x2) => x2.auto) ? " Die automatisch angelegte Arbeitszeit fällt beim Speichern weg." : ""}</div>
        ${knopf3("Speichern", p4.nurAdmin(() => p4.azSpeichern()), "amber nur-admin")}${knopf3("Abbrechen", () => p4.schliessen(), "leise-k")}`;
}
var HEIZUNG_EINBLENDUNGEN = { heizplan: heizplanEinblendung, az: arbeitszeitEinblendung, ausnahme: ausnahmeEinblendung, "az-neu": arbeitszeitNeuEinblendung };

// src/ansichten/einblendungen-baustelle.js
var GRIFF5 = b2`<div class="griff"></div>`;
var LAEDT5 = b2`<div class="leer">Lädt …</div>`;
var knopf4 = (t5, fn, art = "") => b2`<button class="knopf ${art}" @click=${fn}>${t5}</button>`;
var feld2 = (ziel2, k2, typ, ph, extra = {}) => b2`<input type=${typ || A} step=${extra.step || A} min=${extra.min ?? A} value=${ziel2[k2] ?? ""} .value=${l3(String(ziel2[k2] ?? ""))} placeholder=${ph || A} data-f=${k2} @input=${(e6) => {
  ziel2[k2] = e6.target.value;
}}>`;
var optionenVorlage = (liste2, aktuell, leer2) => b2`${leer2 ? b2`<option value="">${leer2}</option>` : A}${liste2.map(([v2, n4]) => b2`<option value=${v2} ?selected=${v2 === aktuell}>${n4}</option>`)}`;
var auswahl = (ziel2, k2, liste2, leer2) => {
  const setze = (e6) => {
    ziel2[k2] = e6.target.value;
  };
  return b2`<select data-f=${k2} @input=${setze} @change=${setze}>${optionenVorlage(liste2, ziel2[k2], leer2)}</select>`;
};
function preisListeVorlage(p4) {
  const e6 = p4.d.e, H2 = p4.z.HEUTE, L2 = (e6.preise.length ? e6.preise : [{ ab: null, preis: e6.preis }]).slice().sort((a3, b3) => String(b3.ab).localeCompare(String(a3.ab))), jetzt = L2.find((x2) => !x2.ab || x2.ab <= H2);
  return b2`<div class="gruppe-t">Strompreis</div>${L2.map((x2, i7) => {
    const bis = i7 && L2[i7 - 1].ab ? plusTage(L2[i7 - 1].ab, -1) : null;
    return b2`<div class="sp-zeile"><b>${de(x2.preis, 2)} €/kWh</b><span class="leise">${x2 === jetzt ? b2`<span class="badge gruen">gilt jetzt</span> ` : x2.ab > H2 ? b2`<span class="badge blau-b">geplant</span> ` : A}${x2.ab && x2.ab > "2000-01-01" ? `ab ${datum(x2.ab)}` : "bisher"}${bis ? ` bis ${datum(bis)}` : ""}</span>
        ${L2.length > 1 && x2.ab ? b2`<button class="x nur-admin" title="Preis löschen" @click=${p4.nurAdmin(() => p4.preisWeg(x2.ab))}>✕</button>` : A}</div>`;
  })}
      <button class="zeile" @click=${() => p4.preisNeu()}><span class="blau">+ Neuer Preis ab …</span></button>
      <div class="leise">Auswertung, Abrechnung nach Firma und CSV rechnen jeden Tag mit dem Preis, der an dem Tag galt. Ein neuer Preis ändert nichts an Vergangenem.</div>`;
}
function name(p4, s4) {
  return b2`${GRIFF5}<h3>${{ name: "Name", "baustelle-neu": "Neue Baustelle" }[s4.art] || ""}</h3>
      <label class="feld">Name${feld2(s4.form, "name", null, "z. B. Wohnbau Kalsdorf")}</label>
      ${knopf4("Speichern", p4.nurAdmin(() => s4.art === "name" ? p4.nameSpeichern() : p4.baustelleAnlegen()), "amber nur-admin")}`;
}
function zeitraum(p4, s4) {
  const f3 = s4.form, mon = (i7) => b2`<select data-f=${"hp" + i7} @input=${(e6) => {
    f3.hp[i7] = +e6.target.value;
  }} @change=${(e6) => {
    f3.hp[i7] = +e6.target.value;
  }}>${MONATE.map((m3, k2) => b2`<option value=${k2 + 1} ?selected=${f3.hp[i7] === k2 + 1}>${m3}</option>`)}</select>`;
  return b2`${GRIFF5}<h3>Beginn, Ende, Heizperiode</h3>
      <div class="raster-2"><label class="feld">Beginn${feld2(f3, "beginn", "date")}</label><label class="feld">Ende (geplant)${feld2(f3, "ende", "date")}</label></div>
      <div class="leise">Gezählt wird ab Beginn. <b>Beginn leer</b> = automatisch der Tag, an dem die Baustelle angelegt wurde${p4.d.beginnAuto && p4.d.beginn ? ` (${datum(p4.d.beginn)})` : ""}.
        <b>Ende leer</b> = offen; beim Abschließen wird immer der Tag des Abschließens eingetragen – ein geplantes Ende dient nur der Hochrechnung.</div>
      <div class="raster-2"><label class="feld">Heizperiode von${mon(0)}</label><label class="feld">bis${mon(1)}</label></div>
      <div class="leise">Die Auswertung rechnet Verbrauch und Kosten auf die Heizperiode hoch – bis zum Ende der Baustelle, wenn es früher liegt.</div>
      ${knopf4("Speichern", p4.nurAdmin(() => p4.zeitraumBsSpeichern()), "amber nur-admin")}${knopf4("Abbrechen", () => p4.schliessen(), "leise-k")}`;
}
function wetterquelle(p4, s4) {
  const f3 = s4.form, kal = p4.entitaeten((x2) => x2.entity_id.startsWith("calendar."));
  return b2`${GRIFF5}<h3>Wetter</h3>
        <label class="feld">Wetter${auswahl(f3, "wetter", p4.entitaeten((x2) => x2.entity_id.startsWith("weather.")), "– keins –")}</label>
        <label class="feld">Außentemperatur${auswahl(f3, "temp_sensor", p4.entitaeten((x2) => x2.entity_id.startsWith("sensor.") && x2.attributes.device_class === "temperature"), "aus der Vorhersage")}</label>
        <label class="feld">Regenmenge${auswahl(f3, "regen_sensor", p4.entitaeten((x2) => x2.entity_id.startsWith("sensor.") && x2.attributes.device_class === "precipitation"), "aus der Vorhersage")}</label>
        <div class="gruppe-t">Kalender</div>
        <label class="feld">Urlaub${auswahl(f3, "urlaub_kalender", kal, "– keiner –")}</label>
        <label class="feld">Feiertage${auswahl(f3, "feiertag_kalender", kal, "– keiner –")}</label>
        <label class="feld">Termine (Container nur bei Bedarf)${auswahl(f3, "termine_kalender", kal, "– keiner –")}</label>
        ${knopf4("Speichern", p4.nurAdmin(() => p4.wetterquelleSpeichern()), "amber nur-admin")}`;
}
var abschliessen = (p4) => b2`${GRIFF5}<h3>Baustelle abschließen?</h3><div class="leise">Die Heizung wird abgeschaltet. Als Ende wird heute (${datum(p4.z.HEUTE)}) eingetragen. Werte und Diagramme bleiben im Verlauf, gelöscht wird nichts.</div>${knopf4("Abschließen", p4.nurAdmin(() => p4.abschliessen()), "rot nur-admin")}${knopf4("Abbrechen", () => p4.schliessen(), "leise-k")}`;
function loeschen(p4, s4) {
  const x2 = p4.alle.find((y3) => y3.entry === s4.id);
  if (!x2) return b2`${GRIFF5}<h3>Baustelle löschen</h3><div class="leise">Diese Baustelle gibt es nicht mehr.</div>${knopf4("Schließen", () => p4.schliessen(), "leise-k")}`;
  return b2`${GRIFF5}<h3>„${x2.titel}“ löschen?</h3><div class="leise">Die Baustelle wird aus HA entfernt – mit Containern, Geräten, Einstellungen und Zählern. Sie steht danach auch nicht im Verlauf. Die Messwerte der Shellys bleiben in HA.${x2.aktiv ? " Wer die Werte behalten will, schließt die Baustelle stattdessen ab." : ""}</div>
        ${knopf4("Endgültig löschen", p4.nurAdmin(() => p4.bsLoeschen()), "rot nur-admin")}${knopf4("Abbrechen", () => p4.schliessen(), "leise-k")}`;
}
function urlaub2(p4, s4) {
  const d3 = p4.d;
  if (!d3.optionen.urlaub_kalender) return b2`${GRIFF5}<h3>Urlaub eintragen</h3><div class="leise">Zuerst einen Kalender für den Urlaub wählen.</div>${knopf4("Kalender wählen", p4.nurAdmin(() => p4.einblenden("wetterquelle")), "amber nur-admin")}${knopf4("Abbrechen", () => p4.schliessen(), "leise-k")}`;
  return b2`${GRIFF5}<h3>Urlaub eintragen</h3><label class="feld">Name${feld2(s4.form, "name", null, "z. B. Semesterferien")}</label>
      <div class="raster-2"><label class="feld">Von${feld2(s4.form, "von", "date")}</label><label class="feld">Bis${feld2(s4.form, "bis", "date")}</label></div>
      <div class="leise">Wird in den Kalender „${p4.name(d3.optionen.urlaub_kalender)}“ eingetragen; in der Zeit läuft nur der Frostschutz.</div>${knopf4("Eintragen", p4.nurAdmin(() => p4.urlaubSpeichern()), "amber nur-admin")}${knopf4("Abbrechen", () => p4.schliessen(), "leise-k")}`;
}
function bericht(p4) {
  const d3 = p4.d, e6 = d3.e, v2 = p4.berichtDaten();
  if (!v2) return b2`${GRIFF5}<h3>Bericht · Beispiel</h3>${v2 === void 0 ? LAEDT5 : b2`<div class="leer">Bericht nicht verfügbar</div>`}${knopf4("Schließen", () => p4.schliessen(), "leise-k")}`;
  const z2 = (a3, b3) => b2`<div class="mail-z"><span>${a3}</span>${b3 === void 0 ? A : b2`<span>${b3}</span>`}</div>`;
  return b2`${GRIFF5}<h3>Bericht · Beispiel</h3>
        <div class="mail"><div class="mail-kopf"><div><span class="leise">An</span> ${v2.mail_an ? v2.mail_an : "—"}</div><div><span class="leise">Betreff</span> ${v2.betreff}</div>
          ${v2.anhang ? b2`<div class="mail-anhang">📎 ${v2.anhang}</div>` : A}</div>
          <div class="mail-inhalt"><b>${v2.summe}</b> ${v2.vergleich ? b2`<span class="leise">${v2.vergleich}</span>` : A}
            <div class="mail-t">Je Firma</div>${(v2.firmen || []).length ? v2.firmen.map((f3) => z2(f3.name, `${de(f3.kwh, 0)} kWh · ${de(f3.eur, 2)} €`)) : z2("–")}
            <div class="mail-t">Je Container</div>${(v2.container || []).map((c4) => z2(c4.name, `${de(c4.kwh, 0)} kWh`))}
            <div class="mail-t">Heizung</div>${z2("Heiztage", zahl(v2.heiztage) ? v2.heiztage : "–")}${z2("gespart durch Automatik", zahl(v2.gespart_eur) ? `${de(v2.gespart_eur, 0)} €` : "–")}
            <div class="mail-t">Offene Warnungen</div>${(v2.warnungen || []).length ? v2.warnungen.map((w2) => z2(w2.bereich ? `${w2.bereich}: ${w2.titel}` : w2.titel)) : z2("keine")}</div></div>
        <div class="leise">${e6.bericht_handy ? "Aufs Handy kommt eine Kurzfassung (Summe, Kosten, Warnungen) mit Knopf „Bericht öffnen“. " : ""}Die E-Mail geht über einen Mail-Dienst in HA (Google Mail oder SMTP); die Zugangsdaten stehen in secrets.yaml.</div>
        ${knopf4("Schließen", () => p4.schliessen(), "leise-k")}`;
}
function nachrichten(p4) {
  const d3 = p4.d, B2 = d3.bereiche, c4 = (k2) => B2[k2] || B2[0] || { name: "Container", id: "" };
  const wOff = d3.warnungen.find((w2) => w2.art === "offline" && w2.b), GB = B2.flatMap((b3) => b3.geraete.map((g2) => ({ b: b3, g: g2 })));
  const off = wOff && B2.find((b3) => b3.id === wOff.b) || B2.find((b3) => b3.offline) || c4(0);
  const pumpe = B2.find((b3) => b3.pumpe), steck = GB.find((x2) => x2.g.hand && !x2.g.heizer) || GB.find((x2) => x2.g.hand) || GB.find((x2) => !x2.g.heizer && x2.g.rolle !== "pumpe");
  const n4 = (ic, titel2, text2, knoepfe) => b2`<div class="noti"><div class="noti-kopf"><span class="noti-app">🏗 Home Assistant · jetzt</span></div><b>${ic} ${titel2}</b><div>${text2}</div>
        ${d3.e.knoepfe ? b2`<div class="noti-knoepfe">${knoepfe.map((k2) => b2`<button @click=${() => p4.toast(`„${k2}“ – so reagierst du direkt aus der Nachricht`)}>${k2}</button>`)}</div>` : A}</div>`;
  const tuer = B2.find((b3) => b3.tuer && b3.tuer.offen) || B2.find((b3) => b3.tuer) || c4(0), pl = p4.planTag(TAGE[(TAGE.indexOf(p4.z.HEUTE_TAG) + 1) % 7]);
  const frueh = pl ? pl.vor - d3.e.frueh_min : null;
  return b2`${GRIFF5}<h3>Nachrichten aufs Handy</h3><div class="leise">So kommen sie in der Home-Assistant-App an. ${d3.e.knoepfe ? "Tippe einen Knopf zum Ausprobieren." : "Knöpfe sind ausgeschaltet."}</div>
        ${n4("⚠", `${off.name} nicht erreichbar`, "Seit 10:42 keine Antwort – Stromausfall oder Stecker gezogen?", ["Zum Container", "Bis morgen stumm"])}
        ${n4("🚪", `${tuer.name}: Tür seit ${d3.e.tuer_melden} min offen`, "Die Heizung ist pausiert und heizt wieder, sobald die Tür zu ist.", ["Trotzdem heizen", "1 h stumm"])}
        ${n4("❄", "Morgen −4 °C", `Vorheizen startet schon um ${pl ? uhr(frueh) : "05:30"}. Arbeitsbeginn ${pl ? uhr(pl.a) : "07:00"}.`, ["Morgen nicht heizen", `Noch früher (${pl ? uhr(frueh - 30) : "05:00"})`])}
        ${n4("✋", `${steck ? `${steck.g.n} ${steck.b.name}` : pumpe ? pumpe.name : c4(0).name} seit ${d3.e.hand_h} h auf Hand`, "Von Hand eingeschaltet und nicht zurückgestellt.", ["Automatik übernehmen", "So lassen"])}
        <div class="leise">Die Knöpfe sind Aktionen der HA-App (mobile_app). Ein Tipp löst die Aktion aus und landet im Protokoll.</div>${knopf4("Schließen", () => p4.schliessen(), "leise-k")}`;
}
var preisNeu = (p4, s4) => b2`${GRIFF5}<h3>Neuer Strompreis</h3><label class="feld">gilt ab${feld2(s4, "ab", "date")}</label>
        <label class="feld">Preis je kWh${feld2(s4, "preis", "number", null, { step: "0.01", min: "0" })}</label>
        <div class="leise">Bis zu diesem Tag gilt weiter der bisherige Preis – Vergangenes bleibt, wie es war.</div>${knopf4("Speichern", p4.nurAdmin(() => p4.preisSpeichern()), "amber nur-admin")}${knopf4("Abbrechen", () => p4.schliessen(), "leise-k")}`;
function bearbeiten(p4) {
  const d3 = p4.d, o6 = d3.optionen, auf = (art) => p4.nurAdmin(() => p4.einblenden(art));
  return b2`${GRIFF5}<div class="block-kopf"><h3>Baustelle bearbeiten</h3><span class="leise">${d3.titel}</span></div>
        <div class="gruppe-t">Baustelle</div>
        <button class="zeile nur-admin" @click=${auf("name")}><span>Name</span><span class="leise">${d3.titel} ›</span></button>
        <button class="zeile nur-admin" @click=${auf("zeitraum-bs")}><span>Beginn und Ende</span><span class="leise">${p4.bsZeit(d3)} ›</span></button>
        <button class="zeile nur-admin" @click=${auf("zeitraum-bs")}><span>Heizperiode</span><span class="leise">${MONATE[d3.hp[0] - 1]} – ${MONATE[d3.hp[1] - 1]} ›</span></button>
        <div class="gruppe-t">Ort</div>
        <button class="zeile nur-admin" @click=${auf("wetterquelle")}><span>Wetter</span><span class="leise">${o6.wetter ? p4.name(o6.wetter) : "keins gewählt"} ›</span></button>
        <button class="zeile nur-admin" @click=${auf("wetterquelle")}><span>Außentemperatur</span><span class="leise">${o6.temp_sensor ? p4.name(o6.temp_sensor) : "aus der Vorhersage"} ›</span></button>
        <div class="gruppe-t">Container und Geräte · ${d3.bereiche.length}</div>
        ${d3.bereiche.map((b3) => b2`<button class="zeile" data-id=${b3.id} @click=${() => p4.bereichEinst(b3.id)}><span><i class="farbpunkt" style="background:${BEREICH_FARBEN[b3.f % 6]}"></i>${b3.name}</span><span class="leise">${b3.geraete.length} ${b3.pumpe ? "Pumpen" : "Geräte"} ›</span></button>`)}
        <button class="zeile nur-admin" @click=${auf("container-neu")}><span class="blau">+ Container oder Schacht</span></button>
        <div class="gruppe-t">Strom und Abrechnung</div>
        ${preisListeVorlage(p4)}
        ${d3.firmen.map((f3) => {
    const n4 = d3.bereiche.filter((b3) => (b3.firma || "eigen") === f3.id).length;
    return b2`<button class="zeile" data-id=${f3.id} @click=${() => p4.firmaAuf(f3.id)}><span>${f3.name}${f3.eigen ? b2` <span class="badge">eigene</span>` : A}</span><span class="leise">${n4} Container ›</span></button>`;
  })}
        <button class="zeile" @click=${() => p4.firmaAuf()}><span class="blau">+ Firma hinzufügen</span></button>
        ${d3.aktiv ? b2`<button class="zeile" @click=${() => p4.einblenden("abschliessen")}><span>Baustelle abschließen</span><span class="leise">kommt in den Verlauf ›</span></button>` : A}
        <div class="leise p-fuss">Staffelung, Bericht, Meldungen und App stehen unter Einstellungen.</div>
        <button class="zeile" @click=${() => p4.gehe("einst")}><span class="blau">Alle Einstellungen</span><span class="chev">›</span></button>
        ${knopf4("Fertig", () => p4.schliessen(), "amber")}`;
}
var BAUSTELLE_EINBLENDUNGEN = { name, "baustelle-neu": name, "zeitraum-bs": zeitraum, wetterquelle, abschliessen, "bs-loeschen": loeschen, urlaub: urlaub2, bericht, nachrichten, "preis-neu": preisNeu, "bs-bearbeiten": bearbeiten };

// src/ansichten/notprogramm.js
var GRIFF6 = b2`<div class="griff"></div>`;
var knopf5 = (t5, fn, art = "") => b2`<button class="knopf ${art}" @click=${fn}>${t5}</button>`;
var chip2 = (p4, np) => ({
  bereit: b2`<span class="gruen-t">✓ bereit</span>`,
  not: b2`<span class="amber-t">⚠ Notbetrieb seit ${p4.npZeit(np.notbetrieb_seit, false)}</span>`,
  fehler: b2`<span class="rot-t">✕ ${np.fehler || "Fehler"}</span>`,
  offen: b2`<span class="leise">noch nicht geprüft</span>`,
  aus: b2`<span class="leise">aus</span>`
})[np.zustand] || A;
function npGruppeVorlage(p4) {
  const d3 = p4.d, P2 = p4.npPlugs(), an = !!d3.e.notprogramm, fehler = P2.filter((x2) => x2.np.zustand === "fehler").length, not = P2.filter((x2) => x2.np.zustand === "not").length;
  const kurz = !an ? "aus" : not ? `${not} im Notbetrieb` : fehler ? `${fehler} mit Fehler` : `${P2.length} ${P2.length === 1 ? "Plug" : "Plugs"} bereit`;
  const zeile3 = (x2) => b2`<button class="zeile" data-id=${x2.g.id} @click=${() => p4.npPlugAuf(x2.g.id)}><div><b>🛟 ${p4.name(x2.g.schalter) || x2.g.n}</b><div class="leise">${x2.b.name}${an ? ` · im Notbetrieb: ${p4.npModus(x2.np)}${x2.np.tuer ? " · Tür" : ""}` : ""}${an && x2.np.fuehler_fehlt ? b2` · <span class="amber-t">Fühler nicht am Plug – im Notbetrieb nur Zeitplan</span>` : A}</div></div>
      <span class="ger-z">${chip2(p4, x2.np)}${an && x2.np.bis ? b2`<div class="leise">Programm bis ${p4.npZeit(x2.np.bis)}</div>` : A}</span><span class="chev">›</span></button>`;
  const inhalt = () => b2`<div class="glas-panel liste"><div class="gruppe">Notprogramm in den Plugs</div>
        <div class="zeile"><div><b>Notprogramm</b><div class="leise">Fällt Home Assistant oder das Netz aus, heizen die Plugs nach dem Programm der nächsten 7 Tage weiter – nach 15 min ohne Lebenszeichen</div></div>${schalterVorlage(an, () => p4.einstellungUmschalten("notprogramm"))}</div>
        ${an ? b2`<div class="zeile"><div><b>Taste am Plug = 1 h heizen</b><div class="leise">Drücken heizt den Container 1 h (mit Fühler bis zum Soll), nochmal drücken beendet – auch ohne Home Assistant. Die Automatik übernimmt danach das Relais (kein Handbetrieb).</div></div>${schalterVorlage(d3.e.taste, () => p4.einstellungUmschalten("taste"))}</div>` : A}
        ${an ? b2`<button class="zeile" @click=${() => p4.npPruefen()}><div><span class="blau">${p4.s.npPrueft ? "⟳ prüft …" : "⟳ Jetzt prüfen"}</span><div class="leise">Skript, Kopplungen, Programm und Lebenszeichen an allen Plugs – sonst alle 5 min von selbst</div></div><span class="leise">zuletzt ${p4.npVor(d3.np && d3.np.geprueft)}</span></button>` : A}</div>
      <div class="glas-panel liste"><div class="gruppe">Heizungs-Plugs · ${P2.length}</div>${P2.length ? P2.map(zeile3) : b2`<div class="leer">Keine Heizkörper an Shelly-Plugs (Gen2 oder neuer)</div>`}</div>
      ${an && fehler ? b2`<div class="glas-panel liste"><div class="zeile"><div><b class="rot-t">⚠ ${fehler === 1 ? "Ein Plug nimmt" : `${fehler} Plugs nehmen`} das Programm nicht an</b><div class="leise">Fällt Home Assistant jetzt aus, heizt er nach dem zuletzt geladenen Programm bzw. danach nur Frostschutz. Nach 15 min auch unter Warnungen.</div></div></div></div>` : A}
      <div class="leise p-fuss">Im Notbetrieb gilt: kein Lernen, keine Heizgrenze, keine Staffelung – Thermostat nur, wenn der Fühler am Plug gekoppelt ist (die Integration koppelt Fühler und Tür des Containers selbst).</div>`;
  return { k: "notprogramm", ic: "🛟", t: "Notprogramm", kurz, inhalt };
}
function npPlugEinblendung(p4, s4) {
  const x2 = p4.npPlugs().find((y3) => y3.g.id === s4.id);
  if (!x2) return b2`${GRIFF6}<div class="leer">Plug nicht gefunden</div>${knopf5("Schließen", () => p4.schliessen())}`;
  const np = x2.np, z2 = (t5, w2) => b2`<div class="zeile"><span>${t5}</span><span class="leise">${w2}</span></div>`;
  const frost = zahl(np.frost_ein) ? `ein unter ${de(np.frost_ein)} °C, aus ab ${de(np.frost_aus)} °C` : "aus", an = p4.d.e.notprogramm;
  return b2`${GRIFF6}<div class="block-kopf"><h3>🛟 ${p4.name(x2.g.schalter) || x2.g.n}</h3></div><div class="leise" style="padding:0 4px 8px">${x2.b.name}</div>
      <div class="glas-panel liste">${z2("Zustand", chip2(p4, np))}${z2("Skript", np.version ? `Version ${np.version} · läuft` : "–")}${z2("Programm", np.bis ? `gültig bis ${p4.npZeit(np.bis)} · geladen` : np.programm ? "geladen · ohne Heizzeit in den nächsten 7 Tagen" : "–")}
        ${z2("Im Notbetrieb", p4.npModus(np))}${z2("Frostschutz", frost)}${z2("Fühler am Plug", np.fuehler ? `Messwert Nr. ${np.fuehler}` : np.fuehler_fehlt ? b2`<span class="amber-t">keiner – Zeitplan</span>` : "–")}
        ${z2("Türen/Fenster am Plug", np.tuer ? `✓ Messwert Nr. ${[].concat(np.tuer).join(", ")}` : "–")}${z2("Letzte Prüfung", p4.npVor(np.zuletzt))}</div>
      <div class="glas-panel liste"><div class="gruppe">Notbetrieb</div>${np.zustand === "not" ? z2("läuft seit", `${p4.npZeit(np.notbetrieb_seit)} · Home Assistant meldet sich nicht`) : A}
        ${z2("zuletzt", np.notbetrieb_zuletzt ? `${p4.npZeit(np.notbetrieb_zuletzt[0])} – ${p4.npZeit(np.notbetrieb_zuletzt[1], false)}` : "noch nie (seit dem Start von Home Assistant)")}</div>
      ${an ? b2`<div class="glas-panel liste"><div class="gruppe">Ausfall-Probe</div>
        <div class="zeile"><div class="leise">Home Assistant schickt dem Plug so lange kein Lebenszeichen und schaltet ihn nicht – nach 15 min übernimmt das Notprogramm. Danach vergleicht HA das Stundenbuch mit der eigenen Messung.</div></div>
        ${np.probe_bis ? b2`<div class="zeile"><span class="amber-t">⚗ Probe läuft bis ${p4.npZeit(np.probe_bis, false)}</span><button class="knopf klein" data-min="0" @click=${() => p4.npProbe(x2.g.id, 0)}>Beenden</button></div>` : b2`<div class="zeile"><span>Probe starten</span><div class="seg klein">${[30, 60, 120, 180].map((m3) => b2`<button data-min=${m3} @click=${() => p4.npProbe(x2.g.id, m3)}>${m3 < 60 ? m3 + " min" : m3 / 60 + " h"}</button>`)}</div></div>`}
        ${np.probe_ergebnis ? ((e6) => z2("Letzte Probe", `${p4.npZeit(e6.von)} – ${p4.npZeit(e6.bis, false)} · Stundenbuch ${de(e6.buch_kwh, 2)} kWh, ${e6.buch_min} min · HA ${de(e6.ha_kwh, 2)} kWh, ${e6.ha_min} min`))(np.probe_ergebnis) : A}</div>` : A}
      ${an ? knopf5(p4.s.npPrueft ? "⟳ prüft …" : "⟳ Jetzt prüfen", () => p4.npPruefen()) : A}${knopf5("Schließen", () => p4.schliessen())}`;
}

// src/ansichten/einstellungen.js
var liste = (titel2, inhalt) => b2`<div class="glas-panel liste"><div class="gruppe">${titel2}</div>${inhalt}</div>`;
var zeile2 = (t5, x2, sub = "") => b2`<div class="zeile"><div><b>${t5}</b>${sub ? b2`<div class="leise">${sub}</div>` : A}</div>${x2}</div>`;
var knopf6 = (t5, wert2, fn, cls = "") => b2`<button class="zeile ${cls}" @click=${fn}><span>${t5}</span><span class="leise">${wert2} ›</span></button>`;
function baustelle(p4) {
  const d3 = p4.d, e6 = d3.e, o6 = d3.optionen, nm = (x2) => x2 ? p4.name(x2) : "–", tk = o6.termine_kalender || e6.termine_kalender, auf = (art) => p4.nurAdmin(() => p4.einblenden(art));
  return b2`<div class="glas-panel liste"><div class="gruppe">Baustelle</div>
        <button class="zeile nur-admin" @click=${auf("name")}><span>Name</span><span class="leise">${d3.titel} ›</span></button>
        <button class="zeile nur-admin" @click=${auf("zeitraum-bs")}><span>Beginn und Ende</span><span class="leise">${p4.bsZeit(d3)} ›</span></button>
        <button class="zeile nur-admin" @click=${auf("zeitraum-bs")}><span>Heizperiode</span><span class="leise">${MONATE[d3.hp[0] - 1]} – ${MONATE[d3.hp[1] - 1]} ›</span></button>
        <button class="zeile" @click=${() => p4.einblenden("abschliessen")}><span>Baustelle abschließen</span><span class="leise">kommt in den Verlauf ›</span></button>
        <button class="zeile nur-admin" @click=${auf("baustelle-neu")}><span class="blau">+ Neue Baustelle</span></button></div>
      ${liste("Wetter und Kalender", b2`${knopf6("Wetter", o6.wetter ? nm(o6.wetter) : "keins gewählt", auf("wetterquelle"), "nur-admin")}${knopf6("Außentemperatur", o6.temp_sensor ? nm(o6.temp_sensor) : "aus der Vorhersage", auf("wetterquelle"), "nur-admin")}${knopf6("Regenmenge", o6.regen_sensor ? nm(o6.regen_sensor) : "aus der Vorhersage", auf("wetterquelle"), "nur-admin")}${knopf6("Urlaub", o6.urlaub_kalender ? `Kalender „${nm(o6.urlaub_kalender)}“` : "kein Kalender", auf("wetterquelle"), "nur-admin")}${knopf6("Feiertage", o6.feiertag_kalender ? nm(o6.feiertag_kalender) : "kein Kalender", auf("wetterquelle"), "nur-admin")}${knopf6("Termine (Bei Bedarf)", tk ? nm(tk) : "kein Kalender", auf("wetterquelle"), "nur-admin")}`)}`;
}
var heizung = (p4) => b2`${liste("Automatik", zeile2("Automatik", schalterVorlage(p4.d.e.auto, () => p4.automatikUmschalten()), "die Integration schaltet die Heizungen nach Plan und Regeln"))}${["regeln", "trocknen", "urlaub"].map((k2) => HZ_BLOECKE[k2](p4, "glas-panel block"))}${liste("Zeiten", b2`${knopf6("Arbeitszeit", "ändern, neue ab Datum", () => p4.hzAuf("az"))}${knopf6("Ausnahmen", "einmalig", () => p4.hzAuf("ausn"))}${knopf6("Heizplan · diese Woche", "ansehen", () => p4.hzAuf("plan"))}`)}`;
var container = (p4) => {
  const d3 = p4.d;
  return b2`<div class="glas-panel liste"><div class="gruppe">Container und Geräte</div>
        ${d3.bereiche.map((b3) => b2`<button class="zeile" data-id=${b3.id} @click=${() => p4.bereichEinst(b3.id)}><span><i class="farbpunkt" style="background:${BEREICH_FARBEN[b3.f % 6]}"></i>${b3.name}</span><span class="leise">${b3.geraete.length} ${b3.pumpe ? "Pumpen" : "Geräte"} ›</span></button>`)}
        <button class="zeile nur-admin" @click=${p4.nurAdmin(() => p4.einblenden("container-neu"))}><span class="blau">+ Container oder Schacht</span></button></div>${HZ_BLOECKE.container(p4, "glas-panel block")}`;
};
function pumpen(p4) {
  const st = (k2, s4, fmt) => stepperVorlage(p4, k2, s4, fmt), P2 = p4.d.bereiche.filter((b3) => b3.pumpe);
  return liste("Überwachung der Pumpen", b2`${zeile2("Offline – melden nach", st("offline_min", 1, (v2) => `${v2} min`))}${zeile2("Trockenlauf unter", st("trocken_w", 5, (v2) => `${v2} W`))}${zeile2("Dauerlauf länger als", st("dauer_min", 5, (v2) => `${v2} min`))}${zeile2("Schaltet oft ab", st("zyklen_h", 1, (v2) => `${v2} / h`))}${P2.map((b3) => zeile2(`♨ Automatik · ${b3.name}`, schalterVorlage(b3.auto, () => p4.bereichAuto(b3))))}`);
}
function strom(p4) {
  const d3 = p4.d, e6 = d3.e, st = (k2, s4, fmt) => stepperVorlage(p4, k2, s4, fmt);
  return b2`<div class="glas-panel liste"><div class="gruppe">Strom</div>
        ${preisListeVorlage(p4)}
        <div class="zeile"><div><b>⚡ Staffelung</b><div class="leise">verteilt die Heizungen auf den freien Strom – geschaltet werden nur Heizungen</div></div>${schalterVorlage(e6.staffel, () => p4.einstellungUmschalten("staffel"))}</div>
        ${e6.staffel ? b2`<div class="gruppe-t gt-einzug">Anschlüsse</div>
        ${d3.anschluesse.map((a3) => b2`<button class="zeile unter" data-id=${a3.id} @click=${() => p4.anschlussAuf(a3.id)}><div><b>${a3.name}</b><div class="leise">${a3.phasen === 3 ? "3 × " : ""}${a3.ampere} A · Reserve ${de(a3.reserve)} kW · ${d3.bereiche.filter((b3) => b3.anschluss === a3.id).map((b3) => b3.name).join(", ") || "keine Container"}</div></div><span class="chev">›</span></button>`)}
        <button class="zeile unter" @click=${() => p4.anschlussAuf()}><span class="blau">+ Anschluss hinzufügen</span></button>
        <div class="zeile unter"><div><span>Nutzbar je Anschluss</span><div class="leise">vorsichtig, weil unbekannt ist, welche Steckdose an welcher Phase hängt</div></div>${st("nutzbar", 5, (v2) => `${v2} %`)}</div>
        <div class="zeile unter"><span>Höchstens gleichzeitig</span>${st("max_gleich", 1, (v2) => `${v2} Heizk.`)}</div>
        <div class="zeile unter"><span>Mindestlaufzeit</span>${st("min_lauf", 1, (v2) => `${v2} min`)}</div>
        <div class="zeile unter"><span>Mindestpause</span>${st("min_pause", 1, (v2) => `${v2} min`)}</div>
        <div class="zeile unter"><div><span>Wechsel im Rundlauf</span><div class="leise">wenn nicht alle gleichzeitig dürfen</div></div>${st("takt", 5, (v2) => `${v2} min`)}</div>
        <div class="zeile unter"><span class="leise">Gesamtzähler: keiner – gerechnet wird mit den Shellys und der Reserve je Anschluss. Später kann je Anschluss ein Zähler dazukommen.</span></div>
        <div class="gruppe-t gt-einzug" data-r="vorrang">Vorrang, wenn nicht alle dürfen</div>
        ${d3.bereiche.filter((b3) => !b3.pumpe).map((b3) => b2`<div class="zeile unter"><span>${b3.name}</span><div class="seg klein">${["niedrig", "normal", "hoch"].map((v2) => b2`<button data-v=${v2} class=${(b3.prio || "normal") === v2 ? "on" : ""} @click=${() => p4.vorrang(b3, v2)}>${v2}</button>`)}</div></div>`)}
        <div class="leise p-fuss">Frostschutz geht immer vor. Pumpen und andere Verbraucher werden mitgezählt, aber nie geschaltet.</div>` : A}</div>`;
}
var firmen = (p4) => {
  const d3 = p4.d;
  return b2`<div class="glas-panel liste"><div class="gruppe">Firmen · für die Abrechnung</div>
        ${d3.firmen.map((f3) => {
    const n4 = d3.bereiche.filter((b3) => (b3.firma || "eigen") === f3.id).length;
    return b2`<button class="zeile" data-id=${f3.id} @click=${() => p4.firmaAuf(f3.id)}><span>${f3.name}${f3.eigen ? b2` <span class="badge">eigene</span>` : A}</span><span class="leise">${n4} Container ›</span></button>`;
  })}
        <button class="zeile" @click=${() => p4.firmaAuf()}><span class="blau">+ Firma hinzufügen</span></button></div>`;
};
function meldungen(p4) {
  const e6 = p4.d.e, st = (k2, s4, fmt) => stepperVorlage(p4, k2, s4, fmt), sw = (k2) => schalterVorlage(e6[k2], () => p4.einstellungUmschalten(k2));
  const m3 = (t5, k2) => b2`<div class="zeile"><span>${t5}</span>${sw(k2)}</div>`;
  return b2`<div class="glas-panel liste"><div class="gruppe">Meldungen · Störungen</div>
        <div class="zeile"><span>Empfänger</span><span class="leise">${e6.empfaenger}</span></div>
        <div class="zeile"><div><b>Knöpfe in der Nachricht</b><div class="leise">direkt aus der Nachricht reagieren, z. B. „bis morgen stumm“</div></div>${sw("knoepfe")}</div>
        <button class="zeile" @click=${() => p4.einblenden("nachrichten")}><span class="blau">Beispiele ansehen</span><span class="chev">›</span></button>
        <button class="zeile" @click=${() => p4.testMeldung()}><span class="blau">Test-Nachricht senden</span></button>
        ${m3(`Stromausfall / offline (nach ${de(e6.offline_min, 0)} min)`, "m_offline")}${m3(`Pumpe Trockenlauf (unter ${de(e6.trocken_w, 0)} W)`, "m_trocken")}${m3(`Pumpe Dauerlauf über ${e6.dauer_min} min`, "m_dauer")}${m3(`Pumpe schaltet oft (ab ${e6.zyklen_h} je Stunde)`, "m_zyklen")}${m3("Heizkörper zieht keinen Strom", "m_leistung")}${m3("Frostgefahr trotz Frostschutz", "m_frost")}${m3("Gerät schaltet sich selbst wieder ein (Auto-ON am Shelly?)", "m_selbst")}
        <div class="gruppe">Hinweise</div>
        ${m3(`Zu kalt trotz Heizung (nach ${e6.kalt_min} min)`, "m_kalt")}${m3("Fühler meldet nichts / Batterie schwach", "m_fuehler")}${m3("Keine Wettervorhersage", "m_wetter")}${m3(`Handbetrieb länger als ${e6.hand_h} h`, "m_hand")}
        <div class="leise p-fuss">Störungen, offene Tür und langer Handbetrieb kommen aufs Handy, andere Hinweise nur ins Protokoll und in den Warnung-Chip.</div></div>
      ${liste("Schwellen der Hinweise", b2`${zeile2("Zu kalt trotz Heizung nach", st("kalt_min", 15, (v2) => `${v2} min`))}${zeile2("Handbetrieb länger als", st("hand_h", 1, (v2) => `${de(v2)} h`))}${zeile2("Tür offen – Nachricht nach", st("tuer_melden", 5, (v2) => `${v2} min`))}`)}`;
}
function bericht2(p4) {
  const e6 = p4.d.e, sw = (k2) => schalterVorlage(e6[k2], () => p4.einstellungUmschalten(k2));
  return b2`<div class="glas-panel liste"><div class="gruppe">Bericht</div>
        <div class="zeile"><span>Wie oft</span><div class="seg klein">${[["aus", "aus"], ["woche", "Woche"], ["monat", "Monat"], ["beides", "beides"]].map(([k2, t5]) => b2`<button data-v=${k2} class=${e6.bericht === k2 ? "on" : ""} @click=${() => p4.einstellungWert("bericht", k2)}>${t5}</button>`)}</div></div>
        ${e6.bericht !== "aus" ? b2`<div class="zeile unter"><span class="leise">${{ woche: "jeden Montag 07:00 für die Vorwoche", monat: "am 1. des Monats 07:00 für den Vormonat", beides: "Montag 07:00 und am 1. des Monats" }[e6.bericht] || ""}</span></div>
        <div class="zeile unter"><span>📱 aufs Handy</span>${sw("bericht_handy")}</div>
        <div class="zeile unter"><span>✉ per E-Mail</span>${sw("bericht_mail")}</div>
        ${e6.bericht_mail ? b2`<label class="zeile unter"><span>an</span><input type="email" value=${e6.mail} .value=${e6.mail} class="mail-feld nur-admin" @change=${p4.nurAdmin((ev) => p4.mailSetzen(ev.target.value))}></label>
        <div class="zeile unter"><span>Abrechnung als CSV anhängen</span>${sw("bericht_csv")}</div>
        <div class="zeile unter"><span class="leise">über den Dienst notify.${e6.mail_dienst || "baustelle_mail"} (z. B. Google Mail oder SMTP in HA eingerichtet)</span></div>` : A}
        <button class="zeile" @click=${() => p4.einblenden("bericht")}><span class="blau">Beispiel ansehen</span><span class="chev">›</span></button>
        <button class="zeile" @click=${() => p4.berichtSenden()}><span class="blau">Jetzt senden</span></button>` : A}</div>`;
}
var ansicht = (p4) => {
  const e6 = p4.d.e;
  return liste("Ansicht", b2`${zeile2("Erklärungen anzeigen", schalterVorlage(e6.erklaer, () => p4.einstellungUmschalten("erklaer")), "kurze Texte „ⓘ“ unter Heizung, Pumpen und Auswertung")}${zeile2("Melden-Knopf", schalterVorlage(e6.melden, () => p4.einstellungUmschalten("melden")), "kleiner Knopf in jedem Fenster für Fehler, Wünsche und Anregungen")}<button class="zeile" @click=${() => p4.awVorlageWahl("misch")}><span>Auswertung auf Vorschlag zurücksetzen</span><span class="leise">gilt für diesen Browser</span></button>`);
};
function entwicklung(p4) {
  const dev = (p4.s.evDev || "meldungen") === "meldungen", setze = (k2) => {
    p4.s.evDev = k2;
    p4.neuZeichnen();
  };
  return b2`<div class="seg ev-dev-reiter">${[["meldungen", "Meldungen"], ["werkzeuge", "Werkzeuge"]].map(([k2, t5]) => b2`<button data-v=${k2} class=${(dev ? "meldungen" : "werkzeuge") === k2 ? "on" : ""} @click=${() => setze(k2)}>${t5}</button>`)}</div>
    ${dev ? devVorlage(p4, { teil: "meldungen" }) : b2`${devVorlage(p4, { teil: "werkzeuge" })}${liste("Für Tests", b2`<button class="zeile" @click=${() => p4.testMeldung()}><span class="blau">Test-Nachricht senden</span></button><button class="zeile" @click=${() => p4.einblenden("nachrichten")}><span>Beispiel-Nachrichten</span><span class="chev">›</span></button>`)}`}`;
}
function gruppen(p4) {
  const d3 = p4.d, e6 = d3.e, M2 = p4.meldungen(), P2 = d3.bereiche.filter((b3) => b3.pumpe), C2 = d3.bereiche.filter((b3) => !b3.pumpe), geraete2 = d3.bereiche.reduce((a3, b3) => a3 + b3.geraete.length, 0);
  const mAn = ["m_offline", "m_trocken", "m_dauer", "m_zyklen", "m_leistung", "m_frost", "m_selbst", "m_kalt", "m_fuehler", "m_wetter", "m_hand"].filter((k2) => e6[k2]).length;
  const offen = M2 === null ? "–" : M2.filter((m3) => p4.meldungOffen(m3)).length, np = npGruppeVorlage(p4);
  return [
    { k: "baustelle", ic: "🏗", t: "Baustelle", kurz: `${d3.titel} · ${p4.bsZeit(d3)}`, inhalt: () => baustelle(p4) },
    { k: "heizung", ic: "🔥", t: "Heizung", kurz: `Automatik ${e6.auto ? "an" : "aus"} · Soll ${de(e6.soll)} °C · Vorheizen ${e6.vorheizen} min`, inhalt: () => heizung(p4) },
    np,
    { k: "container", ic: "🏠", t: "Container & Geräte", kurz: `${C2.length} Container · ${P2.length} ${P2.length === 1 ? "Schacht" : "Schächte"} · ${geraete2} Geräte`, inhalt: () => container(p4) },
    geraeteGruppeVorlage(p4),
    // BSM-034.05: Übersicht und 📦 Inventar in einer Gruppe
    { k: "pumpen", ic: "💧", t: "Pumpen", kurz: P2.length ? `offline nach ${e6.offline_min} min · Trockenlauf unter ${e6.trocken_w} W` : "keine Schächte", inhalt: () => pumpen(p4) },
    { k: "strom", ic: "⚡", t: "Strom & Staffelung", kurz: `${de(e6.preis, 2)} €/kWh · Staffelung ${e6.staffel ? "an" : "aus"}`, inhalt: () => strom(p4) },
    { k: "firmen", ic: "🏢", t: "Firmen", kurz: `${d3.firmen.length} ${d3.firmen.length === 1 ? "Firma" : "Firmen"} für die Abrechnung`, inhalt: () => firmen(p4) },
    { k: "meldungen", ic: "🔔", t: "Meldungen", kurz: `${mAn} von 11 an${e6.empfaenger ? ` · ${e6.empfaenger}` : ""}`, inhalt: () => meldungen(p4) },
    { k: "bericht", ic: "📊", t: "Bericht", kurz: { aus: "aus", woche: "jede Woche", monat: "jeden Monat", beides: "Woche und Monat" }[e6.bericht] || e6.bericht, inhalt: () => bericht2(p4) },
    { k: "app", ic: "🖥", t: "Ansicht", kurz: `Erklärungen ${e6.erklaer ? "an" : "aus"} · Melden-Knopf ${e6.melden ? "an" : "aus"}`, inhalt: () => ansicht(p4) },
    { k: "dev", ic: "🛠", t: "Entwicklung", kurz: `${offen} offene Meldungen · Diagnose`, dev: true, inhalt: () => entwicklung(p4) },
    { k: "ueber", ic: "ℹ", t: "Über", kurz: `Version ${p4.seiteVersion}`, inhalt: () => ueberVorlage(p4, { mitZurueck: false }) }
  ];
}
function einstellungenVorlage(p4) {
  if (p4.s.evGruppe === "inventar") {
    p4.s.evGruppe = "geraete";
    p4.s.gerReiter = "inventar";
  }
  const G = gruppen(p4), g2 = G.find((x2) => x2.k === p4.s.evGruppe) || G[0], schmal = p4.narrow, wahl2 = (k2) => () => p4.einstGruppeWahl(k2);
  const nav = b2`<nav class="ev-nav glas-panel">${G.map((x2) => b2`${x2.dev ? b2`<div class="ev-trenn"></div>` : A}<button data-v=${x2.k} class=${x2 === g2 ? "on" : ""} @click=${wahl2(x2.k)}><span class="ev-ic">${x2.ic}</span><span>${x2.t}</span><small>${x2.kurz}</small></button>`)}</nav>`;
  const chips = b2`<div class="ev-chips">${G.map((x2) => b2`<button class="glas-panel chip ${x2 === g2 ? "amber" : ""}" data-v=${x2.k} @click=${wahl2(x2.k)}>${x2.ic} ${x2.t}</button>`)}</div>`;
  return b2`${kopfVorlage("Einstellungen", p4.d.titel)}<div class=${schmal ? "schmal" : ""}>${schmal ? chips : A}<div class="ev-sl">${schmal ? A : nav}
      <div class="ev-inhalt"><div class="ev-titel"><span class="ev-ic">${g2.ic}</span><div><b>${g2.t}</b><div class="leise">${g2.kurz}</div></div></div>${g2.inhalt()}</div></div></div>`;
}

// src/ansichten/einblendungen-einrichtung.js
var GRIFF7 = b2`<div class="griff"></div>`;
var knopf7 = (t5, fn, art = "") => b2`<button class="knopf ${art}" @click=${fn}>${t5}</button>`;
var text = (ziel2, k2, ph, nach, extra = {}) => b2`<input type=${extra.typ || A} step=${extra.step || A} min=${extra.min ?? A} value=${ziel2[k2] ?? ""} .value=${l3(String(ziel2[k2] ?? ""))} placeholder=${ph || A} ?disabled=${!!extra.aus} data-f=${extra.marke || k2} data-i=${extra.i ?? A} @input=${(e6) => {
  ziel2[k2] = e6.target.value;
  if (nach) nach();
}}>`;
var auswahl2 = (ziel2, k2, inhalt, nach, marke2, i7) => {
  const setze = (e6) => {
    ziel2[k2] = e6.target.value;
    if (nach) nach();
  };
  return b2`<select data-f=${marke2 || k2} data-i=${i7 ?? A} @input=${setze} @change=${setze}>${inhalt}</select>`;
};
function firma(p4, s4) {
  const d3 = p4.d, f3 = s4.form, neu = !f3.id, eigen = !neu && p4.firma(f3.id).eigen, z2 = () => p4.neuZeichnen();
  const frei = d3.bereiche.filter((b3) => (b3.firma || "eigen") === "eigen" || !neu && b3.firma === f3.id);
  const um = (id) => {
    f3.container = f3.container.includes(id) ? f3.container.filter((x2) => x2 !== id) : [...f3.container, id];
    z2();
  };
  return b2`${GRIFF7}<h3>${neu ? "Neue Firma" : "Firma"}</h3>
        <label class="feld">Name${text(f3, "name", "z. B. Trockenbau Maier", null, { aus: eigen })}</label>
        ${eigen ? b2`<div class="gruppe-t">Container der eigenen Firma</div>
          ${d3.bereiche.filter((b3) => (b3.firma || "eigen") === "eigen").map((b3) => b2`<div class="zeile"><span>${b3.name}</span></div>`)}
          <div class="leise">Hierher gehören alle Container, die keiner anderen Firma zugeordnet sind.</div>` : b2`<div class="gruppe-t">Container zuordnen</div>
          ${frei.length ? frei.map((b3) => b2`<div class="zeile" data-id=${b3.id}><span>${b3.name}</span>${schalterVorlage(f3.container.includes(b3.id), () => um(b3.id))}</div>`) : b2`<div class="leise">Alle Container sind schon anderen Firmen zugeordnet.</div>`}
          ${f3.neu.map((c4, i7) => b2`<div class="zeile fc-neu">${text(c4, "name", "Name des Containers", null, { marke: "fnc", i: i7 })}
            <div class="seg klein">${["Container", "Schacht"].map((a3) => b2`<button data-v=${a3} class=${c4.art === a3 ? "on" : ""} @click=${() => {
    c4.art = a3;
    z2();
  }}>${a3}</button>`)}</div>
            <button class="x nur-admin" title="nicht anlegen" @click=${p4.nurAdmin(() => {
    f3.neu.splice(i7, 1);
    z2();
  })}>✕</button></div>`)}
          <button class="zeile" @click=${() => {
    f3.neu.push({ name: "", art: "Container" });
    z2();
  }}><span class="blau">+ Neuer Container für diese Firma</span></button>
          <div class="leise">Nur Container ohne andere Firma sind wählbar. Nimmst du einen weg, gehört er wieder der eigenen Firma. Frühere Werte bleiben bei der bisherigen Firma.</div>`}
        ${eigen ? knopf7("Schließen", () => p4.schliessen(), "leise-k") : b2`${knopf7("Speichern", p4.nurAdmin(() => p4.firmaSpeichern()), "amber nur-admin")}${neu ? A : knopf7("Firma löschen", p4.nurAdmin(() => p4.firmaWeg()), "rot nur-admin")}${knopf7("Abbrechen", () => p4.schliessen(), "leise-k")}`}`;
}
function anschluss(p4, s4) {
  const d3 = p4.d, f3 = s4.form, neu = !f3.id, z2 = () => p4.neuZeichnen();
  const um = (id) => {
    f3.container = f3.container.includes(id) ? f3.container.filter((x2) => x2 !== id) : [...f3.container, id];
    z2();
  };
  return b2`${GRIFF7}<h3>${neu ? "Neuer Anschluss" : "Anschluss"}</h3>
        <label class="feld">Name${text(f3, "name", "z. B. Verteiler West")}</label>
        <div class="zeile"><span>Absicherung</span><div class="seg klein">${[16, 32, 63].map((v2) => b2`<button data-v=${v2} class=${f3.ampere === v2 ? "on" : ""} @click=${() => {
    f3.ampere = v2;
    z2();
  }}>${v2} A</button>`)}</div></div>
        <div class="zeile"><span>Art</span><div class="seg klein">${[3, 1].map((v2) => b2`<button data-v=${v2} class=${f3.phasen === v2 ? "on" : ""} @click=${() => {
    f3.phasen = v2;
    z2();
  }}>${v2 === 3 ? "Starkstrom (CEE)" : "Schuko 230 V"}</button>`)}</div></div>
        <div class="zeile"><div><span>Reserve</span><div class="leise">für Ungemessenes wie Kran oder Werkzeug</div></div><span class="stepper"><button data-d="-1" @click=${() => {
    f3.reserve = Math.max(0, f3.reserve - 1);
    z2();
  }}>−</button><b>${de(f3.reserve)} kW</b><button data-d="1" @click=${() => {
    f3.reserve = Math.max(0, f3.reserve + 1);
    z2();
  }}>+</button></span></div>
        <div class="leise">Anschlussleistung ${de(f3.ampere * 0.23 * f3.phasen)} kW, davon rechnet die Staffelung mit ${d3.e.nutzbar} % = ${de(f3.ampere * 0.23 * f3.phasen * d3.e.nutzbar / 100)} kW, abzüglich ${de(f3.reserve)} kW Reserve.</div>
        <div class="gruppe-t">Container an diesem Anschluss</div>
        ${d3.bereiche.map((b3) => b2`<div class="zeile" data-id=${b3.id}><span>${b3.name} <span class="leise">${f3.container.includes(b3.id) ? "" : "· " + p4.anschluss(b3.anschluss).name}</span></span>${schalterVorlage(f3.container.includes(b3.id), () => um(b3.id))}</div>`)}
        <div class="leise">Ein Container hängt an genau einem Anschluss.</div>
        ${knopf7("Speichern", p4.nurAdmin(() => p4.anschlussSpeichern()), "amber nur-admin")}${!neu && d3.anschluesse.length > 1 ? knopf7("Anschluss löschen", p4.nurAdmin(() => p4.anschlussWeg()), "rot nur-admin") : A}${knopf7("Abbrechen", () => p4.schliessen(), "leise-k")}`;
}
function containerNeu(p4, s4) {
  const f3 = s4.form, schacht = f3.art === "Pumpenschacht", z2 = () => p4.neuZeichnen();
  const fuehler = p4.entitaeten((x2) => x2.entity_id.startsWith("sensor.") && x2.attributes.device_class === "temperature" || x2.entity_id.startsWith("climate."));
  return b2`${GRIFF7}<h3>Neuer Container</h3>
      <label class="feld">Name${text(f3, "name", "z. B. Lager Nord")}</label>
      <div class="feld">Art<div class="seg klein">${["Container", "Pumpenschacht"].map((v2) => b2`<button data-v=${v2} class=${f3.art === v2 ? "on" : ""} @click=${() => {
    f3.art = v2;
    f3.typ = v2 === "Pumpenschacht" ? "Pumpe" : "Ölradiator";
    z2();
  }}>${v2}</button>`)}</div></div>
      <label class="feld">Temperaturfühler${auswahl2(f3, "fuehler", optionenVorlage(fuehler, f3.fuehler, "– keiner –"))}</label>
      <label class="feld">Shelly${auswahl2(f3, "schalter", optionenVorlage(p4.freieSchalter().map(([v2, n4]) => [v2, `${n4} (${v2})`]), f3.schalter, "– später –"), z2)}</label>
      ${f3.schalter ? b2`<label class="feld">${schacht ? "Welches Gerät hängt an diesem Shelly?" : "Welche Heizung hängt an diesem Shelly?"}${auswahl2(f3, "typ", optionenVorlage((schacht ? ["Pumpe"] : ["Ölradiator", "Konvektor"]).map((t5) => [t5, t5]), f3.typ))}</label>` : b2`<div class="leise">Ohne Shelly wird nur der ${schacht ? "Schacht" : "Container"} angelegt – ${schacht ? "Pumpen" : "Heizungen"} kommen später unter „Bearbeiten“ dazu.</div>`}
      ${knopf7("Anlegen", p4.nurAdmin(() => p4.containerAnlegen()), "amber nur-admin")}${knopf7("Abbrechen", () => p4.schliessen(), "leise-k")}`;
}
function groesse(p4, b3, e6) {
  const G = b3.groesse, T2 = G.typen, art = e6.groesseArt, typ = (k2) => `${k2 === "einzel" ? "Einzel" : "Doppel"}container innen ${de(T2[k2].laenge, 2)} × ${de(T2[k2].breite, 2)} m ≈ ${de(T2[k2].m2, 1)} m² · ${de(G.hoehe, 2)} m hoch ≈ ${de(T2[k2].m3, 0)} m³`;
  const w2 = b3.lern && b3.lern.warm, gleich = art === G.art && (art !== "frei" || Number(e6.m2) === G.m2);
  const setze = (k2) => {
    e6.groesseArt = k2;
    if (k2 === "frei" && !zahl(e6.m2)) e6.m2 = G.m2;
    p4.neuZeichnen();
  };
  return b2`<div class="zeile"><div><b>Größe</b><div class="leise">für Vergleiche (kWh je m²) und als Startwert der lernenden Regelung</div></div>
      <div class="seg klein">${[["einzel", "Einzel"], ["doppel", "Doppel"], ["frei", "m²"]].map(([k2, t5]) => b2`<button data-v=${k2} class=${art === k2 ? "on" : ""} @click=${() => setze(k2)}>${t5}</button>`)}</div></div>
      ${art === "frei" ? b2`<label class="zeile unter"><span>Fläche innen</span><span class="eingabe">${text(e6, "m2", null, null, { typ: "number", step: "0.5", min: "4", marke: "bm2" })} m²</span></label>
        <div class="leise" style="padding:0 0 6px 12px">Höhe ${de(G.hoehe, 2)} m${gleich ? ` ≈ ${de(G.m3, 0)} m³` : ""}</div>` : b2`<div class="leise" style="padding:0 0 6px 12px">${typ(art)}</div>`}
      ${w2 && w2.geschaetzt && gleich ? b2`<div class="leise" style="padding:0 0 6px 12px">🧠 Noch nichts gelernt: Aufheizen geschätzt aus der Größe – ${de(w2.geschaetzt, 1)} °C/h</div>` : A}`;
}
function bereich(p4, s4) {
  const d3 = p4.d, b3 = p4.b;
  if (!b3) {
    p4.s.sheet = null;
    return A;
  }
  const e6 = p4.bereichEntwurf(b3, s4), z2 = () => p4.neuZeichnen();
  const typen = b3.pumpe ? ["Pumpe"] : ["Ölradiator", "Konvektor", "Bautrockner", "Steckdose"];
  const tueren = p4.entitaeten((x2) => x2.entity_id.startsWith("binary_sensor.") && ["door", "window", "opening", "garage_door"].includes(x2.attributes.device_class));
  const fuehler = p4.entitaeten((x2) => x2.entity_id.startsWith("sensor.") && x2.attributes.device_class === "temperature" || x2.entity_id.startsWith("climate."));
  if (e6.fuehler && !fuehler.some((x2) => x2[0] === e6.fuehler)) fuehler.unshift([e6.fuehler, p4.name(e6.fuehler)]);
  if (e6.tuer && !tueren.some((x2) => x2[0] === e6.tuer)) tueren.unshift([e6.tuer, p4.name(e6.tuer)]);
  const warm = () => {
    const w2 = { vor: e6.warmVor ?? d3.e.warm_vor, nach: e6.warmNach ?? d3.e.warm_nach, vor_eigen: e6.warmVor !== null, nach_eigen: e6.warmNach !== null };
    const sw = (k2, v2, eigen, f3) => b2`<span class="stepper klein" data-w=${k2}><button data-d="-5" @click=${p4.nurAdmin(() => p4.warmEigen(e6, k2, -5))}>−</button><b class=${eigen ? "eigen" : ""}>${f3(v2)}</b><button data-d="5" @click=${p4.nurAdmin(() => p4.warmEigen(e6, k2, 5))}>+</button></span>`;
    return b2`<div class="gruppe-t" data-zeile="warm">🧠 Warm ab</div><div class="zeile"><div><span>Soll erreicht</span><div class="leise">${w2.vor_eigen ? "eigener Wert" : "wie die Baustelle"}</div></div>${sw("vor", w2.vor, w2.vor_eigen, (v2) => v2 ? `${v2} min vorher` : "bei Beginn")}</div>
            <div class="zeile"><div><span>Warm halten</span><div class="leise">${w2.nach_eigen ? "eigener Wert" : "wie die Baustelle"}</div></div>${sw("nach", w2.nach, w2.nach_eigen, (v2) => v2 ? `${v2} min länger` : "bis Ende")}</div>
            ${w2.vor_eigen || w2.nach_eigen ? b2`<button class="zeile" @click=${p4.nurAdmin(() => p4.warmZurueck(e6))}><span class="blau">Wie die Baustelle</span></button>` : A}`;
  };
  const primaerWahl = () => {
    const H2 = b3.geraete.filter((g2) => g2.heizer && g2.aktiv !== false);
    const erster = H2.find((g2) => b3.stufen && (b3.stufen.auto || []).includes(g2.id)) || H2[0];
    const wahl2 = H2.some((g2) => g2.id === e6.primaer) ? e6.primaer : "", haupt = H2.find((g2) => g2.id === wahl2) || erster;
    return b2`<label class="feld ${e6.stufen ? "" : "gedimmt"}" data-zeile="primaer">★ Primärheizkörper
        <select @change=${(ev) => {
      e6.primaer = ev.target.value;
      z2();
    }}>
          <option value="" ?selected=${!wahl2}>automatisch · ${erster ? erster.n : "–"}</option>
          ${H2.map((g2) => b2`<option value=${g2.id} ?selected=${wahl2 === g2.id}>${g2.n} · ${g2.typ}</option>`)}</select>
        <span class="leise">${e6.stufen ? `Zusatz: ${H2.filter((g2) => g2 !== haupt).map((g2) => g2.n).join(", ") || "–"}` : "Alle heizen gemeinsam – Primär zählt erst mit „Zusatz nur bei Bedarf“"}</span></label>`;
  };
  const geraet = (g2, i7) => g2.weg ? b2`<div class="ge-zeile weg" data-i=${i7}><span>${g2.n} wird entfernt</span><button class="chip glas-panel" @click=${() => {
    g2.weg = false;
    z2();
  }}>rückgängig</button></div>` : b2`<div class="ge-zeile" data-i=${i7}><div class="ge-felder">
            ${g2.neu ? auswahl2(g2, "schalter", optionenVorlage(p4.freieSchalter().map(([v2, n4]) => [v2, `${n4} (${v2})`]), g2.schalter, "– Shelly wählen –"), null, null, i7) : b2`<span class="leise ge-shelly">${p4.name(g2.schalter)} · ${g2.schalter}</span>`}
            <div class="ge-zwei">${text(g2, "n", "Name", null, { i: i7 })}${auswahl2(g2, "typ", typen.map((t5) => b2`<option ?selected=${g2.typ === t5}>${t5}</option>`), null, null, i7)}</div></div>
            ${g2.neu ? A : b2`<button class="bs-ic nur-admin" title="Gerät bearbeiten" aria-label="${g2.n} bearbeiten" @click=${p4.nurAdmin(() => p4.geraetBearbeiten(b3, i7))}>✎</button>`}<button class="x nur-admin" title="Gerät entfernen" @click=${p4.nurAdmin(() => {
    if (g2.neu) e6.geraete.splice(i7, 1);
    else g2.weg = true;
    z2();
  })}>✕</button></div>`;
  return b2`${GRIFF7}<div class="block-kopf"><h3>Bearbeiten</h3><span class="leise">${b3.pumpe ? "Pumpenschacht" : "Container"}</span></div>
        <label class="feld">Name${text(e6, "name")}</label>
        ${!b3.pumpe && b3.geraete.filter((g2) => g2.heizer).length >= 2 ? b2`<div class="zeile" data-zeile="stufen"><div><b>🔥 Zusatz-Heizkörper nur bei Bedarf</b><div class="leise">zuerst heizt der Primärheizkörper; der Zusatz kommt bei Kälte, weit unter dem Soll oder wenn einer es nicht schafft.</div></div>${schalterVorlage(e6.stufen, () => {
    e6.stufen = !e6.stufen;
    z2();
  })}</div>
        ${primaerWahl()}` : A}
        ${b3.pumpe ? A : b2`<div class="zeile" data-zeile="bedarf"><div><b>Nur bei Bedarf heizen</b><div class="leise">z. B. Besprechungscontainer: heizt nur per Schalter oder Termin, sonst Frostschutz</div></div>${schalterVorlage(e6.bedarf, () => {
    e6.bedarf = !e6.bedarf;
    z2();
  })}</div>`}
        ${b3.lern && b3.lern.warm ? warm() : A}
        ${b3.pumpe || !b3.groesse ? A : groesse(p4, b3, e6)}
        ${b3.pumpe ? A : b2`<div class="glas-panel liste"><button class="zeile sym-zeile" @click=${() => p4.aussehenAuf(b3)}><span class="sym-mini">${o5(bcContainer(BEREICH_FARBEN[b3.f % BEREICH_FARBEN.length], "aus", b3))}</span><div><b class="blau">🏠 Aussehen</b><div class="leise">${b3.symbol && b3.symbol.doppel ? "Doppel" : "Einzel"} · ${b3.symbol ? b3.symbol.tueren.length : 1} ${b3.symbol && b3.symbol.tueren.length === 2 ? "Türen" : "Tür"} · ${b3.symbol ? b3.symbol.fenster.length : 1} Fenster · Farbe, Sensoren</div></div><span class="chev">›</span></button></div>`}
        ${b3.pumpe ? A : b2`<label class="feld">Temperaturfühler${auswahl2(e6, "fuehler", optionenVorlage(fuehler, e6.fuehler, "– keiner –"))}</label>`}
        ${b3.pumpe ? A : b2`<label class="feld">Türkontakt${auswahl2(e6, "tuer", optionenVorlage(tueren, e6.tuer, "keiner"))}</label>`}
        <label class="feld">Stromanschluss${auswahl2(e6, "anschluss", d3.anschluesse.map((a3) => b2`<option value=${a3.id} ?selected=${e6.anschluss === a3.id}>${a3.name} · ${a3.phasen === 3 ? "3 × " : ""}${a3.ampere} A</option>`), z2)}</label>
        <label class="feld">Firma · für die Abrechnung${auswahl2(e6, "firma", d3.firmen.map((f3) => b2`<option value=${f3.id} ?selected=${e6.firma === f3.id}>${f3.name}</option>`))}</label>
        <div class="gruppe-t">${b3.pumpe ? "Pumpen" : "Geräte"} · ${e6.geraete.filter((g2) => !g2.weg).length}</div>
        ${e6.geraete.map(geraet)}
        <button class="zeile" @click=${() => {
    e6.geraete.push({ neu: true, schalter: "", n: "", typ: b3.pumpe ? "Pumpe" : "Ölradiator" });
    z2();
  }}><span class="blau">+ Gerät hinzufügen</span></button>
        <div class="leise">Der Heizkörpertyp gilt nur für den Vergleich Ölradiator/Konvektor. Entfernte Geräte behalten ihre Werte im Verlauf.</div>
        ${knopf7("Speichern", p4.nurAdmin(() => p4.bereichSpeichern()), "amber nur-admin")}${knopf7("Container entfernen", p4.nurAdmin(() => p4.bereichWeg()), "rot nur-admin")}${knopf7("Abbrechen", () => p4.schliessen(), "leise-k")}`;
}
function aussehen(p4, s4) {
  const b3 = p4.d.bereiche.find((x2) => x2.id === s4.id);
  if (!b3) return b2`${GRIFF7}<div class="leer">Container nicht gefunden</div>${knopf7("Schließen", () => p4.schliessen())}`;
  const c4 = p4.symKonfig(b3), ist = b3.symbol || SYMBOL_STANDARD, std = BEREICH_FARBEN[b3.f % BEREICH_FARBEN.length], aendern = (x2) => p4.symAendern(b3, x2);
  const vorschau = {
    ...c4,
    licht_an: ist.licht_an,
    tueren: c4.tueren.map((t5, i7) => ({ ...t5, offen: !!(ist.tueren[i7] && ist.tueren[i7].offen) })),
    fenster: c4.fenster.map((f3, i7) => ({ ...f3, zustand: ist.fenster[i7] && ist.fenster[i7].zustand || "zu" }))
  };
  const kontakte = p4.entitaeten((x2) => x2.entity_id.startsWith("binary_sensor.") && ["door", "window", "opening", "garage_door"].includes(x2.attributes.device_class));
  const lichter = p4.entitaeten((x2) => /^(light|switch)\./.test(x2.entity_id) || x2.entity_id.startsWith("binary_sensor.") && x2.attributes.device_class === "light" || x2.entity_id.startsWith("sensor.") && x2.attributes.device_class === "illuminance");
  const seg = (fn, wert2, opts) => b2`<div class="seg klein">${opts.map(([v2, t5]) => b2`<button data-v=${v2} class=${String(wert2) === String(v2) ? "on" : ""} @click=${() => fn(v2)}>${t5}</button>`)}</div>`;
  const wahl2 = (wert2, fn, marke2) => b2`<select data-f=${marke2 || A} @change=${(e6) => fn(e6.target.value)}>${wert2}</select>`;
  const element = (art, x2, i7, n4) => b2`<div class="zeile"><b>${art === "tueren" ? "🚪 Tür" : "🪟 Fenster"} ${i7 + 1}</b>${n4 > 1 ? b2`<button class="knopf klein" aria-label="entfernen" @click=${() => aendern((k2) => {
    if (k2[art].length > 1) k2[art].splice(i7, 1);
  })}>✕</button>` : A}</div>
      <div class="zeile unter"><span>Wand</span>${seg((v2) => aendern((k2) => {
    k2[art][i7].wand = v2;
  }), x2.wand, [["front", "Front"], ["seite", "Seite"]])}</div>
      <div class="zeile unter" data-z="lage" data-art=${art} data-i=${i7}><span>${art === "tueren" ? "Sitzt" : "Lage"}</span>${art === "tueren" ? seg((v2) => aendern((k2) => {
    k2[art][i7].pos = +v2;
  }), x2.pos < 0.4 ? 0.15 : x2.pos > 0.6 ? 0.85 : 0.5, [[0.15, "links"], [0.5, "Mitte"], [0.85, "rechts"]]) : seg((v2) => aendern((k2) => {
    k2[art][i7].pos = +v2;
  }), x2.pos, [[0.15, "links"], [0.33, "◧"], [0.5, "Mitte"], [0.67, "◨"], [0.85, "rechts"]])}</div>
      <label class="zeile unter"><span>${art === "tueren" ? "Türsensor" : "Fenstersensor"}</span>${wahl2(optionenVorlage(kontakte, x2.sensor || "", art === "tueren" && i7 === 0 ? "wie Türkontakt des Containers" : "keiner"), (v2) => aendern((k2) => {
    k2[art][i7].sensor = v2 || null;
  }))}</label>`;
  const neu = (art) => aendern((k2) => {
    if (k2[art].length < (art === "tueren" ? 2 : 4)) {
      const frei = [0.15, 0.33, 0.5, 0.67, 0.85].find((v2) => !k2[art].some((y3) => y3.wand === "front" && y3.pos === v2)) ?? 0.5;
      k2[art].push({ wand: "front", pos: frei, sensor: null });
    }
  });
  const farbe = (fb2, an, fn, label) => b2`<button data-v=${fb2} class="sym-farbe ${an ? "on" : ""}" style="background:${fb2}" aria-label="${label} ${fb2}" @click=${fn}></button>`;
  return b2`${GRIFF7}<div class="block-kopf"><h3>🏠 Aussehen · ${b3.name}</h3></div><div class="sym-vorschau">${o5(bcContainer(std, b3.z === "pause" || b3.z === "bereit" ? "aus" : b3.z, { symbol: vorschau }))}</div>
      <div class="glas-panel liste"><div class="zeile"><div><b>Doppelcontainer</b><div class="leise">zwei Container nebeneinander – das Symbol wird tiefer</div></div>${schalterVorlage(c4.doppel, () => aendern((k2) => {
    k2.doppel = !k2.doppel;
  }))}</div>
        <div class="zeile"><span>Farbe</span><span class="sym-farben">${["#3987e5", "#eb6834", "#1baf7a", "#c98500", "#d55181", "#199e70", "#7e57c2", "#78909c"].map((fb2) => farbe(fb2, (c4.farbe || std) === fb2, () => aendern((k2) => {
    k2.farbe = fb2;
  }), "Farbe"))}<input type="color" value=${c4.farbe || std} .value=${l3(c4.farbe || std)} aria-label="eigene Farbe" @change=${(e6) => aendern((k2) => {
    k2.farbe = e6.target.value;
  })}></span></div>
        <div class="zeile"><div><span>Rahmen</span><div class="leise">Stahlrahmen an Ecken, oben und unten (20 cm)</div></div><span class="sym-farben"><button data-v="" class="knopf klein ${c4.rahmen ? "" : "on"}" @click=${() => aendern((k2) => {
    k2.rahmen = null;
  })}>kein</button>${["#c62828", "#37474f", "#eceff1", "#1565c0", "#f9a825", "#2e7d32"].map((fb2) => farbe(fb2, c4.rahmen === fb2, () => aendern((k2) => {
    k2.rahmen = fb2;
  }), "Rahmen"))}<input type="color" value=${c4.rahmen || "#37474f"} .value=${l3(c4.rahmen || "#37474f")} aria-label="eigene Rahmenfarbe" @change=${(e6) => aendern((k2) => {
    k2.rahmen = e6.target.value;
  })}></span></div></div>
      <div class="glas-panel liste"><div class="gruppe">Türen · ${c4.tueren.length} von 2</div>${c4.tueren.map((x2, i7) => element("tueren", x2, i7, c4.tueren.length))}${c4.tueren.length < 2 ? b2`<button class="zeile" data-art="tueren" @click=${() => neu("tueren")}><span class="blau">+ Tür</span></button>` : A}</div>
      <div class="glas-panel liste"><div class="gruppe">Fenster · ${c4.fenster.length} von 4</div>${c4.fenster.map((x2, i7) => element("fenster", x2, i7, c4.fenster.length))}${c4.fenster.length < 4 ? b2`<button class="zeile" data-art="fenster" @click=${() => neu("fenster")}><span class="blau">+ Fenster</span></button>` : A}</div>
      <div class="glas-panel liste"><div class="gruppe">Licht im Symbol</div><label class="zeile"><div><span>Licht kommt von</span><div class="leise">Fenster leuchten, wenn im Container Licht brennt</div></div>${wahl2(optionenVorlage(lichter, c4.licht || "", "keins"), (v2) => aendern((k2) => {
    k2.licht = v2 || null;
  }), "licht")}</label></div>
      <div class="leise p-fuss">Türen sitzen links, mittig oder rechts an ihrer Wand; mehrere Fenster verteilen sich gleichmäßig auf den Platz daneben. Tür offen/zu, Fenster offen/gekippt/zu und Licht kommen von den zugeordneten Sensoren; ohne Sensor bleibt das Element zu bzw. dunkel.</div>
      ${b3.symbol && b3.symbol.eigen && !s4.std ? b2`<button class="knopf" @click=${() => p4.symStandard()}>Standard (eine Tür, ein Fenster)</button>` : A}
      ${knopf7("Speichern", p4.nurAdmin(() => p4.symSpeichern(b3)), "amber nur-admin")}${knopf7("Abbrechen", () => p4.schliessen(), "leise-k")}`;
}
function geraetEdit(p4, s4) {
  const d3 = p4.d, b3 = p4.b, g2 = b3 && b3.geraete[s4.i];
  if (!g2) {
    p4.s.sheet = null;
    return A;
  }
  const x2 = geraeteZeilen(p4).find((y3) => y3.art === "schalt" && y3.id === g2.id);
  const f3 = s4.form, typen = b3.pumpe ? ["Pumpe"] : ["Ölradiator", "Konvektor", "Bautrockner", "Steckdose"];
  const leistung = p4.entitaeten((x3) => x3.entity_id.startsWith("sensor.") && x3.attributes.device_class === "power");
  const energie = p4.entitaeten((x3) => x3.entity_id.startsWith("sensor.") && x3.attributes.device_class === "energy");
  const auto = (eid, eigen) => `automatisch${!eigen && eid ? ` · ${p4.name(eid) || eid}` : ""}`;
  return b2`${GRIFF7}<div class="block-kopf"><h3>Gerät bearbeiten</h3><span class="leise">${b3.name}</span></div>
        ${x2 ? jetztVorlage(p4, x2) : A}
        <div class="gruppe-t">Einstellungen</div>
        <label class="feld">Name${text(f3, "n")}</label>
        <label class="feld">Shelly (Schalter)${auswahl2(f3, "schalter", optionenVorlage(p4.freieSchalter(g2.schalter).map(([v2, n4]) => [v2, `${n4} (${v2})`]), f3.schalter))}</label>
        <div class="raster-2"><label class="feld">Typ${auswahl2(f3, "typ", typen.map((t5) => b2`<option ?selected=${f3.typ === t5}>${t5}</option>`))}</label>
          <label class="feld">${b3.pumpe ? "Pumpenschacht" : "Container"}${auswahl2(f3, "bereich", optionenVorlage(d3.bereiche.filter((x3) => !!x3.pumpe === !!b3.pumpe).map((x3) => [x3.id, x3.name]), f3.bereich))}</label></div>
        <label class="feld">Leistungssensor${auswahl2(f3, "leistung", optionenVorlage(leistung, f3.leistung, auto(g2.leistung, g2.leistungEigen)))}</label>
        <label class="feld">Energiesensor${auswahl2(f3, "energie", optionenVorlage(energie, f3.energie, auto(g2.energie, g2.energieEigen)))}</label>
        <div class="zeile" data-zeile="status"><div><b>Status</b><div class="leise">nur „aktiv“ schaltet die Automatik, zählt in der Staffelung und meldet Warnungen; gilt auch im Inventar</div></div>
          <div class="seg klein">${[["aktiv", "aktiv"], ["inaktiv", "inaktiv"], ["verliehen", "verliehen"], ["defekt", "defekt"]].map(([v2, t5]) => b2`<button data-v=${v2} class=${f3.status === v2 ? "on" : ""} @click=${() => {
    f3.status = v2;
    p4.neuZeichnen();
  }}>${t5}</button>`)}</div></div>
        ${g2.heizer || !g2.leistung ? b2`<div class="zeile" data-zeile="nenn"><div>${g2.heizer ? b2`<b>Nennleistung (Typenschild)</b><div class="leise">Referenz für die Prognose; zählt in der Staffelung, wenn keine Messung da ist${f3.nennKw === null ? " · nicht eingetragen" : ""}</div>` : b2`<b>Leistung ohne Messung</b><div class="leise">zählt so in der Staffelung, wenn das Gerät an ist${f3.nennKw === null ? " · Standard" : ""}</div>`}</div><span class="stepper klein"><button data-d="-0.1" @click=${() => p4.geraetNennKw(f3, g2, -0.1)}>−</button><b class=${f3.nennKw !== null ? "eigen" : ""}>${de(f3.nennKw ?? g2.kw, 1)} kW</b><button data-d="0.1" @click=${() => p4.geraetNennKw(f3, g2, 0.1)}>+</button></span></div>` : A}
        ${g2.heizer && b3.stufen ? b2`<div class="zeile" data-zeile="rolle"><div><b>Rolle im Container: ${b3.stufen.haupt.includes(g2.id) ? "★ Primär" : "🔥 Zusatz"}</b><div class="leise">${!b3.stufenAn ? "alle heizen gemeinsam" : b3.stufen.haupt.includes(g2.id) ? "heizt zuerst" : `heizt dazu, wenn ${(b3.geraete.find((x3) => b3.stufen.haupt.includes(x3.id)) || {}).n || "der Primäre"} nicht reicht`} · festgelegt im Container unter „Bearbeiten“</div></div></div>` : A}
        <div class="leise">Neuer Shelly: die Werte des alten bleiben im Verlauf. Anderer Container: der Verbrauch zählt ab jetzt dort.</div>
        ${x2 ? inventarVorlage(p4, x2) : A}
        ${knopf7("Speichern", p4.nurAdmin(() => p4.geraetSpeichern()), "amber nur-admin")}${knopf7("Abbrechen", () => p4.schliessen(), "leise-k")}`;
}
var EINRICHTUNG_EINBLENDUNGEN = { firma, anschluss, "container-neu": containerNeu, bereich, aussehen, "geraet-edit": geraetEdit };

// src/ansichten/heizperiode.js
var GRIFF8 = b2`<div class="griff"></div>`;
var LAEDT6 = b2`<div class="leer">Lädt …</div>`;
var MONATE_VOLL = ["Jänner", "Februar", "März", "April", "Mai", "Juni", "Juli", "August", "September", "Oktober", "November", "Dezember"];
var STAND = { gut: ["gut", "gruen-t"], brauchbar: ["brauchbar", "amber-t"], unsicher: ["unsicher", "rot-t"], lernt: ["lernt noch", "leise"] };
var eur = (x2) => zahl(x2) ? `${de(x2, 0)} €` : "–";
var tagText = (iso) => iso ? `${iso.slice(8, 10)}.${iso.slice(5, 7)}.${iso.slice(0, 4)}` : "";
var imZeitraum = (m3, [von, bis]) => von <= bis ? m3 >= von && m3 <= bis : m3 >= von || m3 <= bis;
var stand = (c4) => {
  const [t5, k2] = STAND[c4.stand] || [c4.stand, ""];
  return b2`<span class="hp-st ${k2}">${t5}${c4.stand === "lernt" ? ` · ${c4.tage}/10 Tage` : ""}</span>`;
};
function zahlZeile(h3) {
  return b2`<div class="hp-zahl">≈ ${eur(h3.mit_eur)}<span class="leise"> · ${zahl(h3.unten_eur) ? `${de(h3.unten_eur, 0)}–${eur(h3.oben_eur)}` : `${de(h3.mit_kwh, 0)} kWh`}</span></div>`;
}
var mengeText = (v2, mwh) => mwh ? `${de(v2 / 1e3, v2 < 1e4 ? 1 : 0)} MWh` : `${de(v2, 0)} kWh`;
function diagramm(h3) {
  const R2 = h3.reihe || [];
  if (R2.length < 2) return A;
  const W = 340, H2 = 180, L2 = 36, U = 22, n4 = R2.length;
  const max = Math.max(...R2.map((r5) => Math.max(r5[1] || 0, r5[2] || 0, r5[4] || 0)), 1) * 1.05;
  const raus = R2.findIndex((r5) => r5[5] !== null && r5[5] > max), O = raus >= 0 ? 22 : 10;
  const x2 = (i7) => L2 + i7 / (n4 - 1) * (W - L2 - 6), y3 = (v2) => H2 - U - v2 / max * (H2 - U - O);
  const heute2 = Math.max(0, R2.findLastIndex((r5) => r5[1] !== null));
  const pfad = (k2, von, bis) => R2.slice(von, bis + 1).map((r5, j2) => r5[k2] === null ? "" : `${j2 ? "L" : "M"}${x2(von + j2).toFixed(1)},${y3(r5[k2]).toFixed(1)}`).join(" ");
  const band = R2[n4 - 1][3] !== null ? `M${x2(heute2).toFixed(1)},${y3(R2[heute2][3]).toFixed(1)} ${R2.slice(heute2).map((r5, j2) => `L${x2(heute2 + j2).toFixed(1)},${y3(r5[4]).toFixed(1)}`).join(" ")} ${R2.slice(heute2).reverse().map((r5, j2) => `L${x2(n4 - 1 - j2).toFixed(1)},${y3(r5[3]).toFixed(1)}`).join(" ")} Z` : "";
  const stufen2 = [0, 0.25, 0.5, 0.75, 1].map((f3) => max / 1.05 * f3), mwh = max > 4e3;
  const monate = R2.map((r5, i7) => [r5[0], i7]).filter(([t5]) => t5.endsWith("-01"));
  let pfeil = "";
  if (raus >= 0) {
    const a3 = R2[raus - 1], xe = raus && a3[5] !== null ? x2(raus - 1 + (max - a3[5]) / (R2[raus][5] - a3[5])) : x2(raus);
    const ende = zahl(h3.ohne_kwh) ? h3.ohne_kwh : R2[n4 - 1][5], t5 = `ohne${h3.ohne_hinweis ? " (Schätzung 24/7)" : ""} ${mengeText(ende, mwh)}`;
    pfeil = `<text class="hp-pfeil" x="${xe.toFixed(1)}" y="${O - 2}">↑</text><text class="hp-raus" x="${(xe + (xe > W / 2 ? -6 : 6)).toFixed(1)}" y="${O - 4}" text-anchor="${xe > W / 2 ? "end" : "start"}">${t5}</text>`;
  }
  return o5(`<svg class="hp-dia" viewBox="0 0 ${W} ${H2}">
    <defs><clipPath id="hp-feld"><rect x="${L2}" y="${O}" width="${W - L2 - 6}" height="${H2 - U - O}"/></clipPath></defs>
    ${stufen2.map((v2) => `<line class="hp-gitter" data-v="${Math.round(v2)}" x1="${L2}" y1="${y3(v2)}" x2="${W - 6}" y2="${y3(v2)}"/><text class="hp-yt" x="${L2 - 4}" y="${y3(v2) + 3}">${de(mwh ? v2 / 1e3 : v2, mwh && max < 21e3 ? 1 : 0)}</text>`).join("")}
    <text class="hp-yt" x="${L2 - 4}" y="8">${mwh ? "MWh" : "kWh"}</text>
    ${monate.map(([t5, i7]) => `<line class="hp-gitter" x1="${x2(i7)}" y1="${O}" x2="${x2(i7)}" y2="${H2 - U}"/><text x="${x2(i7) + 10}" y="${H2 - 6}">${MONATE[+t5.slice(5, 7) - 1]}</text>`).join("")}
    ${band ? `<path class="hp-band" d="${band}"/>` : ""}
    ${R2[0][5] !== null ? `<path class="hp-ohne"${raus >= 0 ? ' clip-path="url(#hp-feld)"' : ""} d="${pfad(5, 0, n4 - 1)}"/>${pfeil}` : ""}
    <path class="hp-prog" d="${pfad(2, heute2, n4 - 1)}"/>
    ${heute2 ? `<path class="hp-ist" d="${pfad(1, 0, heute2)}"/>` : ""}
    <line class="hp-heute" x1="${x2(heute2)}" y1="${O}" x2="${x2(heute2)}" y2="${H2 - U}"/><text class="hp-ht" x="${x2(heute2) + 3}" y="${O + 8}">heute</text></svg>`);
}
function legende(h3) {
  return b2`<div class="hp-leg">
      <span><i class="l-ist"></i>tatsächlich <b>${eur(h3.bisher_eur)}</b></span>
      <span><i class="l-prog"></i>Prognose mit Automatik <b>${eur(h3.mit_eur)}</b>${zahl(h3.unten_eur) ? b2`<span class="leise"> (${de(h3.unten_eur, 0)}–${de(h3.oben_eur, 0)})</span>` : A}</span>
      ${zahl(h3.ohne_eur) ? b2`<span><i class="l-ohne"></i>Prognose ohne Automatik <b>${eur(h3.ohne_eur)}</b></span>` : A}
      ${zahl(h3.gespart_eur) ? b2`<span>gespart ≈ <b>${eur(h3.gespart_eur)}</b></span>` : A}</div>
    ${h3.ohne_hinweis ? b2`<div class="hp-grob">⚠ „ohne Automatik“ und „gespart“: ${h3.ohne_hinweis}</div>` : A}
    <div class="leise">„ohne Automatik“ ist bis zur gemessenen Baseline eine Schätzung (jeder Heizkörper rund um die Uhr).</div>`;
}
function herkunft(h3) {
  return b2`${h3.herkunft_lernt ? b2`<b>lernt noch</b> – ` : A}${h3.herkunft || ""}`;
}
var WT = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"];
var AUFL = [["hp", "Heizperiode"], ["monat", "Monat"], ["woche", "Woche"], ["tag", "Tag"]];
var FENSTER = { tag: [7, 14], woche: [3, 9], monat: [0, 7] };
var QTEXT = { gemessen: "gemessen", vorhersage: "Vorhersage", klima: "Klimamittel" };
var datum3 = (iso) => /* @__PURE__ */ new Date(`${iso}T12:00:00`);
var tm = (iso) => `${iso.slice(8, 10)}.${iso.slice(5, 7)}.`;
function titel(z2, art) {
  if (art === "monat") return `${MONATE[+z2.von.slice(5, 7) - 1]} ${z2.von.slice(0, 4)}`;
  if (art === "woche") return `${tm(z2.von)}–${tm(z2.bis)}`;
  return `${WT[datum3(z2.von).getDay()]} ${tm(z2.von)}`;
}
function fenster(P2, art, ab) {
  const [vor, n4] = FENSTER[art], jetzt = Math.max(0, P2.findIndex((z2) => !z2.vorbei));
  const start = Math.max(0, Math.min(P2.length - n4, (art === "monat" ? 0 : jetzt - vor) + ab * n4));
  return { Z: P2.slice(start, start + n4), vor: start > 0, nach: start + n4 < P2.length };
}
var balkenMax = (Z2) => Math.max(1, ...Z2.map((z2) => Math.max(z2.oben ?? z2.mit, z2.mit, z2.ist || 0))) * 1.08;
var ueberRand = (Z2) => {
  const m3 = balkenMax(Z2);
  return Z2.some((z2) => zahl(z2.ohne) && z2.ohne > m3);
};
function balkenSvg(Z2, art, wahl2) {
  const W = 340, H2 = 190, L2 = 34, U = art === "tag" ? 30 : 22, O = art === "tag" ? 22 : 10;
  const max = balkenMax(Z2), mwh = max > 4e3;
  const bw = (W - L2 - 6) / Z2.length, y3 = (v2) => H2 - U - v2 / max * (H2 - U - O), x2 = (i7) => L2 + i7 * bw;
  const stufen2 = [0, 0.25, 0.5, 0.75, 1].map((f3) => max / 1.08 * f3), jetzt = Z2.findIndex((z2) => !z2.vorbei);
  const b3 = Z2.map((z2, i7) => {
    const w2 = bw * 0.62, x0 = x2(i7) + bw * 0.12, ist = z2.ist || 0, ow = Math.max(3, bw * 0.16), m3 = x0 + w2 / 2;
    const sp = z2.prog && zahl(z2.unten) && z2.oben - z2.unten > 0.05 * max / 10;
    const unterTag = art === "tag" ? `<text class="hp-x2${z2.heute ? " heute" : ""}" x="${x2(i7) + bw / 2}" y="${H2 - U + 23}">${z2.heute ? "heute" : `${+z2.von.slice(8, 10)}.`}</text>` : "";
    return `<g class="hp-b${i7 === wahl2 ? " on" : ""}" data-i="${i7}"><rect class="hp-hit" x="${x2(i7)}" y="${O}" width="${bw}" height="${H2 - U - O}"/>
      ${ist ? `<rect class="hp-bi" x="${x0}" y="${y3(ist)}" width="${w2}" height="${y3(0) - y3(ist)}"/>` : ""}
      ${z2.prog ? `<rect class="hp-bp" x="${x0}" y="${y3(z2.mit)}" width="${w2}" height="${y3(ist) - y3(z2.mit)}"/>` : ""}
      ${sp ? `<path class="hp-bs" d="M${m3},${y3(z2.oben)} V${y3(z2.unten)} M${x0 + w2 * 0.3},${y3(z2.oben)} H${x0 + w2 * 0.7} M${x0 + w2 * 0.3},${y3(z2.unten)} H${x0 + w2 * 0.7}"/>` : ""}
      ${zahl(z2.ohne) ? `<rect class="hp-bo" x="${x0 + w2 + 1}" y="${y3(Math.min(z2.ohne, max))}" width="${ow}" height="${y3(0) - y3(Math.min(z2.ohne, max))}"/>` : ""}
      ${zahl(z2.ohne) && z2.ohne > max ? `<text class="hp-pfeil" x="${x0 + w2 + 1 + ow / 2}" y="${O - 1}">↑</text>` : ""}
      ${art === "tag" && zahl(z2.aussen) ? `<text class="hp-bt${z2.quellen.includes("klima") ? " kl" : ""}" x="${x2(i7) + bw / 2}" y="${O - 8}">${de(z2.aussen, 0)}°</text>` : ""}
      <text class="hp-x${z2.heute ? " heute" : ""}" x="${x2(i7) + bw / 2}" y="${H2 - U + 12}">${art === "monat" ? MONATE[+z2.von.slice(5, 7) - 1] : art === "woche" ? tm(z2.von) : WT[datum3(z2.von).getDay()]}</text>${unterTag}</g>`;
  }).join("");
  return o5(`<svg class="hp-dia hp-balken" viewBox="0 0 ${W} ${H2}">
    ${stufen2.map((v2) => `<line class="hp-gitter" x1="${L2}" y1="${y3(v2)}" x2="${W - 6}" y2="${y3(v2)}"/><text class="hp-yt" x="${L2 - 4}" y="${y3(v2) + 3}">${de(mwh ? v2 / 1e3 : v2, mwh ? 1 : 0)}</text>`).join("")}
    <text class="hp-yt" x="${L2 - 4}" y="${art === "tag" ? O - 8 : 8}">${mwh ? "MWh" : "kWh"}</text>
    ${jetzt > 0 ? `<line class="hp-heute" x1="${x2(jetzt)}" y1="${O}" x2="${x2(jetzt)}" y2="${H2 - U}"/>` : ""}${b3}</svg>`);
}
var TQ = { gemessen: "gemessen", vorhersage: "Vorhersage", tagesgang: "typischer Tagesgang" };
function kurve24(p4, z2) {
  const v2 = p4._holen(`tv:${p4.d.entry}:${z2.von}`, () => p4._hass.callWS({ type: "baustelle/tagesverlauf", entry_id: p4.d.entry, datum: z2.von }), z2.heute ? 6e5 : 36e5);
  if (v2 === void 0) return b2`<div class="hp-titel">Verlauf 24 h</div>${LAEDT6}`;
  const S3 = v2 && v2.stunden || [];
  if (S3.length !== 24) return A;
  const W = 340, H2 = 150, L2 = 30, R2 = 28, U = 18, O = 10, bw = (W - L2 - R2) / 24;
  const max = Math.max(0.1, ...S3.map((s4) => Math.max((s4[1] || 0) + (s4[2] || 0), s4[3] || 0))) * 1.1;
  const T2 = S3.map((s4) => s4[4]), tmin = Math.floor(Math.min(...T2) - 1), tmax = Math.ceil(Math.max(...T2) + 1);
  const x2 = (h3) => L2 + h3 * bw, y3 = (w2) => H2 - U - w2 / max * (H2 - U - O), yt = (t5) => H2 - U - (t5 - tmin) / (tmax - tmin) * (H2 - U - O);
  const svg2 = `<svg class="hp-dia hp-24" viewBox="0 0 ${W} ${H2}">
    ${(v2.heizzeit || []).map(([a3, b3]) => `<rect class="hp-plan" x="${x2(a3)}" y="${O}" width="${(b3 - a3) * bw}" height="${H2 - U - O}"/>`).join("")}
    ${(v2.heizzeit || []).length ? `<text class="hp-pt" x="${x2(v2.heizzeit[0][0]) + 3}" y="${O + 9}">Heizzeit</text>` : ""}
    ${[0, 0.5, 1].map((f3) => max / 1.1 * f3).map((w2) => `<line class="hp-gitter" x1="${L2}" y1="${y3(w2)}" x2="${W - R2}" y2="${y3(w2)}"/><text class="hp-yt" x="${L2 - 4}" y="${y3(w2) + 3}">${de(w2, w2 < 10 ? 1 : 0)}</text>`).join("")}
    <text class="hp-yt" x="${L2 - 4}" y="${O - 2}">kWh</text>
    ${[tmin, tmax].map((t5) => `<text class="hp-tt" x="${W - R2 + 4}" y="${yt(t5) + (t5 === tmax ? 8 : 0)}">${t5}°</text>`).join("")}
    ${S3.map(([h3, ist, prog]) => {
    const i7 = ist || 0, x0 = x2(h3) + bw * 0.12, b3 = bw * 0.76;
    return `${i7 ? `<rect class="hp-bi" x="${x0}" y="${y3(i7)}" width="${b3}" height="${y3(0) - y3(i7)}"/>` : ""}${prog ? `<rect class="hp-bp" x="${x0}" y="${y3(i7 + prog)}" width="${b3}" height="${y3(i7) - y3(i7 + prog)}"/>` : ""}`;
  }).join("")}
    ${S3[0][3] !== null ? `<path class="hp-ol" d="${S3.map((s4, h3) => `${h3 ? "L" : "M"}${(x2(h3) + bw / 2).toFixed(1)},${y3(s4[3]).toFixed(1)}`).join(" ")}"/>` : ""}
    <path class="hp-tl" d="${S3.map((s4, h3) => `${h3 ? "L" : "M"}${(x2(h3) + bw / 2).toFixed(1)},${yt(s4[4]).toFixed(1)}`).join(" ")}"/>
    ${[0, 6, 12, 18, 24].map((h3) => `<text class="hp-x" x="${x2(h3)}" y="${H2 - 4}">${h3}</text>`).join("")}
    ${zahl(v2.jetzt_h) ? `<line class="hp-heute" x1="${x2(v2.jetzt_h)}" y1="${O}" x2="${x2(v2.jetzt_h)}" y2="${H2 - U}"/><text class="hp-ht" x="${x2(v2.jetzt_h) + 3}" y="${H2 - U - 4}">jetzt</text>` : ""}</svg>`;
  const quellen = [...new Set(S3.map((s4) => s4[5]))].map((q) => TQ[q] || q).join(", dann ");
  return b2`<div class="hp-titel">Verlauf 24 h</div>${o5(svg2)}
    <div class="hp-leg2"><span><i class="q-ist"></i>gemessen je Stunde</span><span><i class="q-prog"></i>Prognose</span>
      ${S3[0][3] !== null ? b2`<span><i class="q-ol"></i>ohne Automatik</span>` : A}<span><i class="q-tl"></i>außen ${quellen}</span></div>
    <div class="leise">${v2.frei ? "Freier Tag: nur Frostschutz." : "Hell: Heizzeit laut Plan; außerhalb nur Frostschutz."}
      ${S3.some((s4) => s4[2]) ? " Die Prognose je Stunde verteilt den Tageswert nach Heizplan und Temperatur." : ""}
      ${S3[0][3] !== null ? v2.ohne_quelle === "baseline" ? " „Ohne Automatik“ je Stunde nach den Baseline-Messungen." : " „Ohne Automatik“ gleichmäßig rund um die Uhr (Schätzung bis zur Baseline)." : ""}</div>`;
}
function detail(h3, z2, art, p4) {
  const zeile3 = (k2, t5, kwh, e6) => b2`<div class=${k2}><span>${t5}</span><b>${de(kwh, 0)} kWh · ${eur(e6)}</b></div>`;
  const restText = !z2.ist ? "Prognose mit Automatik" : art === "tag" ? "Rest von heute" : `Prognose Rest ${art === "woche" ? "der Woche" : "des Monats"}`;
  return b2`<div class="glas-panel hp-det"><div class="hp-det-k"><b>${titel(z2, art)}${z2.heute ? " · heute" : ""}</b>
      <span class="leise">${zahl(z2.aussen) ? `Ø ${de(z2.aussen, 1)} °C außen · ` : ""}${z2.quellen.map((q) => QTEXT[q] || q).join(" + ")}</span></div>
    <div class="hp-det-z">
      ${zahl(z2.ist) && z2.ist > 0 ? zeile3("", b2`<i class="q-ist"></i>tatsächlich${z2.prog ? " bis jetzt" : ""}`, z2.ist, z2.ist_eur) : A}
      ${z2.prog ? zeile3("", b2`<i class="q-prog"></i>${restText}`, z2.prog, z2.prog_eur) : A}
      ${z2.prog && z2.ist ? zeile3("sum", "zusammen", z2.mit, z2.mit_eur) : A}
      ${z2.prog && zahl(z2.unten) && z2.oben - z2.unten > 0.5 ? b2`<div class="leise"><span>Spanne milder–kalter Winter</span><span>${de(z2.unten_eur, 0)}–${eur(z2.oben_eur)}</span></div>` : A}
      ${zahl(z2.ohne) ? zeile3("", b2`<i class="q-ohne"></i>ohne Automatik ${h3.ohne_hinweis ? "(Schätzung)" : "(gemessen)"}`, z2.ohne, z2.ohne_eur) : A}
      ${zahl(z2.gespart) ? b2`<div class="gesp"><span>gespart</span><b>≈ ${eur(z2.gespart_eur)}</b></div>` : A}
      ${h3.ohne_hinweis && (zahl(z2.ohne) || zahl(z2.gespart)) ? b2`<div class="hp-grob">⚠ ${h3.ohne_hinweis}</div>` : A}</div>
    ${art === "tag" ? kurve24(p4, z2) : A}</div>`;
}
function zeitraeume(p4, h3, art) {
  const P2 = (h3.perioden || {})[art] || [];
  if (!P2.length) return b2`<div class="leer">Keine Tage in der Heizperiode</div>`;
  const ab = p4.s.hpAb || 0, { Z: Z2, vor, nach } = fenster(P2, art, ab);
  const jetzt = Z2.findIndex((z2) => !z2.vorbei), wahl2 = Math.min(Z2.length - 1, p4.s.hpWahl ?? (jetzt < 0 ? Z2.length - 1 : jetzt));
  const geh = (d3) => () => {
    p4.s.hpAb = d3 === null ? 0 : ab + d3;
    p4.s.hpWahl = null;
    p4.neuZeichnen();
  };
  const nav = (d3, t5, an) => b2`<button class="chip glas-panel hp-nav" data-k=${`hp-nav${d3}`} ?disabled=${!an} @click=${geh(d3)}>${t5}</button>`;
  return b2`<div class="hp-kopf">${art !== "monat" ? nav(-1, "‹", vor) : A}
      <span class="hp-zr">${titel(Z2[0], art).split("–")[0]} – ${titel(Z2[Z2.length - 1], art).split("–").pop()}</span>
      ${art !== "monat" ? b2`${nav(1, "›", nach)}${ab ? b2`<button class="chip glas-panel hp-nav" @click=${geh(null)}>heute</button>` : A}` : A}</div>
    <div @click=${(e6) => {
    const g2 = e6.target.closest(".hp-b");
    if (g2) {
      p4.s.hpWahl = +g2.dataset.i;
      p4.neuZeichnen();
    }
  }}>${balkenSvg(Z2, art, wahl2)}</div>
    <div class="hp-leg2"><span><i class="q-ist"></i>tatsächlich</span><span><i class="q-prog"></i>Prognose mit Automatik</span><span><i class="q-ohne"></i>ohne Automatik</span>
      ${art === "tag" ? b2`<span class="leise">°C: Vorhersage · <em>kursiv</em> = Klimamittel</span>` : A}</div>
    ${ueberRand(Z2) ? b2`<div class="leise">↑ ohne Automatik reicht über den Rand – die Zahl zeigt das Antippen.</div>` : A}
    ${detail(h3, Z2[wahl2], art, p4)}`;
}
function hochrechnung(p4, h3) {
  const a3 = p4.s.hpAufl || "hp";
  const seg = b2`<div class="seg glas-panel hp-aufl">${AUFL.map(([k2, t5]) => b2`<button data-v=${k2} class=${a3 === k2 ? "on" : ""} @click=${() => {
    p4.s.hpAufl = k2;
    p4.s.hpAb = 0;
    p4.s.hpWahl = null;
    p4.neuZeichnen();
  }}>${t5}</button>`)}</div>`;
  return b2`${zahlZeile(h3)}${seg}${a3 === "hp" ? b2`${diagramm(h3)}${legende(h3)}<div class="leise hp-her">${herkunft(h3)}</div>` : zeitraeume(p4, h3, a3)}`;
}
function streu2(c4) {
  const P2 = c4.punkte || [], W = 320, H2 = 150, tx = (t5) => 28 + (t5 + 6) / 30 * (W - 36);
  const ymax = Math.max(10, ...P2.map((q) => q[1])), ty = (v2) => H2 - 18 - v2 / ymax * (H2 - 28);
  const knick = zahl(c4.grenze) ? `M${tx(-6)},${ty(c4.grundlast + c4.kwh_je_grad * (c4.grenze + 6))} L${tx(c4.grenze)},${ty(c4.grundlast)} L${tx(24)},${ty(c4.grundlast)}` : "";
  return o5(`<svg class="hp-streu" viewBox="0 0 ${W} ${H2}"><line class="hp-gitter" x1="28" y1="${H2 - 18}" x2="${W - 6}" y2="${H2 - 18}"/>
    ${[-5, 0, 5, 10, 15, 20].map((t5) => `<text x="${tx(t5)}" y="${H2 - 4}" text-anchor="middle">${t5}°</text>`).join("")}
    ${P2.map(([t5, v2]) => `<circle cx="${tx(t5).toFixed(1)}" cy="${ty(v2).toFixed(1)}" r="2.6"/>`).join("")}
    ${knick ? `<path d="${knick}"/><line class="hp-grenze" x1="${tx(c4.grenze)}" y1="10" x2="${tx(c4.grenze)}" y2="${H2 - 18}"/><text class="hp-gt" x="${tx(c4.grenze) + 3}" y="16">Heizgrenze ${de(c4.grenze, 1)}°</text>` : ""}</svg>`);
}
function signatur(p4, h3) {
  const C2 = h3.container || [];
  if (!C2.length) return b2`<div class="leer">Keine Container mit Heizung</div>`;
  const i7 = Math.min(p4.s.hpC || 0, C2.length - 1), c4 = C2[i7], name2 = (x2) => (p4.d.bereiche.find((b3) => b3.id === x2.bereich) || {}).name || x2.bereich;
  const leer2 = !(c4.punkte || []).length ? b2`<div class="leer">${name2(c4)}: noch keine ganzen Tage.</div>` : A;
  return b2`<label class="feld hp-wahl">Container<select @change=${(e6) => {
    p4.s.hpC = +e6.target.value;
    p4.neuZeichnen();
  }}>${C2.map((x2, j2) => b2`<option value=${j2} ?selected=${j2 === i7}>${name2(x2)}</option>`)}</select></label>
    ${leer2}${(c4.punkte || []).length ? streu2(c4) : A}
    ${c4.stand === "lernt" ? b2`<div class="leise">${name2(c4)} lernt noch: ${c4.tage} von 10 ganzen Tagen. Danach zeigt sich, ab welcher Außentemperatur geheizt wird.</div>` : A}
    <div class="hp-zeilen">${C2.map((x2) => b2`<div class="hp-zeile"><b>${name2(x2)}</b>
      <span>${zahl(x2.grenze) ? b2`ab <b>${de(x2.grenze, 1)} °C</b>` : zahl(x2.kwh_je_grad) ? "Heizgrenze noch offen" : "–"}</span>
      <span>${zahl(x2.kwh_je_grad) ? `+${de(x2.kwh_je_grad, 1)} kWh je Grad · Grundlast ${de(x2.grundlast, 1)} kWh/Tag` : ""}</span>
      <span>${stand(x2)}${zahl(x2.cv_rmse) ? b2`<span class="leise"> · ${de(x2.cv_rmse * 100, 0)} %</span>` : A}</span></div>`)}</div>
    <div class="leise">Je Tag Verbrauch gegen mittlere Außentemperatur (ganze Tage ohne Ausfall). Unter der Heizgrenze steigt der
      Verbrauch je Grad kälter; die Güte ist die mittlere Abweichung (bis 20 % gut, bis 30 % brauchbar).</div>`;
}
function klima(p4, h3) {
  const K = h3.klima || [], min2 = Math.min(-2, ...K), max = Math.max(22, ...K), y3 = (v2) => (v2 - min2) / (max - min2) * 100;
  return b2`<div class="hp-monate">${K.map((t5, i7) => b2`<div class="hp-m ${imZeitraum(i7 + 1, p4.d.hp) ? "hp" : ""}"><i style="height:${y3(t5)}%"></i><b>${de(t5, 1)}</b><span>${MONATE[i7]}</span></div>`)}</div>
    <div class="leise">Klimamittel ${h3.klima_vorgabe ? "Graz 1991–2020 (Vorgabe)" : "(eigene Werte)"} · hervorgehoben: Heizperiode.
      <a class="hp-link nur-admin" @click=${p4.nurAdmin(() => p4.einblenden("hp-klima"))}>Klimamittel ändern ›</a></div>
    ${(h3.vorhersage || []).length ? b2`<div class="hp-vh"><b>Vorhersage</b>${h3.vorhersage.map(([t5, v2]) => b2`<span class="chip glas-panel">${t5.slice(8, 10)}.${t5.slice(5, 7)}. ${de(v2, 1)}°</span>`)}</div>` : A}
    <div class="hp-kz">${zahl(h3.hgt_rest) ? b2`<div><b>${de(h3.hgt_rest, 0)}</b><span>Heizgradtage bis ${tagText(h3.ende)}</span></div>` : A}
      ${zahl(h3.normjahr_eur) ? b2`<div><b>${eur(h3.normjahr_eur)}</b><span>im Normjahr (witterungsbereinigt)</span></div>` : A}</div>`;
}
var REITER = [["hoch", "Hochrechnung", "Prognose"], ["sig", "Signatur"], ["klima", "Klima"]];
function heizperiodeVorlage(p4, A2, start = "hoch") {
  const d3 = p4.d, h3 = A2 && A2.hochrechnung, r5 = p4.s.hpReiter || start, [von, bis] = d3.hp;
  return b2`<div class="glas-panel block hp-karte"><div class="block-kopf"><b>Heizperiode</b>
      <button class="chip glas-panel hp-zeit nur-admin" @click=${p4.nurAdmin(() => p4.einblenden("zeitraum-bs"))}>${MONATE[von - 1]}–${MONATE[bis - 1]}${h3 && h3.ende ? ` · bis ${tagText(h3.ende)}` : ""} ✎</button></div>
    <div class="seg glas-panel hp-reiter">${REITER.map(([k2, t5, kurz]) => b2`<button data-v=${k2} class=${r5 === k2 ? "on" : ""} @click=${() => {
    p4.s.hpReiter = k2;
    p4.neuZeichnen();
  }}>${p4.narrow && kurz ? kurz : t5}</button>`)}</div>
    ${!A2 ? LAEDT6 : !h3 || !zahl(h3.mit_kwh) ? b2`<div class="leer">Noch zu wenige Tage für eine Hochrechnung</div>` : r5 === "sig" ? signatur(p4, h3) : r5 === "klima" ? klima(p4, h3) : hochrechnung(p4, h3)}</div>`;
}
function hpKlima(p4, s4) {
  const A2 = p4.awDaten(p4.s.aw.zeitraum, p4.zrV("aw")), h3 = A2 && A2.hochrechnung, K = s4.werte ||= [...h3 && h3.klima || []];
  const speichern = (wert2) => p4.setzen(["heizung", "klimamittel"], wert2, "Gespeichert").then(() => p4.schliessen());
  return b2`${GRIFF8}<div class="block-kopf"><h3>Klimamittel</h3><span class="leise">Monatsmittel außen, °C</span></div>
    <div class="glas-panel liste hp-eingabe">${K.map((t5, i7) => b2`<label class="feld">${MONATE_VOLL[i7]}<input inputmode="decimal" .value=${de(t5, 1)}
      @change=${(e6) => {
    const v2 = parseFloat(String(e6.target.value).replace(",", "."));
    if (!isNaN(v2)) K[i7] = v2;
  }}></label>`)}</div>
    <div class="leise">Vorgabe: Graz 1991–2020. Für eine andere Gegend die Klimamittel der nächsten Station von GeoSphere Austria
      eintragen. Die Hochrechnung nimmt sie für alle Tage ohne Vorhersage.</div>
    <div class="hp-knoepfe"><button class="knopf amber" data-k="hp-speichern" @click=${() => speichern(K.map((v2) => Math.round(v2 * 10) / 10))}>Speichern</button>
      <button class="knopf leise-k" data-k="hp-vorgabe" @click=${() => speichern(null)}>Vorgabe Graz</button>
      <button class="knopf leise-k" @click=${() => p4.schliessen()}>Abbrechen</button></div>`;
}
var HEIZPERIODE_EINBLENDUNGEN = { "hp-klima": hpKlima };
var HEIZPERIODE_CSS = `
.seg.hp-aufl { margin: 2px 0 8px; } .seg.hp-aufl button, .seg.hp-reiter button { padding: 6px 2px; min-width: 0; flex: 1 1 0; font-size: 12px; }
.hp-kopf { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; } .hp-zr { flex: 1; text-align: center; font-size: 13px; font-weight: 600; }
.hp-nav { font-size: 13px; padding: 3px 10px; cursor: pointer; } .hp-nav[disabled] { opacity: .35; }
.hp-balken { cursor: pointer; } .hp-balken .hp-hit { fill: transparent; } .hp-balken .hp-b.on .hp-hit { fill: rgba(127,127,127,.12); }
.hp-balken .hp-bi { fill: var(--s3); } .hp-balken .hp-bp { fill: var(--s1); opacity: .45; } .hp-balken .hp-bo { fill: var(--s2); opacity: .75; }
.hp-balken path.hp-bs { stroke: var(--s1); stroke-width: 1.2; fill: none; }
.hp-balken .hp-bt { text-anchor: middle; fill: var(--ink); } .hp-balken .hp-bt.kl { font-style: italic; fill: var(--ink2); }
.hp-balken .hp-x, .hp-balken .hp-x2 { text-anchor: middle; } .hp-balken .heute { fill: var(--amber); font-weight: 600; }
.hp-leg2 { display: flex; flex-wrap: wrap; gap: 4px 12px; font-size: 12px; margin: 2px 0 6px; }
.hp-leg2 i, .hp-det-z i { display: inline-block; width: 10px; height: 10px; border-radius: 2px; margin-right: 5px; vertical-align: -1px; }
.q-ist { background: var(--s3); } .q-prog { background: var(--s1); opacity: .45; } .q-ohne { background: var(--s2); opacity: .75; }
.hp-det { padding: 10px 12px; border-radius: 14px; margin: 4px 0; } .hp-det-k { display: flex; flex-direction: column; margin-bottom: 4px; }
.hp-det-z > div { display: flex; justify-content: space-between; gap: 8px; font-size: 13px; padding: 3px 0; } .hp-det-z b { white-space: nowrap; }
.hp-titel { font-size: 12px; color: var(--ink2); text-transform: uppercase; letter-spacing: .04em; margin: 12px 0 2px; }
.hp-24 .hp-bi { fill: var(--s3); } .hp-24 .hp-bp { fill: var(--s1); opacity: .45; } .hp-24 .hp-plan { fill: var(--amber); opacity: .14; }
.hp-24 .hp-pt { fill: var(--amber); font-size: 8px; } .hp-24 .hp-x { text-anchor: middle; } .hp-24 .hp-tt { fill: var(--ink); }
.hp-24 path.hp-ol { fill: none; stroke: var(--s2); stroke-width: 1.8; stroke-dasharray: 2 3; } .hp-24 path.hp-tl { fill: none; stroke: var(--ink); stroke-width: 1.6; }
.q-ol, .q-tl { background: none !important; height: 0 !important; width: 14px !important; } .q-ol { border-top: 2px dotted var(--s2); } .q-tl { border-top: 2px solid var(--ink); }
.hp-det-z .sum { border-top: 1px solid rgba(127,127,127,.2); } .hp-det-z .gesp b { color: #30d158; }
.hp-grob { display: block; font-size: 12px; color: var(--amber); }   /* BSM-033.05: ohne/gespart nur grobe Obergrenze */
.hp-zeit { font-size: 12px; padding: 4px 10px; cursor: pointer; white-space: nowrap; }
.hp-reiter { margin: 4px 0 8px; } .hp-zahl { font-size: 26px; font-weight: 600; margin: 4px 0 2px; } .hp-zahl .leise { font-size: 14px; font-weight: 400; }
.hp-dia { width: 100%; max-width: 540px; height: auto; display: block; margin: 6px auto; }
.hp-dia text, .hp-streu text { font-size: 9px; fill: var(--ink2); } .hp-dia .hp-yt { text-anchor: end; }
.hp-gitter { stroke: rgba(127,127,127,.18); }
.hp-dia path { fill: none; stroke-width: 2.4; } .hp-dia .hp-ist { stroke: var(--s3); stroke-width: 3; }
.hp-dia .hp-prog { stroke: var(--s1); stroke-dasharray: 6 4; } .hp-dia .hp-ohne { stroke: var(--s2); stroke-dasharray: 2 3; }
.hp-dia .hp-band { fill: var(--s1); opacity: .2; stroke: none; }
.hp-dia .hp-pfeil { fill: var(--s2) !important; font-size: 11px !important; font-weight: 700; text-anchor: middle; } .hp-dia .hp-raus { fill: var(--s2) !important; }   /* FE-0033 */
.hp-heute, .hp-grenze { stroke: var(--amber); stroke-dasharray: 3 3; } .hp-ht, .hp-gt { fill: var(--amber) !important; }
.hp-leg { display: flex; flex-direction: column; gap: 4px; font-size: 13px; margin: 4px 0; }
.hp-leg i { display: inline-block; width: 18px; height: 0; margin-right: 6px; vertical-align: middle; border-top: 3px solid; }
.hp-leg .l-ist { border-color: var(--s3); } .hp-leg .l-prog { border-color: var(--s1); border-top-style: dashed; } .hp-leg .l-ohne { border-color: var(--s2); border-top-style: dotted; }
.hp-her { margin-top: 6px; } .hp-link { cursor: pointer; color: var(--blau); white-space: nowrap; }
.hp-st { font-size: 12px; white-space: nowrap; } .gruen-t { color: #30d158; }
.hp-wahl select { width: 100%; }
.hp-streu { width: 100%; max-width: 520px; height: auto; display: block; margin: 4px auto; }
.hp-streu circle { fill: var(--ink2); opacity: .7; } .hp-streu path { fill: none; stroke: var(--s1); stroke-width: 2.5; }
.hp-zeilen { display: flex; flex-direction: column; margin: 6px 0; }
.hp-zeile { display: flex; flex-wrap: wrap; gap: 2px 12px; padding: 6px 0; font-size: 13px; border-bottom: 1px solid rgba(127,127,127,.15); } .hp-zeile > b { flex: 1 1 100%; }
.hp-monate { display: grid; grid-template-columns: repeat(12, 1fr); gap: 3px; height: 120px; align-items: end; margin: 6px 0; }
.hp-m { display: flex; flex-direction: column; align-items: center; justify-content: flex-end; height: 100%; font-size: 10px; min-width: 0; }
.hp-m i { width: 70%; border-radius: 3px 3px 0 0; background: rgba(127,127,127,.3); } .hp-m.hp i { background: var(--s2); }
.hp-m b { font-weight: 500; font-size: 9px; } .hp-m span { color: var(--ink2); }
.hp-vh { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; margin: 8px 0; } .hp-vh .chip { font-size: 12px; padding: 4px 8px; }
.hp-kz { display: flex; gap: 16px; flex-wrap: wrap; } .hp-kz div { display: flex; flex-direction: column; } .hp-kz b { font-size: 18px; } .hp-kz span { font-size: 12px; color: var(--ink2); }
.hp-eingabe { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 4px 10px; padding: 10px 14px; } .hp-eingabe input { width: 100%; min-width: 0; box-sizing: border-box; }
.hp-knoepfe { display: flex; flex-direction: column; gap: 8px; margin-top: 8px; }`;

// src/ansichten/kacheln.js
var roh = (v2) => o5(String(v2 ?? ""));
var kopf3 = (ic, name2) => b2`<div class="kk-kopf"><span class="kk-ic">${ic}</span><small>${name2}</small></div>`;
var huelle = (p4, x2, i7, ort2, gr, inhalt, tip) => ort2 === "kat" ? b2`<div class="glas-panel kk kk-${gr}">${inhalt}</div>` : b2`<div class="glas-panel kk kk-${gr}" role="button" tabindex="0" data-ort=${ort2} data-i=${i7} title=${tip} @click=${() => p4.kkAufI(ort2, i7)}>${inhalt}</div>`;
var fb = (b3) => BEREICH_FARBEN[b3.f % BEREICH_FARBEN.length];
var breiteS = (zahlText, einh) => {
  const t5 = String(zahlText ?? "").replace(/<[^>]*>/g, "").replace(/&[a-z#0-9]+;/gi, "x");
  const em = [...t5].reduce((a3, ch) => a3 + (/\d/.test(ch) ? 0.56 : /[:.,/]/.test(ch) ? 0.3 : /\s/.test(ch) ? 0.28 : 0.6), 0) * 1.03;
  return `--kk-n:${Math.max(0.6, em).toFixed(2)};--kk-e:${einh ? Math.round((String(einh).length + 1) * 7.5) : 0}px`;
};
function vergleich2(p4, x2, i7, ort2, c4) {
  const e6 = KK[x2.k], W0 = p4.vgWerte(x2, c4), R2 = W0.R, gr = x2.st, eur2 = W0.eur;
  const wert2 = (v2) => zahl(v2) ? eur2 ? `${de(v2, 2)} €` : `${de(v2, v2 < 100 ? 1 : 0)} kWh` : "–";
  const { vorne, hinten, min: min2 } = W0, diff = vorne && hinten && vorne !== hinten ? vorne.su - hinten.su : null;
  const unter = diff === null ? R2.length ? "gleich viel" : "keine Container" : b2`${vorne.b.name} <b>+${wert2(diff)}</b>${min2 > 0 ? ` (+${de((vorne.su / min2 - 1) * 100, 0)} %)` : ""} zu ${hinten.b.name}`;
  const zeilen = b2`<div class="vg-zeilen">${R2.map((q) => b2`<div><span><i style="background:${fb(q.b)}"></i>${q.b.name}</span><b>${wert2(q.su)}</b></div>`)}</div>`;
  const k2 = kopf3(e6.ic, e6.name);
  let inhalt;
  if (gr === "S") inhalt = b2`${k2}${zeilen}`;
  else if (gr === "M") inhalt = b2`<div class="kk-m-l">${k2}<span class="kk-wo">${W0.wann}</span><span class="kk-vgl">${unter}</span></div><div class="kk-m-r">${o5(kkBalken(R2.map((q) => [q.b.name, q.su || 0, wert2(q.su), fb(q.b)])))}</div>`;
  else inhalt = b2`${k2}<div class="kk-l-zeile"><span class="kk-wo">${W0.wann}</span></div><span class="kk-vgl">${unter}</span>${x2.dia !== false ? b2`<div class="kk-dia">${roh(p4.vgDia(W0, x2.art) || '<div class="leer">Noch keine Werte</div>')}</div>${zeilen}` : b2`<table class="vg-tab"><tr><th></th><th>kWh</th><th>€</th><th>mehr</th><th>Heizzeit</th><th>kWh/h</th></tr>${R2.map((q) => b2`<tr><td><i style="background:${fb(q.b)}"></i>${q.b.name}</td>
          <td>${zahl(q.kwh) ? de(q.kwh, 1) : "–"}</td><td>${zahl(q.kwh) ? de(q.kwh * p4.d.e.preis, 2) : "–"}</td><td>${zahl(q.su) && zahl(min2) && q.su > min2 ? `+${wert2(q.su - min2)}` : "–"}</td><td>${stdMin(q.h)}</td><td>${q.h > 0 ? de(q.kwh / q.h, 2) : "–"}</td></tr>`)}</table>`}`;
  return huelle(p4, x2, i7, ort2, gr, inhalt, `${p4.kkName(x2)} – antippen öffnet den Verbrauch`);
}
function preis(p4, x2, i7, ort2, c4) {
  const sim = p4.simPreis(), A2 = p4.awDaten(c4.z, c4.v, ort2 === "aw" ? p4.s.awScope || "diese" : "diese", p4.d, sim), S22 = A2 && A2.summen || {}, S3 = c4.S;
  const echt = S3.eur, simE = S22.eur, kwh = S3.kwh, diff = zahl(simE) && zahl(echt) ? simE - echt : null, gr = x2.st, k2 = kopf3("🧮", "Preis simulieren");
  const knopfSim = (dd, t5, label) => b2`<button class="glas-panel chip" data-d=${dd} aria-label=${label} @click=${(e6) => {
    e6.stopPropagation();
    return p4.spSim(dd);
  }}>${t5}</button>`;
  const regler = b2`<div class="sp-sim">${knopfSim(-0.01, "−", "Preis niedriger")}<b>${de(sim, 2)} €</b>${knopfSim(0.01, "+", "Preis höher")}</div>`;
  const zahlT = zahl(simE) ? de(simE, simE < 100 ? 2 : 0) : "–", zahlH = b2`<b class="kk-zahl" style=${breiteS(zahlT, "€")}>${zahlT}<small> €</small></b>`;
  const unter = diff === null ? "lädt …" : `${diff > 0 ? "+" : diff < 0 ? "−" : "±"}${de(Math.abs(diff), 2)} € gegenüber tatsächlich ${de(echt, 2)} €`;
  let inhalt;
  if (gr === "S") inhalt = b2`${k2}${zahlH}<span class="kk-wo">bei ${de(sim, 2)} €/kWh</span>`;
  else if (gr === "M") inhalt = b2`<div class="kk-m-l">${k2}${zahlH}<span class="kk-vgl">${unter}</span></div><div class="kk-m-r">${regler}<span class="kk-wo">${zahl(kwh) ? de(kwh, 0) : "–"} kWh · ${p4.zrText(c4.z, c4.v)}</span></div>`;
  else inhalt = b2`${k2}<div class="kk-l-zeile">${zahlH}<span class="kk-wo">${p4.zrText(c4.z, c4.v)}</span></div><span class="kk-vgl">${unter}</span>${regler}
      <div class="kk-dia zeilen"><div class="kk-dia-in">${o5(kkBalken([["tatsächlich", echt || 0, zahl(echt) ? `${de(echt, 2)} €` : "–", "var(--s1)"], [`bei ${de(sim, 2)} €`, simE || 0, zahl(simE) ? `${de(simE, 2)} €` : "–", "#bf5af2"]]))}</div></div>
      <div class="leise">tatsächlich = je Tag der damals gültige Preis · simuliert = alle ${zahl(kwh) ? de(kwh, 0) : "–"} kWh × ${de(sim, 2)} €</div>`;
  return huelle(p4, x2, i7, ort2, gr, inhalt, "antippen: Auswertung mit diesem Preis");
}
function kachelVorlage(p4, x2, i7, ort2, c4) {
  if (KK[x2.k] && KK[x2.k].je === "v") return vergleich2(p4, x2, i7, ort2, c4);
  if (x2.k === "b-preis") return preis(p4, x2, i7, ort2, c4);
  const e6 = KK[x2.k], b3 = e6.je ? p4.kkB(x2) : null, gr = x2.st, k2 = kopf3(e6.ic, e6.name);
  if (e6.je && !b3) return b2`<div class="glas-panel kk">${k2}<span class="kk-wo">kein ${e6.je === "p" ? "Schacht" : "Container"} vorhanden</span></div>`;
  const D2 = p4.kkDaten(x2, b3, c4), mitDia = gr === "L" && x2.dia !== false;
  const wo = b2`<span class="kk-wo">${b3 ? b3.name : D2.wo || ""}</span>`, zahlH = b2`<b class="kk-zahl" style=${breiteS(D2.zahl, D2.einh)}>${roh(D2.zahl)}${D2.einh ? b2`<small> ${D2.einh}</small>` : A}</b>`;
  let inhalt;
  if (gr === "S") inhalt = b2`${k2}${zahlH}${!b3 && D2.unter ? b2`<span class="kk-wo">${roh(D2.unter)}</span>` : wo}`;
  else if (gr === "M") {
    const rechts = D2.mini || funke(D2.funke, D2.farbe);
    inhalt = b2`<div class="kk-m-l">${k2}${zahlH}<span class="kk-vgl">${roh(D2.vgl)}</span>${b3 ? wo : A}</div><div class="kk-m-r">${rechts ? roh(rechts) : b2`<span class="kk-wo">${b3 ? D2.wo || "" : ""}</span>`}</div>`;
  } else {
    const dia = mitDia ? D2.dia(`kk-${ort2}-${i7}-${x2.k}-${b3 ? b3.id : "b"}-${c4.zc}${c4.vc}`, p4.narrow ? 320 : 640) : "";
    inhalt = b2`${k2}<div class="kk-l-zeile">${zahlH}${wo}</div><span class="kk-vgl">${roh(D2.vgl)}</span>${mitDia ? b2`<div class="kk-dia ${D2.zeilen ? "zeilen" : ""}">${dia ? roh(dia) : b2`<div class="leer">Noch keine Werte</div>`}</div>` : b2`<div class="kk-kennz">${(D2.kennz || []).map(([kk, v2]) => b2`<div><b>${roh(v2)}</b><span>${kk}</span></div>`)}</div>`}`;
  }
  return huelle(p4, x2, i7, ort2, gr, inhalt, `${p4.kkName(x2)} – antippen öffnet die Ansicht`);
}
function rasterVorlage(p4, ort2, teile, layout) {
  return b2`<div class="aw-raster ${layout ? "layout" : ""}" data-ort=${ort2}>${teile.map(({ x: x2, i: i7, inhalt }) => b2`<div class="aw-frei-s ${p4.s.kkFrisch === `${ort2}:${x2.k}:${x2.id || ""}` ? "kk-frisch" : ""}" data-i=${i7} style="--w:${x2.w};--h:${x2.h}"><div class="aw-inhalt">${inhalt}</div>
        ${layout ? b2`<div class="aw-ueber"><span class="aw-griff" data-zug="move" title="verschieben">⠿</span><span class="aw-name">${p4.kkName(x2)} · <b class="aw-mass">${x2.st}</b></span>
          ${KK[x2.k] && x2.st === "L" ? b2`<button class="aw-dia-k ${x2.dia !== false ? "on" : ""}" title="mit oder ohne Diagramm" aria-label="Diagramm ein/aus" @click=${() => p4.kkDiaUm(ort2, i7)}>📈</button>` : A}
          ${KK[x2.k] && KK[x2.k].je === "v" && x2.st === "L" && x2.dia !== false ? b2`<button class="aw-dia-k aw-art-k on" title="Balken oder Linien" aria-label="Balken oder Linien" @click=${() => p4.vgArtUm(ort2, i7)}>${x2.art === "linien" ? "〰" : "▮▮"}</button>` : A}
          <button class="aw-x nur-admin" aria-label=${KK[x2.k] ? "entfernen" : "ausblenden"} @click=${p4.nurAdmin(() => p4.kkWeg(ort2, i7))}>✕</button><span class="aw-groesse" data-zug="size" title="Größe ändern">◢</span></div>` : A}</div>`)}
      ${layout ? A : b2`<button class="glas-panel kk-neu-k" data-ort=${ort2} @click=${() => p4.kkPlus(ort2)}><span>+</span>Kachel</button>`}</div>`;
}
function bereichVorlage(p4) {
  const L2 = p4.kkListe("ue"), layout = p4.s.kkLayout, c4 = p4.kkCtx("ue");
  const teile = L2.map((x2, i7) => ({ x: x2, i: i7, inhalt: kachelVorlage(p4, x2, i7, "ue", c4) }));
  return b2`<div class="kk-bereich"><div class="kk-titel"><b>Meine Kacheln</b>
        <span class="kk-knoepfe">${L2.length ? b2`<button class="glas-panel chip ${layout ? "amber" : ""}" @click=${() => p4.kkLayoutUm()}>${layout ? "✓ Fertig" : "✥ Anpassen"}</button>` : A}<button class="glas-panel chip kk-plus" data-ort="ue" @click=${() => p4.kkPlus("ue")}>＋ Kachel</button></span></div>
      ${layout ? b2`<div class="leise aw-hinweis">Kachel am Griff ⠿ ziehen zum Verschieben · am Griff ◢ ziehen für die Größe · 📈 Diagramm der großen Kachel ein/aus · ✕ entfernen</div>` : A}
      ${rasterVorlage(p4, "ue", teile, layout)}</div>`;
}
function wahlVergleich(p4, s4, e6) {
  const B2 = p4.d.bereiche.filter((b3) => !b3.pumpe), ort2 = s4.ort === "aw" ? "Auswertung" : "Übersicht", z2 = () => p4.neuZeichnen();
  s4.ids = (s4.ids || B2.slice(0, 2).map((b3) => b3.id)).filter((id) => B2.some((b3) => b3.id === id));
  s4.zr ||= "Tag";
  s4.vgArt ||= "balken";
  if (!["S", "M", "L"].includes(s4.st)) s4.st = "M";
  const um = (id) => {
    const j2 = s4.ids.indexOf(id);
    if (j2 >= 0) {
      if (s4.ids.length <= 2) return p4.toast("Mindestens 2 Container");
      s4.ids.splice(j2, 1);
    } else {
      if (s4.ids.length >= 4) return p4.toast("Höchstens 4 Container");
      s4.ids.push(id);
    }
    return z2();
  };
  return b2`<div class="kk-wahl"><div class="gruppe-t">Container · 2 bis 4 wählen</div><div class="vb-wer vg-chips">${B2.map((b3) => b2`<button data-id=${b3.id} class=${s4.ids.includes(b3.id) ? "on" : ""} @click=${() => um(b3.id)}><i style="background:${fb(b3)}"></i>${b3.name}</button>`)}</div>
      ${s4.ort === "aw" ? b2`<div class="leise">Zeitraum: der gewählte der Auswertung</div>` : b2`<div class="gruppe-t">Zeitraum</div><div class="seg">${[["Tag", "heute"], ["Woche", "diese Woche"], ["Monat", "dieser Monat"]].map(([k2, t5]) => b2`<button data-v=${k2} class=${s4.zr === k2 ? "on" : ""} @click=${() => {
    s4.zr = k2;
    z2();
  }}>${t5}</button>`)}</div>`}
      <div class="gruppe-t">Größe</div><div class="seg">${KK_GROESSE.map(([g2, t5, m3]) => b2`<button data-v=${g2} class=${s4.st === g2 ? "on" : ""} @click=${() => {
    s4.st = g2;
    z2();
  }}>${t5} · ${m3}</button>`)}</div>
      ${s4.st === "L" ? b2`<div class="zeile kk-sw"><div><span>mit Diagramm</span><div class="leise">aus: Tabelle kWh, €, mehr als der sparsamste, Heizzeit, kWh je Stunde</div></div>${schalterVorlage(s4.dia, () => {
    s4.dia = !s4.dia;
    z2();
  }, "vor-ort")}</div>
        ${s4.dia ? b2`<div class="seg">${[["balken", "▮▮ Balken"], ["linien", "〰 Linien"]].map(([k2, t5]) => b2`<button data-v=${k2} class=${s4.vgArt === k2 ? "on" : ""} @click=${() => {
    s4.vgArt = k2;
    z2();
  }}>${t5}</button>`)}</div>` : A}` : A}
      <div class="gruppe-t">Vorschau</div><div class="aw-raster kk-vorschau"><div class="aw-frei-s" style="--w:${s4.st === "S" ? 1 : 2};--h:${s4.st === "L" ? 2 : 1}"><div class="aw-inhalt">${kachelVorlage(p4, { k: e6.k, ids: s4.ids, zr: s4.zr, st: s4.st, dia: s4.dia, art: s4.vgArt }, 0, "kat", p4.kkCtx(s4.ort))}</div></div></div>
      <button class="knopf amber" ?disabled=${s4.ids.length < 2} @click=${() => p4.kkHinzu(s4)}>Zur ${ort2} hinzufügen</button></div>`;
}
function wahl(p4, s4, e6) {
  if (e6.je === "v") return wahlVergleich(p4, s4, e6);
  const opts = e6.je ? p4.kkWahlListe(e6.k) : [], ort2 = s4.ort === "aw" ? "Auswertung" : "Übersicht", z2 = () => p4.neuZeichnen();
  if (e6.je && !opts.some((b3) => b3.id === s4.id)) s4.id = opts[0] && opts[0].id;
  if (!e6.stufen.some((q) => q[0] === s4.st)) s4.st = (e6.stufen.find((q) => q[0] === "M") || e6.stufen[0])[0];
  if (e6.baustein) {
    const x2 = p4.awAuswahl().find((y3) => y3.k === e6.k);
    return b2`<div class="kk-wahl"><div class="gruppe-t">Größe</div><div class="seg">${e6.stufen.map(([g2, w2, h3]) => b2`<button data-v=${g2} class=${s4.st === g2 ? "on" : ""} @click=${() => {
      s4.st = g2;
      z2();
    }}>${g2} · ${w2}×${h3}</button>`)}</div>
        ${x2 && x2.an ? b2`<div class="leise">ist schon in der Auswertung – „Hinzufügen“ stellt nur die Größe um</div>` : A}<button class="knopf amber" @click=${() => p4.kkHinzu(s4)}>Zur Auswertung hinzufügen</button></div>`;
  }
  return b2`<div class="kk-wahl">
      ${e6.je ? b2`<div class="gruppe-t">${e6.je === "p" ? "Schacht" : "Container"}${e6.je === "f" ? " · nur mit Fühler" : ""}</div><div class="vb-wer">${opts.map((b3) => b2`<button data-id=${b3.id} class=${b3.id === s4.id ? "on" : ""} @click=${() => {
    s4.id = b3.id;
    z2();
  }}><i style="background:${fb(b3)}"></i>${b3.name}</button>`)}</div>` : A}
      <div class="gruppe-t">Größe</div><div class="seg">${KK_GROESSE.map(([g2, t5, m3]) => b2`<button data-v=${g2} class=${s4.st === g2 ? "on" : ""} @click=${() => {
    s4.st = g2;
    z2();
  }}>${t5} · ${m3}</button>`)}</div>
      <div class="leise">${{ S: "Symbol und eine Zahl", M: "Zahl, Vergleich und Mini-Verlauf", L: s4.dia ? "mit Diagramm" : "vier Kennzahlen statt Diagramm" }[s4.st]}</div>
      ${s4.st === "L" ? b2`<div class="zeile kk-sw"><div><span>mit Diagramm</span><div class="leise">aus: vier Kennzahlen statt Diagramm</div></div>${schalterVorlage(s4.dia, () => {
    s4.dia = !s4.dia;
    z2();
  }, "vor-ort")}</div>` : A}
      <div class="gruppe-t">Vorschau</div><div class="aw-raster kk-vorschau"><div class="aw-frei-s" style="--w:${s4.st === "S" ? 1 : 2};--h:${s4.st === "L" ? 2 : 1}"><div class="aw-inhalt">${kachelVorlage(p4, { k: e6.k, id: s4.id, st: s4.st, dia: s4.dia }, 0, "kat", p4.kkCtx(s4.ort))}</div></div></div>
      <button class="knopf amber" @click=${() => p4.kkHinzu(s4)}>Zur ${ort2} hinzufügen</button></div>`;
}
function treffer(p4, s4) {
  const q = (s4.q || "").toLowerCase().split(/\s+/).filter(Boolean), bt = (k2) => (KK_BEREICHE.find((x2) => x2[0] === k2) || [])[1] || "", z2 = () => p4.neuZeichnen();
  const markiere = (t5) => {
    let h3 = esc(t5);
    for (const w2 of q.filter((x2) => x2.length > 1)) h3 = h3.replace(new RegExp(`(${w2.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`, "gi"), "<mark>$1</mark>");
    return o5(h3);
  };
  const L2 = p4.kkEintraege(s4.ort).filter((e6) => ((s4.f || "alle") === "alle" || e6.ber === s4.f) && (!s4.nurJe || e6.je) && (!s4.nurEur || /euro/.test(`${e6.such} ${e6.name} ${e6.text}`.toLowerCase())) && q.every((w2) => `${e6.name} ${e6.text} ${e6.such} ${bt(e6.ber)}`.toLowerCase().includes(w2)));
  if (!L2.length) return b2`<div class="kk-tr-leer">Keine Kachel gefunden – anderes Wort oder Filter „Alle“.</div>`;
  const zeile3 = (e6) => {
    if (s4.k === e6.k) s4.k = null;
    else {
      s4.k = e6.k;
      s4.id = null;
    }
    z2();
  };
  const groesse2 = (e6, g2) => (ev) => {
    ev.stopPropagation();
    if (s4.k !== e6.k) s4.id = null;
    s4.k = e6.k;
    s4.st = g2;
    z2();
  };
  const an = p4.kkListe(s4.ort).filter((x2) => x2.an);
  const wer = (e6, D2) => D2.map((x2) => {
    const b3 = e6.je && e6.je !== "v" ? p4.kkB(x2) : null;
    return b3 ? `${b3.name} ${x2.st}` : x2.st;
  });
  return b2`<div class="leise">${L2.length} ${L2.length === 1 ? "Kachel" : "Kacheln"}</div>${L2.map((e6) => {
    const on = s4.k === e6.k, D2 = an.filter((x2) => x2.k === e6.k), st = new Set(D2.map((x2) => x2.st));
    const je = D2.length && e6.je && e6.je !== "v" ? wer(e6, D2).join(" · ") : "";
    return b2`<div class="kk-tr-zeile ${on ? "on" : ""} ${D2.length ? "kk-drin" : ""}" data-k=${e6.k} role="button" tabindex="0" @click=${() => zeile3(e6)}><span class="kk-z-ic">${e6.ic}</span><div class="kk-z-t"><b>${markiere(e6.name)}</b>${je ? b2`<span class="kk-tr-wer">${je}</span>` : A}<div class="leise">${bt(e6.ber)} · ${markiere(e6.text)}</div></div>
        <span class="kk-tr-gr">${e6.stufen.map(([g2]) => b2`<button data-v=${g2} class="${on && s4.st === g2 ? "on" : ""} ${st.has(g2) ? "kk-gr-drin" : ""}" title=${st.has(g2) ? "schon eingebaut in dieser Größe" : A} @click=${groesse2(e6, g2)}>${g2}</button>`)}</span></div>${on ? b2`${D2.length && !e6.baustein ? b2`<div class="leise kk-offen-hin">schon ${D2.length > 1 ? `${D2.length}× ` : ""}eingebaut (${wer(e6, D2).join(", ")}) – „Hinzufügen“ legt eine weitere an</div>` : A}${wahl(p4, s4, e6)}` : A}`;
  })}`;
}
function katalogEinblendung(p4, s4) {
  const z2 = () => p4.neuZeichnen(), chip3 = (an, t5, fn) => b2`<button class="kk-chip ${an ? "on" : ""}" @click=${() => {
    fn();
    s4.k = null;
    z2();
  }}>${t5}</button>`;
  return b2`<div class="griff"></div><div class="kk-kat kk-such"><h3>＋ Kachel · ${s4.ort === "aw" ? "Auswertung" : "Übersicht"}</h3>
      <input type="search" data-f="q" placeholder="Suchen – z. B. Kosten, Temperatur, Pumpe" value=${s4.q || ""} .value=${l3(s4.q || "")} autocomplete="off" @input=${(e6) => {
    s4.q = e6.target.value;
    s4.k = null;
    z2();
  }}>
      <div class="kk-chips">${[["alle", "Alle"], ...KK_BEREICHE.filter(([k2]) => k2 !== "auswertung" || s4.ort === "aw")].map(([k2, t5]) => chip3((s4.f || "alle") === k2, t5, () => {
    s4.f = k2;
  }))}
        ${chip3(s4.nurJe, "je Container", () => {
    s4.nurJe = !s4.nurJe;
  })}${chip3(s4.nurEur, "€", () => {
    s4.nurEur = !s4.nurEur;
  })}</div>
      <div class="kk-treffer">${treffer(p4, s4)}</div>
      ${s4.ort === "aw" ? b2`<details class="kk-vorlagen"><summary>Vorlage laden</summary><div class="aw-vorlagen-k">${Object.entries(AW_VORLAGEN).map(([k2, [t5]]) => b2`<button class="glas-panel chip" data-v=${k2} @click=${() => p4.awVorlageWahl(k2)}>${t5}</button>`)}</div></details>` : A}
      <button class="knopf" @click=${() => p4.schliessen()}>Schließen</button></div>`;
}

// src/ansichten/uebersicht.js
function uebersichtVorlage(p4) {
  const d3 = p4.d, B2 = d3.bereiche, kw = B2.reduce((s4, b3) => s4 + kwVon(b3), 0), W = d3.warnungen.filter((w2) => !w2.stumm);
  const st = W.filter((w2) => w2.stufe === "stoerung").length, hi = W.length - st;
  const an = B2.flatMap((b3) => b3.geraete).filter((g2) => g2.an).length, alle = B2.flatMap((b3) => b3.geraete).length;
  const [wz, wt, wtemp] = p4.wetterJetzt(), auf = (art) => () => p4.einblenden(art);
  p4.pumpenWerte();
  const L2 = d3.e.staffel && p4.last().A.length ? p4.last() : null;
  const karte = (b3, i7) => b2`<div class="glas-panel glas-k ${b3.z}" role="button" tabindex="0" data-id=${b3.id} style="animation-delay:${i7 * 60}ms;--c:${FARBE[b3.z]}" @click=${() => p4.containerOeffnen(b3.id)}>
        <div class="glas-illu">${o5(illu(b3))}</div>
        <div class="glas-name">${b3.name}</div>${p4.firma(b3.firma).eigen ? A : b2`<div class="firma-tag">${p4.firma(b3.firma).name}</div>`}${b3.tuer && b3.tuer.offen ? b2`<div class="tuer-tag">🚪 offen ${b3.tuer.offen} min</div>` : A}
        <div class="glas-zeile"><span class="glas-wert">${o5(wertHtml(b3))}</span><span class="glas-kwk">${de(kwVon(b3))} kW</span></div>
        <div class="glas-status"><span class="glas-dot"></span>${TEXT(b3)}</div>
        <div class="glas-geraete">${b3.geraete.map((g2) => b2`<i class=${g2.an ? "an" : ""}></i>`)}<span>${b3.geraete.length} ${b3.pumpe ? "Pumpen" : "Geräte"}</span></div>
        ${b3.bedarf ? b2`<button class="bedarf-knopf ${b3.bedarfBis ? "an" : ""}" data-id=${b3.id} @click=${(e6) => {
    e6.stopPropagation();
    return b3.bedarfBis ? p4.bedarfAus(b3.id) : p4.bedarfAuf(b3.id);
  }}>${b3.bedarfBis ? `■ bis ${b3.bedarfBis}` : "▶ jetzt heizen"}</button>` : A}</div>`;
  return b2`<div class="glas-kopf glas-panel">
        <div><div class="klickbar" @click=${auf("baustellen")}><div class="glas-klein">BAUSTELLE</div><div class="glas-titel">${d3.titel} <span class="pfeil">▾</span></div>
        ${L2 ? b2`<button class="strom-knopf" @click=${(e6) => {
    e6.stopPropagation();
    return p4.einblenden("strom");
  }}>${o5(p4.stromBalken(L2, true))}<span class="strom-t"><b>${de(L2.gesamt)} kW</b> · ${L2.A.length} ${L2.A.length === 1 ? "Anschluss" : "Anschlüsse"} · ${L2.laufen} Heizkörper an${L2.warten ? ` · ${L2.warten} wartet` : ""} ›</span></button>` : A}</div>
          <button class="kopf-wetter ${d3.wetterEid ? "" : "nur-admin"}" @click=${d3.wetterEid ? auf("wetter") : p4.nurAdmin(auf("wetterquelle"))}>${o5(wetterIcon(wz, 22))}<span>${zahl(wtemp) ? de(wtemp) + "°" : "–"}</span><span class="kw-t">${wt}</span></button></div>
        <button class="glas-kw kw-knopf" title="Verbrauch anzeigen" @click=${auf("verbrauch")}><span class="blitz ${kw ? "an" : ""}">⚡</span>${de(kw)}<small> kW</small><span class="kw-pfeil">›</span></button></div>
      <div class="glas-chips">
        <button class="glas-panel chip auto-chip ${d3.e.auto ? "on" : ""}" role="switch" aria-checked=${String(d3.e.auto)} title="Automatik ${d3.e.auto ? "ausschalten" : "einschalten"}" @click=${() => p4.automatikUmschalten()}><span class="mini-sw"><i></i></span>Automatik</button>
        <button class="chip-status ${d3.e.auto ? "amber" : ""}" title="Heizplan anzeigen" @click=${auf("heizplan")}>${p4.statusText()} <span class="pfeil">›</span></button>
        ${W.length ? b2`<button class="glas-panel chip warn-chip ${st ? "rot" : "gelb"}" @click=${auf("warnungen")}>⚠ ${W.length === 1 ? `${p4.bName(W[0].b)}: ${W[0].titel}` : [st ? `${st} ${st === 1 ? "Störung" : "Störungen"}` : "", hi ? `${hi} ${hi === 1 ? "Hinweis" : "Hinweise"}` : ""].filter(Boolean).join(" · ")}</button>` : A}
        <span class="chip-leise">${an} von ${alle} Geräten an</span>
      </div>
      <div class="glas-raster">${B2.map(karte)}
        <button class="glas-panel glas-k neu nur-admin" @click=${p4.nurAdmin(() => p4.einblenden("container-neu"))}><span>+</span>Container</button></div>
      ${bereichVorlage(p4)}`;
}

// src/ansichten/einblendungen-uebersicht.js
var GRIFF9 = b2`<div class="griff"></div>`;
var LAEDT7 = b2`<div class="leer">Lädt …</div>`;
var knopf8 = (t5, fn, art = "") => b2`<button class="knopf ${art}" @click=${fn}>${t5}</button>`;
var ZEITRAEUME2 = ["Tag", "Woche", "Monat", "Jahr"];
var svg = (s4) => o5(s4);
function verbrauchVorlage(p4, st, ziel2, kennzahlen) {
  const V2 = p4.verbrauchDaten(st, ziel2), { Q, z: z2, aus, alle, eur: eur2, einC, basis, oa, laedt, reihen, sum, spitze, wo, preis: preis2 } = V2;
  return b2`<div class="block-kopf">${ziel2 === "sheet" ? b2`<h3>${eur2 ? "Kosten" : "Verbrauch"}</h3>` : b2`<b>Verbrauch</b>`}<span class="leise">${V2.titel}</span></div>
      <div class="seg">${ZEITRAEUME2.map((v2) => b2`<button data-v=${v2} class=${v2 === z2 ? "on" : ""} @click=${() => p4.zeitraumWahl(ziel2, v2)}>${v2}</button>`)}</div>
      ${ziel2 === "aw" ? A : zeitraumVorlage(p4, ziel2, z2, p4.zrGrenze(alle))}
      <div class="vb-gruppe"><span class="leise">stapeln nach</span><div class="seg klein">${[["teil", alle ? "Baustelle" : "Container"], ["firma", "Firma"]].map(([k2, t5]) => b2`<button data-v=${k2} class=${(st.gruppe || "teil") === k2 ? "on" : ""} @click=${() => p4.vbGruppe(ziel2, k2)}>${t5}</button>`)}</div></div>
      <div class="vb-wer"><button class=${!aus.length ? "on" : ""} @click=${() => p4.vbWer(ziel2, "")}><i style="background:var(--s1)"></i>Summe</button>
        <button data-id="*" class=${V2.alleGewaehlt ? "on" : ""} @click=${() => p4.vbWer(ziel2, "*")}>Alle gestapelt</button>
        ${Q.map((q) => b2`<button data-id=${q.id} class=${st.auswahl.includes(q.id) ? "on" : ""} @click=${() => p4.vbWer(ziel2, q.id)}><i style="background:${q.farbe}"></i>${q.name}${st.auswahl.includes(q.id) ? " ✓" : ""}</button>`)}</div>
      ${kennzahlen ? b2`<div class="kennz"><div><b>${laedt ? "–" : de(sum, sum < 100 ? 1 : 0)}</b><span>kWh ${{ Tag: "heute", Woche: "diese Woche", Monat: "im Monat", Jahr: "im Jahr" }[z2]}${reihen.length > 1 ? " zusammen" : ""}</span></div>
        <div><b>${laedt ? "–" : de(sum * preis2, 2)} €</b><span>Kosten</span></div><div><b>${laedt ? "–" : wo}</b><span>Spitze ${laedt ? "–" : de(spitze, 1)} kWh</span></div></div>` : A}
      ${einC ? b2`<div class="vb-gruppe"><span class="leise">ohne Automatik mit</span><div class="seg klein">${[["geraet", "Ø je Gerät"], ["typ", "Ø je Typ"]].map(([k2, t5]) => b2`<button data-v=${k2} class=${basis === k2 ? "on" : ""} @click=${() => p4.ohneBasisWahl(k2)}>${t5}</button>`)}</div></div>
        ${oa && oa.ergebnis ? b2`<div class="kennz"><div><b>${de(oa.ohne_kwh, oa.ohne_kwh < 100 ? 1 : 0)}</b><span>kWh ohne Automatik</span></div><div><b>${de(oa.ergebnis.gespart_eur, 2)} €</b><span>gespart</span></div><div><b>${de(oa.ergebnis.prozent, 0)} %</b><span>weniger</span></div></div>` : oa ? b2`<div class="leise">Noch keine gemessene Leistung der Heizkörper – „ohne Automatik“ folgt nach dem ersten Heizen.</div>` : A}
        <div class="leise">So rechnet „ohne Automatik“: ${basis === "typ" ? "die Ø-Leistung aller Heizkörper desselben Typs (Ölradiator bzw. Konvektor)" : "jeder Heizkörper mit seiner gemessenen Ø-Leistung im Betrieb (sobald er Strom zieht, ab 5 W)"} rund um die Uhr seit Beginn der Baustelle; gespart = ohne Automatik − tatsächlich verbraucht, mal Strompreis.</div>` : A}
      <div class="leise">${V2.einheit} ${V2.je}${aus.length > 1 ? " · gestapelt, oberste Kante = Summe" : ""}</div>
      <div class="chart-wrap">${laedt ? LAEDT7 : svg(V2.chart)}</div>
      ${V2.jeReihe.length ? b2`<div class="vb-je">${V2.jeReihe.map((r5) => b2`<div><i style="background:${r5.farbe}"></i><span class="n">${r5.name}</span><b>${de(r5.su, r5.su < 100 ? 1 : 0)} kWh</b><span>${de(r5.su * preis2, 2)} €</span><span class="leise">Spitze ${r5.spitzeBei}</span></div>`)}</div>` : A}`;
}
var verbrauch = (p4, s4) => b2`${GRIFF9}${verbrauchVorlage(p4, s4, "sheet", true)}${knopf8("Schließen", () => p4.schliessen())}`;
function wetter(p4, s4) {
  const d3 = p4.d, a3 = s4.wa || "std", e6 = d3.e, ws = p4.zustand(d3.wetterEid), w2 = d3.wetter || {};
  const folge = (t5, mm2) => b2`${zahl(t5) && t5 < e6.frueh_temp ? b2`<span class="w-folge blau">Frühstart</span>` : A}${zahl(mm2) && mm2 >= e6.tr_mm ? b2`<span class="w-folge amber">Kleidung trocknen</span>` : A}${zahl(t5) && t5 > e6.grenze ? b2`<span class="w-folge">über Heizgrenze</span>` : A}`;
  const H2 = p4.vorhersage.hourly, D2 = p4.vorhersage.daily, jetzt = d3.z.jetztMs;
  const regen = (x2) => b2`<span class="w-regen">${x2 && zahl(x2.precipitation) && x2.precipitation > 0 ? de(x2.precipitation) + " mm" : "–"}</span>`;
  let inhalt;
  if (a3 === "std") {
    const std = (H2 || []).filter((x2) => Date.parse(x2.datetime) > jetzt - 36e5).slice(0, 6);
    inhalt = H2 === null ? LAEDT7 : !std.length ? b2`<div class="leer">Keine stündliche Vorhersage</div>` : b2`<div class="w-std">${std.map((x2) => b2`<div><span class="leise">${p4.lokal(x2.datetime).slice(11, 13)}:00</span>${svg(wetterIcon(p4.nachtWetter(x2.condition, Date.parse(x2.datetime)), 36))}<b>${de(x2.temperature, 0)}°</b>
          ${regen(x2)}<span class="leise">${zahl(x2.precipitation_probability) ? x2.precipitation_probability : 0} %</span></div>`)}</div>`;
  } else if (a3 === "tag") {
    const teile = [["Morgen", 7], ["Mittag", 12], ["Nachmittag", 16], ["Nacht", 22]], jetztH = +d3.z.JETZT.slice(0, 2);
    const tagSt = p4.statistik("Tag"), aussen = tagSt && tagSt.werte[p4.eid(d3, d3.entry, "aussen")];
    const stunde = (tag, h3) => (H2 || []).find((x2) => p4.lokal(x2.datetime).slice(0, 13) === `${tag} ${String(h3).padStart(2, "0")}`);
    inhalt = H2 === null ? LAEDT7 : [["Heute", d3.z.HEUTE], ["Morgen", plusTage(d3.z.HEUTE, 1)]].map(([name2, tag]) => b2`<div class="w-tag"><div class="w-tag-n">${name2}</div><div class="w-teile">${teile.map(([t5, h3]) => {
      const x2 = stunde(tag, h3), vorbei = tag === d3.z.HEUTE && h3 < jetztH, temp = x2 ? x2.temperature : vorbei && aussen ? aussen[h3] : null;
      return b2`<div class=${vorbei ? "vorbei" : ""}><span class="leise">${t5}</span>${svg(wetterIcon(x2 ? p4.nachtWetter(x2.condition, Date.parse(x2.datetime)) : ws ? p4.nachtWetter(ws.state) : "cloudy", 34))}<b>${zahl(temp) ? de(temp, 0) + "°" : "–"}</b>${regen(x2)}</div>`;
    })}</div></div>`);
  } else {
    const tage = (D2 || []).filter((x2) => p4.lokal(x2.datetime).slice(0, 10) > d3.z.HEUTE).slice(0, 3);
    inhalt = D2 === null ? LAEDT7 : !tage.length ? b2`<div class="leer">Keine Tagesvorhersage</div>` : b2`<div class="w-3">${tage.map((x2) => {
      const t5 = p4.lokal(x2.datetime).slice(0, 10);
      return b2`<div class="w-3z">
          <div class="w-3t"><b>${wtag(t5)}</b><span class="leise">${kurzDatum(t5)}</span></div>${svg(wetterIcon(x2.condition, 40))}
          <div class="w-3w"><b>${de(x2.temperature, 0)}°</b><span class="leise">${de(x2.templow, 0)}°</span></div>
          <div class="w-3r">${regen(x2)}<span class="leise">${zahl(x2.precipitation_probability) ? x2.precipitation_probability : 0} %</span></div>
          <div class="w-3f">${folge(x2.templow, x2.precipitation)}</div></div>`;
    })}</div>`;
  }
  const [wz, wt, wtemp] = p4.wetterJetzt(), gef = ws && ws.attributes.apparent_temperature;
  const morgen = plusTage(d3.z.HEUTE, 1), pm = d3.plan[morgen], wm = p4.wetterTag(morgen), g2 = pm && pm.gruende || [];
  const fuer = [
    g2.includes("frueher_nach_regen") ? `Kleidung trocknen morgen früh aktiv (Regen über ${de(e6.tr_mm)} mm)` : "",
    g2.includes("fruehstart") ? `Kälte-Frühstart morgen ${e6.frueh_min} min früher${zahl(wm.kalt) ? ` (${de(wm.kalt, 0).replace("-", "−")} °C)` : ""}` : ""
  ].filter(Boolean);
  return b2`${GRIFF9}<h3>Wetter · ${p4.name(d3.wetterEid) || d3.titel}</h3><div class="w-jetzt">${svg(wetterIcon(wz, 72))}<div><b>${zahl(wtemp) ? de(wtemp) + " °C" : "–"}</b><div class="leise">${[ws ? WETTER_TEXT[p4.nachtWetter(ws.state)] || ws.state : wt, zahl(w2.regen_heute) && w2.regen_heute > 0 ? `${de(w2.regen_heute, w2.regen_heute % 1 ? 1 : 0)} mm seit gestern` : "", zahl(gef) ? `gefühlt ${de(gef, 0)} °C` : ""].filter(Boolean).join(" · ")}</div></div></div>
        <div class="seg">${[["std", "Stündlich"], ["tag", "Tagesverlauf"], ["3", "3 Tage"]].map(([k2, t5]) => b2`<button data-v=${k2} class=${a3 === k2 ? "on" : ""} @click=${() => p4.wetterAnsicht(k2)}>${t5}</button>`)}</div>
        <div class="w-inhalt">${inhalt}</div>
        <div class="leise">Für die Heizung: ${fuer.length ? fuer.join(", ") + "." : "morgen nichts Besonderes."}</div>${knopf8("Schließen", () => p4.schliessen())}`;
}
function warnungen(p4) {
  const d3 = p4.d, W = d3.warnungen;
  const karte = (w2) => b2`<div class="wk ${w2.stufe} ${w2.stumm ? "stumm" : ""}"><div class="wk-kopf"><b>${p4.bName(w2.b)}</b><span class="leise">${p4.seitText(w2.seitIso)}</span></div>
        <div class="wk-titel">${w2.titel}</div><div class="leise">${w2.hilfe}</div>
        <div class="wk-knoepfe">${w2.b && d3.bereiche.some((b3) => b3.id === w2.b) ? b2`<button class="chip glas-panel" data-id=${w2.b} @click=${() => p4.gehe("container", w2.b)}>Zum Container ›</button>` : A}
          <button class="chip glas-panel" data-id=${w2.id} @click=${() => p4.warnungStumm(w2.id)}>${w2.stumm ? "🔔 wieder melden" : "🔕 bis morgen stumm"}</button></div></div>`;
  const gruppe = (titel2, liste2) => liste2.length ? b2`<div class="gruppe-t">${titel2} · ${liste2.length}</div>${liste2.map(karte)}` : A;
  const offen = W.filter((w2) => !w2.stumm);
  return b2`${GRIFF9}<div class="block-kopf"><h3>Warnungen</h3><span class="leise">${offen.length} offen</span></div>
        ${offen.length ? A : b2`<div class="leer">Alles in Ordnung ✓</div>`}
        ${gruppe("Störungen", offen.filter((w2) => w2.stufe === "stoerung"))}${gruppe("Hinweise", offen.filter((w2) => w2.stufe === "hinweis"))}${gruppe("Stumm bis morgen", W.filter((w2) => w2.stumm))}
        <button class="zeile" @click=${() => p4.warnungenProtokoll()}><span class="blau">Alle Einträge im Protokoll</span><span class="chev">›</span></button>
        ${knopf8("Schließen", () => p4.schliessen(), "leise-k")}`;
}
function baustellen(p4) {
  const d3 = p4.d;
  return b2`${GRIFF9}<h3>Baustelle wählen</h3>${p4.alle.map((b3) => b2`<div class="zeile bs-zeile"><button class="bs-wahl" data-id=${b3.entry} @click=${() => p4.baustelleOeffnen(b3.entry)}><span>${b3.titel}${d3 && b3.entry === d3.entry ? " ✓" : ""}</span><span class="badge ${b3.aktiv ? "gruen" : ""}">${b3.aktiv ? "aktiv" : "abgeschlossen"}</span></button>
        <button class="bs-ic nur-admin" data-id=${b3.entry} title="Bearbeiten" aria-label="${b3.titel} bearbeiten" @click=${p4.nurAdmin(() => p4.bsBearbeiten(b3.entry))}>✎</button><button class="x nur-admin" data-id=${b3.entry} title="Löschen" aria-label="${b3.titel} löschen" @click=${p4.nurAdmin(() => p4.einblenden("bs-loeschen", { id: b3.entry }))}>✕</button></div>`)}
      <button class="zeile nur-admin" @click=${p4.nurAdmin(() => p4.einblenden("baustelle-neu"))}><span class="blau">+ Neue Baustelle</span></button>`;
}
var stromZustand = (x2) => x2.b.offline || !x2.g.erreichbar ? ["offline", "rot-t"] : x2.b.boost && x2.g.an ? ["heizt – schnell, Vorrang", "amber-t"] : x2.b.z === "pause" ? ["pausiert – Tür offen", "lila"] : x2.g.warte ? [`wartet${zahl(x2.g.warte.dran_in_min) ? ` – dran in ${x2.g.warte.dran_in_min} min` : ""}`, "blau"] : x2.g.an ? zahl(x2.g.kwJetzt) && x2.g.kwJetzt < 0.05 ? ["an · zieht gerade nichts (Thermostat)", "leise"] : [`heizt · ${de(zahl(x2.g.kwJetzt) ? x2.g.kwJetzt : x2.g.kw, 2)} kW`, "amber-t"] : ["aus", "leise"];
function stromRang(p4, L2, zustand2 = stromZustand) {
  const d3 = p4.d, rang = d3.staffel && d3.staffel.rang || [], offen = p4.s.srOffen || [];
  const nachId = Object.fromEntries(L2.hk.map((x2) => [x2.g.id, x2])), zeilen = rang.map((id) => nachId[id]).filter(Boolean);
  if (!zeilen.length) return A;
  const f3 = (v2, k2 = 2) => `${v2 > 0 ? "+" : v2 < 0 ? "−" : ""}${de(Math.abs(v2), k2)}`, gesehen = /* @__PURE__ */ new Set();
  const letzterAn = [...zeilen].reverse().find((x2) => x2.g.an);
  return b2`<div class="sr-kopf"><b>Rangliste</b><span class="leise">oben = zuerst an, unten = gibt zuerst ab</span></div>
      <div class="sr-liste">${zeilen.map((x2, i7) => {
    const { b: b3, g: g2 } = x2, B2 = b3.bedarfGrad, erster = !gesehen.has(b3.id);
    gesehen.add(b3.id);
    const stufen2 = b2`${b3.z === "frost" ? b2`<span class="sr-stufe frost">❄ Frostschutz</span>` : A}${b3.boost ? b2`<span class="sr-stufe boost">⚡ Schnell</span>` : A}${erster ? b2`<span class="sr-stufe erster">erster im Container</span>` : b2`<span class="sr-stufe">Zweitgerät</span>`}${b3.prio && b3.prio !== "normal" ? b2`<span class="sr-stufe">Priorität ${b3.prio}</span>` : A}`;
    const [zt, zk] = zustand2(x2), auf = offen.includes(g2.id);
    const mitFuehler = B2 && zahl(B2.jetzt);
    const wert2 = B2 ? b2`<div class="sr-bedarf">${f3(B2.summe)} °C<small>${mitFuehler ? `Bedarf in ${B2.horizont_min} min` : "ohne Fühler"}</small></div>` : b2`<div class="sr-bedarf">–<small>noch nicht gerechnet</small></div>`;
    const teile = !B2 ? [] : mitFuehler ? [
      [`jetzt ${de(b3.t, 1)} °C, Soll ${de(p4.sollVon(b3), 1)} °C`, B2.jetzt],
      ...zahl(B2.abkuehlen) ? [[`kühlt ohne Heizen ${de(B2.abkuehl_h, 1)} °C/h ab (${B2.gemessen ? "gemessen" : "gelernt"}) → in ${B2.horizont_min} min`, B2.abkuehlen]] : [],
      ...B2.nachlauf ? [["heizt nach dem Aus noch nach (gelernt)", B2.nachlauf]] : [],
      ...B2.ziel ? [[`schafft das Soll bis Arbeitsbeginn nicht (${zahl(B2.aufheiz_h) ? `${de(B2.aufheiz_h, 1)} °C/h gelernt` : "gelernt"})`, B2.ziel]] : [],
      ...B2.gerecht ? [[`wenig Heizzeit in der letzten Stunde (${B2.heiz_min} min)`, B2.gerecht]] : []
    ] : [["Ohne Fühler kein Bedarf – kommt über die Heizzeit der letzten Stunde reihum dran", B2.gerecht]];
    const aufTeil = !auf || !teile.length ? A : b2`<div class="sr-auf">${teile.map(([t5, v2]) => b2`<span>${t5}</span><b>${f3(v2)} °C</b>`)}<span class="summe">Bedarf</span><b class="summe">${f3(B2.summe)} °C</b></div>`;
    return b2`<div class="sr-zeile" data-id=${g2.id} role="button" tabindex="0" @click=${() => p4.stromRangAuf(g2.id)}><span class="sr-nr">${i7 + 1}</span><div class="sr-name"><b>${b3.name} · ${g2.n}</b><div>${stufen2}</div></div>${wert2}
          <div class="sr-zust"><span class=${zk}>${zt}${x2 === letzterAn && g2.an ? " · gibt als nächstes ab" : ""}</span> <span class="leise">· antippen: woraus</span></div>${aufTeil}</div>`;
  })}</div>`;
}
function strom2(p4) {
  const d3 = p4.d, L2 = p4.last(), e6 = d3.e;
  return b2`${GRIFF9}<div class="block-kopf"><h3>Stromverteilung</h3><span class="leise">${L2.laufen} von ${L2.hk.length} Heizkörpern an · höchstens ${L2.max}</span></div>
        <div class="strom-leg"><span><i class="s-heiz"></i>Heizung ${de(L2.heiz)} kW</span><span><i class="s-pumpe"></i>Pumpen ${de(L2.pumpe)} kW</span><span><i class="s-sonst"></i>Sonstiges ${de(L2.sonst)} kW</span><span><i class="s-res"></i>Reserve (Kran, Werkzeug)</span></div>
        ${L2.A.map((a3) => {
    const w2 = (v2) => `${a3.grenze > 0 ? Math.max(0, v2 / a3.grenze * 100) : 0}%`;
    return b2`<div class="an-block"><div class="an-kopf"><b>${a3.name}</b><span class="leise">${a3.phasen === 3 ? "3 × " : ""}${a3.ampere ?? "–"} A · ${de(a3.heiz + a3.pumpe + a3.sonst)} von ${de(a3.grenze)} kW</span></div>
          <div class="strom-spur"><i class="s-heiz" style="width:${w2(a3.heiz)}"></i><i class="s-pumpe" style="width:${w2(a3.pumpe)}"></i><i class="s-sonst" style="width:${w2(a3.sonst)}"></i><i class="s-res" style="width:${w2(a3.reserve)}"></i></div>
          <div class="leise">${a3.frei < 2 ? b2`<span class="amber-t">nur ${de(Math.max(0, a3.frei))} kW frei</span>` : `${de(a3.frei)} kW frei`} für Heizungen</div>
          ${L2.hk.filter((x2) => x2.b.anschluss === a3.id).map((x2) => {
      const [t5, k2] = stromZustand(x2);
      return b2`<div class="zeile"><span>${x2.b.name} · ${x2.g.n}</span><span class=${k2}>${t5}</span></div>`;
    })}</div>`;
  })}
        ${e6.staffel ? stromRang(p4, L2, stromZustand) : A}
        <div class="hinweis-k">Je Anschluss gilt: ${e6.nutzbar} % der Anschlussleistung (vorsichtig, weil die Verteilung auf die Phasen unbekannt ist) minus Reserve minus alles, was gerade läuft (gemessen). Gerechnet wird mit dem gemessenen Verbrauch: ein eingeschalteter Heizkörper, dessen Thermostat gerade abgeschaltet hat, zählt mit dem, was er zieht. Ist der Anschluss länger als 30 s zu voll, geht der unterste der Rangliste aus – bei gleichem Rang der größere. Die Rangliste: Frostschutz, Schnell aufheizen, erster im Container, Priorität, dann der Bedarf in °C (jetzt unter dem Soll + Abkühlen ohne Heizen − Nachlauf + was bis Arbeitsbeginn fehlt + wenig Heizzeit in der letzten Stunde). Ein Heizkörper kommt erst dazu, wenn eine Minute lang genug für seine volle Leistung frei ist. Jeder läuft mindestens ${e6.min_lauf} min und pausiert mindestens ${e6.min_pause} min; dürfen nicht alle, wechseln sie alle ${e6.takt} min – der oberste Wartende gegen den untersten Laufenden. Jeder Container bekommt zuerst einen Heizkörper; ein zweiter im selben Container kommt erst dazu, wenn Platz ist, und verdrängt nie den einzigen eines anderen.</div>
        ${knopf8("Anschlüsse einstellen", () => p4.einstGruppe("strom"), "leise-k")}${knopf8("Schließen", () => p4.schliessen(), "leise-k")}`;
}
function mBild(p4, s4) {
  const m3 = (p4.meldungen() || []).find((x2) => x2.id === s4.id), u3 = m3 && p4.mlBild(m3, s4.i);
  return b2`${GRIFF9}<h3>${m3 && m3.ticket || "Meldung"} · Bild ${s4.i + 1}</h3>${u3 ? b2`<img class="mb-gross" src=${u3} alt="Bild">` : LAEDT7}${knopf8("Schließen", () => p4.schliessen())}`;
}
var UEBERSICHT_EINBLENDUNGEN = { verbrauch, wetter, warnungen, baustellen, strom: strom2, "m-bild": mBild };

// src/ansichten/auswertung.js
var LAEDT8 = b2`<div class="leer">Lädt …</div>`;
var STUNDEN = [...Array(24)].map((_2, h3) => String(h3).padStart(2, "0"));
var WANN = { Tag: "heute", Woche: "diese Woche", Monat: "dieser Monat", Jahr: "dieses Jahr" };
var farbeVon = (b3) => b3 ? BEREICH_FARBEN[b3.f % BEREICH_FARBEN.length] : "var(--ink2)";
var awVgl = (p4, z2) => p4.zrVgl(z2, p4.zrV("aw"));
var awDelta = (dl) => dl === null || dl === void 0 ? "" : b2`<em class="aw-delta ${dl > 0 ? "mehr" : "weniger"}">${dl > 0 ? "▲" : "▼"} ${Math.abs(dl)} %</em>`;
function abrechnung(p4, z2) {
  const lauf = p4.s.awScope === "alle" ? p4.laufende() : [p4.d], preis2 = p4.d.e.preis, vs = p4.zrV("aw"), a3 = p4.abDaten(z2, void 0, p4.d, vs), zeilen = a3 && (a3.firmen || []);
  const wann2 = p4.zrText(z2, vs);
  return b2`<div class="glas-panel block"><div class="block-kopf"><b>Abrechnung nach Firma</b><span class="leise">${wann2} · ${de(preis2, 2)} € je kWh</span></div>
      ${!zeilen ? LAEDT8 : !zeilen.length ? b2`<div class="leer">Noch kein Verbrauch in diesem Zeitraum</div>` : zeilen.map((f3) => b2`<div class="ab-firma ${f3.eigen ? "eigen" : ""}"><div class="ab-kopf"><b>${f3.firma}</b><span><b>${de(f3.eur, 2)} €</b> <span class="leise">${de(f3.kwh, 0)} kWh · ${de(f3.anteil, 0)} %</span></span></div>
        ${(f3.container || []).map((x2) => b2`<div class="ab-c"><span>${x2.name}${lauf.length > 1 ? b2` <span class="leise">· ${x2.titel}</span>` : A}</span><span class="leise">${de(x2.kwh, 0)} kWh · ${de(x2.eur, 2)} €</span></div>`)}</div>`)}
      <button class="knopf" data-art="firma" @click=${() => p4.csv("firma")}>⇩ Abrechnung als CSV</button></div>`;
}
function leistungHeute(p4) {
  const d3 = p4.d, Q = d3.bereiche.map((b3) => ({ name: b3.name, farbe: farbeVon(b3), v: p4.verbrauch(d3, b3.id, "Tag") }));
  return b2`<div class="glas-panel block"><div class="block-kopf"><b>Leistung heute</b><span class="leise">kW je Stunde (Mittel)</span></div>
      <div class="chart-wrap">${Q.some((q) => !q.v) ? LAEDT8 : Q.length ? o5(flaeche("kw-heute", Q, STUNDEN, "kW", 6)) : b2`<div class="leer">Noch keine Container</div>`}</div>
      <div class="leise">gestapelt nach Container – oben die ganze Baustelle</div></div>`;
}
function temperaturen(p4) {
  const d3 = p4.d, tv = p4.s.tv || "heute", C2 = d3.bereiche.filter((b3) => !b3.pumpe && b3.fuehler), aid = p4.eid(d3, d3.entry, "aussen");
  const aussen = { name: "Außen", farbe: "var(--ink2)", aussen: true };
  let inhalt;
  if (tv === "heute") {
    const st = p4.statistik("Tag");
    inhalt = !st ? LAEDT8 : o5(linien(
      "tp-heute",
      [...C2.map((b3) => ({ name: b3.name, farbe: farbeVon(b3), v: [...st.werte[b3.fuehler] || [], null] })), ...aid ? [{ ...aussen, v: [...st.werte[aid] || [], null] }] : []],
      [...STUNDEN, "24"],
      6,
      (i7) => `${String(i7).padStart(2, "0")}:00`
    ));
  } else {
    const n4 = tv === "7" ? 7 : 30, t5 = p4.tempTage(n4);
    inhalt = !t5 ? LAEDT8 : o5(linien(
      `tp-${n4}`,
      [...C2.map((b3) => ({ name: b3.name, farbe: farbeVon(b3), v: t5.werte[b3.fuehler] || Array(n4).fill(null) })), ...aid ? [{ ...aussen, v: t5.werte[aid] || Array(n4).fill(null) }] : []],
      t5.tage.map(kurzDatum),
      n4 === 7 ? 1 : 5,
      (i7) => `${wtag(t5.tage[i7])} ${kurzDatum(t5.tage[i7])} · Tagesmittel`
    ));
  }
  return b2`<div class="glas-panel block"><div class="block-kopf"><b>Temperaturen</b><span class="leise">alle Container mit Fühler</span></div>
      <div class="seg">${[["heute", "Heute"], ["7", "7 Tage"], ["30", "30 Tage"]].map(([k2, t5]) => b2`<button data-v=${k2} class=${tv === k2 ? "on" : ""} @click=${() => p4.tvWahl(k2)}>${t5}</button>`)}</div>
      <div class="chart-wrap">${C2.length ? inhalt : b2`<div class="leer">Kein Container mit Temperaturfühler</div>`}</div>
      <div class="leise">${tv === "heute" ? "Stundenmittel, gestrichelt außen." : "Tagesmittel je Container, gestrichelt außen."}${d3.bereiche.some((b3) => !b3.pumpe && !b3.fuehler) ? " Container ohne Fühler fehlen." : ""}</div></div>`;
}
function geraeteBlock(p4, z2, A2) {
  const d3 = p4.d;
  if (!A2) return b2`<div class="glas-panel block"><div class="block-kopf"><b>Je Gerät</b></div>${LAEDT8}</div>`;
  const zeilen = (A2.je_geraet || []).map((r5) => {
    const b3 = d3.bereiche.find((x2) => x2.id === r5.bereich), g2 = b3 && b3.geraete.find((x2) => x2.id === r5.geraet);
    return g2 ? { ...r5, b: b3, g: g2 } : null;
  }).filter(Boolean);
  const f3 = (v2, k2) => zahl(v2) ? de(v2, k2) : "–";
  return b2`<div class="glas-panel block"><div class="block-kopf"><b>Je Gerät</b><span class="leise">${WANN[z2]}</span></div>
      ${zeilen.length ? b2`<div class="tab-scroll"><table class="vergleich je-geraet"><tr><th>Gerät</th><th>Ø kW</th><th>Stunden</th><th>kWh</th><th>€</th></tr>
        ${zeilen.map(({ b: b3, g: g2, mittel, kwh, std, eur: eur2 }) => b2`<tr><td><b>${g2.n}</b><div class="leise">${b3.name} · ${g2.typ}</div></td><td>${f3(mittel, 2)}</td><td>${f3(std, 1)}</td><td>${f3(kwh, 1)}</td><td>${zahl(kwh) ? de(eur2, 2) : "–"}</td></tr>`)}</table></div>` : b2`<div class="leer">Noch keine Geräte</div>`}
      ${o5(erkl(d3.e.erklaer, "Ø kW ist die mittlere Leistung, während das Gerät läuft – so sieht man, ob ein Heizkörper schwächer ist als angegeben. kWh kommen aus dem Zählerstand des Shelly (ohne Energiezähler „–“), Stunden ≈ kWh ÷ Ø kW, bei Pumpen die gemessene Pumpzeit."))}</div>`;
}
function erkenntnisse(p4, A2, z2) {
  return (A2 && A2.erkenntnisse || []).map((x2) => ({
    gespart: ["💶", `${de(x2.eur, 0)} € gespart`, `Die Automatik spart ${de(x2.prozent, 0)} % gegenüber Dauerbetrieb${x2.hinweis ? ` (${x2.hinweis})` : ""}.`, "ohne"],
    groesster: ["🔥", `${x2.name} verbraucht am meisten`, `${de(x2.kwh, 0)} kWh · ${de(x2.anteil, 0)} % des Verbrauchs.`, "geraete"],
    sparsamster: ["⚙", `${x2.name} heizt am sparsamsten`, `${de(x2.kwh_h, 2)} kWh je Heizstunde.`, "vergleich"],
    wetter: ["🌡", `Je Grad kälter +${de(x2.kwh_je_grad, 1)} kWh am Tag`, [zahl(x2.eur_je_grad) ? `≈ ${de(x2.eur_je_grad, 2)} € je Grad` : "", zahl(x2.null0) ? `unter ${de(x2.null0, 0)} °C außen wird geheizt` : ""].filter(Boolean).join(" · "), "wetter"],
    mehr: ["📈", `${x2.prozent} % mehr als ${awVgl(p4, z2)}`, "Verbrauch im Vergleich zum Zeitraum davor.", "verlauf"],
    weniger: ["📉", `${x2.prozent} % weniger als ${awVgl(p4, z2)}`, "Verbrauch im Vergleich zum Zeitraum davor.", "verlauf"],
    typ: ["⚖", x2.weniger > 0 ? `Ölradiator ${de(x2.weniger, 0)} % sparsamer` : `Konvektor ${de(-x2.weniger, 0)} % sparsamer`, "aus eigenen Messungen je Heizstunde.", "vergleich"]
  })[x2.art]).filter(Boolean);
}
function diagramm2(p4, z2, gr) {
  const st = p4.s.aw, Q = p4.quellen(st, "aw"), werte = Q.map((q) => ({ q, v: q.v(z2) }));
  const alle = p4.s.awScope === "alle", firma2 = st.gruppe === "firma", kopf5 = b2`<div class="aw-dia-kopf"><b>Verbrauch</b>
      <div class="seg klein">${[["teil", alle ? "Baustelle" : "Container"], ["firma", "Firma"]].map(([k2, t5]) => b2`<button data-v=${k2} class=${(firma2 ? "firma" : "teil") === k2 ? "on" : ""} @click=${() => p4.vbGruppe("aw", k2)}>${t5}</button>`)}</div></div>`;
  if (werte.some((x2) => !x2.v)) return b2`<div class="glas-panel aw-dia">${kopf5}${LAEDT8}</div>`;
  const zr = p4.zeitraum(z2, st.v || 0), labels = zr.labels, n4 = labels.length, reihen = werte.map(({ q, v: v2 }) => ({ name: q.name, farbe: q.farbe, v: v2 }));
  const summen = labels.map((_2, i7) => reihen.reduce((a3, r5) => a3 + (r5.v[i7] || 0), 0)), ges = summe(summen);
  const W = gr.w * 160, H2 = Math.max(90, gr.h * 110 + (gr.h - 1) * 12 - 78), L2 = 30, R2 = 6, T2 = 6, U = 16, hi = Math.max(...summen, 0) * 1.1 || 1;
  const stufe = hi > 200 ? 100 : hi > 40 ? 20 : hi > 12 ? 5 : hi > 4 ? 2 : hi > 1.5 ? 0.5 : 0.2, y3 = (v2) => T2 + (1 - v2 / hi) * (H2 - T2 - U), bw = (W - L2 - R2) / n4, jedes = Math.max(1, Math.ceil(n4 / (gr.w * 4)));
  const raster = [...Array(Math.floor(hi / stufe) + 1)].map((_2, q) => q * stufe).map((v2) => `<line x1="${L2}" x2="${W - R2}" y1="${y3(v2).toFixed(1)}" y2="${y3(v2).toFixed(1)}" class="gr"/><text x="${L2 - 4}" y="${(y3(v2) + 3).toFixed(1)}" class="ax" text-anchor="end">${de(v2, stufe < 1 ? 1 : 0)}</text>`).join("");
  const bars = labels.map((lab, i7) => {
    let unten = 0;
    return reihen.map((r5) => {
      const v2 = r5.v[i7] || 0;
      if (!(v2 > 0)) return "";
      const y1 = y3(unten + v2), y0 = y3(unten);
      unten += v2;
      return `<rect x="${(L2 + i7 * bw + bw * 0.12).toFixed(1)}" y="${y1.toFixed(1)}" width="${(bw * 0.76).toFixed(1)}" height="${Math.max(0, y0 - y1).toFixed(1)}" fill="${r5.farbe}" rx="1.5"><title>${esc(String(lab))} · ${esc(r5.name)} · ${de(v2, 1)} kWh</title></rect>`;
    }).join("") + (i7 % jedes === 0 ? `<text x="${(L2 + i7 * bw + bw / 2).toFixed(1)}" y="${H2 - 3}" class="ax" text-anchor="middle">${esc(String(lab))}</text>` : "");
  }).join("");
  return b2`<div class="glas-panel aw-dia">${kopf5}
      ${o5(`<svg class="aw-dia-svg" viewBox="0 0 ${W} ${H2}" preserveAspectRatio="xMidYMid meet">${raster}${bars}</svg>`)}
      <div class="aw-dia-leg">${reihen.map((r5) => b2`<span><i style="background:${r5.farbe}"></i>${r5.name}</span>`)}<span class="leise">${de(ges, ges < 100 ? 1 : 0)} kWh · kWh je ${{ Tag: "Stunde", Woche: "Tag", Monat: "Tag", Jahr: "Monat" }[z2]}</span></div></div>`;
}
function bausteine(p4) {
  const d3 = p4.d, aw = p4.s.aw ||= { zeitraum: "Monat", auswahl: d3.bereiche.map((b3) => b3.id) }, z2 = aw.zeitraum, vs = aw.v || 0;
  const alle = p4.s.awScope === "alle";
  const A2 = p4.awDaten(z2, vs), S3 = A2 && A2.summen || {}, vd = (k2) => (S3.veraenderung || {})[k2] ?? null, oa = S3.ohne_automatik || null;
  const kwh = A2 ? S3.kwh : null, hz = A2 ? S3.heizzeit : null, pz = A2 ? S3.pumpzeit : null, ohne = A2 ? S3.ohne : null;
  const vgl = p4.zrVgl(z2, vs);
  const kz = (wert2, text2, dl) => b2`<div><b>${wert2}</b><span>${text2}</span>${dl !== null ? b2`<em class="${dl > 0 ? "mehr" : "weniger"}">${dl > 0 ? "▲" : "▼"} ${Math.abs(dl)} %</em>` : A}</div>`;
  const T2 = ["oelradiator", "konvektor"].map((t5) => {
    const x2 = A2 && A2.typ && A2.typ[t5] || {};
    return {
      kwhG: x2.kwh_gradh ?? null,
      kwhGm2: x2.kwh_gradh_m2 ?? null,
      auf: x2.auf ?? null,
      ab: x2.ab ?? null,
      aufKw: x2.auf_je_kw ?? null,
      anzahl: x2.anzahl ?? null,
      kw: x2.kw ?? null,
      m2: x2.m2 ?? null,
      container: x2.container || []
    };
  });
  const seite = (t5) => zahl(t5.anzahl) ? [`${t5.anzahl} Heizkörper`, zahl(t5.kw) ? `${de(t5.kw, 1)} kW` : null, zahl(t5.m2) ? `${de(t5.m2, 0)} m²` : null].filter(Boolean).join(" · ") : "–";
  const seit = A2 && A2.typ && A2.typ.seit ? `${A2.typ.seit.slice(8, 10)}.${A2.typ.seit.slice(5, 7)}.${A2.typ.seit.slice(0, 4)}` : null;
  const nurEiner = !!(A2 && A2.typ && A2.typ.nur_einer);
  const vglOk = !!(A2 && A2.typ && A2.typ.vergleichbar), aussen = A2 && A2.typ && A2.typ.ausgeschlossen || [];
  const er = A2 && A2.typ && A2.typ.ersparnis, zrE = p4.zeitraum(z2, vs);
  const ersparT = !er ? "" : b2`<div class="kennz"><div><b>${de(er.oel_kwh, er.oel_kwh < 100 ? 1 : 0)}</b><span>kWh Ölradiatoren</span></div>
        <div><b>${de(er.konvektor_kwh, er.konvektor_kwh < 100 ? 1 : 0)}</b><span>kWh mit Konvektoren</span></div>
        <div><b class="${er.erspart_eur < 0 ? "rot-t" : ""}">${de(Math.abs(er.erspart_eur), 2)} €</b><span>${er.erspart_eur < 0 ? "mehr" : "erspart"}</span></div></div>
      <div class="leise">${{ Tag: "kWh je Stunde", Woche: "kWh je Tag", Monat: "kWh je Tag", Jahr: "kWh je Monat" }[z2]} · ${p4.zrText(z2, vs)}</div>
      <div class="chart-wrap">${o5(flaeche(
    `typ-er-${z2}-${vs}`,
    [{ name: "Ölradiatoren (tatsächlich)", v: er.oel, farbe: "var(--s1)" }],
    zrE.labels,
    "kWh",
    z2 === "Tag" ? 6 : z2 === "Monat" ? 7 : z2 === "Woche" ? 1 : 3,
    { name: "mit Konvektoren", v: er.konvektor }
  ))}</div>
      <div class="leise">„Mit Konvektoren“ = der tatsächliche Verbrauch der Ölradiatoren im gewählten Zeitraum mal ${de(er.faktor, 2)} – so viel mehr bzw. weniger brauchen Konvektoren hier je Gradstunde und m².</div>`;
  const f3 = (v2, fn) => zahl(v2) ? fn(v2) : "–";
  const nachteil = (i7, hoch) => {
    const a3 = T2[0][i7], b3 = T2[1][i7];
    if (hoch === null || !zahl(a3) || !zahl(b3) || a3 === b3) return [false, false];
    return hoch ? [a3 > b3, b3 > a3] : [a3 < b3, b3 < a3];
  };
  const zelle = (v2, fett, fn) => fett ? b2`<b>${f3(v2, fn)}</b>` : f3(v2, fn);
  const zeile3 = (titel2, i7, hoch, fn) => {
    const [x2, y3] = nachteil(i7, hoch);
    return b2`<tr><td>${titel2}</td><td>${zelle(T2[0][i7], x2, fn)}</td><td>${zelle(T2[1][i7], y3, fn)}</td></tr>`;
  };
  const weniger = (A2 && A2.typ && A2.typ.weniger) ?? null;
  const cmp = (i7) => zahl(T2[0][i7]) && zahl(T2[1][i7]) && T2[0][i7] !== T2[1][i7] ? Math.sign(T2[0][i7] - T2[1][i7]) : 0;
  const auf = cmp("auf") < 0 ? "braucht länger" : cmp("auf") > 0 ? "heizt schneller auf" : "";
  const ab = cmp("ab") < 0 ? `hält die Wärme ${auf === "braucht länger" ? "aber " : ""}besser` : cmp("ab") > 0 ? "kühlt schneller ab" : "";
  const vb = weniger > 0 ? `verbraucht rund ${weniger} % weniger` : weniger < 0 ? `verbraucht rund ${-weniger} % mehr` : "";
  const teile = [auf, ab, vb].filter(Boolean), fussSatz = !vglOk ? "Noch nicht vergleichbar – es braucht je einen Container nur mit Ölradiator und nur mit Konvektor, mit Fühler im Modus Thermostat." : teile.length ? `Der Ölradiator ${teile.length > 1 ? `${teile.slice(0, -1).join(", ")} und ${teile.at(-1)}` : teile[0]}.` : "Noch zu wenige Messungen für einen Vergleich.";
  const B2 = {
    kennzahlen: b2`<div class="glas-panel kennz vier">${kz(zahl(kwh) ? de(kwh, 0) : "–", "kWh", vd("kwh"))}${kz(zahl(kwh) ? `${de(S3.eur, 0)} €` : "–", "Kosten", vd("kwh"))}${kz(zahl(hz) ? `${de(hz, 0)} h` : "–", "Heizzeit", vd("heizzeit"))}${kz(zahl(pz) ? `${de(pz, 1)} h` : "–", "Pumpzeit", vd("pumpzeit"))}</div>
      <div class="leise vgl">Pfeile: im Vergleich zu ${vgl}</div>`,
    verlauf: b2`<div class="glas-panel block">${verbrauchVorlage(p4, aw, "aw", false)}</div>`,
    leistung: alle ? "" : leistungHeute(p4),
    temperaturen: alle ? "" : temperaturen(p4),
    abrechnung: abrechnung(p4, z2),
    geraete: alle ? "" : geraeteBlock(p4, z2, A2),
    // BSM-033.03: „Wetter-Einfluss“ und „Hochrechnung“ sind jetzt die Karte „Heizperiode“ (Reiter Signatur bzw. Hochrechnung)
    wetter: alle ? "" : heizperiodeVorlage(p4, A2, "sig"),
    ohne: b2`<div class="glas-panel block"><div class="block-kopf"><b>Ohne Automatik</b><span class="leise">wenn alles rund um die Uhr liefe</span></div>
        ${!zahl(ohne) || !zahl(kwh) ? ohne === null || kwh === null ? LAEDT8 : b2`<div class="leer">Noch keine Werte</div>` : !oa ? b2`<div class="leer">Noch keine Werte</div>` : b2`
        <div class="hbar"><span class="hb-n">mit Automatik</span><span class="hb-spur"><i style="width:${Math.min(100, kwh / ohne * 100)}%;background:var(--s1)"></i></span><span class="hb-w">${de(S3.eur, 0)} €</span></div>
        <div class="hbar"><span class="hb-n">ohne (24/7)</span><span class="hb-spur"><i style="width:100%;background:var(--s2)"></i></span><span class="hb-w">${de(oa.ohne_eur, 0)} €</span></div>
        <div class="gespart">gespart <b>${de(oa.gespart_eur, 2)} €</b> · ${de(oa.prozent, 0)} %</div>
        ${oa.hinweis ? b2`<div class="hp-grob">⚠ ${oa.hinweis}</div>` : A}`}
        <div class="leise">So rechnet „ohne Automatik“: jeder Heizkörper mit seiner gemessenen Ø-Leistung im Betrieb (sobald er Strom zieht, ab 5 W) rund um die Uhr seit Beginn der Baustelle; gespart = ohne Automatik − tatsächlich verbraucht, mal Strompreis.</div></div>`,
    // AN-0007: woher der Vergleich kommt
    hochrechnung: alle ? "" : heizperiodeVorlage(p4, A2),
    vergleich: b2`<div class="glas-panel block"><div class="block-kopf"><b>Ölradiator oder Konvektor</b><span class="leise">fair: gleiche Regelung · aus eigenen Messungen</span></div>
        <table class="vergleich"><tr><th></th><th>Ölradiator</th><th>Konvektor</th></tr>
          <tr class="vgl-geraete"><td>im Vergleich</td><td class="leise">${seite(T2[0])}</td><td class="leise">${seite(T2[1])}</td></tr>
          ${zeile3("kWh je Gradstunde", "kwhG", true, (v2) => de(v2, 3))}
          ${zeile3("kWh je Gradstunde und m²", "kwhGm2", true, (v2) => de(v2, 4))}
          ${zeile3("Aufheizen", "auf", false, (v2) => `${de(v2, 1)} °C/h`)}
          ${zeile3("Aufheizen je kW", "aufKw", false, (v2) => `${de(v2, 2)} °C/h`)}
          ${zeile3("Abkühlen nach Aus", "ab", true, (v2) => `${de(v2, 1)} °C/h`)}
          <tr><td>zählt</td><td class="leise">${T2[0].container.join(", ") || "–"}</td><td class="leise">${T2[1].container.join(", ") || "–"}</td></tr></table>
        <div class="leise fuss">${fussSatz}</div>
        ${vglOk && nurEiner ? b2`<div class="hp-grob vgl-einer">⚠ Nur ein Container je Art – das vergleicht eher diese Container (Dämmung, Größe, Tür) als Ölradiator und Konvektor.</div>` : A}
        <div class="leise vgl-bezug">Tabelle: ${seit ? `seit ${seit} (Zählbeginn)` : "seit Zählbeginn"}, unabhängig vom gewählten Zeitraum; Aufheizen und Abkühlen als gleitendes Mittel der letzten Messungen. Die Prozentzahl rechnet je m².</div>
        ${ersparT}
        ${aussen.length ? b2`<div class="leise">Nicht im Vergleich: ${aussen.map((x2) => `${x2.name} (${x2.grund})`).join(", ")}.</div>` : A}
        <div class="leise">kWh je Gradstunde = Strom je Stunde und °C, um den es drinnen wärmer ist als draußen. Verglichen wird je Container, nicht je Gerät: Ein Container braucht die Wärme, die er verliert, egal wie viele Heizkörper sie liefern – Elektroheizer setzen Strom gleich in Wärme um, Unterschiede kommen vor allem vom Container und vom Nachheizen. Gezählt werden nur Zeiten, in denen ein Container mit Fühler im Modus Thermostat geregelt wird; Container mit beiden Typen zählen nicht.</div></div>`
  };
  return { B: B2, A: A2, z: z2, alle };
}
function stueck(p4, k2, B2, A2, z2, gr = { w: 4, h: 4 }) {
  const d3 = p4.d, S3 = A2 && A2.summen || {}, oa = S3.ohne_automatik, h3 = A2 && A2.hochrechnung, rang = A2 && A2.rangliste || [], preis2 = d3.e.preis;
  const kachel = (kk, inhalt) => b2`<button class="glas-panel aw-k" data-k=${kk} @click=${() => p4.awDetail(kk)}>${inhalt}</button>`, laed = !A2;
  const vs = p4.zrV("aw"), eur2 = zahl(S3.eur) ? `${de(S3.eur, 2)} €` : "–", max = Math.max(1, ...rang.map((c4) => c4.kwh || 0)), wann2 = (vs ? p4.zrText(z2, vs) : WANN[z2]).toUpperCase();
  const temp = (id) => {
    const b3 = d3.bereiche.find((x2) => x2.id === id);
    return b3 && b3.t !== null ? `${de(b3.t)}°` : "–";
  };
  const hierVon = (c4) => d3.bereiche.find((b3) => b3.id === c4.bereich);
  const auf = (hier, c4) => hier ? () => p4.containerOeffnen(c4.bereich) : null;
  switch (k2) {
    case "betrag":
      return laed ? b2`<div class="glas-panel block">${LAEDT8}</div>` : b2`<div class="glas-panel aw-betrag"><div><small>KOSTEN · ${wann2}</small><b>${eur2}</b>
          <span>${zahl(S3.kwh) ? de(S3.kwh, 0) : "–"} kWh ${zahl((S3.veraenderung || {}).kwh) ? b2`${awDelta(S3.veraenderung.kwh)} <span class="leise">zu ${awVgl(p4, z2)}</span>` : A}</span></div>
        <div class="aw-betrag-r"><div><small>GESPART DURCH AUTOMATIK</small><b class="gruen-t">${oa ? `${de(oa.gespart_eur, 0)} €` : "–"}</b>${oa && oa.hinweis ? b2`<span class="hp-grob">${oa.hinweis}</span>` : A}</div>
          <div><small>HOCHRECHNUNG HEIZPERIODE</small><b>${h3 && zahl(h3.mit_eur) ? `≈ ${de(h3.mit_eur, 0)} €` : "–"}</b></div></div></div>`;
    case "rangliste":
      if (gr.w <= 2) return b2`<div class="glas-panel block aw-klein"><div class="block-kopf"><b>Wer verbraucht was</b><span class="leise">Top 3</span></div>
          ${laed ? LAEDT8 : !rang.length ? b2`<div class="leer">Noch kein Verbrauch</div>` : rang.slice(0, 3).map((c4, i7) => {
        const hier = hierVon(c4);
        return b2`<button class="aw-rang aw-rang-z" data-id=${hier ? c4.bereich : A} ?disabled=${!hier} @click=${auf(hier, c4)}><span><em>${i7 + 1}</em> ${c4.name}</span><i style="width:${(c4.kwh || 0) / max * 100}%;background:${farbeVon(hier)}"></i><em>${de(c4.kwh, 0)} kWh · ${de(c4.eur, 2)} €</em></button>`;
      })}</div>`;
      return b2`<div class="glas-panel block"><div class="block-kopf"><b>Wer verbraucht was</b><span class="leise">antippen öffnet den Container</span></div>
        ${laed ? LAEDT8 : !rang.length ? b2`<div class="leer">Noch kein Verbrauch in diesem Zeitraum</div>` : b2`<div class="aw-tab-kopf"><span></span><span>kWh</span><span>€</span><span>Heizzeit</span><span>kWh/h</span><span>kWh/m²</span><span>jetzt</span></div>
        ${rang.map((c4, i7) => {
        const hier = hierVon(c4);
        return b2`<button class="aw-tab-zeile" data-id=${hier ? c4.bereich : A} ?disabled=${!hier} @click=${auf(hier, c4)}><span class="aw-tab-name"><span><em>${i7 + 1}</em>${c4.name}</span>${p4.s.awScope === "alle" ? b2`<small>${c4.baustelle || ""}</small>` : A}
            <i style="width:${(c4.kwh || 0) / max * 100}%;background:${farbeVon(hier)}"></i></span><b>${de(c4.kwh, 0)}</b><span>${de(c4.eur, 2)}</span><span>${de(c4.heizzeit, 1)} h</span><span>${zahl(c4.kwh_h) ? de(c4.kwh_h, 2) : "–"}</span><span>${zahl(c4.kwh_m2) ? de(c4.kwh_m2, 2) : "–"}</span><span>${hier ? temp(c4.bereich) : "–"}</span></button>`;
      })}`}</div>`;
    case "erkenntnisse": {
      const E2 = erkenntnisse(p4, A2, z2);
      return laed ? b2`<div class="glas-panel block">${LAEDT8}</div>` : !E2.length ? b2`<div class="glas-panel block"><div class="block-kopf"><b>Was fällt auf</b></div><div class="leer">Noch nichts Auffälliges</div></div>` : b2`<div class="aw-karten">${E2.map(([i7, t5, x2, kk]) => b2`<button class="glas-panel aw-karte" data-k=${kk} @click=${() => p4.awDetail(kk)}><span>${i7}</span><b>${t5}</b><small>${x2}</small></button>`)}</div>`;
    }
    case "k-kosten":
      return kachel("abrechnung", b2`<small>KOSTEN · ${wann2}</small><b>${eur2}</b><span>${zahl(S3.kwh) ? de(S3.kwh, 0) : "–"} kWh ${awDelta((S3.veraenderung || {}).kwh)}</span>`);
    case "k-gespart":
      return kachel("ohne", b2`<small>GESPART</small><b class="gruen-t">${oa ? `${de(oa.gespart_eur, 0)} €` : "–"}</b><span>${oa ? `${de(oa.prozent, 0)} % durch Automatik` : "noch keine Werte"}</span>${oa && oa.hinweis ? b2`<span class="hp-grob">${oa.hinweis}</span>` : A}`);
    case "k-hoch":
      return kachel("hochrechnung", b2`<small>HOCHRECHNUNG</small><b>${h3 && zahl(h3.mit_eur) ? `${de(h3.mit_eur, 0)} €` : "–"}</b><span>bis Ende Heizperiode</span>`);
    case "k-wer": {
      const W = rang.slice(0, 4);
      return kachel("geraete", b2`<small>WER VERBRAUCHT</small>${W.length ? W.map((c4) => b2`<div class="aw-rang"><span>${c4.name}</span><i style="width:${(c4.kwh || 0) / max * 100}%;background:${farbeVon(hierVon(c4))}"></i><em>${de(c4.kwh, 0)} kWh</em></div>`) : b2`<span>–</span>`}`);
    }
    case "k-firmen": {
      const ab = p4.abDaten(z2, void 0, p4.d, vs), F = ab && ab.firmen || [];
      return kachel("abrechnung", b2`<small>FIRMEN</small>${F.length ? F.map((f3) => b2`<div class="aw-zeile"><span>${f3.firma}</span><b>${de(f3.eur ?? (f3.kwh || 0) * preis2, 2)} €</b></div>`) : b2`<span>–</span>`}`);
    }
    case "k-wetter": {
      const g2 = A2 && A2.wetter && A2.wetter.gerade;
      return kachel("wetter", b2`<small>WETTER</small><b>${g2 && g2.k < 0 ? `+${de(-g2.k, 1)}` : "–"}</b><span>kWh je Grad kälter</span>`);
    }
    case "k-oel": {
      const w2 = A2 && A2.typ && A2.typ.weniger;
      return kachel("vergleich", b2`<small>ÖLRADIATOR</small><b>${zahl(w2) ? `${w2 > 0 ? "−" : "+"}${de(Math.abs(w2), 0)} %` : "–"}</b><span>gegenüber Konvektor</span>`);
    }
    case "k-temp": {
      const C2 = d3.bereiche.filter((b3) => !b3.pumpe && b3.t !== null).slice(0, 4);
      return kachel("temperaturen", b2`<small>TEMPERATUREN JETZT</small>${C2.length ? C2.map((b3) => b2`<div class="aw-zeile"><span>${b3.name}</span><b>${de(b3.t)} °C</b></div>`) : b2`<span>kein Fühler</span>`}`);
    }
    case "links":
      return b2`<div class="glas-panel liste">${[["abrechnung", "💶 Abrechnung nach Firma"], ["geraete", "♨ Je Gerät"], ["temperaturen", "🌡 Temperaturen"], ["wetter", "🌦 Energiesignatur"], ["vergleich", "⚖ Ölradiator oder Konvektor"], ["hochrechnung", "📅 Heizperiode · Hochrechnung"]].filter(([kk]) => B2[kk]).map(([kk, t5]) => b2`<button class="zeile" data-k=${kk} @click=${() => p4.awDetail(kk)}><span>${t5}</span><span class="chev">›</span></button>`)}</div>`;
    case "verlauf":
      return diagramm2(p4, z2, gr);
    // FE-0006: füllt die Kachel, ohne eigene Zeitraum-Leiste
    case "wetter":
      return gr.w <= 1 ? stueck(p4, "k-wetter", B2, A2, z2) : B2.wetter;
    default:
      return B2[k2] || "";
  }
}
function kopf4(p4, alle) {
  const S3 = p4.s, layout = S3.awLayout, bearb = S3.awBearb;
  return kopfVorlage("Auswertung", alle ? "ALLE LAUFENDEN BAUSTELLEN" : p4.d.titel, b2`<span class="aw-knoepfe"><button class="glas-panel chip ${layout ? "amber" : ""}" data-aw="layout" @click=${() => p4.awLayoutUmschalten()}>${layout ? "✓ Fertig" : "✥ Layout"}</button>
        <button class="glas-panel chip ${bearb ? "amber" : ""}" data-aw="bearb" @click=${() => p4.awBearbUmschalten()}>${bearb ? "✓ Fertig" : "✎ Anpassen"}</button><button class="glas-panel chip ${S3.awSim ? "sp-chip-sim" : ""}" data-aw="sim" @click=${() => p4.simUmschalten()}>💶 ${S3.awSim ? `simuliert ${de(p4.simPreis(), 2)} €` : "Preis: tatsächlich"}</button><button class="glas-panel chip" data-aw="csv" @click=${() => p4.csv()}>⇩ CSV</button><button class="glas-panel chip kk-plus" data-aw="kk-plus" @click=${() => p4.kkPlus("aw")}>＋ Kachel</button></span>`);
}
function leiste(p4, z2, alle) {
  const S3 = p4.s;
  return b2`${S3.awSim ? b2`<div class="sp-band">🧮 Simuliert: alle € dieser Auswertung mit <span class="sp-sim"><button class="glas-panel chip" data-d="-0.01" @click=${() => p4.spSim(-0.01)}>−</button><b>${de(p4.simPreis(), 2)} €/kWh</b><button class="glas-panel chip" data-d="0.01" @click=${() => p4.spSim(0.01)}>+</button></span> <button class="rv-link" data-aw="sim-zurueck" @click=${() => p4.simUmschalten()}>zurück auf tatsächlich</button></div>` : A}<div class="aw-leiste"><div class="seg glas-panel">${["Tag", "Woche", "Monat", "Jahr"].map((t5) => b2`<button data-v=${t5} class=${z2 === t5 ? "on" : ""} @click=${() => p4.zeitraumWahl("aw", t5)}>${t5}</button>`)}</div>
      <div class="seg glas-panel">${[["diese", "Diese Baustelle"], ["alle", `Alle laufenden (${p4.laufende().length})`]].map(([k2, t5]) => b2`<button data-v=${k2} class=${(S3.awScope || "diese") === k2 ? "on" : ""} @click=${() => p4.awScopeWahl(k2)}>${t5}</button>`)}</div></div>
      ${zeitraumVorlage(p4, "aw", z2, p4.zrGrenze(alle))}`;
}
function anpassen(p4, L2, B2, alle) {
  return b2`<div class="glas-panel block aw-vorlagen"><div class="block-kopf"><b>Vorlage</b><span class="leise">stellt Bausteine, Reihenfolge und Größe ein – danach frei anpassbar</span></div>
          <div class="aw-vorlagen-k">${Object.entries(AW_VORLAGEN).map(([k2, [t5]]) => b2`<button class="glas-panel chip" data-v=${k2} @click=${() => p4.awVorlageWahl(k2)}>${t5}</button>`)}</div></div>
        <div class="glas-panel liste aw-wahl"><div class="gruppe">Bausteine · ein/aus, Reihenfolge, Größe (nur Stufen, die zum Inhalt passen)</div>
          ${L2.map((x2, i7) => b2`<div class="zeile" data-i=${i7}><div><b>${p4.kkName(x2)}</b><div class="leise">${AW_BAUSTEINE[x2.k] ? AW_BAUSTEINE[x2.k][1] : `Kachel · ${KK[x2.k].text}`}${alle && !B2[x2.k] && B2[x2.k] !== void 0 ? " · nur für diese Baustelle" : ""}</div></div>
            <div class="aw-wahl-k"><button class="glas-panel chip" ?disabled=${!i7} aria-label="nach oben" @click=${() => p4.awVerschieben(i7, i7 - 1)}>↑</button><button class="glas-panel chip" ?disabled=${i7 >= L2.length - 1} aria-label="nach unten" @click=${() => p4.awVerschieben(i7, i7 + 1)}>↓</button>
              <div class="seg klein">${awStufen(x2.k).map(([n4, w2, h3]) => b2`<button data-v=${n4} class=${x2.st === n4 ? "on" : ""} title="${w2}×${h3}" @click=${() => p4.awStufeWahl(i7, n4)}>${n4}</button>`)}</div>${schalterVorlage(x2.an, () => p4.awAn(i7), "vor-ort")}</div></div>`)}
          <button class="zeile" data-v="misch" @click=${() => p4.awVorlageWahl("misch")}><span class="blau">Auf Vorschlag zurücksetzen</span></button></div>`;
}
function auswertungVorlage(p4) {
  const { B: B2, A: A2, z: z2, alle } = bausteine(p4), L2 = p4.awAuswahl(), layout = p4.s.awLayout;
  const k2 = kopf4(p4, alle), l4 = leiste(p4, z2, alle);
  if (p4.s.awBearb) return b2`${k2}${l4}
      ${anpassen(p4, L2, B2, alle)}`;
  const an = L2.filter((x2) => x2.an), c4 = p4.kkCtx("aw");
  const teile = an.map((x2, i7) => ({ x: x2, i: i7, inhalt: KK[x2.k] ? kachelVorlage(p4, x2, i7, "aw", c4) : stueck(p4, x2.k, B2, A2, z2, x2) })).filter((t5) => t5.inhalt);
  return b2`${k2}${l4}
      ${layout ? b2`<div class="leise aw-hinweis">Kachel am Griff ⠿ ziehen zum Verschieben · am Griff ◢ ziehen für die Größe (rastet im Raster ein) · 📈 Diagramm der großen Kachel ein/aus · ✕ blendet aus</div>` : A}
      ${teile.length || !layout ? rasterVorlage(p4, "aw", teile, layout) : b2`<div class="leer">Nichts ausgewählt – „＋ Kachel“</div>`}`;
}
function awDetailEinblendung(p4, s4) {
  const { B: B2, A: A2, z: z2 } = bausteine(p4), inhalt = stueck(p4, s4.k, B2, A2, z2);
  return b2`<div class="griff"></div><div class="aw-detail">${inhalt || b2`<div class="leer">Nur für diese Baustelle</div>`}</div><button class="knopf leise-k" @click=${() => p4.schliessen()}>Schließen</button>`;
}

// src/alt.js
var CSS = `/* Wetter */
.wetter .wjetzt { display: flex; align-items: center; gap: 14px; }
.wetter .wjetzt .big { font-size: 34px; line-height: 1.1; }
.wetter .wtage { display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px; margin-top: 12px; border-top: 1px solid var(--divider-color); padding-top: 10px; }
.wetter .wtag { text-align: center; display: flex; flex-direction: column; align-items: center; gap: 2px; }
.wetter .wt { font-size: 12px; font-weight: 600; color: var(--secondary-text-color); }
.wetter .max { font-weight: 600; }
.wetter .frost { color: #2a78d6; font-weight: 600; }
.wetter .regen { color: #2a78d6; }
@keyframes wi-dreh { to { transform: rotate(360deg); } }
@keyframes wi-wolke { 0%, 100% { transform: translateX(-1.5px); } 50% { transform: translateX(1.5px); } }
@keyframes wi-tropfen { 0% { transform: translateY(-5px); opacity: 0; } 25% { opacity: 1; } 100% { transform: translateY(9px); opacity: 0; } }
@keyframes wi-flocke { 0% { transform: translate(-1px, -5px); opacity: 0; } 25% { opacity: 1; } 100% { transform: translate(2px, 9px); opacity: 0; } }
@keyframes wi-blitz { 0%, 86%, 100% { opacity: .15; } 88%, 93% { opacity: 1; } 90% { opacity: .3; } }
@keyframes wi-nebel { 0%, 100% { transform: translateX(-3px); } 50% { transform: translateX(3px); } }
@keyframes wi-stern { 50% { opacity: .2; } }
@keyframes wi-wind { 0% { stroke-dashoffset: 60; } 100% { stroke-dashoffset: 0; } }
.wi .wi-dreh { animation: wi-dreh 18s linear infinite; }
.wi .wi-wolke > g { animation: wi-wolke 6s ease-in-out infinite; }
.wr .wr-kristall { transform-box: fill-box; animation: wi-dreh 6s linear infinite; }
@keyframes wb-puls { 0%, 100% { opacity: .55; transform: scale(.94); } 50% { opacity: 1; transform: scale(1.06); } }
.wi .wb-puls { transform-box: fill-box; transform-origin: center; animation: wb-puls 3.5s ease-in-out infinite; }
.wi .wi-tropfen { animation: wi-tropfen 1.3s linear infinite; }
.wi .wi-flocke { animation: wi-flocke 2.6s linear infinite; }
.wi .wi-blitz { animation: wi-blitz 3.2s linear infinite; }
.wi .wi-nebel { animation: wi-nebel 5s ease-in-out infinite; }
.wi .wi-stern { animation: wi-stern 2.4s ease-in-out infinite; }
.wi .wi-wind { stroke-dasharray: 60; animation: wi-wind 2.4s ease-in-out infinite; }
@media (prefers-reduced-motion: reduce) { .wi * { animation: none !important; } }

/* Übersicht: Baustelle und Container als Kacheln */
.bc { width: 100%; height: auto; display: block; overflow: visible; } .bc.offline { filter: grayscale(.8) brightness(.8); }
@keyframes rein { from { opacity: 0; transform: translateY(14px) scale(.97); } to { opacity: 1; transform: none; } }
@keyframes atmen { 50% { opacity: .55; } }
@keyframes fuellen { from { width: 0; } }
@keyframes blitz { 0%, 100% { transform: scale(1); } 50% { transform: scale(1.12) rotate(-6deg); } }
.bc-licht { filter: drop-shadow(0 0 4px #ffd54f); }   /* BSM-032 */
.sym-zeile { gap: 10px; } .sym-zeile > div { flex: 1; text-align: left; } .sym-mini { width: 56px; flex: none; } .sym-mini svg { width: 100%; height: auto; display: block; }
.sym-vorschau { max-width: 320px; margin: 0 auto 10px; } .sym-vorschau svg { width: 100%; height: auto; }
.sym-farben { display: flex; gap: 6px; align-items: center; flex-wrap: wrap; justify-content: flex-end; }
.sym-farbe { width: 22px; height: 22px; border-radius: 50%; border: 2px solid transparent; padding: 0; } .sym-farbe.on { border-color: var(--ink); box-shadow: 0 0 0 2px rgba(0,0,0,.4); }
.bc-glut { animation: bc-glut 2.6s ease-in-out infinite; } @keyframes bc-glut { 50% { fill: #ffd180; filter: drop-shadow(0 0 4px #ff9800); } }
.bc-waerme { animation: bc-waerme 2.1s ease-in infinite; opacity: 0; } @keyframes bc-waerme { 0% { transform: translateY(6px); opacity: 0; } 30% { opacity: .9; } 100% { transform: translateY(-12px); opacity: 0; } }
.bc-jacke { animation: bc-jacke 2.4s ease-in-out infinite; } @keyframes bc-jacke { 0%, 100% { transform: rotate(-8deg); } 50% { transform: rotate(8deg); } }
.bc-eis { animation: bc-eis 2s ease-in-out infinite; } @keyframes bc-eis { 50% { opacity: .3; } }
.bc-alarm { animation: bc-alarm 1s steps(2) infinite; } @keyframes bc-alarm { 50% { opacity: .25; } }
.bc-pegel { animation: bc-pegel 5s ease-in-out infinite; } @keyframes bc-pegel { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(8px); } }
.bc-welle { animation: bc-welle 3s linear infinite; } @keyframes bc-welle { to { transform: translateX(-60px); } }
.bc-rad { animation: bc-rad .9s linear infinite; transform-box: fill-box; transform-origin: center; } @keyframes bc-rad { to { transform: rotate(360deg); } }
.bc-fluss { stroke-dasharray: 5 5; animation: bc-fluss .6s linear infinite; } @keyframes bc-fluss { to { stroke-dashoffset: -10; } }
@media (prefers-reduced-motion: reduce) { .bc *, .kc, .kc *, .bk * { animation: none !important; } }
`;
var GLAS_CSS = `:host { display: block; height: 100%; }
.lit-bereich { display: contents; }   /* dauerhafter Lit-Bereich (BSM-022 2a.1) – ohne eigene Box */
.wurzel { position: relative; height: 100vh; height: 100dvh; background: #0b0b0b; color: #fff; font-family: -apple-system, "SF Pro Text", system-ui, "Segoe UI", Roboto, sans-serif; font-size: 14px; }
.wurzel.hell { background: #d9dee5; color: #111; }
/* Seitenleiste auf dem Handy (HA zeigt bei eigenen Seiten keinen Kopf) */
.still .glas-k { animation: schweben2 6s ease-in-out infinite; } .still .glas-k.neu, .still .bs-karte, .still .fl-flaeche, .still .fl-linie, .still .hb-spur i, .still .w-inhalt, .still .hz-kachel { animation: none; }
.menue-knopf { position: absolute; top: 10px; left: 14px; z-index: 6; width: 36px; height: 36px; border-radius: 50% !important; display: grid; place-items: center; font-size: 17px; color: var(--ink2); }
/* Glas-Stil (Variante C) – klickbarer Prototyp */

/* Farben der Diagramme (validierte Palette, eigene Stufen für dunkel) */
.ui { position: absolute; inset: 0; }
.app { --s1: #3987e5; --s2: #d95926; --s3: #199e70; --s4: #c98500; --s5: #d55181; --s6: #008300;
  --ink: #fff; --ink2: rgba(255,255,255,.66); --gridc: rgba(255,255,255,.14); --axisc: rgba(255,255,255,.55); --amber: #ff9f0a; --rot: #ff6961; --blau: #64a8ff;
  --panel: rgba(255,255,255,.05); --panel-rand: rgba(255,255,255,.2); --sheet: rgba(28,32,44,.82);
  --fenster: #2b3a44; --rahmen: #cfd8dc; --wr-nebel: #c5d0d7; --wr-wind: #cfe3f3;
  position: relative; height: 100%; overflow: hidden; color: var(--ink); container-type: inline-size; }
.hell .app { --s1: #2a78d6; --s2: #eb6834; --s3: #1baf7a; --s4: #eda100; --s5: #e87ba4; --s6: #008300;
  --ink: #111; --ink2: rgba(0,0,0,.6); --gridc: rgba(0,0,0,.1); --axisc: rgba(0,0,0,.5); --amber: #d97800; --rot: #d7372b; --blau: #0a64d6;
  --panel: rgba(255,255,255,.2); --panel-rand: rgba(255,255,255,.65); --sheet: rgba(250,250,252,.86);
  --fenster: #cfe3f3; --rahmen: #eceff1; --wr-nebel: #8a99a3; --wr-wind: #7d98ad; }
/* Grundform für Knöpfe ohne Gewicht (:where), damit Klassen wie .glas-panel oder .glas-kw sie überschreiben */
:where(.app button) { font: inherit; color: inherit; background: none; border: 0; padding: 0; cursor: pointer; text-align: inherit; }
.app input, .app select { font: inherit; color: var(--ink); background: rgba(127,127,127,.16); border: 1px solid var(--panel-rand); border-radius: 10px; padding: 7px 10px; }
.app select option { color: #111; }

/* Hintergrund: Stimmung nach Tageszeit und Wetter. Farben als registrierte Eigenschaften, damit sie weich überblenden */
@property --g1 { syntax: '<color>'; inherits: true; initial-value: #1c3552; }
@property --g2 { syntax: '<color>'; inherits: true; initial-value: #1f4a70; }
@property --g3 { syntax: '<color>'; inherits: true; initial-value: #2a5575; }
@property --f1 { syntax: '<color>'; inherits: true; initial-value: #ffd27a; }
@property --f2 { syntax: '<color>'; inherits: true; initial-value: #3aa0ff; }
@property --f3 { syntax: '<color>'; inherits: true; initial-value: #7fd0ff; }
.glas-bg { position: absolute; inset: 0; overflow: hidden; background: linear-gradient(165deg, var(--g1) 0%, var(--g2) 50%, var(--g3) 100%);
  transition: --g1 2.5s, --g2 2.5s, --g3 2.5s, --f1 2.5s, --f2 2.5s, --f3 2.5s; --dunst-farbe: #3c4655; --tropfen: rgba(200,225,255,.6); }
.glas-bg[data-phase=morgen] { --g1: #2e2748; --g2: #4a3150; --g3: #6b4040; --f1: #ff8a5c; --f2: #6a7bd6; --f3: #d07ab8; }
.glas-bg[data-phase=tag]    { --g1: #1c3552; --g2: #1f4a70; --g3: #2a5575; --f1: #ffc766; --f2: #3aa0ff; --f3: #7fd0ff; }
.glas-bg[data-phase=abend]  { --g1: #2a1a36; --g2: #45203d; --g3: #5a2a2c; --f1: #ff7a2e; --f2: #d0457a; --f3: #7a4bd0; }
.glas-bg[data-phase=nacht]  { --g1: #070d1c; --g2: #0c1528; --g3: #131a33; --f1: #2c3e8a; --f2: #1b4a7a; --f3: #4b3a8a; }
.hell .glas-bg { --dunst-farbe: #c9ced6; --tropfen: rgba(50,80,120,.35); }
.hell .glas-bg[data-phase=morgen] { --g1: #ffd9c7; --g2: #f5e0f0; --g3: #cfdcff; --f1: #ff9a6a; --f2: #9fb4ff; --f3: #f0a0c8; }
.hell .glas-bg[data-phase=tag]    { --g1: #cfe6ff; --g2: #e3f1ff; --g3: #fff3d6; --f1: #ffd060; --f2: #6ab8ff; --f3: #a8e0ff; }
.hell .glas-bg[data-phase=abend]  { --g1: #ffd2b0; --g2: #f7c6d8; --g3: #d9ccff; --f1: #ff8a3a; --f2: #ff6f9a; --f3: #a58aff; }
.hell .glas-bg[data-phase=nacht]  { --g1: #b9c4e0; --g2: #c9cde6; --g3: #d8d0ec; --f1: #6d80c8; --f2: #7fa3dc; --f3: #9a88d2; }
.glas-bg > i { position: absolute; border-radius: 50%; filter: blur(40px) saturate(1); opacity: .7; animation: schweben 14s ease-in-out infinite; transition: filter 2.5s, opacity 2.5s; }
.glas-bg .k1 { width: 260px; height: 260px; background: var(--f1); top: -60px; left: -60px; }
.glas-bg .k2 { width: 240px; height: 240px; background: var(--f2); top: 300px; right: -80px; animation-delay: -5s; }
.glas-bg .k3 { width: 200px; height: 200px; background: var(--f3); bottom: -40px; left: 40px; animation-delay: -9s; }
.glas-bg[data-phase=nacht] > i { opacity: .45; }
/* Wetter dämpft die Farben und legt Dunst darüber */
.dunst { position: absolute; inset: 0; background: var(--dunst-farbe); opacity: 0; transition: opacity 2.5s; }
.glas-bg[data-wetter=wolkig] .dunst { opacity: .3; }  .glas-bg[data-wetter=wolkig] > i { filter: blur(50px) saturate(.6); }
.glas-bg[data-wetter=regen] .dunst { opacity: .42; }  .glas-bg[data-wetter=regen] > i { filter: blur(55px) saturate(.45); opacity: .5; }
.glas-bg[data-wetter=gewitter] .dunst { opacity: .55; background: #1c2230; } .glas-bg[data-wetter=gewitter] > i { filter: blur(55px) saturate(.35); opacity: .4; }
.hell .glas-bg[data-wetter=gewitter] .dunst { background: #9aa3b2; }
.glas-bg[data-wetter=nebel] .dunst { opacity: .62; }  .glas-bg[data-wetter=nebel] > i { filter: blur(70px) saturate(.3); opacity: .35; }
.glas-bg[data-wetter=schnee] .dunst { opacity: .35; background: #dfe8f2; } .glas-bg[data-wetter=schnee] > i { filter: blur(50px) saturate(.4); }
.glas-bg:not(.hell *)[data-wetter=schnee] .dunst { opacity: .16; }
/* Bewegung */
.partikel { position: absolute; inset: 0; overflow: hidden; pointer-events: none; }
.partikel i { position: absolute; display: block; }
.tropfen { top: -40px; width: 1.5px; height: var(--l); border-radius: 1px; background: linear-gradient(transparent, var(--tropfen));
  transform: rotate(12deg); animation: fallen var(--d) linear infinite; animation-delay: var(--v); }
@keyframes fallen { to { transform: translate(-200px, 950px) rotate(12deg); } }
.blitzlicht { inset: 0; background: #fff; opacity: 0; animation: blitzen 7s linear infinite; }
@keyframes blitzen { 0%, 86%, 88.5%, 91%, 100% { opacity: 0; } 87% { opacity: .35; } 90% { opacity: .22; } }
.flocke { top: -12px; animation: schneien var(--d) linear infinite; animation-delay: var(--v); }
.flocke b { display: block; width: var(--s); height: var(--s); border-radius: 50%; background: rgba(255,255,255,.9); box-shadow: 0 0 4px rgba(255,255,255,.6);
  animation: pendeln var(--w) ease-in-out infinite alternate; }
.hell .flocke b { background: #fff; box-shadow: 0 0 3px rgba(80,100,130,.5); }
@keyframes schneien { to { transform: translateY(950px); } }
@keyframes pendeln { from { transform: translateX(-10px); } to { transform: translateX(10px); } }
.schwade { left: -40%; width: 180%; height: 140px; background: radial-gradient(ellipse at center, rgba(225,232,240,.4), transparent 70%); filter: blur(12px);
  animation: ziehen var(--d) ease-in-out infinite alternate; animation-delay: var(--v); }
@keyframes ziehen { from { transform: translateX(-12%); } to { transform: translateX(12%); } }
.wolke { left: -60%; width: 340px; height: 130px; border-radius: 50%; background: rgba(255,255,255,.12); filter: blur(28px);
  animation: wandern var(--d) linear infinite; animation-delay: var(--v); }
.hell .wolke { background: rgba(255,255,255,.55); }
@keyframes wandern { to { transform: translateX(260%); } }
.stern { width: var(--s); height: var(--s); border-radius: 50%; background: #fff; box-shadow: 0 0 4px #fff; animation: funkeln 3.5s ease-in-out infinite; animation-delay: var(--v); }
.hell .stern { background: #fffbe8; box-shadow: 0 0 4px #7d8fd0; }
@keyframes funkeln { 50% { opacity: .2; } }
.strahlen { top: calc(var(--sonne-y, 8%) - 360px); left: calc(var(--sonne-x, 8%) - 360px); width: 720px; height: 720px; border-radius: 50%;
  background: repeating-conic-gradient(from 0deg, rgba(255,236,170,.14) 0 6deg, transparent 6deg 18deg);
  -webkit-mask: radial-gradient(circle, #000 12%, transparent 62%); mask: radial-gradient(circle, #000 12%, transparent 62%); animation: drehen 90s linear infinite; }
@keyframes drehen { to { transform: rotate(360deg); } }
@media (prefers-reduced-motion: reduce) { .partikel { display: none; } }
/* WebGL-Himmel: zeichnet Verlauf, Lichtflecken, Wolken, Wetter und Tropfen selbst */
.himmel { position: absolute; inset: 0; width: 100%; height: 100%; display: block; }
.glas-bg.gl-an > i, .glas-bg.gl-an .dunst { visibility: hidden; }
.glas-bg.gl-an .partikel { display: none; }

.scroll { position: absolute; inset: 0; overflow-y: auto; }
.seite { padding: 56px 14px 120px; display: flex; flex-direction: column; gap: 12px; max-width: 1100px; margin: 0 auto; }
/* Einblenden nur am Anfang (backwards): eine festgehaltene Deckkraft machte die Seite zur eigenen Ebene – dann bleibt das Glas ohne Unschärfe */
.seite.rein { animation: seite .28s cubic-bezier(.2,.7,.2,1) backwards; }

.glas-panel { background: var(--panel); border: 1px solid var(--panel-rand); backdrop-filter: blur(12px) saturate(1.4); -webkit-backdrop-filter: blur(12px) saturate(1.4);
  border-radius: 24px; box-shadow: 0 8px 32px rgba(0,0,0,.22), inset 0 1px 0 rgba(255,255,255,.22); }
.glas-kopf { display: flex; justify-content: space-between; align-items: center; gap: 12px; padding: 16px 18px; }
.klickbar { cursor: pointer; }
.kopf-wetter { display: inline-flex; align-items: center; gap: 5px; margin-top: 6px; padding: 2px 10px 2px 2px !important; border-radius: 14px !important;
  font-size: 13px; color: var(--ink2) !important; transition: background .2s; }
.kopf-wetter:hover { background: rgba(255,255,255,.1) !important; } .kopf-wetter span:first-of-type { color: var(--ink); font-weight: 500; }
.kopf-wetter .wi { margin: -4px 0; } .pfeil { font-size: 14px; opacity: .6; }
.glas-klein { font-size: 11px; letter-spacing: 1.2px; color: var(--ink2); text-transform: uppercase; }
.glas-titel { font-size: 22px; font-weight: 600; }
.glas-kw { font-size: 38px; font-weight: 300; letter-spacing: -.5px; display: flex; align-items: baseline; gap: 4px; white-space: nowrap; line-height: 1; }
.glas-kw small { font-size: 16px !important; opacity: .75 !important; font-weight: 400; letter-spacing: 0; }
.glas-kw small, .glas-wert small, .c-wert small { font-size: .5em; opacity: .7; }
.blitz { font-size: 26px; opacity: .4; align-self: center; } .blitz.an { opacity: 1; filter: drop-shadow(0 0 8px rgba(255,214,10,.9)); animation: blitz 2.4s ease-in-out infinite; }

.glas-chips { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }
.chip { display: inline-flex; align-items: center; gap: 5px; font-size: 13px; padding: 6px 12px; border-radius: 18px !important; transition: transform .15s; }
.chip:active { transform: scale(.96); } .chip.rot { color: var(--rot); } .chip.amber { color: var(--amber); }
.chip-leise { font-size: 12px; color: var(--ink2); margin-left: 4px; }
.auto-chip { gap: 8px !important; padding-left: 7px !important; font-weight: 600; }
.mini-sw { position: relative; width: 28px; height: 16px; border-radius: 8px; background: rgba(120,120,128,.45); transition: background .25s; flex: none; }
.mini-sw i { position: absolute; top: 2px; left: 2px; width: 12px; height: 12px; border-radius: 50%; background: #fff; box-shadow: 0 1px 3px rgba(0,0,0,.3);
  transition: transform .25s cubic-bezier(.3,.7,.2,1.2); }
.auto-chip.on .mini-sw { background: var(--amber); } .auto-chip.on .mini-sw i { transform: translateX(12px); }
.chip-status { font-size: 13px; color: var(--ink2); } .chip-status.amber { color: var(--amber); font-weight: 500; }

.glas-raster { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
.glas-k { padding: 12px; display: flex; flex-direction: column; gap: 3px; animation: rein .5s ease-out backwards, schweben2 6s ease-in-out infinite;
  transition: transform .2s cubic-bezier(.2,.7,.2,1), box-shadow .2s; }
.glas-k:nth-child(2n) { animation-delay: 0s, -3s; }
.glas-k:hover { box-shadow: 0 14px 40px rgba(0,0,0,.3), inset 0 1px 0 rgba(255,255,255,.3); } .glas-k:active { transform: scale(.97); }
.glas-illu { margin: -4px -6px -2px; filter: drop-shadow(0 12px 14px rgba(0,0,0,.35)); }
.glas-name { font-weight: 600; font-size: 15px; }
.glas-zeile { display: flex; justify-content: space-between; align-items: baseline; }
.glas-wert { font-size: 26px; font-weight: 300; } .glas-kwk { font-size: 12px; color: var(--ink2); }
.glas-status { display: flex; align-items: center; gap: 6px; font-size: 12px; color: var(--ink2); }
.glas-dot { width: 8px; height: 8px; border-radius: 50%; background: var(--c); box-shadow: 0 0 10px var(--c); animation: atmen 2s infinite; flex: none; }
.glas-geraete { display: flex; align-items: center; gap: 4px; margin-top: 3px; font-size: 11px; color: var(--ink2); }
.glas-geraete i { width: 6px; height: 6px; border-radius: 50%; background: rgba(142,142,147,.55); } .glas-geraete i.an { background: var(--amber); box-shadow: 0 0 6px var(--amber); }
.glas-geraete span { margin-left: 4px; }
.glas-k.neu { align-items: center; justify-content: center; min-height: 180px; color: var(--ink2); background: transparent; border-style: dashed; box-shadow: none; animation: rein .5s ease-out backwards; }
.glas-k.neu span { font-size: 34px; font-weight: 200; color: var(--ink); }

.glas-nav { position: absolute; left: 14px; right: 14px; bottom: 22px; display: flex; justify-content: space-around; padding: 6px; z-index: 5; }
.glas-nav button { flex: 1; text-align: center; padding: 8px 2px; border-radius: 16px; font-size: 13px; color: var(--ink2); transition: background .2s, color .2s; }
.glas-nav button.nav-ic { flex: 0 0 48px; display: grid; place-items: center; padding: 5px 2px; }
.glas-nav button.nav-ic svg { display: block; transition: transform .4s cubic-bezier(.3,.7,.2,1); } .glas-nav button.nav-ic:hover svg { transform: rotate(60deg); }
.glas-nav button.on { color: var(--ink); font-weight: 700; background: rgba(255,255,255,.16); }
.hell .glas-nav button.on { background: rgba(255,255,255,.7); }

/* Verbrauch (Klick auf kW) */
.kw-knopf { cursor: pointer; border-radius: 14px !important; padding: 4px 8px !important; margin: -4px -8px -4px 0 !important; transition: background .2s; }
.kw-knopf:hover { background: rgba(255,255,255,.12) !important; } .kw-pfeil { font-size: 22px; opacity: .5; margin-left: 4px; align-self: center; }
.c-kw.kw-knopf { margin: 4px 0 0 -8px !important; }
.vb-wer { display: flex; gap: 6px; overflow-x: auto; padding-bottom: 2px; scrollbar-width: none; }
.vb-wer button { display: inline-flex; align-items: center; gap: 6px; white-space: nowrap; font-size: 12px; padding: 5px 10px !important; border-radius: 14px !important;
  border: 1px solid var(--panel-rand) !important; color: var(--ink2) !important; transition: background .2s, color .2s; }
.vb-wer button.on { background: rgba(255,255,255,.2) !important; color: var(--ink) !important; font-weight: 600; } .hell .vb-wer button.on { background: #fff !important; }
.vb-wer i { width: 8px; height: 8px; border-radius: 50%; }
.app { --trenn: rgba(20,24,34,.85); } .hell .app { --trenn: rgba(255,255,255,.95); }
.tip-summe { margin-top: 4px; padding-top: 4px; border-top: 1px solid var(--gridc); }
.vb-je { display: flex; flex-direction: column; font-size: 13px; }
.vb-je div { display: grid; grid-template-columns: 10px 1fr auto 62px 78px; gap: 8px; align-items: center; padding: 6px 0; }
.vb-je div + div { border-top: 1px solid var(--gridc); } .vb-je i { width: 8px; height: 8px; border-radius: 50%; }
.vb-je .n { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; } .vb-je span:not(.n) { text-align: right; } .vb-je b { font-weight: 600; text-align: right; }
.fl-flaeche, .fl-linie { animation: seite .4s ease-out backwards; }

/* Heizt: Kachel glüht am Rand warm */
.glas-k, .c-held { position: relative; }
.glas-k.heizt::after, .glas-k.trocknen::after, .glas-k.frost::after, .c-held.heizt::after, .c-held.trocknen::after, .c-held.frost::after {
  content: ""; position: absolute; inset: -1px; border-radius: inherit; pointer-events: none;
  box-shadow: inset 0 0 26px 1px rgba(255, 84, 40, .42), 0 0 22px rgba(255, 84, 40, .22); animation: gluehen 3.4s ease-in-out infinite; }
.hell .glas-k.heizt::after, .hell .glas-k.trocknen::after, .hell .glas-k.frost::after, .hell .c-held.heizt::after, .hell .c-held.trocknen::after, .hell .c-held.frost::after {
  box-shadow: inset 0 0 24px 1px rgba(240, 80, 30, .32), 0 0 20px rgba(240, 80, 30, .18); }
@keyframes gluehen { 50% { opacity: .55; } }
.glas-k:nth-child(3n)::after { animation-delay: -1.2s; } .glas-k:nth-child(3n+1)::after { animation-delay: -2.3s; }

/* Verbrauch oben in der Container-Ansicht, Diagramm-Optionen, Bearbeiten */
.kennz-knopf { position: relative; width: 100%; cursor: pointer; transition: transform .15s; } .kennz-knopf:active { transform: scale(.98); }
.kennz-mehr { position: absolute; right: 12px; top: 6px; font-size: 11px; color: var(--ink2); }
.chart-optionen { display: flex; justify-content: flex-end; } .chart-optionen .chip { font-size: 12px; font-weight: 500 !important; background: rgba(120,120,128,.18) !important; }
.ge-zeile { display: flex; align-items: center; gap: 8px; padding: 8px 0; border-top: 1px solid var(--gridc); }
.ge-zeile.weg { justify-content: space-between; color: var(--ink2); text-decoration: line-through; } .ge-zeile.weg .chip { text-decoration: none; font-size: 12px; }
.ge-felder { flex: 1; display: flex; flex-direction: column; gap: 6px; min-width: 0; } .ge-shelly { font-size: 11px; }
.ge-zwei { display: grid; grid-template-columns: 1fr 120px; gap: 6px; } .ge-zwei input, .ge-zwei select, .ge-felder > select { min-width: 0; }

/* Container-Ansicht */
.zurueck-zeile { display: flex; justify-content: space-between; }
.c-held { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; align-items: center; padding: 14px; }
.c-illu { filter: drop-shadow(0 16px 18px rgba(0,0,0,.35)); animation: schweben2 6s ease-in-out infinite; }
.c-wert { font-size: 40px; font-weight: 300; margin: 4px 0; } .c-kw { font-size: 13px; color: var(--ink2); margin-top: 4px; }
.block { padding: 14px 16px; display: flex; flex-direction: column; gap: 8px; }
.block-kopf { display: flex; justify-content: space-between; align-items: baseline; gap: 10px; flex-wrap: wrap; }
.leise { color: var(--ink2); font-size: 12px; } .rot-t { color: var(--rot); } .blau { color: var(--blau); } .ok { color: #30d158; font-size: 12px; }
.liste { padding: 4px 0; }
.zeile { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 10px 16px; width: 100%; box-sizing: border-box; min-height: 44px; }
.block .zeile { padding: 8px 0; }
.liste .zeile + .zeile, .block .zeile + .zeile { border-top: 1px solid var(--gridc); }
.zeile.unter { padding-left: 14px; font-size: 14px; }
.block .zeile.unter { padding-left: 14px; }
.gruppe { font-size: 11px; letter-spacing: 1.2px; text-transform: uppercase; color: var(--ink2); padding: 10px 16px 2px; }
.geraet { justify-content: flex-start; } .g-t { flex: 1; display: flex; flex-direction: column; } .g-t .leise em.hand { color: var(--amber); font-style: normal; font-weight: 600; }
.g-ic { width: 32px; height: 32px; border-radius: 10px; display: grid; place-items: center; background: rgba(142,142,147,.22); flex: none; transition: background .25s, box-shadow .25s; }
.g-ic.an { background: color-mix(in srgb, var(--amber) 28%, transparent); box-shadow: 0 0 14px color-mix(in srgb, var(--amber) 50%, transparent); }
.farbpunkt { display: inline-block; width: 8px; height: 8px; border-radius: 50%; margin-right: 8px; }

/* Schalter */
.sw { width: 50px; height: 30px; border-radius: 15px !important; background: rgba(120,120,128,.36) !important; position: relative; flex: none; transition: background .25s; }
.sw i { position: absolute; top: 2px; left: 2px; width: 26px; height: 26px; border-radius: 50%; background: #fff; box-shadow: 0 3px 8px rgba(0,0,0,.2); transition: transform .25s cubic-bezier(.3,.7,.2,1.2); }
.sw.on { background: var(--amber) !important; } .sw.on i { transform: translateX(20px); }

/* Segmente und Stepper */
.seg { display: flex; padding: 3px; border-radius: 14px; background: rgba(120,120,128,.2); gap: 2px; }
.seg.glas-panel { border-radius: 16px; padding: 4px; }
.seg button { flex: 1; text-align: center; padding: 7px 6px; border-radius: 11px; font-size: 13px; color: var(--ink2); transition: background .2s, color .2s; white-space: nowrap; }
.seg button.on { background: rgba(255,255,255,.2); color: var(--ink); font-weight: 600; box-shadow: 0 2px 8px rgba(0,0,0,.15); }
.hell .seg button.on { background: #fff; }
.seg.klein button { padding: 5px 10px; font-size: 12px; flex: none; }
.stepper { display: flex; align-items: center; gap: 4px; background: rgba(120,120,128,.2); border-radius: 12px; padding: 2px; }
.stepper button { width: 32px; height: 30px; text-align: center; border-radius: 10px; font-size: 18px; }
.stepper button:active { background: rgba(255,255,255,.2); } .stepper b { min-width: 66px; text-align: center; font-size: 14px; font-weight: 600; }

/* Zeitplan */
.tag { cursor: pointer; } .tag-n { width: 28px; } .fenster { flex: 1; display: flex; gap: 6px; flex-wrap: wrap; }
.fenster em { font-style: normal; font-size: 12px; padding: 3px 8px; border-radius: 8px; background: color-mix(in srgb, var(--amber) 22%, transparent); color: var(--ink); }
.chev { color: var(--ink2); font-size: 18px; }
.tl-spur { position: relative; height: 22px; border-radius: 8px; background: rgba(120,120,128,.2); overflow: hidden; }
.tl-spur i { position: absolute; top: 0; bottom: 0; }
.tl-heiz { background: var(--amber); opacity: .85; }
.tl-trock { background: repeating-linear-gradient(45deg, var(--amber) 0 3px, transparent 3px 7px); }
.tl-jetzt { width: 2px; background: var(--ink); box-shadow: 0 0 6px var(--ink); }
.tl-achse { display: flex; justify-content: space-between; font-size: 11px; color: var(--ink2); margin-top: 4px; }

/* Arbeitszeit und Heizplan */
.tl-vor { background: color-mix(in srgb, var(--amber) 45%, transparent); }
.tl-extra { background: repeating-linear-gradient(45deg, var(--blau) 0 3px, transparent 3px 7px); opacity: .8; }
.chip-status { display: inline-flex; align-items: center; gap: 4px; padding: 4px 6px !important; border-radius: 12px !important; transition: background .2s; }
.chip-status:hover { background: rgba(255,255,255,.12) !important; }
.regelung { display: flex; flex-direction: column; gap: 2px; font-size: 13px; padding-top: 8px; border-top: 1px solid var(--gridc); }
.regelung span { color: var(--ink2); font-size: 12px; }
.az-name { font-size: 18px; font-weight: 600; margin-top: -2px; }
.zeile.az.heute .tag-n { color: var(--amber); }
.badge.blau-b { background: color-mix(in srgb, var(--blau) 22%, transparent); color: var(--blau); }
.hp-legende { display: flex; flex-wrap: wrap; gap: 6px 14px; font-size: 11px; color: var(--ink2); }
.hp-legende i { display: inline-block; width: 14px; height: 8px; border-radius: 3px; margin-right: 5px; vertical-align: middle; }
.hp { display: flex; flex-direction: column; }
.hp-zeile { display: grid; grid-template-columns: 48px 1fr 42px; gap: 10px; align-items: center; padding: 7px 0; }
.hp-zeile + .hp-zeile { border-top: 1px solid var(--gridc); } .hp-zeile.achse { border-top: 0; padding-top: 0; }
.hp-zeile.heute { background: rgba(255,255,255,.07); border-radius: 12px; margin: 0 -8px; padding: 7px 8px; }
.hp-zeile .tl-spur { height: 14px; border-radius: 5px; } .hp-mitte .leise { font-size: 11px; margin-top: 3px; min-height: 13px; }
.hp-tag { display: flex; flex-direction: column; font-size: 11px; color: var(--ink2); } .hp-tag b { font-size: 14px; color: var(--ink); }
.hp-zeile.heute .hp-tag b { color: var(--amber); }
.hp-zeit { font-size: 11px; text-align: right; color: var(--ink2); line-height: 1.35; font-variant-numeric: tabular-nums; }
.azn input[type=time] { flex: 1; min-width: 0; padding: 5px 6px; } .azn .frei { flex: 1; }
.raster-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }

/* Warnungen und Protokoll */
.warn-chip { display: inline-block !important; max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.chip.gelb { color: #ffd60a; } .hell .chip.gelb { color: #9a6b00; }
.gruppe-t { font-size: 11px; letter-spacing: 1px; text-transform: uppercase; color: var(--ink2); margin-top: 4px; }
.wk { border-left: 3px solid var(--rot); padding: 6px 0 8px 12px; display: flex; flex-direction: column; gap: 3px; }
.wk.hinweis { border-color: #ffd60a; } .hell .wk.hinweis { border-color: #d9a400; } .wk.stumm { opacity: .55; border-color: var(--ink2); }
.wk-kopf { display: flex; justify-content: space-between; gap: 8px; } .wk-titel { font-size: 15px; font-weight: 500; }
.wk.stoerung .wk-titel { color: var(--rot); }
.wk-knoepfe { display: flex; gap: 6px; flex-wrap: wrap; margin-top: 4px; } .wk-knoepfe .chip { font-size: 12px; padding: 4px 10px; }
.p-tag { font-size: 11px; letter-spacing: 1px; text-transform: uppercase; color: var(--ink2); margin-top: 8px; padding-bottom: 2px; }
.p-ic { width: 16px; text-align: center; flex: none; font-size: 13px; }
.ereignis > div { font-size: 13px; } .p-fuss { padding: 6px 16px 10px; }

/* Heizung: Regeln heute, je Container, Feiertage */
.hr-zeile { display: grid; grid-template-columns: 26px 1fr 14px; gap: 8px; align-items: center; padding: 7px 0; opacity: .6; }
.hr-zeile + .hr-zeile { border-top: 1px solid var(--gridc); } .hr-zeile.an { opacity: 1; }
.hr-ic { font-size: 18px; text-align: center; } .hr-an { color: var(--ink2); font-size: 11px; } .hr-zeile.an .hr-an { color: var(--amber); }
.jc { display: flex; justify-content: space-between; align-items: center; gap: 8px; padding: 8px 0; border-top: 1px solid var(--gridc); flex-wrap: wrap; }
.jc-name { display: flex; flex-direction: column; min-width: 110px; } .jc-ctrl { display: flex; align-items: center; gap: 6px; }
.jc-l { font-size: 11px; color: var(--ink2); } .jc-th { width: 92px; text-align: center; font-size: 11px; }
.sw.klein { width: 38px; height: 22px; } .sw.klein i { width: 18px; height: 18px; } .sw.klein.on i { transform: translateX(16px); }
.stepper.klein button { width: 24px; height: 24px; font-size: 15px; } .stepper.klein b { min-width: 40px; font-size: 13px; } .stepper b.eigen { color: var(--amber); }
.ft-d { font-weight: 600; min-width: 64px; display: inline-block; }
/* Auswertung */
.kennz.vier { grid-template-columns: repeat(4, 1fr); } .kennz em { display: block; font-style: normal; font-size: 10.5px; margin-top: 2px; }
.kennz em.mehr { color: var(--rot); } .kennz em.weniger { color: #30d158; }
@container (max-width: 420px) { .kennz.vier { grid-template-columns: repeat(2, 1fr); row-gap: 10px; } .kennz.vier div:nth-child(3) { border-left: 0; } }
.vgl { margin: -6px 6px 0; }
.hinweis-k { font-size: 13px; padding: 8px 10px; border-radius: 12px; background: rgba(120,120,128,.14); }
.punkt-s { stroke: var(--sheet); stroke-width: 1.5; opacity: .9; }

/* Firmen und Abrechnung */
.firma-tag { align-self: flex-start; font-size: 10.5px; padding: 1px 7px; border-radius: 8px; background: rgba(120,120,128,.25); color: var(--ink2); margin-top: -1px; }
.fc-neu input { flex: 1; min-width: 0; }
.vb-gruppe { display: flex; align-items: center; justify-content: flex-end; gap: 8px; }
.ab-firma { padding: 8px 0; border-top: 1px solid var(--gridc); } .ab-firma:first-of-type { border-top: 0; }
.ab-kopf { display: flex; justify-content: space-between; align-items: baseline; gap: 8px; }
.ab-c { display: flex; justify-content: space-between; gap: 8px; font-size: 12.5px; padding: 3px 0 0 12px; }

/* Staffelung / Strom */
.strom-knopf { display: flex; flex-direction: column; gap: 5px; width: calc(100% + 0px); margin-top: 12px; padding-top: 10px !important; border-top: 1px solid var(--gridc) !important; cursor: pointer; }
.glas-kopf { flex-wrap: wrap; } .glas-kopf .strom-knopf { flex-basis: 100%; }
.strom-t { font-size: 12px; color: var(--ink2); } .strom-t b { color: var(--ink); font-weight: 600; }
.strom-spur { position: relative; display: flex; height: 10px; border-radius: 5px; overflow: hidden; background: rgba(120,120,128,.2); gap: 2px; }
.strom.klein .strom-spur { height: 7px; } .strom-spur i { display: block; height: 100%; transition: width .5s cubic-bezier(.2,.7,.2,1); }
.strom-spur .s-res { margin-left: auto; }
.s-heiz { background: var(--amber); } .s-pumpe { background: var(--blau); } .s-sonst { background: rgba(142,142,147,.85); }
.s-res { background: repeating-linear-gradient(45deg, rgba(142,142,147,.6) 0 3px, transparent 3px 6px); }
.strom-leg { display: flex; flex-wrap: wrap; gap: 4px 12px; font-size: 11px; color: var(--ink2); }
.strom-leg i { display: inline-block; width: 12px; height: 8px; border-radius: 2px; margin-right: 5px; vertical-align: middle; }
.an-block { display: flex; flex-direction: column; gap: 5px; padding: 8px 0; border-top: 1px solid var(--gridc); }
.an-kopf { display: flex; justify-content: space-between; gap: 8px; }
.ph-zeile { display: grid; grid-template-columns: 24px 1fr 56px; gap: 8px; align-items: center; font-size: 12px; } .ph-zeile .leise { text-align: right; }
.amber-t { color: var(--amber); } .lila { color: #bf5af2; } .blau { color: var(--blau); }
.g-t em.warte { color: var(--blau); font-style: normal; }
.gt-einzug { padding: 8px 16px 0; }
/* Tür */
.tuer-tag { align-self: flex-start; font-size: 10.5px; padding: 1px 7px; border-radius: 8px; background: rgba(191,90,242,.22); color: #d9a6f7; }
.hell .tuer-tag { color: #8a2fb8; }
.tuer-z { font-size: 12px; padding: 2px 9px; border-radius: 10px; background: rgba(48,209,88,.2); color: #30d158; } .tuer-z.offen { background: rgba(191,90,242,.22); color: #bf5af2; }
.ge-phase { display: flex; align-items: center; gap: 8px; }
/* Nachrichten und Bericht */
.noti { background: rgba(250,250,252,.96); color: #111; border-radius: 18px; padding: 10px 12px; display: flex; flex-direction: column; gap: 2px; font-size: 13px; box-shadow: 0 4px 14px rgba(0,0,0,.25); }
.noti-app { font-size: 11px; color: #666; } .noti b { font-size: 14px; }
.noti-knoepfe { display: flex; gap: 14px; margin-top: 6px; } .noti-knoepfe button { color: #0a64d6 !important; font-weight: 600; font-size: 13px; padding: 4px 0 !important; }
.mail { border-radius: 14px; overflow: hidden; border: 1px solid var(--panel-rand); font-size: 13px; }
.mail-kopf { padding: 8px 12px; background: rgba(120,120,128,.16); display: flex; flex-direction: column; gap: 2px; }
.mail-anhang { font-size: 12px; margin-top: 3px; } .mail-inhalt { padding: 10px 12px; }
.mail-t { font-size: 11px; text-transform: uppercase; letter-spacing: 1px; color: var(--ink2); margin-top: 10px; }
.mail-z { display: flex; justify-content: space-between; gap: 8px; padding: 2px 0; }
.mail-feld { flex: 1; min-width: 0; margin-left: 12px; }

/* Nur bei Bedarf */
.glas-k.bereit { opacity: .88; }
.bedarf-knopf { align-self: stretch; margin-top: 6px; padding: 7px 10px !important; border-radius: 12px !important; text-align: center !important; font-size: 13px; font-weight: 600;
  background: rgba(120,120,128,.22) !important; transition: background .2s, transform .12s; }
.bedarf-knopf:active { transform: scale(.96); } .bedarf-knopf.an { background: color-mix(in srgb, var(--amber) 30%, transparent) !important; color: var(--amber) !important; }
.bedarf-dauer { display: flex; gap: 8px; flex-wrap: wrap; } .bedarf-dauer.gross { flex-direction: column; }
.bedarf-an { display: flex; justify-content: space-between; align-items: center; gap: 8px; color: var(--amber); }
.glas-k[role=button] { cursor: pointer; }

/* Heizzeiten-Übersicht */
.tl-termin { background: color-mix(in srgb, var(--amber) 70%, #bf5af2); }
.hz-tag { display: flex; flex-direction: column; gap: 6px; }
.hz-zeile { display: grid; grid-template-columns: 96px 1fr 40px; gap: 8px; align-items: center; } .hz-zeile.aus { opacity: .45; }
.hz-n { font-size: 12px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; } .hz-h { font-size: 11px; color: var(--ink2); text-align: right; }
.tl-spur.hz { height: 14px; border-radius: 5px; }
.hz-woche { display: flex; flex-direction: column; gap: 3px; font-size: 12px; }
.hz-wk, .hz-wz { display: grid; grid-template-columns: 92px repeat(7, 1fr) 40px; gap: 3px; align-items: center; }
.hz-wk span { text-align: center; font-size: 11px; color: var(--ink2); line-height: 1.1; } .hz-wk span.heute { color: var(--amber); font-weight: 700; }
.hz-zelle { height: 26px; border-radius: 6px !important; text-align: center !important; font-size: 11px; background: color-mix(in srgb, var(--amber) calc(var(--a) * 100%), rgba(120,120,128,.14)) !important; }
.hz-sum { text-align: right; font-size: 11px; }
.t-wann { width: 70px !important; }

/* Melden, Über, Entwicklung */
.melden-knopf { position: absolute; right: 16px; bottom: 90px; z-index: 6; width: 38px; height: 38px; border-radius: 50% !important; display: grid; place-items: center; color: var(--ink2);
  opacity: .8; transition: opacity .2s, transform .15s; } .melden-knopf:hover { opacity: 1; color: var(--ink); } .melden-knopf:active { transform: scale(.92); }
.melden-knopf.im-sheet { position: absolute; top: 10px; right: 12px; bottom: auto; width: 32px; height: 32px; z-index: 2; background: rgba(120,120,128,.18); }
.sheet > .block-kopf:first-of-type, .sheet > h3:first-of-type { padding-right: 40px; }
.app textarea { font: inherit; color: var(--ink); background: rgba(127,127,127,.16); border: 1px solid var(--panel-rand); border-radius: 10px; padding: 8px 10px; resize: vertical; font-size: 15px; }
.ml-kontext { font-size: 12px; padding: 8px 10px; border-radius: 10px; background: rgba(120,120,128,.14); display: flex; flex-direction: column; gap: 2px; }
.ml-nr { font-variant-numeric: tabular-nums; } .ml-notiz { font-style: italic; }
.badge.st-neu { background: rgba(10,132,255,.2); color: var(--blau); } .badge.st-angenommen, .badge.st-in_arbeit { background: color-mix(in srgb, var(--amber) 22%, transparent); color: var(--amber); } .badge.st-geloest { background: rgba(48,209,88,.22); color: #30d158; }
.ml { padding: 8px 0 8px 12px; border-left: 3px solid var(--blau); display: flex; flex-direction: column; gap: 3px; } .ml.erledigt { opacity: .55; border-color: var(--ink2); }
.ml + .ml { margin-top: 6px; } .ml-kopf { display: flex; justify-content: space-between; gap: 8px; } .ml-text { font-size: 14px; }
.badge.rot-b { background: rgba(255,69,58,.2); color: var(--rot); }
.ueber-kopf { display: grid; grid-template-columns: 110px 1fr; gap: 12px; align-items: center; padding: 16px; } .ueber-illu { filter: drop-shadow(0 10px 12px rgba(0,0,0,.3)); }
.ueber-v { font-size: 15px; margin: 4px 0; }
.cl-punkt { font-size: 13px; padding: 4px 0 4px 14px; position: relative; } .cl-punkt::before { content: ""; position: absolute; left: 2px; top: 11px; width: 5px; height: 5px; border-radius: 50%; background: var(--amber); }
.cl-liste { padding: 0 0 8px 4px; } .cl-v { border-top: 1px solid var(--gridc); }
@container (min-width: 700px) { .melden-knopf { bottom: 24px; right: 24px; } }

.hp-zeile.ausn .hp-tag b::after { content: ' •'; color: var(--blau); }

.hz-ohne { margin: 4px 0 2px; } .hz-wz-ohne { grid-column: 2 / -1; text-align: left; font: inherit; font-size: 11.5px; background: none; border: 1px dashed var(--divider-color); border-radius: 8px; padding: 4px 8px; cursor: pointer; color: var(--secondary-text-color); }
.hz-c { display: flex; justify-content: space-between; align-items: baseline; margin-top: 6px; font-size: 12.5px; } .hz-cn { font-weight: 600; } .hz-cp { font-size: 11px; }
.hz-g { padding-left: 10px; color: var(--ink2); font-size: 11.5px; }
.tl-spur.hz { height: 12px; }
.hz-plan { background: color-mix(in srgb, var(--amber) 22%, transparent); } .hz-plan.vorbei { background: color-mix(in srgb, var(--amber) 12%, transparent); }
.hz-an { background: var(--amber); border-radius: 2px; } .hz-off { background: repeating-linear-gradient(45deg, rgba(255,69,58,.5) 0 3px, transparent 3px 6px); }
.hp-legende i.hz-plan, .hp-legende i.hz-an, .hp-legende i.hz-off { display: inline-block; width: 14px; height: 8px; }
.hz-zelle.geplant { opacity: .55; font-style: italic; }
.hz-wk, .hz-wz { grid-template-columns: 124px repeat(7, 1fr) 40px; } .hz-wz .hz-n { font-size: 11.5px; }

/* Kennzahlen */
.kennz { display: grid; grid-template-columns: repeat(3, 1fr); padding: 14px 6px; text-align: center; }
.kennz div + div { border-left: 1px solid var(--gridc); }
.kennz b { display: block; font-size: 20px; font-weight: 500; } .kennz span { font-size: 11px; color: var(--ink2); }

/* Diagramme */
.chart-wrap { position: relative; }
.chart { width: 100%; height: auto; display: block; overflow: visible; }
.chart .gr { stroke: var(--gridc); stroke-width: 1; } .chart .ax-e { font-weight: 600; font-size: 9px; } .chart .ax { fill: var(--axisc); font-size: 10px; }
.chart .kreuz { stroke: var(--ink2); stroke-width: 1; stroke-dasharray: 2 3; } .chart .punkt { stroke: var(--sheet); stroke-width: 2; }
.chart .bar { transition: opacity .15s; } .chart .bar.matt { opacity: .35; }
.legende { display: flex; gap: 14px; font-size: 12px; color: var(--ink2); margin-top: 4px; }
.legende i, .tip i { display: inline-block; width: 10px; height: 3px; border-radius: 2px; margin-right: 5px; vertical-align: middle; }
.leer { font-size: 13px; color: var(--ink2); padding: 24px 0; text-align: center; } .link { color: var(--blau) !important; }
.tip { position: absolute; z-index: 30; pointer-events: none; opacity: 0; transition: opacity .12s; background: var(--sheet); color: var(--ink); border: 1px solid var(--panel-rand);
  backdrop-filter: blur(16px); -webkit-backdrop-filter: blur(16px); border-radius: 12px; padding: 7px 10px; font-size: 12px; box-shadow: 0 6px 20px rgba(0,0,0,.25); white-space: nowrap; }
.tip.an { opacity: 1; }
.hbar { display: grid; grid-template-columns: 110px 1fr 54px; align-items: center; gap: 10px; font-size: 13px; }
.hb-spur { height: 10px; border-radius: 5px; background: rgba(120,120,128,.18); overflow: hidden; }
.hb-spur i { display: block; height: 100%; border-radius: 5px; animation: wachsen .6s cubic-bezier(.2,.7,.2,1) both; transform-origin: left; }
.hb-w { text-align: right; font-weight: 600; } .hb-n { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.gespart { font-size: 14px; } .gespart b { color: #30d158; }
.vergleich { width: 100%; border-collapse: collapse; font-size: 13px; }
.vergleich th { text-align: right; font-weight: 600; color: var(--ink2); font-size: 12px; padding: 4px 0; } .vergleich td { padding: 7px 0; border-top: 1px solid var(--gridc); }
.vergleich td + td { text-align: right; } .fuss { margin-top: 4px; }

/* Verlauf */
.bs-karte { padding: 14px 16px; display: flex; flex-direction: column; gap: 4px; animation: rein .45s ease-out backwards; }
.bs-kopf { display: flex; justify-content: space-between; align-items: center; gap: 8px; }
.bs-zahlen { display: flex; gap: 18px; margin-top: 6px; font-size: 13px; color: var(--ink2); } .bs-zahlen b { font-size: 18px; color: var(--ink); font-weight: 500; }
.badge { font-size: 11px; padding: 2px 8px; border-radius: 10px; background: rgba(142,142,147,.25); color: var(--ink2); }
.badge.gruen { background: rgba(48,209,88,.22); color: #30d158; }
.ereignis { justify-content: flex-start; align-items: flex-start; } .ereignis .zeit { width: 42px; font-size: 12px; color: var(--ink2); padding-top: 2px; } .ereignis .glas-dot { margin-top: 5px; }
.eingabe input { width: 70px; text-align: right; }

/* Einblendung von unten */
.schleier { position: absolute; inset: 0; background: rgba(0,0,0,.35); opacity: 0; pointer-events: none; transition: opacity .25s; z-index: 20; }
.schleier.an { opacity: 1; pointer-events: auto; }
.sheet { position: absolute; left: 8px; right: 8px; bottom: 8px; max-height: 82%; overflow-y: auto; z-index: 21; padding: 8px 18px 18px; background: var(--sheet);
  transform: translateY(110%); transition: transform .32s cubic-bezier(.2,.8,.2,1); border-radius: 28px; display: flex; flex-direction: column; gap: 10px; }
.sheet.an { transform: none; }
.sheet > * { flex-shrink: 0; }   /* nichts zusammendrücken – die Einblendung scrollt (sonst verschwindet z. B. die Chip-Reihe) */
.sheet h3 { margin: 4px 0 0; font-size: 20px; }
.griff { width: 40px; height: 5px; border-radius: 3px; background: var(--ink2); opacity: .5; margin: 0 auto 4px; }
.bs-zeile .bs-wahl { flex: 1; display: flex; align-items: center; justify-content: space-between; gap: 12px; min-height: 36px; text-align: left; }
.bs-zeile .bs-ic { color: var(--ink2); padding: 4px 8px; font-size: 16px; }
.neu-version { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 10px 16px; margin-bottom: 12px; border-color: var(--amber); }
${NUR_LESEN_SPERRE.map((x2) => `.nur-lesen ${x2}`).join(", ")} { opacity: .45; filter: grayscale(1); cursor: not-allowed; }
.nur-lesen-hinweis { border-color: var(--line, rgba(127,127,127,.4)); }
.neu-version .chip { color: var(--amber); background: color-mix(in srgb, var(--amber) 18%, transparent); font-weight: 600; white-space: nowrap; }
.sheet .zeile { padding: 8px 0; } .sheet .zeile + .zeile { border-top: 1px solid var(--gridc); }
.sheet input[type=time] { flex: 1; } .x { color: var(--rot) !important; padding: 4px 8px !important; }
.feld { display: flex; flex-direction: column; gap: 5px; font-size: 12px; color: var(--ink2); } .feld input, .feld select { font-size: 15px; } .feld.gedimmt select { opacity: .55; }   /* AN-0015 */
.knopf { width: 100%; text-align: center !important; padding: 13px !important; border-radius: 16px !important; background: rgba(120,120,128,.24) !important; font-weight: 600; transition: transform .12s; }
.knopf:active { transform: scale(.98); } .knopf.amber { background: var(--amber) !important; color: #1a1000 !important; } .knopf.rot { color: var(--rot) !important; }
.knopf.leise-k { background: transparent !important; color: var(--ink2) !important; }
.w-jetzt { display: flex; gap: 12px; align-items: center; } .w-jetzt b { font-size: 30px; font-weight: 400; }
.w-std { display: grid; grid-template-columns: repeat(6, 1fr); text-align: center; gap: 2px; font-size: 12px; }
.w-inhalt { animation: seite .25s ease-out backwards; }
.w-regen { color: var(--blau); font-size: 12px; }
.w-std b, .w-teile b { font-size: 16px; font-weight: 500; }
.w-tag + .w-tag { margin-top: 8px; padding-top: 8px; border-top: 1px solid var(--gridc); }
.w-tag-n { font-size: 12px; font-weight: 600; letter-spacing: .5px; margin-bottom: 4px; }
.w-teile { display: grid; grid-template-columns: repeat(4, 1fr); text-align: center; font-size: 12px; }
.w-teile div { display: flex; flex-direction: column; align-items: center; gap: 2px; } .w-teile .vorbei { opacity: .38; }
.w-3z { display: grid; grid-template-columns: 58px 44px 54px 58px 1fr; align-items: center; gap: 6px; padding: 6px 0; font-size: 13px; }
.w-3z + .w-3z { border-top: 1px solid var(--gridc); }
.w-3t, .w-3w, .w-3r { display: flex; flex-direction: column; } .w-3w b { font-size: 17px; font-weight: 500; }
.w-3f { display: flex; flex-direction: column; align-items: flex-end; gap: 3px; }
.w-folge { font-size: 10.5px; padding: 2px 7px; border-radius: 9px; background: rgba(142,142,147,.22); white-space: nowrap; }
.w-folge.amber { color: var(--amber); background: color-mix(in srgb, var(--amber) 16%, transparent); }
.w-folge.blau { color: var(--blau); background: color-mix(in srgb, var(--blau) 16%, transparent); }
.w-std div { display: flex; flex-direction: column; align-items: center; gap: 2px; }
.warn-k { border-left: 3px solid var(--rot); padding: 4px 0 4px 12px; }
.toast { position: absolute; left: 50%; bottom: 100px; transform: translate(-50%, 20px); opacity: 0; pointer-events: none; z-index: 25; padding: 10px 16px; font-size: 13px;
  white-space: nowrap; border-radius: 18px; background: var(--sheet); }
.toast.an { animation: toast 2.6s ease both; }

/* Desktop: breiteres Raster, Navigation oben */
@container (min-width: 700px) {
  .seite { padding: 84px 28px 40px; }
  .glas-nav { top: 16px; bottom: auto; left: 50%; right: auto; transform: translateX(-50%); width: 560px; }
  .glas-raster { grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); }
  .c-held { grid-template-columns: 1fr 1.2fr; padding: 22px 28px; }
  .sheet { left: 50%; right: auto; width: 460px; bottom: auto; top: 50%; transform: translate(-50%, -40%) scale(.96); opacity: 0; pointer-events: none;
    transition: transform .25s cubic-bezier(.2,.8,.2,1), opacity .2s; }
  .sheet.an { transform: translate(-50%, -50%); opacity: 1; pointer-events: auto; }
  .griff { display: none; } .toast { bottom: 28px; }
  .raster2 { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; align-items: start; }
}

@keyframes schweben { 50% { transform: translate(30px, 40px) scale(1.15); } }
@keyframes schweben2 { 50% { transform: translateY(-3px); } }
@keyframes seite { from { opacity: 0; transform: translateY(10px); } }
@keyframes wachsen { from { transform: scaleX(0); } }
@keyframes toast { 0% { opacity: 0; transform: translate(-50%, 20px); } 10%, 85% { opacity: 1; transform: translate(-50%, 0); } 100% { opacity: 0; transform: translate(-50%, 10px); } }
@media (prefers-reduced-motion: reduce) { .app *, .app *::before { animation: none !important; transition: none !important; } }
/* 0.7.8 – Punkte aus 0.6.3 zurück (Mockup glas.html) */
.erkl { font-size: 12px; color: var(--ink2); background: rgba(255,255,255,.06); border-radius: 10px; padding: 8px 10px; margin-top: 8px; line-height: 1.45; }
.hell .erkl { background: rgba(0,0,0,.04); }
.glas-nav.sechs button { font-size: 12px; padding-left: 1px; padding-right: 1px; } .glas-nav.sechs button.nav-ic { flex-basis: 40px; }
.modus-z { flex-wrap: wrap; } .modus-z > div:first-child { flex: 1 1 200px; } .modus-z .seg { flex: 1 1 100%; }
.seg button[disabled] { opacity: .35; cursor: not-allowed; }
.jc-modus { font: inherit; font-size: 12px; color: var(--ink); background: rgba(255,255,255,.1); border: 1px solid var(--gridc); border-radius: 9px; padding: 4px 6px; }
.hell .jc-modus { background: rgba(255,255,255,.7); }
.warn-zeile { display: block; width: 100%; text-align: left; padding: 10px 14px; margin-bottom: 10px; }
.warn-zeile.stoerung b { color: var(--rot); } .warn-zeile.hinweis b { color: var(--amber); } .warn-zeile .leise { display: block; font-size: 12px; margin-top: 2px; }
.p-schacht { display: grid; grid-template-columns: 96px 1fr; gap: 12px; align-items: center; margin-bottom: 8px; } .p-illu .bc { max-width: 96px; }
/* Lernende Regelung (0.8) */
.lern-fort { height: 6px; border-radius: 3px; background: rgba(127,127,127,.25); margin-top: 6px; overflow: hidden; width: 160px; max-width: 100%; }
.lern-fort i { display: block; height: 100%; background: var(--amber); }
.lern-tab { display: grid; grid-template-columns: auto 1fr 1fr; gap: 6px 12px; align-items: center; font-size: 13px; margin: 6px 0; }
.lern-tab > div { display: flex; flex-direction: column; } .lern-tab > b { font-size: 12px; color: var(--ink2); }
.lern-treffer { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; font-size: 13px; margin: 6px 0 10px; }
.lern-treffer span { padding: 2px 8px; border-radius: 8px; background: rgba(255,152,0,.18); } .lern-treffer span.gut { background: rgba(76,175,80,.2); }
/* Container-Ansicht (WU-0004): Kopf mit Thermostat-Rad und Chips (Mockup container-kopf.html, D2), Kacheln, Tagesdiagramm, Geräte-Chips */
.ck { container-type: inline-size; display: grid; gap: 10px 24px; padding: 16px 18px; margin-bottom: 12px; }
.ck-d { grid-template-columns: auto minmax(0, 1fr); grid-template-areas: "rad name" "rad rest"; align-items: start; }
.ck-name { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.ck-art { font-size: 11px; letter-spacing: 1.4px; text-transform: uppercase; color: var(--ink2); }
.ck-titel { font-size: clamp(22px, 4.4cqi, 32px); font-weight: 700; line-height: 1.1; overflow-wrap: anywhere; }
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
.ckd-gruppen .ckd-g:has(> .tk-info) { grid-column: 1 / -1; }   /* Takt-Satz offen (Mockup takt.html B): Kästchen über die ganze Breite */
.tk-info { justify-content: space-between; } .tk-info > span { max-width: 62ch; } .tk-info b { font-weight: 600; color: var(--ink); }
.tk-runde { display: block; margin: 10px 0 2px; padding-top: 12px; max-width: 340px; }
.tk-bahn { position: relative; display: flex; height: 10px; border-radius: 5px; background: rgba(120,120,128,.25); }
.tk-an { background: var(--amber); border-radius: 5px 0 0 5px; } .tk-an.voll { border-radius: 5px; } .tk-aus { background: rgba(120,120,128,.35); border-radius: 0 5px 5px 0; }
.tk-jetzt { position: absolute; top: -4px; bottom: -4px; width: 2px; margin-left: -1px; background: var(--ink); border-radius: 1px; }
.tk-jetzt i { position: absolute; bottom: 100%; left: 50%; transform: translateX(-50%); font-style: normal; font-size: 10px; line-height: 1; padding-bottom: 2px; color: var(--ink); white-space: nowrap; }
.tk-skala { position: relative; display: flex; flex-wrap: wrap; justify-content: space-between; font-size: 10.5px; color: var(--ink2); margin-top: 4px; gap: 2px 10px; }
.tk-info .tk-skala > span { flex: none; min-width: auto; white-space: nowrap; }   /* .ck-info span: flex 1, min-width 0 */
.tk-q { display: inline-block; width: 8px; height: 8px; border-radius: 2px; margin: 0 4px 0 0; background: rgba(120,120,128,.55); vertical-align: 0; } .tk-q.an { background: var(--amber); }
.ck-gefuehl { display: flex; gap: 6px; justify-content: center; }
.ck-gefuehl button { border: 0; border-radius: 14px; padding: 5px 9px; font: inherit; font-size: 15px; background: rgba(120,120,128,.18); color: var(--ink); cursor: pointer; white-space: nowrap; }
.ck-gefuehl button:active { background: var(--amber); color: #1a1000; }
.ck-soll { display: flex; flex-wrap: wrap; gap: 6px; justify-content: center; }
.ck-soll .ck-chip { font-size: 12.5px; padding: 4px 10px; }
.ckd-name { grid-area: name; display: flex; align-items: flex-end; gap: 6px; min-width: 0; }
.ckd-rad { grid-area: rad; display: flex; flex-direction: column; align-items: center; gap: 6px; } .ck-d .c-rad, .ck-d .c-rad svg { width: 220px; height: 220px; }
.ckd-soll { display: flex; flex-wrap: wrap; justify-content: center; align-items: center; gap: 6px; max-width: 240px; }
.ckd-soll > .ckd-gt { flex-basis: 100%; text-align: center; } .ckd-soll .ck-info { flex-basis: 100%; }
.ckd-gt { font-size: 11px; letter-spacing: .8px; text-transform: uppercase; color: var(--ink2); }
.ckd-gruppen { grid-area: rest; display: grid; grid-template-columns: repeat(auto-fill, minmax(190px, 1fr)); gap: 8px; min-width: 0; }
.ckd-g { display: flex; flex-direction: column; align-items: stretch; gap: 6px; padding: 8px 10px 10px; border-radius: 12px; background: rgba(120,120,128,.12); border: 1px solid var(--panel-rand); min-width: 0; }
.ck-d .ckd-g .ck-chip { height: 32px; padding: 0 12px; }
.ck-d .ckd-g[data-g="Hinweise"] .ckd-gt { color: var(--amber); }
.ck-d .ck-chip.modus { font-weight: 600; }
.ck-k { display: none; }
.ck-modi { flex-wrap: wrap; gap: 6px; } .ck-modi button { border: 0; border-radius: 10px; padding: 6px 12px; font: inherit; font-size: 13px; background: rgba(120,120,128,.2); color: var(--ink); cursor: pointer; }
.ck-modi button.on { background: var(--amber); color: #1a1000; font-weight: 600; } .ck-modi button:disabled { opacity: .4; cursor: not-allowed; }
/* Eingestellt unter dem Namen (Mockup eingestellt.html, Variante C): zugeklappt ein Chip, aufgeklappt je Herkunft eine Zeile */
.ck-d .ei-name { flex-direction: column; align-items: flex-start; justify-content: flex-end; gap: 6px; }
.ck-d .ei-name > .ei-info { align-self: stretch; }
.ck-d .ck-chip.ei-c { height: 26px; padding: 0 10px; font-size: 12.5px; gap: 5px; }
.ei-ruht-t { color: var(--ink2); }
.ei-b { display: flex; flex-direction: column; gap: 4px; }
.ei-zeile { display: flex; flex-wrap: wrap; align-items: center; gap: 4px 5px; }
.ei-von { font-size: 10.5px; letter-spacing: .6px; text-transform: uppercase; color: var(--ink2); opacity: .8; white-space: nowrap; min-width: 64px; }
.ck-d .ei-b .ck-chip { height: 24px; padding: 0 8px; font-size: 12px; gap: 4px; background: transparent; }
.ck-d .ei-b .ck-chip.auf { background: rgba(120,120,128,.32); }
.ei-chip .ck-ic { font-size: 1em; }
.ei-chip.ei-ruht { opacity: .5; border-style: dashed; } .ei-chip.ei-ruht.auf { opacity: .85; }
.ei-info > span { max-width: 70ch; }
.ei-grund { font-weight: 600; color: var(--ink); }
.ei-von-t { opacity: .85; }
.ei-aendern { border: 0; background: none; padding: 0; font: inherit; color: var(--blau); cursor: pointer; white-space: nowrap; }
@container (max-width: 640px) {   /* Handy: Name, darunter das Rad kompakt, Gruppen zweispaltig mit kurzen Chips */
  .ck-d { grid-template-columns: minmax(0, 1fr); grid-template-areas: "name" "rad" "rest"; gap: 6px; padding: 12px 12px 14px; }
  .ck-d .ckd-gruppen { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 6px; }
  .ck-d .ckd-g { gap: 3px; padding: 6px 8px 8px; }
  .ck-d .ckd-gt { font-size: 10px; letter-spacing: .6px; }
  .ck-d .ckd-g .ck-chip { height: 28px; padding: 0 9px; }
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
  .ck-d .ei-name { align-items: center; }
  .ei-b, .ei-zeile { justify-content: center; }
  .ck-d .ei-b .ck-chip { height: 24px; padding: 0 7px; font-size: 11.5px; }
  .ei-zeile > .ei-von { min-width: 0; flex-basis: 100%; text-align: center; font-size: 9.5px; }
  .ck-d .ei-info { text-align: left; }
}
.c-rad { position: relative; width: 210px; margin: 0 auto; }   /* WU-0018: mittig über „zu kalt / passt / zu warm“ */ .c-rad svg { width: 210px; height: 210px; display: block; }
.c-rad-k { font-size: 11px; letter-spacing: 2px; fill: var(--ink2); } .c-rad-t { font-size: 38px; font-weight: 700; fill: var(--ink); } .c-rad-s { font-size: 13px; font-weight: 600; }
.c-rad-pm { position: absolute; left: 0; right: 0; bottom: 6px; display: flex; justify-content: center; gap: 36px; }
.c-pm, .c-power { display: inline-flex; align-items: center; justify-content: center; padding: 0; line-height: 1; border-radius: 50%; border: 1px solid var(--panel-rand); background: rgba(255,255,255,.08); color: var(--ink); cursor: pointer; backdrop-filter: blur(8px); }
.c-pm { width: 44px; height: 44px; } .c-pm:active, .c-power:active { transform: scale(.94); } .c-pm .ic, .c-power .ic { width: 55%; height: 55%; display: block; }
.wurzel.hell .c-pm, .wurzel.hell .c-power { background: rgba(255,255,255,.6); }
.c-ohne-t { text-align: center; max-width: 220px; margin: 4px auto 0; }
.c-ohne { padding: 14px 16px; border-radius: 18px; display: flex; flex-direction: column; gap: 4px; min-width: 200px; } .c-ohne b { font-size: 30px; } .c-ohne small { font-size: 11px; letter-spacing: 1.5px; color: var(--ink2); }
.c-kacheln { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin-bottom: 12px; }
.c-kachel { display: flex; flex-direction: column; align-items: flex-start; padding: 12px; border-radius: 16px; color: var(--ink); cursor: pointer; text-align: left; font: inherit; }
.c-kachel span { font-size: 18px; } .c-kachel b { font-size: 22px; margin-top: 4px; } .c-kachel small { color: var(--ink2); font-size: 12px; }
.c-tag-svg { width: 100%; height: auto; display: block; } .c-achse { font-size: 11px; fill: var(--ink2); }
.c-legende { display: flex; flex-wrap: wrap; gap: 12px; font-size: 12px; color: var(--ink2); margin-top: 6px; } .c-legende i { display: inline-block; width: 12px; height: 4px; border-radius: 2px; margin-right: 5px; vertical-align: middle; }
.o-wrap { position: relative; } .o-hit { cursor: pointer; }
.o-tip { position: absolute; top: 2px; transform: translateX(-50%); max-width: min(320px, 92%); padding: 6px 10px; border-radius: 10px; font-size: 12px; line-height: 1.35; color: var(--ink);
  background: var(--sheet); backdrop-filter: blur(16px); -webkit-backdrop-filter: blur(16px); border: 1px solid var(--panel-rand); box-shadow: 0 6px 18px rgba(0,0,0,.35); pointer-events: none; z-index: 2; }
.o-tip .leise { font-size: 11px; }
.c-legende i.gestr { background: repeating-linear-gradient(90deg, var(--ink) 0 4px, transparent 4px 7px); }
.c-chips { display: flex; flex-wrap: wrap; gap: 10px; } .c-chip { flex: 1 1 260px; display: flex; align-items: center; gap: 12px; padding: 10px 12px; border-radius: 14px; }
.c-chip-t { flex: 1; display: flex; flex-direction: column; } .c-chip-t small { color: var(--ink2); font-size: 12px; } .c-chip-t .link { font-size: 12px; text-align: left; padding: 0; }
.c-chip.an { box-shadow: inset 0 0 0 1px var(--amber); } .c-chip.inaktiv { opacity: .55; }
.c-power { width: 42px; height: 42px; color: var(--ink2); } .c-power.an { background: var(--amber); color: #fff; border-color: transparent; box-shadow: 0 0 14px rgba(255,159,10,.55); }
.c-power:disabled { opacity: .35; cursor: not-allowed; } .c-aktiv { display: flex; flex-direction: column; align-items: center; gap: 2px; } .c-aktiv small { font-size: 10px; color: var(--ink2); }
@container (max-width: 700px) { .c-kacheln { grid-template-columns: repeat(2, 1fr); } }   /* BSM-031.11: Breite der Seite, nicht des Fensters (HA mit Seitenleiste, Mockup-Rahmen) */
/* Verlauf (WU-0006): Reiter, Archiv-Karten, Vergleich, Chronik */
.vl-reiter { display: flex; gap: 10px; flex-wrap: wrap; margin-bottom: 12px; align-items: center; } .vl-reiter .seg { margin: 0; }
.vl-archiv { display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 12px; }
.vl-karte { display: flex; flex-direction: column; gap: 6px; padding: 14px; border-radius: 18px; color: var(--ink); text-align: left; cursor: pointer; font: inherit; }
.vl-karte.aktiv { box-shadow: inset 0 0 0 1px rgba(48,209,88,.5); } .vl-funke { width: 100%; height: 40px; display: block; margin-top: 4px; }
.vl-monate { display: flex; justify-content: space-between; font-size: 10px; color: var(--ink2); }
.vl-zahlen { display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px; } .vl-zahlen div { display: flex; flex-direction: column; } .vl-zahlen b { font-size: 16px; } .vl-zahlen small { font-size: 11px; color: var(--ink2); }
.vl-mehr { align-self: flex-end; }
.vl-filter { padding: 10px 12px; margin-bottom: 12px; } .vl-suche { width: 100%; box-sizing: border-box; margin-bottom: 8px; font: inherit; color: var(--ink); background: rgba(127,127,127,.16); border: 1px solid var(--panel-rand); border-radius: 10px; padding: 7px 10px; }
.vl-tag { padding: 10px 14px; margin-bottom: 10px; } .vl-tag-kopf { display: flex; justify-content: space-between; gap: 10px; flex-wrap: wrap; padding-bottom: 6px; border-bottom: 1px solid var(--gridc); margin-bottom: 4px; }
.vl-ereignis { display: grid; grid-template-columns: 44px 24px 1fr; gap: 8px; align-items: center; padding: 5px 0; font-size: 13px; }
.vl-punkt { width: 22px; height: 22px; border-radius: 50%; display: flex; align-items: center; justify-content: center; color: #fff; font-size: 11px; }
.vl-tab-kopf, .vl-tab-zeile { display: grid; grid-template-columns: 1.6fr repeat(6, 1fr); gap: 6px; align-items: center; font-size: 13px; text-align: right; }
.vl-tab-kopf button { background: none; border: 0; color: var(--ink2); font: inherit; font-size: 11px; text-align: right; cursor: pointer; padding: 4px 0; } .vl-tab-kopf button:first-child { text-align: left; } .vl-tab-kopf button.on { color: var(--ink); font-weight: 600; }
.vl-tab-zeile { width: 100%; background: none; border: 0; border-top: 1px solid var(--gridc); color: var(--ink); font: inherit; padding: 9px 0; cursor: pointer; }
.vl-tab-name { text-align: left; display: flex; flex-direction: column; } .vl-tab-name small { color: var(--ink2); font-size: 11px; }
@media (max-width: 700px) { .vl-tab-kopf, .vl-tab-zeile { grid-template-columns: 1.6fr repeat(3, 1fr); } .vl-tab-kopf button:nth-child(n+5), .vl-tab-zeile > :nth-child(n+5) { display: none; } }
/* Auswertung aus Bausteinen (WU-0005) */
.aw-dia { display: flex; flex-direction: column; height: 100%; box-sizing: border-box; padding: 12px 14px; gap: 6px; }
.aw-dia-kopf { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; } .aw-dia-kopf .seg { margin: 0 0 0 auto; }
.aw-dia-svg { flex: 1; width: 100%; min-height: 0; } .aw-dia-leg { display: flex; flex-wrap: wrap; gap: 4px 12px; font-size: 11px; color: var(--ink2); }
.aw-dia-leg i { display: inline-block; width: 9px; height: 9px; border-radius: 2px; margin-right: 4px; vertical-align: middle; }
.aw-klein .aw-rang-z { width: 100%; grid-template-columns: 1fr 1fr auto; background: none; border: 0; color: var(--ink); font: inherit; padding: 6px 0; cursor: pointer; text-align: left; }
.aw-klein .aw-rang-z em { font-style: normal; color: var(--ink2); }
.aw-knoepfe { display: flex; gap: 8px; flex-wrap: wrap; justify-content: flex-end; } .aw-hinweis { margin: -4px 2px 10px; }
/* FE-0008: Zeitraum wählen */
.zr-zeile { position: relative; display: flex; gap: 8px; align-items: center; flex-wrap: wrap; margin: -4px 0 12px; }
.zr-nav { display: flex; align-items: center; gap: 2px; padding: 3px; border-radius: 14px; min-width: 260px; }
.zr-pf { width: 38px; height: 38px; border: 0; border-radius: 11px; background: none; color: var(--primary-text-color); font-size: 22px; line-height: 1; cursor: pointer; display: grid; place-items: center; }
.zr-pf:hover:not(:disabled) { background: rgba(127,127,127,.15); } .zr-pf:disabled { opacity: .3; cursor: default; }
.zr-mitte { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; min-height: 38px; font: inherit; color: inherit; background: none; border: 0; padding: 0 6px; }
.zr-mitte b { font-size: 15px; } .zr-mitte small, .zr-gewaehlt small { font-size: 11px; color: var(--secondary-text-color); }
.zr-auf { cursor: pointer; border-radius: 10px; position: relative; } .zr-auf:hover { background: rgba(127,127,127,.12); } .zr-pfeil { position: absolute; right: 6px; top: 50%; transform: translateY(-50%); font-size: 11px; color: var(--secondary-text-color); }
.zr-kal { position: absolute; top: 48px; left: 0; z-index: 20; width: 300px; padding: 10px; border-radius: 16px; }
.zr-kal-kopf { display: flex; align-items: center; justify-content: space-between; margin-bottom: 6px; } .zr-kal-kopf b { font-size: 14.5px; }
.zr-kw-kopf, .zr-woche, .zr-woche-z { display: grid; grid-template-columns: 30px repeat(7, 1fr); gap: 2px; align-items: center; text-align: center; }
.zr-kw-kopf span { font-size: 10.5px; color: var(--secondary-text-color); padding: 2px 0; } .zr-kw-kopf span:first-child, .zr-woche b, .zr-woche-z b { font-size: 10.5px; font-weight: 500; color: var(--secondary-text-color); }
.zr-k { font: inherit; font-size: 13px; color: inherit; background: none; border: 0; border-radius: 9px; height: 34px; cursor: pointer; }
.zr-k:hover:not(:disabled), .zr-woche:hover:not(:disabled) { background: rgba(127,127,127,.14); } .zr-k:disabled, .zr-woche:disabled { opacity: .3; cursor: default; }
.zr-k.fremd, .zr-woche span.fremd { color: var(--secondary-text-color); opacity: .55; }
.zr-k.jetzt, .zr-woche.jetzt { box-shadow: inset 0 0 0 1.5px var(--s1); } .zr-k.on, .zr-woche.on { background: var(--s1); color: #fff; font-weight: 600; } .zr-woche.on b, .zr-woche.on span { color: #fff; opacity: 1; }
.zr-woche { width: 100%; font: inherit; font-size: 13px; color: inherit; background: none; border: 0; border-radius: 10px; height: 34px; cursor: pointer; padding: 0; }
.zr-kal-monate, .zr-kal-jahre { display: grid; grid-template-columns: repeat(3, 1fr); gap: 4px; } .zr-kal-monate .zr-k, .zr-kal-jahre .zr-k { height: 42px; }
.zr-kal-fuss { display: flex; justify-content: center; margin-top: 8px; }
/* Einstellungen mit Seitenleiste (WU-0007) */
.ev-sl { display: grid; grid-template-columns: 230px 1fr; gap: 14px; align-items: start; }
.ev-nav { position: sticky; top: 8px; display: flex; flex-direction: column; gap: 2px; padding: 8px; border-radius: 18px; }
.ev-nav button { display: grid; grid-template-columns: 30px 1fr; align-items: center; gap: 2px 8px; text-align: left; font: inherit; color: inherit; background: none; border: 0; border-radius: 12px; padding: 8px 10px; cursor: pointer; }
.ev-nav button small { grid-column: 2; font-size: 11px; color: var(--ink2); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.ev-nav button:hover { background: rgba(127,127,127,.12); } .ev-nav button.on { background: rgba(127,127,127,.22); font-weight: 600; }
.ev-nav .ev-trenn { height: 1px; background: rgba(127,127,127,.25); margin: 6px 8px; }
.ev-inhalt > * + * { margin-top: 12px; }
.ev-titel { display: flex; align-items: center; gap: 10px; margin: 2px 4px 10px; } .ev-titel b { font-size: 20px; } .ev-titel .leise { font-size: 12px; }
.ev-chips { position: relative; display: flex; gap: 6px; overflow-x: auto; padding: 2px 0 10px; scrollbar-width: none; } .ev-chips button { flex: 0 0 auto; }
.ev-dev-reiter { margin-bottom: 10px; }
@media (max-width: 700px) { .ev-sl { grid-template-columns: 1fr; } .ev-nav { display: none; } }
.schmal .ev-sl { grid-template-columns: 1fr; } .schmal .ev-nav { display: none; }
.ev-nav button .ev-ic, .ev-titel .ev-ic { grid-row: 1 / 3; font-size: 18px; width: 30px; height: 30px; border-radius: 9px; display: grid; place-items: center; background: rgba(127,127,127,.16); }
/* Warm ab (AN-0004) */
.wa-tab { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 4px 10px; align-items: center; margin: 4px 0 8px; }
.wa-tab > b { font-size: 12px; color: var(--ink2); font-weight: 500; } .wa-tab > div b { font-size: 15px; } .wa-tab > div .leise { display: block; font-size: 11px; }
.wa-heute { display: flex; gap: 10px; align-items: center; padding: 10px 12px; border-radius: 14px; background: rgba(255,159,10,.12); margin: 6px 0; font-size: 13px; } .wa-heute b { font-size: 15px; }
.lh-laedt { opacity: .45; transition: opacity .2s; pointer-events: none; }
.lh-regler { position: relative; margin: 4px 2px 18px; }
.lh-regler input[type=range] { width: 100%; margin: 0; height: 28px; background: transparent; -webkit-appearance: none; appearance: none; }
.lh-regler input[type=range]::-webkit-slider-runnable-track { height: 8px; border-radius: 4px; background: var(--spur); }
.lh-regler input[type=range]::-moz-range-track { height: 8px; border-radius: 4px; background: var(--spur); }
.lh-regler input[type=range]::-webkit-slider-thumb { -webkit-appearance: none; width: 24px; height: 24px; margin-top: -8px; border-radius: 50%; background: #fff; box-shadow: 0 1px 4px rgba(0,0,0,.4); }
.lh-regler input[type=range]::-moz-range-thumb { width: 24px; height: 24px; border: 0; border-radius: 50%; background: #fff; box-shadow: 0 1px 4px rgba(0,0,0,.4); }
.lh-skala { position: relative; height: 14px; margin: 0 12px; } .lh-skala span { position: absolute; transform: translateX(-50%); font-size: 11px; color: var(--ink2); }
.lh-stunden { display: flex; gap: 4px; overflow-x: auto; padding: 2px 0 10px; scrollbar-width: thin; } .lh-stunden .chip { flex: 0 0 auto; min-width: 38px; padding: 4px 6px; font-size: 12px; }
.zeile.ger { display: grid; grid-template-columns: 28px 1fr auto 14px; gap: 2px 10px; align-items: center; text-decoration: none; color: inherit; }
.ger-ic { position: relative; font-size: 17px; text-align: center; }
.ger-punkt { position: absolute; right: -2px; bottom: 0; width: 9px; height: 9px; border-radius: 50%; border: 2px solid var(--sheet, #1c1c1e); }
.ger-punkt.da { background: #30d158; } .ger-punkt.weg { background: var(--rot); }
.np-marke { margin-left: 5px; font-size: 12px; } .np-marke.rot { filter: hue-rotate(-40deg) saturate(3); }   /* BSM-019 */
.ger-sig { display: inline-flex; align-items: flex-end; gap: 2px; height: 12px; margin-left: 4px; vertical-align: -1px; }
.ger-sig i { width: 3px; border-radius: 1px; background: rgba(127,127,127,.35); } .ger-sig i:nth-child(1) { height: 25%; } .ger-sig i:nth-child(2) { height: 50%; }
.ger-sig i:nth-child(3) { height: 75%; } .ger-sig i:nth-child(4) { height: 100%; } .ger-sig i.an { background: var(--ink); } .ger-sig.s1 i.an { background: var(--rot); } .ger-z { font-size: 12.5px; text-align: right; white-space: nowrap; } a.zeile.ger:hover { background: rgba(127,127,127,.1); }
.aw-leiste { display: flex; gap: 10px; flex-wrap: wrap; margin-bottom: 12px; } .aw-leiste .seg { margin: 0; }
.aw-delta { font-style: normal; font-size: 12px; margin-left: 6px; } .aw-delta.mehr { color: #ff9f0a; } .aw-delta.weniger { color: #30d158; } .gruen-t { color: #30d158; }
.aw-raster { display: grid; grid-template-columns: repeat(4, 1fr); grid-auto-rows: 110px; gap: 12px; grid-auto-flow: dense; }
.aw-frei-s { grid-column: span min(var(--w), 4); grid-row: span var(--h); position: relative; min-width: 0; }
.aw-inhalt { height: 100%; overflow: auto; border-radius: 18px; } .aw-inhalt > .glas-panel, .aw-inhalt > .aw-karten { margin: 0; min-height: 100%; box-sizing: border-box; } .aw-inhalt > .aw-k { width: 100%; height: 100%; }
.aw-raster.layout .aw-inhalt { pointer-events: none; opacity: .8; }
.aw-ueber { position: absolute; inset: 0; border: 2px dashed var(--amber); border-radius: 18px; touch-action: none; }
.aw-griff { position: absolute; top: 6px; left: 6px; width: 30px; height: 30px; border-radius: 10px; background: var(--amber); color: #fff; display: flex; align-items: center; justify-content: center; cursor: grab; font-size: 18px; touch-action: none; }
.aw-name { position: absolute; top: 10px; left: 44px; font-size: 12px; background: var(--sheet); padding: 2px 8px; border-radius: 8px; max-width: calc(100% - 90px); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.aw-x { position: absolute; top: 6px; right: 6px; width: 30px; height: 30px; border-radius: 50%; border: 0; background: var(--sheet); color: var(--ink); cursor: pointer; }
.aw-groesse { position: absolute; right: 4px; bottom: 4px; width: 30px; height: 30px; display: flex; align-items: flex-end; justify-content: flex-end; color: var(--amber); font-size: 20px; cursor: nwse-resize; touch-action: none; }
.aw-frei-s.zieht { z-index: 5; opacity: .85; box-shadow: 0 12px 30px rgba(0,0,0,.4); border-radius: 18px; } .aw-frei-s.ziel .aw-ueber { border-style: solid; background: rgba(255,159,10,.12); }
.aw-k { display: flex; flex-direction: column; align-items: flex-start; gap: 4px; padding: 14px; border-radius: 18px; color: var(--ink); text-align: left; cursor: pointer; font: inherit; box-sizing: border-box; }
.aw-k small, .aw-betrag small { font-size: 11px; letter-spacing: 1.5px; color: var(--ink2); } .aw-k b { font-size: 28px; } .aw-k span { font-size: 13px; color: var(--ink2); }
.aw-rang { display: grid; grid-template-columns: 110px 1fr auto; gap: 8px; align-items: center; width: 100%; font-size: 13px; } .aw-rang i { display: block; height: 8px; border-radius: 4px; } .aw-rang em { font-style: normal; color: var(--ink2); font-size: 12px; }
.aw-zeile { display: flex; justify-content: space-between; width: 100%; font-size: 14px; } .aw-zeile b { font-size: 14px; }
.aw-betrag { display: flex; justify-content: space-between; gap: 20px; flex-wrap: wrap; padding: 18px; } .aw-betrag small { display: block; }
.aw-betrag > div > b { font-size: 46px; display: block; line-height: 1.1; margin: 4px 0; } .aw-betrag-r { display: flex; flex-direction: column; gap: 12px; } .aw-betrag-r b { font-size: 24px; }
.aw-tab-kopf, .aw-tab-zeile { display: grid; grid-template-columns: 1fr 56px 64px 64px 56px 56px 48px; gap: 8px; align-items: center; font-size: 13px; }
.aw-tab-kopf { color: var(--ink2); font-size: 11px; padding: 0 0 6px; text-align: right; } .aw-tab-kopf span:first-child { text-align: left; }
.aw-tab-zeile { width: 100%; padding: 8px 0; border: 0; border-top: 1px solid var(--gridc); background: none; color: var(--ink); font: inherit; cursor: pointer; text-align: right; }
.aw-tab-name { text-align: left; display: flex; flex-direction: column; gap: 4px; } .aw-tab-name em { font-style: normal; color: var(--ink2); margin-right: 6px; }
.aw-tab-name i { display: block; height: 6px; border-radius: 3px; } .aw-tab-name small { color: var(--ink2); font-size: 11px; }
.aw-karten { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 12px; }
.aw-karte { display: flex; flex-direction: column; align-items: flex-start; gap: 4px; padding: 14px; border-radius: 18px; color: var(--ink); text-align: left; cursor: pointer; font: inherit; }
.aw-karte span { font-size: 22px; } .aw-karte b { font-size: 15px; } .aw-karte small { color: var(--ink2); font-size: 12px; }
.aw-vorlagen { margin-bottom: 12px; } .aw-vorlagen-k { display: flex; flex-wrap: wrap; gap: 8px; }
.aw-wahl .zeile { gap: 12px; } .aw-wahl-k { display: flex; gap: 6px; align-items: center; flex-wrap: wrap; justify-content: flex-end; } .aw-wahl-k .chip { min-width: 34px; justify-content: center; }
.aw-gr { display: inline-flex; align-items: center; gap: 4px; } .aw-gr small { font-size: 11px; color: var(--ink2); } .aw-gr b { min-width: 14px; text-align: center; }
@media (max-width: 700px) { .aw-raster { grid-template-columns: repeat(2, 1fr); } .aw-frei-s { grid-column: span min(var(--w), 2); }
  .aw-tab-kopf, .aw-tab-zeile { grid-template-columns: 1fr 44px 56px 44px; } .aw-tab-kopf span:nth-child(n+5), .aw-tab-zeile > span:nth-child(n+5) { display: none; } }
/* Rangliste der Staffelung (Bedarf in °C) */
.sr-kopf { display: flex; align-items: baseline; gap: 8px; margin: 14px 2px 6px; } .sr-kopf b { font-size: 16px; }
.sr-liste { border-radius: 16px; background: rgba(120,120,128,.10); padding: 2px 10px; }
.sr-zeile { display: grid; grid-template-columns: 28px 1fr auto; gap: 2px 10px; padding: 9px 4px; border-top: 1px solid var(--gridc); align-items: center; cursor: pointer; }
.sr-zeile:first-child { border-top: 0; } .sr-nr { font-size: 17px; font-weight: 600; text-align: center; color: var(--ink2); }
.sr-name b { font-size: 14px; } .sr-bedarf { text-align: right; font-size: 18px; font-weight: 500; white-space: nowrap; } .sr-bedarf small { display: block; font-size: 11px; color: var(--ink2); font-weight: 400; }
.sr-stufe { display: inline-block; font-size: 10.5px; padding: 1px 7px; border-radius: 8px; margin: 2px 4px 0 0; background: rgba(120,120,128,.2); }
.sr-stufe.frost { background: color-mix(in srgb, var(--blau) 30%, transparent); } .sr-stufe.boost { background: color-mix(in srgb, var(--amber) 35%, transparent); }
.sr-stufe.erster { background: color-mix(in srgb, #30d158 30%, transparent); }
.sr-auf { grid-column: 2 / -1; display: grid; grid-template-columns: 1fr auto; gap: 3px 12px; font-size: 12.5px; padding: 6px 10px; margin-top: 4px; border-radius: 10px; background: rgba(120,120,128,.12); }
.sr-auf b { text-align: right; font-weight: 500; white-space: nowrap; } .sr-auf .summe { border-top: 1px solid var(--gridc); padding-top: 3px; font-weight: 600; }
.sr-zust { grid-column: 2 / -1; font-size: 12px; }
/* Strompreis mit „gilt ab“ und Preis simulieren */
.sp-zeile { display: flex; align-items: center; gap: 10px; padding: 8px 2px; border-top: 1px solid var(--gridc); } .sp-zeile b { font-size: 15px; } .sp-zeile .x { margin-left: auto; }
.sp-sim { display: inline-flex; align-items: center; gap: 6px; } .sp-sim b { font-size: 16px; min-width: 56px; text-align: center; }
.sp-chip-sim { background: color-mix(in srgb, #bf5af2 30%, transparent) !important; }
.sp-band { margin: 6px 0; font-size: 13px; padding: 6px 10px; border-radius: 12px; background: color-mix(in srgb, #bf5af2 18%, transparent); display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
/* WU-0017: Vergleich-Kacheln */
.vg-zeilen { display: flex; flex-direction: column; gap: 2px; margin-top: auto; font-size: 12px; } .vg-zeilen div { display: flex; justify-content: space-between; gap: 6px; }
.vg-zeilen span { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; color: var(--ink2); } .vg-zeilen b { font-weight: 600; white-space: nowrap; }
.vg-zeilen i, .vg-tab i { display: inline-block; width: 7px; height: 7px; border-radius: 50%; margin-right: 4px; }
.vg-tab { width: 100%; border-collapse: collapse; font-size: 12px; margin-top: 4px; } .vg-tab th { font-weight: 500; color: var(--ink2); text-align: right; padding: 2px 4px; }
.vg-tab th:first-child, .vg-tab td:first-child { text-align: left; } .vg-tab td { text-align: right; padding: 3px 4px; border-top: 1px solid var(--gridc); white-space: nowrap; }
.vg-chips button.on { outline: 2px solid var(--amber); } .vg-svg { width: 100%; height: 100%; } .vg-svg .ax { font-size: 9px; fill: var(--ink2); } .vg-svg .gr { stroke: var(--gridc); }
.aw-art-k { right: 78px; font-size: 11px; }
/* WU-0016: Bilder zur Meldung */
.mb-box { border-radius: 14px; background: rgba(120,120,128,.10); padding: 10px 12px; margin: 6px 0; } .mb-kopf { display: flex; align-items: baseline; gap: 6px; } .mb-kopf b { font-size: 14px; }
.mb-knoepfe { display: flex; flex-wrap: wrap; gap: 8px; margin: 8px 0 4px; }
.mb-knoepfe label, .mb-knoepfe button { display: inline-flex; align-items: center; gap: 6px; padding: 8px 12px; border-radius: 12px; border: 0; background: rgba(120,120,128,.2); color: var(--ink); font: inherit; font-size: 13px; cursor: pointer; }
.mb-knoepfe input { display: none; } .mb-hinweis { font-size: 12px; color: var(--ink2); }
.mb-bilder { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; margin-top: 8px; }
.mb-bild { position: relative; border-radius: 10px; overflow: hidden; background: rgba(0,0,0,.25); aspect-ratio: 9 / 16; } .mb-bild.quer { aspect-ratio: 16 / 10; }
.mb-bild img { width: 100%; height: 100%; object-fit: cover; display: block; }
.mb-bild .x { position: absolute; top: 4px; right: 4px; width: 24px; height: 24px; border-radius: 50%; border: 0; background: rgba(0,0,0,.6); color: #fff; cursor: pointer; }
.mb-bild small { position: absolute; left: 0; right: 0; bottom: 0; font-size: 10px; padding: 2px 6px; background: rgba(0,0,0,.55); color: #fff; }
.ml-bilder { display: flex; gap: 6px; margin: 6px 0; } .ml-bilder img { width: 64px; height: 64px; object-fit: cover; border-radius: 8px; cursor: pointer; }
.ml-bild-laedt { width: 64px; height: 64px; border-radius: 8px; background: rgba(120,120,128,.2); } .mb-gross { width: 100%; border-radius: 12px; display: block; margin: 6px 0; }
/* FE-0012: mehrere Zeitfenster je Tag */
.am-tag { border-top: 1px solid var(--gridc); padding: 8px 0; } .am-tag:first-of-type { border-top: 0; }
.am-tag-kopf { display: flex; align-items: baseline; gap: 8px; } .am-tag-kopf b { font-size: 14px; }
.am-fenster { display: flex; align-items: center; gap: 8px; padding: 4px 0 4px 12px; font-size: 13.5px; } .am-fenster b { font-weight: 600; } .am-fenster .x { margin-left: auto; }
.am-strahl { margin: 4px 0 2px 12px; } .am-strahl .tl-spur { height: 12px; border-radius: 5px; }
.am-hinweis { font-size: 12px; color: var(--ink2); padding-left: 12px; }
.am-schon { border-radius: 12px; background: rgba(120,120,128,.12); padding: 8px 12px; margin: 6px 0; font-size: 13px; } .am-schon b { font-weight: 600; }
.tl-eigen { background: #64a8ff; }
/* Soll gleitend (Herbert 01.10.2026) */
.sg-heute { display: grid; grid-template-columns: 1fr auto; gap: 3px 12px; font-size: 13px; padding: 8px 12px; border-radius: 12px; background: rgba(120,120,128,.12); margin: 6px 0; }
.sg-heute b { text-align: right; font-weight: 500; white-space: nowrap; } .sg-heute .summe { border-top: 1px solid var(--gridc); padding-top: 4px; font-weight: 600; font-size: 15px; }
.sg-kurve { width: 100%; height: 150px; display: block; margin: 4px 0; } .sg-kurve .ax { font-size: 9px; fill: var(--ink2); } .sg-kurve .gr { stroke: var(--gridc); stroke-width: 1; }
.sg-leg { display: flex; flex-wrap: wrap; gap: 4px 12px; font-size: 11.5px; color: var(--ink2); margin-bottom: 6px; } .sg-leg i { display: inline-block; width: 9px; height: 9px; border-radius: 50%; margin-right: 4px; vertical-align: -1px; }
/* AN-0012: Regeln nach Tagesablauf */
.rv-kopf { display: flex; align-items: baseline; gap: 8px; margin: 14px 2px 4px; } .rv-kopf b { font-size: 16px; } .rv-kopf .leise { font-size: 12px; }
.rv-karte { border-radius: 16px; background: rgba(120,120,128,.10); padding: 2px 12px; margin-bottom: 6px; } .rv-karte > .zeile:first-child { border-top: 0; }
.rv-fest { display: grid; grid-template-columns: 1fr auto; gap: 6px 12px; padding: 8px 0; font-size: 13px; border-top: 1px solid var(--gridc); }
.rv-fest:first-child { border-top: 0; } .rv-fest b { font-weight: 600; text-align: right; } .rv-fest .leise { grid-column: 1 / -1; margin-top: -4px; font-size: 12px; }
.rv-link { color: var(--blau); background: none; border: 0; font: inherit; cursor: pointer; padding: 0; white-space: nowrap; }
/* WU-0014: Kachel-Katalog – Kacheln S/M/L (Mockup kachel-katalog.html, Variante 3) */
.kk-bereich { display: flex; flex-direction: column; gap: 10px; margin: 14px 0 6px; }
.kk-titel { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; padding: 0 4px; } .kk-titel > b { font-size: 17px; }
.kk-knoepfe { margin-left: auto; display: flex; gap: 8px; } .kk-plus { color: var(--amber) !important; font-weight: 600; }
.kk { width: 100%; height: 100%; box-sizing: border-box; border-radius: 18px !important; padding: 12px 14px; display: flex; flex-direction: column; gap: 3px; cursor: pointer; overflow: hidden; color: var(--ink); text-align: left; min-width: 0; }
.kk:active { transform: scale(.98); }
.kk-kopf { display: flex; align-items: center; gap: 6px; min-width: 0; }
.kk-kopf small { font-size: 10.5px; letter-spacing: 1.1px; text-transform: uppercase; color: var(--ink2); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.kk-ic { font-size: 15px; line-height: 1; flex: none; }
.kk-zahl { font-size: 28px; font-weight: 300; line-height: 1.15; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; } .kk-zahl small { font-size: 13px; color: var(--ink2); font-weight: 400; }
.kk-S .kk-zahl { margin: auto 0; font-size: 34px; text-align: center; } .kk-S > .kk-wo { text-align: center; }   /* Herbert 28.10.2026: Wert größer und mittig */
.kk-S { container-type: inline-size; } .kk-S .kk-zahl { font-size: clamp(14px, (100cqi - var(--kk-e, 16px)) / var(--kk-n, 2.4), 34px); white-space: normal; overflow-wrap: anywhere; }   /* Herbert 28.10.2026: am Handy passt sich die Zahl der Kachelbreite an (--kk-n Breite der Zahl in em, --kk-e Einheit; Desktop 34 px) */
.kk-mini-t { text-align: center; font-size: 11px; }
.kk-dia:has(> .kk-breit) { flex-direction: column; align-items: stretch; gap: 2px; } .kk-dia > svg.kk-breit { flex: 1 1 0; min-height: 0; }
.kk-leg { display: flex; flex-wrap: wrap; gap: 2px 12px; font-size: 11px; color: var(--ink2); }
.kk-leg i { display: inline-block; width: 10px; height: 10px; border-radius: 3px; margin-right: 5px; vertical-align: -1px; }
.kk-leg i.gestr { height: 2px; border-radius: 0; vertical-align: 3px; background: repeating-linear-gradient(90deg, var(--ink2) 0 4px, transparent 4px 7px); }
.kk-luecke-t { font-size: 10px; font-weight: 600; fill: var(--s3); }
.kk-wo { font-size: 12px; color: var(--ink2); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.kk-vgl { font-size: 12px; color: var(--ink2); line-height: 1.35; } .kk-vgl em { font-style: normal; } .kk-vgl em.mehr { color: var(--amber); } .kk-vgl em.weniger { color: #30d158; }
.kk-M { flex-direction: row; gap: 12px; align-items: stretch; }
.kk-m-l { flex: 1 1 52%; min-width: 0; display: flex; flex-direction: column; gap: 2px; } .kk-m-l .kk-vgl { display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.kk-m-r { flex: 1 1 48%; min-width: 0; display: flex; flex-direction: column; justify-content: center; gap: 5px; }
.kk-funke { width: 100%; height: 62px; display: block; }
.kk-l-zeile { display: flex; align-items: baseline; gap: 4px 10px; flex-wrap: wrap; }
.kk-dia { flex: 1; min-height: 0; display: flex; align-items: center; justify-content: center; margin-top: 2px; }
.kk-dia > svg { width: 100%; height: 100%; max-height: 100%; } .kk-dia .legende { display: none; }
.kk-dia.zeilen { flex-direction: column; align-items: stretch; justify-content: center; }
.kk-dia-in { display: flex; flex-direction: column; gap: 6px; width: 100%; }
.kk-dz { display: grid; grid-template-columns: 74px 1fr; gap: 8px; align-items: center; font-size: 11px; color: var(--ink2); } .kk-dz > span { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.kk-dz.eins { grid-template-columns: 1fr; } .kk-dz.schmal { grid-template-columns: 54px 1fr; } .kk-dz .tl-spur { height: 12px; border-radius: 5px; } .kk-dz.heute > span { color: var(--amber); font-weight: 600; }
.kk-kennz { flex: 1; display: grid; grid-template-columns: 1fr 1fr; gap: 6px 14px; align-content: center; margin-top: 4px; }
.kk-kennz div { display: flex; flex-direction: column; border-top: 1px solid var(--gridc); padding-top: 6px; min-width: 0; }
.kk-kennz b { font-size: 17px; font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; } .kk-kennz span { font-size: 11px; color: var(--ink2); }
.kk-balken { display: grid; grid-template-columns: minmax(0, 1fr) 1.2fr auto; gap: 6px; align-items: center; font-size: 11.5px; } .kk-balken > span { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.kk-balken i { display: block; height: 7px; border-radius: 4px; } .kk-balken em { font-style: normal; color: var(--ink2); }
.kk-neu-k { grid-column: span 1; border-style: dashed !important; border-width: 1.5px !important; background: transparent !important; box-shadow: none !important; color: var(--ink2); display: flex; flex-direction: column; align-items: center;
  justify-content: center; gap: 2px; font-size: 13px; border-radius: 18px !important; cursor: pointer; } .kk-neu-k span { font-size: 26px; font-weight: 300; line-height: 1; }
.kk-frisch .kk { animation: kk-frisch 1.8s ease-out; } @keyframes kk-frisch { 0%, 40% { box-shadow: 0 0 0 3px var(--amber); } 100% { box-shadow: 0 0 0 0 transparent; } }
.aw-dia-k { position: absolute; top: 6px; right: 42px; width: 30px; height: 30px; border-radius: 50%; border: 0; background: var(--sheet); cursor: pointer; opacity: .55; } .aw-dia-k.on { opacity: 1; background: var(--amber); }
.kk-kat { display: flex; flex-direction: column; gap: 8px; }
.kk-such input { width: 100%; box-sizing: border-box; font-size: 15px; padding: 10px 14px; border-radius: 14px; }
.kk-chips { display: flex; flex-wrap: wrap; gap: 6px; }
.kk-chip { padding: 5px 11px; border-radius: 14px; border: 0; background: rgba(120,120,128,.18); color: var(--ink); font: inherit; font-size: 12px; white-space: nowrap; cursor: pointer; }
.kk-chip.on { background: var(--amber); color: #1a1000; font-weight: 600; }
.kk-tr-zeile { display: flex; align-items: center; gap: 10px; padding: 9px 2px; border-top: 1px solid var(--gridc); cursor: pointer; }
.kk-tr-zeile.on { background: color-mix(in srgb, var(--amber) 12%, transparent); border-radius: 12px; }
.kk-z-ic { font-size: 20px; width: 28px; text-align: center; flex: none; } .kk-z-t { flex: 1; min-width: 0; }
.kk-tr-gr { display: flex; align-items: center; gap: 3px; flex: none; }
.kk-tr-gr button { box-sizing: border-box; min-width: 30px; height: 30px; padding: 0 7px; margin: 0; display: inline-flex; align-items: center; justify-content: center; text-align: center; line-height: 1;
  border-radius: 8px; border: 0; background: rgba(120,120,128,.2); color: var(--ink); font: inherit; font-size: 13px; cursor: pointer; }   /* Herbert 28.10.2026: gleich groß, Buchstabe mittig (XL breiter) */
.kk-tr-gr button.on { background: var(--amber); color: #1a1000; font-weight: 600; }
.kk-tr-zeile.kk-drin { box-shadow: inset 3px 0 0 var(--amber); padding-left: 10px; border-radius: 0 10px 10px 0; }   /* schon eingebaut (katalog-markiert.html, B) */
.kk-tr-zeile.kk-drin .kk-tr-gr button.kk-gr-drin:not(.on) { background: transparent; box-shadow: inset 0 0 0 1.5px var(--amber); color: var(--amber); }
.kk-tr-wer { display: block; margin: 1px 0 0; font-size: 11px; font-weight: 500; color: var(--ink2); white-space: normal; }
.kk-offen-hin { color: var(--amber); padding: 2px 4px 0; }
.kk-such mark { background: color-mix(in srgb, var(--amber) 45%, transparent); color: inherit; border-radius: 3px; padding: 0 1px; }
.kk-tr-leer { padding: 14px 4px; color: var(--ink2); font-size: 13px; }
.kk-wahl { display: flex; flex-direction: column; gap: 8px; margin: 4px 0 8px; } .kk-wahl .vb-wer { display: flex; flex-wrap: wrap; gap: 6px; } .kk-wahl .vb-wer i { width: 8px; height: 8px; border-radius: 50%; display: inline-block; }
.kk-sw { padding: 4px 0; } .kk-vorschau { grid-template-columns: repeat(2, minmax(0, 1fr)) !important; }
.kk-vorlagen summary { cursor: pointer; color: var(--blau); font-size: 14px; padding: 6px 2px; } .kk-vorlagen .aw-vorlagen-k { margin-top: 6px; }
.tab-scroll { overflow-x: auto; } .je-geraet td, .je-geraet th { white-space: nowrap; padding-left: 8px; } .je-geraet td:first-child { white-space: normal; padding-left: 0; }
/* 0.7.11 – Reiter Heizung als Kacheln (Mockup heizung-varianten.html, Variante A) */
.hz-held { padding: 14px 16px; margin-bottom: 12px; display: flex; flex-direction: column; gap: 10px; cursor: pointer; }
.hz-held-kopf { display: flex; justify-content: space-between; align-items: flex-start; }
.hz-status { font-size: 22px; font-weight: 600; margin-top: 2px; } .hz-status.an { color: var(--amber); }
.hz-chips { display: flex; flex-wrap: wrap; gap: 6px; }
.hz-chip { font-size: 12px; padding: 4px 9px; border-radius: 12px; background: rgba(255,255,255,.12); white-space: nowrap; }
.hell .hz-chip { background: rgba(0,0,0,.06); }
.hz-raster { display: grid; grid-template-columns: repeat(2, 1fr); gap: 10px; }
@media (min-width: 700px) { .hz-raster { grid-template-columns: repeat(4, 1fr); } }
.hz-kachel { display: flex; flex-direction: column; align-items: flex-start; gap: 2px; padding: 12px; text-align: left; min-height: 118px; animation: rein .45s ease-out backwards; }
.hz-k-kopf { display: flex; justify-content: space-between; width: 100%; }
.hz-sym { font-size: 20px; line-height: 1; }
.hz-k-titel { font-size: 12px; color: var(--ink2); margin-top: 6px; }
.hz-k-wert { font-size: 17px; font-weight: 600; line-height: 1.2; }
.hz-k-unter { font-size: 11.5px; line-height: 1.35; }
.hz-mini { display: flex; align-items: flex-end; gap: 3px; height: 22px; margin: 3px 0 1px; width: 100%; }
.hz-mini i { flex: 1; background: var(--amber); opacity: .55; border-radius: 2px 2px 0 0; } .hz-mini i.heute { opacity: 1; }
.hz-innen { padding: 4px 0 8px; } .hz-innen + .hz-innen { border-top: 1px solid var(--gridc); padding-top: 12px; }
`;
var LAEDT9 = '<div class="leer">Lädt …</div>';
var TYP_ROLLE = {
  Ölradiator: ["heizkoerper", "oelradiator"],
  Konvektor: ["heizkoerper", "konvektor"],
  Bautrockner: ["bautrockner", "oelradiator"],
  Steckdose: ["steckdose", "oelradiator"],
  Pumpe: ["pumpe", "oelradiator"]
};
var PFAD = {
  preis: ["preis"],
  melden: ["melden_knopf"],
  feiertag_frei: ["heizung", "feiertag_frei"],
  boost_min: ["heizung", "boost_min"],
  toleranz: ["heizung", "toleranz"],
  hand_nachfrist: ["heizung", "hand_nachfrist_min"],
  fuehler_halten: ["heizung", "fuehler_halten_min"],
  zieht_w: ["heizung", "zieht_strom_w"],
  staffel: ["staffel", "an"],
  nutzbar: ["staffel", "nutzbar_prozent"],
  max_gleich: ["staffel", "max_gleichzeitig"],
  min_lauf: ["staffel", "min_lauf_min"],
  min_pause: ["staffel", "min_pause_min"],
  takt: ["staffel", "takt_min"],
  tuer_pause: ["heizung", "tuer_pause_min"],
  tuer_melden: ["heizung", "tuer_melden_min"],
  knoepfe: ["meldungen_einst", "knoepfe"],
  bericht: ["bericht", "haeufigkeit"],
  bericht_handy: ["bericht", "handy"],
  bericht_mail: ["bericht", "mail"],
  mail: ["bericht", "mail_an"],
  bericht_csv: ["bericht", "csv"],
  vorheizen: ["heizung", "vorheizen_min"],
  nachheizen: ["heizung", "nachheizen_min"],
  warm_vor: ["heizung", "warm_vor_min"],
  frost_aussen: ["heizung", "frost_aussen"],
  warm_nach: ["heizung", "warm_nach_min"],
  warm_max: ["heizung", "warm_max_min"],
  stufen_abstand: ["heizung", "stufen_abstand"],
  stufen_min: ["heizung", "stufen_min"],
  stufen_anstieg: ["heizung", "stufen_anstieg"],
  stufen_kalt: ["heizung", "stufen_kalt"],
  soll: ["heizung", "soll"],
  soll_art: ["heizung", "soll_art"],
  gleit_min: ["heizung", "gleit_min"],
  gleit_max: ["heizung", "gleit_max"],
  gleit_je: ["heizung", "gleit_je"],
  gleit_bezug: ["heizung", "gleit_bezug"],
  gleit_tage: ["heizung", "gleit_tage"],
  grenze: ["heizung", "heizgrenze"],
  basis: ["heizung", "heizgrenze_basis"],
  fruehstart: ["heizung", "fruehstart"],
  frueh_temp: ["heizung", "fruehstart_unter"],
  frueh_min: ["heizung", "fruehstart_min"],
  frost: ["heizung", "frost"],
  frost_temp: ["heizung", "frost_grenze"],
  tr_mm: ["heizung", "trocknen_ab_mm"],
  tr_laenger: ["heizung", "trocknen_laenger_min"],
  tr_frueher: ["heizung", "trocknen_frueher_min"],
  dauer_min: ["meldungen_einst", "dauerlauf_min"],
  kalt_min: ["meldungen_einst", "kalt_min"],
  hand_h: ["meldungen_einst", "hand_h"],
  zyklen_h: ["meldungen_einst", "zyklen_h"],
  // aus 0.6.3 zurück (0.7.8, api §7)
  frost_aus: ["heizung", "frost_aus"],
  urlaub: ["heizung", "frei_modus"],
  absenk: ["heizung", "absenk"],
  offline_min: ["meldungen_einst", "offline_min"],
  trocken_w: ["meldungen_einst", "trocken_unter_w"],
  erklaer: ["erklaer"],
  frost_immer: ["heizung", "frost_immer"],
  notprogramm: ["heizung", "notprogramm"],
  taste: ["heizung", "taste"]
};
var GRENZEN = {
  nutzbar: [30, 100],
  max_gleich: [1, 50],
  min_lauf: [1, 120],
  min_pause: [0, 120],
  takt: [5, 240],
  tuer_pause: [1, 120],
  tuer_melden: [1, 240],
  vorheizen: [0, 240],
  nachheizen: [0, 240],
  soll: [5, 30],
  gleit_min: [5, 30],
  gleit_max: [5, 30],
  gleit_je: [0, 0.5],
  gleit_bezug: [0, 20],
  gleit_tage: [1, 7],
  grenze: [0, 30],
  frueh_temp: [-15, 20],
  frueh_min: [0, 240],
  frost_temp: [0, 15],
  tr_mm: [0, 100],
  tr_laenger: [0, 480],
  tr_frueher: [0, 240],
  boost_min: [5, 480],
  toleranz: [0.1, 3],
  hand_nachfrist: [0, 240],
  fuehler_halten: [0, 120],
  zieht_w: [5, 500],
  frost_aus: [1, 20],
  absenk: [5, 20],
  offline_min: [1, 1440],
  trocken_w: [5, 5e3],
  dauer_min: [5, 1440],
  zyklen_h: [2, 200],
  kalt_min: [15, 1440],
  hand_h: [1, 240],
  warm_vor: [0, 240],
  warm_nach: [0, 240],
  frost_aussen: [-20, 10],
  warm_max: [15, 480],
  stufen_abstand: [0.5, 10],
  stufen_min: [5, 240],
  stufen_anstieg: [0, 5],
  stufen_kalt: [-30, 15]
};
var STUNDEN2 = [...Array(24)].map((_2, h3) => String(h3).padStart(2, "0"));
var ABSCHNITT = { fruehstart: "extra", vorheizen: "vor", nachheizen: "vor", arbeitszeit: "heiz", trocknen: "trock", termin: "termin", fenster: "eigen" };
var WETTER_STIMMUNG = {
  sunny: "klar",
  "clear-night": "klar",
  exceptional: "klar",
  partlycloudy: "wolkig",
  cloudy: "wolkig",
  windy: "wolkig",
  "windy-variant": "wolkig",
  rainy: "regen",
  pouring: "regen",
  hail: "regen",
  lightning: "gewitter",
  "lightning-rainy": "gewitter",
  fog: "nebel",
  snowy: "schnee",
  "snowy-rainy": "schnee"
};
function einblendungen(s4) {
  let jetzt = s4.sheet || null, eltern = null;
  Object.defineProperty(s4, "sheet", { enumerable: true, get: () => jetzt, set: (v2) => {
    if (v2 && v2.art === "bs-bearbeiten") eltern = null;
    else if (v2 && jetzt && ["bs-bearbeiten", "bereich"].includes(jetzt.art) && v2 !== jetzt && v2.art !== jetzt.art) eltern = jetzt;
    else if (!v2 && eltern && jetzt !== eltern) {
      v2 = eltern;
      eltern = null;
    } else if (!v2) eltern = null;
    jetzt = v2 || null;
  } });
  s4.leeren = () => {
    eltern = null;
    jetzt = null;
  };
  return s4;
}
var STATISCH = "/baustelle_static";
var SEITE_VERSION = "0.8.158";
var LIT_SHEETS = ["melden", "leistung", "heizzeit-c", "bedarf", "termin", "lernen", "hz", "heizplan", "az", "ausnahme", "az-neu", ...Object.keys(BAUSTELLE_EINBLENDUNGEN), ...Object.keys(EINRICHTUNG_EINBLENDUNGEN), "np-plug", ...Object.keys(INVENTAR_EINBLENDUNGEN), ...Object.keys(GERAETE_EINBLENDUNGEN), ...Object.keys(HEIZPERIODE_EINBLENDUNGEN), "kk-katalog", ...Object.keys(UEBERSICHT_EINBLENDUNGEN), "aw-detail"];
var BaustellePanel = class extends i4 {
  static styles = [r(CSS), r(GLAS_CSS), r(INV_CSS), r(GERAETE_CSS), r(HEIZPERIODE_CSS), r(WISCHEN_CSS), r(START_STIL)];
  // BSM-022 2b: Stile über Lit (adoptedStyleSheets)
  constructor() {
    super();
    this.s = einblendungen({ view: "uebersicht", cid: null, sheet: null, chart: "temp", verlauf: "aktiv" });
    this.cache = {};
    this.roh = null;
    this.alle = [];
    this.d = null;
    this.bid = null;
    this.fehler = null;
    this.vorhersage = { daily: null, hourly: null };
    this.abos = [];
    this.changelog = null;
    this.st = { phase: "tag", wetter: "wolkig", hell: false };
    try {
      const u3 = JSON.parse(localStorage.getItem("baustelle-panel") || "{}");
      this.bid = u3.bid || null;
    } catch (e6) {
    }
  }
  /* ---- Lebenszyklus (panel_custom: hass, narrow, panel) ---- */
  set hass(h3) {
    const erst = !this._hass;
    this._hass = h3;
    if (erst) {
      this._starten();
      this.requestUpdate();
    } else this._beobachten(h3);
    this._stimmung();
  }
  get hass() {
    return this._hass;
  }
  set narrow(n4) {
    const alt = this._narrow;
    this._narrow = !!n4;
    if (alt !== void 0 && alt !== this._narrow) this.neuZeichnen();
  }
  get narrow() {
    return this._narrow;
  }
  set panel(p4) {
    this._panel = p4;
  }
  get panel() {
    return this._panel;
  }
  connectedCallback() {
    super.connectedCallback();
    this._fensterAn();
    if (this._hass && !this._timer) this._starten();
    this._vorhersageAbo();
    if (!this.himmel && this.bg) this.himmel = Himmel.an(this.bg);
    this._stimmung(true);
  }
  disconnectedCallback() {
    super.disconnectedCallback();
    clearInterval(this._timer);
    this._timer = null;
    clearTimeout(this._nachladen);
    this._aboEnde();
    this._fensterAus();
    if (this.himmel) {
      this.himmel.stop();
      this.himmel = null;
    }
  }
  /* Listener am Fenster nur, solange die Seite eingehängt ist (BSM-022.03): sonst hält jede alte Seite sich selbst am Leben */
  _fensterAn() {
    if (this._fenster || typeof window === "undefined" || !window.addEventListener) return;
    this._fenster = {
      // WU-0016: Screenshot mit Strg+V ins offene Melde-Fenster
      paste: (e6) => {
        const sh = this.s && this.s.sheet;
        if (!sh || sh.art !== "melden") return;
        const it = [...e6.clipboardData && e6.clipboardData.items || []].find((i7) => i7.type && i7.type.startsWith("image/"));
        if (!it) return;
        e6.preventDefault();
        this.mbDatei(it.getAsFile(), "eingefügt");
      },
      "location-changed": () => {
        this._adresseFertig = null;
        setTimeout(() => this._adresse(), 0);
      },
      keydown: (e6) => wischTaste(this, e6)
      // WU-0020: ← → blättert in der Container-Ansicht (Desktop)
    };
    for (const [art, f3] of Object.entries(this._fenster)) window.addEventListener(art, f3);
  }
  _fensterAus() {
    if (!this._fenster) return;
    for (const [art, f3] of Object.entries(this._fenster)) window.removeEventListener(art, f3);
    this._fenster = null;
  }
  _starten() {
    this._laden();
    clearInterval(this._timer);
    this._timer = setInterval(() => this._laden(), 6e4);
    if (typeof fetch === "function") fetch(`${STATISCH}/changelog.json?v=${encodeURIComponent(this.version)}`).then((r5) => r5.ok ? r5.json() : null).then((c4) => {
      this.changelog = Array.isArray(c4) ? c4 : [];
      if (this.s.view === "ueber") this.neuZeichnen();
    }).catch(() => {
      this.changelog = [];
    });
  }
  get version() {
    return this.d && this.d.version || this._panel && this._panel.config && this._panel.config.version || "–";
  }
  get seiteVersion() {
    return SEITE_VERSION;
  }
  // Version dieser Seite (Bundle); version = Integration, gelesen beim Start von HA
  /* Der Rahmen steht nach dem ersten Zeichnen (render(), BSM-022 2b) und bleibt. Klicks und Eingaben hängen an den
     Lit-Vorlagen (@click/@input/@change); hier nur Zeiger (Tooltip der Diagramme, Ziehen im Raster) und Fokus */
  firstUpdated() {
    const sr = this.renderRoot;
    this.wurzel = sr.querySelector(".wurzel");
    this.root = sr.querySelector(".app");
    this.bg = sr.querySelector(".glas-bg");
    this.ui = sr.querySelector(".ui");
    sr.addEventListener("pointermove", (e6) => this.hover(e6));
    sr.addEventListener("pointerdown", (e6) => this.zugStart(e6));
    wischenAn(this, sr);
    sr.addEventListener("pointerleave", () => this.tip(null));
    sr.addEventListener("click", (e6) => this.oeTippen(e6));
    sr.addEventListener("pointerover", (e6) => this.oeZeigen(e6));
    sr.addEventListener("pointerout", (e6) => this.oeWeg(e6));
    sr.addEventListener("focusout", () => {
      if (this._wartet) {
        this._wartet = false;
        setTimeout(() => this._auffrischen(), 0);
      }
    });
    this.himmel = Himmel.an(this.bg);
    this._stimmung(true);
  }
  /* Eigene Entitäten geändert → Struktur kurz danach neu holen (Zustände kommen aus der Integration) */
  _beobachten(h3) {
    const ids = this._eigene || [];
    let neu = !this._alt;
    if (this._alt) {
      for (const id of ids) if (h3.states[id] !== this._alt[id]) {
        neu = true;
        break;
      }
    }
    this._alt = Object.fromEntries(ids.map((id) => [id, h3.states[id]]));
    if (neu && this._alt && ids.length && !this._nachladen) this._nachladen = setTimeout(() => {
      this._nachladen = null;
      this._laden();
    }, 3e3);
    if (neu && this.d && Date.now() - (this._liveGezeichnet || 0) > 1e4) {
      this._liveGezeichnet = Date.now();
      this._liveNeu();
    }
  }
  async _laden() {
    if (!this._hass) return;
    try {
      const r5 = await this._hass.callWS({ type: "baustelle/struktur" });
      const text2 = JSON.stringify(r5, (k2, v2) => k2 === "jetzt" ? void 0 : v2);
      if (text2 === this._rohText && !this.fehler && Date.now() - this._geholt < 3e5) return;
      this._rohText = text2;
      this._geholt = Date.now();
      this.roh = Array.isArray(r5) ? r5 : [];
      this.fehler = null;
      this._neuBauen();
      delete this.cache["p:" + (this.d && this.d.entry)];
    } catch (e6) {
      this.fehler = e6 && (e6.message || e6.code) || String(e6);
      if (!this.roh) this.roh = null;
    }
    this._vorhersageAbo();
    this._stimmung();
    this._adresse();
    this._auffrischen();
    this._versionPruefen();
  }
  /* Neuere Version als diese Seite? HA nach dem Neustart (struktur) oder eingespielt ohne Neustart (changelog.json auf der Platte) */
  _versionPruefen() {
    const vorher = this.neueVersion;
    for (const r5 of this.roh || []) if (verNeuer(r5.version, this.neueVersion || SEITE_VERSION)) this.neueVersion = r5.version;
    if (typeof fetch === "function" && !(Date.now() - (this._platteGeprueft || 0) < 6e5)) {
      this._platteGeprueft = Date.now();
      fetch(`${STATISCH}/changelog.json?t=${Date.now()}`, { cache: "no-store" }).then((r5) => r5.ok ? r5.json() : null).then((c4) => {
        const v2 = Array.isArray(c4) && c4[0] && c4[0].version;
        if (verNeuer(v2, this.neueVersion || SEITE_VERSION)) {
          this.neueVersion = v2;
          this.neuZeichnen();
        }
      }).catch(() => {
      });
    }
    if (this.neueVersion !== vorher) this.neuZeichnen();
  }
  rechte() {
    return rechteVon(this.roh);
  }
  /* Rechte und Sperren: src/rechte.js */
  nurLesen() {
    return !this.rechte().aendern;
  }
  darfSenden(msg) {
    return darfSenden(msg, this.rechte());
  }
  nurLesenHinweis() {
    if (!this.roh || !this.nurLesen()) return A;
    return b2`<div class="glas-panel neu-version nur-lesen-hinweis"><span>👁 ${NUR_ANSEHEN} <span class="leise">· jetzt heizen, Gefühl und Warnungen stumm gehen trotzdem</span></span></div>`;
  }
  versionHinweis() {
    if (!this.neueVersion) return A;
    return b2`<div class="glas-panel neu-version"><span>Neue Version ${this.neueVersion} – bitte neu laden <span class="leise">(geladen ist ${SEITE_VERSION})</span></span><button class="chip" @click=${() => this.neuLaden()}>Neu laden</button></div>`;
  }
  async neuLaden() {
    this.toast("Lädt neu …");
    const urls = [...new Set([this._panel && this._panel.config && this._panel.config.version, this.neueVersion, SEITE_VERSION].filter(Boolean))].map((v2) => `${STATISCH}/baustelle-panel.js?v=${encodeURIComponent(v2)}`);
    await Promise.all([...urls, `${STATISCH}/baustelle-panel.js`].map((u3) => fetch(u3, { cache: "reload" }).catch(() => null)));
    location.reload();
  }
  _neuBauen() {
    this.alle = (this.roh || []).map((r5) => this.bauen(r5));
    const aktiv = this.alle.filter((x2) => x2.aktiv);
    this.d = aktiv.find((x2) => x2.entry === this.bid) || aktiv[0] || null;
    if (this.d && this.d.entry !== this.bid) {
      this.bid = this.d.entry;
      this._merken();
    }
    this._eigene = (this.roh || []).flatMap((r5) => Object.values(r5.entitaeten || {}));
  }
  /* Adresse aus einer Handy-Nachricht (api §4): ?baustelle=<entry_id>&container=<bid>&ansicht=auswertung */
  _adresse() {
    const such = typeof location !== "undefined" ? location.search : "";
    if (!such || such === this._adresseFertig || !this.roh) return;
    this._adresseFertig = such;
    const q = new URLSearchParams(such), bid = q.get("baustelle"), cid = q.get("container"), ansicht2 = q.get("ansicht");
    const x2 = bid && this.alle.find((y3) => y3.entry === bid);
    if (x2 && x2.aktiv) {
      this.bid = x2.entry;
      this._merken();
      this._neuBauen();
      this._vorhersageAbo();
      this._stimmung(true);
    } else if (x2) {
      this.s.bs = x2.entry;
      return this.gehe("bsdetail");
    }
    if (cid && this.d && this.d.bereiche.some((b3) => b3.id === cid)) return this.gehe("container", cid);
    if (["uebersicht", "heizung", "pumpen", "auswertung", "verlauf", "einst"].includes(ansicht2)) return this.gehe(ansicht2);
    if (x2) this.gehe("uebersicht");
  }
  _merken() {
    try {
      localStorage.setItem("baustelle-panel", JSON.stringify({ bid: this.bid }));
    } catch (e6) {
    }
  }
  get z() {
    return this.d.z;
  }
  /* Hintergrund aus der Baustelle: Tageszeit (sun.sun), Wetter (Wetter-Entität), hell/dunkel (Theme) */
  _stimmung(erzwingen = false) {
    if (!this.bg || !this._hass) return;
    const h3 = this._hass, eid = this.d && this.d.wetterEid, w2 = eid && h3.states[eid];
    const sonne = h3.states["sun.sun"], phase = phaseAusSonne(sonne), wetter2 = WETTER_STIMMUNG[w2 && w2.state] || "wolkig", hell = !(h3.themes && h3.themes.darkMode);
    const lauf = this.lauf = himmelLauf(sonne);
    if (this.himmel) this.himmel.setze(phase, wetter2, hell, sonne, lauf);
    this.bg.style.setProperty("--sonne-x", (lauf.uSonnePos[0] * 100).toFixed(1) + "%");
    this.bg.style.setProperty("--sonne-y", (lauf.uSonnePos[1] * 100).toFixed(1) + "%");
    const alt = this.st, neu = { phase, wetter: wetter2, hell };
    if (!erzwingen && alt.phase === phase && alt.wetter === wetter2 && alt.hell === hell && this.bg.dataset.phase) return;
    if (this.bg.dataset.phase !== phase || this.bg.dataset.wetter !== wetter2) {
      const p4 = this.bg.querySelector(".partikel");
      if (p4) p4.innerHTML = partikel(phase, wetter2);
    }
    this.bg.dataset.phase = phase;
    this.bg.dataset.wetter = wetter2;
    if (this.wurzel) this.wurzel.classList.toggle("hell", hell);
    const kopfNeu = alt.wetter !== wetter2 || alt.phase !== phase;
    this.st = neu;
    if (kopfNeu && this.d) this._auffrischen();
  }
  _vorhersageAbo() {
    const eid = this.d && this.d.wetterEid, con = this._hass && this._hass.connection;
    if (!eid || !con || !con.subscribeMessage || this._aboFuer === eid) return;
    this._aboEnde();
    this._aboFuer = eid;
    this.vorhersage = { daily: null, hourly: null };
    for (const art of ["daily", "hourly"]) {
      const abo = con.subscribeMessage(
        (m3) => {
          this.vorhersage[art] = m3 && m3.forecast || [];
          this._auffrischen();
        },
        { type: "weather/subscribe_forecast", entity_id: eid, forecast_type: art }
      );
      if (abo && abo.catch) abo.catch(() => {
        this.vorhersage[art] = [];
      });
      this.abos.push(abo);
    }
  }
  _aboEnde() {
    for (const a3 of this.abos) if (a3 && a3.then) a3.then((ende) => typeof ende === "function" && ende()).catch(() => {
    });
    this.abos = [];
    this._aboFuer = null;
  }
  lokal(t5, zone = this.d && this.d.z.zone) {
    return lokal(t5, zone);
  }
  /* Zeit in der Zone der Baustelle (src/daten.js) */
  zoneMs(tag, zeit = "00:00", zone = this.d && this.d.z.zone) {
    return zoneMs(tag, zeit, zone);
  }
  seitText(iso) {
    if (!iso) return "";
    const l4 = this.lokal(iso);
    return l4.slice(0, 10) === this.z.HEUTE ? `seit ${l4.slice(11, 16)}` : `seit ${wtag(l4)} ${kurzDatum(l4)}`;
  }
  jetztMs() {
    return this.d ? this.d.z.jetztMs : Date.now();
  }
  /* Adapter baustelle/struktur → Modell der Seite (src/daten.js) */
  bauen(r5) {
    return bauen(r5, this._hass, this.d && this.d.z.zone);
  }
  /* Beginn und Ende einer Baustelle als Text; „(angelegt)“ = Beginn automatisch (AN-0002) */
  bsZeit(x2) {
    return `${x2.beginn ? datum(x2.beginn) : "–"}${x2.beginnAuto ? " (angelegt)" : ""} – ${x2.ende ? datum(x2.ende) : "offen"}`;
  }
  minSeitAb(iso, jetztMs) {
    return minSeitAb(iso, jetztMs);
  }
  protokollZeile(p4, z2) {
    return protokollZeile(p4, z2, this.d && this.d.z.zone);
  }
  eid(d3, besitzer, key) {
    return d3.ent[`${besitzer}_${key}`] || null;
  }
  zustand(eid) {
    const s4 = eid && this._hass && this._hass.states[eid];
    return s4 && !["unknown", "unavailable"].includes(s4.state) ? s4 : null;
  }
  name(eid) {
    const s4 = eid && this._hass && this._hass.states[eid];
    return s4 && s4.attributes.friendly_name || eid || "";
  }
  /* ---- Nachladen mit Zwischenspeicher: gibt undefined zurück, solange es lädt ---- */
  _holen(key, holer, maxAlter = 3e5) {
    const c4 = this.cache[key], jetzt = Date.now();
    if (!c4 || !c4.laeuft && jetzt - c4.zeit > maxAlter) {
      this.cache[key] = { ...c4 || {}, laeuft: true, zeit: jetzt };
      Promise.resolve().then(holer).then((daten) => {
        this.cache[key] = { daten, zeit: Date.now(), laeuft: false };
        this._auffrischen();
      }).catch((err) => {
        this.cache[key] = { daten: null, fehler: String(err && err.message || err), zeit: Date.now(), laeuft: false };
        this._auffrischen();
      });
    }
    return c4 && "daten" in c4 ? c4.daten : void 0;
  }
  /* Neu zeichnen ohne Eingaben zu stören */
  _auffrischen() {
    if (this._auffrischenGeplant) return;
    this._auffrischenGeplant = true;
    Promise.resolve().then(() => {
      this._auffrischenGeplant = false;
      const f3 = this.shadowRoot && this.shadowRoot.activeElement;
      if (f3 && ["INPUT", "TEXTAREA", "SELECT"].includes(f3.tagName) && !(this.s.sheet && LIT_SHEETS.includes(this.s.sheet.art) && f3.closest(".sheet"))) {
        this._wartet = true;
        return;
      }
      this.neuZeichnen();
    });
  }
  /* Zeiträume der Auswertung: Tag (je Stunde), Woche/Monat (je Tag), Jahr (je Monat); versatz 1 = davor */
  zeitraum(z2, versatz = 0, d3 = this.d) {
    const h3 = d3.z.HEUTE, J = +h3.slice(0, 4), M2 = +h3.slice(5, 7);
    if (z2 === "Tag") {
      const tag = plusTage(h3, -versatz);
      return { von: tag, bis: plusTage(tag, 1), periode: "hour", n: 24, labels: [...Array(24)].map((_2, i7) => String(i7).padStart(2, "0")), index: (l4) => l4.slice(0, 10) === tag ? +l4.slice(11, 13) : -1 };
    }
    if (z2 === "Woche") {
      const mo = plusTage(d3.z.WOCHE_ISO[0], -7 * versatz);
      return { von: mo, bis: plusTage(mo, 7), periode: "day", n: 7, labels: TAGE, index: (l4) => tageZwischen(mo, l4.slice(0, 10)) };
    }
    if (z2 === "Monat") {
      let m3 = M2 - 1 - versatz, j3 = J;
      while (m3 < 0) {
        m3 += 12;
        j3--;
      }
      const von = `${j3}-${String(m3 + 1).padStart(2, "0")}-01`, n4 = new Date(Date.UTC(j3, m3 + 1, 0)).getUTCDate();
      return { von, bis: plusTage(von, n4), periode: "day", n: n4, labels: [...Array(n4)].map((_2, i7) => `${i7 + 1}.`), index: (l4) => l4.slice(0, 7) === von.slice(0, 7) ? +l4.slice(8, 10) - 1 : -1, monat: m3, jahr: j3 };
    }
    const j2 = J - versatz;
    return { von: `${j2}-01-01`, bis: `${j2 + 1}-01-01`, periode: "month", n: 12, labels: MONATE, index: (l4) => +l4.slice(0, 4) === j2 ? +l4.slice(5, 7) - 1 : -1, jahr: j2 };
  }
  statIds(d3, mitTemp) {
    const ids = [];
    for (const b3 of d3.bereiche) {
      const en = this.eid(d3, b3.id, "energie");
      if (en) ids.push(en);
      else ids.push(...b3.geraete.map((g2) => g2.energie).filter(Boolean));
      ids.push(this.eid(d3, b3.id, "heizzeit"));
      if (!b3.pumpe) ids.push(this.eid(d3, b3.id, "heizzeit_strom"));
      for (const g2 of b3.geraete) if (g2.rolle === "pumpe") ids.push(this.eid(d3, g2.id, "pumpzeit"), this.eid(d3, g2.id, "pumpzyklen"));
      if (mitTemp && b3.fuehler) ids.push(b3.fuehler);
    }
    ids.push(this.eid(d3, d3.entry, "energie_ohne_automatik"));
    if (mitTemp) ids.push(this.eid(d3, d3.entry, "aussen"));
    return [...new Set(ids.filter(Boolean))].sort();
  }
  /* Langzeitstatistik (Recorder) eines Zeitraums: {statistic_id: [Wert je Stunde/Tag/Monat]} */
  statistik(z2, versatz = 0, d3 = this.d) {
    if (!d3) return null;
    const zr = this.zeitraum(z2, versatz, d3), ids = this.statIds(d3, z2 === "Tag");
    if (!ids.length) return { ...zr, werte: {} };
    const vonMs = this.zoneMs(zr.von, "00:00", d3.z.zone), bisMs = this.zoneMs(zr.bis, "00:00", d3.z.zone), jetztMs = Date.now();
    const laufend = jetztMs >= vonMs && jetztMs < bisMs, frisch = laufend ? 6e4 : void 0;
    const roh2 = this._holen(`s:${d3.entry}:${z2}:${zr.von}`, () => this._hass.callWS({
      type: "baustelle/statistik",
      entry_id: d3.entry,
      start_time: new Date(vonMs).toISOString(),
      end_time: new Date(bisMs).toISOString(),
      statistic_ids: ids,
      period: zr.periode,
      types: ["change", "mean", "state"],
      units: {}
    }), frisch);
    if (roh2 === void 0) return null;
    let kurz = null, kurzAb = 0;
    if (laufend) {
      const stunde = Math.floor(jetztMs / 36e5) * 36e5;
      kurzAb = Math.max(vonMs, jetztMs - stunde < 6e4 ? stunde - 36e5 : stunde);
      kurz = this._holen(`k:${d3.entry}:${z2}:${zr.von}:${kurzAb}`, () => this._hass.callWS({
        type: "baustelle/statistik",
        entry_id: d3.entry,
        start_time: new Date(kurzAb).toISOString(),
        statistic_ids: ids,
        period: "5minute",
        types: ["change", "mean", "state"],
        units: {}
      }), 6e4) || null;
    }
    const ms = (p4) => typeof p4.start === "number" ? p4.start < 1e11 ? p4.start * 1e3 : p4.start : Date.parse(p4.start);
    const werte = {};
    for (const id of ids) {
      const arr = Array(zr.n).fill(null);
      for (const p4 of (roh2 || {})[id] || []) {
        const i7 = zr.index(this.lokal(ms(p4), d3.z.zone));
        if (i7 < 0 || i7 >= zr.n) continue;
        if (zahl(p4.change)) arr[i7] = (arr[i7] || 0) + Number(p4.change);
        else if (zahl(p4.mean)) arr[i7] = Number(p4.mean);
      }
      const mittel = {};
      for (const p4 of (kurz || {})[id] || []) {
        const t5 = ms(p4);
        if (t5 < kurzAb) continue;
        const i7 = zr.index(this.lokal(t5, d3.z.zone));
        if (i7 < 0 || i7 >= zr.n) continue;
        const hatStunde = ((roh2 || {})[id] || []).some((q) => zr.periode === "hour" && ms(q) === Math.floor(t5 / 36e5) * 36e5);
        if (hatStunde) continue;
        if (zahl(p4.change)) arr[i7] = (arr[i7] || 0) + Number(p4.change);
        else if (zahl(p4.mean)) (mittel[i7] ||= []).push(Number(p4.mean));
      }
      for (const [i7, v2] of Object.entries(mittel)) if (arr[i7] === null) arr[i7] = v2.reduce((x2, y3) => x2 + y3, 0) / v2.length;
      if (laufend) {
        const letzte = [...(roh2 || {})[id] || [], ...(kurz || {})[id] || []].filter((q) => zahl(q.change) && zahl(q.state)).sort((x2, y3) => ms(x2) - ms(y3)).at(-1);
        const jetzt = this._hass && this._hass.states[id], i7 = zr.index(this.lokal(jetztMs, d3.z.zone));
        const dazu = letzte && jetzt && zahl(jetzt.state) ? Number(jetzt.state) - Number(letzte.state) : 0;
        if (dazu > 0 && i7 >= 0 && i7 < zr.n) arr[i7] = (arr[i7] || 0) + dazu;
      }
      werte[id] = arr;
    }
    return { ...zr, werte };
  }
  /* Verbrauch in kWh je Stunde (Tag), je Tag (Woche/Monat) oder je Monat (Jahr); bid null = Summe der Baustelle */
  verbrauch(d3, bid, z2, versatz = 0) {
    const st = this.statistik(z2, versatz, d3);
    if (!st) return null;
    const eins = (b3) => {
      const en = this.eid(d3, b3.id, "energie"), ids = en ? [en] : b3.geraete.map((g2) => g2.energie).filter(Boolean);
      const r5 = addieren(ids.map((id) => (st.werte[id] || Array(st.n).fill(0)).map((v2) => v2 || 0)));
      return r5.length ? r5 : Array(st.n).fill(0);
    };
    const liste2 = bid ? d3.bereiche.filter((b3) => b3.id === bid) : d3.bereiche;
    return liste2.length ? addieren(liste2.map(eins)) : Array(st.n).fill(0);
  }
  reihe(d3, id, z2, versatz = 0) {
    const st = this.statistik(z2, versatz, d3);
    if (!st) return null;
    return id && st.werte[id] || Array(st.n).fill(null);
  }
  heizStunden(d3, b3, z2, versatz = 0) {
    if (b3.pumpe) {
      const r6 = b3.geraete.filter((g2) => g2.rolle === "pumpe").map((g2) => this.reihe(d3, this.eid(d3, g2.id, "pumpzeit"), z2, versatz));
      if (r6.some((x2) => !x2)) return null;
      return addieren(r6.map((x2) => x2.map((v2) => v2 || 0)));
    }
    const r5 = this.reihe(d3, this.eid(d3, b3.id, "heizzeit"), z2, versatz);
    return r5 && r5.map((v2) => v2 || 0);
  }
  zyklen(d3, b3, z2, versatz = 0) {
    const r5 = b3.geraete.filter((g2) => g2.rolle === "pumpe").map((g2) => this.reihe(d3, this.eid(d3, g2.id, "pumpzyklen"), z2, versatz));
    if (r5.some((x2) => !x2)) return null;
    return addieren(r5.map((x2) => x2.map((v2) => Math.round(v2 || 0))));
  }
  /* Auswertung, Abrechnung und Verlauf rechnet die Integration (api §8), die Seite zeigt nur an: null = lädt noch, {} = Fehler */
  /* ---- FE-0008: früheren Zeitraum wählen – ‹ › blättern, Kalender skaliert mit dem Zeitraum (Mockup glas.html, Variante 4) ---- */
  zrGrenze(alle = false) {
    const b3 = (alle ? this.laufende() : [this.d]).map((x2) => x2.beginn).filter(Boolean).sort()[0];
    return b3 && b3 <= this.z.HEUTE ? b3 : plusTage(this.z.HEUTE, -5 * 366);
  }
  zrMax(z2, grenze) {
    return Math.max(0, zrVersatz(z2, grenze, this.z.HEUTE, this.z.WOCHE_ISO[0]));
  }
  zrInfo(z2, v2) {
    return zrInfo(z2, v2, this.z.HEUTE, this.z.WOCHE_ISO[0]);
  }
  zrText(z2, v2 = 0) {
    return v2 === 0 ? { Tag: "heute", Woche: "diese Woche" }[z2] || this.zrInfo(z2, 0).text : v2 === 1 && z2 !== "Monat" && z2 !== "Jahr" ? this.zrInfo(z2, 1).text.toLowerCase() : this.zrInfo(z2, v2).text;
  }
  zrVgl(z2, v2 = 0) {
    return z2 === "Jahr" ? this.zrInfo("Jahr", v2 + 1).text : { Tag: v2 ? "Vortag" : "gestern", Woche: "Vorwoche", Monat: "Vormonat" }[z2];
  }
  zrSt(ziel2) {
    if (ziel2 === "aw") return this.s.aw;
    if (ziel2 === "sheet") return this.s.sheet || {};
    const z2 = ziel2 === "c-Tag" ? "Tag" : "Woche", c4 = this.s.cZr ||= {};
    return c4[z2] ||= { zeitraum: z2, v: 0 };
  }
  zrV(ziel2) {
    return (this.zrSt(ziel2) || {}).v || 0;
  }
  /* Kalender: Tag → Monat mit Tagen, Woche → Monat mit KW-Zeilen, Monat → Jahr mit Monaten, Jahr → Jahre seit Beginn */
  /* Preis simulieren (Herbert 04.10.2026): in der Auswertung mit dem Chip „💶 Preis“; die Integration rechnet alle € damit */
  simAktiv() {
    return !!this.s.awSim && this.s.view === "auswertung";
  }
  simPreis() {
    if (!zahl(this.s.simPreis)) {
      let v2 = null;
      try {
        v2 = parseFloat(localStorage.getItem("baustelle-sim-preis"));
      } catch (e6) {
        v2 = null;
      }
      this.s.simPreis = zahl(v2) ? v2 : this.d.e.preis;
    }
    return this.s.simPreis;
  }
  awDaten(z2, versatz = 0, scope = this.s.awScope || "diese", d3 = this.d, preis2 = this.simAktiv() ? this.simPreis() : null) {
    if (!d3) return null;
    const r5 = this._holen(`aw:${d3.entry}:${z2}:${versatz}:${scope}:${d3.z.HEUTE}:${preis2 ?? ""}`, () => this._hass.callWS({ type: "baustelle/auswertung", entry_id: d3.entry, zeitraum: z2, versatz, scope, ...preis2 !== null ? { preis: preis2 } : {} }));
    return r5 === void 0 ? null : r5 || {};
  }
  abDaten(z2, scope = this.s.awScope || "diese", d3 = this.d, versatz = 0, preis2 = this.simAktiv() ? this.simPreis() : null) {
    if (!d3) return null;
    const r5 = this._holen(`ab:${d3.entry}:${z2}:${versatz}:${scope}:${d3.z.HEUTE}:${preis2 ?? ""}`, () => this._hass.callWS({ type: "baustelle/abrechnung", entry_id: d3.entry, zeitraum: z2, versatz, scope, ...preis2 !== null ? { preis: preis2 } : {} }));
    return r5 === void 0 ? null : r5 || {};
  }
  verlaufDaten(x2) {
    const r5 = this._holen(`v:${x2.entry}:${x2.z.HEUTE}`, () => this._hass.callWS({ type: "baustelle/auswertung", entry_id: x2.entry, teil: "verlauf" }), 9e5);
    return r5 === void 0 ? null : r5 || {};
  }
  /* AN-0005: Leistung einer Stunde, jeder Messwert der Leistungssensoren (HA-Verlauf), je Gerät und als Summe */
  /* Leistung eines Containers (Einblendung, src/ansichten/einblendungen-container.js): eine Stunde oder der ganze Tag aus
     jedem Messwert der Shellys. Flackerfrei (Herbert 01.10.2026): einmal der ganze Tag, jede Stunde wird daraus nur
     ausgeschnitten – beim Ziehen kein Laden; solange geladen wird, bleibt der alte Stand stehen (WU-0012) */
  leistungDaten(s4) {
    const d3 = this.d, b3 = d3.bereiche.find((x2) => x2.id === s4.auswahl[0]) || this.b;
    if (!b3) return null;
    const v2 = s4.v || 0, tag = plusTage(this.z.HEUTE, -v2), jetztH = +this.z.JETZT.slice(0, 2), max = v2 ? 23 : jetztH, h3 = Math.min(zahl(s4.h) ? s4.h : v2 ? 12 : jetztH, max);
    const ganzerTag = s4.lart === "tag";
    const von = this.zoneMs(tag, ganzerTag ? "00:00" : `${String(h3).padStart(2, "0")}:00`, d3.z.zone), bis = ganzerTag ? this.zoneMs(plusTage(tag, 1), "00:00", d3.z.zone) : von + 36e5;
    const laufend = !v2 && (ganzerTag || h3 === jetztH);
    const geraete2 = b3.geraete.filter((g2) => g2.leistung), ids = geraete2.map((g2) => g2.leistung);
    const tagVon = this.zoneMs(tag, "00:00", d3.z.zone), tagBis = this.zoneMs(plusTage(tag, 1), "00:00", d3.z.zone);
    const roh2 = !ids.length ? {} : this._holen(`lh:${d3.entry}:${b3.id}:${tag}:tag`, () => this._hass.callWS({
      type: "baustelle/verlauf",
      entry_id: d3.entry,
      start_time: new Date(tagVon).toISOString(),
      end_time: new Date(Math.min(tagBis, d3.z.jetztMs)).toISOString(),
      entity_ids: ids,
      minimal_response: true,
      no_attributes: true,
      significant_changes_only: false
    }), !v2 ? 3e4 : void 0);
    const ende = laufend ? d3.z.jetztMs : bis, farben = ["var(--s2)", "var(--s3)", "var(--s4)", "var(--s5)", "var(--s6)"];
    const hh = (k2) => String(k2).padStart(2, "0");
    const vb = this.verbrauch(d3, b3.id, "Tag", v2), farbe = (k2) => !v2 && k2 > jetztH || !vb || !(vb[k2] > 1e-3) ? "rgba(127,127,127,.25)" : "var(--s1)";
    const grenze = (k2) => Math.max(0, Math.min(100, (k2 - 0.5) / 23 * 100)).toFixed(2);
    const L2 = {
      b: b3,
      h: h3,
      max,
      ganzerTag,
      laufend,
      hh,
      wert: ganzerTag ? "ganzer Tag" : `${hh(h3)}:00–${hh((h3 + 1) % 24)}:00`,
      spur: `linear-gradient(90deg, ${[...Array(24)].map((_2, k2) => `${farbe(k2)} ${grenze(k2)}% ${grenze(k2 + 1)}%`).join(", ")})`,
      zustand: "da"
    };
    if (!ids.length) return { ...L2, zustand: "ohne" };
    if (roh2 === void 0) return { ...L2, zustand: "laedt", letzt: this._lhLetzt };
    const ausschnitt = (alle) => {
      const vorher = alle.filter((p4) => p4[0] <= von).at(-1), drin = alle.filter((p4) => p4[0] > von && p4[0] < bis);
      return [...vorher ? [[von, vorher[1]]] : [], ...drin];
    };
    const reihen = geraete2.map((g2, k2) => ({ name: g2.n, farbe: farben[k2 % farben.length], punkte: ausschnitt(((roh2 || {})[g2.leistung] || []).map((x2) => [zahl(x2.lu) ? x2.lu * 1e3 : Date.parse(x2.last_updated || x2.last_changed), zahl(x2.s ?? x2.state) ? Number(x2.s ?? x2.state) : null]).filter((p4) => Number.isFinite(p4[0])).sort((p4, q) => p4[0] - q[0])) }));
    const zeiten = [...new Set(reihen.flatMap((r5) => r5.punkte.map((p4) => p4[0])))].sort((a3, b22) => a3 - b22);
    const wert2 = (r5, t5) => {
      let w2 = null;
      for (const p4 of r5.punkte) {
        if (p4[0] > t5) break;
        w2 = p4[1];
      }
      return w2;
    };
    const summeR = { name: "Summe", farbe: "var(--s1)", summe: true, punkte: zeiten.map((t5) => [t5, reihen.reduce((a3, r5) => a3 + (wert2(r5, t5) || 0), 0)]) };
    const zeige = reihen.length > 1 ? [...reihen, summeR] : reihen.map((r5) => ({ ...r5, farbe: "var(--s1)", summe: true }));
    const daten = {
      laufend,
      zeige,
      spitze: Math.max(0, ...summeR.punkte.map((p4) => p4[1])),
      messwerte: reihen.reduce((a3, r5) => a3 + r5.punkte.length, 0),
      mittel: summeR.punkte.length ? summeR.punkte.reduce((a3, p4, i7) => a3 + p4[1] * ((i7 + 1 < summeR.punkte.length ? summeR.punkte[i7 + 1][0] : ende) - p4[0]), 0) / Math.max(1, ende - summeR.punkte[0][0]) : 0,
      // FE-0024: Achse mit Uhrzeit, in der laufenden Stunde bzw. am laufenden Tag endet die Kurve bei „jetzt“
      chart: stufen(`lh-${b3.id}-${tag}-${ganzerTag ? "tag" : h3}`, zeige, von, bis, "W", ganzerTag ? [0, 4, 8, 12, 16, 20, 24].map((k2) => [von + k2 * 36e5, hh(k2)]) : [0, 10, 20, 30, 40, 50, 60].map((m3) => [von + m3 * 6e4, m3 === 60 ? `${hh((h3 + 1) % 24)}:00` : `${hh(h3)}:${hh(m3)}`]), laufend ? [d3.z.jetztMs, this.z.JETZT.slice(0, 5)] : null)
    };
    this._lhLetzt = daten;
    return { ...L2, daten };
  }
  /* FE-0009: Heizzeit eines Containers (Pumpenschacht: Pumpzeit) je Stunde, Tag oder Monat; AN-0011: eingeschaltet
     (Shelly an) und davon tatsächlich geheizt (Strom über „heizt tatsächlich ab“) – zwei Zähler der Integration */
  heizzeitDaten(s4) {
    const d3 = this.d, b3 = d3.bereiche.find((x2) => x2.id === s4.auswahl[0]) || this.b;
    if (!b3) return null;
    const z2 = s4.zeitraum || "Tag", v2 = s4.v || 0, zr = this.zeitraum(z2, v2), r5 = this.heizStunden(d3, b3, z2, v2);
    const sId = !b3.pumpe && this.eid(d3, b3.id, "heizzeit_strom"), rs = sId ? this.reihe(d3, sId, z2, v2) : null;
    const lab = zr.labels.map((l4, i7) => z2 === "Tag" ? i7 % 3 ? "" : l4 : z2 === "Monat" ? i7 % 5 ? "" : l4 : l4);
    return {
      b: b3,
      z: z2,
      v: v2,
      r: r5,
      rs,
      strom: !!sId,
      su: r5 ? summe(r5) : null,
      ss: rs ? summe(rs.map((x2) => x2 || 0)) : null,
      je: { Tag: "je Stunde", Woche: "je Tag", Monat: "je Tag", Jahr: "je Monat" }[z2],
      text: this.zrText(z2, v2),
      chart: sId ? r5 && rs ? flaeche(`hz-c-${b3.id}-${z2}-${v2}`, [{ name: "tatsächlich geheizt", v: rs.map((x2) => x2 || 0), farbe: "var(--s1)" }], zr.labels, "h", z2 === "Tag" ? 6 : z2 === "Monat" ? 7 : z2 === "Woche" ? 1 : 3, { name: "eingeschaltet", v: r5 }) : null : r5 ? balken(`hz-c-${b3.id}-${z2}-${v2}`, r5, lab, "h") : null
    };
  }
  /* Gemessen: wann zieht ein Gerät Strom (Leistung über „heizt tatsächlich ab“, Standard 50 W) – Verlauf der Leistungssensoren seit Montag */
  messung(d3 = this.d) {
    const geraete2 = d3.bereiche.flatMap((b3) => b3.geraete.map((g2) => ({ b: b3, g: g2, eid: g2.leistung || g2.schalter }))).filter((x2) => x2.eid);
    if (!geraete2.length) return {};
    const ids = [...new Set(geraete2.map((x2) => x2.eid))].sort(), start = this.zoneMs(d3.z.WOCHE_ISO[0], "00:00", d3.z.zone);
    const roh2 = this._holen(`h:${d3.entry}:${d3.z.HEUTE}:${d3.z.JETZT.slice(0, 4)}`, () => this._hass.callWS({
      type: "baustelle/verlauf",
      entry_id: d3.entry,
      start_time: new Date(start).toISOString(),
      end_time: new Date(d3.z.jetztMs).toISOString(),
      entity_ids: ids,
      minimal_response: true,
      no_attributes: true,
      significant_changes_only: false
    }), 6e5);
    if (roh2 === void 0) return null;
    const tagStart = d3.z.WOCHE_ISO.map((t5) => this.zoneMs(t5, "00:00", d3.z.zone)), ende = d3.z.jetztMs, erg = {};
    for (const { g: g2, eid } of geraete2) {
      const liste2 = ((roh2 || {})[eid] || []).map((x2) => ({ s: x2.s ?? x2.state, t: zahl(x2.lu) ? x2.lu * 1e3 : zahl(x2.lc) ? x2.lc * 1e3 : Date.parse(x2.last_updated || x2.last_changed) })).filter((x2) => Number.isFinite(x2.t)).sort((a3, b3) => a3.t - b3.t);
      const tage = TAGE.map(() => ({ an: [], off: [] }));
      liste2.forEach((x2, i7) => {
        const von = Math.max(x2.t, start), bis = i7 + 1 < liste2.length ? liste2[i7 + 1].t : ende;
        if (bis <= von) return;
        const art = x2.s === "unavailable" ? "off" : x2.s === "on" || zahl(x2.s) && Number(x2.s) > d3.e.zieht_w ? "an" : null;
        if (!art) return;
        tagStart.forEach((ds, k2) => {
          const a3 = Math.max(von, ds), b3 = Math.min(bis, ds + 864e5);
          if (b3 > a3) tage[k2][art].push([(a3 - ds) / 6e4, (b3 - ds) / 6e4]);
        });
      });
      for (const t5 of tage) for (const art of ["an", "off"]) {
        const m3 = [];
        for (const q of t5[art]) {
          const l4 = m3[m3.length - 1];
          if (l4 && q[0] - l4[1] < 1) l4[1] = Math.max(l4[1], q[1]);
          else m3.push([...q]);
        }
        t5[art] = m3;
      }
      erg[g2.id] = tage;
    }
    return erg;
  }
  _kalender(eid, tage = 400) {
    if (!eid) return [];
    const start = new Date(this.zoneMs(this.d ? this.z.HEUTE : (/* @__PURE__ */ new Date()).toISOString().slice(0, 10), "00:00", this.d && this.z.zone)), ende = new Date(start.getTime() + tage * 864e5);
    const r5 = this._holen(`k:${eid}`, () => this._hass.callApi("GET", `calendars/${eid}?start=${encodeURIComponent(start.toISOString())}&end=${encodeURIComponent(ende.toISOString())}`), 12e4);
    return r5 === void 0 ? null : (r5 || []).map((x2) => {
      const s4 = x2.start || {}, e6 = x2.end || {}, von = s4.date || this.lokal(s4.dateTime).slice(0, 10), bisX = e6.date ? plusTage(e6.date, -1) : this.lokal(e6.dateTime).slice(0, 10);
      return { name: x2.summary || "", von, bis: bisX < von ? von : bisX, uid: x2.uid || null, recurrence_id: x2.recurrence_id || null };
    });
  }
  wetterTag(iso) {
    const d3 = this.d, w2 = d3.wetter || {};
    if (iso === d3.z.HEUTE) return { kalt: w2.frueh_min, regen: w2.regen_heute, regenVortag: w2.regen_vortag };
    const f3 = (x2) => (this.vorhersage.daily || []).find((y3) => this.lokal(y3.datetime).slice(0, 10) === x2);
    const t5 = f3(iso), v2 = plusTage(iso, -1) === d3.z.HEUTE ? { precipitation: w2.regen_heute } : f3(plusTage(iso, -1));
    return { kalt: t5 && t5.templow, regen: t5 && t5.precipitation, regenVortag: v2 && v2.precipitation };
  }
  get azListe() {
    return [...this.d.arbeitszeiten].sort((a3, b3) => a3.ab.localeCompare(b3.ab));
  }
  get azJetzt() {
    const L2 = this.azListe;
    return L2.filter((a3) => a3.ab <= this.z.HEUTE).at(-1) || L2[0] || null;
  }
  /* Heizplan eines Tages – berechnet von der Integration (plan_woche), hier nur in Text übersetzt */
  /* WU-0009: Tür offen – die lernende Regelung lernt so lange nicht (Zustand von der Integration, lernen.offen) */
  offenText(b3) {
    const o6 = b3.lern && b3.lern.offen;
    if (!o6) return "";
    return o6.art === "vermutet" ? "🚪 Tür vermutlich offen – kühlt beim Heizen ab, lernt gerade nicht" : "🚪 Tür offen – lernt gerade nicht";
  }
  aufheizTeil(b3) {
    const a3 = b3.lern && b3.lern.aufheizen || {}, w2 = b3.lern && b3.lern.warm, n0 = b3.lern && b3.lern.auf_n || 3;
    const z2 = (x2) => x2 ? `<div><b>${de(x2.rate)} °C/h</b><span class="leise">${x2.n}× gemessen${x2.n < n0 ? " · noch zu wenig" : ""}</span></div>` : '<div><span class="leise">noch nicht gelernt</span></div>';
    const anz = [.../* @__PURE__ */ new Set([1, ...Object.keys(a3).map((k2) => +k2.split("|")[1] || 1)])].sort((x2, y3) => x2 - y3);
    return `<div class="gruppe-t">Aufheizen</div><div class="wa-tab"><b></b><b>kalt &lt; 5 °C</b><b>mild</b>${anz.map((n4) => `<span>${n4 === 1 ? "ein Heizkörper" : `${n4} Heizkörper`}</span>${z2(a3[`kalt|${n4}`])}${z2(a3[`mild|${n4}`])}`).join("")}</div>
      ${b3.start ? '<div class="leise">Wann der Container startet, steht oben unter „So rechnet der Start“.</div>' : w2 && w2.gelernt && w2.plan ? `<div class="wa-heute">⏰<div>Heute ab <b>${uhr(w2.plan.start)}</b> – ${w2.aufheiz_min} min für ${zahl(w2.innen) ? de(w2.innen) : "–"} → ${de(w2.soll)} °C, warm um <b>${uhr(w2.plan.ziel)}</b> (${w2.vor ? `${w2.vor} min vor Arbeitsbeginn` : "bei Arbeitsbeginn"})${w2.plan.begrenzt ? " · begrenzt durch „Frühestens“" : ""}</div></div>` : w2 ? `<div class="leise">Ab ${n0} Aufheizungen je Wetter rechnet der Container den Beginn selbst; bis dahin gelten Vorheizen und Kälte-Frühstart.</div>` : '<div class="leise">Der gelernte Beginn wirkt im Modus Thermostat.</div>'}
      <div class="leise">Gemessen wird jedes Aufheizen von mindestens 1 °C unter dem Soll, solange der Heizkörper durchgehend läuft. Kälte draußen steckt in der Rate – darum braucht es keinen eigenen Kälte-Frühstart.</div>`;
  }
  /* AN-0004: „Warm ab“ eines lernenden Containers – alle Zahlen von der Integration (laufzeit.container.<id>.lernen.warm) */
  warmText(b3, kurz = false) {
    const w2 = b3.lern && b3.lern.warm;
    if (!w2) return "";
    const S3 = b3.start;
    if (S3) return kurz ? `${S3.tag_t} ab ${S3.beginn} → warm ${S3.warm}` : S3.satz;
    if (!w2.gelernt) return kurz ? "Aufheizen lernt noch" : `lernt noch (${w2.n}/${w2.n_noetig} Aufheizungen bei ${w2.band === "kalt" ? "Kälte" : "mildem Wetter"}) – bis dahin Vorheizen und Kälte-Frühstart`;
    const pl = w2.plan;
    if (!pl) return kurz ? "" : "heute frei";
    if (kurz) return `heute ab ${uhr(pl.start)} → ${de(w2.soll)} °C um ${uhr(pl.ziel)}`;
    return `heizt ab ${uhr(pl.start)}, damit um ${uhr(pl.ziel)} ${de(w2.soll)} °C${zahl(w2.innen) ? ` (jetzt ${de(w2.innen)} °C` : " ("}${zahl(w2.rate) ? `, ${de(w2.rate)} °C/h gelernt` : ""}${pl.begrenzt ? ", begrenzt" : ""}) · warm bis ${uhr(pl.ende)}`;
  }
  /* AN-0003: wie sich die Heizzeit zusammensetzt – nur die Abschnitte der Integration (start, vor, a, b, nach, ende) */
  planRechnung(p4) {
    const min2 = (x2, y3) => `${Math.round(y3 - x2)} min`, teile = [];
    if (p4.vor > p4.extra) teile.push(`${min2(p4.extra, p4.vor)} früher (${[p4.codes.includes("fruehstart") && "Kälte", p4.codes.includes("frueher_nach_regen") && "Regen gestern"].filter(Boolean).join(" + ") || "Frühstart"})`);
    if (p4.a > p4.vor) teile.push(`${min2(p4.vor, p4.a)} Vorheizen`);
    teile.push(`Arbeit ${uhr(p4.a)}–${uhr(p4.b)}`);
    if (p4.nach > p4.b) teile.push(`${min2(p4.b, p4.nach)} Nachheizen`);
    if (p4.ende > p4.nach) teile.push(`${min2(p4.nach, p4.ende)} Kleidung trocknen`);
    return `Heizt ${uhr(p4.extra)}–${uhr(p4.ende)} = ${teile.join(" + ")}`;
  }
  planTag(tag) {
    return this.planIso(this.z.WOCHE_ISO[TAGE.indexOf(tag)]);
  }
  planIso(iso) {
    const q = this.d.plan[iso];
    if (!q) return null;
    const w2 = this.wetterTag(iso);
    const gruende = (q.gruende || []).map((c4) => c4 === "ausnahme" ? `Ausnahme: ${q.ausnahme && (q.ausnahme.notiz || AUSNAHME[q.ausnahme.art]) || "andere Zeiten"}` : c4 === "fruehstart" ? zahl(w2.kalt) ? `Frühstart ${de(w2.kalt).replace("-", "−")} °C` : "Frühstart" : c4 === "frueher_nach_regen" ? "früher nach Regen" : c4 === "gelernt" ? "🧠 gelernter Beginn" : c4 === "trocknen" ? zahl(w2.regen) ? `Kleidung trocknen, ${de(w2.regen, w2.regen % 1 ? 1 : 0)} mm Regen` : "Kleidung trocknen" : String(c4));
    return {
      vor: q.vor,
      extra: zahl(q.start) ? q.start : q.vor,
      a: q.a,
      b: q.b,
      nach: q.nach,
      ende: q.ende,
      gruende,
      codes: q.gruende || [],
      ausnahme: q.ausnahme || null,
      eigene: q.eigene || [],
      ausnahmen: q.ausnahmen || []
    };
  }
  statusText() {
    const d3 = this.d;
    if (!d3.geladen) return "nicht geladen – Integration prüfen";
    if (!d3.e.auto) return "Handbetrieb – nichts wird geschaltet";
    if (d3.jetztBis) return `♨ alle heizen bis ${d3.jetztBis}`;
    if (d3.statusText) return d3.statusText;
    const p4 = this.planTag(this.z.HEUTE_TAG), j2 = minu(this.z.JETZT);
    if (p4 && j2 >= p4.extra && j2 < p4.ende) return `♨ heizt bis ${uhr(p4.ende)}`;
    if (p4 && j2 < p4.extra) return `Start um ${uhr(p4.extra)}`;
    return "aus";
  }
  zeitstrahl(p4, jetzt = false) {
    const seg = p4 ? [[p4.extra, p4.vor, "extra"], [p4.vor, p4.a, "vor"], [p4.a, p4.b, "heiz"], [p4.b, p4.nach, "vor"], [p4.nach, p4.ende, "trock"], ...(p4.eigene || []).map((f3) => [f3[0], f3[1], "eigen"])] : [];
    return this.zeitstrahlSeg(seg, jetzt);
  }
  zeitstrahlSeg(liste2, jetzt = false) {
    const A2 = 4 * 60, B2 = 20 * 60, x2 = (m3) => Math.max(0, Math.min(100, (m3 - A2) / (B2 - A2) * 100));
    const seg = (von, bis, k2) => bis > von ? `<i class="tl-${k2}" style="left:${x2(von)}%;width:${x2(bis) - x2(von)}%"></i>` : "";
    return `<div class="tl-spur">${liste2.map((q) => seg(q[0], q[1], q[2])).join("")}${jetzt ? `<i class="tl-jetzt" style="left:${x2(minu(this.z.JETZT))}%"></i>` : ""}</div>`;
  }
  bName(id) {
    return id ? (this.d.bereiche.find((b3) => b3.id === id) || { name: id }).name : "Baustelle";
  }
  /* Staffelung: gemessene Last, Grenze und freier Platz – gerechnet von der Integration (laufzeit.staffel) */
  last() {
    const d3 = this.d, S3 = d3.staffel || {}, e6 = d3.e;
    const alleG = d3.bereiche.flatMap((b3) => b3.geraete.map((g2) => ({ b: b3, g: g2 }))), hk = alleG.filter((x2) => x2.g.heizer);
    const n4 = (x2) => zahl(x2) ? Number(x2) : 0;
    const A2 = (S3.anschluesse || []).map((a3) => {
      const s4 = d3.anschluesse.find((x2) => x2.id === a3.id) || {};
      return {
        id: a3.id,
        name: a3.name || s4.name || a3.id,
        ampere: s4.ampere,
        phasen: s4.phasen,
        voll: n4(a3.voll_kw),
        grenze: n4(a3.grenze_kw),
        reserve: n4(a3.reserve_kw),
        heiz: n4(a3.heiz_kw),
        pumpe: n4(a3.pumpe_kw),
        sonst: n4(a3.sonst_kw),
        frei: n4(a3.frei_kw)
      };
    });
    const s32 = (k2) => A2.reduce((x2, a3) => x2 + a3[k2], 0);
    return {
      A: A2,
      heiz: s32("heiz"),
      pumpe: s32("pumpe"),
      sonst: s32("sonst"),
      grenze: s32("grenze"),
      reserve: s32("reserve"),
      gesamt: s32("heiz") + s32("pumpe") + s32("sonst"),
      hk,
      laufen: zahl(S3.laufen) ? S3.laufen : hk.filter((x2) => x2.g.an && !x2.b.offline).length,
      warten: zahl(S3.warten) ? S3.warten : hk.filter((x2) => x2.g.warte).length,
      max: zahl(S3.max) ? S3.max : e6.max_gleich
    };
  }
  stromBalken(L2, klein) {
    const w2 = (v2) => `${L2.grenze > 0 ? Math.max(0, v2 / L2.grenze * 100) : 0}%`;
    return `<div class="strom ${klein ? "klein" : ""}"><div class="strom-spur"><i class="s-heiz" style="width:${w2(L2.heiz)}"></i><i class="s-pumpe" style="width:${w2(L2.pumpe)}"></i><i class="s-sonst" style="width:${w2(L2.sonst)}"></i>
      <i class="s-res" style="width:${w2(L2.reserve)}"></i></div></div>`;
  }
  arbeitsende() {
    const p4 = this.planTag(this.z.HEUTE_TAG);
    return p4 ? uhr(p4.b) : null;
  }
  /* Heizzeiten eines Containers an einem Tag der Woche: Abschnitte der Integration [von, bis, art] in Minuten */
  heizzeiten(b3, t5) {
    if (b3.pumpe) return [];
    const iso = this.z.WOCHE_ISO[TAGE.indexOf(t5)], seg = (this.d.abschnitte[b3.id] || {})[iso] || [];
    return seg.filter((q) => zahl(q[0]) && zahl(q[1])).map((q) => [Number(q[0]), Number(q[1]), ABSCHNITT[q[2]] || "heiz"]).filter((x2) => x2[1] > x2[0]).sort((p4, q) => p4[0] - q[0]);
  }
  /* Wann ein Heizkörper wirklich Strom zieht (Leistung über „heizt tatsächlich ab“, Standard 50 W) – aus dem Verlauf der Leistungssensoren */
  aktiv(b3, g2, t5) {
    const leer2 = { an: [], off: [] };
    if (!g2.heizer) return leer2;
    const tagNr = TAGE.indexOf(t5), heuteNr = TAGE.indexOf(this.z.HEUTE_TAG);
    if (tagNr > heuteNr) return leer2;
    const m3 = this.mess && this.mess[g2.id];
    return m3 && m3[tagNr] || leer2;
  }
  anschluss(id) {
    return this.d.anschluesse.find((a3) => a3.id === id) || this.d.anschluesse[0] || { id: null, name: "kein Anschluss", ampere: 0, phasen: 3, reserve: 0 };
  }
  laufende() {
    return this.alle.filter((x2) => x2.aktiv);
  }
  firma(id, d3 = this.d) {
    return d3.firmen.find((f3) => f3.id === id) || d3.firmen[0];
  }
  /* Was im Verbrauch gestapelt wird: Container dieser Baustelle, laufende Baustellen oder Firmen */
  quellen(st, ziel2) {
    const alle = ziel2 === "aw" && this.s.awScope === "alle", lauf = alle ? this.laufende() : [this.d], vs = st.v || 0;
    if (st.gruppe === "firma") {
      const namen = [...new Map(lauf.flatMap((l4) => l4.firmen.map((f3) => [f3.eigen ? "eigen" : f3.name, f3]))).values()];
      return namen.map((f3, k2) => ({ id: f3.eigen ? "eigen" : f3.name, name: f3.name, farbe: `var(--s${k2 % 6 + 1})`, v: (z2) => {
        const a3 = this.abDaten(z2, alle ? "alle" : "diese", this.d, vs);
        if (!a3) return null;
        return (a3.reihen || {})[f3.eigen ? "eigen" : f3.name] || Array(this.zeitraum(z2, vs).n).fill(0);
      } }));
    }
    if (alle) return lauf.map((l4, k2) => ({ id: l4.entry, name: l4.titel, farbe: `var(--s${k2 % 6 + 1})`, v: (z2) => this.verbrauch(l4, null, z2, vs) }));
    return this.d.bereiche.map((b3) => ({ id: b3.id, name: b3.name, farbe: BEREICH_FARBEN[b3.f % BEREICH_FARBEN.length], v: (z2) => this.verbrauch(this.d, b3.id, z2, vs) }));
  }
  /* Abrechnung: je Firma die Container mit kWh und Kosten im gewählten Zeitraum (rechnet die Integration, Firma je Tag) */
  freiText(iso) {
    const a3 = this.d.ausnahmen.find((x2) => x2.datum === iso), f3 = this.d.frei[iso];
    if (a3 && a3.art === "frei") return `Ausnahme: frei${a3.notiz ? " – " + esc(a3.notiz) : ""} · nur Frostschutz`;
    if (f3 === "feiertag") return `${esc(this.d.freiName[iso] || "Feiertag")} · nur Frostschutz`;
    if (f3 === "urlaub") return "Urlaub · nur Frostschutz";
    return "frei · nur Frostschutz";
  }
  heizplanInhalt() {
    const e6 = this.d.e;
    return `<div class="hp-legende"><span><i class="tl-extra"></i>Frühstart</span><span><i class="tl-eigen"></i>eigenes Zeitfenster</span><span><i class="tl-vor"></i>Vor- und Nachheizen ${e6.vorheizen}/${e6.nachheizen} min</span><span><i class="tl-heiz"></i>Arbeitszeit</span><span><i class="tl-trock"></i>Kleidung trocknen</span></div>
      <div class="hp">${this.z.WOCHE.map(([t5, d3], k2) => {
      const p4 = this.planTag(t5), h3 = t5 === this.z.HEUTE_TAG, iso = this.z.WOCHE_ISO[k2];
      return `<div class="hp-zeile ${h3 ? "heute" : ""} ${this.d.ausnahmen.some((x2) => x2.datum === iso) ? "ausn" : ""}"><div class="hp-tag"><b>${h3 ? "heute" : t5}</b><span>${d3}</span></div>
          <div class="hp-mitte">${this.zeitstrahl(p4, h3)}<div class="leise">${p4 ? p4.gruende.map(esc).join(" · ") : this.freiText(iso)}</div></div>
          <div class="hp-zeit">${p4 ? `${uhr(p4.extra)}<br>${uhr(p4.ende)}` : "–"}</div></div>`;
    }).join("")}
        <div class="hp-zeile achse"><div></div><div class="tl-achse">${["04", "08", "12", "16", "20"].map((h3) => `<span>${h3}</span>`).join("")}</div><div></div></div></div>`;
  }
  get b() {
    return this.d && this.d.bereiche.find((x2) => x2.id === this.s.cid);
  }
  gehe(view, cid = null) {
    this.s.view = view;
    this.s.cid = cid;
    this.s.leeren();
    this.s.zrKal = null;
    this.neuZeichnen(true);
  }
  herunterladen(url, name2) {
    if (typeof document === "undefined" || typeof document.createElement !== "function") return;
    const a3 = document.createElement("a");
    if (!a3) return;
    a3.href = url;
    a3.download = name2;
    if (a3.click) a3.click();
  }
  datei(inhalt, name2, typ) {
    if (typeof Blob === "undefined" || typeof URL === "undefined" || !URL.createObjectURL) return;
    this.herunterladen(URL.createObjectURL(new Blob([inhalt], { type: typ })), name2);
  }
  csv(art) {
    let text2, name2;
    if (this.s.view === "bsdetail") {
      const x2 = this.alle.find((y3) => y3.entry === this.s.bs), v2 = x2 && this.verlaufDaten(x2);
      if (!v2 || !v2.csv) return this.toast("Werte laden noch …");
      text2 = v2.csv;
      name2 = `baustelle-verbrauch-${x2.titel.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.csv`;
    } else {
      const z2 = (this.s.aw || { zeitraum: "Monat" }).zeitraum, lauf = this.s.awScope === "alle" ? this.laufende() : [this.d], a3 = this.abDaten(z2, void 0, this.d, (this.s.aw || {}).v || 0);
      if (!a3 || !a3.csv) return this.toast("Werte laden noch …");
      text2 = a3.csv[art === "firma" ? "firma" : "verbrauch"];
      name2 = `baustelle-${art === "firma" ? "abrechnung" : "verbrauch"}-${lauf.length > 1 ? "alle" : this.d.titel.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${z2.toLowerCase()}.csv`;
    }
    const zeilen = text2.replace(/^\ufeff/, "").split("\r\n");
    this.datei(text2, name2, "text/csv;charset=utf-8");
    this.toast(`${name2} · ${zeilen.length - 1} Zeilen`);
    return zeilen;
  }
  meldungOffen(m3) {
    return !["geschlossen", "verworfen", "erledigt"].includes(m3.status);
  }
  meldungenMarkdown() {
    const ART2 = { fehler: "Fehler", wunsch: "Wunsch", anregung: "Anregung" };
    return (this.meldungen() || []).map((m3) => `- [${this.meldungOffen(m3) ? " " : "x"}] **${m3.ticket ? m3.ticket + " " : ""}${ART2[m3.art] || m3.art}** (${TICKET_STATUS[m3.status] || m3.status}, ${this.meldungZeit(m3)}, v${m3.version || "–"}, ${m3.geraet || "–"}, ${m3.kontext || "–"}): ${m3.text}`).join("\n");
  }
  meldungen() {
    const r5 = this._holen("meldungen", () => this._hass.callWS({ type: "baustelle/meldungen", entry_id: this.d ? this.d.entry : void 0 }), 6e4);
    return r5 === void 0 ? null : Array.isArray(r5) ? r5 : r5 && r5.meldungen || [];
  }
  meldungZeit(m3) {
    const l4 = this.lokal(m3.zeit);
    return l4 ? `${wtag(l4)} ${kurzDatum(l4)} ${l4.slice(11, 16)}` : "–";
  }
  /* Einblendung öffnen (aus den Lit-Vorlagen); ds mit Angaben zur Einblendung (id, t, …) */
  einblenden(art, ds = {}) {
    const S3 = this.s, d3 = this.d, b3 = this.b, el = { dataset: { s: art, ...ds } }, neu = () => this.neuZeichnen();
    if (art === "termin") {
      S3.sheet = { art: "termin", form: { b: el.dataset.id || S3.cid, titel: "", datum: plusTage(this.z.HEUTE, 7), von: "09:00", bis: "10:00", wieder: "einmal", boost: false } };
      return neu();
    }
    if (art === "urlaub") {
      S3.sheet = { art: "urlaub", form: { name: "", von: plusTage(this.z.HEUTE, 14), bis: plusTage(this.z.HEUTE, 18) } };
      return neu();
    }
    if (art === "container-neu") {
      S3.sheet = { art, form: { name: "", art: "Container", fuehler: "", schalter: "", typ: "Ölradiator" } };
      return neu();
    }
    if (art === "wetterquelle") {
      const o6 = d3.optionen;
      S3.sheet = { art, form: { wetter: o6.wetter || "", temp_sensor: o6.temp_sensor || "", regen_sensor: o6.regen_sensor || "", urlaub_kalender: o6.urlaub_kalender || "", feiertag_kalender: o6.feiertag_kalender || "", termine_kalender: d3.termineKal || "" } };
      return neu();
    }
    if (art === "bs-loeschen") {
      S3.sheet = { art, id: el.dataset.id };
      return neu();
    }
    if (art === "zeitraum-bs") {
      S3.sheet = { art, form: { beginn: d3.beginnAuto ? "" : d3.beginn || "", ende: d3.ende || "", hp: [...d3.hp] } };
      return neu();
    }
    if (art === "name" || art === "baustelle-neu") {
      S3.sheet = { art, form: { name: art === "name" && d3 ? d3.titel : "" } };
      return neu();
    }
    S3.sheet = { art, t: el.dataset.t, i: +el.dataset.i, auswahl: el.dataset.id ? [el.dataset.id] : [], zeitraum: "Tag" };
    return neu();
  }
  /* Dialoge der Heizung (src/ansichten/einblendungen-heizung.js, BSM-022 3d) */
  jetztHeizen(an) {
    return an ? this.aktion("jetzt_heizen", { minuten: 60 }, `Alle heizen bis ${uhr(minu(this.z.JETZT) + 60)}`) : this.aktion("jetzt_heizen", { minuten: null }, "Zurück zum Plan");
  }
  azBearbeiten(v2) {
    this.s.sheet = { art: "az-neu", form: { alt_ab: v2.ab, ab: v2.ab, name: v2.auto ? "" : v2.name, tage: JSON.parse(JSON.stringify(v2.tage)) } };
    return this.neuZeichnen();
  }
  // FE-0002
  azWeg(x2) {
    if (this.d.arbeitszeiten.length < 2) return this.toast("Die letzte Arbeitszeit bleibt");
    this.s.sheet = null;
    this.neuZeichnen();
    return this.liste("arbeitszeiten", "loeschen", { ab: x2.ab }, `${x2.name} gelöscht`);
  }
  ausnahmeSpeichern() {
    const S3 = this.s, d3 = this.d, f3 = S3.sheet.form;
    if (!f3.datum || f3.art !== "frei" && f3.bis <= f3.von) return this.toast("Bitte Tag und Uhrzeit prüfen");
    S3.sheet = null;
    this.neuZeichnen();
    const dazu = f3.art !== "frei" && d3.ausnahmen.some((a3) => a3.datum === f3.datum && a3.art !== "frei");
    return this.liste("ausnahmen", "speichern", { datum: f3.datum, art: f3.art, von: f3.von, bis: f3.bis, notiz: f3.notiz.trim() }, `Ausnahme ${wtag(f3.datum)} ${kurzDatum(f3.datum)} ${dazu ? "dazu – die anderen bleiben" : "gespeichert"}`);
  }
  azSpeichern() {
    const S3 = this.s, d3 = this.d, f3 = S3.sheet.form;
    if (!f3.ab) return this.toast("Bitte ein Startdatum wählen");
    if (d3.arbeitszeiten.some((x2) => x2.ab === f3.ab && x2.ab !== f3.alt_ab && !x2.auto)) return this.toast(`Ab ${datum(f3.ab)} gibt es schon eine Arbeitszeit`);
    const tage = Object.fromEntries(TAGE.map((t5, k2) => [String(k2), f3.tage[t5] ? [...f3.tage[t5]] : null]));
    const bleiben = d3.arbeitszeiten.filter((x2) => x2.ab !== f3.alt_ab && !x2.auto), gilt = f3.ab <= this.z.HEUTE && !bleiben.some((x2) => x2.ab > f3.ab && x2.ab <= this.z.HEUTE);
    const text2 = f3.ab > this.z.HEUTE ? `Geplant – gilt ab ${datum(f3.ab)}` : gilt ? f3.alt_ab !== void 0 ? "Gespeichert – gilt jetzt" : "Gilt jetzt – die bisherige bleibt gespeichert" : "Gespeichert – eine jüngere Arbeitszeit gilt weiter";
    S3.sheet = null;
    this.neuZeichnen();
    return this.liste("arbeitszeiten", "speichern", { ab: f3.ab, name: f3.name.trim() || `ab ${datum(f3.ab)}`, tage, ...f3.alt_ab !== void 0 ? { alt_ab: f3.alt_ab } : {} }, text2);
  }
  /* Einblendungen der Übersicht (src/ansichten/einblendungen-uebersicht.js, BSM-022 3f) */
  /* Verbrauch (Einblendung „verbrauch“ und Auswertung, src/ansichten/einblendungen-uebersicht.js): Reihen, Summen, Diagramm */
  verbrauchDaten(st, ziel2) {
    const Q = this.quellen(st, ziel2), z2 = st.zeitraum, aus = Q.filter((q) => st.auswahl.includes(q.id)), alleGewaehlt = aus.length === Q.length && Q.length > 0;
    const alle = ziel2 === "aw" && this.s.awScope === "alle", summenName = alle ? "Alle laufenden" : this.d.titel;
    const zr = this.zeitraum(z2, st.v || 0), labels = zr.labels;
    const was = st.gruppe === "firma" ? "Firmen" : alle ? "Baustellen" : "Container";
    const titel2 = !aus.length ? `${summenName} · Summe` : aus.length === 1 ? aus[0].name : `${aus.length} ${was} gestapelt`;
    const eur2 = st.t === "eur", f3 = eur2 ? this.d.e.preis : 1;
    const einC = ziel2 === "sheet" && st.auswahl.length === 1 ? this.d.bereiche.find((b3) => b3.id === st.auswahl[0] && !b3.pumpe && b3.geraete.some((g2) => g2.heizer)) : null;
    const basis = st.ohneBasis || "geraet";
    const oa = einC ? this._holen(`oh:${this.d.entry}:${einC.id}:${z2}:${st.v || 0}:${basis}`, () => this._hass.callWS({ type: "baustelle/ohne", entry_id: this.d.entry, bereich: einC.id, zeitraum: z2, versatz: st.v || 0, basis })) : void 0;
    const werte = Q.map((q) => ({ q, v: q.v(z2) })), laedt = werte.some((x2) => !x2.v);
    const reihen = laedt ? [] : aus.length ? werte.filter((x2) => st.auswahl.includes(x2.q.id)).map(({ q, v: v2 }) => ({ name: q.name, v: v2, farbe: q.farbe })) : [{ name: "Summe", v: addieren(werte.map((x2) => x2.v)).length ? addieren(werte.map((x2) => x2.v)) : Array(zr.n).fill(0), farbe: "var(--s1)" }];
    const summeJe = labels.map((_2, i7) => reihen.reduce((a3, r5) => a3 + (r5.v[i7] || 0), 0)), sum = summe(summeJe);
    const spitze = Math.max(...summeJe, 0), wo = sum > 0 ? labels[summeJe.indexOf(spitze)] : "–";
    const einheit = eur2 ? "€" : z2 === "Tag" ? "kWh/h" : "kWh", je = `${{ Tag: "je Stunde", Woche: "je Tag", Monat: "je Tag", Jahr: "je Monat" }[z2]} · ${this.zrText(z2, st.v || 0)}`;
    const chart = laedt ? null : flaeche(
      `vb-${ziel2}-${this.s.awScope || ""}-${st.gruppe || ""}-${aus.map((q) => q.id).join("_") || "alle"}-${z2}${eur2 ? "-eur" : ""}`,
      eur2 ? reihen.map((r5) => ({ ...r5, v: r5.v.map((x2) => (x2 || 0) * f3) })) : reihen,
      labels,
      einheit,
      z2 === "Tag" ? 6 : z2 === "Monat" ? 7 : z2 === "Woche" ? 1 : 3,
      oa && oa.ergebnis ? { name: "ohne Automatik", v: oa.reihe.map((x2) => x2 * f3) } : null
    );
    const jeReihe = reihen.length > 1 ? reihen.map((r5) => {
      const su = summe(r5.v), sp = Math.max(...r5.v, 0);
      return { name: r5.name, farbe: r5.farbe, su, spitzeBei: su > 0 ? labels[r5.v.indexOf(sp)] : "–" };
    }) : [];
    return { Q, z: z2, aus, alleGewaehlt, alle, titel: titel2, eur: eur2, einC, basis, oa, laedt, reihen, sum, spitze, wo, einheit, je, preis: this.d.e.preis, chart, jeReihe };
  }
  /* Verbrauch: stapeln nach Container/Baustelle oder Firma (vorher case 'vb-gruppe') */
  vbGruppe(ziel2, v2) {
    const S3 = this.s, st = ziel2 === "aw" ? S3.aw : S3.sheet;
    st.gruppe = v2;
    st.auswahl = this.quellen(st, ziel2).map((q) => q.id);
    return this.neuZeichnen();
  }
  /* Verbrauch: Summe ('' ), alle gestapelt ('*') oder einen Teil an/ab (vorher case 'vb-wer') */
  vbWer(ziel2, id) {
    const S3 = this.s, sh = ziel2 === "aw" ? S3.aw : S3.sheet;
    if (!id) sh.auswahl = [];
    else if (id === "*") sh.auswahl = this.quellen(sh, ziel2 || "sheet").map((q) => q.id);
    else sh.auswahl = sh.auswahl.includes(id) ? sh.auswahl.filter((x2) => x2 !== id) : [...sh.auswahl, id];
    return this.neuZeichnen();
  }
  ohneBasisWahl(v2) {
    this.s.sheet.ohneBasis = v2;
    return this.neuZeichnen();
  }
  // WU-0013: Ø je Gerät | je Typ (vorher case 'oh-basis')
  wetterAnsicht(v2) {
    this.s.sheet.wa = v2;
    return this.neuZeichnen();
  }
  // Wetter: std | tag | 3 (vorher case 'wa')
  /* Warnung bis morgen 07:00 stumm bzw. wieder melden – Vor-Ort-Aktion warnung_stumm (vorher case 'w-stumm') */
  warnungStumm(id) {
    const w2 = this.d.warnungen.find((x2) => x2.id === id);
    if (!w2) return void 0;
    return this.aktion("warnung_stumm", { key: w2.key, bis: w2.stumm ? null : this.morgenFrueh() }, w2.stumm ? "Wird wieder gemeldet" : "Stumm bis morgen – bleibt im Protokoll");
  }
  warnungenProtokoll() {
    const S3 = this.s;
    S3.verlauf = "aktiv";
    S3.pfilter = "warnung";
    return this.gehe("verlauf");
  }
  // vorher case 'w-protokoll'
  stromRangAuf(id) {
    const o6 = this.s.srOffen ||= [];
    if (o6.includes(id)) o6.splice(o6.indexOf(id), 1);
    else o6.push(id);
    return this.neuZeichnen();
  }
  // vorher case 'sr-auf'
  /* Kacheln (src/ansichten/kacheln.js, BSM-022 3f); die noch alte Auswertung nutzt sie über klick() */
  kkAn(ort2, i7) {
    return this.kkListe(ort2).filter((y3) => y3.an)[i7];
  }
  kkWeg(ort2, i7) {
    const Lg = this.kkListe(ort2), x2 = Lg.filter((y3) => y3.an)[i7];
    if (!x2) return void 0;
    if (KK[x2.k]) Lg.splice(Lg.indexOf(x2), 1);
    else x2.an = false;
    this.kkMerken(ort2);
    return this.neuZeichnen();
  }
  kkDiaUm(ort2, i7) {
    const x2 = this.kkAn(ort2, i7);
    if (!x2) return void 0;
    x2.dia = x2.dia === false;
    this.kkMerken(ort2);
    return this.neuZeichnen();
  }
  vgArtUm(ort2, i7) {
    const x2 = this.kkAn(ort2, i7);
    if (!x2) return void 0;
    x2.art = x2.art === "linien" ? "balken" : "linien";
    this.kkMerken(ort2);
    return this.neuZeichnen();
  }
  kkAufI(ort2, i7) {
    const x2 = this.kkAn(ort2, i7);
    return x2 ? this.kkAuf(x2, ort2) : void 0;
  }
  kkPlus(ort2) {
    this.s.sheet = { art: "kk-katalog", ort: ort2, k: null, st: "M", id: null, dia: true, q: "", f: "alle", nurJe: false, nurEur: false };
    return this.neuZeichnen();
  }
  kkLayoutUm() {
    this.s.kkLayout = !this.s.kkLayout;
    return this.neuZeichnen();
  }
  /* Auswertung (ansichten/auswertung.js, BSM-022 3f) */
  awDetail(k2) {
    this.s.sheet = { art: "aw-detail", k: k2 };
    return this.neuZeichnen();
  }
  awBearbUmschalten() {
    const S3 = this.s;
    S3.awBearb = !S3.awBearb;
    S3.awLayout = false;
    return this.neuZeichnen();
  }
  awLayoutUmschalten() {
    const S3 = this.s;
    S3.awLayout = !S3.awLayout;
    S3.awBearb = false;
    return this.neuZeichnen();
  }
  awAn(i7) {
    const x2 = this.awAuswahl()[i7];
    x2.an = !x2.an;
    this.awMerken();
    return this.neuZeichnen();
  }
  awScopeWahl(v2) {
    const S3 = this.s;
    S3.awScope = v2;
    S3.aw.auswahl = this.quellen(S3.aw, "aw").map((q) => q.id);
    return this.neuZeichnen();
  }
  awStufeWahl(i7, v2) {
    const x2 = this.awAuswahl()[i7], st = awStufen(x2.k).find((q) => q[0] === v2);
    if (!st) return void 0;
    Object.assign(x2, { w: st[1], h: st[2], st: st[0] });
    this.awMerken();
    return this.neuZeichnen();
  }
  awVerschieben(i7, j2) {
    const Lg = this.awAuswahl();
    if (j2 < 0 || j2 >= Lg.length) return void 0;
    [Lg[i7], Lg[j2]] = [Lg[j2], Lg[i7]];
    this.awMerken();
    return this.neuZeichnen();
  }
  // ↑ = (i, i − 1), ↓ = (i, i + 1)
  simUmschalten() {
    this.s.awSim = !this.s.awSim;
    return this.neuZeichnen();
  }
  tvWahl(v2) {
    this.s.tv = v2;
    return this.neuZeichnen();
  }
  // Temperaturen Heute / 7 / 30 Tage
  spSim(dd) {
    const S3 = this.s;
    S3.simPreis = Math.max(0, Math.round((this.simPreis() + dd) * 100) / 100);
    try {
      localStorage.setItem("baustelle-sim-preis", String(S3.simPreis));
    } catch (e6) {
    }
    return this.neuZeichnen();
  }
  /* Notprogramm (src/ansichten/notprogramm.js, BSM-022 3e; BSM-019/021) */
  npPruefen() {
    const S3 = this.s;
    if (S3.npPrueft) return void 0;
    S3.npPrueft = true;
    this.neuZeichnen();
    return this.ws({ type: "baustelle/notprogramm_pruefen", entry_id: this.d.entry }, "Notprogramm geprüft").finally(() => {
      S3.npPrueft = false;
      this.neuZeichnen();
    });
  }
  npPlugAuf(id) {
    this.s.sheet = { art: "np-plug", id };
    return this.neuZeichnen();
  }
  /* Container-Inventar (src/ansichten/inventar.js, BSM-031.07): Daten und Schritte kommen von der Integration */
  invDaten() {
    return this._holen("inv", () => this._hass.callWS({ type: "baustelle/inventar" }), 6e4);
  }
  invFehler(k2 = "inv") {
    const c4 = this.cache[k2];
    return c4 && c4.fehler;
  }
  invVorschau(id) {
    return this._holen("invv:" + id, () => this._hass.callWS({ type: "baustelle/inventar_vorschau", container_id: id }), 3e4);
  }
  invRueckVorschau(id) {
    return this._holen("invr:" + id, () => this._hass.callWS({ type: "baustelle/inventar_rueckgaengig", container_id: id, vorschau: true }), 3e4);
  }
  invKandidaten() {
    const r5 = this._holen("invk", () => this._hass.callWS({ type: "baustelle/inventar_kandidaten" }), 3e4);
    return r5 && r5.geraete;
  }
  invNeu() {
    for (const k2 of Object.keys(this.cache)) if (k2 === "inv" || k2 === "invk" || k2.startsWith("invv:") || k2.startsWith("invr:")) delete this.cache[k2];
  }
  invAuf(sheet) {
    this.s.sheet = sheet;
    return this.neuZeichnen();
  }
  async invSenden(felder, text2, schliessen = false) {
    try {
      const r5 = await this._hass.callWS({ type: "baustelle/inventar_aendern", ...felder });
      this.invNeu();
      if (text2) this.toast(text2);
      if (schliessen) this.s.sheet = null;
      this.neuZeichnen();
      this._laden();
      return r5 || { ok: true };
    } catch (e6) {
      this.toast(this.fehlerText(e6));
      return null;
    }
  }
  async invAnlegen(f3, fi) {
    if (!f3.eigen && !fi) return this.toast("Bitte eine Firma wählen");
    if (!f3.eigen && !fi.kuerzel && !await this.invSenden({ aktion: "firma_kuerzel", entry_id: this.d.entry, firma_id: fi.id, kuerzel: f3.kuerzel || "" })) return;
    const kz = f3.eigen ? null : fi.kuerzel || (f3.kuerzel || "").trim().toUpperCase();
    const r5 = await this.invSenden({
      aktion: "container_anlegen",
      entry_id: this.d.entry,
      art: f3.art,
      ...kz ? { firma_kuerzel: kz } : {},
      ...f3.bereich_id ? { bereich_id: f3.bereich_id } : {},
      ...f3.eigen && f3.bereich_id && +f3.nr ? { nr: +f3.nr } : {}
    }, "Container angelegt");
    if (r5) this.invAuf(f3.bereich_id ? { art: "inv-vorschau", id: r5.id } : { art: "inv-container", id: r5.id });
  }
  async invZuordnen(c4, s4) {
    const k2 = (this.invKandidaten() || []).find((x2) => x2.device_id === s4.wahl);
    if (!k2) return this.toast("Bitte ein Gerät wählen");
    const r5 = await this.invSenden(
      { aktion: "ausruestung_zuordnen", container_id: c4.id, device_id: k2.device_id, ...k2.typ === "PLUG" ? { haengt: s4.haengt || "konvektor" } : {} },
      `${k2.name} zugeordnet`
    );
    if (r5) this.invAuf({ art: "inv-vorschau", id: c4.id });
  }
  async invAusfuehren(s4) {
    try {
      const r5 = await this._hass.callWS(s4.rueck ? { type: "baustelle/inventar_rueckgaengig", container_id: s4.id } : { type: "baustelle/inventar_umbenennen", container_id: s4.id });
      this.invNeu();
      this._laden();
      if (r5.status === "nichts") {
        this.toast("Schon alles nach Schema");
        return this.invAuf({ art: "inv-container", id: s4.id });
      }
      this.toast({ ausgefuehrt: "Umbenannt", teilweise: "Teilweise umbenannt – Rest folgt", zurueck: "Zurückgenommen", zurueck_teilweise: "Teilweise zurückgenommen" }[r5.status] || r5.status);
      return this.invAuf({ ...s4, ergebnis: r5 });
    } catch (e6) {
      this.toast(this.fehlerText(e6));
    }
  }
  npProbe(id, m3) {
    return this.ws({ type: "baustelle/notprogramm_probe", entry_id: this.d.entry, geraet: id, minuten: m3 }, m3 ? `Ausfall-Probe ${m3} min gestartet` : "Ausfall-Probe beendet");
  }
  /* Dialoge für Container und Geräte (src/ansichten/einblendungen-einrichtung.js, BSM-022 3e); Rümpfe wie bisher in klick() */
  firmaSpeichern() {
    const S3 = this.s, d3 = this.d, b3 = this.b, neu = () => this.neuZeichnen();
    const f3 = S3.sheet.form;
    if (!f3.name.trim()) return this.toast("Bitte einen Namen eingeben");
    const neue = f3.neu.filter((c4) => c4.name.trim());
    S3.sheet = null;
    neu();
    return (async () => {
      let ids = [];
      if (neue.length) {
        try {
          for (const c4 of neue) await this.bereichAnlegen(c4.name.trim(), c4.art === "Schacht");
          ids = await this.neueIds(neue.map((c4) => c4.name.trim()));
        } catch (e6) {
          return this.toast(`Nicht angelegt: ${this.fehlerText(e6)}`);
        }
      }
      return this.liste("firmen", "speichern", { ...f3.id ? { id: f3.id } : {}, name: f3.name.trim(), container: [...f3.container, ...ids] }, `${f3.name.trim()} gespeichert${neue.length ? ` · ${neue.length} Container angelegt` : ""}`);
    })();
  }
  firmaWeg() {
    const S3 = this.s, d3 = this.d, b3 = this.b, neu = () => this.neuZeichnen();
    const id = S3.sheet.form.id;
    S3.sheet = null;
    neu();
    return this.liste("firmen", "loeschen", { id }, "Firma gelöscht – Container gehören wieder der eigenen Firma");
  }
  anschlussSpeichern() {
    const S3 = this.s, d3 = this.d, b3 = this.b, neu = () => this.neuZeichnen();
    const f3 = S3.sheet.form;
    if (!f3.name.trim()) return this.toast("Bitte einen Namen eingeben");
    S3.sheet = null;
    neu();
    return this.liste("anschluesse", "speichern", { ...f3.id ? { id: f3.id } : {}, name: f3.name.trim(), ampere: f3.ampere, phasen: f3.phasen, reserve_kw: f3.reserve, container: f3.container }, `${f3.name.trim()} gespeichert`);
  }
  anschlussWeg() {
    const S3 = this.s, d3 = this.d, b3 = this.b, neu = () => this.neuZeichnen();
    const id = S3.sheet.form.id, rest = d3.anschluesse.find((x2) => x2.id !== id);
    S3.sheet = null;
    neu();
    return this.liste("anschluesse", "loeschen", { id }, `Gelöscht – Container hängen jetzt an ${rest ? rest.name : "keinem Anschluss"}`);
  }
  containerAnlegen() {
    const S3 = this.s, d3 = this.d, b3 = this.b, neu = () => this.neuZeichnen();
    const f3 = S3.sheet.form, name2 = f3.name.trim() || "Neuer Container", schacht = f3.art === "Pumpenschacht";
    S3.sheet = null;
    neu();
    return this.einrichten(async () => {
      const r5 = await this.dialog("config/config_entries/subentries/flow", { handler: [d3.entry, "bereich"] }, this.bereichDaten(name2, schacht ? "pumpenschacht" : "container", f3.fuehler));
      if (this.flowFehler(r5) || !f3.schalter) return r5;
      const [bid] = await this.neueIds([name2]);
      if (!bid) return r5;
      return this.geraeteSpeichern([{ aktion: "anlegen", ...this.geraetDaten(bid, { n: schacht ? "Pumpe 1" : "", typ: f3.typ, schalter: f3.schalter }) }]);
    }, `${name2} angelegt`).then(() => this._laden());
  }
  bereichSpeichern() {
    const S3 = this.s, d3 = this.d, b3 = this.b, neu = () => this.neuZeichnen();
    const e6 = S3.sheet.edit, x2 = b3;
    S3.sheet = null;
    neu();
    return this.einrichten(async () => {
      const eb = { ...(d3.r.einstellungen.bereiche || {})[x2.id] || {} }, pfad = (k2) => ["bereiche", x2.id, k2];
      const schritte = e6.geraete.flatMap((g2) => g2.weg && !g2.neu ? [{ aktion: "entfernen", geraet: g2.id }] : g2.neu && !g2.weg && g2.schalter ? [{ aktion: "anlegen", ...this.geraetDaten(x2.id, g2) }] : !g2.neu && !g2.weg && (g2.n !== g2.alt.n || g2.typ !== g2.alt.typ) ? [{ aktion: "aendern", geraet: g2.id, ...this.geraetDaten(x2.id, g2) }] : []);
      if (schritte.length) await this.geraeteSpeichern(schritte);
      if (e6.name.trim() && (e6.name.trim() !== x2.name || (e6.fuehler || "") !== (x2.fuehler || ""))) {
        const r5 = await this.dialog("config/config_entries/subentries/flow", { handler: [d3.entry, "bereich"], subentry_id: x2.id }, this.bereichDaten(e6.name.trim(), x2.art || "container", e6.fuehler));
        if (this.flowFehler(r5)) return r5;
      }
      const call = (k2, w2) => this._hass.callWS({ type: "baustelle/setzen", entry_id: d3.entry, pfad: pfad(k2), wert: w2 });
      if (e6.bedarf !== !!eb.bedarf) await call("bedarf", e6.bedarf);
      if (x2.groesse) {
        const m22 = e6.groesseArt === "einzel" ? null : e6.groesseArt === "doppel" ? x2.groesse.typen.doppel.m2 : zahl(e6.m2) && Number(e6.m2) >= 4 ? Number(e6.m2) : void 0;
        if (m22 !== void 0 && m22 !== (eb.groesse_m2 ?? null)) await call("groesse_m2", m22);
      }
      if ((e6.tuer || null) !== (eb.tuer || null)) await call("tuer", e6.tuer || null);
      if (e6.warmVor !== (x2.warmVor ?? null)) await call("warm_vor", e6.warmVor);
      if (e6.warmNach !== (x2.warmNach ?? null)) await call("warm_nach", e6.warmNach);
      if (e6.stufen !== !!x2.stufenAn) await call("stufen", e6.stufen);
      if ((e6.primaer || null) !== (x2.primaer || null)) await call("primaer", e6.primaer || null);
      if (e6.anschluss && e6.anschluss !== x2.anschluss) await call("anschluss", e6.anschluss);
      if (e6.firma !== x2.firma) {
        if (x2.firma !== "eigen") await this._hass.callWS({ type: "baustelle/liste", entry_id: d3.entry, liste: "firmen", aktion: "speichern", eintrag: { id: x2.firma, name: this.firma(x2.firma).name, container: d3.bereiche.filter((y3) => y3.firma === x2.firma && y3.id !== x2.id).map((y3) => y3.id) } });
        if (e6.firma !== "eigen") await this._hass.callWS({ type: "baustelle/liste", entry_id: d3.entry, liste: "firmen", aktion: "speichern", eintrag: { id: e6.firma, name: this.firma(e6.firma).name, container: [...d3.bereiche.filter((y3) => y3.firma === e6.firma).map((y3) => y3.id), x2.id] } });
      }
      return true;
    }, e6.geraete.some((g2) => g2.weg && !g2.neu) ? `Gespeichert · ${e6.geraete.filter((g2) => g2.weg && !g2.neu).length} entfernt – Werte bleiben im Verlauf` : "Gespeichert").then(() => this._laden());
  }
  bereichWeg() {
    const S3 = this.s, d3 = this.d, b3 = this.b, neu = () => this.neuZeichnen();
    const x2 = b3;
    S3.sheet = null;
    this.gehe("uebersicht");
    return this.einrichten(async () => {
      if (x2.geraete.length) await this.geraeteSpeichern(x2.geraete.map((g2) => ({ aktion: "entfernen", geraet: g2.id })));
      await this._hass.callWS({ type: "config_entries/subentries/delete", entry_id: d3.entry, subentry_id: x2.id });
      return true;
    }, `${x2.name} entfernt – Werte bleiben im Verlauf`).then(() => this._laden());
  }
  geraetSpeichern() {
    const S3 = this.s, d3 = this.d, b3 = this.b, neu = () => this.neuZeichnen();
    const f3 = S3.sheet.form, g2 = b3.geraete[S3.sheet.i], x2 = b3;
    if (!f3.n.trim() || !f3.schalter) return this.toast("Bitte Name und Shelly wählen");
    S3.sheet = S3.sheet.zurueck || null;
    neu();
    const geaendert = f3.n.trim() !== g2.n || f3.schalter !== g2.schalter || f3.typ !== g2.typ || f3.bereich !== x2.id || f3.leistung !== (g2.leistungEigen || "") || f3.energie !== (g2.energieEigen || "");
    return this.einrichten(async () => {
      if (geaendert) {
        await this.geraeteSpeichern([{
          aktion: "aendern",
          geraet: g2.id,
          ...this.geraetDaten(f3.bereich, { n: f3.n.trim(), typ: f3.typ, schalter: f3.schalter }),
          leistung: f3.leistung || null,
          energie: f3.energie || null
        }]);
      }
      if (f3.status !== g2.status) {
        await this._hass.callWS({ type: "baustelle/geraet", entry_id: d3.entry, geraet: g2.id, aktion: "status", status: f3.status });
        this.invNeu();
      }
      const call = (k2, w2) => this._hass.callWS({ type: "baustelle/setzen", entry_id: d3.entry, pfad: ["geraete", g2.id, k2], wert: w2 });
      if (f3.nennKw !== (g2.nennKwEigen ?? null)) await call("nenn_kw", f3.nennKw);
      if (f3.zusatz !== !!g2.zusatz) await call("zusatz", f3.zusatz);
      return true;
    }, `${f3.n.trim()} gespeichert`).then(() => this._laden());
  }
  /* Dialoge ändern nur ihren Entwurf; gespeichert wird bei „Speichern“, Abbrechen nimmt alles zurück (BSM-034.01) */
  warmEigen(e6, k2, dd) {
    const d3 = this.d, key = k2 === "vor" ? "warmVor" : "warmNach", alt = e6[key] ?? (k2 === "vor" ? d3.e.warm_vor : d3.e.warm_nach);
    e6[key] = Math.max(0, Math.min(240, alt + dd));
    return this.neuZeichnen();
  }
  warmZurueck(e6) {
    e6.warmVor = null;
    e6.warmNach = null;
    return this.neuZeichnen();
  }
  geraetNennKw(f3, g2, dd) {
    f3.nennKw = Math.max(0, Math.min(10, Math.round(((f3.nennKw ?? g2.kw) + dd) * 10) / 10));
    return this.neuZeichnen();
  }
  // Szenarien: Nennleistung ohne Messung
  unterDialog(sheet) {
    const s4 = this.s.sheet;
    this.s.sheet = { ...sheet, zurueck: s4 && s4.art === "bereich" ? s4 : null };
    return this.neuZeichnen();
  }
  // aus „Bearbeiten“: danach dorthin zurück, Entwurf bleibt
  aussehenAuf(x2) {
    return this.unterDialog({ art: "aussehen", id: x2.id });
  }
  // BSM-032
  bereichEntwurf(x2, s4) {
    const d3 = this.d;
    return s4.edit ||= {
      bedarf: !!x2.bedarf,
      name: x2.name,
      anschluss: x2.anschluss || d3.anschluesse[0] && d3.anschluesse[0].id || "",
      tuer: x2.tuer && x2.tuer.eid || "",
      firma: x2.firma || "eigen",
      fuehler: x2.fuehler || "",
      groesseArt: x2.groesse && x2.groesse.art || "einzel",
      m2: x2.groesse ? x2.groesse.m2 : null,
      warmVor: x2.warmVor ?? null,
      warmNach: x2.warmNach ?? null,
      stufen: !!x2.stufenAn,
      primaer: x2.primaer || "",
      // AN-0015
      // nur eigene Sensoren – die automatisch gefundenen sucht die Integration weiter selbst (BSM-034.01)
      geraete: x2.geraete.map((g2) => ({ id: g2.id, n: g2.n, typ: g2.typ, schalter: g2.schalter, leistung: g2.leistungEigen || void 0, energie: g2.energieEigen || void 0, alt: { n: g2.n, typ: g2.typ } }))
    };
  }
  symAendern(x2, fn) {
    const c4 = JSON.parse(JSON.stringify(this.symKonfig(x2)));
    fn(c4);
    return this.symSenden(x2, c4);
  }
  symStandard() {
    const s4 = this.s.sheet;
    s4.sym = null;
    s4.std = true;
    return this.neuZeichnen();
  }
  symSpeichern(b3) {
    const s4 = this.s.sheet, neu = s4.std ? null : s4.sym;
    this.s.sheet = s4.zurueck || null;
    this.neuZeichnen();
    return (s4.std ? b3.symbol && b3.symbol.eigen : JSON.stringify(neu) !== s4.anfang) ? this.setzen(["bereiche", b3.id, "symbol"], neu) : null;
  }
  /* Dialoge rund um die Baustelle (src/ansichten/einblendungen-baustelle.js, BSM-022 3e) */
  berichtDaten() {
    const d3 = this.d, e6 = d3.e, art = e6.bericht === "monat" ? "monat" : "woche";
    return !d3.geladen ? null : this._holen(`b:${d3.entry}:${art}:${d3.z.HEUTE}:${e6.bericht_mail}:${e6.bericht_csv}:${e6.mail}`, () => this._hass.callWS({ type: "baustelle/bericht", entry_id: d3.entry, art }), 12e4);
  }
  nameSpeichern() {
    const S3 = this.s, n4 = S3.sheet.form.name.trim();
    if (!n4) return this.toast("Bitte einen Namen eingeben");
    S3.sheet = null;
    this.neuZeichnen();
    return this.ws({ type: "config_entries/update", entry_id: this.d.entry, title: n4 }, "Gespeichert");
  }
  baustelleAnlegen() {
    const S3 = this.s, n4 = S3.sheet.form.name.trim();
    if (!n4) return this.toast("Bitte einen Namen eingeben");
    S3.sheet = null;
    this.neuZeichnen();
    const heute2 = this.d ? this.z.HEUTE : (/* @__PURE__ */ new Date()).toISOString().slice(0, 10);
    return this.einrichten(() => this.dialog("config/config_entries/flow", { handler: "baustelle", show_advanced_options: false }, { name: n4, beginn: heute2, heizung: true, pumpen: true }), `${n4} angelegt – jetzt Container anlegen`).then((r5) => {
      if (r5 && r5.next_flow) this._hass.callApi("DELETE", `config/config_entries/subentries/flow/${r5.next_flow[1]}`).catch(() => {
      });
      if (r5 && r5.result && r5.result.entry_id) {
        this.bid = r5.result.entry_id;
        this._merken();
      }
      this._laden();
    });
  }
  zeitraumBsSpeichern() {
    const S3 = this.s, d3 = this.d, f3 = S3.sheet.form;
    if (f3.ende && f3.ende < (f3.beginn || (d3.beginnAuto ? d3.beginn : ""))) return this.toast("Bitte Beginn und Ende prüfen");
    S3.sheet = null;
    this.neuZeichnen();
    return this.einrichten(() => this.optionenSpeichern(d3, { beginn: f3.beginn || null, ende: f3.ende || null, heizperiode_von: String(f3.hp[0]), heizperiode_bis: String(f3.hp[1]) }), "Gespeichert").then(() => this._laden());
  }
  abschliessen() {
    const d3 = this.d;
    this.s.leeren();
    this.neuZeichnen();
    return this.einrichten(() => this.optionenSpeichern(d3, { status: "abgeschlossen" }), "Abgeschlossen – steht jetzt im Verlauf").then(() => this._laden());
  }
  urlaubSpeichern() {
    const S3 = this.s, d3 = this.d, f3 = S3.sheet.form;
    if (!f3.von || !f3.bis || f3.bis < f3.von) return this.toast("Bitte Von und Bis prüfen");
    S3.sheet = null;
    this.neuZeichnen();
    delete this.cache["k:" + d3.optionen.urlaub_kalender];
    return this.ws({ type: "calendar/event/create", entity_id: d3.optionen.urlaub_kalender, event: { summary: f3.name.trim() || "Urlaub", dtstart: f3.von, dtend: plusTage(f3.bis, 1) } }, "Eingetragen – in der Zeit nur Frostschutz");
  }
  wetterquelleSpeichern() {
    const S3 = this.s, d3 = this.d, f3 = S3.sheet.form;
    S3.sheet = null;
    this.neuZeichnen();
    return this.einrichten(async () => {
      const r5 = await this.optionenSpeichern(d3, { wetter: f3.wetter, temp_sensor: f3.temp_sensor, regen_sensor: f3.regen_sensor, urlaub_kalender: f3.urlaub_kalender, feiertag_kalender: f3.feiertag_kalender });
      if (this.flowFehler(r5)) return r5;
      if ((f3.termine_kalender || null) !== (d3.termineKal || null)) await this._hass.callWS({ type: "baustelle/setzen", entry_id: d3.entry, pfad: ["termine_kalender"], wert: f3.termine_kalender || null });
      return r5;
    }, "Gespeichert").then(() => {
      this.cache = {};
      this._aboFuer = null;
      this._laden();
    });
  }
  preisSpeichern() {
    const S3 = this.s, f3 = S3.sheet, p4 = parseFloat(String(f3.preis).replace(",", "."));
    if (!f3.ab || !zahl(p4) || p4 < 0) return this.toast("Bitte Datum und Preis prüfen");
    S3.sheet = null;
    this.neuZeichnen();
    this.cache = {};
    return this.liste("preise", "speichern", { ab: f3.ab, preis: p4 }, `Strompreis ${de(p4, 2)} € ab ${datum(f3.ab)} gespeichert`);
  }
  bsLoeschen() {
    const S3 = this.s, d3 = this.d, x2 = this.alle.find((y3) => y3.entry === S3.sheet.id);
    S3.sheet = null;
    if (!x2) return this.neuZeichnen();
    const weg = d3 && d3.entry === x2.entry || S3.view === "bsdetail" && S3.bs === x2.entry;
    this.neuZeichnen();
    return this.einrichten(() => this._hass.callApi("DELETE", `config/config_entries/entry/${x2.entry}`), `${x2.titel} gelöscht`).then((r5) => {
      if (!r5) return;
      this._rohText = null;
      return this._laden().then(() => {
        if (weg) this.gehe("uebersicht");
      });
    });
  }
  bsBearbeiten(id) {
    const S3 = this.s, x2 = this.alle.find((y3) => y3.entry === id);
    if (!x2) return void 0;
    if (!x2.aktiv) {
      S3.bs = x2.entry;
      return this.gehe("bsdetail");
    }
    if (x2.entry !== this.bid) {
      this.bid = x2.entry;
      this._merken();
      this._neuBauen();
      this._vorhersageAbo();
      this._stimmung(true);
      S3.aw = null;
    }
    S3.sheet = { art: "bs-bearbeiten" };
    return this.neuZeichnen();
  }
  /* Einstellungen (src/ansichten/einstellungen.js, BSM-022 3e); Übersicht und Einblendungen nutzen sie über klick() */
  einstGruppeWahl(k2) {
    this.s.evGruppe = k2;
    this.s.evDev = null;
    return this.neuZeichnen(true);
  }
  bereichEinst(id) {
    this.s.cid = id;
    this.s.sheet = { art: "bereich" };
    return this.neuZeichnen();
  }
  firmaAuf(id) {
    const d3 = this.d, f3 = id ? this.firma(id) : null;
    this.s.sheet = { art: "firma", form: { id: f3 && f3.id, name: f3 && f3.name || "", neu: [], container: f3 ? d3.bereiche.filter((x2) => (x2.firma || "eigen") === f3.id).map((x2) => x2.id) : [] } };
    return this.neuZeichnen();
  }
  anschlussAuf(id) {
    const d3 = this.d, x2 = id ? this.anschluss(id) : null;
    this.s.sheet = { art: "anschluss", form: { id: x2 && x2.id, name: x2 && x2.name || "", ampere: x2 && x2.ampere || 32, phasen: x2 && x2.phasen || 3, reserve: x2 ? x2.reserve : 3, container: x2 ? d3.bereiche.filter((y3) => y3.anschluss === x2.id).map((y3) => y3.id) : [] } };
    return this.neuZeichnen();
  }
  preisNeu() {
    this.s.sheet = { art: "preis-neu", ab: plusTage(this.z.HEUTE, 1), preis: this.d.e.preis };
    return this.neuZeichnen();
  }
  preisWeg(ab) {
    this.cache = {};
    return this.liste("preise", "loeschen", { ab }, "Strompreis gelöscht");
  }
  vorrang(x2, v2) {
    return this.setzen(["bereiche", x2.id, "prio"], v2);
  }
  testMeldung() {
    return this.aktion("test_meldung", {}).then((r5) => {
      if (r5 && r5.an) this.toast(r5.an.length ? `Test-Nachricht an ${r5.an.join(", ")} gesendet` : "Kein Empfänger – bitte unter Meldungen wählen");
    });
  }
  berichtSenden() {
    const art = this.d.e.bericht === "monat" ? "monat" : "woche";
    return this.aktion("bericht_senden", { art }, `Bericht für ${art === "monat" ? "den Vormonat" : "die Vorwoche"} gesendet`);
  }
  mailSetzen(v2) {
    return this.setzen(PFAD.mail, String(v2).trim(), "Gespeichert");
  }
  awVorlageWahl(v2) {
    const S3 = this.s;
    this.awVorlage(v2);
    if (S3.sheet && S3.sheet.art === "kk-katalog") S3.sheet = null;
    this.neuZeichnen();
    return this.toast(`Vorlage „${AW_VORLAGEN[v2][0]}“ übernommen`);
  }
  /* Reiter Heizung (src/ansichten/heizung.js, BSM-022 3d); Einstellungen und Einblendungen nutzen sie über klick() */
  automatikUmschalten() {
    const e6 = this.d.e;
    return this.setzen(["automatik"], !e6.auto, !e6.auto ? "Automatik ein" : "Automatik aus – Geräte bleiben, wie sie sind");
  }
  hzAuf(k2) {
    this.s.sheet = { art: "hz", k: k2 };
    return this.neuZeichnen();
  }
  einstellungUmschalten(k2) {
    const e6 = this.d.e;
    if (ARTEN[k2]) return this.setzen(["meldungen_einst", "arten", ARTEN[k2]], !e6[k2]);
    return this.setzen(PFAD[k2], !e6[k2]);
  }
  einstellungWert(k2, v2) {
    return this.setzen(PFAD[k2], isNaN(+v2) ? v2 : +v2);
  }
  heizgrenzeBasis(v2) {
    return this.setzen(PFAD.basis, v2 === "jetzt" ? "jetzt" : "tageshoechst");
  }
  gefuehlVergessen() {
    return this.aktion("gefuehl_vergessen", {}, "Gelerntes Gefühl vergessen – es gilt der Startwert nach draußen");
  }
  containerSoll(x2, dd) {
    const [min2, max] = GRENZEN.soll;
    return this.setzen(["bereiche", x2.id, "soll"], Math.min(max, Math.max(min2, Math.round(((x2.soll ?? this.d.e.soll) + dd) * 2) / 2)));
  }
  urlaubWeg(u3) {
    const d3 = this.d;
    delete this.cache["k:" + d3.optionen.urlaub_kalender];
    return this.ws({ type: "calendar/event/delete", entity_id: d3.optionen.urlaub_kalender, uid: u3.uid, ...u3.recurrence_id ? { recurrence_id: u3.recurrence_id } : {} }, `${u3.name} gelöscht`);
  }
  ausnahmeNeu(v2) {
    const az = (this.azJetzt || { tage: {} }).tage, h3 = this.z.HEUTE, morgen = plusTage(h3, 1);
    const sa = plusTage(h3, (5 - ((/* @__PURE__ */ new Date(h3 + "T12:00:00Z")).getUTCDay() + 6) % 7 + 7) % 7 || 7);
    const vor = {
      "heute-laenger": { datum: h3, art: "zeiten", von: (az[wtag(h3)] || ["07:00"])[0], bis: "18:00", notiz: "heute länger" },
      "morgen-spaeter": { datum: morgen, art: "zeiten", von: "09:00", bis: (az[wtag(morgen)] || ["", "16:30"])[1], notiz: "morgen später" },
      samstag: { datum: sa, art: "arbeit", von: "07:00", bis: "12:00", notiz: "" },
      frei: { datum: morgen, art: "frei", von: "07:00", bis: "16:30", notiz: "" }
    }[v2] || { datum: plusTage(h3, 7), art: "zeiten", von: "07:00", bis: "16:30", notiz: "" };
    this.s.sheet = { art: "ausnahme", form: { ...vor } };
    return this.neuZeichnen();
  }
  ausnahmeDazu(datum4) {
    this.s.sheet = { art: "ausnahme", form: { datum: datum4, art: "arbeit", von: "17:00", bis: "19:00", notiz: "" } };
    return this.neuZeichnen();
  }
  ausnahmeWeg(a3) {
    const e6 = a3.art ? { datum: a3.datum, art: a3.art, von: a3.von || null, bis: a3.bis || null } : { datum: a3.datum };
    return this.liste("ausnahmen", "loeschen", e6, a3.art && a3.art !== "frei" ? `Zeitfenster ${a3.von}–${a3.bis} gelöscht – die anderen bleiben` : "Ausnahme gelöscht – es gilt wieder die Arbeitszeit");
  }
  azNeu(v2) {
    const tage = v2 ? JSON.parse(JSON.stringify(v2.tage)) : { Mo: ["07:00", "16:30"], Di: ["07:00", "16:30"], Mi: ["07:00", "16:30"], Do: ["07:00", "16:30"], Fr: ["07:00", "12:30"], Sa: null, So: null };
    this.s.sheet = { art: "az-neu", form: { ab: plusTage(this.z.WOCHE_ISO[0], 7), name: "", tage } };
    return this.neuZeichnen();
  }
  /* Einblendungen der Container-Ansicht (src/ansichten/einblendungen-container.js, BSM-022 3d) */
  schliessen() {
    this.s.sheet = this.s.sheet && this.s.sheet.zurueck || null;
    return this.neuZeichnen();
  }
  zeitraumWahl(ziel2, z2) {
    const st = ziel2 === "aw" ? this.s.aw : this.s.sheet;
    if (st.zeitraum !== z2) st.v = 0;
    st.zeitraum = z2;
    this.s.zrKal = null;
    return this.neuZeichnen();
  }
  lernZuruecksetzen(x2) {
    this.s.sheet = null;
    this.neuZeichnen();
    return this.aktion("lern_reset", { bereich: x2.id }, `${x2.name}: Lernstand zurückgesetzt`);
  }
  terminSpeichern() {
    const S3 = this.s, d3 = this.d, f3 = S3.sheet.form;
    if (!f3.titel.trim() || !f3.datum || f3.bis <= f3.von) return this.toast("Bitte Titel, Tag und Uhrzeit prüfen");
    if (!d3.termineKal) return this.toast("Zuerst einen Kalender für Termine wählen");
    const ev = { summary: f3.titel.trim(), dtstart: `${f3.datum}T${f3.von}:00`, dtend: `${f3.datum}T${f3.bis}:00`, description: `baustelle:${f3.b}${f3.boost ? "\nboost" : ""}` };
    if (f3.wieder !== "einmal") ev.rrule = f3.wieder === "woche" ? "FREQ=WEEKLY" : "FREQ=WEEKLY;INTERVAL=2";
    S3.sheet = null;
    this.neuZeichnen();
    return this.ws({ type: "calendar/event/create", entity_id: d3.termineKal, event: ev }, `Eingetragen${f3.wieder !== "einmal" ? ` – ${WIEDER[f3.wieder]} am ${wtag(f3.datum)}` : ""} – heizt ab ${uhr(minu(f3.von) - d3.e.vorheizen)}`);
  }
  /* Container (src/ansichten/container.js, BSM-022 3d); Übersicht und Einblendungen nutzen sie über klick() */
  nurAdmin(fn) {
    return (...x2) => this.nurLesen() ? this.toast(NUR_ANSEHEN) : fn(...x2);
  }
  // wie NUR_LESEN_SPERRE für Lit-Knöpfe (.nur-admin)
  modusSetzen(x2, m3) {
    if (x2.modus === m3) return void 0;
    return this.setzen(["bereiche", x2.id, "modus"], m3, `${x2.name}: ${(MODI.find((q) => q[0] === m3) || [m3, m3])[1]}`);
  }
  boostUmschalten(x2) {
    return this.aktion("boost", { bereich: x2.id, an: !x2.boost }, !x2.boost ? `${x2.name}: schnell aufheizen` : `${x2.name}: normal weiter`);
  }
  sollSchritt(x2, dd) {
    if (this.d.e.soll_art === "gleitend") return this.aktion("soll_versch", { bereich: x2.id, d: dd }, `Soll heute ${dd > 0 ? "wärmer" : "kühler"} – ab morgen früh wieder gleitend · als „${dd > 0 ? "zu kalt" : "zu warm"}“ gemerkt`);
    return this.setzen(["bereiche", x2.id, "soll"], Math.max(5, Math.min(30, (x2.soll ?? this.d.e.soll) + dd)));
  }
  gefuehl(x2, v2) {
    return this.aktion("gefuehl", { bereich: x2.id, wert: v2 }, v2 === 0 ? "Gemerkt: passt" : `Gemerkt: ${v2 < 0 ? "zu kalt" : "zu warm"} – das Soll lernt mit`);
  }
  sollZurueck(x2) {
    return this.aktion("soll_versch_weg", { bereich: x2.id }, "Zurück auf gleitendes Soll");
  }
  geraetAktiv(b3, i7) {
    const g2 = b3.geraete[i7];
    this.invNeu();
    return this.ws({ type: "baustelle/geraet", entry_id: this.d.entry, geraet: g2.id, aktion: "status", status: g2.aktiv ? "inaktiv" : "aktiv" }, g2.aktiv ? `${g2.n} inaktiv – die Automatik lässt es aus` : `${g2.n} wieder aktiv`);
  }
  geraetAutomatik(b3, i7) {
    const g2 = b3.geraete[i7];
    return this.aktion("automatik", { geraet: g2.id }, `${g2.n}: Automatik übernimmt`);
  }
  /* BSM-034.05: Gerät oder Sensor aus Einstellungen › Geräte öffnen (Gerätedialog bzw. Einblendung „Sensor“) */
  geraetOeffnen(bid, gid) {
    const b3 = this.d.bereiche.find((x2) => x2.id === bid), i7 = b3 ? b3.geraete.findIndex((g2) => g2.id === gid) : -1;
    if (i7 < 0) return void 0;
    this.s.cid = bid;
    return this.geraetBearbeiten(b3, i7);
  }
  sensorOeffnen(bid, eid) {
    this.s.sheet = { art: "sensor", bid, eid };
    return this.neuZeichnen();
  }
  geraetBearbeiten(b3, i7) {
    const g2 = b3.geraete[i7];
    return this.unterDialog({ art: "geraet-edit", i: i7, form: {
      n: g2.n,
      schalter: g2.schalter,
      typ: g2.typ,
      bereich: b3.id,
      leistung: g2.leistungEigen || "",
      energie: g2.energieEigen || "",
      status: g2.status,
      nennKw: g2.nennKwEigen ?? null,
      zusatz: !!g2.zusatz
    } });
  }
  lernenUmschalten(x2) {
    return this.setzen(["bereiche", x2.id, "lernen"], !(x2.lern && x2.lern.an));
  }
  trocknenUmschalten(x2) {
    return this.setzen(["bereiche", x2.id, "trocknen"], !x2.trocknen);
  }
  bedarfAn(id, v2) {
    const S3 = this.s, x2 = this.d.bereiche.find((y3) => y3.id === id), boost = !!(S3.sheet && S3.sheet.art === "bedarf" && S3.sheet.boost);
    const felder = v2 === "ende" ? { bis: this.isoHeute(this.arbeitsende() || "16:30") } : v2 === "abend" ? { bis: this.isoHeute("19:00") } : { minuten: +v2 };
    const bisText = v2 === "ende" ? this.arbeitsende() : v2 === "abend" ? "19:00" : uhr(minu(this.z.JETZT) + +v2);
    S3.sheet = null;
    this.neuZeichnen();
    return this.aktion("bedarf", { bereich: x2.id, ...felder, boost }, `${x2.name} heizt bis ${bisText}`);
  }
  bedarfAuf(id) {
    const r5 = this.rechte();
    if (!r5.aendern && !(r5.aktionen || []).includes("bedarf")) return this.toast(NUR_ANSEHEN);
    this.s.sheet = { art: "bedarf", cid: id, boost: false };
    return this.neuZeichnen();
  }
  bedarfAus(id) {
    const x2 = this.d.bereiche.find((y3) => y3.id === id);
    return this.aktion("bedarf_aus", { bereich: x2.id }, `${x2.name} aus – nur Frostschutz`);
  }
  terminWeg(t5) {
    if (!t5.uid) return this.toast("Dieser Kalender nennt keine Kennung – Termin bitte im Kalender löschen");
    return this.ws({ type: "calendar/event/delete", entity_id: this.d.termineKal, uid: t5.uid }, `Termin „${t5.titel}“ gelöscht`);
  }
  /* Aktionen der Ansichten (Lit-Vorlagen rufen sie direkt, die alten über klick(); BSM-022 3c) */
  containerOeffnen(id) {
    this.s.chart = "temp";
    this.s.cZr = null;
    return this.gehe("container", id);
  }
  einstGruppe(g2) {
    this.s.evGruppe = g2;
    return this.gehe("einst");
  }
  bereichAuto(x2) {
    return this.setzen(["bereiche", x2.id, "auto"], !x2.auto);
  }
  geraetSchalten(b3, i7) {
    const g2 = b3.geraete[i7];
    return this.aktion("schalten", { geraet: g2.id, an: !g2.an }, b3.auto && this.d.e.auto ? "Handbetrieb bis zum nächsten Schaltpunkt" : void 0);
  }
  stufeSchritt(k2, schritt) {
    const e6 = this.d.e, [min2, max] = GRENZEN[k2] || [0, 1e9];
    const wert2 = Math.min(max, Math.max(min2, Math.round((e6[k2] + schritt) * 100) / 100));
    if (wert2 === e6[k2]) return void 0;
    if (k2 === "frost_aus" && wert2 <= e6.frost_temp) return this.toast("„aus über“ muss über „ein unter“ liegen");
    if (k2 === "frost_temp" && wert2 >= e6.frost_aus) return this.toast("„ein unter“ muss unter „aus über“ liegen");
    return this.setzen(PFAD[k2], wert2);
  }
  zrSchritt(ziel2, max, schritt) {
    const st = this.zrSt(ziel2);
    st.v = Math.max(0, Math.min(max, (st.v || 0) + schritt));
    this.s.zrKal = null;
    return this.neuZeichnen();
  }
  zrSetzen(ziel2, max, v2) {
    this.zrSt(ziel2).v = Math.max(0, Math.min(max, v2));
    this.s.zrKal = null;
    return this.neuZeichnen();
  }
  zrKalAuf(ziel2) {
    const S3 = this.s;
    if (S3.zrKal && S3.zrKal.ziel === ziel2) {
      S3.zrKal = null;
      return this.neuZeichnen();
    }
    const st = this.zrSt(ziel2), iso = this.zrInfo(st.zeitraum, st.v || 0).iso;
    S3.zrKal = { ziel: ziel2, j: +iso.slice(0, 4), m: +iso.slice(5, 7) - 1 };
    return this.neuZeichnen();
  }
  zrKalBlaettern(dd) {
    const k2 = this.s.zrKal;
    if (!k2) return void 0;
    const z2 = this.zrSt(k2.ziel).zeitraum;
    if (z2 === "Tag" || z2 === "Woche") {
      k2.m += dd;
      if (k2.m < 0) {
        k2.m = 11;
        k2.j--;
      }
      if (k2.m > 11) {
        k2.m = 0;
        k2.j++;
      }
    } else k2.j += dd;
    return this.neuZeichnen();
  }
  /* Verlauf (src/ansichten/verlauf.js): Protokoll der Baustelle (vollständig nachgeladen, sonst aus der Struktur) */
  protokollQuelle(d3) {
    let quelle = d3.protokoll;
    if (d3.geladen) {
      const rr = this._holen("p:" + d3.entry, () => this._hass.callWS({ type: "baustelle/protokoll", entry_id: d3.entry, filter: "alle", vor: null, limit: 200 }), 6e4);
      if (rr !== void 0) quelle = (Array.isArray(rr) ? rr : rr && rr.eintraege || []).map((p4) => this.protokollZeile(p4, this.z));
    }
    return quelle;
  }
  /* Protokoll-Auszug einer (abgeschlossenen) Baustelle; nicht geladen: die Integration kennt nur die Struktur */
  bsProtokoll(x2) {
    const prot = !x2.geladen ? [] : this._holen(`bp:${x2.entry}`, () => this._hass.callWS({ type: "baustelle/protokoll", entry_id: x2.entry, filter: "alle", vor: null, limit: 5 }), 3e5);
    return prot === void 0 ? null : (Array.isArray(prot) ? prot : prot && prot.eintraege || []).slice(0, 5);
  }
  /* Baustelle öffnen: laufende → Übersicht dieser Baustelle, abgeschlossene → Detailseite */
  baustelleOeffnen(id) {
    const x2 = this.alle.find((y3) => y3.entry === id);
    if (!x2) return;
    if (x2.aktiv) {
      this.bid = x2.entry;
      this._merken();
      this._neuBauen();
      this._vorhersageAbo();
      this._stimmung(true);
      this.s.aw = null;
      return this.gehe("uebersicht");
    }
    this.s.bs = x2.entry;
    return this.gehe("bsdetail");
  }
  baustelleAktiv(id) {
    const x2 = this.alle.find((y3) => y3.entry === id);
    if (!x2) return;
    return this.einrichten(() => this.optionenSpeichern(x2, { status: "aktiv", ende: null }), "Baustelle wieder aktiv – Automatik bleibt aus, bis du sie einschaltest").then(() => this._laden());
  }
  /* Entwicklung (src/ansichten/dev.js) */
  meldungStatus(id) {
    const d3 = this.d, m3 = (this.meldungen() || []).find((x2) => x2.id === id);
    if (!m3) return;
    delete this.cache.meldungen;
    return this.ws({ type: "baustelle/meldung", entry_id: d3.entry, aktion: "status", meldung_id: m3.id, status: this.meldungOffen(m3) ? "geschlossen" : "neu" });
  }
  meldungBild(id, i7) {
    this.s.sheet = { art: "m-bild", id, i: i7 };
    return this.neuZeichnen();
  }
  meldungWeg(id) {
    delete this.cache.meldungen;
    return this.ws({ type: "baustelle/meldung", entry_id: this.d.entry, aktion: "loeschen", meldung_id: id }, "Meldung gelöscht");
  }
  meldungenKopieren() {
    const md = this.meldungenMarkdown();
    if (typeof navigator !== "undefined" && navigator.clipboard) navigator.clipboard.writeText(md).catch(() => {
    });
    return this.toast(`${(this.meldungen() || []).length} Meldungen als Markdown kopiert`);
  }
  meldungenJson() {
    this.datei(JSON.stringify(this.meldungen() || [], null, 2), "baustelle-meldungen.json", "application/json");
    return this.toast("baustelle-meldungen.json");
  }
  diagnoseHerunterladen() {
    const d3 = this.d;
    return this.ws({ type: "auth/sign_path", path: `/api/diagnostics/config_entry/${d3.entry}` }).then((r5) => {
      if (r5 && r5.path) {
        this.herunterladen(r5.path, `baustelle-${d3.entry}.json`);
        this.toast("Diagnose wird heruntergeladen (wie in HA unter Geräte & Dienste)");
      }
    });
  }
  /* Melde-Dialog (Lit, src/melden.js): senden und schließen */
  meldungSenden() {
    const f3 = this.s.sheet.form;
    if (!f3.text.trim()) return this.toast("Bitte kurz beschreiben");
    const meldung = {
      art: f3.art,
      text: f3.text.trim(),
      kontext: f3.kontext,
      version: this.version,
      geraet: f3.geraet,
      seite: f3.stand ? { view: this.s.view, cid: this.s.cid, baustelle: this.d ? this.d.entry : null, dialog: this.s.sheet.vorher ? this.s.sheet.vorher.art : null } : null,
      ...(f3.bilder || []).length ? { bilder: f3.bilder.map((x2) => x2.url) } : {}
    };
    const fenster2 = this.s.sheet;
    if (fenster2.sendet) return;
    fenster2.sendet = true;
    delete this.cache.meldungen;
    return this.ws({ type: "baustelle/meldung", entry_id: this.d && this.d.entry, aktion: "neu", meldung }).then((r5) => {
      fenster2.sendet = false;
      if (!r5) return this.neuZeichnen();
      if (this.s.sheet === fenster2) this.s.sheet = fenster2.vorher || null;
      this.neuZeichnen();
      this.toast(`Danke – gemeldet als ${r5.ticket || "Ticket"}`);
    });
  }
  meldenZu() {
    this.s.sheet = this.s.sheet && this.s.sheet.vorher || null;
    return this.neuZeichnen();
  }
  /* Melde-Dialog öffnen (Knopf unten rechts, „Über“) */
  meldenAuf() {
    const namen = { uebersicht: "Übersicht", container: "Container", heizung: "Heizung", auswertung: "Auswertung", verlauf: "Verlauf", einst: "Einstellungen", ueber: "Über", dev: "Entwicklung", bsdetail: "Baustelle (abgeschlossen)" };
    const kontext = [namen[this.s.view] || this.s.view, this.s.view === "container" && this.b ? this.b.name : "", this.s.sheet ? `Dialog „${this.s.sheet.art}“` : ""].filter(Boolean).join(" · ");
    const breite = this.root && this.root.getBoundingClientRect ? this.root.getBoundingClientRect().width : 1e3, geraet = breite < 700 ? "Handy" : "Desktop";
    this.s.sheet = { art: "melden", vorher: this.s.sheet, form: { art: "wunsch", text: "", kontext, geraet, stand: true } };
    return this.neuZeichnen();
  }
  toast(t5, wieder = false) {
    const el = this.root && this.root.querySelector(".toast");
    if (!el || !t5) return;
    el.textContent = t5;
    el.classList.remove("an");
    void el.offsetWidth;
    el.classList.add("an");
    this.letzterToast = t5;
    if (!wieder) this._toastBis = Date.now() + 2e3;
  }
  /* Neu zeichnen (BSM-022 2b): erst den Zustand ändern, dann neuZeichnen() – Lit zeichnet im nächsten Durchlauf, mehrere
     Aufrufe werden zusammengefasst; neu = Ansicht gewechselt (oben beginnen, Einblend-Animation) */
  neuZeichnen(neu = false) {
    if (neu) this._neu = true;
    this.requestUpdate();
    return this.updateComplete;
  }
  willUpdate() {
    const evc = this.ui && this.ui.querySelector(".ev-chips");
    this._evPos = evc ? evc.scrollLeft : 0;
    if (this.ui) this.ui.classList.toggle("still", !this._neu && this._view === this.s.view);
    this._sheetVorher = this._sheetArt;
    this._view = this.s.view;
    this._sheetArt = this.s.sheet && this.s.sheet.art;
    this._mitHeizung = !this.d || this.d.funktionen.includes("heizung");
    this._mitPumpen = !!(this.d && this.d.funktionen.includes("pumpen") && this.d.bereiche.some((b3) => b3.pumpe));
    if (!this.d && !["verlauf", "bsdetail", "ueber"].includes(this.s.view)) this.s.view = "uebersicht";
    if (this.s.view === "pumpen" && !this._mitPumpen) this.s.view = "uebersicht";
    if (this.s.view === "heizung" && !this._mitHeizung) this.s.view = "uebersicht";
    if (this.s.view === "container" && !this.b) this.s.view = "uebersicht";
  }
  /* Rahmen der Seite – bleibt stehen; Scrollbereich und Einblendung behalten so Position und Fokus von selbst */
  render() {
    return b2`<div class="wurzel"><div class="app"><div class="glas-bg"><i class="k1"></i><i class="k2"></i><i class="k3"></i><div class="dunst"></div><div class="partikel"></div></div><div class="ui">${this._ui()}</div></div></div>`;
  }
  /* Inhalt: Ansicht, Navigation, Einblendung und Melden-Knopf als Lit-Vorlagen (BSM-022) */
  _ui() {
    const neu = !!this._neu, S3 = this.s;
    const tabs = [["uebersicht", "Übersicht"], ...this._mitHeizung ? [["heizung", "Heizung"]] : [], ...this._mitPumpen ? [["pumpen", "Pumpen"]] : [], ["auswertung", "Auswertung"], ["verlauf", "Verlauf"], ["einst", "⚙"]];
    const aktivTab = S3.view === "container" ? "uebersicht" : S3.view === "bsdetail" ? "verlauf" : ["ueber", "dev"].includes(S3.view) ? "einst" : S3.view;
    let seite;
    const LIT = {
      ueber: () => ueberVorlage(this),
      dev: () => devVorlage(this),
      verlauf: () => verlaufVorlage(this),
      bsdetail: () => bsdetailVorlage(this),
      pumpen: () => pumpenVorlage(this),
      heizung: () => heizungVorlage(this),
      einst: () => einstellungenVorlage(this),
      uebersicht: () => uebersichtVorlage(this),
      auswertung: () => auswertungVorlage(this),
      // Ansichten, die schon Lit-Vorlagen sind (BSM-022 3a ff.)
      container: () => this.b.pumpe ? schachtVorlage(this) : containerVorlage(this)
    };
    if (!this.roh) seite = ladenVorlage(this.fehler);
    else if (!this.d && !["verlauf", "bsdetail", "ueber"].includes(S3.view)) seite = leerVorlage(this);
    else seite = (LIT[S3.view] || LIT.uebersicht)();
    const melden = this.d ? this.d.e.melden : true;
    let sheet = "";
    if (S3.sheet && S3.sheet.art === "melden") sheet = meldenVorlage(this, S3.sheet.form);
    else if (S3.sheet && CONTAINER_EINBLENDUNGEN[S3.sheet.art]) sheet = CONTAINER_EINBLENDUNGEN[S3.sheet.art](this, S3.sheet);
    else if (S3.sheet && S3.sheet.art === "hz") sheet = hzEinblendung(this, S3.sheet);
    else if (S3.sheet && HEIZUNG_EINBLENDUNGEN[S3.sheet.art]) sheet = HEIZUNG_EINBLENDUNGEN[S3.sheet.art](this, S3.sheet);
    else if (S3.sheet && BAUSTELLE_EINBLENDUNGEN[S3.sheet.art]) sheet = BAUSTELLE_EINBLENDUNGEN[S3.sheet.art](this, S3.sheet);
    else if (S3.sheet && EINRICHTUNG_EINBLENDUNGEN[S3.sheet.art]) sheet = EINRICHTUNG_EINBLENDUNGEN[S3.sheet.art](this, S3.sheet);
    else if (S3.sheet && S3.sheet.art === "np-plug") sheet = npPlugEinblendung(this, S3.sheet);
    else if (S3.sheet && INVENTAR_EINBLENDUNGEN[S3.sheet.art]) sheet = INVENTAR_EINBLENDUNGEN[S3.sheet.art](this, S3.sheet);
    else if (S3.sheet && GERAETE_EINBLENDUNGEN[S3.sheet.art]) sheet = GERAETE_EINBLENDUNGEN[S3.sheet.art](this, S3.sheet);
    else if (S3.sheet && HEIZPERIODE_EINBLENDUNGEN[S3.sheet.art]) sheet = HEIZPERIODE_EINBLENDUNGEN[S3.sheet.art](this, S3.sheet);
    else if (S3.sheet && S3.sheet.art === "kk-katalog") sheet = katalogEinblendung(this, S3.sheet);
    else if (S3.sheet && S3.sheet.art === "aw-detail") sheet = awDetailEinblendung(this, S3.sheet);
    else if (S3.sheet && UEBERSICHT_EINBLENDUNGEN[S3.sheet.art]) sheet = UEBERSICHT_EINBLENDUNGEN[S3.sheet.art](this, S3.sheet);
    const meldenKnopf = (cls, fn) => b2`<button class="melden-knopf ${cls}" title="Fehler, Wunsch oder Anregung melden" aria-label="Melden" @click=${fn}>${o5(ICON_MELDEN)}</button>`;
    return b2`<div class="scroll">${i6(`${S3.view}:${S3.cid || ""}`, b2`<div class="seite ${neu ? "rein" : ""}">${this.versionHinweis()}${this.nurLesenHinweis()}${seite}</div>`)}</div>
      ${this._narrow ? b2`<button class="menue-knopf glas-panel" aria-label="Seitenleiste" title="Seitenleiste" @click=${() => this.dispatchEvent(new Event("hass-toggle-menu", { bubbles: true, composed: true }))}>☰</button>` : A}
      <nav class="glas-nav glas-panel ${tabs.length > 5 ? "sechs" : ""}">${tabs.map(([k2, t5]) => k2 === "einst" ? b2`<button data-v=${k2} class="${k2 === aktivTab ? "on" : ""} nav-ic" aria-label="Einstellungen" title="Einstellungen" @click=${() => this.gehe(k2)}>${o5(ICON_COG)}</button>` : b2`<button data-v=${k2} class="${k2 === aktivTab ? "on" : ""}" @click=${() => this.gehe(k2)}>${t5}</button>`)}</nav>
      <div class="schleier ${S3.sheet ? "an" : ""}" @click=${() => this.schliessen()}></div>
      <div class="sheet glas-panel ${S3.sheet ? "an" : ""}${S3.sheet && INV_BREIT.includes(S3.sheet.art) ? " breit" : ""}">${melden && this.roh && S3.sheet && S3.sheet.art !== "melden" ? meldenKnopf("im-sheet", () => this.meldenAuf()) : A}${sheet}</div>
      <div class="tip"></div><div class="toast glas-panel"></div>
      ${melden && this.roh && !S3.sheet ? meldenKnopf("glas-panel", () => this.meldenAuf()) : A}`;
  }
  updated() {
    if (!this.ui) return;
    this.ui.classList.toggle("nur-lesen", this.nurLesen());
    const sc = this.ui.querySelector(".scroll");
    if (sc && this._neu) sc.scrollTop = 0;
    const sh = this.ui.querySelector(".sheet");
    if (sh && this._sheetArt !== this._sheetVorher) sh.scrollTop = 0;
    const evc2 = this.ui.querySelector(".ev-chips");
    if (evc2) {
      evc2.scrollLeft = this._evPos;
      const on = evc2.querySelector(".chip.amber");
      if (on && (on.offsetLeft < evc2.scrollLeft || on.offsetLeft + on.offsetWidth > evc2.scrollLeft + evc2.clientWidth)) evc2.scrollLeft = Math.max(0, on.offsetLeft - (evc2.clientWidth - on.offsetWidth) / 2);
    }
    this._neu = false;
  }
  /* Lit-Teile neu zeichnen (Über, Melden) – unveränderte alte Ansichten bleiben dabei stehen */
  litNeu() {
    this.requestUpdate();
  }
  wetterJetzt() {
    const d3 = this.d, s4 = this.zustand(d3.wetterEid), w2 = d3.wetter || {};
    if (!s4) return [w2.zustand || "cloudy", d3.wetterEid ? "kein Wetter" : "Wetter wählen", w2.aussen];
    const regen = ["rainy", "pouring", "lightning-rainy", "snowy-rainy"].includes(s4.state) && zahl(w2.regen_heute) && w2.regen_heute > 0 ? ` · ${de(w2.regen_heute, w2.regen_heute % 1 ? 1 : 0)} mm` : "";
    const z2 = this.nachtWetter(s4.state);
    return [z2, (WETTER_TEXT[z2] || z2) + regen, zahl(w2.aussen) ? w2.aussen : s4.attributes.temperature];
  }
  /* FE-0005: Open-Meteo & Co. melden nachts „sunny“ bzw. „partlycloudy“ – wie die Wetterkarten von HA zeigt die Seite
     nachts Mond statt Sonne. Nacht = jetzt: sun.sun unter dem Horizont; später: vor Aufgang bzw. nach Untergang */
  nachtWetter(zustand2, ms = Date.now()) {
    if (zustand2 !== "sunny" && zustand2 !== "partlycloudy") return zustand2;
    return this.istNacht(ms) ? zustand2 === "sunny" ? "clear-night" : "partlycloudy-night" : zustand2;
  }
  istNacht(ms = Date.now()) {
    const s4 = this._hass && this._hass.states["sun.sun"];
    if (!s4) return false;
    if (Math.abs(ms - Date.now()) < 30 * 6e4) return s4.state === "below_horizon";
    const a3 = s4.attributes || {}, hm = (t5) => {
      const l4 = this.lokal(t5);
      return l4 ? +l4.slice(11, 13) * 60 + +l4.slice(14, 16) : null;
    };
    const auf = hm(a3.next_rising), ab = hm(a3.next_setting), m3 = hm(ms);
    if (auf === null || ab === null || m3 === null) return false;
    return auf < ab ? m3 < auf || m3 >= ab : m3 >= ab && m3 < auf;
  }
  /* ---- Übersicht ---- */
  pumpenWerte(d3 = this.d) {
    const st = this.statistik("Woche", 0, d3), i7 = TAGE.indexOf(d3.z.HEUTE_TAG);
    for (const b3 of d3.bereiche) if (b3.pumpe) {
      const z2 = st && this.zyklen(d3, b3, "Woche");
      b3.zyklen = z2 ? z2[i7] : null;
    }
  }
  /* ---- Container ---- */
  /* Diagramm und Kennzahlen der Container-Ansicht – eigene Funktion, damit neue Sensorwerte nur diese zwei Stellen tauschen (WU-0002) */
  containerLive(b3) {
    const d3 = this.d, heuteNr = TAGE.indexOf(this.z.HEUTE_TAG);
    const tabs = b3.pumpe ? [["pumpzeit", "Pumpzeit"], ["zyklen", "Zyklen"], ["verbrauch", "Verbrauch"]] : [["temp", "Temperatur"], ["leistung", "Leistung"], ["verbrauch", "Verbrauch"], ["heizzeit", "Heizzeit"]];
    if (!tabs.some((t5) => t5[0] === this.s.chart)) this.s.chart = tabs[0][0];
    const c4 = this.s.chart, mitVb = this.s.tempVb !== false;
    const kwh7 = this.verbrauch(d3, b3.id, "Woche"), h7 = this.heizStunden(d3, b3, "Woche"), zyk7 = b3.pumpe ? this.zyklen(d3, b3, "Woche") : null;
    const vT = this.zrV("c-Tag"), vW = this.zrV("c-Woche"), tagArt = c4 === "temp" || c4 === "leistung";
    const kwhW = vW ? this.verbrauch(d3, b3.id, "Woche", vW) : kwh7, hW = vW ? this.heizStunden(d3, b3, "Woche", vW) : h7, zykW = b3.pumpe && vW ? this.zyklen(d3, b3, "Woche", vW) : zyk7;
    let chart;
    if (c4 === "temp") {
      if (!b3.fuehler) chart = '<div class="leer">Kein Temperaturfühler zugeordnet</div>';
      else {
        const st = this.statistik("Tag", vT);
        if (!st) chart = LAEDT9;
        else {
          const inn = [...st.werte[b3.fuehler] || [], null], aussen = [...st.werte[this.eid(d3, d3.entry, "aussen")] || [], null];
          chart = linie(`t-${b3.id}-${mitVb ? "vb" : ""}`, [{ name: "Innen", v: inn }, { name: "Außen", v: aussen }], "°C", mitVb ? this.verbrauch(d3, b3.id, "Tag", vT) : null);
        }
      }
    } else if (c4 === "leistung") {
      const kw = this.verbrauch(d3, b3.id, "Tag", vT);
      chart = kw ? flaeche("kw-" + b3.id, [{ name: b3.name, farbe: BEREICH_FARBEN[b3.f % BEREICH_FARBEN.length], v: kw }], STUNDEN2, "kW", 6) + `<div class="leise">Leistung ${this.zrText("Tag", vT)} in kW, Stundenmittel</div>` : LAEDT9;
    } else if (c4 === "verbrauch") chart = kwhW ? balken("v-" + b3.id, kwhW, TAGE, "kWh") : LAEDT9;
    else if (c4 === "zyklen") chart = zykW ? balken("z-" + b3.id, zykW, TAGE, "Zyklen", 0) : LAEDT9;
    else chart = hW ? balken("h-" + b3.id, hW, TAGE, "h") : LAEDT9;
    let kennz;
    if (b3.pumpe) {
      this.mess = this.messung();
      const pz = h7 ? h7[heuteNr] : null;
      const laengster = this.mess ? Math.max(0, ...b3.geraete.flatMap((g2) => {
        const t5 = this.mess[g2.id];
        return t5 ? t5[heuteNr].an.map((q) => q[1] - q[0]) : [];
      })) : null;
      kennz = [["Zyklen heute", zyk7 ? zyk7[heuteNr] : "–"], ["Laufzeit", stdMin(pz)], ["Längster Lauf", zahl(laengster) ? `${Math.round(laengster)} min` : "–"]];
    } else kennz = [["kWh heute", kwh7 ? de(kwh7[heuteNr]) : "–"], ["Kosten", kwh7 ? `${de(kwh7[heuteNr] * d3.e.preis, 2)} €` : "–"], ["Heizzeit", h7 ? `${de(h7[heuteNr])} h` : "–"]];
    b3.zyklen = zyk7 ? zyk7[heuteNr] : null;
    return { tabs, c: c4, mitVb, chart, kennz, zr: tagArt ? ["c-Tag", "Tag", this.zrGrenze()] : ["c-Woche", "Woche", this.zrGrenze()] };
  }
  /* Neue Sensorwerte: in der Container-Ansicht neu zeichnen (Lit tauscht nur Diagramm und Kennzahlen), außer eine
     Einblendung oder ein Tooltip ist offen – dann später wieder; sonst die Ansicht neu zeichnen wie bisher */
  _liveNeu() {
    const wrap = this.root && this.root.querySelector(".c-live .chart-wrap"), knopf9 = this.root && this.root.querySelector(".c-live-kennz");
    if (this.s.view !== "container" || !this.b || !wrap || !knopf9) return this._auffrischen();
    if (this.s.sheet || (this.root.querySelector(".tip") || { classList: { contains: () => false } }).classList.contains("an")) return;
    this.neuZeichnen();
  }
  /* ============ Container-Ansicht (WU-0004, Mockup glas.html „D mit Thermostat-Rad“, abgenommen 30.09.2026) ============
     Vorlage: src/ansichten/container.js (Lit, BSM-022 3d); hier Soll, Regeltext, Rad und Diagramme als Daten/SVG */
  /* gültiges Soll eines Containers von der Integration (fest oder gleitend, mit + / −), sonst eingestellt */
  sollVon(b3) {
    return b3.sollJ && zahl(b3.sollJ.wert) ? b3.sollJ.wert : b3.soll ?? this.d.e.soll;
  }
  sollAktiv(b3) {
    return !!b3.fuehler && b3.t !== null && ["thermo", "bedarf"].includes(b3.modus);
  }
  // Soll gilt nur, wenn die Integration nach dem Fühler regelt
  cRegelText(b3) {
    const soll2 = this.sollVon(b3);
    if (b3.modus === "thermo" && b3.lern && b3.lern.an) return `🧠 Thermostat · lernend – ${b3.lern.anteil !== null ? `${b3.lern.anteil} % je ${b3.lern.zyklus_min} min · ` : ""}Nachlauf +${de(b3.lern.erwartet)} °C → aus bei ${de(b3.lern.aus_bei)} °C${b3.lern.warm && this.warmText(b3, true) ? ` · ${this.warmText(b3, true)}` : ""}${this.offenText(b3) ? ` · ${this.offenText(b3)}` : ""}`;
    return {
      thermo: `Thermostat regelt in der Heizzeit auf ${de(soll2)} °C`,
      plan: "Zeitplan – der Heizkörperthermostat regelt",
      hand: "Hand – die Automatik schaltet nicht",
      bedarf: `nur bei Bedarf${b3.fuehler ? ` · regelt auf ${de(soll2)} °C` : ""}`,
      aus: "Aus – nur Frostschutz"
    }[b3.modus] || "";
  }
  /* Thermostat-Rad (SVG): Strichkranz 5–30 °C, zwischen Ist und Soll farbig, Soll-Knopf; − + setzt die Vorlage darunter */
  cRadSvg(b3) {
    const mitSoll = this.sollAktiv(b3), soll2 = this.sollVon(b3), t5 = b3.t, dd = t5 - soll2;
    const farbe = !mitSoll ? "var(--ink)" : dd > 0.5 ? "#ff9f0a" : dd < -0.5 ? "#64a8ff" : "#30d158";
    const w2 = (x2) => Math.max(0, Math.min(1, (x2 - 5) / 25)), R2 = 78, ang = (f3) => (135 + 270 * f3) * Math.PI / 180;
    const [von, bis] = mitSoll ? [Math.min(w2(t5), w2(soll2)), Math.max(w2(t5), w2(soll2))] : [0, w2(t5)];
    const striche = [...Array(61)].map((_2, i7) => {
      const f3 = i7 / 60, a3 = ang(f3), an = f3 >= von - 1e-3 && f3 <= bis + 1e-3, lang = i7 % 10 === 0;
      return `<line x1="${(100 + (R2 - (lang ? 14 : 9)) * Math.cos(a3)).toFixed(1)}" y1="${(100 + (R2 - (lang ? 14 : 9)) * Math.sin(a3)).toFixed(1)}" x2="${(100 + R2 * Math.cos(a3)).toFixed(1)}" y2="${(100 + R2 * Math.sin(a3)).toFixed(1)}" stroke="${an ? farbe : "var(--ink2)"}" stroke-width="${an ? 3 : 1.6}" stroke-linecap="round" opacity="${an ? 1 : 0.35}"/>`;
    }).join("");
    const ks = ang(w2(soll2));
    return `<svg viewBox="0 0 200 200" role="img" aria-label="Ist ${de(t5)} °C${mitSoll ? `, Soll ${de(soll2)} °C` : ""}"><defs><radialGradient id="cRadG" cx="50%" cy="40%" r="60%"><stop offset="0" stop-color="rgba(255,255,255,.16)"/><stop offset="1" stop-color="rgba(255,255,255,.02)"/></radialGradient></defs>
      <circle cx="100" cy="100" r="${R2 - 20}" fill="url(#cRadG)" stroke="var(--panel-rand)"/>${striche}
      ${mitSoll ? `<circle cx="${(100 + R2 * Math.cos(ks)).toFixed(1)}" cy="${(100 + R2 * Math.sin(ks)).toFixed(1)}" r="8" fill="#fff" stroke="${farbe}" stroke-width="3"/>` : ""}
      <text x="100" y="80" text-anchor="middle" class="c-rad-k">IST</text><text x="100" y="112" text-anchor="middle" class="c-rad-t">${de(t5)}°</text>
      ${mitSoll ? `<text x="100" y="134" text-anchor="middle" class="c-rad-s" fill="${farbe}">Soll ${de(soll2)}°</text>` : ""}</svg>`;
  }
  /* Tagesdiagramm: Heizzeit als Band, innen/außen, Soll gestrichelt, geheizte Stunden als Balken, Jetzt-Marke */
  cTag(b3, vs = 0) {
    const d3 = this.d, innen = b3.fuehler ? this.reihe(d3, b3.fuehler, "Tag", vs) : [], aussen = this.reihe(d3, this.eid(d3, d3.entry, "aussen"), "Tag", vs), kw = this.verbrauch(d3, b3.id, "Tag", vs);
    if (!aussen || !kw || !innen) return LAEDT9;
    const W = 640, H2 = 220, L2 = 34, Rr = 10, T2 = 12, B2 = 44, mitSoll = this.sollAktiv(b3), soll2 = this.sollVon(b3), farbe = BEREICH_FARBEN[b3.f % BEREICH_FARBEN.length];
    const x2 = (h3) => L2 + (W - L2 - Rr) * h3 / 24, alle = [...innen, ...aussen, ...mitSoll ? [soll2] : []].filter(zahl);
    const lo = Math.floor(Math.min(...alle.length ? alle : [15]) - 1), hi = Math.ceil(Math.max(...alle.length ? alle : [25]) + 1), y3 = (v2) => T2 + (H2 - T2 - B2) * (1 - (v2 - lo) / (hi - lo));
    const pfad = (v2) => v2.map((t5, h3) => !zahl(t5) ? "" : `${h3 && zahl(v2[h3 - 1]) ? "L" : "M"}${x2(h3 + 0.5).toFixed(1)} ${y3(t5).toFixed(1)}`).join(" ");
    const kmax = Math.max(1, ...kw), jm = this.z.JETZT.split(":"), jetzt = +jm[0] + +jm[1] / 60;
    const tagNr = this.z.WOCHE_ISO.indexOf(plusTage(this.z.HEUTE, -vs));
    const band = (tagNr < 0 ? [] : this.heizzeiten(b3, TAGE[tagNr])).map(([von, bis]) => `<rect x="${x2(von / 60).toFixed(1)}" y="${T2}" width="${(x2(bis / 60) - x2(von / 60)).toFixed(1)}" height="${H2 - T2 - B2}" fill="var(--amber)" opacity=".12"/>`).join("");
    const raster = [lo, Math.round((lo + hi) / 2), hi].map((v2) => `<line x1="${L2}" x2="${W - Rr}" y1="${y3(v2).toFixed(1)}" y2="${y3(v2).toFixed(1)}" stroke="var(--gridc)"/><text x="${L2 - 6}" y="${(y3(v2) + 4).toFixed(1)}" text-anchor="end" class="c-achse">${v2}°</text>`).join("");
    const stunden = [0, 6, 12, 18, 24].map((h3) => `<text x="${x2(h3).toFixed(1)}" y="${H2 - 4}" text-anchor="middle" class="c-achse">${String(h3).padStart(2, "0")}</text>`).join("");
    const bars = kw.map((k2, h3) => k2 > 0 ? `<rect x="${(x2(h3) + 2).toFixed(1)}" y="${(H2 - B2 + 6 + 22 * (1 - k2 / kmax)).toFixed(1)}" width="${(x2(1) - x2(0) - 4).toFixed(1)}" height="${(22 * k2 / kmax).toFixed(1)}" rx="2" fill="${farbe}" opacity=".8"><title>${String(h3).padStart(2, "0")}:00 · ${de(k2, 2)} kWh</title></rect>` : "").join("");
    const O = this.cOeffnungLage(b3, vs, x2), unten = H2 - B2 + 28;
    const oeUnter = O.map((o6) => `<rect x="${o6.x1.toFixed(1)}" y="${T2}" width="${o6.w.toFixed(1)}" height="${unten - T2}" fill="${o6.farbe}" opacity="${o6.art === "tuer" ? 0.22 : 0.2}" class="o-band o-${o6.art}"/><rect x="${o6.x1.toFixed(1)}" y="${T2}" width="${o6.w.toFixed(1)}" height="3" fill="${o6.farbe}" opacity=".9"/>`).join("");
    const oeOben = O.map((o6) => {
      const hit = Math.max(12, o6.w);
      return `<rect class="o-hit" data-o="${esc(o6.k)}" x="${(o6.x1 + o6.w / 2 - hit / 2).toFixed(1)}" y="${T2}" width="${hit.toFixed(1)}" height="${unten - T2}" fill="transparent"><title>${esc(o6.text)}</title></rect>`;
    }).join("");
    const sel = O.find((o6) => o6.k === this._otip), mitT = O.some((o6) => o6.art === "tuer"), mitF = O.some((o6) => o6.art === "fenster");
    const tip = !sel ? "" : `<div class="o-tip" style="left:clamp(90px, ${((sel.x1 + sel.w / 2) / W * 100).toFixed(1)}%, calc(100% - 90px))"><b style="color:${sel.farbe}">${esc(sel.text)}</b>${O.filter((o6) => o6 !== sel && o6.a < sel.e && o6.e > sel.a).map((o6) => `<div class="leise">gleichzeitig: ${esc(o6.text)}</div>`).join("")}</div>`;
    return `<div class="o-wrap"><svg viewBox="0 0 ${W} ${H2}" class="c-tag-svg">${band}${oeUnter}${raster}
      ${mitSoll ? `<line x1="${L2}" x2="${W - Rr}" y1="${y3(soll2).toFixed(1)}" y2="${y3(soll2).toFixed(1)}" stroke="var(--ink)" stroke-dasharray="5 4" opacity=".6"/><text x="${W - Rr}" y="${(y3(soll2) - 5).toFixed(1)}" text-anchor="end" class="c-achse">Soll ${de(soll2)}°</text>` : ""}
      <path d="${pfad(aussen)}" fill="none" stroke="var(--ink2)" stroke-width="1.5" opacity=".7"/>${b3.fuehler ? `<path d="${pfad(innen)}" fill="none" stroke="#ff9f0a" stroke-width="2.6"/>` : ""}
      ${bars}${vs ? "" : `<line x1="${x2(jetzt).toFixed(1)}" x2="${x2(jetzt).toFixed(1)}" y1="${T2}" y2="${H2 - B2 + 28}" stroke="var(--ink)" opacity=".5"/>`}${stunden}${oeOben}</svg>${tip}</div>
      <div class="c-legende">${b3.fuehler ? '<span><i style="background:#ff9f0a"></i>innen</span>' : ""}<span><i style="background:var(--ink2)"></i>außen</span>${mitSoll ? '<span><i class="gestr"></i>Soll</span>' : ""}<span><i style="background:var(--amber);opacity:.4"></i>Heizzeit</span><span><i style="background:${farbe}"></i>geheizt (kWh je Stunde)</span>${mitT ? '<span class="o-leg"><i style="background:var(--rot);opacity:.45"></i>Tür offen</span>' : ""}${mitF ? '<span class="o-leg"><i style="background:var(--blau);opacity:.45"></i>Fenster offen</span>' : ""}</div>`;
  }
  /* Tür/Fenster offen am angezeigten Tag: fertig von der Integration (baustelle/oeffnungen, Öffnungen unter 10 s schon
     weg); ohne Kontakte kein Aufruf, solange es lädt keine Bänder. Heute kurz gültig (30 s), frühere Tage 1 h */
  cOeffnungen(b3, vs = 0) {
    const d3 = this.d;
    if (!(b3.sensoren || []).some((s4) => s4.art === "tuer" || s4.art === "fenster")) return [];
    const tag = plusTage(this.z.HEUTE, -vs);
    const r5 = this._holen(`oe:${d3.entry}:${b3.id}:${tag}`, () => this._hass.callWS({ type: "baustelle/oeffnungen", entry_id: d3.entry, bereich: b3.id, tag }), vs ? 36e5 : 3e4);
    return r5 && Array.isArray(r5.oeffnungen) ? r5.oeffnungen : [];
  }
  /* Lage der Bänder im Diagramm (nur Zeichnen): noch offen → bis „jetzt“, kurze Öffnungen mindestens 2 px breit */
  cOeffnungLage(b3, vs, x2) {
    const jm = this.z.JETZT.split(":"), jetzt = +jm[0] * 60 + +jm[1], bis1440 = (m3) => Math.min(1440, Math.max(0, m3));
    const lang = (m3) => m3 < 60 ? `${m3} min` : `${Math.floor(m3 / 60)} h${m3 % 60 ? ` ${m3 % 60} min` : ""}`;
    return this.cOeffnungen(b3, vs).map((o6) => {
      const a3 = bis1440(minu(o6.von)), e6 = o6.bis ? bis1440(minu(o6.bis)) : vs ? 1440 : Math.max(a3, jetzt), x1 = x2(a3 / 60);
      return {
        ...o6,
        a: a3,
        e: e6,
        x1,
        w: Math.max(2, x2(e6 / 60) - x1),
        k: `${o6.entity_id}@${o6.von}`,
        farbe: o6.art === "tuer" ? "var(--rot)" : "var(--blau)",
        text: o6.bis ? `${o6.name} offen ${o6.von}–${o6.bis} (${lang(o6.min)})` : `${o6.name} offen seit ${o6.von}`
      };
    });
  }
  /* Antippen bzw. Darüberfahren (Maus) eines Bands zeigt „Tür 1 offen 07:12–07:31 (19 min)“; woanders tippen schließt */
  oeTippen(e6) {
    const t5 = e6.target && e6.target.closest && e6.target.closest("[data-o]");
    this.oeSetzen(!t5 ? null : this._otip === t5.dataset.o && e6.pointerType !== "mouse" ? null : t5.dataset.o);
  }
  oeZeigen(e6) {
    if (e6.pointerType !== "mouse") return;
    const t5 = e6.target && e6.target.closest && e6.target.closest("[data-o]");
    if (t5) this.oeSetzen(t5.dataset.o);
  }
  oeWeg(e6) {
    if (e6.pointerType !== "mouse") return;
    const n4 = e6.relatedTarget;
    if (e6.target && e6.target.closest && e6.target.closest("[data-o]") && !(n4 && n4.closest && n4.closest("[data-o]"))) this.oeSetzen(null);
  }
  oeSetzen(k2) {
    if ((this._otip || null) !== k2) {
      this._otip = k2;
      this.neuZeichnen();
    }
  }
  /* Diagramm der Container-Ansicht (WU-0002) */
  containerTeile(b3) {
    const d3 = this.d, c4 = ["heute", "woche", "stunden"].includes(this.s.cvd) ? this.s.cvd : "heute";
    const vT = this.zrV("c-Tag"), vW = this.zrV("c-Woche"), kwhW = this.verbrauch(d3, b3.id, "Woche", vW), hW = this.heizStunden(d3, b3, "Woche", vW);
    const chart = c4 === "heute" ? this.cTag(b3, vT) : c4 === "woche" ? kwhW ? balken("cw-" + b3.id, kwhW, TAGE, "kWh") : LAEDT9 : hW ? balken("ch-" + b3.id, hW, TAGE, "h") : LAEDT9;
    return { c: c4, chart };
  }
  heuteText(b3) {
    const seg = this.heizzeiten(b3, this.z.HEUTE_TAG);
    return seg.length ? `Heizzeit ${uhr(seg[0][0])}–${uhr(Math.max(...seg.map((q) => q[1])))}` : this.freiText(this.z.HEUTE) || "heute keine Heizzeit";
  }
  /* ---- Heizung ---- */
  feiertage() {
    const k2 = this._kalender(this.d.optionen.feiertag_kalender);
    return k2 === null ? null : k2.filter((f3) => f3.von > this.z.HEUTE).sort((a3, b3) => a3.von.localeCompare(b3.von));
  }
  urlaube() {
    const k2 = this._kalender(this.d.optionen.urlaub_kalender);
    return k2 === null ? null : k2.filter((u3) => u3.bis >= this.z.HEUTE).sort((a3, b3) => a3.von.localeCompare(b3.von));
  }
  /* ---- Heizung als Kacheln (0.7.11): Vorlagen in src/ansichten/heizung.js (Lit, BSM-022 3d); hier Kurzwerte der Kacheln ---- */
  hzKurz() {
    const d3 = this.d, e6 = d3.e, az = this.azJetzt, C2 = d3.bereiche.filter((b3) => !b3.pumpe), H2 = this.z.HEUTE;
    const ausn = d3.ausnahmen.filter((a3) => a3.datum >= H2).sort((a3, b3) => a3.datum.localeCompare(b3.datum));
    const ft = this.feiertage(), ur = this.urlaube(), naechsterFt = ft && ft[0];
    const modi = MODI.map(([k2, t5]) => [t5, C2.filter((b3) => b3.modus === k2).length]).filter((x2) => x2[1]);
    const woche = TAGE.map((t5) => {
      const p4 = this.planTag(t5);
      return p4 && zahl(p4.ende) && zahl(p4.extra) ? Math.max(0, p4.ende - p4.extra) / 60 : 0;
    });
    const L2 = this.last(), zeiten = (t5) => az && az.tage[t5] ? az.tage[t5].join("–") : "frei";
    return {
      woche,
      plan: `${woche.filter(Boolean).length} Heiztage · ${de(summe(woche), 0)} h`,
      wann: `${L2.laufen} von ${L2.hk.length} Heizkörpern an`,
      az: az ? az.name || "Arbeitszeit" : "keine Arbeitszeit",
      az2: az ? `Mo ${zeiten("Mo")} · Fr ${zeiten("Fr")}` : "unter Arbeitszeit anlegen",
      ausn: ausn.length ? `${ausn.length} geplant` : "keine",
      ausn2: ausn.length ? `nächste ${wtag(ausn[0].datum)} ${kurzDatum(ausn[0].datum)}` : "Samstag, länger, frei …",
      regeln: `Soll ${de(e6.soll, 1)} °C`,
      regeln2: `vor ${e6.vorheizen} · nach ${e6.nachheizen} min · Grenze ${de(e6.grenze, 0)} °C · ${e6.frost ? `Frost ${de(e6.frost_temp, 1)}–${de(e6.frost_aus, 1)} °C` : "Frostschutz aus"}`,
      trocknen: `ab ${de(e6.tr_mm, 1)} mm Regen`,
      trocknen2: `+${e6.tr_laenger} min · früher ${e6.tr_frueher} min`,
      container: `${C2.length} Container`,
      container2: modi.map(([t5, n4]) => `${n4} ${t5}`).join(" · ") || "–",
      urlaub: ur === null ? "Lädt …" : ur.length ? `${ur.length} Urlaub` : "kein Urlaub",
      urlaub2: naechsterFt ? `Feiertag ${wtag(naechsterFt.von)} ${kurzDatum(naechsterFt.von)}` : e6.feiertag_frei ? "" : "an Feiertagen wird gearbeitet"
    };
  }
  sollKurve(G) {
    const W = 320, H2 = 150, L2 = 30, R2 = 8, T2 = 8, U = 18, K = G.kurve || [], ys = K.flatMap((k2) => [k2[1], k2[2]]), lo = Math.floor(Math.min(20, ...ys)), hi = Math.ceil(Math.max(lo + 3, ...ys));
    const x2 = (t5) => L2 + (t5 + 10) / 30 * (W - L2 - R2), y3 = (v2) => T2 + (1 - (v2 - lo) / (hi - lo)) * (H2 - T2 - U), soll2 = (t5) => {
      const k2 = K.find((q) => q[0] === Math.round(t5));
      return k2 ? k2[2] : G.soll;
    };
    const pfad = (i7) => K.map((k2, n4) => `${n4 ? "L" : "M"}${x2(k2[0]).toFixed(1)} ${y3(k2[i7]).toFixed(1)}`).join("");
    const raster = [...Array(hi - lo + 1)].map((_2, i7) => lo + i7).map((v2) => `<line class="gr" x1="${L2}" x2="${W - R2}" y1="${y3(v2).toFixed(1)}" y2="${y3(v2).toFixed(1)}"/><text class="ax" x="${L2 - 4}" y="${(y3(v2) + 3).toFixed(1)}" text-anchor="end">${v2}°</text>`).join("") + [-10, 0, 10, 20].map((t5) => `<text class="ax" x="${x2(t5)}" y="${H2 - 4}" text-anchor="middle">${t5}° außen</text>`).join("");
    const unter = lo < 21 ? `<rect x="${L2}" y="${y3(Math.min(21, hi)).toFixed(1)}" width="${W - L2 - R2}" height="${(H2 - U - y3(Math.min(21, hi))).toFixed(1)}" fill="rgba(255,69,58,.08)"/>` : "";
    const punkte = (G.rueck || []).map(([t5, r5]) => `<circle cx="${x2(Math.max(-10, Math.min(20, t5))).toFixed(1)}" cy="${y3(soll2(t5) - r5 * 0.35).toFixed(1)}" r="4" fill="${r5 < 0 ? "#64a8ff" : r5 > 0 ? "#ff9f0a" : "#30d158"}"/>`).join("");
    const tm2 = Math.max(-10, Math.min(20, G.aussen_mittel));
    return `<svg class="sg-kurve" viewBox="0 0 ${W} ${H2}">${raster}${unter}<path d="${pfad(1)}" fill="none" stroke="var(--ink2)" stroke-width="1.5" stroke-dasharray="5 4"/>
      <path d="${pfad(2)}" fill="none" stroke="var(--amber)" stroke-width="2.5"/>${punkte}<line x1="${x2(tm2).toFixed(1)}" x2="${x2(tm2).toFixed(1)}" y1="${T2}" y2="${H2 - U}" stroke="var(--ink)" stroke-dasharray="2 3"/>
      <circle cx="${x2(tm2).toFixed(1)}" cy="${y3(G.soll).toFixed(1)}" r="6" fill="#fff" stroke="var(--amber)" stroke-width="3"/></svg>
      <div class="sg-leg"><span><i style="background:var(--amber)"></i>Soll (mit deinem Gefühl)</span><span><i style="background:var(--ink2)"></i>Startwert nach draußen</span><span><i style="background:#64a8ff"></i>zu kalt</span><span><i style="background:#30d158"></i>passt</span><span><i style="background:#ff9f0a"></i>zu warm</span>${unter ? '<span><i style="background:rgba(255,69,58,.35)"></i>unter 21 °C</span>' : ""}</div>`;
  }
  planFensterText(p4) {
    return [
      `Arbeit ${uhr(p4.a)}–${uhr(p4.b)}, geheizt ${uhr(p4.extra)}–${uhr(p4.ende)} (mit Vor-/Nachheizen)`,
      ...(p4.eigene || []).map((f3) => `nur ${uhr(f3[0])}–${uhr(f3[1])} geheizt (eigenes Fenster, ohne Vor-/Nachheizen)`)
    ].join(" · ");
  }
  /* ---- Auswertung ---- */
  /* ============ Auswertung aus Bausteinen (WU-0005): Vorlagen, Anpassen, Layout mit Ziehen – gemerkt je Browser ============ */
  awAuswahl() {
    if (!this.s.awListe) {
      let l4 = null;
      try {
        l4 = JSON.parse(localStorage.getItem(AW_SPEICHER) || "null");
      } catch (e6) {
        l4 = null;
      }
      if (!Array.isArray(l4)) this.awVorlage("misch", false);
      else {
        const bekannt = l4.filter((x2) => x2 && (AW_BAUSTEINE[x2.k] || KK[x2.k])).map((x2) => ({ k: x2.k, an: !!x2.an, ...KK[x2.k] ? { id: x2.id, dia: x2.dia, ids: x2.ids, zr: x2.zr, art: x2.art } : {}, w: Math.min(4, Math.max(1, +x2.w || 2)), h: Math.min(6, Math.max(1, +x2.h || 2)) }));
        this.s.awListe = [...bekannt, ...Object.keys(AW_BAUSTEINE).filter((k2) => !bekannt.some((x2) => x2.k === k2)).map((k2) => ({ k: k2, an: false, w: 4, h: AW_HOEHE[k2] || 2 }))];
      }
    }
    this.s.awListe = this.s.awListe.map((x2) => x2.st ? x2 : this.awGross(x2));
    return this.s.awListe;
  }
  awVorlage(name2, merken = true) {
    const v2 = AW_VORLAGEN[name2][1], rest = Object.keys(AW_BAUSTEINE).filter((k2) => !v2.some((x2) => x2[0] === k2));
    this.s.awListe = [...v2.map(([k2, w2, h3]) => ({ k: k2, an: true, w: w2, h: h3 })), ...rest.map((k2) => ({ k: k2, an: false, w: 4, h: AW_HOEHE[k2] || 2 }))].map((x2) => this.awGross(x2));
    if (merken) this.awMerken();
  }
  awGross(x2) {
    const st = awStufe(x2.k, x2.w, x2.h);
    return { ...x2, w: st[1], h: st[2], st: st[0] };
  }
  // FE-0006: immer auf eine Stufe
  awMerken() {
    try {
      localStorage.setItem(AW_SPEICHER, JSON.stringify(this.s.awListe));
    } catch (e6) {
    }
  }
  /* „Was fällt auf“: die Integration wählt aus (logik/auswertung.erkenntnisse), die Seite macht nur den Text */
  /* FE-0006: Verbrauch als Kachel – gestapelt je Container/Baustelle oder Firma (quellen wie das große Diagramm), füllt die Kachel */
  /* ============ WU-0014: Kachel-Katalog – Kacheln S/M/L auf Übersicht ('ue', eigene Liste je Browser) und Auswertung ('aw', im Raster der Bausteine) ============ */
  kkListe(ort2) {
    if (ort2 !== "ue") return this.awAuswahl();
    if (!this.s.kkUe) {
      let l4 = null;
      try {
        l4 = JSON.parse(localStorage.getItem(KK_SPEICHER) || "null");
      } catch (e6) {
        l4 = null;
      }
      this.s.kkUe = (Array.isArray(l4) ? l4.filter((x2) => x2 && KK[x2.k]) : KK_START).map((x2) => this.kkGross({ k: x2.k, id: x2.id, dia: x2.dia, ids: x2.ids, zr: x2.zr, art: x2.art, an: true }, x2.st));
    }
    return this.s.kkUe;
  }
  kkGross(x2, st) {
    const g2 = awStufen(x2.k).find((q) => q[0] === st) || awStufe(x2.k, x2.w || 2, x2.h || 1);
    return { ...x2, w: g2[1], h: g2[2], st: g2[0] };
  }
  kkMerken(ort2) {
    if (ort2 !== "ue") return this.awMerken();
    try {
      localStorage.setItem(KK_SPEICHER, JSON.stringify(this.s.kkUe.map(({ k: k2, id, dia, st, ids, zr, art }) => ({ k: k2, id, dia, st, ids, zr, art }))));
    } catch (e6) {
    }
  }
  kkName(x2) {
    if (AW_BAUSTEINE[x2.k]) return AW_BAUSTEINE[x2.k][0];
    if (KK[x2.k] && KK[x2.k].je === "v") return `${KK[x2.k].name}${(x2.ids || []).length ? ` · ${x2.ids.map((id) => (this.d.bereiche.find((b4) => b4.id === id) || { name: id }).name).join(" / ")}` : ""}`;
    const e6 = KK[x2.k], b3 = e6 && e6.je ? this.kkB(x2) : null;
    return e6 ? `${e6.name}${b3 ? ` · ${b3.name}` : ""}` : x2.k;
  }
  kkWahlListe(k2) {
    const e6 = KK[k2], B2 = this.d.bereiche;
    return !e6 || !e6.je ? [] : e6.je === "p" ? B2.filter((b3) => b3.pumpe) : B2.filter((b3) => !b3.pumpe && (e6.je !== "f" || b3.fuehler));
  }
  kkB(x2) {
    const L2 = this.kkWahlListe(x2.k);
    return L2.find((b3) => b3.id === x2.id) || L2[0] || null;
  }
  /* Zeitraum und Werte: in der Auswertung der gewählte Zeitraum (auch für Container), auf der Übersicht Baustelle = dieser Monat, Container = heute */
  kkCtx(ort2) {
    if (ort2 === "aw") {
      const z2 = this.s.aw.zeitraum, v2 = this.zrV("aw"), A3 = this.awDaten(z2, v2);
      return { ort: ort2, A: A3, S: A3 && A3.summen || {}, z: z2, v: v2, zc: z2, vc: v2 };
    }
    const A2 = this.awDaten("Monat", 0, "diese");
    return { ort: ort2, A: A2, S: A2 && A2.summen || {}, z: "Monat", v: 0, zc: "Tag", vc: 0 };
  }
  kkSumme(c4) {
    const L2 = c4.ort === "aw" && this.s.awScope === "alle" ? this.laufende() : [this.d], r5 = L2.map((l4) => this.verbrauch(l4, null, c4.z, c4.v));
    return r5.some((x2) => !x2) ? null : addieren(r5);
  }
  kkDaten(x2, b3, c4) {
    const d3 = this.d, S3 = c4.S, A2 = c4.A, p4 = d3.e.preis, f3 = (v2, k2 = 1) => zahl(v2) ? de(v2, k2) : "–", farbe = b3 ? BEREICH_FARBEN[b3.f % BEREICH_FARBEN.length] : "var(--s1)";
    const pfeil = (dl) => zahl(dl) ? `<em class="${dl > 0 ? "mehr" : "weniger"}">${dl > 0 ? "▲" : "▼"} ${Math.abs(dl)} %</em>` : "";
    const zr = this.zeitraum(c4.z, c4.v), zrc = this.zeitraum(c4.zc, c4.vc), wann2 = this.zrText(c4.z, c4.v), wannC = this.zrText(c4.zc, c4.vc);
    const lab = (z2, labels) => z2 === "Tag" ? labels.map((h3, i7) => i7 % 6 ? "" : h3) : z2 === "Woche" ? TAGE : labels;
    const heuteNr = TAGE.indexOf(this.z.HEUTE_TAG), soll2 = b3 ? this.sollVon(b3) : null;
    switch (x2.k) {
      case "b-kosten": {
        const r5 = this.kkSumme(c4);
        return {
          zahl: zahl(S3.eur) ? de(S3.eur, 0) : "–",
          einh: "€",
          wo: wann2,
          vgl: `${f3(S3.kwh, 0)} kWh${zahl((S3.veraenderung || {}).kwh) ? ` ${pfeil(S3.veraenderung.kwh)} zu ${this.zrVgl(c4.z, c4.v)}` : ""}`,
          funke: r5,
          kennz: [["Kosten", `${f3(S3.eur, 2)} €`], ["Verbrauch", `${f3(S3.kwh, 0)} kWh`], ["Heizzeit", `${f3(S3.heizzeit, 0)} h`], ["Pumpzeit", `${f3(S3.pumpzeit, 1)} h`]],
          dia: (id, w2) => r5 ? flaeche(id, [{ name: "Verbrauch", farbe: "var(--s1)", v: r5 }], zr.labels, "kWh", KK_JEDES[c4.z], null, w2) : ""
        };
      }
      case "b-gespart": {
        const oa = S3.ohne_automatik, G = A2 && A2.gespart_reihen, su = G && G.summe || {}, je = c4.z === "Tag" ? "je Stunde" : c4.z === "Jahr" ? "je Monat" : "je Tag";
        const gruen = "var(--s3)", mini = G && funke(G.gespart_eur, gruen);
        return {
          zahl: oa ? de(oa.gespart_eur, oa.gespart_eur < 10 ? 2 : 0) : "–",
          einh: "€",
          wo: wann2,
          farbe: gruen,
          funke: G && G.gespart_eur,
          vgl: oa ? `${f3(su.gespart_kwh, 0)} kWh · ${f3(oa.prozent, 0)} % weniger als rund um die Uhr (${f3(oa.ohne_eur, 0)} €)${oa.hinweis ? ` · ${oa.hinweis}` : ""}` : "noch keine Werte",
          mini: mini ? `${mini}<span class="kk-wo kk-mini-t">gespart ${je}</span>` : "",
          kennz: [["gespart", `${f3(oa && oa.gespart_eur, 0)} €`], ["gespart", `${f3(su.gespart_kwh, 0)} kWh`], ["ohne (24/7)", `${f3(oa && oa.ohne_eur, 0)} €`], ["mit Automatik", `${f3(S3.eur, 0)} €`]],
          dia: (id, w2) => G && oa ? luecke(id, G.mit_eur, G.ohne_eur, G.gespart_eur, zr.labels, KK_JEDES[c4.z], w2) : ""
        };
      }
      case "b-hoch": {
        const h3 = A2 && A2.hochrechnung || {};
        return {
          zahl: zahl(h3.mit_eur) ? `≈ ${de(h3.mit_eur, 0)}` : "–",
          einh: "€",
          wo: "bis Ende Heizperiode",
          vgl: `bisher ${f3(h3.bisher_eur, 0)} € · ohne Automatik ${f3(h3.ohne_eur, 0)} €${h3.ohne_hinweis ? ` (${h3.ohne_hinweis})` : ""}`,
          mini: kkBalken([["bisher", h3.bisher_eur, `${f3(h3.bisher_eur, 0)} €`, "var(--s3)"], ["mit", h3.mit_eur, `${f3(h3.mit_eur, 0)} €`, "var(--s1)"], ["ohne", h3.ohne_eur, `${f3(h3.ohne_eur, 0)} €`, "var(--s2)"]]),
          kennz: [["bisher", `${f3(h3.bisher_kwh, 0)} kWh`], ["mit Automatik", `${f3(h3.mit_kwh, 0)} kWh`], ["ohne (24/7)", `${f3(h3.ohne_kwh, 0)} kWh`], ["gespart ≈", `${f3(h3.gespart_eur, 0)} €`]],
          dia: (id) => zahl(h3.mit_eur) ? balken(id, [h3.bisher_eur, h3.mit_eur, h3.ohne_eur], ["bisher", "mit", "ohne"], "€", 0) : ""
        };
      }
      case "b-wetter": {
        const W = A2 && A2.wetter || {}, g2 = W.gerade, P2 = W.punkte || [];
        return {
          zahl: g2 && g2.k < 0 ? `+${de(-g2.k, 1)}` : "–",
          einh: "kWh/°C",
          wo: "je Grad kälter am Tag",
          vgl: g2 ? `≈ ${f3(g2.eur_je_grad, 2)} € je Grad${zahl(g2.null0) ? ` · kaum geheizt ab ${de(g2.null0, 0)} °C` : ""}` : W.stand === "lernt" ? `lernt noch (${W.tage || 0} ganze Tage)` : "noch keine Signatur",
          kennz: [["je Grad kälter", g2 ? `+${f3(-g2.k, 1)} kWh` : "–"], ["je Grad", `${f3(g2 && g2.eur_je_grad, 2)} €`], ["ganze Tage", `${P2.length}`], ["kaum geheizt ab", `${f3(g2 && g2.null0, 0)} °C`]],
          dia: (id) => g2 ? streu(id, P2, g2.k, g2.d0, g2.grenze ?? null) : ""
        };
      }
      case "b-strom": {
        const L2 = this.last(), an = d3.e.staffel && L2.A.length;
        return {
          zahl: an ? de(L2.gesamt, 1) : "–",
          einh: "kW",
          wo: an ? `${L2.A.length} ${L2.A.length === 1 ? "Anschluss" : "Anschlüsse"}` : "Staffelung aus",
          vgl: an ? `von ${de(L2.grenze, 1)} kW nutzbar · ${L2.laufen} Heizkörper an${L2.warten ? ` · ${L2.warten} wartet` : ""}` : "keine Anschlüsse",
          mini: an ? this.stromBalken(L2, true) : "",
          kennz: [["Heizung", `${f3(L2.heiz, 1)} kW`], ["Pumpen", `${f3(L2.pumpe, 2)} kW`], ["Sonstiges", `${f3(L2.sonst, 1)} kW`], ["Reserve", `${f3(L2.reserve, 1)} kW`]],
          dia: () => an ? `<div class="kk-dia-in">${L2.A.map((a3) => `<div class="kk-dz eins"><span>${esc(a3.name)} · ${de(a3.heiz + a3.pumpe + a3.sonst, 1)} von ${de(a3.grenze, 1)} kW</span>${this.stromBalken({ ...a3, grenze: a3.grenze }, true)}</div>`).join("")}</div>` : "",
          zeilen: true
        };
      }
      case "b-oel": {
        const T2 = A2 && A2.typ || {}, er = T2.ersparnis, o6 = T2.oelradiator || {}, kv = T2.konvektor || {};
        return {
          zahl: zahl(T2.weniger) ? `${T2.weniger > 0 ? "−" : "+"}${de(Math.abs(T2.weniger), 0)}` : "–",
          einh: "%",
          wo: "Ölradiator gegen Konvektor",
          vgl: er ? `${de(Math.abs(er.erspart_eur), 2)} € ${er.erspart_eur < 0 ? "mehr" : "erspart"} · ${wann2}` : "noch nicht vergleichbar",
          funke: er && er.oel,
          kennz: [["Öl kWh/Gradstunde", f3(o6.kwh_gradh, 3)], ["Konv. kWh/Gradstunde", f3(kv.kwh_gradh, 3)], [er && er.erspart_eur < 0 ? "mehr" : "erspart", `${f3(er && Math.abs(er.erspart_eur), 2)} €`], ["Aufheizen Öl", `${f3(o6.auf, 1)} °C/h`]],
          dia: (id) => er ? flaeche(id, [{ name: "Ölradiatoren", farbe: "var(--s1)", v: er.oel }], zr.labels, "kWh", KK_JEDES[c4.z], { name: "mit Konvektoren", v: er.konvektor }) : ""
        };
      }
      case "b-geraete": {
        const Lk = d3.r && d3.r.geraete_links || {}, st = (eid) => this._hass && this._hass.states[eid];
        const G = d3.bereiche.flatMap((bb) => bb.geraete.map((g2) => {
          const l4 = Lk[g2.schalter] || {}, s4 = l4.signal && st(l4.signal);
          return { bb, g: g2, db: s4 && zahl(s4.state) ? +s4.state : null };
        }));
        const weg = G.filter((q) => q.g.erreichbar === false), mit = G.filter((q) => q.g.erreichbar !== false && q.db !== null), schwach = mit.filter((q) => sigStufe(q.db) <= 2);
        const schlecht = mit.length ? mit.reduce((m3, q) => q.db < m3.db ? q : m3) : null;
        return {
          zahl: `${G.length - weg.length}/${G.length}`,
          einh: "",
          wo: "Geräte erreichbar",
          vgl: `${weg.length} nicht erreichbar${schwach.length ? ` · ${schwach.length} mit schwachem Signal` : ""}`,
          mini: `${schlecht ? `<div class="kk-vgl">schwächstes ${sigHtml(schlecht.db)} ${de(schlecht.db, 0)} dBm · ${esc(schlecht.g.n)}</div>` : ""}${weg.slice(0, 2).map((q) => `<div class="kk-vgl rot-t">● ${esc(q.g.n)} · ${esc(q.bb.name)}</div>`).join("")}`,
          kennz: [["erreichbar", `${G.length - weg.length}`], ["nicht erreichbar", `${weg.length}`], ["schwaches Signal", `${schwach.length}`], ["schwächstes", schlecht ? `${de(schlecht.db, 0)} dBm` : "–"]],
          dia: () => `<div class="kk-dia-in">${G.slice(0, 8).map((q) => `<div class="kk-dz"><span>${esc(q.g.n)}</span><span>${q.g.erreichbar === false ? '<b class="rot-t">nicht erreichbar</b>' : q.db !== null ? `${sigHtml(q.db)} ${de(q.db, 0)} dBm` : "kein Signalwert"} · ${esc(q.bb.name)}</span></div>`).join("")}${G.length > 8 ? `<div class="kk-vgl">+ ${G.length - 8} weitere</div>` : ""}</div>`,
          zeilen: true
        };
      }
      case "b-wer": {
        const R2 = A2 && A2.rangliste || [], Z2 = R2.map((r5) => {
          const bb = d3.bereiche.find((q) => q.id === r5.bereich);
          return [r5.name, r5.kwh, `${f3(r5.kwh, 0)} kWh`, bb ? BEREICH_FARBEN[bb.f % BEREICH_FARBEN.length] : "var(--ink2)"];
        });
        return {
          zahl: R2[0] ? de(R2[0].kwh, 0) : "–",
          einh: "kWh",
          unter: R2[0] ? esc(R2[0].name) : "",
          wo: wann2,
          vgl: R2[0] ? `${esc(R2[0].name)} vorne · ${f3(R2[0].eur, 2)} €` : "noch kein Verbrauch",
          mini: kkBalken(Z2, 3),
          kennz: R2.slice(0, 4).map((r5) => [r5.name, `${f3(r5.kwh, 0)} kWh · ${f3(r5.eur, 0)} €`]),
          dia: () => `<div class="kk-dia-in">${kkBalken(Z2, 7)}</div>`,
          zeilen: true
        };
      }
      case "c-temp": {
        const st = this.statistik("Tag"), inn = st && (st.werte[b3.fuehler] || []), aus = st && (st.werte[this.eid(d3, d3.entry, "aussen")] || []), [, , wtemp] = this.wetterJetzt();
        return {
          zahl: f3(b3.t),
          einh: "°C",
          wo: "jetzt",
          vgl: `Soll ${f3(soll2, 0)} °C · außen ${f3(wtemp)} °C`,
          funke: inn,
          farbe,
          kennz: [["innen jetzt", `${f3(b3.t)} °C`], ["Soll", `${f3(soll2, 0)} °C`], ["außen jetzt", `${f3(wtemp)} °C`], ["Zustand", esc(TEXT(b3))]],
          dia: (id) => inn ? linie(id, [{ name: "Innen", v: [...inn, null] }, { name: "Außen", v: [...aus || [], null] }], "°C") : ""
        };
      }
      case "c-leistung": {
        const r5 = this.verbrauch(d3, b3.id, "Tag"), an = b3.geraete.filter((g2) => g2.an).length;
        return {
          zahl: de(kwVon(b3), 2),
          einh: "kW",
          wo: "jetzt",
          vgl: `${an} von ${b3.geraete.length} Geräten an`,
          funke: r5 && r5.slice(0, +this.z.JETZT.slice(0, 2) + 1),
          farbe,
          kennz: [["jetzt", `${de(kwVon(b3), 2)} kW`], ["Geräte an", `${an}/${b3.geraete.length}`], ["heute", `${f3(r5 && summe(r5))} kWh`], ["Zustand", esc(TEXT(b3))]],
          dia: (id) => r5 ? flaeche(id, [{ name: b3.name, farbe, v: r5 }], STUNDEN2, "kW", 6) : ""
        };
      }
      case "c-verbrauch":
      case "c-kosten": {
        const eur2 = x2.k === "c-kosten", fk = eur2 ? p4 : 1, r5 = this.verbrauch(d3, b3.id, c4.zc, c4.vc), g2 = this.verbrauch(d3, b3.id, c4.zc, c4.vc + 1);
        const su = r5 && summe(r5), sg = g2 && summe(g2), e1 = eur2 ? "€" : "kWh", k1 = eur2 ? 2 : 1;
        return {
          zahl: f3(zahl(su) ? su * fk : null, k1),
          einh: e1,
          wo: wannC,
          vgl: eur2 ? `${f3(su)} kWh × ${de(p4, 2)} €/kWh` : `${this.zrVgl(c4.zc, c4.vc)} ${f3(sg)} kWh`,
          funke: r5 && r5.map((v2) => (v2 || 0) * fk),
          farbe,
          kennz: eur2 ? [[wannC, `${f3(zahl(su) ? su * p4 : null, 2)} €`], ["kWh", f3(su)], ["Strompreis", `${de(p4, 2)} €/kWh`], [this.zrVgl(c4.zc, c4.vc), `${f3(zahl(sg) ? sg * p4 : null, 2)} €`]] : [[wannC, `${f3(su)} kWh`], [this.zrVgl(c4.zc, c4.vc), `${f3(sg)} kWh`], ["Kosten", `${f3(zahl(su) ? su * p4 : null, 2)} €`], ["Heizzeit", ((h3) => h3 ? stdMin(summe(h3)) : "–")(this.heizStunden(d3, b3, c4.zc, c4.vc))]],
          dia: (id) => r5 ? balken(id, r5.map((v2) => (v2 || 0) * fk), lab(c4.zc, zrc.labels), e1, eur2 ? 2 : 1) : ""
        };
      }
      case "c-heizzeit": {
        const r5 = this.heizStunden(d3, b3, c4.zc, c4.vc), rs = this.reihe(d3, this.eid(d3, b3.id, "heizzeit_strom"), c4.zc, c4.vc), su = r5 && summe(r5), ss = rs && rs.some(zahl) ? summe(rs.map((v2) => v2 || 0)) : null;
        return {
          zahl: stdMin(su),
          einh: "",
          wo: wannC,
          vgl: zahl(ss) ? `tatsächlich geheizt ${stdMin(ss)}` : esc(this.heuteText(b3)),
          funke: r5,
          farbe,
          kennz: [["eingeschaltet", stdMin(su)], ["tatsächlich geheizt", stdMin(ss)], ["% davon mit Strom", zahl(ss) && su > 0 ? `${de(ss / su * 100, 0)} %` : "–"], ["Plan heute", esc(this.heuteText(b3)).replace(/^Heizzeit /, "")]],
          dia: (id) => r5 ? balken(id, r5, lab(c4.zc, zrc.labels), "h") : ""
        };
      }
      case "c-ohne": {
        const o6 = b3.geraete.some((g2) => g2.heizer) ? this._holen(`oh:${d3.entry}:${b3.id}:${c4.zc}:${c4.vc}:geraet`, () => this._hass.callWS({ type: "baustelle/ohne", entry_id: d3.entry, bereich: b3.id, zeitraum: c4.zc, versatz: c4.vc, basis: "geraet" })) : null;
        const e6 = o6 && o6.ergebnis, r5 = this.verbrauch(d3, b3.id, c4.zc, c4.vc);
        return {
          zahl: e6 ? de(e6.gespart_eur, 2) : "–",
          einh: "€",
          wo: wannC,
          vgl: !o6 ? o6 === null ? "kein Heizkörper" : "lädt …" : e6 ? `gespart · ${f3(e6.prozent, 0)} % weniger als 24/7` : "noch keine Werte",
          farbe: "var(--s3)",
          funke: r5,
          kennz: [["mit Automatik", `${f3(o6 && o6.kwh)} kWh`], ["ohne (24/7)", `${f3(o6 && o6.ohne_kwh)} kWh`], ["gespart", `${f3(e6 && e6.gespart_eur, 2)} €`], ["Heizkörper", `${f3(o6 && o6.kw, 2)} kW`]],
          dia: (id) => r5 && o6 && o6.reihe ? flaeche(id, [{ name: "mit Automatik", farbe, v: r5 }], zrc.labels, "kWh", KK_JEDES[c4.zc], { name: "ohne Automatik", v: o6.reihe }) : ""
        };
      }
      case "c-warm": {
        const w2 = b3.lern && b3.lern.warm, pl = w2 && w2.plan;
        const seg = pl ? [[pl.start, pl.ziel, "vor"], [pl.a, pl.b, "heiz"]] : [];
        return {
          zahl: pl ? uhr(pl.start) : "–",
          einh: pl ? "Uhr" : "",
          wo: "heizt heute ab",
          vgl: !w2 ? "nur lernend im Modus Thermostat" : !pl ? "heute frei" : w2.gelernt ? `${f3(w2.soll, 0)} °C um ${uhr(pl.ziel)} · ${f3(w2.rate, 1)} °C/h gelernt` : `lernt noch (${w2.n} von ${w2.n_noetig})`,
          mini: pl ? `${this.zeitstrahlSeg(seg, true)}<div class="kk-vgl">${uhr(pl.start)} → ${uhr(pl.ziel)}${zahl(w2.aufheiz_min) ? ` · ${de(w2.aufheiz_min, 0)} min` : ""}</div>` : "",
          kennz: [["heizt ab", pl ? uhr(pl.start) : "–"], ["warm um", pl ? uhr(pl.ziel) : "–"], ["Aufheizen", w2 && zahl(w2.rate) ? `${de(w2.rate, 1)} °C/h` : "–"], ["Aufheizdauer", w2 && zahl(w2.aufheiz_min) ? `${de(w2.aufheiz_min, 0)} min` : "–"]],
          dia: () => pl ? `<div class="kk-dia-in"><div class="kk-dz"><span>heute</span>${this.zeitstrahlSeg(seg, true)}</div><div class="kk-vgl">${this.warmText(b3)}</div></div>` : "",
          zeilen: true
        };
      }
      case "p-pumpzeit": {
        const r5 = this.heizStunden(d3, b3, c4.zc, c4.vc), zy = this.zyklen(d3, b3, c4.zc, c4.vc), su = r5 && summe(r5);
        return {
          zahl: stdMin(su),
          einh: "",
          wo: wannC,
          vgl: `${zy ? summe(zy) : "–"} Zyklen · ${b3.geraete.filter((g2) => g2.an).length} läuft jetzt`,
          funke: r5,
          farbe: "var(--blau)",
          kennz: [[wannC, stdMin(su)], ["Zyklen", `${zy ? summe(zy) : "–"}`], ["Pumpen", `${b3.geraete.filter((g2) => g2.rolle === "pumpe").length}`], ["läuft jetzt", `${b3.geraete.filter((g2) => g2.an).length}`]],
          dia: (id) => r5 ? balken(id, r5, lab(c4.zc, zrc.labels), "h") : ""
        };
      }
      case "p-zyklen": {
        const zy = this.zyklen(d3, b3, c4.zc, c4.vc), zv = this.zyklen(d3, b3, c4.zc, c4.vc + 1), w2 = this.zyklen(d3, b3, "Woche");
        return {
          zahl: zy ? `${summe(zy)}` : "–",
          einh: "Zyklen",
          wo: wannC,
          vgl: zv ? `${this.zrVgl(c4.zc, c4.vc)} ${summe(zv)}` : "",
          funke: w2 && w2.slice(0, heuteNr + 1),
          farbe: "var(--blau)",
          kennz: [[wannC, `${zy ? summe(zy) : "–"}`], [this.zrVgl(c4.zc, c4.vc), `${zv ? summe(zv) : "–"}`], ["diese Woche", `${w2 ? summe(w2) : "–"}`], ["heute", `${w2 ? w2[heuteNr] : "–"}`]],
          dia: (id) => zy ? balken(id, zy, lab(c4.zc, zrc.labels), "Zyklen", 0) : ""
        };
      }
      case "h-plan": {
        const pl = this.planTag(this.z.HEUTE_TAG);
        return {
          zahl: pl ? `${uhr(pl.vor)}–${uhr(pl.ende)}` : "frei",
          einh: "",
          wo: "heute",
          vgl: esc(this.statusText()) + (pl && pl.gruende && pl.gruende.length ? ` · ${esc(pl.gruende[0])}` : ""),
          mini: `${this.zeitstrahl(pl, true)}<div class="tl-achse"><span>4</span><span>12</span><span>20</span></div>`,
          kennz: [["Vorheizen ab", pl ? uhr(pl.vor) : "–"], ["Arbeitszeit", pl ? `${uhr(pl.a)}–${uhr(pl.b)}` : "–"], ["Nachheizen bis", pl ? uhr(pl.nach) : "–"], ["Trocknen bis", pl && pl.ende > pl.nach ? uhr(pl.ende) : "–"]],
          dia: () => `<div class="kk-dia-in">${this.z.WOCHE.map(([t5, dt]) => `<div class="kk-dz ${t5 === this.z.HEUTE_TAG ? "heute" : ""}"><span>${t5} ${dt.slice(0, 2)}.</span>${this.zeitstrahl(this.planTag(t5), t5 === this.z.HEUTE_TAG)}</div>`).join("")}</div>`,
          zeilen: true
        };
      }
      case "h-wann": {
        const C2 = d3.bereiche.filter((bb) => !bb.pumpe), Z2 = C2.map((bb) => ({ bb, seg: this.heizzeiten(bb, this.z.HEUTE_TAG) })), mit = Z2.filter((q) => q.seg.length);
        const von = mit.length ? Math.min(...mit.map((q) => q.seg[0][0])) : null, bis = mit.length ? Math.max(...mit.flatMap((q) => q.seg.map((s4) => s4[1]))) : null;
        return {
          zahl: `${mit.length}`,
          einh: `von ${C2.length}`,
          wo: "Container heizen heute",
          vgl: mit.length ? `erster ab ${uhr(von)} · letzter bis ${uhr(bis)}` : "heute keine Heizzeit",
          mini: mit.slice(0, 3).map((q) => `<div class="kk-dz schmal"><span>${esc(q.bb.name)}</span>${this.zeitstrahlSeg(q.seg, true)}</div>`).join(""),
          kennz: [["heizen heute", `${mit.length} von ${C2.length}`], ["erster ab", zahl(von) ? uhr(von) : "–"], ["letzter bis", zahl(bis) ? uhr(bis) : "–"], ["heizen jetzt", `${C2.filter((bb) => bb.z === "heizt" || bb.z === "trocknen").length}`]],
          dia: () => `<div class="kk-dia-in">${Z2.slice(0, 7).map((q) => `<div class="kk-dz"><span>${esc(q.bb.name)}</span>${this.zeitstrahlSeg(q.seg, true)}</div>`).join("")}</div>`,
          zeilen: true
        };
      }
    }
    return null;
  }
  /* eine Kachel in S / M / L (L mit Diagramm oder vier Kennzahlen); ort 'kat' = Vorschau im Katalog */
  /* Raster mit Layout (ziehen, Größe, ✕, 📈) – Auswertung und Übersicht gleich */
  /* Katalog (src/ansichten/kacheln.js): Einträge je Ort */
  kkEintraege(ort2) {
    const E2 = Object.entries(KK).filter(([k2, e6]) => !e6.je || this.kkWahlListe(k2).length).map(([k2, e6]) => ({ k: k2, ...e6, stufen: ST_KACHEL }));
    if (ort2 !== "aw") return E2;
    return [...E2, ...Object.entries(AW_BAUSTEINE).filter(([k2]) => !k2.startsWith("k-")).map(([k2, [name2, text2]]) => ({ k: k2, ber: "auswertung", ic: "📊", name: name2, text: text2, such: "", stufen: awStufen(k2), baustein: true }))];
  }
  kkHinzu(s4) {
    const e6 = this.kkEintraege(s4.ort).find((y3) => y3.k === s4.k);
    if (!e6) return;
    const L2 = this.kkListe(s4.ort);
    if (e6.baustein) {
      const x2 = L2.find((y3) => y3.k === e6.k);
      Object.assign(x2, this.kkGross(x2, s4.st), { an: true });
    } else if (e6.je === "v") L2.push(this.kkGross({ k: e6.k, an: true, ids: [...s4.ids], zr: s4.zr, art: s4.vgArt || "balken", ...s4.st === "L" ? { dia: !!s4.dia } : {} }, s4.st));
    else L2.push(this.kkGross({ k: e6.k, an: true, ...e6.je ? { id: s4.id } : {}, ...s4.st === "L" ? { dia: !!s4.dia } : {} }, s4.st));
    this.kkMerken(s4.ort);
    const neu = { k: e6.k, id: e6.je && e6.je !== "v" ? s4.id : void 0, ids: e6.je === "v" ? s4.ids : void 0 };
    this.s.kkFrisch = `${s4.ort}:${neu.k}:${neu.id || ""}`;
    clearTimeout(this._kkFrisch);
    this._kkFrisch = setTimeout(() => {
      this.s.kkFrisch = null;
    }, 2e3);
    this.s.sheet = null;
    this.s.kkLayout = false;
    this.s.awLayout = false;
    this.s.awBearb = false;
    this.neuZeichnen();
    this.toast(`Kachel „${this.kkName(neu)}“ (${s4.st}) hinzugefügt`);
  }
  /* WU-0017: Vergleich kWh / Kosten – 2 bis 4 Container gegenüber (Mockup vergleich-kacheln.html, abgenommen 02.10.2026):
     Summen aus der Statistik wie die anderen Container-Kacheln; Unterschied in kWh bzw. € und % zum sparsamsten */
  vgWerte(x2, c4) {
    const d3 = this.d, z2 = c4.ort === "aw" ? c4.zc : x2.zr || "Tag", v2 = c4.ort === "aw" ? c4.vc : 0, eur2 = x2.k === "v-eur", f3 = eur2 ? d3.e.preis : 1;
    const R2 = (x2.ids || []).map((id) => d3.bereiche.find((b3) => b3.id === id)).filter(Boolean).map((b3) => {
      const r5 = this.verbrauch(d3, b3.id, z2, v2), h3 = this.heizStunden(d3, b3, z2, v2);
      return { b: b3, r: r5 && r5.map((q) => (q || 0) * f3), su: r5 ? summe(r5) * f3 : null, kwh: r5 ? summe(r5) : null, h: h3 ? summe(h3) : null };
    });
    const ok = R2.filter((q) => zahl(q.su)), min2 = ok.length ? Math.min(...ok.map((q) => q.su)) : null, max = ok.length ? Math.max(...ok.map((q) => q.su)) : null;
    return { z: z2, v: v2, eur: eur2, R: R2, zr: this.zeitraum(z2, v2), wann: this.zrText(z2, v2), min: min2, vorne: ok.find((q) => q.su === max), hinten: ok.find((q) => q.su === min2) };
  }
  vgDia(W0, art) {
    const R2 = W0.R.filter((q) => q.r);
    if (!R2.length) return "";
    const n4 = W0.zr.labels.length, W = 320, H2 = 150, L2 = 34, Rr = 8, T2 = 8, U = 18, hi = Math.max(...R2.flatMap((q) => q.r), 0.01) * 1.1;
    const y3 = (v2) => T2 + (1 - v2 / hi) * (H2 - T2 - U), bw = (W - L2 - Rr) / n4, jedes = { Tag: 6, Woche: 1, Monat: 7 }[W0.z] || 3, fb2 = (b3) => BEREICH_FARBEN[b3.f % BEREICH_FARBEN.length];
    const stufe = hi > 200 ? 100 : hi > 40 ? 20 : hi > 12 ? 5 : hi > 4 ? 2 : hi > 1.5 ? 0.5 : 0.2;
    const raster = [...Array(Math.floor(hi / stufe) + 1)].map((_2, q) => q * stufe).map((v2) => `<line class="gr" x1="${L2}" x2="${W - Rr}" y1="${y3(v2).toFixed(1)}" y2="${y3(v2).toFixed(1)}"/><text class="ax" x="${L2 - 4}" y="${(y3(v2) + 3).toFixed(1)}" text-anchor="end">${de(v2, stufe < 1 ? 1 : 0)}</text>`).join("");
    const achse = W0.zr.labels.map((t5, i7) => i7 % jedes ? "" : `<text class="ax" x="${(L2 + i7 * bw + bw / 2).toFixed(1)}" y="${H2 - 4}" text-anchor="middle">${esc(String(t5))}</text>`).join("");
    const inhalt = art === "linien" ? R2.map((q) => `<path d="${q.r.map((v2, i7) => `${i7 ? "L" : "M"}${(L2 + i7 * bw + bw / 2).toFixed(1)} ${y3(v2).toFixed(1)}`).join("")}" fill="none" stroke="${fb2(q.b)}" stroke-width="2.2" stroke-linejoin="round"/>`).join("") : W0.zr.labels.map((_2, i7) => R2.map((q, k2) => {
      const w2 = bw * 0.8 / R2.length, xx = L2 + i7 * bw + bw * 0.1 + k2 * w2, v2 = q.r[i7] || 0;
      return v2 > 0 ? `<rect x="${xx.toFixed(1)}" y="${y3(v2).toFixed(1)}" width="${Math.max(1, w2 - 0.5).toFixed(1)}" height="${(y3(0) - y3(v2)).toFixed(1)}" fill="${fb2(q.b)}" rx="1"/>` : "";
    }).join("")).join("");
    return `<svg class="vg-svg" viewBox="0 0 ${W} ${H2}" preserveAspectRatio="xMidYMid meet">${raster}${achse}${inhalt}</svg>`;
  }
  /* Antippen: die passende vorhandene Ansicht oder Einblendung der Seite */
  kkAuf(x2, ort2) {
    const S3 = this.s, c4 = this.kkCtx(ort2), e6 = KK[x2.k], b3 = e6 && e6.je && e6.je !== "v" ? this.kkB(x2) : null;
    if (e6 && e6.je === "v") {
      S3.sheet = { art: "verbrauch", t: x2.k === "v-eur" ? "eur" : void 0, auswahl: [...x2.ids || []], zeitraum: ort2 === "aw" ? c4.zc : x2.zr || "Tag", v: ort2 === "aw" ? c4.vc : 0 };
      return this.neuZeichnen();
    }
    const blatt = (art, extra = {}) => {
      S3.sheet = { art, auswahl: b3 ? [b3.id] : [], zeitraum: c4.zc, v: c4.vc, ...extra };
      this.neuZeichnen();
    };
    const detail2 = (k2) => {
      if (S3.view !== "auswertung") this.gehe("auswertung");
      S3.sheet = { art: "aw-detail", k: k2 };
      this.neuZeichnen();
    };
    switch (x2.k) {
      case "b-kosten":
        S3.sheet = { art: "verbrauch", t: "eur", auswahl: [], zeitraum: c4.z, v: c4.v };
        return this.neuZeichnen();
      case "b-gespart":
        return detail2("ohne");
      case "b-hoch":
        return detail2("hochrechnung");
      case "b-wetter":
        return detail2("wetter");
      case "b-oel":
        return detail2("vergleich");
      case "b-wer":
        return detail2("rangliste");
      case "b-strom":
        S3.sheet = { art: "strom" };
        return this.neuZeichnen();
      case "b-preis":
        S3.awSim = true;
        return this.gehe("auswertung");
      // Auswertung mit dem simulierten Preis
      case "b-geraete":
        S3.evGruppe = "geraete";
        return this.gehe("einst");
      case "c-leistung":
        return blatt("leistung", { zeitraum: "Tag", v: 0 });
      case "c-verbrauch":
      case "c-ohne":
        return blatt("verbrauch");
      case "c-kosten":
        return blatt("verbrauch", { t: "eur" });
      case "c-heizzeit":
      case "p-pumpzeit":
        return blatt("heizzeit-c");
      case "p-zyklen":
        S3.chart = "zyklen";
        S3.cZr = null;
        return this.gehe("container", b3.id);
      case "c-temp":
      case "c-warm":
        S3.chart = "temp";
        S3.cZr = null;
        return this.gehe("container", b3.id);
      case "h-plan":
        S3.sheet = { art: "hz", k: "plan" };
        return this.neuZeichnen();
      case "h-wann":
        S3.sheet = { art: "hz", k: "wann" };
        return this.neuZeichnen();
    }
  }
  /* Layout: Kachel ziehen (Reihenfolge) und Größe ziehen (rastet im Raster ein) – Maus und Finger */
  zugStart(ev) {
    const griff = ev.target && ev.target.closest && ev.target.closest("[data-zug]");
    if (!griff) return;
    const kachel = griff.closest(".aw-frei-s"), raster = kachel && kachel.parentElement;
    if (!raster) return;
    const art = griff.dataset.zug, ort2 = raster.dataset.ort || "aw", an = this.kkListe(ort2).filter((x2) => x2.an), item = an[+kachel.dataset.i];
    if (!item) return;
    ev.preventDefault();
    const cs = getComputedStyle(raster), spalten = cs.gridTemplateColumns.split(" ").length, luecke2 = parseFloat(cs.columnGap) || 12;
    const breite = (raster.getBoundingClientRect().width - luecke2 * (spalten - 1)) / spalten, hoehe = parseFloat(cs.gridAutoRows) || 110;
    const x0 = ev.clientX, y0 = ev.clientY, w0 = item.w, h0 = item.h, mass = kachel.querySelector(".aw-mass"), wurzel = this.shadowRoot;
    kachel.classList.add(art === "move" ? "zieht" : "waechst");
    let ziel2 = null;
    const bewegt = (e6) => {
      if (art === "size") {
        const st = awStufe(item.k, w0 + (e6.clientX - x0) / (breite + luecke2), h0 + (e6.clientY - y0) / (hoehe + luecke2));
        Object.assign(item, { w: st[1], h: st[2], st: st[0] });
        kachel.style.setProperty("--w", item.w);
        kachel.style.setProperty("--h", item.h);
        if (mass) mass.textContent = item.st;
      } else {
        kachel.style.transform = `translate(${e6.clientX - x0}px, ${e6.clientY - y0}px)`;
        kachel.style.pointerEvents = "none";
        const unter = (wurzel.elementFromPoint ? wurzel : document).elementFromPoint(e6.clientX, e6.clientY), k2 = unter && unter.closest && unter.closest(".aw-frei-s");
        raster.querySelectorAll(".aw-frei-s.ziel").forEach((x2) => x2.classList.remove("ziel"));
        ziel2 = k2 && k2 !== kachel && raster.contains(k2) ? k2 : null;
        if (ziel2) ziel2.classList.add("ziel");
      }
    };
    const fertig = () => {
      window.removeEventListener("pointermove", bewegt);
      window.removeEventListener("pointerup", fertig);
      window.removeEventListener("pointercancel", fertig);
      kachel.classList.remove("zieht", "waechst");
      kachel.style.transform = "";
      kachel.style.pointerEvents = "";
      raster.querySelectorAll(".aw-frei-s.ziel").forEach((x2) => x2.classList.remove("ziel"));
      if (art === "move" && ziel2) {
        const Lg = this.kkListe(ort2), nach = an[+ziel2.dataset.i], von = Lg.indexOf(item);
        Lg.splice(von, 1);
        Lg.splice(Lg.indexOf(nach) + (+ziel2.dataset.i > +kachel.dataset.i ? 1 : 0), 0, item);
      }
      this.kkMerken(ort2);
      this.neuZeichnen();
    };
    window.addEventListener("pointermove", bewegt);
    window.addEventListener("pointerup", fertig);
    window.addEventListener("pointercancel", fertig);
  }
  /* WU-0016: bis zu 3 Screenshots je Meldung – Datei/Kamera, Strg+V, am PC „Fenster aufnehmen“; vor dem Senden auf
     höchstens 1600 px verkleinert (JPEG). Mockup melden-bilder.html, abgenommen 02.10.2026 */
  mbBild(quelle, b3, h3, wie) {
    const s4 = this.s.sheet;
    if (!s4 || s4.art !== "melden") return;
    const f3 = Math.min(1, MB_PX / Math.max(b3, h3)), c4 = document.createElement("canvas");
    c4.width = Math.round(b3 * f3);
    c4.height = Math.round(h3 * f3);
    c4.getContext("2d").drawImage(quelle, 0, 0, c4.width, c4.height);
    const B2 = s4.form.bilder ||= [];
    if (B2.length >= MB_MAX) return this.toast(`Höchstens ${MB_MAX} Bilder`);
    const frei = MB_SUMME - B2.reduce((a3, x2) => a3 + x2.url.length, 0), url = [0.82, 0.6, 0.4].map((q) => c4.toDataURL("image/jpeg", q)).find((u3) => u3.length <= frei);
    if (!url) return this.toast("Bild zu groß – zusammen höchstens 3 MB, ein Bild entfernen");
    B2.push({ url, b: c4.width, h: c4.height, kb: Math.round(url.length * 0.75 / 1024) });
    this.neuZeichnen();
    this.toast(`Bild ${wie}`);
  }
  mbDatei(datei, wie) {
    if (!datei || !(datei.type || "").startsWith("image/")) return;
    const r5 = new FileReader();
    r5.onload = () => {
      const img = new Image();
      img.onload = () => this.mbBild(img, img.width, img.height, wie);
      img.onerror = () => this.toast("Bild nicht lesbar");
      img.src = r5.result;
    };
    r5.readAsDataURL(datei);
  }
  mbFenster() {
    return navigator.mediaDevices.getDisplayMedia({ video: { displaySurface: "browser" }, preferCurrentTab: true }).then((strom3) => {
      const v2 = document.createElement("video");
      v2.srcObject = strom3;
      v2.muted = true;
      return v2.play().then(() => new Promise((r5) => setTimeout(r5, 300))).then(() => {
        this.mbBild(v2, v2.videoWidth, v2.videoHeight, "aufgenommen");
        strom3.getTracks().forEach((t5) => t5.stop());
      });
    }).catch(() => this.toast("Aufnahme abgebrochen"));
  }
  mlBild(m3, i7) {
    const r5 = this._holen(`mb:${m3.id}:${i7}`, () => this._hass.callWS({ type: "baustelle/meldung", aktion: "bild", meldung_id: m3.id, nr: i7 }), 36e5);
    return r5 && r5.url;
  }
  /* Kachel „Preis simulieren“: tatsächliche € (je Tag der damalige Preis) gegen alle kWh × simulierter Preis – beides rechnet die Integration */
  /* Strompreis mit „gilt ab“ (Herbert 04.10.2026, Mockup strompreis.html): Liste wie die Arbeitszeit; die Integration
     rechnet jeden Tag mit dem Preis, der damals galt */
  /* Rangliste der Staffelung (Herbert 01.10.2026, Mockup staffel-rang.html): Reihenfolge und Bedarf in °C rechnet die
     Integration (laufzeit.staffel.rang, laufzeit.container.<id>.bedarf) – die Seite zeigt nur an */
  /* Tagesmittel der Fühler und außen, letzte n Tage */
  tempTage(n4) {
    const d3 = this.d, ids = [...new Set([...d3.bereiche.filter((b3) => b3.fuehler).map((b3) => b3.fuehler), this.eid(d3, d3.entry, "aussen")].filter(Boolean))].sort();
    const bis = plusTage(d3.z.HEUTE, 1), von = plusTage(bis, -n4), tage = [...Array(n4)].map((_2, k2) => plusTage(von, k2));
    if (!ids.length) return { tage, werte: {} };
    const roh2 = this._holen(`t:${d3.entry}:${n4}:${d3.z.HEUTE}`, () => this._hass.callWS({
      type: "baustelle/statistik",
      entry_id: d3.entry,
      start_time: new Date(this.zoneMs(von, "00:00", d3.z.zone)).toISOString(),
      end_time: new Date(this.zoneMs(bis, "00:00", d3.z.zone)).toISOString(),
      statistic_ids: ids,
      period: "day",
      types: ["mean"],
      units: {}
    }));
    if (roh2 === void 0) return null;
    const werte = {};
    for (const id of ids) {
      const arr = Array(n4).fill(null);
      for (const p4 of (roh2 || {})[id] || []) {
        const ms = typeof p4.start === "number" ? p4.start < 1e11 ? p4.start * 1e3 : p4.start : Date.parse(p4.start), i7 = tage.indexOf(this.lokal(ms, d3.z.zone).slice(0, 10));
        if (i7 >= 0 && zahl(p4.mean)) arr[i7] = Number(p4.mean);
      }
      werte[id] = arr;
    }
    return { tage, werte };
  }
  /* Je Gerät: Ø kW im Betrieb (Zähler mittel:<gid>), kWh aus dem Zählerstand des Shelly, Stunden ≈ kWh ÷ Ø kW (Pumpen: Pumpzeit) – rechnet die Integration */
  /* ---- Verlauf ---- */
  /* Kennzahlen einer Baustelle im Verlauf (kWh, €, gespart, Heiztage, Vergleich, kWh je Monat) – rechnet die Integration */
  kennz(x2) {
    const v2 = this.verlaufDaten(x2), zeit = x2.aktiv ? x2.beginn ? `seit ${datum(x2.beginn)}` : "laufend" : `${x2.beginn ? datum(x2.beginn) : "–"} – ${x2.ende ? datum(x2.ende) : "–"}`;
    if (!v2) return { zeit, kwh: null, eur: null, gespart: null, heiztage: null, container: x2.bereiche.length, vergleich: {}, jeMonat: {}, monate: null, laedt: true };
    return {
      zeit,
      kwh: v2.kwh ?? 0,
      eur: v2.eur ?? 0,
      gespart: v2.gespart ?? null,
      heiztage: v2.heiztage ?? 0,
      container: v2.container ?? x2.bereiche.length,
      vergleich: v2.vergleich || {},
      jeMonat: v2.je_monat || {},
      monate: v2.monate_je_container || { labels: [], reihen: [] },
      laedt: false
    };
  }
  /* ============ Verlauf (WU-0006, Mockup glas.html Variante 5 abgenommen): Reiter Baustellen (Karten / Vergleich) und Protokoll ============ */
  vlMonatsKeys() {
    const heute2 = (this.d || this.alle[0] || { z: { HEUTE: (/* @__PURE__ */ new Date()).toISOString().slice(0, 10) } }).z.HEUTE, j2 = +heute2.slice(0, 4), mo = +heute2.slice(5, 7) - 1;
    return [...Array(12)].map((_2, k2) => {
      const mm2 = mo - 11 + k2, jj = mm2 < 0 ? j2 - 1 : j2;
      return `${jj}-${String((mm2 % 12 + 12) % 12 + 1).padStart(2, "0")}`;
    });
  }
  vlFunke(werte, farbe, w2 = 120, h3 = 34) {
    const max = Math.max(1, ...werte), bw = w2 / werte.length;
    return `<svg class="vl-funke" viewBox="0 0 ${w2} ${h3}" preserveAspectRatio="none">${werte.map((v2, i7) => `<rect x="${(i7 * bw + 1).toFixed(1)}" y="${(h3 - v2 / max * h3).toFixed(1)}" width="${Math.max(0, bw - 2).toFixed(1)}" height="${(v2 / max * h3).toFixed(1)}" rx="1.5" fill="${farbe}" opacity="${v2 > 0.5 ? 0.9 : 0.15}"/>`).join("")}</svg>`;
  }
  /* BSM-032: Container-Symbol – Aussehen bearbeiten; die Integration prüft und liefert den Zustand aus den Sensoren */
  symKonfig(b3) {
    const s4 = this.s.sheet, x2 = s4 && s4.sym;
    if (x2) return x2;
    const q = !s4.std && b3.symbol || SYMBOL_STANDARD, el = (y3) => ({ wand: y3.wand, pos: y3.pos, sensor: y3.sensor || null });
    s4.sym = { doppel: !!q.doppel, farbe: q.farbe || null, rahmen: q.rahmen || null, tueren: q.tueren.map(el), fenster: q.fenster.map(el), licht: q.licht || null };
    if (s4.anfang === void 0) s4.anfang = JSON.stringify(s4.sym);
    return s4.sym;
  }
  symSenden(b3, c4) {
    this.s.sheet.sym = c4;
    this.s.sheet.std = false;
    return this.neuZeichnen();
  }
  // erst „Speichern“ schickt es (BSM-034.01)
  /* BSM-019: Notprogramm in den Plugs – Zustand je Heizkörper-Plug kommt fertig von der Integration (laufzeit.geraete.<id>.notprogramm) */
  npPlugs() {
    return this.d.bereiche.flatMap((b3) => b3.geraete.filter((g2) => g2.np).map((g2) => ({ b: b3, g: g2, np: g2.np })));
  }
  npModus(np) {
    return { thermo: `Thermostat ${zahl(np.soll) ? de(np.soll) + " °C" : ""}`.trim(), plan: "Zeitplan", bedarf: "Bei Bedarf (Termine)", hand: "Hand – nicht anfassen", aus: "aus – nur Frostschutz" }[np.modus] || "–";
  }
  npZeit(iso, mitTag = true) {
    if (!iso) return "–";
    const l4 = this.lokal(iso, this.d.z.zone), t5 = l4.slice(0, 10);
    return mitTag ? `${t5 === this.d.z.HEUTE ? "heute" : `${wtag(t5)} ${kurzDatum(t5)}`} ${l4.slice(11, 16)}` : l4.slice(11, 16);
  }
  npVor(iso) {
    const m3 = iso ? this.minSeitAb(iso, this.d.z.jetztMs) : null;
    return m3 === null ? "noch nie" : m3 < 1 ? "gerade eben" : `vor ${m3} min`;
  }
  npMarke(g2) {
    const np = g2.np;
    if (!np || np.zustand === "aus") return "";
    return `<span class="np-marke ${np.zustand === "fehler" ? "rot" : ""}" title="Notprogramm: ${np.zustand === "fehler" ? esc(np.fehler || "Fehler") : np.zustand === "not" ? "Notbetrieb" : np.zustand === "offen" ? "noch nicht geprüft" : "bereit"}">🛟</span>`;
  }
  /* ---- Auswahllisten aus HA (für die Einrichtungs-Dialoge) ---- */
  entitaeten(filter) {
    const eigene = new Set(this._eigene || []);
    return Object.values(this._hass && this._hass.states || {}).filter((s4) => !eigene.has(s4.entity_id) && filter(s4)).map((s4) => [s4.entity_id, s4.attributes.friendly_name || s4.entity_id]).sort((a3, b3) => a3[1].localeCompare(b3[1], "de"));
  }
  freieSchalter(auch) {
    const belegt = new Set(this.alle.filter((x2) => x2.aktiv).flatMap((x2) => x2.bereiche.flatMap((b3) => b3.geraete.map((g2) => g2.schalter))));
    return this.entitaeten((s4) => s4.entity_id.startsWith("switch.") && (!belegt.has(s4.entity_id) || s4.entity_id === auch));
  }
  /* ---- Einblendungen von unten ---- */
  fehlerText(e6) {
    return fehlerText(e6);
  }
  async ws(msg, ok) {
    if (!this.darfSenden(msg)) {
      this.toast(NUR_ANSEHEN);
      return null;
    }
    try {
      const r5 = await this._hass.callWS(msg);
      if (ok) this.toast(ok);
      return r5 === void 0 ? true : r5;
    } catch (e6) {
      this.toast(`Fehler: ${this.fehlerText(e6)}`);
      return null;
    } finally {
      this._laden();
    }
  }
  /* Einstellung setzen: sofort anzeigen, dann an die Integration (Pfad wie im Store) */
  setzen(pfad, wert2, ok) {
    if (this.nurLesen()) {
      this.toast(NUR_ANSEHEN);
      this.neuZeichnen();
      return Promise.resolve(null);
    }
    const r5 = this.d && this.d.r;
    this._rohText = null;
    if (r5) {
      let o6 = r5.einstellungen ||= {};
      for (const k2 of pfad.slice(0, -1)) o6 = o6[k2] = o6[k2] && typeof o6[k2] === "object" ? o6[k2] : {};
      o6[pfad[pfad.length - 1]] = wert2;
      this._neuBauen();
      this.neuZeichnen();
    }
    return this.ws(nachricht.setzen(this.d.entry, pfad, wert2), ok);
  }
  aktion(aktion, felder, ok) {
    return this.ws(nachricht.aktion(this.d.entry, aktion, felder), ok);
  }
  liste(liste2, aktion, eintrag, ok) {
    return this.ws(nachricht.liste(this.d.entry, liste2, aktion, eintrag), ok);
  }
  /* Einrichtungs-Dialoge von HA (dieselben wie unter Einstellungen → Geräte & Dienste) */
  async dialog(pfad, start, daten) {
    if (this.nurLesen()) throw new Error(NUR_ANSEHEN);
    const form = await this._hass.callApi("POST", pfad, start);
    if (!form || form.type !== "form") return form;
    return this._hass.callApi("POST", `${pfad}/${form.flow_id}`, daten);
  }
  flowFehler(r5) {
    return flowFehler(r5);
  }
  async einrichten(lauf, ok) {
    try {
      const r5 = await lauf();
      const f3 = this.flowFehler(r5);
      if (f3) {
        this.toast(`Nicht gespeichert: ${f3}`);
        return null;
      }
      if (ok) this.toast(ok);
      return r5 || true;
    } catch (e6) {
      this.toast(`Fehler: ${this.fehlerText(e6)}`);
      return null;
    }
  }
  optionenSpeichern(x2, aenderung) {
    const o6 = { ...x2.optionen, ...aenderung };
    for (const k2 of Object.keys(o6)) if (o6[k2] === "" || o6[k2] === null || o6[k2] === void 0) delete o6[k2];
    return this.dialog("config/config_entries/options/flow", { handler: x2.entry }, o6);
  }
  bereichDaten(name2, art, fuehler) {
    return { name: name2, art, ...fuehler ? { fuehler } : {} };
  }
  geraetDaten(bid, g2) {
    const [rolle, typ] = TYP_ROLLE[g2.typ] || TYP_ROLLE.Ölradiator;
    return {
      bereich: bid,
      schalter: g2.schalter,
      name: (g2.n || "").trim() || this.name(g2.schalter) || g2.typ,
      rolle,
      typ: typ === "oelradiator" && rolle !== "heizkoerper" ? "konvektor" : typ,
      ...g2.leistung ? { leistung: g2.leistung } : {},
      ...g2.energie ? { energie: g2.energie } : {}
    };
  }
  /* Geräte anlegen, ändern, verschieben, entfernen: ein Aufruf, die Integration prüft und lädt danach einmal neu (BSM-034.02) */
  async geraeteSpeichern(schritte) {
    const r5 = await this._hass.callWS({ type: "baustelle/geraet", entry_id: this.d.entry, aktion: "speichern", schritte });
    this.invNeu();
    return r5;
  }
  async bereichAnlegen(name2, schacht) {
    const r5 = await this.dialog("config/config_entries/subentries/flow", { handler: [this.d.entry, "bereich"] }, this.bereichDaten(name2, schacht ? "pumpenschacht" : "container"));
    const f3 = this.flowFehler(r5);
    if (f3) throw new Error(f3);
    return r5;
  }
  async neueIds(namen) {
    await this._laden();
    return namen.map((n4) => (this.d.bereiche.find((b3) => b3.name === n4) || {}).id).filter(Boolean);
  }
  morgenFrueh() {
    return new Date(this.zoneMs(plusTage(this.z.HEUTE, 1), "07:00", this.z.zone)).toISOString();
  }
  // „bis morgen stumm“ = morgen 07:00
  isoHeute(hhmm) {
    return new Date(this.zoneMs(this.z.HEUTE, hhmm, this.z.zone)).toISOString();
  }
  hover(ev) {
    const svg2 = ev.target && ev.target.closest && ev.target.closest("svg.chart");
    if (!svg2) return this.tip(null);
    const c4 = CHARTS[svg2.dataset.chart];
    if (!c4) return this.tip(null);
    const r5 = svg2.getBoundingClientRect(), fx = (ev.clientX - r5.left) / r5.width, p4 = this.d ? this.d.e.preis : 0;
    if (c4.art === "streu") {
      const vx = (ev.clientX - r5.left) / r5.width * 320, vy = ((ev.clientY ?? 0) - (r5.top ?? 0)) / r5.width * 320;
      let best = 0, bd = 1e9;
      c4.pkt.forEach((q2, i8) => {
        const dd = (c4.x(q2[0]) - vx) ** 2 + (c4.y(q2[1]) - vy) ** 2;
        if (dd < bd) {
          bd = dd;
          best = i8;
        }
      });
      if (bd > 900) {
        svg2.querySelector(".hover").innerHTML = "";
        return this.tip(null);
      }
      const q = c4.pkt[best];
      svg2.querySelector(".hover").innerHTML = `<circle cx="${c4.x(q[0])}" cy="${c4.y(q[1])}" r="7" fill="none" stroke="var(--ink)" stroke-width="1.5"/>`;
      return this.tip(ev, `<b>${de(q[0], 1)} °C außen</b><div>${de(q[1], 0)} kWh · ${de(q[1] * p4, 2)} €</div>`);
    }
    if (c4.art === "flaeche") {
      const vx = fx * c4.W, i8 = Math.max(0, Math.min(c4.n - 1, Math.round((vx - c4.x0) / (c4.x1 - c4.x0) * (c4.n - 1)))), x2 = c4.x0 + i8 / Math.max(1, c4.n - 1) * (c4.x1 - c4.x0);
      const h3 = c4.einheit === "kWh/h" || c4.einheit === "kW", sum = c4.reihen.reduce((a3, q) => a3 + q.v[i8], 0);
      if (c4.einheit === "kW") {
        svg2.querySelector(".hover").innerHTML = `<line x1="${x2}" x2="${x2}" y1="10" y2="138" class="kreuz"/>` + c4.reihen.map((q) => `<circle cx="${x2}" cy="${c4.y(q.o[i8])}" r="3.5" fill="${q.farbe}" class="punkt"/>`).join("");
        return this.tip(ev, `<b>${c4.labels[i8]}:00</b>` + (c4.reihen.length > 1 ? [...c4.reihen].reverse().map((q) => `<div><i style="background:${q.farbe}"></i>${esc(q.name)} <b>${de(q.v[i8], 2)} kW</b></div>`).join("") + `<div class="tip-summe">zusammen <b>${de(sum, 2)} kW</b></div>` : `<div>${de(sum, 2)} kW</div>`));
      }
      svg2.querySelector(".hover").innerHTML = `<line x1="${x2}" x2="${x2}" y1="10" y2="138" class="kreuz"/>` + c4.reihen.map((q) => `<circle cx="${x2}" cy="${c4.y(q.o[i8])}" r="3.5" fill="${q.farbe}" class="punkt"/>`).join("");
      const vglTip = c4.vergleich ? `<div class="leise">${esc(c4.vglName || "Vergleich")} ${de(c4.vergleich[i8], 2)} ${c4.einheit === "€" ? "€" : "kWh"}</div>` : "";
      return this.tip(ev, `<b>${c4.labels[i8]}${h3 ? ":00" : ""}</b>` + vglTip + (c4.reihen.length > 1 ? [...c4.reihen].reverse().map((q) => `<div><i style="background:${q.farbe}"></i>${esc(q.name)} <b>${de(q.v[i8], 2)} ${c4.einheit === "€" ? "€" : "kWh"}</b></div>`).join("") + `<div class="tip-summe">zusammen <b>${de(sum, 2)} kWh</b> · ${de(sum * p4, 2)} €</div>` : c4.einheit === "€" ? `<div>${de(sum, 2)} €</div>` : `<div>${de(sum, 2)} kWh</div><div class="leise">${de(sum * p4, 2)} €</div>`));
    }
    if (c4.art === "luecke") {
      const vx = fx * c4.W, i8 = Math.max(0, Math.min(c4.n - 1, Math.round((vx - c4.x0) / (c4.x1 - c4.x0) * (c4.n - 1)))), x2 = c4.x0 + i8 / Math.max(1, c4.n - 1) * (c4.x1 - c4.x0);
      if (!zahl(c4.mit[i8])) {
        svg2.querySelector(".hover").innerHTML = "";
        return this.tip(null);
      }
      svg2.querySelector(".hover").innerHTML = `<line x1="${x2}" x2="${x2}" y1="10" y2="${c4.unten}" class="kreuz"/><circle cx="${x2}" cy="${c4.y(c4.mit[i8])}" r="3.5" fill="var(--s1)" class="punkt"/><circle cx="${x2}" cy="${c4.y(c4.ohne[i8])}" r="3.5" fill="var(--ink2)" class="punkt"/>`;
      return this.tip(ev, `<b>${c4.labels[i8]}${c4.n === 24 ? ":00" : ""}</b><div><i style="background:var(--s3)"></i>gespart <b>${de(c4.gespart[i8], 2)} ${c4.einheit}</b></div><div><i style="background:var(--s1)"></i>mit Automatik <b>${de(c4.mit[i8], 2)} ${c4.einheit}</b></div><div class="leise">ohne (24/7) ${de(c4.ohne[i8], 2)} ${c4.einheit}</div>`);
    }
    if (c4.art === "stufen") {
      const vx = fx * c4.W, t5 = c4.von + Math.max(0, Math.min(1, (vx - c4.L) / (c4.B - c4.L))) * (c4.bis - c4.von);
      const wert2 = (r6) => {
        let w2 = null;
        for (const q of r6.punkte) {
          if (q[0] > t5) break;
          w2 = q[1];
        }
        return w2;
      }, x2 = c4.x(t5);
      svg2.querySelector(".hover").innerHTML = `<line x1="${x2}" x2="${x2}" y1="10" y2="${c4.unten}" class="kreuz"/>`;
      const zeit = new Date(t5).toLocaleTimeString("de-AT", { timeZone: this.d.z.zone, hour: "2-digit", minute: "2-digit", second: "2-digit" });
      return this.tip(ev, `<b>${zeit}</b>${c4.reihen.map((r6) => {
        const w2 = wert2(r6);
        return zahl(w2) ? `<div><i style="background:${r6.farbe}"></i>${esc(r6.name)} <b>${de(w2, 0)} W</b></div>` : "";
      }).join("")}`);
    }
    if (c4.art === "linien") {
      const vx = fx * c4.W, i8 = Math.max(0, Math.min(c4.n - 1, Math.round((vx - c4.x0) / (c4.x1 - c4.x0) * (c4.n - 1)))), x2 = c4.x0 + i8 / Math.max(1, c4.n - 1) * (c4.x1 - c4.x0);
      svg2.querySelector(".hover").innerHTML = `<line x1="${x2}" x2="${x2}" y1="10" y2="${c4.unten}" class="kreuz"/>` + c4.reihen.map((q) => !zahl(q.v[i8]) ? "" : `<circle cx="${x2}" cy="${c4.y(q.v[i8])}" r="3.5" fill="${q.farbe}" class="punkt"/>`).join("");
      return this.tip(ev, `<b>${c4.titel(i8)}</b>${c4.reihen.map((q) => !zahl(q.v[i8]) ? "" : `<div><i style="background:${q.farbe}"></i>${esc(q.name)} <b>${de(q.v[i8])} °C</b></div>`).join("")}`);
    }
    if (c4.art === "linie") {
      const vx = fx * c4.W, i8 = Math.max(0, Math.min(24, Math.round((vx - c4.x0) / (c4.x1 - c4.x0) * 24))), x2 = c4.x0 + i8 / 24 * (c4.x1 - c4.x0);
      const v2 = c4.vb ? c4.vb[Math.min(i8, c4.vb.length - 1)] || 0 : null, kv = c4.reihen.length + 1;
      svg2.querySelector(".hover").innerHTML = `<line x1="${x2}" x2="${x2}" y1="10" y2="${c4.unten}" class="kreuz"/>` + c4.reihen.map((s4, k2) => !zahl(s4.v[i8]) ? "" : `<circle cx="${x2}" cy="${c4.y(s4.v[i8])}" r="4" fill="var(--s${k2 + 1})" class="punkt"/>`).join("") + (c4.vb ? `<circle cx="${x2}" cy="${c4.yv(v2)}" r="3.5" fill="var(--s${kv})" class="punkt"/>` : "");
      return this.tip(ev, `<b>${String(i8).padStart(2, "0")}:00</b>${c4.reihen.map((s4, k2) => !zahl(s4.v[i8]) ? "" : `<div><i style="background:var(--s${k2 + 1})"></i>${s4.name} <b>${de(s4.v[i8])} ${c4.einheit}</b></div>`).join("")}` + (c4.vb ? `<div><i style="background:var(--s${kv})"></i>Verbrauch <b>${de(v2, 2)} kWh</b></div>` : ""));
    }
    const bar = ev.target.closest(".bar");
    svg2.querySelectorAll(".bar").forEach((x2) => x2.classList.toggle("matt", !!bar && x2 !== bar));
    if (!bar) return this.tip(null);
    const i7 = +bar.dataset.i;
    return this.tip(ev, `<b>${c4.labels[i7]}</b><div>${de(c4.werte[i7], c4.d)} ${c4.einheit}</div>`);
  }
  tip(ev, html) {
    const t5 = this.root && this.root.querySelector(".tip");
    if (!t5) return;
    if (!ev || !html) {
      t5.classList.remove("an");
      this.root.querySelectorAll(".chart .hover").forEach((h3) => {
        h3.innerHTML = "";
      });
      this.root.querySelectorAll(".bar.matt").forEach((x3) => x3.classList.remove("matt"));
      return;
    }
    const r5 = this.root.getBoundingClientRect();
    t5.innerHTML = html;
    t5.classList.add("an");
    const x2 = Math.min(ev.clientX - r5.left + 12, r5.width - t5.offsetWidth - 8);
    t5.style.left = x2 + "px";
    t5.style.top = ev.clientY - r5.top - t5.offsetHeight - 12 + "px";
  }
};
if (!customElements.get("baustelle-panel")) customElements.define("baustelle-panel", BaustellePanel);
