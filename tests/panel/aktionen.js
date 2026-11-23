// Testhelfer (BSM-022 Stufe 4): Die Seite hat keine data-act-Weiche mehr; ältere Testschritte beschreiben Aktionen noch als
// { act, … } wie früher der Ersatzknopf. Diese Tabelle übersetzt sie in die Panel-Methoden, die die Lit-Vorlagen auch
// rufen – nur für Tests, die einer Ansicht vorgreifen. Nur-Lesen wie früher die Sperre am Knopf (rechte.js bis 0.8.99).
'use strict';
const VOR_ORT = { 'w-stumm': 'warnung_stumm', 'sg-gefuehl': 'gefuehl', 'bedarf-auf': 'bedarf', 'bedarf-an': 'bedarf', 'bedarf-aus': 'bedarf_aus',
  boost: 'boost', 'jetzt-an': 'jetzt_heizen', 'jetzt-aus': 'jetzt_heizen' };
const GESPERRT = ['lern-reset', 'abschliessen', 'neu-anlegen', 'wetterquelle-auf'], GESPERRT_S = ['termin', 'urlaub', 'container-neu', 'wetterquelle', 'bs-loeschen', 'zeitraum-bs', 'name', 'baustelle-neu'];
function gesperrt(p, a, ds) {
  const r = p.rechte(); if (r.aendern) return false;
  if (VOR_ORT[a]) return !r.aktionen.includes(VOR_ORT[a]);
  return /-(speichern|weg|bearbeiten)$/.test(a) || GESPERRT.includes(a) || (a === 'sheet' && GESPERRT_S.includes(ds.s));
}
function aktion(p, roh) {
  const ds = Object.fromEntries(Object.entries(roh).filter(([, v]) => v !== undefined).map(([k, v]) => [k, String(v)]));
  const a = ds.act, d = p.d, b = p.b, S = p.s;
  if (gesperrt(p, a, ds)) return p.toast('Nur ansehen – ändern dürfen nur Admins');
  const neu = () => p.neuZeichnen();
    switch (a) {
      case 'menue': return p.dispatchEvent(new Event('hass-toggle-menu', { bubbles: true, composed: true }));
      case 'tab': return p.gehe(ds.v);
      case 'neu-laden': return p.neuLaden();
      case 'container': return p.containerOeffnen(ds.id);
      case 'w-stumm': return p.warnungStumm(ds.id);
      case 'pfilter': S.pfilter = ds.v; S.pmehr = false; return neu();
      case 'pmehr': S.pmehr = true; return neu();
      case 'sheet': return p.einblenden(ds.s, ds);
      case 'vb-gruppe': return p.vbGruppe(ds.ziel, ds.v);
      case 'vb-zeitraum': return p.zeitraumWahl(ds.ziel, ds.v);
      case 'zr-schritt': return p.zrSchritt(ds.ziel, +ds.max || 0, +ds.d);
      case 'zr-setz': return p.zrSetzen(ds.ziel, +ds.max || 0, +ds.v);
      case 'zr-kal': return p.zrKalAuf(ds.ziel);
      case 'zr-kal-nav': return p.zrKalBlaettern(+ds.d);
      case 'vb-wer': return p.vbWer(ds.ziel, ds.id);
      case 'bereich-einst': return p.bereichEinst(ds.id);
      case 'zu': return p.schliessen();
      case 'melden': return p.meldenAuf();
      case 'toast': return p.toast(ds.t);
      case 'auto': return p.automatikUmschalten();
      case 'bedarf-auf': return p.bedarfAuf(ds.id);
      case 'bedarf-an': return p.bedarfAn(ds.id, ds.v);
      case 'bedarf-aus': return p.bedarfAus(ds.id);
      case 'termin-weg': { const t = d.termine[+ds.i]; return t && p.terminWeg(t); }
      case 'termin-speichern': return p.terminSpeichern();
      case 'firma-speichern': return p.firmaSpeichern();
      case 'firma-weg': return p.firmaWeg();
      case 'an-speichern': return p.anschlussSpeichern();
      case 'an-weg': return p.anschlussWeg();
      case 'neu-anlegen': return p.containerAnlegen(p.s.sheet, false);
      case 'b-speichern': return p.bereichSpeichern();
      case 'b-weg': return p.bereichWeg();
      case 'gf-speichern': return p.geraetSpeichern();
      case 'sym-speichern': return p.symSpeichern(p.d.bereiche.find(x => x.id === p.s.sheet.id));
      case 'boost': return p.boostUmschalten(d.bereiche.find(y => y.id === ds.id));
      case 'ausn-neu': return p.ausnahmeNeu(ds.v);
      case 'au-speichern': return p.ausnahmeSpeichern();
      case 'ausn-weg': { const x = ds; return p.ausnahmeWeg({ datum: x.d, art: x.art, von: x.von, bis: x.bis }); }
      case 'ausn-dazu': return p.ausnahmeDazu(ds.d);
      case 'jetzt-an': return p.jetztHeizen(true);
      case 'jetzt-aus': return p.jetztHeizen(false);
      case 'b-auto': { const x = ds.id ? d.bereiche.find(y => y.id === ds.id) : b; return x && p.bereichAuto(x); }
      case 'hz-auf': return p.hzAuf(ds.k);
      case 'modus': { const x = d.bereiche.find(y => y.id === ds.id); return x && p.modusSetzen(x, ds.v); }
      case 'np-an': return p.einstellungUmschalten('notprogramm');   // BSM-019
      case 'np-probe': return p.npProbe(ds.id, +ds.min);
      case 'np-taste': return p.einstellungUmschalten('taste');   // BSM-018
      case 'np-plug': return p.npPlugAuf(ds.id);
      case 'np-pruefen': return p.npPruefen();
      case 'test-meldung': return p.testMeldung();
      case 'bsz-speichern': return p.zeitraumBsSpeichern();
      case 'aw-an': return p.awAn(+ds.i);
      case 'aw-weg': return p.kkWeg(ds.ort || 'aw', +ds.i);
      case 'kk-plus': return p.kkPlus(ds.ort);
      case 'sp-neu': return p.preisNeu();
      case 'sp-speichern': return p.preisSpeichern();
      case 'sp-weg': return p.preisWeg(ds.ab);
      case 'sp-sim': return p.spSim(+ds.d);
      case 'vg-art-k': return p.vgArtUm(ds.ort, +ds.i);
      case 'kk-layout': return p.kkLayoutUm();
      case 'sg-gefuehl': return p.gefuehl(b, +ds.v);
      case 'sg-zurueck': return p.sollZurueck({ id: ds.id });
      case 'sg-vergessen': return p.gefuehlVergessen();
      case 'kk-dia': return p.kkDiaUm(ds.ort, +ds.i);
      case 'kk-auf': return p.kkAufI(ds.ort, +ds.i);
      case 'aw-stufe': return p.awStufeWahl(+ds.i, ds.v);
      case 'aw-hoch': case 'aw-runter': return p.awVerschieben(+ds.i, +ds.i + (a === 'aw-hoch' ? -1 : 1));
      case 'aw-vorlage': return p.awVorlageWahl(ds.v);
      case 'c-soll': return p.sollSchritt(b, +ds.d);
      case 'cvd': S.cvd = ds.v; return neu();
      case 'g-aktiv': return p.geraetAktiv(b, +ds.i);
      case 'g-automatik': return p.geraetAutomatik(b, +ds.i);
      case 'g-bearbeiten': return p.geraetBearbeiten(b, +ds.i);
      case 'b-lernen': return p.lernenUmschalten(b);
      case 'lern-reset': return p.lernZuruecksetzen(b);
      case 'b-trocknen': case 'tr-b': return p.trocknenUmschalten(a === 'tr-b' ? d.bereiche.find(y => y.id === ds.id) : b);
      case 'geraet': return p.geraetSchalten(b, +ds.i);
      case 'chart': S.chart = ds.c; return neu();
      case 'verlauf': S.verlauf = ds.v; return neu();
      case 'basis': return p.heizgrenzeBasis(ds.v);
      case 'e-bool': return p.einstellungUmschalten(ds.k);
      case 'st': return p.stufeSchritt(ds.k, +ds.d);
      case 'jc-auto': { const x = d.bereiche.find(y => y.id === ds.id); return p.setzen(['bereiche', x.id, 'auto'], !x.auto); }
      case 'jc-soll': return p.containerSoll(d.bereiche.find(y => y.id === ds.id), +ds.d);
      case 'urlaub-weg': { const u = (p.urlaube() || [])[+ds.i]; return u && p.urlaubWeg(u); }
      case 'urlaub-speichern': return p.urlaubSpeichern();
      case 'vgl': S.vglArt = ds.v; return neu();
      case 'bs-wahl': return p.baustelleOeffnen(ds.id);
      case 'bs-bearbeiten': return p.bsBearbeiten(ds.id);
      case 'bs-loeschen': return p.bsLoeschen();
      case 'csv': return p.csv(ds.art);
      case 'firma-auf': return p.firmaAuf(ds.id);
      case 'e-wert': return p.einstellungWert(ds.k, ds.v);
      case 'bericht-senden': return p.berichtSenden();
      case 'anschluss-auf': return p.anschlussAuf(ds.id);
      case 'tab-einst': return p.einstGruppe(ds.g || (S.sheet && S.sheet.art === 'strom' ? 'strom' : S.evGruppe));
      case 'ev-gruppe': return p.einstGruppeWahl(ds.v);
      case 'az-neu': return p.azNeu(p.azJetzt);
      case 'az-vorlage': return p.azNeu(d.arbeitszeiten[S.sheet.i]);
      case 'az-bearbeiten': { const v = d.arbeitszeiten[S.sheet.i]; return v && p.azBearbeiten(v); }
      case 'az-weg': return p.azWeg(d.arbeitszeiten[S.sheet.i]);
      case 'azn-speichern': return p.azSpeichern();
      case 'temp-vb': S.tempVb = S.tempVb === false; return neu();
      case 'abschliessen': return p.abschliessen();
      case 'name-speichern': return p.nameSpeichern();
      case 'baustelle-anlegen': return p.baustelleAnlegen();
      case 'wetterquelle-speichern': return p.wetterquelleSpeichern();
    }
    return undefined;
}
module.exports = { aktion };
