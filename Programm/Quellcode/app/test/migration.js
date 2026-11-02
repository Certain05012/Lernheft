'use strict';
// Übernahme alter Daten (mathe-des-tages:*) auf mehreren Geräten mit einem gemeinsamen Speicherort (z. B. OneDrive):
// nur das Gerät, von dem die alten Daten stammen, legt daraus Dokumente an; jedes weitere Gerät (oder eine neue
// Installation) liest sie zwar aus app-daten.json, legt aber nichts neu an. Ohne Oberfläche und ohne Electron:
// echte ablage.js und echte daten.js (im vm-Kontext, Brücke wie preload.js), Testordner, echte Daten bleiben unberührt.
// Aufruf: node test/migration.js <ausgabeordner>   -> migration.json
const fs = require('fs'), path = require('path'), vm = require('vm');
const QUELLE = path.join(__dirname, '..', '..');
const AUS = path.resolve(process.argv[2] || path.join(require('os').tmpdir(), 'lernheft-test-migration'));
const format = require(path.join(QUELLE, 'webseite', 'format.js'));
fs.rmSync(AUS, { recursive: true, force: true });
const warte = ms => new Promise(r => setTimeout(r, ms));
const ergebnis = [];
const pruefe = (name, b, d) => { ergebnis.push((b ? 'OK     ' : 'FEHLER ') + name + (d !== undefined ? '  ' + JSON.stringify(d) : '')); };

// Altes Profil von PC1 (frühere Lernheft-App): ein Skript mit Whiteboard-Notizen
function altesProfil(dir) {
  fs.mkdirSync(path.join(dir, 'lernheft-daten'), { recursive: true });
  const P = 'mathe-des-tages:';
  const kv = {
    [P + 'skripte']: { v: JSON.stringify({ ordner: [], dateien: [{ id: 'vg1', name: 'Skript_Vektorgeometrie', seiten: 3, hinzugefuegt: 1 }] }) },
    [P + 'notizen:skript:vg1']: { v: JSON.stringify([{ id: 'a', w: 'stift', f: 'tinte', d: 2, m: 1, p: [[10, 10, 0.5], [50, 60, 0.5]] }]) },
    [P + 'geloest']: { v: JSON.stringify({ '2024-01-01': true }) }
  };
  fs.writeFileSync(path.join(dir, 'lernheft-daten', 'kv.json'), JSON.stringify(kv));
}

// Ein Start des Lernhefts: Ablage, dann Oberfläche (daten.js) bis Daten.bereit; gibt Daten und Ablage zurück
async function starte(wurzel, profil, altDaten, localStorageInhalt) {
  const { erstelleAblage } = require(path.join(QUELLE, 'app', 'ablage.js'));
  const ablage = erstelleAblage({ wurzel, altDaten, melde: () => {}, format, lokalDatei: path.join(profil, 'geraet-einstellungen.json') });
  const ls = new Map(Object.entries(localStorageInhalt || {}));
  const fenster = {
    lernheftDesktop: {
      version: 2,
      kv: { alle: () => JSON.parse(JSON.stringify(ablage.alle())), setze: a => ablage.setze(JSON.parse(JSON.stringify(a))) },
      datei: { get: async k => ablage.datei.get(k), put: async (k, d) => ablage.datei.put(k, d), del: async k => ablage.datei.del(k), liste: async () => [] }
    },
    addEventListener() {}, document: { addEventListener() {} },
    localStorage: { get length() { return ls.size; }, key: i => [...ls.keys()][i], getItem: k => ls.get(k) }
  };
  const ctx = vm.createContext({ window: fenster, document: { addEventListener() {}, visibilityState: 'visible' }, localStorage: fenster.localStorage, console, setTimeout, clearTimeout, Promise, Blob, JSON });
  vm.runInContext(fs.readFileSync(path.join(QUELLE, 'webseite', 'daten.js'), 'utf8'), ctx);
  const Daten = fenster.Daten;
  await Daten.bereit;
  Daten.flush();
  await warte(2200);           // Zeitgeber der Ablage (app 1,5 s, lokal 0,8 s)
  ablage.sichern();
  return { Daten, ablage };
}
async function beende(s) { s.Daten.flush(); await warte(2200); s.ablage.schliessen(); }

const dokumente = wurzel => {
  const bib = path.join(wurzel, 'Bibliothek');
  return fs.existsSync(bib) ? fs.readdirSync(bib).filter(n => fs.existsSync(path.join(bib, n, 'Handschrift.lernheft.json'))).sort() : [];
};
const appDaten = wurzel => JSON.parse(fs.readFileSync(path.join(wurzel, 'Daten', 'app-daten.json'), 'utf8'));
const kopiere = (von, nach) => { for (const t of ['Bibliothek', 'Daten']) fs.cpSync(path.join(von, t), path.join(nach, t), { recursive: true }); };
const bibIds = D => D.keys ? D.keys().filter(k => k.startsWith('bib:')) : [];

(async () => {
  // ---- Ausgangslage: PC1 hat übernommen und die Dokumente gelöscht ----
  const ort = path.join(AUS, 'OneDrive', 'Lernheft');
  const altPC1 = path.join(AUS, 'pc1-appdata'); altesProfil(altPC1);
  let s = await starte(ort, path.join(AUS, 'pc1-profil'), altPC1);
  const angelegt = dokumente(ort);
  pruefe('PC1: Übernahme legt Dokumente an', angelegt.length === 2, angelegt);
  for (const k of bibIds(s.Daten)) s.Daten.del(k);
  await beende(s);
  pruefe('PC1: nach Löschen keine Dokumente', dokumente(ort).length === 0, dokumente(ort));
  pruefe('app-daten.json enthält alte Schlüssel', Object.keys(appDaten(ort)).some(k => k.startsWith('mathe-des-tages:')));
  // Stand wie mit Version 3.5.0: keine Marke im Speicherort, keine Gerätemarke im Profil
  const ad1 = appDaten(ort); delete ad1['alt-uebernommen'];
  fs.writeFileSync(path.join(ort, 'Daten', 'app-daten.json'), JSON.stringify(ad1, null, 1));
  const lp1 = path.join(AUS, 'pc1-profil', 'geraet-einstellungen.json'), l1 = JSON.parse(fs.readFileSync(lp1, 'utf8'));
  delete l1['lokal:alt-vom-geraet']; fs.writeFileSync(lp1, JSON.stringify(l1, null, 1));
  const vorlage = path.join(AUS, 'vorlage'); kopiere(ort, vorlage);

  // ---- PC2 mit leerem Profil, Marke noch nicht im Speicherort ----
  const ortN = path.join(AUS, 'pc2-neu', 'Lernheft'); kopiere(vorlage, ortN);
  s = await starte(ortN, path.join(AUS, 'pc2-neu-profil'), null); await beende(s);
  pruefe('PC2 (ohne Marke): keine neuen Dokumente', dokumente(ortN).length === 0, dokumente(ortN));
  let ad = appDaten(ortN);
  pruefe('PC2: alte Schlüssel bleiben in app-daten.json', Object.keys(ad).filter(k => k.startsWith('mathe-des-tages:')).length === 3);
  pruefe('PC2: Marke im Speicherort', ad['alt-uebernommen'] === true);
  const lokal2 = JSON.parse(fs.readFileSync(path.join(AUS, 'pc2-neu-profil', 'geraet-einstellungen.json'), 'utf8'));
  pruefe('PC2: lokal:migriert-v2 gesetzt', lokal2['lokal:migriert-v2'] === true);
  pruefe('PC2: Papierkorb unverändert', fs.readdirSync(path.join(ortN, 'Daten', 'Papierkorb')).length === fs.readdirSync(path.join(vorlage, 'Daten', 'Papierkorb')).length);

  // ---- PC1 startet wieder: trägt die Marke nach ----
  const ort1 = path.join(AUS, 'pc1-neu', 'Lernheft'); kopiere(vorlage, ort1);
  s = await starte(ort1, path.join(AUS, 'pc1-profil'), altPC1); await beende(s);
  pruefe('PC1 (schon übernommen): Marke nachgetragen', appDaten(ort1)['alt-uebernommen'] === true);
  pruefe('PC1: keine neuen Dokumente', dokumente(ort1).length === 0, dokumente(ort1));

  // ---- Neue Installation: neues Profil, Speicherort mit Marke, Gerät hat sogar eigene alte Profildaten ----
  s = await starte(ort1, path.join(AUS, 'pc3-profil'), altPC1); await beende(s);
  pruefe('PC3 (Speicherort mit Marke): keine neuen Dokumente', dokumente(ort1).length === 0, dokumente(ort1));

  // ---- Erste Übernahme muss weiter gehen: neues Gerät, leerer Speicherort, alte Daten im Profil ----
  const ortE = path.join(AUS, 'erst', 'Lernheft');
  s = await starte(ortE, path.join(AUS, 'erst-profil'), altPC1); await beende(s);
  pruefe('Erste Übernahme: Dokumente angelegt', dokumente(ortE).length === 2, dokumente(ortE));
  pruefe('Erste Übernahme: Marke gesetzt', appDaten(ortE)['alt-uebernommen'] === true);
  pruefe('Erste Übernahme: lokal:alt-vom-geraet', JSON.parse(fs.readFileSync(path.join(AUS, 'erst-profil', 'geraet-einstellungen.json'), 'utf8'))['lokal:alt-vom-geraet'] === true);
  // ... und ein zweiter Start dort legt nichts doppelt an
  s = await starte(ortE, path.join(AUS, 'erst-profil'), altPC1); await beende(s);
  pruefe('Erste Übernahme: zweiter Start ohne Doppel', dokumente(ortE).length === 2, dokumente(ortE));

  // ---- Eigene alte Daten im localStorage des Geräts werden weiter übernommen (auch mit Marke) ----
  const ortL = path.join(AUS, 'ls', 'Lernheft'); kopiere(ort1, ortL);
  const P = 'mathe-des-tages:';
  s = await starte(ortL, path.join(AUS, 'ls-profil'), null, { [P + 'skripte']: JSON.stringify({ ordner: [], dateien: [{ id: 'eig', name: 'Eigenes Skript', seiten: 1, hinzugefuegt: 2 }] }) });
  await beende(s);
  pruefe('localStorage des Geräts: eigenes Skript übernommen, sonst nichts', JSON.stringify(dokumente(ortL)) === JSON.stringify(['Eigenes Skript']), dokumente(ortL));

  console.log(ergebnis.join('\n'));
  fs.writeFileSync(path.join(AUS, 'migration.json'), JSON.stringify(ergebnis, null, 1));
  process.exit(ergebnis.some(z => z.startsWith('FEHLER')) ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
