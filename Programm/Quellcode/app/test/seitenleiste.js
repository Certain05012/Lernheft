'use strict';
// Prüflauf für die Seitenleiste der Skripte: Seiten (Vorschaubilder), Inhalt (Abschnitte), Lesezeichen (Menü ⋯, Bändchen,
// Datei) und Suche im PDF (Treffer, Markierung, Springen, Strg+F), in der echten App mit einer Kopie echter Daten.
// Aufruf: electron test/seitenleiste.js <ausgabeordner> <vorlage mit Bibliothek und Daten> [breite hoehe] [suchwort]
// Schreibt Bildschirmfotos und seitenleiste.json in den Ausgabeordner. Vorher Lernheft schliessen (Port 47823).
const { app, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');

const AUS = path.resolve(process.argv[2]);
const VORLAGE = process.argv[3] && process.argv[3] !== '-' ? path.resolve(process.argv[3]) : null;
const BREITE = Number(process.argv[4]) || 1400, HOEHE = Number(process.argv[5]) || 900;
const WORT = process.argv[6] || 'Skalarprodukt';
const WURZEL = path.join(AUS, 'Lernheft');
fs.rmSync(AUS, { recursive: true, force: true });
fs.mkdirSync(path.join(WURZEL, 'Programm'), { recursive: true });
if (VORLAGE) for (const t of ['Bibliothek', 'Daten']) if (fs.existsSync(path.join(VORLAGE, t))) fs.cpSync(path.join(VORLAGE, t), path.join(WURZEL, t), { recursive: true, filter: q => !/Papierkorb/.test(q) });
app.setPath('userData', path.join(AUS, 'profil'));
process.env.LERNHEFT_ORDNER = WURZEL;
process.env.LERNHEFT_SEITE = path.join(__dirname, '..', '..', 'webseite');
const warte = ms => new Promise(r => setTimeout(r, ms));
require('../main.js');

app.whenReady().then(async () => {
  let win;
  for (let i = 0; i < 100 && !win; i++) { win = BrowserWindow.getAllWindows()[0]; if (!win) await warte(100); }
  const wc = win.webContents;
  const log = [];
  wc.on('console-message', (e, l, m) => { if (l >= 2) log.push(m); });
  win.setSize(BREITE, HOEHE);
  win.show(); win.focus();
  await new Promise(r => wc.once('did-finish-load', r));
  await warte(2000);
  const js = c => wc.executeJavaScript(c, true);
  const foto = async n => { await warte(600); fs.writeFileSync(path.join(AUS, n + '.png'), (await wc.capturePage()).toPNG()); };
  const r = {};
  try {
    r.oeffnen = await js(`(async () => {
      const d = Bibliothek.dokumente().find(x => x.art === 'skript');
      if (!d) return { fehler: 'kein Skript in der Vorlage' };
      window.__id = d.id;
      location.hash = '#/dok/' + d.id;
      for (let i = 0; i < 60 && !document.querySelector('.dok-bereich:not([hidden]) [data-sl="leiste"]'); i++) await new Promise(ok => setTimeout(ok, 100));
      await new Promise(ok => setTimeout(ok, 1500));
      window.__q = s => document.querySelector('.dok-bereich:not([hidden]) ' + s) || document.querySelector('#dok-leiste ' + s);
      const k = __q('[data-sl="leiste"]');
      const kr = k && k.getBoundingClientRect(), lr = document.querySelector('#dok-leiste .dok-leiste').getBoundingClientRect();
      k.click(); await new Promise(ok => setTimeout(ok, 300));
      const reiter = [...document.querySelectorAll('.seitenleiste:not([hidden]) [data-reiter]')].map(b => b.dataset.reiter);
      const lz = __q('[data-reiter="lesezeichen"]').getBoundingClientRect(), su = __q('[data-reiter="suche"]').getBoundingClientRect();
      k.click(); await new Promise(ok => setTimeout(ok, 300));
      return { name: d.name, seiten: Dokument.leinwand().seiten().length, knopfLinks: kr ? Math.round(kr.left - lr.left) : null, knoepfeInLeiste: document.querySelectorAll('#dok-leiste .leiste-anfang button').length, reiter, sucheRechtsVomLesezeichen: Math.round(su.left - lz.right) };
    })()`);
    if (r.oeffnen.fehler) throw new Error(r.oeffnen.fehler);

    // Seiten: Vorschaubilder
    r.seiten = await js(`(async () => {
      __q('[data-sl="leiste"]').click();
      await new Promise(ok => setTimeout(ok, 300));
      __q('[data-reiter="seiten"]').click();
      await new Promise(ok => setTimeout(ok, 2500));
      const bilder = [...document.querySelectorAll('.seitenleiste:not([hidden]) .sl-seite canvas')];
      const flaeche = __q('.dok-flaeche').getBoundingClientRect(), leiste = document.querySelector('.seitenleiste:not([hidden])').getBoundingClientRect();
      return { anzahl: bilder.length, gemalt: bilder.filter(c => c.width > 0).length, aktuell: (document.querySelector('.sl-seite.aktuell') || {}).dataset?.nr, flaecheDaneben: Math.round(flaeche.left - leiste.right) };
    })()`);
    await foto('01-seiten');
    r.seiteKlick = await js(`(async () => {
      document.querySelector('.sl-seite[data-nr="7"]').click();
      await new Promise(ok => setTimeout(ok, 1200));
      return { aktuelleSeite: Dokument.leinwand().aktuelleSeite() + 1, markiert: document.querySelector('.sl-seite.aktuell').dataset.nr };
    })()`);

    // Inhalt: Abschnitte
    r.inhalt = await js(`(async () => {
      __q('[data-reiter="inhalt"]').click();
      for (let i = 0; i < 50 && !document.querySelector('.sl-abschnitt'); i++) await new Promise(ok => setTimeout(ok, 100));
      const a = [...document.querySelectorAll('.sl-abschnitt')];
      const titel = document.querySelector('.seitenleiste:not([hidden]) [data-sl="titel"]').textContent;
      const ziel = a.find(x => /Skalarprodukt/.test(x.textContent)) || a[Math.floor(a.length / 2)];
      const zielText = ziel ? ziel.querySelector('.sl-abschnitt-titel').textContent : null, zielSeite = ziel ? Number(ziel.dataset.nr) : null;
      if (ziel) ziel.click();
      await new Promise(ok => setTimeout(ok, 1200));
      return { titel, anzahl: a.length, erste: a.slice(0, 4).map(x => x.textContent.replace(/\\s+/g, ' ').trim()), ziel: zielText, zielSeite, jetzt: Dokument.leinwand().aktuelleSeite() + 1, aktuellMarkiert: (document.querySelector('.sl-abschnitt.aktuell') || {}).textContent?.replace(/\\s+/g, ' ').trim() };
    })()`);
    await foto('02-inhalt');

    // Lesezeichen über das Menü ⋯
    r.lesezeichen = await js(`(async () => {
      const seite = Dokument.leinwand().aktuelleSeite() + 1;
      __q('[data-el="mehr"]').click();
      await new Promise(ok => setTimeout(ok, 200));
      const k = [...document.querySelectorAll('.kontext button')].find(b => b.dataset.a === 'lesezeichen');
      const text = k && k.textContent;
      k.click();
      await new Promise(ok => setTimeout(ok, 400));
      __q('[data-reiter="lesezeichen"]').click();
      await new Promise(ok => setTimeout(ok, 1500));
      return { seite, menue: text, gespeichert: Bibliothek.get(__id).lesezeichen, karten: document.querySelectorAll('.seitenleiste:not([hidden]) .sl-seite').length, band: !!document.querySelector('.seitenleiste:not([hidden]) .sl-band') };
    })()`);
    await foto('03-lesezeichen');
    // Datei: steht das Lesezeichen in der Beschreibung des Skripts?
    await warte(1500);
    const metas = [];
    (function such(d) { for (const f of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, f.name); if (f.isDirectory()) such(p); else if (f.name === 'Handschrift.lernheft.json') metas.push(p); } })(path.join(WURZEL, 'Bibliothek'));
    r.lesezeichenDatei = metas.map(p => JSON.parse(fs.readFileSync(p, 'utf8'))).filter(m => m.art === 'skript').map(m => m.eigenschaften.lesezeichen || null);

    // Suche
    r.suche = await js(`(async () => {
      const ev = new KeyboardEvent('keydown', { key: 'f', ctrlKey: true, bubbles: true, cancelable: true });
      document.body.dispatchEvent(ev);
      await new Promise(ok => setTimeout(ok, 300));
      const feld = document.querySelector('.seitenleiste:not([hidden]) .sl-suche input');
      const offenNachStrgF = !!feld && !feld.closest('.sl-suche').hidden && document.activeElement === feld && __q('[data-reiter="suche"]').getAttribute('aria-selected') === 'true';
      const t0 = performance.now();
      feld.value = ${JSON.stringify(WORT)};
      feld.dispatchEvent(new Event('input', { bubbles: true }));
      for (let i = 0; i < 100; i++) { await new Promise(ok => setTimeout(ok, 100)); const a = document.querySelector('[data-sl="anzahl"]').textContent; if (a && !a.includes('+') && !a.includes('Suche')) break; }
      const ms = Math.round(performance.now() - t0);
      const anzahl = document.querySelector('[data-sl="anzahl"]').textContent;
      const erste = [...document.querySelectorAll('.sl-treffer')].slice(0, 3).map(x => x.textContent);
      const kopf = [...document.querySelectorAll('.sl-gruppe-kopf')].slice(0, 3).map(x => x.textContent);
      const t = document.querySelectorAll('.sl-treffer')[1] || document.querySelector('.sl-treffer');
      if (t) t.click();
      await new Promise(ok => setTimeout(ok, 1200));
      return { offenNachStrgF, ms, anzahl, erste, kopf, nachKlick: Dokument.leinwand().aktuelleSeite() + 1, gruppe: t && t.closest('.sl-gruppe').querySelector('.sl-gruppe-kopf').textContent };
    })()`);
    await foto('04-suche');
    r.weiter = await js(`(async () => {
      const feld = document.querySelector('.seitenleiste:not([hidden]) .sl-suche input');
      feld.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      await new Promise(ok => setTimeout(ok, 900));
      const a = document.querySelector('[data-sl="anzahl"]').textContent;
      const ohne = 'xyzqwvk';
      feld.value = ohne; feld.dispatchEvent(new Event('input', { bubbles: true }));
      for (let i = 0; i < 80; i++) { await new Promise(ok => setTimeout(ok, 100)); if (document.querySelector('[data-sl="anzahl"]').textContent === 'Keine Treffer') break; }
      const keine = document.querySelector('[data-sl="anzahl"]').textContent;
      feld.value = ${JSON.stringify(WORT)}; feld.dispatchEvent(new Event('input', { bubbles: true }));
      await new Promise(ok => setTimeout(ok, 1500));
      feld.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      await new Promise(ok => setTimeout(ok, 300));
      return { nachEnter: a, keine, zuNachEsc: document.querySelector('.seitenleiste:not([hidden])') === null };
    })()`);

    // Bändchen auf dem Blatt: zur Seite mit Lesezeichen springen, Ausschnitt fotografieren
    await js(`(async () => { const nr = Bibliothek.get(__id).lesezeichen[0]; Dokument.leinwand().springeZuSeite(nr - 1); await new Promise(ok => setTimeout(ok, 1500)); })()`);
    await foto('05-baendchen');

    // Schmaler Bildschirm: Leiste liegt über dem Blatt
    win.setSize(680, 900);
    await warte(800);
    r.schmal = await js(`(async () => {
      __q('[data-sl="leiste"]').click();
      await new Promise(ok => setTimeout(ok, 1200));
      const l = document.querySelector('.seitenleiste:not([hidden])');
      return { offen: !!l, breite: l && Math.round(l.getBoundingClientRect().width), flaecheLinks: Math.round(__q('.dok-flaeche').getBoundingClientRect().left) };
    })()`);
    await foto('06-schmal');
  } catch (e) {
    r.fehler = String(e && e.stack || e);
  }
  r.log = log;
  fs.writeFileSync(path.join(AUS, 'seitenleiste.json'), JSON.stringify(r, null, 2));
  app.exit(0);
});
