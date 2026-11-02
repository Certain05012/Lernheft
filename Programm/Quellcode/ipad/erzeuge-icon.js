'use strict';
// App-Symbol für das iPad (1024 x 1024, ohne Transparenz, eckig: iPadOS rundet selbst) aus app/build/icon.svg.
// Aufruf (Electron der Windows-App): ..\app\node_modules\electron\dist\electron.exe erzeuge-icon.js
const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const path = require('path');

const N = 1024;
const ZIEL = path.join(__dirname, 'ios', 'App', 'App', 'Assets.xcassets', 'AppIcon.appiconset', 'AppIcon-512@2x.png');

app.whenReady().then(async () => {
  // Ecken nicht runden (das macht iPadOS), Hintergrund deckend
  const svg = fs.readFileSync(path.join(__dirname, '..', 'app', 'build', 'icon.svg'), 'utf8')
    .replace('<rect width="512" height="512" rx="116"', '<rect width="512" height="512" rx="0"')
    .replace('<svg ', `<svg width="${N}" height="${N}" `);
  const win = new BrowserWindow({ show: false, frame: false, width: N, height: N, useContentSize: true, backgroundColor: '#0c1530', webPreferences: { offscreen: true } });
  await win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(`<html><body style="margin:0;background:#0c1530">${svg}</body></html>`));
  win.setContentSize(N, N);
  await new Promise(r => setTimeout(r, 300));
  const bild = await win.webContents.capturePage({ x: 0, y: 0, width: N, height: N });
  fs.writeFileSync(ZIEL, bild.resize({ width: N, height: N, quality: 'best' }).toPNG());
  console.log('App-Symbol: ' + ZIEL);
  app.quit();
});
