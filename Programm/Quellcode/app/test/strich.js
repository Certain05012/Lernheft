'use strict';
// Prüflauf für das Schreibgefühl: sieht ein Strich beim Schreiben genauso aus wie danach (keine durchsichtige oder
// andere Linie, nichts springt beim Absetzen), und folgt er bei "Glättung aus" genau dem Stift?
// Auf einer weissen Notizbuch-Seite wird mit simuliertem Stift (Druck schwankt) ein Zickzack geschrieben.
// Mitten im Strich und nach dem Absetzen wird der Bildschirm fotografiert (capturePage) und verglichen.
// Aufruf: electron test/strich.js <ausgabeordner> [skalierung]
// Schreibt strich.json und Fotos (mitten.png, danach.png, unterschied.png). Vorher Lernheft schliessen (Port 47823).
const { app, BrowserWindow, nativeImage } = require('electron');
const path = require('path');
const fs = require('fs');

const AUS = path.resolve(process.argv[2]);
const SKALA = Number(process.argv[3]) || 0;
const OHNE_VEREINFACHEN = process.argv.includes('ohne-vereinfachen');   // zum Vergleich: Punkte nicht reduzieren
if (SKALA) app.commandLine.appendSwitch('force-device-scale-factor', String(SKALA));
const WURZEL = path.join(AUS, 'Lernheft');
fs.rmSync(AUS, { recursive: true, force: true });
fs.mkdirSync(path.join(WURZEL, 'Programm'), { recursive: true });
app.setPath('userData', path.join(AUS, 'profil'));
process.env.LERNHEFT_ORDNER = WURZEL;
process.env.LERNHEFT_SEITE = path.join(__dirname, '..', '..', 'webseite');
const warte = ms => new Promise(r => setTimeout(r, ms));
require('../main.js');

app.whenReady().then(async () => {
  let win;
  for (let i = 0; i < 100 && !win; i++) { win = BrowserWindow.getAllWindows()[0]; if (!win) await warte(100); }
  const wc = win.webContents;
  wc.setBackgroundThrottling(false);
  const log = [];
  wc.on('console-message', (e, l, m) => { if (l >= 2) log.push(m); });
  win.setSize(1300, 900);
  win.show(); win.focus();
  await new Promise(r => wc.once('did-finish-load', r));
  await warte(2000);
  const js = c => wc.executeJavaScript(c, true);
  const r = { skala: SKALA || 1, laeufe: [] };
  const bild = async rect => (await wc.capturePage(rect));
  try {
    await js(`(async () => {
      window.__neu = async () => {
        const id = UI.neueId(), s1 = UI.neueId();
        Bibliothek.speichere(id, { art: 'notizbuch', name: 'Strich ' + id, eltern: null, format: 'A4', papier: 'blanko', seitenfarbe: 'weiss', farbe: 'blau', seiten: [s1], erstellt: Date.now(), geoeffnet: 0, seite: 1, favorit: false });
        location.hash = '#/dok/' + id;
        for (let i = 0; i < 80 && !(Dokument.leinwand() && Dokument.leinwand().seiten().length && Dokument.leinwand().seiten()[0].id === s1); i++) await new Promise(ok => setTimeout(ok, 100));
        await new Promise(ok => setTimeout(ok, 800));
      };
      // Stift: Zickzack mit schwankendem Druck, ein Punkt je 8 ms (wie ein langsamer Zug). halt: vor dem Ende anhalten
      window.__start = (pts) => {
        const cv = document.querySelector('.dok-bereich:not([hidden]) .lw-canvas');
        cv.setPointerCapture = () => {}; cv.releasePointerCapture = () => {}; cv.hasPointerCapture = () => true;
        const hr = cv.parentElement.getBoundingClientRect();
        window.__ev = (typ, x, y, p) => cv.dispatchEvent(new PointerEvent(typ, { pointerId: 9, pointerType: 'pen', isPrimary: true, clientX: hr.left + x, clientY: hr.top + y, pressure: p, buttons: typ === 'pointerup' ? 0 : 1, button: 0, bubbles: true, cancelable: true }));
        __ev('pointerdown', pts[0][0], pts[0][1], pts[0][2]);
      };
      window.__weiter = async (pts) => { for (const p of pts) { __ev('pointermove', p[0], p[1], p[2]); await new Promise(ok => setTimeout(ok, 8)); } };
      window.__ende = async (p) => { __ev('pointerup', p[0], p[1], 0); await new Promise(ok => setTimeout(ok, 600)); };
      window.__flaeche = () => { const b = document.querySelector('.dok-bereich:not([hidden]) .dok-flaeche').getBoundingClientRect(); return { x: Math.round(b.left) + 2, y: Math.round(b.top) + 2, width: Math.round(b.width) - 4, height: Math.round(b.height) - 4 }; };
    })()`);
    for (const glaettung of ['aus', 'niedrig']) {
      // Punkte in Bildschirm-px relativ zur Fläche
      const pts = [];
      for (let i = 0; i <= 120; i++) pts.push([300 + i * 4, 260 + ((i % 20) < 10 ? (i % 10) * 9 : (10 - (i % 10)) * 9), 0.3 + 0.3 * Math.sin(i / 7) ** 2]);
      const flaeche = await js(`(async () => {
        await __neu();
        const lw = Dokument.leinwand();
        if (${OHNE_VEREINFACHEN}) LHFormat.vereinfacheStrich = st => st;
        lw.setzeWerkzeug('stift'); lw.setzeFarbe('tinte');
        lw.einst.glaettung = ${JSON.stringify(glaettung)}; lw.einst.halteForm = false; lw.einst.kritzelLoeschen = false;
        const pts = ${JSON.stringify(pts)};
        __start(pts);
        await __weiter(pts.slice(1, 100));
        await new Promise(ok => requestAnimationFrame(() => requestAnimationFrame(ok)));
        return __flaeche();
      })()`);
      const mitten = await bild(flaeche);
      const daten = await js(`(async () => {
        const pts = ${JSON.stringify(pts)};
        await __weiter(pts.slice(100));
        await __ende(pts[pts.length - 1]);
        const lw = Dokument.leinwand(); lw.sichern();
        const sid = lw.seiten()[0].id, id = location.hash.split('/').pop();
        const st = Daten.get('ink:' + id + ':' + sid).e.find(e => e.w === 'stift');
        const a = lw.ansicht(), s = lw.seiten()[0];
        // Eingabe in Seiten-Koordinaten
        const ein = pts.map(([x, y]) => [(x - a.x) / a.s - s.x, (y - a.y) / a.s - s.y]);
        const abst = (p, q, r) => { const dx = r[0] - q[0], dy = r[1] - q[1], l = dx * dx + dy * dy; const t = l ? Math.max(0, Math.min(1, ((p[0] - q[0]) * dx + (p[1] - q[1]) * dy) / l)) : 0; return Math.hypot(p[0] - q[0] - t * dx, p[1] - q[1] - t * dy); };
        // grösste Abweichung der Eingabe von der gespeicherten Linie (in Bildschirm-px)
        let max = 0; for (const p of ein) { let m = Infinity; for (let i = 1; i < st.p.length; i++) m = Math.min(m, abst(p, st.p[i - 1], st.p[i])); max = Math.max(max, m); }
        return { punkteEingabe: pts.length, punkteGespeichert: st.p.length, groessteAbweichungPx: Math.round(max * a.s * 100) / 100, zoom: a.s, dpr: devicePixelRatio };
      })()`);
      const danach = await bild(flaeche);
      // Vergleich nur im Teil, der mitten im Strich schon fest war: die Glättung legt einen Punkt erst fest, wenn ein
      // paar weitere da sind (höchstens 5 bei Niedrig), dazu hängt ein Abschnitt vom übernächsten Punkt ab (bis Punkt 91)
      const A = mitten.toBitmap(), B = danach.toBitmap(), g = mitten.getSize();
      const k = (A.length / 4) / (g.width * g.height) === 1 ? 1 : Math.sqrt((A.length / 4) / (g.width * g.height));
      const W = Math.round(g.width * k), H = Math.round(g.height * k);
      const xMax = Math.round((300 + 91 * 4 - 2) * k);
      let anders = 0, heller = 0, dunkler = 0, tinte = 0, groesst = 0, stark = 0;
      const diff = Buffer.alloc(A.length);
      for (let y = 0; y < H; y++) for (let x = 0; x < Math.min(W, xMax); x++) {
        const i = (y * W + x) * 4;
        const la = (A[i] + A[i + 1] + A[i + 2]) / 3, lb = (B[i] + B[i + 1] + B[i + 2]) / 3;
        if (lb < 200) tinte++;
        const d = Math.abs(la - lb);
        if (d > groesst) groesst = d;
        if (d > 100) stark++;
        if (d > 24) { anders++; if (la > lb) heller++; else dunkler++; diff[i + 2] = 255; diff[i + 3] = 255; } else { diff[i] = diff[i + 1] = diff[i + 2] = 255 - Math.round((255 - lb) * 0.3); diff[i + 3] = 255; }
      }
      fs.writeFileSync(path.join(AUS, `mitten-${glaettung}.png`), mitten.toPNG());
      fs.writeFileSync(path.join(AUS, `danach-${glaettung}.png`), danach.toPNG());
      fs.writeFileSync(path.join(AUS, `unterschied-${glaettung}.png`), nativeImage.createFromBitmap(diff, { width: W, height: H }).toPNG());
      r.laeufe.push({ glaettung, ...daten, tintePixel: tinte, verschiedenePixel: anders, starkVerschieden: stark, mittenHeller: heller, mittenDunkler: dunkler, groessterUnterschied: Math.round(groesst) });
    }
    // Zittern: langsam geschriebene Welle, Punkte auf ganze Bildschirm-px gerundet (wie manche Browser melden) und mit
    // etwas Rauschen des Stifts. Gemessen wird, wie weit die gespeicherte Linie von der wahren Welle abweicht (Mittel und
    // grösste Abweichung in Bildschirm-px) und wie unruhig sie ist (mittlere Richtungsänderung je Punkt in Grad).
    r.zittern = [];
    for (const glaettung of ['aus', 'niedrig', 'mittel', 'hoch']) {
      let z = 11; const zz = () => (z = (z * 16807) % 2147483647) / 2147483647 - 0.5;
      const wahr = i => [300 + i * 1.3, 300 + 40 * Math.sin(i / 60)];
      const pts = []; for (let i = 0; i <= 400; i++) { const [x, y] = wahr(i); pts.push([Math.round(x + zz() * 0.6), Math.round(y + zz() * 0.6), 0.4 + zz() * 0.1]); }
      r.zittern.push(await js(`(async () => {
        await __neu();
        const lw = Dokument.leinwand();
        lw.setzeWerkzeug('stift'); lw.einst.glaettung = ${JSON.stringify(glaettung)}; lw.einst.halteForm = false; lw.einst.kritzelLoeschen = false;
        const pts = ${JSON.stringify(pts)};
        __start(pts); await __weiter(pts.slice(1)); await __ende(pts[pts.length - 1]); lw.sichern();
        const sid = lw.seiten()[0].id, id = location.hash.split('/').pop();
        const st = Daten.get('ink:' + id + ':' + sid).e.find(e => e.w === 'stift');
        const a = lw.ansicht(), s = lw.seiten()[0];
        const ideal = []; for (let i = 0; i <= 4000; i++) { const t = i / 10; ideal.push([(300 + t * 1.3 - a.x) / a.s - s.x, (300 + 40 * Math.sin(t / 60) - a.y) / a.s - s.y]); }
        let summe = 0, max = 0, n = 0, dreh = 0;
        for (let i = 3; i < st.p.length - 3; i++) {
          let m = Infinity; for (const q of ideal) m = Math.min(m, Math.hypot(q[0] - st.p[i][0], q[1] - st.p[i][1]));
          summe += m; n++; max = Math.max(max, m);
          const u = [st.p[i][0] - st.p[i - 1][0], st.p[i][1] - st.p[i - 1][1]], v = [st.p[i + 1][0] - st.p[i][0], st.p[i + 1][1] - st.p[i][1]];
          dreh += Math.abs(Math.atan2(u[0] * v[1] - u[1] * v[0], u[0] * v[0] + u[1] * v[1]));
        }
        return { glaettung: ${JSON.stringify(glaettung)}, punkte: st.p.length, mittlereAbweichungPx: Math.round(summe / n * a.s * 100) / 100, groessteAbweichungPx: Math.round(max * a.s * 100) / 100, unruheGradJePunkt: Math.round(dreh / n * 180 / Math.PI * 10) / 10 };
      })()`));
    }
  } catch (e) { r.fehler = String(e && e.stack || e); }
  r.log = log.slice(0, 20);
  fs.writeFileSync(path.join(AUS, 'strich.json'), JSON.stringify(r, null, 2));
  app.exit(0);
});
