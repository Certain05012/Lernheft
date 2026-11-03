'use strict';
// Lernheft als Desktop-App, komplett lokal.
// Das Programm sucht seinen Lernheft-Ordner (der mit "Programm" und "Bibliothek") und legt dort alles ab.
// Die Oberfläche kommt aus Programm\Quellcode\webseite (so wirken Änderungen dort nach einem Neustart)
// oder, falls es den Ordner nicht gibt, aus der eingebauten Kopie.
const { app, BrowserWindow, Menu, shell, dialog, ipcMain, powerMonitor } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { starteServer } = require('./server');
const { erstelleAblage } = require('./ablage');

const PORT = 47823;
const LOKAL = `http://127.0.0.1:${PORT}`;

// Lernheft spricht nur mit dem eigenen lokalen Server (und holt die Schriften nach). Ohne diese Zeile sucht Chromium beim
// ersten Zugriff über die Windows-Einstellungen nach einem Proxy (automatische Erkennung): das kostete bei jedem Start rund
// zwei Sekunden, bevor die erste Seite überhaupt angefragt wurde. Muss vor "ready" stehen.
app.commandLine.appendSwitch('no-proxy-server');

app.setAppUserModelId('ch.lernheft.app');

function findeWurzel() {
  if (process.env.LERNHEFT_ORDNER) return path.resolve(process.env.LERNHEFT_ORDNER);
  for (const start of [path.dirname(process.execPath), __dirname]) {
    let d = start;
    for (let i = 0; i < 7; i++) {
      if (fs.existsSync(path.join(d, 'Programm')) && (fs.existsSync(path.join(d, 'Bibliothek')) || fs.existsSync(path.join(d, 'CLAUDE.md')))) return d;
      const oben = path.dirname(d);
      if (oben === d) break;
      d = oben;
    }
  }
  return path.join(app.getPath('documents'), 'Lernheft');
}

function seitenOrdner(wurzel) {
  const kandidaten = [process.env.LERNHEFT_SEITE, path.join(wurzel, 'Programm', 'Quellcode', 'webseite'), path.join(__dirname, 'seite')];
  return kandidaten.find(p => p && fs.existsSync(path.join(p, 'index.html')));
}

/* ---------- Speicherort ---------- */
// Bibliothek und Daten können in einem frei gewählten Ordner liegen, z. B. in OneDrive, Google Drive, Dropbox oder iCloud.
// Der Pfad steht nur in dieser kleinen Datei im Profil des Geräts (nie im Speicherort selbst), damit derselbe Ordner
// auf einem anderen Computer unter einem anderen Pfad eingebunden sein darf.
const ortDatei = () => path.join(app.getPath('userData'), 'speicherort.json');
function leseOrt() {
  if (process.env.LERNHEFT_ORDNER) return null;
  try {
    const o = JSON.parse(fs.readFileSync(ortDatei(), 'utf8'));
    return o && typeof o.daten === 'string' ? o.daten : null;
  } catch (e) { return null; }
}
function speichereOrt(pfad) {
  fs.mkdirSync(path.dirname(ortDatei()), { recursive: true });
  if (pfad) fs.writeFileSync(ortDatei(), JSON.stringify({ daten: pfad }, null, 2));
  else fs.rmSync(ortDatei(), { force: true });
}

let ablage = null;
let hauptfenster = null;
let programmWurzel = null;   // der Ordner mit dem Programm
let datenWurzel = null;      // der Ordner mit Bibliothek und Daten (Standard: derselbe)

/* ---------- Brücke zur Webseite ---------- */

const frameErlaubt = frame => { try { return !!frame && (frame.url || '').startsWith(LOKAL + '/'); } catch (e) { return false; } };
const angemeldet = new Set();
function pruefe(e) { if (!frameErlaubt(e.senderFrame)) throw new Error('Nicht erlaubt'); }
function verteile(aenderungen, ausser) {
  for (const f of [...angemeldet]) {
    if (f === ausser) continue;
    try { f.send('lh:kv-geaendert', aenderungen); } catch (err) { angemeldet.delete(f); }
  }
}

ipcMain.on('lh:hallo', e => {
  const ok = frameErlaubt(e.senderFrame);
  if (ok) angemeldet.add(e.senderFrame);
  e.returnValue = ok;
});
ipcMain.on('lh:geraet', e => { e.returnValue = frameErlaubt(e.senderFrame) ? 'Lernheft (' + os.hostname() + ')' : ''; });
ipcMain.on('lh:wurzel', e => { e.returnValue = frameErlaubt(e.senderFrame) ? ablage.wurzel : ''; });
ipcMain.on('lh:kv-alle', e => { e.returnValue = frameErlaubt(e.senderFrame) ? ablage.alle() : {}; });
// Handschrift erst laden, wenn sie gebraucht wird, und wieder freigeben (nur Schlüssel ink:*, höchstens 5000 auf einmal)
const nurInk = keys => (Array.isArray(keys) ? keys : []).slice(0, 5000).map(String).filter(k => k.startsWith('ink:'));
ipcMain.handle('lh:kv-hole', (e, keys) => { pruefe(e); return ablage.hole(nurInk(keys)); });
ipcMain.on('lh:kv-vergiss', (e, keys) => { if (frameErlaubt(e.senderFrame)) ablage.vergiss(nurInk(keys)); });
ipcMain.on('lh:kv-setze', (e, aenderungen) => {
  if (!frameErlaubt(e.senderFrame) || !aenderungen || typeof aenderungen !== 'object') return;
  ablage.setze(aenderungen);
  verteile(aenderungen, e.senderFrame);
});
ipcMain.handle('lh:datei-get', (e, k) => { pruefe(e); return ablage.datei.get(String(k)); });
ipcMain.handle('lh:datei-put', (e, k, daten) => { pruefe(e); ablage.datei.put(String(k), daten); return true; });
ipcMain.handle('lh:datei-del', (e, k) => { pruefe(e); ablage.datei.del(String(k)); return true; });
ipcMain.handle('lh:datei-liste', e => { pruefe(e); return ablage.datei.liste(); });
ipcMain.handle('lh:export-dok', (e, id, name, daten) => { pruefe(e); return ablage.exportiere(String(id), String(name), daten); });
ipcMain.handle('lh:export-datei', (e, id, name, daten, endung) => { pruefe(e); return ablage.exportiere(String(id), String(name), daten, endung === '.png' ? '.png' : '.pdf'); });
// Export an einen frei gewählten Ort speichern ("Speichern unter"); im Ordner des Dokuments bleibt nur das Original.
// dateien: [{ name, daten }] (nur .pdf und .png). Eine Datei: Dialog "Speichern unter", mehrere (PNG
// aller Seiten): Ordner wählen. vorschlag: zuletzt gewählter Ordner (steht im Profil des Geräts, lokal:export-ordner).
const gespeichertAusserhalb = new Set();   // diese Pfade darf "Im Ordner zeigen" öffnen, obwohl sie nicht im Lernheft liegen
const dateiname = n => path.basename(String(n || 'Export')).replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').replace(/[. ]+$/, '') || 'Export';
ipcMain.handle('lh:speichern-unter', async (e, dateien, vorschlag) => {
  pruefe(e);
  const liste = (Array.isArray(dateien) ? dateien : []).map(d => ({ name: dateiname(d && d.name), daten: d && d.daten }))
    .filter(d => /\.(pdf|png)$/i.test(d.name) && d.daten);
  if (!liste.length) return { fehler: 'Nichts zu speichern' };
  const fenster = BrowserWindow.fromWebContents(e.sender) || hauptfenster;
  const ordner0 = typeof vorschlag === 'string' && vorschlag && fs.existsSync(vorschlag) ? vorschlag : app.getPath('documents');
  let ziele;
  if (liste.length === 1) {
    const endung = path.extname(liste[0].name).slice(1).toLowerCase();
    const r = await dialog.showSaveDialog(fenster, {
      title: 'Speichern unter',
      defaultPath: path.join(ordner0, liste[0].name),
      filters: [{ name: endung === 'png' ? 'PNG-Bild' : 'PDF-Dokument', extensions: [endung] }]
    });
    if (r.canceled || !r.filePath) return { abgebrochen: true };
    ziele = [r.filePath.toLowerCase().endsWith('.' + endung) ? r.filePath : r.filePath + '.' + endung];
  } else {
    const r = await dialog.showOpenDialog(fenster, { title: `Ordner für ${liste.length} Bilder wählen`, defaultPath: ordner0, properties: ['openDirectory', 'createDirectory'] });
    if (r.canceled || !r.filePaths || !r.filePaths[0]) return { abgebrochen: true };
    ziele = liste.map(d => path.join(r.filePaths[0], d.name));
  }
  try {
    liste.forEach((d, i) => {
      const tmp = ziele[i] + '.tmp';
      fs.writeFileSync(tmp, Buffer.from(d.daten));
      fs.renameSync(tmp, ziele[i]);
      gespeichertAusserhalb.add(path.resolve(ziele[i]));
    });
  } catch (err) { return { fehler: err.message }; }
  return { dateien: ziele, ordner: path.dirname(ziele[0]) };
});
// Papierkorb in der App: Liste, wiederherstellen, endgültig löschen (einzeln oder alles)
ipcMain.handle('lh:papierkorb', (e, was, name) => {
  pruefe(e);
  const pk = ablage.papierkorb;
  try {
    if (was === 'liste') return pk.liste();
    if (was === 'zurueck') return pk.zurueck(String(name));
    if (was === 'loeschen') return pk.loeschen(String(name));
    if (was === 'leeren') return pk.leeren();
  } catch (err) { return { fehler: err.message }; }
  return { fehler: 'Unbekannt' };
});
ipcMain.handle('lh:zeige', (e, datei) => {
  pruefe(e);
  if (typeof datei === 'string' && (path.resolve(datei).startsWith(ablage.wurzel) || gespeichertAusserhalb.has(path.resolve(datei)))) shell.showItemInFolder(datei);
  return true;
});
ipcMain.on('lh:ort', e => {
  e.returnValue = frameErlaubt(e.senderFrame) ? { daten: datenWurzel, programm: programmWurzel, eigener: path.resolve(datenWurzel) !== path.resolve(programmWurzel) } : null;
});
ipcMain.handle('lh:speicher-info', e => { pruefe(e); return ablage.speicherInfo(); });

const istUnter = (kind, eltern) => { const r = path.relative(path.resolve(eltern), path.resolve(kind)); return !!r && !r.startsWith('..') && !path.isAbsolute(r); };
const groesseVon = dir => {
  let n = 0;
  try { for (const f of fs.readdirSync(dir, { withFileTypes: true })) n += f.isDirectory() ? groesseVon(path.join(dir, f.name)) : fs.statSync(path.join(dir, f.name)).size; } catch (err) { /* egal */ }
  return n;
};
const mb = b => (b / 1e6 >= 10 ? Math.round(b / 1e6) : Math.round(b / 1e5) / 10) + ' MB';

// Speicherort wählen: bestehende Daten im Zielordner werden verwendet, sonst wird alles dorthin kopiert.
// Der bisherige Ordner bleibt unverändert als Sicherung bestehen.
ipcMain.handle('lh:ort-waehlen', async e => {
  pruefe(e);
  const fenster = BrowserWindow.fromWebContents(e.sender) || hauptfenster;
  const r = await dialog.showOpenDialog(fenster, { title: 'Speicherort für Bibliothek und Daten wählen', buttonLabel: 'Diesen Ordner verwenden', properties: ['openDirectory', 'createDirectory'] });
  if (r.canceled || !r.filePaths[0]) return { abgebrochen: true };
  let ziel = r.filePaths[0];
  const eintraege = (() => { try { return fs.readdirSync(ziel).filter(n => !n.startsWith('.') && n.toLowerCase() !== 'desktop.ini'); } catch (err) { return null; } })();
  if (eintraege === null) return { fehler: 'Der Ordner lässt sich nicht lesen.' };
  const vorhanden = eintraege.includes('Bibliothek') || eintraege.includes('Daten');
  // Ein Ordner mit anderem Inhalt bekommt einen eigenen Unterordner
  if (!vorhanden && eintraege.length) ziel = path.join(ziel, 'Lernheft-Daten');
  if (path.resolve(ziel) === path.resolve(datenWurzel)) return { fehler: 'Dieser Ordner wird schon verwendet.' };
  if (istUnter(ziel, datenWurzel) || istUnter(datenWurzel, ziel)) return { fehler: 'Der neue Ordner darf nicht im bisherigen liegen und umgekehrt.' };
  try {
    fs.mkdirSync(ziel, { recursive: true });
    const probe = path.join(ziel, '.lernheft-schreibprobe');
    fs.writeFileSync(probe, 'ok'); fs.rmSync(probe, { force: true });
  } catch (err) { return { fehler: 'In diesen Ordner kann nicht geschrieben werden: ' + err.message }; }

  const gross = groesseVon(ablage.BIB) + groesseVon(ablage.DATEN);
  const frage = vorhanden
    ? { message: 'In diesem Ordner liegen schon Lernheft-Daten.', detail: `${ziel}\n\nSie werden jetzt verwendet, zum Beispiel die von deinem anderen Computer. Deine bisherigen Daten bleiben unverändert hier liegen:\n${datenWurzel}\n\nLernheft startet danach neu.`, ok: 'Diese Daten verwenden' }
    : { message: 'Bibliothek und Daten in den neuen Ordner kopieren?', detail: `${ziel}\n\nKopiert werden ${mb(gross)}. Der bisherige Ordner bleibt unverändert als Sicherung liegen:\n${datenWurzel}\n\nLernheft startet danach neu.`, ok: 'Kopieren und wechseln' };
  const w = await dialog.showMessageBox(fenster, { type: 'question', title: 'Speicherort', message: frage.message, detail: frage.detail, buttons: [frage.ok, 'Abbrechen'], defaultId: 0, cancelId: 1, noLink: true });
  if (w.response !== 0) return { abgebrochen: true };

  try {
    ablage.sichern();
    if (!vorhanden) {
      // Solange kopiert wird, sind die Fenster gesperrt, damit nichts Neues daneben entsteht
      const fenster2 = BrowserWindow.getAllWindows();
      fenster2.forEach(f => f.setEnabled(false));
      try {
        for (const teil of ['Bibliothek', 'Daten']) {
          await fs.promises.cp(path.join(datenWurzel, teil), path.join(ziel, teil), { recursive: true, force: false, errorOnExist: false, filter: q => !/\.tmp$/.test(q) });
        }
      } finally { fenster2.forEach(f => { try { f.setEnabled(true); } catch (err) { /* geschlossen */ } }); }
    }
    speichereOrt(ziel);
  } catch (err) { return { fehler: 'Das Kopieren hat nicht geklappt: ' + err.message }; }
  app.relaunch();
  app.exit(0);
  return { ok: true };
});

// Zurück zum Ordner neben dem Programm
ipcMain.handle('lh:ort-standard', async e => {
  pruefe(e);
  const fenster = BrowserWindow.fromWebContents(e.sender) || hauptfenster;
  if (path.resolve(datenWurzel) === path.resolve(programmWurzel)) return { fehler: 'Es wird schon der Ordner beim Programm verwendet.' };
  const w = await dialog.showMessageBox(fenster, {
    type: 'question', title: 'Speicherort', message: 'Zum Ordner beim Programm zurückwechseln?',
    detail: `Dort liegt, was zuletzt in diesem Ordner gespeichert war:\n${programmWurzel}\n\nDer jetzige Speicherort bleibt unverändert:\n${datenWurzel}\n\nLernheft startet danach neu.`,
    buttons: ['Zurückwechseln', 'Abbrechen'], defaultId: 0, cancelId: 1, noLink: true
  });
  if (w.response !== 0) return { abgebrochen: true };
  ablage.sichern();
  speichereOrt(null);
  app.relaunch();
  app.exit(0);
  return { ok: true };
});

// Alles in einer einzigen Datei: Notlösung, Sicherung, Umzug
ipcMain.handle('lh:export-alles', async e => {
  pruefe(e);
  const fenster = BrowserWindow.fromWebContents(e.sender) || hauptfenster;
  const r = await dialog.showSaveDialog(fenster, {
    title: 'Alles in einer Datei sichern',
    defaultPath: path.join(app.getPath('documents'), `Lernheft-Sicherung ${new Date().toISOString().slice(0, 10)}.lernheft`),
    filters: [{ name: 'Lernheft-Sicherung', extensions: ['lernheft'] }]
  });
  if (r.canceled || !r.filePath) return { abgebrochen: true };
  try {
    const daten = ablage.exportiereAlles();
    const tmp = r.filePath + '.tmp';
    fs.writeFileSync(tmp, daten);
    fs.renameSync(tmp, r.filePath);
    return { ok: true, datei: r.filePath, bytes: daten.length };
  } catch (err) { return { fehler: err.message }; }
});
ipcMain.handle('lh:import-datei', async e => {
  pruefe(e);
  const fenster = BrowserWindow.fromWebContents(e.sender) || hauptfenster;
  const r = await dialog.showOpenDialog(fenster, { title: 'Lernheft-Sicherung importieren', properties: ['openFile'], filters: [{ name: 'Lernheft-Sicherung', extensions: ['lernheft'] }] });
  if (r.canceled || !r.filePaths[0]) return { abgebrochen: true };
  try { return { ok: true, bericht: ablage.importiereAlles(fs.readFileSync(r.filePaths[0])) }; }
  catch (err) { return { fehler: err.message }; }
});

ipcMain.handle('lh:ordner', (e, was) => {
  pruefe(e);
  const ziel = was === 'bibliothek' ? ablage.BIB : was === 'daten' ? ablage.DATEN : was === 'wurzel' ? ablage.wurzel : ablage.ordnerVonDok(String(was));
  if (ziel) shell.openPath(ziel);
  return !!ziel;
});

/* ---------- Fenster ---------- */

function fensterOptionen() {
  return {
    width: 1400,
    height: 900,
    minWidth: 480,
    minHeight: 400,
    title: 'Lernheft',
    icon: path.join(__dirname, 'icon.ico'),
    backgroundColor: '#0d1322',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      sandbox: true,
      spellcheck: false
    }
  };
}

/* ---------- Nichts liegen lassen ---------- */
// Alles Wartende auf die Platte: beim Schliessen eines Fensters, wenn die Oberfläche abstürzt oder nicht mehr antwortet
// und wenn Windows herunterfährt. Beim Schliessen sichert zuerst die Oberfläche (sie hat noch ungesendete Änderungen),
// dann schreibt dieser Prozess; antwortet sie nicht, geht das Fenster nach anderthalb Sekunden trotzdem zu.
const sichereAlles = () => { try { if (ablage) ablage.sichern(); } catch (err) { console.error('Lernheft: sichern', err); } };
const wartenAufFenster = new Map();   // webContents -> Funktion, die das Schliessen fortsetzt
ipcMain.on('lh:vor-schliessen-fertig', e => { const weiter = wartenAufFenster.get(e.sender); if (weiter) weiter(); });

function sichereBeimSchliessen(win) {
  const schliesst = new WeakSet();
  win.on('close', e => {
    const wc = win.webContents;
    if (schliesst.has(win) || wc.isDestroyed() || wc.isCrashed() || !wc.getURL().startsWith(LOKAL + '/')) { sichereAlles(); return; }
    e.preventDefault();
    schliesst.add(win);
    let fertig = false;
    const weiter = () => {
      if (fertig) return;
      fertig = true;
      wartenAufFenster.delete(wc);
      sichereAlles();
      try { win.destroy(); } catch (err) { /* schon zu */ }
    };
    wartenAufFenster.set(wc, weiter);
    try { wc.send('lh:vor-schliessen'); } catch (err) { weiter(); return; }
    setTimeout(weiter, 1500);
  });
  win.webContents.on('render-process-gone', sichereAlles);
  win.on('unresponsive', sichereAlles);
}

function richteFensterEin(win) {
  sichereBeimSchliessen(win);
  // Eigene Seiten (z. B. das Whiteboard im eigenen Fenster) als App-Fenster, alles andere im Browser
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith(LOKAL + '/')) return { action: 'allow', overrideBrowserWindowOptions: { ...fensterOptionen(), width: 900, height: 720 } };
    shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('did-create-window', richteFensterEin);
  win.webContents.on('will-navigate', (e, url) => {
    if (!url.startsWith(LOKAL + '/')) { e.preventDefault(); shell.openExternal(url); }
  });
}

function menue() {
  return Menu.buildFromTemplate([
    {
      label: 'Lernheft',
      submenu: [
        { label: 'Lernheft-Ordner öffnen', click: () => shell.openPath(ablage.wurzel) },
        { label: 'Bibliothek im Explorer öffnen', click: () => shell.openPath(ablage.BIB) },
        { label: 'Bibliothek neu einlesen', accelerator: 'F5', click: () => ablage.neuEinlesen() },
        { type: 'separator' },
        { role: 'quit', label: 'Beenden' }
      ]
    },
    { role: 'editMenu', label: 'Bearbeiten' },
    {
      label: 'Ansicht',
      submenu: [
        { role: 'reload', label: 'Neu laden' },
        { role: 'toggleDevTools', label: 'Entwicklerwerkzeuge' },
        { type: 'separator' },
        { role: 'resetZoom', label: 'Originalgrösse' },
        { role: 'zoomIn', label: 'Vergrössern' },
        { role: 'zoomOut', label: 'Verkleinern' },
        { type: 'separator' },
        { role: 'togglefullscreen', label: 'Vollbild' }
      ]
    }
  ]);
}

// Liegt der gewählte Speicherort gerade nicht bereit (Cloud-Laufwerk nicht eingebunden, Stick abgezogen), wird nicht
// heimlich ein anderer Ordner benutzt: sonst entstünden zwei verschiedene Stände.
function waehleDatenWurzel() {
  const gewaehlt = leseOrt();
  if (!gewaehlt) return programmWurzel;
  for (;;) {
    if (fs.existsSync(gewaehlt)) return gewaehlt;
    const w = dialog.showMessageBoxSync({
      type: 'warning', title: 'Lernheft', message: 'Der Speicherort ist nicht erreichbar.',
      detail: `${gewaehlt}\n\nIst das Cloud-Laufwerk oder der Datenträger eingebunden?`,
      buttons: ['Erneut versuchen', 'Ordner beim Programm verwenden', 'Beenden'], defaultId: 0, cancelId: 2, noLink: true
    });
    if (w === 1) return programmWurzel;
    if (w === 2) return null;
  }
}

async function start() {
  programmWurzel = findeWurzel();
  const seite = seitenOrdner(programmWurzel);
  if (!seite) {
    dialog.showErrorBox('Lernheft', 'Die Oberfläche des Lernhefts wurde nicht gefunden.');
    return app.quit();
  }
  datenWurzel = waehleDatenWurzel();
  if (!datenWurzel) return app.quit();
  try {
    const format = require(path.join(seite, 'format.js'));
    ablage = erstelleAblage({
      wurzel: datenWurzel, altDaten: path.join(app.getPath('appData'), 'Lernheft'), melde: a => verteile(a, null), format,
      lokalDatei: path.join(app.getPath('userData'), 'geraet-einstellungen.json')
    });
  } catch (e) {
    dialog.showErrorBox('Lernheft', 'Der Lernheft-Ordner konnte nicht geöffnet werden:\n' + datenWurzel + '\n\n' + e.message);
    return app.quit();
  }
  try {
    await starteServer({ port: PORT, seite });
  } catch (e) {
    dialog.showErrorBox('Lernheft', e.code === 'EADDRINUSE' ? `Port ${PORT} ist schon belegt. Läuft Lernheft bereits?` : 'Der Server konnte nicht starten: ' + e.message);
    return app.quit();
  }

  Menu.setApplicationMenu(menue());
  powerMonitor.on('shutdown', sichereAlles);
  powerMonitor.on('suspend', sichereAlles);
  hauptfenster = new BrowserWindow(fensterOptionen());
  richteFensterEin(hauptfenster);
  hauptfenster.on('closed', () => { hauptfenster = null; });
  hauptfenster.loadURL(LOKAL + '/');
}

// Nur eine Instanz: ein zweiter Start holt das vorhandene Fenster nach vorne
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (!hauptfenster) return;
    if (hauptfenster.isMinimized()) hauptfenster.restore();
    hauptfenster.focus();
  });
  app.whenReady().then(start);
  app.on('window-all-closed', () => app.quit());
  app.on('before-quit', () => { try { if (ablage) ablage.schliessen(); } catch (e) { /* nichts zu sichern */ } });
}
