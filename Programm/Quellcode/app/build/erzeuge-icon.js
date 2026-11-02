'use strict';
// Rendert build/icon.svg in allen Grössen und baut daraus icon.ico und icon.png.
// Aufruf: npx electron build/erzeuge-icon.js
const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const path = require('path');

const GROESSEN = [16, 20, 24, 32, 40, 48, 64, 128, 256];

async function rendere(win, svg, n) {
  const html = `<html><body style="margin:0;background:transparent">${svg.replace('<svg ', `<svg width="${n}" height="${n}" `)}</body></html>`;
  await win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html));
  win.setContentSize(n, n);
  await new Promise(r => setTimeout(r, 150));
  const bild = await win.webContents.capturePage({ x: 0, y: 0, width: n, height: n });
  return bild.resize({ width: n, height: n, quality: 'best' }).toPNG();
}

function ico(pngs) {
  const kopf = Buffer.alloc(6);
  kopf.writeUInt16LE(0, 0); kopf.writeUInt16LE(1, 2); kopf.writeUInt16LE(pngs.length, 4);
  const eintraege = [];
  let offset = 6 + 16 * pngs.length;
  for (const [n, png] of pngs) {
    const e = Buffer.alloc(16);
    e.writeUInt8(n >= 256 ? 0 : n, 0); e.writeUInt8(n >= 256 ? 0 : n, 1);
    e.writeUInt8(0, 2); e.writeUInt8(0, 3);
    e.writeUInt16LE(1, 4); e.writeUInt16LE(32, 6);
    e.writeUInt32LE(png.length, 8); e.writeUInt32LE(offset, 12);
    offset += png.length;
    eintraege.push(e);
  }
  return Buffer.concat([kopf, ...eintraege, ...pngs.map(p => p[1])]);
}

app.whenReady().then(async () => {
  const svg = fs.readFileSync(path.join(__dirname, 'icon.svg'), 'utf8');
  const win = new BrowserWindow({ show: false, frame: false, transparent: true, width: 512, height: 512, useContentSize: true, webPreferences: { offscreen: true } });
  const pngs = [];
  for (const n of GROESSEN) pngs.push([n, await rendere(win, svg, n)]);
  fs.writeFileSync(path.join(__dirname, 'icon.ico'), ico(pngs));
  fs.writeFileSync(path.join(__dirname, 'icon.png'), await rendere(win, svg, 512));
  fs.copyFileSync(path.join(__dirname, 'icon.ico'), path.join(__dirname, '..', 'icon.ico'));
  console.log('Icon erzeugt:', pngs.map(p => p[0]).join(', '));
  app.quit();
});
