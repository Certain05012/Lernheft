'use strict';
// Speichern und Verlauf ohne Kopien der ganzen Seite (3.12): Was daten.js speichert, ist genau das, was auf dem Blatt
// steht (auch nach Verschieben und Umfärben, die Elemente an Ort und Stelle ändern); Rückgängig und Wiederholen nach
// Schreiben, Radieren (Strich und Bereich), Verschieben, Färben; Grabsteine; Text und Haftnotiz; die Kopie im Speicher
// hängt nicht am Blatt. Dazu die Zeit für das Speichern einer vollen Seite (früher: als Text schreiben und einlesen).
// Aufruf: node test/browser/verlauf.js
const { starte, notizbuch } = require('./hilfe');
(async () => {
  const t = await starte();
  const { page } = t;
  const id = await notizbuch(page, { seiten: 1, zeilen: 12 });
  const r = await page.evaluate(async id => {
    const raus = {}, ok = (n, b, x) => { raus[n] = b ? 'ok' : ['FEHLER', x]; };
    const lw = Dokument.leinwand(), sid = lw.seiten()[0].id, key = 'ink:' + id + ':' + sid;
    const cv = document.querySelector('.dok-bereich:not([hidden]) .lw-canvas');
    cv.setPointerCapture = () => {}; cv.releasePointerCapture = () => {}; cv.hasPointerCapture = () => true;
    const hr = cv.parentElement.getBoundingClientRect();
    const ev = (typ, x, y, p, art) => cv.dispatchEvent(new PointerEvent(typ, { pointerId: 9, pointerType: art || 'pen', isPrimary: true, clientX: hr.left + x, clientY: hr.top + y, pressure: typ === 'pointerup' ? 0 : p || 0.4, buttons: typ === 'pointerup' ? 0 : 1, button: 0, bubbles: true, cancelable: true }));
    const bild = () => new Promise(f => requestAnimationFrame(() => requestAnimationFrame(f)));
    const strich = async (pts) => { ev('pointerdown', pts[0][0], pts[0][1], pts[0][2]); for (const q of pts.slice(1)) ev('pointermove', q[0], q[1], q[2]); await bild(); ev('pointerup', pts[pts.length - 1][0], pts[pts.length - 1][1]); await bild(); };
    const gleichWieSpeicher = () => { lw.sichern(); return JSON.stringify(Daten.get(key)) === JSON.stringify(lw.inhalt(sid)); };
    lw.einst.halteForm = false; lw.einst.kritzelLoeschen = false;
    const a = lw.ansicht(), s = lw.seiten()[0];
    const sx = x => (x + s.x) * a.s + a.x, sy = y => (y + s.y) * a.s + a.y;
    const n0 = lw.inhalt(sid).e.length;
    // 1) Strich schreiben, speichern
    lw.setzeWerkzeug('stift');
    const pts = []; for (let i = 0; i < 60; i++) pts.push([sx(100 + i * 3), sy(500 + 20 * Math.sin(i / 5)), 0.3 + 0.2 * Math.sin(i / 7)]);
    await strich(pts);
    ok('strich da', lw.inhalt(sid).e.length === n0 + 1);
    ok('gespeichert wie im Blatt', gleichWieSpeicher());
    // 2) rückgängig, wiederholen
    lw.rueckgaengig(); ok('rueck', lw.inhalt(sid).e.length === n0 && gleichWieSpeicher());
    lw.wiederholen(); ok('wieder', lw.inhalt(sid).e.length === n0 + 1 && gleichWieSpeicher());
    // 3) Radieren (Strich-Modus): ein Schritt, rückgängig bringt alles zurück
    const vorRadieren = JSON.stringify(lw.inhalt(sid).e.map(e => [e.id, e.p.length]));
    lw.setzeWerkzeug('radierer'); lw.setzeRadiermodus('strich');
    const rp = []; for (let i = 0; i < 40; i++) rp.push([sx(60 + i * 8), sy(64 + i * 0.4), 0.5]);
    await strich(rp);
    const nachRadieren = lw.inhalt(sid).e.length;
    ok('radiert', nachRadieren < n0 + 1, nachRadieren);
    ok('grabsteine', Object.keys(lw.inhalt(sid).x || {}).length === n0 + 1 - nachRadieren, lw.inhalt(sid).x);
    ok('radiert gespeichert', gleichWieSpeicher());
    lw.rueckgaengig();
    ok('radieren rueck', JSON.stringify(lw.inhalt(sid).e.map(e => [e.id, e.p.length]).sort()) === JSON.stringify(JSON.parse(vorRadieren).sort()), lw.inhalt(sid).e.length);
    ok('radieren rueck: keine Grabsteine', !lw.inhalt(sid).x, lw.inhalt(sid).x);
    ok('radieren rueck gespeichert', gleichWieSpeicher());
    lw.wiederholen();
    ok('radieren wieder', lw.inhalt(sid).e.length === nachRadieren && gleichWieSpeicher());
    lw.rueckgaengig();
    // 4) Radieren Bereich: Striche zerfallen
    lw.setzeRadiermodus('bereich'); lw.waehleGroesse('gross');
    await strich([[sx(120), sy(40)], [sx(120), sy(120)], [sx(121), sy(200)]]);
    const zerfallen = lw.inhalt(sid).e.length;
    ok('bereich radiert', zerfallen !== n0 + 1, zerfallen);
    ok('bereich gespeichert', gleichWieSpeicher());
    lw.rueckgaengig();
    ok('bereich rueck', lw.inhalt(sid).e.length === n0 + 1 && gleichWieSpeicher(), lw.inhalt(sid).e.length);
    // 5) Lasso + Verschieben: Punkte ändern sich an Ort und Stelle -> muss neu gespeichert werden
    lw.setzeWerkzeug('lasso');
    const lp = [[30, 40], [400, 40], [400, 130], [30, 130], [30, 40]].map(([x, y]) => [sx(x), sy(y), 0.5]);
    await strich(lp);
    const gewaehlt = lw.zustand().auswahl;
    ok('lasso waehlt', gewaehlt > 0, gewaehlt);
    const vorher = JSON.stringify(Daten.get(key));
    ev('pointerdown', sx(100), sy(70)); for (let i = 1; i <= 10; i++) ev('pointermove', sx(100 + i * 5), sy(70 + i * 3)); await bild(); ev('pointerup', sx(150), sy(100)); await bild();
    ok('verschoben gespeichert', gleichWieSpeicher() && JSON.stringify(Daten.get(key)) !== vorher);
    lw.rueckgaengig();
    ok('verschieben rueck', gleichWieSpeicher());
    const zurueck = JSON.parse(JSON.stringify(Daten.get(key))), alt = JSON.parse(vorher);
    const pkt = o => JSON.stringify(o.e.map(e => [e.id, e.p]).sort());
    ok('verschieben rueck: Punkte wie vorher', pkt(zurueck) === pkt(alt));
    // 6) Farbe der Auswahl ändern (Feld f an Ort und Stelle)
    await strich(lp);
    lw.faerbeAuswahl('rot'); await bild();
    ok('gefaerbt gespeichert', gleichWieSpeicher() && Daten.get(key).e.some(e => e.f === 'rot'));
    lw.rueckgaengig();
    ok('faerben rueck', gleichWieSpeicher() && !Daten.get(key).e.some(e => e.f === 'rot'));
    // 7) Text und Haftnotiz (keine Striche): normaler Weg
    lw.auswahlLeeren();
    const inh = lw.inhalt(sid);
    inh.e.push({ typ: 'text', id: 'tx1', x: 100, y: 700, b: 300, t: 'Hallo "Welt"\nzwei', gr: 24, f: 'tinte', erstellt: 1, m: 2 });
    inh.e.push({ typ: 'notiz', id: 'nz1', x: 300, y: 700, b: 180, h: 180, f: 'gelb', t: 'Notiz', gr: 18, erstellt: 1, m: 2, e: [{ id: 'q', w: 'stift', f: 'tinte', d: 2, m: 3, p: [[1, 2, 0.5], [3, 4, 0.5, 0.25]] }] });
    Daten.set(key, inh);
    ok('text und notiz gespeichert', JSON.stringify(Daten.get(key)) === JSON.stringify(inh));
    // 8) Kopie aus Daten ist unabhängig vom Blatt
    const el = inh.e[0], x0 = el.p[0][0];
    el.p[0][0] += 5;
    ok('kopie unabhaengig', Daten.get(key).e[0].p[0][0] === x0);
    Daten.set(key, inh);
    ok('aenderung an Ort und Stelle erkannt', Daten.get(key).e[0].p[0][0] === x0 + 5);
    el.p[3][2] = 0.96875;
    Daten.set(key, inh);
    ok('Druck in der Mitte erkannt', Daten.get(key).e[0].p[3][2] === 0.96875);
    // 9) Zeit: Speichern einer vollen Seite
    const voll = { e: [] };
    for (let z = 0; z < 40; z++) for (let w = 0; w < 10; w++) { const p = []; for (let i = 0; i < 120; i++) p.push([40 + w * 72 + i * 0.55, 60 + z * 26 + Math.sin(i / 5 + w) * 6, Math.round((0.3 + 0.2 * Math.sin(i / 9)) * 32) / 32]); voll.e.push({ id: 'v' + z + '_' + w, w: 'stift', f: 'tinte', d: 1.7, m: 1, p }); }
    let t0 = performance.now(); Daten.set('ink:zeit:1', voll); const kalt = performance.now() - t0;
    voll.e.push({ id: 'neu', w: 'stift', f: 'tinte', d: 1.7, m: 5, p: [[1, 2, 0.5], [3, 4, 0.5]] });
    t0 = performance.now(); Daten.set('ink:zeit:1', voll); const warm = performance.now() - t0;
    t0 = performance.now(); const j = JSON.stringify(voll); JSON.parse(j); const frueher = performance.now() - t0;
    ok('volle Seite gleich', JSON.stringify(Daten.get('ink:zeit:1')) === j);
    raus.zeiten = { ersteMalMs: Math.round(kalt * 10) / 10, danachMs: Math.round(warm * 10) / 10, frueherMs: Math.round(frueher * 10) / 10 };
    Daten.del('ink:zeit:1');
    return raus;
  }, id);
  const fehler = t.fehler.filter(f => !/ERR_FAILED/.test(f));
  console.log(JSON.stringify(r, null, 1), fehler);
  await t.zu();
  if (Object.values(r).some(x => Array.isArray(x) && x[0] === 'FEHLER') || fehler.length) process.exit(1);
})().catch(e => { console.error(e); process.exit(1); });
