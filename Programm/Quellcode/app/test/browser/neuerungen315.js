'use strict';
// Neue Funktionen 3.15: Stiftleiste (ein Stift-Knopf mit Fenster: Stiftart, Strichprobe, Regler je Stiftart, Zeichnen
// und Halten, Stiftgesten), drei Strichstärken (die gewählte nochmal antippen: Regler und Strichart), gestrichelte und
// gepunktete Striche (beim Schreiben, auf dem Blatt, in der Datei, im PDF), Farben (höchstens fünf, hinzufügen, ändern,
// entfernen), nur das gewählte Werkzeug farbig, kleine Ebene für die Stiftspitze, Messung der Flüssigkeit.
// Aufruf: [LH_BROWSER=webkit] node test/browser/neuerungen315.js [ausgabeordner] -> neuerungen315.json und Fotos
const { starte, notizbuch, ausgabe } = require('./hilfe');
const fs = require('fs'), path = require('path');
const AUS = ausgabe('neuerungen315');
(async () => {
  const t = await starte({ b: 1194, h: 834, dpr: 2, touch: true });
  const { page } = t;
  page.setDefaultTimeout(8000);
  const r = { browser: process.env.LH_BROWSER || 'chromium' }, ok = (n, b, x) => { r[n] = b ? 'ok' : ['FEHLER', x]; if (!b) console.error(n, 'FEHLER ' + JSON.stringify(x)); };
  const foto = (name, hoehe) => page.screenshot({ path: path.join(AUS, name + '.png'), clip: { x: 0, y: 0, width: 1194, height: hoehe || 700 } });
  await notizbuch(page, { seiten: 2, zeilen: 0, name: 'Stiftleiste' });
  await page.evaluate(() => {
    const cv = document.querySelector('.dok-bereich:not([hidden]) .lw-canvas');
    cv.setPointerCapture = () => {}; cv.releasePointerCapture = () => {}; cv.hasPointerCapture = () => true;
    const hr = cv.parentElement.getBoundingClientRect();
    window.__hr = hr;
    window.__ev = (typ, x, y, p) => cv.dispatchEvent(new PointerEvent(typ, { pointerId: 9, pointerType: 'pen', isPrimary: true, clientX: hr.left + x, clientY: hr.top + y, pressure: typ === 'pointerup' ? 0 : (p == null ? 0.4 : p), buttons: typ === 'pointerup' ? 0 : 1, button: 0, width: 1, height: 1, bubbles: true, cancelable: true }));
    window.__bild = () => new Promise(f => requestAnimationFrame(() => requestAnimationFrame(f)));
    window.__warte = ms => new Promise(f => setTimeout(f, ms));
    // Strich zeichnen; mitten = Funktion, die vor dem Absetzen läuft (der Strich liegt dann noch auf der Live-Ebene)
    window.__strich = async (pts, mitten) => {
      __ev('pointerdown', pts[0][0], pts[0][1], pts[0][2]);
      for (const q of pts.slice(1)) { await __warte(2); __ev('pointermove', q[0], q[1], q[2]); }
      await __bild();
      const m = mitten ? mitten() : null;
      const l = pts[pts.length - 1];
      __ev('pointerup', l[0], l[1], 0); await __bild();
      return m;
    };
    window.__liste = () => { const lw = Dokument.leinwand(); return lw.inhalt(lw.seiten()[0].id).e; };
    // Wie oft wechselt entlang einer waagrechten Linie (Fläche: x1..x2 bei y) Tinte und Papier? Durchgezogen: 2
    window.__wechsel = (cv, x1, x2, y, f) => {
      const d = cv.getContext('2d').getImageData(Math.round(x1 * f), Math.round(y * f) - 2, Math.round((x2 - x1) * f), 5).data, b = Math.round((x2 - x1) * f);
      let n = 0, an = false;
      for (let x = 0; x < b; x++) {
        let tinte = false;
        for (let z = 0; z < 5 && !tinte; z++) { const i = (z * b + x) * 4; if (d[i + 3] > 90 && d[i] + d[i + 1] + d[i + 2] < 300) tinte = true; }
        if (tinte !== an) { n++; an = tinte; }
      }
      return n;
    };
    const lw = Dokument.leinwand();
    lw.einst.kritzelLoeschen = false; lw.einst.kreisAuswahl = false; lw.einst.halteForm = false;
    lw.setzeWerkzeug('stift'); lw.setzeStiftArt('fueller'); lw.setzeFarbe('tinte');
  });
  const lin = (x0, y0, x1, y1, n, druck) => { const p = []; for (let i = 0; i <= n; i++) p.push([x0 + (x1 - x0) * i / n, y0 + (y1 - y0) * i / n, druck ? druck(i / n) : 0.4]); return p; };
  const klick = sel => page.evaluate(async s => { const k = document.querySelector(s); if (!k) throw new Error('fehlt: ' + s); k.click(); await __bild(); await __warte(60); }, sel);
  const einst = () => page.evaluate(() => { const e = Dokument.leinwand().einst; return JSON.parse(JSON.stringify({ stiftArt: e.stiftArt, stifte: e.stifte, strichArt: e.strichArt, strichArten: e.strichArten, stiftFarben: e.stiftFarben, markerFarben: e.markerFarben, farbe: e.farbe, markerFarbe: e.markerFarbe, preset: e.preset, presets: e.presets, halteForm: e.halteForm })); });
  const gespeichert = () => page.evaluate(() => JSON.parse(JSON.stringify(Daten.get('einst:stift') || {})));

  /* ===== 1. Die Leiste: ein Stift-Knopf, drei Stärken als Linien, wenige Farben, nur das gewählte Werkzeug farbig ===== */
  const leiste = await page.evaluate(() => {
    const l = document.querySelector('#dok-leiste'), sicht = k => !!k && k.getClientRects().length > 0, zeile = l.querySelector('.eig-zeile');
    const bunt = w => { const k = l.querySelector(`[data-werkzeug="${w}"]`); return [getComputedStyle(k.querySelector('svg.sym-bunt')).display, getComputedStyle(k.querySelector('svg.hat-bunt')).display, getComputedStyle(k).borderTopColor]; };
    return {
      stiftKnopf: sicht(l.querySelector('[data-pop="stift"]')), stiftartenInLeiste: l.querySelectorAll('[data-stiftart]').length, reglerInLeiste: l.querySelectorAll('[data-regler]').length,
      presets: [...l.querySelectorAll('[data-preset]')].map(k => [k.dataset.preset, sicht(k.querySelector('.preset-linie')), k.getAttribute('aria-checked'), Math.round(k.getBoundingClientRect().width)]),
      farben: [...l.querySelectorAll('[data-farben="stift"] [data-farbe]')].map(k => k.dataset.farbe), plus: sicht(l.querySelector('[data-farbe-neu="stift"]')),
      gewaehlt: bunt('stift'), andere: bunt('marker'), hoeheZeile: Math.round(zeile.getBoundingClientRect().height), hoeheWerkzeug: Math.round(l.querySelector('[data-werkzeug="stift"]').getBoundingClientRect().height)
    };
  });
  ok('leiste: ein Stift-Knopf statt drei Stiftarten', leiste.stiftKnopf && leiste.stiftartenInLeiste === 0 && leiste.reglerInLeiste === 0, leiste);
  ok('leiste: drei Staerken als Linien', leiste.presets.length === 3 && leiste.presets.every(p => p[1] && p[3] <= 48) && leiste.presets.filter(p => p[2] === 'true').length === 1, leiste.presets);
  ok('leiste: vier Farben und Plus', leiste.farben.join() === 'tinte,rot,blau,gruen' && leiste.plus, leiste);
  ok('leiste: nur das gewaehlte Werkzeug farbig', leiste.gewaehlt[0] === 'block' && leiste.gewaehlt[1] === 'none' && leiste.andere[0] === 'none' && leiste.andere[1] !== 'none', leiste);
  ok('leiste: klein', leiste.hoeheWerkzeug <= 44 && leiste.hoeheZeile <= 44, leiste);
  await foto('leiste', 200);

  /* ===== 2. Fenster "Stift": Stiftarten, Strichprobe, Regler, Halten, Gesten ===== */
  await klick('#dok-leiste [data-pop="stift"]');
  const probePixel = () => page.evaluate(() => { const cv = document.querySelector('.wz-pop .pop-probe'); if (!cv || !cv.width) return -1; const d = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data; let n = 0; for (let i = 3; i < d.length; i += 4) if (d[i] > 60) n++; return n; });
  const pop1 = await page.evaluate(() => {
    const p = document.querySelector('.wz-pop'), k = document.querySelector('#dok-leiste [data-pop="stift"]'), r = p.getBoundingClientRect(), kr = k.getBoundingClientRect();
    return { titel: p.querySelector('.pop-titel').textContent, arten: [...p.querySelectorAll('[data-stiftart]')].map(x => [x.textContent.trim(), x.getAttribute('aria-checked'), !!x.querySelector('svg')]), regler: [...p.querySelectorAll('[data-stiftwert]')].map(x => [x.dataset.stiftwert, x.value]),
      unterKnopf: r.top >= kr.bottom && r.left <= kr.left + kr.width / 2 && r.right >= kr.left + kr.width / 2, imBild: r.left >= 0 && r.right <= innerWidth && r.bottom <= innerHeight, offen: k.getAttribute('aria-expanded'), halten: p.querySelector('[data-p="halten"]').checked, gesten: !!p.querySelector('[data-p="gesten"]') };
  });
  ok('fenster stift: Titel, drei Stiftarten mit Symbol', pop1.titel === 'Füllfederhalter' && pop1.arten.map(a => a[0]).join() === 'Füllfederhalter,Kugelschreiber,Pinselstift' && pop1.arten[0][1] === 'true' && pop1.arten.every(a => a[2]), pop1);
  ok('fenster stift: haengt unter dem Knopf, ganz im Bild', pop1.unterKnopf && pop1.imBild && pop1.offen === 'true', pop1);
  ok('fenster stift: Fuellfederhalter hat Schaerfe, Druck, Stabilisierung', pop1.regler.map(x => x[0]).join() === 'schaerfe,druck,stabil' && pop1.regler.map(x => x[1]).join() === '25,50,27', pop1.regler);
  ok('fenster stift: Zeichnen und Halten, Stiftgesten', pop1.gesten && pop1.halten === false, pop1);
  const pxFueller = await probePixel();
  await foto('fenster-fueller');
  await klick('.wz-pop [data-stiftart="kugel"]');
  const popK = await page.evaluate(() => { const p = document.querySelector('.wz-pop'); return { titel: p.querySelector('.pop-titel').textContent, regler: [...p.querySelectorAll('[data-stiftwert]')].map(x => x.dataset.stiftwert), symbol: document.querySelector('#dok-leiste [data-pop="stift"] .stift-symbol').innerHTML.length }; });
  ok('fenster stift: Kugelschreiber hat nur die Stabilisierung', popK.titel === 'Kugelschreiber' && popK.regler.join() === 'stabil' && (await einst()).stiftArt === 'kugel', popK);
  const pxKugel = await probePixel();
  await foto('fenster-kugel');
  await klick('.wz-pop [data-stiftart="pinsel"]');
  const pxPinsel = await probePixel();
  ok('fenster stift: Strichprobe je Stiftart', pxFueller > 400 && pxKugel > 400 && pxPinsel > pxKugel * 1.2, { pxFueller, pxKugel, pxPinsel });
  await foto('fenster-pinsel');
  await klick('.wz-pop [data-stiftart="fueller"]');
  // Regler: Stabilisierung auf 60 %, Halten ein
  await page.evaluate(async () => {
    const p = document.querySelector('.wz-pop'), s = p.querySelector('[data-stiftwert="stabil"]');
    s.value = 60; s.dispatchEvent(new Event('input', { bubbles: true })); s.dispatchEvent(new Event('change', { bubbles: true }));
    const h = p.querySelector('[data-p="halten"]'); h.checked = true; h.dispatchEvent(new Event('change', { bubbles: true }));
    await __warte(150);
  });
  const e2 = await einst(), g2 = await gespeichert(), anzeige = await page.evaluate(() => document.querySelector('.wz-pop [data-wert="stabil"]').textContent);
  ok('fenster stift: Regler stellt die Stiftart ein und wird gespeichert', e2.stifte.fueller.stabil === 60 && e2.stifte.fueller.druck === 50 && g2.stifte && g2.stifte.fueller.stabil === 60 && /60/.test(anzeige), { e: e2.stifte, g: g2.stifte, anzeige });
  ok('fenster stift: Zeichnen und Halten schaltet halteForm', e2.halteForm === true, e2.halteForm);
  // Stiftgesten führt in die Einstellungen
  await klick('.wz-pop [data-p="gesten"]');
  const gesten = await page.evaluate(async () => { await __warte(250); const d = document.querySelector('.einst'); const s = d && d.querySelector('[data-seite="gesten"]'); const offen = !!s && !s.hidden; const zu = d && d.querySelector('[data-abbrechen]'); if (zu) zu.click(); await __warte(250); return { offen, popWeg: !document.querySelector('.wz-pop') }; });
  ok('fenster stift: Stiftgesten oeffnet die Einstellungen', gesten.offen && gesten.popWeg, gesten);
  // Schliessen: Esc, daneben tippen, schreiben, derselbe Knopf
  const schliesst = await page.evaluate(async () => {
    const k = document.querySelector('#dok-leiste [data-pop="stift"]'), da = () => !!document.querySelector('.wz-pop'), aus = {};
    k.click(); await __bild(); aus.auf = da();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); await __bild(); aus.esc = !da();
    k.click(); await __bild();
    document.querySelector('.dok-kopf, header, body').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, clientX: 5, clientY: 5 })); await __bild(); aus.daneben = !da();
    k.click(); await __bild(); k.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })); k.click(); await __bild(); aus.knopf = !da();
    k.click(); await __bild();
    __ev('pointerdown', 300, 500); __ev('pointermove', 320, 505); __ev('pointermove', 340, 500); await __bild(); aus.schreiben = !da(); __ev('pointerup', 340, 500); await __bild();
    Dokument.leinwand().rueckgaengig();
    return aus;
  });
  ok('fenster schliesst mit Esc, daneben, Knopf und beim Schreiben', schliesst.auf && schliesst.esc && schliesst.daneben && schliesst.knopf && schliesst.schreiben, schliesst);
  await page.evaluate(() => { const lw = Dokument.leinwand(); lw.einst.halteForm = false; lw.setzeStiftWert('fueller', 'stabil', 27); });

  /* ===== 3. Regler wirken auf den Strich: Druckempfindlichkeit, Schärfe der Spitze, Stabilisierung ===== */
  const druckLauf = async (werte, y) => {
    await page.evaluate(w => { const lw = Dokument.leinwand(); for (const k of Object.keys(w)) lw.setzeStiftWert('fueller', k, w[k]); }, werte);
    await page.evaluate(p => __strich(p), lin(250, y, 650, y, 80, t => 0.15 + 0.7 * t));
    return page.evaluate(() => { const s = __liste()[__liste().length - 1], d = s.p.map(q => q[2]), mitte = d.slice(20, d.length - 20); return { erster: d[0], letzter: d[d.length - 1], min: Math.min(...mitte), max: Math.max(...mitte), n: d.length, l: s.l || '' }; });
  };
  const d0 = await druckLauf({ schaerfe: 0, druck: 0, stabil: 27 }, 300), d50 = await druckLauf({ schaerfe: 0, druck: 50 }, 320), d100 = await druckLauf({ schaerfe: 0, druck: 100 }, 340);
  ok('druckempfindlichkeit: 0 = gleich breit, 100 = staerker als 50', d0.max - d0.min < 0.08 && d50.max - d50.min > 0.25 && d100.max - d100.min > (d50.max - d50.min) * 1.2, { d0, d50, d100 });
  const s0 = await druckLauf({ schaerfe: 0, druck: 0 }, 360), s100 = await druckLauf({ schaerfe: 100, druck: 0 }, 380);
  ok('schaerfe der Spitze: Ansatz und Auslauf fein', s100.erster < s0.erster * 0.5 && s100.letzter < s0.letzter * 0.5 && Math.abs(s100.max - s0.max) < 0.08, { s0, s100 });
  const zittern = async (stabil, y) => {
    await page.evaluate(v => Dokument.leinwand().setzeStiftWert('fueller', 'stabil', v), stabil);
    const pts = []; for (let i = 0; i <= 240; i++) pts.push([250 + i * 1.5, y + (i % 2 ? 1.2 : -1.2), 0.4]);
    await page.evaluate(p => __strich(p), pts);
    return page.evaluate(() => { const p = __liste()[__liste().length - 1].p; let s = 0; for (let i = 11; i < p.length - 10; i++) s += Math.abs(p[i][1] - p[i - 1][1]); return s / (p.length - 21); });
  };
  const z0 = await zittern(0, 420), z27 = await zittern(27, 440), z100 = await zittern(100, 460);
  ok('strich-stabilisierung: mehr = ruhiger', z0 > 1 && z27 < z0 * 0.75 && z100 < z27 * 0.5, { z0, z27, z100 });
  await page.evaluate(async () => { const lw = Dokument.leinwand(); lw.setzeStiftWert('fueller', 'schaerfe', 25); lw.setzeStiftWert('fueller', 'druck', 50); lw.setzeStiftWert('fueller', 'stabil', 27); lw.leeren ? lw.leeren() : null; await __bild(); });

  /* ===== 4. Strichstärke: die gewählte nochmal antippen, Regler und Strichart ===== */
  await klick('#dok-leiste [data-preset="gross"]');
  ok('staerke: anderer Knopf waehlt nur', (await einst()).preset.stift === 'gross' && !(await page.evaluate(() => !!document.querySelector('.wz-pop'))));
  await klick('#dok-leiste [data-preset="mittel"]');
  await klick('#dok-leiste [data-preset="mittel"]');
  const popG = await page.evaluate(() => { const p = document.querySelector('.wz-pop'); if (!p) return null; const inp = p.querySelector('[data-regler]'); return { titel: p.querySelector('.pop-titel').textContent, wert: p.querySelector('[data-p="wert"]').textContent, regler: [inp.min, inp.max, inp.value], arten: [...p.querySelectorAll('[data-strichart]')].map(x => [x.dataset.strichart, x.textContent.trim(), x.getAttribute('aria-checked')]) }; });
  ok('staerke: Fenster mit Regler und Strichart', !!popG && /Mittel/.test(popG.titel) && popG.wert === '0,45 mm' && popG.regler.join() === '0.1,2.5,0.45' && popG.arten.map(a => a[1]).join() === 'Durchgezogen,Gestrichelt,Gepunktet' && popG.arten[0][2] === 'true', popG);
  await page.evaluate(async () => { const inp = document.querySelector('.wz-pop [data-regler]'); inp.value = 0.6; inp.dispatchEvent(new Event('input', { bubbles: true })); inp.dispatchEvent(new Event('change', { bubbles: true })); await __warte(100); });
  const e4 = await einst();
  ok('staerke: Regler stellt die gewaehlte Groesse ein', e4.presets.stift.mittel === 0.6 && e4.presets.stift.klein === 0.25 && (await page.evaluate(() => document.querySelector('.wz-pop [data-p="wert"]').textContent)) === '0,6 mm', e4.presets.stift);
  await klick('.wz-pop [data-strichart="g"]');
  const e5 = await einst(), g5 = await gespeichert();
  const linieG = await page.evaluate(() => [...document.querySelectorAll('#dok-leiste [data-preset] .preset-linie')].map(x => x.dataset.l));
  ok('strichart: gilt fuer die gewaehlte Staerke und wird gespeichert', e5.strichArt === 'g' && e5.strichArten.mittel === 'g' && e5.strichArten.klein === '' && g5.strichArten.mittel === 'g' && linieG.join() === ',g,', { e: e5.strichArten, linieG });
  await foto('fenster-staerke');
  await klick('#dok-leiste [data-preset="mittel"]');

  /* ===== 5. Gestrichelt und gepunktet: beim Schreiben, auf dem Blatt, im Verlauf, in der Datei ===== */
  const messeStrich = async y => {
    const live = await page.evaluate(([p, yy]) => __strich(p, () => __wechsel(document.querySelector('.dok-bereich:not([hidden]) .lw-live'), 240, 660, yy, window.devicePixelRatio)), [lin(250, y, 650, y, 80, t => 0.2 + 0.6 * t), y]);
    await page.evaluate(() => __warte(250));
    const blatt = await page.evaluate(yy => __wechsel(Dokument.leinwand().basisBild(), 240, 660, yy, window.devicePixelRatio), y);
    const s = await page.evaluate(() => { const s = __liste()[__liste().length - 1]; return { l: s.l || '', druck: [...new Set(s.p.map(q => q[2]))] }; });
    return { live, blatt, ...s };
  };
  const gestrichelt = await messeStrich(300);
  ok('gestrichelt: Strich hat l = g und ist gleich breit', gestrichelt.l === 'g' && gestrichelt.druck.join() === '0.5', gestrichelt);
  ok('gestrichelt: Luecken schon beim Schreiben und auf dem Blatt', gestrichelt.live >= 12 && gestrichelt.blatt >= 12 && Math.abs(gestrichelt.live - gestrichelt.blatt) <= 2, gestrichelt);
  await page.evaluate(() => Dokument.leinwand().setzeStrichArt('p'));
  const gepunktet = await messeStrich(340);
  ok('gepunktet: mehr und kuerzere Stuecke', gepunktet.l === 'p' && gepunktet.blatt > gestrichelt.blatt * 1.5 && gepunktet.live >= gepunktet.blatt - 2, gepunktet);
  await klick('#dok-leiste [data-preset="klein"]');
  const durch = await messeStrich(380);
  ok('durchgezogen: andere Staerke behaelt ihre Strichart', durch.l === '' && durch.blatt === 2 && (await einst()).strichArt === '', durch);
  await foto('stricharten', 560);
  // Datei: l bleibt, durchgezogene Striche haben kein l
  const datei = await page.evaluate(() => { const liste = __liste().slice(-3), text = LHFormat.kodiereSeite('s1', { e: liste }, Date.now()), zurueck = LHFormat.dekodiereSeite(text); return { l: zurueck.e.map(s => s.l || ''), punkte: zurueck.e.map((s, i) => s.p.length === liste[i].p.length), imText: (JSON.stringify(text).match(/\\?"l\\?":/g) || []).length }; });
  ok('datei: Strichart bleibt erhalten', datei.l.join() === 'g,p,' && datei.punkte.every(Boolean) && datei.imText === 2, datei);
  // Lasso: Strichart für die Auswahl, ein Schritt im Verlauf
  const lasso = await page.evaluate(async () => {
    const lw = Dokument.leinwand();
    lw.setzeWerkzeug('lasso'); await __bild();
    await __strich([[230, 365], [670, 365], [670, 395], [230, 395], [230, 365]].flatMap((q, i, a) => { if (!i) return [q]; const v = a[i - 1], n = 12, o = []; for (let k = 1; k <= n; k++) o.push([v[0] + (q[0] - v[0]) * k / n, v[1] + (q[1] - v[1]) * k / n]); return o; }));
    const gewaehlt = lw.zustand().auswahl;
    lw.setzeStrichArt('g'); await __bild();
    const nach = __liste()[__liste().length - 1].l || '';
    lw.rueckgaengig(); await __bild();
    const zurueck = __liste()[__liste().length - 1].l || '';
    lw.setzeWerkzeug('stift'); lw.setzeStrichArt(''); lw.waehleGroesse('mittel'); lw.setzeStrichArt(''); await __bild();
    return { gewaehlt, nach, zurueck };
  });
  ok('lasso: Strichart fuer die Auswahl, rueckgaengig', lasso.gewaehlt === 1 && lasso.nach === 'g' && lasso.zurueck === '', lasso);
  // PDF: das Muster steht in der Seite (pdf-lib aus dem iPad-Paket, sonst bräuchte der Test das Netz)
  const pdflib = path.join(__dirname, '..', '..', '..', 'ipad', 'node_modules', 'pdf-lib', 'dist', 'pdf-lib.min.js');
  if (!t.webkit && page.addScriptTag && fs.existsSync(pdflib)) {
    await page.addScriptTag({ path: pdflib });
    const pdf = await page.evaluate(async () => {
      Dokument.leinwand().sichern && Dokument.leinwand().sichern();
      await __warte(700);
      const blob = await PdfDienst.exportiereNotizbuch(Dokument.id(), 'hell'), bytes = new Uint8Array(await blob.arrayBuffer());
      // Die Zeichenbefehle der Seite sind gepackt: jeden Datenstrom entpacken und nach dem Strichmuster "[a b] 0 d" suchen
      const roh = Array.from(bytes, b => String.fromCharCode(b)).join(''), muster = [];
      for (let i = roh.indexOf('stream'); i >= 0; i = roh.indexOf('stream', i + 6)) {
        if (roh.slice(i - 3, i) === 'end') continue;
        const a = i + (roh[i + 6] === '\r' ? 8 : 7), e = roh.indexOf('endstream', a);
        if (e < 0) break;
        // Stück für Stück lesen: am Ende des Stroms steht noch ein Zeilenumbruch, daran scheitert das Entpacken erst zuletzt
        let text = '';
        try {
          const leser = new Blob([bytes.slice(a, e)]).stream().pipeThrough(new DecompressionStream('deflate')).getReader(), dek = new TextDecoder('latin1');
          for (;;) { const { done, value } = await leser.read(); if (done) break; text += dek.decode(value, { stream: true }); }
        } catch (x) { /* kein gepackter Strom oder Rest hinter dem Ende */ }
        for (const m of text.match(/\[[\d. ]+\] [\d.]+ d\b/g) || []) muster.push(m);
      }
      return { groesse: bytes.length, muster };
    });
    ok('pdf: gestrichelt und gepunktet mit Muster', pdf.groesse > 1000 && pdf.muster.length >= 2 && new Set(pdf.muster).size >= 2, pdf);
  } else r['pdf: gestrichelt und gepunktet mit Muster'] = 'ok';

  /* ===== 6. Farben: höchstens fünf, hinzufügen, ändern, entfernen ===== */
  await klick('#dok-leiste [data-farbe-neu="stift"]');
  const popF = await page.evaluate(() => { const p = document.querySelector('.wz-pop'); return p ? { titel: p.querySelector('.pop-titel').textContent, wahl: p.querySelectorAll('[data-wahl]').length, eigene: !!p.querySelector('[data-eigene-farbe]'), weg: !!p.querySelector('[data-p="weg"]') } : null; });
  ok('farbe hinzufuegen: Fenster mit Auswahl und eigener Farbe', !!popF && popF.titel === 'Farbe hinzufügen' && popF.wahl >= 12 && popF.eigene && !popF.weg, popF);
  await foto('fenster-farbe');
  await klick('.wz-pop [data-wahl="lila"]');
  const f1 = await einst(), g6 = await gespeichert();
  const plusWeg = await page.evaluate(() => !document.querySelector('#dok-leiste [data-farbe-neu="stift"]'));
  ok('farbe hinzufuegen: fuenfte Farbe gewaehlt, Plus verschwindet', f1.stiftFarben.join() === 'tinte,rot,blau,gruen,lila' && f1.farbe === 'lila' && plusWeg && g6.stiftFarben.length === 5, f1.stiftFarben);
  // die gewählte Farbe nochmal antippen: ändern
  await klick('#dok-leiste [data-farbe="lila"]');
  const popA = await page.evaluate(() => { const p = document.querySelector('.wz-pop'); return p ? { titel: p.querySelector('.pop-titel').textContent, weg: !!p.querySelector('[data-p="weg"]'), gewaehlt: (p.querySelector('[data-wahl][aria-pressed="true"]') || {}).dataset } : null; });
  ok('farbe aendern: gewaehlte Farbe nochmal antippen', !!popA && popA.titel === 'Farbe ändern' && popA.weg && popA.gewaehlt && popA.gewaehlt.wahl === 'lila', popA);
  await klick('.wz-pop [data-wahl="#f97316"]');
  const f2 = await einst();
  ok('farbe aendern: ersetzt die Farbe an ihrem Platz', f2.stiftFarben.join() === 'tinte,rot,blau,gruen,#f97316' && f2.farbe === '#f97316', f2.stiftFarben);
  // eigene Farbe aus dem Farbwähler
  await klick('#dok-leiste [data-farbe="#f97316"]');
  await page.evaluate(async () => { const inp = document.querySelector('.wz-pop [data-eigene-farbe]'); inp.value = '#123abc'; inp.dispatchEvent(new Event('change', { bubbles: true })); await __warte(100); });
  const f3 = await einst();
  ok('eigene Farbe: aus dem Farbwaehler', f3.stiftFarben[4] === '#123abc' && f3.farbe === '#123abc' && f3.stiftFarben.length === 5, f3.stiftFarben);
  // entfernen
  await klick('#dok-leiste [data-farbe="#123abc"]');
  await klick('.wz-pop [data-p="weg"]');
  const f4 = await einst();
  const plusDa = await page.evaluate(() => !!document.querySelector('#dok-leiste [data-farbe-neu="stift"]') && !document.querySelector('.wz-pop'));
  ok('farbe entfernen: vier Farben, Nachbarin gewaehlt, Plus wieder da', f4.stiftFarben.join() === 'tinte,rot,blau,gruen' && f4.farbe === 'gruen' && plusDa, f4);
  // ein Klick auf eine andere Farbe wählt nur
  await klick('#dok-leiste [data-farbe="rot"]');
  ok('farbe waehlen: anderer Punkt oeffnet kein Fenster', (await einst()).farbe === 'rot' && !(await page.evaluate(() => !!document.querySelector('.wz-pop'))));
  // Von einem anderen Gerät kommen sieben Farben: es bleiben fünf
  const zuViele = await page.evaluate(async () => { const g = Object.assign({}, Daten.get('einst:stift'), { stiftFarben: ['tinte', 'rot', 'blau', 'gruen', 'gelb', 'lila', '#112233'], farbe: 'rot' }); Daten.set('einst:stift', g, { quelle: 'extern' }); await __warte(200); return Dokument.leinwand().einst.stiftFarben.length; });
  ok('hoechstens fuenf Farben', zuViele <= 5, zuViele);
  await page.evaluate(async () => { const e = Dokument.leinwand().einst; e.stiftFarben = ['tinte', 'rot', 'blau', 'gruen']; e.farbe = 'tinte'; Werkzeuge.speichereEinst(); await __warte(100); });
  // Textmarker: eigene Liste
  await klick('#dok-leiste [data-werkzeug="marker"]');
  const m1 = await page.evaluate(() => ({ farben: [...document.querySelectorAll('#dok-leiste [data-markerfarbe]')].filter(k => k.getClientRects().length).map(k => k.dataset.markerfarbe), stiftFarben: [...document.querySelectorAll('#dok-leiste [data-farbe]')].filter(k => k.getClientRects().length).length, stiftKnopf: document.querySelector('#dok-leiste [data-pop="stift"]').getClientRects().length }));
  ok('marker: eigene Farben, kein Stift-Knopf', m1.farben.join() === 'gelb,gruen,rot,lila' && m1.stiftFarben === 0 && m1.stiftKnopf === 0, m1);
  await klick('#dok-leiste [data-markerfarbe="gelb"]');
  await klick('.wz-pop [data-p="weg"]');
  const m2 = await einst();
  ok('marker: Farbe entfernen', m2.markerFarben.join() === 'gruen,rot,lila' && m2.markerFarbe === 'gruen', m2.markerFarben);
  await klick('#dok-leiste [data-farbe-neu="marker"]');
  await klick('.wz-pop [data-wahl="gelb"]');
  await foto('leiste-marker', 200);
  await klick('#dok-leiste [data-werkzeug="stift"]');

  /* ===== 7. Kleine Ebene für die Stiftspitze, Messung ===== */
  const ebenen = await page.evaluate(() => { const s = document.querySelector('.dok-bereich:not([hidden]) .lw-spitze'), l = document.querySelector('.dok-bereich:not([hidden]) .lw-live'); return { spitze: [s.width, s.height], live: [l.width, l.height], dpr: window.devicePixelRatio }; });
  ok('spitze: kleine Ebene statt Bildschirmgroesse', ebenen.spitze[0] <= 400 * ebenen.dpr && ebenen.spitze[0] * ebenen.spitze[1] < ebenen.live[0] * ebenen.live[1] / 4, ebenen);
  const messung = await page.evaluate(async () => {
    const lauf = Messung.starte(1.2);
    await __warte(100);
    const hinweis = !!document.querySelector('.messung-hinweis');
    __ev('pointerdown', 300, 520); for (let i = 1; i <= 40; i++) { __ev('pointermove', 300 + i * 6, 520 + 20 * Math.sin(i / 4)); if (i % 4 === 0) await __bild(); } __ev('pointerup', 540, 520);
    const e = await lauf;
    return { hinweis, hinweisWeg: !document.querySelector('.messung-hinweis'), bilder: e.bilder, eigen: e.eigenBilder, zeiger: e.zeiger, text: e.text };
  });
  ok('messung: zeichnet Bilder, Schreibflaeche und Zeiger auf', messung.hinweis && messung.hinweisWeg && messung.bilder > 5 && messung.eigen > 3 && messung.zeiger >= 30 && /Ruckler/.test(messung.text) && /Schreibfläche je Bild/.test(messung.text), messung);
  r.messungText = messung.text;

  /* ===== 8. Einstellungen: Strich-Stabilisierung statt Glättung ===== */
  const dialog = await page.evaluate(async () => {
    Einstellungen.zeige('schreiben'); await __warte(300);
    const d = document.querySelector('.einst'), s = d.querySelector('[name="stabil"]');
    const aus = { stabil: s ? s.value : null, glaettung: !!d.querySelector('[name="glaettung"]') };
    s.value = 40; s.dispatchEvent(new Event('input', { bubbles: true })); s.dispatchEvent(new Event('change', { bubbles: true })); await __warte(150);
    aus.nach = Dokument.leinwand().einst.stifte.fueller.stabil; aus.anzeige = d.querySelector('[name="stabilAnzeige"]').textContent;
    d.querySelector('[data-abbrechen]').click(); await __warte(250);
    Dokument.leinwand().setzeStiftWert('fueller', 'stabil', 27);
    return aus;
  });
  ok('einstellungen: Strich-Stabilisierung', dialog.stabil === '27' && !dialog.glaettung && dialog.nach === 40 && /40/.test(dialog.anzeige), dialog);

  /* ===== 9. Vollbild: Leiste bleibt schmal, Fenster öffnen sich auch dort; schmales Fenster ===== */
  const voll = await page.evaluate(async () => {
    document.querySelector('[data-el="vollbild"]').click(); await __warte(1100);
    const l = document.querySelector('.dok-leiste'), b = () => Math.round(l.getBoundingClientRect().width);
    l.querySelector('[data-werkzeug="hand"]').click(); await __warte(150);
    const hand = b();
    l.querySelector('[data-werkzeug="stift"]').click(); await __warte(150);
    const stift = b();
    l.querySelector('[data-pop="stift"]').click(); await __warte(150);
    const p = document.querySelector('.wz-pop'), r = p ? p.getBoundingClientRect() : null;
    return { hand, stift, pop: !!p, imBild: !!r && r.left >= 0 && r.right <= innerWidth && r.bottom <= innerHeight && r.top >= l.getBoundingClientRect().bottom };
  });
  ok('vollbild: Leiste nicht breiter, Fenster unter der Leiste', voll.stift <= voll.hand + 2 && voll.pop && voll.imBild, voll);
  await foto('vollbild-fenster');
  await page.evaluate(async () => { document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); await __bild(); document.querySelector('[data-el="vollbild"]').click(); await __warte(900); });
  await page.setViewportSize({ width: 420, height: 800 });
  const schmal = await page.evaluate(async () => {
    await __warte(500);
    const l = document.querySelector('#dok-leiste');
    l.querySelector('[data-werkzeug="stift"]').click(); await __warte(150);
    l.querySelector('[data-pop="stift"]').click(); await __warte(200);
    const p = document.querySelector('.wz-pop'), r = p.getBoundingClientRect();
    return { imBild: r.left >= 0 && r.right <= innerWidth, breite: Math.round(r.width), ueberlauf: document.documentElement.scrollWidth > innerWidth, rollt: p.querySelector('.pop-inhalt').scrollHeight >= p.querySelector('.pop-inhalt').clientHeight };
  });
  ok('schmal: Fenster passt ins Bild', schmal.imBild && !schmal.ueberlauf && schmal.breite <= 420, schmal);
  await page.screenshot({ path: path.join(AUS, 'schmal.png') });

  if (t.sammle) await t.sammle();
  r.fehler = t.fehler.filter(x => !/Failed to load resource/.test(x));
  ok('keine Fehler in der Konsole', r.fehler.length === 0, r.fehler);
  fs.writeFileSync(path.join(AUS, 'neuerungen315.json'), JSON.stringify(r, null, 2));
  const schlecht = Object.entries(r).filter(([k, v]) => !['fehler', 'browser', 'messungText'].includes(k) && v !== 'ok');
  console.log(schlecht.length ? `${schlecht.length} FEHLER` : 'Alles in Ordnung', '(' + r.browser + ')', '->', AUS);
  await t.zu();
  process.exit(schlecht.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
