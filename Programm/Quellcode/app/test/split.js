'use strict';
// Prüflauf für die Trennlinie zwischen zwei Dokumenten (Varianten A bis D), Vollbild mit Split und Touch, in der echten App.
// Aufruf: electron test/split.js <ausgabeordner> <vorlage mit Bibliothek und Daten> [breite hoehe]   (vorher Lernheft schliessen)
// Misst für jede Variante mit derselben Zugbewegung: Bilder pro Sekunde, längstes Bild, langsame Bilder (> 33 ms), Layout-Zeit
// je Bild, wie oft die Schreibflächen neu angelegt wurden, und wie viel Hauptthread-Zeit ("Long Tasks") der Zug brauchte.
// Schreibt split.json und Bildschirmfotos in den Ausgabeordner.
const { app, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');

const AUS = path.resolve(process.argv[2]);
const VORLAGE = path.resolve(process.argv[3]);
const BREITE = Number(process.argv[4]) || 1400, HOEHE = Number(process.argv[5]) || 900;
const WURZEL = path.join(AUS, 'Lernheft');
fs.rmSync(AUS, { recursive: true, force: true });
fs.mkdirSync(path.join(WURZEL, 'Programm'), { recursive: true });
for (const t of ['Bibliothek', 'Daten']) fs.cpSync(path.join(VORLAGE, t), path.join(WURZEL, t), { recursive: true });
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
  wc.on('console-message', (e, l, m) => { if (l >= 2 && !/Electron Security Warning|willReadFrequently/.test(m)) log.push(m); });
  win.setSize(BREITE, HOEHE);
  win.show(); win.focus();
  await new Promise(r => wc.once('did-finish-load', r));
  await warte(2000);
  const js = c => wc.executeJavaScript(c, true);
  const foto = async n => { await warte(300); fs.writeFileSync(path.join(AUS, n + '.png'), (await wc.capturePage()).toPNG()); };
  const r = { fenster: [BREITE, HOEHE] };
  try {
    await js(`(() => {
      window.__warte = ms => new Promise(ok => setTimeout(ok, ms));
      window.__leisten = () => [...document.querySelectorAll('.dok-leiste')].filter(l => { const b = l.getBoundingClientRect(), cs = getComputedStyle(l); return b.width > 0 && b.height > 0 && cs.display !== 'none' && !l.closest('[hidden]'); }).length;
      window.__flaechen = () => [...document.querySelectorAll('.dok-bereich')].filter(p => p.getBoundingClientRect().width > 0).map(p => { const b = p.querySelector('.dok-flaeche').getBoundingClientRect(); return [Math.round(b.left), Math.round(b.top), Math.round(b.width), Math.round(b.height)]; });
      window.__tb = () => { const b = document.getElementById('dok-teiler').getBoundingClientRect(); return { sichtbar: b.width > 0 && b.height > 0, mitteX: Math.round(b.left + b.width / 2), mitteY: Math.round(b.top + b.height / 2), b: Math.round(b.width), h: Math.round(b.height) }; };
      // Long Tasks des Hauptthreads sammeln
      window.__lang = []; try { new PerformanceObserver(l => l.getEntries().forEach(e => window.__lang.push(e.duration))).observe({ entryTypes: ['longtask'] }); } catch (e) { /* ohne */ }
      // Zug der Trennlinie: von der Mitte nach links, nach rechts und zurück; art: 'mouse' | 'touch' | 'pen'
      window.__ziehe = async (art, schritte, abstand) => {
        const t = document.getElementById('dok-teiler'), b = t.getBoundingClientRect(), vert = b.height < b.width;
        const x0 = b.left + b.width / 2, y0 = b.top + b.height / 2, id = 51;
        const ev = (typ, x, y) => t.dispatchEvent(new PointerEvent(typ, { bubbles: true, cancelable: true, pointerId: id, pointerType: art, isPrimary: true, clientX: x, clientY: y, buttons: typ === 'pointerup' ? 0 : 1, button: 0, pressure: .5 }));
        const wiege = document.getElementById('dok-bereiche').getBoundingClientRect();
        const spanne = (vert ? wiege.height : wiege.width) * 0.2;
        window.__lang.length = 0;
        const bilder = []; let laeuft = true; const tick = z => { if (!laeuft) return; bilder.push(z); requestAnimationFrame(tick); }; requestAnimationFrame(tick);
        const t0 = performance.now();
        ev('pointerdown', x0, y0);
        const weg = i => { const u = i / schritte; return spanne * (u < .25 ? -u * 4 : u < .75 ? -1 + (u - .25) * 4 : 1 - (u - .75) * 4); };
        for (let i = 1; i <= schritte; i++) { const d = weg(i); ev('pointermove', vert ? x0 : x0 + d, vert ? y0 + d : y0); await new Promise(ok => setTimeout(ok, abstand)); }
        const ende0 = performance.now();
        ev('pointerup', x0, y0);
        const loslassMs = Math.round(performance.now() - ende0);
        await new Promise(ok => setTimeout(ok, 450));
        laeuft = false;
        const iv = bilder.slice(1).map((z, i) => z - bilder[i]).slice(1);
        const nachLoslassen = bilder.filter(z => z >= ende0).slice(0, 4).map((z, i, a) => i ? Math.round(z - a[i - 1]) : Math.round(z - ende0));
        return { dauer: Math.round(performance.now() - t0), fps: Math.round(10 * 1000 * iv.length / iv.reduce((a, b) => a + b, 0)) / 10, maxMs: Math.round(Math.max(...iv)), langsam: iv.filter(d => d > 33.4).length, langeBilder: bilder.slice(1).map((z, i) => [Math.round(bilder[i] - t0), Math.round(z - bilder[i])]).filter(x => x[1] > 100), loslassMs, ersteBilderNachLoslassen: nachLoslassen, longTasks: window.__lang.length, longTaskMs: Math.round(window.__lang.reduce((a, b) => a + b, 0)) };
      };
    })()`);

    // Zwei Dokumente: das Skript (PDF) und ein vollgeschriebenes Notizbuch
    r.aufbau = await js(`(async () => {
      const skript = Bibliothek.dokumente().find(d => d.art === 'skript');
      const id = UI.neueId(), sid = UI.neueId();
      Bibliothek.speichere(id, { art: 'notizbuch', name: 'Voll', eltern: null, format: 'A4', papier: 'karo', farbe: 'blau', seiten: [sid], erstellt: Date.now(), geoeffnet: Date.now(), seite: 1, favorit: false });
      let z = 5; const zuf = () => (z = (z * 16807) % 2147483647) / 2147483647;
      const e = [];
      for (let k = 0; k < 700; k++) { const p = []; let x = 40 + zuf() * 600, y = 40 + zuf() * 1000; for (let i = 0; i < 40; i++) { x += zuf() * 5; y += (zuf() - .5) * 4; p.push([Math.round(x * 10) / 10, Math.round(y * 10) / 10, .5]); } e.push({ id: 's' + k, w: 'stift', f: k % 3 ? 'tinte' : 'rot', d: 3, m: Date.now(), p }); }
      Daten.set('ink:' + id + ':' + sid, { e });
      window.__ids = { skript: skript.id, buch: id };
      location.hash = '#/dok/' + skript.id; await __warte(2500);
      Dokument.daneben(id); await __warte(2500);
      return { skript: skript.name, striche: e.length, tabs: Dokument.tabs() };
    })()`);
    r.leerlaufFps = await js(`new Promise(ok => { const z = []; const f = t => { z.push(t); if (z.length < 61) requestAnimationFrame(f); else ok(Math.round(10 * 60000 / (z[60] - z[0])) / 10); }; requestAnimationFrame(f); })`);
    r.start = await js(`({ leisten: __leisten(), flaechen: __flaechen(), teiler: __tb() })`);
    await foto('01-split');

    /* ===== Varianten vergleichen: dieselbe Zugbewegung (Maus, 150 Schritte à 8 ms) ===== */
    r.varianten = {};
    for (const v of ['A', 'B', 'C', 'D']) {
      await js(`Dokument.splitVariante('${v}'); Dokument.splitDebug(true); 0`);
      await warte(300);
      const z = await js(`__ziehe('mouse', 150, 8)`);
      const m = await js(`Dokument.splitMessung()['${v}']`);
      const nachher = await js(`({ flaechen: __flaechen(), eingefroren: Dokument.leinwand() ? Dokument.leinwand().eingefroren() : null, leisten: __leisten() })`);
      r.varianten[v] = { messung: m, zug: z, nachher };
      await foto('02-nach-zug-' + v);
      // Wieder in die Mitte (Tastatur: der Griff ist fokussierbar)
      await js(`(() => { const t = document.getElementById('dok-teiler'); t.focus(); for (let i = 0; i < 30; i++) t.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true })); for (let i = 0; i < 4; i++) t.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true })); })()`);
      await warte(500);
    }
    // Foto mitten im Ziehen (Variante C und A), um das Aussehen zu prüfen
    for (const v of ['C', 'A', 'D']) {
      await js(`Dokument.splitVariante('${v}'); 0`);
      await js(`(async () => { const t = document.getElementById('dok-teiler'), b = t.getBoundingClientRect(); window.__ev = (typ, x) => t.dispatchEvent(new PointerEvent(typ, { bubbles: true, cancelable: true, pointerId: 52, pointerType: 'mouse', isPrimary: true, clientX: x, clientY: b.top + b.height / 2, buttons: typ === 'pointerup' ? 0 : 1, button: 0 })); window.__ev('pointerdown', b.left + 4); for (let i = 1; i <= 30; i++) { window.__ev('pointermove', b.left + 4 - i * 6); await __warte(8); } })()`);
      await foto('03-mitten-im-zug-' + v);
      await js(`window.__ev('pointerup', 0); 0`); await warte(500);
      await js(`(() => { const t = document.getElementById('dok-teiler'); t.focus(); for (let i = 0; i < 4; i++) t.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true })); })()`); await warte(300);
    }
    await js(`Dokument.splitDebug(false); 0`);

    /* ===== Trefferfläche und Touch: kein versehentlicher Strich ===== */
    r.touch = await js(`(async () => {
      const aus = {}, t = document.getElementById('dok-teiler'), b = t.getBoundingClientRect();
      const einst = Werkzeuge.einstellungen(); einst.finger = true;
      const lw = Dokument.leinwand(), sid = lw.seiten()[0].id; const vor = lw.inhalt(sid).e.length;
      // Wer trifft den Griff? 14 px neben der Mitte (Trefferfläche ragt in die Blätter)
      const wer = dx => { const el = document.elementFromPoint(b.left + b.width / 2 + dx, b.top + b.height / 2); return !!el && (el === t || t.contains(el)); };
      aus.treffer = { mitte: wer(0), rechts12: wer(12), links12: wer(-12), rechts30: wer(30) };
      aus.griffBreite = Math.round(b.width);
      Dokument.splitVariante('C');
      const flaechenVor = __flaechen();
      aus.finger = await __ziehe('touch', 60, 10);
      aus.fingerFlaechenVerschoben = JSON.stringify(flaechenVor) === JSON.stringify(__flaechen());
      aus.stift = await __ziehe('pen', 60, 10);
      aus.striche = Dokument.leinwand().inhalt(Dokument.leinwand().seiten()[0].id).e.length - vor;
      einst.finger = false;
      return aus;
    })()`);

    /* ===== Vollbild mit Split und Wechsel aller Zustände ===== */
    r.zustaende = [];
    const zustand = async (name) => {
      await warte(900);
      const z = await js(`({ voll: document.documentElement.classList.contains('vollbild'), geteilt: document.getElementById('ansicht-dok').classList.contains('geteilt'), leisten: __leisten(), flaechen: __flaechen(), teiler: __tb(), fokus: Dokument.tabs().fokus, toolbarMitte: (() => { const l = document.querySelector('#dok-leiste .dok-leiste'); if (!l) return null; const b = l.getBoundingClientRect(); return Math.round(b.left + b.width / 2); })(), fensterMitte: Math.round(innerWidth / 2) })`);
      z.name = name; r.zustaende.push(z);
      return z;
    };
    await zustand('Split normal');
    await js(`Dokument.vollbild(true); 0`); await zustand('Split Vollbild');
    await foto('04-split-vollbild');
    r.vollbildZug = await js(`__ziehe('mouse', 80, 10)`);
    await zustand('Split Vollbild nach Zug');
    // Fokuswechsel im Vollbild: tippen auf das rechte Blatt
    await js(`(() => { const cv = document.querySelectorAll('.dok-bereich .lw-canvas')[0]; cv.setPointerCapture = () => {}; cv.releasePointerCapture = () => {}; cv.hasPointerCapture = () => true; const b = cv.getBoundingClientRect(); cv.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 53, pointerType: 'mouse', button: 0, buttons: 1, clientX: b.left + b.width / 2, clientY: b.top + b.height / 2 })); cv.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerId: 53, pointerType: 'mouse', button: 0, buttons: 0, clientX: b.left + b.width / 2, clientY: b.top + b.height / 2 })); })()`);
    await zustand('Split Vollbild, Fokus links');
    await foto('05-split-vollbild-fokus-links');
    await js(`Dokument.vollbild(false); 0`); await zustand('Split wieder normal');
    // Einzeln: Split lösen
    await js(`document.querySelector('#dok-leiste [data-el="mehr"]').click(); 0`); await warte(300);
    await js(`document.querySelector('.kontext [data-a="loesen"]').click(); 0`); await zustand('Einzeln normal');
    await js(`Dokument.vollbild(true); 0`); await zustand('Einzeln Vollbild');
    await js(`Dokument.vollbild(false); 0`); await zustand('Einzeln wieder normal');
    // Wieder nebeneinander, dann schnell mehrfach wechseln
    await js(`Dokument.daneben(__ids.buch); 0`); await zustand('Wieder Split');
    r.wechsel = [];
    for (let i = 0; i < 6; i++) { await js(`Dokument.vollbild(${i % 2 === 0}); 0`); await warte(300); r.wechsel.push(await js(`({ leisten: __leisten(), geteilt: document.getElementById('ansicht-dok').classList.contains('geteilt'), teiler: __tb().sichtbar })`)); }
    await js(`Dokument.vollbild(false); 0`); await warte(600);
    const ende = await zustand('Ende');
    r.teilungErhalten = await js(`Dokument.tabs().rechts !== null && document.getElementById('ansicht-dok').classList.contains('geteilt')`);
    r.fehler = null;
  } catch (e) { r.fehler = String(e && e.stack || e); }
  r.konsole = log;
  fs.writeFileSync(path.join(AUS, 'split.json'), JSON.stringify(r, null, 2));
  app.exit(0);
});
