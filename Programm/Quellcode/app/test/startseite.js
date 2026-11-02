'use strict';
// Prüflauf für die Startseite im Regal-Stil und die gemeinsame Tab-Leiste: Seitenleiste mit Ansichten, Titel, Neu-Menü,
// Sortierung, Cover mit Stern, Name (Menü) und Datum, Suche, Einstellungen; Tabs der offenen Dokumente auch auf der
// Startseite, Wechsel Startseite <-> Skript per Tab. Fotos breit und schmal, dunkel und hell.
// Aufruf: electron test/startseite.js <ausgabeordner> [vorlage mit Bibliothek und Daten]
// Schreibt Fotos und startseite.json. Vorher Lernheft schliessen (Port 47823).
const { app, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');

const AUS = path.resolve(process.argv[2]);
const VORLAGE = process.argv[3] && process.argv[3] !== '-' ? path.resolve(process.argv[3]) : null;
const WURZEL = path.join(AUS, 'Lernheft');
fs.rmSync(AUS, { recursive: true, force: true });
fs.mkdirSync(path.join(WURZEL, 'Programm'), { recursive: true });
if (VORLAGE) for (const t of ['Bibliothek', 'Daten']) if (fs.existsSync(path.join(VORLAGE, t))) fs.cpSync(path.join(VORLAGE, t), path.join(WURZEL, t), { recursive: true });
app.setPath('userData', path.join(AUS, 'profil'));
process.env.LERNHEFT_ORDNER = WURZEL;
process.env.LERNHEFT_SEITE = path.join(__dirname, '..', '..', 'webseite');
const warte = ms => new Promise(r => setTimeout(r, ms));
require('../main.js');

app.whenReady().then(async () => {
  let win;
  for (let i = 0; i < 100 && !win; i++) { win = BrowserWindow.getAllWindows()[0]; if (!win) await warte(100); }
  const wc = win.webContents;
  wc.setBackgroundThrottling(false);
  const log = [];
  wc.on('console-message', (e, l, m) => { if (l >= 2) log.push(m); });
  win.setSize(1500, 920);
  win.show(); win.focus();
  await new Promise(r => wc.once('did-finish-load', r));
  await warte(2200);
  const js = c => wc.executeJavaScript(c, true);
  const foto = async n => { await warte(700); fs.writeFileSync(path.join(AUS, n + '.png'), (await wc.capturePage()).toPNG()); };
  const r = {};
  try {
    // Ein Ordner, ein Whiteboard und ein Notizbuch dazu, damit alle Cover-Arten zu sehen sind
    r.start = await js(`(async () => {
      const o = UI.neueId();
      Bibliothek.speichere(o, { art: 'ordner', name: 'Mathe', eltern: null, farbe: 'blau', erstellt: Date.now() });
      const w = UI.neueId(), n = UI.neueId();
      Bibliothek.speichere(w, { art: 'notizbuch', papier: 'whiteboard', raster: 'punkte', name: 'Whiteboard Mathe', eltern: null, format: 'A4', farbe: 'lila', seiten: [UI.neueId()], erstellt: Date.now() - 864e5, geoeffnet: Date.now() - 3600e3, seite: 1, favorit: true });
      Bibliothek.speichere(n, { art: 'notizbuch', name: 'Unbenanntes Notizbuch', eltern: null, format: 'A4', papier: 'karo', farbe: 'gruen', seiten: [UI.neueId()], erstellt: Date.now() - 12 * 864e5, geoeffnet: Date.now() - 12 * 864e5, seite: 1, favorit: false });
      location.hash = '#/bibliothek';
      await new Promise(ok => setTimeout(ok, 1200));
      const t = id => document.getElementById(id);
      return {
        titel: t('bib-titel').textContent, nav: [...document.querySelectorAll('.bib-nav button:not([hidden]) span')].map(s => s.textContent),
        karten: document.querySelectorAll('.bib-raster .karte').length, daten: [...document.querySelectorAll('.karte-datum')].map(s => s.textContent).slice(0, 4),
        tabsSichtbar: getComputedStyle(document.getElementById('dok-tabs')).display, tabs: document.querySelectorAll('.dok-tab').length
      };
    })()`);
    await foto('01-startseite');
    // Neu-Menü und Kontextmenü am Namen
    r.menues = await js(`(async () => {
      document.getElementById('neu-knopf').click(); await new Promise(ok => setTimeout(ok, 200));
      const neu = [...document.querySelectorAll('.neu-menue button')].map(b => b.textContent);
      window.__neuFoto = true;
      return { neu };
    })()`);
    await foto('02-neu-menue');
    r.kontext = await js(`(async () => {
      document.body.click(); await new Promise(ok => setTimeout(ok, 100));
      document.querySelector('.datei-karte .karte-titel').click(); await new Promise(ok => setTimeout(ok, 200));
      return [...document.querySelectorAll('.kontext button')].map(b => b.textContent.trim()).slice(0, 6);
    })()`);
    await js(`document.body.click()`);
    // Suche
    r.suche = await js(`(async () => {
      document.getElementById('bib-such-knopf').click(); await new Promise(ok => setTimeout(ok, 100));
      const f = document.getElementById('suche'); f.value = 'mathe'; f.dispatchEvent(new Event('input', { bubbles: true }));
      await new Promise(ok => setTimeout(ok, 300));
      const aus = { offen: getComputedStyle(f.closest('.bib-suche')).display !== 'none', titel: document.getElementById('bib-titel').textContent, treffer: [...document.querySelectorAll('.karte-name')].map(s => s.textContent) };
      f.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      await new Promise(ok => setTimeout(ok, 200));
      aus.nachEsc = document.querySelectorAll('.bib-raster .karte').length;
      return aus;
    })()`);
    // Ansicht Favoriten und ein Ordner
    r.favoriten = await js(`(async () => { document.querySelector('.bib-nav [data-reiter="favorit"]').click(); await new Promise(ok => setTimeout(ok, 300)); return { titel: document.getElementById('bib-titel').textContent, karten: document.querySelectorAll('.bib-raster .karte').length }; })()`);
    r.ordner = await js(`(async () => {
      document.querySelector('.bib-nav [data-reiter="alle"]').click(); await new Promise(ok => setTimeout(ok, 300));
      document.querySelector('.ordner-karte .karte-link').click(); await new Promise(ok => setTimeout(ok, 500));
      const aus = { titel: document.getElementById('bib-titel').textContent, pfad: document.getElementById('pfad').textContent, pfadSichtbar: !document.getElementById('pfad').hidden };
      document.querySelector('.bib-nav [data-reiter="alle"]').click(); await new Promise(ok => setTimeout(ok, 400));
      aus.zurueck = document.getElementById('bib-titel').textContent;
      return aus;
    })()`);
    // Skript öffnen, dann per Haus zurück: die Tabs bleiben oben, per Tab wieder ins Skript
    r.wechsel = await js(`(async () => {
      const d = Bibliothek.dokumente().find(x => x.art === 'skript') || Bibliothek.dokumente()[0];
      location.hash = '#/dok/' + d.id; await new Promise(ok => setTimeout(ok, 2500));
      const imDok = { tabs: document.querySelectorAll('.dok-tab').length, aktiv: (document.querySelector('.dok-tab[aria-selected="true"]') || {}).textContent?.trim() };
      window.__dokFoto = true;
      return { imDok, name: d.name, id: d.id };
    })()`);
    await foto('03-skript');
    r.zurueck = await js(`(async () => {
      document.getElementById('haus-knopf').click(); await new Promise(ok => setTimeout(ok, 900));
      const a = { bereich: document.documentElement.dataset.bereich, tabsSichtbar: getComputedStyle(document.getElementById('dok-tabs')).display, tabs: document.querySelectorAll('.dok-tab').length };
      return a;
    })()`);
    await foto('04-startseite-mit-tab');
    r.perTab = await js(`(async () => {
      document.querySelector('.dok-tab .dok-tab-link').click(); await new Promise(ok => setTimeout(ok, 1200));
      return { bereich: document.documentElement.dataset.bereich, hash: location.hash };
    })()`);
    await js(`location.hash = '#/bibliothek'`);
    // Farben: Hell und Dunkelgrau, jeweils Startseite und Skript (über die Einstellung, wie im Programm)
    const farben = async (thema, hg) => js(`(async () => { Daten.set('lokal:thema', '${thema}'); Daten.set('lokal:bib-hintergrund', '${hg}'); document.documentElement.dataset.theme = '${thema}'; document.documentElement.dataset.bibHg = '${thema === 'light' ? 'weiss' : hg}'; await new Promise(ok => setTimeout(ok, 300)); })()`);
    const kopf = () => js(`(() => { const c = s => getComputedStyle(document.querySelector(s)); return { kopf: c('.app-kopf').backgroundColor, haus: c('#haus-knopf').backgroundColor, tab: (document.querySelector('.dok-tab') ? c('.dok-tab').backgroundColor : null), tabText: (document.querySelector('.dok-tab') ? c('.dok-tab').color : null), seite: (document.querySelector('.bib-seite') ? c('.bib-seite').backgroundColor : null), leiste: (document.querySelector('#dok-leiste .dok-leiste') ? c('#dok-leiste .dok-leiste').backgroundColor : null), papier: c('body').backgroundColor }; })()`);
    r.farben = {};
    for (const [thema, hg, n] of [['light', 'dunkelgrau', 'hell'], ['dark', 'dunkelgrau', 'dunkelgrau'], ['dark', 'dunkelblau', 'dunkelblau']]) {
      await farben(thema, hg);
      await js(`location.hash = '#/bibliothek'`); await warte(600);
      r.farben[n + '-start'] = await kopf();
      await foto('05-' + n + '-startseite');
      await js(`location.hash = '#/dok/' + ${JSON.stringify(r.wechsel.id)}`); await warte(1500);
      r.farben[n + '-skript'] = await kopf();
      await foto('05-' + n + '-skript');
    }
    await js(`location.hash = '#/bibliothek'`);
    await farben('dark', 'dunkelgrau');
    // Schmal
    win.setSize(760, 900);
    await foto('06-schmal');
  } catch (e) {
    r.fehler = String(e && e.stack || e);
  }
  r.log = log;
  fs.writeFileSync(path.join(AUS, 'startseite.json'), JSON.stringify(r, null, 2));
  app.exit(0);
});
