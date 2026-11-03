'use strict';
// Leistung auf einem langsamen Gerät: CPU 4-fach gebremst (DevTools-Protokoll), ein Notizbuch mit 3 dicht beschriebenen
// Seiten (je 400 Striche zu 120 Punkten, wie Handschrift mit dem Apple Pencil, ohne Punktreduktion). Gemessen werden:
// volles Neumalen, Scrollen (Bildzeiten), Schreiben (Zeit je Stiftereignis und Bildzeiten während eines Strichs).
// Aufruf: electron test/leistung.js <ausgabeordner> [bremse, Standard 4]
const { app, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');

const AUS = path.resolve(process.argv[2]);
const BREMSE = Number(process.argv[3]) || 4;
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
  win.setSize(1366, 1024);
  win.show(); win.focus();
  await new Promise(r => wc.once('did-finish-load', r));
  await warte(2000);
  const js = c => wc.executeJavaScript(c, true);
  const r = { bremse: BREMSE };
  try {
    await js(`(async () => {
      window.__warte = ms => new Promise(ok => setTimeout(ok, ms));
      const id = UI.neueId(), seiten = [UI.neueId(), UI.neueId(), UI.neueId()];
      // Handschrift: Zeilen aus Wellen, Druck schwankt, Punkte 1 bis 2 Einheiten auseinander
      for (const sid of seiten) {
        const e = [];
        for (let z = 0; z < 40; z++) for (let w = 0; w < 10; w++) {
          const p = [];
          for (let i = 0; i < 120; i++) p.push([40 + w * 72 + i * 0.55, 60 + z * 26 + Math.sin(i / 5 + w) * 6, Math.round((0.3 + 0.2 * Math.sin(i / 9)) * 32) / 32]);
          e.push({ id: UI.neueId(), w: 'stift', f: 'tinte', d: 1.7, m: Date.now(), p });
        }
        Daten.set('ink:' + id + ':' + sid, { e });
      }
      Bibliothek.speichere(id, { art: 'notizbuch', name: 'Leistung', eltern: null, format: 'A4', papier: 'karo', seitenfarbe: 'weiss', farbe: 'blau', seiten, erstellt: Date.now(), geoeffnet: 0, seite: 1, favorit: false });
      location.hash = '#/dok/' + id;
      for (let i = 0; i < 100 && !(Dokument.leinwand() && Dokument.leinwand().seiten().length === 3); i++) await __warte(100);
      await __warte(1500);
    })()`);
    wc.debugger.attach('1.3');
    await wc.debugger.sendCommand('Emulation.setCPUThrottlingRate', { rate: BREMSE });
    // volles Neumalen
    r.neumalen = await js(`(async () => {
      const lw = Dokument.leinwand(), zeiten = [];
      for (let i = 0; i < 5; i++) { const t = performance.now(); lw.plane(); await new Promise(ok => requestAnimationFrame(() => ok())); zeiten.push(performance.now() - t); }
      zeiten.sort((a, b) => a - b);
      return { median: Math.round(zeiten[2]), max: Math.round(zeiten[4]) };
    })()`);
    // Scrollen mit dem Rad
    r.scrollen = await js(`(async () => {
      const lw = Dokument.leinwand(), host = lw.el, rr = host.getBoundingClientRect();
      const zeiten = []; let letzte = performance.now(), lauf = true;
      const f = t => { zeiten.push(t - letzte); letzte = t; if (lauf) requestAnimationFrame(f); }; requestAnimationFrame(f);
      const vor = lw.statistik();
      for (let i = 0; i < 180; i++) { host.dispatchEvent(new WheelEvent('wheel', { deltaY: i < 90 ? 40 : -40, clientX: rr.left + 300, clientY: rr.top + 300, bubbles: true, cancelable: true })); await new Promise(ok => requestAnimationFrame(ok)); }
      lauf = false;
      const nach = lw.statistik();
      zeiten.sort((a, b) => b - a);
      return { bilder: zeiten.length, ueber20ms: zeiten.filter(z => z > 20).length, ueber33ms: zeiten.filter(z => z > 33).length, laengste: zeiten.slice(0, 5).map(Math.round), vollNeu: nach.voll - vor.voll, geschoben: (nach.geschoben || 0) - (vor.geschoben || 0) };
    })()`);
    // Genauigkeit: nach dem Scrollen (verschobenes Bild + Streifen) gegen ein ganz neu gemaltes Bild
    await wc.debugger.sendCommand('Emulation.setCPUThrottlingRate', { rate: 1 });
    const flaeche = await js(`(async () => {
      const lw = Dokument.leinwand(), host = lw.el, rr = host.getBoundingClientRect();
      for (let i = 0; i < 37; i++) { host.dispatchEvent(new WheelEvent('wheel', { deltaY: 23, clientX: rr.left + 300, clientY: rr.top + 300, bubbles: true, cancelable: true })); await new Promise(ok => requestAnimationFrame(ok)); }
      await __warte(150);
      const b = lw.el.getBoundingClientRect(); return { x: Math.round(b.left) + 2, y: Math.round(b.top) + 2, width: Math.round(b.width) - 4, height: Math.round(b.height) - 4 };
    })()`);
    const bildA = await wc.capturePage(flaeche); fs.writeFileSync(path.join(AUS, 'nach-scrollen.png'), bildA.toPNG()); const A = bildA.toBitmap();
    await js(`(async () => { Dokument.leinwand().neuAnDerStelle(); await new Promise(ok => requestAnimationFrame(() => requestAnimationFrame(ok))); })()`);
    const bildB = await wc.capturePage(flaeche); fs.writeFileSync(path.join(AUS, 'neu-gemalt.png'), bildB.toPNG()); const B = bildB.toBitmap();
    let anders = 0; const orte = []; const breiteA = bildA.getSize().width * (A.length / 4 / (bildA.getSize().width * bildA.getSize().height)) ** 0.5; for (let i = 0; i < A.length; i += 4) if (Math.abs(A[i] - B[i]) + Math.abs(A[i + 1] - B[i + 1]) + Math.abs(A[i + 2] - B[i + 2]) > 24) { anders++; if (orte.length < 30) orte.push([(i / 4) % Math.round(breiteA), Math.floor((i / 4) / Math.round(breiteA))]); }
    r.genauigkeit = { verschiedenePixel: anders, pixel: A.length / 4, orte, breite: Math.round(breiteA) };
    await wc.debugger.sendCommand('Emulation.setCPUThrottlingRate', { rate: BREMSE });
    // Schreiben: Zeit je Ereignis und Bildzeiten (mit Profiler: was läuft beim ersten Strich?)
    await wc.debugger.sendCommand('Profiler.enable'); await wc.debugger.sendCommand('Profiler.setSamplingInterval', { interval: 200 }); await wc.debugger.sendCommand('Profiler.start');
    r.schreiben = await js(`(async () => {
      const lw = Dokument.leinwand(); lw.setzeWerkzeug('stift');
      const cv = document.querySelector('.dok-bereich:not([hidden]) .lw-canvas');
      cv.setPointerCapture = () => {}; cv.releasePointerCapture = () => {}; cv.hasPointerCapture = () => true;
      const hr = cv.parentElement.getBoundingClientRect();
      const ev = (typ, x, y) => cv.dispatchEvent(new PointerEvent(typ, { pointerId: 9, pointerType: 'pen', isPrimary: true, clientX: hr.left + x, clientY: hr.top + y, pressure: typ === 'pointerup' ? 0 : 0.45, buttons: typ === 'pointerup' ? 0 : 1, button: 0, bubbles: true, cancelable: true }));
      const zeiten = [], wo = []; let letzte = performance.now(), lauf = true, stand = 'vor';
      const f = t => { zeiten.push(t - letzte); if (t - letzte > 30) wo.push([stand, Math.round(t - letzte)]); letzte = t; if (lauf) requestAnimationFrame(f); }; requestAnimationFrame(f);
      const ereignis = [];
      await new Promise(ok => requestAnimationFrame(() => requestAnimationFrame(ok)));
      stand = 'unten'; const stat0 = lw.statistik();
      ev('pointerdown', 200, 400);
      // langer Strich: 600 Punkte, 4 je Bild (wie 240 Hz)
      for (let i = 1; i <= 600; i++) {
        stand = 'zug ' + i; const t = performance.now(); ev('pointermove', 200 + i * 1.2, 400 + Math.sin(i / 8) * 30); ereignis.push(performance.now() - t);
        if (i % 4 === 0) await new Promise(ok => requestAnimationFrame(ok));
      }
      stand = 'auf'; const t = performance.now(); ev('pointerup', 920, 400); const auf = performance.now() - t; stand = 'danach';
      await __warte(400); lauf = false;
      zeiten.sort((a, b) => b - a); ereignis.sort((a, b) => b - a);
      return { bilder: zeiten.length, ueber20ms: zeiten.filter(z => z > 20).length, laengsteBilder: zeiten.slice(0, 5).map(Math.round), ereignisMax: Math.round(ereignis[0] * 10) / 10, ereignisMedian: Math.round(ereignis[ereignis.length >> 1] * 100) / 100, absetzenMs: Math.round(auf), lange: wo, statistik: Object.fromEntries(Object.entries(lw.statistik()).map(([k, v]) => [k, v - (stat0[k] || 0)])) };
    })()`);
    const prof = (await wc.debugger.sendCommand('Profiler.stop')).profile;
    const zeit = new Map(), dt = {}; const proKnoten = new Map(prof.nodes.map(n => [n.id, n]));
    prof.samples.forEach((id, i) => { const n = proKnoten.get(id); const k = (n.callFrame.functionName || '(anonym)') + ' ' + (n.callFrame.url || '').split('/').pop() + ':' + n.callFrame.lineNumber; zeit.set(k, (zeit.get(k) || 0) + (prof.timeDeltas[i] || 0)); });
    r.profil = [...zeit.entries()].sort((a, b) => b[1] - a[1]).slice(0, 25).map(([k, v]) => [k, Math.round(v / 1000)]);
    await wc.debugger.sendCommand('Emulation.setCPUThrottlingRate', { rate: 1 });
  } catch (e) { r.fehler = String(e && e.stack || e); }
  fs.writeFileSync(path.join(AUS, 'leistung.json'), JSON.stringify(r, null, 2));
  app.exit(0);
});
