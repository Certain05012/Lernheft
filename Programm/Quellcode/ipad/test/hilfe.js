'use strict';
// Gemeinsames für die Tests der iPad-App (Node, ohne Browser)
const fs = require('fs');
const path = require('path');
const fflate = require('fflate');
const LHKnoten = require('../web/knoten.js')(fflate);
const LHSpeicher = require('../web/speicher.js');
const LHFormat = require('../../webseite/format.js');

const QUELLE = path.join(__dirname, '..', '..');
const ABLAGE_TEXT = fs.readFileSync(path.join(QUELLE, 'app', 'ablage.js'), 'utf8');

// ablage.js so laden, wie es im Browser geschieht: require('fs') usw. kommen aus knoten.js
function ladeAblage(memfs) {
  const u = LHKnoten.umgebung(memfs);
  const modul = { exports: {} };
  new Function('require', 'module', 'Buffer', ABLAGE_TEXT)(u.require, modul, u.Buffer);
  return modul.exports;
}

// Einen echten Ordner (z. B. eine Kopie des Lernhefts) ins Speicher-Dateisystem kopieren
function kopiereHinein(memfs, quelle, ziel) {
  memfs.mkdirSync(ziel, { recursive: true });
  for (const e of fs.readdirSync(quelle, { withFileTypes: true })) {
    const q = path.join(quelle, e.name), z = ziel + '/' + e.name;
    if (e.isDirectory()) kopiereHinein(memfs, q, z);
    else memfs.writeFileSync(z, fs.readFileSync(q));
  }
}

// Vorlage für die Tests: der angegebene Lernheft-Ordner, sonst die Sicherung vor dem Umbau, sonst ein kleines Beispiel
// (Skript mit PDF und Handschrift, Notizbuch mit zwei Seiten, eine Einstellung), mit der echten Ablage angelegt
function vorlage(angegeben) {
  const standard = path.join(QUELLE, '..', '..', 'Sicherung-vor-Umbau-2026-10-09', 'OneDrive-Lernheft');
  if (angegeben) return angegeben;
  if (fs.existsSync(standard)) return standard;
  const ziel = fs.mkdtempSync(path.join(require('os').tmpdir(), 'lernheft-beispiel-'));
  const a = require(path.join(QUELLE, 'app', 'ablage.js')).erstelleAblage({ wurzel: ziel, melde: () => {}, format: LHFormat, lokalDatei: ziel + '-lokal.json' });
  const s = (id, x) => ({ id, w: 'stift', f: 'schwarz', d: 2, m: 1, p: [[x, 10, 0.5], [x + 30, 40, 0.5]] });
  a.datei.put('pdf:sk1', Buffer.from('%PDF-1.4\n' + 'x'.repeat(5000)));
  a.setze({
    'bib:sk1': { v: { art: 'skript', name: 'Analysis', eltern: null, datei: 'sk1', seiten: 2, erstellt: 1 }, zeit: 1 },
    'ink:sk1:0': { v: { e: [s('k1', 5)] }, zeit: 1 },
    'bib:nb0': { v: { art: 'notizbuch', name: 'Physik', eltern: null, seiten: ['p1', 'p2'], papier: 'karo', erstellt: 1 }, zeit: 1 },
    'ink:nb0:p1': { v: { e: [s('q1', 5), s('q2', 50)] }, zeit: 1 },
    'einst:test': { v: 1, zeit: 1 }
  });
  a.sichern();
  a.schliessen();
  fs.rmSync(ziel + '-lokal.json', { force: true });
  console.log('(Vorlage: Beispiel in ' + ziel + ')');
  return ziel;
}

let fehlerZahl = 0;
const ergebnisse = [];
function pruefe(name, ok, info) {
  ergebnisse.push({ name, ok: !!ok, info });
  if (!ok) fehlerZahl++;
  console.log(`${ok ? 'ok  ' : 'FEHLER'}  ${name}${info !== undefined ? '  ' + (typeof info === 'string' ? info : JSON.stringify(info)) : ''}`);
}
const warte = ms => new Promise(r => setTimeout(r, ms));
function ende(datei) {
  if (datei) fs.writeFileSync(datei, JSON.stringify({ fehler: fehlerZahl, ergebnisse }, null, 1));
  console.log(fehlerZahl ? `\n${fehlerZahl} Fehler` : '\nAlles in Ordnung');
  process.exitCode = fehlerZahl ? 1 : 0;
}

module.exports = { fs, path, fflate, LHKnoten, LHSpeicher, LHFormat, ladeAblage, kopiereHinein, pruefe, warte, ende, vorlage, QUELLE };
