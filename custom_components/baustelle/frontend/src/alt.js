/* =========================================================================================
   Baustelle – eigene Seite in Home Assistant (0.7.0), gebaut aus dem abgenommenen Mockup mockups/glas.html
   (Quellen mockups/quelle/: glas-app.js, glas.css, himmel.frag, himmel.js).
   Daten: WebSocket „baustelle/struktur“ (docs/api-0.7.md §1), Verlauf/Statistik aus dem Recorder.
   Bedienung: baustelle/setzen|aktion|liste|protokoll|meldung(en) (api §2) und die HA-Standardwege
   (Subentry-/Options-Dialoge, calendar/event/*, Diagnose). Gerechnet wird in der Integration, nicht hier.
   ========================================================================================= */
import { AW_BAUSTEINE, AW_HOEHE, AW_SPEICHER, AW_VORLAGEN, KK, KK_JEDES, KK_SPEICHER, KK_START, ST_KACHEL, awStufe, awStufen } from './kacheln-daten.js';
import { ARTEN, AUSNAHME, MODI, TEXT, TICKET_STATUS, WETTER_TEXT, WIEDER, illu, kwVon } from './tabellen.js';

import { Himmel, himmelLauf, partikel, phaseAusSonne } from './himmel.js';
import { CHARTS, balken, flaeche, funke, kkBalken, linie, luecke, streu, stufen } from './diagramme.js';

import { MONATE, TAGE, addieren, datum, dauer, de, esc, kurzDatum, minu, plusTage, stdMin, summe, tageZwischen, uhr, verNeuer, wtag, zahl, zrInfo, zrVersatz } from './hilfen.js';
import { BEREICH_FARBEN, ICON_COG, ICON_MELDEN, SYMBOL_STANDARD, sigHtml, sigStufe } from './symbole.js';
import { bauen, lokal, minSeitAb, protokollZeile, zoneMs } from './daten.js';
import { NUR_ANSEHEN, NUR_LESEN_SPERRE, darfSenden, rechteVon } from './rechte.js';
import { fehlerText, flowFehler, nachricht } from './api.js';
import { LitElement, html, nothing, unsafeCSS } from 'lit';
import { unsafeHTML } from 'lit/directives/unsafe-html.js';
import { keyed } from 'lit/directives/keyed.js';
import { ueberVorlage } from './ueber.js';
import { MB_MAX, MB_PX, MB_SUMME, meldenVorlage } from './melden.js';
import { ladenVorlage, leerVorlage } from './ansichten/allgemein.js';
import { devVorlage } from './ansichten/dev.js';
import { bsdetailVorlage, verlaufVorlage } from './ansichten/verlauf.js';
import { pumpenVorlage, schachtVorlage } from './ansichten/pumpen.js';
import { containerVorlage } from './ansichten/container.js';
import { CONTAINER_EINBLENDUNGEN } from './ansichten/einblendungen-container.js';
import { heizungVorlage, hzEinblendung } from './ansichten/heizung.js';
import { HEIZUNG_EINBLENDUNGEN } from './ansichten/einblendungen-heizung.js';
import { einstellungenVorlage } from './ansichten/einstellungen.js';
import { BAUSTELLE_EINBLENDUNGEN } from './ansichten/einblendungen-baustelle.js';
import { EINRICHTUNG_EINBLENDUNGEN } from './ansichten/einblendungen-einrichtung.js';
import { npPlugEinblendung } from './ansichten/notprogramm.js';
import { INVENTAR_EINBLENDUNGEN, INV_BREIT, INV_CSS } from './ansichten/inventar.js';
import { GERAETE_CSS, GERAETE_EINBLENDUNGEN } from './ansichten/geraete.js';
import { HEIZPERIODE_CSS, HEIZPERIODE_EINBLENDUNGEN, hochrechnungSvg } from './ansichten/heizperiode.js';
import { BASELINE_CSS } from './ansichten/baseline.js';
import { uebersichtVorlage } from './ansichten/uebersicht.js';
import { katalogEinblendung } from './ansichten/kacheln.js';
import { UEBERSICHT_EINBLENDUNGEN } from './ansichten/einblendungen-uebersicht.js';
import { auswertungVorlage, awDetailEinblendung } from './ansichten/auswertung.js';
import { WISCHEN_CSS, wischTaste, wischenAn } from './ansichten/wischen.js';
import { START_STIL } from './ansichten/start.js';

const CSS = `/* Wetter */
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

/* Glas-Stil aus dem Mockup (mockups/quelle/glas.css) */
const GLAS_CSS = `:host { display: block; height: 100%; }
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
${NUR_LESEN_SPERRE.map(x => `.nur-lesen ${x}`).join(', ')} { opacity: .45; filter: grayscale(1); cursor: not-allowed; }
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
.ger-sig i:nth-child(3) { height: 75%; } .ger-sig i:nth-child(4) { height: 100%; } .ger-sig i.an { background: var(--ink); } .ger-sig.s1 i.an { background: var(--rot); } a.zeile.ger:hover { background: rgba(127,127,127,.1); }
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
.sr-lage { font-size: 13px; margin: -2px 2px 8px; color: var(--ink2); }   /* AN-0017: Kopfzeile der Integration */
.tr-stufe + .tr-stufe { border-top: 1px solid var(--gridc); margin-top: 6px; padding-top: 4px; }   /* AN-0021: Stufen Kleidung trocknen */
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

const LAEDT = '<div class="leer">Lädt …</div>';

const TYP_ROLLE = { Ölradiator: ['heizkoerper', 'oelradiator'], Konvektor: ['heizkoerper', 'konvektor'], Bautrockner: ['bautrockner', 'oelradiator'],
  Steckdose: ['steckdose', 'oelradiator'], Pumpe: ['pumpe', 'oelradiator'] };
/* Einstellungen: Schlüssel der Seite (wie im Mockup) → Pfad im Store (bauplan §1) */
const PFAD = { preis: ['preis'], melden: ['melden_knopf'], feiertag_frei: ['heizung', 'feiertag_frei'], boost_min: ['heizung', 'boost_min'], toleranz: ['heizung', 'toleranz'], hand_nachfrist: ['heizung', 'hand_nachfrist_min'],
  fuehler_halten: ['heizung', 'fuehler_halten_min'], zieht_w: ['heizung', 'zieht_strom_w'],
  staffel: ['staffel', 'an'], nutzbar: ['staffel', 'nutzbar_prozent'], max_gleich: ['staffel', 'max_gleichzeitig'], min_lauf: ['staffel', 'min_lauf_min'],
  min_pause: ['staffel', 'min_pause_min'], takt: ['staffel', 'takt_min'], tuer_pause: ['heizung', 'tuer_pause_min'], tuer_melden: ['heizung', 'tuer_melden_min'],
  knoepfe: ['meldungen_einst', 'knoepfe'], bericht: ['bericht', 'haeufigkeit'], bericht_handy: ['bericht', 'handy'], bericht_mail: ['bericht', 'mail'],
  mail: ['bericht', 'mail_an'], bericht_csv: ['bericht', 'csv'], vorheizen: ['heizung', 'vorheizen_min'], nachheizen: ['heizung', 'nachheizen_min'], warm_vor: ['heizung', 'warm_vor_min'], frost_aussen: ['heizung', 'frost_aussen'], warm_nach: ['heizung', 'warm_nach_min'], warm_max: ['heizung', 'warm_max_min'], stufen_abstand: ['heizung', 'stufen_abstand'], stufen_min: ['heizung', 'stufen_min'], stufen_anstieg: ['heizung', 'stufen_anstieg'], stufen_kalt: ['heizung', 'stufen_kalt'],
  soll: ['heizung', 'soll'], soll_art: ['heizung', 'soll_art'], gleit_min: ['heizung', 'gleit_min'], gleit_max: ['heizung', 'gleit_max'],
  gleit_je: ['heizung', 'gleit_je'], gleit_bezug: ['heizung', 'gleit_bezug'], gleit_tage: ['heizung', 'gleit_tage'], grenze: ['heizung', 'heizgrenze'], basis: ['heizung', 'heizgrenze_basis'], fruehstart: ['heizung', 'fruehstart'],
  frueh_temp: ['heizung', 'fruehstart_unter'], frueh_min: ['heizung', 'fruehstart_min'], frost: ['heizung', 'frost'], frost_temp: ['heizung', 'frost_grenze'],
  tr_mm: ['heizung', 'trocknen_ab_mm'], tr_laenger: ['heizung', 'trocknen_laenger_min'], tr_frueher: ['heizung', 'trocknen_frueher_min'],
  dauer_min: ['meldungen_einst', 'dauerlauf_min'], kalt_min: ['meldungen_einst', 'kalt_min'], hand_h: ['meldungen_einst', 'hand_h'], zyklen_h: ['meldungen_einst', 'zyklen_h'],
  // aus 0.6.3 zurück (0.7.8, api §7)
  frost_aus: ['heizung', 'frost_aus'], urlaub: ['heizung', 'frei_modus'], absenk: ['heizung', 'absenk'], offline_min: ['meldungen_einst', 'offline_min'],
  trocken_w: ['meldungen_einst', 'trocken_unter_w'], erklaer: ['erklaer'], frost_immer: ['heizung', 'frost_immer'], notprogramm: ['heizung', 'notprogramm'], taste: ['heizung', 'taste'] };
/* Grenzen der Stepper: Untergrenze wie im Mockup, sonst die erlaubten Werte der Integration (panel.py SETZEN) –
   so schickt die Seite nie einen Wert, den die Integration ablehnt */
const GRENZEN = { nutzbar: [30, 100], max_gleich: [1, 50], min_lauf: [1, 120], min_pause: [0, 120], takt: [5, 240], tuer_pause: [1, 120], tuer_melden: [1, 240],
  vorheizen: [0, 240], nachheizen: [0, 240], soll: [5, 30], gleit_min: [5, 30], gleit_max: [5, 30], gleit_je: [0, 0.5], gleit_bezug: [0, 20], gleit_tage: [1, 7], grenze: [0, 30], frueh_temp: [-15, 20], frueh_min: [0, 240], frost_temp: [0, 15],
  tr_mm: [0, 100], tr_laenger: [0, 480], tr_frueher: [0, 240], boost_min: [5, 480], toleranz: [0.1, 3], hand_nachfrist: [0, 240], fuehler_halten: [0, 120], zieht_w: [5, 500],
  frost_aus: [1, 20], absenk: [5, 20], offline_min: [1, 1440], trocken_w: [5, 5000], dauer_min: [5, 1440], zyklen_h: [2, 200], kalt_min: [15, 1440], hand_h: [1, 240], warm_vor: [0, 240], warm_nach: [0, 240], frost_aussen: [-20, 10], warm_max: [15, 480], stufen_abstand: [0.5, 10], stufen_min: [5, 240], stufen_anstieg: [0, 5], stufen_kalt: [-30, 15] };
const MODUS_TEXT = { plan: 'an in der Heizzeit – der Thermostat am Heizkörper regelt', thermo: 'in der Heizzeit auf das Soll nach dem Fühler',
  bedarf: 'nur per Schalter oder Termin, sonst Frostschutz', hand: 'die Automatik schaltet nicht – Schalter unten', aus: 'alles aus, Frostschutz bleibt' };
const STUNDEN = [...Array(24)].map((_, h) => String(h).padStart(2, '0'));
/* Abschnitte der Integration → Klassen der Zeitleiste im Mockup */
const ABSCHNITT = { fruehstart: 'extra', vorheizen: 'vor', nachheizen: 'vor', arbeitszeit: 'heiz', trocknen: 'trock', termin: 'termin', fenster: 'eigen' };
/* Wetter der Baustelle (weather.*) → Stimmung des Hintergrunds und Text im Kopf */
const WETTER_STIMMUNG = { sunny: 'klar', 'clear-night': 'klar', exceptional: 'klar', partlycloudy: 'wolkig', cloudy: 'wolkig', windy: 'wolkig', 'windy-variant': 'wolkig',
  rainy: 'regen', pouring: 'regen', hail: 'regen', lightning: 'gewitter', 'lightning-rainy': 'gewitter', fog: 'nebel', snowy: 'schnee', 'snowy-rainy': 'schnee' };
const AKTIV = z => ['heizt', 'trocknen', 'frost', 'laeuft'].includes(z);

/* Einblendungen: Unterdialoge aus „Baustelle bearbeiten“ kehren beim Schließen dorthin zurück (AN-0002);
   s.leeren() schließt alles (Seitenwechsel, Abschließen) */
function einblendungen(s) {
  let jetzt = s.sheet || null, eltern = null;
  Object.defineProperty(s, 'sheet', { enumerable: true, get: () => jetzt, set: v => {
    if (v && v.art === 'bs-bearbeiten') eltern = null;
    else if (v && jetzt && ['bs-bearbeiten', 'bereich'].includes(jetzt.art) && v !== jetzt && v.art !== jetzt.art) eltern = jetzt;
    else if (!v && eltern && jetzt !== eltern) { v = eltern; eltern = null; }
    else if (!v) eltern = null;
    jetzt = v || null; } });
  s.leeren = () => { eltern = null; jetzt = null; };
  return s;
}

/* ---------- Seite ---------- */
const STATISCH = '/baustelle_static';
const SEITE_VERSION = __BAUSTELLE_VERSION__;   // Version dieser Seite – beim Bauen aus version.json (tools/changelog.py → bauen.mjs, BSM-022)
const LIT_SHEETS = ['melden', 'leistung', 'heizzeit-c', 'bedarf', 'termin', 'lernen', 'hz', 'heizplan', 'az', 'ausnahme', 'az-neu', ...Object.keys(BAUSTELLE_EINBLENDUNGEN), ...Object.keys(EINRICHTUNG_EINBLENDUNGEN), 'np-plug', ...Object.keys(INVENTAR_EINBLENDUNGEN), ...Object.keys(GERAETE_EINBLENDUNGEN), ...Object.keys(HEIZPERIODE_EINBLENDUNGEN), 'kk-katalog', ...Object.keys(UEBERSICHT_EINBLENDUNGEN), 'aw-detail'];   // Einblendungen, die Lit zeichnet (BSM-022 2a.2, 3d)
class BaustellePanel extends LitElement {
  static styles = [unsafeCSS(CSS), unsafeCSS(GLAS_CSS), unsafeCSS(INV_CSS), unsafeCSS(GERAETE_CSS), unsafeCSS(HEIZPERIODE_CSS), unsafeCSS(BASELINE_CSS), unsafeCSS(WISCHEN_CSS), unsafeCSS(START_STIL)];   // BSM-022 2b: Stile über Lit (adoptedStyleSheets)
  constructor() {
    super();
    this.s = einblendungen({ view: 'uebersicht', cid: null, sheet: null, chart: 'temp', verlauf: 'aktiv' });
    this.cache = {}; this.roh = null; this.alle = []; this.d = null; this.bid = null; this.fehler = null;
    this.vorhersage = { daily: null, hourly: null }; this.abos = []; this.changelog = null;
    this.st = { phase: 'tag', wetter: 'wolkig', hell: false };
    try { const u = JSON.parse(localStorage.getItem('baustelle-panel') || '{}'); this.bid = u.bid || null; } catch (e) { /* ohne Speicher */ }
  }

  /* ---- Lebenszyklus (panel_custom: hass, narrow, panel) ---- */
  set hass(h) {
    const erst = !this._hass;
    this._hass = h;
    if (erst) { this._starten(); this.requestUpdate(); } else this._beobachten(h);
    this._stimmung();
  }
  get hass() { return this._hass; }
  set narrow(n) { const alt = this._narrow; this._narrow = !!n; if (alt !== undefined && alt !== this._narrow) this.neuZeichnen(); }
  get narrow() { return this._narrow; }
  set panel(p) { this._panel = p; }
  get panel() { return this._panel; }
  connectedCallback() {
    super.connectedCallback(); this._fensterAn();
    if (this._hass && !this._timer) this._starten();
    this._vorhersageAbo();   // BSM-022.03: nach dem Wiedereinhängen die Wetter-Abos neu (_laden bricht bei unveränderter Struktur vorher ab)
    if (!this.himmel && this.bg) this.himmel = Himmel.an(this.bg); this._stimmung(true);
  }
  disconnectedCallback() {
    super.disconnectedCallback();
    clearInterval(this._timer); this._timer = null; clearTimeout(this._nachladen);
    this._aboEnde(); this._fensterAus(); if (this.himmel) { this.himmel.stop(); this.himmel = null; }
  }
  /* Listener am Fenster nur, solange die Seite eingehängt ist (BSM-022.03): sonst hält jede alte Seite sich selbst am Leben */
  _fensterAn() {
    if (this._fenster || typeof window === 'undefined' || !window.addEventListener) return;
    this._fenster = {
      // WU-0016: Screenshot mit Strg+V ins offene Melde-Fenster
      paste: e => { const sh = this.s && this.s.sheet; if (!sh || sh.art !== 'melden') return;
        const it = [...((e.clipboardData && e.clipboardData.items) || [])].find(i => i.type && i.type.startsWith('image/')); if (!it) return;
        e.preventDefault(); this.mbDatei(it.getAsFile(), 'eingefügt'); },
      'location-changed': () => { this._adresseFertig = null; setTimeout(() => this._adresse(), 0); },
      keydown: e => wischTaste(this, e),   // WU-0020: ← → blättert in der Container-Ansicht (Desktop)
    };
    for (const [art, f] of Object.entries(this._fenster)) window.addEventListener(art, f);
  }
  _fensterAus() {
    if (!this._fenster) return;
    for (const [art, f] of Object.entries(this._fenster)) window.removeEventListener(art, f);
    this._fenster = null;
  }
  _starten() {
    this._laden();
    clearInterval(this._timer); this._timer = setInterval(() => this._laden(), 60000);
    if (typeof fetch === 'function') fetch(`${STATISCH}/changelog.json?v=${encodeURIComponent(this.version)}`).then(r => r.ok ? r.json() : null)
      .then(c => { this.changelog = Array.isArray(c) ? c : []; if (this.s.view === 'ueber') this.neuZeichnen(); }).catch(() => { this.changelog = []; });
  }
  get version() { return (this.d && this.d.version) || (this._panel && this._panel.config && this._panel.config.version) || '–'; }
  get seiteVersion() { return SEITE_VERSION; }   // Version dieser Seite (Bundle); version = Integration, gelesen beim Start von HA

  /* Der Rahmen steht nach dem ersten Zeichnen (render(), BSM-022 2b) und bleibt. Klicks und Eingaben hängen an den
     Lit-Vorlagen (@click/@input/@change); hier nur Zeiger (Tooltip der Diagramme, Ziehen im Raster) und Fokus */
  firstUpdated() {
    const sr = this.renderRoot;
    this.wurzel = sr.querySelector('.wurzel'); this.root = sr.querySelector('.app');
    this.bg = sr.querySelector('.glas-bg'); this.ui = sr.querySelector('.ui');
    sr.addEventListener('pointermove', e => this.hover(e));
    sr.addEventListener('pointerdown', e => this.zugStart(e));   // WU-0005: Layout der Auswertung (ziehen, Größe)
    wischenAn(this, sr);   // WU-0020: in der Container-Ansicht mit Finger oder Stift zum nächsten Container wischen
    sr.addEventListener('pointerleave', () => this.tip(null));
    // Tür/Fenster offen im Tagesdiagramm (cTag): antippen, Maus darüber; woanders tippen schließt
    sr.addEventListener('click', e => this.oeTippen(e)); sr.addEventListener('pointerover', e => this.oeZeigen(e)); sr.addEventListener('pointerout', e => this.oeWeg(e));
    sr.addEventListener('focusout', () => { if (this._wartet) { this._wartet = false; setTimeout(() => this._auffrischen(), 0); } });
    this.himmel = Himmel.an(this.bg);          // WebGL-Himmel; ohne WebGL bleibt der CSS-Hintergrund
    this._stimmung(true);
  }

  /* Eigene Entitäten geändert → Struktur kurz danach neu holen (Zustände kommen aus der Integration) */
  _beobachten(h) {
    const ids = this._eigene || [];
    let neu = !this._alt;
    if (this._alt) for (const id of ids) if (h.states[id] !== this._alt[id]) { neu = true; break; }
    this._alt = Object.fromEntries(ids.map(id => [id, h.states[id]]));
    if (neu && this._alt && ids.length && !this._nachladen) this._nachladen = setTimeout(() => { this._nachladen = null; this._laden(); }, 3000);
    // WU-0002: Diagramme und „kWh heute“ rechnen bis zum aktuellen Zählerstand – bei neuen Werten neu zeichnen (höchstens alle 10 s)
    if (neu && this.d && Date.now() - (this._liveGezeichnet || 0) > 10000) { this._liveGezeichnet = Date.now(); this._liveNeu(); }
  }

  async _laden() {
    if (!this._hass) return;
    try {
      const r = await this._hass.callWS({ type: 'baustelle/struktur' });
      // unverändert (bis auf die Uhrzeit) → nicht neu zeichnen; spätestens alle 5 min wegen der Jetzt-Marke
      const text = JSON.stringify(r, (k, v) => k === 'jetzt' ? undefined : v);
      if (text === this._rohText && !this.fehler && Date.now() - this._geholt < 300000) return;
      this._rohText = text; this._geholt = Date.now(); this.roh = Array.isArray(r) ? r : []; this.fehler = null;
      this._neuBauen();
      delete this.cache['p:' + (this.d && this.d.entry)];
    } catch (e) { this.fehler = (e && (e.message || e.code)) || String(e); if (!this.roh) this.roh = null; }
    this._vorhersageAbo(); this._stimmung(); this._adresse(); this._auffrischen(); this._versionPruefen();
  }
  /* Neuere Version als diese Seite? HA nach dem Neustart (struktur) oder eingespielt ohne Neustart (changelog.json auf der Platte) */
  _versionPruefen() {
    const vorher = this.neueVersion;
    for (const r of this.roh || []) if (verNeuer(r.version, this.neueVersion || SEITE_VERSION)) this.neueVersion = r.version;
    if (typeof fetch === 'function' && !(Date.now() - (this._platteGeprueft || 0) < 600000)) {
      this._platteGeprueft = Date.now();
      fetch(`${STATISCH}/changelog.json?t=${Date.now()}`, { cache: 'no-store' }).then(r => r.ok ? r.json() : null).then(c => {
        const v = Array.isArray(c) && c[0] && c[0].version;
        if (verNeuer(v, this.neueVersion || SEITE_VERSION)) { this.neueVersion = v; this.neuZeichnen(); }
      }).catch(() => {});
    }
    if (this.neueVersion !== vorher) this.neuZeichnen();
  }
  rechte() { return rechteVon(this.roh); }   /* Rechte und Sperren: src/rechte.js */
  nurLesen() { return !this.rechte().aendern; }
  darfSenden(msg) { return darfSenden(msg, this.rechte()); }
  nurLesenHinweis() {
    if (!this.roh || !this.nurLesen()) return nothing;
    return html`<div class="glas-panel neu-version nur-lesen-hinweis"><span>👁 ${NUR_ANSEHEN} <span class="leise">· jetzt heizen, Gefühl und Warnungen stumm gehen trotzdem</span></span></div>`;
  }
  versionHinweis() {
    if (!this.neueVersion) return nothing;
    return html`<div class="glas-panel neu-version"><span>Neue Version ${this.neueVersion} – bitte neu laden <span class="leise">(geladen ist ${SEITE_VERSION})</span></span><button class="chip" @click=${() => this.neuLaden()}>Neu laden</button></div>`;
  }
  async neuLaden() {
    this.toast('Lädt neu …');
    // Browser-Speicher auffrischen, sonst kommt nach dem Neuladen wieder die alte Datei
    const urls = [...new Set([this._panel && this._panel.config && this._panel.config.version, this.neueVersion, SEITE_VERSION].filter(Boolean))].map(v => `${STATISCH}/baustelle-panel.js?v=${encodeURIComponent(v)}`);
    await Promise.all([...urls, `${STATISCH}/baustelle-panel.js`].map(u => fetch(u, { cache: 'reload' }).catch(() => null)));
    location.reload();
  }
  _neuBauen() {
    this.alle = (this.roh || []).map(r => this.bauen(r));
    const aktiv = this.alle.filter(x => x.aktiv);
    this.d = aktiv.find(x => x.entry === this.bid) || aktiv[0] || null;
    if (this.d && this.d.entry !== this.bid) { this.bid = this.d.entry; this._merken(); }
    this._eigene = (this.roh || []).flatMap(r => Object.values(r.entitaeten || {}));
  }
  /* Adresse aus einer Handy-Nachricht (api §4): ?baustelle=<entry_id>&container=<bid>&ansicht=auswertung */
  _adresse() {
    const such = typeof location !== 'undefined' ? location.search : '';
    if (!such || such === this._adresseFertig || !this.roh) return;
    this._adresseFertig = such;
    const q = new URLSearchParams(such), bid = q.get('baustelle'), cid = q.get('container'), ansicht = q.get('ansicht');
    const x = bid && this.alle.find(y => y.entry === bid);
    if (x && x.aktiv) { this.bid = x.entry; this._merken(); this._neuBauen(); this._vorhersageAbo(); this._stimmung(true); }
    else if (x) { this.s.bs = x.entry; return this.gehe('bsdetail'); }
    if (cid && this.d && this.d.bereiche.some(b => b.id === cid)) return this.gehe('container', cid);
    if (['uebersicht', 'heizung', 'pumpen', 'auswertung', 'verlauf', 'einst'].includes(ansicht)) return this.gehe(ansicht);   // Ansichten über die Adresse (api §4)
    if (x) this.gehe('uebersicht');
  }
  _merken() { try { localStorage.setItem('baustelle-panel', JSON.stringify({ bid: this.bid })); } catch (e) { /* egal */ } }
  get z() { return this.d.z; }

  /* Hintergrund aus der Baustelle: Tageszeit (sun.sun), Wetter (Wetter-Entität), hell/dunkel (Theme) */
  _stimmung(erzwingen = false) {
    if (!this.bg || !this._hass) return;
    const h = this._hass, eid = this.d && this.d.wetterEid, w = eid && h.states[eid];
    const sonne = h.states['sun.sun'], phase = phaseAusSonne(sonne), wetter = WETTER_STIMMUNG[w && w.state] || 'wolkig', hell = !(h.themes && h.themes.darkMode);
    /* Sonne/Mond wandern und Farben gleiten stufenlos (WU-0001): bei jedem Update nachführen, nicht nur beim Wechsel der Tageszeit */
    const lauf = this.lauf = himmelLauf(sonne);
    if (this.himmel) this.himmel.setze(phase, wetter, hell, sonne, lauf);
    this.bg.style.setProperty('--sonne-x', (lauf.uSonnePos[0] * 100).toFixed(1) + '%'); this.bg.style.setProperty('--sonne-y', (lauf.uSonnePos[1] * 100).toFixed(1) + '%');   // CSS-Rückfall
    const alt = this.st, neu = { phase, wetter, hell };
    if (!erzwingen && alt.phase === phase && alt.wetter === wetter && alt.hell === hell && this.bg.dataset.phase) return;
    if (this.bg.dataset.phase !== phase || this.bg.dataset.wetter !== wetter) { const p = this.bg.querySelector('.partikel'); if (p) p.innerHTML = partikel(phase, wetter); }
    this.bg.dataset.phase = phase; this.bg.dataset.wetter = wetter;
    if (this.wurzel) this.wurzel.classList.toggle('hell', hell);
    const kopfNeu = alt.wetter !== wetter || alt.phase !== phase;
    this.st = neu;
    if (kopfNeu && this.d) this._auffrischen();
  }

  _vorhersageAbo() {
    const eid = this.d && this.d.wetterEid, con = this._hass && this._hass.connection;
    if (!eid || !con || !con.subscribeMessage || this._aboFuer === eid) return;
    this._aboEnde(); this._aboFuer = eid; this.vorhersage = { daily: null, hourly: null };
    for (const art of ['daily', 'hourly']) {
      const abo = con.subscribeMessage(m => { this.vorhersage[art] = (m && m.forecast) || []; this._auffrischen(); },
        { type: 'weather/subscribe_forecast', entity_id: eid, forecast_type: art });
      if (abo && abo.catch) abo.catch(() => { this.vorhersage[art] = []; });
      this.abos.push(abo);
    }
  }
  _aboEnde() { for (const a of this.abos) if (a && a.then) a.then(ende => typeof ende === 'function' && ende()).catch(() => {}); this.abos = []; this._aboFuer = null; }

  lokal(t, zone = this.d && this.d.z.zone) { return lokal(t, zone); }   /* Zeit in der Zone der Baustelle (src/daten.js) */
  zoneMs(tag, zeit = '00:00', zone = this.d && this.d.z.zone) { return zoneMs(tag, zeit, zone); }
  seitText(iso) { if (!iso) return ''; const l = this.lokal(iso); return l.slice(0, 10) === this.z.HEUTE ? `seit ${l.slice(11, 16)}` : `seit ${wtag(l)} ${kurzDatum(l)}`; }
  jetztMs() { return this.d ? this.d.z.jetztMs : Date.now(); }

  /* Adapter baustelle/struktur → Modell der Seite (src/daten.js) */
  bauen(r) { return bauen(r, this._hass, this.d && this.d.z.zone); }
  /* Beginn und Ende einer Baustelle als Text; „(angelegt)“ = Beginn automatisch (AN-0002) */
  bsZeit(x) { return `${x.beginn ? datum(x.beginn) : '–'}${x.beginnAuto ? ' (angelegt)' : ''} – ${x.ende ? datum(x.ende) : 'offen'}`; }
  minSeitAb(iso, jetztMs) { return minSeitAb(iso, jetztMs); }
  protokollZeile(p, z) { return protokollZeile(p, z, this.d && this.d.z.zone); }
  eid(d, besitzer, key) { return d.ent[`${besitzer}_${key}`] || null; }
  zustand(eid) { const s = eid && this._hass && this._hass.states[eid]; return s && !['unknown', 'unavailable'].includes(s.state) ? s : null; }
  name(eid) { const s = eid && this._hass && this._hass.states[eid]; return (s && s.attributes.friendly_name) || eid || ''; }

  /* ---- Nachladen mit Zwischenspeicher: gibt undefined zurück, solange es lädt ---- */
  _holen(key, holer, maxAlter = 300000) {
    const c = this.cache[key], jetzt = Date.now();
    if (!c || (!c.laeuft && jetzt - c.zeit > maxAlter)) {
      this.cache[key] = { ...(c || {}), laeuft: true, zeit: jetzt };
      Promise.resolve().then(holer).then(daten => { this.cache[key] = { daten, zeit: Date.now(), laeuft: false }; this._auffrischen(); })
        .catch(err => { this.cache[key] = { daten: null, fehler: String((err && err.message) || err), zeit: Date.now(), laeuft: false }; this._auffrischen(); });
    }
    return c && 'daten' in c ? c.daten : undefined;
  }
  /* Neu zeichnen ohne Eingaben zu stören */
  _auffrischen() {
    if (this._auffrischenGeplant) return;
    this._auffrischenGeplant = true;
    Promise.resolve().then(() => {
      this._auffrischenGeplant = false;
      const f = this.shadowRoot && this.shadowRoot.activeElement;
      if (f && ['INPUT', 'TEXTAREA', 'SELECT'].includes(f.tagName) && !(this.s.sheet && LIT_SHEETS.includes(this.s.sheet.art) && f.closest('.sheet'))) { this._wartet = true; return; }   // Lit-Felder: kein Aufschub nötig (2a.2)
      this.neuZeichnen();
    });
  }

  /* Zeiträume der Auswertung: Tag (je Stunde), Woche/Monat (je Tag), Jahr (je Monat); versatz 1 = davor */
  zeitraum(z, versatz = 0, d = this.d) {
    const h = d.z.HEUTE, J = +h.slice(0, 4), M = +h.slice(5, 7);
    if (z === 'Tag') { const tag = plusTage(h, -versatz);
      return { von: tag, bis: plusTage(tag, 1), periode: 'hour', n: 24, labels: [...Array(24)].map((_, i) => String(i).padStart(2, '0')), index: l => l.slice(0, 10) === tag ? +l.slice(11, 13) : -1 }; }
    if (z === 'Woche') { const mo = plusTage(d.z.WOCHE_ISO[0], -7 * versatz);
      return { von: mo, bis: plusTage(mo, 7), periode: 'day', n: 7, labels: TAGE, index: l => tageZwischen(mo, l.slice(0, 10)) }; }
    if (z === 'Monat') { let m = M - 1 - versatz, j = J; while (m < 0) { m += 12; j--; }
      const von = `${j}-${String(m + 1).padStart(2, '0')}-01`, n = new Date(Date.UTC(j, m + 1, 0)).getUTCDate();
      return { von, bis: plusTage(von, n), periode: 'day', n, labels: [...Array(n)].map((_, i) => `${i + 1}.`), index: l => l.slice(0, 7) === von.slice(0, 7) ? +l.slice(8, 10) - 1 : -1, monat: m, jahr: j }; }
    const j = J - versatz;
    return { von: `${j}-01-01`, bis: `${j + 1}-01-01`, periode: 'month', n: 12, labels: MONATE, index: l => +l.slice(0, 4) === j ? +l.slice(5, 7) - 1 : -1, jahr: j };
  }
  /* Statistik-IDs der Seite; „ohne Automatik“ (energie_ohne_automatik) nicht mehr – Kachel Gespart und Auswertung lesen
     summen.ohne_automatik und gespart_reihen aus baustelle/auswertung (0.8.152/153) */
  statIds(d, mitTemp) {
    const ids = [];
    for (const b of d.bereiche) {
      const en = this.eid(d, b.id, 'energie'); if (en) ids.push(en); else ids.push(...b.geraete.map(g => g.energie).filter(Boolean));
      ids.push(this.eid(d, b.id, 'heizzeit'));
      if (!b.pumpe) ids.push(this.eid(d, b.id, 'heizzeit_strom'));   // AN-0011: davon tatsächlich geheizt (nur Container)
      for (const g of b.geraete) if (g.rolle === 'pumpe') ids.push(this.eid(d, g.id, 'pumpzeit'), this.eid(d, g.id, 'pumpzyklen'));
      if (mitTemp && b.fuehler) ids.push(b.fuehler);
    }
    if (mitTemp) ids.push(this.eid(d, d.entry, 'aussen'));
    return [...new Set(ids.filter(Boolean))].sort();
  }
  /* Langzeitstatistik (Recorder) eines Zeitraums: {statistic_id: [Wert je Stunde/Tag/Monat]} */
  statistik(z, versatz = 0, d = this.d) {
    if (!d) return null;
    const zr = this.zeitraum(z, versatz, d), ids = this.statIds(d, z === 'Tag');
    if (!ids.length) return { ...zr, werte: {} };
    const vonMs = this.zoneMs(zr.von, '00:00', d.z.zone), bisMs = this.zoneMs(zr.bis, '00:00', d.z.zone), jetztMs = Date.now();
    const laufend = jetztMs >= vonMs && jetztMs < bisMs, frisch = laufend ? 60000 : undefined;   // enthält „jetzt“: nach 1 min neu holen
    const roh = this._holen(`s:${d.entry}:${z}:${zr.von}`, () => this._hass.callWS({ type: 'baustelle/statistik', entry_id: d.entry,
      start_time: new Date(vonMs).toISOString(), end_time: new Date(bisMs).toISOString(),
      statistic_ids: ids, period: zr.periode, types: ['change', 'mean', 'state'], units: {} }), frisch);
    if (roh === undefined) return null;
    /* WU-0002: HA schreibt eine Stunde erst nach ihrem Ende in die Stundenstatistik – die laufende Stunde (kurz nach der
       vollen Stunde auch die vorige, bis HA sie eingetragen hat) kommt aus der 5-Minuten-Statistik */
    let kurz = null, kurzAb = 0;
    if (laufend) {
      const stunde = Math.floor(jetztMs / 36e5) * 36e5; kurzAb = Math.max(vonMs, jetztMs - stunde < 60000 ? stunde - 36e5 : stunde);
      kurz = this._holen(`k:${d.entry}:${z}:${zr.von}:${kurzAb}`, () => this._hass.callWS({ type: 'baustelle/statistik', entry_id: d.entry,
        start_time: new Date(kurzAb).toISOString(), statistic_ids: ids, period: '5minute', types: ['change', 'mean', 'state'], units: {} }), 60000) || null;
    }
    const ms = p => typeof p.start === 'number' ? (p.start < 1e11 ? p.start * 1000 : p.start) : Date.parse(p.start);
    const werte = {};
    for (const id of ids) {
      const arr = Array(zr.n).fill(null);
      for (const p of (roh || {})[id] || []) {
        const i = zr.index(this.lokal(ms(p), d.z.zone));
        if (i < 0 || i >= zr.n) continue;
        if (zahl(p.change)) arr[i] = (arr[i] || 0) + Number(p.change); else if (zahl(p.mean)) arr[i] = Number(p.mean);
      }
      const mittel = {};   // Index → 5-Minuten-Mittelwerte (Temperatur)
      for (const p of (kurz || {})[id] || []) {
        const t = ms(p); if (t < kurzAb) continue;
        const i = zr.index(this.lokal(t, d.z.zone)); if (i < 0 || i >= zr.n) continue;
        const hatStunde = ((roh || {})[id] || []).some(q => zr.periode === 'hour' && ms(q) === Math.floor(t / 36e5) * 36e5);
        if (hatStunde) continue;   // diese Stunde hat HA schon eingetragen
        if (zahl(p.change)) arr[i] = (arr[i] || 0) + Number(p.change); else if (zahl(p.mean)) (mittel[i] ||= []).push(Number(p.mean));
      }
      for (const [i, v] of Object.entries(mittel)) if (arr[i] === null) arr[i] = v.reduce((x, y) => x + y, 0) / v.length;
      // bis „jetzt“ genau: was der Zähler seit dem letzten Statistikwert dazugezählt hat (aktueller Zustand − Stand dort)
      if (laufend) {
        const letzte = [...((roh || {})[id] || []), ...((kurz || {})[id] || [])].filter(q => zahl(q.change) && zahl(q.state)).sort((x, y) => ms(x) - ms(y)).at(-1);
        const jetzt = this._hass && this._hass.states[id], i = zr.index(this.lokal(jetztMs, d.z.zone));
        const dazu = letzte && jetzt && zahl(jetzt.state) ? Number(jetzt.state) - Number(letzte.state) : 0;
        if (dazu > 0 && i >= 0 && i < zr.n) arr[i] = (arr[i] || 0) + dazu;   // kleiner = Zähler neu gestartet: nichts dazu
      }
      werte[id] = arr;
    }
    return { ...zr, werte };
  }
  /* Verbrauch in kWh je Stunde (Tag), je Tag (Woche/Monat) oder je Monat (Jahr); bid null = Summe der Baustelle */
  verbrauch(d, bid, z, versatz = 0) {
    const st = this.statistik(z, versatz, d); if (!st) return null;
    const eins = b => { const en = this.eid(d, b.id, 'energie'), ids = en ? [en] : b.geraete.map(g => g.energie).filter(Boolean);
      const r = addieren(ids.map(id => (st.werte[id] || Array(st.n).fill(0)).map(v => v || 0))); return r.length ? r : Array(st.n).fill(0); };
    const liste = bid ? d.bereiche.filter(b => b.id === bid) : d.bereiche;
    return liste.length ? addieren(liste.map(eins)) : Array(st.n).fill(0);
  }
  reihe(d, id, z, versatz = 0) { const st = this.statistik(z, versatz, d); if (!st) return null; return (id && st.werte[id]) || Array(st.n).fill(null); }
  heizStunden(d, b, z, versatz = 0) {
    if (b.pumpe) { const r = b.geraete.filter(g => g.rolle === 'pumpe').map(g => this.reihe(d, this.eid(d, g.id, 'pumpzeit'), z, versatz)); if (r.some(x => !x)) return null; return addieren(r.map(x => x.map(v => v || 0))); }
    const r = this.reihe(d, this.eid(d, b.id, 'heizzeit'), z, versatz); return r && r.map(v => v || 0);
  }
  zyklen(d, b, z, versatz = 0) { const r = b.geraete.filter(g => g.rolle === 'pumpe').map(g => this.reihe(d, this.eid(d, g.id, 'pumpzyklen'), z, versatz)); if (r.some(x => !x)) return null; return addieren(r.map(x => x.map(v => Math.round(v || 0)))); }
  /* Auswertung, Abrechnung und Verlauf rechnet die Integration (api §8), die Seite zeigt nur an: null = lädt noch, {} = Fehler */
  /* ---- FE-0008: früheren Zeitraum wählen – ‹ › blättern, Kalender skaliert mit dem Zeitraum (Mockup glas.html, Variante 4) ---- */
  zrGrenze(alle = false) {   // frühester Zeitraum: Beginn der Baustelle (bei „alle“ die früheste), sonst fünf Jahre
    const b = (alle ? this.laufende() : [this.d]).map(x => x.beginn).filter(Boolean).sort()[0];
    return b && b <= this.z.HEUTE ? b : plusTage(this.z.HEUTE, -5 * 366);
  }
  zrMax(z, grenze) { return Math.max(0, zrVersatz(z, grenze, this.z.HEUTE, this.z.WOCHE_ISO[0])); }
  zrInfo(z, v) { return zrInfo(z, v, this.z.HEUTE, this.z.WOCHE_ISO[0]); }
  zrText(z, v = 0) { return v === 0 ? { Tag: 'heute', Woche: 'diese Woche' }[z] || this.zrInfo(z, 0).text : v === 1 && z !== 'Monat' && z !== 'Jahr' ? this.zrInfo(z, 1).text.toLowerCase() : this.zrInfo(z, v).text; }
  zrVgl(z, v = 0) { return z === 'Jahr' ? this.zrInfo('Jahr', v + 1).text : { Tag: v ? 'Vortag' : 'gestern', Woche: 'Vorwoche', Monat: 'Vormonat' }[z]; }
  zrSt(ziel) {
    if (ziel === 'aw') return this.s.aw;
    if (ziel === 'sheet') return this.s.sheet || {};
    const z = ziel === 'c-Tag' ? 'Tag' : 'Woche', c = this.s.cZr ||= {}; return c[z] ||= { zeitraum: z, v: 0 };
  }
  zrV(ziel) { return (this.zrSt(ziel) || {}).v || 0; }
  /* Kalender: Tag → Monat mit Tagen, Woche → Monat mit KW-Zeilen, Monat → Jahr mit Monaten, Jahr → Jahre seit Beginn */
  /* Preis simulieren (Herbert 04.10.2026): in der Auswertung mit dem Chip „💶 Preis“; die Integration rechnet alle € damit */
  simAktiv() { return !!this.s.awSim && this.s.view === 'auswertung'; }
  simPreis() { if (!zahl(this.s.simPreis)) { let v = null; try { v = parseFloat(localStorage.getItem('baustelle-sim-preis')); } catch (e) { v = null; } this.s.simPreis = zahl(v) ? v : this.d.e.preis; } return this.s.simPreis; }
  awDaten(z, versatz = 0, scope = this.s.awScope || 'diese', d = this.d, preis = this.simAktiv() ? this.simPreis() : null) {
    if (!d) return null;
    const r = this._holen(`aw:${d.entry}:${z}:${versatz}:${scope}:${d.z.HEUTE}:${preis ?? ''}`, () => this._hass.callWS({ type: 'baustelle/auswertung', entry_id: d.entry, zeitraum: z, versatz, scope, ...(preis !== null ? { preis } : {}) }));
    return r === undefined ? null : r || {};
  }
  abDaten(z, scope = this.s.awScope || 'diese', d = this.d, versatz = 0, preis = this.simAktiv() ? this.simPreis() : null) {
    if (!d) return null;
    const r = this._holen(`ab:${d.entry}:${z}:${versatz}:${scope}:${d.z.HEUTE}:${preis ?? ''}`, () => this._hass.callWS({ type: 'baustelle/abrechnung', entry_id: d.entry, zeitraum: z, versatz, scope, ...(preis !== null ? { preis } : {}) }));
    return r === undefined ? null : r || {};
  }
  verlaufDaten(x) {
    const r = this._holen(`v:${x.entry}:${x.z.HEUTE}`, () => this._hass.callWS({ type: 'baustelle/auswertung', entry_id: x.entry, teil: 'verlauf' }), 900000);
    return r === undefined ? null : r || {};
  }

  /* AN-0005: Leistung einer Stunde, jeder Messwert der Leistungssensoren (HA-Verlauf), je Gerät und als Summe */
  /* Leistung eines Containers (Einblendung, src/ansichten/einblendungen-container.js): eine Stunde oder der ganze Tag aus
     jedem Messwert der Shellys. Flackerfrei (Herbert 01.10.2026): einmal der ganze Tag, jede Stunde wird daraus nur
     ausgeschnitten – beim Ziehen kein Laden; solange geladen wird, bleibt der alte Stand stehen (WU-0012) */
  leistungDaten(s) {
    const d = this.d, b = d.bereiche.find(x => x.id === s.auswahl[0]) || this.b; if (!b) return null;
    const v = s.v || 0, tag = plusTage(this.z.HEUTE, -v), jetztH = +this.z.JETZT.slice(0, 2), max = v ? 23 : jetztH, h = Math.min(zahl(s.h) ? s.h : v ? 12 : jetztH, max);
    const ganzerTag = s.lart === 'tag';   // WU-0011: Stunde oder ganzer Tag
    const von = this.zoneMs(tag, ganzerTag ? '00:00' : `${String(h).padStart(2, '0')}:00`, d.z.zone), bis = ganzerTag ? this.zoneMs(plusTage(tag, 1), '00:00', d.z.zone) : von + 36e5;
    const laufend = !v && (ganzerTag || h === jetztH);
    const geraete = b.geraete.filter(g => g.leistung), ids = geraete.map(g => g.leistung);
    const tagVon = this.zoneMs(tag, '00:00', d.z.zone), tagBis = this.zoneMs(plusTage(tag, 1), '00:00', d.z.zone);
    const roh = !ids.length ? {} : this._holen(`lh:${d.entry}:${b.id}:${tag}:tag`, () => this._hass.callWS({ type: 'baustelle/verlauf', entry_id: d.entry, start_time: new Date(tagVon).toISOString(),
      end_time: new Date(Math.min(tagBis, d.z.jetztMs)).toISOString(), entity_ids: ids, minimal_response: true, no_attributes: true, significant_changes_only: false }), !v ? 30000 : undefined);
    const ende = laufend ? d.z.jetztMs : bis, farben = ['var(--s2)', 'var(--s3)', 'var(--s4)', 'var(--s5)', 'var(--s6)'];
    const hh = k => String(k).padStart(2, '0');
    // Streifen je Stunde: blau, wo der Container verbraucht hat (HA-Statistik), sonst grau – auch künftige Stunden
    const vb = this.verbrauch(d, b.id, 'Tag', v), farbe = k => (!v && k > jetztH) || !vb || !(vb[k] > 0.001) ? 'rgba(127,127,127,.25)' : 'var(--s1)';
    const grenze = k => Math.max(0, Math.min(100, (k - 0.5) / 23 * 100)).toFixed(2);
    const L = { b, h, max, ganzerTag, laufend, hh, wert: ganzerTag ? 'ganzer Tag' : `${hh(h)}:00–${hh((h + 1) % 24)}:00`,
      spur: `linear-gradient(90deg, ${[...Array(24)].map((_, k) => `${farbe(k)} ${grenze(k)}% ${grenze(k + 1)}%`).join(', ')})`, zustand: 'da' };
    if (!ids.length) return { ...L, zustand: 'ohne' };
    if (roh === undefined) return { ...L, zustand: 'laedt', letzt: this._lhLetzt };
    const ausschnitt = alle => { const vorher = alle.filter(p => p[0] <= von).at(-1), drin = alle.filter(p => p[0] > von && p[0] < bis);
      return [...(vorher ? [[von, vorher[1]]] : []), ...drin]; };   // Stand zu Beginn der Stunde + alle Messwerte darin
    const reihen = geraete.map((g, k) => ({ name: g.n, farbe: farben[k % farben.length], punkte: ausschnitt(((roh || {})[g.leistung] || [])
      .map(x => [zahl(x.lu) ? x.lu * 1000 : Date.parse(x.last_updated || x.last_changed), zahl(x.s ?? x.state) ? Number(x.s ?? x.state) : null]).filter(p => Number.isFinite(p[0])).sort((p, q) => p[0] - q[0])) }));
    const zeiten = [...new Set(reihen.flatMap(r => r.punkte.map(p => p[0])))].sort((a, b2) => a - b2);
    const wert = (r, t) => { let w = null; for (const p of r.punkte) { if (p[0] > t) break; w = p[1]; } return w; };
    const summeR = { name: 'Summe', farbe: 'var(--s1)', summe: true, punkte: zeiten.map(t => [t, reihen.reduce((a, r) => a + (wert(r, t) || 0), 0)]) };
    const zeige = reihen.length > 1 ? [...reihen, summeR] : reihen.map(r => ({ ...r, farbe: 'var(--s1)', summe: true }));
    const daten = { laufend, zeige, spitze: Math.max(0, ...summeR.punkte.map(p => p[1])), messwerte: reihen.reduce((a, r) => a + r.punkte.length, 0),
      mittel: summeR.punkte.length ? summeR.punkte.reduce((a, p, i) => a + p[1] * ((i + 1 < summeR.punkte.length ? summeR.punkte[i + 1][0] : ende) - p[0]), 0) / Math.max(1, ende - summeR.punkte[0][0]) : 0,
      // FE-0024: Achse mit Uhrzeit, in der laufenden Stunde bzw. am laufenden Tag endet die Kurve bei „jetzt“
      chart: stufen(`lh-${b.id}-${tag}-${ganzerTag ? 'tag' : h}`, zeige, von, bis, 'W', ganzerTag ? [0, 4, 8, 12, 16, 20, 24].map(k => [von + k * 36e5, hh(k)])
        : [0, 10, 20, 30, 40, 50, 60].map(m => [von + m * 6e4, m === 60 ? `${hh((h + 1) % 24)}:00` : `${hh(h)}:${hh(m)}`]), laufend ? [d.z.jetztMs, this.z.JETZT.slice(0, 5)] : null) };
    this._lhLetzt = daten;
    return { ...L, daten };
  }
  /* FE-0009: Heizzeit eines Containers (Pumpenschacht: Pumpzeit) je Stunde, Tag oder Monat; AN-0011: eingeschaltet
     (Shelly an) und davon tatsächlich geheizt (Strom über „heizt tatsächlich ab“) – zwei Zähler der Integration */
  heizzeitDaten(s) {
    const d = this.d, b = d.bereiche.find(x => x.id === s.auswahl[0]) || this.b; if (!b) return null;
    const z = s.zeitraum || 'Tag', v = s.v || 0, zr = this.zeitraum(z, v), r = this.heizStunden(d, b, z, v);
    const sId = !b.pumpe && this.eid(d, b.id, 'heizzeit_strom'), rs = sId ? this.reihe(d, sId, z, v) : null;
    const lab = zr.labels.map((l, i) => z === 'Tag' ? (i % 3 ? '' : l) : z === 'Monat' ? (i % 5 ? '' : l) : l);
    return { b, z, v, r, rs, strom: !!sId, su: r ? summe(r) : null, ss: rs ? summe(rs.map(x => x || 0)) : null, je: { Tag: 'je Stunde', Woche: 'je Tag', Monat: 'je Tag', Jahr: 'je Monat' }[z], text: this.zrText(z, v),
      chart: sId ? (r && rs ? flaeche(`hz-c-${b.id}-${z}-${v}`, [{ name: 'tatsächlich geheizt', v: rs.map(x => x || 0), farbe: 'var(--s1)' }], zr.labels, 'h', z === 'Tag' ? 6 : z === 'Monat' ? 7 : z === 'Woche' ? 1 : 3, { name: 'eingeschaltet', v: r }) : null)
        : r ? balken(`hz-c-${b.id}-${z}-${v}`, r, lab, 'h') : null };
  }
  /* Gemessen: wann zieht ein Gerät Strom (Leistung über „heizt tatsächlich ab“, Standard 50 W) – Verlauf der Leistungssensoren seit Montag */
  messung(d = this.d) {
    const geraete = d.bereiche.flatMap(b => b.geraete.map(g => ({ b, g, eid: g.leistung || g.schalter }))).filter(x => x.eid);
    if (!geraete.length) return {};
    const ids = [...new Set(geraete.map(x => x.eid))].sort(), start = this.zoneMs(d.z.WOCHE_ISO[0], '00:00', d.z.zone);
    const roh = this._holen(`h:${d.entry}:${d.z.HEUTE}:${d.z.JETZT.slice(0, 4)}`, () => this._hass.callWS({ type: 'baustelle/verlauf', entry_id: d.entry,
      start_time: new Date(start).toISOString(), end_time: new Date(d.z.jetztMs).toISOString(), entity_ids: ids, minimal_response: true, no_attributes: true, significant_changes_only: false }), 600000);
    if (roh === undefined) return null;
    const tagStart = d.z.WOCHE_ISO.map(t => this.zoneMs(t, '00:00', d.z.zone)), ende = d.z.jetztMs, erg = {};
    for (const { g, eid } of geraete) {
      const liste = ((roh || {})[eid] || []).map(x => ({ s: x.s ?? x.state, t: zahl(x.lu) ? x.lu * 1000 : zahl(x.lc) ? x.lc * 1000 : Date.parse(x.last_updated || x.last_changed) }))
        .filter(x => Number.isFinite(x.t)).sort((a, b) => a.t - b.t);
      const tage = TAGE.map(() => ({ an: [], off: [] }));
      liste.forEach((x, i) => {
        const von = Math.max(x.t, start), bis = i + 1 < liste.length ? liste[i + 1].t : ende; if (bis <= von) return;
        const art = x.s === 'unavailable' ? 'off' : (x.s === 'on' || (zahl(x.s) && Number(x.s) > d.e.zieht_w)) ? 'an' : null; if (!art) return;
        tagStart.forEach((ds, k) => { const a = Math.max(von, ds), b = Math.min(bis, ds + 864e5); if (b > a) tage[k][art].push([(a - ds) / 60000, (b - ds) / 60000]); });
      });
      for (const t of tage) for (const art of ['an', 'off']) { const m = []; for (const q of t[art]) { const l = m[m.length - 1]; if (l && q[0] - l[1] < 1) l[1] = Math.max(l[1], q[1]); else m.push([...q]); } t[art] = m; }
      erg[g.id] = tage;
    }
    return erg;
  }

  _kalender(eid, tage = 400) {
    if (!eid) return [];
    const start = new Date(this.zoneMs(this.d ? this.z.HEUTE : new Date().toISOString().slice(0, 10), '00:00', this.d && this.z.zone)), ende = new Date(start.getTime() + tage * 864e5);
    const r = this._holen(`k:${eid}`, () => this._hass.callApi('GET', `calendars/${eid}?start=${encodeURIComponent(start.toISOString())}&end=${encodeURIComponent(ende.toISOString())}`), 120000);
    return r === undefined ? null : (r || []).map(x => { const s = x.start || {}, e = x.end || {}, von = s.date || this.lokal(s.dateTime).slice(0, 10), bisX = e.date ? plusTage(e.date, -1) : this.lokal(e.dateTime).slice(0, 10);
      return { name: x.summary || '', von, bis: bisX < von ? von : bisX, uid: x.uid || null, recurrence_id: x.recurrence_id || null }; });
  }
  wetterTag(iso) {
    const d = this.d, w = d.wetter || {};
    if (iso === d.z.HEUTE) return { kalt: w.frueh_min, regen: w.regen_heute, regenVortag: w.regen_vortag };
    const f = x => (this.vorhersage.daily || []).find(y => this.lokal(y.datetime).slice(0, 10) === x);
    const t = f(iso), v = plusTage(iso, -1) === d.z.HEUTE ? { precipitation: w.regen_heute } : f(plusTage(iso, -1));
    return { kalt: t && t.templow, regen: t && t.precipitation, regenVortag: v && v.precipitation };
  }

  get azListe() { return [...this.d.arbeitszeiten].sort((a, b) => a.ab.localeCompare(b.ab)); }
  get azJetzt() { const L = this.azListe; return L.filter(a => a.ab <= this.z.HEUTE).at(-1) || L[0] || null; }
  /* Heizplan eines Tages – berechnet von der Integration (plan_woche), hier nur in Text übersetzt */
  /* WU-0009: Tür offen – die lernende Regelung lernt so lange nicht (Zustand von der Integration, lernen.offen) */
  offenText(b) {
    const o = b.lern && b.lern.offen; if (!o) return '';
    return o.art === 'vermutet' ? '🚪 Tür vermutlich offen – kühlt beim Heizen ab, lernt gerade nicht' : '🚪 Tür offen – lernt gerade nicht';
  }
  aufheizTeil(b) {
    const a = (b.lern && b.lern.aufheizen) || {}, w = b.lern && b.lern.warm, n0 = (b.lern && b.lern.auf_n) || 3;
    const z = x => x ? `<div><b>${de(x.rate)} °C/h</b><span class="leise">${x.n}× gemessen${x.n < n0 ? ' · noch zu wenig' : ''}</span></div>` : '<div><span class="leise">noch nicht gelernt</span></div>';
    const anz = [...new Set([1, ...Object.keys(a).map(k => +k.split('|')[1] || 1)])].sort((x, y) => x - y);   // AN-0006: je Anzahl laufender Heizkörper
    return `<div class="gruppe-t">Aufheizen</div><div class="wa-tab"><b></b><b>kalt &lt; 5 °C</b><b>mild</b>${anz.map(n => `<span>${n === 1 ? 'ein Heizkörper' : `${n} Heizkörper`}</span>${z(a[`kalt|${n}`])}${z(a[`mild|${n}`])}`).join('')}</div>
      ${b.start ? '<div class="leise">Wann der Container startet, steht oben unter „So rechnet der Start“.</div>'   /* FE-0031/32: start.html B */
        : w && w.gelernt && w.plan ? `<div class="wa-heute">⏰<div>Heute ab <b>${uhr(w.plan.start)}</b> – ${w.aufheiz_min} min für ${zahl(w.innen) ? de(w.innen) : '–'} → ${de(w.soll)} °C, warm um <b>${uhr(w.plan.ziel)}</b> (${w.vor ? `${w.vor} min vor Arbeitsbeginn` : 'bei Arbeitsbeginn'})${w.plan.begrenzt ? ' · begrenzt durch „Frühestens“' : ''}</div></div>`
        : w ? `<div class="leise">Ab ${n0} Aufheizungen je Wetter rechnet der Container den Beginn selbst; bis dahin gelten Vorheizen und Kälte-Frühstart.</div>` : '<div class="leise">Der gelernte Beginn wirkt im Modus Thermostat.</div>'}
      <div class="leise">Gemessen wird jedes Aufheizen von mindestens 1 °C unter dem Soll, solange der Heizkörper durchgehend läuft. Kälte draußen steckt in der Rate – darum braucht es keinen eigenen Kälte-Frühstart.</div>`;
  }
  /* AN-0004: „Warm ab“ eines lernenden Containers – alle Zahlen von der Integration (laufzeit.container.<id>.lernen.warm) */
  warmText(b, kurz = false) {
    const w = b.lern && b.lern.warm; if (!w) return '';
    const S = b.start;   // FE-0031/32: eine Start-Logik – Satz und Uhrzeiten von der Integration (laufzeit.container.<id>.start)
    if (S) return kurz ? `${S.tag_t} ab ${S.beginn} → warm ${S.warm}` : S.satz;
    if (!w.gelernt) return kurz ? 'Aufheizen lernt noch' : `lernt noch (${w.n}/${w.n_noetig} Aufheizungen bei ${w.band === 'kalt' ? 'Kälte' : 'mildem Wetter'}) – bis dahin Vorheizen und Kälte-Frühstart`;
    const pl = w.plan; if (!pl) return kurz ? '' : 'heute frei';
    if (kurz) return `heute ab ${uhr(pl.start)} → ${de(w.soll)} °C um ${uhr(pl.ziel)}`;
    return `heizt ab ${uhr(pl.start)}, damit um ${uhr(pl.ziel)} ${de(w.soll)} °C${zahl(w.innen) ? ` (jetzt ${de(w.innen)} °C` : ' ('}${zahl(w.rate) ? `, ${de(w.rate)} °C/h gelernt` : ''}${pl.begrenzt ? ', begrenzt' : ''}) · warm bis ${uhr(pl.ende)}`;
  }
  /* AN-0003: wie sich die Heizzeit zusammensetzt – nur die Abschnitte der Integration (start, vor, a, b, nach, ende) */
  planRechnung(p) {
    const min = (x, y) => `${Math.round(y - x)} min`, teile = [];
    if (p.vor > p.extra) teile.push(`${min(p.extra, p.vor)} früher (${[p.codes.includes('fruehstart') && 'Kälte', p.codes.includes('frueher_nach_regen') && 'Regen gestern'].filter(Boolean).join(' + ') || 'Frühstart'})`);
    if (p.a > p.vor) teile.push(`${min(p.vor, p.a)} Vorheizen`);
    teile.push(`Arbeit ${uhr(p.a)}–${uhr(p.b)}`);
    if (p.nach > p.b) teile.push(`${min(p.b, p.nach)} Nachheizen`);
    if (p.ende > p.nach) teile.push(`${min(p.nach, p.ende)} Kleidung trocknen`);
    return `Heizt ${uhr(p.extra)}–${uhr(p.ende)} = ${teile.join(' + ')}`;
  }
  planTag(tag) { return this.planIso(this.z.WOCHE_ISO[TAGE.indexOf(tag)]); }
  planIso(iso) {
    const q = this.d.plan[iso];
    if (!q) return null;
    const w = this.wetterTag(iso);
    const gruende = (q.gruende || []).map(c => c === 'ausnahme' ? `Ausnahme: ${(q.ausnahme && (q.ausnahme.notiz || AUSNAHME[q.ausnahme.art])) || 'andere Zeiten'}`
      : c === 'fruehstart' ? (zahl(w.kalt) ? `Frühstart ${de(w.kalt).replace('-', '−')} °C` : 'Frühstart')
      : c === 'frueher_nach_regen' ? 'früher nach Regen'
      : c === 'gelernt' ? '🧠 gelernter Beginn'
      : c === 'trocknen' ? (zahl(this.d.regenAz[iso]) ? `Kleidung trocknen, ${de(this.d.regenAz[iso], this.d.regenAz[iso] % 1 ? 1 : 0)} mm Regen in der Arbeitszeit` : 'Kleidung trocknen') : String(c));   // AN-0021
    return { vor: q.vor, extra: zahl(q.start) ? q.start : q.vor, a: q.a, b: q.b, nach: q.nach, ende: q.ende, gruende, codes: q.gruende || [], ausnahme: q.ausnahme || null,
      eigene: q.eigene || [], ausnahmen: q.ausnahmen || [] };
  }
  statusText() {
    const d = this.d;
    if (!d.geladen) return 'nicht geladen – Integration prüfen';   // Einrichtung fehlgeschlagen: keine Werte, nichts wird geschaltet
    if (!d.e.auto) return 'Handbetrieb – nichts wird geschaltet';
    if (d.jetztBis) return `♨ alle heizen bis ${d.jetztBis}`;
    if (d.statusText) return d.statusText;
    const p = this.planTag(this.z.HEUTE_TAG), j = minu(this.z.JETZT);
    if (p && j >= p.extra && j < p.ende) return `♨ heizt bis ${uhr(p.ende)}`;
    if (p && j < p.extra) return `Start um ${uhr(p.extra)}`;
    return 'aus';
  }
  zeitstrahl(p, jetzt = false) {
    const seg = p ? [[p.extra, p.vor, 'extra'], [p.vor, p.a, 'vor'], [p.a, p.b, 'heiz'], [p.b, p.nach, 'vor'], [p.nach, p.ende, 'trock'], ...(p.eigene || []).map(f => [f[0], f[1], 'eigen'])] : [];   // FE-0012
    return this.zeitstrahlSeg(seg, jetzt);
  }
  zeitstrahlSeg(liste, jetzt = false) {
    const A = 4 * 60, B = 20 * 60, x = m => Math.max(0, Math.min(100, (m - A) / (B - A) * 100));
    const seg = (von, bis, k) => bis > von ? `<i class="tl-${k}" style="left:${x(von)}%;width:${x(bis) - x(von)}%"></i>` : '';
    return `<div class="tl-spur">${liste.map(q => seg(q[0], q[1], q[2])).join('')}${jetzt ? `<i class="tl-jetzt" style="left:${x(minu(this.z.JETZT))}%"></i>` : ''}</div>`;
  }
  bName(id) { return id ? (this.d.bereiche.find(b => b.id === id) || { name: id }).name : 'Baustelle'; }
  /* Staffelung: gemessene Last, Grenze und freier Platz – gerechnet von der Integration (laufzeit.staffel) */
  last() {
    const d = this.d, S = d.staffel || {}, e = d.e;
    const alleG = d.bereiche.flatMap(b => b.geraete.map(g => ({ b, g }))), hk = alleG.filter(x => x.g.heizer);
    // Nur Werte der Integration; solange sie fehlen (vor der ersten Rechnung), gibt es hier keine Anschlüsse
    const n = x => zahl(x) ? Number(x) : 0;
    const A = (S.anschluesse || []).map(a => {
      const s = d.anschluesse.find(x => x.id === a.id) || {};
      return { id: a.id, name: a.name || s.name || a.id, ampere: s.ampere, phasen: s.phasen, voll: n(a.voll_kw), grenze: n(a.grenze_kw), reserve: n(a.reserve_kw),
        heiz: n(a.heiz_kw), pumpe: n(a.pumpe_kw), sonst: n(a.sonst_kw), frei: n(a.frei_kw) };
    });
    const s3 = k => A.reduce((x, a) => x + a[k], 0);
    return { A, heiz: s3('heiz'), pumpe: s3('pumpe'), sonst: s3('sonst'), grenze: s3('grenze'), reserve: s3('reserve'), gesamt: s3('heiz') + s3('pumpe') + s3('sonst'), hk,
      laufen: zahl(S.laufen) ? S.laufen : hk.filter(x => x.g.an && !x.b.offline).length, warten: zahl(S.warten) ? S.warten : hk.filter(x => x.g.warte).length, max: zahl(S.max) ? S.max : e.max_gleich };
  }
  stromBalken(L, klein) {
    const w = v => `${L.grenze > 0 ? Math.max(0, v / L.grenze * 100) : 0}%`;
    return `<div class="strom ${klein ? 'klein' : ''}"><div class="strom-spur"><i class="s-heiz" style="width:${w(L.heiz)}"></i><i class="s-pumpe" style="width:${w(L.pumpe)}"></i><i class="s-sonst" style="width:${w(L.sonst)}"></i>
      <i class="s-res" style="width:${w(L.reserve)}"></i></div></div>`;
  }
  arbeitsende() { const p = this.planTag(this.z.HEUTE_TAG); return p ? uhr(p.b) : null; }
  /* Heizzeiten eines Containers an einem Tag der Woche: Abschnitte der Integration [von, bis, art] in Minuten */
  heizzeiten(b, t) {
    if (b.pumpe) return [];
    const iso = this.z.WOCHE_ISO[TAGE.indexOf(t)], seg = (this.d.abschnitte[b.id] || {})[iso] || [];
    return seg.filter(q => zahl(q[0]) && zahl(q[1])).map(q => [Number(q[0]), Number(q[1]), ABSCHNITT[q[2]] || 'heiz']).filter(x => x[1] > x[0]).sort((p, q) => p[0] - q[0]);
  }
  /* Wann ein Heizkörper wirklich Strom zieht (Leistung über „heizt tatsächlich ab“, Standard 50 W) – aus dem Verlauf der Leistungssensoren */
  aktiv(b, g, t) {
    const leer = { an: [], off: [] };
    if (!g.heizer) return leer;
    const tagNr = TAGE.indexOf(t), heuteNr = TAGE.indexOf(this.z.HEUTE_TAG); if (tagNr > heuteNr) return leer;
    const m = this.mess && this.mess[g.id];
    return (m && m[tagNr]) || leer;
  }
  anschluss(id) { return this.d.anschluesse.find(a => a.id === id) || this.d.anschluesse[0] || { id: null, name: 'kein Anschluss', ampere: 0, phasen: 3, reserve: 0 }; }
  laufende() { return this.alle.filter(x => x.aktiv); }
  firma(id, d = this.d) { return d.firmen.find(f => f.id === id) || d.firmen[0]; }
  /* Was im Verbrauch gestapelt wird: Container dieser Baustelle, laufende Baustellen oder Firmen */
  quellen(st, ziel) {
    const alle = ziel === 'aw' && this.s.awScope === 'alle', lauf = alle ? this.laufende() : [this.d], vs = st.v || 0;   // vs: gewählter früherer Zeitraum (FE-0008)
    if (st.gruppe === 'firma') {   // kWh je Firma und Periode rechnet die Integration (Firma je Tag)
      const namen = [...new Map(lauf.flatMap(l => l.firmen.map(f => [f.eigen ? 'eigen' : f.name, f]))).values()];
      return namen.map((f, k) => ({ id: f.eigen ? 'eigen' : f.name, name: f.name, farbe: `var(--s${(k % 6) + 1})`, v: z => { const a = this.abDaten(z, alle ? 'alle' : 'diese', this.d, vs); if (!a) return null;
        return (a.reihen || {})[f.eigen ? 'eigen' : f.name] || Array(this.zeitraum(z, vs).n).fill(0); } }));
    }
    if (alle) return lauf.map((l, k) => ({ id: l.entry, name: l.titel, farbe: `var(--s${(k % 6) + 1})`, v: z => this.verbrauch(l, null, z, vs) }));
    return this.d.bereiche.map(b => ({ id: b.id, name: b.name, farbe: BEREICH_FARBEN[b.f % BEREICH_FARBEN.length], v: z => this.verbrauch(this.d, b.id, z, vs) }));
  }
  /* Abrechnung: je Firma die Container mit kWh und Kosten im gewählten Zeitraum (rechnet die Integration, Firma je Tag) */
  freiText(iso) {
    const a = this.d.ausnahmen.find(x => x.datum === iso), f = this.d.frei[iso];
    if (a && a.art === 'frei') return `Ausnahme: frei${a.notiz ? ' – ' + esc(a.notiz) : ''} · nur Frostschutz`;
    if (f === 'feiertag') return `${esc(this.d.freiName[iso] || 'Feiertag')} · nur Frostschutz`;
    if (f === 'urlaub') return 'Urlaub · nur Frostschutz';
    return 'frei · nur Frostschutz';
  }
  heizplanInhalt() {
    const e = this.d.e;
    return `<div class="hp-legende"><span><i class="tl-extra"></i>Frühstart</span><span><i class="tl-eigen"></i>eigenes Zeitfenster</span><span><i class="tl-vor"></i>Vor- und Nachheizen ${e.vorheizen}/${e.nachheizen} min</span><span><i class="tl-heiz"></i>Arbeitszeit</span><span><i class="tl-trock"></i>Kleidung trocknen</span></div>
      <div class="hp">${this.z.WOCHE.map(([t, d], k) => { const p = this.planTag(t), h = t === this.z.HEUTE_TAG, iso = this.z.WOCHE_ISO[k];
        return `<div class="hp-zeile ${h ? 'heute' : ''} ${this.d.ausnahmen.some(x => x.datum === iso) ? 'ausn' : ''}"><div class="hp-tag"><b>${h ? 'heute' : t}</b><span>${d}</span></div>
          <div class="hp-mitte">${this.zeitstrahl(p, h)}<div class="leise">${p ? p.gruende.map(esc).join(' · ') : this.freiText(iso)}</div></div>
          <div class="hp-zeit">${p ? `${uhr(p.extra)}<br>${uhr(p.ende)}` : '–'}</div></div>`; }).join('')}
        <div class="hp-zeile achse"><div></div><div class="tl-achse">${['04', '08', '12', '16', '20'].map(h => `<span>${h}</span>`).join('')}</div><div></div></div></div>`;
  }
  get b() { return this.d && this.d.bereiche.find(x => x.id === this.s.cid); }
  gehe(view, cid = null) { this.s.view = view; this.s.cid = cid; this.s.leeren(); this.s.zrKal = null; this.neuZeichnen(true); }
  herunterladen(url, name) {
    if (typeof document === 'undefined' || typeof document.createElement !== 'function') return;
    const a = document.createElement('a'); if (!a) return; a.href = url; a.download = name; if (a.click) a.click();
  }
  datei(inhalt, name, typ) {
    if (typeof Blob === 'undefined' || typeof URL === 'undefined' || !URL.createObjectURL) return;
    this.herunterladen(URL.createObjectURL(new Blob([inhalt], { type: typ })), name);
  }
  csv(art) {
    // Export (Semikolon, deutsches Komma – öffnet direkt in Excel); die CSV baut die Integration (api §8). art 'firma': Abrechnung je Firma und Container
    let text, name;
    if (this.s.view === 'bsdetail') {
      const x = this.alle.find(y => y.entry === this.s.bs), v = x && this.verlaufDaten(x);
      if (!v || !v.csv) return this.toast('Werte laden noch …');
      text = v.csv; name = `baustelle-verbrauch-${x.titel.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.csv`;
    } else {
      const z = (this.s.aw || { zeitraum: 'Monat' }).zeitraum, lauf = this.s.awScope === 'alle' ? this.laufende() : [this.d], a = this.abDaten(z, undefined, this.d, (this.s.aw || {}).v || 0);
      if (!a || !a.csv) return this.toast('Werte laden noch …');
      text = a.csv[art === 'firma' ? 'firma' : 'verbrauch'];
      name = `baustelle-${art === 'firma' ? 'abrechnung' : 'verbrauch'}-${lauf.length > 1 ? 'alle' : this.d.titel.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${z.toLowerCase()}.csv`;
    }
    const zeilen = text.replace(/^\ufeff/, '').split('\r\n');
    this.datei(text, name, 'text/csv;charset=utf-8');
    this.toast(`${name} · ${zeilen.length - 1} Zeilen`);
    return zeilen;
  }
  meldungOffen(m) { return !['geschlossen', 'verworfen', 'erledigt'].includes(m.status); }
  meldungenMarkdown() {
    const ART = { fehler: 'Fehler', wunsch: 'Wunsch', anregung: 'Anregung' };
    return (this.meldungen() || []).map(m => `- [${this.meldungOffen(m) ? ' ' : 'x'}] **${m.ticket ? m.ticket + ' ' : ''}${ART[m.art] || m.art}** (${TICKET_STATUS[m.status] || m.status}, ${this.meldungZeit(m)}, v${m.version || '–'}, ${m.geraet || '–'}, ${m.kontext || '–'}): ${m.text}`).join('\n');
  }
  meldungen() { const r = this._holen('meldungen', () => this._hass.callWS({ type: 'baustelle/meldungen', entry_id: this.d ? this.d.entry : undefined }), 60000); return r === undefined ? null : Array.isArray(r) ? r : (r && r.meldungen) || []; }
  meldungZeit(m) { const l = this.lokal(m.zeit); return l ? `${wtag(l)} ${kurzDatum(l)} ${l.slice(11, 16)}` : '–'; }
  /* Einblendung öffnen (aus den Lit-Vorlagen); ds mit Angaben zur Einblendung (id, t, …) */
  einblenden(art, ds = {}) {
    const S = this.s, d = this.d, b = this.b, el = { dataset: { s: art, ...ds } }, neu = () => this.neuZeichnen();
    if (art === 'termin') { S.sheet = { art: 'termin', form: { b: el.dataset.id || S.cid, titel: '', datum: plusTage(this.z.HEUTE, 7), von: '09:00', bis: '10:00', wieder: 'einmal', boost: false } }; return neu(); }
    if (art === 'urlaub') { S.sheet = { art: 'urlaub', form: { name: '', von: plusTage(this.z.HEUTE, 14), bis: plusTage(this.z.HEUTE, 18) } }; return neu(); }
    if (art === 'container-neu') { S.sheet = { art, form: { name: '', art: 'Container', fuehler: '', schalter: '', typ: 'Ölradiator' } }; return neu(); }
    if (art === 'wetterquelle') { const o = d.optionen; S.sheet = { art, form: { wetter: o.wetter || '', temp_sensor: o.temp_sensor || '', regen_sensor: o.regen_sensor || '', urlaub_kalender: o.urlaub_kalender || '', feiertag_kalender: o.feiertag_kalender || '', termine_kalender: d.termineKal || '' } }; return neu(); }
    if (art === 'bs-loeschen') { S.sheet = { art, id: el.dataset.id }; return neu(); }
    if (art === 'zeitraum-bs') { S.sheet = { art, form: { beginn: d.beginnAuto ? '' : d.beginn || '', ende: d.ende || '', hp: [...d.hp] } }; return neu(); }
    if (art === 'name' || art === 'baustelle-neu') { S.sheet = { art, form: { name: art === 'name' && d ? d.titel : '' } }; return neu(); }
    S.sheet = { art, t: el.dataset.t, i: +el.dataset.i, auswahl: el.dataset.id ? [el.dataset.id] : [], zeitraum: 'Tag' }; return neu();
  }
  /* Dialoge der Heizung (src/ansichten/einblendungen-heizung.js, BSM-022 3d) */
  jetztHeizen(an) { return an ? this.aktion('jetzt_heizen', { minuten: 60 }, `Alle heizen bis ${uhr(minu(this.z.JETZT) + 60)}`) : this.aktion('jetzt_heizen', { minuten: null }, 'Zurück zum Plan'); }
  azBearbeiten(v) { this.s.sheet = { art: 'az-neu', form: { alt_ab: v.ab, ab: v.ab, name: v.auto ? '' : v.name, tage: JSON.parse(JSON.stringify(v.tage)) } }; return this.neuZeichnen(); }   // FE-0002
  azWeg(x) {
    if (this.d.arbeitszeiten.length < 2) return this.toast('Die letzte Arbeitszeit bleibt');
    this.s.sheet = null; this.neuZeichnen(); return this.liste('arbeitszeiten', 'loeschen', { ab: x.ab }, `${x.name} gelöscht`);
  }
  ausnahmeSpeichern() {
    const S = this.s, d = this.d, f = S.sheet.form; if (!f.datum || (f.art !== 'frei' && f.bis <= f.von)) return this.toast('Bitte Tag und Uhrzeit prüfen');
    S.sheet = null; this.neuZeichnen();
    const dazu = f.art !== 'frei' && d.ausnahmen.some(a => a.datum === f.datum && a.art !== 'frei');
    return this.liste('ausnahmen', 'speichern', { datum: f.datum, art: f.art, von: f.von, bis: f.bis, notiz: f.notiz.trim() }, `Ausnahme ${wtag(f.datum)} ${kurzDatum(f.datum)} ${dazu ? 'dazu – die anderen bleiben' : 'gespeichert'}`);
  }
  azSpeichern() {
    const S = this.s, d = this.d, f = S.sheet.form;
    if (!f.ab) return this.toast('Bitte ein Startdatum wählen');
    if (d.arbeitszeiten.some(x => x.ab === f.ab && x.ab !== f.alt_ab && !x.auto)) return this.toast(`Ab ${datum(f.ab)} gibt es schon eine Arbeitszeit`);
    const tage = Object.fromEntries(TAGE.map((t, k) => [String(k), f.tage[t] ? [...f.tage[t]] : null]));
    // gilt die neue gleich? – jüngste begonnene; die automatische zählt nicht mehr (FE-0002)
    const bleiben = d.arbeitszeiten.filter(x => x.ab !== f.alt_ab && !x.auto), gilt = f.ab <= this.z.HEUTE && !bleiben.some(x => x.ab > f.ab && x.ab <= this.z.HEUTE);
    const text = f.ab > this.z.HEUTE ? `Geplant – gilt ab ${datum(f.ab)}` : gilt ? (f.alt_ab !== undefined ? 'Gespeichert – gilt jetzt' : 'Gilt jetzt – die bisherige bleibt gespeichert') : 'Gespeichert – eine jüngere Arbeitszeit gilt weiter';
    S.sheet = null; this.neuZeichnen();
    return this.liste('arbeitszeiten', 'speichern', { ab: f.ab, name: f.name.trim() || `ab ${datum(f.ab)}`, tage, ...(f.alt_ab !== undefined ? { alt_ab: f.alt_ab } : {}) }, text);
  }
  /* Einblendungen der Übersicht (src/ansichten/einblendungen-uebersicht.js, BSM-022 3f) */
  /* Verbrauch (Einblendung „verbrauch“ und Auswertung, src/ansichten/einblendungen-uebersicht.js): Reihen, Summen, Diagramm */
  verbrauchDaten(st, ziel) {
    const Q = this.quellen(st, ziel), z = st.zeitraum, aus = Q.filter(q => st.auswahl.includes(q.id)), alleGewaehlt = aus.length === Q.length && Q.length > 0;
    const alle = ziel === 'aw' && this.s.awScope === 'alle', summenName = alle ? 'Alle laufenden' : this.d.titel;
    const zr = this.zeitraum(z, st.v || 0), labels = zr.labels;
    const was = st.gruppe === 'firma' ? 'Firmen' : alle ? 'Baustellen' : 'Container';
    const titel = !aus.length ? `${summenName} · Summe` : aus.length === 1 ? aus[0].name : `${aus.length} ${was} gestapelt`;   // Text, Lit maskiert
    const eur = st.t === 'eur', f = eur ? this.d.e.preis : 1;   // FE-0009: Kosten-Kachel zeigt denselben Verlauf in € (kWh × Preis)
    // WU-0013: ein Container mit Heizkörpern – „ohne Automatik“ von der Integration (baustelle/ohne)
    const einC = ziel === 'sheet' && st.auswahl.length === 1 ? this.d.bereiche.find(b => b.id === st.auswahl[0] && !b.pumpe && b.geraete.some(g => g.heizer)) : null;
    const basis = st.ohneBasis || 'geraet';
    const oa = einC ? this._holen(`oh:${this.d.entry}:${einC.id}:${z}:${st.v || 0}:${basis}`, () => this._hass.callWS({ type: 'baustelle/ohne', entry_id: this.d.entry, bereich: einC.id, zeitraum: z, versatz: st.v || 0, basis })) : undefined;
    const werte = Q.map(q => ({ q, v: q.v(z) })), laedt = werte.some(x => !x.v);
    const reihen = laedt ? [] : aus.length ? werte.filter(x => st.auswahl.includes(x.q.id)).map(({ q, v }) => ({ name: q.name, v, farbe: q.farbe }))
      : [{ name: 'Summe', v: addieren(werte.map(x => x.v)).length ? addieren(werte.map(x => x.v)) : Array(zr.n).fill(0), farbe: 'var(--s1)' }];
    const summeJe = labels.map((_, i) => reihen.reduce((a, r) => a + (r.v[i] || 0), 0)), sum = summe(summeJe);
    const spitze = Math.max(...summeJe, 0), wo = sum > 0 ? labels[summeJe.indexOf(spitze)] : '–';
    const einheit = eur ? '€' : z === 'Tag' ? 'kWh/h' : 'kWh', je = `${{ Tag: 'je Stunde', Woche: 'je Tag', Monat: 'je Tag', Jahr: 'je Monat' }[z]} · ${this.zrText(z, st.v || 0)}`;
    const chart = laedt ? null : flaeche(`vb-${ziel}-${this.s.awScope || ''}-${st.gruppe || ''}-${aus.map(q => q.id).join('_') || 'alle'}-${z}${eur ? '-eur' : ''}`, eur ? reihen.map(r => ({ ...r, v: r.v.map(x => (x || 0) * f) })) : reihen, labels, einheit, z === 'Tag' ? 6 : z === 'Monat' ? 7 : z === 'Woche' ? 1 : 3,
      oa && oa.ergebnis ? { name: 'ohne Automatik', v: oa.reihe.map(x => x * f) } : null);
    const jeReihe = reihen.length > 1 ? reihen.map(r => { const su = summe(r.v), sp = Math.max(...r.v, 0); return { name: r.name, farbe: r.farbe, su, spitzeBei: su > 0 ? labels[r.v.indexOf(sp)] : '–' }; }) : [];
    return { Q, z, aus, alleGewaehlt, alle, titel, eur, einC, basis, oa, laedt, reihen, sum, spitze, wo, einheit, je, preis: this.d.e.preis, chart, jeReihe };
  }
  /* Verbrauch: stapeln nach Container/Baustelle oder Firma (vorher case 'vb-gruppe') */
  vbGruppe(ziel, v) { const S = this.s, st = ziel === 'aw' ? S.aw : S.sheet; st.gruppe = v; st.auswahl = this.quellen(st, ziel).map(q => q.id); return this.neuZeichnen(); }
  /* Verbrauch: Summe ('' ), alle gestapelt ('*') oder einen Teil an/ab (vorher case 'vb-wer') */
  vbWer(ziel, id) {
    const S = this.s, sh = ziel === 'aw' ? S.aw : S.sheet;
    if (!id) sh.auswahl = []; else if (id === '*') sh.auswahl = this.quellen(sh, ziel || 'sheet').map(q => q.id);
    else sh.auswahl = sh.auswahl.includes(id) ? sh.auswahl.filter(x => x !== id) : [...sh.auswahl, id];
    return this.neuZeichnen();
  }
  ohneBasisWahl(v) { this.s.sheet.ohneBasis = v; return this.neuZeichnen(); }   // WU-0013: Ø je Gerät | je Typ (vorher case 'oh-basis')
  wetterAnsicht(v) { this.s.sheet.wa = v; return this.neuZeichnen(); }          // Wetter: std | tag | 3 (vorher case 'wa')
  /* Warnung bis morgen 07:00 stumm bzw. wieder melden – Vor-Ort-Aktion warnung_stumm (vorher case 'w-stumm') */
  warnungStumm(id) {
    const w = this.d.warnungen.find(x => x.id === id); if (!w) return undefined;
    return this.aktion('warnung_stumm', { key: w.key, bis: w.stumm ? null : this.morgenFrueh() }, w.stumm ? 'Wird wieder gemeldet' : 'Stumm bis morgen – bleibt im Protokoll');
  }
  warnungenProtokoll() { const S = this.s; S.verlauf = 'aktiv'; S.pfilter = 'warnung'; return this.gehe('verlauf'); }   // vorher case 'w-protokoll'
  stromRangAuf(id) { const o = this.s.srOffen ||= []; if (o.includes(id)) o.splice(o.indexOf(id), 1); else o.push(id); return this.neuZeichnen(); }   // vorher case 'sr-auf'
  /* Kacheln (src/ansichten/kacheln.js, BSM-022 3f); die noch alte Auswertung nutzt sie über klick() */
  kkAn(ort, i) { return this.kkListe(ort).filter(y => y.an)[i]; }
  kkWeg(ort, i) { const Lg = this.kkListe(ort), x = Lg.filter(y => y.an)[i]; /* eine Liste: awAuswahl() liefert je Aufruf ein neues Array */ if (!x) return undefined; if (KK[x.k]) Lg.splice(Lg.indexOf(x), 1); else x.an = false; this.kkMerken(ort); return this.neuZeichnen(); }
  kkDiaUm(ort, i) { const x = this.kkAn(ort, i); if (!x) return undefined; x.dia = x.dia === false; this.kkMerken(ort); return this.neuZeichnen(); }
  vgArtUm(ort, i) { const x = this.kkAn(ort, i); if (!x) return undefined; x.art = x.art === 'linien' ? 'balken' : 'linien'; this.kkMerken(ort); return this.neuZeichnen(); }
  kkAufI(ort, i) { const x = this.kkAn(ort, i); return x ? this.kkAuf(x, ort) : undefined; }
  kkPlus(ort) { this.s.sheet = { art: 'kk-katalog', ort, k: null, st: 'M', id: null, dia: true, q: '', f: 'alle', nurJe: false, nurEur: false }; return this.neuZeichnen(); }
  kkLayoutUm() { this.s.kkLayout = !this.s.kkLayout; return this.neuZeichnen(); }
  /* Auswertung (ansichten/auswertung.js, BSM-022 3f) */
  awDetail(k) { this.s.sheet = { art: 'aw-detail', k }; return this.neuZeichnen(); }
  awBearbUmschalten() { const S = this.s; S.awBearb = !S.awBearb; S.awLayout = false; return this.neuZeichnen(); }
  awLayoutUmschalten() { const S = this.s; S.awLayout = !S.awLayout; S.awBearb = false; return this.neuZeichnen(); }
  awAn(i) { const x = this.awAuswahl()[i]; x.an = !x.an; this.awMerken(); return this.neuZeichnen(); }
  awScopeWahl(v) { const S = this.s; S.awScope = v; S.aw.auswahl = this.quellen(S.aw, 'aw').map(q => q.id); return this.neuZeichnen(); }
  awStufeWahl(i, v) { const x = this.awAuswahl()[i], st = awStufen(x.k).find(q => q[0] === v); if (!st) return undefined; Object.assign(x, { w: st[1], h: st[2], st: st[0] }); this.awMerken(); return this.neuZeichnen(); }
  awVerschieben(i, j) { const Lg = this.awAuswahl(); if (j < 0 || j >= Lg.length) return undefined; [Lg[i], Lg[j]] = [Lg[j], Lg[i]]; this.awMerken(); return this.neuZeichnen(); }   // ↑ = (i, i − 1), ↓ = (i, i + 1)
  simUmschalten() { this.s.awSim = !this.s.awSim; return this.neuZeichnen(); }
  tvWahl(v) { this.s.tv = v; return this.neuZeichnen(); }   // Temperaturen Heute / 7 / 30 Tage
  spSim(dd) { const S = this.s; S.simPreis = Math.max(0, Math.round((this.simPreis() + dd) * 100) / 100); try { localStorage.setItem('baustelle-sim-preis', String(S.simPreis)); } catch (e) { /* egal */ } return this.neuZeichnen(); }
  /* Notprogramm (src/ansichten/notprogramm.js, BSM-022 3e; BSM-019/021) */
  npPruefen() { const S = this.s; if (S.npPrueft) return undefined; S.npPrueft = true; this.neuZeichnen();
    return this.ws({ type: 'baustelle/notprogramm_pruefen', entry_id: this.d.entry }, 'Notprogramm geprüft').finally(() => { S.npPrueft = false; this.neuZeichnen(); }); }
  npPlugAuf(id) { this.s.sheet = { art: 'np-plug', id }; return this.neuZeichnen(); }
  /* Container-Inventar (src/ansichten/inventar.js, BSM-031.07): Daten und Schritte kommen von der Integration */
  invDaten() { return this._holen('inv', () => this._hass.callWS({ type: 'baustelle/inventar' }), 60000); }
  invFehler(k = 'inv') { const c = this.cache[k]; return c && c.fehler; }
  invVorschau(id) { return this._holen('invv:' + id, () => this._hass.callWS({ type: 'baustelle/inventar_vorschau', container_id: id }), 30000); }
  invRueckVorschau(id) { return this._holen('invr:' + id, () => this._hass.callWS({ type: 'baustelle/inventar_rueckgaengig', container_id: id, vorschau: true }), 30000); }
  invKandidaten() { const r = this._holen('invk', () => this._hass.callWS({ type: 'baustelle/inventar_kandidaten' }), 30000); return r && r.geraete; }
  invNeu() { for (const k of Object.keys(this.cache)) if (k === 'inv' || k === 'invk' || k.startsWith('invv:') || k.startsWith('invr:')) delete this.cache[k]; }
  invAuf(sheet) { this.s.sheet = sheet; return this.neuZeichnen(); }
  async invSenden(felder, text, schliessen = false) {
    try {
      const r = await this._hass.callWS({ type: 'baustelle/inventar_aendern', ...felder });
      this.invNeu(); if (text) this.toast(text); if (schliessen) this.s.sheet = null; this.neuZeichnen(); this._laden(); return r || { ok: true };
    } catch (e) { this.toast(this.fehlerText(e)); return null; }
  }
  async invAnlegen(f, fi) {
    if (!f.eigen && !fi) return this.toast('Bitte eine Firma wählen');
    if (!f.eigen && !fi.kuerzel && !(await this.invSenden({ aktion: 'firma_kuerzel', entry_id: this.d.entry, firma_id: fi.id, kuerzel: f.kuerzel || '' }))) return;
    const kz = f.eigen ? null : fi.kuerzel || (f.kuerzel || '').trim().toUpperCase();
    const r = await this.invSenden({ aktion: 'container_anlegen', entry_id: this.d.entry, art: f.art, ...(kz ? { firma_kuerzel: kz } : {}),
      ...(f.bereich_id ? { bereich_id: f.bereich_id } : {}), ...(f.eigen && f.bereich_id && +f.nr ? { nr: +f.nr } : {}) }, 'Container angelegt');
    if (r) this.invAuf(f.bereich_id ? { art: 'inv-vorschau', id: r.id } : { art: 'inv-container', id: r.id });
  }
  async invZuordnen(c, s) {
    const k = (this.invKandidaten() || []).find(x => x.device_id === s.wahl); if (!k) return this.toast('Bitte ein Gerät wählen');
    const r = await this.invSenden({ aktion: 'ausruestung_zuordnen', container_id: c.id, device_id: k.device_id, ...(k.typ === 'PLUG' ? { haengt: s.haengt || 'konvektor' } : {}) },
      `${k.name} zugeordnet`);
    if (r) this.invAuf({ art: 'inv-vorschau', id: c.id });
  }
  async invAusfuehren(s) {
    try {
      const r = await this._hass.callWS(s.rueck ? { type: 'baustelle/inventar_rueckgaengig', container_id: s.id } : { type: 'baustelle/inventar_umbenennen', container_id: s.id });
      this.invNeu(); this._laden();
      if (r.status === 'nichts') { this.toast('Schon alles nach Schema'); return this.invAuf({ art: 'inv-container', id: s.id }); }
      this.toast({ ausgefuehrt: 'Umbenannt', teilweise: 'Teilweise umbenannt – Rest folgt', zurueck: 'Zurückgenommen', zurueck_teilweise: 'Teilweise zurückgenommen' }[r.status] || r.status);
      return this.invAuf({ ...s, ergebnis: r });
    } catch (e) { this.toast(this.fehlerText(e)); }
  }
  npProbe(id, m) { return this.ws({ type: 'baustelle/notprogramm_probe', entry_id: this.d.entry, geraet: id, minuten: m }, m ? `Ausfall-Probe ${m} min gestartet` : 'Ausfall-Probe beendet'); }
  /* Dialoge für Container und Geräte (src/ansichten/einblendungen-einrichtung.js, BSM-022 3e); Rümpfe wie bisher in klick() */
  firmaSpeichern() {
    const S = this.s, d = this.d, b = this.b, neu = () => this.neuZeichnen();
    const f = S.sheet.form; if (!f.name.trim()) return this.toast('Bitte einen Namen eingeben');
    const neue = f.neu.filter(c => c.name.trim());
    S.sheet = null; neu();
    return (async () => {
      let ids = [];
      if (neue.length) { try { for (const c of neue) await this.bereichAnlegen(c.name.trim(), c.art === 'Schacht'); ids = await this.neueIds(neue.map(c => c.name.trim())); } catch (e) { return this.toast(`Nicht angelegt: ${this.fehlerText(e)}`); } }
      return this.liste('firmen', 'speichern', { ...(f.id ? { id: f.id } : {}), name: f.name.trim(), container: [...f.container, ...ids] }, `${f.name.trim()} gespeichert${neue.length ? ` · ${neue.length} Container angelegt` : ''}`);
    })();
  }
  firmaWeg() {
    const S = this.s, d = this.d, b = this.b, neu = () => this.neuZeichnen();
    const id = S.sheet.form.id; S.sheet = null; neu(); return this.liste('firmen', 'loeschen', { id }, 'Firma gelöscht – Container gehören wieder der eigenen Firma');
  }
  anschlussSpeichern() {
    const S = this.s, d = this.d, b = this.b, neu = () => this.neuZeichnen();
    const f = S.sheet.form; if (!f.name.trim()) return this.toast('Bitte einen Namen eingeben');
    S.sheet = null; neu();
    return this.liste('anschluesse', 'speichern', { ...(f.id ? { id: f.id } : {}), name: f.name.trim(), ampere: f.ampere, phasen: f.phasen, reserve_kw: f.reserve, container: f.container }, `${f.name.trim()} gespeichert`);
  }
  anschlussWeg() {
    const S = this.s, d = this.d, b = this.b, neu = () => this.neuZeichnen();
    const id = S.sheet.form.id, rest = d.anschluesse.find(x => x.id !== id); S.sheet = null; neu();
    return this.liste('anschluesse', 'loeschen', { id }, `Gelöscht – Container hängen jetzt an ${rest ? rest.name : 'keinem Anschluss'}`);
  }
  containerAnlegen() {
    const S = this.s, d = this.d, b = this.b, neu = () => this.neuZeichnen();
    const f = S.sheet.form, name = f.name.trim() || 'Neuer Container', schacht = f.art === 'Pumpenschacht';
    S.sheet = null; neu();
    return this.einrichten(async () => {
      const r = await this.dialog('config/config_entries/subentries/flow', { handler: [d.entry, 'bereich'] }, this.bereichDaten(name, schacht ? 'pumpenschacht' : 'container', f.fuehler));
      if (this.flowFehler(r) || !f.schalter) return r;
      const [bid] = await this.neueIds([name]); if (!bid) return r;
      return this.geraeteSpeichern([{ aktion: 'anlegen', ...this.geraetDaten(bid, { n: schacht ? 'Pumpe 1' : '', typ: f.typ, schalter: f.schalter }) }]);
    }, `${name} angelegt`).then(() => this._laden());
  }
  bereichSpeichern() {
    const S = this.s, d = this.d, b = this.b, neu = () => this.neuZeichnen();
    const e = S.sheet.edit, x = b; S.sheet = null; neu();
    return this.einrichten(async () => {
      const eb = { ...((d.r.einstellungen.bereiche || {})[x.id] || {}) }, pfad = k => ['bereiche', x.id, k];
      // Geräte zuerst, alle in einem Aufruf über die Integration (kern/geraete, BSM-034.02): geprüft, Inventar zieht mit
      const schritte = e.geraete.flatMap(g => g.weg && !g.neu ? [{ aktion: 'entfernen', geraet: g.id }]
        : g.neu && !g.weg && g.schalter ? [{ aktion: 'anlegen', ...this.geraetDaten(x.id, g) }]
        : !g.neu && !g.weg && (g.n !== g.alt.n || g.typ !== g.alt.typ) ? [{ aktion: 'aendern', geraet: g.id, ...this.geraetDaten(x.id, g) }] : []);
      if (schritte.length) await this.geraeteSpeichern(schritte);
      if (e.name.trim() && (e.name.trim() !== x.name || (e.fuehler || '') !== (x.fuehler || ''))) {
        const r = await this.dialog('config/config_entries/subentries/flow', { handler: [d.entry, 'bereich'], subentry_id: x.id }, this.bereichDaten(e.name.trim(), x.art || 'container', e.fuehler));
        if (this.flowFehler(r)) return r; }
      const call = (k, w) => this._hass.callWS({ type: 'baustelle/setzen', entry_id: d.entry, pfad: pfad(k), wert: w });
      if (e.bedarf !== !!eb.bedarf) await call('bedarf', e.bedarf);
      if (x.groesse) { const m2 = e.groesseArt === 'einzel' ? null : e.groesseArt === 'doppel' ? x.groesse.typen.doppel.m2 : (zahl(e.m2) && Number(e.m2) >= 4 ? Number(e.m2) : undefined);   // AN-0014
        if (m2 !== undefined && m2 !== (eb.groesse_m2 ?? null)) await call('groesse_m2', m2); }
      if ((e.tuer || null) !== (eb.tuer || null)) await call('tuer', e.tuer || null);
      if (e.warmVor !== (x.warmVor ?? null)) await call('warm_vor', e.warmVor);   // BSM-034.01: alles erst bei „Speichern“
      if (e.warmNach !== (x.warmNach ?? null)) await call('warm_nach', e.warmNach);
      if (e.stufen !== !!x.stufenAn) await call('stufen', e.stufen);
      if (x.lern && e.lernen !== !!x.lern.an) await call('lernen', e.lernen);
      if (e.trocknen !== !!x.trocknen) await call('trocknen', e.trocknen);
      if ((e.primaer || null) !== (x.primaer || null)) await call('primaer', e.primaer || null);   // AN-0015
      if (e.anschluss && e.anschluss !== x.anschluss) await call('anschluss', e.anschluss);
      if (e.firma !== x.firma) {
        if (x.firma !== 'eigen') await this._hass.callWS({ type: 'baustelle/liste', entry_id: d.entry, liste: 'firmen', aktion: 'speichern', eintrag: { id: x.firma, name: this.firma(x.firma).name, container: d.bereiche.filter(y => y.firma === x.firma && y.id !== x.id).map(y => y.id) } });
        if (e.firma !== 'eigen') await this._hass.callWS({ type: 'baustelle/liste', entry_id: d.entry, liste: 'firmen', aktion: 'speichern', eintrag: { id: e.firma, name: this.firma(e.firma).name, container: [...d.bereiche.filter(y => y.firma === e.firma).map(y => y.id), x.id] } });
      }
      return true;
    }, e.geraete.some(g => g.weg && !g.neu) ? `Gespeichert · ${e.geraete.filter(g => g.weg && !g.neu).length} entfernt – Werte bleiben im Verlauf` : 'Gespeichert').then(() => this._laden());
  }
  bereichWeg() {
    const S = this.s, d = this.d, b = this.b, neu = () => this.neuZeichnen();
    const x = b; S.sheet = null; this.gehe('uebersicht');
    return this.einrichten(async () => {
      if (x.geraete.length) await this.geraeteSpeichern(x.geraete.map(g => ({ aktion: 'entfernen', geraet: g.id })));   // Inventar: Einsätze enden
      await this._hass.callWS({ type: 'config_entries/subentries/delete', entry_id: d.entry, subentry_id: x.id }); return true;
    }, `${x.name} entfernt – Werte bleiben im Verlauf`).then(() => this._laden());
  }
  geraetSpeichern() {
    const S = this.s, d = this.d, b = this.b, neu = () => this.neuZeichnen();
    const f = S.sheet.form, g = b.geraete[S.sheet.i], x = b; if (!f.n.trim() || !f.schalter) return this.toast('Bitte Name und Shelly wählen');
    S.sheet = S.sheet.zurueck || null; neu();
    const geaendert = f.n.trim() !== g.n || f.schalter !== g.schalter || f.typ !== g.typ || f.bereich !== x.id || f.leistung !== (g.leistungEigen || '') || f.energie !== (g.energieEigen || '');
    return this.einrichten(async () => {
      if (geaendert) {
        await this.geraeteSpeichern([{ aktion: 'aendern', geraet: g.id, ...this.geraetDaten(f.bereich, { n: f.n.trim(), typ: f.typ, schalter: f.schalter }),
          leistung: f.leistung || null, energie: f.energie || null }]); }   // leer = automatisch
      if (f.status !== g.status) { await this._hass.callWS({ type: 'baustelle/geraet', entry_id: d.entry, geraet: g.id, aktion: 'status', status: f.status }); this.invNeu(); }   // BSM-034.02
      const call = (k, w) => this._hass.callWS({ type: 'baustelle/setzen', entry_id: d.entry, pfad: ['geraete', g.id, k], wert: w });
      if (f.nennKw !== (g.nennKwEigen ?? null)) await call('nenn_kw', f.nennKw);   // BSM-034.01: erst bei „Speichern“
      if (f.zusatz !== !!g.zusatz) await call('zusatz', f.zusatz);
      return true;
    }, `${f.n.trim()} gespeichert`).then(() => this._laden());
  }
  /* Dialoge ändern nur ihren Entwurf; gespeichert wird bei „Speichern“, Abbrechen nimmt alles zurück (BSM-034.01) */
  warmEigen(e, k, dd) { const d = this.d, key = k === 'vor' ? 'warmVor' : 'warmNach', alt = e[key] ?? (k === 'vor' ? d.e.warm_vor : d.e.warm_nach);   // AN-0004
    e[key] = Math.max(0, Math.min(240, alt + dd)); return this.neuZeichnen(); }
  warmZurueck(e) { e.warmVor = null; e.warmNach = null; return this.neuZeichnen(); }
  geraetNennKw(f, g, dd) { f.nennKw = Math.max(0, Math.min(10, Math.round(((f.nennKw ?? g.kw) + dd) * 10) / 10)); return this.neuZeichnen(); }   // Szenarien: Nennleistung ohne Messung
  unterDialog(sheet) { const s = this.s.sheet; this.s.sheet = { ...sheet, zurueck: s && s.art === 'bereich' ? s : null }; return this.neuZeichnen(); }   // aus „Bearbeiten“: danach dorthin zurück, Entwurf bleibt
  aussehenAuf(x) { return this.unterDialog({ art: 'aussehen', id: x.id }); }   // BSM-032
  bereichEntwurf(x, s) {   // Entwurf für „Container bearbeiten“: einmal aus den Daten, danach bleibt er beim Neuzeichnen stehen
    const d = this.d;
    return s.edit ||= { bedarf: !!x.bedarf, name: x.name, anschluss: x.anschluss || (d.anschluesse[0] && d.anschluesse[0].id) || '', tuer: (x.tuer && x.tuer.eid) || '', firma: x.firma || 'eigen', fuehler: x.fuehler || '',
      groesseArt: (x.groesse && x.groesse.art) || 'einzel', m2: x.groesse ? x.groesse.m2 : null,
      warmVor: x.warmVor ?? null, warmNach: x.warmNach ?? null, stufen: !!x.stufenAn, primaer: x.primaer || '',   // AN-0015
      lernen: !!(x.lern && x.lern.an), trocknen: !!x.trocknen,   // AN-0018: Lernen und Trocknen stehen in „Bearbeiten“, gespeichert mit „Speichern“
      // nur eigene Sensoren – die automatisch gefundenen sucht die Integration weiter selbst (BSM-034.01)
      geraete: x.geraete.map(g => ({ id: g.id, n: g.n, typ: g.typ, schalter: g.schalter, leistung: g.leistungEigen || undefined, energie: g.energieEigen || undefined, alt: { n: g.n, typ: g.typ } })) };
  }
  symAendern(x, fn) { const c = JSON.parse(JSON.stringify(this.symKonfig(x))); fn(c); return this.symSenden(x, c); }
  symStandard() { const s = this.s.sheet; s.sym = null; s.std = true; return this.neuZeichnen(); }
  symSpeichern(b) { const s = this.s.sheet, neu = s.std ? null : s.sym;
    this.s.sheet = s.zurueck || null; this.neuZeichnen();
    return (s.std ? b.symbol && b.symbol.eigen : JSON.stringify(neu) !== s.anfang) ? this.setzen(['bereiche', b.id, 'symbol'], neu) : null; }
  /* Dialoge rund um die Baustelle (src/ansichten/einblendungen-baustelle.js, BSM-022 3e) */
  berichtDaten() {   // Inhalt des Beispielberichts von der Integration; undefined = lädt, null = nicht verfügbar
    const d = this.d, e = d.e, art = e.bericht === 'monat' ? 'monat' : 'woche';
    return !d.geladen ? null : this._holen(`b:${d.entry}:${art}:${d.z.HEUTE}:${e.bericht_mail}:${e.bericht_csv}:${e.mail}`, () => this._hass.callWS({ type: 'baustelle/bericht', entry_id: d.entry, art }), 120000);
  }
  nameSpeichern() { const S = this.s, n = S.sheet.form.name.trim(); if (!n) return this.toast('Bitte einen Namen eingeben'); S.sheet = null; this.neuZeichnen();
    return this.ws({ type: 'config_entries/update', entry_id: this.d.entry, title: n }, 'Gespeichert'); }
  baustelleAnlegen() {
    const S = this.s, n = S.sheet.form.name.trim(); if (!n) return this.toast('Bitte einen Namen eingeben'); S.sheet = null; this.neuZeichnen();
    const heute = this.d ? this.z.HEUTE : new Date().toISOString().slice(0, 10);
    return this.einrichten(() => this.dialog('config/config_entries/flow', { handler: 'baustelle', show_advanced_options: false }, { name: n, beginn: heute, heizung: true, pumpen: true }), `${n} angelegt – jetzt Container anlegen`)
      .then(r => { if (r && r.next_flow) this._hass.callApi('DELETE', `config/config_entries/subentries/flow/${r.next_flow[1]}`).catch(() => {});
        if (r && r.result && r.result.entry_id) { this.bid = r.result.entry_id; this._merken(); } this._laden(); });
  }
  zeitraumBsSpeichern() {
    const S = this.s, d = this.d, f = S.sheet.form; if (f.ende && f.ende < (f.beginn || (d.beginnAuto ? d.beginn : ''))) return this.toast('Bitte Beginn und Ende prüfen');
    S.sheet = null; this.neuZeichnen();
    return this.einrichten(() => this.optionenSpeichern(d, { beginn: f.beginn || null, ende: f.ende || null, heizperiode_von: String(f.hp[0]), heizperiode_bis: String(f.hp[1]) }), 'Gespeichert').then(() => this._laden());
  }
  abschliessen() { const d = this.d; this.s.leeren(); this.neuZeichnen();
    return this.einrichten(() => this.optionenSpeichern(d, { status: 'abgeschlossen' }), 'Abgeschlossen – steht jetzt im Verlauf').then(() => this._laden()); }
  urlaubSpeichern() {
    const S = this.s, d = this.d, f = S.sheet.form; if (!f.von || !f.bis || f.bis < f.von) return this.toast('Bitte Von und Bis prüfen');
    S.sheet = null; this.neuZeichnen(); delete this.cache['k:' + d.optionen.urlaub_kalender];
    return this.ws({ type: 'calendar/event/create', entity_id: d.optionen.urlaub_kalender, event: { summary: f.name.trim() || 'Urlaub', dtstart: f.von, dtend: plusTage(f.bis, 1) } }, 'Eingetragen – in der Zeit nur Frostschutz');
  }
  wetterquelleSpeichern() {
    const S = this.s, d = this.d, f = S.sheet.form; S.sheet = null; this.neuZeichnen();
    return this.einrichten(async () => {
      const r = await this.optionenSpeichern(d, { wetter: f.wetter, temp_sensor: f.temp_sensor, regen_sensor: f.regen_sensor, urlaub_kalender: f.urlaub_kalender, feiertag_kalender: f.feiertag_kalender });
      if (this.flowFehler(r)) return r;
      if ((f.termine_kalender || null) !== (d.termineKal || null)) await this._hass.callWS({ type: 'baustelle/setzen', entry_id: d.entry, pfad: ['termine_kalender'], wert: f.termine_kalender || null });
      return r;
    }, 'Gespeichert').then(() => { this.cache = {}; this._aboFuer = null; this._laden(); });
  }
  preisSpeichern() {
    const S = this.s, f = S.sheet, p = parseFloat(String(f.preis).replace(',', '.')); if (!f.ab || !zahl(p) || p < 0) return this.toast('Bitte Datum und Preis prüfen');
    S.sheet = null; this.neuZeichnen(); this.cache = {}; return this.liste('preise', 'speichern', { ab: f.ab, preis: p }, `Strompreis ${de(p, 2)} € ab ${datum(f.ab)} gespeichert`);
  }
  bsLoeschen() {
    const S = this.s, d = this.d, x = this.alle.find(y => y.entry === S.sheet.id); S.sheet = null; if (!x) return this.neuZeichnen();
    const weg = (d && d.entry === x.entry) || (S.view === 'bsdetail' && S.bs === x.entry); this.neuZeichnen();
    return this.einrichten(() => this._hass.callApi('DELETE', `config/config_entries/entry/${x.entry}`), `${x.titel} gelöscht`)
      .then(r => { if (!r) return; this._rohText = null; return this._laden().then(() => { if (weg) this.gehe('uebersicht'); }); });
  }
  bsBearbeiten(id) {   // aktiv → „Baustelle bearbeiten“ (AN-0002), abgeschlossen → Detailseite (wieder aktiv setzen)
    const S = this.s, x = this.alle.find(y => y.entry === id); if (!x) return undefined;
    if (!x.aktiv) { S.bs = x.entry; return this.gehe('bsdetail'); }
    if (x.entry !== this.bid) { this.bid = x.entry; this._merken(); this._neuBauen(); this._vorhersageAbo(); this._stimmung(true); S.aw = null; }
    S.sheet = { art: 'bs-bearbeiten' }; return this.neuZeichnen();
  }
  /* Einstellungen (src/ansichten/einstellungen.js, BSM-022 3e); Übersicht und Einblendungen nutzen sie über klick() */
  einstGruppeWahl(k) { this.s.evGruppe = k; this.s.evDev = null; return this.neuZeichnen(true); }
  bereichEinst(id) { this.s.cid = id; this.s.sheet = { art: 'bereich' }; return this.neuZeichnen(); }
  firmaAuf(id) { const d = this.d, f = id ? this.firma(id) : null;
    this.s.sheet = { art: 'firma', form: { id: f && f.id, name: (f && f.name) || '', neu: [], container: f ? d.bereiche.filter(x => (x.firma || 'eigen') === f.id).map(x => x.id) : [] } }; return this.neuZeichnen(); }
  anschlussAuf(id) { const d = this.d, x = id ? this.anschluss(id) : null;
    this.s.sheet = { art: 'anschluss', form: { id: x && x.id, name: (x && x.name) || '', ampere: (x && x.ampere) || 32, phasen: (x && x.phasen) || 3, reserve: x ? x.reserve : 3, container: x ? d.bereiche.filter(y => y.anschluss === x.id).map(y => y.id) : [] } }; return this.neuZeichnen(); }
  preisNeu() { this.s.sheet = { art: 'preis-neu', ab: plusTage(this.z.HEUTE, 1), preis: this.d.e.preis }; return this.neuZeichnen(); }
  preisWeg(ab) { this.cache = {}; return this.liste('preise', 'loeschen', { ab }, 'Strompreis gelöscht'); }
  vorrang(x, v) { return this.setzen(['bereiche', x.id, 'prio'], v); }
  testMeldung() { return this.aktion('test_meldung', {}).then(r => { if (r && r.an) this.toast(r.an.length ? `Test-Nachricht an ${r.an.join(', ')} gesendet` : 'Kein Empfänger – bitte unter Meldungen wählen'); }); }
  berichtSenden() { const art = this.d.e.bericht === 'monat' ? 'monat' : 'woche'; return this.aktion('bericht_senden', { art }, `Bericht für ${art === 'monat' ? 'den Vormonat' : 'die Vorwoche'} gesendet`); }
  mailSetzen(v) { return this.setzen(PFAD.mail, String(v).trim(), 'Gespeichert'); }
  awVorlageWahl(v) { const S = this.s; this.awVorlage(v); if (S.sheet && S.sheet.art === 'kk-katalog') S.sheet = null; this.neuZeichnen(); return this.toast(`Vorlage „${AW_VORLAGEN[v][0]}“ übernommen`); }
  /* Reiter Heizung (src/ansichten/heizung.js, BSM-022 3d); Einstellungen und Einblendungen nutzen sie über klick() */
  automatikUmschalten() { const e = this.d.e; return this.setzen(['automatik'], !e.auto, !e.auto ? 'Automatik ein' : 'Automatik aus – Geräte bleiben, wie sie sind'); }
  hzAuf(k) { this.s.sheet = { art: 'hz', k }; return this.neuZeichnen(); }
  /* J4b: Baseline-Läufe (ansichten/baseline.js) – einschalten, Kostenrahmen in 10-€-Schritten (0–1000 wie panel.py), absagen bzw. abbrechen */
  baselineUmschalten() { const an = !this.d.e.baseline; return this.setzen(['heizung', 'baseline'], an, an ? 'Baseline messen ein – Läufe werden am Vortag angekündigt' : 'Baseline messen aus'); }
  baselineRahmen(schritt) { const alt = this.d.e.baseline_eur, wert = Math.min(1000, Math.max(0, alt + schritt)); return wert === alt ? undefined : this.setzen(['heizung', 'baseline_eur_monat'], wert); }
  baselineAbsagen(l) { return this.aktion('baseline_absagen', { lauf_id: l.id }, l.status === 'laeuft' ? 'Lauf abgebrochen – die Automatik übernimmt' : 'Lauf abgesagt'); }
  einstellungUmschalten(k) { const e = this.d.e; if (ARTEN[k]) return this.setzen(['meldungen_einst', 'arten', ARTEN[k]], !e[k]); return this.setzen(PFAD[k], !e[k]); }
  einstellungWert(k, v) { return this.setzen(PFAD[k], isNaN(+v) ? v : +v); }
  heizgrenzeBasis(v) { return this.setzen(PFAD.basis, v === 'jetzt' ? 'jetzt' : 'tageshoechst'); }
  gefuehlVergessen() { return this.aktion('gefuehl_vergessen', {}, 'Gelerntes Gefühl vergessen – es gilt der Startwert nach draußen'); }
  containerSoll(x, dd) { const [min, max] = GRENZEN.soll; return this.setzen(['bereiche', x.id, 'soll'], Math.min(max, Math.max(min, Math.round(((x.soll ?? this.d.e.soll) + dd) * 2) / 2))); }
  urlaubWeg(u) {
    const d = this.d; delete this.cache['k:' + d.optionen.urlaub_kalender];
    return this.ws({ type: 'calendar/event/delete', entity_id: d.optionen.urlaub_kalender, uid: u.uid, ...(u.recurrence_id ? { recurrence_id: u.recurrence_id } : {}) }, `${u.name} gelöscht`);
  }
  ausnahmeNeu(v) {
    const az = (this.azJetzt || { tage: {} }).tage, h = this.z.HEUTE, morgen = plusTage(h, 1);
    const sa = plusTage(h, (5 - (new Date(h + 'T12:00:00Z').getUTCDay() + 6) % 7 + 7) % 7 || 7);   // nächster Samstag
    const vor = { 'heute-laenger': { datum: h, art: 'zeiten', von: (az[wtag(h)] || ['07:00'])[0], bis: '18:00', notiz: 'heute länger' },
      'morgen-spaeter': { datum: morgen, art: 'zeiten', von: '09:00', bis: (az[wtag(morgen)] || ['', '16:30'])[1], notiz: 'morgen später' },
      samstag: { datum: sa, art: 'arbeit', von: '07:00', bis: '12:00', notiz: '' }, frei: { datum: morgen, art: 'frei', von: '07:00', bis: '16:30', notiz: '' } }[v]
      || { datum: plusTage(h, 7), art: 'zeiten', von: '07:00', bis: '16:30', notiz: '' };
    this.s.sheet = { art: 'ausnahme', form: { ...vor } }; return this.neuZeichnen();
  }
  ausnahmeDazu(datum) { this.s.sheet = { art: 'ausnahme', form: { datum, art: 'arbeit', von: '17:00', bis: '19:00', notiz: '' } }; return this.neuZeichnen(); }
  ausnahmeWeg(a) {   // FE-0012: nur dieses Fenster
    const e = a.art ? { datum: a.datum, art: a.art, von: a.von || null, bis: a.bis || null } : { datum: a.datum };
    return this.liste('ausnahmen', 'loeschen', e, a.art && a.art !== 'frei' ? `Zeitfenster ${a.von}–${a.bis} gelöscht – die anderen bleiben` : 'Ausnahme gelöscht – es gilt wieder die Arbeitszeit');
  }
  azNeu(v) {   // neue Arbeitszeit ab nächstem Montag, Tage als Vorlage aus v (die geltende oder die gewählte)
    const tage = v ? JSON.parse(JSON.stringify(v.tage)) : { Mo: ['07:00', '16:30'], Di: ['07:00', '16:30'], Mi: ['07:00', '16:30'], Do: ['07:00', '16:30'], Fr: ['07:00', '12:30'], Sa: null, So: null };
    this.s.sheet = { art: 'az-neu', form: { ab: plusTage(this.z.WOCHE_ISO[0], 7), name: '', tage } }; return this.neuZeichnen();
  }
  /* Einblendungen der Container-Ansicht (src/ansichten/einblendungen-container.js, BSM-022 3d) */
  schliessen() { this.s.sheet = (this.s.sheet && this.s.sheet.zurueck) || null; return this.neuZeichnen(); }
  zeitraumWahl(ziel, z) { const st = ziel === 'aw' ? this.s.aw : this.s.sheet; if (st.zeitraum !== z) st.v = 0; st.zeitraum = z; this.s.zrKal = null; return this.neuZeichnen(); }
  lernZuruecksetzen(x) { this.s.sheet = null; this.neuZeichnen(); return this.aktion('lern_reset', { bereich: x.id }, `${x.name}: Lernstand zurückgesetzt`); }
  terminSpeichern() {
    const S = this.s, d = this.d, f = S.sheet.form; if (!f.titel.trim() || !f.datum || f.bis <= f.von) return this.toast('Bitte Titel, Tag und Uhrzeit prüfen');
    if (!d.termineKal) return this.toast('Zuerst einen Kalender für Termine wählen');
    const ev = { summary: f.titel.trim(), dtstart: `${f.datum}T${f.von}:00`, dtend: `${f.datum}T${f.bis}:00`, description: `baustelle:${f.b}${f.boost ? '\nboost' : ''}` };   // Zuordnung zum Container (api §4)
    if (f.wieder !== 'einmal') ev.rrule = f.wieder === 'woche' ? 'FREQ=WEEKLY' : 'FREQ=WEEKLY;INTERVAL=2';
    S.sheet = null; this.neuZeichnen();
    return this.ws({ type: 'calendar/event/create', entity_id: d.termineKal, event: ev }, `Eingetragen${f.wieder !== 'einmal' ? ` – ${WIEDER[f.wieder]} am ${wtag(f.datum)}` : ''} – heizt ab ${uhr(minu(f.von) - d.e.vorheizen)}`);
  }
  /* Container (src/ansichten/container.js, BSM-022 3d); Übersicht und Einblendungen nutzen sie über klick() */
  nurAdmin(fn) { return (...x) => this.nurLesen() ? this.toast(NUR_ANSEHEN) : fn(...x); }   // wie NUR_LESEN_SPERRE für Lit-Knöpfe (.nur-admin)
  modusSetzen(x, m) { if (x.modus === m) return undefined; return this.setzen(['bereiche', x.id, 'modus'], m, `${x.name}: ${(MODI.find(q => q[0] === m) || [m, m])[1]}`); }
  boostUmschalten(x) { return this.aktion('boost', { bereich: x.id, an: !x.boost }, !x.boost ? `${x.name}: schnell aufheizen` : `${x.name}: normal weiter`); }
  sollSchritt(x, dd) {
    if (this.d.e.soll_art === 'gleitend') return this.aktion('soll_versch', { bereich: x.id, d: dd }, `Soll heute ${dd > 0 ? 'wärmer' : 'kühler'} – ab morgen früh wieder gleitend · als „${dd > 0 ? 'zu kalt' : 'zu warm'}“ gemerkt`);   // gleitend: bis morgen früh verschieben und als Gefühl merken (Herbert 01.10.2026)
    return this.setzen(['bereiche', x.id, 'soll'], Math.max(5, Math.min(30, (x.soll ?? this.d.e.soll) + dd)));
  }
  gefuehl(x, v) { return this.aktion('gefuehl', { bereich: x.id, wert: v }, v === 0 ? 'Gemerkt: passt' : `Gemerkt: ${v < 0 ? 'zu kalt' : 'zu warm'} – das Soll lernt mit`); }
  sollZurueck(x) { return this.aktion('soll_versch_weg', { bereich: x.id }, 'Zurück auf gleitendes Soll'); }
  geraetAktiv(b, i) { const g = b.geraete[i]; this.invNeu();   // BSM-034.02: derselbe Status wie ✎ und Inventar
    return this.ws({ type: 'baustelle/geraet', entry_id: this.d.entry, geraet: g.id, aktion: 'status', status: g.aktiv ? 'inaktiv' : 'aktiv' }, g.aktiv ? `${g.n} inaktiv – die Automatik lässt es aus` : `${g.n} wieder aktiv`); }
  geraetAutomatik(b, i) { const g = b.geraete[i]; return this.aktion('automatik', { geraet: g.id }, `${g.n}: Automatik übernimmt`); }
  /* BSM-034.05: Gerät oder Sensor aus Einstellungen › Geräte öffnen (Gerätedialog bzw. Einblendung „Sensor“) */
  geraetOeffnen(bid, gid) { const b = this.d.bereiche.find(x => x.id === bid), i = b ? b.geraete.findIndex(g => g.id === gid) : -1;
    if (i < 0) return undefined; this.s.cid = bid; return this.geraetBearbeiten(b, i); }
  sensorOeffnen(bid, eid) { this.s.sheet = { art: 'sensor', bid, eid }; return this.neuZeichnen(); }
  geraetBearbeiten(b, i) { const g = b.geraete[i];
    return this.unterDialog({ art: 'geraet-edit', i, form: { n: g.n, schalter: g.schalter, typ: g.typ, bereich: b.id, leistung: g.leistungEigen || '', energie: g.energieEigen || '', status: g.status,
      nennKw: g.nennKwEigen ?? null, zusatz: !!g.zusatz } }); }
  lernenUmschalten(x) { return this.setzen(['bereiche', x.id, 'lernen'], !(x.lern && x.lern.an)); }
  trocknenUmschalten(x) { return this.setzen(['bereiche', x.id, 'trocknen'], !x.trocknen); }
  bedarfAn(id, v) {
    const S = this.s, x = this.d.bereiche.find(y => y.id === id), boost = !!(S.sheet && S.sheet.art === 'bedarf' && S.sheet.boost);
    const felder = v === 'ende' ? { bis: this.isoHeute(this.arbeitsende() || '16:30') } : v === 'abend' ? { bis: this.isoHeute('19:00') } : { minuten: +v };
    const bisText = v === 'ende' ? this.arbeitsende() : v === 'abend' ? '19:00' : uhr(minu(this.z.JETZT) + +v);
    S.sheet = null; this.neuZeichnen(); return this.aktion('bedarf', { bereich: x.id, ...felder, boost }, `${x.name} heizt bis ${bisText}`);
  }
  bedarfAuf(id) {   // Vor-Ort-Aktion: auch ohne Adminrechte, wenn die Integration „bedarf“ erlaubt
    const r = this.rechte(); if (!r.aendern && !(r.aktionen || []).includes('bedarf')) return this.toast(NUR_ANSEHEN);
    this.s.sheet = { art: 'bedarf', cid: id, boost: false }; return this.neuZeichnen();
  }
  bedarfAus(id) { const x = this.d.bereiche.find(y => y.id === id); return this.aktion('bedarf_aus', { bereich: x.id }, `${x.name} aus – nur Frostschutz`); }
  terminWeg(t) {
    if (!t.uid) return this.toast('Dieser Kalender nennt keine Kennung – Termin bitte im Kalender löschen');
    return this.ws({ type: 'calendar/event/delete', entity_id: this.d.termineKal, uid: t.uid }, `Termin „${t.titel}“ gelöscht`);
  }
  /* Aktionen der Ansichten (Lit-Vorlagen rufen sie direkt, die alten über klick(); BSM-022 3c) */
  containerOeffnen(id) { this.s.chart = 'temp'; this.s.cZr = null; return this.gehe('container', id); }
  einstGruppe(g) { this.s.evGruppe = g; return this.gehe('einst'); }
  bereichAuto(x) { return this.setzen(['bereiche', x.id, 'auto'], !x.auto); }
  geraetSchalten(b, i) { const g = b.geraete[i]; return this.aktion('schalten', { geraet: g.id, an: !g.an }, b.auto && this.d.e.auto ? 'Handbetrieb bis zum nächsten Schaltpunkt' : undefined); }
  stufeSchritt(k, schritt) {   // Stepper einer Einstellung: in den Grenzen, Frostschutz „ein unter“ < „aus über“
    const e = this.d.e, [min, max] = GRENZEN[k] || [0, 1e9];
    const wert = Math.min(max, Math.max(min, Math.round((e[k] + schritt) * 100) / 100)); if (wert === e[k]) return undefined;
    if (k === 'frost_aus' && wert <= e.frost_temp) return this.toast('„aus über“ muss über „ein unter“ liegen');
    if (k === 'frost_temp' && wert >= e.frost_aus) return this.toast('„ein unter“ muss unter „aus über“ liegen');
    return this.setzen(PFAD[k], wert);
  }
  zrSchritt(ziel, max, schritt) { const st = this.zrSt(ziel); st.v = Math.max(0, Math.min(max, (st.v || 0) + schritt)); this.s.zrKal = null; return this.neuZeichnen(); }
  zrSetzen(ziel, max, v) { this.zrSt(ziel).v = Math.max(0, Math.min(max, v)); this.s.zrKal = null; return this.neuZeichnen(); }
  zrKalAuf(ziel) {
    const S = this.s; if (S.zrKal && S.zrKal.ziel === ziel) { S.zrKal = null; return this.neuZeichnen(); }
    const st = this.zrSt(ziel), iso = this.zrInfo(st.zeitraum, st.v || 0).iso; S.zrKal = { ziel, j: +iso.slice(0, 4), m: +iso.slice(5, 7) - 1 }; return this.neuZeichnen();
  }
  zrKalBlaettern(dd) {
    const k = this.s.zrKal; if (!k) return undefined; const z = this.zrSt(k.ziel).zeitraum;
    if (z === 'Tag' || z === 'Woche') { k.m += dd; if (k.m < 0) { k.m = 11; k.j--; } if (k.m > 11) { k.m = 0; k.j++; } } else k.j += dd; return this.neuZeichnen();
  }
  /* Verlauf (src/ansichten/verlauf.js): Protokoll der Baustelle (vollständig nachgeladen, sonst aus der Struktur) */
  protokollQuelle(d) {
    let quelle = d.protokoll;
    if (d.geladen) { const rr = this._holen('p:' + d.entry, () => this._hass.callWS({ type: 'baustelle/protokoll', entry_id: d.entry, filter: 'alle', vor: null, limit: 200 }), 60000);
      if (rr !== undefined) quelle = (Array.isArray(rr) ? rr : (rr && rr.eintraege) || []).map(p => this.protokollZeile(p, this.z)); }
    return quelle;
  }
  /* Protokoll-Auszug einer (abgeschlossenen) Baustelle; nicht geladen: die Integration kennt nur die Struktur */
  bsProtokoll(x) {
    const prot = !x.geladen ? [] : this._holen(`bp:${x.entry}`, () => this._hass.callWS({ type: 'baustelle/protokoll', entry_id: x.entry, filter: 'alle', vor: null, limit: 5 }), 300000);
    return prot === undefined ? null : (Array.isArray(prot) ? prot : (prot && prot.eintraege) || []).slice(0, 5);
  }
  /* Baustelle öffnen: laufende → Übersicht dieser Baustelle, abgeschlossene → Detailseite */
  baustelleOeffnen(id) {
    const x = this.alle.find(y => y.entry === id); if (!x) return;
    if (x.aktiv) { this.bid = x.entry; this._merken(); this._neuBauen(); this._vorhersageAbo(); this._stimmung(true); this.s.aw = null; return this.gehe('uebersicht'); }
    this.s.bs = x.entry; return this.gehe('bsdetail');
  }
  baustelleAktiv(id) {
    const x = this.alle.find(y => y.entry === id); if (!x) return;
    return this.einrichten(() => this.optionenSpeichern(x, { status: 'aktiv', ende: null }), 'Baustelle wieder aktiv – Automatik bleibt aus, bis du sie einschaltest').then(() => this._laden());
  }
  /* Entwicklung (src/ansichten/dev.js) */
  meldungStatus(id) { const d = this.d, m = (this.meldungen() || []).find(x => x.id === id); if (!m) return; delete this.cache.meldungen;
    return this.ws({ type: 'baustelle/meldung', entry_id: d.entry, aktion: 'status', meldung_id: m.id, status: this.meldungOffen(m) ? 'geschlossen' : 'neu' }); }
  meldungBild(id, i) { this.s.sheet = { art: 'm-bild', id, i }; return this.neuZeichnen(); }
  meldungWeg(id) { delete this.cache.meldungen; return this.ws({ type: 'baustelle/meldung', entry_id: this.d.entry, aktion: 'loeschen', meldung_id: id }, 'Meldung gelöscht'); }
  meldungenKopieren() { const md = this.meldungenMarkdown(); if (typeof navigator !== 'undefined' && navigator.clipboard) navigator.clipboard.writeText(md).catch(() => {}); return this.toast(`${(this.meldungen() || []).length} Meldungen als Markdown kopiert`); }
  meldungenJson() { this.datei(JSON.stringify(this.meldungen() || [], null, 2), 'baustelle-meldungen.json', 'application/json'); return this.toast('baustelle-meldungen.json'); }
  diagnoseHerunterladen() { const d = this.d; return this.ws({ type: 'auth/sign_path', path: `/api/diagnostics/config_entry/${d.entry}` }).then(r => { if (r && r.path) { this.herunterladen(r.path, `baustelle-${d.entry}.json`); this.toast('Diagnose wird heruntergeladen (wie in HA unter Geräte & Dienste)'); } }); }
  /* Melde-Dialog (Lit, src/melden.js): senden und schließen */
  meldungSenden() {
    const f = this.s.sheet.form; if (!f.text.trim()) return this.toast('Bitte kurz beschreiben');
    // „Stand der Seite mitschicken“ → Feld `seite` (api §5; `stand` ist in der Integration der Zeitpunkt der Statusänderung)
    const meldung = { art: f.art, text: f.text.trim(), kontext: f.kontext, version: this.version, geraet: f.geraet,
      seite: f.stand ? { view: this.s.view, cid: this.s.cid, baustelle: this.d ? this.d.entry : null, dialog: this.s.sheet.vorher ? this.s.sheet.vorher.art : null } : null,
      ...((f.bilder || []).length ? { bilder: f.bilder.map(x => x.url) } : {}) };   // WU-0016
    // FE-0027: das Fenster bleibt offen, bis die Meldung angekommen ist – bei einem Fehler sind Text und Bilder noch da
    const fenster = this.s.sheet; if (fenster.sendet) return; fenster.sendet = true; delete this.cache.meldungen;
    return this.ws({ type: 'baustelle/meldung', entry_id: this.d && this.d.entry, aktion: 'neu', meldung }).then(r => {
      fenster.sendet = false;
      if (!r) return this.neuZeichnen();
      if (this.s.sheet === fenster) this.s.sheet = fenster.vorher || null;
      this.neuZeichnen(); this.toast(`Danke – gemeldet als ${r.ticket || 'Ticket'}`);
    });
  }
  meldenZu() { this.s.sheet = (this.s.sheet && this.s.sheet.vorher) || null; return this.neuZeichnen(); }
  /* Melde-Dialog öffnen (Knopf unten rechts, „Über“) */
  meldenAuf() {
    const namen = { uebersicht: 'Übersicht', container: 'Container', heizung: 'Heizung', auswertung: 'Auswertung', verlauf: 'Verlauf', einst: 'Einstellungen', ueber: 'Über', dev: 'Entwicklung', bsdetail: 'Baustelle (abgeschlossen)' };
    const kontext = [namen[this.s.view] || this.s.view, this.s.view === 'container' && this.b ? this.b.name : '', this.s.sheet ? `Dialog „${this.s.sheet.art}“` : ''].filter(Boolean).join(' · ');
    const breite = this.root && this.root.getBoundingClientRect ? this.root.getBoundingClientRect().width : 1000, geraet = breite < 700 ? 'Handy' : 'Desktop';
    this.s.sheet = { art: 'melden', vorher: this.s.sheet, form: { art: 'wunsch', text: '', kontext, geraet, stand: true } };
    return this.neuZeichnen();
  }
  toast(t, wieder = false) {
    const el = this.root && this.root.querySelector('.toast'); if (!el || !t) return;
    el.textContent = t; el.classList.remove('an'); void el.offsetWidth; el.classList.add('an'); this.letzterToast = t;
    if (!wieder) this._toastBis = Date.now() + 2000;
  }

  /* Neu zeichnen (BSM-022 2b): erst den Zustand ändern, dann neuZeichnen() – Lit zeichnet im nächsten Durchlauf, mehrere
     Aufrufe werden zusammengefasst; neu = Ansicht gewechselt (oben beginnen, Einblend-Animation) */
  neuZeichnen(neu = false) { if (neu) this._neu = true; this.requestUpdate(); return this.updateComplete; }
  willUpdate() {
    const evc = this.ui && this.ui.querySelector('.ev-chips'); this._evPos = evc ? evc.scrollLeft : 0;   // FE-0013: Chip-Leiste behält ihre Position
    if (this.ui) this.ui.classList.toggle('still', !this._neu && this._view === this.s.view);   // Neuzeichnen ohne Einblend-Animationen
    this._sheetVorher = this._sheetArt; this._view = this.s.view; this._sheetArt = this.s.sheet && this.s.sheet.art;
    // Reiter nach den Funktionen der Baustelle (api §8): Heizung nur mit Funktion heizung, Pumpen nur mit Funktion
    // pumpen und Pumpenschächten (0.7.8, wie 0.6.3)
    this._mitHeizung = !this.d || this.d.funktionen.includes('heizung');
    this._mitPumpen = !!(this.d && this.d.funktionen.includes('pumpen') && this.d.bereiche.some(b => b.pumpe));
    if (!this.d && !['verlauf', 'bsdetail', 'ueber'].includes(this.s.view)) this.s.view = 'uebersicht';
    if (this.s.view === 'pumpen' && !this._mitPumpen) this.s.view = 'uebersicht';
    if (this.s.view === 'heizung' && !this._mitHeizung) this.s.view = 'uebersicht';
    if (this.s.view === 'container' && !this.b) this.s.view = 'uebersicht';
  }
  /* Rahmen der Seite – bleibt stehen; Scrollbereich und Einblendung behalten so Position und Fokus von selbst */
  render() {
    return html`<div class="wurzel"><div class="app"><div class="glas-bg"><i class="k1"></i><i class="k2"></i><i class="k3"></i><div class="dunst"></div><div class="partikel"></div></div><div class="ui">${this._ui()}</div></div></div>`;
  }
  /* Inhalt: Ansicht, Navigation, Einblendung und Melden-Knopf als Lit-Vorlagen (BSM-022) */
  _ui() {
    const neu = !!this._neu, S = this.s;
    const tabs = [['uebersicht', 'Übersicht'], ...(this._mitHeizung ? [['heizung', 'Heizung']] : []), ...(this._mitPumpen ? [['pumpen', 'Pumpen']] : []), ['auswertung', 'Auswertung'], ['verlauf', 'Verlauf'], ['einst', '⚙']];
    const aktivTab = S.view === 'container' ? 'uebersicht' : S.view === 'bsdetail' ? 'verlauf' : ['ueber', 'dev'].includes(S.view) ? 'einst' : S.view;
    let seite;
    const LIT = { ueber: () => ueberVorlage(this), dev: () => devVorlage(this), verlauf: () => verlaufVorlage(this), bsdetail: () => bsdetailVorlage(this), pumpen: () => pumpenVorlage(this), heizung: () => heizungVorlage(this), einst: () => einstellungenVorlage(this), uebersicht: () => uebersichtVorlage(this), auswertung: () => auswertungVorlage(this),   // Ansichten, die schon Lit-Vorlagen sind (BSM-022 3a ff.)
      container: () => this.b.pumpe ? schachtVorlage(this) : containerVorlage(this) };
    if (!this.roh) seite = ladenVorlage(this.fehler);
    else if (!this.d && !['verlauf', 'bsdetail', 'ueber'].includes(S.view)) seite = leerVorlage(this);
    else seite = (LIT[S.view] || LIT.uebersicht)();
    const melden = this.d ? this.d.e.melden : true;
    let sheet = '';
    if (S.sheet && S.sheet.art === 'melden') sheet = meldenVorlage(this, S.sheet.form);
    else if (S.sheet && CONTAINER_EINBLENDUNGEN[S.sheet.art]) sheet = CONTAINER_EINBLENDUNGEN[S.sheet.art](this, S.sheet);
    else if (S.sheet && S.sheet.art === 'hz') sheet = hzEinblendung(this, S.sheet);
    else if (S.sheet && HEIZUNG_EINBLENDUNGEN[S.sheet.art]) sheet = HEIZUNG_EINBLENDUNGEN[S.sheet.art](this, S.sheet);
    else if (S.sheet && BAUSTELLE_EINBLENDUNGEN[S.sheet.art]) sheet = BAUSTELLE_EINBLENDUNGEN[S.sheet.art](this, S.sheet);
    else if (S.sheet && EINRICHTUNG_EINBLENDUNGEN[S.sheet.art]) sheet = EINRICHTUNG_EINBLENDUNGEN[S.sheet.art](this, S.sheet);
    else if (S.sheet && S.sheet.art === 'np-plug') sheet = npPlugEinblendung(this, S.sheet);
    else if (S.sheet && INVENTAR_EINBLENDUNGEN[S.sheet.art]) sheet = INVENTAR_EINBLENDUNGEN[S.sheet.art](this, S.sheet);
    else if (S.sheet && GERAETE_EINBLENDUNGEN[S.sheet.art]) sheet = GERAETE_EINBLENDUNGEN[S.sheet.art](this, S.sheet);
    else if (S.sheet && HEIZPERIODE_EINBLENDUNGEN[S.sheet.art]) sheet = HEIZPERIODE_EINBLENDUNGEN[S.sheet.art](this, S.sheet);
    else if (S.sheet && S.sheet.art === 'kk-katalog') sheet = katalogEinblendung(this, S.sheet);
    else if (S.sheet && S.sheet.art === 'aw-detail') sheet = awDetailEinblendung(this, S.sheet);
    else if (S.sheet && UEBERSICHT_EINBLENDUNGEN[S.sheet.art]) sheet = UEBERSICHT_EINBLENDUNGEN[S.sheet.art](this, S.sheet);
    const meldenKnopf = (cls, fn) => html`<button class="melden-knopf ${cls}" title="Fehler, Wunsch oder Anregung melden" aria-label="Melden" @click=${fn}>${unsafeHTML(ICON_MELDEN)}</button>`;
    return html`<div class="scroll">${keyed(`${S.view}:${S.cid || ''}`, html`<div class="seite ${neu ? 'rein' : ''}">${this.versionHinweis()}${this.nurLesenHinweis()}${seite}</div>`)}</div>
      ${this._narrow ? html`<button class="menue-knopf glas-panel" aria-label="Seitenleiste" title="Seitenleiste" @click=${() => this.dispatchEvent(new Event('hass-toggle-menu', { bubbles: true, composed: true }))}>☰</button>` : nothing}
      <nav class="glas-nav glas-panel ${tabs.length > 5 ? 'sechs' : ''}">${tabs.map(([k, t]) => k === 'einst'
        ? html`<button data-v=${k} class="${k === aktivTab ? 'on' : ''} nav-ic" aria-label="Einstellungen" title="Einstellungen" @click=${() => this.gehe(k)}>${unsafeHTML(ICON_COG)}</button>`
        : html`<button data-v=${k} class="${k === aktivTab ? 'on' : ''}" @click=${() => this.gehe(k)}>${t}</button>`)}</nav>
      <div class="schleier ${S.sheet ? 'an' : ''}" @click=${() => this.schliessen()}></div>
      <div class="sheet glas-panel ${S.sheet ? 'an' : ''}${S.sheet && INV_BREIT.includes(S.sheet.art) ? ' breit' : ''}">${melden && this.roh && S.sheet && S.sheet.art !== 'melden' ? meldenKnopf('im-sheet', () => this.meldenAuf()) : nothing}${sheet}</div>
      <div class="tip"></div><div class="toast glas-panel"></div>
      ${melden && this.roh && !S.sheet ? meldenKnopf('glas-panel', () => this.meldenAuf()) : nothing}`;
  }
  updated() {
    if (!this.ui) return;
    this.ui.classList.toggle('nur-lesen', this.nurLesen());
    const sc = this.ui.querySelector('.scroll'); if (sc && this._neu) sc.scrollTop = 0;
    const sh = this.ui.querySelector('.sheet'); if (sh && this._sheetArt !== this._sheetVorher) sh.scrollTop = 0;
    const evc2 = this.ui.querySelector('.ev-chips');
    if (evc2) { evc2.scrollLeft = this._evPos; const on = evc2.querySelector('.chip.amber');   // gewählte Kategorie sichtbar, mittig, wenn sie draußen liegt
      if (on && (on.offsetLeft < evc2.scrollLeft || on.offsetLeft + on.offsetWidth > evc2.scrollLeft + evc2.clientWidth)) evc2.scrollLeft = Math.max(0, on.offsetLeft - (evc2.clientWidth - on.offsetWidth) / 2); }
    this._neu = false;
  }
  /* Lit-Teile neu zeichnen (Über, Melden) – unveränderte alte Ansichten bleiben dabei stehen */
  litNeu() { this.requestUpdate(); }

  wetterJetzt() {
    const d = this.d, s = this.zustand(d.wetterEid), w = d.wetter || {};
    if (!s) return [w.zustand || 'cloudy', d.wetterEid ? 'kein Wetter' : 'Wetter wählen', w.aussen];
    const regen = ['rainy', 'pouring', 'lightning-rainy', 'snowy-rainy'].includes(s.state) && zahl(w.regen_heute) && w.regen_heute > 0 ? ` · ${de(w.regen_heute, w.regen_heute % 1 ? 1 : 0)} mm` : '';
    const z = this.nachtWetter(s.state);
    return [z, (WETTER_TEXT[z] || z) + regen, zahl(w.aussen) ? w.aussen : s.attributes.temperature];
  }
  /* FE-0005: Open-Meteo & Co. melden nachts „sunny“ bzw. „partlycloudy“ – wie die Wetterkarten von HA zeigt die Seite
     nachts Mond statt Sonne. Nacht = jetzt: sun.sun unter dem Horizont; später: vor Aufgang bzw. nach Untergang */
  nachtWetter(zustand, ms = Date.now()) {
    if (zustand !== 'sunny' && zustand !== 'partlycloudy') return zustand;
    return this.istNacht(ms) ? (zustand === 'sunny' ? 'clear-night' : 'partlycloudy-night') : zustand;
  }
  istNacht(ms = Date.now()) {
    const s = this._hass && this._hass.states['sun.sun']; if (!s) return false;
    if (Math.abs(ms - Date.now()) < 30 * 6e4) return s.state === 'below_horizon';
    const a = s.attributes || {}, hm = t => { const l = this.lokal(t); return l ? +l.slice(11, 13) * 60 + +l.slice(14, 16) : null; };
    const auf = hm(a.next_rising), ab = hm(a.next_setting), m = hm(ms);
    if (auf === null || ab === null || m === null) return false;
    return auf < ab ? m < auf || m >= ab : m >= ab && m < auf;   // Tag zwischen Aufgang und Untergang (auch über Mitternacht gerechnet)
  }

  /* ---- Übersicht ---- */
  pumpenWerte(d = this.d) {
    const st = this.statistik('Woche', 0, d), i = TAGE.indexOf(d.z.HEUTE_TAG);
    for (const b of d.bereiche) if (b.pumpe) { const z = st && this.zyklen(d, b, 'Woche'); b.zyklen = z ? z[i] : null; }
  }


  /* ---- Container ---- */
  /* Diagramm und Kennzahlen der Container-Ansicht – eigene Funktion, damit neue Sensorwerte nur diese zwei Stellen tauschen (WU-0002) */
  containerLive(b) {
    const d = this.d, heuteNr = TAGE.indexOf(this.z.HEUTE_TAG);
    const tabs = b.pumpe ? [['pumpzeit', 'Pumpzeit'], ['zyklen', 'Zyklen'], ['verbrauch', 'Verbrauch']] : [['temp', 'Temperatur'], ['leistung', 'Leistung'], ['verbrauch', 'Verbrauch'], ['heizzeit', 'Heizzeit']];
    if (!tabs.some(t => t[0] === this.s.chart)) this.s.chart = tabs[0][0];
    const c = this.s.chart, mitVb = this.s.tempVb !== false;
    const kwh7 = this.verbrauch(d, b.id, 'Woche'), h7 = this.heizStunden(d, b, 'Woche'), zyk7 = b.pumpe ? this.zyklen(d, b, 'Woche') : null;
    const vT = this.zrV('c-Tag'), vW = this.zrV('c-Woche'), tagArt = c === 'temp' || c === 'leistung';   // FE-0008
    const kwhW = vW ? this.verbrauch(d, b.id, 'Woche', vW) : kwh7, hW = vW ? this.heizStunden(d, b, 'Woche', vW) : h7, zykW = b.pumpe && vW ? this.zyklen(d, b, 'Woche', vW) : zyk7;
    let chart;
    if (c === 'temp') {
      if (!b.fuehler) chart = '<div class="leer">Kein Temperaturfühler zugeordnet</div>';
      else { const st = this.statistik('Tag', vT);
        if (!st) chart = LAEDT;
        else { const inn = [...(st.werte[b.fuehler] || []), null], aussen = [...(st.werte[this.eid(d, d.entry, 'aussen')] || []), null];
          chart = linie(`t-${b.id}-${mitVb ? 'vb' : ''}`, [{ name: 'Innen', v: inn }, { name: 'Außen', v: aussen }], '°C', mitVb ? this.verbrauch(d, b.id, 'Tag', vT) : null); } }
    } else if (c === 'leistung') { const kw = this.verbrauch(d, b.id, 'Tag', vT);   // kWh je Stunde = mittlere kW
      chart = kw ? flaeche('kw-' + b.id, [{ name: b.name, farbe: BEREICH_FARBEN[b.f % BEREICH_FARBEN.length], v: kw }], STUNDEN, 'kW', 6) + `<div class="leise">Leistung ${this.zrText('Tag', vT)} in kW, Stundenmittel</div>` : LAEDT;
    } else if (c === 'verbrauch') chart = kwhW ? balken('v-' + b.id, kwhW, TAGE, 'kWh') : LAEDT;
    else if (c === 'zyklen') chart = zykW ? balken('z-' + b.id, zykW, TAGE, 'Zyklen', 0) : LAEDT;
    else chart = hW ? balken('h-' + b.id, hW, TAGE, 'h') : LAEDT;
    let kennz;
    if (b.pumpe) { this.mess = this.messung(); const pz = h7 ? h7[heuteNr] : null;
      const laengster = this.mess ? Math.max(0, ...b.geraete.flatMap(g => { const t = this.mess[g.id]; return t ? t[heuteNr].an.map(q => q[1] - q[0]) : []; })) : null;
      kennz = [['Zyklen heute', zyk7 ? zyk7[heuteNr] : '–'], ['Laufzeit', stdMin(pz)], ['Längster Lauf', zahl(laengster) ? `${Math.round(laengster)} min` : '–']];
    } else kennz = [['kWh heute', kwh7 ? de(kwh7[heuteNr]) : '–'], ['Kosten', kwh7 ? `${de(kwh7[heuteNr] * d.e.preis, 2)} €` : '–'], ['Heizzeit', h7 ? `${de(h7[heuteNr])} h` : '–']];
    b.zyklen = zyk7 ? zyk7[heuteNr] : null;
    return { tabs, c, mitVb, chart, kennz, zr: tagArt ? ['c-Tag', 'Tag', this.zrGrenze()] : ['c-Woche', 'Woche', this.zrGrenze()] };   // zr: Argumente der Zeitraum-Vorlage
  }
  /* Neue Sensorwerte: in der Container-Ansicht neu zeichnen (Lit tauscht nur Diagramm und Kennzahlen), außer eine
     Einblendung oder ein Tooltip ist offen – dann später wieder; sonst die Ansicht neu zeichnen wie bisher */
  _liveNeu() {
    const wrap = this.root && this.root.querySelector('.c-live .chart-wrap'), knopf = this.root && this.root.querySelector('.c-live-kennz');
    if (this.s.view !== 'container' || !this.b || !wrap || !knopf) return this._auffrischen();
    if (this.s.sheet || (this.root.querySelector('.tip') || { classList: { contains: () => false } }).classList.contains('an')) return;   // später wieder
    this.neuZeichnen();   // Container und Schacht sind Lit (3c/3d): gezeichnet wird nur, was sich geändert hat
  }

  /* ============ Container-Ansicht (WU-0004, Mockup glas.html „D mit Thermostat-Rad“, abgenommen 30.09.2026) ============
     Vorlage: src/ansichten/container.js (Lit, BSM-022 3d); hier Soll, Regeltext, Rad und Diagramme als Daten/SVG */
  /* gültiges Soll eines Containers von der Integration (fest oder gleitend, mit + / −), sonst eingestellt */
  sollVon(b) { return b.sollJ && zahl(b.sollJ.wert) ? b.sollJ.wert : b.soll ?? this.d.e.soll; }
  sollAktiv(b) { return !!b.fuehler && b.t !== null && ['thermo', 'bedarf'].includes(b.modus); }   // Soll gilt nur, wenn die Integration nach dem Fühler regelt
  cRegelText(b) {
    const soll = this.sollVon(b);
    if (b.modus === 'thermo' && b.lern && b.lern.an) return `🧠 Thermostat · lernend – ${b.lern.anteil !== null ? `${b.lern.anteil} % je ${b.lern.zyklus_min} min · ` : ''}Nachlauf +${de(b.lern.erwartet)} °C → aus bei ${de(b.lern.aus_bei)} °C${b.lern.warm && this.warmText(b, true) ? ` · ${this.warmText(b, true)}` : ''}${this.offenText(b) ? ` · ${this.offenText(b)}` : ''}`;
    return { thermo: `Thermostat regelt in der Heizzeit auf ${de(soll)} °C`, plan: 'Zeitplan – der Heizkörperthermostat regelt', hand: 'Hand – die Automatik schaltet nicht',
      bedarf: `nur bei Bedarf${b.fuehler ? ` · regelt auf ${de(soll)} °C` : ''}`, aus: 'Aus – nur Frostschutz' }[b.modus] || '';
  }
  /* Thermostat-Rad (SVG): Strichkranz 5–30 °C, zwischen Ist und Soll farbig, Soll-Knopf; − + setzt die Vorlage darunter */
  cRadSvg(b) {
    const mitSoll = this.sollAktiv(b), soll = this.sollVon(b), t = b.t, dd = t - soll;
    const farbe = !mitSoll ? 'var(--ink)' : dd > .5 ? '#ff9f0a' : dd < -.5 ? '#64a8ff' : '#30d158';
    const w = x => Math.max(0, Math.min(1, (x - 5) / 25)), R = 78, ang = f => (135 + 270 * f) * Math.PI / 180;
    const [von, bis] = mitSoll ? [Math.min(w(t), w(soll)), Math.max(w(t), w(soll))] : [0, w(t)];
    const striche = [...Array(61)].map((_, i) => { const f = i / 60, a = ang(f), an = f >= von - .001 && f <= bis + .001, lang = i % 10 === 0;
      return `<line x1="${(100 + (R - (lang ? 14 : 9)) * Math.cos(a)).toFixed(1)}" y1="${(100 + (R - (lang ? 14 : 9)) * Math.sin(a)).toFixed(1)}" x2="${(100 + R * Math.cos(a)).toFixed(1)}" y2="${(100 + R * Math.sin(a)).toFixed(1)}" stroke="${an ? farbe : 'var(--ink2)'}" stroke-width="${an ? 3 : 1.6}" stroke-linecap="round" opacity="${an ? 1 : .35}"/>`; }).join('');
    const ks = ang(w(soll));
    return `<svg viewBox="0 0 200 200" role="img" aria-label="Ist ${de(t)} °C${mitSoll ? `, Soll ${de(soll)} °C` : ''}"><defs><radialGradient id="cRadG" cx="50%" cy="40%" r="60%"><stop offset="0" stop-color="rgba(255,255,255,.16)"/><stop offset="1" stop-color="rgba(255,255,255,.02)"/></radialGradient></defs>
      <circle cx="100" cy="100" r="${R - 20}" fill="url(#cRadG)" stroke="var(--panel-rand)"/>${striche}
      ${mitSoll ? `<circle cx="${(100 + R * Math.cos(ks)).toFixed(1)}" cy="${(100 + R * Math.sin(ks)).toFixed(1)}" r="8" fill="#fff" stroke="${farbe}" stroke-width="3"/>` : ''}
      <text x="100" y="80" text-anchor="middle" class="c-rad-k">IST</text><text x="100" y="112" text-anchor="middle" class="c-rad-t">${de(t)}°</text>
      ${mitSoll ? `<text x="100" y="134" text-anchor="middle" class="c-rad-s" fill="${farbe}">Soll ${de(soll)}°</text>` : ''}</svg>`;
  }
  /* Tagesdiagramm: Heizzeit als Band, innen/außen, Soll gestrichelt, geheizte Stunden als Balken, Jetzt-Marke */
  cTag(b, vs = 0) {
    const d = this.d, innen = b.fuehler ? this.reihe(d, b.fuehler, 'Tag', vs) : [], aussen = this.reihe(d, this.eid(d, d.entry, 'aussen'), 'Tag', vs), kw = this.verbrauch(d, b.id, 'Tag', vs);
    if (!aussen || !kw || !innen) return LAEDT;
    const W = 640, H = 220, L = 34, Rr = 10, T = 12, B = 44, mitSoll = this.sollAktiv(b), soll = this.sollVon(b), farbe = BEREICH_FARBEN[b.f % BEREICH_FARBEN.length];
    const x = h => L + (W - L - Rr) * h / 24, alle = [...innen, ...aussen, ...(mitSoll ? [soll] : [])].filter(zahl);
    const lo = Math.floor(Math.min(...(alle.length ? alle : [15])) - 1), hi = Math.ceil(Math.max(...(alle.length ? alle : [25])) + 1), y = v => T + (H - T - B) * (1 - (v - lo) / (hi - lo));
    const pfad = v => v.map((t, h) => !zahl(t) ? '' : `${h && zahl(v[h - 1]) ? 'L' : 'M'}${x(h + .5).toFixed(1)} ${y(t).toFixed(1)}`).join(' ');
    const kmax = Math.max(1, ...kw), jm = this.z.JETZT.split(':'), jetzt = +jm[0] + +jm[1] / 60;
    const tagNr = this.z.WOCHE_ISO.indexOf(plusTage(this.z.HEUTE, -vs));   // Heizzeiten gibt es nur für diese Woche
    const band = (tagNr < 0 ? [] : this.heizzeiten(b, TAGE[tagNr])).map(([von, bis]) => `<rect x="${x(von / 60).toFixed(1)}" y="${T}" width="${(x(bis / 60) - x(von / 60)).toFixed(1)}" height="${H - T - B}" fill="var(--amber)" opacity=".12"/>`).join('');
    const raster = [lo, Math.round((lo + hi) / 2), hi].map(v => `<line x1="${L}" x2="${W - Rr}" y1="${y(v).toFixed(1)}" y2="${y(v).toFixed(1)}" stroke="var(--gridc)"/><text x="${L - 6}" y="${(y(v) + 4).toFixed(1)}" text-anchor="end" class="c-achse">${v}°</text>`).join('');
    const stunden = [0, 6, 12, 18, 24].map(h => `<text x="${x(h).toFixed(1)}" y="${H - 4}" text-anchor="middle" class="c-achse">${String(h).padStart(2, '0')}</text>`).join('');
    const bars = kw.map((k, h) => k > 0 ? `<rect x="${(x(h) + 2).toFixed(1)}" y="${(H - B + 6 + 22 * (1 - k / kmax)).toFixed(1)}" width="${(x(1) - x(0) - 4).toFixed(1)}" height="${(22 * k / kmax).toFixed(1)}" rx="2" fill="${farbe}" opacity=".8"><title>${String(h).padStart(2, '0')}:00 · ${de(k, 2)} kWh</title></rect>` : '').join('');
    // Tür/Fenster offen (Mockup tuer-diagramm, Variante A): halbdurchsichtiges Band über die ganze Höhe, oben kräftige Kante
    const O = this.cOeffnungLage(b, vs, x), unten = H - B + 28;
    const oeUnter = O.map(o => `<rect x="${o.x1.toFixed(1)}" y="${T}" width="${o.w.toFixed(1)}" height="${unten - T}" fill="${o.farbe}" opacity="${o.art === 'tuer' ? .22 : .2}" class="o-band o-${o.art}"/>`
      + `<rect x="${o.x1.toFixed(1)}" y="${T}" width="${o.w.toFixed(1)}" height="3" fill="${o.farbe}" opacity=".9"/>`).join('');
    const oeOben = O.map(o => { const hit = Math.max(12, o.w);   // Tippfläche mindestens 12 px
      return `<rect class="o-hit" data-o="${esc(o.k)}" x="${(o.x1 + o.w / 2 - hit / 2).toFixed(1)}" y="${T}" width="${hit.toFixed(1)}" height="${unten - T}" fill="transparent"><title>${esc(o.text)}</title></rect>`; }).join('');
    const sel = O.find(o => o.k === this._otip), mitT = O.some(o => o.art === 'tuer'), mitF = O.some(o => o.art === 'fenster');
    const tip = !sel ? '' : `<div class="o-tip" style="left:clamp(90px, ${((sel.x1 + sel.w / 2) / W * 100).toFixed(1)}%, calc(100% - 90px))"><b style="color:${sel.farbe}">${esc(sel.text)}</b>${O.filter(o => o !== sel && o.a < sel.e && o.e > sel.a).map(o => `<div class="leise">gleichzeitig: ${esc(o.text)}</div>`).join('')}</div>`;
    return `<div class="o-wrap"><svg viewBox="0 0 ${W} ${H}" class="c-tag-svg">${band}${oeUnter}${raster}
      ${mitSoll ? `<line x1="${L}" x2="${W - Rr}" y1="${y(soll).toFixed(1)}" y2="${y(soll).toFixed(1)}" stroke="var(--ink)" stroke-dasharray="5 4" opacity=".6"/><text x="${W - Rr}" y="${(y(soll) - 5).toFixed(1)}" text-anchor="end" class="c-achse">Soll ${de(soll)}°</text>` : ''}
      <path d="${pfad(aussen)}" fill="none" stroke="var(--ink2)" stroke-width="1.5" opacity=".7"/>${b.fuehler ? `<path d="${pfad(innen)}" fill="none" stroke="#ff9f0a" stroke-width="2.6"/>` : ''}
      ${bars}${vs ? '' : `<line x1="${x(jetzt).toFixed(1)}" x2="${x(jetzt).toFixed(1)}" y1="${T}" y2="${H - B + 28}" stroke="var(--ink)" opacity=".5"/>`}${stunden}${oeOben}</svg>${tip}</div>
      <div class="c-legende">${b.fuehler ? '<span><i style="background:#ff9f0a"></i>innen</span>' : ''}<span><i style="background:var(--ink2)"></i>außen</span>${mitSoll ? '<span><i class="gestr"></i>Soll</span>' : ''}<span><i style="background:var(--amber);opacity:.4"></i>Heizzeit</span><span><i style="background:${farbe}"></i>geheizt (kWh je Stunde)</span>${mitT ? '<span class="o-leg"><i style="background:var(--rot);opacity:.45"></i>Tür offen</span>' : ''}${mitF ? '<span class="o-leg"><i style="background:var(--blau);opacity:.45"></i>Fenster offen</span>' : ''}</div>`;
  }
  /* Tür/Fenster offen am angezeigten Tag: fertig von der Integration (baustelle/oeffnungen, Öffnungen unter 10 s schon
     weg); ohne Kontakte kein Aufruf, solange es lädt keine Bänder. Heute kurz gültig (30 s), frühere Tage 1 h */
  cOeffnungen(b, vs = 0) {
    const d = this.d; if (!(b.sensoren || []).some(s => s.art === 'tuer' || s.art === 'fenster')) return [];
    const tag = plusTage(this.z.HEUTE, -vs);
    const r = this._holen(`oe:${d.entry}:${b.id}:${tag}`, () => this._hass.callWS({ type: 'baustelle/oeffnungen', entry_id: d.entry, bereich: b.id, tag }), vs ? 3600000 : 30000);
    return r && Array.isArray(r.oeffnungen) ? r.oeffnungen : [];
  }
  /* Lage der Bänder im Diagramm (nur Zeichnen): noch offen → bis „jetzt“, kurze Öffnungen mindestens 2 px breit */
  cOeffnungLage(b, vs, x) {
    const jm = this.z.JETZT.split(':'), jetzt = +jm[0] * 60 + +jm[1], bis1440 = m => Math.min(1440, Math.max(0, m));
    const lang = m => m < 60 ? `${m} min` : `${Math.floor(m / 60)} h${m % 60 ? ` ${m % 60} min` : ''}`;
    return this.cOeffnungen(b, vs).map(o => {
      const a = bis1440(minu(o.von)), e = o.bis ? bis1440(minu(o.bis)) : vs ? 1440 : Math.max(a, jetzt), x1 = x(a / 60);
      return { ...o, a, e, x1, w: Math.max(2, x(e / 60) - x1), k: `${o.entity_id}@${o.von}`, farbe: o.art === 'tuer' ? 'var(--rot)' : 'var(--blau)',
        text: o.bis ? `${o.name} offen ${o.von}–${o.bis} (${lang(o.min)})` : `${o.name} offen seit ${o.von}` };
    });
  }
  /* Antippen bzw. Darüberfahren (Maus) eines Bands zeigt „Tür 1 offen 07:12–07:31 (19 min)“; woanders tippen schließt */
  oeTippen(e) { const t = e.target && e.target.closest && e.target.closest('[data-o]'); this.oeSetzen(!t ? null : this._otip === t.dataset.o && e.pointerType !== 'mouse' ? null : t.dataset.o); }
  oeZeigen(e) { if (e.pointerType !== 'mouse') return; const t = e.target && e.target.closest && e.target.closest('[data-o]'); if (t) this.oeSetzen(t.dataset.o); }
  oeWeg(e) { if (e.pointerType !== 'mouse') return; const n = e.relatedTarget; if (e.target && e.target.closest && e.target.closest('[data-o]') && !(n && n.closest && n.closest('[data-o]'))) this.oeSetzen(null); }
  oeSetzen(k) { if ((this._otip || null) !== k) { this._otip = k; this.neuZeichnen(); } }
  /* Diagramm der Container-Ansicht (WU-0002) */
  containerTeile(b) {
    const d = this.d, c = ['heute', 'woche', 'stunden'].includes(this.s.cvd) ? this.s.cvd : 'heute';
    const vT = this.zrV('c-Tag'), vW = this.zrV('c-Woche'), kwhW = this.verbrauch(d, b.id, 'Woche', vW), hW = this.heizStunden(d, b, 'Woche', vW);   // FE-0008: Diagramm auch für frühere Tage/Wochen
    const chart = c === 'heute' ? this.cTag(b, vT) : c === 'woche' ? (kwhW ? balken('cw-' + b.id, kwhW, TAGE, 'kWh') : LAEDT) : (hW ? balken('ch-' + b.id, hW, TAGE, 'h') : LAEDT);
    return { c, chart };
  }
  heuteText(b) { const seg = this.heizzeiten(b, this.z.HEUTE_TAG); return seg.length ? `Heizzeit ${uhr(seg[0][0])}–${uhr(Math.max(...seg.map(q => q[1])))}` : this.freiText(this.z.HEUTE) || 'heute keine Heizzeit'; }
  /* ---- Heizung ---- */
  feiertage() { const k = this._kalender(this.d.optionen.feiertag_kalender); return k === null ? null : k.filter(f => f.von > this.z.HEUTE).sort((a, b) => a.von.localeCompare(b.von)); }
  urlaube() { const k = this._kalender(this.d.optionen.urlaub_kalender); return k === null ? null : k.filter(u => u.bis >= this.z.HEUTE).sort((a, b) => a.von.localeCompare(b.von)); }
  /* ---- Heizung als Kacheln (0.7.11): Vorlagen in src/ansichten/heizung.js (Lit, BSM-022 3d); hier Kurzwerte der Kacheln ---- */
  hzKurz() {
    const d = this.d, e = d.e, az = this.azJetzt, C = d.bereiche.filter(b => !b.pumpe), H = this.z.HEUTE;
    const ausn = d.ausnahmen.filter(a => a.datum >= H).sort((a, b) => a.datum.localeCompare(b.datum));
    const ft = this.feiertage(), ur = this.urlaube(), naechsterFt = ft && ft[0];
    const modi = MODI.map(([k, t]) => [t, C.filter(b => b.modus === k).length]).filter(x => x[1]);
    const woche = TAGE.map(t => { const p = this.planTag(t); return p && zahl(p.ende) && zahl(p.extra) ? Math.max(0, p.ende - p.extra) / 60 : 0; });
    const L = this.last(), zeiten = t => az && az.tage[t] ? az.tage[t].join('–') : 'frei';
    return {
      woche, plan: `${woche.filter(Boolean).length} Heiztage · ${de(summe(woche), 0)} h`,
      wann: `${L.laufen} von ${L.hk.length} Heizkörpern an`,
      az: az ? az.name || 'Arbeitszeit' : 'keine Arbeitszeit', az2: az ? `Mo ${zeiten('Mo')} · Fr ${zeiten('Fr')}` : 'unter Arbeitszeit anlegen',
      ausn: ausn.length ? `${ausn.length} geplant` : 'keine', ausn2: ausn.length ? `nächste ${wtag(ausn[0].datum)} ${kurzDatum(ausn[0].datum)}` : 'Samstag, länger, frei …',
      regeln: `Soll ${de(e.soll, 1)} °C`, regeln2: `vor ${e.vorheizen} · nach ${e.nachheizen} min · Grenze ${de(e.grenze, 0)} °C · ${e.frost ? `Frost ${de(e.frost_temp, 1)}–${de(e.frost_aus, 1)} °C` : 'Frostschutz aus'}`,
      trocknen: this.d.trocknen ? this.d.trocknen.stufen.map(x => `ab ${de(x.ab_mm, 1)} mm`).join(' / ') : `ab ${de(e.tr_mm, 1)} mm Regen`,   // AN-0021: Stufen der Integration
      trocknen2: this.d.trocknen ? this.d.trocknen.stufen.map(x => `+${x.laenger_min}/−${x.frueher_min} min`).join(' / ') : `+${e.tr_laenger} min · früher ${e.tr_frueher} min`,
      container: `${C.length} Container`, container2: modi.map(([t, n]) => `${n} ${t}`).join(' · ') || '–',
      urlaub: ur === null ? 'Lädt …' : ur.length ? `${ur.length} Urlaub` : 'kein Urlaub', urlaub2: naechsterFt ? `Feiertag ${wtag(naechsterFt.von)} ${kurzDatum(naechsterFt.von)}` : e.feiertag_frei ? '' : 'an Feiertagen wird gearbeitet',
    };
  }
  sollKurve(G) {
    const W = 320, H = 150, L = 30, R = 8, T = 8, U = 18, K = G.kurve || [], ys = K.flatMap(k => [k[1], k[2]]), lo = Math.floor(Math.min(20, ...ys)), hi = Math.ceil(Math.max(lo + 3, ...ys));
    const x = t => L + (t + 10) / 30 * (W - L - R), y = v => T + (1 - (v - lo) / (hi - lo)) * (H - T - U), soll = t => { const k = K.find(q => q[0] === Math.round(t)); return k ? k[2] : G.soll; };
    const pfad = i => K.map((k, n) => `${n ? 'L' : 'M'}${x(k[0]).toFixed(1)} ${y(k[i]).toFixed(1)}`).join('');
    const raster = [...Array(hi - lo + 1)].map((_, i) => lo + i).map(v => `<line class="gr" x1="${L}" x2="${W - R}" y1="${y(v).toFixed(1)}" y2="${y(v).toFixed(1)}"/><text class="ax" x="${L - 4}" y="${(y(v) + 3).toFixed(1)}" text-anchor="end">${v}°</text>`).join('')
      + [-10, 0, 10, 20].map(t => `<text class="ax" x="${x(t)}" y="${H - 4}" text-anchor="middle">${t}° außen</text>`).join('');
    const unter = lo < 21 ? `<rect x="${L}" y="${y(Math.min(21, hi)).toFixed(1)}" width="${W - L - R}" height="${(H - U - y(Math.min(21, hi))).toFixed(1)}" fill="rgba(255,69,58,.08)"/>` : '';
    const punkte = (G.rueck || []).map(([t, r]) => `<circle cx="${x(Math.max(-10, Math.min(20, t))).toFixed(1)}" cy="${y(soll(t) - r * .35).toFixed(1)}" r="4" fill="${r < 0 ? '#64a8ff' : r > 0 ? '#ff9f0a' : '#30d158'}"/>`).join('');
    const tm = Math.max(-10, Math.min(20, G.aussen_mittel));
    return `<svg class="sg-kurve" viewBox="0 0 ${W} ${H}">${raster}${unter}<path d="${pfad(1)}" fill="none" stroke="var(--ink2)" stroke-width="1.5" stroke-dasharray="5 4"/>
      <path d="${pfad(2)}" fill="none" stroke="var(--amber)" stroke-width="2.5"/>${punkte}<line x1="${x(tm).toFixed(1)}" x2="${x(tm).toFixed(1)}" y1="${T}" y2="${H - U}" stroke="var(--ink)" stroke-dasharray="2 3"/>
      <circle cx="${x(tm).toFixed(1)}" cy="${y(G.soll).toFixed(1)}" r="6" fill="#fff" stroke="var(--amber)" stroke-width="3"/></svg>
      <div class="sg-leg"><span><i style="background:var(--amber)"></i>Soll (mit deinem Gefühl)</span><span><i style="background:var(--ink2)"></i>Startwert nach draußen</span><span><i style="background:#64a8ff"></i>zu kalt</span><span><i style="background:#30d158"></i>passt</span><span><i style="background:#ff9f0a"></i>zu warm</span>${unter ? '<span><i style="background:rgba(255,69,58,.35)"></i>unter 21 °C</span>' : ''}</div>`;
  }
  planFensterText(p) {
    return [`Arbeit ${uhr(p.a)}–${uhr(p.b)}, geheizt ${uhr(p.extra)}–${uhr(p.ende)} (mit Vor-/Nachheizen)`,
      ...(p.eigene || []).map(f => `nur ${uhr(f[0])}–${uhr(f[1])} geheizt (eigenes Fenster, ohne Vor-/Nachheizen)`)].join(' · ');
  }
  /* ---- Auswertung ---- */
  /* ============ Auswertung aus Bausteinen (WU-0005): Vorlagen, Anpassen, Layout mit Ziehen – gemerkt je Browser ============ */
  awAuswahl() {
    if (!this.s.awListe) { let l = null; try { l = JSON.parse(localStorage.getItem(AW_SPEICHER) || 'null'); } catch (e) { l = null; }
      if (!Array.isArray(l)) this.awVorlage('misch', false);
      else { const bekannt = l.filter(x => x && (AW_BAUSTEINE[x.k] || KK[x.k])).map(x => ({ k: x.k, an: !!x.an, ...(KK[x.k] ? { id: x.id, dia: x.dia, ids: x.ids, zr: x.zr, art: x.art } : {}), w: Math.min(4, Math.max(1, +x.w || 2)), h: Math.min(6, Math.max(1, +x.h || 2)) }));
        this.s.awListe = [...bekannt, ...Object.keys(AW_BAUSTEINE).filter(k => !bekannt.some(x => x.k === k)).map(k => ({ k, an: false, w: 4, h: AW_HOEHE[k] || 2 }))]; } }
    this.s.awListe = this.s.awListe.map(x => x.st ? x : this.awGross(x));
    return this.s.awListe;
  }
  awVorlage(name, merken = true) {
    const v = AW_VORLAGEN[name][1], rest = Object.keys(AW_BAUSTEINE).filter(k => !v.some(x => x[0] === k));
    this.s.awListe = [...v.map(([k, w, h]) => ({ k, an: true, w, h })), ...rest.map(k => ({ k, an: false, w: 4, h: AW_HOEHE[k] || 2 }))].map(x => this.awGross(x));
    if (merken) this.awMerken();
  }
  awGross(x) { const st = awStufe(x.k, x.w, x.h); return { ...x, w: st[1], h: st[2], st: st[0] }; }   // FE-0006: immer auf eine Stufe
  awMerken() { try { localStorage.setItem(AW_SPEICHER, JSON.stringify(this.s.awListe)); } catch (e) { /* egal */ } }
  /* „Was fällt auf“: die Integration wählt aus (logik/auswertung.erkenntnisse), die Seite macht nur den Text */
  /* FE-0006: Verbrauch als Kachel – gestapelt je Container/Baustelle oder Firma (quellen wie das große Diagramm), füllt die Kachel */
  /* ============ WU-0014: Kachel-Katalog – Kacheln S/M/L auf Übersicht ('ue', eigene Liste je Browser) und Auswertung ('aw', im Raster der Bausteine) ============ */
  kkListe(ort) {
    if (ort !== 'ue') return this.awAuswahl();
    if (!this.s.kkUe) { let l = null; try { l = JSON.parse(localStorage.getItem(KK_SPEICHER) || 'null'); } catch (e) { l = null; }
      this.s.kkUe = (Array.isArray(l) ? l.filter(x => x && KK[x.k]) : KK_START).map(x => this.kkGross({ k: x.k, id: x.id, dia: x.dia, ids: x.ids, zr: x.zr, art: x.art, an: true }, x.st)); }
    return this.s.kkUe;
  }
  kkGross(x, st) { const g = awStufen(x.k).find(q => q[0] === st) || awStufe(x.k, x.w || 2, x.h || 1); return { ...x, w: g[1], h: g[2], st: g[0] }; }
  kkMerken(ort) {
    if (ort !== 'ue') return this.awMerken();
    try { localStorage.setItem(KK_SPEICHER, JSON.stringify(this.s.kkUe.map(({ k, id, dia, st, ids, zr, art }) => ({ k, id, dia, st, ids, zr, art })))); } catch (e) { /* egal */ }
  }
  kkName(x) { if (AW_BAUSTEINE[x.k]) return AW_BAUSTEINE[x.k][0];
    if (KK[x.k] && KK[x.k].je === 'v') return `${KK[x.k].name}${(x.ids || []).length ? ` · ${x.ids.map(id => (this.d.bereiche.find(b => b.id === id) || { name: id }).name).join(' / ')}` : ''}`;
    const e = KK[x.k], b = e && e.je ? this.kkB(x) : null; return e ? `${e.name}${b ? ` · ${b.name}` : ''}` : x.k; }
  kkWahlListe(k) { const e = KK[k], B = this.d.bereiche; return !e || !e.je ? [] : e.je === 'p' ? B.filter(b => b.pumpe) : B.filter(b => !b.pumpe && (e.je !== 'f' || b.fuehler)); }
  kkB(x) { const L = this.kkWahlListe(x.k); return L.find(b => b.id === x.id) || L[0] || null; }
  /* Zeitraum und Werte: in der Auswertung der gewählte Zeitraum (auch für Container), auf der Übersicht Baustelle = dieser Monat, Container = heute */
  kkCtx(ort) {
    if (ort === 'aw') { const z = this.s.aw.zeitraum, v = this.zrV('aw'), A = this.awDaten(z, v); return { ort, A, S: (A && A.summen) || {}, z, v, zc: z, vc: v }; }
    const A = this.awDaten('Monat', 0, 'diese'); return { ort, A, S: (A && A.summen) || {}, z: 'Monat', v: 0, zc: 'Tag', vc: 0 };
  }
  kkSumme(c) {   // Verbrauch der Baustelle (bzw. aller laufenden) je Stunde/Tag/Monat – Statistik der Energie-Sensoren
    const L = c.ort === 'aw' && this.s.awScope === 'alle' ? this.laufende() : [this.d], r = L.map(l => this.verbrauch(l, null, c.z, c.v));
    return r.some(x => !x) ? null : addieren(r);
  }
  kkDaten(x, b, c) {
    const d = this.d, S = c.S, A = c.A, p = d.e.preis, f = (v, k = 1) => zahl(v) ? de(v, k) : '–', farbe = b ? BEREICH_FARBEN[b.f % BEREICH_FARBEN.length] : 'var(--s1)';
    const pfeil = dl => zahl(dl) ? `<em class="${dl > 0 ? 'mehr' : 'weniger'}">${dl > 0 ? '▲' : '▼'} ${Math.abs(dl)} %</em>` : '';
    const zr = this.zeitraum(c.z, c.v), zrc = this.zeitraum(c.zc, c.vc), wann = this.zrText(c.z, c.v), wannC = this.zrText(c.zc, c.vc);
    const lab = (z, labels) => z === 'Tag' ? labels.map((h, i) => i % 6 ? '' : h) : z === 'Woche' ? TAGE : labels;
    const heuteNr = TAGE.indexOf(this.z.HEUTE_TAG), soll = b ? this.sollVon(b) : null;
    switch (x.k) {
      case 'b-kosten': { const r = this.kkSumme(c);
        return { zahl: zahl(S.eur) ? de(S.eur, 0) : '–', einh: '€', wo: wann, vgl: `${f(S.kwh, 0)} kWh${zahl((S.veraenderung || {}).kwh) ? ` ${pfeil(S.veraenderung.kwh)} zu ${this.zrVgl(c.z, c.v)}` : ''}`, funke: r,
          kennz: [['Kosten', `${f(S.eur, 2)} €`], ['Verbrauch', `${f(S.kwh, 0)} kWh`], ['Heizzeit', `${f(S.heizzeit, 0)} h`], ['Pumpzeit', `${f(S.pumpzeit, 1)} h`]],
          dia: (id, w) => r ? flaeche(id, [{ name: 'Verbrauch', farbe: 'var(--s1)', v: r }], zr.labels, 'kWh', KK_JEDES[c.z], null, w) : '' }; }
      case 'b-gespart': {   // Mockup gespart.html Variante B (Herbert 28.10.2026): Reihen je Stunde/Tag/Monat von der Integration (gespart_reihen), auch für „alle laufenden“
        const oa = S.ohne_automatik, G = A && A.gespart_reihen, su = (G && G.summe) || {}, je = c.z === 'Tag' ? 'je Stunde' : c.z === 'Jahr' ? 'je Monat' : 'je Tag';
        const gruen = 'var(--s3)', mini = G && funke(G.gespart_eur, gruen);
        return { zahl: oa ? de(oa.gespart_eur, oa.gespart_eur < 10 ? 2 : 0) : '–', einh: '€', wo: wann, farbe: gruen, funke: G && G.gespart_eur,
          vgl: oa ? `${f(su.gespart_kwh, 0)} kWh · ${f(oa.prozent, 0)} % weniger als rund um die Uhr (${f(oa.ohne_eur, 0)} €)${oa.hinweis ? ` · ${oa.hinweis}` : ''}` : 'noch keine Werte',
          mini: mini ? `${mini}<span class="kk-wo kk-mini-t">gespart ${je}</span>` : '',
          kennz: [['gespart', `${f(oa && oa.gespart_eur, 0)} €`], ['gespart', `${f(su.gespart_kwh, 0)} kWh`], ['ohne (24/7)', `${f(oa && oa.ohne_eur, 0)} €`], ['mit Automatik', `${f(S.eur, 0)} €`]],
          dia: (id, w) => G && oa ? luecke(id, G.mit_eur, G.ohne_eur, G.gespart_eur, zr.labels, KK_JEDES[c.z], w) : '' }; }
      case 'b-hoch': { const h = (A && A.hochrechnung) || {};
        // AN-0023 (Mockup container-unten.html, Mischung 1+2): in L das Liniendiagramm der Karte Heizperiode (eine Zeichenfunktion)
        // mit Achse, Monaten, heute und Spanne, € am Linienende und einzeiliger Legende; M behält die Balken
        const hoch = (id, w) => { const svg = hochrechnungSvg(h, { w: Math.max(300, Math.min(w, 640)), ende: true, id: `${id}-feld`, klasse: 'kk-breit' });
          return svg ? `${svg}<div class="kk-leg kk-hp-leg"><span><i class="l-ist"></i>tatsächlich</span><span><i class="l-prog"></i>${w <= 320 ? 'mit' : 'Prognose mit Automatik'}</span>${zahl(h.ohne_eur) ? `<span><i class="l-ohne"></i>${w <= 320 ? 'ohne' : 'ohne Automatik'}</span>` : ''}</div>` : ''; };
        return { zahl: zahl(h.mit_eur) ? `≈ ${de(h.mit_eur, 0)}` : '–', einh: '€', wo: 'bis Ende Heizperiode',
          vgl: `${zahl(h.unten_eur) && zahl(h.oben_eur) ? `Spanne ${f(h.unten_eur, 0)}–${f(h.oben_eur, 0)} €` : `bisher ${f(h.bisher_eur, 0)} €`} · gespart ≈ ${f(h.gespart_eur, 0)} €${h.ohne_hinweis ? ` (${h.ohne_hinweis})` : ''}`,
          mini: kkBalken([['bisher', h.bisher_eur, `${f(h.bisher_eur, 0)} €`, 'var(--s3)'], ['mit', h.mit_eur, `${f(h.mit_eur, 0)} €`, 'var(--s1)'], ['ohne', h.ohne_eur, `${f(h.ohne_eur, 0)} €`, 'var(--s2)']]),
          kennz: [['bisher', `${f(h.bisher_kwh, 0)} kWh`], ['mit Automatik', `${f(h.mit_kwh, 0)} kWh`], ['ohne (24/7)', `${f(h.ohne_kwh, 0)} kWh`], ['gespart ≈', `${f(h.gespart_eur, 0)} €`]],
          dia: (id, w) => zahl(h.mit_eur) ? hoch(id, w) : '' }; }
      case 'b-wetter': { const W = (A && A.wetter) || {}, g = W.gerade, P = W.punkte || [];
        return { zahl: g && g.k < 0 ? `+${de(-g.k, 1)}` : '–', einh: 'kWh/°C', wo: 'je Grad kälter am Tag', vgl: g ? `≈ ${f(g.eur_je_grad, 2)} € je Grad${zahl(g.null0) ? ` · kaum geheizt ab ${de(g.null0, 0)} °C` : ''}` : W.stand === 'lernt' ? `lernt noch (${W.tage || 0} ganze Tage)` : 'noch keine Signatur',
          kennz: [['je Grad kälter', g ? `+${f(-g.k, 1)} kWh` : '–'], ['je Grad', `${f(g && g.eur_je_grad, 2)} €`], ['ganze Tage', `${P.length}`], ['kaum geheizt ab', `${f(g && g.null0, 0)} °C`]],
          dia: id => g ? streu(id, P, g.k, g.d0, g.grenze ?? null) : '' }; }
      case 'b-strom': { const L = this.last(), an = d.e.staffel && L.A.length;
        return { zahl: an ? de(L.gesamt, 1) : '–', einh: 'kW', wo: an ? `${L.A.length} ${L.A.length === 1 ? 'Anschluss' : 'Anschlüsse'}` : 'Staffelung aus',
          vgl: an ? `von ${de(L.grenze, 1)} kW nutzbar · ${L.laufen} Heizkörper an${L.warten ? ` · ${L.warten} wartet` : ''}` : 'keine Anschlüsse', mini: an ? this.stromBalken(L, true) : '',
          kennz: [['Heizung', `${f(L.heiz, 1)} kW`], ['Pumpen', `${f(L.pumpe, 2)} kW`], ['Sonstiges', `${f(L.sonst, 1)} kW`], ['Reserve', `${f(L.reserve, 1)} kW`]],
          dia: () => an ? `<div class="kk-dia-in">${L.A.map(a => `<div class="kk-dz eins"><span>${esc(a.name)} · ${de(a.heiz + a.pumpe + a.sonst, 1)} von ${de(a.grenze, 1)} kW</span>${this.stromBalken({ ...a, grenze: a.grenze }, true)}</div>`).join('')}</div>` : '', zeilen: true }; }
      case 'b-oel': { const T = (A && A.typ) || {}, er = T.ersparnis, o = T.oelradiator || {}, kv = T.konvektor || {};
        return { zahl: zahl(T.weniger) ? `${T.weniger > 0 ? '−' : '+'}${de(Math.abs(T.weniger), 0)}` : '–', einh: '%', wo: 'Ölradiator gegen Konvektor',
          vgl: er ? `${de(Math.abs(er.erspart_eur), 2)} € ${er.erspart_eur < 0 ? 'mehr' : 'erspart'} · ${wann}` : 'noch nicht vergleichbar', funke: er && er.oel,
          kennz: [['Öl kWh/Gradstunde', f(o.kwh_gradh, 3)], ['Konv. kWh/Gradstunde', f(kv.kwh_gradh, 3)], [er && er.erspart_eur < 0 ? 'mehr' : 'erspart', `${f(er && Math.abs(er.erspart_eur), 2)} €`], ['Aufheizen Öl', `${f(o.auf, 1)} °C/h`]],
          dia: id => er ? flaeche(id, [{ name: 'Ölradiatoren', farbe: 'var(--s1)', v: er.oel }], zr.labels, 'kWh', KK_JEDES[c.z], { name: 'mit Konvektoren', v: er.konvektor }) : '' }; }
      case 'b-geraete': { const Lk = (d.r && d.r.geraete_links) || {}, st = eid => this._hass && this._hass.states[eid];
        const G = d.bereiche.flatMap(bb => bb.geraete.map(g => { const l = Lk[g.schalter] || {}, s = l.signal && st(l.signal); return { bb, g, db: s && zahl(s.state) ? +s.state : null }; }));
        const weg = G.filter(q => q.g.erreichbar === false), mit = G.filter(q => q.g.erreichbar !== false && q.db !== null), schwach = mit.filter(q => sigStufe(q.db) <= 2);
        const schlecht = mit.length ? mit.reduce((m, q) => q.db < m.db ? q : m) : null;
        return { zahl: `${G.length - weg.length}/${G.length}`, einh: '', wo: 'Geräte erreichbar', vgl: `${weg.length} nicht erreichbar${schwach.length ? ` · ${schwach.length} mit schwachem Signal` : ''}`,
          mini: `${schlecht ? `<div class="kk-vgl">schwächstes ${sigHtml(schlecht.db)} ${de(schlecht.db, 0)} dBm · ${esc(schlecht.g.n)}</div>` : ''}${weg.slice(0, 2).map(q => `<div class="kk-vgl rot-t">● ${esc(q.g.n)} · ${esc(q.bb.name)}</div>`).join('')}`,
          kennz: [['erreichbar', `${G.length - weg.length}`], ['nicht erreichbar', `${weg.length}`], ['schwaches Signal', `${schwach.length}`], ['schwächstes', schlecht ? `${de(schlecht.db, 0)} dBm` : '–']],
          dia: () => `<div class="kk-dia-in">${G.slice(0, 8).map(q => `<div class="kk-dz"><span>${esc(q.g.n)}</span><span>${q.g.erreichbar === false ? '<b class="rot-t">nicht erreichbar</b>' : q.db !== null ? `${sigHtml(q.db)} ${de(q.db, 0)} dBm` : 'kein Signalwert'} · ${esc(q.bb.name)}</span></div>`).join('')}${G.length > 8 ? `<div class="kk-vgl">+ ${G.length - 8} weitere</div>` : ''}</div>`, zeilen: true }; }
      case 'b-wer': { const R = (A && A.rangliste) || [], Z = R.map(r => { const bb = d.bereiche.find(q => q.id === r.bereich); return [r.name, r.kwh, `${f(r.kwh, 0)} kWh`, bb ? BEREICH_FARBEN[bb.f % BEREICH_FARBEN.length] : 'var(--ink2)']; });
        return { zahl: R[0] ? de(R[0].kwh, 0) : '–', einh: 'kWh', unter: R[0] ? esc(R[0].name) : '', wo: wann, vgl: R[0] ? `${esc(R[0].name)} vorne · ${f(R[0].eur, 2)} €` : 'noch kein Verbrauch',
          mini: kkBalken(Z, 3), kennz: R.slice(0, 4).map(r => [r.name, `${f(r.kwh, 0)} kWh · ${f(r.eur, 0)} €`]), dia: () => `<div class="kk-dia-in">${kkBalken(Z, 7)}</div>`, zeilen: true }; }
      case 'c-temp': { const st = this.statistik('Tag'), inn = st && (st.werte[b.fuehler] || []), aus = st && (st.werte[this.eid(d, d.entry, 'aussen')] || []), [, , wtemp] = this.wetterJetzt();
        return { zahl: f(b.t), einh: '°C', wo: 'jetzt', vgl: `Soll ${f(soll, 0)} °C · außen ${f(wtemp)} °C`, funke: inn, farbe,
          kennz: [['innen jetzt', `${f(b.t)} °C`], ['Soll', `${f(soll, 0)} °C`], ['außen jetzt', `${f(wtemp)} °C`], ['Zustand', esc(TEXT(b))]],
          dia: id => inn ? linie(id, [{ name: 'Innen', v: [...inn, null] }, { name: 'Außen', v: [...(aus || []), null] }], '°C') : '' }; }
      case 'c-leistung': { const r = this.verbrauch(d, b.id, 'Tag'), an = b.geraete.filter(g => g.an).length;   // kWh je Stunde = mittlere kW
        return { zahl: de(kwVon(b), 2), einh: 'kW', wo: 'jetzt', vgl: `${an} von ${b.geraete.length} Geräten an`, funke: r && r.slice(0, +this.z.JETZT.slice(0, 2) + 1), farbe,
          kennz: [['jetzt', `${de(kwVon(b), 2)} kW`], ['Geräte an', `${an}/${b.geraete.length}`], ['heute', `${f(r && summe(r))} kWh`], ['Zustand', esc(TEXT(b))]],
          dia: id => r ? flaeche(id, [{ name: b.name, farbe, v: r }], STUNDEN, 'kW', 6) : '' }; }
      case 'c-verbrauch': case 'c-kosten': { const eur = x.k === 'c-kosten', fk = eur ? p : 1, r = this.verbrauch(d, b.id, c.zc, c.vc), g = this.verbrauch(d, b.id, c.zc, c.vc + 1);
        const su = r && summe(r), sg = g && summe(g), e1 = eur ? '€' : 'kWh', k1 = eur ? 2 : 1;
        return { zahl: f(zahl(su) ? su * fk : null, k1), einh: e1, wo: wannC, vgl: eur ? `${f(su)} kWh × ${de(p, 2)} €/kWh` : `${this.zrVgl(c.zc, c.vc)} ${f(sg)} kWh`, funke: r && r.map(v => (v || 0) * fk), farbe,
          kennz: eur ? [[wannC, `${f(zahl(su) ? su * p : null, 2)} €`], ['kWh', f(su)], ['Strompreis', `${de(p, 2)} €/kWh`], [this.zrVgl(c.zc, c.vc), `${f(zahl(sg) ? sg * p : null, 2)} €`]]
            : [[wannC, `${f(su)} kWh`], [this.zrVgl(c.zc, c.vc), `${f(sg)} kWh`], ['Kosten', `${f(zahl(su) ? su * p : null, 2)} €`], ['Heizzeit', (h => h ? stdMin(summe(h)) : '–')(this.heizStunden(d, b, c.zc, c.vc))]],
          dia: id => r ? balken(id, r.map(v => (v || 0) * fk), lab(c.zc, zrc.labels), e1, eur ? 2 : 1) : '' }; }
      case 'c-heizzeit': { const r = this.heizStunden(d, b, c.zc, c.vc), rs = this.reihe(d, this.eid(d, b.id, 'heizzeit_strom'), c.zc, c.vc), su = r && summe(r), ss = rs && rs.some(zahl) ? summe(rs.map(v => v || 0)) : null;
        return { zahl: stdMin(su), einh: '', wo: wannC, vgl: zahl(ss) ? `tatsächlich geheizt ${stdMin(ss)}` : esc(this.heuteText(b)), funke: r, farbe,
          kennz: [['eingeschaltet', stdMin(su)], ['tatsächlich geheizt', stdMin(ss)], ['% davon mit Strom', zahl(ss) && su > 0 ? `${de(ss / su * 100, 0)} %` : '–'], ['Plan heute', esc(this.heuteText(b)).replace(/^Heizzeit /, '')]],
          dia: id => r ? balken(id, r, lab(c.zc, zrc.labels), 'h') : '' }; }
      case 'c-ohne': { const o = b.geraete.some(g => g.heizer) ? this._holen(`oh:${d.entry}:${b.id}:${c.zc}:${c.vc}:geraet`, () => this._hass.callWS({ type: 'baustelle/ohne', entry_id: d.entry, bereich: b.id, zeitraum: c.zc, versatz: c.vc, basis: 'geraet' })) : null;
        const e = o && o.ergebnis, r = this.verbrauch(d, b.id, c.zc, c.vc);
        return { zahl: e ? de(e.gespart_eur, 2) : '–', einh: '€', wo: wannC, vgl: !o ? (o === null ? 'kein Heizkörper' : 'lädt …') : e ? `gespart · ${f(e.prozent, 0)} % weniger als 24/7` : 'noch keine Werte', farbe: 'var(--s3)', funke: r,
          kennz: [['mit Automatik', `${f(o && o.kwh)} kWh`], ['ohne (24/7)', `${f(o && o.ohne_kwh)} kWh`], ['gespart', `${f(e && e.gespart_eur, 2)} €`], ['Heizkörper', `${f(o && o.kw, 2)} kW`]],
          dia: id => r && o && o.reihe ? flaeche(id, [{ name: 'mit Automatik', farbe, v: r }], zrc.labels, 'kWh', KK_JEDES[c.zc], { name: 'ohne Automatik', v: o.reihe }) : '' }; }
      case 'c-warm': { const w = b.lern && b.lern.warm, pl = w && w.plan;
        const seg = pl ? [[pl.start, pl.ziel, 'vor'], [pl.a, pl.b, 'heiz']] : [];
        return { zahl: pl ? uhr(pl.start) : '–', einh: pl ? 'Uhr' : '', wo: 'heizt heute ab',
          vgl: !w ? 'nur lernend im Modus Thermostat' : !pl ? 'heute frei' : w.gelernt ? `${f(w.soll, 0)} °C um ${uhr(pl.ziel)} · ${f(w.rate, 1)} °C/h gelernt` : `lernt noch (${w.n} von ${w.n_noetig})`,
          mini: pl ? `${this.zeitstrahlSeg(seg, true)}<div class="kk-vgl">${uhr(pl.start)} → ${uhr(pl.ziel)}${zahl(w.aufheiz_min) ? ` · ${de(w.aufheiz_min, 0)} min` : ''}</div>` : '',
          kennz: [['heizt ab', pl ? uhr(pl.start) : '–'], ['warm um', pl ? uhr(pl.ziel) : '–'], ['Aufheizen', w && zahl(w.rate) ? `${de(w.rate, 1)} °C/h` : '–'], ['Aufheizdauer', w && zahl(w.aufheiz_min) ? `${de(w.aufheiz_min, 0)} min` : '–']],
          dia: () => pl ? `<div class="kk-dia-in"><div class="kk-dz"><span>heute</span>${this.zeitstrahlSeg(seg, true)}</div><div class="kk-vgl">${this.warmText(b)}</div></div>` : '', zeilen: true }; }
      case 'p-pumpzeit': { const r = this.heizStunden(d, b, c.zc, c.vc), zy = this.zyklen(d, b, c.zc, c.vc), su = r && summe(r);
        return { zahl: stdMin(su), einh: '', wo: wannC, vgl: `${zy ? summe(zy) : '–'} Zyklen · ${b.geraete.filter(g => g.an).length} läuft jetzt`, funke: r, farbe: 'var(--blau)',
          kennz: [[wannC, stdMin(su)], ['Zyklen', `${zy ? summe(zy) : '–'}`], ['Pumpen', `${b.geraete.filter(g => g.rolle === 'pumpe').length}`], ['läuft jetzt', `${b.geraete.filter(g => g.an).length}`]],
          dia: id => r ? balken(id, r, lab(c.zc, zrc.labels), 'h') : '' }; }
      case 'p-zyklen': { const zy = this.zyklen(d, b, c.zc, c.vc), zv = this.zyklen(d, b, c.zc, c.vc + 1), w = this.zyklen(d, b, 'Woche');
        return { zahl: zy ? `${summe(zy)}` : '–', einh: 'Zyklen', wo: wannC, vgl: zv ? `${this.zrVgl(c.zc, c.vc)} ${summe(zv)}` : '', funke: w && w.slice(0, heuteNr + 1), farbe: 'var(--blau)',
          kennz: [[wannC, `${zy ? summe(zy) : '–'}`], [this.zrVgl(c.zc, c.vc), `${zv ? summe(zv) : '–'}`], ['diese Woche', `${w ? summe(w) : '–'}`], ['heute', `${w ? w[heuteNr] : '–'}`]],
          dia: id => zy ? balken(id, zy, lab(c.zc, zrc.labels), 'Zyklen', 0) : '' }; }
      case 'h-plan': { const pl = this.planTag(this.z.HEUTE_TAG);
        return { zahl: pl ? `${uhr(pl.vor)}–${uhr(pl.ende)}` : 'frei', einh: '', wo: 'heute', vgl: esc(this.statusText()) + (pl && pl.gruende && pl.gruende.length ? ` · ${esc(pl.gruende[0])}` : ''),
          mini: `${this.zeitstrahl(pl, true)}<div class="tl-achse"><span>4</span><span>12</span><span>20</span></div>`,
          kennz: [['Vorheizen ab', pl ? uhr(pl.vor) : '–'], ['Arbeitszeit', pl ? `${uhr(pl.a)}–${uhr(pl.b)}` : '–'], ['Nachheizen bis', pl ? uhr(pl.nach) : '–'], ['Trocknen bis', pl && pl.ende > pl.nach ? uhr(pl.ende) : '–']],
          dia: () => `<div class="kk-dia-in">${this.z.WOCHE.map(([t, dt]) => `<div class="kk-dz ${t === this.z.HEUTE_TAG ? 'heute' : ''}"><span>${t} ${dt.slice(0, 2)}.</span>${this.zeitstrahl(this.planTag(t), t === this.z.HEUTE_TAG)}</div>`).join('')}</div>`, zeilen: true }; }
      case 'h-wann': { const C = d.bereiche.filter(bb => !bb.pumpe), Z = C.map(bb => ({ bb, seg: this.heizzeiten(bb, this.z.HEUTE_TAG) })), mit = Z.filter(q => q.seg.length);
        const von = mit.length ? Math.min(...mit.map(q => q.seg[0][0])) : null, bis = mit.length ? Math.max(...mit.flatMap(q => q.seg.map(s => s[1]))) : null;
        return { zahl: `${mit.length}`, einh: `von ${C.length}`, wo: 'Container heizen heute', vgl: mit.length ? `erster ab ${uhr(von)} · letzter bis ${uhr(bis)}` : 'heute keine Heizzeit',
          mini: mit.slice(0, 3).map(q => `<div class="kk-dz schmal"><span>${esc(q.bb.name)}</span>${this.zeitstrahlSeg(q.seg, true)}</div>`).join(''),
          kennz: [['heizen heute', `${mit.length} von ${C.length}`], ['erster ab', zahl(von) ? uhr(von) : '–'], ['letzter bis', zahl(bis) ? uhr(bis) : '–'], ['heizen jetzt', `${C.filter(bb => bb.z === 'heizt' || bb.z === 'trocknen').length}`]],
          dia: () => `<div class="kk-dia-in">${Z.slice(0, 7).map(q => `<div class="kk-dz"><span>${esc(q.bb.name)}</span>${this.zeitstrahlSeg(q.seg, true)}</div>`).join('')}</div>`, zeilen: true }; }
    }
    return null;
  }
  /* eine Kachel in S / M / L (L mit Diagramm oder vier Kennzahlen); ort 'kat' = Vorschau im Katalog */
  /* Raster mit Layout (ziehen, Größe, ✕, 📈) – Auswertung und Übersicht gleich */
  /* Katalog (src/ansichten/kacheln.js): Einträge je Ort */
  kkEintraege(ort) {
    const E = Object.entries(KK).filter(([k, e]) => !e.je || this.kkWahlListe(k).length).map(([k, e]) => ({ k, ...e, stufen: ST_KACHEL }));
    if (ort !== 'aw') return E;
    return [...E, ...Object.entries(AW_BAUSTEINE).filter(([k]) => !k.startsWith('k-')).map(([k, [name, text]]) => ({ k, ber: 'auswertung', ic: '📊', name, text, such: '', stufen: awStufen(k), baustein: true }))];
  }
  kkHinzu(s) {
    const e = this.kkEintraege(s.ort).find(y => y.k === s.k); if (!e) return;
    const L = this.kkListe(s.ort);
    if (e.baustein) { const x = L.find(y => y.k === e.k); Object.assign(x, this.kkGross(x, s.st), { an: true }); }
    else if (e.je === 'v') L.push(this.kkGross({ k: e.k, an: true, ids: [...s.ids], zr: s.zr, art: s.vgArt || 'balken', ...(s.st === 'L' ? { dia: !!s.dia } : {}) }, s.st));   // WU-0017
    else L.push(this.kkGross({ k: e.k, an: true, ...(e.je ? { id: s.id } : {}), ...(s.st === 'L' ? { dia: !!s.dia } : {}) }, s.st));
    this.kkMerken(s.ort);
    const neu = { k: e.k, id: e.je && e.je !== 'v' ? s.id : undefined, ids: e.je === 'v' ? s.ids : undefined };
    this.s.kkFrisch = `${s.ort}:${neu.k}:${neu.id || ''}`; clearTimeout(this._kkFrisch); this._kkFrisch = setTimeout(() => { this.s.kkFrisch = null; }, 2000);
    this.s.sheet = null; this.s.kkLayout = false; this.s.awLayout = false; this.s.awBearb = false; this.neuZeichnen();
    this.toast(`Kachel „${this.kkName(neu)}“ (${s.st}) hinzugefügt`);
  }
  /* WU-0017: Vergleich kWh / Kosten – 2 bis 4 Container gegenüber (Mockup vergleich-kacheln.html, abgenommen 02.10.2026):
     Summen aus der Statistik wie die anderen Container-Kacheln; Unterschied in kWh bzw. € und % zum sparsamsten */
  vgWerte(x, c) {
    const d = this.d, z = c.ort === 'aw' ? c.zc : (x.zr || 'Tag'), v = c.ort === 'aw' ? c.vc : 0, eur = x.k === 'v-eur', f = eur ? d.e.preis : 1;
    const R = (x.ids || []).map(id => d.bereiche.find(b => b.id === id)).filter(Boolean).map(b => {
      const r = this.verbrauch(d, b.id, z, v), h = this.heizStunden(d, b, z, v);
      return { b, r: r && r.map(q => (q || 0) * f), su: r ? summe(r) * f : null, kwh: r ? summe(r) : null, h: h ? summe(h) : null }; });
    const ok = R.filter(q => zahl(q.su)), min = ok.length ? Math.min(...ok.map(q => q.su)) : null, max = ok.length ? Math.max(...ok.map(q => q.su)) : null;
    return { z, v, eur, R, zr: this.zeitraum(z, v), wann: this.zrText(z, v), min, vorne: ok.find(q => q.su === max), hinten: ok.find(q => q.su === min) };
  }
  vgDia(W0, art) {
    const R = W0.R.filter(q => q.r); if (!R.length) return '';
    const n = W0.zr.labels.length, W = 320, H = 150, L = 34, Rr = 8, T = 8, U = 18, hi = Math.max(...R.flatMap(q => q.r), 0.01) * 1.1;
    const y = v => T + (1 - v / hi) * (H - T - U), bw = (W - L - Rr) / n, jedes = { Tag: 6, Woche: 1, Monat: 7 }[W0.z] || 3, fb = b => BEREICH_FARBEN[b.f % BEREICH_FARBEN.length];
    const stufe = hi > 200 ? 100 : hi > 40 ? 20 : hi > 12 ? 5 : hi > 4 ? 2 : hi > 1.5 ? .5 : .2;
    const raster = [...Array(Math.floor(hi / stufe) + 1)].map((_, q) => q * stufe).map(v => `<line class="gr" x1="${L}" x2="${W - Rr}" y1="${y(v).toFixed(1)}" y2="${y(v).toFixed(1)}"/><text class="ax" x="${L - 4}" y="${(y(v) + 3).toFixed(1)}" text-anchor="end">${de(v, stufe < 1 ? 1 : 0)}</text>`).join('');
    const achse = W0.zr.labels.map((t, i) => i % jedes ? '' : `<text class="ax" x="${(L + i * bw + bw / 2).toFixed(1)}" y="${H - 4}" text-anchor="middle">${esc(String(t))}</text>`).join('');
    const inhalt = art === 'linien'
      ? R.map(q => `<path d="${q.r.map((v, i) => `${i ? 'L' : 'M'}${(L + i * bw + bw / 2).toFixed(1)} ${y(v).toFixed(1)}`).join('')}" fill="none" stroke="${fb(q.b)}" stroke-width="2.2" stroke-linejoin="round"/>`).join('')
      : W0.zr.labels.map((_, i) => R.map((q, k) => { const w = bw * .8 / R.length, xx = L + i * bw + bw * .1 + k * w, v = q.r[i] || 0;
        return v > 0 ? `<rect x="${xx.toFixed(1)}" y="${y(v).toFixed(1)}" width="${Math.max(1, w - .5).toFixed(1)}" height="${(y(0) - y(v)).toFixed(1)}" fill="${fb(q.b)}" rx="1"/>` : ''; }).join('')).join('');
    return `<svg class="vg-svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet">${raster}${achse}${inhalt}</svg>`;
  }
  /* Antippen: die passende vorhandene Ansicht oder Einblendung der Seite */
  kkAuf(x, ort) {
    const S = this.s, c = this.kkCtx(ort), e = KK[x.k], b = e && e.je && e.je !== 'v' ? this.kkB(x) : null;
    if (e && e.je === 'v') { S.sheet = { art: 'verbrauch', t: x.k === 'v-eur' ? 'eur' : undefined, auswahl: [...(x.ids || [])], zeitraum: ort === 'aw' ? c.zc : x.zr || 'Tag', v: ort === 'aw' ? c.vc : 0 }; return this.neuZeichnen(); }   // WU-0017
    const blatt = (art, extra = {}) => { S.sheet = { art, auswahl: b ? [b.id] : [], zeitraum: c.zc, v: c.vc, ...extra }; this.neuZeichnen(); };
    const detail = k => { if (S.view !== 'auswertung') this.gehe('auswertung'); S.sheet = { art: 'aw-detail', k }; this.neuZeichnen(); };
    switch (x.k) {
      case 'b-kosten': S.sheet = { art: 'verbrauch', t: 'eur', auswahl: [], zeitraum: c.z, v: c.v }; return this.neuZeichnen();
      case 'b-gespart': return detail('ohne');
      case 'b-hoch': return detail('hochrechnung');
      case 'b-wetter': return detail('wetter');
      case 'b-oel': return detail('vergleich');
      case 'b-wer': return detail('rangliste');
      case 'b-strom': S.sheet = { art: 'strom' }; return this.neuZeichnen();
      case 'b-preis': S.awSim = true; return this.gehe('auswertung');   // Auswertung mit dem simulierten Preis
      case 'b-geraete': S.evGruppe = 'geraete'; return this.gehe('einst');
      case 'c-leistung': return blatt('leistung', { zeitraum: 'Tag', v: 0 });
      case 'c-verbrauch': case 'c-ohne': return blatt('verbrauch');
      case 'c-kosten': return blatt('verbrauch', { t: 'eur' });
      case 'c-heizzeit': case 'p-pumpzeit': return blatt('heizzeit-c');
      case 'p-zyklen': S.chart = 'zyklen'; S.cZr = null; return this.gehe('container', b.id);
      case 'c-temp': case 'c-warm': S.chart = 'temp'; S.cZr = null; return this.gehe('container', b.id);
      case 'h-plan': S.sheet = { art: 'hz', k: 'plan' }; return this.neuZeichnen();
      case 'h-wann': S.sheet = { art: 'hz', k: 'wann' }; return this.neuZeichnen();
    }
  }
  /* Layout: Kachel ziehen (Reihenfolge) und Größe ziehen (rastet im Raster ein) – Maus und Finger */
  zugStart(ev) {
    const griff = ev.target && ev.target.closest && ev.target.closest('[data-zug]'); if (!griff) return;
    const kachel = griff.closest('.aw-frei-s'), raster = kachel && kachel.parentElement; if (!raster) return;
    const art = griff.dataset.zug, ort = raster.dataset.ort || 'aw', an = this.kkListe(ort).filter(x => x.an), item = an[+kachel.dataset.i]; if (!item) return;
    ev.preventDefault();
    const cs = getComputedStyle(raster), spalten = cs.gridTemplateColumns.split(' ').length, luecke = parseFloat(cs.columnGap) || 12;
    const breite = (raster.getBoundingClientRect().width - luecke * (spalten - 1)) / spalten, hoehe = parseFloat(cs.gridAutoRows) || 110;
    const x0 = ev.clientX, y0 = ev.clientY, w0 = item.w, h0 = item.h, mass = kachel.querySelector('.aw-mass'), wurzel = this.shadowRoot;
    kachel.classList.add(art === 'move' ? 'zieht' : 'waechst');
    let ziel = null;
    const bewegt = e => {
      if (art === 'size') {
        const st = awStufe(item.k, w0 + (e.clientX - x0) / (breite + luecke), h0 + (e.clientY - y0) / (hoehe + luecke));   // rastet auf Stufen ein (FE-0006)
        Object.assign(item, { w: st[1], h: st[2], st: st[0] });
        kachel.style.setProperty('--w', item.w); kachel.style.setProperty('--h', item.h); if (mass) mass.textContent = item.st;
      } else {
        kachel.style.transform = `translate(${e.clientX - x0}px, ${e.clientY - y0}px)`; kachel.style.pointerEvents = 'none';
        const unter = (wurzel.elementFromPoint ? wurzel : document).elementFromPoint(e.clientX, e.clientY), k = unter && unter.closest && unter.closest('.aw-frei-s');
        raster.querySelectorAll('.aw-frei-s.ziel').forEach(x => x.classList.remove('ziel'));
        ziel = k && k !== kachel && raster.contains(k) ? k : null; if (ziel) ziel.classList.add('ziel');
      }
    };
    const fertig = () => {
      window.removeEventListener('pointermove', bewegt); window.removeEventListener('pointerup', fertig); window.removeEventListener('pointercancel', fertig);
      kachel.classList.remove('zieht', 'waechst'); kachel.style.transform = ''; kachel.style.pointerEvents = '';   // Lit lässt das Element stehen (3f)
      raster.querySelectorAll('.aw-frei-s.ziel').forEach(x => x.classList.remove('ziel'));
      if (art === 'move' && ziel) { const Lg = this.kkListe(ort), nach = an[+ziel.dataset.i], von = Lg.indexOf(item);
        Lg.splice(von, 1); Lg.splice(Lg.indexOf(nach) + (+ziel.dataset.i > +kachel.dataset.i ? 1 : 0), 0, item); }
      this.kkMerken(ort); this.neuZeichnen();
    };
    window.addEventListener('pointermove', bewegt); window.addEventListener('pointerup', fertig); window.addEventListener('pointercancel', fertig);
  }

  /* WU-0016: bis zu 3 Screenshots je Meldung – Datei/Kamera, Strg+V, am PC „Fenster aufnehmen“; vor dem Senden auf
     höchstens 1600 px verkleinert (JPEG). Mockup melden-bilder.html, abgenommen 02.10.2026 */
  mbBild(quelle, b, h, wie) {   // Bild/Video → verkleinertes JPEG ins offene Melde-Fenster
    const s = this.s.sheet; if (!s || s.art !== 'melden') return;
    const f = Math.min(1, MB_PX / Math.max(b, h)), c = document.createElement('canvas'); c.width = Math.round(b * f); c.height = Math.round(h * f);
    c.getContext('2d').drawImage(quelle, 0, 0, c.width, c.height);
    const B = (s.form.bilder ||= []);
    if (B.length >= MB_MAX) return this.toast(`Höchstens ${MB_MAX} Bilder`);
    // FE-0027: passt das Bild nicht mehr in die Nachricht, stärker komprimieren; reicht das nicht, ablehnen
    const frei = MB_SUMME - B.reduce((a, x) => a + x.url.length, 0), url = [0.82, 0.6, 0.4].map(q => c.toDataURL('image/jpeg', q)).find(u => u.length <= frei);
    if (!url) return this.toast('Bild zu groß – zusammen höchstens 3 MB, ein Bild entfernen');
    B.push({ url, b: c.width, h: c.height, kb: Math.round(url.length * 0.75 / 1024) }); this.neuZeichnen(); this.toast(`Bild ${wie}`);
  }
  mbDatei(datei, wie) {
    if (!datei || !(datei.type || '').startsWith('image/')) return;
    const r = new FileReader(); r.onload = () => { const img = new Image(); img.onload = () => this.mbBild(img, img.width, img.height, wie); img.onerror = () => this.toast('Bild nicht lesbar'); img.src = r.result; };
    r.readAsDataURL(datei);
  }
  mbFenster() {
    return navigator.mediaDevices.getDisplayMedia({ video: { displaySurface: 'browser' }, preferCurrentTab: true }).then(strom => {
      const v = document.createElement('video'); v.srcObject = strom; v.muted = true;
      return v.play().then(() => new Promise(r => setTimeout(r, 300))).then(() => { this.mbBild(v, v.videoWidth, v.videoHeight, 'aufgenommen'); strom.getTracks().forEach(t => t.stop()); });
    }).catch(() => this.toast('Aufnahme abgebrochen'));
  }
  mlBild(m, i) { const r = this._holen(`mb:${m.id}:${i}`, () => this._hass.callWS({ type: 'baustelle/meldung', aktion: 'bild', meldung_id: m.id, nr: i }), 3600000); return r && r.url; }
  /* Kachel „Preis simulieren“: tatsächliche € (je Tag der damalige Preis) gegen alle kWh × simulierter Preis – beides rechnet die Integration */
  /* Strompreis mit „gilt ab“ (Herbert 04.10.2026, Mockup strompreis.html): Liste wie die Arbeitszeit; die Integration
     rechnet jeden Tag mit dem Preis, der damals galt */
  /* Rangliste der Staffelung (Herbert 01.10.2026, Mockup staffel-rang.html): Reihenfolge und Bedarf in °C rechnet die
     Integration (laufzeit.staffel.rang, laufzeit.container.<id>.bedarf) – die Seite zeigt nur an */
  /* Tagesmittel der Fühler und außen, letzte n Tage */
  tempTage(n) {
    const d = this.d, ids = [...new Set([...d.bereiche.filter(b => b.fuehler).map(b => b.fuehler), this.eid(d, d.entry, 'aussen')].filter(Boolean))].sort();
    const bis = plusTage(d.z.HEUTE, 1), von = plusTage(bis, -n), tage = [...Array(n)].map((_, k) => plusTage(von, k));
    if (!ids.length) return { tage, werte: {} };
    const roh = this._holen(`t:${d.entry}:${n}:${d.z.HEUTE}`, () => this._hass.callWS({ type: 'baustelle/statistik', entry_id: d.entry,
      start_time: new Date(this.zoneMs(von, '00:00', d.z.zone)).toISOString(), end_time: new Date(this.zoneMs(bis, '00:00', d.z.zone)).toISOString(),
      statistic_ids: ids, period: 'day', types: ['mean'], units: {} }));
    if (roh === undefined) return null;
    const werte = {};
    for (const id of ids) { const arr = Array(n).fill(null);
      for (const p of (roh || {})[id] || []) { const ms = typeof p.start === 'number' ? (p.start < 1e11 ? p.start * 1000 : p.start) : Date.parse(p.start), i = tage.indexOf(this.lokal(ms, d.z.zone).slice(0, 10)); if (i >= 0 && zahl(p.mean)) arr[i] = Number(p.mean); }
      werte[id] = arr; }
    return { tage, werte };
  }
  /* Je Gerät: Ø kW im Betrieb (Zähler mittel:<gid>), kWh aus dem Zählerstand des Shelly, Stunden ≈ kWh ÷ Ø kW (Pumpen: Pumpzeit) – rechnet die Integration */
  /* ---- Verlauf ---- */
  /* Kennzahlen einer Baustelle im Verlauf (kWh, €, gespart, Heiztage, Vergleich, kWh je Monat) – rechnet die Integration */
  kennz(x) {
    const v = this.verlaufDaten(x), zeit = x.aktiv ? (x.beginn ? `seit ${datum(x.beginn)}` : 'laufend') : `${x.beginn ? datum(x.beginn) : '–'} – ${x.ende ? datum(x.ende) : '–'}`;
    if (!v) return { zeit, kwh: null, eur: null, gespart: null, gespartText: 'gespart', heiztage: null, container: x.bereiche.length, vergleich: {}, jeMonat: {}, monate: null, laedt: true };
    return { zeit, kwh: v.kwh ?? 0, eur: v.eur ?? 0, gespart: v.gespart ?? null, gespartText: v.gespart_text || 'gespart', heiztage: v.heiztage ?? 0, container: v.container ?? x.bereiche.length,
      vergleich: v.vergleich || {}, jeMonat: v.je_monat || {}, monate: v.monate_je_container || { labels: [], reihen: [] }, laedt: false };
  }
  /* ============ Verlauf (WU-0006, Mockup glas.html Variante 5 abgenommen): Reiter Baustellen (Karten / Vergleich) und Protokoll ============ */
  vlMonatsKeys() {
    const heute = (this.d || this.alle[0] || { z: { HEUTE: new Date().toISOString().slice(0, 10) } }).z.HEUTE, j = +heute.slice(0, 4), mo = +heute.slice(5, 7) - 1;
    return [...Array(12)].map((_, k) => { const mm = mo - 11 + k, jj = mm < 0 ? j - 1 : j; return `${jj}-${String(((mm % 12) + 12) % 12 + 1).padStart(2, '0')}`; });
  }
  vlFunke(werte, farbe, w = 120, h = 34) {
    const max = Math.max(1, ...werte), bw = w / werte.length;
    return `<svg class="vl-funke" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none">${werte.map((v, i) => `<rect x="${(i * bw + 1).toFixed(1)}" y="${(h - v / max * h).toFixed(1)}" width="${Math.max(0, bw - 2).toFixed(1)}" height="${(v / max * h).toFixed(1)}" rx="1.5" fill="${farbe}" opacity="${v > .5 ? .9 : .15}"/>`).join('')}</svg>`;
  }

  /* BSM-032: Container-Symbol – Aussehen bearbeiten; die Integration prüft und liefert den Zustand aus den Sensoren */
  symKonfig(b) { const s = this.s.sheet, x = s && s.sym; if (x) return x;
    const q = (!s.std && b.symbol) || SYMBOL_STANDARD, el = y => ({ wand: y.wand, pos: y.pos, sensor: y.sensor || null });
    s.sym = { doppel: !!q.doppel, farbe: q.farbe || null, rahmen: q.rahmen || null, tueren: q.tueren.map(el), fenster: q.fenster.map(el), licht: q.licht || null };
    if (s.anfang === undefined) s.anfang = JSON.stringify(s.sym);
    return s.sym; }
  symSenden(b, c) { this.s.sheet.sym = c; this.s.sheet.std = false; return this.neuZeichnen(); }   // erst „Speichern“ schickt es (BSM-034.01)
  /* BSM-019: Notprogramm in den Plugs – Zustand je Heizkörper-Plug kommt fertig von der Integration (laufzeit.geraete.<id>.notprogramm) */
  npPlugs() { return this.d.bereiche.flatMap(b => b.geraete.filter(g => g.np).map(g => ({ b, g, np: g.np }))); }
  npModus(np) { return { thermo: `Thermostat ${zahl(np.soll) ? de(np.soll) + ' °C' : ''}`.trim(), plan: 'Zeitplan', bedarf: 'Bei Bedarf (Termine)', hand: 'Hand – nicht anfassen', aus: 'aus – nur Frostschutz' }[np.modus] || '–'; }
  npZeit(iso, mitTag = true) { if (!iso) return '–'; const l = this.lokal(iso, this.d.z.zone), t = l.slice(0, 10);
    return mitTag ? `${t === this.d.z.HEUTE ? 'heute' : `${wtag(t)} ${kurzDatum(t)}`} ${l.slice(11, 16)}` : l.slice(11, 16); }
  npVor(iso) { const m = iso ? this.minSeitAb(iso, this.d.z.jetztMs) : null; return m === null ? 'noch nie' : m < 1 ? 'gerade eben' : `vor ${m} min`; }
  npMarke(g) { const np = g.np; if (!np || np.zustand === 'aus') return '';
    return `<span class="np-marke ${np.zustand === 'fehler' ? 'rot' : ''}" title="Notprogramm: ${np.zustand === 'fehler' ? esc(np.fehler || 'Fehler') : np.zustand === 'not' ? 'Notbetrieb' : np.zustand === 'offen' ? 'noch nicht geprüft' : 'bereit'}">🛟</span>`; }
  /* ---- Auswahllisten aus HA (für die Einrichtungs-Dialoge) ---- */
  entitaeten(filter) {
    const eigene = new Set(this._eigene || []);
    return Object.values((this._hass && this._hass.states) || {}).filter(s => !eigene.has(s.entity_id) && filter(s))
      .map(s => [s.entity_id, s.attributes.friendly_name || s.entity_id]).sort((a, b) => a[1].localeCompare(b[1], 'de'));
  }
  freieSchalter(auch) {
    const belegt = new Set(this.alle.filter(x => x.aktiv).flatMap(x => x.bereiche.flatMap(b => b.geraete.map(g => g.schalter))));
    return this.entitaeten(s => s.entity_id.startsWith('switch.') && (!belegt.has(s.entity_id) || s.entity_id === auch));
  }
  /* ---- Einblendungen von unten ---- */
  fehlerText(e) { return fehlerText(e); }
  async ws(msg, ok) {
    if (!this.darfSenden(msg)) { this.toast(NUR_ANSEHEN); return null; }
    try { const r = await this._hass.callWS(msg); if (ok) this.toast(ok); return r === undefined ? true : r; }
    catch (e) { this.toast(`Fehler: ${this.fehlerText(e)}`); return null; }
    finally { this._laden(); }
  }
  /* Einstellung setzen: sofort anzeigen, dann an die Integration (Pfad wie im Store) */
  setzen(pfad, wert, ok) {
    if (this.nurLesen()) { this.toast(NUR_ANSEHEN); this.neuZeichnen(); return Promise.resolve(null); }   // Feld zurück auf den alten Wert
    const r = this.d && this.d.r;
    this._rohText = null;   // Antwort der Integration immer übernehmen (auch wenn sie den Wert ablehnt)
    if (r) { let o = r.einstellungen ||= {}; for (const k of pfad.slice(0, -1)) o = o[k] = o[k] && typeof o[k] === 'object' ? o[k] : {}; o[pfad[pfad.length - 1]] = wert; this._neuBauen(); this.neuZeichnen(); }
    return this.ws(nachricht.setzen(this.d.entry, pfad, wert), ok);
  }
  aktion(aktion, felder, ok) { return this.ws(nachricht.aktion(this.d.entry, aktion, felder), ok); }
  liste(liste, aktion, eintrag, ok) { return this.ws(nachricht.liste(this.d.entry, liste, aktion, eintrag), ok); }
  /* Einrichtungs-Dialoge von HA (dieselben wie unter Einstellungen → Geräte & Dienste) */
  async dialog(pfad, start, daten) {
    if (this.nurLesen()) throw new Error(NUR_ANSEHEN);
    const form = await this._hass.callApi('POST', pfad, start);
    if (!form || form.type !== 'form') return form;
    return this._hass.callApi('POST', `${pfad}/${form.flow_id}`, daten);
  }
  flowFehler(r) { return flowFehler(r); }
  async einrichten(lauf, ok) {
    try { const r = await lauf(); const f = this.flowFehler(r); if (f) { this.toast(`Nicht gespeichert: ${f}`); return null; } if (ok) this.toast(ok); return r || true; }
    catch (e) { this.toast(`Fehler: ${this.fehlerText(e)}`); return null; }
  }
  optionenSpeichern(x, aenderung) {
    const o = { ...x.optionen, ...aenderung };
    for (const k of Object.keys(o)) if (o[k] === '' || o[k] === null || o[k] === undefined) delete o[k];
    return this.dialog('config/config_entries/options/flow', { handler: x.entry }, o);
  }
  bereichDaten(name, art, fuehler) { return { name, art, ...(fuehler ? { fuehler } : {}) }; }
  geraetDaten(bid, g) { const [rolle, typ] = TYP_ROLLE[g.typ] || TYP_ROLLE.Ölradiator;
    return { bereich: bid, schalter: g.schalter, name: (g.n || '').trim() || this.name(g.schalter) || g.typ, rolle, typ: typ === 'oelradiator' && rolle !== 'heizkoerper' ? 'konvektor' : typ,
      ...(g.leistung ? { leistung: g.leistung } : {}), ...(g.energie ? { energie: g.energie } : {}) }; }
  /* Geräte anlegen, ändern, verschieben, entfernen: ein Aufruf, die Integration prüft und lädt danach einmal neu (BSM-034.02) */
  async geraeteSpeichern(schritte) { const r = await this._hass.callWS({ type: 'baustelle/geraet', entry_id: this.d.entry, aktion: 'speichern', schritte }); this.invNeu(); return r; }
  async bereichAnlegen(name, schacht) {
    const r = await this.dialog('config/config_entries/subentries/flow', { handler: [this.d.entry, 'bereich'] }, this.bereichDaten(name, schacht ? 'pumpenschacht' : 'container'));
    const f = this.flowFehler(r); if (f) throw new Error(f);
    return r;
  }
  async neueIds(namen) { await this._laden(); return namen.map(n => (this.d.bereiche.find(b => b.name === n) || {}).id).filter(Boolean); }
  morgenFrueh() { return new Date(this.zoneMs(plusTage(this.z.HEUTE, 1), '07:00', this.z.zone)).toISOString(); }   // „bis morgen stumm“ = morgen 07:00
  isoHeute(hhmm) { return new Date(this.zoneMs(this.z.HEUTE, hhmm, this.z.zone)).toISOString(); }

  hover(ev) {
    const svg = ev.target && ev.target.closest && ev.target.closest('svg.chart'); if (!svg) return this.tip(null);
    const c = CHARTS[svg.dataset.chart]; if (!c) return this.tip(null);
    const r = svg.getBoundingClientRect(), fx = (ev.clientX - r.left) / r.width, p = this.d ? this.d.e.preis : 0;
    if (c.art === 'streu') {
      const vx = (ev.clientX - r.left) / r.width * 320, vy = ((ev.clientY ?? 0) - (r.top ?? 0)) / r.width * 320;
      let best = 0, bd = 1e9; c.pkt.forEach((q, i) => { const dd = (c.x(q[0]) - vx) ** 2 + (c.y(q[1]) - vy) ** 2; if (dd < bd) { bd = dd; best = i; } });
      if (bd > 900) { svg.querySelector('.hover').innerHTML = ''; return this.tip(null); }
      const q = c.pkt[best];
      svg.querySelector('.hover').innerHTML = `<circle cx="${c.x(q[0])}" cy="${c.y(q[1])}" r="7" fill="none" stroke="var(--ink)" stroke-width="1.5"/>`;
      return this.tip(ev, `<b>${de(q[0], 1)} °C außen</b><div>${de(q[1], 0)} kWh · ${de(q[1] * p, 2)} €</div>`);
    }
    if (c.art === 'flaeche') {
      const vx = fx * c.W, i = Math.max(0, Math.min(c.n - 1, Math.round((vx - c.x0) / (c.x1 - c.x0) * (c.n - 1)))), x = c.x0 + i / Math.max(1, c.n - 1) * (c.x1 - c.x0);
      const h = c.einheit === 'kWh/h' || c.einheit === 'kW', sum = c.reihen.reduce((a, q) => a + q.v[i], 0);
      if (c.einheit === 'kW') { svg.querySelector('.hover').innerHTML = `<line x1="${x}" x2="${x}" y1="10" y2="138" class="kreuz"/>` + c.reihen.map(q => `<circle cx="${x}" cy="${c.y(q.o[i])}" r="3.5" fill="${q.farbe}" class="punkt"/>`).join('');
        return this.tip(ev, `<b>${c.labels[i]}:00</b>` + (c.reihen.length > 1 ? [...c.reihen].reverse().map(q => `<div><i style="background:${q.farbe}"></i>${esc(q.name)} <b>${de(q.v[i], 2)} kW</b></div>`).join('') + `<div class="tip-summe">zusammen <b>${de(sum, 2)} kW</b></div>` : `<div>${de(sum, 2)} kW</div>`)); }
      svg.querySelector('.hover').innerHTML = `<line x1="${x}" x2="${x}" y1="10" y2="138" class="kreuz"/>` + c.reihen.map(q => `<circle cx="${x}" cy="${c.y(q.o[i])}" r="3.5" fill="${q.farbe}" class="punkt"/>`).join('');
      const vglTip = c.vergleich ? `<div class="leise">${esc(c.vglName || 'Vergleich')} ${de(c.vergleich[i], 2)} ${c.einheit === '€' ? '€' : 'kWh'}</div>` : '';
      return this.tip(ev, `<b>${c.labels[i]}${h ? ':00' : ''}</b>` + vglTip + (c.reihen.length > 1
        ? [...c.reihen].reverse().map(q => `<div><i style="background:${q.farbe}"></i>${esc(q.name)} <b>${de(q.v[i], 2)} ${c.einheit === '€' ? '€' : 'kWh'}</b></div>`).join('') + `<div class="tip-summe">zusammen <b>${de(sum, 2)} kWh</b> · ${de(sum * p, 2)} €</div>`
        : c.einheit === '€' ? `<div>${de(sum, 2)} €</div>` : `<div>${de(sum, 2)} kWh</div><div class="leise">${de(sum * p, 2)} €</div>`));
    }
    if (c.art === 'luecke') {   // Kachel „Gespart“: mit, ohne (24/7) und gespart der Integration zur Stunde/zum Tag unter dem Zeiger
      const vx = fx * c.W, i = Math.max(0, Math.min(c.n - 1, Math.round((vx - c.x0) / (c.x1 - c.x0) * (c.n - 1)))), x = c.x0 + i / Math.max(1, c.n - 1) * (c.x1 - c.x0);
      if (!zahl(c.mit[i])) { svg.querySelector('.hover').innerHTML = ''; return this.tip(null); }
      svg.querySelector('.hover').innerHTML = `<line x1="${x}" x2="${x}" y1="10" y2="${c.unten}" class="kreuz"/><circle cx="${x}" cy="${c.y(c.mit[i])}" r="3.5" fill="var(--s1)" class="punkt"/><circle cx="${x}" cy="${c.y(c.ohne[i])}" r="3.5" fill="var(--ink2)" class="punkt"/>`;
      return this.tip(ev, `<b>${c.labels[i]}${c.n === 24 ? ':00' : ''}</b><div><i style="background:var(--s3)"></i>gespart <b>${de(c.gespart[i], 2)} ${c.einheit}</b></div>`
        + `<div><i style="background:var(--s1)"></i>mit Automatik <b>${de(c.mit[i], 2)} ${c.einheit}</b></div><div class="leise">ohne (24/7) ${de(c.ohne[i], 2)} ${c.einheit}</div>`);
    }
    if (c.art === 'stufen') {   // AN-0005: Wert jedes Geräts zur Zeit unter dem Zeiger
      const vx = fx * c.W, t = c.von + Math.max(0, Math.min(1, (vx - c.L) / (c.B - c.L))) * (c.bis - c.von);
      const wert = r => { let w = null; for (const q of r.punkte) { if (q[0] > t) break; w = q[1]; } return w; }, x = c.x(t);
      svg.querySelector('.hover').innerHTML = `<line x1="${x}" x2="${x}" y1="10" y2="${c.unten}" class="kreuz"/>`;
      const zeit = new Date(t).toLocaleTimeString('de-AT', { timeZone: this.d.z.zone, hour: '2-digit', minute: '2-digit', second: '2-digit' });
      return this.tip(ev, `<b>${zeit}</b>${c.reihen.map(r => { const w = wert(r); return zahl(w) ? `<div><i style="background:${r.farbe}"></i>${esc(r.name)} <b>${de(w, 0)} W</b></div>` : ''; }).join('')}`);
    }
    if (c.art === 'linien') {
      const vx = fx * c.W, i = Math.max(0, Math.min(c.n - 1, Math.round((vx - c.x0) / (c.x1 - c.x0) * (c.n - 1)))), x = c.x0 + i / Math.max(1, c.n - 1) * (c.x1 - c.x0);
      svg.querySelector('.hover').innerHTML = `<line x1="${x}" x2="${x}" y1="10" y2="${c.unten}" class="kreuz"/>` + c.reihen.map(q => !zahl(q.v[i]) ? '' : `<circle cx="${x}" cy="${c.y(q.v[i])}" r="3.5" fill="${q.farbe}" class="punkt"/>`).join('');
      return this.tip(ev, `<b>${c.titel(i)}</b>${c.reihen.map(q => !zahl(q.v[i]) ? '' : `<div><i style="background:${q.farbe}"></i>${esc(q.name)} <b>${de(q.v[i])} °C</b></div>`).join('')}`);
    }
    if (c.art === 'linie') {
      const vx = fx * c.W, i = Math.max(0, Math.min(24, Math.round((vx - c.x0) / (c.x1 - c.x0) * 24))), x = c.x0 + i / 24 * (c.x1 - c.x0);
      const v = c.vb ? c.vb[Math.min(i, c.vb.length - 1)] || 0 : null, kv = c.reihen.length + 1;
      svg.querySelector('.hover').innerHTML = `<line x1="${x}" x2="${x}" y1="10" y2="${c.unten}" class="kreuz"/>` + c.reihen.map((s, k) => !zahl(s.v[i]) ? '' : `<circle cx="${x}" cy="${c.y(s.v[i])}" r="4" fill="var(--s${k + 1})" class="punkt"/>`).join('')
        + (c.vb ? `<circle cx="${x}" cy="${c.yv(v)}" r="3.5" fill="var(--s${kv})" class="punkt"/>` : '');
      return this.tip(ev, `<b>${String(i).padStart(2, '0')}:00</b>${c.reihen.map((s, k) => !zahl(s.v[i]) ? '' : `<div><i style="background:var(--s${k + 1})"></i>${s.name} <b>${de(s.v[i])} ${c.einheit}</b></div>`).join('')}`
        + (c.vb ? `<div><i style="background:var(--s${kv})"></i>Verbrauch <b>${de(v, 2)} kWh</b></div>` : ''));
    }
    const bar = ev.target.closest('.bar'); svg.querySelectorAll('.bar').forEach(x => x.classList.toggle('matt', !!bar && x !== bar));
    if (!bar) return this.tip(null); const i = +bar.dataset.i;
    return this.tip(ev, `<b>${c.labels[i]}</b><div>${de(c.werte[i], c.d)} ${c.einheit}</div>`);
  }
  tip(ev, html) {
    const t = this.root && this.root.querySelector('.tip'); if (!t) return;
    if (!ev || !html) { t.classList.remove('an'); this.root.querySelectorAll('.chart .hover').forEach(h => { h.innerHTML = ''; }); this.root.querySelectorAll('.bar.matt').forEach(x => x.classList.remove('matt')); return; }
    const r = this.root.getBoundingClientRect(); t.innerHTML = html; t.classList.add('an');
    const x = Math.min(ev.clientX - r.left + 12, r.width - t.offsetWidth - 8); t.style.left = x + 'px'; t.style.top = (ev.clientY - r.top - t.offsetHeight - 12) + 'px';
  }
}
if (!customElements.get('baustelle-panel')) customElements.define('baustelle-panel', BaustellePanel);
