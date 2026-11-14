'use strict';
// Das Blatt auf Kacheln (seit 3.14): beim Scrollen wird nichts kopiert und nichts Sichtbares neu gemalt, Kacheln
// wandern auf die andere Seite und werden im Voraus gemalt (höchstens zwei je Bild); was im Bild liegt, ist immer
// gemalt; das Ergebnis ist Pixel für Pixel dasselbe wie ganz neu gemalt (nach Scrollen, Sprüngen, Zoomen, Schreiben,
// Radieren, Rückgängig); im Hintergrund geben die Kacheln ihren Speicher frei.
// Aufruf: node test/browser/kacheln.js [ausgabeordner] -> kacheln.json und Fotos
const { starte, notizbuch, ausgabe } = require('./hilfe');
const fs = require('fs'), path = require('path');
const AUS = ausgabe('kacheln');
(async () => {
  const t = await starte({ b: 1194, h: 834, dpr: 2, touch: true });
  const { page } = t;
  page.setDefaultTimeout(15000);
  const r = {}, ok = (n, b, x) => { r[n] = b ? 'ok' : ['FEHLER', x]; if (!b) console.error(n, 'FEHLER ' + JSON.stringify(x)); };
  await notizbuch(page, { seiten: 6, zeilen: 30, name: 'Kacheln' });
  await page.evaluate(() => {
    const cv = document.querySelector('.dok-bereich:not([hidden]) .lw-canvas');
    cv.setPointerCapture = () => {}; cv.releasePointerCapture = () => {}; cv.hasPointerCapture = () => true;
    const host = cv.parentElement, hr = host.getBoundingClientRect();
    window.__host = host;
    window.__ev = (typ, x, y, extra) => cv.dispatchEvent(new PointerEvent(typ, Object.assign({ pointerId: 9, pointerType: 'pen', isPrimary: true, clientX: hr.left + x, clientY: hr.top + y, pressure: typ === 'pointerup' ? 0 : 0.4, buttons: typ === 'pointerup' ? 0 : 1, button: 0, bubbles: true, cancelable: true }, extra || {})));
    window.__bild = () => new Promise(f => requestAnimationFrame(() => requestAnimationFrame(f)));
    window.__warte = ms => new Promise(f => setTimeout(f, ms));
    window.__rad = dy => host.dispatchEvent(new WheelEvent('wheel', { deltaY: dy, bubbles: true, cancelable: true }));
    // Warten, bis alle Kacheln gemalt sind
    // Warten, bis die Ansicht ruht (ein Schwung läuft noch gut zwei Sekunden aus) und alle Kacheln gemalt sind
    window.__fertig = async () => {
      const lw = Dokument.leinwand();
      for (let i = 0, ruhig = 0, vor = ''; i < 400 && ruhig < 12; i++) { await new Promise(f => requestAnimationFrame(f)); const a = lw.ansicht(), jetzt = a.x + '|' + a.y + '|' + a.s + '|' + lw.kacheln().offen; ruhig = jetzt === vor && !lw.kacheln().offen ? ruhig + 1 : 0; vor = jetzt; }
      await __bild();
    };
    // Bild der Kacheln jetzt gegen dasselbe, ganz neu gemalt: Zahl der verschiedenen Pixel
    window.__vergleich = async () => {
      const lw = Dokument.leinwand();
      await __fertig();
      const a = lw.basisBild(), A = a.getContext('2d').getImageData(0, 0, a.width, a.height).data;
      lw.neuAnDerStelle(); await __bild();
      const b = lw.basisBild(), B = b.getContext('2d').getImageData(0, 0, b.width, b.height).data;
      let anders = 0, tinte = 0, leer = 0;
      for (let i = 0; i < A.length; i += 4) { if (A[i] !== B[i] || A[i + 1] !== B[i + 1] || A[i + 2] !== B[i + 2] || A[i + 3] !== B[i + 3]) anders++; if (B[i] < 90 && B[i + 3] > 200) tinte++; if (B[i + 3] < 255) leer++; }
      return { anders, tinte, leer, pixel: A.length / 4 };
    };
  });

  /* ===== 1. Aufbau ===== */
  await page.evaluate(() => __fertig());
  const auf = await page.evaluate(() => { const lw = Dokument.leinwand(), host = __host, cv = host.querySelector('.lw-canvas'); return { k: lw.kacheln(), elemente: host.querySelectorAll('.lw-kacheln canvas').length, flaeche: [cv.width, cv.height], deckt: Math.round(cv.getBoundingClientRect().width) === Math.round(host.getBoundingClientRect().width) }; });
  ok('aufbau: Kacheln statt einer grossen Flaeche, alle gemalt', auf.k.anzahl >= 6 && auf.k.anzahl <= auf.k.hoechstens && auf.k.offen === 0 && auf.elemente === auf.k.anzahl && auf.flaeche[0] === 1 && auf.deckt, auf);
  ok('aufbau: nicht mehr Bildspeicher als frueher (hoechstens 80 MB bei diesem Bildschirm)', auf.k.mb <= 80, auf.k);
  const v0 = await page.evaluate(() => __vergleich());
  ok('aufbau: Bild vollstaendig (keine durchsichtigen Pixel) und mit Schrift', v0.leer === 0 && v0.tinte > 20000 && v0.anders === 0, v0);
  await page.screenshot({ path: path.join(AUS, 'aufbau.png') });

  /* ===== 2. Scrollen ===== */
  const scroll = await page.evaluate(async () => {
    const lw = Dokument.leinwand(), s0 = lw.statistik();
    let maxJeBild = 0, sichtbarOffen = 0, letzte = s0.kacheln, bilder = 0;
    for (let i = 0; i < 140; i++) {
      __rad(i < 90 ? 45 : -60);
      await new Promise(f => requestAnimationFrame(f));
      const k = lw.kacheln(), st = lw.statistik();
      // nach jedem Bild: alles, was zu sehen ist, ist gemalt
      sichtbarOffen = Math.max(sichtbarOffen, k.sichtbarOffen);
      if (i > 2) maxJeBild = Math.max(maxJeBild, st.kacheln - letzte);
      letzte = st.kacheln; bilder++;
    }
    const s1 = lw.statistik();
    return { voll: s1.voll - s0.voll, bereich: s1.bereich - s0.bereich, kacheln: s1.kacheln - s0.kacheln, maxJeBild, sichtbarOffen, bilder, k: lw.kacheln() };
  });
  ok('scrollen: nie alles neu, kein Teilbereich, nur einzelne Kacheln', scroll.voll === 0 && scroll.bereich === 0 && scroll.kacheln > 10, scroll);
  ok('scrollen: was im Bild liegt, ist nach jedem Bild gemalt', scroll.sichtbarOffen === 0, scroll.sichtbarOffen);
  ok('scrollen: Vorausmalen verteilt sich (hoechstens eine Zeile je Bild)', scroll.maxJeBild <= 5, scroll.maxJeBild);
  const v1 = await page.evaluate(() => __vergleich());
  ok('scrollen: Bild danach wie ganz neu gemalt', v1.anders === 0 && v1.leer === 0, v1);
  // Mit dem Finger in krummen Schritten (halbe und drittel Pixel), dann Sprung ans Ende und zurück
  const v2 = await page.evaluate(async () => {
    const T = { pointerType: 'touch', pointerId: 31, width: 20, height: 20 };
    await __warte(800);
    __ev('pointerdown', 500, 500, T);
    for (let i = 1; i <= 40; i++) { __ev('pointermove', 500 + i * 0.37, 500 - i * 7.33, T); if (i % 3 === 0) await new Promise(f => requestAnimationFrame(f)); }
    __ev('pointerup', 515, 207, T);
    await __warte(1500);
    return __vergleich();
  });
  ok('scrollen mit dem Finger (krumme Schritte, Schwung): wie neu gemalt', v2.anders === 0 && v2.leer === 0, v2);
  const v3 = await page.evaluate(async () => { const lw = Dokument.leinwand(); lw.springeZuSeite(5, false); await __bild(); const a = await __vergleich(); lw.springeZuSeite(0, false); await __bild(); const b = await __vergleich(); return { a, b, st: lw.kacheln() }; });
  ok('sprung ans Ende und zurueck: wie neu gemalt', v3.a.anders === 0 && v3.b.anders === 0 && v3.a.leer === 0 && v3.b.leer === 0 && v3.b.tinte > 20000, v3);

  /* ===== 3. Zoomen ===== */
  const zoom = await page.evaluate(async () => {
    const lw = Dokument.leinwand(), aus = {};
    const st0 = lw.statistik();
    lw.zoome(1.6); await __warte(500); aus.rein = await __vergleich(); aus.zoomRein = lw.ansicht().s;
    for (let i = 0; i < 20; i++) { __rad(40); await new Promise(f => requestAnimationFrame(f)); }
    aus.reinGescrollt = await __vergleich();
    lw.zoome(1 / 2.6); await __warte(500); aus.raus = await __vergleich(); aus.k = lw.kacheln();
    lw.zoome(1.3); await __warte(500);
    aus.voll = lw.statistik().voll - st0.voll;
    return aus;
  });
  ok('zoomen: hinein, gescrollt und weit heraus jeweils wie neu gemalt', zoom.rein.anders === 0 && zoom.reinGescrollt.anders === 0 && zoom.raus.anders === 0 && zoom.raus.leer === 0, zoom);
  await page.screenshot({ path: path.join(AUS, 'nach-zoom.png') });

  /* ===== 4. Schreiben, Radieren, Rückgängig über Kachelgrenzen ===== */
  const schreiben = await page.evaluate(async () => {
    const lw = Dokument.leinwand(), aus = {};
    lw.einst.halteForm = false; lw.einst.kritzelLoeschen = false; lw.einst.kreisAuswahl = false;
    lw.setzeWerkzeug('stift'); lw.waehleGroesse('gross'); await __bild();
    const strich = async pts => { __ev('pointerdown', pts[0][0], pts[0][1]); for (const q of pts.slice(1)) __ev('pointermove', q[0], q[1]); await __bild(); const l = pts[pts.length - 1]; __ev('pointerup', l[0], l[1]); await __bild(); };
    // quer über das ganze Bild (über mehrere Kacheln) und senkrecht
    const quer = []; for (let i = 0; i <= 100; i++) quer.push([60 + i * 10.7, 260 + 60 * Math.sin(i / 7)]);
    const hoch = []; for (let i = 0; i <= 60; i++) hoch.push([520 + 30 * Math.sin(i / 5), 40 + i * 9.3]);
    await __fertig();
    const st0 = lw.statistik();
    await strich(quer); await strich(hoch);
    const st1 = lw.statistik();
    aus.ohneNeumalen = st1.voll - st0.voll === 0 && st1.kacheln - st0.kacheln === 0;
    aus.geschrieben = await __vergleich();
    lw.setzeWerkzeug('radierer'); lw.setzeRadiermodus('bereich'); await __bild();
    const weg = []; for (let i = 0; i <= 40; i++) weg.push([300 + i * 12, 150 + i * 9]);
    await strich(weg);
    aus.radiert = await __vergleich();
    lw.rueckgaengig(); await __bild(); aus.zurueck = await __vergleich();
    lw.rueckgaengig(); lw.rueckgaengig(); await __bild(); aus.allesZurueck = await __vergleich();
    lw.setzeWerkzeug('stift');
    return aus;
  });
  ok('schreiben: Strich kommt ohne Neumalen auf die Kacheln, auch ueber ihre Grenzen', schreiben.ohneNeumalen && schreiben.geschrieben.anders === 0, schreiben);
  ok('radieren und rueckgaengig: wie neu gemalt', schreiben.radiert.anders === 0 && schreiben.zurueck.anders === 0 && schreiben.allesZurueck.anders === 0, schreiben);
  await page.screenshot({ path: path.join(AUS, 'geschrieben.png') });

  /* ===== 5. Speicher: im Hintergrund frei, beim Zurückkommen wieder da ===== */
  const speicher = await page.evaluate(async () => {
    const lw = Dokument.leinwand(), host = __host, id = Dokument.id();
    location.hash = '#/';
    await __warte(600);
    const weg = { k: lw.kacheln(), elemente: host.querySelectorAll('.lw-kacheln canvas').length };
    location.hash = '#/dok/' + id;
    await __warte(900);
    const lw2 = Dokument.leinwand();
    await __fertig();
    return { weg, da: lw2.kacheln(), gleich: lw2 === lw, v: await __vergleich() };
  });
  ok('speicher: auf der Startseite haelt das Dokument keine Kacheln', speicher.weg.k.anzahl === 0 && speicher.weg.elemente === 0, speicher.weg);
  ok('speicher: zurueck im Dokument ist das Bild wieder da', speicher.da.anzahl >= 6 && speicher.da.offen === 0 && speicher.v.anders === 0 && speicher.v.leer === 0 && speicher.v.tinte > 20000, speicher);

  /* ===== 6. Whiteboard: in alle Richtungen verschieben ===== */
  const brett = await page.evaluate(async () => {
    const id = UI.neueId(), sid = UI.neueId(), e = [];
    for (let z = 0; z < 60; z++) { const p = []; for (let i = 0; i < 80; i++) p.push([-900 + z * 37 + i * 3, -700 + z * 29 + 20 * Math.sin(i / 6), 0.4]); e.push({ id: UI.neueId(), w: 'stift', f: 'tinte', d: 2, m: Date.now(), p }); }
    Daten.set('ink:' + id + ':' + sid, { e });
    Bibliothek.speichere(id, { art: 'notizbuch', name: 'Brett', eltern: null, format: 'A4', papier: 'whiteboard', farbe: 'blau', seiten: [sid], erstellt: Date.now(), geoeffnet: 0, seite: 1, favorit: false });
    location.hash = '#/dok/' + id;
    for (let i = 0; i < 100 && !(Dokument.id() === id && Dokument.leinwand() && Dokument.leinwand().seiten().length === 1); i++) await __warte(100);
    await __warte(600);
    const lw = Dokument.leinwand(), host = lw.el;
    const s0 = lw.statistik();
    // schräg und waagrecht verschieben (Mausrad mit deltaX)
    for (let i = 0; i < 60; i++) { host.dispatchEvent(new WheelEvent('wheel', { deltaY: i < 30 ? 31 : -17, deltaX: i < 40 ? 43 : -55, bubbles: true, cancelable: true })); await new Promise(f => requestAnimationFrame(f)); }
    const s1 = lw.statistik();
    // __vergleich arbeitet mit dem Dokument im Fokus
    return { v: await __vergleich(), voll: s1.voll - s0.voll, kacheln: s1.kacheln - s0.kacheln, k: lw.kacheln() };
  });
  ok('whiteboard: schraeg und quer verschoben, wie neu gemalt, ohne alles neu zu malen', brett.v.anders === 0 && brett.v.leer === 0 && brett.voll === 0 && brett.kacheln > 4, brett);
  await page.screenshot({ path: path.join(AUS, 'whiteboard.png') });

  r.fehler = t.fehler.filter(x => !/Failed to load resource/.test(x));
  ok('keine Fehler in der Konsole', r.fehler.length === 0, r.fehler);
  fs.writeFileSync(path.join(AUS, 'kacheln.json'), JSON.stringify(r, null, 2));
  const schlecht = Object.entries(r).filter(([k, v]) => k !== 'fehler' && v !== 'ok');
  console.log(schlecht.length ? `${schlecht.length} FEHLER` : 'Alles in Ordnung', '->', AUS);
  await t.zu();
  process.exit(schlecht.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
