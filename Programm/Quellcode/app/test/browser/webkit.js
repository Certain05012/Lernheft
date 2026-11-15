'use strict';
// Die Tests in test/browser auch in WebKit laufen lassen, der Engine von Safari (unter Linux als WebKitGTK), ohne
// Playwright: gesteuert wird über WebDriver (WebKitWebDriver + MiniBrowser). Dieses Modul bildet den kleinen Teil der
// Playwright-Schnittstelle nach, den die Tests benutzen (page.evaluate, screenshot, click, waitForFunction, mouse …).
//   Einrichten (einmal):  apt-get install -y webkit2gtk-driver xvfb
//   Aufruf:               LH_BROWSER=webkit node test/browser/<test>.js [ausgabeordner]
// Was das prüft und was nicht: dieselbe Engine wie Safari für JavaScript (JavaScriptCore), Layout, CSS und die
// Schnittstellen (Pointer Events, Canvas, Path2D). NICHT dasselbe ist das Malen: Safari auf dem iPad malt mit
// CoreGraphics und setzt die Ebenen mit CoreAnimation zusammen, WebKitGTK mit Skia. Zeiten für das Malen lassen sich
// von hier also nicht auf das iPad übertragen; dafür gibt es in der App die Messung unter Einstellungen › Erweitert.
const http = require('http'), fs = require('fs'), { spawn } = require('child_process');

const BINAER = process.env.LH_MINIBROWSER || '/usr/lib/x86_64-linux-gnu/webkit2gtk-4.1/MiniBrowser';

function anfrage(port, methode, pfad, daten) {
  return new Promise((ok, fehler) => {
    const text = daten === undefined ? null : JSON.stringify(daten);
    const req = http.request({ host: '127.0.0.1', port, method: methode, path: pfad, agent: false, headers: text ? { 'content-type': 'application/json', 'content-length': Buffer.byteLength(text) } : {} }, res => {
      let t = ''; res.setEncoding('utf8');
      res.on('data', d => { t += d; });
      res.on('end', () => {
        let j = null; try { j = JSON.parse(t); } catch (e) { /* kein JSON */ }
        if (res.statusCode >= 400 || (j && j.value && j.value.error)) fehler(new Error(`WebDriver ${methode} ${pfad}: ${j && j.value ? j.value.error + ' ' + j.value.message : res.statusCode + ' ' + t.slice(0, 300)}`));
        else ok(j ? j.value : null);
      });
    });
    req.on('error', fehler);
    req.setTimeout(180000, () => req.destroy(new Error('WebDriver antwortet nicht: ' + pfad)));
    if (text) req.write(text);
    req.end();
  });
}
const warte = ms => new Promise(ok => setTimeout(ok, ms));
const ELEMENT = 'element-6066-11e4-a716-446655440000';

// Startet WebKit mit einem Fenster von b x h CSS-px (dpr: 1 oder 2) und gibt { page, zu } zurück
async function starteWebkit(o = {}) {
  if (!fs.existsSync(BINAER)) throw new Error('WebKit fehlt (' + BINAER + '). Einrichten: apt-get install -y webkit2gtk-driver xvfb');
  const port = 4700 + Math.floor(Math.random() * 200);
  const dpr = Math.round(o.dpr || 1) >= 2 ? 2 : 1;
  const b = o.b || 1194, h = o.h || 834;
  // Eigener Bildschirm (Xvfb), gross genug für das Fenster in Bildschirmpixeln
  const env = Object.assign({}, process.env, { GDK_SCALE: String(dpr), GDK_BACKEND: 'x11', WEBKIT_DISABLE_SANDBOX_THIS_IS_DANGEROUS: '1', LIBGL_ALWAYS_SOFTWARE: '1', NO_AT_BRIDGE: '1' });
  for (const k of ['HTTP_PROXY', 'HTTPS_PROXY', 'http_proxy', 'https_proxy', 'ALL_PROXY', 'all_proxy']) delete env[k];
  const treiber = spawn('xvfb-run', ['-a', '-s', `-screen 0 ${(b + 200) * dpr}x${(h + 300) * dpr}x24`, 'WebKitWebDriver', '--port=' + port], { env, stdio: ['ignore', 'pipe', 'pipe'], detached: true });
  let ausgabe = '';
  treiber.stdout.on('data', d => { ausgabe += d; }); treiber.stderr.on('data', d => { ausgabe += d; });
  let sitzung = null;
  for (let i = 0; i < 60 && !sitzung; i++) {
    await warte(250);
    try {
      const v = await anfrage(port, 'POST', '/session', { capabilities: { alwaysMatch: { browserName: 'MiniBrowser', pageLoadStrategy: 'eager', 'webkitgtk:browserOptions': { binary: BINAER, args: ['--automation'] } } } });
      sitzung = v.sessionId;
    } catch (e) { if (i === 59) { try { process.kill(-treiber.pid, 'SIGTERM'); } catch (x) { treiber.kill(); } throw new Error('WebKit startet nicht: ' + e.message + '\n' + ausgabe.slice(-800)); } }
  }
  const S = '/session/' + sitzung;
  const wd = (methode, pfad, daten) => { if (process.env.LH_WD_LOG) console.error('wd', methode, pfad, daten && JSON.stringify(daten).slice(0, 120)); return anfrage(port, methode, S + pfad, daten); };
  await wd('POST', '/timeouts', { script: 170000, pageLoad: 60000 });
  // Fenster so gross, dass der Inhalt genau b x h misst
  const stelleGroesse = async (bb, hh) => {
    await wd('POST', '/window/rect', { x: 0, y: 0, width: bb, height: hh + 60 });
    for (let i = 0; i < 6; i++) {
      const innen = await wd('POST', '/execute/sync', { script: 'return [innerWidth, innerHeight]', args: [] });
      if (innen[0] === bb && innen[1] === hh) break;
      const r = await wd('GET', '/window/rect');
      await wd('POST', '/window/rect', { x: 0, y: 0, width: r.width + bb - innen[0], height: r.height + hh - innen[1] });
      await warte(150);
    }
  };
  // fn (Funktion oder Quelltext) in der Seite ausführen, mit einem Argument; Versprechen werden abgewartet
  const evaluate = async (fn, arg) => {
    const quelle = typeof fn === 'function' ? `(${fn.toString()})` : `(() => (${fn}))`;
    const skript = `const fertig = arguments[arguments.length - 1];
      Promise.resolve().then(() => ${quelle}(arguments[0])).then(w => fertig({ w: w === undefined ? null : w }), e => fertig({ fehler: String(e && e.stack || e) }));`;
    const r = await wd('POST', '/execute/async', { script: skript, args: [arg === undefined ? null : arg] });
    if (r && r.fehler) throw new Error('In der Seite: ' + r.fehler);
    return r ? r.w : null;
  };
  const finde = async sel => { const e = await wd('POST', '/element', { using: 'css selector', value: sel }); return e[ELEMENT]; };
  let zeit = 8000;
  const page = {
    webkit: true,
    setDefaultTimeout: ms => { zeit = ms; },
    goto: url => wd('POST', '/url', { url }),
    evaluate,
    waitForTimeout: warte,
    waitForFunction: async (fn, arg) => { const t0 = Date.now(); for (;;) { if (await evaluate(fn, arg)) return; if (Date.now() - t0 > Math.max(zeit, 30000)) throw new Error('waitForFunction: Zeit abgelaufen'); await warte(100); } },
    // Bildschirmfoto des Fensterinhalts (clip wird nicht beschnitten: ohne Bildbibliothek bleibt es das ganze Bild)
    screenshot: async (opt = {}) => { const png = Buffer.from(await wd('GET', '/screenshot'), 'base64'); if (opt.path) fs.writeFileSync(opt.path, png); return png; },
    click: async sel => { const t0 = Date.now(); for (;;) { try { const id = await finde(sel); await wd('POST', `/element/${id}/click`, {}); return; } catch (e) { if (Date.now() - t0 > zeit) throw new Error('click ' + sel + ': ' + e.message); await warte(100); } } },
    setViewportSize: ({ width, height }) => stelleGroesse(width, height),
    mouse: (() => {
      let x = 0, y = 0;
      const tu = aktionen => wd('POST', '/actions', { actions: [{ type: 'pointer', id: 'maus', parameters: { pointerType: 'mouse' }, actions: aktionen }] });
      return {
        move: async (nx, ny, opt = {}) => { const n = opt.steps || 1, a = []; for (let i = 1; i <= n; i++) a.push({ type: 'pointerMove', duration: 8, x: Math.round(x + (nx - x) * i / n), y: Math.round(y + (ny - y) * i / n) }); x = nx; y = ny; await tu(a); },
        down: () => tu([{ type: 'pointerDown', button: 0 }]),
        up: () => tu([{ type: 'pointerUp', button: 0 }]),
        click: async (nx, ny) => { x = nx; y = ny; await tu([{ type: 'pointerMove', duration: 0, x: Math.round(nx), y: Math.round(ny) }, { type: 'pointerDown', button: 0 }, { type: 'pointerUp', button: 0 }]); }
      };
    })()
  };
  await stelleGroesse(b, h);
  // Beenden: Sitzung schliessen, dann die ganze Prozessgruppe (xvfb-run, Xvfb, Treiber, Browser)
  const zu = async () => {
    try { await anfrage(port, 'DELETE', S); } catch (e) { /* schon weg */ }
    try { process.kill(-treiber.pid, 'SIGTERM'); } catch (e) { treiber.kill('SIGTERM'); }
    treiber.stdout.destroy(); treiber.stderr.destroy(); treiber.unref();
    await warte(200);
  };
  return { page, zu, version: async () => evaluate(() => navigator.userAgent) };
}

module.exports = { starteWebkit };
