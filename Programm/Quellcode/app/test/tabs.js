'use strict';
// Prüflauf für viele offene Dokumente: alle Tabs in einem waagrecht scrollbaren Band, etwa 5 zu sehen (schmal weniger);
// Mausrad/Touchpad, Pfeile und Finger scrollen das Band; das Dropdown zeigt, was nicht zu sehen ist, Auswahl öffnet und
// scrollt den Tab ins Bild, × im Dropdown schliesst. Eigener Testordner.
// Aufruf: electron test/tabs.js <ausgabeordner>
// Schreibt Fotos und tabs.json. Vorher Lernheft schliessen (Port 47823).
const { app, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');

const AUS = path.resolve(process.argv[2]);
const WURZEL = path.join(AUS, 'Lernheft');
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
  wc.setBackgroundThrottling(false);
  const log = [];
  wc.on('console-message', (e, l, m) => { if (l >= 2) log.push(m); });
  win.setSize(1500, 900);
  win.show(); win.focus();
  await new Promise(r => wc.once('did-finish-load', r));
  await warte(2000);
  const js = c => wc.executeJavaScript(c, true);
  const foto = async n => { await warte(500); fs.writeFileSync(path.join(AUS, n + '.png'), (await wc.capturePage()).toPNG()); };
  const r = {};
  try {
    await js(`(async () => {
      window.__ids = [];
      for (let i = 1; i <= 8; i++) { const id = UI.neueId(); __ids.push(id); Bibliothek.speichere(id, { art: 'notizbuch', name: 'Notizbuch ' + i, eltern: null, format: 'A4', papier: 'karo', farbe: 'blau', seiten: [UI.neueId()], erstellt: Date.now(), geoeffnet: 0, seite: 1, favorit: false }); }
      for (const id of __ids) { location.hash = '#/dok/' + id; await new Promise(ok => setTimeout(ok, 500)); }
      await new Promise(ok => setTimeout(ok, 800));
      window.__stand = () => { const b = document.querySelector('.tab-band'), r = b.getBoundingClientRect(); const ganz = [...b.querySelectorAll('.dok-tab')].filter(x => { const q = x.getBoundingClientRect(); return q.left >= r.left - 2 && q.right <= r.right + 2; }); const m = document.querySelector('[data-tab-mehr]'), p = s => { const k = document.querySelector('[data-tab-pfeil="' + s + '"]'); return !k.hidden && k.style.visibility !== 'hidden'; }; return { oben: ganz.map(x => x.querySelector('.dok-tab-name').textContent), alle: b.querySelectorAll('.dok-tab').length, mehr: m.hidden || m.style.visibility === 'hidden' ? null : m.textContent, pfeile: [p(-1), p(1)], scrollLeft: Math.round(b.scrollLeft), aktiv: (document.querySelector('.dok-tab[aria-selected="true"] .dok-tab-name') || {}).textContent || null, hash: location.hash }; };
    })()`);
    r.acht = await js('__stand()');
    // Mausrad nach oben/unten scrollt das Band waagrecht, Pfeil links springt zurück
    r.rad = await js(`(async () => { const b = document.querySelector('.tab-band'); b.dispatchEvent(new WheelEvent('wheel', { deltaY: -2000, bubbles: true, cancelable: true })); await new Promise(ok => setTimeout(ok, 300)); return __stand(); })()`);
    r.pfeil = await js(`(async () => { document.querySelector('[data-tab-pfeil="1"]').click(); await new Promise(ok => setTimeout(ok, 700)); return __stand(); })()`);
    // Finger: echtes Wischen nach links auf dem Band (über das DevTools-Protokoll)
    await js(`(async () => { document.querySelector('.tab-band').scrollLeft = 0; await new Promise(ok => setTimeout(ok, 300)); })()`);
    wc.debugger.attach('1.3');
    await wc.debugger.sendCommand('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
    const y = 40, tp = x => [{ x, y, id: 1, radiusX: 8, radiusY: 8 }];
    await wc.debugger.sendCommand('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: tp(900) });
    for (let i = 1; i <= 14; i++) { await wc.debugger.sendCommand('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: tp(900 - i * 35) }); await warte(16); }
    await wc.debugger.sendCommand('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await warte(900);
    r.finger = await js('__stand()');
    await wc.debugger.sendCommand('Emulation.setTouchEmulationEnabled', { enabled: false });
    wc.debugger.detach();
    await js(`(async () => { document.querySelector('.tab-band').scrollLeft = 0; await new Promise(ok => setTimeout(ok, 300)); })()`);
    await foto('01-acht-offen');
    r.dropdown = await js(`(async () => {
      document.querySelector('[data-tab-mehr]').click(); await new Promise(ok => setTimeout(ok, 200));
      return [...document.querySelectorAll('.tab-wahl [data-tab-wahl] .tab-wahl-name')].map(s => s.textContent);
    })()`);
    await foto('02-dropdown');
    r.auswahl = await js(`(async () => {
      const k = [...document.querySelectorAll('.tab-wahl [data-tab-wahl]')][0], name = k.querySelector('.tab-wahl-name').textContent;
      k.click(); await new Promise(ok => setTimeout(ok, 900));
      return { gewaehlt: name, ...__stand(), offen: Dokument.leinwand() && Dokument.leinwand().seiten().length };
    })()`);
    r.schliessen = await js(`(async () => {
      document.querySelector('[data-tab-mehr]').click(); await new Promise(ok => setTimeout(ok, 200));
      const zeilen = document.querySelectorAll('.tab-wahl .tab-wahl-zeile').length;
      document.querySelector('.tab-wahl [data-tab-weg]').click(); await new Promise(ok => setTimeout(ok, 500));
      return { zeilenVorher: zeilen, ...__stand() };
    })()`);
    r.startseite = await js(`(async () => { location.hash = '#/bibliothek'; await new Promise(ok => setTimeout(ok, 700)); return __stand(); })()`);
    await foto('03-startseite');
    win.setSize(820, 900);
    await warte(900);
    r.schmal = await js('__stand()');
    await foto('04-schmal');
  } catch (e) {
    r.fehler = String(e && e.stack || e);
  }
  r.log = log;
  fs.writeFileSync(path.join(AUS, 'tabs.json'), JSON.stringify(r, null, 2));
  app.exit(0);
});
