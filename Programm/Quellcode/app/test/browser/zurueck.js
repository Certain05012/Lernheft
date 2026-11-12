'use strict';
// Zurück nach einem Sprung: ein Skript (PDF mit 14 Seiten) mit Lesezeichen auf Seite 9. Von Seite 2 über die
// Seitenleiste zum Lesezeichen, der Knopf "Zurück zu Seite 2" führt genau zurück (Stelle und Zoom) und bietet dann den
// Weg wieder hin an; ausblenden; kein Knopf bei einem Sprung auf dieselbe Seite.
// Aufruf: node test/browser/zurueck.js [ausgabeordner] -> zurueck.json und Fotos
const { starte, pdf, ausgabe } = require('./hilfe');
const fs = require('fs'), path = require('path');
const AUS = ausgabe('zurueck');
(async () => {
  const t = await starte({ b: 1194, h: 834, dpr: 2 });
  const { page } = t;
  page.setDefaultTimeout(10000);
  const r = {}, ok = (n, b, x) => { r[n] = b ? 'ok' : ['FEHLER', x]; if (!b) console.error(n, 'FEHLER ' + JSON.stringify(x)); };
  fs.writeFileSync(path.join(AUS, 'Uebungen.pdf'), await pdf(14));
  await page.setInputFiles('#pdf-datei', path.join(AUS, 'Uebungen.pdf'));
  await page.waitForTimeout(1500);
  // evtl. Dialog bestätigen, dann das Skript öffnen
  const dlg = await page.$('dialog[open] button[type="submit"]'); if (dlg) await dlg.click();
  await page.waitForTimeout(800);
  const id = await page.evaluate(() => (Bibliothek.dokumente().find(d => d.art === 'skript') || {}).id);
  ok('skript angelegt', !!id, id);
  await page.evaluate(id => { location.hash = '#/dok/' + id; }, id);
  await page.waitForFunction(() => Dokument.leinwand() && Dokument.leinwand().seiten().length === 14);
  await page.waitForTimeout(1200);
  const bild = () => page.evaluate(() => new Promise(f => requestAnimationFrame(() => requestAnimationFrame(f))));
  const seite = () => page.evaluate(() => Dokument.leinwand().aktuelleSeite() + 1);
  // Lesezeichen auf Seite 9 (Lösungen), wir stehen auf Seite 2 und haben gezoomt
  await page.evaluate(async id => {
    Bibliothek.aendere(id, x => { x.lesezeichen = [9]; });
    const lw = Dokument.leinwand();
    lw.springeZuSeite(1, false, 300);
    lw.zoome(1.3);
  }, id);
  await bild(); await page.waitForTimeout(300);
  ok('auf Seite 2', await seite() === 2, await seite());
  ok('kein Knopf vor dem Sprung', await page.evaluate(() => { const k = document.querySelector('.sl-zurueck'); return !k || k.hidden; }));
  // Seitenleiste > Lesezeichen > Seite 9
  await page.click('[data-sl="leiste"]');
  await page.waitForSelector('.seitenleiste');
  await page.click('.seitenleiste [data-reiter="lesezeichen"]');
  await page.waitForSelector('.sl-seite[data-nr="9"]');
  await page.screenshot({ path: path.join(AUS, 'lesezeichen-liste.png') });
  const start = await page.evaluate(() => Dokument.leinwand().merkAnsicht());
  await page.click('.sl-seite[data-nr="9"] .sl-nr');
  await page.waitForTimeout(900);
  ok('beim Lesezeichen', await seite() === 9, await seite());
  const text = await page.evaluate(() => { const k = document.querySelector('.sl-zurueck'); return k && !k.hidden ? k.textContent.trim() : null; });
  ok('Knopf zeigt die Herkunft', text === 'Zurück zu Seite 2', text);
  await page.waitForTimeout(3600); await page.screenshot({ path: path.join(AUS, 'zurueck.png'), clip: { x: 0, y: 380, width: 1194, height: 454 } });
  // dort weiterblättern, dann zurück
  await page.evaluate(() => Dokument.leinwand().springeZuSeite(9, false, 200)); await bild(); await page.waitForTimeout(200);
  await page.click('.sl-zurueck [data-z="geh"]');
  await bild(); await page.waitForTimeout(200);
  const zurueck = await page.evaluate(() => Dokument.leinwand().merkAnsicht());
  ok('genau zurueck (Stelle und Zoom)', await seite() === 2 && Math.abs(zurueck.dy - start.dy) < 1 && Math.abs(zurueck.s - start.s) < 1e-6, [start, zurueck]);
  const text2 = await page.evaluate(() => document.querySelector('.sl-zurueck').textContent.trim());
  ok('Knopf fuehrt wieder hin', text2 === 'Zurück zu Seite 10', text2);
  await page.click('.sl-zurueck [data-z="geh"]');
  await bild(); await page.waitForTimeout(200);
  ok('wieder bei den Loesungen', await seite() === 10, await seite());
  ok('und wieder zurueck angeboten', await page.evaluate(() => document.querySelector('.sl-zurueck').textContent.trim()) === 'Zurück zu Seite 2');
  // Menü ⋯ kennt ihn auch
  ok('Seitenleiste meldet Herkunft', await page.evaluate(() => !!document.querySelector('.sl-zurueck [data-z="geh"]')));
  await page.click('.sl-zurueck [data-z="zu"]');
  ok('ausblenden', await page.evaluate(() => document.querySelector('.sl-zurueck').hidden));
  // Sprung auf dieselbe Seite: kein Knopf
  await page.evaluate(() => Dokument.leinwand().springeZuSeite(8, false, 0)); await bild(); await page.waitForTimeout(200);
  await page.click('.sl-seite[data-nr="9"] .sl-nr');
  await page.waitForTimeout(600);
  ok('gleiche Seite: kein Knopf', await page.evaluate(() => document.querySelector('.sl-zurueck').hidden));
  r.fehler = t.fehler.filter(f => !/ERR_FAILED/.test(f));
  fs.writeFileSync(path.join(AUS, 'zurueck.json'), JSON.stringify(r, null, 2));
  console.log(JSON.stringify(r, null, 1));
  console.log('Ausgabe:', AUS);
  await t.zu();
  if (Object.values(r).some(v => Array.isArray(v) && v[0] === 'FEHLER') || r.fehler.length) process.exit(1);
})().catch(e => { console.error(String(e).slice(0, 800)); process.exit(1); });
