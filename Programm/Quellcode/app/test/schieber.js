'use strict';
// Prüflauf für den unsichtbaren Schieber rechts: im Dokument erscheint er beim Scrollen und verschwindet wieder,
// Ziehen blättert durchs Dokument (mit Seitenblase), Tippen auf die Spur springt; in der Bibliothek ist die
// Scrollleiste nur beim Scrollen zu sehen. Eigener Testordner, fasst die echten Daten nicht an.
// Aufruf: electron test/schieber.js <ausgabeordner> [vorlage mit Bibliothek und Daten]
// Schreibt Fotos und schieber.json. Vorher Lernheft schliessen (Port 47823).
const { app, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');

const AUS = path.resolve(process.argv[2]);
const VORLAGE = process.argv[3] && process.argv[3] !== '-' ? path.resolve(process.argv[3]) : null;
const WURZEL = path.join(AUS, 'Lernheft');
fs.rmSync(AUS, { recursive: true, force: true });
fs.mkdirSync(path.join(WURZEL, 'Programm'), { recursive: true });
if (VORLAGE) for (const t of ['Bibliothek', 'Daten']) if (fs.existsSync(path.join(VORLAGE, t))) fs.cpSync(path.join(VORLAGE, t), path.join(WURZEL, t), { recursive: true });
app.setPath('userData', path.join(AUS, 'profil'));
process.env.LERNHEFT_ORDNER = WURZEL;
process.env.LERNHEFT_SEITE = path.join(__dirname, '..', '..', 'webseite');
const warte = ms => new Promise(r => setTimeout(r, ms));
require('../main.js');

app.whenReady().then(async () => {
  let win;
  for (let i = 0; i < 100 && !win; i++) { win = BrowserWindow.getAllWindows()[0]; if (!win) await warte(100); }
  const wc = win.webContents;
  wc.setBackgroundThrottling(false);   // auch wenn das Fenster verdeckt ist, weiter mit voller Bildrate zeichnen
  const log = [];
  wc.on('console-message', (e, l, m) => { if (l >= 2) log.push(m); });
  win.setSize(1300, 860);
  win.show(); win.focus();
  await new Promise(r => wc.once('did-finish-load', r));
  await warte(2000);
  const js = c => wc.executeJavaScript(c, true);
  const foto = async n => { await warte(150); fs.writeFileSync(path.join(AUS, n + '.png'), (await wc.capturePage()).toPNG()); };
  const r = {};
  try {
    // Ein Notizbuch mit 12 Seiten (und ein Skript aus der Vorlage, falls vorhanden)
    r.oeffnen = await js(`(async () => {
      const id = UI.neueId(), seiten = Array.from({ length: 12 }, () => UI.neueId());
      Bibliothek.speichere(id, { art: 'notizbuch', name: 'Schieber-Test', eltern: null, format: 'A4', papier: 'karo', farbe: 'blau', seiten, erstellt: Date.now(), geoeffnet: 0, seite: 1, favorit: false });
      location.hash = '#/dok/' + id;
      for (let i = 0; i < 80 && !(Dokument.leinwand() && Dokument.leinwand().seiten().length === 12); i++) await new Promise(ok => setTimeout(ok, 100));
      await new Promise(ok => setTimeout(ok, 1200));
      window.__s = () => document.querySelector('.dok-bereich:not([hidden]) .lw-schieber');
      window.__zustand = () => { const s = __s(), g = s.querySelector('.lw-schieber-griff'), b = g.getBoundingClientRect(), h = s.getBoundingClientRect(); return { hidden: s.hidden, da: s.classList.contains('da'), sichtbar: getComputedStyle(s).opacity, griffOben: Math.round(b.top - h.top), griffHoehe: Math.round(b.height), seite: Dokument.leinwand().aktuelleSeite() + 1 }; };
      return __zustand();
    })()`);
    // Mit dem Mausrad scrollen
    r.scrollen = await js(`(async () => {
      const f = document.querySelector('.dok-bereich:not([hidden]) .leinwand'), b = f.getBoundingClientRect();
      for (let i = 0; i < 6; i++) { f.dispatchEvent(new WheelEvent('wheel', { deltaY: 120, clientX: b.left + 300, clientY: b.top + 300, bubbles: true, cancelable: true })); await new Promise(ok => setTimeout(ok, 30)); }
      await new Promise(ok => setTimeout(ok, 250));
      return __zustand();
    })()`);
    await foto('01-beim-scrollen');
    await warte(1700);
    r.nachRuhe = await js(`__zustand()`);
    // Maus und Stift am rechten Rand, ohne zu scrollen: bleibt unsichtbar; Griff angefasst, Loslassen verpasst: verschwindet trotzdem
    r.amRand = await js(`(async () => {
      const f = document.querySelector('.dok-bereich:not([hidden]) .leinwand'), b = f.getBoundingClientRect();
      for (const art of ['mouse', 'pen']) for (let i = 0; i < 5; i++) f.dispatchEvent(new PointerEvent('pointermove', { pointerId: 3, pointerType: art, clientX: b.right - 8, clientY: b.top + 200 + i * 20, buttons: 0, bubbles: true }));
      await new Promise(ok => setTimeout(ok, 200));
      const randSichtbar = getComputedStyle(__s()).opacity;
      const s = __s(), g = s.querySelector('.lw-schieber-griff');
      s.classList.add('da'); g.setPointerCapture = () => {};
      g.dispatchEvent(new PointerEvent('pointerdown', { pointerId: 4, pointerType: 'pen', clientX: b.right - 6, clientY: b.top + 40, buttons: 1, bubbles: true, cancelable: true }));
      g.dispatchEvent(new PointerEvent('lostpointercapture', { pointerId: 4, pointerType: 'pen', bubbles: true }));
      await new Promise(ok => setTimeout(ok, 1700));
      return { randSichtbar, nachVerpasstemLoslassen: getComputedStyle(s).opacity, zieht: s.classList.contains('zieht') };
    })()`);
    await foto('02-nach-ruhe');
    // Griff ziehen: bis ans Ende
    r.ziehen = await js(`(async () => {
      Dokument.leinwand().springeZuSeite(0);
      await new Promise(ok => setTimeout(ok, 300));
      const s = __s(), g = s.querySelector('.lw-schieber-griff');
      s.classList.add('da');
      g.setPointerCapture = () => {};
      const b = g.getBoundingClientRect(), x = b.left + b.width / 2, y0 = b.top + b.height / 2;
      const ev = (typ, y) => g.dispatchEvent(new PointerEvent(typ, { pointerId: 5, pointerType: 'mouse', isPrimary: true, clientX: x, clientY: y, buttons: typ === 'pointerup' ? 0 : 1, button: 0, bubbles: true, cancelable: true }));
      ev('pointerdown', y0);
      const halb = s.getBoundingClientRect().height / 2;
      for (let i = 1; i <= 10; i++) { ev('pointermove', y0 + halb * i / 10); await new Promise(ok => setTimeout(ok, 30)); }
      await new Promise(ok => setTimeout(ok, 150));
      const mitte = { ...__zustand(), blase: !!s.querySelector('.lw-schieber-blase') };
      window.__fotoZiehen = true;
      return { mitte };
    })()`);
    await foto('03-ziehen');
    r.ziehenEnde = await js(`(async () => {
      const s = __s(), g = s.querySelector('.lw-schieber-griff'), b = g.getBoundingClientRect();
      const ev = (typ, y) => g.dispatchEvent(new PointerEvent(typ, { pointerId: 5, pointerType: 'mouse', isPrimary: true, clientX: b.left + 4, clientY: y, buttons: typ === 'pointerup' ? 0 : 1, button: 0, bubbles: true, cancelable: true }));
      ev('pointermove', 5000); await new Promise(ok => setTimeout(ok, 150));
      ev('pointerup', 5000); await new Promise(ok => setTimeout(ok, 150));
      return __zustand();
    })()`);
    // Auf die Spur oben tippen: nichts passiert (nur der Griff fängt Eingaben ab)
    r.spur = await js(`(async () => {
      const s = __s(); s.classList.add('da');
      const h = s.getBoundingClientRect();
      s.dispatchEvent(new PointerEvent('pointerdown', { pointerId: 6, pointerType: 'mouse', isPrimary: true, clientX: h.right - 4, clientY: h.top + 10, buttons: 1, button: 0, bubbles: true, cancelable: true }));
      await new Promise(ok => setTimeout(ok, 900));
      return __zustand();
    })()`);
    // Schreiben am rechten Rand, während der Schieber nicht zu sehen ist: der Strich entsteht
    r.schreibenAmRand = await js(`(async () => {
      await new Promise(ok => setTimeout(ok, 1500));
      const lw = Dokument.leinwand(), sid = lw.seiten()[0].id, vorher = lw.inhalt(sid).e.length;
      const cv = document.querySelector('.dok-bereich:not([hidden]) .lw-canvas'), hr = cv.parentElement.getBoundingClientRect();
      cv.setPointerCapture = () => {}; cv.hasPointerCapture = () => true; cv.releasePointerCapture = () => {};
      const zielEl = document.elementFromPoint(hr.right - 10, hr.top + 300);
      return { getroffen: zielEl && zielEl.className, schieberDa: __s().classList.contains('da') };
    })()`);

    // Bibliothek: Scrollleiste nur beim Scrollen
    r.bibliothek = await js(`(async () => {
      location.hash = '#/bibliothek';
      for (let i = 0; i < 30; i++) { const id = UI.neueId(); Bibliothek.speichere(id, { art: 'notizbuch', name: 'Füller ' + i, eltern: null, format: 'A4', papier: 'karo', farbe: 'blau', seiten: [UI.neueId()], erstellt: Date.now(), geoeffnet: 0, seite: 1, favorit: false }); }
      await new Promise(ok => setTimeout(ok, 1200));
      window.__b = () => { const s = document.querySelector('.seiten-schieber'), g = s.querySelector('.lw-schieber-griff'); return { hidden: s.hidden, sichtbar: getComputedStyle(s).opacity, griffOben: Math.round(g.getBoundingClientRect().top), scrollY: Math.round(scrollY), max: document.documentElement.scrollHeight - innerHeight, browserLeiste: innerWidth - document.documentElement.clientWidth }; };
      const vorher = __b();
      window.scrollBy(0, 400);
      await new Promise(ok => setTimeout(ok, 200));
      return { vorher, beimScrollen: __b() };
    })()`);
    await foto('04-bibliothek-scrollen');
    await warte(1600);
    r.bibliothek.nachRuhe = await js(`__b()`);
    await foto('05-bibliothek-ruhe');
    r.bibliothek.ziehen = await js(`(async () => {
      const s = document.querySelector('.seiten-schieber'), g = s.querySelector('.lw-schieber-griff');
      s.classList.add('da'); g.setPointerCapture = () => {};
      const b = g.getBoundingClientRect(), ev = (typ, y) => g.dispatchEvent(new PointerEvent(typ, { pointerId: 8, pointerType: 'mouse', isPrimary: true, clientX: b.left + 4, clientY: y, buttons: typ === 'pointerup' ? 0 : 1, button: 0, bubbles: true, cancelable: true }));
      ev('pointerdown', b.top + 5); ev('pointermove', b.top + 5000); await new Promise(ok => setTimeout(ok, 100)); ev('pointerup', b.top + 5000);
      await new Promise(ok => setTimeout(ok, 100));
      const amEnde = __b();
      location.hash = '#/dok/' + Bibliothek.dokumente().find(d => d.name === 'Schieber-Test').id;
      await new Promise(ok => setTimeout(ok, 800));
      return { amEnde, imDokumentVersteckt: document.querySelector('.seiten-schieber').hidden };
    })()`);
  } catch (e) {
    r.fehler = String(e && e.stack || e);
  }
  r.log = log;
  fs.writeFileSync(path.join(AUS, 'schieber.json'), JSON.stringify(r, null, 2));
  app.exit(0);
});
