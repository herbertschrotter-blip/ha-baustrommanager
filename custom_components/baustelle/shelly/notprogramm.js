// Notprogramm „Baustelle“ für Shelly Plug S Gen3 (Bauplan 0.7 §9, BSM-016). Die Integration spielt es ein.
//
// Solange Home Assistant sich meldet (Lebenszeichen), tut das Skript nichts – HA steuert. Bleibt das Lebenszeichen
// HB_MAX_MIN aus (auch nach einem Neustart des Plugs), schaltet es nach dem Programm, das HA in den Speicher (KVS) geschrieben hat, bis HA zurück ist. Es
// rechnet keine Fachregeln: Fenster, Soll, Frostgrenzen kommen fertig von HA (Feiertage, Urlaub, Vorheizen eingerechnet).
//
// Speicher (schreibt HA; Grenzen am Gerät: Wert ≤ 253 Zeichen, ≤ 50 Schlüssel):
//   bs_cfg  {"v":1,"m":"plan|thermo|bedarf|hand|aus","tol":0.3,"fe":5,"fa":7,"t":202,"d":[203,207],"tp":3}
//           m Modus, tol Toleranz, fe/fa Frostschutz ein unter/aus über (°C, null = aus), t Nummer des Messwerts
//           Temperatur (bthomesensor:<nr>, null = keiner), d Nummern der Türen und Fenster (Liste, bis 0.8.118 eine
//           Nummer; null = keine) – irgendeiner offen zählt, tp Tür-Pause in Minuten, vs Startversatz in Minuten
//           (jeder Plug schaltet versetzt ein), nf 1 = im Notbetrieb nur Frostschutz (Anschluss sonst zu voll)
//   bs_p0 … bs_p6  Fenster „start,ende,soll;…“ in Unix-Sekunden (UTC, keine Zeitzonen im Gerät)
//   bs_f    Frost-Fenster „start,ende;…“: ohne frischen Fühlerwert dann an (Vorhersage unter der Frostgrenze außen)
// Lebenszeichen: HA ruft alle 5 min  http://<plug>/script/<id>/hb  auf (?neu = Programm neu laden); die Antwort nennt
//   Version, Stand des Programms, Notbetrieb seit (0 = nein) und das Ende der Taste.
// Stundenbuch (nur im Notbetrieb): bb_<0…27> = „stunde,wh,min_ein,temp*10,tuer_s;…“ – 6 Stunden je Schlüssel, 7 Tage
//   im Ring; HA holt es nach dem Ausfall ab und trägt es nach (BSM-020).
// Grenzen am Gerät (BSM-013): höchstens 5 gleichzeitige Aufrufe je Skript – hier höchstens zwei; Arbeitsspeicher
// für alle Skripte zusammen knapp (Plug S Gen3) – Fenster als Zahlenlisten, keine großen Objekte.

let VERSION = 8;
let HB_MAX_MIN = 15;        // Minuten ohne Lebenszeichen → Notbetrieb (gezählt, braucht keine Uhrzeit)
let FUEHLER_MAX_S = 1800;   // älterer Fühlerwert gilt als weg → im Thermostat wie Zeitplan
let TASTE_S = 3600;         // Taste: 1 h heizen
let BUCH_N = 28;            // Schlüssel im Stundenbuch (28 × 6 h = 7 Tage)

// Ganz oben: Die Shelly-Integration liest nur die ersten 5120 Zeichen eines Skripts und legt nur für die Ereignisse, die
// sie darin findet, die Event-Entität an (Taste in HA, BSM-018). Steht der Aufruf weiter unten, fehlt sie (Audit 0.8.165).
function tasteMelden(bis) { Shelly.emitEvent("baustelle_taste", { bis: bis }); }

let cfg = null, fen = [], ff = [], still = 0, nbSeit = 0, frost = false, taste = 0, tuerSeit = 0, einWarte = 0;
let bStunde = 0, bE0 = -1, bSek = 0, bTs = 0, bTn = 0, bTuer = 0;

function jetzt() { let s = Shelly.getComponentStatus("sys"); return s && s.unixtime ? s.unixtime : 0; }   // 0 = keine Uhrzeit

function laden() {   // ein Aufruf für alles
  Shelly.call("KVS.GetMany", { match: "bs_*" }, function (r) {
    if (!r || !r.items) return;
    let c = null, f = [], g = [];
    for (let i = 0; i < r.items.length; i++) {
      let k = r.items[i].key, w = r.items[i].value;
      if (k === "bs_cfg") c = JSON.parse(w);
      else if (k === "bs_f" && w) {
        let teile = w.split(";");
        for (let j = 0; j < teile.length; j++) {
          let x = teile[j].split(",");
          if (x.length === 2) g.push([JSON.parse(x[0]), JSON.parse(x[1])]);
        }
      }
      else if (k.indexOf("bs_p") === 0 && w) {
        let teile = w.split(";");
        for (let j = 0; j < teile.length; j++) {
          let x = teile[j].split(",");
          if (x.length === 3) f.push([JSON.parse(x[0]), JSON.parse(x[1]), JSON.parse(x[2])]);
        }
      }
    }
    cfg = c; fen = f; ff = g;
  });
}

function wert(nr) {   // [wert, alter in s] oder null
  if (nr === null || nr === undefined) return null;
  let s = Shelly.getComponentStatus("bthomesensor:" + nr);
  if (!s || s.value === undefined || s.value === null) return null;
  let t = jetzt();
  return [s.value, t && s.last_updated_ts ? t - s.last_updated_ts : 0];
}

function fenster(t) {
  for (let i = 0; i < fen.length; i++) if (fen[i][0] <= t && t < fen[i][1]) return fen[i];
  return null;
}

function frostFenster(t) {
  for (let i = 0; i < ff.length; i++) if (ff[i][0] <= t && t < ff[i][1]) return true;
  return false;
}

function offen() {   // irgendeine Tür bzw. ein Fenster offen (BSM-034.03)
  let d = cfg.d;
  if (d === null || d === undefined) return false;
  if (typeof d === "number") d = [d];
  for (let i = 0; i < d.length; i++) { let w = wert(d[i]); if (w !== null && w[0] === true) return true; }
  return false;
}

function an() { return Shelly.getComponentStatus("switch", 0).output; }

// Soll die Heizung jetzt an sein? true/false, null = nicht anfassen (nur Tabelle ausführen, keine Fachregeln;
// Reihenfolge wie logik/regelung: Frost → Tür → Taste → Hand → Aus → Fenster)
function entscheiden(t) {
  let temp = wert(cfg.t);
  let ok = temp !== null && temp[1] < FUEHLER_MAX_S;
  let frostEnde = false;
  if (ok && cfg.fe !== null && cfg.fe !== undefined) {   // Frostschutz in jedem Modus
    if (temp[0] < cfg.fe) frost = true;
    if (frost && temp[0] >= cfg.fa) { frost = false; frostEnde = true; }
    if (frost) return true;
  }
  if (t === 0) return false;                               // ohne Uhrzeit nur Frostschutz
  if (!ok && cfg.fe !== null && cfg.fe !== undefined && frostFenster(t)) return true;   // ohne Fühler: Vorhersage
  if (offen()) { if (!tuerSeit) tuerSeit = t; if (t - tuerSeit > cfg.tp * 60) return false; }
  else tuerSeit = 0;
  if (taste > t) return true;                              // Taste: 1 h heizen
  if (cfg.nf) return cfg.m === "hand" ? (frostEnde ? false : null) : false;   // Anschluss: nur Frostschutz
  if (cfg.m === "hand") return frostEnde ? false : null;   // Frost vorbei: einmal aus, danach nicht anfassen
  if (cfg.m === "aus") return false;
  let f = fenster(t);
  if (f === null) return false;
  if (cfg.m === "thermo" && ok) {
    if (temp[0] < f[2] - cfg.tol) return true;
    if (temp[0] > f[2] + cfg.tol) return false;
    return an();
  }
  return true;                                             // Zeitplan, Bei Bedarf, Thermostat ohne Fühler
}

function schalten(soll, sofort) {   // ein erst nach dem Startversatz (cfg.vs Minuten), außer sofort (Taste)
  if (soll !== true || an()) einWarte = 0;
  if (soll === null || soll === an()) return;
  if (soll && !sofort && cfg.vs && ++einWarte <= cfg.vs) return;
  einWarte = 0;
  Shelly.call("Switch.Set", { id: 0, on: soll });
}

// Stundenbuch: je Stunde Wh, Minuten ein, Ø Temperatur*10, Tür offen in s – geschrieben beim Stundenwechsel und, für
// die angefangene Stunde, beim ersten Lebenszeichen nach dem Notbetrieb (HA trägt es danach nach, BSM-020)
function stundeAbschliessen(e) {
  let eintrag = bStunde + "," + Math.round(e - bE0) + "," + Math.round(bSek / 60) + "," + (bTn ? Math.round(bTs / bTn * 10) : "") + "," + bTuer;
  let key = "bb_" + (Math.floor(bStunde / 6) % BUCH_N), block = Math.floor(bStunde / 6);
  Shelly.call("KVS.Get", { key: key }, function (r) {
    let alt = r && r.value ? r.value.split(";") : [];
    if (alt.length && Math.floor(JSON.parse(alt[0].split(",")[0]) / 6) !== block) alt = [];   // Ring: alter Block
    alt.push(eintrag);
    Shelly.call("KVS.Set", { key: key, value: alt.join(";") });
  });
  bSek = 0; bTs = 0; bTn = 0; bTuer = 0;
}

function buchen(t) {
  let sw = Shelly.getComponentStatus("switch", 0), e = sw.aenergy ? sw.aenergy.total : 0, h = Math.floor(t / 3600);
  if (bStunde && h !== bStunde) stundeAbschliessen(e);
  if (!bStunde || h !== bStunde) { bStunde = h; bE0 = e; }
  if (sw.output) bSek += 60;
  let temp = cfg ? wert(cfg.t) : null;
  if (temp !== null) { bTs += temp[0]; bTn++; }
  if (tuerSeit) bTuer += 60;
}

// jede Minute
Timer.set(60000, true, function () {
  if (cfg === null) return;
  let t = jetzt();
  still++;
  if (still <= HB_MAX_MIN) { nbSeit = 0; bStunde = 0; return; }   // HA steuert
  if (!nbSeit) nbSeit = t || 1;
  schalten(entscheiden(t));
  if (t) buchen(t);
});

// Lebenszeichen von HA
HTTPServer.registerEndpoint("hb", function (req, res) {
  res.code = 200;
  res.body = JSON.stringify({ v: VERSION, programm: cfg ? cfg.v : null, fenster: fen.length, nb: nbSeit, taste: taste });
  res.send();
  if (nbSeit && bStunde) { let sw = Shelly.getComponentStatus("switch", 0); stundeAbschliessen(sw.aenergy ? sw.aenergy.total : 0); bStunde = 0; }
  still = 0; nbSeit = 0;
  if (req.query && req.query.indexOf("neu") >= 0) laden();
});

// Taste: 1 h heizen bzw. beenden – mit HA nur melden (HA setzt „Taste“, die Regelung übernimmt das Relais), ohne HA selbst.
// Die Taste bleibt am Relais (ab Werk „momentary“): ein Druck schaltet um und der Plug meldet die Quelle „button“
// (am Gerät geprüft 06.10.2026, BSM-018; „detached“ legt die Taste beim Plug S Gen3 still). Bluetooth-Tasten zählen nicht.
Shelly.addStatusHandler(function (ev) {
  if (!ev || ev.component !== "switch:0" || !ev.delta || ev.delta.source !== "button" || ev.delta.output === undefined) return;
  let t = jetzt();
  taste = taste > t ? 0 : t + TASTE_S;
  tasteMelden(taste);
  if (cfg !== null && still > HB_MAX_MIN) schalten(entscheiden(t), true);
});

laden();
