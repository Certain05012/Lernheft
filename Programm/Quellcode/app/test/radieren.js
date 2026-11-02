'use strict';
// Prüflauf für Reste beim Radieren (feine Rechtecke um übrig gebliebene Strichstücke): auf einer weissen Notizbuch-Seite
// wird bei mehreren Zoomstufen ein Strich teilweise wegradiert. Danach wird das Bild auf dem Bildschirm (capturePage)
// mit dem Bild nach vollständigem Neumalen verglichen; jeder abweichende Bildpunkt wäre ein sichtbarer Rest.
// Aufruf: electron test/radieren.js <ausgabeordner> [skalierung, z. B. 1.5 wie Windows 150 %]
// Schreibt radieren.json und Fotos der Abweichungen. Vorher Lernheft schliessen (Port 47823).
const { app, BrowserWindow, nativeImage } = require('electron');
const path = require('path');
const fs = require('fs');

const AUS = path.resolve(process.argv[2]);
const SKALA = Number(process.argv[3]) || 0;
if (SKALA) app.commandLine.appendSwitch('force-device-scale-factor', String(SKALA));
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
  const log = [];
  wc.on('console-message', (e, l, m) => { if (l >= 2) log.push(m); });
  win.setSize(1300, 900);
  win.show(); win.focus();
  await new Promise(r => wc.once('did-finish-load', r));
  await warte(2000);
  const js = c => wc.executeJavaScript(c, true);
  const r = { skala: SKALA || 1, zoom: [] };
  // Bild der Schreibfläche auf dem Bildschirm
  const bild = async rect => (await wc.capturePage(rect)).toBitmap();
  try {
    await js(`(async () => {
      // Für jede Zoomstufe ein neues, leeres Notizbuch mit weissen Seiten
      window.__neu = async () => {
        const id = UI.neueId(), s1 = UI.neueId();
        Bibliothek.speichere(id, { art: 'notizbuch', name: 'Radieren ' + id, eltern: null, format: 'A4', papier: 'blanko', seitenfarbe: 'weiss', farbe: 'blau', seiten: [s1], erstellt: Date.now(), geoeffnet: 0, seite: 1, favorit: false });
        location.hash = '#/dok/' + id;
        for (let i = 0; i < 80 && !(Dokument.leinwand() && Dokument.leinwand().seiten().length && Dokument.leinwand().seiten()[0].id === s1); i++) await new Promise(ok => setTimeout(ok, 100));
        await new Promise(ok => setTimeout(ok, 1000));
      };
      window.__mal = async (pts) => {
        const cv = document.querySelector('.dok-bereich:not([hidden]) .lw-canvas');
        cv.setPointerCapture = () => {}; cv.releasePointerCapture = () => {}; cv.hasPointerCapture = () => true;
        const hr = cv.parentElement.getBoundingClientRect();
        const ev = (typ, x, y) => new PointerEvent(typ, { pointerId: 7, pointerType: 'pen', isPrimary: true, clientX: hr.left + x, clientY: hr.top + y, pressure: typ === 'pointerup' ? 0 : 0.5, buttons: typ === 'pointerup' ? 0 : 1, button: 0, bubbles: true, cancelable: true });
        cv.dispatchEvent(ev('pointerdown', pts[0][0], pts[0][1]));
        for (const p of pts.slice(1)) { cv.dispatchEvent(ev('pointermove', p[0], p[1])); await new Promise(ok => setTimeout(ok, 8)); }
        const l = pts[pts.length - 1];
        cv.dispatchEvent(ev('pointerup', l[0], l[1]));
        await new Promise(ok => setTimeout(ok, 350));
      };
      window.__flaeche = () => { const b = document.querySelector('.dok-bereich:not([hidden]) .dok-flaeche').getBoundingClientRect(); return { x: Math.round(b.left) + 2, y: Math.round(b.top) + 2, width: Math.round(b.width) - 4, height: Math.round(b.height) - 4 }; };
    })()`);
    for (const z of [0.83, 1, 1.13, 1.37, 1.71, 2.3]) {
      const flaeche = await js(`(async () => {
        await __neu();
        const lw = Dokument.leinwand();
        // Zoomen, Ansicht ruhen lassen
        lw.setzeWerkzeug('stift');
        const a = lw.merkAnsicht(); lw.setzeAnsicht({ s: ${z}, dx: a.dx, dy: 30 });
        await new Promise(ok => setTimeout(ok, 700));
        lw.plane();
        await new Promise(ok => setTimeout(ok, 300));
        // Drei Striche, dann quer hindurch radieren, so dass kurze Stücke übrig bleiben
        for (let k = 0; k < 3; k++) { const p = []; for (let i = 0; i <= 50; i++) p.push([380 + i * 6.1, 230 + k * 47.3 + Math.sin(i / 4) * 9]); await __mal(p); }
        lw.setzeRadiermodus('bereich'); lw.setzeWerkzeug('radierer');
        for (const x of [430.4, 512.7, 597.3]) { const p = []; for (let i = 0; i <= 30; i++) p.push([x + i * 0.9, 200 + i * 7.7]); await __mal(p); }
        lw.setzeWerkzeug('stift');
        await new Promise(ok => setTimeout(ok, 500));
        return __flaeche();
      })()`);
      const vorher = await bild(flaeche);
      await js(`(async () => { Dokument.leinwand().plane(); await new Promise(ok => setTimeout(ok, 400)); })()`);
      const nachher = await bild(flaeche);
      let n = 0, max = 0;
      const marke = Buffer.from(nachher);
      for (let i = 0; i < vorher.length; i += 4) {
        const d = Math.abs(vorher[i] - nachher[i]) + Math.abs(vorher[i + 1] - nachher[i + 1]) + Math.abs(vorher[i + 2] - nachher[i + 2]);
        if (d > 6) { n++; marke[i] = 0; marke[i + 1] = 0; marke[i + 2] = 255; }
        if (d > max) max = d;
      }
      r.zoom.push({ zoom: z, abweichendePunkte: n, groessteAbweichung: max });
      const groesse = (await wc.capturePage(flaeche)).getSize();
      fs.writeFileSync(path.join(AUS, `zoom-${z}-vorher.png`), nativeImage.createFromBitmap(Buffer.from(vorher), groesse).toPNG());
      if (n) fs.writeFileSync(path.join(AUS, `zoom-${z}-reste.png`), nativeImage.createFromBitmap(marke, groesse).toPNG());
    }
  } catch (e) {
    r.fehler = String(e && e.stack || e);
  }
  r.log = log;
  fs.writeFileSync(path.join(AUS, 'radieren.json'), JSON.stringify(r, null, 2));
  app.exit(0);
});
