'use strict';
// Prüflauf für Version 3.10: Haftnotiz ohne Tastatur, Finger-Gesten (zwei/drei Finger tippen, zwei Finger halten), Pencil-
// Gesten (Ereignis der iPad-App), Seite drehen (Notizbuch und PDF, Inhalt dreht mit, zurückdrehen = wie vorher),
// Querformat, PDF im Querformat, Werkzeugleiste anpassen (ausblenden, farbig), Rechtsklick auf Karten, Trennlinie ohne
// Strecken. Jede Prüfung steht mit ok/false in neuerungen.json, dazu Fotos.
// Aufruf: electron test/neuerungen.js <ausgabeordner>
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
  win.setSize(1300, 900);
  win.show(); win.focus();
  await new Promise(r => wc.once('did-finish-load', r));
  await warte(2000);
  const js = c => wc.executeJavaScript(c, true);
  const pruef = [];
  const foto = async name => fs.writeFileSync(path.join(AUS, name + '.png'), (await wc.capturePage()).toPNG());
  try {
    await js(`(async () => {
      window.__warte = ms => new Promise(ok => setTimeout(ok, ms));
      window.__neu = async (extra) => {
        const id = UI.neueId(), s1 = UI.neueId();
        Bibliothek.speichere(id, Object.assign({ art: 'notizbuch', name: 'Test ' + id, eltern: null, format: 'A4', papier: 'blanko', seitenfarbe: 'weiss', farbe: 'blau', seiten: [s1], erstellt: Date.now(), geoeffnet: 0, seite: 1, favorit: false }, extra || {}));
        location.hash = '#/dok/' + id;
        for (let i = 0; i < 80 && !(Dokument.leinwand() && Dokument.leinwand().seiten().length && Dokument.leinwand().seiten()[0].id === s1); i++) await __warte(100);
        await __warte(600);
        return { id, s1 };
      };
      window.__cv = () => document.querySelector('.dok-bereich:not([hidden]) .lw-canvas');
      window.__ev = (typ, x, y, o) => {
        const cv = __cv(); cv.setPointerCapture = () => {}; cv.releasePointerCapture = () => {}; cv.hasPointerCapture = () => true;
        const hr = cv.parentElement.getBoundingClientRect();
        cv.dispatchEvent(new PointerEvent(typ, Object.assign({ pointerId: 9, pointerType: 'pen', isPrimary: true, clientX: hr.left + x, clientY: hr.top + y, pressure: typ === 'pointerup' ? 0 : 0.5, buttons: typ === 'pointerup' ? 0 : 1, button: 0, bubbles: true, cancelable: true }, o || {})));
      };
      window.__strich = async (pts, o) => { __ev('pointerdown', pts[0][0], pts[0][1], o); for (const p of pts.slice(1)) { __ev('pointermove', p[0], p[1], o); await __warte(8); } const l = pts[pts.length - 1]; __ev('pointerup', l[0], l[1], o); await __warte(300); };
      window.__finger = (typ, id, x, y) => __ev(typ, x, y, { pointerId: id, pointerType: 'touch', isPrimary: id === 21, pressure: typ === 'pointerup' ? 0 : 0.5, width: 20, height: 20 });
      window.__ink = (id, sid) => { Dokument.leinwand().sichern(); return (Daten.get('ink:' + id + ':' + sid) || { e: [] }).e; };
      window.__pt = (sx, sy) => { const lw = Dokument.leinwand(), a = lw.ansicht(), s = lw.seiten()[0]; return [(sx - a.x) / a.s - s.x, (sy - a.y) / a.s - s.y]; };
    })()`);

    // 1. Haftnotiz
    const n = await js(`(async () => {
      const { id, s1 } = await __neu();
      const lw = Dokument.leinwand();
      lw.setzeWerkzeug('stift'); lw.setzeWerkzeug('notiz');
      __ev('pointerdown', 500, 300); __ev('pointerup', 500, 300); await __warte(400);
      const nachAnlegen = { werkzeug: lw.einst.werkzeug, editorOffen: !document.querySelector('.lw-notiz-editor').hidden, notizen: __ink(id, s1).filter(e => e.typ === 'notiz').length };
      // Mit dem Stift auf die Notiz schreiben
      const p = []; for (let i = 0; i <= 20; i++) p.push([450 + i * 4, 330 + Math.sin(i / 3) * 6]);
      await __strich(p);
      const notiz = __ink(id, s1).find(e => e.typ === 'notiz');
      const nachSchreiben = { striche: (notiz.e || []).length, editorOffen: !document.querySelector('.lw-notiz-editor').hidden };
      // Finger tippt auf die Notiz: Tastatur (nach dem Stift 0,7 s warten: so lange gelten Finger als Handballen)
      await __warte(800);
      __finger('pointerdown', 21, 470, 380); await __warte(60); __finger('pointerup', 21, 470, 380); await __warte(300);
      const nachTippen = { editorOffen: !document.querySelector('.lw-notiz-editor').hidden };
      document.querySelector('.lw-notiz-editor').blur(); await __warte(200);
      return { nachAnlegen, nachSchreiben, nachTippen };
    })()`);
    pruef.push(['Haftnotiz: angelegt, ohne Tastatur', n.nachAnlegen.notizen === 1 && !n.nachAnlegen.editorOffen, n.nachAnlegen]);
    pruef.push(['Haftnotiz: danach wieder der Stift', n.nachAnlegen.werkzeug === 'stift', n.nachAnlegen.werkzeug]);
    pruef.push(['Haftnotiz: Stift schreibt auf die Notiz', n.nachSchreiben.striche === 1 && !n.nachSchreiben.editorOffen, n.nachSchreiben]);
    pruef.push(['Haftnotiz: Finger tippen öffnet die Tastatur', n.nachTippen.editorOffen, n.nachTippen]);

    // 2. Finger-Gesten
    const g = await js(`(async () => {
      const { id, s1 } = await __neu();
      const lw = Dokument.leinwand();
      lw.setzeWerkzeug('stift');
      const p = []; for (let i = 0; i <= 20; i++) p.push([300 + i * 6, 300]);
      await __strich(p);
      const vorher = __ink(id, s1).length;
      await __warte(800);   // Handballen-Schutz nach dem Stift
      // zwei Finger tippen
      __finger('pointerdown', 21, 400, 400); __finger('pointerdown', 22, 460, 400); await __warte(80); __finger('pointerup', 21, 400, 400); __finger('pointerup', 22, 460, 400); await __warte(200);
      const nachZwei = __ink(id, s1).length;
      // drei Finger tippen
      __finger('pointerdown', 21, 400, 400); __finger('pointerdown', 22, 460, 400); __finger('pointerdown', 23, 520, 400); await __warte(80);
      __finger('pointerup', 21, 400, 400); __finger('pointerup', 22, 460, 400); __finger('pointerup', 23, 520, 400); await __warte(200);
      const nachDrei = __ink(id, s1).length;
      // zwei Finger wischen: keine Geste
      __finger('pointerdown', 21, 400, 400); __finger('pointerdown', 22, 460, 400);
      for (let i = 1; i <= 8; i++) { __finger('pointermove', 21, 400, 400 - i * 12); __finger('pointermove', 22, 460, 400 - i * 12); await __warte(16); }
      __finger('pointerup', 21, 400, 304); __finger('pointerup', 22, 460, 304); await __warte(200);
      const nachWischen = __ink(id, s1).length;
      // zwei Finger halten: Seiten-Menü
      __finger('pointerdown', 21, 400, 400); __finger('pointerdown', 22, 460, 400); await __warte(800);
      const menue = [...document.querySelectorAll('.kontext button')].map(b => b.textContent.trim());
      __finger('pointerup', 21, 400, 400); __finger('pointerup', 22, 460, 400); await __warte(100);
      document.querySelectorAll('.kontext').forEach(k => k.remove());
      // Einstellung ändern: zwei Finger = Radierer an/aus
      lw.einst.gesten = { zweiFinger: 'radierer' };
      __finger('pointerdown', 21, 400, 400); __finger('pointerdown', 22, 460, 400); await __warte(60); __finger('pointerup', 21, 400, 400); __finger('pointerup', 22, 460, 400); await __warte(150);
      const werkzeugA = lw.einst.werkzeug;
      __finger('pointerdown', 21, 400, 400); __finger('pointerdown', 22, 460, 400); await __warte(60); __finger('pointerup', 21, 400, 400); __finger('pointerup', 22, 460, 400); await __warte(150);
      const werkzeugB = lw.einst.werkzeug;
      // Pencil (iPad-App): Doppeltippen = Radierer an/aus
      lw.einst.gesten = {};
      window.dispatchEvent(new CustomEvent('lh-pencil', { detail: 'doppeltipp' })); await __warte(100);
      const pencilA = lw.einst.werkzeug;
      window.dispatchEvent(new CustomEvent('lh-pencil', { detail: 'doppeltipp' })); await __warte(100);
      const pencilB = lw.einst.werkzeug;
      return { vorher, nachZwei, nachDrei, nachWischen, menue, werkzeugA, werkzeugB, pencilA, pencilB };
    })()`);
    pruef.push(['Geste: zwei Finger tippen = Rückgängig', g.vorher === 1 && g.nachZwei === 0, g]);
    pruef.push(['Geste: drei Finger tippen = Wiederholen', g.nachDrei === 1, g.nachDrei]);
    pruef.push(['Geste: zwei Finger wischen löst nichts aus', g.nachWischen === 1, g.nachWischen]);
    pruef.push(['Geste: zwei Finger halten = Seiten-Menü', g.menue.some(t => /links drehen/.test(t)) && g.menue.some(t => /Gesten einstellen/.test(t)), g.menue]);
    pruef.push(['Geste einstellbar: zwei Finger = Radierer an/aus', g.werkzeugA === 'radierer' && g.werkzeugB === 'stift', [g.werkzeugA, g.werkzeugB]]);
    pruef.push(['Pencil doppelt tippen (iPad-App) = Radierer an/aus', g.pencilA === 'radierer' && g.pencilB === 'stift', [g.pencilA, g.pencilB]]);

    // 3. Seite drehen (Notizbuch)
    const d = await js(`(async () => {
      const { id, s1 } = await __neu();
      const lw = Dokument.leinwand();
      lw.setzeWerkzeug('stift');
      const p = []; for (let i = 0; i <= 30; i++) p.push([300 + i * 5, 250 + i * 2]);
      await __strich(p);
      const vor = JSON.stringify(__ink(id, s1)[0].p);
      const s0 = lw.seiten()[0]; const groesse0 = [s0.b, s0.h];
      document.querySelector('[data-aktion="rechts"]').click(); await __warte(400);
      const s1x = lw.seiten()[0]; const groesse1 = [s1x.b, s1x.h];
      const nach = __ink(id, s1)[0].p;
      const erwartet = JSON.parse(vor).map(q => [Math.round((groesse0[1] - q[1]) * 10) / 10, q[0]]);
      const passt = nach.every((q, i) => Math.abs(q[0] - erwartet[i][0]) < 0.11 && Math.abs(q[1] - erwartet[i][1]) < 0.11);
      const drehung = Bibliothek.get(id).drehung;
      document.querySelector('[data-aktion="links"]').click(); await __warte(400);
      const zurueck = JSON.stringify(__ink(id, s1)[0].p) === vor;
      const s2 = lw.seiten()[0];
      return { groesse0, groesse1, passt, drehung, zurueck, groesse2: [s2.b, s2.h], drehungDanach: Bibliothek.get(id).drehung || null };
    })()`);
    pruef.push(['Drehen: Seite wird quer (Masse getauscht)', d.groesse1[0] === d.groesse0[1] && d.groesse1[1] === d.groesse0[0], d]);
    pruef.push(['Drehen: Schrift dreht mit', d.passt, d.passt]);
    pruef.push(['Drehen: im Dokument gespeichert', d.drehung && Object.values(d.drehung)[0] === 90, d.drehung]);
    pruef.push(['Drehen: links zurück = genau wie vorher', d.zurueck && d.groesse2[0] === d.groesse0[0] && !d.drehungDanach, d]);

    // 4. Querformat-Notizbuch
    const q = await js(`(async () => { await __neu({ quer: true }); const s = Dokument.leinwand().seiten()[0]; return [s.b, s.h]; })()`);
    pruef.push(['Querformat: Notizbuch-Seite ist quer', q[0] > q[1], q]);
    await foto('querformat');

    // 5. PDF im Querformat und drehen
    const pdf = await js(`(async () => {
      const lib = await PdfDienst.ladePdfLib();
      const doc = await lib.PDFDocument.create();
      const s1 = doc.addPage([842, 595]); s1.drawText('Querformat', { x: 60, y: 500, size: 40 });   // A4 quer
      const s2 = doc.addPage([595, 842]); s2.drawText('Hochformat', { x: 60, y: 760, size: 40 });
      const s3 = doc.addPage([595, 842]); s3.setRotation(lib.degrees(90)); s3.drawText('Gedreht', { x: 60, y: 760, size: 40 });
      const bytes = await doc.save();
      const id = UI.neueId();
      await Daten.datei.put('pdf:' + id, new Blob([bytes], { type: 'application/pdf' }));
      Bibliothek.speichere(id, { art: 'skript', name: 'Quer-Test', eltern: null, datei: id, seiten: 3, groesse: bytes.length, modus: 'original', hell: 1, erstellt: Date.now(), geoeffnet: 0, seite: 1, favorit: false });
      location.hash = '#/dok/' + id;
      for (let i = 0; i < 80 && !(Dokument.leinwand() && Dokument.leinwand().seiten().length === 3); i++) await __warte(100);
      await __warte(2500);
      const lw = Dokument.leinwand();
      const masse = lw.seiten().map(s => [Math.round(s.b), Math.round(s.h)]);
      lw.springeZuSeite(1, false); await __warte(500);
      document.querySelector('[data-aktion="rechts"]').click(); await __warte(2500);
      const nachDrehen = lw.seiten().map(s => [Math.round(s.b), Math.round(s.h)]);
      // Export: gedrehte Seite 2 ist im PDF gedreht, Seite 1 nicht
      const blob = await PdfDienst.exportiereSkript(id, null, {});
      const aus = await (await PdfDienst.ladePdfLib()).PDFDocument.load(new Uint8Array(await blob.arrayBuffer()));
      const export_ = aus.getPages().map(p => p.getRotation().angle);
      return { masse, nachDrehen, drehung: Bibliothek.get(id).drehung, id, export: export_ };
    })()`);
    pruef.push(['PDF: Querformat-Seite wird quer angezeigt', pdf.masse[0][0] > pdf.masse[0][1], pdf.masse]);
    pruef.push(['PDF: Seite mit /Rotate 90 wird richtig herum (quer) angezeigt', pdf.masse[2][0] > pdf.masse[2][1], pdf.masse[2]]);
    pruef.push(['PDF: Seite 2 gedreht, nur sie wird quer', pdf.nachDrehen[1][0] > pdf.nachDrehen[1][1] && pdf.nachDrehen[0][0] === pdf.masse[0][0], pdf]);
    pruef.push(['Export: gedrehte PDF-Seite ist im PDF gedreht', pdf.export && pdf.export[1] === 90 && pdf.export[0] === 0 && pdf.export[2] === 90, pdf.export]);
    // Notizbuch-Export mit gedrehter Seite und Querformat
    const nb = await js(`(async () => {
      const { id } = await __neu({ quer: true });
      const blob = await PdfDienst.exportiereNotizbuch(id, 'hell');
      const aus = await (await PdfDienst.ladePdfLib()).PDFDocument.load(new Uint8Array(await blob.arrayBuffer()));
      const p = aus.getPage(0); return [Math.round(p.getWidth()), Math.round(p.getHeight())];
    })()`);
    pruef.push(['Export: Querformat-Notizbuch als PDF quer', nb[0] > nb[1], nb]);
    await foto('pdf-gedreht');

    // 6. Werkzeugleiste anpassen
    const w = await js(`(async () => {
      Daten.set('lokal:leiste-aus', ['w:laser', 'a:zoom']);
      Dokument.leinwand(); location.hash = '#/bibliothek'; await __warte(300);
      const { id } = await __neu();
      const leiste = document.querySelector('#dok-leiste .werkzeugleiste, .werkzeugleiste');
      const laser = leiste.querySelector('[data-werkzeug="laser"]'), zoom = leiste.querySelector('[data-aktion="zoom"]'), stift = leiste.querySelector('[data-werkzeug="stift"]');
      const farbig = leiste.classList.contains('farbig'), farbe = getComputedStyle(stift.querySelector('svg')).color;
      Daten.set('lokal:leiste-aus', []);
      return { laserWeg: laser.hidden, zoomWeg: zoom.hidden, stiftDa: !stift.hidden, farbig, farbe };
    })()`);
    pruef.push(['Leiste anpassen: ausgeblendete Symbole fehlen', w.laserWeg && w.zoomWeg && w.stiftDa, w]);
    pruef.push(['Leiste: farbige Symbole', w.farbig && w.farbe !== 'rgb(255, 255, 255)', w.farbe]);
    await foto('leiste');

    // 7. Rechtsklick auf eine Karte
    const k = await js(`(async () => {
      location.hash = '#/bibliothek'; await __warte(800);
      const karte = document.querySelector('#ansicht-bibliothek .karte');
      const r = karte.getBoundingClientRect();
      karte.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: r.left + 30, clientY: r.top + 30 }));
      await __warte(200);
      const m = document.querySelector('.kontext');
      const t = m ? [...m.querySelectorAll('button')].map(b => b.textContent.trim()).slice(0, 4) : null;
      if (m) m.remove();
      return t;
    })()`);
    pruef.push(['Rechtsklick auf Karte öffnet das Menü', Array.isArray(k) && k.length > 0, k]);

    // 8. Trennlinie ohne Strecken
    const t = await js(`(async () => {
      const a = await __neu(); const b = await __neu();
      Dokument.setzeSeite(a.id, 'rechts'); await __warte(1200);
      const lw = Dokument.leinwand();
      lw.friere(true); lw.vorschauBreite(lw.ansicht().b * 0.7);
      const cv = lw.el.querySelector('.lw-canvas');
      const r = { scale: cv.style.scale, translate: cv.style.translate };
      lw.friere(false, true);
      return r;
    })()`);
    pruef.push(['Trennlinie: Bild wird nicht gestreckt, nur verschoben', !t.scale && /px/.test(t.translate), t]);
  } catch (e) { pruef.push(['Fehler im Ablauf', false, String(e && e.stack || e)]); }
  const r = { alleOk: pruef.every(p => p[1]), pruefungen: pruef.map(([name, ok, wert]) => ({ name, ok: !!ok, wert })), log: log.filter(l => !/Security Warning/.test(l)).slice(0, 20) };
  fs.writeFileSync(path.join(AUS, 'neuerungen.json'), JSON.stringify(r, null, 2));
  app.exit(0);
});
