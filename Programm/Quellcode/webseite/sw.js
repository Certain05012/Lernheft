'use strict';
// Service Worker für die Web-App (iPad, Safari, "Zum Home-Bildschirm"): hält die Oberfläche offline bereit.
// Strategie: erst das Netz (damit Updates sofort ankommen), ohne Netz die gemerkte Kopie. Die PDF-Werkzeuge und
// Schriften von fremden Servern werden beim ersten Mal mitgemerkt.
const VERSION = 'lernheft-web-2';
const KERN = ['./', 'index.html', 'style.css', 'ui.js', 'daten.js', 'zeit.js', 'format.js', 'formen.js', 'leinwand.js', 'werkzeuge.js', 'pdfdienst.js',
  'seitenleiste.js', 'umwandeln.js', 'bibliothek.js', 'dokument.js', 'geraet.js', 'app.js', 'icon.svg', 'icon-512.png', 'manifest.webmanifest'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => Promise.all(KERN.map(u => c.add(u).catch(() => null)))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const r = e.request;
  if (r.method !== 'GET') return;
  const url = new URL(r.url);
  const fremd = url.origin !== location.origin;
  // Fremde Quellen nur für die bekannten CDNs (PDF-Werkzeuge, Schriften)
  if (fremd && !/(cdnjs\.cloudflare\.com|fonts\.googleapis\.com|fonts\.gstatic\.com)$/.test(url.hostname)) return;
  e.respondWith(
    fetch(r).then(antwort => {
      if (antwort && (antwort.ok || antwort.type === 'opaque')) { const kopie = antwort.clone(); caches.open(VERSION).then(c => c.put(r, kopie)); }
      return antwort;
    }).catch(() => caches.match(r, { ignoreSearch: false }).then(c => c || (r.mode === 'navigate' ? caches.match('index.html') : undefined)))
  );
});
