'use strict';
// Prüflauf für Glättung, Linie/Form (Halten), Überkritzeln, neue Seite durch Wischen, Whiteboard, Umwandeln, PNG-Export,
// Tabs, Bibliothek-Hintergrund und Vollbild, in der echten App (eigener Testordner, fasst die echten Daten nicht an).
// Aufruf: electron test/funktionen.js <ausgabeordner>      (vorher Lernheft schliessen, Port 47823)
// Schreibt Bildschirmfotos und funktionen.json in den Ausgabeordner.
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
  const log = [];
  wc.on('console-message', (e, l, m) => { if (l >= 2) log.push(m); });
  win.setSize(1400, 900);
  win.show(); win.focus();
  await new Promise(r => wc.once('did-finish-load', r));
  await warte(2000);
  const js = c => wc.executeJavaScript(c, true);
  const foto = async n => { await warte(500); fs.writeFileSync(path.join(AUS, n + '.png'), (await wc.capturePage()).toPNG()); };
  const r = {};
  try {
    // Hilfen: Stift und Finger nachbilden
    await js(`(() => {
      const ereignis = (art, typ, x, y, id) => new PointerEvent(typ, { pointerId: id, pointerType: art, isPrimary: true, clientX: x, clientY: y, pressure: typ === 'pointerup' ? 0 : 0.5, buttons: typ === 'pointerup' ? 0 : 1, button: 0, bubbles: true, cancelable: true });
      const flaeche = () => { const cv = document.querySelector('.dok-bereich:not([hidden]) .lw-canvas'); cv.setPointerCapture = () => {}; cv.releasePointerCapture = () => {}; cv.hasPointerCapture = () => true; return cv; };
      window.__lw = () => Dokument.leinwand();
      window.__sid = () => __lw().seiten()[0].id;
      window.__mal = async (pts, halten, schritt = 6, art = 'pen') => {
        const cv = flaeche(), hr = cv.parentElement.getBoundingClientRect(), id = art === 'pen' ? 7 : 21;
        cv.dispatchEvent(ereignis(art, 'pointerdown', hr.left + pts[0][0], hr.top + pts[0][1], id));
        for (const p of pts.slice(1)) { cv.dispatchEvent(ereignis(art, 'pointermove', hr.left + p[0], hr.top + p[1], id)); await new Promise(ok => setTimeout(ok, schritt)); }
        await new Promise(ok => setTimeout(ok, halten));
        const l = pts[pts.length - 1];
        cv.dispatchEvent(ereignis(art, 'pointerup', hr.left + l[0], hr.top + l[1], id));
        await new Promise(ok => setTimeout(ok, 250));
      };
      window.__letzte = () => { const e = __lw().inhalt(__sid()).e; return e[e.length - 1]; };
      window.__anzahl = () => __lw().inhalt(__sid()).e.length;
    })()`);

    /* ===== Whiteboard ===== */
    r.brett = await js(`(async () => {
      const id = UI.neueId(), sid = UI.neueId();
      Bibliothek.speichere(id, { art: 'notizbuch', papier: 'whiteboard', raster: 'punkte', name: 'Test-Whiteboard', eltern: null, format: 'A4', farbe: 'blau', seiten: [sid], erstellt: Date.now(), geoeffnet: Date.now(), seite: 1, favorit: false });
      window.__brett = id;
      location.hash = '#/dok/' + id;
      await new Promise(ok => setTimeout(ok, 1500));
      const lw = __lw();
      return { id, unendlich: !!lw.seiten()[0].unendlich, ansicht: lw.ansicht() };
    })()`);

    // 1. Kreis, Halten
    r.kreis = await js(`(async () => {
      const pts = []; for (let i = 0; i <= 104; i++) { const t = 2 * Math.PI * i / 100; pts.push([500 + 80 * Math.cos(t) + (Math.random() - .5) * 1.5, 250 + 80 * Math.sin(t) + (Math.random() - .5) * 1.5]); }
      await __mal(pts, 900);
      const s = __letzte(), p = s.p;
      const cx = p.reduce((a, q) => a + q[0], 0) / p.length, cy = p.reduce((a, q) => a + q[1], 0) / p.length, rr = p.map(q => Math.hypot(q[0] - cx, q[1] - cy));
      const lw = __lw(), vorUndo = p.length;
      lw.rueckgaengig(); const original = __letzte().p.length;
      lw.rueckgaengig(); const leer = __anzahl();
      lw.wiederholen(); lw.wiederholen();
      return { punkte: vorUndo, rmin: +Math.min(...rr).toFixed(2), rmax: +Math.max(...rr).toFixed(2), nachUndo1: original, nachUndo2: leer, nachRedo: __letzte().p.length };
    })()`);
    // 2. Linie, Dreieck, Rechteck, Ellipse
    r.formen = await js(`(async () => {
      const aus = {};
      let pts = []; for (let i = 0; i <= 50; i++) { const t = i / 50; pts.push([100 + 300 * t, 100 + 60 * t + 12 * Math.sin(Math.PI * t)]); }
      await __mal(pts, 900); aus.linie = __letzte().p.length;
      const dr = [[150, 380], [350, 400], [240, 260]]; pts = [];
      for (let k = 0; k < 3; k++) { const a = dr[k], b = dr[(k + 1) % 3]; for (let i = 0; i < 20; i++) pts.push([a[0] + (b[0] - a[0]) * i / 20 + (Math.random() - .5), a[1] + (b[1] - a[1]) * i / 20 + (Math.random() - .5)]); }
      pts.push([dr[0][0] + 2, dr[0][1] - 1]);
      await __mal(pts, 900); aus.dreieck = __letzte().p.length;
      const re = [[550, 330], [750, 335], [748, 430], [552, 428]]; pts = [];
      for (let k = 0; k < 4; k++) { const a = re[k], b = re[(k + 1) % 4]; for (let i = 0; i < 20; i++) pts.push([a[0] + (b[0] - a[0]) * i / 20 + (Math.random() - .5), a[1] + (b[1] - a[1]) * i / 20 + (Math.random() - .5)]); }
      pts.push([re[0][0] + 1, re[0][1] + 1]);
      await __mal(pts, 900); aus.rechteck = __letzte().p.length;
      pts = []; for (let i = 0; i <= 102; i++) { const t = 2 * Math.PI * i / 100, x = 130 * Math.cos(t), y = 50 * Math.sin(t); pts.push([900 + x * Math.cos(.5) - y * Math.sin(.5) + (Math.random() - .5), 220 + x * Math.sin(.5) + y * Math.cos(.5) + (Math.random() - .5)]); }
      await __mal(pts, 900); aus.ellipse = __letzte().p.length;
      pts = []; for (let i = 0; i <= 40; i++) pts.push([800 + i * 4, 450 + 20 * Math.sin(i / 3)]);
      await __mal(pts, 60); aus.ohneHalten = __letzte().p.length;
      return aus;
    })()`);
    await foto('01-whiteboard-formen');

    // 2b. Sechseck und Pfeil (Halten), Haltezeit einstellbar. Ecken des gesäuberten Linienzugs = Stellen, an denen zwei Punkte
    // ganz nah beieinander liegen (siehe vieleckPunkte / linienzugPunkte in formen.js).
    r.formenNeu = await js(`(async () => {
      const aus = {}, lw = __lw(), einst = Werkzeuge.einstellungen();
      const ecken = s => { let n = 0; for (let i = 1; i < s.p.length; i++) if (Math.hypot(s.p[i][0] - s.p[i-1][0], s.p[i][1] - s.p[i-1][1]) < 1) n++; return n; };
      const wiegross = () => __letzte().p.length;
      lw.leeren();
      const sechs = []; for (let k = 0; k < 6; k++) { const w0 = Math.PI / 3 * k + .1, w1 = Math.PI / 3 * (k + 1) + .1; const a = [700 + 110 * Math.cos(w0), 300 + 110 * Math.sin(w0)], b = [700 + 110 * Math.cos(w1), 300 + 110 * Math.sin(w1)]; for (let i = 0; i < 18; i++) sechs.push([a[0] + (b[0] - a[0]) * i / 18 + (Math.random() - .5), a[1] + (b[1] - a[1]) * i / 18 + (Math.random() - .5)]); }
      sechs.push([sechs[0][0] + 1, sechs[0][1] + 1]);
      // Haltezeit Standard 0,7 s: nach 0,35 s noch nichts, nach 0,95 s eine Form
      delete einst.halteMs;
      await __mal(sechs, 350); aus.kurzGehalten = { ecken: ecken(__letzte()), punkte: wiegross() };
      lw.rueckgaengig(); lw.leeren();
      await __mal(sechs, 950); aus.sechseck = { ecken: ecken(__letzte()), punkte: wiegross() };
      const nachLoslassen = wiegross(); await new Promise(ok => setTimeout(ok, 400)); aus.bleibtStehen = nachLoslassen === wiegross();
      lw.rueckgaengig(); aus.nachRueckgaengig = { ecken: ecken(__letzte()), punkte: wiegross() };
      lw.rueckgaengig(); lw.leeren();
      // Haltezeit 1,3 s: nach 0,95 s noch nichts, nach 1,6 s die Form
      einst.halteMs = 1300;
      await __mal(sechs, 950); aus.langeHaltezeitKurz = ecken(__letzte());
      lw.rueckgaengig(); lw.leeren();
      await __mal(sechs, 1600); aus.langeHaltezeitLang = ecken(__letzte());
      einst.halteMs = 700; lw.leeren();
      // Pfeil: Schaft, dann zwei Widerhaken in einem Zug
      const strecke = (a, b) => { const n = Math.round(Math.hypot(b[0] - a[0], b[1] - a[1]) / 6), r = []; for (let i = 0; i <= n; i++) r.push([a[0] + (b[0] - a[0]) * i / n + (Math.random() - .5) * .8, a[1] + (b[1] - a[1]) * i / n + (Math.random() - .5) * .8]); return r; };
      const A = [300, 600], T = [560, 540], C = [520, 500], D = [525, 585];
      const pfeil = [].concat(strecke(A, T), strecke(T, C).slice(1), strecke(C, T).slice(1), strecke(T, D).slice(1));
      await __mal(pfeil, 950); aus.pfeil = { ecken: ecken(__letzte()), punkte: wiegross() };
      lw.rueckgaengig(); aus.pfeilNachRueckgaengig = { ecken: ecken(__letzte()), punkte: wiegross() };
      lw.leeren();
      return aus;
    })()`);

    // 3. Überkritzeln
    r.kritzeln = await js(`(async () => {
      const lw = __lw(); lw.leeren();
      const wort = x0 => { const p = []; for (let i = 0; i <= 30; i++) p.push([x0 + i * 3, 200 + 8 * Math.sin(i / 2)]); return p; };
      await __mal(wort(300), 50); await __mal(wort(500), 50);
      const vorher = __anzahl();
      const zz = []; for (let i = 0; i <= 14; i++) { const x = 290 + i * 10, a = i % 2 ? 170 : 235, b = i % 2 ? 235 : 170; for (let j = 0; j < 8; j++) zz.push([x + 10 * j / 8, a + (b - a) * j / 8 + (Math.random() - .5)]); }
      await __mal(zz, 50, 8);
      const nach = __anzahl(); lw.rueckgaengig(); const nachUndo = __anzahl();
      await __mal(zz.map(([x, y]) => [x + 600, y - 100]), 50, 8);
      const leerBereich = __anzahl();
      const einst = Werkzeuge.einstellungen(); einst.kritzelLoeschen = false;
      await __mal(zz, 50, 8); const ausgeschaltet = __anzahl(); einst.kritzelLoeschen = true;
      return { vorher, nachKritzeln: nach, nachUndo, leerBereich, ausgeschaltet };
    })()`);

    // 4. Glättung
    r.glaettung = await js(`(async () => {
      const lw = __lw(), einst = Werkzeuge.einstellungen(), aus = {};
      einst.halteForm = false;
      const jitter = p => { let s = 0, n = 0; for (let i = 1; i < p.length - 1; i++) { const dx = p[i][0] - (p[i - 1][0] + p[i + 1][0]) / 2, dy = p[i][1] - (p[i - 1][1] + p[i + 1][1]) / 2; s += dx * dx + dy * dy; n++; } return Math.sqrt(s / n); };
      for (const stufe of ['aus', 'niedrig', 'mittel', 'hoch']) {
        einst.glaettung = stufe; lw.leeren();
        const pts = []; for (let i = 0; i <= 200; i++) { const t = 2 * Math.PI * i / 200 * .8; pts.push([500 + 60 * Math.cos(t) + (Math.random() - .5) * 2.4, 250 + 60 * Math.sin(t) + (Math.random() - .5) * 2.4]); }
        await __mal(pts, 20, 5);
        aus[stufe] = +jitter(__letzte().p).toFixed(2);
      }
      einst.glaettung = 'mittel'; einst.halteForm = true; lw.leeren();
      return aus;
    })()`);

    // 5. Stiftgrösse in Millimetern: ein Strich mit "Mittel" ist 0,8 mm = d in Einheiten
    r.groesse = await js(`(async () => {
      const einst = Werkzeuge.einstellungen(), lw = __lw();
      await __mal([[300, 300], [400, 330], [500, 300]], 20);
      const d = __letzte().d;
      return { presets: einst.presets.stift, einheit: einst.einheit, dMittel: d, mmDavon: +(d / Leinwand.MM).toFixed(2), mmPx: Leinwand.MM };
    })()`);

    /* ===== Notizbuch: neue Seite per Wischen ===== */
    r.seite = await js(`(async () => {
      const id = UI.neueId(), sid = UI.neueId();
      Bibliothek.speichere(id, { art: 'notizbuch', name: 'Test-Notizbuch', eltern: null, format: 'A4', papier: 'karo', farbe: 'gruen', seiten: [sid], erstellt: Date.now(), geoeffnet: Date.now(), seite: 1, favorit: false });
      window.__buch = id;
      location.hash = '#/dok/' + id; await new Promise(ok => setTimeout(ok, 1500));
      const lw = __lw(), cv = document.querySelector('.dok-bereich:not([hidden]) .lw-canvas'); cv.setPointerCapture = () => {}; cv.releasePointerCapture = () => {}; cv.hasPointerCapture = () => true;
      const hr = cv.parentElement.getBoundingClientRect();
      const finger = (typ, x, y) => cv.dispatchEvent(new PointerEvent(typ, { bubbles: true, cancelable: true, pointerId: 21, pointerType: 'touch', isPrimary: true, pressure: typ === 'pointerup' ? 0 : .5, buttons: typ === 'pointerup' ? 0 : 1, button: 0, clientX: hr.left + x, clientY: hr.top + y }));
      const aus = { vorher: lw.seiten().length };
      const x = hr.width * .92; let erst = null; const t0 = performance.now();
      // Wischen (Finger nach oben) bis ans Ende; darüber hinaus gezogen entsteht die Seite sofort, mitten im Wischen
      let hoehePassage = 0;
      for (let durchgang = 0; durchgang < 8; durchgang++) {
        let y = hr.height * .6; finger('pointerdown', x, y);
        for (let i = 0; i < 40; i++) { y -= 12; finger('pointermove', x, y); if (erst === null && lw.seiten().length > aus.vorher) erst = Math.round(performance.now() - t0); await new Promise(ok => setTimeout(ok, 6)); }
        const ende = lw.seiten().length;
        finger('pointerup', x, y); await new Promise(ok => setTimeout(ok, 60));
        if (ende > aus.vorher) { aus.durchgangMitSeite = durchgang; break; }
      }
      aus.nachher = lw.seiten().length; aus.mitBibliothek = Bibliothek.get(__buch).seiten.length; aus.ersteSeiteNachMs = erst;
      // Ein einziges langes Wischen darf nur eine Seite ergeben
      const vor2 = lw.seiten().length;
      for (let k = 0; k < 6; k++) { let y = hr.height * .6; finger('pointerdown', x, y); for (let i = 0; i < 20; i++) { y -= 12; finger('pointermove', x, y); await new Promise(ok => setTimeout(ok, 5)); } finger('pointerup', x, y); await new Promise(ok => setTimeout(ok, 40)); }
      let y = hr.height * .5; finger('pointerdown', x, y);
      for (let i = 0; i < 150; i++) { y -= 12; if (y < 5) y = hr.height * .5; finger('pointermove', x, y); await new Promise(ok => setTimeout(ok, 5)); }
      finger('pointerup', x, y); await new Promise(ok => setTimeout(ok, 100));
      aus.langesWischen = lw.seiten().length - vor2;
      // Tippen auf das Feld "Neue Seite" legt eine Seite an
      return aus;
    })()`);
    await foto('02-notizbuch-tab-und-seiten');
    // Schwung beim Wischen: nach dem Loslassen läuft die Fläche weiter und bremst ab
    r.schwung = await js(`(async () => {
      const lw = __lw(), cv = document.querySelector('.dok-bereich:not([hidden]) .lw-canvas'); cv.setPointerCapture = () => {}; cv.releasePointerCapture = () => {}; cv.hasPointerCapture = () => true;
      const hr = cv.parentElement.getBoundingClientRect();
      const finger = (typ, x, y) => cv.dispatchEvent(new PointerEvent(typ, { bubbles: true, cancelable: true, pointerId: 41, pointerType: 'touch', isPrimary: true, pressure: typ === 'pointerup' ? 0 : .5, buttons: typ === 'pointerup' ? 0 : 1, button: 0, clientX: hr.left + x, clientY: hr.top + y }));
      lw.springeZuSeite(0); await new Promise(ok => setTimeout(ok, 400));
      const x = hr.width * .92; let y = hr.height * .85;
      const y0 = lw.ansicht().y;
      finger('pointerdown', x, y);
      for (let i = 0; i < 10; i++) { y -= 25; finger('pointermove', x, y); await new Promise(ok => setTimeout(ok, 8)); }
      const beimLoslassen = lw.ansicht().y;
      finger('pointerup', x, y);
      const verlauf = [];
      for (let i = 0; i < 8; i++) { await new Promise(ok => setTimeout(ok, 100)); verlauf.push(Math.round(lw.ansicht().y)); }
      const nachlauf = Math.round(beimLoslassen - lw.ansicht().y);
      // Antippen hält an
      lw.springeZuSeite(0); await new Promise(ok => setTimeout(ok, 400));
      y = hr.height * .85; finger('pointerdown', x, y);
      for (let i = 0; i < 10; i++) { y -= 25; finger('pointermove', x, y); await new Promise(ok => setTimeout(ok, 8)); }
      finger('pointerup', x, y); await new Promise(ok => setTimeout(ok, 120));
      const mitte = lw.ansicht().y;
      finger('pointerdown', x, hr.height * .5); finger('pointerup', x, hr.height * .5);
      await new Promise(ok => setTimeout(ok, 300));
      return { gezogen: Math.round(y0 - beimLoslassen), nachlauf, verlauf, nachAntippen: Math.round(mitte - lw.ansicht().y) };
    })()`);

    /* ===== Umwandeln ===== */
    // Notizbuch beschriften, als Whiteboard kopieren, wieder in Seiten
    r.umwandeln = await js(`(async () => {
      const aus = {};
      const lw = __lw(), sid0 = lw.seiten()[0].id, sid1 = lw.seiten()[1].id;
      Daten.set('ink:' + __buch + ':' + sid0, { e: [{ id: 'a1', w: 'stift', f: 'tinte', d: 3, m: Date.now(), p: [[100, 100, .5], [300, 200, .5], [500, 150, .5]] }, { id: 'a2', w: 'stift', f: 'rot', d: 3, m: Date.now(), p: [[700, 1000, .5], [790, 1120, .5], [750, 1160, .5]] }] });
      Daten.set('ink:' + __buch + ':' + sid1, { e: [{ id: 'b1', w: 'stift', f: 'blau', d: 3, m: Date.now(), p: [[50, 50, .5], [200, 300, .5]] }] });
      location.hash = '#/bibliothek'; await new Promise(ok => setTimeout(ok, 600));
      const vorher = Bibliothek.dokumente().length;
      const warteDialog = async () => { for (let i = 0; i < 30; i++) { const d = document.querySelector('dialog[open]'); if (d) return d; await new Promise(ok => setTimeout(ok, 100)); } return null; };
      const p1 = Umwandeln.seitenZuBrett(__buch);
      let d = await warteDialog(); d.querySelector('[type="submit"], button.btn-primaer').click();
      await p1; await new Promise(ok => setTimeout(ok, 500));
      const brett = Bibliothek.dokumente().find(x => x.name === 'Test-Notizbuch (Whiteboard)');
      aus.brett = !!brett && brett.papier === 'whiteboard';
      const inh = Daten.get('ink:' + brett.id + ':' + brett.seiten[0]);
      aus.brettElemente = inh.e.length;   // 2 Rahmen + 3 Striche
      const p2 = Umwandeln.brettZuSeiten(brett.id);
      d = await warteDialog(); d.querySelector('[type="submit"], button.btn-primaer').click();
      await p2; await new Promise(ok => setTimeout(ok, 500));
      const seiten = Bibliothek.dokumente().find(x => x.name === 'Test-Notizbuch (Whiteboard) (Seiten)');
      aus.seiten = seiten && seiten.seiten.length;
      aus.striche = seiten && seiten.seiten.map(s => (Daten.get('ink:' + seiten.id + ':' + s) || { e: [] }).e.length);
      window.__brett2 = brett.id;
      aus.neueDokumente = Bibliothek.dokumente().length - vorher;
      return aus;
    })()`);

    // PNG-Export (Whiteboard und Notizbuch) in den Ordner des Dokuments
    r.png = await js(`(async () => {
      const aus = {};
      const a = await PdfDienst.exportierePng(__brett2);
      aus.brett = { n: a.length, groesse: a[0].blob.size };
      const b = await PdfDienst.exportierePng(__buch, { seite: 0 });
      aus.seite = { n: b.length, groesse: b[0].blob.size };
      const c = await PdfDienst.exportierePng(__buch);
      aus.alle = c.length;
      const pfad = await window.lernheftDesktop.exportiereDatei(__buch, 'Test PNG', await b[0].blob.arrayBuffer(), '.png');
      aus.pfad = pfad;
      const pdf = await PdfDienst.exportiereNotizbuch(__brett2, 'hell');
      aus.pdfBrett = pdf.size;
      return aus;
    })()`);
    r.pngDatei = fs.existsSync(r.png.pfad) ? fs.statSync(r.png.pfad).size : 0;

    /* ===== Aussehen ===== */
    // Start ohne Dashboard und Mathe des Tages; Seitenfarbe und feines Karo; Werkzeugleiste einklappen
    r.start = await js(`(async () => {
      location.hash = '#/'; await new Promise(ok => setTimeout(ok, 500));
      const aus = { bereichStart: document.documentElement.dataset.bereich, dashboard: !!document.getElementById('ansicht-dashboard'), mathe: !!document.getElementById('ansicht-mathe'), tafel: typeof Tafel, menue: [...document.querySelectorAll('#menue-liste a')].map(a => a.textContent.trim()) };
      location.hash = '#/mathe'; await new Promise(ok => setTimeout(ok, 400));
      aus.matheUmgeleitet = document.documentElement.dataset.bereich;
      return aus;
    })()`);
    r.seitenfarbe = await js(`(async () => {
      Bibliothek.aendere(__buch, x => { x.seitenfarbe = 'dunkelgrau'; x.papier = 'karofein'; });
      Dokument.schliesseTab(__buch);
      location.hash = '#/dok/' + __buch; await new Promise(ok => setTimeout(ok, 1200));
      const s = __lw().seiten()[0];
      return { farbe: s.papierFarbe, papier: s.papier, papiere: Object.keys(Bibliothek.PAPIERE), sfarben: Object.keys(Bibliothek.SEITENFARBEN) };
    })()`);
    await foto('02b-seitenfarbe-dunkelgrau-karofein');
    r.leiste = await js(`(async () => {
      const l = document.querySelector('#dok-leiste .dok-leiste'), h0 = l.getBoundingClientRect().height;
      const aus = { hoehe: Math.round(h0), btn: Math.round(l.querySelector('.wz').getBoundingClientRect().width) };
      l.querySelector('[data-el="leiste-zu"]').click(); await new Promise(ok => setTimeout(ok, 500));
      const f = document.querySelector('.dok-bereich:not([hidden]) .dok-flaeche').getBoundingClientRect();
      aus.zu = l.classList.contains('leiste-zu'); aus.flaecheHoehe = Math.round(f.height); aus.leisteZuHoehe = Math.round(l.getBoundingClientRect().height);
      return aus;
    })()`);
    await foto('02c-leiste-eingeklappt');
    await js(`document.querySelector('#dok-leiste [data-el="leiste-zu"]').click(); 0`);
    await warte(400);
    r.anzeige = await js(`(async () => {
      const z = document.querySelector('.dok-bereich:not([hidden]) .seitenanzeige');
      const vorher = z.classList.contains('da');
      const cv = document.querySelector('.dok-bereich:not([hidden]) .lw-canvas');
      cv.parentElement.dispatchEvent(new WheelEvent('wheel', { deltaY: 200, bubbles: true, cancelable: true }));
      await new Promise(ok => setTimeout(ok, 300));
      const waehrend = z.classList.contains('da'), text = z.textContent;
      await new Promise(ok => setTimeout(ok, 1800));
      return { vorher, waehrend, text, nachher: z.classList.contains('da') };
    })()`);
    await foto('02d-leiste-schlank');
    await js(`location.hash = '#/dok/' + __buch; 0`);
    await warte(1200);
    await foto('03-tabs-aktiv');
    // Symbole per Ziehen umsortieren
    r.ziehen = await js(`(async () => {
      const l = document.querySelector('#dok-leiste .dok-leiste');
      const ids = () => [...l.querySelectorAll('[data-ord]')].map(b => b.dataset.ord);
      const vorher = ids();
      const von = l.querySelector('[data-ord="w:marker"]'), nach = l.querySelector('[data-ord="w:hand"]');
      const rv = von.getBoundingClientRect(), rn = nach.getBoundingClientRect();
      const ev = (typ, x, y) => new PointerEvent(typ, { pointerId: 31, pointerType: 'mouse', isPrimary: true, clientX: x, clientY: y, buttons: typ === 'pointerup' ? 0 : 1, button: 0, bubbles: true, cancelable: true });
      von.setPointerCapture = () => {};
      von.dispatchEvent(ev('pointerdown', rv.left + 20, rv.top + 20));
      for (let i = 1; i <= 12; i++) { von.dispatchEvent(ev('pointermove', rv.left + 20 + (rn.left - rv.left - 15) * i / 12, rv.top + 20)); await new Promise(ok => setTimeout(ok, 15)); }
      von.dispatchEvent(ev('pointerup', rn.left + 5, rn.top + 20));
      await new Promise(ok => setTimeout(ok, 100));
      return { vorher: vorher.join(' '), nachher: ids().join(' '), gespeichert: JSON.stringify(Daten.get('lokal:leiste-reihenfolge')).length > 10 };
    })()`);
    await foto('02e-leiste-umsortiert');
    await js(`Dokument.leinwand() && document.querySelector('#dok-leiste [data-werkzeug="stift"]') ? 0 : 0`);
    r.raster = await js(`(() => {
      const F = Leinwand.FORMATE.A4, mm = F.b / F.mm, soll = 5 * mm;
      const nx = Math.round(F.b / soll), ny = Math.round(F.h / soll);
      return { nx, ny, zelleX: +(F.b / nx / mm).toFixed(3), zelleY: +(F.h / ny / mm).toFixed(3) };
    })()`);
    await js(`Dokument.vollbild(true); 0`);
    await warte(1500);
    r.vollbild = await js(`(() => { const lw = __lw(); const a = lw.ansicht(); const s = lw.seiten()[0]; return { zoom: +a.s.toFixed(2), fensterB: a.b, seitenBreiteBild: Math.round(s.b * a.s), randJeSeite: Math.round((a.b - s.b * a.s) / 2) }; })()`);
    r.vollbildPalette = await js(`(async () => {
      const l = document.querySelector('#dok-leiste .dok-leiste'), st = l.querySelector('[data-werkzeug="stift"]'), ma = l.querySelector('[data-werkzeug="marker"]');
      const knopf = getComputedStyle(l.querySelector('.eig-knopf')).display;
      const zustand = () => l.classList.contains('eig-offen');
      const aus = { palettenknopf: knopf, anfang: zustand() };
      ma.click(); await new Promise(ok => setTimeout(ok, 100)); aus.nachMarker = zustand();
      ma.click(); await new Promise(ok => setTimeout(ok, 100)); aus.nachMarkerNochmal = zustand();
      st.click(); await new Promise(ok => setTimeout(ok, 100)); aus.nachStift = zustand();
      return aus;
    })()`);
    await foto('04b-vollbild-palette');
    await foto('04-vollbild');
    await js(`Dokument.vollbild(false); 0`);
    await warte(800);
    r.nachVollbild = await js(`(() => { const a = __lw().ansicht(); return { zoom: +a.s.toFixed(2) }; })()`);

    for (const hg of ['dunkelgrau', 'dunkelblau', 'weiss']) {
      await js(`Daten.set('lokal:bib-hintergrund', '${hg}'); document.documentElement.dataset.bibHg = '${hg}'; location.hash = '#/bibliothek'; 0`);
      await warte(900);
      await foto('05-bibliothek-' + hg);
    }
    r.bibliothek = await js(`(() => ({ bereich: document.documentElement.dataset.bereich, hg: document.documentElement.dataset.bibHg, bild: getComputedStyle(document.body).backgroundImage, farbe: getComputedStyle(document.body).backgroundColor, karten: document.querySelectorAll('.karte').length, reiter: [...document.querySelectorAll('[data-reiter]')].map(k => k.textContent) }))()`);
    await js(`Daten.set('lokal:bib-hintergrund', 'dunkelblau'); document.documentElement.dataset.bibHg = 'dunkelblau'; 0`);

    // Einstellungen-Dialog
    await js(`document.getElementById('menue-einstellungen').click(); 0`);
    await warte(700);
    await foto('06-einstellungen');
    r.einstellungenFelder = await js(`[...document.querySelectorAll('dialog[open] [name]')].map(x => x.name)`);
    await js(`document.querySelector('dialog[open] [data-abbrechen]').click(); 0`);
    await warte(300);

    // Speichern: ist alles in Dateien gelandet?
    await warte(1500);
    r.dateien = fs.readdirSync(path.join(WURZEL, 'Bibliothek'), { recursive: true }).filter(f => /\.(lhz|json|png)$/.test(f)).map(f => f.replace(/\\/g, '/'));
    r.sicherungSeiten = fs.existsSync(path.join(WURZEL, 'Daten', 'Sicherung-Seiten')) ? fs.readdirSync(path.join(WURZEL, 'Daten', 'Sicherung-Seiten')).length : 0;
  } catch (e) { r.fehler = String(e && e.stack || e); }
  r.konsole = log;
  fs.writeFileSync(path.join(AUS, 'funktionen.json'), JSON.stringify(r, null, 2));
  app.exit(0);
});
