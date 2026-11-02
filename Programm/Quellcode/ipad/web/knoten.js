'use strict';
// Die Ablage des Lernhefts (app/ablage.js) ist für Node geschrieben: sie liest und schreibt den Lernheft-Ordner mit
// fs, path und zlib, und zwar synchron. Auf dem iPad gibt es keinen solchen Ordner. Hier steht deshalb ein kleiner
// Nachbau dieser Node-Teile, mit dem ablage.js unverändert im Browser läuft:
//
//   fs      ein Dateisystem im Arbeitsspeicher (SpeicherFs). speicher.js sichert es in IndexedDB, abgleich.js
//           gleicht es mit dem Lernheft-Ordner in OneDrive ab. Jede Änderung wird gemeldet (aufAenderung).
//   path    POSIX-Pfade ("/Lernheft/Bibliothek/…")
//   zlib    gzip über fflate (synchron, wie in Node)
//   Buffer  Uint8Array mit toString('utf8') und Buffer.from
//
// Läuft im Browser (window.LHKnoten) und in Node (für die Tests).
(function (wurzel, fabrik) {
  if (typeof module === 'object' && module.exports) module.exports = fabrik;
  else wurzel.LHKnoten = fabrik(wurzel.fflate);
})(typeof self !== 'undefined' ? self : this, function (fflate) {
  const kodierer = new TextEncoder();
  const dekodierer = new TextDecoder('utf-8');

  /* ---------- Buffer ---------- */

  class LHBuffer extends Uint8Array {
    static from(x) {
      if (typeof x === 'string') return LHBuffer.aus(kodierer.encode(x));
      if (x instanceof ArrayBuffer) return new LHBuffer(x.slice(0));
      if (ArrayBuffer.isView(x)) return LHBuffer.aus(new Uint8Array(x.buffer, x.byteOffset, x.byteLength).slice());
      if (Array.isArray(x)) return LHBuffer.aus(Uint8Array.from(x));
      throw new TypeError('Buffer.from: unbekannte Daten');
    }
    // Ohne Kopie: dieselben Bytes als LHBuffer ansehen
    static aus(u8) { return new LHBuffer(u8.buffer, u8.byteOffset, u8.byteLength); }
    static isBuffer(x) { return x instanceof LHBuffer; }
    toString() { return dekodierer.decode(this); }
  }

  const alsBytes = d => (typeof d === 'string' ? kodierer.encode(d) : d instanceof ArrayBuffer ? new Uint8Array(d) : new Uint8Array(d.buffer, d.byteOffset, d.byteLength));

  /* ---------- path (POSIX) ---------- */

  function normal(p) {
    const abs = p.startsWith('/');
    const teile = [];
    for (const t of String(p).replace(/\\/g, '/').split('/')) {
      if (!t || t === '.') continue;
      if (t === '..') { if (teile.length && teile[teile.length - 1] !== '..') teile.pop(); else if (!abs) teile.push('..'); }
      else teile.push(t);
    }
    return (abs ? '/' : '') + teile.join('/') || (abs ? '/' : '.');
  }
  const path = {
    sep: '/',
    join: (...t) => normal(t.filter(x => x !== '').join('/')),
    resolve: (...t) => { let p = ''; for (const x of t) p = String(x).startsWith('/') ? x : p + '/' + x; return normal(p.startsWith('/') ? p : '/' + p); },
    normalize: normal,
    isAbsolute: p => String(p).startsWith('/'),
    dirname: p => { const n = normal(p); const i = n.lastIndexOf('/'); return i <= 0 ? (n.startsWith('/') ? '/' : '.') : n.slice(0, i); },
    basename: (p, endung) => { const n = normal(p); let b = n.slice(n.lastIndexOf('/') + 1); if (endung && b.endsWith(endung)) b = b.slice(0, -endung.length); return b; },
    extname: p => { const b = path.basename(p); const i = b.lastIndexOf('.'); return i > 0 ? b.slice(i) : ''; },
    relative: (von, nach) => {
      const a = normal(von).split('/').filter(Boolean), b = normal(nach).split('/').filter(Boolean);
      let i = 0;
      while (i < a.length && i < b.length && a[i] === b[i]) i++;
      return [...a.slice(i).map(() => '..'), ...b.slice(i)].join('/');
    }
  };

  /* ---------- zlib ---------- */

  const zlib = {
    gzipSync: (d, opt) => LHBuffer.aus(fflate.gzipSync(alsBytes(d), { level: opt && opt.level != null ? opt.level : 6 })),
    gunzipSync: d => LHBuffer.aus(fflate.gunzipSync(alsBytes(d)))
  };

  /* ---------- Dateisystem im Arbeitsspeicher ---------- */

  function fehler(code, was, p) {
    const e = new Error(`${code}: ${was} '${p}'`);
    e.code = code;
    return e;
  }

  // Knoten: { typ: 'd' | 'f', mtimeMs, groesse, daten: Uint8Array | null, inhalt: Schlüssel im Speicher | null,
  //           fehlt: true, solange die Datei nur in OneDrive liegt (noch nicht geladen), kinder: Set (Ordner) }
  function erstelleSpeicherFs() {
    const knoten = new Map([['/', { typ: 'd', mtimeMs: Date.now(), groesse: 0, kinder: new Set() }]]);
    const hoerer = new Set();     // jede Änderung (für speicher.js und abgleich.js)
    const beobachter = new Set(); // fs.watch (ablage.js), nur Änderungen von aussen (OneDrive)
    let quelle = 'lokal';

    // Jede Änderung bekommt eine eigene, steigende Zeit: ablage.js erkennt geänderte Dateien an Zeit und Grösse
    let letzteZeit = 0;
    const zeit = () => { let t = Date.now(); if (t <= letzteZeit) t = letzteZeit + 0.001; letzteZeit = t; return t; };
    const melde = ereignis => { ereignis.quelle = quelle; for (const fn of hoerer) { try { fn(ereignis); } catch (e) { console.error('Lernheft: Speicher melden', e); } } };

    const hol = p => knoten.get(normal(p));
    function ordner(p, was) {
      const k = hol(p);
      if (!k) throw fehler('ENOENT', was, p);
      if (k.typ !== 'd') throw fehler('ENOTDIR', was, p);
      return k;
    }
    function eltern(p, was) { return ordner(path.dirname(p), was); }
    function haengeEin(p, k) {
      knoten.set(p, k);
      if (p !== '/') eltern(p, 'anlegen').kinder.add(path.basename(p));
    }
    function nimmWeg(p) {
      const k = knoten.get(p);
      if (!k) return;
      if (k.typ === 'd') for (const n of [...k.kinder]) nimmWeg(p === '/' ? '/' + n : p + '/' + n);
      knoten.delete(p);
      const e = knoten.get(path.dirname(p));
      if (e && e.kinder) e.kinder.delete(path.basename(p));
    }
    // Alle Pfade unter einem Ordner (mit ihm selbst), Eltern vor Kindern
    function unter(p) {
      const r = [];
      const geh = q => { r.push(q); const k = knoten.get(q); if (k && k.typ === 'd') for (const n of [...k.kinder].sort()) geh(q === '/' ? '/' + n : q + '/' + n); };
      if (knoten.has(p)) geh(p);
      return r;
    }
    const stat = k => ({ mtimeMs: k.mtimeMs, size: k.groesse, isDirectory: () => k.typ === 'd', isFile: () => k.typ === 'f' });

    const fs = {
      existsSync: p => knoten.has(normal(p)),
      statSync(p) { const k = hol(p); if (!k) throw fehler('ENOENT', 'stat', p); return stat(k); },
      readdirSync(p, opt) {
        const k = ordner(p, 'scandir');
        const namen = [...k.kinder].sort();
        if (!(opt && opt.withFileTypes)) return namen;
        const q = normal(p);
        return namen.map(n => { const c = knoten.get(q === '/' ? '/' + n : q + '/' + n); return { name: n, isDirectory: () => c.typ === 'd', isFile: () => c.typ === 'f' }; });
      },
      mkdirSync(p, opt) {
        const n = normal(p);
        if (knoten.has(n)) { if (opt && opt.recursive && knoten.get(n).typ === 'd') return; throw fehler('EEXIST', 'mkdir', p); }
        if (!knoten.has(path.dirname(n))) {
          if (!(opt && opt.recursive)) throw fehler('ENOENT', 'mkdir', p);
          fs.mkdirSync(path.dirname(n), { recursive: true });
        }
        haengeEin(n, { typ: 'd', mtimeMs: zeit(), groesse: 0, kinder: new Set() });
        melde({ art: 'ordner', pfad: n });
      },
      writeFileSync(p, daten) {
        const n = normal(p);
        eltern(n, 'open');
        const alt = knoten.get(n);
        if (alt && alt.typ === 'd') throw fehler('EISDIR', 'open', p);
        const bytes = alsBytes(daten).slice();
        haengeEin(n, { typ: 'f', mtimeMs: zeit(), groesse: bytes.byteLength, daten: bytes, inhalt: null, fehlt: false });
        melde({ art: 'datei', pfad: n });
      },
      readFileSync(p, enc) {
        const k = hol(p);
        if (!k) throw fehler('ENOENT', 'open', p);
        if (k.typ === 'd') throw fehler('EISDIR', 'read', p);
        // Ausgelagerte (grosse) oder noch nicht geladene Dateien gibt es nur über leseAsync
        if (!k.daten) throw fehler('ENOTLOADED', 'read', p);
        return enc ? dekodierer.decode(k.daten) : LHBuffer.aus(k.daten.slice());
      },
      renameSync(von, nach) {
        const a = normal(von), b = normal(nach);
        const k = knoten.get(a);
        if (!k) throw fehler('ENOENT', 'rename', von);
        if (a === b) return;
        eltern(b, 'rename');
        if (b.startsWith(a + '/')) throw fehler('EINVAL', 'rename', nach);
        const ziel = knoten.get(b);
        if (ziel) {
          if (k.typ === 'd' && (ziel.typ !== 'd' || ziel.kinder.size)) throw fehler('ENOTEMPTY', 'rename', nach);
          if (k.typ === 'f' && ziel.typ === 'd') throw fehler('EISDIR', 'rename', nach);
          nimmWeg(b);
        }
        // Die Knoten selbst ziehen mit (samt ihren Kinder-Listen), nur die Pfade ändern sich
        const umzug = unter(a).map(q => [q, b + q.slice(a.length), knoten.get(q)]);
        for (const [alt] of umzug) knoten.delete(alt);
        knoten.get(path.dirname(a)).kinder.delete(path.basename(a));
        for (const [, neu, kn] of umzug) knoten.set(neu, kn);
        eltern(b, 'rename').kinder.add(path.basename(b));
        melde({ art: 'umbenannt', von: a, nach: b, ordner: k.typ === 'd' });
      },
      rmSync(p, opt) {
        const n = normal(p);
        const k = knoten.get(n);
        if (!k) { if (opt && opt.force) return; throw fehler('ENOENT', 'rm', p); }
        if (k.typ === 'd' && !(opt && opt.recursive)) throw fehler('EISDIR', 'rm', p);
        nimmWeg(n);
        melde({ art: 'weg', pfad: n, ordner: k.typ === 'd' });
      },
      copyFileSync(von, nach) {
        const k = hol(von);
        if (!k) throw fehler('ENOENT', 'copyfile', von);
        if (k.typ === 'd') throw fehler('EISDIR', 'copyfile', von);
        const n = normal(nach);
        eltern(n, 'copyfile');
        if (knoten.has(n)) nimmWeg(n);
        haengeEin(n, { typ: 'f', mtimeMs: zeit(), groesse: k.groesse, daten: k.daten ? k.daten.slice() : null, inhalt: k.inhalt || null, fehlt: !!k.fehlt, quelleId: k.fehlt ? k.quelleId : undefined });
        melde({ art: 'datei', pfad: n, kopieVon: normal(von) });
      },
      cpSync(von, nach, opt) {
        const a = normal(von), b = normal(nach);
        const k = knoten.get(a);
        if (!k) throw fehler('ENOENT', 'cp', von);
        if (k.typ === 'f') return fs.copyFileSync(a, b);
        if (!(opt && opt.recursive)) throw fehler('EISDIR', 'cp', von);
        for (const q of unter(a)) {
          const ziel = b + q.slice(a.length);
          if (knoten.get(q).typ === 'd') fs.mkdirSync(ziel, { recursive: true }); else fs.copyFileSync(q, ziel);
        }
      },
      // ablage.js beobachtet Bibliothek und Daten. Gemeldet werden nur Änderungen von aussen (abgleich.js ruft
      // meldeBeobachter, nachdem es Dateien aus OneDrive übernommen hat); eigene Änderungen kennt die Ablage schon.
      watch(dir, opt, fn) {
        const b = { dir: normal(dir), fn };
        beobachter.add(b);
        return { close: () => beobachter.delete(b) };
      },

      /* ---- nur hier, nicht in Node ---- */
      knoten,
      unter,
      aufAenderung(fn) { hoerer.add(fn); return () => hoerer.delete(fn); },
      // Etwas im Auftrag von OneDrive (oder beim Laden aus dem Speicher) ändern: die Ereignisse tragen quelle = art
      alsQuelle(art, fn) { const vorher = quelle; quelle = art; try { return fn(); } finally { quelle = vorher; } },
      meldeBeobachter(pfade) {
        for (const b of beobachter) {
          const betroffen = pfade.filter(p => p === b.dir || p.startsWith(b.dir + '/'));
          if (!betroffen.length) continue;
          try { b.fn('change', path.relative(b.dir, betroffen[0])); } catch (e) { console.error('Lernheft: beobachten', e); }
        }
      },
      // Datei aus OneDrive anlegen, deren Inhalt erst später geladen wird (grosse PDFs)
      legeAnOhneInhalt(p, groesse, extra) {
        const n = normal(p);
        eltern(n, 'open');
        if (knoten.has(n)) nimmWeg(n);
        haengeEin(n, Object.assign({ typ: 'f', mtimeMs: zeit(), groesse, daten: null, inhalt: null, fehlt: true }, extra || {}));
        melde({ art: 'datei', pfad: n, ohneInhalt: true });
      },
      // Inhalt einer Datei liegt jetzt im Speicher (IndexedDB) unter schluessel, nicht mehr im Arbeitsspeicher
      lagerAus(p, schluessel, nurWenn) {
        const k = hol(p);
        if (!k || k.typ !== 'f' || (nurWenn && k.daten !== nurWenn)) return false;
        k.daten = null;
        k.inhalt = schluessel;
        k.fehlt = false;
        return true;
      },
      // Inhalt einer Datei, die bisher fehlte, ist geladen (ändert Zeit und Grösse nicht, die Ablage merkt nichts)
      fuelle(p, daten, schluessel) {
        const k = hol(p);
        if (!k || k.typ !== 'f') return false;
        if (schluessel) { k.inhalt = schluessel; k.daten = null; } else { k.daten = alsBytes(daten).slice(); k.inhalt = null; }
        k.fehlt = false;
        k.groesse = schluessel ? k.groesse : k.daten.byteLength;
        melde({ art: 'gefuellt', pfad: normal(p) });
        return true;
      },
      // Beim Start: Knoten aus dem Speicher übernehmen, ohne Ereignisse
      stelleWiederHer(eintraege) {
        const sortiert = [...eintraege].sort((x, y) => x[0].split('/').length - y[0].split('/').length);
        for (const [p, r] of sortiert) {
          if (p === '/') continue;
          if (!knoten.has(path.dirname(p))) continue;
          const k = r.typ === 'd'
            ? { typ: 'd', mtimeMs: r.mtimeMs, groesse: 0, kinder: new Set() }
            : { typ: 'f', mtimeMs: r.mtimeMs, groesse: r.groesse, daten: r.daten ? alsBytes(r.daten) : null, inhalt: r.inhalt || null, fehlt: !!r.fehlt, quelleId: r.quelleId };
          if (knoten.has(p)) nimmWeg(p);
          haengeEin(p, k);
          letzteZeit = Math.max(letzteZeit, r.mtimeMs || 0);
        }
      }
    };
    return fs;
  }

  // Für ablage.js: require('fs') usw.
  function umgebung(fs) {
    const childProcess = { execFileSync() { /* attrib gibt es hier nicht */ }, execFile(a, b, fn) { if (typeof fn === 'function') setTimeout(fn, 0); } };
    const module = { fs, path, zlib, child_process: childProcess };
    return { require: n => { if (!(n in module)) throw new Error('Nicht verfügbar: ' + n); return module[n]; }, Buffer: LHBuffer };
  }

  return { Buffer: LHBuffer, path, zlib, erstelleSpeicherFs, umgebung, normal };
});
