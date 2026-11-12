'use strict';
// Der Strich unter dem Stift wird seit 3.12 Stück für Stück gezeichnet (nur der Bereich, der sich geändert hat).
// Verglichen wird das Bild mitten im Strich mit demselben Strich, einmal ganz neu gemalt (L.liveNeu), und das Bild vor
// dem Absetzen mit dem danach auf dem Blatt: Schleifen, Zickzack, langer Bogen, gleich breite Linie, Wechsel von Linie
// zu Fläche. deutlichAnders = Pixel mit mehr als 24 Stufen Unterschied je Farbe; in Chromium bleiben einzelne
// Kantenpixel (der Browser glättet Kanten je nach Grösse des Pfads leicht anders), sichtbar ist davon nichts.
// Aufruf: node test/browser/strich.js [skalierung, Standard 2] [form]
const { starte } = require('./hilfe');
const fs = require('fs');
(async () => {
  const t = await starte({ dpr: Number(process.argv[2]) || 2 });
  const { page } = t;
  const r = { laeufe: [] };
  await page.evaluate(async () => {
    window.__neu = async () => {
      const id = UI.neueId(), s1 = UI.neueId();
      Bibliothek.speichere(id, { art: 'notizbuch', name: 'Strich ' + id, eltern: null, format: 'A4', papier: 'blanko', seitenfarbe: 'weiss', farbe: 'blau', seiten: [s1], erstellt: Date.now(), geoeffnet: 0, seite: 1, favorit: false });
      location.hash = '#/dok/' + id;
      for (let i = 0; i < 80 && !(Dokument.leinwand() && Dokument.leinwand().seiten().length && Dokument.leinwand().seiten()[0].id === s1); i++) await new Promise(ok => setTimeout(ok, 100));
      await new Promise(ok => setTimeout(ok, 600));
    };
    window.__start = (pts, typ) => {
      const cv = document.querySelector('.dok-bereich:not([hidden]) .lw-canvas');
      cv.setPointerCapture = () => {}; cv.releasePointerCapture = () => {}; cv.hasPointerCapture = () => true;
      const hr = cv.parentElement.getBoundingClientRect();
      window.__ev = (art, x, y, p) => cv.dispatchEvent(new PointerEvent(art, { pointerId: 9, pointerType: typ || 'pen', isPrimary: true, clientX: hr.left + x, clientY: hr.top + y, pressure: p, buttons: art === 'pointerup' ? 0 : 1, button: 0, bubbles: true, cancelable: true }));
      __ev('pointerdown', pts[0][0], pts[0][1], pts[0][2]);
    };
    window.__weiter = async (pts, jeBild) => { let i = 0; for (const p of pts) { __ev('pointermove', p[0], p[1], p[2]); if (++i % (jeBild || 3) === 0) await new Promise(ok => requestAnimationFrame(ok)); } };
    window.__ende = async p => { __ev('pointerup', p[0], p[1], 0); await new Promise(ok => setTimeout(ok, 500)); };
  });
  const flaeche = async () => page.evaluate(() => { const b = document.querySelector('.dok-bereich:not([hidden]) .dok-flaeche').getBoundingClientRect(); return { x: Math.round(b.left) + 2, y: Math.round(b.top) + 2, width: Math.round(b.width) - 4, height: Math.round(b.height) - 4 }; });
  const vergleichSeite = await t.ctx.newPage();
  const vergleiche = async (A, B) => vergleichSeite.evaluate(async ([a, b]) => {
    const lade = async d => { const im = new Image(); im.src = 'data:image/png;base64,' + d; await im.decode(); const c = document.createElement('canvas'); c.width = im.width; c.height = im.height; const x = c.getContext('2d'); x.drawImage(im, 0, 0); return x.getImageData(0, 0, c.width, c.height); };
    const X = await lade(a), Y = await lade(b);
    let anders = 0, leicht = 0, groesst = 0, tinte = 0;
    for (let i = 0; i < X.data.length; i += 4) {
      const d = Math.abs(X.data[i] - Y.data[i]) + Math.abs(X.data[i + 1] - Y.data[i + 1]) + Math.abs(X.data[i + 2] - Y.data[i + 2]);
      if (Y.data[i] < 200) tinte++;
      if (d > groesst) groesst = d;
      if (d > 0) leicht++;
      if (d > 72) anders++;
    }
    const c2 = document.createElement('canvas'); c2.width = X.width; c2.height = X.height; const x2 = c2.getContext('2d'); const D = x2.createImageData(X.width, X.height); const orte = [];
    for (let i = 0; i < X.data.length; i += 4) { const d = Math.abs(X.data[i] - Y.data[i]) + Math.abs(X.data[i + 1] - Y.data[i + 1]) + Math.abs(X.data[i + 2] - Y.data[i + 2]); if (d > 72) { D.data[i] = 255; D.data[i + 1] = 0; D.data[i + 2] = 0; if (orte.length < 12) orte.push([(i / 4) % X.width, Math.floor(i / 4 / X.width), d]); } else { const g = 255 - (255 - Y.data[i]) * 0.3; D.data[i] = D.data[i + 1] = D.data[i + 2] = g; } D.data[i + 3] = 255; }
    x2.putImageData(D, 0, 0);
    return { pixel: X.data.length / 4, tinte, irgendwieAnders: leicht, deutlichAnders: anders, groessterUnterschied: groesst, orte, bild: c2.toDataURL('image/png').split(',')[1] };
  }, [A.toString('base64'), B.toString('base64')]);

  const formen = {
    // Schleifen, die sich selbst kreuzen, Druck schwankt stark
    schleifen: i => [330 + i * 0.55 + 70 * Math.cos(i / 14), 330 + 70 * Math.sin(i / 14) + 30 * Math.sin(i / 90), 0.15 + 0.6 * Math.sin(i / 23) ** 2],
    // Zickzack mit scharfen Ecken
    zickzack: i => [300 + i * 0.8, 300 + ((i % 40) < 20 ? (i % 20) * 6 : (20 - (i % 20)) * 6), 0.3 + 0.3 * Math.sin(i / 7) ** 2],
    // lange ruhige Linie (ein einziges Band ohne Knick)
    bogen: i => [260 + i * 0.75, 420 + 120 * Math.sin(i / 260), 0.25 + 0.4 * (i / 900)],
    // gleich breit (Druck immer gleich: Linie statt Fläche)
    gleich: i => [330 + i * 0.55 + 70 * Math.cos(i / 14), 330 + 70 * Math.sin(i / 14), 0.5],
    // erst gleich, dann mit Druck (Wechsel von Linie zu Fläche)
    wechsel: i => [300 + i * 0.7, 300 + 50 * Math.sin(i / 30), i < 200 ? 0.5 : 0.2 + 0.5 * Math.sin(i / 19) ** 2]
  };
  for (const [name, fn] of Object.entries(formen)) for (const glaettung of ['aus', 'niedrig']) {
    if (process.argv[3] && process.argv[3] !== name) continue;
    const pts = []; for (let i = 0; i <= 900; i++) pts.push(fn(i));
    await page.evaluate(async ([pts, glaettung]) => {
      await __neu();
      const lw = Dokument.leinwand();
      lw.setzeWerkzeug('stift'); lw.setzeFarbe('tinte'); lw.waehleGroesse('gross');
      lw.einst.glaettung = glaettung; lw.einst.halteForm = false; lw.einst.kritzelLoeschen = false; lw.einst.stiftArt = 'fueller';
      __start(pts);
      await __weiter(pts.slice(1, 800));
      await new Promise(ok => requestAnimationFrame(() => requestAnimationFrame(ok)));
    }, [pts, glaettung]);
    const fl = await flaeche();
    const stat0 = await page.evaluate(() => Dokument.leinwand().statistik());
    const A = await page.screenshot({ clip: fl });
    await page.evaluate(async () => { Dokument.leinwand().liveNeu(); await new Promise(ok => requestAnimationFrame(() => requestAnimationFrame(ok))); });
    const B = await page.screenshot({ clip: fl });
    const live = await vergleiche(A, B);
    // fertig schreiben; danach auf dem Blatt gegen "live ganz neu gemalt" kurz vor dem Absetzen
    await page.evaluate(async pts => { await __weiter(pts.slice(800)); await new Promise(ok => requestAnimationFrame(() => requestAnimationFrame(ok))); Dokument.leinwand().liveNeu(); await new Promise(ok => requestAnimationFrame(() => requestAnimationFrame(ok))); }, pts);
    const C = await page.screenshot({ clip: fl });
    await page.evaluate(async pts => { await __ende(pts[pts.length - 1]); }, pts);
    const D = await page.screenshot({ clip: fl });
    const danach = await vergleiche(C, D);
    delete live.bild; delete danach.bild;
    r.laeufe.push({ name, glaettung, live, danach });
  }
  r.fehler = t.fehler;
  console.log(JSON.stringify(r, null, 1));
  await t.zu();
})().catch(e => { console.error(e); process.exit(1); });
