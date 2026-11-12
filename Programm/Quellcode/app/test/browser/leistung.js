'use strict';
// Leistung beim Schreiben und Scrollen mit gebremster CPU (wie test/leistung.js, aber im Browser): Notizbuch mit drei
// voll beschriebenen Seiten, Striche mit 60, 600 und 1500 Punkten. bildAmEnde = mittlere Zeit der letzten Bilder eines
// Strichs (darf mit der Länge nicht wachsen), absetzenMs = Zeit für das Abheben, dazu das Profil der teuersten
// Funktionen. Ohne Grafikkarte (headless) sind die absoluten Zeiten hoch; es zählt der Vergleich.
// Aufruf: node test/browser/leistung.js [bremse, Standard 4]
const { starte, notizbuch } = require('./hilfe');
(async () => {
  const BREMSE = Number(process.argv[2]) || 4;
  const t = await starte();
  const { page, cdp } = t;
  const r = { bremse: BREMSE };
  await notizbuch(page, {});
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: BREMSE });
  await cdp.send('Profiler.enable'); await cdp.send('Profiler.setSamplingInterval', { interval: 200 }); await cdp.send('Profiler.start');
  r.schreiben = await page.evaluate(async () => {
    const lw = Dokument.leinwand(); lw.setzeWerkzeug('stift');
    const cv = document.querySelector('.dok-bereich:not([hidden]) .lw-canvas');
    cv.setPointerCapture = () => {}; cv.releasePointerCapture = () => {}; cv.hasPointerCapture = () => true;
    const hr = cv.parentElement.getBoundingClientRect();
    const ev = (typ, x, y, i) => cv.dispatchEvent(new PointerEvent(typ, { pointerId: 9, pointerType: 'pen', isPrimary: true, clientX: hr.left + x, clientY: hr.top + y, pressure: typ === 'pointerup' ? 0 : 0.35 + 0.15 * Math.sin((i || 0) / 11), buttons: typ === 'pointerup' ? 0 : 1, button: 0, bubbles: true, cancelable: true }));
    const raus = {};
    for (const [name, n] of [['kurz', 60], ['lang', 600], ['sehrlang', 1500]]) {
      const zeiten = []; let letzte = performance.now(), lauf = true;
      const f = t => { zeiten.push(t - letzte); letzte = t; if (lauf) requestAnimationFrame(f); }; requestAnimationFrame(f);
      const ereignis = [], bild = [];
      await new Promise(ok => requestAnimationFrame(() => requestAnimationFrame(ok)));
      const stat0 = lw.statistik();
      const y0 = name === 'kurz' ? 300 : name === 'lang' ? 420 : 560;
      ev('pointerdown', 200, y0, 0);
      for (let i = 1; i <= n; i++) {
        const t = performance.now(); ev('pointermove', 200 + (i * 1.2) % 700, y0 + Math.sin(i / 8) * 30 + Math.floor(i * 1.2 / 700) * 8, i); ereignis.push(performance.now() - t);
        if (i % 4 === 0) { const t1 = performance.now(); await new Promise(ok => requestAnimationFrame(ok)); bild.push(performance.now() - t1); }
      }
      const t = performance.now(); ev('pointerup', 200 + (n * 1.2) % 700, y0, n); const auf = performance.now() - t;
      await __warte(700); lauf = false;
      const letzteBilder = bild.slice(-20).reduce((a, b) => a + b, 0) / Math.min(20, bild.length);
      zeiten.sort((a, b) => b - a); ereignis.sort((a, b) => b - a);
      raus[name] = { bilder: zeiten.length, ueber20ms: zeiten.filter(z => z > 20).length, ueber33ms: zeiten.filter(z => z > 33).length, laengste: zeiten.slice(0, 5).map(Math.round), bildAmEnde: Math.round(letzteBilder * 10) / 10, ereignisMax: Math.round(ereignis[0] * 10) / 10, ereignisMedian: Math.round(ereignis[ereignis.length >> 1] * 100) / 100, absetzenMs: Math.round(auf), statistik: Object.fromEntries(Object.entries(lw.statistik()).map(([k, v]) => [k, v - (stat0[k] || 0)])) };
    }
    return raus;
  });
  const prof = (await cdp.send('Profiler.stop')).profile;
  const zeit = new Map(); const kn = new Map(prof.nodes.map(n => [n.id, n]));
  prof.samples.forEach((id, i) => { const n = kn.get(id); const k = (n.callFrame.functionName || '(anonym)') + ' ' + (n.callFrame.url || '').split('/').pop() + ':' + n.callFrame.lineNumber; zeit.set(k, (zeit.get(k) || 0) + (prof.timeDeltas[i] || 0)); });
  r.profil = [...zeit.entries()].sort((a, b) => b[1] - a[1]).slice(0, 22).map(([k, v]) => [k, Math.round(v / 1000)]);
  // Scrollen
  r.scrollen = await page.evaluate(async () => {
    const lw = Dokument.leinwand(), host = lw.el, rr = host.getBoundingClientRect();
    const zeiten = []; let letzte = performance.now(), lauf = true;
    const f = t => { zeiten.push(t - letzte); letzte = t; if (lauf) requestAnimationFrame(f); }; requestAnimationFrame(f);
    const vor = lw.statistik();
    for (let i = 0; i < 180; i++) { host.dispatchEvent(new WheelEvent('wheel', { deltaY: i < 90 ? 40 : -40, clientX: rr.left + 300, clientY: rr.top + 300, bubbles: true, cancelable: true })); await new Promise(ok => requestAnimationFrame(ok)); }
    lauf = false;
    const nach = lw.statistik();
    zeiten.sort((a, b) => b - a);
    return { bilder: zeiten.length, ueber20ms: zeiten.filter(z => z > 20).length, ueber33ms: zeiten.filter(z => z > 33).length, laengste: zeiten.slice(0, 5).map(Math.round), vollNeu: nach.voll - vor.voll, geschoben: (nach.geschoben || 0) - (vor.geschoben || 0) };
  });
  r.neumalen = await page.evaluate(async () => {
    const lw = Dokument.leinwand(), zeiten = [];
    for (let i = 0; i < 5; i++) { const t = performance.now(); lw.plane(); await new Promise(ok => requestAnimationFrame(() => ok())); zeiten.push(performance.now() - t); }
    zeiten.sort((a, b) => a - b);
    return { median: Math.round(zeiten[2]), max: Math.round(zeiten[4]) };
  });
  r.fehler = t.fehler;
  console.log(JSON.stringify(r, null, 1));
  await t.zu();
})().catch(e => { console.error(e); process.exit(1); });
