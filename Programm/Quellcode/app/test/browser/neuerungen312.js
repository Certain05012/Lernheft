'use strict';
// Neue Funktionen 3.12: Stiftarten (Kugelschreiber gleich breit, Füller mit Druck und Tempo, Pinselstift mit Ansatz und
// Auslauf, Feder mit Drehung), Vorschau beim Schweben, Einkreisen und antippen wählt aus, Palette am Stift, Stiftart
// in der Leiste, Einstellungen in Bereichen (gelten sofort), Stift-Panel.
// Aufruf: node test/browser/neuerungen312.js [ausgabeordner] -> neuerungen312.json und Fotos
const { starte, notizbuch, ausgabe } = require('./hilfe');
const fs = require('fs'), path = require('path');
const AUS = ausgabe('neuerungen312');
(async () => {
  const t = await starte({ b: 1194, h: 834, dpr: 2 });
  const { page } = t;
  page.setDefaultTimeout(8000);
  const r = {}, ok = (n, b, x) => { r[n] = b ? 'ok' : ['FEHLER', x]; if (!b) console.error(n, 'FEHLER ' + JSON.stringify(x)); };
  const id = await notizbuch(page, { seiten: 2, zeilen: 0, name: 'Funktionen' });
  await page.evaluate(() => {
    const cv = document.querySelector('.dok-bereich:not([hidden]) .lw-canvas');
    cv.setPointerCapture = () => {}; cv.releasePointerCapture = () => {}; cv.hasPointerCapture = () => true;
    const hr = cv.parentElement.getBoundingClientRect();
    window.__ev = (typ, x, y, p, extra) => cv.dispatchEvent(new PointerEvent(typ, Object.assign({ pointerId: 9, pointerType: 'pen', isPrimary: true, clientX: hr.left + x, clientY: hr.top + y, pressure: typ === 'pointerup' ? 0 : (p == null ? 0.4 : p), buttons: typ === 'pointerup' || p === 0 ? 0 : 1, button: 0, bubbles: true, cancelable: true }, extra || {})));
    window.__bild = () => new Promise(f => requestAnimationFrame(() => requestAnimationFrame(f)));
    // Strich mit echter Zeit zwischen den Punkten (ms je Punkt)
    window.__strich = async (pts, ms, extra) => { __ev('pointerdown', pts[0][0], pts[0][1], pts[0][2], extra); for (const q of pts.slice(1)) { if (ms) await new Promise(f => setTimeout(f, ms)); __ev('pointermove', q[0], q[1], q[2], extra); } await __bild(); const l = pts[pts.length - 1]; __ev('pointerup', l[0], l[1]); await __bild(); };
    const lw = Dokument.leinwand();
    lw.einst.halteForm = false; lw.einst.kritzelLoeschen = false;
  });
  const letzter = () => page.evaluate(() => { const lw = Dokument.leinwand(), e = lw.inhalt(lw.seiten()[0].id).e; return e[e.length - 1]; });
  const linie = (x0, y, n, druck) => { const p = []; for (let i = 0; i < n; i++) p.push([x0 + i * 4, y + 6 * Math.sin(i / 4), typeof druck === 'function' ? druck(i) : druck]); return p; };

  // --- Stiftarten ---
  await page.evaluate(() => { const lw = Dokument.leinwand(); lw.setzeWerkzeug('stift'); lw.waehleGroesse('gross'); lw.setzeStiftArt('kugel'); });
  await page.evaluate(p => __strich(p, 4), linie(260, 200, 70, i => 0.2 + 0.5 * Math.abs(Math.sin(i / 9))));
  let st = await letzter();
  ok('kugel: ueberall gleich', st.p.every(q => q[2] === 0.5 && q.length === 3), st.p.slice(0, 5));
  const dKugel = st.d;
  await page.evaluate(() => Dokument.leinwand().setzeStiftArt('fueller'));
  await page.evaluate(p => __strich(p, 4), linie(260, 260, 70, i => 0.2 + 0.5 * Math.abs(Math.sin(i / 9))));
  st = await letzter();
  const dr = st.p.map(q => q[2]);
  ok('fueller: Druck gibt Breite', Math.max(...dr) - Math.min(...dr) > 0.3 && st.d === dKugel, [Math.min(...dr), Math.max(...dr), st.d]);
  // schnell gegen langsam (gleicher Druck): schnell wird feiner
  await page.evaluate(p => __strich(p, 12), linie(260, 320, 50, 0.4).map(q => [260 + (q[0] - 260) * 0.5, q[1], q[2]]));
  const langsam = (await letzter()).p.map(q => q[2]);
  await page.evaluate(p => __strich(p, 2), linie(260, 380, 50, 0.4).map(q => [260 + (q[0] - 260) * 3, q[1], q[2]]));
  const schnell = (await letzter()).p.map(q => q[2]);
  const mitte = a => a.slice(10, -10).reduce((x, y) => x + y, 0) / (a.length - 20);
  ok('fueller: schnell feiner als langsam', mitte(schnell) < mitte(langsam) - 0.03, [mitte(langsam), mitte(schnell)]);
  await page.evaluate(() => Dokument.leinwand().setzeStiftArt('pinsel'));
  await page.evaluate(p => __strich(p, 6), linie(260, 450, 80, i => 0.25 + 0.45 * Math.abs(Math.sin(i / 12))));
  st = await letzter();
  const pd = st.p.map(q => q[2]);
  ok('pinsel: doppelte Dicke', Math.abs(st.d - 2 * dKugel) < 0.02, [st.d, dKugel]);
  ok('pinsel: setzt fein an', pd[0] < 0.12 && pd[0] < pd[12], pd.slice(0, 14));
  ok('pinsel: laeuft spitz aus', pd[pd.length - 1] < pd[pd.length - 14], pd.slice(-14));
  // Pinsel mit der Maus (kein Druck): Tempo formt
  await page.evaluate(p => __strich(p, 6, { pointerType: 'mouse' }), linie(260, 520, 80, 0.5));
  st = await letzter();
  ok('pinsel ohne Druck: Ansatz und Auslauf', st.p[0][2] < st.p[20][2] && st.p[st.p.length - 1][2] < st.p[st.p.length - 20][2], st.p.map(q => q[2]));
  // Feder mit Drehung (Pencil Pro): quer zur Feder breiter als längs
  await page.evaluate(() => Dokument.leinwand().setzeStiftArt('fueller'));
  const gerade = (x, y, dx, dy) => { const p = []; for (let i = 0; i < 40; i++) p.push([x + dx * i, y + dy * i, 0.4]); return p; };
  await page.evaluate(p => __strich(p, 8, { twist: 1 }), gerade(700, 200, 3, 3));     // Richtung 45°: längs der Feder (45° + 1°)
  const laengs = mitte((await letzter()).p.map(q => q[2]));
  await page.evaluate(p => __strich(p, 8, { twist: 1 }), gerade(700, 360, 3, -3));    // Richtung -45°: quer zur Feder
  const quer = mitte((await letzter()).p.map(q => q[2]));
  ok('feder: quer breiter als laengs', quer > laengs + 0.1, [laengs, quer]);
  await page.screenshot({ path: path.join(AUS, 'stiftarten.png') });

  // --- Schweben: Vorschau-Punkt ---
  const spitzePixel = () => page.evaluate(() => { const c = document.querySelector('.dok-bereich:not([hidden]) .lw-spitze'); const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let n = 0; for (let i = 3; i < d.length; i += 4) if (d[i]) n++; return n; });
  await page.evaluate(async () => { const lw = Dokument.leinwand(); lw.einst.schwebeVorschau = 'immer'; lw.setzeStiftArt('fueller'); __ev('pointermove', 600, 600, 0); await __bild(); });
  const beimSchweben = await spitzePixel();
  ok('schweben: Punkt zu sehen', beimSchweben > 4, beimSchweben);
  await page.screenshot({ path: path.join(AUS, 'schweben.png'), clip: { x: 500, y: 560, width: 300, height: 220 } });
  await page.evaluate(async () => { Dokument.leinwand().el.querySelector('.lw-canvas').dispatchEvent(new PointerEvent('pointerleave', { pointerType: 'pen', bubbles: false })); await __bild(); });
  ok('schweben: weg nach Verlassen', await spitzePixel() === 0);
  await page.evaluate(async () => { const lw = Dokument.leinwand(); lw.einst.schwebeVorschau = false; __ev('pointermove', 600, 600, 0); await __bild(); });
  ok('schweben: abschaltbar', await spitzePixel() === 0);

  // --- Einkreisen und antippen ---
  const zaehl = () => page.evaluate(() => { const lw = Dokument.leinwand(); return { n: lw.inhalt(lw.seiten()[0].id).e.length, auswahl: lw.zustand().auswahl, rueck: lw.kannRueckgaengig() }; });
  await page.evaluate(() => { const lw = Dokument.leinwand(); lw.setzeStiftArt('kugel'); lw.waehleGroesse('mittel'); });
  // zwei kleine Striche, dann ein Kreis darum
  await page.evaluate(p => __strich(p, 2), linie(820, 560, 12, 0.4));
  await page.evaluate(p => __strich(p, 2), linie(820, 590, 12, 0.4));
  const vor = await zaehl();
  const kreis = []; for (let i = 0; i <= 64; i++) { const w = i / 62 * Math.PI * 2; kreis.push([845 + 70 * Math.cos(w), 575 + 50 * Math.sin(w), 0.4]); }
  await page.evaluate(p => __strich(p, 2), kreis);
  const mitKreis = await zaehl();
  ok('kreis ist erst ein Strich', mitKreis.n === vor.n + 1 && mitKreis.auswahl === 0, mitKreis);
  // auf die Kreislinie tippen
  await page.evaluate(async p => { __ev('pointerdown', p[0], p[1], 0.4); await __bild(); __ev('pointerup', p[0], p[1]); await __bild(); }, [845 + 70, 575]);
  const gewaehlt = await zaehl();
  ok('tippen auf den Kreis waehlt aus', gewaehlt.n === vor.n && gewaehlt.auswahl === 2, gewaehlt);
  await page.screenshot({ path: path.join(AUS, 'einkreisen.png'), clip: { x: 700, y: 560, width: 420, height: 260 } });
  // verschieben mit dem Stift, ohne Lasso
  const vorPos = await page.evaluate(() => { const lw = Dokument.leinwand(), e = lw.inhalt(lw.seiten()[0].id).e; return e[e.length - 1].p[0].slice(0, 2); });
  await page.evaluate(async () => { __ev('pointerdown', 845, 577, 0.4); for (let i = 1; i <= 10; i++) __ev('pointermove', 845 + i * 4, 577 + i * 2, 0.4); await __bild(); __ev('pointerup', 885, 597); await __bild(); });
  const nachPos = await page.evaluate(() => { const lw = Dokument.leinwand(), e = lw.inhalt(lw.seiten()[0].id).e; return e[e.length - 1].p[0].slice(0, 2); });
  ok('Auswahl mit dem Stift verschoben', nachPos[0] > vorPos[0] + 10 && nachPos[1] > vorPos[1] + 5, [vorPos, nachPos]);
  // Rückgängig: Verschieben zurück, dann der Kreis wieder da
  await page.evaluate(async () => { const lw = Dokument.leinwand(); lw.rueckgaengig(); lw.rueckgaengig(); await __bild(); });
  ok('rueckgaengig bringt den Kreis zurueck', (await zaehl()).n === vor.n + 1, await zaehl());
  // Tippen woanders: bleibt ein Punkt
  await page.evaluate(p => __strich(p, 2), kreis.map(q => [q[0] - 500, q[1] + 60, q[2]]));
  const leer = await zaehl();
  await page.evaluate(async () => { __ev('pointerdown', 345 + 70, 635, 0.4); await __bild(); __ev('pointerup', 345 + 70, 635); await __bild(); });
  ok('Kreis um nichts: Tippen ist ein Punkt', (await zaehl()).n === leer.n + 1 && (await zaehl()).auswahl === 0, await zaehl());

  // --- Palette am Stift ---
  await page.evaluate(async () => { const lw = Dokument.leinwand(); lw.auswahlLeeren(); __ev('pointermove', 600, 500, 0); await __bild(); lw.geste('pencilDruecken'); await __bild(); });
  const pal = await page.evaluate(() => { const p = document.querySelector('.lw-palette'); if (!p) return null; const r = p.getBoundingClientRect(), h = p.parentElement.getBoundingClientRect(); return { x: r.left - h.left, y: r.top - h.top, b: r.width, h: r.height, knoepfe: p.querySelectorAll('button').length, arten: p.querySelectorAll('[data-part]').length }; });
  ok('palette offen beim Stift', pal && Math.abs(pal.x + pal.b / 2 - 600) < 30 && pal.y + pal.h < 500 && pal.arten === 3, pal);
  await page.screenshot({ path: path.join(AUS, 'palette.png') });
  await page.evaluate(async () => { document.querySelector('.lw-palette [data-pw="marker"]').click(); await __bild(); });
  ok('palette waehlt Werkzeug', await page.evaluate(() => Dokument.leinwand().einst.werkzeug === 'marker' && !!document.querySelector('.lw-palette') && !document.querySelector('.lw-palette [data-part]')));
  await page.evaluate(async () => { document.querySelector('.lw-palette [data-pf="gruen"]').click(); document.querySelector('.lw-palette [data-pg="gross"]').click(); await __bild(); });
  ok('palette: Farbe und Groesse', await page.evaluate(() => { const e = Dokument.leinwand().einst; return e.markerFarbe === 'gruen' && e.preset.marker === 'gross'; }));
  await page.screenshot({ path: path.join(AUS, 'palette-marker.png') });
  // weiterschreiben schliesst sie
  await page.mouse.move(700, 700); await page.mouse.down(); await page.mouse.move(760, 720, { steps: 4 }); await page.mouse.up();
  ok('palette schliesst beim Schreiben', await page.evaluate(() => !document.querySelector('.lw-palette')));
  await page.evaluate(() => { const lw = Dokument.leinwand(); lw.setzeWerkzeug('stift'); lw.setzeStiftArt('fueller'); });

  // --- Leiste: Stiftart ---
  ok('leiste zeigt Stiftarten', await page.evaluate(() => { const g = document.querySelector('#dok-leiste [data-stiftart="fueller"]'); return !!g && g.getAttribute('aria-pressed') === 'true' && !g.closest('.gruppe').hidden; }));
  await page.evaluate(async () => { document.querySelector('#dok-leiste [data-stiftart="pinsel"]').click(); await __bild(); });
  ok('leiste setzt Stiftart', await page.evaluate(() => Dokument.leinwand().einst.stiftArt === 'pinsel' && Daten.get('einst:stift').stiftArt === 'pinsel'));
  await page.screenshot({ path: path.join(AUS, 'leiste.png'), clip: { x: 0, y: 0, width: 1194, height: 190 } });

  // --- Einstellungen ---
  await page.evaluate(() => { Einstellungen.zeige('schreiben'); });
  await page.waitForSelector('.einst-dialog[open]');
  await page.screenshot({ path: path.join(AUS, 'einst-schreiben.png') });
  await page.click('.einst-dialog input[name="stiftArt"][value="kugel"] + span');
  await page.click('.einst-dialog input[name="kreisAuswahl"]');
  ok('einstellungen gelten sofort', await page.evaluate(() => { const e = Werkzeuge.einstellungen(); return e.stiftArt === 'kugel' && e.kreisAuswahl === false && Daten.get('lokal:stift').kreisAuswahl === false; }));
  await page.click('.einst-dialog input[name="kreisAuswahl"]');
  for (const k of ['gesten', 'aussehen', 'speicher', 'erweitert']) { await page.click(`.einst-nav [data-reiter="${k}"]`); await page.screenshot({ path: path.join(AUS, `einst-${k}.png`) }); }
  await page.click('.einst-nav [data-reiter="gesten"]');
  await page.selectOption('.einst-dialog [data-geste="zweiFinger"]', 'palette');
  ok('geste gesetzt', await page.evaluate(() => Werkzeuge.einstellungen().gesten.zweiFinger === 'palette'));
  await page.click('.einst-dialog [data-tu="gesten-null"]');
  ok('gesten zurueckgesetzt', await page.evaluate(() => Object.keys(Werkzeuge.einstellungen().gesten).length === 0 && document.querySelector('.einst-dialog [data-geste="pencilDruecken"]').value === 'palette'));
  await page.click('.einst-nav [data-reiter="aussehen"]');
  await page.click('.einst-dialog input[name="hg"][value="weiss"] + .muster');
  ok('design sofort hell', await page.evaluate(() => document.documentElement.dataset.theme === 'light'));
  await page.screenshot({ path: path.join(AUS, 'einst-aussehen-hell.png') });
  await page.click('.einst-dialog input[name="hg"][value="dunkelblau"] + .muster');
  await page.click('.einst-kopf [data-abbrechen]');
  ok('dialog zu', await page.evaluate(() => !document.querySelector('.einst-dialog[open]')));
  // schmal
  await page.setViewportSize({ width: 600, height: 800 });
  await page.evaluate(() => { Einstellungen.zeige('schreiben'); });
  await page.waitForSelector('.einst-dialog[open]');
  await page.screenshot({ path: path.join(AUS, 'einst-schmal.png') });
  ok('schmal: kein Ueberlauf', await page.evaluate(() => { const d = document.querySelector('.einst-dialog .einst-seiten'); return d.scrollWidth <= d.clientWidth + 1; }));
  await page.click('.einst-kopf [data-abbrechen]');
  await page.setViewportSize({ width: 1194, height: 834 });
  // Stift-Panel aus den Einstellungen
  await page.evaluate(() => { Einstellungen.zeige('schreiben'); });
  await page.waitForSelector('.einst-dialog[open]');
  await page.click('.einst-dialog [data-tu="stiftpanel"]');
  await page.waitForTimeout(200);
  ok('stift-panel offen', await page.evaluate(() => { const p = document.querySelector('.tasten-panel'); return p && !p.hidden; }));
  await page.screenshot({ path: path.join(AUS, 'stift-panel.png') });

  r.fehler = t.fehler.filter(f => !/ERR_FAILED/.test(f));
  fs.writeFileSync(path.join(AUS, 'neuerungen312.json'), JSON.stringify(r, null, 2));
  console.log(JSON.stringify(r, null, 1));
  console.log('Ausgabe:', AUS);
  await t.zu();
  if (Object.values(r).some(v => Array.isArray(v) && v[0] === 'FEHLER') || r.fehler.length) process.exit(1);
})().catch(e => { console.error(String(e).slice(0, 600)); process.exit(1); });
