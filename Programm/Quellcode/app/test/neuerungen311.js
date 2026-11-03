'use strict';
// Neue Funktionen 3.11: Form nach dem Einrasten anpassen (Pfeil dreht/streckt sich um den Anfang, Kreis wächst um die
// Mitte), Menü der Seite (Rechtsklick mit echter Maus, zwei Finger halten mit echten Touch-Ereignissen), gestaltete
// Symbole, schlanke Leiste im Vollbild, normale Schrift im Stift-Panel mit dem Hand-Werkzeug, liegendes Cover.
// Aufruf: electron test/neuerungen311.js <ausgabeordner>  -> neuerungen311.json (ok je Prüfung) und Fotos
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
  win.setSize(1300, 900);
  win.show(); win.focus();
  await new Promise(r => wc.once('did-finish-load', r));
  await warte(1800);
  const js = c => wc.executeJavaScript(c, true);
  const r = { pruefungen: [] };
  const pruefe = (name, ok, info) => r.pruefungen.push({ name, ok: !!ok, info });
  const foto = async (name, rect) => fs.writeFileSync(path.join(AUS, name + '.png'), (await wc.capturePage(rect)).toPNG());
  wc.debugger.attach('1.3');
  try {
    await js(`(async () => {
      window.__warte = ms => new Promise(ok => setTimeout(ok, ms));
      window.__neu = async (quer) => {
        const id = UI.neueId(), s1 = UI.neueId();
        Bibliothek.speichere(id, { art: 'notizbuch', name: 'Test ' + id, eltern: null, format: 'A4', quer: !!quer, papier: 'karo', seitenfarbe: 'weiss', farbe: 'blau', seiten: [s1], erstellt: Date.now(), geoeffnet: 0, seite: 1, favorit: false });
        location.hash = '#/dok/' + id;
        for (let i = 0; i < 80 && !(Dokument.leinwand() && Dokument.leinwand().seiten().length && Dokument.leinwand().seiten()[0].id === s1); i++) await __warte(100);
        await __warte(900);
        return { id, s1 };
      };
      window.__stift = () => {
        const cv = document.querySelector('.dok-bereich:not([hidden]) .lw-canvas');
        cv.setPointerCapture = () => {}; cv.releasePointerCapture = () => {}; cv.hasPointerCapture = () => true;
        const b = cv.parentElement.getBoundingClientRect();
        return (t, x, y) => cv.dispatchEvent(new PointerEvent(t, { pointerId: 7, pointerType: 'pen', isPrimary: true, clientX: b.left + x, clientY: b.top + y, pressure: t === 'pointerup' ? 0 : 0.5, buttons: t === 'pointerup' ? 0 : 1, button: 0, bubbles: true, cancelable: true }));
      };
      // Punkte in Seiten-Koordinaten
      window.__inSeite = (x, y) => { const lw = Dokument.leinwand(), a = lw.ansicht(), s = lw.seiten()[0]; return [(x - a.x) / a.s - s.x, (y - a.y) / a.s - s.y]; };
    })()`);

    // 1. Pfeil zeichnen, halten (Form rastet ein), dann weiterziehen: Anfang bleibt, Spitze folgt dem Stift
    const pfeil = await js(`(async () => {
      const { id, s1 } = await __neu();
      const lw = Dokument.leinwand(); lw.setzeWerkzeug('stift'); lw.einst.halteForm = true; lw.einst.halteMs = 500;
      const ev = __stift();
      const zug = [];
      for (let i = 0; i <= 40; i++) zug.push([200 + i * 6, 300]);                   // Schaft nach rechts
      for (let i = 1; i <= 8; i++) zug.push([440 - i * 4, 300 - i * 4]);              // Widerhaken oben
      for (let i = 1; i <= 8; i++) zug.push([408 + i * 4, 268 + i * 4]);              // zurück zur Spitze
      for (let i = 1; i <= 8; i++) zug.push([440 - i * 4, 300 + i * 4]);              // Widerhaken unten
      ev('pointerdown', zug[0][0], zug[0][1]);
      for (const [x, y] of zug.slice(1)) { ev('pointermove', x, y); await __warte(8); }
      for (let i = 0; i < 10; i++) { ev('pointermove', zug[zug.length - 1][0], zug[zug.length - 1][1]); await __warte(80); }   // halten
      const end0 = zug[zug.length - 1];
      // weiterziehen: nach rechts unten, doppelt so weit vom Anfang
      const ziel = [200 + (end0[0] - 200) * 1.6, 300 + (end0[1] - 300) * 1.6 + 120];
      for (let i = 1; i <= 20; i++) { ev('pointermove', end0[0] + (ziel[0] - end0[0]) * i / 20, end0[1] + (ziel[1] - end0[1]) * i / 20); await __warte(10); }
      ev('pointerup', ziel[0], ziel[1]); await __warte(300); lw.sichern();
      const st = Daten.get('ink:' + id + ':' + s1).e.filter(e => e.w === 'stift').pop();
      const a = __inSeite(200, 300), z = __inSeite(ziel[0], ziel[1]), e0 = __inSeite(end0[0], end0[1]);
      const p = st.p, abst = (u, v) => Math.hypot(u[0] - v[0], u[1] - v[1]);
      const naechster = q => Math.min(...p.map(t => abst(t, q)));
      // Länge (weitester Punkt vom Anfang) und Richtung müssen dem Stift folgen: vorher |e0 - a|, jetzt |z - a|
      const weit = p.reduce((m, t) => (abst(t, a) > abst(m, a) ? t : m), p[0]);
      const winkel = (u, v) => Math.atan2(u[1] - v[1], u[0] - v[0]) * 180 / Math.PI;
      // Erwartet: die Form so gedreht und gestreckt, dass der Punkt unter dem Stift beim Einrasten (Ende des Widerhakens)
      // jetzt unter dem Stift liegt. Die Spitze des Pfeils (440, 300) muss also dort liegen:
      const f = abst(z, a) / abst(e0, a), w = (winkel(z, a) - winkel(e0, a)) * Math.PI / 180, t0 = __inSeite(440, 300);
      const spitze = [a[0] + f * ((t0[0] - a[0]) * Math.cos(w) - (t0[1] - a[1]) * Math.sin(w)), a[1] + f * ((t0[0] - a[0]) * Math.sin(w) + (t0[1] - a[1]) * Math.cos(w))];
      return { punkte: p.length, anfangBleibt: Math.round(abst(p[0], a) * 10) / 10, laenge: Math.round(abst(weit, a)), vorher: Math.round(abst(t0, a)), streckung: Math.round(f * 100) / 100,
        spitzeDaneben: Math.round(naechster(spitze) * 10) / 10, stiftPunktGetroffen: Math.round(naechster(z) * 10) / 10 };
    })()`);
    pruefe('Pfeil: Anfang bleibt', pfeil.anfangBleibt < 3, pfeil);
    pruefe('Pfeil: folgt dem Stift (gedreht und gestreckt)', pfeil.spitzeDaneben < 6 && pfeil.laenge > pfeil.vorher * 1.4, pfeil);

    // 2. Kreis zeichnen, halten, dann nach aussen ziehen: Mitte bleibt, Radius wächst stufenlos
    const kreis = await js(`(async () => {
      const { id, s1 } = await __neu();
      const lw = Dokument.leinwand(); lw.setzeWerkzeug('stift'); lw.einst.halteForm = true; lw.einst.halteMs = 500;
      const ev = __stift();
      const M = [400, 400], R = 80, zug = [];
      for (let i = 0; i <= 64; i++) { const w = i / 64 * Math.PI * 2; zug.push([M[0] + R * Math.cos(w), M[1] + R * Math.sin(w)]); }
      ev('pointerdown', zug[0][0], zug[0][1]);
      for (const [x, y] of zug.slice(1)) { ev('pointermove', x, y); await __warte(8); }
      for (let i = 0; i < 10; i++) { ev('pointermove', zug[zug.length - 1][0], zug[zug.length - 1][1]); await __warte(80); }
      const radien = [];
      for (let i = 1; i <= 30; i++) {
        ev('pointermove', M[0] + R + i * 2, M[1]); await __warte(12);
      }
      ev('pointerup', M[0] + R + 60, M[1]); await __warte(300); lw.sichern();
      const st = Daten.get('ink:' + id + ':' + s1).e.filter(e => e.w === 'stift').pop();
      const m = __inSeite(M[0], M[1]), k = lw.ansicht().s;
      const p = st.p, cx = p.reduce((t, q) => t + q[0], 0) / p.length, cy = p.reduce((t, q) => t + q[1], 0) / p.length;
      const rMittel = p.reduce((t, q) => t + Math.hypot(q[0] - cx, q[1] - cy), 0) / p.length;
      return { punkte: p.length, mitteVersatz: Math.round(Math.hypot(cx - m[0], cy - m[1]) * 10) / 10, radiusVorher: R / k, radiusNachher: Math.round(rMittel * 10) / 10, erwartet: Math.round((R + 60) / k * 10) / 10 };
    })()`);
    pruefe('Kreis: Mitte bleibt', kreis.mitteVersatz < 4, kreis);
    pruefe('Kreis: wächst mit dem Stift', Math.abs(kreis.radiusNachher - kreis.erwartet) < kreis.erwartet * 0.08, kreis);

    // 3. Rechtsklick mit echter Maus: Menü der Seite
    const p = await js(`(() => { document.querySelectorAll('.kontext').forEach(k => k.remove()); const b = document.querySelector('.dok-bereich:not([hidden]) .lw-canvas').parentElement.getBoundingClientRect(); return [Math.round(b.left + 300), Math.round(b.top + 300)]; })()`);
    const maus = (type, o) => wc.debugger.sendCommand('Input.dispatchMouseEvent', Object.assign({ type, x: p[0], y: p[1] }, o || {}));
    await maus('mouseMoved'); await maus('mousePressed', { button: 'right', buttons: 2, clickCount: 1 }); await warte(80); await maus('mouseReleased', { button: 'right', buttons: 0, clickCount: 1 }); await warte(400);
    const menue = await js(`(() => { const k = document.querySelector('.kontext'); return k ? [...k.querySelectorAll('button')].map(b => b.textContent.trim()) : null; })()`);
    pruefe('Rechtsklick: Menü mit Drehen, Einfügen, Rückgängig', menue && ['Nach links drehen', 'Nach rechts drehen', 'Bild vom Computer …', 'Rückgängig'].every(t => menue.includes(t)), menue);
    await foto('menue', { x: 0, y: 0, width: 1300, height: 900 });
    await js(`document.querySelectorAll('.kontext').forEach(k => k.remove())`);

    // 4. Zwei Finger halten (echte Touch-Ereignisse, leicht wandernd): dasselbe Menü, bleibt nach dem Loslassen
    await warte(900);
    const tp = (type, pts) => wc.debugger.sendCommand('Input.dispatchTouchEvent', { type, touchPoints: pts.map((q, i) => ({ x: q[0], y: q[1], id: i + 1, radiusX: 8, radiusY: 8, force: 1 })) });
    const A = [p[0] - 40, p[1]], Bp = [p[0] + 40, p[1]];
    await tp('touchStart', [A]); await warte(30); await tp('touchStart', [A, Bp]);
    for (let i = 0; i < 9; i++) { await warte(100); await tp('touchMove', [[A[0] + i * 2, A[1] + i], [Bp[0] - i * 2, Bp[1] + i]]); }
    await tp('touchEnd', []); await warte(400);
    const zwei = await js(`(() => { const k = document.querySelector('.kontext'); return k ? [...k.querySelectorAll('button')].map(b => b.textContent.trim()) : null; })()`);
    pruefe('Zwei Finger halten (wandernd): Menü bleibt nach dem Loslassen', zwei && zwei.includes('Nach links drehen'), zwei);
    await js(`document.querySelectorAll('.kontext').forEach(k => k.remove())`);

    // 5. Gestaltete Symbole und Vollbild
    const sym = await js(`(() => { const l = document.querySelector('#dok-leiste .werkzeugleiste'); const s = l.querySelector('[data-werkzeug="stift"] svg.sym-bunt'); return { farbig: l.classList.contains('farbig'), bunt: l.querySelectorAll('svg.sym-bunt').length, sichtbar: s ? getComputedStyle(s).display : null, linieVersteckt: getComputedStyle(l.querySelector('[data-werkzeug="stift"] svg.hat-bunt')).display, tinte: l.style.getPropertyValue('--wz-tinte') }; })()`);
    pruefe('Gestaltete Symbole sichtbar, Stiftspitze in der Farbe', sym.farbig && sym.bunt >= 12 && sym.sichtbar === 'block' && sym.linieVersteckt === 'none' && /^#/.test(sym.tinte), sym);
    await foto('leiste', { x: 0, y: 0, width: 1300, height: 170 });
    await js(`document.querySelector('[data-el="vollbild"]').click()`); await warte(700);
    await js(`document.querySelector('[data-werkzeug="stift"]').click(); const k = document.querySelector('[data-aktion="eigenschaften"]'); if (k && getComputedStyle(k).display !== 'none') k.click()`); await warte(500);
    const voll = await js(`(() => { const l = document.querySelector('#dok-leiste .werkzeugleiste'), b = l.getBoundingClientRect(); return { hoehe: Math.round(b.height), links: Math.round(b.left), rechts: Math.round(b.right), fenster: innerWidth, offen: l.classList.contains('eig-offen') }; })()`);
    pruefe('Vollbild: Leiste schlank und im Bild', voll.hoehe <= 110 && voll.links >= 0 && voll.rechts <= voll.fenster, voll);
    await foto('vollbild', { x: 0, y: 0, width: 1300, height: 200 });
    await js(`document.querySelector('[data-el="vollbild"]').click()`); await warte(500);

    // 6. Stift-Panel mit dem Hand-Werkzeug: normale Schrift
    const schrift = await js(`(async () => { Dokument.leinwand().setzeWerkzeug('hand'); document.querySelector('[data-aktion="tasten"]').click(); await __warte(300); const p = document.querySelector('.tasten-panel p'); const f = getComputedStyle(p).fontFamily; document.querySelector('[data-aktion="tasten"]').click(); return { f, schriftGroesse: getComputedStyle(p).fontSize, hostKlasse: Dokument.leinwand().el.className }; })()`);
    pruefe('Stift-Panel: normale Schrift mit Hand-Werkzeug', !/Caveat/.test(schrift.f) && !schrift.hostKlasse.split(' ').includes('hand'), schrift);

    // 7. Liegendes Cover für ein Notizbuch im Querformat
    const cover = await js(`(async () => {
      const { id } = await __neu(true);
      location.hash = '#/bibliothek'; await __warte(1200);
      const c = document.querySelector('canvas[data-nb="' + id + '"]');
      return c ? { b: c.width, h: c.height, klasse: c.parentElement.className } : null;
    })()`);
    pruefe('Querformat: liegendes Cover', cover && cover.b > cover.h && /quer/.test(cover.klasse), cover);
    await foto('bibliothek', { x: 0, y: 0, width: 1300, height: 900 });
  } catch (e) { r.fehler = String(e && e.stack || e); }
  r.ok = r.pruefungen.every(x => x.ok) && !r.fehler;
  fs.writeFileSync(path.join(AUS, 'neuerungen311.json'), JSON.stringify(r, null, 2));
  app.exit(0);
});
