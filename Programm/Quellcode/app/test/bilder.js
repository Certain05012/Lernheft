'use strict';
// Prüflauf für Bilder: einfügen (Datei, Zwischenablage über das Menü, Strg+V, Ziehen aus dem Explorer nachgebildet),
// gespeichert in der Seitendatei, nach dem Neuladen wieder da, Grösse ändern an der Ecke (Maus und Finger, Seitenverhältnis
// bleibt), verschieben, langes Drücken mit dem Finger (Menü bzw. Auswahl), Rechtsklick, Rückgängig, Schreiben und Radieren
// auf dem Bild, Lasso-Tippen, Export als PNG und PDF. Eigener Testordner, fasst die echten Daten nicht an.
// Aufruf: electron test/bilder.js <ausgabeordner>
// Schreibt bilder.json und Fotos. Vorher Lernheft schliessen (Port 47823).
const { app, BrowserWindow, clipboard, nativeImage } = require('electron');
const path = require('path');
const fs = require('fs');
const zlib = require('zlib');

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
  win.setSize(1300, 900);
  win.show(); win.focus();
  await new Promise(r => wc.once('did-finish-load', r));
  await warte(2000);
  const js = c => wc.executeJavaScript(c, true);
  wc.debugger.attach('1.3');
  const cdp = (m, p) => wc.debugger.sendCommand(m, p);
  const foto = async name => fs.writeFileSync(path.join(AUS, name + '.png'), (await wc.capturePage()).toPNG());
  const maus = async (type, x, y, o = {}) => cdp('Input.dispatchMouseEvent', { type, x, y, button: o.button || 'left', buttons: o.buttons == null ? (type === 'mouseReleased' ? 0 : 1) : o.buttons, clickCount: 1 });
  async function ziehe(x0, y0, x1, y1, schritte = 12) {
    await maus('mouseMoved', x0, y0, { buttons: 0 });
    await maus('mousePressed', x0, y0);
    for (let i = 1; i <= schritte; i++) { await maus('mouseMoved', x0 + (x1 - x0) * i / schritte, y0 + (y1 - y0) * i / schritte); await warte(16); }
    await maus('mouseReleased', x1, y1);
    await warte(300);
  }
  const touch = (type, pts) => cdp('Input.dispatchTouchEvent', { type, touchPoints: pts.map(([x, y], i) => ({ x, y, id: i + 1, radiusX: 8, radiusY: 8 })) });
  async function fingerZieht(x0, y0, x1, y1, schritte = 12) {
    await touch('touchStart', [[x0, y0]]);
    for (let i = 1; i <= schritte; i++) { await touch('touchMove', [[x0 + (x1 - x0) * i / schritte, y0 + (y1 - y0) * i / schritte]]); await warte(16); }
    await touch('touchEnd', []);
    await warte(300);
  }
  async function langDruecken(x, y, ms = 800) {
    await touch('touchStart', [[x, y]]);
    await warte(ms);
    await touch('touchEnd', []);
    await warte(250);
  }
  const bilder = `(() => { const lw = Dokument.leinwand(); return lw.seiten().flatMap(s => lw.inhalt(s.id).e.filter(e => e.typ === 'bild').map(e => ({ sid: s.id, id: e.id, x: e.x, y: e.y, b: e.b, h: e.h, art: e.src.slice(5, 15), kb: Math.round(e.src.length / 1024) }))); })()`;
  const menue = `(() => { const m = document.querySelector('.lw-notiz-kontext'); return m ? m.textContent.replace(/\\s+/g, ' ').trim() : null; })()`;
  const r = {};
  try {
    await cdp('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
    // Notizbuch mit zwei Seiten öffnen, ein Testbild (Farbflächen, 1200 x 800) einfügen
    r.dok = await js(`(async () => {
      const id = UI.neueId();
      Bibliothek.speichere(id, { art: 'notizbuch', name: 'Bilder-Test', eltern: null, format: 'A4', papier: 'karo', farbe: 'blau', seiten: [UI.neueId(), UI.neueId()], erstellt: Date.now(), geoeffnet: 0, seite: 1, favorit: false });
      location.hash = '#/dok/' + id;
      for (let i = 0; i < 80 && !(Dokument.leinwand() && Dokument.leinwand().seiten().length === 2); i++) await new Promise(ok => setTimeout(ok, 100));
      await new Promise(ok => setTimeout(ok, 800));
      const cv = document.createElement('canvas'); cv.width = 1200; cv.height = 800;
      const c = cv.getContext('2d');
      c.fillStyle = '#e03c31'; c.fillRect(0, 0, 600, 800); c.fillStyle = '#1f6fd1'; c.fillRect(600, 0, 600, 800);
      c.fillStyle = '#ffffff'; c.font = 'bold 120px sans-serif'; c.fillText('Bild', 450, 440);
      window.__testBlob = await new Promise(ok => cv.toBlob(ok, 'image/png'));
      const lw = Dokument.leinwand(); lw.setzeWerkzeug('stift');
      const t0 = performance.now();
      const ok = await lw.fuegeBildEin(window.__testBlob);
      return { id, ok, ms: Math.round(performance.now() - t0), zustand: lw.zustand(), papierB: lw.seiten()[0].b };
    })()`);
    r.eingefuegt = await js(bilder);
    await warte(800);
    await foto('1-eingefuegt');
    // In der Seitendatei?
    const dokOrdner = path.join(WURZEL, 'Bibliothek', 'Bilder-Test', 'Handschrift');
    const datei = fs.existsSync(dokOrdner) ? fs.readdirSync(dokOrdner).find(n => n.endsWith('.lhz')) : null;
    if (datei) {
      const o = JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(dokOrdner, datei))).toString('utf8'));
      r.datei = { name: datei, kb: Math.round(fs.statSync(path.join(dokOrdner, datei)).size / 1024), elemente: o.e.map(e => ({ k: e.k, b: e.b, h: e.h, src: (e.src || '').slice(0, 22) })) };
    } else r.datei = null;

    // Grösser ziehen an der Ecke unten rechts (Maus): Seitenverhältnis bleibt
    let z = await js('Dokument.leinwand().zustand()');
    const vor = (await js(bilder))[0];
    await ziehe(z.ecke[0], z.ecke[1], z.ecke[0] - 120, z.ecke[1] - 40);
    const nach = (await js(bilder))[0];
    r.skalierenMaus = { vor, nach, verhaeltnisVor: +(vor.b / vor.h).toFixed(3), verhaeltnisNach: +(nach.b / nach.h).toFixed(3), kleiner: nach.b < vor.b };
    // Verschieben (Maus in der Mitte der Auswahl)
    const mitte = await js(`(() => { const z = Dokument.leinwand().zustand(); const r = Dokument.leinwand().el.getBoundingClientRect(); return [z.ecke[0] - z.breite / 2, z.ecke[1] - 40]; })()`);
    await ziehe(mitte[0], mitte[1], mitte[0] + 60, mitte[1] + 30);
    const verschoben = (await js(bilder))[0];
    r.verschieben = { dx: +(verschoben.x - nach.x).toFixed(1), dy: +(verschoben.y - nach.y).toFixed(1), b: verschoben.b };
    // Mit dem Finger an der Ecke grösser ziehen
    z = await js('Dokument.leinwand().zustand()');
    await fingerZieht(z.ecke[0], z.ecke[1], z.ecke[0] + 90, z.ecke[1] + 60);
    const finger = (await js(bilder))[0];
    r.skalierenFinger = { vor: verschoben.b, nach: finger.b, verhaeltnis: +(finger.b / finger.h).toFixed(3), groesser: finger.b > verschoben.b };
    await foto('2-skaliert');

    // Auswahl aufheben (Tippen mit dem Stift-Werkzeug daneben), dann langes Drücken auf leerer Fläche: Menü
    await js(`Dokument.leinwand().auswahlLeeren()`);
    // Ein Punkt unter dem Bild auf der ersten Seite, ins Bild geholt
    const leer = await js(`(() => {
      const lw = Dokument.leinwand(); const s = lw.seiten()[0], e = lw.inhalt(s.id).e.find(x => x.typ === 'bild');
      const yDok = s.y + e.y + e.h + 120;
      const a0 = lw.ansicht(); lw.setzeAnsicht({ s: a0.s, dx: (a0.x - a0.b / 2) / a0.s, dy: yDok - 300 / a0.s });
      const a = lw.ansicht(), r = lw.el.getBoundingClientRect();
      return [r.left + (s.x + s.b / 2) * a.s + a.x, r.top + yDok * a.s + a.y];
    })()`);
    await warte(300);
    await langDruecken(leer[0], leer[1]);
    r.langLeer = { menue: await js(menue), auswahl: (await js('Dokument.leinwand().zustand()')).auswahl };
    await foto('3-menue-lang');
    // Menü: "Bild aus der Zwischenablage" (Zwischenablage mit einem grünen Bild füllen)
    const gruen = nativeImage.createFromBuffer(Buffer.from(await js(`(async () => { const cv = document.createElement('canvas'); cv.width = 300; cv.height = 200; const c = cv.getContext('2d'); c.fillStyle = '#1c8a4a'; c.fillRect(0, 0, 300, 200); return Array.from(new Uint8Array(await (await new Promise(ok => cv.toBlob(ok, 'image/png'))).arrayBuffer())); })()`)));
    clipboard.writeImage(gruen);
    const knopf = await js(`(() => { const k = [...document.querySelectorAll('.lw-notiz-kontext button')].find(b => b.dataset.b === 'ablage'); if (!k) return null; const r = k.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; })()`);
    if (knopf) {
      await maus('mouseMoved', knopf[0], knopf[1], { buttons: 0 });
      await maus('mousePressed', knopf[0], knopf[1]);
      await maus('mouseReleased', knopf[0], knopf[1]);
      await warte(1500);
    }
    r.ausAblage = { anzahl: (await js(bilder)).length, neu: (await js(bilder))[1] || null, meldung: await js(`(document.getElementById('toast') || {}).textContent || ''`), menueZu: (await js(menue)) === null };
    // Langes Drücken auf einem Bild: wählt es aus, kein Menü
    await js(`Dokument.leinwand().auswahlLeeren()`);
    const aufBild = await js(`(() => { const lw = Dokument.leinwand(); const s = lw.seiten()[0], e = lw.inhalt(s.id).e.filter(x => x.typ === 'bild').pop(); const a = lw.ansicht(), r = lw.el.getBoundingClientRect(); return [r.left + (s.x + e.x + e.b / 2) * a.s + a.x, r.top + (s.y + e.y + e.h / 2) * a.s + a.y]; })()`);
    const yVor = await js('Dokument.leinwand().ansicht().y');
    await langDruecken(aufBild[0], aufBild[1]);
    r.langBild = { menue: await js(menue), auswahl: (await js('Dokument.leinwand().zustand()')).auswahl, ansichtBewegt: (await js('Dokument.leinwand().ansicht().y')) !== yVor };
    // Kurzes Wischen mit dem Finger verschiebt weiter (kein Menü)
    await js(`Dokument.leinwand().auswahlLeeren()`);
    await fingerZieht(leer[0], leer[1], leer[0], leer[1] - 150, 8);
    r.wischen = { menue: await js(menue), bewegt: (await js('Dokument.leinwand().ansicht().y')) !== yVor };
    // Rechtsklick (Maus) auf leerer Fläche: Menü
    await maus('mouseMoved', leer[0], leer[1], { buttons: 0 });
    await maus('mousePressed', leer[0], leer[1], { button: 'right', buttons: 2 });
    await maus('mouseReleased', leer[0], leer[1], { button: 'right', buttons: 0 });
    await warte(300);
    r.rechtsklick = { menue: await js(menue) };
    await foto('4-rechtsklick');
    await js(`document.querySelectorAll('.lw-notiz-kontext').forEach(m => m.remove())`);
    // Strg+V (Einfügen-Ereignis mit dem Bild der Zwischenablage)
    const vorPaste = (await js(bilder)).length;
    wc.paste();
    await warte(1500);
    r.strgV = { vorher: vorPaste, nachher: (await js(bilder)).length };
    // Rückgängig / Wiederholen
    await js(`Dokument.leinwand().rueckgaengig()`);
    const nachUndo = (await js(bilder)).length;
    await js(`Dokument.leinwand().wiederholen()`);
    r.verlauf = { nachUndo, nachRedo: (await js(bilder)).length };
    // Datei auf die Fläche ziehen (Drop-Ereignis nachgebildet)
    r.drop = await js(`(async () => {
      const lw = Dokument.leinwand(), vor = lw.seiten().reduce((n, s) => n + lw.inhalt(s.id).e.filter(e => e.typ === 'bild').length, 0);
      const dt = new DataTransfer(); dt.items.add(new File([window.__testBlob], 'foto.png', { type: 'image/png' }));
      const r = lw.el.getBoundingClientRect();
      const opt = { bubbles: true, cancelable: true, dataTransfer: dt, clientX: r.left + 300, clientY: r.top + 300 };
      const over = new DragEvent('dragover', opt); lw.el.querySelector('canvas').dispatchEvent(over);
      lw.el.querySelector('canvas').dispatchEvent(new DragEvent('drop', opt));
      await new Promise(ok => setTimeout(ok, 1200));
      return { angenommen: over.defaultPrevented, vorher: vor, nachher: lw.seiten().reduce((n, s) => n + lw.inhalt(s.id).e.filter(e => e.typ === 'bild').length, 0) };
    })()`);

    // Auf dem Bild schreiben und radieren: der Strich kommt dazu und geht wieder, das Bild bleibt
    await js(`(() => { const lw = Dokument.leinwand(); lw.auswahlLeeren(); lw.setzeWerkzeug('stift'); })()`);
    const ziel = await js(`(() => { const lw = Dokument.leinwand(); const s = lw.seiten()[0], e = lw.inhalt(s.id).e.filter(x => x.typ === 'bild').pop(); const a = lw.ansicht(), r = lw.el.getBoundingClientRect(); return [r.left + (s.x + e.x + e.b / 2) * a.s + a.x, r.top + (s.y + e.y + e.h / 2) * a.s + a.y]; })()`);
    const zaehle = `(() => { const lw = Dokument.leinwand(); const l = lw.inhalt(lw.seiten()[0].id).e; return { bilder: l.filter(e => e.typ === 'bild').length, striche: l.filter(e => e.p).length }; })()`;
    await ziehe(ziel[0] - 60, ziel[1], ziel[0] + 60, ziel[1] + 10);
    const geschrieben = await js(zaehle);
    await js(`Dokument.leinwand().setzeWerkzeug('radierer')`);
    await ziehe(ziel[0] - 80, ziel[1] + 5, ziel[0] + 80, ziel[1] + 5, 30);
    r.schreibenRadieren = { geschrieben, radiert: await js(zaehle) };
    // Lasso: auf das Bild tippen wählt es aus
    await js(`Dokument.leinwand().setzeWerkzeug('lasso')`);
    await maus('mouseMoved', ziel[0], ziel[1], { buttons: 0 });
    await maus('mousePressed', ziel[0], ziel[1]);
    await maus('mouseReleased', ziel[0], ziel[1]);
    await warte(300);
    r.lassoTippen = { auswahl: (await js('Dokument.leinwand().zustand()')).auswahl, menue: await js(`(() => { const m = document.querySelector('.lw-menue'); return m && !m.hidden ? m.textContent.replace(/\\s+/g, ' ').trim() : null; })()`) };
    await foto('5-lasso');
    await js(`Dokument.leinwand().sichern()`);
    await warte(800);

    // Export: PNG der ersten Seite (Bildpunkte an der Stelle des Bildes) und PDF (eingebettetes Bild)
    r.export = await js(`(async () => {
      const id = ${JSON.stringify(r.dok.id)};
      const lw = Dokument.leinwand(), s = lw.seiten()[0], e = lw.inhalt(s.id).e.find(x => x.typ === 'bild');
      const [png] = await PdfDienst.exportierePng(id, { seite: 0 });
      const img = await createImageBitmap(png.blob);
      const cv = document.createElement('canvas'); cv.width = img.width; cv.height = img.height;
      const c = cv.getContext('2d'); c.drawImage(img, 0, 0);
      const m = img.width / 794;
      const px = (x, y) => Array.from(c.getImageData(Math.round(x * m), Math.round(y * m), 1, 1).data.slice(0, 3));
      const pdf = await PdfDienst.exportiereNotizbuch(id, 'hell');
      const text = new TextDecoder('latin1').decode(new Uint8Array(await pdf.arrayBuffer()));
      return { pngB: img.width, links: px(e.x + e.b * 0.1, e.y + e.h * 0.2), rechts: px(e.x + e.b * 0.9, e.y + e.h * 0.2), pdfKb: Math.round(pdf.size / 1024), pdfBilder: (text.match(/\\/Subtype\\s*\\/Image/g) || []).length };
    })()`);

    // Neu laden: die Bilder kommen aus der Datei zurück
    const vorReload = (await js(bilder)).length;
    wc.reload();
    await new Promise(ok => wc.once('did-finish-load', ok));
    await warte(2000);
    r.neuGeladen = await js(`(async () => {
      location.hash = '#/dok/' + ${JSON.stringify(r.dok.id)};
      for (let i = 0; i < 80 && !(Dokument.leinwand() && Dokument.leinwand().seiten().length === 2); i++) await new Promise(ok => setTimeout(ok, 100));
      await new Promise(ok => setTimeout(ok, 1000));
      const lw = Dokument.leinwand();
      return lw.seiten().reduce((n, s) => n + lw.inhalt(s.id).e.filter(e => e.typ === 'bild').length, 0);
    })()`);
    r.neuGeladen = { vorher: vorReload, nachher: r.neuGeladen };
    await foto('6-neu-geladen');
  } catch (e) {
    r.fehler = String(e && e.stack || e);
  }
  r.log = log;
  fs.writeFileSync(path.join(AUS, 'bilder.json'), JSON.stringify(r, null, 2));
  app.exit(0);
});
