'use strict';
// Prüflauf für das automatische Speichern, in der echten App (eigener Testordner, fasst die echten Daten nicht an).
//   electron test/speichern.js <ausgabeordner> latenz       Wie lange dauert es vom Loslassen des Stifts bis die Datei auf der Platte liegt?
//                                                           Danach: Absturz der Oberfläche (die Datei muss den Strich schon enthalten)
//   electron test/speichern.js <ausgabeordner> schliessen   Strich zeichnen und das Fenster sofort schliessen
//   electron test/speichern.js <ausgabeordner> groesse      Dieselbe Handschrift einmal ohne und einmal mit Punktreduktion speichern und die Dateigrösse vergleichen
//   node     test/speichern.js <ausgabeordner> pruefen      Zählt die gespeicherten Striche (nach "schliessen")
// Schreibt speichern.json in den Ausgabeordner. Vorher Lernheft schliessen (Port 47823).
const path = require('path');
const fs = require('fs');
const zlib = require('zlib');

const AUS = path.resolve(process.argv[2] || 'speichern-test');
const MODUS = process.argv[3] || 'latenz';
const WURZEL = path.join(AUS, 'Lernheft');
const F = require('../../webseite/format.js');

function striche(name) {
  const dir = path.join(WURZEL, 'Bibliothek', name || 'Speichertest', 'Handschrift');
  if (!fs.existsSync(dir)) return -1;
  let n = 0;
  for (const f of fs.readdirSync(dir)) {
    if (!f.endsWith('.lhz')) continue;
    try { n += F.dekodiereSeite(zlib.gunzipSync(fs.readFileSync(path.join(dir, f))).toString('utf8')).e.length; } catch (e) { /* halbe Datei */ }
  }
  return n;
}

const electron = require('electron');
if (typeof electron === 'string' || MODUS === 'pruefen') {
  const n = striche();
  const erwartet = JSON.parse(fs.readFileSync(path.join(AUS, 'erwartet.json'), 'utf8')).striche;
  console.log(`${n === erwartet ? 'ok  ' : 'FEHLER'} gespeicherte Striche: ${n}, erwartet: ${erwartet}`);
  process.exit(n === erwartet ? 0 : 1);
}

const { app, BrowserWindow } = electron;
fs.rmSync(AUS, { recursive: true, force: true });
fs.mkdirSync(path.join(WURZEL, 'Programm'), { recursive: true });
app.setPath('userData', path.join(AUS, 'profil'));
process.env.LERNHEFT_ORDNER = WURZEL;
process.env.LERNHEFT_SEITE = path.join(__dirname, '..', '..', 'webseite');
const warte = ms => new Promise(r => setTimeout(r, ms));
require('../main.js');

app.whenReady().then(async () => {
  let win;
  for (let i = 0; i < 100 && !win; i++) { win = BrowserWindow.getAllWindows()[0]; if (!win) await warte(100); }
  const wc = win.webContents;
  win.setSize(1400, 900);
  win.show(); win.focus();
  await new Promise(r => wc.once('did-finish-load', r));
  await warte(2000);
  const js = c => wc.executeJavaScript(c, true);
  const r = { modus: MODUS };
  try {
    if (MODUS !== 'groesse') await js(`(async () => {
      const ereignis = (typ, x, y) => new PointerEvent(typ, { pointerId: 7, pointerType: 'pen', isPrimary: true, clientX: x, clientY: y, pressure: typ === 'pointerup' ? 0 : 0.5, buttons: typ === 'pointerup' ? 0 : 1, button: 0, bubbles: true, cancelable: true });
      window.__strich = async n => {
        const cv = document.querySelector('.dok-bereich:not([hidden]) .lw-canvas'); cv.setPointerCapture = () => {}; cv.releasePointerCapture = () => {}; cv.hasPointerCapture = () => true;
        const hr = cv.parentElement.getBoundingClientRect(), x0 = hr.left + 200, y0 = hr.top + 150 + n * 30;
        cv.dispatchEvent(ereignis('pointerdown', x0, y0));
        for (let i = 1; i <= 40; i++) { cv.dispatchEvent(ereignis('pointermove', x0 + i * 6, y0 + 20 * Math.sin(i / 4))); await new Promise(ok => setTimeout(ok, 4)); }
        cv.dispatchEvent(ereignis('pointerup', x0 + 240, y0));
        return Date.now();
      };
      const id = UI.neueId(), sid = UI.neueId();
      Bibliothek.speichere(id, { art: 'notizbuch', name: 'Speichertest', eltern: null, format: 'A4', papier: 'karo', farbe: 'blau', seiten: [sid], erstellt: Date.now(), geoeffnet: Date.now(), seite: 1, favorit: false });
      location.hash = '#/dok/' + id;
      await new Promise(ok => setTimeout(ok, 1500));
      return id;
    })()`);
    await warte(1500);

    if (MODUS === 'groesse') {
      // Dieselben 150 Striche (Schrift mit 120 Hz, 100 bis 300 px/s, Druck in Stufen) in zwei Notizbüchern: im ersten ohne Punktreduktion
      // (Reduktion abgeschaltet), im zweiten wie im Programm. Verglichen werden die Dateien auf der Platte.
      r.groesse = await js(`(async () => {
        let zufall = 11; const zuf = () => (zufall = (zufall * 16807) % 2147483647) / 2147483647;
        const striche = [];
        for (let z = 0; z < 15; z++) for (let w = 0; w < 10; w++) {
          const n = 40 + Math.floor(zuf() * 50); let x = 40 + w * 90, y = 60 + z * 55, ph = zuf() * 6, v = 160 + zuf() * 120; const p = [];
          for (let i = 0; i < n; i++) { ph += 0.25 + zuf() * 0.1; x += v / 120 * (1 + 0.3 * Math.sin(ph)) * 0.45; y += 22 * Math.cos(ph * 1.7) / 120 * 4 + Math.sin(ph * 3.1) * 0.4; p.push([x + (zuf() - .5) * 0.3, y + (zuf() - .5) * 0.3, 0.35 + 0.25 * Math.sin(ph * 0.9)]); }
          striche.push(p);
        }
        const zeichne = async name => {
          const id = UI.neueId(), sid = UI.neueId();
          Bibliothek.speichere(id, { art: 'notizbuch', name, eltern: null, format: 'A4', papier: 'karo', farbe: 'blau', seiten: [sid], erstellt: Date.now(), geoeffnet: Date.now(), seite: 1, favorit: false });
          location.hash = '#/dok/' + id; await new Promise(ok => setTimeout(ok, 1500));
          const cv = document.querySelector('.dok-bereich:not([hidden]) .lw-canvas'); cv.setPointerCapture = () => {}; cv.releasePointerCapture = () => {}; cv.hasPointerCapture = () => true;
          const hr = cv.parentElement.getBoundingClientRect(), lw = Dokument.leinwand();
          lw.setzeAnsicht({ s: 1, dx: 0, dy: 0 });
          const ev = (typ, x, y) => cv.dispatchEvent(new PointerEvent(typ, { pointerId: 7, pointerType: 'pen', isPrimary: true, clientX: hr.left + x, clientY: hr.top + y, pressure: typ === 'pointerup' ? 0 : 0.5, buttons: typ === 'pointerup' ? 0 : 1, button: 0, bubbles: true, cancelable: true }));
          const einst = Werkzeuge.einstellungen(); einst.halteForm = false; einst.kritzelLoeschen = false; einst.druck = true;
          let n = 0;
          for (const p of striche) { ev('pointerdown', p[0][0] + 200, p[0][1]); for (const q of p.slice(1)) ev('pointermove', q[0] + 200, q[1]); const l = p[p.length - 1]; ev('pointerup', l[0] + 200, l[1]); n++; await new Promise(ok => setTimeout(ok, 15)); }
          await new Promise(ok => setTimeout(ok, 900));
          const e = lw.inhalt(lw.seiten()[0].id).e;
          return { striche: e.length, punkte: e.reduce((a, s) => a + s.p.length, 0) };
        };
        const orig = LHFormat.vereinfacheStrich;
        LHFormat.vereinfacheStrich = s => s;
        const roh = await zeichne('Roh');
        LHFormat.vereinfacheStrich = orig;
        const neu = await zeichne('Vereinfacht');
        return { roh, neu };
      })()`);
      await warte(800);
      const groesse = name => { const dir = path.join(WURZEL, 'Bibliothek', name, 'Handschrift'); return fs.readdirSync(dir).filter(f => f.endsWith('.lhz')).reduce((a, f) => a + fs.statSync(path.join(dir, f)).size, 0); };
      r.groesse.roh.datei = groesse('Roh'); r.groesse.neu.datei = groesse('Vereinfacht');
      r.groesse.punkteWeniger = Math.round(100 - 100 * r.groesse.neu.punkte / r.groesse.roh.punkte) + ' %';
      r.groesse.dateiKleiner = Math.round(100 - 100 * r.groesse.neu.datei / r.groesse.roh.datei) + ' %';
    } else if (MODUS === 'latenz') {
      r.latenzMs = [];
      for (let n = 1; n <= 6; n++) {
        const t0 = await js(`__strich(${n})`);
        let ms = null;
        for (let i = 0; i < 200 && ms === null; i++) { if (striche() >= n) ms = Date.now() - t0; else await warte(10); }
        r.latenzMs.push(ms);
        await warte(300);
      }
      // Absturz der Oberfläche: der Strich vor dem Absturz muss auf der Platte liegen
      const t1 = await js(`__strich(7)`);
      await warte(700);
      r.striche = striche();
      r.vorAbsturz = r.striche;
      wc.forcefullyCrashRenderer();
      await warte(800);
      r.nachAbsturz = striche();
    } else {
      // Strich zeichnen und das Fenster sofort schliessen, ohne zu warten
      await js(`__strich(1)`);
      fs.writeFileSync(path.join(AUS, 'erwartet.json'), JSON.stringify({ striche: 1 }));
      win.close();
      return;   // die App beendet sich selbst, wenn das Fenster zu ist
    }
  } catch (e) { r.fehler = String(e && e.stack || e); }
  fs.writeFileSync(path.join(AUS, 'speichern.json'), JSON.stringify(r, null, 2));
  app.exit(0);
});
