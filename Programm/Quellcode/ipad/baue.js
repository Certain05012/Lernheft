'use strict';
// Baut den Ordner www für die iPad-App (Capacitor) aus der Oberfläche (../webseite), der Ablage (../app/ablage.js),
// den iPad-Teilen (web/) und den Bibliotheken (PDF, gzip, Capacitor). Kein Bundler: alles sind einfache Skripte.
//   node baue.js        danach: npx cap sync ios (oder npm run ios)
//   node baue.js web    Web-App für Safari (GitHub Pages) im Ordner web-app: dieselbe Brücke und derselbe Abgleich, ohne
//                       Capacitor, dazu Service Worker (läuft offline) und Web-Manifest (Zum Home-Bildschirm)
//   node baue.js web test   dasselbe, die Sicherheitsregel erlaubt zusätzlich die Test-Cloud auf 127.0.0.1:47831
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const HIER = __dirname;
const WEB = process.argv.includes('web');
const TEST = process.argv.includes('test');
const VERSION = JSON.parse(fs.readFileSync(path.join(HIER, 'package.json'), 'utf8')).version;
const WWW = path.join(HIER, WEB ? 'web-app' : 'www');
const SEITE = path.join(HIER, '..', 'webseite');
const nm = (...t) => path.join(HIER, 'node_modules', ...t);

fs.rmSync(WWW, { recursive: true, force: true });
fs.cpSync(SEITE, WWW, { recursive: true, filter: q => !/[\\/](sw\.js)$/.test(q) });

// Bibliotheken
const vendor = {
  'pdf.min.js': nm('pdfjs-dist', 'build', 'pdf.min.js'),
  'pdf.worker.min.js': nm('pdfjs-dist', 'build', 'pdf.worker.min.js'),
  'pdf-lib.min.js': nm('pdf-lib', 'dist', 'pdf-lib.min.js'),
  'fflate.js': nm('fflate', 'umd', 'index.js')
};
if (!WEB) {
  Object.assign(vendor, {
    'capacitor.js': nm('@capacitor', 'core', 'dist', 'capacitor.js'),
    'synapse.js': nm('@capacitor', 'synapse', 'dist', 'synapse.js'),
    'capacitor-app.js': nm('@capacitor', 'app', 'dist', 'plugin.js'),
    'capacitor-browser.js': nm('@capacitor', 'browser', 'dist', 'plugin.js'),
    'capacitor-share.js': nm('@capacitor', 'share', 'dist', 'plugin.js'),
    'capacitor-filesystem.js': nm('@capacitor', 'filesystem', 'dist', 'plugin.js')
  });
}
fs.mkdirSync(path.join(WWW, 'vendor'), { recursive: true });
for (const [ziel, quelle] of Object.entries(vendor)) {
  // Quellkarten-Verweise entfernen (die .map-Dateien kommen nicht mit)
  const text = fs.readFileSync(quelle, 'utf8').replace(/\n\/\/# sourceMappingURL=\S+\s*$/, '\n');
  fs.writeFileSync(path.join(WWW, 'vendor', ziel), text);
}
if (!WEB) fs.writeFileSync(path.join(WWW, 'vendor', 'synapse-name.js'), 'var synapse = window.outsystemsSynapse;\n');

// iPad-Teile (Web-App: dazu pwa.js, lädt als erstes)
const IPAD = path.join(WWW, 'ipad');
fs.mkdirSync(IPAD, { recursive: true });
const teile = ['konfig.js', 'knoten.js', 'speicher.js', 'onedrive.js', 'dropbox.js', 'anmeldung.js', 'abgleich.js', 'sicherung.js'];
for (const t of [...(WEB ? ['pwa.js'] : []), ...teile]) fs.copyFileSync(path.join(HIER, 'web', t), path.join(IPAD, t));
// ablage.js unverändert, eingewickelt: require('fs') usw. kommen aus knoten.js (bruecke.js ruft LHAblageFabrik)
const ablage = fs.readFileSync(path.join(HIER, '..', 'app', 'ablage.js'), 'utf8');
fs.writeFileSync(path.join(IPAD, 'ablage.js'),
  '// Erzeugt von ipad/baue.js aus app/ablage.js. Nicht von Hand ändern.\n' +
  'window.LHAblageFabrik = function (require, Buffer) {\n  const module = { exports: {} };\n' + ablage + '\n  return module.exports;\n};\n');
// Versionsnummer für die Anzeige (Menü › Dropbox bzw. OneDrive)
fs.writeFileSync(path.join(IPAD, 'bruecke.js'), `window.LHVersion = ${JSON.stringify(VERSION)};\n` + fs.readFileSync(path.join(HIER, 'web', 'bruecke.js'), 'utf8'));

// index.html: die iPad-Teile vor daten.js laden (daten.js sucht beim Laden nach window.lernheftDesktop)
const skripte = [
  ...(WEB ? ['ipad/pwa.js'] : [
    'vendor/capacitor.js', 'vendor/synapse.js', 'vendor/synapse-name.js', 'vendor/capacitor-app.js', 'vendor/capacitor-browser.js',
    'vendor/capacitor-share.js', 'vendor/capacitor-filesystem.js']),
  'vendor/fflate.js',
  ...teile.map(t => 'ipad/' + t), 'ipad/ablage.js', 'ipad/bruecke.js'
].map(s => `<script src="${s}"></script>`).join('\n');
const indexPfad = path.join(WWW, 'index.html');
let index = fs.readFileSync(indexPfad, 'utf8');
if (!index.includes('<script src="daten.js"></script>')) throw new Error('index.html: daten.js nicht gefunden');
index = index.replace('<script src="daten.js"></script>', `<!-- ${WEB ? 'Web-App' : 'iPad-App'} (ipad/baue.js) -->\n${skripte}\n<script src="daten.js"></script>`);
// iPad-App: kein Service Worker, kein Web-Manifest
if (!WEB) index = index.replace(/<link rel="manifest"[^>]*>\r?\n?/, '');
// Web-App: Sicherheitsregel (Content-Security-Policy). Skripte nur aus der App selbst (keine fremden, keine eingebetteten,
// kein eval), Verbindungen nur zur App, zu Dropbox und zu Microsoft. Selbst wenn fremder Text (z. B. aus einem PDF oder
// einer Notiz) als HTML in die Seite geriete, könnte er nichts ausführen und nichts an fremde Server schicken. Die
// Schriften kommen von Google (nur CSS und Schriftdateien, kein Skript).
if (WEB) {
  // data: und blob: für Bilder in der Seite (z. B. "Bild kopieren" liest das Bild per fetch aus seiner data-Adresse)
  const verbindungen = ["'self'", 'data:', 'blob:', 'https://api.dropboxapi.com', 'https://content.dropboxapi.com', 'https://login.microsoftonline.com',
    'https://graph.microsoft.com', 'https://*.sharepoint.com', 'https://*.1drv.com', 'https://*.livefilestore.com', 'https://fonts.googleapis.com', 'https://fonts.gstatic.com'];
  if (TEST) verbindungen.push('http://127.0.0.1:47831');
  const csp = [
    "default-src 'self'", "script-src 'self'", "worker-src 'self' blob:", "connect-src " + verbindungen.join(' '),
    "img-src 'self' data: blob:", "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com", "font-src 'self' data: https://fonts.gstatic.com",
    "object-src 'none'", "base-uri 'self'", "form-action 'none'", "frame-src 'none'", "manifest-src 'self'"
  ].join('; ');
  index = index.replace('<meta charset="utf-8">', `<meta charset="utf-8">\n<meta http-equiv="Content-Security-Policy" content="${csp}">`);
  if (!index.includes('Content-Security-Policy')) throw new Error('index.html: <meta charset="utf-8"> nicht gefunden');
  // Die Schriften ohne onload-Handler laden (eingebettete Handler verbietet die Regel); der Service Worker hält sie bereit
  index = index.replace(/<link rel="stylesheet" media="print" onload="this\.media='all'" href=/, '<link rel="stylesheet" href=');
  if (/\son[a-z]+="/i.test(index)) throw new Error('index.html: eingebetteter Handler, den die Sicherheitsregel blockieren würde');
}
fs.writeFileSync(indexPfad, index);

// Web-App: Service Worker mit der Liste aller Dateien. Der Name seines Speichers enthält eine Prüfsumme über alle
// Dateien: nach jeder Änderung lädt Safari die neue Version im Hintergrund (und nur dann).
const alle = [];
const sammle = (d, rel) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const r = rel ? rel + '/' + e.name : e.name; if (e.isDirectory()) sammle(path.join(d, e.name), r); else alle.push(r); } };
sammle(WWW, '');
alle.sort();
if (WEB) {
  const h = crypto.createHash('sha256');
  for (const d of alle) { h.update(d); h.update(fs.readFileSync(path.join(WWW, d))); }
  const sw = fs.readFileSync(path.join(HIER, 'web', 'sw.js'), 'utf8')
    .replace("'__VERSION__'", JSON.stringify(`lernheft-${VERSION}-${h.digest('hex').slice(0, 12)}`))
    .replace("['__DATEIEN__']", JSON.stringify(['./', ...alle]));
  fs.writeFileSync(path.join(WWW, 'sw.js'), sw);
  // GitHub Pages: ohne Jekyll ausliefern, wie es ist
  fs.writeFileSync(path.join(WWW, '.nojekyll'), '');
}

const bytes = alle.reduce((s, d) => s + fs.statSync(path.join(WWW, d)).size, 0);
console.log(`${path.basename(WWW)} gebaut: ${alle.length} Dateien, ${(bytes / 1e6).toFixed(1)} MB`);
