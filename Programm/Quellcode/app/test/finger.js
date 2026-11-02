'use strict';
// Prüflauf für das Scrollen mit dem Finger, mit echten Touch-Eingaben (wie ein Touchscreen, über das DevTools-Protokoll):
// Startseite (Seite scrollt), Dokument (ein Finger verschiebt, wenn "mit dem Finger schreiben" aus ist), Seitenleiste
// der PDFs. Eigener Testordner, fasst die echten Daten nicht an.
// Aufruf: electron test/finger.js <ausgabeordner> [vorlage mit Bibliothek und Daten]
// Schreibt finger.json. Vorher Lernheft schliessen (Port 47823).
const { app, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');

const AUS = path.resolve(process.argv[2]);
const VORLAGE = process.argv[3] && process.argv[3] !== '-' ? path.resolve(process.argv[3]) : null;
const WURZEL = path.join(AUS, 'Lernheft');
fs.rmSync(AUS, { recursive: true, force: true });
fs.mkdirSync(path.join(WURZEL, 'Programm'), { recursive: true });
if (VORLAGE) for (const t of ['Bibliothek', 'Daten']) if (fs.existsSync(path.join(VORLAGE, t))) fs.cpSync(path.join(VORLAGE, t), path.join(WURZEL, t), { recursive: true });
app.setPath('userData', path.join(AUS, 'profil'));
process.env.LERNHEFT_ORDNER = WURZEL;
process.env.LERNHEFT_SEITE = path.join(__dirname, '..', '..', 'webseite');
const warte = ms => new Promise(r => setTimeout(r, ms));
require('../main.js');

app.whenReady().then(async () => {
  let win;
  for (let i = 0; i < 100 && !win; i++) { win = BrowserWindow.getAllWindows()[0]; if (!win) await warte(100); }
  const wc = win.webContents;
  wc.setBackgroundThrottling(false);
  const log = [];
  wc.on('console-message', (e, l, m) => { if (l >= 2) log.push(m); });
  win.setSize(1300, 860);
  win.show(); win.focus();
  await new Promise(r => wc.once('did-finish-load', r));
  await warte(2000);
  const js = c => wc.executeJavaScript(c, true);
  wc.debugger.attach('1.3');
  const cdp = (m, p) => wc.debugger.sendCommand(m, p);
  await cdp('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  // Ein Finger wischt von (x, y0) nach (x, y1)
  async function wisch(x, y0, y1, schritte = 14) {
    await cdp('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y: y0, id: 1, radiusX: 8, radiusY: 8 }] });
    for (let i = 1; i <= schritte; i++) { await cdp('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: y0 + (y1 - y0) * i / schritte, id: 1, radiusX: 8, radiusY: 8 }] }); await warte(16); }
    await cdp('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await warte(700);
  }
  const r = {};
  try {
    // Startseite mit vielen Einträgen
    await js(`(async () => {
      for (let i = 0; i < 30; i++) Bibliothek.speichere(UI.neueId(), { art: 'notizbuch', name: 'Füller ' + i, eltern: null, format: 'A4', papier: 'karo', farbe: 'blau', seiten: [UI.neueId()], erstellt: Date.now(), geoeffnet: Date.now(), seite: 1, favorit: false });
      location.hash = '#/bibliothek'; await new Promise(ok => setTimeout(ok, 1200));
    })()`);
    const vorher = await js('scrollY');
    await wisch(800, 700, 250);
    r.startseite = { vorher, nachher: await js('scrollY'), schieberZiel: await js(`(() => { const e = document.elementFromPoint(800, 500); return e && (e.className || e.tagName); })()`) };
    // Dokument: ein Notizbuch mit 8 Seiten, Werkzeug Stift, Finger schreibt nicht
    r.dokument = await js(`(async () => {
      const id = UI.neueId();
      Bibliothek.speichere(id, { art: 'notizbuch', name: 'Finger-Test', eltern: null, format: 'A4', papier: 'karo', farbe: 'blau', seiten: Array.from({ length: 8 }, () => UI.neueId()), erstellt: Date.now(), geoeffnet: 0, seite: 1, favorit: false });
      location.hash = '#/dok/' + id;
      for (let i = 0; i < 80 && !(Dokument.leinwand() && Dokument.leinwand().seiten().length === 8); i++) await new Promise(ok => setTimeout(ok, 100));
      await new Promise(ok => setTimeout(ok, 1200));
      const lw = Dokument.leinwand(); lw.einst.finger = false; lw.setzeWerkzeug('stift');
      return { y: lw.ansicht().y, ziel: (() => { const e = document.elementFromPoint(650, 520); return e && e.className; })() };
    })()`);
    await wisch(650, 700, 300);
    r.dokument.nachStift = await js(`({ y: Dokument.leinwand().ansicht().y, striche: Dokument.leinwand().seiten().reduce((n, s) => n + Dokument.leinwand().inhalt(s.id).e.length, 0) })`);
    await js(`Dokument.leinwand().setzeWerkzeug('hand')`);
    await wisch(650, 700, 300);
    r.dokument.nachHand = await js(`({ y: Dokument.leinwand().ansicht().y })`);
    // Am rechten Rand (wo der Schieber sitzt, gerade sichtbar) wischen: scrollt normal, springt nicht
    const yVor = await js(`Dokument.leinwand().ansicht().y`);
    r.dokument.schieberDaVorher = await js(`document.querySelector('.dok-bereich:not([hidden]) .lw-schieber').classList.contains('da')`);
    await wisch(1272, 700, 300);
    r.dokument.amRand = { vorher: yVor, nachher: await js(`Dokument.leinwand().ansicht().y`) };
    r.dokument.amRand.bewegt = Math.round(r.dokument.amRand.nachher - yVor);
    // Startseite: am rechten Rand wischen
    await js(`(async () => { location.hash = '#/bibliothek'; await new Promise(ok => setTimeout(ok, 900)); scrollTo(0, 0); await new Promise(ok => setTimeout(ok, 300)); })()`);
    await wisch(800, 600, 400);
    const sVor = await js('scrollY');
    await wisch(1288, 650, 350);
    r.startseiteAmRand = { vorher: sVor, nachher: await js('scrollY') };
  } catch (e) {
    r.fehler = String(e && e.stack || e);
  }
  r.log = log;
  fs.writeFileSync(path.join(AUS, 'finger.json'), JSON.stringify(r, null, 2));
  app.exit(0);
});
