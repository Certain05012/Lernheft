'use strict';
// Kleiner lokaler Server für die Offline-Kopie der Webseite (nur auf 127.0.0.1 erreichbar).
// Die Daten selbst laufen nicht hierüber, sondern über die Brücke in preload.js.
const http = require('http');
const fs = require('fs');
const path = require('path');

const TYPEN = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2'
};

// PDF-Werkzeuge liegen der App bei, damit auch offline alles geht
function vendorDateien() {
  const pdfjs = path.dirname(require.resolve('pdfjs-dist/package.json'));
  const pdflib = path.dirname(require.resolve('pdf-lib/package.json'));
  return {
    '/vendor/pdf.min.js': path.join(pdfjs, 'build', 'pdf.min.js'),
    '/vendor/pdf.worker.min.js': path.join(pdfjs, 'build', 'pdf.worker.min.js'),
    '/vendor/pdf-lib.min.js': path.join(pdflib, 'dist', 'pdf-lib.min.js')
  };
}

function starteServer({ port, seite }) {
  const vendor = vendorDateien();
  const erlaubt = new Set([`127.0.0.1:${port}`, `localhost:${port}`]);
  const wurzel = path.resolve(seite);

  const server = http.createServer((req, res) => {
    try {
      if (!erlaubt.has(req.headers.host)) { res.writeHead(403); return res.end(); }
      if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405); return res.end(); }
      const p = decodeURIComponent(new URL(req.url, `http://${req.headers.host}`).pathname);
      if (p === '/api/ping') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end('{"lernheft":2}');
      }
      const ziel = vendor[p] || path.resolve(wurzel, '.' + (p === '/' ? '/index.html' : p));
      if (!vendor[p] && ziel !== wurzel && !ziel.startsWith(wurzel + path.sep)) { res.writeHead(403); return res.end(); }
      fs.readFile(ziel, (fehler, inhalt) => {
        if (fehler) { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); return res.end('Nicht gefunden'); }
        res.writeHead(200, { 'Content-Type': TYPEN[path.extname(ziel).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
        res.end(inhalt);
      });
    } catch (e) {
      if (!res.headersSent) res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end(String(e && e.message || e));
    }
  });

  return new Promise((ok, fehler) => {
    server.once('error', fehler);
    server.listen(port, '127.0.0.1', () => ok(server));
  });
}

module.exports = { starteServer };

// Auch ohne App startbar: node server.js
if (require.main === module) {
  const port = Number(process.env.PORT) || 47823;
  starteServer({ port, seite: process.env.LERNHEFT_SEITE || path.join(__dirname, '..', 'webseite') })
    .then(() => console.log(`Lernheft läuft auf http://127.0.0.1:${port}`));
}
