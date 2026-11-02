'use strict';
// Setzt nach dem Packen Icon und Namen in Lernheft.exe (ohne die Signier-Werkzeuge von electron-builder)
const path = require('path');

exports.default = async function (ctx) {
  if (ctx.electronPlatformName !== 'win32') return;
  const mod = require('rcedit');
  const rcedit = typeof mod === 'function' ? mod : mod.rcedit;
  const exe = path.join(ctx.appOutDir, ctx.packager.appInfo.productFilename + '.exe');
  const version = ctx.packager.appInfo.version;
  await rcedit(exe, {
    icon: path.join(__dirname, 'icon.ico'),
    'file-version': version,
    'product-version': version,
    'version-string': {
      ProductName: 'Lernheft',
      FileDescription: 'Lernheft',
      CompanyName: 'Lernheft',
      InternalName: 'Lernheft',
      OriginalFilename: 'Lernheft.exe'
    }
  });
};
