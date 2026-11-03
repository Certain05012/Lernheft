'use strict';
// Prüflauf für den Papierkorb in der Bibliothek und für Reste beim Radieren und Löschen (kleine Rechtecke):
// - Liste, Dokument löschen (landet im Papierkorb), wiederherstellen, endgültig löschen (samt Sicherungen), Seite eines
//   Notizbuchs löschen und wiederherstellen, Papierkorb leeren, über die Oberfläche mit Rückfrage.
// - Radieren (Bereich und ganze Striche) und Löschen per Lasso: nach dem teilweisen Neumalen wird das Bild mit einem
//   vollständigen Neumalen verglichen; jeder abweichende Bildpunkt wäre ein sichtbarer Rest.
// Eigener Testordner, fasst die echten Daten nicht an.
// Aufruf: electron test/papierkorb.js <ausgabeordner> [vorlage mit Bibliothek und Daten] [skalierung, z. B. 1.5 wie Windows 150 %]
// Schreibt Fotos und papierkorb.json in den Ausgabeordner. Vorher Lernheft schliessen (Port 47823).
const { app, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');

const AUS = path.resolve(process.argv[2]);
const VORLAGE = process.argv[3] && process.argv[3] !== '-' ? path.resolve(process.argv[3]) : null;
const SKALA = Number(process.argv[4]) || 0;
if (SKALA) app.commandLine.appendSwitch('force-device-scale-factor', String(SKALA));
const WURZEL = path.join(AUS, 'Lernheft');
fs.rmSync(AUS, { recursive: true, force: true });
fs.mkdirSync(path.join(WURZEL, 'Programm'), { recursive: true });
if (VORLAGE) for (const t of ['Bibliothek', 'Daten']) if (fs.existsSync(path.join(VORLAGE, t))) fs.cpSync(path.join(VORLAGE, t), path.join(WURZEL, t), { recursive: true });
app.setPath('userData', path.join(AUS, 'profil'));
process.env.LERNHEFT_ORDNER = WURZEL;
process.env.LERNHEFT_SEITE = path.join(__dirname, '..', '..', 'webseite');
const warte = ms => new Promise(r => setTimeout(r, ms));
require('../main.js');

const PK = path.join(WURZEL, 'Daten', 'Papierkorb'), BIB = path.join(WURZEL, 'Bibliothek'), SICH = path.join(WURZEL, 'Daten', 'Sicherung-Seiten');
const liste = d => (fs.existsSync(d) ? fs.readdirSync(d) : []);

app.whenReady().then(async () => {
  let win;
  for (let i = 0; i < 100 && !win; i++) { win = BrowserWindow.getAllWindows()[0]; if (!win) await warte(100); }
  const wc = win.webContents;
  const log = [];
  wc.on('console-message', (e, l, m) => { if (l >= 2) log.push(m); });
  win.setSize(1400, 900);
  win.show(); win.focus();
  await new Promise(r => wc.once('did-finish-load', r));
  await warte(2000);
  const js = c => wc.executeJavaScript(c, true);
  const foto = async n => { await warte(500); fs.writeFileSync(path.join(AUS, n + '.png'), (await wc.capturePage()).toPNG()); };
  const r = {};
  try {
    // Hilfen: Rückfrage bestätigen, Stift nachbilden, Bild der Schreibfläche vergleichen
    await js(`(() => {
      window.__ja = async () => { for (let i = 0; i < 40; i++) { const k = document.querySelector('#dialog[open] button[type="submit"]'); if (k) { k.click(); return true; } await new Promise(ok => setTimeout(ok, 50)); } return false; };
      window.__bild = () => new Promise(ok => requestAnimationFrame(() => requestAnimationFrame(() => {
        const cv = document.querySelector('.dok-bereich:not([hidden]) .lw-canvas');
        ok(cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data);
      })));
      window.__mal = async (pts, art = 'pen') => {
        const cv = document.querySelector('.dok-bereich:not([hidden]) .lw-canvas');
        cv.setPointerCapture = () => {}; cv.releasePointerCapture = () => {}; cv.hasPointerCapture = () => true;
        const hr = cv.parentElement.getBoundingClientRect();
        const ev = (typ, x, y) => new PointerEvent(typ, { pointerId: 7, pointerType: art, isPrimary: true, clientX: hr.left + x, clientY: hr.top + y, pressure: typ === 'pointerup' ? 0 : 0.5, buttons: typ === 'pointerup' ? 0 : 1, button: 0, bubbles: true, cancelable: true });
        cv.dispatchEvent(ev('pointerdown', pts[0][0], pts[0][1]));
        for (const p of pts.slice(1)) { cv.dispatchEvent(ev('pointermove', p[0], p[1])); await new Promise(ok => setTimeout(ok, 8)); }
        const l = pts[pts.length - 1];
        cv.dispatchEvent(ev('pointerup', l[0], l[1]));
        await new Promise(ok => setTimeout(ok, 300));
      };
      // Reste: teilweise gemaltes Bild gegen vollständig neu gemaltes Bild
      window.__live = () => new Promise(ok => requestAnimationFrame(() => requestAnimationFrame(() => {
        const cv = document.querySelector('.dok-bereich:not([hidden]) .lw-live');
        const d = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data;
        let n = 0, x1 = 1e9, y1 = 1e9, x2 = -1, y2 = -1;
        for (let i = 3; i < d.length; i += 4) if (d[i] > 10) { n++; const p = (i - 3) / 4, x = p % cv.width, y = Math.floor(p / cv.width); x1 = Math.min(x1, x); y1 = Math.min(y1, y); x2 = Math.max(x2, x); y2 = Math.max(y2, y); }
        ok(n ? { punkte: n, bereich: [x1, y1, x2, y2] } : { punkte: 0 });
      })));
      window.__reste = async () => {
        const vorher = await __bild();
        Dokument.leinwand().plane();
        const nachher = await __bild();
        let n = 0, max = 0;
        for (let i = 0; i < vorher.length; i += 4) {
          const d = Math.abs(vorher[i] - nachher[i]) + Math.abs(vorher[i + 1] - nachher[i + 1]) + Math.abs(vorher[i + 2] - nachher[i + 2]) + Math.abs(vorher[i + 3] - nachher[i + 3]);
          if (d > 8) n++;
          if (d > max) max = d;
        }
        return { abweichendePunkte: n, groessteAbweichung: max };
      };
    })()`);

    /* ===== Reste beim Radieren und Löschen ===== */
    r.reste = await js(`(async () => {
      const d = Bibliothek.dokumente().find(x => x.art === 'skript') || Bibliothek.dokumente()[0];
      location.hash = '#/dok/' + d.id;
      for (let i = 0; i < 80 && !(Dokument.leinwand() && Dokument.leinwand().seiten().length); i++) await new Promise(ok => setTimeout(ok, 100));
      await new Promise(ok => setTimeout(ok, 2500));
      const lw = Dokument.leinwand();
      lw.springeZuSeite(0);
      await new Promise(ok => setTimeout(ok, 1200));
      const aus = { dokument: d.name, dpr: devicePixelRatio, zoom: lw.ansicht().s };
      lw.setzeWerkzeug('stift');
      // Ein paar Striche quer über die Seite
      for (let k = 0; k < 6; k++) {
        const pts = []; for (let i = 0; i <= 60; i++) pts.push([420 + i * 7, 260 + k * 38 + Math.sin(i / 5) * 12]);
        await __mal(pts);
      }
      await new Promise(ok => setTimeout(ok, 600));
      aus.nachSchreiben = await __reste();
      // Radierer, Bereich: Zickzack durch die Striche
      lw.setzeRadiermodus('bereich'); lw.setzeWerkzeug('radierer');
      let pts = []; for (let i = 0; i <= 50; i++) pts.push([450 + i * 7.3, 250 + (i % 2) * 210 + i * 0.37]);
      const st0 = lw.statistik();
      await __mal(pts);
      const st1 = lw.statistik();
      aus.bereichGemalt = st1.bereich - st0.bereich;
      aus.radierenBereich = await __reste();
      aus.liveNachRadierenBereich = await __live();
      // Radierer, ganze Striche
      for (let k = 0; k < 3; k++) { const p2 = []; for (let i = 0; i <= 40; i++) p2.push([420 + i * 9, 520 + k * 40 + Math.cos(i / 4) * 10]); lw.setzeWerkzeug('stift'); await __mal(p2); }
      await __reste();
      lw.setzeRadiermodus('strich'); lw.setzeWerkzeug('radierer');
      pts = []; for (let i = 0; i <= 30; i++) pts.push([600 + i * 3, 500 + i * 4]);
      await __mal(pts);
      aus.radierenStrich = await __reste();
      aus.liveNachRadierenStrich = await __live();
      // Lasso und Entf
      lw.setzeWerkzeug('stift');
      for (let k = 0; k < 2; k++) { const p3 = []; for (let i = 0; i <= 30; i++) p3.push([460 + i * 8, 700 + k * 30]); await __mal(p3); }
      await __reste();
      lw.setzeWerkzeug('lasso');
      pts = []; for (let i = 0; i <= 40; i++) { const t = i / 40 * Math.PI * 2; pts.push([580 + Math.cos(t) * 190, 715 + Math.sin(t) * 60]); }
      await __mal(pts);
      aus.liveMitAuswahl = await __live();
      aus.auswahl = lw.auswahl ? lw.auswahl().length : null;
      document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete', bubbles: true }));
      await new Promise(ok => setTimeout(ok, 400));
      aus.lassoLoeschen = await __reste();
      aus.liveNachLoeschen = await __live();
      aus.bildNachLoeschen = true;
      lw.setzeWerkzeug('stift');
      return aus;
    })()`);
    await foto('01-nach-radieren');

    /* ===== Papierkorb ===== */
    await js(`location.hash = '#/bibliothek'`);
    await warte(800);
    r.liste = await js(`(async () => {
      document.querySelector('[data-reiter="papierkorb"]').click();
      for (let i = 0; i < 40 && !document.querySelector('.pk-eintrag, .leer'); i++) await new Promise(ok => setTimeout(ok, 100));
      return { tab: !document.querySelector('[data-reiter="papierkorb"]').hidden, eintraege: [...document.querySelectorAll('.pk-eintrag')].map(e => e.querySelector('.pk-text').textContent.replace(/\\s+/g, ' ').trim()), knoepfeZurueck: document.querySelectorAll('[data-pk-zurueck]').length };
    })()`);
    await foto('02-papierkorb');

    // Ein Notizbuch mit zwei beschriebenen Seiten anlegen, Seite 2 löschen
    r.seite = await js(`(async () => {
      const id = UI.neueId(), s1 = UI.neueId(), s2 = UI.neueId();
      Bibliothek.speichere(id, { art: 'notizbuch', name: 'Test-Notizbuch', eltern: null, format: 'A4', papier: 'karo', farbe: 'blau', seiten: [s1, s2], erstellt: Date.now(), geoeffnet: 0, seite: 1, favorit: false });
      const strich = n => ({ e: [{ id: 'x' + n, w: 'stift', f: 'tinte', d: 3, m: Date.now(), p: [[100, 100 + n, 0.5], [300, 200 + n, 0.5]] }] });
      Daten.set('ink:' + id + ':' + s1, strich(1)); Daten.set('ink:' + id + ':' + s2, strich(2));
      Daten.flush && Daten.flush();
      await new Promise(ok => setTimeout(ok, 1500));
      Bibliothek.aendere(id, x => { x.seiten = [s1]; });
      Daten.flush && Daten.flush();
      await new Promise(ok => setTimeout(ok, 1500));
      window.__nb = { id, s1, s2 };
      return { id, s2 };
    })()`);
    await warte(500);
    r.seite.imPapierkorb = liste(PK).filter(n => n.includes('Seite ' + r.seite.s2));
    r.seite.zurueck = await js(`(async () => {
      Bibliothek.zeigeOrdner(null);
      for (let i = 0; i < 40; i++) { if ([...document.querySelectorAll('.pk-eintrag')].some(e => e.textContent.includes('eine Seite'))) break; await new Promise(ok => setTimeout(ok, 100)); }
      const li = [...document.querySelectorAll('.pk-eintrag')].find(e => e.textContent.includes('Test-Notizbuch'));
      if (!li) return { fehler: 'Seite nicht in der Liste' };
      li.querySelector('[data-pk-zurueck]').click();
      await new Promise(ok => setTimeout(ok, 2000));
      const it = Bibliothek.get(__nb.id);
      // Handschrift kommt seit 3.11 erst geladen in den Speicher
      if (Daten.lade) await Daten.lade(['ink:' + __nb.id + ':' + __nb.s2]);
      return { seiten: it.seiten.length, letzte: it.seiten[it.seiten.length - 1] === __nb.s2, strich: (Daten.get('ink:' + __nb.id + ':' + __nb.s2, { e: [] }).e || []).length, meldung: document.getElementById('toast').textContent };
    })()`);

    // Dokument löschen über die Bibliothek (mit Rückfrage), dann wiederherstellen, dann wieder löschen und endgültig löschen
    r.dok = await js(`(async () => {
      const id = __nb.id;
      Bibliothek.loescheDokument(id);
      await __ja();
      await new Promise(ok => setTimeout(ok, 1500));
      const weg = !Bibliothek.get(id);
      document.querySelector('[data-reiter="papierkorb"]').click();
      await new Promise(ok => setTimeout(ok, 800));
      let li = [...document.querySelectorAll('.pk-eintrag')].find(e => e.querySelector('strong').textContent === 'Test-Notizbuch');
      const inListe = !!li;
      li.querySelector('[data-pk-zurueck]').click();
      for (let i = 0; i < 40 && !Bibliothek.get(id); i++) await new Promise(ok => setTimeout(ok, 100));
      const zurueck = Bibliothek.get(id);
      if (Daten.lade) await Daten.lade(['ink:' + id + ':' + __nb.s1, 'ink:' + id + ':' + __nb.s2]);
      const ink = (Daten.get('ink:' + id + ':' + __nb.s1, { e: [] }).e || []).length + (Daten.get('ink:' + id + ':' + __nb.s2, { e: [] }).e || []).length;
      Bibliothek.loescheDokument(id);
      await __ja();
      await new Promise(ok => setTimeout(ok, 1500));
      document.querySelector('[data-reiter="papierkorb"]').click();
      await new Promise(ok => setTimeout(ok, 800));
      li = [...document.querySelectorAll('.pk-eintrag')].find(e => e.querySelector('strong').textContent === 'Test-Notizbuch');
      li.querySelector('[data-pk-loeschen]').click();
      const frage = await new Promise(async ok => { for (let i = 0; i < 40; i++) { const t = document.querySelector('#dialog[open] h2'); if (t) return ok(t.textContent + ' | ' + document.querySelector('#dialog[open] p').textContent); await new Promise(o => setTimeout(o, 50)); } ok(null); });
      await __ja();
      await new Promise(ok => setTimeout(ok, 1200));
      const nochDa = [...document.querySelectorAll('.pk-eintrag strong')].some(s => s.textContent === 'Test-Notizbuch');
      return { weg, inListe, wiederDa: !!zurueck && zurueck.seiten.length, ink, frage, nochDa, meldung: document.getElementById('toast').textContent };
    })()`);
    r.dok.ordnerImPapierkorb = liste(PK).filter(n => n.includes('Test-Notizbuch'));

    // Skript aus dem Papierkorb der Vorlage wiederherstellen und endgültig löschen (mit Sicherungen)
    r.skript = await js(`(async () => {
      document.querySelector('[data-reiter="papierkorb"]').click();
      await new Promise(ok => setTimeout(ok, 800));
      const li = [...document.querySelectorAll('.pk-eintrag')].find(e => e.textContent.includes('Skript ·'));
      if (!li) return { keins: true };
      const name = li.querySelector('strong').textContent;
      return { name, text: li.querySelector('.pk-text span').textContent };
    })()`);
    if (!r.skript.keins) {
      const vorher = liste(SICH).filter(n => n.includes(' - ' + r.skript.name + ' - '));
      r.skript.sicherungenVorher = vorher.length;
      r.skript.endgueltig = await js(`(async () => {
        const li = [...document.querySelectorAll('.pk-eintrag')].find(e => e.querySelector('strong').textContent === ${JSON.stringify(r.skript.name)});
        li.querySelector('[data-pk-loeschen]').click();
        await __ja();
        await new Promise(ok => setTimeout(ok, 1200));
        return document.getElementById('toast').textContent;
      })()`);
      r.skript.sicherungenNachher = liste(SICH).filter(n => n.includes(' - ' + r.skript.name + ' - ')).length;
      r.skript.andereSicherungen = liste(SICH).length;
      r.skript.ordner = liste(PK).filter(n => n.endsWith(' ' + r.skript.name)).length;
    }

    // Papierkorb leeren
    const nb2 = () => liste(SICH).filter(n => n.includes(' - Notizbuch 2. Oktober - ')).length;
    const nb2Vorher = nb2();
    r.leeren = await js(`(async () => {
      const n = document.querySelectorAll('.pk-eintrag').length;
      if (!document.querySelector('[data-pk-leeren]')) return { vorher: 0, schonLeer: true, leer: !!document.querySelector('#skripte-inhalt .leer') };
      document.querySelector('[data-pk-leeren]').click();
      const frage = await new Promise(async ok => { for (let i = 0; i < 40; i++) { const t = document.querySelector('#dialog[open] p'); if (t) return ok(t.textContent); await new Promise(o => setTimeout(o, 50)); } ok(null); });
      await __ja();
      await new Promise(ok => setTimeout(ok, 1500));
      return { vorher: n, frage, leer: !!document.querySelector('#skripte-inhalt .leer'), meldung: document.getElementById('toast').textContent };
    })()`);
    r.leeren.dateienImPapierkorb = liste(PK).length;
    r.leeren.sicherungenNotizbuch2 = { vorher: nb2Vorher, nachher: nb2() };
    r.leeren.bibliothekUnberuehrt = liste(BIB);
    await foto('03-leer');
  } catch (e) {
    r.fehler = String(e && e.stack || e);
  }
  r.log = log;
  fs.writeFileSync(path.join(AUS, 'papierkorb.json'), JSON.stringify(r, null, 2));
  app.exit(0);
});
