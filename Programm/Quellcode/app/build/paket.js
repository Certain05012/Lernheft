'use strict';
// Nach "npm run verteilen": packt Lernheft.exe + Programm\App zu einem Zip für GitHub Releases.
// Ergebnis: Veroeffentlichen\Lernheft-<Version>-Windows.zip (nicht im Repository, siehe .gitignore).
// Aufruf über "npm run paket" (aus Programm\Quellcode\app). Nutzerdaten (Bibliothek, Daten) kommen nie hinein.
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const APP = path.resolve(__dirname, '..');
const WURZEL = path.resolve(APP, '..', '..', '..');
const version = JSON.parse(fs.readFileSync(path.join(APP, 'package.json'), 'utf8')).version;
const ausgabe = path.join(WURZEL, 'Veroeffentlichen');
const zip = path.join(ausgabe, `Lernheft-${version}-Windows.zip`);

for (const p of ['Lernheft.exe', path.join('Programm', 'App', 'Lernheft.exe')]) {
  if (!fs.existsSync(path.join(WURZEL, p))) { console.error('Fehlt:', p, '- zuerst "npm run verteilen".'); process.exit(1); }
}

// Gleicher Aufbau wie im Lernheft-Ordner, damit der Starter das Programm findet
const lager = path.join(ausgabe, 'Lernheft');
fs.rmSync(lager, { recursive: true, force: true });
fs.mkdirSync(path.join(lager, 'Programm'), { recursive: true });
fs.copyFileSync(path.join(WURZEL, 'Lernheft.exe'), path.join(lager, 'Lernheft.exe'));
fs.cpSync(path.join(WURZEL, 'Programm', 'App'), path.join(lager, 'Programm', 'App'), { recursive: true });
fs.copyFileSync(path.join(WURZEL, 'LICENSE'), path.join(lager, 'LICENSE'));
fs.writeFileSync(path.join(lager, 'LIES-MICH.txt'),
  'Lernheft ' + version + '\r\n\r\nZip entpacken und Lernheft.exe starten.\r\n' +
  'Beim ersten Start legt das Lernheft die Ordner Bibliothek und Daten neben dem Programm an\r\n' +
  '(oder in einem frei wählbaren Speicherort: Menü > Speicherort).\r\n' +
  'Windows meldet beim ersten Start evtl. "Unbekannter Herausgeber": Weitere Informationen > Trotzdem ausführen.\r\n');

fs.rmSync(zip, { force: true });
// tar von Windows (bsdtar, kann -a für Zip); in Git Bash stünde sonst GNU tar zuerst im Pfad
const tar = process.platform === 'win32' ? path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'tar.exe') : 'tar';
execFileSync(tar, ['-a', '-c', '-f', zip, '-C', ausgabe, 'Lernheft'], { stdio: 'inherit' });
fs.rmSync(lager, { recursive: true, force: true });
console.log('Paket:', zip, (fs.statSync(zip).size / 1048576).toFixed(0) + ' MB');
