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

// Sicherheitsregeln für alles, was der Server ausliefert: nur eigene Skripte (kein eval, kein Inline-Code), keine
// Verbindungen nach aussen ausser den Schriften von Google, nicht in fremde Seiten einbettbar, Dateitypen nicht raten.
// Selbst wenn fremder Text (z. B. aus einem PDF) als HTML in die Oberfläche geriete, könnte er nichts ausführen.
const CSP = [
  "default-src 'self'", "script-src 'self'", "worker-src 'self' blob:", "connect-src 'self' data: blob:",
  "img-src 'self' data: blob:", "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com", "font-src 'self' data: https://fonts.gstatic.com",
  "object-src 'none'", "base-uri 'self'", "form-action 'none'", "frame-ancestors 'none'"
].join('; ');
const SICHER = { 'X-Content-Type-Options': 'nosniff', 'Cross-Origin-Resource-Policy': 'same-origin', 'X-Frame-Options': 'DENY', 'Referrer-Policy': 'no-referrer' };

function starteServer({ port, seite }) {
  const vendor = vendorDateien();
  const erlaubt = new Set([`127.0.0.1:${port}`, `localhost:${port}`]);
  const wurzel = path.resolve(seite);

  const server = http.createServer((req, res) => {
    try {
      if (!erlaubt.has(req.headers.host)) { res.writeHead(403, SICHER); return res.end(); }
      if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405, SICHER); return res.end(); }
      const p = decodeURIComponent(new URL(req.url, `http://${req.headers.host}`).pathname);
      if (p === '/api/ping') {
        res.writeHead(200, { ...SICHER, 'Content-Type': 'application/json' });
        return res.end('{"lernheft":2}');
      }
      const ziel = vendor[p] || path.resolve(wurzel, '.' + (p === '/' ? '/index.html' : p));
      if (!vendor[p] && ziel !== wurzel && !ziel.startsWith(wurzel + path.sep)) { res.writeHead(403, SICHER); return res.end(); }
      fs.readFile(ziel, (fehler, inhalt) => {
        if (fehler) { res.writeHead(404, { ...SICHER, 'Content-Type': 'text/plain; charset=utf-8' }); return res.end('Nicht gefunden'); }
        const typ = TYPEN[path.extname(ziel).toLowerCase()] || 'application/octet-stream';
        const kopf = { ...SICHER, 'Content-Type': typ, 'Cache-Control': 'no-cache' };
        if (typ.startsWith('text/html')) {
          kopf['Content-Security-Policy'] = CSP;
          // Die Schriften ohne Inline-Handler laden (den verbietet die Regel); der Text bleibt sonst unverändert
          inhalt = Buffer.from(String(inhalt).replace(/<link rel="stylesheet" media="print" onload="this.media='all'" href=/g, '<link rel="stylesheet" href='));
        }
        res.writeHead(200, kopf);
        res.end(inhalt);
      });
    } catch (e) {
      if (!res.headersSent) res.writeHead(500, { ...SICHER, 'Content-Type': 'text/plain; charset=utf-8' });
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
