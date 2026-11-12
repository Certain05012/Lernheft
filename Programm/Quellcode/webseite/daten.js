'use strict';
// Datenhaltung. Alles liegt im Arbeitsspeicher und wird sofort lokal gesichert:
// im Browser in IndexedDB, in der Lernheft-App auf der Festplatte (über window.lernheftDesktop).
// wolke.js gleicht danach mit dem Claude-Konto ab. Jeder Eintrag merkt sich dafür,
// wann er geändert wurde, welchen Cloud-Stand er zuletzt gesehen hat und ob er noch hoch muss.
(function () {
  // Schlüssel mit diesen Anfängen bleiben auf dem Gerät (Stift-Einstellungen, Ansicht, alte Daten)
  const LOKAL_PRAEFIXE = ['lokal:', 'mathe-des-tages:'];
  const istLokal = k => LOKAL_PRAEFIXE.some(p => k.startsWith(p));
  const bruecke = window.lernheftDesktop && window.lernheftDesktop.version >= 2 ? window.lernheftDesktop : null;

  // k -> { v: Wert, j: v als JSON, zeit, basis: Cloud-Revision beim letzten Abgleich, dirty, weg: gelöscht }
  // Handschrift (ink:*) aus der Lernheft-App ist zuerst faul: { v: null, faul: true }, es gibt sie, aber sie liegt noch
  // nicht im Speicher. lade(keys) holt sie (Dokument öffnen, Vorschaubild, Export), vergiss(keys) gibt sie wieder frei.
  const eintraege = new Map();
  const ausRoh = r => (r.faul
    ? { v: null, j: null, faul: true, zeit: r.zeit || 0, basis: r.basis == null ? null : r.basis, dirty: false, weg: false }
    : { v: r.v, j: JSON.stringify(r.v), zeit: r.zeit || 0, basis: r.basis == null ? null : r.basis, dirty: !!r.dirty, weg: !!r.weg });
  const hoerer = new Set();
  function melde(key, quelle) {
    for (const fn of hoerer) {
      try { fn({ key, quelle }); } catch (e) { console.error(e); }
    }
  }

  /* ---------- Lokale Ablage ---------- */

  const anfrage = r => new Promise((ok, fehler) => { r.onsuccess = () => ok(r.result); r.onerror = () => fehler(r.error); });

  function idbAblage() {
    let dbVersprechen = null;
    const oeffne = () => dbVersprechen || (dbVersprechen = new Promise((ok, fehler) => {
      const r = indexedDB.open('lernheft', 1);
      r.onupgradeneeded = () => { r.result.createObjectStore('kv'); r.result.createObjectStore('dateien'); };
      r.onsuccess = () => ok(r.result);
      r.onerror = () => { dbVersprechen = null; fehler(r.error); };
    }));
    const fertig = t => new Promise((ok, fehler) => { t.oncomplete = () => ok(); t.onerror = () => fehler(t.error); t.onabort = () => fehler(t.error); });
    return {
      async laden() {
        const s = (await oeffne()).transaction('kv').objectStore('kv');
        const [keys, werte] = await Promise.all([anfrage(s.getAllKeys()), anfrage(s.getAll())]);
        const o = {};
        keys.forEach((k, i) => { o[k] = werte[i]; });
        return o;
      },
      async schreiben(aenderungen) {
        const t = (await oeffne()).transaction('kv', 'readwrite');
        const s = t.objectStore('kv');
        for (const [k, r] of Object.entries(aenderungen)) { if (r) s.put(r, k); else s.delete(k); }
        return fertig(t);
      },
      datei: {
        async get(k) { return anfrage((await oeffne()).transaction('dateien').objectStore('dateien').get(k)); },
        async put(k, blob) { const t = (await oeffne()).transaction('dateien', 'readwrite'); t.objectStore('dateien').put(blob, k); return fertig(t); },
        async del(k) { const t = (await oeffne()).transaction('dateien', 'readwrite'); t.objectStore('dateien').delete(k); return fertig(t); },
        async liste() { return anfrage((await oeffne()).transaction('dateien').objectStore('dateien').getAllKeys()); }
      }
    };
  }

  function brueckenAblage() {
    const typ = k => (k.startsWith('pdf:') ? 'application/pdf' : 'text/plain');
    return {
      async laden() { return bruecke.kv.alle(); },
      async schreiben(aenderungen) { bruecke.kv.setze(aenderungen); },
      hole: bruecke.kv.hole ? keys => bruecke.kv.hole(keys) : null,
      vergiss: bruecke.kv.vergiss ? keys => bruecke.kv.vergiss(keys) : null,
      datei: {
        async get(k) { const b = await bruecke.datei.get(k); return b ? new Blob([b], { type: typ(k) }) : undefined; },
        async put(k, blob) { await bruecke.datei.put(k, await blob.arrayBuffer()); },
        async del(k) { await bruecke.datei.del(k); },
        async liste() { return bruecke.datei.liste(); }
      }
    };
  }

  // Notlösung ohne dauerhaften Speicher (z. B. privater Modus mancher Browser)
  function speicherAblage() {
    const dateien = new Map();
    return {
      async laden() { return {}; },
      async schreiben() {},
      datei: {
        async get(k) { return dateien.get(k); },
        async put(k, b) { dateien.set(k, b); },
        async del(k) { dateien.delete(k); },
        async liste() { return [...dateien.keys()]; }
      }
    };
  }

  let ablage = null;
  let ablageArt = 'browser';

  // Schreiben gesammelt, damit schnelles Zeichnen nicht jede Linie einzeln auf die Platte bringt
  const zuSchreiben = new Map();
  let schreibTimer = 0;
  const alsRoh = e => (e ? { v: e.v, zeit: e.zeit, basis: e.basis, dirty: e.dirty, weg: e.weg } : null);
  function sichere(k) {
    zuSchreiben.set(k, true);
    if (!schreibTimer) schreibTimer = setTimeout(schreibeJetzt, 60);
  }
  function schreibeJetzt() {
    clearTimeout(schreibTimer);
    schreibTimer = 0;
    if (!zuSchreiben.size || !ablage) return;
    const aenderungen = {};
    for (const k of zuSchreiben.keys()) aenderungen[k] = alsRoh(eintraege.get(k));
    zuSchreiben.clear();
    Promise.resolve(ablage.schreiben(aenderungen)).catch(e => {
      console.warn('Lernheft: lokal speichern fehlgeschlagen', e);
      if (window.UI) UI.meldung('Lokal speichern hat nicht geklappt. Ist der Speicher voll?');
    });
  }
  window.addEventListener('pagehide', schreibeJetzt);
  document.addEventListener('visibilitychange', () => { if (document.hidden) schreibeJetzt(); });

  /* ---------- Lesen und Schreiben ---------- */

  function get(k, standard) {
    const e = eintraege.get(k);
    return !e || e.weg || e.faul ? standard : e.v;
  }
  const istFaul = k => { const e = eintraege.get(k); return !!(e && e.faul); };

  // Faule Einträge laden. true, wenn danach alles da ist (false: eine Seite ist noch nicht lesbar, z. B. weil die Cloud
  // sie gerade lädt; sie bleibt faul und darf nicht als leer gelten)
  const laeuft = new Map();
  async function lade(keys) {
    const fehlen = [...new Set(keys || [])].filter(istFaul);
    if (!fehlen.length) return true;
    if (!ablage || !ablage.hole) return false;
    // Was schon unterwegs ist, nicht doppelt anfragen
    const neu = fehlen.filter(k => !laeuft.has(k));
    if (neu.length) {
      const anfrage = Promise.resolve().then(() => ablage.hole(neu)).catch(e => { console.warn('Lernheft: Handschrift laden', e); return {}; });
      for (const k of neu) laeuft.set(k, anfrage);
      anfrage.then(r => {
        for (const k of neu) {
          laeuft.delete(k);
          const da = r && r[k], jetzt = eintraege.get(k);
          // Inzwischen geschrieben oder gelöscht: das gilt
          if (!jetzt || !jetzt.faul || !da || da.faul || da.fehlt || da.weg) continue;
          eintraege.set(k, Object.assign(ausRoh(da), { zeit: da.zeit || jetzt.zeit }));
        }
      });
    }
    await Promise.all(fehlen.map(k => laeuft.get(k)).filter(Boolean));
    return !fehlen.some(istFaul);
  }
  // Handschrift aus dem Speicher nehmen (Dokument geschlossen); was noch nicht gesichert ist, bleibt
  function vergiss(keys) {
    const frei = [];
    for (const k of keys || []) {
      const e = eintraege.get(k);
      if (!e || e.faul || e.weg || !k.startsWith('ink:') || zuSchreiben.has(k) || !ablage || !ablage.vergiss) continue;
      eintraege.set(k, { v: null, j: null, faul: true, zeit: e.zeit, basis: e.basis, dirty: false, weg: false });
      frei.push(k);
    }
    if (frei.length) ablage.vergiss(frei);
    return frei.length;
  }

  // Handschrift (ink:*) wird nach jedem Strich gespeichert. Die ganze Seite jedes Mal als Text zu schreiben und wieder
  // einzulesen (für die eigene Kopie) kostete bei einer vollen Seite rund 30 ms, mitten im Schreiben. Deshalb merkt
  // sich jedes Element der Schreibfläche seinen Text und seine Kopie: geschrieben wird nur, was neu oder geändert ist,
  // die Seite ist dann nur noch eine Liste davon. Ob ein Strich noch derselbe ist, zeigt ein Kennzeichen aus allen
  // seinen Werten (Punkte gewichtet aufsummiert, das kostet fast nichts); alles andere (Notizen, Text, Bilder,
  // Unbekanntes) wird wie bisher jedes Mal geschrieben. Die Kopien werden nie verändert (wer sie über get bekommt,
  // liest nur), so dürfen aufeinanderfolgende Fassungen einer Seite sie teilen.
  const elementSpeicher = new WeakMap();
  const STRICH_FELDER = { id: 1, w: 1, f: 1, d: 1, m: 1, p: 1 };
  function strichKennzeichen(el) {
    if (!el || el.typ || !Array.isArray(el.p)) return null;
    for (const k in el) if (!STRICH_FELDER[k]) return null;
    const p = el.p;
    let sx = 0, sy = 0, sd = 0;
    for (let i = 0; i < p.length; i++) {
      const q = p[i], g = i + 1;
      if (q.length > 4) return null;
      sx += q[0] * g; sy += q[1] * g; sd += (q[2] == null ? -1 : q[2]) * g + (q.length > 3 ? (q[3] + 1) * g * 7 : 0);
    }
    return el.id + '|' + el.w + '|' + el.f + '|' + el.d + '|' + el.m + '|' + p.length + '|' + sx + '|' + sy + '|' + sd;
  }
  function elementFassung(el) {
    const sig = strichKennzeichen(el);
    if (sig === null) { const j = JSON.stringify(el); return { j, kopie: JSON.parse(j) }; }
    let z = elementSpeicher.get(el);
    if (!z || z.sig !== sig) {
      const j = JSON.stringify(el);
      z = { sig, j, kopie: JSON.parse(j) };
      elementSpeicher.set(el, z);
    }
    return z;
  }
  // Text eines Strichs aus demselben Speicher (für den Verlauf der Schreibfläche); null: kein einfacher Strich
  const strichText = el => (strichKennzeichen(el) === null ? null : elementFassung(el).j);
  // Seite { e: [...], x?: {...} } -> { j: genau der Text von JSON.stringify, v: eigene Kopie }; null: anders aufgebaut
  function inkFassung(v) {
    if (!v || typeof v !== 'object' || !Array.isArray(v.e)) return null;
    const felder = Object.keys(v);
    if (!(felder.length === 1 || (felder.length === 2 && felder[0] === 'e' && felder[1] === 'x' && v.x && typeof v.x === 'object'))) return null;
    const teile = new Array(v.e.length), kopien = new Array(v.e.length);
    for (let i = 0; i < v.e.length; i++) {
      const el = v.e[i];
      if (!el || typeof el !== 'object') return null;
      const f = elementFassung(el);
      teile[i] = f.j; kopien[i] = f.kopie;
    }
    const kopie = { e: kopien };
    let j = '{"e":[' + teile.join(',') + ']';
    if (felder.length === 2) { const x = JSON.stringify(v.x); j += ',"x":' + x; kopie.x = JSON.parse(x); }
    return { j: j + '}', v: kopie };
  }

  // Gibt true zurück, wenn sich wirklich etwas geändert hat
  function set(k, v) {
    if (v === undefined) return del(k);
    const schnell = k.startsWith('ink:') ? inkFassung(v) : null;
    const j = schnell ? schnell.j : JSON.stringify(v);
    const alt = eintraege.get(k);
    if (alt && !alt.weg && !alt.faul && alt.j === j) return false;
    eintraege.set(k, { v: schnell ? schnell.v : JSON.parse(j), j, zeit: Date.now(), basis: alt ? alt.basis : null, dirty: !istLokal(k), weg: false });
    sichere(k);
    melde(k, 'lokal');
    return true;
  }

  function del(k) {
    const alt = eintraege.get(k);
    if (!alt || alt.weg) return false;
    // Nie in der Cloud gewesen: einfach entfernen. Sonst Grabstein, damit die Löschung auch dort ankommt.
    if (istLokal(k) || alt.basis == null) eintraege.delete(k);
    else eintraege.set(k, { v: null, j: 'null', zeit: Date.now(), basis: alt.basis, dirty: true, weg: true });
    sichere(k);
    melde(k, 'lokal');
    return true;
  }

  const keys_ = praefix => keys(praefix);
  function keys(praefix = '') {
    const r = [];
    for (const [k, e] of eintraege) if (!e.weg && k.startsWith(praefix)) r.push(k);
    return r;
  }

  /* ---------- Dateien (PDFs, Vorschaubilder) ---------- */

  const datei = {
    async get(k) {
      let b;
      try { b = await ablage.datei.get(k); } catch (e) { b = undefined; }
      if (b) return b;
      // Nicht auf diesem Gerät: aus dem Konto holen und lokal behalten
      if (Daten.dateiQuelle) {
        b = await Daten.dateiQuelle(k).catch(() => undefined);
        if (b) { try { await ablage.datei.put(k, b); } catch (e) { /* dann eben nur im Speicher */ } return b; }
      }
      return undefined;
    },
    lokal(k) { return ablage.datei.get(k).catch(() => undefined); },
    async put(k, blob) {
      await ablage.datei.put(k, blob);
      if (Daten.dateiNeu) Daten.dateiNeu(k);
    },
    async del(k) {
      try { await ablage.datei.del(k); } catch (e) { /* war schon weg */ }
      const weg = get('lokal:dateien-weg', []);
      if (!weg.includes(k)) set('lokal:dateien-weg', weg.concat(k));
      if (Daten.dateiWeg) Daten.dateiWeg(k);
    },
    liste() { return Promise.resolve().then(() => ablage.datei.liste()).catch(() => []); }
  };

  /* ---------- Für den Abgleich (wolke.js) ---------- */

  const intern = {
    eintraege,
    istLokal,
    vonWolke(k, v, basis, zeit) {
      if (v === undefined) eintraege.delete(k);
      else {
        const j = JSON.stringify(v);
        eintraege.set(k, { v: JSON.parse(j), j, zeit: zeit || Date.now(), basis, dirty: false, weg: false });
      }
      sichere(k);
      melde(k, 'wolke');
    },
    // Nach dem Hochladen: nur sauber, wenn sich lokal inzwischen nichts mehr getan hat
    bestaetige(k, zeit, basis) {
      const e = eintraege.get(k);
      if (!e) return false;
      e.basis = basis;
      if (e.zeit === zeit) {
        if (e.weg) eintraege.delete(k); else e.dirty = false;
        sichere(k);
        return false;
      }
      sichere(k);
      return true;
    },
    setzeBasis(k, basis, sauber) {
      const e = eintraege.get(k);
      if (!e) return;
      e.basis = basis;
      if (sauber) e.dirty = false;
      sichere(k);
    },
    entferne(k) { eintraege.delete(k); sichere(k); }
  };

  // Änderungen aus einem anderen Fenster der Lernheft-App
  if (bruecke && bruecke.kv.aufAenderung) {
    bruecke.kv.aufAenderung(aenderungen => {
      for (const [k, r] of Object.entries(aenderungen || {})) {
        if (!r) eintraege.delete(k);
        else eintraege.set(k, ausRoh(r));
        melde(k, 'extern');
      }
    });
  }

  /* ---------- Übernahme der alten Daten ---------- */

  function mischeElemente(a, b) {
    const ids = new Set(a.map(e => e.id));
    return a.concat(b.filter(e => !ids.has(e.id)));
  }
  function mischeLog(a, b) {
    const r = JSON.parse(JSON.stringify(a || {}));
    for (const [tag, t] of Object.entries(b || {})) {
      const z = r[tag] || (r[tag] = {});
      for (const [f, n] of Object.entries(t || {})) z[f] = Math.max(z[f] || 0, n || 0);
    }
    return r;
  }
  // Striche eines endlosen Blatts auf A4-Seiten verteilen
  function verteileAufSeiten(striche, hoehe) {
    const seiten = [[]];
    for (const s of striche) {
      if (!s || !Array.isArray(s.p) || !s.p.length) continue;
      const i = Math.max(0, Math.floor(s.p[0][1] / hoehe));
      while (seiten.length <= i) seiten.push([]);
      const dy = i * hoehe;
      seiten[i].push({ ...s, p: s.p.map(q => [q[0], Math.round((q[1] - dy) * 10) / 10, q[2] == null ? 0.5 : q[2]]) });
    }
    return seiten;
  }

  // alt: Map alter Schlüssel ("mathe-des-tages:…") -> Text. Ergebnis ist auf jedem Gerät gleich, damit kein Konflikt entsteht.
  function uebernehmeAlt(alt) {
    const P = 'mathe-des-tages:';
    const json = k => { try { return JSON.parse(alt.get(P + k)); } catch (e) { return null; } };

    const g = json('geloest');
    if (g && typeof g === 'object') set('mdt:geloest', Object.assign({}, get('mdt:geloest', {}), g));
    const l = json('log');
    if (l && typeof l === 'object') set('mdt:log', mischeLog(get('mdt:log', {}), l));

    for (const [a, n] of [['stift', 'lokal:stift'], ['wb-lage', 'lokal:wb-lage'], ['wb-masse', 'lokal:wb-masse'], ['skripte-modus', 'lokal:pdf-modus']]) {
      const w = json(a);
      if (w != null && get(n) == null) set(n, w);
    }

    const sk = json('skripte');
    const dateien = {};
    if (sk && Array.isArray(sk.ordner) && Array.isArray(sk.dateien)) {
      for (const o of sk.ordner) {
        if (!get('bib:' + o.id)) set('bib:' + o.id, { art: 'ordner', name: o.name, eltern: o.eltern || null, farbe: o.farbe || 'blau', erstellt: o.erstellt || 0 });
      }
      for (const d of sk.dateien) {
        dateien[d.id] = d;
        if (!get('bib:' + d.id)) {
          set('bib:' + d.id, {
            art: 'skript', name: d.name, eltern: d.ordner || null, datei: d.id, seiten: d.seiten || 0, groesse: d.groesse || 0,
            modus: d.modus || 'original', hell: d.hell == null ? null : d.hell, erstellt: d.hinzugefuegt || 0,
            geoeffnet: d.geoeffnet || 0, seite: d.seite || 1, favorit: !!d.favorit
          });
        }
      }
    }

    for (const [k, text] of alt) {
      if (!k.startsWith(P + 'notizen:')) continue;
      let striche;
      try { striche = JSON.parse(text); } catch (e) { continue; }
      if (!Array.isArray(striche) || !striche.length) continue;
      const rest = k.slice((P + 'notizen:').length);
      if (rest.startsWith('skript:')) {
        // Das frühere Whiteboard zu einem Skript wird ein eigenes Notizbuch daneben
        const id = rest.slice(7), nb = 'nb-' + id, d = dateien[id];
        if (get('bib:' + nb)) continue;
        const seiten = verteileAufSeiten(striche, 1123);
        set('bib:' + nb, {
          art: 'notizbuch', name: (d ? d.name : 'Skript') + ' – Notizen', eltern: d ? d.ordner || null : null,
          format: 'A4', papier: 'karo', farbe: 'blau', seiten: seiten.map((_, i) => 's' + (i + 1)),
          erstellt: d ? d.hinzugefuegt || 0 : 0, geoeffnet: 0, seite: 1, favorit: false
        });
        seiten.forEach((e, i) => { if (e.length) set('ink:' + nb + ':s' + (i + 1), { e }); });
      } else if (/^\d{4}-\d{2}-\d{2}$/.test(rest)) {
        const key = 'notiz:tag:' + rest;
        const vorhanden = get(key);
        set(key, { e: vorhanden && vorhanden.e ? mischeElemente(vorhanden.e, striche) : striche });
      }
    }
  }

  async function alteIdbDateien() {
    if (!window.indexedDB) return;
    try {
      if (indexedDB.databases) {
        const liste = await indexedDB.databases();
        if (!liste.some(d => d.name === 'mathe-des-tages')) return;
      }
      const db = await new Promise((ok, fehler) => {
        const r = indexedDB.open('mathe-des-tages');
        r.onupgradeneeded = () => { r.transaction.abort(); };
        r.onsuccess = () => ok(r.result);
        r.onerror = () => fehler(r.error);
      });
      for (const store of ['pdf', 'vorschau']) {
        if (!db.objectStoreNames.contains(store)) continue;
        const s = db.transaction(store).objectStore(store);
        const [ks, ws] = await Promise.all([anfrage(s.getAllKeys()), anfrage(s.getAll())]);
        for (let i = 0; i < ks.length; i++) {
          const w = ws[i];
          if (w == null) continue;
          const blob = w instanceof Blob ? w : new Blob([String(w)], { type: 'text/plain' });
          await ablage.datei.put(store + ':' + ks[i], blob);
        }
      }
      db.close();
    } catch (e) { /* keine alten Dateien */ }
  }

  // Marke im Speicherort (app-daten.json): die alten Schlüssel dort sind schon übernommen, von welchem Gerät auch immer
  const ALT_MARKE = 'alt-uebernommen';

  async function migriere() {
    // In der App liefert die Ablage die alten Schlüssel aus app-daten.json im Speicherort, also auch die eines anderen Geräts.
    // Die bleiben in der Datei (Nutzerdaten), werden aber nur übernommen, wenn die Ablage sie beim ersten Start aus dem
    // Profil dieses Geräts geholt hat (lokal:alt-vom-geraet) und noch kein Gerät die Marke gesetzt hat. Sonst legt jedes neue
    // Gerät Dokumente wieder an, die das erste längst übernommen und gelöscht hat.
    const geteilt = [...eintraege.keys()].some(k => k.startsWith('mathe-des-tages:'));
    if (get('lokal:migriert-v2')) {
      // Geräte mit älterer Fassung haben sich nur lokal gemerkt, dass sie übernommen haben: Marke nachtragen
      if (bruecke && geteilt && !get(ALT_MARKE)) set(ALT_MARKE, true);
      return;
    }
    const alt = new Map();
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.startsWith('mathe-des-tages:')) alt.set(k, localStorage.getItem(k));
      }
    } catch (e) { /* kein localStorage */ }
    // Im Browser stammen sie aus dem eigenen IndexedDB, in der App aus dem Speicherort
    if (!bruecke || (get('lokal:alt-vom-geraet') && !get(ALT_MARKE))) {
      for (const [k, e] of eintraege) if (k.startsWith('mathe-des-tages:') && typeof e.v === 'string') alt.set(k, e.v);
    }
    uebernehmeAlt(alt);
    await alteIdbDateien();
    for (const k of [...eintraege.keys()]) if (k.startsWith('mathe-des-tages:')) { eintraege.delete(k); sichere(k); }
    if (bruecke && geteilt) set(ALT_MARKE, true);
    set('lokal:migriert-v2', true);
  }

  /* ---------- Start ---------- */

  const bereit = (async () => {
    if (bruecke) { ablage = brueckenAblage(); ablageArt = 'app'; }
    else if (window.indexedDB) ablage = idbAblage();
    else { ablage = speicherAblage(); ablageArt = 'fluechtig'; }
    let roh = {};
    try { roh = await ablage.laden(); } catch (e) {
      console.warn('Lernheft: lokaler Speicher nicht verfügbar', e);
      ablage = speicherAblage();
      ablageArt = 'fluechtig';
    }
    for (const [k, r] of Object.entries(roh || {})) {
      if (!r) continue;
      eintraege.set(k, ausRoh(r));
    }
    try { await migriere(); } catch (e) { console.warn('Lernheft: Übernahme alter Daten', e); }
  })();

  const Daten = window.Daten = {
    bereit, get, set, del, keys, datei, lade, vergiss, istFaul, strichText,
    // Stand eines Eintrags (ändert sich mit jeder Änderung, auch von aussen), z. B. für zwischengespeicherte Vorschaubilder
    // fn mit geladener Handschrift des Dokuments id ausführen (Export, Umwandeln) und danach wieder freigeben, was vorher
    // nicht im Speicher lag (ausser das Dokument ist offen)
    async mitHandschrift(id, fn) {
      const keys = keys_('ink:' + id + ':'), faul = keys.filter(istFaul);
      if (!(await lade(keys))) throw new Error('Einige Seiten sind noch nicht da (die Cloud lädt sie gerade). Bitte gleich noch einmal versuchen.');
      try { return await fn(); } finally {
        if (!(window.Dokument && Dokument.istGeladen && Dokument.istGeladen(id))) { schreibeJetzt(); vergiss(faul); }
      }
    },
    stand: k => { const e = eintraege.get(k); return e ? (e.weg ? -1 : e.zeit || 0) : 0; },
    on: fn => { hoerer.add(fn); return () => hoerer.delete(fn); },
    flush: schreibeJetzt,
    ablageArt: () => ablageArt,
    uebernehmeAlt, mischeElemente, mischeLog,
    _intern: intern,
    dateiQuelle: null, dateiNeu: null, dateiWeg: null
  };
})();
