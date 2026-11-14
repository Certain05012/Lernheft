'use strict';
// Prüflauf für die Oberfläche in der echten App (eigener Testordner, fasst die echten Daten nicht an):
//   - genau eine Werkzeugleiste, mittig, in allen Zuständen (normal, zwei Dokumente nebeneinander, Vollbild, eingeklappt)
//   - Farbreihe: gleichmässig über die ganze Breite, nichts abgeschnitten
//   - Mauszeiger als Punkt, Laserpointer (leuchtet nur gedrückt, zeichnet nichts, verblasst), Bibliothek in allen Hintergründen
// Aufruf: electron test/oberflaeche.js <ausgabeordner>      (vorher Lernheft schliessen, Port 47823)
// Schreibt Bildschirmfotos und oberflaeche.json in den Ausgabeordner.
const { app, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');

const AUS = path.resolve(process.argv[2]);
const WURZEL = path.join(AUS, 'Lernheft');
const BREITE = Number(process.argv[3]) || 1400, HOEHE = Number(process.argv[4]) || 900;
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
  wc.on('console-message', (e, l, m) => { if (l >= 2 && !/Electron Security Warning/.test(m)) log.push(m); });
  win.setSize(BREITE, HOEHE);
  win.show(); win.focus();
  await new Promise(r => wc.once('did-finish-load', r));
  await warte(2000);
  const js = c => wc.executeJavaScript(c, true);
  const foto = async n => { await warte(450); fs.writeFileSync(path.join(AUS, n + '.png'), (await wc.capturePage()).toPNG()); };
  const r = {};
  try {
    await js(`(() => {
      // Sichtbare Werkzeugleisten und wo sie stehen
      window.__leisten = () => [...document.querySelectorAll('.dok-leiste')].filter(l => { const b = l.getBoundingClientRect(); const cs = getComputedStyle(l); return b.width > 0 && b.height > 0 && cs.display !== 'none' && cs.visibility !== 'hidden' && !l.closest('[hidden]'); }).map(l => {
        const b = l.getBoundingClientRect();
        return { zu: l.classList.contains('leiste-zu'), mitte: Math.round(b.left + b.width / 2), links: Math.round(b.left), rechts: Math.round(b.right), oben: Math.round(b.top), hoehe: Math.round(b.height) };
      });
      window.__flaechen = () => [...document.querySelectorAll('.dok-bereich:not([hidden]) .dok-flaeche')].map(f => { const b = f.getBoundingClientRect(); return [Math.round(b.left), Math.round(b.top), Math.round(b.width), Math.round(b.height)]; });
      window.__neuesBuch = async (name) => {
        const id = UI.neueId(), sid = UI.neueId();
        Bibliothek.speichere(id, { art: 'notizbuch', name, eltern: null, format: 'A4', papier: 'karo', farbe: 'blau', seiten: [sid], erstellt: Date.now(), geoeffnet: Date.now(), seite: 1, favorit: false });
        return id;
      };
      window.__warte = ms => new Promise(ok => setTimeout(ok, ms));
    })()`);
    const A = await js(`__neuesBuch('Buch A')`), B = await js(`__neuesBuch('Buch B')`);

    /* ===== 1. Leiste in allen Zuständen ===== */
    await js(`location.hash = '#/dok/${A}'; 0`); await warte(1600);
    r.normal = await js(`({ leisten: __leisten(), fenster: innerWidth, flaechen: __flaechen() })`);
    await foto('01-normal');

    await js(`Dokument.daneben('${B}'); 0`); await warte(1500);
    r.nebeneinander = await js(`({ leisten: __leisten(), fenster: innerWidth, flaechen: __flaechen(), tabs: Dokument.tabs() })`);
    await foto('02-nebeneinander-links-im-fokus');
    // Fokus auf das rechte Dokument: dieselbe eine Leiste, die Flächen springen nicht
    await js(`(() => { const cv = document.querySelectorAll('.dok-bereich:not([hidden]) .lw-canvas')[1]; cv.setPointerCapture = () => {}; cv.releasePointerCapture = () => {}; cv.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 5, pointerType: 'mouse', button: 0, buttons: 1, clientX: innerWidth * .8, clientY: innerHeight * .6 })); cv.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerId: 5, pointerType: 'mouse', button: 0, buttons: 0, clientX: innerWidth * .8, clientY: innerHeight * .6 })); })()`);
    await warte(600);
    r.nebeneinanderRechts = await js(`({ leisten: __leisten(), flaechen: __flaechen(), fokus: Dokument.tabs().fokus, id: Dokument.id() })`);
    await foto('03-nebeneinander-rechts-im-fokus');

    // Eingeklappt (nebeneinander)
    await js(`document.querySelector('[data-el="leiste-zu"]').click(); 0`); await warte(500);
    r.nebeneinanderZu = await js(`({ leisten: __leisten(), flaechen: __flaechen() })`);
    await foto('04-nebeneinander-eingeklappt');
    await js(`document.querySelector('[data-el="leiste-zu"]').click(); 0`); await warte(500);
    r.nebeneinanderWieder = await js(`({ leisten: __leisten(), flaechen: __flaechen() })`);

    // Vollbild (nebeneinander: zeigt nur das Dokument im Fokus)
    await js(`Dokument.vollbild(true); 0`); await warte(1600);
    r.vollbild = await js(`({ leisten: __leisten(), fenster: innerWidth, flaechen: __flaechen() })`);
    await foto('05-vollbild');
    await js(`document.querySelector('.dok-leiste [data-el="leiste-zu"]').click(); 0`); await warte(500);
    r.vollbildZu = await js(`({ leisten: __leisten() })`);
    await foto('06-vollbild-eingeklappt');
    await js(`document.querySelector('.dok-leiste [data-el="leiste-zu"]').click(); 0`); await warte(400);
    await js(`Dokument.vollbild(false); 0`); await warte(1400);
    r.nachVollbild = await js(`({ leisten: __leisten(), flaechen: __flaechen() })`);
    // Wechsel Vollbild an/aus mehrfach: immer genau eine Leiste
    r.wechsel = [];
    for (let i = 0; i < 4; i++) {
      await js(`Dokument.vollbild(${i % 2 === 0}); 0`); await warte(350);
      r.wechsel.push((await js(`__leisten()`)).length);
    }
    await js(`Dokument.vollbild(false); 0`); await warte(900);

    // Nicht mehr nebeneinander, Bibliothek und zurück
    await js(`Dokument.schliesseTab('${B}'); 0`); await warte(700);
    r.einTab = await js(`({ leisten: __leisten() })`);
    await js(`location.hash = '#/bibliothek'; 0`); await warte(600);
    r.inBibliothek = await js(`({ leisten: __leisten() })`);
    await js(`location.hash = '#/dok/${A}'; 0`); await warte(900);
    r.zurueck = await js(`({ leisten: __leisten() })`);

    /* ===== 2. Farbreihe ===== */
    r.farbreihe = await js(`(async () => {
      const l = document.querySelector('.dok-bereich:not([hidden]) .dok-leiste') || document.querySelector('.dok-leiste');
      const aus = {};
      const messe = name => {
        const g = [...l.querySelectorAll('.farbreihe')].find(x => getComputedStyle(x).display !== 'none' && x.getBoundingClientRect().width > 0);
        if (!g) return null;
        const gb = g.getBoundingClientRect(), k = [...g.querySelectorAll('.wz')].filter(b => b.getBoundingClientRect().width > 0).map(b => b.getBoundingClientRect());
        const ab = k.slice(1).map((b, i) => Math.round((b.left - k[i].right) * 10) / 10);
        return { gruppe: Math.round(gb.width), anzahl: k.length, erstesLinks: Math.round(k[0].left - gb.left), letztesRechts: Math.round(gb.right - k[k.length - 1].right), breiten: [...new Set(k.map(b => Math.round(b.width)))], abstaende: [...new Set(ab)], abgeschnitten: k.some(b => b.left < gb.left - 0.5 || b.right > gb.right + 0.5), toolbarBreite: Math.round(l.getBoundingClientRect().width), scrollBreit: l.scrollWidth > l.clientWidth + 1 };
      };
      aus.stift = messe('stift');
      l.querySelector('[data-werkzeug="marker"]').click(); await __warte(150); aus.marker = messe('marker');
      l.querySelector('[data-werkzeug="notiz"]').click(); await __warte(150); aus.notiz = messe('notiz');
      l.querySelector('[data-werkzeug="laser"]').click(); await __warte(150); aus.laser = messe('laser');
      l.querySelector('[data-werkzeug="stift"]').click(); await __warte(150);
      // viele eigene Farben
      const e = Werkzeuge.einstellungen(); e.eigeneFarben = ['#112233','#223344','#334455','#445566','#556677','#667788','#778899','#8899aa','#99aabb','#aabbcc']; Werkzeuge.speichereEinst(); await __warte(200);
      aus.stiftVielFarben = messe('viel');
      e.eigeneFarben = []; Werkzeuge.speichereEinst(); await __warte(100);
      return aus;
    })()`);
    await foto('07-farbreihe-stift');

    /* ===== 3. Mauszeiger als Punkt ===== */
    r.cursor = await js(`(async () => {
      const l = document.querySelector('.dok-leiste'), cv = document.querySelector('.dok-bereich:not([hidden]) .lw-canvas'), aus = {};
      const art = () => { const c = cv.style.cursor; return !c ? '(Standard)' : /svg/.test(c) ? 'Punkt/Ring (SVG)' : c; };
      const gross = () => { const m = /width%3D%22(\\d+)%22/.exec(cv.style.cursor); return m ? Number(m[1]) : 0; };
      aus.hover = matchMedia('(any-hover: hover)').matches;
      for (const w of ['stift', 'marker', 'radierer', 'laser', 'lasso', 'notiz', 'hand']) { l.querySelector('[data-werkzeug="' + w + '"]').click(); await __warte(120); aus[w] = art() + (gross() ? ' ' + gross() + ' px' : ''); }
      l.querySelector('[data-werkzeug="stift"]').click(); await __warte(100);
      const klein = gross(); l.querySelector('[data-preset="gross"]').click(); await __warte(100); const grossPx = gross();
      aus.groesseFolgtDerDicke = { klein, gross: grossPx };
      l.querySelector('[data-preset="mittel"]').click(); await __warte(100);
      const fa = cv.style.cursor; l.querySelector('[data-farbe="rot"]').click(); await __warte(100);
      aus.farbeFolgt = fa !== cv.style.cursor;
      return aus;
    })()`);

    /* ===== 4. Laserpointer ===== */
    r.laser = await js(`(async () => {
      const l = document.querySelector('.dok-leiste'), host = document.querySelector('.dok-bereich:not([hidden]) .leinwand'), cv = host.querySelector('.lw-canvas'), live = host.querySelector('.lw-live'), aus = {};
      cv.setPointerCapture = () => {}; cv.releasePointerCapture = () => {}; cv.hasPointerCapture = () => true;
      const lw = Dokument.leinwand(), sid = lw.seiten()[0].id;
      const vorher = lw.inhalt(sid).e.length, gespeichert = JSON.stringify(Daten.get('ink:' + Dokument.id() + ':' + sid) || null);
      l.querySelector('[data-werkzeug="laser"]').click(); await __warte(100);
      aus.farbeStandard = Werkzeuge.einstellungen().laserFarbe;
      const hr = host.getBoundingClientRect();
      const ev = (typ, x, y, art, knopf) => cv.dispatchEvent(new PointerEvent(typ, { bubbles: true, cancelable: true, pointerId: 9, pointerType: art, isPrimary: true, clientX: hr.left + x, clientY: hr.top + y, pressure: knopf ? .5 : 0, buttons: knopf ? 1 : 0, button: 0 }));
      // Die Spur liegt seit 3.13 auf einer eigenen Ebene (.lw-laserspur, erst beim Benutzen angelegt), der Punkt ist ein Element
      const pixel = () => { const spur = host.querySelector('.lw-laserspur') || live; const c = spur.getContext('2d'), d = c.getImageData(0, 0, spur.width, spur.height).data; let n = 0, rot = 0; for (let i = 3; i < d.length; i += 4) if (d[i] > 20) { n++; if (d[i - 3] > 180 && d[i - 2] < 120) rot++; } return { gefuellt: n, rot }; };
      // Stift (gedrückt) zeichnet eine Spur
      ev('pointerdown', 300, 300, 'pen', true);
      for (let i = 1; i <= 30; i++) { ev('pointermove', 300 + i * 8, 300 + 40 * Math.sin(i / 4), 'pen', true); await __warte(10); }
      aus.waehrend = pixel();
      aus.cursorWaehrend = !!cv.style.cursor;
      ev('pointerup', 540, 300, 'pen', false);
      await __warte(250); aus.kurzNach = pixel();
      await __warte(2000); aus.nach2s = pixel();
      // Maus oder Stift schweben nur über der Fläche (ohne Taste, ohne Aufsetzen): der Laser bleibt aus
      ev('pointermove', 400, 400, 'mouse', false); ev('pointermove', 420, 410, 'mouse', false); await __warte(100);
      aus.schwebend = pixel();
      ev('pointermove', 400, 420, 'pen', false); ev('pointermove', 430, 430, 'pen', false); await __warte(100);
      aus.stiftSchwebend = pixel();
      // Maus- bzw. Touchpad-Taste gedrückt: leuchtet
      ev('pointerdown', 400, 450, 'mouse', true); for (let i = 1; i <= 8; i++) { ev('pointermove', 400 + i * 10, 450, 'mouse', true); await __warte(10); }
      aus.mausGedrueckt = pixel(); ev('pointerup', 480, 450, 'mouse', false); await __warte(1800);
      cv.dispatchEvent(new PointerEvent('pointerleave', { bubbles: false, pointerId: 9, pointerType: 'mouse' }));
      await __warte(2000); aus.schwebendNach2s = pixel();
      // Finger
      ev('pointerdown', 300, 500, 'touch', true); for (let i = 1; i <= 10; i++) { ev('pointermove', 300 + i * 10, 500, 'touch', true); await __warte(10); }
      aus.finger = pixel(); ev('pointerup', 400, 500, 'touch', false); await __warte(2000);
      aus.fingerNach2s = pixel();
      // Nichts gezeichnet, nichts gespeichert
      aus.striche = { vorher, nachher: lw.inhalt(sid).e.length, ungesichert: lw.ungesichert(), unveraendert: gespeichert === JSON.stringify(Daten.get('ink:' + Dokument.id() + ':' + sid) || null) };
      aus.verlaufLeer = !lw.kannRueckgaengig();
      // Farbe und Grösse einstellbar
      l.querySelector('[data-laserfarbe="#3d8bff"]').click(); await __warte(80);
      aus.farbeBlau = Werkzeuge.einstellungen().laserFarbe;
      l.querySelector('[data-preset="gross"]').click(); await __warte(80);
      aus.groesse = Werkzeuge.einstellungen().laserGroesse;
      l.querySelector('[data-laserfarbe="#ff2d2d"]').click(); await __warte(80);
      return aus;
    })()`);
    // Spur für das Foto sichtbar halten
    await js(`(async () => {
      const host = document.querySelector('.dok-bereich:not([hidden]) .leinwand'), cv = host.querySelector('.lw-canvas'), hr = host.getBoundingClientRect();
      cv.setPointerCapture = () => {}; cv.hasPointerCapture = () => true; cv.releasePointerCapture = () => {};
      const ev = (typ, x, y) => cv.dispatchEvent(new PointerEvent(typ, { bubbles: true, cancelable: true, pointerId: 9, pointerType: 'pen', isPrimary: true, clientX: hr.left + x, clientY: hr.top + y, pressure: .5, buttons: typ === 'pointerup' ? 0 : 1, button: 0 }));
      ev('pointerdown', 300, 300);
      for (let i = 1; i <= 40; i++) { ev('pointermove', 300 + i * 9, 300 + 50 * Math.sin(i / 5)); await new Promise(ok => setTimeout(ok, 8)); }
      window.__laserFoto = true;
    })()`);
    await foto('08-laserpointer');
    await js(`(() => { const host = document.querySelector('.dok-bereich:not([hidden]) .leinwand'), cv = host.querySelector('.lw-canvas'); cv.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerId: 9, pointerType: 'pen', buttons: 0, button: 0 })); document.querySelector('.dok-leiste [data-werkzeug="stift"]').click(); })()`);
    await warte(1800);

    /* ===== 4b. Touch: Handballen, Finger schreibt, zwei Finger zoomen ohne Strich ===== */
    r.touch = await js(`(async () => {
      const l = document.querySelector('#dok-leiste .dok-leiste'), host = document.querySelector('.dok-bereich:not([hidden]) .leinwand'), cv = host.querySelector('.lw-canvas'), aus = {};
      cv.setPointerCapture = () => {}; cv.releasePointerCapture = () => {}; cv.hasPointerCapture = () => true;
      const lw = Dokument.leinwand(), sid = lw.seiten()[0].id, einst = Werkzeuge.einstellungen();
      lw.leeren(); l.querySelector('[data-werkzeug="stift"]').click(); einst.finger = true; await __warte(100);
      const hr = host.getBoundingClientRect();
      const ev = (typ, id, x, y, art, extra) => cv.dispatchEvent(new PointerEvent(typ, Object.assign({ bubbles: true, cancelable: true, pointerId: id, pointerType: art, isPrimary: id === 31 || id === 7, clientX: hr.left + x, clientY: hr.top + y, pressure: typ === 'pointerup' ? 0 : .5, buttons: typ === 'pointerup' ? 0 : 1, button: 0 }, extra || {})));
      const anzahl = () => lw.inhalt(sid).e.length;
      const zoom0 = lw.ansicht().s;
      // Ein Finger schreibt (Finger-Schreiben ist an)
      ev('pointerdown', 31, 300, 300, 'touch'); for (let i = 1; i <= 20; i++) { ev('pointermove', 31, 300 + i * 8, 300 + 10 * Math.sin(i / 3), 'touch'); await __warte(8); } ev('pointerup', 31, 460, 300, 'touch'); await __warte(100);
      aus.fingerSchreibt = anzahl();
      // Zwei Finger zoomen: kein Strich, nur die Ansicht ändert sich
      const vor = anzahl();
      ev('pointerdown', 32, 400, 400, 'touch'); await __warte(20);
      ev('pointerdown', 33, 600, 400, 'touch'); await __warte(20);
      for (let i = 1; i <= 15; i++) { ev('pointermove', 32, 400 - i * 6, 400, 'touch'); ev('pointermove', 33, 600 + i * 6, 400, 'touch'); await __warte(10); }
      ev('pointerup', 32, 310, 400, 'touch'); ev('pointerup', 33, 690, 400, 'touch'); await __warte(150);
      aus.zweiFingerStriche = anzahl() - vor; aus.zweiFingerZoom = +(lw.ansicht().s / zoom0).toFixed(2);
      // Zwei Finger, der zweite setzt erst mitten im Strich auf: der Strich wird verworfen
      ev('pointerdown', 34, 300, 500, 'touch'); for (let i = 1; i <= 8; i++) { ev('pointermove', 34, 300 + i * 8, 500, 'touch'); await __warte(8); }
      ev('pointerdown', 35, 500, 500, 'touch'); await __warte(30); ev('pointermove', 34, 380, 505, 'touch'); ev('pointermove', 35, 520, 505, 'touch'); await __warte(30);
      ev('pointerup', 34, 380, 505, 'touch'); ev('pointerup', 35, 520, 505, 'touch'); await __warte(150);
      aus.zweiterFingerMittendrin = anzahl() - vor;
      // Handballen: grosse Berührfläche
      const v1 = anzahl(); ev('pointerdown', 41, 300, 600, 'touch', { width: 90, height: 120 }); for (let i = 1; i <= 10; i++) { ev('pointermove', 41, 300 + i * 6, 600, 'touch', { width: 90, height: 120 }); await __warte(8); } ev('pointerup', 41, 360, 600, 'touch', { width: 90, height: 120 }); await __warte(120);
      aus.handballenStriche = anzahl() - v1;
      // Stift schwebt (ohne Berührung), kurz danach berührt eine Hand: ignoriert
      const v2 = anzahl(); ev('pointermove', 7, 500, 650, 'pen', { buttons: 0, pressure: 0 }); await __warte(40);
      ev('pointerdown', 42, 300, 700, 'touch'); for (let i = 1; i <= 10; i++) { ev('pointermove', 42, 300 + i * 6, 700, 'touch'); await __warte(8); } ev('pointerup', 42, 360, 700, 'touch'); await __warte(120);
      aus.handNachStiftSchwebt = anzahl() - v2;
      // Nach einer Pause wieder normal
      await __warte(900);
      const v3 = anzahl(); ev('pointerdown', 43, 300, 750, 'touch'); for (let i = 1; i <= 10; i++) { ev('pointermove', 43, 300 + i * 6, 750, 'touch'); await __warte(8); } ev('pointerup', 43, 360, 750, 'touch'); await __warte(120);
      aus.nachPause = anzahl() - v3;
      einst.finger = false; lw.leeren();
      return aus;
    })()`);

    /* ===== 5. Bibliothek ===== */
    for (const hg of ['weiss', 'dunkelgrau', 'dunkelblau']) {
      await js(`Daten.set('lokal:bib-hintergrund', '${hg}'); document.documentElement.dataset.bibHg = '${hg}'; location.hash = '#/bibliothek'; 0`);
      await warte(900);
      await foto('09-bibliothek-' + hg);
    }
    await js(`Daten.set('lokal:bib-hintergrund', 'dunkelblau'); 0`);
    r.fehler = null;
  } catch (e) { r.fehler = String(e && e.stack || e); }
  r.konsole = log;
  fs.writeFileSync(path.join(AUS, 'oberflaeche.json'), JSON.stringify(r, null, 2));
  app.exit(0);
});
