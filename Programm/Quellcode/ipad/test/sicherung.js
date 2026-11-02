'use strict';
// Sicherung in einen Ordner (iCloud Drive) gegen einen nachgebauten Ordner auf der Festplatte, der sich verhält wie das
// Swift-Modul LHOrdner (Teile in base64, übernehmen, lesen in Stücken, Platzhalter ".Name.icloud" für nicht geladene
// Dateien). Prüft: erste Sicherung, nur Geändertes, Löschen, Tages-Sicherungen (PC kann sie importieren, 30 bleiben),
// Schutz vor leerem iPad, grosse Dateien, Wiederherstellen auf einem neuen iPad samt PDFs.
//   node test/sicherung.js [vorlage] [ausgabe.json]
const os = require('os');
const { fs, path, LHKnoten, LHSpeicher, LHFormat, ladeAblage, kopiereHinein, pruefe, warte, ende, vorlage: waehleVorlage, QUELLE } = require('./hilfe');
const LHSicherung = require('../web/sicherung.js');

const vorlage = waehleVorlage(process.argv[2]);
const L = '/Lernheft';

// Nachbau des Swift-Moduls auf einem echten Ordner
function nachgebauterOrdner(dir) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lh-teile-'));
  const zaehler = { teil: 0, uebernimm: 0, lies: 0, loesche: 0 };
  const sicher = rel => {
    const teile = String(rel || '').split('/').filter(Boolean);
    if (teile.some(t => t === '..' || t === '.')) throw new Error('Ungültiger Pfad');
    return path.join(dir, ...teile);
  };
  let gewaehlt = true;
  return {
    zaehler, dir,
    waehlbar: v => { gewaehlt = v; },
    async info() { return { gewaehlt, name: path.basename(dir) }; },
    async liste({ pfad, tief }) {
      const start = sicher(pfad);
      const eintraege = [];
      const geh = d => {
        if (!fs.existsSync(d)) return;
        for (const e of fs.readdirSync(d, { withFileTypes: true })) {
          const p = path.join(d, e.name);
          const rel = path.relative(dir, p).split(path.sep).join('/');
          if (e.isDirectory()) { eintraege.push({ pfad: rel, ordner: true }); if (tief) geh(p); }
          else eintraege.push({ pfad: rel, ordner: false, groesse: fs.statSync(p).size });
        }
      };
      geh(start);
      return { eintraege };
    },
    async teil({ id, daten, neu }) { zaehler.teil++; const p = path.join(tmp, id); if (neu) fs.writeFileSync(p, ''); fs.appendFileSync(p, Buffer.from(daten || '', 'base64')); },
    async uebernimm({ id, pfad }) { zaehler.uebernimm++; const z = sicher(pfad); fs.mkdirSync(path.dirname(z), { recursive: true }); fs.copyFileSync(path.join(tmp, id), z); fs.rmSync(path.join(tmp, id)); },
    async lies({ pfad, von, laenge }) {
      zaehler.lies++;
      let z = sicher(pfad);
      // Platzhalter: wie iCloud erst laden
      const platz = path.join(path.dirname(z), '.' + path.basename(z) + '.icloud');
      if (!fs.existsSync(z) && fs.existsSync(platz)) { fs.renameSync(platz + '.inhalt', z); fs.rmSync(platz); }
      const b = fs.readFileSync(z);
      return { daten: b.subarray(von, von + laenge).toString('base64'), groesse: b.length };
    },
    async loesche({ pfad }) {
      zaehler.loesche++;
      const z = sicher(pfad);
      const platz = path.join(path.dirname(z), '.' + path.basename(z) + '.icloud');
      if (fs.existsSync(z)) fs.rmSync(z, { recursive: true });
      else if (fs.existsSync(platz)) { fs.rmSync(platz); fs.rmSync(platz + '.inhalt', { force: true }); }
    }
  };
}

async function neuesIpad(speicher) {
  const memfs = LHKnoten.erstelleSpeicherFs();
  const sicherung = await LHSpeicher.verbinde(memfs, speicher, { verzoegerung: 10 });
  return { memfs, sicherung };
}
const zustandVon = speicher => ({ hol: k => speicher.zustandHol(k), setz: (k, v) => speicher.zustandSetz(k, v) });
const strich = (id, x) => ({ id, w: 'stift', f: 'schwarz', d: 2, m: Date.now(), p: [[x, 10, 0.5], [x + 30, 40, 0.5], [x + 60, 15, 0.5]] });
const dateienIn = d => { const r = []; const geh = q => { for (const e of fs.readdirSync(q, { withFileTypes: true })) { const p = path.join(q, e.name); if (e.isDirectory()) geh(p); else r.push(path.relative(d, p).split(path.sep).join('/')); } }; if (fs.existsSync(d)) geh(d); return r.sort(); };

(async () => {
  const ziel = fs.mkdtempSync(path.join(os.tmpdir(), 'lh-icloud-'));
  const O = nachgebauterOrdner(ziel);
  let uhr = new Date('2026-10-31T10:00:00').getTime();

  /* iPad mit der Vorlage */
  const speicher = LHSpeicher.imSpeicher();
  const A = await neuesIpad(speicher);
  A.memfs.alsQuelle('wolke', () => kopiereHinein(A.memfs, vorlage, L));
  const ablage = ladeAblage(A.memfs).erstelleAblage({ wurzel: L, melde: () => {}, format: LHFormat, lokalDatei: '/geraet/l.json' });
  const gross = new Uint8Array(3 * 1024 * 1024 + 17).map((_, i) => (i * 31) & 255);   // mehrere Teile, ausgelagert
  ablage.datei.put('pdf:gr', gross);
  ablage.setze({ 'bib:gr': { v: { art: 'skript', name: 'Grosses Skript', eltern: null, datei: 'gr', seiten: 1, erstellt: 1 }, zeit: 1 } });
  ablage.sichern();
  await A.sicherung.flush();
  const protokoll = [];
  const S = LHSicherung.erstelle({ fs: A.memfs, ordner: O, ablage: () => ablage, liesGross: p => A.sicherung.lies(p), sichern: () => A.sicherung.flush(), zustand: zustandVon(speicher), lokal: L, protokoll: t => protokoll.push(t), jetzt: () => uhr });

  /* 1. Erste Sicherung */
  const r1 = await S.sichere();
  const lokalDateien = A.memfs.unter(L).filter(p => A.memfs.knoten.get(p).typ === 'f' && !p.endsWith('.tmp')).map(p => p.slice(L.length + 1)).sort();
  const kopie = dateienIn(path.join(ziel, 'Lernheft'));
  pruefe('Kopie = Lernheft-Ordner des iPads', JSON.stringify(kopie) === JSON.stringify(lokalDateien), { kopie: kopie.length, lokal: lokalDateien.length });
  const pdfPfad = lokalDateien.find(p => p.endsWith('Grosses Skript.pdf'));
  pruefe('grosse PDF (ausgelagert, in Teilen) vollständig', pdfPfad && Buffer.compare(fs.readFileSync(path.join(ziel, 'Lernheft', pdfPfad)), Buffer.from(gross)) === 0, pdfPfad);
  pruefe('Tages-Sicherung angelegt', r1.tagesSicherung === 'Lernheft-Sicherung 2026-10-31.lernheft' && fs.existsSync(path.join(ziel, r1.tagesSicherung)), r1);
  // Der PC kann sie importieren
  const pc = fs.mkdtempSync(path.join(os.tmpdir(), 'lh-pc-'));
  const pcAblage = require(path.join(QUELLE, 'app', 'ablage.js')).erstelleAblage({ wurzel: pc, melde: () => {}, format: LHFormat, lokalDatei: pc + '-lokal.json' });
  const pcBericht = pcAblage.importiereAlles(fs.readFileSync(path.join(ziel, r1.tagesSicherung)));
  // Dokumente und ihre Seiten (Seiten gelöschter Dokumente zählen nicht: die Ablage behält sie im Speicher)
  const nurDoks = kv => Object.keys(kv).filter(k => k.startsWith('bib:') || (k.startsWith('ink:') && kv['bib:' + k.split(':')[1]])).sort();
  pruefe('Tages-Sicherung lässt sich am PC importieren', JSON.stringify(nurDoks(pcAblage.alle())) === JSON.stringify(nurDoks(ablage.alle())), pcBericht);
  pcAblage.schliessen();

  /* 2. Nichts geändert: nichts geschrieben */
  const vorher = O.zaehler.uebernimm;
  const r2 = await S.sichere();
  pruefe('ohne Änderung nichts geschrieben', O.zaehler.uebernimm === vorher && r2.geschrieben === 0 && !r2.tagesSicherung, r2);

  /* 3. Eine Seite geändert: nur sie */
  ablage.setze({ 'bib:nb9': { v: { art: 'notizbuch', name: 'Neu', eltern: null, seiten: ['s1'], papier: 'karo', erstellt: 2 }, zeit: 2 }, 'ink:nb9:s1': { v: { e: [strich('a', 10)] }, zeit: 2 } });
  ablage.sichern();
  const r3a = await S.sichere();
  ablage.setze({ 'ink:nb9:s1': { v: { e: [strich('a', 10), strich('b', 90)] }, zeit: 3 } });
  ablage.sichern();
  const r3 = await S.sichere();
  pruefe('neues Notizbuch gesichert', fs.existsSync(path.join(ziel, 'Lernheft/Bibliothek/Neu/Handschrift/s1.lhz')), r3a);
  pruefe('Tages-Sicherung von heute erneuert (neuester Stand)', r3.tagesSicherung === 'Lernheft-Sicherung 2026-10-31.lernheft', r3.tagesSicherung);
  pruefe('danach nur die geänderte Seite geschrieben (samt Seitensicherung der Ablage)', r3.geschrieben >= 1 && r3.dateien.every(d => /s1\.lhz$/.test(d)) && r3.dateien.some(d => d === 'Bibliothek/Neu/Handschrift/s1.lhz'), r3.dateien);

  /* 4. Gelöscht: verschwindet aus der Kopie, liegt im Papierkorb der Kopie */
  ablage.setze({ 'bib:nb9': null });
  ablage.sichern();
  const r4 = await S.sichere();
  const korb = dateienIn(path.join(ziel, 'Lernheft/Daten/Papierkorb')).filter(p => /Neu\/Handschrift\/s1\.lhz$/.test(p));
  pruefe('gelöscht: weg aus der Bibliothek der Kopie, im Papierkorb der Kopie', !fs.existsSync(path.join(ziel, 'Lernheft/Bibliothek/Neu')) && korb.length === 1 && r4.geloescht > 0, { r4, korb });

  /* 5. Jeden Tag eine Datei, 30 bleiben */
  for (let t = 1; t <= 33; t++) { uhr += 24 * 3600e3; await S.sichere(); }
  const tage = await S.tagesSicherungen();
  pruefe('30 Tages-Sicherungen bleiben, die neueste zuerst', tage.length === 30 && tage[0] === 'Lernheft-Sicherung 2026-12-03.lernheft' && !tage.includes('Lernheft-Sicherung 2026-10-31.lernheft'), tage.slice(0, 2).concat(tage.slice(-1)));
  const sofort = await S.sichereWennFaellig(10 * 60e3);
  pruefe('automatisch: nicht, wenn gerade gesichert', sofort === null);
  uhr += 11 * 60e3;
  const spaeter = await S.sichereWennFaellig(10 * 60e3);
  pruefe('automatisch: nach 10 Minuten wieder', spaeter && spaeter.geschrieben === 0, spaeter);

  /* 6. Schutz: ein leeres iPad löscht die Kopie nicht */
  const leer = await neuesIpad(LHSpeicher.imSpeicher());
  leer.memfs.mkdirSync(L + '/Bibliothek', { recursive: true });
  const leerAblage = ladeAblage(leer.memfs).erstelleAblage({ wurzel: L, melde: () => {}, format: LHFormat, lokalDatei: '/geraet/l.json' });
  const S2 = LHSicherung.erstelle({ fs: leer.memfs, ordner: O, ablage: () => leerAblage, liesGross: p => leer.sicherung.lies(p), zustand: zustandVon(LHSpeicher.imSpeicher()), lokal: L, protokoll: t => protokoll.push(t), jetzt: () => uhr });
  const anzahlVorher = dateienIn(path.join(ziel, 'Lernheft')).length;
  const r6 = await S2.sichere();
  pruefe('leeres iPad: in der Kopie nichts gelöscht', dateienIn(path.join(ziel, 'Lernheft')).length >= anzahlVorher && r6.geloescht === 0 && r6.nichtGeloescht > 0, r6);
  pruefe('leeres iPad: Tages-Sicherung nicht überschrieben', !r6.tagesSicherung && r6.tagesSicherungAusgelassen && fs.statSync(path.join(ziel, tage[0])).size > 500, fs.statSync(path.join(ziel, tage[0])).size);
  pruefe('und es steht in der Fehlerliste', protokoll.some(t => /zum Schutz/i.test(t)));
  leerAblage.schliessen();

  /* 7. Neues iPad: wiederherstellen (Notizen aus der neuesten Datei, PDFs aus der Kopie, auch nicht geladene) */
  const pdfZiel = path.join(ziel, 'Lernheft', pdfPfad);
  fs.renameSync(pdfZiel, path.join(path.dirname(pdfZiel), '.' + path.basename(pdfZiel) + '.icloud.inhalt'));
  fs.writeFileSync(path.join(path.dirname(pdfZiel), '.' + path.basename(pdfZiel) + '.icloud'), 'platzhalter');
  const sp3 = LHSpeicher.imSpeicher();
  const B = await neuesIpad(sp3);
  B.memfs.mkdirSync(L + '/Bibliothek', { recursive: true });
  const gemeldet = [];
  const ablageB = ladeAblage(B.memfs).erstelleAblage({ wurzel: L, melde: a => gemeldet.push(a), format: LHFormat, lokalDatei: '/geraet/l.json' });
  const S3 = LHSicherung.erstelle({ fs: B.memfs, ordner: O, ablage: () => ablageB, liesGross: p => B.sicherung.lies(p), zustand: zustandVon(sp3), lokal: L, jetzt: () => uhr });
  const r7 = await S3.wiederherstellen();
  await warte(2600);
  pruefe('wiederhergestellt aus der neuesten Datei', r7.datei === tage[0] && r7.dokumente > 0, r7);
  const vorlageDoks = nurDoks(ablage.alle());
  pruefe('alle Dokumente und Seiten wieder da', JSON.stringify(nurDoks(ablageB.alle())) === JSON.stringify(vorlageDoks), { hier: nurDoks(ablageB.alle()), dort: vorlageDoks });
  const pdfB = await B.sicherung.lies(L + '/' + pdfPfad).catch(() => null) || (B.memfs.knoten.get(L + '/' + pdfPfad) || {}).daten;
  pruefe('PDF aus der Kopie zurück (war noch nicht aus iCloud geladen)', r7.pdfs >= 1 && pdfB && Buffer.compare(Buffer.from(pdfB), Buffer.from(gross)) === 0, r7.pdfs);
  pruefe('Skript findet seine PDF', !!ablageB.datei.pfad('pdf:gr'));
  pruefe('Oberfläche bekommt den Stand gemeldet', gemeldet.some(a => Object.keys(a).some(k => k.startsWith('bib:'))));
  // Wiederherstellen ein zweites Mal: nichts doppelt
  const vorDoppelt = Object.keys(ablageB.alle()).length;
  const r7b = await S3.wiederherstellen();
  await warte(2600);
  pruefe('zweimal wiederherstellen: nichts doppelt', Object.keys(ablageB.alle()).length === vorDoppelt && r7b.neu === 0 && r7b.pdfs === 0, r7b);

  /* 8. Kein Ordner gewählt */
  O.waehlbar(false);
  let ohne = null;
  try { await S.sichere(); } catch (e) { ohne = e.message; }
  pruefe('ohne gewählten Ordner: verständlicher Fehler', /Kein Ordner/.test(ohne || ''), ohne);
  pruefe('Fehler steht im Status', /Kein Ordner/.test((await S.status()).fehler || ''));
  O.waehlbar(true);

  pruefe('base64 hin und zurück', Buffer.compare(Buffer.from(LHSicherung.ausBase64(LHSicherung.zuBase64(new Uint8Array([0, 255, 7, 128])))), Buffer.from([0, 255, 7, 128])) === 0);
  ablage.schliessen();
  ablageB.schliessen();
  fs.rmSync(ziel, { recursive: true, force: true });
  ende(process.argv[3]);
})().catch(e => { console.error(e); process.exit(1); });
