'use strict';
// Prüflauf für den Export mit frei gewähltem Speicherort: die Datei kommt nur dorthin, wo man sie im Dialog "Speichern
// unter" hinlegt (der Dialog wird hier nachgebildet), im Ordner des Dokuments bleibt nur das Original. PDF mit Notizen auf
// dem Skript und mit allen Notizen (Seitengrösse), Original-PDF, Abbrechen, PNG aller Seiten (Ordner wählen), gemerkter Ordner. Eigener Testordner, fasst die echten Daten nicht an.
// Aufruf: electron test/export.js <ausgabeordner> <vorlage mit Bibliothek und Daten> [pdf]
// pdf: fehlt in der Kopie die PDF eines Skripts, wird diese Datei dort hingelegt (nur in der Kopie)
// Schreibt export.json in den Ausgabeordner. Vorher Lernheft schliessen (Port 47823).
const electron = require('electron');
const { app, BrowserWindow, dialog } = electron;
const path = require('path');
const fs = require('fs');

const AUS = path.resolve(process.argv[2]);
const VORLAGE = process.argv[3] && process.argv[3] !== '-' ? path.resolve(process.argv[3]) : null;
const WURZEL = path.join(AUS, 'Lernheft');
const ZIEL = path.join(AUS, 'Gewaehlt');
fs.rmSync(AUS, { recursive: true, force: true });
fs.mkdirSync(path.join(WURZEL, 'Programm'), { recursive: true });
fs.mkdirSync(path.join(ZIEL, 'Bilder'), { recursive: true });
const PDF = process.argv[4] ? path.resolve(process.argv[4]) : null;
if (VORLAGE) for (const t of ['Bibliothek', 'Daten']) if (fs.existsSync(path.join(VORLAGE, t))) fs.cpSync(path.join(VORLAGE, t), path.join(WURZEL, t), { recursive: true, filter: q => !/Papierkorb/.test(q) });
if (PDF) {
  const bib = path.join(WURZEL, 'Bibliothek');
  for (const n of fs.existsSync(bib) ? fs.readdirSync(bib) : []) {
    const m = path.join(bib, n, 'Handschrift.lernheft.json');
    const meta = fs.existsSync(m) && JSON.parse(fs.readFileSync(m, 'utf8'));
    if (meta && meta.art === 'skript' && meta.pdf && !fs.existsSync(path.join(bib, n, meta.pdf))) fs.copyFileSync(PDF, path.join(bib, n, meta.pdf));
  }
}
app.setPath('userData', path.join(AUS, 'profil'));
process.env.LERNHEFT_ORDNER = WURZEL;
process.env.LERNHEFT_SEITE = path.join(__dirname, '..', '..', 'webseite');
const warte = ms => new Promise(r => setTimeout(r, ms));

// Dialoge nachbilden: was die App vorschlägt, wird mitgeschrieben
const dialoge = [];
let antwort = null;
dialog.showSaveDialog = async (fenster, o) => { dialoge.push({ art: 'speichern', vorschlag: o.defaultPath, filter: o.filters }); return antwort(o); };
dialog.showOpenDialog = async (fenster, o) => { dialoge.push({ art: 'ordner', vorschlag: o.defaultPath, eigenschaften: o.properties }); return antwort(o); };
require('../main.js');

app.whenReady().then(async () => {
  let win;
  for (let i = 0; i < 100 && !win; i++) { win = BrowserWindow.getAllWindows()[0]; if (!win) await warte(100); }
  const wc = win.webContents;
  // Sichtbar und ungebremst: in einem versteckten Fenster malt Chromium nicht (requestAnimationFrame), der Export wartete ewig
  wc.setBackgroundThrottling(false);
  win.show();
  const log = [];
  wc.on('console-message', (e, l, m) => { if (l >= 2) log.push(m); });
  await new Promise(r => wc.once('did-finish-load', r));
  await warte(2000);
  const js = c => wc.executeJavaScript(c, true);
  const r = {};
  const dateienIn = d => (fs.existsSync(d) ? fs.readdirSync(d).filter(n => /\.(pdf|png)$/i.test(n)) : []);
  try {
    const dok = await js(`(() => { const d = Bibliothek.dokumente().find(x => x.art === 'skript'); return d && { id: d.id, name: d.name }; })()`);
    if (!dok) throw new Error('kein Skript in der Vorlage');
    const dokOrdner = path.join(WURZEL, 'Bibliothek', dok.name);
    const exportiere = async (art, opt) => {
      await js(`Bibliothek.exportiere(${JSON.stringify(dok.id)}, ${JSON.stringify(art)}${opt ? ', ' + JSON.stringify(opt) : ''})`);
      await warte(600);
      return js(`(document.getElementById('toast') || {}).textContent || ''`);
    };
    r.vorher = { imOrdner: dateienIn(dokOrdner) };
    // Ein Strich neben Seite 1 (links vom Blatt) und einer darauf: daran unterscheiden sich die beiden Varianten
    await js(`(() => {
      const k = 'ink:' + ${JSON.stringify(dok.id)} + ':p1', alt = Daten.get(k, { e: [] });
      const e = (alt.e || []).concat([
        { id: 'testdaneben', w: 'stift', f: 'rot', d: 3, m: Date.now(), p: [[-160, 120, 0.5], [-60, 220, 0.5]] },
        { id: 'testdrauf', w: 'stift', f: 'rot', d: 3, m: Date.now(), p: [[100, 120, 0.5], [300, 220, 0.5]] }]);
      Daten.set(k, Object.assign({}, alt, { e }));
    })()`);
    const { PDFDocument } = require('pdf-lib');
    const seite1 = async p => { const d = await PDFDocument.load(fs.readFileSync(p), { ignoreEncryption: true }); const s = d.getPage(0); return { b: Math.round(s.getWidth()), h: Math.round(s.getHeight()), seiten: d.getPageCount() }; };

    // 1. PDF mit Notizen auf dem Skript: nur am gewählten Ort, Seite so gross wie das Original
    antwort = o => ({ canceled: false, filePath: path.join(ZIEL, path.basename(o.defaultPath)) });
    r.blatt = { meldung: await exportiere('notizen-blatt'), dialog: dialoge[dialoge.length - 1], imOrdner: dateienIn(dokOrdner), gewaehlt: dateienIn(ZIEL) };
    r.gemerkt = await js(`Daten.get('lokal:export-ordner')`);

    // 2. PDF mit allen Notizen: Seite 1 wird nach links grösser
    r.alle = { meldung: await exportiere('notizen'), vorschlag: dialoge[dialoge.length - 1].vorschlag, imOrdner: dateienIn(dokOrdner), gewaehlt: dateienIn(ZIEL) };
    const original = path.join(dokOrdner, dok.name + '.pdf');
    r.seitengroesse = {
      original: await seite1(original),
      blatt: await seite1(path.join(ZIEL, dok.name + ' (mit Notizen).pdf')),
      alle: await seite1(path.join(ZIEL, dok.name + ' (mit allen Notizen).pdf'))
    };

    // 3. Original-PDF: nur die Kopie am gewählten Ort, das Original im Ordner bleibt unverändert
    const vorher = fs.statSync(original);
    antwort = o => ({ canceled: false, filePath: path.join(ZIEL, 'Original Kopie') });   // ohne Endung: .pdf kommt dazu
    r.original = { meldung: await exportiere('original'), gewaehlt: dateienIn(ZIEL) };
    const nachher = fs.statSync(original);
    r.original.unveraendert = nachher.mtimeMs === vorher.mtimeMs && nachher.size === vorher.size;
    r.original.gleich = fs.readFileSync(path.join(ZIEL, 'Original Kopie.pdf')).equals(fs.readFileSync(original));

    // 4. Abbrechen: nirgends eine neue Datei
    const zielVorher = dateienIn(ZIEL).length;
    antwort = () => ({ canceled: true });
    r.abbrechen = { meldung: await exportiere('notizen'), imOrdner: dateienIn(dokOrdner), gewaehltUnveraendert: dateienIn(ZIEL).length === zielVorher };

    // 5. PNG einer Seite (Dialog Speichern unter, Filter PNG) und aller Seiten (Ordner wählen)
    antwort = o => ({ canceled: false, filePath: path.join(ZIEL, path.basename(o.defaultPath)) });
    r.pngSeite = { meldung: await exportiere('png', { seite: 0 }), dialog: dialoge[dialoge.length - 1] };
    antwort = () => ({ canceled: false, filePaths: [path.join(ZIEL, 'Bilder')] });
    await js(`Bibliothek.exportiere(${JSON.stringify(dok.id)}, 'png')`);
    for (let i = 0; i < 160 && dateienIn(path.join(ZIEL, 'Bilder')).length === 0; i++) await warte(250);
    await warte(1500);
    r.pngAlle = { dialog: dialoge[dialoge.length - 1], bilder: dateienIn(path.join(ZIEL, 'Bilder')).length, imOrdner: dateienIn(dokOrdner) };

  } catch (e) {
    r.fehler = String(e && e.stack || e);
  }
  r.dialoge = dialoge.length;
  r.log = log;
  fs.writeFileSync(path.join(AUS, 'export.json'), JSON.stringify(r, null, 2));
  app.exit(0);
});
