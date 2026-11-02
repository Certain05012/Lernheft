'use strict';
// Messung des Starts: wie lange brauchen Hauptprozess, Ablage, Server, Fenster und die Oberfläche bis zur fertigen Bibliothek?
// Aufruf: electron test/start.js <ausgabeordner> [ordner-mit-Bibliothek-und-Daten]    (vorher Lernheft schliessen, Port 47823)
// Schreibt start.json in den Ausgabeordner. Mit dem 3. Argument "offline" werden Anfragen ins Internet blockiert
// (so verhält sich ein Start ohne Netz oder mit langsamem Netz).
const { app, BrowserWindow, session } = require('electron');
const path = require('path');
const fs = require('fs');

const T0 = Date.now();
const AUS = path.resolve(process.argv[2]);
const VORLAGE = process.argv[3] && !process.argv[3] === 'offline' ? path.resolve(process.argv[3]) : null;
const OFFLINE = process.argv.includes('offline');
const WURZEL = path.join(AUS, 'Lernheft');
fs.rmSync(AUS, { recursive: true, force: true });
fs.mkdirSync(path.join(WURZEL, 'Programm'), { recursive: true });
if (VORLAGE) for (const t of ['Bibliothek', 'Daten']) if (fs.existsSync(path.join(VORLAGE, t))) fs.cpSync(path.join(VORLAGE, t), path.join(WURZEL, t), { recursive: true });
app.setPath('userData', path.join(AUS, 'profil'));
process.env.LERNHEFT_ORDNER = WURZEL;
process.env.LERNHEFT_SEITE = path.join(__dirname, '..', '..', 'webseite');

const z = { start: 0 };
const marke = n => { z[n] = Date.now() - T0; };
// Ablage und Server messen, bevor main.js sie holt
const ablage = require('../ablage');
const orig = ablage.erstelleAblage;
ablage.erstelleAblage = (...a) => { const t = Date.now(); const r = orig(...a); z.ablageDauer = Date.now() - t; return r; };
const server = require('../server');
const origS = server.starteServer;
server.starteServer = async (...a) => { const t = Date.now(); const r = await origS(...a); z.serverDauer = Date.now() - t; return r; };
marke('moduleGeladen');
require('../main.js');
marke('mainGeladen');

app.whenReady().then(async () => {
  marke('electronBereit');
  if (OFFLINE) session.defaultSession.webRequest.onBeforeRequest({ urls: ['http://*/*', 'https://*/*'] }, (d, cb) => cb({ cancel: true }));
  let win;
  for (let i = 0; i < 300 && !win; i++) { win = BrowserWindow.getAllWindows()[0]; if (!win) await new Promise(r => setTimeout(r, 10)); }
  marke('fensterErzeugt');
  const wc = win.webContents;
  for (const ev of ['did-start-navigation', 'did-navigate', 'did-frame-navigate', 'render-process-gone']) wc.on(ev, () => { (z.ereignisse = z.ereignisse || []).push([ev, Date.now() - T0]); });
  wc.once('did-start-loading', () => marke('ladenBegonnen'));
  wc.once('dom-ready', () => marke('domBereit'));
  wc.once('did-finish-load', () => marke('ladenFertig'));
  wc.once('did-frame-finish-load', () => marke('frameFertig'));
  const js = c => wc.executeJavaScript(c, true);
  // Bis die Oberfläche fertig ist und die Karten der Bibliothek da sind
  for (let i = 0; i < 2000; i++) {
    let fertig = false;
    try { fertig = await js(`document.documentElement.classList.contains('bereit') && document.querySelectorAll('.karte').length > 0`); } catch (e) { fertig = false; }
    if (fertig) break;
    await new Promise(r => setTimeout(r, 10));
  }
  marke('bibliothekFertig');
  await new Promise(r => setTimeout(r, 1500));
  z.renderer = await js(`(() => {
    const nav = performance.getEntriesByType('navigation')[0] || {};
    const navigation = Object.fromEntries(['startTime', 'fetchStart', 'domainLookupStart', 'connectStart', 'connectEnd', 'requestStart', 'responseStart', 'responseEnd', 'domInteractive', 'domContentLoadedEventStart', 'domContentLoadedEventEnd', 'loadEventEnd'].map(k => [k, Math.round(nav[k] || 0)]));
    const paint = Object.fromEntries(performance.getEntriesByType('paint').map(p => [p.name, Math.round(p.startTime)]));
    const res = performance.getEntriesByType('resource').map(r => ({ name: r.name.replace(location.origin, ''), start: Math.round(r.startTime), dauer: Math.round(r.duration), groesse: r.transferSize || r.encodedBodySize || 0 })).sort((a, b) => (b.start + b.dauer) - (a.start + a.dauer));
    return { navigation, dom: Math.round(nav.domContentLoadedEventEnd || 0), load: Math.round(nav.loadEventEnd || 0), paint, ressourcen: res.slice(0, 40), anzahl: res.length };
  })()`);
  fs.writeFileSync(path.join(AUS, 'start.json'), JSON.stringify(z, null, 2));
  app.exit(0);
});
