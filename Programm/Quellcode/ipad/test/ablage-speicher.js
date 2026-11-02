'use strict';
// Läuft ablage.js auf dem Speicher-Dateisystem des iPads genauso wie auf der Festplatte?
//   node test/ablage-speicher.js [vorlage] [ausgabe.json]
// vorlage: ein Lernheft-Ordner (mit Bibliothek und Daten), wird nur gelesen. Standard: die Sicherung vor dem Umbau,
// falls es sie gibt, sonst ein kleines Beispiel (test/hilfe.js).
const os = require('os');
const { fs, path, LHKnoten, LHSpeicher, LHFormat, ladeAblage, kopiereHinein, pruefe, warte, ende, vorlage: waehleVorlage, QUELLE } = require('./hilfe');

const vorlage = waehleVorlage(process.argv[2]);
const WURZEL = '/Lernheft';

function stabil(v) {
  if (Array.isArray(v)) return '[' + v.map(stabil).join(',') + ']';
  if (v && typeof v === 'object') return '{' + Object.keys(v).sort().filter(k => v[k] !== undefined).map(k => JSON.stringify(k) + ':' + stabil(v[k])).join(',') + '}';
  return JSON.stringify(v);
}
const werte = kv => { const o = {}; for (const [k, e] of Object.entries(kv)) if (!k.startsWith('lokal:')) o[k] = e.v; return o; };

(async () => {
  if (!fs.existsSync(vorlage)) { console.error('Vorlage fehlt: ' + vorlage); process.exit(2); }

  // 1. Gleiches Ergebnis wie auf der Festplatte
  const platte = fs.mkdtempSync(path.join(os.tmpdir(), 'lernheft-ipad-'));
  fs.cpSync(vorlage, platte, { recursive: true });
  const { erstelleAblage } = require(path.join(QUELLE, 'app', 'ablage.js'));
  const echt = erstelleAblage({ wurzel: platte, melde: () => {}, format: LHFormat, lokalDatei: path.join(platte, '..', path.basename(platte) + '-lokal.json') });
  echt.schliessen();

  const memfs = LHKnoten.erstelleSpeicherFs();
  const speicher = LHSpeicher.imSpeicher();
  const sicherung = await LHSpeicher.verbinde(memfs, speicher, { verzoegerung: 20 });
  memfs.alsQuelle('wolke', () => kopiereHinein(memfs, vorlage, WURZEL));
  const gemeldet = [];
  const A = ladeAblage(memfs).erstelleAblage({ wurzel: WURZEL, melde: a => gemeldet.push(a), format: LHFormat, lokalDatei: '/geraet/geraet-einstellungen.json' });

  const a = werte(A.alle()), b = werte(echt.alle());
  const schluesselA = Object.keys(a).sort(), schluesselB = Object.keys(b).sort();
  pruefe('gleiche Schlüssel wie auf der Festplatte', stabil(schluesselA) === stabil(schluesselB), `${schluesselA.length} Schlüssel`);
  const anders = schluesselA.filter(k => stabil(a[k]) !== stabil(b[k]));
  pruefe('gleiche Werte wie auf der Festplatte', anders.length === 0, anders.slice(0, 5));
  pruefe('Handschrift gelesen', schluesselA.some(k => k.startsWith('ink:') || k.startsWith('notiz:tag:')), schluesselA.filter(k => k.startsWith('ink:') || k.startsWith('notiz:tag:')).length + ' Seiten');

  // 2. Neues Notizbuch mit einem Strich
  const strich = { id: 'st1', w: 'stift', f: 'schwarz', d: 2, m: Date.now(), p: [[10, 10, 0.5], [50, 60, 0.6], [90, 20, 0.5]] };
  A.setze({
    'bib:nbtest': { v: { art: 'notizbuch', name: 'iPad Test', eltern: null, seiten: ['s1'], papier: 'karo', erstellt: Date.now() }, zeit: Date.now() },
    'ink:nbtest:s1': { v: { e: [strich] }, zeit: Date.now() }
  });
  A.sichern();
  const nb = WURZEL + '/Bibliothek/iPad Test';
  pruefe('Notizbuch-Ordner angelegt', memfs.existsSync(nb + '/Handschrift.lernheft.json'));
  let seite = null;
  try { seite = LHFormat.dekodiereSeite(LHKnoten.zlib.gunzipSync(memfs.readFileSync(nb + '/Handschrift/s1.lhz')).toString()); } catch (e) { seite = null; }
  pruefe('Seite als .lhz geschrieben und lesbar', seite && seite.e.length === 1 && seite.e[0].id === 'st1');
  pruefe('keine .tmp-Dateien übrig', ![...memfs.knoten.keys()].some(p => p.endsWith('.tmp')));

  // 3. Umbenennen, dann in den Papierkorb
  A.setze({ 'bib:nbtest': { v: { art: 'notizbuch', name: 'iPad Test 2', eltern: null, seiten: ['s1'], papier: 'karo' }, zeit: Date.now() } });
  A.sichern();
  pruefe('umbenannt', memfs.existsSync(WURZEL + '/Bibliothek/iPad Test 2/Handschrift/s1.lhz') && !memfs.existsSync(nb));
  A.setze({ 'bib:nbtest': null });
  A.sichern();
  const imKorb = memfs.readdirSync(WURZEL + '/Daten/Papierkorb').filter(n => n.endsWith('iPad Test 2'));
  pruefe('gelöscht = im Papierkorb', imKorb.length === 1 && !memfs.existsSync(WURZEL + '/Bibliothek/iPad Test 2'), imKorb);
  const liste = A.papierkorb.liste();
  pruefe('Papierkorb-Liste', liste.some(e => e.id === 'nbtest'));
  const zurueck = A.papierkorb.zurueck(imKorb[0]);
  pruefe('wiederhergestellt', zurueck.ok && memfs.existsSync(WURZEL + '/Bibliothek/iPad Test 2/Handschrift/s1.lhz'), zurueck);

  // 4. Grosse Datei (PDF): wird ausgelagert und bleibt lesbar
  const gross = new Uint8Array(600 * 1024).map((_, i) => (i * 7) & 255);
  A.datei.put('pdf:grosstest', gross);
  await sicherung.flush();
  const p = A.datei.pfad('pdf:grosstest');
  pruefe('PDF liegt im Eingang', p === WURZEL + '/Daten/Eingang/grosstest.pdf', p);
  let wurf = null;
  try { memfs.readFileSync(p); } catch (e) { wurf = e.code; }
  pruefe('grosse Datei ausgelagert (nicht im Arbeitsspeicher)', wurf === 'ENOTLOADED', wurf);
  const gelesen = await sicherung.lies(p);
  pruefe('ausgelagerte Datei lesbar', gelesen && gelesen.length === gross.length && gelesen.every((x, i) => x === gross[i]));

  // 5. Neu starten: alles kommt aus dem Speicher zurück
  await sicherung.flush();
  const memfs2 = LHKnoten.erstelleSpeicherFs();
  const sicherung2 = await LHSpeicher.verbinde(memfs2, speicher, { verzoegerung: 20 });
  const A2 = ladeAblage(memfs2).erstelleAblage({ wurzel: WURZEL, melde: () => {}, format: LHFormat, lokalDatei: '/geraet/geraet-einstellungen.json' });
  const c = werte(A2.alle()), d = werte(A.alle());
  // Handschrift steht in der Datei gerundet (Zehntel-Pixel), der Stand im Speicher der Ablage ist noch ungerundet
  const wieInDatei = (k, v) => (k.startsWith('ink:') ? LHFormat.dekodiereSeite(LHFormat.kodiereSeite('x', v)).e : v);
  const anders2 = Object.keys(d).filter(k => stabil(wieInDatei(k, c[k])) !== stabil(wieInDatei(k, d[k])));
  pruefe('nach Neustart gleicher Stand', anders2.length === 0 && Object.keys(c).length === Object.keys(d).length, anders2.slice(0, 5));
  const gelesen2 = await sicherung2.lies(A2.datei.pfad('pdf:grosstest'));
  pruefe('PDF nach Neustart lesbar', gelesen2 && gelesen2.length === gross.length);
  A2.schliessen();

  // 6. Änderung von aussen (wie aus OneDrive): eine Konfliktkopie wird zusammengeführt
  const fremd = { id: 'st2', w: 'stift', f: 'rot', d: 2, m: Date.now() + 5, p: [[100, 100, 0.5], [120, 130, 0.5]] };
  const kopie = WURZEL + '/Bibliothek/iPad Test 2/Handschrift/s1 (OneDrive).lhz';
  memfs.alsQuelle('wolke', () => memfs.writeFileSync(kopie, LHKnoten.zlib.gzipSync(LHFormat.kodiereSeite('s1', { e: [fremd] }))));
  gemeldet.length = 0;
  memfs.meldeBeobachter([kopie]);
  // Die Ablage liest nach eigenen Schreibvorgängen bis zu 1,8 s nichts von aussen ein (ruheBis in ablage.js) und
  // wartet danach noch kurz: auf das Ergebnis warten statt eine feste Zeit (höchstens 8 s)
  const zusammen = () => { const x = A.alle()['ink:nbtest:s1']; return x && x.v.e.length === 2 && gemeldet.some(g => g['ink:nbtest:s1']); };
  for (let i = 0; i < 80 && !zusammen(); i++) await warte(100);
  const k = A.alle()['ink:nbtest:s1'];
  pruefe('Konfliktkopie zusammengeführt', k && k.v.e.length === 2, k && k.v.e.map(e => e.id));
  pruefe('Kopie liegt in Daten/Konflikte', !memfs.existsSync(kopie) && memfs.unter(WURZEL + '/Daten/Konflikte').some(q => q.endsWith('s1 (OneDrive).lhz')));
  pruefe('Oberfläche bekommt den neuen Stand gemeldet', gemeldet.some(g => g['ink:nbtest:s1']));

  // 7. Gelöschte und verschobene Dateien verschwinden auch aus dem Speicher
  await sicherung.flush();
  const gespeichert = [...speicher.knoten.keys()];
  const fehltImSpeicher = [...memfs.knoten.keys()].filter(q => q !== '/' && !q.endsWith('.tmp') && !speicher.knoten.has(q));
  const zuvielImSpeicher = gespeichert.filter(q => !memfs.knoten.has(q));
  pruefe('Speicher = Dateisystem', !fehltImSpeicher.length && !zuvielImSpeicher.length, { fehlt: fehltImSpeicher.slice(0, 3), zuviel: zuvielImSpeicher.slice(0, 3) });

  A.schliessen();
  fs.rmSync(platte, { recursive: true, force: true });
  ende(process.argv[3]);
})().catch(e => { console.error(e); process.exit(1); });
