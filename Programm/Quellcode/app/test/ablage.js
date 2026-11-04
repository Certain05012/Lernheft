'use strict';
// Prüflauf für die Ablage ohne Oberfläche: Übertragen alter Dateien, kleine Seiten-Dateien, atomares Schreiben,
// Konfliktkopien der Cloud, gemeinsame Einstellungen, Export und Import in einer Datei.
// Aufruf: node test/ablage.js <ausgabeordner> [ordner-mit-echten-daten-als-vorlage]
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { erstelleAblage } = require('../ablage');
const format = require('../../webseite/format.js');

const AUS = path.resolve(process.argv[2] || path.join(require('os').tmpdir(), 'lernheft-test-ablage'));
const VORLAGE = process.argv[3] ? path.resolve(process.argv[3]) : null;
fs.rmSync(AUS, { recursive: true, force: true });
const WURZEL = path.join(AUS, 'Lernheft');
fs.mkdirSync(WURZEL, { recursive: true });
if (VORLAGE) for (const t of ['Bibliothek', 'Daten']) if (fs.existsSync(path.join(VORLAGE, t))) fs.cpSync(path.join(VORLAGE, t), path.join(WURZEL, t), { recursive: true });

const warte = ms => new Promise(r => setTimeout(r, ms));
const ok = [], fehler = [];
const pruefe = (name, bedingung, detail) => { (bedingung ? ok : fehler).push(name + (detail !== undefined ? ' -> ' + JSON.stringify(detail) : '')); };
const baum = dir => fs.readdirSync(dir, { recursive: true }).map(f => f.replace(/\\/g, '/')).sort();
const meldungen = [];
// Handschrift kommt seit 3.11 faul aus alle() und wird mit hole() gelesen (wie die Oberfläche es tut)
const inkVon = (ab, k) => { const e = ab.hole([k])[k]; return e && !e.faul ? e.v : null; };
const neueAblage = () => erstelleAblage({ wurzel: WURZEL, altDaten: null, melde: a => meldungen.push(Object.keys(a)), format });

(async () => {
  // 1. Start: alte Dateien werden in das neue Format übertragen
  let a = neueAblage();
  const nachStart = baum(path.join(WURZEL, 'Bibliothek'));
  const docKeys = Object.keys(a.alle()).filter(k => k.startsWith('bib:') && a.alle()[k].v.art !== 'ordner');
  pruefe('Dokumente gefunden', docKeys.length >= 0, docKeys.length);
  if (VORLAGE) {
    pruefe('Sicherung des alten Formats', fs.existsSync(path.join(WURZEL, 'Daten', 'Sicherung-Format1')) && fs.readdirSync(path.join(WURZEL, 'Daten', 'Sicherung-Format1')).length > 0);
    const seitenDateien = nachStart.filter(f => f.endsWith('.lhz'));
    pruefe('Seiten-Dateien angelegt', seitenDateien.length > 0, seitenDateien);
    for (const k of Object.keys(a.alle()).filter(x => x.startsWith('ink:'))) {
      const n = inkVon(a, k).e.length;
      pruefe('Inhalt übertragen ' + k, n > 0, n);
    }
    const metaPfad = path.join(WURZEL, 'Bibliothek', 'Mathe', 'Notizbuch 30. September', 'Handschrift.lernheft.json');
    if (fs.existsSync(metaPfad)) {
      const m = JSON.parse(fs.readFileSync(metaPfad, 'utf8'));
      pruefe('Beschreibung im neuen Format', m.lernheft === 2 && Array.isArray(m.seiten) && typeof m.seiten[0] === 'string', { lernheft: m.lernheft, seiten: m.seiten });
    }
  }

  // 2. Notizbuch anlegen, Striche schreiben, Seiten-Datei prüfen
  a.setze({ 'bib:nbA': { v: { art: 'notizbuch', name: 'Testbuch', eltern: null, format: 'A4', papier: 'karo', farbe: 'blau', seiten: ['s1', 's2'], erstellt: 1, geoeffnet: 0, seite: 1, favorit: false }, zeit: 1 } });
  const T = Date.now() - 100000;
  const r1 = n => Math.round(n * 10) / 10;
  const strich =(id, m, n, tilt) => ({ id, w: 'stift', f: 'tinte', d: 3, m: T + m, p: Array.from({ length: n }, (_, i) => (tilt ? [r1(100 + i * 1.3), r1(50 + Math.sin(i / 5) * 9), 0.25 + (i % 10) / 20, 3 / 7] : [r1(100 + i * 1.3), r1(50 + Math.sin(i / 5) * 9), 0.5])) });
  const seite1 = { e: [strich('st1', 1000, 400, true), strich('st2', 1001, 300, false)] };
  a.setze({ 'ink:nbA:s1': { v: seite1, zeit: 2 } });
  a.sichern();
  const dirA = path.join(WURZEL, 'Bibliothek', 'Testbuch');
  const datei = path.join(dirA, 'Handschrift', 's1.lhz');
  pruefe('Seiten-Datei da', fs.existsSync(datei));
  const gz = fs.readFileSync(datei);
  const zurueck = format.dekodiereSeite(zlib.gunzipSync(gz).toString());
  pruefe('Striche erhalten', zurueck.e.length === 2 && zurueck.e[0].p.length === 400, [zurueck.e.length]);
  pruefe('Neigung erhalten', zurueck.e[0].p[5][3] !== undefined && Math.abs(zurueck.e[0].p[5][3] - 3 / 7) < 1e-9, zurueck.e[0].p[5]);
  pruefe('Lage verlustfrei', Math.abs(zurueck.e[0].p[7][0] - seite1.e[0].p[7][0]) < 1e-9 && Math.abs(zurueck.e[0].p[7][1] - seite1.e[0].p[7][1]) < 1e-9);
  pruefe('klein (Bytes für 700 Punkte)', gz.length < 3500, gz.length);
  pruefe('keine halben Dateien', !baum(dirA).some(f => f.endsWith('.tmp')));
  pruefe('Beschreibung geschrieben', JSON.parse(fs.readFileSync(path.join(dirA, 'Handschrift.lernheft.json'), 'utf8')).seiten.join() === 's1,s2');

  // 3. Gemeinsame Einstellungen landen in Einstellungen.json
  a.setze({ 'einst:stift': { v: { presets: { stift: { klein: 1.5, mittel: 3, gross: 6 } }, farbe: 'blau' }, zeit: 3 } });
  a.sichern();
  const einst = JSON.parse(fs.readFileSync(path.join(WURZEL, 'Daten', 'Einstellungen.json'), 'utf8'));
  pruefe('Einstellungen geteilt', einst.eintraege['einst:stift'] && einst.eintraege['einst:stift'].v.farbe === 'blau');
  const app = JSON.parse(fs.readFileSync(path.join(WURZEL, 'Daten', 'app-daten.json'), 'utf8'));
  pruefe('app-daten ohne geteilte Einstellungen', !('einst:stift' in app));

  // 4. Konfliktkopie der Cloud: zweite Fassung derselben Seite mit anderem Strich und einem gelöschten
  meldungen.length = 0;
  const fremd = { e: [strich('st1', 1000, 400, true), strich('st3', 2000, 50, false)], x: { st2: T + 1500 } };
  fs.writeFileSync(path.join(dirA, 'Handschrift', 's1-ANDERER-PC.lhz'), zlib.gzipSync(Buffer.from(format.kodiereSeite('s1', fremd))));
  await warte(3500);
  const nach = format.dekodiereSeite(zlib.gunzipSync(fs.readFileSync(datei)).toString());
  pruefe('Konflikt zusammengeführt', nach.e.map(e => e.id).sort().join() === 'st1,st3', nach.e.map(e => e.id));
  pruefe('Grabstein gilt', nach.x && nach.x.st2 === T + 1500, nach.x);
  pruefe('Konfliktkopie aufgeräumt', !fs.existsSync(path.join(dirA, 'Handschrift', 's1-ANDERER-PC.lhz')));
  pruefe('Konfliktkopie aufgehoben (nicht gelöscht)', fs.existsSync(path.join(WURZEL, 'Daten', 'Konflikte')) && baum(path.join(WURZEL, 'Daten', 'Konflikte')).some(f => f.endsWith('.lhz')));
  pruefe('Webseite benachrichtigt', meldungen.some(m => m.includes('ink:nbA:s1')), meldungen);
  pruefe('Webseite hat neuen Stand', inkVon(a, 'ink:nbA:s1').e.length === 2);

  // 5. Änderung von aussen (Cloud hat eine neuere Fassung geliefert)
  meldungen.length = 0;
  const neuer = { e: [...nach.e, strich('st4', 3000, 30, false)], x: nach.x };
  schreibeExtern(datei, 's1', neuer);
  await warte(3000);
  pruefe('Änderung von aussen erkannt', inkVon(a, 'ink:nbA:s1').e.length === 3 && meldungen.some(m => m.includes('ink:nbA:s1')), inkVon(a, 'ink:nbA:s1').e.length);

  // 6. Eigene Schreibvorgänge lösen keine Meldung an die Webseite aus
  meldungen.length = 0;
  a.setze({ 'ink:nbA:s1': { v: { e: [...inkVon(a, 'ink:nbA:s1').e, strich('st5', 4000, 20, false)], x: nach.x }, zeit: 9 } });
  a.sichern();
  await warte(3500);
  pruefe('kein Echo auf eigene Datei', !meldungen.some(m => m.includes('ink:nbA:s1')), meldungen);

  // 6b. Die Cloud ändert die Datei, während hier noch ungesicherte Arbeit wartet: beim Schreiben wird zusammengeführt
  meldungen.length = 0;
  const stand = inkVon(a, 'ink:nbA:s1');
  a.setze({ 'ink:nbA:s1': { v: { e: [...stand.e, strich('lokalNeu', 5000, 10)], x: stand.x }, zeit: 10 } });
  schreibeExtern(datei, 's1', { e: [...stand.e, strich('cloudNeu', 6000, 10)], x: stand.x });
  a.sichern();
  const gemischt = format.dekodiereSeite(zlib.gunzipSync(fs.readFileSync(datei)).toString());
  pruefe('beim Schreiben zusammengeführt', gemischt.e.some(e => e.id === 'lokalNeu') && gemischt.e.some(e => e.id === 'cloudNeu'), gemischt.e.map(e => e.id));
  pruefe('Webseite bekommt gemeinsamen Stand', meldungen.some(m => m.includes('ink:nbA:s1')) && inkVon(a, 'ink:nbA:s1').e.some(e => e.id === 'cloudNeu'));
  await warte(3000);
  pruefe('danach kein weiteres Echo', inkVon(a, 'ink:nbA:s1').e.length === 6, inkVon(a, 'ink:nbA:s1').e.length);

  // 6c. Geräte-Einstellungen bleiben aus dem Speicherort heraus
  a.setze({ 'lokal:stift': { v: { druckKurve: 1.4 }, zeit: 11 }, 'lokal:thema': { v: 'light', zeit: 11 } });
  a.sichern();
  const appDatei = JSON.parse(fs.readFileSync(path.join(WURZEL, 'Daten', 'app-daten.json'), 'utf8'));
  pruefe('app-daten ohne Geräte-Einstellungen', !Object.keys(appDatei).some(k => k.startsWith('lokal:')), Object.keys(appDatei));
  pruefe('Geräte-Einstellungen im Profil', fs.existsSync(path.join(WURZEL, 'lokal-daten.json')) && JSON.parse(fs.readFileSync(path.join(WURZEL, 'lokal-daten.json'), 'utf8'))['lokal:thema'] === 'light');

  // 7. Export in eine Datei, neu beginnen, Import
  const paket = a.exportiereAlles();
  pruefe('Sicherung klein', paket.length < 20000, paket.length);
  a.schliessen();
  const WURZEL2 = path.join(AUS, 'Lernheft2');
  fs.mkdirSync(WURZEL2, { recursive: true });
  const b = erstelleAblage({ wurzel: WURZEL2, altDaten: null, melde: () => {}, format });
  const bericht = b.importiereAlles(paket);
  pruefe('Import: Dokumente', bericht.dokumente >= 1 && bericht.seiten >= 1, bericht);
  pruefe('Import: Inhalt da', inkVon(b, 'ink:nbA:s1') && inkVon(b, 'ink:nbA:s1').e.length === 6, inkVon(b, 'ink:nbA:s1') && inkVon(b, 'ink:nbA:s1').e.length);
  pruefe('Import: Einstellungen da', b.alle()['einst:stift'] && b.alle()['einst:stift'].v.farbe === 'blau');
  // Zweimal importieren ändert nichts (zusammenführen, nicht verdoppeln)
  const bericht2 = b.importiereAlles(paket);
  pruefe('Zweiter Import verdoppelt nichts', inkVon(b, 'ink:nbA:s1').e.length === 6 && bericht2.neu === 0, bericht2);
  b.schliessen();

  // 8. Neuer Start liest alles unverändert
  const c = erstelleAblage({ wurzel: WURZEL2, altDaten: null, melde: () => {}, format });
  pruefe('Neustart: Inhalt gleich', inkVon(c, 'ink:nbA:s1').e.length === 6);
  c.schliessen();

  // 9. Solange der Stift schreibt (beschaeftigt), wartet das Schreiben; danach kommt es sofort (iPad: kein Stocken)
  let stiftAktiv = true;
  const d = erstelleAblage({ wurzel: WURZEL2, altDaten: null, melde: () => {}, format, beschaeftigt: () => (stiftAktiv ? 300 : 0) });
  const vorher = inkVon(d, 'ink:nbA:s1');
  const seitePfad = fs.readdirSync(path.join(WURZEL2, 'Bibliothek'), { recursive: true }).map(f => path.join(WURZEL2, 'Bibliothek', f)).find(f => /Handschrift[\\/]s1\.lhz$/.test(f));
  const mtime0 = fs.statSync(seitePfad).mtimeMs;
  d.setze({ 'ink:nbA:s1': { v: { e: [...vorher.e, strich('stWarten', 9000, 40, false)], x: vorher.x }, zeit: 10 } });
  await warte(900);
  const waehrend = fs.statSync(seitePfad).mtimeMs === mtime0;
  stiftAktiv = false;
  await warte(700);
  const danach = fs.statSync(seitePfad).mtimeMs !== mtime0 && liesDatei(seitePfad).e.some(e => e.id === 'stWarten');
  pruefe('Schreiben wartet, solange der Stift schreibt', waehrend);
  pruefe('und kommt danach sofort', danach);
  d.schliessen();

  const r = { ok: ok.length, fehler, zusammen: { ok } };
  fs.writeFileSync(path.join(AUS, 'ablage.json'), JSON.stringify(r, null, 2));
  console.log(`${ok.length} bestanden, ${fehler.length} fehlgeschlagen`);
  for (const f of fehler) console.log('  FEHLER: ' + f);
  process.exit(fehler.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });

function liesDatei(p) { return format.dekodiereSeite(zlib.gunzipSync(fs.readFileSync(p)).toString('utf8')); }
function schreibeExtern(p, id, inhalt) {
  fs.writeFileSync(p, zlib.gzipSync(Buffer.from(format.kodiereSeite(id, inhalt))));
}
