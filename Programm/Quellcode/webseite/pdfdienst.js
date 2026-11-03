'use strict';
// PDFs lesen (pdf.js), Seiten umfärben und als PDF exportieren (pdf-lib), mit allen Notizen darauf
(function () {
  // In der Lernheft-App und der Web-App fürs iPad (ipad/baue.js web) offline aus dem eigenen Ordner, sonst vom CDN
  const LOKAL = /^(127\.0\.0\.1|localhost)$/.test(location.hostname) || !!window.LHWebApp;
  const PDFJS = LOKAL ? 'vendor/' : 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/';
  const PDFLIB = LOKAL ? 'vendor/pdf-lib.min.js' : 'https://cdnjs.cloudflare.com/ajax/libs/pdf-lib/1.17.1/pdf-lib.min.js';
  const EINHEIT = 96 / 72;   // Leinwand-Einheiten pro PDF-Punkt

  function ladeSkript(src, pruefe) {
    return new Promise((ok, fehler) => {
      if (pruefe()) return ok(pruefe());
      const s = document.createElement('script');
      s.src = src;
      s.onload = () => ok(pruefe());
      s.onerror = () => { s.remove(); fehler(new Error('Die PDF-Werkzeuge konnten nicht geladen werden. Beim ersten Mal braucht es Internet.')); };
      document.head.appendChild(s);
    });
  }
  let pdfjsVersprechen = null, pdflibVersprechen = null;
  function ladePdfJs() {
    if (!pdfjsVersprechen) {
      pdfjsVersprechen = ladeSkript(PDFJS + 'pdf.min.js', () => window.pdfjsLib).then(lib => {
        lib.GlobalWorkerOptions.workerSrc = PDFJS + 'pdf.worker.min.js';
        // Sicherheitslücke CVE-2024-4367 (pdf.js bis 4.1): eine bösartige PDF kann über die FontMatrix
        // einer Schrift JavaScript ausführen. Abhilfe ohne Versionswechsel: isEvalSupported: false.
        // Damit kein Aufruf es vergisst, bekommt jeder getDocument die Option erzwungen.
        // Ein gemeinsamer Worker für alle PDFs: sonst startet jedes Dokument (auch das zweite beim Teilen) einen eigenen
        // und lädt dafür das 1 MB grosse Skript neu (auf dem iPad einige hundert Millisekunden)
        let gemeinsam = null;
        const worker = () => {
          if (!gemeinsam || gemeinsam.destroyed) { try { gemeinsam = new lib.PDFWorker(); } catch (e) { gemeinsam = null; } }
          return gemeinsam;
        };
        return Object.create(lib, { getDocument: { value: quelle => { const o = sichereOptionen(quelle); if (!o.worker && worker()) o.worker = gemeinsam; return lib.getDocument(o); } } });
      }).catch(e => { pdfjsVersprechen = null; throw e; });
    }
    return pdfjsVersprechen;
  }
  function sichereOptionen(quelle) {
    const o = typeof quelle === 'string' || quelle instanceof URL ? { url: quelle }
      : ArrayBuffer.isView(quelle) || quelle instanceof ArrayBuffer ? { data: quelle }
      : { ...quelle };
    o.isEvalSupported = false;
    return o;
  }
  // PDF öffnen (Bytes als Uint8Array), immer über diese Funktion
  async function oeffnePdf(bytes) {
    return (await ladePdfJs()).getDocument({ data: bytes }).promise;
  }
  function ladePdfLib() {
    if (!pdflibVersprechen) pdflibVersprechen = ladeSkript(PDFLIB, () => window.PDFLib).catch(e => { pdflibVersprechen = null; throw e; });
    return pdflibVersprechen;
  }

  // Mittlere Helligkeit einer gerenderten Seite, 0 = schwarz, 1 = weiss
  function helligkeit(quelle) {
    const k = document.createElement('canvas');
    k.width = k.height = 24;
    const c = k.getContext('2d', { willReadFrequently: true });
    c.fillStyle = '#fff';
    c.fillRect(0, 0, 24, 24);
    c.drawImage(quelle, 0, 0, 24, 24);
    const d = c.getImageData(0, 0, 24, 24).data;
    let s = 0;
    for (let i = 0; i < d.length; i += 4) s += 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
    return s / (d.length / 4) / 255;
  }

  // Umfärben: "dunkel" macht aus Weiss das Dunkelblau des Lernhefts, "hell" dreht dunkle Seiten ins Helle.
  // Farben bleiben dabei erkennbar (umkehren und Farbton um 180° drehen).
  const HR = [[-0.574, 1.430, 0.144], [0.426, 0.430, 0.144], [0.426, 1.430, -0.856]];
  function umfaerben(canvas, ziel) {
    const c = canvas.getContext('2d', { willReadFrequently: true });
    const bild = c.getImageData(0, 0, canvas.width, canvas.height);
    const d = bild.data;
    const dunkel = ziel === 'dunkel' || ziel === 'dunkelgrau';
    const bg = ziel === 'dunkelgrau' ? [43, 45, 49] : dunkel ? [23, 33, 57] : [255, 255, 255];
    const fg = ziel === 'dunkelgrau' ? [232, 233, 236] : dunkel ? [236, 240, 248] : [20, 24, 34];
    for (let i = 0; i < d.length; i += 4) {
      const r = 255 - d[i], g = 255 - d[i + 1], b = 255 - d[i + 2];
      let nr = HR[0][0] * r + HR[0][1] * g + HR[0][2] * b;
      let ng = HR[1][0] * r + HR[1][1] * g + HR[1][2] * b;
      let nb = HR[2][0] * r + HR[2][1] * g + HR[2][2] * b;
      nr = nr < 0 ? 0 : nr > 255 ? 255 : nr;
      ng = ng < 0 ? 0 : ng > 255 ? 255 : ng;
      nb = nb < 0 ? 0 : nb > 255 ? 255 : nb;
      d[i] = bg[0] + nr * (fg[0] - bg[0]) / 255;
      d[i + 1] = bg[1] + ng * (fg[1] - bg[1]) / 255;
      d[i + 2] = bg[2] + nb * (fg[2] - bg[2]) / 255;
    }
    c.putImageData(bild, 0, 0);
  }
  // Muss eine Seite mit dieser Helligkeit für den Modus umgefärbt werden?
  const umfaerbenNoetig = (modus, hell) => (modus === 'dunkel' || modus === 'dunkelgrau' ? hell > 0.5 : modus === 'hell' ? hell <= 0.5 : false);

  async function vorschauErstellen(pdf) {
    const seite = await pdf.getPage(1);
    const v1 = seite.getViewport({ scale: 1 });
    const vp = seite.getViewport({ scale: 320 / v1.width });
    const c = document.createElement('canvas');
    c.width = Math.round(vp.width);
    c.height = Math.round(vp.height);
    await seite.render({ canvasContext: c.getContext('2d'), viewport: vp }).promise;
    return { bild: c.toDataURL('image/jpeg', 0.75), hell: Math.round(helligkeit(c) * 100) / 100 };
  }

  /* ---------- Export ---------- */

  function hexZuRgb(lib, hex) {
    const n = parseInt(hex.slice(1), 16);
    return lib.rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
  }

  // Nur Zeichen, die die Standardschrift kennt; der Rest wird ersetzt
  function sichererText(font, text) {
    let r = '';
    for (const ch of String(text || '')) {
      if (ch === '\n') { r += ch; continue; }
      try { font.widthOfTextAtSize(ch, 10); r += ch; } catch (e) { r += '?'; }
    }
    return r;
  }

  // Bilder einer Seite ins PDF einbetten, jedes nur einmal (bilder: src -> eingebettetes Bild, über alle Seiten)
  async function betteBilderEin(doc, liste, bilder) {
    for (const e of liste) {
      if (!Leinwand.istBild(e) || bilder.has(e.src)) continue;
      try {
        const m = /^data:image\/(png|jpe?g);base64,(.*)$/i.exec(e.src || '');
        if (!m) throw new Error('Bildformat');
        const roh = atob(m[2]), bytes = new Uint8Array(roh.length);
        for (let i = 0; i < roh.length; i++) bytes[i] = roh.charCodeAt(i);
        bilder.set(e.src, m[1].toLowerCase() === 'png' ? await doc.embedPng(bytes) : await doc.embedJpg(bytes));
      } catch (err) { bilder.set(e.src, null); }
    }
    return bilder;
  }

  // Zeichnet die Elemente einer Seite. punkt(x, y) rechnet Leinwand-Einheiten in PDF-Punkte um.
  // bilder: eingebettete Bilder (betteBilderEin); sie liegen wie auf dem Bildschirm unter der Schrift.
  function zeichneElemente(lib, page, font, liste, seite, flSeite, punkt, massstab, bilder) {
    const liniekappe = lib.LineCapStyle ? lib.LineCapStyle.Round : undefined;
    const pfad = pts => pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(2)} ${(-y).toFixed(2)}`).join(' ');
    const KOPF = Leinwand.NOTIZ_KOPF;
    for (const e of liste) {
      const bild = Leinwand.istBild(e) && bilder && bilder.get(e.src);
      if (!bild) continue;
      // Ecke unten links und die Richtung der Bildkante auf der Seite (berücksichtigt gedrehte PDF-Seiten)
      const p0 = punkt(e.x, e.y + e.h), p1 = punkt(e.x + 10, e.y + e.h);
      const winkel = Math.atan2(p1[1] - p0[1], p1[0] - p0[0]) * 180 / Math.PI;
      page.drawImage(bild, { x: p0[0], y: p0[1], width: e.b * massstab, height: e.h * massstab, rotate: lib.degrees(winkel) });
    }
    for (const e of liste) {
      if (Leinwand.istBild(e)) continue;
      if (Leinwand.istText(e)) {
        // Zeilen genau wie auf dem Bildschirm umgebrochen (Leinwand.textLayout), in der Schrift des PDFs
        const gr = e.gr || 24, zh = gr * 1.3;
        const farbe = hexZuRgb(lib, Leinwand.farbeVon(e, Leinwand.flaecheFuer(e, seite, liste, flSeite, 'hell')));
        const p0 = punkt(e.x, e.y), p1 = punkt(e.x + 10, e.y);
        const winkel = Math.atan2(p1[1] - p0[1], p1[0] - p0[0]) * 180 / Math.PI;
        Leinwand.textLayout(e).zeilen.forEach((z, i) => {
          if (!z) return;
          // Grundlinie: Mitte der Zeile plus etwa ein Drittel der Schriftgrösse
          const [px, py] = punkt(e.x, e.y + zh * (i + 0.5) + gr * 0.33);
          page.drawText(sichererText(font, z), { x: px, y: py, size: gr * massstab, font, color: farbe, rotate: lib.degrees(winkel) });
        });
        continue;
      }
      if (e.typ === 'notiz') {
        const g = Leinwand.sicht(e);
        const rechteck = (y0, h) => pfad([[e.x, y0], [e.x + g.b, y0], [e.x + g.b, y0 + h], [e.x, y0 + h]].map(([x, y]) => punkt(x, y))) + ' Z';
        page.drawSvgPath(rechteck(e.y, g.h), { x: 0, y: 0, color: hexZuRgb(lib, Leinwand.NOTIZFARBEN[e.f] || Leinwand.NOTIZFARBEN.gelb) });
        // Zugeklappt: nur das kleine Quadrat
        if (e.zu) continue;
        page.drawSvgPath(rechteck(e.y, KOPF), { x: 0, y: 0, color: lib.rgb(0, 0, 0), opacity: 0.07 });
        // Richtung der Textzeile auf der Seite (berücksichtigt gedrehte PDF-Seiten)
        const p0 = punkt(e.x, e.y), p1 = punkt(e.x + 10, e.y);
        const winkel = Math.atan2(p1[1] - p0[1], p1[0] - p0[0]) * 180 / Math.PI;
        if (e.t) {
          const gr = (e.gr || 18) * massstab;
          const pad = (e.gr || 18) * 0.7;
          const maxB = (e.b - 2 * pad) * massstab;
          const text = sichererText(font, e.t);
          const zeilenListe = [];
          for (const absatz of text.split('\n')) {
            let z = '';
            for (const w of absatz.split(/(\s+)/)) {
              if (font.widthOfTextAtSize(z + w, gr) > maxB && z.trim()) { zeilenListe.push(z.trimEnd()); z = w.trimStart(); } else z += w;
            }
            zeilenListe.push(z);
          }
          const zh = (e.gr || 18) * 1.3;
          zeilenListe.forEach((z, i) => {
            const y = e.y + KOPF + (e.gr || 18) * 0.3 + (i + 1) * zh - zh * 0.25;
            if (y > e.y + e.h - 4) return;
            const [px, py] = punkt(e.x + pad, y);
            page.drawText(z, { x: px, y: py, size: gr, font, color: lib.rgb(0.106, 0.133, 0.196), rotate: lib.degrees(winkel) });
          });
        }
        // Zeichnung auf der Notiz, in Koordinaten der Notiz
        if (e.e && e.e.length) zeichneElemente(lib, page, font, e.e, { b: e.b, h: e.h }, 'hell', (x, y) => punkt(e.x + x, e.y + y), massstab);
        continue;
      }
      if (!e.p || !e.p.length) continue;
      const farbe = hexZuRgb(lib, Leinwand.farbeVon(e, Leinwand.flaecheFuer(e, seite, liste, flSeite, 'hell')));
      const pts = e.p.map(([x, y]) => punkt(x, y));
      if (e.w === 'marker') {
        page.drawSvgPath(pfad(pts.length === 1 ? [pts[0], [pts[0][0] + 0.1, pts[0][1]]] : pts), { x: 0, y: 0, borderColor: farbe, borderWidth: Leinwand.breite(e, 0.5) * massstab, borderOpacity: 0.35, borderLineCap: liniekappe });
        continue;
      }
      if (pts.length === 1) {
        page.drawCircle({ x: pts[0][0], y: pts[0][1], size: Leinwand.breite(e, e.p[0][2]) * massstab / 2, color: farbe });
        continue;
      }
      // Abschnitte mit ähnlicher Breite zu einem Pfad zusammenfassen
      let lauf = [pts[0]], b0 = null;
      const fertig = () => { if (lauf.length > 1) page.drawSvgPath(pfad(lauf), { x: 0, y: 0, borderColor: farbe, borderWidth: b0, borderLineCap: liniekappe }); };
      for (let i = 1; i < pts.length; i++) {
        const bi = Math.round(Leinwand.breite(e, (e.p[i - 1][2] + e.p[i][2]) / 2) * massstab * 4) / 4;
        if (b0 !== null && bi !== b0) { fertig(); lauf = [pts[i - 1]]; }
        b0 = bi;
        lauf.push(pts[i]);
      }
      fertig();
    }
  }

  function grenzenAller(liste) {
    let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
    for (const e of liste) {
      const g = Leinwand.grenzen(e);
      x1 = Math.min(x1, g.x1); y1 = Math.min(y1, g.y1); x2 = Math.max(x2, g.x2); y2 = Math.max(y2, g.y2);
    }
    return x1 === Infinity ? null : { x1, y1, x2, y2 };
  }

  // Skript mit Notizen: Original-PDF, darauf die Striche als Vektoren. Notizen neben der Seite vergrössern die Seite.
  // opt.nurBlatt: nur was auf den Seiten steht; die Seiten behalten ihre Grösse, was über den Rand ragt, wird abgeschnitten.
  async function exportiereSkript(id, fortschritt, opt = {}) {
    const item = Daten.get('bib:' + id);
    const [lib] = await Promise.all([ladePdfLib(), ladePdfJs()]);
    const blob = await Daten.datei.get('pdf:' + item.datei);
    if (!blob) throw new Error('Die PDF ist auf diesem Gerät nicht vorhanden und konnte nicht aus der Cloud geladen werden.');
    const bytes = new Uint8Array(await blob.arrayBuffer());
    const doc = await lib.PDFDocument.load(bytes, { ignoreEncryption: true });
    const font = await doc.embedFont(lib.StandardFonts.Helvetica);
    const bilder = new Map();
    const js = await oeffnePdf(bytes.slice());
    const pages = doc.getPages();
    for (let i = 0; i < pages.length; i++) {
      if (fortschritt) fortschritt(i + 1, pages.length);
      // Im Lernheft gedrehte Seite: im PDF genauso gedreht (auch ohne Notizen darauf)
      const extra = Leinwand.drehungVon(item, 'p' + (i + 1));
      if (extra) pages[i].setRotation(lib.degrees((((pages[i].getRotation().angle || 0) + extra) % 360 + 360) % 360));
      const inhalt = Daten.get('ink:' + id + ':p' + (i + 1));
      let liste = inhalt && inhalt.e ? inhalt.e : [];
      if (!liste.length) continue;
      const jsSeite = await js.getPage(i + 1);
      const vp = Leinwand.pdfAnsicht(jsSeite, EINHEIT, item, i + 1);
      const seite = { b: vp.width, h: vp.height };
      if (opt.nurBlatt) {
        liste = liste.filter(e => { const g = Leinwand.grenzen(e); return g.x2 > 0 && g.y2 > 0 && g.x1 < seite.b && g.y1 < seite.h; });
        if (!liste.length) continue;
      }
      // Helligkeit der Seite bestimmen, damit Schwarz/Weiss passend gewählt wird
      const klein = jsSeite.getViewport({ scale: 48 / jsSeite.getViewport({ scale: 1 }).width });
      const c = document.createElement('canvas');
      c.width = Math.max(1, Math.round(klein.width)); c.height = Math.max(1, Math.round(klein.height));
      await jsSeite.render({ canvasContext: c.getContext('2d'), viewport: klein }).promise;
      const flSeite = helligkeit(c) > 0.5 ? 'hell' : 'dunkel';
      const punkt = (x, y) => vp.convertToPdfPoint(x, y);
      const page = pages[i];
      // Seite so erweitern, dass Notizen am Rand mit drauf sind
      const g = grenzenAller(liste);
      if (g && !opt.nurBlatt && (g.x1 < 0 || g.y1 < 0 || g.x2 > seite.b || g.y2 > seite.h)) {
        const ecken = [[Math.min(0, g.x1 - 16), Math.min(0, g.y1 - 16)], [Math.max(seite.b, g.x2 + 16), Math.max(seite.h, g.y2 + 16)]].map(([x, y]) => punkt(x, y));
        const [ax, ay] = ecken[0], [bx, by] = ecken[1];
        const box = [Math.min(ax, bx), Math.min(ay, by), Math.abs(bx - ax), Math.abs(by - ay)];
        page.setMediaBox(...box);
        page.setCropBox(...box);
      }
      zeichneElemente(lib, page, font, liste, seite, flSeite, punkt, 1 / EINHEIT, await betteBilderEin(doc, liste, bilder));
    }
    js.destroy();
    return new Blob([await doc.save()], { type: 'application/pdf' });
  }

  // Whiteboard als PDF: eine einzige Seite, gross genug für alles Geschriebene
  async function exportiereBrett(id, variante) {
    const item = Daten.get('bib:' + id);
    const lib = await ladePdfLib();
    const doc = await lib.PDFDocument.create();
    doc.setTitle(item.name);
    const font = await doc.embedFont(lib.StandardFonts.Helvetica);
    const fl = variante === 'dunkel' ? 'dunkel' : 'hell';
    const sid = (item.seiten || [])[0];
    const inhalt = Daten.get('ink:' + id + ':' + sid);
    const liste = inhalt && inhalt.e ? inhalt.e : [];
    const g = grenzenAller(liste) || { x1: 0, y1: 0, x2: 794, y2: 560 };
    const x1 = g.x1 - 32, y1 = g.y1 - 32, w = Math.max(200, g.x2 - g.x1 + 64), h = Math.max(140, g.y2 - g.y1 + 64);
    // PDF-Seiten dürfen höchstens 14400 Punkte messen
    const m = Math.min(1 / EINHEIT, 14000 / Math.max(w, h));
    const page = doc.addPage([w * m, h * m]);
    page.drawRectangle({ x: 0, y: 0, width: w * m, height: h * m, color: hexZuRgb(lib, Leinwand.PAPIER[fl]) });
    const punkt = (x, y) => [(x - x1) * m, h * m - (y - y1) * m];
    // Raster nur, solange es nicht tausende Linien werden
    const art = item.raster || 'punkte';
    const mm = Leinwand.MM, schritt = (art === 'linien' ? 8 : 5) * mm;
    const farbe = fl === 'dunkel' ? lib.rgb(0.32, 0.39, 0.53) : lib.rgb(0.80, 0.85, 0.91);
    if (art !== 'blanko' && (w / schritt) * (h / schritt) < 40000 && (art === 'punkte' || (w + h) / schritt < 3000)) {
      const xa = Math.ceil(x1 / schritt) * schritt, ya = Math.ceil(y1 / schritt) * schritt;
      if (art === 'punkte') {
        for (let y = ya; y < y1 + h; y += schritt) for (let x = xa; x < x1 + w; x += schritt) { const [px, py] = punkt(x, y); page.drawCircle({ x: px, y: py, size: 0.55, color: farbe }); }
      } else {
        if (art === 'karo') for (let x = xa; x < x1 + w; x += schritt) { const a = punkt(x, y1), b = punkt(x, y1 + h); page.drawLine({ start: { x: a[0], y: a[1] }, end: { x: b[0], y: b[1] }, thickness: 0.4, color: farbe }); }
        for (let y = ya; y < y1 + h; y += schritt) { const a = punkt(x1, y), b = punkt(x1 + w, y); page.drawLine({ start: { x: a[0], y: a[1] }, end: { x: b[0], y: b[1] }, thickness: 0.4, color: farbe }); }
      }
    }
    zeichneElemente(lib, page, font, liste, { b: w, h, unendlich: true }, fl, punkt, m, await betteBilderEin(doc, liste, new Map()));
    return new Blob([await doc.save()], { type: 'application/pdf' });
  }

  // PNG-Bilder: Skript und Notizbuch je Seite (opt.seite = Nummer ab 0, sonst alle), Whiteboard als ein Bild.
  // Gibt [{ name, blob }] zurück, der Name ohne Endung.
  async function exportierePng(id, opt = {}) {
    const item = Daten.get('bib:' + id);
    const nachBlob = cv => new Promise((ok, fehler) => cv.toBlob(b => (b ? ok(b) : fehler(new Error('Das Bild konnte nicht erzeugt werden.'))), 'image/png'));
    const vereinige = (seite, liste) => {
      const g = grenzenAller(liste);
      const a = { x1: 0, y1: 0, x2: seite.b, y2: seite.h };
      if (g) { a.x1 = Math.min(0, g.x1 - 16); a.y1 = Math.min(0, g.y1 - 16); a.x2 = Math.max(seite.b, g.x2 + 16); a.y2 = Math.max(seite.h, g.y2 + 16); }
      return a;
    };
    const ergebnis = [];
    if (item.papier === 'whiteboard') {
      const inhalt = Daten.get('ink:' + id + ':' + (item.seiten || [])[0]);
      const liste = inhalt && inhalt.e ? inhalt.e : [];
      const g = grenzenAller(liste) || { x1: 0, y1: 0, x2: 794, y2: 560 };
      const cv = document.createElement('canvas');
      await Leinwand.bilderBereit(liste);
      Leinwand.malBild(cv, {
        seite: { b: 794, h: 1123, unendlich: true, raster: item.raster || 'punkte', papierFarbe: Leinwand.seitenfarbe(item.seitenfarbe).farbe }, liste, flaeche: Leinwand.seitenfarbe(item.seitenfarbe).flaeche || 'hell',
        ausschnitt: { x1: g.x1 - 32, y1: g.y1 - 32, x2: g.x2 + 32, y2: g.y2 + 32 }, massstab: 2
      });
      ergebnis.push({ name: item.name, blob: await nachBlob(cv) });
      cv.width = 0;
      return ergebnis;
    }
    const istSkript = item.art === 'skript';
    const anzahl = istSkript ? Number(item.seiten) || 0 : (item.seiten || []).length;
    const nummern = opt.seite != null ? [opt.seite] : Array.from({ length: anzahl }, (_, i) => i);
    let js = null;
    if (istSkript) {
      const [, blob] = await Promise.all([ladePdfJs(), Daten.datei.get('pdf:' + item.datei)]);
      if (!blob) throw new Error('Die PDF ist auf diesem Gerät nicht vorhanden und konnte nicht aus der Cloud geladen werden.');
      js = await oeffnePdf(new Uint8Array(await blob.arrayBuffer()));
    }
    const F = Leinwand.FORMATE[item.format] || Leinwand.FORMATE.A4;
    const m = 2;
    try {
      for (let k = 0; k < nummern.length; k++) {
        const i = nummern[k];
        if (opt.fortschritt) opt.fortschritt(k + 1, nummern.length);
        const sid = istSkript ? 'p' + (i + 1) : (item.seiten || [])[i];
        if (!sid) continue;
        const inhalt = Daten.get('ink:' + id + ':' + sid);
        const liste = inhalt && inhalt.e ? inhalt.e : [];
        const cv = document.createElement('canvas');
        await Leinwand.bilderBereit(liste);
        let hintergrund = null;
        if (istSkript) {
          const seite = await js.getPage(i + 1);
          const vp1 = Leinwand.pdfAnsicht(seite, EINHEIT, item, i + 1);
          const vp = Leinwand.pdfAnsicht(seite, EINHEIT * m, item, i + 1);
          const quelle = document.createElement('canvas');
          quelle.width = Math.max(1, Math.floor(vp.width)); quelle.height = Math.max(1, Math.floor(vp.height));
          const qc = quelle.getContext('2d', { willReadFrequently: true });
          qc.fillStyle = '#fff';
          qc.fillRect(0, 0, quelle.width, quelle.height);
          await seite.render({ canvasContext: qc, viewport: vp }).promise;
          const hell = helligkeit(quelle), modus = item.modus || 'original';
          if (umfaerbenNoetig(modus, hell)) umfaerben(quelle, modus);
          const fl = modus === 'dunkel' || modus === 'dunkelgrau' ? 'dunkel' : modus === 'hell' ? 'hell' : hell > 0.5 ? 'hell' : 'dunkel';
          const sz = { b: vp1.width, h: vp1.height };
          Leinwand.malBild(cv, { seite: sz, liste, flaeche: fl, ausschnitt: vereinige(sz, liste), massstab: m, hintergrund: c => { c.drawImage(quelle, 0, 0, sz.b, sz.h); return true; } });
          quelle.width = 0;
        } else {
          const sf = Leinwand.seitenfarbe(item.seitenfarbe), f = Leinwand.seitenFormat(item, sid);
          const sz = { b: f.b, h: f.h, mm: f.mm, papier: item.papier, papierFarbe: sf.farbe };
          Leinwand.malBild(cv, { seite: sz, liste, flaeche: sf.flaeche || 'hell', ausschnitt: vereinige(sz, liste), massstab: m });
        }
        ergebnis.push({ name: anzahl > 1 ? `${item.name} ${i + 1}` : item.name, blob: await nachBlob(cv) });
        cv.width = 0;
      }
    } finally { if (js) js.destroy(); }
    return ergebnis;
  }

  // Notizbuch als PDF, hell zum Drucken oder dunkel wie am Bildschirm
  async function exportiereNotizbuch(id, variante) {
    const item = Daten.get('bib:' + id);
    if (item.papier === 'whiteboard') return exportiereBrett(id, variante);
    const lib = await ladePdfLib();
    const doc = await lib.PDFDocument.create();
    doc.setTitle(item.name);
    const font = await doc.embedFont(lib.StandardFonts.Helvetica);
    const bilder = new Map();
    const m = 1 / EINHEIT;
    const fl = variante === 'dunkel' ? 'dunkel' : 'hell';
    for (const sid of item.seiten || []) {
      // Jede Seite in ihrem Format (Querformat, gedreht)
      const F = Leinwand.seitenFormat(item, sid);
      const inhalt = Daten.get('ink:' + id + ':' + sid);
      const liste = inhalt && inhalt.e ? inhalt.e : [];
      const g = grenzenAller(liste) || { x1: 0, y1: 0, x2: F.b, y2: F.h };
      const x1 = Math.min(0, g.x1 - 16), y1 = Math.min(0, g.y1 - 16);
      const x2 = Math.max(F.b, g.x2 + 16), y2 = Math.max(F.h, g.y2 + 16);
      const B = (x2 - x1) * m, H = (y2 - y1) * m;
      const page = doc.addPage([B, H]);
      const punkt = (x, y) => [(x - x1) * m, H - (y - y1) * m];
      if (fl === 'dunkel' || x1 < 0 || y1 < 0 || x2 > F.b || y2 > F.h) {
        page.drawRectangle({ x: 0, y: 0, width: B, height: H, color: hexZuRgb(lib, fl === 'dunkel' ? '#0f1627' : '#f3f5f9') });
      }
      const [px, py] = punkt(0, F.h);
      page.drawRectangle({ x: px, y: py, width: F.b * m, height: F.h * m, color: hexZuRgb(lib, Leinwand.PAPIER[fl]) });
      zeichnePapier(lib, page, item.papier, F, fl, punkt);
      const seite = { b: F.b, h: F.h };
      zeichneElemente(lib, page, font, liste, seite, fl, punkt, m, await betteBilderEin(doc, liste, bilder));
    }
    return new Blob([await doc.save()], { type: 'application/pdf' });
  }

  function zeichnePapier(lib, page, papier, F, fl, punkt) {
    if (!papier || papier === 'blanko') return;
    const mm = F.b / F.mm;
    const farbe = fl === 'dunkel' ? lib.rgb(0.32, 0.39, 0.53) : lib.rgb(0.80, 0.85, 0.91);
    const linie = (x1, y1, x2, y2, c, dicke) => {
      const a = punkt(x1, y1), b = punkt(x2, y2);
      page.drawLine({ start: { x: a[0], y: a[1] }, end: { x: b[0], y: b[1] }, thickness: dicke || 0.4, color: c || farbe });
    };
    if (papier === 'karo' || papier === 'karofein') {
      // wie auf dem Bildschirm: die Kästchen gehen genau auf das Blatt auf
      const soll = (papier === 'karofein' ? 3 : 5) * mm;
      const nx = Math.max(1, Math.round(F.b / soll)), ny = Math.max(1, Math.round(F.h / soll));
      for (let i = 1; i < nx; i++) linie(i * F.b / nx, 0, i * F.b / nx, F.h);
      for (let j = 1; j < ny; j++) linie(0, j * F.h / ny, F.b, j * F.h / ny);
    } else if (papier === 'punkte') {
      const nx = Math.max(1, Math.round(F.b / (5 * mm))), ny = Math.max(1, Math.round(F.h / (5 * mm)));
      for (let j = 1; j < ny; j++) for (let i = 1; i < nx; i++) {
        const [px, py] = punkt(i * F.b / nx, j * F.h / ny);
        page.drawCircle({ x: px, y: py, size: 0.55, color: farbe });
      }
    } else if (papier === 'linien') {
      for (let y = 30 * mm; y < F.h - 10 * mm; y += 8 * mm) linie(0, y, F.b, y);
      linie(25 * mm, 0, 25 * mm, F.h, fl === 'dunkel' ? lib.rgb(0.75, 0.38, 0.36) : lib.rgb(0.93, 0.6, 0.58), 0.6);
    }
  }

  window.PdfDienst = { ladePdfJs, ladePdfLib, oeffnePdf, helligkeit, umfaerben, umfaerbenNoetig, vorschauErstellen, exportiereSkript, exportiereNotizbuch, exportierePng, EINHEIT };
})();
