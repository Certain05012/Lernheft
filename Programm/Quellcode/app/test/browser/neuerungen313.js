'use strict';
// Neue Funktionen 3.13: Auswahl drehen (Griff unter dem Rahmen, zwei Finger, 90°-Knöpfe im Menü; Striche Punkt für
// Punkt, Text und Bilder mit Winkel "dr"), Formen nach dem Einrasten drehen, Pfeile in jeder Zeichenweise und in zwei
// Zügen (Spitze an eine Linie), Laserpointer sparsam (Punkt als Element, Spur in wenigen Zügen, nur ihr Bereich
// gelöscht), Leiste im Vollbild so breit wie ihre obere Zeile, Menü ⋯ als Feld mit Gruppen, Stiftarten mit Strichprobe.
// Aufruf: node test/browser/neuerungen313.js [ausgabeordner] -> neuerungen313.json und Fotos
const { starte, notizbuch, ausgabe } = require('./hilfe');
const fs = require('fs'), path = require('path');
const AUS = ausgabe('neuerungen313');
(async () => {
  const t = await starte({ b: 1194, h: 834, dpr: 2, touch: true });
  const { page } = t;
  page.setDefaultTimeout(8000);
  const r = {}, ok = (n, b, x) => { r[n] = b ? 'ok' : ['FEHLER', x]; if (!b) console.error(n, 'FEHLER ' + JSON.stringify(x)); };
  await notizbuch(page, { seiten: 2, zeilen: 0, name: 'Drehen' });
  await page.evaluate(() => {
    const cv = document.querySelector('.dok-bereich:not([hidden]) .lw-canvas');
    cv.setPointerCapture = () => {}; cv.releasePointerCapture = () => {}; cv.hasPointerCapture = () => true;
    const hr = cv.parentElement.getBoundingClientRect();
    // art: pen | mouse | touch; id: Zeiger (für zwei Finger)
    window.__ev = (typ, x, y, p, extra) => cv.dispatchEvent(new PointerEvent(typ, Object.assign({ pointerId: 9, pointerType: 'pen', isPrimary: true, clientX: hr.left + x, clientY: hr.top + y, pressure: typ === 'pointerup' ? 0 : (p == null ? 0.4 : p), buttons: typ === 'pointerup' || p === 0 ? 0 : 1, button: 0, width: 1, height: 1, bubbles: true, cancelable: true }, extra || {})));
    window.__bild = () => new Promise(f => requestAnimationFrame(() => requestAnimationFrame(f)));
    window.__warte = ms => new Promise(f => setTimeout(f, ms));
    window.__strich = async (pts, ms, extra) => { __ev('pointerdown', pts[0][0], pts[0][1], pts[0][2], extra); for (const q of pts.slice(1)) { if (ms) await __warte(ms); __ev('pointermove', q[0], q[1], q[2], extra); } await __bild(); const l = pts[pts.length - 1]; __ev('pointerup', l[0], l[1], 0, extra); await __bild(); };
    // Strich zeichnen und am Ende halten, bis die Form einrastet; danach optional weiterziehen (nach), dann absetzen
    window.__halte = async (pts, nach) => {
      __ev('pointerdown', pts[0][0], pts[0][1]);
      for (const q of pts.slice(1)) { await __warte(3); __ev('pointermove', q[0], q[1]); }
      await __warte(Dokument.leinwand().einst.halteMs + 250); await __bild();
      for (const q of nach || []) { __ev('pointermove', q[0], q[1]); await __bild(); }
      const l = (nach && nach.length ? nach : pts)[(nach && nach.length ? nach : pts).length - 1];
      __ev('pointerup', l[0], l[1]); await __bild();
    };
    // Seite <-> Bildschirm (Koordinaten der Fläche)
    window.__zuSchirm = (x, y) => { const lw = Dokument.leinwand(), a = lw.ansicht(), s = lw.seiten()[0]; return [(s.x + x) * a.s + a.x, (s.y + y) * a.s + a.y]; };
    window.__liste = () => { const lw = Dokument.leinwand(); return lw.inhalt(lw.seiten()[0].id).e; };
    window.__kasten = el => { let x1 = 1e9, y1 = 1e9, x2 = -1e9, y2 = -1e9; for (const q of el.p) { x1 = Math.min(x1, q[0]); y1 = Math.min(y1, q[1]); x2 = Math.max(x2, q[0]); y2 = Math.max(y2, q[1]); } return { x1, y1, x2, y2, b: x2 - x1, h: y2 - y1 }; };
    const lw = Dokument.leinwand();
    lw.einst.kritzelLoeschen = false; lw.einst.kreisAuswahl = false; lw.einst.halteMs = 400;
    lw.setzeStiftArt('kugel');
  });
  const lin = (x0, y0, x1, y1, n) => { const p = []; for (let i = 0; i <= n; i++) p.push([x0 + (x1 - x0) * i / n, y0 + (y1 - y0) * i / n, 0.4]); return p; };
  const weg = ecken => { let p = []; for (let i = 0; i + 1 < ecken.length; i++) p = p.concat(lin(ecken[i][0], ecken[i][1], ecken[i + 1][0], ecken[i + 1][1], Math.max(4, Math.round(Math.hypot(ecken[i + 1][0] - ecken[i][0], ecken[i + 1][1] - ecken[i][1]) / 5))).slice(i ? 1 : 0)); return p; };
  const letzter = () => page.evaluate(() => { const e = __liste(); return e[e.length - 1]; });
  const anzahl = () => page.evaluate(() => __liste().length);

  /* ===== 1. Auswahl drehen: Griff ===== */
  await page.evaluate(() => { Dokument.leinwand().einst.halteForm = false; });
  // ein liegender Strich (breit, flach) und ein kurzer darüber
  await page.evaluate(p => __strich(p, 0), lin(300, 300, 520, 300, 40));
  await page.evaluate(p => __strich(p, 0), lin(300, 280, 400, 280, 20));
  const vorDrehen = await page.evaluate(() => __liste().slice(-2).map(__kasten));
  // Lasso um beide
  await page.evaluate(async () => { Dokument.leinwand().setzeWerkzeug('lasso'); await __bild(); });
  await page.evaluate(p => __strich(p, 0), weg([[270, 250], [560, 250], [560, 330], [270, 330], [270, 250]]));
  const z1 = await page.evaluate(() => Dokument.leinwand().zustand());
  ok('lasso waehlt beide Striche', z1.auswahl === 2, z1);
  await page.screenshot({ path: path.join(AUS, 'auswahl-mit-griff.png'), clip: { x: 200, y: 280, width: 500, height: 320 } });
  // Der Dreh-Griff sitzt mittig unter dem Rahmen: dort beginnen und um die Mitte nach links ziehen (90° im Uhrzeigersinn)
  const griff = await page.evaluate(() => {
    const el = __liste().slice(-2), k = el.map(__kasten), a = Dokument.leinwand().ansicht();
    const x1 = Math.min(k[0].x1, k[1].x1), x2 = Math.max(k[0].x2, k[1].x2), y1 = Math.min(k[0].y1, k[1].y1), y2 = Math.max(k[0].y2, k[1].y2);
    const [mx, my] = __zuSchirm((x1 + x2) / 2, (y1 + y2) / 2), [, unten] = __zuSchirm(0, y2);
    return { mx, my, gx: mx, gy: unten + 34 + 8, s: a.s };   // Rahmen hat rund 7 px Rand, der Griff sitzt 34 px darunter
  });
  await page.evaluate(async g => {
    __ev('pointerdown', g.gx, g.gy);
    const r = g.gy - g.my;
    for (let i = 1; i <= 30; i++) { const w = Math.PI / 2 + (Math.PI / 2) * i / 30; __ev('pointermove', g.mx + r * Math.cos(w), g.my + r * Math.sin(w)); if (i === 15) { await __bild(); window.__drehtGerade = Dokument.leinwand().zustand().aktion; } }
    await __bild();
  }, griff);
  await page.screenshot({ path: path.join(AUS, 'drehen-am-griff.png'), clip: { x: 200, y: 180, width: 500, height: 440 } });
  await page.evaluate(async g => { __ev('pointerup', g.mx - (g.gy - g.my), g.my); await __bild(); }, griff);
  const nachDrehen = await page.evaluate(() => ({ k: __liste().slice(-2).map(__kasten), dreht: window.__drehtGerade, auswahl: Dokument.leinwand().zustand().auswahl }));
  ok('griff: Aktion drehen', nachDrehen.dreht === 'drehen', nachDrehen.dreht);
  ok('griff: 90 Grad, aus breit wird hoch', Math.abs(nachDrehen.k[0].h - vorDrehen[0].b) < 2 && nachDrehen.k[0].b < 2 && Math.abs(nachDrehen.k[1].h - vorDrehen[1].b) < 2, [vorDrehen, nachDrehen.k]);
  // Um die gemeinsame Mitte: die Mitte beider Striche zusammen bleibt, wo sie war
  const mitteVon = k => [(Math.min(k[0].x1, k[1].x1) + Math.max(k[0].x2, k[1].x2)) / 2, (Math.min(k[0].y1, k[1].y1) + Math.max(k[0].y2, k[1].y2)) / 2];
  const m0 = mitteVon(vorDrehen), m1 = mitteVon(nachDrehen.k);
  ok('griff: dreht um die Mitte der Auswahl', Math.hypot(m0[0] - m1[0], m0[1] - m1[1]) < 3 && nachDrehen.auswahl === 2, [m0, m1]);
  // Im Uhrzeigersinn: der kurze Strich lag oben links und liegt jetzt rechts oben
  ok('griff: Drehsinn (oben wird rechts)', nachDrehen.k[1].x1 > nachDrehen.k[0].x1 + 10, nachDrehen.k);
  await page.evaluate(async () => { Dokument.leinwand().rueckgaengig(); await __bild(); });
  const zurueck = await page.evaluate(() => __liste().slice(-2).map(__kasten));
  ok('drehen ist ein Schritt im Verlauf', Math.abs(zurueck[0].b - vorDrehen[0].b) < 0.2 && zurueck[0].h < 0.2, zurueck);

  /* ===== 2. Menü der Auswahl: 90° links/rechts ===== */
  await page.evaluate(p => __strich(p, 0), weg([[270, 250], [560, 250], [560, 330], [270, 330], [270, 250]]));
  const knoepfe = await page.evaluate(() => { const m = document.querySelector('.dok-bereich:not([hidden]) .lw-menue'); return { da: !m.hidden, links: !!m.querySelector('[data-m="links"]'), rechts: !!m.querySelector('[data-m="rechts"]') }; });
  ok('menue hat Drehen links und rechts', knoepfe.da && knoepfe.links && knoepfe.rechts, knoepfe);
  await page.evaluate(async () => { document.querySelector('.dok-bereich:not([hidden]) .lw-menue [data-m="rechts"]').click(); await __bild(); });
  const r90 = await page.evaluate(() => __liste().slice(-2).map(__kasten));
  ok('menue: rechts dreht um 90 Grad', Math.abs(r90[0].h - vorDrehen[0].b) < 1 && r90[1].x1 > r90[0].x1 + 10, r90);
  await page.evaluate(async () => { document.querySelector('.dok-bereich:not([hidden]) .lw-menue [data-m="links"]').click(); await __bild(); });
  const l90 = await page.evaluate(() => __liste().slice(-2).map(__kasten));
  ok('menue: links dreht zurueck', Math.abs(l90[0].b - vorDrehen[0].b) < 0.3 && Math.abs(l90[0].x1 - vorDrehen[0].x1) < 0.3 && Math.abs(l90[0].y1 - vorDrehen[0].y1) < 0.3, [vorDrehen[0], l90[0]]);

  /* ===== 3. Zwei Finger drehen die Auswahl ===== */
  await page.waitForTimeout(800);   // Handballen-Schutz: Finger zählen erst 0,7 s nach dem Stift
  const f = await page.evaluate(() => { const k = __liste().slice(-2).map(__kasten); const [x, y] = __zuSchirm((k[0].x1 + k[0].x2) / 2, k[0].y1); return { x, y }; });
  const fingerErg = await page.evaluate(async f => {
    const lw = Dokument.leinwand(), T = id => ({ pointerType: 'touch', pointerId: id, isPrimary: id === 21, width: 20, height: 20 });
    const vorher = lw.ansicht();
    // erster Finger links auf der Auswahl, zweiter rechts; dann dreht der zweite um den ersten nach unten (im Uhrzeigersinn)
    __ev('pointerdown', f.x - 60, f.y - 4, 0.5, T(21)); await __bild();
    const a1 = lw.zustand().aktion;
    __ev('pointerdown', f.x + 60, f.y - 4, 0.5, T(22)); await __bild();
    const a2 = lw.zustand().aktion;
    for (let i = 1; i <= 20; i++) { const w = (Math.PI / 4) * i / 20; __ev('pointermove', f.x - 60 + 120 * Math.cos(w), f.y - 4 + 120 * Math.sin(w), 0.5, T(22)); if (i % 5 === 0) await __bild(); }
    await __bild();
    const mitten = lw.zustand().aktion;
    __ev('pointerup', f.x - 60 + 120 * Math.cos(Math.PI / 4), f.y - 4 + 120 * Math.sin(Math.PI / 4), 0, T(22)); await __bild();
    __ev('pointerup', f.x - 60, f.y - 4, 0, T(21)); await __bild();
    await __warte(450);
    const nachher = lw.ansicht();
    return { a1, a2, mitten, ende: lw.zustand().aktion, ansichtGleich: vorher.s === nachher.s && vorher.x === nachher.x && vorher.y === nachher.y, k: __liste().slice(-2).map(__kasten), rueck: lw.kannRueckgaengig() };
  }, f);
  ok('finger: erst verschieben, mit dem zweiten drehen', fingerErg.a1 === 'verschieben' && fingerErg.a2 === 'drehen' && fingerErg.mitten === 'drehen' && !fingerErg.ende, fingerErg);
  // 45° gezogen, die ersten 6° zählen nicht: der liegende Strich steht jetzt schräg (Höhe = Breite * tan(39°) etwa)
  const schraeg = Math.atan2(fingerErg.k[0].h, fingerErg.k[0].b) * 180 / Math.PI;
  ok('finger: Auswahl schraeg gedreht (rund 39 Grad)', schraeg > 30 && schraeg < 46, schraeg);
  ok('finger: die Ansicht bleibt (kein Zoomen)', fingerErg.ansichtGleich);
  await page.screenshot({ path: path.join(AUS, 'zwei-finger.png'), clip: { x: 200, y: 180, width: 560, height: 440 } });
  await page.evaluate(async () => { const lw = Dokument.leinwand(); lw.rueckgaengig(); await __bild(); lw.auswahlLeeren(); });
  const nachFinger = await page.evaluate(() => __liste().slice(-2).map(__kasten));
  ok('finger: ein Schritt im Verlauf (verschieben und drehen zusammen)', nachFinger[0].h < 0.3 && Math.abs(nachFinger[0].x1 - vorDrehen[0].x1) < 0.3, nachFinger[0]);

  /* ===== 4. Text und Bild drehen ===== */
  const textErg = await page.evaluate(async () => {
    const lw = Dokument.leinwand(), sid = lw.seiten()[0].id, liste = __liste();
    const cv = document.createElement('canvas'); cv.width = 80; cv.height = 40; const c = cv.getContext('2d'); c.fillStyle = '#d00'; c.fillRect(0, 0, 80, 40); c.fillStyle = '#00d'; c.fillRect(0, 0, 20, 40);
    const text = { typ: 'text', id: 'txt1', x: 120, y: 560, b: 400, t: 'Hallo Welt', gr: 32, f: 'tinte', erstellt: 1, m: 1 };
    const bild = { typ: 'bild', id: 'bild1', x: 420, y: 540, b: 160, h: 80, src: cv.toDataURL('image/png'), erstellt: 1, m: 1 };
    liste.push(text, bild);
    await Leinwand.bilderBereit([bild]);
    lw.plane(); await __bild();
    return { g: Leinwand.grenzen(text), gb: Leinwand.grenzen(bild) };
  });
  // Lasso um den Text allein, dann 90° nach rechts
  await page.evaluate(async g => { const [x1, y1] = __zuSchirm(g.x1 - 12, g.y1 - 12), [x2, y2] = __zuSchirm(g.x2 + 12, g.y2 + 12); await __strich([[x1, y1], [x2, y1], [x2, y2], [x1, y2], [x1, y1]].flatMap((q, i, a) => i ? [[(a[i - 1][0] + q[0]) / 2, (a[i - 1][1] + q[1]) / 2, 0.4], [q[0], q[1], 0.4]] : [[q[0], q[1], 0.4]]), 0); }, textErg.g);
  ok('text mit Lasso gewaehlt', (await page.evaluate(() => Dokument.leinwand().zustand().auswahl)) === 1);
  await page.evaluate(async () => { Dokument.leinwand().dreheAuswahl(90); await __bild(); });
  const text90 = await page.evaluate(() => { const el = __liste().find(e => e.id === 'txt1'); return { dr: el.dr, x: el.x, y: el.y, g: Leinwand.grenzen(el) }; });
  ok('text: Winkel dr = 90', text90.dr === 90, text90);
  ok('text: steht jetzt hoch, Mitte bleibt', (text90.g.y2 - text90.g.y1) > (text90.g.x2 - text90.g.x1) * 2 && Math.abs((text90.g.x1 + text90.g.x2) / 2 - (textErg.g.x1 + textErg.g.x2) / 2) < 1.5 && Math.abs((text90.g.y1 + text90.g.y2) / 2 - (textErg.g.y1 + textErg.g.y2) / 2) < 1.5, [textErg.g, text90.g]);
  // Gemalt wird er gedreht: im alten (liegenden) Kasten rechts aussen ist nichts mehr, im neuen (stehenden) schon
  const tinte = async (x1, y1, x2, y2) => page.evaluate(async ([x1, y1, x2, y2]) => {
    await __bild();
    const lw = Dokument.leinwand(), s = lw.seiten()[0], cv = document.createElement('canvas');
    Leinwand.malBild(cv, { seite: { b: s.b, h: s.h, mm: 210 }, liste: __liste(), flaeche: 'hell', massstab: 1 });
    const d = cv.getContext('2d').getImageData(Math.round(x1), Math.round(y1), Math.max(1, Math.round(x2 - x1)), Math.max(1, Math.round(y2 - y1))).data;
    let n = 0; for (let i = 0; i < d.length; i += 4) if (d[i] < 90 && d[i + 1] < 90 && d[i + 2] < 90) n++;
    return n;
  }, [x1, y1, x2, y2]);
  const altRechts = await tinte(textErg.g.x2 - 40, textErg.g.y1, textErg.g.x2, textErg.g.y2);
  const neuUnten = await tinte(text90.g.x1, text90.g.y2 - 50, text90.g.x2, text90.g.y2);
  ok('text: gedreht gemalt', altRechts === 0 && neuUnten > 20, [altRechts, neuUnten]);
  // Antippen trifft ihn an der gedrehten Stelle (Text-Werkzeug: bearbeiten), das Feld ist mitgedreht
  const feld = await page.evaluate(async g => {
    const lw = Dokument.leinwand(); lw.auswahlLeeren(); lw.setzeWerkzeug('text'); await __bild();
    const [x, y] = __zuSchirm((g.x1 + g.x2) / 2, g.y2 - 30);
    __ev('pointerdown', x, y); await __bild(); __ev('pointerup', x, y); await __bild();
    const f = lw.el.querySelector('.lw-text-editor');
    const erg = { offen: !f.hidden && lw.textBearbeitung(), wert: f.value, transform: f.style.transform };
    lw.beendeText(); await __bild();
    return erg;
  }, text90.g);
  ok('text: an der gedrehten Stelle getroffen, Feld gedreht', feld.offen && feld.wert === 'Hallo Welt' && /rotate\(90deg\)/.test(feld.transform), feld);
  // Bild: mit dem Lasso antippen, 90° links, gemalt gedreht
  await page.evaluate(async g => { const lw = Dokument.leinwand(); lw.setzeWerkzeug('lasso'); await __bild(); const [x, y] = __zuSchirm((g.x1 + g.x2) / 2, (g.y1 + g.y2) / 2); __ev('pointerdown', x, y); await __bild(); __ev('pointerup', x, y); await __bild(); lw.dreheAuswahl(-90); await __bild(); }, textErg.gb);
  const bild90 = await page.evaluate(() => { const el = __liste().find(e => e.id === 'bild1'); return { dr: el.dr, g: Leinwand.grenzen(el) }; });
  ok('bild: dr = 270, steht hoch, Mitte bleibt', bild90.dr === 270 && Math.abs((bild90.g.y2 - bild90.g.y1) - 160) < 1 && Math.abs((bild90.g.x2 - bild90.g.x1) - 80) < 1 && Math.abs((bild90.g.x1 + bild90.g.x2) / 2 - 500) < 1.5, bild90);
  // Blau war links und ist nach der Drehung nach links unten
  const farben = await page.evaluate(async g => {
    const lw = Dokument.leinwand(), s = lw.seiten()[0], cv = document.createElement('canvas');
    Leinwand.malBild(cv, { seite: { b: s.b, h: s.h, mm: 210 }, liste: __liste(), flaeche: 'hell', massstab: 1 });
    const c = cv.getContext('2d'), px = (x, y) => [...c.getImageData(Math.round(x), Math.round(y), 1, 1).data].slice(0, 3);
    const mx = (g.x1 + g.x2) / 2;
    return { oben: px(mx, g.y1 + 30), unten: px(mx, g.y2 - 10) };
  }, bild90.g);
  ok('bild: gedreht gemalt (blau unten, rot oben)', farben.unten[2] > 150 && farben.unten[0] < 80 && farben.oben[0] > 150 && farben.oben[2] < 80, farben);
  await page.screenshot({ path: path.join(AUS, 'text-und-bild-gedreht.png') });
  // In der Datei bleibt der Winkel (format.js) und überlebt Speichern und Laden
  const datei = await page.evaluate(() => { const text = LHFormat.kodiereSeite('s1', { e: __liste().filter(e => e.id === 'txt1' || e.id === 'bild1') }), z = LHFormat.dekodiereSeite(text).e; return { inDatei: JSON.parse(text).e.map(e => [e.k, e.dr]), zurueck: z.map(e => [e.typ, e.dr]) }; });
  ok('datei: dr bleibt erhalten', JSON.stringify(datei.inDatei) === '[["t",90],["b",270]]' && JSON.stringify(datei.zurueck) === '[["text",90],["bild",270]]', datei);
  await page.evaluate(async () => { const lw = Dokument.leinwand(); lw.auswahlLeeren(); lw.setzeWerkzeug('stift'); await __bild(); });

  /* ===== 5. Form einrasten und weiter ziehen: grösser, kleiner und drehen ===== */
  await page.evaluate(() => { const lw = Dokument.leinwand(); lw.einst.halteForm = true; });
  // Rechteck 160 x 100, gezeichnet ab der Ecke oben links, Stift endet dort
  const eck = [[700, 520], [860, 520], [860, 620], [700, 620], [700, 522]];
  const vorForm = await anzahl();
  await page.evaluate(([p]) => __halte(p, []), [weg(eck)]);
  const recht = await letzter();
  const kr = await page.evaluate(() => __kasten(__liste()[__liste().length - 1]));
  ok('form: Rechteck eingerastet', (await anzahl()) === vorForm + 1 && Math.abs(kr.b / kr.h - 1.6) < 0.25 && recht.p.length > 8, kr);
  // Dasselbe noch einmal daneben, nach dem Einrasten nur wenig zur Seite (unter der Schwelle): bleibt gerade, wird grösser
  const eck2 = eck.map(([x, y]) => [x, y - 260]);
  // Mitte des Rechtecks (Bildschirm) und Stift an der Ecke: radial nach aussen = nur grösser
  const cx = 780, cy = 310;
  await page.evaluate(([p, n]) => __halte(p, n), [weg(eck2), [[700 - 16, 262 - 10], [700 - 32, 262 - 20]]]);
  const gross = await page.evaluate(() => __kasten(__liste()[__liste().length - 1]));
  const seitenGerade = k => page.evaluate(() => { const p = __liste()[__liste().length - 1].p; let schief = 0; for (let i = 1; i < p.length; i++) { const dx = Math.abs(p[i][0] - p[i - 1][0]), dy = Math.abs(p[i][1] - p[i - 1][1]); if (dx > 3 && dy > 3) schief++; } return schief; });
  ok('form: radial gezogen wird sie groesser und bleibt gerade', gross.b > kr.b * 1.25 && (await seitenGerade()) === 0, [kr, gross]);
  // Und einmal um die Mitte herumgezogen (45°): das Rechteck dreht sich
  const eck3 = eck.map(([x, y]) => [x - 420, y - 260]);
  const c3 = [cx - 420, cy], r3 = Math.hypot(700 - 420 - c3[0], 262 - c3[1]), w0 = Math.atan2(262 - c3[1], 280 - c3[0]);
  const bogen = []; for (let i = 1; i <= 18; i++) { const w = w0 + (45 * Math.PI / 180) * i / 18; bogen.push([c3[0] + r3 * Math.cos(w), c3[1] + r3 * Math.sin(w)]); }
  await page.evaluate(([p, n]) => __halte(p, n), [weg(eck3), bogen]);
  const gedreht = await page.evaluate(() => __kasten(__liste()[__liste().length - 1]));
  // 45° gezogen, 7° zählen nicht: um 38° gedreht ist der Kasten deutlich höher und breiter als das liegende Rechteck
  ok('form: um die Mitte gezogen dreht sie sich', gedreht.h > kr.h * 1.6 && (await seitenGerade()) > 6, [kr, gedreht]);
  await page.screenshot({ path: path.join(AUS, 'form-gedreht.png') });

  /* ===== 6. Pfeile ===== */
  const form = pts => page.evaluate(async p => { const lw = Dokument.leinwand(); let art = null; const alt = LHFormen.erkenne; LHFormen.erkenne = q => { const e = alt(q); art = e && e.art; return e; }; await __halte(p, []); LHFormen.erkenne = alt; return art; }, pts);
  // rund gezeichnete Umkehr an den Widerhaken (weg() macht Ecken, hier mit Zwischenpunkten abgerundet)
  const rund = (p, k) => p.map((_, i) => { let x = 0, y = 0, c = 0; for (let d = -k; d <= k; d++) { const q = p[Math.max(0, Math.min(p.length - 1, i + d))]; x += q[0]; y += q[1]; c++; } return [x / c, y / c, 0.4]; });
  ok('pfeil: Spitze mit runder Umkehr', (await form(rund(weg([[150, 470], [350, 470], [312, 446], [350, 470], [312, 494]]), 2))) === 'pfeil');
  ok('pfeil: Spitze als Dreieck', (await form(rund(weg([[450, 470], [650, 470], [612, 446], [612, 494], [650, 470]]), 1))) === 'pfeil');
  ok('pfeil: quer hinueber', (await form(rund(weg([[750, 470], [950, 470], [912, 446], [912, 494]]), 1))) === 'pfeil');
  ok('linie bleibt Linie', (await form(weg([[150, 530], [350, 530]]))) === 'linie');
  // Pfeil in zwei Zügen: an die eben gezogene Linie (endet bei 350,530) eine Spitze setzen
  const artSpitze = await page.evaluate(async p => { await __halte(p, []); return null; }, rund(weg([[318, 508], [352, 531], [316, 554]]), 1));
  const spitze = await page.evaluate(() => { const e = __liste(), s = e[e.length - 1], l = e[e.length - 2]; const m = s.p[Math.floor(s.p.length / 2)], ende = l.p[l.p.length - 1]; return { abstand: Math.hypot(m[0] - ende[0], m[1] - ende[1]), l1: Math.hypot(s.p[0][0] - ende[0], s.p[0][1] - ende[1]), l2: Math.hypot(s.p[s.p.length - 1][0] - ende[0], s.p[s.p.length - 1][1] - ende[1]), linie: l.p.length }; });
  ok('pfeil in zwei Zuegen: Spitze sitzt am Linienende, beide Haken gleich', spitze.linie === 2 && spitze.abstand < 1 && Math.abs(spitze.l1 - spitze.l2) < 0.6 && spitze.l1 > 8, spitze);
  await page.screenshot({ path: path.join(AUS, 'pfeile.png'), clip: { x: 60, y: 590, width: 1000, height: 240 } });
  await page.evaluate(() => { Dokument.leinwand().einst.halteForm = false; });

  /* ===== 7. Laserpointer ===== */
  const laser = await page.evaluate(async () => {
    const lw = Dokument.leinwand(), host = lw.el, live = host.querySelector('.lw-live'), punkt = host.querySelector('.lw-laser');
    const vorher = __liste().length;
    lw.setzeWerkzeug('laser'); await __bild();
    const leerVorher = !host.querySelector('.lw-laserspur');
    __ev('pointerdown', 300, 400);
    await __bild();
    // Die Spur hat ihre eigene Ebene (einfache Auflösung); "live" bleibt unberührt
    const spurCv = host.querySelector('.lw-laserspur'), c = spurCv.getContext('2d'), lc = live.getContext('2d');
    // Zählen, was je Bild gemalt und gelöscht wird
    let striche = 0, geloescht = 0, maxStriche = 0, maxFlaeche = 0, bilder = 0, liveBefehle = 0;
    const s0 = c.stroke.bind(c), k0 = c.clearRect.bind(c), ls = lc.stroke.bind(lc), lf = lc.fill.bind(lc), lk = lc.clearRect.bind(lc);
    c.stroke = (...a) => { striche++; return s0(...a); };
    c.clearRect = (x, y, w, h) => { geloescht += w * h; return k0(x, y, w, h); };
    lc.stroke = (...a) => { liveBefehle++; return ls(...a); }; lc.fill = (...a) => { liveBefehle++; return lf(...a); }; lc.clearRect = (...a) => { liveBefehle++; return lk(...a); };
    let laeuft = true;
    const takt = () => { bilder++; maxStriche = Math.max(maxStriche, striche); maxFlaeche = Math.max(maxFlaeche, geloescht); striche = 0; geloescht = 0; if (laeuft) requestAnimationFrame(takt); };
    requestAnimationFrame(takt);
    // 300 Ereignisse in engen Kreisen (wie ein 240-Hz-Stift über 1,2 s)
    for (let i = 1; i <= 300; i++) { const w = i / 12; __ev('pointermove', 420 + 110 * Math.cos(w) + i * 0.5, 400 + 80 * Math.sin(w)); if (i % 4 === 0) await new Promise(f => requestAnimationFrame(f)); }
    await __bild();
    laeuft = false;
    const r = punkt.getBoundingClientRect(), hr = host.getBoundingClientRect();
    const pixel = cv => { const d = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data; let n = 0; for (let i = 3; i < d.length; i += 4) if (d[i] > 0) n++; return n; };
    const erg = { leerVorher, punktDa: !punkt.hidden && getComputedStyle(punkt).opacity === '1', mitte: [r.left + r.width / 2 - hr.left, r.top + r.height / 2 - hr.top], soll: [420 + 110 * Math.cos(25) + 150, 400 + 80 * Math.sin(25)], spur: pixel(spurCv), maxStriche, maxFlaeche, ganz: spurCv.width * spurCv.height, anteil: spurCv.width * spurCv.height / (live.width * live.height), bilder, liveBefehle, liveLeer: pixel(live) === 0 };
    __ev('pointerup', erg.soll[0], erg.soll[1]);
    await __warte(1900); await __bild();
    c.stroke = s0; c.clearRect = k0; lc.stroke = ls; lc.fill = lf; lc.clearRect = lk;
    erg.rest = pixel(spurCv); erg.punktWeg = getComputedStyle(punkt).opacity === '0'; erg.striche = __liste().length - vorher; erg.ungesichert = lw.ungesichert();
    lw.setzeWerkzeug('stift'); await __bild();
    erg.versteckt = punkt.hidden && !host.querySelector('.lw-laserspur');
    return erg;
  });
  ok('laser: Punkt ist ein Element und folgt dem Stift', laser.punktDa && Math.hypot(laser.mitte[0] - laser.soll[0], laser.mitte[1] - laser.soll[1]) < 1.5, laser);
  ok('laser: Spur auf eigener Ebene mit einem Viertel der Pixel, erst beim Benutzen angelegt', laser.leerVorher && laser.spur > 500 && Math.abs(laser.anteil - 0.25) < 0.01, laser);
  ok('laser: die grosse Ebene wird nicht angefasst', laser.liveBefehle === 0 && laser.liveLeer, laser.liveBefehle);
  ok('laser: wenige Zuege je Bild (hoechstens 24 statt bis 800)', laser.maxStriche > 0 && laser.maxStriche <= 24, laser.maxStriche);
  ok('laser: nur der Bereich der Spur wird geloescht', laser.maxFlaeche > 0 && laser.maxFlaeche < laser.ganz * 0.35, [laser.maxFlaeche, laser.ganz]);
  ok('laser: verblasst ganz, nichts gezeichnet oder zu sichern, Ebene wieder frei', laser.rest === 0 && laser.punktWeg && laser.striche === 0 && !laser.ungesichert && laser.versteckt, laser);

  /* ===== 8. Leiste im Vollbild ===== */
  const leiste = await page.evaluate(async () => {
    const l = document.querySelector('#dok-leiste .dok-leiste') || document.querySelector('.dok-leiste'), mass = () => { const r = l.getBoundingClientRect(); return [Math.round(r.width), Math.round(r.height)]; };
    document.querySelector('[data-el="vollbild"]').click(); await __warte(1100);
    const erg = {};
    for (const w of ['hand', 'stift', 'marker', 'radierer', 'text', 'laser', 'notiz']) {
      const k = l.querySelector(`[data-werkzeug="${w}"]`);
      k.click(); await __warte(120);
      if (w !== 'hand' && !l.classList.contains('eig-offen')) { k.click(); await __warte(120); }
      erg[w] = mass();
      const z = l.querySelector('.eig-zeile');
      if (w !== 'hand') { const zr = z.getBoundingClientRect(), lr = l.getBoundingClientRect(); erg[w + 'Zeile'] = [Math.round(zr.left - lr.left), Math.round(lr.right - zr.right), [...z.children].filter(c => !c.hidden).every(c => { const r = c.getBoundingClientRect(); return r.left >= lr.left - 0.5 && r.right <= lr.right + 0.5; })]; }
    }
    return erg;
  });
  await page.evaluate(async () => { const l = document.querySelector('.dok-leiste'), k = l.querySelector('[data-werkzeug="stift"]'); k.click(); await __warte(120); if (!l.classList.contains('eig-offen')) { k.click(); await __warte(120); } });
  await page.screenshot({ path: path.join(AUS, 'vollbild-stift.png'), clip: { x: 0, y: 0, width: 1194, height: 260 } });
  const breiten = ['stift', 'marker', 'radierer', 'text', 'laser', 'notiz'].map(w => leiste[w][0] - leiste.hand[0]);
  ok('vollbild: Leiste mit Farben nicht breiter als mit der Hand (+ Abstand)', breiten.every(d => d >= 0 && d <= 12), [leiste.hand, breiten]);
  ok('vollbild: zwei Zeilen', ['stift', 'marker', 'radierer', 'text', 'laser', 'notiz'].every(w => leiste[w][1] <= leiste.hand[1] * 2 + 12), leiste);
  ok('vollbild: untere Zeile bleibt in der Leiste', ['stift', 'marker', 'radierer', 'text', 'laser', 'notiz'].every(w => leiste[w + 'Zeile'][2]), leiste);
  await page.evaluate(async () => { document.querySelector('[data-el="vollbild"]').click(); await __warte(1100); });

  /* ===== 9. Stiftarten mit Strichprobe und Erklärung ===== */
  const arten = await page.evaluate(async () => {
    const l = document.querySelector('.dok-leiste');
    l.querySelector('[data-werkzeug="stift"]').click(); await __warte(100);
    const k = [...l.querySelectorAll('[data-stiftart]')];
    l.querySelector('[data-stiftart="fueller"]').click(); await __warte(80);
    l.querySelector('[data-stiftart="pinsel"]').click(); await __warte(150);
    const m = document.querySelector('.meldung, [role="status"]');
    return { n: k.length, proben: k.every(x => !!x.querySelector('svg.probe')), namen: k.map(x => x.querySelector('.stiftart-name').textContent), art: Dokument.leinwand().einst.stiftArt, meldung: document.body.innerText.includes('Pinselstift: doppelt so breit') };
  });
  ok('stiftarten: Strichprobe, Name und Erklaerung beim Wechsel', arten.n === 3 && arten.proben && arten.namen.join() === 'Füller,Kuli,Pinsel' && arten.art === 'pinsel' && arten.meldung, arten);
  await page.screenshot({ path: path.join(AUS, 'leiste-stiftarten.png'), clip: { x: 0, y: 0, width: 1194, height: 200 } });
  await page.evaluate(() => Dokument.leinwand().setzeStiftArt('fueller'));

  /* ===== 10. Menü ⋯ ===== */
  await page.click('[data-el="mehr"]');
  await page.waitForTimeout(250);
  const mehr = await page.evaluate(() => {
    const k = document.querySelector('.kontext.mehr'); if (!k) return null;
    const r = k.getBoundingClientRect(), teile = [...k.querySelectorAll('.mehr-teil')];
    const spalten = new Set(teile.map(t => Math.round(t.getBoundingClientRect().left)));
    return { b: Math.round(r.width), h: Math.round(r.height), scroll: k.scrollHeight > k.clientHeight + 1, imBild: r.top >= 0 && r.left >= 0 && r.right <= innerWidth && r.bottom <= innerHeight, teile: teile.length, spalten: spalten.size, titel: teile.map(t => t.querySelector('.kontext-titel').textContent), papier: k.querySelector('[data-papier][aria-checked="true"]').textContent, symbole: k.querySelectorAll('.mehr-teil button svg.menue-symbol').length };
  });
  ok('menue: Feld mit Gruppen in Spalten, ganz im Bild, ohne Scrollen', mehr && mehr.imBild && !mehr.scroll && mehr.spalten === 3 && mehr.teile >= 7 && mehr.h < 700 && mehr.symbole > 10, mehr);
  await page.screenshot({ path: path.join(AUS, 'menue-mehr.png') });
  await page.click('.kontext.mehr [data-papier="linien"]');
  await page.waitForTimeout(200);
  ok('menue: Papier waehlen wirkt und schliesst', await page.evaluate(() => !document.querySelector('.kontext') && Bibliothek.get(Dokument.id()).papier === 'linien'));
  await page.click('[data-el="mehr"]');
  await page.waitForTimeout(200);
  await page.click('.kontext.mehr [data-dreh="90"]');
  await page.waitForTimeout(400);
  ok('menue: Seite drehen', await page.evaluate(() => { const it = Bibliothek.get(Dokument.id()); return !!it.drehung && Object.values(it.drehung)[0] === 90; }));
  // schmal (iPad hochkant, geteilt): eine Spalte weniger, bleibt im Bild
  await page.setViewportSize({ width: 600, height: 834 });
  await page.waitForTimeout(500);
  await page.click('[data-el="mehr"]');
  await page.waitForTimeout(250);
  const schmal = await page.evaluate(() => { const k = document.querySelector('.kontext.mehr'), r = k.getBoundingClientRect(); return { b: Math.round(r.width), imBild: r.left >= 0 && r.right <= innerWidth && r.bottom <= innerHeight && r.top >= 0, spalten: new Set([...k.querySelectorAll('.mehr-teil')].map(t => Math.round(t.getBoundingClientRect().left))).size }; });
  ok('menue schmal: passt ins Bild', schmal.imBild && schmal.spalten >= 1 && schmal.spalten <= 2, schmal);
  await page.screenshot({ path: path.join(AUS, 'menue-mehr-schmal.png') });

  r.fehler = t.fehler.filter(x => !/Failed to load resource/.test(x));
  ok('keine Fehler in der Konsole', r.fehler.length === 0, r.fehler);
  fs.writeFileSync(path.join(AUS, 'neuerungen313.json'), JSON.stringify(r, null, 2));
  const schlecht = Object.entries(r).filter(([k, v]) => k !== 'fehler' && v !== 'ok');
  console.log(schlecht.length ? `${schlecht.length} FEHLER` : 'Alles in Ordnung', '->', AUS);
  await t.zu();
  process.exit(schlecht.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
