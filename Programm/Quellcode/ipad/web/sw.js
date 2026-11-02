'use strict';
// Service Worker der Web-App (node baue.js web setzt VERSION und DATEIEN ein). Hält alle Dateien der App auf dem Gerät:
// die App startet sofort und auch ohne Netz aus dem eigenen Speicher. Eine neue Version (andere Prüfsumme) wird beim
// Installieren ganz geladen und gilt ab dem nächsten Start. Abgleich mit OneDrive/Dropbox und Anmeldung gehen nie
// durch den Speicher.
const VERSION = '__VERSION__';
const DATEIEN = ['__DATEIEN__'];
const SCHRIFTEN = 'lernheft-schriften';

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION)
    .then(c => c.addAll(DATEIEN.map(d => new Request(d, { cache: 'reload' }))))
    .then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(ks => Promise.all(ks.filter(k => k !== VERSION && k !== SCHRIFTEN).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const r = e.request;
  if (r.method !== 'GET') return;
  const url = new URL(r.url);
  // Schriften von Google: einmal laden, danach aus dem Speicher
  if (/^fonts\.(googleapis|gstatic)\.com$/.test(url.hostname)) {
    e.respondWith(caches.open(SCHRIFTEN).then(c => c.match(r).then(m => m || fetch(r).then(a => { if (a && (a.ok || a.type === 'opaque')) c.put(r, a.clone()); return a; }))));
    return;
  }
  if (url.origin !== location.origin) return;
  // Seitenaufruf (auch die Rückkehr von der Anmeldung mit ?code=…): immer die App
  if (r.mode === 'navigate') {
    e.respondWith(caches.match('index.html', { cacheName: VERSION }).then(m => m || fetch(r)));
    return;
  }
  e.respondWith(caches.match(r, { cacheName: VERSION, ignoreSearch: true }).then(m => m || fetch(r)));
});
