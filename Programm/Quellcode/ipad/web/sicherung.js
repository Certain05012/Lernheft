'use strict';
// Sicherung in einen Ordner, den du in der Dateien-App wählst (gedacht für iCloud Drive, geht aber mit jedem Ordner
// dort). Unabhängig vom Abgleich mit OneDrive oder Dropbox, auch ohne Cloud.
//
// Im gewählten Ordner entsteht:
//   Lernheft/                                 vollständige Kopie des Lernheft-Ordners (Bibliothek, Daten, PDFs), genau
//                                             wie am PC. Geschrieben wird nur, was sich geändert hat; was im Lernheft
//                                             nicht mehr ist, verschwindet auch hier (Gelöschtes liegt ja im Papierkorb
//                                             des Lernhefts, Daten/Papierkorb, und ist damit weiter gesichert).
//   Lernheft-Sicherung <Datum>.lernheft       je Tag alle Notizen und Einstellungen in einer Datei (ohne PDFs); die
//                                             von heute wird bei jeder Sicherung mit Änderungen erneuert, die letzten
//                                             30 Tage bleiben. Das Lernheft am PC kann sie importieren
//                                             (Menü › Speicherort › Sicherung importieren).
//
// Wiederherstellen: die neueste .lernheft-Datei wird mit dem Stand auf dem iPad zusammengeführt (nichts wird
// überschrieben), PDFs, die hier fehlen, kommen aus der Kopie.
//
// Schutz: sieht das Lernheft auf dem iPad viel leerer aus als die Kopie (neu installiert, etwas schiefgegangen), wird
// in der Kopie nichts gelöscht.
//
// ordner: der Zugang zum gewählten Ordner (iPad: Swift-Modul LHOrdner, ios/App/App/Sicherung.swift; Test: Nachbau):
//   info() -> { gewaehlt, name }        liste({ pfad, tief }) -> { eintraege: [{ pfad, ordner, groesse }] }
//   teil({ id, daten (base64), neu })   uebernimm({ id, pfad })  (Teile zu einer Datei im Ordner)
//   lies({ pfad, von, laenge }) -> { daten (base64), groesse }   loesche({ pfad })
// Pfade sind relativ zum gewählten Ordner, mit "/".
(function (wurzel, fabrik) {
  if (typeof module === 'object' && module.exports) module.exports = fabrik();
  else wurzel.LHSicherung = fabrik();
})(typeof self !== 'undefined' ? self : this, function () {
  const KOPIE = 'Lernheft';
  const TEIL = 1536 * 1024;               // so viele Bytes je Aufruf (als base64 etwa 2 MB)
  const BEHALTEN = 30;                    // so viele Tages-Sicherungen bleiben
  const AUSLASSEN = /(^|\/)[^/]*\.tmp$/;  // halb geschriebene Dateien
  const TAGES = /^Lernheft-Sicherung (\d{4}-\d{2}-\d{2})\.lernheft$/;
  // iCloud Drive zeigt noch nicht geladene Dateien je nach iOS als ".Name.icloud"
  const PLATZHALTER = /(^|\/)\.([^/]+)\.icloud$/;

  function zuBase64(bytes) {
    if (typeof Buffer !== 'undefined' && !(typeof window !== 'undefined')) return Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength).toString('base64');
    let s = '';
    for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(s);
  }
  function ausBase64(text) {
    if (typeof Buffer !== 'undefined' && !(typeof window !== 'undefined')) return new Uint8Array(Buffer.from(text || '', 'base64'));
    const s = atob(text || '');
    const b = new Uint8Array(s.length);
    for (let i = 0; i < s.length; i++) b[i] = s.charCodeAt(i);
    return b;
  }
  const tagVon = ms => { const d = new Date(ms); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

  // fs: knoten.js (Lernheft auf dem iPad); ablage(): die laufende Ablage; liesGross(pfad): Inhalt ausgelagerter Dateien;
  // sichern(): wartet, bis alles im Speicher des iPads ist; zustand: { hol, setz }; jetzt(): Uhr (für Tests)
  function erstelle({ fs, ordner, ablage, liesGross, sichern = async () => {}, zustand, lokal = '/Lernheft', protokoll = () => {}, jetzt = () => Date.now() }) {
    let st = null;
    let laeuft = null;
    const relativ = p => p.slice(lokal.length + 1);
    async function stand() { if (!st) st = Object.assign({ dateien: {}, zuletzt: 0, tag: '', fehler: null }, (await zustand.hol('sicherung-ordner')) || {}); return st; }
    const speichere = () => zustand.setz('sicherung-ordner', st);

    async function schreibe(pfad, bytes) {
      const id = 'lh' + jetzt().toString(36) + Math.random().toString(36).slice(2, 8);
      if (!bytes.byteLength) await ordner.teil({ id, daten: '', neu: true });
      for (let von = 0; von < bytes.byteLength; von += TEIL) await ordner.teil({ id, daten: zuBase64(bytes.subarray(von, Math.min(bytes.byteLength, von + TEIL))), neu: von === 0 });
      await ordner.uebernimm({ id, pfad });
    }
    async function liesGanz(pfad) {
      const teile = [];
      let von = 0, groesse = Infinity;
      while (von < groesse) {
        const r = await ordner.lies({ pfad, von, laenge: TEIL });
        groesse = r.groesse;
        const b = ausBase64(r.daten);
        if (!b.byteLength) break;
        teile.push(b);
        von += b.byteLength;
      }
      const alles = new Uint8Array(teile.reduce((n, b) => n + b.byteLength, 0));
      let o = 0;
      for (const b of teile) { alles.set(b, o); o += b.byteLength; }
      return alles;
    }
    // Was liegt im Ordner? Pfad (ohne Platzhalter-Schreibweise) -> Grösse (null = noch nicht geladen)
    async function inhalt(pfad, tief) {
      const r = await ordner.liste({ pfad, tief });
      const m = new Map();
      for (const e of (r && r.eintraege) || []) {
        if (e.ordner) continue;
        const p = PLATZHALTER.exec(e.pfad);
        if (p) m.set(e.pfad.replace(PLATZHALTER, (x, vor, name) => vor + name), null);
        else m.set(e.pfad, e.groesse);
      }
      return m;
    }

    async function sichereJetzt({ tagesSicherung } = {}) {
      const s = await stand();
      const info = await ordner.info();
      if (!info || !info.gewaehlt) throw new Error('Kein Ordner für die Sicherung gewählt.');
      const ab = ablage();
      if (ab) ab.sichern();
      await sichern();
      const bericht = { geschrieben: 0, geloescht: 0, bytes: 0, tagesSicherung: null, ausgelassen: 0, nichtGeloescht: 0, dateien: [] };

      // 1. Kopie des Lernheft-Ordners
      const dortListe = ((await ordner.liste({ pfad: KOPIE, tief: true })) || {}).eintraege || [];
      const dort = await inhalt(KOPIE, true);
      const hier = new Map();
      for (const q of fs.unter(lokal)) {
        const k = fs.knoten.get(q);
        if (!k || k.typ !== 'f') continue;
        const rel = relativ(q);
        if (!rel || AUSLASSEN.test(rel)) continue;
        hier.set(rel, k);
      }
      for (const [rel, k] of hier) {
        const ziel = KOPIE + '/' + rel;
        const bekannt = s.dateien[rel];
        if (bekannt && bekannt.m === k.mtimeMs && bekannt.g === k.groesse && dort.has(ziel)) continue;
        // Noch nicht vom Abgleich geladen (grosse PDFs): bleibt, wie es in der Kopie ist
        if (k.fehlt) { bericht.ausgelassen++; continue; }
        const daten = k.daten || (k.inhalt ? await liesGross(lokal + '/' + rel) : null);
        if (!daten) { bericht.ausgelassen++; continue; }
        await schreibe(ziel, daten);
        s.dateien[rel] = { m: k.mtimeMs, g: k.groesse };
        bericht.geschrieben++;
        if (bericht.dateien.length < 50) bericht.dateien.push(rel);
        bericht.bytes += daten.byteLength;
        if (bericht.geschrieben % 25 === 0) await speichere();
      }
      const ueberzaehlig = [...dort.keys()].filter(p => p.startsWith(KOPIE + '/') && !hier.has(p.slice(KOPIE.length + 1)));
      const vieleWeg = dort.size > 10 && hier.size < dort.size / 2;
      if (vieleWeg && ueberzaehlig.length) {
        bericht.nichtGeloescht = ueberzaehlig.length;
        protokoll(`Sicherung: auf dem iPad sind nur ${hier.size} Dateien, in der Kopie ${dort.size}. Zum Schutz wird in der Kopie nichts gelöscht.`);
      } else {
        for (const p of ueberzaehlig) { await ordner.loesche({ pfad: p }); delete s.dateien[p.slice(KOPIE.length + 1)]; bericht.geloescht++; }
        // Ordner, die es auf dem iPad nicht mehr gibt (z. B. ein gelöschtes Dokument): mit weg, die obersten zuerst
        const weg = dortListe.filter(e => e.ordner && e.pfad.startsWith(KOPIE + '/') && !fs.existsSync(lokal + '/' + e.pfad.slice(KOPIE.length + 1))).map(e => e.pfad).sort((a, b) => a.length - b.length);
        const erledigt = [];
        for (const p of weg) {
          if (erledigt.some(o => p.startsWith(o + '/'))) continue;
          await ordner.loesche({ pfad: p });
          erledigt.push(p);
        }
      }
      for (const rel of Object.keys(s.dateien)) if (!hier.has(rel)) delete s.dateien[rel];

      // 2. Einmal am Tag alle Notizen in einer Datei
      const heute = tagVon(jetzt());
      // Nie eine Tages-Sicherung durch eine (fast) leere ersetzen: greift der Schutz oben, oder hat das iPad gar keine
      // Dokumente, während es schon Tages-Sicherungen gibt, bleibt die Datei, wie sie ist
      const dokumente = ab ? Object.keys(ab.alle()).filter(k => k.startsWith('bib:')).length : 0;
      const schonDa = (await inhalt('', false));
      const gibtTage = [...schonDa.keys()].some(p => TAGES.test(p));
      // Die Datei von heute wird bei jeder Sicherung erneuert, in der sich etwas geändert hat: sie ist so immer der
      // neueste Stand (aus ihr wird wiederhergestellt), die der Vortage bleiben als Verlauf
      const faellig = tagesSicherung || s.tag !== heute || bericht.geschrieben > 0 || bericht.geloescht > 0;
      if (ab && faellig && (vieleWeg || (!dokumente && gibtTage))) {
        protokoll('Sicherung: keine neue Tages-Sicherung, das Lernheft auf dem iPad ist (fast) leer. Die bisherigen bleiben.');
        bericht.tagesSicherungAusgelassen = true;
      } else if (ab && faellig) {
        const daten = new Uint8Array(ab.exportiereAlles());
        const name = `Lernheft-Sicherung ${heute}.lernheft`;
        await schreibe(name, daten);
        s.tag = heute;
        bericht.tagesSicherung = name;
        bericht.bytes += daten.byteLength;
        const alte = [...(await inhalt('', false)).keys()].filter(p => TAGES.test(p)).sort().reverse().slice(BEHALTEN);
        for (const p of alte) await ordner.loesche({ pfad: p });
      }
      s.zuletzt = jetzt();
      s.fehler = null;
      await speichere();
      return bericht;
    }

    return {
      // Sichern (nur eine Sicherung zur gleichen Zeit). tagesSicherung: auch die .lernheft-Datei, selbst wenn es
      // heute schon eine gibt
      async sichere(opt) {
        if (laeuft) return laeuft;
        laeuft = sichereJetzt(opt).catch(async e => {
          const s = await stand();
          s.fehler = e.message;
          await speichere();
          throw e;
        }).finally(() => { laeuft = null; });
        return laeuft;
      },
      // Sichern, wenn die letzte Sicherung älter ist als ms (automatisch: beim Wechsel in den Hintergrund, nach dem Start)
      async sichereWennFaellig(ms) {
        const s = await stand();
        const info = await ordner.info().catch(() => null);
        if (!info || !info.gewaehlt || jetzt() - s.zuletzt < ms) return null;
        return this.sichere().catch(e => { protokoll('Sicherung: ' + e.message); return null; });
      },
      async status() { const s = await stand(); const info = await ordner.info().catch(() => null); return { gewaehlt: !!(info && info.gewaehlt), name: info && info.name, zuletzt: s.zuletzt, fehler: s.fehler, dateien: Object.keys(s.dateien).length }; },
      // Neuen Ordner gewählt: alles neu schreiben
      async vergiss() { st = { dateien: {}, zuletzt: 0, tag: '', fehler: null }; await speichere(); },
      // Tages-Sicherungen im Ordner, neueste zuerst
      async tagesSicherungen() { return [...(await inhalt('', false)).keys()].filter(p => TAGES.test(p)).sort().reverse(); },
      // Aus dem Ordner zurückholen: neueste Tages-Sicherung (oder die angegebene) zusammenführen, fehlende PDFs aus der Kopie
      async wiederherstellen(name) {
        const ab = ablage();
        if (!ab) throw new Error('Das Lernheft ist noch nicht bereit.');
        const liste = await this.tagesSicherungen();
        const datei = name || liste[0];
        if (!datei) throw new Error('Im gewählten Ordner gibt es keine Lernheft-Sicherung.');
        const bericht = Object.assign({ datei, pdfs: 0 }, ab.importiereAlles(await liesGanz(datei)));
        // PDFs: nur in Ordner von Dokumenten, die es (jetzt) auf dem iPad gibt
        const dort = await inhalt(KOPIE, true);
        const neu = [];
        for (const p of dort.keys()) {
          if (!/\.pdf$/i.test(p) || !p.startsWith(KOPIE + '/Bibliothek/')) continue;
          const rel = p.slice(KOPIE.length + 1);
          const ziel = lokal + '/' + rel;
          const eltern = ziel.slice(0, ziel.lastIndexOf('/'));
          if (fs.existsSync(ziel) || !fs.existsSync(eltern + '/Handschrift.lernheft.json')) continue;
          fs.writeFileSync(ziel, await liesGanz(p));
          neu.push(ziel);
          bericht.pdfs++;
        }
        if (neu.length) fs.meldeBeobachter(neu);
        return bericht;
      }
    };
  }

  return { erstelle, zuBase64, ausBase64, KOPIE, TAGES };
});
