'use strict';
// Nach "electron-builder --dir": das fertige Programm nach Programm\App kopieren,
// den Starter Lernheft.exe in den Lernheft-Ordner bauen und die Verknüpfungen erneuern.
// Aufruf über "npm run verteilen" (aus Programm\Quellcode\app).
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const APP = path.resolve(__dirname, '..');
const WURZEL = path.resolve(APP, '..', '..', '..');
const ZIEL = path.join(WURZEL, 'Programm', 'App');
const QUELLE = path.join(APP, 'dist', 'win-unpacked');

if (!fs.existsSync(path.join(QUELLE, 'Lernheft.exe'))) { console.error('Zuerst bauen: dist\\win-unpacked fehlt.'); process.exit(1); }
try {
  const laeuft = execFileSync('tasklist', ['/FI', 'IMAGENAME eq Lernheft.exe', '/NH'], { encoding: 'utf8' });
  if (/Lernheft\.exe/i.test(laeuft)) { console.error('Lernheft läuft noch. Bitte zuerst schliessen.'); process.exit(1); }
} catch (e) { /* tasklist nicht verfügbar */ }

fs.rmSync(ZIEL, { recursive: true, force: true });
fs.cpSync(QUELLE, ZIEL, { recursive: true });
fs.rmSync(path.join(APP, 'dist'), { recursive: true, force: true });   // nur Zwischenstand, spart Platz
console.log('Programm kopiert nach', ZIEL);

// Starter bauen (C#-Compiler von Windows)
const csc = path.join(process.env.WINDIR || 'C:\\Windows', 'Microsoft.NET', 'Framework64', 'v4.0.30319', 'csc.exe');
execFileSync(csc, ['/nologo', '/target:winexe', '/win32icon:' + path.join(__dirname, 'icon.ico'), '/out:' + path.join(WURZEL, 'Lernheft.exe'), path.join(__dirname, 'starter.cs')], { stdio: 'inherit' });
console.log('Starter gebaut:', path.join(WURZEL, 'Lernheft.exe'));

// Verknüpfungen auf dem Desktop und im Startmenü (mit derselben App-Kennung, damit das Anheften an die Taskleiste passt)
execFileSync('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', path.join(__dirname, 'verknuepfungen.ps1'), '-Ziel', path.join(ZIEL, 'Lernheft.exe'), '-Wurzel', WURZEL], { stdio: 'inherit' });
