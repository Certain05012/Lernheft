'use strict';
// Handschrift erst laden, wenn sie gebraucht wird (seit 3.11): eine grosse Bibliothek (30 Notizbücher mit je 3 voll
// beschriebenen Seiten) wird als Dateien angelegt, dann startet das Lernheft. Geprüft wird:
//   Speicher nach dem Start und mit allen Vorschaubildern, Seiten faul bis zum Öffnen, Öffnen lädt alles, Schreiben und
//   Schliessen (Datei hat den Strich, Seiten wieder faul, Speicher frei), Änderung von aussen bei geschlossenem Dokument
//   (Vorschaubild neu, beim Öffnen da), Schreiben ohne zu laden führt mit der Datei zusammen (nichts geht verloren),
//   Kopieren und Export eines geschlossenen Dokuments.
// Aufruf: electron test/faul.js <ausgabeordner> [quellcode]   (quellcode: anderer Programm\Quellcode-Ordner zum Vergleich)
// Schreibt faul.json. Vorher Lernheft schliessen (Port 47823).
const { app, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');
const zlib = require('zlib');

const AUS = path.resolve(process.argv[2]);
const QUELL = path.resolve(process.argv[3] || path.join(__dirname, '..', '..'));
const WURZEL = path.join(AUS, 'Lernheft');
const F = require(path.join(QUELL, 'webseite', 'format.js'));
fs.rmSync(AUS, { recursive: true, force: true });
fs.mkdirSync(path.join(WURZEL, 'Programm'), { recursive: true });
app.setPath('userData', path.join(AUS, 'profil'));
process.env.LERNHEFT_ORDNER = WURZEL;
process.env.LERNHEFT_SEITE = path.join(QUELL, 'webseite');
const warte = ms => new Promise(r => setTimeout(r, ms));

// Bibliothek anlegen: Handschrift wie mit dem Apple Pencil (Striche zu 25 bis 90 Punkten, Druck schwankt)
let z = 7; const zz = () => (z = (z * 16807) % 2147483647) / 2147483647;
function seite(n) {
  const e = []; let x = 40, y = 60;
  for (let s = 0; s < n; s++) {
    const k = 25 + Math.floor(zz() * 65), p = []; let a = zz() * 6.28, px = x, py = y, d = 0.4;
    for (let i = 0; i < k; i++) { a += (zz() - 0.5) * 0.5; px += Math.cos(a) * (0.6 + zz()); py += Math.sin(a) * 0.6; d = Math.min(1, Math.max(0.05, d + (zz() - 0.5) * 0.06)); p.push([px, py, d]); }
    e.push({ id: 'w' + s + 'x' + Math.floor(zz() * 1e9).toString(36), w: 'stift', f: 'tinte', d: 1.7, m: 1790000000000 + s, p });
    x += 14 + zz() * 10; if (x > 740) { x = 40; y += 28; }
  }
  return { e };
}
const BUECHER = 30, SEITEN = 3, STRICHE = 650;
for (let b = 0; b < BUECHER; b++) {
  const dir = path.join(WURZEL, 'Bibliothek', 'Heft ' + String(b + 1).padStart(2, '0'));
  fs.mkdirSync(path.join(dir, 'Handschrift'), { recursive: true });
  const seiten = [];
  for (let s = 1; s <= SEITEN; s++) {
    seiten.push('s' + s);
    fs.writeFileSync(path.join(dir, 'Handschrift', 's' + s + '.lhz'), zlib.gzipSync(Buffer.from(F.kodiereSeite('s' + s, seite(STRICHE))), { level: 6 }));
  }
  fs.writeFileSync(path.join(dir, 'Handschrift.lernheft.json'), JSON.stringify({ lernheft: 2, id: 'heft' + b, art: 'notizbuch', eigenschaften: { papier: 'karo', format: 'A4', farbe: 'blau', erstellt: 1790000000000 + b }, statistik: {}, seiten, geaendert: 1790000000000 }));
}
const liesSeite = p => F.dekodiereSeite(zlib.gunzipSync(fs.readFileSync(p)).toString('utf8'));

const t0 = Date.now();
require(path.join(QUELL, 'app', 'main.js'));

app.whenReady().then(async () => {
  let win;
  for (let i = 0; i < 100 && !win; i++) { win = BrowserWindow.getAllWindows()[0]; if (!win) await warte(100); }
  const wc = win.webContents;
  wc.setBackgroundThrottling(false);
  win.setSize(1300, 900);
  win.show();
  await new Promise(r => wc.once('did-finish-load', r));
  const js = c => wc.executeJavaScript(c, true);
  const r = { quelle: QUELL, bibliothek: { buecher: BUECHER, seitenJeBuch: SEITEN, stricheJeSeite: STRICHE, dateiKB: Math.round(fs.statSync(path.join(WURZEL, 'Bibliothek', 'Heft 01', 'Handschrift', 's1.lhz')).size / 1024) }, pruefungen: [] };
  const pruefe = (name, ok, info) => r.pruefungen.push({ name, ok: !!ok, info });
  wc.debugger.attach('1.3');
  const speicher = async () => { await wc.debugger.sendCommand('HeapProfiler.collectGarbage'); const h = await wc.debugger.sendCommand('Runtime.getHeapUsage'); return Math.round(h.usedSize / 1048576); };
  try {
    await js(`(async () => { await Daten.bereit; for (let i = 0; i < 100 && !document.querySelector('.bib-raster canvas'); i++) await new Promise(ok => setTimeout(ok, 100)); })()`);
    r.startMs = Date.now() - t0;
    await warte(2500);   // Vorschaubilder fertig
    r.speicherMB = { nachStartMitVorschau: await speicher() };
    // nur die Hefte dieses Tests (beim ersten Start legt das Lernheft zusätzlich ein Willkommens-Notizbuch an)
    const faul = await js(`Daten.istFaul ? Daten.keys('ink:heft').filter(Daten.istFaul).length : -1`);
    const alle = await js(`Daten.keys('ink:heft').length`);
    r.seitenFaul = faul;
    pruefe('alle Seiten bekannt', alle === BUECHER * SEITEN, alle);
    if (faul >= 0) pruefe('nach dem Start keine Seite im Speicher', faul === alle, faul + ' von ' + alle);
    r.vorschaubilder = await js(`document.querySelectorAll('canvas[data-nb]').length`);
    // Vorschaubild zeigt die Handschrift (dunkle Pixel im Bild)
    r.vorschauDunkel = await js(`(() => { const c = document.querySelector('canvas[data-nb="heft0"]'); if (!c) return -1; const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; const h = (d[(2 * c.width + 2) * 4] + d[(2 * c.width + 2) * 4 + 1] + d[(2 * c.width + 2) * 4 + 2]) / 3; let n = 0; for (let i = 0; i < d.length; i += 4) if (Math.abs((d[i] + d[i + 1] + d[i + 2]) / 3 - h) > 80) n++; return n; })()`);
    pruefe('Vorschaubild zeigt die Handschrift', r.vorschauDunkel > 500, r.vorschauDunkel);

    // Öffnen: alle Seiten geladen und vollständig
    await js(`(async () => { location.hash = '#/dok/heft0'; for (let i = 0; i < 100 && !(Dokument.leinwand() && Dokument.leinwand().seiten().length === ${SEITEN}); i++) await new Promise(ok => setTimeout(ok, 100)); await new Promise(ok => setTimeout(ok, 800)); })()`);
    const offen = await js(`({ faul: Daten.keys('ink:heft0:').filter(k => Daten.istFaul && Daten.istFaul(k)).length, striche: Daten.keys('ink:heft0:').map(k => (Daten.get(k) || { e: [] }).e.length) })`);
    pruefe('Öffnen lädt alle Seiten', offen.faul === 0 && offen.striche.every(n => n === STRICHE), offen);
    r.speicherMB.einDokumentOffen = await speicher();
    // Ein Strich, dann Tab schliessen
    await js(`(async () => {
      await new Promise(ok => setTimeout(ok, 800));
      const cv = document.querySelector('.dok-bereich:not([hidden]) .lw-canvas'); cv.setPointerCapture = () => {}; cv.releasePointerCapture = () => {};
      const b = cv.parentElement.getBoundingClientRect();
      const ev = (t, x, y) => cv.dispatchEvent(new PointerEvent(t, { pointerId: 5, pointerType: 'pen', isPrimary: true, clientX: b.left + x, clientY: b.top + y, pressure: t === 'pointerup' ? 0 : 0.5, buttons: t === 'pointerup' ? 0 : 1, button: 0, bubbles: true, cancelable: true }));
      Dokument.leinwand().setzeWerkzeug('stift');
      ev('pointerdown', 300, 200); for (let i = 1; i < 40; i++) { ev('pointermove', 300 + i * 4, 200 + Math.sin(i / 4) * 12); await new Promise(ok => setTimeout(ok, 8)); } ev('pointerup', 460, 200);
      await new Promise(ok => setTimeout(ok, 300));
      Dokument.leinwand().sichern();
      Dokument.schliesseTab('heft0');
      await new Promise(ok => setTimeout(ok, 1200));
    })()`);
    const nachZu = await js(`({ faul: Daten.keys('ink:heft0:').filter(k => Daten.istFaul && Daten.istFaul(k)).length })`);
    const sum = ['s1', 's2', 's3'].map(s => liesSeite(path.join(WURZEL, 'Bibliothek', 'Heft 01', 'Handschrift', s + '.lhz')).e.length);
    pruefe('Strich ist in der Datei', sum.reduce((a, b) => a + b, 0) === SEITEN * STRICHE + 1, sum);
    if (faul >= 0) pruefe('nach dem Schliessen wieder frei', nachZu.faul === SEITEN, nachZu);
    r.speicherMB.nachSchliessen = await speicher();

    // Änderung von aussen, während das Dokument zu ist (wie die Cloud): Vorschaubild neu, beim Öffnen da
    const p2 = path.join(WURZEL, 'Bibliothek', 'Heft 02', 'Handschrift', 's1.lhz');
    const vorher = liesSeite(p2);
    const fremd = { id: 'vonAussen', w: 'stift', f: 'rot', d: 30, m: Date.now(), p: [[100, 100, 1], [700, 1000, 1]] };
    await warte(1600);
    fs.writeFileSync(p2, zlib.gzipSync(Buffer.from(F.kodiereSeite('s1', { e: vorher.e.concat(fremd) }))));
    await warte(3500);
    const coverUrl = await js(`(() => { const c = document.querySelector('canvas[data-nb="heft1"]'); return c ? c.toDataURL('image/png') : ''; })()`);
    if (coverUrl) fs.writeFileSync(path.join(AUS, 'cover-heft2.png'), Buffer.from(coverUrl.split(',')[1], 'base64'));
    await wc.capturePage().then(b => fs.writeFileSync(path.join(AUS, 'bibliothek.png'), b.toPNG()));
    r.vorschauRot = await js(`(() => { const c = document.querySelector('canvas[data-nb="heft1"]'); if (!c) return -1; const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let n = 0; for (let i = 0; i < d.length; i += 4) if (d[i] > 180 && d[i] - d[i + 1] > 70 && d[i] - d[i + 2] > 70) n++; return n; })()`);
    pruefe('Vorschaubild zeigt die Änderung von aussen', r.vorschauRot > 50, r.vorschauRot);
    const nachAussen = await js(`(async () => {
      location.hash = '#/dok/heft1';
      for (let i = 0; i < 100 && !(Dokument.leinwand() && Dokument.leinwand().seiten().length === ${SEITEN}); i++) await new Promise(ok => setTimeout(ok, 100));
      await new Promise(ok => setTimeout(ok, 600));
      const e = (Daten.get('ink:heft1:s1') || { e: [] }).e;
      const da = e.some(x => x.id === 'vonAussen'), n = e.length;
      Dokument.schliesseTab('heft1');
      await new Promise(ok => setTimeout(ok, 600));
      return { da, n };
    })()`);
    pruefe('Änderung von aussen beim Öffnen da', nachAussen.da && nachAussen.n === STRICHE + 1, nachAussen);

    // Sicherheitsnetz: eine Seite schreiben, ohne sie zu laden (z. B. ein Fehler in der Oberfläche) -> nichts geht verloren
    if (faul >= 0) {
      await js(`(async () => { Daten.set('ink:heft2:s2', { e: [{ id: 'blind', w: 'stift', f: 'tinte', d: 2, m: Date.now(), p: [[10, 10, 0.5], [50, 50, 0.5]] }] }); Daten.flush(); await new Promise(ok => setTimeout(ok, 1200)); })()`);
      const blind = liesSeite(path.join(WURZEL, 'Bibliothek', 'Heft 03', 'Handschrift', 's2.lhz')).e;
      pruefe('Schreiben ohne Laden führt mit der Datei zusammen', blind.length === STRICHE + 1 && blind.some(e => e.id === 'blind'), blind.length);
    }

    // Kopieren eines geschlossenen Dokuments
    const kopie = await js(`(async () => {
      const neu = await Bibliothek.dupliziere('heft4');
      await new Promise(ok => setTimeout(ok, 1500));
      if (!neu) return null;
      await Daten.lade(Daten.keys('ink:' + neu + ':'));
      return { seiten: Daten.keys('ink:' + neu + ':').map(k => (Daten.get(k) || { e: [] }).e.length), quelleFaul: Daten.keys('ink:heft4:').filter(k => Daten.istFaul && Daten.istFaul(k)).length };
    })()`);
    pruefe('Kopie eines geschlossenen Dokuments ist vollständig', kopie && kopie.seiten.length === SEITEN && kopie.seiten.every(n => n === STRICHE), kopie);
    // Export eines geschlossenen Dokuments als PNG (Seite 1): die Daten werden geladen und danach wieder frei
    const exp = await js(`(async () => {
      let fehler = null, bilder = [];
      try { bilder = await PdfDienst.exportierePng('heft5', { seite: 0 }); } catch (e) { fehler = String(e && e.message || e); }
      await new Promise(ok => setTimeout(ok, 500));
      return { fehler, bilder: (bilder || []).length, groesse: bilder && bilder[0] ? (bilder[0].blob || bilder[0]).size || 0 : 0, faulDanach: Daten.keys('ink:heft5:').filter(k => Daten.istFaul && Daten.istFaul(k)).length };
    })()`);
    r.export = exp;
    pruefe('Export eines geschlossenen Dokuments', !exp.fehler && exp.bilder >= 1, exp);
    r.speicherMB.ende = await speicher();
  } catch (e) { r.fehler = String(e && e.stack || e); }
  r.ok = r.pruefungen.every(p => p.ok) && !r.fehler;
  fs.writeFileSync(path.join(AUS, 'faul.json'), JSON.stringify(r, null, 2));
  app.exit(0);
});
