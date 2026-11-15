'use strict';
// Wie flüssig sind Scrollen und Schreiben? Misst je Bild die Zeit, die das Lernheft selbst braucht (Ereignisse und
// requestAnimationFrame-Rückrufe), und die Abstände zwischen den Bildern: auf einer leeren und auf einer vollen Seite,
// mit dem Mausrad, mit dem Finger und beim Schreiben mit dem Stift.
// Aufruf: [LH_BROWSER=webkit] [LH_SEITE=<andere webseite>] node test/browser/fluss.js [ausgabeordner]
// In WebKit (Engine von Safari) zeigt das, was JavaScriptCore und WebKits Layout kosten. Das Malen selbst ist auf dem
// iPad anders (CoreGraphics); dafür gibt es die Messung in der App (Einstellungen › Erweitert › Flüssigkeit messen).
const { starte, notizbuch, ausgabe } = require('./hilfe');
const fs = require('fs'), path = require('path');
const AUS = ausgabe('fluss');
(async () => {
  const r = { browser: process.env.LH_BROWSER || 'chromium', laeufe: [] };
  for (const [name, zeilen] of [['leere Seite', 0], ['volle Seite', 40]]) {
    const t = await starte({ b: 1194, h: 834, dpr: 2, touch: true });
    const { page } = t;
    page.setDefaultTimeout(30000);
    await notizbuch(page, { seiten: 6, zeilen, name: 'Fluss' });
    const erg = await page.evaluate(async () => {
      const cv = document.querySelector('.dok-bereich:not([hidden]) .lw-canvas');
      cv.setPointerCapture = () => {}; cv.releasePointerCapture = () => {}; cv.hasPointerCapture = () => true;
      const host = cv.parentElement, hr = host.getBoundingClientRect(), lw = Dokument.leinwand();
      const warte = ms => new Promise(f => setTimeout(f, ms));
      // Zeit in den eigenen Rückrufen je Bild
      let jsBild = 0, messen = false;
      const raf0 = window.requestAnimationFrame.bind(window);
      window.requestAnimationFrame = fn => raf0(ts => { const t0 = performance.now(); try { fn(ts); } finally { if (messen) jsBild += performance.now() - t0; } });
      const sende = (ziel, ev) => { const t0 = performance.now(); ziel.dispatchEvent(ev); if (messen) jsBild += performance.now() - t0; };
      const zeiger = (typ, x, y, art, druck) => new PointerEvent(typ, { pointerId: art === 'touch' ? 31 : 9, pointerType: art, isPrimary: true, clientX: hr.left + x, clientY: hr.top + y, pressure: typ === 'pointerup' ? 0 : druck, buttons: typ === 'pointerup' ? 0 : 1, button: 0, width: art === 'touch' ? 20 : 1, height: art === 'touch' ? 20 : 1, bubbles: true, cancelable: true });
      const stat = (js, abst) => {
        const s = a => a.slice().sort((x, y) => x - y), m = a => a.reduce((x, y) => x + y, 0) / (a.length || 1), p = (a, q) => { const b = s(a); return b[Math.min(b.length - 1, Math.floor(b.length * q))] || 0; };
        return { bilder: js.length, jsMittel: +m(js).toFixed(2), jsP95: +p(js, 0.95).toFixed(2), jsMax: +p(js, 1).toFixed(2), jsUeber8: js.filter(x => x > 8).length, jsUeber16: js.filter(x => x > 16).length, bildMittel: +m(abst).toFixed(1), bildP95: +p(abst, 0.95).toFixed(1), bildMax: +p(abst, 1).toFixed(1) };
      };
      // schritt(i) löst die Eingabe für Bild i aus; gemessen wird bis zum nächsten Bild
      const lauf = async (n, schritt) => {
        await warte(500);
        const js = [], abst = []; let letzt = 0;
        messen = true;
        await new Promise(f => raf0(() => { letzt = performance.now(); f(); }));
        for (let i = 0; i < n; i++) {
          jsBild = 0;
          schritt(i);
          await new Promise(f => raf0(f));
          const jetzt = performance.now();
          js.push(jsBild); abst.push(jetzt - letzt); letzt = jetzt;
        }
        messen = false;
        return stat(js, abst);
      };
      const aus = {};
      const st0 = lw.statistik();
      aus.rad = await lauf(150, i => sende(host, new WheelEvent('wheel', { deltaY: i < 100 ? 34 : -51, bubbles: true, cancelable: true })));
      // Finger: aufsetzen, 120 Bilder ziehen (hoch und wieder runter), abheben
      await warte(900);
      sende(cv, zeiger('pointerdown', 500, 420, 'touch', 0.5));
      aus.finger = await lauf(120, i => { const y = i < 60 ? 420 - i * 6.5 : 30 + (i - 60) * 6.5; sende(cv, zeiger('pointermove', 500, y, 'touch', 0.5)); });
      sende(cv, zeiger('pointerup', 500, 420, 'touch', 0));
      const st1 = lw.statistik();
      aus.neumalenBeimScrollen = { voll: st1.voll - st0.voll, kacheln: (st1.kacheln || 0) - (st0.kacheln || 0) };
      await warte(2600);
      // Schreiben: 4 Punkte je Bild (wie ein Stift mit 240 Hz), 150 Bilder = ein langer Strich in Schlaufen
      lw.einst.halteForm = false; lw.einst.kritzelLoeschen = false; lw.einst.kreisAuswahl = false;
      lw.setzeWerkzeug('stift'); lw.setzeStiftArt('fueller');
      await warte(300);
      const punkt = k => [300 + k * 0.9 + 60 * Math.sin(k / 9), 330 + 110 * Math.sin(k / 23), 0.3 + 0.3 * Math.sin(k / 31) ** 2];
      sende(cv, zeiger('pointerdown', ...punkt(0).slice(0, 2), 'pen', 0.4));
      aus.schreiben = await lauf(150, i => { for (let j = 1; j <= 4; j++) { const q = punkt(i * 4 + j); sende(cv, zeiger('pointermove', q[0], q[1], 'pen', q[2])); } });
      const t0 = performance.now();
      sende(cv, zeiger('pointerup', ...punkt(600).slice(0, 2), 'pen', 0));
      aus.absetzenMs = +(performance.now() - t0).toFixed(2);
      // viele kurze Striche (Schreibschrift): Aufsetzen, 12 Bilder, Absetzen
      const kurz = [];
      for (let s = 0; s < 12; s++) {
        const x0 = 200 + s * 60;
        const a = performance.now();
        sende(cv, zeiger('pointerdown', x0, 520, 'pen', 0.4));
        for (let i = 1; i <= 10; i++) { sende(cv, zeiger('pointermove', x0 + i * 3, 520 + 14 * Math.sin(i / 2), 'pen', 0.4)); if (i % 3 === 0) await new Promise(f => raf0(f)); }
        const b0 = performance.now();
        sende(cv, zeiger('pointerup', x0 + 30, 520, 'pen', 0));
        kurz.push(performance.now() - b0);
        await new Promise(f => raf0(f));
      }
      aus.absetzenKurzMs = { mittel: +(kurz.reduce((x, y) => x + y, 0) / kurz.length).toFixed(2), max: +Math.max(...kurz).toFixed(2) };
      await warte(1500);
      aus.kacheln = lw.kacheln ? lw.kacheln() : null;
      return aus;
    });
    r.laeufe.push({ name, ...erg });
    if (t.sammle) await t.sammle();
    r.fehler = (r.fehler || []).concat(t.fehler.filter(x => !/Failed to load resource/.test(x)));
    await t.zu();
  }
  fs.writeFileSync(path.join(AUS, 'fluss.json'), JSON.stringify(r, null, 1));
  for (const l of r.laeufe) { console.log('== ' + l.name + ' (' + r.browser + ')'); for (const k of ['rad', 'finger', 'schreiben']) console.log(k.padEnd(10), JSON.stringify(l[k])); console.log('absetzen  ', l.absetzenMs, 'ms; kurze Striche', JSON.stringify(l.absetzenKurzMs), JSON.stringify(l.neumalenBeimScrollen)); }
  if (r.fehler && r.fehler.length) console.log('Fehler:', r.fehler);
})().catch(e => { console.error(e); process.exit(1); });
