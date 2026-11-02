'use strict';
// Sichert das Dateisystem im Arbeitsspeicher (knoten.js) dauerhaft auf dem iPad, in IndexedDB der App.
// Kleine Dateien (Handschrift, Beschreibungen, Einstellungen) liegen mit ihrem Inhalt in "knoten" und sind nach dem
// Start sofort da. Grosse Dateien (PDFs) liegen als Blob in "inhalt" und werden erst gelesen, wenn man sie braucht.
// "zustand" hält den Stand des Abgleichs und die Anmeldung.
//
// Läuft im Browser (window.LHSpeicher) und in Node (für die Tests, mit einem Speicher im Arbeitsspeicher).
(function (wurzel, fabrik) {
  if (typeof module === 'object' && module.exports) module.exports = fabrik();
  else wurzel.LHSpeicher = fabrik();
})(typeof self !== 'undefined' ? self : this, function () {
  const GRENZE = 256 * 1024;   // grössere Dateien werden ausgelagert
  const neuerSchluessel = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 10);

  /* ---------- IndexedDB ---------- */

  function idb(name) {
    const anfrage = r => new Promise((ok, f) => { r.onsuccess = () => ok(r.result); r.onerror = () => f(r.error); });
    const fertig = t => new Promise((ok, f) => { t.oncomplete = () => ok(); t.onerror = () => f(t.error); t.onabort = () => f(t.error || new Error('abgebrochen')); });
    let db = null;
    const oeffne = () => db || (db = new Promise((ok, f) => {
      const r = indexedDB.open(name, 1);
      r.onupgradeneeded = () => { for (const s of ['knoten', 'inhalt', 'zustand']) r.result.createObjectStore(s); };
      r.onsuccess = () => ok(r.result);
      r.onerror = () => { db = null; f(r.error); };
    }));
    return {
      async laden() {
        const s = (await oeffne()).transaction('knoten').objectStore('knoten');
        const [ks, ws] = await Promise.all([anfrage(s.getAllKeys()), anfrage(s.getAll())]);
        return ks.map((k, i) => [k, ws[i]]);
      },
      async schreibe({ puts, weg, inhalte }) {
        const t = (await oeffne()).transaction(['knoten', 'inhalt'], 'readwrite');
        const k = t.objectStore('knoten'), i = t.objectStore('inhalt');
        for (const [schl, daten] of inhalte) i.put(new Blob([daten]), schl);
        for (const p of weg) k.delete(p);
        for (const [p, r] of puts) k.put(r, p);
        return fertig(t);
      },
      async inhalt(schl) {
        const b = await anfrage((await oeffne()).transaction('inhalt').objectStore('inhalt').get(schl));
        if (!b) return null;
        return new Uint8Array(await b.arrayBuffer());
      },
      async aufraeumen(lebende) {
        const t = (await oeffne()).transaction('inhalt', 'readwrite');
        const s = t.objectStore('inhalt');
        const ks = await anfrage(s.getAllKeys());
        for (const k of ks) if (!lebende.has(k)) s.delete(k);
        return fertig(t);
      },
      async zustandHol(k) { return anfrage((await oeffne()).transaction('zustand').objectStore('zustand').get(k)); },
      async zustandSetz(k, v) { const t = (await oeffne()).transaction('zustand', 'readwrite'); if (v === undefined) t.objectStore('zustand').delete(k); else t.objectStore('zustand').put(v, k); return fertig(t); },
      async alles_loeschen() { const t = (await oeffne()).transaction(['knoten', 'inhalt', 'zustand'], 'readwrite'); for (const s of ['knoten', 'inhalt', 'zustand']) t.objectStore(s).clear(); return fertig(t); }
    };
  }

  // Gleiche Schnittstelle ohne Browser (Tests)
  function imSpeicher() {
    const knoten = new Map(), inhalt = new Map(), zustand = new Map();
    const kopie = v => (v === undefined ? v : JSON.parse(JSON.stringify(v, (k, x) => (x instanceof Uint8Array ? { __u8: Array.from(x) } : x)), (k, x) => (x && x.__u8 ? Uint8Array.from(x.__u8) : x)));
    return {
      knoten, inhalt, zustand,
      async laden() { return [...knoten].map(([k, v]) => [k, kopie(v)]); },
      async schreibe({ puts, weg, inhalte }) { for (const [s, d] of inhalte) inhalt.set(s, d.slice()); for (const p of weg) knoten.delete(p); for (const [p, r] of puts) knoten.set(p, kopie(r)); },
      async inhalt(s) { const d = inhalt.get(s); return d ? d.slice() : null; },
      async aufraeumen(lebende) { for (const k of [...inhalt.keys()]) if (!lebende.has(k)) inhalt.delete(k); },
      async zustandHol(k) { return kopie(zustand.get(k)); },
      async zustandSetz(k, v) { if (v === undefined) zustand.delete(k); else zustand.set(k, kopie(v)); },
      async alles_loeschen() { knoten.clear(); inhalt.clear(); zustand.clear(); }
    };
  }

  /* ---------- Dateisystem <-> Speicher ---------- */

  // Lädt den gesicherten Stand ins Dateisystem und sichert danach jede Änderung (gesammelt, nach kurzer Pause)
  async function verbinde(fs, speicher, opt) {
    const verzoegerung = (opt && opt.verzoegerung) || 250;
    const eintraege = await speicher.laden();
    fs.stelleWiederHer(eintraege);
    const bekannt = new Set(eintraege.map(e => e[0]));
    // Inhalte, auf die keine Datei mehr zeigt (überschrieben, gelöscht), beim Start entfernen
    const lebende = new Set(eintraege.map(e => e[1] && e[1].inhalt).filter(Boolean));
    speicher.aufraeumen(lebende).catch(e => console.warn('Lernheft: Speicher aufräumen', e));

    const offen = new Set();
    let timer = null, laeuft = null, nochmal = false;
    const istTmp = p => p.endsWith('.tmp');
    const merke = p => { if (!istTmp(p)) offen.add(p); };
    // Gelöscht oder verschoben: was davon gesichert ist, muss aus dem Speicher (bei Ordnern alles darunter)
    const vergiss = (p, ordner) => {
      if (!ordner) { if (bekannt.has(p)) offen.add(p); return; }
      for (const q of bekannt) if (q === p || q.startsWith(p + '/')) offen.add(q);
    };

    fs.aufAenderung(e => {
      if (e.art === 'datei' || e.art === 'ordner' || e.art === 'gefuellt') merke(e.pfad);
      else if (e.art === 'weg') vergiss(e.pfad, e.ordner);
      else if (e.art === 'umbenannt') { if (!istTmp(e.von)) vergiss(e.von, e.ordner); for (const q of fs.unter(e.nach)) merke(q); }
      plane();
    });
    function plane() { if (!timer) timer = setTimeout(sichern, verzoegerung); }

    async function sichern() {
      clearTimeout(timer);
      timer = null;
      if (laeuft) { nochmal = true; return laeuft; }
      if (!offen.size) return;
      const pfade = [...offen];
      offen.clear();
      const puts = [], weg = [], inhalte = [], auslagern = [];
      for (const p of pfade) {
        const k = fs.knoten.get(p);
        if (!k) { if (bekannt.has(p)) weg.push(p); continue; }
        if (k.typ === 'd') { puts.push([p, { typ: 'd', mtimeMs: k.mtimeMs }]); continue; }
        const r = { typ: 'f', mtimeMs: k.mtimeMs, groesse: k.groesse };
        if (k.daten && k.daten.byteLength > GRENZE) {
          const s = neuerSchluessel();
          inhalte.push([s, k.daten]);
          r.inhalt = s;
          auslagern.push([p, s, k.daten]);
        } else if (k.daten) r.daten = k.daten;
        else if (k.inhalt) r.inhalt = k.inhalt;
        if (k.fehlt) { r.fehlt = true; if (k.quelleId) r.quelleId = k.quelleId; }
        puts.push([p, r]);
      }
      laeuft = speicher.schreibe({ puts, weg, inhalte }).then(() => {
        for (const p of weg) bekannt.delete(p);
        for (const [p] of puts) bekannt.add(p);
        // Grosse Inhalte liegen jetzt im Speicher und müssen nicht im Arbeitsspeicher bleiben
        for (const [p, s, d] of auslagern) fs.lagerAus(p, s, d);
      }, e => {
        console.error('Lernheft: auf dem iPad sichern fehlgeschlagen', e);
        for (const p of pfade) offen.add(p);
        throw e;
      }).finally(() => {
        laeuft = null;
        if (nochmal || offen.size) { nochmal = false; plane(); }
      });
      return laeuft;
    }

    return {
      // Alles Wartende jetzt sichern (vor dem Schliessen der App)
      async flush() { while (offen.size || laeuft) { if (laeuft) await laeuft.catch(() => {}); else await sichern(); } },
      // Inhalt einer Datei: aus dem Arbeitsspeicher oder dem Speicher; null, wenn sie noch nicht geladen ist
      async lies(p) {
        const k = fs.knoten.get(p);
        if (!k || k.typ !== 'f') return null;
        if (k.daten) return k.daten.slice();
        if (k.inhalt) return speicher.inhalt(k.inhalt);
        return null;
      },
      ausstehend: () => offen.size
    };
  }

  return { idb, imSpeicher, verbinde, GRENZE };
});
