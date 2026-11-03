'use strict';
// Web-App auf dem iPad und im Browser: Installation als App, Offline-Betrieb, Schutz vor den Gesten des Systems
// (Seitenzoom, Zurückwischen, Gummiband) und eine Sicherung in einer Datei, weil Safari-Speicher gelöscht werden kann.
(function () {
  const app = !!window.lernheftDesktop;

  // Safari zoomt sonst die ganze Seite, wenn man mit zwei Fingern auf der Schreibfläche zoomt
  for (const typ of ['gesturestart', 'gesturechange', 'gestureend']) document.addEventListener(typ, e => e.preventDefault(), { passive: false });
  // (Doppeltippen zum Zoomen verhindert das CSS mit touch-action: manipulation)

  if (app) return;

  // Speicher als "dauerhaft" anfordern: Safari und Chrome löschen sonst bei Platzmangel zuerst (und Safari nach 7 Tagen
  // ohne Besuch, ausser die Seite liegt auf dem Home-Bildschirm)
  try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist(); } catch (e) { /* optional */ }

  // Offline-Betrieb: nur über https (GitHub Pages) oder localhost
  if ('serviceWorker' in navigator && (location.protocol === 'https:' || /^(localhost|127\.0\.0\.1)$/.test(location.hostname))) {
    window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => { /* ohne Offline-Betrieb */ }));
  }

  /* ---------- Sicherung in einer Datei (Web) ---------- */

  const alsBase64 = async blob => {
    const b = new Uint8Array(await blob.arrayBuffer());
    let s = '';
    for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode.apply(null, b.subarray(i, i + 0x8000));
    return btoa(s);
  };
  const ausBase64 = (t, typ) => { const s = atob(t), b = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) b[i] = s.charCodeAt(i); return new Blob([b], { type: typ }); };
  const gzip = async text => new Response(new Blob([text]).stream().pipeThrough(new CompressionStream('gzip'))).blob();
  const gunzip = async blob => new Response(blob.stream().pipeThrough(new DecompressionStream('gzip'))).text();

  async function exportieren() {
    await Daten.lade(Daten.keys('ink:'));
    const kv = {};
    for (const k of Daten.keys('')) if (!k.startsWith('lokal:')) kv[k] = Daten.get(k);
    const dateien = {};
    for (const k of await Daten.datei.liste()) {
      const b = await Daten.datei.lokal(k);
      if (b) dateien[k] = { typ: b.type || 'application/octet-stream', daten: await alsBase64(b) };
    }
    const text = JSON.stringify({ art: 'lernheft-web-sicherung', lh: 1, erstellt: Date.now(), kv, dateien });
    const blob = window.CompressionStream ? await gzip(text) : new Blob([text], { type: 'application/json' });
    const name = `Lernheft-Sicherung ${new Date().toISOString().slice(0, 10)}${window.CompressionStream ? '.json.gz' : '.json'}`;
    await UI.speichereDatei(name, blob, 'notizbuch', []);
    return { dokumente: Object.keys(kv).filter(k => k.startsWith('bib:')).length, bytes: blob.size };
  }

  // Führt zusammen, überschreibt nichts: Vorhandenes bleibt, Handschrift wird zusammengeführt, Fehlendes kommt dazu
  async function importieren(datei) {
    let text;
    try { text = /\.gz$/i.test(datei.name) ? await gunzip(datei) : await datei.text(); } catch (e) { throw new Error('Die Datei lässt sich nicht lesen.'); }
    let p;
    try { p = JSON.parse(text); } catch (e) { throw new Error('Das ist keine Lernheft-Sicherung.'); }
    if (!p || p.art !== 'lernheft-web-sicherung') throw new Error('Das ist keine Lernheft-Sicherung für die Web-App.');
    const bericht = { neu: 0, zusammengefuehrt: 0, dateien: 0 };
    await Daten.lade(Object.keys(p.kv || {}).filter(k => k.startsWith('ink:')));
    for (const [k, v] of Object.entries(p.kv || {})) {
      const da = Daten.get(k, undefined);
      if (da === undefined) { Daten.set(k, v); bericht.neu++; }
      else if (k.startsWith('ink:') && window.LHFormat) {
        try { Daten.set(k, LHFormat.fuehreSeiteZusammen(da, v)); bericht.zusammengefuehrt++; } catch (e) { /* bleibt */ }
      }
    }
    for (const [k, d] of Object.entries(p.dateien || {})) {
      if (!(await Daten.datei.lokal(k))) { await Daten.datei.put(k, ausBase64(d.daten, d.typ)); bericht.dateien++; }
    }
    return bericht;
  }

  window.WebSicherung = { exportieren, importieren };
})();
