'use strict';
// Tests der Oberfläche im Browser, ohne Electron und ohne Windows: ein kleiner Server liefert Programm\Quellcode\webseite
// aus (dazu pdf.js und pdf-lib aus node_modules von app oder ipad), Chromium wird über Playwright gesteuert. Die
// Oberfläche läuft dabei wie im Browser (Daten in IndexedDB, keine Ablage auf der Platte): geprüft wird, was die
// Schreibfläche, die Werkzeugleiste und die Dialoge tun. Braucht Playwright mit Chromium:
//   npm install --no-save playwright && npx playwright install chromium
// Aufruf jeweils: node test/browser/<test>.js [ausgabeordner]
const http = require('http'), fs = require('fs'), path = require('path');
const { chromium } = require('playwright');
const QUELLCODE = path.resolve(__dirname, '..', '..', '..');
const SEITE = process.env.LH_SEITE || path.join(QUELLCODE, 'webseite');
// pdf.js und pdf-lib: aus app\node_modules oder ipad\node_modules, je nachdem, wo installiert wurde
const modul = name => { for (const o of ['app', 'ipad']) { const p = path.join(QUELLCODE, o, 'node_modules', name); if (fs.existsSync(p)) return p; } return path.join(QUELLCODE, 'app', 'node_modules', name); };
const TYP = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json', '.webmanifest': 'application/manifest+json' };
function server(wurzel) {
  return new Promise(ok => {
    const s = http.createServer((req, res) => {
      let p = decodeURIComponent(req.url.split('?')[0]); if (p === '/') p = '/index.html';
      const VENDOR = { '/vendor/pdf.min.js': path.join(modul('pdfjs-dist'), 'build', 'pdf.min.js'), '/vendor/pdf.worker.min.js': path.join(modul('pdfjs-dist'), 'build', 'pdf.worker.min.js'), '/vendor/pdf-lib.min.js': path.join(modul('pdf-lib'), 'dist', 'pdf-lib.min.js') };
      const f = VENDOR[p] || path.join(wurzel || SEITE, p);
      fs.readFile(f, (e, d) => { if (e) { res.writeHead(404); res.end(); return; } res.writeHead(200, { 'content-type': TYP[path.extname(f)] || 'application/octet-stream', 'cache-control': 'no-store' }); res.end(d); });
    });
    s.listen(0, '127.0.0.1', () => ok({ s, url: 'http://127.0.0.1:' + s.address().port + '/' }));
  });
}
async function starte(o = {}) {
  const sv = await server(o.wurzel);
  const browser = await chromium.launch({ args: ['--disable-web-security'] });
  const ctx = await browser.newContext({ viewport: { width: o.b || 1194, height: o.h || 834 }, deviceScaleFactor: o.dpr || 2, hasTouch: !!o.touch });
  await ctx.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
  const page = await ctx.newPage();
  const fehler = [];
  page.on('pageerror', e => fehler.push(String(e && e.stack || e)));
  page.on('console', m => { if (m.type() === 'error') fehler.push('console: ' + m.text()); });
  await page.goto(sv.url);
  await page.waitForFunction(() => window.Dokument && window.Bibliothek && window.Daten && document.querySelector('#ansicht-bibliothek'));
  await page.waitForTimeout(500);
  const cdp = await ctx.newCDPSession(page);
  return { sv, browser, ctx, page, cdp, fehler, zu: async () => { await browser.close(); sv.s.close(); } };
}
// Notizbuch mit dicht beschriebenen Seiten anlegen und öffnen
async function notizbuch(page, o = {}) {
  return page.evaluate(async o => {
    window.__warte = ms => new Promise(ok => setTimeout(ok, ms));
    const id = UI.neueId(), seiten = []; for (let i = 0; i < (o.seiten || 3); i++) seiten.push(UI.neueId());
    for (const sid of seiten) {
      const e = [];
      for (let z = 0; z < (o.zeilen == null ? 40 : o.zeilen); z++) for (let w = 0; w < 10; w++) {
        const p = [];
        for (let i = 0; i < 120; i++) p.push([40 + w * 72 + i * 0.55, 60 + z * 26 + Math.sin(i / 5 + w) * 6, Math.round((0.3 + 0.2 * Math.sin(i / 9)) * 32) / 32]);
        e.push({ id: UI.neueId(), w: 'stift', f: 'tinte', d: 1.7, m: Date.now(), p });
      }
      Daten.set('ink:' + id + ':' + sid, { e });
    }
    Bibliothek.speichere(id, { art: 'notizbuch', name: o.name || 'Leistung', eltern: null, format: 'A4', papier: 'karo', seitenfarbe: 'weiss', farbe: 'blau', seiten, erstellt: Date.now(), geoeffnet: 0, seite: 1, favorit: false });
    location.hash = '#/dok/' + id;
    for (let i = 0; i < 100 && !(Dokument.leinwand() && Dokument.leinwand().seiten().length === seiten.length); i++) await __warte(100);
    await __warte(800);
    return id;
  }, o);
}
// Kleines PDF mit n Seiten (vorn Aufgaben, hinten Lösungen), für Tests mit Skripten
async function pdf(n) {
  const { PDFDocument, StandardFonts } = require(modul('pdf-lib'));
  const d = await PDFDocument.create(), f = await d.embedFont(StandardFonts.Helvetica);
  for (let i = 1; i <= n; i++) {
    const s = d.addPage([595, 842]);
    s.drawText(i <= n / 2 ? `Aufgabe ${i}` : `Loesung ${i - Math.floor(n / 2)}`, { x: 60, y: 760, size: 28, font: f });
    for (let z = 0; z < 12; z++) s.drawText(`Zeile ${z + 1} auf Seite ${i}: Text zum Lesen und Beschriften.`, { x: 60, y: 700 - z * 40, size: 13, font: f });
  }
  return Buffer.from(await d.save());
}
// Ausgabeordner (1. Argument oder ein Ordner im Temp-Verzeichnis)
function ausgabe(name) {
  const p = process.argv[2] && !/^\d+(\.\d+)?$/.test(process.argv[2]) ? path.resolve(process.argv[2]) : path.join(require('os').tmpdir(), 'lernheft-test-' + name);
  fs.mkdirSync(p, { recursive: true });
  return p;
}
module.exports = { server, starte, notizbuch, pdf, ausgabe, SEITE };
