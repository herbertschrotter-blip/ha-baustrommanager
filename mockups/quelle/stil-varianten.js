const fs = require('fs');
const panel = fs.readFileSync('/config/projekte/ha-baustrommanager/custom_components/baustelle/frontend/baustelle-panel.js', 'utf8');
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
eval(panel.slice(panel.indexOf('/* Realistische, animierte Wettersymbole'), panel.indexOf('/* Baustellen-Illustrationen')).replace(/^(const|let) /gm, "var "));
eval(panel.slice(panel.indexOf('/* Baustellen-Illustrationen'), panel.indexOf('\nconst CSS = `')).replace(/^(const|let) /gm, "var "));
const panelCss = panel.slice(panel.indexOf('/* Übersicht: Baustelle und Container als Kacheln */'), panel.indexOf('`;', panel.indexOf('/* Übersicht: Baustelle und Container als Kacheln */')));
const animCss = panelCss.slice(panelCss.indexOf('@keyframes rein'));
const wCss = panel.slice(panel.indexOf('/* Wetter */'), panel.indexOf('/* Baustellen-Illustrationen') > 0 ? panel.indexOf('`;', panel.indexOf('/* Wetter */')) : 0).replace(/:host\(\[dunkel\]\)/g, '.dunkel').replace(/:host/g, '.hell');
const de = (x, d = 1) => Number(x).toLocaleString('de-AT', { minimumFractionDigits: d, maximumFractionDigits: d });

const B = [
  { name: 'Poliercontainer', z: 'heizt', text: 'Thermostat heizt', t: 19.4, kw: 3.99, g: '2 Heizkörper', an: [1, 1], f: 0 },
  { name: 'Mannschaft', z: 'trocknen', text: 'Kleidung trocknen', t: 17.8, kw: 5.79, g: '2 Heizkörper · 1 Trockner', an: [1, 1, 1], f: 1 },
  { name: 'Magazin', z: 'aus', text: 'aus bis 06:00', t: 9.1, kw: 0, g: '1 Heizkörper · 1 Steckdose', an: [0, 0], f: 2 },
  { name: 'Sanitär', z: 'frost', text: 'Frostschutz', t: 4.2, kw: 2.0, g: '1 Heizkörper', an: [1], f: 3 },
  { name: 'Lager Süd', z: 'offline', text: 'nicht erreichbar', t: null, kw: 0, g: '1 Heizkörper', an: [0], f: 4 },
  { name: 'Pumpenschacht Nord', z: 'laeuft', text: 'Pumpe läuft', t: null, kw: 0.76, g: '2 Pumpen', an: [1, 0], f: 5, pumpe: true, zyklen: 36 },
];
const CHIP = { heizt: 'heizt', trocknen: 'trocknet', aus: 'aus', frost: 'Frostschutz', offline: 'offline', laeuft: 'läuft' };
const FARBE = { heizt: '#ff9f0a', trocknen: '#ff9f0a', aus: '#8e8e93', frost: '#64d2ff', offline: '#ff453a', laeuft: '#0a84ff' };
const illu = x => x.pumpe ? bcSchacht(true) : bcContainer(BEREICH_FARBEN[x.f], x.z);
const wert = x => x.pumpe ? `${x.zyklen}<small> Zyklen</small>` : x.t !== null ? `${de(x.t)}<small>°</small>` : '–';
const punkte = x => x.an.map(a => `<i class="${a ? 'an' : ''}"></i>`).join('');

/* ---------------------------------------------------------------- A · iOS */
const ios = `<div class="ios">
  <div class="ios-status"><span>20:45</span><span>▮▮▮ 86 %</span></div>
  <div class="ios-nav"><span class="ios-link">‹ Home</span><span class="ios-link">Bearbeiten</span></div>
  <div class="ios-titel">ÖWG Dobl Zwaring</div>
  <div class="ios-seg"><span class="on">Übersicht</span><span>Heizung</span><span>Auswertung</span><span>Verlauf</span></div>
  <div class="ios-inh">
    <div class="ios-widget gross">
      <div class="iw-kopf"><span class="iw-app">♨ HEIZUNG</span><span class="ios-toggle on"></span></div>
      <div class="iw-zeile"><div><div class="iw-riesig">12,5 <small>kW</small></div><div class="iw-sek">aus um 17:15 · 7 von 11 Geräten an</div></div>
        <div class="iw-wetter">${wetterIcon('rainy', 40)}<div>4°<small>6 mm</small></div></div></div>
      <div class="iw-leiste"><div><b>18,6</b><small>kWh heute</small></div><div><b>5,21 €</b><small>Kosten</small></div><div><b>12,40 €</b><small>gespart</small></div></div></div>
    <div class="ios-warn"><span class="iw-dot rot"></span><div><b>Lager Süd nicht erreichbar</b><div class="iw-sek">seit 10:42 – Stromausfall?</div></div><span class="ios-chev">›</span></div>
    <div class="ios-abschnitt">CONTAINER</div>
    <div class="ios-raster">${B.map((x, i) => `<div class="ios-widget klein ${x.z}" style="animation-delay:${i * 60}ms">
      <div class="iw-kopf"><span class="iw-pill" style="--c:${FARBE[x.z]}">${CHIP[x.z]}</span><span class="iw-kw">${de(x.kw, 1)} kW</span></div>
      <div class="iw-illu">${illu(x)}</div>
      <div class="iw-name">${esc(x.name)}</div><div class="iw-zeile2"><span class="iw-wert">${wert(x)}</span><span class="punkte">${punkte(x)}</span></div>
      <div class="iw-sek">${x.g}</div></div>`).join('')}</div>
    <div class="ios-abschnitt">HEUTE</div>
    <div class="ios-liste">${B.slice(0, 3).map(x => `<div class="il"><span class="il-ic" style="background:${FARBE[x.z]}">${x.pumpe ? '💧' : '♨'}</span><span class="il-t">${esc(x.name)}</span><span class="iw-sek">${x.text}</span><span class="ios-chev">›</span></div>`).join('')}</div>
  </div>
  <div class="ios-tabbar"><span class="on">🏗<small>Baustelle</small></span><span>♨<small>Heizung</small></span><span>📊<small>Auswertung</small></span><span>⚙<small>Einstellungen</small></span></div>
</div>`;

/* ---------------------------------------------------------------- B · One UI */
const oneui = `<div class="one">
  <div class="one-status"><span>20:45</span><span>▮▮▮ 86%</span></div>
  <div class="one-hero"><div class="one-titel">Baustelle</div><div class="one-sub">ÖWG Dobl Zwaring · 6 Bereiche · 11 Geräte</div>
    <div class="one-kpi"><div><b>12,5</b><small>kW jetzt</small></div><div><b>18,6</b><small>kWh heute</small></div><div><b>5,21 €</b><small>heute</small></div></div></div>
  <div class="one-leiste"><span class="one-ic">☰</span><span class="one-ic">⟳</span><span class="one-ic">⋮</span></div>
  <div class="one-inh">
    <div class="one-karte one-status-k"><span class="one-kreis orange">♨</span><div style="flex:1"><b>Heizung · Automatik</b><div class="one-sek">aus um 17:15 · 7 von 11 an</div></div><span class="one-toggle on"></span></div>
    <div class="one-chips"><span>${wetterIcon('rainy', 20)} 4,2 °C · 6 mm</span><span class="rot">● 1 Warnung</span><span>Heizgrenze 15 °C</span></div>
    <div class="one-raster">${B.map((x, i) => `<div class="one-karte one-k ${x.z}" style="animation-delay:${i * 60}ms">
      <div class="one-illu">${illu(x)}</div>
      <div class="one-name">${esc(x.name)}</div>
      <div class="one-zeile"><span class="one-wert">${wert(x)}</span><span class="one-badge" style="--c:${FARBE[x.z]}">${CHIP[x.z]}</span></div>
      <div class="one-fuss"><span class="one-sek">${x.g}</span><span class="punkte">${punkte(x)}</span></div></div>`).join('')}</div>
  </div>
  <div class="one-fab">+</div>
  <div class="one-nav"><span class="on">Übersicht</span><span>Heizung</span><span>Auswertung</span><span>Verlauf</span></div>
</div>`;

/* ---------------------------------------------------------------- C · Glas */
const glas = `<div class="glas">
  <div class="glas-bg"><i class="k1"></i><i class="k2"></i><i class="k3"></i></div>
  <div class="glas-kopf glas-panel"><div><div class="glas-klein">BAUSTELLE</div><div class="glas-titel">ÖWG Dobl Zwaring</div></div>
    <div class="glas-kw"><span class="blitz an">⚡</span>12,5<small> kW</small></div></div>
  <div class="glas-chips"><span class="glas-panel">♨ heizt · aus 17:15</span><span class="glas-panel">${wetterIcon('rainy', 20)} 4,2° · 6 mm</span><span class="glas-panel rot">1 Warnung</span></div>
  <div class="glas-raster">${B.map((x, i) => `<div class="glas-panel glas-k ${x.z}" style="animation-delay:${i * 70}ms;--c:${FARBE[x.z]}">
    <div class="glas-illu">${illu(x)}</div>
    <div class="glas-name">${esc(x.name)}</div>
    <div class="glas-zeile"><span class="glas-wert">${wert(x)}</span><span class="glas-kwk">${de(x.kw, 1)} kW</span></div>
    <div class="glas-status"><span class="glas-dot"></span>${x.text}</div></div>`).join('')}</div>
  <div class="glas-nav glas-panel"><span class="on">Übersicht</span><span>Heizung</span><span>Auswertung</span><span>Verlauf</span><span>⚙</span></div>
</div>`;

/* ---------------------------------------------------------------- D · Architektonisch */
const AKTIV = { heizt: 1, trocknen: 1, frost: 1, laeuft: 1 };
const arch = `<div class="ar">
  <div class="ar-status"><span>20:45</span><span>86 %</span></div>
  <header class="ar-kopf">
    <div class="ar-meta"><span>BAUSTELLE 01</span><span class="ar-marke"><i></i>AKTIV</span></div>
    <h1>ÖWG Dobl<br>Zwaring</h1>
  </header>
  <div class="ar-kennz">
    <div><b>12,5</b><span>kW Leistung</span></div>
    <div><b>18,6</b><span>kWh heute</span></div>
    <div><b>5,21</b><span>€ heute</span></div>
  </div>
  <div class="ar-steuer">
    <div class="ar-schalter" onclick="this.classList.toggle('an')" role="switch"><span class="ar-sl">AUTOMATIK</span><span class="ar-spur"><i></i></span></div>
    <div class="ar-info">Heizt bis 17:15 · 7 von 11 Geräten</div>
  </div>
  <div class="ar-chips"><span>${wetterIcon('rainy', 18)} 4,2 °C · 6 mm</span><span class="warn">Lager Süd offline</span></div>
  <div class="ar-abschnitt"><span>Container</span><span>06</span></div>
  <div class="ar-raster">${B.map((x, i) => `<div class="ar-zelle ${AKTIV[x.z] ? 'aktiv' : ''} ${x.z}" style="animation-delay:${i * 50}ms">
    <div class="ar-zk"><span class="ar-nr">${String(i + 1).padStart(2, '0')}</span><span class="ar-kw">${de(x.kw, 1)} kW</span></div>
    <div class="ar-illu">${illu(x)}</div>
    <div class="ar-name">${esc(x.name)}</div>
    <div class="ar-wert">${wert(x)}</div>
    <div class="ar-zust"><i></i>${x.text}</div>
    <div class="ar-geraete">${x.g}</div></div>`).join('')}
    <div class="ar-zelle ar-neu"><span>+</span>Container hinzufügen</div></div>
  <nav class="ar-nav"><span class="on">Übersicht</span><span>Heizung</span><span>Auswertung</span><span>Verlauf</span></nav>
</div>`;

const css = `
body { margin: 0; font-family: -apple-system, "SF Pro Text", system-ui, "Segoe UI", Roboto, sans-serif; background: #0b0b0b; color: #fff; }
body.licht { background: #d9dee5; }
.bar { position: sticky; top: 0; z-index: 9; display: flex; gap: 10px; align-items: center; padding: 10px 16px; background: #1c1c1e; color: #fff; }
.bar button { background: transparent; color: inherit; border: 1px solid #636366; border-radius: 8px; padding: 5px 10px; font: inherit; cursor: pointer; }
.buehne { display: flex; gap: 26px; padding: 18px; overflow-x: auto; align-items: flex-start; }
.v h2 { margin: 0 0 3px; font-size: 16px; color: #aeaeb2; } .v p { margin: 0 0 10px; font-size: 12px; color: #8e8e93; max-width: 390px; }
.telefon { position: relative; width: 390px; height: 844px; border-radius: 48px; overflow: hidden; border: 10px solid #000; box-shadow: 0 10px 40px rgba(0,0,0,.6); }
.telefon::before { content: ""; position: absolute; top: 10px; left: 50%; transform: translateX(-50%); width: 110px; height: 30px; border-radius: 20px; background: #000; z-index: 20; }
.bc { width: 100%; height: auto; display: block; overflow: visible; } .bc.offline { filter: grayscale(.8) brightness(.8); }
:root { --fenster: #2b3a44; --rahmen: #cfd8dc; } .licht { --fenster: #cfe3f3; --rahmen: #eceff1; }
.punkte { display: flex; gap: 4px; } .punkte i { width: 7px; height: 7px; border-radius: 50%; background: rgba(142,142,147,.5); }
.punkte i.an { background: #ff9f0a; box-shadow: 0 0 6px #ff9f0a; animation: atmen 2s ease-in-out infinite; }
small { font-size: .5em; font-weight: 400; opacity: .7; }

/* ---------- iOS ---------- */
.ios { --bg: #000; --karte: #1c1c1e; --karte2: #2c2c2e; --txt: #fff; --sek: #98989f; --tr: rgba(84,84,88,.6); --blau: #0a84ff;
  height: 100%; background: var(--bg); color: var(--txt); overflow-y: auto; position: relative; }
.licht .ios { --bg: #f2f2f7; --karte: #fff; --karte2: #f2f2f7; --txt: #000; --sek: #6c6c70; --tr: rgba(60,60,67,.29); --blau: #007aff; }
.ios-status { display: flex; justify-content: space-between; padding: 16px 30px 0; font-weight: 600; font-size: 15px; }
.ios-nav { display: flex; justify-content: space-between; padding: 14px 16px 0; } .ios-link { color: var(--blau); font-size: 17px; }
.ios-titel { font-size: 32px; font-weight: 700; letter-spacing: -.5px; padding: 4px 16px 10px; }
.ios-seg { display: flex; margin: 0 16px 12px; background: rgba(118,118,128,.24); border-radius: 9px; padding: 2px; }
.ios-seg span { flex: 1; text-align: center; font-size: 12.5px; padding: 6px 0; border-radius: 7px; } .ios-seg .on { background: var(--karte2); box-shadow: 0 3px 8px rgba(0,0,0,.12); font-weight: 600; }
.licht .ios-seg .on { background: #fff; }
.ios-inh { padding: 0 16px 110px; display: flex; flex-direction: column; gap: 12px; }
.ios-widget { background: var(--karte); border-radius: 22px; padding: 14px; animation: rein .45s ease-out both; }
.iw-kopf { display: flex; justify-content: space-between; align-items: center; } .iw-app { font-size: 12px; font-weight: 600; color: #ff9f0a; letter-spacing: .3px; }
.iw-zeile { display: flex; justify-content: space-between; align-items: center; margin-top: 8px; } .iw-riesig { font-size: 38px; font-weight: 600; letter-spacing: -1px; }
.iw-wetter { display: flex; align-items: center; gap: 4px; font-size: 22px; font-weight: 600; } .iw-wetter small { display: block; font-size: 11px; color: var(--sek); opacity: 1; }
.iw-sek { color: var(--sek); font-size: 12.5px; }
.iw-leiste { display: grid; grid-template-columns: repeat(3, 1fr); margin-top: 12px; padding-top: 10px; border-top: .5px solid var(--tr); }
.iw-leiste b { display: block; font-size: 17px; } .iw-leiste small { font-size: 11px; color: var(--sek); opacity: 1; }
.ios-toggle { width: 51px; height: 31px; border-radius: 16px; background: rgba(120,120,128,.32); position: relative; } .ios-toggle.on { background: #30d158; }
.ios-toggle::after { content: ""; position: absolute; top: 2px; left: 2px; width: 27px; height: 27px; border-radius: 50%; background: #fff; box-shadow: 0 3px 8px rgba(0,0,0,.15); } .ios-toggle.on::after { left: 22px; }
.ios-warn { display: flex; align-items: center; gap: 12px; background: var(--karte); border-radius: 14px; padding: 12px 14px; font-size: 15px; }
.iw-dot { width: 10px; height: 10px; border-radius: 50%; } .iw-dot.rot { background: #ff453a; box-shadow: 0 0 8px #ff453a; animation: atmen 1.4s infinite; }
.ios-chev { margin-left: auto; color: var(--sek); font-size: 20px; }
.ios-abschnitt { font-size: 13px; color: var(--sek); padding: 8px 4px 0; letter-spacing: .3px; }
.ios-raster { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
.ios-widget.klein { padding: 12px; display: flex; flex-direction: column; gap: 2px; }
.iw-pill { font-size: 11px; font-weight: 600; color: var(--c); background: color-mix(in srgb, var(--c) 18%, transparent); padding: 2px 8px; border-radius: 10px; }
.iw-kw { font-size: 12px; color: var(--sek); } .iw-illu { margin: 2px -6px -2px; } .iw-name { font-weight: 600; font-size: 15px; }
.iw-zeile2 { display: flex; justify-content: space-between; align-items: center; } .iw-wert { font-size: 26px; font-weight: 600; letter-spacing: -.5px; }
.ios-liste { background: var(--karte); border-radius: 14px; overflow: hidden; } .il { display: flex; align-items: center; gap: 12px; padding: 11px 14px; font-size: 16px; border-bottom: .5px solid var(--tr); }
.il:last-child { border-bottom: 0; } .il-ic { width: 29px; height: 29px; border-radius: 7px; display: grid; place-items: center; font-size: 15px; } .il-t { flex: 1; }
.ios-tabbar { position: absolute; left: 0; right: 0; bottom: 0; display: flex; justify-content: space-around; padding: 8px 0 26px; background: rgba(30,30,30,.72); backdrop-filter: blur(20px) saturate(1.6); -webkit-backdrop-filter: blur(20px); border-top: .5px solid var(--tr); color: var(--sek); font-size: 20px; }
.licht .ios-tabbar { background: rgba(249,249,249,.8); } .ios-tabbar span { display: flex; flex-direction: column; align-items: center; gap: 2px; } .ios-tabbar small { font-size: 10px; opacity: 1; } .ios-tabbar .on { color: var(--blau); }

/* ---------- One UI ---------- */
.one { --bg: #000; --karte: #171717; --txt: #fafafa; --sek: #9a9a9a; --akz: #3e91ff; height: 100%; background: var(--bg); color: var(--txt); overflow-y: auto; position: relative; font-family: "SamsungOne", Roboto, system-ui, sans-serif; }
.licht .one { --bg: #f6f6f6; --karte: #fff; --txt: #111; --sek: #6f6f6f; --akz: #0a6cff; }
.one-status { display: flex; justify-content: space-between; padding: 16px 28px 0; font-size: 13px; }
.one-hero { height: 250px; display: flex; flex-direction: column; justify-content: flex-end; padding: 0 26px 18px; }
.one-titel { font-size: 38px; font-weight: 400; } .one-sub { color: var(--sek); font-size: 14px; margin-top: 4px; }
.one-kpi { display: grid; grid-template-columns: repeat(3, 1fr); margin-top: 18px; } .one-kpi b { display: block; font-size: 22px; font-weight: 500; } .one-kpi small { color: var(--sek); font-size: 12px; opacity: 1; }
.one-leiste { display: flex; justify-content: flex-end; gap: 18px; padding: 0 22px 8px; color: var(--sek); font-size: 18px; }
.one-inh { padding: 0 12px 150px; display: flex; flex-direction: column; gap: 10px; }
.one-karte { background: var(--karte); border-radius: 26px; padding: 16px; animation: rein .45s ease-out both; }
.one-status-k { display: flex; align-items: center; gap: 12px; } .one-kreis { width: 42px; height: 42px; border-radius: 50%; display: grid; place-items: center; font-size: 20px; }
.one-kreis.orange { background: rgba(255,146,0,.18); color: #ff9200; } .one-sek { color: var(--sek); font-size: 13px; }
.one-toggle { width: 44px; height: 24px; border-radius: 12px; background: #555; position: relative; } .one-toggle.on { background: var(--akz); }
.one-toggle::after { content: ""; position: absolute; top: 3px; left: 3px; width: 18px; height: 18px; border-radius: 50%; background: #fff; } .one-toggle.on::after { left: 23px; }
.one-chips { display: flex; gap: 8px; overflow-x: auto; padding: 2px 2px 4px; } .one-chips span { display: flex; align-items: center; gap: 4px; white-space: nowrap; font-size: 13px; padding: 7px 14px; border-radius: 20px; background: var(--karte); }
.one-chips .rot { color: #ff5b4f; }
.one-raster { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
.one-k { padding: 12px 14px 14px; display: flex; flex-direction: column; gap: 2px; } .one-illu { margin: -2px -8px 0; } .one-name { font-size: 15px; font-weight: 600; }
.one-zeile { display: flex; justify-content: space-between; align-items: center; } .one-wert { font-size: 26px; }
.one-badge { font-size: 11px; color: var(--c); border: 1px solid color-mix(in srgb, var(--c) 60%, transparent); padding: 2px 8px; border-radius: 10px; }
.one-fuss { display: flex; justify-content: space-between; align-items: center; }
.one-fab { position: absolute; right: 22px; bottom: 96px; width: 56px; height: 56px; border-radius: 18px; background: var(--akz); color: #fff; display: grid; place-items: center; font-size: 30px; box-shadow: 0 6px 16px rgba(0,0,0,.35); }
.one-nav { position: absolute; left: 0; right: 0; bottom: 0; display: flex; justify-content: space-around; padding: 14px 0 28px; background: var(--bg); color: var(--sek); font-size: 13px; }
.one-nav .on { color: var(--txt); font-weight: 700; }

/* ---------- Glas ---------- */
.glas { position: relative; height: 100%; overflow-y: auto; color: #fff; padding: 56px 14px 110px; box-sizing: border-box; display: flex; flex-direction: column; gap: 12px; }
.glas-bg { position: absolute; inset: 0; background: linear-gradient(160deg, #1b2735 0%, #0e1a2b 45%, #2a1a2e 100%); overflow: hidden; z-index: 0; }
.licht .glas-bg { background: linear-gradient(160deg, #cfe3ff 0%, #f5e6ff 50%, #ffe9d2 100%); } .licht .glas { color: #111; }
.glas-bg i { position: absolute; border-radius: 50%; filter: blur(40px); opacity: .7; animation: schweben 14s ease-in-out infinite; }
.glas-bg .k1 { width: 260px; height: 260px; background: #ff8a00; top: -60px; left: -60px; } .glas-bg .k2 { width: 240px; height: 240px; background: #0a84ff; top: 300px; right: -80px; animation-delay: -5s; }
.glas-bg .k3 { width: 200px; height: 200px; background: #bf5af2; bottom: -40px; left: 40px; animation-delay: -9s; }
.glas > *:not(.glas-bg) { position: relative; z-index: 1; }
.glas-panel { background: rgba(255,255,255,.1); border: 1px solid rgba(255,255,255,.22); backdrop-filter: blur(24px) saturate(1.5); -webkit-backdrop-filter: blur(24px); border-radius: 26px; box-shadow: 0 8px 32px rgba(0,0,0,.25), inset 0 1px 0 rgba(255,255,255,.25); }
.licht .glas-panel { background: rgba(255,255,255,.45); border-color: rgba(255,255,255,.7); }
.glas-kopf { display: flex; justify-content: space-between; align-items: center; padding: 16px 18px; } .glas-klein { font-size: 11px; letter-spacing: 1.2px; opacity: .7; } .glas-titel { font-size: 22px; font-weight: 600; }
.glas-kw { font-size: 28px; font-weight: 300; display: flex; align-items: center; gap: 4px; } .glas-kw .blitz { font-size: 22px; filter: drop-shadow(0 0 8px rgba(255,214,10,.9)); animation: blitz 2.4s ease-in-out infinite; }
.glas-chips { display: flex; gap: 8px; flex-wrap: wrap; } .glas-chips span { display: flex; align-items: center; gap: 4px; font-size: 13px; padding: 6px 12px; border-radius: 18px; } .glas-chips .rot { color: #ff6961; }
.glas-raster { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
.glas-k { padding: 12px; display: flex; flex-direction: column; gap: 3px; animation: rein .5s ease-out both, schweben2 6s ease-in-out infinite; }
.glas-k:nth-child(2n) { animation-delay: 0s, -3s; } .glas-illu { margin: -4px -6px -2px; filter: drop-shadow(0 12px 14px rgba(0,0,0,.35)); }
.glas-name { font-weight: 600; font-size: 15px; } .glas-zeile { display: flex; justify-content: space-between; align-items: baseline; } .glas-wert { font-size: 26px; font-weight: 300; } .glas-kwk { font-size: 12px; opacity: .75; }
.glas-status { display: flex; align-items: center; gap: 6px; font-size: 12px; opacity: .85; } .glas-dot { width: 8px; height: 8px; border-radius: 50%; background: var(--c); box-shadow: 0 0 10px var(--c); animation: atmen 2s infinite; }
.glas-nav { position: absolute !important; left: 14px; right: 14px; bottom: 22px; display: flex; justify-content: space-around; padding: 13px 4px; font-size: 13px; } .glas-nav .on { font-weight: 700; }
/* ---------- Architektonisch ---------- */
.ar { --grund: #f4f1ea; --flaeche: #fbf9f5; --ink: #232322; --ink2: #6b6964; --linie: #dcd7cc; --bern: #c8871e; --bern-w: rgba(200,135,30,.12); --warn: #b4452f;
  height: 100%; overflow-y: auto; background: var(--grund); color: var(--ink); position: relative;
  font-family: "Helvetica Neue", "Inter", system-ui, sans-serif; font-feature-settings: "tnum"; }
.dunkel .ar { --grund: #1b1b1a; --flaeche: #222220; --ink: #f1ede4; --ink2: #9a968d; --linie: #34332f; --bern: #e0a040; --bern-w: rgba(224,160,64,.12); --warn: #e0765f; }
.ar-status { display: flex; justify-content: space-between; padding: 17px 28px 0; font-size: 13px; font-weight: 600; }
.ar-kopf { padding: 34px 24px 20px; }
.ar-meta { display: flex; justify-content: space-between; font-size: 11px; letter-spacing: 2px; color: var(--ink2); font-weight: 600; }
.ar-marke { display: flex; align-items: center; gap: 6px; color: var(--ink); } .ar-marke i { width: 6px; height: 6px; background: var(--bern); }
.ar h1 { margin: 14px 0 0; font-size: 40px; line-height: 1.02; font-weight: 700; letter-spacing: -1.4px; }
.ar-kennz { display: grid; grid-template-columns: repeat(3, 1fr); margin: 0 24px; border-top: 1px solid var(--ink); border-bottom: 1px solid var(--linie); }
.ar-kennz div { padding: 14px 0 14px 12px; border-left: 1px solid var(--linie); } .ar-kennz div:first-child { border-left: 0; padding-left: 0; }
.ar-kennz b { display: block; font-size: 28px; font-weight: 600; letter-spacing: -.8px; } .ar-kennz span { font-size: 11px; color: var(--ink2); letter-spacing: .3px; }
.ar-steuer { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin: 18px 24px 0; }
.ar-schalter { display: flex; align-items: center; gap: 10px; cursor: pointer; user-select: none; }
.ar-sl { font-size: 11px; letter-spacing: 2px; font-weight: 700; }
.ar-spur { width: 46px; height: 22px; border: 1.5px solid var(--ink); position: relative; transition: background .25s ease; }
.ar-spur i { position: absolute; top: 3px; left: 3px; width: 14px; height: 13px; background: var(--ink); transition: transform .25s cubic-bezier(.3,.7,.2,1), background .25s; }
.ar-schalter.an .ar-spur { background: var(--bern-w); border-color: var(--bern); } .ar-schalter.an .ar-spur i { transform: translateX(23px); background: var(--bern); }
.ar-info { font-size: 12px; color: var(--ink2); text-align: right; }
.ar-chips { display: flex; gap: 8px; margin: 16px 24px 0; flex-wrap: wrap; }
.ar-chips span { display: flex; align-items: center; gap: 5px; font-size: 12px; padding: 5px 10px; border: 1px solid var(--linie); background: var(--flaeche); }
.ar-chips .warn { color: var(--warn); border-color: currentColor; }
.ar-abschnitt { display: flex; justify-content: space-between; margin: 30px 24px 0; padding-bottom: 8px; border-bottom: 1px solid var(--ink); font-size: 11px; letter-spacing: 2px; text-transform: uppercase; font-weight: 700; }
.ar-raster { display: grid; grid-template-columns: 1fr 1fr; margin: 0 24px 120px; }
.ar-zelle { padding: 14px 12px 16px 0; border-bottom: 1px solid var(--linie); display: flex; flex-direction: column; gap: 2px; cursor: pointer; position: relative;
  animation: rein .4s ease-out both; transition: background .2s ease; }
.ar-zelle:nth-child(2n) { padding: 14px 0 16px 12px; border-left: 1px solid var(--linie); }
.ar-zelle:hover { background: var(--flaeche); }
.ar-zelle.aktiv::before { content: ""; position: absolute; left: 0; top: -1px; width: 28px; height: 2px; background: var(--bern); }
.ar-zelle:nth-child(2n).aktiv::before { left: 12px; }
.ar-zk { display: flex; justify-content: space-between; font-size: 11px; color: var(--ink2); letter-spacing: 1px; } .ar-nr { font-weight: 700; color: var(--ink); }
.ar-illu { margin: 4px -4px 0; } .ar-illu .bc { filter: saturate(.3) contrast(.95); transition: filter .3s; } .ar-zelle.aktiv .ar-illu .bc { filter: saturate(.55); }
.ar-name { font-size: 14px; font-weight: 700; margin-top: 4px; } .ar-wert { font-size: 30px; font-weight: 600; letter-spacing: -1px; line-height: 1.1; }
.ar-zust { display: flex; align-items: center; gap: 6px; font-size: 12px; color: var(--ink2); } .ar-zust i { width: 6px; height: 6px; background: var(--linie); }
.ar-zelle.aktiv .ar-zust { color: var(--ink); } .ar-zelle.aktiv .ar-zust i { background: var(--bern); animation: atmen 2.4s ease-in-out infinite; }
.ar-zelle.offline .ar-zust { color: var(--warn); } .ar-zelle.offline .ar-zust i { background: var(--warn); }
.ar-geraete { font-size: 11px; color: var(--ink2); }
.ar-neu { justify-content: center; align-items: flex-start; color: var(--ink2); font-size: 13px; gap: 6px; } .ar-neu span { font-size: 28px; font-weight: 300; color: var(--ink); }
.ar-nav { position: absolute; left: 0; right: 0; bottom: 0; display: flex; justify-content: space-between; padding: 14px 24px 28px; background: color-mix(in srgb, var(--grund) 92%, transparent);
  backdrop-filter: blur(10px); -webkit-backdrop-filter: blur(10px); border-top: 1px solid var(--linie); font-size: 13px; color: var(--ink2); }
.ar-nav span { position: relative; padding-bottom: 6px; cursor: pointer; transition: color .2s; } .ar-nav .on { color: var(--ink); font-weight: 700; }
.ar-nav .on::after { content: ""; position: absolute; left: 0; right: 0; bottom: 0; height: 2px; background: var(--bern); }
@keyframes schweben { 50% { transform: translate(30px, 40px) scale(1.15); } }
@keyframes schweben2 { 50% { transform: translateY(-3px); } }
`;
const V = [['A · iOS', 'Großer Titel, Umschalter oben, Container als iOS-Widgets, Milchglas-Tableiste, gruppierte Liste, grüne Schalter.', ios],
  ['B · One UI (Samsung)', 'Oben ein ruhiger Kopfbereich mit Kennzahlen, bedient wird unten für den Daumen: runde Karten, Chips, „+“-Knopf, Navigation unten.', oneui],
  ['C · Glas (wie visionOS)', 'Milchglas-Kacheln über einem sanft bewegten Farbverlauf; Container schweben leicht, Licht und Tiefe.', glas],
  ['D · Architektonisch', 'Warmes Off-White, Graphit, Bernstein nur für Aktives. Präzises Raster mit Haarlinien, große Zahlen, eigener Schalter, kurze Übergänge – keine Verläufe, kaum Glas.', arch]];
const html = `<!DOCTYPE html><html lang="de"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Baustellenübersicht – Stilvarianten</title>
<style>${css}${animCss}${wCss}</style></head><body class="licht hell"><div class="bar"><b>Baustellenübersicht – iOS · One UI · Glas · Architektonisch</b>
<button onclick="document.body.classList.toggle('licht');document.body.classList.toggle('dunkel');document.body.classList.toggle('hell')">Hell / Dunkel</button>
<span style="font-size:12px;opacity:.7">Beispieldaten · Container-Grafiken wie in der Baustellenübersicht</span></div>
<div class="buehne">${V.map(([t, e, h]) => `<div class="v"><h2>${t}</h2><p>${e}</p><div class="telefon">${h}</div></div>`).join('')}</div></body></html>`;
fs.writeFileSync(process.argv[2], html);
console.log('ok', Math.round(html.length / 1024), 'KB', /undefined|NaN/.test(html) ? 'FEHLER' : 'sauber');
