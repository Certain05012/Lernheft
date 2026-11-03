'use strict';
// Abgleich iPad <-> OneDrive gegen die nachgebaute Graph-Schnittstelle. Ein Test spielt das iPad (Speicher-Dateisystem,
// ablage.js, abgleich.js), ein anderer Teil "den PC", der die Dateien in OneDrive ändert wie der OneDrive-Client.
// Mit --dropbox derselbe Ablauf gegen die nachgebaute Dropbox (dropbox.js statt onedrive.js).
//   node test/abgleich.js [--dropbox] [vorlage] [ausgabe.json]
const { fs, path, LHKnoten, LHSpeicher, LHFormat, ladeAblage, pruefe, warte, ende, vorlage: waehleVorlage, QUELLE, voll } = require('./hilfe');
const LHOneDrive = require('../web/onedrive.js');
const LHDropbox = require('../web/dropbox.js');
const LHAbgleich = require('../web/abgleich.js');
const { starteAttrappe } = require('./graph-attrappe');

const DBX = process.argv.includes('--dropbox');
const argumente = process.argv.slice(2).filter(a => a !== '--dropbox');
const NAME = DBX ? 'Dropbox' : 'OneDrive';
const vorlage = waehleVorlage(argumente[0]);
const L = '/Lernheft';
const gz = s => LHKnoten.zlib.gzipSync(Buffer.from(s));
const seiteText = (id, striche) => LHFormat.kodiereSeite(id, { e: striche });
const liesSeite = buf => LHFormat.dekodiereSeite(LHKnoten.zlib.gunzipSync(buf).toString());
const strich = (id, x, m) => ({ id, w: 'stift', f: 'schwarz', d: 2, m: m || Date.now(), p: [[x, 10, 0.5], [x + 30, 40, 0.5], [x + 60, 15, 0.5]] });

// Ein "iPad": Dateisystem, Speicher, Abgleich und (nach dem ersten Abgleich) die Ablage
async function neuesIpad(g, speicher, tokenZaehler) {
  const memfs = LHKnoten.erstelleSpeicherFs();
  const sicherung = await LHSpeicher.verbinde(memfs, speicher, { verzoegerung: 10 });
  const token = async neu => { tokenZaehler.n++; if (neu) tokenZaehler.neu++; return 'test-token'; };
  const drive = DBX ? LHDropbox.erstelle({ basis: g.dropbox, inhalt: g.dropboxInhalt, token }) : LHOneDrive.erstelle({ basis: g.basis, token });
  const zustand = { hol: k => speicher.zustandHol(k), setz: (k, v) => speicher.zustandSetz(k, v) };
  const protokoll = [];
  const ab = LHAbgleich.erstelle({ fs: memfs, drive, zustand, lies: p => sicherung.lies(p), sichern: () => sicherung.flush(), lokal: L, ordner: 'Lernheft', name: NAME, protokoll: t => protokoll.push(t) });
  const gemeldet = [];
  const ipad = { memfs, sicherung, ab, drive, protokoll, gemeldet, ablage: null };
  ipad.starteAblage = () => {
    ipad.ablage = ladeAblage(memfs).erstelleAblage({ wurzel: L, melde: a => gemeldet.push(a), format: LHFormat, lokalDatei: '/geraet/geraet-einstellungen.json' });
    return ipad.ablage;
  };
  return ipad;
}
// Was die Attrappe protokolliert: schreibende Aufrufe, Hochladen einer Datei, Verschieben, Hochladen in Teilen
const schreibend = z => (DBX ? /\/(upload|move_v2|delete_v2|create_folder_v2)/.test(z) : /^(PUT|PATCH|DELETE|POST)/.test(z));
const hochgeladen = (z, datei) => (DBX ? /\/files\/upload(_session\/finish)? /.test(z) : z.startsWith('PUT')) && (!datei || z.includes(datei));
const verschoben = z => (DBX ? z.includes('/files/move_v2') : z.startsWith('PATCH'));
const inTeilen = z => (DBX ? z.includes('upload_session/finish') : z.includes('createUploadSession'));
// Warten, bis die Ablage neu eingelesen hat (sie wartet nach einer Meldung etwa 1 s)
const nachEinlesen = () => warte(2600);

(async () => {
  const g = await starteAttrappe({ seite: 7 });
  const token = { n: 0, neu: 0 };

  // OneDrive mit einer Kopie des echten Lernhefts füllen
  const geh = (q, rel) => {
    for (const e of fs.readdirSync(q, { withFileTypes: true })) {
      const p = path.join(q, e.name), r = rel ? rel + '/' + e.name : e.name;
      if (e.isDirectory()) { g.pc.ordner('Lernheft/' + r); geh(p, r); } else g.pc.schreibe('Lernheft/' + r, fs.readFileSync(p));
    }
  };
  g.pc.ordner('Lernheft');
  geh(vorlage, '');
  g.pc.schreibe('Lernheft/Daten/Sicherung-Seiten/egal.lhz', 'nur am PC');
  g.pc.schreibe('Lernheft/Daten/Konflikte/2026-01-01/alt.lhz', 'alte Kopie');
  const pdfs = g.pc.liste('Lernheft').filter(p => p.endsWith('.pdf'));

  /* 1. Erster Abgleich */
  const speicher = LHSpeicher.imSpeicher();
  const A = await neuesIpad(g, speicher, token);
  pruefe('kein gespeicherter Stand', (await A.ab.lade()) === false);
  const wurzelEl = await A.ab.waehleOrdner(false);
  pruefe(NAME + '-Ordner gefunden', wurzelEl && wurzelEl.name === 'Lernheft');
  const r1 = await A.ab.ersteRunde();
  const lokalDateien = A.memfs.unter(L).filter(p => A.memfs.knoten.get(p).typ === 'f').map(p => p.slice(L.length + 1)).sort();
  const erwartet = g.pc.liste('Lernheft').filter(p => !p.endsWith('/') && !/^Daten\/(Sicherung-Seiten|Konflikte)\//.test(p));
  pruefe('alle Dateien da (ohne Sicherungen, Konflikte)', JSON.stringify(lokalDateien) === JSON.stringify(erwartet), { lokal: lokalDateien.length, erwartet: erwartet.length, r1 });
  const pdfKnoten = pdfs.map(p => A.memfs.knoten.get(L + '/' + p));
  pruefe('PDFs angelegt, Inhalt kommt später', pdfKnoten.every(k => k && k.fehlt && k.groesse > 0), pdfs.length + ' PDFs');
  const ablage = A.starteAblage();
  const platte = require(path.join(QUELLE, 'app', 'ablage.js')).erstelleAblage({ wurzel: fs.mkdtempSync(path.join(require('os').tmpdir(), 'lh-')), melde: () => {}, format: LHFormat });
  platte.schliessen();
  const echt = (() => { const t = fs.mkdtempSync(path.join(require('os').tmpdir(), 'lh-')); fs.cpSync(vorlage, t, { recursive: true }); const a = require(path.join(QUELLE, 'app', 'ablage.js')).erstelleAblage({ wurzel: t, melde: () => {}, format: LHFormat, lokalDatei: t + '-lokal.json' }); a.schliessen(); return voll(a); })();
  const nurDaten = kv => Object.keys(kv).filter(k => !k.startsWith('lokal:')).sort();
  pruefe('Ablage auf dem iPad sieht dasselbe wie am PC', JSON.stringify(nurDaten(voll(ablage))) === JSON.stringify(nurDaten(echt)), nurDaten(voll(ablage)).length + ' Schlüssel');
  const skriptId = Object.keys(voll(ablage)).find(k => k.startsWith('bib:') && voll(ablage)[k].v.art === 'skript').slice(4);
  pruefe('Skript-PDF wird gefunden, solange sie fehlt', !!ablage.datei.pfad('pdf:' + skriptId));

  A.ab.starte(600000);
  await warte(300);
  const pdfDa = () => pdfs.every(p => { const k = A.memfs.knoten.get(L + '/' + p); return k && !k.fehlt; });
  for (let i = 0; i < 40 && !pdfDa(); i++) await warte(100);
  pruefe('PDFs im Hintergrund geladen', pdfDa());
  const pdfInhalt = await A.sicherung.lies(L + '/' + pdfs[0]);
  pruefe('PDF-Inhalt stimmt', pdfInhalt && Buffer.compare(Buffer.from(pdfInhalt), g.pc.lies('Lernheft/' + pdfs[0])) === 0);
  pruefe('nichts hochgeladen beim ersten Abgleich', !g.protokoll.some(schreibend), g.protokoll.filter(schreibend).slice(0, 4));

  /* 2. Auf dem iPad schreiben */
  ablage.setze({
    'bib:nb1': { v: { art: 'notizbuch', name: 'iPad NB', eltern: null, seiten: ['s1'], papier: 'karo', erstellt: Date.now() }, zeit: Date.now() },
    'ink:nb1:s1': { v: { e: [strich('a1', 10)] }, zeit: Date.now() }
  });
  ablage.sichern();
  await A.ab.jetzt();
  const remoteSeite = g.pc.lies('Lernheft/Bibliothek/iPad NB/Handschrift/s1.lhz');
  pruefe('neue Seite in ' + NAME, remoteSeite && liesSeite(remoteSeite).e.map(e => e.id).join() === 'a1');
  pruefe('Beschreibung in ' + NAME, !!g.pc.lies('Lernheft/Bibliothek/iPad NB/Handschrift.lernheft.json'));
  pruefe('nichts mehr offen', A.ab.offen().hoch.length === 0 && A.ab.offen().ops.length === 0, A.ab.offen());

  /* 3. Am PC schreiben */
  g.pc.schreibe('Lernheft/Bibliothek/iPad NB/Handschrift/s1.lhz', gz(seiteText('s1', [strich('a1', 10, 1), strich('p1', 200)])));
  A.gemeldet.length = 0;
  await A.ab.jetzt();
  await nachEinlesen();
  const nachPc = voll(ablage)['ink:nb1:s1'];
  pruefe('Änderung vom PC auf dem iPad', nachPc && nachPc.v.e.map(e => e.id).sort().join() === 'a1,p1', nachPc && nachPc.v.e.map(e => e.id));
  pruefe('Oberfläche bekommt die Änderung gemeldet', A.gemeldet.some(a => a['ink:nb1:s1']));

  /* 4. Beide gleichzeitig: nichts geht verloren */
  ablage.setze({ 'ink:nb1:s1': { v: { e: nachPc.v.e.concat([strich('a2', 400)]) }, zeit: Date.now() } });
  ablage.sichern();
  const pcStand = liesSeite(g.pc.lies('Lernheft/Bibliothek/iPad NB/Handschrift/s1.lhz')).e;
  g.pc.schreibe('Lernheft/Bibliothek/iPad NB/Handschrift/s1.lhz', gz(seiteText('s1', pcStand.concat([strich('p2', 500)]))));
  await A.ab.jetzt();
  await nachEinlesen();
  await A.ab.jetzt();
  const beide = voll(ablage)['ink:nb1:s1'].v.e.map(e => e.id).sort().join();
  const beideRemote = liesSeite(g.pc.lies('Lernheft/Bibliothek/iPad NB/Handschrift/s1.lhz')).e.map(e => e.id).sort().join();
  pruefe('gleichzeitig geändert: iPad hat alles', beide === 'a1,a2,p1,p2', beide);
  pruefe('gleichzeitig geändert: ' + NAME + ' hat alles', beideRemote === 'a1,a2,p1,p2', beideRemote);
  pruefe('Konfliktkopie aufgehoben (Daten/Konflikte)', A.memfs.unter(L + '/Daten/Konflikte').some(p => p.endsWith(`s1 (${NAME}).lhz`)));
  pruefe('keine Konfliktkopie mehr neben der Seite', !g.pc.liste('Lernheft/Bibliothek/iPad NB').some(p => p.includes(NAME)) && !A.memfs.unter(L + '/Bibliothek').some(p => p.includes('(' + NAME)));

  /* 5. Auf dem iPad umbenennen: in der Cloud verschoben, nicht neu hochgeladen */
  const vorher = g.protokoll.length;
  ablage.setze({ 'bib:nb1': { v: { art: 'notizbuch', name: 'iPad Heft', eltern: null, seiten: ['s1'], papier: 'karo' }, zeit: Date.now() } });
  ablage.sichern();
  await A.ab.jetzt();
  const neuProt = g.protokoll.slice(vorher);
  pruefe('umbenannt in ' + NAME, g.pc.gibt('Lernheft/Bibliothek/iPad Heft/Handschrift/s1.lhz') && !g.pc.gibt('Lernheft/Bibliothek/iPad NB'));
  pruefe('als Verschieben, Seite nicht neu hochgeladen', neuProt.some(verschoben) && !neuProt.some(z => hochgeladen(z, 's1.lhz')), neuProt.filter(schreibend));

  /* 6. Am PC umbenennen: auf dem iPad umbenannt */
  g.pc.verschiebe('Lernheft/Bibliothek/iPad Heft', 'Lernheft/Bibliothek/Vom PC umbenannt');
  await A.ab.jetzt();
  await nachEinlesen();
  pruefe('PC-Umbenennung auf dem iPad', A.memfs.existsSync(L + '/Bibliothek/Vom PC umbenannt/Handschrift/s1.lhz') && voll(ablage)['bib:nb1'].v.name === 'Vom PC umbenannt', voll(ablage)['bib:nb1'] && voll(ablage)['bib:nb1'].v.name);
  pruefe('Seite danach unverändert', voll(ablage)['ink:nb1:s1'].v.e.length === 4);

  /* 7. Auf dem iPad löschen: in OneDrive im Papierkorb des Lernhefts */
  ablage.setze({ 'bib:nb1': null });
  ablage.sichern();
  await A.ab.jetzt();
  const korb = g.pc.liste('Lernheft/Daten/Papierkorb').filter(p => /Vom PC umbenannt\/Handschrift\/s1\.lhz$/.test(p));
  pruefe('gelöscht = in ' + NAME + ' im Lernheft-Papierkorb', korb.length === 1 && !g.pc.gibt('Lernheft/Bibliothek/Vom PC umbenannt'), korb);

  /* 8. Am PC ein Skript löschen (in den Papierkorb verschieben, wie die App am PC) */
  const skriptOrdner = g.pc.liste('Lernheft/Bibliothek').find(p => /^[^/]+\/$/.test(p) && g.pc.gibt('Lernheft/Bibliothek/' + p + 'Handschrift.lernheft.json')).replace(/\/$/, '');
  g.pc.verschiebe('Lernheft/Bibliothek/' + skriptOrdner, 'Lernheft/Daten/Papierkorb/2026-10-09-12-00 ' + skriptOrdner);
  await A.ab.jetzt();
  await nachEinlesen();
  const nochDa = Object.values(voll(ablage)).some(e => e.v && e.v.name === skriptOrdner);
  pruefe('am PC gelöscht: auf dem iPad weg', !nochDa && !A.memfs.existsSync(L + '/Bibliothek/' + skriptOrdner));
  pruefe('und im Papierkorb des iPads', ablage.papierkorb.liste().some(e => e.titel === skriptOrdner), ablage.papierkorb.liste().map(e => e.titel));

  /* 9. Offline schreiben, später hochladen */
  g.stoerung.offline = true;
  ablage.setze({
    'bib:nb2': { v: { art: 'notizbuch', name: 'Offline', eltern: null, seiten: ['s1'], papier: 'karo', erstellt: Date.now() }, zeit: Date.now() },
    'ink:nb2:s1': { v: { e: [strich('o1', 10)] }, zeit: Date.now() }
  });
  ablage.sichern();
  await A.ab.jetzt();
  pruefe('ohne Netz: Status offline', A.ab.status().zustand === 'offline', A.ab.status());
  g.stoerung.offline = false;
  await A.ab.jetzt();
  pruefe('wieder online: hochgeladen', !!g.pc.lies('Lernheft/Bibliothek/Offline/Handschrift/s1.lhz'));

  /* 10. Neustart der App: nichts doppelt, Änderungen vom PC kommen an */
  A.ab.halte();
  ablage.schliessen();
  await A.sicherung.flush();
  const B = await neuesIpad(g, speicher, token);
  pruefe('Stand nach Neustart geladen', (await B.ab.lade()) === true);
  pruefe('nach Neustart nichts offen', B.ab.offen().hoch.length === 0 && B.ab.offen().ops.length === 0, B.ab.offen());
  const ablageB = B.starteAblage();
  g.pc.schreibe('Lernheft/Bibliothek/Offline/Handschrift/s2.lhz', gz(seiteText('s2', [strich('p9', 30)])));
  const vorherB = g.protokoll.length;
  await B.ab.jetzt();
  await nachEinlesen();
  pruefe('nach Neustart: neue Seite vom PC da', !!voll(ablageB)['ink:nb2:s2']);
  pruefe('nach Neustart: nichts unnötig hochgeladen', !g.protokoll.slice(vorherB).some(z => hochgeladen(z)), g.protokoll.slice(vorherB).filter(schreibend));

  /* 11. Grosse PDF (in Teilen hochladen) */
  const gross = Buffer.alloc(9 * 1024 * 1024, 7);
  for (let i = 0; i < gross.length; i += 4096) gross[i] = i & 255;
  ablageB.datei.put('pdf:sk9', gross);
  ablageB.setze({ 'bib:sk9': { v: { art: 'skript', name: 'Gross', eltern: null, datei: 'sk9', seiten: 3, erstellt: Date.now() }, zeit: Date.now() } });
  ablageB.sichern();
  await B.ab.jetzt();
  const grossRemote = g.pc.lies('Lernheft/Bibliothek/Gross/Gross.pdf');
  pruefe('grosse PDF in Teilen hochgeladen', grossRemote && Buffer.compare(grossRemote, gross) === 0 && g.protokoll.some(inTeilen));

  /* 12. Die Cloud kennt den alten Stand nicht mehr (OneDrive 410, Dropbox reset), Anmeldung abgelaufen (401) */
  g.stoerung.deltaWeg = true;
  g.pc.schreibe('Lernheft/Bibliothek/Offline/Handschrift/s3.lhz', gz(seiteText('s3', [strich('p10', 30)])));
  g.stoerung.verloren = true;
  const neuVorher = token.neu;
  await B.ab.jetzt();
  await nachEinlesen();
  pruefe((DBX ? 'reset' : '410') + ': alles neu gelesen, Änderung da', !!voll(ablageB)['ink:nb2:s3']);
  pruefe('401: neues Token geholt', token.neu > neuVorher);
  pruefe('kein Fehler im Status', B.ab.status().zustand === 'bereit', B.ab.status());

  /* 13. Am PC gelöscht, auf dem iPad gleichzeitig geändert: bleibt erhalten */
  ablageB.setze({ 'ink:nb2:s1': { v: { e: [strich('o1', 10, 1), strich('o2', 90)] }, zeit: Date.now() } });
  ablageB.sichern();
  g.pc.loesche('Lernheft/Bibliothek/Offline/Handschrift/s1.lhz');
  await B.ab.jetzt();
  const s1 = g.pc.lies('Lernheft/Bibliothek/Offline/Handschrift/s1.lhz');
  pruefe('gelöscht am PC, geändert am iPad: bleibt (wieder in ' + NAME + ')', s1 && liesSeite(s1).e.length === 2);

  /* 13b. Umlaute in Namen, am PC nur Gross/klein geändert */
  ablageB.setze({
    'bib:nb3': { v: { art: 'notizbuch', name: 'Übungen Ä ö', eltern: null, seiten: ['s1'], papier: 'karo', erstellt: Date.now() }, zeit: Date.now() },
    'ink:nb3:s1': { v: { e: [strich('u1', 10)] }, zeit: Date.now() }
  });
  ablageB.sichern();
  await B.ab.jetzt();
  const umlaut = g.pc.lies('Lernheft/Bibliothek/Übungen Ä ö/Handschrift/s1.lhz');
  pruefe('Umlaute im Namen: hochgeladen', umlaut && liesSeite(umlaut).e[0].id === 'u1');
  g.pc.verschiebe('Lernheft/Bibliothek/Übungen Ä ö', 'Lernheft/Bibliothek/übungen ä ö');
  await B.ab.jetzt();
  await nachEinlesen();
  pruefe('am PC nur Gross/klein geändert: auf dem iPad auch', B.memfs.existsSync(L + '/Bibliothek/übungen ä ö/Handschrift/s1.lhz') && !B.memfs.existsSync(L + '/Bibliothek/Übungen Ä ö'), B.memfs.unter(L + '/Bibliothek').filter(p => /bungen/.test(p)).slice(0, 3));
  ablageB.setze({ 'ink:nb3:s1': { v: { e: [strich('u1', 10, 1), strich('u2', 80)] }, zeit: Date.now() } });
  ablageB.sichern();
  await B.ab.jetzt();
  const umlaut2 = g.pc.lies('Lernheft/Bibliothek/übungen ä ö/Handschrift/s1.lhz');
  pruefe('danach geschrieben: am neuen Ort in der Cloud', umlaut2 && liesSeite(umlaut2).e.length === 2 && g.pc.liste('Lernheft/Bibliothek').filter(p => /^.bungen [^/]*\/$/i.test(p)).length === 1, g.pc.liste('Lernheft/Bibliothek').filter(p => /bungen/i.test(p)).slice(0, 4));

  if (DBX) {
    /* 13c. Dropbox-Zugang direkt: veralteter Pfad, Löschen einer geänderten Datei, Fehlendes */
    const d = B.drive;
    g.pc.schreibe('Lernheft/Test/alt/x.bin', 'eins');
    const x = await d.nachPfad('Lernheft/Test/alt/x.bin');
    g.pc.verschiebe('Lernheft/Test/alt', 'Lernheft/Test/neu');
    const x2 = await d.hoch({ id: x.id, etag: x.eTag }, Buffer.from('zwei'));
    pruefe('Dropbox: Datei woanders als gemerkt: am neuen Ort hochgeladen', x2 && x2.pfad === '/Lernheft/Test/neu/x.bin' && String(g.pc.lies('Lernheft/Test/neu/x.bin')) === 'zwei');
    let f412 = null;
    try { await d.hoch({ id: x.id, etag: x.eTag }, Buffer.from('drei')); } catch (e) { f412 = e.status; }
    pruefe('Dropbox: alte rev beim Hochladen = 412', f412 === 412, f412);
    let fl412 = null;
    try { await d.loesche(x.id, x.eTag); } catch (e) { fl412 = e.status; }
    pruefe('Dropbox: Löschen mit alter rev = 412, Datei bleibt', fl412 === 412 && g.pc.gibt('Lernheft/Test/neu/x.bin'), fl412);
    await d.loesche(x.id, x2.eTag);
    await d.loesche(x.id, x2.eTag);
    pruefe('Dropbox: gelöscht, zweites Mal ohne Fehler', !g.pc.gibt('Lernheft/Test/neu/x.bin'));
    let f409 = null;
    try { await d.hoch({ ordnerId: B.ab._st().wurzelId, rel: 'Daten/app-daten.json' }, Buffer.from('{}')); } catch (e) { f409 = e.status; }
    pruefe('Dropbox: neu hochladen, wo es schon eine Datei gibt = 409', f409 === 409, f409);
    pruefe('Dropbox: nicht vorhanden = null', (await d.nachPfad('Lernheft/gibt es nicht')) === null);
    pruefe('Dropbox: Konto', (await d.laufwerk()).owner.user.displayName === 'Test Person');
    await B.ab.jetzt();
  }

  /* 14. Gespeichertes Dateisystem = Dateisystem im Arbeitsspeicher */
  await B.sicherung.flush();
  const fehlt = [...B.memfs.knoten.keys()].filter(q => q !== '/' && !q.endsWith('.tmp') && !speicher.knoten.has(q));
  pruefe('alles auf dem iPad gesichert', fehlt.length === 0, fehlt.slice(0, 3));
  pruefe('Protokoll ohne unerwartete Fehler', !B.protokoll.concat(A.protokoll).some(t => /Abgleich:/.test(t)), B.protokoll.concat(A.protokoll));

  B.ab.halte();
  ablageB.schliessen();
  await g.schliesse();
  ende(argumente[1]);
})().catch(e => { console.error(e); process.exit(1); });
