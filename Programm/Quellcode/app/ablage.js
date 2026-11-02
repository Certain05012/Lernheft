'use strict';
// Die Ablage des Lernhefts: alles liegt in einem Ordner auf der Festplatte, der auch in einer Cloud (OneDrive,
// Google Drive, Dropbox, iCloud) liegen darf. Nur einfache Dateien, keine Datenbank, keine Sperrdateien.
//
//   Bibliothek\            deine Ordner, genau wie in der App
//     <Ordner>\            (.lernheft-ordner.json merkt sich Farbe und Kennung)
//       <Skript>\          <Name>.pdf, Handschrift.lernheft.json (Beschreibung), Handschrift\<Seite>.lhz (die Schrift)
//       <Notizbuch>\       Handschrift.lernheft.json, Handschrift\<Seite>.lhz (+ exportierte PDFs)
//   Daten\                 app-daten.json (Fortschritt, Lernzeit), Einstellungen.json (Grössen, Farben),
//                          Whiteboard\<Datum>.lhz, Vorschaubilder, Papierkorb, Konflikte, Sicherung-Format1
//
// Die Schrift liegt je Seite in einer eigenen Datei (*.lhz = gzip-komprimiertes JSON, Aufbau in webseite\format.js):
// ändert sich eine Seite, lädt die Cloud nur diese kleine Datei hoch. Jeder Strich hat Kennung und Zeitpunkt,
// gelöschte Striche bleiben als Grabstein. Legt die Cloud bei einem Konflikt eine zweite Kopie einer Datei an
// (z. B. "Seite-PC.lhz" oder "Seite (1).lhz"), werden beide Stände zusammengeführt statt einer überschrieben.
//
// Die Webseite arbeitet mit Schlüsseln (bib:<id>, ink:<id>:<seite>, zeit:<id>, einst:…, …). Hier werden sie
// auf Ordner und Dateien abgebildet. Änderungen von aussen (Explorer, Cloud) werden erkannt und an die Webseite gemeldet.
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const DOK_DATEI = 'Handschrift.lernheft.json';
const SEITEN_ORDNER = 'Handschrift';
const ENDUNG = '.lhz';
const ORDNER_DATEI = '.lernheft-ordner.json';
const HINWEIS = 'Beschreibung dieses Skripts oder Notizbuchs (Name, Papier, Lernzeit, Seitenliste). Die Handschrift liegt je Seite ' +
  'als komprimierte Datei im Ordner "Handschrift" (*.lhz = gzip-JSON, Einheit: Pixel bei 100 % Zoom, A4 = 794 x 1123). ' +
  'Der Ordner kann kopiert, gesichert und in einen anderen Lernheft-Ordner gelegt werden.';

const neueId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const sauber = s => String(s || '').replace(/[\\/:*?"<>|\x00-\x1f]+/g, '-').replace(/[. ]+$/, '').trim().slice(0, 100) || 'Unbenannt';
const istExport = f => /\(mit Notizen\)\.pdf$/i.test(f);
const dateiName = sid => String(sid).replace(/[^A-Za-z0-9]/g, '') || 'x';
const hatGrabsteine = x => !!x && Object.keys(x).length > 0;
const istLeer = inh => !inh || (!(inh.e && inh.e.length) && !hatGrabsteine(inh.x));

// Gleiche Inhalte gleich darstellen, egal in welcher Reihenfolge die Felder stehen
function stabil(v) {
  if (Array.isArray(v)) return '[' + v.map(stabil).join(',') + ']';
  if (v && typeof v === 'object') return '{' + Object.keys(v).sort().filter(k => v[k] !== undefined).map(k => JSON.stringify(k) + ':' + stabil(v[k])).join(',') + '}';
  return JSON.stringify(v);
}

// Lesbar, aber kompakt
const metaAlsText = m => JSON.stringify(m, null, 2) + '\n';

// Alte Dateien (Version 1): alle Seiten mit allen Elementen in einer Textdatei
function dokAlsTextAlt(d) {
  const { seiten, ...kopf } = d;
  const oben = JSON.stringify(kopf, null, 2).replace(/\n}$/, '');
  const s = (seiten || []).map(x => `    { "id": ${JSON.stringify(x.id)}, "elemente": [${x.elemente.length ? '\n' + x.elemente.map(e => '      ' + JSON.stringify(e)).join(',\n') + '\n    ' : ''}] }`).join(',\n');
  return `${oben},\n  "seiten": [${s ? '\n' + s + '\n  ' : ''}]\n}\n`;
}

// lokalDatei: Datei im Profil des Geräts für Einstellungen, die nicht in den Speicherort gehören
function erstelleAblage({ wurzel, altDaten, melde, format, lokalDatei }) {
  const F = format;
  const BIB = path.join(wurzel, 'Bibliothek');
  const DATEN = path.join(wurzel, 'Daten');
  const VORSCHAU = path.join(DATEN, 'Vorschaubilder');
  const EINGANG = path.join(DATEN, 'Eingang');
  const PAPIERKORB = path.join(DATEN, 'Papierkorb');
  const WHITEBOARD = path.join(DATEN, 'Whiteboard');
  const KONFLIKTE = path.join(DATEN, 'Konflikte');
  const SICHERUNG_V1 = path.join(DATEN, 'Sicherung-Format1');
  const APP_DATEI = path.join(DATEN, 'app-daten.json');
  const EINST_DATEI = path.join(DATEN, 'Einstellungen.json');
  const LOKAL_DATEI = lokalDatei || path.join(wurzel, 'lokal-daten.json');
  for (const d of [BIB, DATEN, VORSCHAU, EINGANG, PAPIERKORB, WHITEBOARD]) fs.mkdirSync(d, { recursive: true });

  let kv = {};                   // Schlüssel -> Eintrag { v, zeit, basis, dirty, weg }
  const kvSig = new Map();       // Schlüssel der Handschrift -> Kennzeichen der Datei (Änderungszeit:Grösse)
  let index = new Map();         // id -> { art, dir }
  let docs = new Map();          // id -> { meta, seiten: Map(seite -> { e, x }), dir }
  const wartendeInk = new Map(); // Handschrift für Dokumente, deren Ordner noch nicht angelegt ist
  const cache = new Map();       // Dateipfad -> { sig, wert }: unveränderte Dateien werden nicht noch einmal gelesen
  const seitenZuSchreiben = new Set(), metaZuSchreiben = new Set();
  let schreibTimer = null, appTimer = null, einstTimer = null, lokalTimer = null;
  let ruheBis = 0;
  const zaehler = { zusammengefuehrt: 0, migriert: 0 };

  const eintrag = v => ({ v, zeit: Date.now(), basis: null, dirty: false, weg: false });
  const still = () => { ruheBis = Date.now() + 1500; };
  const sigVon = p => { try { const s = fs.statSync(p); return s.mtimeMs + ':' + s.size; } catch (e) { return null; } };

  function leseJson(p) { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch (e) { return null; } }
  // Atomar schreiben: erst in eine Nebendatei, dann umbenennen. So entsteht nie eine halbe Datei.
  function schreibeAtomar(p, daten) {
    still();
    const tmp = p + '.tmp';
    fs.writeFileSync(tmp, daten);
    fs.renameSync(tmp, p);
  }
  // Kleine Merkdatei pro Ordner (Farbe, Kennung), im Explorer versteckt
  function schreibeOrdnerInfo(p, m) {
    if (fs.existsSync(p)) { try { require('child_process').execFileSync('attrib', ['-h', p]); } catch (e) { /* egal */ } }
    schreibeAtomar(p, JSON.stringify(m, null, 2));
    require('child_process').execFile('attrib', ['+h', p], () => {});
  }

  function einzigartig(eltern, name, ausser) {
    let n = sauber(name), i = 2;
    while (fs.existsSync(path.join(eltern, n)) && path.join(eltern, n) !== ausser) n = `${sauber(name)} (${i++})`;
    return path.join(eltern, n);
  }

  /* ---------- Seiten-Dateien (*.lhz) ---------- */

  // Vor dem Überschreiben bleibt die vorige Fassung einer Seite als Kopie in Daten\Sicherung-Seiten liegen (höchstens
  // alle 10 Minuten je Seite, nur wenn die Datei lesbar ist). Geht beim Schreiben oder durch einen Fehler etwas schief,
  // ist der Stand von vor einigen Minuten noch da. Die Sicherung darf das Speichern nie verhindern.
  const SICHERUNG_SEITEN = path.join(DATEN, 'Sicherung-Seiten');
  const letzteSicherung = new Map();
  function sichereVorgaenger(p) {
    try {
      const jetzt = Date.now();
      if (jetzt - (letzteSicherung.get(p) || 0) < 10 * 60e3 || !fs.existsSync(p)) return;
      const roh = fs.readFileSync(p);
      zlib.gunzipSync(roh);
      fs.mkdirSync(SICHERUNG_SEITEN, { recursive: true });
      const ziel = path.join(SICHERUNG_SEITEN, path.relative(wurzel, p).split(path.sep).map(sauber).join(' - '));
      fs.writeFileSync(ziel + '.tmp', roh);
      fs.renameSync(ziel + '.tmp', ziel);
      letzteSicherung.set(p, jetzt);
    } catch (e) { /* kein Backup, geschrieben wird trotzdem */ }
  }

  function schreibeSeitenDatei(p, id, inhalt) {
    fs.mkdirSync(path.dirname(p), { recursive: true });
    sichereVorgaenger(p);
    // Stufe 6: knapp ein Prozent grösser als Stufe 9, aber fast doppelt so schnell (wird nach jedem Strich geschrieben)
    schreibeAtomar(p, zlib.gzipSync(Buffer.from(F.kodiereSeite(id, inhalt)), { level: 6 }));
    cache.set(p, { sig: sigVon(p), wert: inhalt });
  }
  // null, wenn es die Datei nicht gibt oder sie (noch) nicht lesbar ist, z. B. weil die Cloud sie gerade erst lädt
  function liesSeitenDatei(p) {
    const s = sigVon(p);
    if (!s) return null;
    const c = cache.get(p);
    if (c && c.sig === s) return c.wert;
    try {
      const w = F.dekodiereSeite(zlib.gunzipSync(fs.readFileSync(p)).toString('utf8'));
      cache.set(p, { sig: s, wert: w });
      return w;
    } catch (e) { return null; }
  }
  function liesMeta(p) {
    const s = sigVon(p);
    if (!s) return null;
    const c = cache.get(p);
    if (c && c.sig === s) return JSON.parse(JSON.stringify(c.wert));
    const w = leseJson(p);
    if (w) cache.set(p, { sig: s, wert: JSON.parse(JSON.stringify(w)) });
    return w;
  }

  // Eine Konfliktkopie der Cloud ist zusammengeführt: sie wandert in Daten\Konflikte (nicht gelöscht)
  function inKonflikte(p, bezug) {
    try {
      const ziel = einzigartig(path.join(KONFLIKTE, new Date().toISOString().slice(0, 10), sauber(bezug)), path.basename(p));
      fs.mkdirSync(path.dirname(ziel), { recursive: true });
      still();
      try { fs.renameSync(p, ziel); } catch (e) { fs.copyFileSync(p, ziel); fs.rmSync(p, { force: true }); }
    } catch (e) { console.error('Lernheft: Konfliktkopie ablegen', p, e); }
  }

  // Alle Seiten-Dateien eines Ordners. muster trennt den Namen der Seite von einem Zusatz, den die Cloud bei einer
  // Konfliktkopie anhängt. Gibt Map Seite -> { inhalt, sig } zurück; spaeter: etwas war noch nicht lesbar.
  function ladeSeiten(dir, muster, bezug) {
    const ergebnis = new Map();
    let spaeter = false, namen = [];
    try { namen = fs.readdirSync(dir); } catch (e) { return { ergebnis, spaeter }; }
    const gruppen = new Map();
    for (const f of namen) {
      if (!f.toLowerCase().endsWith(ENDUNG)) continue;
      const m = muster.exec(f.slice(0, -ENDUNG.length));
      if (!m) continue;
      const g = gruppen.get(m[1]) || gruppen.set(m[1], { haupt: null, konflikte: [] }).get(m[1]);
      if (m[2] === '') g.haupt = f; else g.konflikte.push(f);
    }
    for (const [id, g] of gruppen) {
      let p = g.haupt ? path.join(dir, g.haupt) : null;
      let seite = p ? liesSeitenDatei(p) : null;
      const gelesen = [];
      for (const k of g.konflikte) {
        const kp = path.join(dir, k), s = liesSeitenDatei(kp);
        if (s) gelesen.push([kp, s]); else spaeter = true;
      }
      // Zusammenführen nur, wenn die Hauptdatei fehlt oder lesbar ist (sonst wird sie vielleicht gerade noch geladen)
      if (gelesen.length && (!p || seite)) {
        let m = seite;
        for (const [, s] of gelesen) m = m ? F.fuehreSeiteZusammen(m, s) : s;
        try {
          p = p || path.join(dir, id + ENDUNG);
          if (!seite || !F.gleicheSeite(m, seite)) schreibeSeitenDatei(p, id, m);
          for (const [kp] of gelesen) inKonflikte(kp, bezug);
          zaehler.zusammengefuehrt += gelesen.length;
          seite = m;
        } catch (e) { console.error('Lernheft: Konflikt zusammenführen', p, e); spaeter = true; }
      } else if (p && !seite) spaeter = true;
      if (seite && p) ergebnis.set(id, { inhalt: seite, sig: sigVon(p) });
    }
    return { ergebnis, spaeter };
  }

  const MUSTER_SEITE = /^([A-Za-z0-9]+)([\s\S]*)$/;
  const MUSTER_TAG = /^(\d{4}-\d{2}-\d{2})([\s\S]*)$/;

  /* ---------- Dokumente: Beschreibung + Seiten ---------- */

  function neuesDok(art, id, eig) {
    const m = { lernheft: 2, hinweis: HINWEIS, id, art, eigenschaften: eig || {}, statistik: {}, geaendert: Date.now() };
    if (art === 'notizbuch') m.seiten = [];
    return m;
  }

  function metaSchreibenJetzt(id) {
    const d = docs.get(id);
    if (!d || !fs.existsSync(d.dir)) return;
    // Noch im alten Format gelesen: erst alle Seiten neu schreiben, bevor die alte Datei ersetzt wird
    if (d.roh) {
      for (const [sid, inh] of d.seiten) if (!istLeer(inh)) schreibeSeitenDatei(path.join(d.dir, SEITEN_ORDNER, dateiName(sid) + ENDUNG), sid, inh);
      d.roh = false;
    }
    const p = path.join(d.dir, DOK_DATEI);
    // Von aussen geändert, seit wir sie kannten: zusammenführen (jüngere Fassung, Lernzeiten und Seiten vereint)
    const jetzt = sigVon(p);
    if (d.metaSig && jetzt && jetzt !== d.metaSig) {
      const extern = liesMeta(p);
      if (extern && extern.lernheft >= 2 && extern.id === d.meta.id) { d.meta = F.fuehreMetaZusammen(d.meta, extern); planeEinlesen(400); }
    }
    schreibeAtomar(p, metaAlsText(d.meta));
    d.metaSig = sigVon(p);
  }
  function seiteSchreibenJetzt(id, sid) {
    const d = docs.get(id);
    if (!d || !fs.existsSync(d.dir)) return;
    const p = path.join(d.dir, SEITEN_ORDNER, dateiName(sid) + ENDUNG);
    const key = 'ink:' + id + ':' + sid;
    let inh = d.seiten.get(sid);
    // Hat die Cloud die Datei geändert, seit wir sie kannten? Dann nicht überschreiben, sondern zusammenführen:
    // nichts vom anderen Gerät geht verloren, und die Webseite bekommt den gemeinsamen Stand gemeldet.
    const bekannt = kvSig.get(key), jetzt = sigVon(p);
    if (bekannt && jetzt && jetzt !== bekannt) {
      const extern = liesSeitenDatei(p);
      if (extern) {
        const m = F.fuehreSeiteZusammen(inh || { e: [] }, extern);
        if (!inh || !F.gleicheSeite(m, inh)) { inh = m; d.seiten.set(sid, m); kv[key] = eintrag(m); nachMelden[key] = kv[key]; zaehler.zusammengefuehrt++; }
      }
    }
    if (istLeer(inh)) { cache.delete(p); try { still(); fs.rmSync(p, { force: true }); } catch (e) { /* egal */ } kvSig.delete(key); return; }
    schreibeSeitenDatei(p, sid, inh);
    kvSig.set(key, sigVon(p));
  }
  function dokSeiteMerken(id, sid) {
    seitenZuSchreiben.add(id + '\u0000' + sid);
    plane();
  }
  function dokMetaMerken(id) {
    metaZuSchreiben.add(id);
    plane();
  }
  // Kurz gesammelt schreiben: Änderungen, die direkt aufeinander folgen, werden zu einem Schreibvorgang. Danach geht es
  // sofort auf die Platte (die Oberfläche hat selbst schon nur kurz gewartet), so geht bei einem Absturz höchstens der
  // Strich verloren, der gerade geschrieben wird.
  function plane() { if (!schreibTimer) schreibTimer = setTimeout(allesSchreiben, 200); }
  let nachMelden = {};   // Stände, die beim Schreiben mit einer Änderung von aussen zusammengeführt wurden
  function allesSchreiben() {
    clearTimeout(schreibTimer);
    schreibTimer = null;
    const seiten = [...seitenZuSchreiben], metas = [...metaZuSchreiben];
    seitenZuSchreiben.clear(); metaZuSchreiben.clear();
    for (const s of seiten) { const [id, sid] = s.split('\u0000'); try { seiteSchreibenJetzt(id, sid); } catch (e) { console.error('Lernheft: Seite speichern', id, sid, e); } }
    for (const id of metas) { try { metaSchreibenJetzt(id); } catch (e) { console.error('Lernheft: speichern', id, e); } }
    if (appTimer) appSchreibenJetzt();
    if (einstTimer) einstSchreibenJetzt();
    if (lokalTimer) lokalSchreibenJetzt();
    if (Object.keys(nachMelden).length) { const a = nachMelden; nachMelden = {}; melde(a); }
  }

  // Dokument aus einer alten Datei (Version 1, alle Seiten in einer Textdatei) in das neue Format übertragen.
  // Die alte Datei wird vorher gesichert und erst ersetzt, wenn alle Seiten neu geschrieben und wieder lesbar sind.
  function migriereAlt(dir, alt) {
    const seitenAlt = (alt.seiten || []).filter(s => s && typeof s === 'object');
    const p = path.join(dir, DOK_DATEI);
    fs.mkdirSync(SICHERUNG_V1, { recursive: true });
    const sicherung = path.join(SICHERUNG_V1, `${sauber(alt.id || path.basename(dir))}-${sauber(path.basename(dir))}.json`);
    if (!fs.existsSync(sicherung)) fs.copyFileSync(p, sicherung);
    const seiten = new Map();
    for (const s of seitenAlt) {
      const inh = { e: F.ergaenzeIds(Array.isArray(s.elemente) ? s.elemente : []) };
      seiten.set(s.id, inh);
      if (!inh.e.length) continue;
      const sp = path.join(dir, SEITEN_ORDNER, dateiName(s.id) + ENDUNG);
      schreibeSeitenDatei(sp, s.id, inh);
      cache.delete(sp);
      const zurueck = liesSeitenDatei(sp);
      if (!zurueck || zurueck.e.length !== inh.e.length) throw new Error('Seite ' + s.id + ' liess sich nicht prüfen');
      seiten.set(s.id, zurueck);
    }
    const meta = { lernheft: 2, hinweis: HINWEIS, id: alt.id, art: alt.art, eigenschaften: alt.eigenschaften || {}, statistik: alt.statistik || {}, geaendert: Date.now() };
    if (alt.pdf) meta.pdf = alt.pdf;
    if (alt.art === 'notizbuch') meta.seiten = seitenAlt.map(s => s.id);
    schreibeAtomar(p, metaAlsText(meta));
    zaehler.migriert++;
    return { meta, seiten };
  }

  // Aus einer Dokument-Datei die Einträge für die Webseite bauen
  function eintraegeAusDok(doc, dir, elternId, ziel, sigs) {
    const m = doc.meta, name = path.basename(dir);
    const eig = Object.assign({}, m.eigenschaften || {});
    let item;
    if (m.art === 'skript') {
      const pdfPfad = path.join(dir, m.pdf || '');
      let groesse = eig.groesse || 0;
      try { groesse = fs.statSync(pdfPfad).size; } catch (e) { /* fehlt */ }
      item = Object.assign({ modus: 'original', hell: null, seiten: 0, seite: 1, favorit: false, erstellt: 0, geoeffnet: 0 }, eig,
        { art: 'skript', name, eltern: elternId, datei: m.id, groesse });
    } else {
      item = Object.assign({ format: 'A4', papier: 'karo', farbe: 'blau', seite: 1, favorit: false, erstellt: 0, geoeffnet: 0 }, eig,
        { art: 'notizbuch', name, eltern: elternId, seiten: (m.seiten || []).slice() });
      if (!item.seiten.length) item.seiten = ['s1'];
    }
    ziel['bib:' + m.id] = item;
    for (const [sid, inh] of doc.seiten) {
      if (istLeer(inh)) continue;
      const k = 'ink:' + m.id + ':' + sid;
      ziel[k] = inh;
      sigs[k] = doc.sigs.get(sid);
    }
    if (m.statistik && Object.keys(m.statistik).length) ziel['zeit:' + m.id] = m.statistik;
  }

  /* ---------- Einlesen des Ordners ---------- */

  const KONFLIKT_META = /^Handschrift\.lernheft(.+)\.json$/;

  function scanne() {
    const neu = {}, sigs = {};
    const idx = new Map();
    const neueDocs = new Map();
    const gesehen = new Set();
    let spaeterNochmal = false;

    function leseDok(dir, elternId) {
      const p = path.join(dir, DOK_DATEI);
      let d = liesMeta(p);
      if (!d || typeof d !== 'object' || (d.art !== 'skript' && d.art !== 'notizbuch')) return false;
      let geaendert = false, seiten = null, sigsDok = new Map(), roh = false;

      // Konfliktkopien der Beschreibung (Cloud) zusammenführen
      let namen = [];
      try { namen = fs.readdirSync(dir); } catch (e) { /* weg */ }
      const konflikte = namen.filter(f => KONFLIKT_META.test(f) && !/\.tmp$/.test(f));
      if (konflikte.length && d.lernheft >= 2) {
        for (const k of konflikte) {
          const kp = path.join(dir, k), k2 = leseJson(kp);
          if (!k2 || k2.id !== d.id || k2.lernheft < 2) { if (!k2) spaeterNochmal = true; continue; }
          d = F.fuehreMetaZusammen(d, k2);
          inKonflikte(kp, path.basename(dir));
          zaehler.zusammengefuehrt++;
          geaendert = true;
        }
      }
      // Alte Datei: ins neue Format übertragen
      if (!(d.lernheft >= 2)) {
        try { const r = migriereAlt(dir, d); d = r.meta; seiten = r.seiten; cache.delete(p); }
        catch (e) {
          console.error('Lernheft: Format übertragen', dir, e);
          // Notlösung: die Datei so lesen, wie sie ist, die alte Datei bleibt unangetastet (auch eine Sicherung liegt vor)
          roh = true;
          seiten = new Map((d.seiten || []).map(s => [s.id, { e: F.ergaenzeIds(s.elemente || []) }]));
          d = { lernheft: 2, id: d.id, art: d.art, eigenschaften: d.eigenschaften || {}, statistik: d.statistik || {}, pdf: d.pdf, seiten: d.art === 'notizbuch' ? (d.seiten || []).map(s => s.id) : undefined, geaendert: 0 };
        }
      }
      // Kopierter Ordner: bekommt eine eigene Kennung
      if (!d.id || gesehen.has(d.id)) { d.id = neueId(); geaendert = true; }
      gesehen.add(d.id);
      if (d.art === 'skript' && (!d.pdf || !fs.existsSync(path.join(dir, d.pdf)))) {
        const pdf = namen.find(f => /\.pdf$/i.test(f) && !istExport(f));
        if (pdf) { d.pdf = pdf; geaendert = true; }
      }
      if (d.art === 'notizbuch' && (!Array.isArray(d.seiten) || !d.seiten.length)) { d.seiten = ['s1']; geaendert = true; }
      if (d.seitenWeg) {
        const vorher = (d.seiten || []).length;
        d.seiten = (d.seiten || []).filter(s => !d.seitenWeg[s]);
        if (d.seiten.length !== vorher) geaendert = true;
      }

      if (!seiten) {
        const r = ladeSeiten(path.join(dir, SEITEN_ORDNER), MUSTER_SEITE, path.basename(dir));
        seiten = new Map([...r.ergebnis].map(([sid, w]) => [sid, w.inhalt]));
        for (const [sid, w] of r.ergebnis) sigsDok.set(sid, w.sig);
        if (r.spaeter) spaeterNochmal = true;
      } else {
        for (const sid of seiten.keys()) sigsDok.set(sid, sigVon(path.join(dir, SEITEN_ORDNER, dateiName(sid) + ENDUNG)));
      }
      if (geaendert && !roh) { d.geaendert = Date.now(); try { schreibeAtomar(p, metaAlsText(d)); cache.delete(p); } catch (e) { console.error('Lernheft: Beschreibung speichern', dir, e); } }
      idx.set(d.id, { art: d.art, dir });
      const doc = { meta: d, seiten, dir, sigs: sigsDok, roh, metaSig: sigVon(p) };
      neueDocs.set(d.id, doc);
      eintraegeAusDok(doc, dir, elternId, neu, sigs);
      return true;
    }

    function geh(dir, elternId) {
      let liste;
      try { liste = fs.readdirSync(dir, { withFileTypes: true }); } catch (e) { return; }
      for (const e of liste) {
        if (!e.isDirectory() || e.name.startsWith('.')) continue;
        const p = path.join(dir, e.name);
        if (fs.existsSync(path.join(p, DOK_DATEI))) { if (leseDok(p, elternId)) continue; }
        // Ein normaler Ordner
        const mp = path.join(p, ORDNER_DATEI);
        let m = leseJson(mp);
        if (!m || !m.id || gesehen.has(m.id)) {
          m = Object.assign({ farbe: 'blau', erstellt: Date.now() }, m || {}, { id: neueId() });
          try { schreibeOrdnerInfo(mp, m); } catch (err) { /* schreibgeschützt */ }
        }
        gesehen.add(m.id);
        idx.set(m.id, { art: 'ordner', dir: p });
        neu['bib:' + m.id] = { art: 'ordner', name: e.name, eltern: elternId, farbe: m.farbe || 'blau', erstellt: m.erstellt || 0 };
        geh(p, m.id);
      }
      // Lose PDFs werden zu eigenen Skripten (in einem Unterordner mit gleichem Namen)
      for (const e of liste) {
        if (!e.isFile() || !/\.pdf$/i.test(e.name)) continue;
        const quelle = path.join(dir, e.name);
        let st;
        try { st = fs.statSync(quelle); } catch (err) { continue; }
        if (Date.now() - st.mtimeMs < 3000) { spaeterNochmal = true; continue; }   // wird evtl. noch kopiert
        try {
          const name = e.name.replace(/\.pdf$/i, '');
          const ziel = einzigartig(dir, name);
          still();
          fs.mkdirSync(ziel);
          fs.renameSync(quelle, path.join(ziel, sauber(name) + '.pdf'));
          const d = neuesDok('skript', neueId(), { erstellt: Date.now(), geoeffnet: 0, modus: 'original', hell: null, seiten: 0, seite: 1, favorit: false });
          d.pdf = sauber(name) + '.pdf';
          schreibeAtomar(path.join(ziel, DOK_DATEI), metaAlsText(d));
          leseDok(ziel, elternId);
        } catch (err) { console.error('Lernheft: PDF übernehmen', quelle, err); }
      }
    }

    geh(BIB, null);
    return { neu, sigs, idx, neueDocs, spaeterNochmal };
  }

  // Einlesen und mit dem bisherigen Stand vergleichen; Unterschiede gehen an die Webseite
  let scanTimer = null;
  function neuEinlesen() {
    clearTimeout(scanTimer);
    scanTimer = null;
    allesSchreiben();
    const { neu, sigs, idx, neueDocs, spaeterNochmal } = scanne();
    const aenderungen = {};
    const istBib = k => k.startsWith('bib:') || k.startsWith('ink:') || (k.startsWith('zeit:') && k !== 'zeit:app');
    for (const [k, v] of Object.entries(neu)) {
      // Die Handschrift wird am Kennzeichen der Datei erkannt (Änderungszeit und Grösse), nicht am Inhalt
      const geaendert = !kv[k] || (k.startsWith('ink:') ? kvSig.get(k) !== sigs[k] : stabil(kv[k].v) !== stabil(v));
      if (!geaendert) continue;
      kv[k] = eintrag(v);
      if (k.startsWith('ink:')) kvSig.set(k, sigs[k]);
      aenderungen[k] = kv[k];
    }
    for (const k of Object.keys(kv)) if (istBib(k) && !(k in neu)) { delete kv[k]; kvSig.delete(k); aenderungen[k] = null; }
    index = idx;
    docs = neueDocs;
    if (Object.keys(aenderungen).length) melde(aenderungen);
    if (spaeterNochmal) planeEinlesen(3500);
  }
  function planeEinlesen(ms) {
    clearTimeout(scanTimer);
    scanTimer = setTimeout(neuEinlesen, Math.max(ms || 900, ruheBis - Date.now() + 300));
  }

  /* ---------- Übrige Daten: Fortschritt, Einstellungen, Whiteboard ---------- */

  // Was am Gerät hängt (Fensteraufteilung, Ansicht, Stift-Treiber, Design) bleibt in dessen Profil und kommt nie in die Cloud
  const istLokalKey = k => k.startsWith('lokal:');
  const istApp = k => !(istLokalKey(k) || k.startsWith('bib:') || k.startsWith('ink:') || k.startsWith('notiz:tag:') || k.startsWith('einst:') || (k.startsWith('zeit:') && k !== 'zeit:app'));

  // Fortschritt und Lernzeit. Vor dem Schreiben mit der Datei vereinen, falls ein anderes Gerät sie geändert hat.
  function appSchreibenJetzt() {
    clearTimeout(appTimer);
    appTimer = null;
    const o = {};
    for (const [k, e] of Object.entries(kv)) if (istApp(k)) o[k] = e.v;
    const extern = leseJson(APP_DATEI);
    let ergebnis = o;
    if (extern && typeof extern === 'object') {
      ergebnis = F.fuehreAppDatenZusammen(o, extern);
      for (const k of Object.keys(ergebnis)) {
        if (!istApp(k) || (kv[k] && stabil(kv[k].v) === stabil(ergebnis[k]))) continue;
        kv[k] = eintrag(ergebnis[k]);
        nachMelden[k] = kv[k];
      }
    }
    for (const k of Object.keys(ergebnis)) if (!istApp(k)) delete ergebnis[k];
    schreibeAtomar(APP_DATEI, JSON.stringify(ergebnis, null, 1));
  }
  const appSchreiben = () => { if (!appTimer) appTimer = setTimeout(appSchreibenJetzt, 1500); };

  // Geräte-Einstellungen in der Datei im Profil des Geräts
  function lokalSchreibenJetzt() {
    clearTimeout(lokalTimer);
    lokalTimer = null;
    const o = {};
    for (const [k, e] of Object.entries(kv)) if (istLokalKey(k)) o[k] = e.v;
    try { fs.mkdirSync(path.dirname(LOKAL_DATEI), { recursive: true }); schreibeAtomar(LOKAL_DATEI, JSON.stringify(o, null, 1)); } catch (e) { console.error('Lernheft: Geräte-Einstellungen speichern', e); }
  }
  const lokalSchreiben = () => { if (!lokalTimer) lokalTimer = setTimeout(lokalSchreibenJetzt, 800); };

  // Gemeinsame Einstellungen (Datei Einstellungen.json): je Schlüssel Wert und Zeitpunkt der Änderung
  const einstZeit = new Map();
  function einstSchreibenJetzt() {
    clearTimeout(einstTimer);
    einstTimer = null;
    const eintraege = {};
    for (const [k, e] of Object.entries(kv)) if (k.startsWith('einst:')) eintraege[k] = { v: e.v, m: einstZeit.get(k) || e.zeit || Date.now() };
    // Hat ein anderes Gerät inzwischen etwas Neueres gespeichert, gilt je Schlüssel die jüngere Fassung
    const extern = leseJson(EINST_DATEI);
    let ergebnis = eintraege;
    if (extern && extern.eintraege) {
      ergebnis = F.fuehreEinstellungenZusammen(eintraege, extern.eintraege);
      for (const [k, r] of Object.entries(ergebnis)) {
        if (!k.startsWith('einst:') || r === eintraege[k]) continue;
        einstZeit.set(k, r.m || 0);
        kv[k] = eintrag(r.v);
        nachMelden[k] = kv[k];
      }
    }
    schreibeAtomar(EINST_DATEI, JSON.stringify({ lernheft: 2, art: 'einstellungen', hinweis: 'Einstellungen, die auf allen Geräten gleich sein sollen.', eintraege: ergebnis }, null, 1));
  }
  const einstSchreiben = () => { if (!einstTimer) einstTimer = setTimeout(einstSchreibenJetzt, 1500); };

  const whiteboardPfad = datum => path.join(WHITEBOARD, sauber(datum) + ENDUNG);
  function whiteboardSchreiben(datum, v) {
    const p = whiteboardPfad(datum);
    if (istLeer(v)) { cache.delete(p); kvSig.delete('notiz:tag:' + datum); still(); fs.rmSync(p, { force: true }); return; }
    schreibeSeitenDatei(p, datum, { e: v.e || [], x: v.x });
    kvSig.set('notiz:tag:' + datum, sigVon(p));
  }

  // Liest Datei mit Konfliktkopien (z. B. "app-daten (1).json"); gibt Wert oder null
  function leseMitKonflikten(datei, muster, vereine) {
    let wert = leseJson(datei);
    let namen = [];
    try { namen = fs.readdirSync(path.dirname(datei)); } catch (e) { return wert; }
    if (!wert) return wert;
    for (const f of namen) {
      if (!muster.test(f) || /\.tmp$/.test(f)) continue;
      const kp = path.join(path.dirname(datei), f), k = leseJson(kp);
      if (!k) continue;
      wert = vereine(wert, k);
      inKonflikte(kp, 'Daten');
      zaehler.zusammengefuehrt++;
      try { schreibeAtomar(datei, JSON.stringify(wert, null, 1)); } catch (e) { /* egal */ }
    }
    return wert;
  }

  function ladeDatenDateien(erstesMal) {
    const aenderungen = {};
    const setzeWenn = (k, v, sig) => {
      const alt = kv[k];
      if (alt && (sig ? kvSig.get(k) === sig : stabil(alt.v) === stabil(v))) return;
      kv[k] = eintrag(v);
      if (sig) kvSig.set(k, sig);
      aenderungen[k] = kv[k];
    };
    // Fortschritt und Lernzeit
    const app = leseMitKonflikten(APP_DATEI, /^app-daten(.+)\.json$/, (a, b) => F.fuehreAppDatenZusammen(a, b)) || {};
    for (const [k, v] of Object.entries(app)) if (istApp(k)) setzeWenn(k, v);
    // Gemeinsame Einstellungen
    const e = leseMitKonflikten(EINST_DATEI, /^Einstellungen(.+)\.json$/, (a, b) => Object.assign({}, a, { eintraege: F.fuehreEinstellungenZusammen(a.eintraege, b.eintraege) }));
    if (e && e.eintraege) for (const [k, r] of Object.entries(e.eintraege)) {
      if (!k.startsWith('einst:') || !r) continue;
      einstZeit.set(k, r.m || 0);
      setzeWenn(k, r.v);
    }
    // Whiteboard: eine Datei pro Tag
    const w = ladeSeiten(WHITEBOARD, MUSTER_TAG, 'Whiteboard');
    for (const [datum, r] of w.ergebnis) setzeWenn('notiz:tag:' + datum, r.inhalt, r.sig);
    // Whiteboard aus der alten Version (<Datum>.json)
    let alte = [];
    try { alte = fs.readdirSync(WHITEBOARD).filter(f => /^\d{4}-\d{2}-\d{2}\.json$/.test(f)); } catch (err) { /* keins */ }
    for (const f of alte) {
      const datum = f.slice(0, -5);
      if (w.ergebnis.has(datum)) continue;
      const j = leseJson(path.join(WHITEBOARD, f));
      if (!j || !Array.isArray(j.elemente)) continue;
      try {
        const inh = { e: F.ergaenzeIds(j.elemente) };
        schreibeSeitenDatei(whiteboardPfad(datum), datum, inh);
        fs.renameSync(path.join(WHITEBOARD, f), path.join(WHITEBOARD, f + '.v1'));
        zaehler.migriert++;
        setzeWenn('notiz:tag:' + datum, inh, sigVon(whiteboardPfad(datum)));
      } catch (err) { console.error('Lernheft: Whiteboard übertragen', f, err); }
    }
    if (!erstesMal) {
      // Tage, deren Datei verschwunden ist
      for (const k of Object.keys(kv)) if (k.startsWith('notiz:tag:') && !w.ergebnis.has(k.slice(10)) && !fs.existsSync(whiteboardPfad(k.slice(10)))) { delete kv[k]; kvSig.delete(k); aenderungen[k] = null; }
    }
    return { aenderungen, spaeter: w.spaeter };
  }

  let datenTimer = null;
  function neuEinlesenDaten() {
    clearTimeout(datenTimer);
    datenTimer = null;
    allesSchreiben();
    const { aenderungen, spaeter } = ladeDatenDateien(false);
    if (Object.keys(aenderungen).length) melde(aenderungen);
    if (spaeter) planeDatenEinlesen(3500);
  }
  function planeDatenEinlesen(ms) {
    clearTimeout(datenTimer);
    datenTimer = setTimeout(neuEinlesenDaten, Math.max(ms || 900, ruheBis - Date.now() + 300));
  }

  /* ---------- Änderungen der Webseite ---------- */

  function ordnerVon(id) { const e = id && index.get(id); return e && e.art === 'ordner' && fs.existsSync(e.dir) ? e.dir : BIB; }

  // Pfade unter einem verschobenen Ordner nachziehen
  function pfadeNachziehen(alt, neu) {
    const ziehe = p => (p === alt ? neu : p.startsWith(alt + path.sep) ? neu + p.slice(alt.length) : p);
    for (const e of index.values()) e.dir = ziehe(e.dir);
    for (const d of docs.values()) d.dir = ziehe(d.dir);
    for (const k of [...cache.keys()]) if (k === alt || k.startsWith(alt + path.sep)) cache.delete(k);
  }

  function inPapierkorb(dir) {
    if (!fs.existsSync(dir)) return;
    const stempel = new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-');
    const ziel = einzigartig(PAPIERKORB, `${stempel} ${path.basename(dir)}`);
    still();
    try { fs.renameSync(dir, ziel); } catch (e) { fs.cpSync(dir, ziel, { recursive: true }); fs.rmSync(dir, { recursive: true, force: true }); }
  }

  function pdfQuelle(datei) {
    const e = index.get(datei), d = docs.get(datei);
    if (e && d && d.meta.pdf && fs.existsSync(path.join(e.dir, d.meta.pdf))) return path.join(e.dir, d.meta.pdf);
    const eingang = path.join(EINGANG, sauber(datei) + '.pdf');
    return fs.existsSync(eingang) ? eingang : null;
  }

  function bibAendern(id, v) {
    const e = index.get(id);
    if (v === undefined) {
      if (e) { inPapierkorb(e.dir); index.delete(id); docs.delete(id); }
      return;
    }
    const elternDir = ordnerVon(v.eltern);
    if (!e) {
      // Neu anlegen
      const dir = einzigartig(elternDir, v.name);
      still();
      fs.mkdirSync(dir, { recursive: true });
      if (v.art === 'ordner') {
        schreibeOrdnerInfo(path.join(dir, ORDNER_DATEI), { id, farbe: v.farbe || 'blau', erstellt: v.erstellt || Date.now() });
        index.set(id, { art: 'ordner', dir });
        return;
      }
      const { name, eltern, art, ...eig } = v;
      if (art === 'notizbuch') delete eig.seiten;
      const meta = neuesDok(art, id, eig);
      if (art === 'skript') {
        meta.pdf = sauber(v.name) + '.pdf';
        const quelle = pdfQuelle(v.datei || id);
        if (quelle) {
          still();
          if (quelle.startsWith(EINGANG)) fs.renameSync(quelle, path.join(dir, meta.pdf));
          else fs.copyFileSync(quelle, path.join(dir, meta.pdf));
        }
        meta.eigenschaften.datei = id;
      }
      const wartend = wartendeInk.get(id) || {};
      wartendeInk.delete(id);
      if (art === 'notizbuch') meta.seiten = (v.seiten || ['s1']).slice();
      const seiten = new Map();
      for (const [sid, inh] of Object.entries(wartend)) if (!istLeer(inh)) seiten.set(sid, inh);
      index.set(id, { art, dir });
      docs.set(id, { meta, seiten, dir, sigs: new Map() });
      metaSchreibenJetzt(id);
      for (const sid of seiten.keys()) seiteSchreibenJetzt(id, sid);
      return;
    }
    // Umbenennen oder verschieben
    const sollDir = path.join(elternDir, sauber(v.name));
    if (sollDir !== e.dir && !(elternDir + path.sep + sauber(v.name)).startsWith(e.dir + path.sep)) {
      const ziel = einzigartig(elternDir, v.name, e.dir);
      if (ziel !== e.dir) {
        still();
        try { fs.renameSync(e.dir, ziel); pfadeNachziehen(e.dir, ziel); } catch (err) { console.error('Lernheft: verschieben', err); }
      }
    }
    if (e.art === 'ordner') {
      schreibeOrdnerInfo(path.join(e.dir, ORDNER_DATEI), { id, farbe: v.farbe || 'blau', erstellt: v.erstellt || 0 });
      return;
    }
    const d = docs.get(id);
    if (!d) return;
    const { name, eltern, art, ...eig } = v;
    if (art === 'skript') eig.datei = id;
    if (art === 'notizbuch') delete eig.seiten;
    d.meta.eigenschaften = eig;
    d.meta.geaendert = Date.now();
    if (art === 'notizbuch') {
      const neu = (v.seiten || []).slice();
      // Entfernte Seiten: Grabstein (damit sie vom anderen Gerät nicht zurückkommen), die Datei geht in den Papierkorb
      for (const sid of d.meta.seiten || []) {
        if (neu.includes(sid)) continue;
        (d.meta.seitenWeg || (d.meta.seitenWeg = {}))[sid] = Date.now();
        d.seiten.delete(sid);
        const sp = path.join(d.dir, SEITEN_ORDNER, dateiName(sid) + ENDUNG);
        if (fs.existsSync(sp)) {
          try {
            const ziel = einzigartig(PAPIERKORB, `${new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-')} ${path.basename(d.dir)} Seite ${sid}${ENDUNG}`);
            still();
            fs.renameSync(sp, ziel);
          } catch (err) { /* bleibt liegen */ }
        }
        kvSig.delete('ink:' + id + ':' + sid);
      }
      d.meta.seiten = neu;
    }
    dokMetaMerken(id);
  }

  function inkAendern(id, sid, v) {
    const inh = v && Array.isArray(v.e) ? { e: v.e, x: v.x } : { e: [] };
    const d = docs.get(id);
    if (!d) {
      const w = wartendeInk.get(id) || {};
      w[sid] = inh;
      wartendeInk.set(id, w);
      return;
    }
    if (istLeer(inh)) d.seiten.delete(sid); else d.seiten.set(sid, inh);
    dokSeiteMerken(id, sid);
  }

  function statistikAendern(id, v) {
    const d = docs.get(id);
    if (!d) return;
    d.meta.statistik = v || {};
    d.meta.geaendert = Date.now();
    dokMetaMerken(id);
  }

  function setze(aenderungen) {
    for (const [k, r] of Object.entries(aenderungen || {})) {
      const v = r && !r.weg ? r.v : undefined;
      if (v !== undefined) kv[k] = r; else delete kv[k];
      try {
        if (k.startsWith('bib:')) bibAendern(k.slice(4), v);
        else if (k.startsWith('ink:')) { const teile = k.split(':'); inkAendern(teile[1], teile.slice(2).join(':'), v); }
        else if (k.startsWith('zeit:') && k !== 'zeit:app') statistikAendern(k.slice(5), v);
        else if (k.startsWith('notiz:tag:')) whiteboardSchreiben(k.slice(10), v);
        else if (k.startsWith('einst:')) { einstZeit.set(k, Date.now()); einstSchreiben(); }
        else if (istLokalKey(k)) lokalSchreiben();
        else appSchreiben();
      } catch (e) { console.error('Lernheft: ablegen', k, e); }
    }
  }

  /* ---------- Dateien (PDF, Vorschaubilder) ---------- */

  const datei = {
    // Wo die Datei zu einem Schlüssel liegt (null: gibt es nicht). Das iPad liest grosse Dateien selbst (abgleich.js).
    pfad(k) {
      let p = null;
      if (k.startsWith('pdf:')) {
        const id = k.slice(4);
        p = pdfQuelle(id);
        // Kopie eines Skripts: die PDF des Originals
        if (!p) for (const [bid, e] of Object.entries(kv)) if (bid.startsWith('bib:') && e.v && e.v.datei === id) { p = pdfQuelle(bid.slice(4)); if (p) break; }
      } else if (k.startsWith('vorschau:')) p = path.join(VORSCHAU, sauber(k.slice(9)) + '.txt');
      return p && fs.existsSync(p) ? p : null;
    },
    get(k) {
      const p = datei.pfad(k);
      return p ? fs.readFileSync(p) : null;
    },
    put(k, daten) {
      if (k.startsWith('pdf:')) {
        const id = k.slice(4), e = index.get(id), d = docs.get(id);
        const p = e && d && d.meta.pdf ? path.join(e.dir, d.meta.pdf) : path.join(EINGANG, sauber(id) + '.pdf');
        schreibeAtomar(p, Buffer.from(daten));
      } else if (k.startsWith('vorschau:')) schreibeAtomar(path.join(VORSCHAU, sauber(k.slice(9)) + '.txt'), Buffer.from(daten));
    },
    del(k) {
      // PDFs liegen im Ordner des Skripts und wandern mit ihm in den Papierkorb
      if (k.startsWith('pdf:')) fs.rmSync(path.join(EINGANG, sauber(k.slice(4)) + '.pdf'), { force: true });
      else if (k.startsWith('vorschau:')) fs.rmSync(path.join(VORSCHAU, sauber(k.slice(9)) + '.txt'), { force: true });
    },
    liste() { return []; }
  };

  /* ---------- Export in den Ordner des Dokuments ---------- */

  // endung: '.pdf' (Standard) oder '.png'
  function exportiere(id, name, daten, endung) {
    const e = index.get(id);
    const dir = e && fs.existsSync(e.dir) ? e.dir : BIB;
    const ziel = path.join(dir, sauber(String(name).replace(/\.(pdf|png)$/i, '')) + (endung === '.png' ? '.png' : '.pdf'));
    schreibeAtomar(ziel, Buffer.from(daten));
    return ziel;
  }
  const ordnerVonDok = id => { const e = index.get(id); return e && fs.existsSync(e.dir) ? e.dir : null; };

  /* ---------- Papierkorb (Daten\Papierkorb): ansehen, wiederherstellen, endgültig löschen ---------- */

  // Einträge heissen "<Stempel> <Name>", der Stempel ist die Zeit des Löschens in UTC (JJJJ-MM-TT-hh-mm)
  const STEMPEL = /^(\d{4}-\d{2}-\d{2})(?:-(\d{2})-(\d{2}))?\s+(.+)$/;
  function groesseVon(p) {
    try {
      const st = fs.statSync(p);
      if (!st.isDirectory()) return st.size;
      return fs.readdirSync(p).reduce((s, n) => s + groesseVon(path.join(p, n)), 0);
    } catch (e) { return 0; }
  }
  // Notizbuch, zu dem eine gelöschte Seite gehört: dort ist sie als entfernt vermerkt (Seiten-Kennungen sind eindeutig)
  function notizbuchDerSeite(sid) {
    for (const [id, d] of docs) if (d.meta.seitenWeg && d.meta.seitenWeg[sid]) return id;
    return null;
  }
  function papierkorbEintrag(name) {
    const p = path.join(PAPIERKORB, name);
    let st;
    try { st = fs.statSync(p); } catch (e) { return null; }
    const m = STEMPEL.exec(name);
    const e = { name, titel: m ? m[4] : name, zeit: m && m[2] ? Date.parse(`${m[1]}T${m[2]}:${m[3]}:00Z`) : st.mtimeMs, groesse: groesseVon(p), art: 'datei' };
    if (st.isDirectory()) {
      const meta = leseJson(path.join(p, DOK_DATEI));
      if (meta && meta.id && (meta.art === 'skript' || meta.art === 'notizbuch')) {
        e.art = meta.art === 'skript' ? 'skript' : meta.eigenschaften && meta.eigenschaften.papier === 'whiteboard' ? 'whiteboard' : 'notizbuch';
        e.id = meta.id;
        e.titel = m ? m[4] : name;
        try { e.seiten = fs.readdirSync(path.join(p, SEITEN_ORDNER)).filter(n => n.endsWith(ENDUNG)).length; } catch (err) { e.seiten = 0; }
        e.pdfFehlt = meta.art === 'skript' && !(meta.pdf && fs.existsSync(path.join(p, meta.pdf)));
        e.schonDa = index.has(meta.id);
      } else e.art = 'ordner';
    } else if (name.endsWith(ENDUNG)) {
      const s = /^(.*) Seite (.+)\.lhz$/.exec(e.titel);
      e.art = 'seite';
      if (s) { e.titel = s[1]; e.seite = s[2]; }
      const nb = e.seite ? notizbuchDerSeite(e.seite) : null;
      if (nb) { e.notizbuch = nb; e.titel = path.basename(docs.get(nb).dir); }
    }
    return e;
  }
  function papierkorbListe() {
    let namen = [];
    try { namen = fs.readdirSync(PAPIERKORB); } catch (e) { /* leer */ }
    return namen.filter(n => !n.endsWith('.tmp')).map(papierkorbEintrag).filter(Boolean).sort((a, b) => b.zeit - a.zeit);
  }
  // Nur Namen, die wirklich direkt im Papierkorb liegen
  const imPapierkorb = name => typeof name === 'string' && name && path.basename(name) === name && fs.existsSync(path.join(PAPIERKORB, name));

  function papierkorbZurueck(name) {
    if (!imPapierkorb(name)) return { fehler: 'Diesen Eintrag gibt es nicht mehr.' };
    const e = papierkorbEintrag(name), p = path.join(PAPIERKORB, name);
    allesSchreiben();
    if (e.art === 'skript' || e.art === 'notizbuch' || e.art === 'whiteboard') {
      if (e.schonDa) return { fehler: `„${e.titel}“ ist schon in der Bibliothek.` };
      const ziel = einzigartig(BIB, e.titel);
      fs.renameSync(p, ziel);
      neuEinlesen();
      return { ok: true, id: e.id, titel: path.basename(ziel) };
    }
    if (e.art === 'seite') {
      const d = e.notizbuch && docs.get(e.notizbuch);
      if (!d) return { fehler: 'Das Notizbuch zu dieser Seite gibt es nicht mehr. Die Seite lässt sich nur endgültig löschen.' };
      const ziel = path.join(d.dir, SEITEN_ORDNER, dateiName(e.seite) + ENDUNG);
      if (fs.existsSync(ziel)) return { fehler: 'Im Notizbuch gibt es diese Seite schon.' };
      fs.mkdirSync(path.dirname(ziel), { recursive: true });
      fs.renameSync(p, ziel);
      // Kein Grabstein mehr, die Seite kommt ans Ende des Notizbuchs
      delete d.meta.seitenWeg[e.seite];
      if (!Object.keys(d.meta.seitenWeg).length) delete d.meta.seitenWeg;
      d.meta.seiten = (d.meta.seiten || []).filter(s => s !== e.seite).concat([e.seite]);
      d.meta.geaendert = Date.now();
      metaSchreibenJetzt(e.notizbuch);
      neuEinlesen();
      return { ok: true, id: e.notizbuch, titel: e.titel };
    }
    return { fehler: 'Dieser Eintrag lässt sich nicht wiederherstellen, nur endgültig löschen.' };
  }

  // Endgültig löschen, samt allem, was dazugehört: Sicherungen der Seiten, Vorschaubild, PDF im Eingang. Gibt die Kennung
  // zurück, damit die Oberfläche auch Lernzeit und Ansicht des Dokuments vergessen kann.
  function papierkorbLoeschen(name) {
    if (!imPapierkorb(name)) return { fehler: 'Diesen Eintrag gibt es nicht mehr.' };
    const e = papierkorbEintrag(name), p = path.join(PAPIERKORB, name);
    const weg = [p];
    let sicherungen = [];
    try { sicherungen = fs.readdirSync(SICHERUNG_SEITEN); } catch (err) { /* keine */ }
    if (e.id && (e.art === 'skript' || e.art === 'notizbuch' || e.art === 'whiteboard') && !e.schonDa) {
      // Sicherungen heissen "Bibliothek - <Ordner> - … - Handschrift - <Seite>.lhz"; nur wenn kein Dokument in der
      // Bibliothek gerade so heisst (sonst gehören sie diesem)
      const ordner = sauber(e.titel);
      const lebt = [...docs.values()].some(d => sauber(path.basename(d.dir)) === ordner);
      if (!lebt) for (const n of sicherungen) if (n.includes(` - ${ordner} - ${SEITEN_ORDNER} - `)) weg.push(path.join(SICHERUNG_SEITEN, n));
      if (!dokVerwendetDatei(e.id)) weg.push(path.join(VORSCHAU, sauber(e.id) + '.txt'), path.join(EINGANG, sauber(e.id) + '.pdf'));
    } else if (e.art === 'seite' && e.seite) {
      for (const n of sicherungen) if (n.endsWith(` - ${SEITEN_ORDNER} - ${dateiName(e.seite)}${ENDUNG}`)) weg.push(path.join(SICHERUNG_SEITEN, n));
    }
    still();
    let fehler = null;
    for (const q of weg) { try { fs.rmSync(q, { recursive: true, force: true }); } catch (err) { if (q === p) fehler = err.message; } }
    if (fehler) return { fehler };
    return { ok: true, id: e.art === 'seite' ? null : e.id || null, art: e.art, dateien: weg.filter(q => q !== p).length };
  }
  // Braucht ein Dokument in der Bibliothek noch diese PDF oder dieses Vorschaubild (Kopie eines Skripts)?
  const dokVerwendetDatei = datei => index.has(datei) || [...docs.values()].some(d => d.meta.eigenschaften && d.meta.eigenschaften.datei === datei);
  function papierkorbLeeren() {
    const r = { geloescht: 0, ids: [], fehler: [] };
    for (const e of papierkorbListe()) {
      const x = papierkorbLoeschen(e.name);
      if (x.ok) { r.geloescht++; if (x.id) r.ids.push(x.id); } else r.fehler.push(`${e.titel}: ${x.fehler}`);
    }
    return r;
  }

  /* ---------- Alles in einer einzigen Datei (Notlösung und Umzug) ---------- */

  // Eine Datei (gzip-JSON) mit allen Beschreibungen, der ganzen Handschrift und den Einstellungen. Ohne PDFs:
  // die liegen als normale Dateien in den Ordnern der Skripte.
  function exportiereAlles() {
    allesSchreiben();
    const relativ = dir => path.relative(BIB, dir).split(path.sep);
    const ordner = [], dokumente = [];
    for (const [id, e] of index) {
      if (e.art === 'ordner') {
        const m = leseJson(path.join(e.dir, ORDNER_DATEI)) || {};
        ordner.push({ id, pfad: relativ(e.dir), farbe: m.farbe || 'blau', erstellt: m.erstellt || 0 });
      }
    }
    for (const [id, d] of docs) {
      const seiten = {};
      for (const [sid, inh] of d.seiten) if (!istLeer(inh)) seiten[sid] = JSON.parse(F.kodiereSeite(sid, inh));
      dokumente.push({ id, pfad: relativ(d.dir), meta: d.meta, seiten });
    }
    const whiteboard = {};
    for (const [k, e] of Object.entries(kv)) if (k.startsWith('notiz:tag:') && !istLeer(e.v)) whiteboard[k.slice(10)] = JSON.parse(F.kodiereSeite(k.slice(10), e.v));
    const einstellungen = {};
    for (const [k, e] of Object.entries(kv)) if (k.startsWith('einst:')) einstellungen[k] = { v: e.v, m: einstZeit.get(k) || e.zeit };
    const app = {};
    for (const [k, e] of Object.entries(kv)) if (istApp(k) && !k.startsWith('lokal:')) app[k] = e.v;
    const paket = { lh: F.VERSION, art: 'sicherung', erstellt: Date.now(), ordner, dokumente, whiteboard, einstellungen, app };
    return zlib.gzipSync(Buffer.from(JSON.stringify(paket)), { level: 9 });
  }

  // Liest so eine Datei und führt sie mit dem vorhandenen Stand zusammen (nichts wird überschrieben oder gelöscht)
  function importiereAlles(daten) {
    let paket;
    try { paket = JSON.parse(zlib.gunzipSync(Buffer.from(daten)).toString('utf8')); } catch (e) { throw new Error('Das ist keine Lernheft-Sicherung.'); }
    if (!paket || paket.art !== 'sicherung' || !Array.isArray(paket.dokumente)) throw new Error('Das ist keine Lernheft-Sicherung.');
    if (paket.lh > F.VERSION) throw new Error('Die Sicherung stammt aus einer neueren Lernheft-Version.');
    allesSchreiben();
    const bericht = { dokumente: 0, neu: 0, seiten: 0 };
    const sicherPfad = teile => teile.map(sauber);
    for (const o of paket.ordner || []) {
      const dir = path.join(BIB, ...sicherPfad(o.pfad));
      fs.mkdirSync(dir, { recursive: true });
      const mp = path.join(dir, ORDNER_DATEI);
      if (!fs.existsSync(mp)) schreibeOrdnerInfo(mp, { id: o.id, farbe: o.farbe || 'blau', erstellt: o.erstellt || 0 });
    }
    for (const dk of paket.dokumente) {
      bericht.dokumente++;
      let d = docs.get(dk.id);
      let dir;
      if (d) dir = d.dir;
      else {
        dir = path.join(BIB, ...sicherPfad(dk.pfad));
        if (fs.existsSync(path.join(dir, DOK_DATEI))) dir = einzigartig(path.dirname(dir), path.basename(dir));
        fs.mkdirSync(dir, { recursive: true });
        bericht.neu++;
      }
      const mp = path.join(dir, DOK_DATEI);
      const vorhanden = d ? d.meta : null;
      const meta = vorhanden ? F.fuehreMetaZusammen(vorhanden, dk.meta) : dk.meta;
      schreibeAtomar(mp, metaAlsText(meta));
      for (const [sid, o] of Object.entries(dk.seiten || {})) {
        const imp = F.dekodiereSeite(o);
        const sp = path.join(dir, SEITEN_ORDNER, dateiName(sid) + ENDUNG);
        const jetzt = liesSeitenDatei(sp);
        schreibeSeitenDatei(sp, sid, jetzt ? F.fuehreSeiteZusammen(jetzt, imp) : imp);
        bericht.seiten++;
      }
    }
    for (const [datum, o] of Object.entries(paket.whiteboard || {})) {
      const imp = F.dekodiereSeite(o);
      const p = whiteboardPfad(datum), jetzt = liesSeitenDatei(p);
      schreibeSeitenDatei(p, datum, jetzt ? F.fuehreSeiteZusammen(jetzt, imp) : imp);
    }
    if (paket.einstellungen) {
      const jetzt = leseJson(EINST_DATEI) || {};
      const neu = F.fuehreEinstellungenZusammen(jetzt.eintraege || {}, paket.einstellungen);
      schreibeAtomar(EINST_DATEI, JSON.stringify({ lernheft: 2, art: 'einstellungen', eintraege: neu }, null, 1));
    }
    if (paket.app) {
      const jetzt = leseJson(APP_DATEI) || {};
      schreibeAtomar(APP_DATEI, JSON.stringify(F.fuehreAppDatenZusammen(jetzt, paket.app), null, 1));
    }
    // Alles neu einlesen: die Webseite bekommt die zusammengeführten Stände gemeldet
    neuEinlesen();
    neuEinlesenDaten();
    return bericht;
  }

  // Wie viel Platz die Handschrift braucht
  function speicherInfo() {
    let dateien = 0, bytes = 0;
    const gehe = dir => {
      let liste = [];
      try { liste = fs.readdirSync(dir, { withFileTypes: true }); } catch (e) { return; }
      for (const f of liste) {
        const p = path.join(dir, f.name);
        if (f.isDirectory()) gehe(p);
        else if (f.name.toLowerCase().endsWith(ENDUNG)) { dateien++; try { bytes += fs.statSync(p).size; } catch (e) { /* egal */ } }
      }
    };
    gehe(BIB); gehe(WHITEBOARD);
    return { dateien, bytes, dokumente: docs.size, zusammengefuehrt: zaehler.zusammengefuehrt, migriert: zaehler.migriert };
  }

  /* ---------- Start ---------- */

  function laden() {
    const erstesMal = !fs.existsSync(APP_DATEI);
    // Geräte-Einstellungen: aus dem Profil, beim ersten Mal aus der bisherigen app-daten.json übernommen
    const lokal = leseJson(LOKAL_DATEI);
    if (lokal) { for (const [k, v] of Object.entries(lokal)) if (istLokalKey(k)) kv[k] = eintrag(v); }
    else {
      const alt = leseJson(APP_DATEI) || {};
      for (const [k, v] of Object.entries(alt)) if (istLokalKey(k)) kv[k] = eintrag(v);
      if (Object.keys(kv).length) lokalSchreibenJetzt();
    }
    const { aenderungen } = ladeDatenDateien(true);
    if (erstesMal) altesUebernehmen();
    const { neu, sigs, idx, neueDocs, spaeterNochmal } = scanne();
    for (const [k, v] of Object.entries(neu)) { kv[k] = eintrag(v); if (k.startsWith('ink:')) kvSig.set(k, sigs[k]); }
    index = idx;
    docs = neueDocs;
    if (spaeterNochmal) planeEinlesen(3500);
    // Einmalig: Geräte-Einstellungen, die früher in app-daten.json standen, gehören nicht in den Speicherort
    const vorhanden = leseJson(APP_DATEI);
    if (erstesMal || (vorhanden && Object.keys(vorhanden).some(istLokalKey))) appSchreibenJetzt();
    void aenderungen;
  }

  // Beim ersten Start: Daten der früheren Lernheft-App übernehmen (die Webseite rechnet sie um)
  function altesUebernehmen() {
    if (!altDaten) return;
    const kopiere = (von, nach) => { try { if (fs.existsSync(von) && !fs.existsSync(nach)) fs.copyFileSync(von, nach); } catch (e) { /* egal */ } };
    const v2 = leseJson(path.join(altDaten, 'lernheft-daten', 'kv.json'));
    if (v2) {
      for (const [k, r] of Object.entries(v2)) if (k.startsWith('mathe-des-tages:') && r && typeof r.v === 'string') kv[k] = eintrag(r.v);
      const dd = path.join(altDaten, 'lernheft-daten', 'dateien');
      if (fs.existsSync(dd)) for (const f of fs.readdirSync(dd)) {
        const k = decodeURIComponent(f);
        if (k.startsWith('pdf:')) kopiere(path.join(dd, f), path.join(EINGANG, sauber(k.slice(4)) + '.pdf'));
        if (k.startsWith('vorschau:')) kopiere(path.join(dd, f), path.join(VORSCHAU, sauber(k.slice(9)) + '.txt'));
      }
    }
    const v1 = leseJson(path.join(altDaten, 'daten', 'store.json'));
    if (v1) for (const [k, v] of Object.entries(v1)) if (!kv[k] && typeof v === 'string') kv[k] = eintrag(v);
    // Die Webseite übernimmt alte Schlüssel aus dem Speicherort nur auf dem Gerät, von dem sie stammen
    if (Object.keys(kv).some(k => k.startsWith('mathe-des-tages:'))) { kv['lokal:alt-vom-geraet'] = eintrag(true); lokalSchreiben(); }
    for (const [ordner, art, endung] of [['pdf', EINGANG, '.pdf'], ['vorschau', VORSCHAU, '.txt']]) {
      const d = path.join(altDaten, 'daten', ordner);
      if (fs.existsSync(d)) for (const f of fs.readdirSync(d)) if (f.endsWith(endung)) kopiere(path.join(d, f), path.join(art, f));
    }
  }

  laden();

  // Änderungen im Explorer und durch die Cloud bemerken
  const beobachter = [];
  try {
    beobachter.push(fs.watch(BIB, { recursive: true }, (typ, f) => {
      if (f && /\.tmp$/.test(f)) return;
      planeEinlesen(900);
    }));
  } catch (e) { console.error('Lernheft: Ordner beobachten', e); }
  try {
    beobachter.push(fs.watch(DATEN, { recursive: true }, (typ, f) => {
      if (!f || /\.tmp$/.test(f) || /^(Papierkorb|Vorschaubilder|Eingang|Konflikte|Sicherung-Format1|Sicherung-Seiten)([\\/]|$)/.test(f)) return;
      planeDatenEinlesen(900);
    }));
  } catch (e) { console.error('Lernheft: Daten beobachten', e); }

  return {
    wurzel, BIB, DATEN,
    alle: () => kv,
    setze,
    datei,
    exportiere,
    exportiereAlles,
    importiereAlles,
    speicherInfo,
    ordnerVonDok,
    papierkorb: { liste: papierkorbListe, zurueck: papierkorbZurueck, loeschen: papierkorbLoeschen, leeren: papierkorbLeeren },
    neuEinlesen: () => { neuEinlesen(); neuEinlesenDaten(); },
    sichern: allesSchreiben,
    schliessen: () => { allesSchreiben(); beobachter.forEach(b => { try { b.close(); } catch (e) { /* egal */ } }); }
  };
}

module.exports = { erstelleAblage, DOK_DATEI };
