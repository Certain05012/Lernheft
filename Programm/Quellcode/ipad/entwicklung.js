'use strict';
// Die iPad-App im Browser am PC ausprobieren (vorher: node baue.js).
//   node entwicklung.js              http://localhost:47830/  (Anmeldung bei Microsoft wie auf dem iPad, nur im Browser)
//   node entwicklung.js attrappe     dazu die nachgebaute OneDrive- und Dropbox-Schnittstelle auf Port 47831 (beide mit
//                                    denselben Dateien), ohne Anmeldung: http://localhost:47830/?attrappe=http://127.0.0.1:47831
//   node entwicklung.js web …        statt www die Web-App (vorher: node baue.js web), mit Service Worker
const http = require('http');
const fs = require('fs');
const path = require('path');

const WWW = path.join(__dirname, process.argv.includes('web') ? 'web-app' : 'www');
const PORT = 47830;
const TYPEN = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };

http.createServer((req, res) => {
  const p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  const datei = path.join(WWW, p === '/' ? 'index.html' : p);
  if (!datei.startsWith(WWW) || !fs.existsSync(datei) || fs.statSync(datei).isDirectory()) { res.writeHead(404); return res.end('Nicht gefunden'); }
  res.writeHead(200, { 'Content-Type': TYPEN[path.extname(datei)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
  fs.createReadStream(datei).pipe(res);
}).listen(PORT, '127.0.0.1', () => console.log(`iPad-App im Browser: http://localhost:${PORT}/`));

// node entwicklung.js attrappe [vorlage]: die Test-OneDrive mit einer Kopie eines Lernheft-Ordners füllen
if (process.argv.includes('attrappe')) {
  const vorlage = process.argv.slice(process.argv.indexOf('attrappe') + 1).find(a => a !== 'web');
  require('./test/graph-attrappe').starteAttrappe({ port: 47831 }).then(g => {
    g.pc.ordner('Lernheft');
    const geh = (q, rel) => {
      for (const e of fs.readdirSync(q, { withFileTypes: true })) {
        const r = rel + '/' + e.name;
        if (e.isDirectory()) { g.pc.ordner(r); geh(path.join(q, e.name), r); } else g.pc.schreibe(r, fs.readFileSync(path.join(q, e.name)));
      }
    };
    if (vorlage && fs.existsSync(vorlage)) { geh(vorlage, 'Lernheft'); console.log('Test-Cloud gefüllt aus ' + vorlage); }
    console.log(`Test-OneDrive: ${g.basis}, Test-Dropbox: ${g.dropbox}  ->  http://localhost:${PORT}/?attrappe=${g.url}`);
  });
}
