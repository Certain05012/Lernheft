'use strict';
// Prüflauf für Schreibfläche, Stiftgrössen und Speicherung in der echten App (eigener Testordner).
// Aufruf: electron test/neu.js <ausgabeordner> [ordner-mit-echten-daten-als-vorlage] [webseite-zum-vergleich]
// Schreibt Bildschirmfotos und neu.json in den Ausgabeordner. Vorher Lernheft schliessen (Port 47823).
const { app, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');
const zlib = require('zlib');

const AUS = path.resolve(process.argv[2]);
const VORLAGE = process.argv[3] && process.argv[3] !== '-' ? path.resolve(process.argv[3]) : null;
const SEITE = process.argv[4] ? path.resolve(process.argv[4]) : path.join(__dirname, '..', '..', 'webseite');
const WURZEL = path.join(AUS, 'Lernheft');
fs.rmSync(AUS, { recursive: true, force: true });
fs.mkdirSync(path.join(WURZEL, 'Programm'), { recursive: true });
if (VORLAGE) for (const t of ['Bibliothek', 'Daten']) if (fs.existsSync(path.join(VORLAGE, t))) fs.cpSync(path.join(VORLAGE, t), path.join(WURZEL, t), { recursive: true, filter: q => !/Papierkorb/.test(q) });
app.setPath('userData', path.join(AUS, 'profil'));
process.env.LERNHEFT_ORDNER = WURZEL;
process.env.LERNHEFT_SEITE = SEITE;
const warte = ms => new Promise(r => setTimeout(r, ms));
const format = require(path.join(__dirname, '..', '..', 'webseite', 'format.js'));

require('../main.js');

app.whenReady().then(async () => {
  let win;
  for (let i = 0; i < 100 && !win; i++) { win = BrowserWindow.getAllWindows()[0]; if (!win) await warte(100); }
  const wc = win.webContents;
  const log = [];
  wc.on('console-message', (e, l, m) => { if (l >= 2) log.push(m); });
  win.setSize(1400, 900);
  win.show(); win.focus();
  await new Promise(r => wc.once('did-finish-load', r));
  await warte(2000);
  const js = c => wc.executeJavaScript(c, true);
  const foto = async n => { await warte(400); fs.writeFileSync(path.join(AUS, n + '.png'), (await wc.capturePage()).toPNG()); };
  const r = {};
  try {
    // Notizbuch öffnen (aus den echten Daten oder ein neues)
    r.start = await js(`(() => { const d = Bibliothek.dokumente().find(d => d.art === 'notizbuch'); if (d) return d.id;
      Bibliothek.speichere('nbT', { art: 'notizbuch', name: 'Test', eltern: null, format: 'A4', papier: 'karo', farbe: 'blau', seiten: ['s1', 's2'], erstellt: Date.now(), geoeffnet: 0, seite: 1, favorit: false }); return 'nbT'; })()`);
    const id = r.start;
    await js(`location.hash = '#/dok/${id}'`);
    await warte(2000);
    r.leinwand = await js(`(() => { const lw = Dokument.leinwand(); return { seiten: lw.seiten().map(s => s.id), hatStatistik: !!lw.statistik }; })()`);
    await foto('01-notizbuch');

    // Hilfen in der Seite: Stift-Ereignisse nachbilden (mit Zwischenpunkten wie beim echten Stift)
    await js(`(() => {
      const pen = (typ, x, y, p, tx, ty, extra) => new PointerEvent(typ, { pointerId: 7, pointerType: 'pen', isPrimary: true, clientX: x, clientY: y, pressure: p, tiltX: tx, tiltY: ty, buttons: typ === 'pointerup' ? 0 : 1, button: 0, bubbles: true, cancelable: true, ...extra });
      window.__pen = pen;
      window.__canvas = () => { const cv = document.querySelector('.dok-bereich:not([hidden]) .lw-canvas'); cv.setPointerCapture = () => {}; cv.releasePointerCapture = () => {}; return cv; };
      // Ein Strich in n Bildern, je Bild vier Zwischenpunkte; liefert die Bildzeiten
      window.__schreibe = (n, o = {}) => new Promise(ok => {
        const cv = window.__canvas(), r = cv.parentElement.getBoundingClientRect();
        const x0 = r.left + r.width / 2 - 260, y0 = r.top + (o.y || 200);
        const pt = k => [x0 + k * (o.schritt || 0.9), y0 + Math.sin(k / 18) * 40 + (o.versatz || 0)];
        let i = 0; const zeiten = []; let letzte = performance.now();
        const bild = t => {
          zeiten.push(t - letzte); letzte = t;
          const druck = 0.1 + 0.8 * (i / n), kipp = o.kipp ? 15 + 60 * (i / n) : 0;
          if (i === 0) { const [x, y] = pt(0); cv.dispatchEvent(pen('pointerdown', x, y, druck, kipp, 0)); }
          const teil = [];
          for (let k = 1; k <= 4; k++) { const [x, y] = pt(i * 4 + k); teil.push(pen('pointermove', x, y, druck, kipp, 0)); }
          const ev = teil[teil.length - 1];
          Object.defineProperty(ev, 'getCoalescedEvents', { value: () => teil });
          cv.dispatchEvent(ev);
          i++;
          if (i < n) requestAnimationFrame(bild);
          else { const [x, y] = pt(i * 4 + 4); cv.dispatchEvent(pen('pointerup', x, y, 0, kipp, 0)); ok(zeiten); }
        };
        requestAnimationFrame(bild);
      });
      window.__werte = z => { const s = z.slice(1).sort((a, b) => a - b); return { bilder: s.length, mittel: +(s.reduce((a, b) => a + b, 0) / s.length).toFixed(1), p95: +s[Math.floor(s.length * 0.95)].toFixed(1), max: +s[s.length - 1].toFixed(1) }; };
    })()`);

    // 1. Schreiben: Bildzeiten, wie oft wurde ganz neu gemalt
    const stat0 = await js(`Dokument.leinwand().statistik ? Dokument.leinwand().statistik() : null`);
    const sid = (await js(`Dokument.leinwand().seiten()[0].id`));
    const vorher = await js(`Dokument.leinwand().inhalt(${JSON.stringify(sid)}).e.length`);
    const z1 = await js(`window.__schreibe(120, { kipp: true }).then(z => window.__werte(z))`);
    r.schreiben = { bildzeiten: z1, vorher, nachher: await js(`Dokument.leinwand().inhalt(${JSON.stringify(sid)}).e.length`) };
    r.schreiben.statistik = stat0 ? { vorher: stat0, nachher: await js(`Dokument.leinwand().statistik()`) } : null;
    const strich = await js(`(() => { const e = Dokument.leinwand().inhalt(${JSON.stringify(sid)}).e; const s = e[e.length - 1]; return { n: s.p.length, m: !!s.m, id: !!s.id, druck: [s.p[2][2], s.p[s.p.length - 3][2]], kippSpaet: s.p[s.p.length - 3][3], kippFrueh: s.p[2][3] || 0 }; })()`);
    r.strich = strich;
    await foto('02-strich-mit-druck-und-neigung');

    // 2. Speichern mit Verzögerung: gleich danach noch nichts, dann da
    const datei = path.join(WURZEL, 'Bibliothek');
    const findeLhz = () => { try { return fs.readdirSync(datei, { recursive: true }).filter(f => f.endsWith('.lhz')); } catch (e) { return []; } };
    r.dateienSofort = findeLhz().length;
    await warte(3500);
    r.dateienSpaeter = findeLhz();
    const gz = fs.readFileSync(path.join(datei, r.dateienSpaeter[0]));
    const seiteDatei = format.dekodiereSeite(zlib.gunzipSync(gz).toString());
    r.datei = { bytes: gz.length, striche: seiteDatei.e.length, letzterStrichPunkte: seiteDatei.e[seiteDatei.e.length - 1].p.length, letzterDruck: seiteDatei.e[seiteDatei.e.length - 1].p[60] };

    // 3. Rückgängig: Strich weg, Grabstein da; Wiederholen: Strich wieder da
    await js(`Dokument.leinwand().rueckgaengig()`);
    r.rueckgaengig = await js(`(() => { const i = Dokument.leinwand().inhalt(${JSON.stringify(sid)}); return { n: i.e.length, grabsteine: Object.keys(i.x || {}).length }; })()`);
    await js(`Dokument.leinwand().wiederholen()`);
    r.wiederholen = await js(`(() => { const i = Dokument.leinwand().inhalt(${JSON.stringify(sid)}); return { n: i.e.length, grabsteine: Object.keys(i.x || {}).length }; })()`);

    // 4. Viel Schrift auf der Seite, dann verschieben, zoomen und schreiben
    await js(`(() => { const lw = Dokument.leinwand(), e = lw.inhalt(${JSON.stringify(sid)}).e;
      for (let s = 0; s < 1500; s++) { const x = 40 + (s % 30) * 24, y = 40 + Math.floor(s / 30) * 20; const p = []; for (let k = 0; k < 80; k++) p.push([Math.round((x + k * 0.25) * 10) / 10, Math.round((y + Math.sin(k / 6) * 6) * 10) / 10, 0.5]); e.push({ id: 'last' + s, w: 'stift', f: 'tinte', d: 1.5, p }); }
      lw.plane(); })()`);
    await warte(800);
    await foto('03-viel-schrift');
    const st1 = await js(`Dokument.leinwand().statistik ? Dokument.leinwand().statistik() : null`);
    r.verschieben = await js(`new Promise(ok => { const host = document.querySelector('.dok-bereich:not([hidden]) .leinwand'); const z = []; let l = performance.now(), i = 0;
      const f = t => { z.push(t - l); l = t; host.dispatchEvent(new WheelEvent('wheel', { deltaY: i % 2 ? 14 : -14, deltaX: 3, bubbles: true, cancelable: true, clientX: 500, clientY: 400 })); if (++i < 120) requestAnimationFrame(f); else ok(window.__werte(z)); };
      requestAnimationFrame(f); })`);
    const st2 = await js(`Dokument.leinwand().statistik ? Dokument.leinwand().statistik() : null`);
    r.verschiebenStatistik = st1 && st2 ? { vollGemalt: st2.voll - st1.voll, nurVerschoben: st2.nurVerschoben - st1.nurVerschoben } : null;
    await warte(600);
    r.zoomen = await js(`new Promise(ok => { const host = document.querySelector('.dok-bereich:not([hidden]) .leinwand'); const z = []; let l = performance.now(), i = 0;
      const f = t => { z.push(t - l); l = t; host.dispatchEvent(new WheelEvent('wheel', { deltaY: i < 40 ? -6 : 6, ctrlKey: true, bubbles: true, cancelable: true, clientX: 600, clientY: 400 })); if (++i < 80) requestAnimationFrame(f); else ok(window.__werte(z)); };
      requestAnimationFrame(f); })`);
    const st3 = await js(`Dokument.leinwand().statistik ? Dokument.leinwand().statistik() : null`);
    await warte(700);
    const st4 = await js(`Dokument.leinwand().statistik ? Dokument.leinwand().statistik() : null`);
    r.zoomenStatistik = st2 && st3 ? { vollGemalt: st3.voll - st2.voll, nachSchaerfe: st4.voll - st3.voll } : null;
    await foto('04-nach-zoom-scharf');
    await js(`Dokument.leinwand().einpassen()`);
    await warte(500);
    const z2 = await js(`window.__schreibe(120, { kipp: true, y: 260 }).then(z => window.__werte(z))`);
    r.schreibenMitViel = { bildzeiten: z2 };
    const st5 = await js(`Dokument.leinwand().statistik ? Dokument.leinwand().statistik() : null`);
    r.schreibenMitVielStatistik = st4 && st5 ? { vollGemalt: st5.voll - st4.voll } : null;
    await foto('05-schreiben-mit-viel-schrift');

    // 5. Radieren: nur Teilbereiche neu malen
    await js(`Dokument.leinwand().setzeWerkzeug('radierer'); Dokument.leinwand().setzeRadiermodus('bereich')`);
    const st6 = await js(`Dokument.leinwand().statistik ? Dokument.leinwand().statistik() : null`);
    r.radierenVorher = await js(`({ striche: Dokument.leinwand().inhalt(${JSON.stringify(sid)}).e.length, zoom: Dokument.leinwand().ansicht().s, modus: Werkzeuge.einstellungen().radiermodus, radius: Werkzeuge.einstellungen().radierGroesse, werkzeug: Werkzeuge.einstellungen().werkzeug })`);
    r.radieren = await js(`new Promise(ok => { const cv = window.__canvas(), r = cv.parentElement.getBoundingClientRect(); const z = []; let l = performance.now(), i = 0;
      const lw = Dokument.leinwand(), an = lw.ansicht(), sd = lw.seiten()[0];
      const x0 = r.left + an.x + (sd.x + 60) * an.s, y0 = r.top + an.y + (sd.y + 44) * an.s;   // dort liegt eine Zeile der Testschrift
      cv.dispatchEvent(new PointerEvent('pointerdown', { pointerId: 7, pointerType: 'mouse', isPrimary: true, clientX: x0, clientY: y0, buttons: 1, button: 0, bubbles: true, cancelable: true }));
      const f = t => { z.push(t - l); l = t; cv.dispatchEvent(new PointerEvent('pointermove', { pointerId: 7, pointerType: 'mouse', isPrimary: true, clientX: x0 + i * 6, clientY: y0 + (i % 6) * 2, buttons: 1, bubbles: true, cancelable: true })); if (++i < 60) requestAnimationFrame(f); else { cv.dispatchEvent(new PointerEvent('pointerup', { pointerId: 7, pointerType: 'mouse', isPrimary: true, clientX: x0 + 360, clientY: y0, buttons: 0, bubbles: true })); ok(window.__werte(z)); } };
      requestAnimationFrame(f); })`);
    const st7 = await js(`Dokument.leinwand().statistik ? Dokument.leinwand().statistik() : null`);
    r.radierenNachher = await js(`({ striche: Dokument.leinwand().inhalt(${JSON.stringify(sid)}).e.length })`);
    r.radierenStatistik = st6 && st7 ? { bereichGemalt: st7.bereich - st6.bereich, vollGemalt: st7.voll - st6.voll } : null;
    await foto('06-radiert');
    await js(`Dokument.leinwand().setzeWerkzeug('stift')`);
    await js(`for (let i = 0; i < 1500; i++) Dokument.leinwand().rueckgaengig()`);

    // 6. Stiftgrössen: drei Voreinstellungen, Regler 1 bis 20, je Werkzeug gemerkt
    const leiste = `document.querySelector('#dok-leiste .werkzeugleiste')`;
    r.groessen = {};
    r.groessen.start = await js(`JSON.parse(JSON.stringify(Werkzeuge.einstellungen().presets))`);
    await js(`${leiste}.querySelector('[data-preset="klein"]').click()`);
    r.groessen.nachKlein = await js(`({ dicke: Werkzeuge.einstellungen().dicke, aktiv: Werkzeuge.einstellungen().preset.stift, regler: ${leiste}.querySelector('[data-regler]').value })`);
    await js(`(() => { const inp = ${leiste}.querySelector('[data-regler]'); inp.value = 12; inp.dispatchEvent(new Event('input', { bubbles: true })); inp.dispatchEvent(new Event('change', { bubbles: true })); })()`);
    r.groessen.nachRegler = await js(`({ dicke: Werkzeuge.einstellungen().dicke, presets: Werkzeuge.einstellungen().presets.stift, reglerMin: ${leiste}.querySelector('[data-regler]').min, reglerMax: ${leiste}.querySelector('[data-regler]').max })`);
    await js(`${leiste}.querySelector('[data-preset="gross"]').click()`);
    r.groessen.nachGross = await js(`({ dicke: Werkzeuge.einstellungen().dicke, regler: ${leiste}.querySelector('[data-regler]').value })`);
    await js(`${leiste}.querySelector('[data-preset="klein"]').click()`);
    r.groessen.zurueckKlein = await js(`({ dicke: Werkzeuge.einstellungen().dicke, regler: ${leiste}.querySelector('[data-regler]').value })`);
    await js(`Dokument.leinwand().setzeWerkzeug('marker'); ${leiste}.querySelector('[data-preset="mittel"]').click()`);
    r.groessen.marker = await js(`({ dicke: Werkzeuge.einstellungen().markerDicke, presets: Werkzeuge.einstellungen().presets.marker })`);
    await js(`Dokument.leinwand().setzeWerkzeug('stift')`);
    await foto('07-groessen-leiste');
    await warte(3000);
    const einst = path.join(WURZEL, 'Daten', 'Einstellungen.json');
    r.einstellungenDatei = fs.existsSync(einst) ? JSON.parse(fs.readFileSync(einst, 'utf8')).eintraege['einst:stift'].v : null;
    r.appDatenHatStiftPresets = JSON.parse(fs.readFileSync(path.join(WURZEL, 'Daten', 'app-daten.json'), 'utf8'))['lokal:stift'];

    // 7. Stift-Panel mit Diagnose
    await js(`${leiste}.querySelector('[data-aktion="tasten"]').click()`);
    await js(`(() => { const cv = window.__canvas(), r = cv.parentElement.getBoundingClientRect(); cv.dispatchEvent(window.__pen('pointermove', r.left + 300, r.top + 300, 0.62, 28, -9)); })()`);
    await warte(300);
    r.diagnose = await js(`(() => { const p = document.querySelector('.dok-bereich:not([hidden]) .tasten-panel'); return { typ: p.querySelector('[data-d="typ"]').textContent, druck: p.querySelector('[data-d="druck"]').textContent, neigung: p.querySelector('[data-d="neigung"]').textContent }; })()`);
    await foto('08-stift-panel');
    await js(`${leiste}.querySelector('[data-aktion="tasten"]').click()`);

    // 8. Gemeinsame Einstellungen von einem anderen Gerät
    fs.writeFileSync(einst, JSON.stringify({ lernheft: 2, art: 'einstellungen', eintraege: { 'einst:stift': { v: { ...r.einstellungenDatei, presets: { ...r.einstellungenDatei.presets, stift: { klein: 2.5, mittel: 4, gross: 9 } }, preset: { stift: 'gross', marker: 'mittel', radierer: 'mittel' } }, m: Date.now() + 5000 } } }));
    await warte(3500);
    r.einstellungVonAussen = await js(`({ dicke: Werkzeuge.einstellungen().dicke, klein: Werkzeuge.einstellungen().presets.stift.klein, regler: ${leiste}.querySelector('[data-regler]').value })`);

    // 9. Seite von aussen geändert, während hier ungesicherte Arbeit liegt: beides bleibt
    await js(`Dokument.leinwand().setzeWerkzeug('stift')`);
    await js(`window.__schreibe(20, { y: 500 })`);
    const dateiPfad = path.join(datei, r.dateienSpaeter[0]);
    const aktuell = format.dekodiereSeite(zlib.gunzipSync(fs.readFileSync(dateiPfad)).toString());
    aktuell.e.push({ id: 'vonAussen', w: 'stift', f: 'rot', d: 3, m: Date.now() + 10, p: [[100, 100, 0.5], [200, 120, 0.5], [300, 100, 0.5]] });
    fs.writeFileSync(dateiPfad, zlib.gzipSync(Buffer.from(format.kodiereSeite(sid, aktuell))));
    await warte(4500);
    r.zusammengefuehrtImBild = await js(`(() => { const e = Dokument.leinwand().inhalt(${JSON.stringify(sid)}).e; return { von_aussen: e.some(x => x.id === 'vonAussen'), eigene: e.length }; })()`);
    await warte(2500);
    const fertig = format.dekodiereSeite(zlib.gunzipSync(fs.readFileSync(dateiPfad)).toString());
    r.zusammengefuehrtInDatei = { von_aussen: fertig.e.some(x => x.id === 'vonAussen'), striche: fertig.e.length };
    await foto('09-zusammengefuehrt');
  } catch (e) { r.fehler = String(e.stack || e); }
  fs.writeFileSync(path.join(AUS, 'neu.json'), JSON.stringify({ r, log }, null, 2));
  app.quit();
});
